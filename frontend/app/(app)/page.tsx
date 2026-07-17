"use client";

import {
  AlarmClock,
  BellRing,
  Building2,
  Clock,
  FileText,
  Plus,
  Target,
} from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useClientes } from "@/lib/clientes";
import { useGenerarSeguimiento } from "@/lib/notificaciones";
import { useOportunidades } from "@/lib/oportunidades";
import { type TipoRegistro, useRegistrosRecientes } from "@/lib/recientes";
import { TareaModal } from "@/components/tareas/tarea-modal";
import {
  estaVencidaTarea,
  PRIORIDAD_META,
  type Tarea,
  useTareas,
  useUpdateTarea,
} from "@/lib/tareas";
import {
  bucketsSeguimiento,
  type BucketsSeguimiento,
  diasSinMovimiento,
  isTerminal,
  semaforoDe,
  SEMAFORO_META,
} from "@/lib/tablero";
import type { EstadoOportunidad, Oportunidad } from "@/lib/types";

type Filtro = "todas" | "mias";

const GANADAS: EstadoOportunidad[] = ["ganada", "facturada"];

const RECIENTE_ICONO: Record<
  TipoRegistro,
  { icon: typeof Target; bg: string }
> = {
  Cuenta: { icon: Building2, bg: "bg-blue-500" },
  Oportunidad: { icon: Target, bg: "bg-orange-500" },
  Presupuesto: { icon: FileText, bg: "bg-violet-500" },
};

function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buen día";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

// $531 k / $1.2 M — formato compacto estilo Salesforce.
function montoCompacto(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)} k`;
  return `$${Math.round(n)}`;
}

export default function InicioPage() {
  const { data: session } = useSession();
  const currentUserId = Number(session?.usuario?.id) || null;
  const nombre =
    (session?.usuario?.nombre as string) ?? session?.user?.name ?? "";
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const { data: opps, isLoading } = useOportunidades();
  const { data: clientes } = useClientes();
  const router = useRouter();

  const vista = useMemo(() => {
    const now = new Date();
    const visibles = (opps ?? []).filter(
      (o) => filtro === "todas" || o.vendedor_id === currentUserId
    );

    // Cerrar acuerdos: montos por estado.
    let abiertas = 0;
    let ganadas = 0;
    let perdidas = 0;
    for (const o of visibles) {
      const v = Number(o.valor_estimado) || 0;
      if (o.estado === "perdida") perdidas += v;
      else if (GANADAS.includes(o.estado)) ganadas += v;
      else abiertas += v;
    }

    // Oportunidades en curso: activas por semáforo.
    const activas = visibles.filter((o) => !isTerminal(o.estado));
    const sem = { rojo: 0, amarillo: 0, verde: 0 };
    for (const o of activas) {
      const s = semaforoDe(o, now);
      if (s) sem[s] += 1;
    }

    // Mis Cuentas: cuentas propias + actividad por oportunidades.
    const cuentas = (clientes ?? []).filter(
      (c) => filtro === "todas" || c.vendedor_asignado_id === currentUserId
    );
    const oppsPorCliente = new Map<number, Oportunidad[]>();
    for (const o of opps ?? []) {
      if (o.cliente_id == null) continue;
      const arr = oppsPorCliente.get(o.cliente_id) ?? [];
      arr.push(o);
      oppsPorCliente.set(o.cliente_id, arr);
    }
    let conActiva = 0;
    let soloCerradas = 0;
    let sinActividad = 0;
    for (const c of cuentas) {
      const os = oppsPorCliente.get(c.id) ?? [];
      if (os.some((o) => !isTerminal(o.estado))) conActiva += 1;
      else if (os.length > 0) soloCerradas += 1;
      else sinActividad += 1;
    }

    return {
      montos: { abiertas, ganadas, perdidas },
      sem,
      activasTotal: activas.length,
      cuentas: { total: cuentas.length, conActiva, soloCerradas, sinActividad },
      buckets: bucketsSeguimiento(visibles, now),
    };
  }, [opps, clientes, filtro, currentUserId]);

  const totalDeals =
    vista.montos.abiertas + vista.montos.ganadas + vista.montos.perdidas;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Inicio de vendedor
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {saludo()}
            {nombre ? `, ${nombre.split(" ")[0]}` : ""}. ¡Empecemos a vender!
          </p>
        </div>
        <div className="flex rounded-md border border-slate-200 p-0.5 text-sm dark:border-slate-800">
          {(["todas", "mias"] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`rounded px-3 py-1 font-medium transition ${
                filtro === f
                  ? "bg-brand text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {f === "todas" ? "Todas" : "Mías"}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <p className="mt-6 text-slate-500 dark:text-slate-400">Cargando…</p>
      )}

      {/* Cards principales estilo Salesforce */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <DashCard
          titulo="Cerrar acuerdos"
          subtitulo="Tu cartera de oportunidades"
          centro={montoCompacto(totalDeals)}
          centroLabel="En total"
          segments={[
            { value: vista.montos.abiertas, color: "#22c55e" },
            { value: vista.montos.ganadas, color: "#3b82f6" },
            { value: vista.montos.perdidas, color: "#ef4444" },
          ]}
          legend={[
            {
              dot: "#22c55e",
              label: `${montoCompacto(vista.montos.abiertas)} Abiertas`,
            },
            {
              dot: "#3b82f6",
              label: `${montoCompacto(vista.montos.ganadas)} Ganadas`,
            },
            {
              dot: "#ef4444",
              label: `${montoCompacto(vista.montos.perdidas)} Perdidas`,
            },
          ]}
          href="/oportunidades"
          hrefLabel="Ver oportunidades"
        />

        <DashCard
          titulo="Oportunidades en curso"
          subtitulo="Activas, por prioridad de seguimiento"
          centro={String(vista.activasTotal)}
          centroLabel="Activas"
          segments={[
            { value: vista.sem.rojo, color: "#ef4444" },
            { value: vista.sem.amarillo, color: "#f59e0b" },
            { value: vista.sem.verde, color: "#22c55e" },
          ]}
          legend={[
            {
              dot: "#ef4444",
              label: `${vista.sem.rojo} ${SEMAFORO_META.rojo.label}`,
            },
            {
              dot: "#f59e0b",
              label: `${vista.sem.amarillo} ${SEMAFORO_META.amarillo.label}`,
            },
            {
              dot: "#22c55e",
              label: `${vista.sem.verde} ${SEMAFORO_META.verde.label}`,
            },
          ]}
          href="/oportunidades"
          hrefLabel="Ver oportunidades"
        />

        <DashCard
          titulo="Plan mis cuentas"
          subtitulo="Cuentas y su actividad comercial"
          centro={String(vista.cuentas.total)}
          centroLabel="Cuentas"
          segments={[
            { value: vista.cuentas.conActiva, color: "#22c55e" },
            { value: vista.cuentas.soloCerradas, color: "#3b82f6" },
            { value: vista.cuentas.sinActividad, color: "#ef4444" },
          ]}
          legend={[
            {
              dot: "#22c55e",
              label: `${vista.cuentas.conActiva} Con oportunidad activa`,
            },
            {
              dot: "#3b82f6",
              label: `${vista.cuentas.soloCerradas} Solo cerradas`,
            },
            {
              dot: "#ef4444",
              label: `${vista.cuentas.sinActividad} Sin actividad`,
            },
          ]}
          href="/clientes"
          hrefLabel="Ver cuentas"
        />
      </div>

      <SeguimientoHoy buckets={vista.buckets} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <TareasDeHoy />
        <RegistrosRecientes />
      </div>
    </div>
  );
}

