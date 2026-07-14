"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type ModalSize = "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";

const SIZE: Record<ModalSize, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: ModalSize;
}

// Diálogo modal liviano basado en estado (sin Radix). Cierra con Escape o backdrop.
export function Modal({ open, onClose, title, children, size = "lg" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10 ${SIZE[size]}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="relative flex shrink-0 items-center justify-center border-b border-slate-200 px-12 py-3.5 dark:border-slate-800">
          <h2 className="text-center text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X size={18} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
