# Prototype data policy

The local demo has one workspace and one seeded account. Every API request checks that account's workspace membership. Demo authentication is rejected when APP_ENV=production; real authentication is a production prerequisite. Do not expose this prototype to a public network or use it for customer documents before the production controls in the blueprint are implemented.

Originals and exports are stored under ignored var/ with random storage keys. Downloads require the same workspace check as other project operations. Source text is data: it is never executed or interpreted as tool instructions. Audit events retain action metadata, not full uploaded documents. Requirement and test-case revisions retain review history separately.

Accepted inputs are PDF, DOCX and UTF-8 TXT, at most 10 MB, or pasted text at most 50,000 characters. Additional processing bounds are 1,000 PDF pages, 50 MB expanded DOCX content, 2,000 ZIP entries, 500,000 extracted characters, and 1,000 candidate requirements per source. Split larger documents. OCR and encrypted PDFs are unsupported. No antivirus scanner is bundled; deploy a scanner and production retention/deletion controls before handling untrusted customer uploads.

The default fixture generator makes no third-party requests. External generation is opt-in through environment configuration; the configured endpoint receives reviewed requirement text, excerpts and project domain. Never commit API keys. Settings identifies the destination without disclosing credentials.

PostgreSQL volumes and local files persist across process restarts. Database reset does not remove originals from var/. Backups, encryption at rest, organization isolation and customer deletion policies remain production work.
