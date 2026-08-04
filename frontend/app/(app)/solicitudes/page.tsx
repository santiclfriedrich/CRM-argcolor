"use client";

import { Building2, Copy, FileText, Hash, Mail, Paperclip, Plus, Send, Sparkles, Target, User } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SolicitudForm } from "@/components/solicitudes/solicitud-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefChip } from "@/components/ui/ref-chip";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
import { errorMessage as errorMsg } from "@/lib/utils";

const TONO_SOLICITUD = {
  enviada: "warning",
  respondida: "success",
  cerrada: "neutral",
} as const satisfies Record<EstadoSolicitud, string>;

export default function SolicitudesPage() {
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading, isError } = useSolicitudes();
  const createMut = useCreateSolicitud();

  const { data: session } = useSession();
  const currentUserId = Number(session?.usuario?.id) || null;
  const rol = (session?.usuario as { rol?: string } | undefined)?.rol;
  const [filtro, setFiltro] = useState<"mias" | "todas">(
    rol === "vendedor" ? "mias" : "todas"
  );
  // Default por rol: "mias" para vendedor, "todas" para admin/compras. Como `rol`
  // puede llegar undefined en el primer render, lo ajustamos una sola vez cuando
  // la sesión carga, sin pisar un cambio manual del usuario.
  const defaultToggleAplicado = useRef(false);
  useEffect(() => {
    if (!rol || defaultToggleAplicado.current) return;
    defaultToggleAplicado.current = true;
    setFiltro(rol === "vendedor" ? "mias" : "todas");
  }, [rol]);

  const visibles = (data ?? []).filter(
    (s) => filtro === "todas" || s.solicitante?.id === currentUserId
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Solicitudes a Compras</h1>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nueva solicitud
        </Button>
      </div>

      {data && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full border border-line bg-surface2 p-0.5 text-sm">
            {(["todas", "mias"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  filtro === f
                    ? "bg-navy text-white"
                    : "text-ink-2 hover:bg-surface"
                }`}
              >
                {f === "mias" ? "Mías" : "Todas"}
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-2">
            {visibles.length} {visibles.length === 1 ? "solicitud" : "solicitudes"}
          </p>
        </div>
      )}

      {isLoading && <p className="mt-4 text-ink-2">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-danger">
          No se pudo cargar. ¿El backend está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {data && (
        <div className="mt-6 min-h-0 flex-1 overflow-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line [&_th]:bg-surface2 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-ink">
                <th className="w-12">
                  <span className="inline-flex items-center gap-1.5">
                    <Hash size={13} className="text-ink-3" /> ID
                  </span>
                </th>
                <th>
                  <span className="inline-flex items-center gap-1.5">
                    <Target size={13} className="text-ink-3" /> Oportunidad
                  </span>
                </th>
                <th>
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 size={13} className="text-ink-3" /> Cliente
                  </span>
                </th>
                <th>
                  <span className="inline-flex items-center gap-1.5">
                    <FileText size={13} className="text-ink-3" /> Requerimiento
                  </span>
                </th>
                <th>
                  <span className="inline-flex items-center gap-1.5">
                    <User size={13} className="text-ink-3" /> Solicitante
                  </span>
                </th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibles.map((s) => {
                const meta = ESTADO_SOLICITUD_META[s.estado];
                return (
                  <tr
                    key={s.id}
                    className="cursor-pointer border-t border-line transition-colors hover:bg-surface2"
                    onClick={() => setDetailId(s.id)}
                  >
                    <td className="px-3 py-2 font-mono tabular-nums text-ink-2">{s.id}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/oportunidades?op=${s.oportunidad_id}`}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        className="inline-flex max-w-full"
                      >
                        <RefChip icon={<Target size={12} className="shrink-0 text-ink-3" />}>
                          {s.oportunidad?.asunto ?? `Oportunidad ${s.oportunidad_id}`}
                        </RefChip>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {s.oportunidad?.cliente?.razon_social ? (
                        <RefChip icon={<Building2 size={12} className="shrink-0 text-ink-3" />}>
                          {s.oportunidad.cliente.razon_social}
                        </RefChip>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-ink-2">
                      {s.requerimiento}
                    </td>
                    <td className="px-3 py-2">
                      {s.solicitante?.nombre ? (
                        <RefChip icon={<User size={12} className="shrink-0 text-ink-3" />}>
                          {s.solicitante.nombre}
                        </RefChip>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={TONO_SOLICITUD[s.estado]}>{meta.label}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right text-ink-3">
                      <Mail size={15} className="inline" />
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-3">
                    {data.length > 0 && filtro === "mias"
                      ? "No tenés solicitudes propias. Cambiá a “Todas” para ver las del equipo."
                      : "No hay solicitudes todavía."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nueva solicitud a Compras"
        size="3xl"
      >
        <SolicitudForm
          isPending={createMut.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(values, files) =>
            createMut.mutate({ body: values, files }, { onSuccess: (s) => {
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
  const confirm = useConfirm();

  const setEstado = (estado: EstadoSolicitud) => updateMut.mutate({ estado });

  return (
    <Modal open onClose={onClose} title={`Solicitud #${id}`} size="3xl">
      {isLoading || !solicitud ? (
        <p className="text-ink-2">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-2">Estado:</span>
            <Badge tone={TONO_SOLICITUD[solicitud.estado]}>
              {ESTADO_SOLICITUD_META[solicitud.estado].label}
            </Badge>
            <div className="ml-auto flex gap-1">
              {solicitud.estado === "cerrada" ? (
                <Button size="sm" variant="ghost" onClick={() => setEstado("enviada")}>
                  Reabrir
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (
                      await confirm({
                        message:
                          "Marcar la solicitud como cerrada. Dejará de recibir la respuesta de Compras automáticamente. ¿Continuar?",
                        danger: true,
                        title: "Cerrar solicitud",
                      })
                    ) {
                      setEstado("cerrada");
                    }
                  }}
                >
                  Marcar como cerrada
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
    <div className="rounded-lg border border-line bg-surface2 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium text-ink">Mail a Compras</p>
        {yaEnviado && <span className="text-xs text-success">Enviado por Gmail ✓</span>}
      </div>
      <dl className="space-y-1 text-ink-2">
        <Row label="Para" value={solicitud.email_preview.to ?? "(configurar email de Compras)"} />
        <Row label="CC" value={solicitud.email_preview.cc.join(", ") || "—"} />
        <Row label="Asunto" value={solicitud.email_preview.subject} />
      </dl>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-line bg-surface p-2 text-xs text-ink">
        {solicitud.email_preview.body}
      </pre>
      {solicitud.archivos_adjuntos && solicitud.archivos_adjuntos.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-2">Adjuntos:</span>
          {solicitud.archivos_adjuntos.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded bg-surface px-2 py-0.5 text-xs text-ink-2"
            >
              <Paperclip size={12} /> {a.filename}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={() => enviarMut.mutate()} disabled={enviarMut.isPending}>
          <Send size={14} />
          {enviarMut.isPending ? "Enviando…" : yaEnviado ? "Reenviar a Compras" : "Enviar a Compras"}
        </Button>
        <Button size="sm" variant="secondary" onClick={copyEmail}>
          <Copy size={14} /> {copied ? "¡Copiado!" : "Copiar"}
        </Button>
        {enviarMut.isError && (
          <span className="text-xs text-danger">
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
    <div className="rounded-lg border border-line bg-surface p-3 text-sm">
      <p className="mb-2 font-medium text-ink">Respuesta de Compras</p>

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
              <span className="text-xs text-danger">
                {errorMsg(parseMut.error, "No se pudo parsear")}
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="[&_th]:border-b [&_th]:border-line [&_th]:bg-surface2 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-ink">
                  <th>Descripción</th>
                  <th>Cant.</th>
                  <th className="!text-right">P. unit.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">
                      {it.fabricante ? `${it.fabricante} · ` : ""}
                      {it.descripcion}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-ink-2">{it.cantidad}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink-2">
                      {it.precio_unitario}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ultima?.notas_compras && (
            <p className="mt-2 text-xs text-ink-2">
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
              <span className="text-xs text-danger">
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
      <dt className="w-14 shrink-0 font-medium text-ink-2">{label}:</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
