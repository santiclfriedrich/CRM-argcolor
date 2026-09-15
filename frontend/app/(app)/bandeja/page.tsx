"use client";

import {
  Archive,
  ChevronLeft,
  Clock,
  Inbox as InboxIcon,
  Mail as MailIcon,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  useEliminarMail,
  useHilo,
  useInbox,
  useMarcarLeido,
  useRedactar,
  useResponder,
  useSyncGmail,
} from "@/lib/mails";
import type { CarpetaInbox, InboxMail } from "@/lib/types";
import { cn } from "@/lib/utils";

type FolderKey = CarpetaInbox | "programados";

const FOLDERS: { key: FolderKey; label: string; icon: typeof InboxIcon }[] = [
  { key: "entrada", label: "Bandeja de entrada", icon: InboxIcon },
  { key: "enviados", label: "Enviados", icon: Send },
  { key: "programados", label: "Programados", icon: Clock },
  { key: "archivo", label: "Archivo", icon: Archive },
];

function fmtFecha(fecha: string | null): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  const hoy = new Date();
  const mismoDia =
    d.getFullYear() === hoy.getFullYear() &&
    d.getMonth() === hoy.getMonth() &&
    d.getDate() === hoy.getDate();
  return mismoDia
    ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function nombreDe(mail: InboxMail): string {
  const raw = (mail.direccion === "saliente" ? mail.para : mail.de) || "—";
  // "Nombre Apellido <mail@x.com>" -> "Nombre Apellido"; si es solo mail, el mail.
  const m = raw.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : raw).trim();
}

