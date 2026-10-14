/* Anonymous, cookie-free page counting for this documentation, through Umami
   Cloud. The app's own rules live in frontend/src/utils/analytics.js; this
   repeats them for the docs and is held to them by
   frontend/src/utils/docsAnalytics.test.js. Pageviews only: every named event
   is cancelled. The opt-out flag is the one the demo uses (same origin). */
(function () {
  var KEY = "planqer.analytics.optout";
  var ID = "325f5fce-eb47-46fb-bad7-da1137224c33";

  function optedOut() {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function browserSaysNo() {
    var dnt = navigator.doNotTrack || window.doNotTrack;
    return dnt === "1" || dnt === "yes" || navigator.globalPrivacyControl === true;
  }
  function enabled() { return !optedOut() && !browserSaysNo(); }
  function script() { return document.head.querySelector("script[data-website-id]"); }

  window.planqerDocsBeforeSend = function (type, payload) {
    return enabled() && type === "event" && !payload.name ? payload : false;
  };

  function load() {
    if (!enabled() || script()) return;
    var el = document.createElement("script");
    el.defer = true;
    el.src = "https://cloud.umami.is/script.js";
    el.dataset.websiteId = ID;
    el.dataset.domains = "nordstad.github.io";
    el.dataset.doNotTrack = "true";
    el.dataset.excludeSearch = "true";
    el.dataset.excludeHash = "true";
    el.dataset.beforeSend = "planqerDocsBeforeSend";
    document.head.appendChild(el);
  }

  // The switch on the privacy page. Pages arrive without a reload (instant
  // navigation), so it is looked for again after every page.
  function refresh() {
    var toggle = document.querySelector("[data-analytics-toggle]");
    var status = document.querySelector("[data-analytics-status]");
    if (!toggle) return;
    var blocked = browserSaysNo();
    toggle.disabled = blocked;
    toggle.textContent = enabled() ? "Turn analytics off" : "Turn analytics on";
    if (status) {
      status.textContent = blocked
        ? "Analytics is off because your browser asks not to be tracked."
        : enabled() ? "Analytics is on." : "Analytics is off.";
    }
  }

  document.addEventListener("click", function (event) {
    var toggle = event.target.closest && event.target.closest("[data-analytics-toggle]");
    if (!toggle || browserSaysNo()) return;
    try {
      if (optedOut()) localStorage.removeItem(KEY); else localStorage.setItem(KEY, "1");
    } catch (e) { /* the choice then lasts until reload */ }
    if (enabled()) load(); else if (script()) script().remove();
    refresh();
  });

  load();
  refresh();
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(refresh);
})();
