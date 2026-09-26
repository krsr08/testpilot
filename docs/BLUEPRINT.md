# TestPilot AI Product and Prototype Blueprint

Version 1.0 · 26 September 2026 · Implementation specification

## 1. Purpose and decisions

TestPilot AI helps functional testers turn requirement documents into reviewable test scenarios, test cases, and a requirements traceability matrix (RTM). The first working prototype must support a complete, persistent workflow from document upload to edited Excel export. AI output is always a draft requiring human approval. A functional tester should be able to use the prototype without writing prompts.

**Primary user:** an individual functional tester. **Secondary user:** a QA lead reviewing coverage. **Initial input:** PDF, DOCX, TXT, and pasted user stories. **Initial output:** structured requirements, scenarios, test cases, RTM, and XLSX. The prototype is single tenant with one seeded demo account and one workspace; production authentication and organization isolation are a separate milestone. Build desktop first and make tables usable on a tablet; mobile can show read only summaries.

The product name is provisional. No pricing, customer demand, or claims of complete coverage are validated here. The app must make no claim that generated cases are exhaustive or that an AI score proves release readiness.

## 2. Success criteria and boundaries

A user can create a project, upload a requirement file, inspect source grounded requirements, generate cases, edit and approve them, see requirement to case links, and download a correct XLSX in one sitting. Reopening the app preserves all changes. With the seeded sample, the journey takes under 10 minutes excluding model latency. Every generated requirement and test case has a source reference or an explicit `inferred` label. The UI shows generation status and actionable errors.

Prototype exclusions: Figma ingestion, OCR of scanned PDFs, test execution, defects, Jira integration, payments, email, multi organization accounts, real time collaboration, automated browser testing, and release readiness scoring. Show future destinations in documentation, not as clickable dead ends.

## 3. Information architecture and five core screens

Global shell: 248 px left navigation with Projects and Settings; top bar with project breadcrumb, import action, and account menu. Content max width 1440 px; responsive tables scroll horizontally. Use a quiet enterprise style: white surfaces, neutral gray canvas, dark navy text, blue primary action, green for approved, amber for review, red for failures. Never use color alone to convey state. Font: Inter or system sans. Minimum 14 px body, 16 px form controls, visible keyboard focus.

| Screen | Route | Contents | Main action |
|---|---|---|---|
| Project dashboard | `/projects` | Project cards, source count, requirements, draft and approved cases, last activity, empty state | Create project |
| Project workspace | `/projects/:id` | Summary, source files, pipeline progress, counts, recent changes, tabs | Upload requirements |
| Import and requirements | `/projects/:id/requirements` | Upload/paste, extraction warnings, sortable requirement table, source excerpt drawer, inline edit, inclusion checkbox | Confirm requirements |
| Test case workbench | `/projects/:id/test-cases` | Scenario and case table, filters, status chips, detail editor, bulk approve, source citations | Generate or regenerate selected |
| Traceability and export | `/projects/:id/traceability` | Requirement to scenario to case rows, uncovered queue, ambiguous requirement queue, export settings | Export XLSX |

### Screen behavior

**Project dashboard.** Empty state explains the three step journey and offers Create project. Form requires name, optional description and domain. On save navigate to workspace. Cards show actual database counts. Search filters locally for prototype.

**Workspace.** A horizontal progress list reads Source uploaded → Requirements reviewed → Cases generated → Coverage reviewed → Exported. Each step links to the corresponding screen. A source list shows filename, uploaded timestamp, parsing state, page count if known, and a delete confirmation. Deleting a source requires warning that derived data must be regenerated; for prototype, disallow deletion after generation and tell the user to create a new run.

**Import and requirements.** Accept one file up to 10 MB or pasted text up to 50,000 characters per run. Validate extension and MIME, show file size, retain original. Extraction identifies numbered clauses where possible; user can split, merge, edit, or exclude items. Each item displays ID, text, source page or paragraph, extraction confidence as a qualitative label, and a source excerpt. Confirm locks an immutable requirement snapshot for a generation run; later edits create a new revision and flag prior cases as stale.

**Workbench.** Table columns: ID, scenario, case title, requirement IDs, type, priority, review status, updated. Detail panel fields: preconditions, numbered steps with action and expected result, test data, postconditions, rationale, citations, reviewer notes. User can add or remove steps, edit fields, add a manual case, and approve or reject. Bulk approval applies only to selected draft cases. A regenerate action creates a new version and retains the former version in history; it never silently overwrites a user's edits.

