"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ClienteForm } from "@/components/clientes/cliente-form";
import { ContactosSection } from "@/components/clientes/contactos-section";
import { DominiosSection } from "@/components/clientes/dominios-section";
import { useCliente, useUpdateCliente } from "@/lib/clientes";

export default function ClienteDetailPage() {
  const params = useParams<{ id: string }>();
  const clienteId = Number(params.id);

  const { data: cliente, isLoading, isError } = useCliente(clienteId);
  const updateMut = useUpdateCliente(clienteId);

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Cargando…</p>;
  if (isError || !cliente)
    return <p className="text-red-600">No se pudo cargar el cliente.</p>;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link
          href="/clientes"
          className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700"
        >
          <ArrowLeft size={15} /> Volver a clientes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{cliente.razon_social}</h1>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Datos del cliente</h2>
        <ClienteForm
          initial={cliente}
          submitLabel="Guardar cambios"
          isPending={updateMut.isPending}
          onSubmit={(values) => updateMut.mutate(values)}
        />
        {updateMut.isSuccess && (
          <p className="mt-2 text-sm text-green-600">Cambios guardados.</p>
        )}
      </section>

      <ContactosSection clienteId={clienteId} contactos={cliente.contactos} />
      <DominiosSection clienteId={clienteId} dominios={cliente.dominios} />
    </div>
  );
}
