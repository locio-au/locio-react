# @locio-au/react

**React address autocomplete** for Australian addresses, with validation and
geocoding built in. Backed by G-NAF, the national address register.

- An accessible combobox you can drop in, or a headless hook if you have your
  own markup
- Debounced and cancelled properly, so typing an address costs one request
  rather than thirteen
- Every result is already resolved: a stable G-NAF id, a coordinate, an ABS
  mesh block and the address split into fields. No second call to find out
  what was picked.
- No dependencies beyond React

```sh
npm install @locio-au/react
```

## Quick start

```tsx
import { AddressAutocomplete } from "@locio-au/react";

export function Checkout() {
  return (
    <AddressAutocomplete
      publicKey="lc_pub_..."
      label="Delivery address"
      onSelect={(address) => {
        console.log(address.formatted);
        console.log(address.address_detail_pid); // store this, not the text
        console.log(address.lat, address.lng);
        console.log(address.components?.postcode);
      }}
    />
  );
}
```

That is the whole integration. It handles the debounce, cancels superseded
requests, and implements the ARIA combobox pattern so arrow keys, Enter and
Escape all work.

## Use a public key

`lc_pub_...`, created at
[locio.com.au/account/api](https://locio.com.au/account/api). A public key
carries an **origin allow list**, so a copy lifted from your page does nothing
anywhere else.

Never put a secret key (`lc_live_...`) in a page. Anyone who opens it can read
the key and spend your quota. This package **throws at construction** if it
sees a secret key in a browser rather than letting it reach production
working perfectly.

For server code use [`locio`](https://pypi.org/project/locio/) (Python) or
[`locio-go`](https://github.com/locio-au/locio-go).

## Styling

The default styles are deliberately minimal. Replace them with your own class
names:

```tsx
<AddressAutocomplete
  publicKey="lc_pub_..."
  classNames={{
    root: "relative",
    input: "w-full rounded-md border px-3 py-2",
    list: "absolute z-10 w-full rounded-md border bg-white shadow",
    option: "px-3 py-2 hover:bg-neutral-100",
    status: "text-xs text-neutral-500",
  }}
/>
```

Or take the markup bare with `styled={false}`.

## Headless

If you want your own markup entirely, the hook has all the behaviour and no
opinion about the DOM:

```tsx
import { useAddressAutocomplete } from "@locio-au/react";

function MyField() {
  const { term, setTerm, results, status } = useAddressAutocomplete({
    publicKey: "lc_pub_...",
    debounceMs: 300,
    minLength: 3,
  });

  return (
    <>
      <input value={term} onChange={(e) => setTerm(e.currentTarget.value)} />
      {status === "searching" && <span>Searching…</span>}
      {status === "empty" && <span>No addresses match that yet.</span>}
      {status === "unavailable" && <span>Lookup is unavailable.</span>}
      <ul>
        {results.map((a) => (
          <li key={a.address_detail_pid}>{a.formatted}</li>
        ))}
      </ul>
    </>
  );
}
```

`status` is one value rather than several booleans, because "searching" and
"nothing found" being separately true is how a widget ends up claiming both.

Note that `empty` and `unavailable` are different states. A widget that
renders nothing for both tells the user neither, and an outage then looks
exactly like an address that does not exist.

## Address validation on its own

The client is exported if you want the other calls without the UI:

```ts
import { createClient } from "@locio-au/react";

const locio = createClient({ publicKey: "lc_pub_..." });

const result = await locio.resolve("1 george st sydenham nsw 2044");
if (result.matched) {
  console.log(result.address!.address_detail_pid);
}
```

`search`, `resolve` and `get` cost one unit; `similar` costs three.

## Two ids, and which to store

A record can carry two pids and they mean different things:

| Field | Means |
|---|---|
| `address_detail_pid` | **This address.** The one to store. |
| `gnaf.primary_pid` | The **parcel** it sits on, when the row is a unit. |

```ts
import { isUnit } from "@locio-au/react";
```

Storing the primary pid stores the building rather than the door, and nothing
about the value itself says which you have.

## Props

| Prop | Default | |
|---|---|---|
| `publicKey` | — | Required. `lc_pub_...` |
| `label` | `"Address"` | Visible label, also names the suggestion list |
| `placeholder` | `"Start typing an address"` | |
| `onSelect` | — | Called with the picked `Address` |
| `debounceMs` | `300` | Quiet time before a request |
| `minLength` | `3` | Characters before anything is requested |
| `limit` | service default | How many candidates to ask for |
| `classNames` | — | `root`, `label`, `input`, `list`, `option`, `status` |
| `styled` | `true` | `false` for bare markup |
| `baseUrl` | `https://api.locio.com.au` | For a proxy of your own |

## Accessibility

Implements the ARIA combobox pattern: `role="combobox"` with `aria-expanded`,
`aria-controls` and `aria-activedescendant`; a `role="listbox"` of
`role="option"`; arrow keys, Enter and Escape. The input is 16px, because
anything smaller makes iOS zoom the page on focus.

## Licence

MIT. Address data is G-NAF, published by Geoscape Australia under CC BY 4.0;
attribution belongs wherever you show it.
