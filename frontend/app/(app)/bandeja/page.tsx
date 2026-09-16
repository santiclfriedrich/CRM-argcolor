"use client";

import {
  Archive,
  Bold,
  ChevronDown,
  ChevronLeft,
  Clock,
  Download,
  Eye,
  Filter,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Lock,
  Mail as MailIcon,
  Paperclip,
  Plus,
  RefreshCw,
  RemoveFormatting,
  Reply,
  Search,
  Send,
  Settings2,
  Strikethrough,
  Tag,
  Target,
  Trash2,
  Underline,
  X,
} from "lucide-react";
import {
  forwardRef,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  descargarGmailAdjunto,
  useCancelarProgramado,
  useConversacion,
  useEliminarMail,
  useFirma,
  useInbox,
  useMarcarLeido,
  useProgramados,
  useProgramar,
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
                <ProgramadosList />
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
  const { data: firma } = useFirma();
  const eliminar = useEliminarMail();
  const marcarLeido = useMarcarLeido();
  const responder = useResponder(mailId);
  const toast = useToast();
  const [respondiendo, setRespondiendo] = useState(false);
  const [adjReply, setAdjReply] = useState<File[]>([]);
  const [replyVacio, setReplyVacio] = useState(true);
  const replyRef = useRef<RichEditorHandle>(null);
  const [vincularTab, setVincularTab] = useState<"crear" | "asociar" | null>(null);

  const asunto = hilo?.[0]?.asunto || "(sin asunto)";
  // Participantes deduplicados por email (una persona puede venir como
  // "Nombre <mail>" o solo "mail", y aparecer en varios mensajes del hilo).
  const participantes = useMemo(() => {
    const map = new Map<string, string>(); // email -> nombre a mostrar
    const agregar = (raw: string | null) => {
      if (!raw) return;
      for (const parte of raw.split(",")) {
        const s = parte.trim();
        if (!s) continue;
        const m = s.match(/<([^>]+)>/);
        const email = (m ? m[1] : s).trim().toLowerCase();
        if (!email.includes("@")) continue;
        if (!map.has(email)) map.set(email, nombreEmail(s));
      }
    };
    for (const msg of hilo ?? []) {
      agregar(msg.de);
      agregar(msg.para);
    }
    return [...map.entries()].map(([email, nombre]) => ({ email, nombre }));
  }, [hilo]);

  const enviarRespuesta = () => {
    if (replyRef.current?.isEmpty() && adjReply.length === 0) return;
    responder.mutate(
      {
        cuerpo: replyRef.current?.getText() ?? "",
        html: replyRef.current?.getHtml() || undefined,
        files: adjReply,
      },
      {
        onSuccess: () => {
          replyRef.current?.clear();
          setAdjReply([]);
          setReplyVacio(true);
          setRespondiendo(false);
          toast.toast("Respuesta enviada", "success");
        },
        onError: () => toast.toast("No se pudo enviar la respuesta", "error"),
      }
    );
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
                      <div className="flex shrink-0 items-center gap-2">
                        {m.rastreado && (
                          <span
                            className={cn(
                              "flex items-center gap-1 text-xs",
                              m.abierto_en ? "text-success" : "text-ink-3"
                            )}
                            title={
                              m.abierto_en
                                ? `Abierto ${new Date(m.abierto_en).toLocaleString("es-AR")}`
                                : "Enviado — todavía sin abrir"
                            }
                          >
                            <Eye size={13} />
                            {m.abierto_en ? "Abierto" : "Sin abrir"}
                          </span>
                        )}
                        <span className="text-xs text-ink-2">
                          {m.fecha ? new Date(m.fecha).toLocaleString("es-AR") : ""}
                        </span>
                      </div>
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
              <div className="mt-4">
                <RichEditor
                  ref={replyRef}
                  placeholder="Escribí tu respuesta…"
                  minHeight={140}
                  initialHtml={firma ? `<br><br>${firma}` : undefined}
                  onInput={setReplyVacio}
                />
                <AdjuntosChips
                  files={adjReply}
                  onQuitar={(i) => setAdjReply((a) => a.filter((_, j) => j !== i))}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <BotonAdjuntar onFiles={(fs) => setAdjReply((a) => [...a, ...fs])} />
                    <Button variant="ghost" size="sm" onClick={() => setRespondiendo(false)}>
                      Cancelar
                    </Button>
                  </div>
                  <SplitSend
                    onSend={enviarRespuesta}
                    pending={responder.isPending}
                    disabled={replyVacio && adjReply.length === 0}
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
              <li key={p.email} className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                  {p.nombre.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{p.nombre}</p>
                  <p className="truncate text-xs text-ink-3">{p.email}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 border-t border-line pt-4">
            <p className="text-sm font-semibold text-ink">Oportunidad</p>
            <p className="mb-3 mt-0.5 text-xs text-ink-3">
              Asociá este mail a una oportunidad existente o creá una nueva.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full justify-center"
                onClick={() => setVincularTab("asociar")}
              >
                <Link2 size={15} className="mr-1.5" /> Asociar a existente
              </Button>
              <Button
                className="w-full justify-center"
                onClick={() => setVincularTab("crear")}
              >
                <Target size={15} className="mr-1.5" /> Crear oportunidad nueva
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {vincularTab && (
        <VincularModal
          mailId={mailId}
          tabInicial={vincularTab}
          onClose={() => setVincularTab(null)}
        />
      )}
    </div>
  );
}

type RichEditorHandle = {
  getHtml: () => string;
  getText: () => string;
  clear: () => void;
  isEmpty: () => boolean;
};

// Editor de texto con formato (negrita, listas, links, imágenes inline). Sale
// como HTML. Uncontrolled: el padre lee el contenido con el ref al enviar.
const RichEditor = forwardRef<
  RichEditorHandle,
  {
    placeholder?: string;
    minHeight?: number;
    initialHtml?: string;
    onInput?: (vacio: boolean) => void;
  }
>(function RichEditor(
  { placeholder = "Escribí tu mensaje…", minHeight = 160, initialHtml, onInput },
  ref
) {
  const elRef = useRef<HTMLDivElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);

  // Contenido inicial (ej. la firma de Gmail). Se setea una sola vez al montar.
  useEffect(() => {
    if (initialHtml && elRef.current) {
      elRef.current.innerHTML = initialHtml;
      onInput?.(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vacio = () =>
    !(elRef.current?.innerText.trim() || elRef.current?.querySelector("img"));

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () => elRef.current?.innerHTML ?? "",
      getText: () => elRef.current?.innerText ?? "",
      clear: () => {
        if (elRef.current) elRef.current.innerHTML = "";
        onInput?.(true);
      },
      isEmpty: vacio,
    }),
    [onInput]
  );

  const cmd = (c: string, val?: string) => {
    elRef.current?.focus();
    document.execCommand(c, false, val);
    onInput?.(vacio());
  };
  const insertarImagen = (file: File) => {
    const r = new FileReader();
    r.onload = () => cmd("insertImage", r.result as string);
    r.readAsDataURL(file);
  };
  const enlazar = () => {
    const url = window.prompt("URL del enlace:");
    if (url) cmd("createLink", url);
  };

  const Btn = ({
    onClick,
    title,
    children,
  }: {
    onClick: () => void;
    title: string;
    children: ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded p-1.5 text-ink-2 transition hover:bg-surface2"
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-lg border border-line">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
        <Btn onClick={() => cmd("bold")} title="Negrita">
          <Bold size={15} />
        </Btn>
        <Btn onClick={() => cmd("italic")} title="Cursiva">
          <Italic size={15} />
        </Btn>
        <Btn onClick={() => cmd("underline")} title="Subrayado">
          <Underline size={15} />
        </Btn>
        <Btn onClick={() => cmd("strikeThrough")} title="Tachado">
          <Strikethrough size={15} />
        </Btn>
        <span className="mx-1 h-4 w-px bg-line" />
        <Btn onClick={() => cmd("insertUnorderedList")} title="Lista">
          <List size={15} />
        </Btn>
        <Btn onClick={() => cmd("insertOrderedList")} title="Lista numerada">
          <ListOrdered size={15} />
        </Btn>
        <span className="mx-1 h-4 w-px bg-line" />
        <Btn onClick={enlazar} title="Insertar enlace">
          <Link2 size={15} />
        </Btn>
        <Btn onClick={() => imgInput.current?.click()} title="Insertar imagen">
          <ImageIcon size={15} />
        </Btn>
        <Btn onClick={() => cmd("removeFormat")} title="Quitar formato">
          <RemoveFormatting size={15} />
        </Btn>
        <input
          ref={imgInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) insertarImagen(f);
            e.target.value = "";
          }}
        />
      </div>
      <div
        ref={elRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => onInput?.(vacio())}
        className="max-h-80 overflow-y-auto px-3 py-2 text-sm text-ink focus:outline-none [&_a]:text-accent [&_a]:underline [&_img]:my-1 [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        style={{ minHeight }}
      />
    </div>
  );
});

