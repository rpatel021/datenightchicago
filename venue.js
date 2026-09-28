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
    const m = { slug, kind: v.kind, cuisine: "", tags: [], images: [] };
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
    m.images = m.images.filter((u) => safeUrl(u)).slice(0, 8);

    const today = todayKey();
    const seen = new Set();
    m.events = all
      .filter((e) => (e.date || "") >= today && String(e.status || "").toLowerCase() !== "cancelled" && norm(e.name) !== "closed")
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : minutes(a.start_time) - minutes(b.start_time)))
      .filter((e) => { const k = e.date + "|" + norm(e.name); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((e) => ({ event_id: e.event_id || "", name: e.name || "", date: e.date || "", start_time: e.start_time || "", cost: e.cost || "",
        notes: e.notes || "", date_friendly: e.date_friendly || "", url: safeUrl(e.official_url), image: [e.image].concat(e.images || []).find((u) => u && !/unsplash\.com|cdninstagram\.com|fbcdn\.net/.test(u)) || "" }));
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
    return `<article class="ev${e.image ? " has-img" : ""}${opts && opts.cls ? " " + opts.cls : ""}">
      <div class="ev-date" aria-hidden="true"><span class="dow">${esc(p.dow)}</span><span class="day">${esc(p.day)}</span><span class="mon">${esc(p.mon)}</span></div>
      <div>
        <h3>${esc(e.name)}</h3>
        <p class="ev-meta">${esc(meta)}</p>
        ${note ? `<p class="ev-note">${esc(note)}</p>` : ""}
        ${e.url ? `<a class="more" href="${esc(e.url)}" target="_blank" rel="${rel}">Details →</a>` : ""}
        ${opts && opts.tools ? opts.tools : ""}
      </div>
      ${e.image ? `<div class="ev-img" style="background-image:url('${esc(e.image)}')" aria-hidden="true"></div>` : ""}
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
      </section>`;
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
    const state = { listing: Object.assign({}, orig), editingDetails: false, evEdits: {}, newEvents: [], seq: 0 };

    pageEl.innerHTML = `
      <div class="intro"><strong>This is your page on Night Out Chicago.</strong>Keep it up to date, and we review changes before they go live.
        <small>Private link for ${esc(m.name)}. It doesn’t expire, so bookmark it and come back anytime. Please don’t share it publicly.</small></div>
      ${heroHtml(m)}
      <section class="head" id="head"></section>
      <form id="ed" novalidate>
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
          <div class="section-head"><h2 id="contact-h">Who’s sending this?</h2></div>
          <div class="card">
            <label class="field"><span>Your name</span><input name="contact_name" autocomplete="name" required maxlength="120" /></label>
            <label class="field"><span>Email <em>(only used if we have a question)</em></span><input name="contact_email" type="email" inputmode="email" autocomplete="email" required maxlength="160" /></label>
            <label class="field"><span>Note to our editors <em>(optional: photos, corrections, anything else)</em></span><textarea name="note" maxlength="1500" rows="3"></textarea></label>
          </div>
        </section>
        <div class="submit-bar">
          <p class="change-count" id="change-count"></p>
          <button type="submit" class="btn flame" id="submit-btn">Submit updates for review</button>
          <p>Nothing goes live until we’ve reviewed it.</p>
          <p class="err" id="err" role="alert" hidden></p>
        </div>
      </form>`;
    wireCarousel(pageEl);
    const form = pageEl.querySelector("#ed");
    const headEl = pageEl.querySelector("#head");
    const detailsBody = pageEl.querySelector("#details-body");
    const toggle = pageEl.querySelector("#details-toggle");
    const evList = pageEl.querySelector("#ev-list");
    const countEl = pageEl.querySelector("#change-count");
    const errEl = pageEl.querySelector("#err");

    function preview() {
      return Object.assign({}, m, state.listing);
    }
    function paintHead() {
      headEl.innerHTML = headHtml(preview());
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

    function evFormHtml(key, e, isNew) {
      const f = (n, label, val, attrs) => `<label class="field"><span>${label}</span><input name="${n}" value="${esc(val || "")}" ${attrs || ""} /></label>`;
      return `<div class="ev-form" data-key="${key}">
        <div class="ev-form-head"><span>${isNew ? "New event" : "Edit event"}</span>
          <button type="button" class="linkish ${isNew ? "danger" : ""}" data-act="${isNew ? "remove" : "close"}">${isNew ? "Remove" : "Done"}</button></div>
        ${f("title", "Event title", e.title, 'maxlength="160" required')}
        <div class="two">
          ${f("date", "Date", e.date, `type="date" required min="${todayKey()}"`)}
          ${f("start_time", "Start time", e.start_time, 'maxlength="40" placeholder="7:30 PM or TBA"')}
        </div>
        ${f("price", "Price", e.price, 'maxlength="60" placeholder="Free, $25, $20–40"')}
        <label class="field"><span>Short description</span><textarea name="description" maxlength="500" rows="2">${esc(e.description || "")}</textarea></label>
        ${f("link", "Link (tickets or details)", e.link, 'type="url" inputmode="url" maxlength="300" placeholder="https://"')}
        ${isNew ? "" : `<label class="check"><input type="checkbox" name="cancelled" ${e.cancelled ? "checked" : ""} /> This event is cancelled</label>`}
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
        const shown = ed ? Object.assign({}, e, { name: ed.data.title, date: ed.data.date, start_time: ed.data.start_time, cost: ed.data.price, notes: ed.data.description, url: safeUrl(ed.data.link) }) : e;
        const tag = ed && ed.data.cancelled ? `<span class="pill">Marked cancelled</span> ` : ed && ed.changed ? `<span class="pill price">Edited</span> ` : "";
        html.push(eventCard(shown, { cls: ed && ed.data.cancelled ? "is-cancel" : "", tools: `<div class="ev-edit-row">${tag}<button type="button" class="linkish" data-act="edit" data-key="${key}">Edit</button></div>` }));
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
    function updateCount() {
      const n = changedFields().length + Object.values(state.evEdits).filter((x) => x.changed).length + state.newEvents.length;
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
        paintEvents();
      }
      updateCount();
    });
    evList.addEventListener("input", (ev) => {
      const box = ev.target.closest(".ev-form");
      if (!box) return;
      const key = box.dataset.key;
      const el = ev.target;
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
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      showErr("");
      const contactName = form.contact_name.value.trim();
      const contactEmail = form.contact_email.value.trim();
      const note = form.note.value.trim();
      if (!contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) {
        showErr("Please add your name and a valid email so we can reach you with questions.");
        (contactName ? form.contact_email : form.contact_name).focus();
        return;
      }
      for (const n of state.newEvents) {
        if (!n.data.title.trim() || !n.data.date) {
          showErr("Each new event needs a title and a date (or remove it).");
          const f = evList.querySelector(`.ev-form[data-key="${n.key}"] input`);
          if (f) f.focus();
          return;
        }
      }
      const urlBad = [state.listing.website, state.listing.booking].concat(state.newEvents.map((n) => n.data.link), Object.values(state.evEdits).map((x) => x.data.link))
        .some((u) => u && u.trim() && !/^https?:\/\/\S+\.\S+/i.test(u.trim()) && !/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(u.trim()));
      if (urlBad) { showErr("One of the links doesn’t look like a web address. Please check it (e.g. https://example.com)."); return; }
      const events = [];
      Object.keys(state.evEdits).forEach((key) => {
        const x = state.evEdits[key];
        if (!x.changed) return;
        const e = m.events[+key.slice(1)];
        events.push(Object.assign({ action: x.data.cancelled ? "cancel" : "update", event_id: e.event_id, original: existingAsForm(e) }, x.data));
      });
      state.newEvents.forEach((n) => events.push(Object.assign({ action: "add" }, n.data)));
      const changed = changedFields();
      if (!changed.length && !events.length && !note) {
        showErr("Nothing has changed yet. Tap Edit on Details, add an event, or leave a note.");
        return;
      }
      const btn = pageEl.querySelector("#submit-btn");
      btn.disabled = true;
      btn.textContent = "Sending…";
      const payload = {
        slug: m.slug,
        k: token,
        contact: { name: contactName, email: contactEmail },
        listing: Object.assign({}, state.listing, { note_to_editors: note, changed_fields: changed }),
        events,
        original: { listing: orig, kind: m.kind, page: location.origin + "/v/" + m.slug },
      };
      fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then((r) => r.json().catch(() => ({})).then((j) => ({ status: r.status, j })))
        .then(({ status, j }) => {
          if (status === 200 && j.ok) return renderThanks(m);
          btn.disabled = false;
          btn.textContent = "Submit updates for review";
          if (status === 403) showErr("This edit link isn’t valid anymore. Please ask us for a fresh link.");
          else if (status === 429) showErr("Lots of updates in the last hour. Please try again a bit later.");
          else showErr(j && j.error ? j.error : "Couldn’t send just now. Check your connection and try again.");
        })
        .catch(() => {
          btn.disabled = false;
          btn.textContent = "Submit updates for review";
          showErr("Couldn’t send just now. Check your connection and try again.");
        });
    });

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
