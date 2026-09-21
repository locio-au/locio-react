import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  useAddressAutocomplete,
  type UseAddressAutocompleteOptions,
} from "./useAddressAutocomplete";
import type { Address } from "./types";

export interface AddressAutocompleteProps extends UseAddressAutocompleteOptions {
  /** The visible label. An input without one is unusable with a screen reader. */
  label?: string;
  placeholder?: string;
  /** Called with the address somebody picked. */
  onSelect?(address: Address): void;
  /** Class names, so this drops into whatever design system you already have. */
  classNames?: Partial<
    Record<"root" | "label" | "input" | "list" | "option" | "status", string>
  >;
  /** Set false to drop the inline styles and take the markup bare. */
  styled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  autoFocus?: boolean;
}

const MESSAGES = {
  idle: "",
  searching: "Searching…",
  results: "",
  empty: "No addresses match that yet. Keep typing, or check the street number.",
  unavailable: "Address lookup is unavailable right now. Please try again shortly.",
} as const;

/**
 * An accessible address autocomplete, ready to drop in.
 *
 * Implements the ARIA combobox pattern: arrow keys move through the list,
 * Enter picks, Escape closes, and the active option is announced. An
 * autocomplete that only works with a mouse is one that half the people
 * filling your form cannot use.
 *
 * Styling is deliberately minimal and entirely optional. Pass `classNames` to
 * use your own, or `styled={false}` for bare markup: a component that brings a
 * stylesheet is a component that fights whatever you already have.
 */
export function AddressAutocomplete({
  label = "Address",
  placeholder = "Start typing an address",
  onSelect,
  classNames = {},
  styled = true,
  id,
  name,
  required,
  autoFocus,
  ...options
}: AddressAutocompleteProps) {
  const reactId = useId();
  const inputId = id ?? `locio-${reactId}`;
  const listId = `${inputId}-list`;

  const { term, setTerm, results, status, note, clear } = useAddressAutocomplete(options);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showList = open && status === "results" && results.length > 0;
  // The service's own sentence wins over ours. Ours is written for somebody
  // who has not typed enough of an Australian address yet; the service's says
  // things ours cannot know, such as that we hold no addresses at all for the
  // country this visitor is in.
  const message = status === "empty" && note ? note : MESSAGES[status];

  function choose(address: Address) {
    setTerm(address.formatted);
    clear();
    setOpen(false);
    setActive(-1);
    onSelect?.(address);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showList) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(results[active]!);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const s = styled ? style : empty;

  return (
    <div className={classNames.root} style={s.root}>
      <label className={classNames.label} style={s.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        required={required}
        autoFocus={autoFocus}
        className={classNames.input}
        style={s.input}
        type="text"
        // Off, or the browser's own saved addresses cover the list with a
        // dropdown of their own.
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && active >= 0 ? `${listId}-${active}` : undefined
        }
        placeholder={placeholder}
        value={term}
        onChange={(e) => {
          setTerm(e.currentTarget.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        // Deferred, because a click on an option fires blur first and would
        // otherwise unmount the option before its own click handler ran.
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />

      {message && (
        <p role="status" className={classNames.status} style={s.status}>
          {message}
        </p>
      )}

      <ul
        id={listId}
        role="listbox"
        // Its own name, not the field's: sharing one makes the input and the
        // list indistinguishable to anything querying by accessible name,
        // screen readers and tests alike.
        aria-label={`${label} suggestions`}
        className={classNames.list}
        style={showList ? s.list : hidden}
        hidden={!showList}
      >
        {results.map((address, i) => (
          <li
            key={address.address_detail_pid ?? address.gnaf_pid ?? i}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={classNames.option}
            style={{ ...s.option, ...(i === active ? s.optionActive : undefined) }}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              // Keep focus so the deferred blur above never races the click.
              e.preventDefault();
              clearTimeout(blurTimer.current);
            }}
            onClick={() => choose(address)}
          >
            {address.formatted}
          </li>
        ))}
      </ul>
    </div>
  );
}

const hidden: CSSProperties = { display: "none" };
const empty: Record<string, CSSProperties | undefined> = {};

/** A restrained default: enough to be usable out of the box, little enough to
 *  be overridden by one class name. */
const style: Record<string, CSSProperties> = {
  root: { position: "relative", display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 14, fontWeight: 500 },
  input: {
    font: "inherit",
    fontSize: 16, // 16px or iOS zooms the page on focus.
    padding: "10px 12px",
    border: "1px solid #d4d4d8",
    borderRadius: 6,
    width: "100%",
    boxSizing: "border-box",
  },
  status: { margin: 0, fontSize: 12, color: "#71717a" },
  list: {
    listStyle: "none",
    margin: "4px 0 0",
    padding: 0,
    border: "1px solid #d4d4d8",
    borderRadius: 6,
    background: "#fff",
    maxHeight: 280,
    overflowY: "auto",
  },
  option: { padding: "10px 12px", cursor: "pointer", fontSize: 14 },
  optionActive: { background: "#f4f4f5" },
};
