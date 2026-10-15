"use client";

import { ClipboardType, Download, Pencil, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import { type FormEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  type CampoFormulario,
  type FormularioCompletado,
  type PerfilEmpresa,
  detectarFormulario,
  rellenarFormularioPdf,
  useCompletarFormulario,
  useGuardarPerfilEmpresa,
  usePerfilEmpresa,
} from "@/lib/config";
import { cn } from "@/lib/utils";

// Editor visual (react-pdf) solo en el cliente (pdf.js no corre en SSR).
const EditorPlano = dynamic(
  () => import("@/components/formularios/editor-plano").then((m) => m.EditorPlano),
  { ssr: false }
);

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
  const { data: perfil } = usePerfilEmpresa();
  const completar = useCompletarFormulario();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<FormularioCompletado | null>(null);
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [detectando, setDetectando] = useState(false);
  const [descargando, setDescargando] = useState(false);

  // Los datos del perfil (no vacíos) que el usuario ubica en el editor visual.
  const camposPerfil: CampoFormulario[] = perfil
    ? CAMPOS_PERFIL.flatMap((g) => g.campos)
        .map(({ k, label }) => ({
          etiqueta: label,
          valor: String(perfil[k] ?? ""),
          encontrado: true,
          campo: "",
        }))
        .filter((c) => c.valor.trim() !== "")
    : [];

  // Al subir: detectar si conviene auto-relleno (rellenable con etiquetas
  // legibles) o el editor visual. Ante la duda/error, editor (siempre funciona).
  const elegir = async (file: File) => {
    setArchivo(file);
    setResultado(null);
    setEditorAbierto(false);
    setDetectando(true);
    try {
      const rellenable = await detectarFormulario(file);
      if (rellenable) {
        completar.mutate(file, {
          onSuccess: (r) => setResultado(r),
          onError: () => {
            toast("No se pudo mapear con IA; abrí el editor", "error");
            setEditorAbierto(true);
          },
        });
      } else {
        setEditorAbierto(true);
      }
    } catch {
      setEditorAbierto(true);
    } finally {
      setDetectando(false);
    }
  };

  const editarCampo = (i: number, valor: string) =>
    setResultado((r) =>
      r ? { ...r, campos: r.campos.map((c, j) => (j === i ? { ...c, valor } : c)) } : r
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
      <h2 className="mt-8 text-lg font-semibold tracking-tight text-ink">
        Completar un formulario
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Subí el PDF. Si es rellenable, lo completa solo (revisás y descargás); si
        no, se abre el editor para ubicar tus datos sobre las líneas.
      </p>

      <Card className="mt-4 p-5">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) elegir(f);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={detectando || completar.isPending}
          >
            <Upload size={16} /> Subir formulario (PDF)
          </Button>
          {archivo && <span className="text-sm text-ink-2">{archivo.name}</span>}
          {(detectando || completar.isPending) && (
            <span className="text-sm text-accent">Analizando…</span>
          )}
        </div>
        {!perfil && <p className="mt-3 text-sm text-ink-2">Cargando perfil…</p>}

        {resultado && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                Formulario rellenable — revisá los datos ({resultado.campos.length})
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditorAbierto(true)}
                >
                  <Pencil size={15} /> Abrir editor
                </Button>
                <Button onClick={descargar} disabled={descargando}>
                  <Download size={16} />{" "}
                  {descargando ? "Generando…" : "Descargar formulario completo"}
                </Button>
              </div>
            </div>
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
          </div>
        )}
      </Card>

      {editorAbierto && archivo && perfil && (
        <EditorPlano
          archivo={archivo}
          campos={camposPerfil}
          onClose={() => setEditorAbierto(false)}
        />
      )}
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
