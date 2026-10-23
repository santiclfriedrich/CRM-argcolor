"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { ClientePicker } from "@/components/clientes/cliente-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useClientes } from "@/lib/clientes";
import {
  importarExcelPresupuesto,
  useCreatePresupuesto,
} from "@/lib/presupuestos";
import type { ItemInput } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

// Alta de un presupuesto standalone (sin pasar por una solicitud/oportunidad):
// se elige el cliente y, opcional, se vincula a una oportunidad. Al crear, se
// navega al armador para cargar los ítems.
export function CrearPresupuestoModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: clientes } = useClientes();
  const crear = useCreatePresupuesto();

  const [clienteId, setClienteId] = useState<number | null>(null);
  const [clienteNumero, setClienteNumero] = useState("");
  const [oportunidadId, setOportunidadId] = useState("");
  const [items, setItems] = useState<ItemInput[]>([]);
  const [importando, setImportando] = useState(false);
  const excelRef = useRef<HTMLInputElement>(null);

  const lista = useMemo(() => clientes ?? [], [clientes]);

  const importarExcel = async (file: File) => {
    setImportando(true);
    try {
      const parsed = await importarExcelPresupuesto(file);
      setItems(parsed);
      toast(`${parsed.length} ítem(s) cargados del Excel`, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setImportando(false);
    }
  };

  // Al elegir un cliente del CRM, autocompletamos su N° (lo que el bot tipea en
  // GBP). Igual se puede editar a mano (cliente que no está en el CRM).
  const elegirCliente = (id: number | null) => {
    setClienteId(id);
    const c = lista.find((x) => x.id === id);
    if (c?.numero_cliente) setClienteNumero(c.numero_cliente);
  };

  const puedeCrear = clienteNumero.trim() !== "" && !crear.isPending;

  const submit = () => {
    if (!puedeCrear) return;
    const opId = oportunidadId.trim() ? Number(oportunidadId.trim()) : undefined;
    if (opId !== undefined && !Number.isFinite(opId)) {
      toast("El N° de oportunidad no es válido", "error");
      return;
    }
    crear.mutate(
      {
        cliente_id: clienteId,
        cliente_numero: clienteNumero.trim(),
        oportunidad_id: opId,
        items,
      },
      {
        onSuccess: (p) => {
          onClose();
          router.push(`/presupuestos/${p.id}`);
        },
        onError: (e) => toast(errorMessage(e), "error"),
      }
    );
  };

  return (
    <Modal open onClose={onClose} title="Crear nuevo presupuesto" size="md">
      <div className="space-y-4">
        <div>
          <Label>Cliente</Label>
          <ClientePicker
            clientes={lista}
            value={clienteId}
            onChange={elegirCliente}
          />
        </div>

        <div>
          <Label htmlFor="cp-numero">N° de cliente</Label>
          <Input
            id="cp-numero"
            value={clienteNumero}
            onChange={(e) =>
              setClienteNumero(e.target.value.replace(/[^0-9]/g, ""))
            }
            inputMode="numeric"
          />
        </div>

        <div>
          <Label htmlFor="cp-op">Oportunidad (opcional)</Label>
          <Input
            id="cp-op"
            value={oportunidadId}
            onChange={(e) =>
              setOportunidadId(e.target.value.replace(/[^0-9]/g, ""))
            }
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
              const f = e.target.files?.[0];
              if (f) importarExcel(f);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => excelRef.current?.click()}
              disabled={importando}
            >
              <Upload size={15} /> {importando ? "Importando…" : "Cargar Excel"}
            </Button>
            {items.length > 0 && (
              <span className="text-sm text-success">
                {items.length} ítem(s) cargados
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!puedeCrear}>
            {crear.isPending ? "Creando…" : "Crear y armar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
