# Contexto del proyecto: CRM Comercial ARG COLOR

> **Para usar en una nueva conversación con Claude / Cursor / GPT.** Pegá este archivo entero como primer mensaje del chat o como contexto del proyecto. Resume todas las decisiones tomadas hasta acá y el estado actual.

---

## 1. Quién soy y qué empresa es

- **Soy**: Santiago Claros Friedrich, santiago.c@argentinacolor.com.
- **Empresa**: ARG COLOR S.R.L. (Argentina). Empresa industrial.
- **Mi rol**: liderar la implementación de un CRM interno para el equipo comercial.

---

## 2. Problema que estoy resolviendo

El equipo comercial de ARG COLOR hoy trabaja así:

- Recibe pedidos de clientes por mail (Google Workspace corporativo).
- Cotiza usando **GBP (GlobalBluePoint), un ERP**. **GBP NO tiene API utilizable**, por lo que cualquier integración técnica es inviable.
- Lleva un "CRM" hecho con un archivo **JSON casero** que mantiene un vendedor llamado Guido. Sin interfaz, sin acceso compartido, sin recordatorios.
- El **formulario interno a Compras** (área que decide costos) es una conversación por mail con formato fijo. Se carga campo por campo, copiando manualmente del mail del cliente.

**Dolores concretos**:

- Se pierden cotizaciones por falta de seguimiento.
- Ningún vendedor sabe qué está cotizando otro.
- No hay recordatorios automáticos ("avisame el viernes lo de Guido").
- Carga de datos 100% manual y propensa a errores.
- Las cotizaciones quedan dispersas entre Gmail, GBP y el JSON.

---

## 3. La solución que decidimos construir

Una **web app interna** llamada "CRM Comercial ARG COLOR" con estos pilares:

1. **Bandeja inteligente con IA**: Gemini 1.5 Flash (multimodal) lee mails entrantes con texto e imágenes, identifica al cliente por el dominio del remitente, extrae datos estructurados y crea oportunidades automáticamente. Maneja casos donde el cliente no especifica el producto (solo foto, etiqueta o descripción vaga) marcando la oportunidad como "requiere aclaración" y sugiriendo un borrador de mail al cliente.
2. **Gestión de cuentas con múltiples contactos y dominios**: cada cliente (cuenta) tiene varios contactos con rol específico (decisor, técnico, compras, logística) y puede tener múltiples dominios de mail asociados. El sistema reconoce automáticamente quién está escribiendo y desde qué empresa.
3. **Formulario interno a Compras (reemplazo del Google Form)**: con los mismos campos del Form actual (solicitante, cliente, requerimiento, archivos, condición de pago [15/30/45/60/120/Transferencia], importe aprox, fecha límite, ID GBP opcional). El mail a Carlos Sayegh sale con el mismo formato que hoy, en CC los destinatarios configurados por defecto (Marcos Juárez, Karen Apaza, Diego Ramirez).
4. **Parsing automático de la respuesta de Compras**: cuando Carlos responde con la tabla habitual (Fabricante / SKU / Descripción / Cantidad / Precio Unit USD / IVA / Observaciones), la IA detecta la respuesta por el patrón del asunto, parsea la tabla y crea automáticamente un presupuesto borrador con todos los ítems pre-cargados. Cero copy-paste.
5. **Armador de presupuestos DENTRO del CRM**: como GBP no expone API, el CRM toma el control del ciclo de cotización. Genera PDF con plantilla oficial y QR de trazabilidad, manda al cliente desde la plataforma.
6. **Tablero compartido**: todos los vendedores ven en tiempo real qué cotiza cada uno, con semáforos: verde (esperando cliente), amarillo (esperando Compras), rojo (sin movimiento >7 días).
7. **Dashboard del dueño**: KPIs ejecutivos (cotizaciones del mes por vendedor, tasa de cierre, oportunidades aceptadas sin cargar en GBP, tiempo promedio de respuesta).
8. **Recordatorios inteligentes con contexto**: la IA genera mensajes accionables, no avisos genéricos. Ej: *"Hace 5 días Carlos te respondió la cotización de AEROPUERTOS ARG 2K y todavía no la mandaste al cliente"*.
9. **Handoff bidireccional a GBP**: cuando el cliente acepta, pantalla "Listo para GBP" con el código CRM destacado para pegar en Observaciones de GBP. Después se carga el N° de pedido GBP de vuelta en el CRM. Conciliación mensual con import del reporte de GBP. **RPA con Playwright en fase 2 confirmada viable** (GBP corre en navegador).

GBP queda únicamente para facturación y stock, que es donde aporta valor.

---

## 4. Stack técnico final (decisión cerrada)

### Backend
- **Python 3.12 + FastAPI** + SQLAlchemy 2.0 + Alembic
- Pydantic v2 para schemas
- APScheduler para tareas programadas (recordatorios)
- WeasyPrint para generar PDFs
- pytest para tests
- ruff como linter/formatter
- uv como gestor de paquetes

### Frontend
- **Next.js 14** (app router) + React + TypeScript estricto
- TailwindCSS + shadcn/ui
- NextAuth.js (login con Google OAuth)
- TanStack React Query
- axios
- pnpm como gestor de paquetes

### IA
- **Google Gemini 1.5 Flash** vía AI Studio (no Vertex AI)
- SDK: `google-generativeai`
- Modelo: `gemini-1.5-flash`
- Free tier: 15 req/min, 1.500 req/día
- **Arquitectura desacoplada**: clase abstracta `AIProvider` con métodos `extract_email_data()`, `draft_quote()`, `summarize_thread()`. Implementación inicial: `GeminiProvider`. Cambiar a Claude u Ollama en el futuro debe ser solo cambiar una variable de entorno.

### Integraciones
- **Gmail API** vía `google-api-python-client` (lectura entrante + envío saliente desde el sistema)
- **Cloud Pub/Sub** para webhooks de Gmail (mails nuevos en tiempo real)
- **OAuth 2.0** de Google para login y permisos de Gmail

