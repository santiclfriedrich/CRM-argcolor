---
name: CRM Comercial ARG COLOR
description: Instrumento comercial interno — cromo violeta, dato calibrado, acción en verde.
colors:
  bg: "#eef2f7"
  surface: "#ffffff"
  surface-2: "#f8fafc"
  surface-3: "#f1f5f9"
  line: "#b4bece"
  ink: "#0f172a"
  ink-2: "#64748b"
  ink-3: "#94a3b8"
  accent: "#5813c1"
  accent-hover: "#460f9b"
  accent-dim: "rgba(88, 19, 193, 0.1)"
  chrome: "#250c50"
  chrome-hover: "#4c1d95"
  brand: "#4e8d63"
  brand-hover: "#3f7452"
  muted: "#6d7495"
  success: "#158057"
  warning: "#b06f08"
  danger: "#c73e2a"
  info: "#2a6cbe"
  neutral: "#5a607a"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 2rem
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.75rem
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25rem
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.25rem
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1rem
    letterSpacing: "0.14em"
  meta:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1rem
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    height: "40px"
    padding: "0 16px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    height: "40px"
    padding: "0 16px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.xl}"
    height: "40px"
    padding: "0 16px"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.xl}"
    height: "40px"
    padding: "0 16px"
  button-danger:
    backgroundColor: "#dc2626"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    height: "40px"
    padding: "0 16px"
  button-icon:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.full}"
    height: "36px"
    width: "36px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    height: "44px"
    padding: "0 14px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
  card-cta:
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
    padding: "8px 20px"
    typography: "{typography.title}"
  badge:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    typography: "{typography.meta}"
  ref-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "4px 8px"
    typography: "{typography.meta}"
  nav-item:
    textColor: "rgba(255, 255, 255, 0.6)"
    height: "56px"
    padding: "0 12px"
    typography: "{typography.title}"
  table-cell:
    textColor: "{colors.ink}"
    padding: "8px 12px"
    typography: "{typography.body}"
---

# Design System: CRM Comercial ARG COLOR

## Overview

**Creative North Star: "El instrumento comercial"**

Un instrumento de medición industrial, no un producto de software. La carcasa es violeta profundo y no cambia nunca; adentro, la lectura está calibrada: rótulos en mono con versalitas, cifras alineadas por dígito, campos que dicen exactamente lo que contienen. La metáfora ya vivía en el código antes de escribirse — el comentario del `Kicker` en `card.tsx` la nombra literalmente — y este documento la formaliza.

El sistema es sólido y confiable con algo de calidez. Sólido porque hay gente trabajando ocho horas por día acá y la herramienta tiene que sentirse seria: bordes definidos, jerarquía explícita, superficies con peso. Cálido porque no quiere ser el ERP que vino a reemplazar: radios de 16px en las cards, sombras suaves teñidas de azul, chips redondeados en vez de celdas cuadradas. La tensión entre esas dos cosas es el sistema.

Dos anti-referencias confirmadas. **No es un ERP viejo**: nada de grillas grises apretadas, bordes duros en todas las direcciones ni iconografía de los 2000 — es precisamente lo que GBP hace y lo que el CRM existe para reemplazar. **No es una app de consumo**: sin ilustraciones, sin gradientes decorativos, sin emojis, sin tono publicitario. Nadie tiene que ser convencido de usar esto; ya es su trabajo. El único gesto atmosférico permitido es el que ya existe: un radial-gradient de tinte de marca en la esquina superior derecha del `body`, casi imperceptible, para que el fondo no se sienta muerto.

**Key Characteristics:**
- Dos temas de primera clase (claro y oscuro), resueltos por tokens semánticos, no por overrides
- El violeta identifica, el verde acciona — nunca al revés
- El borde estructura; la sombra apenas separa
- Rótulos en mono con versalitas como firma tipográfica
- Densidad de tabla real: miles de filas, virtualizadas, con columnas ajustables

## Colors

Una paleta fría de grises azulados sobre la que se apoyan exactamente dos colores fuertes con trabajos distintos, más un semáforo de estado de cinco tonos. Todo se define como custom properties en `app/globals.css` y se expone a Tailwind por nombre semántico; el modo oscuro redefine los mismos tokens en `.dark`, así que ningún componente conoce el tema.

### Primary

- **Violeta Instrumento** (`{colors.accent}`): el acento de identidad. Links, valores clicables en tablas, foco de campos, switches activos, el CTA de pie de card. En oscuro sube a `#a37cff` para leer sobre el fondo casi negro. Su versión al 10% (`accent-dim`) es el único relleno tintado que usa el acento.
- **Violeta Carcasa** (`{colors.chrome}`): violet-950, el cromo estructural. Navbar, To-Do bar, tooltips, fondo del login, checkboxes. **Valor fijo en ambos temas** — es la única constante cromática del sistema. El token se llama `--c-navy` por historia; ya no es navy y el nombre miente.

