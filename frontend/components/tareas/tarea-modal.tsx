"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { ClientePicker } from "@/components/clientes/cliente-picker";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { SelectMenu } from "@/components/ui/select-menu";
import { Textarea } from "@/components/ui/textarea";
import { useClientes } from "@/lib/clientes";
import { useOportunidades } from "@/lib/oportunidades";
import type { Oportunidad } from "@/lib/types";
import { cn } from "@/lib/utils";

// Buscador de oportunidad: input + desplegable en portal (no lo recorta el
// scroll del modal) con búsqueda por N°, cliente o asunto.
function OportunidadPicker({
  oportunidades,
  value,
  onChange,
}: {
  oportunidades: Oportunidad[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const etiqueta = (o: Oportunidad) =>
    `#${o.id} · ${o.cliente?.razon_social ?? o.asunto ?? "s/asunto"}`;
  const selected = useMemo(
    () => oportunidades.find((o) => o.id === value) ?? null,
    [oportunidades, value],
  );
  const [query, setQuery] = useState(selected ? etiqueta(selected) : "");
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(selected ? etiqueta(selected) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const abrir = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, top: r.bottom + 4, width: r.width });
    setOpen(true);
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const igualAlSeleccionado = selected && q === etiqueta(selected).toLowerCase();
    const list =
      !q || igualAlSeleccionado
        ? oportunidades
        : oportunidades.filter((o) => etiqueta(o).toLowerCase().includes(q));
    return list.slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidades, query, selected]);

  const elegir = (o: Oportunidad | null) => {
    onChange(o ? o.id : null);
    setQuery(o ? etiqueta(o) : "");
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) abrir();
        }}
        onFocus={abrir}
        placeholder="— Ninguna — (buscá por N°, cliente o asunto)"
        className="h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              className="fixed inset-0 z-[55] cursor-default"
              onClick={() => setOpen(false)}
            />
            <ul
              style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width }}
              className="z-[60] max-h-72 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-pop"
            >
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(null)}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink-3 hover:bg-surface2"
                >
                  — Ninguna —
                </button>
              </li>
              {matches.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegir(o)}
                    className={cn(
                      "block w-full truncate rounded-md px-3 py-2 text-left text-sm transition-colors",
                      o.id === value
                        ? "bg-accent-dim font-medium text-accent"
                        : "text-ink hover:bg-surface2",
                    )}
                  >
                    {etiqueta(o)}
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="px-3 py-2 text-sm text-ink-3">Sin coincidencias.</li>
              )}
            </ul>
          </>,
          document.body,
        )}
    </div>
  );
}
import {
  PRIORIDAD_OPCIONES,
  type PrioridadTarea,
  SUBTIPO_OPCIONES,
  type Tarea,
  useCreateTarea,
  useDeleteTarea,
  useUpdateTarea,
} from "@/lib/tareas";

interface Props {
  open: boolean;
  onClose: () => void;
  tarea?: Tarea | null; // si viene, es edición
  fechaPorDefecto?: string; // para alta rápida "de hoy"
}

