"use client";

import { Copy, Mail, Plus } from "lucide-react";
import { useState } from "react";

import { SolicitudForm } from "@/components/solicitudes/solicitud-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  ESTADO_SOLICITUD_META,
  useCreateSolicitud,
  useSolicitud,
  useSolicitudes,
  useUpdateSolicitud,
} from "@/lib/solicitudes";
import type { EstadoSolicitud } from "@/lib/types";

export default function SolicitudesPage() {
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading, isError } = useSolicitudes();
  const createMut = useCreateSolicitud();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Solicitudes a Compras</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nueva solicitud
        </Button>
      </div>

      {isLoading && <p className="mt-4 text-slate-500">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-red-600">
          No se pudo cargar. ¿El backend está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {data && (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">ID</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Requerimiento</th>
                <th className="px-4 py-2 font-medium">Solicitante</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((s) => {
                const meta = ESTADO_SOLICITUD_META[s.estado];
                return (
                  <tr
                    key={s.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => setDetailId(s.id)}
                  >
                    <td className="px-4 py-2 font-mono text-slate-500">{s.id}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {s.oportunidad?.cliente?.razon_social ?? "—"}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-slate-600">
                      {s.requerimiento}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{s.solicitante?.nombre ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge className={meta.color}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-400">
                      <Mail size={15} className="inline" />
                    </td>
                  </tr>
                );
              })}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    No hay solicitudes todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva solicitud a Compras">
        <SolicitudForm
          isPending={createMut.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(values) =>
            createMut.mutate(values, { onSuccess: (s) => {
              setCreating(false);
              setDetailId(s.id);
            } })
          }
        />
      </Modal>

      {detailId !== null && (
        <SolicitudDetailModal id={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

function SolicitudDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: solicitud, isLoading } = useSolicitud(id);
  const updateMut = useUpdateSolicitud(id);
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    if (!solicitud) return;
    const { subject, body } = solicitud.email_preview;
    await navigator.clipboard.writeText(`Asunto: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setEstado = (estado: EstadoSolicitud) => updateMut.mutate({ estado });

  return (
    <Modal open onClose={onClose} title={`Solicitud #${id}`}>
      {isLoading || !solicitud ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Estado:</span>
            <Badge className={ESTADO_SOLICITUD_META[solicitud.estado].color}>
              {ESTADO_SOLICITUD_META[solicitud.estado].label}
            </Badge>
            <div className="ml-auto flex gap-1">
              {solicitud.estado !== "respondida" && (
                <Button size="sm" variant="outline" onClick={() => setEstado("respondida")}>
                  Marcar respondida
                </Button>
              )}
              {solicitud.estado !== "cerrada" && (
                <Button size="sm" variant="ghost" onClick={() => setEstado("cerrada")}>
                  Cerrar
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="mb-2 font-medium text-slate-700">Borrador de mail a Compras</p>
            <dl className="space-y-1 text-slate-600">
              <Row label="Para" value={solicitud.email_preview.to ?? "(configurar email de Compras)"} />
              <Row label="CC" value={solicitud.email_preview.cc.join(", ") || "—"} />
              <Row label="Asunto" value={solicitud.email_preview.subject} />
            </dl>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-xs text-slate-700">
              {solicitud.email_preview.body}
            </pre>
            <Button size="sm" variant="secondary" className="mt-2" onClick={copyEmail}>
              <Copy size={14} /> {copied ? "¡Copiado!" : "Copiar mail"}
            </Button>
            <p className="mt-2 text-xs text-slate-400">
              El envío automático por Gmail llega en Fase 2. Por ahora, copiá y enviá manualmente.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 font-medium text-slate-500">{label}:</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  );
}
