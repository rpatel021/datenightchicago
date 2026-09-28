// POST /api/submit  — store a venue listing update for review. Nothing is published automatically.
// Body: {slug, k, contact:{name,email}, listing:{...}, events:[...], original:{...}}
const { rpc, validSlug, validTokenShape, send, ipHash } = require("./_lib");

const LISTING_FIELDS = {
  name: 120, description: 400, neighborhood: 80, address: 160, hours: 200, price: 12,
  phone: 40, website: 300, booking: 300, note_to_editors: 1500,
};
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
  if (!name || !EMAIL_RE.test(email)) return send(res, 400, { ok: false, error: "Please add your name and a valid email." });

  const listing = cleanObj(body.listing, LISTING_FIELDS);
  listing.changed_fields = Array.isArray(body.listing && body.listing.changed_fields)
    ? body.listing.changed_fields.filter((f) => typeof f === "string" && f in LISTING_FIELDS).slice(0, 20)
    : [];

  const rawEvents = Array.isArray(body.events) ? body.events : [];
  if (rawEvents.length > 20) return send(res, 400, { ok: false, error: "Please send at most 20 events at a time." });
  const events = [];
  for (const e of rawEvents) {
    const action = ["add", "update", "cancel"].includes(e && e.action) ? e.action : "add";
    const ev = Object.assign({ action }, cleanObj(e, EVENT_FIELDS));
    ev.cancelled = !!(e && e.cancelled) || action === "cancel";
    if (e && e.original && typeof e.original === "object") ev.original = cleanObj(e.original, EVENT_FIELDS);
    if (action === "add" && (!ev.title || !ev.date)) return send(res, 400, { ok: false, error: "Each new event needs a title and a date." });
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
      p_user_agent: clean(req.headers["user-agent"], 400), p_ip_hash: ipHash(req),
    });
    if (r.status === 200 && r.json) return send(res, 200, { ok: true, id: r.json });
    const msg = (r.json && r.json.message) || "";
    if (msg === "invalid_token") return send(res, 403, { ok: false, error: "invalid_token" });
    if (msg === "rate_limited") return send(res, 429, { ok: false, error: "rate_limited" });
    if (msg === "payload_too_large" || msg === "too_many_events") return send(res, 413, { ok: false, error: "That update is too large." });
    console.error("submit rpc failed", r.status, r.text && r.text.slice(0, 300));
    return send(res, 502, { ok: false, error: "Couldn’t save just now. Please try again in a minute." });
  } catch (e) {
    console.error("submit error", e && e.message);
    return send(res, e.status || 500, { ok: false, error: "Couldn’t save just now. Please try again in a minute." });
  }
};
