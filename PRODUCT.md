# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Vendedores (rol `vendedor`) — usuario primario.** Equipo comercial de ARG COLOR S.R.L., empresa industrial argentina. Trabajan la jornada completa dentro del CRM, con Gmail y GBP (el ERP) abiertos en otras pestañas. Su trabajo es hacer avanzar pedidos de clientes desde que entra el mail hasta que se cobra: leer el requerimiento, pedir costos a Compras, armar el presupuesto, mandarlo, seguirlo y no perderlo.

Escena de uso confirmada: **escritorio con monitor grande y notebook de 13–14" conviven**. El mismo vendedor puede estar en pantalla ancha en la oficina y en laptop sin monitor externo otro día. El ancho útil no se puede asumir. Celular no es escena de uso real.

**Admin (rol `admin`).** Además de vender, administra usuarios, configuración y el sync de clientes desde GBP.

**Compras (rol `compras`) — Carlos Sayegh y equipo.** Hoy **entran solo a consultar**: ven estado e historial de solicitudes. El trabajo real lo siguen haciendo en Gmail — responden el mail de solicitud con su tabla habitual y la IA la parsea. Que Compras trabaje *dentro* del CRM es un plan declarado, no un hecho: hoy `/solicitudes` es una pantalla de registro y consulta, no una superficie de trabajo para ellos.

**Dueño / dirección.** Usuario real. Necesita una **sección ejecutiva propia que hoy no existe** (cotizado del mes por vendedor, tasa de cierre, tiempo de respuesta, aceptadas sin cargar en GBP). Restricción explícita del usuario: esa vista se agrega aparte y **todo el resto de la app se mantiene tal cual está**.

**Clientes externos: no son usuarios.** Ninguna pantalla del CRM es de cara al cliente. El contacto con el cliente ocurre por mail y por el PDF de presupuesto.

## Product Purpose

Reemplazar el sistema real de trabajo del equipo comercial —un archivo JSON casero mantenido por un vendedor, más Gmail, más GBP— por una app interna donde el ciclo de cotización vive completo y compartido.

Dolores originales que define el producto: se perdían cotizaciones por falta de seguimiento; ningún vendedor sabía qué estaba cotizando otro; no había recordatorios; la carga de datos era 100% manual y propensa a errores; las cotizaciones quedaban dispersas entre tres sistemas.

Éxito = ninguna oportunidad se pierde por olvido, y el equipo entero ve el mismo estado del pipeline en tiempo real.

Estado: **en producción y en uso**, no es un prototipo. Cualquier cambio de diseño toca el trabajo diario de gente real.

## Positioning

GBP (GlobalBluePoint), el ERP, **no expone API utilizable**. Esa es la restricción que define el producto entero: el CRM no puede integrarse, así que **toma el control del ciclo de cotización** y deja a GBP solo para facturación y stock.

Lo que ningún producto vecino podría copiar sin este contexto:

- **Ingesta de mail con IA multimodal.** Gemini lee el mail entrante con texto, imágenes y adjuntos (PDF nativo; Excel/CSV convertidos a texto), identifica al cliente por el dominio del remitente, extrae el requerimiento estructurado y arma la oportunidad. Un pedido vago o solo con foto entra como `requiere_aclaracion` con un borrador de mail listo.
- **Loop cerrado con Compras sin cambiarle el trabajo a Compras.** El CRM manda el mail con el formato de siempre; Carlos responde como siempre; la IA parsea su tabla (fabricante / SKU / descripción / cantidad / precio unit USD / IVA / observaciones) y crea el presupuesto borrador con los ítems precargados. Lo que eran 10 minutos de copy-paste son 30 segundos de revisión.
- **Handoff bidireccional manual-asistido con GBP** vía el código `COT-YYYY-NNNNN` pegado en Observaciones, con conciliación mensual por import del reporte del ERP.

## Operating Context

- **Trabajo compartido, no privado.** Se revirtió el scoping personal: hoy todos los usuarios ven y actúan sobre todo (bandeja, oportunidades, cuentas, presupuestos, solicitudes, tareas). Los toggles **Mías / Todas** son comodidad visual, no permisos — default por rol (vendedor→Mías, admin/compras→Todas). Se audita quién hizo qué.
- **Ciclo real de una oportunidad:** mail entrante → propuesta a revisar → oportunidad → solicitud a Compras → respuesta parseada → presupuesto → PDF → envío al cliente → seguimiento → ganada/perdida → carga en GBP.
- **Revisión previa de propuestas.** Los mails auto-ingestados por el polling no crean oportunidad directo: entran como propuesta (`pendiente_revision`) y se aceptan o rechazan desde el indicador "Propuestas (N)". La carga manual sí crea directo.
- **Vista mensual.** Oportunidades se navega por mes; las abiertas se arrastran al mes actual, las cerradas quedan en su mes.
- **Escala de datos real:** ~8.200 cuentas sincronizadas desde GBP. Las tablas de listado son grandes de verdad — Cuentas ya usa virtualización y columnas de ancho ajustable.
- **Gmail por usuario.** Cada vendedor conecta su casilla en el login (OAuth por usuario, token cifrado). El scheduler pollea todas; el botón "Sincronizar" manual pollea solo la del usuario.
- **Idioma: español rioplatense.** Toda la UI y el dominio están en español (voseo). Tablas y columnas en español; código en inglés.

## Capabilities and Constraints

