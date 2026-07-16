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
  onSubmit: (values: SolicitudCreate) => void;
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
  const [condicionPago, setCondicionPago] = useState<CondicionPago | "">("");
  const [importe, setImporte] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [refGbp, setRefGbp] = useState("");
  const [ccs, setCcs] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!oportunidadId || !requerimiento.trim()) return;
    onSubmit({
      oportunidad_id: oportunidadId,
      requerimiento: requerimiento.trim(),
      condicion_pago: condicionPago || null,
      importe_aproximado: importe ? Number(importe) : null,
      fecha_limite: fechaLimite || null,
      presupuesto_gbp_referencia: refGbp.trim() || null,
      ccs_extra: parseEmails(ccs),
    });
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
