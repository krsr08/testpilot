# API usage

The machine-readable contract is [openapi.yaml](../packages/contracts/openapi.yaml), using OpenAPI 3.1 and JSON-compatible YAML. This document covers Milestones 0–3; consult the gate ledger for verification status. Export endpoints will be added with Milestone 4.

Base URL: `http://localhost:3000/api/v1`. JSON is used except multipart originals and binary downloads. Local demo access requires `DEMO_AUTH=true` and a nonproduction `APP_ENV`; it selects the seeded user. Every project resource is checked against workspace membership. Mutations from a different browser origin are rejected. Do not expose demo mode to untrusted networks.

## Core sequence

1. `POST /projects` with `{"name":"Customer portal","description":"Login coverage","domain":"Account security","type":"APPLICATION"}` returns the project object, HTTP 201. Supported types are `APPLICATION`, `API`, `MOBILE`, `DATA`, `INTEGRATION`, `MIGRATION`, and `OTHER`. Projects are private to their creator: listing and direct project routes require `createdBy` to match the authenticated user.
2. `POST /projects/{id}/sources` accepts either multipart field `file` or JSON `{"text":"1. Users must sign in with valid credentials."}`. Response is HTTP 202, `{"source":{...},"job_id":"..."}`. PDF/DOCX/TXT originals must be nonempty and at most 10 MiB; MIME and extension must match. Pasted stories are capped at 50,000 characters.
3. Poll `GET /jobs/{job_id}` until `status` is `succeeded` or `failed`. Jobs expose `stage`, `progress`, and sanitized `error`; queueing is asynchronous and durable. `POST /jobs/{job_id}/retry` retains the job ID. Scanned PDFs finish with source warnings and no invented text.
4. Read `GET /projects/{id}/requirements?limit=100`. Records use camelCase: `stableCode`, `sourceLocator`, `excerpt`, `revision`, `version`. Edit with `PATCH /requirements/{id}` and `{"text":"Reviewed requirement","included":true,"version":1}`. Use the latest returned version for subsequent edits.
5. Confirm **all included** current requirements with `POST /projects/{id}/requirements/confirm`, body `{"requirements":[{"id":"...","revision":1}]}`. Response contains `snapshot_hash` and `snapshot_id`. Confirmation updates editable record versions; reload requirements afterward. Old snapshots remain immutable.
6. `POST /projects/{id}/generations` with `{"snapshot_hash":"<64-character hash>","types":["positive","negative"],"idempotency_key":"<unique request key>"}` returns HTTP 202 and `{"run":{...},"job_id":"..."}`. Poll the job. Reusing the same key with the same request returns the existing run; different settings return 409. Changed requirements require a fresh confirmed snapshot.
7. Read `GET /projects/{id}/test-cases?limit=100`. `cases` include `steps`, `links` with requirement records, `scenario`, and `citations`. Generated cases remain drafts for human review. `GET /projects/{id}/generations` returns the latest 50 runs and snapshot hash/date summaries.

## Supporting operations

- `GET /projects?search=login&type=APPLICATION&status=review-ready&sort=name-asc&limit=50&cursor=<UUID>` returns only the authenticated user's `projects` and `next_cursor`. Portfolio status filters are `all`, `in-progress`, and `review-ready`; sort values are `updated-desc`, `updated-asc`, `name-asc`, and `name-desc`. Requirements and cases use the same cursor convention, with keys `requirements` and `cases` respectively. Stop at a null cursor. Requirements support `status`; cases support `status`, `type`, and `requirement_id`.

`POST /document-builder` accepts a product brief with `title`, `projectType`, `overview`, `users`, `inScope`, `outOfScope`, `capabilities`, `businessRules`, `integrations`, `assumptionsRisks`, `constraints`, and `acceptanceCriteria`. Multiline fields are strings with one item per line where applicable. It returns a structured Markdown product requirements document with explicit scope, dependencies and risks. The fixture generator is deterministic by default; external generation uses the configured OpenAI-compatible adapter. Both browser entry points preserve form drafts locally before generation; project documents remain versioned in PostgreSQL. The browser can download the document or submit it directly to the normal extraction pipeline.

`POST /api/generate-prd` is the authenticated self-healing analysis endpoint used by both document-builder interfaces. It validates input, requests a strict `BRDAnalysis` containing a 0–100 completeness score, ambiguity flags with suggested rewrites, and parseable Gherkin features. External model output is parsed with Zod and retried with the exact validation feedback for at most three total attempts. Only validated analysis, retry count, and the rendered document reach the client; malformed model output is never returned. Fixture mode implements the same validated response contract without a paid model.