### Hosting (PLAN A: 100% gratis)
- **Frontend en Vercel** (plan Hobby free): `argcolor-crm.vercel.app`
- **Backend en Render** (free tier, 750 hs/mes, cold start tras 15 min sin uso): `argcolor-crm-api.onrender.com`
- **Postgres en Supabase** (free tier, 500MB, backups automáticos)
- **Gemini en AI Studio** (free tier)
- **Dominio**: subdominios gratuitos de Vercel y Render (no comprar dominio propio en MVP)
- **UptimeRobot** (free) para pingear el backend cada 5 min y evitar cold starts

**Costo operativo mensual: USD 0**.

### Plan B (cuando crezca)
- Render Starter (USD 7) → mata cold starts
- Supabase Pro (USD 25) → más DB y bandwidth
- Vercel y Gemini se quedan en free tier
- Total Plan B: USD 33-35/mes

---

## 5. Modelo de datos

Tablas principales (Postgres en Supabase):

| Tabla | Campos principales |
|---|---|
| `usuarios` | id, email, nombre, rol (vendedor/admin/compras), activo, created_at |
| `clientes` | id, razon_social, cuit, vendedor_asignado_id, notas, activo, created_at (datos de contacto van en tablas separadas) |
| `contactos_cliente` | id, cliente_id, nombre, email, telefono, cargo, rol_compra (decisor/tecnico/compras/logistica/otro), es_principal, activo, notas |
| `dominios_cliente` | id, cliente_id, dominio (ej: bencen.com.ar), es_principal_dominio, notas. Un cliente puede tener varios dominios. |
| `oportunidades` | id, cliente_id, contacto_cliente_id, vendedor_id, estado (nueva/requiere_aclaracion/en_compras/presupuestada/ganada/cargada_en_gbp/facturada/perdida), fecha_creacion, fecha_ultimo_movimiento, fuente |
| `solicitudes_compras` | id, oportunidad_id, solicitante_id, requerimiento, archivos_adjuntos (JSONB), condicion_pago (15/30/45/60/120/Transferencia), importe_aproximado, fecha_limite, presupuesto_gbp_referencia, ccs_extra (array de emails), fecha_envio, fecha_respuesta, gmail_thread_id, estado (enviada/respondida/cerrada) |
| `respuestas_compras` | id, solicitud_compras_id, fecha_recepcion, contenido_raw, datos_parseados_ia (JSONB con items: fabricante/sku/descripcion/cantidad/precio_unit/iva/obs), notas_compras |
| `productos` | id, codigo, descripcion, unidad, precio_base, moneda, categoria, activo, ultima_actualizacion |
| `presupuestos` | id, oportunidad_id, codigo (COT-YYYY-NNNNN), monto_total, moneda, condicion_pago, plazo_entrega, validez, pdf_url, qr_url, fecha_envio, fecha_respuesta_cliente, estado (borrador/enviado/aceptado/rechazado/negociando), id_gbp_pedido, id_gbp_factura |
| `presupuesto_items` | id, presupuesto_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, subtotal, orden |
| `mails` | id, gmail_thread_id, gmail_message_id, oportunidad_id, direccion (entrante/saliente), de, para, asunto, cuerpo, fecha, adjuntos (JSONB), datos_extraidos_ia (JSONB) |
| `adjuntos` | id, mail_id, nombre_archivo, mime_type, path_storage, descripcion_ia |
| `recordatorios` | id, usuario_id, oportunidad_id, mensaje, fecha_recordatorio, completado, tipo (manual/automatico_estado/automatico_inactividad) |
| `notificaciones` | id, usuario_id, mensaje, link, leida, fecha_creacion |
| `configuracion` | clave (PK), valor (JSONB). Ejs: `ccs_default_solicitudes_compras`, `dias_alerta_sin_respuesta`, `plantilla_acuse_recibo` |

Convención: **nombres de tablas y columnas en español** (es el dominio del negocio); **nombres de funciones, variables, archivos y código en inglés**.

---

## 5.b Lógica de la IA al recibir un mail

Cuando entra un mail a la casilla comercial, el backend ejecuta esta cadena:

1. **Identificación del cliente por dominio**:
   - Extrae el dominio del remitente (ej. `juan@bencen.com.ar` → `bencen.com.ar`).
   - Busca en `dominios_cliente`. Si match → cliente identificado.
   - Busca el email completo en `contactos_cliente`. Si match → contacto identificado (con su rol: decisor/técnico/compras/logística).
   - Si el dominio es nuevo: la oportunidad queda con `cliente="por_identificar"`. El vendedor asigna manualmente y el sistema aprende (agrega el dominio).
   - Si el email es nuevo pero el dominio coincide: el sistema sugiere agregarlo como contacto nuevo del cliente existente.

2. **Extracción de datos del pedido (multimodal)**:
   - Gemini 1.5 Flash procesa **texto + imágenes** en la misma llamada.
   - Si el mail tiene texto claro → extrae cliente, producto, cantidad, requerimiento, plazo. Estado: `nueva`.
   - Si tiene **fotos adjuntas** (etiqueta, muestra, plano, pieza): Gemini analiza la imagen y genera descripción detallada (colores, formas, códigos visibles, números de pieza). Se guarda en `adjuntos.descripcion_ia`.
   - Si el pedido es **vago o incompleto** (falta producto, cantidad o info crítica): estado `requiere_aclaracion`, la IA prepara un borrador de mail para que el vendedor le pida los datos faltantes al cliente con un click.

3. **Clasificación del mail**:
   - Pedido nuevo a cotizar → crea oportunidad.
   - Respuesta a un presupuesto existente (detectado por hilo o por el código `COT-YYYY-NNNNN`) → linkea al presupuesto y notifica.
   - Ruido (spam, propaganda, consulta general) → archivado.