### Secondary

- **Verde Acción** (`{colors.brand}`): exclusivamente botones primarios. Guardar, confirmar, enviar. En oscuro sube a `#5aa376`. No es un color de identidad ni de estado: es la respuesta a "¿qué hago acá?".

### Tertiary

El semáforo comercial: **Verde Al Día** (`{colors.success}`), **Ámbar Esperando** (`{colors.warning}`), **Rojo Vencido** (`{colors.danger}`), **Azul Ganado** (`{colors.info}`), **Gris Dormido** (`{colors.neutral}`). Afinados para contraste de **texto** sobre superficie clara, en tripletes RGB para admitir modificadores de opacidad (`bg-warning/12`). Los rellenos de gráficos usan una paleta paralela más vívida en `lib/status.ts` (`#3cb178`, `#4586da`, `#eca62f`, `#e7644a`, `#6d7495`) porque un color legible como texto se ve apagado como área.

### Neutral

- **Niebla** (`{colors.bg}`): el fondo de la app. Nunca blanco puro — las superficies necesitan tener contra qué recortarse.
- **Papel** (`{colors.surface}`), **Papel Tenue** (`{colors.surface-2}`), **Papel Hundido** (`{colors.surface-3}`): las tres capas de superficie. Cards y campos en Papel; encabezados de tabla y hovers en Papel Tenue; pistas de switch y estados presionados en Papel Hundido.
- **Trazo** (`{colors.line}`): el borde de todo. Un gris azulado con peso real (no un `slate-200` fantasma), porque es el que arma la retícula. En oscuro pasa a `rgba(255,255,255,0.17)`.
- **Tinta** (`{colors.ink}`), **Tinta Media** (`{colors.ink-2}`), **Tinta Tenue** (`{colors.ink-3}`): la escala de texto. Dato / etiqueta y prosa secundaria / placeholders y metadatos.
- **Neutro Frío** (`{colors.muted}`): estados dormidos y metadatos. Fijo en ambos temas.

### Named Rules

**La Regla de los Dos Trabajos.** El violeta dice *dónde estás*; el verde dice *qué hacés*. Un botón que guarda es verde aunque esté dentro de un panel violeta. Un link es violeta aunque sea la acción más importante de la pantalla. Nunca se intercambian y nunca aparecen juntos en el mismo control.

**La Regla del Semáforo Cerrado.** Los cinco colores de estado se usan **solo** para estado. Un ámbar nunca decora un encabezado, un rojo nunca marca un botón de borrar (para eso está `button-danger` en rojo-600, que es otro color a propósito). Si un color de estado aparece fuera de un badge, un punto o un relleno de gráfico, está mal.

**La Regla de la Carcasa Fija.** `chrome` no cambia entre temas. Es lo que hace que la app se reconozca a la distancia en cualquiera de los dos modos.

## Typography

**Display / Body Font:** Plus Jakarta Sans (fallback `system-ui`, `sans-serif`)
**Label / Mono Font:** JetBrains Mono (fallback `ui-monospace`, `monospace`)

Ambas self-hosted por `next/font/google` en su versión variable — sin CDN externo, un archivo por familia. Se exponen como `--font-sans` y `--font-mono`.

**Character:** Plus Jakarta es una grotesca geométrica con terminaciones suaves: seria sin ser fría, es lo que aporta la calidez del sistema sin recurrir a un color. JetBrains Mono no aparece como fuente de código sino como **fuente de instrumento** — la usa el `Kicker` en 11px, versalitas y `tracking` de 0.14em, y es la firma que convierte un rótulo cualquiera en la etiqueta de un panel de control.

### Hierarchy

- **Display** (700, 24px/32px, tracking -0.025em): títulos de página. Uno solo por pantalla, arriba a la izquierda.
- **Headline** (700, 18px/28px): títulos de modal. Centrados, sobre un borde inferior.
- **Title** (600, 14px/20px): labels de formulario, encabezados de tabla, ítems de navegación, texto de botón.
- **Body** (400, 14px/20px): el texto de trabajo. Celdas, párrafos, valores.
- **Meta** (400, 12px/16px): metadatos, badges, chips de referencia, texto de ayuda.
- **Label** (JetBrains Mono, 11px, versalitas, tracking 0.14em, color `ink-3`): kickers de card, rótulos de dato, encabezados de columna cuando se quiere firma.

