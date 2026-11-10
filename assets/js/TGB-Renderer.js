import { TGB_Utility } from "./TGB-Utility.js";
export class TGB_Renderer {
    constructor(rootEl, buildState) {
        this.root = rootEl;
        this.buildState = buildState;
        this.viewportEl = rootEl.querySelector("#tgb-stage-viewport");
        this.frameEl = rootEl.querySelector("#tgb-stage-frame");
        this.stageEl = rootEl.querySelector("#tgb-stage");
        this.loadingEl = rootEl.querySelector("#tgb-stage-loading");
        this.emptyEl = rootEl.querySelector("#tgb-stage-empty");
        this.invalidEl = rootEl.querySelector("#tgb-stage-invalid");
        this.errorEl = rootEl.querySelector("#tgb-stage-error");

        this.currentStageGeometry = null;
        this.currentBaseGunGeometry = null;
        this.currentDisplayScale = 1.0;
        this.layers = [];
        this.resizeObserver = null;
        this.interactions = null;
        this.initialized = false;

        // Subscribe renderer to authoritative Build State (Section 3 & 10)
        if (this.buildState) {
            this.stateUnsubscribe = this.buildState.subscribe(this.handleStateChange.bind(this));
        }

        this.instance = this;
    }

    /**
     * Handles events emitted by TGB_BuildState to synchronize the DOM.
     *
     * @param {Object} event State event payload.
     */
    handleStateChange(event) {
        if (!this.stageEl) {
            return;
        }

        switch (event.type) {
            case "part_added":
                this.mountPartLayer(event.part);
                break;

            case "part_removed":
                this.unmountPartLayer(event.instanceId);
                break;

            case "part_moved":
                this.syncPartLayerPosition(event.instanceId, event.x, event.y);
                break;

            case "reset":
            case "build_reset":
                this.clearPartLayers();
                break;
        }
    }

