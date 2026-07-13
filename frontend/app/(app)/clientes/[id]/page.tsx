"use client";

import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { ClienteForm } from "@/components/clientes/cliente-form";
import { ContactosSection } from "@/components/clientes/contactos-section";
import { DominiosSection } from "@/components/clientes/dominios-section";
import { Button } from "@/components/ui/button";
import { useCliente, useDeleteCliente, useUpdateCliente } from "@/lib/clientes";

export default function ClienteDetailPage() {
  const params = useParams<{ id: string }>();
  const clienteId = Number(params.id);
  const router = useRouter();

  const { data: cliente, isLoading, isError } = useCliente(clienteId);
  const updateMut = useUpdateCliente(clienteId);
  const deleteMut = useDeleteCliente();

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Cargando…</p>;
  if (isError || !cliente)
    return <p className="text-red-600">No se pudo cargar el cliente.</p>;

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
    <div className="max-w-3xl space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/clientes"
            className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700"
          >
            <ArrowLeft size={15} /> Volver a clientes
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{cliente.razon_social}</h1>
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
