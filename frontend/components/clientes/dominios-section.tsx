"use client";

import { Plus, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { useCreateDominio, useDeleteDominio } from "@/lib/clientes";
import type { Dominio } from "@/lib/types";

interface Props {
  clienteId: number;
  dominios: Dominio[];
}

export function DominiosSection({ clienteId, dominios }: Props) {
  const [nuevo, setNuevo] = useState("");
  const [principal, setPrincipal] = useState(false);
  const createMut = useCreateDominio(clienteId);
  const deleteMut = useDeleteDominio(clienteId);

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

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-ink">Dominios de mail</h2>

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
            className="h-4 w-4 rounded border-line"
          />
          Principal
        </label>
        <Button type="submit" size="sm" disabled={createMut.isPending || !nuevo.trim()}>
          <Plus size={16} /> Agregar
        </Button>
      </form>

      <ul className="divide-y divide-line rounded-lg border border-line">
        {dominios.map((d) => (
          <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-2 font-mono text-ink">
              {d.dominio}
              {d.es_principal_dominio && (
                <Badge className="bg-amber-100 text-amber-700">
                  <Star size={11} className="mr-1" fill="currentColor" /> principal
                </Badge>
              )}
            </span>
            <Tooltip label="Eliminar">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`¿Eliminar el dominio "${d.dominio}"?`)) deleteMut.mutate(d.id);
                }}
                aria-label="Eliminar"
              >
                <Trash2 size={15} className="text-red-500" />
              </Button>
            </Tooltip>
          </li>
        ))}
        {dominios.length === 0 && (
          <li className="px-3 py-6 text-center text-ink-3">Sin dominios asociados.</li>
        )}
      </ul>
    </section>
  );
}
