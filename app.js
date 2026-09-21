const TZ = "America/Chicago";
const PARTIES = ["couple", "family", "friends"];
const PARTY_LABEL = { couple: "Couple", family: "Family", friends: "Friends" };

const el = {
  track: document.getElementById("cal-track"),
  range: document.getElementById("cal-range"),
  partyTrack: document.getElementById("party-track"),
  partyRange: document.getElementById("party-range"),
  stage: document.getElementById("stage"),
};

let plans = [];
let index = 0;
let party = "couple";

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

function activePlan() {
  const night = plans[index];
  if (!night) return null;
  if (night.parties && night.parties[party]) {
    return { ...night, ...night.parties[party], party };
  }
  return { ...night, party: "couple" };
}

function buildTrack() {
  el.track.innerHTML = "";
  plans.forEach((p, i) => {
    const { weekday, month, day } = dateParts(p.for_night);
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.textContent = `${weekday} ${month} ${day}`;
    b.addEventListener("click", () => selectNight(i, true));
    el.track.appendChild(b);
  });
  el.range.max = String(Math.max(0, plans.length - 1));
  el.range.oninput = () => selectNight(Number(el.range.value), false);
}

function wireParty() {
  el.partyTrack.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => selectParty(b.dataset.party, true));
  });
  el.partyRange.oninput = () => {
    selectParty(PARTIES[Number(el.partyRange.value)] || "couple", false);
  };
}

function selectNight(i, syncRange) {
  index = Math.max(0, Math.min(plans.length - 1, i));
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

function dishesHtml(eat) {
  const dishes = Array.isArray(eat?.dishes) ? eat.dishes.slice(0, 3) : [];
  if (!dishes.length) return "";
  return `<section class="section">
    <h2>Order this</h2>
    <p class="hint">A few popular plates for a ${esc(PARTY_LABEL[party] || party)} night</p>
    <div class="dishes">${dishes.map((d) => `
      <figure class="dish">
        ${d.image ? `<img src="${esc(d.image)}" alt="${esc(d.name || "")}" loading="lazy" />` : ""}
        <figcaption>${esc(d.name || "")}</figcaption>
      </figure>`).join("")}
    </div>
  </section>`;
}

function render() {
  const p = activePlan();
  if (!p) return;
  const { weekday, month, day } = dateParts(p.for_night);
  const eat = p.eat || {};
  const then = p.then || {};
  const backup = p.backup || {};
  const partyLabel = PARTY_LABEL[party] || party;

  el.stage.innerHTML = `
    <section class="hero" aria-label="Eat">
      ${eat.image ? `<img class="hero-media" src="${esc(eat.image)}" alt="${esc(eat.name || "Restaurant")}" />` : ""}
      <div class="hero-shade"></div>
      <div class="hero-copy">
        <div class="kicker">Eat · ${esc(p.corridor || "")} <span class="party-pill">${esc(partyLabel)}</span></div>
        <h1>${esc(eat.name || "Dinner")}</h1>
        <p class="lede">${esc(weekday)} · ${esc(month)} ${esc(day)}. ${esc(p.vibe || "")}</p>
        <div class="hero-actions">
          ${eat.url ? `<a class="btn primary" href="${esc(eat.url)}" target="_blank" rel="noopener">Restaurant site</a>` : ""}
          <a class="btn ghost" href="#then">See the event ↓</a>
        </div>
      </div>
    </section>

    ${dishesHtml(eat)}

    <section class="section" id="then">
      <h2>Then</h2>
      <p class="hint">${esc(partyLabel)} plan — the night’s show</p>
      <div class="event-hero">
        ${then.image ? `<img src="${esc(then.image)}" alt="${esc(then.name || "Event")}" loading="lazy" />` : ""}
        <div class="shade"></div>
        <div class="caption">
          <strong>${esc(then.name || "")}</strong>
          <span>${esc(then.start || "")}${then.cost ? " · " + esc(then.cost) : ""}</span>
        </div>
      </div>
      <div class="event-meta">
        <div><span class="label">When</span><span>${esc(weekday)} ${esc(month)} ${esc(day)} · ${esc(then.start || "")}</span></div>
        <div><span class="label">Tickets</span><span>${then.url ? `<a href="${esc(then.url)}" target="_blank" rel="noopener">Get tickets</a>` : "—"}${then.cost ? " · " + esc(then.cost) : ""}</span></div>
        <div><span class="label">Budget</span><span>${esc(p.budget || "")}</span></div>
      </div>
    </section>

    <section class="section">
      <h2>Backup · Transit · Don’t</h2>
      <div class="corridor">
        <article>
          <div class="tag">Backup</div>
          <p>${backup.url ? `<a href="${esc(backup.url)}" target="_blank" rel="noopener">${esc(backup.name || "")}</a>` : esc(backup.name || "")}${backup.note ? " — " + esc(backup.note) : ""}</p>
        </article>
        <article>
          <div class="tag">Transit</div>
          <p>${esc(p.transit || "")}</p>
        </article>
      </div>
      <div class="corridor dont" style="margin-top:0.65rem">
        <article>
          <div class="tag">Don’t</div>
          <p>${esc(p.dont || "")}</p>
        </article>
      </div>
    </section>
  `;
}

Promise.all([
  fetch("./plans.json").then((r) => r.json()),
  fetch("./plans-weekend.json").then((r) => r.json()).catch(() => []),
])
  .then(([a, b]) => {
    plans = [...a, ...b].sort((a, b) => String(a.for_night).localeCompare(String(b.for_night)));
    buildTrack();
    wireParty();
    const t = tonightIso();
    let start = plans.findIndex((p) => p.for_night >= t);
    if (start < 0) start = 0;
    selectParty("couple", true);
    selectNight(start, true);
  })
  .catch((err) => {
    console.error(err);
    el.stage.innerHTML = `<section class="section"><p>Couldn’t load plans.json</p></section>`;
  });
