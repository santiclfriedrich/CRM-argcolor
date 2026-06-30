"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { OportunidadForm } from "@/components/oportunidades/oportunidad-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  ESTADO_META,
  useCreateOportunidad,
  useDeleteOportunidad,
  useOportunidades,
  useUpdateOportunidad,
} from "@/lib/oportunidades";
import type { Oportunidad, OportunidadCreate } from "@/lib/types";

export default function OportunidadesPage() {
  const { data: session } = useSession();
  const currentUserId = Number(session?.usuario?.id) || null;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Oportunidad | null>(null);

  const { data, isLoading, isError } = useOportunidades();
  const createMut = useCreateOportunidad();
  const deleteMut = useDeleteOportunidad();

  const eliminar = (o: Oportunidad) => {
    const quien = o.cliente?.razon_social ?? `#${o.id}`;
    if (window.confirm(`¿Eliminar la oportunidad de ${quien}? Esta acción no se puede deshacer.`)) {
      deleteMut.mutate(o.id);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Oportunidades</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nueva oportunidad
        </Button>
      </div>

      {isLoading && <p className="mt-4 text-slate-500 dark:text-slate-400">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-red-600">
          No se pudo cargar. ¿El backend está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {data && (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">ID</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Contacto</th>
                <th className="px-4 py-2 font-medium">Vendedor</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Últ. movimiento</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((o) => {
                const meta = ESTADO_META[o.estado];
                return (
                  <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400">{o.id}</td>
                    <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">
                      {o.cliente?.razon_social ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{o.contacto?.nombre ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{o.vendedor?.nombre ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge className={meta.color}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                      {new Date(o.fecha_ultimo_movimiento).toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(o)}
                        aria-label="Editar"
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => eliminar(o)}
                        disabled={deleteMut.isPending}
                        aria-label="Eliminar"
                        className="text-slate-400 dark:text-slate-500 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                    No hay oportunidades todavía.
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
          onSubmit={(values) =>
            createMut.mutate(values, { onSuccess: () => setCreating(false) })
          }
        />
      </Modal>

      {editing && (
        <EditOportunidadModal oportunidad={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function EditOportunidadModal({
  oportunidad,
  onClose,
}: {
  oportunidad: Oportunidad;
  onClose: () => void;
}) {
  const updateMut = useUpdateOportunidad(oportunidad.id);
  const handleSubmit = (values: OportunidadCreate) =>
    updateMut.mutate(values, { onSuccess: onClose });

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
