# TestPilot AI — Full Product Build Plan (v2)
### Organization → Project → Requirement → User Story → Test Scenario → Test Case → Automation, with Full Traceability, Governance & Self-Healing

> This version incorporates the gap analysis from the previous review: grounding/anti-hallucination mechanics, approval state machines, RBAC, split/clone traceability integrity, versioning, external ID capture, typed test cases, and a UI/UX design pass on every phase.

---

## 0. Core Data Model (Build This First — Everything Depends on It)

```
Organization
  └─ Project (1..N)
       ├─ RequirementDocument (source: Upload | Native | Confluence | External)
       │    └─ Requirement (segmented unit, with source span reference)
       │         └─ UserStory (AI-generated OR manually created)
       │              ├─ linked_requirements[]  (many-to-many — a story can trace to multiple requirements)
       │              └─ TestScenario
       │                   └─ TestCase (type: MANUAL | AUTOMATION | API | PERFORMANCE)
       │                        └─ AutomationScript (Gherkin/Playwright/Cypress — child of AUTOMATION test cases)
       └─ ExternalLink (stores: entity_id, entity_type, external_system, external_id, synced_at)
```

**Key fields every generated artifact needs (this is your anti-hallucination + traceability backbone):**

| Field | Purpose |
|---|---|
| `source_span_ref` | Exact sentence/paragraph range in the source requirement this was generated from — the "citation" |
| `state` | Draft \| In Review \| Approved \| Rejected \| Archived \| Blocked (see state machine below) |
| `version` | Increments on every post-approval edit |
| `created_by` | `AI_AGENT` or a user ID — always know who/what authored it |
| `linked_requirements[]` / `linked_story_id` | Traceability parent(s) — required, never null |
| `external_ids[]` | `{system: "JIRA", id: "PROJ-1234", synced_at, url}` — captured on every push |

---

## 1. Universal State Machine (applies to User Stories AND Test Cases)

```
        create/generate
              │
              ▼
          [ DRAFT ] ───edit/split/clone───┐
              │                            │
        submit for review                  │ (children re-enter DRAFT)
              ▼                            │
       [ IN REVIEW ] ◄──────────────────────┘
         │        │
     approve    reject
         │        │
         ▼        ▼
    [ APPROVED ] [ REJECTED ] ──(revise)──► [ DRAFT ]
         │              │
    edit after      archive
    approval             │
         │               ▼
         ▼          [ ARCHIVED ]
   [ APPROVED v2 ]
   (re-enters IN REVIEW
    if edit is material)
```

Automation test cases get one additional state: **`BLOCKED: AWAITING UI`** — they sit here between "test scenario approved" and "developed page/Figma available for element extraction." This prevents them from being mistaken for ready-to-generate.

**Split/Clone rule:** children always inherit the parent's `linked_requirements[]` and any already-approved downstream artifacts tied to the parent are automatically flagged `NEEDS_REVIEW` (never silently orphaned, never silently carried forward as-is).

---

## 2. Anti-Hallucination Mechanism (concrete, not just a policy)

1. **Grounded generation**: the prompt requires the model to output `source_span_ref` alongside every generated story/case. No span reference = generation is rejected automatically and retried.
2. **Reverse coverage check**: after generation, a second pass checks — does every Requirement have ≥1 linked User Story? Flag orphaned requirements as a review-queue item, same severity as a hallucination flag.
3. **Self-critique pass**: the model re-reads its own generated story next to only the cited span (not the whole document) and answers "does every claim in this story appear in this span — yes/no/partially." Partial/no → auto-flagged for human review before it can leave Draft.
4. **UI surfaces this directly**: reviewers see the story text with its source span highlighted side-by-side — they're never approving blind.

---

## 3. UI/UX — Cross-Cutting Principles

Before phase-by-phase screens, the rules that make this usable rather than a spreadsheet-with-extra-steps:

- **Split-pane review everywhere**: generated artifact on one side, its source (requirement span, or parent story) on the other, always visible together. This is the single highest-leverage UI decision — it's what makes "no hallucination" verifiable by a human in seconds instead of minutes.
- **One review queue, not scattered lists**: a single "Needs My Attention" inbox per user, filterable by artifact type and project, so a Business Analyst doesn't have to go hunting across stories/cases/re-flagged items separately.
- **Traceability as a tree/graph view, not a table**: Requirement → Story → Scenario → Case → Script should be explorable by clicking down (or up from a failing test back to the requirement that caused it) — this is the feature that sells itself in a demo.
- **Bulk actions on every list view**: checkbox select + Approve/Reject/Assign-Reviewer, with filters (by status, by reviewer, by staleness) — non-negotiable past ~30 items.
- **Inline diff, not modal walls of text**: when something is flagged `NEEDS_REVIEW` after a split/edit/requirement change, show exactly what changed, not just a red badge.
- **Status color language, consistent everywhere**: Draft = gray, In Review = amber, Approved = green, Rejected/Archived = muted red, Blocked = blue. Same palette across stories, cases, and scripts so users pattern-match instantly.
- **Never make approval a dead end**: every reject action requires a reason (short text), and that reason is shown to whoever revises it — closes the loop without a meeting.

