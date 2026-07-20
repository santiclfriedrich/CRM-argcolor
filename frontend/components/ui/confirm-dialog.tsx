"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type ConfirmOptions = {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Botón de acción en rojo (para borrados / acciones destructivas). */
  danger?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Diálogo de confirmación reutilizable, imperativo. Reemplaza a `window.confirm`
 * (que es síncrono y bloquea el hilo — dispara advertencias de INP y se ve feo).
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ message: "¿Eliminar?", danger: true })) { ... }
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opciones, setOpciones] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | undefined>(undefined);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpciones(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const cerrar = (resultado: boolean) => {
    resolver.current?.(resultado);
    resolver.current = undefined;
    setOpciones(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={opciones !== null}
        onClose={() => cerrar(false)}
        title={opciones?.title ?? "Confirmar"}
        size="md"
      >
        <div className="space-y-6">
          <p className="text-sm text-ink-2">{opciones?.message}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => cerrar(false)}>
              {opciones?.cancelLabel ?? "Cancelar"}
            </Button>
            <Button
              variant={opciones?.danger ? "danger" : "primary"}
              size="sm"
              onClick={() => cerrar(true)}
            >
              {opciones?.confirmLabel ?? "Confirmar"}
            </Button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  }
  return ctx;
}
