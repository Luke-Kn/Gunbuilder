export class TGB_Interactions {
  constructor(renderer, buildState) {
    this.renderer = renderer;
    this.buildState = buildState;
    this.activeDrag = null;

    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundPointerCancel = this.handlePointerCancel.bind(this);
  }

  /**
   * Attaches pointer event delegation on the logical stage.
   */
  init() {
    const stageEl = this.renderer.stageEl;
    if (!stageEl) {
      return;
    }

    stageEl.addEventListener("pointerdown", this.boundPointerDown);
  }

  /**
   * Handles pointerdown on draggable Part layers.
   *
   * @param {PointerEvent} e
   */
  handlePointerDown(e) {
    // Only accept primary pointer button (button 0 for mouse)
    if (e.button !== 0 && e.pointerType === "mouse") {
      return;
    }

    // Single active pointer policy (Section 47)
    if (this.activeDrag !== null) {
      return;
    }

    // Block dragging in read-only shared preview mode (Part 6)
    if (
      this.renderer &&
      this.renderer.root &&
      this.renderer.root.classList.contains("tgb-shared-preview-mode")
    ) {
      return;
    }

    // Must be on a draggable Part or Rail layer (NOT on Base Gun)
    const target = e.target.closest(".tgb-layer--part, .tgb-layer--rail");
    if (!target) {
      return;
    }

    const instanceId = target.dataset.tgbInstanceId;
    if (!instanceId) {
      return;
    }

    const isRail = target.classList.contains("tgb-layer--rail");
    const item = isRail
      ? this.buildState.getRail(instanceId)
      : this.buildState.getPart(instanceId);
    if (!item) {
      return;
    }

    e.preventDefault();

    // Capture pointer to guarantee continuous tracking (Section 13)
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {
      // Pointer capture fallback if unsupported or already captured
    }

    const displayScale = this.renderer.getDisplayScale() || 1.0;

    // Store drag start snapshot (Section 16)
    this.activeDrag = {
      pointerId: e.pointerId,
      instanceId: instanceId,
      isRail: isRail,
      element: target,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLogicalX: item.x,
      startLogicalY: item.y,
      partWidth: item.width,
      partHeight: item.height,
      displayScale: displayScale,
      latestClientX: e.clientX,
      latestClientY: e.clientY,
      rafId: null,
    };

    target.classList.add("is-dragging");

    target.addEventListener("pointermove", this.boundPointerMove);
    target.addEventListener("pointerup", this.boundPointerUp);
    target.addEventListener("pointercancel", this.boundPointerCancel);

    TGB_Interactions.updateDebugHUD(instanceId, item.x, item.y, displayScale);
  }

  /**
   * Handles pointermove during active dragging with rAF throttling.
   *
   * @param {PointerEvent} e
   */
  handlePointerMove(e) {
    if (!this.activeDrag || this.activeDrag.pointerId !== e.pointerId) {
      return;
    }

    e.preventDefault();

    this.activeDrag.latestClientX = e.clientX;
    this.activeDrag.latestClientY = e.clientY;

    // Schedule rAF update (Section 37 & 38)
    if (!this.activeDrag.rafId) {
      const rAF =
        window && typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame
          : (fn) => setTimeout(fn, 16);

      this.activeDrag.rafId = rAF(() => {
        if (!this.activeDrag) {
          return;
        }
        this.activeDrag.rafId = null;

        const physicalDeltaX =
          this.activeDrag.latestClientX - this.activeDrag.startClientX;
        const physicalDeltaY =
          this.activeDrag.latestClientY - this.activeDrag.startClientY;

        // Screen-to-logical coordinate conversion (Section 14)
        // logicalDelta = physicalDelta / displayScale
        const logicalDeltaX = physicalDeltaX / this.activeDrag.displayScale;
        const logicalDeltaY = physicalDeltaY / this.activeDrag.displayScale;

        const rawX = this.activeDrag.startLogicalX + logicalDeltaX;
        const rawY = this.activeDrag.startLogicalY + logicalDeltaY;

        // Stage boundary clamping in canonical logical coordinates (Section 24)
        const stageGeom = this.renderer.getStageGeometry();
        const stageW = stageGeom ? stageGeom.stageWidth : 1200;
        const stageH = stageGeom ? stageGeom.stageHeight : 600;

        const clampedX = Math.max(
          0,
          Math.min(rawX, stageW - this.activeDrag.partWidth),
        );
        const clampedY = Math.max(
          0,
          Math.min(rawY, stageH - this.activeDrag.partHeight),
        );

        // Update authoritative Build State (Section 3)
        if (this.activeDrag.isRail) {
          this.buildState.updateRailPosition(
            this.activeDrag.instanceId,
            clampedX,
            clampedY,
          );
        } else {
          this.buildState.updatePartPosition(
            this.activeDrag.instanceId,
            clampedX,
            clampedY,
          );
        }

        TGB_Interactions.updateDebugHUD(
          this.activeDrag.instanceId,
          clampedX,
          clampedY,
          this.activeDrag.displayScale,
        );
      });
    }
  }

  /**
   * Handles pointerup to cleanly finalize drag session.
   *
   * @param {PointerEvent} e
   */
  handlePointerUp(e) {
    if (!this.activeDrag || this.activeDrag.pointerId !== e.pointerId) {
      return;
    }
    this.endDrag();
  }

  /**
   * Handles pointercancel to cleanly abort drag session.
   *
   * @param {PointerEvent} e
   */
  handlePointerCancel(e) {
    if (!this.activeDrag || this.activeDrag.pointerId !== e.pointerId) {
      return;
    }
    this.endDrag();
  }

  /**
   * Cleans up active drag session, listeners, classes, and pointer capture.
   */
  endDrag() {
    if (!this.activeDrag) {
      return;
    }

    if (this.activeDrag.rafId) {
      const cAF =
        window && typeof window.cancelAnimationFrame === "function"
          ? window.cancelAnimationFrame
          : (id) => clearTimeout(id);
      cAF(this.activeDrag.rafId);
      this.activeDrag.rafId = null;
    }

    const element = this.activeDrag.element;
    const pointerId = this.activeDrag.pointerId;

    element.classList.remove("is-dragging");

    element.removeEventListener("pointermove", this.boundPointerMove);
    element.removeEventListener("pointerup", this.boundPointerUp);
    element.removeEventListener("pointercancel", this.boundPointerCancel);

    try {
      element.releasePointerCapture(pointerId);
    } catch (err) {
      // Pointer capture already released or element detached
    }

    const instanceId = element.getAttribute("data-tgb-instance-id");
    this.activeDrag = null;

    if (this.buildState && instanceId) {
      this.buildState._notify({
        type: "drag_ended",
        instanceId: instanceId,
        state: this.buildState.getState(),
      });
    }
  }

  /**
   * Cancels active drag safely (e.g. on viewport resize).
   */
  cancelActiveDrag() {
    if (this.activeDrag) {
      this.endDrag();
    }
  }

  /**
   * Updates debug HUD when active.
   *
   * @param {string} instanceId
   * @param {number} x
   * @param {number} y
   * @param {number} scale
   */
  static updateDebugHUD(instanceId, x, y, scale) {
    const hudEl = document.getElementById("tgb-stage-hud-scale");
    if (hudEl) {
      const shortId = instanceId ? instanceId.substring(0, 14) : "";
      hudEl.textContent = ` (Scale: ${(scale * 100).toFixed(1)}%) | Base [${shortId}] X: ${Math.round(x)} Y: ${Math.round(y)}`;
    }
  }

  destroy() {
    this.cancelActiveDrag();
    const stageEl = this.renderer.stageEl;
    if (stageEl) {
      stageEl.removeEventListener("pointerdown", this.boundPointerDown);
    }
  }
}
