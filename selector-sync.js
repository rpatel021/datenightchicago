/* Follow the focused card across Eat / Then / Backup. */
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

  const HOOD_ALIAS = {
    "roscoe village": "lakeview",
    wrigleyville: "lakeview",
    "logan square": "logan square",
    logan: "logan square",
    "humboldt park": "logan square",
    humboldt: "logan square",
    "river north": "near north",
    streeterville: "near north",
    "old town": "old town",
    "south loop": "south loop",
    "museum campus": "loop",
    andersonville: "uptown",
  };

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/tonight/g, "")
      .replace(/any |all /g, "")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function visibleLane() {
    const lanes = [...deck.querySelectorAll(".lane")];
    if (!lanes.length) return null;
    const mid = deck.scrollTop + deck.clientHeight * 0.45;
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

    const brow = (card.querySelector(".eyebrow") || {}).textContent || "";
    brow.split(/[·•|]/).forEach((part) => {
      const bit = part.trim();
      if (!bit) return;
      if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(bit) || /\btue|wed|thu|fri|sat|sun|mon|tonight/i.test(bit)) {
        if (!found.night.length) found.night.push(bit);
      } else if (!found.hood.length) {
        found.hood.push(bit);
      }
    });

    found.hood = found.hood.map((h) => {
      const n = norm(h);
      return HOOD_ALIAS[n] ? HOOD_ALIAS[n] : h;
    });

    return found;
  }

  function isAllChip(btn) {
    const t = norm(btn.textContent);
    const k = norm(btn.getAttribute("data-key") || "");
    return (
      t === "all" ||
      t === "any" ||
      t === "all vibes" ||
      t === "all areas" ||
      t === "any time" ||
      t === "any night" ||
      k === "all" ||
      k === ""
    );
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
    if (isAllChip(btn)) return false;
    const bk = buttonKey(btn);
    if (!bk) return false;
    return labels.some((lab) => {
      const n = norm(lab);
      if (!n) return false;
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

  function pop(btn) {
    btn.classList.remove("is-pop");
    void btn.offsetWidth;
    btn.classList.add("is-pop");
  }

  function paintRow(row, labels) {
    if (!row) return;
    const btns = [...row.querySelectorAll("button")];
    if (!btns.length) return;
    const hits = labels.length ? btns.filter((b) => matches(b, labels)) : [];
    const fallback = btns.find(isAllChip) || null;
    const primary = hits[0] || fallback;
    btns.forEach((btn) => {
      const on = hits.includes(btn);
      const sel = btn === primary;
      const wasSel = btn.getAttribute("aria-selected") === "true";
      btn.classList.toggle("is-on-card", on);
      btn.setAttribute("aria-selected", sel ? "true" : "false");
      btn.tabIndex = sel ? 0 : -1;
      if (sel && !wasSel) pop(btn);
    });
    if (primary) center(row, primary);
  }

  let lastSig = "";
  function sync() {
    const lane = visibleLane();
    const card = lane && lane.querySelector(".opt-card.is-active");
    const labels = labelsFromCard(card);
    const title = lane && lane.getAttribute("data-lane");
    const sig = title + JSON.stringify(labels);
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
    timer = setTimeout(sync, 60);
  }

  deck.addEventListener("scroll", requestSync, { passive: true });
  document.addEventListener(
    "scroll",
    (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains("option-track")) requestSync();
    },
    true
  );
  deck.addEventListener("click", requestSync);
  document.addEventListener("touchend", () => requestSync(), { passive: true });
  const mo = new MutationObserver(requestSync);
  mo.observe(deck, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  setTimeout(sync, 300);
  setTimeout(sync, 1200);
})();
