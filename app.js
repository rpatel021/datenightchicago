const TZ = "America/Chicago";
const PARTIES = ["couple", "family", "friends"];
const PARTY_LABEL = { couple: "Couple", family: "Family", friends: "Friends" };

const el = {
  track: document.getElementById("cal-track"),
  range: document.getElementById("cal-range"),
  partyTrack: document.getElementById("party-track"),
  partyRange: document.getElementById("party-range"),
  stage: document.getElementById("stage"),
  refresh: document.getElementById("refresh-plan"),
};

let nights = [];
let catalog = [];
let index = 0;
let party = "couple";
let eatIdx = {};
let thenIdx = {};

function esc(s) {
  const amp = String.fromCharCode(38);
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": amp + "amp;",
    "<": amp + "lt;",
    ">": amp + "gt;",
    '"': amp + "quot;",
    "'": amp + "#39;"
  }[c]));
}

function dateParts(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const o = { timeZone: TZ };
  return {
    weekday: new Intl.DateTimeFormat("en-US", { ...o, weekday: "short" }).format(d),
    month: new Intl.DateTimeFormat("en-US", { ...o, month: "short" }).format(d),
    day: new Intl.DateTimeFormat("en-US", { ...o, day: "numeric" }).format(d),
  };
}

function tonightIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function key() {
  return `${nights[index] || ""}:${party}`;
}

function wrap(i, n) {
  if (!n) return 0;
  return ((i % n) + n) % n;
}

function variantsFor(iso, who) {
  const sameNight = catalog.filter((p) => p.for_night === iso && p.parties && p.parties[who]);
  const pool = catalog.filter((p) => p.parties && p.parties[who]);
  return sameNight.length > 1 ? sameNight : (pool.length ? pool : sameNight);
}

function uniqueDeck(iso, who, field) {
  const seen = new Set();
  const out = [];
  variantsFor(iso, who).forEach((p) => {
    const slice = p.parties[who] || {};
    const item = slice[field];
    const name = item && item.name;
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({
      ...item,
      corridor: p.corridor,
      vibe: slice.vibe || p.vibe || "",
      budget: slice.budget || p.budget || "",
      transit: slice.transit || p.transit || "",
      dont: slice.dont || p.dont || "",
      backup: slice.backup || p.backup || {},
    });
  });
  return out;
}

function currentDecks() {
  const iso = nights[index];
  return {
    iso,
    eats: uniqueDeck(iso, party, "eat"),
    thens: uniqueDeck(iso, party, "then"),
  };
}

function pick(list, map) {
  if (!list.length) return null;
  return list[wrap(map[key()] || 0, list.length)];
}

function buildTrack() {
  el.track.innerHTML = "";
  nights.forEach((iso, i) => {
    const { weekday, month, day } = dateParts(iso);
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.textContent = `${weekday} ${month} ${day}`;
    b.addEventListener("click", () => selectNight(i, true));
    el.track.appendChild(b);
  });
  el.range.max = String(Math.max(0, nights.length - 1));
  el.range.oninput = () => selectNight(Number(el.range.value), false);
}

function wireParty() {
  el.partyTrack.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => selectParty(b.dataset.party, true));
  });
  el.partyRange.oninput = () => {
    selectParty(PARTIES[Number(el.partyRange.value)] || "couple", false);
  };
  if (el.refresh) el.refresh.addEventListener("click", refreshPlan);
}

function selectNight(i, syncRange) {
  index = Math.max(0, Math.min(nights.length - 1, i));
  [...el.track.children].forEach((b, n) => {
    b.setAttribute("aria-selected", n === index ? "true" : "false");
  });
  if (syncRange) el.range.value = String(index);
  render();
}

function selectParty(p, syncRange) {
  party = PARTIES.includes(p) ? p : "couple";
  el.partyTrack.querySelectorAll("button").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.party === party ? "true" : "false");
  });
  if (syncRange) el.partyRange.value = String(PARTIES.indexOf(party));
  render();
}

function refreshPlan() {
  const { eats, thens } = currentDecks();
  const k = key();
  if (eats.length > 1) eatIdx[k] = wrap((eatIdx[k] || 0) + 1, eats.length);
  if (thens.length > 1) thenIdx[k] = wrap((thenIdx[k] || 0) + 1, thens.length);
  render();
}

function shiftDeck(kind, dir) {
  const { eats, thens } = currentDecks();
  const k = key();
  if (kind === "eat" && eats.length > 1) eatIdx[k] = wrap((eatIdx[k] || 0) + dir, eats.length);
  if (kind === "then" && thens.length > 1) thenIdx[k] = wrap((thenIdx[k] || 0) + dir, thens.length);
  render();
}

function dishesHtml(eat) {
  const dishes = Array.isArray(eat?.dishes) ? eat.dishes.slice(0, 3) : [];
  if (!dishes.length) return "";
  return `<section class="section fade-in">
    <h2>Order this</h2>
    <p class="hint">Plates that travel with the restaurant you picked</p>
    <div class="dishes">${dishes.map((d) => `
      <figure class="dish">
        ${d.image ? `<img src="${esc(d.image)}" alt="${esc(d.name || "")}" loading="lazy" />` : ""}
        <figcaption>${esc(d.name || "")}</figcaption>
      </figure>`).join("")}
    </div>
  </section>`;
}