    /**
     * Initializes the renderer with initial data provided by PHP.
     */
    init() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        // Enable internal debug mode if requested via URL flag (?tgb_debug=1)
        try {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has("tgb_debug")) {
                this.root.classList.add("tgb-debug");
            }
        } catch (e) {
            // Ignore URL parsing errors
        }

        const dataScript = this.root.querySelector(".tgb-initial-render-data");
        let initialData = null;

        if (dataScript && dataScript.textContent) {
            try {
                initialData = JSON.parse(dataScript.textContent);
            } catch (e) {
                initialData = null;
            }
        }

        if (!initialData) {
            this.showEmptyState();
            return;
        }

        if ("empty" === initialData.status) {
            this.showEmptyState();
        } else if ("invalid" === initialData.status) {
            this.showInvalidState(initialData.message);
        } else if ("ready" === initialData.status && initialData.product) {
            this.loadAndRenderBaseGun(initialData.product);
        } else {
            this.showEmptyState();
        }
    }

    showEmptyState() {
        this.hideAllStates();
        if (this.emptyEl) {
            this.emptyEl.style.display = "flex";
        }
        if (this.frameEl) {
            this.frameEl.style.display = "none";
        }
    }

    showInvalidState(message) {
        this.hideAllStates();
        if (this.invalidEl) {
            if (message) {
                const desc = this.invalidEl.querySelector(".tgb-state-desc");
                if (desc) {
                    desc.textContent = message;
                }
            }
            this.invalidEl.style.display = "flex";
        }
        if (this.frameEl) {
            this.frameEl.style.display = "none";
        }
    }

    showErrorState(message) {
        this.hideAllStates();
        if (this.errorEl) {
            if (message) {
                const desc = this.errorEl.querySelector(".tgb-state-desc");
                if (desc) {
                    desc.textContent = message;
                }
            }
            this.errorEl.style.display = "flex";
        }
        if (this.frameEl) {
            this.frameEl.style.display = "none";
        }
    }

    showLoadingState() {
        this.hideAllStates();
        if (this.loadingEl) {
            this.loadingEl.style.display = "flex";
        }
        if (this.frameEl) {
            this.frameEl.style.display = "none";
        }
    }

    hideAllStates() {
        if (this.loadingEl) this.loadingEl.style.display = "none";
        if (this.emptyEl) this.emptyEl.style.display = "none";
        if (this.invalidEl) this.invalidEl.style.display = "none";
        if (this.errorEl) this.errorEl.style.display = "none";
    }

    /**
     * Preloads image and mounts Base Gun into the logical stage.
     *
     * @param {Object} product Normalized Base Gun product.
     */
    loadAndRenderBaseGun(product) {
        return new Promise(resolve => {
            if (!product || !product.builder_image || !product.builder_image.url) {
                this.showInvalidState("Weapon image is not available.");
                resolve(false);
                return;
            }

            this.showLoadingState();

            // Preload image
            const preloader = new Image();
            preloader.src = product.builder_image.url;

            preloader.onload = () => {
                this.hideAllStates();
                this.mountBaseGun(product);
                resolve(true);
            };

            preloader.onerror = () => {
                this.showErrorState();
                resolve(false);
            };
        });
    }

    /**
     * Mounts Base Gun layer and configures stage geometry.
     * Also populates the initial Build State.
     *
     * @param {Object} product Normalized Base Gun product.
     */
    mountBaseGun(product) {
        if (!this.stageEl || !this.frameEl || !this.viewportEl) {
            return;
        }

        // 1. Calculate Product & Stage Geometry
        this.currentBaseGunGeometry = TGB_Utility.calculateProductGeometry(product);
        this.currentStageGeometry = TGB_Utility.calculateStageGeometry(this.currentBaseGunGeometry);

        // 2. Set Logical Stage Dimensions
        this.stageEl.style.width = this.currentStageGeometry.stageWidth + "px";
        this.stageEl.style.height = this.currentStageGeometry.stageHeight + "px";

        // 3. Clear previous Base Gun layer if present (Section 44)
        const existingBase = this.stageEl.querySelector(".tgb-layer--base");
        if (existingBase && existingBase.parentNode) {
            existingBase.parentNode.removeChild(existingBase);
        }
        this.layers = this.layers.filter(l => l.layerRole !== "base");

        // 4. Mount Base Gun Layer
        const baseLayer = this.renderLayer(
            product,
            this.currentStageGeometry.baseX,
            this.currentStageGeometry.baseY,
            "base",
            10,
        );

        // 5. Update Authoritative Build State (Section 7)
        if (this.buildState) {
            this.buildState.setBaseGun({
                productId: product.id,
                x: this.currentStageGeometry.baseX,
                y: this.currentStageGeometry.baseY,
                width: this.currentBaseGunGeometry.logicalWidth,
                height: this.currentBaseGunGeometry.logicalHeight,
                name: product.name,
                reference_mm: product.reference_mm,
                builder_image: product.builder_image,
                price: product.price || null,
                weight: product.weight || null,
                mounting: product.mounting || null,
            });
        }

        // Render debug mount points if base gun has mount points (Part 7)
        this.renderDebugMountPoints(product, this.currentStageGeometry.baseX, this.currentStageGeometry.baseY);

        // 6. Reveal Frame
        this.frameEl.style.display = "block";

        // 7. Calculate & Apply Display Scale
        this.updateDisplayScale(this.viewportEl.clientWidth);

        // 8. Setup ResizeObserver
        this.setupResizeObserver();
    }

    /**
     * Mounts a Part DOM layer from a Part state object.
     *
     * @param {Object} part Part state entry.
     * @return {HTMLImageElement|null}
     */
    mountPartLayer(part) {
        if (!this.stageEl || !part) {
            return null;
        }

        const layerEl = TGB_Utility.createLayerElement(
            part,
            part.x,
            part.y,
            "part",
            part.zIndex || 20,
            part.instanceId,
        );

        this.stageEl.appendChild(layerEl);

        this.layers.push({
            instanceId: part.instanceId,
            product: part,
            x: part.x,
            y: part.y,
            layerRole: "part",
            zIndex: part.zIndex || 20,
            element: layerEl,
        });

        return layerEl;
    }

    /**
     * Unmounts a Part DOM layer by instance ID.
     *
     * @param {string} instanceId
     */
    unmountPartLayer(instanceId) {
        if (!this.stageEl || !instanceId) {
            return;
        }

        const layerIdx = this.layers.findIndex(l => l.instanceId === instanceId);
        if (layerIdx !== -1) {
            const layer = this.layers.splice(layerIdx, 1)[0];
            if (layer.element && layer.element.parentNode) {
                layer.element.parentNode.removeChild(layer.element);
            }
        } else {
            const el = this.stageEl.querySelector(`[data-tgb-instance-id="${instanceId}"]`);
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }
    }

    /**
     * Directly synchronizes a Part layer's DOM position during dragging.
     *
     * @param {string} instanceId
     * @param {number} x
     * @param {number} y
     */
    syncPartLayerPosition(instanceId, x, y) {
        let layer = this.layers.find(l => l.instanceId === instanceId);
        let el = layer ? layer.element : null;

        if (!el && this.stageEl) {
            el = this.stageEl.querySelector(`[data-tgb-instance-id="${instanceId}"]`);
        }

        if (el) {
            el.style.left = x + "px";
            el.style.top = y + "px";
            el.dataset.tgbX = String(x);
            el.dataset.tgbY = String(y);

            if (layer) {
                layer.x = x;
                layer.y = y;
            }
        }
    }

    /**
     * Clears all Part DOM layers from stage, preserving Base Gun.
     */
    clearPartLayers() {
        if (!this.stageEl) {
            return;
        }

        const partEls = this.stageEl.querySelectorAll(".tgb-layer--part");
        partEls.forEach(el => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });

        this.layers = this.layers.filter(l => l.layerRole === "base");
    }

    /**
     * Renders and appends a product layer inside the logical stage.
     *
     * @param {Object} product
     * @param {number} x Logical X.
     * @param {number} y Logical Y.
     * @param {string} layerRole Layer role identifier.
     * @param {number} zIndex Stacking order.
     * @param {string|null} instanceId Optional instance ID.
     * @return {HTMLImageElement}
     */
    renderLayer(product, x, y, layerRole = "base", zIndex = 10, instanceId = null) {
        const layerEl = TGB_Utility.createLayerElement(product, x, y, layerRole, zIndex, instanceId);
        this.stageEl.appendChild(layerEl);
        this.layers.push({
            instanceId: instanceId,
            product,
            x,
            y,
            layerRole,
            zIndex,
            element: layerEl,
        });
        return layerEl;
    }

    clearLayers() {
        while (this.stageEl && this.stageEl.firstChild) {
            this.stageEl.removeChild(this.stageEl.firstChild);
        }
        this.layers = [];
    }

    /**
     * Renders visual debug markers for Base Gun mount points (?tgb_debug=1).
     *
     * @param {Object} product Base Gun product data.
     * @param {number} baseX Base Gun logical stage X.
     * @param {number} baseY Base Gun logical stage Y.
     */
    renderDebugMountPoints(product, baseX, baseY) {
        if (!this.stageEl) return;

        // Clear previous markers
        const existing = this.stageEl.querySelectorAll(".tgb-mount-point-marker");
        existing.forEach(el => el.remove());

        if (!product || !product.mounting || !Array.isArray(product.mounting.points)) {
            return;
        }

        product.mounting.points.forEach(pt => {
            const marker = document.createElement("div");
            marker.className = "tgb-mount-point-marker";

            const absX = Math.round(baseX + (parseFloat(pt.x) || 0));
            const absY = Math.round(baseY + (parseFloat(pt.y) || 0));

            marker.style.left = absX + "px";
            marker.style.top = absY + "px";

            const ifaceName = pt.interface && pt.interface.name ? pt.interface.name : "";
            const tooltip = document.createElement("div");
            tooltip.className = "tgb-mount-point-tooltip";
            tooltip.textContent = `${pt.label || "Mount"} (${ifaceName})\nLocal: X ${pt.x} / Y ${pt.y}\nAbs: X ${absX} / Y ${absY}`;

            const crosshair = document.createElement("div");
            crosshair.className = "tgb-mount-point-crosshair";

            marker.appendChild(crosshair);
            marker.appendChild(tooltip);

            this.stageEl.appendChild(marker);
        });
    }

    /**
     * Updates display scale and frame dimensions based on available width.
     *
     * Preserves logical coordinates; scales whole stage proportionally.
     *
     * @param {number} availableWidth Available physical CSS width.
     */
    updateDisplayScale(availableWidth) {
        if (!this.currentStageGeometry || !this.stageEl || !this.frameEl) {
            return;
        }

        // Cleanly cancel any active drag interaction on viewport resize (Section 18)
        if (this.interactions) {
            this.interactions.cancelActiveDrag();
        }

        const scale = TGB_Utility.calculateDisplayScale(this.currentStageGeometry.stageWidth, availableWidth);
        this.currentDisplayScale = scale;

        // Physical display frame dimensions
        const physicalW = Math.round(this.currentStageGeometry.stageWidth * scale);
        const physicalH = Math.round(this.currentStageGeometry.stageHeight * scale);

        this.frameEl.style.width = physicalW + "px";
        this.frameEl.style.height = physicalH + "px";

        // Whole stage transform (Section 15 & 16)
        this.stageEl.style.transform = "scale(" + scale + ")";

        // Update internal debug HUD scale indicator if present
        const hudScale = this.root.querySelector("#tgb-stage-hud-scale");
        if (hudScale) {
            hudScale.textContent = "1mm = 1px (Scale: " + (scale * 100).toFixed(1) + "%)";
        }
    }

    /**
     * Observes viewport container width changes via ResizeObserver.
     */
    setupResizeObserver() {
        if (this.resizeObserver) {
            return;
        }

        if (window.ResizeObserver && this.viewportEl) {
            this.resizeObserver = new window.ResizeObserver(entries => {
                for (const entry of entries) {
                    const width = entry.contentRect ? entry.contentRect.width : this.viewportEl.clientWidth;
                    if (width > 0) {
                        this.updateDisplayScale(width);
                    }
                }
            });
            this.resizeObserver.observe(this.viewportEl);
        } else {
            // Window resize fallback
            const handleResize = () => {
                if (this.viewportEl) {
                    this.updateDisplayScale(this.viewportEl.clientWidth);
                }
            };
            window.addEventListener("resize", handleResize);
        }
    }

    setInteractions(interactions) {
        this.interactions = interactions;
    }

    /**
     * Inspection API for testing and verification
     */
    getDisplayScale() {
        return this.currentDisplayScale;
    }

    getStageGeometry() {
        return this.currentStageGeometry ? Object.assign({}, this.currentStageGeometry) : null;
    }

    getBaseGunGeometry() {
        return this.currentBaseGunGeometry ? Object.assign({}, this.currentBaseGunGeometry) : null;
    }

    getLayers() {
        return this.layers.slice();
    }

    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.stateUnsubscribe) {
            this.stateUnsubscribe();
        }
    }
}