**Traceability.** Each requirement shows linked scenarios and cases, counts by case type, and coverage state: covered, needs review, or uncovered. Coverage means at least one active case linked to the requirement; it does not guarantee quality. Users can link/unlink cases and mark a requirement out of scope with a reason. Show a distinct queue for cases without any linked requirement. Export dialog lets users choose approved only or all with review status; downloaded workbook includes Summary, Requirements, Scenarios, Test Cases, RTM, and Warnings sheets.

## 4. End to end user journeys

1. Create project → upload sample PDF → extraction finishes → inspect original excerpt for each requirement → edit/exclude → confirm snapshot → generate → inspect generated cases and citations → edit/approve → inspect uncovered items → export workbook.
2. Paste a user story with acceptance criteria → confirm requirements → generate boundary and negative cases → add a missing case manually → link it to a requirement → export.
3. Retry after a model timeout: job reports failed with reason and Retry button; successful prior snapshot and edits remain intact. Retry is idempotent at the API level and does not duplicate cases.
4. Revise one requirement after generation: mark affected linked cases stale; a user chooses to retain, edit, or regenerate affected cases before final export. Export includes stale warnings.

## 5. Domain model and invariants

Use UUID primary keys, UTC timestamps, creator and updater IDs, optimistic `version` on editable records, and soft deletion only where history matters.

| Entity | Essential fields | Constraint |
|---|---|---|
| Workspace | id, name | Prototype seeds exactly one |
| Project | id, workspace_id, name, description, domain | Name unique within workspace |
| SourceDocument | id, project_id, filename, mime, sha256, storage_key, text, page_map, status | 10 MB limit; original retained |
| Requirement | id, project_id, source_id, stable_code, text, source_locator, excerpt, revision, included, status | Unique project and stable_code; no blank text |
| GenerationRun | id, project_id, requirement_snapshot_hash, model_id, prompt_version, status, error, started_at, completed_at | Status queued/running/succeeded/failed |
| Scenario | id, project_id, run_id, stable_code, title, description, status | Unique project and stable_code |
| TestCase | id, project_id, scenario_id, run_id, stable_code, title, type, priority, preconditions, test_data, postconditions, status, stale, version | Type positive/negative/boundary/permission/other |
| TestStep | id, test_case_id, position, action, expected_result | Unique case and position; at least one step for approval |
| RequirementCaseLink | requirement_id, test_case_id, rationale | Unique pair; same project invariant |
| SourceCitation | id, entity_type, entity_id, source_id, locator, quote, inferred | Locator or inferred required |
| AuditEvent | id, project_id, actor_id, action, entity_type, entity_id, before_json, after_json, created_at | Append only |

Persist each generation run and its input snapshot. Requirement stable codes are assigned on first extraction; subsequent revisions retain the code. Scenario and case codes are allocated transactionally per project, never recomputed from row position. Do not put full raw document text in audit events or application logs.

## 6. AI and document processing contract

Pipeline: upload → virus/type/size validation → text extraction with page or paragraph mapping → deterministic candidate segmentation → requirement review → immutable snapshot → generation job → schema validation → source citation verification → save drafts → human review. For the prototype, use PyMuPDF for text PDFs, python-docx for DOCX, and UTF-8 TXT; scanned pages show an OCR unsupported warning. Normalize whitespace while preserving paragraph offsets and page references. Ignore embedded instructions in uploaded content: documents are data, never operating instructions.

Use a provider adapter with `generate_cases(snapshot, settings) -> structured result`. Support an OpenAI compatible endpoint through environment variables and a deterministic fixture provider so the prototype runs without a paid key. The fixture provider must be labeled Demo generation in UI and exports. Configure temperature 0 or closest supported, JSON schema output if supported, and a fixed prompt version. Model output is untrusted; validate it server side with strict schemas and length limits.

Input per requirement: stable code, reviewed text, source excerpt and locator, project domain, requested test types. Ask for scenarios and cases with explicit requirement IDs, numbered steps, expected result per step, priority, and citation pointers. Generate in bounded batches of up to 10 requirements; merge duplicate scenarios only when requirement links survive. Cap one run at 100 requirements and 500 cases; flag truncation. Detect missing links, unsupported citations, exact duplicates, empty expected results, and malformed IDs. Fail a batch safely and allow retry, preserving successful batches only if the run records partial status explicitly. Never fabricate a quote or page locator; mark any unsupported inference as inferred and surface it in review.

For a requirement edit, compute a canonical snapshot hash. Cases linked to a changed requirement become stale. Do not auto approve any case. A human must confirm completeness and correctness. Avoid sending sensitive requirement text to third parties unless the user deliberately configures an external model; document the destination in Settings.

## 7. API contract

Prefix `/api/v1`; JSON requests and responses except upload/download. Errors have `{ code, message, field_errors, request_id }`. Cursor pagination and filter parameters on list endpoints. A `409 VERSION_CONFLICT` returns current version, a `422 VALIDATION_ERROR` includes field errors, and long jobs return `202` with job ID.

