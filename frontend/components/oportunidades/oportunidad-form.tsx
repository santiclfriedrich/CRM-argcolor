"use client";

import { FileText, X } from "lucide-react";
import { useEffect, useMemo, useState, type ClipboardEvent, type FormEvent } from "react";

import { ClientePicker } from "@/components/clientes/cliente-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSeccion } from "@/components/ui/seccion";
import { SelectMenu } from "@/components/ui/select-menu";
import { Textarea } from "@/components/ui/textarea";
import { imagenesPegadas, sumarSinDuplicados, useImagePreviews } from "@/lib/attachments";
import { useCliente, useClientes } from "@/lib/clientes";
import { loadDraft, saveDraft } from "@/lib/draft";
import { ESTADOS, objectUrlAdjuntoOportunidad } from "@/lib/oportunidades";
import type { AdjuntoOportunidad, EstadoOportunidad, Oportunidad, OportunidadCreate } from "@/lib/types";
import { useUsuarios } from "@/lib/usuarios";

interface Props {
  initial?: Oportunidad;
  defaultVendedorId?: number | null;
  isPending: boolean;
  // files: adjuntos comunes. imagenesReq: imágenes pegadas en el requerimiento
  // (se guardan marcadas como origen="requerimiento").
  onSubmit: (values: OportunidadCreate, files: File[], imagenesReq: File[]) => void;
  onCancel: () => void;
  // Borrar una imagen del requerimiento ya guardada (solo en edición).
  onEliminarImagenReq?: (adjuntoId: number) => void;
  // Mostrar los adjuntos comunes ya guardados dentro del form (para el modal
  // "Modificar", que no tiene la sección de adjuntos del detalle). En el detalle
  // se deja en false para no duplicarlos con su propia sección.
  mostrarAdjuntosGuardados?: boolean;
  // Si se pasa (solo al crear), persiste un borrador en localStorage con esta clave.
  draftKey?: string;
}

// Marca que identifica las imágenes pegadas en el requerimiento.
const ORIGEN_REQ = "requerimiento";

