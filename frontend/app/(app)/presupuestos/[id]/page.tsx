"use client";

import { ArrowLeft, FileText, Plus, Save, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { SelectMenu } from "@/components/ui/select-menu";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import {
  abrirPdf,
  ESTADO_PRESUPUESTO,
  fmtMonto,
  useEnviarPresupuesto,
  usePresupuesto,
  useUpdatePresupuesto,
} from "@/lib/presupuestos";
import type { EstadoPresupuesto, ItemInput, Presupuesto } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

const TONO_PRESUPUESTO = {
  borrador: "neutral",
  enviado: "info",
  aceptado: "success",
  rechazado: "danger",
  negociando: "warning",
} as const satisfies Record<EstadoPresupuesto, string>;

type Row = {
  key: string;
  fabricante: string;
  sku: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  descuento_pct: string;
  iva: string;
  observaciones: string;
};

let _seq = 0;
const nuevaKey = () => `row-${_seq++}`;

const num = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const subtotalRow = (r: Row) =>
  num(r.cantidad) * num(r.precio_unitario) * (1 - num(r.descuento_pct) / 100);

const filaVacia = (): Row => ({
  key: nuevaKey(),
  fabricante: "",
  sku: "",
  descripcion: "",
  cantidad: "1",
  precio_unitario: "0",
  descuento_pct: "0",
  iva: "",
  observaciones: "",
});

function toRows(p: Presupuesto): Row[] {
  return p.items.map((it) => ({
    key: nuevaKey(),
    fabricante: it.fabricante ?? "",
    sku: it.sku ?? "",
    descripcion: it.descripcion,
    cantidad: String(it.cantidad),
    precio_unitario: String(it.precio_unitario),
    descuento_pct: String(it.descuento_pct),
    // Normalizamos (Number) para que "10.50", "10.5" y 10 caigan en la misma
    // opción del selector y no aparezcan duplicadas por coma/punto o ceros.
    iva: it.iva != null ? String(Number(it.iva)) : "",
    observaciones: it.observaciones ?? "",
  }));
}

// Observación de la línea: textarea que envuelve el texto y crece en alto según
// el contenido (en vez de un input de una sola línea que obliga a scrollear y
// se vuelve ilegible).
function ObservacionCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      placeholder="Nota de la línea"
      className="block w-full resize-none overflow-hidden rounded-lg border border-line bg-surface px-2 py-1.5 text-sm leading-snug text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
    />
  );
}

