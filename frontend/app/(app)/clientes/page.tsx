"use client";

import { Building2, Hash, Plus, RefreshCw, User } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ClienteForm } from "@/components/clientes/cliente-form";
import { ClientePicker } from "@/components/clientes/cliente-picker";
import { Badge } from "@/components/ui/badge";
import { RefChip } from "@/components/ui/ref-chip";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useResizableColumns } from "@/components/ui/resizable-columns";
import { useClientes, useCreateCliente } from "@/lib/clientes";
import { clearDraft, DRAFT_CLIENTE } from "@/lib/draft";
import { useGbpSyncStatus, useRunGbpSync } from "@/lib/sync";
import { errorMessage } from "@/lib/utils";

// Botón (admin) para disparar el sync de clientes GBP -> CRM. El scheduler igual
// lo corre solo cada 8h; esto es para forzarlo cuando cargan clientes nuevos.
function SyncGbpBoton() {
  const { data: session } = useSession();
  const esAdmin = (session?.usuario as { rol?: string } | undefined)?.rol === "admin";
  const run = useRunGbpSync();
  const { data: estado } = useGbpSyncStatus(esAdmin);

  if (!esAdmin) return null;
  const corriendo = Boolean(estado?.corriendo) || run.isPending;

  return (
    <div className="flex items-center gap-2">
      {corriendo ? (
        <span className="hidden text-xs text-ink-3 sm:inline">
          Sincronizando… {estado?.progreso ?? ""}
        </span>
      ) : (
        estado?.ultimo_resultado && (
          <span
            className="hidden max-w-[16rem] truncate text-xs text-ink-3 sm:inline"
            title={estado.ultimo_resultado}
          >
            Última: {estado.ultimo_resultado}
          </span>
        )
      )}
      <Button
        variant="outline"
        onClick={() => run.mutate()}
        disabled={corriendo}
        title="Trae los clientes nuevos del ERP GBP (incremental)"
      >
        <RefreshCw size={16} className={corriendo ? "animate-spin" : ""} />
        {corriendo ? "Sincronizando…" : "Sincronizar GBP"}
      </Button>
    </div>
  );
}

// Mensaje de error del backend a mostrar bajo el CUIT (solo si es un conflicto
// de duplicado, HTTP 409).
const cuitErrorDe = (err: unknown): string | null =>
  (err as { response?: { status?: number } })?.response?.status === 409
    ? errorMessage(err)
    : null;

export default function CuentasPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError } = useClientes();
  const createMut = useCreateCliente();

  const cuentas = data ?? [];

  // Anchos ajustables por columna (#, Nombre, CUIT, Creada por, Estado).
  const cols = useResizableColumns("cuentas", [56, 460, 190, 210, 120]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white">
          <Building2 size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Cuentas</h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SyncGbpBoton />
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> Nueva cuenta
          </Button>
        </div>
      </div>

      {isLoading && <p className="mt-4 text-ink-2">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-danger">
          No se pudo conectar al backend. ¿Está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {data && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="w-full max-w-xl">
              <ClientePicker
                clientes={cuentas}
                value={null}
                onChange={(id) => {
                  if (id) router.push(`/clientes/${id}`);
                }}
              />
            </div>
            <p className="text-sm text-ink-2">
              {cuentas.length} {cuentas.length === 1 ? "cuenta" : "cuentas"}
            </p>
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-2xl border border-line">
            <table className="text-sm" style={cols.tableStyle}>
              <colgroup>{cols.colgroup}</colgroup>
              <thead>
                <tr className="[&_th]:relative [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line [&_th]:bg-surface2 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-ink">
                  <th>#{cols.handle(0)}</th>
                  <th>
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <Building2 size={13} className="text-ink-3" /> Nombre de la cuenta
                    </span>
                    {cols.handle(1)}
                  </th>
                  <th>
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <Hash size={13} className="text-ink-3" /> CUIT
                    </span>
                    {cols.handle(2)}
                  </th>
                  <th>
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <User size={13} className="text-ink-3" /> Creada por
                    </span>
                    {cols.handle(3)}
                  </th>
                  <th>
                    Estado{cols.handle(4)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c, i) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-t border-line transition-colors hover:bg-surface2"
                    onClick={() => router.push(`/clientes/${c.id}`)}
                  >
                    <td className="truncate px-3 py-2 font-mono tabular-nums text-ink-3">{i + 1}</td>
                    <td className="truncate px-3 py-2 font-medium text-accent">
                      <Link href={`/clientes/${c.id}`} onClick={(e) => e.stopPropagation()}>
                        {c.razon_social}
                      </Link>
                    </td>
                    <td className="truncate px-3 py-2 font-mono tabular-nums text-ink-2">{c.cuit ?? "—"}</td>
                    <td className="truncate px-3 py-2">
                      {c.creado_por?.nombre ? (
                        <RefChip icon={<User size={12} className="shrink-0 text-ink-3" />}>
                          {c.creado_por.nombre}
                        </RefChip>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {c.activo ? (
                        <Badge tone="success">activo</Badge>
                      ) : (
                        <Badge>inactivo</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {cuentas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                      No hay cuentas todavía.
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
