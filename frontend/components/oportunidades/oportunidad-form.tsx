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
