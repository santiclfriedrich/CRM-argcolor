"use client";

import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  Filter,
  Inbox,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { OportunidadForm } from "@/components/oportunidades/oportunidad-form";
import { SolicitudForm } from "@/components/solicitudes/solicitud-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  ESTADO_META,
  subirAdjuntosOportunidad,
  useAdjuntosCompras,
  useBulkDeleteOportunidades,
  useCreateOportunidad,
  useDeleteOportunidad,
  useOportunidades,
  usePropuestas,
  useResolverPropuesta,
  useResolverTransferencia,
  useSetIng,
  useSugerenciaCompras,
  useToggleCargadaGbp,
  useTransferenciasPendientes,
  useTransferirOportunidad,
  useUpdateOportunidad,
} from "@/lib/oportunidades";
import { clearDraft, DRAFT_OPORTUNIDAD } from "@/lib/draft";
import { descargarAdjuntoMail } from "@/lib/mails";
import { useCreatePresupuesto } from "@/lib/presupuestos";
import { useCrearYEnviarSolicitud } from "@/lib/solicitudes";
import { useUsuarios } from "@/lib/usuarios";
import type {
  EstadoOportunidad,
  Oportunidad,
  OportunidadCreate,
  OportunidadFiltros,
  Propuesta,
} from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";

// "2026-08-01" -> "01/08/26" (compacto para la tabla; sin líos de zona horaria).
function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

// Columna "Ing.": iniciales del ingeniero/vendedor asignado, editable inline
// (texto libre corto por ahora). Guarda al salir del campo, con update optimista.
function IngInput({ o }: { o: Oportunidad }) {
  const set = useSetIng();
  const [val, setVal] = useState(o.ing ?? "");
  useEffect(() => setVal(o.ing ?? ""), [o.ing]);

  const guardar = () => {
    const v = val.trim();
    if (v !== (o.ing ?? "")) set.mutate({ id: o.id, ing: v || null });
  };

  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value.toUpperCase().slice(0, 5))}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onClick={(e) => e.stopPropagation()}
      placeholder="—"
      aria-label="Ing. asignado"
      className="w-12 rounded bg-surface2 px-1 py-0.5 text-center text-xs font-semibold text-ink placeholder:font-normal placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-accent"
    />
  );
}

// "Cotizado" = ya se armó/envió la cotización al cliente.
const ESTADOS_COTIZADOS: EstadoOportunidad[] = [
  "presupuestada",
  "confirmada",
  "ganada",
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
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface2";

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
          activo ? "text-accent" : "text-ink-3 hover:text-ink"
        )}
      >
        {dir === "asc" ? <ArrowUp size={13} /> : dir === "desc" ? <ArrowDown size={13} /> : <Filter size={12} />}
      </button>
      {open && (
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-50 w-56 rounded-lg border border-line bg-surface p-1.5 font-normal text-ink shadow-pop"
        >
          <button className={itemCls} onClick={() => { onSort(colKey, "asc"); setOpen(false); }}>
            <ArrowUp size={13} /> Ascendente
          </button>
          <button className={itemCls} onClick={() => { onSort(colKey, "desc"); setOpen(false); }}>
            <ArrowDown size={13} /> Descendente
          </button>
          {dir && (
            <button className={cn(itemCls, "text-ink-2")} onClick={() => { onSort(colKey, null); setOpen(false); }}>
              Quitar orden
            </button>
          )}
          <div className="my-1 border-t border-line" />
          <div className="relative mb-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar valor…"
              className="w-full rounded border border-line py-1 pl-6 pr-2 text-xs bg-surface2"
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
            {visibles.length === 0 && <p className="px-2 py-1 text-xs text-ink-3">Sin valores</p>}
          </div>
        </div>
      )}
    </span>
  );
}

const CERRADOS: EstadoOportunidad[] = ["ganada", "perdida"];

