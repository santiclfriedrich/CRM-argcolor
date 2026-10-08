"use client";

import { Package, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useOportunidades, usePatchOportunidad } from "@/lib/oportunidades";
import type { Oportunidad, OportunidadUpdate } from "@/lib/types";
import { useMiUsuario, useUsuarios } from "@/lib/usuarios";
import { cn } from "@/lib/utils";

// Colores del estado logístico (manual, como colorear la celda del Excel).
const SWATCHES: { key: string; label: string; dot: string }[] = [
  { key: "", label: "Sin color", dot: "border border-line bg-surface" },
  { key: "amarillo", label: "Amarillo", dot: "bg-amber-400" },
  { key: "naranja", label: "Naranja", dot: "bg-orange-400" },
  { key: "verde", label: "Verde", dot: "bg-green-500" },
];
const CELDA_COLOR: Record<string, string> = {
  amarillo: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
  naranja: "bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-100",
  verde: "bg-green-100 text-green-900 dark:bg-green-500/20 dark:text-green-100",
};

export default function PedidosPage() {
  const { data: yo } = useMiUsuario();
  const { data: usuarios } = useUsuarios();
  const rol = yo?.rol;

  // Filtro por vendedor: el vendedor arranca viendo los suyos; admin/compras, todos.
  const [vendedorId, setVendedorId] = useState<number | "todos" | null>(null);
  const efectivo: number | "todos" =
    vendedorId ?? (rol === "vendedor" && yo ? yo.id : "todos");

  const [busqueda, setBusqueda] = useState("");

  const { data: pedidos, isLoading } = useOportunidades({
    con_pedido: true,
    usuario_id: efectivo === "todos" ? undefined : efectivo,
  });

  const patch = usePatchOportunidad();

  const filas = useMemo(() => {
    const arr = pedidos ?? [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return arr;
    return arr.filter((o) =>
      `${o.cliente?.numero_cliente ?? ""} ${o.cliente?.razon_social ?? ""} ${o.numero_pedido ?? ""} ${o.pedido_oc ?? ""} ${o.pedido_remito ?? ""} ${o.pedido_estado ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [pedidos, busqueda]);

  const vendedores = (usuarios ?? []).filter((u) => u.activo);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
          <Package size={22} className="text-accent" /> Seguimiento de Pedidos
        </h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-dim px-3 py-1 text-xs font-medium text-ink-2">
          <span className="font-mono font-semibold tabular-nums text-accent">
            {filas.length}
          </span>
          pedido{filas.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={String(efectivo)}
          onChange={(e) =>
            setVendedorId(e.target.value === "todos" ? "todos" : Number(e.target.value))
          }
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="todos">Todos los vendedores</option>
          {vendedores.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>

        <div className="relative min-w-[16rem] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, pedido, OC, remito…"
            className="w-full rounded-full border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line [&_th]:bg-surface2 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-ink">
              <th className="w-20">N° CL</th>
              <th className="min-w-[200px]">Cliente</th>
              <th className="w-28">Pedido</th>
              <th className="w-36">Fecha inicio</th>
              <th className="w-32">OC</th>
              <th className="w-32">Remito</th>
              <th className="min-w-[280px]">Estado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-ink-2">
                  Cargando…
                </td>
              </tr>
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-ink-2">
                  No hay pedidos con estos filtros.
                </td>
              </tr>
            ) : (
              filas.map((o) => (
                <PedidoRow
                  key={o.id}
                  o={o}
                  onGuardar={(body) => patch.mutate({ id: o.id, body })}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PedidoRow({
  o,
  onGuardar,
}: {
  o: Oportunidad;
  onGuardar: (body: OportunidadUpdate) => void;
}) {
  const [oc, setOc] = useState(o.pedido_oc ?? "");
  const [remito, setRemito] = useState(o.pedido_remito ?? "");
  const [fecha, setFecha] = useState(o.pedido_fecha_inicio ?? "");
  const [estado, setEstado] = useState(o.pedido_estado ?? "");
  const color = o.pedido_estado_color ?? "";

  // Guarda un campo solo si cambió respecto del valor del servidor.
  const guardarSiCambio = (campo: keyof OportunidadUpdate, valor: string, original: string) => {
    if (valor === original) return;
    onGuardar({ [campo]: valor || null } as OportunidadUpdate);
  };

  const celda =
    "w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink transition hover:border-line focus:border-accent focus:bg-surface focus:outline-none";

  return (
    <tr className="border-t border-line align-top">
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-ink-2">
        {o.cliente?.numero_cliente ?? "—"}
      </td>
      <td className="px-3 py-2">
        <Link
          href={`/oportunidades/${o.id}`}
          className="font-medium text-accent hover:underline"
        >
          {o.cliente?.razon_social ?? o.asunto ?? `#${o.id}`}
        </Link>
      </td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-ink">
        {o.numero_pedido ?? "—"}
      </td>
      <td className="px-2 py-1.5">
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          onBlur={() => guardarSiCambio("pedido_fecha_inicio", fecha, o.pedido_fecha_inicio ?? "")}
          className={celda}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={oc}
          onChange={(e) => setOc(e.target.value)}
          onBlur={() => guardarSiCambio("pedido_oc", oc, o.pedido_oc ?? "")}
          className={celda}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={remito}
          onChange={(e) => setRemito(e.target.value)}
          onBlur={() => guardarSiCambio("pedido_remito", remito, o.pedido_remito ?? "")}
          className={celda}
        />
      </td>
      <td className={cn("px-2 py-1.5", CELDA_COLOR[color])}>
        <div className="flex items-center gap-1.5">
          <div className="flex shrink-0 items-center gap-1">
            {SWATCHES.map((s) => (
              <button
                key={s.key}
                type="button"
                title={s.label}
                onClick={() => onGuardar({ pedido_estado_color: s.key || null })}
                className={cn(
                  "h-4 w-4 rounded-full transition",
                  s.dot,
                  color === s.key && "ring-2 ring-ink ring-offset-1 ring-offset-surface"
                )}
                aria-label={s.label}
              />
            ))}
          </div>
          <input
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            onBlur={() => guardarSiCambio("pedido_estado", estado, o.pedido_estado ?? "")}
            placeholder="Estado…"
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink transition hover:border-line focus:border-accent focus:bg-surface focus:outline-none placeholder:text-ink-3"
          />
        </div>
      </td>
    </tr>
  );
}
