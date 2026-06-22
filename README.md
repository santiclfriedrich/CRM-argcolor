# CRM Comercial ARG COLOR

Web app interna para el equipo comercial de **ARG COLOR S.R.L.** Reemplaza el "CRM" casero en JSON y centraliza el ciclo de cotización: lectura de mails con IA, formulario interno a Compras, armador de presupuestos con PDF, tablero compartido y handoff manual asistido con el ERP GBP.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2.0 · Alembic · Pydantic v2 |
| Base de datos | PostgreSQL 16 (local) / Supabase (producción) |
| Frontend | Next.js 14 (app router) · TypeScript · TailwindCSS · NextAuth · React Query |
| IA | Google Gemini 1.5 Flash (capa desacoplada `AIProvider`) |
| Integraciones | Gmail API · Google OAuth 2.0 |
| Hosting | Vercel (frontend) · Render (backend) · Supabase (DB) |

## Estructura

```
crm-argcolor/
├── backend/          FastAPI + SQLAlchemy + Alembic
│   └── app/
│       ├── api/v1/         routers (health, auth, usuarios, clientes, oportunidades)
│       ├── core/           seguridad (JWT), auth Google, excepciones
│       ├── db/models/      15 modelos (un archivo por entidad)
│       ├── integrations/   ai (base + gemini), gmail, gbp
│       └── schemas/        Pydantic
├── frontend/         Next.js 14 (app router)
├── docker-compose.yml
├── .env.example
└── README.md
```

## Cómo levantar en local

Requisitos: Docker + Docker Compose.

```bash
# 1. Clonar y entrar
git clone <repo-url> crm-argcolor
cd crm-argcolor

# 2. Variables de entorno
cp .env.example .env
#   - SECRET_KEY:      openssl rand -hex 32
#   - NEXTAUTH_SECRET: openssl rand -base64 32
#   - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: de Google Cloud Console
#   - GEMINI_API_KEY:  de aistudio.google.com/apikey

# 3. Levantar todo (Postgres + backend + frontend)
docker-compose up -d --build

# 4. Aplicar migraciones
docker-compose exec backend alembic upgrade head
```

Servicios:
- Frontend → http://localhost:3000
- Backend → http://localhost:8000 (docs en `/docs`)
- Postgres → localhost:5432

## Migraciones (Alembic)

```bash
# Generar migración tras cambiar modelos
docker-compose exec backend alembic revision --autogenerate -m "descripcion"

# Aplicar
docker-compose exec backend alembic upgrade head
```

## Desarrollo sin Docker (opcional)

```bash
# Backend
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload

# Frontend
cd frontend
pnpm install
pnpm dev
```

## Convenciones

- **Tablas y columnas en español** (es el dominio del negocio); **código en inglés**.
- TypeScript estricto en el frontend; type hints obligatorios en el backend.
- Secrets solo por variables de entorno, nunca en el código.
- Lint: `ruff` (backend), `eslint` + `prettier` (frontend). Pre-commit configurado.

## Estado

Fase 0 (scaffolding) completa: estructura, modelos, migraciones, CRUD básicos, auth Google, layout del frontend. Próximas fases: integración IA (lectura de mails), armador de presupuestos, recordatorios y handoff a GBP. Ver `CRM_PROJECT_CONTEXT.md` para el plan completo.
