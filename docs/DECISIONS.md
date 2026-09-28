# Implementation decisions

## Configurable agent foundation — 2026-09-28

Agent behavior is governed through versioned Markdown stored in PostgreSQL. Repository-defined content supplies platform defaults; organization and project versions are durable application data. Secrets remain external and model routes hold only a secret reference. Safety invariants are compiled into the linter and runtime rather than delegated to editable Markdown. Agent capabilities share one runtime, ledger and findings model instead of becoming separate services. The staged completion record is maintained in `docs/IMPLEMENTATION_LEDGER.md`.

## Managed identity browser session — 2026-09-28

The web product uses OIDC Authorization Code with PKCE, state, and nonce. The callback validates the provider-signed ID token and stores the access token only in a secure HTTP-only same-site cookie with an eight-hour maximum lifetime. Workspace pages use an early cookie-presence redirect for user experience; every API request remains the authoritative security boundary and independently verifies token signature, issuer, audience, expiry, user activation, and workspace access. Password entry, reset, email verification, and MFA stay at the identity provider. Dedicated TestPilot pages explain and hand off those flows without collecting credentials. Local demo authentication is disabled whenever `APP_ENV=production`.

## Capability-backed enterprise navigation — 2026-09-28

Workspace navigation is grouped into daily work, management, and administration. Operations and Billing are dedicated screens because both already have durable backend capability and distinct user intent. Planned privacy, prompt-management, CI/CD, and connector-conflict screens remain absent until their underlying workflows exist; displaying non-functional enterprise controls would misrepresent product readiness.

The sidebar scrolls independently on constrained laptop displays. Workspace KPIs use an explicit responsive grid because the prior generic metric style collapsed into an unreadable vertical stream at the in-app browser width. Project tabs retain all existing capabilities and use horizontal overflow at smaller widths.

## SCIM deactivation preserves governed history — 2026-09-28

SCIM 2.0 provisions users into one explicitly configured workspace and maps the primary directory role to the existing TestPilot roles. Provisioning authentication uses a long workspace-scoped bearer secret compared in constant time. Directory deletion and `active: false` deactivate the identity instead of deleting the user, membership, authorship, revisions, or audit identifiers. Authentication rejects inactive users. This preserves evidence while meeting the immediate offboarding requirement. A future privacy-erasure workflow must use policy-controlled anonymization rather than SCIM deletion.

SCIM intentionally advertises only the behavior implemented: Users, filtering by exact user name, Patch, and bearer authentication. Groups and bulk operations remain unsupported until their membership and partial-failure semantics are implemented and tested.

## Readiness includes queue lag — 2026-09-28

Readiness reports BullMQ waiting, active, delayed, failed, and completed counts together with the age of the oldest database job still marked queued. The endpoint returns 503 when that age exceeds `READINESS_MAX_QUEUE_LAG_SECONDS`, defaulting to five minutes. This catches a healthy Redis service with an unavailable or stalled worker, which a ping-only check cannot detect.

## Creator-private project portfolios and requirements document builder — 2026-09-27

The Projects portfolio is scoped to the authenticated creator in both list and direct-access authorization. Workspace membership remains necessary, but does not reveal another member's projects. This deliberately favors the requested personal-project model over workspace-wide collaboration; future sharing must be an explicit grant rather than an implicit consequence of membership.

Projects now carry a controlled type and expose source, requirement, test-case, approved, and draft counts. Search, type, progress, sorting, tile view, and list view are first-class portfolio controls; the selected view is stored in the browser.

Users without a BRD, PRD, or SRS can provide a short brief. The document builder produces editable Markdown that can be downloaded as Markdown or DOCX, or submitted as a source into the existing extraction pipeline. Fixture mode is deterministic and requires no model key. External mode reuses the OpenAI-compatible adapter and still returns a reviewable document before ingestion. Markdown remains the canonical authoring format because it is portable, diffable, and already supported by the text extraction path.

## Versioned authoring before desktop synchronization — 2026-09-27

New projects now lead users to upload a source or author one from a governed template. Authored documents are project-owned, versioned with optimistic concurrency, downloadable as Markdown or DOCX, and submitted through the same validated extraction pipeline as uploads. Editing a submitted document creates a new draft version before another extraction can be requested.

Custom WebDAV and automatic desktop Word synchronization were deliberately deferred. A correct implementation requires public HTTPS, complete lock and conflict semantics, expiring credentials, Office compatibility testing, and production storage controls. Download, local Word editing, and validated re-upload provide the useful workflow without claiming real-time synchronization. A later enterprise integration should prefer SharePoint Embedded or WOPI over a minimal custom WebDAV server.

## Enterprise BA brief fields and local recovery — 2026-09-27

AI briefs capture explicit in-scope and out-of-scope boundaries, integrations and system dependencies, and assumptions and risks. Missing values remain visibly marked for human review rather than being invented. Draft form values autosave in the current browser and can also be saved explicitly; once a project document exists, PostgreSQL revisions remain the authoritative durable history. Browser-local drafts contain product text, so production data-retention guidance must include clearing site data on shared devices.

