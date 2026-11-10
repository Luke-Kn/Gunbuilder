export class TGB_Utility {
    constructor(parameters) {}

    /**
     * Canonical Scale Constants (Part 4)
     */
    static CANONICAL_SCALE_MM_TO_PX = 1.0; // 1 mm = 1 logical px
    static MIN_LOGICAL_STAGE_HEIGHT = 500; // Minimum stage height to avoid visual collapse

    /**
     * Calculates logical product dimensions preserving original Gallery image aspect ratio.
     *
     * Canonical Formula:
     *   logical_width = reference_mm
     *   logical_height = reference_mm * (image_height / image_width)
     *
     * @param {Object} product Normalized product data from TGB_Product_Data.
     * @return {{logicalWidth: number, logicalHeight: number}}
     */
    static calculateProductGeometry(product) {
        if (!product || !product.reference_mm) {
            return { logicalWidth: 0, logicalHeight: 0 };
        }

        const referenceMm = parseFloat(product.reference_mm) || 0;
        const img = product.builder_image || {};
        const imgWidth = parseFloat(img.width) || 1;
        const imgHeight = parseFloat(img.height) || 1;

        const logicalWidth = referenceMm * this.CANONICAL_SCALE_MM_TO_PX;
        const logicalHeight = logicalWidth * (imgHeight / imgWidth);

        return {
            logicalWidth: parseFloat(logicalWidth.toFixed(4)),
            logicalHeight: parseFloat(logicalHeight.toFixed(4)),
        };
    }

    /**
     * Calculates canonical stage dimensions and centered initial Base Gun placement.
     *
     * Stage provides generic workspace padding around the weapon for future
     * accessories (optics, muzzle devices, grips, stocks) without hardcoded coordinates.
     *
     * @param {{logicalWidth: number, logicalHeight: number}} baseGunGeometry
     * @return {{stageWidth: number, stageHeight: number, baseX: number, baseY: number}}
     */
    static calculateStageGeometry(baseGunGeometry) {
        const baseW = baseGunGeometry.logicalWidth || 0;
        const baseH = baseGunGeometry.logicalHeight || 0;

        // Generic workspace margins (proportional with reasonable minimums)
        const horizPadding = Math.max(200, Math.round(baseW * 0.2));
        const vertPadding = Math.max(120, Math.round(baseH * 0.4));

        const stageWidth = Math.round(baseW + horizPadding * 2);
        const stageHeight = Math.max(TGB_Utility.MIN_LOGICAL_STAGE_HEIGHT, Math.round(baseH + vertPadding * 2));

        // Center Base Gun inside logical workspace
        const baseX = Math.round((stageWidth - baseW) / 2);
        const baseY = Math.round((stageHeight - baseH) / 2);

        return {
            stageWidth,
            stageHeight,
            baseX,
            baseY,
        };
    }

    /**
     * Calculates responsive display scale for the whole stage.
     *
     * Single scale factor for entire scene; products never individually resized.
     * Max display scale is 1.0 (never stretched wider than canonical scale).
     *
     * @param {number} stageWidth Logical stage width in logical px.
     * @param {number} viewportWidth Available viewport width in physical CSS px.
     * @return {number} displayScale (unrounded floating-point value).
     */
    static calculateDisplayScale(stageWidth, viewportWidth) {
        if (!stageWidth || stageWidth <= 0 || !viewportWidth || viewportWidth <= 0) {
            return 1.0;
        }
        return Math.min(1.0, viewportWidth / stageWidth);
    }

    /**
     * Creates a generic product image layer element.
     *
     * Operates in canonical logical coordinates.
     *
     * @param {Object} product Normalized product data.
     * @param {number} x Logical X coordinate.
     * @param {number} y Logical Y coordinate.
     * @param {string} layerRole Role identifier (e.g. 'base', 'part').
     * @param {number} zIndex Layer stacking order.
     * @param {string|null} instanceId Unique Part instance ID.
     * @return {HTMLImageElement} Positioned image element.
     */
    static createLayerElement(product, x, y, layerRole = "base", zIndex = 10, instanceId = null) {
        const geometry = this.calculateProductGeometry(product);
        const img = document.createElement("img");

        const cleanRole = String(layerRole)
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "");
        img.className = "tgb-layer tgb-layer--" + cleanRole;
        img.classList.add("tgb-layer");
        img.classList.add("tgb-layer--" + cleanRole);
        img.src = product.builder_image.url;
        img.alt = product.builder_image.alt || product.name || "";
        img.draggable = false; // Prevent browser-native ghost drag (Section 27 & 48)

        // Store explicit canonical logical geometry in data attributes (Section 19)
        img.dataset.tgbX = String(x);
        img.dataset.tgbY = String(y);
        img.dataset.tgbWidth = String(geometry.logicalWidth);
        img.dataset.tgbHeight = String(geometry.logicalHeight);
        img.dataset.productId = String(product.productId || product.id || 0);
        img.dataset.attachmentId = String(
            product.builder_image && product.builder_image.attachment_id ? product.builder_image.attachment_id : 0,
        );
        img.dataset.layerRole = cleanRole;

        if (instanceId) {
            img.dataset.tgbInstanceId = String(instanceId);
        }

        // Apply logical absolute coordinates
        img.style.position = "absolute";
        img.style.left = x + "px";
        img.style.top = y + "px";
        img.style.width = geometry.logicalWidth + "px";
        img.style.height = geometry.logicalHeight + "px";
        img.style.zIndex = String(zIndex);

        return img;
    }

    // =========================================================================
    // 5. STRUCTURED MOUNTING & COMPATIBILITY RESOLVER (Part 7)
    // =========================================================================

    /**
     * Client-side Structured Mounting and Compatibility Resolver.
     *
     * Evaluates mount interface intersection, selects deterministic default
     * mount points, and computes canonical initial placement coordinates.
     */
    static TGB_Mounting = {
        /**
         * Evaluates compatibility status between a Base Gun and a Part product.
         *
         * @param {Object} baseProduct Normalized Base Gun product.
         * @param {Object} partProduct Normalized Part product.
         * @return {'compatible'|'incompatible'|'unconfigured'}
         */
        getCompatibility(baseProduct, partProduct) {
            if (!baseProduct || !partProduct) {
                return "unconfigured";
            }

            // Validate Base Gun mounting configuration
            const basePoints =
                baseProduct.mounting && Array.isArray(baseProduct.mounting.points) ? baseProduct.mounting.points : [];
            if (basePoints.length === 0) {
                return "unconfigured";
            }

            // Validate Part mounting configuration
            const partInterfaces =
                partProduct.mounting && Array.isArray(partProduct.mounting.interfaces)
                    ? partProduct.mounting.interfaces
                    : [];
            const partAnchor = partProduct.mounting && partProduct.mounting.anchor ? partProduct.mounting.anchor : null;

            if (
                partInterfaces.length === 0 ||
                !partAnchor ||
                typeof partAnchor.x_percent !== "number" ||
                typeof partAnchor.y_percent !== "number"
            ) {
                return "unconfigured";
            }

            const baseInterfaceIds = basePoints
                .map(pt => pt.interface && pt.interface.id)
                .filter(id => typeof id === "number" && id > 0);

            const partInterfaceIds = partInterfaces
                .map(iface => iface.id)
                .filter(id => typeof id === "number" && id > 0);

            const hasIntersection = partInterfaceIds.some(id => baseInterfaceIds.includes(id));

            return hasIntersection ? "compatible" : "incompatible";
        },

        /**
         * Finds the deterministic default mount point on a Base Gun for a Part.
         *
         * Iterates Base Gun mount points in their configured admin order and selects
         * the FIRST mount point whose interface ID matches an accepted Part interface ID.
         *
         * @param {Object} baseProduct Normalized Base Gun product.
         * @param {Object} partProduct Normalized Part product.
         * @return {Object|null} Matching mount point or null.
         */
        findDefaultMountPoint(baseProduct, partProduct) {
            if (this.getCompatibility(baseProduct, partProduct) !== "compatible") {
                return null;
            }

            const basePoints = baseProduct.mounting.points;
            const acceptedIds = partProduct.mounting.interfaces.map(iface => iface.id);

            for (let i = 0; i < basePoints.length; i++) {
                const pt = basePoints[i];
                if (pt.interface && acceptedIds.includes(pt.interface.id)) {
                    return pt;
                }
            }

            return null;
        },

        /**
         * Calculates canonical initial placement position for a Part docking to a Base Gun mount point.
         *
         * Formulas:
         *   absoluteMountX = baseX + mountX
         *   absoluteMountY = baseY + mountY
         *   partAnchorOffsetX = partWidth * anchorXPercent / 100
         *   partAnchorOffsetY = partHeight * anchorYPercent / 100
         *   initialPartX = absoluteMountX - partAnchorOffsetX
         *   initialPartY = absoluteMountY - partAnchorOffsetY
         *
         * Applies stage boundary clamping so Part is guaranteed fully within the logical stage.
         *
         * @param {number} baseX Base Gun logical stage X.
         * @param {number} baseY Base Gun logical stage Y.
         * @param {Object} mountPoint Selected Base Gun mount point { x, y }.
         * @param {number} partWidth Part logical width in mm/logical px.
         * @param {number} partHeight Part logical height in mm/logical px.
         * @param {number} anchorXPercent Part visual attachment anchor X (0-100).
         * @param {number} anchorYPercent Part visual attachment anchor Y (0-100).
         * @param {number} stageWidth Logical stage width.
         * @param {number} stageHeight Logical stage height.
         * @return {{x: number, y: number}} Canonical clamped stage coordinates.
         */
        calculateInitialPosition(
            baseX,
            baseY,
            mountPoint,
            partWidth,
            partHeight,
            anchorXPercent,
            anchorYPercent,
            stageWidth,
            stageHeight,
        ) {
            const mountX = parseFloat(mountPoint.x) || 0.0;
            const mountY = parseFloat(mountPoint.y) || 0.0;

            const absoluteMountX = baseX + mountX;
            const absoluteMountY = baseY + mountY;

            const partAnchorOffsetX = partWidth * (parseFloat(anchorXPercent) / 100.0);
            const partAnchorOffsetY = partHeight * (parseFloat(anchorYPercent) / 100.0);

            let initialX = Math.round(absoluteMountX - partAnchorOffsetX);
            let initialY = Math.round(absoluteMountY - partAnchorOffsetY);

            // Stage boundary clamping
            if (typeof stageWidth === "number" && stageWidth > 0) {
                initialX = Math.max(0, Math.min(initialX, Math.round(stageWidth - partWidth)));
            }
            if (typeof stageHeight === "number" && stageHeight > 0) {
                initialY = Math.max(0, Math.min(initialY, Math.round(stageHeight - partHeight)));
            }

            return { x: initialX, y: initialY };
        },

        /**
         * Calculates deterministic lower-left staging position for a newly added Part.
         *
         * Requirements (Part 11):
         *   - Staged in lower-left area of canonical stage.
         *   - Margin: base 20px with small deterministic stagger (+12px per part) so
         *     multiple parts do not completely obscure one another.
         *   - Bounded wrapping (modulo 6) so parts stay within lower-left staging zone.
         * Calculates a deterministic, non-overlapping initial staging position in the lower-left area.
         *
         * Staged parts are arranged left-to-right starting from the lower-left margin (20px).
         * When candidate space exceeds the available stage width, placement wraps to a new row ABOVE.
         * Staging positions use each part's actual logical dimensions (1 mm = 1 logical px) with a
         * 20px gap, preventing initial visual overlap while ensuring parts remain fully visible and easy to grab.
         *
         * @param {number} stageWidth Logical stage width in mm/logical px.
         * @param {number} stageHeight Logical stage height in mm/logical px.
         * @param {number} partWidth Part logical width in mm/logical px.
         * @param {number} partHeight Part logical height in mm/logical px.
         * @param {Array|number} [existingParts=[]] Array of existing part objects or count.
         * @param {Object|null} [baseGun=null] Base Gun geometry object { x, y, width, height }.
         * @return {{x: number, y: number}} Canonical clamped stage coordinates.
         */
        calculateStagingPosition(stageWidth, stageHeight, partWidth, partHeight, existingParts = [], baseGun = null) {
            const marginX = 20;
            const marginY = 20;
            const gap = 20;

            const sWidth = typeof stageWidth === "number" && stageWidth > 0 ? stageWidth : 1180;
            const sHeight = typeof stageHeight === "number" && stageHeight > 0 ? stageHeight : 500;
            const pWidth = Math.max(1, Math.round(partWidth || 50));
            const pHeight = Math.max(1, Math.round(partHeight || 50));

            // Extract Base Gun obstacle
            let baseGunBox = null;
            if (
                baseGun &&
                typeof baseGun.x === "number" &&
                typeof baseGun.y === "number" &&
                baseGun.width > 0 &&
                baseGun.height > 0
            ) {
                baseGunBox = {
                    x: Math.round(baseGun.x),
                    y: Math.round(baseGun.y),
                    width: Math.round(baseGun.width),
                    height: Math.round(baseGun.height),
                };
            }

            // Extract existing part obstacles
            const partObstacles = [];
            if (Array.isArray(existingParts)) {
                for (const part of existingParts) {
                    if (part && typeof part.x === "number" && typeof part.y === "number") {
                        partObstacles.push({
                            id: part.instanceId || part.id || "part",
                            x: Math.round(part.x),
                            y: Math.round(part.y),
                            width: Math.round(part.width || 50),
                            height: Math.round(part.height || 50),
                        });
                    }
                }
            }

            // Helper: test collision with another staged part (with gap padding)
            function collidesWithPart(candX, candY, candW, candH, part) {
                return (
                    candX < part.x + part.width + gap &&
                    candX + candW + gap > part.x &&
                    candY < part.y + part.height + gap &&
                    candY + candH + gap > part.y
                );
            }

            // Helper: test direct intersection with Base Gun
            function collidesWithBaseGun(candX, candY, candW, candH) {
                if (!baseGunBox) return false;
                return (
                    candX < baseGunBox.x + baseGunBox.width &&
                    candX + candW > baseGunBox.x &&
                    candY < baseGunBox.y + baseGunBox.height &&
                    candY + candH > baseGunBox.y
                );
            }

            // Helper: check collision against all active obstacles
            function getCollision(candX, candY) {
                for (const part of partObstacles) {
                    if (collidesWithPart(candX, candY, pWidth, pHeight, part)) {
                        return { type: "part", obj: part };
                    }
                }
                if (collidesWithBaseGun(candX, candY, pWidth, pHeight)) {
                    return { type: "base_gun", obj: baseGunBox };
                }
                return null;
            }

            // Search row by row, originating from bottom margin and moving upward
            let currentRowBottom = marginY;
            const maxRows = 20;

            for (let row = 0; row < maxRows; row++) {
                const candidateY = Math.round(sHeight - pHeight - currentRowBottom);
                if (candidateY < marginY) {
                    break; // Pushed past top margin
                }

                let candidateX = marginX;
                let rowMaxHeight = pHeight;

                // Track tallest part overlapping this row
                for (const part of partObstacles) {
                    if (candidateY < part.y + part.height && candidateY + pHeight > part.y) {
                        if (part.height > rowMaxHeight) {
                            rowMaxHeight = part.height;
                        }
                    }
                }

                while (candidateX + pWidth + marginX <= sWidth) {
                    const collision = getCollision(candidateX, candidateY);
                    if (!collision) {
                        // Free non-overlapping spot found!
                        return {
                            x: Math.max(0, Math.min(candidateX, sWidth - pWidth)),
                            y: Math.max(0, Math.min(candidateY, sHeight - pHeight)),
                        };
                    }

                    // Advance past the collision
                    const jumpX = Math.round(collision.obj.x + collision.obj.width + gap);
                    if (jumpX <= candidateX) {
                        candidateX += gap;
                    } else {
                        candidateX = jumpX;
                    }
                }

                // Wrap to row above
                currentRowBottom += Math.round(rowMaxHeight + gap);
            }

            // Fallback: clamp within stage bounds
            const fallbackX = marginX;
            const fallbackY = Math.max(marginY, sHeight - pHeight - marginY);
            return { x: fallbackX, y: fallbackY };
        },
    };

    static productRegistry = new Map();

    static root = document.getElementById("taktik-gun-builder");
}
