# TestPilot AI

Source-grounded requirements and human-reviewed test design. The implementation contract is [docs/BLUEPRINT.md](docs/BLUEPRINT.md); verified completion is recorded in [docs/GATES.md](docs/GATES.md). Generated cases are drafts and do not establish exhaustive coverage or release readiness.

## Prerequisites

- Node.js 24 and npm.
- Python 3.12 or newer, available as `python` (or set `PYTHON_BIN`).
- Docker Desktop running with Docker Compose.
- Available local ports 3000 (web), 55432 (PostgreSQL), and 56379 (Redis).

Next.js 16 serves the UI/API; Prisma 6 persists data in PostgreSQL. Redis/BullMQ provides background jobs. Python handles document extraction and workbook creation. Originals and exports use ignored local `var/` storage. Dependency versions are pinned in the lockfile.

## Fresh checkout boot

Run from the repository root in PowerShell:

```powershell
npm ci
Copy-Item .env.example .env
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r services/worker/requirements-lock.txt
(Get-Content .env) -replace "^PYTHON_BIN=.*$", "PYTHON_BIN=.venv/Scripts/python.exe" | Set-Content .env
docker compose -f infra/compose.yml up -d --wait
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Keep `npm run worker` running in a second terminal from the repository root. It handles extraction, generation, export, retries, and outbox recovery.

On macOS/Linux, install Python dependencies with `.venv/bin/python -m pip install -r services/worker/requirements-lock.txt` and set `PYTHON_BIN=.venv/bin/python` in `.env`. Replace `Copy-Item .env.example .env` with `cp .env.example .env`. Open http://localhost:3000/projects. The dashboard should display **Login & Password Reset**, stored in the seeded **Demo Workspace**. `DEMO_AUTH=true` selects the seeded demo tester and must not be used in production. No paid model key is needed: `GENERATOR_MODE=fixture` is the default. External model credentials, when configured, belong only in the ignored `.env` file.

## Verification

Keep the web server running while executing the boot integration gate in another terminal:

```powershell
npm run lint
npm run typecheck
npm exec vitest run tests/boot.test.ts
```

The boot gate makes real HTTP requests; it fails if the server, PostgreSQL, Redis, or seed are unavailable. `/health/live` checks the web process and `/health/ready` checks database and Redis connectivity. Run `npm test` for unit and integration tests, `npm run test:e2e` for the full browser journey and keyboard checks, and `npm run build` for the optimized build. Both web and worker must remain running for integration/browser tests. Tests create isolated projects in the current database; use a disposable local database for testing. Playwright defaults to installed Google Chrome; set `PLAYWRIGHT_CHANNEL=msedge` to use installed Edge. Override `APP_URL` for another local port. No paid model is used by tests; malformed external responses are tested against a private local mock.

## Seed and local reset

`npm run db:seed` is repeatable and preserves existing project edits. To erase all local database data intentionally and rebuild the demo:

```powershell
docker compose -f infra/compose.yml down -v
docker compose -f infra/compose.yml up -d --wait
npm run db:migrate
npm run db:seed
```

This reset removes the database volume; local `var/` files are separate. Stop the development server with Ctrl+C and stop infrastructure with `docker compose -f infra/compose.yml down` when finished.

## Repository and demo journey

`apps/web` contains pages/API; `packages/db` contains schema, migrations, and seed; `packages/contracts` contains API contracts; `services/worker` contains processing; `fixtures` contains sample documents; `infra` contains Compose; `tests` contains automated verification.

The complete journey is: create project → upload PDF/DOCX/TXT or paste a story → inspect and revise requirements → confirm an immutable snapshot → generate demo cases → edit and approve → inspect traceability → download XLSX. Consult the gate ledger for actual verification results. Deliberate contract changes belong in [docs/DECISIONS.md](docs/DECISIONS.md).

## External generation

Set `GENERATOR_MODE=external`, `MODEL_BASE_URL` (an OpenAI-compatible base URL such as an endpoint ending in `/v1`), `MODEL_NAME`, and optionally `MODEL_API_KEY`; restart web and worker. `MODEL_JSON_SCHEMA=false` uses JSON-object output when the provider does not support JSON schema responses. Settings displays the destination without credentials. Requirements and excerpts are sent only in explicitly configured external mode.

## Data and operational limits

See [data policy](docs/DATA_POLICY.md), [runbook](docs/runbook.md), [API usage](docs/API.md), [enterprise deployment](docs/ENTERPRISE.md), and [decisions](docs/DECISIONS.md). Development uses demo authentication and local storage. Enterprise mode adds OIDC, organization-backed tenancy, role gates, encrypted S3-compatible storage, ClamAV, OCR, Jira/Xray synchronization, containers, Helm and OTLP tracing. Target identity, object-storage and Jira configurations still require deployment-specific acceptance. Generated workbooks expire after 24 hours, and fixture generation always creates drafts.

## Reliability and automation workflow

The **Intelligence** tab in each project shows requirement change impact, human correction patterns, and generated Playwright assets. Confirming a revised requirement snapshot creates the change report automatically and sends affected linked cases back to review. Approve current cases before generating automation.

For managed billing, configure Stripe Checkout and webhook values from `.env.example`; forward Stripe events to `/api/webhooks/stripe`. The free plan allows three documents per month. The local demo seed is Pro and does not contact Stripe.
