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
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/50"
        />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar…"
          className="w-full rounded-full border border-white/15 bg-white/10 py-1.5 pl-8 pr-2 text-sm text-white placeholder:text-white/50 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
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
          <div className="absolute right-0 top-9 z-50 max-h-96 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
            {total === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-ink-3">
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
    <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-accent">
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
      className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-surface2"
    >
      <span className="text-ink-3">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{title}</span>
        {sub && (
          <span className="block truncate text-xs text-ink-3">{sub}</span>
        )}
      </span>
    </button>
  );
}
