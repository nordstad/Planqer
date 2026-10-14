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

  load();
})();
