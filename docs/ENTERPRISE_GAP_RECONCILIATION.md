# Enterprise gap reconciliation

**Compared with:** `testpilot-ai-enterprise-gap-analysis.md`  
**Reviewed:** 28 September 2026

This is the repository-backed comparison between the enterprise target document and the current product. “Implemented” means working product code exists. “Foundation” means code or data structures exist but customer-specific activation or broader coverage remains. “External program” means the work cannot be completed truthfully as a software-only repository change.

| Capability | Status after reconciliation | Evidence or remaining work |
|---|---|---|
| OIDC SSO | Implemented | JWT issuer, audience, remote JWKS validation, subject binding, and disabled-account enforcement. |
| SAML | Foundation through identity broker | Direct SAML assertion handling is intentionally excluded. Enterprise SAML IdPs should federate through an OIDC-capable broker. Customer IdP configuration remains. |
| SCIM provisioning | Implemented in this increment | Workspace-scoped SCIM 2.0 Users discovery, create, read, patch, deactivation, role mapping, bearer authentication, and service-provider discovery. Groups and bulk operations remain future breadth. |
| RBAC | Implemented | Workspace roles and project access checks exist. Field-level ABAC remains customer-driven work. |
| PostgreSQL RLS | Missing | App-level tenant authorization is tested. RLS needs transaction-scoped tenant context and connection-pool design before policies can be safely enabled. |
| Device sessions | Identity-provider responsibility | The app uses bearer identity and has no independent browser-session store. Device revocation and MFA belong in the configured IdP. |
| Customer-managed keys | Foundation | S3/KMS configuration exists. Per-customer BYOK lifecycle and rotation workflows remain. |
| Jira/Xray | Foundation | Approved-case push, draft import, external mappings, and tests exist. Customer field-mapping UI and target-instance certification remain. |
| Confluence/SharePoint/Figma | Missing | Requires customer credentials, provider-specific sync semantics, and conflict-resolution acceptance. |
| CI execution loop | Missing | Governed Playwright source generation exists. Git-provider PR creation, CI triggering, signed callbacks, and result ingestion remain. |
| Generic webhooks | Partial | Stripe signature-verified webhooks and persisted replay protection exist. A connector webhook framework remains. |
| OpenAI-compatible providers | Implemented | Configurable base URL, model, schema mode, timeout, and server-side validation work with compatible services, including compatible Azure gateways. Native Bedrock/Anthropic authentication remains. |
| Prompt versioning | Partial | Generation records a prompt version constant and regression tests exist. Durable workspace prompt releases, evaluation history, and rollout controls remain. |
| Continuous evaluations | Partial | A regression corpus and build gate exist. A scheduled product dashboard and drift alerts remain. |
| Feedback capture | Implemented | Corrections and rejection categories are persisted and visible. Automated prompt promotion remains intentionally human-controlled. |
| Scenario/case confidence | Partial | Citations, inferred flags, validation, rationale, and stale states exist. A normalized confidence score is not present. |
| SOC 2 / ISO 27001 | External program | Requires policies, operating evidence, an audit period, people, vendors, and independent auditors. |
| Penetration testing | External program | Requires an independent assessment and remediation program. |
| GDPR/CCPA contracts | External program | DPA, subprocessors, regional terms, and legal review are organizational work. |
| Configurable retention | Missing | Export expiry is implemented. Workspace-level document, draft, and audit retention controls remain. |
| Legal hold | Missing | Needs a policy model, custodian workflow, deletion interception, and audit controls. |
| Right to erasure | Missing by design review | Must reconcile anonymization with immutable evidence. A formal policy and tested workflow are required before implementation. |
| PII detection | Missing | Needs a chosen classifier, false-positive workflow, redaction preview, and provider-routing rules. |
| Health checks | Implemented and extended | Liveness and dependency readiness exist. Readiness now reports BullMQ counts and fails when the oldest queued database job exceeds the configured lag threshold. |
| OpenTelemetry | Implemented, activation required | Node auto-instrumentation exports OTLP traces when an endpoint is configured. Backend dashboards and alerts are deployment work. |
| SLA, load, HA, DR | External/deployment program | Helm and production containers exist. Measured SLOs, load tests, failover, restore drills, and a status page remain. |
| Automation frameworks | Partial | Playwright drafts and governed repair suggestions exist. Cypress, Selenium, Postman, k6, and JMeter generators remain. |
| Billing | Foundation | Stripe Checkout/webhook persistence and free-plan enforcement exist. Full plan-management UI, overages, invoices, and PO workflows remain. |
| AI cost visibility | Missing | Usage events exist but token and provider-cost attribution are not recorded. |
| Support operations | Partial | An internal runbook exists. Customer support tiers, on-call staffing, communications SLAs, and a status page are organizational work. |

## Implemented in this closure increment

1. SCIM 2.0 workspace user provisioning and deprovisioning.
2. Directory-driven role updates for ADMIN, QA_LEAD, TESTER, and VIEWER.
3. Active-account enforcement in both demo and enterprise identity paths.
4. Queue depth and oldest-job lag in readiness health.
5. A configurable readiness failure threshold through `READINESS_MAX_QUEUE_LAG_SECONDS`.

## Recommended next engineering sequence

1. Design privacy retention, anonymization, and legal hold together before changing immutable records.
2. Add durable prompt releases and evaluation runs before expanding native model providers.
3. Close one Git-provider and CI execution loop end to end, selected from a real pilot customer’s stack.
4. Add transaction-scoped tenant context and RLS only after integration tests prove Prisma pool behavior.
5. Expand Jira mappings or document connectors in response to a concrete customer deployment.

Certification, contractual, staffing, and third-party assessment items must remain explicitly outside “implemented” product claims.
