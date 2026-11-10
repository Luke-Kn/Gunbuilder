import { TGB_Utility } from "./TGB-Utility.js";

export class TGB_ProductSelection {
    /**
     * @param {HTMLElement} root Builder root element.
     * @param {TGB_CatalogClient} catalogClient
     * @param {TGB_BuildState} buildState
     * @param {TGB_Renderer} renderer
     * @param {Map} productRegistry
     */
    constructor(root, catalogClient, buildState, renderer, productRegistry) {
        this.root = root;
        this.catalog = catalogClient;
        this.buildState = buildState;
        this.renderer = renderer;
        this.productRegistry = productRegistry;

        this.navEl = root.querySelector("#tgb-category-nav");
        this.statusEl = root.querySelector("#tgb-tray-status");
        this.loadingEl = root.querySelector("#tgb-catalog-loading");
        this.gridEl = root.querySelector("#tgb-catalog-grid");
        this.actionsEl = root.querySelector("#tgb-catalog-actions");
        this.loadMoreBtn = root.querySelector("#tgb-load-more-btn");

        // Sidebar elements
        this.sidebarCountEl = root.querySelector("#tgb-sidebar-build-count");
        this.sidebarBodyEl = root.querySelector("#tgb-sidebar-build-body");

        this.categories = []; // [{ id: 'base_gun', name: 'Base Platform' }, ...]
        this.activeCategoryKey = "64";
        this.activeCategoryId = 64;

        this.categoryCache = new Map(); // key => { items: [], has_more: false, next_cursor: null, loaded: false }

        this.activeAbortController = null;
        this.requestId = 0;

        this.boundHandleTabClick = this.handleTabClick.bind(this);
        this.boundHandleGridClick = this.handleGridClick.bind(this);
        this.boundHandleLoadMore = this.handleLoadMore.bind(this);
        this.boundStateChange = this.handleStateChange.bind(this);
        this.instance = this;
    }

    /**
     * Initializes Product Selection UI.
     */
    async init() {
        if (!this.navEl || !this.gridEl) {
            return;
        }

        // 1. Setup Base Platform tab
        this.categories = [
            { id: 64, name: "All", slug: " " },
            { id: 74, name: "Optics", slug: " " },
            { id: 73, name: "Barrel", slug: " " },
            { id: 69, name: "Magazine", slug: " " },
            { id: 68, name: "Grips", slug: " " },
            { id: 70, name: "Silencers", slug: " " },
        ];
        // this.categories = [
        // 	//{ id: 'base_gun', name: 'Base Platform', slug: 'base-platform' }
        // ];

        // // 2. Fetch dynamic part types from API
        // try {
        // 	const partTypes = await this.catalog.getPartTypes();
        // 	if (Array.isArray(partTypes)) {
        // 		// Dynamic terms from taxonomy
        // 		partTypes.forEach(t => {
        // 			this.categories.push({
        // 				id: t.id,
        // 				name: t.name,
        // 				slug: t.slug,
        // 			});
        // 		});
        // 	}
        // } catch (err) {
        // 	console.warn('[TGB] Failed to fetch part types, proceeding with base platform:', err);
        // }

        // 3. Render Navigation Tabs
        this.renderCategoryNav();

        // 4. Attach Event Listeners
        this.navEl.addEventListener("click", this.boundHandleTabClick);
        this.gridEl.addEventListener("click", this.boundHandleGridClick);
        if (this.loadMoreBtn) {
            this.loadMoreBtn.addEventListener("click", this.boundHandleLoadMore);
        }

        // 5. Subscribe to Build State
        this.buildState.subscribe(this.boundStateChange);

        // 6. Pre-seed registry from initial render Base Gun if present
        const currentBase = await this.buildState.loadBase();

        if (currentBase && currentBase.productId) {
            const existing = this.productRegistry.get(currentBase.productId) || {};
            this.productRegistry.set(
                currentBase.productId,
                Object.assign({}, existing, {
                    id: currentBase.productId,
                    name: currentBase.name,
                    role: "base_gun",
                    reference_mm: currentBase.reference_mm,
                    builder_image: currentBase.builder_image,
                    price: currentBase.price || existing.price || null,
                    weight: currentBase.weight || existing.weight || null,
                    mounting: currentBase.mounting || existing.mounting || null,
                }),
            );
        }
        this.renderSizeSlider(currentBase);
        // 7. Load default category (Base Platform)
        await this.switchCategory("64");

        // 8. Initial sync with current build state
        this.syncSidebar();
    }

