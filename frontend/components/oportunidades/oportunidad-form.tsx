"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { ClientePicker } from "@/components/clientes/cliente-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectMenu } from "@/components/ui/select-menu";
import { Textarea } from "@/components/ui/textarea";
import { useCliente, useClientes } from "@/lib/clientes";
import { loadDraft, saveDraft } from "@/lib/draft";
import { ESTADOS } from "@/lib/oportunidades";
import type { EstadoOportunidad, Oportunidad, OportunidadCreate } from "@/lib/types";
import { useUsuarios } from "@/lib/usuarios";

interface Props {
  initial?: Oportunidad;
  defaultVendedorId?: number | null;
  isPending: boolean;
  onSubmit: (values: OportunidadCreate, files: File[]) => void;
  onCancel: () => void;
  // Si se pasa (solo al crear), persiste un borrador en localStorage con esta clave.
  draftKey?: string;
}

type Snapshot = {
  clienteId: number | null;
  contactoId: number | null;
  vendedorId: number | null;
  estado: EstadoOportunidad;
  fuente: string;
  asunto: string;
  requerimiento: string;
  producto: string;
  numeroPedido: string;
  ing: string;
  observacion: string;
  cargadaGbp: boolean;
  valor: string;
  fechaPedido: string;
  fechaCompras: string;
  fechaRespCompras: string;
  fechaCliente: string;
  fechaLimite: string;
};

// Convierte el value ("" = sin seleccionar) a number | null.
const toId = (value: string): number | null => (value ? Number(value) : null);

