"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClienteCreate } from "@/lib/types";

interface ClienteFormProps {
  initial?: Partial<ClienteCreate>;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (values: ClienteCreate) => void;
  onCancel?: () => void;
}

export function ClienteForm({
  initial,
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
}: ClienteFormProps) {
  const [razonSocial, setRazonSocial] = useState(initial?.razon_social ?? "");
  const [cuit, setCuit] = useState(initial?.cuit ?? "");
  const [notas, setNotas] = useState(initial?.notas ?? "");
  const [activo, setActivo] = useState(initial?.activo ?? true);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!razonSocial.trim()) return;
    onSubmit({
      razon_social: razonSocial.trim(),
      cuit: cuit.trim() || null,
      notas: notas.trim() || null,
      activo,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="razon_social">Razón social *</Label>
        <Input
          id="razon_social"
          value={razonSocial}
          onChange={(e) => setRazonSocial(e.target.value)}
          placeholder="BENCEN S.A."
          required
        />
      </div>
      <div>
        <Label htmlFor="cuit">CUIT</Label>
        <Input
          id="cuit"
          value={cuit ?? ""}
          onChange={(e) => setCuit(e.target.value)}
          placeholder="30-12345678-9"
        />
      </div>
      <div>
        <Label htmlFor="notas">Notas</Label>
        <Textarea
          id="notas"
          rows={3}
          value={notas ?? ""}
          onChange={(e) => setNotas(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Activo
      </label>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isPending || !razonSocial.trim()}>
          {isPending ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
