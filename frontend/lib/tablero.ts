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
