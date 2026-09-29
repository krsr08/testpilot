# Enterprise agent architecture implementation ledger

This file is the durable hand-off record for the staged product build. Update it after every verified stage. A stage is complete only when its migration, API, UI, authorization and automated checks pass.

## Target stages

| Stage | Scope | Status |
|---|---|---|
| A1 | Config versions, linting, lifecycle, model routes, run ledger, findings persistence | Complete |
| A2 | Effective platform → organization → project resolver, active config pinning, cost accounting helpers | Complete |
| B | Migrate authoring, extraction, story and test generation into governed agent runs | Complete |
| C | Independent grounding/test-design verifiers, findings inbox actions, evidence review | Complete |
| D | Review assistant, requirement quality, coverage proposals and change-impact UI | Complete |
| E | UI discovery, script verification, execution analysis and repair | Complete |
| F | Confluence, SharePoint and Figma synchronization with conflict handling | In progress |
| G | Evaluation Lab, config improvement proposals, dashboards and enterprise hardening | Planned |

## Stage A1 delivered — 2026-09-28

- Added persistent `AgentConfigVersion`, `AgentModelRoute`, `AgentRun`, and `AgentFinding` records.
- Added configuration hashing, bounded content validation and invariant lint checks.
- Added Draft → In Review → Approved → Active → Retired lifecycle actions with one active version per scope and agent.
- Added logical model routes with provider, model, secret reference, cost cap, timeout and fallback metadata. Secret values remain outside the database record.
- Added Configuration Studio, Agent Control Center, Model Routes and Findings Inbox pages.
- Added protected navigation and browser route protection for all four pages.
- Added a platform catalog and safe Markdown defaults for 16 agent capabilities.
- Applied the migration, exercised the complete configuration lifecycle, activated an organization configuration, and created the deterministic model route.
- Verified all four UI routes and both foundation APIs over the running application.

## Stage B delivered — 2026-09-28

- Routed document authoring, requirement extraction, story generation, test design and case regeneration through the active governed agent configuration resolver.
- Each execution now records immutable configuration, model route, snapshot/input references, timing, outcome and repair lineage in `AgentRun`.
- Added artifact provenance from stories, scenarios and test cases to the run that generated them.
- Persisted authoring ambiguity and human-review findings without exposing malformed model output.
- Added run-detail retrieval plus Accept, Dismiss and Waive actions in the Findings Inbox; waivers require a reason.
- Applied the `20260928140000_agent_provenance` migration.
- Verified the governed authoring, extraction, story and test-generation paths with 15 passing unit/integration tests.

## Next implementation checkpoint

Complete Stage C by running independent grounding and test-design verification after generation, linking verification runs to artifacts, persisting actionable findings, and presenting the cited evidence and verifier outcome in the review experience.

## Stage C delivered — 2026-09-28

- Added independent grounding verification for generated stories and test cases.
- Added an independent test-design critic for traceability, executable steps and requested case types.
- Verifier runs retain their generator as the parent run; stories, scenarios and cases retain verifier provenance.
- Verification findings enter the existing Findings Inbox. A verifier failure remains visible as a failed verifier run and does not discard successfully generated drafts.
- Story and test-case review screens now show generator, grounding-verifier and test-design-critic status beside cited evidence, with direct access to the governed run ledger and Findings Inbox.
- Review APIs return only workspace-authorized run summaries and artifact findings; focused story, generation and governance integration tests passed.

## Next implementation checkpoint

Begin Stage D with requirement-quality scoring, review-assistant recommendations, coverage-gap proposals and change-impact views. Recommendations remain advisory and require explicit human decisions.

## Stage D delivered — 2026-09-28

- Added a governed advisory-analysis action to the project Intelligence Center.
- Requirement Quality scores atomicity, ambiguity, detail and testability while preserving the source requirement unchanged.
- Coverage Gap identifies included requirements without active linked cases and proposes review actions.
- Review Assistant identifies stale, draft and rejected cases that need human attention.
- Change Impact converts the latest immutable snapshot comparison into reviewer-facing recommendations linked to affected cases.
- Each advisor runs independently with pinned configuration, an immutable run record and artifact-scoped findings in the Findings Inbox.
- The Intelligence Center shows the latest status and open recommendation count for every advisor and explicitly states that recommendations cannot approve or modify artifacts.
- Focused integration testing verified all four runs, quality findings and non-mutation of requirements.

## Next implementation checkpoint

Begin Stage E with governed Playwright script generation, independent script verification, execution-result analysis and reviewer-approved repair proposals.

## Stage E delivered — 2026-09-28

