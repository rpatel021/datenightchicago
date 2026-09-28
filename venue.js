/* Night Out Chicago: public venue page (/v/<slug>) + private listing editor (/v/<slug>/edit?k=<token>).
   Data: venues.json (stable slug index + approved details), restaurants.json, events.json.
   The editor never publishes anything: it POSTs to /api/submit, which stores a pending
   submission for review. */
(function () {
  "use strict";
  const CHI = "America/Chicago";
  const SITE = "Night Out Chicago";
  const pageEl = document.getElementById("page");
  const parts = location.pathname.replace(/\/+$/, "").split("/");
  const slug = decodeURIComponent(parts[2] || "").toLowerCase();
  const editMode = parts[3] === "edit";
  const token = new URLSearchParams(location.search).get("k") || "";
  const FIELDS = [
    ["name", "Name"],
    ["description", "Short description"],
    ["neighborhood", "Neighborhood"],
    ["address", "Address"],
    ["hours", "Hours"],
    ["price", "Price"],
    ["phone", "Phone"],
    ["website", "Website"],
    ["booking", "Booking link"],
  ];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function norm(s) {
    return String(s || "")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/&/g, " and ").replace(/['\u2019]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  function slugify(s) {
    return norm(s).replace(/^the /, "").replace(/\s+/g, "-") || "venue";
  }
  function pretty(s) {
    const t = String(s || "").replace(/_/g, " ").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  }
  function safeUrl(u) {
    const s = String(u || "").trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }
  // images may also be site-relative (approved venue photos live in /images/venues/<slug>/)
  function safeImg(u) {
    const s = String(u || "").trim();
    return /^https?:\/\//i.test(s) || /^\/images\/[\w\/.-]+$/.test(s) ? s : "";
  }
  function longDate(iso) {
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00-05:00");
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { timeZone: CHI, month: "short", day: "numeric", year: "numeric" });
  }
  function todayKey() {
    return new Date().toLocaleDateString("en-CA", { timeZone: CHI });
  }
  function dateParts(iso) {
    const d = new Date(String(iso) + "T12:00:00-05:00");
    if (isNaN(d)) return null;
    const f = (o) => d.toLocaleDateString("en-US", Object.assign({ timeZone: CHI }, o));
    return { dow: iso === todayKey() ? "Tonight" : f({ weekday: "short" }), day: f({ day: "numeric" }), mon: f({ month: "short" }), long: f({ weekday: "short", month: "short", day: "numeric" }) };
  }
  function minutes(t) {
    const m = String(t || "").match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?/i);
    if (!m) return 24 * 60;
    let h = +m[1];
    const ap = (m[3] || "").toLowerCase();
    if (ap === "p" && h !== 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    if (!ap && h < 7) h += 12;
    return h * 60 + (+m[2] || 0);
  }
  function setMeta(name, content, prop) {
    const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
    let el = document.head.querySelector(sel);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(prop ? "property" : "name", name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }
  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(url + " " + r.status);
      return r.json();
    });
  }

  if (editMode) {
    setMeta("robots", "noindex, nofollow");
    setMeta("referrer", "no-referrer");
  }

  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return renderMissing();

  const loads = [getJSON("/venues.json").catch(() => ({ venues: [] })), getJSON("/restaurants.json"), getJSON("/events.json")];
  if (editMode) {
    loads.push(
      token
        ? fetch(`/api/venue-token?slug=${encodeURIComponent(slug)}&k=${encodeURIComponent(token)}`, { cache: "no-store" })
            .then((r) => r.json().catch(() => ({ ok: false })))
            .catch(() => ({ ok: false, network: true }))
        : Promise.resolve({ ok: false })
    );
  }
  Promise.all(loads)
    .then(([vIdx, restaurants, events, tokenRes]) => {
      const venues = (vIdx && vIdx.venues) || [];
      restaurants = Array.isArray(restaurants) ? restaurants : restaurants.restaurants || [];
      events = Array.isArray(events) ? events : events.events || [];
      const model = buildModel(venues, restaurants, events);
      if (!model) return renderMissing();
      if (editMode && !(tokenRes && tokenRes.ok)) return renderBadToken(model, tokenRes);
      render(model);
    })
    .catch((err) => {
      console.error(err);
      pageEl.innerHTML = `<p class="notice">Couldn’t load this page. Give it a refresh.</p>`;
    });

  function buildModel(venues, restaurants, events) {
    const aliasTo = {};
    venues.forEach((v) => (v.aliases || []).concat(v.name || []).forEach((a) => { if (norm(a) && !aliasTo[norm(a)]) aliasTo[norm(a)] = v.slug; }));
    restaurants.forEach((r) => { const k = norm(r.name); if (k && !aliasTo[k]) aliasTo[k] = r.restaurant_id; });
    const slugOf = (name) => aliasTo[norm(name)] || slugify(name);

    let v = venues.find((x) => x.slug === slug);
    const r = restaurants.find((x) => x.restaurant_id === ((v && v.restaurant_id) || slug));
    const all = events.filter((e) => e.venue && slugOf(e.venue) === slug);
    if (!v && !r && !all.length) return null;
    v = v || { slug, kind: r ? "restaurant" : "venue", name: r ? r.name : all[0].venue, details: {} };
    const d = v.details || {};
    const m = { slug, kind: v.kind, cuisine: "", tags: [], images: [], updated: v.updated || "" };
    if (r) {
      Object.assign(m, {
        name: r.name, neighborhood: r.neighborhood || "", hours: r.meal_window || "", price: r.price_band || "",
        website: r.official_url || "", booking: r.reserve_url || "", description: r.notes || "", cuisine: r.cuisine || "",
        tags: [].concat(r.vibe_tags || [], r.category_focus || []),
        images: (r.images && r.images.length ? r.images : [r.image]).filter(Boolean),
      });
    } else {
      const hoods = {};
      all.forEach((e) => e.neighborhood && (hoods[e.neighborhood] = (hoods[e.neighborhood] || 0) + 1));
      const cats = {};
      all.forEach((e) => e.category && (cats[e.category] = (cats[e.category] || 0) + 1));
      Object.assign(m, {
        name: v.name, neighborhood: v.neighborhood || Object.keys(hoods).sort((a, b) => hoods[b] - hoods[a])[0] || "",
        hours: "", price: "", website: "", booking: "", description: "",
        tags: Object.keys(cats).sort((a, b) => cats[b] - cats[a]).slice(0, 3),
        images: (v.images || []).slice(),
      });
      if (!m.images.length) all.forEach((e) => [e.image].concat(e.images || []).forEach((u) => { if (u && !/unsplash\.com|cdninstagram\.com|fbcdn\.net/.test(u) && m.images.indexOf(u) < 0) m.images.push(u); }));
    }
    m.address = ""; m.phone = "";
    FIELDS.forEach(([k]) => { if (d[k]) m[k] = d[k]; });
    if (Array.isArray(d.images) && d.images.length) m.images = d.images.concat(m.images.filter((u) => d.images.indexOf(u) < 0));
    m.tags = [...new Set(m.tags.map((t) => String(t).toLowerCase()))].slice(0, 6);
    m.images = m.images.filter((u) => safeImg(u)).slice(0, 8);

    const today = todayKey();
    const seen = new Set();
    m.events = all
      .filter((e) => (e.date || "") >= today && String(e.status || "").toLowerCase() !== "cancelled" && norm(e.name) !== "closed")
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : minutes(a.start_time) - minutes(b.start_time)))
      .filter((e) => { const k = e.date + "|" + norm(e.name); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((e) => ({ event_id: e.event_id || "", name: e.name || "", date: e.date || "", start_time: e.start_time || "", cost: e.cost || "",
        notes: e.notes || "", date_friendly: e.date_friendly || "", url: safeUrl(e.official_url), event_image: safeImg(e.event_image), image: [e.image].concat(e.images || []).find((u) => u && !/unsplash\.com|cdninstagram\.com|fbcdn\.net/.test(u)) || "" }));
    return m;
  }

  /* ---------- rendering ---------- */

  function setHead(m) {
    const hood = m.neighborhood ? `${m.neighborhood}, Chicago` : "Chicago";
    document.title = editMode ? `Update your listing: ${m.name} · ${SITE}` : `${m.name} (${m.neighborhood || "Chicago"}) · ${SITE}`;
    const bits = [m.description || `${m.name} in ${hood}.`];
    if (m.kind === "restaurant") bits.push([m.price, m.hours].filter(Boolean).join(" · "));
    if (m.events.length) bits.push(`${m.events.length} upcoming event${m.events.length > 1 ? "s" : ""}.`);
    let desc = bits.filter(Boolean).map((x) => String(x).trim().replace(/[.!?]*$/, ".")).join(" ").replace(/\s+/g, " ");
    if (desc.length > 158) desc = desc.slice(0, 155).replace(/\s+\S*$/, "") + "…";
    setMeta("description", desc);
    setMeta("og:title", `${m.name} · ${SITE}`, true);
    setMeta("og:description", desc, true);
    if (m.images[0]) setMeta("og:image", m.images[0], true);
    if (!editMode) {
      let link = document.head.querySelector('link[rel="canonical"]');
      if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
      link.href = `https://nightoutchicago.com/v/${m.slug}`;
    }
  }

  function heroHtml(m) {
    const imgs = m.images;
    if (!imgs.length) {
      return `<section class="hero"><div class="photo-track"><div class="photo only fallback is-active"><span>${esc((m.name || "?").charAt(0).toUpperCase())}</span></div></div></section>`;
    }
    return `<section class="hero" aria-label="Photos">
      <div class="photo-track${imgs.length > 1 ? " multi" : ""}" role="region" aria-roledescription="carousel" aria-label="${esc(m.name)} photos">
        ${imgs.map((u, i) => `<div class="photo${imgs.length === 1 ? " only" : ""}${i === 0 ? " is-active" : ""}" role="img" aria-label="${esc(m.name)} photo ${i + 1} of ${imgs.length}" style="background-image:url('${esc(u)}')"></div>`).join("")}
      </div>
      <div class="dots" aria-hidden="true">${imgs.length > 1 ? imgs.map((_, i) => `<span class="${i === 0 ? "is-on" : ""}"></span>`).join("") : ""}</div>
    </section>`;
  }

  function headHtml(m) {
    const metaLine = [pretty(m.cuisine), m.price, m.hours].filter(Boolean).join(" · ");
    const pills = m.tags.map((t, i) => `<span class="pill${i < 2 ? " vibe" : ""}">${esc(pretty(t))}</span>`).join("");
    const booking = safeUrl(m.booking), website = safeUrl(m.website);
    const maps = m.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.name + ", " + m.address)}` : "";
    const rel = editMode ? "noopener noreferrer" : "noopener";
    return `
      <p class="eyebrow">${esc(m.neighborhood || "Chicago")}</p>
      <h1>${esc(m.name)}</h1>
      ${metaLine ? `<p class="meta">${esc(metaLine)}</p>` : ""}
      ${m.description ? `<p class="lede">${esc(m.description)}</p>` : ""}
      ${pills ? `<div class="pills">${pills}</div>` : ""}
      <div class="actions">
        ${booking ? `<a class="btn flame" href="${esc(booking)}" target="_blank" rel="${rel}">${m.kind === "restaurant" ? "Reserve" : "Tickets"}</a>` : ""}
        ${website && website !== booking ? `<a class="btn ghost" href="${esc(website)}" target="_blank" rel="${rel}">Official site</a>` : ""}
        ${maps ? `<a class="btn ghost" href="${esc(maps)}" target="_blank" rel="${rel}">Directions</a>` : ""}
      </div>`;
  }

  function detailRows(m) {
    const rows = [];
    const add = (label, html) => rows.push(`<div class="row"><dt>${label}</dt><dd>${html}</dd></div>`);
    const website = safeUrl(m.website), booking = safeUrl(m.booking);
    const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
    const rel = editMode ? "noopener noreferrer" : "noopener";
    const none = editMode ? `<span class="muted">Not listed yet</span>` : "";
    if (m.neighborhood || editMode) add("Area", m.neighborhood ? esc(m.neighborhood) : none);
    if (m.address || editMode) add("Address", m.address ? esc(m.address) : none);
    if (m.hours || editMode) add("Hours", m.hours ? esc(m.hours) : none);
    if (m.price || editMode) add("Price", m.price ? esc(m.price) : none);
    if (m.phone || editMode) add("Phone", m.phone ? `<a href="tel:${esc(m.phone.replace(/[^\d+]/g, ""))}">${esc(m.phone)}</a>` : none);
    if (website || editMode) add("Website", website ? `<a href="${esc(website)}" target="_blank" rel="${rel}">${esc(host(website))}</a>` : none);
    if (booking || editMode) add("Booking", booking ? `<a href="${esc(booking)}" target="_blank" rel="${rel}">${esc(host(booking))}</a>` : none);
    if (editMode) {
      add("Name", esc(m.name));
      add("About", m.description ? esc(m.description) : none);
    }
    return rows.join("");
  }

  function eventCard(e, opts) {
    const p = dateParts(e.date) || { dow: "", day: "?", mon: "" };
    const time = !e.start_time || /^tba$/i.test(e.start_time) ? "Time TBA" : e.start_time;
    const cost = /^tba$/i.test(String(e.cost || "").trim()) ? "Price TBA" : e.cost;
    const meta = [p.long, time, cost].filter(Boolean).join(" · ");
    const note = e.notes && !/^confirm time|^also via/i.test(e.notes) ? e.notes.split(" | ")[0] : "";
    const rel = editMode ? "noopener noreferrer" : "noopener";
    const big = e.event_image || "";
    const thumb = big ? "" : e.image;
    return `<article class="ev${thumb ? " has-img" : ""}${big ? " has-flyer" : ""}${opts && opts.cls ? " " + opts.cls : ""}">
      <div class="ev-date" aria-hidden="true"><span class="dow">${esc(p.dow)}</span><span class="day">${esc(p.day)}</span><span class="mon">${esc(p.mon)}</span></div>
      <div>
        <h3>${esc(e.name)}</h3>
        <p class="ev-meta">${esc(meta)}</p>
        ${note ? `<p class="ev-note">${esc(note)}</p>` : ""}
        ${e.url ? `<a class="more" href="${esc(e.url)}" target="_blank" rel="${rel}">Details →</a>` : ""}
        ${opts && opts.tools ? opts.tools : ""}
      </div>
      ${thumb ? `<div class="ev-img" style="background-image:url('${esc(thumb)}')" aria-hidden="true"></div>` : ""}
      ${big ? `<div class="ev-flyer"><img src="${esc(big)}" alt="${esc(e.name)}" loading="lazy" /></div>` : ""}
      ${opts && opts.after ? opts.after : ""}
    </article>`;
  }

  function wireCarousel(root) {
    const track = root.querySelector(".photo-track");
    if (!track) return;
    const cards = [...track.querySelectorAll(".photo")];
    const dots = [...root.querySelectorAll(".dots span")];
    if (cards.length < 2) return;
    let raf = 0;
    track.addEventListener("scroll", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = track.scrollLeft + track.clientWidth / 2;
        let best = 0, bd = Infinity;
        cards.forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
        cards.forEach((c, i) => c.classList.toggle("is-active", i === best));
        dots.forEach((d, i) => d.classList.toggle("is-on", i === best));
      });
    }, { passive: true });
    cards.forEach((c, i) => c.addEventListener("click", () => {
      if (!c.classList.contains("is-active")) track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2, behavior: "smooth" });
    }));
  }

  function render(m) {
    setHead(m);
    if (editMode) return renderEditor(m);
    pageEl.innerHTML = `
      ${heroHtml(m)}
      <section class="head">${headHtml(m)}</section>
      <section class="section" aria-labelledby="details-h">
        <div class="section-head"><h2 id="details-h">Details</h2></div>
        <div class="card"><dl>${detailRows(m) || `<p class="empty">More details coming soon.</p>`}</dl></div>
      </section>
      <section class="section" aria-labelledby="events-h">
        <div class="section-head"><h2 id="events-h">Upcoming events</h2></div>
        <div class="events">${m.events.length ? m.events.map((e) => eventCard(e)).join("") : `<div class="card"><p class="empty">No upcoming events listed right now.</p></div>`}</div>
      </section>
      ${m.updated && longDate(m.updated) ? `<p class="updated">Last updated ${esc(longDate(m.updated))}</p>` : ""}`;
    wireCarousel(pageEl);
  }

  function renderMissing() {
    document.title = `Spot not found · ${SITE}`;
    setMeta("robots", "noindex");
    pageEl.innerHTML = `<div class="thanks"><p class="big">We couldn’t find that spot.</p><p>It may have moved or the link is off by a letter.</p><p><a class="btn" href="/">Browse tonight</a></p></div>`;
  }

  function renderBadToken(m, res) {
    document.title = `Link not valid · ${SITE}`;
    pageEl.innerHTML = `<div class="thanks"><p class="big">This edit link isn’t valid.</p>
      <p>${res && res.network ? "We couldn’t check your link just now. Check your connection and refresh." : "Make sure you opened the full private link we sent for " + esc(m.name) + "."}</p>
      <p><a class="btn ghost" href="/v/${esc(m.slug)}">View the public page</a></p></div>`;
  }

  /* ---------- editor ---------- */

  function renderEditor(m) {
    const orig = {};
    FIELDS.forEach(([k]) => (orig[k] = m[k] || ""));
    const MAX_PHOTOS = 10;
    const MAX_BYTES = 10 * 1024 * 1024;
    const state = {
      listing: Object.assign({}, orig), editingDetails: false, evEdits: {}, newEvents: [], seq: 0,
      // venue photos: current catalog photos + new ones picked on this phone (uploaded on Submit)
      photos: m.images.map((u, i) => ({ id: "c" + i, source: "existing", url: u, thumb: u })),
      newCount: 0, main: m.images.length ? "c0" : null, evImg: {}, picker: null, busy: 0,
    };
    const initialMain = state.main;

    pageEl.innerHTML = `
      <div class="intro"><strong>This is your page on Night Out Chicago.</strong>Update any details, add photos and event flyers, and pick your main photo. Nothing is required: change only what you want. We review everything before it goes live.
        <small>Private link for ${esc(m.name)}. It doesn’t expire, so bookmark it and come back anytime. Please don’t share it publicly.</small></div>
      <div id="hero-wrap">${heroHtml(m)}</div>
      <form id="ed" novalidate>
        <section class="section" aria-labelledby="photos-h">
          <div class="section-head"><h2 id="photos-h">Photos</h2><span class="hint" id="photo-hint"></span></div>
          <div class="ph-grid" id="ph-grid"></div>
          <label class="btn ghost add-ph" id="add-ph-label">
            <input type="file" id="add-ph" accept="image/*" multiple class="vh" />
            <span aria-hidden="true">＋</span> Add photos
          </label>
          <p class="ph-note" id="ph-note">Up to ${MAX_PHOTOS} per update. We shrink big photos automatically.</p>
        </section>
        <section class="head" id="head"></section>
        <section class="section" aria-labelledby="details-h">
          <div class="section-head"><h2 id="details-h">Details</h2>
            <button type="button" class="btn small ghost edit-toggle" id="details-toggle" aria-pressed="false" aria-controls="details-body">Edit</button></div>
          <div class="card" id="details-body"></div>
        </section>
        <section class="section" aria-labelledby="events-h">
          <div class="section-head"><h2 id="events-h">Upcoming events</h2></div>
          <div class="events" id="ev-list"></div>
          <button type="button" class="btn ghost add-ev" id="add-ev">+ Add an event</button>
        </section>
        <section class="section" aria-labelledby="contact-h">
          <div class="section-head"><h2 id="contact-h">Who’s sending this? <em class="opt">optional</em></h2></div>
          <div class="card">
            <label class="field"><span>Your name</span><input name="contact_name" autocomplete="name" maxlength="120" /></label>
            <label class="field"><span>Email <em>(only used if we have a question)</em></span><input name="contact_email" type="email" inputmode="email" autocomplete="email" maxlength="160" /></label>
          </div>
        </section>
        <section class="section" aria-labelledby="else-h">
          <div class="section-head"><h2 id="else-h">Anything else we should know?</h2></div>
          <div class="card">
            <label class="field"><span class="vh">Anything else we should know?</span><textarea name="anything_else" id="anything-else" maxlength="2000" rows="4" placeholder="Specials, closures, a new chef, holiday hours, private events…"></textarea></label>
          </div>
        </section>
        <div class="submit-bar">
          <p class="change-count" id="change-count"></p>
          <button type="submit" class="btn flame" id="submit-btn">Submit updates for review</button>
          <p>Nothing goes live until we’ve reviewed it.</p>
          <p class="err" id="err" role="alert" hidden></p>
        </div>
      </form>
      <input type="file" id="ev-file" accept="image/*" class="vh" tabindex="-1" aria-hidden="true" />`;
    wireCarousel(pageEl);
    const form = pageEl.querySelector("#ed");
    const heroWrap = pageEl.querySelector("#hero-wrap");
    const headEl = pageEl.querySelector("#head");
    const detailsBody = pageEl.querySelector("#details-body");
    const toggle = pageEl.querySelector("#details-toggle");
    const evList = pageEl.querySelector("#ev-list");
    const countEl = pageEl.querySelector("#change-count");
    const errEl = pageEl.querySelector("#err");
    const phGrid = pageEl.querySelector("#ph-grid");
    const phInput = pageEl.querySelector("#add-ph");
    const phNote = pageEl.querySelector("#ph-note");
    const phHint = pageEl.querySelector("#photo-hint");
    const evFile = pageEl.querySelector("#ev-file");
    const elseBox = pageEl.querySelector("#anything-else");

    /* ---- image prep: downscale to ~2000px JPEG on the phone (also strips location metadata) ---- */
    function prepImage(file) {
      const okType = /^image\/(jpeg|png|webp|heic|heif|gif)$/.test(file.type);
      const keep = () => okType && file.size <= MAX_BYTES
        ? Promise.resolve({ blob: file, type: file.type, bytes: file.size, thumb: URL.createObjectURL(file) })
        : Promise.reject(new Error(okType ? "too_big" : "type"));
      if (file.type === "image/gif" || !window.createImageBitmap || file.size > 40 * 1024 * 1024) return keep();
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file)).then((bmp) => {
        const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
        const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(bmp, 0, 0, w, h);
        if (bmp.close) bmp.close();
        return new Promise((res) => c.toBlob(res, "image/jpeg", 0.85)).then((blob) => {
          if (!blob) return keep();
          if (blob.size > MAX_BYTES) throw new Error("too_big");
          return { blob, type: "image/jpeg", bytes: blob.size, thumb: URL.createObjectURL(blob) };
        });
      }, keep);
    }
    function prepError(e) {
      return e && e.message === "type" ? "That file isn’t a photo we can use. Try a JPG, PNG or HEIC." : "That photo is too large (over 10 MB). Try a smaller one.";
    }

    function preview() {
      return Object.assign({}, m, state.listing);
    }
    function paintHead() {
      headEl.innerHTML = headHtml(preview());
    }
    function photoById(id) {
      return state.photos.find((p) => p.id === id);
    }
    function paintHero() {
      const imgs = state.photos.map((p) => p.thumb);
      const mi = state.photos.findIndex((p) => p.id === state.main);
      if (mi > 0) imgs.unshift(imgs.splice(mi, 1)[0]);
      heroWrap.innerHTML = heroHtml(Object.assign({}, m, { images: imgs }));
      wireCarousel(heroWrap);
    }
    function paintPhotos() {
      const n = state.photos.filter((p) => p.source === "upload").length;
      phHint.textContent = state.photos.length > 1 ? "Tap a photo to make it your main one" : "";
      phGrid.innerHTML = state.photos.map((p) => {
        const on = p.id === state.main;
        return `<div class="ph${on ? " is-main" : ""}${p.source === "upload" ? " is-new" : ""}">
          <button type="button" class="ph-pick" data-main="${p.id}" aria-pressed="${on}" aria-label="${on ? "Main photo" : "Make this the main photo"}">
            <img src="${esc(p.thumb)}" alt="" loading="lazy" />
            <span class="ph-tag">${on ? "★ Main photo" : "☆ Make main"}</span>
          </button>
          ${p.source === "upload" ? `<span class="ph-new">New</span><button type="button" class="ph-x" data-rm="${p.id}" aria-label="Remove this photo">×</button>` : ""}
        </div>`;
      }).join("") || `<p class="ph-empty">No photos yet. Add a few so people can see the place.</p>`;
      phNote.textContent = n >= MAX_PHOTOS ? `That’s ${MAX_PHOTOS} new photos, the most for one update. Send more in another update.` : `Up to ${MAX_PHOTOS} per update${n ? ` (${n} added)` : ""}. We shrink big photos automatically.`;
      pageEl.querySelector("#add-ph-label").classList.toggle("is-disabled", n >= MAX_PHOTOS);
      phInput.disabled = n >= MAX_PHOTOS;
    }
    function paintDetails() {
      toggle.setAttribute("aria-pressed", state.editingDetails ? "true" : "false");
      toggle.textContent = state.editingDetails ? "Done" : "Edit";
      if (!state.editingDetails) {
        detailsBody.innerHTML = `<dl>${detailRows(preview())}</dl>`;
        return;
      }
      const L = state.listing;
      const inp = (k, label, attrs, hint) => `<label class="field"><span>${label}${hint ? ` <em>${hint}</em>` : ""}</span><input name="${k}" value="${esc(L[k])}" ${attrs || ""} /></label>`;
      const prices = ["", "$", "$$", "$$$", "$$$$"];
      if (L.price && prices.indexOf(L.price) < 0) prices.push(L.price);
      detailsBody.innerHTML = `
        ${inp("name", "Name", 'maxlength="120" autocomplete="organization"')}
        <label class="field"><span>Short description <em>(1–2 sentences)</em></span><textarea name="description" maxlength="400" rows="3">${esc(L.description)}</textarea></label>
        ${inp("neighborhood", "Neighborhood", 'maxlength="80"')}
        ${inp("address", "Street address", 'maxlength="160" autocomplete="street-address" placeholder="e.g. 2301 W Roscoe St, Chicago, IL 60618"')}
        ${inp("hours", "Hours", 'maxlength="200" placeholder="e.g. Tue–Sun 5–10pm; brunch Sat–Sun 10am–2pm"')}
        <label class="field"><span>Price</span><select name="price">${prices.map((p) => `<option value="${esc(p)}"${p === L.price ? " selected" : ""}>${p ? esc(p) : "Not listed"}</option>`).join("")}</select></label>
        ${inp("phone", "Phone", 'type="tel" inputmode="tel" maxlength="40" autocomplete="tel" placeholder="(773) 555-0123"')}
        ${inp("website", "Website", 'type="url" inputmode="url" maxlength="300" placeholder="https://"')}
        ${inp("booking", "Booking / tickets link", 'type="url" inputmode="url" maxlength="300" placeholder="https://"')}`;
      markChanged();
    }
    function markChanged() {
      detailsBody.querySelectorAll("input, textarea, select").forEach((el) => el.classList.toggle("is-changed", (state.listing[el.name] || "") !== (orig[el.name] || "")));
    }

    /* ---- event picture: pick one of the venue's photos or upload a photo/flyer (one per event) ---- */
    function evImgUrl(key) {
      const c = state.evImg[key];
      if (!c) return "";
      if (c.source === "photo") { const p = photoById(c.photoId); return p ? p.thumb : ""; }
      return c.thumb || "";
    }
    function evPicHtml(key) {
      const url = evImgUrl(key);
      const open = state.picker === key;
      let html = `<div class="ev-pic" data-key="${key}">`;
      if (url) {
        html += `<div class="ev-pic-chosen"><img src="${esc(url)}" alt="Chosen event picture" />
          <div><span class="ev-pic-label">Event picture</span>
          <button type="button" class="linkish" data-act="pic-open" data-key="${key}">Change</button>
          <button type="button" class="linkish danger" data-act="pic-clear" data-key="${key}">Remove</button></div></div>`;
      } else if (!open) {
        html += `<button type="button" class="btn small ghost pic-btn" data-act="pic-open" data-key="${key}"><span aria-hidden="true">＋</span> Add a photo or flyer</button>`;
      }
      if (open) {
        const photos = state.photos;
        html += `<div class="picker" role="group" aria-label="Choose the event picture">
          <div class="picker-head"><span>Choose the event picture</span><button type="button" class="linkish" data-act="pic-close" data-key="${key}">Cancel</button></div>
          <button type="button" class="btn small pic-up" data-act="pic-upload" data-key="${key}"><span aria-hidden="true">⇪</span> Upload a photo or flyer</button>
          ${photos.length ? `<p class="picker-sub">Or use one of your photos</p>
          <div class="picker-grid">${photos.map((p) => `<button type="button" class="pk${state.evImg[key] && state.evImg[key].photoId === p.id ? " is-on" : ""}" data-act="pic-photo" data-key="${key}" data-photo="${p.id}" aria-label="Use this photo"><img src="${esc(p.thumb)}" alt="" loading="lazy" /></button>`).join("")}</div>` : ""}
        </div>`;
      }
      return html + `</div>`;
    }

    function evFormHtml(key, e, isNew) {
      const f = (n, label, val, attrs) => `<label class="field"><span>${label}</span><input name="${n}" value="${esc(val || "")}" ${attrs || ""} /></label>`;
      return `<div class="ev-form" data-key="${key}">
        <div class="ev-form-head"><span>${isNew ? "New event" : "Edit event"}</span>
          <button type="button" class="linkish ${isNew ? "danger" : ""}" data-act="${isNew ? "remove" : "close"}">${isNew ? "Remove" : "Done"}</button></div>
        ${f("title", "Event title", e.title, 'maxlength="160"')}
        <div class="two">
          ${f("date", "Date", e.date, `type="date" min="${todayKey()}"`)}
          ${f("start_time", "Start time", e.start_time, 'maxlength="40" placeholder="7:30 PM or TBA"')}
        </div>
        ${f("price", "Price", e.price, 'maxlength="60" placeholder="Free, $25, $20–40"')}
        <label class="field"><span>Short description</span><textarea name="description" maxlength="500" rows="2">${esc(e.description || "")}</textarea></label>
        ${f("link", "Link (tickets or details)", e.link, 'type="url" inputmode="url" maxlength="300" placeholder="https://"')}
        ${isNew ? "" : `<label class="check"><input type="checkbox" name="cancelled" ${e.cancelled ? "checked" : ""} /> This event is cancelled</label>`}
        <div class="ev-form-pic">${evPicHtml(key)}</div>
      </div>`;
    }
    function existingAsForm(e) {
      return { title: e.name, date: e.date, start_time: e.start_time, price: e.cost, description: e.notes && !/^confirm time|^also via/i.test(e.notes) ? e.notes.split(" | ")[0] : "", link: e.url, cancelled: false };
    }
    function paintEvents() {
      const html = [];
      m.events.forEach((e, i) => {
        const key = "x" + i;
        const ed = state.evEdits[key];
        if (ed && ed.open) return html.push(evFormHtml(key, ed.data, false));
        let shown = ed ? Object.assign({}, e, { name: ed.data.title, date: ed.data.date, start_time: ed.data.start_time, cost: ed.data.price, notes: ed.data.description, url: safeUrl(ed.data.link) }) : e;
        if (state.evImg[key]) shown = Object.assign({}, shown, { event_image: "", image: "" }); // picture shown in the picker row
        const tag = ed && ed.data.cancelled ? `<span class="pill">Marked cancelled</span> ` : ed && ed.changed ? `<span class="pill price">Edited</span> ` : state.evImg[key] ? `<span class="pill price">New picture</span> ` : "";
        html.push(eventCard(shown, { cls: ed && ed.data.cancelled ? "is-cancel" : "", tools: `<div class="ev-edit-row">${tag}<button type="button" class="linkish" data-act="edit" data-key="${key}">Edit details</button></div>`, after: `<div class="ev-after">${evPicHtml(key)}</div>` }));
      });
      state.newEvents.forEach((n) => html.push(evFormHtml(n.key, n.data, true)));
      evList.innerHTML = html.join("") || `<div class="card"><p class="empty">No upcoming events listed yet. Add your next one below.</p></div>`;
    }
    function changedFields() {
      return FIELDS.map(([k]) => k).filter((k) => (state.listing[k] || "").trim() !== (orig[k] || "").trim());
    }
    function evChanged(key, data) {
      const i = +key.slice(1);
      const base = existingAsForm(m.events[i]);
      return Object.keys(data).some((k) => String(data[k] || "").trim() !== String(base[k] || "").trim());
    }
    function newEventFilled(n) {
      return ["title", "date", "start_time", "price", "description", "link"].some((k) => String(n.data[k] || "").trim()) || !!state.evImg[n.key];
    }
    function updateCount() {
      const nPh = state.photos.filter((p) => p.source === "upload").length;
      const evKeys = new Set(Object.keys(state.evEdits).filter((k) => state.evEdits[k].changed));
      Object.keys(state.evImg).forEach((k) => { if (k[0] === "x") evKeys.add(k); });
      const n = changedFields().length + evKeys.size + state.newEvents.filter(newEventFilled).length + nPh +
        (state.main !== initialMain ? 1 : 0) + (elseBox.value.trim() ? 1 : 0);
      countEl.textContent = n ? `${n} change${n > 1 ? "s" : ""} ready to send` : "";
    }

    toggle.addEventListener("click", () => {
      state.editingDetails = !state.editingDetails;
      paintDetails();
      if (state.editingDetails) { const first = detailsBody.querySelector("input"); if (first) first.focus({ preventScroll: true }); }
    });
    detailsBody.addEventListener("input", (ev) => {
      const el = ev.target;
      if (!el.name || !(el.name in state.listing)) return;
      state.listing[el.name] = el.value;
      el.classList.toggle("is-changed", (el.value || "") !== (orig[el.name] || ""));
      paintHead();
      updateCount();
    });
    elseBox.addEventListener("input", updateCount);

    phInput.addEventListener("change", () => {
      const files = [...phInput.files];
      phInput.value = "";
      if (!files.length) return;
      showErr("");
      const room = MAX_PHOTOS - state.photos.filter((p) => p.source === "upload").length;
      if (files.length > room) showErr(`Only ${MAX_PHOTOS} new photos per update, so we kept the first ${Math.max(room, 0)}. Send the rest in another update.`);
      state.busy++;
      phNote.textContent = "Getting your photos ready…";
      Promise.all(files.slice(0, Math.max(room, 0)).map((f) => prepImage(f).then((r) => r, (e) => ({ error: prepError(e) }))))
        .then((results) => {
          state.busy--;
          const bad = results.filter((r) => r.error);
          results.filter((r) => !r.error).forEach((r) => {
            const id = "u" + ++state.newCount;
            state.photos.push(Object.assign({ id, source: "upload" }, r));
            if (!state.main) state.main = id;
          });
          if (bad.length) showErr(bad[0].error);
          paintPhotos(); paintHero(); paintEvents(); updateCount();
        });
    });
    phGrid.addEventListener("click", (ev) => {
      const rm = ev.target.closest("[data-rm]");
      if (rm) {
        const id = rm.dataset.rm;
        const p = photoById(id);
        state.photos = state.photos.filter((x) => x.id !== id);
        if (p && p.thumb && p.source === "upload") URL.revokeObjectURL(p.thumb);
        if (state.main === id) state.main = state.photos.length ? (initialMain && photoById(initialMain) ? initialMain : state.photos[0].id) : null;
        Object.keys(state.evImg).forEach((k) => { if (state.evImg[k].photoId === id) delete state.evImg[k]; });
        paintPhotos(); paintHero(); paintEvents(); updateCount();
        return;
      }
      const b = ev.target.closest("[data-main]");
      if (!b) return;
      state.main = b.dataset.main;
      paintPhotos(); paintHero(); updateCount();
    });

    let evFileKey = null;
    evFile.addEventListener("change", () => {
      const f = evFile.files[0];
      evFile.value = "";
      const key = evFileKey;
      if (!f || !key) return;
      showErr("");
      prepImage(f).then((r) => {
        const old = state.evImg[key];
        if (old && old.source === "upload" && old.thumb) URL.revokeObjectURL(old.thumb);
        state.evImg[key] = Object.assign({ source: "upload" }, r);
        state.picker = null;
        paintEvents(); updateCount();
      }, (e) => showErr(prepError(e)));
    });

    function eventTitleFor(key) {
      if (key[0] === "x") { const ed = state.evEdits[key]; return (ed && ed.data.title) || m.events[+key.slice(1)].name; }
      const n = state.newEvents.find((x) => x.key === key);
      return (n && n.data.title) || "New event";
    }

    evList.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      const key = b.dataset.key || (b.closest(".ev-form") && b.closest(".ev-form").dataset.key);
      if (act === "edit") {
        const i = +key.slice(1);
        state.evEdits[key] = state.evEdits[key] || { data: existingAsForm(m.events[i]), changed: false };
        state.evEdits[key].open = true;
        paintEvents();
        const f = evList.querySelector(`.ev-form[data-key="${key}"] input`);
        if (f) f.focus({ preventScroll: true });
      } else if (act === "close") {
        state.evEdits[key].open = false;
        paintEvents();
      } else if (act === "remove") {
        state.newEvents = state.newEvents.filter((n) => n.key !== key);
        delete state.evImg[key];
        paintEvents();
      } else if (act === "pic-open") {
        state.picker = key;
        paintEvents();
      } else if (act === "pic-close") {
        state.picker = null;
        paintEvents();
      } else if (act === "pic-clear") {
        delete state.evImg[key];
        paintEvents();
      } else if (act === "pic-photo") {
        state.evImg[key] = { source: "photo", photoId: b.dataset.photo };
        state.picker = null;
        paintEvents();
      } else if (act === "pic-upload") {
        evFileKey = key;
        evFile.click();
      }
      updateCount();
    });
    evList.addEventListener("input", (ev) => {
      const box = ev.target.closest(".ev-form");
      if (!box) return;
      const key = box.dataset.key;
      const el = ev.target;
      if (!el.name) return;
      const val = el.type === "checkbox" ? el.checked : el.value;
      if (key[0] === "x") {
        state.evEdits[key].data[el.name] = val;
        state.evEdits[key].changed = evChanged(key, state.evEdits[key].data);
      } else {
        const n = state.newEvents.find((x) => x.key === key);
        if (n) n.data[el.name] = val;
      }
      updateCount();
    });
    pageEl.querySelector("#add-ev").addEventListener("click", () => {
      const key = "n" + ++state.seq;
      state.newEvents.push({ key, data: { title: "", date: "", start_time: "", price: "", description: "", link: "" } });
      paintEvents();
      const f = evList.querySelector(`.ev-form[data-key="${key}"] input`);
      if (f) { f.focus({ preventScroll: true }); f.closest(".ev-form").scrollIntoView({ behavior: "smooth", block: "center" }); }
      updateCount();
    });

    function showErr(msg) {
      errEl.textContent = msg;
      errEl.hidden = !msg;
    }
    const btn = pageEl.querySelector("#submit-btn");
    function resetBtn() {
      btn.disabled = false;
      btn.textContent = "Submit updates for review";
    }

    // Uploads go straight to a private bucket through one-time signed URLs (valid edit link required).
    function uploadAll(items) {
      if (!items.length) return Promise.resolve([]);
      return fetch("/api/upload-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: m.slug, k: token, files: items.map((it) => ({ kind: it.kind, content_type: it.type, size: it.bytes })) }),
      }).then((r) => r.json().catch(() => ({})).then((j) => ({ status: r.status, j }))).then(({ status, j }) => {
        if (status !== 200 || !j.ok || !Array.isArray(j.uploads) || j.uploads.length !== items.length) {
          const e = new Error(status === 403 ? "invalid" : status === 429 ? "rate" : "upload");
          throw e;
        }
        let done = 0;
        btn.textContent = `Uploading photos 0 of ${items.length}…`;
        const one = (it, u) => fetch(u.signed_url, { method: "PUT", headers: { "Content-Type": it.type, "x-upsert": "false" }, body: it.blob })
          .then((r) => { if (!r.ok) throw new Error("upload"); done++; btn.textContent = `Uploading photos ${done} of ${items.length}…`; return Object.assign({}, it, { path: u.path }); });
        // two at a time is kind to phone connections
        const out = new Array(items.length);
        let next = 0;
        const worker = () => next < items.length ? (function (i) { next++; return one(items[i], j.uploads[i]).then((x) => { out[i] = x; return worker(); }); })(next) : Promise.resolve();
        return Promise.all([worker(), worker()]).then(() => out);
      });
    }

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      showErr("");
      if (state.busy) { showErr("Still getting your photos ready. Try again in a second."); return; }
      const contactName = form.contact_name.value.trim();
      const contactEmail = form.contact_email.value.trim();
      const anythingElse = elseBox.value.trim();
      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) {
        showErr("That email doesn’t look right. Fix it or leave it blank.");
        form.contact_email.focus();
        return;
      }
      const newEvents = state.newEvents.filter(newEventFilled);
      const urlBad = [state.listing.website, state.listing.booking].concat(newEvents.map((n) => n.data.link), Object.values(state.evEdits).map((x) => x.data.link))
        .some((u) => u && u.trim() && !/^https?:\/\/\S+\.\S+/i.test(u.trim()) && !/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(u.trim()));
      if (urlBad) { showErr("One of the links doesn’t look like a web address. Please check it (e.g. https://example.com)."); return; }

      const changed = changedFields();
      const newPhotos = state.photos.filter((p) => p.source === "upload");
      const evImgKeys = Object.keys(state.evImg).filter((k) => k[0] === "x" || newEvents.some((n) => n.key === k));
      const mainChanged = state.main !== initialMain;
      const anyEvEdit = Object.values(state.evEdits).some((x) => x.changed);
      if (!changed.length && !anyEvEdit && !newEvents.length && !anythingElse && !newPhotos.length && !evImgKeys.length && !mainChanged) {
        showErr("Nothing has changed yet. Add photos, tap Edit on Details, add an event, or write a note below.");
        return;
      }
      // files to upload: new venue photos + event pictures uploaded from this phone
      const items = newPhotos.map((p) => ({ ref: p.id, kind: "venue_photo", blob: p.blob, type: p.type, bytes: p.bytes }));
      evImgKeys.forEach((k) => {
        const c = state.evImg[k];
        if (c.source === "upload") items.push({ ref: "ev:" + k, kind: "event_image", blob: c.blob, type: c.type, bytes: c.bytes, evKey: k });
      });
      btn.disabled = true;
      btn.textContent = items.length ? "Preparing photos…" : "Sending…";
      uploadAll(items).then((done) => {
        const pathOf = {};
        done.forEach((d) => (pathOf[d.ref] = d.path));
        const evRef = (k) => (k[0] === "x" ? m.events[+k.slice(1)].event_id || "x:" + k.slice(1) : "new:" + k.slice(1));
        const choiceFor = (k) => {
          const c = state.evImg[k];
          if (!c) return null;
          if (c.source === "upload") return { source: "upload", path: pathOf["ev:" + k] };
          const p = photoById(c.photoId);
          if (!p) return null;
          return p.source === "existing" ? { source: "existing", url: p.url } : { source: "upload", path: pathOf[p.id] };
        };
        const uploads = done.map((d) => ({
          path: d.path, kind: d.kind, bytes: d.bytes, content_type: d.type,
          event_ref: d.evKey ? evRef(d.evKey) : "", event_title: d.evKey ? eventTitleFor(d.evKey) : "",
        }));
        const events = [];
        m.events.forEach((e, i) => {
          const key = "x" + i;
          const x = state.evEdits[key];
          const choice = choiceFor(key);
          if (!(x && x.changed) && !choice) return;
          const data = x ? x.data : existingAsForm(e);
          const action = x && x.changed ? (data.cancelled ? "cancel" : "update") : "photo";
          const out = Object.assign({ action, event_id: e.event_id, ref: evRef(key), original: existingAsForm(e) }, data);
          if (choice) out.image_choice = choice;
          events.push(out);
        });
        newEvents.forEach((n) => {
          const out = Object.assign({ action: "add", ref: evRef(n.key) }, n.data);
          const choice = choiceFor(n.key);
          if (choice) out.image_choice = choice;
          events.push(out);
        });
        const mp = mainChanged && state.main ? photoById(state.main) : null;
        const main_photo = mp ? (mp.source === "existing" ? { source: "existing", url: mp.url } : { source: "upload", path: pathOf[mp.id] }) : null;
        btn.textContent = "Sending…";
        const payload = {
          slug: m.slug,
          k: token,
          contact: { name: contactName, email: contactEmail },
          listing: Object.assign({}, state.listing, { anything_else: anythingElse, changed_fields: changed, main_photo }),
          events,
          uploads,
          original: { listing: orig, kind: m.kind, page: location.origin + "/v/" + m.slug },
        };
        return fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .then((r) => r.json().catch(() => ({})).then((j) => ({ status: r.status, j })))
          .then(({ status, j }) => {
            if (status === 200 && j.ok) return renderThanks(m);
            resetBtn();
            if (status === 403) showErr("This edit link isn’t valid anymore. Please ask us for a fresh link.");
            else if (status === 429) showErr("Lots of updates in the last hour. Please try again a bit later.");
            else showErr(j && j.error ? j.error : "Couldn’t send just now. Check your connection and try again.");
          });
      }).catch((e) => {
        resetBtn();
        if (e && e.message === "invalid") showErr("This edit link isn’t valid anymore. Please ask us for a fresh link.");
        else if (e && e.message === "rate") showErr("Lots of photos in the last hour. Please try again a bit later.");
        else showErr(items.length ? "Your photos didn’t upload. Check your connection and try again." : "Couldn’t send just now. Check your connection and try again.");
      });
    });

    paintPhotos();
    paintHead();
    paintDetails();
    paintEvents();
  }

  function renderThanks(m) {
    pageEl.innerHTML = `<div class="thanks" role="status">
      <div class="check-mark" aria-hidden="true">✓</div>
      <p class="big">Thanks! We review updates and they usually go live within a day.</p>
      <p>You can use this same private link anytime to send more updates for ${esc(m.name)}.</p>
      <p style="margin-top:1rem"><a class="btn ghost" href="${esc(location.pathname + location.search)}">Back to your listing</a></p>
      <p><a class="btn" href="/v/${esc(m.slug)}">View public page</a></p>
    </div>`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
})();
