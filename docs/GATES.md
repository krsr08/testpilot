# Completion gate ledger

No milestone passes by documentation alone. Record exact commands, actual results, and supporting observations below before starting the next milestone.

| Milestone | Required gate | Status |
|---|---|---|
| 0 — Repository and boot | Fresh schema boot follows documented sequence; seeded dashboard visible; real database/Redis readiness and seeded API pass | Passed |
| 1 — Ingestion | PDF and DOCX yield reviewable mapped requirements; invalid/scanned files show useful errors | Passed |
| 2 — Generation | Reproducible linked fixture cases; malformed model output fails without corrupting data | Passed |
| 3 — Review and RTM | Edit/approve cases; uncovered requirements visible; requirement changes mark linked cases stale | Passed |
| 4 — Export and polish | Six valid workbook sheets match edits, citations, approved filtering, and coverage warnings; keyboard and E2E verification | Passed |
| 5 — Tenancy and identity | Organization ownership, OIDC verification, tenant isolation and role gates | Passed |
| 6 — Storage, scanning and OCR | Encrypted object adapter, fail-closed ClamAV and OCR fallback | Passed |
| 7 — Quality and safety | Structural, citation, duplicate and approval validation | Passed |
| 8 — Jira/Xray | Approved-only push, mapped update, reviewed inbound synchronization and audit | Passed with mock-gated contract; target-instance mapping required |
| 9 — Production deployment | Standalone images, migration job, Compose health, Helm and OTLP tracing | Passed |

## Milestone 0 evidence

Required commands: README fresh boot sequence, `npm run lint`, `npm run typecheck`, and `npm exec vitest run tests/boot.test.ts` against the running app. The integration test requires PostgreSQL and Redis readiness, verifies the seeded project via list/detail endpoints, and checks dashboard HTML. A browser observation must additionally confirm that the seeded project renders after client loading.

Actual results (2026-09-26, reported by the implementation coordinator):

```text
docker compose -f infra/compose.yml up -d --wait   PASS
npm run db:generate                            PASS
npm run db:migrate                             PASS
npm run db:seed                                PASS
npm run lint                                   PASS
npm run typecheck                              PASS
npx vitest run tests/boot.test.ts               PASS: 3 tests
```

Dependencies were initially installed and pinned with `npm install --save-exact` and `npm install --save-dev --save-exact`. This was a fresh-schema local boot, not yet an observed fresh-clone `npm ci`; the latter remains a final verification obligation.

Browser evidence: headless Playwright launched installed Chrome using `chromium.launch({channel:'chrome',headless:true})`, opened `/projects`, and successfully waited for the **Login & Password Reset** heading. The bundled browser download timed out, so installed Chrome was the documented verification fallback. This confirmed seeded content after client loading, in addition to the HTTP tests.

## Milestone 1 evidence

`npx vitest run tests/integration/ingestion.test.ts tests/extraction.test.ts` passed on 2026-09-26: **2 test files, 12 tests**, duration 34.29 seconds. This run used the running application, PostgreSQL, Redis and extraction worker with installed Python dependencies. It verified PDF/DOCX/TXT ingestion, persistent revisions and version conflicts, stable source references, pasted criteria, rejected uploads, and scanned-PDF warnings. Earlier extraction attempts without installed PyMuPDF failed; dependency installation resolved that environment issue before this successful run.

Coordinator rerun passed **13 tests in 22.85 seconds**, including the new split/merge scenario. `npm run lint` and `npm run typecheck` also passed. The coordinator accepted the Milestone 1 gate and authorized Milestone 2.

## Milestone 2 evidence

Coordinator verification: `npm run lint` and `npm run typecheck` passed. `npx vitest run tests/generation.test.ts tests/integration/generation.test.ts` passed **12 tests**; `npx vitest run tests/integration/generation-invalid.test.ts` passed **1 test**. The malformed-provider integration uses a local mock and verifies a failed run without persisted generated cases; its directly invoked test job is marked failed to avoid competing with the recovery worker.

Additional verification: `npx vitest run tests/integration/generation.test.ts -t snapshot` passed **2 tests** (1 intentionally filtered), including attempted database snapshot mutation rejection and equality of full stored snapshot contents after requirement revision. The coordinator accepted the gate and authorized Milestone 3.

## Milestone 3 evidence

`npx vitest run tests/integration/review.test.ts tests/traceability.test.ts` passed **4 tests**. The suite edits and versions a case, approves and rejects cases, creates a manual case, updates requirement links, confirms uncovered/covered RTM states, and verifies that revising a requirement marks every linked active case stale while retaining history. `npm run lint` and `npm run typecheck` passed at the gate.

## Milestone 4 evidence

The export integration passed in **21.66 seconds**. It opened the generated XLSX and verified exactly six sheets (Summary, Requirements, Scenarios, Test Cases, RTM, Warnings), formulas treated as literal data, Unicode preservation, Excel cell truncation warnings, current edits and citations, all-status/rejected inclusion, approved-only filtering, RTM blank rows, stale warnings, and expiry metadata.

Playwright keyboard coverage passed **2/2** tests. The full browser workflow passed **1/1** in 2.1 minutes: project creation, PDF upload, extraction of 10 requirements, immutable confirmation, generation of 40 linked cases, editing TC-001, approval, traceability review, approved-only workbook download, REQ-001 revision, stale propagation, and a stale-warning export.

## Final delivery evidence

Final `npm test` passed **10 files / 37 tests** in 207.55 seconds. Dependency audit reported **0 vulnerabilities**. The optimized production build, lint, typecheck, Prisma client generation, migration deployment, repeatable seed, and clean-checkout install were rerun before delivery. Screenshots in `outputs/` capture Projects, Workspace, Requirements, Test Cases, and Traceability from the completed browser journey.

## Enterprise milestone evidence

- **M5:** `tests/enterprise.test.ts` verifies that a user cannot discover a project in an organization-backed workspace without membership. Approval and Jira operations enforce ADMIN/QA_LEAD roles.
- **M6:** the enterprise suite drives a ClamAV INSTREAM mock returning an EICAR detection and confirms fail-closed behavior. Extraction tests cover OCR warnings. The production worker includes Tesseract and shared private storage.
- **M7:** generation tests reject malformed output, unknown IDs, ungrounded quotes, invalid locators, missing citations, duplicate cases, empty steps and non-atomic batches. Approval also requires a valid title, steps, links, non-stale state and review role.
- **M8:** Jira contract tests block drafts before network access and verify the approved-case payload against a mock Jira endpoint. The integration creates or updates approved cases, persists external keys and hashes, and imports remote title/steps as a new draft revision. Target Jira/Xray field mapping remains an installation rollout check.
- **M9:** production Compose configuration passed; both images built; PostgreSQL, Redis and ClamAV became healthy; the migration job applied all migrations; app and worker started; `/health/ready` returned ready/database ok/redis ok. The containerized full browser workflow passed **1/1** in 30.5 seconds after shared-storage and Python-path verification.

Final enterprise regression: `npm test` passed **11 files / 42 tests**, lint and typecheck passed, the standalone build passed, keyboard E2E passed **2/2**, the full container workflow passed **1/1**, and the high-severity dependency audit reported **0 vulnerabilities**.
