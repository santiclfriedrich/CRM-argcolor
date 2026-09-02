"use client";

import { Pencil, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmailChips } from "@/components/ui/email-chips";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type GrupoCompras,
  type Speech,
  useAutomatizacion,
  useCreateGrupoCompras,
  useCreateSpeech,
  useDeleteGrupoCompras,
  useDeleteSpeech,
  useGruposCompras,
  useSpeeches,
  useUpdateAutomatizacion,
  useUpdateGrupoCompras,
  useUpdateSpeech,
} from "@/lib/config";
import {
  useMiUsuario,
  useUpdateMiSyncMail,
  useUpdateUsuario,
  useUsuarios,
} from "@/lib/usuarios";
import type { Usuario } from "@/lib/types";

export default function ConfiguracionPage() {
  const { data, isLoading, isError } = useAutomatizacion();
  const updateMut = useUpdateAutomatizacion();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Configuración</h1>
      <p className="mt-1 text-sm text-ink-2">
        Automatización de las respuestas de la IA y destinatarios de Compras.
      </p>

      {isLoading && <p className="mt-6 text-ink-2">Cargando…</p>}
      {isError && <p className="mt-6 text-danger">No se pudo cargar la configuración.</p>}

      {data && (
        <Card className="mt-6 divide-y divide-line">
          <Row
            titulo="Acuse de recibo automático"
            detalle="Cuando entra un pedido claro, el cliente recibe automáticamente un acuse de recibo."
            checked={data.acuse_automatico}
            disabled={updateMut.isPending}
            onChange={(v) => updateMut.mutate({ acuse_automatico: v })}
          />
          <Row
            titulo="Aclaración automática"
            detalle="Cuando falta información en el pedido, envía solo el pedido de aclaración al cliente. Si está apagado, queda como borrador para enviar con un clic desde la bandeja."
            checked={data.aclaracion_automatica}
            disabled={updateMut.isPending}
            onChange={(v) => updateMut.mutate({ aclaracion_automatica: v })}
          />
        </Card>
      )}

      <SincronizacionMails />

      <GruposCompras />
      <SpeechesConfig />
    </div>
  );
}

