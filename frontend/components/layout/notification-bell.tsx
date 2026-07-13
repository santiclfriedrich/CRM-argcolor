"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  useMarcarLeida,
  useMarcarTodasLeidas,
  useNotificaciones,
} from "@/lib/notificaciones";
import type { Notificacion } from "@/lib/types";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: notis } = useNotificaciones();
  const marcarLeida = useMarcarLeida();
  const marcarTodas = useMarcarTodasLeidas();
  const router = useRouter();

  const lista = notis ?? [];
  const noLeidas = lista.filter((n) => !n.leida).length;

  const abrir = (n: Notificacion) => {
    if (!n.leida) marcarLeida.mutate(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label="Notificaciones"
      >
        <Bell size={18} />
        {noLeidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Captura el click afuera para cerrar el panel. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-9 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Notificaciones
              </span>
              {noLeidas > 0 && (
                <button
                  type="button"
                  onClick={() => marcarTodas.mutate()}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Marcar todas leídas
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {lista.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  No tenés notificaciones.
                </p>
              ) : (
                lista.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => abrir(n)}
                    className={`flex w-full flex-col gap-0.5 border-b border-slate-100 px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60 ${
                      n.leida ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      {!n.leida && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      )}
                      <span className={n.leida ? "" : "font-medium"}>{n.mensaje}</span>
                    </span>
                    <span className="pl-3.5 text-[11px] text-slate-400 dark:text-slate-500">
                      {new Date(n.fecha_creacion).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
