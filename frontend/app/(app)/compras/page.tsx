"use client";

import { AlertTriangle, Clock, Inbox, Paperclip } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  useResponderCompras,
  useSolicitud,
  useSolicitudes,
  useUpdateSolicitud,
} from "@/lib/solicitudes";
import type { EstadoSolicitud, Solicitud, SolicitudDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

const ESTADO_LABEL: Record<EstadoSolicitud, { label: string; tone: "info" | "success" | "default" }> = {
  enviada: { label: "Pendiente", tone: "info" },
  respondida: { label: "Respondida", tone: "success" },
  cerrada: { label: "Cerrada", tone: "default" },
};

type Filtro = "pendientes" | "respondidas" | "todas";

function fmtDia(d: string | null): string {
  return d ? d.split("-").reverse().join("/") : "—";
}

// Antigüedad desde que se envió (o se creó): días + semáforo.
function antiguedad(s: Solicitud): { dias: number; texto: string } {
  const base = s.fecha_envio ?? s.created_at ?? null;
  if (!base) return { dias: 0, texto: "—" };
  const ms = Date.now() - new Date(base).getTime();
  const dias = Math.floor(ms / 86_400_000);
  if (dias <= 0) return { dias, texto: "hoy" };
  return { dias, texto: `hace ${dias} día${dias === 1 ? "" : "s"}` };
}

function estaVencida(s: Solicitud): boolean {
  return (
    s.estado !== "cerrada" &&
    !!s.fecha_limite &&
    new Date(s.fecha_limite) < new Date(new Date().toDateString())
  );
}

export default function ComprasPage() {
  const { data: solicitudes, isLoading } = useSolicitudes();
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [abierta, setAbierta] = useState<number | null>(null);

  const lista = useMemo(() => {
    const arr = solicitudes ?? [];
    const filtradas =
      filtro === "todas"
        ? arr
        : arr.filter((s) =>
            filtro === "pendientes" ? s.estado === "enviada" : s.estado === "respondida"
          );
    // Pendientes primero, y dentro más viejas arriba.
    return [...filtradas].sort((a, b) => {
      const va = a.fecha_envio ?? a.created_at ?? "";
      const vb = b.fecha_envio ?? b.created_at ?? "";
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
  }, [solicitudes, filtro]);

  const pendientes = (solicitudes ?? []).filter((s) => s.estado === "enviada").length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Cola de Compras</h1>
        <p className="mt-1 text-sm text-ink-2">
          Solicitudes de cotización de todo el equipo. {pendientes} pendiente
          {pendientes === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-surface2 p-1">
        {(
          [
            ["pendientes", "Pendientes"],
            ["respondidas", "Respondidas"],
            ["todas", "Todas"],
          ] as const
        ).map(([k, txt]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFiltro(k)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition sm:flex-none sm:px-4",
              filtro === k ? "bg-surface text-ink shadow-sm" : "text-ink-2"
            )}
          >
            {txt}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {isLoading ? (
          <p className="p-6 text-sm text-ink-2">Cargando…</p>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Inbox size={36} className="text-ink-3/50" />
            <p className="text-sm font-semibold text-ink">Sin solicitudes</p>
            <p className="text-sm text-ink-2">No hay solicitudes en esta vista.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold text-ink-2">
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Vendedor</th>
                <th className="px-4 py-2.5">Requerimiento</th>
                <th className="px-4 py-2.5">Cond. pago</th>
                <th className="px-4 py-2.5">Límite</th>
                <th className="px-4 py-2.5">Antigüedad</th>
                <th className="px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => {
                const vencida = estaVencida(s);
                const ant = antiguedad(s);
                const meta = ESTADO_LABEL[s.estado];
                return (
                  <tr
                    key={s.id}
                    onClick={() => setAbierta(s.id)}
                    className="cursor-pointer border-b border-line transition last:border-0 hover:bg-surface2"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      {s.oportunidad?.cliente?.razon_social ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{s.solicitante?.nombre ?? "—"}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-ink-2">{s.requerimiento}</td>
                    <td className="px-4 py-3 text-ink-2">{s.condicion_pago ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-2">
                      <span className={cn("flex items-center gap-1", vencida && "text-danger")}>
                        {vencida && <AlertTriangle size={13} />}
                        {fmtDia(s.fecha_limite)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          s.estado === "enviada" && ant.dias >= 3 ? "text-danger" : "text-ink-3"
                        )}
                      >
                        <Clock size={12} /> {ant.texto}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {abierta !== null && (
        <SolicitudDetalleModal id={abierta} onClose={() => setAbierta(null)} />
      )}
    </div>
  );
}

function SolicitudDetalleModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: s, isLoading } = useSolicitud(id);
  const responder = useResponderCompras(id);
  const toast = useToast();
  const [cuerpo, setCuerpo] = useState("");
  const [enviarMail, setEnviarMail] = useState(true);

  const enviar = () => {
    if (!cuerpo.trim()) return;
    responder.mutate(
      { cuerpo, enviar_mail: enviarMail },
      {
        onSuccess: () => {
          toast.toast(
            enviarMail ? "Respuesta cargada y enviada al vendedor" : "Respuesta cargada",
            "success"
          );
          setCuerpo("");
        },
        onError: () => toast.toast("No se pudo cargar la respuesta", "error"),
      }
    );
  };

  return (
    <Modal open onClose={onClose} title="Solicitud de cotización" size="5xl">
      {isLoading || !s ? (
        <p className="text-sm text-ink-2">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Dato label="Cliente" valor={s.oportunidad?.cliente?.razon_social ?? "—"} />
            <Dato label="Vendedor" valor={s.solicitante?.nombre ?? "—"} />
            <Dato label="N° de cliente" valor={s.numero_cliente ?? "—"} />
            <Dato label="Condición de pago" valor={s.condicion_pago ?? "—"} />
            <Dato label="Fecha límite" valor={fmtDia(s.fecha_limite)} />
            <Dato
              label="Referencia GBP"
              valor={s.presupuesto_gbp_referencia ?? "—"}
            />
          </div>

          {s.oportunidad && (
            <Link
              href={`/oportunidades?op=${s.oportunidad.id}`}
              className="text-sm font-medium text-accent hover:underline"
            >
              Ver oportunidad #{s.oportunidad.id} →
            </Link>
          )}

          <div>
            <p className="mb-1 text-sm font-medium text-ink-2">Requerimiento</p>
            <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface2/40 p-3 text-sm text-ink">
              {s.requerimiento}
            </p>
          </div>

          {(s.archivos_adjuntos ?? []).length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-ink-2">Adjuntos</p>
              <ul className="flex flex-wrap gap-2">
                {(s.archivos_adjuntos ?? []).map((a, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-1.5 rounded-md border border-line bg-surface2/50 px-2 py-1 text-xs text-ink"
                  >
                    <Paperclip size={12} className="text-ink-3" />
                    <span className="max-w-[200px] truncate">{a.filename}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <SeguimientoForm solicitud={s} />

          {(s.respuestas ?? []).length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-ink-2">Respuestas cargadas</p>
              <ul className="flex flex-col gap-2">
                {(s.respuestas ?? []).map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-line bg-surface2/40 p-3"
                  >
                    <p className="whitespace-pre-wrap text-sm text-ink">
                      {r.contenido_raw}
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {new Date(r.fecha_recepcion).toLocaleString("es-AR")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Responder cotización (Compras, dentro del CRM) */}
          <div className="rounded-lg border border-line p-3">
            <p className="mb-2 text-sm font-semibold text-ink">Responder cotización</p>
            <Textarea
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              placeholder="Precios, plazo de entrega, condiciones…"
              rows={5}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={enviarMail}
                  onChange={(e) => setEnviarMail(e.target.checked)}
                  className="h-4 w-4 rounded border-line accent-accent"
                />
                Enviar también por mail al vendedor
              </label>
              <Button onClick={enviar} disabled={responder.isPending || !cuerpo.trim()}>
                {responder.isPending ? "Enviando…" : "Cargar respuesta"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SeguimientoForm({ solicitud }: { solicitud: SolicitudDetail }) {
  const update = useUpdateSolicitud(solicitud.id);
  const toast = useToast();
  const [eta, setEta] = useState(solicitud.eta ?? "");
  const [proveedor, setProveedor] = useState(solicitud.proveedor ?? "");
  const [notas, setNotas] = useState(solicitud.seguimiento_notas ?? "");

  const guardar = () => {
    update.mutate(
      {
        eta: eta || null,
        proveedor: proveedor || null,
        seguimiento_notas: notas || null,
      },
      {
        onSuccess: () => toast.toast("Seguimiento guardado", "success"),
        onError: () => toast.toast("No se pudo guardar el seguimiento", "error"),
      }
    );
  };

  return (
    <div className="rounded-lg border border-line p-3">
      <p className="mb-2 text-sm font-semibold text-ink">Seguimiento</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-ink-3">Entrega estimada</label>
          <Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-3">Proveedor</label>
          <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        </div>
      </div>
      <label className="mb-1 mt-2 block text-xs text-ink-3">Notas</label>
      <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
      <div className="mt-2 flex justify-end">
        <Button variant="outline" onClick={guardar} disabled={update.isPending}>
          {update.isPending ? "Guardando…" : "Guardar seguimiento"}
        </Button>
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-ink-3">{label}</p>
      <p className="text-ink">{valor}</p>
    </div>
  );
}
