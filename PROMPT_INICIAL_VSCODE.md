# Prompt inicial para arrancar el proyecto en VSCode

Pegá este prompt en Cursor, Claude Code o GitHub Copilot Chat dentro de un repositorio vacío. Construye el scaffolding completo del proyecto.

---

## PROMPT

```
Sos un desarrollador full-stack senior. Vamos a construir desde cero una plataforma web interna para ARG COLOR S.R.L. llamada "CRM Comercial". Te paso el contexto, el stack y el alcance del primer sprint. Trabajá paso a paso, explicando cada decisión y pidiendo confirmación cuando una elección sea irreversible.

## CONTEXTO DE NEGOCIO

ARG COLOR es una empresa industrial de Argentina. Hoy el equipo comercial usa:
- Gmail (cuenta corporativa Google Workspace) para recibir pedidos de clientes.
- Un ERP llamado GBP (GlobalBluePoint) para facturar y manejar stock. GBP NO tiene API utilizable.
- Un CRM "casero" hecho con un archivo JSON, sin interfaz.

El problema: se pierden cotizaciones por falta de seguimiento, nadie tiene visibilidad cruzada y la carga de datos es 100% manual.

La solución que vamos a construir:
1. Web app interna multiusuario, login con Google OAuth corporativo.
2. IA (Claude API) que lee mails entrantes y crea oportunidades automáticamente.
3. Armador de presupuestos DENTRO del CRM (reemplaza el envío desde GBP), con generación de PDF y envío al cliente desde la plataforma.
4. Tablero compartido con semáforos por días sin respuesta.
5. Recordatorios manuales ("avisame el viernes") y alertas automáticas.
6. Handoff a GBP solo cuando el cliente acepta (manual en MVP, RPA con Playwright en fase 2).

## STACK OBLIGATORIO (Plan A: 100% gratis)

- Backend: Python 3.12 + FastAPI + SQLAlchemy 2.0 + Alembic
- Base de datos: PostgreSQL 16 (vía Supabase free tier)
- Frontend: Next.js 14 (app router) + React + TypeScript + TailwindCSS + shadcn/ui
- IA: Google Gemini 1.5 Flash vía SDK oficial `google-generativeai` (modelo: `gemini-1.5-flash`)
- Mail: Gmail API (google-api-python-client) con OAuth 2.0
- PDF: WeasyPrint (HTML/CSS → PDF)
- Auth: Google OAuth (NextAuth.js en el frontend, validación de JWT en el backend)
- Scheduler: APScheduler
- Tests backend: pytest
- Linter/formatter: ruff (backend), eslint + prettier (frontend)
- Gestor de paquetes Python: uv
- Gestor de paquetes Node: pnpm
- Contenedores: Docker + docker-compose (para desarrollo local)
- Hosting target: **Vercel** (frontend) + **Render free** (backend) + **Supabase** (Postgres). Todo gratis.

### Importante sobre la capa de IA

Crear una clase abstracta `AIProvider` en `app/integrations/ai/base.py` con métodos:
- `extract_email_data(email_text: str) -> EmailData`
- `draft_quote(opportunity: Opportunity, compras_response: str) -> QuoteDraft`
- `summarize_thread(messages: list[str]) -> str`

Implementación concreta inicial: `GeminiProvider` en `app/integrations/ai/gemini.py`.
El proveedor se selecciona vía variable de entorno `AI_PROVIDER=gemini`. Esto deja la puerta abierta a sumar `ClaudeProvider` u `OllamaProvider` en el futuro sin tocar la lógica de negocio.

## ESTRUCTURA DE REPO

Repo monorepo con dos carpetas principales:

```
crm-argcolor/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db/
│   │   │   ├── base.py
│   │   │   ├── session.py
│   │   │   └── models/   (un archivo por entidad)
│   │   ├── api/
│   │   │   ├── deps.py
│   │   │   └── v1/        (un router por recurso)
│   │   ├── services/      (lógica de negocio)
│   │   ├── integrations/  (gmail, claude, gbp)
│   │   ├── schemas/       (pydantic)
│   │   └── core/          (auth, security, exceptions)
│   ├── alembic/
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── app/               (next.js app router)
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── package.json
│   └── tailwind.config.ts
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## MODELO DE DATOS (tablas iniciales)