## Requirement authoring

- `POST /projects/{id}/authoring-documents` creates a persistent document from `SIMPLE_PRD`, `BRD`, `SRS`, `AGILE_STORIES`, `API_REQUIREMENTS`, `DATA_MIGRATION`, or `BLANK`.
- `GET /projects/{id}/authoring-documents` lists authored documents; `GET /authoring-documents/{id}` includes recent immutable revision metadata.
- `PATCH /authoring-documents/{id}` autosaves `title`, `content`, and the expected `version`. Stale versions return `409 VERSION_CONFLICT`; each successful save creates a revision.
- `GET /authoring-documents/{id}/download?format=docx|md` returns a private generated document with download and no-store headers.
- `POST /authoring-documents/{id}/process` registers the saved version as a source and queues normal source-grounded extraction. The same saved version cannot be submitted twice; editing and saving returns it to draft status.
- `GET /projects/{id}` returns actual counts, active sources and recent audit events.
- `GET /sources/{id}/download` returns a private original attachment. `DELETE /sources/{id}` soft-deletes it and derived requirements before generation; active extraction and existing generation runs prevent deletion.
- `POST /requirements/{id}/split` accepts `{"version":1,"texts":["First clause","Second clause"]}` and returns HTTP 201 with `requirements`. The original becomes excluded; children retain its evidence.
- `POST /projects/{id}/requirements/merge` accepts `{"requirements":[{"id":"...","version":1},{"id":"...","version":1}]}`. It returns the new requirement, HTTP 201. Parents must share a source; originals become excluded and the new locator preserves constituent references.
- `GET /settings` discloses generation mode, destination URL when external mode is enabled, model name, prompt version, storage mode and demo state. API keys are never returned.
- Outside the API prefix, `GET /health/live` checks the process and `GET /health/ready` checks PostgreSQL and Redis; readiness returns 503 when unavailable.

## Human review and traceability

`PATCH /test-cases/{id}` accepts the latest `version` and edited case fields (`title`, `type`, `priority`, `preconditions`, `testData`, `postconditions`, `rationale`, `reviewerNotes`, and `steps`). Each step contains `action` and `expectedResult`. Incomplete draft steps may be saved; approval enforces completeness. Changes retain history, available as `versions` from `GET /test-cases/{id}/history`.

`POST /test-cases/{id}/review` accepts `{"action":"approve","note":"Verified against source","version":2}`. Actions are approve, reject, and retain; retain requires an explanation when accepting a stale case after requirement changes. Approval requires valid steps and expected results. Requirement revisions mark linked cases stale and advance their versions, so reload before taking further action.

`POST /projects/{id}/test-cases` creates a manual case from `title`, `steps`, and optional `requirementIds`. `POST /test-cases/{id}/links` replaces links using `{"requirementIds":["..."],"version":1}`; an empty list creates an orphan, visible in traceability. Cross-project links are invalid.

`POST /test-cases/{id}/regenerate` accepts the current `version`, returns HTTP 202 with `run` and `job_id`, and preserves the previous case version. Wait for the job before reading the new version. Generation requires a confirmed current snapshot and included linked requirements. `POST /projects/{id}/test-cases/bulk-review` approves selected drafts using `{"cases":[{"id":"...","version":1}],"action":"approve","note":"Reviewed"}`.

`GET /projects/{id}/traceability` returns requirement rows with actual linked cases/scenarios and counts, plus uncovered requirements, orphan cases and warnings. Coverage means an active linked case exists; it does not establish quality or release readiness.

## Error handling

Errors have `{"code":"VERSION_CONFLICT","message":"...","field_errors":{},"request_id":"..."}`. HTTP 422 indicates request validation, 409 a version/state/idempotency conflict, 401 disabled demo authentication, 403 origin/access rejection, 404 inaccessible/missing resource, and 429 generation rate limiting. Version conflicts may carry `field_errors.current_version`. Reload and reconcile edits instead of blindly retrying a stale mutation.

Generation allows at most 100 snapshot requirements and 500 cases; provider requests are batched at 10 requirements. A project permits at most 10 new generation runs per minute and one active run per snapshot. The deterministic fixture provider is the default. External configuration sends reviewed requirements to the disclosed model destination and validates output before persistence; document text is data, never operating instructions.