## Phase 0–1 self-healing analysis boundary — 2026-09-27

The attached build plan is retained in `docs/BOOTSTRAPPED_BUILD_PLAN.md`. Its proposed root-level `pages`, `lib`, and `components` paths were adapted to the existing Next.js App Router workspace under `apps/web`. The authenticated endpoint is `/api/generate-prd`; existing `/api/v1` product contracts remain available.

All external BRD analysis output crosses one strict Zod boundary. Invalid JSON, extra fields, out-of-range completeness scores, or malformed Gherkin cause a repair prompt containing the exact parser issues. The engine makes at most three total attempts and then returns a generic human-review error without exposing model output. Deterministic fixture mode uses the same schema so local and paid-provider behavior share one client contract.

2026-09-26 — Preserve the blueprint stack. Next.js App Router, Prisma 6, PostgreSQL 17, Redis 7 and BullMQ. Local infrastructure binds only loopback. Node executes queue orchestration; Python handles extraction and workbook production. Milestone gates are recorded in GATES.md. No production authentication is claimed.

## Local runtime boundary — 2026-09-26

Docker Compose runs PostgreSQL and Redis with persistent named volumes; the Next.js app and TypeScript/Python worker run on the host. This matches the blueprint's local prototype recommendation, rather than providing a fully containerized deployment. A fresh checkout requires Node, Python, and Docker. Run both app and worker from the repository root so relative storage paths resolve consistently. The worker Python dependencies are pinned in `services/worker/requirements-lock.txt`.

## Bounded document processing — 2026-09-26

Alongside the contract's 10 MB upload and 50,000-character pasted-story limits, processing rejects PDFs over 1,000 pages, DOCX archives over 2,000 entries or 50 MB of declared uncompressed content, extracted text over 500,000 characters, and more than 1,000 requirement candidates per source. Each document job has a 120-second extraction timeout. These limits bound local processing cost; users split larger documents. Generation still has the separate contract limits of 100 requirements, batches of at most 10, and 500 cases. Scanned PDFs produce an explicit OCR-unsupported warning and no fabricated requirements. Paragraph segmentation is deterministic and requires human review, particularly with complex layouts.

## Atomic generation and retry — 2026-09-26

All provider batches are validated before a single transaction saves scenarios, cases, links, citations, and initial revisions. The prototype intentionally does not retain partially successful batches. A malformed batch fails the run without saving partial drafts; retry regenerates the whole run against its immutable input snapshot. This implements the blueprint's safe-failure alternative without introducing a partial-success status. BullMQ retries are bounded with exponential backoff, and the transactional outbox plus queue recovery prevents committed requests being stranded after restart. Stable codes are allocated transactionally only when validated output commits.

The default fixture provider produces deterministic review candidates, with inferred setup or unspecified conditions labeled for review. It is not an exhaustive test-design engine. The external adapter uses an explicitly configured OpenAI-compatible `/chat/completions` destination, 60-second timeout, temperature 0, and strict schema output by default. Set `MODEL_JSON_SCHEMA=false` only for a compatible endpoint that supports JSON objects but not JSON Schema; server-side validation remains mandatory. No paid-provider live call is needed for local acceptance; malformed-provider behavior is tested using a local HTTP server.

## Coverage and export selection — 2026-09-26

Traceability excludes soft-deleted and rejected cases from active coverage. An included requirement is covered when at least one linked approved, non-stale case exists; active drafts or stale-only links mean needs review. No active link means uncovered. Excluded requirements remain visible with their reason but are omitted from uncovered counts. These states describe review/link status, never release readiness.

An all-status workbook includes rejected cases and their explicit review statuses for review completeness. Rejected cases still do not confer coverage. Approved-only exports select approved cases, including stale approved cases with prominent warnings, and preserve blank-case RTM rows for newly uncovered requirements. This separates the selected record set from coverage semantics. Export reads use one repeatable-read database transaction so all sheets agree even when another request edits a case concurrently.

## Workbook safety and retention — 2026-09-26

Exports contain exactly Summary, Requirements, Scenarios, Test Cases, RTM, and Warnings. User-supplied values beginning with formula-significant characters, including after whitespace/control characters, are written as escaped literal strings. Cells exceeding Excel's 32,767-character limit are safely truncated and identified on Warnings; complete records remain in the application. Unicode names and cells are preserved. No formulas or macros are generated.

Private UUID-named XLSX files expire after 24 hours. The running worker checks expired exports every 60 seconds and deletes only recorded UUID `.xlsx` files, never source originals. Downloads require workspace membership and reject expired/unavailable artifacts; a new idempotency key creates a fresh export. Metadata and audit history remain. Full retention/deletion policy, malware-scanner integration, encryption at rest, backup automation, production authentication, and independent security review remain production requirements; the prototype must use non-sensitive sample data.

## Enterprise identity and tenant boundary — 2026-09-26

