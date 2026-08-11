"use client";

import { AlertCircle, Check, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };
type ToastFn = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ToastFn | null>(null);

const DURACION_MS = 3200;

/**
 * Notificaciones sutiles, no bloqueantes (abajo a la derecha). Se auto-descartan.
 *
 *   const toast = useToast();
 *   toast("Propuesta aceptada", "success");
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const remove = useCallback(
    (id: number) => setItems((l) => l.filter((t) => t.id !== id)),
    []
  );

  const toast = useCallback<ToastFn>(
    (message, type = "info") => {
      const id = (seq.current += 1);
      setItems((l) => [...l, { id, message, type }]);
      setTimeout(() => remove(id), DURACION_MS);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {montado &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
            {items.map((t) => (
              <ToastCard key={t.id} item={t} onClose={() => remove(t.id)} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

const META: Record<ToastType, { icon: typeof Check; cls: string }> = {
  success: { icon: Check, cls: "border-success/40 text-success" },
  error: { icon: AlertCircle, cls: "border-danger/40 text-danger" },
  info: { icon: AlertCircle, cls: "border-line text-ink-2" },
};

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const { icon: Icono, cls } = META[item.type];
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
        cls
      )}
    >
      <Icono size={16} className="shrink-0" />
      <span className="text-ink">{item.message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="ml-1 shrink-0 text-ink-3 transition-colors hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast debe usarse dentro de <ToastProvider>");
  }
  return ctx;
}
