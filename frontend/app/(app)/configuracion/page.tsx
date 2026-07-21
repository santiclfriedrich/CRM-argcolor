"use client";

import { Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
      <h1 className="text-2xl font-bold text-ink">Configuración</h1>
      <p className="mt-1 text-sm text-ink-2">
        Automatización de las respuestas de la IA y destinatarios de Compras.
      </p>

      {isLoading && <p className="mt-6 text-ink-2">Cargando…</p>}
      {isError && <p className="mt-6 text-red-600">No se pudo cargar la configuración.</p>}

      {data && (
        <div className="mt-6 divide-y divide-line rounded-lg border border-line">
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
        </div>
      )}

      <GruposCompras />
    </div>
  );
}

const parseCc = (s: string): string[] =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

// Grupos de destinatarios de Compras, propios de cada usuario.
function GruposCompras() {
  const { data: grupos, isLoading } = useGruposCompras();
  const createMut = useCreateGrupoCompras();
  const updateMut = useUpdateGrupoCompras();
  const deleteMut = useDeleteGrupoCompras();
  const confirm = useConfirm();

  const [nombre, setNombre] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !to.trim()) return;
    createMut.mutate(
      {
        nombre: nombre.trim(),
        to: to.trim(),
        cc: parseCc(cc),
        es_default: !grupos?.length, // el primero queda por defecto
      },
      {
        onSuccess: () => {
          setNombre("");
          setTo("");
          setCc("");
        },
      }
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
      <h2 className="text-lg font-semibold text-ink">Destinatarios de Compras</h2>
      <p className="mt-1 text-sm text-ink-2">
        Armá tus grupos de destinatarios (a qué mails enviar). Marcá uno por
        defecto; al pedir a Compras podés elegir cuál usar.
      </p>

      {isLoading ? (
        <p className="mt-4 text-ink-2">Cargando…</p>
      ) : (
        <div className="mt-4 space-y-3">
          {(grupos ?? []).map((g) => (
            <div
              key={g.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-line p-4"
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
                    onClick={() =>
                      updateMut.mutate({ id: g.id, body: { es_default: true } })
                    }
                    title="Marcar por defecto"
                  >
                    <Star size={14} /> Predeterminar
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => eliminar(g)}
                  className="text-ink-3 hover:text-red-600"
                  aria-label="Eliminar grupo"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}

          {grupos && grupos.length === 0 && (
            <p className="text-sm text-ink-3">
              No tenés grupos todavía. Creá el primero abajo.
            </p>
          )}

          <form
            onSubmit={agregar}
            className="space-y-3 rounded-lg border border-dashed border-line p-4"
          >
            <p className="text-sm font-semibold text-ink">Nuevo grupo</p>
            <div className="grid gap-3 sm:grid-cols-3">
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
              <div>
                <Label htmlFor="g-cc">CC (separados por coma)</Label>
                <Input
                  id="g-cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="jefe@…, otro@…"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={createMut.isPending || !nombre.trim() || !to.trim()}
              >
                {createMut.isPending ? "Agregando…" : "Agregar grupo"}
              </Button>
              {createMut.isError && (
                <span className="text-xs text-red-600">
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
