# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Run the full stack
```bash
docker compose up -d           # postgres :5433, backend :8000, frontend :3000
docker compose logs -f backend # tail backend logs
docker compose down            # stop; add -v to drop the pgdata volume
```
Migrations run automatically on backend startup (see `lifespan` in `backend/app/main.py`), and the seed user is created from `SEED_USERNAME` / `SEED_PASSWORD`.

### Backend (local, outside Docker)
```bash
cd backend
pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Requires `DATABASE_URL` (asyncpg) **and** `DATABASE_URL_SYNC` (psycopg2) — Alembic uses the sync URL, the app uses the async one.

### Migrations
```bash
cd backend
alembic upgrade head
alembic revision --autogenerate -m "description"   # then hand-review the generated file
alembic downgrade -1
```
Versions are numbered sequentially (`001_initial`, `002_core_assets`, …). Keep that convention when adding new ones.

### Frontend
```bash
cd frontend
npm install
npm run dev        # Vite dev server on :5173, proxies /api → :8000
npm run build      # tsc -b && vite build (type-check is part of the build)
npm run preview
```
There is no separate `lint` or `typecheck` script — `npm run build` is the type-check gate.

### Endpoint smoke test
`test_all_endpoints.py` at the repo root is an ad-hoc CRUD smoke test against a running backend (it expects `http://localhost:8000`). There is no pytest suite. Run with `python test_all_endpoints.py`.

## Architecture

### Backend layering (`backend/app/`)
Strict 4-layer split — keep new resources to this shape:

1. `models/<resource>.py` — SQLAlchemy 2.0 async ORM models (`AsyncAttrs` + `DeclarativeBase` from `models/base.py`).
2. `schemas/<resource>.py` — Pydantic request/response schemas.
3. `services/<resource>_service.py` — business logic; takes an `AsyncSession` and returns models/dicts. Routers should not query the DB directly when a service exists.
4. `api/v1/<resource>.py` — FastAPI router; depends on `get_db` and `get_current_user` from `core/dependencies.py`.

New routers must be imported and `include_router`-ed in **`backend/app/api/v1/router.py`** — that single file is the API surface aggregator under prefix `/api/v1`.

### Auth & encryption
- `core/dependencies.py::get_current_user` accepts JWTs from the `Authorization: Bearer …` header **or** an `access_token` cookie. The token must have `type == "access"` (refresh tokens use `type == "refresh"`).
- `core/encryption.py` (Fernet) encrypts password records. `ENCRYPTION_KEY` must be a base64-encoded 32-byte key — generate with `python -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"`. Rotating it invalidates every stored password.
- Two-factor auth (TOTP) is optional per user; routes live under `/api/v1/mfa`.

### Startup sequence (`backend/app/main.py`)
The FastAPI `lifespan` shells out to `alembic upgrade head` *before* the app starts serving, then calls `seed_user`. This means a broken migration takes the whole container down — fix the migration, don't bypass it.

### MeshCentral integration
`api/v1/meshcentral.py` + `services/meshcentral_service.py` talk to a live MeshCentral server via the `websockets` package (not HTTP). Sync imports device groups → organizations and devices → configurations; remote desktop / terminal URLs are minted on demand and opened in a new tab from the frontend. Credentials are stored encrypted in app settings.

### Frontend (`frontend/src/`)
- **Routing** (`App.tsx`): all authenticated routes are children of `<RequireAuth><AppLayout/></RequireAuth>`. Auth state lives in `store/authStore.ts` (zustand, persisted); `hooks/useAuth.ts` rehydrates the user on mount.
- **Server state**: TanStack React Query, single `QueryClient` in `App.tsx` with `retry: 1, refetchOnWindowFocus: false`.
- **Client state**: zustand — `authStore`, `themeStore`, `sidebarStore`. Don't reach for Redux/Context for new global state; add a zustand store.
- **API layer**: per-resource modules in `src/api/<resource>.ts` all import the shared axios instance from `src/api/client.ts` (which attaches the JWT and handles 401s).
- **Path alias**: `@/` → `src/` (configured in `vite.config.ts` and `tsconfig.json`). Use it for imports.
- **Vite proxy**: `/api/*` → `http://localhost:8000` in dev. In prod, Nginx (`frontend/nginx.conf`) proxies the same path to the backend container.
- **Forms**: React Hook Form + Zod resolvers. Reusable primitives are in `components/ui/` — prefer composing them over hand-rolling inputs.

### Adding a new resource (end-to-end checklist)
1. SQLAlchemy model in `backend/app/models/`.
2. Alembic revision (`alembic revision --autogenerate -m "add_<resource>"`); review the diff before committing.
3. Pydantic schemas in `backend/app/schemas/`.
4. Service in `backend/app/services/`.
5. Router in `backend/app/api/v1/<resource>.py`, then register it in `backend/app/api/v1/router.py`.
6. Frontend API module in `frontend/src/api/<resource>.ts`.
7. Page in `frontend/src/pages/`, plus a `<Route>` in `App.tsx` and a sidebar entry where appropriate.
