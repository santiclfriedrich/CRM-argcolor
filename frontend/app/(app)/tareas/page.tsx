"use client";

import { BellRing, CheckCircle2, ListChecks, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import { TareaModal } from "@/components/tareas/tarea-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  estaVencidaTarea,
  PRIORIDAD_META,
  SUBTIPO_OPCIONES,
  type Tarea,
  useDeleteTarea,
  useTareas,
  useUpdateTarea,
} from "@/lib/tareas";

const subtipoLabel = (v: string | null): string =>
  SUBTIPO_OPCIONES.find((s) => s.value === v)?.label ?? "—";

type Tab = "pendientes" | "completadas";

const fmtFecha = (d: string | null): string => (d ? d.split("-").reverse().join("/") : "—");
const fmtDateTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function TareasPage() {
  const [tab, setTab] = useState<Tab>("pendientes");
  const { data, isLoading } = useTareas(tab === "completadas");
  const [selId, setSelId] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);
  const [editar, setEditar] = useState<Tarea | null>(null);

  const tareas = data ?? [];
  const seleccionada = tareas.find((t) => t.id === selId) ?? tareas[0] ?? null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Tareas</h1>
        <Button onClick={() => setCreando(true)}>
          <Plus size={16} /> Nueva tarea
        </Button>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Lista */}
        <div className="flex flex-col gap-3">
          <div className="flex rounded-md border border-slate-200 p-0.5 text-sm dark:border-slate-800">
            {(["pendientes", "completadas"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded px-3 py-1 font-medium transition ${
                  tab === t
                    ? "bg-brand text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {t === "pendientes" ? "Pendientes" : "Completadas"}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            {isLoading && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando…</p>}
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {tareas.map((t) => {
                const activa = seleccionada?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelId(t.id)}
                      className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
                        activa
                          ? "bg-brand/5 shadow-[inset_3px_0_0] shadow-brand"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORIDAD_META[t.prioridad].color}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm font-medium ${
                            t.completada
                              ? "text-slate-400 line-through dark:text-slate-500"
                              : "text-slate-800 dark:text-slate-100"
                          }`}
                        >
                          {t.titulo}
                        </span>
                        <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
                          {t.usuario?.nombre ?? "—"} · {fmtFecha(t.fecha_vencimiento)}
                        </span>
                      </span>
                      {t.recordatorio && (
                        <BellRing size={13} className="shrink-0 text-slate-300 dark:text-slate-600" />
                      )}
                    </button>
                  </li>
                );
              })}
              {!isLoading && tareas.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                  {tab === "pendientes"
                    ? "No tenés tareas pendientes."
                    : "Todavía no completaste ninguna."}
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Detalle */}
        {seleccionada ? (
          <DetalleTarea
            tarea={seleccionada}
            onModificar={() => setEditar(seleccionada)}
          />
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 p-10 text-sm text-slate-400 dark:border-slate-800 dark:text-slate-500">
            Seleccioná una tarea para ver el detalle.
          </div>
        )}
      </div>

      {creando && <TareaModal open onClose={() => setCreando(false)} />}
      {editar && <TareaModal open tarea={editar} onClose={() => setEditar(null)} />}
    </div>
  );
}

function DetalleTarea({ tarea, onModificar }: { tarea: Tarea; onModificar: () => void }) {
  const actualizar = useUpdateTarea();
  const borrar = useDeleteTarea();

  const eliminar = () => {
    if (window.confirm(`¿Eliminar la tarea "${tarea.titulo}"?`)) borrar.mutate(tarea.id);
  };
  const toggle = () =>
    actualizar.mutate({ id: tarea.id, body: { completada: !tarea.completada } });

  const relacionado = tarea.cliente?.razon_social ?? tarea.oportunidad?.asunto ?? null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Encabezado + acciones */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white">
            <ListChecks size={20} />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Tarea</p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{tarea.titulo}</h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={toggle} disabled={actualizar.isPending}>
            {tarea.completada ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
            {tarea.completada ? "Reabrir" : "Marcar completado"}
          </Button>
          <Button variant="outline" size="sm" onClick={onModificar}>
            <Pencil size={14} /> Modificar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={eliminar}
            disabled={borrar.isPending}
            className="text-red-600"
          >
            <Trash2 size={14} /> Eliminar
          </Button>
        </div>
      </div>

      {/* Información de la tarea */}
      <div className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Badge className={tarea.completada ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>
            {tarea.completada ? "Completado" : "Abierto"}
          </Badge>
          <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Prioridad {PRIORIDAD_META[tarea.prioridad].label}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <Campo label="Asunto" valor={tarea.titulo} />
          <Campo label="Subtipo" valor={subtipoLabel(tarea.subtipo)} />
          <Campo label="Asignado a" valor={tarea.usuario?.nombre ?? "—"} />
          <Campo
            label="Fecha de vencimiento"
            valor={fmtFecha(tarea.fecha_vencimiento)}
            alerta={estaVencidaTarea(tarea)}
          />
          <Campo label="Recordatorio" valor={fmtDateTime(tarea.recordatorio)} />
          <Campo label="Relacionado con" valor={relacionado ?? "—"} />
          <Campo
            label="Creado"
            valor={`${tarea.usuario?.nombre ?? "—"} · ${fmtDateTime(tarea.created_at)}`}
          />
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Comentarios
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
            {tarea.descripcion?.trim() || "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className={`mt-0.5 text-sm ${alerta ? "font-semibold text-red-600" : "text-slate-700 dark:text-slate-200"}`}>
        {valor}
        {alerta ? " (vencida)" : ""}
      </p>
    </div>
  );
}
