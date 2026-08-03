"use client";

import { Pencil, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, Kicker } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmailChips } from "@/components/ui/email-chips";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  type GrupoCompras,
  useAutomatizacion,
  useCreateGrupoCompras,
  useDeleteGrupoCompras,
  useGruposCompras,
  useUpdateAutomatizacion,
  useUpdateGrupoCompras,
} from "@/lib/config";

export default function ConfiguracionPage() {
  const { data, isLoading, isError } = useAutomatizacion();
  const updateMut = useUpdateAutomatizacion();

  return (
    <div className="max-w-2xl">
      <Kicker>Ajustes</Kicker>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Configuración</h1>
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
            detalle="Si la IA detecta que falta información, envía sola el pedido de aclaración al cliente. Si está apagado, queda como borrador para enviar con un clic desde la bandeja."
            checked={data.aclaracion_automatica}
            disabled={updateMut.isPending}
            onChange={(v) => updateMut.mutate({ aclaracion_automatica: v })}
          />
        </Card>
      )}

      <GruposCompras />
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
