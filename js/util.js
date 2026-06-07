/* IASim — utility helpers. Establishes the global namespace. */
(function () {
  "use strict";
  const IASim = (window.IASim = window.IASim || {});

  const SVGNS = "http://www.w3.org/2000/svg";

  const U = {
    SVGNS,
    /* Create an SVG element with attributes and optional children. */
    svg(tag, attrs, children) {
      const el = document.createElementNS(SVGNS, tag);
      if (attrs) for (const k in attrs) {
        if (attrs[k] === null || attrs[k] === undefined) continue;
        if (k === "text") el.textContent = attrs[k];
        else el.setAttribute(k, attrs[k]);
      }
      if (children) for (const c of [].concat(children)) if (c) el.appendChild(c);
      return el;
    },
    /* Create an HTML element. attrs supports class, text, html, and on* handlers. */
    el(tag, attrs, children) {
      const e = document.createElement(tag);
      if (attrs) for (const k in attrs) {
        if (k === "class") e.className = attrs[k];
        else if (k === "text") e.textContent = attrs[k];
        else if (k === "html") e.innerHTML = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function")
          e.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
      }
      if (children) for (const c of [].concat(children)) if (c != null)
        e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      return e;
    },
    clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; },
    uid(prefix) {
      U._n = (U._n || 0) + 1;
      return (prefix || "id") + "_" + U._n.toString(36) + "_" + Math.floor(performance.now()).toString(36);
    },
    clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
    snap(v, grid) { return Math.round(v / grid) * grid; },
    deepCopy(o) { return JSON.parse(JSON.stringify(o)); },
    truthy(v) { return v === true || v === 1 || (typeof v === "number" && v !== 0); },
  };

  /* Minimal event bus so modules stay decoupled. */
  const listeners = {};
  U.on = function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); };
  U.emit = function (evt, payload) { (listeners[evt] || []).forEach((fn) => fn(payload)); };

  IASim.util = U;
})();
