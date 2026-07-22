"use client";

import {
  ArrowLeft,
  ClipboardList,
  Download,
  FileText,
  Mail,
  Paperclip,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { OportunidadForm } from "@/components/oportunidades/oportunidad-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useMails } from "@/lib/mails";
import {
  descargarAdjuntoOportunidad,
  ESTADO_META,
  useAgregarComentario,
  useEliminarAdjuntoOportunidad,
  useEliminarComentario,
  useDeleteOportunidad,
  useOportunidad,
  useSubirAdjuntosOportunidad,
  useUpdateOportunidad,
} from "@/lib/oportunidades";
import { ESTADO_PRESUPUESTO, fmtMonto, usePresupuestos } from "@/lib/presupuestos";
import { ESTADO_SOLICITUD_META, useSolicitudes } from "@/lib/solicitudes";
import type { OportunidadCreate } from "@/lib/types";

export default function OportunidadDetallePage() {
  const params = useParams();
  const id = Number(params.id);
  const router = useRouter();
  const { data: o, isLoading, isError } = useOportunidad(id);
  const updateMut = useUpdateOportunidad(id);
  const deleteMut = useDeleteOportunidad();
  const confirm = useConfirm();

  if (isLoading) return <p className="text-ink-2">Cargando…</p>;
  if (isError || !o) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-red-600">No se pudo cargar la oportunidad.</p>
      </div>
    );
  }

  const cliente = o.cliente?.razon_social ?? `#${o.id}`;

  const eliminar = async () => {
    if (
      await confirm({
        title: "Eliminar oportunidad",
        message:
          `¿Eliminar la oportunidad de ${cliente}? Se borra todo lo asociado (mails, ` +
          `solicitudes, presupuestos). No se puede deshacer.`,
        danger: true,
      })
    ) {
      deleteMut.mutate(o.id, { onSuccess: () => router.push("/oportunidades") });
    }
  };

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {cliente} <span className="text-ink-3">· #{o.id}</span>
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge className={ESTADO_META[o.estado].color}>{ESTADO_META[o.estado].label}</Badge>
            {o.asunto && (
              <span className="text-sm text-ink-2">{o.asunto}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Creada por {o.creado_por?.nombre ?? "—"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={eliminar} disabled={deleteMut.isPending} className="shrink-0 text-red-600">
          <Trash2 size={14} /> {deleteMut.isPending ? "Eliminando…" : "Eliminar"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Columna principal: datos + bitácora */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border border-line p-5">
            <h2 className="mb-4 text-lg font-semibold text-ink">
              Datos de la oportunidad
            </h2>
            <OportunidadForm
              initial={o}
              isPending={updateMut.isPending}
              onCancel={() => router.push("/oportunidades")}
              onSubmit={(values: OportunidadCreate) => updateMut.mutate(values)}
            />
            {updateMut.isSuccess && (
              <p className="mt-2 text-sm font-medium text-green-600">Cambios guardados.</p>
            )}
          </section>

          <Bitacora id={id} comentarios={o.comentarios} />
        </div>

        {/* Columna lateral: adjuntos + relacionados */}
        <div className="space-y-6">
          <Adjuntos oportunidad={o} />
          <Relacionados oportunidadId={id} />
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/oportunidades"
      className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"
    >
      <ArrowLeft size={15} /> Oportunidades
    </Link>
  );
}

function Bitacora({
  id,
  comentarios,
}: {
  id: number;
  comentarios: { fecha: string; texto: string; autor: string | null }[];
}) {
  const comentarioMut = useAgregarComentario(id);
  const eliminarMut = useEliminarComentario(id);
  const confirm = useConfirm();
  const [texto, setTexto] = useState("");
  // Guardamos el índice real en la lista para poder borrarlo (la vista está invertida).
  const ordenados = comentarios.map((c, i) => ({ ...c, indice: i })).reverse();

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    comentarioMut.mutate(texto.trim(), { onSuccess: () => setTexto("") });
  };

  return (
    <section className="rounded-lg border border-line p-5">
      <h2 className="mb-3 text-lg font-semibold text-ink">
        Bitácora de seguimiento
      </h2>
      <form onSubmit={agregar} className="mb-3 flex items-start gap-2">
        <Textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Anotá una llamada, un avance, una respuesta del cliente…"
        />
        <Button type="submit" size="sm" disabled={comentarioMut.isPending || !texto.trim()}>
          <Send size={14} />
        </Button>
      </form>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {ordenados.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-4 text-center text-xs text-ink-3">
            Sin anotaciones todavía.
          </p>
        ) : (
          ordenados.map((c) => (
            <div
              key={c.indice}
              className="group rounded-md border border-line bg-surface p-2 text-sm"
            >
              <div className="mb-0.5 flex items-center justify-between text-[11px] text-ink-3">
                <span>{c.autor ?? "—"}</span>
                <div className="flex items-center gap-2">
                  <span>{new Date(c.fecha).toLocaleString("es-AR")}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Eliminar comentario",
                          message: "¿Eliminar este comentario?",
                          danger: true,
                        })
                      ) {
                        eliminarMut.mutate(c.indice);
                      }
                    }}
                    disabled={eliminarMut.isPending}
                    aria-label="Eliminar comentario"
                    className="text-ink-3 hover:text-red-600"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-ink">{c.texto}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Adjuntos({
  oportunidad,
}: {
  oportunidad: import("@/lib/types").Oportunidad;
}) {
  const subir = useSubirAdjuntosOportunidad(oportunidad.id);
  const eliminar = useEliminarAdjuntoOportunidad(oportunidad.id);
  const [files, setFiles] = useState<File[]>([]);
  const adjuntos = oportunidad.archivos_adjuntos ?? [];

  const onSubir = () => {
    if (files.length === 0) return;
    subir.mutate(files, { onSuccess: () => setFiles([]) });
  };

  return (
    <section className="rounded-lg border border-line p-5">
      <h2 className="mb-3 text-lg font-semibold text-ink">Adjuntos</h2>

      {adjuntos.length === 0 ? (
        <p className="mb-3 text-sm text-ink-3">Sin archivos adjuntos.</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {adjuntos.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-md bg-surface2 px-2.5 py-1.5 text-sm"
            >
              <button
                type="button"
                onClick={() => descargarAdjuntoOportunidad(oportunidad.id, a.id, a.filename)}
                className="flex min-w-0 items-center gap-1.5 text-ink hover:text-accent"
                title="Descargar"
              >
                <Paperclip size={13} className="shrink-0" />
                <span className="truncate">{a.filename}</span>
                <Download size={13} className="shrink-0 text-ink-3" />
              </button>
              <button
                type="button"
                onClick={() => eliminar.mutate(a.id)}
                disabled={eliminar.isPending}
                aria-label="Eliminar adjunto"
                className="shrink-0 text-ink-3 hover:text-red-600"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        id="op-files"
        type="file"
        multiple
        onChange={(e) => {
          const nuevos = Array.from(e.target.files ?? []);
          setFiles((prev) => {
            const clave = (f: File) => `${f.name}:${f.size}`;
            const vistos = new Set(prev.map(clave));
            return [...prev, ...nuevos.filter((f) => !vistos.has(clave(f)))];
          });
          e.target.value = "";
        }}
        className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface2"
      />
      {files.length > 0 && (
        <>
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md bg-surface2 px-2.5 py-1 text-xs text-ink-2"
              >
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="ml-2 shrink-0 text-ink-3 hover:text-red-600"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" onClick={onSubir} disabled={subir.isPending} className="mt-2">
            <Upload size={14} /> {subir.isPending ? "Subiendo…" : `Subir ${files.length}`}
          </Button>
        </>
      )}
    </section>
  );
}

function Relacionados({ oportunidadId }: { oportunidadId: number }) {
  const presupuestos = usePresupuestos(oportunidadId);
  const solicitudes = useSolicitudes(undefined, oportunidadId);
  const mails = useMails(oportunidadId);

  return (
    <section className="rounded-lg border border-line p-5">
      <h2 className="mb-3 text-lg font-semibold text-ink">Relacionados</h2>
      <div className="space-y-4">
        <SubSeccion titulo="Presupuestos" total={presupuestos.data?.length}>
          {(presupuestos.data ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/presupuestos/${p.id}`}
              className="flex items-center justify-between gap-2 rounded-md bg-surface2 px-2.5 py-1.5 text-sm hover:bg-surface2"
            >
              <span className="flex items-center gap-1.5 truncate text-ink">
                <FileText size={13} className="shrink-0 text-ink-3" />
                {p.codigo}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-ink-2">
                  {fmtMonto(p.monto_total, p.moneda)}
                </span>
                <Badge className={ESTADO_PRESUPUESTO[p.estado].color}>
                  {ESTADO_PRESUPUESTO[p.estado].label}
                </Badge>
              </span>
            </Link>
          ))}
        </SubSeccion>

        <SubSeccion titulo="Solicitudes a Compras" total={solicitudes.data?.length}>
          {(solicitudes.data ?? []).map((s) => (
            <Link
              key={s.id}
              href="/solicitudes"
              className="flex items-center justify-between gap-2 rounded-md bg-surface2 px-2.5 py-1.5 text-sm hover:bg-surface2"
            >
              <span className="flex items-center gap-1.5 truncate text-ink">
                <ClipboardList size={13} className="shrink-0 text-ink-3" />
                #{s.id} · {s.requerimiento}
              </span>
              <Badge className={ESTADO_SOLICITUD_META[s.estado].color}>
                {ESTADO_SOLICITUD_META[s.estado].label}
              </Badge>
            </Link>
          ))}
        </SubSeccion>

        <SubSeccion titulo="Mails" total={mails.data?.length}>
          {(mails.data ?? []).map((m) => (
            <Link
              key={m.id}
              href="/bandeja"
              className="flex items-center gap-1.5 truncate rounded-md bg-surface2 px-2.5 py-1.5 text-sm text-ink hover:bg-surface2"
            >
              <Mail size={13} className="shrink-0 text-ink-3" />
              <span className="truncate">{m.asunto || m.de || "(sin asunto)"}</span>
            </Link>
          ))}
        </SubSeccion>
      </div>
    </section>
  );
}

function SubSeccion({
  titulo,
  total,
  children,
}: {
  titulo: string;
  total?: number;
  children: React.ReactNode;
}) {
  const vacio = !total || total === 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
        {total != null && (
          <span className="rounded-full bg-surface2 px-1.5 text-xs font-medium text-ink-2">
            {total}
          </span>
        )}
      </div>
      {vacio ? (
        <p className="text-xs text-ink-3">—</p>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  );
}
