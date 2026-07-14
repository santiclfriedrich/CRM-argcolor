"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectMenu } from "@/components/ui/select-menu";
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

// Convierte el value ("" = sin seleccionar) a number | null.
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
  const [asunto, setAsunto] = useState(initial?.asunto ?? "");
  const [valor, setValor] = useState(
    initial?.valor_estimado != null ? String(initial.valor_estimado) : ""
  );
  const [fechaPedido, setFechaPedido] = useState(initial?.fecha_pedido_cliente ?? "");
  const [fechaCompras, setFechaCompras] = useState(initial?.fecha_enviado_compras ?? "");
  const [fechaCliente, setFechaCliente] = useState(initial?.fecha_enviado_cliente ?? "");
  const [fechaLimite, setFechaLimite] = useState(initial?.fecha_limite ?? "");

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
      asunto: asunto.trim() || null,
      valor_estimado: valor ? Number(valor) : null,
      fecha_pedido_cliente: fechaPedido || null,
      fecha_enviado_compras: fechaCompras || null,
      fecha_enviado_cliente: fechaCliente || null,
      fecha_limite: fechaLimite || null,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="o-cliente">Cliente</Label>
        <SelectMenu
          id="o-cliente"
          value={clienteId != null ? String(clienteId) : ""}
          onChange={(v) => {
            setClienteId(toId(v));
            setContactoId(null); // el contacto depende del cliente
          }}
          placeholder="— Sin asignar —"
          options={[
            { value: "", label: "— Sin asignar —" },
            ...(clientes ?? []).map((c) => ({ value: String(c.id), label: c.razon_social })),
          ]}
        />
      </div>

      <div>
        <Label htmlFor="o-contacto">Contacto</Label>
        <SelectMenu
          id="o-contacto"
          value={contactoId != null ? String(contactoId) : ""}
          onChange={(v) => setContactoId(toId(v))}
          disabled={!clienteId}
          placeholder={clienteId ? "— Sin contacto —" : "Elegí un cliente primero"}
          options={[
            { value: "", label: "— Sin contacto —" },
            ...contactos.map((c) => ({
              value: String(c.id),
              label: `${c.nombre}${c.cargo ? ` (${c.cargo})` : ""}`,
            })),
          ]}
        />
      </div>

      <div>
        <Label htmlFor="o-asunto">Asunto / descripción</Label>
        <Input
          id="o-asunto"
          value={asunto}
          onChange={(e) => setAsunto(e.target.value)}
          placeholder="Ej: Cotización 100kg pigmento rojo"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="o-valor">Valor estimado (USD)</Label>
          <Input
            id="o-valor"
            type="number"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="o-limite">Validez / fecha límite</Label>
          <Input
            id="o-limite"
            type="date"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="o-fpedido">Pedido cliente</Label>
          <Input
            id="o-fpedido"
            type="date"
            value={fechaPedido}
            onChange={(e) => setFechaPedido(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="o-fcompras">Enviado a Compras</Label>
          <Input
            id="o-fcompras"
            type="date"
            value={fechaCompras}
            onChange={(e) => setFechaCompras(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="o-fcliente">Enviado al cliente</Label>
          <Input
            id="o-fcliente"
            type="date"
            value={fechaCliente}
            onChange={(e) => setFechaCliente(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="o-vendedor">Vendedor</Label>
          <SelectMenu
            id="o-vendedor"
            value={vendedorId != null ? String(vendedorId) : ""}
            onChange={(v) => setVendedorId(toId(v))}
            placeholder="— Sin asignar —"
            options={[
              { value: "", label: "— Sin asignar —" },
              ...(usuarios ?? []).map((u) => ({ value: String(u.id), label: u.nombre })),
            ]}
          />
        </div>
        <div>
          <Label htmlFor="o-estado">Estado</Label>
          <SelectMenu
            id="o-estado"
            value={estado}
            onChange={(v) => setEstado(v as EstadoOportunidad)}
            options={ESTADOS.map((e) => ({ value: e.value, label: e.label }))}
          />
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
