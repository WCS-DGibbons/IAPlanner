/* IASim — the cabinet canvas (SVG). Renders rails, components, terminals, wires;
 * handles placement, moving, snapping, pan/zoom, and live simulation visuals.
 */
(function () {
  "use strict";
  const IASim = window.IASim;
  const U = IASim.util;
  const S = IASim.state;
  const cat = IASim.catalog;

  const GRID = 4;
  const RAIL_H = 14;
  const SNAP_DIST = 90;

  const D = {
    svg: null,
    layers: {},
    view: { vx: -20, vy: -20, vw: 1000, vh: 620 },
    els: { wires: new Map(), terms: new Map(), leds: new Map(), comps: new Map(), readouts: new Map() },
    drag: null, // active interaction

    init(svg) {
      this.svg = svg;
      this.buildScaffold();
      this.fitView();
      this.bindEvents();
      this.render();

      U.on("project:changed", () => this.render());
      U.on("selection:changed", () => this.refreshSelection());
      U.on("sim:tick", () => this.updateSimVisuals());
      U.on("checks:changed", (issues) => this.markIssues(issues));
      window.addEventListener("resize", () => this.fitView());
    },

    buildScaffold() {
      U.clear(this.svg);
      const defs = U.svg("defs");
      defs.innerHTML =
        '<linearGradient id="railGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#c3cbd6"/><stop offset="0.5" stop-color="#9aa4b2"/>' +
        '<stop offset="1" stop-color="#6b7280"/></linearGradient>';
      this.svg.appendChild(defs);
      this.layers.rails = U.svg("g", { class: "layer-rails" });
      this.layers.wires = U.svg("g", { class: "layer-wires" });
      this.layers.comps = U.svg("g", { class: "layer-comps" });
      this.layers.overlay = U.svg("g", { class: "layer-overlay" });
      [this.layers.rails, this.layers.wires, this.layers.comps, this.layers.overlay]
        .forEach((l) => this.svg.appendChild(l));
    },

    fitView() {
      const r = this.svg.getBoundingClientRect();
      // keep current top-left & scale, just match aspect to container size
      const scale = this.view.vw / (r.width || 1000);
      this.view.vw = (r.width || 1000) * scale;
      this.view.vh = (r.height || 620) * scale;
      this.applyView();
    },
    applyView() {
      const v = this.view;
      this.svg.setAttribute("viewBox", `${v.vx} ${v.vy} ${v.vw} ${v.vh}`);
    },
    worldFromEvent(e) {
      const pt = this.svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const m = this.svg.getScreenCTM().inverse();
      const p = pt.matrixTransform(m);
      return { x: p.x, y: p.y };
    },

    // ---------------- rendering ----------------
    render() {
      ["rails", "wires", "comps", "overlay"].forEach((k) => U.clear(this.layers[k]));
      this.els = { wires: new Map(), terms: new Map(), leds: new Map(), comps: new Map(), readouts: new Map() };

      S.project.rails.forEach((r) => this.renderRail(r));
      S.project.wires.forEach((w) => this.renderWire(w));
      S.project.components.forEach((c) => this.renderComponent(c));

      this.refreshSelection();
      this.updateSimVisuals();
      this.markIssues();
    },

    markIssues(issues) {
      issues = issues || (IASim.validate && IASim.validate.last) || [];
      this.els.comps.forEach((g) => g.classList.remove("has-error", "has-warn"));
      const sev = new Map();
      issues.forEach((i) => {
        if (i.level === "info") return;
        i.comps.forEach((uid) => {
          const cur = sev.get(uid);
          if (i.level === "error" || cur !== "error") sev.set(uid, i.level === "error" ? "error" : cur || "warn");
        });
      });
      sev.forEach((lvl, uid) => {
        const g = this.els.comps.get(uid);
        if (g) g.classList.add(lvl === "error" ? "has-error" : "has-warn");
      });
    },

    renderRail(rail) {
      const g = U.svg("g", { class: "din-rail", "data-rail": rail.id });
      g.appendChild(U.svg("rect", {
        class: "rail-body", x: rail.x, y: rail.y - RAIL_H / 2,
        width: rail.length, height: RAIL_H, rx: 2,
      }));
      // slot detail
      g.appendChild(U.svg("rect", {
        class: "rail-slot", x: rail.x + 3, y: rail.y - 2, width: rail.length - 6, height: 4, rx: 1,
      }));
      g.appendChild(U.svg("text", {
        class: "rail-label", x: rail.x, y: rail.y - RAIL_H / 2 - 5, text: "DIN rail · 35mm",
      }));
      this.layers.rails.appendChild(g);
    },

    renderComponent(comp) {
      const def = cat.byId[comp.typeId];
      if (!def) return;
      const g = U.svg("g", { class: "comp", "data-comp": comp.uid, transform: `translate(${comp.x},${comp.y})` });

      const body = U.svg("rect", {
        class: "comp-body", x: 0, y: 0, width: def.w, height: def.h, rx: 4,
        fill: comp.props && comp.props.color && def.behavior === "lamp" ? "#2b2f3a" : def.color,
      });
      g.appendChild(body);

      // label
      g.appendChild(U.svg("text", {
        class: "comp-tag", x: def.w / 2, y: 15, "text-anchor": "middle", text: shortName(def),
      }));
      g.appendChild(U.svg("text", {
        class: "comp-sub", x: def.w / 2, y: def.h - 6, "text-anchor": "middle",
        text: def.isController ? comp.props.name || "CPU" : "",
      }));

      // indicator LED / lamp lens
      if (def.indicator) {
        const ind = def.indicator;
        const big = ind.big;
        const cx = big ? def.w / 2 : def.w - 9;
        const cy = big ? def.h / 2 : 9;
        const rr = big ? Math.min(def.w, def.h) / 3.2 : 4.5;
        const color = (comp.props && comp.props.color) || ind.color;
        const led = U.svg("circle", { class: "led", cx, cy, r: rr, fill: "#20262e", stroke: "#000" });
        led.dataset.color = color;
        g.appendChild(led);
        this.els.leds.set(comp.uid, led);
      }

      // analog sensor live readout
      if (def.behavior === "asensor") {
        const txt = U.svg("text", {
          class: "sensor-readout", x: def.w / 2, y: def.h / 2 + 6, "text-anchor": "middle",
          text: formatSensor(def, comp),
        });
        g.appendChild(txt);
        this.els.readouts.set(comp.uid, { el: txt, def });
      }

      // actuator graphics (piston rod / vent flap) — animate via the .on class
      if (def.actuator === "rod") {
        g.appendChild(U.svg("rect", { class: "act-cyl", x: 8, y: def.h / 2 - 7,
          width: def.w * 0.42, height: 14, rx: 3, fill: "#2b313b", stroke: "#000" }));
        g.appendChild(U.svg("rect", { class: "act-rod", x: def.w * 0.42 + 8, y: def.h / 2 - 4,
          width: def.w * 0.34, height: 8, rx: 2, fill: "#9aa4b2" }));
      } else if (def.actuator === "vent") {
        const fx = def.w * 0.18, fw = def.w * 0.64, fy = 20, fh = def.h - 34;
        g.appendChild(U.svg("rect", { class: "vent-frame", x: fx, y: fy, width: fw, height: fh, rx: 2,
          fill: "none", stroke: "#6b7280", "stroke-width": 2 }));
        g.appendChild(U.svg("rect", { class: "vent-flap", x: fx, y: fy, width: fw, height: fh / 2, rx: 2,
          fill: "#88c0d0", opacity: 0.45 }));
      }

      // terminals
      def.terminals.forEach((t) => {
        const off = cat.terminalOffset(def, t);
        const tg = U.svg("g", {
          class: "terminal", transform: `translate(${off.x},${off.y})`,
          "data-comp": comp.uid, "data-term": t.id, "data-kind": t.kind,
        });
        tg.appendChild(U.svg("circle", { class: "term-pad", r: 5 }));
        if (t.label) {
          const onTop = t.side === "top";
          const onLeft = t.side === "left";
          const lbl = U.svg("text", {
            class: "term-lbl", x: onLeft ? 9 : onTop || t.side === "bottom" ? 0 : -9,
            y: onTop ? -8 : t.side === "bottom" ? 14 : 3,
            "text-anchor": onLeft ? "start" : t.side === "right" ? "end" : "middle",
            text: t.label,
          });
          tg.appendChild(lbl);
        }
        g.appendChild(tg);
        this.els.terms.set(comp.uid + "::" + t.id, tg);
      });

      this.layers.comps.appendChild(g);
      this.els.comps.set(comp.uid, g);
    },

    terminalPos(compUid, termId) {
      const comp = S.getComponent(compUid);
      if (!comp) return { x: 0, y: 0 };
      const def = cat.byId[comp.typeId];
      const t = def.terminals.find((x) => x.id === termId);
      const off = cat.terminalOffset(def, t);
      return { x: comp.x + off.x, y: comp.y + off.y };
    },

    renderWire(w) {
      const a = this.terminalPos(w.a.comp, w.a.term);
      const b = this.terminalPos(w.b.comp, w.b.term);
      const d = routePath(a, b);
      const g = U.svg("g", { class: "wire-group", "data-wire": w.id });
      g.appendChild(U.svg("path", { class: "wire-hit", d }));
      const path = U.svg("path", { class: "wire", d, stroke: w.color });
      g.appendChild(path);
      this.layers.wires.appendChild(g);
      this.els.wires.set(w.id, { path, group: g });
    },

    // ---------------- selection ----------------
    refreshSelection() {
      this.svg.querySelectorAll(".selected").forEach((n) => n.classList.remove("selected"));
      const sel = S.selection;
      if (!sel) return;
      let node = null;
      if (sel.kind === "comp") node = this.els.comps.get(sel.id);
      else if (sel.kind === "rail") node = this.layers.rails.querySelector(`[data-rail="${sel.id}"]`);
      else if (sel.kind === "wire") { const w = this.els.wires.get(sel.id); if (w) node = w.path; }
      if (node) node.classList.add("selected");
    },

    // ---------------- live sim visuals ----------------
    updateSimVisuals() {
      const L = IASim.engine.last;
      const EMPTY = new Set();
      const hotW = L.hotWire || EMPTY, liveW = L.liveWire || EMPTY;
      const hotT = L.hotTerm || EMPTY, liveT = L.liveTerm || EMPTY;
      this.els.wires.forEach((w, id) => {
        w.path.classList.toggle("hot", hotW.has(id));
        w.path.classList.toggle("live", liveW.has(id));
      });
      this.els.terms.forEach((tg, key) => {
        tg.classList.toggle("hot", hotT.has(key));
        tg.classList.toggle("live", liveT.has(key));
      });
      this.els.comps.forEach((g, uid) => g.classList.toggle("on", !!(L.on && L.on.get(uid))));
      this.els.leds.forEach((led, uid) => {
        const lit = L.on && L.on.get(uid);
        if (lit) {
          led.setAttribute("fill", led.dataset.color);
          led.style.color = led.dataset.color;
          led.classList.add("indicator-on");
        } else {
          led.setAttribute("fill", "#20262e");
          led.classList.remove("indicator-on");
        }
      });
    },

    // update a sensor's on-canvas readout without a full re-render (used by the slider)
    setReadout(uid) {
      const r = this.els.readouts.get(uid);
      const comp = S.getComponent(uid);
      if (r && comp) r.el.textContent = formatSensor(r.def, comp);
    },

    // ---------------- interaction ----------------
    bindEvents() {
      const svg = this.svg;
      svg.addEventListener("pointerdown", (e) => this.onDown(e));
      window.addEventListener("pointermove", (e) => this.onMove(e));
      window.addEventListener("pointerup", (e) => this.onUp(e));
      svg.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
      // right-click cancels an in-progress cable
      svg.addEventListener("contextmenu", (e) => {
        if (IASim.wiring.pending) { e.preventDefault(); IASim.wiring.cancel(); }
      });
    },

    onDown(e) {
      const w = this.worldFromEvent(e);
      const termEl = e.target.closest(".terminal");
      const compEl = e.target.closest(".comp");
      const railEl = e.target.closest(".din-rail");
      const wireEl = e.target.closest(".wire-group");

      // WIRE MODE: clicking a terminal draws cable; clicking elsewhere cancels
      if (S.mode === "wire") {
        if (termEl) {
          IASim.wiring.onTerminalDown(termEl.dataset.comp, termEl.dataset.term);
          e.preventDefault();
          return;
        }
        if (IASim.wiring.pending) { IASim.wiring.cancel(); return; }
        // otherwise fall through so the user can still pan / select in wire mode
      }

      if (compEl) {
        const uid = compEl.dataset.comp;
        S.select("comp", uid);
        const comp = S.getComponent(uid);
        this.drag = { type: "comp", uid, dx: w.x - comp.x, dy: w.y - comp.y, moved: false };
        e.preventDefault();
        return;
      }
      if (wireEl) { S.select("wire", wireEl.dataset.wire); return; }
      if (railEl) {
        const id = railEl.dataset.rail;
        S.select("rail", id);
        const rail = S.getRail(id);
        this.drag = { type: "rail", id, dy: w.y - rail.y, members: this.railMembers(id) };
        e.preventDefault();
        return;
      }
      // background -> deselect + pan
      S.select(null);
      this.drag = { type: "pan", sx: e.clientX, sy: e.clientY, vx: this.view.vx, vy: this.view.vy };
    },

    onMove(e) {
      if (S.mode === "wire") IASim.wiring.onPointerMove(this.worldFromEvent(e));
      if (!this.drag) return;
      const w = this.worldFromEvent(e);
      const dr = this.drag;

      if (dr.type === "pan") {
        const m = this.svg.getScreenCTM();
        const scale = this.view.vw / this.svg.getBoundingClientRect().width;
        this.view.vx = dr.vx - (e.clientX - dr.sx) * scale;
        this.view.vy = dr.vy - (e.clientY - dr.sy) * scale;
        this.applyView();
        return;
      }

      if (dr.type === "comp") {
        const comp = S.getComponent(dr.uid);
        const def = cat.byId[comp.typeId];
        let nx = U.snap(w.x - dr.dx, GRID);
        let ny = w.y - dr.dy;
        if (def.railMount) {
          const rail = this.nearestRail(ny + def.h / 2);
          if (rail) { comp.railId = rail.id; ny = rail.y - def.h / 2; }
        }
        comp.x = nx; comp.y = ny; dr.moved = true;
        this.moveComponentDom(comp);
        return;
      }

      if (dr.type === "rail") {
        const rail = S.getRail(dr.id);
        const ny = U.snap(w.y - dr.dy, GRID);
        const ddy = ny - rail.y;
        rail.y = ny;
        dr.members.forEach((uid) => { const c = S.getComponent(uid); if (c) c.y += ddy; });
        this.render();
        this.drag.members = dr.members;
        return;
      }
    },

    onUp(e) {
      if (S.mode === "wire") IASim.wiring.onPointerUp(e);
      if (this.drag && (this.drag.type === "comp" || this.drag.type === "rail")) U.emit("project:dirty");
      this.drag = null;
    },

    onWheel(e) {
      e.preventDefault();
      const before = this.worldFromEvent(e);
      const f = e.deltaY < 0 ? 0.88 : 1.14;
      this.view.vw = U.clamp(this.view.vw * f, 120, 6000);
      this.view.vh = U.clamp(this.view.vh * f, 80, 4000);
      this.applyView();
      const after = this.worldFromEvent(e);
      this.view.vx += before.x - after.x;
      this.view.vy += before.y - after.y;
      this.applyView();
    },

    // move only the DOM of one component + its wires (cheap, used while dragging)
    moveComponentDom(comp) {
      const g = this.els.comps.get(comp.uid);
      if (g) g.setAttribute("transform", `translate(${comp.x},${comp.y})`);
      S.project.wires.forEach((wr) => {
        if (wr.a.comp === comp.uid || wr.b.comp === comp.uid) {
          const we = this.els.wires.get(wr.id);
          if (!we) return;
          const a = this.terminalPos(wr.a.comp, wr.a.term);
          const b = this.terminalPos(wr.b.comp, wr.b.term);
          const d = routePath(a, b);
          we.path.setAttribute("d", d);
          we.group.querySelector(".wire-hit").setAttribute("d", d);
        }
      });
    },

    nearestRail(y) {
      let best = null, bd = SNAP_DIST;
      S.project.rails.forEach((r) => { const d = Math.abs(r.y - y); if (d < bd) { bd = d; best = r; } });
      return best;
    },
    railMembers(railId) {
      return S.project.components.filter((c) => c.railId === railId).map((c) => c.uid);
    },

    // place component from palette at screen coords
    placeAt(typeId, clientX, clientY) {
      const pt = this.svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
      const w = pt.matrixTransform(this.svg.getScreenCTM().inverse());
      const def = cat.byId[typeId];
      let x = U.snap(w.x - def.w / 2, GRID);
      let y = w.y - def.h / 2;
      let railId = null;
      if (def.railMount) {
        const rail = this.nearestRail(y + def.h / 2) || S.project.rails[0];
        if (rail) { railId = rail.id; y = rail.y - def.h / 2; }
      }
      const comp = S.addComponent(typeId, x, y, railId);
      S.select("comp", comp.uid);
      return comp;
    },
  };

  function shortName(def) {
    return def.name.replace(/\s*\(.*\)/, "").split(" ").slice(0, 2).join(" ");
  }

  function formatSensor(def, comp) {
    const v = comp.state && typeof comp.state.value === "number" ? comp.state.value : 0;
    const d = (def.props && def.props.decimals) || 0;
    const u = (def.props && def.props.unit) || "";
    return v.toFixed(d) + " " + u;
  }

  // orthogonal-ish cable routing with a gentle curve
  function routePath(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const midX = a.x + dx / 2;
    if (Math.abs(dy) < 8) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    // route out, across, in — like real wire ducting
    const r = 8;
    const dir = dy > 0 ? 1 : -1;
    return `M ${a.x} ${a.y}
            C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`.replace(/\s+/g, " ");
  }

  IASim.designer = D;
})();