- usuarios (id, email, nombre, rol [vendedor/admin/compras], activo, created_at)
- clientes (id, razon_social, cuit, vendedor_asignado_id, notas, activo, created_at)
- contactos_cliente (id, cliente_id, nombre, email, telefono, cargo, rol_compra [decisor/tecnico/compras/logistica/otro], es_principal, activo, notas)
- dominios_cliente (id, cliente_id, dominio, es_principal_dominio, notas)
- oportunidades (id, cliente_id, contacto_cliente_id, vendedor_id, estado [nueva/requiere_aclaracion/en_compras/presupuestada/ganada/cargada_en_gbp/facturada/perdida], fecha_creacion, fecha_ultimo_movimiento, fuente)
- solicitudes_compras (id, oportunidad_id, solicitante_id, requerimiento, archivos_adjuntos [JSONB], condicion_pago [enum: 15/30/45/60/120/Transferencia], importe_aproximado, fecha_limite, presupuesto_gbp_referencia, ccs_extra [array de emails], fecha_envio, fecha_respuesta, gmail_thread_id, estado [enviada/respondida/cerrada])
- respuestas_compras (id, solicitud_compras_id, fecha_recepcion, contenido_raw, datos_parseados_ia [JSONB], notas_compras)
- productos (id, codigo, descripcion, unidad, precio_base, moneda, categoria, activo, ultima_actualizacion)
- presupuestos (id, oportunidad_id, codigo [COT-YYYY-NNNNN], monto_total, moneda, condicion_pago, plazo_entrega, validez, pdf_url, qr_url, fecha_envio, fecha_respuesta_cliente, estado [borrador/enviado/aceptado/rechazado/negociando], id_gbp_pedido, id_gbp_factura)
- presupuesto_items (id, presupuesto_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, subtotal, orden)
- mails (id, gmail_thread_id, gmail_message_id, oportunidad_id, direccion, de, para, asunto, cuerpo, fecha, adjuntos [JSONB], datos_extraidos_ia [JSONB])
- adjuntos (id, mail_id, nombre_archivo, mime_type, path_storage, descripcion_ia)
- recordatorios (id, usuario_id, oportunidad_id, mensaje, fecha_recordatorio, completado, tipo [manual/automatico_estado/automatico_inactividad])
- notificaciones (id, usuario_id, mensaje, link, leida, fecha_creacion)
- configuracion (clave [PK], valor [JSONB]). Keys iniciales: `ccs_default_solicitudes_compras`, `dias_alerta_sin_respuesta`, `plantilla_acuse_recibo`, `plantilla_followup_cliente`

### REQUISITOS ESPECÍFICOS DE LA IA

La capa de IA (Gemini) debe implementar:

1. **Identificación automática del cliente por dominio del remitente.** Al recibir un mail, extraer el dominio (parte después del `@`), buscar en `dominios_cliente`, y asociar la oportunidad al cliente correspondiente. Si el email exacto está en `contactos_cliente`, asociar también al contacto. Si el dominio es nuevo, dejar la oportunidad con cliente `por_identificar` y permitir asignación manual (que enseña al sistema).

2. **Procesamiento multimodal de adjuntos.** Gemini 1.5 Flash es multimodal; mandar texto + imágenes en la misma llamada. Si el mail trae fotos (etiquetas, muestras, piezas, planos), Gemini debe analizarlas y guardar la descripción en `adjuntos.descripcion_ia`. Soportar al menos: jpg, png, webp, pdf (primera página como imagen).

3. **Manejo de pedidos incompletos.** Si la IA detecta que falta info crítica para cotizar (producto no claro, cantidad no especificada), debe:
   - Marcar la oportunidad con `estado = 'requiere_aclaracion'`.
   - Generar un borrador de mail para que el vendedor le pida al cliente los datos faltantes (con un click se envía).

