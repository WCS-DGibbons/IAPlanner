/* IASim — side panels & controls: palette, properties, PLC program editor
 * (ladder + Structured Text), I/O tag watch, and the toolbar.
 */
(function () {
  "use strict";
  const IASim = window.IASim;
  const U = IASim.util;
  const S = IASim.state;
  const cat = IASim.catalog;
  const eng = IASim.engine;

  const KNOWN_TAGS = []
    .concat(Array.from({ length: 8 }, (_, i) => "I0." + i))
    .concat(Array.from({ length: 4 }, (_, i) => "AI" + i))
    .concat(Array.from({ length: 6 }, (_, i) => "Q0." + i))
    .concat(["R0.0", "R0.1", "AQ0"])
    .concat(Array.from({ length: 8 }, (_, i) => "M0." + i));

  const UI = {
    activeTab: "props",
    editing: null,       // ladder element being edited
    ladderRefs: null,

    init() {
      this.buildPalette();
      this.bindTabs();
      this.bindToolbar();
      this.renderInspector();

      U.on("selection:changed", () => this.renderInspector());
      U.on("project:changed", () => { if (this.activeTab !== "program") this.renderInspector(); else this.renderProgramHeaderState(); });
      U.on("sim:state", (on) => this.onSimState(on));
      U.on("sim:tick", () => this.onTick());
      U.on("sim:error", (msg) => this.showStError(msg));
      U.on("status", (m) => this.setStatus(m));

      // live wiring validation (debounced)
      let vt = null;
      const revalidate = () => { clearTimeout(vt); vt = setTimeout(() => IASim.validate.run(), 250); };
      U.on("project:changed", revalidate);
      U.on("checks:changed", (issues) => {
        this.updateChecksBadge(issues);
        if (this.activeTab === "checks") this.renderChecks();
      });
      IASim.validate.run();
    },

    // ---------------- palette ----------------
    buildPalette() {
      const list = document.getElementById("palette-list");
      U.clear(list);
      const groups = {};
      cat.list.forEach((d) => (groups[d.category] = groups[d.category] || []).push(d));
      Object.keys(groups).forEach((g) => {
        list.appendChild(U.el("div", { class: "palette-cat", text: g }));
        groups[g].forEach((def) => {
          const item = U.el("div", { class: "palette-item", title: def.desc }, [
            U.el("div", { class: "palette-swatch" }),
            U.el("div", {}, [
              U.el("div", { class: "nm", text: def.name }),
              U.el("div", { class: "desc", text: def.desc }),
            ]),
          ]);
          item.querySelector(".palette-swatch").style.background = def.color;
          item.addEventListener("pointerdown", (e) => this.startPaletteDrag(e, def));
          list.appendChild(item);
        });
      });
    },

    startPaletteDrag(e, def) {
      e.preventDefault();
      const ghost = U.el("div", { class: "drag-ghost", text: def.name });
      Object.assign(ghost.style, {
        position: "fixed", zIndex: 9999, pointerEvents: "none",
        background: def.color, color: "#0d1117", padding: "6px 10px",
        borderRadius: "6px", font: "700 11px sans-serif", boxShadow: "0 4px 14px rgba(0,0,0,.5)",
      });
      document.body.appendChild(ghost);
      const move = (ev) => { ghost.style.left = ev.clientX + 10 + "px"; ghost.style.top = ev.clientY + 10 + "px"; };
      const up = (ev) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        ghost.remove();
        const stage = document.getElementById("stage").getBoundingClientRect();
        if (ev.clientX >= stage.left && ev.clientX <= stage.right && ev.clientY >= stage.top && ev.clientY <= stage.bottom) {
          IASim.designer.placeAt(def.id, ev.clientX, ev.clientY);
          this.setStatus("Placed " + def.name + ".");
        }
      };
      move(e);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },

    // ---------------- tabs ----------------
    bindTabs() {
      document.querySelectorAll("#inspector-tabs .tab").forEach((t) => {
        t.addEventListener("click", () => {
          this.activeTab = t.dataset.tab;
          document.querySelectorAll("#inspector-tabs .tab").forEach((x) => x.classList.toggle("active", x === t));
          document.querySelectorAll(".tab-body").forEach((b) => b.classList.remove("active"));
          document.getElementById("tab-" + this.activeTab).classList.add("active");
          this.renderInspector();
        });
      });
    },

    renderInspector() {
      if (this.activeTab === "props") this.renderProps();
      else if (this.activeTab === "program") this.renderProgram();
      else if (this.activeTab === "io") this.renderIO();
      else if (this.activeTab === "checks") this.renderChecks();
    },

    // ---------------- properties ----------------
    renderProps() {
      const box = U.clear(document.getElementById("tab-props"));
      const sel = S.selection;
      if (!sel) {
        box.appendChild(U.el("div", { class: "empty-note", html:
          "Nothing selected.<br><br>• Drag parts from the <b>Component Library</b> onto a DIN rail.<br>" +
          "• Switch to <b>Wire</b> mode to connect terminals.<br>• Select a field device to get a live <b>Run</b> control.<br>" +
          "• Scroll to zoom, drag the background to pan." }));
        return;
      }
      if (sel.kind === "rail") return this.renderRailProps(box, sel.id);
      if (sel.kind === "wire") return this.renderWireProps(box, sel.id);
      this.renderCompProps(box, sel.id);
    },

    renderCompProps(box, uid) {
      const comp = S.getComponent(uid);
      if (!comp) return;
      const def = cat.byId[comp.typeId];
      box.appendChild(U.el("div", { class: "panel-title", text: def.name }));
      box.appendChild(kv("Type", def.id));
      box.appendChild(kv("Category", def.category));

      // interactive simulation control for field devices
      const ctl = this.deviceControl(comp, def);
      if (ctl) box.appendChild(ctl);

      // editable props
      if (comp.props && "color" in comp.props) {
        box.appendChild(field("Lens colour", inputColor(comp.props.color, (v) => {
          comp.props.color = v; U.emit("project:changed");
        })));
      }
      if (def.isController) {
        box.appendChild(field("CPU name", inputText(comp.props.name || "CPU", (v) => {
          comp.props.name = v; U.emit("project:changed");
        })));
        box.appendChild(U.el("div", { class: "empty-note", text:
          "Edit this PLC's program in the PLC Program tab. Inputs I0.0–I0.7 are on top, outputs Q0.0–Q0.5 on the bottom." }));
      }

      box.appendChild(kv("Position", Math.round(comp.x) + ", " + Math.round(comp.y)));
      box.appendChild(U.el("div", { class: "btn-row" }, [
        U.el("button", { class: "btn", text: "Duplicate", onclick: () => {
          const c = S.addComponent(comp.typeId, comp.x + 16, comp.y + 16, comp.railId);
          c.props = U.deepCopy(comp.props); S.select("comp", c.uid);
        } }),
        U.el("button", { class: "btn", text: "🗑 Delete", onclick: () => { S.removeComponent(uid); S.select(null); } }),
      ]));
    },

    deviceControl(comp, def) {
      const wrap = U.el("div", { class: "sim-control" });
      const b = def.behavior;
      if (b === "button") {
        wrap.appendChild(U.el("div", { class: "label" }, ["Push Button", U.el("span", { text: comp.state.pressed ? "PRESSED" : "" })]));
        const btn = U.el("button", { class: "toggle-btn momentary", text: "PRESS &amp; HOLD" });
        btn.innerHTML = "PRESS &amp; HOLD";
        const set = (v) => { comp.state.pressed = v; btn.classList.toggle("on", v); this.refreshAfterInput(); };
        btn.addEventListener("pointerdown", (e) => { e.preventDefault(); set(true); });
        btn.addEventListener("pointerup", () => set(false));
        btn.addEventListener("pointerleave", () => { if (comp.state.pressed) set(false); });
        wrap.appendChild(btn);
        return wrap;
      }
      if (b === "selector") {
        const nc = def.normallyClosed;
        const L = def.switchLabels || {};
        wrap.appendChild(U.el("div", { class: "label", text: def.name }));
        const btn = U.el("button", { class: "toggle-btn" });
        const render = () => {
          btn.classList.toggle("on", comp.state.closed);
          btn.textContent = comp.state.closed
            ? (L.closed || (nc ? "RELEASED (closed)" : "ON"))
            : (L.open || (nc ? "PUSHED (open)" : "OFF"));
        };
        btn.addEventListener("click", () => { comp.state.closed = !comp.state.closed; render(); this.refreshAfterInput(); });
        render(); wrap.appendChild(btn); return wrap;
      }
      if (b === "sensor") {
        const L = def.sensorLabels || {};
        wrap.appendChild(U.el("div", { class: "label", text: def.name }));
        const btn = U.el("button", { class: "toggle-btn" });
        const render = () => {
          btn.classList.toggle("on", comp.state.detected);
          btn.textContent = comp.state.detected ? (L.on || "TARGET DETECTED") : (L.off || "NO TARGET");
        };
        btn.addEventListener("click", () => { comp.state.detected = !comp.state.detected; render(); this.refreshAfterInput(); });
        render(); wrap.appendChild(btn); return wrap;
      }
      if (b === "breaker") {
        wrap.appendChild(U.el("div", { class: "label", text: "Circuit Breaker" }));
        const btn = U.el("button", { class: "toggle-btn" });
        const render = () => { btn.classList.toggle("on", comp.state.closed); btn.textContent = comp.state.closed ? "CLOSED (on)" : "OPEN (off)"; };
        btn.addEventListener("click", () => { comp.state.closed = !comp.state.closed; render(); this.refreshAfterInput(); });
        render(); wrap.appendChild(btn); return wrap;
      }
      if (b === "asensor") {
        const p = def.props || {};
        const val = U.el("span");
        const fmt = () => (comp.state.value || 0).toFixed(p.decimals || 0) + " " + (p.unit || "");
        wrap.appendChild(U.el("div", { class: "label" }, ["Measured value", val]));
        val.textContent = fmt();
        const step = p.step || Math.pow(10, -(p.decimals || 0));
        const slider = U.el("input", { type: "range", min: p.min, max: p.max,
          step: step, value: comp.state.value });
        slider.style.width = "100%";
        slider.addEventListener("input", () => {
          comp.state.value = parseFloat(slider.value);
          val.textContent = fmt();
          IASim.designer.setReadout(comp.uid);   // live update on canvas
          this.refreshAfterInput();
        });
        // persist (autosave) only when the user lets go
        slider.addEventListener("change", () => U.emit("project:dirty"));
        wrap.appendChild(slider);
        wrap.appendChild(U.el("div", { class: "empty-note", text:
          "Drag to simulate the reading. Wire the AO terminal to an M-Duino analog input (AI0–AI3)." }));
        return wrap;
      }
      if (b === "actuator") {
        const open = !!(eng.last.on && eng.last.on.get(comp.uid));
        wrap.appendChild(U.el("div", { class: "label" }, [
          def.actuator === "vent" ? "Vent Winder" : "Linear Actuator",
          U.el("span", { text: open ? (def.actuator === "vent" ? "OPEN" : "EXTENDED") : (def.actuator === "vent" ? "CLOSED" : "RETRACTED") }),
        ]));
        wrap.appendChild(U.el("div", { class: "empty-note", text:
          "Driven by its supply: energize the + terminal (e.g. from a relay / PLC output) to extend/open." }));
        return wrap;
      }
      return null;
    },

    refreshAfterInput() {
      if (!eng.running) eng.last = eng.last; // no-op; visuals update on next scan when running
      U.emit("sim:tick");
    },

    renderRailProps(box, id) {
      const rail = S.getRail(id);
      box.appendChild(U.el("div", { class: "panel-title", text: "DIN Rail" }));
      box.appendChild(field("Length (px)", inputNum(rail.length, (v) => { rail.length = U.clamp(v, 100, 4000); U.emit("project:changed"); })));
      box.appendChild(kv("Y position", Math.round(rail.y)));
      box.appendChild(U.el("div", { class: "btn-row" }, [
        U.el("button", { class: "btn", text: "🗑 Delete rail", onclick: () => { S.removeRail(id); S.select(null); } }),
      ]));
    },

    renderWireProps(box, id) {
      const w = S.project.wires.find((x) => x.id === id);
      if (!w) return;
      box.appendChild(U.el("div", { class: "panel-title", text: "Cable" }));
      const ca = S.getComponent(w.a.comp), cb = S.getComponent(w.b.comp);
      box.appendChild(kv("From", (ca ? cat.byId[ca.typeId].name : "?") + " · " + w.a.term));
      box.appendChild(kv("To", (cb ? cat.byId[cb.typeId].name : "?") + " · " + w.b.term));
      box.appendChild(field("Colour", inputColor(w.color, (v) => { w.color = v; U.emit("project:changed"); })));
      box.appendChild(U.el("div", { class: "btn-row" }, [
        U.el("button", { class: "btn", text: "🗑 Delete cable", onclick: () => { S.removeWire(id); S.select(null); } }),
      ]));
    },

    // ---------------- PLC program ----------------
    renderProgram() {
      const box = U.clear(document.getElementById("tab-program"));
      const plc = S.project.plc;
      box.appendChild(U.el("div", { class: "lang-switch" }, [
        langBtn("Ladder (LD)", plc.lang === "ladder", () => { plc.lang = "ladder"; this.renderProgram(); }),
        langBtn("Structured Text (ST)", plc.lang === "st", () => { plc.lang = "st"; this.renderProgram(); }),
      ]));
      if (plc.lang === "ladder") this.renderLadder(box, plc);
      else this.renderST(box, plc);
    },
    renderProgramHeaderState() { /* live edits don't need full rerender */ },

    renderLadder(box, plc) {
      this.ladderRefs = { contacts: new Map(), outputs: new Map(), rungs: new Map() };

      // inline element editor
      if (this.editing) box.appendChild(this.ladderEditor(plc));

      plc.rungs.forEach((rung, ri) => {
        const rg = U.el("div", { class: "rung" });
        rg.appendChild(U.el("div", { class: "rung-head" }, [
          U.el("span", { class: "rung-num", text: "Rung " + (ri + 1) }),
          U.el("button", { class: "add-mini", text: "✕ rung", onclick: () => { plc.rungs.splice(ri, 1); U.emit("project:changed"); this.renderProgram(); } }),
        ]));

        const power = U.el("div", { class: "rung-power" });
        power.appendChild(U.el("div", { class: "rail-line" }));

        const branches = U.el("div", { class: "branches" });
        rung.branches.forEach((branch, bi) => {
          const br = U.el("div", { class: "branch" });
          branch.forEach((c, ci) => {
            const el = this.contactEl(c);
            el.addEventListener("click", () => { this.editing = { ri, bi, ci, kind: "contact" }; this.renderProgram(); });
            this.ladderRefs.contacts.set(ri + "-" + bi + "-" + ci, el);
            br.appendChild(el);
          });
          br.appendChild(U.el("button", { class: "add-mini", text: "+ contact", onclick: () => {
            branch.push({ type: "NO", tag: "I0.0" }); U.emit("project:changed"); this.renderProgram();
          } }));
          branches.appendChild(br);
        });
        branches.appendChild(U.el("button", { class: "add-mini", text: "+ parallel branch (OR)", onclick: () => {
          rung.branches.push([{ type: "NO", tag: "I0.1" }]); U.emit("project:changed"); this.renderProgram();
        } }));

        const outs = U.el("div", { class: "branches" });
        rung.outputs.forEach((o, oi) => {
          const el = this.outputEl(o);
          el.addEventListener("click", () => { this.editing = { ri, oi, kind: "output" }; this.renderProgram(); });
          this.ladderRefs.outputs.set(ri + "-" + oi, el);
          outs.appendChild(el);
        });
        outs.appendChild(U.el("button", { class: "add-mini", text: "+ coil", onclick: () => {
          rung.outputs.push({ type: "COIL", tag: "Q0.0" }); U.emit("project:changed"); this.renderProgram();
        } }));

        const row = U.el("div", { style: "display:flex; align-items:stretch; gap:8px;" }, [power, branches,
          U.el("div", { class: "rail-line" }), outs, U.el("div", { class: "rail-line" })]);
        rg.appendChild(row);
        this.ladderRefs.rungs.set(ri, rg);
        box.appendChild(rg);
      });

      box.appendChild(U.el("button", { class: "btn primary", text: "+ Add Rung", onclick: () => {
        plc.rungs.push({ id: U.uid("r"), branches: [[{ type: "NO", tag: "I0.0" }]], outputs: [{ type: "COIL", tag: "Q0.0" }] });
        U.emit("project:changed"); this.renderProgram();
      } }));
      box.appendChild(U.el("div", { class: "empty-note", html:
        "Contacts: <b>NO</b> -[ ]- passes when its tag is TRUE, <b>NC</b> -[/]- when FALSE. " +
        "Contacts in a branch are <b>AND</b>; parallel branches are <b>OR</b>. Click any element to edit." }));
      this.updateLadderViz();
    },

    contactEl(c) {
      const sym = c.type === "NC" ? "─┤/├─" : "─┤ ├─";
      return U.el("div", { class: "elem" }, [
        U.el("div", { class: "sym", text: sym }),
        U.el("div", { class: "tg", text: c.tag || "?" }),
      ]);
    },
    outputEl(o) {
      const sym = o.type === "SET" ? "─(S)─" : o.type === "RESET" ? "─(R)─" : "─( )─";
      return U.el("div", { class: "elem coil" }, [
        U.el("div", { class: "sym", text: sym }),
        U.el("div", { class: "tg", text: o.tag || "?" }),
      ]);
    },

    ladderEditor(plc) {
      const e = this.editing;
      const wrap = U.el("div", { class: "rung", style: "border-color:#2f81f7" });
      let obj, typeOptions;
      if (e.kind === "contact") {
        obj = plc.rungs[e.ri].branches[e.bi][e.ci];
        typeOptions = [["NO", "NO -[ ]-"], ["NC", "NC -[/]-"]];
      } else {
        obj = plc.rungs[e.ri].outputs[e.oi];
        typeOptions = [["COIL", "Coil -( )-"], ["SET", "Set -(S)-"], ["RESET", "Reset -(R)-"]];
      }
      wrap.appendChild(U.el("div", { class: "rung-head" }, [U.el("span", { class: "rung-num", text: "Edit element" })]));
      wrap.appendChild(field("Type", select(typeOptions, obj.type, (v) => { obj.type = v; U.emit("project:changed"); this.renderProgram(); })));
      wrap.appendChild(field("Tag", inputTag(obj.tag, (v) => { obj.tag = v.trim(); U.emit("project:changed"); })));
      wrap.appendChild(U.el("div", { class: "btn-row" }, [
        U.el("button", { class: "btn primary", text: "Done", onclick: () => { this.editing = null; this.renderProgram(); } }),
        U.el("button", { class: "btn", text: "🗑 Remove", onclick: () => {
          if (e.kind === "contact") plc.rungs[e.ri].branches[e.bi].splice(e.ci, 1);
          else plc.rungs[e.ri].outputs.splice(e.oi, 1);
          this.editing = null; U.emit("project:changed"); this.renderProgram();
        } }),
      ]));
      return wrap;
    },

    updateLadderViz() {
      if (!this.ladderRefs) return;
      const viz = eng.last.ladderViz;
      if (!viz) {
        this.ladderRefs.contacts.forEach((el) => el.classList.remove("energized"));
        this.ladderRefs.outputs.forEach((el) => el.classList.remove("energized"));
        return;
      }
      viz.rungs.forEach((rv, ri) => {
        rv.branches.forEach((bs, bi) => bs.forEach((on, ci) => {
          const el = this.ladderRefs.contacts.get(ri + "-" + bi + "-" + ci);
          if (el) el.classList.toggle("energized", on);
        }));
        rv.outputs.forEach((on, oi) => {
          const el = this.ladderRefs.outputs.get(ri + "-" + oi);
          if (el) el.classList.toggle("energized", on);
        });
      });
    },

    renderST(box, plc) {
      const ta = U.el("textarea", { class: "code" });
      ta.value = plc.st;
      ta.spellcheck = false;
      ta.addEventListener("input", () => { plc.st = ta.value; this.checkST(plc.st, status); });
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 2; plc.st = ta.value; }
      });
      box.appendChild(field("Program (runs every scan)", ta));
      const status = U.el("div");
      box.appendChild(status);
      box.appendChild(U.el("div", { class: "empty-note", html:
        "Built-ins: <code>TON/TOF/TP(name,IN,PT_ms)</code>, <code>R_TRIG/F_TRIG(name,CLK)</code>, " +
        "<code>ABS MIN MAX LIMIT SQRT</code>. Use I0.x / Q0.x / M0.x and your own variables." }));
      this.checkST(plc.st, status);
    },

    checkST(src, statusEl) {
      U.clear(statusEl);
      try {
        IASim.st.compile(src);
        statusEl.appendChild(U.el("div", { class: "st-ok", text: "✓ Compiles cleanly." }));
      } catch (e) {
        statusEl.appendChild(U.el("div", { class: "st-err", text: "✗ " + (e.message || e) + (e.line ? "  (line " + e.line + ")" : "") }));
      }
    },

    showStError(msg) {
      this.setStatus("ST runtime error: " + msg);
      if (this.activeTab === "program" && S.project.plc.lang === "st") this.renderProgram();
    },

    // ---------------- I/O & tags ----------------
    renderIO() {
      const box = U.clear(document.getElementById("tab-io"));
      box.appendChild(U.el("div", { class: "panel-title", text: "Live Tag Watch" }));
      this.ioBox = box;
      this.renderTagRows();
    },
    renderTagRows() {
      if (!this.ioBox) return;
      const box = this.ioBox;
      Array.from(box.querySelectorAll(".tag-dynamic")).forEach((n) => n.remove());
      const wrap = U.el("div", { class: "tag-dynamic" });
      const tags = eng.tags;
      const isIn = (k) => /^I\d/.test(k) || /^AI/.test(k);
      const isOut = (k) => /^Q\d/.test(k) || /^R\d/.test(k) || /^AQ/.test(k);
      const groups = [
        ["Inputs (digital + analog)", Object.keys(tags).filter(isIn).sort()],
        ["Outputs (Q · relay · analog)", Object.keys(tags).filter(isOut).sort()],
        ["Memory / Variables", Object.keys(tags).filter((k) => !isIn(k) && !isOut(k)).sort()],
      ];
      let any = false;
      groups.forEach(([name, keys]) => {
        if (!keys.length) return;
        any = true;
        wrap.appendChild(U.el("div", { class: "tag-group-h", text: name }));
        keys.forEach((k) => {
          const v = tags[k];
          const isBool = typeof v === "boolean";
          const on = U.truthy(v);
          wrap.appendChild(U.el("div", { class: "tag-row" }, [
            U.el("div", { class: "tag-dot" + (on ? " on" : "") }),
            U.el("div", { class: "tag-name", text: k }),
            U.el("div", { class: "tag-val", text: isBool ? (v ? "TRUE" : "FALSE") : String(v) }),
          ]));
        });
      });
      if (!any) wrap.appendChild(U.el("div", { class: "empty-note", text:
        "No tags yet. Press ▶ Run, then drive inputs with the field-device controls (select a button/sensor)." }));
      box.appendChild(wrap);
    },

    // ---------------- checks / validation ----------------
    renderChecks() {
      const box = U.clear(document.getElementById("tab-checks"));
      box.appendChild(U.el("div", { class: "panel-title" }, [
        "Wiring Checks",
        U.el("button", { class: "btn sm", text: "Re-run", style: "float:right; margin-top:-4px;",
          onclick: () => IASim.validate.run() }),
      ]));
      const issues = (IASim.validate.last || []).slice();
      if (!issues.length) {
        box.appendChild(U.el("div", { class: "check-clean", text: "✓ No wiring problems detected." }));
        box.appendChild(U.el("div", { class: "empty-note", html:
          "Checks run automatically as you wire. They flag short circuits, mixed 240V/24V nets, " +
          "unpowered supplies/sensors, floating loads, and output conflicts." }));
        return;
      }
      const order = { error: 0, warn: 1, info: 2 };
      issues.sort((a, b) => order[a.level] - order[b.level]);
      const ico = { error: "⛔", warn: "⚠️", info: "ℹ️" };
      issues.forEach((i) => {
        box.appendChild(U.el("div", { class: "check-item " + i.level, onclick: () => {
          if (i.comps[0]) { S.select("comp", i.comps[0]); }
        } }, [
          U.el("div", { class: "ico", text: ico[i.level] }),
          U.el("div", { class: "msg", text: i.msg }),
        ]));
      });
    },

    updateChecksBadge(issues) {
      const badge = document.getElementById("checks-badge");
      if (!badge) return;
      const errors = issues.filter((i) => i.level === "error").length;
      const warns = issues.filter((i) => i.level === "warn").length;
      badge.className = "badge";
      if (errors) { badge.classList.add("error"); badge.textContent = errors; }
      else if (warns) { badge.classList.add("warn"); badge.textContent = warns; }
      else badge.textContent = "";
    },

    // ---------------- toolbar ----------------
    bindToolbar() {
      document.querySelectorAll("#mode-group .mode-btn").forEach((b) => {
        b.addEventListener("click", () => this.setMode(b.dataset.mode));
      });
      document.getElementById("add-rail-btn").addEventListener("click", () => S.addRail());
      document.getElementById("delete-btn").addEventListener("click", () => this.deleteSelection());
      document.getElementById("run-btn").addEventListener("click", () => eng.start());
      document.getElementById("stop-btn").addEventListener("click", () => eng.stop());
      document.getElementById("save-btn").addEventListener("click", () => this.save());
      document.getElementById("load-btn").addEventListener("click", () => document.getElementById("load-input").click());
      document.getElementById("load-input").addEventListener("change", (e) => this.loadFile(e));
      document.getElementById("clear-btn").addEventListener("click", () => {
        if (confirm("Start a new empty project? Unsaved work will be lost.")) S.reset();
      });
    },

    setMode(mode) {
      S.mode = mode;
      if (mode !== "wire") IASim.wiring.cancel();
      document.querySelectorAll("#mode-group .mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
      document.getElementById("stage-hint").textContent =
        mode === "wire" ? "Wire mode: click a terminal, then another, to lay a cable. Esc / right-click / click empty space to cancel." :
        "Select mode: drag parts to move · scroll to zoom · drag background to pan.";
      this.setStatus(mode === "wire" ? "Wire mode active." : "Select mode active.");
    },

    deleteSelection() {
      const s = S.selection;
      if (!s) return;
      if (s.kind === "comp") S.removeComponent(s.id);
      else if (s.kind === "wire") S.removeWire(s.id);
      else if (s.kind === "rail") S.removeRail(s.id);
      S.select(null);
    },

    onSimState(on) {
      document.getElementById("run-btn").disabled = on;
      document.getElementById("stop-btn").disabled = !on;
      document.getElementById("scan-info").textContent = on ? "running…" : "stopped";
      if (!on) this.setStatus("Simulation stopped.");
      else this.setStatus("Simulation running.");
    },
    onTick() {
      const el = document.getElementById("scan-info");
      if (eng.running) el.textContent = "scan #" + eng.scanCount + " · " + eng.lastCycleMs.toFixed(1) + " ms";
      if (this.activeTab === "io") this.renderTagRows();
      if (this.activeTab === "program" && S.project.plc.lang === "ladder") this.updateLadderViz();
    },

    save() {
      const blob = new Blob([S.serialize()], { type: "application/json" });
      const a = U.el("a", { href: URL.createObjectURL(blob), download: "cabinet.iasim.json" });
      document.body.appendChild(a); a.click(); a.remove();
      this.setStatus("Project saved to cabinet.iasim.json");
    },
    loadFile(e) {
      const file = e.target.files[0];
      if (!file) return;
      const r = new FileReader();
      r.onload = () => { if (S.load(r.result)) this.setStatus("Project loaded."); };
      r.readAsText(file);
      e.target.value = "";
    },

    setStatus(msg) { document.getElementById("status-msg").textContent = msg; },
  };

  // ---- small form helpers ----
  function field(label, control) { return U.el("div", { class: "field" }, [U.el("label", { text: label }), control]); }
  function kv(k, v) { return U.el("div", { class: "kv" }, [U.el("span", { class: "k", text: k }), U.el("span", { class: "v", text: String(v) })]); }
  function inputText(val, onchange) { const i = U.el("input", { type: "text", value: val }); i.addEventListener("input", () => onchange(i.value)); return i; }
  function inputNum(val, onchange) { const i = U.el("input", { type: "number", value: val }); i.addEventListener("input", () => onchange(parseFloat(i.value) || 0)); return i; }
  function inputColor(val, onchange) { const i = U.el("input", { type: "color", value: val }); i.addEventListener("input", () => onchange(i.value)); return i; }
  function inputTag(val, onchange) {
    const i = U.el("input", { type: "text", value: val, list: "iasim-tags" });
    i.addEventListener("input", () => onchange(i.value));
    return i;
  }
  function select(options, val, onchange) {
    const s = U.el("select");
    options.forEach(([v, label]) => { const o = U.el("option", { value: v, text: label }); if (v === val) o.selected = true; s.appendChild(o); });
    s.addEventListener("change", () => onchange(s.value));
    return s;
  }
  function langBtn(label, active, onclick) {
    return U.el("button", { class: "btn" + (active ? " active" : ""), text: label, onclick });
  }

  // shared datalist of known tags for autocompletion
  function installTagDatalist() {
    const dl = U.el("datalist", { id: "iasim-tags" });
    KNOWN_TAGS.forEach((t) => dl.appendChild(U.el("option", { value: t })));
    document.body.appendChild(dl);
  }
  installTagDatalist();

  IASim.ui = UI;
})();
