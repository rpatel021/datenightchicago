// GET /api/venue-token?slug=<slug>&k=<token>  ->  {ok: true|false}
// Used by the private editor page to decide whether to show the form. Never returns token data.
const { rpc, validSlug, validTokenShape, send } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "method_not_allowed" });
  const slug = String((req.query && req.query.slug) || "");
  const k = String((req.query && req.query.k) || "");
  if (!validSlug(slug) || !validTokenShape(k)) return send(res, 200, { ok: false });
  try {
    const r = await rpc("nightout_check_token", { p_slug: slug, p_token: k });
    if (r.status !== 200) return send(res, 502, { ok: false, error: "store_unavailable" });
    return send(res, 200, { ok: r.json === true });
  } catch (e) {
    return send(res, e.status || 500, { ok: false, error: "store_unavailable" });
  }
};
