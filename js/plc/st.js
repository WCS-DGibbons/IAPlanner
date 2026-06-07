/* IASim — Structured Text (IEC 61131-3 subset) compiler + interpreter.
 *
 * Supports: := assignment, IF/ELSIF/ELSE/END_IF, WHILE/DO/END_WHILE,
 * boolean (AND OR XOR NOT &), comparison (= <> < > <= >=),
 * arithmetic (+ - * / MOD), parentheses, TRUE/FALSE, numbers, strings,
 * comments (* *) and //, and function blocks:
 *   TON(name,IN,PT)  TOF(name,IN,PT)  TP(name,IN,PT)
 *   R_TRIG(name,CLK) F_TRIG(name,CLK)
 *   ABS MIN MAX LIMIT SQRT
 *
 * Tags (incl. dotted names like I0.0) are shared with the rest of the sim.
 */
(function () {
  "use strict";
  const IASim = window.IASim;

  const KEYWORDS = new Set([
    "IF", "THEN", "ELSIF", "ELSE", "END_IF", "WHILE", "DO", "END_WHILE",
    "AND", "OR", "XOR", "NOT", "MOD", "TRUE", "FALSE",
  ]);

  // ---------------- Lexer ----------------
  function tokenize(src) {
    const toks = [];
    let i = 0, line = 1;
    const n = src.length;
    const isIdStart = (c) => /[A-Za-z_]/.test(c);
    const isIdChar = (c) => /[A-Za-z0-9_.]/.test(c);
    const isDigit = (c) => /[0-9]/.test(c);

    while (i < n) {
      const c = src[i];
      if (c === "\n") { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }

      // comments
      if (c === "(" && src[i + 1] === "*") {
        i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === ")")) { if (src[i] === "\n") line++; i++; }
        i += 2; continue;
      }
      if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }

      // string
      if (c === '"' || c === "'") {
        const q = c; let s = ""; i++;
        while (i < n && src[i] !== q) { s += src[i]; i++; }
        i++; toks.push({ t: "STR", v: s, line }); continue;
      }

      // number
      if (isDigit(c)) {
        let s = ""; while (i < n && /[0-9.]/.test(src[i])) { s += src[i]; i++; }
        toks.push({ t: "NUM", v: parseFloat(s), line }); continue;
      }

      // identifier / keyword
      if (isIdStart(c)) {
        let s = ""; while (i < n && isIdChar(src[i])) { s += src[i]; i++; }
        const up = s.toUpperCase();
        if (KEYWORDS.has(up)) toks.push({ t: "KW", v: up, line });
        else toks.push({ t: "ID", v: s, line });
        continue;
      }

      // operators
      const two = src.substr(i, 2);
      if (two === ":=" || two === "<>" || two === "<=" || two === ">=") {
        toks.push({ t: "OP", v: two, line }); i += 2; continue;
      }
      if ("+-*/=<>(),;&".includes(c)) { toks.push({ t: "OP", v: c, line }); i++; continue; }

      throw { message: "Unexpected character '" + c + "'", line };
    }
    toks.push({ t: "EOF", v: null, line });
    return toks;
  }

  // ---------------- Parser ----------------
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const isKW = (v) => peek().t === "KW" && peek().v === v;
    const isOP = (v) => peek().t === "OP" && peek().v === v;
    function expectOP(v) { if (!isOP(v)) err("expected '" + v + "'"); return next(); }
    function expectKW(v) { if (!isKW(v)) err("expected '" + v + "'"); return next(); }
    function err(m) { throw { message: m + " but found '" + (peek().v) + "'", line: peek().line }; }

    function parseProgram() {
      const stmts = [];
      while (peek().t !== "EOF") stmts.push(parseStatement());
      return stmts;
    }

    function parseStatement() {
      if (isKW("IF")) return parseIf();
      if (isKW("WHILE")) return parseWhile();
      if (peek().t === "ID") {
        const id = next().v;
        expectOP(":=");
        const e = parseExpr();
        if (isOP(";")) next();
        return { k: "assign", name: id, expr: e };
      }
      err("expected statement");
    }

    function parseIf() {
      expectKW("IF");
      const node = { k: "if", clauses: [], elseBody: null };
      const cond = parseExpr(); expectKW("THEN");
      node.clauses.push({ cond, body: parseBlock(["ELSIF", "ELSE", "END_IF"]) });
      while (isKW("ELSIF")) {
        next(); const c = parseExpr(); expectKW("THEN");
        node.clauses.push({ cond: c, body: parseBlock(["ELSIF", "ELSE", "END_IF"]) });
      }
      if (isKW("ELSE")) { next(); node.elseBody = parseBlock(["END_IF"]); }
      expectKW("END_IF"); if (isOP(";")) next();
      return node;
    }

    function parseWhile() {
      expectKW("WHILE");
      const cond = parseExpr(); expectKW("DO");
      const body = parseBlock(["END_WHILE"]);
      expectKW("END_WHILE"); if (isOP(";")) next();
      return { k: "while", cond, body };
    }

    function parseBlock(terminators) {
      const stmts = [];
      while (!(peek().t === "KW" && terminators.includes(peek().v)) && peek().t !== "EOF")
        stmts.push(parseStatement());
      return stmts;
    }

    // expression precedence
    function parseExpr() { return parseOr(); }
    function parseOr() {
      let l = parseXor();
      while (isKW("OR")) { next(); l = { k: "bin", op: "OR", l, r: parseXor() }; }
      return l;
    }
    function parseXor() {
      let l = parseAnd();
      while (isKW("XOR")) { next(); l = { k: "bin", op: "XOR", l, r: parseAnd() }; }
      return l;
    }
    function parseAnd() {
      let l = parseNot();
      while (isKW("AND") || isOP("&")) { next(); l = { k: "bin", op: "AND", l, r: parseNot() }; }
      return l;
    }
    function parseNot() {
      if (isKW("NOT")) { next(); return { k: "un", op: "NOT", e: parseNot() }; }
      return parseCmp();
    }
    function parseCmp() {
      let l = parseAdd();
      while (peek().t === "OP" && ["=", "<>", "<", ">", "<=", ">="].includes(peek().v)) {
        const op = next().v; l = { k: "bin", op, l, r: parseAdd() };
      }
      return l;
    }
    function parseAdd() {
      let l = parseMul();
      while (isOP("+") || isOP("-")) { const op = next().v; l = { k: "bin", op, l, r: parseMul() }; }
      return l;
    }
    function parseMul() {
      let l = parseUnary();
      while (isOP("*") || isOP("/") || isKW("MOD")) {
        const op = next().v; l = { k: "bin", op, l, r: parseUnary() };
      }
      return l;
    }
    function parseUnary() {
      if (isOP("-")) { next(); return { k: "un", op: "NEG", e: parseUnary() }; }
      return parsePrimary();
    }
    function parsePrimary() {
      const tk = peek();
      if (tk.t === "NUM") { next(); return { k: "num", v: tk.v }; }
      if (tk.t === "STR") { next(); return { k: "str", v: tk.v }; }
      if (isKW("TRUE")) { next(); return { k: "bool", v: true }; }
      if (isKW("FALSE")) { next(); return { k: "bool", v: false }; }
      if (isOP("(")) { next(); const e = parseExpr(); expectOP(")"); return e; }
      if (tk.t === "ID") {
        next();
        if (isOP("(")) { // function call
          next(); const args = [];
          if (!isOP(")")) { args.push(parseExpr()); while (isOP(",")) { next(); args.push(parseExpr()); } }
          expectOP(")");
          return { k: "call", name: tk.v.toUpperCase(), args };
        }
        return { k: "var", name: tk.v };
      }
      err("expected expression");
    }

    const ast = parseProgram();
    return ast;
  }

  // ---------------- Interpreter ----------------
  function num(v) { return typeof v === "boolean" ? (v ? 1 : 0) : Number(v) || 0; }
  function bool(v) { return v === true || (typeof v === "number" && v !== 0); }

  const BUILTINS = {
    TON(args, ctx) {
      const name = String(args[0]), IN = bool(args[1]), PT = num(args[2]);
      const t = timer(ctx, name);
      if (IN) { t.elapsed = Math.min(PT, t.elapsed + ctx.dt); } else t.elapsed = 0;
      return IN && t.elapsed >= PT;
    },
    TOF(args, ctx) {
      const name = String(args[0]), IN = bool(args[1]), PT = num(args[2]);
      const t = timer(ctx, name);
      if (IN) { t.elapsed = 0; t.q = true; }
      else { t.elapsed = Math.min(PT, t.elapsed + ctx.dt); if (t.elapsed >= PT) t.q = false; }
      return t.q;
    },
    TP(args, ctx) {
      const name = String(args[0]), IN = bool(args[1]), PT = num(args[2]);
      const t = timer(ctx, name);
      if (IN && !t.prevIn && !t.running) { t.running = true; t.elapsed = 0; }
      if (t.running) { t.elapsed += ctx.dt; if (t.elapsed >= PT) t.running = false; }
      t.prevIn = IN;
      return t.running;
    },
    R_TRIG(args, ctx) {
      const name = String(args[0]), CLK = bool(args[1]);
      const e = edge(ctx, name); const q = CLK && !e.prev; e.prev = CLK; return q;
    },
    F_TRIG(args, ctx) {
      const name = String(args[0]), CLK = bool(args[1]);
      const e = edge(ctx, name); const q = !CLK && e.prev; e.prev = CLK; return q;
    },
    ABS: (a) => Math.abs(num(a[0])),
    SQRT: (a) => Math.sqrt(num(a[0])),
    MIN: (a) => Math.min.apply(null, a.map(num)),
    MAX: (a) => Math.max.apply(null, a.map(num)),
    LIMIT: (a) => Math.max(num(a[0]), Math.min(num(a[1]), num(a[2]))), // LIMIT(min,in,max)
  };
  function timer(ctx, name) { return (ctx.timers[name] = ctx.timers[name] || { elapsed: 0, q: false, running: false, prevIn: false }); }
  function edge(ctx, name) { return (ctx.edges[name] = ctx.edges[name] || { prev: false }); }

  function evalExpr(node, ctx) {
    switch (node.k) {
      case "num": return node.v;
      case "str": return node.v;
      case "bool": return node.v;
      case "var": { const v = ctx.tags[node.name]; return v === undefined ? false : v; }
      case "un":
        if (node.op === "NOT") return !bool(evalExpr(node.e, ctx));
        if (node.op === "NEG") return -num(evalExpr(node.e, ctx));
        break;
      case "call": {
        const fn = BUILTINS[node.name];
        if (!fn) throw { message: "Unknown function " + node.name, line: 0 };
        return fn(node.args.map((a) => evalExpr(a, ctx)), ctx);
      }
      case "bin": {
        const op = node.op;
        if (op === "AND") return bool(evalExpr(node.l, ctx)) && bool(evalExpr(node.r, ctx));
        if (op === "OR") return bool(evalExpr(node.l, ctx)) || bool(evalExpr(node.r, ctx));
        if (op === "XOR") return bool(evalExpr(node.l, ctx)) !== bool(evalExpr(node.r, ctx));
        const l = evalExpr(node.l, ctx), r = evalExpr(node.r, ctx);
        switch (op) {
          case "+": return num(l) + num(r);
          case "-": return num(l) - num(r);
          case "*": return num(l) * num(r);
          case "/": { const d = num(r); return d === 0 ? 0 : num(l) / d; }
          case "MOD": { const d = num(r); return d === 0 ? 0 : num(l) % d; }
          case "=": return num(l) === num(r);
          case "<>": return num(l) !== num(r);
          case "<": return num(l) < num(r);
          case ">": return num(l) > num(r);
          case "<=": return num(l) <= num(r);
          case ">=": return num(l) >= num(r);
        }
      }
    }
    throw { message: "Bad node", line: 0 };
  }

  function execBlock(stmts, ctx) {
    for (const s of stmts) execStmt(s, ctx);
  }
  function execStmt(s, ctx) {
    if (s.k === "assign") { ctx.tags[s.name] = evalExpr(s.expr, ctx); return; }
    if (s.k === "if") {
      for (const cl of s.clauses) if (bool(evalExpr(cl.cond, ctx))) return execBlock(cl.body, ctx);
      if (s.elseBody) execBlock(s.elseBody, ctx);
      return;
    }
    if (s.k === "while") {
      let guard = 0;
      while (bool(evalExpr(s.cond, ctx))) {
        execBlock(s.body, ctx);
        if (++guard > 100000) throw { message: "WHILE loop exceeded 100000 iterations (infinite?)", line: 0 };
      }
      return;
    }
  }

  /* compile(src) -> { ast } | throws {message,line}
   * run(ast, ctx)  executes one scan. ctx = {tags, timers, edges, dt}
   */
  function compile(src) { return { ast: parse(src) }; }
  function run(program, ctx) { execBlock(program.ast, ctx); }

  IASim.st = { compile, run, tokenize, parse };
})();
