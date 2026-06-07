/* IASim — cable drawing tool (wire mode).
 * Click a terminal then another (or drag between them) to lay a cable.
 */
(function () {
  "use strict";
  const IASim = window.IASim;
  const U = IASim.util;
  const S = IASim.state;
  const D = IASim.designer;

  const W = {
    pending: null,     // {comp, term}
    preview: null,
    dragStarted: false,

    onTerminalDown(comp, term) {
      if (!this.pending) {
        this.pending = { comp, term };
        this.dragStarted = true;
        this.armTerminal(comp, term, true);
        this.ensurePreview();
        const p = D.terminalPos(comp, term);
        this.movePreviewTo(p);
        U.emit("status", "Wiring from " + term + " — click a second terminal (Esc to cancel).");
      } else if (this.pending.comp === comp && this.pending.term === term) {
        this.cancel(); // clicked same terminal again -> cancel
      } else {
        this.complete(comp, term);
      }
    },

    onPointerMove(world) {
      if (this.pending && this.preview) this.movePreviewTo(world);
    },

    onPointerUp(e) {
      if (this.pending && this.dragStarted) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const termEl = el && el.closest(".terminal");
        if (termEl && !(termEl.dataset.comp === this.pending.comp && termEl.dataset.term === this.pending.term)) {
          this.complete(termEl.dataset.comp, termEl.dataset.term);
        }
      }
      this.dragStarted = false;
    },

    complete(comp, term) {
      const from = this.pending;
      const wire = S.addWire(from, { comp, term });
      this.armTerminal(from.comp, from.term, false);
      this.pending = null;
      this.removePreview();
      if (wire) U.emit("status", "Cable added.");
      else U.emit("status", "Those terminals are already connected.");
    },

    cancel() {
      if (this.pending) this.armTerminal(this.pending.comp, this.pending.term, false);
      this.pending = null;
      this.removePreview();
      U.emit("status", "Wiring cancelled.");
    },

    armTerminal(comp, term, on) {
      const tg = D.els.terms.get(comp + "::" + term);
      if (tg) tg.classList.toggle("armed", on);
    },

    ensurePreview() {
      if (this.preview) return;
      this.preview = U.svg("path", { class: "wire-preview" });
      D.layers.overlay.appendChild(this.preview);
    },
    movePreviewTo(pt) {
      if (!this.pending || !this.preview) return;
      const a = D.terminalPos(this.pending.comp, this.pending.term);
      this.preview.setAttribute("d", `M ${a.x} ${a.y} L ${pt.x} ${pt.y}`);
    },
    removePreview() {
      if (this.preview && this.preview.parentNode) this.preview.parentNode.removeChild(this.preview);
      this.preview = null;
    },
  };

  IASim.wiring = W;
})();
