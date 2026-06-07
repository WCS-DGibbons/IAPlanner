/* IASim — ladder logic model + evaluator.
 *
 * A rung = OR of branches; each branch = AND of contacts; drives output coils.
 *   contact: { type: 'NO' | 'NC', tag }
 *   output : { type: 'COIL' | 'SET' | 'RESET', tag }
 *
 * evaluate() mutates the shared `tags` table and returns per-element
 * conduction info for live visualization.
 */
(function () {
  "use strict";
  const IASim = window.IASim;
  const truthy = IASim.util.truthy;

  function contactConducts(c, tags) {
    const v = truthy(tags[c.tag]);
    return c.type === "NC" ? !v : v;
  }

  function evaluate(plc, tags) {
    const viz = { rungs: [] };
    for (const rung of plc.rungs) {
      const branchStates = [];
      let rungPower = false;
      for (const branch of rung.branches) {
        let conduct = branch.length > 0; // empty branch = wire (always true)
        const contactStates = [];
        for (const c of branch) {
          const ok = contactConducts(c, tags);
          contactStates.push(ok);
          conduct = conduct && ok;
        }
        branchStates.push(contactStates);
        rungPower = rungPower || conduct;
      }

      // apply outputs
      const outStates = [];
      for (const out of rung.outputs) {
        if (out.type === "COIL") tags[out.tag] = rungPower;
        else if (out.type === "SET") { if (rungPower) tags[out.tag] = true; }
        else if (out.type === "RESET") { if (rungPower) tags[out.tag] = false; }
        outStates.push(rungPower);
      }

      viz.rungs.push({ power: rungPower, branches: branchStates, outputs: outStates });
    }
    return viz;
  }

  // collect every tag referenced by the ladder program
  function referencedTags(plc) {
    const set = new Set();
    plc.rungs.forEach((r) => {
      r.branches.forEach((b) => b.forEach((c) => c.tag && set.add(c.tag)));
      r.outputs.forEach((o) => o.tag && set.add(o.tag));
    });
    return set;
  }

  IASim.ladder = { evaluate, referencedTags };
})();
