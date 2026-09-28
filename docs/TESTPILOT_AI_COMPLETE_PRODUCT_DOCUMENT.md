# TestPilot AI — Complete Product Document

**Document version:** 1.0  
**Product version:** Current `main` branch  
**Last updated:** 27 September 2026  
**Repository:** <https://github.com/krsr08/testpilot>

---

## 1. Executive summary

TestPilot AI is a source-grounded requirement intelligence and test management product. It converts business documents, product requirements, system specifications, or pasted user stories into reviewed requirements, governed user stories, test scenarios, test cases, traceability records, execution plans, automation drafts, and downloadable Excel workbooks.

The product keeps humans in control. AI output remains reviewable, citations point back to source material, approved artifacts are versioned, material changes make downstream test assets stale, and audit records preserve important decisions.

The main workflow is:

> Create project → provide or author a requirements document → extract requirements → review and confirm → generate and govern user stories → generate scenarios and test cases → review and approve → inspect traceability → execute tests → export results.

TestPilot AI supports a deterministic fixture provider by default, so the complete local workflow works without a paid AI key. An OpenAI-compatible external model can be enabled through server-side configuration.

---

## 2. Product purpose

TestPilot AI addresses recurring problems in requirements engineering and software quality assurance:

- Requirements are scattered across documents and informal descriptions.
- Long documents are difficult to translate consistently into test coverage.
- Generated test cases often lack evidence or invent unsupported behavior.
- Teams lose traceability between sources, requirements, stories, scenarios, and tests.
- Approved test assets silently become obsolete after requirements change.
- Review decisions and editing history are difficult to audit.
- Teams without a formal BRD, PRD, or SRS need help creating one.

The product provides a governed system of record that connects source evidence to downstream quality artifacts.

### Product principles

1. **Ground every generated artifact.** Requirements and stories retain citations to source excerpts and locators.
2. **Require human review.** Generated results are drafts until a person confirms or approves them.
3. **Preserve history.** Important artifacts use versions, revisions, audit events, and immutable snapshots.
4. **Propagate change.** Material requirement or story changes flag affected tests for review.
5. **Fail safely.** Invalid model output is rejected and retried before anything reaches the UI or database.
6. **Protect tenant boundaries.** Workspace membership and project-level access control every resource.
7. **Explain coverage accurately.** Traceability indicates linked active coverage; it does not claim product quality or release readiness.

---

## 3. Intended users and roles

### Administrator

- Manages workspace and project access.
- Configures organization integrations and billing.
- Can review and govern artifacts.
- Inspects audit and operational information.

### QA lead

- Reviews requirements, stories, scenarios, and cases.
- Approves or rejects governed artifacts.
- Manages test plans, cycles, coverage, and releases.
- Reviews stale assets after changes.

### Tester

- Creates and edits requirements, stories, scenarios, and test cases.
- Runs test executions and records evidence.
- Produces exports and automation drafts where authorized.

### Viewer

- Reads accessible projects and traceability information.
- Cannot perform protected mutations.

Production deployments can use OIDC identity claims. The local demonstration uses a seeded demo user when `DEMO_AUTH=true`.

---

## 4. Product structure and navigation

### Workspace navigation

| Section | Purpose |
|---|---|
| Workspace | Portfolio summary, activity, health indicators, and navigation into work. |
| Projects | Searchable, filterable project portfolio with tile and list presentations. |
| Review queue | Central inbox for stories and other governed work needing a human decision. |
| Search | Searches accessible projects, requirements, and test cases. |
| Notifications | Shows activity and review alerts and supports acknowledgement. |
| Team | Manages workspace members and their roles. |
| Integrations | Displays and configures enterprise integration connections. |
| Audit | Presents governed actions and accountability history. |
| Profile | Manages the current user's locale, timezone, notification, and accessibility preferences. |
| Settings | Workspace-level configuration and product controls. |

### Project navigation

