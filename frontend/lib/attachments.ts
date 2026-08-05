import { useEffect, useMemo, type ClipboardEvent } from "react";

// Extrae las imágenes de un evento de pegado (Ctrl/Cmd+V). Las capturas suelen
// venir como "image.png" sin nombre útil → les damos uno único.
export function imagenesPegadas(e: ClipboardEvent<Element>): File[] {
  return Array.from(e.clipboardData.items)
    .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
    .map((it) => it.getAsFile())
    .filter((f): f is File => f != null)
    .map((f) => {
      const ext = f.type.split("/")[1] || "png";
      const nombre =
        f.name && f.name !== "image.png" ? f.name : `pegado-${Date.now()}.${ext}`;
      return new File([f], nombre, { type: f.type });
    });
}

// Suma archivos nuevos a los existentes evitando duplicados (por nombre+tamaño).
export function sumarSinDuplicados(prev: File[], nuevos: File[]): File[] {
  const clave = (f: File) => `${f.name}:${f.size}`;
  const vistos = new Set(prev.map(clave));
  return [...prev, ...nuevos.filter((f) => !vistos.has(clave(f)))];
}

// Object URLs de preview para los adjuntos que son imágenes; se liberan al
// cambiar la lista o al desmontar. Devuelve un array alineado con `files`
// (null en las posiciones que no son imagen).
export function useImagePreviews(files: File[]): (string | null)[] {
  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)),
    [files],
  );
  useEffect(() => {
    return () => previews.forEach((u) => u && URL.revokeObjectURL(u));
  }, [previews]);
  return previews;
}