4. **Aprendizaje incremental.** Cada vez que el vendedor confirma manualmente la asociación de un mail desconocido a un cliente, el sistema debe ofrecer agregar el dominio/email a las tablas correspondientes para automatizar futuras coincidencias.

5. **Parsing automático de la respuesta de Compras (Carlos Sayegh)**. Cuando llega un mail con asunto que matchea `^RE: Solicitud .+: .+ - ID .+$`:
   - Linkear el mail a la `solicitudes_compras` correspondiente (por `gmail_thread_id` o por extracción del ID del asunto).
   - Mandar el cuerpo del mail a Gemini con un prompt específico para extraer la tabla con columnas: Fabricante, SKU, Descripción, Cantidad, Precio Unitario USD, IVA, Observaciones.
   - Guardar la respuesta parseada en `respuestas_compras.datos_parseados_ia`.
   - Crear un `presupuesto` en estado `borrador` con los items pre-cargados en `presupuesto_items`.
   - Notificar al vendedor con un mensaje accionable.

6. **Recordatorios inteligentes con contexto**. La generación de mensajes de recordatorio debe usar Gemini para producir textos accionables (no genéricos), tomando como input: estado actual de la oportunidad, último mail recibido, fechas relevantes. Ejemplos esperados:
   - "Hace 5 días Carlos te respondió la cotización de {cliente} y todavía no la mandaste al cliente."
   - "Mandaste el presupuesto a {contacto} ({cliente}) hace 7 días y no respondió. ¿Mando follow-up?"
   - "La oportunidad {codigo} está ganada pero no cargaste el N° de pedido GBP."

7. **Handoff bidireccional con GBP**. Implementar:
   - Pantalla "Listo para GBP" que se abre al marcar oportunidad como `ganada`, con el código CRM destacado y todos los datos formateados para copiar.
   - Campo `id_gbp_pedido` que el vendedor carga manualmente tras crear el pedido en GBP.
   - Generación de QR en el PDF del presupuesto que linkee a la oportunidad en el CRM (usar `qrcode` lib).
   - Endpoint de conciliación: recibe un Excel/CSV exportado de GBP, cruza por código CRM en columna Observaciones, actualiza `id_gbp_factura` cuando corresponde.

8. **Dashboard del dueño**. Endpoint `/api/v1/dashboard/ejecutivo` que devuelve KPIs:
   - Cotizaciones del mes (total + por vendedor)
   - Tasa de cierre por vendedor (aceptadas / cotizadas)
   - Tiempo promedio de respuesta a Compras y al cliente
   - Oportunidades aceptadas sin `id_gbp_pedido` cargado
   - Oportunidades sin movimiento > 7 días, agrupadas por vendedor
   - Volumen cotizado vs facturado del mes

## QUÉ NECESITO QUE HAGAS EN ESTE PRIMER SPRINT (Fase 0 + parte de Fase 1)

1. Crear toda la estructura de carpetas del monorepo.
2. Generar el `docker-compose.yml` con Postgres 16 + servicio backend + servicio frontend.
3. `pyproject.toml` del backend con todas las dependencias (FastAPI, SQLAlchemy, Alembic, Pydantic v2, google-generativeai, google-api-python-client, weasyprint, apscheduler, pytest, ruff, python-jose, passlib, supabase opcional).
4. `package.json` del frontend con Next.js 14, TypeScript, Tailwind, shadcn/ui, NextAuth.js, react-query (tanstack), axios.
5. Configurar SQLAlchemy con la base `Base` y session factory.
6. Crear los modelos de las 10 tablas listadas arriba (un archivo por modelo en `app/db/models/`).
7. Configurar Alembic y generar la primera migración.
8. Endpoint de health check `GET /health`.
9. Endpoints CRUD básicos de usuarios, clientes y oportunidades (`/api/v1/usuarios`, `/api/v1/clientes`, `/api/v1/oportunidades`).
10. Auth con Google OAuth: en el backend validar el JWT que manda el frontend, en el frontend configurar NextAuth con provider Google.
11. Frontend: layout base con sidebar (Dashboard, Oportunidades, Clientes, Presupuestos, Configuración), página de login, página de listado de oportunidades (tabla con shadcn/ui).
12. `README.md` con instrucciones claras de cómo levantar todo en local con `docker-compose up`.
13. `.env.example` con todas las variables necesarias.
14. Configurar ruff + pre-commit para el backend, eslint+prettier para el frontend.