| Section | Purpose |
|---|---|
| Overview | Shows project metadata, progress, source and artifact counts, and next actions. |
| Author | Creates a structured requirements document when no BRD, PRD, or SRS exists. |
| Requirements | Reviews extracted clauses, citations, inclusion, revisions, split/merge actions, and confirmation. |
| User stories | Generates or authors grounded stories and manages their review lifecycle. |
| Test cases | Generates, edits, reviews, approves, rejects, and versions scenarios and cases. |
| Executions | Organizes approved cases into plans and cycles and records results. |
| Traceability | Presents the requirement traceability matrix and coverage warnings. |
| Traceability graph | Shows Requirement → Story → Scenario → Test Case relationships. |
| Intelligence | Shows change impact, correction patterns, automation artifacts, and repair suggestions. |
| Settings | Manages project metadata, visibility, risk, release, tags, members, and archive state. |

---

## 5. Complete functional workflow

### 5.1 Project portfolio

Each logged-in user sees projects they own or have been explicitly authorized to access. Project records include:

- Name and description
- Project type and domain
- Lifecycle and visibility
- Risk classification
- Release name and tags
- Source count
- Requirement count
- Story count
- Test case counts by status
- Updated time and responsible user

Portfolio controls include search, type and status filters, scope selection, sorting, pagination, tile view, and list view. The selected presentation is remembered in the browser.

Archiving a project is reversible and preserves history, traceability, and audit evidence.

### 5.2 Requirements document authoring

Users without a formal document can create one in the application. The authoring flow captures:

- Product or initiative overview
- Capabilities
- Business rules
- Constraints
- In-scope and out-of-scope items
- Integrations and dependencies
- Assumptions and risks
- Document template type

The document builder creates editable Markdown. Users can:

- Save local browser drafts.
- Save governed database revisions.
- Download Markdown.
- Download DOCX.
- Submit the document into the normal extraction workflow.

The AI analysis endpoint returns a completeness score, ambiguity flags with suggested rewrites, and Gherkin feature drafts. All external model output must pass a strict Zod schema. Malformed output is automatically repaired up to three attempts; unvalidated raw JSON is never returned to the browser.

### 5.3 Source ingestion

Supported inputs:

- PDF
- DOCX
- TXT
- Markdown-compatible text
- Pasted user stories or requirement text
- Documents created by the authoring experience

The application validates file size, MIME type, document structure, and processing limits. Originals are written to private local storage in development or S3-compatible storage in configured production deployments.

BullMQ records and dispatches background work through Redis. The worker invokes bounded Python extraction for PDF, DOCX, and text content.

### 5.4 Semantic requirement extraction

Extraction normalizes document text into semantic blocks rather than treating every physical line as a separate requirement. It recognizes numbered clauses, bullets, explicit requirement identifiers, acceptance criteria, paragraph boundaries, and common user-story structure.

Extracted candidates retain source evidence such as:

- Page number
- Paragraph or block locator
- Source excerpt
- Source document identifier
- Extraction warnings

Pasted stories treat `As a`, `I want`, `So that`, and acceptance-criteria structures as related semantic content. Acceptance criteria become testable rules instead of unrelated raw lines.

Processing safeguards reject oversized or suspicious input. Scanned PDFs emit an explicit OCR warning when OCR is unavailable rather than fabricating content.

### 5.5 Requirement review and confirmation

Users can:

- Edit extracted text.
- Include or exclude irrelevant content.
- Provide exclusion reasons.
- Split oversized clauses.
- Merge fragments.
- Inspect source citations.
- Review extraction warnings.
- Confirm a reviewed set.

Confirmation produces an immutable `RequirementSnapshot`. Generation uses the snapshot rather than mutable working rows, ensuring reproducible inputs.

When a later snapshot changes a requirement, the application creates a change set with ADDED, MODIFIED, DELETED, and UNCHANGED classifications. Linked cases affected by modified or deleted requirements return to draft and become stale.

### 5.6 User Story governance

User Story is a durable artifact between Requirement and Scenario.

Stories contain:

- Stable project code such as `US-001`
- Title and narrative
- Acceptance criteria
- Linked requirements
- Source-span evidence
- Grounding critique status and reason
- AI or human author attribution
- Reviewer and review reason
- Version and revision history
- Parent-child lineage
- Downstream scenarios and cases
- External synchronization links

Grounded generation creates deterministic stories only from confirmed, included requirements without existing story coverage. Manual stories must link to at least one included requirement.

Story states are:

- DRAFT
- IN_REVIEW
- APPROVED
- REJECTED
- NEEDS_REVIEW
- BLOCKED
- ARCHIVED

