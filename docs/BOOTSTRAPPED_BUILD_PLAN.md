# TestPilot AI — Bootstrapped Build Plan
### Phase-by-Phase Roadmap with Self-Healing / Self-Correcting Architecture

> **Philosophy:** Build the smallest real product first. Bake self-correction into the engine from day one — not as a "later" feature, but as the reason the product is trustworthy enough for a QA team to rely on. Every phase below assumes a solo builder + AI coding assistant (Claude Code), near-zero budget, and a human doing review/QA at defined checkpoints — not "fully autonomous," but "AI-executed, human-gated."

---

## 0. Core Concept: What "Self-Healing" Means Here

Self-healing shows up at three different layers of this product, and each phase below builds one more of them:

| Layer | What breaks | How it self-heals |
|---|---|---|
| **Generation layer** | LLM outputs malformed Gherkin/JSON, hallucinated fields, inconsistent formatting | Output is validated against a schema; on failure, the system automatically re-prompts the model with the validation error and asks it to fix its own output (retry loop, max 3 attempts, then flag for human) |
| **Test artifact layer** | Generated Playwright/Cypress selectors break when the UI changes | Self-healing locator strategy: store multiple selector candidates (id, text, role, position) per element; if the primary fails at run time, fall back automatically and log which one worked, so the test file updates itself |
| **Requirement layer** | A requirement changes and downstream test cases go stale silently | Semantic diff engine automatically flags dependent tests as `NEEDS_REVISION` rather than silently passing/failing — this is "self-correcting" at the *process* level, catching drift before it becomes a bug |
| **Build process layer** | AI-generated code has bugs, fails tests, has security gaps | Every AI-generated change runs through an automated test suite + linter before merge; failures are fed back to the AI to fix automatically; anything touching auth/data/payments requires a human review gate regardless of test pass |

Keep this table pinned — it's the spine of every phase.

---

## Phase 0 — Foundation & Wedge (Week 1)

**Goal:** Decide the one thing this product does, and stand up the skeleton.

**Scope:**
- Pick the wedge: *Requirement → BDD/Gherkin generation + Requirement Completeness scoring* (Pillars II + III, narrowed to one input type: pasted text or uploaded PDF/DOCX).
- No integrations. No auth complexity. No multi-tenant anything yet.

**Stack:**
- Frontend: Next.js on Vercel (free tier)
- DB: Supabase Postgres (free tier)
- Auth: Supabase Auth (email login only)
- AI: Claude API (pay-per-call)

**Self-healing built in at this phase:**
- **Schema-validated output.** Every AI generation call is required to return JSON matching a strict schema (Zod/Pydantic). If it doesn't validate, auto-retry with the error appended to the prompt, up to 3 times.

**Definition of Done:**
- A user can paste a requirement, get back a Gherkin feature file that always parses correctly (validated, never garbage output shown raw).

**Cost:** ~$0–15 (API testing only)

---

## Phase 1 — MVP Core Engine (Weeks 2–4)

**Goal:** The full single-path pipeline, reliable enough for a stranger to trust.

**Scope:**
- Document upload (PDF/DOCX) → text extraction → requirement segmentation
- Ambiguity Inspector: flag vague terms ("fast", "user-friendly") with suggested rewrites
- Requirement Completeness Index (0–100%) scoring
- BDD/Gherkin generation per requirement
- Basic review UI: user can edit/approve/reject each generated item before it's "final"

**Self-healing mechanisms added:**
- **Retry-with-feedback loop** on every generation step (not just Gherkin): if ambiguity scoring or completeness scoring returns malformed or contradictory output, the system re-prompts with "here's what you gave me, here's what's wrong, fix it."
- **Confidence flagging, not silent failure.** Anything the model is uncertain about (detected via a low self-reported confidence or a failed validation retry) is visibly flagged "needs human review" in the UI — the system never pretends output is solid when it isn't.
- **Human-in-the-loop is the deliberate safety net**, not a bug: nothing is "final" until a person clicks approve. This is your real self-correction layer at this stage — humans catching what the AI can't yet catch itself.

**AI-build approach:**
- Build one endpoint at a time with Claude Code: extraction → ambiguity scorer → completeness scorer → Gherkin generator.
- After each one, write a small test file (ask Claude Code to generate it) with 5–10 real sample requirements, run it, and only move on once outputs are consistently well-formed.

**Definition of Done:**
- 10 real-world requirement documents processed end-to-end with zero raw/malformed output reaching the UI.

**Cost:** ~$20–50 (API usage during testing)

---

## Phase 2 — Reliability & Self-Correction Layer (Weeks 5–7)

**Goal:** Make the engine trustworthy enough to charge money for.

**Scope:**
- Automated regression harness: every time you (or Claude Code) change a prompt or pipeline step, a suite of 20–30 real anonymized sample requirements re-runs automatically and diffs the new output against the last known-good output.
- Error taxonomy: classify failures (hallucinated field, missed edge case, wrong format) so you know *what kind* of self-correction to add next.
- Add a lightweight "self-critique" pass: after generating a Gherkin file, have the model re-read its own output against the original requirement and flag anything it thinks it missed — a second, independent validation pass, not just format-checking.

