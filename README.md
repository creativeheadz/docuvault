# DocuVault

A comprehensive IT documentation and asset management platform built with FastAPI and React. DocuVault provides a centralized hub for managing organizations, devices, passwords, domains, SSL certificates, documents, and more — with MeshCentral integration for remote device management.

## Features

- **Organizations** — Manage client/company records with hierarchical structure
- **Configurations** — Track servers, workstations, switches, and other devices
- **Systems** — AI-powered, chat-driven documentation for VMs, services, SaaS, and infrastructure. Co-author records with Claude over your MemPalace as the knowledge base
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
- **MemPalace + Anthropic Integration** — Tool-using LLM agent that searches your memory palace and drafts system records as you chat
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
| `ANTHROPIC_API_KEY` | Anthropic API key for the Systems chat (optional) | _empty_ |
| `ANTHROPIC_MODEL` | Anthropic model id | `claude-sonnet-4-6` |
| `MEMPALACE_URL` | FastMCP HTTP endpoint of your MemPalace server (optional) | _empty_ |
| `MEMPALACE_TOKEN` | Bearer token for MemPalace | _empty_ |

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
│   │   └── versions/          # Database migrations (001–006)
│   └── app/
│       ├── main.py            # FastAPI application entry point
│       ├── config.py          # Settings from environment
│       ├── api/v1/            # API route handlers (24 routers)
│       ├── models/            # SQLAlchemy ORM models (32 models)
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
| `/systems` | CRUD + chat | Chat-driven system documentation backed by Anthropic + MemPalace |

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

## AI-Powered Systems Documentation

The **Systems** page is a chat-first authoring surface for documenting any system in your stack — servers, VMs, SaaS apps, monitoring stacks, secrets vaults, identity providers, anything. Instead of filling a form, you describe the system to the assistant and it drafts the record live.

### How it works

Each chat turn runs a tool-use loop against the [Anthropic Messages API](https://docs.anthropic.com/en/api/messages) with three tools:

| Tool | Purpose |
|---|---|
| `search_palace` | Hybrid vector + BM25 search over your [MemPalace](https://github.com/) drawers |
| `read_palace_drawer` | Fetch a specific drawer's full content |
| `update_system_draft` | Apply a partial patch to the working record (snippets merge, tags/links replace) |

The full conversation — including `tool_use` and `tool_result` blocks — is persisted in `system_chat_messages`, so context replays across sessions. When a tool patches the draft, the affected fields flash in the live record panel.

### Setup

1. Set `ANTHROPIC_API_KEY` in `.env` (and optionally `ANTHROPIC_MODEL`, default `claude-sonnet-4-6`).
2. (Optional) Point `MEMPALACE_URL` at a FastMCP-compatible MemPalace endpoint and supply `MEMPALACE_TOKEN`. The chat works without MemPalace — it just won't pre-load context from your memories.
3. Restart the backend: `docker compose up -d backend`.
4. Open `/systems` → **+ New** → start describing the system.

### Data model

`systems` table holds:

- `name`, `slug`, `category`, `short_description`
- `body` (long-form markdown)
- `tags` (`text[]`)
- `snippets` (`jsonb` — short structured facts: hostname, ports, urls, owner, vault refs, etc.)
- `palace_drawer_ids` (`text[]` — links back to MemPalace drawers used as evidence)
- `status` (`draft` / `active` / `archived`)

Records are the single source of truth; export to markdown or other formats happens at the read layer.

## Roadmap

### Shipped

- ✅ **Live SSL/TLS expiration probe** — TLS-handshake button on each SSL Certificate row pulls the live `notAfter` (and issuer/SANs/key info) from the host. Wildcard CNs are auto-stripped; an explicit `host`/`port` override is supported on each record.
- ✅ **Cert chain inspection** — Expandable details row on the SSL Certificates page shows subject, issuer, serial, signature algorithm, key algorithm + size, full SAN list, and a colored health badge (red / amber / green) keyed off days-until-expiry.
- ✅ **Domain expiry auto-refresh** — RDAP lookup via [rdap.org](https://rdap.org/) bootstrap pulls registrar + expiration date for the Domains page. Raw RDAP response is stored in `whois_data` (jsonb) for later UI uses (nameservers, status flags surfaced in the expandable details panel).
- ✅ **Hostname auto-resolve when adding a Configuration** — Wand button next to the Hostname field (and on-blur if IP is empty) calls the backend's `getaddrinfo` and pre-fills the IP. Reports A/AAAA counts on success.

### Under exploration

- **MeshCentral deep-link to the correct device** — Today the Remote Desktop / Terminal buttons on the Configurations page open MeshCentral but land on a generic disconnected Desktop tab instead of the selected node. The URL built in `build_remote_url` (`?viewmode=11&gotonode=<id>`) needs the node id format MeshCentral actually accepts — likely the full `node//<meshid>/<id>` form, or a different param name on newer MeshCentral versions. Investigate against the running server, then fix so the session opens already attached to the device.
- **Keycloak integration** — Replace the seed-user JWT auth with OIDC against a self-hosted Keycloak realm. Carries SSO across the rest of the Old Forge stack.
- **Infisical secrets back-reference** — Let Password records optionally point at an Infisical secret path so the source of truth lives in Infisical and DocuVault keeps the operator-facing metadata (description, last-rotated, owner, audit log) without duplicating the actual value.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
