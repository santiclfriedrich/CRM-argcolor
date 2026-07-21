"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectMenu } from "@/components/ui/select-menu";
import { Textarea } from "@/components/ui/textarea";
import { useClientes } from "@/lib/clientes";
import { loadDraft, saveDraft } from "@/lib/draft";
import type { Cliente, ClienteCreate } from "@/lib/types";
import { useUsuarios } from "@/lib/usuarios";

// --- Validación (Zod). Validamos strings; la conversión a números/null para la
//     API se hace en el submit (evita el choque de tipos input/output). ---
const clienteSchema = z.object({
  razon_social: z.string().trim().min(1, "Ingresá el nombre de la cuenta"),
  cuit: z.string(),
  numero_cliente: z.string(),
  cuenta_principal_id: z.string(),
  vendedor_asignado_id: z.string(),
  telefono: z.string(),
  tipo: z.string(),
  sector: z.string(),
  sitio_web: z
    .string()
    .refine((v) => v.trim() === "" || /\./.test(v), "Ingresá un sitio web válido"),
  empleados: z
    .string()
    .refine((v) => v.trim() === "" || /^\d+$/.test(v.trim()), "Ingresá un número válido"),
  notas: z.string(),
  direccion_facturacion: z.string(),
  direccion_envio: z.string(),
  activo: z.boolean(),
});

type FormValues = z.infer<typeof clienteSchema>;

const nn = (s: string): string | null => s.trim() || null;

interface ClienteFormProps {
  initial?: Partial<Cliente>;
  clienteId?: number;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (values: ClienteCreate) => void;
  onCancel?: () => void;
  // Permiten disparar el submit desde un botón externo (ej. al final del detalle).
  formId?: string;
  hideSubmit?: boolean;
  // Si se pasa (solo al crear), persiste un borrador en localStorage con esta clave.
  draftKey?: string;
}

const TIPOS = [
  { value: "", label: "— Sin especificar —" },
  { value: "cliente", label: "Cliente" },
  { value: "prospecto", label: "Prospecto" },
  { value: "competidor", label: "Competidor" },
  { value: "proveedor", label: "Proveedor" },
  { value: "otro", label: "Otro" },
];

// Encabezado de sección estilo Salesforce: barra gris a lo ancho.
function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 rounded-md bg-surface2 px-4 py-2 text-[15px] font-bold text-ink">
        {titulo}
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

// Asterisco rojo para campos obligatorios.
const Req = () => <span className="text-red-600"> *</span>;

const FieldError = ({ msg }: { msg?: string }) =>
  msg ? <p className="mt-1 text-xs font-medium text-red-600">{msg}</p> : null;

