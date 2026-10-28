"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { ClientePicker } from "@/components/clientes/cliente-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { SelectMenu } from "@/components/ui/select-menu";
import { useToast } from "@/components/ui/toast";
import { useClientes } from "@/lib/clientes";
import {
  ENTREGA_OPCIONES,
  type ErrorFilaExcel,
  importarLote,
  presupuestoKeys,
  useCrearLote,
  useSucursales,
} from "@/lib/presupuestos";
import { errorMessage } from "@/lib/utils";

// Alta de presupuesto: se elige cliente + entrega + documento + sucursal y,
// opcional, se sube el Excel. Con Excel, el backend valida TODO y parte en tandas
// de 20 (si hay errores, los muestra por fila y no crea nada). Sin Excel, crea uno
// vacío y navega al armador para cargar a mano.
export function CrearPresupuestoModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: clientes } = useClientes();
  const { data: sucursales } = useSucursales();
  const crear = useCrearLote();

  const [clienteId, setClienteId] = useState<number | null>(null);
  const [clienteNumero, setClienteNumero] = useState("");
  const [oportunidadId, setOportunidadId] = useState("");
  const [entrega, setEntrega] = useState("");
  const [documento, setDocumento] = useState("Presupuesto USD");
  const [sucursal, setSucursal] = useState("1");
  const [file, setFile] = useState<File | null>(null);
  const [errores, setErrores] = useState<ErrorFilaExcel[]>([]);
  const [enviando, setEnviando] = useState(false);
  const excelRef = useRef<HTMLInputElement>(null);

  const lista = useMemo(() => clientes ?? [], [clientes]);

  const elegirCliente = (id: number | null) => {
    setClienteId(id);
    const c = lista.find((x) => x.id === id);
    if (c?.numero_cliente) setClienteNumero(c.numero_cliente);
  };

  const opId = () => {
    const n = oportunidadId.trim() ? Number(oportunidadId.trim()) : undefined;
    return n;
  };

  const irATerminar = (partes: { id: number }[]) => {
    // Refresca el listado (el import es una función suelta que no invalida solo).
    qc.invalidateQueries({ queryKey: presupuestoKeys.all });
    onClose();
    if (partes.length === 1) {
      router.push(`/presupuestos/${partes[0].id}`);
    } else {
      toast(`Se crearon ${partes.length} presupuestos (partes de 20 ítems)`, "success");
      router.push("/presupuestos");
    }
  };

  const submit = async () => {
    if (!clienteNumero.trim()) {
      toast("Falta el N° de cliente", "error");
      return;
    }
    setErrores([]);

    if (file) {
      if (!entrega) {
        toast("Elegí la forma de entrega", "error");
        return;
      }
      setEnviando(true);
      try {
        const partes = await importarLote(file, {
          cliente_numero: clienteNumero.trim(),
          entrega_por: entrega,
          documento,
          sucursal: sucursal.trim() || "1",
          cliente_id: clienteId,
          oportunidad_id: opId(),
        });
        irATerminar(partes);
      } catch (e) {
        const det = (
          e as { response?: { data?: { detail?: { errores?: ErrorFilaExcel[] } } } }
        )?.response?.data?.detail;
        if (det?.errores?.length) {
          setErrores(det.errores);
          toast(`El Excel tiene ${det.errores.length} error(es)`, "error");
        } else {
          toast(errorMessage(e), "error");
        }
      } finally {
        setEnviando(false);
      }
      return;
    }

    // Sin Excel: crea uno vacío y abre el armador para cargar a mano.
    crear.mutate(
      {
        cliente_id: clienteId,
        cliente_numero: clienteNumero.trim(),
        entrega_por: entrega || null,
        documento,
        sucursal: sucursal.trim() || "1",
        oportunidad_id: opId(),
        items: [],
      },
      {
        onSuccess: irATerminar,
        onError: (e) => toast(errorMessage(e), "error"),
      }
    );
  };

  const ocupado = enviando || crear.isPending;

  return (
    <Modal open onClose={onClose} title="Crear nuevo presupuesto" size="md">
      <div className="space-y-4">
        <div>
          <Label>Cliente</Label>
          <ClientePicker clientes={lista} value={clienteId} onChange={elegirCliente} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cp-numero">N° de cliente</Label>
            <Input
              id="cp-numero"
              value={clienteNumero}
              onChange={(e) => setClienteNumero(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
            />
          </div>
          <div>
            <Label>Sucursal GBP</Label>
            <SelectMenu
              value={sucursal}
              onChange={setSucursal}
              options={(sucursales ?? []).map((s) => ({ value: s.valor, label: s.nombre }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <div>
          <Label htmlFor="cp-op">Oportunidad (opcional)</Label>
          <Input
            id="cp-op"
            value={oportunidadId}
            onChange={(e) => setOportunidadId(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
          />
        </div>

        <div>
          <Label>Excel de productos (opcional)</Label>
          <input
            ref={excelRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setErrores([]);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => excelRef.current?.click()}>
              <Upload size={15} /> {file ? "Cambiar Excel" : "Cargar Excel"}
            </Button>
            {file && <span className="text-sm text-ink-2">{file.name}</span>}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Con Excel se parte en tandas de 20. Sin Excel, cargás los ítems a mano.
          </p>
        </div>

        {errores.length > 0 && (
          <div className="max-h-40 overflow-auto rounded-lg border border-danger/40 bg-danger/5 p-3">
            <p className="mb-1 text-sm font-semibold text-danger">
              Errores en el Excel (no se creó nada):
            </p>
            <ul className="space-y-0.5 text-xs text-ink">
              {errores.map((e) => (
                <li key={e.fila}>
                  <span className="font-medium">Fila {e.fila}:</span> {e.mensaje}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={ocupado || !clienteNumero.trim()}>
            {ocupado ? "Procesando…" : file ? "Importar Excel" : "Crear y armar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
