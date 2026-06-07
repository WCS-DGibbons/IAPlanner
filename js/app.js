/* IASim — bootstrap: wire modules together, restore autosave, keyboard shortcuts. */
(function () {
  "use strict";
  const IASim = window.IASim;
  const U = IASim.util;
  const S = IASim.state;
  const eng = IASim.engine;

  function init() {
    IASim.designer.init(document.getElementById("stage"));
    IASim.ui.init();
    IASim.ui.setMode("select");

    // restore previous session if present
    S.restore();

    // autosave (debounced)
    let t = null;
    const save = () => { clearTimeout(t); t = setTimeout(() => S.autosave(), 400); };
    U.on("project:changed", save);
    U.on("project:dirty", save);

    bindKeys();
    IASim.ui.setStatus("Ready. Drag a component from the library onto a DIN rail, then wire it up and press ▶ Run.");
  }

  function typing(e) {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  }

  function bindKeys() {
    window.addEventListener("keydown", (e) => {
      if (typing(e)) {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      switch (e.key) {
        case "v": case "V": IASim.ui.setMode("select"); break;
        case "w": case "W": IASim.ui.setMode("wire"); break;
        case "Delete": case "Backspace": IASim.ui.deleteSelection(); e.preventDefault(); break;
        case " ": eng.toggle(); e.preventDefault(); break;
        case "Escape":
          IASim.wiring.cancel();
          S.select(null);
          break;
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
