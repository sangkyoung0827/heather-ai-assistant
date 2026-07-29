# Heather Personal Context and Project Control Plane

Phase 10 adds a separate, user-approved control plane. It is additive: existing memories, Direct Commands, search, and process-management data are neither deleted nor migrated automatically.

The `009_personal_context_project_control.sql` migration creates user-RLS-protected identity, preference, project, operational, sensitive-memory, resource, connector, approval, audit, and import-preview tables. Sensitive memories are isolated and are never included in normal chat context.

Seed JSON files in `data/seed/personal-context/` are preview-only. A user must open `/memory/context-import`, inspect items, and explicitly select them before storage. Sensitive seed items are excluded by default. Per-item failures do not roll back successfully selected items.

Permission levels are `observe`, `propose`, `approval_execute`, and `strong_approval`. This release supports only bounded public HTTPS and public GitHub read metadata. It does not store OAuth tokens, API keys, cookies, or credentials, and it does not push code, send email, make payments, or modify external accounts.

For deployment, apply `supabase/migrations/009_personal_context_project_control.sql` through the Supabase SQL editor, then deploy the web application. No new public environment variables are required.
