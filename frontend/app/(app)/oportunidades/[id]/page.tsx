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

  if (isLoading) return <p className="text-slate-500 dark:text-slate-400">Cargando…</p>;
  if (isError || !o) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-red-600">No se pudo cargar la oportunidad.</p>
      </div>
    );
  }

  const cliente = o.cliente?.razon_social ?? `#${o.id}`;

  const eliminar = () => {
    if (
      window.confirm(
        `¿Eliminar la oportunidad de ${cliente}? Se borra todo lo asociado (mails, ` +
          `solicitudes, presupuestos). No se puede deshacer.`,
      )
    ) {
      deleteMut.mutate(o.id, { onSuccess: () => router.push("/oportunidades") });
    }
  };

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {cliente} <span className="text-slate-400">· #{o.id}</span>
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge className={ESTADO_META[o.estado].color}>{ESTADO_META[o.estado].label}</Badge>
            {o.asunto && (
              <span className="text-sm text-slate-500 dark:text-slate-400">{o.asunto}</span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={eliminar} disabled={deleteMut.isPending} className="shrink-0 text-red-600">
          <Trash2 size={14} /> {deleteMut.isPending ? "Eliminando…" : "Eliminar"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Columna principal: datos + bitácora */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
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
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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
  const [texto, setTexto] = useState("");
  // Guardamos el índice real en la lista para poder borrarlo (la vista está invertida).
  const ordenados = comentarios.map((c, i) => ({ ...c, indice: i })).reverse();

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    comentarioMut.mutate(texto.trim(), { onSuccess: () => setTexto("") });
  };

  return (
    <section className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
      <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
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
          <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
            Sin anotaciones todavía.
          </p>
        ) : (
          ordenados.map((c) => (
            <div
              key={c.indice}
              className="group rounded-md border border-slate-200 bg-white p-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-0.5 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                <span>{c.autor ?? "—"}</span>
                <div className="flex items-center gap-2">
                  <span>{new Date(c.fecha).toLocaleString("es-AR")}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("¿Eliminar este comentario?")) {
                        eliminarMut.mutate(c.indice);
                      }
                    }}
                    disabled={eliminarMut.isPending}
                    aria-label="Eliminar comentario"
                    className="text-slate-300 hover:text-red-600 dark:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{c.texto}</p>
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
    <section className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
      <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">Adjuntos</h2>

      {adjuntos.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">Sin archivos adjuntos.</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {adjuntos.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm dark:bg-slate-800/50"
            >
              <button
                type="button"
                onClick={() => descargarAdjuntoOportunidad(oportunidad.id, a.id, a.filename)}
                className="flex min-w-0 items-center gap-1.5 text-slate-700 hover:text-brand dark:text-slate-200"
                title="Descargar"
              >
                <Paperclip size={13} className="shrink-0" />
                <span className="truncate">{a.filename}</span>
                <Download size={13} className="shrink-0 text-slate-400" />
              </button>
              <button
                type="button"
                onClick={() => eliminar.mutate(a.id)}
                disabled={eliminar.isPending}
                aria-label="Eliminar adjunto"
                className="shrink-0 text-slate-400 hover:text-red-600"
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
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
      />
      {files.length > 0 && (
        <>
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300"
              >
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="ml-2 shrink-0 text-slate-400 hover:text-red-600"
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
    <section className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
      <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">Relacionados</h2>
      <div className="space-y-4">
        <SubSeccion titulo="Presupuestos" total={presupuestos.data?.length}>
          {(presupuestos.data ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/presupuestos/${p.id}`}
              className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800"
            >
              <span className="flex items-center gap-1.5 truncate text-slate-700 dark:text-slate-200">
                <FileText size={13} className="shrink-0 text-slate-400" />
                {p.codigo}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
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
              className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800"
            >
              <span className="flex items-center gap-1.5 truncate text-slate-700 dark:text-slate-200">
                <ClipboardList size={13} className="shrink-0 text-slate-400" />
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
              className="flex items-center gap-1.5 truncate rounded-md bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Mail size={13} className="shrink-0 text-slate-400" />
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
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{titulo}</h3>
        {total != null && (
          <span className="rounded-full bg-slate-100 px-1.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {total}
          </span>
        )}
      </div>
      {vacio ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">—</p>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  );
}
