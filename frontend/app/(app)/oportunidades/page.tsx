"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Filter,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { OportunidadForm } from "@/components/oportunidades/oportunidad-form";
import { SolicitudForm } from "@/components/solicitudes/solicitud-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import {
  ESTADO_META,
  useAgregarComentario,
  useCreateOportunidad,
  useDeleteOportunidad,
  useOportunidades,
  useSugerenciaCompras,
  useUpdateOportunidad,
} from "@/lib/oportunidades";
import { fmtMonto, useCreatePresupuesto } from "@/lib/presupuestos";
import { useCrearYEnviarSolicitud } from "@/lib/solicitudes";
import type {
  EstadoOportunidad,
  Oportunidad,
  OportunidadCreate,
  OportunidadFiltros,
} from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";

// "2026-08-01" -> "01/08/2026" (sin líos de zona horaria).
function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

// "Carlos Arteaga" -> "C.A" (iniciales del vendedor, columna "Ing.").
function iniciales(nombre: string | null | undefined): string {
  if (!nombre) return "—";
  return (
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join(".") || "—"
  );
}

// "Cotizado" = ya se armó/envió la cotización al cliente.
const ESTADOS_COTIZADOS: EstadoOportunidad[] = [
  "presupuestada",
  "ganada",
  "cargada_en_gbp",
  "facturada",
];
function estaCotizada(o: Oportunidad): boolean {
  return Boolean(o.fecha_enviado_cliente) || ESTADOS_COTIZADOS.includes(o.estado);
}

// --- Orden y filtro por columna (estilo planilla) ---
type ColKey =
  | "cliente" | "cl" | "asunto" | "producto" | "pedido" | "ecompra" | "rcompra"
  | "cotizado" | "ecliente" | "validez" | "ing" | "estado" | "observacion";
type ColTipo = "texto" | "fecha";

const ACCESOR: Record<ColKey, { get: (o: Oportunidad) => string; tipo: ColTipo }> = {
  cliente: { get: (o) => o.cliente?.razon_social ?? "", tipo: "texto" },
  cl: { get: (o) => o.cliente?.numero_cliente ?? "", tipo: "texto" },
  asunto: { get: (o) => o.asunto ?? "", tipo: "texto" },
  producto: { get: (o) => o.producto ?? "", tipo: "texto" },
  pedido: { get: (o) => o.numero_pedido ?? "", tipo: "texto" },
  ecompra: { get: (o) => o.fecha_enviado_compras ?? "", tipo: "fecha" },
  rcompra: { get: (o) => o.fecha_respuesta_compras ?? "", tipo: "fecha" },
  cotizado: { get: (o) => (estaCotizada(o) ? "Sí" : "No"), tipo: "texto" },
  ecliente: { get: (o) => o.fecha_enviado_cliente ?? "", tipo: "fecha" },
  validez: { get: (o) => o.fecha_limite ?? "", tipo: "fecha" },
  ing: { get: (o) => o.vendedor?.nombre ?? "", tipo: "texto" },
  estado: { get: (o) => ESTADO_META[o.estado].label, tipo: "texto" },
  observacion: { get: (o) => o.observacion ?? "", tipo: "texto" },
};

type SortState = { key: ColKey; dir: "asc" | "desc" } | null;

const mostrarValor = (v: string, tipo: ColTipo): string =>
  v === "" ? "(vacío)" : tipo === "fecha" ? fmtDate(v) : v;

function comparar(a: string, b: string, tipo: ColTipo): number {
  if (a === b) return 0;
  if (a === "") return 1; // vacíos al final
  if (b === "") return -1;
  return tipo === "fecha" ? (a < b ? -1 : 1) : a.localeCompare(b, "es");
}

// Campos que barre el buscador global.
const CAMPOS_BUSQUEDA: ((o: Oportunidad) => string)[] = [
  (o) => String(o.id),
  (o) => o.cliente?.razon_social ?? "",
  (o) => o.cliente?.numero_cliente ?? "",
  (o) => o.asunto ?? "",
  (o) => o.producto ?? "",
  (o) => o.numero_pedido ?? "",
  (o) => o.observacion ?? "",
  (o) => o.vendedor?.nombre ?? "",
];

