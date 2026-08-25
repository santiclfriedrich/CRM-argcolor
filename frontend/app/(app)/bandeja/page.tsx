"use client";

import {
  ChevronRight,
  Copy,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useSeccion } from "@/components/ui/seccion";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import {
  useDescartados,
  useHilo,
  useMails,
  useIngestEmail,
  useReprocesarDescartado,
  useResponder,
  useSendAclaracion,
  useSendAcuse,
  useSyncGmail,
} from "@/lib/mails";
import { ESTADO_META, useDeleteOportunidad } from "@/lib/oportunidades";
import type { Adjunto, CategoriaMail, EmailData, Mail } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

// "Nombre <mail@x.com>, otro@y.com" -> "mail@x.com" (primer email = la casilla
// que recibió el mail).
const emailDe = (raw: string): string => {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw.split(",")[0]).trim();
};

// Casilla que recibió el mail. Fuente confiable: el dueño de la casilla que se
// polleó (vendedor de la oportunidad). El header "Para" no sirve: a veces trae
// listas, envelope/BCC o incluso el propio remitente. Por eso solo se usa como
// fallback y descartándolo si coincide con quien lo mandó.
const casillaReceptora = (mail: Mail): string | null => {
  const owner = mail.oportunidad?.vendedor?.email;
  if (owner) return owner;
  if (mail.para) {
    const dest = emailDe(mail.para);
    if (dest && dest.toLowerCase() !== emailDe(mail.de ?? "").toLowerCase()) return dest;
  }
  return null;
};

// Fecha + hora legible (es-AR) de cuándo llegó el mail.
const fmtFechaHora = (iso: string): string =>
  new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// Etiquetas legibles de las categorías de descarte.
const CATEGORIA_LABEL: Record<CategoriaMail, string> = {
  consulta_comercial: "Consulta comercial",
  orden_compra: "Orden de compra",
  administrativo: "Administrativo",
  otro: "Otro",
};

export default function BandejaPage() {
  const { seccion } = useSeccion();
  const { data: mails, isLoading } = useMails(undefined, seccion);
  const ingestMut = useIngestEmail();
  const syncMut = useSyncGmail();

  const { data: session } = useSession();
  const currentUserId = Number(session?.usuario?.id) || null;
  const rol = (session?.usuario as { rol?: string } | undefined)?.rol;
  const [filtro, setFiltro] = useState<"todos" | "personal">(
    rol === "vendedor" ? "personal" : "todos"
  );
  // Default por rol: "personal" para vendedor, "todos" para admin/compras.
  // `rol` puede llegar undefined en el primer render; lo ajustamos una sola vez
  // cuando la sesión carga, sin pisar un cambio manual del usuario.
  const defaultToggleAplicado = useRef(false);
  useEffect(() => {
    if (!rol || defaultToggleAplicado.current) return;
    defaultToggleAplicado.current = true;
    setFiltro(rol === "vendedor" ? "personal" : "todos");
  }, [rol]);
  const visibles = (mails ?? []).filter(
    (m) => filtro === "todos" || m.oportunidad?.vendedor_id === currentUserId
  );

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
          <h1 className="text-2xl font-bold tracking-tight text-ink">Bandeja</h1>
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
          <p className="text-success">
            Sincronización OK: {syncMut.data.procesados} mail(s) nuevos procesados.
          </p>
          {syncMut.data.errores > 0 && (
            <p className="text-warning">
              {syncMut.data.errores} mail(s) no se pudieron procesar.
              {syncMut.data.ultimo_error ? ` ${syncMut.data.ultimo_error}` : ""}
            </p>
          )}
          {syncMut.data.errores === 0 &&
            syncMut.data.procesados === 0 &&
            syncMut.data.ultimo_error && (
              <p className="text-warning">{syncMut.data.ultimo_error}</p>
            )}
        </div>
      )}
      {syncMut.isError && (
        <p className="mt-2 text-sm text-danger">
          {errorMessage(syncMut.error, "No se pudo sincronizar Gmail.")}
        </p>
      )}

      <form
        onSubmit={procesar}
        className="mt-6 space-y-3 rounded-lg border border-line bg-surface2 p-4"
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
          <p className="text-sm text-danger">
            {errorMessage(ingestMut.error, "No se pudo procesar el mail. Revisá el backend.")}
          </p>
        )}
        {ingestMut.isSuccess && ingestMut.data.descartado && (
          <p className="rounded-md border border-line bg-surface2 p-2 text-sm text-ink-2">
            Se clasificó como{" "}
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
            {ingestMut.isPending ? "Procesando…" : "Procesar"}
          </Button>
        </div>
      </form>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-ink">Mails procesados</h2>
        <div className="inline-flex rounded-full border border-line bg-surface2 p-0.5 text-sm">
          {(["todos", "personal"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`rounded-full px-3 py-1 font-medium transition ${
                filtro === f
                  ? "bg-navy text-white hover:bg-navy-hover"
                  : "text-ink-2 hover:bg-surface2"
              }`}
            >
              {f === "todos" ? "Todos" : "Personal"}
            </button>
          ))}
        </div>
      </div>
      {isLoading && <p className="mt-2 text-ink-2">Cargando…</p>}
      <div className="mt-3 space-y-4">
        {visibles.map((m) => <MailCard key={m.id} mail={m} />)}
        {!isLoading && visibles.length === 0 && (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-3">
            {filtro === "personal"
              ? "No tenés mails propios todavía."
              : "Todavía no procesaste ningún mail."}
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
        className="flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink"
      >
        <ChevronRight size={16} className={open ? "rotate-90 transition" : "transition"} />
        Descartados por la IA
        {data && <span className="text-ink-3">({data.length})</span>}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {isLoading && <p className="text-sm text-ink-3">Cargando…</p>}
          {data?.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface2 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="text-ink">{d.de ?? "—"}</span>
                {d.asunto && <span className="ml-2 text-ink-3">· {d.asunto}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Badge>{CATEGORIA_LABEL[d.categoria]}</Badge>
                <button
                  type="button"
                  onClick={() => reprocesarMut.mutate(d.id)}
                  disabled={reprocesarMut.isPending}
                  className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                  title="Sacar de descartados para que la próxima sincronización lo vuelva a leer"
                >
                  Reprocesar
                </button>
              </div>
            </div>
          ))}
          {data && data.length === 0 && (
            <p className="text-sm text-ink-3">No hay mails descartados.</p>
          )}
        </div>
      )}
    </div>
  );
}