export function ClienteForm({
  initial,
  clienteId,
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
  formId,
  hideSubmit = false,
  draftKey,
}: ClienteFormProps) {
  const { data: clientes } = useClientes();
  const { data: usuarios } = useUsuarios();

  // Borrador guardado (solo al crear): se carga una vez al montar.
  const draft = draftKey && !initial ? loadDraft<Partial<FormValues>>(draftKey) : null;

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      razon_social: initial?.razon_social ?? "",
      cuit: initial?.cuit ?? "",
      numero_cliente: initial?.numero_cliente ?? "",
      cuenta_principal_id: initial?.cuenta_principal_id != null ? String(initial.cuenta_principal_id) : "",
      vendedor_asignado_id:
        initial?.vendedor_asignado_id != null ? String(initial.vendedor_asignado_id) : "",
      telefono: initial?.telefono ?? "",
      tipo: initial?.tipo ?? "",
      sector: initial?.sector ?? "",
      sitio_web: initial?.sitio_web ?? "",
      empleados: initial?.empleados != null ? String(initial.empleados) : "",
      notas: initial?.notas ?? "",
      direccion_facturacion: initial?.direccion_facturacion ?? "",
      direccion_envio: initial?.direccion_envio ?? "",
      activo: initial?.activo ?? true,
      // El borrador pisa los defaults al crear.
      ...(draft ?? {}),
    },
  });

  // Guarda el borrador ante cada cambio (solo al crear con draftKey).
  useEffect(() => {
    if (!draftKey || initial) return;
    const sub = watch((values) => saveDraft(draftKey, values));
    return () => sub.unsubscribe();
  }, [watch, draftKey, initial]);

  const cuentasOpts = [
    { value: "", label: "— Ninguna —" },
    ...(clientes ?? [])
      .filter((c) => c.id !== clienteId)
      .map((c) => ({ value: String(c.id), label: c.razon_social })),
  ];
  const propietarioOpts = [
    { value: "", label: "— Sin asignar —" },
    ...(usuarios ?? []).map((u) => ({ value: String(u.id), label: u.nombre })),
  ];

  const invalido =
    "border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-400/40 dark:bg-red-950/20";

  const enviar = handleSubmit((v) =>
    onSubmit({
      razon_social: v.razon_social.trim(),
      cuit: nn(v.cuit),
      numero_cliente: nn(v.numero_cliente),
      cuenta_principal_id: v.cuenta_principal_id ? Number(v.cuenta_principal_id) : null,
      vendedor_asignado_id: v.vendedor_asignado_id ? Number(v.vendedor_asignado_id) : null,
      telefono: nn(v.telefono),
      tipo: v.tipo || null,
      sector: nn(v.sector),
      sitio_web: nn(v.sitio_web),
      empleados: v.empleados.trim() ? Number(v.empleados) : null,
      notas: nn(v.notas),
      direccion_facturacion: nn(v.direccion_facturacion),
      direccion_envio: nn(v.direccion_envio),
      activo: v.activo,
    })
  );

  return (
    <form id={formId} onSubmit={enviar} className="space-y-6" noValidate>
      <p className="text-right text-xs text-ink-2">
        <Req /> = Información obligatoria
      </p>

      <Seccion titulo="Información de la cuenta">
        <div className="sm:col-span-2">
          <Label htmlFor="razon_social">
            Nombre de la cuenta
            <Req />
          </Label>
          <Input
            id="razon_social"
            className={errors.razon_social ? invalido : ""}
            placeholder="BENCEN S.A."
            {...register("razon_social")}
          />
          <FieldError msg={errors.razon_social?.message} />
        </div>
        <div>
          <Label htmlFor="cuit">CUIT</Label>
          <Input id="cuit" placeholder="30-12345678-9" {...register("cuit")} />
        </div>
        <div>
          <Label htmlFor="numero_cliente">N° de cliente (CL N°)</Label>
          <Input id="numero_cliente" placeholder="Ej: 10432" {...register("numero_cliente")} />
        </div>
        <div>
          <Label htmlFor="cuenta_principal">Cuenta principal</Label>
          <Controller
            name="cuenta_principal_id"
            control={control}
            render={({ field }) => (
              <SelectMenu
                id="cuenta_principal"
                value={field.value}
                onChange={field.onChange}
                options={cuentasOpts}
                placeholder="— Ninguna —"
              />
            )}
          />
        </div>
        <div>
          <Label htmlFor="propietario">Propietario</Label>
          <Controller
            name="vendedor_asignado_id"
            control={control}
            render={({ field }) => (
              <SelectMenu
                id="propietario"
                value={field.value}
                onChange={field.onChange}
                options={propietarioOpts}
                placeholder="— Sin asignar —"
              />
            )}
          />
        </div>
        <div>
          <Label htmlFor="telefono">Teléfono</Label>
          <Input id="telefono" placeholder="011 4000-0000" {...register("telefono")} />
        </div>
        <div>
          <Label htmlFor="tipo">Tipo</Label>
          <Controller
            name="tipo"
            control={control}
            render={({ field }) => (
              <SelectMenu
                id="tipo"
                value={field.value}
                onChange={field.onChange}
                options={TIPOS}
                placeholder="— Sin especificar —"
              />
            )}
          />
        </div>
        <div>
          <Label htmlFor="sector">Sector / rubro</Label>
          <Input id="sector" placeholder="Ej: Gobierno" {...register("sector")} />
        </div>
      </Seccion>

      <Seccion titulo="Información adicional">
        <div>
          <Label htmlFor="sitio_web">Sitio web</Label>
          <Input
            id="sitio_web"
            className={errors.sitio_web ? invalido : ""}
            placeholder="https://…"
            {...register("sitio_web")}
          />
          <FieldError msg={errors.sitio_web?.message} />
        </div>
        <div>
          <Label htmlFor="empleados">Empleados</Label>
          <Input
            id="empleados"
            type="number"
            min="0"
            className={errors.empleados ? invalido : ""}
            {...register("empleados")}
          />
          <FieldError msg={errors.empleados?.message} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="notas">Descripción</Label>
          <Textarea id="notas" rows={3} placeholder="Notas sobre la cuenta…" {...register("notas")} />
        </div>
      </Seccion>

      <Seccion titulo="Direcciones">
        <div>
          <Label htmlFor="dir_fact">Dirección de facturación</Label>
          <Textarea id="dir_fact" rows={2} {...register("direccion_facturacion")} />
        </div>
        <div>
          <Label htmlFor="dir_envio">Dirección de envío</Label>
          <Textarea id="dir_envio" rows={2} {...register("direccion_envio")} />
        </div>
      </Seccion>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          {...register("activo")}
          className="h-4 w-4 rounded border-line accent-navy"
        />
        Cuenta activa
      </label>

      {!hideSubmit && (
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={isPending}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
