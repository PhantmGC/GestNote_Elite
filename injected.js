/*
 * injected.js
 */
(function () {
  "use strict";

  var SOURCE = "ugn-injected";   // signature de nos messages (page -> content)
  var FROM_CONTENT = "ugn-content";

  function parseValues(str) {
    // capture le contenu de .setValues([ ... ])
    var m = str.match(/setValues\(\s*\[([^\]]*)\]\s*\)/);
    if (!m) return null;
    return m[1]
      .split(",")
      .map(function (s) { return parseFloat(String(s).trim()); })
      .filter(function (n) { return !isNaN(n); });
  }

  function parseNote(str) {
    var m = str.match(/setNote\(\s*([0-9]+(?:[.,][0-9]+)?)\s*\)/);
    return m ? parseFloat(m[1].replace(",", ".")) : null;
  }

  function extractAll() {
    var results = [];
    var helpDivs = document.querySelectorAll('[id$="_help"]');

    helpDivs.forEach(function (el) {
      try {
        var fn = el.fnToCall;            // <-- accessible UNIQUEMENT dans le contexte page
        if (typeof fn !== "function") return;

        var str = fn.toString();
        var values = parseValues(str);
        if (!values || values.length === 0) return;

        results.push({
          helpId: el.id,
          noteId: el.id.replace(/_help$/, ""),  // "note_33052_help" -> "note_33052"
          values: values,
          note: parseNote(str)
        });
      } catch (e) { /* on ignore les éléments problématiques */ }
    });

    return results;
  }

  // Les fnToCall ne sont peut-être pas encore posées au tout premier passage :
  // on réessaie quelques fois.
  function run(attempt) {
    var data = extractAll();
    if (data.length > 0 || attempt >= 12) {
      window.postMessage(
        { source: SOURCE, type: "NOTES_DATA", payload: data },
        window.location.origin
      );
    } else {
      setTimeout(function () { run(attempt + 1); }, 400);
    }
  }

  // Permet au content script de redemander un scan (ex: tableau rechargé en AJAX)
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    var d = event.data;
    if (!d || d.source !== FROM_CONTENT) return;
    if (d.type === "RESCAN") run(0);
  });

  run(0);
})();
