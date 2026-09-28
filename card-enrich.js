/* Fill blanks only when the source listing is clear. */
(function () {
  const PATCHES = {
    castle: {
      venue: "Chicago Children's Museum",
      address: "700 E Grand Ave, Chicago, IL 60611",
      hood: "Streeterville",
      hours: "10:00 a.m. – 5:00 p.m.",
      vibe: "Museum",
      party: "Family",
      image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b4/Chicago_Children%27s_Museum_exterior_in_May_2016.jpg/1280px-Chicago_Children%27s_Museum_exterior_in_May_2016.jpg",
      note: "Kids exhibit at Navy Pier — not a concert.",
      confidence: "confirmed"
    }
  };
  function keyFromTitle(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function isPlaceholderSrc(src) {
    if (!src) return true;
    return /svg\+xml|viewBox='0%200%203%202'|data:image\/svg/i.test(src);
  }
  function mark(el, text) {
    if (!el || el.querySelector(".verify-tag")) return;
    const tag = document.createElement("span");
    tag.className = "verify-tag";
    tag.textContent = text;
    el.appendChild(tag);
  }
  function applyPatch(card, patch) {
    const copy = card.querySelector(".copy");
    if (!copy) return;
    const pills = copy.querySelector(".pills");
    if (pills) {
      const have = (cls) => [...pills.querySelectorAll(".pill")].some((p) => p.classList.contains(cls));
      if (patch.hood && !have("hood")) {
        const p = document.createElement("span");
        p.className = "pill hood";
        p.textContent = patch.hood;
        pills.insertBefore(p, pills.firstChild);
      }
      if (patch.vibe) {
        const existing = [...pills.querySelectorAll(".pill.vibe")];
        if (!existing.length) {
          const p = document.createElement("span");
          p.className = "pill vibe";
          p.textContent = patch.vibe;
          pills.appendChild(p);
        } else if (/live music/i.test(existing[0].textContent) && patch.vibe !== "Live music") {
          existing[0].textContent = patch.vibe;
          mark(existing[0], "corrected");
        }
      }
      if (patch.party) {
        const party = pills.querySelector(".pill.party");
        if (party && /couple/i.test(party.textContent) && patch.party === "Family") {
          party.textContent = patch.party;
          mark(party, "likely");
        }
      }
    }
    let meta = copy.querySelector(".meta");
    if (!meta) {
      meta = document.createElement("p");
      meta.className = "meta";
      copy.appendChild(meta);
    }
    meta.textContent = [patch.hours, patch.venue].filter(Boolean).join(" · ");
    let addr = copy.querySelector(".addr-line");
    if (!addr) {
      addr = document.createElement("p");
      addr.className = "addr-line";
      meta.insertAdjacentElement("afterend", addr);
    }
    addr.textContent = patch.address || "";
    if (patch.confidence === "confirmed") mark(addr, "confirmed");
    const note = copy.querySelector(".note") || copy.querySelector(".lede");
    if (note && patch.note && !/exhibit|children/i.test(note.textContent)) {
      note.textContent = patch.note + (note.textContent ? "  " + note.textContent : "");
    }
    const stack = card.querySelector(".bg-stack");
    if (stack && patch.image) {
      stack.innerHTML = "";
      const slide = document.createElement("div");
      slide.className = "bg-slide is-active ken-burns";
      slide.style.backgroundImage = 'url("' + patch.image + '")';
      stack.appendChild(slide);
    }
  }
  function dropPlaceholder(card) {
    const stack = card.querySelector(".bg-stack");
    if (!stack) return;
    const slides = [...stack.querySelectorAll(".bg-slide")];
    const allBad = !slides.length || slides.every((s) => isPlaceholderSrc(s.style.backgroundImage + s.getAttribute("style")));
    if (!allBad || stack.querySelector(".bg-fallback")) return;
    stack.innerHTML = "";
    const fb = document.createElement("div");
    fb.className = "bg-fallback";
    const letter = document.createElement("div");
    letter.className = "lettermark";
    const title = card.querySelector(".option-title");
    letter.textContent = ((title && title.textContent) || "?").trim().charAt(0).toUpperCase();
    fb.appendChild(letter);
    stack.appendChild(fb);
  }
  function enrich(card) {
    if (!card || card.dataset.enriched === "1") return;
    const title = keyFromTitle((card.querySelector(".option-title") || {}).textContent);
    const patchKey = Object.keys(PATCHES).find((k) => title === k || title.startsWith(k + " "));
    if (patchKey) applyPatch(card, PATCHES[patchKey]);
    else dropPlaceholder(card);
    card.dataset.enriched = "1";
  }
  const deck = document.getElementById("deck");
  if (!deck) return;
  const scan = () => document.querySelectorAll(".opt-card").forEach(enrich);
  new MutationObserver(scan).observe(deck, { childList: true, subtree: true });
  setTimeout(scan, 200);
  setTimeout(scan, 800);
})();
