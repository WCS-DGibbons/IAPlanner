/* IASim — wiring rule checker.
 * Static analysis of the cabinet: shorts, mixed voltage, unpowered devices,
 * floating loads, and output conflicts. Returns a list of issues; the UI shows
 * them in the Checks tab and the designer marks the offending components.
 */
(function () {
  "use strict";
  const IASim = window.IASim;
  const S = IASim.state;
  const cat = IASim.catalog;
  const nets = IASim.nets;

  // de-energized bridge state (relay NC closed, NO open) for a worst-case static view
  function staticBridges(project) {
    const bridges = [];
    const add = (comp, a, b) => bridges.push([{ comp, term: a }, { comp, term: b }]);
    project.components.forEach((c) => {
      const def = cat.byId[c.typeId];
      if (!def) return;
      switch (def.behavior) {
        case "terminal": def.bridge.forEach((p) => add(c.uid, p[0], p[1])); break;
        case "breaker": if (c.state.closed && !c.state.tripped) def.bridge.forEach((p) => add(c.uid, p[0], p[1])); break;
        case "button": if (c.state.pressed) def.bridge.forEach((p) => add(c.uid, p[0], p[1])); break;
        case "selector": if (c.state.closed) def.bridge.forEach((p) => add(c.uid, p[0], p[1])); break;
        case "relay": if (def.contactNC) add(c.uid, def.contactNC[0], def.contactNC[1]); break;
      }
    });
    return bridges;
  }

  const DC_SIGNAL = ["source24", "out", "in", "ain", "aio", "sigout", "aout", "pwr", "gnd", "bus"];
  const name = (uid) => { const c = S.getComponent(uid); return c ? cat.byId[c.typeId].name : "?"; };
  const hasWire = (project, uid, term) =>
    project.wires.some((w) => (w.a.comp === uid && w.a.term === term) || (w.b.comp === uid && w.b.term === term));

  function run() {
    const project = S.project;
    const issues = [];
    const net = nets.build(project, staticBridges(project));

    // ---- group terminals by net and collect the kinds present ----
    const groups = new Map(); // root -> { kinds:Map<kind,[{comp,term}]>, comps:Set }
    project.components.forEach((c) => {
      const def = cat.byId[c.typeId];
      if (!def) return;
      def.terminals.forEach((t) => {
        const r = net.root(c.uid, t.id);
        if (!groups.has(r)) groups.set(r, { kinds: new Map(), comps: new Set() });
        const g = groups.get(r);
        if (!g.kinds.has(t.kind)) g.kinds.set(t.kind, []);
        g.kinds.get(t.kind).push({ comp: c.uid, term: t.id });
        g.comps.add(c.uid);
      });
    });

    // ---- net-level checks ----
    groups.forEach((g) => {
      const has = (k) => g.kinds.has(k);
      const comps = Array.from(g.comps);
      // only meaningful if the net actually has a wire in it (more than one terminal)
      const terminalCount = Array.from(g.kinds.values()).reduce((n, a) => n + a.length, 0);
      if (terminalCount < 2) return;

      if (has("source24") && has("gnd"))
        issues.push(issue("error", "short-dc", "Short circuit: +24V tied directly to 0V (no load).", comps));
      if (has("mainsL") && has("mainsN"))
        issues.push(issue("error", "short-ac", "Short circuit: 240V L tied directly to N.", comps));
      if (has("mainsL") && DC_SIGNAL.some(has))
        issues.push(issue("error", "mixed-v", "Mixed voltage: 240V mains connected to a 24V/DC circuit.", comps));
      const outs = (g.kinds.get("out") || []).length;
      if (outs > 1)
        issues.push(issue("warn", "out-conflict", "Multiple PLC outputs are tied to the same net.", comps));
      if (has("out") && has("source24"))
        issues.push(issue("warn", "out-short", "A PLC output is tied to +24V — possible output short.", comps));
    });

    // ---- per-component checks ----
    project.components.forEach((c) => {
      const def = cat.byId[c.typeId];
      if (!def) return;
      const netHasKindAt = (term, kind) => {
        const r = net.root(c.uid, term);
        const g = groups.get(r);
        return g && g.kinds.has(kind);
      };

      if (def.behavior === "power") {
        if (!netHasKindAt(def.mainsInput || "L", "mainsL"))
          issues.push(issue("warn", "psu-unpowered", name(c.uid) + ": input L is not connected to 240V mains — it will not output 24V.", [c.uid]));
        else if (def.mainsNeutral && !netHasKindAt(def.mainsNeutral, "mainsN"))
          issues.push(issue("warn", "psu-neutral", name(c.uid) + ": neutral N is not connected to mains.", [c.uid]));
      }
      if (def.behavior === "sensor" || def.behavior === "asensor" || def.behavior === "mbsensor") {
        const pwr = def.terminals.find((t) => t.kind === "pwr");
        if (pwr && !netHasKindAt(pwr.id, "source24"))
          issues.push(issue("warn", "sensor-unpowered", name(c.uid) + ": + supply not connected to 24V — sensor will not read.", [c.uid]));
      }
      if (def.behavior === "lamp" || def.behavior === "motor" || def.behavior === "actuator") {
        const unwired = def.terminals.filter((t) => !hasWire(project, c.uid, t.id));
        if (unwired.length)
          issues.push(issue("warn", "floating-load", name(c.uid) + ": " + unwired.map((t) => t.label || t.id).join(", ") + " not connected — no complete circuit.", [c.uid]));
      }
      if (def.behavior === "plc") {
        const pw = def.terminals.find((t) => t.kind === "pwr");
        if (pw && !netHasKindAt(pw.id, "source24"))
          issues.push(issue("info", "plc-unpowered", name(c.uid) + ": " + (pw.label || pw.id) + " has no 24V supply (inputs/outputs still simulate, but wire it for realism).", [c.uid]));
      }
    });

    // ---- RS-485 / Modbus bus checks ----
    const masters = [];      // controller RS-485 ports
    const terms = [];        // 120Ω end-of-line resistors
    project.components.forEach((c) => {
      const def = cat.byId[c.typeId];
      if (!def) return;
      if (def.busPort)
        masters.push({ uid: c.uid, a: net.root(c.uid, def.busPort.a), b: net.root(c.uid, def.busPort.b) });
      if (def.behavior === "mbterm")
        terms.push({ uid: c.uid, a: net.root(c.uid, "A"), b: net.root(c.uid, "B") });
    });

    const onBus = new Map();  // master index -> [{uid, addr}]
    project.components.forEach((c) => {
      const def = cat.byId[c.typeId];
      if (!def || def.behavior !== "mbsensor") return;
      const a = net.root(c.uid, "A"), b = net.root(c.uid, "B");
      const mi = masters.findIndex((m) => m.a === a && m.b === b);
      if (mi >= 0) {
        if (!onBus.has(mi)) onBus.set(mi, []);
        onBus.get(mi).push({ uid: c.uid, addr: (c.state && c.state.addr) || 1 });
        return;
      }
      // A and B crossed over: the device is wired but can never answer.
      if (masters.some((m) => m.a === b && m.b === a)) {
        issues.push(issue("error", "bus-swapped", name(c.uid) + ": RS485 A and B are swapped — connect A to A and B to B, or the device will never reply.", [c.uid]));
        return;
      }
      if (hasWire(project, c.uid, "A") || hasWire(project, c.uid, "B"))
        issues.push(issue("warn", "bus-no-master", name(c.uid) + ": its RS485 bus does not reach a controller's A/B port — nothing is polling it.", [c.uid]));
      else
        issues.push(issue("warn", "bus-unwired", name(c.uid) + ": A and B are not wired — connect it to the RS485 bus.", [c.uid]));
    });

    // duplicate slave addresses, device count, and end-of-line termination
    onBus.forEach((devs, mi) => {
      const m = masters[mi];
      const byAddr = new Map();
      devs.forEach((d) => { if (!byAddr.has(d.addr)) byAddr.set(d.addr, []); byAddr.get(d.addr).push(d.uid); });
      byAddr.forEach((uids, addr) => {
        if (uids.length > 1)
          issues.push(issue("error", "bus-dup-addr", "Slave address " + addr + " is used by " + uids.length + " devices on the same bus — every device needs its own address.", uids.concat([m.uid])));
      });
      if (devs.length > 32)
        issues.push(issue("warn", "bus-too-many", "RS485 bus has " + devs.length + " devices — the standard allows 32 without a repeater.", [m.uid]));
      const terminated = terms.filter((t) => t.a === m.a && t.b === m.b).length;
      if (devs.length && terminated === 0)
        issues.push(issue("warn", "bus-unterminated", "RS485 bus has no 120Ω terminator — fit one at each far end of the run.", [m.uid]));
      else if (terminated > 2)
        issues.push(issue("warn", "bus-over-terminated", "RS485 bus has " + terminated + " terminators — fit exactly two, one at each end.", [m.uid]));
    });

    // de-duplicate identical messages
    const seen = new Set();
    const out = issues.filter((i) => { const k = i.code + "|" + i.msg; if (seen.has(k)) return false; seen.add(k); return true; });

    this.last = out;
    IASim.util.emit("checks:changed", out);
    return out;
  }

  function issue(level, code, msg, comps) { return { level, code, msg, comps: comps || [] }; }

  IASim.validate = { run, last: [] };
})();
