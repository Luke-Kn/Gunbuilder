import { TGB_CartClient } from "./TGB-CartClient.js";

export class TGB_CurrentBuild {
    constructor(root, buildState, productRegistry, currencyConfig = null, weightConfig = null) {
        this.root = root;
        this.buildState = buildState;
        this.productRegistry = productRegistry;
        this.currencyConfig = currencyConfig || (window.taktikGunBuilder && window.taktikGunBuilder.currency) || {};
        this.weightConfig = weightConfig || (window.taktikGunBuilder && window.taktikGunBuilder.weight) || {};

        this.countEl = root.querySelector("#tgb-sidebar-build-count");
        this.bodyEl = root.querySelector("#tgb-sidebar-build-body");
        this.announcerEl = root.querySelector("#tgb-live-announcer");

        this.cartClient = new TGB_CartClient(this.buildState, window.taktikGunBuilder);
        this.cartFeedback = null; // { type: 'success' | 'error', message: string, url?: string }

        this.boundStateChange = this.handleStateChange.bind(this);
        this.boundBodyClick = this.handleBodyClick.bind(this);
        this.instance = this;
    }

    init() {
        if (!this.bodyEl) return;

        // Subscribe to Build State (composition changes)
        this.buildState.subscribe(this.boundStateChange);

        // Listen for remove & cart button clicks via event delegation
        this.bodyEl.addEventListener("click", this.boundBodyClick);

        // Listen for Reset Build button
        const resetBtn = this.root.querySelector("#tgb-reset-build-btn");
        if (resetBtn) {
            resetBtn.addEventListener("click", () => this.handleResetBuild());
        }

        // Initial render
        this.render();
    }

    /**
     * Reacts strictly to composition-changing Build State events.
     * Ignores part_moved events completely (Requirement 8 & 9).
     */
    handleStateChange(event) {
        if (!event || event.type === "part_moved") {
            return;
        }
        // Clear error feedback on subsequent composition mutations
        if (this.cartFeedback && this.cartFeedback.type === "error") {
            this.cartFeedback = null;
        }
        this.render();
    }

    /**
     * Handles click events within the Current Build panel (Remove Part, Add Build to Cart).
     */
    handleBodyClick(event) {
        // Remove part button
        const removeBtn = event.target.closest(".tgb-build-item-remove");
        if (removeBtn) {
            const instanceId = removeBtn.getAttribute("data-instance-id");
            if (!instanceId) return;

            const part = this.buildState.getPart(instanceId);
            const partName = part ? part.name : "Component";

            // Remove part from authoritative Build State
            const removed = this.buildState.removePart(instanceId);
            if (removed) {
                this.announce(`${partName} removed from build.`);
            }
            return;
        }

        // Add Build to Cart button
        const addCartBtn = event.target.closest("#tgb-add-to-cart-btn");
        if (addCartBtn) {
            if (addCartBtn.disabled) return;
            this.handleAddBuildToCart();
            return;
        }

        // Reset Build button
        const resetBtn = event.target.closest("#tgb-reset-build-btn");
        if (resetBtn) {
            this.handleResetBuild();
            return;
        }
    }

    /**
     * Resets the build: clears Build State, stage, Current Build, and persisted storage.
     */
    handleResetBuild() {
        if (this.buildState) {
            this.buildState.reset();
            this.buildState.setBaseGun(null);
        }

        if (window.TGB && window.TGB.persistence) {
            window.TGB.persistence.clear();
        }

        if (window.TGB && window.TGB.renderer) {
            window.TGB.renderer.showEmptyState();
        }

        if (window.TGB && window.TGB.selection) {
            window.TGB.selection.syncAllCardButtons();
            window.TGB.selection.syncSidebar();
        }

        this.announce("Build reset. All components cleared.");
    }

