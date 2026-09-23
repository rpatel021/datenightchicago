(function () {
  const proof = document.getElementById("proof");
  const catRow = document.getElementById("cat-row");
  const partyRow = document.getElementById("party-row");
  const nightRow = document.getElementById("night-row");
  const nightBlock = document.getElementById("night-block");
  const deckEl = document.getElementById("deck");
  const backBar = document.getElementById("back-bar");
  const backBtn = document.getElementById("back-to-deck");

  let neighborhoods = [];
  let categories = [];
  let plans = [];
  let restaurants = [];
  let events = [];
  let category = "all";
  let party = "couple";
  let nightKey = null;
  let mode = "hoods"; // hoods | night
  let activeHood = null;
  let io = null;

  const PARTY_LABEL = { couple: "Couple", family: "Family", friends: "Friends" };

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

  function partyFits(n) {
    const fits = (n.party_fits || []).map((x) => String(x).toLowerCase());
    if (!fits.length) return true;
    return fits.includes(party);
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

  function matchesCategory(n) {
    if (category === "all") return true;
    if (n.category === category) return true;
    return (n.category_ids || []).includes(category);
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
      "south loop": ["south loop", "loop"],
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

  function restaurantInNeighborhood(r, hoodKeys) {
    const hn = String(r.neighborhood || "").toLowerCase();
    if (!hn || !hoodKeys.length) return false;
    return hoodKeys.some((k) => hn === k || hn.includes(k) || k.includes(hn));
  }

  function eventInNeighborhood(ev, hoodKeys) {
    const hn = String(ev.neighborhood || "").toLowerCase();
    if (!hn) return false;
    if (!hoodKeys.length) return false;
    if (hn === "various") return true;
    return hoodKeys.some((k) => hn === k || hn.includes(k) || k.includes(hn));
  }

  function findCatalogByName(name) {
    const n = normName(name);
    if (!n) return null;
    return restaurants.find((r) => normName(r.name) === n) || null;
  }

  function sourceRank(r) {
    if (r.source_id === "corridor_seed") return 0;
    if (r.source_id === "editor_seed") return 1;
    return 2;
  }

  function corridorHoodKeys(plan, eat) {
    const keys = [];
    expandNeighborhoodKeys(plan && plan.corridor).forEach((k) => keys.push(k));
    if (eat && eat.neighborhood) {
      expandNeighborhoodKeys(eat.neighborhood).forEach((k) => {
        if (!keys.includes(k)) keys.push(k);
      });
    }
    return keys;
  }

  function pickCatalogEat(hoodKeys) {
    let pool = restaurants.filter(
      (r) =>
        (r.status || "active") === "active" &&
        partyFitsRestaurant(r) &&
        restaurantInNeighborhood(r, hoodKeys)
    );
    if (!pool.length) return null;
    const vibeHits = pool.filter(matchesVibeRestaurant);
    if (vibeHits.length) pool = vibeHits;
    pool = pool.slice().sort((a, b) => {
      const sr = sourceRank(a) - sourceRank(b);
      if (sr !== 0) return sr;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return pool[0] || null;
  }

  function eatFromCatalog(r, dishes) {
    return {
      name: r.name,
      url: r.reserve_url || r.official_url || "",
      image: r.image || "",
      why: r.notes || "",
      dishes: dishes || [],
      neighborhood: r.neighborhood || "",
      cuisine: r.cuisine || "",
      price_band: r.price_band || "",
    };
  }

  function resolveEat(planEat, plan) {
    const eat = planEat && typeof planEat === "object" ? planEat : {};
    const hoodKeys = corridorHoodKeys(plan, eat);
    const catalogHit = eat.name ? findCatalogByName(eat.name) : null;

    if (catalogHit && partyFitsRestaurant(catalogHit)) {
      return {
        name: eat.name || catalogHit.name,
        url: eat.url || catalogHit.reserve_url || catalogHit.official_url || "",
        image: eat.image || catalogHit.image || "",
        why: eat.why || eat.note || catalogHit.notes || "",
        dishes: eat.dishes || [],
        neighborhood: catalogHit.neighborhood || eat.neighborhood || "",
        cuisine: catalogHit.cuisine || "",
        price_band: catalogHit.price_band || "",
      };
    }

    const noPlanEat = !eat.name;
    const failsParty = !!(catalogHit && !partyFitsRestaurant(catalogHit));
    if (noPlanEat || failsParty) {
      const picked = pickCatalogEat(hoodKeys);
      if (picked) {
        const same = eat.name && normName(eat.name) === normName(picked.name);
        return eatFromCatalog(picked, same ? eat.dishes || [] : []);
      }
    }

    return {
      name: eat.name || "",
      url: eat.url || "",
      image: eat.image || "",
      why: eat.why || eat.note || "",
      dishes: eat.dishes || [],
      neighborhood: eat.neighborhood || "",
      cuisine: "",
      price_band: "",
    };
  }

  function scoreEvent(ev, hoodKeys) {
    let score = 0;
    if (eventInNeighborhood(ev, hoodKeys)) score += 10;
    if (nightKey && ev.date === nightKey) score += 8;
    if (category !== "all") {
      if (String(ev.category || "").toLowerCase() === category) score += 6;
      const hints = VIBE_EVENT_HINTS[category] || [];
      const blob = (String(ev.name || "") + " " + String(ev.notes || "") + " " + String(ev.venue || "")).toLowerCase();
      if (hints.some((h) => blob.includes(h))) score += 3;
    }
    if (partyFitsEvent(ev)) score += 2;
    return score;
  }

  function pickEvent(hoodKeys, preferredDate) {
    const date = preferredDate || nightKey;
    let pool = events.filter((ev) => {
      if (String(ev.status || "").toLowerCase() === "cancelled") return false;
      if (!partyFitsEvent(ev)) return false;
      if (date && ev.date !== date) return false;
      return eventInNeighborhood(ev, hoodKeys) || !hoodKeys.length;
    });
    if (!pool.length && date) {
      pool = events.filter((ev) => {
        if (String(ev.status || "").toLowerCase() === "cancelled") return false;
        if (!partyFitsEvent(ev)) return false;
        return eventInNeighborhood(ev, hoodKeys);
      });
    }
    if (!pool.length) return null;
    pool = pool.slice().sort((a, b) => scoreEvent(b, hoodKeys) - scoreEvent(a, hoodKeys));
    return pool[0] || null;
  }

  function countEatsForHood(hoodName) {
    const keys = expandNeighborhoodKeys(hoodName);
    return restaurants.filter(
      (r) =>
        (r.status || "active") === "active" &&
        partyFitsRestaurant(r) &&
        restaurantInNeighborhood(r, keys) &&
        matchesVibeRestaurant(r)
    ).length;
  }

  function countEventsForHood(hoodName) {
    const keys = expandNeighborhoodKeys(hoodName);
    return events.filter((ev) => {
      if (String(ev.status || "").toLowerCase() === "cancelled") return false;
      if (!partyFitsEvent(ev)) return false;
      if (nightKey && ev.date !== nightKey) return false;
      if (category !== "all" && String(ev.category || "").toLowerCase() !== category) {
        const hints = VIBE_EVENT_HINTS[category] || [];
        const blob = (String(ev.name || "") + " " + String(ev.notes || "")).toLowerCase();
        if (!hints.some((h) => blob.includes(h)) && String(ev.category || "").toLowerCase() !== category) {
          // soft: still count if in hood when vibe is set but category mismatch — only count matching vibe
          return false;
        }
      }
      return eventInNeighborhood(ev, keys);
    }).length;
  }

  function visibleNeighborhoods() {
    return neighborhoods.filter((n) => matchesCategory(n) && partyFits(n));
  }

  function planForNight(iso) {
    return plans.find((p) => p.for_night === iso) || null;
  }

  function defaultNight() {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = plans.find((p) => p.for_night >= today);
    return (upcoming || plans[0] || {}).for_night || null;
  }

  function nightForHood(n) {
    if (nightKey) return nightKey;
    if (n && n.for_night) return n.for_night;
    return defaultNight();
  }

  function pickCorridor(plan, hoodOverride) {
    const parties = (plan && plan.parties) || {};
    const block = parties[party] || parties.couple || plan || {};
    const rawEat = (block && block.eat) || (plan && plan.eat) || {};
    const synthetic = plan || {
      for_night: nightKey,
      corridor: hoodOverride || "",
    };
    if (hoodOverride && !synthetic.corridor) synthetic.corridor = hoodOverride;
    if (hoodOverride && plan && !expandNeighborhoodKeys(plan.corridor).some((k) => expandNeighborhoodKeys(hoodOverride).includes(k))) {
      // Plan corridor doesn't match hood — still resolve eat against hood
      const hoodPlan = { corridor: hoodOverride, for_night: plan.for_night };
      return {
        eat: resolveEat({}, hoodPlan),
        then: (block && block.then) || plan.then || {},
        backup: (block && block.backup) || plan.backup || {},
        transit: (block && block.transit) || plan.transit || "",
        dont: (block && block.dont) || plan.dont || "",
        corridor: hoodOverride,
        for_night: plan.for_night,
      };
    }
    return {
      eat: resolveEat(rawEat, synthetic),
      then: (block && block.then) || (plan && plan.then) || {},
      backup: (block && block.backup) || (plan && plan.backup) || {},
      transit: (block && block.transit) || (plan && plan.transit) || "",
      dont: (block && block.dont) || (plan && plan.dont) || "",
      corridor: (plan && plan.corridor) || hoodOverride || "",
      for_night: (plan && plan.for_night) || nightKey,
    };
  }

  function mediaHtml(imageUrl, letter) {
    const lettermark = esc((letter || "?").charAt(0).toUpperCase());
    if (imageUrl) {
      return `<div class="card-media" style="background-image:url('${esc(imageUrl)}')"></div>`;
    }
    return `<div class="card-media fallback"><span class="lettermark" aria-hidden="true">${lettermark}</span></div>`;
  }

  function observeCards() {
    if (io) io.disconnect();
    const nodes = deckEl.querySelectorAll(".card");
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((n) => n.classList.add("is-in"));
      return;
    }
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("is-in");
        });
      },
      { root: deckEl, threshold: 0.35 }
    );
    nodes.forEach((n) => io.observe(n));
  }

  function scrollDeckTop() {
    deckEl.scrollTo({ top: 0, behavior: "auto" });
  }

  function sizeCards() {
    const h = deckEl.clientHeight;
    if (!h) return;
    deckEl.querySelectorAll(".card").forEach((c) => {
      c.style.height = h + "px";
      c.style.minHeight = h + "px";
    });
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

  function renderHoodDeck() {
    mode = "hoods";
    activeHood = null;
    backBar.hidden = true;
    const list = visibleNeighborhoods();
    if (!list.length) {
      deckEl.innerHTML = `
        <article class="card empty-card">
          <div class="card-media fallback"><span class="lettermark">?</span></div>
          <div class="shade"></div>
          <div class="copy">
            <h2>Nothing in that mix</h2>
            <p class="lede">Flip vibe or who you’re with — Chicago’s still out there.</p>
          </div>
        </article>`;
      observeCards();
      sizeCards();
      scrollDeckTop();
      return;
    }

    deckEl.innerHTML = list
      .map((n, i) => {
        const eats = countEatsForHood(n.neighborhood);
        const evs = countEventsForHood(n.neighborhood);
        const countLine =
          eats || evs
            ? `${eats} dinner${eats === 1 ? "" : "s"} · ${evs} to do`
            : "Peek what’s nearby";
        const hook = (n.hook && n.hook.name) || "A neighborhood worth the trip.";
        const night = nightForHood(n);
        const nightBit = night ? ` · ${shortNight(night)}` : "";
        return `
        <article class="card" data-hood="${esc(n.id)}">
          ${mediaHtml(n.image, n.neighborhood)}
          <div class="shade"></div>
          <div class="copy">
            <div class="pills">
              <span class="pill vibe">${esc(n.category_label || "Chicago")}</span>
              <span class="pill count">${esc(countLine)}</span>
            </div>
            <h2>${esc(n.neighborhood)}</h2>
            <p class="hook">${esc(hook)}</p>
            <p class="meta">${esc(n.neighborhood)}${esc(nightBit)}</p>
            <div class="actions">
              <button type="button" class="btn flame" data-open-hood="${esc(n.id)}" data-night="${esc(night || "")}">Make it a night</button>
            </div>
          </div>
          ${i === 0 ? `<div class="swipe-hint">Swipe up</div>` : ""}
        </article>`;
      })
      .join("");
    observeCards();
    sizeCards();
    scrollDeckTop();
  }

  function thenFromEvent(ev) {
    if (!ev) return null;
    return {
      name: ev.name,
      start: ev.start_time || "",
      cost: ev.cost || "",
      url: ev.official_url || "",
      image: ev.image || "",
      why: ev.notes || ev.date_friendly || "",
      venue: ev.venue || "",
      neighborhood: ev.neighborhood || "",
      fromEvent: true,
    };
  }

  function renderNightDeck(hoodId) {
    const hood = neighborhoods.find((n) => n.id === hoodId) || activeHood;
    if (!hood) {
      renderHoodDeck();
      return;
    }
    activeHood = hood;
    mode = "night";
    backBar.hidden = false;

    const iso = nightForHood(hood);
    nightKey = iso || nightKey;
    renderNights();

    const plan = iso ? planForNight(iso) : null;
    const c = pickCorridor(plan, hood.neighborhood);
    const eat = c.eat || {};
    const hoodKeys = expandNeighborhoodKeys(hood.neighborhood).concat(
      expandNeighborhoodKeys(c.corridor)
    );
    const uniqKeys = [...new Set(hoodKeys)];

    let then = thenFromEvent(pickEvent(uniqKeys, iso));
    if (!then) {
      const planThen = c.then || {};
      if (planThen.name) {
        then = {
          name: planThen.name,
          start: planThen.start || "",
          cost: planThen.cost || "",
          url: planThen.url || "",
          image: planThen.image || "",
          why: planThen.why || planThen.note || "",
          venue: planThen.venue || "",
          neighborhood: "",
          fromEvent: false,
        };
      }
    }

    const backup = c.backup || {};
    const dont = typeof c.dont === "string" ? c.dont : (c.dont && c.dont.note) || "";
    const transit = typeof c.transit === "string" ? c.transit : (c.transit && c.transit.note) || "";
    const partyLabel = PARTY_LABEL[party] || "Couple";
    const nightBit = iso ? nightLabel(iso) : "Tonight";
    const cuisineLine = [eat.cuisine, eat.price_band].filter(Boolean).join(" · ");

    // If no eat from plan, try catalog for hood
    let finalEat = eat;
    if (!finalEat.name) {
      const picked = pickCatalogEat(expandNeighborhoodKeys(hood.neighborhood));
      if (picked) finalEat = eatFromCatalog(picked, []);
    }

    const cards = [];

    // Eat card
    if (finalEat.name) {
      const why = finalEat.why || "Start hungry — good table energy.";
      cards.push(`
        <article class="card">
          ${mediaHtml(finalEat.image, finalEat.cuisine || finalEat.name)}
          <div class="shade"></div>
          <div class="copy">
            <p class="eyebrow">Eat · ${esc(hood.neighborhood)} · ${esc(nightBit)}</p>
            <div class="pills">
              <span class="pill party">${esc(partyLabel)}</span>
              ${cuisineLine ? `<span class="pill soft">${esc(cuisineLine)}</span>` : ""}
            </div>
            <h2>${esc(finalEat.name)}</h2>
            <p class="note">${esc(why)}</p>
            <div class="actions">
              ${
                finalEat.url
                  ? `<a class="btn flame" href="${esc(finalEat.url)}" target="_blank" rel="noopener">Reserve</a>`
                  : ""
              }
            </div>
          </div>
          <div class="swipe-hint">Swipe up</div>
        </article>`);
    }

    // Then card
    if (then && then.name) {
      const meta = [then.start, then.cost, then.venue].filter(Boolean).join(" · ");
      const why = then.why || "Then laugh, listen, or wander.";
      cards.push(`
        <article class="card">
          ${mediaHtml(then.image || finalEat.image || hood.image, then.name)}
          <div class="shade"></div>
          <div class="copy">
            <p class="eyebrow">Then · ${esc(shortNight(iso) || "out")}</p>
            <div class="pills">
              <span class="pill vibe">${then.fromEvent ? "On tonight" : "Editor pick"}</span>
            </div>
            <h2>${esc(then.name)}</h2>
            ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
            <p class="note">${esc(why)}</p>
            <div class="actions">
              ${
                then.url
                  ? `<a class="btn flame" href="${esc(then.url)}" target="_blank" rel="noopener">Tickets / Details</a>`
                  : ""
              }
            </div>
          </div>
        </article>`);
    }

    // Backup
    if (backup && backup.name) {
      cards.push(`
        <article class="card">
          ${mediaHtml(backup.image || hood.image, backup.name)}
          <div class="shade"></div>
          <div class="copy">
            <p class="eyebrow">Backup</p>
            <h2>${esc(backup.name)}</h2>
            <p class="note">${esc(backup.note || backup.why || "If the first plan’s packed — here’s plan B.")}</p>
            <div class="actions">
              ${
                backup.url
                  ? `<a class="btn" href="${esc(backup.url)}" target="_blank" rel="noopener">Details</a>`
                  : ""
              }
            </div>
          </div>
        </article>`);
    }

    // Get there / Don’t
    if (transit || dont) {
      cards.push(`
        <article class="card">
          ${mediaHtml(hood.image, "C")}
          <div class="shade"></div>
          <div class="copy">
            <p class="eyebrow">Get there · Don’t</p>
            <h2>Keep it easy</h2>
            <ul class="compact-list">
              ${transit ? `<li><strong>Get there</strong><span>${esc(transit)}</span></li>` : ""}
              ${dont ? `<li><strong>Don’t</strong><span>${esc(dont)}</span></li>` : ""}
            </ul>
            <div class="actions">
              <button type="button" class="btn ghost" id="back-inline">← More neighborhoods</button>
            </div>
          </div>
        </article>`);
    }

    if (!cards.length) {
      deckEl.innerHTML = `
        <article class="card empty-card">
          <div class="card-media fallback"><span class="lettermark">?</span></div>
          <div class="shade"></div>
          <div class="copy">
            <h2>Nothing locked for that night</h2>
            <p class="lede">Try another night or flip who you’re with.</p>
            <div class="actions" style="justify-content:center">
              <button type="button" class="btn ghost" id="back-inline">← Neighborhoods</button>
            </div>
          </div>
        </article>`;
    } else {
      deckEl.innerHTML = cards.join("");
    }

    observeCards();
    sizeCards();
    scrollDeckTop();

    const inlineBack = document.getElementById("back-inline");
    if (inlineBack) inlineBack.addEventListener("click", () => renderHoodDeck());
  }

  function openHood(hoodId) {
    const n = neighborhoods.find((h) => h.id === hoodId);
    if (!n) return;
    const preferred = nightForHood(n);
    if (preferred) nightKey = preferred;
    renderNights();
    renderNightDeck(hoodId);
  }

  catRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    category = btn.dataset.cat;
    renderCats();
    if (mode === "night" && activeHood) renderNightDeck(activeHood.id);
    else renderHoodDeck();
  });

  partyRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-party]");
    if (!btn) return;
    party = btn.dataset.party;
    renderParty();
    if (mode === "night" && activeHood) renderNightDeck(activeHood.id);
    else renderHoodDeck();
  });

  nightRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-night]");
    if (!btn) return;
    nightKey = btn.dataset.night || null;
    renderNights();
    if (mode === "night" && activeHood) renderNightDeck(activeHood.id);
    else renderHoodDeck();
  });

  deckEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-open-hood]");
    if (!btn) return;
    const iso = btn.dataset.night;
    if (iso) nightKey = iso;
    openHood(btn.dataset.openHood);
  });

  backBtn.addEventListener("click", () => renderHoodDeck());

  window.addEventListener("resize", () => sizeCards());

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
      nightKey = null;
      updateProof();
      renderCats();
      renderParty();
      renderNights();
      renderHoodDeck();
    })
    .catch((err) => {
      console.error(err);
      proof.textContent = "Couldn’t load tonight";
      deckEl.innerHTML = `
        <article class="card empty-card">
          <div class="card-media fallback"><span class="lettermark">!</span></div>
          <div class="shade"></div>
          <div class="copy">
            <h2>Couldn’t load Chicago</h2>
            <p class="lede">Give it a refresh — we’ll be right here.</p>
          </div>
        </article>`;
    });
})();