// Pausar/activar la sincronización de mails a la bandeja. Cada usuario controla
// la suya; un admin puede además frenar la de otros.
function SincronizacionMails() {
  const { data: me } = useMiUsuario();
  const updateMi = useUpdateMiSyncMail();
  const esAdmin = me?.rol === "admin";
  const { data: usuarios } = useUsuarios();

  return (
    <>
      <h2 className="mt-8 text-lg font-semibold tracking-tight text-ink">
        Sincronización de mails
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Si la pausás, tus mails dejan de ingresar a la bandeja (ni el sync
        automático ni el botón manual). Al reactivarla se recuperan los mails de
        los últimos ~2 días; si estuvo pausada más tiempo, los anteriores no se
        recuperan.
      </p>

      <Card className="mt-4 divide-y divide-line">
        {me && (
          <Row
            titulo="Sincronizar mis mails a la bandeja"
            detalle={
              me.gmail_conectado
                ? "Activá para recibir tus mails; pausá para frenarlos."
                : "Todavía no conectaste tu Gmail; conectalo desde tu perfil."
            }
            checked={me.sync_mail_activo}
            disabled={updateMi.isPending}
            onChange={(v) => updateMi.mutate(v)}
          />
        )}

        {esAdmin && (
          <div className="p-4">
            <p className="mb-2 text-sm font-medium text-ink">Otros usuarios</p>
            <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {(usuarios ?? [])
                .filter((u) => u.id !== me?.id)
                .map((u) => (
                  <FilaUsuarioSync key={u.id} usuario={u} />
                ))}
              {(usuarios ?? []).filter((u) => u.id !== me?.id).length === 0 && (
                <p className="p-3 text-sm text-ink-3">No hay otros usuarios.</p>
              )}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

// Fila para que un admin pause/active la sync de otro usuario.
function FilaUsuarioSync({ usuario }: { usuario: Usuario }) {
  const update = useUpdateUsuario(usuario.id);
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{usuario.nombre}</p>
        <p className="truncate text-xs text-ink-3">
          {usuario.email}
          {usuario.gmail_conectado ? "" : " · sin Gmail conectado"}
        </p>
      </div>
      <Switch
        checked={usuario.sync_mail_activo}
        onCheckedChange={(v) => update.mutate({ sync_mail_activo: v })}
        disabled={update.isPending}
      />
    </div>
  );
}

// Grupos de destinatarios de Compras, propios de cada usuario.
function GruposCompras() {
  const { data: grupos, isLoading } = useGruposCompras();
  const createMut = useCreateGrupoCompras();
  const updateMut = useUpdateGrupoCompras();
  const deleteMut = useDeleteGrupoCompras();
  const confirm = useConfirm();

  // Nuevo grupo
  const [nombre, setNombre] = useState("");
  const [to, setTo] = useState("");
  const [ccList, setCcList] = useState<string[]>([]);

  // Edición en línea
  const [editId, setEditId] = useState<number | null>(null);
  const [eNombre, setENombre] = useState("");
  const [eTo, setETo] = useState("");
  const [eCc, setECc] = useState<string[]>([]);

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !to.trim()) return;
    createMut.mutate(
      {
        nombre: nombre.trim(),
        to: to.trim(),
        cc: ccList,
        es_default: !grupos?.length, // el primero queda por defecto
      },
      {
        onSuccess: () => {
          setNombre("");
          setTo("");
          setCcList([]);
        },
      }
    );
  };

  const empezarEdicion = (g: GrupoCompras) => {
    setEditId(g.id);
    setENombre(g.nombre);
    setETo(g.to);
    setECc(g.cc);
  };

  const guardarEdicion = (id: number) => {
    if (!eNombre.trim() || !eTo.trim()) return;
    updateMut.mutate(
      { id, body: { nombre: eNombre.trim(), to: eTo.trim(), cc: eCc } },
      { onSuccess: () => setEditId(null) }
    );
  };

  const eliminar = async (g: GrupoCompras) => {
    if (
      await confirm({
        title: "Eliminar grupo",
        message: `¿Eliminar el grupo "${g.nombre}"?`,
        danger: true,
      })
    ) {
      deleteMut.mutate(g.id);
    }
  };

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold tracking-tight text-ink">Destinatarios de Compras</h2>
      <p className="mt-1 text-sm text-ink-2">
        Armá tus grupos de destinatarios (a qué mails enviar). Marcá uno por
        defecto; al pedir a Compras podés elegir cuál usar.
      </p>

      {isLoading ? (
        <p className="mt-4 text-ink-2">Cargando…</p>
      ) : (
        <div className="mt-4 space-y-3">
          {(grupos ?? []).map((g) =>
            editId === g.id ? (
              <Card key={g.id} className="space-y-3 border-accent/40 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="e-nombre">Nombre del grupo *</Label>
                    <Input
                      id="e-nombre"
                      value={eNombre}
                      onChange={(ev) => setENombre(ev.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="e-to">Email principal *</Label>
                    <Input
                      id="e-to"
                      type="email"
                      value={eTo}
                      onChange={(ev) => setETo(ev.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="e-cc">CC (agregá cada mail con Enter)</Label>
                  <EmailChips id="e-cc" value={eCc} onChange={setECc} placeholder="jefe@… y Enter" />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => guardarEdicion(g.id)}
                    disabled={updateMut.isPending || !eNombre.trim() || !eTo.trim()}
                  >
                    {updateMut.isPending ? "Guardando…" : "Guardar"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditId(null)}>
                    Cancelar
                  </Button>
                </div>
              </Card>
            ) : (
              <Card
                key={g.id}
                className="flex items-start justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{g.nombre}</span>
                    {g.es_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-dim px-2 py-0.5 text-[11px] font-semibold text-accent">
                        <Star size={11} /> Por defecto
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-ink-2">Para: {g.to}</p>
                  {g.cc.length > 0 && (
                    <p className="truncate text-xs text-ink-3">CC: {g.cc.join(", ")}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!g.es_default && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateMut.mutate({ id: g.id, body: { es_default: true } })}
                      title="Marcar por defecto"
                    >
                      <Star size={14} /> Predeterminar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => empezarEdicion(g)}
                    aria-label="Editar grupo"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => eliminar(g)}
                    className="text-ink-3 hover:text-danger"
                    aria-label="Eliminar grupo"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            )
          )}

          {grupos && grupos.length === 0 && (
            <p className="text-sm text-ink-3">
              No tenés grupos todavía. Creá el primero abajo.
            </p>
          )}

          <form
            onSubmit={agregar}
            className="space-y-3 rounded-xl border border-dashed border-line p-4"
          >
            <p className="text-sm font-semibold text-ink">Nuevo grupo</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="g-nombre">Nombre del grupo *</Label>
                <Input
                  id="g-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Insumos"
                />
              </div>
              <div>
                <Label htmlFor="g-to">Email principal *</Label>
                <Input
                  id="g-to"
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="compras@argentinacolor.com"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="g-cc">CC (agregá cada mail con Enter)</Label>
              <EmailChips id="g-cc" value={ccList} onChange={setCcList} placeholder="jefe@… y Enter" />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={createMut.isPending || !nombre.trim() || !to.trim()}
              >
                {createMut.isPending ? "Agregando…" : "Agregar grupo"}
              </Button>
              {createMut.isError && (
                <span className="text-xs text-danger">
                  No se pudo agregar. Revisá que los emails sean válidos.
                </span>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// Speeches: plantillas de texto para el requerimiento a Compras, por usuario.
function SpeechesConfig() {
  const { data: speeches, isLoading } = useSpeeches();
  const createMut = useCreateSpeech();
  const updateMut = useUpdateSpeech();
  const deleteMut = useDeleteSpeech();
  const confirm = useConfirm();

  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const [eTitulo, setETitulo] = useState("");
  const [eTexto, setETexto] = useState("");

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !texto.trim()) return;
    createMut.mutate(
      { titulo: titulo.trim(), texto },
      {
        onSuccess: () => {
          setTitulo("");
          setTexto("");
        },
      }
    );
  };

  const empezarEdicion = (s: Speech) => {
    setEditId(s.id);
    setETitulo(s.titulo);
    setETexto(s.texto);
  };

  const guardarEdicion = (id: number) => {
    if (!eTitulo.trim() || !eTexto.trim()) return;
    updateMut.mutate(
      { id, body: { titulo: eTitulo.trim(), texto: eTexto } },
      { onSuccess: () => setEditId(null) }
    );
  };

  const eliminar = async (s: Speech) => {
    if (
      await confirm({
        title: "Eliminar speech",
        message: `¿Eliminar el speech "${s.titulo}"?`,
        danger: true,
      })
    ) {
      deleteMut.mutate(s.id);
    }
  };

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold tracking-tight text-ink">Speeches</h2>
      <p className="mt-1 text-sm text-ink-2">
        Plantillas de texto con un título. Al pedir a Compras (o desde una
        oportunidad) podés elegir un speech para llenar el requerimiento.
      </p>

      {isLoading ? (
        <p className="mt-4 text-ink-2">Cargando…</p>
      ) : (
        <div className="mt-4 space-y-3">
          {(speeches ?? []).map((s) =>
            editId === s.id ? (
              <Card key={s.id} className="space-y-3 border-accent/40 p-4">
                <div>
                  <Label htmlFor="e-sp-titulo">Título *</Label>
                  <Input
                    id="e-sp-titulo"
                    value={eTitulo}
                    onChange={(ev) => setETitulo(ev.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="e-sp-texto">Texto *</Label>
                  <Textarea
                    id="e-sp-texto"
                    rows={4}
                    value={eTexto}
                    onChange={(ev) => setETexto(ev.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => guardarEdicion(s.id)}
                    disabled={updateMut.isPending || !eTitulo.trim() || !eTexto.trim()}
                  >
                    {updateMut.isPending ? "Guardando…" : "Guardar"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditId(null)}>
                    Cancelar
                  </Button>
                </div>
              </Card>
            ) : (
              <Card key={s.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{s.titulo}</span>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-2">
                    {s.texto}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => empezarEdicion(s)}
                    aria-label="Editar speech"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => eliminar(s)}
                    className="text-ink-3 hover:text-danger"
                    aria-label="Eliminar speech"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            )
          )}

          {speeches && speeches.length === 0 && (
            <p className="text-sm text-ink-3">
              No tenés speeches todavía. Creá el primero abajo.
            </p>
          )}

          <form
            onSubmit={agregar}
            className="space-y-3 rounded-xl border border-dashed border-line p-4"
          >
            <p className="text-sm font-semibold text-ink">Nuevo speech</p>
            <div>
              <Label htmlFor="sp-titulo">Título *</Label>
              <Input
                id="sp-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Pedido estándar de insumos"
              />
            </div>
            <div>
              <Label htmlFor="sp-texto">Texto *</Label>
              <Textarea
                id="sp-texto"
                rows={4}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="El texto que se cargará en el requerimiento…"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={createMut.isPending || !titulo.trim() || !texto.trim()}
              >
                {createMut.isPending ? "Agregando…" : "Agregar speech"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Row({
  titulo,
  detalle,
  checked,
  disabled,
  onChange,
}: {
  titulo: string;
  detalle: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div>
        <p className="font-medium text-ink">{titulo}</p>
        <p className="mt-0.5 text-sm text-ink-2">{detalle}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
