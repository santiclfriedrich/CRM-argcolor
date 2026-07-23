"use client";

import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Cliente } from "@/lib/types";

interface Props {
  clientes: Cliente[];
  value: number | null;
  onChange: (id: number | null) => void;
}

// Selector de cliente con dos vías de búsqueda (como el ERP):
//  - N° de cliente: se escribe el número y al dar Enter selecciona la cuenta.
//  - Nombre: desde 2 letras muestra un desplegable con las coincidencias.
// Ambos inputs quedan sincronizados con la cuenta elegida.
export function ClientePicker({ clientes, value, onChange }: Props) {
  const selected = useMemo(
    () => clientes.find((c) => c.id === value) ?? null,
    [clientes, value]
  );

  const [num, setNum] = useState(selected?.numero_cliente ?? "");
  const [query, setQuery] = useState(selected?.razon_social ?? "");
  const [open, setOpen] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Sincroniza los inputs cuando la selección cambia desde afuera
  // (carga de borrador, edición de una oportunidad existente, etc.).
  useEffect(() => {
    setNum(selected?.numero_cliente ?? "");
    setQuery(selected?.razon_social ?? "");
  }, [selected]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return clientes
      .filter((c) => c.razon_social.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clientes, query]);

  const seleccionar = (c: Cliente) => {
    onChange(c.id);
    setNum(c.numero_cliente ?? "");
    setQuery(c.razon_social);
    setOpen(false);
    setNotFound(false);
  };

  // Busca la cuenta cuyo N° coincide exactamente. Con el campo vacío no hace
  // nada (para no des-seleccionar una cuenta elegida por nombre sin número).
  const buscarPorNumero = () => {
    const n = num.trim();
    if (!n) {
      setNotFound(false);
      return;
    }
    const c = clientes.find((x) => (x.numero_cliente ?? "") === n);
    if (c) seleccionar(c);
    else setNotFound(true);
  };

  return (
    <div className="flex gap-2">
      {/* N° de cliente */}
      <div className="w-28 shrink-0">
        <Input
          value={num}
          onChange={(e) => {
            setNum(e.target.value);
            setNotFound(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              buscarPorNumero();
            }
          }}
          onBlur={buscarPorNumero}
          placeholder="N° cliente"
          className={cn(
            "font-mono",
            notFound && "border-red-400 focus:border-red-400 focus:ring-red-400/30"
          )}
          aria-label="Número de cliente"
        />
      </div>

      {/* Nombre con autocompletado */}
      <div className="relative flex-1">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar por nombre (mín. 2 letras)"
          aria-label="Nombre de la cuenta"
        />

        {open && matches.length > 0 && (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <ul className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-60 w-full overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-soft">
              {matches.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => seleccionar(c)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      c.id === value
                        ? "bg-accent-dim font-medium text-accent"
                        : "text-ink hover:bg-surface2"
                    )}
                  >
                    <span className="truncate">{c.razon_social}</span>
                    {c.numero_cliente && (
                      <span className="shrink-0 font-mono text-xs text-ink-3">
                        {c.numero_cliente}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
