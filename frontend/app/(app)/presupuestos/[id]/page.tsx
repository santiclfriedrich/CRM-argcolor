"use client";

import { ArrowLeft, FileText, Plus, Save, Trash2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectMenu } from "@/components/ui/select-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import {
  abrirPdf,
  ENTREGA_OPCIONES,
  ESTADO_CARGA_GBP,
  fmtMonto,
  useCargarEnGbp,
  usePresupuesto,
  useUpdatePresupuesto,
} from "@/lib/presupuestos";
import type { ItemInput, Presupuesto } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

// Fila del armador (GBP-first). Fabricante/Part N° se conservan (vienen del Excel)
// aunque no tengan columna propia, para no perder la metadata al guardar.
type Row = {
  key: string;
  fabricante: string;
  part_number: string;
  sku: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  moneda: string;
  iva: string;
};

let _seq = 0;
const nuevaKey = () => `row-${_seq++}`;

const num = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const subtotalRow = (r: Row) => num(r.cantidad) * num(r.precio_unitario);

const filaVacia = (): Row => ({
  key: nuevaKey(),
  fabricante: "",
  part_number: "",
  sku: "",
  descripcion: "",
  cantidad: "1",
  precio_unitario: "0",
  moneda: "USD",
  iva: "",
});

function toRow(it: ItemInput | Presupuesto["items"][number]): Row {
  return {
    key: nuevaKey(),
    fabricante: it.fabricante ?? "",
    part_number: it.part_number ?? "",
    sku: it.sku ?? "",
    descripcion: it.descripcion,
    cantidad: String(it.cantidad ?? 1),
    precio_unitario: String(it.precio_unitario ?? 0),
    moneda: (it as { moneda?: string }).moneda || "USD",
    iva: it.iva != null ? String(Number(it.iva)) : "",
  };
}

