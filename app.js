(function () {
  const proof = document.getElementById("proof");
  const catRow = document.getElementById("cat-row");
  const partyRow = document.getElementById("party-row");
  const nightRow = document.getElementById("night-row");
  const nightBlock = document.getElementById("night-block");
  const reelEl = document.getElementById("reel");
  const corridorEl = document.getElementById("corridor");

  let neighborhoods = [];
  let categories = [];
  let plans = [];
  let scoutedCount = 0;
  let category = "all";
  let party = "couple";
  let nightKey = null;
  let mode = "reel";

  const PARTY_LABEL = { couple: "Couple", family: "Family", friends: "Friends" };

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

  function partyFits(n) {
    const fits = (n.party_fits || []).map((x) => String(x).toLowerCase());
    if (!fits.length) return true;
    return fits.includes(party);
  }

  function matchesCategory(n) {
    if (category === "all") return true;
    if (n.category === category) return true;
    return (n.category_ids || []).includes(category);
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

  function pickCorridor(plan) {
    const parties = plan.parties || {};
    const block = parties[party] || parties.couple || plan;
    return {
      eat: block.eat || plan.eat || {},
      then: block.then || plan.then || {},
      backup: block.backup || plan.backup || {},
      transit: block.transit || plan.transit || "",
      dont: block.dont || plan.dont || "",
      corridor: plan.corridor || "",
      for_night: plan.for_night,
    };
  }

  function observeIn() {
    const nodes = document.querySelectorAll(".slide, .corridor-step, .dish-bleed");
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((n) => n.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("is-in");
        });
      },
      { threshold: 0.28 }
    );
    nodes.forEach((n) => io.observe(n));
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
    nightRow.innerHTML = plans
      .map((p) => {
        const selected = p.for_night === nightKey;
        return `<button type="button" role="tab" data-night="${esc(p.for_night)}" aria-selected="${selected}">${esc(shortNight(p.for_night))}</button>`;
      })
      .join("");
  }

  function renderReel() {
    mode = "reel";
    corridorEl.hidden = true;
    corridorEl.innerHTML = "";
    const list = visibleNeighborhoods();
    if (!list.length) {
      reelEl.innerHTML = `<div class="empty"><h2>Nothing in that mix tonight.</h2><p>Flip vibe or who you’re with.</p></div>`;
      return;
    }
    reelEl.innerHTML = list
      .map((n) => {
        const hasCorridor = !!(n.for_night && planForNight(n.for_night));
        const hookMeta = [n.hook.venue, n.hook.date, n.hook.cost].filter(Boolean).join(" · ");
        return `
        <section class="slide" data-hood="${esc(n.id)}">
          <div class="media" style="background-image:url('${esc(n.image)}')"></div>
          <div class="shade"></div>
          <div class="copy">
            <span class="cat-pill">${esc(n.category_label)}</span>
            <span class="count-pill">${esc(n.count)} on the boards</span>
            <h2>${esc(n.neighborhood)}</h2>
            <p class="hook">${esc(n.hook.name)}</p>
            <p class="meta">${esc(hookMeta)}</p>
            <div class="actions">
              ${
                hasCorridor
                  ? `<button type="button" class="btn flame" data-open-night="${esc(n.for_night)}">Make it a night · ${esc(shortNight(n.for_night))}</button>`
                  : `<button type="button" class="btn" data-open-night="${esc(defaultNight() || "")}">Browse nights</button>`
              }
              ${
                n.hook.url
                  ? `<a class="btn ghost" href="${esc(n.hook.url)}" target="_blank" rel="noopener">Event details</a>`
                  : ""
              }
            </div>
          </div>
        </section>`;
      })
      .join("");
    observeIn();
  }

  function renderCorridor(iso) {
    const plan = planForNight(iso);
    if (!plan) {
      corridorEl.hidden = false;
      corridorEl.innerHTML = `<div class="empty"><h2>No corridor for that night yet.</h2></div>`;
      return;
    }
    mode = "corridor";
    nightKey = iso;
    renderNights();
    renderParty();
    const c = pickCorridor(plan);
    const eat = c.eat || {};
    const then = c.then || {};
    const dishes = eat.dishes || [];
    const partyLabel = PARTY_LABEL[party] || "Couple";
    const dont = typeof c.dont === "string" ? c.dont : (c.dont && c.dont.note) || "";
    const transit = typeof c.transit === "string" ? c.transit : (c.transit && c.transit.note) || "";
    const backup = c.backup || {};

    const dishHtml = dishes
      .slice(0, 2)
      .map(
        (d) => `
        <section class="dish-bleed">
          <div class="media" style="background-image:url('${esc(d.image || eat.image || "")}')"></div>
          <div class="shade"></div>
          <div class="copy">
            <p class="eyebrow">Order this</p>
            <h2>${esc(d.name || "House favorite")}</h2>
          </div>
        </section>`
      )
      .join("");

    corridorEl.hidden = false;
    corridorEl.innerHTML = `
      <div class="back-reel"><button type="button" class="btn ghost" id="back-to-reel">← Neighborhoods</button></div>
      <section class="corridor-step">
        <div class="media" style="background-image:url('${esc(eat.image || "")}')"></div>
        <div class="shade"></div>
        <div class="copy">
          <p class="eyebrow">Eat · ${esc(nightLabel(iso))}</p>
          <span class="party-pill">${esc(partyLabel)}</span>
          <h2>${esc(eat.name || "Dinner")}</h2>
          <p class="meta">${esc(c.corridor || "Chicago")}</p>
          <p class="note">${esc(eat.why || eat.note || "Start the night at the table.")}</p>
          <div class="actions">
            ${eat.url ? `<a class="btn" href="${esc(eat.url)}" target="_blank" rel="noopener">Reserve / menu</a>` : ""}
            <a class="btn ghost" href="#then-step">Then what?</a>
          </div>
        </div>
      </section>
      ${dishHtml}
      <section class="corridor-step" id="then-step">
        <div class="media" style="background-image:url('${esc(then.image || eat.image || "")}')"></div>
        <div class="shade"></div>
        <div class="copy">
          <p class="eyebrow">Then</p>
          <h2>${esc(then.name || "Something to do")}</h2>
          <p class="meta">${[then.start, then.cost].filter(Boolean).map(esc).join(" · ")}</p>
          <p class="note">${esc(then.why || then.note || "Walk over, stay out, make it a night.")}</p>
          <div class="actions">
            ${then.url ? `<a class="btn flame" href="${esc(then.url)}" target="_blank" rel="noopener">Tickets / details</a>` : ""}
            ${
              backup.url
                ? `<a class="btn ghost" href="${esc(backup.url)}" target="_blank" rel="noopener">Backup · ${esc(backup.name || "Plan B")}</a>`
                : ""
            }
          </div>
          ${dont ? `<p class="dont-line">Don’t: ${esc(dont)}</p>` : ""}
          ${transit ? `<p class="transit-line">${esc(transit)}</p>` : ""}
        </div>
      </section>
    `;
    corridorEl.scrollIntoView({ behavior: "smooth", block: "start" });
    observeIn();
    const back = document.getElementById("back-to-reel");
    if (back) {
      back.addEventListener("click", () => {
        corridorEl.hidden = true;
        corridorEl.innerHTML = "";
        mode = "reel";
        document.getElementById("reel").scrollIntoView({ behavior: "smooth" });
      });
    }
  }

  catRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    category = btn.dataset.cat;
    renderCats();
    renderReel();
  });

  partyRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-party]");
    if (!btn) return;
    party = btn.dataset.party;
    renderParty();
    if (mode === "corridor" && nightKey) renderCorridor(nightKey);
    else renderReel();
  });

  nightRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-night]");
    if (!btn) return;
    renderCorridor(btn.dataset.night);
  });

  reelEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-open-night]");
    if (!btn) return;
    const iso = btn.dataset.openNight;
    if (iso) renderCorridor(iso);
  });

  Promise.all([
    fetch("neighborhoods.json").then((r) => r.json()),
    fetch("plans.json").then((r) => r.json()),
  ])
    .then(([hoods, planData]) => {
      neighborhoods = hoods.neighborhoods || [];
      categories = hoods.categories || [];
      scoutedCount = hoods.scouted_count || 0;
      plans = Array.isArray(planData) ? planData : planData.plans || [];
      nightKey = defaultNight();
      proof.textContent = `${scoutedCount} nights checked`;
      renderCats();
      renderParty();
      renderNights();
      renderReel();
      document.getElementById("open")?.classList.add("is-in");
    })
    .catch((err) => {
      console.error(err);
      proof.textContent = "Couldn’t load the boards";
      reelEl.innerHTML = `<div class="empty"><h2>Couldn’t load Chicago.</h2><p>Try a refresh.</p></div>`;
    });
})();