// Encabezado con menú de orden (asc/desc) + filtro por valores específicos.
function FiltroColumna({
  label,
  colKey,
  tipo,
  valores,
  sort,
  onSort,
  seleccion,
  onSeleccion,
}: {
  label: string;
  colKey: ColKey;
  tipo: ColTipo;
  valores: string[];
  sort: SortState;
  onSort: (key: ColKey, dir: "asc" | "desc" | null) => void;
  seleccion: string[] | undefined; // undefined = todos
  onSeleccion: (sel: string[] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const cerrar = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [open]);

  const abrir = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240) });
    setQ("");
    setOpen((o) => !o);
  };

  const dir = sort?.key === colKey ? sort.dir : null;
  const activo = dir !== null || seleccion !== undefined;
  const marcados = new Set(seleccion ?? valores);
  const visibles = valores.filter((v) => mostrarValor(v, tipo).toLowerCase().includes(q.toLowerCase()));

  const toggle = (v: string) => {
    const base = new Set(seleccion ?? valores);
    if (base.has(v)) base.delete(v);
    else base.add(v);
    onSeleccion(base.size === valores.length ? undefined : [...base]);
  };

  const itemCls =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800";

  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <button
        ref={btnRef}
        type="button"
        onClick={abrir}
        aria-label={`Ordenar o filtrar ${label}`}
        className={cn(
          "rounded p-0.5 transition-colors",
          activo ? "text-brand" : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        )}
      >
        {dir === "asc" ? <ArrowUp size={13} /> : dir === "desc" ? <ArrowDown size={13} /> : <Filter size={12} />}
      </button>
      {open && (
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-50 w-56 rounded-lg border border-slate-200 bg-white p-1.5 font-normal text-slate-700 shadow-pop dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <button className={itemCls} onClick={() => { onSort(colKey, "asc"); setOpen(false); }}>
            <ArrowUp size={13} /> Ascendente
          </button>
          <button className={itemCls} onClick={() => { onSort(colKey, "desc"); setOpen(false); }}>
            <ArrowDown size={13} /> Descendente
          </button>
          {dir && (
            <button className={cn(itemCls, "text-slate-500")} onClick={() => { onSort(colKey, null); setOpen(false); }}>
              Quitar orden
            </button>
          )}
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <div className="relative mb-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar valor…"
              className="w-full rounded border border-slate-200 py-1 pl-6 pr-2 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <label className={cn(itemCls, "font-medium")}>
            <input
              type="checkbox"
              checked={seleccion === undefined}
              onChange={() => onSeleccion(seleccion === undefined ? [] : undefined)}
            />
            (Seleccionar todo)
          </label>
          <div className="max-h-44 overflow-y-auto">
            {visibles.map((v) => (
              <label key={v} className={itemCls}>
                <input type="checkbox" checked={marcados.has(v)} onChange={() => toggle(v)} />
                <span className="truncate">{mostrarValor(v, tipo)}</span>
              </label>
            ))}
            {visibles.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">Sin valores</p>}
          </div>
        </div>
      )}
    </span>
  );
}

const CERRADOS: EstadoOportunidad[] = [
  "ganada",
  "facturada",
  "perdida",
  "cargada_en_gbp",
  "cerrada",
];

// Índice de mes absoluto (año*12+mes) para comparar meses fácilmente.
const idxMes = (d: Date): number => d.getFullYear() * 12 + d.getMonth();

function estaVencida(o: Oportunidad): boolean {
  if (!o.fecha_limite || CERRADOS.includes(o.estado)) return false;
  return o.fecha_limite < new Date().toISOString().slice(0, 10);
}

