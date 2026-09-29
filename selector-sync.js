(function () {
  const deck = document.getElementById("deck");
  if (!deck) return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ROWS = {
    vibe: document.getElementById("cat-row"),
    cuisine: document.getElementById("cuisine-row"),
    hood: document.getElementById("hood-row"),
    time: document.getElementById("time-row"),
    party: document.getElementById("party-row"),
    night: document.getElementById("night-row")
  };
  const HOOD_ALIAS = { "roscoe village":"lakeview", wrigleyville:"lakeview", "river north":"near north", streeterville:"near north", "navy pier":"near north", andersonville:"uptown", "lincoln park":"lincoln park" };
  const VIBE_HINTS = [["comedy","comedy"],["improv","comedy"],["jazz","jazz_blues"],["theater","theater"],["theatre","theater"],["musical","theater"],["museum","museum"],["magic","magic"]];
  const CUISINE_HINTS = [["italian","italian"],["pasta","italian"],["pizza","pizza"],["mexican","mexican"],["french","french"],["steak","steakhouse"],["indian","indian"],["sushi","asian"],["ramen","asian"],["korean","asian"],["greek","mediterranean"],["mediterranean","mediterranean"],["seafood","seafood"],["american","american"]];
  let lastLaneEl = null;
  function raw(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function norm(s) { return raw(s).toLowerCase().replace(/&/g, "and").replace(/tonight/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
  function remember(el) { const lane = el && el.closest && el.closest(".lane"); if (lane) lastLaneEl = lane; }
  function visibleLane() {
    const lanes = [...deck.querySelectorAll(".lane")];
    if (!lanes.length) return lastLaneEl;
    const mid = deck.getBoundingClientRect().top + deck.clientHeight * 0.42;
    let best = lastLaneEl && lanes.includes(lastLaneEl) ? lastLaneEl : lanes[0], bestDist = Infinity;
    lanes.forEach((lane) => { const box = lane.getBoundingClientRect(); const d = Math.abs(box.top + box.height / 2 - mid); if (d < bestDist) { best = lane; bestDist = d; } });
    lastLaneEl = best; return best;
  }
  function labelsFromCard(card) {
    const found = { vibe: [], cuisine: [], hood: [], time: [], party: [], night: [] };
    if (!card) return found;
    card.querySelectorAll(".pill").forEach((p) => {
      const kind = Object.keys(found).find((k) => p.classList.contains(k));
      const label = raw(p.textContent);
      if (kind && label) found[kind].push(label);
    });
    const brow = raw((card.querySelector(".eyebrow") || {}).textContent);
    brow.split(/[·•|,]/).forEach((part) => {
      const bit = raw(part);
      if (!bit) return;
      if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(bit) || /\b(tue|wed|thu|fri|sat|sun|mon|tonight)\b/i.test(bit)) {
        if (!found.night.length) found.night.push(bit);
      } else if (!found.hood.length && !/tba|confirm|plan b/i.test(bit)) found.hood.push(bit);
    });
    found.hood = found.hood.map((h) => HOOD_ALIAS[norm(h)] || h);
    const blob = norm((card.querySelector(".copy") || card).textContent);
    VIBE_HINTS.forEach(([needle, id]) => { if (blob.includes(needle)) found.vibe.push(id); });
    CUISINE_HINTS.forEach(([needle, id]) => { if (blob.includes(needle)) found.cuisine.push(id); });
    found.party = found.party.map((x) => { const n = norm(x); return n === "friends" || n === "group" ? "family" : x; });
    return found;
  }
  function isAllChip(btn) {
    const t = norm(btn.textContent);
    const k = String(btn.getAttribute("data-key") || "").toLowerCase();
    return t === "all" || t === "any" || t.indexOf("all ") === 0 || t.indexOf("any ") === 0 || k === "all" || k === "";
  }
  function buttonKey(btn) {
    return norm(btn.getAttribute("data-key") || btn.getAttribute("data-hood") || btn.getAttribute("data-cat") || btn.getAttribute("data-time") || btn.getAttribute("data-party") || btn.getAttribute("data-night") || btn.getAttribute("data-cuisine") || btn.textContent);
  }
  function matches(btn, labels) {
    if (isAllChip(btn)) return false;
    const bk = buttonKey(btn);
    if (!bk) return false;
    return labels.some((lab) => { const n = norm(lab); return n && (n === bk || n.includes(bk) || bk.includes(n)); });
  }
  function ensureGlider(row) {
    if (!row) return null;
    let g = row.querySelector(":scope > .pill-glider");
    if (!g) { g = document.createElement("span"); g.className = "pill-glider"; g.setAttribute("aria-hidden", "true"); row.insertBefore(g, row.firstChild); }
    return g;
  }
  function moveGlider(row, btn) {
    const g = ensureGlider(row);
    if (!g || !btn) return;
    g.style.width = btn.offsetWidth + "px"; g.style.height = btn.offsetHeight + "px";
    g.style.transform = "translate(" + btn.offsetLeft + "px," + btn.offsetTop + "px)";
    g.classList.add("is-on");
  }
  function center(row, btn) {
    if (!row || !btn) return;
    const max = row.scrollWidth - row.clientWidth;
    if (max > 0) {
      const left = Math.max(0, Math.min(max, btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2));
      row.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
    }
    requestAnimationFrame(function () { moveGlider(row, btn); });
  }
  function paintRow(row, labels) {
    if (!row) return;
    const btns = [...row.querySelectorAll("button")];
    if (!btns.length) return;
    const selected = btns.find((b) => b.getAttribute("aria-selected") === "true");
    const allOn = !selected || isAllChip(selected);
    row.classList.toggle("is-all-plan", allOn);
    const hits = labels.length ? btns.filter((b) => matches(b, labels)) : [];
    btns.forEach((btn) => btn.classList.toggle("is-looking", hits.includes(btn)));
    center(row, allOn ? (hits[0] || selected) : selected);
  }
  let lastSig = "";
  function sync() {
    const lane = visibleLane();
    const card = lane && lane.querySelector(".opt-card.is-active");
    const labels = labelsFromCard(card);
    const sig = (lane && lane.getAttribute("data-lane")) + JSON.stringify(labels);
    if (sig === lastSig) return;
    lastSig = sig;
    Object.keys(ROWS).forEach((kind) => paintRow(ROWS[kind], labels[kind] || []));
  }
  let timer = null;
  function requestSync() { clearTimeout(timer); timer = setTimeout(sync, 40); }
  deck.addEventListener("scroll", requestSync, { passive: true });
  document.addEventListener("scroll", function (e) {
    const t = e.target;
    if (t && t.classList && t.classList.contains("option-track")) { remember(t); requestSync(); }
  }, true);
  document.addEventListener("click", function (e) { remember(e.target); lastSig = ""; requestSync(); });
  document.addEventListener("touchend", function (e) { remember(e.target); lastSig = ""; requestSync(); }, { passive: true });
  deck.addEventListener("nightout:focus", function () { lastSig = ""; requestSync(); });
  new MutationObserver(requestSync).observe(deck, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-selected"] });
  setTimeout(sync, 250);
  setTimeout(sync, 900);
})();