const pad = (n: number) => String(n).padStart(2, "0");
const aFechaLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const aHoraLocal = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function TareaModal({ open, onClose, tarea, fechaPorDefecto }: Props) {
  const crear = useCreateTarea();
  const actualizar = useUpdateTarea();
  const borrar = useDeleteTarea();
  const confirm = useConfirm();

  const { data: clientes } = useClientes();
  const { data: oportunidades } = useOportunidades();

  const [titulo, setTitulo] = useState(tarea?.titulo ?? "");
  const [subtipo, setSubtipo] = useState(tarea?.subtipo ?? "");
  const [fecha, setFecha] = useState(tarea?.fecha_vencimiento ?? fechaPorDefecto ?? "");
  const [prioridad, setPrioridad] = useState<PrioridadTarea>(tarea?.prioridad ?? "media");
  const [completada, setCompletada] = useState(tarea?.completada ?? false);
  const [comentarios, setComentarios] = useState(tarea?.descripcion ?? "");
  const [clienteId, setClienteId] = useState<number | null>(tarea?.cliente_id ?? null);
  const [oportunidadId, setOportunidadId] = useState<number | null>(tarea?.oportunidad_id ?? null);

  const recInicial = tarea?.recordatorio ? new Date(tarea.recordatorio) : null;
  const [recordatorioOn, setRecordatorioOn] = useState(Boolean(recInicial));
  const [recFecha, setRecFecha] = useState(
    recInicial ? aFechaLocal(recInicial) : fechaPorDefecto ?? ""
  );
  const [recHora, setRecHora] = useState(recInicial ? aHoraLocal(recInicial) : "09:00");

  const esEdicion = Boolean(tarea);
  const pendiente = crear.isPending || actualizar.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    const body = {
      titulo: titulo.trim(),
      subtipo: subtipo || null,
      fecha_vencimiento: fecha || null,
      prioridad,
      completada,
      descripcion: comentarios.trim() || null,
      cliente_id: clienteId,
      oportunidad_id: oportunidadId,
      recordatorio:
        recordatorioOn && recFecha
          ? new Date(`${recFecha}T${recHora || "09:00"}`).toISOString()
          : null,
    };
    if (tarea) {
      actualizar.mutate({ id: tarea.id, body }, { onSuccess: onClose });
    } else {
      crear.mutate(body, { onSuccess: onClose });
    }
  };

  const eliminar = async () => {
    if (tarea && (await confirm({ message: "¿Eliminar esta tarea?", danger: true, title: "Eliminar tarea" }))) {
      borrar.mutate(tarea.id, { onSuccess: onClose });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={esEdicion ? "Editar tarea" : "Nueva tarea"} size="5xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="t-asunto">Asunto *</Label>
            <Input
              id="t-asunto"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Llamar a BENCEN por la cotización"
              required
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="t-subtipo">Subtipo</Label>
            <SelectMenu
              id="t-subtipo"
              value={subtipo}
              onChange={setSubtipo}
              placeholder="— Ninguno —"
              options={[{ value: "", label: "— Ninguno —" }, ...SUBTIPO_OPCIONES]}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="t-fecha">Vencimiento</Label>
            <Input
              id="t-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="t-prioridad">Prioridad</Label>
            <SelectMenu
              id="t-prioridad"
              value={prioridad}
              onChange={(v) => setPrioridad(v as PrioridadTarea)}
              options={PRIORIDAD_OPCIONES.map((p) => ({ value: p.value, label: p.label }))}
            />
          </div>
          <div>
            <Label htmlFor="t-estado">Estado</Label>
            <SelectMenu
              id="t-estado"
              value={completada ? "completado" : "abierto"}
              onChange={(v) => setCompletada(v === "completado")}
              options={[
                { value: "abierto", label: "Abierto" },
                { value: "completado", label: "Completado" },
              ]}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="t-comentarios">Comentarios</Label>
          <Textarea
            id="t-comentarios"
            rows={4}
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            placeholder="Notas, detalles, contexto de la tarea…"
          />
        </div>

        {/* Relacionado con: cuenta y/o oportunidad */}
        <div>
          <Label>Cuenta relacionada</Label>
          <ClientePicker
            clientes={clientes ?? []}
            value={clienteId}
            onChange={setClienteId}
          />
        </div>
        <div>
          <Label>Oportunidad relacionada</Label>
          <OportunidadPicker
            oportunidades={oportunidades ?? []}
            value={oportunidadId}
            onChange={setOportunidadId}
          />
        </div>

        {/* Otra información: recordatorio */}
        <div className="rounded-md border border-line p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={recordatorioOn}
              onChange={(e) => setRecordatorioOn(e.target.checked)}
              className="h-4 w-4 accent-navy"
            />
            Recordatorio establecido
          </label>
          {recordatorioOn && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="t-rec-fecha">Fecha</Label>
                <Input
                  id="t-rec-fecha"
                  type="date"
                  value={recFecha}
                  onChange={(e) => setRecFecha(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="t-rec-hora">Hora</Label>
                <Input
                  id="t-rec-hora"
                  type="time"
                  value={recHora}
                  onChange={(e) => setRecHora(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Información del sistema (solo edición) */}
        {esEdicion && tarea && (
          <div className="grid grid-cols-2 gap-3 rounded-md bg-surface2 p-3 text-xs">
            <div>
              <div className="font-semibold text-ink-2">Creado por</div>
              <div className="text-ink-2">
                {tarea.usuario?.nombre ?? "—"}, {fmtDateTime(tarea.created_at)}
              </div>
            </div>
            <div>
              <div className="font-semibold text-ink-2">
                Última modificación
              </div>
              <div className="text-ink-2">
                {tarea.usuario?.nombre ?? "—"}, {fmtDateTime(tarea.updated_at)}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {esEdicion ? (
            <Button type="button" variant="ghost" onClick={eliminar} className="text-red-600">
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente || !titulo.trim()}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
