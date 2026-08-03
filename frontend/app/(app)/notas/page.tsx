"use client";

import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  previewNota,
  tituloNota,
  useCrearNota,
  useEliminarNota,
  useGuardarNota,
  useNotas,
  type Nota,
} from "@/lib/notas";
import { cn } from "@/lib/utils";

type Estado = "idle" | "editando" | "guardando" | "guardado";

function grupoDe(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  const dias = (hoy.getTime() - d.getTime()) / 86_400_000;
  if (dias < 7) return "Últimos 7 días";
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

export default function NotasPage() {
  const { data } = useNotas();
  const crear = useCrearNota();
  const guardar = useGuardarNota();
  const eliminar = useEliminarNota();
  const confirm = useConfirm();

  const notas = data ?? [];
  const [selId, setSelId] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<Estado>("idle");
  const ultimoGuardado = useRef("");
  const textoRef = useRef(texto);
  textoRef.current = texto;
  const selRef = useRef(selId);
  selRef.current = selId;

  // Guarda una nota si cambió respecto de lo último persistido.
  const persistir = (id: number, contenido: string) => {
    if (contenido === ultimoGuardado.current) return;
    setEstado("guardando");
    guardar.mutate(
      { id, contenido },
      {
        onSuccess: () => {
          if (selRef.current === id) {
            ultimoGuardado.current = contenido;
            setEstado("guardado");
          }
        },
        onError: () => setEstado("editando"),
      },
    );
  };

  const seleccionar = (id: number) => {
    if (id === selId) return;
    // Flush de la nota actual antes de cambiar.
    if (selId != null) persistir(selId, textoRef.current);
    const n = notas.find((x) => x.id === id);
    setSelId(id);
    setTexto(n?.contenido ?? "");
    ultimoGuardado.current = n?.contenido ?? "";
    setEstado("guardado");
  };

  // Autoselección de la primera nota al cargar.
  useEffect(() => {
    if (selId == null && notas.length) seleccionar(notas[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notas.length]);

  // Autoguardado con debounce (700 ms sin tipear).
  useEffect(() => {
    if (selId == null) return;
    if (texto === ultimoGuardado.current) {
      setEstado((e) => (e === "editando" ? "guardado" : e));
      return;
    }
    setEstado("editando");
    const t = setTimeout(() => persistir(selId, texto), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  // Guarda lo último al salir de la sección.
  useEffect(() => {
    return () => {
      if (selRef.current != null) persistir(selRef.current, textoRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nueva = async () => {
    const n = await crear.mutateAsync();
    setSelId(n.id);
    setTexto("");
    ultimoGuardado.current = "";
    setEstado("guardado");
  };

  const borrar = async (n: Nota) => {
    const ok = await confirm({
      title: "Eliminar nota",
      message: `¿Eliminar "${tituloNota(n.contenido)}"? No se puede deshacer.`,
      danger: true,
    });
    if (!ok) return;
    await eliminar.mutateAsync(n.id);
    if (selId === n.id) {
      const resto = notas.filter((x) => x.id !== n.id);
      setSelId(resto[0]?.id ?? null);
      setTexto(resto[0]?.contenido ?? "");
      ultimoGuardado.current = resto[0]?.contenido ?? "";
    }
  };

  // Agrupa las notas (ya vienen ordenadas por fecha desc) en secciones.
  const grupos: { titulo: string; notas: Nota[] }[] = [];
  for (const n of notas) {
    const g = grupoDe(n.updated_at);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.titulo === g) ultimo.notas.push(n);
    else grupos.push({ titulo: g, notas: [n] });
  }

  const seleccionada = notas.find((n) => n.id === selId) ?? null;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 sm:flex-row">
      {/* Barra izquierda: lista de notas */}
      <aside className="flex w-full shrink-0 flex-col rounded-lg border border-line sm:w-72">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <h1 className="text-sm font-semibold text-ink">Notas</h1>
          <button
            type="button"
            onClick={nueva}
            disabled={crear.isPending}
            className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            <Plus size={13} /> Nueva
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {notas.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-3">
              No tenés notas. Creá una con “Nueva”.
            </p>
          ) : (
            grupos.map((g) => (
              <div key={g.titulo} className="mb-1">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  {g.titulo}
                </p>
                {g.notas.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => seleccionar(n.id)}
                    className={cn(
                      "block w-full border-l-2 px-3 py-2 text-left transition-colors",
                      n.id === selId
                        ? "border-navy bg-surface2"
                        : "border-transparent hover:bg-surface2",
                    )}
                  >
                    <p className="truncate text-sm font-medium text-ink">
                      {tituloNota(n.contenido)}
                    </p>
                    <p className="truncate text-xs text-ink-3">
                      {previewNota(n.contenido) || "Sin texto"}
                    </p>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Editor */}
      <section className="flex flex-1 flex-col rounded-lg border border-line">
        {seleccionada ? (
          <>
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <EstadoGuardado estado={estado} />
              <button
                type="button"
                onClick={() => borrar(seleccionada)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-danger hover:bg-surface2"
              >
                <Trash2 size={13} /> Eliminar
              </button>
            </div>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onBlur={() => selId != null && persistir(selId, texto)}
              placeholder="Escribí acá… se guarda solo."
              spellCheck={false}
              autoFocus
              className="flex-1 resize-none rounded-b-lg bg-surface p-4 font-mono text-sm leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none"
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink-3">
            Elegí una nota de la izquierda o creá una nueva.
          </div>
        )}
      </section>
    </div>
  );
}

function EstadoGuardado({ estado }: { estado: Estado }) {
  if (estado === "guardando") {
    return (
      <span className="flex items-center gap-1 text-xs text-ink-3">
        <Loader2 size={13} className="animate-spin" /> Guardando…
      </span>
    );
  }
  if (estado === "guardado") {
    return (
      <span className="flex items-center gap-1 text-xs text-success">
        <Check size={13} /> Guardado
      </span>
    );
  }
  if (estado === "editando") {
    return <span className="text-xs text-ink-3">Sin guardar…</span>;
  }
  return <span className="text-xs text-ink-3">&nbsp;</span>;
}
