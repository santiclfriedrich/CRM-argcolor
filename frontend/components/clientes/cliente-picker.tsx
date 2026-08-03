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

// Desplegable de sugerencias: nombre | CUIT + N° a la derecha.
function Sugerencias({
  items,
  value,
  onPick,
  onClose,
}: {
  items: Cliente[];
  value: number | null;
  onPick: (c: Cliente) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <ul className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-60 w-[30rem] max-w-[90vw] overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-soft">
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              // Evita que el input pierda foco (blur) antes del click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(c)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                c.id === value
                  ? "bg-accent-dim font-medium text-accent"
                  : "text-ink hover:bg-surface2",
              )}
            >
              <span className="truncate">
                {c.razon_social}
                <span className="text-ink-3"> | {c.cuit ?? "—"}</span>
              </span>
              {c.numero_cliente && (
                <span className="shrink-0 font-mono tabular-nums text-xs text-ink-3">
                  {c.numero_cliente}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// Selector de cliente con dos vías de búsqueda (como el ERP):
//  - N° de cliente: sugiere mientras escribís; Enter selecciona el match exacto.
//  - Nombre: desde 2 letras muestra un desplegable con las coincidencias.
// Cada sugerencia muestra "nombre | CUIT" y el N° a la derecha.
export function ClientePicker({ clientes, value, onChange }: Props) {
  const selected = useMemo(
    () => clientes.find((c) => c.id === value) ?? null,
    [clientes, value],
  );

  const [num, setNum] = useState(selected?.numero_cliente ?? "");
  const [query, setQuery] = useState(selected?.razon_social ?? "");
  const [openNum, setOpenNum] = useState(false);
  const [openNombre, setOpenNombre] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Sincroniza los inputs cuando la selección cambia desde afuera
  // (carga de borrador, edición de una oportunidad existente, etc.).
  useEffect(() => {
    setNum(selected?.numero_cliente ?? "");
    setQuery(selected?.razon_social ?? "");
  }, [selected]);

  const matchesNombre = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return clientes.filter((c) => c.razon_social.toLowerCase().includes(q)).slice(0, 8);
  }, [clientes, query]);

  const matchesNum = useMemo(() => {
    const n = num.trim();
    if (!n) return [];
    return clientes.filter((c) => (c.numero_cliente ?? "").includes(n)).slice(0, 8);
  }, [clientes, num]);

  const seleccionar = (c: Cliente) => {
    onChange(c.id);
    setNum(c.numero_cliente ?? "");
    setQuery(c.razon_social);
    setOpenNum(false);
    setOpenNombre(false);
    setNotFound(false);
  };

  // Enter en el N°: selecciona la cuenta cuyo N° coincide exactamente.
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
      {/* N° de cliente (con sugerencias) */}
      <div className="relative w-28 shrink-0">
        <Input
          value={num}
          onChange={(e) => {
            setNum(e.target.value);
            setNotFound(false);
            setOpenNum(true);
          }}
          onFocus={() => setOpenNum(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              buscarPorNumero();
            }
          }}
          placeholder="N° cliente"
          className={cn(
            "font-mono",
            notFound && "border-danger focus:border-danger focus:ring-danger/30",
          )}
          aria-label="Número de cliente"
        />
        {openNum && matchesNum.length > 0 && (
          <Sugerencias
            items={matchesNum}
            value={value}
            onPick={seleccionar}
            onClose={() => setOpenNum(false)}
          />
        )}
      </div>

      {/* Nombre con autocompletado */}
      <div className="relative flex-1">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpenNombre(true);
          }}
          onFocus={() => setOpenNombre(true)}
          placeholder="Buscar por nombre (mín. 2 letras)"
          aria-label="Nombre de la cuenta"
        />
        {openNombre && matchesNombre.length > 0 && (
          <Sugerencias
            items={matchesNombre}
            value={value}
            onPick={seleccionar}
            onClose={() => setOpenNombre(false)}
          />
        )}
      </div>
    </div>
  );
}