// Botón para adjuntar archivos (abre el selector).
function BotonAdjuntar({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inp = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => inp.current?.click()}
        title="Adjuntar archivos"
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-ink-2 transition hover:bg-surface2"
      >
        <Paperclip size={15} /> Adjuntar
      </button>
      <input
        ref={inp}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </>
  );
}

// Chips de adjuntos con botón para quitar.
function AdjuntosChips({
  files,
  onQuitar,
}: {
  files: File[];
  onQuitar: (i: number) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <span
          key={`${f.name}-${i}`}
          className="flex items-center gap-1.5 rounded-md border border-line bg-surface2/50 px-2 py-1 text-xs text-ink"
        >
          <Paperclip size={12} className="text-ink-3" />
          <span className="max-w-[180px] truncate">{f.name}</span>
          <button
            type="button"
            onClick={() => onQuitar(i)}
            className="text-ink-3 transition hover:text-danger"
            aria-label="Quitar adjunto"
          >
            <X size={13} />
          </button>
        </span>
      ))}
    </div>
  );
}

// Botón "Enviar" dividido: acción principal + flecha con opciones (Programar).
function SplitSend({
  onSend,
  onSchedule,
  pending,
  disabled,
  label = "Enviar",
}: {
  onSend: () => void;
  onSchedule?: () => void;
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
                if (onSchedule) onSchedule();
                else toast.toast("La programación es solo para correos nuevos", "info");
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

function minDatetimeLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function ComposeModal({ onClose }: { onClose: () => void }) {
  const redactar = useRedactar();
  const programar = useProgramar();
  const { data: firma } = useFirma();
  const toast = useToast();
  const [para, setPara] = useState("");
  const [asunto, setAsunto] = useState("");
  const [adjuntos, setAdjuntos] = useState<File[]>([]);
  const [vacio, setVacio] = useState(true);
  const editorRef = useRef<RichEditorHandle>(null);
  const [modoProgramar, setModoProgramar] = useState(false);
  const [cuando, setCuando] = useState("");

  const listo = Boolean(para.trim()) && (!vacio || adjuntos.length > 0);

  const enviar = () => {
    if (!listo) return;
    redactar.mutate(
      {
        para: para.trim(),
        asunto: asunto.trim() || undefined,
        cuerpo: editorRef.current?.getText() ?? "",
        html: editorRef.current?.getHtml() || undefined,
        files: adjuntos,
      },
      {
        onSuccess: () => {
          toast.toast("Correo enviado", "success");
          onClose();
        },
        onError: () => toast.toast("No se pudo enviar el correo", "error"),
      }
    );
  };

  const programarEnvio = () => {
    if (!listo || !cuando) return;
    programar.mutate(
      {
        para: para.trim(),
        asunto: asunto.trim() || undefined,
        cuerpo: editorRef.current?.getText() ?? "",
        html: editorRef.current?.getHtml() || undefined,
        cuando: new Date(cuando).toISOString(),
        files: adjuntos,
      },
      {
        onSuccess: () => {
          toast.toast("Correo programado", "success");
          onClose();
        },
        onError: () => toast.toast("No se pudo programar el correo", "error"),
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
          {firma === undefined ? (
            <p className="rounded-lg border border-line px-3 py-6 text-sm text-ink-2">
              Cargando…
            </p>
          ) : (
            <RichEditor
              ref={editorRef}
              minHeight={200}
              initialHtml={firma ? `<br><br>${firma}` : undefined}
              onInput={setVacio}
            />
          )}
          <div className="mt-2">
            <AdjuntosChips
              files={adjuntos}
              onQuitar={(i) => setAdjuntos((a) => a.filter((_, j) => j !== i))}
            />
          </div>
          <div className="mt-2">
            <BotonAdjuntar onFiles={(fs) => setAdjuntos((a) => [...a, ...fs])} />
          </div>
        </div>

        {modoProgramar && (
          <div className="rounded-lg border border-line bg-surface2/40 p-3">
            <label className="mb-1 block text-sm font-medium text-ink">
              Enviar el
            </label>
            <input
              type="datetime-local"
              value={cuando}
              min={minDatetimeLocal()}
              onChange={(e) => setCuando(e.target.value)}
              className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          {modoProgramar ? (
            <>
              <Button variant="ghost" onClick={() => setModoProgramar(false)}>
                Enviar ahora
              </Button>
              <Button
                onClick={programarEnvio}
                disabled={programar.isPending || !listo || !cuando}
              >
                <Clock size={15} className="mr-1.5" />
                {programar.isPending ? "Programando…" : "Programar"}
              </Button>
            </>
          ) : (
            <SplitSend
              onSend={enviar}
              onSchedule={() => setModoProgramar(true)}
              pending={redactar.isPending}
              disabled={!listo}
            />
          )}
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
function VincularModal({
  mailId,
  onClose,
  tabInicial = "crear",
}: {
  mailId: number;
  onClose: () => void;
  tabInicial?: "crear" | "asociar";
}) {
  const vincular = useVincularOportunidad(mailId);
  const { data: oportunidades } = useOportunidades();
  const toast = useToast();
  const [tab, setTab] = useState<"crear" | "asociar">(tabInicial);
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

function ProgramadosList() {
  const { data, isLoading } = useProgramados();
  const cancelar = useCancelarProgramado();
  const toast = useToast();

  if (isLoading) return <p className="p-4 text-sm text-ink-2">Cargando…</p>;
  if (!data || data.length === 0)
    return (
      <EmptyState
        icon={Clock}
        titulo="Sin correos programados"
        detalle="Redactá un correo nuevo y elegí 'Programar envío…' para verlo acá."
      />
    );

  return (
    <ul>
      {data.map((p) => (
        <li key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Clock size={16} className="shrink-0 text-ink-3" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {p.asunto || "(sin asunto)"}
            </p>
            <p className="truncate text-xs text-ink-3">Para {p.para}</p>
            {p.error && (
              <p className="truncate text-xs text-danger">Error: {p.error}</p>
            )}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-ink-2">
            {new Date(p.programado_para).toLocaleString("es-AR")}
          </span>
          <button
            type="button"
            onClick={() =>
              cancelar.mutate(p.id, {
                onSuccess: () => toast.toast("Programado cancelado", "info"),
              })
            }
            className="rounded-md p-1.5 text-ink-3 transition hover:bg-surface2 hover:text-danger"
            title="Cancelar envío programado"
            aria-label="Cancelar"
          >
            <Trash2 size={15} />
          </button>
        </li>
      ))}
    </ul>
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