// Tareas del vendedor que vencen hoy o están atrasadas.
function TareasDeHoy() {
  const { data } = useTareas(false);
  const actualizar = useUpdateTarea();
  const [creando, setCreando] = useState(false);
  const [editar, setEditar] = useState<Tarea | null>(null);

  const hoy = new Date().toISOString().slice(0, 10);
  const items = (data ?? [])
    .filter((t) => t.fecha_vencimiento && t.fecha_vencimiento <= hoy)
    .sort((a, b) =>
      (a.fecha_vencimiento ?? "").localeCompare(b.fecha_vencimiento ?? "")
    );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Tareas de hoy</h2>
        <Button size="sm" variant="outline" onClick={() => setCreando(true)}>
          <Plus size={14} /> Nueva tarea
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
          No hay nada pendiente para hoy. Tomá la iniciativa.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                onChange={() => actualizar.mutate({ id: t.id, body: { completada: true } })}
                className="h-4 w-4 shrink-0 cursor-pointer accent-brand"
                title="Marcar como hecha"
              />
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORIDAD_META[t.prioridad].color}`} />
              <button
                type="button"
                onClick={() => setEditar(t)}
                className="min-w-0 flex-1 truncate text-left text-sm text-slate-800 hover:text-brand dark:text-slate-100"
              >
                {t.titulo}
              </button>
              {estaVencidaTarea(t) && (
                <span className="shrink-0 text-xs font-semibold text-red-600">atrasada</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-slate-100 pt-3 text-center dark:border-slate-800">
        <Link href="/tareas" className="text-sm font-semibold text-brand hover:underline">
          Ver todas
        </Link>
      </div>

      {creando && (
        <TareaModal open onClose={() => setCreando(false)} fechaPorDefecto={hoy} />
      )}
      {editar && <TareaModal open tarea={editar} onClose={() => setEditar(null)} />}
    </section>
  );
}

// ---- Card con dona (SVG) + leyenda, estilo panel de Salesforce ----
function DashCard({
  titulo,
  subtitulo,
  centro,
  centroLabel,
  segments,
  legend,
  href,
  hrefLabel,
}: {
  titulo: string;
  subtitulo: string;
  centro: string;
  centroLabel: string;
  segments: { value: number; color: string }[];
  legend: { dot: string; label: string }[];
  href: string;
  hrefLabel: string;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {titulo}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {subtitulo}
        </p>
      </div>
      <div className="mt-4 flex flex-1 items-center gap-4">
        <Donut segments={segments} centro={centro} centroLabel={centroLabel} />
        <ul className="flex flex-1 flex-col gap-2">
          {legend.map((l, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: l.dot }}
              />
              {l.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3 text-center dark:border-slate-800">
        <Link
          href={href}
          className="text-sm font-semibold text-brand hover:underline"
        >
          {hrefLabel}
        </Link>
      </div>
    </section>
  );
}

function Donut({
  segments,
  centro,
  centroLabel,
}: {
  segments: { value: number; color: string }[];
  centro: string;
  centroLabel: string;
}) {
  const thickness = 12;
  const r = 50 - thickness / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: 128, height: 128 }}>
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth={thickness}
          className="stroke-slate-100 dark:stroke-slate-800"
        />
        {total > 0 &&
          segments.map((s, i) => {
            const len = (s.value / total) * circ;
            const el = (
              <circle
                key={i}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {centro}
        </span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          {centroLabel}
        </span>
      </div>
    </div>
  );
}

// ---- Panel de seguimiento diario (accionables de hoy) ----
function SeguimientoHoy({ buckets }: { buckets: BucketsSeguimiento }) {
  const router = useRouter();
  const generar = useGenerarSeguimiento();

  const cols: {
    key: keyof BucketsSeguimiento;
    label: string;
    icon: React.ReactNode;
    tono: string;
  }[] = [
    {
      key: "vencida",
      label: "Vencidas",
      icon: <AlarmClock size={15} />,
      tono: "text-red-600",
    },
    {
      key: "sin_avance",
      label: "Sin avance (+3 días)",
      icon: <Clock size={15} />,
      tono: "text-amber-600",
    },
    {
      key: "por_vencer",
      label: "Por vencer",
      icon: <BellRing size={15} />,
      tono: "text-blue-600",
    },
  ];

  const totalAcciones = buckets.vencida.length + buckets.sin_avance.length;

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Seguimiento de hoy
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Lo que necesita acción hoy. Se avisa al vendedor en la campana (auto
            cada mañana).
          </p>
        </div>
        <Tooltip label="Crear avisos ahora en la campana">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generar.mutate()}
            disabled={generar.isPending}
          >
            <BellRing size={14} />
            {generar.isPending
              ? "Revisando…"
              : generar.isSuccess
                ? `${generar.data.creadas} aviso(s)`
                : "Revisar seguimientos"}
          </Button>
        </Tooltip>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cols.map((c) => {
          const items = buckets[c.key];
          return (
            <div
              key={c.key}
              className="rounded-md border border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                <span
                  className={`flex items-center gap-1.5 text-sm font-semibold ${c.tono}`}
                >
                  {c.icon} {c.label}
                </span>
                <Badge>{items.length}</Badge>
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto p-2">
                {items.length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-slate-400 dark:text-slate-500">
                    Nada por acá.
                  </p>
                ) : (
                  items.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => router.push(`/oportunidades?op=${o.id}`)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {o.cliente?.razon_social ?? o.asunto ?? `#${o.id}`}
                      </span>
                      <span className="truncate text-xs text-slate-400 dark:text-slate-500">
                        {c.key === "sin_avance"
                          ? `${diasSinMovimiento(o, new Date())} días sin avance`
                          : `Validez: ${o.fecha_limite ? o.fecha_limite.split("-").reverse().join("/") : "—"}`}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {totalAcciones === 0 && (
        <p className="mt-3 text-center text-sm text-green-600">
          Estás al día con los seguimientos.
        </p>
      )}
    </section>
  );
}

function RegistrosRecientes() {
  const router = useRouter();
  const { data } = useRegistrosRecientes(6);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
        Registros recientes
      </h2>
      {data.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
          Todavía no hay movimientos.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.map((r) => {
            const { icon: Icon, bg } = RECIENTE_ICONO[r.tipo];
            return (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => router.push(r.href)}
                  className="flex w-full items-center justify-between gap-3 py-2 text-left"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${bg}`}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-brand">
                        {r.nombre}
                      </span>
                      <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
                        {r.tipo}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {new Date(r.fecha).toLocaleDateString("es-AR")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 border-t border-slate-100 pt-3 text-center dark:border-slate-800">
        <Link
          href="/recientes"
          className="text-sm font-semibold text-brand hover:underline"
        >
          Ver todos
        </Link>
      </div>
    </section>
  );
}
