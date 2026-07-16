"use client";

import {
  ClipboardList,
  FileText,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { OportunidadForm } from "@/components/oportunidades/oportunidad-form";
import { SolicitudForm } from "@/components/solicitudes/solicitud-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SelectMenu } from "@/components/ui/select-menu";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { useClientes } from "@/lib/clientes";
import {
  ESTADOS,
  ESTADO_META,
  useAgregarComentario,
  useCreateOportunidad,
  useDeleteOportunidad,
  useOportunidades,
  useSugerenciaCompras,
  useUpdateOportunidad,
} from "@/lib/oportunidades";
import { fmtMonto, useCreatePresupuesto } from "@/lib/presupuestos";
import { useCrearYEnviarSolicitud } from "@/lib/solicitudes";
import type {
  EstadoOportunidad,
  Oportunidad,
  OportunidadCreate,
  OportunidadFiltros,
} from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";

// "2026-08-01" -> "01/08/2026" (sin líos de zona horaria).
function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const CERRADOS: EstadoOportunidad[] = ["ganada", "facturada", "perdida", "cargada_en_gbp"];

function estaVencida(o: Oportunidad): boolean {
  if (!o.fecha_limite || CERRADOS.includes(o.estado)) return false;
  return o.fecha_limite < new Date().toISOString().slice(0, 10);
}

export default function OportunidadesPage() {
  const { data: session } = useSession();
  const currentUserId = Number(session?.usuario?.id) || null;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Oportunidad | null>(null);
  const [pidiendo, setPidiendo] = useState<Oportunidad | null>(null);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [filtros, setFiltros] = useState<OportunidadFiltros>({
    estado: "",
    cliente_id: null,
    solo_mias: true,
  });

  const router = useRouter();
  const { data, isLoading, isError } = useOportunidades(filtros);
  const { data: clientes } = useClientes();
  const createMut = useCreateOportunidad();
  const deleteMut = useDeleteOportunidad();
  const crearPresupuesto = useCreatePresupuesto();

  // Abrir el seguimiento si llega ?op=ID (desde la búsqueda global).
  useEffect(() => {
    const op = new URLSearchParams(window.location.search).get("op");
    if (op) setDetalleId(Number(op));
  }, []);

  const detalle = data?.find((o) => o.id === detalleId) ?? null;

  const eliminar = (o: Oportunidad) => {
    const quien = o.cliente?.razon_social ?? `#${o.id}`;
    if (window.confirm(`¿Eliminar la oportunidad de ${quien}? Esta acción no se puede deshacer.`)) {
      deleteMut.mutate(o.id);
    }
  };

  const armarPresupuesto = (o: Oportunidad) =>
    crearPresupuesto.mutate(
      { oportunidad_id: o.id, items: [] },
      { onSuccess: (p) => router.push(`/presupuestos/${p.id}`) }
    );

  const setFiltro = (patch: Partial<OportunidadFiltros>) =>
    setFiltros((f) => ({ ...f, ...patch }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Oportunidades</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nueva oportunidad
        </Button>
      </div>

      {/* Alcance: mías / todas */}
      <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-800/60">
        {[
          { value: true, label: "Mías" },
          { value: false, label: "Todas" },
        ].map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => setFiltro({ solo_mias: opt.value })}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              Boolean(filtros.solo_mias) === opt.value
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Estado</label>
          <SelectMenu
            value={filtros.estado ?? ""}
            onChange={(v) => setFiltro({ estado: v as EstadoOportunidad | "" })}
            placeholder="Todos"
            options={[
              { value: "", label: "Todos" },
              ...ESTADOS.map((e) => ({ value: e.value, label: e.label })),
            ]}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Cliente</label>
          <SelectMenu
            value={filtros.cliente_id != null ? String(filtros.cliente_id) : ""}
            onChange={(v) => setFiltro({ cliente_id: v ? Number(v) : null })}
            placeholder="Todos"
            options={[
              { value: "", label: "Todos" },
              ...(clientes ?? []).map((c) => ({ value: String(c.id), label: c.razon_social })),
            ]}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Desde</label>
          <Input
            type="date"
            value={filtros.desde ?? ""}
            onChange={(e) => setFiltro({ desde: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Hasta</label>
          <Input
            type="date"
            value={filtros.hasta ?? ""}
            onChange={(e) => setFiltro({ hasta: e.target.value })}
          />
        </div>
      </div>

      {isLoading && <p className="mt-4 text-slate-500 dark:text-slate-400">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-red-600">
          No se pudo cargar. ¿El backend está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {data && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Asunto</th>
                <th className="px-3 py-2 font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Validez</th>
                <th className="px-3 py-2 font-medium">Últ. mov.</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td
                    className="cursor-pointer px-3 py-2 font-medium text-slate-500 hover:text-brand dark:text-slate-400"
                    onClick={() => setDetalleId(o.id)}
                  >
                    #{o.id}
                  </td>
                  <td
                    className="cursor-pointer px-3 py-2 font-medium text-slate-800 hover:text-brand dark:text-slate-100"
                    onClick={() => setDetalleId(o.id)}
                  >
                    {o.cliente?.razon_social ?? "—"}
                  </td>
                  <td
                    className="max-w-xs cursor-pointer truncate px-3 py-2 text-slate-600 dark:text-slate-300"
                    onClick={() => setDetalleId(o.id)}
                  >
                    {o.asunto ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                    {o.valor_estimado != null ? fmtMonto(o.valor_estimado, "USD") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={ESTADO_META[o.estado].color}>{ESTADO_META[o.estado].label}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <span className={estaVencida(o) ? "font-semibold text-red-600" : "text-slate-500 dark:text-slate-400"}>
                      {fmtDate(o.fecha_limite)}
                      {estaVencida(o) ? " (vencida)" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                    {new Date(o.fecha_ultimo_movimiento).toLocaleDateString("es-AR")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end">
                      <Tooltip label="Seguimiento">
                        <Button variant="ghost" size="icon" onClick={() => setDetalleId(o.id)} aria-label="Seguimiento" className="text-slate-400 hover:text-brand dark:text-slate-500">
                          <MessageSquare size={15} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Pedir a Compras">
                        <Button variant="ghost" size="icon" onClick={() => setPidiendo(o)} aria-label="Pedir a Compras" className="text-slate-400 hover:text-brand dark:text-slate-500">
                          <ClipboardList size={15} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Armar presupuesto">
                        <Button variant="ghost" size="icon" onClick={() => armarPresupuesto(o)} disabled={crearPresupuesto.isPending} aria-label="Armar presupuesto" className="text-slate-400 hover:text-brand dark:text-slate-500">
                          <FileText size={15} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Editar">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(o)} aria-label="Editar">
                          <Pencil size={15} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="Eliminar">
                        <Button variant="ghost" size="icon" onClick={() => eliminar(o)} disabled={deleteMut.isPending} aria-label="Eliminar" className="text-slate-400 hover:text-red-600 dark:text-slate-500">
                          <Trash2 size={15} />
                        </Button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                    No hay oportunidades con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva oportunidad">
        <OportunidadForm
          defaultVendedorId={currentUserId}
          isPending={createMut.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => createMut.mutate(values, { onSuccess: () => setCreating(false) })}
        />
      </Modal>

      {editing && <EditOportunidadModal oportunidad={editing} onClose={() => setEditing(null)} />}
      {pidiendo && <PedirComprasModal oportunidad={pidiendo} onClose={() => setPidiendo(null)} />}
      {detalle && <SeguimientoModal oportunidad={detalle} onClose={() => setDetalleId(null)} />}
    </div>
  );
}

// Centro de seguimiento: fechas clave + bitácora de comentarios.
function SeguimientoModal({
  oportunidad,
  onClose,
}: {
  oportunidad: Oportunidad;
  onClose: () => void;
}) {
  const comentarioMut = useAgregarComentario(oportunidad.id);
  const [texto, setTexto] = useState("");

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    comentarioMut.mutate(texto.trim(), { onSuccess: () => setTexto("") });
  };

  const cliente = oportunidad.cliente?.razon_social ?? `#${oportunidad.id}`;
  const comentarios = [...oportunidad.comentarios].reverse();

  return (
    <Modal open onClose={onClose} title={`Seguimiento — ${cliente}`}>
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge className={ESTADO_META[oportunidad.estado].color}>
              {ESTADO_META[oportunidad.estado].label}
            </Badge>
            {oportunidad.valor_estimado != null && (
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {fmtMonto(oportunidad.valor_estimado, "USD")}
              </span>
            )}
          </div>
          {oportunidad.asunto && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{oportunidad.asunto}</p>
          )}
        </div>

        {/* Línea de tiempo de fechas clave */}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/40">
          <Fecha label="Pedido del cliente" value={oportunidad.fecha_pedido_cliente} />
          <Fecha label="Enviado a Compras" value={oportunidad.fecha_enviado_compras} />
          <Fecha label="Enviado al cliente" value={oportunidad.fecha_enviado_cliente} />
          <Fecha label="Validez / límite" value={oportunidad.fecha_limite} alerta={estaVencida(oportunidad)} />
        </div>

        {/* Bitácora */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Bitácora de seguimiento</p>
          <form onSubmit={agregar} className="mb-3 flex items-start gap-2">
            <Textarea
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Anotá una llamada, un avance, una respuesta del cliente…"
            />
            <Button type="submit" size="sm" disabled={comentarioMut.isPending || !texto.trim()}>
              <Send size={14} />
            </Button>
          </form>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {comentarios.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
                Sin anotaciones todavía.
              </p>
            ) : (
              comentarios.map((c, i) => (
                <div
                  key={i}
                  className="rounded-md border border-slate-200 bg-white p-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="mb-0.5 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                    <span>{c.autor ?? "—"}</span>
                    <span>{new Date(c.fecha).toLocaleString("es-AR")}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{c.texto}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Fecha({ label, value, alerta }: { label: string; value: string | null; alerta?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-400 dark:text-slate-500">{label}</div>
      <div className={alerta ? "font-semibold text-red-600" : "text-slate-700 dark:text-slate-200"}>
        {fmtDate(value)}
        {alerta ? " (vencida)" : ""}
      </div>
    </div>
  );
}

function PedirComprasModal({ oportunidad, onClose }: { oportunidad: Oportunidad; onClose: () => void }) {
  const router = useRouter();
  const { data: sugerencia, isLoading } = useSugerenciaCompras(oportunidad.id);
  const crearYEnviar = useCrearYEnviarSolicitud();
  const cliente = oportunidad.cliente?.razon_social ?? `#${oportunidad.id}`;

  return (
    <Modal open onClose={onClose} title={`Pedir a Compras — ${cliente}`}>
      {isLoading ? (
        <p className="text-slate-500 dark:text-slate-400">Cargando sugerencia…</p>
      ) : (
        <div className="space-y-3">
          <SolicitudForm
            isPending={crearYEnviar.isPending}
            submitLabel="Enviar a Compras"
            pendingLabel="Enviando a Compras…"
            defaultOportunidadId={oportunidad.id}
            defaultRequerimiento={sugerencia?.requerimiento ?? ""}
            lockOportunidad
            onCancel={onClose}
            onSubmit={(values, files) =>
              crearYEnviar.mutate(
                { body: values, files },
                {
                  onSuccess: () => {
                    onClose();
                    router.push("/solicitudes");
                  },
                }
              )
            }
          />
          {crearYEnviar.isError && (
            <p className="text-sm text-red-600">
              {errorMessage(
                crearYEnviar.error,
                "La solicitud se creó pero no se pudo enviar a Compras. Reintentá el envío desde Solicitudes.",
              )}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function EditOportunidadModal({ oportunidad, onClose }: { oportunidad: Oportunidad; onClose: () => void }) {
  const updateMut = useUpdateOportunidad(oportunidad.id);
  const handleSubmit = (values: OportunidadCreate) => updateMut.mutate(values, { onSuccess: onClose });

  return (
    <Modal open onClose={onClose} title={`Editar oportunidad #${oportunidad.id}`}>
      <OportunidadForm
        initial={oportunidad}
        isPending={updateMut.isPending}
        onCancel={onClose}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
}