export default function ArmadorPresupuestoPage() {
  const params = useParams();
  const id = Number(params.id);
  const { data: presupuesto, isLoading } = usePresupuesto(id, Number.isFinite(id));
  const updateMut = useUpdatePresupuesto(id);
  const cargarGbp = useCargarEnGbp(id);
  const { toast } = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState<Row[]>([]);
  const [entrega, setEntrega] = useState("");
  const [documento, setDocumento] = useState("Presupuesto USD");
  const [sucursal, setSucursal] = useState("1");
  const [cargado, setCargado] = useState(false);

  // Hidrata el formulario una vez cuando llega el presupuesto.
  useEffect(() => {
    if (presupuesto && !cargado) {
      setRows(presupuesto.items.length ? presupuesto.items.map(toRow) : [filaVacia()]);
      setEntrega(presupuesto.entrega_por ?? "");
      setDocumento(presupuesto.documento ?? "Presupuesto USD");
      setSucursal(presupuesto.sucursal ?? "1");
      setCargado(true);
    }
  }, [presupuesto, cargado]);

  if (isLoading || !presupuesto) {
    return <p className="text-ink-2">Cargando…</p>;
  }

  const setCampo = (key: string, campo: keyof Row, valor: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [campo]: valor } : r)));

  // Totales por moneda (no se pueden sumar ARS + USD).
  const totalUSD = rows
    .filter((r) => (r.moneda || "USD") === "USD")
    .reduce((acc, r) => acc + subtotalRow(r), 0);
  const totalARS = rows
    .filter((r) => r.moneda === "ARS")
    .reduce((acc, r) => acc + subtotalRow(r), 0);

  const payloadItems = (): ItemInput[] =>
    rows
      .filter((r) => r.descripcion.trim())
      .map((r) => ({
        descripcion: r.descripcion.trim(),
        cantidad: num(r.cantidad),
        precio_unitario: num(r.precio_unitario),
        moneda: r.moneda || "USD",
        iva: r.iva.trim() ? num(r.iva) : null,
        sku: r.sku.trim() || null,
        fabricante: r.fabricante.trim() || null,
        part_number: r.part_number.trim() || null,
      }));

  const cuerpo = () => ({
    entrega_por: entrega || null,
    documento,
    sucursal: sucursal || "1",
    items: payloadItems(),
  });

  const guardar = () => updateMut.mutate(cuerpo());

  const cargarEnGbp = async () => {
    const esRevisar = presupuesto.estado_carga === "revisar";
    if (esRevisar) {
      const ok = await confirm({
        title: "Reencolar parte",
        message:
          "Esta parte pudo haber quedado guardada en GBP. Verificá en GBP antes de " +
          "reencolar: puede duplicar el presupuesto. ¿Reencolar igual?",
        danger: true,
      });
      if (!ok) return;
    }
    updateMut.mutate(cuerpo(), {
      onSuccess: () =>
        cargarGbp.mutate(esRevisar, {
          onSuccess: () => toast("Enviado a la cola de GBP", "success"),
          onError: (e) => toast(errorMessage(e), "error"),
        }),
      onError: (e) => toast(errorMessage(e), "error"),
    });
  };

  const cliente =
    presupuesto.oportunidad?.cliente?.razon_social ??
    (presupuesto.cliente_numero ? `Cliente ${presupuesto.cliente_numero}` : "Sin cliente");

  const yaEnCola =
    presupuesto.estado_carga === "pendiente" ||
    presupuesto.estado_carga === "en_proceso" ||
    presupuesto.estado_carga === "cargado";

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href="/presupuestos"
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={15} /> Presupuestos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {presupuesto.codigo}
          </h1>
          <p className="text-sm text-ink-2">
            {cliente}
            {presupuesto.cliente_numero ? ` · N° ${presupuesto.cliente_numero}` : ""}
            {presupuesto.oportunidad_id != null && (
              <>
                {" · "}
                <Link
                  href={`/oportunidades?op=${presupuesto.oportunidad_id}`}
                  className="font-medium text-accent hover:underline"
                >
                  Oportunidad #{presupuesto.oportunidad_id}
                </Link>
              </>
            )}
          </p>
        </div>
        {presupuesto.estado_carga && (
          <div className="flex flex-col items-end gap-1">
            <Badge tone={ESTADO_CARGA_GBP[presupuesto.estado_carga].tono}>
              {ESTADO_CARGA_GBP[presupuesto.estado_carga].label}
              {presupuesto.id_gbp_pedido ? ` · ${presupuesto.id_gbp_pedido}` : ""}
            </Badge>
            {presupuesto.gbp_error && (
              <span className="max-w-xs text-right text-xs text-ink-2">
                {presupuesto.gbp_error}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Datos de carga a GBP */}
      <div className="mt-5 grid grid-cols-1 gap-3 rounded-lg border border-line bg-surface2 p-4 sm:grid-cols-3">
        <div>
          <Label>Entregar por</Label>
          <SelectMenu
            value={entrega}
            onChange={setEntrega}
            placeholder="— Elegir —"
            options={ENTREGA_OPCIONES.map((o) => ({ value: o, label: o }))}
          />
        </div>
        <div>
          <Label>Documento</Label>
          <SelectMenu
            value={documento}
            onChange={setDocumento}
            options={[
              { value: "Presupuesto USD", label: "Presupuesto USD" },
              { value: "Presupuesto ARS", label: "Presupuesto ARS" },
            ]}
          />
        </div>
        <div>
          <Label htmlFor="ed-suc">Sucursal</Label>
          <Input
            id="ed-suc"
            value={sucursal}
            onChange={(e) => setSucursal(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Ítems */}
      <div className="mt-5 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface2 text-left text-xs text-ink-2">
            <tr>
              <th className="px-2 py-2 font-medium">SKU (GBP)</th>
              <th className="px-2 py-2 font-medium">Descripción</th>
              <th className="px-2 py-2 font-medium">Cant.</th>
              <th className="px-2 py-2 font-medium">Precio</th>
              <th className="px-2 py-2 font-medium">Moneda</th>
              <th className="px-2 py-2 font-medium">IVA%</th>
              <th className="px-2 py-2 text-right font-medium">Subtotal</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="p-1 w-32">
                  <Input value={r.sku} onChange={(e) => setCampo(r.key, "sku", e.target.value)} placeholder="código GBP" />
                </td>
                <td className="p-1 min-w-[220px]">
                  <Input value={r.descripcion} onChange={(e) => setCampo(r.key, "descripcion", e.target.value)} placeholder="Producto" />
                </td>
                <td className="p-1 w-20">
                  <Input type="number" value={r.cantidad} onChange={(e) => setCampo(r.key, "cantidad", e.target.value)} className="text-right" />
                </td>
                <td className="p-1 w-28">
                  <Input type="number" value={r.precio_unitario} onChange={(e) => setCampo(r.key, "precio_unitario", e.target.value)} className="text-right" />
                </td>
                <td className="p-1 w-24">
                  <select
                    value={r.moneda}
                    onChange={(e) => setCampo(r.key, "moneda", e.target.value)}
                    className="h-11 w-full rounded-lg border border-line bg-surface px-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    <option value="USD">USD</option>
                    <option value="ARS">ARS</option>
                  </select>
                </td>
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
                  {fmtMonto(subtotalRow(r), r.moneda || "USD")}
                </td>
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
          {totalUSD > 0 && (
            <p className="text-xl font-bold tabular-nums text-ink">{fmtMonto(totalUSD, "USD")}</p>
          )}
          {totalARS > 0 && (
            <p className="text-xl font-bold tabular-nums text-ink">{fmtMonto(totalARS, "ARS")}</p>
          )}
          {totalUSD === 0 && totalARS === 0 && (
            <p className="text-xl font-bold tabular-nums text-ink">{fmtMonto(0, "USD")}</p>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {updateMut.isSuccess && <span className="mr-auto text-xs text-success">Guardado ✓</span>}
        {presupuesto.estado_carga === "cargado" && (
          <Button variant="outline" onClick={() => abrirPdf(id)}>
            <FileText size={15} /> Ver PDF de GBP
          </Button>
        )}
        <Button onClick={guardar} variant="outline" disabled={updateMut.isPending}>
          <Save size={15} /> {updateMut.isPending ? "Guardando…" : "Guardar"}
        </Button>
        <Button
          onClick={cargarEnGbp}
          disabled={updateMut.isPending || cargarGbp.isPending || yaEnCola}
        >
          <UploadCloud size={15} /> {cargarGbp.isPending ? "Enviando…" : "Cargar en GBP"}
        </Button>
      </div>
    </div>
  );
}