### Named Rules

**La Regla del Dígito Alineado.** Todo número que se compare en vertical lleva `tabular-nums`: CUIT, números de cliente, importes, cantidades. Una columna de cifras que baila es un error de lectura, no de estética.

**La Regla del Mono Rotulado.** JetBrains Mono nunca compone texto corrido. Solo rotula: versalitas, tamaño chico, tracking abierto. Si aparece en una oración, está mal usado.

**La Regla del Título Único.** Un solo Display por pantalla. Las secciones de segundo nivel se separan con Kickers en mono, no con más peso tipográfico.

## Layout

**Shell de alto fijo.** `h-screen` con `overflow-hidden`: el navbar de 56px queda arriba, la To-Do bar fija abajo, y **solo scrollea el `<main>`**. Nunca hay scroll de página completa. El `<main>` reserva `pb-14` para que la barra inferior no tape el contenido.

**Sin contenedor de ancho máximo.** El contenido ocupa el ancho disponible con padding lateral progresivo: 16px en mobile, 24px desde `sm`, 32px desde `lg`, y 24px verticales. La decisión es deliberada: las tablas de listado son el centro del producto y un `max-w` desperdiciaría el monitor grande. La contrapartida es que el diseño tiene que sobrevivir tanto a 1280px como a 2560px.

**Anchos de pantalla que conviven.** Notebook de 13–14" y monitor grande son ambos escena de uso real. Ninguna decisión de layout puede asumir ancho: las tablas anchas se resuelven con columnas ajustables (`useResizableColumns`) y `truncate` en cada celda, no con scroll horizontal de página.

**Navegación por breakpoint.** El nav horizontal aparece desde `lg`; por debajo colapsa a un menú hamburguesa desplegable. El buscador global se oculta bajo `sm` y crece de 176px a 224px desde `xl`.

**Ritmo de espaciado.** Escala de 4px. Los gaps de fila son 6/8/12px; el padding de celda de tabla es 8px vertical × 12px horizontal; el padding interno de modal es 20px × 16px. Las tablas grandes son densas a propósito y no siguen el ritmo generoso de las cards.

**Tablas virtualizadas.** Los listados de miles de filas usan `@tanstack/react-virtual` con filas espaciadoras arriba y abajo. Encabezados `sticky` con `shadow-[inset_0_-1px_0_var(--c-line)]` en vez de `border-bottom`, porque el borde de un `th` sticky no se pinta de forma confiable al scrollear.

### Named Rules

**La Regla del Único Scroll.** Solo scrollea `<main>`. Cualquier panel que introduzca un segundo eje de scroll vertical en la página está peleando con el shell.

**La Regla de la Celda Truncada.** Toda celda de tabla trunca. El ancho lo decide el usuario arrastrando la columna, no el contenido más largo del dataset.

## Elevation & Depth

**El borde estructura; la sombra apenas separa.** La retícula entera la arma `line`: cards, campos, celdas, paneles y separadores. La sombra es ambiental, no jerárquica — su trabajo es despegar levemente una superficie del fondo, no comunicar importancia. En modo oscuro la sombra prácticamente desaparece y el sistema sigue leyéndose igual, lo cual confirma que el borde es el que sostiene.

Hay una excepción y es correcta: los modales suman `ring-1 ring-line` sobre un backdrop `bg-black/50`. Ahí la profundidad sí es estructural, porque hay que comunicar modalidad.

### Shadow Vocabulary

- **soft** (`box-shadow: 0 1px 2px rgba(3,35,77,0.04), 0 10px 24px -14px rgba(3,35,77,0.22)`): la sombra por defecto de cards y modales. Teñida de azul profundo, no de negro — una sombra negra sobre un fondo azulado se ve sucia.
- **pop** (`box-shadow: 0 1px 2px rgba(113,24,247,0.15), 0 8px 20px -8px rgba(113,24,247,0.35)`): teñida de violeta, para elementos que deben sentirse energizados. Uso deliberadamente escaso.
- **To-Do bar** (`box-shadow: 0 -4px 12px rgba(0,0,0,0.08)`): sombra hacia arriba, la única del sistema con dirección invertida, porque el panel crece desde el borde inferior.

### Named Rules

**La Regla de la Sombra Teñida.** Ninguna sombra usa negro puro. Toda sombra toma el tono de la superficie sobre la que cae — azul para el chrome general, violeta para lo energizado.

**La Regla del Borde Primero.** Si dudás entre agregar una sombra o un borde para separar dos superficies, es un borde. La sombra ya está saturada de trabajo.