**Superficies existentes** (Next.js 14 app router, todas bajo `(app)`): Inicio, Bandeja, Oportunidades (+ detalle), Cuentas (+ detalle), Compras/Solicitudes, Presupuestos (+ detalle), Tareas, Notas, Configuración, Usuarios (admin), Login.

**Stack de UI:** Next.js 14 + TypeScript estricto, Tailwind, componentes propios en `components/ui/` (no shadcn instalado como dependencia), `lucide-react` para íconos, TanStack Query, `@tanstack/react-virtual`, react-hook-form + zod. Sin librería de animación. Backend FastAPI + Postgres (Neon) en Railway; frontend en Vercel.

**Restricciones técnicas que el diseño no puede romper:**

- Los **modales** se renderizan por portal a `document.body`. Un ancestro con `transform` atrapa al `position: fixed` y achica el modal. Los dropdowns dentro de modales que se recortan también van en portal.
- Los modales cierran con Escape o clic en el fondo **solo si el gesto empezó y terminó ahí** — para no perder datos al arrastrar una selección afuera.
- Validación del frontend: `npx tsc --noEmit` + `npx next lint`. `next build` local suele fallar por EAGAIN.
- Next.js 14.2.5 con vulnerabilidad conocida pendiente de actualizar (deuda técnica declarada).

**Terminología del dominio** (usar exactamente esto en UI):

- **Cuentas**, no "clientes" — así se llama en la navegación.
- **Compras** es el área interna que define costos, no una acción de compra.
- **Oportunidad** es la unidad de trabajo; su código es `COT-YYYY-NNNNN`.
- Estados de oportunidad (código DB / etiqueta UI): `nueva`, `requiere_aclaracion`, `en_compras`/"Enviado a compras", `cotizado_compras`/"Cotizado por compras", `presupuestada`/"Enviada al cliente", `confirmada`/"Confirmada / Pendiente", `ganada`/"Pago", `perdida`/"No avanzó". Terminales: `ganada`, `perdida`. `confirmada` **no** es terminal.

**Decisiones de producto explícitamente abiertas:**

- Vista ejecutiva para dirección: confirmada como necesaria, sin diseñar ni construir.
- Compras trabajando dentro del CRM: intención declarada, sin fecha ni alcance definido.
- Notificaciones diarias / alertas de vencido / alertas de "sin avance 3-4 días": pendientes.

## Brand Commitments

- **Nombre y logo: Argentina Color / ARG COLOR S.R.L.** El logotipo (`frontend/public/logo-largo.png`) es **intocable**. Hoy se muestra monocromo en blanco sobre el navbar navy.
- **Todo lo demás del sistema visual es revisable.** El violeta de chrome `#250c50` (el token se sigue llamando `--c-navy` por compatibilidad histórica, pero ya no es navy), el acento violeta, el verde de acción de los CTA, la paleta de tokens semánticos (surface / line / ink / accent) y las tipografías Plus Jakarta Sans / JetBrains Mono fueron decisiones de diseño de este proyecto, no de un manual de marca corporativo. No existe manual de marca.
- **Voz:** español rioplatense con voseo, directa y sin ceremonia. Es una herramienta interna entre colegas, no un producto que tenga que venderse a quien lo usa.

## Evidence on Hand

- `CRM_PROJECT_CONTEXT.md` — documento de contexto del proyecto, secciones 1–16. La sección 16 es la actualización vigente (2026-07); las secciones 4–15 se conservan como historia y están parcialmente desactualizadas. **Advertencia del propio documento: verificar contra el código actual antes de asumir.**
- `docs/Manual_CRM_ArgColor.pdf` — manual de uso.
- `CRM_Comercial_ArgColor_Documento_Tecnico.docx` — documento técnico de 14 secciones.
- Datos reales en producción: ~8.200 cuentas sincronizadas desde GBP, oportunidades y presupuestos vivos.
- `frontend/public/logo-largo.png` — único asset de marca en el repo.

**No existe y no se debe inventar:** manual de marca, testimonios, benchmarks, métricas de adopción, casos de éxito, ni cifras de negocio. No hay assets de imagen fuera del logo.

## Product Principles

1. **El trabajo es compartido y auditado.** Todos ven todo; el diseño nunca debe sugerir propiedad exclusiva ni esconder trabajo ajeno. Los filtros Mías/Todas son comodidad, no permisos.
2. **La restricción de GBP manda.** El CRM es el dueño del ciclo de cotización porque el ERP no puede serlo. Nada del diseño debe presentar a GBP como fuente de verdad del pipeline.
3. **La IA propone, la persona decide.** Ingesta, parseo y borradores son sugerencias con revisión previa explícita. Lo que la IA generó debe ser distinguible de lo que una persona confirmó.
4. **Densidad sin ceguera.** Miles de filas, jornadas de ocho horas, anchos de pantalla que varían entre monitor y notebook de 13". La legibilidad y la scanability ganan sobre la expresión.
5. **No romper lo que ya funciona en producción.** Hay gente trabajando en esta app hoy. Lo nuevo se agrega; lo existente se refina, no se reemplaza sin pedido explícito.

## Accessibility & Inclusion

No se estableció un estándar formal ni una necesidad específica de usuario. Lo que sí es un hecho de contexto: jornadas largas de lectura de tablas densas en anchos de pantalla que varían entre monitor grande y notebook de 13–14", con tema claro y oscuro ambos en uso (`theme-toggle.tsx`). Contraste y tamaño de texto legible en ambos temas son requisito de uso, no de cumplimiento.
