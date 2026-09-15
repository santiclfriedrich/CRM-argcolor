"use client";

import {
  Archive,
  ChevronDown,
  ChevronLeft,
  Clock,
  Download,
  Filter,
  Inbox as InboxIcon,
  Link2,
  Lock,
  Mail as MailIcon,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings2,
  Tag,
  Target,
  Trash2,
} from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  descargarGmailAdjunto,
  useConversacion,
  useEliminarMail,
  useInbox,
  useMarcarLeido,
  useRedactar,
  useResponder,
  useSyncGmail,
  useVincularOportunidad,
} from "@/lib/mails";
import { useOportunidades } from "@/lib/oportunidades";
import type { AdjuntoGmail, CarpetaInbox, InboxMail } from "@/lib/types";
import { cn } from "@/lib/utils";

type FolderKey = CarpetaInbox | "programados";

const FOLDERS: { key: FolderKey; label: string; icon: typeof InboxIcon }[] = [
  { key: "entrada", label: "Bandeja de entrada", icon: InboxIcon },
  { key: "enviados", label: "Enviados", icon: Send },
  { key: "programados", label: "Programados", icon: Clock },
  { key: "archivo", label: "Archivo", icon: Archive },
];

// Conversación = mails agrupados por hilo de Gmail.
type Conversacion = {
  key: string;
  latest: InboxMail;
  ids: number[];
  count: number;
  unreadIds: number[];
  remitentes: string;
  tieneAdjuntos: boolean;
};

