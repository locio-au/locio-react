import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, LocioError } from "./client";

const UNIT = {
  data: [
    {
      address_detail_pid: "GAVIC425624910",
      gnaf_pid: "GAVIC425624910",
      formatted: "Unit 104, 119 Turner Street, Abbotsford VIC 3067",
      lat: -37.79928725,
      lng: 145.0004257,
      mesh_block: "21301420000",
      components: { flat_number: "104", street_name: "Turner", postcode: "3067" },
      gnaf: { primary_secondary: "SECONDARY", primary_pid: "GAVIC425580914" },
    },
  ],
};

function stub(status = 200, body: unknown = UNIT) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

/**
 * SECURITY. A secret key in a browser is a secret key given away.
 *
 * Anyone who can open the page can read it from the bundle, the network tab
 * or view-source, and then spend the quota it belongs to. Public keys exist
 * for exactly this and carry an origin allow list, so a copy lifted from the
 * page does nothing anywhere else.
 *
 * Refusing loudly at construction is the whole point: a secret key put in a
 * page otherwise works perfectly, which is why it reaches production.
 */
describe("secret keys must never reach a browser", () => {
  it("refuses a secret key when a window exists", () => {
    expect(() => createClient({ publicKey: "lc_live_abcdef123456" })).toThrow(
      /secret key/i,
    );
  });

  it("names the public key as the fix rather than only refusing", () => {
    expect(() => createClient({ publicKey: "lc_live_abcdef123456" })).toThrow(
      /lc_pub_/,
    );
  });

  it("refuses postfinder's secret prefix too", () => {
    expect(() => createClient({ publicKey: "pf_live_abcdef123456" })).toThrow(
      /secret key/i,
    );
  });

  it("accepts a public key", () => {
    expect(() => createClient({ publicKey: "lc_pub_abcdef123456" })).not.toThrow();
  });

  it("requires a key at all", () => {
    expect(() => createClient({ publicKey: "" })).toThrow(/key/i);
  });
});

describe("search", () => {
  it("sends the term, the limit and bearer auth", async () => {
    const calls = stub();
    const client = createClient({ publicKey: "lc_pub_x" });

    const found = await client.search("104/119 turner", { limit: 5 });

    expect(found).toHaveLength(1);
    expect(found[0]!.address_detail_pid).toBe("GAVIC425624910");
    expect(calls[0]!.url).toContain("/v1/addresses?");
    expect(calls[0]!.url).toContain("q=104%2F119+turner");
    expect(calls[0]!.url).toContain("limit=5");

    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer lc_pub_x");
  });

  it("omits the limit when none was given, so the service default applies", async () => {
    const calls = stub();
    await createClient({ publicKey: "lc_pub_x" }).search("90 bay road");
    expect(calls[0]!.url).not.toContain("limit=");
  });

  it("passes an abort signal through", async () => {
    const calls = stub();
    const controller = new AbortController();
    await createClient({ publicKey: "lc_pub_x" }).search("90 bay road", {
      signal: controller.signal,
    });
    expect(calls[0]!.init?.signal).toBe(controller.signal);
  });
});

describe("errors", () => {
  it("keeps what the API said", async () => {
    stub(403, {
      title: "this key is not allowed from here",
      detail: "A public key only works from the sites listed on it.",
    });

    await expect(
      createClient({ publicKey: "lc_pub_x" }).search("90 bay road"),
    ).rejects.toSatisfy((err: unknown) => {
      const e = err as LocioError;
      return (
        e.status === 403 &&
        /not allowed from here/.test(e.message) &&
        /sites listed on it/.test(e.message)
      );
    });
  });
});

describe("base URL is a credential boundary", () => {
  it("refuses plaintext http to a public host", () => {
    expect(() =>
      createClient({ publicKey: "lc_pub_x", baseUrl: "http://example.com" }),
    ).toThrow(/https/i);
  });

  it("allows loopback http for local development", () => {
    expect(() =>
      createClient({ publicKey: "lc_pub_x", baseUrl: "http://localhost:8080" }),
    ).not.toThrow();
  });
});