## REGLAS DE TRABAJO

- TypeScript estricto en el frontend (`strict: true` en tsconfig).
- Type hints obligatorios en el backend (Pydantic v2 + SQLAlchemy 2.0 mapped_column).
- Nunca uses contraseñas en código; todo por variables de entorno.
- Los nombres de tablas y columnas en español (es nuestro dominio); los nombres de funciones, variables y archivos en inglés.
- Comentarios concisos, solo donde el código no se explica solo.
- No agregues dependencias que no estén en el stack obligatorio sin avisarme primero.
- Cada vez que crees un archivo nuevo, mostrame el path completo y un resumen de su contenido.

## CÓMO QUIERO QUE TRABAJES

1. Primero mostrame el plan de archivos que vas a crear y esperá mi OK.
2. Después generá los archivos en orden lógico: configuración → DB → modelos → migraciones → API → frontend.
3. Cada 5-6 archivos, hacé un resumen y preguntá si seguís.
4. Si una decisión técnica tiene 2 alternativas razonables, presentame ambas y dejame elegir.

Arrancá cuando estés listo.
```

---

## Variables de entorno que vas a necesitar (.env)

Cuando llegues al punto de configurar las integraciones, vas a necesitar:

```bash
# Backend
DATABASE_URL=postgresql+psycopg://postgres:<password>@db.<proyecto>.supabase.co:5432/postgres
SECRET_KEY=<generar con `openssl rand -hex 32`>
AI_PROVIDER=gemini
GEMINI_API_KEY=<de aistudio.google.com/apikey>
GEMINI_MODEL=gemini-1.5-flash
GOOGLE_CLIENT_ID=<de Google Cloud Console>
GOOGLE_CLIENT_SECRET=<de Google Cloud Console>
GMAIL_TOPIC_NAME=projects/<gcp-project>/topics/gmail-incoming
ALLOWED_ORIGINS=http://localhost:3000,https://argcolor-crm.vercel.app

# Frontend
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generar con `openssl rand -base64 32`>
GOOGLE_CLIENT_ID=<mismo que backend>
GOOGLE_CLIENT_SECRET=<mismo que backend>
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Cuentas a crear antes de arrancar (todas gratis)

1. **Google Cloud Console** (cloud.google.com): proyecto nuevo, habilitar Gmail API y Pub/Sub, crear credenciales OAuth 2.0.
2. **Google AI Studio** (aistudio.google.com): API key de Gemini con free tier (1.500 req/día).
3. **Supabase** (supabase.com): proyecto nuevo, plan Free. Postgres + dashboard incluido.
4. **Render** (render.com): para deploy del backend (web service free).
5. **Vercel** (vercel.com): para deploy del frontend (Hobby free).
6. **GitHub**: repo privado.
7. **UptimeRobot** (uptimerobot.com, opcional): ping cada 5 min al backend de Render para evitar cold starts. Gratis.

---

## Comandos para arrancar el proyecto

```bash
# Clonar repo
git clone <repo-url> crm-argcolor
cd crm-argcolor

# Copiar variables de entorno
cp .env.example .env
# (editar .env con valores reales)

# Levantar todo
docker-compose up -d

# Aplicar migraciones
docker-compose exec backend alembic upgrade head

# Backend en http://localhost:8000
# Frontend en http://localhost:3000
# Postgres en localhost:5432
```
