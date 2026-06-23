"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useCliente, useClientes } from "@/lib/clientes";
import { ESTADOS } from "@/lib/oportunidades";
import type { EstadoOportunidad, Oportunidad, OportunidadCreate } from "@/lib/types";
import { useUsuarios } from "@/lib/usuarios";

interface Props {
  initial?: Oportunidad;
  defaultVendedorId?: number | null;
  isPending: boolean;
  onSubmit: (values: OportunidadCreate) => void;
  onCancel: () => void;
}

// Convierte el value de un <select> ("" = sin seleccionar) a number | null.
const toId = (value: string): number | null => (value ? Number(value) : null);

export function OportunidadForm({
  initial,
  defaultVendedorId,
  isPending,
  onSubmit,
  onCancel,
}: Props) {
  const [clienteId, setClienteId] = useState<number | null>(initial?.cliente_id ?? null);
  const [contactoId, setContactoId] = useState<number | null>(
    initial?.contacto_cliente_id ?? null
  );
  const [vendedorId, setVendedorId] = useState<number | null>(
    initial?.vendedor_id ?? defaultVendedorId ?? null
  );
  const [estado, setEstado] = useState<EstadoOportunidad>(initial?.estado ?? "nueva");
  const [fuente, setFuente] = useState(initial?.fuente ?? "manual");

  const { data: clientes } = useClientes();
  const { data: usuarios } = useUsuarios();
  // Contactos del cliente elegido, para el selector de contacto.
  const { data: clienteDetail } = useCliente(clienteId ?? 0);
  const contactos = clienteDetail?.contactos ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      cliente_id: clienteId,
      contacto_cliente_id: contactoId,
      vendedor_id: vendedorId,
      estado,
      fuente: fuente.trim() || null,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="o-cliente">Cliente</Label>
        <Select
          id="o-cliente"
          value={clienteId ?? ""}
          onChange={(e) => {
            setClienteId(toId(e.target.value));
            setContactoId(null); // el contacto depende del cliente
          }}
        >
          <option value="">— Sin asignar —</option>
          {clientes?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.razon_social}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="o-contacto">Contacto</Label>
        <Select
          id="o-contacto"
          value={contactoId ?? ""}
          onChange={(e) => setContactoId(toId(e.target.value))}
          disabled={!clienteId}
        >
          <option value="">{clienteId ? "— Sin contacto —" : "Elegí un cliente primero"}</option>
          {contactos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.cargo ? ` (${c.cargo})` : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="o-vendedor">Vendedor</Label>
          <Select
            id="o-vendedor"
            value={vendedorId ?? ""}
            onChange={(e) => setVendedorId(toId(e.target.value))}
          >
            <option value="">— Sin asignar —</option>
            {usuarios?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="o-estado">Estado</Label>
          <Select
            id="o-estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoOportunidad)}
          >
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="o-fuente">Fuente</Label>
        <Input
          id="o-fuente"
          value={fuente ?? ""}
          onChange={(e) => setFuente(e.target.value)}
          placeholder="manual / mail"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