Invalid state transitions are rejected. Rejection and archival require reasons. Production self-approval is blocked unless explicitly configured. Editing an approved story returns it to review and flags downstream artifacts. Cloning preserves lineage and requirement links. Splitting creates linked child stories, archives the parent, and marks downstream work for review.

The review queue provides an aging-aware workspace inbox for stories requiring attention.

### 5.7 Scenario and test-case generation

Generation requires a confirmed current requirement snapshot. Approved linked stories are attached to scenarios when applicable.

The deterministic provider is the default. It generates stable, repeatable drafts for demonstration and tests. The external provider sends reviewed inputs to an explicitly configured OpenAI-compatible endpoint.

Provider responses are validated before persistence. Generation is atomic: malformed batches do not create partial test assets. Requests are bounded by requirement, batch, and case limits. Rate limits and idempotency controls prevent accidental duplicate work.

Generated scenarios and cases retain citations and requirement links. Test cases support execution types such as manual, automation, API, and performance.

### 5.8 Test-case workbench

The workbench supports:

- Scenario and case filtering
- Draft editing
- Manual test-case creation
- Preconditions and expected outcomes
- Step-by-step actions and expected results
- Requirement linking
- Priority and status
- Optimistic concurrency
- Approval and rejection
- Bulk review
- Regeneration
- Version history
- Stale indicators

Editing approved content creates governed history. Rejected and stale cases do not count as approved coverage.

### 5.9 Traceability and coverage

The traceability matrix connects requirements to stories, scenarios, and cases. The graph presents the same relationships as a navigable hierarchy.

Coverage categories distinguish:

- Covered by an approved, active, non-stale linked case
- Needs review because only draft or stale links exist
- Uncovered because no active link exists
- Excluded requirement with its exclusion reason
- Orphan scenario or case

Coverage is a linkage and review indicator. It does not prove that testing is exhaustive or that a release is ready.

### 5.10 Test planning and execution

Approved cases can be organized into:

- Test plans
- Release-specific plans
- Environment-specific test cycles
- Individual executions

Execution states include NOT_RUN, PASS, FAIL, BLOCKED, and SKIPPED. Each execution can record notes, evidence metadata, executor, and execution time.

### 5.11 Intelligence and self-healing capabilities

The Intelligence area provides:

- Requirement change-impact reports
- Human correction categories
- Generation history
- Playwright automation drafts
- Ranked locator candidates
- Runtime fallback reporting
- Human-approved repair suggestions

Automation drafts are generated only for approved, non-stale cases. Runtime selector fallbacks become suggestions; the system does not silently rewrite approved automation.

### 5.12 Export

The Python export worker produces an `.xlsx` workbook containing exactly:

1. Summary
2. Requirements
3. Scenarios
4. Test Cases
5. RTM
6. Warnings

Exports support all-status and approved-only selection. Values that could be interpreted as spreadsheet formulas are escaped. Overlength cells are safely truncated and recorded in Warnings. Unicode is preserved. No macros are produced.

Export files use private UUID names and expire after 24 hours. Download requires project access and a valid unexpired record.

---

## 6. AI and validation architecture

### Deterministic fixture mode

`GENERATOR_MODE=fixture` is the default. It requires no model credentials and is used for local development, demonstrations, and automated tests.

### External model mode

`GENERATOR_MODE=external` activates an OpenAI-compatible chat-completions adapter using:

- `MODEL_BASE_URL`
- `MODEL_NAME`
- `MODEL_API_KEY`
- `MODEL_JSON_SCHEMA`

Temperature is zero. Credentials stay on the server and are never sent to the browser.

### Self-healing output boundary

The BRD analysis engine validates output using `BRDAnalysisSchema`, which requires:

- `completenessScore`: number from 0 through 100
- `ambiguityFlags`: term, reason, and suggested rewrite
- `gherkinFeatures`: title and feature text

If parsing fails, the engine sends the exact validation issues back to the model and retries. After three failed attempts, it returns a safe error and retains no malformed output.

### Prompt-injection boundary

Uploaded documents are treated as data, not instructions. External output must pass schemas, domain rules, access control, and transaction boundaries before persistence.

---

## 7. System architecture