// Punto de estado junto al #id:
//   rojo    = sin cerrar (default)
//   amarillo = confirmada / pendiente
//   verde   = pagada ("ganada")
//   sin punto = perdida ("No avanzó")
function PuntoEstado({ estado }: { estado: EstadoOportunidad }) {
  let color: string | null = "bg-red-500";
  let title = "Sin cerrar";
  if (estado === "ganada") {
    color = "bg-green-500";
    title = "Pago";
  } else if (estado === "confirmada") {
    color = "bg-yellow-500";
    title = "Confirmada / pendiente";
  } else if (estado === "perdida") {
    color = null;
  }
  if (!color) return null;
  return (
    <span className={`h-1.5 w-1.5 rounded-full ${color}`} title={title} aria-label={title} />
  );
}

// Índice de mes absoluto (año*12+mes) para comparar meses fácilmente.
const idxMes = (d: Date): number => d.getFullYear() * 12 + d.getMonth();

function estaVencida(o: Oportunidad): boolean {
  if (!o.fecha_limite || CERRADOS.includes(o.estado)) return false;
  return o.fecha_limite < new Date().toISOString().slice(0, 10);
}

// Menú de acciones de la fila (reemplaza los íconos sueltos). Se posiciona con
// `fixed` para no quedar recortado por el scroll horizontal de la tabla.
// Menú de acciones de una fila: aparece donde se hace clic sobre la fila.
function RowMenu({
  o,
  x,
  y,
  onClose,
  onVerDetalle,
  onModificar,
  onPedir,
  onPresupuesto,
  onTransferir,
  onEliminar,
  presupuestoPending,
}: {
  o: Oportunidad;
  x: number;
  y: number;
  onClose: () => void;
  onVerDetalle: () => void;
  onModificar: () => void;
  onPedir: () => void;
  onPresupuesto: () => void;
  onTransferir: () => void;
  onEliminar: () => void;
  presupuestoPending: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    // Diferido para no capturar el mismo clic que abrió el menú.
    const t = window.setTimeout(() => document.addEventListener("mousedown", cerrar), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const W = 208;
  const H = 290;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.max(8, Math.min(x, vw - W - 8));
  const top = Math.max(8, Math.min(y, vh - H - 8));

  const item = (
    label: string,
    fn: () => void,
    icon: ReactNode,
    opts?: { danger?: boolean; disabled?: boolean },
  ) => (
    <button
      type="button"
      disabled={opts?.disabled}
      onClick={() => {
        onClose();
        fn();
      }}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2 disabled:opacity-50",
        opts?.danger ? "text-red-600" : "text-ink",
      )}
    >
      {icon} {label}
    </button>
  );

  return (
    <div
      ref={panelRef}
      style={{ position: "fixed", top, left, width: W }}
      className="z-50 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-pop"
    >
      <div className="truncate border-b border-line px-3 py-1.5 text-xs font-semibold text-ink-3">
        {o.cliente?.razon_social ?? `#${o.id}`}
      </div>
      {item("Ver detalle", onVerDetalle, <Eye size={14} />)}
      {item("Pedir a Compras", onPedir, <ClipboardList size={14} />)}
      {item("Crear presupuesto", onPresupuesto, <FileText size={14} />, {
        disabled: presupuestoPending,
      })}
      {item("Modificar", onModificar, <Pencil size={14} />)}
      {item("Transferir a…", onTransferir, <ArrowRightLeft size={14} />)}
      <div className="my-1 border-t border-line" />
      {item("Eliminar", onEliminar, <Trash2 size={14} />, { danger: true })}
    </div>
  );
}

