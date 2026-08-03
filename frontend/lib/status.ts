// Fuente única de la paleta de estados para usos JS/SVG (rellenos del donut,
// puntos de leyenda) donde no llega una clase de Tailwind. Los valores de
// TEXTO/BADGE viven como tokens CSS en globals.css (text-success, bg-danger/12…);
// esta paleta es el set VÍVIDO pensado como relleno, que lee bien en ambos temas.
export const STATUS = {
  success: "#3cb178", // verde  — abierto / al día / con actividad
  info: "#4586da", //    azul   — ganado / informativo
  warning: "#eca62f", // ámbar  — atención / esperando
  danger: "#e7644a", //  rojo   — perdido / vencido
  neutral: "#6d7495", // gris   — dormido / sin actividad
} as const;

export type StatusKey = keyof typeof STATUS;

// Fondo tenue a partir de un hex (para chips/leyendas). hex -> rgba(a).
export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