export default function OportunidadesPage() {
  const { data: session } = useSession();
  const currentUserId = Number(session?.usuario?.id) || null;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Oportunidad | null>(null);
  const [pidiendo, setPidiendo] = useState<Oportunidad | null>(null);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [filtros, setFiltros] = useState<OportunidadFiltros>({
    estado: "",
    cliente_id: null,
    solo_mias: true,
  });
  // Buscador global + orden/filtro por columna (estilo planilla).
  const [busqueda, setBusqueda] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [colFiltros, setColFiltros] = useState<Partial<Record<ColKey, string[]>>>({});
  const onSort = (key: ColKey, dir: "asc" | "desc" | null) =>
    setSort(dir ? { key, dir } : null);
  const onSeleccion = (key: ColKey, sel: string[] | undefined) =>
    setColFiltros((prev) => {
      const next = { ...prev };
      if (sel === undefined) delete next[key];
      else next[key] = sel;
      return next;
    });

  const router = useRouter();
  const { data, isLoading, isError } = useOportunidades(filtros);
  const createMut = useCreateOportunidad();
  const deleteMut = useDeleteOportunidad();
  const crearPresupuesto = useCreatePresupuesto();

  // Abrir el seguimiento si llega ?op=ID (desde la búsqueda global).
  useEffect(() => {
    const op = new URLSearchParams(window.location.search).get("op");
    if (op) setDetalleId(Number(op));
  }, []);

  const detalle = data?.find((o) => o.id === detalleId) ?? null;

  // Mapeo por mes (según fecha de creación). Arranca en el mes actual; las
  // flechas navegan a meses anteriores. No dejamos avanzar más allá del actual.
  const hoy = new Date();
  const [mes, setMes] = useState({ y: hoy.getFullYear(), m: hoy.getMonth() });
  const cambiarMes = (delta: number) =>
    setMes(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const esMesActual = mes.y === hoy.getFullYear() && mes.m === hoy.getMonth();
  const labelMes = new Date(mes.y, mes.m, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
  // Una oportunidad "vive" en los meses desde su creación hasta su cierre (o hasta
  // hoy si sigue abierta): abierta -> se arrastra; cerrada -> queda en su mes de cierre.
  const idxSeleccionado = mes.y * 12 + mes.m;
  const idxHoy = idxMes(hoy);
  const oportunidadesDelMes = (data ?? []).filter((o) => {
    const inicio = idxMes(new Date(o.fecha_creacion));
    const fin = o.fecha_cierre ? idxMes(new Date(o.fecha_cierre)) : idxHoy;
    return inicio <= idxSeleccionado && idxSeleccionado <= fin;
  });
  // Mes de origen de una oportunidad (para el cartel "Desde …").
  const esArrastrada = (o: Oportunidad): boolean =>
    idxMes(new Date(o.fecha_creacion)) < idxSeleccionado;
  const mesOrigen = (o: Oportunidad): string =>
    new Date(o.fecha_creacion).toLocaleDateString("es-AR", { month: "long" });

  // Valores distintos por columna (para los checkboxes del filtro).
  const valoresPorColumna = useMemo(() => {
    const m = {} as Record<ColKey, string[]>;
    (Object.keys(ACCESOR) as ColKey[]).forEach((k) => {
      const set = new Set(oportunidadesDelMes.map((o) => ACCESOR[k].get(o)));
      m[k] = [...set].sort((a, b) => comparar(a, b, ACCESOR[k].tipo));
    });
    return m;
  }, [oportunidadesDelMes]);

  // Buscador global -> filtro por columnas -> orden.
  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let res = oportunidadesDelMes;
    if (q) res = res.filter((o) => CAMPOS_BUSQUEDA.some((f) => f(o).toLowerCase().includes(q)));
    const claves = Object.keys(colFiltros) as ColKey[];
    if (claves.length) {
      res = res.filter((o) => claves.every((k) => colFiltros[k]!.includes(ACCESOR[k].get(o))));
    }
    if (sort) {
      const { key, dir } = sort;
      const factor = dir === "asc" ? 1 : -1;
      res = [...res].sort(
        (a, b) => comparar(ACCESOR[key].get(a), ACCESOR[key].get(b), ACCESOR[key].tipo) * factor
      );
    }
    return res;
  }, [oportunidadesDelMes, busqueda, colFiltros, sort]);

  // Encabezado con orden/filtro para una columna.
  const th = (colKey: ColKey, label: string, extra = "") => (
    <th className={cn("px-3 py-2 font-medium", extra)}>
      <FiltroColumna
        label={label}
        colKey={colKey}
        tipo={ACCESOR[colKey].tipo}
        valores={valoresPorColumna[colKey]}
        sort={sort}
        onSort={onSort}
        seleccion={colFiltros[colKey]}
        onSeleccion={(sel) => onSeleccion(colKey, sel)}
      />
    </th>
  );

  const eliminar = (o: Oportunidad) => {
    const quien = o.cliente?.razon_social ?? `#${o.id}`;
    if (window.confirm(`¿Eliminar la oportunidad de ${quien}? Esta acción no se puede deshacer.`)) {
      deleteMut.mutate(o.id);
    }
  };

  const armarPresupuesto = (o: Oportunidad) =>
    crearPresupuesto.mutate(
      { oportunidad_id: o.id, items: [] },
      { onSuccess: (p) => router.push(`/presupuestos/${p.id}`) }
    );

  const setFiltro = (patch: Partial<OportunidadFiltros>) =>
    setFiltros((f) => ({ ...f, ...patch }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Oportunidades</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nueva oportunidad
        </Button>
      </div>

      {/* Alcance: mías / todas */}
      <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-800/60">
        {[
          { value: true, label: "Mías" },
          { value: false, label: "Todas" },
        ].map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => setFiltro({ solo_mias: opt.value })}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              Boolean(filtros.solo_mias) === opt.value
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Navegador de mes (por fecha de creación) */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => cambiarMes(-1)}
          aria-label="Mes anterior"
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-[180px] text-center">
          <div className="text-lg font-semibold capitalize text-slate-900 dark:text-slate-100">
            {labelMes}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {oportunidadesDelMes.length}{" "}
            {oportunidadesDelMes.length === 1 ? "oportunidad" : "oportunidades"}
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => cambiarMes(1)}
          disabled={esMesActual}
          aria-label="Mes siguiente"
        >
          <ChevronRight size={18} />
        </Button>
      </div>

      {/* Buscador global */}
      <div className="relative mt-4 w-full max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar oportunidad…"
          className="h-9 pl-8 pr-8 text-sm"
        />
        {busqueda && (
          <button
            type="button"
            onClick={() => setBusqueda("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isLoading && <p className="mt-4 text-slate-500 dark:text-slate-400">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-red-600">
          No se pudo cargar. ¿El backend está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {data && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <tr className="whitespace-nowrap">
                <th className="px-3 py-2 font-medium">ID</th>
                {th("cliente", "Cliente")}
                {th("cl", "CL N°")}
                {th("asunto", "Asunto")}
                {th("producto", "Producto")}
                {th("pedido", "Pedido")}
                {th("ecompra", "E/Compra")}
                {th("rcompra", "R/Compra")}
                {th("cotizado", "Cotizado")}
                {th("ecliente", "E/Cliente")}
                {th("validez", "Validez")}
                {th("ing", "Ing.")}
                {th("estado", "Estado")}
                {th("observacion", "Observación")}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td
                    className="cursor-pointer whitespace-nowrap px-3 py-2 font-medium text-slate-500 hover:text-brand dark:text-slate-400"
                    onClick={() => setDetalleId(o.id)}
                  >
                    <span className="inline-flex items-center gap-1.5 leading-none">
                      {/* Slot fijo para el punto: así los números arrancan siempre alineados. */}
                      <span className="flex h-1.5 w-1.5 shrink-0 items-center justify-center">
                        {!CERRADOS.includes(o.estado) && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-red-500"
                            title="Sin cerrar"
                            aria-label="Sin cerrar"
                          />
                        )}
                      </span>
                      <span className="leading-none">#{o.id}</span>
                    </span>
                  </td>
                  <td
                    className="cursor-pointer px-3 py-2 font-medium text-slate-800 hover:text-brand dark:text-slate-100"
                    onClick={() => setDetalleId(o.id)}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{o.cliente?.razon_social ?? "—"}</span>
                      {esArrastrada(o) && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium capitalize text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Desde {mesOrigen(o)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                    {o.cliente?.numero_cliente ?? "—"}
                  </td>
                  <td
                    className="max-w-[16rem] cursor-pointer truncate px-3 py-2 text-slate-600 dark:text-slate-300"
                    onClick={() => setDetalleId(o.id)}
                  >
                    {o.asunto ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                    {o.producto ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">
                    {o.numero_pedido ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">
                    {fmtDate(o.fecha_enviado_compras)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">
                    {fmtDate(o.fecha_respuesta_compras)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {estaCotizada(o) ? (
                      <Check size={16} className="mx-auto text-green-600" aria-label="Cotizado" />
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">
                    {fmtDate(o.fecha_enviado_cliente)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={estaVencida(o) ? "font-semibold text-red-600" : "text-slate-500 dark:text-slate-400"}>
                      {fmtDate(o.fecha_limite)}
                      {estaVencida(o) ? " (vencida)" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex h-6 w-9 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      title={o.vendedor?.nombre ?? "Sin asignar"}
                    >
                      {iniciales(o.vendedor?.nombre)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={ESTADO_META[o.estado].color}>{ESTADO_META[o.estado].label}</Badge>
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2 text-slate-500 dark:text-slate-400" title={o.observacion ?? ""}>
                    {o.observacion ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end">
                      <Tooltip label="Seguimiento">
                        <Button variant="ghost" size="icon" onClick={() => setDetalleId(o.id)} aria-label="Seguimiento" className="text-slate-400 hover:text-brand dark:text-slate-500">
                          <MessageSquare size={15} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Pedir a Compras">
                        <Button variant="ghost" size="icon" onClick={() => setPidiendo(o)} aria-label="Pedir a Compras" className="text-slate-400 hover:text-brand dark:text-slate-500">
                          <ClipboardList size={15} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Armar presupuesto">
                        <Button variant="ghost" size="icon" onClick={() => armarPresupuesto(o)} disabled={crearPresupuesto.isPending} aria-label="Armar presupuesto" className="text-slate-400 hover:text-brand dark:text-slate-500">
                          <FileText size={15} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Editar">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(o)} aria-label="Editar">
                          <Pencil size={15} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Eliminar">
                        <Button variant="ghost" size="icon" onClick={() => eliminar(o)} disabled={deleteMut.isPending} aria-label="Eliminar" className="text-slate-400 hover:text-red-600 dark:text-slate-500">
                          <Trash2 size={15} />
                        </Button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                    {oportunidadesDelMes.length === 0 ? (
                      <>No hay oportunidades en <span className="capitalize">{labelMes}</span>.</>
                    ) : (
                      "No hay oportunidades que coincidan con la búsqueda o los filtros."
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva oportunidad">
        <OportunidadForm
          defaultVendedorId={currentUserId}
          isPending={createMut.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => createMut.mutate(values, { onSuccess: () => setCreating(false) })}
        />
      </Modal>

      {editing && <EditOportunidadModal oportunidad={editing} onClose={() => setEditing(null)} />}
      {pidiendo && <PedirComprasModal oportunidad={pidiendo} onClose={() => setPidiendo(null)} />}
      {detalle && <SeguimientoModal oportunidad={detalle} onClose={() => setDetalleId(null)} />}
    </div>
  );
}

// Centro de seguimiento: fechas clave + bitácora de comentarios.
function SeguimientoModal({
  oportunidad,
  onClose,
}: {
  oportunidad: Oportunidad;
  onClose: () => void;
}) {
  const comentarioMut = useAgregarComentario(oportunidad.id);
  const [texto, setTexto] = useState("");

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    comentarioMut.mutate(texto.trim(), { onSuccess: () => setTexto("") });
  };

  const cliente = oportunidad.cliente?.razon_social ?? `#${oportunidad.id}`;
  const comentarios = [...oportunidad.comentarios].reverse();

  return (
    <Modal open onClose={onClose} title={`Seguimiento — ${cliente}`}>
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge className={ESTADO_META[oportunidad.estado].color}>
              {ESTADO_META[oportunidad.estado].label}
            </Badge>
            {oportunidad.valor_estimado != null && (
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {fmtMonto(oportunidad.valor_estimado, "USD")}
              </span>
            )}
          </div>
          {oportunidad.asunto && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{oportunidad.asunto}</p>
          )}
        </div>

        {/* Línea de tiempo de fechas clave */}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/40">
          <Fecha label="Pedido del cliente" value={oportunidad.fecha_pedido_cliente} />
          <Fecha label="Enviado a Compras" value={oportunidad.fecha_enviado_compras} />
          <Fecha label="Enviado al cliente" value={oportunidad.fecha_enviado_cliente} />
          <Fecha label="Validez / límite" value={oportunidad.fecha_limite} alerta={estaVencida(oportunidad)} />
        </div>

        {/* Bitácora */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Bitácora de seguimiento</p>
          <form onSubmit={agregar} className="mb-3 flex items-start gap-2">
            <Textarea
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Anotá una llamada, un avance, una respuesta del cliente…"
            />
            <Button type="submit" size="sm" disabled={comentarioMut.isPending || !texto.trim()}>
              <Send size={14} />
            </Button>
          </form>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {comentarios.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
                Sin anotaciones todavía.
              </p>
            ) : (
              comentarios.map((c, i) => (
                <div
                  key={i}
                  className="rounded-md border border-slate-200 bg-white p-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="mb-0.5 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                    <span>{c.autor ?? "—"}</span>
                    <span>{new Date(c.fecha).toLocaleString("es-AR")}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{c.texto}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Fecha({ label, value, alerta }: { label: string; value: string | null; alerta?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-400 dark:text-slate-500">{label}</div>
      <div className={alerta ? "font-semibold text-red-600" : "text-slate-700 dark:text-slate-200"}>
        {fmtDate(value)}
        {alerta ? " (vencida)" : ""}
      </div>
    </div>
  );
}

function PedirComprasModal({ oportunidad, onClose }: { oportunidad: Oportunidad; onClose: () => void }) {
  const router = useRouter();
  const { data: sugerencia, isLoading } = useSugerenciaCompras(oportunidad.id);
  const crearYEnviar = useCrearYEnviarSolicitud();
  const cliente = oportunidad.cliente?.razon_social ?? `#${oportunidad.id}`;

  return (
    <Modal open onClose={onClose} title={`Pedir a Compras — ${cliente}`}>
      {isLoading ? (
        <p className="text-slate-500 dark:text-slate-400">Cargando sugerencia…</p>
      ) : (
        <div className="space-y-3">
          <SolicitudForm
            isPending={crearYEnviar.isPending}
            submitLabel="Enviar a Compras"
            pendingLabel="Enviando a Compras…"
            defaultOportunidadId={oportunidad.id}
            defaultRequerimiento={sugerencia?.requerimiento ?? ""}
            lockOportunidad
            onCancel={onClose}
            onSubmit={(values, files) =>
              crearYEnviar.mutate(
                { body: values, files },
                {
                  onSuccess: () => {
                    onClose();
                    router.push("/solicitudes");
                  },
                }
              )
            }
          />
          {crearYEnviar.isError && (
            <p className="text-sm text-red-600">
              {errorMessage(
                crearYEnviar.error,
                "La solicitud se creó pero no se pudo enviar a Compras. Reintentá el envío desde Solicitudes.",
              )}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function EditOportunidadModal({ oportunidad, onClose }: { oportunidad: Oportunidad; onClose: () => void }) {
  const updateMut = useUpdateOportunidad(oportunidad.id);
  const handleSubmit = (values: OportunidadCreate) => updateMut.mutate(values, { onSuccess: onClose });

  return (
    <Modal open onClose={onClose} title={`Editar oportunidad #${oportunidad.id}`}>
      <OportunidadForm
        initial={oportunidad}
        isPending={updateMut.isPending}
        onCancel={onClose}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
}
