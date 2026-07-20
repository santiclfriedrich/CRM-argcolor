"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectMenu } from "@/components/ui/select-menu";
import { Textarea } from "@/components/ui/textarea";
import { useOportunidades } from "@/lib/oportunidades";
import { CONDICIONES_PAGO } from "@/lib/solicitudes";
import type { CondicionPago, SolicitudCreate } from "@/lib/types";

interface Props {
  isPending: boolean;
  onSubmit: (values: SolicitudCreate, files: File[]) => void;
  onCancel: () => void;
  // Pre-carga (ej. desde una oportunidad, con el requerimiento ya extraído por IA).
  defaultOportunidadId?: number | null;
  defaultRequerimiento?: string;
  // Si la oportunidad viene fijada, no se puede cambiar en el form.
  lockOportunidad?: boolean;
  // Textos del botón de submit (ej. "Enviar a Compras" cuando además se envía).
  submitLabel?: string;
  pendingLabel?: string;
}

// "a@x.com, b@y.com" -> ["a@x.com", "b@y.com"]
const parseEmails = (raw: string): string[] =>
  raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

export function SolicitudForm({
  isPending,
  onSubmit,
  onCancel,
  defaultOportunidadId = null,
  defaultRequerimiento = "",
  lockOportunidad = false,
  submitLabel = "Crear solicitud",
  pendingLabel = "Creando…",
}: Props) {
  const { data: oportunidades } = useOportunidades();

  const [oportunidadId, setOportunidadId] = useState<number | null>(defaultOportunidadId);
  const [requerimiento, setRequerimiento] = useState(defaultRequerimiento);
  const [numeroCliente, setNumeroCliente] = useState("");
  const [condicionPago, setCondicionPago] = useState<CondicionPago | "">("");
  const [importe, setImporte] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [refGbp, setRefGbp] = useState("");
  const [ccs, setCcs] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!oportunidadId || !requerimiento.trim()) return;
    onSubmit(
      {
        oportunidad_id: oportunidadId,
        requerimiento: requerimiento.trim(),
        numero_cliente: numeroCliente.trim() || null,
        condicion_pago: condicionPago || null,
        importe_aproximado: importe ? Number(importe) : null,
        fecha_limite: fechaLimite || null,
        presupuesto_gbp_referencia: refGbp.trim() || null,
        ccs_extra: parseEmails(ccs),
      },
      files
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="s-op">Oportunidad *</Label>
        <SelectMenu
          id="s-op"
          value={oportunidadId != null ? String(oportunidadId) : ""}
          onChange={(v) => setOportunidadId(v ? Number(v) : null)}
          disabled={lockOportunidad}
          placeholder="— Elegí una oportunidad —"
          options={[
            { value: "", label: "— Elegí una oportunidad —" },
            ...(oportunidades ?? []).map((o) => ({
              value: String(o.id),
              label: `#${o.id} — ${o.cliente?.razon_social ?? "Sin cliente"}`,
            })),
          ]}
        />
      </div>

      <div>
        <Label htmlFor="s-numcli">Número de cliente</Label>
        <Input
          id="s-numcli"
          value={numeroCliente}
          onChange={(e) => setNumeroCliente(e.target.value)}
          placeholder="Ej: 10432"
        />
      </div>

      <div>
        <Label htmlFor="s-req">Requerimiento *</Label>
        <Textarea
          id="s-req"
          rows={4}
          value={requerimiento}
          onChange={(e) => setRequerimiento(e.target.value)}
          placeholder="Detalle de lo que se necesita cotizar…"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="s-cond">Condición de pago</Label>
          <SelectMenu
            id="s-cond"
            value={condicionPago}
            onChange={(v) => setCondicionPago(v as CondicionPago | "")}
            placeholder="— Sin especificar —"
            options={[
              { value: "", label: "— Sin especificar —" },
              ...CONDICIONES_PAGO.map((c) => ({
                value: c,
                label: c === "Transferencia" ? c : `${c} días`,
              })),
            ]}
          />
        </div>
        <div>
          <Label htmlFor="s-importe">Importe aproximado (USD)</Label>
          <Input
            id="s-importe"
            type="number"
            min="0"
            step="0.01"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="s-fecha">Fecha límite</Label>
          <Input
            id="s-fecha"
            type="date"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="s-gbp">Referencia GBP (opcional)</Label>
          <Input id="s-gbp" value={refGbp} onChange={(e) => setRefGbp(e.target.value)} />
        </div>
      </div>

      <div>
        <Label htmlFor="s-ccs">CC extra (emails separados por coma)</Label>
        <Input
          id="s-ccs"
          value={ccs}
          onChange={(e) => setCcs(e.target.value)}
          placeholder="persona@cliente.com, otra@cliente.com"
        />
      </div>

      <div>
        <Label htmlFor="s-files">Adjuntos (PDF o imágenes que mandó el cliente)</Label>
        <input
          id="s-files"
          type="file"
          multiple
          accept=".pdf,image/*"
          onChange={(e) => {
            const nuevos = Array.from(e.target.files ?? []);
            // Acumular: sumamos los nuevos a los ya elegidos, sin duplicar (nombre+tamaño).
            setFiles((prev) => {
              const clave = (f: File) => `${f.name}:${f.size}`;
              const vistos = new Set(prev.map(clave));
              return [...prev, ...nuevos.filter((f) => !vistos.has(clave(f)))];
            });
            // Limpiamos el input para poder volver a elegir el mismo archivo.
            e.target.value = "";
          }}
          className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface3"
        />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md bg-surface2 px-2.5 py-1 text-xs text-ink-2"
              >
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="ml-2 shrink-0 text-ink-3 hover:text-red-600"
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
        <Button type="submit" disabled={isPending || !oportunidadId || !requerimiento.trim()}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
