// Pronóstico de ingresos por método Monte Carlo.
//
// En vez de una sola cifra, simulamos N escenarios: en cada uno, cada
// oportunidad ABIERTA "se gana" con probabilidad = tasa de conversión histórica
// (ganadas / (ganadas + perdidas)). Sumamos los montos ganados de ese escenario
// y, sobre las N corridas, armamos la distribución de ingresos posibles.

export type ForecastMC = {
  media: number; // ingreso esperado (promedio)
  p50: number; // mediana
  pBajo: number; // extremo inferior de la banda central (p.ej. 15%)
  pAlto: number; // extremo superior (p.ej. 85%)
  min: number;
  max: number;
  // Histograma para graficar: cada barra con su rango [x0, x1] y cuántos
  // escenarios cayeron ahí.
  barras: { x0: number; x1: number; count: number }[];
  iteraciones: number;
};

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 0) return 0;
  const i = Math.min(ordenados.length - 1, Math.floor(p * ordenados.length));
  return ordenados[i];
}

export function simularForecast(
  valores: number[],
  tasaConversion: number,
  opts: { iteraciones?: number; bins?: number; banda?: number } = {}
): ForecastMC {
  const iteraciones = opts.iteraciones ?? 4000;
  const bins = opts.bins ?? 22;
  const banda = opts.banda ?? 0.7; // banda central (70%)
  const p = Math.min(Math.max(tasaConversion, 0), 1);

  const totales = new Array<number>(iteraciones);
  for (let i = 0; i < iteraciones; i++) {
    let suma = 0;
    for (const v of valores) {
      if (Math.random() < p) suma += v;
    }
    totales[i] = suma;
  }
  totales.sort((a, b) => a - b);

  const media = totales.reduce((a, b) => a + b, 0) / iteraciones;
  const min = totales[0];
  const max = totales[iteraciones - 1];
  const resto = (1 - banda) / 2;

  // Histograma.
  const barras: { x0: number; x1: number; count: number }[] = [];
  const ancho = (max - min) / bins || 1;
  for (let b = 0; b < bins; b++) {
    barras.push({ x0: min + b * ancho, x1: min + (b + 1) * ancho, count: 0 });
  }
  for (const t of totales) {
    let idx = Math.floor((t - min) / ancho);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    barras[idx].count++;
  }

  return {
    media,
    p50: percentil(totales, 0.5),
    pBajo: percentil(totales, resto),
    pAlto: percentil(totales, 1 - resto),
    min,
    max,
    barras,
    iteraciones,
  };
}
