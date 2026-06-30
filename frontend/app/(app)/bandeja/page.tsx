"use client";

import { ChevronRight, Copy, RefreshCw, Send, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import {
  useDescartados,
  useMails,
  useIngestEmail,
  useReprocesarDescartado,
  useSendAclaracion,
  useSendAcuse,
  useSyncGmail,
} from "@/lib/mails";
import { ESTADO_META, useDeleteOportunidad } from "@/lib/oportunidades";
import type { Adjunto, CategoriaMail, EmailData, Mail } from "@/lib/types";

// Etiquetas legibles de las categorías de descarte.
const CATEGORIA_LABEL: Record<CategoriaMail, string> = {
  consulta_comercial: "Consulta comercial",
  orden_compra: "Orden de compra",
  administrativo: "Administrativo",
  otro: "Otro",
};

export default function BandejaPage() {
  const { data: mails, isLoading } = useMails();
  const ingestMut = useIngestEmail();
  const syncMut = useSyncGmail();

  const [de, setDe] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");

  const procesar = (e: FormEvent) => {
    e.preventDefault();
    if (!de.trim() || !cuerpo.trim()) return;
    ingestMut.mutate(
      { de: de.trim(), asunto: asunto.trim() || null, cuerpo: cuerpo.trim() },
      {
        onSuccess: () => {
          setCuerpo("");
          setAsunto("");
        },
      }
    );
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bandeja inteligente</h1>
          <p className="mt-1 text-sm text-slate-500">
            La IA identifica la cuenta, extrae el pedido y crea la oportunidad. Podés pegar un
            mail abajo o sincronizar la casilla comercial.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          title="Trae mails nuevos de la casilla comercial (requiere Gmail configurado)"
        >
          <RefreshCw size={16} className={syncMut.isPending ? "animate-spin" : ""} />
          {syncMut.isPending ? "Sincronizando…" : "Sincronizar Gmail"}
        </Button>
      </div>
      {syncMut.isSuccess && (
        <div className="mt-2 text-sm">
          <p className="text-green-600">
            Sincronización OK: {syncMut.data.procesados} mail(s) nuevos procesados.
          </p>
          {syncMut.data.errores > 0 && (
            <p className="text-amber-600">
              {syncMut.data.errores} mail(s) no se pudieron procesar.
              {syncMut.data.ultimo_error ? ` ${syncMut.data.ultimo_error}` : ""}
            </p>
          )}
        </div>
      )}
      {syncMut.isError && (
        <p className="mt-2 text-sm text-red-600">
          {(syncMut.error as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail ?? "No se pudo sincronizar Gmail."}
        </p>
      )}

      <form
        onSubmit={procesar}
        className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="b-de">Remitente (email) *</Label>
            <Input
              id="b-de"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              placeholder="juan@bencen.com.ar"
              required
            />
          </div>
          <div>
            <Label htmlFor="b-asunto">Asunto</Label>
            <Input id="b-asunto" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="b-cuerpo">Cuerpo del mail *</Label>
          <Textarea
            id="b-cuerpo"
            rows={5}
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            placeholder="Pegá acá el texto del mail del cliente…"
            required
          />
        </div>
        {ingestMut.isError && (
          <p className="text-sm text-red-600">
            {(() => {
              const detail = (ingestMut.error as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail;
              return detail ?? "No se pudo procesar el mail. Revisá el backend.";
            })()}
          </p>
        )}
        {ingestMut.isSuccess && ingestMut.data.descartado && (
          <p className="rounded-md border border-slate-200 bg-slate-100 p-2 text-sm text-slate-600">
            La IA lo clasificó como{" "}
            <span className="font-medium">
              {ingestMut.data.categoria
                ? CATEGORIA_LABEL[ingestMut.data.categoria]
                : "no comercial"}
            </span>{" "}
            — no se creó oportunidad ni se respondió.
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={ingestMut.isPending || !de.trim() || !cuerpo.trim()}>
            <Sparkles size={16} /> {ingestMut.isPending ? "Procesando…" : "Procesar con IA"}
          </Button>
        </div>
      </form>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Mails procesados</h2>
      {isLoading && <p className="mt-2 text-slate-500">Cargando…</p>}
      <div className="mt-3 space-y-3">
        {mails?.map((m) => <MailCard key={m.id} mail={m} />)}
        {mails && mails.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            Todavía no procesaste ningún mail.
          </p>
        )}
      </div>

      <Descartados />
    </div>
  );
}

// Mails que la IA descartó por no ser consultas comerciales. Colapsado por
// defecto: sirve para verificar que no se esté tirando nada importante.
function Descartados() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useDescartados(open);
  const reprocesarMut = useReprocesarDescartado();

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ChevronRight size={16} className={open ? "rotate-90 transition" : "transition"} />
        Descartados por la IA
        {data && <span className="text-slate-400">({data.length})</span>}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {isLoading && <p className="text-sm text-slate-400">Cargando…</p>}
          {data?.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="text-slate-700">{d.de ?? "—"}</span>
                {d.asunto && <span className="ml-2 text-slate-400">· {d.asunto}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-slate-200 text-slate-600">
                  {CATEGORIA_LABEL[d.categoria]}
                </Badge>
                <button
                  type="button"
                  onClick={() => reprocesarMut.mutate(d.id)}
                  disabled={reprocesarMut.isPending}
                  className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
                  title="Sacar de descartados para que la próxima sincronización lo vuelva a leer"
                >
                  Reprocesar
                </button>
              </div>
            </div>
          ))}
          {data && data.length === 0 && (
            <p className="text-sm text-slate-400">No hay mails descartados.</p>
          )}
        </div>
      )}
    </div>
  );
}

