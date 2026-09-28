(function () {
  const proof = document.getElementById("proof");
  const catRow = document.getElementById("cat-row");
  const hoodRow = document.getElementById("hood-row");
  const timeRow = document.getElementById("time-row");
  const partyRow = document.getElementById("party-row");
  const nightRow = document.getElementById("night-row");
  const nightBlock = document.getElementById("night-block");
  const deckEl = document.getElementById("deck");

  let neighborhoods = [];
  let categories = [];
  let plans = [];
  let restaurants = [];
  let events = [];
  let venueSlugs = {}; // normalized venue/restaurant name -> /v/<slug> (from venues.json)
  let venueIds = {}; // restaurant_id -> true when it has a venue page
  let hoodChoices = [];
  let category = "all";
  let hood = "all";
  let timeBucket = "all";
  let party = "couple";
  let nightKey = null;
  let flexible = false;

  const lanes = {
    eat: { key: "eat", title: "What to eat", pool: [], index: 0, identity: null },
    then: { key: "then", title: "What to do", pool: [], index: 0, identity: null },
    backup: { key: "backup", title: "Backup", pool: [], index: 0, identity: null },
  };

  const PARTY_LABEL = { couple: "Couple", family: "Family", friends: "Friends" };
  const TIME_OPTIONS = [
    { id: "all", label: "All" },
    { id: "early", label: "Early" },
    { id: "dinner", label: "Dinner" },
    { id: "late", label: "Late" },
  ];
  const TIME_LABEL = { early: "Early", dinner: "Dinner", late: "Late" };
  const VIBE_LABEL = {
    all: "All",
    comedy: "Comedy",
    jazz_blues: "Jazz & blues",
    theater: "Theater",
    museum: "Museum",
    magic: "Magic",
    festival: "Festival",
  };

  const VIBE_TAG_MAP = {
    comedy: ["lively", "date_night", "group_friendly"],
    jazz_blues: ["date_night", "classic", "quiet", "pre_theater"],
    theater: ["pre_theater", "classic", "date_night"],
    museum: ["classic", "quiet", "date_night"],
    magic: ["lively", "date_night", "group_friendly"],
    festival: ["lively", "group_friendly", "tapas"],
  };

  const VIBE_EVENT_HINTS = {
    comedy: ["comedy", "improv", "laugh", "stand-up", "standup", "second city", "io"],
    jazz_blues: ["jazz", "blues", "green mill", "swing"],
    theater: ["theater", "theatre", "play", "broadway", "stage"],
    museum: ["museum", "exhibit", "gallery", "art"],
    magic: ["magic", "illusion", "io"],
    festival: ["festival", "fest", "street", "market"],
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Plan/event dates are Chicago calendar days ("YYYY-MM-DD"). Anchor at noon
  // UTC (7am Chicago) and format in America/Chicago so the label never slips a
  // day, whatever zone the visitor's device is in.
  const CHI = "America/Chicago";
  function isoNoon(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  }
  function chicagoTodayKey() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: CHI, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  function nightLabel(iso) {
    if (!iso) return "";
    return isoNoon(iso).toLocaleDateString("en-US", {
      timeZone: CHI,
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  // Date-chip content: small weekday (or "Tonight") + "Sep 30".
  function nightChipHtml(iso) {
    if (!iso) return "";
    const d = isoNoon(iso);
    const dow = iso === chicagoTodayKey() ? "Tonight" : d.toLocaleDateString("en-US", { timeZone: CHI, weekday: "short" });
    const md = d.toLocaleDateString("en-US", { timeZone: CHI, month: "short", day: "numeric" });
    return `<span class="dow">${esc(dow)}</span>${esc(md)}`;
  }

  function normName(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/['\u2019]/g, "'")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  // Venue pages (/v/<slug>): link names only when the slug index knows them.
  function venueKey(s) {
    return String(s || "")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/&/g, " and ").replace(/['\u2019]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  function indexVenues(data) {
    const map = {};
    ((data && data.venues) || []).forEach((v) => {
      if (!v || !v.slug) return;
      [v.name].concat(v.aliases || []).forEach((a) => {
        const k = venueKey(a);
        if (k && !map[k]) map[k] = v.slug;
      });
    });
    return map;
  }
  function venueHref(name, slug) {
    const s = slug || venueSlugs[venueKey(name)];
    return s ? "/v/" + encodeURIComponent(s) : "";
  }
  function venueLinkHtml(name, slug) {
    const href = venueHref(name, slug);
    return href ? `<a class="venue-link" href="${esc(href)}">${esc(name)}</a>` : esc(name);
  }

  function partyFitsRestaurant(r) {
    const raw = String(r.party_fit || "").trim();
    if (!raw) return true;
    const fits = raw
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    if (!fits.length) return true;
    return fits.includes(party);
  }

  function partyFitsEvent(ev) {
    const raw = String(ev.party_fit || "").trim();
    if (!raw) return true;
    const fits = raw
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    if (!fits.length) return true;
    return fits.includes(party);
  }

  function restaurantTagSet(r) {
    const tags = [].concat(r.vibe_tags || [], r.category_focus || []);
    return new Set(tags.map((t) => String(t).toLowerCase()));
  }

  function matchesVibeRestaurant(r) {
    if (category === "all") return true;
    const tags = restaurantTagSet(r);
    const cat = String(category).toLowerCase();
    if (tags.has(cat)) return true;
    const mapped = VIBE_TAG_MAP[category] || VIBE_TAG_MAP[cat] || [];
    return mapped.some((t) => tags.has(t));
  }

  function matchesVibeEvent(ev) {
    if (category === "all") return true;
    if (String(ev.category || "").toLowerCase() === category) return true;
    const hints = VIBE_EVENT_HINTS[category] || [];
    const blob = (
      String(ev.name || "") +
      " " +
      String(ev.notes || "") +
      " " +
      String(ev.venue || "")
    ).toLowerCase();
    return hints.some((h) => blob.includes(h));
  }

  function expandNeighborhoodKeys(raw) {
    const c = String(raw || "").trim().toLowerCase();
    if (!c) return [];
    const aliases = {
      "lincoln park": ["lincoln park"],
      "logan/humboldt": ["logan square", "humboldt park", "logan"],
      "logan square": ["logan square", "logan", "humboldt park"],
      "logan square / hermosa": ["logan square", "hermosa", "logan"],
      "andersonville/uptown": ["uptown", "andersonville"],
      uptown: ["uptown", "andersonville"],
      andersonville: ["andersonville", "uptown"],
      "old town": ["old town"],
      loop: ["loop", "south loop", "museum campus"],
      "museum campus": ["museum campus", "loop", "south loop"],
      "near north": ["near north", "river north", "streeterville", "old town"],
      "river north": ["river north", "near north"],
      streeterville: ["streeterville", "near north"],
      "south loop": ["south loop", "loop"],
      "roscoe village": ["roscoe village", "lakeview"],
      "wicker park": ["wicker park"],
      lakeview: ["lakeview", "wrigleyville", "roscoe village"],
      wrigleyville: ["wrigleyville", "lakeview"],
      pilsen: ["pilsen"],
      "hyde park": ["hyde park"],
    };
    const out = new Set();
    if (aliases[c]) aliases[c].forEach((k) => out.add(k));
    c.split(/[/&,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((p) => {
        out.add(p);
        if (aliases[p]) aliases[p].forEach((k) => out.add(k));
        if (p === "logan" || p === "humboldt") out.add("logan square");
      });
    out.add(c);
    return [...out];
  }

  function hoodImageFor(name) {
    const keys = expandNeighborhoodKeys(name);
    if (!keys.length) return "";
    const hit = neighborhoods.find((n) => {
      const hn = String(n.neighborhood || "").toLowerCase();
      return keys.some((k) => hn === k || hn.includes(k) || k.includes(hn));
    });
    return (hit && hit.image) || "";
  }

  function hoodKeysOverlap(a, b) {
    const A = new Set(expandNeighborhoodKeys(a));
    return expandNeighborhoodKeys(b).some((k) => A.has(k));
  }

  function hoodMatchScore(raw) {
    if (hood === "all") return 2;
    if (!raw) return 0;
    return hoodKeysOverlap(raw, hood) ? 2 : 0;
  }

  function parseMinutes(raw) {
    if (raw == null || raw === "") return null;
    const s = String(raw).trim();
    if (!s) return null;
    const lower = s.toLowerCase();
    if (/daytime|afternoon|brunch|morning|all day|exhibit/.test(lower) && !/\d/.test(s)) {
      return 15 * 60;
    }
    const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mi = parseInt(m[2] || "0", 10);
    const ap = (m[3] || "").toLowerCase().replace(/\./g, "");
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (!ap && h < 7) h += 12;
    return h * 60 + mi;
  }

  function bucketFromMinutes(mins) {
    if (mins == null) return null;
    if (mins < 17 * 60 + 30) return "early";
    if (mins < 20 * 60 + 30) return "dinner";
    return "late";
  }

  function restaurantTimeBuckets(r) {
    const text = String(r.meal_window || "").toLowerCase();
    const buckets = new Set();
    if (!text) {
      buckets.add("dinner");
      return [...buckets];
    }
    if (/breakfast|brunch|lunch|early|cafeteria|daytime|11am|7am/.test(text)) buckets.add("early");
    if (/dinner|tasting|pre-show|4–|4-|5–|5-|~5|~4/.test(text)) buckets.add("dinner");
    if (/late|11pm|–late|-late|after/.test(text)) buckets.add("late");
    (text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi) || []).forEach((chunk) => {
      const b = bucketFromMinutes(parseMinutes(chunk));
      if (b) buckets.add(b);
    });
    if (!buckets.size) buckets.add("dinner");
    return [...buckets];
  }

  function eventTimeBucket(ev) {
    return bucketFromMinutes(parseMinutes(ev.start_time || ev.start || ""));
  }

  function timeMatchScore(bucketsOrOne) {
    if (timeBucket === "all") return 2;
    const list = Array.isArray(bucketsOrOne)
      ? bucketsOrOne
      : bucketsOrOne
        ? [bucketsOrOne]
        : [];
    if (!list.length) return 1;
    if (list.includes(timeBucket)) return 2;
    const order = ["early", "dinner", "late"];
    const idx = order.indexOf(timeBucket);
    if (idx < 0) return 0;
    if (list.some((b) => Math.abs(order.indexOf(b) - idx) === 1)) return 1;
    return 0;
  }

  function primaryTimeLabel(bucketsOrOne) {
    const list = Array.isArray(bucketsOrOne)
      ? bucketsOrOne
      : bucketsOrOne
        ? [bucketsOrOne]
        : [];
    if (!list.length) return "";
    if (timeBucket !== "all" && list.includes(timeBucket)) return TIME_LABEL[timeBucket];
    if (list.includes("dinner")) return TIME_LABEL.dinner;
    return TIME_LABEL[list[0]] || "";
  }

  function vibeLabelForRestaurant(r) {
    if (category !== "all" && matchesVibeRestaurant(r)) return VIBE_LABEL[category] || category;
    const tags = restaurantTagSet(r);
    for (const [id, mapped] of Object.entries(VIBE_TAG_MAP)) {
      if (tags.has(id) || mapped.some((t) => tags.has(t))) return VIBE_LABEL[id] || id;
    }
    const focus = (r.category_focus || [])[0];
    if (focus) return String(focus).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return "";
  }

  function vibeLabelForEvent(ev) {
    const cat = String(ev.category || "").toLowerCase();
    if (cat && VIBE_LABEL[cat]) return VIBE_LABEL[cat];
    if (category !== "all" && matchesVibeEvent(ev)) return VIBE_LABEL[category] || category;
    return cat ? String(cat).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
  }

  function partyChipLabel(raw) {
    const fits = String(raw || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    if (!fits.length) return PARTY_LABEL[party] || "Couple";
    if (fits.includes(party)) return PARTY_LABEL[party];
    return fits
      .map((p) => PARTY_LABEL[p] || p.replace(/\b\w/g, (c) => c.toUpperCase()))
      .join(" · ");
  }

  function isStrictFit(h, t, vibeOk) {
    return (category === "all" || vibeOk) && h >= 2 && t >= 2;
  }

  function isNearFit(h, t, vibeOk) {
    if (isStrictFit(h, t, vibeOk)) return false;
    // Near: vibe still holds (or All), plus near-time and/or near-hood — never party-soft.
    if (category === "all" || vibeOk) {
      if ((h >= 1 || hood === "all") && t >= 1) return true;
      // Broader swipe options when Flexible is on: exact time, other hood (or reverse).
      if (hood !== "all" && h === 0 && t >= 2) return true;
      if (timeBucket !== "all" && t === 0 && h >= 2) return true;
      return false;
    }
    // Soft vibe only when hood + time are exact.
    return h >= 2 && t >= 2;
  }

  function flexMeta(hoodScore, timeScore, vibeOk) {
    if (isStrictFit(hoodScore, timeScore, vibeOk)) return null;
    const flex = [];
    if (hood !== "all" && hoodScore < 2) flex.push("hood");
    if (timeBucket !== "all" && timeScore < 2) flex.push("time");
    if (category !== "all" && !vibeOk) flex.push("vibe");
    return flex.length ? flex : ["broader"];
  }

  function pickByFit(scored) {
    const sorted = scored.slice().sort((a, b) => b.score - a.score);
    const strict = sorted.filter((x) => x.fit === "strict");
    if (!flexible) return strict;
    const near = sorted.filter((x) => x.fit === "near");
    const seen = new Set();
    const out = [];
    strict.concat(near).forEach((x) => {
      const id = x.id || String(out.length);
      if (seen.has(id)) return;
      seen.add(id);
      out.push(x);
    });
    return out;
  }

  function scoreFit(h, t, vibeOk) {
    if (isStrictFit(h, t, vibeOk)) return { fit: "strict", bonus: 100 };
    if (isNearFit(h, t, vibeOk)) return { fit: "near", bonus: 50 };
    return { fit: "out", bonus: 0 };
  }

  function sourceRank(r) {
    if (r.source_id === "corridor_seed") return 0;
    if (r.source_id === "editor_seed") return 1;
    return 2;
  }

  function sortRestaurants(pool) {
    return pool.slice().sort((a, b) => {
      const sr = sourceRank(a) - sourceRank(b);
      if (sr !== 0) return sr;
      const ai = a.image ? 0 : 1;
      const bi = b.image ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function scoreEvent(ev) {
    let score = 0;
    if (nightKey && ev.date === nightKey) score += 10;
    if (category !== "all") {
      if (String(ev.category || "").toLowerCase() === category) score += 6;
      if (matchesVibeEvent(ev)) score += 3;
    }
    if (partyFitsEvent(ev)) score += 2;
    score += hoodMatchScore(ev.neighborhood) * 4;
    score += timeMatchScore(eventTimeBucket(ev)) * 3;
    if (ev.image) score += 1;
    return score;
  }

  // Ask for a sharper source where it's free and safe: bump CDN width params
  // (Unsplash / unsigned imgix) and swap small WordPress resized variants
  // (e.g. -600x400.jpg) for the original upload. Signed URLs are left alone.
  function hiRes(src) {
    let u = String(src || "");
    try {
      const url = new URL(u, location.href);
      const cdn = /(^|\.)images\.unsplash\.com$|\.imgix\.net$/.test(url.hostname);
      if (cdn && !url.searchParams.has("s")) {
        const w = parseInt(url.searchParams.get("w"), 10);
        if (w && w < 1400) {
          const h = parseInt(url.searchParams.get("h"), 10);
          url.searchParams.set("w", "1400");
          if (h) url.searchParams.set("h", String(Math.round((h * 1400) / w)));
        }
      }
      u = url.href;
    } catch (e) {
      return src;
    }
    return u.replace(/(\/wp-content\/uploads\/.+?)-(\d{2,4})x\d{2,4}(\.(?:jpe?g|webp))$/i, (m, base, w, ext) =>
      parseInt(w, 10) < 800 ? base + ext : m
    );
  }

  // background-image layers: sharper source on top, original underneath as a
  // fallback if the upgraded URL fails to load.
  function bgUrl(src) {
    const hi = hiRes(src);
    return hi && hi !== src
      ? `url('${esc(hi)}'), url('${esc(src)}')`
      : `url('${esc(src)}')`;
  }

  function imagesFor(item) {
    const imgs = [];
    const push = (u) => {
      const url = String(u || "").trim();
      if (url && !imgs.includes(url)) imgs.push(url);
    };
    if (!item) return imgs;
    push(item.image);
    if (Array.isArray(item.images)) item.images.forEach(push);
    if (Array.isArray(item.photos)) item.photos.forEach(push);
    if (Array.isArray(item.dishes)) {
      item.dishes.forEach((d) => push(d && d.image));
    }
    // Hood stock only when the item has no photos of its own — otherwise
    // every place in the same neighborhood shares a trailing slide.
    if (!imgs.length) push(hoodImageFor(item.neighborhood));
    return imgs;
  }

  function optionId(item) {
    if (!item) return "";
    return (
      item._id ||
      item.restaurant_id ||
      item.event_id ||
      item.id ||
      normName(item.name) + "|" + normName(item.neighborhood || item.venue || "")
    );
  }

  function asEatOption(r, meta) {
    const times = restaurantTimeBuckets(r);
    return {
      _kind: "eat",
      _id: "eat:" + (r.restaurant_id || normName(r.name)),
      restaurant_id: r.restaurant_id || "",
      name: r.name,
      neighborhood: r.neighborhood || "",
      cuisine: r.cuisine || "",
      price_band: r.price_band || "",
      notes: r.notes || "",
      image: r.image || "",
      images: Array.isArray(r.images) ? r.images.slice() : [],
      photos: Array.isArray(r.photos) ? r.photos.slice() : [],
      url: r.reserve_url || r.official_url || "",
      reserve_url: r.reserve_url || "",
      official_url: r.official_url || "",
      dishes: Array.isArray(r.dishes) ? r.dishes.slice() : [],
      _vibe: vibeLabelForRestaurant(r),
      _time: primaryTimeLabel(times),
      _timeBuckets: times,
      _party: partyChipLabel(r.party_fit),
      _flex: meta || null,
    };
  }

  function asEventOption(ev, meta) {
    const tb = eventTimeBucket(ev);
    return {
      _kind: "then",
      _id: "then:" + (ev.event_id || normName(ev.name) + "|" + (ev.date || "")),
      name: ev.name,
      venue: ev.venue || "",
      neighborhood: ev.neighborhood || "",
      start_time: ev.start_time || "",
      cost: ev.cost || "",
      notes: ev.notes || ev.date_friendly || "",
      image: ev.image || "",
      images: Array.isArray(ev.images) ? ev.images.slice() : [],
      photos: Array.isArray(ev.photos) ? ev.photos.slice() : [],
      url: ev.official_url || "",
      date: ev.date || "",
      date_friendly: ev.date_friendly || "",
      _vibe: vibeLabelForEvent(ev),
      _time: primaryTimeLabel(tb),
      _timeBuckets: tb ? [tb] : [],
      _party: partyChipLabel(ev.party_fit),
      _flex: meta || null,
    };
  }

  function asPlanThenOption(plan, then, meta) {
    const t = then || {};
    const tb = bucketFromMinutes(parseMinutes(t.start || ""));
    return {
      _kind: "then",
      _id: "plan-then:" + (plan.for_night || "") + "|" + normName(t.name),
      name: t.name,
      venue: t.venue || "",
      neighborhood: plan.corridor || "",
      start_time: t.start || "",
      cost: t.cost || "",
      notes: t.why || t.note || "",
      image: t.image || "",
      images: Array.isArray(t.images) ? t.images.slice() : [],
      photos: Array.isArray(t.photos) ? t.photos.slice() : [],
      url: t.url || "",
      date: plan.for_night || "",
      fromPlan: true,
      _vibe: plan.vibe
        ? String(plan.vibe).split(/[;,]|—/)[0].trim().slice(0, 28)
        : "Host pick",
      _time: primaryTimeLabel(tb),
      _timeBuckets: tb ? [tb] : [],
      _party: PARTY_LABEL[party] || "Couple",
      _flex: meta || null,
    };
  }

  function asBackupOption(raw, plan, meta) {
    const b = raw || {};
    const tb = bucketFromMinutes(parseMinutes(b.start || ""));
    return {
      _kind: "backup",
      _id: "backup:" + (plan && plan.for_night ? plan.for_night + "|" : "") + normName(b.name),
      name: b.name,
      neighborhood: (plan && plan.corridor) || b.neighborhood || "",
      notes: b.note || b.why || "If the first plan’s packed — here’s plan B.",
      image: b.image || "",
      images: Array.isArray(b.images) ? b.images.slice() : [],
      photos: Array.isArray(b.photos) ? b.photos.slice() : [],
      dishes: Array.isArray(b.dishes) ? b.dishes.slice() : [],
      url: b.url || "",
      venue: b.venue || "",
      start_time: b.start || "",
      cost: b.cost || "",
      cuisine: b.cuisine || "",
      price_band: b.price_band || "",
      fromPlan: true,
      _vibe: "Backup",
      _time: primaryTimeLabel(tb),
      _timeBuckets: tb ? [tb] : [],
      _party: PARTY_LABEL[party] || "Couple",
      _flex: meta || null,
    };
  }

  function planPartyBlock(plan) {
    const parties = (plan && plan.parties) || {};
    return parties[party] || parties.couple || plan || {};
  }

  function relevantPlans() {
    if (!plans.length) return [];
    if (nightKey) return plans.filter((p) => p.for_night === nightKey);
    const today = chicagoTodayKey();
    const upcoming = plans.filter((p) => p.for_night >= today);
    return upcoming.length ? upcoming : plans.slice(0, 3);
  }

  function buildEatPool() {
    const scored = restaurants
      .filter((r) => (r.status || "active") === "active" && partyFitsRestaurant(r))
      .map((r) => {
        const vibeOk = matchesVibeRestaurant(r);
        const h = hoodMatchScore(r.neighborhood);
        const times = restaurantTimeBuckets(r);
        const t = timeMatchScore(times);
        const { fit, bonus } = scoreFit(h, t, vibeOk);
        let score = bonus;
        if (vibeOk || category === "all") score += 40;
        else score += 5;
        score += h * 30;
        score += t * 25;
        if (r.image) score += 1;
        return {
          r,
          score,
          h,
          t,
          vibeOk,
          fit,
          id: "eat:" + (r.restaurant_id || normName(r.name)),
        };
      })
      .filter((x) => x.fit !== "out");
    const picked = pickByFit(scored);
    const strictRows = picked.filter((x) => x.fit === "strict");
    const nearRows = picked.filter((x) => x.fit === "near");
    const ordered = sortRestaurants(strictRows.map((x) => x.r)).concat(
      sortRestaurants(nearRows.map((x) => x.r))
    );
    return ordered.map((r) => {
      const row = picked.find((p) => p.r === r) || { h: 2, t: 2, vibeOk: true };
      return asEatOption(r, flexMeta(row.h, row.t, row.vibeOk));
    });
  }

  function buildThenPool() {
    const scored = events
      .filter((ev) => {
        if (String(ev.status || "").toLowerCase() === "cancelled") return false;
        if (!partyFitsEvent(ev)) return false;
        if (nightKey && ev.date !== nightKey) return false;
        return true;
      })
      .map((ev) => {
        const vibeOk = matchesVibeEvent(ev);
        const h = hoodMatchScore(ev.neighborhood);
        const tb = eventTimeBucket(ev);
        const t = timeMatchScore(tb);
        const { fit, bonus } = scoreFit(h, t, vibeOk);
        let score = scoreEvent(ev) + bonus;
        if (!vibeOk && category !== "all") score -= 15;
        return {
          ev,
          score,
          h,
          t,
          vibeOk,
          fit,
          id: "then:" + (ev.event_id || normName(ev.name) + "|" + (ev.date || "")),
        };
      })
      .filter((x) => x.fit !== "out");

    let picked = pickByFit(scored);

    const out = picked
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((x) => asEventOption(x.ev, flexMeta(x.h, x.t, x.vibeOk)));

    // Plan-curated "then": strict always eligible; near only when Flexible is on.
    {
      const have = new Set(out.map(optionId));
      relevantPlans().forEach((plan) => {
        const block = planPartyBlock(plan);
        const then = (block && block.then) || plan.then;
        if (!then || !then.name) return;
        const h = hoodMatchScore(plan.corridor);
        const tb = bucketFromMinutes(parseMinutes(then.start || ""));
        const t = timeMatchScore(tb);
        const vibeOk = true;
        const strict = isStrictFit(h, t, vibeOk);
        const near = isNearFit(h, t, vibeOk);
        if (!strict && !(flexible && near)) return;
        const opt = asPlanThenOption(plan, then, flexMeta(h, t, vibeOk));
        const id = optionId(opt);
        if (have.has(id)) return;
        have.add(id);
        if (strict) out.unshift(opt);
        else out.push(opt);
      });
    }
    return out;
  }

  function buildBackupPool(eatPool, thenPool) {
    const out = [];
    const seen = new Set();
    const eatIds = new Set(eatPool.slice(0, 1).map(optionId));
    const thenIds = new Set(thenPool.slice(0, 1).map(optionId));

    const push = (item) => {
      if (!item || !item.name) return;
      const id = optionId(item);
      if (seen.has(id) || eatIds.has(id) || thenIds.has(id)) return;
      seen.add(id);
      out.push(item);
    };

    relevantPlans().forEach((plan) => {
      const block = planPartyBlock(plan);
      const backup = (block && block.backup) || plan.backup;
      if (!backup || !backup.name) return;
      const h = hoodMatchScore(plan.corridor || backup.neighborhood);
      const t = timeMatchScore(bucketFromMinutes(parseMinutes(backup.start || "")));
      const vibeOk = true;
      const strict = isStrictFit(h, t, vibeOk);
      const near = isNearFit(h, t, vibeOk);
      if (strict || (flexible && near)) {
        push(asBackupOption(backup, plan, flexMeta(h, t, vibeOk)));
      }
    });

    // Alternate dinners further down the eat list
    eatPool.slice(1).forEach((item) => {
      push(
        Object.assign({}, item, {
          _kind: "backup",
          _id: "backup-eat:" + optionId(item),
          notes: item.notes || "Solid backup table if the first spot’s slammed.",
        })
      );
    });

    // Alternate things to do
    thenPool.slice(1).forEach((item) => {
      push(
        Object.assign({}, item, {
          _kind: "backup",
          _id: "backup-then:" + optionId(item),
          notes: item.notes || "Another solid plan if tickets are gone.",
        })
      );
    });

    if (!out.length && eatPool.length) {
      push(
        Object.assign({}, eatPool[0], {
          _kind: "backup",
          _id: "backup-fallback:" + optionId(eatPool[0]),
          notes: "Keep this one warm — Chicago fills up fast.",
        })
      );
    }

    return out;
  }

  function rebuildPools() {
    const eatPool = buildEatPool();
    const thenPool = buildThenPool();
    const backupPool = buildBackupPool(eatPool, thenPool);

    function applyPool(lane, pool) {
      const prevId = lane.identity;
      lane.pool = pool;
      let idx = 0;
      if (prevId) {
        const found = pool.findIndex((item) => optionId(item) === prevId);
        idx = found >= 0 ? found : 0;
      }
      lane.index = pool.length ? Math.min(idx, pool.length - 1) : 0;
      lane.identity = pool.length ? optionId(pool[lane.index]) : null;
    }

    applyPool(lanes.eat, eatPool);
    applyPool(lanes.then, thenPool);
    applyPool(lanes.backup, backupPool);
  }

  function bgHtml(item, letter) {
    const imgs = imagesFor(item);
    const mark = esc((letter || (item && item.name) || "?").charAt(0).toUpperCase());
    if (!imgs.length) {
      return `<div class="bg-stack"><div class="bg-fallback"><span class="lettermark" aria-hidden="true">${mark}</span></div></div>`;
    }
    if (imgs.length === 1) {
      return `<div class="bg-stack"><div class="bg-slide ken-burns is-active" style="background-image:${bgUrl(imgs[0])}"></div></div>`;
    }
    return `<div class="bg-stack" data-carousel="1">${imgs
      .map(
        (src, i) =>
          `<div class="bg-slide${i === 0 ? " is-active" : ""}" style="background-image:${bgUrl(src)}"></div>`
      )
      .join("")}</div>
      <div class="photo-ticks" aria-hidden="true">${imgs
        .map((_, i) => `<span class="${i === 0 ? "is-on" : ""}"></span>`)
        .join("")}</div>`;
  }

  function chipClass(kind, isMatch, isFlex) {
    const bits = ["pill", kind];
    if (isMatch) bits.push("is-match");
    else if (isFlex) bits.push("is-flex");
    return bits.join(" ");
  }

  function renderFlexCue(item) {
    if (!flexible || !item || !item._flex || !item._flex.length) return "";
    return `<span class="flex-cue" title="Near match — filters stay put">Flexible pick</span>`;
  }

  function renderChips(item) {
    if (!item) return "";
    const flex = item._flex || [];
    const chips = [];

    const hoodName = item.neighborhood || "";
    if (hoodName) {
      const match = hood !== "all" && hoodMatchScore(hoodName) >= 2;
      chips.push(
        `<span class="${chipClass("hood", match, flex.includes("hood"))}" title="Neighborhood">${esc(hoodName)}</span>`
      );
    }

    let timeName = item._time || "";
    if (!timeName && item.start_time) {
      timeName = TIME_LABEL[bucketFromMinutes(parseMinutes(item.start_time))] || "";
    }
    if (timeName) {
      const match = timeBucket !== "all" && (item._timeBuckets || []).includes(timeBucket);
      chips.push(
        `<span class="${chipClass("time", match, flex.includes("time"))}" title="Time of night">${esc(timeName)}</span>`
      );
    }

    const vibeName = item._vibe || "";
    if (vibeName) {
      const soft = flex.includes("vibe");
      const match = category !== "all" && !soft;
      chips.push(
        `<span class="${chipClass("vibe", match, soft)}" title="Vibe">${esc(vibeName)}</span>`
      );
    }

    const partyName = item._party || PARTY_LABEL[party];
    if (partyName) {
      chips.push(
        `<span class="${chipClass("party", true, false)}" title="Who it’s for">${esc(partyName)}</span>`
      );
    }

    if (!chips.length) return "";
    return `<div class="pills" aria-label="Who this option is for">${chips.join("")}</div>`;
  }

  function renderEatCopy(item) {
    if (!item) {
      return `
        <div class="copy">
          <h3 class="option-title">No dinners in that mix</h3>
          <p class="lede">${flexible ? "Nothing nearby enough — flip a filter." : "Flip a filter, or turn on Flexible for near matches."}</p>
        </div>`;
    }
    const cuisineLine = [item.cuisine, item.price_band].filter(Boolean).join(" · ");
    const why = item.notes || "Start hungry — good table energy.";
    const link = item.reserve_url || item.url || item.official_url || "";
    const titleHref = venueHref(item.name, venueIds[item.restaurant_id] ? item.restaurant_id : "");
    return `
      <div class="copy">
        <p class="eyebrow">${esc(item.neighborhood || "Chicago")}</p>
        ${renderFlexCue(item)}
        ${renderChips(item)}
        ${cuisineLine ? `<p class="meta">${esc(cuisineLine)}</p>` : ""}
        <h3 class="option-title">${
          titleHref ? `<a class="title-link" href="${esc(titleHref)}">${esc(item.name)}</a>` : esc(item.name)
        }</h3>
        <p class="note">${esc(why)}</p>
        <div class="actions">
          ${link ? `<a class="btn flame" href="${esc(link)}" target="_blank" rel="noopener">Reserve</a>` : ""}
          ${
            item.official_url && item.official_url !== link
              ? `<a class="btn ghost" href="${esc(item.official_url)}" target="_blank" rel="noopener">Official site</a>`
              : ""
          }
        </div>
      </div>`;
  }

  function renderThenCopy(item) {
    if (!item) {
      return `
        <div class="copy">
          <h3 class="option-title">Nothing locked for that night</h3>
          <p class="lede">${flexible ? "Nothing nearby enough — try another night or time." : "Try another night or time — or turn on Flexible for near matches."}</p>
        </div>`;
    }
    const when = item.date ? nightLabel(item.date) : "";
    const meta = [item.start_time, item.cost]
      .filter(Boolean)
      .map(esc)
      .concat(item.venue ? [venueLinkHtml(item.venue)] : [])
      .join(" · ");
    const why = item.notes || "Then laugh, listen, or wander.";
    return `
      <div class="copy">
        <p class="eyebrow">${esc([item.neighborhood, when].filter(Boolean).join(" · ") || "Out tonight")}</p>
        ${renderFlexCue(item)}
        ${renderChips(item)}
        <h3 class="option-title">${esc(item.name)}</h3>
        ${meta ? `<p class="meta">${meta}</p>` : ""}
        <p class="note">${esc(why)}</p>
        <div class="actions">
          ${
            item.url
              ? `<a class="btn flame" href="${esc(item.url)}" target="_blank" rel="noopener">Tickets / Details</a>`
              : ""
          }
        </div>
      </div>`;
  }

  function renderBackupCopy(item) {
    if (!item) {
      return `
        <div class="copy">
          <h3 class="option-title">You’re covered</h3>
          <p class="lede">${flexible ? "Widen the filters — we’ll find a plan B." : "Widen the filters, or turn on Flexible for near matches."}</p>
        </div>`;
    }
    const metaBits = [item.start_time, item.cost, item.cuisine, item.price_band]
      .filter(Boolean)
      .join(" · ");
    const why = item.notes || "If the first plan’s packed — here’s plan B.";
    return `
      <div class="copy">
        <p class="eyebrow">Plan B</p>
        ${renderFlexCue(item)}
        ${renderChips(item)}
        <h3 class="option-title">${esc(item.name)}</h3>
        ${metaBits ? `<p class="meta">${esc(metaBits)}</p>` : ""}
        ${item.venue ? `<p class="meta">${venueLinkHtml(item.venue)}</p>` : ""}
        <p class="note">${esc(why)}</p>
        <div class="actions">
          ${
            item.url
              ? `<a class="btn" href="${esc(item.url)}" target="_blank" rel="noopener">Details</a>`
              : ""
          }
        </div>
      </div>`;
  }

  function renderOptionPanel(laneKey, item) {
    const letter = (item && (item.cuisine || item.name)) || laneKey;
    let copy = "";
    if (laneKey === "eat") copy = renderEatCopy(item);
    else if (laneKey === "then") copy = renderThenCopy(item);
    else copy = renderBackupCopy(item);
    return `
      <div class="option-panel" data-option-id="${esc(optionId(item))}">
        ${bgHtml(item, letter)}
        <div class="shade"></div>
        ${copy}
      </div>`;
  }

  /* ---------- Peek carousel lanes (native scroll-snap) ---------- */

  const laneUi = {};
  const HYDRATE_RADIUS = 2;
  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CHEV_L = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const CHEV_R = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function pagerHtml(n) {
    if (n < 2) return `<span class="option-pager"></span>`;
    if (n <= 10) {
      return `<span class="option-pager option-dots" aria-hidden="true">${Array.from(
        { length: n },
        () => "<span></span>"
      ).join("")}</span>`;
    }
    return `<span class="option-pager option-progress" aria-hidden="true"><span></span></span>`;
  }

  function sizeLanes() {
    const h = deckEl.clientHeight;
    if (!h) return;
    deckEl.querySelectorAll(".lane").forEach((c) => {
      c.style.height = h + "px";
      c.style.minHeight = h + "px";
    });
  }

  function stopPhotoTimers() {
    Object.values(laneUi).forEach((ui) => {
      if (ui && ui.timer) clearInterval(ui.timer);
      if (ui) ui.timer = null;
    });
  }

  function renderDeck() {
    stopPhotoTimers();
    const order = ["eat", "then", "backup"];
    deckEl.innerHTML = order
      .map((key, i) => {
        const lane = lanes[key];
        const n = lane.pool.length;
        const count = Math.max(n, 1);
        const cards = Array.from(
          { length: count },
          (_, j) =>
            `<article class="opt-card" data-i="${j}" role="group" aria-roledescription="option" aria-label="${
              n ? `${j + 1} of ${n}` : "No options"
            }"></article>`
        ).join("");
        const nav =
          n > 1
            ? `<button type="button" class="lane-nav prev" data-dir="-1" aria-label="Previous option">${CHEV_L}</button>
               <button type="button" class="lane-nav next" data-dir="1" aria-label="Next option">${CHEV_R}</button>`
            : "";
        return `
        <section class="lane${n ? "" : " empty-lane"}${n === 1 ? " is-single" : ""}" data-lane="${key}" aria-label="${esc(lane.title)}">
          <header class="lane-head">
            <h2 class="lane-heading">${esc(lane.title)}</h2>
            <span class="option-count" aria-live="polite">${n ? `${lane.index + 1} / ${n}` : ""}</span>
          </header>
          <div class="lane-viewport">
            <div class="option-track" data-track="${key}" role="region" aria-roledescription="carousel" aria-label="${esc(lane.title)} options">${cards}</div>
            ${nav}
          </div>
          <div class="lane-foot">
            <span></span>
            ${pagerHtml(n)}
            ${i === 0 ? `<span class="swipe-hint">Swipe up for what to do</span>` : "<span></span>"}
          </div>
        </section>`;
      })
      .join("");

    sizeLanes();
    order.forEach(setupLane);
  }

  function laneStride(ui) {
    const c = ui.cards;
    if (c.length > 1) return c[1].offsetLeft - c[0].offsetLeft || 1;
    return (c[0] && c[0].offsetWidth) || 1;
  }

  function nearestIndex(ui) {
    const i = Math.round(ui.track.scrollLeft / laneStride(ui));
    return Math.max(0, Math.min(ui.cards.length - 1, i));
  }

  function hydrate(key, j) {
    const ui = laneUi[key];
    const card = ui && ui.cards[j];
    if (!card || card.dataset.h) return;
    card.innerHTML = renderOptionPanel(key, lanes[key].pool[j] || null);
    card.dataset.h = "1";
  }

  function hydrateAround(key, idx) {
    for (let j = idx - HYDRATE_RADIUS; j <= idx + HYDRATE_RADIUS; j++) hydrate(key, j);
  }

  function markActive(key, idx, force) {
    const ui = laneUi[key];
    const lane = lanes[key];
    if (!ui || (!force && idx === ui.active)) return;
    ui.active = idx;
    if (lane.pool.length) {
      lane.index = idx;
      lane.identity = optionId(lane.pool[idx]);
    }
    hydrateAround(key, idx);
    ui.cards.forEach((c, j) => {
      c.classList.toggle("is-active", j === idx);
      c.classList.toggle("is-before", j < idx);
      c.classList.toggle("is-after", j > idx);
    });
    const n = lane.pool.length;
    const count = ui.laneEl.querySelector(".option-count");
    if (count) count.textContent = n ? `${idx + 1} / ${n}` : "";
    const dots = ui.laneEl.querySelectorAll(".option-dots > span");
    dots.forEach((d, j) => d.classList.toggle("is-on", j === idx));
    const bar = ui.laneEl.querySelector(".option-progress > span");
    if (bar && n > 1) {
      const w = Math.max(12, 100 / n);
      bar.style.width = w + "%";
      bar.style.left = (idx / (n - 1)) * (100 - w) + "%";
    }
    ui.laneEl.querySelectorAll(".lane-nav").forEach((b) => {
      const dir = Number(b.dataset.dir);
      b.disabled = dir < 0 ? idx <= 0 : idx >= ui.cards.length - 1;
    });
    activatePhotos(key);
  }

  function goTo(key, j, instant) {
    const ui = laneUi[key];
    if (!ui) return;
    const target = Math.max(0, Math.min(ui.cards.length - 1, j));
    hydrateAround(key, target);
    const left = target * laneStride(ui);
    if (instant) {
      ui.track.scrollLeft = left;
      markActive(key, target, true);
    } else {
      ui.track.scrollTo({ left, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }

  function stepPhoto(card, dir) {
    const slides = [...card.querySelectorAll(".bg-slide")];
    if (slides.length < 2) return false;
    let i = Number(card.dataset.p || 0);
    slides[i].classList.remove("is-active");
    i = (i + dir + slides.length) % slides.length;
    slides[i].classList.add("is-active");
    card.dataset.p = String(i);
    card.querySelectorAll(".photo-ticks > span").forEach((t, k) => t.classList.toggle("is-on", k === i));
    return true;
  }

  function activatePhotos(key) {
    const ui = laneUi[key];
    if (!ui) return;
    if (ui.timer) clearInterval(ui.timer);
    ui.timer = null;
    const card = ui.cards[ui.active];
    if (!card || reduceMotion || !card.querySelector(".bg-stack[data-carousel]")) return;
    ui.timer = setInterval(() => stepPhoto(card, 1), 4200);
  }

  function setupLane(key) {
    const laneEl = deckEl.querySelector(`[data-lane="${key}"]`);
    if (!laneEl) return;
    const track = laneEl.querySelector(".option-track");
    const ui = {
      laneEl,
      track,
      cards: [...track.querySelectorAll(".opt-card")],
      active: -1,
      timer: null,
      raf: 0,
      drag: null,
      suppressClick: false,
    };
    laneUi[key] = ui;
    goTo(key, lanes[key].index || 0, true);

    track.addEventListener(
      "scroll",
      () => {
        if (ui.raf) return;
        ui.raf = requestAnimationFrame(() => {
          ui.raf = 0;
          markActive(key, nearestIndex(ui));
        });
      },
      { passive: true }
    );

    // Tap a peeking card → center it. Tap the active card's photo → next photo.
    track.addEventListener(
      "click",
      (e) => {
        if (ui.suppressClick) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const card = e.target.closest(".opt-card");
        if (!card) return;
        const j = Number(card.dataset.i);
        if (j !== ui.active) {
          e.preventDefault();
          e.stopPropagation();
          goTo(key, j);
          return;
        }
        if (e.target.closest("a,button")) return;
        if (stepPhoto(card, 1)) activatePhotos(key);
      },
      true
    );

    // Desktop: click-and-drag the lane like a touch swipe (touch/trackpad stay native).
    track.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if (e.target.closest("a,button")) return;
      ui.drag = { x: e.clientX, left: track.scrollLeft, start: ui.active, moved: false, id: e.pointerId };
    });
    track.addEventListener("pointermove", (e) => {
      const d = ui.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      if (!d.moved) {
        if (Math.abs(dx) < 6) return;
        d.moved = true;
        try {
          track.setPointerCapture(e.pointerId);
        } catch (_) {}
        track.classList.add("is-dragging");
      }
      track.scrollLeft = d.left - dx;
    });
    const endDrag = (e) => {
      const d = ui.drag;
      if (!d || e.pointerId !== d.id) return;
      ui.drag = null;
      if (!d.moved) return;
      const dx = e.clientX - d.x;
      let target = nearestIndex(ui);
      if (Math.abs(dx) > 40 && target === d.start) target = d.start + (dx < 0 ? 1 : -1);
      ui.suppressClick = true;
      setTimeout(() => (ui.suppressClick = false), 60);
      goTo(key, target);
      setTimeout(() => track.classList.remove("is-dragging"), reduceMotion ? 0 : 480);
    };
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
    track.addEventListener("dragstart", (e) => e.preventDefault());

    laneEl.querySelectorAll(".lane-nav").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        goTo(key, ui.active + (Number(btn.dataset.dir) || 1));
      });
    });
  }

  function shiftLane(key, dir) {
    const ui = laneUi[key];
    if (!ui || ui.cards.length < 2) return;
    goTo(key, ui.active + dir);
  }


  function collectHoodChoices() {
    const set = new Set();
    restaurants.forEach((r) => {
      const n = String(r.neighborhood || "").trim();
      if (n) set.add(n);
    });
    events.forEach((ev) => {
      const n = String(ev.neighborhood || "").trim();
      if (n && !/^various$/i.test(n)) set.add(n);
    });
    plans.forEach((p) => {
      const n = String(p.corridor || "").trim();
      if (n) set.add(n);
    });
    const canon = (neighborhoods || []).map((n) => n.neighborhood).filter(Boolean);
    const ordered = [];
    const used = new Set();
    canon.forEach((c) => {
      const hit = [...set].find(
        (s) => hoodKeysOverlap(s, c) || s.toLowerCase() === c.toLowerCase()
      );
      if (hit && !used.has(hit.toLowerCase())) {
        ordered.push(hit);
        used.add(hit.toLowerCase());
      } else if (!used.has(c.toLowerCase()) && set.has(c)) {
        ordered.push(c);
        used.add(c.toLowerCase());
      }
    });
    [...set]
      .sort((a, b) => a.localeCompare(b))
      .forEach((s) => {
        if (!used.has(s.toLowerCase())) {
          ordered.push(s);
          used.add(s.toLowerCase());
        }
      });
    return ordered;
  }

  /* ---------- Scrollable filter rows (one line, edge fades) ---------- */

  function updateRowFades(row) {
    const max = row.scrollWidth - row.clientWidth;
    row.classList.toggle("fade-l", row.scrollLeft > 4);
    row.classList.toggle("fade-r", max > 4 && row.scrollLeft < max - 4);
  }

  function centerSelected(row, smooth) {
    const sel = row.querySelector('[aria-selected="true"]');
    if (!sel) return updateRowFades(row);
    const max = row.scrollWidth - row.clientWidth;
    const left = Math.max(0, Math.min(max, sel.offsetLeft - (row.clientWidth - sel.offsetWidth) / 2));
    row.scrollTo({ left, behavior: smooth && !reduceMotion ? "smooth" : "auto" });
    updateRowFades(row);
  }

  function paintRow(row, html) {
    const keep = row.scrollLeft;
    const hadFocus = row.contains(document.activeElement)
      ? document.activeElement.getAttribute("data-key")
      : null;
    row.innerHTML = html;
    row.scrollLeft = keep;
    if (hadFocus != null) {
      const again = row.querySelector(`[data-key="${CSS.escape(hadFocus)}"]`);
      if (again) again.focus({ preventScroll: true });
    }
    centerSelected(row, row.dataset.ready === "1");
    row.dataset.ready = "1";
  }

  function chip(attr, value, label, selected, html) {
    return `<button type="button" role="tab" data-${attr}="${esc(value)}" data-key="${esc(value)}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}">${html || esc(label)}</button>`;
  }

  function renderHoods() {
    paintRow(
      hoodRow,
      [chip("hood", "all", "All areas", hood === "all")]
        .concat(hoodChoices.map((h) => chip("hood", h, h, h === hood)))
        .join("")
    );
  }

  function renderTimes() {
    paintRow(timeRow, TIME_OPTIONS.map((t) => chip("time", t.id, t.id === "all" ? "Any time" : t.label, t.id === timeBucket)).join(""));
  }

  function renderCats() {
    paintRow(catRow, categories.map((c) => chip("cat", c.id, c.id === "all" ? "All vibes" : c.label, c.id === category)).join(""));
  }

  function renderParty() {
    [...partyRow.querySelectorAll("button")].forEach((btn) => {
      const on = btn.dataset.party === party;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.setAttribute("tabindex", on ? "0" : "-1");
    });
    centerSelected(partyRow, true);
  }

  function renderNights() {
    if (!plans.length) {
      nightBlock.hidden = true;
      return;
    }
    nightBlock.hidden = false;
    paintRow(
      nightRow,
      [chip("night", "", "Any night", !nightKey)]
        .concat(plans.map((p) => chip("night", p.for_night, "", p.for_night === nightKey, nightChipHtml(p.for_night))))
        .join("")
    );
  }

  document.querySelectorAll(".pill-row.scroll").forEach((row) => {
    row.addEventListener("scroll", () => updateRowFades(row), { passive: true });
    // Arrow keys move between chips; Enter/Space selects (native button).
    row.addEventListener("keydown", (e) => {
      const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
      if (!keys.includes(e.key)) return;
      const btns = [...row.querySelectorAll("button")];
      const at = btns.indexOf(document.activeElement);
      if (at < 0) return;
      e.preventDefault();
      e.stopPropagation();
      let next = at;
      if (e.key === "ArrowLeft") next = Math.max(0, at - 1);
      if (e.key === "ArrowRight") next = Math.min(btns.length - 1, at + 1);
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = btns.length - 1;
      btns.forEach((b, k) => b.setAttribute("tabindex", k === next ? "0" : "-1"));
      btns[next].focus();
    });
  });

  function updateProof() {
    const rCount = restaurants.filter((r) => (r.status || "active") === "active").length;
    const eCount = events.filter((ev) => String(ev.status || "").toLowerCase() !== "cancelled").length;
    proof.textContent = `${rCount} dinners · ${eCount} things to do`;
  }

  function refreshFromFilters() {
    rebuildPools();
    renderDeck();
  }

  catRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    category = btn.dataset.cat;
    renderCats();
    refreshFromFilters();
  });

  hoodRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-hood]");
    if (!btn) return;
    hood = btn.dataset.hood || "all";
    renderHoods();
    refreshFromFilters();
  });

  timeRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-time]");
    if (!btn) return;
    timeBucket = btn.dataset.time || "all";
    renderTimes();
    refreshFromFilters();
  });

  partyRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-party]");
    if (!btn) return;
    party = btn.dataset.party;
    renderParty();
    refreshFromFilters();
  });

  nightRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-night]");
    if (!btn) return;
    nightKey = btn.dataset.night || null;
    renderNights();
    refreshFromFilters();
  });

  const flexToggle = document.getElementById("flex-toggle");
  function renderFlexible() {
    if (!flexToggle) return;
    flexToggle.setAttribute("aria-checked", flexible ? "true" : "false");
    const state = flexToggle.querySelector(".flex-state");
    if (state) state.textContent = flexible ? "On" : "Off";
  }
  if (flexToggle) {
    flexToggle.addEventListener("click", () => {
      flexible = !flexible;
      renderFlexible();
      refreshFromFilters();
    });
  }

  window.addEventListener("resize", () => {
    sizeLanes();
    Object.keys(laneUi).forEach((k) => laneUi[k] && goTo(k, laneUi[k].active, true));
    document.querySelectorAll(".pill-row.scroll").forEach(updateRowFades);
  });

  deckEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.target.closest && e.target.closest(".pill-row")) return;
    // Prefer the lane closest to scroll center
    const cards = [...deckEl.querySelectorAll(".lane")];
    const mid = deckEl.scrollTop + deckEl.clientHeight / 2;
    let best = cards[0];
    let bestDist = Infinity;
    cards.forEach((c) => {
      const center = c.offsetTop + c.offsetHeight / 2;
      const d = Math.abs(center - mid);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    });
    if (!best) return;
    e.preventDefault();
    shiftLane(best.dataset.lane, e.key === "ArrowRight" ? 1 : -1);
  });

  Promise.all([
    fetch("neighborhoods.json").then((r) => r.json()),
    fetch("plans.json").then((r) => r.json()),
    fetch("restaurants.json").then((r) => r.json()),
    fetch("events.json").then((r) => r.json()),
    // Optional: venue slug index for /v/<slug> links. Never blocks the planner if missing.
    fetch("venues.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ])
    .then(([hoods, planData, restData, eventData, venueData]) => {
      try {
        venueSlugs = indexVenues(venueData);
        ((venueData && venueData.venues) || []).forEach((v) => {
          if (v && v.restaurant_id) venueIds[v.restaurant_id] = true;
        });
      } catch (e) {
        venueSlugs = {};
        venueIds = {};
      }
      neighborhoods = hoods.neighborhoods || [];
      categories = hoods.categories || [];
      plans = Array.isArray(planData) ? planData : planData.plans || [];
      restaurants = Array.isArray(restData) ? restData : restData.restaurants || [];
      events = Array.isArray(eventData) ? eventData : eventData.events || [];
      hoodChoices = collectHoodChoices();
      nightKey = null;
      updateProof();
      renderCats();
      renderHoods();
      renderTimes();
      renderParty();
      renderNights();
      renderFlexible();
      rebuildPools();
      renderDeck();
    })
    .catch((err) => {
      console.error(err);
      proof.textContent = "Couldn’t load tonight";
      deckEl.innerHTML = `
        <section class="lane empty-lane">
          <header class="lane-head"><h2 class="lane-heading">Night Out</h2></header>
          <div class="lane-viewport"><div class="option-track"><article class="opt-card is-active">
            <div class="option-panel">
              <div class="bg-stack"><div class="bg-fallback"><span class="lettermark">!</span></div></div>
              <div class="shade"></div>
              <div class="copy">
                <h3 class="option-title">Couldn’t load Chicago</h3>
                <p class="lede">Give it a refresh — we’ll be right here.</p>
              </div>
            </div>
          </article></div></div>
        </section>`;
      sizeLanes();
    });
})();