## Shapes

Lenguaje de esquinas redondeadas y generosas, con una escala de cuatro pasos que codifica jerarquía por tamaño de radio:

- **16px** (`rounded-2xl`) — contenedores: cards, modales, el marco de las tablas. Es el radio que aporta la calidez del sistema.
- **12px** (`rounded-xl`) — controles: botones, inputs, textareas, triggers de select. El paso intermedio; lo suficientemente redondo para sentirse pulsable, lo suficientemente contenido para alinearse en una fila de formulario.
- **8px** (`rounded-lg`) — elementos pequeños: chips de referencia, tooltips, paneles de dropdown.
- **6px** (`rounded-md`) — utilitarios: ítems de menú mobile, botones de icono en el navbar.
- **Píldora** (`rounded-full`) — todo lo que representa un valor discreto y no un contenedor: badges de estado, botones de solo-icono (36×36, "estilo Pipedrive" según el código), pistas de switch, el CTA de pie de card, contadores.

Bordes de 1px, siempre `line`, nunca más gruesos. No hay clipping, ni formas irregulares, ni geometría decorativa: la única silueta no rectangular del sistema es la píldora.

### Named Rules

**La Regla de la Píldora Semántica.** El radio completo significa "esto es un valor, no un contenedor". Un badge es píldora; una card nunca. Un botón de icono es círculo; un botón con texto es 12px.

## Components

### Buttons

Generosos y táctiles. Cinco variantes, tres tamaños.

- **Shape:** 12px (`rounded-xl`). Los de solo icono son círculos de 36×36px.
- **Tamaños:** `sm` 32px de alto / texto 12px · `md` 40px / 14px (default) · `icon` 36×36px.
- **Primary:** verde acción sobre blanco, con `shadow-sm`. Es el único control verde del sistema.
- **Secondary:** `surface-2` con tinta plena; hover a `surface-3`.
- **Outline:** superficie con borde `line` y tinta media; el botón de acción neutra por defecto en barras de herramientas.
- **Ghost:** solo tinta media, hover a `surface-2`. Para acciones terciarias e iconos.
- **Danger:** rojo-600 con hover a rojo-700. Deliberadamente **no** usa el token `danger` del semáforo: el estado y la acción destructiva son cosas distintas.
- **Focus:** `ring-2` de `brand/40` con `ring-offset-2` sobre `surface`. El offset importa — sin él el anillo se pega al botón y se lee como un borde.
- **Active:** `translate-y-px`. Un solo píxel de hundimiento; es todo el feedback táctil que el sistema necesita.
- **Disabled:** `opacity-50` y `pointer-events-none`.

### Inputs / Fields

- **Style:** 44px de alto, 12px de radio, superficie blanca con borde `line`, padding lateral de 14px, texto 14px. Los textareas comparten todo menos el alto fijo.
- **Focus:** el borde pasa a `accent` **y** aparece `ring-2` de `accent/30`. Los dos a la vez: el borde confirma el campo, el anillo lo encuentra de un vistazo.
- **Placeholder:** `ink-3`.
- **Error:** borde `red-400` con `ring-red-400/40`.
- **Disabled:** `opacity-50` y cursor no permitido.
- **Labels:** 14px semibold en tinta plena, 4px de aire por debajo.

### Select (SelectMenu)

Desplegable propio, no el `<select>` nativo del sistema operativo — para que el control tenga los mismos 44px, el mismo radio y el mismo tratamiento de foco que un input. Trigger con chevron a la derecha, panel con el ítem seleccionado marcado por un check. Abierto se trata como enfocado (`border-accent` + `ring-accent/30`).

### Cards / Containers

- **Corner Style:** 16px.
- **Background:** `surface`, borde `line`, sombra `soft`.
- **Kicker:** micro-etiqueta en mono/versalitas (11px, tracking 0.14em, `ink-3`) — la firma del instrumento.
- **CardCta:** píldora de pie de card con borde `ink-3` y texto violeta; en hover el borde pasa a `accent` y el fondo a `accent-dim`.

### Badges

Píldora con **tinte del propio color al 12% y texto del mismo color**. Seis tonos: `default` (superficie tenue + tinta media) y los cinco del semáforo. Nunca color pleno de fondo: un badge tiene que leerse dentro de una fila densa sin gritar.

### RefChip

Chip de referencia a otra entidad — cuenta, persona, oportunidad. Rectángulo de 8px con borde `line`, superficie blanca, icono opcional de 12px y texto truncado de 12px. Es lo que distingue "un dato" de "un link a otro registro", y aparece en tablas, detalles y modales.

### Navigation

