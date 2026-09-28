// POST /api/upload-url  — get short-lived signed upload URLs for venue photos / event flyers.
// Body: {slug, k, files:[{kind: "venue_photo"|"event_image", content_type, size}]}
// Proxies to the Supabase Edge Function "nightout-upload", which checks the venue token (403 if bad) and signs
// uploads into the PRIVATE bucket nightout-venue-uploads. Nothing is published: the file paths are attached to the
// pending submission and only a reviewer can view or approve them.
const { validSlug, validTokenShape, send } = require("./_lib");

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== "object") return send(res, 400, { ok: false, error: "Invalid request." });
  const slug = String(body.slug || "");
  const k = String(body.k || "");
  if (!validSlug(slug)) return send(res, 400, { ok: false, error: "Unknown venue." });
  if (!validTokenShape(k)) return send(res, 403, { ok: false, error: "invalid_token" });
  const files = (Array.isArray(body.files) ? body.files : []).slice(0, 31).map((f) => ({
    kind: f && f.kind === "event_image" ? "event_image" : "venue_photo",
    content_type: TYPES.includes(f && f.content_type) ? f.content_type : "",
    size: Math.floor(Number(f && f.size) || 0),
  }));
  const url = process.env.NIGHTOUT_SUPABASE_URL, key = process.env.NIGHTOUT_SUPABASE_KEY;
  if (!url || !key) return send(res, 500, { ok: false, error: "store_not_configured" });
  try {
    const r = await fetch(`${url}/functions/v1/nightout-upload`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sign_upload", slug, k, files }),
    });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (r.status === 200 && j && j.ok) return send(res, 200, { ok: true, uploads: j.uploads });
    const err = (j && j.error) || "upload_unavailable";
    const status = [400, 403, 413, 415, 429].includes(r.status) ? r.status : 502;
    return send(res, status, { ok: false, error: err });
  } catch (e) {
    console.error("upload-url error", e && e.message);
    return send(res, 502, { ok: false, error: "upload_unavailable" });
  }
};