**Self-healing mechanisms added:**
- **Automated regression detection** = the product's own immune system. You'll catch prompt regressions before customers do.
- **Self-critique / second-pass validation**: the model checks its own work against the source text, closing the loop between "output is well-formed" (Phase 0/1) and "output is actually correct" (this phase).

**Definition of Done:**
- A prompt or pipeline change can't ship if it regresses more than X% of the regression suite (you set the threshold, e.g. 5%).

**Cost:** ~$30–60/month ongoing (regression runs use API calls)

---

## Phase 3 — First Paying Customers & Payments (Weeks 8–10)

**Goal:** Get 5–10 real users, charge something, learn from real documents.

**Scope:**
- Stripe integration (managed — do not hand-roll payment logic)
- Basic usage limits per tier (free: 3 docs/mo, paid: unlimited)
- Feedback capture: every human edit/rejection of AI output is logged — this is your training signal for what to fix next, and it's free data you already own.

**Self-healing mechanisms added:**
- **Feedback-driven self-correction loop**: aggregate what humans consistently correct (e.g., "the model always misses boundary conditions on date fields") and turn those patterns into explicit prompt rules or few-shot examples — the system gets measurably better from real usage, not just synthetic testing.

**Definition of Done:**
- 5+ paying users, a dashboard (even a spreadsheet) tracking the most common human corrections by category.

**Cost:** ~$0 upfront (Stripe takes a cut only on revenue)

---

## Phase 4 — Test Automation Code Generation (Weeks 11–15)

**Goal:** Extend from "Gherkin text" to "runnable Playwright/Cypress code" — this is where self-healing in the *literal* automation sense matters most.

**Scope:**
- Generate Playwright (TypeScript) test code from approved Gherkin features
- Page Object Model scaffolding
- **Self-healing selectors**: for each UI element, generate a ranked list of locator strategies (data-testid → role/label → visible text → CSS position) rather than one brittle selector

**Self-healing mechanisms added:**
- **Runtime selector fallback**: if the primary selector fails during a test run, the runner automatically tries the next strategy in the ranked list, logs which one succeeded, and surfaces a suggested update to the test file — the test heals itself at run time and tells you what changed.
- **Auto-repair PRs**: when a test fails due to a detected UI change (not a real bug), generate a suggested diff to the test file automatically for human approval — this is "self-correcting code," properly gated by a human merge decision.

**Definition of Done:**
- Generated Playwright suite survives a deliberately introduced minor UI change (e.g., a renamed button label) without manual test rewriting.

**Cost:** ~$50–100/month at this point, ideally covered by paying customers from Phase 3

---

## Phase 5 — Change Impact & Semantic Diff Engine (Weeks 16–20)

**Goal:** Build your actual differentiator — the wedge that's less crowded than plain test generation.

**Scope:**
- Document revision upload → semantic diff (ADDED/MODIFIED/DELETED/UNCHANGED) at the requirement level, not just text-diff
- Automatic impact analysis: flag downstream test cases/scripts as `STALE` or `NEEDS_REVISION`
- Change delta summary report

**Self-healing mechanisms added:**
- This *is* the self-correction layer for the requirements process itself: instead of a human having to notice a requirement changed and manually hunt down affected tests, the system self-flags drift automatically — closing the loop between "requirements changed" and "tests are still valid."

**Definition of Done:**
- Uploading Rev 1.1 of a document you tested in Phase 1–4 correctly flags every test case that touches a changed requirement, with zero false negatives on your regression set.

**Cost:** ~$50–100/month

---

## Phase 6 — Light Integrations & Early Enterprise Signals (Month 6+, funded by revenue)

**Only start this once you have paying customers asking for it.**

- Jira read-only sync (pull stories in, push nothing back yet — much smaller security surface)
- SSO via a managed provider (Clerk/WorkOS handle SAML for you — don't build it yourself)
- Basic audit logging (who generated what, when)

**Do not attempt** SOC 2, BYOK, or self-hosted Kubernetes deployment until a customer's contract is actually blocked on it. These are expensive, multi-month organizational commitments, not code you write once.

---

## Cross-Phase Rules (Non-Negotiable)

1. **Never let AI-generated code touch auth, payments, or data-access logic without using a managed service** (Supabase Auth/Clerk, Stripe) — this sidesteps most security risk for free.
2. **Every generation endpoint gets a validation + retry loop before it ships** — self-healing at the output layer is cheap insurance against garbage reaching a user.
3. **A regression suite of real (anonymized) sample documents runs before any prompt or pipeline change is considered done.**
4. **Nothing is "final" without a human approval click** until you have enough real usage data to trust the self-critique pass — trust is earned phase by phase, not assumed.
5. **Scope creep is the biggest risk to you finishing this, not lack of AI capability.** Each phase above is deliberately small — resist adding Pillar I/IV/V features from the original spec until the phase before it is generating real user feedback.

---

*Use this as a living document — update the Definition of Done checkboxes as you complete each phase, and log every "the AI got this wrong" moment in Phase 2+ as your self-correction training data.*
