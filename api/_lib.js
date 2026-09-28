// Shared helpers for Night Out Chicago venue-listing API functions.
// The Supabase key lives only in Vercel env vars (never shipped to the browser).
// Tables are locked; the key can only reach SECURITY DEFINER RPCs that validate the venue token.
const crypto = require("crypto");

const SUPABASE_URL = process.env.NIGHTOUT_SUPABASE_URL;
const SUPABASE_KEY = process.env.NIGHTOUT_SUPABASE_SERVICE_KEY || process.env.NIGHTOUT_SUPABASE_KEY;

async function rpc(fn, body) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const e = new Error("store_not_configured");
    e.status = 500;
    throw e;
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  return { status: r.status, json, text };
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const validSlug = (s) => typeof s === "string" && SLUG_RE.test(s);
const validTokenShape = (k) => typeof k === "string" && k.length >= 16 && k.length <= 128 && /^[A-Za-z0-9_-]+$/.test(k);

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(JSON.stringify(obj));
}

function ipHash(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const salt = process.env.NIGHTOUT_IP_SALT || "nightout";
  return crypto.createHash("sha256").update(salt + "|" + ip).digest("hex").slice(0, 24);
}

module.exports = { rpc, validSlug, validTokenShape, send, ipHash };
