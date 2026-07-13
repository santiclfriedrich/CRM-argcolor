// Lógica de semáforos del tablero comercial.
// Verde = esperando cliente · Amarillo = esperando Compras · Rojo = sin movimiento.
// La inactividad (rojo) tiene prioridad sobre el estado.
import type { EstadoOportunidad, Oportunidad } from "@/lib/types";

export type Semaforo = "verde" | "amarillo" | "rojo";

// TODO(fase posterior): leer de configuracion.dias_alerta_sin_respuesta.
export const DIAS_ALERTA = 7;

// Estados cerrados: no entran al tablero de seguimiento activo.
const TERMINALES: readonly EstadoOportunidad[] = [
  "ganada",
  "cargada_en_gbp",
  "facturada",
  "perdida",
];

export function isTerminal(estado: EstadoOportunidad): boolean {
  return TERMINALES.includes(estado);
}

export function diasSinMovimiento(o: Oportunidad, now: Date): number {
  const last = new Date(o.fecha_ultimo_movimiento).getTime();
  return Math.floor((now.getTime() - last) / 86_400_000);
}

export function semaforoDe(o: Oportunidad, now: Date): Semaforo | null {
  if (isTerminal(o.estado)) return null;
  if (diasSinMovimiento(o, now) > DIAS_ALERTA) return "rojo";
  if (o.estado === "en_compras") return "amarillo";
  return "verde";
}

export const SEMAFORO_META: Record<
  Semaforo,
  { label: string; dot: string; header: string; ring: string }
> = {
  verde: {
    label: "Esperando cliente",
    dot: "bg-green-500",
    header: "text-green-700",
    ring: "border-green-200",
  },
  amarillo: {
    label: "Esperando Compras",
    dot: "bg-amber-500",
    header: "text-amber-700",
    ring: "border-amber-200",
  },
  rojo: {
    label: `Sin movimiento (+${DIAS_ALERTA} días)`,
    dot: "bg-red-500",
    header: "text-red-700",
    ring: "border-red-200",
  },
};

export const SEMAFORO_ORDER: Semaforo[] = ["rojo", "amarillo", "verde"];

// --- Seguimiento diario (accionables de hoy) ---
export const DIAS_SIN_AVANCE = 3; // avisar si no hay movimiento hace N días
export const DIAS_POR_VENCER = 3; // "por vencer" = la validez cae dentro de N días

const hoyISO = (): string => new Date().toISOString().slice(0, 10);

export type BucketSeguimiento = "vencida" | "sin_avance" | "por_vencer";

export interface BucketsSeguimiento {
  vencida: Oportunidad[];
  sin_avance: Oportunidad[];
  por_vencer: Oportunidad[];
}

// Clasifica cada oportunidad ACTIVA en un único bucket accionable (por prioridad:
// vencida > sin avance > por vencer). Las que no requieren acción no entran.
export function bucketsSeguimiento(opps: Oportunidad[], now: Date): BucketsSeguimiento {
  const hoy = hoyISO();
  const limite = new Date(now.getTime() + DIAS_POR_VENCER * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const out: BucketsSeguimiento = { vencida: [], sin_avance: [], por_vencer: [] };

  for (const o of opps) {
    if (isTerminal(o.estado)) continue;
    if (o.fecha_limite && o.fecha_limite < hoy) {
      out.vencida.push(o);
    } else if (diasSinMovimiento(o, now) >= DIAS_SIN_AVANCE) {
      out.sin_avance.push(o);
    } else if (o.fecha_limite && o.fecha_limite <= limite) {
      out.por_vencer.push(o);
    }
  }
  return out;
}
