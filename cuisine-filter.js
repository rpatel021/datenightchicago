(function () {
  const GROUPS = [["all","All cuisines"],["italian","Italian"],["american","American"],["mexican","Mexican"],["french","French"],["steakhouse","Steak"],["pizza","Pizza"],["indian","Indian"],["asian","East / SE Asian"],["mediterranean","Med / Greek"],["seafood","Seafood"]];
  const KEYS = { italian:"italian", pasta:"italian", pizza:"pizza", american:"american", contemporary:"american", seasonal:"american", diner:"american", sandwich:"american", mexican:"mexican", french:"french", steak:"steakhouse", steakhouse:"steakhouse", indian:"indian", korean:"asian", sushi:"asian", ramen:"asian", cambodian:"asian", filipino:"asian", greek:"mediterranean", mediterranean:"mediterranean", lebanese:"mediterranean", levantine:"mediterranean", spanish:"mediterranean", seafood:"seafood" };
  let cuisine = "all";
  const row = document.getElementById("cuisine-row");
  if (!row) return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function bucket(raw) {
    const n = String(raw || "").toLowerCase();
    for (const k of Object.keys(KEYS)) { if (n.includes(k)) return KEYS[k]; }
    return "other";
  }
  function paint() {
    row.innerHTML = GROUPS.map(([id, label]) => {
      const on = id === cuisine;
      return '<button type="button" role="tab" data-cuisine="'+id+'" data-key="'+id+'" aria-selected="'+(on?"true":"false")+'" tabindex="'+(on?"0":"-1")+'">'+label+"</button>";
    }).join("");
  }
  function visibleCards(track) {
    return [...track.querySelectorAll(".opt-card")].filter((c) => !c.classList.contains("is-cuisine-hide"));
  }
  function apply(shouldSnap) {
    const track = document.querySelector('.option-track[data-track="eat"]');
    if (!track) return;
    const cards = [...track.querySelectorAll(".opt-card")];
    cards.forEach((card) => {
      const text = (card.querySelector(".copy") || card).textContent || "";
      const ok = cuisine === "all" || bucket(text) === cuisine;
      card.classList.toggle("is-cuisine-hide", !ok);
    });
    if (!shouldSnap) return;
    const keep = visibleCards(track);
    const target = keep.find((c) => c.classList.contains("is-active")) || keep[0];
    if (!target) return;
    target.scrollIntoView({ inline: "center", block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }
  row.addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-cuisine]");
    if (!btn) return;
    cuisine = btn.getAttribute("data-cuisine") || "all";
    paint();
    apply(true);
  });
  paint();
  const deck = document.getElementById("deck");
  if (deck) new MutationObserver(function () { apply(false); }).observe(deck, { childList: true, subtree: true });
  setTimeout(function () { apply(false); }, 400);
})();