// Miniatura de una imagen del requerimiento ya guardada: baja el blob con auth
// (un <img src> no manda el token) y lo muestra.
function ImagenReqGuardada({
  oportunidadId,
  adjunto,
  onEliminar,
}: {
  oportunidadId: number;
  adjunto: AdjuntoOportunidad;
  onEliminar?: (adjuntoId: number) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    let creada: string | null = null;
    objectUrlAdjuntoOportunidad(oportunidadId, adjunto.id)
      .then((u) => {
        creada = u;
        if (vivo) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {});
    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [oportunidadId, adjunto.id]);

  return (
    <ThumbBox
      alt={adjunto.filename}
      src={url}
      onOpen={url ? () => window.open(url, "_blank", "noopener") : undefined}
      onQuitar={onEliminar ? () => onEliminar(adjunto.id) : undefined}
    />
  );
}

// Adjunto ya guardado (no-requerimiento): chip con nombre; abre el archivo al
// clickear. Carga el blob con auth (como ImagenReqGuardada).
function AdjuntoGuardado({
  oportunidadId,
  adjunto,
  onEliminar,
}: {
  oportunidadId: number;
  adjunto: AdjuntoOportunidad;
  onEliminar?: (adjuntoId: number) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    let creada: string | null = null;
    objectUrlAdjuntoOportunidad(oportunidadId, adjunto.id)
      .then((u) => {
        creada = u;
        if (vivo) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {});
    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [oportunidadId, adjunto.id]);

  const esImagen = (adjunto.mime_type ?? "").startsWith("image/");
  return (
    <li className="flex items-center gap-2 rounded-md bg-surface2 px-2.5 py-1.5 text-xs text-ink-2">
      {esImagen && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={adjunto.filename}
          className="h-9 w-9 shrink-0 rounded object-cover ring-1 ring-line"
        />
      ) : (
        <FileText size={16} className="shrink-0 text-ink-3" />
      )}
      <button
        type="button"
        onClick={() => url && window.open(url, "_blank", "noopener")}
        disabled={!url}
        title={`Abrir ${adjunto.filename}`}
        className="min-w-0 flex-1 truncate text-left hover:underline disabled:no-underline"
      >
        {adjunto.filename}
      </button>
      {onEliminar && (
        <button
          type="button"
          onClick={() => onEliminar(adjunto.id)}
          className="shrink-0 text-ink-3 transition-colors hover:text-danger"
        >
          Quitar
        </button>
      )}
    </li>
  );
}

// Caja de miniatura reutilizable (imagen guardada o recién pegada).
// `onOpen`: si se pasa, la miniatura es clickeable y abre la imagen en grande.
function ThumbBox({
  src,
  alt,
  onQuitar,
  onOpen,
}: {
  src: string | null;
  alt: string;
  onQuitar?: () => void;
  onOpen?: () => void;
}) {
  const inner = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} title={alt} className="h-full w-full object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <FileText size={18} className="text-ink-3" />
    </div>
  );
  return (
    <div className="group relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-surface2">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          title={`Abrir ${alt}`}
          className="block h-full w-full cursor-zoom-in"
        >
          {inner}
        </button>
      ) : (
        inner
      )}
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label="Quitar imagen"
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
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
  onEliminarImagenReq,
  mostrarAdjuntosGuardados = false,
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
  const [fechaEntrega, setFechaEntrega] = useState(initial?.fecha_entrega ?? "");
  // Campos de la sección Gubernamental (licitaciones). Las horas vienen del
  // backend como "HH:MM:SS"; el input type="time" usa "HH:MM" (slice 0,5).
  const [proceso, setProceso] = useState(initial?.proceso ?? "");
  const [expediente, setExpediente] = useState(initial?.expediente ?? "");
  const [portal, setPortal] = useState(initial?.portal ?? "");
  const [apertura, setApertura] = useState(initial?.apertura ?? "");
  const [hrPliego, setHrPliego] = useState((initial?.hr_pliego ?? "").slice(0, 5));
  const [hrApertura, setHrApertura] = useState((initial?.hr_apertura ?? "").slice(0, 5));
  const [moneda, setMoneda] = useState(initial?.moneda ?? "");
  const [pliego, setPliego] = useState(initial?.pliego ?? "");
  const [empresa, setEmpresa] = useState(initial?.empresa ?? "");
  const [dias, setDias] = useState(initial?.dias != null ? String(initial.dias) : "");
  const [presupuestoUrl, setPresupuestoUrl] = useState(initial?.presupuesto_url ?? "");
  const [files, setFiles] = useState<File[]>([]);
  // Imágenes pegadas en el requerimiento (nuevas, aún sin subir).
  const [imagenesReq, setImagenesReq] = useState<File[]>([]);
  // Imágenes del requerimiento ya guardadas en la oportunidad (en edición).
  const savedReq = (initial?.archivos_adjuntos ?? []).filter((a) => a.origen === ORIGEN_REQ);
  // Adjuntos comunes (del cliente), ya guardados: se muestran para editar.
  const savedAdjuntos = (initial?.archivos_adjuntos ?? []).filter(
    (a) => a.origen !== ORIGEN_REQ
  );

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
  const { seccion } = useSeccion();
  // Mostramos los campos de licitación si estamos en la sección Gubernamental
  // (al crear) o si la oportunidad ya es gubernamental (al editar).
  const esGubernamental = (initial?.ambito ?? seccion) === "gubernamental";
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
      fecha_entrega: fechaEntrega || null,
      // Campos de licitación (solo se llenan en la sección Gubernamental).
      proceso: proceso.trim() || null,
      expediente: expediente.trim() || null,
      portal: portal.trim() || null,
      apertura: apertura || null,
      hr_pliego: hrPliego || null,
      hr_apertura: hrApertura || null,
      moneda: moneda || null,
      pliego: pliego || null,
      empresa: empresa || null,
      dias: dias ? Number(dias) : null,
      presupuesto_url: presupuestoUrl.trim() || null,
      // Al crear, la sección activa fija el ámbito (override manual); al editar
      // no lo tocamos (undefined no viaja en el JSON).
      ambito: initial ? undefined : seccion,
    }, files, imagenesReq);
    // Limpiamos el estado local: los archivos ya se pasaron al handler (que los
    // sube). En el detalle (form persistente) esto evita ver duplicadas las
    // imágenes nuevas junto a las que quedan guardadas tras el refetch.
    setFiles([]);
    setImagenesReq([]);
  };

  const agregarFiles = (nuevos: File[]) =>
    setFiles((prev) => sumarSinDuplicados(prev, nuevos));

  // Pegar imagen del portapapeles (Ctrl/Cmd+V) dentro del requerimiento: se
  // suma como imagen del requerimiento (se envía a Compras junto con el texto),
  // no como adjunto del cliente.
  const onPasteReq = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const imgs = imagenesPegadas(e);
    if (imgs.length > 0) {
      e.preventDefault();
      setImagenesReq((prev) => sumarSinDuplicados(prev, imgs));
    }
  };

  const previews = useImagePreviews(files);
  const previewsReq = useImagePreviews(imagenesReq);

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
        <Label htmlFor="o-requerimiento">Requerimiento</Label>
        <Textarea
          id="o-requerimiento"
          rows={4}
          value={requerimiento}
          onChange={(e) => setRequerimiento(e.target.value)}
          onPaste={onPasteReq}
          placeholder="Qué pidió el cliente: producto, cantidad, detalle, plazo…"
        />
        <p className="mt-1 text-xs text-ink-3">
          Pegá una imagen (Ctrl/Cmd+V) para sumarla al requerimiento; se envía a Compras junto con el texto.
        </p>
        {(savedReq.length > 0 || imagenesReq.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {savedReq.map((a) => (
              <ImagenReqGuardada
                key={a.id}
                oportunidadId={initial!.id}
                adjunto={a}
                onEliminar={onEliminarImagenReq}
              />
            ))}
            {imagenesReq.map((f, i) => (
              <ThumbBox
                key={`nueva-${i}`}
                src={(previewsReq[i] as string) ?? null}
                alt={f.name}
                onOpen={
                  previewsReq[i]
                    ? () => window.open(previewsReq[i] as string, "_blank", "noopener")
                    : undefined
                }
                onQuitar={() => setImagenesReq((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
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
            className="font-mono tabular-nums"
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
            className="tabular-nums"
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

      {esGubernamental && (
        <div className="rounded-xl border border-line bg-surface2 p-3">
          <p className="mb-2 text-xs font-semibold text-ink-2">
            Licitación (Gubernamental)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="o-proceso">Proceso</Label>
              <Input id="o-proceso" value={proceso} onChange={(e) => setProceso(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="o-expediente">Expediente</Label>
              <Input
                id="o-expediente"
                value={expediente}
                onChange={(e) => setExpediente(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="o-portal">Portal</Label>
              <Input id="o-portal" value={portal} onChange={(e) => setPortal(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="o-apertura">Apertura</Label>
              <Input
                id="o-apertura"
                type="date"
                value={apertura}
                onChange={(e) => setApertura(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="o-hrpliego">Hr Pliego</Label>
                <Input
                  id="o-hrpliego"
                  type="time"
                  value={hrPliego}
                  onChange={(e) => setHrPliego(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="o-hrapertura">Hr Apertura</Label>
                <Input
                  id="o-hrapertura"
                  type="time"
                  value={hrApertura}
                  onChange={(e) => setHrApertura(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="o-moneda">Moneda</Label>
              <SelectMenu
                id="o-moneda"
                value={moneda}
                onChange={setMoneda}
                placeholder="— Moneda —"
                options={[
                  { value: "", label: "— Moneda —" },
                  { value: "ARS", label: "ARS" },
                  { value: "USD", label: "USD" },
                ]}
              />
            </div>
            <div>
              <Label htmlFor="o-pliego">Pliego</Label>
              <SelectMenu
                id="o-pliego"
                value={pliego}
                onChange={setPliego}
                placeholder="— Pliego —"
                options={[
                  { value: "", label: "—" },
                  { value: "fisico", label: "Físico" },
                  { value: "digital", label: "Digital" },
                  { value: "ambos", label: "Físico y Digital" },
                ]}
              />
            </div>
            <div>
              <Label htmlFor="o-empresa">Empresa</Label>
              <SelectMenu
                id="o-empresa"
                value={empresa}
                onChange={setEmpresa}
                placeholder="— Empresa —"
                options={[
                  { value: "", label: "—" },
                  { value: "SKOP", label: "SKOP" },
                  { value: "ARGCOL", label: "ARGCOL" },
                ]}
              />
            </div>
            <div>
              <Label htmlFor="o-dias">Días</Label>
              <SelectMenu
                id="o-dias"
                value={dias}
                onChange={setDias}
                placeholder="— Días —"
                options={[
                  { value: "", label: "— Días —" },
                  ...[7, 15, 30, 60, 90, 120].map((d) => ({
                    value: String(d),
                    label: `${d} días`,
                  })),
                ]}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="o-presuurl">Link al presupuesto (externo)</Label>
              <Input
                id="o-presuurl"
                type="url"
                placeholder="https://…"
                value={presupuestoUrl}
                onChange={(e) => setPresupuestoUrl(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

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

      {/* Al pasar a "Entregado / Pendiente de Pago" surge la fecha de entrega. */}
      {estado === "entregado_pendiente_pago" && (
        <div>
          <Label htmlFor="o-fentrega">Fecha de entrega</Label>
          <Input
            id="o-fentrega"
            type="date"
            value={fechaEntrega}
            onChange={(e) => setFechaEntrega(e.target.value)}
          />
          {!fechaEntrega && (
            <p className="mt-1 text-xs text-warning">
              Cargá la fecha de entrega para este estado.
            </p>
          )}
        </div>
      )}

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
        <Label htmlFor="o-files">Adjuntos (PDF, imágenes, Excel, Word o CSV)</Label>
        <input
          id="o-files"
          type="file"
          multiple
          accept=".pdf,image/*,.csv,.xls,.xlsx,.doc,.docx"
          onChange={(e) => {
            agregarFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
          className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface3"
        />
        {((mostrarAdjuntosGuardados && savedAdjuntos.length > 0) || files.length > 0) && (
          <ul className="mt-2 space-y-1">
            {mostrarAdjuntosGuardados &&
              savedAdjuntos.map((a) => (
                <AdjuntoGuardado
                  key={a.id}
                  oportunidadId={initial!.id}
                  adjunto={a}
                  onEliminar={onEliminarImagenReq}
                />
              ))}
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md bg-surface2 px-2.5 py-1.5 text-xs text-ink-2"
              >
                {previews[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews[i] as string}
                    alt={f.name}
                    className="h-9 w-9 shrink-0 rounded object-cover ring-1 ring-line"
                  />
                ) : (
                  <FileText size={16} className="shrink-0 text-ink-3" />
                )}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="shrink-0 text-ink-3 transition-colors hover:text-danger"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
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
