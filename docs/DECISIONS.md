# Implementation decisions

## Creator-private project portfolios and requirements document builder — 2026-09-27

The Projects portfolio is scoped to the authenticated creator in both list and direct-access authorization. Workspace membership remains necessary, but does not reveal another member's projects. This deliberately favors the requested personal-project model over workspace-wide collaboration; future sharing must be an explicit grant rather than an implicit consequence of membership.

Projects now carry a controlled type and expose source, requirement, test-case, approved, and draft counts. Search, type, progress, sorting, tile view, and list view are first-class portfolio controls; the selected view is stored in the browser.

Users without a BRD, PRD, or SRS can provide a short brief. The document builder produces an editable Markdown PRD that can be downloaded or submitted as a source into the existing extraction pipeline. Fixture mode is deterministic and requires no model key. External mode reuses the OpenAI-compatible adapter and still returns a reviewable document before ingestion. Markdown was chosen because it is portable, diffable, and already supported by the text extraction path; richer DOCX export remains a future enhancement.

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
