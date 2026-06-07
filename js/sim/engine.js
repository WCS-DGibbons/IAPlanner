/* IASim — simulation engine.
 * Scan cycle:  read inputs (from energized nets) -> run PLC -> drive outputs
 *              -> re-solve nets -> publish visual state.
 * Net energization and switch/relay bridges are resolved to a fixpoint each scan.
 */
(function () {
  "use strict";
  const IASim = window.IASim;
  const U = IASim.util;
  const S = IASim.state;
  const cat = IASim.catalog;
  const nets = IASim.nets;

  const SCAN_MS = 60;
  const MAX_ITER = 10;

  const Engine = {
    running: false,
    tags: {},
    timers: {},
    edges: {},
    scanCount: 0,
    lastCycleMs: 0,
    _timer: null,
    _compiled: null,
    _compiledSrc: null,
    stError: null,
    // published visual state (read by designer/ui)
    last: { hotTerm: new Set(), liveTerm: new Set(), hotWire: new Set(), liveWire: new Set(), on: new Map(), relayOn: new Map(), ladderViz: null },

    start() {
      if (this.running) return;
      this.running = true;
      this.scanCount = 0;
      this.stError = null;
      // keep memory/output tags, but compile ST fresh
      this._compiled = null; this._compiledSrc = null;
      this._timer = setInterval(() => this.scan(), SCAN_MS);
      U.emit("sim:state", true);
      this.scan();
    },
    stop() {
      if (!this.running) return;
      this.running = false;
      clearInterval(this._timer); this._timer = null;
      this.last = { hotTerm: new Set(), liveTerm: new Set(), hotWire: new Set(), liveWire: new Set(), on: new Map(), relayOn: new Map(), ladderViz: null };
      U.emit("sim:state", false);
      U.emit("sim:tick");
    },
    toggle() { this.running ? this.stop() : this.start(); },

    scan() {
      const t0 = performance.now();
      const project = S.project;

      // 1) Settle nets with current device + output states, then read inputs.
      let res = this.settle(project);
      this.readInputs(project, res);

      // 2) Run the active PLC program.
      try {
        this.runProgram(project.plc);
        this.stError = null;
      } catch (e) {
        this.stError = e.message ? (e.message + (e.line ? "  (line " + e.line + ")" : "")) : String(e);
        this.stop();
        U.emit("sim:error", this.stError);
        return;
      }

      // 3) Re-settle nets so outputs/relays/lamps reflect this scan, then publish.
      res = this.settle(project);
      this.publish(project, res);

      this.scanCount++;
      this.lastCycleMs = performance.now() - t0;
      U.emit("sim:tick");
    },

    // --- iterate bridges <-> energization to a fixpoint ---
    settle(project) {
      let bridges = [];
      let netObj = null, en = null;
      for (let it = 0; it < MAX_ITER; it++) {
        netObj = nets.build(project, bridges);
        en = this.computeEnergize(project, netObj);
        const next = this.computeBridges(project, netObj, en.hot24);
        if (sameBridges(next, bridges)) { bridges = next; break; }
        bridges = next;
      }
      // final consistent solve
      netObj = nets.build(project, bridges);
      en = this.computeEnergize(project, netObj);
      return { net: netObj, hot: en.hot24, live: en.live240, analog: en.analog, bridges };
    },

    // returns { hot24, live240 } : sets of net roots energized at each voltage
    computeEnergize(project, netObj) {
      const hot24 = new Set();   // 24V DC present
      const live240 = new Set(); // 240V AC live present
      const root = (c, t) => netObj.root(c, t);

      // unconditional sources: mains live, non-PSU 24V sources, ON PLC outputs
      project.components.forEach((c) => {
        const def = cat.byId[c.typeId];
        if (!def) return;
        def.terminals.forEach((t) => {
          if (t.kind === "mainsL") live240.add(root(c.uid, t.id));
          else if (t.kind === "source24" && def.behavior !== "power") hot24.add(root(c.uid, t.id));
          else if (t.kind === "out" && t.tag && U.truthy(this.tags[t.tag])) hot24.add(root(c.uid, t.id));
        });
      });

      // conditional sources resolved to a fixpoint:
      //   PSU outputs 24V only when its mains input is live;
      //   a sensor drives its signal only when powered (24V) AND detecting.
      for (let pass = 0; pass < 6; pass++) {
        let changed = false;
        project.components.forEach((c) => {
          const def = cat.byId[c.typeId];
          if (!def) return;
          if (def.behavior === "power") {
            if (live240.has(root(c.uid, def.mainsInput || "L"))) {
              def.terminals.forEach((t) => {
                if (t.kind === "source24") {
                  const r = root(c.uid, t.id);
                  if (!hot24.has(r)) { hot24.add(r); changed = true; }
                }
              });
            }
          } else if (def.behavior === "sensor") {
            const pwr = def.terminals.find((t) => t.kind === "pwr");
            const sig = def.terminals.find((t) => t.kind === "sigout");
            if (sig) {
              const powered = pwr ? hot24.has(root(c.uid, pwr.id)) : true;
              if (c.state && c.state.detected && powered) {
                const r = root(c.uid, sig.id);
                if (!hot24.has(r)) { hot24.add(r); changed = true; }
              }
            }
          }
        });
        if (!changed) break;
      }

      // analog signals: each 'aout' terminal places a value on its net.
      // Sensors output their measured value when powered; a PLC analog output
      // places its tag value.
      const analog = new Map();
      project.components.forEach((c) => {
        const def = cat.byId[c.typeId];
        if (!def) return;
        def.terminals.forEach((t) => {
          if (t.kind !== "aout") return;
          let val = null;
          if (def.behavior === "asensor") {
            const pwr = def.terminals.find((x) => x.kind === "pwr");
            const powered = pwr ? hot24.has(root(c.uid, pwr.id)) : true;
            if (powered && c.state && typeof c.state.value === "number") val = c.state.value;
          } else if (t.tag) {
            val = Number(this.tags[t.tag]) || 0;
          }
          if (val !== null) {
            const r = root(c.uid, t.id);
            if (!analog.has(r) || Math.abs(val) > Math.abs(analog.get(r))) analog.set(r, val);
          }
        });
      });

      return { hot24, live240, analog };
    },

    computeBridges(project, netObj, hotRoots) {
      const bridges = [];
      const isHot = (comp, term) => hotRoots.has(netObj.root(comp, term));
      const add = (comp, a, b) => bridges.push([{ comp, term: a }, { comp, term: b }]);

      project.components.forEach((c) => {
        const def = cat.byId[c.typeId];
        if (!def) return;
        switch (def.behavior) {
          case "terminal":
            def.bridge && def.bridge.forEach((p) => add(c.uid, p[0], p[1]));
            break;
          case "breaker":
            if (c.state.closed && !c.state.tripped) def.bridge.forEach((p) => add(c.uid, p[0], p[1]));
            break;
          case "button":
            if (c.state.pressed) def.bridge.forEach((p) => add(c.uid, p[0], p[1]));
            break;
          case "selector":
            if (c.state.closed) def.bridge.forEach((p) => add(c.uid, p[0], p[1]));
            break;
          case "relay": {
            const coilOn = isHot(c.uid, def.coil[0]); // A1 hot vs A2(gnd)
            if (def.contactNO && coilOn) add(c.uid, def.contactNO[0], def.contactNO[1]);
            if (def.contactNC && !coilOn) add(c.uid, def.contactNC[0], def.contactNC[1]);
            break;
          }
        }
      });
      return bridges;
    },

    readInputs(project, res) {
      project.components.forEach((c) => {
        const def = cat.byId[c.typeId];
        if (!def) return;
        def.terminals.forEach((t) => {
          if (t.kind === "in" && t.tag)
            this.tags[t.tag] = res.hot.has(res.net.root(c.uid, t.id));
          else if (t.kind === "ain" && t.tag) {
            const r = res.net.root(c.uid, t.id);
            this.tags[t.tag] = res.analog && res.analog.has(r) ? res.analog.get(r) : 0;
          }
        });
      });
    },

    runProgram(plc) {
      if (plc.lang === "ladder") {
        this.last.ladderViz = IASim.ladder.evaluate(plc, this.tags);
      } else {
        if (this._compiledSrc !== plc.st) {
          this._compiled = IASim.st.compile(plc.st);
          this._compiledSrc = plc.st;
        }
        IASim.st.run(this._compiled, {
          tags: this.tags, timers: this.timers, edges: this.edges, dt: SCAN_MS,
        });
        this.last.ladderViz = null;
      }
    },

    publish(project, res) {
      const hotTerm = new Set(), liveTerm = new Set();
      const on = new Map();
      const relayOn = new Map();

      project.components.forEach((c) => {
        const def = cat.byId[c.typeId];
        if (!def) return;
        def.terminals.forEach((t) => {
          const r = res.net.root(c.uid, t.id);
          if (res.hot.has(r)) hotTerm.add(c.uid + "::" + t.id);
          else if (res.live.has(r)) liveTerm.add(c.uid + "::" + t.id);
        });
        // indicator / device on-state (lit by either voltage)
        if (def.indicator) {
          const r = res.net.root(c.uid, def.indicator.source);
          on.set(c.uid, res.hot.has(r) || res.live.has(r));
        }
        if (def.behavior === "relay")
          relayOn.set(c.uid, res.hot.has(res.net.root(c.uid, def.coil[0])));
      });

      const hotWire = new Set(), liveWire = new Set();
      project.wires.forEach((w) => {
        const r = res.net.root(w.a.comp, w.a.term);
        if (res.hot.has(r)) hotWire.add(w.id);
        else if (res.live.has(r)) liveWire.add(w.id);
      });

      this.last = { hotTerm, liveTerm, hotWire, liveWire, on, relayOn, ladderViz: this.last.ladderViz };
    },

    resetTags() {
      this.tags = {}; this.timers = {}; this.edges = {};
      this._compiled = null; this._compiledSrc = null;
    },
  };

  function sameBridges(a, b) {
    if (a.length !== b.length) return false;
    const norm = (arr) => arr.map((p) => {
      const x = p[0].comp + "." + p[0].term, y = p[1].comp + "." + p[1].term;
      return x < y ? x + "|" + y : y + "|" + x;
    }).sort().join(",");
    return norm(a) === norm(b);
  }

  IASim.engine = Engine;
})();
