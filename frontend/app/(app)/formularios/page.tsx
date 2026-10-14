"use client";

import { ClipboardType, Download, Sparkles, Upload } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  type FormularioCompletado,
  type PerfilEmpresa,
  rellenarFormularioPdf,
  useCompletarFormulario,
  useGuardarPerfilEmpresa,
  usePerfilEmpresa,
} from "@/lib/config";
import { cn } from "@/lib/utils";

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

      <CompletarFormulario />

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

// Subir un formulario (PDF) y que la IA proponga qué va en cada campo según el
// perfil. Es un borrador para revisar (todavía no estampa el PDF).
function CompletarFormulario() {
  const completar = useCompletarFormulario();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<FormularioCompletado | null>(null);
  const [descargando, setDescargando] = useState(false);

  const nombre = archivo?.name ?? "Formulario";

  const analizar = (file: File) => {
    setArchivo(file);
    setResultado(null);
    completar.mutate(file, {
      onSuccess: (r) => setResultado(r),
      onError: () =>
        toast("No se pudo analizar el formulario (¿IA configurada?)", "error"),
    });
  };

  // Edita el valor de un campo en el resultado.
  const editarCampo = (i: number, valor: string) =>
    setResultado((r) =>
      r
        ? { ...r, campos: r.campos.map((c, j) => (j === i ? { ...c, valor } : c)) }
        : r
    );

  const descargar = async () => {
    if (!resultado || !archivo) return;
    setDescargando(true);
    try {
      await rellenarFormularioPdf(archivo, resultado.campos);
    } catch {
      toast("No se pudo generar el PDF", "error");
    } finally {
      setDescargando(false);
    }
  };

  return (
    <>
      <h2 className="mt-8 flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
        <Sparkles size={18} className="text-accent" /> Completar un formulario con IA
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Subí el PDF de un formulario y la IA propone qué valor va en cada campo
        según el perfil. Es un borrador para revisar.
      </p>

      <Card className="mt-4 p-5">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) analizar(f);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={completar.isPending}
          >
            <Upload size={16} /> Subir formulario (PDF)
          </Button>
          {(resultado || completar.isPending) && (
            <span className="text-sm text-ink-2">{nombre}</span>
          )}
          {completar.isPending && (
            <span className="text-sm text-accent">Analizando con IA…</span>
          )}
        </div>

        {resultado && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                Campos detectados ({resultado.campos.length})
              </p>
              {resultado.rellenable && (
                <Button onClick={descargar} disabled={descargando}>
                  <Download size={16} />{" "}
                  {descargando ? "Generando…" : "Descargar formulario completo"}
                </Button>
              )}
            </div>
            {!resultado.rellenable && (
              <p className="mb-3 rounded-lg border border-amber-400/60 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                Este formulario es <strong>plano</strong> (no rellenable): la IA
                igual mapeó los datos, pero para bajarlo completo hay que armar su
                plantilla una vez. Avisame y la preparo.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {resultado.campos.map((c, i) => (
                <div key={`${c.etiqueta}-${i}`}>
                  <Label htmlFor={`cf-${i}`}>
                    {c.etiqueta}
                    {!c.encontrado && (
                      <span className="ml-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        · falta en el perfil
                      </span>
                    )}
                  </Label>
                  <Input
                    id={`cf-${i}`}
                    value={c.valor}
                    onChange={(e) => editarCampo(i, e.target.value)}
                    className={cn(
                      !c.encontrado && "border-amber-400 dark:border-amber-500/60"
                    )}
                  />
                </div>
              ))}
            </div>
            {resultado.notas && (
              <p className="mt-4 rounded-lg border border-line bg-surface2/60 px-3 py-2 text-sm text-ink-2">
                <span className="font-medium text-ink">Nota de la IA:</span>{" "}
                {resultado.notas}
              </p>
            )}
            <p className="mt-3 text-xs text-ink-3">
              Revisá y corregí los valores; completá los que falten
              {resultado.rellenable
                ? " y descargá el formulario original ya completo."
                : "."}
            </p>
          </div>
        )}
      </Card>
    </>
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