Barra superior de 56px sobre `chrome`, `sticky` con `z-30`. El logo va monocromo en blanco (`brightness-0 invert`). Los ítems son texto de 14px semibold en `white/60`, y el activo se marca con **borde inferior blanco de 2px a la altura completa de la barra** — no con fondo ni con color. A la derecha: buscador global, campana de notificaciones, toggle de tema y avatar de iniciales sobre `white/10`. Bajo `lg` colapsa a menú vertical donde el activo sí usa fondo `white/15`, porque en una lista vertical un borde inferior no lee.

### To-Do bar

Barra fija al pie, sobre `chrome`, colapsable. Es la firma estructural del producto: la única superficie persistente que no es navegación. Cerrada muestra el título y un contador en píldora violeta; abierta despliega hasta `55vh` de superficie con la lista de tareas separada por `divide-line`, cada ítem con un punto de prioridad de 10px y checkbox con `accent-navy`.

### Modal

Portal a `document.body`. Backdrop `bg-black/50` con 16px de padding. El diálogo es una superficie de 16px de radio, `shadow-soft` y `ring-1 ring-line`, con alto máximo de `85vh` y scroll interno. Encabezado con título centrado sobre borde inferior y botón de cierre circular a la derecha. Nueve anchos, de `max-w-md` a `max-w-7xl`.

### Tooltip

CSS puro, sin librería, sin el delay del `title` nativo. Píldora de 8px sobre `chrome` con texto blanco de 12px, posicionada arriba y centrada, con transición de opacidad de 100ms.

### Tables

El componente más importante del producto y el que más disciplina exige.

- **Marco:** contenedor de 16px de radio con borde `line`; la tabla vive adentro con `overflow-auto`.
- **Gridlines:** borde derecho en cada `td`/`th` menos el último, borde superior en cada fila. La retícula completa se dibuja, como en una planilla.
- **Encabezado:** `sticky top-0` sobre `surface-2`, 12px semibold en tinta plena, con la línea inferior hecha con `inset` box-shadow.
- **Filas:** 8px × 12px de padding, hover a `surface-2`, cursor pointer cuando son navegables.
- **Celdas:** truncadas siempre. Los números con `tabular-nums`. La columna que identifica el registro va en violeta (es el link); el resto en tinta plena.
- **Columnas ajustables:** arrastre con línea guía vía `useResizableColumns`.

## Do's and Don'ts

### Do:

- **Do** usar los tokens semánticos (`bg-surface`, `text-ink-2`, `border-line`) en vez de colores de Tailwind. Es lo que hace que el modo oscuro funcione sin que ningún componente sepa que existe.
- **Do** poner `tabular-nums` en toda cifra que se compare en vertical.
- **Do** truncar toda celda de tabla y dejar que el usuario ajuste el ancho de la columna.
- **Do** teñir las sombras con el tono de la superficie (azul `rgba(3,35,77,…)`, violeta `rgba(113,24,247,…)`).
- **Do** renderizar modales y dropdowns recortados por portal a `document.body` — un ancestro con `transform` atrapa al `position: fixed`.
- **Do** usar `Kicker` en mono/versalitas para rotular secciones en vez de agregar otro nivel de peso tipográfico.
- **Do** mantener `chrome` (`#250c50`) idéntico en ambos temas.
- **Do** dar `ring-offset-2` a los anillos de foco de botón, para que no se lean como borde.

### Don't:

- **Don't** usar el verde de acción para nada que no sea un botón primario, ni el violeta para el control que ejecuta la acción. Los dos colores tienen trabajos separados.
- **Don't** usar un color del semáforo fuera de un badge, un punto de estado o un relleno de gráfico. Para acción destructiva está `button-danger` en rojo-600, que es otro color a propósito.
- **Don't** rellenar un badge con color pleno. Tinte al 12% y texto del mismo color, siempre.
- **Don't** componer texto corrido en JetBrains Mono. Solo rotula.
- **Don't** introducir un segundo eje de scroll vertical en la página: solo scrollea `<main>`.
- **Don't** agregar un `max-w` al contenedor de las páginas de listado. El ancho completo es una decisión, no un olvido.
- **Don't** usar sombra negra pura ni bordes de más de 1px.
- **Don't** poner radio completo a un contenedor. La píldora significa "valor discreto"; las cards son 16px y los controles 12px.
- **Don't** meter ilustraciones, gradientes decorativos, emojis ni tono publicitario. El único gesto atmosférico es el radial-gradient de tinte del `body`.
- **Don't** apretar la retícula a bordes duros grises tipo ERP. Es exactamente lo que este producto vino a reemplazar.