function MailCard({ mail }: { mail: Mail }) {
  const d = mail.datos_extraidos_ia;
  const estado = mail.oportunidad?.estado;
  const [showOriginal, setShowOriginal] = useState(false);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-slate-800">{mail.de}</span>
          {mail.asunto && <span className="ml-2 text-sm text-slate-500">· {mail.asunto}</span>}
        </div>
        <div className="flex items-center gap-2">
          {mail.oportunidad?.cliente ? (
            <Badge className="bg-blue-100 text-blue-700">
              {mail.oportunidad.cliente.razon_social}
            </Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-500">cliente por identificar</Badge>
          )}
          {estado && <Badge className={ESTADO_META[estado].color}>{ESTADO_META[estado].label}</Badge>}
        </div>
      </div>

      {mail.archivos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {mail.archivos.map((a) => (
            <AttachmentImage key={a.id} adjunto={a} />
          ))}
        </div>
      )}

      {d && <Extraccion data={d} />}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {mail.oportunidad_id && (
            <Link href="/oportunidades" className="text-xs text-brand hover:underline">
              Ver oportunidad #{mail.oportunidad_id} →
            </Link>
          )}
          {mail.cuerpo && (
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              className="text-xs text-slate-500 hover:underline"
            >
              {showOriginal ? "Ocultar original" : "Ver mail original"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {mail.de && (
            <ResponderButton mailId={mail.id} requiereAclaracion={Boolean(d?.requiere_aclaracion)} />
          )}
          {mail.oportunidad_id && (
            <EliminarButton oportunidadId={mail.oportunidad_id} cliente={mail.oportunidad?.cliente?.razon_social} />
          )}
        </div>
      </div>

      {showOriginal && (
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {mail.cuerpo}
        </pre>
      )}
    </article>
  );
}

// Elimina la oportunidad ligada al mail (y el mail mismo) — para limpiar basura.
function EliminarButton({
  oportunidadId,
  cliente,
}: {
  oportunidadId: number;
  cliente?: string;
}) {
  const deleteMut = useDeleteOportunidad();
  const eliminar = () => {
    const quien = cliente ?? `#${oportunidadId}`;
    if (window.confirm(`¿Eliminar la oportunidad de ${quien} y este mail? No se puede deshacer.`)) {
      deleteMut.mutate(oportunidadId);
    }
  };
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={eliminar}
      disabled={deleteMut.isPending}
      aria-label="Eliminar"
      className="text-slate-400 hover:text-red-600"
    >
      <Trash2 size={14} /> {deleteMut.isPending ? "Eliminando…" : "Eliminar"}
    </Button>
  );
}

// Según el caso: si falta info manda la aclaración; si el pedido es claro, el acuse.
function ResponderButton({
  mailId,
  requiereAclaracion,
}: {
  mailId: number;
  requiereAclaracion: boolean;
}) {
  const acuseMut = useSendAcuse();
  const aclaracionMut = useSendAclaracion();
  const mut = requiereAclaracion ? aclaracionMut : acuseMut;
  const label = requiereAclaracion ? "Enviar aclaración" : "Enviar acuse";

  return (
    <div className="flex items-center gap-2">
      {mut.isSuccess && <span className="text-xs text-green-600">Enviado ✓</span>}
      {mut.isError && (
        <span className="text-xs text-red-600">
          {(mut.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            "No se pudo enviar"}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => mut.mutate(mailId)}
        disabled={mut.isPending || mut.isSuccess}
      >
        <Send size={14} /> {mut.isPending ? "Enviando…" : label}
      </Button>
    </div>
  );
}

// Trae la imagen del backend autenticada (axios manda el JWT) y la muestra.
function AttachmentImage({ adjunto }: { adjunto: Adjunto }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | undefined;
    let active = true;
    api
      .get(`/api/v1/mails/adjuntos/${adjunto.id}`, { responseType: "blob" })
      .then((res) => {
        objectUrl = URL.createObjectURL(res.data as Blob);
        if (active) setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [adjunto.id]);

  const isImage = (adjunto.mime_type ?? "").startsWith("image/");
  if (!isImage) {
    return <span className="text-xs text-slate-500">📎 {adjunto.nombre_archivo}</span>;
  }
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer" title={adjunto.nombre_archivo}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={adjunto.nombre_archivo}
          className="max-h-40 rounded-md border border-slate-200 object-contain"
        />
      ) : (
        <div className="flex h-24 w-32 items-center justify-center rounded-md border border-slate-200 text-xs text-slate-400">
          cargando…
        </div>
      )}
    </a>
  );
}

function Extraccion({ data }: { data: EmailData }) {
  const copy = () => data.borrador_aclaracion && navigator.clipboard.writeText(data.borrador_aclaracion);
  return (
    <div className="mt-3 space-y-2 text-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600 sm:grid-cols-4">
        <Field label="Producto" value={data.producto} />
        <Field label="Cantidad" value={data.cantidad} />
        <Field label="Plazo" value={data.plazo} />
        <Field label="Requerimiento" value={data.requerimiento} />
      </dl>
      {data.requiere_aclaracion && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-medium text-amber-700">
            Requiere aclaración — borrador para el cliente:
          </p>
          <pre className="whitespace-pre-wrap text-xs text-slate-700">
            {data.borrador_aclaracion ?? "—"}
          </pre>
          {data.borrador_aclaracion && (
            <Button size="sm" variant="secondary" className="mt-2" onClick={copy}>
              <Copy size={14} /> Copiar borrador
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value ?? "—"}</dd>
    </div>
  );
}
