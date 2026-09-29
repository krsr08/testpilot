# Enterprise deployment

Milestones 5–9 add organization-backed workspaces, OIDC bearer-token authentication, role gates, S3-compatible encrypted object storage, fail-closed ClamAV scanning, OCR fallback, strict generation and approval validation, Jira/Xray export, production containers, Helm workloads, and optional OTLP tracing.

## Identity and tenancy

Set `DEMO_AUTH=false`, `APP_ENV=production`, and configure `OIDC_ISSUER`, `OIDC_AUDIENCE`, and `OIDC_JWKS_URL`. API clients send the provider access token as a Bearer token. Existing users are provisioned by an administrator and are bound to the token subject on first successful authentication. SAML identity providers should be connected through an identity broker that issues standards-compliant OIDC tokens. Roles are ADMIN, QA_LEAD, TESTER, and VIEWER. Approval, rejection, bulk review, and Jira synchronization require ADMIN or QA_LEAD.

Every workspace belongs to an organization. Project access always traverses workspace membership, which prevents cross-organization record discovery. Production database credentials must not grant bypass-RLS privileges; application-level scope checks remain mandatory for every endpoint.

## Storage, scanning, and OCR

Set `STORAGE_MODE=s3`, bucket/region credentials, and optionally `AWS_S3_ENDPOINT` for an S3-compatible service. Objects use KMS encryption when `AWS_KMS_KEY_ID` is set and AES-256 managed encryption otherwise. Enable ClamAV with `CLAMAV_ENABLED=true`; scanner errors fail uploads closed. The worker stages private objects in the operating-system temporary directory and deletes stages after processing.

Tesseract is included in the worker image. Image-only PDF pages use OCR at 300 DPI and carry a review warning. OCR output remains untrusted and requires human confirmation.

## Jira/Xray and telemetry

Configure `JIRA_BASE_URL`, `JIRA_TOKEN`, and `JIRA_PROJECT_KEY`. `POST /api/v1/projects/{id}/integrations/jira/sync` accepts `caseIds` and `direction` (`push` or `pull`). Only approved cases are pushed. Pulling creates a new draft revision from the mapped Jira title and Xray steps. The endpoint records audit events with external keys and content hashes. Jira/Xray fields vary by installation, so validate the Test issue type and Xray steps field against the target instance before rollout.

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to enable automatic Node.js tracing. Secrets belong in a secret manager and the Helm `testpilot-secrets` Secret, never values files.

## Structural extraction agent

`EXTRACTOR_MODE=fixture` is the offline default. It deterministically groups wrapped clauses and filters titles, story wrappers, and short narrative headings when explicit acceptance criteria exist. Set `EXTRACTOR_MODE=external` with `MODEL_BASE_URL`, `MODEL_NAME`, and optionally `MODEL_API_KEY` to insert the source-grounded structural agent between raw file parsing and requirement persistence. The agent must cite contiguous source block IDs and copy requirement text from those blocks exactly. Unsupported text, invalid categories, malformed confidence values, or invented locators fail the job without saving partial requirements.

## Production launch

Build and run `infra/compose.prod.yml`, or deploy `infra/helm`. Run database migrations as a controlled pre-deployment job. Validate backup restoration, object retention, identity-provider logout, scanner availability, rate limits, Jira field mappings, and tenant deletion in the target environment before accepting production traffic.

Start from `.env.production.example` and run `npm run validate:production -- .env.production` before building a release. The validator rejects demo authentication, insecure public endpoints, local object storage, disabled malware scanning, incomplete OIDC/SCIM settings, missing telemetry, and weak or absent metrics authentication.

Prometheus-compatible operational metrics are available at `/health/metrics` only with `Authorization: Bearer $METRICS_BEARER_TOKEN`. The endpoint exposes queue depth, running work, 24-hour job failures/completions, failed exports, and the export error ratio. Readiness remains a separate unauthenticated orchestration probe.

Production Compose includes explicit backup and restore-verification jobs:

```sh
docker compose -f infra/compose.prod.yml --profile backup run --rm backup
docker compose -f infra/compose.prod.yml --profile backup run --rm restore-verify
```

Each backup set contains a PostgreSQL custom-format dump, the private storage archive, and SHA-256 checksums. Restore verification checks the archive and restores the database into a temporary isolated database before querying migrations and projects. Schedule the backup job externally, copy backup sets to encrypted immutable storage, define retention, and alert on either command failing.