4. **Asignación al vendedor**:
   - Si el cliente ya tiene vendedor asignado → esa oportunidad va a ese vendedor.
   - Si es cliente nuevo → regla configurable (rotación, manual).

5. **Acuse de recibo automático** al cliente, personalizado con el nombre si el contacto está identificado.

### Parsing de la respuesta de Compras (Carlos Sayegh)

Cuando Carlos responde el mail de solicitud con la tabla habitual:

1. La IA detecta que es respuesta a una solicitud por el patrón del asunto: `RE: Solicitud {Vendedor}: {Cliente} - ID {N°}`.
2. Linkea el mail a la `solicitudes_compras` correspondiente vía `gmail_thread_id`.
3. Parsea la tabla del cuerpo (Gemini maneja muy bien tablas HTML, texto plano o pegadas desde Excel). Extrae cada fila como ítem estructurado: fabricante, SKU, descripción, cantidad, precio unitario USD, IVA, observaciones.
4. Guarda los items parseados en `respuestas_compras.datos_parseados_ia`.
5. Crea automáticamente un `presupuesto` en estado `borrador` con todos los items pre-cargados.
6. Notifica al vendedor: *"Carlos respondió tu cotización de {Cliente}. Hay un presupuesto borrador listo para revisar."*

El vendedor revisa, ajusta margen/descuentos/condiciones, click "Generar PDF" y "Enviar al cliente". Lo que antes era 10 minutos de copy-paste, ahora son 30 segundos de revisión.

### Recordatorios inteligentes con contexto

La IA no manda alertas genéricas. Usa el estado de la oportunidad, el último mail recibido y las fechas para generar mensajes accionables:

- *"Hace 5 días Carlos te respondió la cotización de AEROPUERTOS ARG 2K y todavía no la mandaste al cliente."*
- *"Mandaste el presupuesto a Juan (BENCEN) hace 7 días y no respondió. ¿Mando follow-up?"*
- *"La oportunidad COT-2026-00098 está marcada como ganada pero no cargaste el N° de pedido GBP. El dueño la está viendo en rojo."*

Tipos:
- **Manual**: vendedor pone "avisame el viernes" en una oportunidad.
- **Automático por estado**: reglas configurables que disparan según cambio de estado + tiempo.
- **Automático por inactividad**: si el vendedor no toca una oportunidad en X días (default 5), el sistema pregunta *"¿Sigue activa o la marco como perdida?"*.

---

## 5.c Handoff bidireccional con GBP

GBP no expone API utilizable, pero el enlace entre CRM y GBP es bidireccional y manual asistido:

```
CRM (COT-2026-00123)
  ↓ cliente acepta → pantalla "Listo para GBP"
GBP (vendedor crea Pedido N°4567 con COT-2026-00123 en Observaciones)
  ↓ vendedor pega N°4567 en el CRM
CRM (id_gbp_pedido = 4567)
  ↓ se factura en GBP
GBP (Factura N°8901 con COT-2026-00123 en Observaciones)
  ↓ conciliación mensual: admin sube reporte GBP
CRM (cruza por código en Observaciones, actualiza id_gbp_factura)
```

**Pantalla "Listo para GBP"**: aparece al marcar oportunidad como `ganada`. Muestra el código CRM destacado con botón "Copiar", todos los datos del pedido formateados para copiar a GBP, e instrucción explícita *"Pegá este código en Observaciones de GBP"*. Tiene un input para que el vendedor guarde el N° de pedido GBP de vuelta.

**QR en el PDF**: cada presupuesto generado lleva un QR en el footer que linkea a la ficha de la oportunidad en el CRM. Trazabilidad interna gratis.

**Conciliación mensual**: el admin sube el reporte de pedidos/facturas exportado de GBP (CSV/Excel). El sistema cruza automáticamente por el código CRM en Observaciones (o por importe + cliente si no está anotado). Muestra: *"Cotizaciones aceptadas: 47 | Cargadas en GBP: 42 | Facturadas: 38 | Pendientes de facturar: 5"*.

**Fase 2 (RPA con Playwright)**: confirmada viable porque **GBP corre en navegador**. Playwright abre GBP, crea el pedido con los datos del CRM, pone el código en Observaciones y captura el N° de vuelta. Elimina la carga manual. 1-2 semanas de desarrollo cuando se justifique por volumen.

---

## 6. Estructura del repo (monorepo)

```
crm-argcolor/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db/
│   │   │   ├── base.py
│   │   │   ├── session.py
│   │   │   └── models/        (un archivo por entidad)
│   │   ├── api/
│   │   │   ├── deps.py
│   │   │   └── v1/             (un router por recurso)
│   │   ├── services/           (lógica de negocio)
│   │   ├── integrations/
│   │   │   ├── gmail/
│   │   │   ├── ai/
│   │   │   │   ├── base.py     (clase abstracta AIProvider)
│   │   │   │   └── gemini.py   (implementación)
│   │   │   └── gbp/            (handoff manual / RPA)
│   │   ├── schemas/            (pydantic)
│   │   └── core/               (auth, security, exceptions)
│   ├── alembic/
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── app/                    (next.js app router)
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

---

## 7. Plan de fases (12 semanas totales)

| Fase | Duración | Entregables |
|---|---|---|
| **0** | 1 semana | Setup técnico: repo, hosting, Supabase, conexiones Gmail/Gemini, esquema DB inicial. Migración del JSON de Guido. |
| **1** | 3 semanas | Login Google OAuth, CRUD de clientes, oportunidades, formulario interno a Compras, tablero básico. Sin IA todavía. |
| **2** | 2 semanas | Integración IA: lectura automática de mails entrantes, creación de oportunidades, clasificación, acuse de recibo automático. |
| **3** | 3 semanas | Armador de presupuestos: catálogo de productos, ítems, descuentos, plantilla PDF, envío al cliente desde la plataforma. IA pre-armando el borrador. |
| **4** | 2 semanas | Recordatorios manuales, alertas automáticas, follow-up al cliente, plantillas de mail editables, handoff a GBP (resumen manual). |
| **5** | 1-2 semanas | Tablero avanzado, métricas por vendedor, búsqueda full-text, ajustes finos, capacitación. |
| **6 (opcional)** | 2 semanas | RPA con Playwright para automatizar la carga en GBP. Solo si el volumen lo justifica. |

---

## 8. Estado actual (qué ya está hecho)

> **Última actualización: junio 2026.** Fase 0 completa + login (Google OAuth) funcionando end-to-end en local.

### Configuraciones de Google Cloud (COMPLETADAS)
- Proyecto creado en Google Cloud Console.
- Budget alert de USD 1 configurado (no se va a cobrar nada sin alerta previa).
- Gmail API habilitada.
- Cloud Pub/Sub API habilitada.
- Credenciales OAuth 2.0 creadas (Client ID + Client Secret guardados).
- API Key de Gemini obtenida desde AI Studio (aistudio.google.com/apikey).
- **Redirect URIs configuradas**: `http://localhost:3000/api/auth/callback/google` y origen `http://localhost:3000`. Usuario de prueba (`santiago.c@argentinacolor.com`) agregado a la pantalla de consentimiento.

