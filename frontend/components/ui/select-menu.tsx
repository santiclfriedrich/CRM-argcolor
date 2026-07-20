"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export interface OpcionSelect {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: OpcionSelect[];
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
}

// Desplegable propio (no el <select> nativo del SO): trigger + panel estilizado.
export function SelectMenu({
  value,
  onChange,
  options,
  placeholder = "— Seleccionar —",
  id,
  invalid,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const seleccionada = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm transition-colors",
          "focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-accent ring-2 ring-accent/30",
          invalid && "border-red-400 ring-red-400/40"
        )}
      >
        <span
          className={cn(
            "truncate",
            seleccionada ? "text-ink" : "text-ink-3"
          )}
        >
          {seleccionada ? seleccionada.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-ink-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-60 w-full overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-soft">
            {options.map((o) => {
              const activa = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      activa
                        ? "bg-accent-dim font-medium text-accent"
                        : "text-ink hover:bg-surface2"
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {activa && <Check size={15} className="shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