```text
Browser
  │
  ▼
Next.js 16 / React 19
  ├── Enterprise application UI
  ├── Authenticated API routes
  ├── Zod request/response validation
  └── Health endpoints
          │
          ├──────────► PostgreSQL 17 / Prisma 6
          │             Durable product records, versions and audit
          │
          ├──────────► Redis 7 / BullMQ
          │             Job queue, retries, recovery and rate limits
          │
          ├──────────► Local or S3-compatible private storage
          │             Source documents, exports and artifacts
          │
          └──────────► TypeScript worker
                        ├── Python extraction
                        ├── Deterministic/external generation
                        ├── Python XLSX export
                        └── Cleanup and recovery
```

### Repository layout

| Path | Responsibility |
|---|---|
| `apps/web` | Next.js pages, application shell, UI components, API routes, authorization and service logic. |
| `packages/db` | Prisma schema, database migrations, generated client configuration, and seed data. |
| `packages/contracts` | OpenAPI contract. |
| `services/worker` | Queue worker, extraction, segmentation, generation, regeneration, Jira adapter, and export. |
| `fixtures` | Login/password-reset source documents and deterministic regression data. |
| `infra` | Local Compose, production Compose, Dockerfiles, and Helm chart. |
| `tests` | Unit, integration, security, regression, boot, and Playwright tests. |
| `docs` | Product contract, decisions, API documentation, gates, policies, and runbooks. |

---

## 8. Core data model

### Identity and tenancy

- Organization
- Workspace
- User
- Membership
- ProjectMember
- UserPreference
- Notification

### Project and source records

- Project
- SourceDocument
- RequirementDocument
- RequirementDocumentRevision

### Requirement intelligence

- Requirement
- RequirementRevision
- RequirementSnapshot
- RequirementSnapshotItem
- RequirementChangeSet

### Story and test design

- UserStory
- UserStoryRevision
- StoryRequirementLink
- Scenario
- TestCase
- TestCaseRevision
- RequirementTestCaseLink
- Citation

### Operations

- Job
- GenerationRun
- Export
- AuditEvent
- FeedbackEvent
- AutomationArtifact
- TestPlan
- TestCycle
- TestExecution
- Comment

### Commercial and integration records

- WorkspaceSubscription
- UsageEvent
- WebhookEvent
- IntegrationConnection
- ExternalCaseLink
- ExternalLink

Stable codes are allocated transactionally at project level to preserve readable references such as REQ, US, SCN, and TC identifiers.

---

## 9. API overview

The primary product API is under `/api/v1`.

### Projects and membership

- `GET|POST /projects`
- `GET|PATCH|DELETE /projects/{id}`
- `GET|POST|DELETE /projects/{id}/members`
- `GET /projects/{id}/operations`

### Sources and requirements

- Source upload and pasted-text endpoints under `/projects/{id}/sources`
- Requirement list and editing endpoints
- `POST /requirements/{id}/split`
- `POST /projects/{id}/requirements/merge`
- Snapshot confirmation and change-impact endpoints

### Authoring

- Project requirement-document create, read, update, download, analyze, and submit endpoints
- `POST /api/generate-prd` for schema-validated BRD analysis

### User stories

- `GET|POST /projects/{id}/stories`
- `POST /projects/{id}/stories/generate`
- `PATCH /stories/{id}`
- `POST /stories/{id}/transition`
- `POST /stories/{id}/clone`
- `POST /stories/{id}/split`
- `GET /review-queue`

### Test generation and review

- Generation-run creation and status endpoints
- Scenario and test-case retrieval/edit endpoints
- Case regeneration and bulk review endpoints

### Traceability and export

- `GET /projects/{id}/traceability`
- Export creation, status, and protected download endpoints

### Execution and intelligence

- Test-plan, cycle, and execution endpoints
- Project intelligence and feedback endpoints
- Automation generation, download, fallback, and repair-decision endpoints

### Workspace services

- `GET /search`
- `GET|PATCH /notifications`
- `GET|PATCH /profile/preferences`
- Billing and Stripe webhook endpoints

Errors use a stable envelope with a code, human-readable message, optional field errors, and request identifier. Validation commonly returns 422; conflicts return 409; access failures return 401/403/404 according to the disclosure boundary; rate limits return 429.

---

## 10. Security and governance

Implemented foundations include:

- Workspace and project authorization checks
- ADMIN, QA_LEAD, TESTER, and VIEWER role gates
- Production OIDC JWT verification support
- Demo authentication isolated by configuration
- Strict server-side validation
- Optimistic concurrency on mutable governed records
- Idempotency for jobs, usage records, and webhooks
- Separation-of-duties control for story approval
- Private source and export access
- Upload and archive-size limits
- Formula-injection protection in Excel output
- Content Security Policy and browser security headers
- Redis-backed API rate limiting with production fail-closed behavior
- Audit events for sensitive workflow actions
- Malware scanning and encrypted S3-compatible storage adapters when configured
- Stripe signature verification; no card data enters TestPilot

Production deployments still require organization-specific identity setup, secret management, backup policy, monitoring, security review, data retention settings, and acceptance testing.

---

## 11. Reliability and background processing

BullMQ provides durable asynchronous jobs for extraction, generation, regeneration, export, and recovery. Jobs use bounded retries and exponential backoff. A transactional outbox prevents committed requests from becoming stranded between PostgreSQL and Redis.

Generation validates every provider batch before an atomic database transaction. Extraction applies time, page, archive-entry, decompressed-size, character, and candidate limits. Export reads use a consistent transaction so workbook sheets agree.

Health endpoints:

- `/health/live` confirms the web process is running.
- `/health/ready` checks PostgreSQL and Redis readiness.

---

## 12. Local installation and launch

### Prerequisites

- Node.js 24 and npm
- Python 3.12+
- Docker Desktop
- Ports 3000, 55432, and 56379 available

### First-time setup in PowerShell

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

In a second terminal:

```powershell
npm run worker
```

Open <http://localhost:3000/projects>.

The seed provides the **Demo Workspace** and **Login & Password Reset** project. The sample requirement source is available as PDF, DOCX, and TXT under `fixtures/`.

### Normal restart

```powershell
docker compose -f infra/compose.yml up -d --wait
npm run dev
```

Run `npm run worker` in another terminal.

### Intentional local reset

```powershell
docker compose -f infra/compose.yml down -v
docker compose -f infra/compose.yml up -d --wait
npm run db:migrate
npm run db:seed
```

This deletes the local database volume and should only be used when a clean demo database is intended.

---

## 13. Testing and quality gates

Standard verification commands:

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

The test portfolio covers:

- Application boot and readiness
- Document extraction and semantic segmentation
- Ingestion validation and idempotency
- Deterministic and malformed external generation
- Self-healing schema validation
- Requirement and story lifecycle governance
- Editing, review, approval, rejection, split, clone, and lineage
- Traceability and coverage semantics
- Export structure and spreadsheet safety
- Change impact and automation intelligence
- Enterprise authorization and security boundaries
- Regression corpus limits
- Browser workflow and keyboard accessibility

At the time of this document, the full Vitest suite passes **58 tests in 18 test files**, lint and TypeScript pass, all database migrations are applied, and the optimized Next.js production build succeeds.

---

## 14. Deployment model

### Local development

- Web application and worker run on the host.
- PostgreSQL and Redis run through Docker Compose.
- Files use ignored `var/` storage.
- Fixture AI provider is enabled by default.

### Enterprise deployment assets

The repository includes:

- Production Compose configuration
- App and worker Dockerfiles
- Helm chart and values
- S3-compatible object storage adapter
- OpenTelemetry packages
- OIDC identity support
- ClamAV and OCR integration points
- Jira/Xray integration foundation

Cloud deployment still requires target-specific values, managed secrets, DNS/TLS, identity-provider registration, database and Redis services, object storage, observability endpoints, backup/restore validation, and security acceptance.

---

## 15. Data handling and retention

- Development storage is local and should use non-sensitive sample data.
- External AI mode sends reviewed requirement content and excerpts to the configured provider.
- Model credentials remain server-side.
- Source originals remain private.
- Workbook downloads require authorization.
- Generated workbooks expire after 24 hours.
- Audit and metadata records remain after file expiry.
- Browser-local document drafts may contain product information and should be cleared on shared devices.

Organization-specific retention, deletion, legal-hold, residency, and backup requirements must be configured before production use.

---

## 16. Current limitations and deliberate boundaries

The following capabilities are foundations or require deployment-specific activation; they should not be represented as universally complete:

