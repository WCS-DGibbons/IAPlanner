/* IASim — electrical net solver.
 * Builds connected "nets" from wires + any closed switch/relay/breaker bridges
 * using union-find. The engine then decides which nets are energized (24V).
 */
(function () {
  "use strict";
  const IASim = window.IASim;

  function key(comp, term) { return comp + "::" + term; }

  function UnionFind() {
    const parent = {};
    function find(x) {
      if (parent[x] === undefined) { parent[x] = x; return x; }
      let r = x;
      while (parent[r] !== r) r = parent[r];
      while (parent[x] !== r) { const n = parent[x]; parent[x] = r; x = n; }
      return r;
    }
    function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
    return { find, union, parent };
  }

  /* project: state.project
   * activeBridges: array of [{comp,term},{comp,term}] currently conducting.
   * Returns { root(comp,term), members: Map<rootKey, Array<{comp,term}>> }
   */
  function build(project, activeBridges) {
    const uf = UnionFind();

    // ensure every terminal exists as a node
    const cat = IASim.catalog;
    project.components.forEach((c) => {
      const def = cat.byId[c.typeId];
      if (!def) return;
      def.terminals.forEach((t) => uf.find(key(c.uid, t.id)));
    });

    // wires connect terminals
    project.wires.forEach((w) => uf.union(key(w.a.comp, w.a.term), key(w.b.comp, w.b.term)));

    // active conductive bridges (closed switches / relay contacts)
    (activeBridges || []).forEach((pair) =>
      uf.union(key(pair[0].comp, pair[0].term), key(pair[1].comp, pair[1].term))
    );

    const members = new Map();
    project.components.forEach((c) => {
      const def = cat.byId[c.typeId];
      if (!def) return;
      def.terminals.forEach((t) => {
        const r = uf.find(key(c.uid, t.id));
        if (!members.has(r)) members.set(r, []);
        members.get(r).push({ comp: c.uid, term: t.id });
      });
    });

    return {
      root(comp, term) { return uf.find(key(comp, term)); },
      members,
    };
  }

  IASim.nets = { build, key };
})();
