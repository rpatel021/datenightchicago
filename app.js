const state = { plans: [], year: 2026, month: 8, selected: null }; // month 0-index: Sep=8

const el = {
  cal: document.getElementById("calendar"),
  label: document.getElementById("month-label"),
  plans: document.getElementById("plans"),
  prev: document.getElementById("prev-month"),
  next: document.getElementById("next-month"),
};

const fmtLong = new Intl.DateTimeFormat("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago",
});

function nightsWithPlans() {
  return new Set(state.plans.map((p) => p.for_night));
}

function plansFor(iso) {
  return state.plans.filter((p) => p.for_night === iso);
}

function isoFrom(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function renderCalendar() {
  const { year, month } = state;
  el.label.textContent = new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const marked = nightsWithPlans();
  el.cal.innerHTML = "";

  for (let i = 0; i < firstDow; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day muted";
    b.disabled = true;
    b.textContent = "";
    el.cal.appendChild(b);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = isoFrom(year, month, d);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day" + (marked.has(iso) ? " has" : "") + (state.selected === iso ? " selected" : "");
    b.textContent = String(d);
    b.setAttribute("aria-label", iso);
    b.addEventListener("click", () => {
      state.selected = iso;
      renderCalendar();
      renderPlans();
    });
    el.cal.appendChild(b);
  }
}

function linkify(name, url) {
  if (!url) return escapeHtml(name || "");
  return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(name || url)}</a>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "");
}

function renderPlan(p) {
  const eat = p.eat || {};
  const then = p.then || {};
  const backup = p.backup || {};
  const flags = (p.verify_flags || []).length
    ? `<p class="verify">VERIFY: ${escapeHtml(p.verify_flags.join(", "))}</p>`
    : "";
  return `<article class="card">
    <h3>${escapeHtml(p.corridor)} · ${escapeHtml(p.slot || "")}</h3>
    <p class="meta">${escapeHtml(p.vibe || "")}<br/>Budget: ${escapeHtml(p.budget || "")}</p>
    <div class="block"><p class="label">Eat</p><p>${linkify(eat.name, eat.url)}${eat.neighborhood ? " · " + escapeHtml(eat.neighborhood) : ""}<br/>${escapeHtml(eat.reserve || "")}<br/><em>Order:</em> ${escapeHtml(eat.order_this || "")}</p></div>
    <div class="block"><p class="label">Then</p><p>${linkify(then.name, then.url)}${then.start ? " · " + escapeHtml(then.start) : ""}${then.cost ? " · " + escapeHtml(then.cost) : ""}</p></div>
    <div class="block"><p class="label">Backup</p><p>${linkify(backup.name, backup.url)}${backup.note ? "<br/>" + escapeHtml(backup.note) : ""}</p></div>
    <div class="block"><p class="label">Transit</p><p>${escapeHtml(p.transit || "")}</p></div>
    <div class="block"><p class="label">Don’t</p><p>${escapeHtml(p.dont || "")}</p></div>
    ${flags}
  </article>`;
}

function renderPlans() {
  if (!state.selected) {
    el.plans.innerHTML = `<div class="empty">Pick a dotted night to see the plan.</div>`;
    return;
  }
  const list = plansFor(state.selected);
  if (!list.length) {
    const nice = fmtLong.format(new Date(state.selected + "T12:00:00"));
    el.plans.innerHTML = `<div class="empty">No plan for ${escapeHtml(nice)} yet. We’ll add more on updates.</div>`;
    return;
  }
  const nice = fmtLong.format(new Date(state.selected + "T12:00:00"));
  el.plans.innerHTML = `<p class="meta" style="margin:0 0 .5rem">${escapeHtml(nice)} · ${list.length} plan${list.length > 1 ? "s" : ""}</p>` +
    list.map(renderPlan).join("");
}

el.prev.addEventListener("click", () => {
  state.month -= 1;
  if (state.month < 0) { state.month = 11; state.year -= 1; }
  renderCalendar();
});
el.next.addEventListener("click", () => {
  state.month += 1;
  if (state.month > 11) { state.month = 0; state.year += 1; }
  renderCalendar();
});

fetch("plans.json")
  .then((r) => r.json())
  .then((plans) => {
    state.plans = plans;
    // land on first plan month
    const first = [...nightsWithPlans()].sort()[0];
    if (first) {
      const [y, m] = first.split("-").map(Number);
      state.year = y;
      state.month = m - 1;
      state.selected = first;
    }
    renderCalendar();
    renderPlans();
  })
  .catch(() => {
    el.plans.innerHTML = `<div class="empty">Couldn’t load plans.json</div>`;
  });
