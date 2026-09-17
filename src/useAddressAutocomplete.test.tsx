import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddressAutocomplete } from "./AddressAutocomplete";

const ADDRESS = {
  address_detail_pid: "GAVIC425624910",
  formatted: "Unit 104, 119 Turner Street, Abbotsford VIC 3067",
  lat: -37.79928725,
  lng: 145.0004257,
  components: { postcode: "3067" },
};

function stubFetch(body: unknown = { data: [ADDRESS] }) {
  const urls: string[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    urls.push(String(url));
    signals.push(init?.signal ?? undefined);
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
      setTimeout(() => resolve(new Response(JSON.stringify(body), { status: 200 })), 5);
    });
  });
  return { urls, signals };
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
});

const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

function widget(props: Record<string, unknown> = {}) {
  return <AddressAutocomplete publicKey="lc_pub_x" label="Address" {...props} />;
}

/** A keystroke is not a request. Every character firing a call spends a unit
 *  per keypress and leaves the useful one queued behind dead ones. */
it("makes one request for a burst of typing", async () => {
  const { urls } = stubFetch();
  const user = setup();
  render(widget());

  await user.type(screen.getByLabelText("Address"), "119 turner");
  await vi.advanceTimersByTimeAsync(500);

  await waitFor(() => expect(urls.length).toBeGreaterThan(0));
  expect(urls).toHaveLength(1);
  // URLSearchParams encodes a space as "+", which is correct in a query
  // string and is what the server decodes back.
  expect(urls[0]).toContain("q=119+turner");
});

/** Superseded requests are cancelled, not merely ignored: ignoring frees
 *  nothing, and the socket stays taken. */
it("aborts a request a later keystroke supersedes", async () => {
  const { signals } = stubFetch();
  const user = setup();
  render(widget());
  const box = screen.getByLabelText("Address");

  await user.type(box, "119 tur");
  await vi.advanceTimersByTimeAsync(500);
  await waitFor(() => expect(signals.length).toBe(1));

  await user.type(box, "ner");
  await vi.advanceTimersByTimeAsync(500);
  await waitFor(() => expect(signals.length).toBe(2));

  expect(signals[0]!.aborted).toBe(true);
  expect(signals[1]!.aborted).toBe(false);
});

it("does not call the API below the minimum length", async () => {
  const { urls } = stubFetch();
  const user = setup();
  render(widget());

  await user.type(screen.getByLabelText("Address"), "11");
  await vi.advanceTimersByTimeAsync(500);

  expect(urls).toHaveLength(0);
});

it("hands the picked address to onSelect", async () => {
  stubFetch();
  const onSelect = vi.fn();
  const user = setup();
  render(widget({ onSelect }));

  await user.type(screen.getByLabelText("Address"), "119 turner");
  await vi.advanceTimersByTimeAsync(500);
  await user.click(await screen.findByRole("option", { name: ADDRESS.formatted }));

  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
    address_detail_pid: "GAVIC425624910",
  }));
});

/** An accessible combobox, because an autocomplete that only works with a
 *  mouse is an autocomplete half the people cannot use. */
it("is a keyboard operable combobox", async () => {
  stubFetch();
  const onSelect = vi.fn();
  const user = setup();
  render(widget({ onSelect }));

  const box = screen.getByLabelText("Address");
  expect(box).toHaveAttribute("role", "combobox");
  expect(box).toHaveAttribute("aria-expanded", "false");

  await user.type(box, "119 turner");
  await vi.advanceTimersByTimeAsync(500);
  await screen.findByRole("listbox");
  expect(box).toHaveAttribute("aria-expanded", "true");

  await user.keyboard("{ArrowDown}");
  const option = screen.getByRole("option", { name: ADDRESS.formatted });
  expect(option).toHaveAttribute("aria-selected", "true");
  expect(box).toHaveAttribute("aria-activedescendant", option.id);

  await user.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledOnce();
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("closes on Escape without selecting", async () => {
  stubFetch();
  const onSelect = vi.fn();
  const user = setup();
  render(widget({ onSelect }));

  await user.type(screen.getByLabelText("Address"), "119 turner");
  await vi.advanceTimersByTimeAsync(500);
  await screen.findByRole("listbox");

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(onSelect).not.toHaveBeenCalled();
});

/** An outage and an address that does not exist are different answers, and a
 *  widget that renders nothing for both is telling the user neither. */
it("says when nothing matched", async () => {
  stubFetch({ data: [] });
  const user = setup();
  render(widget());

  await user.type(screen.getByLabelText("Address"), "119 nowhere");
  await vi.advanceTimersByTimeAsync(500);

  expect(await screen.findByRole("status")).toHaveTextContent(/no addresses/i);
});

it("says when the lookup is unavailable", async () => {
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
  const user = setup();
  render(widget());

  await user.type(screen.getByLabelText("Address"), "119 turner");
  await vi.advanceTimersByTimeAsync(500);

  expect(await screen.findByRole("status")).toHaveTextContent(/unavailable/i);
});