export default function BandejaPage() {
  const [folder, setFolder] = useState<FolderKey>("entrada");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [componer, setComponer] = useState(false);

  const toast = useToast();
  const syncMut = useSyncGmail();
  const marcarLeido = useMarcarLeido();

  const sincronizar = () =>
    syncMut.mutate(undefined, {
      onSuccess: (r) => {
        if (r.ultimo_error) toast.toast(r.ultimo_error, "error");
        else if (r.procesados) toast.toast(`${r.procesados} correo(s) nuevo(s)`, "success");
        else toast.toast("Bandeja al día", "info");
      },
      onError: () => toast.toast("No se pudo sincronizar", "error"),
    });

  const carpeta: CarpetaInbox = folder === "programados" ? "entrada" : folder;
  const { data: mails, isLoading } = useInbox(carpeta);
  const { data: entrada } = useInbox("entrada");
  const noLeidos = (entrada ?? []).filter((m) => !m.leido).length;

  const abrir = (mail: InboxMail) => {
    setSelectedId(mail.id);
    if (!mail.leido) marcarLeido.mutate({ id: mail.id, leido: true });
  };

  const seleccionar = (k: FolderKey) => {
    setFolder(k);
    setSelectedId(null);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Bandeja</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={sincronizar}
          disabled={syncMut.isPending}
          title="Sincroniza tu casilla de Gmail"
        >
          <RefreshCw size={15} className={cn("mr-1.5", syncMut.isPending && "animate-spin")} />
          Sincronizar
        </Button>
      </div>

      <div className="flex h-[calc(100vh-11rem)] min-h-[520px] overflow-hidden rounded-xl border border-line bg-surface">
        {/* Sidebar de carpetas */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface2/40 p-3 md:flex">
          <Button className="w-full" onClick={() => setComponer(true)}>
            <Plus size={16} className="mr-1.5" /> Nuevo correo
          </Button>
          <nav className="mt-4 flex flex-col gap-0.5">
            {FOLDERS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => seleccionar(key)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition",
                  folder === key
                    ? "bg-accent/10 text-accent"
                    : "text-ink-2 hover:bg-surface2"
                )}
              >
                <Icon size={17} className="shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {key === "entrada" && noLeidos > 0 && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-white">
                    {noLeidos}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="my-3 border-t border-line" />
          <Link
            href="/bandeja/propuestas"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-2 transition hover:bg-surface2"
          >
            <Sparkles size={17} className="shrink-0" />
            Propuestas de la IA
          </Link>
        </aside>

        {/* Lista de conversaciones */}
        <section
          className={cn(
            "flex w-full flex-col md:w-96 md:shrink-0 md:border-r md:border-line",
            selectedId !== null && "hidden md:flex"
          )}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <select
              value={folder}
              onChange={(e) => seleccionar(e.target.value as FolderKey)}
              className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink md:hidden"
            >
              {FOLDERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <h2 className="hidden text-sm font-semibold text-ink md:block">
              {FOLDERS.find((f) => f.key === folder)?.label}
            </h2>
            <button
              type="button"
              onClick={() => setComponer(true)}
              className="ml-auto rounded-md p-1.5 text-ink-2 transition hover:bg-surface2 md:hidden"
              aria-label="Nuevo correo"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {folder === "programados" ? (
              <EmptyState
                icon={Clock}
                titulo="Programados"
                detalle="Acá vas a poder redactar y programar el envío de un correo. Llega en la próxima fase."
              />
            ) : isLoading ? (
              <p className="p-4 text-sm text-ink-2">Cargando…</p>
            ) : !mails || mails.length === 0 ? (
              <EmptyState
                icon={MailIcon}
                titulo="Sin correos"
                detalle="No hay correos en esta carpeta dentro de la ventana sincronizada."
              />
            ) : (
              <ul>
                {mails.map((mail) => (
                  <li key={mail.id}>
                    <button
                      type="button"
                      onClick={() => abrir(mail)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 border-b border-line px-4 py-3 text-left transition hover:bg-surface2",
                        selectedId === mail.id && "bg-accent/5",
                        !mail.leido && "bg-accent/[0.04]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {!mail.leido && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                        )}
                        <span
                          className={cn(
                            "flex-1 truncate text-sm",
                            mail.leido ? "text-ink-2" : "font-semibold text-ink"
                          )}
                        >
                          {nombreDe(mail)}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-2">
                          {fmtFecha(mail.fecha)}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "truncate text-sm",
                          mail.leido ? "text-ink-2" : "font-medium text-ink"
                        )}
                      >
                        {mail.asunto || "(sin asunto)"}
                      </span>
                      {mail.preview && (
                        <span className="truncate text-xs text-ink-2">{mail.preview}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Panel de lectura */}
        <section
          className={cn(
            "flex-1 flex-col overflow-hidden",
            selectedId !== null ? "flex" : "hidden md:flex"
          )}
        >
          {selectedId !== null ? (
            <ReadingPane
              mailId={selectedId}
              onBack={() => setSelectedId(null)}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <EmptyState
              icon={MailIcon}
              titulo="Elegí un correo"
              detalle="Seleccioná una conversación de la lista para leerla acá."
            />
          )}
        </section>
      </div>

      {componer && <ComposeModal onClose={() => setComponer(false)} />}
    </div>
  );
}

function ReadingPane({
  mailId,
  onBack,
  onDeleted,
}: {
  mailId: number;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const { data: hilo, isLoading } = useHilo(mailId, true);
  const eliminar = useEliminarMail();
  const marcarLeido = useMarcarLeido();
  const responder = useResponder(mailId);
  const toast = useToast();
  const [respuesta, setRespuesta] = useState("");

  const asunto = hilo?.[0]?.asunto || "(sin asunto)";

  const enviarRespuesta = () => {
    const texto = respuesta.trim();
    if (!texto) return;
    responder.mutate(texto, {
      onSuccess: () => {
        setRespuesta("");
        toast.toast("Respuesta enviada", "success");
      },
      onError: () => toast.toast("No se pudo enviar la respuesta", "error"),
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Barra de acciones */}
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md p-1.5 text-ink-2 transition hover:bg-surface2 md:hidden"
          aria-label="Volver"
        >
          <ChevronLeft size={18} />
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => marcarLeido.mutate({ id: mailId, leido: false })}
          title="Marcar como no leído"
        >
          <MailIcon size={15} className="mr-1.5" /> No leído
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            eliminar.mutate(mailId, {
              onSuccess: onDeleted,
            })
          }
          disabled={eliminar.isPending}
          title="Eliminar del CRM (queda en Gmail)"
        >
          <Trash2 size={15} className="mr-1.5" /> Eliminar
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="mb-4 text-xl font-bold tracking-tight text-ink">{asunto}</h2>
        {isLoading ? (
          <p className="text-sm text-ink-2">Cargando conversación…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {(hilo ?? []).map((m) => (
              <div key={m.id} className="rounded-lg border border-line bg-surface2/40 p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">
                    {m.direccion === "saliente" ? m.de : m.de || "—"}
                  </span>
                  <span className="shrink-0 text-xs text-ink-2">
                    {m.fecha ? new Date(m.fecha).toLocaleString("es-AR") : ""}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-ink">
                  {m.cuerpo || ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Responder */}
      <div className="border-t border-line p-3">
        <Textarea
          value={respuesta}
          onChange={(e) => setRespuesta(e.target.value)}
          placeholder="Escribí tu respuesta…"
          rows={3}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            onClick={enviarRespuesta}
            disabled={responder.isPending || !respuesta.trim()}
          >
            <Send size={15} className="mr-1.5" />
            {responder.isPending ? "Enviando…" : "Responder"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ComposeModal({ onClose }: { onClose: () => void }) {
  const redactar = useRedactar();
  const toast = useToast();
  const [para, setPara] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");

  const enviar = () => {
    if (!para.trim() || !cuerpo.trim()) return;
    redactar.mutate(
      { para: para.trim(), asunto: asunto.trim() || undefined, cuerpo },
      {
        onSuccess: () => {
          toast.toast("Correo enviado", "success");
          onClose();
        },
        onError: () => toast.toast("No se pudo enviar el correo", "error"),
      }
    );
  };

  return (
    <Modal open onClose={onClose} title="Nuevo correo" size="lg">
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-2">Para</label>
          <Input
            value={para}
            onChange={(e) => setPara(e.target.value)}
            placeholder="destinatario@ejemplo.com"
            type="email"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-2">Asunto</label>
          <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-2">Mensaje</label>
          <Textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={10} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={redactar.isPending || !para.trim() || !cuerpo.trim()}>
            <Send size={15} className="mr-1.5" />
            {redactar.isPending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EmptyState({
  icon: Icon,
  titulo,
  detalle,
}: {
  icon: typeof InboxIcon;
  titulo: string;
  detalle: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <Icon size={40} className="text-ink-2/40" />
      <p className="text-sm font-semibold text-ink">{titulo}</p>
      <p className="max-w-xs text-sm text-ink-2">{detalle}</p>
    </div>
  );
}