Enterprise API authentication verifies OIDC JWTs against issuer, audience and remote JWKS. SAML uses an enterprise identity broker that emits OIDC tokens; direct SAML assertion parsing is excluded to avoid maintaining a second session and signature-validation stack. Users are pre-provisioned and bind to the immutable provider subject on first login. Workspace membership remains the authorization edge, now anchored to an organization, with explicit role gates. This avoids unsafe generic Prisma middleware that would append tenant fields to models that do not own them.

## Enterprise storage and integrations — 2026-09-26

Local storage remains available for development and single-host Compose. Production may use the S3 adapter with KMS or managed AES-256 encryption. ClamAV fails closed when enabled. OCR is page-level Tesseract fallback with warnings and human confirmation; it does not claim semantic reconstruction of arbitrary complex tables.

Jira/Xray credentials remain in the deployment secret manager and are represented in database configuration as environment-managed. Push creates or updates approved cases and persists external mapping hashes. Pull imports remote title and Xray steps into a new local draft revision so external edits cannot silently remain approved. Jira/Xray schemas vary by edition and configuration, so target-instance field mapping is an explicit rollout check.

## Roadmap reliability and commercial controls

The roadmap phases are implemented as product capabilities while keeping external activation separate from code completion. A 20-document anonymized regression corpus enforces a maximum five-percent regression budget. BRD output receives an independent deterministic grounding and negative-path critique after schema validation. Human case edits and rejections persist as categorized feedback signals.

Requirement snapshot confirmation now persists an ADDED/MODIFIED/DELETED/UNCHANGED change set and moves every linked case affected by a modified or deleted requirement back to draft/stale review. This is deterministic stable-code comparison; the lexical similarity helper supports diagnostics but never suppresses a stable-code change, avoiding false negatives caused by an arbitrary semantic threshold.

Playwright artifacts are generated only from approved, non-stale cases. Ranked locator candidates are embedded in the generated source. Runtime fallbacks are reported as repair suggestions, and changing the artifact requires an explicit approve action. The product creates a governed suggested source revision rather than writing to a Git provider directly; repository PR creation remains an optional deployment integration.

Stripe is the sole payment authority. TestPilot stores subscription identifiers and status, verifies webhook signatures, and never handles card data. Free usage is measured from persisted source documents. The local seeded workspace is Pro to keep test fixtures independent of calendar usage.

## Enterprise portfolio and execution foundation — 2026-09-27

Project lists are paged at the server and status counts are aggregated in one grouped query. The UI no longer downloads the complete portfolio. Access supports owner-only projects, explicitly shared projects, and workspace-visible projects. Project lifecycle, risk, release, tags, archive state, and optimistic concurrency are durable fields. Project deletion is implemented as reversible archival so audit and traceability evidence remain intact.

Approved cases can be organized into test plans and environment-specific cycles, with accountable pass, fail, blocked, skipped, and not-run results. This is the first durable execution layer; evidence file upload, defect-provider linkage, scheduled runs, and CI runner orchestration remain later integrations.

Document-plan usage is recorded in an immutable idempotent ledger under a PostgreSQL advisory lock. This prevents concurrent uploads from bypassing a workspace limit and prevents deletion from reducing consumed usage. Stripe webhook event IDs are retained to reject replayed deliveries.

The browser receives CSP, frame, MIME, referrer, permissions, and cross-origin isolation headers. API throttling uses Redis and fails closed in production if the limiter is unavailable. Local deterministic demo mode receives a larger limit so repeatable integration suites can run without weakening deployed limits.

Workspace member provisioning creates an application identity record but does not send invitations or credentials. Production authentication remains authoritative in the configured OIDC/SAML identity provider. SCIM, access-review campaigns, device session controls, legal hold, customer-managed encryption keys, and database RLS are deliberately not represented as completed controls.

## User story governance backbone — 2026-09-27

The v2 product plan makes User Story a durable artifact between Requirement and Scenario. Stories use a database-enforced review state machine, immutable revision entries, AI or human author attribution, source-span evidence, many-to-many requirement links, reviewer reasons, and parent-child lineage. Grounded generation only operates on confirmed included requirements and refuses unlinked manual stories. A reverse coverage query identifies requirements without stories.

Approved story edits re-enter review. Split and clone children inherit requirement links; splitting archives the parent and flags linked scenarios and test cases for review. Self-approval is blocked in deployed environments unless `ALLOW_SELF_APPROVAL=true`; deterministic demo mode remains usable by one seeded administrator. Scenario persistence now records an approved story when a generated scenario shares one of its requirement links.

## External connector activation boundary — 2026-09-29

Connector records store secret-manager references, never OAuth tokens or API keys. The current Stage F foundation validates revision mapping, tenant authorization, conflict persistence and reviewer resolution without making arbitrary outbound requests. Provider-specific Confluence, Microsoft Graph and Figma transports require controlled sandbox credentials and fixed provider allowlists before activation. This boundary prevents SSRF-prone generic URL fetching and avoids claiming that metadata simulation proves vendor API compatibility.
