"use client";

import { useId, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { BankLogo } from "@/components/bank-logo";
import { BANK_CHOICES, findBank } from "@/lib/banks";

/**
 * Accessible combobox for choosing a bank. Suggests known banks (with their
 * logos) as the user types, but any name can be entered.
 */
export function BankPicker({
  id,
  name,
  defaultValue,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q
      ? BANK_CHOICES.filter((b) => b.name.toLowerCase().includes(q) || b.aliases.some((a) => a.startsWith(q)))
      : BANK_CHOICES;
    return list.slice(0, 8);
  }, [value]);

  const choose = (bankName: string) => {
    setValue(bankName);
    setOpen(false);
    inputRef.current?.focus();
  };

  const recognised = findBank(value);
  const showList = open && matches.length > 0 && !(matches.length === 1 && matches[0].name === value);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2">
        <BankLogo name={recognised ? recognised.name : value || null} size="xs" />
      </span>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder="Start typing, e.g. Zenith Bank"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && showList) {
            e.preventDefault();
            choose(matches[active].name);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={clsx(
          "block h-10 w-full rounded-[var(--radius-control)] border bg-white pr-3 pl-10 text-sm text-ink-900 shadow-[var(--shadow-card)] transition-colors placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25 focus:outline-none",
          invalid ? "border-danger-700" : "border-ink-200 hover:border-ink-300",
        )}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Banks"
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-2xl border border-ink-200 bg-white p-1.5 shadow-[var(--shadow-raised)]"
        >
          {matches.map((bank, i) => (
            <li
              key={bank.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus in the input
                choose(bank.name);
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx(
                "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm",
                i === active ? "bg-ink-100 text-ink-950" : "text-ink-700",
              )}
            >
              <BankLogo name={bank.name} size="sm" />
              {bank.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
