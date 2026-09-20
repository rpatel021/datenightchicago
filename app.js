const TZ = "America/Chicago";
const el = {
  track: document.getElementById("cal-track"),
  range: document.getElementById("cal-range"),
  stage: document.getElementById("stage"),
};

let plans = [];
let index = 0;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
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

function buildTrack() {
  el.track.innerHTML = "";
  plans.forEach((p, i) => {
    const { weekday, month, day } = dateParts(p.for_night);
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.textContent = `${weekday} ${month} ${day}`;
    b.addEventListener("click", () => select(i, true));
    el.track.appendChild(b);
  });
  el.range.max = String(Math.max(0, plans.length - 1));
  el.range.addEventListener("input", () => select(Number(el.range.value), false));
}

function select(i, syncRange) {
  index = Math.max(0, Math.min(plans.length - 1, i));
  [...el.track.children].forEach((b, n) => {
    b.setAttribute("aria-selected", n === index ? "true" : "false");
  });
  if (syncRange) el.range.value = String(index);
  render(plans[index]);
}

function dishesHtml(eat) {
  const dishes = Array.isArray(eat?.dishes) ? eat.dishes.slice(0, 3) : [];
  if (!dishes.length) return "";
  return `<section class="section">
    <h2>Order this</h2>
    <p class="hint">A few popular plates to share</p>
    <div class="dishes">${dishes.map((d) => `
      <figure class="dish">
        <img src="${esc(d.image)}" alt="${esc(d.name || "")}" loading="lazy" />
        <figcaption>${esc(d.name || "")}</figcaption>
      </figure>`).join("")}
    </div>
  </section>`;
}

function render(p) {
  const { weekday, month, day } = dateParts(p.for_night);
  const eat = p.eat || {};
  const then = p.then || {};
  const backup = p.backup || {};

  el.stage.innerHTML = `
    <section class="hero" aria-label="Eat">
      ${eat.image ? `<img class="hero-media" src="${esc(eat.image)}" alt="${esc(eat.name || "Restaurant")}" />` : ""}
      <div class="hero-shade"></div>
      <div class="hero-copy">
        <div class="kicker">Eat · ${esc(p.corridor || "")}</div>
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
      <p class="hint">Scroll destination — the night’s show</p>
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

fetch("./plans.json")
  .then((r) => r.json())
  .then((data) => {
    plans = [...data].sort((a, b) => String(a.for_night).localeCompare(String(b.for_night)));
    buildTrack();
    const t = tonightIso();
    let start = plans.findIndex((p) => p.for_night >= t);
    if (start < 0) start = 0;
    select(start, true);
  })
  .catch((err) => {
    console.error(err);
    el.stage.innerHTML = `<section class="section"><p>Couldn’t load plans.json</p></section>`;
  });
