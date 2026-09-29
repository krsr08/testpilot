# Local operation and recovery

Run commands from the repository root. The local app and worker share `.env`, PostgreSQL, Redis, and the private `STORAGE_DIR`. Keep the app and worker running in separate terminals. Docker Desktop must be running.

## First boot on Windows PowerShell

```powershell
npm ci
Copy-Item .env.example .env
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r services/worker/requirements-lock.txt
```

Set `PYTHON_BIN=.venv/Scripts/python.exe` in `.env`. Leave `GENERATOR_MODE=fixture` and `DEMO_AUTH=true` for the local demo. Then initialize services and data:

```powershell
docker compose -f infra/compose.yml up -d --wait
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal at the repository root:

```powershell
npm run worker
```

Open `http://localhost:3000/projects`. The seeded account is `demo@testpilot.local`; login is bypassed only in local demo mode. The seed is repeatable and does not overwrite user edits. Production deployment is outside this local prototype; `APP_ENV=production` must not permit demo access.

On macOS/Linux, use `cp .env.example .env`, `python3 -m venv .venv`, `.venv/bin/python -m pip install -r services/worker/requirements-lock.txt`, and set `PYTHON_BIN=.venv/bin/python`. The npm and Docker commands are unchanged.

## Demo journey

Create a project, upload `fixtures/sample-login.pdf` or `fixtures/sample-login.docx`, and wait for extraction. Inspect the paragraph/page excerpts, revise or exclude requirements, then confirm the immutable snapshot. Generate Demo cases, edit expected results, approve selected drafts, inspect coverage and warnings, and export either all statuses or approved-only. `fixtures/sample-login.txt` supports text import; `fixtures/scanned.pdf` exercises the explicit OCR warning. Reopening the app retains changes in PostgreSQL.

To rebuild the sample binary fixtures after intentionally changing their text:

```powershell
.venv/Scripts/python.exe fixtures/generate_samples.py
```

## Verification

Keep the app, worker, PostgreSQL, and Redis running:

```powershell
npm run lint
npm run typecheck
npm test
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run build
```

The test suite exercises a real local database and creates uniquely named test projects. It is intended for the seeded development database, not customer data. Tests include real Python document extraction and actual workbook introspection. `docs/GATES.md` records milestone results and actual executed commands.

For a production-mode local Next.js build preview, stop `npm run dev`, run `npm run build`, and then `npm run start`; keep the worker in its own terminal. This is still a local demo, not a production authentication implementation.

## Health and job recovery

`/health/live` checks the web process; `/health/ready` checks PostgreSQL and Redis. Inspect `docker compose -f infra/compose.yml ps` for service health. Jobs expose stage, progress, attempt, and a sanitized error through `/api/v1/jobs/:id`.

If jobs remain queued, confirm `npm run worker` is running from the repository root and that its `DATABASE_URL`, `REDIS_URL`, `STORAGE_DIR`, and `PYTHON_BIN` match the app. The worker publishes committed outbox entries every two seconds and repairs missing Redis jobs from persisted queued/running jobs. Restarting the worker safely resumes processing; successful sources/runs are idempotent and do not duplicate their derived records.

If extraction reports Python unavailable, verify `.venv/Scripts/python.exe --version` and reinstall the pinned worker requirements. Invalid files, password-protected PDFs, and unsupported scanned content require corrected input; retries cannot supply missing OCR. The app retains actionable failure messages without logging raw document text.

For external generation, configure `GENERATOR_MODE=external`, `MODEL_BASE_URL`, `MODEL_NAME`, and `MODEL_API_KEY` if required by the endpoint, then restart app and worker. The base URL should include the API prefix, for example `https://provider.example/v1`; the adapter appends `/chat/completions`. The configured destination receives reviewed requirement text and source excerpts. Keep fixture mode for private sample-only testing without third-party transfer. Never put API keys in committed files or screenshots.

After a generation failure, prior successful snapshots and user edits remain. Use the retry action for the failed job; repeated creation with the same idempotency key identifies the same request. A new generation against a changed requirement set requires confirming a fresh snapshot. Concurrent case edits return `409 VERSION_CONFLICT`; reload the current version before applying a deliberate correction.

## Exports and storage

All six workbook sheets come from one consistent database snapshot. Exports expire after 24 hours; the running worker removes expired `.xlsx` files every 60 seconds. Original uploaded sources are retained under private UUID storage keys. Expired exports must be requested again using a new idempotency key. Do not expose `var/` through a static/public web directory.

Approved-only exports can uncover requirements that had only draft or rejected cases. Warnings retain these gaps, stale-case notices, inferred assumptions, and any Excel cell truncation. Rejected cases appear only in all-status exports and never increase active coverage.

## Shutdown, backup, and intentional reset

Use Ctrl+C in the app and worker terminals. Stop services without deleting data:

```powershell
docker compose -f infra/compose.yml down
```

Back up PostgreSQL and private storage together. The production Compose profile creates a checksummed database dump and storage archive, then verifies restoration into an isolated temporary database:

```powershell
docker compose -f infra/compose.prod.yml --profile backup run --rm backup
docker compose -f infra/compose.prod.yml --profile backup run --rm restore-verify
```

Backup files are written to the ignored `backups/` directory. Copy completed sets to encrypted immutable storage and apply the organization's retention policy. A backup is not considered successful until restore verification passes.

The following intentionally erases the entire local database and Redis volumes. It does not erase `var/` files:

```powershell
docker compose -f infra/compose.yml down -v
docker compose -f infra/compose.yml up -d --wait
npm run db:migrate
npm run db:seed
```

After resetting, restart app and worker. Do not use these destructive reset commands on data you need to retain.
