"use client";

import { ClipboardType } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  type PerfilEmpresa,
  useGuardarPerfilEmpresa,
  usePerfilEmpresa,
} from "@/lib/config";

// Datos fijos de la empresa para autocompletar formularios de licitación.
const CAMPOS_PERFIL: {
  seccion: string;
  campos: { k: keyof PerfilEmpresa; label: string; ancho?: boolean }[];
}[] = [
  {
    seccion: "Datos generales",
    campos: [
      { k: "razon_social", label: "Razón social", ancho: true },
      { k: "cuit", label: "CUIT" },
      { k: "forma_juridica", label: "Forma jurídica" },
      { k: "fecha_contrato_social", label: "Fecha contrato social" },
      { k: "domicilio", label: "Domicilio", ancho: true },
      { k: "localidad", label: "Localidad" },
      { k: "cp", label: "Código postal" },
      { k: "provincia", label: "Provincia" },
      { k: "telefono", label: "Teléfono" },
      { k: "email", label: "Email" },
    ],
  },
  {
    seccion: "Datos impositivos",
    campos: [
      { k: "condicion_iva", label: "Condición ante el IVA" },
      { k: "condicion_ganancias", label: "Condición ante Ganancias" },
      { k: "condicion_iibb", label: "Condición ante IIBB" },
      { k: "nro_iibb", label: "N° de IIBB" },
      { k: "jurisdicciones_iibb", label: "Jurisdicciones IIBB", ancho: true },
      { k: "actividad_principal", label: "Actividad principal", ancho: true },
      { k: "actividad_secundaria", label: "Actividad secundaria", ancho: true },
      { k: "concepto_retencion", label: "Concepto sujeto a retención (RG 830)", ancho: true },
    ],
  },
  {
    seccion: "Datos bancarios",
    campos: [
      { k: "banco", label: "Banco" },
      { k: "sucursal", label: "Sucursal" },
      { k: "cuenta", label: "Cuenta", ancho: true },
      { k: "cbu", label: "CBU", ancho: true },
    ],
  },
  {
    seccion: "Contacto",
    campos: [
      { k: "contacto_nombre", label: "Contacto" },
      { k: "contacto_area", label: "Área" },
      { k: "contacto_email", label: "Email de contacto" },
    ],
  },
];

export default function FormulariosPage() {
  const { data } = usePerfilEmpresa();

  return (
    <div className="max-w-3xl">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
        <ClipboardType size={22} className="text-accent" /> Formularios
      </h1>
      <p className="mt-1 text-sm text-ink-2">
        El perfil de empresa con los datos que siempre se piden en los formularios
        de alta de proveedor y licitaciones. Vienen precargados; editalos y guardá.
      </p>

      <h2 className="mt-8 text-lg font-semibold tracking-tight text-ink">
        Perfil de empresa
      </h2>
      {data ? (
        <PerfilEmpresaForm inicial={data} />
      ) : (
        <p className="mt-4 text-sm text-ink-2">Cargando…</p>
      )}
    </div>
  );
}

function PerfilEmpresaForm({ inicial }: { inicial: PerfilEmpresa }) {
  const guardar = useGuardarPerfilEmpresa();
  const { toast } = useToast();
  const [form, setForm] = useState<PerfilEmpresa>(inicial);

  const set = (k: keyof PerfilEmpresa, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    guardar.mutate(form, {
      onSuccess: () => toast("Perfil guardado", "success"),
      onError: () => toast("No se pudo guardar el perfil", "error"),
    });
  };

  return (
    <form onSubmit={submit}>
      <Card className="mt-4 space-y-6 p-5">
        {CAMPOS_PERFIL.map((grupo) => (
          <div key={grupo.seccion}>
            <p className="mb-2 text-sm font-semibold text-ink">{grupo.seccion}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {grupo.campos.map(({ k, label, ancho }) => (
                <div key={k} className={ancho ? "sm:col-span-2" : undefined}>
                  <Label htmlFor={`pe-${k}`}>{label}</Label>
                  <Input
                    id={`pe-${k}`}
                    value={form[k]}
                    onChange={(e) => set(k, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div>
          <Label htmlFor="pe-observaciones">Observaciones</Label>
          <Textarea
            id="pe-observaciones"
            rows={2}
            value={form.observaciones}
            onChange={(e) => set("observaciones", e.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? "Guardando…" : "Guardar perfil"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
