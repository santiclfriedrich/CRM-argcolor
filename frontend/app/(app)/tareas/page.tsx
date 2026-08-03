"use client";

import { BellRing, CheckCircle2, ListChecks, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import { TareaModal } from "@/components/tareas/tarea-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Tareas</h1>
        </div>
        <Button onClick={() => setCreando(true)}>
          <Plus size={16} /> Nueva tarea
        </Button>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Lista */}
        <div className="flex flex-col gap-3">
          <div className="flex rounded-md border border-line p-0.5 text-sm">
            {(["pendientes", "completadas"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded px-3 py-1 font-medium transition ${
                  tab === t
                    ? "bg-navy text-white"
                    : "text-ink-2 hover:bg-surface2"
                }`}
              >
                {t === "pendientes" ? "Pendientes" : "Completadas"}
              </button>
            ))}
          </div>

          <Card className="overflow-hidden">
            {isLoading && <p className="p-4 text-sm text-ink-2">Cargando…</p>}
            <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
              {tareas.map((t) => {
                const activa = seleccionada?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelId(t.id)}
                      className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
                        activa
                          ? "bg-accent-dim shadow-[inset_3px_0_0] shadow-accent"
                          : "hover:bg-surface2"
                      }`}
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORIDAD_META[t.prioridad].color}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm font-medium ${
                            t.completada
                              ? "text-ink-3 line-through"
                              : "text-ink"
                          }`}
                        >
                          {t.titulo}
                        </span>
                        <span className="block truncate text-xs text-ink-3">
                          {t.cliente
                            ? `${t.cliente.razon_social}${
                                t.cliente.numero_cliente ? ` (${t.cliente.numero_cliente})` : ""
                              }`
                            : (t.usuario?.nombre ?? "—")}{" "}
                          · {fmtFecha(t.fecha_vencimiento)}
                        </span>
                      </span>
                      {t.recordatorio && (
                        <BellRing size={13} className="shrink-0 text-ink-3" />
                      )}
                    </button>
                  </li>
                );
              })}
              {!isLoading && tareas.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-ink-3">
                  {tab === "pendientes"
                    ? "No tenés tareas pendientes."
                    : "Todavía no completaste ninguna."}
                </li>
              )}
            </ul>
          </Card>
        </div>

        {/* Detalle */}
        {seleccionada ? (
          <DetalleTarea
            tarea={seleccionada}
            onModificar={() => setEditar(seleccionada)}
          />
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-line p-10 text-sm text-ink-3">
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
  const confirm = useConfirm();

  const eliminar = async () => {
    if (await confirm({ title: "Eliminar tarea", message: `¿Eliminar la tarea "${tarea.titulo}"?`, danger: true }))
      borrar.mutate(tarea.id);
  };
  const toggle = () =>
    actualizar.mutate({ id: tarea.id, body: { completada: !tarea.completada } });

  const relacionado = tarea.cliente
    ? `${tarea.cliente.razon_social}${
        tarea.cliente.numero_cliente ? ` · N° ${tarea.cliente.numero_cliente}` : ""
      }`
    : (tarea.oportunidad?.asunto ?? null);

  return (
    <Card>
      {/* Encabezado + acciones */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white">
            <ListChecks size={20} />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink">{tarea.titulo}</h2>
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
            className="text-danger"
          >
            <Trash2 size={14} /> Eliminar
          </Button>
        </div>
      </div>

      {/* Información de la tarea */}
      <div className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Badge tone={tarea.completada ? "success" : "info"}>
            {tarea.completada ? "Completado" : "Abierto"}
          </Badge>
          <Badge>
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
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
            Comentarios
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
            {tarea.descripcion?.trim() || "—"}
          </p>
        </div>
      </div>
    </Card>
  );
}

function Campo({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </p>
      <p className={`mt-0.5 text-sm ${alerta ? "font-semibold text-danger" : "text-ink"}`}>
        {valor}
        {alerta ? " (vencida)" : ""}
      </p>
    </div>
  );
}
