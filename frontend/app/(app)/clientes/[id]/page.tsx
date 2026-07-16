"use client";

import { ArrowLeft, Building2, ListChecks, Save, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { ClienteForm } from "@/components/clientes/cliente-form";
import { ContactosSection } from "@/components/clientes/contactos-section";
import { DominiosSection } from "@/components/clientes/dominios-section";
import { TareaModal } from "@/components/tareas/tarea-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCliente, useDeleteCliente, useUpdateCliente } from "@/lib/clientes";
import { ESTADO_META, useOportunidades } from "@/lib/oportunidades";
import { fmtMonto } from "@/lib/presupuestos";
import { type Tarea, useTareas } from "@/lib/tareas";

const fmtDia = (d: string | null): string => (d ? d.split("-").reverse().join("/") : "—");

export default function ClienteDetailPage() {
  const params = useParams<{ id: string }>();
  const clienteId = Number(params.id);
  const router = useRouter();

  const { data: cliente, isLoading, isError } = useCliente(clienteId);
  const updateMut = useUpdateCliente(clienteId);
  const deleteMut = useDeleteCliente();
  const { data: oportunidades } = useOportunidades({ cliente_id: clienteId });
  const { data: misTareas } = useTareas();
  const [editarTarea, setEditarTarea] = useState<Tarea | null>(null);

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Cargando…</p>;
  if (isError || !cliente) return <p className="text-red-600">No se pudo cargar la cuenta.</p>;

  const opps = oportunidades ?? [];
  const tareas = (misTareas ?? []).filter((t) => t.cliente_id === clienteId);

  const eliminar = () => {
    if (
      window.confirm(
        `¿Eliminar la cuenta "${cliente.razon_social}"?\n\nSe borran también sus contactos, ` +
          `dominios y oportunidades (con mails, presupuestos y solicitudes). No se puede deshacer.`
      )
    ) {
      deleteMut.mutate(clienteId, { onSuccess: () => router.push("/clientes") });
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/clientes"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400"
      >
        <ArrowLeft size={15} /> Volver a cuentas
      </Link>

      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
            <Building2 size={22} />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Cuenta</p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {cliente.razon_social}
            </h1>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span>Contactos: {cliente.contactos.length}</span>
              <span>Oportunidades: {opps.length}</span>
              <span>Tareas: {tareas.length}</span>
            </div>
            {cliente.cuenta_principal && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Subcuenta de{" "}
                <Link
                  href={`/clientes/${cliente.cuenta_principal.id}`}
                  className="text-brand hover:underline"
                >
                  {cliente.cuenta_principal.razon_social}
                </Link>
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={eliminar}
          disabled={deleteMut.isPending}
          className="shrink-0 text-red-600"
        >
          <Trash2 size={14} /> {deleteMut.isPending ? "Eliminando…" : "Eliminar cuenta"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Datos de la cuenta
            </h2>
            <ClienteForm
              initial={cliente}
              clienteId={clienteId}
              submitLabel="Guardar cambios"
              isPending={updateMut.isPending}
              onSubmit={(values) => updateMut.mutate(values)}
              formId="cuenta-datos-form"
              hideSubmit
            />
          </section>

          <ContactosSection clienteId={clienteId} contactos={cliente.contactos} />
          <DominiosSection clienteId={clienteId} dominios={cliente.dominios} />

          {/* Guardado final, bien visible. Los contactos y dominios ya se
              guardan al agregarlos; este botón guarda los datos de la cuenta. */}
          <div className="flex items-center gap-2">
            <Button type="submit" form="cuenta-datos-form" disabled={updateMut.isPending}>
              <Save size={16} /> {updateMut.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
            {updateMut.isSuccess && (
              <span className="text-sm font-medium text-green-600">Cambios guardados.</span>
            )}
          </div>
        </div>

        {/* Columna lateral: relacionados */}
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 dark:border-slate-800">
            <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <Target size={16} className="text-orange-500" />
              <span className="font-semibold text-slate-800 dark:text-slate-100">Oportunidades</span>
              <Badge className="ml-auto">{opps.length}</Badge>
            </header>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {opps.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/oportunidades?op=${o.id}`)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {o.asunto ?? `Oportunidad #${o.id}`}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {o.valor_estimado != null ? fmtMonto(o.valor_estimado, "USD") : "—"}
                      </span>
                    </span>
                    <Badge className={ESTADO_META[o.estado].color}>{ESTADO_META[o.estado].label}</Badge>
                  </button>
                </li>
              ))}
              {opps.length === 0 && (
                <li className="px-4 py-5 text-center text-xs text-slate-400 dark:text-slate-500">
                  Sin oportunidades.
                </li>
              )}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-slate-800">
            <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <ListChecks size={16} className="text-brand" />
              <span className="font-semibold text-slate-800 dark:text-slate-100">Tareas</span>
              <Badge className="ml-auto">{tareas.length}</Badge>
            </header>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {tareas.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setEditarTarea(t)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span
                      className={`min-w-0 truncate text-sm ${
                        t.completada
                          ? "text-slate-400 line-through dark:text-slate-500"
                          : "text-slate-800 dark:text-slate-100"
                      }`}
                    >
                      {t.titulo}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {fmtDia(t.fecha_vencimiento)}
                    </span>
                  </button>
                </li>
              ))}
              {tareas.length === 0 && (
                <li className="px-4 py-5 text-center text-xs text-slate-400 dark:text-slate-500">
                  Sin tareas.
                </li>
              )}
            </ul>
          </section>

          {cliente.subcuentas.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800">
              <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <Building2 size={16} className="text-blue-500" />
                <span className="font-semibold text-slate-800 dark:text-slate-100">Subcuentas</span>
                <Badge className="ml-auto">{cliente.subcuentas.length}</Badge>
              </header>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {cliente.subcuentas.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/clientes/${s.id}`}
                      className="block truncate px-4 py-2.5 text-sm font-medium text-brand hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      {s.razon_social}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {editarTarea && (
        <TareaModal open tarea={editarTarea} onClose={() => setEditarTarea(null)} />
      )}
    </div>
  );
}