export default function OportunidadesPage() {
  const { data: session } = useSession();
  const currentUserId = Number(session?.usuario?.id) || null;
  const rol = (session?.usuario as { rol?: string } | undefined)?.rol;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Oportunidad | null>(null);
  const [pidiendo, setPidiendo] = useState<Oportunidad | null>(null);
  const [transfiriendo, setTransfiriendo] = useState<Oportunidad | null>(null);
  // Menú de acciones que aparece al clickear una fila (posición del cursor).
  const [menu, setMenu] = useState<{ o: Oportunidad; x: number; y: number } | null>(null);
  const [filtros, setFiltros] = useState<OportunidadFiltros>({
    estado: "",
    cliente_id: null,
    solo_mias: rol === "vendedor",
  });
  // Default por rol: el toggle arranca en "Mías" para vendedor y "Todas" para
  // admin/compras. Como `rol` puede llegar undefined en el primer render, lo
  // ajustamos una sola vez cuando la sesión carga, sin pisar un cambio manual.
  const defaultToggleAplicado = useRef(false);
  useEffect(() => {
    if (!rol || defaultToggleAplicado.current) return;
    defaultToggleAplicado.current = true;
    setFiltros((f) => ({ ...f, solo_mias: rol === "vendedor" }));
  }, [rol]);
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
  const bulkDelete = useBulkDeleteOportunidades();
  const crearPresupuesto = useCreatePresupuesto();
  const toggleGbp = useToggleCargadaGbp();
  const confirm = useConfirm();

  // Selección múltiple para borrado en conjunto.
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const toggleSel = (id: number) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Links viejos con ?op=ID redirigen a la página de detalle.
  useEffect(() => {
    const op = new URLSearchParams(window.location.search).get("op");
    if (op) router.replace(`/oportunidades/${op}`);
  }, [router]);

  // Período: por mes (default), por rango de fechas, o acumulado (todos).
  const hoy = new Date();
  const [mes, setMes] = useState({ y: hoy.getFullYear(), m: hoy.getMonth() });
  const [periodoModo, setPeriodoModo] = useState<"mes" | "rango" | "todos">("mes");
  const [rango, setRango] = useState({ desde: "", hasta: "" });
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
  const idxSeleccionado = mes.y * 12 + mes.m;
  const idxHoy = idxMes(hoy);

  // Una oportunidad "vive" desde su creación hasta su cierre (o hasta hoy si sigue
  // abierta): abierta se arrastra; cerrada queda en su mes de cierre. Según el
  // período elegido mostramos si "vive" en ese mes / rango / o todo el acumulado.
  const enPeriodo = (o: Oportunidad): boolean => {
    if (periodoModo === "todos") return true;
    const creada = new Date(o.fecha_creacion);
    const fin = o.fecha_cierre ? new Date(o.fecha_cierre) : hoy;
    if (periodoModo === "rango") {
      const desde = rango.desde ? new Date(rango.desde + "T00:00:00") : null;
      const hasta = rango.hasta ? new Date(rango.hasta + "T23:59:59") : null;
      if (desde && fin < desde) return false;
      if (hasta && creada > hasta) return false;
      return true;
    }
    const finIdx = o.fecha_cierre ? idxMes(new Date(o.fecha_cierre)) : idxHoy;
    return idxMes(creada) <= idxSeleccionado && idxSeleccionado <= finIdx;
  };
  const oportunidadesDelMes = (data ?? []).filter(enPeriodo);

  // Cartel "Desde <mes>": solo tiene sentido navegando por mes.
  const esArrastrada = (o: Oportunidad): boolean =>
    periodoModo === "mes" && idxMes(new Date(o.fecha_creacion)) < idxSeleccionado;
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
    } else {
      // Orden por llegada: la más antigua arriba y la más nueva abajo (se cargan
      // "desde abajo", no como una pila). El backend las trae id desc.
      res = [...res].sort((a, b) => a.id - b.id);
    }
    return res;
  }, [oportunidadesDelMes, busqueda, colFiltros, sort]);

  // Selección múltiple (sobre las filas visibles).
  const idsVisibles = filas.map((o) => o.id);
  const todosSel = idsVisibles.length > 0 && idsVisibles.every((id) => seleccion.has(id));
  const toggleTodos = () =>
    setSeleccion((prev) => {
      if (idsVisibles.length && idsVisibles.every((id) => prev.has(id))) {
        const next = new Set(prev);
        idsVisibles.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...idsVisibles]);
    });
  const eliminarSeleccionadas = async () => {
    const ids = [...seleccion];
    if (!ids.length) return;
    if (
      await confirm({
        title: "Eliminar oportunidades",
        message: `¿Eliminar ${ids.length} oportunidad(es) y todo lo relacionado (mails, solicitudes, presupuestos)? No se puede deshacer.`,
        danger: true,
      })
    ) {
      bulkDelete.mutate(ids);
      setSeleccion(new Set());
    }
  };

  // Encabezado con orden/filtro para una columna.
  const th = (colKey: ColKey, label: string, extra = "") => (
    <th className={cn("px-2 py-1.5 font-medium", extra)}>
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

  const eliminar = async (o: Oportunidad) => {
    const quien = o.cliente?.razon_social ?? `#${o.id}`;
    if (
      await confirm({
        title: "Eliminar oportunidad",
        message: `¿Eliminar la oportunidad de ${quien}? Esta acción no se puede deshacer.`,
        danger: true,
      })
    ) {
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Oportunidades</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nueva oportunidad
        </Button>
      </div>

      {/* Controles: Mías/Todas a la izquierda; período centrado. */}
      <div className="relative mt-3 flex flex-wrap items-center justify-center gap-3">
        {/* Mías / Todas (pegado a la izquierda en pantallas grandes) */}
        <div className="inline-flex rounded-lg border border-line bg-surface2 p-0.5 sm:absolute sm:left-0 sm:top-1/2 sm:-translate-y-1/2">
          {[
            { value: true, label: "Mías" },
            { value: false, label: "Todas" },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setFiltro({ solo_mias: opt.value })}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                Boolean(filtros.solo_mias) === opt.value
                  ? "bg-navy text-white"
                  : "text-ink-2 hover:bg-surface",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Período: Mes / Rango / Todos */}
        <div className="inline-flex rounded-lg border border-line bg-surface2 p-0.5">
          {[
            { value: "mes", label: "Mes" },
            { value: "rango", label: "Rango" },
            { value: "todos", label: "Todos" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriodoModo(opt.value as "mes" | "rango" | "todos")}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                periodoModo === opt.value
                  ? "bg-navy text-white"
                  : "text-ink-2 hover:bg-surface",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Detalle del período según el modo */}
        {periodoModo === "mes" && (
          <div className="inline-flex items-center rounded-lg border border-line bg-surface2 p-0.5">
            <button
              type="button"
              onClick={() => cambiarMes(-1)}
              aria-label="Mes anterior"
              className="rounded-md p-1.5 text-ink-2 transition-colors hover:bg-surface hover:text-ink"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[130px] px-1 text-center text-sm font-semibold capitalize text-ink">
              {labelMes}
            </span>
            <button
              type="button"
              onClick={() => cambiarMes(1)}
              disabled={esMesActual}
              aria-label="Mes siguiente"
              className="rounded-md p-1.5 text-ink-2 transition-colors hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        {periodoModo === "rango" && (
          <div className="inline-flex items-center gap-2 text-sm text-ink-2">
            <Input
              type="date"
              value={rango.desde}
              onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
              className="h-9 w-auto"
            />
            <span>a</span>
            <Input
              type="date"
              value={rango.hasta}
              onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
              className="h-9 w-auto"
            />
          </div>
        )}

        <span className="text-xs text-ink-2">
          {oportunidadesDelMes.length}{" "}
          {oportunidadesDelMes.length === 1 ? "oportunidad" : "oportunidades"}
        </span>

        {/* Propuestas + transferencias pendientes (pegado a la derecha). */}
        <div className="flex items-center gap-2 sm:absolute sm:right-0 sm:top-1/2 sm:-translate-y-1/2">
          <PropuestasIndicator />
          <TransferenciasPendientes />
        </div>
      </div>

      {/* Buscador global */}
      <div className="relative mt-4 w-full max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
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
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-3 hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isLoading && <p className="mt-4 text-ink-2">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-red-600">
          No se pudo cargar. ¿El backend está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {seleccion.size > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-accent bg-accent-dim px-3 py-2 text-sm">
          <span className="font-medium text-ink">{seleccion.size} seleccionada(s)</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSeleccion(new Set())}
            className="ml-auto"
          >
            Deseleccionar
          </Button>
          <Button
            size="sm"
            onClick={eliminarSeleccionadas}
            disabled={bulkDelete.isPending}
            className="border-red-500 bg-red-500 text-white hover:bg-red-600"
          >
            <Trash2 size={14} /> Eliminar ({seleccion.size})
          </Button>
        </div>
      )}

      {data && (
        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:border-b [&_thead_th]:border-line [&_thead_th]:bg-surface2">
            <thead className="bg-surface2 text-left text-ink-2">
              <tr className="whitespace-nowrap">
                <th className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={todosSel}
                    onChange={toggleTodos}
                    aria-label="Seleccionar todas"
                    className="h-4 w-4 rounded border-line accent-navy align-middle"
                  />
                </th>
                <th className="px-2 py-1.5 font-medium">ID</th>
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
                <th className="px-2 py-1.5 text-center font-medium">GBP</th>
                {th("observacion", "Observación")}
              </tr>
            </thead>
            <tbody>
              {filas.map((o) => (
                <tr
                  key={o.id}
                  onClick={(e) => setMenu({ o, x: e.clientX, y: e.clientY })}
                  className="cursor-pointer border-t border-line hover:bg-surface2"
                >
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={seleccion.has(o.id)}
                      onChange={() => toggleSel(o.id)}
                      aria-label={`Seleccionar #${o.id}`}
                      className="h-4 w-4 rounded border-line accent-navy align-middle"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium text-ink-2">
                    <span className="inline-flex items-center gap-1.5 leading-none">
                      {/* Slot fijo para el punto: así los números arrancan siempre alineados. */}
                      <span className="flex h-1.5 w-1.5 shrink-0 items-center justify-center">
                        <PuntoEstado estado={o.estado} />
                      </span>
                      <span className="leading-none">#{o.id}</span>
                    </span>
                  </td>
                  <td className="max-w-[12rem] px-2 py-1.5 font-medium text-ink">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate" title={o.cliente?.razon_social ?? ""}>
                        {o.cliente?.razon_social ?? "—"}
                      </span>
                      {esArrastrada(o) && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Desde {mesOrigen(o)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-ink-2">
                    {o.cliente?.numero_cliente ?? "—"}
                  </td>
                  <td className="max-w-[11rem] truncate px-2 py-1.5 text-ink-2" title={o.asunto ?? ""}>
                    {o.asunto ?? "—"}
                  </td>
                  <td className="max-w-[8rem] truncate px-2 py-1.5 text-ink-2" title={o.producto ?? ""}>
                    {o.producto ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">
                    {o.numero_pedido ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">
                    {fmtDate(o.fecha_enviado_compras)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">
                    {fmtDate(o.fecha_respuesta_compras)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {estaCotizada(o) ? (
                      <Check size={16} className="mx-auto text-green-600" aria-label="Cotizado" />
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">
                    {fmtDate(o.fecha_enviado_cliente)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <span
                      className={
                        o.estado === "confirmada" && o.fecha_limite
                          ? "font-semibold text-yellow-600"
                          : estaVencida(o)
                          ? "font-semibold text-red-600"
                          : "text-ink-2"
                      }
                    >
                      {fmtDate(o.fecha_limite)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <IngInput o={o} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge className={ESTADO_META[o.estado].color}>{ESTADO_META[o.estado].label}</Badge>
                  </td>
                  <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={o.cargada_en_gbp}
                      onChange={(e) => toggleGbp.mutate({ id: o.id, valor: e.target.checked })}
                      aria-label="Cargada en GBP"
                      title="Cargada en GBP"
                      className="h-4 w-4 rounded border-line accent-navy"
                    />
                  </td>
                  <td className="max-w-[10rem] truncate px-2 py-1.5 text-ink-2" title={o.observacion ?? ""}>
                    {o.observacion ?? "—"}
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-4 py-6 text-center text-ink-3">
                    {oportunidadesDelMes.length > 0
                      ? "No hay oportunidades que coincidan con la búsqueda o los filtros."
                      : periodoModo === "mes"
                        ? <>No hay oportunidades en <span className="capitalize">{labelMes}</span>.</>
                        : periodoModo === "rango"
                          ? "No hay oportunidades en el rango elegido."
                          : "No hay oportunidades."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva oportunidad" size="4xl">
        <OportunidadForm
          defaultVendedorId={currentUserId}
          isPending={createMut.isPending}
          draftKey={DRAFT_OPORTUNIDAD}
          onCancel={() => {
            clearDraft(DRAFT_OPORTUNIDAD);
            setCreating(false);
          }}
          onSubmit={(values, files) =>
            createMut.mutate(values, {
              onSuccess: async (nueva) => {
                try {
                  await subirAdjuntosOportunidad(nueva.id, files);
                } catch {
                  /* la oportunidad se creó igual; los adjuntos se pueden
                     reintentar desde el detalle */
                }
                clearDraft(DRAFT_OPORTUNIDAD);
                setCreating(false);
              },
            })
          }
        />
      </Modal>

      {editing && <EditOportunidadModal oportunidad={editing} onClose={() => setEditing(null)} />}
      {pidiendo && <PedirComprasModal oportunidad={pidiendo} onClose={() => setPidiendo(null)} />}
      {transfiriendo && (
        <TransferirModal oportunidad={transfiriendo} onClose={() => setTransfiriendo(null)} />
      )}

      {menu && (
        <RowMenu
          o={menu.o}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onVerDetalle={() => router.push(`/oportunidades/${menu.o.id}`)}
          onModificar={() => setEditing(menu.o)}
          onPedir={() => setPidiendo(menu.o)}
          onPresupuesto={() => armarPresupuesto(menu.o)}
          onTransferir={() => setTransfiriendo(menu.o)}
          onEliminar={() => eliminar(menu.o)}
          presupuestoPending={crearPresupuesto.isPending}
        />
      )}
    </div>
  );
}

function PedirComprasModal({ oportunidad, onClose }: { oportunidad: Oportunidad; onClose: () => void }) {
  const router = useRouter();
  const { data: sugerencia, isLoading } = useSugerenciaCompras(oportunidad.id);
  const { data: adjuntosOp } = useAdjuntosCompras(oportunidad.id);
  const crearYEnviar = useCrearYEnviarSolicitud();
  const cliente = oportunidad.cliente?.razon_social ?? `#${oportunidad.id}`;

  // Refs de adjuntos de la oportunidad que se van a incluir (por defecto todos).
  // Se llena al llegar la lista; una "x" saca los que no quiera adjuntar.
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const incluidos = (adjuntosOp ?? []).filter((a) => !excluidos.has(a.ref));

  return (
    <Modal open onClose={onClose} title={`Pedir a Compras — ${cliente}`} size="3xl">
      {isLoading ? (
        <p className="text-ink-2">Cargando sugerencia…</p>
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
            adjuntosExtra={
              incluidos.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {incluidos.map((a) => (
                    <li
                      key={a.ref}
                      className="flex items-center gap-2 rounded-md bg-surface2 px-2.5 py-1 text-xs text-ink-2"
                    >
                      <Paperclip size={12} className="shrink-0 text-ink-3" />
                      <span className="truncate">{a.filename}</span>
                      <button
                        type="button"
                        onClick={() => setExcluidos((s) => new Set(s).add(a.ref))}
                        aria-label={`Quitar ${a.filename}`}
                        title="No adjuntar este archivo"
                        className="ml-auto shrink-0 text-ink-3 transition-colors hover:text-red-600"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null
            }
            onSubmit={(values, files) =>
              crearYEnviar.mutate(
                { body: { ...values, adjuntos_oportunidad: incluidos.map((a) => a.ref) }, files },
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
  const handleSubmit = (values: OportunidadCreate, files: File[]) =>
    updateMut.mutate(values, {
      onSuccess: async () => {
        try {
          await subirAdjuntosOportunidad(oportunidad.id, files);
        } catch {
          /* los adjuntos se pueden reintentar desde el detalle */
        }
        onClose();
      },
    });

  return (
    <Modal open onClose={onClose} title={`Editar oportunidad #${oportunidad.id}`} size="4xl">
      <OportunidadForm
        initial={oportunidad}
        isPending={updateMut.isPending}
        onCancel={onClose}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
}

// Modal para transferir una oportunidad a otro vendedor registrado.
function TransferirModal({
  oportunidad,
  onClose,
}: {
  oportunidad: Oportunidad;
  onClose: () => void;
}) {
  const { data: usuarios } = useUsuarios();
  const transferir = useTransferirOportunidad();
  const [sel, setSel] = useState<number | null>(null);
  const cliente = oportunidad.cliente?.razon_social ?? `#${oportunidad.id}`;
  const candidatos = (usuarios ?? []).filter(
    (u) => u.activo && u.id !== oportunidad.vendedor_id,
  );

  const enviar = () => {
    if (!sel) return;
    transferir.mutate({ id: oportunidad.id, aUsuarioId: sel }, { onSuccess: onClose });
  };

  return (
    <Modal open onClose={onClose} title={`Transferir oportunidad — ${cliente}`} size="lg">
      <p className="text-sm text-ink-2">
        Elegí a quién transferírsela. Le va a llegar como pendiente y podrá aceptarla o
        rechazarla; mientras tanto sale de tus “Mías”.
      </p>
      <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {candidatos.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setSel(u.id)}
            className={cn(
              "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
              sel === u.id
                ? "border-navy bg-surface2 text-ink"
                : "border-line text-ink-2 hover:bg-surface2",
            )}
          >
            <span>{u.nombre}</span>
            {sel === u.id && <Check size={15} className="text-navy" />}
          </button>
        ))}
        {candidatos.length === 0 && (
          <p className="text-sm text-ink-3">No hay otros usuarios disponibles.</p>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={enviar} disabled={!sel || transferir.isPending}>
          {transferir.isPending ? "Transfiriendo…" : "Transferir"}
        </Button>
      </div>
    </Modal>
  );
}

// Indicador (toolbar) de oportunidades que otro me transfirió: aceptar/rechazar.
// Indicador (toolbar) de oportunidades PROPUESTAS por mail auto-ingestado, para
// revisarlas (ver mail + requerimiento) y aceptar o descartar.
function PropuestasIndicator() {
  const { data } = usePropuestas();
  const [abierto, setAbierto] = useState(false);
  const propuestas = data ?? [];
  if (propuestas.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface2 px-3 py-1 text-sm font-medium text-ink hover:bg-surface"
      >
        Propuestas
        <span className="ml-0.5 rounded-full bg-navy px-1.5 text-xs font-semibold text-white">
          {propuestas.length}
        </span>
      </button>
      {abierto && <PropuestasModal onClose={() => setAbierto(false)} />}
    </>
  );
}

function PropuestasModal({ onClose }: { onClose: () => void }) {
  const { data } = usePropuestas();
  const resolver = useResolverPropuesta();
  const { data: session } = useSession();
  const currentUserId = Number(session?.usuario?.id) || null;
  const [filtro, setFiltro] = useState<"mias" | "todos">("mias");

  const todas = data ?? [];
  const mias = todas.filter((p) => p.vendedor_id === currentUserId);
  const propuestas = filtro === "mias" ? mias : todas;

  return (
    <Modal open onClose={onClose} title="Propuestas de oportunidad" size="6xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          Mails que entraron y proponen una oportunidad. Revisá y aceptá para sumarla a
          Oportunidades, o descartala.
        </p>
        <div className="inline-flex shrink-0 rounded-lg border border-line bg-surface2 p-0.5 text-sm">
          {(["mias", "todos"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                filtro === f ? "bg-navy text-white" : "text-ink-2 hover:bg-surface",
              )}
            >
              {f === "mias" ? `Mías (${mias.length})` : `Todos (${todas.length})`}
            </button>
          ))}
        </div>
      </div>
      {propuestas.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">
          {filtro === "mias"
            ? "No tenés propuestas en tu casilla. Cambiá a “Todos” para ver las del equipo."
            : "No hay propuestas pendientes."}
        </p>
      ) : (
        <div className="space-y-4">
          {propuestas.map((p) => (
            <PropuestaCard key={p.id} p={p} resolver={resolver} />
          ))}
        </div>
      )}
    </Modal>
  );
}

function PropuestaCard({
  p,
  resolver,
}: {
  p: Propuesta;
  resolver: ReturnType<typeof useResolverPropuesta>;
}) {
  const [verMail, setVerMail] = useState(false);

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{p.cliente ?? "Cliente por identificar"}</p>
          <p className="truncate text-sm text-ink-2">{p.asunto ?? "(sin asunto)"}</p>
          <p className="mt-0.5 text-xs text-ink-3">De: {p.mail_de ?? "—"}</p>
          {p.recibido_en && (
            <p className="text-xs text-ink-3">
              Recibido en <span className="text-ink-2">{p.recibido_en}</span>
            </p>
          )}
          {p.mail_fecha && (
            <p className="text-xs text-ink-3">
              {new Date(p.mail_fecha).toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="icon"
            title="Aceptar"
            aria-label="Aceptar"
            onClick={() => resolver.mutate({ id: p.id, accion: "aceptar" })}
            disabled={resolver.isPending}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            <Check size={16} />
          </Button>
          <Button
            size="icon"
            title="Rechazar"
            aria-label="Rechazar"
            onClick={() => resolver.mutate({ id: p.id, accion: "rechazar" })}
            disabled={resolver.isPending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            <X size={16} />
          </Button>
        </div>
      </div>
      {p.requerimiento && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Requerimiento
          </p>
          <p className="whitespace-pre-wrap rounded-md bg-surface2 p-2.5 text-sm text-ink">
            {p.requerimiento}
          </p>
        </div>
      )}
      {p.mail_cuerpo && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setVerMail((v) => !v)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {verMail ? "Ocultar mail original" : "Ver mail original"}
          </button>
          {verMail && (
            <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-surface2 p-2.5 font-mono text-xs text-ink-2">
              {p.mail_cuerpo}
            </pre>
          )}
        </div>
      )}
      {p.adjuntos.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Adjuntos
          </p>
          <div className="flex flex-wrap gap-1.5">
            {p.adjuntos.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => descargarAdjuntoMail(a.id, a.nombre)}
                title={`Descargar ${a.nombre}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-surface2 px-2.5 py-1 text-xs text-ink hover:bg-surface3"
              >
                <Paperclip size={12} className="shrink-0 text-ink-3" />
                <span className="truncate">{a.nombre}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TransferenciasPendientes() {
  const { data } = useTransferenciasPendientes();
  const resolver = useResolverTransferencia();
  const [abierto, setAbierto] = useState(false);
  const pendientes = data ?? [];
  if (pendientes.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface2 px-3 py-1 text-sm font-medium text-ink hover:bg-surface"
      >
        <Inbox size={15} className="text-navy" />
        Transferencias
        <span className="ml-0.5 rounded-full bg-navy px-1.5 text-xs font-semibold text-white">
          {pendientes.length}
        </span>
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
            <p className="border-b border-line px-3 py-1.5 text-xs font-semibold text-ink-3">
              Oportunidades que te transfirieron
            </p>
            <div className="max-h-96 divide-y divide-line overflow-y-auto">
              {pendientes.map((o) => (
                <div key={o.id} className="px-3 py-2 text-sm">
                  <p className="font-medium text-ink">{o.cliente?.razon_social ?? `#${o.id}`}</p>
                  {o.asunto && <p className="truncate text-xs text-ink-3">{o.asunto}</p>}
                  <p className="text-xs text-ink-3">De: {o.vendedor?.nombre ?? "—"}</p>
                  <div className="mt-1.5 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => resolver.mutate({ id: o.id, accion: "aceptar" })}
                      disabled={resolver.isPending}
                    >
                      Aceptar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolver.mutate({ id: o.id, accion: "rechazar" })}
                      disabled={resolver.isPending}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
