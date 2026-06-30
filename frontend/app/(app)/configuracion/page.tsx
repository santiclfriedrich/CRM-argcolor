"use client";

import { Switch } from "@/components/ui/switch";
import { useAutomatizacion, useUpdateAutomatizacion } from "@/lib/config";

export default function ConfiguracionPage() {
  const { data, isLoading, isError } = useAutomatizacion();
  const updateMut = useUpdateAutomatizacion();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Configuración</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Automatización de las respuestas que genera la IA en la bandeja.
      </p>

      {isLoading && <p className="mt-6 text-slate-500 dark:text-slate-400">Cargando…</p>}
      {isError && <p className="mt-6 text-red-600">No se pudo cargar la configuración.</p>}

      {data && (
        <div className="mt-6 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:border-slate-800">
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
        <p className="font-medium text-slate-800 dark:text-slate-100">{titulo}</p>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{detalle}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