### Infraestructura (COMPLETADA)
- **Supabase**: proyecto creado (free tier, región `us-east-2`). Se usa Session Pooler con driver `psycopg` (`postgresql+psycopg://...`). En desarrollo local NO se usa Supabase, se usa Postgres en Docker.
- **GitHub**: repo privado `crm-argcolor` creado y con el código pusheado (rama `main`). Cuenta `santiclear1@hotmail.com`.
- **Render / Vercel**: cuentas a crear cuando se haga el deploy (todavía no conectadas).

### Scaffolding y entorno local (COMPLETADO en esta sesión)
- **Monorepo completo** generado (`backend/` FastAPI + `frontend/` Next.js 14), ~68 archivos de código. Ver estructura en sección 6.
- **Backend operativo**: 15 modelos SQLAlchemy, 16 endpoints (health, auth, CRUD de usuarios/clientes/oportunidades), capa de IA desacoplada (`AIProvider` + `GeminiProvider` stub). `pytest` pasa, `ruff` limpio.
- **Base de datos**: Postgres 16 corriendo en Docker (puerto host **5433** → contenedor 5432, para no chocar con un Postgres local en 5432). Primera migración de Alembic generada y aplicada (`alembic/versions/234f51c692a1_init_schema.py`): las 15 tablas existen.
- **Entorno Python**: `.venv` en `backend/` con dependencias instaladas (`pip install -e ".[dev]"`). Se agregaron al stack: `email-validator` (para `EmailStr`) y `[tool.setuptools] packages = ["app"]` en `pyproject.toml`.
- **Login funcionando end-to-end**: NextAuth (Google) → canje del `id_token` en `POST /api/v1/auth/login` → JWT propio del backend guardado en la sesión → inyectado en axios para autenticar la API. Guard de rutas (`AuthGuard`), manejo de errores en el login, sidebar con nombre de usuario y logout.
- **Usuario admin sembrado**: `santiago.c@argentinacolor.com` insertado en la tabla `usuarios` vía `python -m scripts.seed_user`.

