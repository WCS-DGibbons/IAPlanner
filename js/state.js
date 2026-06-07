/* IASim — central project state + persistence. */
(function () {
  "use strict";
  const IASim = window.IASim;
  const U = IASim.util;
  const cat = IASim.catalog;

  const SAVE_KEY = "iasim.project.v3";

  function blankProject() {
    return {
      rails: [
        { id: "rail_1", x: 60, y: 140, length: 800 },
        { id: "rail_2", x: 60, y: 660, length: 800 },
      ],
      // Pre-built greenhouse cabinet driven by an M-Duino PLC.
      // Mains -> Breaker -> 24V PSU powers the M-Duino and field devices.
      // Temp / Humidity / Leaf-moisture sensors feed analog inputs AI0..AI2.
      // ST program opens the vent winder (via a relay) when it is too hot or on
      // manual demand, and lights a warning lamp on high humidity / wet leaves.
      components: [
        { uid: "mains_in", typeId: "mains", x: 40, y: 28, railId: null, props: {}, state: {} },
        { uid: "cb1", typeId: "mcb", x: 110, y: 88, railId: "rail_1", props: {}, state: { closed: true, tripped: false } },
        { uid: "psu1", typeId: "psu", x: 160, y: 88, railId: "rail_1", props: {}, state: {} },
        { uid: "mduino1", typeId: "mduino", x: 250, y: 88, railId: "rail_1", props: { name: "M-Duino" }, state: {} },
        { uid: "rly1", typeId: "relay", x: 480, y: 88, railId: "rail_1", props: {}, state: {} },
        { uid: "temp1", typeId: "temp", x: 110, y: 300, railId: null, props: {}, state: { value: 24 } },
        { uid: "hum1", typeId: "humidity", x: 250, y: 300, railId: null, props: {}, state: { value: 65 } },
        { uid: "leaf1", typeId: "leaf", x: 390, y: 300, railId: null, props: {}, state: { value: 35 } },
        { uid: "btn1", typeId: "pushbutton", x: 110, y: 520, railId: null, props: {}, state: { pressed: false } },
        { uid: "wind1", typeId: "winder", x: 300, y: 500, railId: null, props: {}, state: {} },
        { uid: "lmp1", typeId: "lamp", x: 560, y: 520, railId: null, props: { color: "#ffb000" }, state: {} },
      ],
      wires: [
        // --- 240V AC: mains -> breaker -> PSU ---
        { id: "w1", a: { comp: "mains_in", term: "L" }, b: { comp: "cb1", term: "1" }, color: "#e06c75" },
        { id: "w2", a: { comp: "cb1", term: "2" }, b: { comp: "psu1", term: "L" }, color: "#e06c75" },
        { id: "w3", a: { comp: "mains_in", term: "N" }, b: { comp: "psu1", term: "N" }, color: "#5c6370" },
        { id: "w4", a: { comp: "mains_in", term: "PE" }, b: { comp: "psu1", term: "PE" }, color: "#a3be8c" },
        // --- 24V DC powers the M-Duino ---
        { id: "w5", a: { comp: "psu1", term: "V+" }, b: { comp: "mduino1", term: "Vp" }, color: "#e06c75" },
        { id: "w6", a: { comp: "psu1", term: "M" }, b: { comp: "mduino1", term: "Vm" }, color: "#5c6370" },
        // --- temperature sensor -> AI0 ---
        { id: "w7", a: { comp: "temp1", term: "P" }, b: { comp: "psu1", term: "V+2" }, color: "#e06c75" },
        { id: "w8", a: { comp: "temp1", term: "N" }, b: { comp: "psu1", term: "M" }, color: "#5c6370" },
        { id: "w9", a: { comp: "temp1", term: "S" }, b: { comp: "mduino1", term: "AI0" }, color: "#ebcb8b" },
        // --- humidity sensor -> AI1 ---
        { id: "w10", a: { comp: "hum1", term: "P" }, b: { comp: "psu1", term: "V+2" }, color: "#e06c75" },
        { id: "w11", a: { comp: "hum1", term: "N" }, b: { comp: "psu1", term: "M" }, color: "#5c6370" },
        { id: "w12", a: { comp: "hum1", term: "S" }, b: { comp: "mduino1", term: "AI1" }, color: "#ebcb8b" },
        // --- leaf-moisture sensor -> AI2 ---
        { id: "w13", a: { comp: "leaf1", term: "P" }, b: { comp: "psu1", term: "V+2" }, color: "#e06c75" },
        { id: "w14", a: { comp: "leaf1", term: "N" }, b: { comp: "psu1", term: "M" }, color: "#5c6370" },
        { id: "w15", a: { comp: "leaf1", term: "S" }, b: { comp: "mduino1", term: "AI2" }, color: "#ebcb8b" },
        // --- manual vent button -> I0.0 ---
        { id: "w16", a: { comp: "psu1", term: "V+" }, b: { comp: "btn1", term: "1" }, color: "#e06c75" },
        { id: "w17", a: { comp: "btn1", term: "2" }, b: { comp: "mduino1", term: "I0" }, color: "#61afef" },
        // --- Q0.0 -> relay coil; relay NO switches 24V to the vent winder ---
        { id: "w18", a: { comp: "mduino1", term: "Q0" }, b: { comp: "rly1", term: "A1" }, color: "#61afef" },
        { id: "w19", a: { comp: "rly1", term: "A2" }, b: { comp: "psu1", term: "M" }, color: "#5c6370" },
        { id: "w20", a: { comp: "psu1", term: "V+" }, b: { comp: "rly1", term: "11" }, color: "#e06c75" },
        { id: "w21", a: { comp: "rly1", term: "14" }, b: { comp: "wind1", term: "A" }, color: "#d8dee9" },
        { id: "w22", a: { comp: "wind1", term: "B" }, b: { comp: "psu1", term: "M" }, color: "#5c6370" },
        // --- Q0.1 -> warning lamp ---
        { id: "w23", a: { comp: "mduino1", term: "Q1" }, b: { comp: "lmp1", term: "X1" }, color: "#61afef" },
        { id: "w24", a: { comp: "lmp1", term: "X2" }, b: { comp: "psu1", term: "M" }, color: "#5c6370" },
      ],
      plc: {
        lang: "st",   // 'ladder' | 'st'
        rungs: [
          {
            id: "r1",
            branches: [[{ type: "NO", tag: "I0.0" }]],
            outputs: [{ type: "COIL", tag: "Q0.0" }],
          },
        ],
        st: [
          "(* === Greenhouse climate control - M-Duino === *)",
          "(* Analog inputs:  AI0 = Temperature (degC)   *)",
          "(*                 AI1 = Humidity (%RH)        *)",
          "(*                 AI2 = Leaf moisture (%)     *)",
          "(* Digital input:  I0.0 = Manual vent button   *)",
          "(* Outputs:        Q0.0 -> relay -> vent winder *)",
          "(*                 Q0.1 -> warning lamp         *)",
          "",
          "(* Open the wall/roof vent if too warm, or on demand *)",
          "VentOpen := (AI0 > 26.0) OR I0.0;",
          "Q0.0 := VentOpen;",
          "",
          "(* Warning lamp on high humidity or very wet leaves *)",
          "Q0.1 := (AI1 > 80.0) OR (AI2 > 70.0);",
          "",
        ].join("\n"),
      },
      meta: { name: "Greenhouse Cabinet", created: 0 },
    };
  }

  const State = {
    project: blankProject(),
    selection: null,     // {kind:'comp'|'rail'|'wire', id}
    mode: "select",      // 'select' | 'wire'

    // ---- component helpers ----
    addComponent(typeId, x, y, railId) {
      const def = cat.byId[typeId];
      if (!def) return null;
      const comp = {
        uid: U.uid("c"),
        typeId,
        x, y, railId: railId || null,
        props: U.deepCopy(def.props || {}),
        state: U.deepCopy(def.defaultState || {}),
      };
      this.project.components.push(comp);
      U.emit("project:changed");
      return comp;
    },
    getComponent(uid) { return this.project.components.find((c) => c.uid === uid); },
    removeComponent(uid) {
      this.project.components = this.project.components.filter((c) => c.uid !== uid);
      this.project.wires = this.project.wires.filter(
        (w) => w.a.comp !== uid && w.b.comp !== uid
      );
      U.emit("project:changed");
    },
    def(comp) { return cat.byId[comp.typeId]; },

    // ---- rails ----
    addRail() {
      const rails = this.project.rails;
      const y = rails.length ? Math.max(...rails.map((r) => r.y)) + 230 : 90;
      const rail = { id: U.uid("rail"), x: 60, y, length: 760 };
      rails.push(rail);
      U.emit("project:changed");
      return rail;
    },
    getRail(id) { return this.project.rails.find((r) => r.id === id); },
    removeRail(id) {
      // detach components on this rail
      this.project.components.forEach((c) => { if (c.railId === id) c.railId = null; });
      this.project.rails = this.project.rails.filter((r) => r.id !== id);
      U.emit("project:changed");
    },

    // ---- wires ----
    addWire(a, b) {
      // a,b = {comp, term}; prevent duplicates & self
      if (a.comp === b.comp && a.term === b.term) return null;
      const exists = this.project.wires.some(
        (w) =>
          (w.a.comp === a.comp && w.a.term === a.term && w.b.comp === b.comp && w.b.term === b.term) ||
          (w.a.comp === b.comp && w.a.term === b.term && w.b.comp === a.comp && w.b.term === a.term)
      );
      if (exists) return null;
      const wire = { id: U.uid("w"), a, b, color: pickWireColor(a) };
      this.project.wires.push(wire);
      U.emit("project:changed");
      return wire;
    },
    removeWire(id) {
      this.project.wires = this.project.wires.filter((w) => w.id !== id);
      U.emit("project:changed");
    },

    // ---- selection ----
    select(kind, id) {
      this.selection = id ? { kind, id } : null;
      U.emit("selection:changed", this.selection);
    },

    // ---- persistence ----
    serialize() { return JSON.stringify(this.project, null, 2); },
    load(json) {
      try {
        const p = typeof json === "string" ? JSON.parse(json) : json;
        if (!p.rails || !p.components) throw new Error("Not an IASim project");
        this.project = Object.assign(blankProject(), p);
        this.selection = null;
        U.emit("project:changed");
        U.emit("selection:changed", null);
        return true;
      } catch (e) {
        alert("Load failed: " + e.message);
        return false;
      }
    },
    autosave() {
      try { localStorage.setItem(SAVE_KEY, this.serialize()); } catch (e) {}
    },
    restore() {
      try {
        const s = localStorage.getItem(SAVE_KEY);
        if (s) { this.load(s); return true; }
      } catch (e) {}
      return false;
    },
    reset() {
      this.project = blankProject();
      this.selection = null;
      U.emit("project:changed");
      U.emit("selection:changed", null);
    },
  };

  function pickWireColor(a) {
    const comp = State.getComponent(a.comp);
    if (!comp) return "#c0c5ce";
    const def = State.def(comp);
    const term = def.terminals.find((t) => t.id === a.term);
    if (!term) return "#c0c5ce";
    if (term.kind === "source24") return "#e06c75"; // 24V+ red
    if (term.kind === "gnd") return "#5c6370";      // 0V blue/grey
    if (term.kind === "sigout" || term.kind === "in") return "#61afef";
    return "#c0c5ce";
  }

  IASim.state = State;
})();
