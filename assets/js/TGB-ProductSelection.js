import { TGB_Utility } from "./TGB-Utility.js";

export 	class TGB_ProductSelection {
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

			this.navEl = root.querySelector('#tgb-category-nav');
			this.subnavEl = root.querySelector('#tgb-subcategory-nav');
			this.statusEl = root.querySelector('#tgb-tray-status');
			this.loadingEl = root.querySelector('#tgb-catalog-loading');
			this.gridEl = root.querySelector('#tgb-catalog-grid');
			this.actionsEl = root.querySelector('#tgb-catalog-actions');
			this.loadMoreBtn = root.querySelector('#tgb-load-more-btn');

			// Sidebar elements
			this.sidebarCountEl = root.querySelector('#tgb-sidebar-build-count');
			this.sidebarBodyEl = root.querySelector('#tgb-sidebar-build-body');

			this.categories = []; // [{ id: 'base_gun', name: 'Base Platform', children: [] }, ...]
			this.categoryTree = [];
			this.activeCategoryKey = 'base_gun';
			this.activeSubcategoryKey = null;
			this.activeQueryKey = 'base_gun';
			this.categoryCache = new Map(); // key => { items: [], has_more: false, next_cursor: null, loaded: false }

			this.activeAbortController = null;
			this.requestId = 0;