export default function ArmadorPresupuestoPage() {
  const params = useParams();
  const id = Number(params.id);
  const { data: presupuesto, isLoading } = usePresupuesto(id, Number.isFinite(id));
  const updateMut = useUpdatePresupuesto(id);

  const [rows, setRows] = useState<Row[]>([]);
  const [condicion, setCondicion] = useState("");
  const [plazo, setPlazo] = useState("");
  const [validez, setValidez] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [estado, setEstado] = useState<EstadoPresupuesto>("borrador");
  const [cargado, setCargado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Hidrata el formulario una vez cuando llega el presupuesto.
  useEffect(() => {
    if (presupuesto && !cargado) {
      setRows(presupuesto.items.length ? toRows(presupuesto) : [filaVacia()]);
      setCondicion(presupuesto.condicion_pago ?? "");
      setPlazo(presupuesto.plazo_entrega ?? "");
      setValidez(presupuesto.validez ?? "");
      setMoneda(presupuesto.moneda ?? "USD");
      setEstado(presupuesto.estado);
      setCargado(true);
    }
  }, [presupuesto, cargado]);

  if (isLoading || !presupuesto) {
    return <p className="text-ink-2">Cargando…</p>;
  }

  const setCampo = (key: string, campo: keyof Row, valor: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [campo]: valor } : r)));

  const total = rows.reduce((acc, r) => acc + subtotalRow(r), 0);

  const payloadItems = (): ItemInput[] =>
    rows
      .filter((r) => r.descripcion.trim())
      .map((r) => ({
        descripcion: r.descripcion.trim(),
        cantidad: num(r.cantidad),
        precio_unitario: num(r.precio_unitario),
        descuento_pct: num(r.descuento_pct),
        iva: r.iva.trim() ? num(r.iva) : null,
        sku: r.sku.trim() || null,
        fabricante: r.fabricante.trim() || null,
        observaciones: r.observaciones.trim() || null,
      }));

  const guardar = () =>
    updateMut.mutate({
      condicion_pago: condicion || null,
      plazo_entrega: plazo || null,
      validez: validez || null,
      moneda,
      estado,
      items: payloadItems(),
    });

  const verPdf = () =>
    updateMut.mutate(
      {
        condicion_pago: condicion || null,
        plazo_entrega: plazo || null,
        validez: validez || null,
        moneda,
        estado,
        items: payloadItems(),
      },
      { onSuccess: () => abrirPdf(id) }
    );

  const cliente = presupuesto.oportunidad?.cliente?.razon_social ?? "Sin cliente";

  return (
    <div className="w-full">
      <Link
        href="/presupuestos"
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={15} /> Presupuestos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {presupuesto.codigo}
          </h1>
          <p className="text-sm text-ink-2">
            {cliente} ·{" "}
            <Link
              href={`/oportunidades?op=${presupuesto.oportunidad_id}`}
              className="font-medium text-accent hover:underline"
            >
              Oportunidad #{presupuesto.oportunidad_id}
            </Link>
          </p>
          <p className="mt-1 text-xs text-ink-3">
            Creado por {presupuesto.creado_por?.nombre ?? "—"}
            {presupuesto.editado_por && (
              <>
                {" · Última edición: "}
                {presupuesto.editado_por.nombre}
                {presupuesto.editado_en &&
                  ` (${new Date(presupuesto.editado_en).toLocaleString("es-AR")})`}
              </>
            )}
          </p>
        </div>
        <Badge tone={TONO_PRESUPUESTO[estado]}>
          {ESTADO_PRESUPUESTO[estado].label}
        </Badge>
      </div>

      {/* Cabecera: condiciones comerciales */}
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface2 p-4 sm:grid-cols-4">
        <div>
          <Label>Moneda</Label>
          <SelectMenu
            value={moneda}
            onChange={setMoneda}
            options={[
              { value: "USD", label: "USD" },
              { value: "ARS", label: "ARS" },
              { value: "EUR", label: "EUR" },
            ]}
          />
        </div>
        <div>
          <Label>Condición de pago</Label>
          <Input value={condicion} onChange={(e) => setCondicion(e.target.value)} placeholder="30 días" />
        </div>
        <div>
          <Label>Plazo de entrega</Label>
          <Input value={plazo} onChange={(e) => setPlazo(e.target.value)} placeholder="10 días hábiles" />
        </div>
        <div>
          <Label>Validez</Label>
          <Input value={validez} onChange={(e) => setValidez(e.target.value)} placeholder="15 días" />
        </div>
      </div>

      {/* Ítems */}
      <div className="mt-5 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface2 text-left text-xs text-ink-2">
            <tr>
              <th className="px-2 py-2 font-medium">Fabricante</th>
              <th className="px-2 py-2 font-medium">SKU</th>
              <th className="px-2 py-2 font-medium">Descripción</th>
              <th className="px-2 py-2 font-medium">Cant.</th>
              <th className="px-2 py-2 font-medium">P. unit.</th>
              <th className="px-2 py-2 font-medium">IVA%</th>
              <th className="px-2 py-2 text-right font-medium">Subtotal</th>
              <th className="px-2 py-2 font-medium">Observación</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="p-1"><Input value={r.fabricante} onChange={(e) => setCampo(r.key, "fabricante", e.target.value)} /></td>
                <td className="p-1"><Input value={r.sku} onChange={(e) => setCampo(r.key, "sku", e.target.value)} /></td>
                <td className="p-1 min-w-[180px]"><Input value={r.descripcion} onChange={(e) => setCampo(r.key, "descripcion", e.target.value)} placeholder="Producto / servicio" /></td>
                <td className="p-1 w-20"><Input type="number" value={r.cantidad} onChange={(e) => setCampo(r.key, "cantidad", e.target.value)} className="text-right" /></td>
                <td className="p-1 w-28"><Input type="number" value={r.precio_unitario} onChange={(e) => setCampo(r.key, "precio_unitario", e.target.value)} className="text-right" /></td>
                <td className="p-1 w-24">
                  <select
                    value={r.iva}
                    onChange={(e) => setCampo(r.key, "iva", e.target.value)}
                    className="h-11 w-full rounded-lg border border-line bg-surface px-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    <option value="">—</option>
                    <option value="21">21%</option>
                    <option value="10.5">10.50%</option>
                    {!["", "21", "10.5"].includes(r.iva) && (
                      <option value={r.iva}>{r.iva}%</option>
                    )}
                  </select>
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-ink">
                  {fmtMonto(subtotalRow(r), moneda)}
                </td>
                <td className="p-1 min-w-[240px] align-top"><ObservacionCell value={r.observaciones} onChange={(v) => setCampo(r.key, "observaciones", v)} /></td>
                <td className="px-1">
                  <Tooltip label="Quitar fila">
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      className="text-ink-3 hover:text-danger"
                      aria-label="Quitar fila"
                    >
                      <Trash2 size={14} />
                    </button>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, filaVacia()])}>
          <Plus size={14} /> Agregar ítem
        </Button>
        <div className="text-right">
          <span className="text-sm text-ink-2">Total</span>
          <p className="text-xl font-bold tabular-nums text-ink">
            {fmtMonto(total, moneda)}
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="w-44">
          <Label>Estado</Label>
          <SelectMenu
            value={estado}
            onChange={(v) => setEstado(v as EstadoPresupuesto)}
            options={Object.entries(ESTADO_PRESUPUESTO).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
          />
        </div>
        <div className="flex items-center gap-2">
          {updateMut.isSuccess && <span className="text-xs text-success">Guardado ✓</span>}
          {updateMut.isError && <span className="text-xs text-danger">No se pudo guardar</span>}
          <Button variant="outline" onClick={verPdf} disabled={updateMut.isPending}>
            <FileText size={15} /> Ver PDF
          </Button>
          <Button variant="outline" onClick={() => setEnviando(true)} disabled={updateMut.isPending}>
            <Send size={15} /> Enviar al cliente
          </Button>
          <Button onClick={guardar} disabled={updateMut.isPending}>
            <Save size={15} /> {updateMut.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      {enviando && (
        <EnviarModal id={id} codigo={presupuesto.codigo} onClose={() => setEnviando(false)} />
      )}
    </div>
  );
}

