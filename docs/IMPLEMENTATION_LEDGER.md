# Enterprise agent architecture implementation ledger

This file is the durable hand-off record for the staged product build. Update it after every verified stage. A stage is complete only when its migration, API, UI, authorization and automated checks pass.

## Target stages

| Stage | Scope | Status |
|---|---|---|
| A1 | Config versions, linting, lifecycle, model routes, run ledger, findings persistence | Complete |
| A2 | Effective platform → organization → project resolver, active config pinning, cost accounting helpers | Complete |
| B | Migrate authoring, extraction, story and test generation into governed agent runs | Complete |
| C | Independent grounding/test-design verifiers, findings inbox actions, evidence review | In progress |
| D | Review assistant, requirement quality, coverage proposals and change-impact UI | Planned |
| E | UI discovery, script verification, execution analysis and repair | Planned |
| F | Confluence, SharePoint and Figma synchronization with conflict handling | Planned |
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

### Stage C progress — 2026-09-28

- Added independent grounding verification for generated stories and test cases.
- Added an independent test-design critic for traceability, executable steps and requested case types.
- Verifier runs retain their generator as the parent run; stories, scenarios and cases retain verifier provenance.
- Verification findings enter the existing Findings Inbox. A verifier failure remains visible as a failed verifier run and does not discard successfully generated drafts.
- Remaining Stage C gate: surface verifier status beside each artifact in the story and test-case review screens and complete focused UI/API tests.
