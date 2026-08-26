"use client";

import {
  AlarmClock,
  BellRing,
  Building2,
  Clock,
  FileText,
  Plus,
  Target,
  Truck,
  Wallet,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardCta } from "@/components/ui/card";
import { useSeccion } from "@/components/ui/seccion";
import { Tooltip } from "@/components/ui/tooltip";
import { STATUS, tint } from "@/lib/status";
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

// "Ganadas": el negocio se cerró a favor (aunque falte entrega y/o cobro).
const GANADAS: EstadoOportunidad[] = [
  "pago_pendiente_entrega",
  "entregado_pendiente_pago",
  "finalizado",
];

const RECIENTE_ICONO: Record<
  TipoRegistro,
  { icon: typeof Target; bg: string }
> = {
  Cuenta: { icon: Building2, bg: "bg-blue-500" },
  Oportunidad: { icon: Target, bg: "bg-amber-500" },
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
  const { seccion } = useSeccion();

  const { data: opps, isLoading } = useOportunidades({ ambito: seccion });
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

    // Oportunidades en curso: activas por semáforo (ni terminales ni ganadas).
    const activas = visibles.filter(
      (o) => !isTerminal(o.estado) && !GANADAS.includes(o.estado)
    );
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
      // Cierre pendiente: pagos y entregas por resolver (estados verdes).
      pagosPendientes: visibles.filter((o) => o.estado === "entregado_pendiente_pago"),
      entregasPendientes: visibles.filter((o) => o.estado === "pago_pendiente_entrega"),
    };
  }, [opps, clientes, filtro, currentUserId]);

  const totalDeals =
    vista.montos.abiertas + vista.montos.ganadas + vista.montos.perdidas;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {saludo()}
            {nombre ? `, ${nombre.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-ink-2">
            Tu pipeline y lo que necesita acción hoy.
          </p>
        </div>
        <div className="flex rounded-full border border-line bg-surface p-0.5 text-sm shadow-soft">
          {(["todas", "mias"] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`rounded-full px-3.5 py-1.5 font-medium transition ${
                filtro === f
                  ? "bg-navy text-white shadow-sm"
                  : "text-ink-2 hover:bg-surface2"
              }`}
            >
              {f === "todas" ? "Todas" : "Mías"}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <p className="mt-6 text-ink-2">Cargando…</p>
      )}

      {/* Cards principales estilo Salesforce */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <DashCard
          titulo="Cerrar acuerdos"
          subtitulo="Tu cartera de oportunidades"
          centro={montoCompacto(totalDeals)}
          centroLabel="En total"
          segments={[
            { value: vista.montos.abiertas, color: STATUS.success },
            { value: vista.montos.ganadas, color: STATUS.info },
            { value: vista.montos.perdidas, color: STATUS.danger },
          ]}
          legend={[
            { dot: STATUS.success, label: `${montoCompacto(vista.montos.abiertas)} Abiertas` },
            { dot: STATUS.info, label: `${montoCompacto(vista.montos.ganadas)} Ganadas` },
            { dot: STATUS.danger, label: `${montoCompacto(vista.montos.perdidas)} Perdidas` },
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
            { value: vista.sem.rojo, color: STATUS.danger },
            { value: vista.sem.amarillo, color: STATUS.warning },
            { value: vista.sem.verde, color: STATUS.success },
          ]}
          legend={[
            { dot: STATUS.danger, label: `${vista.sem.rojo} ${SEMAFORO_META.rojo.label}` },
            { dot: STATUS.warning, label: `${vista.sem.amarillo} ${SEMAFORO_META.amarillo.label}` },
            { dot: STATUS.success, label: `${vista.sem.verde} ${SEMAFORO_META.verde.label}` },
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
            { value: vista.cuentas.conActiva, color: STATUS.success },
            { value: vista.cuentas.soloCerradas, color: STATUS.info },
            { value: vista.cuentas.sinActividad, color: STATUS.neutral },
          ]}
          legend={[
            {
              dot: STATUS.success,
              label: `${vista.cuentas.conActiva} Con oportunidad activa`,
            },
            {
              dot: STATUS.info,
              label: `${vista.cuentas.soloCerradas} Solo cerradas`,
            },
            {
              dot: STATUS.neutral,
              label: `${vista.cuentas.sinActividad} Sin actividad`,
            },
          ]}
          href="/clientes"
          hrefLabel="Ver cuentas"
        />
      </div>

      <SeguimientoHoy buckets={vista.buckets} />

      {seccion === "corporativo" && (
        <PendientesCierre
          pagos={vista.pagosPendientes}
          entregas={vista.entregasPendientes}
        />
      )}

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
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-ink">Tareas de hoy</h2>
        <Button size="sm" variant="outline" onClick={() => setCreando(true)}>
          <Plus size={14} /> Nueva tarea
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">
          No hay nada pendiente para hoy. Tomá la iniciativa.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                onChange={() => actualizar.mutate({ id: t.id, body: { completada: true } })}
                className="h-4 w-4 shrink-0 cursor-pointer accent-navy"
                title="Marcar como hecha"
              />
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORIDAD_META[t.prioridad].color}`} />
              <button
                type="button"
                onClick={() => setEditar(t)}
                className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-accent"
              >
                {t.titulo}
              </button>
              {estaVencidaTarea(t) && (
                <span className="shrink-0 text-xs font-semibold text-danger">atrasada</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex justify-center border-t border-line pt-4">
        <CardCta href="/tareas">Ver todas</CardCta>
      </div>

      {creando && (
        <TareaModal open onClose={() => setCreando(false)} fechaPorDefecto={hoy} />
      )}
      {editar && <TareaModal open tarea={editar} onClose={() => setEditar(null)} />}
    </Card>
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
    <Card className="flex flex-col p-5">
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink">{titulo}</p>
        <p className="mt-1 text-sm text-ink-2">{subtitulo}</p>
      </div>
      <div className="mt-4 flex flex-1 items-center gap-4">
        <Donut segments={segments} centro={centro} centroLabel={centroLabel} />
        <ul className="flex flex-1 flex-col gap-1.5">
          {legend.map((l, i) => (
            <li
              key={i}
              className="flex w-fit items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-ink"
              style={{ backgroundColor: tint(l.dot, 0.14) }}
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
      <div className="mt-5 flex justify-center border-t border-line pt-4">
        <CardCta href={href}>{hrefLabel}</CardCta>
      </div>
    </Card>
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
          className="stroke-line"
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
        <span className="text-2xl font-medium tabular-nums tracking-tight text-ink">
          {centro}
        </span>
        <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
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
    tone: "danger" | "warning" | "info";
  }[] = [
    {
      key: "vencida",
      label: "Vencidas",
      icon: <AlarmClock size={15} />,
      tono: "text-danger",
      tone: "danger",
    },
    {
      key: "sin_avance",
      label: "Sin avance (+3 días)",
      icon: <Clock size={15} />,
      tono: "text-warning",
      tone: "warning",
    },
    {
      key: "por_vencer",
      label: "Por vencer",
      icon: <BellRing size={15} />,
      tono: "text-info",
      tone: "info",
    },
  ];

  const totalAcciones = buckets.vencida.length + buckets.sin_avance.length;

  return (
    <Card className="mt-6 p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Seguimiento de hoy
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">
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
              className="overflow-hidden rounded-lg border border-line bg-surface2"
            >
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span
                  className={`flex items-center gap-1.5 text-sm font-semibold ${c.tono}`}
                >
                  {c.icon} {c.label}
                </span>
                <Badge tone={c.tone}>{items.length}</Badge>
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto p-2">
                {items.length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-ink-3">
                    Nada por acá.
                  </p>
                ) : (
                  items.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => router.push(`/oportunidades?op=${o.id}`)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-surface2"
                    >
                      <span className="truncate text-sm font-medium text-ink">
                        {o.cliente?.razon_social ?? o.asunto ?? `#${o.id}`}
                      </span>
                      <span className="truncate text-xs text-muted">
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
        <p className="mt-3 text-center text-sm font-medium text-success">
          Estás al día con los seguimientos.
        </p>
      )}
    </Card>
  );
}

// ---- Pagos / Entregas pendientes (estados de cierre verdes) ----
function PendientesCierre({
  pagos,
  entregas,
}: {
  pagos: Oportunidad[];
  entregas: Oportunidad[];
}) {
  const router = useRouter();

  const cajas: {
    titulo: string;
    icon: React.ReactNode;
    tono: string;
    items: Oportunidad[];
  }[] = [
    {
      titulo: "Pagos pendientes",
      icon: <Wallet size={15} />,
      tono: "text-green-700 dark:text-green-400",
      items: pagos,
    },
    {
      titulo: "Entregas pendientes",
      icon: <Truck size={15} />,
      tono: "text-green-700 dark:text-green-400",
      items: entregas,
    },
  ];

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {cajas.map((c) => (
        <Card key={c.titulo} className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className={`flex items-center gap-1.5 text-sm font-semibold ${c.tono}`}>
              {c.icon} {c.titulo}
            </span>
            <Badge tone="success">{c.items.length}</Badge>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto p-2">
            {c.items.length === 0 ? (
              <p className="px-1 py-3 text-center text-xs text-ink-3">Nada por acá.</p>
            ) : (
              c.items.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => router.push(`/oportunidades?op=${o.id}`)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface2"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-ink">
                    {o.cliente?.razon_social ?? o.asunto ?? `#${o.id}`}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-xs text-ink-2">
                    {o.numero_pedido ? `Pedido ${o.numero_pedido}` : "Sin pedido"}
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RegistrosRecientes() {
  const router = useRouter();
  const { data } = useRegistrosRecientes(6);

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-base font-semibold tracking-tight text-ink">
        Registros recientes
      </h2>
      {data.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-3">
          Todavía no hay movimientos.
        </p>
      ) : (
        <ul className="divide-y divide-line">
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
                      <span className="block truncate font-medium text-accent">
                        {r.nombre}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {r.tipo}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {new Date(r.fecha).toLocaleDateString("es-AR")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex justify-center border-t border-line pt-4">
        <CardCta href="/recientes">Ver todos</CardCta>
      </div>
    </Card>
  );
}
