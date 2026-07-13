"use client";

import { Building2, Search, Target, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useGlobalSearch } from "@/lib/search";

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useGlobalSearch(q);
  const router = useRouter();

  const results = data ?? { clientes: [], contactos: [], oportunidades: [] };
  const total =
    results.clientes.length + results.contactos.length + results.oportunidades.length;

  const irA = (url: string) => {
    setOpen(false);
    setQ("");
    router.push(url);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar…"
          className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      {open && q.trim().length >= 2 && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-9 z-50 max-h-96 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {total === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-400 dark:text-slate-500">
                Sin coincidencias.
              </p>
            ) : (
              <>
                {results.clientes.length > 0 && <Grupo titulo="Cuentas" />}
                {results.clientes.map((c) => (
                  <Item
                    key={`c-${c.id}`}
                    icon={<Building2 size={14} />}
                    title={c.razon_social}
                    onClick={() => irA(`/clientes/${c.id}`)}
                  />
                ))}

                {results.contactos.length > 0 && <Grupo titulo="Contactos" />}
                {results.contactos.map((ct) => (
                  <Item
                    key={`ct-${ct.id}`}
                    icon={<UserRound size={14} />}
                    title={ct.nombre}
                    sub={ct.cliente_nombre ?? undefined}
                    onClick={() => ct.cliente_id && irA(`/clientes/${ct.cliente_id}`)}
                  />
                ))}

                {results.oportunidades.length > 0 && <Grupo titulo="Operaciones" />}
                {results.oportunidades.map((o) => (
                  <Item
                    key={`o-${o.id}`}
                    icon={<Target size={14} />}
                    title={o.asunto || `Operación #${o.id}`}
                    sub={o.cliente_nombre ?? undefined}
                    onClick={() => irA(`/oportunidades?op=${o.id}`)}
                  />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Grupo({ titulo }: { titulo: string }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-brand">
      {titulo}
    </div>
  );
}

function Item({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
    >
      <span className="text-slate-400 dark:text-slate-500">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-slate-800 dark:text-slate-100">{title}</span>
        {sub && (
          <span className="block truncate text-xs text-slate-400 dark:text-slate-500">{sub}</span>
        )}
      </span>
    </button>
  );
}
