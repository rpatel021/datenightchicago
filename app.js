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

  const photoTimers = new WeakMap();
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

  function nightLabel(iso) {
    if (!iso) return "";
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function shortNight(iso) {
    if (!iso) return "";
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
  }

  function normName(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/['\u2019]/g, "'")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
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
    const today = new Date().toISOString().slice(0, 10);
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
      return `<div class="bg-stack"><div class="bg-slide ken-burns is-active" style="background-image:url('${esc(imgs[0])}')"></div></div>`;
    }
    return `<div class="bg-stack" data-carousel="1">${imgs
      .map(
        (src, i) =>
          `<div class="bg-slide${i === 0 ? " is-active" : ""}" style="background-image:url('${esc(src)}')"></div>`
      )
      .join("")}</div>`;
  }

  function startCarousels(root) {
    root.querySelectorAll(".bg-stack[data-carousel]").forEach((stack) => {
      const slides = [...stack.querySelectorAll(".bg-slide")];
      if (slides.length < 2) return;
      if (photoTimers.has(stack)) {
        clearInterval(photoTimers.get(stack));
      }
      let i = 0;
      const timer = setInterval(() => {
        slides[i].classList.remove("is-active");
        i = (i + 1) % slides.length;
        slides[i].classList.add("is-active");
      }, 4200);
      photoTimers.set(stack, timer);
    });
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
    return `
      <div class="copy">
        <p class="eyebrow">${esc(item.neighborhood || "Chicago")}</p>
        ${renderFlexCue(item)}
        ${renderChips(item)}
        ${cuisineLine ? `<p class="meta">${esc(cuisineLine)}</p>` : ""}
        <h3 class="option-title">${esc(item.name)}</h3>
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
    const meta = [item.start_time, item.cost, item.venue].filter(Boolean).join(" · ");
    const why = item.notes || "Then laugh, listen, or wander.";
    return `
      <div class="copy">
        <p class="eyebrow">${esc([item.neighborhood, when].filter(Boolean).join(" · ") || "Out tonight")}</p>
        ${renderFlexCue(item)}
        ${renderChips(item)}
        <h3 class="option-title">${esc(item.name)}</h3>
        ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
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
        ${item.venue ? `<p class="meta">${esc(item.venue)}</p>` : ""}
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

  function chromeHtml(lane) {
    const n = lane.pool.length;
    const idx = n ? lane.index + 1 : 0;
    const dots =
      n > 1 && n <= 10
        ? `<div class="option-dots" aria-hidden="true">${lane.pool
            .map((_, i) => `<span class="${i === lane.index ? "is-on" : ""}"></span>`)
            .join("")}</div>`
        : `<div class="option-dots"></div>`;
    return `
      <div class="lane-chrome">
        <button type="button" class="nav-hit" data-dir="-1" aria-label="Previous option" ${n < 2 ? "disabled" : ""}>‹</button>
        ${dots}
        <span class="option-count">${n ? `${idx} / ${n}` : "0 / 0"}</span>
        <button type="button" class="nav-hit" data-dir="1" aria-label="Next option" ${n < 2 ? "disabled" : ""}>›</button>
      </div>`;
  }

  function sizeLanes() {
    const h = deckEl.clientHeight;
    if (!h) return;
    deckEl.querySelectorAll(".lane").forEach((c) => {
      c.style.height = h + "px";
      c.style.minHeight = h + "px";
    });
  }

  function renderDeck() {
    const order = ["eat", "then", "backup"];
    deckEl.innerHTML = order
      .map((key, i) => {
        const lane = lanes[key];
        const item = lane.pool[lane.index] || null;
        const empty = !item;
        return `
        <section class="lane${empty ? " empty-lane" : ""}" data-lane="${key}">
          <h2 class="lane-heading">${esc(lane.title)}</h2>
          <div class="option-stage" data-stage="${key}">
            ${renderOptionPanel(key, item)}
          </div>
          ${chromeHtml(lane)}
          ${i === 0 ? `<div class="swipe-hint">Swipe up · swipe sideways for more</div>` : ""}
        </section>`;
      })
      .join("");

    sizeLanes();
    startCarousels(deckEl);
    wireLaneGestures();
  }

  function wireLaneGestures() {
    deckEl.querySelectorAll(".lane").forEach((laneEl) => {
      const key = laneEl.dataset.lane;
      let startX = 0;
      let startY = 0;
      let tracking = false;

      laneEl.addEventListener(
        "pointerdown",
        (e) => {
          if (e.target.closest("a,button")) return;
          tracking = true;
          startX = e.clientX;
          startY = e.clientY;
        },
        { passive: true }
      );

      laneEl.addEventListener(
        "pointerup",
        (e) => {
          if (!tracking) return;
          tracking = false;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          if (Math.abs(dx) < 48) return;
          if (Math.abs(dx) < Math.abs(dy) * 1.15) return;
          shiftLane(key, dx < 0 ? 1 : -1);
        },
        { passive: true }
      );

      laneEl.addEventListener("pointercancel", () => {
        tracking = false;
      });

      laneEl.querySelectorAll(".nav-hit").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const dir = Number(btn.dataset.dir) || 1;
          shiftLane(key, dir);
        });
      });
    });
  }

  function shiftLane(key, dir) {
    const lane = lanes[key];
    if (!lane || lane.pool.length < 2) return;
    const next = (lane.index + dir + lane.pool.length) % lane.pool.length;
    setLaneIndex(key, next, dir);
  }

  function setLaneIndex(key, nextIndex, dir) {
    const lane = lanes[key];
    if (!lane.pool.length) return;
    const stage = deckEl.querySelector(`[data-stage="${key}"]`);
    const laneEl = deckEl.querySelector(`[data-lane="${key}"]`);
    if (!stage || !laneEl) {
      lane.index = nextIndex;
      lane.identity = optionId(lane.pool[nextIndex]);
      renderDeck();
      return;
    }

    const current = stage.querySelector(".option-panel");
    lane.index = nextIndex;
    lane.identity = optionId(lane.pool[nextIndex]);
    const incoming = document.createElement("div");
    incoming.innerHTML = renderOptionPanel(key, lane.pool[nextIndex]);
    const panel = incoming.firstElementChild;
    panel.classList.add(dir > 0 ? "is-enter-left" : "is-enter-right");
    stage.appendChild(panel);

    requestAnimationFrame(() => {
      if (current) current.classList.add(dir > 0 ? "is-exit-left" : "is-exit-right");
      panel.classList.remove("is-enter-left", "is-enter-right");
    });

    window.setTimeout(() => {
      if (current && current.parentNode) current.parentNode.removeChild(current);
      startCarousels(stage);
    }, 300);

    const chrome = laneEl.querySelector(".lane-chrome");
    if (chrome) {
      const tmp = document.createElement("div");
      tmp.innerHTML = chromeHtml(lane);
      chrome.replaceWith(tmp.firstElementChild);
      laneEl.querySelectorAll(".nav-hit").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          shiftLane(key, Number(btn.dataset.dir) || 1);
        });
      });
    }
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

  function renderHoods() {
    hoodRow.innerHTML = [
      `<button type="button" role="tab" data-hood="all" aria-selected="${hood === "all"}">All</button>`,
    ]
      .concat(
        hoodChoices.map((h) => {
          const selected = h === hood;
          return `<button type="button" role="tab" data-hood="${esc(h)}" aria-selected="${selected}">${esc(h)}</button>`;
        })
      )
      .join("");
  }

  function renderTimes() {
    timeRow.innerHTML = TIME_OPTIONS.map((t) => {
      const selected = t.id === timeBucket;
      return `<button type="button" role="tab" data-time="${esc(t.id)}" aria-selected="${selected}">${esc(t.label)}</button>`;
    }).join("");
  }

  function renderCats() {
    catRow.innerHTML = categories
      .map((c) => {
        const selected = c.id === category;
        return `<button type="button" role="tab" data-cat="${esc(c.id)}" aria-selected="${selected}">${esc(c.label)}</button>`;
      })
      .join("");
  }

  function renderParty() {
    [...partyRow.querySelectorAll("button")].forEach((btn) => {
      btn.setAttribute("aria-selected", btn.dataset.party === party ? "true" : "false");
    });
  }

  function renderNights() {
    if (!plans.length) {
      nightBlock.hidden = true;
      return;
    }
    nightBlock.hidden = false;
    nightRow.innerHTML = [
      `<button type="button" role="tab" data-night="" aria-selected="${nightKey ? "false" : "true"}">Any</button>`,
    ]
      .concat(
        plans.map((p) => {
          const selected = p.for_night === nightKey;
          return `<button type="button" role="tab" data-night="${esc(p.for_night)}" aria-selected="${selected}">${esc(shortNight(p.for_night))}</button>`;
        })
      )
      .join("");
  }

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

  window.addEventListener("resize", () => sizeLanes());

  deckEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const laneEl = deckEl.querySelector(".lane");
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
  ])
    .then(([hoods, planData, restData, eventData]) => {
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
          <h2 class="lane-heading">Night Out</h2>
          <div class="option-stage">
            <div class="option-panel">
              <div class="bg-stack"><div class="bg-fallback"><span class="lettermark">!</span></div></div>
              <div class="shade"></div>
              <div class="copy">
                <h3 class="option-title">Couldn’t load Chicago</h3>
                <p class="lede">Give it a refresh — we’ll be right here.</p>
              </div>
            </div>
          </div>
        </section>`;
      sizeLanes();
    });
})();