function cardHtml(item, slot, kind) {
  const cls = slot === 0 ? "is-center" : slot < 0 ? "is-left" : "is-right";
  const title = item.name || "";
  const sub = kind === "eat"
    ? (item.corridor || "")
    : [item.start, item.cost].filter(Boolean).join(" · ");
  return `<article class="flow-card ${cls}" data-kind="${kind}" data-slot="${slot}">
    ${item.image ? `<img src="${esc(item.image)}" alt="${esc(title)}" />` : "<div class=\"flow-ph\"></div>"}
    <div class="flow-shade"></div>
    <div class="flow-copy">
      <span>${esc(kind === "eat" ? "Eat" : "Then")}</span>
      <strong>${esc(title)}</strong>
      <em>${esc(sub)}</em>
    </div>
  </article>`;
}

function flowHtml(kind, list, current) {
  if (!list.length) return "";
  const i = wrap(current, list.length);
  const left = list[wrap(i - 1, list.length)];
  const mid = list[i];
  const right = list[wrap(i + 1, list.length)];
  const cards = list.length === 1
    ? cardHtml(mid, 0, kind)
    : cardHtml(left, -1, kind) + cardHtml(mid, 0, kind) + cardHtml(right, 1, kind);
  return `<div class="flow" data-flow="${kind}">
    <button type="button" class="flow-nav prev" data-kind="${kind}" data-dir="-1" aria-label="Previous">‹</button>
    <div class="flow-stage">${cards}</div>
    <button type="button" class="flow-nav next" data-kind="${kind}" data-dir="1" aria-label="Next">›</button>
  </div>`;
}

function wireFlows() {
  el.stage.querySelectorAll(".flow-nav").forEach((b) => {
    b.addEventListener("click", () => shiftDeck(b.dataset.kind, Number(b.dataset.dir)));
  });
  el.stage.querySelectorAll(".flow-card").forEach((card) => {
    card.addEventListener("click", () => {
      const slot = Number(card.dataset.slot);
      if (slot) shiftDeck(card.dataset.kind, slot);
    });
  });
  el.stage.querySelectorAll(".flow-stage").forEach((stage) => {
    let x0 = null;
    stage.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
    stage.addEventListener("pointerup", (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 40) return;
      const kind = stage.parentElement.dataset.flow;
      shiftDeck(kind, dx < 0 ? 1 : -1);
    });
  });
}

function render() {
  const { iso, eats, thens } = currentDecks();
  if (!iso) return;
  const { weekday, month, day } = dateParts(iso);
  const k = key();
  const eat = pick(eats, eatIdx) || {};
  const then = pick(thens, thenIdx) || {};
  const backup = eat.backup || {};
  const partyLabel = PARTY_LABEL[party] || party;
  if (el.refresh) {
    el.refresh.disabled = eats.length + thens.length < 3;
  }

  el.stage.innerHTML = `
    <section class="deck-block fade-in" aria-label="Eat">
      <div class="deck-head">
        <div>
          <div class="kicker">Eat · ${esc(eat.corridor || "Chicago")} <span class="party-pill">${esc(partyLabel)}</span></div>
          <h1>${esc(weekday)} · ${esc(month)} ${esc(day)}</h1>
          <p class="lede ink">Swipe the restaurant. Night and party stay locked.</p>
        </div>
      </div>
      ${flowHtml("eat", eats, eatIdx[k] || 0)}
      <div class="hero-actions tight">
        ${eat.url ? `<a class="btn primary" href="${esc(eat.url)}" target="_blank" rel="noopener">Restaurant site</a>` : ""}
        <a class="btn ghost dark" href="#then">See the event ↓</a>
      </div>
    </section>

    ${dishesHtml(eat)}

    <section class="deck-block fade-in" id="then">
      <div class="deck-head">
        <div>
          <h2>Then</h2>
          <p class="hint">Same night. Same ${esc(partyLabel).toLowerCase()} brief. Different show if you swipe.</p>
        </div>
      </div>
      ${flowHtml("then", thens, thenIdx[k] || 0)}
      <div class="event-meta">
        <div><span class="label">When</span><span>${esc(weekday)} ${esc(month)} ${esc(day)} · ${esc(then.start || "")}</span></div>
        <div><span class="label">Tickets</span><span>${then.url ? `<a href="${esc(then.url)}" target="_blank" rel="noopener">Get tickets</a>` : "—"}${then.cost ? " · " + esc(then.cost) : ""}</span></div>
        <div><span class="label">Budget</span><span>${esc(eat.budget || then.budget || "")}</span></div>
      </div>
    </section>

    <section class="section fade-in">
      <h2>Backup · Transit · Don’t</h2>
      <div class="corridor">
        <article>
          <div class="tag">Backup</div>
          <p>${backup.url ? `<a href="${esc(backup.url)}" target="_blank" rel="noopener">${esc(backup.name || "")}</a>` : esc(backup.name || "")}${backup.note ? " — " + esc(backup.note) : ""}</p>
        </article>
        <article>
          <div class="tag">Transit</div>
          <p>${esc(eat.transit || "")}</p>
        </article>
      </div>
      <div class="corridor dont" style="margin-top:0.65rem">
        <article>
          <div class="tag">Don’t</div>
          <p>${esc(eat.dont || "")}</p>
        </article>
      </div>
    </section>
  `;
  wireFlows();
}

Promise.all([
  fetch("./plans.json").then((r) => r.json()),
  fetch("./plans-weekend.json").then((r) => r.json()).catch(() => []),
])
  .then(([a, b]) => {
    catalog = [...a, ...b];
    nights = [...new Set(catalog.map((p) => p.for_night))].sort();
    buildTrack();
    wireParty();
    const t = tonightIso();
    let start = nights.findIndex((iso) => iso >= t);
    if (start < 0) start = 0;
    selectParty("couple", true);
    selectNight(start, true);
  })
  .catch((err) => {
    console.error(err);
    el.stage.innerHTML = `<section class="section"><p>Couldn’t load plans.json</p></section>`;
  });