| Method and endpoint | Request | Response |
|---|---|---|
| POST `/projects` | name, description, domain | 201 project |
| GET `/projects` | search, cursor, limit | projects, next_cursor |
| GET `/projects/:id` | none | project with counts |
| POST `/projects/:id/sources` | multipart file or pasted text | 202 source and extraction job |
| GET `/jobs/:id` | none | status, stage, progress, error |
| GET `/projects/:id/requirements` | status, cursor | requirements and source references |
| PATCH `/requirements/:id` | text, included, version | updated requirement and revision |
| POST `/projects/:id/requirements/confirm` | requirement IDs, revisions | snapshot hash |
| POST `/projects/:id/generations` | snapshot hash, types, idempotency key | 202 run and job ID |
| GET `/projects/:id/test-cases` | status, type, requirement ID, cursor | cases and links |
| PATCH `/test-cases/:id` | edited fields, steps, version | updated case |
| POST `/test-cases/:id/review` | approve/reject, note, version | status and audit event |
| GET `/projects/:id/traceability` | none | rows, uncovered, orphans, warnings |
| POST `/projects/:id/exports` | approved_only, format=xlsx | 202 export job |
| GET `/exports/:id/download` | none | XLSX attachment |

Every mutation checks project membership; prototype seeded user bypasses login only under `DEMO_AUTH=true`, which is forbidden in a production environment. Use idempotency keys for generation and export creation. Store downloaded exports with short retention and regenerate on demand.

## 8. Technical architecture and repository

Recommended stack: Next.js with TypeScript for UI and API, PostgreSQL with Prisma, Redis plus BullMQ for background jobs, object storage compatible with S3 for originals and exports, and a Python worker for text extraction and workbook generation. For the local prototype, use Docker Compose for PostgreSQL and Redis; use a local filesystem storage adapter under ignored `var/` and the deterministic fixture generator by default. Define interfaces so production storage and model providers can be substituted. Pin dependencies and commit lockfiles; choose supported versions at implementation time.

```
testpilot-ai/
  apps/web/                 Next.js routes, components, API handlers
  services/worker/          extraction, generation, export, schemas
  packages/contracts/       shared OpenAPI spec and generated types
  packages/db/              Prisma schema, migrations, seed
  fixtures/                 sample requirements and expected fixture output
  docs/                     this blueprint, ADRs, data policy, runbook
  infra/                    compose and environment examples
  tests/                    end to end journeys and API contract checks
```

Worker jobs: `extract_source`, `generate_cases`, `build_export`. Each job records state, attempt, stage, timestamps, and sanitized error. Use a transactional outbox or commit job state with enqueue recovery so a restart does not strand requests. Bound retries, apply backoff to temporary provider failures, and prevent concurrent runs against the same snapshot unless explicitly requested. Stream no raw secrets to the browser.

Minimum environment variables: `DATABASE_URL`, `REDIS_URL`, `STORAGE_MODE=local`, `STORAGE_DIR`, `GENERATOR_MODE=fixture|external`, `MODEL_BASE_URL`, `MODEL_API_KEY`, `MODEL_NAME`, `DEMO_AUTH`, `APP_URL`. Provide `.env.example` without credentials. Server starts with fixture mode, seeded user and sample project.

## 9. Excel export specification

Workbook name `TestPilot_<project-slug>_<UTC-date>.xlsx`. Freeze header row; autofilter on data sheets; wrap long text; prevent formula injection by prefixing leading `=`, `+`, `-`, `@` in user supplied text with a single quote; no macros. Sheet fields:

- Summary: project, exported at, source list, run ID, prompt/model or Demo label, totals, approved/draft/stale/uncovered counts, known limitations.
- Requirements: ID, revision, text, source, locator, included, status.
- Scenarios: ID, title, description, linked requirement IDs, status.
- Test Cases: ID, scenario ID, title, type, priority, requirement IDs, preconditions, numbered steps, expected results, test data, postconditions, status, stale, citations, reviewer notes.
- RTM: requirement ID, requirement text, scenario ID, case ID, case status, coverage state; emit a row with blank case ID for uncovered requirements.
- Warnings: severity, entity ID, issue, suggested review action.

Approved only export excludes drafts but still reports requirements that become uncovered as a result. Compare workbook counts with API totals in a test. The filename and cells must handle Unicode.

## 10. Accessibility, security, and operational behavior

