(function () {
  const stage = document.getElementById("stage");
  const nightRow = document.getElementById("night-row");
  const partyRow = document.getElementById("party-row");

  let plans = [];
  let scout = null;
  let nightKey = null;
  let party = "couple";

  const PARTY_LABEL = { couple: "Couple", family: "Family", friends: "Friends" };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nightLabel(iso) {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function shortWeekday(iso) {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
  }

  function pickCorridor(plan) {
    const parties = plan.parties || {};
    const block = parties[party] || parties.couple || plan;
    return {
      eat: block.eat || plan.eat,
      then: block.then || plan.then,
      backup: block.backup || plan.backup,
      transit: block.transit || plan.transit,
      dont: block.dont || plan.dont,
      corridor: plan.corridor || "",
    };
  }

  function defaultNight() {
    const todayIso = new Date().toISOString().slice(0, 10);
    const upcoming = plans.find((p) => p.for_night >= todayIso);
    return (upcoming || plans[0] || {}).for_night || null;
  }

  function renderPills() {
    nightRow.innerHTML = plans
      .map((p) => {
        const selected = p.for_night === nightKey;
        return `<button type="button" role="tab" data-night="${esc(p.for_night)}" aria-selected="${selected}">${esc(shortWeekday(p.for_night))}</button>`;
      })
      .join("");
    [...partyRow.querySelectorAll("button")].forEach((btn) => {
      btn.setAttribute("aria-selected", btn.dataset.party === party ? "true" : "false");
    });
  }

  function observeChapters() {
    const chapters = stage.querySelectorAll(".chapter");
    if (!("IntersectionObserver" in window)) {
      chapters.forEach((c) => c.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-in");
        });
      },
      { threshold: 0.35 }
    );
    chapters.forEach((c) => io.observe(c));
  }

  function dishCards(eat) {
    const dishes = (eat && eat.dishes) || [];
    if (!dishes.length) return "";
    return `
      <section class="panel">
        <h3>Order like a local</h3>
        <p class="hint">Plates worth fighting over. Start here.</p>
        <div class="dishes">
          ${dishes
            .slice(0, 3)
            .map(
              (d) => `
            <figure class="dish">
              <img src="${esc(d.image || eat.image || "")}" alt="${esc(d.name || "Dish")}" loading="lazy" />
              <figcaption>${esc(d.name || "House favorite")}</figcaption>
            </figure>`
            )
            .join("")}
        </div>
      </section>`;
  }

  function scoutTeaser() {
    if (!scout) return { strip: "", more: "" };
    const highlights = (scout.highlights || []).slice(0, 6);
    const count = scout.scouted_count || scout.scouted_count || highlights.length;
    const cats = (scout.categories || []).slice(0, 4);
    const strip = `
      <div class="scout-strip" aria-label="This week's scout">
        <span><strong>${esc(count)}</strong> nights scouted</span>
        ${cats.map((c) => `<span>${esc(c)}</span>`).join("")}
      </div>`;
    if (!highlights.length) return { strip, more: "" };
    const cards = highlights
      .map((e) => {
        const href = e.official_url || e.official_url || e.official_url || e.url || "#";
        return `
        <a class="event-card" href="${esc(href)}" target="_blank" rel="noopener">
          <div class="when">${esc(e.date || "")}${e.start ? " · " + esc(e.start) : ""}</div>
          <div class="name">${esc(e.name)}</div>
          <p class="where">${esc(e.neighborhood || e.venue || "Chicago")}${e.cost ? " · " + esc(e.cost) : ""}</p>
        </a>`;
      })
      .join("");
    const more = `
      <section class="more-nights">
        <h3>Also on the boards this week</h3>
        <p class="hint">We already scouted comedy, jazz, museums, magic, and weird one-offs. Your corridor picks one that fits.</p>
        <div class="event-grid">${cards}</div>
      </section>`;
    return { strip, more };
  }

  function backupHtml(backup) {
    if (!backup) return "Have a second table nearby.";
    if (typeof backup === "string") return esc(backup);
    const label = backup.name || "Alt plan";
    const note = backup.note ? ` — ${backup.note}` : "";
    if (backup.url) {
      return `<a href="${esc(backup.url)}" target="_blank" rel="noopener">${esc(label)}</a>${esc(note)}`;
    }
    return esc(label + note);
  }

  function render() {
    const plan = plans.find((p) => p.for_night === nightKey) || plans[0];
    if (!plan) {
      stage.innerHTML = `<div class="empty"><h1>No plans loaded yet.</h1></div>`;
      return;
    }

    const c = pickCorridor(plan);
    const eat = c.eat || {};
    const then = c.then || {};
    const partyLabel = PARTY_LABEL[party] || "Couple";
    const nightText = nightLabel(plan.for_night);
    const where = c.corridor || eat.neighborhood || "Chicago";
    const { strip, more } = scoutTeaser();

    stage.innerHTML = `
      <section class="splash">
        <div class="splash-copy">
          <p class="eyebrow">${esc(nightText)} · ${esc(partyLabel)} · ${esc(where)}</p>
          <h1>Eat something.<br />Then do something.</h1>
          <p class="lede">A Chicago night out — dinner, then a reason to stay out.</p>
          ${strip}
        </div>
      </section>

      <section class="chapter" data-step="eat">
        <img class="chapter-media" src="${esc(eat.image || "")}" alt="${esc(eat.name || "Dinner")}" />
        <div class="chapter-shade"></div>
        <div class="chapter-copy">
          <div class="kicker">Eat <span class="party-pill">${esc(partyLabel)}</span></div>
          <h2>${esc(eat.name || "Dinner")}</h2>
          <p class="meta">${esc(where)}${eat.cuisine ? " · " + esc(eat.cuisine) : ""}</p>
          <p class="note">${esc(eat.why || eat.note || "Start the night at the table.")}</p>
          <div class="actions">
            ${eat.url ? `<a class="btn primary" href="${esc(eat.url)}" target="_blank" rel="noopener">Reserve / menu</a>` : ""}
            <a class="btn ghost" href="#then">Then what?</a>
          </div>
        </div>
      </section>

      ${dishCards(eat)}

      <section class="chapter" id="then" data-step="then">
        <img class="chapter-media" src="${esc(then.image || eat.image || "")}" alt="${esc(then.name || "Then")}" />
        <div class="chapter-shade"></div>
        <div class="chapter-copy">
          <div class="kicker">Then</div>
          <h2>${esc(then.name || "Something to do")}</h2>
          <p class="meta">${esc(then.neighborhood || then.venue || where)}${then.start ? " · " + esc(then.start) : ""}${then.cost ? " · " + esc(then.cost) : ""}</p>
          <p class="note">${esc(then.why || then.note || "Walk over, stay out, make it a night.")}</p>
          <div class="actions">
            ${then.url ? `<a class="btn primary" href="${esc(then.url)}" target="_blank" rel="noopener">Tickets / details</a>` : ""}
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>Backup · Transit · Don’t</h3>
        <p class="hint">Plan B stays in the same neighborhood. Don’t lose the night.</p>
        <div class="trio">
          <article>
            <div class="tag">Backup</div>
            <p>${backupHtml(c.backup)}</p>
          </article>
          <article>
            <div class="tag">Transit</div>
            <p>${esc(typeof c.transit === "string" ? c.transit : (c.transit && c.transit.note) || "Walk or short rideshare — keep it close.")}</p>
          </article>
          <article class="dont">
            <div class="tag">Don’t</div>
            <p>${esc(typeof c.dont === "string" ? c.dont : (c.dont && c.dont.note) || "Don’t stretch the night across the city.")}</p>
          </article>
        </div>
      </section>

      ${more}
    `;

    renderPills();
    observeChapters();
  }

  nightRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-night]");
    if (!btn) return;
    nightKey = btn.dataset.night;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  partyRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-party]");
    if (!btn) return;
    party = btn.dataset.party;
    render();
  });

  Promise.all([
    fetch("plans.json").then((r) => r.json()),
    fetch("scout-teaser.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ])
    .then(([data, teaser]) => {
      plans = Array.isArray(data) ? data : data.plans || [];
      scout = teaser;
      nightKey = defaultNight();
      render();
    })
    .catch((err) => {
      console.error(err);
      stage.innerHTML = `<div class="empty"><h1>Couldn’t load plans.</h1><p>Try a refresh.</p></div>`;
    });
})();
