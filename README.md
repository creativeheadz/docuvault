# DocuVault

A comprehensive IT documentation and asset management platform built with FastAPI and React. DocuVault provides a centralized hub for managing organizations, devices, passwords, domains, SSL certificates, documents, and more — with MeshCentral integration for remote device management.

## Features

- **Organizations** — Manage client/company records with hierarchical structure
- **Configurations** — Track servers, workstations, switches, and other devices
- **Passwords** — Encrypted credential storage with access logging
- **Domains & SSL Certificates** — Monitor registrations and expiration dates
- **Documents** — Rich text editor with versioning, folders, and templates
- **Flexible Assets** — Define custom asset types with configurable fields and sections
- **Locations & Contacts** — Track physical sites and people per organization
- **Checklists & Runbooks** — Operational procedures with step tracking
- **Reports** — Data visualization and export (Excel)
- **Relationships** — Link any entities together with typed relationships
- **Flags** — Mark items for review or attention
- **Webhooks** — Event-driven notifications to external services
- **Audit Logging** — Full activity trail with field-level change tracking
- **Search** — Full-text search across all entity types
- **MeshCentral Integration** — Sync devices, view online/offline status, one-click remote desktop and terminal sessions
- **Two-Factor Authentication** — TOTP-based 2FA with QR code setup
- **Dark Mode** — Toggle between light and dark themes
- **Command Palette** — Keyboard-driven navigation (Ctrl+K)

## Tech Stack

### Backend
- **Python 3.13** with **FastAPI**
- **PostgreSQL 16** with **SQLAlchemy** async ORM
- **Alembic** for database migrations
- **JWT** authentication with refresh tokens
- **bcrypt** password hashing, **cryptography** for data encryption
- **WebSockets** for MeshCentral integration

### Frontend
- **React 19** with **TypeScript 5.7**
- **Vite 6** build tooling
- **TailwindCSS 3.4** styling
- **TanStack React Query 5** for data fetching
- **Zustand 5** for state management
- **TipTap** rich text editor
- **Recharts** for data visualization
- **Lucide React** icons
- **Framer Motion** animations
- **Zod** + **React Hook Form** for validation

### Infrastructure
- **Docker** & **Docker Compose** for deployment
- **Nginx** reverse proxy for frontend
- Auto-running database migrations on startup
- Automatic seed user creation

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### 1. Clone the repository

```bash
git clone https://github.com/creativeheadz/docuvault.git
cd docuvault
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and update the following values:

| Variable | Description | Default |
|---|---|---|
| `POSTGRES_DB` | Database name | `docuvault` |
| `POSTGRES_USER` | Database user | `docuvault` |
| `POSTGRES_PASSWORD` | Database password | `change_me` |
| `DATABASE_URL` | Async connection string | `postgresql+asyncpg://...` |
| `DATABASE_URL_SYNC` | Sync connection string (migrations) | `postgresql://...` |
| `SECRET_KEY` | JWT signing key | `change-this-to-a-random-secret` |
| `ENCRYPTION_KEY` | Base64-encoded 32-byte key for encrypting passwords | `generate-a-base64-encoded-32-byte-key` |
| `SEED_USERNAME` | Default admin username | `andrei.trimbitas` |
| `SEED_PASSWORD` | Default admin password | `change_me` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |

Generate an encryption key:

```bash
python -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

### 3. Start the application

```bash
docker compose up -d
```

This starts three containers:
- **postgres** — PostgreSQL 16 database (port 5433)
- **backend** — FastAPI application (port 8000)
- **frontend** — React app served by Nginx (port 3000)

Database migrations run automatically on backend startup.

### 4. Access DocuVault

| Service | URL |
|---|---|
| Application | [http://localhost:3000](http://localhost:3000) |
| API Documentation | [http://localhost:8000/docs](http://localhost:8000/docs) |
| Health Check | [http://localhost:8000/api/health](http://localhost:8000/api/health) |

Log in with the seed credentials configured in your `.env` file.

## Local Development

### Backend

```bash
cd backend
pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Requires a running PostgreSQL instance and environment variables set.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and proxies `/api/` requests to `http://localhost:8000`.

### Database Migrations

```bash
# Run migrations
cd backend
alembic upgrade head

# Create a new migration
alembic revision --autogenerate -m "description"
```

## Project Structure

```
docuvault/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/          # Database migrations (001–005)
│   └── app/
│       ├── main.py            # FastAPI application entry point
│       ├── config.py          # Settings from environment
│       ├── api/v1/            # API route handlers (23 routers)
│       ├── models/            # SQLAlchemy ORM models (30 models)
│       ├── schemas/           # Pydantic request/response schemas
│       ├── services/          # Business logic layer
│       └── core/              # Database, auth, encryption utilities
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    └── src/
        ├── App.tsx            # Router and app shell
        ├── api/               # Axios API client modules
        ├── components/
        │   ├── layout/        # Sidebar, TopBar, CommandPalette
        │   ├── ui/            # Reusable components (Button, Card, DataTable, etc.)
        │   ├── settings/      # Settings panels (MFA, MeshCentral)
        │   └── organizations/ # Organization-specific components
        ├── pages/             # 18 page components
        ├── store/             # Zustand state (auth, theme, sidebar)
        ├── hooks/             # Custom React hooks
        ├── types/             # TypeScript type definitions
        └── styles/            # Global CSS and Tailwind config
```

## API Overview

All endpoints are prefixed with `/api/v1`. Authentication is via Bearer token (JWT).

| Resource | Endpoints | Description |
|---|---|---|
| `/auth` | Login, refresh, profile | Authentication and user management |
| `/organizations` | CRUD | Client/company records |
| `/locations` | CRUD | Physical sites per organization |
| `/contacts` | CRUD | People per organization |
| `/configurations` | CRUD | Devices and equipment |
| `/passwords` | CRUD + decrypt | Encrypted credential storage |
| `/domains` | CRUD | Domain registrations |
| `/ssl-certificates` | CRUD | SSL/TLS certificate tracking |
| `/documents` | CRUD + versions | Rich text documents with versioning |
| `/flexible-asset-types` | CRUD | Custom asset type definitions |
| `/flexible-assets` | CRUD | Custom asset instances |
| `/attachments` | Upload/download | File attachment management |
| `/relationships` | CRUD | Entity-to-entity links |
| `/search` | GET | Full-text search |
| `/audit` | GET | Audit log entries |
| `/checklists` | CRUD | Task checklists |
| `/runbooks` | CRUD | Operational runbooks |
| `/reports` | GET | Report generation |
| `/flags` | CRUD | Item flagging |
| `/webhooks` | CRUD | Webhook configuration |
| `/settings` | CRUD | App settings, sidebar, IP whitelist |
| `/mfa` | Setup/verify | Two-factor authentication |
| `/meshcentral` | Settings, sync, remote URLs | MeshCentral integration |

Full interactive documentation is available at `/docs` (Swagger UI) when the backend is running.

## MeshCentral Integration

DocuVault integrates with [MeshCentral](https://meshcentral.com/) for remote device management.

### Setup

1. Navigate to **Settings** in DocuVault
2. Find the **MeshCentral** card and enter your server URL, username, and password
3. Click **Test Connection** to verify connectivity
4. Click **Sync Now** to import device groups as organizations and devices as configurations

### Features

- Device groups sync as DocuVault organizations
- Devices sync as configuration records with hostname, OS, and IP address
- Online/offline status badges on the Configurations page
- One-click **Remote Desktop** and **Terminal** buttons that open MeshCentral sessions in a new tab
- Extra device metadata (agent version, tags, power state) stored in JSONB

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