function EnviarModal({
  id,
  codigo,
  onClose,
}: {
  id: number;
  codigo: string;
  onClose: () => void;
}) {
  const enviar = useEnviarPresupuesto(id);
  const [to, setTo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const email = to.trim();
    // Validamos acá para no depender del 422 del backend y mostrar un mensaje claro.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("El email del cliente no es válido. Revisá que esté bien escrito.");
      return;
    }
    setEmailError(null);
    enviar.mutate(
      { to: email || undefined, mensaje: mensaje.trim() || undefined },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal open onClose={onClose} title={`Enviar ${codigo} al cliente`}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="env-to">Para (email del cliente)</Label>
          <Input
            id="env-to"
            type="email"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              if (emailError) setEmailError(null);
            }}
            placeholder="cliente@empresa.com"
          />
          {emailError ? (
            <p className="mt-1 text-xs text-danger">{emailError}</p>
          ) : (
            <p className="mt-1 text-xs text-ink-3">
              Si lo dejás vacío, se usa el email del contacto de la oportunidad.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="env-msg">Mensaje (opcional)</Label>
          <Textarea
            id="env-msg"
            rows={4}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Si lo dejás vacío, se manda un texto por defecto con el PDF adjunto."
          />
        </div>
        {enviar.isError && (
          <p className="text-sm text-danger">
            {errorMessage(enviar.error, "No se pudo enviar el presupuesto.")}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={enviar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviar.isPending}>
            <Send size={15} /> {enviar.isPending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
