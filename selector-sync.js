/* Follow the focused card: light the matching filter chips and slide them into view. */
(function () {
  const ROWS = {
    vibe: document.getElementById("cat-row"),
    hood: document.getElementById("hood-row"),
    time: document.getElementById("time-row"),
    party: document.getElementById("party-row"),
    night: document.getElementById("night-row"),
  };
  const deck = document.getElementById("deck");
  if (!deck) return;

  const reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/any |all /g, "")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function visibleLane() {
    const lanes = [...deck.querySelectorAll(".lane")];
    if (!lanes.length) return null;
    const mid = deck.scrollTop + deck.clientHeight / 2;
    let best = lanes[0];
    let bestDist = Infinity;
    lanes.forEach((lane) => {
      const c = lane.offsetTop + lane.offsetHeight / 2;
      const d = Math.abs(c - mid);
      if (d < bestDist) {
        best = lane;
        bestDist = d;
      }
    });
    return best;
  }

  function labelsFromCard(card) {
    const found = { vibe: [], hood: [], time: [], party: [], night: [] };
    if (!card) return found;
    card.querySelectorAll(".pill").forEach((p) => {
      const kind = ["vibe", "hood", "time", "party", "night"].find((k) => p.classList.contains(k));
      if (!kind) return;
      const label = p.textContent.trim();
      if (label) found[kind].push(label);
    });
    const brow = card.querySelector(".eyebrow");
    if (brow && !found.hood.length) found.hood.push(brow.textContent.trim());
    return found;
  }

  function buttonKey(btn) {
    return norm(
      btn.getAttribute("data-key") ||
        btn.getAttribute("data-hood") ||
        btn.getAttribute("data-cat") ||
        btn.getAttribute("data-time") ||
        btn.getAttribute("data-party") ||
        btn.getAttribute("data-night") ||
        btn.textContent
    );
  }

  function matches(btn, labels) {
    const bk = buttonKey(btn);
    if (!bk || bk === "all" || bk === "any" || bk === "any night" || bk === "any time" || bk === "all vibes" || bk === "all areas") {
      return false;
    }
    return labels.some((lab) => {
      const n = norm(lab);
      return n === bk || n.includes(bk) || bk.includes(n);
    });
  }

  function center(row, btn) {
    if (!row || !btn) return;
    const max = row.scrollWidth - row.clientWidth;
    if (max <= 0) return;
    const left = Math.max(0, Math.min(max, btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2));
    row.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }

  function paintRow(row, labels) {
    if (!row) return;
    const btns = [...row.querySelectorAll("button")];
    if (!btns.length) return;
    const hits = btns.filter((b) => matches(b, labels));
    const primary = hits[0] || null;
    btns.forEach((btn) => {
      const on = hits.includes(btn);
      const was = btn.classList.contains("is-on-card");
      btn.classList.toggle("is-on-card", on);
      if (primary) {
        const sel = btn === primary;
        btn.setAttribute("aria-selected", sel ? "true" : "false");
        btn.tabIndex = sel ? 0 : -1;
      }
      if (on && !was) {
        btn.classList.remove("is-pop");
        void btn.offsetWidth;
        btn.classList.add("is-pop");
      }
    });
    if (primary) center(row, primary);
  }

  let lastSig = "";
  function sync() {
    const lane = visibleLane();
    const card = lane && lane.querySelector(".opt-card.is-active");
    const labels = labelsFromCard(card);
    const sig = JSON.stringify(labels);
    if (sig === lastSig) return;
    lastSig = sig;
    paintRow(ROWS.vibe, labels.vibe);
    paintRow(ROWS.hood, labels.hood);
    paintRow(ROWS.time, labels.time);
    paintRow(ROWS.party, labels.party);
    paintRow(ROWS.night, labels.night);
  }

  let timer = null;
  function requestSync() {
    clearTimeout(timer);
    timer = setTimeout(sync, 80);
  }

  deck.addEventListener("scroll", requestSync, { passive: true });
  document.addEventListener(
    "scroll",
    (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("option-track")) {
        requestSync();
      }
    },
    true
  );
  deck.addEventListener("click", requestSync);
  const mo = new MutationObserver(requestSync);
  mo.observe(deck, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  setTimeout(sync, 400);
})();