### Cómo levantar el entorno local (3 terminales)
1. **Postgres**: Docker Desktop abierto + `docker compose up -d db` (desde la raíz).
2. **Backend**: desde `backend/` → `source .venv/bin/activate` → `uvicorn app.main:app --reload` (http://localhost:8000, docs en `/docs`).
3. **Frontend**: desde `frontend/` → `npm run dev` (http://localhost:3000).
- Variables: `backend/.env` (DATABASE_URL en puerto 5433, SECRET_KEY) y `frontend/.env.local` (GOOGLE_CLIENT_ID/SECRET, NEXTAUTH_*). Ninguno se commitea.

### Pendientes (próximos pasos en orden)
1. **Fase 1 — features**: CRUD de clientes (con contactos y dominios) en el frontend conectado al backend; oportunidades; formulario interno a Compras; tablero básico con semáforos.
2. **Deuda técnica / seguridad antes del deploy**:
   - **Rotar el `GOOGLE_CLIENT_SECRET`** (se expuso en chat) y actualizar `frontend/.env.local`.
   - **Actualizar Next.js** a una versión parcheada de la línea 14.2.x (la 14.2.5 tiene una vulnerabilidad de seguridad).
   - Revisar `12 vulnerabilities` reportadas por `npm audit`.
3. **Deploy** (cuando haya features que mostrar): Render (backend, apuntando a Supabase con Session Pooler), Vercel (frontend), variables de entorno en cada plataforma, redirect URIs de producción en Google Cloud. Opcional: UptimeRobot.

### Notas técnicas para tener en cuenta
- Se usó `timezone.utc` en vez de `datetime.UTC` por compatibilidad amplia.
- Los enums usan `str, enum.Enum` a propósito (serializan como string); ruff tiene `UP042`/`UP017` en ignore.
- El backend corre con `app.config.settings` que lee `.env` del **directorio actual** (por eso se ejecuta parado en `backend/`).
- Modo debug activo → SQLAlchemy loguea todas las queries (es esperable, no es error).

---

## 9. Variables de entorno necesarias

```bash
# Backend (.env)
DATABASE_URL=postgresql+psycopg://postgres:<password>@db.<proyecto>.supabase.co:5432/postgres
SECRET_KEY=<generar con `openssl rand -hex 32`>
AI_PROVIDER=gemini
GEMINI_API_KEY=<de aistudio.google.com/apikey>
GEMINI_MODEL=gemini-1.5-flash
GOOGLE_CLIENT_ID=<de Google Cloud Console>
GOOGLE_CLIENT_SECRET=<de Google Cloud Console>
GMAIL_TOPIC_NAME=projects/<gcp-project>/topics/gmail-incoming
ALLOWED_ORIGINS=http://localhost:3000,https://argcolor-crm.vercel.app

# Frontend (.env.local)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generar con `openssl rand -base64 32`>
GOOGLE_CLIENT_ID=<mismo que backend>
GOOGLE_CLIENT_SECRET=<mismo que backend>
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 10. Reglas de trabajo para el asistente AI

- **TypeScript estricto** en el frontend (`strict: true` en tsconfig).
- **Type hints obligatorios** en el backend (Pydantic v2 + SQLAlchemy 2.0 `mapped_column`).
- Nunca contraseñas en código; todo por variables de entorno.
- Nombres en código en inglés, nombres del dominio (tablas, columnas) en español.
- Comentarios concisos, solo donde el código no se explica solo.
- No agregar dependencias fuera del stack obligatorio sin avisarme primero.
- Cada archivo nuevo: mostrar el path completo y un resumen del contenido.
- Trabajar paso a paso, generar archivos en orden lógico (config → DB → modelos → migraciones → API → frontend).
- Cada 5-6 archivos, hacer un resumen y esperar confirmación.
- Si una decisión técnica tiene 2 alternativas razonables, presentar ambas y dejar elegir.

---

## 11. Primer sprint a desarrollar (Fase 0 + parte de Fase 1)

1. Crear estructura de carpetas del monorepo.
2. Generar `docker-compose.yml` con Postgres 16 (local) + backend + frontend.
3. `pyproject.toml` del backend con todas las dependencias (FastAPI, SQLAlchemy, Alembic, Pydantic v2, google-generativeai, google-api-python-client, weasyprint, apscheduler, pytest, ruff, python-jose, passlib).
4. `package.json` del frontend con Next.js 14, TypeScript, Tailwind, shadcn/ui, NextAuth.js, tanstack/react-query, axios.
5. Configurar SQLAlchemy: `Base`, session factory.
6. Crear los 15 modelos listados en la sección 5 (un archivo por modelo: usuarios, clientes, contactos_cliente, dominios_cliente, oportunidades, solicitudes_compras, respuestas_compras, productos, presupuestos, presupuesto_items, mails, adjuntos, recordatorios, notificaciones, configuracion).
7. Configurar Alembic, generar primera migración.
8. Endpoint health check `GET /health`.
9. CRUD básicos: `/api/v1/usuarios`, `/api/v1/clientes`, `/api/v1/oportunidades`.
10. Auth con Google OAuth (NextAuth en frontend, validación JWT en backend).
11. Frontend: layout base con sidebar (Dashboard, Oportunidades, Clientes, Presupuestos, Configuración), login, listado de oportunidades (tabla con shadcn/ui).
12. `README.md` con instrucciones de cómo levantar todo en local.
13. `.env.example` con todas las variables necesarias.
14. ruff + pre-commit en backend, eslint + prettier en frontend.

---

## 12. Preguntas frecuentes / contexto adicional

**¿Por qué Vercel y Render separados, no todo en Vercel?**
Vercel está hecho para Next.js (frontend). Sus serverless functions tienen timeout de 10 seg, no soportan procesos persistentes (scheduler) y complican generar PDFs con WeasyPrint. Render corre un contenedor Linux completo donde todo funciona sin problemas.

**¿Por qué Gemini y no Claude/GPT?**
Por el free tier (1.500 req/día sin pagar nada). Para extraer datos de mails, Gemini Flash es muy bueno. La arquitectura está desacoplada (clase `AIProvider`) así que cambiar a Claude más adelante es solo configuración.

**¿Por qué Supabase y no Railway/Render Postgres?**
Supabase tiene el free tier más generoso (500MB), dashboard incluido, backups automáticos, y es el más conocido. Render's free Postgres se borra a los 90 días.

**¿Qué pasa cuando el cliente acepta el presupuesto?**
El CRM marca la oportunidad como "ganada", genera un "resumen para GBP" (PDF o pantalla con todos los datos del pedido) y el vendedor lo carga manualmente en GBP. Solo los aceptados, que son muchos menos que los cotizados. En fase 2 esto se automatiza con Playwright si vale la pena.

**¿Cómo se maneja el catálogo de productos?**
Carga inicial vía importación de un Excel/CSV exportado desde GBP. Cada producto tiene código, descripción, precio base, moneda, categoría. Actualizable manualmente por admin. La IA puede sugerir precios basados en histórico al armar un presupuesto.

**¿Qué pasa cuando un cliente manda solo una foto sin describir el producto?**
Gemini 1.5 Flash es multimodal: analiza la imagen (etiqueta, muestra, pieza, plano) y genera una descripción detallada. Si aún así falta info crítica, la oportunidad queda en estado `requiere_aclaracion` y la IA prepara un borrador de mail al cliente pidiendo los datos faltantes. El vendedor lo revisa y manda con un click.

**¿Cómo distingue el sistema entre los distintos contactos de una misma empresa?**
Cada cuenta de cliente tiene una tabla `contactos_cliente` donde se cargan todos los contactos individuales con email, nombre, cargo y rol (decisor/técnico/compras/logística). Cuando entra un mail, el sistema busca el email exacto y, si lo encuentra, sabe qué persona escribió y qué rol tiene. Si es un email nuevo del mismo dominio, sugiere agregarlo como contacto nuevo.

**¿Cómo se asocia un dominio a una cuenta?**
La tabla `dominios_cliente` linkea uno o más dominios (ej. bencen.com.ar, bencen-industrial.com) a una cuenta. Cuando entra un mail desde `juan@bencen.com.ar`, el sistema extrae el dominio, busca match y asocia la oportunidad al cliente correcto sin intervención humana. Si el dominio es nuevo, el vendedor lo asigna a un cliente manualmente y el sistema lo aprende para futuros mails.

**¿Cómo se replica el flujo del Google Form actual?**
Se reemplaza por un formulario web dentro del CRM con los mismos campos exactos (solicitante, cliente, requerimiento, archivos, condición de pago, importe, fecha límite, ID GBP opcional). El mail a Carlos Sayegh sigue saliendo con el formato actual y los CC habituales (Marcos, Karen, Diego). Carlos no cambia nada de su trabajo. Lo único nuevo: todo queda registrado en el CRM y la IA parsea su respuesta automáticamente.

**¿Cómo se conectan CRM y GBP si GBP no tiene API?**
Con enlace bidireccional manual. El CRM tiene su propio código (COT-YYYY-NNNNN) que se pega en el campo Observaciones de GBP cuando se carga el pedido. El N° de pedido GBP se guarda de vuelta en el CRM en el campo `id_gbp_pedido`. Conciliación mensual con import del reporte de GBP. Fase 2: Playwright automatiza todo (GBP corre en navegador, así que es viable).

**¿Qué pasa si me olvido de cargar el N° de pedido GBP después de aceptar?**
El dashboard del dueño te lo marca en rojo y te genera un recordatorio: *"La oportunidad COT-2026-00098 está ganada pero no tiene N° de GBP cargado"*. La conciliación mensual también lo levanta.

---

## 13. Archivos relacionados

- **`CRM_Comercial_ArgColor_Documento_Tecnico.docx`**: documento técnico completo (14 secciones).
- **`PROMPT_INICIAL_VSCODE.md`**: prompt listo para pegar en Cursor / Claude Code y arrancar el scaffolding del proyecto.

---

## 14. Cómo continuar la conversación

El proyecto ya está scaffoldeado, corriendo en local y con login funcionando (ver sección 8). El próximo paso es **Fase 1: construir features**, empezando por el CRUD de clientes.

Si abrís una sesión nueva (Claude Code, Cursor, etc.), usá el prompt de la sección 15.

---

## 15. Prompt para continuar en Claude Code

> Pegá esto como primer mensaje en Claude Code, abierto en la carpeta raíz del proyecto (`crm-argcolor`).

```
Sos un desarrollador full-stack senior trabajando en el "CRM Comercial ARG COLOR", una web app interna para una empresa industrial argentina. Estás en la carpeta raíz del monorepo.

ANTES DE EMPEZAR:
1. Leé el archivo CRM_PROJECT_CONTEXT.md completo: tiene el contexto de negocio, el stack, el modelo de datos (15 tablas), la arquitectura y el estado actual.
2. Revisá la estructura real del repo (backend/ FastAPI + frontend/ Next.js 14) para ver qué ya existe.

ESTADO ACTUAL (resumen):
- Fase 0 completa: monorepo scaffoldeado, 15 modelos SQLAlchemy, 16 endpoints (health, auth, CRUD básicos de usuarios/clientes/oportunidades), capa de IA desacoplada (AIProvider/GeminiProvider stub).
- Postgres 16 en Docker (puerto host 5433). Migración inicial de Alembic ya aplicada (las 15 tablas existen).
- Login con Google OAuth funcionando end-to-end: NextAuth canjea el id_token en POST /api/v1/auth/login por un JWT propio del backend, que se inyecta en axios. Hay AuthGuard, sidebar con logout y un usuario admin sembrado (santiago.c@argentinacolor.com).
- Repo en GitHub (privado, rama main).

CÓMO LEVANTAR EL ENTORNO (3 terminales):
- Postgres: `docker compose up -d db` (Docker Desktop abierto).
- Backend: desde backend/ → `source .venv/bin/activate` → `uvicorn app.main:app --reload`.
- Frontend: desde frontend/ → `npm run dev`.
- Variables en backend/.env (DATABASE_URL puerto 5433) y frontend/.env.local (no commiteados).

LO QUE QUIERO HACER AHORA (Fase 1):
Construir el CRUD de CLIENTES en el frontend, conectado al backend, incluyendo sus contactos (contactos_cliente) y dominios (dominios_cliente). Concretamente:
- Backend: endpoints CRUD para contactos_cliente y dominios_cliente (anidados al cliente), con sus schemas Pydantic. Ya existe el CRUD base de clientes.
- Frontend: página /clientes con listado (tabla shadcn/ui), alta y edición de cliente, y gestión de sus contactos y dominios. Usar React Query + el cliente axios ya configurado (lib/api.ts) que ya manda el JWT.

REGLAS DE TRABAJO (respetar):
- Tablas y columnas en español; código (funciones/variables/archivos) en inglés.
- TypeScript estricto en el front; type hints + Pydantic v2 + SQLAlchemy 2.0 (mapped_column) en el back.
- Nada de secrets en código (todo por variables de entorno).
- No agregar dependencias fuera del stack sin avisar.
- Cada vez que cambies modelos, generar migración con Alembic (`alembic revision --autogenerate -m "..."` + `alembic upgrade head`).
- Correr pytest y ruff antes de dar por terminada una tanda de cambios.
- Trabajar paso a paso y, cada 5-6 archivos, hacer un resumen.

DEUDA TÉCNICA PENDIENTE (no urgente, pero tenerla presente):
- Rotar el GOOGLE_CLIENT_SECRET (se expuso) y actualizar frontend/.env.local.
- Actualizar Next.js a una versión parcheada de la línea 14.2.x (la 14.2.5 tiene una vulnerabilidad).

Arrancá leyendo el contexto y proponiéndome un plan de archivos para el CRUD de clientes antes de escribir código.
```

---

## 16. Estado técnico actual (actualización 2026-07)

> Esta sección **reemplaza/actualiza** lo que quedó viejo en las secciones 4–15 (que se conservan como historia). El proyecto ya está **en producción y en uso**. Fuente de verdad: el código del repo.

### 16.1 Infraestructura real (no la del "Plan A")

- **Frontend**: Next.js 14 (app router, TS estricto, Tailwind) en **Vercel** (deploy automático desde `main`).
- **Backend**: FastAPI en **Railway** (Docker). El arranque corre **`alembic upgrade head && uvicorn`** → **las migraciones se aplican solas en cada deploy**.
- **Base de datos**: **Postgres en Neon** (sa-east-1), a través del **pooler pgbouncer** (transaction mode), driver **psycopg3**.
- **Storage de archivos**: **Cloudflare R2** en prod (`STORAGE_BACKEND=r2`), local en dev. Se persiste la *key*, no la ruta (`app/services/storage.py`, con `delete_many` en lote para R2).
- **IA**: **Google Gemini** vía SDK **`google-genai`** (no `google-generativeai`). Interfaz desacoplada `AIProvider` (`extract_email_data`, `draft_quote`, `summarize_thread`). El **free tier (~20 req/día) rompe la ingesta en silencio** → hay que tener **billing activo** para uso real.
- **Gmail**: OAuth **por usuario** (Camino C): cada vendedor conecta su casilla en el login; el token se guarda **cifrado por usuario**. El scheduler (APScheduler) pollea todas las casillas conectadas; el botón "Sincronizar" manual pollea **solo la del usuario** (aislamiento anti-bandeja-cruzada).

#### Gotchas críticos de Neon/pgbouncer (romper esto tira TODA la conexión)
1. **NUNCA** pasar `options=-c statement_timeout` en `connect_args` → el pooler lo rechaza y caen todas las conexiones.
2. `prepare_threshold=None` obligatorio (psycopg no debe preparar statements server-side con pgbouncer en transaction mode).
3. **No** mantener una transacción abierta durante una llamada externa lenta (SOAP/HTTP) → Neon la mata por `idle_in_transaction_session_timeout`. Patrón: **commit por lote/página**. Ver `app/db/session.py` (keepalives + pool_pre_ping + pool_recycle=1800).

### 16.2 Gestión COMPARTIDA (todos ven todo)

Se **revirtió** el scoping personal: hoy **todos los usuarios ven y actúan sobre todo** (bandeja, oportunidades, cuentas, presupuestos, solicitudes, tareas). Los `_assert_owner(...)` quedaron **no-op**; `resolver_duenio(user, usuario_id)` es solo un filtro opcional (`usuario_id`) para la UI. Los toggles **Mías/Todas** son comodidad visual (default por rol: vendedor→Mías, admin/compras→Todas). Se audita quién hizo qué (`creado_por`, `editado_por`, etc.).

### 16.3 Bandeja / ingesta de mails (múltiples capas)

Pipeline en `app/services/ingest.py` (`process_incoming_email`). **Orden**: descartes automáticos → posventa → match cliente → **dedup** → descartes administrativos → IA → crear.

- **Dedup de conversación** (para no duplicar oportunidades), en orden: (0) mismo `rfc_message_id` (el MISMO mail entró a 2 casillas To+CC), (1) `References`/`In-Reply-To` (Message-IDs globales), (2) `gmail_thread_id`, (3) cliente + asunto normalizado, (3b) **remitente + asunto** (red de última instancia cuando el gateway del cliente rompe los headers, ej. Verallia). Si matchea, **adjunta** el mail a la oportunidad existente.
- **Descartes** (no crean oportunidad, quedan en `mails_descartados`): automáticos/bulk (headers List-Unsubscribe, Precedence, Auto-Submitted) y reacciones de Gmail; **posventa** por asunto (reclamo/garantía/RMA/…); **administrativo** por asunto (proforma/factura/remito/nota de crédito/orden de pago/…); **abastecimiento** = el hilo lo **originamos nosotros** (`@argentinacolor.com` como raíz del hilo) **y** pedimos cotización (lenguaje de comprador) → distingue "venta saliente" (SÍ es oportunidad) de "le pedimos a un proveedor" (NO); **orden de compra** en frío (OC ya emitida por el cliente).
- Match por **palabra completa** (regex `\b…\b`) para evitar falsos (ej. "rma" dentro de "proforma").
- **Guard de dominio propio**: un remitente `@argentinacolor.com` nunca matchea como cliente.
- **Lee adjuntos**: PDF va nativo a Gemini; planillas Excel (`openpyxl`) / CSV se convierten a texto y se anexan al cuerpo (los RFQ suelen traer los ítems en el adjunto). Se guardan también como `Adjunto`.

### 16.4 Propuestas de oportunidad (revisión previa)

Los mails **auto-ingestados por el polling** ya **no crean la oportunidad directo**: entran como **propuesta** (`Oportunidad.pendiente_revision=True`) → **no** aparecen en el listado/búsqueda ni disparan mails automáticos. Se revisan desde el indicador **"Propuestas (N)"** en la barra de Oportunidades (modal con cliente/asunto/**requerimiento**/**mail original**/**adjuntos**/**recibido en**), **compartido** (lo ve todo el equipo, con toggle Mías/Todos). **Aceptar** → entra al pipeline (misma fila, no duplica). **Rechazar** → se elimina y el mail queda descartado. La **carga manual** (`POST /mails/ingest`) sigue creando la oportunidad directo (`revisar=False`).

### 16.5 Oportunidades

- **Estados** (código DB / etiqueta UI): `nueva`, `requiere_aclaracion`, `en_compras`/"Enviado a compras", `cotizado_compras`/"Cotizado por compras", `presupuestada`/"Enviada al cliente", `confirmada`/"Confirmada / Pendiente", `ganada`/"Pago", `perdida`/"No avanzó". Terminales: `ganada`, `perdida` (confirmada NO es terminal). Vista **mensual** con arrastre de abiertas.
- **Requerimiento leído por la IA** (`Oportunidad.requerimiento`): se guarda al ingestar (producto+cantidad+detalle+plazo) y es **editable** en el form.
- **Transferencia entre vendedores**: `transferencia_para_id`; acción "Transferir a…" en el menú de fila → queda **pendiente** (sale de las "Mías" de ambos) hasta que el destinatario **acepta** (pasa a ser suya) o **rechaza** (vuelve). Indicador "Transferencias (N)" en la barra + banner en el detalle; notificación in-app.
- Orden por llegada (más antigua arriba), multi-select + borrado en lote, headers sticky al scrollear.

### 16.6 Pedir a Compras

- Enum `CondicionPago`: 15/30/45/60/120 días · Transferencia · **Cheque Anticipado a Entrega 15/30/60**. **Gotcha**: SQLAlchemy persiste el **NOMBRE** del miembro del enum como label de Postgres (ej. `dias_15`, `cheque_ant_15`), **no** el `value`. Agregar valores = `ALTER TYPE … ADD VALUE '<nombre>'` (migración con `autocommit_block`).
- En el modal se listan los **adjuntos de la oportunidad** (subidos + los que llegaron por mail) con una **X** para excluir; los que queden se copian a la solicitud y viajan en el mail a Compras (refs `op:<id>` / `mail:<id>`).

### 16.7 Sync de clientes GBP → CRM (ERP GlobalBluePoint)

- **One-way** (solo lectura del ERP), SOAP 1.1 (`app/integrations/gbp/client.py`). Filtra **`ck_id` 1/16/17** → "Clase de cliente" (Gremio/Corporativo/Gubernamental); el resto se ignora. Dedup por **CUIT** (normaliza 11 díg): **solo crea nuevos** (no re-matchea). Extrae dominios de los emails (omite públicos y el propio) para el match de bandeja.
- **Incremental**: precarga en memoria todos los CUIT/dominios existentes (2 queries) y saltea; solo inserta nuevos, así una re-corrida NO re-matchea los ~8200. **PERO tarda ~1-3h igual**: el **fetch SOAP** baja TODOS los clientes (el WS **no tiene filtro delta**) y es lento (medido: un dry-run corrió 2.5h+). La carga inicial (~8200) tardó ~4h (fetch + escrituras).
- **Optimización del fetch** (~4h → **~25 min**): conexión httpx keep-alive reutilizada + **páginas en paralelo** (`GBP_FETCH_CONCURRENCY=8`; la paginación es por número). El WS es lento por request (~12 s/página de 500).
- **Dos modos** (`app/services/gbp_sync.py`):
  - **full** (`sincronizar_clientes`): recorre todas las páginas (~25 min). Agarra **altas nuevas Y cambios en clientes existentes**. Al terminar guarda el **watermark** = max cust_id visto (`configuracion.gbp_last_cust_id`).
  - **incremental** (`sincronizar_incremental`): camina los cust_id **> watermark** de a uno (`GBPClient.fetch_customer(id)`, ~0.3 s c/u) hasta 40 inexistentes seguidos. Rápido (segundos/min). **LÍMITE: solo agarra ids NUEVOS**, NO cambios en clientes viejos (ej. uno que recién ahora recibe CUIT o cambia a Gremio con id bajo — el incremental lo saltea).
- **Estrategia (decidida 2026-07-31)**: **cron de madrugada = FULL** (07:00 UTC ≈ 04:00 ART, agarra todo) + **botón "Sincronizar GBP" (admin, en Cuentas) = incremental** (rápido, para traer altas del día al toque). Runner con lock anti-solape (`gbp_runner.py`). Endpoints: `POST /sync/gbp/run[?full=1]` + `GET /sync/gbp/status` (autenticados) y `GET /sync/gbp?token=…[&full=1]` (externo/token). Tiempo/resultado real en `/sync/gbp/status`.

### 16.8 Notas

Sección **"Notas"** (nav): bloc de notas **personal** por usuario, **multi-nota** estilo Apple Notes (lista lateral agrupada por fecha + editor), **autoguardado** (debounce, sin botón). Endpoints `GET/POST /notas`, `PUT/DELETE /notas/{id}`.

### 16.9 Patrones de UI a respetar

- **Modales** (`components/ui/modal.tsx`): se renderizan vía **portal a `document.body`**. Motivo: un ancestro con `transform` (ej. `-translate-y-1/2`) "atrapa" al `position:fixed` y achica el modal. Cierran con Escape o clic en el fondo **solo si el gesto empezó y terminó ahí** (para no perder datos al arrastrar una selección afuera).
- **ClientePicker** (`components/clientes/cliente-picker.tsx`): búsqueda doble — **N° de cliente** (sugiere al tipear; Enter = match exacto) y **nombre** (autocompletado ≥2 letras); cada sugerencia muestra `nombre | CUIT` + N°. Reusado en Nueva oportunidad, Cuentas y Tareas. Para dropdowns dentro de modales que se recortan, usar **dropdown en portal** (ej. el buscador de oportunidad en el modal de tarea).
- Colores/tokens semánticos (surface/line/ink/accent/navy). Los toggles activos usan **navy**; para no chocar, el "Aceptar" de propuestas va en verde y los botones aceptar/rechazar son íconos redondos (check verde / cruz roja).

### 16.10 Validación y flujo de trabajo (obligatorio antes de commitear)

- **Backend**: `ruff check app/ tests/` + `pytest` con **`DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib`** (WeasyPrint necesita las libs de Homebrew en macOS). `next build` local suele fallar por EAGAIN → la validación real del front es **`npx tsc --noEmit`** + **`npx next lint`**.
- **Git**: rama feature → commit → `git merge --ff-only main` → push. Commits terminan con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Migraciones**: cadena Alembic en `alembic/versions/`; se aplican solas en el deploy de Railway. Para verificar en prod, chequear `alembic_version` / `information_schema` contra Neon (verificar `current_database()=='neondb'` antes de cualquier escritura a prod).
- **Convenciones**: tablas/columnas en español, código en inglés; TS estricto; Pydantic v2 + SQLAlchemy 2.0 (`mapped_column`); nada de secrets en código.

### 16.11 Deuda técnica / pendientes

- Rotar `GOOGLE_CLIENT_SECRET`; actualizar Next.js 14.2.x; `npm audit`.
- GBP: resolver `provincia` (state_id vía `States_funGetXMLData`) y mapear `sm_id`→vendedor.
- Escribir el archivo de contexto no reemplaza la lectura del código: **verificar contra el código actual** antes de asumir.
