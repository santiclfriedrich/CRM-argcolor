"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ClienteForm } from "@/components/clientes/cliente-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useClientes, useCreateCliente } from "@/lib/clientes";

export default function ClientesPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError } = useClientes();
  const createMut = useCreateCliente();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Clientes</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nuevo cliente
        </Button>
      </div>

      {isLoading && <p className="mt-4 text-slate-500 dark:text-slate-400">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-red-600">
          No se pudo conectar al backend. ¿Está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {data && (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Razón social</th>
                <th className="px-4 py-2 font-medium">CUIT</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => router.push(`/clientes/${c.id}`)}
                >
                  <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">
                    <Link href={`/clientes/${c.id}`} onClick={(e) => e.stopPropagation()}>
                      {c.razon_social}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{c.cuit ?? "—"}</td>
                  <td className="px-4 py-2">
                    {c.activo ? (
                      <Badge className="bg-green-100 text-green-700">activo</Badge>
                    ) : (
                      <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">inactivo</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                    No hay clientes todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo cliente">
        <ClienteForm
          submitLabel="Crear"
          isPending={createMut.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(values) =>
            createMut.mutate(values, {
              onSuccess: (cliente) => {
                setCreating(false);
                router.push(`/clientes/${cliente.id}`);
              },
            })
          }
        />
      </Modal>
    </div>
  );
}
