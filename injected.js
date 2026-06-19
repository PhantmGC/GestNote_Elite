/*
 * injected.js
 */
(function () {
  "use strict";

  var SOURCE = "ugn-page";       // doit correspondre à ce qu'attend content.js
  var FROM_CONTENT = "ugn-content";

  function parseValues(str) {
    if (!str) return null;
    var m = str.match(/setValues\(\s*\[([^\]]*)\]\s*\)/);
    if (!m) return null;
    return m[1]
      .split(",")
      .map(function (s) { return parseFloat(String(s).trim()); })
      .filter(function (n) { return !isNaN(n); });
  }

  function extractOne(el) {
    var target = el.wrappedJSObject || el;
    var fn = target.fnToCall;
    if (typeof fn !== "function") return null;
    var values = parseValues(fn.toString());
    if (!values || values.length === 0) {
      var originalEval = window.eval;
      var captured = null;
      window.eval = function (code) { captured = code; return originalEval(code); };
      try { fn.call(target); } catch (e) { /* ignore */ }
      window.eval = originalEval;
      values = parseValues(captured);
    }

    if (!values || values.length === 0) return null;
    return { helpId: el.id, noteId: el.id.replace(/_help$/, ""), values: values };
  }

  function extractAll() {
    var results = [];
    var helpDivs = document.querySelectorAll('[id^="note_"][id$="_help"]');
    helpDivs.forEach(function (el) {
      try {
        var entry = extractOne(el);
        if (entry) results.push(entry);
      } catch (e) { /* on ignore les éléments problématiques */ }
    });
    return results;
  }

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

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    var d = event.data;
    if (!d || d.source !== FROM_CONTENT) return;
    if (d.type === "RESCAN") run(0);
  });

  run(0);
})();