1. Production identity requires customer OIDC/SAML broker configuration.
2. Real-time desktop Word synchronization is deferred; DOCX download, editing, and governed re-upload are supported.
3. SharePoint, Confluence, Figma, and live browser crawling require provider credentials and dedicated synchronization acceptance.
4. Jira/Xray field mappings vary by customer instance and require rollout validation.
5. Scanned and complex-layout documents may need OCR configuration and human correction.
6. Generated cases and stories require human review and do not prove exhaustive coverage.
7. The deterministic fixture provider demonstrates workflow rather than advanced domain reasoning.
8. Test execution records evidence metadata; full binary evidence upload and defect lifecycle integration remain future integrations.
9. Automation produces governed Playwright drafts; repository pull-request creation and CI execution require external integration.
10. SCIM Users provisioning and deactivation are implemented. SCIM Groups/bulk operations, database row-level security, access-review campaigns, customer-managed key lifecycle, legal hold, and application-managed device sessions are not claimed as complete.
11. Deployment-specific load, disaster-recovery, penetration, privacy, and compliance testing remain operational responsibilities.

---

## 17. Recommended production rollout

### Stage 1 — Controlled pilot

- Configure production OIDC.
- Deploy managed PostgreSQL and Redis.
- Configure encrypted object storage.
- Activate audit collection and observability.
- Use a small QA group and non-sensitive documents.
- Validate extraction against real document formats.

### Stage 2 — Workflow adoption

- Configure the approved external AI provider.
- Calibrate prompts and regression corpus.
- Configure Jira/Xray mapping if required.
- Establish review ownership and service-level targets.
- Train users on citation review and coverage semantics.

### Stage 3 — Enterprise controls

- Complete security and privacy review.
- Validate backup and restore.
- Establish retention and deletion policies.
- Run performance and resilience tests.
- Connect alerting and support processes.
- Approve production readiness through the customer's governance process.

---

## 18. Product success measures

Useful product measures include:

- Time from source upload to confirmed requirements
- Percentage of requirements with source citations
- Percentage of confirmed requirements covered by governed stories
- Percentage covered by approved, non-stale test cases
- Average review-queue age
- Requirement-to-case change propagation time
- Rate of AI drafts accepted without material edits
- Human correction categories and recurrence
- Stale artifact backlog
- Export completion and failure rate
- Test execution pass, fail, blocked, and not-run distribution

These measures should be segmented by workspace, project type, release, and document source without exposing unauthorized project content.

---

## 19. Glossary

| Term | Definition |
|---|---|
| Source | Original uploaded, pasted, or authored document. |
| Requirement | A reviewed, source-cited clause representing expected behavior or constraint. |
| Snapshot | Immutable confirmed set of requirements used for generation. |
| User Story | Governed narrative and acceptance criteria linked to one or more requirements. |
| Scenario | A test-design grouping derived from governed inputs. |
| Test Case | Executable steps, inputs, and expected outcomes linked to requirements. |
| Citation | Source evidence supporting a requirement or generated artifact. |
| RTM | Requirement Traceability Matrix. |
| Stale | An artifact requiring review because an upstream governed input changed. |
| Fixture provider | Deterministic no-cost generator used for demos and tests. |
| External provider | Configured OpenAI-compatible model endpoint. |
| Self-healing validation | Retrying malformed model output with exact schema errors. |
| Review queue | Central list of governed artifacts requiring a human decision. |

---

## 20. Reference documents

- `README.md` — setup and repository introduction
- `docs/BLUEPRINT.md` — original implementation contract
- `docs/PRODUCT_BUILD_PLAN_V2.md` — current product roadmap
- `docs/API.md` — detailed API behavior
- `docs/GATES.md` — milestone and verification ledger
- `docs/DECISIONS.md` — architectural and product decisions
- `docs/DATA_POLICY.md` — data-handling guidance
- `docs/ENTERPRISE.md` — enterprise deployment guidance
- `docs/runbook.md` — operational runbook
- `packages/contracts/openapi.yaml` — machine-readable API contract

---

## 21. Product status

TestPilot AI is a working local and deployable enterprise foundation with persistent PostgreSQL records, queued processing, source-grounded requirement extraction, governed stories and tests, traceability, execution records, exports, audit controls, and validated build/test gates. External enterprise services remain configuration and integration projects because each customer controls its identity, model, storage, document, ALM, observability, security, and compliance environment.
