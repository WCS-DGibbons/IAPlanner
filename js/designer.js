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
    fastRouting: false, // skip obstacle avoidance while dragging (see routePath)

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
      if (def.behavior === "asensor" || def.behavior === "mbsensor") {
        const txt = U.svg("text", {
          class: "sensor-readout", x: def.w / 2, y: def.h / 2 + 6, "text-anchor": "middle",
        });
        fitReadout(txt, def, formatSensor(def, comp));
        g.appendChild(txt);
        let addrEl = null;
        if (def.behavior === "mbsensor") {
          // slave address sits on its own line so it never shrinks the reading
          addrEl = U.svg("text", {
            class: "bus-addr", x: def.w / 2, y: def.h / 2 - 8, "text-anchor": "middle",
            text: formatAddr(comp),
          });
          g.appendChild(addrEl);
        }
        this.els.readouts.set(comp.uid, { el: txt, def, addrEl });
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

    // position plus the edge the terminal sits on and the part it belongs to —
    // the router needs both to leave the terminal squarely and to know which
    // components it is allowed to run across
    terminalAnchor(compUid, termId) {
      const comp = S.getComponent(compUid);
      if (!comp) return { x: 0, y: 0, side: null, comp: null };
      const def = cat.byId[comp.typeId];
      const t = def.terminals.find((x) => x.id === termId);
      if (!t) return { x: comp.x, y: comp.y, side: null, comp: compUid };
      const off = cat.terminalOffset(def, t);
      return { x: comp.x + off.x, y: comp.y + off.y, side: t.side, comp: compUid };
    },

    // route to a loose end (the cursor, while a cable is being drawn)
    previewPath(a, p) {
      return routePath(a, { x: p.x, y: p.y, side: null, comp: null });
    },

    renderWire(w) {
      const a = this.terminalAnchor(w.a.comp, w.a.term);
      const b = this.terminalAnchor(w.b.comp, w.b.term);
      const d = routePath(a, b);
      const g = U.svg("g", { class: "wire-group", "data-wire": w.id });
      g.appendChild(U.svg("path", { class: "wire-hit", d }));
      const path = U.svg("path", { class: "wire", d, stroke: w.color || "#c0c5ce" });
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
      if (!r || !comp) return;
      fitReadout(r.el, r.def, formatSensor(r.def, comp));
      if (r.addrEl) r.addrEl.textContent = formatAddr(comp);
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
        this.fastRouting = true;
        e.preventDefault();
        return;
      }
      if (wireEl) { S.select("wire", wireEl.dataset.wire); return; }
      if (railEl) {
        const id = railEl.dataset.rail;
        S.select("rail", id);
        const rail = S.getRail(id);
        this.drag = { type: "rail", id, dy: w.y - rail.y, members: this.railMembers(id) };
        this.fastRouting = true;
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
      const settled = this.drag && (this.drag.type === "comp" || this.drag.type === "rail");
      this.drag = null;
      if (this.fastRouting) {
        // the drag is over — re-route the cables properly, around the parts
        this.fastRouting = false;
        this.rerouteWires();
      }
      if (settled) U.emit("project:dirty");
    },

    // recompute every cable path in place, without a full re-render
    rerouteWires() {
      S.project.wires.forEach((wr) => {
        const we = this.els.wires.get(wr.id);
        if (!we) return;
        const d = routePath(this.terminalAnchor(wr.a.comp, wr.a.term),
                            this.terminalAnchor(wr.b.comp, wr.b.term));
        we.path.setAttribute("d", d);
        we.group.querySelector(".wire-hit").setAttribute("d", d);
      });
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
          const a = this.terminalAnchor(wr.a.comp, wr.a.term);
          const b = this.terminalAnchor(wr.b.comp, wr.b.term);
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
    if (def.behavior === "mbsensor") {
      const r = (def.registers && def.registers[0]) || {};
      const vals = (comp.state && comp.state.values) || [];
      const v = typeof vals[0] === "number" ? vals[0] : (r.value || 0);
      return v.toFixed(r.decimals || 0) + " " + (r.shortUnit || r.unit || "");
    }
    const v = comp.state && typeof comp.state.value === "number" ? comp.state.value : 0;
    const d = (def.props && def.props.decimals) || 0;
    // shortUnit keeps wide units (e.g. µmol/m²/s) readable on the small canvas box
    const u = (def.props && (def.props.shortUnit || def.props.unit)) || "";
    return v.toFixed(d) + " " + u;
  }

  function formatAddr(comp) {
    return "#" + ((comp.state && comp.state.addr) || 1);
  }

  // Write a sensor reading into its box, shrinking the text if it would overflow.
  // The 0.62 factor is the approximate character width of the mono face per 1px
  // of font size; inline style is used so it beats the .sensor-readout class rule.
  function fitReadout(el, def, text) {
    el.textContent = text;
    const size = Math.max(7, Math.min(13, (def.w - 8) / (text.length * 0.62)));
    el.style.fontSize = size.toFixed(1) + "px";
  }

  // orthogonal-ish cable routing with a gentle curve
  /* ---------------- cable routing ----------------
   * Cables run like real cabinet wiring: a short stub straight out of the
   * terminal, along a clear channel between the parts, then straight into the
   * far terminal. Every segment is horizontal, vertical, or a 45° diagonal --
   * no other angles and no curves. Corners are chamfered at 45° rather than
   * squared off, and the channel is nudged clear of any component it would
   * otherwise cross, so cables run between parts instead of behind them.
   */
  const STUB = 10;        // straight run out of a terminal before turning
  const CHAMFER = 12;     // maximum 45° corner cut
  const CLEAR = 6;        // gap left around a component when routing past it
  const GRID_STEP = 8;    // obstacle-avoidance grid resolution
  const GRID_PAD = 140;   // how far outside the two ends the search may wander
  const GRID_MAX = 40000; // cell ceiling — beyond this fall back to the cheap route

  const sgn = (n) => (n < 0 ? -1 : 1);
  const pt = (x, y) => ({ x, y });
  const round = (n) => Math.round(n * 100) / 100;

  // step a point out of its terminal, perpendicular to the edge it sits on
  function stub(p) {
    switch (p.side) {
      case "top": return pt(p.x, p.y - STUB);
      case "bottom": return pt(p.x, p.y + STUB);
      case "left": return pt(p.x - STUB, p.y);
      case "right": return pt(p.x + STUB, p.y);
    }
    return pt(p.x, p.y);
  }

  function obstacles(skip) {
    const out = [];
    ((S.project && S.project.components) || []).forEach((c) => {
      if (skip.indexOf(c.uid) >= 0) return;
      const def = cat.byId[c.typeId];
      if (def) out.push({ x0: c.x - CLEAR, y0: c.y - CLEAR, x1: c.x + def.w + CLEAR, y1: c.y + def.h + CLEAR });
    });
    return out;
  }

  /* ---- obstacle-avoiding route (A* on an 8-direction grid) ----
   * Eight directions means every step is horizontal, vertical or a 45°
   * diagonal, so the result is 45°-compliant by construction. Turning costs a
   * little extra, which keeps runs long and straight instead of staircased.
   * Returns the inner points from sa to sb, or null when there is no way
   * through (or the search area is too large) so the caller can fall back.
   */
  function gridRoute(sa, sb, skip) {
    const minX = Math.min(sa.x, sb.x) - GRID_PAD, maxX = Math.max(sa.x, sb.x) + GRID_PAD;
    const minY = Math.min(sa.y, sb.y) - GRID_PAD, maxY = Math.max(sa.y, sb.y) + GRID_PAD;
    const cols = Math.floor((maxX - minX) / GRID_STEP) + 1;
    const rows = Math.floor((maxY - minY) / GRID_STEP) + 1;
    if (cols < 2 || rows < 2 || cols * rows > GRID_MAX) return null;

    const blocked = new Uint8Array(cols * rows);
    obstacles(skip).forEach((o) => {
      const x0 = Math.max(0, Math.floor((o.x0 - minX) / GRID_STEP));
      const x1 = Math.min(cols - 1, Math.ceil((o.x1 - minX) / GRID_STEP));
      const y0 = Math.max(0, Math.floor((o.y0 - minY) / GRID_STEP));
      const y1 = Math.min(rows - 1, Math.ceil((o.y1 - minY) / GRID_STEP));
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) blocked[gy * cols + gx] = 1;
    });

    const cell = (p) => ({
      gx: Math.max(0, Math.min(cols - 1, Math.round((p.x - minX) / GRID_STEP))),
      gy: Math.max(0, Math.min(rows - 1, Math.round((p.y - minY) / GRID_STEP))),
    });
    const A = cell(sa), B = cell(sb);
    const si = A.gy * cols + A.gx, gi = B.gy * cols + B.gx;
    blocked[si] = 0; blocked[gi] = 0;     // a terminal is always reachable
    if (si === gi) return [sb];

    const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    const g = new Float32Array(cols * rows).fill(Infinity);
    const from = new Int32Array(cols * rows).fill(-1);
    const dirOf = new Int8Array(cols * rows).fill(-1);
    const closed = new Uint8Array(cols * rows);
    const h = (i) => {
      const dx = Math.abs((i % cols) - B.gx), dy = Math.abs(Math.floor(i / cols) - B.gy);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);   // octile distance
    };

    // binary min-heap keyed on f
    const heap = [], hf = [];
    const push = (i, f) => {
      heap.push(i); hf.push(f);
      let n = heap.length - 1;
      while (n > 0) {
        const par = (n - 1) >> 1;
        if (hf[par] <= hf[n]) break;
        [heap[par], heap[n]] = [heap[n], heap[par]]; [hf[par], hf[n]] = [hf[n], hf[par]];
        n = par;
      }
    };
    const pop = () => {
      const top = heap[0];
      const li = heap.pop(), lf = hf.pop();
      if (heap.length) {
        heap[0] = li; hf[0] = lf;
        let n = 0;
        for (;;) {
          const l = 2 * n + 1, r = l + 1;
          let m = n;
          if (l < heap.length && hf[l] < hf[m]) m = l;
          if (r < heap.length && hf[r] < hf[m]) m = r;
          if (m === n) break;
          [heap[m], heap[n]] = [heap[n], heap[m]]; [hf[m], hf[n]] = [hf[n], hf[m]];
          n = m;
        }
      }
      return top;
    };

    g[si] = 0; push(si, h(si));
    let found = false, guard = 0;
    while (heap.length && guard++ < GRID_MAX) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === gi) { found = true; break; }
      const cx = cur % cols, cy = (cur - cx) / cols;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (blocked[ni] || closed[ni]) continue;
        // never cut a diagonal past the corner of an obstacle
        if (DIRS[d][0] && DIRS[d][1] &&
            (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
        const step = DIRS[d][0] && DIRS[d][1] ? Math.SQRT2 : 1;
        const turn = dirOf[cur] >= 0 && dirOf[cur] !== d ? 0.9 : 0;
        const ng = g[cur] + step + turn;
        if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; dirOf[ni] = d; push(ni, ng + h(ni)); }
      }
    }
    if (!found) return null;

    // walk back, then keep only the points where the direction changes
    const chain = [];
    for (let i = gi; i !== -1; i = from[i]) chain.push(i);
    chain.reverse();
    const pts = chain.map((i) => pt(minX + (i % cols) * GRID_STEP, minY + Math.floor(i / cols) * GRID_STEP));
    const keep = [];
    for (let i = 0; i < pts.length; i++) {
      if (i === 0 || i === pts.length - 1) { keep.push(pts[i]); continue; }
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const d1x = sgn(b.x - a.x) * (b.x !== a.x ? 1 : 0), d1y = sgn(b.y - a.y) * (b.y !== a.y ? 1 : 0);
      const d2x = sgn(c.x - b.x) * (c.x !== b.x ? 1 : 0), d2y = sgn(c.y - b.y) * (c.y !== b.y ? 1 : 0);
      if (d1x !== d2x || d1y !== d2y) keep.push(b);
    }
    // The grid path sits on grid nodes; the terminal stubs generally do not.
    // Join them with straight/45° hops rather than pulling the grid points onto
    // the stubs, which would produce arbitrary angles. The offset is under half
    // a grid step, well inside the clearance left around every component.
    const inner = [];
    inner.push(...diagonalTo(sa, keep[0]));
    for (let i = 1; i < keep.length; i++) inner.push(keep[i]);
    inner.push(...diagonalTo(keep[keep.length - 1], sb));
    return inner;
  }

  // ---- cheap fallback: out, along a channel, back in ----
  function crosses(o, lo, hi, fixed, horizontal) {
    return horizontal
      ? fixed > o.y0 && fixed < o.y1 && Math.max(lo, hi) > o.x0 && Math.min(lo, hi) < o.x1
      : fixed > o.x0 && fixed < o.x1 && Math.max(lo, hi) > o.y0 && Math.min(lo, hi) < o.y1;
  }

  function clearChannel(fixed, lo, hi, horizontal, skip) {
    const obs = obstacles(skip);
    for (let i = 0; i < 8; i++) {
      let hit = null;
      for (let j = 0; j < obs.length; j++) {
        if (crosses(obs[j], lo, hi, fixed, horizontal)) { hit = obs[j]; break; }
      }
      if (!hit) return fixed;
      const before = horizontal ? hit.y0 : hit.x0;
      const after = horizontal ? hit.y1 : hit.x1;
      fixed = Math.abs(fixed - before) <= Math.abs(fixed - after) ? before : after;
    }
    return fixed;
  }

  // A straight run then an exact 45° leg. No tolerances: an "almost diagonal"
  // segment is not 45°, so the diagonal leg always moves equally in x and y.
  function diagonalTo(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx === 0 || ady === 0 || adx === ady) return [to];   // already compliant
    return adx > ady
      ? [pt(to.x - sgn(dx) * ady, from.y), to]
      : [pt(from.x, to.y - sgn(dy) * adx), to];
  }

  function channelRoute(a, b, sa, sb, skip) {
    const inner = [];
    const aVert = a.side === "top" || a.side === "bottom";
    const bVert = b.side === "top" || b.side === "bottom";
    if (aVert && bVert && Math.abs(sb.x - sa.x) > 1) {
      const y = clearChannel((sa.y + sb.y) / 2, sa.x, sb.x, true, skip);
      inner.push(pt(sa.x, y), pt(sb.x, y));
    } else if (!aVert && !bVert && Math.abs(sb.y - sa.y) > 1) {
      const x = clearChannel((sa.x + sb.x) / 2, sa.y, sb.y, false, skip);
      inner.push(pt(x, sa.y), pt(x, sb.y));
    } else {
      const via = aVert ? pt(sa.x, sb.y) : pt(sb.x, sa.y);
      if (Math.abs(via.x - sa.x) > 1 || Math.abs(via.y - sa.y) > 1) inner.push(...diagonalTo(sa, via));
    }
    inner.push(sb);
    return inner;
  }

  // replace each square corner with a 45° cut, kept small enough to stay inside
  // the clearance already left around every component
  function chamfer(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const inH = b.y === a.y, inV = b.x === a.x;      // exactly axis-aligned?
      const outH = c.y === b.y, outV = c.x === b.x;
      const square = (inH && outV) || (inV && outH);   // a true 90° corner
      const inLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const outLen = Math.abs(c.x - b.x) + Math.abs(c.y - b.y);
      const k = Math.min(CHAMFER, CLEAR - 1, inLen / 2, outLen / 2);
      if (!square || k <= 0.5) { out.push(b); continue; }
      out.push(pt(inH ? b.x - sgn(b.x - a.x) * k : b.x, inV ? b.y - sgn(b.y - a.y) * k : b.y));
      out.push(pt(outH ? b.x + sgn(c.x - b.x) * k : b.x, outV ? b.y + sgn(c.y - b.y) * k : b.y));
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /* Route one cable. Segments are only ever horizontal, vertical or 45°.
   * While a part is being dragged the cheap channel route is used so the canvas
   * stays responsive; the obstacle-avoiding route is computed once the drag ends. */
  function routePath(a, b) {
    const pa = pt(a.x, a.y), pb = pt(b.x, b.y);
    const sa = stub(a), sb = stub(b);
    const skip = [a.comp, b.comp].filter(Boolean);

    let inner = null;
    if (!D.fastRouting) inner = gridRoute(sa, sb, skip);
    if (!inner) inner = channelRoute(a, b, sa, sb, skip);

    let pts = [pa, sa].concat(inner, [pb]);
    pts = pts.filter((p, i) => {
      const q = pts[i - 1];
      return !q || p.x !== q.x || p.y !== q.y;
    });
    pts = chamfer(pts);
    return "M " + pts.map((p) => `${round(p.x)} ${round(p.y)}`).join(" L ");
  }

  IASim.designer = D;
})();
