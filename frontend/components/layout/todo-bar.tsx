"use client";

import { ChevronDown, ListTodo, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { TareaModal } from "@/components/tareas/tarea-modal";
import {
  estaVencidaTarea,
  PRIORIDAD_META,
  type Tarea,
  useDeleteTarea,
  useTareas,
  useUpdateTarea,
} from "@/lib/tareas";

const fmtDia = (d: string | null): string =>
  d ? d.split("-").slice(1).reverse().join("/") : "";

export function ToDoBar() {
  const [open, setOpen] = useState(false);
  const [creando, setCreando] = useState(false);
  const [editar, setEditar] = useState<Tarea | null>(null);
  const { data: tareas } = useTareas(false); // pendientes
  const updateMut = useUpdateTarea();
  const deleteMut = useDeleteTarea();

  const pendientes = tareas ?? [];

  return (
    <div className="fixed bottom-0 left-0 z-40 w-full">
      {/* Panel expandible */}
      {open && (
        <div className="max-h-[55vh] overflow-y-auto border-t border-line bg-surface shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between border-b border-line p-3">
            <span className="text-sm font-semibold text-ink">
              Tareas pendientes
            </span>
            <button
              type="button"
              onClick={() => setCreando(true)}
              className="flex h-9 items-center gap-1 rounded-md bg-navy px-3 text-sm font-semibold text-white hover:bg-navy-hover"
            >
              <Plus size={15} /> Nueva tarea
            </button>
          </div>

          <ul className="divide-y divide-line">
            {pendientes.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-ink-3">
                No hay tareas pendientes.
              </li>
            )}
            {pendientes.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={t.completada}
                  onChange={() => updateMut.mutate({ id: t.id, body: { completada: true } })}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-navy"
                  title="Marcar como hecha"
                />
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORIDAD_META[t.prioridad].color}`}
                  title={`Prioridad ${PRIORIDAD_META[t.prioridad].label.toLowerCase()}`}
                />
                <button
                  type="button"
                  onClick={() => setEditar(t)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm text-ink hover:text-accent">
                    {t.titulo}
                  </span>
                  {(t.cliente || t.oportunidad) && (
                    <span className="block truncate text-xs text-ink-3">
                      {t.cliente?.razon_social ?? t.oportunidad?.asunto}
                    </span>
                  )}
                </button>
                {t.fecha_vencimiento && (
                  <span
                    className={`shrink-0 text-xs ${
                      estaVencidaTarea(t)
                        ? "font-semibold text-red-600"
                        : "text-ink-3"
                    }`}
                  >
                    {fmtDia(t.fecha_vencimiento)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(t.id)}
                  className="shrink-0 text-ink-3 hover:text-red-600"
                  aria-label="Eliminar tarea"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Barra siempre visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-t border-line bg-nav px-4 py-2.5 text-sm font-semibold text-white"
      >
        <span className="flex items-center gap-2">
          <ListTodo size={16} /> To Do List
          {pendientes.length > 0 && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-white">
              {pendientes.length}
            </span>
          )}
        </span>
        <ChevronDown size={18} className={open ? "" : "rotate-180"} />
      </button>

      {creando && <TareaModal open onClose={() => setCreando(false)} />}
      {editar && <TareaModal open tarea={editar} onClose={() => setEditar(null)} />}
    </div>
  );
}
