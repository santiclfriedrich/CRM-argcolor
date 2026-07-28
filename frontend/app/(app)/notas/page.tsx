"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useGuardarNota, useNota } from "@/lib/notas";

type Estado = "idle" | "editando" | "guardando" | "guardado";

export default function NotasPage() {
  const { data, isLoading } = useNota();
  const guardar = useGuardarNota();
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<Estado>("idle");
  const cargado = useRef(false);
  const ultimoGuardado = useRef("");
  // Ref siempre con el último valor, para el guardado al desmontar.
  const textoRef = useRef(texto);
  textoRef.current = texto;

  // Carga el contenido inicial una sola vez.
  useEffect(() => {
    if (!cargado.current && data) {
      setTexto(data.contenido ?? "");
      ultimoGuardado.current = data.contenido ?? "";
      cargado.current = true;
    }
  }, [data]);

  // Guarda (upsert) y marca el estado. Se usa en el debounce y al salir.
  const persistir = (valor: string) => {
    if (valor === ultimoGuardado.current) return;
    setEstado("guardando");
    guardar.mutate(valor, {
      onSuccess: () => {
        ultimoGuardado.current = valor;
        setEstado("guardado");
      },
      onError: () => setEstado("editando"),
    });
  };

  // Autoguardado con debounce (700 ms sin tipear).
  useEffect(() => {
    if (!cargado.current) return;
    if (texto === ultimoGuardado.current) {
      setEstado((e) => (e === "editando" ? "guardado" : e));
      return;
    }
    setEstado("editando");
    const t = setTimeout(() => persistir(texto), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  // Al desmontar (salir de la sección), guarda lo último por las dudas.
  useEffect(() => {
    return () => {
      if (cargado.current) persistir(textoRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-white">
            📝
          </span>
          <h1 className="text-xl font-bold text-ink">Notas</h1>
        </div>
        <EstadoGuardado estado={estado} />
      </div>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => persistir(texto)}
        disabled={isLoading}
        placeholder="Escribí acá lo que quieras… se guarda solo."
        spellCheck={false}
        className="flex-1 resize-none rounded-lg border border-line bg-surface p-4 font-mono text-sm leading-relaxed text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
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
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
        <Check size={13} /> Guardado
      </span>
    );
  }
  if (estado === "editando") {
    return <span className="text-xs text-ink-3">Sin guardar…</span>;
  }
  return null;
}