- Routed Playwright generation through the governed Script Generation agent and retained the originating run on each automation artifact.
- Added an independent Script Verifier with static checks for executable Playwright structure and unsafe dynamic or environment access.
- Preserved ranked locator candidates in generated code and recorded runtime fallback reports through a separate Execution Analysis run.
- Routed proposed selector reordering through the Script Repair agent; proposals remain pending until a reviewer explicitly approves or rejects them.
- Added generation and verification indicators to automation artifacts in the Intelligence Center.
- Applied the `20260928230000_automation_agent_provenance` migration.
- Focused unit/integration tests verified all four agent runs, persisted provenance, fallback classification and the pending human approval gate.

## Next implementation checkpoint

Begin Stage F with governed external synchronization, encrypted connection configuration, inbound/outbound revision mapping and conflict-resolution workflows for Confluence, SharePoint and Figma.

### Stage F progress — 2026-09-29

- Added workspace-admin connection configuration for Confluence, SharePoint and Figma using secret-manager references; credential values are never accepted or returned.
- Added governed Integration Sync runs with project/external-resource revision mappings.
- Added durable conflict records when local and remote revisions both change, plus blocking findings in the Findings Inbox.
- Added reviewer-only Keep Local and Accept Remote decisions with mandatory reasons.
- Replaced the static Integrations screen with connection cards, synchronization controls and a conflict-resolution queue.
- Applied the `20260929000000_integration_sync_governance` migration and verified configuration, first sync, conflict detection and resolution in an integration test.
- Added provider-specific authenticated read adapters for Confluence Cloud pages, Microsoft Graph drive items and Figma file nodes.
- Added an explicit live synchronization mode that resolves secrets only on the server, obtains the authoritative remote revision, and feeds the existing conflict gate. Existing declared-revision mode remains available for controlled demos and offline validation.
- Restricted outbound destinations to HTTPS vendor hosts or an exact deployment allowlist, rejected local/private destinations, disabled redirects, bounded response time and size, and prevented credentials from entering responses or persistence.
- Added contract tests for provider request construction, revision parsing, credential headers, secret-resolution failure, and SSRF controls.
- Stage F implementation is complete. Deployment activation still requires tenant-owned provider credentials and a final smoke test against each customer's controlled sandbox; no credentials are committed to the repository.

## Next implementation checkpoint

Begin Stage G with production release evidence: deployment profiles, backup/restore rehearsal, operational dashboards, accessibility regression, and tenant-owned connector smoke tests.

### Stage G delivered — 2026-09-29

- Added a strict production environment gate with a deployable example profile. It blocks demo authentication, HTTP public endpoints, local production storage, disabled malware scanning, incomplete enterprise identity, missing telemetry, and unprotected metrics.
- Added authenticated Prometheus-compatible queue, job and export reliability metrics while retaining separate liveness and readiness probes.
- Added checksummed PostgreSQL and private-storage backup jobs plus an isolated restore-verification job to the production Compose profile.
- Rehearsed the production backup: three migrations and seven projects restored successfully into a temporary database, and both database and storage checksums passed.
- Added automated axe-core WCAG regression scans for Projects, Workspace, Integrations and Operations. Corrected secondary text, badge, status and table contrast defects; all four screens pass with no serious or critical violations.
- Revalidated production Compose configuration, TypeScript, lint, unit/integration tests, optimized build, and the browser release gates.
- Stage G implementation is complete. Tenant-specific OIDC, storage, model, telemetry and connector credentials must be supplied and smoke-tested in the target environment before production traffic is accepted.

## Architecture program status

Stages A through G are implemented. Customer production activation remains a deployment acceptance activity because the repository cannot contain tenant secrets or substitute for the customer's identity, connector, backup-retention, security and disaster-recovery approvals.

## Product experience completion program

### Tranche 1 — document governance — 2026-09-29

- Added a project-level Document repository alongside Author and Requirements.
- Added searchable status filtering, document preview, downloadable source artifact access, review submission, reviewer approval or requested changes, review notes, and an audit record for every decision.
- Added durable document comment threads and version restoration. Restoring content creates a new draft revision; it never rewrites a previous version.
- Preserved existing source-grounded extraction, optimistic version checks, templates, AI-assisted authoring, and document export.
- Next tranche: strengthen story and test-case workbenches with richer filtering, bulk review, assignment, and evidence workflows.

### Settings configuration workspace — 2026-09-29

- Added an administrator-only Settings workspace for the deploy-time configuration catalog, with field-level tooltips and safe secret-reference validation.
- Added durable organization-level configuration storage and an API restricted to workspace administrators.
- Settings values form a deployment manifest. Applying them to the live runtime remains a deployment-pipeline activity, with a controlled service restart, because bootstrap infrastructure and credentials cannot be safely altered from an authenticated browser session.
