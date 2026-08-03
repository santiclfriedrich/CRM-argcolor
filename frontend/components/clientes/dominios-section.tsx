"use client";

import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { useCreateDominio, useDeleteDominio, useUpdateDominio } from "@/lib/clientes";
import type { Dominio } from "@/lib/types";

interface Props {
  clienteId: number;
  dominios: Dominio[];
}

export function DominiosSection({ clienteId, dominios }: Props) {
  const [nuevo, setNuevo] = useState("");
  const [principal, setPrincipal] = useState(false);
  const createMut = useCreateDominio(clienteId);
  const updateMut = useUpdateDominio(clienteId);
  const deleteMut = useDeleteDominio(clienteId);
  const confirm = useConfirm();

  // Edición en línea de un dominio ya cargado.
  const [editId, setEditId] = useState<number | null>(null);
  const [editDominio, setEditDominio] = useState("");
  const [editPrincipal, setEditPrincipal] = useState(false);

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    const dominio = nuevo.trim();
    if (!dominio) return;
    createMut.mutate(
      { dominio, es_principal_dominio: principal },
      {
        onSuccess: () => {
          setNuevo("");
          setPrincipal(false);
        },
      }
    );
  };

  const empezarEdicion = (d: Dominio) => {
    setEditId(d.id);
    setEditDominio(d.dominio);
    setEditPrincipal(d.es_principal_dominio);
  };

  const guardarEdicion = (id: number) => {
    const dominio = editDominio.trim();
    if (!dominio) return;
    updateMut.mutate(
      { id, body: { dominio, es_principal_dominio: editPrincipal } },
      { onSuccess: () => setEditId(null) }
    );
  };

  const eliminar = async (d: Dominio) => {
    if (
      await confirm({
        title: "Eliminar dominio",
        message: `¿Eliminar el dominio "${d.dominio}"?`,
        danger: true,
      })
    ) {
      deleteMut.mutate(d.id);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-base font-semibold tracking-tight text-ink">Dominios (sin @)</h2>

      <form onSubmit={agregar} className="mb-3 flex items-center gap-2">
        <Input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="bencen.com.ar"
          className="max-w-xs"
        />
        <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-ink-2">
          <input
            type="checkbox"
            checked={principal}
            onChange={(e) => setPrincipal(e.target.checked)}
            className="h-4 w-4 rounded border-line accent-navy"
          />
          Principal
        </label>
        <Button type="submit" size="sm" disabled={createMut.isPending || !nuevo.trim()}>
          <Plus size={16} /> Agregar
        </Button>
      </form>

      <ul className="divide-y divide-line rounded-lg border border-line">
        {dominios.map((d) =>
          editId === d.id ? (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <Input
                value={editDominio}
                onChange={(e) => setEditDominio(e.target.value)}
                className="max-w-xs"
                autoFocus
              />
              <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={editPrincipal}
                  onChange={(e) => setEditPrincipal(e.target.checked)}
                  className="h-4 w-4 rounded border-line accent-navy"
                />
                Principal
              </label>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  onClick={() => guardarEdicion(d.id)}
                  disabled={updateMut.isPending || !editDominio.trim()}
                >
                  {updateMut.isPending ? "Guardando…" : "Guardar"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditId(null)}>
                  Cancelar
                </Button>
              </div>
            </li>
          ) : (
            <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-2 font-mono text-ink">
                {d.dominio}
                {d.es_principal_dominio && (
                  <Badge tone="warning">
                    <Star size={11} className="mr-1" fill="currentColor" /> principal
                  </Badge>
                )}
              </span>
              <div className="flex items-center gap-1">
                <Tooltip label="Editar">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => empezarEdicion(d)}
                    aria-label="Editar"
                  >
                    <Pencil size={15} className="text-ink-3" />
                  </Button>
                </Tooltip>
                <Tooltip label="Eliminar">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => eliminar(d)}
                    aria-label="Eliminar"
                  >
                    <Trash2 size={15} className="text-danger" />
                  </Button>
                </Tooltip>
              </div>
            </li>
          )
        )}
        {dominios.length === 0 && (
          <li className="px-3 py-6 text-center text-ink-3">Sin dominios asociados.</li>
        )}
      </ul>
    </Card>
  );
}
