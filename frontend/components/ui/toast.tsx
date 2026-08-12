"use client";

import { AlertCircle, Check, Loader2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info" | "loading";
type ToastItem = { id: number; message: string; type: ToastType };

type ToastApi = {
  /** Muestra un toast y devuelve su id. Los de tipo "loading" NO se auto-descartan. */
  toast: (message: string, type?: ToastType) => number;
  /** Actualiza un toast existente (ej.: de "loading" a "success"). */
  update: (id: number, message: string, type: ToastType) => void;
  /** Descarta un toast manualmente. */
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DURACION_MS = 3200;

/**
 * Notificaciones sutiles, no bloqueantes (abajo a la derecha). Se auto-descartan
 * salvo las de tipo "loading" (que se actualizan al resolver la acción):
 *
 *   const { toast, update } = useToast();
 *   const id = toast("Aguarde un momento…", "loading");
 *   update(id, "Listo", "success");
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const dismiss = useCallback(
    (id: number) => setItems((l) => l.filter((t) => t.id !== id)),
    []
  );

  const toast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = (seq.current += 1);
      setItems((l) => [...l, { id, message, type }]);
      if (type !== "loading") setTimeout(() => dismiss(id), DURACION_MS);
      return id;
    },
    [dismiss]
  );

  const update = useCallback(
    (id: number, message: string, type: ToastType) => {
      setItems((l) => l.map((t) => (t.id === id ? { ...t, message, type } : t)));
      if (type !== "loading") setTimeout(() => dismiss(id), DURACION_MS);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(() => ({ toast, update, dismiss }), [toast, update, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {montado &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
            {items.map((t) => (
              <ToastCard key={t.id} item={t} onClose={() => dismiss(t.id)} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

const META: Record<ToastType, { cls: string }> = {
  success: { cls: "border-success/40 text-success" },
  error: { cls: "border-danger/40 text-danger" },
  info: { cls: "border-line text-ink-2" },
  loading: { cls: "border-line text-ink-2" },
};

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const cargando = item.type === "loading";
  // Aparición sutil (fade + leve desplazamiento).
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-2.5 rounded-xl border bg-surface py-2.5 pl-3.5 pr-2.5 text-sm shadow-pop transition-all duration-200",
        visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        META[item.type].cls
      )}
    >
      {item.type === "success" ? (
        <Check size={16} className="shrink-0" />
      ) : cargando ? (
        <Loader2 size={16} className="shrink-0 animate-spin" />
      ) : (
        <AlertCircle size={16} className="shrink-0" />
      )}
      <span className="text-ink">{item.message}</span>
      {!cargando && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="ml-1 shrink-0 text-ink-3 transition-colors hover:text-ink"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast debe usarse dentro de <ToastProvider>");
  }
  return ctx;
}
