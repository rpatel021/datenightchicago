// POST /api/submit  — store a venue listing update for review. Nothing is published automatically.
// Body: {slug, k, contact:{name,email}, listing:{..., anything_else, main_photo}, events:[{..., image_choice}],
//        uploads:[{path, kind, event_ref, event_title, bytes, content_type}], original:{...}}
// Everything is optional. Upload paths must already exist in the private bucket (checked in the database).
const { rpc, validSlug, validTokenShape, send, ipHash } = require("./_lib");

const LISTING_FIELDS = {
  name: 120, description: 400, neighborhood: 80, address: 160, hours: 200, price: 12,
  phone: 40, website: 300, booking: 300, note_to_editors: 1500, anything_else: 2000,
};
const PATH_RE = /^[a-z0-9][a-z0-9-]{0,79}\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|heic|gif)$/;
// A picture choice: an existing public photo URL (from the venue's current photos) or one of this submission's uploads.
function cleanChoice(c, slug) {
  if (!c || typeof c !== "object") return null;
  if (c.source === "existing" && /^https?:\/\/\S+$/i.test(String(c.url || "")) && String(c.url).length <= 600) return { source: "existing", url: String(c.url) };
  if (c.source === "upload" && PATH_RE.test(String(c.path || "")) && String(c.path).startsWith(slug + "/")) return { source: "upload", path: String(c.path) };
  return null;
}
const EVENT_FIELDS = { title: 160, date: 20, start_time: 40, price: 60, description: 500, link: 300, event_id: 160 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(v, max) {
  if (v == null) return "";
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
function cleanObj(src, spec) {
  const out = {};
  Object.keys(spec).forEach((k) => { out[k] = clean(src && src[k], spec[k]); });
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== "object") return send(res, 400, { ok: false, error: "Invalid request." });
  if (JSON.stringify(body).length > 50000) return send(res, 413, { ok: false, error: "That update is too large." });

  const slug = String(body.slug || "");
  const k = String(body.k || "");
  if (!validSlug(slug)) return send(res, 400, { ok: false, error: "Unknown venue." });
  if (!validTokenShape(k)) return send(res, 403, { ok: false, error: "invalid_token" });

  const contact = body.contact || {};
  const name = clean(contact.name, 120);
  const email = clean(contact.email, 160);
  if (email && !EMAIL_RE.test(email)) return send(res, 400, { ok: false, error: "That email doesn’t look right. Fix it or leave it blank." });

  const listing = cleanObj(body.listing, LISTING_FIELDS);
  listing.changed_fields = Array.isArray(body.listing && body.listing.changed_fields)
    ? body.listing.changed_fields.filter((f) => typeof f === "string" && f in LISTING_FIELDS).slice(0, 20)
    : [];
  const main = cleanChoice(body.listing && body.listing.main_photo, slug);
  if (main) listing.main_photo = main;

  const rawUploads = Array.isArray(body.uploads) ? body.uploads : [];
  if (rawUploads.length > 30) return send(res, 400, { ok: false, error: "Please send at most 10 photos and one picture per event." });
  const uploads = [];
  for (const u of rawUploads) {
    const path = String((u && u.path) || "");
    if (!PATH_RE.test(path) || !path.startsWith(slug + "/")) return send(res, 400, { ok: false, error: "One of the photos didn’t upload. Please remove it and try again." });
    uploads.push({
      path, kind: u.kind === "event_image" ? "event_image" : "venue_photo",
      event_ref: clean(u.event_ref, 160), event_title: clean(u.event_title, 160),
      bytes: Math.max(0, Math.floor(Number(u.bytes) || 0)), content_type: clean(u.content_type, 40),
    });
  }

  const rawEvents = Array.isArray(body.events) ? body.events : [];
  if (rawEvents.length > 20) return send(res, 400, { ok: false, error: "Please send at most 20 events at a time." });
  const events = [];
  for (const e of rawEvents) {
    const action = ["add", "update", "cancel", "photo"].includes(e && e.action) ? e.action : "add";
    const ev = Object.assign({ action }, cleanObj(e, EVENT_FIELDS));
    ev.cancelled = !!(e && e.cancelled) || action === "cancel";
    if (e && e.original && typeof e.original === "object") ev.original = cleanObj(e.original, EVENT_FIELDS);
    const choice = cleanChoice(e && e.image_choice, slug);
    if (choice) ev.image_choice = choice;
    if (e && e.ref) ev.ref = clean(e.ref, 160);
    if (action === "add" && !ev.title && !ev.date && !ev.description && !ev.link && !choice) continue; // empty new card
    events.push(ev);
  }
  const orig = body.original && typeof body.original === "object" ? body.original : {};
  const original = {
    listing: cleanObj(orig.listing, LISTING_FIELDS),
    kind: clean(orig.kind, 20),
    page: `https://nightoutchicago.com/v/${slug}`,
  };

  try {
    const r = await rpc("nightout_submit", {
      p_slug: slug, p_token: k, p_contact_name: name, p_contact_email: email,
      p_listing: listing, p_events: events, p_original: original,
      p_user_agent: clean(req.headers["user-agent"], 400), p_ip_hash: ipHash(req), p_uploads: uploads,
    });
    if (r.status === 200 && r.json) return send(res, 200, { ok: true, id: r.json });
    const msg = (r.json && r.json.message) || "";
    if (msg === "invalid_token") return send(res, 403, { ok: false, error: "invalid_token" });
    if (msg === "rate_limited") return send(res, 429, { ok: false, error: "rate_limited" });
    if (msg === "payload_too_large" || msg === "too_many_events" || msg === "too_many_uploads") return send(res, 413, { ok: false, error: "That update is too large." });
    if (msg === "upload_missing" || msg === "bad_upload") return send(res, 400, { ok: false, error: "One of the photos didn’t finish uploading. Please remove it and try again." });
    console.error("submit rpc failed", r.status, r.text && r.text.slice(0, 300));
    return send(res, 502, { ok: false, error: "Couldn’t save just now. Please try again in a minute." });
  } catch (e) {
    console.error("submit error", e && e.message);
    return send(res, e.status || 500, { ok: false, error: "Couldn’t save just now. Please try again in a minute." });
  }
};
