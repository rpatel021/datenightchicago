/* Couple vs Group icons, time + who on one row, vibe wraps. */
(function () {
  function iconCouple() {
    return '<svg viewBox="0 0 32 20" width="28" height="18" aria-hidden="true"><circle cx="10" cy="7" r="3.2" fill="currentColor"/><path d="M4 17c.4-4 3-6 6-6s5.6 2 6 6" fill="currentColor"/><circle cx="22" cy="7" r="3.2" fill="currentColor"/><path d="M16 17c.4-4 3-6 6-6s5.6 2 6 6" fill="currentColor"/></svg>';
  }
  function iconGroup() {
    return '<svg viewBox="0 0 36 20" width="32" height="18" aria-hidden="true"><circle cx="18" cy="6.2" r="3" fill="currentColor"/><path d="M12.5 17c.3-3.6 2.6-5.4 5.5-5.4s5.2 1.8 5.5 5.4" fill="currentColor"/><circle cx="8" cy="7.2" r="2.6" fill="currentColor" opacity=".85"/><path d="M3 17c.3-3.2 2.2-4.8 4.8-4.8 1.6 0 2.9.6 3.8 1.6" fill="currentColor" opacity=".85"/><circle cx="28" cy="7.2" r="2.6" fill="currentColor" opacity=".85"/><path d="M25.2 13.8c.9-1 2.2-1.6 3.8-1.6 2.6 0 4.5 1.6 4.8 4.8" fill="currentColor" opacity=".85"/></svg>';
  }
  function restyleParty() {
    const row = document.getElementById("party-row");
    if (!row || row.dataset.who === "1") return;
    const selected = row.querySelector('button[aria-selected="true"]');
    const cur = selected && selected.getAttribute("data-party");
    const mode = cur === "couple" ? "couple" : "family";
    row.innerHTML =
      '<button type="button" role="tab" class="who-btn" data-party="couple" data-key="couple" aria-selected="' +
      (mode === "couple" ? "true" : "false") +
      '" tabindex="' + (mode === "couple" ? "0" : "-1") + '">' +
      iconCouple() + "<span>Couple</span></button>" +
      '<button type="button" role="tab" class="who-btn" data-party="family" data-key="family" aria-selected="' +
      (mode === "family" ? "true" : "false") +
      '" tabindex="' + (mode === "family" ? "0" : "-1") + '">' +
      iconGroup() + "<span>Group</span></button>";
    row.dataset.who = "1";
  }
  function stackRows() {
    const cat = document.getElementById("cat-row");
    if (cat) cat.classList.add("two-row");
    const time = document.getElementById("time-row");
    const party = document.getElementById("party-row");
    if (!time || !party) return;
    const timeBlock = time.closest(".toggle-block");
    const partyBlock = party.closest(".toggle-block");
    if (!timeBlock || !partyBlock || timeBlock.parentElement.classList.contains("row-who-time")) return;
    const wrap = document.createElement("div");
    wrap.className = "row-who-time";
    timeBlock.parentNode.insertBefore(wrap, timeBlock);
    wrap.appendChild(timeBlock);
    wrap.appendChild(partyBlock);
  }
  function boot() { restyleParty(); stackRows(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