---

## Phase 0 — Foundation & Data Model (Week 1)

**Scope:** Org/Project scaffolding, the core schema above, auth (Supabase Auth), empty-state UI shell.

**UI:**
- Project switcher in the top nav (org can have 1..N projects)
- Empty-state screens that clearly show the pipeline: "1. Add a requirement → 2. Generate stories → 3. Review → 4. Approve" as a visual stepper, so a first-time user immediately understands the flow without a manual.

**Self-healing:** schema-validated writes only (no free-text state fields — enums enforced at the DB layer).

---

## Phase 1 — Requirement Intake + Grounded Story Generation (Weeks 2–4)

**Scope:**
- Upload (PDF/DOCX) + native in-app authoring (rich text editor with auto-save/drafts)
- Requirement segmentation with `source_span_ref` capture
- Grounded User Story generation (mechanism in section 2)
- Manual story creation, explicitly linked to one or more requirements via a picker

**UI:**
- **Document view**: uploaded/authored requirement shown with auto-highlighted segments (each a candidate "Requirement" unit) — user can accept segmentation or manually adjust boundaries.
- **Story generation view**: split-pane (story left, cited requirement span right, highlighted). "Regenerate this one" button scoped to a single story, not just "regenerate everything."
- Manual story creation form has a required "Link to Requirement(s)" multi-select — can't save without at least one link.

**Self-healing:** retry-with-feedback on malformed generation; reverse coverage check surfaces orphaned requirements in the review queue automatically.

---

## Phase 2 — Approval Workflow & Governance (Weeks 5–7)

**Scope:**
- Full state machine (section 1) for User Stories
- RBAC: `Creator`, `Reviewer/Approver`, `Admin` roles per project — a user cannot approve their own AI-triggered generation batch without a second role (configurable; small teams can relax this)
- Edit / Delete / Split / Clone actions with inheritance rules
- Reject-with-reason → revise → resubmit cycle
- Bulk approve/reject with filters

**UI:**
- **Review Queue** (the "Needs My Attention" inbox): filterable table, split-pane preview on click, bulk checkbox actions in the toolbar.
- **Split/Clone modal**: shows the parent story, lets user define split boundaries inline (drag to divide text), previews both resulting drafts before confirming — never a blind operation.
- **Version history drawer** on every approved story: timestamped list of edits, who made them, one-click "view diff."

**Self-healing:** split/clone automatically flags downstream approved artifacts as `NEEDS_REVIEW`; nothing is silently carried forward.

---

## Phase 3 — External Sync + Traceability ID Capture (Weeks 8–10)

**Scope:**
- Confluence pull (read) — webhook or scheduled poll for change detection
- Confluence push (write) for generated requirement documents
- Jira push for Approved stories only (enforced by state check, not just UI convention)
- `ExternalLink` capture: every push stores the returned external ID, URL, and sync timestamp

**UI:**
- **Sync status badges** on every document/story: "Synced to Confluence (2h ago)" / "Not yet pushed" / "Conflict detected" — always visible, never hidden in settings.
- **Conflict resolution screen**: if the source Confluence page changed after generation, show a three-way view (original version you generated from, new external version, your current draft) with a clear "keep mine / take theirs / merge manually" choice — no silent overwrites, ever.
- **Traceability panel**: on any story/case, a collapsible "Linked Externally" section showing Jira ticket ID (clickable, opens in Jira) alongside internal links.

**Self-healing:** change detection on source docs automatically re-triggers impact analysis (ties into Phase 6) rather than silently going stale.

---

## Phase 4 — Test Scenario / Test Case Generation, Typed (Weeks 11–14)

**Scope:**
- Approved stories → Test Scenarios → Test Cases
- Four typed test cases, each with distinct generation input:
  - **Manual**: step/expected-result text from the story alone
  - **API**: requires an OpenAPI spec/Postman collection/endpoint contract as an additional input source (new ingestion type — add an "API Contract" upload option at the project level)
  - **Performance**: requires explicit non-functional criteria; if the story contains vague terms ("fast", "responsive"), the Ambiguity Inspector blocks Performance case generation until a concrete SLA is entered (forces the fix at the source, not a bad guess downstream)
  - **Automation**: enters `BLOCKED: AWAITING UI` state until Phase 5 inputs are available

