/* Load the last known-good planner, then selector-sync.js follows in index.html. */
(function () {
  var s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/gh/rpatel021/datenightchicago@e9384b2f44560db1a452b709696b3236c867f7cc/app.js";
  s.defer = false;
  s.onload = function () {};
  document.head.appendChild(s);
})();
