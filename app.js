const TZ = "America/Chicago";

const el = {
  chapters: document.getElementById("chapters"),
  rail: document.getElementById("date-rail"),
  cta: document.getElementById("cta-tonight"),
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function dateParts(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const opts = { timeZone: TZ };
  return {
    weekday: new Intl.DateTimeFormat("en-US", { ...opts, weekday: "short" }).format(d),
    month: new Intl.DateTimeFormat("en-US", { ...opts, month: "short" }).format(d),
    day: new Intl.DateTimeFormat("en-US", { ...opts, day: "numeric" }).format(d),
  };
}

function tonightIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function pickFocus(plans) {
  const t = tonightIso();
  return plans.find((p) => p.for_night === t) || plans[0];
}

function panel(kind, place) {
  const name = place?.name || kind;
  const initial = (name.trim()[0] || "?").toUpperCase();
  const img = place?.image
    ? `<img class="media" src="${esc(place.image)}" alt="" loading="lazy" decoding="async" />`
    : "";
  return `<div class="panel ${kind}">
    <span class="initial" aria-hidden="true">${esc(initial)}</span>
    ${img}
    <div class="shade"></div>
  </div>`;
}

function renderChapter(plan, index) {
  const { weekday, month, day } = dateParts(plan.for_night);
  const eat = plan.eat || {};
  const then = plan.then || {};
  const backup = plan.backup || {};

  const reserve = eat.url
    ? `<a href="${esc(eat.url)}" target="_blank" rel="noopener">Reserve · ${esc(eat.name)}</a>`
    : "";
  const tickets = then.url
    ? `<a href="${esc(then.url)}" target="_blank" rel="noopener">Tickets · ${esc(then.name)}</a>`
    : "";
  const backupLink = backup.url
    ? `<a href="${esc(backup.url)}" target="_blank" rel="noopener">${esc(backup.name)}</a>`
    : esc(backup.name || "");

  const section = document.createElement("section");
  section.className = "chapter";
  section.id = `night-${plan.for_night}-${index}`;
  section.dataset.night = plan.for_night;
  section.setAttribute(
    "aria-label",
    `${weekday} ${month} ${day} — ${plan.corridor || "Chicago"}`
  );

  section.innerHTML = `
    ${panel("eat", eat)}
    ${panel("then", then)}
    <div class="copy">
      <div class="date-block">
        <span class="date-chip">${esc(plan.corridor || "Chicago")} · ${esc(plan.slot || "")}</span>
        <h2 class="date-big">${esc(weekday)} · ${esc(month)} ${esc(day)}</h2>
        <p class="vibe">${esc(plan.vibe || "")}</p>
      </div>
      <div class="strip">
        <span class="pair">${esc(eat.name)} → ${esc(then.name)}</span>
        <span class="meta">${esc(then.start || "")}${then.cost ? " · " + esc(then.cost) : ""}</span>
        <span class="budget">${esc(plan.budget || "")}</span>
      </div>
      <div class="links">${reserve}${tickets}</div>
      <div class="details">
        <strong>Eat</strong>${esc(eat.reserve || "")}${eat.order_this ? " · Order: " + esc(eat.order_this) : ""}
        <strong>Backup</strong>${backupLink}${backup.note ? " — " + esc(backup.note) : ""}
        <strong>Transit</strong>${esc(plan.transit || "")}
        <strong>Don’t</strong>${esc(plan.dont || "")}
      </div>
    </div>
  `;
  return section;
}

function buildRail(plans, nodes) {
  el.rail.innerHTML = "";
  plans.forEach((p, i) => {
    const { weekday, day } = dateParts(p.for_night);
    const b = document.createElement("button");
    b.type = "button";
    b.title = `${weekday} ${day}`;
    b.setAttribute("aria-label", `Jump to ${weekday} ${day}`);
    b.addEventListener("click", () => {
      nodes[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    el.rail.appendChild(b);
  });
}

function watchActive(chapters) {
  const buttons = [...el.rail.querySelectorAll("button")];
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!(entry.isIntersecting && entry.intersectionRatio >= 0.5)) continue;
        const node = entry.target;
        chapters.forEach((c) => c.classList.remove("is-active"));
        node.classList.add("is-active");
        const idx = chapters.indexOf(node);
        buttons.forEach((b, i) => {
          if (i === idx) b.setAttribute("aria-current", "true");
          else b.removeAttribute("aria-current");
        });
      }
    },
    { root: el.chapters, threshold: [0.5, 0.6] }
  );
  chapters.forEach((c) => io.observe(c));
}

fetch("./plans.json")
  .then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  })
  .then((plans) => {
    plans = [...plans].sort((a, b) =>
      String(a.for_night).localeCompare(String(b.for_night))
    );
    el.chapters.innerHTML = "";
    const nodes = plans.map((p, i) => {
      const node = renderChapter(p, i);
      el.chapters.appendChild(node);
      return node;
    });
    buildRail(plans, nodes);
    watchActive(nodes);
    if (nodes[0]) nodes[0].classList.add("is-active");

    const focus = pickFocus(plans);
    const focusIdx = Math.max(0, plans.indexOf(focus));
    if (el.cta) {
      el.cta.addEventListener("click", (e) => {
        e.preventDefault();
        nodes[focusIdx]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  })
  .catch((err) => {
    console.error(err);
    el.chapters.innerHTML =
      '<section class="chapter" style="display:grid;place-items:center"><p>Couldn’t load plans.json</p></section>';
  });
