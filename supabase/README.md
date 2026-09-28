# Supabase (project alktrading-owned) — Night Out objects only

Shared with the ALK trading app: only `nightout_*` / `venue_*` objects and the `nightout-venue-uploads` bucket belong to Night Out.
Nothing here is deployed by Vercel (`supabase/` is in .vercelignore).

- `functions/nightout-upload/index.ts` — Edge Function (verify_jwt=false; checks the venue token or admin key itself).
  Deployed via the Supabase MCP/CLI: `supabase functions deploy nightout-upload --no-verify-jwt --project-ref oyowkptoaadcsxrzzptu`.
- `migrations/20260928_nightout_venue_uploads.sql` — bucket, `venue_submissions.uploads`, `nightout_submit` v2 (p_uploads),
  `nightout_upload_recent`, `nightout_admin_uploads` (service_role only).
