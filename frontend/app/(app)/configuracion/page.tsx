"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useAutomatizacion,
  useDestinatariosCompras,
  useUpdateAutomatizacion,
  useUpdateDestinatariosCompras,
} from "@/lib/config";

export default function ConfiguracionPage() {
  const { data, isLoading, isError } = useAutomatizacion();
  const updateMut = useUpdateAutomatizacion();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink">Configuración</h1>
      <p className="mt-1 text-sm text-ink-2">
        Automatización de las respuestas de la IA y destinatarios de Compras.
      </p>

      {isLoading && <p className="mt-6 text-ink-2">Cargando…</p>}
      {isError && <p className="mt-6 text-red-600">No se pudo cargar la configuración.</p>}

      {data && (
        <div className="mt-6 divide-y divide-line rounded-lg border border-line">
          <Row
            titulo="Acuse de recibo automático"
            detalle="Cuando entra un pedido claro, el cliente recibe automáticamente un acuse de recibo."
            checked={data.acuse_automatico}
            disabled={updateMut.isPending}
            onChange={(v) => updateMut.mutate({ acuse_automatico: v })}
          />
          <Row
            titulo="Aclaración automática"
            detalle="Si la IA detecta que falta información, envía sola el pedido de aclaración al cliente. Si está apagado, queda como borrador para enviar con un clic desde la bandeja."
            checked={data.aclaracion_automatica}
            disabled={updateMut.isPending}
            onChange={(v) => updateMut.mutate({ aclaracion_automatica: v })}
          />
        </div>
      )}

      <DestinatariosCompras />
    </div>
  );
}

// Destinatarios del mail que se envía a Compras al pedir una cotización.
function DestinatariosCompras() {
  const { data, isLoading } = useDestinatariosCompras();
  const updateMut = useUpdateDestinatariosCompras();

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    if (data && !cargado) {
      setTo(data.to ?? "");
      setCc(data.cc.join(", "));
      setCargado(true);
    }
  }, [data, cargado]);

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    const ccList = cc
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    updateMut.mutate({ to: to.trim() || null, cc: ccList });
  };

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-ink">
        Destinatarios de Compras
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        A quién se le envía el mail al pedir una cotización a Compras.
      </p>

      {isLoading ? (
        <p className="mt-4 text-ink-2">Cargando…</p>
      ) : (
        <form
          onSubmit={guardar}
          className="mt-4 space-y-4 rounded-lg border border-line p-4"
        >
          <div>
            <Label htmlFor="c-to">Email de Compras (principal) *</Label>
            <Input
              id="c-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="compras@argentinacolor.com"
              required
            />
          </div>
          <div>
            <Label htmlFor="c-cc">CC (opcional, separados por coma)</Label>
            <Input
              id="c-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="jefe@argentinacolor.com, otro@argentinacolor.com"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={updateMut.isPending || !to.trim()}>
              {updateMut.isPending ? "Guardando…" : "Guardar"}
            </Button>
            {updateMut.isSuccess && <span className="text-xs text-green-600">Guardado ✓</span>}
            {updateMut.isError && (
              <span className="text-xs text-red-600">
                No se pudo guardar. Revisá que los emails sean válidos.
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function Row({
  titulo,
  detalle,
  checked,
  disabled,
  onChange,
}: {
  titulo: string;
  detalle: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div>
        <p className="font-medium text-ink">{titulo}</p>
        <p className="mt-0.5 text-sm text-ink-2">{detalle}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