## Reliability, billing, automation and impact APIs

- `GET /api/v1/projects/{id}/intelligence` returns persisted semantic change sets, correction categories, generation history and Playwright artifacts.
- `POST /api/v1/projects/{id}/feedback` records a classified human correction. Case edits and rejections also create feedback automatically.
- `POST /api/v1/projects/{id}/automation/generate` accepts approved, non-stale `testCaseIds` and creates versioned Playwright TypeScript drafts.
- `GET /api/v1/projects/{id}/automation/{artifactId}/download` downloads the private TypeScript draft.
- `POST /api/v1/projects/{id}/automation/{artifactId}/fallback` records a runtime selector fallback and creates a repair suggestion. The working selector must already be in the governed ranked candidate list.
- `POST /api/v1/projects/{id}/automation/{artifactId}/repairs/{suggestionId}` with `approve` or `reject` applies or rejects the repair under human control.
- `GET /api/v1/billing` returns the workspace plan and current monthly document use.
- `POST /api/v1/billing/checkout` is administrator-only and creates a managed Stripe subscription Checkout session.
- `POST /api/webhooks/stripe` accepts signature-verified Stripe lifecycle events. It is intentionally outside the authenticated application router and trusts only Stripe signatures.

The free plan allows three new source documents per workspace per UTC calendar month. The seeded local workspace uses a Pro sandbox subscription so demos and automated tests remain deterministic. Configure `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET` to activate Checkout; credentials are never sent to the browser.

## Enterprise portfolio, governance, and execution APIs

- `GET /projects?search=login&type=APPLICATION&status=review-ready&scope=mine&sort=name-asc&limit=24&page=1` returns a stable page plus `total` and `total_pages`. Scope values are `mine`, `shared`, and `workspace`.
- `PATCH /projects/{id}` updates project metadata, lifecycle, visibility, risk, release and tags with optimistic `version` concurrency. `DELETE /projects/{id}` performs a reversible archive.
- `GET|POST|DELETE /projects/{id}/members` manages explicit project access for workspace members.
- `GET|POST /projects/{id}/test-plans`, `POST /test-plans/{id}/cycles`, and `PATCH /test-executions/{id}` manage release execution evidence.
- `GET /search?q=...` searches accessible projects, requirements and test cases.
- `GET|PATCH /notifications` reads and acknowledges the current user's activity inbox.
- `GET|PATCH /profile/preferences` manages locale, timezone, notifications and reduced-motion preferences.
- `GET /projects/{id}/operations` reports recent jobs, generations and exports.

## SCIM 2.0 provisioning

SCIM uses the separate `/api/scim/v2` surface and a workspace-scoped bearer token configured through `SCIM_BEARER_TOKEN` and `SCIM_WORKSPACE_ID`. The token must contain at least 32 characters and must be stored in the deployment secret manager.

- `GET /api/scim/v2/ServiceProviderConfig` returns supported SCIM capabilities.
- `GET /api/scim/v2/Users` lists workspace users and supports `userName eq "value"` filtering.
- `POST /api/scim/v2/Users` provisions a user and workspace role.
- `GET /api/scim/v2/Users/{id}` reads a provisioned user.
- `PATCH /api/scim/v2/Users/{id}` changes `active`, `userName`, `displayName`, or the primary TestPilot role.
- `DELETE /api/scim/v2/Users/{id}` deactivates access while retaining governed history.

Deactivated users are refused by both demo and OIDC authentication. Deactivation does not destroy historical authorship or audit identifiers. Bulk and Groups endpoints are not currently advertised.

## Grounded user-story workflow

- `GET /projects/{id}/stories` returns stories with requirement evidence, revisions, downstream scenarios, external links, and reverse-coverage gaps.
- `POST /projects/{id}/stories/generate` creates deterministic, source-span-grounded stories for confirmed requirements that do not yet have a story.
- `POST /projects/{id}/stories` creates a manual story and requires one or more included requirement IDs.
- `PATCH /stories/{id}` edits with optimistic concurrency and returns approved material changes to review.
- `POST /stories/{id}/transition` applies submit, approve, reject, revise, and archive state transitions. Reject and archive require reasons. Production self-approval is blocked unless explicitly relaxed.
- `POST /stories/{id}/clone` preserves requirement links and lineage. `POST /stories/{id}/split` creates linked draft children, archives the parent, and flags downstream scenarios and cases for review.
- `GET /review-queue` returns workspace-accessible stories needing attention with aging metrics.