export function OportunidadForm({
  initial,
  defaultVendedorId,
  isPending,
  onSubmit,
  onCancel,
  draftKey,
}: Props) {
  // Borrador guardado (solo al crear): se carga una vez al montar.
  const draft = useMemo(
    () => (initial || !draftKey ? null : loadDraft<Partial<Snapshot>>(draftKey)),
    [initial, draftKey]
  );

  const [clienteId, setClienteId] = useState<number | null>(
    draft?.clienteId ?? initial?.cliente_id ?? null
  );
  const [contactoId, setContactoId] = useState<number | null>(
    draft?.contactoId ?? initial?.contacto_cliente_id ?? null
  );
  const [vendedorId, setVendedorId] = useState<number | null>(
    draft?.vendedorId ?? initial?.vendedor_id ?? defaultVendedorId ?? null
  );
  const [estado, setEstado] = useState<EstadoOportunidad>(
    draft?.estado ?? initial?.estado ?? "nueva"
  );
  const [fuente, setFuente] = useState(draft?.fuente ?? initial?.fuente ?? "manual");
  const [asunto, setAsunto] = useState(draft?.asunto ?? initial?.asunto ?? "");
  const [requerimiento, setRequerimiento] = useState(
    draft?.requerimiento ?? initial?.requerimiento ?? ""
  );
  const [producto, setProducto] = useState(draft?.producto ?? initial?.producto ?? "");
  const [numeroPedido, setNumeroPedido] = useState(
    draft?.numeroPedido ?? initial?.numero_pedido ?? ""
  );
  const [ing, setIng] = useState(draft?.ing ?? initial?.ing ?? "");
  const [observacion, setObservacion] = useState(
    draft?.observacion ?? initial?.observacion ?? ""
  );
  const [cargadaGbp, setCargadaGbp] = useState(
    draft?.cargadaGbp ?? initial?.cargada_en_gbp ?? false
  );
  const [valor, setValor] = useState(
    draft?.valor ?? (initial?.valor_estimado != null ? String(initial.valor_estimado) : "")
  );
  const [fechaPedido, setFechaPedido] = useState(
    draft?.fechaPedido ?? initial?.fecha_pedido_cliente ?? ""
  );
  const [fechaCompras, setFechaCompras] = useState(
    draft?.fechaCompras ?? initial?.fecha_enviado_compras ?? ""
  );
  const [fechaRespCompras, setFechaRespCompras] = useState(
    draft?.fechaRespCompras ?? initial?.fecha_respuesta_compras ?? ""
  );
  const [fechaCliente, setFechaCliente] = useState(
    draft?.fechaCliente ?? initial?.fecha_enviado_cliente ?? ""
  );
  const [fechaLimite, setFechaLimite] = useState(
    draft?.fechaLimite ?? initial?.fecha_limite ?? ""
  );
  const [files, setFiles] = useState<File[]>([]);

  // Guarda el borrador ante cada cambio (solo al crear con draftKey).
  useEffect(() => {
    if (initial || !draftKey) return;
    saveDraft(draftKey, {
      clienteId,
      contactoId,
      vendedorId,
      estado,
      fuente,
      asunto,
      requerimiento,
      producto,
      numeroPedido,
      ing,
      observacion,
      cargadaGbp,
      valor,
      fechaPedido,
      fechaCompras,
      fechaRespCompras,
      fechaCliente,
      fechaLimite,
    });
  }, [
    initial,
    draftKey,
    clienteId,
    contactoId,
    vendedorId,
    estado,
    fuente,
    asunto,
    requerimiento,
    producto,
    numeroPedido,
    ing,
    observacion,
    cargadaGbp,
    valor,
    fechaPedido,
    fechaCompras,
    fechaRespCompras,
    fechaCliente,
    fechaLimite,
  ]);

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
      requerimiento: requerimiento.trim() || null,
      producto: producto.trim() || null,
      numero_pedido: numeroPedido.trim() || null,
      ing: ing.trim() || null,
      observacion: observacion.trim() || null,
      cargada_en_gbp: cargadaGbp,
      valor_estimado: valor ? Number(valor) : null,
      fecha_pedido_cliente: fechaPedido || null,
      fecha_enviado_compras: fechaCompras || null,
      fecha_respuesta_compras: fechaRespCompras || null,
      fecha_enviado_cliente: fechaCliente || null,
      fecha_limite: fechaLimite || null,
    }, files);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="o-cliente">Cliente</Label>
          <ClientePicker
            clientes={clientes ?? []}
            value={clienteId}
            onChange={(id) => {
              setClienteId(id);
              setContactoId(null); // el contacto depende del cliente
            }}
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

      <div>
        <Label htmlFor="o-requerimiento">Requerimiento (leído por la IA)</Label>
        <Textarea
          id="o-requerimiento"
          rows={4}
          value={requerimiento}
          onChange={(e) => setRequerimiento(e.target.value)}
          placeholder="Qué pidió el cliente: producto, cantidad, detalle, plazo…"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="o-producto">Producto</Label>
          <Input
            id="o-producto"
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            placeholder="Ej: Insumos, Tablets…"
          />
        </div>
        <div>
          <Label htmlFor="o-pedido">N° de pedido</Label>
          <Input
            id="o-pedido"
            value={numeroPedido}
            onChange={(e) => setNumeroPedido(e.target.value)}
            placeholder="Ej: 1-594059"
          />
        </div>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <Label htmlFor="o-frcompras">Respuesta Compras</Label>
          <Input
            id="o-frcompras"
            type="date"
            value={fechaRespCompras}
            onChange={(e) => setFechaRespCompras(e.target.value)}
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
        <Label htmlFor="o-ing">Ing. (iniciales)</Label>
        <Input
          id="o-ing"
          value={ing}
          onChange={(e) => setIng(e.target.value.toUpperCase().slice(0, 5))}
          placeholder="Ej: C.S"
          className="w-32"
        />
      </div>

      <div>
        <Label htmlFor="o-observacion">Observación</Label>
        <Textarea
          id="o-observacion"
          rows={2}
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder="Ej: En espera del cliente, no respondió…"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={cargadaGbp}
          onChange={(e) => setCargadaGbp(e.target.checked)}
          className="h-4 w-4 rounded border-line accent-navy"
        />
        Cargada en GBP
      </label>

      <div>
        <Label htmlFor="o-fuente">Fuente</Label>
        <Input
          id="o-fuente"
          value={fuente ?? ""}
          onChange={(e) => setFuente(e.target.value)}
          placeholder="manual / mail"
        />
      </div>

      <div>
        <Label htmlFor="o-files">Adjuntos (PDF o imágenes)</Label>
        <input
          id="o-files"
          type="file"
          multiple
          accept=".pdf,image/*"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface3"
        />
        {files.length > 0 && (
          <p className="mt-1 text-xs text-ink-3">
            {files.length} archivo(s) seleccionado(s)
          </p>
        )}
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