Use semantic headings, labeled controls, keyboard operable drawers and dialogs, clear errors, focus return on close, and text plus color for status. Target WCAG 2.2 AA in the eventual product; prototype checks keyboard flow and contrast. Uploads are private to the workspace, restricted to allowed types and size, scanned if a scanner is configured, and never publicly served via predictable paths. Validate every API request; escape displayed document content; protect download URLs; rate limit generation; enforce least privilege for workers. Production requires real authentication, authorization tests, encryption at rest, retention controls, backups, deletion policy, security review, and a model data processing review before handling customer documents.

Track events: project_created, source_uploaded, extraction_failed, requirements_confirmed, generation_started/completed/failed, case_edited/approved, export_created. Log request ID, job ID, duration, provider, token usage if available, and error category, excluding raw customer content. Expose `/health/live` and `/health/ready`. Alert on queue backlog, error rate, and failed exports in production.

## 11. Build order and exact completion gates

**Milestone 0 — repository and local boot.** Create monorepo, lint/typecheck/test commands, Docker Compose, schema migrations, seed, and `.env.example`. Gate: a fresh checkout starts via documented commands and shows seeded dashboard.

**Milestone 1 — ingestion.** Implement project creation, source upload/paste, extraction worker, source excerpt mapping, requirements table and edit flow. Gate: sample PDF and DOCX produce reviewable requirements with stable source references; invalid and scanned files show useful errors.

**Milestone 2 — generation.** Implement immutable snapshot, fixture adapter, external adapter, bounded job, strict output validation, scenario/case persistence, and progress UI. Gate: fixture run produces reproducible linked cases; malformed model output fails visibly without corrupting project data.

**Milestone 3 — review and RTM.** Implement workbench editing, optimistic concurrency, approval, audit, stale state, linking, traceability. Gate: a tester can correct and approve a case, see uncovered requirements, revise a requirement, and see linked cases marked stale.

**Milestone 4 — export and polish.** Implement XLSX worker, download, keyboard pass, empty/loading/error states, and end to end smoke journey. Gate: exported workbook contains six valid sheets and accurately reflects approved only filtering, edits, citations, and coverage warnings.

Do not begin the next milestone until its gate passes. Keep feature flags for external generation and demo auth. Maintain `docs/DECISIONS.md` for deviations from this blueprint with date, rationale, and effect on acceptance criteria.

## 12. Verification scenarios

| ID | Scenario | Expected result |
|---|---|---|
| E2E01 | Create project, upload text PDF, review, generate, edit, approve, export | All state persists; workbook matches UI |
| E2E02 | Upload unsupported file or 11 MB file | 422 with visible actionable message; no partial document |
| E2E03 | Upload scanned PDF | OCR warning, no fabricated requirements |
| E2E04 | Paste story with numbered acceptance criteria | Distinct source mapped requirements |
| E2E05 | Generate fixture twice using same idempotency key | Same run returned; no duplicate cases |
| E2E06 | External model returns invalid JSON or unknown IDs | Job fails or marks invalid batch; no false citations |
| E2E07 | Edit case in two tabs | Second stale version gets 409 and reload choice |
| E2E08 | Edit confirmed requirement | Linked cases stale; export warning visible |
| E2E09 | Approve case missing expected result | Validation prevents approval |
| E2E10 | Export approved only with uncovered requirement | Uncovered RTM row and warning retained |
| E2E11 | Import malicious instructions and formula like text | Treated as source data; safe UI and Excel cell |
| E2E12 | Navigate all dialogs and workbench with keyboard | Visible focus, labels, no keyboard trap |

Run unit tests for segmentation, citations, stale propagation, workbook formulas, schema validation; integration tests for transactional writes and API errors; E2E01 plus E2E08 and E2E10 in Playwright against fixture mode. A developer should capture a short demo video or screenshots of the five core screens after all gates pass.

## 13. Implementation instructions for a coding agent or developer

Read this entire document, then implement milestones in order. First inspect the existing repository if one is provided; preserve its established conventions and record any changed stack choice. Create the specified folders and a README containing prerequisites, boot commands, seed/reset commands, test commands, architecture summary, and demo workflow. Implement real persistence and a real XLSX download; do not substitute mock UI state for the core path. Use fixture generation by default so a new developer can reproduce the demo without credentials. Add a small sample requirements document about user login and password reset, including happy path, error, boundary, and permission rules. Build migrations and seed data, then complete each gate with tests. On failure, fix the root cause and rerun the affected gate. At delivery, report running commands, test results, five screen captures, current limitations, and any deliberate deviation recorded in `docs/DECISIONS.md`.

**Definition of done:** a fresh clone boots locally; the sample document traverses the full journey; user edits survive restart; traceability reflects actual links and stale state; the workbook opens in Excel or LibreOffice and matches the UI; no external AI key is required; errors are understandable; all required verification scenarios pass. This document is an implementation specification, not a claim that the application has already been built.