function nombreEmail(raw: string | null): string {
  if (!raw) return "—";
  const m = raw.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : raw).trim();
}

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
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function agrupar(mails: InboxMail[]): Conversacion[] {
  const map = new Map<string, InboxMail[]>();
  for (const m of mails) {
    const k = m.gmail_thread_id || `id-${m.id}`;
    const arr = map.get(k);
    if (arr) arr.push(m);
    else map.set(k, [m]);
  }
  const convs: Conversacion[] = [];
  for (const [key, grp] of map) {
    const orden = [...grp].sort(
      (a, b) => new Date(b.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime()
    );
    const nombres: string[] = [];
    for (const m of orden) {
      const n = m.direccion === "saliente" ? "Tú" : nombreEmail(m.de);
      if (!nombres.includes(n)) nombres.push(n);
    }
    convs.push({
      key,
      latest: orden[0],
      ids: grp.map((m) => m.id),
      count: grp.length,
      unreadIds: grp.filter((m) => !m.leido).map((m) => m.id),
      remitentes: nombres.slice(0, 3).reverse().join(", "),
      tieneAdjuntos: grp.some((m) => m.tiene_adjuntos),
    });
  }
  return convs.sort(
    (a, b) =>
      new Date(b.latest.fecha ?? 0).getTime() - new Date(a.latest.fecha ?? 0).getTime()
  );
}

export default function BandejaPage() {
  const [folder, setFolder] = useState<FolderKey>("entrada");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [componer, setComponer] = useState(false);
  const [vincularId, setVincularId] = useState<number | null>(null);

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "no_leidos" | "adjuntos">("todos");
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);

  const toast = useToast();
  const syncMut = useSyncGmail();
  const marcarLeido = useMarcarLeido();
  const eliminar = useEliminarMail();

  const carpeta: CarpetaInbox = folder === "programados" ? "entrada" : folder;
  const { data: mails, isLoading } = useInbox(carpeta);
  const { data: entrada } = useInbox("entrada");
  const noLeidos = (entrada ?? []).filter((m) => !m.leido).length;

  const todas = useMemo(() => agrupar(mails ?? []), [mails]);
  const conversaciones = useMemo(() => {
    let cs = todas;
    if (filtro === "no_leidos") cs = cs.filter((c) => c.unreadIds.length > 0);
    else if (filtro === "adjuntos") cs = cs.filter((c) => c.tieneAdjuntos);
    const q = busqueda.trim().toLowerCase();
    if (q)
      cs = cs.filter((c) =>
        `${c.remitentes} ${c.latest.asunto ?? ""} ${c.latest.preview ?? ""}`
          .toLowerCase()
          .includes(q)
      );
    return cs;
  }, [todas, filtro, busqueda]);

  const toggleSel = (key: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const todasSel = conversaciones.length > 0 && seleccion.size === conversaciones.length;
  const toggleTodas = () =>
    setSeleccion(todasSel ? new Set() : new Set(conversaciones.map((c) => c.key)));

  const eliminarSeleccionadas = () => {
    const ids = conversaciones
      .filter((c) => seleccion.has(c.key))
      .flatMap((c) => c.ids);
    ids.forEach((id) => eliminar.mutate(id));
    setSeleccion(new Set());
    if (selectedId !== null && ids.includes(selectedId)) setSelectedId(null);
  };

  const sincronizar = () =>
    syncMut.mutate(undefined, {
      onSuccess: (r) => {
        if (r.ultimo_error) toast.toast(r.ultimo_error, "error");
        else if (r.procesados) toast.toast(`${r.procesados} correo(s) nuevo(s)`, "success");
        else toast.toast("Bandeja al día", "info");
      },
      onError: () => toast.toast("No se pudo sincronizar", "error"),
    });

  const abrir = (conv: Conversacion) => {
    setSelectedId(conv.latest.id);
    conv.unreadIds.forEach((id) => marcarLeido.mutate({ id, leido: true }));
  };

  const seleccionar = (k: FolderKey) => {
    setFolder(k);
    setSelectedId(null);
  };

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[520px] w-full overflow-hidden rounded-xl border border-line bg-surface">
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
                folder === key ? "bg-accent/10 text-accent" : "text-ink-2 hover:bg-surface2"
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
      </aside>

      {/* Área principal: lista o detalle */}
      <section className="flex min-w-0 flex-1 flex-col">
        {selectedId !== null ? (
          <ReadingPane
            mailId={selectedId}
            onBack={() => setSelectedId(null)}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <>
            {/* Barra de la lista */}
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <input
                type="checkbox"
                checked={todasSel}
                onChange={toggleTodas}
                className="h-4 w-4 shrink-0 rounded border-line accent-accent"
                aria-label="Seleccionar todo"
              />
              <button
                type="button"
                onClick={sincronizar}
                disabled={syncMut.isPending}
                className="rounded-md p-1.5 text-ink-2 transition hover:bg-surface2 disabled:opacity-50"
                title="Sincronizar"
                aria-label="Sincronizar"
              >
                <RefreshCw size={16} className={cn(syncMut.isPending && "animate-spin")} />
              </button>
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
              {seleccion.size > 0 ? (
                <button
                  type="button"
                  onClick={eliminarSeleccionadas}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-danger transition hover:bg-danger/10"
                >
                  <Trash2 size={15} /> Eliminar ({seleccion.size})
                </button>
              ) : (
                <span className="hidden text-sm font-medium text-ink sm:block">
                  {conversaciones.length} conversación
                  {conversaciones.length === 1 ? "" : "es"}
                </span>
              )}

              {/* Controles a la derecha */}
              <div className="ml-auto flex items-center gap-1">
                <div className="relative hidden md:block">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"
                  />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar…"
                    className="w-36 rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-ink-3 focus:w-48 focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                <ToolbarButton
                  icon={Clock}
                  label="Estado de seguimiento"
                  onClick={() => toast.toast("Estado de seguimiento: próximamente", "info")}
                />
                <ToolbarButton
                  icon={Tag}
                  label="Etiquetas"
                  onClick={() => toast.toast("Etiquetas: próximamente", "info")}
                />

                <div className="relative">
                  <ToolbarButton
                    icon={Filter}
                    label="Filtros"
                    activo={filtro !== "todos"}
                    onClick={() =>
                      setMenuAbierto((m) => (m === "filtros" ? null : "filtros"))
                    }
                  />
                  {menuAbierto === "filtros" && (
                    <MenuFlotante onClose={() => setMenuAbierto(null)}>
                      {(
                        [
                          ["todos", "Todos"],
                          ["no_leidos", "No leídos"],
                          ["adjuntos", "Con adjuntos"],
                        ] as const
                      ).map(([val, txt]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setFiltro(val);
                            setMenuAbierto(null);
                          }}
                          className={cn(
                            "flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-surface2",
                            filtro === val ? "font-semibold text-accent" : "text-ink"
                          )}
                        >
                          {txt}
                        </button>
                      ))}
                    </MenuFlotante>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => toast.toast("Buscador general arriba a la derecha", "info")}
                  className="rounded-md p-1.5 text-ink-2 transition hover:bg-surface2 md:hidden"
                  aria-label="Buscar"
                >
                  <Search size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => toast.toast("Configuración de la bandeja: próximamente", "info")}
                  className="rounded-md p-1.5 text-ink-2 transition hover:bg-surface2"
                  aria-label="Configuración"
                  title="Configuración"
                >
                  <Settings2 size={16} />
                </button>
              </div>
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
              ) : conversaciones.length === 0 ? (
                <EmptyState
                  icon={MailIcon}
                  titulo="Sin correos"
                  detalle="No hay correos en esta carpeta dentro de la ventana sincronizada."
                />
              ) : (
                <ul>
                  {conversaciones.map((conv) => {
                    const noLeido = conv.unreadIds.length > 0;
                    const sel = seleccion.has(conv.key);
                    return (
                      <li
                        key={conv.key}
                        className={cn(
                          "group flex items-center gap-3 border-b border-line pl-4 pr-4 transition hover:bg-surface2",
                          sel ? "bg-accent/[0.07]" : noLeido && "bg-accent/[0.035]"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleSel(conv.key)}
                          className="h-4 w-4 shrink-0 rounded border-line accent-accent"
                          aria-label="Seleccionar conversación"
                        />
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            noLeido ? "bg-accent" : "bg-transparent"
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => abrir(conv)}
                          className="flex min-w-0 flex-1 items-center gap-4 py-3 text-left"
                        >
                          <span
                            className={cn(
                              "flex w-48 shrink-0 items-center gap-1.5 text-sm",
                              noLeido ? "font-bold text-ink" : "font-medium text-ink"
                            )}
                          >
                            <span className="truncate">{conv.remitentes || "—"}</span>
                            {conv.count > 1 && (
                              <span className="shrink-0 text-xs font-normal text-ink-3">
                                {conv.count}
                              </span>
                            )}
                          </span>
                          <span className="flex min-w-0 flex-1 items-baseline gap-2">
                            <span
                              className={cn(
                                "shrink-0 truncate text-sm text-ink",
                                noLeido ? "font-bold" : "font-medium"
                              )}
                              style={{ maxWidth: "16rem" }}
                            >
                              {conv.latest.asunto || "(sin asunto)"}
                            </span>
                            {conv.latest.preview && (
                              <span
                                className="min-w-0 truncate text-sm text-ink-3"
                                style={{ maxWidth: "22rem" }}
                              >
                                {conv.latest.preview}
                              </span>
                            )}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-3">
                          {/* Vincular a oportunidad: aparece solo al pasar el mouse. */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVincularId(conv.latest.id);
                            }}
                            className="hidden items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink-2 transition hover:bg-surface2 group-hover:flex"
                          >
                            <Link2 size={13} /> Vincular
                          </button>
                          {conv.tieneAdjuntos && (
                            <Paperclip size={15} className="text-ink-3" aria-label="Con adjuntos" />
                          )}
                          <Lock size={14} className="text-ink-3" aria-label="Privado" />
                          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-2">
                            {fmtFecha(conv.latest.fecha)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      {componer && <ComposeModal onClose={() => setComponer(false)} />}
      {vincularId !== null && (
        <VincularModal mailId={vincularId} onClose={() => setVincularId(null)} />
      )}
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
  const { data: hilo, isLoading } = useConversacion(mailId, true);
  const eliminar = useEliminarMail();
  const marcarLeido = useMarcarLeido();
  const responder = useResponder(mailId);
  const toast = useToast();
  const [respuesta, setRespuesta] = useState("");
  const [respondiendo, setRespondiendo] = useState(false);
  const [mostrarVincular, setMostrarVincular] = useState(false);

  const asunto = hilo?.[0]?.asunto || "(sin asunto)";
  const participantes = useMemo(() => {
    const set = new Set<string>();
    for (const m of hilo ?? []) {
      if (m.de) set.add(m.de);
      if (m.para) set.add(m.para);
    }
    return [...set];
  }, [hilo]);

  const enviarRespuesta = () => {
    const texto = respuesta.trim();
    if (!texto) return;
    responder.mutate(texto, {
      onSuccess: () => {
        setRespuesta("");
        setRespondiendo(false);
        toast.toast("Respuesta enviada", "success");
      },
      onError: () => toast.toast("No se pudo enviar la respuesta", "error"),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barra de acciones */}
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft size={16} className="mr-1" /> Atrás
        </Button>
        <div className="mx-1 h-5 w-px bg-line" />
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
          onClick={() => eliminar.mutate(mailId, { onSuccess: onDeleted })}
          disabled={eliminar.isPending}
          title="Eliminar del CRM (queda en Gmail)"
        >
          <Trash2 size={15} className="mr-1.5" /> Eliminar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setMostrarVincular(true)}
          title="Crear o asociar una oportunidad desde este mail"
        >
          <Target size={15} className="mr-1.5" /> Vincular a oportunidad
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Conversación */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <h2 className="mb-4 text-xl font-bold tracking-tight text-ink">{asunto}</h2>
            {isLoading ? (
              <p className="text-sm text-ink-2">Cargando conversación…</p>
            ) : (
              <div className="flex flex-col gap-3">
                {(hilo ?? []).map((m) => (
                  <div
                    key={m.message_id}
                    className="rounded-lg border border-line bg-surface p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                          {nombreEmail(m.de).slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate text-sm font-semibold text-ink">
                          {m.de || "—"}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-ink-2">
                        {m.fecha ? new Date(m.fecha).toLocaleString("es-AR") : ""}
                      </span>
                    </div>
                    {m.html ? (
                      <EmailFrame html={m.html} />
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm text-ink">
                        {m.texto}
                      </p>
                    )}
                    {m.adjuntos.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                        {m.adjuntos.map((a) => (
                          <AdjuntoChip key={a.attachment_id} adj={a} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Responder */}
            {respondiendo ? (
              <div className="mt-4 rounded-lg border border-line bg-surface p-3">
                <Textarea
                  value={respuesta}
                  onChange={(e) => setRespuesta(e.target.value)}
                  placeholder="Escribí tu respuesta…"
                  rows={4}
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setRespondiendo(false)}>
                    Cancelar
                  </Button>
                  <SplitSend
                    onSend={enviarRespuesta}
                    pending={responder.isPending}
                    disabled={!respuesta.trim()}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRespondiendo(true)}
                className="mt-4 flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-2 transition hover:bg-surface2"
              >
                <Reply size={16} /> Responder
              </button>
            )}
          </div>
        </div>

        {/* Panel de participantes */}
        <aside className="hidden w-64 shrink-0 border-l border-line bg-surface2/30 p-4 lg:block">
          <p className="text-xs font-semibold text-ink-2">
            {participantes.length} persona{participantes.length === 1 ? "" : "s"} en esta
            conversación
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {participantes.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                  {nombreEmail(p).slice(0, 2).toUpperCase()}
                </span>
                <span className="truncate text-sm text-ink">{nombreEmail(p)}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {mostrarVincular && (
        <VincularModal mailId={mailId} onClose={() => setMostrarVincular(false)} />
      )}
    </div>
  );
}

// Botón "Enviar" dividido: acción principal + flecha con opciones (Programar).
function SplitSend({
  onSend,
  pending,
  disabled,
  label = "Enviar",
}: {
  onSend: () => void;
  pending?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <div className="relative inline-flex">
      <Button onClick={onSend} disabled={disabled || pending} className="rounded-r-none">
        <Send size={15} className="mr-1.5" />
        {pending ? "Enviando…" : label}
      </Button>
      <Button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || pending}
        className="rounded-l-none border-l border-white/25 px-2"
        aria-label="Más opciones de envío"
      >
        <ChevronDown size={15} />
      </Button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-full right-0 z-50 mb-1 w-52 rounded-lg border border-line bg-surface p-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSend();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink transition hover:bg-surface2"
            >
              <Send size={15} /> Enviar ahora
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                toast.toast("La programación de envíos llega en la próxima fase", "info");
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink transition hover:bg-surface2"
            >
              <Clock size={15} /> Programar envío…
            </button>
          </div>
        </>
      )}
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
          <SplitSend
            onSend={enviar}
            pending={redactar.isPending}
            disabled={!para.trim() || !cuerpo.trim()}
          />
        </div>
      </div>
    </Modal>
  );
}

// Renderiza el HTML real del mail en un iframe aislado (sin scripts), auto-alto,
// para que se vea EXACTO como en Gmail (tablas, formato, imágenes).
function EmailFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [altura, setAltura] = useState(80);

  const doc = useMemo(
    () =>
      "<!doctype html><html><head><meta charset='utf-8'><base target='_blank'>" +
      "<style>html,body{margin:0;padding:0}" +
      "body{font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;" +
      "line-height:1.5;word-break:break-word}img{max-width:100%;height:auto}" +
      "table{max-width:100%}</style></head><body>" +
      html +
      "</body></html>",
    [html]
  );

  const ajustar = () => {
    const cuerpo = ref.current?.contentWindow?.document?.body;
    if (cuerpo) setAltura(Math.min(6000, cuerpo.scrollHeight + 8));
  };

  return (
    <iframe
      ref={ref}
      title="Contenido del correo"
      srcDoc={doc}
      sandbox="allow-same-origin allow-popups"
      onLoad={() => {
        ajustar();
        // Reajuste tras cargar imágenes remotas (que llegan después del load).
        setTimeout(ajustar, 400);
        setTimeout(ajustar, 1200);
      }}
      className="w-full border-0"
      style={{ height: altura }}
    />
  );
}

function AdjuntoChip({ adj }: { adj: AdjuntoGmail }) {
  const [bajando, setBajando] = useState(false);
  const toast = useToast();

  const bajar = async () => {
    setBajando(true);
    try {
      await descargarGmailAdjunto(adj);
    } catch {
      toast.toast("No se pudo bajar el adjunto", "error");
    } finally {
      setBajando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={bajar}
      disabled={bajando}
      className="flex items-center gap-2 rounded-lg border border-line bg-surface2/50 px-3 py-1.5 text-sm text-ink transition hover:bg-surface2 disabled:opacity-60"
      title={`Descargar ${adj.filename}`}
    >
      <Paperclip size={14} className="shrink-0 text-ink-2" />
      <span className="max-w-[220px] truncate">{adj.filename}</span>
      <Download size={14} className="shrink-0 text-ink-2" />
    </button>
  );
}

// Crear una oportunidad nueva desde el mail, o asociarlo a una existente. El
// requerimiento se toma tal cual del cuerpo o se limpia con IA; opcionalmente se
// sincronizan los adjuntos del mail a la oportunidad.
function VincularModal({ mailId, onClose }: { mailId: number; onClose: () => void }) {
  const vincular = useVincularOportunidad(mailId);
  const { data: oportunidades } = useOportunidades();
  const toast = useToast();
  const [tab, setTab] = useState<"crear" | "asociar">("crear");
  const [reqIA, setReqIA] = useState(false);
  const [syncAdj, setSyncAdj] = useState(true);
  const [q, setQ] = useState("");
  const [opId, setOpId] = useState<number | null>(null);

  const lista = useMemo(() => {
    const arr = oportunidades ?? [];
    const s = q.trim().toLowerCase();
    const filtradas = s
      ? arr.filter((o) => `#${o.id} ${o.asunto ?? ""}`.toLowerCase().includes(s))
      : arr;
    return filtradas.slice(0, 40);
  }, [oportunidades, q]);

  const confirmar = () => {
    if (tab === "asociar" && !opId) return;
    vincular.mutate(
      tab === "crear"
        ? { modo: "crear", requerimiento_ia: reqIA, sincronizar_adjuntos: syncAdj }
        : { modo: "asociar", oportunidad_id: opId!, sincronizar_adjuntos: syncAdj },
      {
        onSuccess: () => {
          toast.toast(tab === "crear" ? "Oportunidad creada" : "Mail vinculado", "success");
          onClose();
        },
        onError: () => toast.toast("No se pudo vincular la oportunidad", "error"),
      }
    );
  };

  return (
    <Modal open onClose={onClose} title="Vincular a oportunidad" size="lg">
      <div className="mb-4 flex gap-1 rounded-lg bg-surface2 p-1">
        {(
          [
            ["crear", "Crear nueva"],
            ["asociar", "Asociar existente"],
          ] as const
        ).map(([t, txt]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition",
              tab === t ? "bg-surface text-ink shadow-sm" : "text-ink-2"
            )}
          >
            {txt}
          </button>
        ))}
      </div>

      {tab === "crear" ? (
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Requerimiento</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm text-ink">
              <input
                type="radio"
                checked={!reqIA}
                onChange={() => setReqIA(false)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="font-medium">Tal cual del cuerpo del mail</span>
                <span className="block text-xs text-ink-3">
                  Copia el texto como lo escribió el cliente.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm text-ink">
              <input
                type="radio"
                checked={reqIA}
                onChange={() => setReqIA(true)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="font-medium">Limpiar con IA</span>
                <span className="block text-xs text-ink-3">
                  La IA ordena el requerimiento a partir del cuerpo.
                </span>
              </span>
            </label>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar oportunidad por N° o asunto…"
          />
          <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
            {lista.length === 0 ? (
              <p className="p-3 text-sm text-ink-2">Sin resultados.</p>
            ) : (
              lista.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOpId(o.id)}
                  className={cn(
                    "flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm transition last:border-0 hover:bg-surface2",
                    opId === o.id && "bg-accent/10"
                  )}
                >
                  <span className="font-mono text-xs text-ink-3">#{o.id}</span>
                  <span className="truncate text-ink">{o.asunto || "(sin asunto)"}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <label className="mt-4 flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={syncAdj}
          onChange={(e) => setSyncAdj(e.target.checked)}
          className="h-4 w-4 rounded border-line accent-accent"
        />
        Sincronizar los adjuntos del mail a la oportunidad
      </label>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={confirmar}
          disabled={vincular.isPending || (tab === "asociar" && !opId)}
        >
          {vincular.isPending
            ? "Guardando…"
            : tab === "crear"
              ? "Crear oportunidad"
              : "Asociar"}
        </Button>
      </div>
    </Modal>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  activo,
  onClick,
}: {
  icon: typeof InboxIcon;
  label: string;
  activo?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-sm transition hover:bg-surface2",
        activo ? "border-accent/40 text-accent" : "text-ink-2"
      )}
    >
      <Icon size={15} className="shrink-0" />
      <span className="hidden lg:inline">{label}</span>
      <ChevronDown size={13} className="text-ink-3" />
    </button>
  );
}

function MenuFlotante({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <>
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-line bg-surface p-1 shadow-lg">
        {children}
      </div>
    </>
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