    renderSizeSlider(currentBase) {
        const slider = document.getElementById("sizeSlider");
        const label = document.getElementById("sizeValue");

        let currentBaseGunGeometry = TGB_Utility.calculateProductGeometry(currentBase.items[0]);
        let currentStageGeometry = TGB_Utility.calculateStageGeometry(currentBaseGunGeometry);

        slider.addEventListener("input", () => {
            label.textContent = `${slider.value} pixel = 0.1cm`;

            document.querySelectorAll(".tgb-layer").forEach(img => {
               
                let imgWidth = slider.value * img.dataset.tgbWidth;
                let imgHeight = slider.value * img.dataset.tgbHeight;

                img.style.width = imgWidth + "px";
                img.style.height = imgHeight + "px";

                if (img.classList.contains("tgb-layer--base")) {
                    img.style.marginLeft = (currentStageGeometry.stageWidth - imgWidth) / 2 - 160 + "px";
                   
                }
            });
        });
    }

    /**
     * Renders the category navigation tab buttons.
     */
    renderCategoryNav() {
        this.navEl.textContent = "";
        this.categories.forEach(cat => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "tgb-category-btn" + (cat.id === this.activeCategoryKey ? " is-active" : "");
            btn.setAttribute("role", "tab");
            btn.setAttribute("aria-selected", cat.id === this.activeCategoryKey ? "true" : "false");
            btn.setAttribute("data-category-key", String(cat.id));
            btn.textContent = cat.name;
            this.navEl.appendChild(btn);
        });
        let search_bar = document.getElementById("tgb-search-bar");

