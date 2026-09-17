import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type Client, type ClientOptions } from "./client";
import type { Address } from "./types";

/**
 * How long a pause means somebody has stopped typing.
 *
 * Long enough that a burst of typing is one request, short enough that it
 * still feels like it is keeping up. It matters more here than in most
 * autocompletes: every call spends a unit of your quota, so a per keystroke
 * widget costs thirteen units to type one address.
 */
export const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Below this, a prefix matches most of the country and the answer means
 * nothing. The API refuses under two characters anyway; three is where the
 * results start being worth showing.
 */
export const DEFAULT_MIN_LENGTH = 3;

/** What the box has to say, as one value rather than several booleans that can
 *  contradict each other. */
export type AutocompleteStatus =
  | "idle"
  | "searching"
  | "results"
  | "empty"
  | "unavailable";

export interface UseAddressAutocompleteOptions extends ClientOptions {
  /** Milliseconds of quiet before a request. Default 300. */
  debounceMs?: number;
  /** Characters before anything is requested. Default 3. */
  minLength?: number;
  /** How many candidates to ask for. The service default applies when unset. */
  limit?: number;
  /** An existing client, if you already made one. */
  client?: Client;
}

export interface UseAddressAutocomplete {
  /** What is in the box. */
  term: string;
  /** Call on every change. Debouncing and cancelling are handled. */
  setTerm(term: string): void;
  results: Address[];
  status: AutocompleteStatus;
  /** The error behind `status === "unavailable"`, for logging. */
  error: unknown;
  /** Forget the results without clearing the box: use after a selection. */
  clear(): void;
}

/**
 * The address autocomplete, without any opinion about how it looks.
 *
 * Everything that is easy to get wrong lives here: debouncing, cancelling a
 * superseded request, and telling an empty result apart from a failed one.
 * Build whatever markup you like on top, or use `<AddressAutocomplete />` for
 * an accessible default.
 */
export function useAddressAutocomplete(
  options: UseAddressAutocompleteOptions,
): UseAddressAutocomplete {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    minLength = DEFAULT_MIN_LENGTH,
    limit,
    client: given,
  } = options;

  // A client per key, not per render: createClient validates the key, and
  // rebuilding it every render would re-run that on every keystroke.
  const { publicKey, baseUrl, fetch: fetchImpl } = options;
  const client = useMemo(
    () => given ?? createClient({ publicKey, baseUrl, fetch: fetchImpl }),
    [given, publicKey, baseUrl, fetchImpl],
  );

  const [term, setTermState] = useState("");
  const [results, setResults] = useState<Address[]>([]);
  const [status, setStatus] = useState<AutocompleteStatus>("idle");
  const [error, setError] = useState<unknown>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<AbortController | undefined>(undefined);

  // Nothing may be left running when the component goes away: a pending
  // timer would set state on an unmounted component, and an open request
  // would hold a connection nobody is waiting for.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      inFlight.current?.abort();
    },
    [],
  );

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    inFlight.current?.abort();
    setResults([]);
    setStatus("idle");
  }, []);

  const setTerm = useCallback(
    (next: string) => {
      setTermState(next);
      clearTimeout(timer.current);

      if (next.trim().length < minLength) {
        inFlight.current?.abort();
        setResults([]);
        setStatus("idle");
        return;
      }

      setStatus("searching");
      timer.current = setTimeout(() => {
        // Cancelling rather than ignoring. An ignored response still held a
        // connection the whole time, and browsers allow six per host, so the
        // keystroke that matters ends up queued behind ones that do not.
        inFlight.current?.abort();
        const mine = new AbortController();
        inFlight.current = mine;

        client
          .search(next, { limit, signal: mine.signal })
          .then((found) => {
            if (mine.signal.aborted) return;
            setResults(found);
            setStatus(found.length > 0 ? "results" : "empty");
            setError(null);
          })
          .catch((err: unknown) => {
            // An abort is this hook superseding itself, not a failure, and it
            // must repaint nothing: a newer request owns the box now.
            if (mine.signal.aborted) return;
            setResults([]);
            setError(err);
            setStatus("unavailable");
          });
      }, debounceMs);
    },
    [client, debounceMs, limit, minLength],
  );

  return { term, setTerm, results, status, error, clear };
}
