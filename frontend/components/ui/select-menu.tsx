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
          "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm transition-colors",
          "dark:border-slate-700 dark:bg-slate-800",
          "hover:border-slate-400 focus:outline-none dark:hover:border-slate-600",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-brand ring-2 ring-brand/30",
          invalid && "border-red-400 ring-red-400/40"
        )}
      >
        <span
          className={cn(
            "truncate",
            seleccionada ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"
          )}
        >
          {seleccionada ? seleccionada.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
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
          <ul className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-soft dark:border-slate-700 dark:bg-slate-900">
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
                        ? "bg-brand/10 font-medium text-brand"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
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