        search_bar.addEventListener("change", async e => {
            this.gridEl.textContent = "";
            this.showLoading();
            let data = await fetch(
                `http://localhost:10003/wp-json/tgb/v1/parts/search?type_id=${this.activeCategoryKey}&q=${search_bar.value}&limit=100`,
            ).then(response => response.json());
            this.hideLoading();
            this.renderProducts(data.items);
        });
    }

    /**
     * Switches to a category (with in-memory cache and request cancellation).
     *
     * @param {string|number} categoryKey
     * @param {boolean} [forceRefresh=false]
     */
    async switchCategory(categoryKey, forceRefresh = false) {
        categoryKey = String(categoryKey);

        // Cancel any pending in-flight request
        if (this.activeAbortController) {
            this.activeAbortController.abort();
            this.activeAbortController = null;
        }

        this.activeCategoryKey = categoryKey;

        // Update Tab UI
        const tabs = this.navEl.querySelectorAll(".tgb-category-btn");
        tabs.forEach(tab => {
            const isCurrent = tab.getAttribute("data-category-key") === String(categoryKey);
            tab.classList.toggle("is-active", isCurrent);
            tab.setAttribute("aria-selected", isCurrent ? "true" : "false");
        });

        this.hideStatus();

        // Check in-memory cache
        if (!forceRefresh && this.categoryCache.has(categoryKey)) {
            const cached = this.categoryCache.get(categoryKey);
            if (cached.loaded) {
                this.hideLoading();
                this.renderProducts(cached.items);
                this.updateLoadMoreAction(cached.has_more);
                return;
            }
        }

        // Fresh fetch
        const controller = new AbortController();
        this.activeAbortController = controller;
        const currentToken = ++this.requestId;

        this.showLoading();
        this.gridEl.textContent = "";
        if (this.actionsEl) {
            this.actionsEl.style.display = "none";
        }
        try {
            let res;
            // if (categoryKey === "base_gun") {
            //   res = await this.catalog.getBaseGuns(20, "", controller.signal);
            // } else {
            res = await this.catalog.getPartsByType(Number(categoryKey), 20, "", controller.signal);
            //

            // If another category request started in the meantime, discard
            if (this.requestId !== currentToken) {
                return;
            }

            const items = Array.isArray(res.items) ? res.items : [];
            const hasMore = Boolean(res.has_more);
            const nextCursor = res.next_cursor || null;

            // Store in registry
            items.forEach(p => {
                this.productRegistry.set(p.id, p);
            });
            // Save in cache
            this.categoryCache.set(categoryKey, {
                items: items,
                has_more: hasMore,
                next_cursor: nextCursor,
                loaded: true,
            });

            this.hideLoading();
            this.renderProducts(items);

            this.updateLoadMoreAction(hasMore);
        } catch (err) {
            if (err.name === "AbortError") {
                // Intentionally cancelled by rapid switching
                return;
            }
            if (this.requestId !== currentToken) {
                return;
            }
            this.hideLoading();
            this.showStatus("Products could not be loaded. Please try again.", true);
        } finally {
            if (this.activeAbortController === controller) {
                this.activeAbortController = null;
            }
        }
    }

    /**
     * Loads next batch for active category.
     */
    async handleLoadMore() {
        const cache = this.categoryCache.get(this.activeCategoryKey);
        if (!cache || !cache.has_more || !cache.next_cursor) {
            return;
        }

        if (this.loadMoreBtn) {
            this.loadMoreBtn.disabled = true;
            this.loadMoreBtn.textContent = "Loading...";
        }

        const controller = new AbortController();
        this.activeAbortController = controller;
        const currentToken = ++this.requestId;

        try {
            let res;
            // if (this.activeCategoryKey === "base_gun") {
            //   res = await this.catalog.getBaseGuns(
            //     20,
            //     cache.next_cursor,
            //     controller.signal,
            //   );
            // } else {
            //   res = await this.catalog.getPartsByType(
            //     Number(this.activeCategoryKey),
            //     20,
            //     cache.next_cursor,
            //     controller.signal,
            //   );
            // }

            if (this.requestId !== currentToken) {
                return;
            }

            const newItems = Array.isArray(res.items) ? res.items : [];
            const hasMore = Boolean(res.has_more);
            const nextCursor = res.next_cursor || null;

            newItems.forEach(p => {
                this.productRegistry.set(p.id, p);
                cache.items.push(p);
            });
            cache.has_more = hasMore;
            cache.next_cursor = nextCursor;

            this.appendProducts(newItems);
            this.updateLoadMoreAction(hasMore);
        } catch (err) {
            if (err.name === "AbortError") return;
            this.showStatus("Unable to load additional products.", false);
        } finally {
            if (this.loadMoreBtn) {
                this.loadMoreBtn.disabled = false;
                this.loadMoreBtn.textContent = "Load More";
            }
        }
    }

    /**
     * Renders a full list of product cards.
     *
     * @param {Array} items
     */
    renderProducts(items) {
        this.gridEl.textContent = "";

        if (!items || items.length === 0) {
            this.showStatus("No builder-ready products are available in this category.", false);
            return;
        }

        items.forEach(product => {
            const card = this.createProductCard(product);
            this.gridEl.appendChild(card);
            //console.log(this.gridEl);
        });
    }

    /**
     * Appends new product cards to existing grid.
     *
     * @param {Array} items
     */
    appendProducts(items) {
        if (!items || items.length === 0) return;
        items.forEach(product => {
            const card = this.createProductCard(product);
            this.gridEl.appendChild(card);
        });
    }

    /**
     * Creates an accessible, modern dark product card using safe DOM methods.
     *
     * @param {Object} product
     * @return {HTMLElement}
     */
    createProductCard(product) {
        const card = document.createElement("div");
        card.className = "tgb-product-card";
        card.setAttribute("data-product-id", String(product.id));

        const isBaseGun = product.role === "base_gun";
        const currentBase = this.buildState.getBaseGun();
        const isCurrentBaseSelected = isBaseGun && currentBase && currentBase.productId === product.id;

        if (isCurrentBaseSelected) {
            card.classList.add("is-selected");
        }

        // Thumbnail Container
        const thumbContainer = document.createElement("div");
        thumbContainer.className = "tgb-card-thumb";

        if (product.builder_image && product.builder_image.url) {
            const img = document.createElement("img");
            img.src = product.builder_image.url;
            img.alt = product.builder_image.alt || product.name || "Component";
            img.loading = "lazy";
            thumbContainer.appendChild(img);
        } else {
            const placeholder = document.createElement("div");
            placeholder.className = "tgb-card-no-img";
            placeholder.textContent = "No image";
            thumbContainer.appendChild(placeholder);
        }
        card.appendChild(thumbContainer);

        // Body Container
        const bodyContainer = document.createElement("div");
        bodyContainer.className = "tgb-card-body";

        // In-Build Count Badge
        const inBuildCount = this.getInBuildCount(product.id);
        const inBuildBadge = document.createElement("span");
        inBuildBadge.className = "tgb-card-in-build";
        inBuildBadge.setAttribute("data-in-build-product", String(product.id));
        if (inBuildCount > 0) {
            inBuildBadge.textContent = `In build: ${inBuildCount}`;
            inBuildBadge.style.display = "inline-block";
        } else {
            inBuildBadge.style.display = "none";
        }
        bodyContainer.appendChild(inBuildBadge);

        // Compatibility Badge (Part 7)
        if (!isBaseGun) {
            const compatBadge = document.createElement("span");
            compatBadge.className = "tgb-card-compat-badge";
            compatBadge.setAttribute("data-compat-product", String(product.id));

            const baseProduct = currentBase ? this.productRegistry.get(currentBase.productId) : null;
            if (baseProduct) {
                const compatStatus = TGB_Utility.TGB_Mounting.getCompatibility(baseProduct, product);
                if (compatStatus === "compatible") {
                    compatBadge.classList.add("tgb-card-compat-badge--compatible");
                    compatBadge.textContent = "Compatible";
                } else if (compatStatus === "incompatible") {
                    compatBadge.classList.add("tgb-card-compat-badge--incompatible");
                    compatBadge.textContent = "Not compatible with selected platform";
                } else {
                    compatBadge.classList.add("tgb-card-compat-badge--unconfigured");
                    compatBadge.textContent = "Mount information unavailable";
                }
                compatBadge.style.display = "inline-block";
            } else {
                compatBadge.style.display = "none";
            }
            bodyContainer.appendChild(compatBadge);
        }

        // Title (Safe DOM textContent)
        const titleEl = document.createElement("h4");
        titleEl.className = "tgb-card-title";
        titleEl.textContent = product.name;
        bodyContainer.appendChild(titleEl);

        // Price
        const priceEl = document.createElement("div");
        priceEl.className = "tgb-card-price";
        if (product.price && product.price.display) {
            priceEl.textContent = product.price.display;
        } else if (product.price && product.price.raw) {
            priceEl.textContent = "$" + parseFloat(product.price.raw).toFixed(2);
        }
        bodyContainer.appendChild(priceEl);

        // Action Button

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tgb-btn";
        btn.setAttribute("data-action", isBaseGun ? "select-base" : "add-part");
        btn.setAttribute("data-product-id", String(product.id));

        if (isBaseGun) {
            if (isCurrentBaseSelected) {
                btn.className += " tgb-btn--selected is-selected";
                btn.textContent = "Selected";
                btn.disabled = true;
            } else {
                btn.className += " tgb-btn--select";
                btn.textContent = "Select";
            }
        } else {
            // Part Button (Part 7: Compatibility + Inventory Priority)
            const hasBase = Boolean(currentBase);
            const baseProduct = hasBase ? this.productRegistry.get(currentBase.productId) : null;
            const inStock = !product.stock || product.stock.in_stock !== false;
            const compatStatus = baseProduct ? TGB_Utility.TGB_Mounting.getCompatibility(baseProduct, product) : null;

            if (!inStock) {
                btn.className += " tgb-btn--unavailable is-unavailable";
                btn.textContent = "Unavailable";
                btn.disabled = true;
            } else if (!hasBase) {
                btn.className += " tgb-btn--add";
                btn.textContent = "Add";
                btn.disabled = true;
                btn.title = "Choose a base platform first.";
            } else if (compatStatus !== "compatible") {
                btn.disabled = true;
                btn.textContent = "Add";
                if (compatStatus === "incompatible") {
                    btn.className += " tgb-btn--incompatible is-incompatible";
                    btn.title = "Not compatible with selected platform.";
                } else {
                    btn.className += " tgb-btn--unconfigured is-unconfigured";
                    btn.title = "Mount information unavailable.";
                }
            } else {
                btn.className += " tgb-btn--add";
                btn.textContent = "Add";
            }
        }

        if (product.variants.length > 0) {
            btn.setAttribute("data-action", "add-part-select");
            const select = document.createElement("select");
            select.classList.add("tk-select");
            let option = document.createElement("option");
            option.value = "";
            option.text = "Select an Option";
            select.appendChild(option);
            product.variants.forEach(element => {
                let option = document.createElement("option");
                option.value = element.product_id;
                option.text = element.name;
                select.appendChild(option);
            });
            bodyContainer.appendChild(select);
        }
        bodyContainer.appendChild(btn);
        card.appendChild(bodyContainer);

        return card;
    }

    /**
     * Returns how many instances of this product exist in the current build.
     *
     * @param {number} productId
     * @return {number}
     */
    getInBuildCount(productId) {
        const parts = this.buildState.parts || [];
        return parts.filter(p => p.productId === productId).length;
    }

    /**
     * Handles category tab clicks.
     */
    handleTabClick(e) {
        const btn = e.target.closest(".tgb-category-btn");
        if (!btn) return;
        const key = btn.getAttribute("data-category-key");
        if (key && key !== this.activeCategoryKey) {
            this.switchCategory(key);
        }
    }

    /**
     * Handles card action clicks (Select Base Gun or Add Part).
     */
    handleGridClick(e) {
        const btn = e.target.closest("button[data-action]");
        if (!btn || btn.disabled) return;

        const action = btn.getAttribute("data-action");
        const productId = parseInt(btn.getAttribute("data-product-id"), 10);
        const product = this.productRegistry.get(productId);

        if (!product) {
            console.warn("[TGB] Product not found in registry:", productId);
            return;
        }

        if (action === "select-base") {
            this.selectBaseGun(product);
        } else if (action === "add-part") {
            this.addPartToBuild(product);
        } else if (action === "add-part-select") {
            const select = e.target.closest("select");
            this.addPartToBuild(product);
        }
    }

    /**
     * Selects a Base Gun, recovering the builder if empty or invalid,
     * and clearing existing parts if replacing an already-mounted weapon.
     *
     * @param {Object} product Normalized Base Gun product.
     */
    selectBaseGun(product) {
        if (!product || product.role !== "base_gun") {
            return;
        }

        const currentBase = this.buildState.getBaseGun();

        // If same Base Gun already selected, no-op
        if (currentBase && currentBase.productId === product.id) {
            return;
        }

        // Base Gun Replacement Policy (Requirement 22 & 68):
        // If replacing an existing weapon, CLEAR all existing parts.
        if (currentBase && this.buildState.parts.length > 0) {
            this.buildState.reset();
        }

        // Store in registry
        this.productRegistry.set(product.id, product);

        // Preload and mount
        this.renderer.loadAndRenderBaseGun(product);

        // Synchronize UI
        this.syncAllCardButtons();
        this.syncSidebar();
    }

    /**
     * Adds a Part to the build in the lower-left staging area.
     *
     * In V1 (Part 11), newly added parts are staged deterministically in the
     * lower-left area of the stage with small stagger, allowing the customer
     * to freely drag them onto or around the gun. Mounting data remains active
     * for compatibility validation and future automated docking.
     *
     * @param {Object} product Normalized Part product.
     */
    addPartToBuild(product) {
        const currentBase = this.buildState.getBaseGun();
        if (!currentBase) {
            this.showStatus("Choose a base platform first.", false);
            return;
        }

        if (product.stock && product.stock.in_stock === false) {
            return;
        }

        const baseProduct = this.productRegistry.get(currentBase.productId);
        const compatStatus = TGB_Utility.TGB_Mounting.getCompatibility(baseProduct, product);
        if (compatStatus !== "compatible") {
            this.showStatus("This component is not compatible with the selected platform.", false);
            return;
        }

        // Store in registry
        this.productRegistry.set(product.id, product);

        // Lower-Left Staging Spawn (Part 12 non-overlapping placement):
        const stage = this.renderer.currentStageGeometry || {
            stageWidth: 1000,
            stageHeight: 600,
            baseX: 0,
            baseY: 0,
        };
        const geo = TGB_Utility.calculateProductGeometry(product);
        const existingParts = this.buildState.parts || [];
        const currentBaseGun =
            (this.buildState.getBaseGun && this.buildState.getBaseGun()) || this.buildState.baseGun || null;

        const initialPos = TGB_Utility.TGB_Mounting.calculateStagingPosition(
            stage.stageWidth,
            stage.stageHeight,
            geo.logicalWidth,
            geo.logicalHeight,
            existingParts,
            currentBaseGun,
        );

        // Add to authoritative Build State (Part 5 & 11 & 12)
        const partInstance = this.buildState.addPart(product, initialPos.x, initialPos.y);

        // Sync in-build count badges
        this.syncAllCardButtons();
        this.syncSidebar();

        return partInstance;
    }

    /**
     * Synchronizes card action buttons and in-build counts across the active grid.
     */
    syncAllCardButtons() {
        const currentBase = this.buildState.getBaseGun();
        const hasBase = Boolean(currentBase);

        const cards = this.gridEl.querySelectorAll(".tgb-product-card");
        cards.forEach(card => {
            const productId = parseInt(card.getAttribute("data-product-id"), 10);
            const product = this.productRegistry.get(productId);
            if (!product) return;

            const isBaseGun = product.role === "base_gun";
            const btn = card.querySelector("button[data-action]");
            const badge = card.querySelector(".tgb-card-in-build");

            // In-build count badge
            if (badge) {
                const count = this.getInBuildCount(productId);
                if (count > 0) {
                    badge.textContent = `In build: ${count}`;
                    badge.style.display = "inline-block";
                } else {
                    badge.style.display = "none";
                }
            }

            if (!btn) return;

            if (isBaseGun) {
                const isSelected = hasBase && currentBase.productId === productId;
                card.classList.toggle("is-selected", isSelected);
                if (isSelected) {
                    btn.className = "tgb-btn tgb-btn--selected is-selected";
                    btn.textContent = "Selected";
                    btn.disabled = true;
                } else {
                    btn.className = "tgb-btn tgb-btn--select";
                    btn.textContent = "Select";
                    btn.disabled = false;
                }
            } else {
                // Part button & compatibility badge (Part 7)
                const compatBadge = card.querySelector(".tgb-card-compat-badge");
                const baseProduct = hasBase ? this.productRegistry.get(currentBase.productId) : null;
                const inStock = !product.stock || product.stock.in_stock !== false;
                const compatStatus = baseProduct
                    ? TGB_Utility.TGB_Mounting.getCompatibility(baseProduct, product)
                    : null;

                if (compatBadge) {
                    compatBadge.className = "tgb-card-compat-badge";
                    if (baseProduct && compatStatus) {
                        if (compatStatus === "compatible") {
                            compatBadge.classList.add("tgb-card-compat-badge--compatible");
                            compatBadge.textContent = "Compatible";
                        } else if (compatStatus === "incompatible") {
                            compatBadge.classList.add("tgb-card-compat-badge--incompatible");
                            compatBadge.textContent = "Not compatible with selected platform";
                        } else {
                            compatBadge.classList.add("tgb-card-compat-badge--unconfigured");
                            compatBadge.textContent = "Mount information unavailable";
                        }
                        compatBadge.style.display = "inline-block";
                    } else {
                        compatBadge.style.display = "none";
                    }
                }

                if (!inStock) {
                    btn.className = "tgb-btn tgb-btn--unavailable is-unavailable";
                    btn.textContent = "Unavailable";
                    btn.disabled = true;
                    btn.removeAttribute("title");
                } else if (!hasBase) {
                    btn.className = "tgb-btn tgb-btn--add";
                    btn.textContent = "Add";
                    btn.disabled = true;
                    btn.title = "Choose a base platform first.";
                } else if (compatStatus !== "compatible") {
                    btn.disabled = true;
                    btn.textContent = "Add";
                    if (compatStatus === "incompatible") {
                        btn.className = "tgb-btn tgb-btn--incompatible is-incompatible";
                        btn.title = "Not compatible with selected platform.";
                    } else {
                        btn.className = "tgb-btn tgb-btn--unconfigured is-unconfigured";
                        btn.title = "Mount information unavailable.";
                    }
                } else {
                    btn.className = "tgb-btn tgb-btn--add";
                    btn.textContent = "Add";
                    btn.disabled = false;
                    btn.removeAttribute("title");
                }
            }
        });
    }

    /**
     * Updates sidebar Current Build summary panel (delegates to TGB_CurrentBuild).
     */
    syncSidebar() {
        if (window.TGB && window.TGB.currentBuild) {
            window.TGB.currentBuild.render();
        }
    }

    /**
     * Handles Build State notifications.
     */
    handleStateChange() {
        this.syncAllCardButtons();
    }

    /**
     * Shows message in tray status banner.
     */
    showStatus(msg, allowRetry = false) {
        if (!this.statusEl) return;
        this.statusEl.textContent = "";
        const p = document.createElement("p");
        p.textContent = msg;
        this.statusEl.appendChild(p);

        if (allowRetry) {
            const retryBtn = document.createElement("button");
            retryBtn.type = "button";
            retryBtn.className = "tgb-btn tgb-btn--secondary";
            retryBtn.textContent = "Retry";
            retryBtn.style.marginLeft = "12px";
            retryBtn.addEventListener("click", () => {
                this.switchCategory(this.activeCategoryKey, true);
            });
            this.statusEl.appendChild(retryBtn);
        }

        this.statusEl.style.display = "block";
    }

    hideStatus() {
        if (this.statusEl) {
            this.statusEl.textContent = "";
            this.statusEl.style.display = "none";
        }
    }

    showLoading() {
        if (this.loadingEl) this.loadingEl.style.display = "grid";
    }

    hideLoading() {
        if (this.loadingEl) this.loadingEl.style.display = "none";
    }

    updateLoadMoreAction(hasMore) {
        if (!this.actionsEl) return;
        this.actionsEl.style.display = hasMore ? "block" : "none";
    }

    /**
     * Shows customer-facing notification banner (e.g. for restore status).
     *
     * @param {string} message
     * @param {string} [type='info'] 'info'|'warning'|'error'
     * @param {number} [autoDismissMs=8000]
     */
    showNotice(message, type = "info", autoDismissMs = 8000) {
        const container = this.root.querySelector(".tgb-workspace") || this.root;
        let notice = this.root.querySelector(".tgb-restore-notice");
        if (!notice) {
            notice = document.createElement("div");
            notice.className = "tgb-restore-notice";
            container.insertBefore(notice, container.firstChild);
        }

        notice.className = `tgb-restore-notice tgb-restore-notice--${type}`;
        notice.setAttribute("role", type === "error" ? "alert" : "status");
        notice.textContent = "";

        const textSpan = document.createElement("span");
        textSpan.textContent = message;
        notice.appendChild(textSpan);

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "tgb-restore-notice-close";
        closeBtn.setAttribute("aria-label", "Dismiss notice");
        closeBtn.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        closeBtn.onclick = () => {
            if (notice.parentNode) notice.parentNode.removeChild(notice);
        };
        notice.appendChild(closeBtn);

        if (autoDismissMs > 0) {
            setTimeout(() => {
                if (notice.parentNode) notice.parentNode.removeChild(notice);
            }, autoDismissMs);
        }
    }
}
