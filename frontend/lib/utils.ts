import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Extrae un mensaje de error legible de cualquier error de axios/FastAPI.
 * FastAPI devuelve `detail` como string (errores propios) o como array de
 * objetos {loc, msg, ...} en los 422 de validación de Pydantic: nunca hay que
 * renderizar ese objeto directo (React tira "Objects are not valid as a child").
 */
export function errorMessage(err: unknown, fallback = "Ocurrió un error."): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : ""))
      .filter(Boolean);
    if (msgs.length) return msgs.join(". ");
  }
  return fallback;
}