			this.boundHandleTabClick = this.handleTabClick.bind(this);
			this.boundHandleSubcatClick = this.handleSubcatClick.bind(this);
			this.boundHandleGridClick = this.handleGridClick.bind(this);
			this.boundHandleLoadMore = this.handleLoadMore.bind(this);
			this.boundStateChange = this.handleStateChange.bind(this);
		}

		/**
		 * Initializes Product Selection UI.
		 */
		async init() {
			if (!this.navEl || !this.gridEl) {
				return;
			}

			// 1. Pre-seed registry from initial render Base Gun if present
			const currentBase = this.buildState.getBaseGun();
			if (currentBase && currentBase.productId) {
				const existing = this.productRegistry.get(currentBase.productId) || {};
				this.productRegistry.set(currentBase.productId, Object.assign({}, existing, {
					id: currentBase.productId,
					name: currentBase.name,
					role: 'base_gun',
					reference_mm: currentBase.reference_mm,
					builder_image: currentBase.builder_image,
					price: currentBase.price || existing.price || null,
					weight: currentBase.weight || existing.weight || null,
					mounting: currentBase.mounting || existing.mounting || null,
				}));
			}

			// 2. Fetch native WooCommerce categories for active Base Gun
			await this.loadCategories(currentBase ? currentBase.productId : 0);

			// 3. Attach Event Listeners
			this.navEl.addEventListener('click', this.boundHandleTabClick);
			if (this.subnavEl) {
				this.subnavEl.addEventListener('click', this.boundHandleSubcatClick);
			}
			this.gridEl.addEventListener('click', this.boundHandleGridClick);
			if (this.loadMoreBtn) {
				this.loadMoreBtn.addEventListener('click', this.boundHandleLoadMore);
			}

			// 4. Subscribe to Build State
			this.buildState.subscribe(this.boundStateChange);

			// 5. Load default category (Base Platform)
			await this.switchCategory('base_gun');

			// 6. Initial sync with current build state
			this.syncSidebar();
		}

		/**
		 * Serializes currently installed rails for REST requests.
		 *
		 * @return {Array<{instance_id: string, product_id: number, position: string}>}
		 */
		getInstalledRailsForApi() {
			const rails = this.buildState.getRails ? this.buildState.getRails() : (this.buildState.rails || []);
			return rails.map(r => ({
				instance_id: r.instanceId,
				product_id: r.productId,
				position: r.position || 'bottom',
			}));
		}

		/**
		 * Loads compatible categories from the REST API for a specified Base Gun and installed Rails.
		 *
		 * @param {number} [baseGunId=0]
		 */
		async loadCategories(baseGunId = 0) {
			this.categories = [
				{ id: 'base_gun', name: 'Base Platform', slug: 'base-platform', children: [] }
			];
			if (baseGunId > 0) {
				this.categories.push({
					id: 'rails',
					name: 'Rails / Adapters',
					slug: 'rails',
					children: []
				});
			}
			this.categoryTree = [];
			this.categoryCache.clear();

			try {
				const installedRails = this.getInstalledRailsForApi();
				const tree = await this.catalog.getCategories(baseGunId, installedRails);
				if (Array.isArray(tree)) {
					this.categoryTree = tree;
					tree.forEach(cat => {
						this.categories.push({
							id: cat.id,
							name: cat.name,
							slug: cat.slug,
							count: cat.count,
							children: Array.isArray(cat.children) ? cat.children : [],
						});
					});
				}
			} catch (err) {
				console.warn('[TGB] Failed to fetch categories from API:', err);
			}

			this.renderCategoryNav();
		}

		/**
		 * Renders the category navigation tab buttons.
		 */
		renderCategoryNav() {
			if (!this.navEl) return;
			this.navEl.textContent = '';
			this.categories.forEach(cat => {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'tgb-category-btn' + (String(cat.id) === String(this.activeCategoryKey) ? ' is-active' : '');
				btn.setAttribute('role', 'tab');
				btn.setAttribute('aria-selected', String(cat.id) === String(this.activeCategoryKey) ? 'true' : 'false');
				btn.setAttribute('data-category-key', String(cat.id));
				btn.textContent = cat.name;
				this.navEl.appendChild(btn);
			});
			this.renderSubcategoryNav();
		}

		/**
		 * Renders hierarchical subcategory pills for the active category.
		 */
		renderSubcategoryNav() {
			if (!this.subnavEl) return;
			const activeCat = this.categories.find(c => String(c.id) === String(this.activeCategoryKey));
			if (!activeCat || activeCat.id === 'base_gun' || activeCat.id === 'rails' || !activeCat.children || activeCat.children.length === 0) {
				this.subnavEl.style.display = 'none';
				this.subnavEl.textContent = '';
				return;
			}

			this.subnavEl.textContent = '';
			this.subnavEl.style.display = 'flex';

			const allBtn = document.createElement('button');
			allBtn.type = 'button';
			const isAllActive = !this.activeSubcategoryKey || this.activeSubcategoryKey === 'all';
			allBtn.className = 'tgb-subcat-btn' + (isAllActive ? ' is-active' : '');
			allBtn.setAttribute('data-subcat-key', 'all');
			allBtn.textContent = `All ${activeCat.name}`;
			this.subnavEl.appendChild(allBtn);

			activeCat.children.forEach(child => {
				const childBtn = document.createElement('button');
				childBtn.type = 'button';
				const isChildActive = String(this.activeSubcategoryKey) === String(child.id);
				childBtn.className = 'tgb-subcat-btn' + (isChildActive ? ' is-active' : '');
				childBtn.setAttribute('data-subcat-key', String(child.id));
				childBtn.textContent = child.count ? `${child.name} (${child.count})` : child.name;
				this.subnavEl.appendChild(childBtn);
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
			this.activeSubcategoryKey = null;

			// Update Tab UI
			const tabs = this.navEl.querySelectorAll('.tgb-category-btn');
			tabs.forEach(tab => {
				const isCurrent = tab.getAttribute('data-category-key') === String(categoryKey);
				tab.classList.toggle('is-active', isCurrent);
				tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
			});

			this.renderSubcategoryNav();
			this.hideStatus();

			await this.fetchCategoryProducts(categoryKey, forceRefresh);
		}

		/**
		 * Fetches products for a category or subcategory with cancellation safety and in-memory caching.
		 *
		 * @param {string|number} targetQueryKey
		 * @param {boolean} [forceRefresh=false]
		 */
		async fetchCategoryProducts(targetQueryKey, forceRefresh = false) {
			targetQueryKey = String(targetQueryKey);
			this.activeQueryKey = targetQueryKey;

			if (this.activeAbortController) {
				this.activeAbortController.abort();
				this.activeAbortController = null;
			}

			const currentBase = this.buildState.getBaseGun();
			const baseGunId = currentBase ? currentBase.productId : 0;
			const installedRails = this.getInstalledRailsForApi();
			const railFingerprint = installedRails.map(r => `${r.product_id}:${r.position}`).sort().join('|');
			const cacheKey = `${targetQueryKey}_bg_${baseGunId}_rfp_${railFingerprint}`;

			this.hideStatus();

			// Check in-memory cache
			if (!forceRefresh && this.categoryCache.has(cacheKey)) {
				const cached = this.categoryCache.get(cacheKey);
				if (cached.loaded) {
					this.hideLoading();
					this.renderProducts(cached.items);
					this.updateLoadMoreAction(cached.has_more);
					return;
				}
			}

			// If selecting a part category or rails but no Base Gun selected yet
			if (targetQueryKey !== 'base_gun' && !baseGunId) {
				this.hideLoading();
				this.gridEl.textContent = '';
				if (this.actionsEl) {
					this.actionsEl.style.display = 'none';
				}
				this.showStatus('Choose a base platform above to begin selecting compatible components.', false);
				return;
			}

			// Fresh fetch
			const controller = new AbortController();
			this.activeAbortController = controller;
			const currentToken = ++this.requestId;

			this.showLoading();
			this.gridEl.textContent = '';
			if (this.actionsEl) {
				this.actionsEl.style.display = 'none';
			}

			try {
				let res;
				if (targetQueryKey === 'base_gun') {
					res = await this.catalog.getBaseGuns(20, '', controller.signal);
				} else if (targetQueryKey === 'rails') {
					res = await this.catalog.getRails(baseGunId, 20, '', controller.signal);
				} else {
					res = await this.catalog.getPartsByCategory(Number(targetQueryKey), baseGunId, 20, '', installedRails, controller.signal);
				}

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
				this.categoryCache.set(cacheKey, {
					items: items,
					has_more: hasMore,
					next_cursor: nextCursor,
					loaded: true,
				});

				this.hideLoading();
				this.renderProducts(items);
				this.updateLoadMoreAction(hasMore);

			} catch (err) {
				if (err.name === 'AbortError') {
					// Intentionally cancelled by rapid switching
					return;
				}
				if (this.requestId !== currentToken) {
					return;
				}
				this.hideLoading();
				this.showStatus('Products could not be loaded. Please try again.', true);
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
			const currentBase = this.buildState.getBaseGun();
			const baseGunId = currentBase ? currentBase.productId : 0;
			const installedRails = this.getInstalledRailsForApi();
			const railFingerprint = installedRails.map(r => `${r.product_id}:${r.position}`).sort().join('|');
			const cacheKey = `${this.activeQueryKey}_bg_${baseGunId}_rfp_${railFingerprint}`;
			const cache = this.categoryCache.get(cacheKey);
			if (!cache || !cache.has_more || !cache.next_cursor) {
				return;
			}

			if (this.loadMoreBtn) {
				this.loadMoreBtn.disabled = true;
				this.loadMoreBtn.textContent = 'Loading...';
			}

			const controller = new AbortController();
			this.activeAbortController = controller;
			const currentToken = ++this.requestId;

			try {
				let res;
				if (this.activeQueryKey === 'base_gun') {
					res = await this.catalog.getBaseGuns(20, cache.next_cursor, controller.signal);
				} else if (this.activeQueryKey === 'rails') {
					res = await this.catalog.getRails(baseGunId, 20, cache.next_cursor, controller.signal);
				} else {
					res = await this.catalog.getPartsByCategory(Number(this.activeQueryKey), baseGunId, 20, cache.next_cursor, installedRails, controller.signal);
				}

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
				if (err.name === 'AbortError') return;
				this.showStatus('Unable to load additional products.', false);
			} finally {
				if (this.loadMoreBtn) {
					this.loadMoreBtn.disabled = false;
					this.loadMoreBtn.textContent = 'Load More';
				}
			}
		}

		/**
		 * Handles subcategory pill click.
		 */
		handleSubcatClick(e) {
			const btn = e.target.closest('.tgb-subcat-btn');
			if (!btn) return;
			const subcatKey = btn.getAttribute('data-subcat-key');
			if (!subcatKey) return;
			if (subcatKey === this.activeSubcategoryKey || (subcatKey === 'all' && !this.activeSubcategoryKey)) {
				return;
			}
			this.activeSubcategoryKey = subcatKey;
			this.renderSubcategoryNav();
			const targetQueryId = subcatKey === 'all' ? this.activeCategoryKey : subcatKey;
			this.fetchCategoryProducts(targetQueryId);
		}

		/**
		 * Renders a full list of product cards.
		 *
		 * @param {Array} items
		 */
		renderProducts(items) {
			this.gridEl.textContent = '';
			const currentBase = this.buildState.getBaseGun();
			const baseProduct = currentBase ? this.productRegistry.get(currentBase.productId) : null;
			const installedRails = (this.buildState && this.buildState.getRails) ? this.buildState.getRails() : [];

			// Strict filtering: only display compatible components / rails
			const visibleItems = (items || []).filter(product => {
				if (product.role === 'base_gun') return true;
				if (!baseProduct) return false;
				const status = TGB_Utility.TGB_Mounting.getCompatibility(baseProduct, product, installedRails);
				return status === 'compatible';
			});

			if (!visibleItems || visibleItems.length === 0) {
				this.showStatus('No compatible products are available in this category.', false);
				return;
			}

			visibleItems.forEach(product => {
				const card = this.createProductCard(product);
				this.gridEl.appendChild(card);
			});
		}

		/**
		 * Appends new product cards to existing grid.
		 *
		 * @param {Array} items
		 */
		appendProducts(items) {
			if (!items || items.length === 0) return;
			const currentBase = this.buildState.getBaseGun();
			const baseProduct = currentBase ? this.productRegistry.get(currentBase.productId) : null;
			const installedRails = (this.buildState && this.buildState.getRails) ? this.buildState.getRails() : [];

			const visibleItems = items.filter(product => {
				if (product.role === 'base_gun') return true;
				if (!baseProduct) return false;
				const status = TGB_Utility.TGB_Mounting.getCompatibility(baseProduct, product, installedRails);
				return status === 'compatible';
			});

			visibleItems.forEach(product => {
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
			const card = document.createElement('div');
			card.className = 'tgb-product-card';
			card.setAttribute('data-product-id', String(product.id));

			const isBaseGun = product.role === 'base_gun';
			const isRail = product.role === 'rail';
			const currentBase = this.buildState.getBaseGun();
			const baseProduct = currentBase ? this.productRegistry.get(currentBase.productId) : null;
			const isCurrentBaseSelected = isBaseGun && currentBase && currentBase.productId === product.id;

			if (isCurrentBaseSelected) {
				card.classList.add('is-selected');
			}

			// Thumbnail Container
			const thumbContainer = document.createElement('div');
			thumbContainer.className = 'tgb-card-thumb';

			if (product.builder_image && product.builder_image.url) {
				const img = document.createElement('img');
				img.src = product.builder_image.url;
				img.alt = product.builder_image.alt || product.name || 'Component';
				img.loading = 'lazy';
				thumbContainer.appendChild(img);
			} else {
				const placeholder = document.createElement('div');
				placeholder.className = 'tgb-card-no-img';
				placeholder.textContent = 'No image';
				thumbContainer.appendChild(placeholder);
			}
			card.appendChild(thumbContainer);

			// Body Container
			const bodyContainer = document.createElement('div');
			bodyContainer.className = 'tgb-card-body';

			// In-Build Count Badge
			const inBuildCount = this.getInBuildCount(product.id);
			const inBuildBadge = document.createElement('span');
			inBuildBadge.className = 'tgb-card-in-build';
			inBuildBadge.setAttribute('data-in-build-product', String(product.id));
			if (inBuildCount > 0) {
				inBuildBadge.textContent = `In build: ${inBuildCount}`;
				inBuildBadge.style.display = 'inline-block';
			} else {
				inBuildBadge.style.display = 'none';
			}
			bodyContainer.appendChild(inBuildBadge);

			// Rail-specific badges (Interface mapping: Input -> Output)
			if (isRail) {
				const railMeta = product.rail || {};
				const inputName = (railMeta.input_interface && railMeta.input_interface.name) || 'Input';
				const outputNames = (railMeta.output_interfaces && Array.isArray(railMeta.output_interfaces))
					? railMeta.output_interfaces.map(o => o.name).join(', ')
					: 'Output';
				const railBadge = document.createElement('span');
				railBadge.className = 'tgb-rail-badge';
				railBadge.textContent = `${inputName} → ${outputNames}`;
				bodyContainer.appendChild(railBadge);
			} else if (!isBaseGun) {
				// Compatibility Badge for ordinary parts
				const compatBadge = document.createElement('span');
				compatBadge.className = 'tgb-card-compat-badge';
				compatBadge.setAttribute('data-compat-product', String(product.id));

				if (baseProduct) {
					const installedRails = (this.buildState && this.buildState.getRails) ? this.buildState.getRails() : [];
					const compatStatus = TGB_Utility.TGB_Mounting.getCompatibility(baseProduct, product, installedRails);
					if (compatStatus === 'compatible') {
						compatBadge.classList.add('tgb-card-compat-badge--compatible');
						compatBadge.textContent = 'Compatible';
						compatBadge.style.display = 'inline-block';
					} else {
						compatBadge.style.display = 'none';
					}
				} else {
					compatBadge.style.display = 'none';
				}
				bodyContainer.appendChild(compatBadge);
			}

			// Title (Safe DOM textContent)
			const titleEl = document.createElement('h4');
			titleEl.className = 'tgb-card-title';
			titleEl.textContent = product.name;
			bodyContainer.appendChild(titleEl);

			// Price
			const priceEl = document.createElement('div');
			priceEl.className = 'tgb-card-price';
			if (product.price && product.price.display) {
				priceEl.textContent = product.price.display;
			} else if (product.price && product.price.raw) {
				priceEl.textContent = '$' + parseFloat(product.price.raw).toFixed(2);
			}
			bodyContainer.appendChild(priceEl);

			// Position Selector for Rails
			let validPositions = [];
			if (isRail && baseProduct) {
				validPositions = TGB_Utility.TGB_Mounting.getRailCompatiblePositions(baseProduct, product);
				if (validPositions.length > 1) {
					const posWrap = document.createElement('div');
					posWrap.className = 'tgb-rail-pos-selector';
					const posLabel = document.createElement('label');
					posLabel.textContent = 'Position:';
					const posSelect = document.createElement('select');
					posSelect.className = 'tgb-rail-pos-select';
					validPositions.forEach(pos => {
						const opt = document.createElement('option');
						opt.value = pos;
						opt.textContent = pos.charAt(0).toUpperCase() + pos.slice(1);
						posSelect.appendChild(opt);
					});
					posWrap.appendChild(posLabel);
					posWrap.appendChild(posSelect);
					bodyContainer.appendChild(posWrap);
				} else if (validPositions.length === 1) {
					const posInfo = document.createElement('div');
					posInfo.className = 'tgb-rail-pos-selector';
					const posSpan = document.createElement('span');
					posSpan.className = 'tgb-rail-pos-label';
					posSpan.innerHTML = `Position: <strong>${validPositions[0].charAt(0).toUpperCase() + validPositions[0].slice(1)}</strong>`;
					posInfo.appendChild(posSpan);
					card.setAttribute('data-selected-position', validPositions[0]);
					bodyContainer.appendChild(posInfo);
				}
			}

			// Action Button
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'tgb-btn';
			btn.setAttribute('data-product-id', String(product.id));

			if (isBaseGun) {
				btn.setAttribute('data-action', 'select-base');
				if (isCurrentBaseSelected) {
					btn.className += ' tgb-btn--selected is-selected';
					btn.textContent = 'Selected';
					btn.disabled = true;
				} else {
					btn.className += ' tgb-btn--select';
					btn.textContent = 'Select';
				}
			} else if (isRail) {
				btn.setAttribute('data-action', 'add-rail');
				const hasBase = Boolean(currentBase);
				const inStock = !product.stock || product.stock.in_stock !== false;

				if (!inStock) {
					btn.className += ' tgb-btn--unavailable is-unavailable';
					btn.textContent = 'Unavailable';
					btn.disabled = true;
				} else if (!hasBase) {
					btn.className += ' tgb-btn--add';
					btn.textContent = 'Add Rail';
					btn.disabled = true;
					btn.title = 'Choose a base platform first.';
				} else if (validPositions.length === 0) {
					btn.disabled = true;
					btn.textContent = 'Add Rail';
					btn.className += ' tgb-btn--incompatible is-incompatible';
					btn.title = 'Not compatible with selected platform.';
				} else {
					btn.className += ' tgb-btn--add';
					btn.textContent = 'Add Rail';
				}
			} else {
				// Part Button (Part 7: Compatibility + Inventory Priority)
				btn.setAttribute('data-action', 'add-part');
				const hasBase = Boolean(currentBase);
				const inStock = !product.stock || product.stock.in_stock !== false;
				const installedRails = (this.buildState && this.buildState.getRails) ? this.buildState.getRails() : [];
				const compatStatus = baseProduct ? TGB_Utility.TGB_Mounting.getCompatibility(baseProduct, product, installedRails) : null;

				if (!inStock) {
					btn.className += ' tgb-btn--unavailable is-unavailable';
					btn.textContent = 'Unavailable';
					btn.disabled = true;
				} else if (!hasBase) {
					btn.className += ' tgb-btn--add';
					btn.textContent = 'Add';
					btn.disabled = true;
					btn.title = 'Choose a base platform first.';
				} else if (compatStatus !== 'compatible') {
					btn.disabled = true;
					btn.textContent = 'Add';
					btn.className += ' tgb-btn--incompatible is-incompatible';
					btn.title = 'Not compatible with selected platform.';
				} else {
					btn.className += ' tgb-btn--add';
					btn.textContent = 'Add';
				}
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
			const rails = this.buildState.rails || [];
			return parts.filter(p => p.productId === productId).length + rails.filter(r => r.productId === productId).length;
		}

		/**
		 * Handles category tab clicks.
		 */
		handleTabClick(e) {
			const btn = e.target.closest('.tgb-category-btn');
			if (!btn) return;
			const key = btn.getAttribute('data-category-key');
			if (key && key !== this.activeCategoryKey) {
				this.switchCategory(key);
			}
		}

		/**
		 * Handles card action clicks (Select Base Gun, Add Part, or Add Rail).
		 */
		handleGridClick(e) {
			const btn = e.target.closest('button[data-action]');
			if (!btn || btn.disabled) return;

			const action = btn.getAttribute('data-action');
			const productId = parseInt(btn.getAttribute('data-product-id'), 10);
			const product = this.productRegistry.get(productId);

			if (!product) {
				console.warn('[TGB] Product not found in registry:', productId);
				return;
			}

			if (action === 'select-base') {
				this.selectBaseGun(product);
			} else if (action === 'add-part') {
				this.addPartToBuild(product);
			} else if (action === 'add-rail') {
				const card = btn.closest('.tgb-product-card');
				let position = 'bottom';
				if (card) {
					const posSelect = card.querySelector('.tgb-rail-pos-select');
					if (posSelect) {
						position = posSelect.value;
					} else if (card.getAttribute('data-selected-position')) {
						position = card.getAttribute('data-selected-position');
					}
				}
				this.addRailToBuild(product, position);
			}
		}

		/**
		 * Selects a Base Gun, recovering the builder if empty or invalid,
		 * and clearing existing parts if replacing an already-mounted weapon.
		 *
		 * @param {Object} product Normalized Base Gun product.
		 */
		async selectBaseGun(product) {
			if (!product || product.role !== 'base_gun') {
				return;
			}

			const currentBase = this.buildState.getBaseGun();

			// If same Base Gun already selected, no-op
			if (currentBase && currentBase.productId === product.id) {
				return;
			}

			// Base Gun Replacement Policy (Requirement 22 & 68):
			// If replacing an existing weapon, CLEAR all existing components and rails.
			if (currentBase && (this.buildState.parts.length > 0 || (this.buildState.rails && this.buildState.rails.length > 0))) {
				this.buildState.reset();
			}

			// Store in registry
			this.productRegistry.set(product.id, product);

			// Preload and mount
			await this.renderer.loadAndRenderBaseGun(product);

			// Refresh categories and compatibility for this Base Gun
			await this.loadCategories(product.id);

			// If active category was a part category that now has 0 items or no longer exists,
			// gracefully switch to the first category with parts, or remain on Base Gun
			if (this.activeCategoryKey !== 'base_gun') {
				const stillValid = this.categories.some(c => String(c.id) === String(this.activeCategoryKey));
				if (!stillValid) {
					await this.switchCategory('base_gun');
				} else {
					await this.switchCategory(this.activeCategoryKey, true);
				}
			}

			// Synchronize UI
			this.syncAllCardButtons();
			this.syncSidebar();
		}

		/**
		 * Adds a Part to the build in the lower-left staging area.
		 *
		 * @param {Object} product Normalized Part product.
		 */
		addPartToBuild(product) {
			const currentBase = this.buildState.getBaseGun();
			if (!currentBase) {
				this.showStatus('Choose a base platform first.', false);
				return;
			}

			if (product.stock && product.stock.in_stock === false) {
				return;
			}

			const existingParts = (this.buildState.parts) || [];
			if (existingParts.length >= 30) {
				this.showStatus('Maximum limit of 30 components reached.', false);
				return;
			}

			const baseProduct = this.productRegistry.get(currentBase.productId);
			const installedRails = (this.buildState && this.buildState.getRails) ? this.buildState.getRails() : [];
			const compatStatus = TGB_Utility.TGB_Mounting.getCompatibility(baseProduct, product, installedRails);
			if (compatStatus !== 'compatible') {
				this.showStatus('This component is not compatible with the selected platform.', false);
				return;
			}

			// Store in registry
			this.productRegistry.set(product.id, product);

			// Lower-Left Staging Spawn (Part 12 non-overlapping placement):
			const stage = this.renderer.currentStageGeometry || { stageWidth: 1000, stageHeight: 600, baseX: 0, baseY: 0 };
			const geo = TGB_Utility.calculateProductGeometry(product);
			const currentBaseGun = (this.buildState.getBaseGun && this.buildState.getBaseGun()) || this.buildState.baseGun || null;

			const initialPos = TGB_Utility.TGB_Mounting.calculateStagingPosition(
				stage.stageWidth,
				stage.stageHeight,
				geo.logicalWidth,
				geo.logicalHeight,
				existingParts,
				currentBaseGun
			);

			// Add to authoritative Build State (Part 5 & 11 & 12)
			const partInstance = this.buildState.addPart(product, initialPos.x, initialPos.y);

			// Sync in-build count badges
			this.syncAllCardButtons();
			this.syncSidebar();

			return partInstance;
		}

		/**
		 * Adds a Rail instance to the build and updates dynamic compatibility.
		 *
		 * @param {Object} product Normalized Rail product.
		 * @param {string} position 'top' or 'bottom'
		 */
		async addRailToBuild(product, position = 'bottom') {
			const currentBase = this.buildState.getBaseGun();
			if (!currentBase) {
				this.showStatus('Choose a base platform first.', false);
				return;
			}

			if (position !== 'top' && position !== 'bottom') {
				this.showStatus('Invalid rail position specified.', false);
				return;
			}

			const existingRails = (this.buildState.rails) || [];
			if (existingRails.length >= 10) {
				this.showStatus('Maximum limit of 10 rails reached.', false);
				return;
			}

			if (product.stock && product.stock.in_stock === false) {
				return;
			}

			const baseProduct = this.productRegistry.get(currentBase.productId);
			const validPositions = TGB_Utility.TGB_Mounting.getRailCompatiblePositions(baseProduct, product);
			if (!validPositions.includes(position)) {
				this.showStatus('Selected rail position is not compatible with this platform.', false);
				return;
			}

			// Store in registry
			this.productRegistry.set(product.id, product);

			// Staging spawn calculation
			const stage = this.renderer.currentStageGeometry || { stageWidth: 1000, stageHeight: 600, baseX: 0, baseY: 0 };
			const geo = TGB_Utility.calculateProductGeometry(product);
			const existingParts = (this.buildState.parts) || [];
			const staggerOffset = ((existingRails.length + existingParts.length) % 10) * 15;

			const initialX = Math.max(0, Math.min(stage.baseX + 50 + staggerOffset, stage.stageWidth - geo.logicalWidth));
			const initialY = Math.max(0, Math.min(stage.stageHeight - geo.logicalHeight - 50 - staggerOffset, stage.stageHeight - geo.logicalHeight));

			// Add to Build State
			const railInstance = this.buildState.addRail(product, position, initialX, initialY);

			// Invalidate client-side category cache for this base gun so newly unlocked categories reload
			this.categoryCache.clear();

			// Reload categories with newly installed rail
			await this.loadCategories(currentBase.productId);

			// Sync UI
			this.syncAllCardButtons();
			this.syncSidebar();

			return railInstance;
		}

		/**
		 * Removes a rail instance from the build and re-evaluates ordinary parts dependencies.
		 * Parts with alternate mounting sources are kept.
		 * Parts that lost their only supporting source are pruned with a notification toast.
		 *
		 * @param {string} instanceId
		 */
		async handleRailRemoval(instanceId) {
			const rail = this.buildState.getRail(instanceId);
			if (!rail) return false;

			const railName = rail.name || 'Rail / Adapter';
			const currentBase = this.buildState.getBaseGun();
			const baseProduct = currentBase ? this.productRegistry.get(currentBase.productId) : null;

			// 1. Remove rail from state
			this.buildState.removeRail(instanceId);

			// 2. Re-evaluate remaining installed parts
			const remainingRails = this.buildState.getRails();
			const pool = TGB_Utility.TGB_Mounting.buildCapabilityPool(baseProduct, remainingRails);

			const installedParts = [...this.buildState.parts];
			const prunedPartNames = [];

			for (const partInst of installedParts) {
				const partProduct = this.productRegistry.get(partInst.productId);
				if (!partProduct) continue;

				const compatRes = TGB_Utility.TGB_Mounting.checkPartCompatibilityWithPool(partProduct, pool);
				if (compatRes.status !== 'compatible') {
					// Incompatible now! Prune it
					this.buildState.removePart(partInst.instanceId);
					prunedPartNames.push(partInst.name || partProduct.name || 'Component');
				}
			}

			// Invalidate category cache
			this.categoryCache.clear();

			// Reload categories
			if (currentBase) {
				await this.loadCategories(currentBase.productId);
			}

			// Sync UI
			this.syncAllCardButtons();
			this.syncSidebar();

			// User notification (Section 10.2 & 10.6)
			if (prunedPartNames.length > 0) {
				const namesText = prunedPartNames.join(', ');
				const msg = `Removing ${railName} also removed ${prunedPartNames.length} component${prunedPartNames.length > 1 ? 's' : ''} (${namesText}) no longer compatible.`;
				this.showToast(msg, 'warning');
				if (window.TGB && window.TGB.currentBuild) {
					window.TGB.currentBuild.announce(msg);
				}
			} else {
				if (window.TGB && window.TGB.currentBuild) {
					window.TGB.currentBuild.announce(`${railName} removed from build.`);
				}
			}

			return true;
		}

		/**
		 * Shows transient toast banner for dynamic dependency removal notices.
		 *
		 * @param {string} message
		 * @param {string} [type='info']
		 */
		showToast(message, type = 'info') {
			let toast = this.root.querySelector('.tgb-notice-toast');
			if (!toast) {
				toast = document.createElement('div');
				toast.className = 'tgb-notice-toast';
				const container = this.root.querySelector('.tgb-workspace') || this.root;
				container.appendChild(toast);
			}
			toast.className = `tgb-notice-toast tgb-notice-toast--${type} is-active`;
			toast.textContent = message;
			if (this.toastTimeout) clearTimeout(this.toastTimeout);
			this.toastTimeout = setTimeout(() => {
				toast.classList.remove('is-active');
			}, 6000);
		}

		/**
		 * Synchronizes card action buttons and in-build counts across the active grid.
		 */
		syncAllCardButtons() {
			const currentBase = this.buildState.getBaseGun();
			const hasBase = Boolean(currentBase);
			const installedRails = (this.buildState && this.buildState.getRails) ? this.buildState.getRails() : [];

			const cards = this.gridEl.querySelectorAll('.tgb-product-card');
			cards.forEach(card => {
				const productId = parseInt(card.getAttribute('data-product-id'), 10);
				const product = this.productRegistry.get(productId);
				if (!product) return;

				const isBaseGun = product.role === 'base_gun';
				const isRail = product.role === 'rail';
				const btn = card.querySelector('button[data-action]');
				const badge = card.querySelector('.tgb-card-in-build');

				// In-build count badge
				if (badge) {
					const count = this.getInBuildCount(productId);
					if (count > 0) {
						badge.textContent = `In build: ${count}`;
						badge.style.display = 'inline-block';
					} else {
						badge.style.display = 'none';
					}
				}

				if (!btn) return;

				if (isBaseGun) {
					const isSelected = hasBase && currentBase.productId === productId;
					card.classList.toggle('is-selected', isSelected);
					if (isSelected) {
						btn.className = 'tgb-btn tgb-btn--selected is-selected';
						btn.textContent = 'Selected';
						btn.disabled = true;
					} else {
						btn.className = 'tgb-btn tgb-btn--select';
						btn.textContent = 'Select';
						btn.disabled = false;
					}
				} else if (isRail) {
					const baseProduct = hasBase ? this.productRegistry.get(currentBase.productId) : null;
					const inStock = !product.stock || product.stock.in_stock !== false;
					const validPositions = baseProduct ? TGB_Utility.TGB_Mounting.getRailCompatiblePositions(baseProduct, product) : [];

					if (!inStock) {
						btn.className = 'tgb-btn tgb-btn--unavailable is-unavailable';
						btn.textContent = 'Unavailable';
						btn.disabled = true;
						btn.removeAttribute('title');
					} else if (!hasBase) {
						btn.className = 'tgb-btn tgb-btn--add';
						btn.textContent = 'Add Rail';
						btn.disabled = true;
						btn.title = 'Choose a base platform first.';
					} else if (validPositions.length === 0) {
						btn.disabled = true;
						btn.textContent = 'Add Rail';
						btn.className = 'tgb-btn--incompatible is-incompatible';
						btn.title = 'Not compatible with selected platform.';
					} else {
						btn.className = 'tgb-btn tgb-btn--add';
						btn.textContent = 'Add Rail';
						btn.disabled = false;
						btn.removeAttribute('title');
					}
				} else {
					// Part button & compatibility badge (Part 7)
					const compatBadge = card.querySelector('.tgb-card-compat-badge');
					const baseProduct = hasBase ? this.productRegistry.get(currentBase.productId) : null;
					const inStock = !product.stock || product.stock.in_stock !== false;
					const compatStatus = baseProduct ? TGB_Utility.TGB_Mounting.getCompatibility(baseProduct, product, installedRails) : null;

					if (compatBadge) {
						compatBadge.className = 'tgb-card-compat-badge';
						if (baseProduct && compatStatus) {
							if (compatStatus === 'compatible') {
								compatBadge.classList.add('tgb-card-compat-badge--compatible');
								compatBadge.textContent = 'Compatible';
							} else if (compatStatus === 'incompatible') {
								compatBadge.classList.add('tgb-card-compat-badge--incompatible');
								compatBadge.textContent = 'Not compatible with selected platform';
							} else {
								compatBadge.classList.add('tgb-card-compat-badge--unconfigured');
								compatBadge.textContent = 'Mount information unavailable';
							}
							compatBadge.style.display = 'inline-block';
						} else {
							compatBadge.style.display = 'none';
						}
					}

					if (!inStock) {
						btn.className = 'tgb-btn tgb-btn--unavailable is-unavailable';
						btn.textContent = 'Unavailable';
						btn.disabled = true;
						btn.removeAttribute('title');
					} else if (!hasBase) {
						btn.className = 'tgb-btn tgb-btn--add';
						btn.textContent = 'Add';
						btn.disabled = true;
						btn.title = 'Choose a base platform first.';
					} else if (compatStatus !== 'compatible') {
						btn.disabled = true;
						btn.textContent = 'Add';
						if (compatStatus === 'incompatible') {
							btn.className = 'tgb-btn tgb-btn--incompatible is-incompatible';
							btn.title = 'Not compatible with selected platform.';
						} else {
							btn.className = 'tgb-btn tgb-btn--unconfigured is-unconfigured';
							btn.title = 'Mount information unavailable.';
						}
					} else {
						btn.className = 'tgb-btn tgb-btn--add';
						btn.textContent = 'Add';
						btn.disabled = false;
						btn.removeAttribute('title');
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
			this.statusEl.textContent = '';
			const p = document.createElement('p');
			p.textContent = msg;
			this.statusEl.appendChild(p);

			if (allowRetry) {
				const retryBtn = document.createElement('button');
				retryBtn.type = 'button';
				retryBtn.className = 'tgb-btn tgb-btn--secondary';
				retryBtn.textContent = 'Retry';
				retryBtn.style.marginLeft = '12px';
				retryBtn.addEventListener('click', () => {
					this.switchCategory(this.activeCategoryKey, true);
				});
				this.statusEl.appendChild(retryBtn);
			}

			this.statusEl.style.display = 'block';
		}

		hideStatus() {
			if (this.statusEl) {
				this.statusEl.textContent = '';
				this.statusEl.style.display = 'none';
			}
		}

		showLoading() {
			if (this.loadingEl) this.loadingEl.style.display = 'grid';
		}

		hideLoading() {
			if (this.loadingEl) this.loadingEl.style.display = 'none';
		}

		updateLoadMoreAction(hasMore) {
			if (!this.actionsEl) return;
			this.actionsEl.style.display = hasMore ? 'block' : 'none';
		}

		/**
		 * Shows customer-facing notification banner (e.g. for restore status).
		 *
		 * @param {string} message
		 * @param {string} [type='info'] 'info'|'warning'|'error'
		 * @param {number} [autoDismissMs=8000]
		 */
		showNotice(message, type = 'info', autoDismissMs = 8000) {
			const container = this.root.querySelector('.tgb-workspace') || this.root;
			let notice = this.root.querySelector('.tgb-restore-notice');
			if (!notice) {
				notice = document.createElement('div');
				notice.className = 'tgb-restore-notice';
				container.insertBefore(notice, container.firstChild);
			}

			notice.className = `tgb-restore-notice tgb-restore-notice--${type}`;
			notice.setAttribute('role', type === 'error' ? 'alert' : 'status');
			notice.textContent = '';

			const textSpan = document.createElement('span');
			textSpan.textContent = message;
			notice.appendChild(textSpan);

			const closeBtn = document.createElement('button');
			closeBtn.type = 'button';
			closeBtn.className = 'tgb-restore-notice-close';
			closeBtn.setAttribute('aria-label', 'Dismiss notice');
			closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
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