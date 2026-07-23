"use client";

import { Building2, Plus, Search } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ClienteForm } from "@/components/clientes/cliente-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useClientes, useCreateCliente } from "@/lib/clientes";
import { clearDraft, DRAFT_CLIENTE } from "@/lib/draft";
import { errorMessage } from "@/lib/utils";

// Mensaje de error del backend a mostrar bajo el CUIT (solo si es un conflicto
// de duplicado, HTTP 409).
const cuitErrorDe = (err: unknown): string | null =>
  (err as { response?: { status?: number } })?.response?.status === 409
    ? errorMessage(err)
    : null;

export default function CuentasPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = Number(session?.usuario?.id) || null;
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"mias" | "todas">("mias");
  const { data, isLoading, isError } = useClientes();
  const createMut = useCreateCliente();

  const termino = q.trim().toLowerCase();
  const cuentas = (data ?? []).filter((c) => {
    if (filtro === "mias" && c.creado_por_id !== currentUserId) return false;
    if (
      termino &&
      !c.razon_social.toLowerCase().includes(termino) &&
      !(c.cuit ?? "").toLowerCase().includes(termino)
    )
      return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white">
          <Building2 size={18} />
        </span>
        <h1 className="text-2xl font-bold text-ink">Cuentas</h1>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> Nueva cuenta
          </Button>
        </div>
      </div>

      {isLoading && <p className="mt-4 text-ink-2">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-red-600">
          No se pudo conectar al backend. ¿Está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {data && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-lg border border-line bg-surface2 p-0.5 text-sm">
                {(["mias", "todas"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFiltro(f)}
                    className={`rounded-md px-3 py-1 font-medium transition ${
                      filtro === f
                        ? "bg-navy text-white"
                        : "text-ink-2 hover:bg-surface"
                    }`}
                  >
                    {f === "mias" ? "Mías" : "Todas"}
                  </button>
                ))}
              </div>
              <p className="text-sm text-ink-2">
                {cuentas.length} {cuentas.length === 1 ? "elemento" : "elementos"}
              </p>
            </div>
            <div className="relative w-64 max-w-full">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar en esta lista…"
                className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          <div className="mt-3 overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-left text-xs uppercase tracking-wide text-ink-2">
                <tr>
                  <th className="w-10 px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Nombre de la cuenta</th>
                  <th className="px-3 py-2 font-medium">CUIT</th>
                  <th className="px-3 py-2 font-medium">Creada por</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c, i) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-t border-line hover:bg-surface2"
                    onClick={() => router.push(`/clientes/${c.id}`)}
                  >
                    <td className="px-3 py-2 text-ink-3">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-accent">
                      <Link href={`/clientes/${c.id}`} onClick={(e) => e.stopPropagation()}>
                        {c.razon_social}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-ink-2">{c.cuit ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-2">
                      {c.creado_por?.nombre ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {c.activo ? (
                        <Badge className="bg-green-100 text-green-700">activo</Badge>
                      ) : (
                        <Badge className="bg-surface2 text-ink-2">
                          inactivo
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {cuentas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                      {termino
                        ? "Sin coincidencias."
                        : filtro === "mias"
                          ? "No tenés cuentas creadas. Cambiá a “Todas” para ver las del equipo."
                          : "No hay cuentas todavía."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva cuenta" size="4xl">
        <ClienteForm
          submitLabel="Crear"
          isPending={createMut.isPending}
          cuitError={cuitErrorDe(createMut.error)}
          draftKey={DRAFT_CLIENTE}
          onCancel={() => {
            clearDraft(DRAFT_CLIENTE);
            setCreating(false);
          }}
          onSubmit={(values) =>
            createMut.mutate(values, {
              onSuccess: (cliente) => {
                clearDraft(DRAFT_CLIENTE);
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
