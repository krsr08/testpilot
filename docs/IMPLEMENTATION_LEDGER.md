# Enterprise agent architecture implementation ledger

This file is the durable hand-off record for the staged product build. Update it after every verified stage. A stage is complete only when its migration, API, UI, authorization and automated checks pass.

## Target stages

| Stage | Scope | Status |
|---|---|---|
| A1 | Config versions, linting, lifecycle, model routes, run ledger, findings persistence | Complete |
| A2 | Effective platform → organization → project resolver, active config pinning, cost accounting helpers | Complete |
| B | Migrate authoring, extraction, story and test generation into governed agent runs | Planned |
| C | Independent grounding/test-design verifiers, findings inbox actions, evidence review | Planned |
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

## Next implementation checkpoint

Migrate existing authoring, extraction, story generation and test design one capability at a time through the new resolver and run service without changing their validated output contracts. Each migration must record its configuration, prompt and input hashes, timing, token/cost metadata, validation output, findings and repair parent.
