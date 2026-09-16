"use client";

import {
  ArrowLeft,
  Building2,
  Link2,
  ListChecks,
  Save,
  Target,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { ClienteForm } from "@/components/clientes/cliente-form";
import { ContactosSection } from "@/components/clientes/contactos-section";
import { DominiosSection } from "@/components/clientes/dominios-section";
import { TareaModal } from "@/components/tareas/tarea-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  useCliente,
  useCrearEnGbp,
  useDeleteCliente,
  useProvinciasGbp,
  useUpdateCliente,
} from "@/lib/clientes";
import { ESTADO_META, useOportunidades } from "@/lib/oportunidades";
import { fmtMonto } from "@/lib/presupuestos";
import { type Tarea, useTareas } from "@/lib/tareas";
import { errorMessage } from "@/lib/utils";

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
  const [gbpOpen, setGbpOpen] = useState(false);
  const confirm = useConfirm();

  if (isLoading) return <p className="text-ink-2">Cargando…</p>;
  if (isError || !cliente) return <p className="text-danger">No se pudo cargar la cuenta.</p>;

  const opps = oportunidades ?? [];
  const tareas = (misTareas ?? []).filter((t) => t.cliente_id === clienteId);

  const eliminar = async () => {
    if (
      await confirm({
        message:
          `¿Eliminar la cuenta "${cliente.razon_social}"?\n\nSe borran también sus contactos, ` +
          `dominios y oportunidades (con mails, presupuestos y solicitudes). No se puede deshacer.`,
        danger: true,
        title: "Eliminar cuenta",
      })
    ) {
      deleteMut.mutate(clienteId, { onSuccess: () => router.push("/clientes") });
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/clientes"
        className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={15} /> Volver a cuentas
      </Link>

      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {cliente.razon_social}
            </h1>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
              <span>Contactos: {cliente.contactos.length}</span>
              <span>Oportunidades: {opps.length}</span>
              <span>Tareas: {tareas.length}</span>
            </div>
            {cliente.cuenta_principal && (
              <p className="mt-1 text-xs text-ink-2">
                Subcuenta de{" "}
                <Link
                  href={`/clientes/${cliente.cuenta_principal.id}`}
                  className="text-accent hover:underline"
                >
                  {cliente.cuenta_principal.razon_social}
                </Link>
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {cliente.numero_cliente ? (
            <Badge tone="success">GBP N° {cliente.numero_cliente}</Badge>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setGbpOpen(true)}>
              <Link2 size={14} /> Crear en GBP
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={eliminar}
            disabled={deleteMut.isPending}
            className="text-danger"
          >
            <Trash2 size={14} /> {deleteMut.isPending ? "Eliminando…" : "Eliminar cuenta"}
          </Button>
        </div>
      </div>

      {gbpOpen && <CrearEnGbpModal clienteId={clienteId} onClose={() => setGbpOpen(false)} />}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 text-base font-semibold tracking-tight text-ink">
              Datos de la cuenta
            </h2>
            <ClienteForm
              initial={cliente}
              clienteId={clienteId}
              submitLabel="Guardar cambios"
              isPending={updateMut.isPending}
              cuitError={
                (updateMut.error as { response?: { status?: number } })?.response?.status === 409
                  ? errorMessage(updateMut.error)
                  : null
              }
              onSubmit={(values) => updateMut.mutate(values)}
              formId="cuenta-datos-form"
              hideSubmit
            />
          </Card>

          <ContactosSection clienteId={clienteId} contactos={cliente.contactos} />
          <DominiosSection clienteId={clienteId} dominios={cliente.dominios} />

          {/* Guardado final, bien visible. Los contactos y dominios ya se
              guardan al agregarlos; este botón guarda los datos de la cuenta. */}
          <div className="flex items-center gap-2">
            <Button type="submit" form="cuenta-datos-form" disabled={updateMut.isPending}>
              <Save size={16} /> {updateMut.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
            {updateMut.isSuccess && (
              <span className="text-sm font-medium text-success">Cambios guardados.</span>
            )}
          </div>
        </div>

        {/* Columna lateral: relacionados */}
        <div className="space-y-6">
          <Card>
            <header className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Target size={16} className="text-orange-500" />
              <span className="font-semibold text-ink">Oportunidades</span>
              <Badge className="ml-auto">{opps.length}</Badge>
            </header>
            <ul className="divide-y divide-line">
              {opps.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/oportunidades?op=${o.id}`)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-surface2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {o.asunto ?? `Oportunidad #${o.id}`}
                      </span>
                      <span className="tabular-nums text-xs text-ink-3">
                        {o.valor_estimado != null ? fmtMonto(o.valor_estimado, "USD") : "—"}
                      </span>
                    </span>
                    <Badge tone={ESTADO_META[o.estado].tone}>{ESTADO_META[o.estado].label}</Badge>
                  </button>
                </li>
              ))}
              {opps.length === 0 && (
                <li className="px-4 py-5 text-center text-xs text-ink-3">
                  Sin oportunidades.
                </li>
              )}
            </ul>
          </Card>

          <Card>
            <header className="flex items-center gap-2 border-b border-line px-4 py-3">
              <ListChecks size={16} className="text-accent" />
              <span className="font-semibold text-ink">Tareas</span>
              <Badge className="ml-auto">{tareas.length}</Badge>
            </header>
            <ul className="divide-y divide-line">
              {tareas.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setEditarTarea(t)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-surface2"
                  >
                    <span
                      className={`min-w-0 truncate text-sm ${
                        t.completada
                          ? "text-ink-3 line-through"
                          : "text-ink"
                      }`}
                    >
                      {t.titulo}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-ink-3">
                      {fmtDia(t.fecha_vencimiento)}
                    </span>
                  </button>
                </li>
              ))}
              {tareas.length === 0 && (
                <li className="px-4 py-5 text-center text-xs text-ink-3">
                  Sin tareas.
                </li>
              )}
            </ul>
          </Card>

          {cliente.subcuentas.length > 0 && (
            <Card>
              <header className="flex items-center gap-2 border-b border-line px-4 py-3">
                <Building2 size={16} className="text-blue-500" />
                <span className="font-semibold text-ink">Subcuentas</span>
                <Badge className="ml-auto">{cliente.subcuentas.length}</Badge>
              </header>
              <ul className="divide-y divide-line">
                {cliente.subcuentas.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/clientes/${s.id}`}
                      className="block truncate px-4 py-2.5 text-sm font-medium text-accent hover:bg-surface2"
                    >
                      {s.razon_social}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {editarTarea && (
        <TareaModal open tarea={editarTarea} onClose={() => setEditarTarea(null)} />
      )}
    </div>
  );
}

function CrearEnGbpModal({
  clienteId,
  onClose,
}: {
  clienteId: number;
  onClose: () => void;
}) {
  const { data: provincias, isLoading, isError } = useProvinciasGbp(true);
  const crear = useCrearEnGbp(clienteId);
  const toast = useToast();
  const [stateId, setStateId] = useState("");
  const [fiscal, setFiscal] = useState("1");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");

  const confirmar = () => {
    if (!stateId) return;
    crear.mutate(
      { state_id: stateId, fiscalclass: fiscal, city, zip },
      {
        onSuccess: (r) => {
          toast.toast(
            r.dedup
              ? `Ya existía en GBP — vinculado (N° ${r.numero_cliente})`
              : `Cliente creado en GBP (N° ${r.numero_cliente})`,
            "success"
          );
          onClose();
        },
        onError: (e) => toast.toast(errorMessage(e), "error"),
      }
    );
  };

  return (
    <Modal open onClose={onClose} title="Crear en GBP">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">
          Se da de alta el cliente en GBP con su CUIT y se guarda el N° de cliente. Si el
          CUIT ya existe en GBP, se vincula ese cliente sin duplicar.
        </p>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink-2">Provincia</label>
          {isError ? (
            <p className="text-sm text-danger">No se pudieron traer las provincias de GBP.</p>
          ) : (
            <select
              value={stateId}
              onChange={(e) => setStateId(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink"
            >
              <option value="">{isLoading ? "Cargando…" : "Elegí una provincia"}</option>
              {(provincias ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink-2">
            Condición IVA (código GBP)
          </label>
          <Input value={fiscal} onChange={(e) => setFiscal(e.target.value)} />
          <p className="mt-1 text-xs text-ink-3">1 = Responsable Inscripto.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-2">Ciudad</label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-2">CP</label>
            <Input value={zip} onChange={(e) => setZip(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={crear.isPending || !stateId}>
            {crear.isPending ? "Creando…" : "Crear en GBP"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