    /**
     * Submits build via CartClient and coordinates loading & feedback UI.
     */
    async handleAddBuildToCart() {
        if (!this.cartClient || this.cartClient.isSubmitting) {
            return;
        }

        this.cartFeedback = null;
        this.render(); // Set loading button state

        const result = await this.cartClient.addBuildToCart();

        if (result.success) {
            const ref = result.data && result.data.build_reference ? result.data.build_reference : "";
            const cartUrl =
                result.data && result.data.cart_url
                    ? result.data.cart_url
                    : (window.taktikGunBuilder && window.taktikGunBuilder.cartUrl) || "/cart/";

            this.cartFeedback = {
                type: "success",
                message: ref ? `Build added to cart (${ref}).` : "Build added to cart.",
                url: cartUrl,
            };
            this.announce(`Build added to cart. Reference ${ref}.`);
        } else {
            this.cartFeedback = {
                type: "error",
                message: result.message || "We couldn't add this build to your cart.",
            };
            this.announce(`Error: ${this.cartFeedback.message}`);
        }

        this.render(); // Restore button state and render feedback message
    }

    /**
     * Announces accessible status messages to screen readers.
     */
    announce(message) {
        if (this.announcerEl) {
            this.announcerEl.textContent = "";
            void this.announcerEl.offsetWidth;
            this.announcerEl.textContent = message;
        }
    }

    /**
     * Formats numeric price according to WooCommerce currency settings (Requirements 21 & 22).
     */
    formatPrice(amount) {
        if (typeof amount !== "number" || isNaN(amount)) {
            return "";
        }

        const config = Object.assign(
            {
                symbol: "$",
                decimals: 2,
                decimal_separator: ".",
                thousand_separator: ",",
                price_format: "%1$s%2$s",
            },
            this.currencyConfig || {},
        );

        const decimals = typeof config.decimals === "number" ? config.decimals : 2;
        const isNegative = amount < 0;
        const absAmount = Math.abs(amount);

        const fixed = absAmount.toFixed(decimals);
        const parts = fixed.split(".");
        const integerPart = parts[0];
        const fractionalPart = parts[1];

        const thousandSep = typeof config.thousand_separator === "string" ? config.thousand_separator : ",";
        const decimalSep = typeof config.decimal_separator === "string" ? config.decimal_separator : ".";
        const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);

        let formattedNumber = formattedInteger;
        if (decimals > 0 && typeof fractionalPart !== "undefined") {
            formattedNumber += decimalSep + fractionalPart;
        }

        const symbol = config.symbol || "$";
        const format = config.price_format || "%1$s%2$s";
        let result = format.replace("%1$s", symbol).replace("%2$s", formattedNumber);