function MailCard({ mail }: { mail: Mail }) {
  const d = mail.datos_extraidos_ia;
  const estado = mail.oportunidad?.estado;
  const [chatOpen, setChatOpen] = useState(false);
  // Borrador de aclaración editable (arranca con el que redactó la IA).
  const [borrador, setBorrador] = useState(d?.borrador_aclaracion ?? "");
  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-ink">{mail.de}</span>
          {mail.asunto && <span className="ml-2 text-sm text-ink-2">· {mail.asunto}</span>}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
            {casillaReceptora(mail) && (
              <span>
                Recibido en{" "}
                <span className="font-medium text-ink-2">{casillaReceptora(mail)}</span>
              </span>
            )}
            <span className="tabular-nums">
              {fmtFechaHora(mail.fecha ?? mail.created_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mail.oportunidad?.cliente ? (
            <Badge tone="info">{mail.oportunidad.cliente.razon_social}</Badge>
          ) : (
            <Badge>cliente por identificar</Badge>
          )}
          {estado && <Badge tone={ESTADO_META[estado].tone}>{ESTADO_META[estado].label}</Badge>}
        </div>
      </div>

      {mail.archivos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {mail.archivos.map((a) => (
            <AttachmentImage key={a.id} adjunto={a} />
          ))}
        </div>
      )}

      {d && <Extraccion data={d} borrador={borrador} onBorradorChange={setBorrador} />}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {mail.oportunidad_id && (
            <Link
              href={`/oportunidades?op=${mail.oportunidad_id}`}
              className="inline-flex items-center rounded-md border border-accent bg-accent-dim px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent-dim"
            >
              Oportunidad #{mail.oportunidad_id}
            </Link>
          )}
          {mail.tiene_cuerpo && (
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="text-xs text-ink-2 hover:underline"
            >
              Ver mail original
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {mail.de && (
            <Button size="sm" variant="outline" onClick={() => setChatOpen(true)}>
              <MessageSquare size={14} /> Responder
            </Button>
          )}
          {mail.de && (
            <ResponderButton
              mailId={mail.id}
              requiereAclaracion={Boolean(d?.requiere_aclaracion)}
              borrador={borrador}
            />
          )}
          {mail.oportunidad_id && (
            <EliminarButton oportunidadId={mail.oportunidad_id} cliente={mail.oportunidad?.cliente?.razon_social} />
          )}
        </div>
      </div>

      <Modal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        title={mail.asunto || mail.de || "Conversación"}
        size="lg"
      >
        <ConversacionPanel mail={mail} />
      </Modal>
    </article>
  );
}

// Panel tipo chat: muestra el hilo completo (entrantes + salientes) y permite
// responder al cliente con texto libre sin salir del CRM.
function ConversacionPanel({ mail }: { mail: Mail }) {
  const { data: hilo, isLoading } = useHilo(mail.id, true);
  const responder = useResponder(mail.id);
  const [texto, setTexto] = useState("");

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    responder.mutate(cuerpo, { onSuccess: () => setTexto("") });
  };

  // Si el backend todavía no devolvió el hilo, mostramos al menos el entrante.
  const mensajes = hilo && hilo.length > 0 ? hilo : [mail];

  return (
    <div className="space-y-3">
      {isLoading ? (
        <p className="text-xs text-ink-3">Cargando conversación…</p>
      ) : (
        <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-md border border-line bg-surface2 p-3">
          {mensajes.map((m) => (
            <Burbuja key={m.id} mail={m} />
          ))}
        </div>
      )}

      <form onSubmit={enviar} className="space-y-2">
        <Textarea
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`Escribí tu respuesta para ${mail.de}…`}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-3">
            Se envía desde tu casilla, dentro del mismo hilo.
          </span>
          <div className="flex items-center gap-2">
            {responder.isError && (
              <span className="text-xs text-danger">
                {errorMessage(responder.error, "No se pudo enviar.")}
              </span>
            )}
            {responder.isSuccess && <span className="text-xs text-success">Enviado ✓</span>}
            <Button type="submit" size="sm" disabled={responder.isPending || !texto.trim()}>
              <Send size={14} /> {responder.isPending ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Una burbuja del chat. Salientes a la derecha (marca), entrantes a la izquierda.
function Burbuja({ mail }: { mail: Mail }) {
  const esSaliente = mail.direccion === "saliente";
  const fecha = mail.fecha ?? mail.created_at;
  const cuando = fecha
    ? new Date(fecha).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return (
    <div className={`flex ${esSaliente ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          esSaliente
            ? "bg-navy text-white"
            : "border border-line bg-surface text-ink"
        }`}
      >
        <div
          className={`mb-0.5 flex items-center gap-2 text-[11px] ${
            esSaliente ? "text-white/70" : "text-ink-3"
          }`}
        >
          <span className="truncate">{esSaliente ? mail.de ?? "Vos" : mail.de}</span>
          {cuando && <span>· {cuando}</span>}
        </div>
        <p className="whitespace-pre-wrap break-words">{mail.cuerpo}</p>
      </div>
    </div>
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
  const confirm = useConfirm();
  const eliminar = async () => {
    const quien = cliente ?? `#${oportunidadId}`;
    if (
      await confirm({
        title: "Eliminar oportunidad",
        message: `¿Eliminar la oportunidad de ${quien} y este mail? No se puede deshacer.`,
        danger: true,
      })
    ) {
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
      className="text-ink-3 hover:text-danger"
    >
      <Trash2 size={14} /> {deleteMut.isPending ? "Eliminando…" : "Eliminar"}
    </Button>
  );
}

// Según el caso: si falta info manda la aclaración; si el pedido es claro, el acuse.
function ResponderButton({
  mailId,
  requiereAclaracion,
  borrador,
}: {
  mailId: number;
  requiereAclaracion: boolean;
  borrador?: string;
}) {
  const acuseMut = useSendAcuse();
  const aclaracionMut = useSendAclaracion();
  const mut = requiereAclaracion ? aclaracionMut : acuseMut;
  const label = requiereAclaracion ? "Enviar aclaración" : "Enviar acuse";

  const enviar = () => {
    if (requiereAclaracion) aclaracionMut.mutate({ mailId, cuerpo: borrador });
    else acuseMut.mutate(mailId);
  };

  return (
    <div className="flex items-center gap-2">
      {mut.isSuccess && <span className="text-xs text-success">Enviado ✓</span>}
      {mut.isError && (
        <span className="text-xs text-danger">
          {errorMessage(mut.error, "No se pudo enviar")}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={enviar}
        disabled={
          mut.isPending ||
          mut.isSuccess ||
          (requiereAclaracion && !borrador?.trim())
        }
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
    // PDF, planillas, etc.: chip descargable (abre en pestaña nueva).
    return (
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        download={adjunto.nombre_archivo}
        title={adjunto.nombre_archivo}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-surface2 px-2.5 py-1.5 text-xs text-ink hover:bg-surface3"
      >
        <Paperclip size={13} className="shrink-0 text-ink-3" />
        <span className="truncate">{adjunto.nombre_archivo}</span>
      </a>
    );
  }
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer" title={adjunto.nombre_archivo}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={adjunto.nombre_archivo}
          className="max-h-40 rounded-md border border-line object-contain"
        />
      ) : (
        <div className="flex h-24 w-32 items-center justify-center rounded-md border border-line text-xs text-ink-3">
          cargando…
        </div>
      )}
    </a>
  );
}

function Extraccion({
  data,
  borrador,
  onBorradorChange,
}: {
  data: EmailData;
  borrador: string;
  onBorradorChange: (v: string) => void;
}) {
  const copy = () => borrador && navigator.clipboard.writeText(borrador);
  return (
    <div className="mt-3 space-y-2 text-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-ink-2 sm:grid-cols-4">
        <Field label="Producto" value={data.producto} />
        <Field label="Cantidad" value={data.cantidad} />
        <Field label="Plazo" value={data.plazo} />
        <Field label="Requerimiento" value={data.requerimiento} />
      </dl>
      {data.requiere_aclaracion && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
          <p className="mb-1 text-xs font-medium text-warning">
            Borrador para el cliente (editalo antes de enviar):
          </p>
          <Textarea
            rows={4}
            value={borrador}
            onChange={(e) => onBorradorChange(e.target.value)}
            className="text-xs"
            placeholder="Escribí el mensaje para el cliente…"
          />
          {borrador && (
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
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-ink">{value ?? "—"}</dd>
    </div>
  );
}
