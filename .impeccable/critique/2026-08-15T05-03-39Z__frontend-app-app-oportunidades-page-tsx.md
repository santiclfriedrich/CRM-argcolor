---
target: oportunidades
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-08-15T05-03-39Z
slug: frontend-app-app-oportunidades-page-tsx
---
**Method: dual-agent** (A: design review · B: detector + mechanical cross-checks) · no browser available

## Design Health Score

| # | Heurística | Score | Problema clave |
|---|-----------|-------|----------------|
| 1 | Visibilidad del estado del sistema | 2 | Los contadores del header cuentan `oportunidadesDelMes`; la tabla renderiza `filas`. Con filtro activo dice "47 oportunidades · $1.2 M" arriba de 3 filas |
| 2 | Correspondencia con el mundo real | 3 | Vocabulario del equipo, voseo nativo. Pero `Fuente` es texto libre con placeholder "manual / mail" — campo de DB filtrado al formulario |
| 3 | Control y libertad del usuario | 2 | Sin deshacer en borrado en cascada; sin "limpiar filtros"; Escape en el modal de edición descarta sin avisar |
| 4 | Consistencia y estándares | 2 | Tres tratamientos de acción destructiva en una feature. Click de fila navega en Cuentas, abre menú acá |
| 5 | Prevención de errores | 1 | `seleccion` nunca se limpia al cambiar mes/filtro; el borrado en lote opera sobre filas no visibles |
| 6 | Reconocer antes que recordar | 2 | 13 íconos de filtro idénticos, sin resumen de filtros activos; `Cotiz`/`E/Compra`/`R/Compra` sin tooltip |
| 7 | Flexibilidad y eficiencia | 3 | Columnas ajustables persistidas, orden de entrada por usuario, edición inline. Sin vistas guardadas ni cambio de estado en lote |
| 8 | Estética y diseño minimalista | 2 | `Cotiz`, `E/Cliente` y `Estado` codifican lo mismo; el nombre del cliente repite 3 de los 8 estados |
| 9 | Recuperación de errores | 1 | Toda mutación inline revierte en silencio. El error de carga imprime `NEXT_PUBLIC_API_URL` a un vendedor |
| 10 | Ayuda y documentación | 1 | Sin leyenda del código de color, sin tooltip en headers, "arrastrada" explicado solo en un `title` |
| **Total** | | **19/40** | **Poor** (a un punto de Acceptable) |

