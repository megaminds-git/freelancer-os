# Freelancer OS

A monorepo that automates freelance project discovery, filtering, and proposal workflows.
This repository contains a browser extension (scraper), backend API, and a React dashboard.

Purpose: provide a reproducible local development environment and reference for contributors and maintainers.

-----

## Quick links

- Dashboard / frontend: [apps/web](apps/web)
- API server: [apps/api](apps/api)
- Browser scraper (Python): [apps/scraper](apps/scraper)
- Chrome extension: [apps/extension](apps/extension)
- Shared packages: [packages](packages)

-----

## Architecture (high level)

- Extension scrapes projects and sends results to the API.
- API applies filtering, deduplication, stores projects via Prisma (Postgres), and publishes automation state.
- Scraper (Python Playwright) supports complex browser sessions and can be invoked from the API.
- Redis is used for short-term caches and automation state.

<!-- architecture.html removed -->

-----

## Fast start (recommended)

Prerequisites: Node.js 20+, pnpm, Docker (for Postgres/Redis), Python 3.11+ if you run the scraper locally.

1) Start local infra (Postgres + Redis) with Docker Compose:

```bash
docker compose up -d
```

2) Install JS deps:

```bash
pnpm install
```

3) Generate Prisma client and run migrations (API container or locally):

```bash
pnpm --filter @freelancer-os/api prisma:generate
pnpm --filter @freelancer-os/api prisma:migrate:dev
```

4) Run all services for development:

```bash
pnpm dev
```

Individual services:

```bash
pnpm --filter @freelancer-os/api dev
pnpm --filter @freelancer-os/web dev
# Python scraper (optional)
python -m venv .venv && .venv\Scripts\activate; pip install -r apps/scraper/requirements.txt
python apps/scraper/api.py
```

-----

## Configuration

This project uses environment variables and secret values for configuration. Do not list or commit secret names or values in public documentation.

Refer to the private onboarding docs or the internal `.env.example` file for exact variable names and access instructions (access-controlled).

-----

## Backups & DB

Local DB is managed in Docker Compose. To export a plain SQL dump (works on Windows):

```powershell
# inside project root
docker exec freelancer_postgres sh -c "pg_dump -U freelancer freelancer_db -F p -f /tmp/freelancer_db.sql"
docker cp freelancer_postgres:/tmp/freelancer_db.sql ./backups/freelancer_db.sql
```

Keep `backups/` if you need saved dumps — do not delete without verifying.

-----

## Tools / scripts

- `pnpm dev` — start dev mode for all workspaces (concurrently).
- `pnpm build` — build all packages.
- `pnpm lint` — run linters.
- `pnpm typecheck` — run TypeScript checks.
- Prisma commands are available under the `@freelancer-os/api` package filters.

See `package.json` and workspace scripts for exact commands.

-----

## Testing & QA

- Unit and integration tests are colocated per package (add tests under `apps/*/tests` or `packages/*/tests`).
- Run tests with your preferred runner; CI should run `pnpm install && pnpm build && pnpm test`.

-----

## Common troubleshooting

- If the API can't connect to Postgres, ensure Docker Compose is up and `DATABASE_URL` points to the correct host/port.
- On Windows, prefer in-container dumps + `docker cp` instead of redirecting `docker exec` output.
- If scraping fails, check extension cookies and Playwright dependencies for the Python scraper.

-----

## Contributing

1. Create an issue describing the change.
2. Branch from `main` with `feature/<short-desc>`.
3. Add tests and keep changes scoped.
4. Open a PR and assign reviewers.

-----

## Where to look next

- API routes: [apps/api/src/routes](apps/api/src/routes)
- Extension entry: [apps/extension/background.js](apps/extension/background.js)
- Schema: [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma)

-----

License: MIT
