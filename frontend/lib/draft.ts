// Borradores de formularios: persisten en localStorage para no perder lo
// cargado si el usuario cambia de pestaña, navega a otra sección o cierra el
// formulario sin querer. Se limpian al guardar con éxito o al cancelar.

export function loadDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const s = window.localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage lleno o no disponible: no es crítico */
  }
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* no-op */
  }
}

export const DRAFT_OPORTUNIDAD = "draft:oportunidad-nueva";
export const DRAFT_CLIENTE = "draft:cliente-nuevo";