**UI:**
- **Tabbed test case view per story**: Manual / API / Performance / Automation as tabs, so a QA lead sees all four types together without hunting.
- **Ambiguity blocker banner**: when Performance generation is blocked, show exactly which term is vague and an inline "suggest a value" prompt (AI-suggested SLA the user can accept or overwrite) rather than a dead-end error.
- Same review-queue/approval pattern as Phase 2, extended to test cases.

**Self-healing:** grounded generation + self-critique pass applied here too (test case claims must trace to scenario/story text).

---

## Phase 5 — Automation Script Generation: Figma + Live UI (Weeks 15–19)

**Goal:** Unblock the `AWAITING UI` test cases with real automation code.

**Scope:**
- Figma input (via Figma API or exported spec) — design intent + expected element labels
- Live developed page crawl — DOM extraction of actual elements (ids, roles, text, structure)
- Diff pass: Figma vs. built page (flags mismatches — a QA-relevant signal on its own, not just automation input)
- Script generation: Gherkin steps → Playwright/Cypress code, using **self-healing selector strategy** (ranked locator fallback list per element, from the earlier build plan)

**UI:**
- **Element mapping screen**: side-by-side Figma frame and live page screenshot, with extracted elements overlaid as clickable pins — user can confirm/correct the mapping before script generation (this is the highest-value manual checkpoint in the whole pipeline; get it wrong here and every downstream script is wrong).
- **Figma-vs-Built diff report**: a simple list — "Button labeled 'Submit' in Figma is labeled 'Send' in the built page" — surfaced to both QA and the dev team, not buried.
- Generated script preview with syntax highlighting, plus a "Run against staging" button if a test environment is connected.

**Self-healing:** runtime selector fallback + auto-suggested diff when a UI change breaks a previously-passing script (from the original build plan, now fully wired into this phase).

---

## Phase 6 — Change Impact Engine, Extended to Artifact-Level (Weeks 20–22)

**Scope:**
- Document-level semantic diff (as originally planned)
- **Extended to fire on**: story edits post-approval, splits/clones, and API contract or Figma changes — not just full document revisions
- Impact propagates the full chain: Requirement change → flags linked Stories → flags linked Scenarios/Cases → flags linked Automation Scripts

**UI:**
- **Impact summary banner** whenever a change is detected: "This change affects 3 stories, 7 test cases, 2 automation scripts" with a direct link to a filtered review queue of exactly those items.
- Traceability graph view (from section 3 principles) gets a "stale" overlay — red-outlined nodes show the blast radius visually, not just in a list.

---

## Phase 7 — Dashboard & Reporting (Weeks 23–24)

**Scope (new — filling the earlier gap):**
- Traceability coverage %: requirements with zero linked stories, stories with zero test cases, etc.
- Review queue aging: items sitting in `In Review` past a threshold
- Stale artifact count post-impact-analysis
- Approval throughput (helps a QA lead show their own team's velocity)

**UI:**
- Single dashboard, project-scoped, with the 4 metrics above as cards, each clickable straight into the relevant filtered list — dashboards that don't link to action are just decoration.

---

## Phase 8 — Light Enterprise Integrations (Month 6+, funded by revenue)

Only once customers ask and are willing to pay for it:
- Jira/ALM/TestRail **bi-directional** sync (Phase 3 was push-only/read-only)
- SSO via a managed provider (Clerk/WorkOS — do not build SAML yourself)
- Full audit log UI (who did what, when — you've already been capturing this since Phase 2's version history; this phase just surfaces it as a searchable log)

Do not start SOC 2 / BYOK / self-hosted deployment until a specific deal is blocked on it.

---

## Summary Table: Where Each Gap From the Review Got Addressed

| Gap identified | Addressed in |
|---|---|
| Anti-hallucination mechanism | Section 2, Phase 1 |
| Split/clone traceability integrity | Section 1 state machine, Phase 2 |
| Confluence conflict resolution | Phase 3 |
| Approval roles / self-approval risk | Phase 2 RBAC |
| Bulk actions | Phase 2 UI |
| Typed test case generation inputs | Phase 4 |
| Automation timing gap (`BLOCKED` state) | Section 1, Phase 4 |
| API/Performance ingestion sources | Phase 4 |
| Artifact-level versioning | Section 0 schema, Phase 2 version drawer |
| RBAC per project | Phase 2 |
| Reporting/dashboard | Phase 7 |

---

*Keep this alongside the original phased build plan — that doc covers the AI-build mechanics (retry loops, regression suites, cost estimates); this one covers the product surface. Update state machine diagrams and screen lists as real user feedback comes in during Phase 2 onward.*
