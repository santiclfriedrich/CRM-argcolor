"use client";

import { ArrowLeft, FileText, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import {
  abrirPdf,
  ESTADO_PRESUPUESTO,
  fmtMonto,
  usePresupuesto,
  useUpdatePresupuesto,
} from "@/lib/presupuestos";
import type { EstadoPresupuesto, ItemInput, Presupuesto } from "@/lib/types";

type Row = {
  key: string;
  fabricante: string;
  sku: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  descuento_pct: string;
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
  }));
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
    return <p className="text-slate-500 dark:text-slate-400">Cargando…</p>;
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
        sku: r.sku.trim() || null,
        fabricante: r.fabricante.trim() || null,
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
    <div className="mx-auto max-w-4xl">
      <Link
        href="/presupuestos"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400"
      >
        <ArrowLeft size={15} /> Presupuestos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {presupuesto.codigo}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {cliente} · Oportunidad #{presupuesto.oportunidad_id}
          </p>
        </div>
        <Badge className={ESTADO_PRESUPUESTO[estado].color}>
          {ESTADO_PRESUPUESTO[estado].label}
        </Badge>
      </div>

      {/* Cabecera: condiciones comerciales */}
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40 sm:grid-cols-4">
        <div>
          <Label>Moneda</Label>
          <Select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
            <option value="EUR">EUR</option>
          </Select>
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
      <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-2 py-2 font-medium">Fabricante</th>
              <th className="px-2 py-2 font-medium">SKU</th>
              <th className="px-2 py-2 font-medium">Descripción</th>
              <th className="px-2 py-2 font-medium">Cant.</th>
              <th className="px-2 py-2 font-medium">P. unit.</th>
              <th className="px-2 py-2 font-medium">Desc.%</th>
              <th className="px-2 py-2 text-right font-medium">Subtotal</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-1"><Input value={r.fabricante} onChange={(e) => setCampo(r.key, "fabricante", e.target.value)} /></td>
                <td className="p-1"><Input value={r.sku} onChange={(e) => setCampo(r.key, "sku", e.target.value)} /></td>
                <td className="p-1 min-w-[180px]"><Input value={r.descripcion} onChange={(e) => setCampo(r.key, "descripcion", e.target.value)} placeholder="Producto / servicio" /></td>
                <td className="p-1 w-20"><Input type="number" value={r.cantidad} onChange={(e) => setCampo(r.key, "cantidad", e.target.value)} className="text-right" /></td>
                <td className="p-1 w-28"><Input type="number" value={r.precio_unitario} onChange={(e) => setCampo(r.key, "precio_unitario", e.target.value)} className="text-right" /></td>
                <td className="p-1 w-20"><Input type="number" value={r.descuento_pct} onChange={(e) => setCampo(r.key, "descuento_pct", e.target.value)} className="text-right" /></td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {fmtMonto(subtotalRow(r), moneda)}
                </td>
                <td className="px-1">
                  <Tooltip label="Quitar fila">
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      className="text-slate-400 hover:text-red-600"
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
          <span className="text-sm text-slate-500 dark:text-slate-400">Total</span>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {fmtMonto(total, moneda)}
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div>
          <Label>Estado</Label>
          <Select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoPresupuesto)}
            className="w-44"
          >
            {Object.entries(ESTADO_PRESUPUESTO).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {updateMut.isSuccess && <span className="text-xs text-green-600">Guardado ✓</span>}
          {updateMut.isError && <span className="text-xs text-red-600">No se pudo guardar</span>}
          <Button variant="outline" onClick={verPdf} disabled={updateMut.isPending}>
            <FileText size={15} /> Ver PDF
          </Button>
          <Button onClick={guardar} disabled={updateMut.isPending}>
            <Save size={15} /> {updateMut.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