Las 10 heurísticas aplican (superficie Operate pura). El score lo hunden dos racimos: el destructivo (#5, #9) y la ausencia de capa explicativa (#10).

## Design Specificity Verdict

**Veredicto partido: la arquitectura de información es inconfundiblemente este producto; el lenguaje de interacción es genérico y en cinco lugares contradice el propio DESIGN.md.**

SÍ es de acá: el set de columnas es la planilla real de ARG COLOR (`E/Compra`+`R/Compra` como par, `Cotiz` derivado, `Ing.` inline, y una columna `GBP` que existe solo porque el ERP no tiene API). La semántica de arrastre mensual (`enPeriodo`) modela la regla de negocio real y la explica con el chip "arrastrada desde julio". `PropuestasIndicator` es "la IA propone, la persona decide" hecho objeto de UI.

NO es de acá: sacá las etiquetas en español y nada identifica al producto. El `Kicker` en JetBrains Mono — la firma declarada del sistema — aparece CERO veces en toda la superficie. DESIGN.md dice que la columna identificadora va en violeta y es link; ni `ID` ni `Cliente` lo son, mientras la tabla hermana de Cuentas sí lo hace bien. Esta superficie es menos ARG COLOR que el sistema de diseño al que pertenece.

**Deterministic scan:** detector = 0 hallazgos en los 3 archivos. Liveness verificada con archivo sintético (exit 2 con bounce-easing). El ruleset caza slop genérico, no las reglas del proyecto. Cero hallazgos ≠ diseño sano. Los cross-checks contra DESIGN.md sí encontraron:
- 30 usos de radio fuera de escala (10 `rounded` pelado, 18 `rounded-md` fuera de rol, 4 tier equivocado)
- 4 líneas con paleta Tailwind cruda (todas en `bgClienteEstado`, todas con override `dark:` a mano)
- 4 usos del semáforo fuera de badge/punto/gráfico, incluido relleno pleno en el botón de borrado en lote
- 7 celdas de texto sin `truncate` (con `overflow-hidden` a nivel tabla: corta a mitad de glifo sin elipsis)
- 6 inputs sin label; `htmlFor="o-cliente"` apunta a un id inexistente

**Visual overlays:** ninguno. Sin herramienta de navegador y con la página tras sesión autenticada + backend + Postgres, no se arrancó servidor, no se inyectó nada, no hay capturas. Todo estático.

## Overall Impression

Huesos correctos, carne descuidada. Alguien pensó de verdad el modelo de datos y las reglas del negocio, y después resolvió toda la interacción con el primer patrón que funcionaba. El resultado es una herramienta usable de la que no se puede fiar del todo: borra en cascada sin decir qué, revierte en silencio cuando falla, y no tiene una línea que explique qué significa nada.

La oportunidad más grande es una sola decisión: el click de fila. Hoy abre un menú de 6 opciones. Si abriera el detalle se arregla el gesto más repetido del día, se destraba el teclado, se alinea con Cuentas, y la página de detalle deja de ser el callejón sin salida que es hoy (única acción: Eliminar).

## What's Working

1. **Agrupamiento semántico de la toolbar.** Dos grupos de píldoras idénticos desambiguados con ícono `User` + `CalendarClock` + divisor de 1px. Responde "quién" vs "cuándo" sin una palabra de label.
2. **Columnas ajustables con línea guía.** Anchos como DOM imperativo, resize sin render de React, reflow de mil filas una sola vez al soltar, persistido por tabla. Única respuesta correcta cuando 13" y 27" son ambas escena real.
3. **Navegador mensual y semántica de arrastre.** Modela la regla real, la explica con el chip "arrastrada", y deshabilita la flecha adelante en el mes actual.

## Priority Issues

### [P0] La fila es disparador de menú contextual, sin camino por teclado
El `<tr>` lleva `onClick` posicionado en `e.clientX/clientY`. Sin `role`, `tabIndex` ni `onKeyDown` (grep: cero ocurrencias en los 3 archivos). Ese menú es la ÚNICA puerta a Ver detalle, Pedir a Compras, Crear presupuesto, Transferir y Eliminar.
**Por qué importa:** para teclado/lector de pantalla ninguna acción sobre ninguna oportunidad es alcanzable. Para el resto, el gesto más repetido del día cuesta dos clicks + leer seis ítems, contradiciendo Cuentas (donde la fila navega).
**Fix:** click de fila → `router.push`. Menú a botón `⋮` en columna final fija + `onContextMenu` en la fila. `aria-haspopup="menu"`, `role="menu"`, foco al abrir, navegación por flechas.
**Comando:** `/impeccable audit`

### [P1] El borrado en lote puede destruir registros no visibles — VERIFICADO a mano
`setSeleccion` se llama en 5 lugares; ningún `useEffect` la resetea al cambiar `mes`/`periodoModo`/`rango`/`filtros`/`busqueda`. `eliminarSeleccionadas` hace `[...seleccion]` sin intersectar con `idsVisibles`. Seleccionás 5 en agosto, navegás a julio, borrás: se van las 5 de agosto.
**Por qué importa:** cascadea a mails/solicitudes/presupuestos, irreversible, el confirm nombra solo un número, sin toast de error.
**Mitigación real:** la barra de selección sigue visible con contador y botón de limpiar. Hay señal; lo que falta es indicación de que esas filas no son las que estás mirando.
**Fix:** resetear en effect con esas deps; intersectar con `idsVisibles`; listar nombres de cliente en el confirm; `confirmLabel`; toasts; Deshacer de 10s.
**Comando:** `/impeccable harden`

### [P1] Los badges de estado esquivan el sistema de diseño y encandilan en oscuro
`ESTADOS` hardcodea `bg-blue-100 text-blue-700`, `bg-amber-100`, `bg-purple-100`, `bg-cyan-100`, `bg-indigo-100`, `bg-yellow-100`, `bg-green-100`, `bg-red-100`. Como `cn` corre `twMerge`, PISAN los tonos por token de `Badge`. Se suma `bgClienteEstado` con paleta cruda y override `dark:` a mano.
**Por qué importa:** en oscuro la superficie es `#101120`; cada chip queda como relleno pastel saturado sobre casi negro, un punto de encandilamiento por fila durante 8 horas, sobre el objetivo principal de escaneo. Violación triple de DESIGN.md. Además, lo más saliente de la pantalla marca trabajo TERMINADO — las filas que necesitan acción son las incoloras.
**Fix:** mapear los 8 estados a `Badge tone` + `accent`/`accent-dim`, borrar overrides por `className`, retirar `bgClienteEstado` (sus 3 estados ya están en la columna Estado).
**Comando:** `/impeccable polish`

### [P1] A 13–14" la tabla pierde sus columnas de identidad
Anchos por defecto = 1824px. `computeFill` solo reparte excedente → en 1366px (≈1302px de contenido) hay ~522px de scroll horizontal SIN columna congelada. La tabla aplica `[&_td]:overflow-hidden` pero no `[&_th]`, y el header es `whitespace-nowrap`: el texto de un header angostado se derrama sobre el vecino. Vertical en 1366×768: ~386px de tabla ≈ 10 filas visibles.
**Por qué importa:** PRODUCT.md nombra la notebook de 13–14" como escena confirmada; DESIGN.md dice que las tablas anchas se resuelven con columnas ajustables y truncado, "no con scroll horizontal".
**Fix:** `position: sticky; left: 0` en checkbox + ID + Cliente con sombra en el borde; `[&_th]:overflow-hidden`; control de densidad/visibilidad para plegar las 6 columnas de fecha.
**Comando:** `/impeccable adapt`

### [P2] Los filtros son invisibles y los contadores los contradicen
13 menús de filtro señalizados solo por su ícono cambiando dentro del header. Sin resumen de filtros activos, sin chips, sin "Limpiar filtros". Los chips del header cuentan el set pre-filtro y pre-búsqueda mientras la tabla renderiza el set filtrado.
**Por qué importa:** volvés después de dos horas, ves un mes aparentemente vacío y ninguna explicación. La cifra de pipeline que le pasarías al dueño está calculada sobre un conjunto que no estás mirando.
**Fix:** chip descartable por filtro activo con "Limpiar todo"; contadores sobre `filas`, mostrando "47 de 312" cuando hay filtro.
**Comando:** `/impeccable clarify`

---
**Bug funcional (no es diseño, verificado):** la columna `Ing.` muestra `o.ing` pero su accesor de orden/filtro es `o.vendedor?.nombre`, y `CAMPOS_BUSQUEDA` indexa `vendedor.nombre` y nunca `o.ing`. Filtrar "Ing." por "Juan Pérez" oculta filas cuya celda visible dice "J.P".

## Persona Red Flags

**Alex (power user):** sin camino por teclado a un registro; puede seleccionar 20 filas y solo borrarlas (falta cambio de estado en lote); orden por una sola clave; sin vistas guardadas; **Oportunidades no está virtualizada** (Cuentas sí, para 8.200 filas); el panel de filtro calcula posición una vez al abrir y queda flotando desprendido al scrollear.

**Sam (teclado/AT):** no alcanza el menú de fila ni ningún registro; `SelectMenu` sin `aria-expanded`/`role="listbox"`/flechas/Escape (el campo Estado de 8 opciones es mouse-only); `Modal` sin focus trap, foco inicial ni restauración pese a `role="dialog" aria-modal="true"`; `Cotiz` comunica por check verde solo; el código de color del cliente no tiene equivalente textual ni leyenda; tabla sin `<caption>`, `scope="col"` ni `aria-sort`; botón de enviar comentario solo-ícono sin `aria-label` (único fallo entre ~25 botones con ícono); **`htmlFor="o-cliente"` apunta a un id inexistente — el primer y más importante campo del formulario está sin etiqueta**, y `ClientePicker` no acepta prop `id`.

**Vale (vendedora, 1366×768, martes 15:40):** trabaja permanentemente scrolleada a la derecha sin columna Cliente anclada; la toolbar `flex-wrap` le come ~44px al saltar el toggle de orden; ≈10 filas visibles; en oscuro los diez badges encandilan; "Nueva oportunidad" abre 19 campos con `Guardar` bajo el pliegue siempre; `PropuestasIndicator` y `TransferenciasPendientes` renderizan `null` cuando están vacíos, así que la fila de acciones se desplaza horizontalmente a medida que llega trabajo y "Nueva oportunidad" se corre de abajo del cursor.

## Minor Observations

- `"oportunidad(es)"` y `"seleccionada(s)"` conviven con la pluralización correcta 150 líneas más arriba, justo en los dos strings de mayor riesgo.
- `montoCompacto` imprime "$1.2 M" sin moneda; `valor_estimado` es USD. En un equipo argentino un `$` sin etiqueta es ambiguo por defecto.
- Comentario obsoleto documentando un "punto de estado junto al #id" que ya no existe.
- `RowMenu` hardcodea `H = 290` para el clamp; el panel de filtro se acota por 16px de menos y no tiene clamp vertical (los paneles de las últimas columnas se abren bajo el pliegue).
- `Relacionados` linkea cada solicitud y mail a la página índice, no al registro.
- `estaCotizada` omite `cotizado_compras`, cuya etiqueta UI es literalmente "Cotizado por compras".
- Tres radios distintos en una franja de 300px (`rounded-lg` x2 junto al primario `rounded-xl`).
- La bitácora del detalle y la lista de Transferir agregan cada una un segundo eje de scroll vertical.
- **Ambigüedad en DESIGN.md:** la Regla del Único Scroll dice que solo scrollea `<main>`, pero Components prescribe `overflow-auto` en el marco de la tabla. Defecto del documento, no del código.

## Questions to Consider

1. ¿La fila abre un menú porque el detalle no tiene acciones, o el detalle no tiene acciones porque la fila abre un menú? Una de las dos hay que revertirla.
2. `Estado` ya codifica ganada/confirmada/perdida y el nombre del cliente se pinta con esos mismos tres colores. ¿Cuál lee la gente — y qué pasa con el otro?
3. El header dice "47 oportunidades · $1.2 M" mientras un filtro muestra 3 filas. ¿Cuál cita el dueño en una reunión?
4. El Principio #1 es "el trabajo es compartido" y lo primero que ve un vendedor es `solo_mias: true`. ¿La vista por defecto contradice el primer principio?
5. Cuentas está virtualizada para 8.200 filas; Oportunidades no. ¿A partir de qué cantidad `Todos`+`Todas` se vuelve inusable — y alguien ya lo encontró en producción?
6. DESIGN.md nombra al `Kicker` como "la firma del instrumento" y aparece cero veces acá. ¿La firma es real o describe un sistema que nadie aplica?
7. No hay estado de completitud: nada le dice a un vendedor que el mes está bajo control. ¿Cuál sería ese objeto, y es su ausencia la razón por la que "se perdían cotizaciones por falta de seguimiento" sigue vivo?
