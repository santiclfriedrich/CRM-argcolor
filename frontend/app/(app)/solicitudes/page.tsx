"use client";

import { Copy, FileText, Mail, Plus, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SolicitudForm } from "@/components/solicitudes/solicitud-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useCrearDesdeSolicitud } from "@/lib/presupuestos";
import {
  ESTADO_SOLICITUD_META,
  useCargarRespuesta,
  useCreateSolicitud,
  useEnviarSolicitud,
  useSolicitud,
  useSolicitudes,
  useUpdateSolicitud,
} from "@/lib/solicitudes";
import type { EstadoSolicitud, SolicitudDetail } from "@/lib/types";

function errorMsg(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback
  );
}

export default function SolicitudesPage() {
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading, isError } = useSolicitudes();
  const createMut = useCreateSolicitud();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Solicitudes a Compras</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nueva solicitud
        </Button>
      </div>

      {isLoading && <p className="mt-4 text-slate-500 dark:text-slate-400">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-red-600">
          No se pudo cargar. ¿El backend está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {data && (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-slate-500 dark:text-slate-400">
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
                    className="cursor-pointer border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => setDetailId(s.id)}
                  >
                    <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400">{s.id}</td>
                    <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">
                      {s.oportunidad?.cliente?.razon_social ?? "—"}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-slate-600 dark:text-slate-300">
                      {s.requerimiento}
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{s.solicitante?.nombre ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge className={meta.color}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-400 dark:text-slate-500">
                      <Mail size={15} className="inline" />
                    </td>
                  </tr>
                );
              })}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
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

  const setEstado = (estado: EstadoSolicitud) => updateMut.mutate({ estado });

  return (
    <Modal open onClose={onClose} title={`Solicitud #${id}`}>
      {isLoading || !solicitud ? (
        <p className="text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">Estado:</span>
            <Badge className={ESTADO_SOLICITUD_META[solicitud.estado].color}>
              {ESTADO_SOLICITUD_META[solicitud.estado].label}
            </Badge>
            <div className="ml-auto flex gap-1">
              {solicitud.estado !== "cerrada" && (
                <Button size="sm" variant="ghost" onClick={() => setEstado("cerrada")}>
                  Cerrar
                </Button>
              )}
            </div>
          </div>

          <EnvioCompras solicitud={solicitud} />
          <RespuestaCompras solicitud={solicitud} onClose={onClose} />
        </div>
      )}
    </Modal>
  );
}

// Paso 1 (ida): enviar el pedido a Compras por Gmail (o copiarlo como respaldo).
function EnvioCompras({ solicitud }: { solicitud: SolicitudDetail }) {
  const enviarMut = useEnviarSolicitud(solicitud.id);
  const [copied, setCopied] = useState(false);
  const yaEnviado = Boolean(solicitud.gmail_thread_id);

  const copyEmail = async () => {
    const { subject, body } = solicitud.email_preview;
    await navigator.clipboard.writeText(`Asunto: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/50">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium text-slate-700 dark:text-slate-200">Mail a Compras</p>
        {yaEnviado && <span className="text-xs text-green-600">Enviado por Gmail ✓</span>}
      </div>
      <dl className="space-y-1 text-slate-600 dark:text-slate-300">
        <Row label="Para" value={solicitud.email_preview.to ?? "(configurar email de Compras)"} />
        <Row label="CC" value={solicitud.email_preview.cc.join(", ") || "—"} />
        <Row label="Asunto" value={solicitud.email_preview.subject} />
      </dl>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        {solicitud.email_preview.body}
      </pre>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={() => enviarMut.mutate()} disabled={enviarMut.isPending}>
          <Send size={14} />
          {enviarMut.isPending ? "Enviando…" : yaEnviado ? "Reenviar a Compras" : "Enviar a Compras"}
        </Button>
        <Button size="sm" variant="secondary" onClick={copyEmail}>
          <Copy size={14} /> {copied ? "¡Copiado!" : "Copiar"}
        </Button>
        {enviarMut.isError && (
          <span className="text-xs text-red-600">
            {errorMsg(enviarMut.error, "No se pudo enviar")}
          </span>
        )}
      </div>
    </div>
  );
}

// Paso 2 (vuelta): pegar la respuesta de Compras -> IA extrae ítems -> presupuesto.
function RespuestaCompras({
  solicitud,
  onClose,
}: {
  solicitud: SolicitudDetail;
  onClose: () => void;
}) {
  const router = useRouter();
  const parseMut = useCargarRespuesta(solicitud.id);
  const crearPresupuesto = useCrearDesdeSolicitud();
  const [texto, setTexto] = useState("");

  const ultima = solicitud.respuestas[solicitud.respuestas.length - 1];
  const items = ultima?.datos_parseados_ia?.items ?? [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-2 font-medium text-slate-700 dark:text-slate-200">Respuesta de Compras</p>

      {items.length === 0 ? (
        <>
          <Textarea
            rows={4}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Pegá acá la respuesta de Compras (la tabla de precios)…"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => parseMut.mutate(texto.trim())}
              disabled={parseMut.isPending || !texto.trim()}
            >
              <Sparkles size={14} /> {parseMut.isPending ? "Parseando…" : "Parsear con IA"}
            </Button>
            {parseMut.isError && (
              <span className="text-xs text-red-600">
                {errorMsg(parseMut.error, "No se pudo parsear")}
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-1 font-medium">Descripción</th>
                  <th className="px-2 py-1 font-medium">Cant.</th>
                  <th className="px-2 py-1 text-right font-medium">P. unit.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1 text-slate-700 dark:text-slate-200">
                      {it.fabricante ? `${it.fabricante} · ` : ""}
                      {it.descripcion}
                    </td>
                    <td className="px-2 py-1 text-slate-600 dark:text-slate-300">{it.cantidad}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {it.precio_unitario}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ultima?.notas_compras && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Notas: {ultima.notas_compras}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() =>
                crearPresupuesto.mutate(solicitud.id, {
                  onSuccess: (p) => {
                    onClose();
                    router.push(`/presupuestos/${p.id}`);
                  },
                })
              }
              disabled={crearPresupuesto.isPending}
            >
              <FileText size={14} />
              {crearPresupuesto.isPending ? "Creando…" : "Crear presupuesto"}
            </Button>
            {crearPresupuesto.isError && (
              <span className="text-xs text-red-600">
                {errorMsg(crearPresupuesto.error, "No se pudo crear")}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 font-medium text-slate-500 dark:text-slate-400">{label}:</dt>
      <dd className="text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  );
}
