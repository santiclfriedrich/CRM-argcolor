"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  type CampoFormulario,
  rellenarPlanoPdf,
  ubicarCamposIA,
} from "@/lib/config";
import { cn } from "@/lib/utils";

// Worker de pdf.js desde CDN, en la versión exacta del paquete instalado.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Pos = { page: number; x: number; y: number }; // page 0-based; x,y en 0..1
type Item = { id: string; etiqueta: string; valor: string; custom?: boolean };

const ANCHO = 680; // ancho de render del PDF en px
const SIZE_PT = 10; // tamaño del texto estampado, en puntos (debe matchear al PDF)

export function EditorPlano({
  archivo,
  campos,
  onClose,
}: {
  archivo: File;
  campos: CampoFormulario[];
  onClose: () => void;
}) {
  const toast = useToast();
  const fileUrl = useMemo(() => URL.createObjectURL(archivo), [archivo]);
  const [numPages, setNumPages] = useState(0);
  const [pagina, setPagina] = useState(1); // 1-based (UI)
  const [sel, setSel] = useState<string | null>(null); // id del item seleccionado
  const [pos, setPos] = useState<Record<string, Pos>>({}); // posiciones por id
  const [ubicando, setUbicando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [escala, setEscala] = useState(ANCHO / 595.32);
  const [nuevoTexto, setNuevoTexto] = useState("");
  // Campos del perfil + los textos extra que agregue el usuario.
  const [items, setItems] = useState<Item[]>(() =>
    campos.map((c, i) => ({ id: `p${i}`, etiqueta: c.etiqueta, valor: c.valor }))
  );
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const up = () => setArrastrando(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", key);
    };
  }, []);

  const fraccion = (e: { clientX: number; clientY: number }) => {
    const el = pageRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
    };
  };

  // Clic en un espacio vacío: ubica el dato seleccionado.
  const colocarEnClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (arrastrando !== null || sel === null) return;
    const { x, y } = fraccion(e);
    setPos((p) => ({ ...p, [sel]: { page: pagina - 1, x, y } }));
    // Avanza al próximo dato sin ubicar, para ir rápido.
    const idx = items.findIndex((it) => it.id === sel);
    const sig = items.find((it, j) => j > idx && pos[it.id] === undefined);
    setSel(sig ? sig.id : null);
  };

  const moverArrastrando = (e: React.MouseEvent<HTMLDivElement>) => {
    if (arrastrando === null) return;
    const { x, y } = fraccion(e);
    setPos((p) => ({ ...p, [arrastrando]: { page: pagina - 1, x, y } }));
  };

  const quitarPos = (id: string) =>
    setPos((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });

  const agregarTexto = () => {
    const t = nuevoTexto.trim();
    if (!t) return;
    const id = `c${Date.now()}`;
    setItems((prev) => [...prev, { id, etiqueta: t, valor: t, custom: true }]);
    setNuevoTexto("");
    setSel(id); // queda seleccionado para ubicarlo de una
  };

  const borrarItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    quitarPos(id);
    if (sel === id) setSel(null);
  };

  const ubicarConIA = async () => {
    setUbicando(true);
    try {
      const res = await ubicarCamposIA(
        archivo,
        items.map((c) => c.etiqueta)
      );
      const porEtiqueta = new Map(
        res.map((r) => [r.etiqueta.trim().toLowerCase(), r])
      );
      setPos((prev) => {
        const next = { ...prev };
        items.forEach((c) => {
          const r = porEtiqueta.get(c.etiqueta.trim().toLowerCase());
          // Descarta posiciones inválidas (0,0 o fuera de rango).
          if (r && r.x > 0 && r.x < 1 && r.y > 0 && r.y < 1) {
            next[c.id] = { page: r.page ?? 0, x: r.x, y: r.y };
          }
        });
        return next;
      });
      toast.toast("La IA ubicó los campos; revisá y corregí con un clic", "success");
    } catch {
      toast.toast("No se pudo ubicar con IA (¿cuota/Gemini?)", "error");
    } finally {
      setUbicando(false);
    }
  };

  const descargar = async () => {
    const posiciones = items
      .filter((it) => pos[it.id] && it.valor)
      .map((it) => ({ ...pos[it.id], valor: it.valor, size: SIZE_PT }));
    if (posiciones.length === 0) {
      toast.toast("Ubicá al menos un dato antes de descargar", "info");
      return;
    }
    setDescargando(true);
    try {
      await rellenarPlanoPdf(archivo, posiciones);
    } catch {
      toast.toast("No se pudo generar el PDF", "error");
    } finally {
      setDescargando(false);
    }
  };

  const ubicados = Object.keys(pos).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
      <div className="flex min-h-0 flex-1 flex-col bg-surface md:m-4 md:rounded-xl md:border md:border-line">
        {/* Barra superior */}
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <p className="truncate text-sm font-semibold text-ink">
            Ubicar campos · {archivo.name}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={ubicarConIA} disabled={ubicando}>
              <Sparkles size={15} /> {ubicando ? "Ubicando…" : "Ubicar con IA"}
            </Button>
            <Button size="sm" onClick={descargar} disabled={descargando}>
              <Download size={15} /> {descargando ? "Generando…" : "Descargar completo"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-ink-2 transition hover:bg-surface2"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Lista de datos */}
          <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-line p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
              Datos ({ubicados}/{items.length} ubicados)
            </p>
            <div className="flex flex-col gap-1">
              {items.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition",
                    sel === c.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line text-ink hover:bg-surface2"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSel((s) => (s === c.id ? null : c.id))}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        pos[c.id]
                          ? "border-success bg-success text-white"
                          : "border-line"
                      )}
                    >
                      {pos[c.id] && <Check size={11} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.etiqueta}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {c.valor || "—"}
                      </span>
                    </span>
                  </button>
                  {/* Quitar la ubicación (si está puesto) o borrar el texto extra. */}
                  {pos[c.id] ? (
                    <button
                      type="button"
                      onClick={() => quitarPos(c.id)}
                      title="Quitar del formulario"
                      className="shrink-0 rounded p-0.5 text-ink-3 transition hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  ) : c.custom ? (
                    <button
                      type="button"
                      onClick={() => borrarItem(c.id)}
                      title="Borrar este texto"
                      className="shrink-0 rounded p-0.5 text-ink-3 transition hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Agregar un texto nuevo (además de los datos del perfil). */}
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1.5 text-xs font-semibold text-ink">Agregar texto</p>
              <div className="flex gap-1.5">
                <Input
                  value={nuevoTexto}
                  onChange={(e) => setNuevoTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") agregarTexto();
                  }}
                  placeholder="Texto a agregar"
                  className="h-9"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={agregarTexto}
                  disabled={!nuevoTexto.trim()}
                >
                  <Plus size={15} />
                </Button>
              </div>
            </div>

            <p className="mt-3 text-xs text-ink-3">
              Elegí un dato y hacé clic en el formulario donde va. Arrastrá para
              moverlo; la ✕ lo quita. Esc deselecciona.
            </p>
          </aside>

          {/* Visor del PDF */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-center gap-3 border-b border-line py-2">
              <button
                type="button"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="rounded-md p-1.5 text-ink-2 transition hover:bg-surface2 disabled:opacity-40"
                aria-label="Página anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-ink-2">
                Página {pagina} de {numPages || "…"}
              </span>
              <button
                type="button"
                onClick={() => setPagina((p) => Math.min(numPages, p + 1))}
                disabled={pagina >= numPages}
                className="rounded-md p-1.5 text-ink-2 transition hover:bg-surface2 disabled:opacity-40"
                aria-label="Página siguiente"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-surface2/40 p-4">
              <div className="mx-auto" style={{ width: ANCHO }}>
                <Document
                  file={fileUrl}
                  onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                  loading={<p className="p-6 text-center text-sm text-ink-2">Cargando PDF…</p>}
                  error={<p className="p-6 text-center text-sm text-danger">No se pudo abrir el PDF.</p>}
                >
                  <div
                    ref={pageRef}
                    className={cn(
                      "relative shadow-soft",
                      sel !== null ? "cursor-crosshair" : "cursor-default"
                    )}
                    onClick={colocarEnClick}
                    onMouseMove={moverArrastrando}
                  >
                    <Page
                      pageNumber={pagina}
                      width={ANCHO}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      onLoadSuccess={(page) =>
                        setEscala(ANCHO / (page.originalWidth || 595.32))
                      }
                    />
                    {/* Marcadores de la página actual (negro, como el documento). */}
                    {items.map((c) => {
                      const p = pos[c.id];
                      if (!p || p.page !== pagina - 1) return null;
                      const activo = sel === c.id;
                      return (
                        <span
                          key={`m-${c.id}`}
                          title="Arrastrá para mover"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setSel(c.id);
                            setArrastrando(c.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "group absolute cursor-move whitespace-nowrap font-sans leading-none text-black",
                            activo
                              ? "bg-accent/15 outline outline-1 outline-accent"
                              : "bg-white/50 hover:outline hover:outline-1 hover:outline-accent/60"
                          )}
                          style={{
                            left: `${p.x * 100}%`,
                            top: `${p.y * 100}%`,
                            fontSize: `${SIZE_PT * escala}px`,
                          }}
                        >
                          {c.valor || c.etiqueta}
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              quitarPos(c.id);
                            }}
                            title="Quitar"
                            className="absolute -right-2 -top-2 hidden h-4 w-4 items-center justify-center rounded-full bg-danger text-white group-hover:flex"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </Document>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
