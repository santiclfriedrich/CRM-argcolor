"use client";

import { useState, type FormEvent } from "react";

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
    <Modal open={open} onClose={onClose} title={esEdicion ? "Editar tarea" : "Nueva tarea"} size="xl">
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
          <Label htmlFor="t-oportunidad">Oportunidad relacionada</Label>
          <SelectMenu
            id="t-oportunidad"
            value={oportunidadId != null ? String(oportunidadId) : ""}
            onChange={(v) => setOportunidadId(v ? Number(v) : null)}
            placeholder="— Ninguna —"
            options={[
              { value: "", label: "— Ninguna —" },
              ...(oportunidades ?? []).map((o) => ({
                value: String(o.id),
                label: `#${o.id} · ${o.cliente?.razon_social ?? o.asunto ?? "s/asunto"}`,
              })),
            ]}
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
