import type { Address, Resolution } from "./types";

export const VERSION = "0.1.0";
export const DEFAULT_BASE_URL = "https://api.locio.com.au";

/** What the API said when it refused.
 *
 *  The service writes a title and a detail meant for a person to read and act
 *  on. Collapsing that into "HTTP 403" throws away the only part of the
 *  answer that says what to do about it. */
export class LocioError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;

  constructor(status: number, title = "", detail = "") {
    const message = [title || `HTTP ${status}`, detail].filter(Boolean).join(": ");
    super(message);
    this.name = "LocioError";
    this.status = status;
    this.title = title;
    this.detail = detail;
  }
}

export interface ClientOptions {
  /**
   * A **public** key (`lc_pub_...`), which carries an origin allow list so a
   * copy lifted from your page does nothing anywhere else.
   *
   * Never a secret key. This package runs in a browser, and a secret key in a
   * browser can be read by anyone who opens the page.
   */
  publicKey: string;
  /** Point somewhere else: a proxy of your own, or a test server. */
  baseUrl?: string;
  /** Your own fetch, for a custom transport or for testing. */
  fetch?: typeof globalThis.fetch;
}

export interface SearchOptions {
  limit?: number;
  signal?: AbortSignal;
}

export interface Client {
  /** Candidate addresses for what somebody has typed: address autocomplete. */
  search(term: string, options?: SearchOptions): Promise<Address[]>;
  /** One address by its G-NAF id. Null when the pid has retired. */
  get(pid: string, options?: { signal?: AbortSignal }): Promise<Address | null>;
  /** A whole address string to one record: address validation and geocoding. */
  resolve(address: string, options?: { signal?: AbortSignal }): Promise<Resolution>;
  /** Near misses for an address that did not resolve. Three units. */
  similar(address: string, options?: SearchOptions): Promise<Address[]>;
}

/**
 * Secret key prefixes, refused in a browser.
 *
 * `_live_` is the shape every tenant's secret keys share (`lc_live_`,
 * `pf_live_`), so a tenant added later is covered without editing this.
 */
const SECRET_KEY = /^[a-z]{2,}_live_/i;

function assertBrowserSafeKey(key: string): void {
  if (!key) {
    throw new Error(
      "@locio/react: no publicKey. Create one at https://locio.com.au/account/api — " +
        "a public key (lc_pub_...) carries an origin allow list and is safe in a page.",
    );
  }
  // Only in a browser. On a server this package may legitimately be handed
  // whatever key that server holds, and refusing there would break SSR.
  const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  if (inBrowser && SECRET_KEY.test(key)) {
    throw new Error(
      "@locio/react: that is a secret key, and this code runs in a browser. " +
        "Anyone who opens the page can read it and spend your quota. " +
        "Use a public key (lc_pub_...) instead: it carries an origin allow list, " +
        "so a copy lifted from your page does nothing anywhere else. " +
        "Create one at https://locio.com.au/account/api",
    );
  }
}

/**
 * Refuse a base URL that would send the key somewhere it should not go.
 *
 * https always, and plaintext http only to loopback, which is what a local
 * proxy and a test server need.
 */
function checkBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`@locio/react: baseUrl ${raw} is not a URL`);
  }
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol === "https:" || (url.protocol === "http:" && loopback)) {
    return raw.replace(/\/+$/, "");
  }
  throw new Error(
    `@locio/react: baseUrl ${raw} must be https (http is allowed only for localhost)`,
  );
}

export function createClient(options: ClientOptions): Client {
  assertBrowserSafeKey(options.publicKey);
  const baseUrl = checkBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const doFetch = options.fetch ?? globalThis.fetch;

  async function call<T>(
    path: string,
    params: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ): Promise<T> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      // A zero limit is not a limit: leave it off so the service's own
      // default applies rather than one this package invented.
      if (value !== undefined && value !== "" && value !== 0) {
        query.set(key, String(value));
      }
    }
    const url = query.size > 0 ? `${baseUrl}${path}?${query}` : `${baseUrl}${path}`;

    const res = await doFetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${options.publicKey}`,
        Accept: "application/json",
      },
      signal,
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new LocioError(
        res.status,
        typeof body.title === "string" ? body.title : "",
        typeof body.detail === "string" ? body.detail : "",
      );
    }
    return body as T;
  }

  return {
    async search(term, opts = {}) {
      const body = await call<{ data?: Address[] }>(
        "/v1/addresses",
        { q: term, limit: opts.limit },
        opts.signal,
      );
      return body.data ?? [];
    },

    async get(pid, opts = {}) {
      try {
        const body = await call<{ data?: Address }>(
          `/v1/addresses/${encodeURIComponent(pid)}`,
          {},
          opts.signal,
        );
        return body.data ?? null;
      } catch (err) {
        // A pid that retired between G-NAF releases is an ordinary thing to
        // be holding, so it is null rather than a throw.
        if (err instanceof LocioError && err.status === 404) return null;
        throw err;
      }
    },

    async resolve(address, opts = {}) {
      const body = await call<{ data?: Resolution }>(
        "/v1/addresses/resolve",
        { q: address },
        opts.signal,
      );
      return body.data ?? { matched: false, address: null };
    },

    async similar(address, opts = {}) {
      const body = await call<{ data?: Address[] }>(
        "/v1/addresses/similar",
        { q: address, limit: opts.limit },
        opts.signal,
      );
      return body.data ?? [];
    },
  };
}
