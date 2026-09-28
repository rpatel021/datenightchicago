// Night Out Chicago: token-gated uploads for venue photos / event flyers.
// Deployed to Supabase project alktrading-owned as Edge Function "nightout-upload" (verify_jwt=false:
// every action checks its own secret: the venue edit token or the admin review key).
//
// Bucket nightout-venue-uploads is PRIVATE with no storage policies, so the publishable key can't list/read/write it.
// This function (service role) only:
//   sign_upload  {slug, k, files:[{kind, content_type, size}]}  -> short-lived signed upload URLs (valid venue token only)
//   admin_sign   {admin_key, paths[], expires?}                  -> short-lived signed read URLs (review)
//   admin_delete {admin_key, paths[]}                            -> remove objects (test cleanup / rejected / orphans)
//   admin_uploads {admin_key}                                    -> every object + the submission that references it
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "nightout-venue-uploads";
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heic", "image/gif": "gif",
};
const MAX_BYTES = 10 * 1024 * 1024;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const PATH_RE = /^[a-z0-9][a-z0-9-]{0,79}\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|heic|gif)$/;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function chicagoDate() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
async function isAdmin(key: unknown) {
  if (typeof key !== "string" || key.length < 24) return false;
  const { data, error } = await db.rpc("nightout_is_admin", { p_admin_key: key });
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  let b: any;
  try { b = await req.json(); } catch { return json(400, { ok: false, error: "bad_json" }); }
  const action = b && b.action;

  if (action === "sign_upload") {
    const slug = String(b.slug || ""), k = String(b.k || "");
    if (!SLUG_RE.test(slug) || !TOKEN_RE.test(k)) return json(403, { ok: false, error: "invalid_token" });
    const { data: ok, error } = await db.rpc("nightout_check_token", { p_slug: slug, p_token: k });
    if (error) return json(502, { ok: false, error: "store_unavailable" });
    if (ok !== true) return json(403, { ok: false, error: "invalid_token" });
    const files = Array.isArray(b.files) ? b.files : [];
    if (!files.length) return json(400, { ok: false, error: "no_files" });
    const nPhoto = files.filter((f: any) => f && f.kind === "venue_photo").length;
    const nEv = files.filter((f: any) => f && f.kind === "event_image").length;
    if (files.length > 30 || nPhoto > 10 || nEv > 20 || nPhoto + nEv !== files.length) {
      return json(400, { ok: false, error: "too_many_files" });
    }
    for (const f of files) {
      if (!EXT[f.content_type]) return json(415, { ok: false, error: "unsupported_type" });
      if (!(Number(f.size) > 0 && Number(f.size) <= MAX_BYTES)) return json(413, { ok: false, error: "file_too_large" });
    }
    const { data: recent } = await db.rpc("nightout_upload_recent", { p_slug: slug });
    if ((recent ?? 0) + files.length > 80) return json(429, { ok: false, error: "rate_limited" });
    const day = chicagoDate();
    const out = [];
    for (const f of files) {
      const path = `${slug}/${day}/${crypto.randomUUID()}.${EXT[f.content_type]}`;
      const { data, error: e2 } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
      if (e2 || !data) return json(502, { ok: false, error: "sign_failed" });
      out.push({ path, kind: f.kind, signed_url: data.signedUrl });
    }
    return json(200, { ok: true, uploads: out });
  }

  if (action === "admin_uploads") {
    if (!(await isAdmin(b.admin_key))) return json(403, { ok: false, error: "not_admin" });
    const { data, error } = await db.rpc("nightout_admin_uploads", { p_admin_key: b.admin_key });
    if (error) return json(502, { ok: false, error: error.message });
    return json(200, { ok: true, rows: data || [] });
  }

  if (action === "admin_sign" || action === "admin_delete") {
    if (!(await isAdmin(b.admin_key))) return json(403, { ok: false, error: "not_admin" });
    const paths: string[] = (Array.isArray(b.paths) ? b.paths : []).filter((p: unknown) => typeof p === "string" && PATH_RE.test(p as string)).slice(0, 200);
    if (!paths.length) return json(400, { ok: false, error: "no_paths" });
    if (action === "admin_delete") {
      const { data, error } = await db.storage.from(BUCKET).remove(paths);
      if (error) return json(502, { ok: false, error: error.message });
      return json(200, { ok: true, removed: (data || []).map((o: any) => o.name) });
    }
    const expires = Math.min(Math.max(Number(b.expires) || 3600, 60), 86400);
    const { data, error } = await db.storage.from(BUCKET).createSignedUrls(paths, expires);
    if (error) return json(502, { ok: false, error: error.message });
    return json(200, { ok: true, urls: (data || []).map((d: any) => ({ path: d.path, url: d.signedUrl, error: d.error })) });
  }

  return json(400, { ok: false, error: "unknown_action" });
});