        return isNegative ? "-" + result : result;
    }

    /**
     * Formats weight in grams for customer display (Requirement 35).
     */
    formatWeight(grams) {
        if (typeof grams !== "number" || isNaN(grams) || grams < 0) {
            return null;
        }

        if (grams < 1000) {
            return `${Math.round(grams)} g`;
        }

        const kg = grams / 1000;
        return `${kg.toFixed(2)} kg`;
    }

    /**
     * Derives a deterministic summary model from current Build State + Product Registry (Requirement 39).
     */
    calculateSummary() {
        const baseGun = this.buildState.getBaseGun();
        const parts = this.buildState.parts || [];

        let knownSubtotal = 0;
        let priceUnknownCount = 0;
        let knownGrams = 0;
        let weightUnknownCount = 0;

        // Base Gun contribution
        let baseProduct = null;
        if (baseGun && baseGun.productId) {
            baseProduct = this.productRegistry.get(baseGun.productId);

            // Base Gun Price
            if (baseProduct && baseProduct.price && typeof baseProduct.price.unit_amount === "number") {
                knownSubtotal += baseProduct.price.unit_amount;
            } else if (baseGun.price && typeof baseGun.price.unit_amount === "number") {
                knownSubtotal += baseGun.price.unit_amount;
            } else {
                priceUnknownCount++;
            }

            // Base Gun Weight
            if (baseProduct && baseProduct.weight && typeof baseProduct.weight.grams === "number") {
                knownGrams += baseProduct.weight.grams;
            } else if (baseGun.weight && typeof baseGun.weight.grams === "number") {
                knownGrams += baseGun.weight.grams;
            } else {
                weightUnknownCount++;
            }
        }

        // Parts contribution (each instance counts individually, Requirement 12, 25, 34)
        const resolvedParts = parts.map(partInstance => {
            const product = this.productRegistry.get(partInstance.productId);

            let hasPrice = false;
            let unitPrice = null;
            if (product && product.price && typeof product.price.unit_amount === "number") {
                unitPrice = product.price.unit_amount;
                knownSubtotal += unitPrice;
                hasPrice = true;
            } else {
                priceUnknownCount++;
            }

            let hasWeight = false;
            let grams = null;
            if (product && product.weight && typeof product.weight.grams === "number") {
                grams = product.weight.grams;
                knownGrams += grams;
                hasWeight = true;
            } else {
                weightUnknownCount++;
            }

            return {
                instance: partInstance,
                product: product,
                unitPrice: unitPrice,
                hasPrice: hasPrice,
                grams: grams,
                hasWeight: hasWeight,
            };
        });

        const decimals =
            this.currencyConfig && typeof this.currencyConfig.decimals === "number" ? this.currencyConfig.decimals : 2;

        return {
            hasBase: Boolean(baseGun),
            baseGun: baseGun,
            baseProduct: baseProduct,
            itemCount: (baseGun ? 1 : 0) + parts.length,
            componentCount: parts.length,
            resolvedParts: resolvedParts,
            price: {
                knownSubtotal: parseFloat(knownSubtotal.toFixed(decimals)),
                unknownCount: priceUnknownCount,
                complete: priceUnknownCount === 0,
            },
            weight: {
                knownGrams: Math.round(knownGrams * 100) / 100,
                unknownCount: weightUnknownCount,
                complete: weightUnknownCount === 0,
            },
        };
    }

    /**
     * Renders the Current Build panel.
     */
    render() {
        if (!this.bodyEl) return;

        const summary = this.calculateSummary();

        // 1. Update count badge in header
        if (this.countEl) {
            if (!summary.hasBase) {
                this.countEl.textContent = "0 Items";
            } else if (summary.componentCount === 0) {
                this.countEl.textContent = "1 Weapon";
            } else if (summary.componentCount === 1) {
                this.countEl.textContent = "1 Weapon • 1 Component";
            } else {
                this.countEl.textContent = `1 Weapon • ${summary.componentCount} Components`;
            }
        }

        // Update Reset button visibility
        const resetBtn = this.root.querySelector("#tgb-reset-build-btn");
        if (resetBtn) {
            resetBtn.style.display = summary.hasBase ? "inline-flex" : "none";
        }

        // Clear body safely
        this.bodyEl.textContent = "";

        // 2. Empty State (no Base Gun)
        if (!summary.hasBase) {
            const placeholder = document.createElement("div");
            placeholder.className = "tgb-placeholder-notice";
            const p = document.createElement("p");
            p.textContent = "Choose a base platform below to begin your build.";
            placeholder.appendChild(p);
            this.bodyEl.appendChild(placeholder);
            return;
        }

        // 3. Base Platform Section
        const baseSection = document.createElement("div");
        baseSection.className = "tgb-current-build-section tgb-current-build-section--base";

        const baseTagWrap = document.createElement("div");
        baseTagWrap.className = "tgb-card-tag-wrap";

        const baseTag = document.createElement("div");
        baseTag.className = "tgb-card-tag";
        baseTag.textContent = "Base Platform";
        baseTagWrap.appendChild(baseTag);

        const isBaseOutOfStock = Boolean(
            summary.baseProduct && summary.baseProduct.stock && summary.baseProduct.stock.in_stock === false,
        );
        if (isBaseOutOfStock) {
            const baseStockBadge = document.createElement("span");
            baseStockBadge.className = "tgb-build-item-stock-badge tgb-build-item-stock-badge--unavailable";
            baseStockBadge.textContent = "Unavailable";
            baseTagWrap.appendChild(baseStockBadge);
        }
        baseSection.appendChild(baseTagWrap);

        const baseRow = document.createElement("div");
        baseRow.className = "tgb-build-item-row tgb-build-item-row--base" + (isBaseOutOfStock ? " is-unavailable" : "");

        // Base Thumbnail
        const baseThumbWrap = document.createElement("div");
        baseThumbWrap.className = "tgb-build-item-thumb-wrap";
        const baseThumb = document.createElement("img");
        baseThumb.className = "tgb-build-item-thumb";
        const baseImgUrl =
            summary.baseGun.builder_image && summary.baseGun.builder_image.url ? summary.baseGun.builder_image.url : "";
        baseThumb.src = baseImgUrl;
        baseThumb.alt = summary.baseGun.name || "Base Platform";
        baseThumb.loading = "lazy";
        baseThumbWrap.appendChild(baseThumb);
        baseRow.appendChild(baseThumbWrap);

        // Base Details
        const baseInfo = document.createElement("div");
        baseInfo.className = "tgb-build-item-info";

        const baseTitle = document.createElement("h4");
        baseTitle.className = "tgb-build-item-name";
        baseTitle.textContent = summary.baseGun.name;
        baseInfo.appendChild(baseTitle);

        const baseMeta = document.createElement("div");
        baseMeta.className = "tgb-build-item-meta";

        // Base Price
        const basePriceVal =
            summary.baseProduct &&
            summary.baseProduct.price &&
            typeof summary.baseProduct.price.unit_amount === "number"
                ? summary.baseProduct.price.unit_amount
                : summary.baseGun.price && typeof summary.baseGun.price.unit_amount === "number"
                  ? summary.baseGun.price.unit_amount
                  : null;

        if (typeof basePriceVal === "number") {
            const priceSpan = document.createElement("span");
            priceSpan.className = "tgb-build-item-price";
            priceSpan.textContent = this.formatPrice(basePriceVal);
            baseMeta.appendChild(priceSpan);
        }

        // Base Weight
        const baseGramsVal =
            summary.baseProduct && summary.baseProduct.weight && typeof summary.baseProduct.weight.grams === "number"
                ? summary.baseProduct.weight.grams
                : summary.baseGun.weight && typeof summary.baseGun.weight.grams === "number"
                  ? summary.baseGun.weight.grams
                  : null;

        if (typeof baseGramsVal === "number") {
            const weightSpan = document.createElement("span");
            weightSpan.className = "tgb-build-item-weight";
            weightSpan.textContent = this.formatWeight(baseGramsVal);
            baseMeta.appendChild(weightSpan);
        }

        baseInfo.appendChild(baseMeta);
        baseRow.appendChild(baseInfo);
        baseSection.appendChild(baseRow);
        this.bodyEl.appendChild(baseSection);

        // 4. Components Section
        const compSection = document.createElement("div");
        compSection.className = "tgb-current-build-section tgb-current-build-section--components";

        const compHeader = document.createElement("div");
        compHeader.className = "tgb-current-build-section-header";
        const compTitle = document.createElement("h3");
        compTitle.className = "tgb-current-build-section-title";
        compTitle.textContent = `Components (${summary.componentCount})`;
        compHeader.appendChild(compTitle);
        compSection.appendChild(compHeader);

        if (summary.componentCount === 0) {
            const emptyComp = document.createElement("div");
            emptyComp.className = "tgb-build-empty-components";
            emptyComp.textContent = "No components added yet. Choose parts from the catalog below.";
            compSection.appendChild(emptyComp);
        } else {
            const compList = document.createElement("div");
            compList.className = "tgb-build-components-list";

            summary.resolvedParts.forEach(item => {
                const isOutOfStock = Boolean(
                    item.product && item.product.stock && item.product.stock.in_stock === false,
                );

                const partRow = document.createElement("div");
                partRow.className = "tgb-build-item-row" + (isOutOfStock ? " is-unavailable" : "");
                partRow.setAttribute("data-instance-id", item.instance.instanceId);

                // Thumbnail
                const thumbWrap = document.createElement("div");
                thumbWrap.className = "tgb-build-item-thumb-wrap";
                const thumb = document.createElement("img");
                thumb.className = "tgb-build-item-thumb";
                const imgUrl =
                    item.instance.builder_image && item.instance.builder_image.url
                        ? item.instance.builder_image.url
                        : item.product && item.product.builder_image
                          ? item.product.builder_image.url
                          : "";
                thumb.src = imgUrl;
                thumb.alt = item.instance.name || "Component";
                thumb.loading = "lazy";
                thumbWrap.appendChild(thumb);
                partRow.appendChild(thumbWrap);

                // Details
                const info = document.createElement("div");
                info.className = "tgb-build-item-info";

                // Header row with Type badge, Stock status, and Remove button
                const headerRow = document.createElement("div");
                headerRow.className = "tgb-build-item-header";

                const badgesWrap = document.createElement("div");
                badgesWrap.className = "tgb-build-item-badges";

                if (item.instance.partTypeName) {
                    const typeBadge = document.createElement("span");
                    typeBadge.className = "tgb-build-item-type";
                    typeBadge.textContent = item.instance.partTypeName;
                    badgesWrap.appendChild(typeBadge);
                }

                if (isOutOfStock) {
                    const stockBadge = document.createElement("span");
                    stockBadge.className = "tgb-build-item-stock-badge tgb-build-item-stock-badge--unavailable";
                    stockBadge.textContent = "Unavailable";
                    badgesWrap.appendChild(stockBadge);
                }

                headerRow.appendChild(badgesWrap);

                // Remove button
                const removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className = "tgb-build-item-remove";
                removeBtn.setAttribute("data-instance-id", item.instance.instanceId);
                removeBtn.setAttribute("aria-label", `Remove ${item.instance.name} from build`);
                removeBtn.title = "Remove component";
                removeBtn.innerHTML =
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
                headerRow.appendChild(removeBtn);

                info.appendChild(headerRow);

                // Part Name
                const nameEl = document.createElement("h4");
                nameEl.className = "tgb-build-item-name";
                nameEl.textContent = item.instance.name;
                info.appendChild(nameEl);

                // Price and Weight row
                const metaRow = document.createElement("div");
                metaRow.className = "tgb-build-item-meta";

                if (item.hasPrice) {
                    const priceSpan = document.createElement("span");
                    priceSpan.className = "tgb-build-item-price";
                    priceSpan.textContent = this.formatPrice(item.unitPrice);
                    metaRow.appendChild(priceSpan);
                } else {
                    const priceSpan = document.createElement("span");
                    priceSpan.className = "tgb-build-item-price tgb-build-item-price--unavailable";
                    priceSpan.textContent = "Price unavailable";
                    metaRow.appendChild(priceSpan);
                }

                if (item.hasWeight) {
                    const weightSpan = document.createElement("span");
                    weightSpan.className = "tgb-build-item-weight";
                    weightSpan.textContent = this.formatWeight(item.grams);
                    metaRow.appendChild(weightSpan);
                } else {
                    const weightSpan = document.createElement("span");
                    weightSpan.className = "tgb-build-item-weight tgb-build-item-weight--unavailable";
                    weightSpan.textContent = "Weight unavailable";
                    metaRow.appendChild(weightSpan);
                }

                info.appendChild(metaRow);
                partRow.appendChild(info);
                compList.appendChild(partRow);
            });

            compSection.appendChild(compList);
        }

        this.bodyEl.appendChild(compSection);

        // 5. Build Summary Section (Subtotal and Total Weight)
        const summarySection = document.createElement("div");
        summarySection.className = "tgb-build-summary";

        // Summary Header
        const sumHeader = document.createElement("div");
        sumHeader.className = "tgb-build-summary-header";
        sumHeader.textContent = "Build Summary";
        summarySection.appendChild(sumHeader);

        // Row: Total Weight
        const weightRow = document.createElement("div");
        weightRow.className = "tgb-summary-row";

        const weightLabel = document.createElement("span");
        weightLabel.className = "tgb-summary-label";
        weightLabel.textContent = "Total Weight";
        weightRow.appendChild(weightLabel);

        const weightValWrap = document.createElement("div");
        weightValWrap.className = "tgb-summary-val-wrap";

        const weightVal = document.createElement("span");
        weightVal.className = "tgb-summary-value tgb-summary-value--weight";
        if (summary.weight.knownGrams > 0) {
            weightVal.textContent = this.formatWeight(summary.weight.knownGrams);
        } else if (summary.weight.complete) {
            weightVal.textContent = "0 g";
        } else {
            weightVal.textContent = "Unavailable";
        }
        weightValWrap.appendChild(weightVal);

        if (!summary.weight.complete) {
            const weightNote = document.createElement("span");
            weightNote.className = "tgb-summary-note";
            weightNote.textContent = `Weight unavailable for ${summary.weight.unknownCount} item${summary.weight.unknownCount > 1 ? "s" : ""}`;
            weightValWrap.appendChild(weightNote);
        }

        weightRow.appendChild(weightValWrap);
        summarySection.appendChild(weightRow);

        // Divider before subtotal
        const divider = document.createElement("hr");
        divider.className = "tgb-summary-divider";
        summarySection.appendChild(divider);

        // Row: Product Subtotal
        const priceRow = document.createElement("div");
        priceRow.className = "tgb-summary-row tgb-summary-row--total";

        const priceLabel = document.createElement("span");
        priceLabel.className = "tgb-summary-label tgb-summary-label--total";
        priceLabel.textContent = "Product Subtotal";
        priceRow.appendChild(priceLabel);

        const priceValWrap = document.createElement("div");
        priceValWrap.className = "tgb-summary-val-wrap";

        const priceVal = document.createElement("span");
        priceVal.className = "tgb-summary-value tgb-summary-value--price";
        priceVal.textContent = this.formatPrice(summary.price.knownSubtotal);
        priceValWrap.appendChild(priceVal);

        if (!summary.price.complete) {
            const priceNote = document.createElement("span");
            priceNote.className = "tgb-summary-note";
            priceNote.textContent = `Price unavailable for ${summary.price.unknownCount} item${summary.price.unknownCount > 1 ? "s" : ""}`;
            priceValWrap.appendChild(priceNote);
        }

        priceRow.appendChild(priceValWrap);
        summarySection.appendChild(priceRow);

        // 6. Add Build to Cart Actions Container (Part 9, Requirements 29, 30, 32, 35)
        const actionsWrap = document.createElement("div");
        actionsWrap.className = "tgb-current-build-actions";

        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.id = "tgb-add-to-cart-btn";
        addBtn.className = "tgb-btn tgb-btn--primary tgb-add-to-cart-btn";

        if (!summary.hasBase) {
            addBtn.disabled = true;
            addBtn.textContent = "Choose a base platform to start your build";
            addBtn.classList.add("is-disabled");
        } else if (this.cartClient && this.cartClient.isSubmitting) {
            addBtn.disabled = true;
            addBtn.classList.add("is-loading");
            addBtn.textContent = "Adding Build...";
        } else {
            addBtn.disabled = false;
            addBtn.textContent = "Add Build to Cart";
        }
        actionsWrap.appendChild(addBtn);

        // Render feedback status (success or error)
        if (this.cartFeedback) {
            const fb = document.createElement("div");
            fb.className = `tgb-cart-feedback tgb-cart-feedback--${this.cartFeedback.type}`;
            fb.setAttribute("role", this.cartFeedback.type === "error" ? "alert" : "status");

            const msgWrap = document.createElement("div");
            msgWrap.className = "tgb-cart-feedback__message";

            if (this.cartFeedback.type === "success") {
                msgWrap.innerHTML =
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            } else {
                msgWrap.innerHTML =
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
            }

            const span = document.createElement("span");
            span.textContent = this.cartFeedback.message;
            msgWrap.appendChild(span);
            fb.appendChild(msgWrap);

            if (this.cartFeedback.type === "success" && this.cartFeedback.url) {
                const viewCartLink = document.createElement("a");
                viewCartLink.href = this.cartFeedback.url;
                viewCartLink.className = "tgb-btn tgb-btn--secondary tgb-btn--view-cart";
                viewCartLink.textContent = "View Cart";
                fb.appendChild(viewCartLink);
            }

            actionsWrap.appendChild(fb);
        }

        summarySection.appendChild(actionsWrap);

        this.bodyEl.appendChild(summarySection);
    }
}
