/**
 * Taktik Gun Builder - Canonical 2D Layered DOM Renderer + Unified Build State + Pointer Dragging (Parts 4 & 5)
 *
 * Implements:
 * 1. Canonical Coordinate System: 1 mm = 1 logical pixel
 * 2. Logical Product Geometry (aspect ratio preserved from WooCommerce Gallery image)
 * 3. Logical Stage Geometry & Centered Base Gun Placement
 * 4. Whole-Stage Responsive Display Scale System (displayScale = min(1, viewportWidth / stageWidth))
 * 5. Unified In-Memory Build State (Single Source of Truth)
 * 6. Generic Part Instances with Unique Instance IDs
 * 7. Pointer Events Dragging (mouse, touch, pen) with Pointer Capture
 * 8. Physical-to-Logical Coordinate Conversion (delta / displayScale)
 * 9. Stage Boundary Enforcement (clamping)
 * 10. ResizeObserver Responsive Recalculation & Drag Safety
 * 11. State-to-DOM Synchronization (rAF throttled)
 * 12. Fixed Base Gun (Non-draggable)
 *
 * @package TaktikGunBuilder
 */

(function(window, document) {
	'use strict';

	/**
	 * Canonical Scale Constants (Part 4)
	 */
	const CANONICAL_SCALE_MM_TO_PX = 1.0; // 1 mm = 1 logical px
	const MIN_LOGICAL_STAGE_HEIGHT = 500; // Minimum stage height to avoid visual collapse

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
	function calculateProductGeometry(product) {
		if (!product || !product.reference_mm) {
			return { logicalWidth: 0, logicalHeight: 0 };
		}

		const referenceMm = parseFloat(product.reference_mm) || 0;
		const img = product.builder_image || {};
		const imgWidth = parseFloat(img.width) || 1;
		const imgHeight = parseFloat(img.height) || 1;

		const logicalWidth = referenceMm * CANONICAL_SCALE_MM_TO_PX;
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
	function calculateStageGeometry(baseGunGeometry) {
		const baseW = baseGunGeometry.logicalWidth || 0;
		const baseH = baseGunGeometry.logicalHeight || 0;

		// Generic workspace margins (proportional with reasonable minimums)
		const horizPadding = Math.max(200, Math.round(baseW * 0.20));
		const vertPadding = Math.max(120, Math.round(baseH * 0.40));

		const stageWidth = Math.round(baseW + (horizPadding * 2));
		const stageHeight = Math.max(MIN_LOGICAL_STAGE_HEIGHT, Math.round(baseH + (vertPadding * 2)));

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
	function calculateDisplayScale(stageWidth, viewportWidth) {
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
	function createLayerElement(product, x, y, layerRole = 'base', zIndex = 10, instanceId = null) {
		const geometry = calculateProductGeometry(product);
		const img = document.createElement('img');

		const cleanRole = String(layerRole).toLowerCase().replace(/[^a-z0-9_-]/g, '');
		img.className = 'tgb-layer tgb-layer--' + cleanRole;
		img.classList.add('tgb-layer');
		img.classList.add('tgb-layer--' + cleanRole);
		img.src = (product.builder_image && product.builder_image.url) ? product.builder_image.url : '';
		img.alt = (product.builder_image && product.builder_image.alt) || product.name || '';
		img.draggable = false; // Prevent browser-native ghost drag (Section 27 & 48)

		// Store explicit canonical logical geometry in data attributes (Section 19)
		img.dataset.tgbX = String(x);
		img.dataset.tgbY = String(y);
		img.dataset.tgbWidth = String(geometry.logicalWidth);
		img.dataset.tgbHeight = String(geometry.logicalHeight);
		img.dataset.productId = String(product.productId || product.id || 0);
		img.dataset.attachmentId = String((product.builder_image && product.builder_image.attachment_id) ? product.builder_image.attachment_id : 0);
		img.dataset.layerRole = cleanRole;

		if (instanceId) {
			img.dataset.tgbInstanceId = String(instanceId);
		}

		// Apply logical absolute coordinates
		img.style.position = 'absolute';
		img.style.left = x + 'px';
		img.style.top = y + 'px';
		img.style.width = geometry.logicalWidth + 'px';
		img.style.height = geometry.logicalHeight + 'px';
		img.style.zIndex = String(zIndex);

		return img;
	}

	// =========================================================================
	// 1. TGB BUILD STATE (Section 4, 5, 6, 7, 8, 9, 10, 11)
	// =========================================================================

	/**
	 * In-Memory Unified Build State Store.
	 *
	 * Authoritative single source of truth for the active build.
	 * Base Gun is separate from Parts; Parts are generic with unique instance IDs.
	 * Completely memory-only; zero database or localStorage persistence.
	 */
	class TGB_BuildState {
		constructor() {
			this.version = 1;
			this.baseGun = null; // { productId, x, y, width, height, name, reference_mm, builder_image }
			this.rails = [];     // Array of { instanceId, productId, position, x, y, width, height, zIndex, name, reference_mm, builder_image, rail }
			this.parts = [];     // Array of { instanceId, productId, partTypeId, partTypeName, x, y, width, height, zIndex, name, reference_mm, builder_image }
			this.subscribers = [];
			this.nextZIndex = 20;
		}

		/**
		 * Sets or replaces the Base Gun state.
		 *
		 * @param {Object|null} baseGunData Base Gun geometry and metadata.
		 * @return {Object|null}
		 */
		setBaseGun(baseGunData) {
			if (!baseGunData) {
				this.baseGun = null;
			} else {
				this.baseGun = {
					productId: baseGunData.productId || baseGunData.id || 0,
					x: typeof baseGunData.x === 'number' ? baseGunData.x : 0,
					y: typeof baseGunData.y === 'number' ? baseGunData.y : 0,
					width: baseGunData.width || 0,
					height: baseGunData.height || 0,
					name: baseGunData.name || '',
					reference_mm: baseGunData.reference_mm || baseGunData.width || 0,
					builder_image: baseGunData.builder_image ? {
						attachment_id: baseGunData.builder_image.attachment_id || 0,
						url: baseGunData.builder_image.url || '',
						alt: baseGunData.builder_image.alt || baseGunData.name || '',
						width: baseGunData.builder_image.width || 0,
						height: baseGunData.builder_image.height || 0,
					} : null,
					price: baseGunData.price || null,
					weight: baseGunData.weight || null,
					mounting: baseGunData.mounting || null,
				};
			}

			this._notify({
				type: 'base_gun_set',
				baseGun: this.baseGun ? Object.assign({}, this.baseGun) : null,
				state: this.getState(),
			});

			return this.baseGun ? Object.assign({}, this.baseGun) : null;
		}

		/**
		 * Adds a generic Part instance to the Build State.
		 *
		 * @param {Object} product Normalized product data from TGB_Product_Data.
		 * @param {number} [initialX=0] Canonical initial X coordinate.
		 * @param {number} [initialY=0] Canonical initial Y coordinate.
		 * @param {number} [zIndex] Optional explicit z-index layer.
		 * @return {Object|null} Created part instance state entry.
		 */
		addPart(product, initialX = 0, initialY = 0, zIndex = null, explicitInstanceId = null) {
			if (!product) {
				return null;
			}

			const geometry = calculateProductGeometry(product);
			const instanceId = explicitInstanceId || this._generateInstanceId();
			const partZIndex = typeof zIndex === 'number' ? zIndex : this.nextZIndex++;
			if (typeof zIndex === 'number' && zIndex >= this.nextZIndex) {
				this.nextZIndex = zIndex + 1;
			}

			const part = {
				instanceId: instanceId,
				productId: product.id || product.productId || 0,
				partTypeId: (product.part_type && (product.part_type.id || product.part_type.term_id)) ? (product.part_type.id || product.part_type.term_id) : null,
				partTypeName: (product.part_type && product.part_type.name) ? String(product.part_type.name) : '',
				x: parseFloat(Number(initialX).toFixed(2)),
				y: parseFloat(Number(initialY).toFixed(2)),
				width: geometry.logicalWidth,
				height: geometry.logicalHeight,
				zIndex: partZIndex,
				name: product.name || '',
				reference_mm: product.reference_mm || geometry.logicalWidth,
				builder_image: product.builder_image ? {
					attachment_id: product.builder_image.attachment_id || 0,
					url: product.builder_image.url || '',
					alt: product.builder_image.alt || product.name || '',
					width: product.builder_image.width || 0,
					height: product.builder_image.height || 0,
				} : null,
			};

			this.parts.push(part);

			this._notify({
				type: 'part_added',
				part: Object.assign({}, part),
				state: this.getState(),
			});

			return Object.assign({}, part);
		}

		/**
		 * Removes a Part instance by its unique instance ID.
		 *
		 * @param {string} instanceId Unique Part instance identifier.
		 * @return {boolean} True if removed, false otherwise.
		 */
		removePart(instanceId) {
			if (!instanceId) {
				return false;
			}

			const index = this.parts.findIndex(p => p.instanceId === instanceId);
			if (index === -1) {
				return false;
			}

			const removedPart = this.parts.splice(index, 1)[0];

			this._notify({
				type: 'part_removed',
				instanceId: instanceId,
				part: removedPart,
				state: this.getState(),
			});

			return true;
		}

		/**
		 * Updates the canonical logical position of a Part instance.
		 *
		 * @param {string} instanceId Unique Part instance identifier.
		 * @param {number} x New canonical logical X.
		 * @param {number} y New canonical logical Y.
		 * @return {boolean} True if updated, false if part not found.
		 */
		updatePartPosition(instanceId, x, y) {
			const part = this.parts.find(p => p.instanceId === instanceId);
			if (!part) {
				return false;
			}

			part.x = parseFloat(Number(x).toFixed(2));
			part.y = parseFloat(Number(y).toFixed(2));

			this._notify({
				type: 'part_moved',
				instanceId: instanceId,
				x: part.x,
				y: part.y,
				state: this.getState(),
			});

			return true;
		}

		/**
		 * Retrieves a single Part instance by ID.
		 *
		 * @param {string} instanceId
		 * @return {Object|null}
		 */
		getPart(instanceId) {
			const part = this.parts.find(p => p.instanceId === instanceId);
			return part ? Object.assign({}, part) : null;
		}

		/**
		 * Adds a Rail instance to the Build State.
		 *
		 * @param {Object} product Normalized product data from TGB_Product_Data.
		 * @param {string} [position='bottom'] Physical mounting position ('top' or 'bottom').
		 * @param {number} [initialX=0] Canonical initial X coordinate.
		 * @param {number} [initialY=0] Canonical initial Y coordinate.
		 * @param {number} [zIndex] Optional explicit z-index layer.
		 * @param {string} [explicitInstanceId] Optional explicit instance ID.
		 * @return {Object|null} Created rail instance state entry.
		 */
		addRail(product, position = 'bottom', initialX = 0, initialY = 0, zIndex = null, explicitInstanceId = null) {
			if (!product) {
				return null;
			}

			const normPos = String(position).toLowerCase();
			if (normPos !== 'top' && normPos !== 'bottom') {
				return null;
			}

			const geometry = calculateProductGeometry(product);
			const instanceId = explicitInstanceId || this._generateInstanceId('rail-');
			const railZIndex = typeof zIndex === 'number' ? zIndex : this.nextZIndex++;
			if (typeof zIndex === 'number' && zIndex >= this.nextZIndex) {
				this.nextZIndex = zIndex + 1;
			}

			const rail = {
				instanceId: instanceId,
				productId: product.id || product.productId || 0,
				position: normPos,
				x: parseFloat(Number(initialX).toFixed(2)),
				y: parseFloat(Number(initialY).toFixed(2)),
				width: geometry.logicalWidth,
				height: geometry.logicalHeight,
				zIndex: railZIndex,
				name: product.name || '',
				reference_mm: product.reference_mm || geometry.logicalWidth,
				builder_image: product.builder_image ? {
					attachment_id: product.builder_image.attachment_id || 0,
					url: product.builder_image.url || '',
					alt: product.builder_image.alt || product.name || '',
					width: product.builder_image.width || 0,
					height: product.builder_image.height || 0,
				} : null,
				price: product.price || null,
				weight: product.weight || null,
				rail: product.rail || null,
			};

			this.rails.push(rail);

			this._notify({
				type: 'rail_added',
				rail: Object.assign({}, rail),
				state: this.getState(),
			});

			return Object.assign({}, rail);
		}

		/**
		 * Removes a Rail instance by its unique instance ID.
		 *
		 * @param {string} instanceId Unique Rail instance identifier.
		 * @return {boolean} True if removed, false otherwise.
		 */
		removeRail(instanceId) {
			if (!instanceId) {
				return false;
			}

			const index = this.rails.findIndex(r => r.instanceId === instanceId);
			if (index === -1) {
				return false;
			}

			const removedRail = this.rails.splice(index, 1)[0];

			this._notify({
				type: 'rail_removed',
				instanceId: instanceId,
				rail: removedRail,
				state: this.getState(),
			});

			return true;
		}

		/**
		 * Updates the canonical logical position of a Rail instance.
		 *
		 * @param {string} instanceId Unique Rail instance identifier.
		 * @param {number} x New canonical logical X.
		 * @param {number} y New canonical logical Y.
		 * @return {boolean} True if updated, false if rail not found.
		 */
		updateRailPosition(instanceId, x, y) {
			const rail = this.rails.find(r => r.instanceId === instanceId);
			if (!rail) {
				return false;
			}

			rail.x = parseFloat(Number(x).toFixed(2));
			rail.y = parseFloat(Number(y).toFixed(2));

			this._notify({
				type: 'rail_moved',
				instanceId: instanceId,
				x: rail.x,
				y: rail.y,
				state: this.getState(),
			});

			return true;
		}

		/**
		 * Retrieves a single Rail instance by ID.
		 *
		 * @param {string} instanceId
		 * @return {Object|null}
		 */
		getRail(instanceId) {
			const rail = this.rails.find(r => r.instanceId === instanceId);
			return rail ? Object.assign({}, rail) : null;
		}

		/**
		 * Retrieves all installed Rail instances.
		 *
		 * @return {Array}
		 */
		getRails() {
			return this.rails.map(r => Object.assign({}, r));
		}

		/**
		 * Retrieves the Base Gun state entry.
		 *
		 * @return {Object|null}
		 */
		getBaseGun() {
			return this.baseGun ? Object.assign({}, this.baseGun) : null;
		}

		/**
		 * Returns an immutable array of active Rails.
		 *
		 * @return {Array}
		 */
		getRails() {
			return this.rails.map(r => Object.assign({}, r));
		}

		/**
		 * Returns an immutable array of active Parts.
		 *
		 * @return {Array}
		 */
		getParts() {
			return this.parts.map(p => Object.assign({}, p));
		}

		/**
		 * Returns an immutable defensive copy of the Build State.
		 *
		 * @return {Object}
		 */
		getState() {
			return {
				version: this.version,
				baseGun: this.baseGun ? Object.assign({}, this.baseGun) : null,
				rails: this.rails.map(r => Object.assign({}, r)),
				parts: this.parts.map(p => Object.assign({}, p)),
			};
		}

		/**
		 * Resets the build: clears all parts and rails while preserving the Base Gun.
		 */
		reset() {
			this.parts = [];
			this.rails = [];
			this.nextZIndex = 20;

			this._notify({
				type: 'reset',
				state: this.getState(),
			});
		}

		/**
		 * Completely clears the build state, including Base Gun.
		 */
		clear() {
			this.baseGun = null;
			this.parts = [];
			this.rails = [];
			this.nextZIndex = 20;

			this._notify({
				type: 'reset',
				state: this.getState(),
			});
		}

		/**
		 * Subscribes to Build State mutation events.
		 *
		 * @param {Function} callback Callback receiving event and state.
		 * @return {Function} Unsubscribe function.
		 */
		subscribe(callback) {
			if (typeof callback !== 'function') {
				return () => {};
			}

			this.subscribers.push(callback);

			return () => {
				const idx = this.subscribers.indexOf(callback);
				if (idx !== -1) {
					this.subscribers.splice(idx, 1);
				}
			};
		}

		/**
		 * Broadcasts an event to all subscribers safely.
		 *
		 * @private
		 * @param {Object} event
		 */
		_notify(event) {
			for (const cb of this.subscribers) {
				try {
					cb(event);
				} catch (err) {
					console.error('[TGB BuildState] Subscriber error:', err);
				}
			}
		}

		/**
		 * Generates a collision-resistant unique client-side instance ID.
		 *
		 * @private
		 * @param {string} [prefix='part-']
		 * @return {string}
		 */
		_generateInstanceId(prefix = 'part-') {
			if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
				return prefix + crypto.randomUUID();
			}
			return prefix + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
		}
	}

	// =========================================================================
	// 2. TGB RENDERER (Part 4 extended for Part 5 State Synchronization)
	// =========================================================================

	/**
	 * Layered DOM Renderer Controller.
	 *
	 * Owns the visual presentation, physical stage frame sizing, whole-stage
	 * CSS scaling transform, and DOM layer synchronization with Build State.
	 */
	class TGB_Renderer {
		constructor(rootEl, buildState) {
			this.root = rootEl;
			this.buildState = buildState;
			this.viewportEl = rootEl.querySelector('#tgb-stage-viewport');
			this.frameEl = rootEl.querySelector('#tgb-stage-frame');
			this.stageEl = rootEl.querySelector('#tgb-stage');
			this.loadingEl = rootEl.querySelector('#tgb-stage-loading');
			this.emptyEl = rootEl.querySelector('#tgb-stage-empty');
			this.invalidEl = rootEl.querySelector('#tgb-stage-invalid');
			this.errorEl = rootEl.querySelector('#tgb-stage-error');

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
				case 'part_added':
					this.mountPartLayer(event.part);
					break;

				case 'part_removed':
					this.unmountPartLayer(event.instanceId);
					break;

				case 'part_moved':
					this.syncPartLayerPosition(event.instanceId, event.x, event.y);
					break;

				case 'rail_added':
					this.mountRailLayer(event.rail);
					break;

				case 'rail_removed':
					this.unmountRailLayer(event.instanceId);
					break;

				case 'rail_moved':
					this.syncRailLayerPosition(event.instanceId, event.x, event.y);
					break;

				case 'reset':
				case 'build_reset':
					this.clearPartLayers();
					this.clearRailLayers();
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
				if (urlParams.has('tgb_debug')) {
					this.root.classList.add('tgb-debug');
				}
			} catch (e) {
				// Ignore URL parsing errors
			}

			const dataScript = this.root.querySelector('.tgb-initial-render-data');
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

			if ('empty' === initialData.status) {
				this.showEmptyState();
			} else if ('invalid' === initialData.status) {
				this.showInvalidState(initialData.message);
			} else if ('ready' === initialData.status && initialData.product) {
				this.loadAndRenderBaseGun(initialData.product);
			} else {
				this.showEmptyState();
			}
		}

		showEmptyState() {
			this.hideAllStates();
			if (this.emptyEl) {
				this.emptyEl.style.display = 'flex';
			}
			if (this.frameEl) {
				this.frameEl.style.display = 'none';
			}
		}

		showInvalidState(message) {
			this.hideAllStates();
			if (this.invalidEl) {
				if (message) {
					const desc = this.invalidEl.querySelector('.tgb-state-desc');
					if (desc) {
						desc.textContent = message;
					}
				}
				this.invalidEl.style.display = 'flex';
			}
			if (this.frameEl) {
				this.frameEl.style.display = 'none';
			}
		}

		showErrorState(message) {
			this.hideAllStates();
			if (this.errorEl) {
				if (message) {
					const desc = this.errorEl.querySelector('.tgb-state-desc');
					if (desc) {
						desc.textContent = message;
					}
				}
				this.errorEl.style.display = 'flex';
			}
			if (this.frameEl) {
				this.frameEl.style.display = 'none';
			}
		}

		showLoadingState() {
			this.hideAllStates();
			if (this.loadingEl) {
				this.loadingEl.style.display = 'flex';
			}
			if (this.frameEl) {
				this.frameEl.style.display = 'none';
			}
		}

		hideAllStates() {
			if (this.loadingEl) this.loadingEl.style.display = 'none';
			if (this.emptyEl) this.emptyEl.style.display = 'none';
			if (this.invalidEl) this.invalidEl.style.display = 'none';
			if (this.errorEl) this.errorEl.style.display = 'none';
		}

		/**
		 * Preloads image and mounts Base Gun into the logical stage.
		 *
		 * @param {Object} product Normalized Base Gun product.
		 */
		loadAndRenderBaseGun(product) {
			return new Promise((resolve) => {
				if (!product || !product.builder_image || !product.builder_image.url) {
					this.showInvalidState('Weapon image is not available.');
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
			this.currentBaseGunGeometry = calculateProductGeometry(product);
			this.currentStageGeometry = calculateStageGeometry(this.currentBaseGunGeometry);

			// 2. Set Logical Stage Dimensions
			this.stageEl.style.width = this.currentStageGeometry.stageWidth + 'px';
			this.stageEl.style.height = this.currentStageGeometry.stageHeight + 'px';

			// 3. Clear previous Base Gun layer if present (Section 44)
			const existingBase = this.stageEl.querySelector('.tgb-layer--base');
			if (existingBase && existingBase.parentNode) {
				existingBase.parentNode.removeChild(existingBase);
			}
			this.layers = this.layers.filter(l => l.layerRole !== 'base');

			// 4. Mount Base Gun Layer
			const baseLayer = this.renderLayer(
				product,
				this.currentStageGeometry.baseX,
				this.currentStageGeometry.baseY,
				'base',
				10
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
			this.frameEl.style.display = 'block';

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

			const layerEl = createLayerElement(
				part,
				part.x,
				part.y,
				'part',
				part.zIndex || 20,
				part.instanceId
			);

			this.stageEl.appendChild(layerEl);

			this.layers.push({
				instanceId: part.instanceId,
				product: part,
				x: part.x,
				y: part.y,
				layerRole: 'part',
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
				el.style.left = x + 'px';
				el.style.top = y + 'px';
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

			const partEls = this.stageEl.querySelectorAll('.tgb-layer--part');
			partEls.forEach(el => {
				if (el.parentNode) {
					el.parentNode.removeChild(el);
				}
			});

			this.layers = this.layers.filter(l => l.layerRole !== 'part');
		}

		/**
		 * Mounts a Rail DOM layer from a Rail state object.
		 *
		 * @param {Object} rail Rail state entry.
		 * @return {HTMLImageElement|null}
		 */
		mountRailLayer(rail) {
			if (!this.stageEl || !rail) {
				return null;
			}

			const layerEl = createLayerElement(
				rail,
				rail.x,
				rail.y,
				'rail',
				rail.zIndex || 20,
				rail.instanceId
			);

			this.stageEl.appendChild(layerEl);

			this.layers.push({
				instanceId: rail.instanceId,
				product: rail,
				x: rail.x,
				y: rail.y,
				layerRole: 'rail',
				zIndex: rail.zIndex || 20,
				element: layerEl,
			});

			return layerEl;
		}

		/**
		 * Unmounts a Rail DOM layer by instance ID.
		 *
		 * @param {string} instanceId
		 */
		unmountRailLayer(instanceId) {
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
		 * Directly synchronizes a Rail layer's DOM position during dragging.
		 *
		 * @param {string} instanceId
		 * @param {number} x
		 * @param {number} y
		 */
		syncRailLayerPosition(instanceId, x, y) {
			let layer = this.layers.find(l => l.instanceId === instanceId);
			let el = layer ? layer.element : null;

			if (!el && this.stageEl) {
				el = this.stageEl.querySelector(`[data-tgb-instance-id="${instanceId}"]`);
			}

			if (el) {
				el.style.left = x + 'px';
				el.style.top = y + 'px';
				el.dataset.tgbX = String(x);
				el.dataset.tgbY = String(y);

				if (layer) {
					layer.x = x;
					layer.y = y;
				}
			}
		}

		/**
		 * Clears all Rail DOM layers from stage.
		 */
		clearRailLayers() {
			if (!this.stageEl) {
				return;
			}

			const railEls = this.stageEl.querySelectorAll('.tgb-layer--rail');
			railEls.forEach(el => {
				if (el.parentNode) {
					el.parentNode.removeChild(el);
				}
			});

			this.layers = this.layers.filter(l => l.layerRole !== 'rail');
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
		renderLayer(product, x, y, layerRole = 'base', zIndex = 10, instanceId = null) {
			const layerEl = createLayerElement(product, x, y, layerRole, zIndex, instanceId);
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
			const existing = this.stageEl.querySelectorAll('.tgb-mount-point-marker');
			existing.forEach(el => el.remove());

			if (!product || !product.mounting || !Array.isArray(product.mounting.points)) {
				return;
			}

			product.mounting.points.forEach(pt => {
				const marker = document.createElement('div');
				marker.className = 'tgb-mount-point-marker';

				const absX = Math.round(baseX + (parseFloat(pt.x) || 0));
				const absY = Math.round(baseY + (parseFloat(pt.y) || 0));

				marker.style.left = absX + 'px';
				marker.style.top = absY + 'px';

				const ifaceName = (pt.interface && pt.interface.name) ? pt.interface.name : '';
				const tooltip = document.createElement('div');
				tooltip.className = 'tgb-mount-point-tooltip';
				tooltip.textContent = `${pt.label || 'Mount'} (${ifaceName})\nLocal: X ${pt.x} / Y ${pt.y}\nAbs: X ${absX} / Y ${absY}`;

				const crosshair = document.createElement('div');
				crosshair.className = 'tgb-mount-point-crosshair';

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

			const scale = calculateDisplayScale(this.currentStageGeometry.stageWidth, availableWidth);
			this.currentDisplayScale = scale;

			// Physical display frame dimensions
			const physicalW = Math.round(this.currentStageGeometry.stageWidth * scale);
			const physicalH = Math.round(this.currentStageGeometry.stageHeight * scale);

			this.frameEl.style.width = physicalW + 'px';
			this.frameEl.style.height = physicalH + 'px';

			// Whole stage transform (Section 15 & 16)
			this.stageEl.style.transform = 'scale(' + scale + ')';

			// Update internal debug HUD scale indicator if present
			const hudScale = this.root.querySelector('#tgb-stage-hud-scale');
			if (hudScale) {
				hudScale.textContent = '1mm = 1px (Scale: ' + (scale * 100).toFixed(1) + '%)';
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
				this.resizeObserver = new window.ResizeObserver((entries) => {
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
				window.addEventListener('resize', handleResize);
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

	// =========================================================================
	// 3. TGB INTERACTIONS (Section 12, 13, 14, 15, 16, 24, 26, 46, 47)
	// =========================================================================

	/**
	 * Pointer Events Interaction Controller.
	 *
	 * Manages mouse, touch, and stylus dragging of Part layers.
	 * Converts physical pointer deltas to logical coordinates using the renderer's
	 * canonical display scale, enforces stage boundary clamping, and updates the Build State.
	 */
	class TGB_Interactions {
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

			stageEl.addEventListener('pointerdown', this.boundPointerDown);
		}

		/**
		 * Handles pointerdown on draggable Part layers.
		 *
		 * @param {PointerEvent} e
		 */
		handlePointerDown(e) {
			// Only accept primary pointer button (button 0 for mouse)
			if (e.button !== 0 && e.pointerType === 'mouse') {
				return;
			}

			// Single active pointer policy (Section 47)
			if (this.activeDrag !== null) {
				return;
			}

			// Block dragging in read-only shared preview mode (Part 6)
			if (this.renderer && this.renderer.root && this.renderer.root.classList.contains('tgb-shared-preview-mode')) {
				return;
			}

			// Must be on a draggable Part or Rail layer (NOT on Base Gun)
			const target = e.target.closest('.tgb-layer--part, .tgb-layer--rail');
			if (!target) {
				return;
			}

			const instanceId = target.dataset.tgbInstanceId;
			if (!instanceId) {
				return;
			}

			const isRail = target.classList.contains('tgb-layer--rail');
			const item = isRail ? this.buildState.getRail(instanceId) : this.buildState.getPart(instanceId);
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

			target.classList.add('is-dragging');

			target.addEventListener('pointermove', this.boundPointerMove);
			target.addEventListener('pointerup', this.boundPointerUp);
			target.addEventListener('pointercancel', this.boundPointerCancel);

			this.updateDebugHUD(instanceId, item.x, item.y, displayScale);
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
				const rAF = (window && typeof window.requestAnimationFrame === 'function')
					? window.requestAnimationFrame
					: ((fn) => setTimeout(fn, 16));

				this.activeDrag.rafId = rAF(() => {
					if (!this.activeDrag) {
						return;
					}
					this.activeDrag.rafId = null;

					const physicalDeltaX = this.activeDrag.latestClientX - this.activeDrag.startClientX;
					const physicalDeltaY = this.activeDrag.latestClientY - this.activeDrag.startClientY;

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

					const clampedX = Math.max(0, Math.min(rawX, stageW - this.activeDrag.partWidth));
					const clampedY = Math.max(0, Math.min(rawY, stageH - this.activeDrag.partHeight));

					// Update authoritative Build State (Section 3)
					if (this.activeDrag.isRail) {
						this.buildState.updateRailPosition(this.activeDrag.instanceId, clampedX, clampedY);
					} else {
						this.buildState.updatePartPosition(this.activeDrag.instanceId, clampedX, clampedY);
					}

					this.updateDebugHUD(this.activeDrag.instanceId, clampedX, clampedY, this.activeDrag.displayScale);
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
				const cAF = (window && typeof window.cancelAnimationFrame === 'function')
					? window.cancelAnimationFrame
					: ((id) => clearTimeout(id));
				cAF(this.activeDrag.rafId);
				this.activeDrag.rafId = null;
			}

			const element = this.activeDrag.element;
			const pointerId = this.activeDrag.pointerId;

			element.classList.remove('is-dragging');

			element.removeEventListener('pointermove', this.boundPointerMove);
			element.removeEventListener('pointerup', this.boundPointerUp);
			element.removeEventListener('pointercancel', this.boundPointerCancel);

			try {
				element.releasePointerCapture(pointerId);
			} catch (err) {
				// Pointer capture already released or element detached
			}

			const instanceId = element.getAttribute('data-tgb-instance-id');
			this.activeDrag = null;

			if (this.buildState && instanceId) {
				this.buildState._notify({
					type: 'drag_ended',
					instanceId: instanceId,
					state: this.buildState.getState()
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
		updateDebugHUD(instanceId, x, y, scale) {
			const hudEl = this.renderer.root.querySelector('#tgb-stage-hud-scale');
			if (hudEl) {
				const shortId = instanceId ? instanceId.substring(0, 14) : '';
				hudEl.textContent = `1mm = 1px (Scale: ${(scale * 100).toFixed(1)}%) | Part [${shortId}] X: ${Math.round(x)} Y: ${Math.round(y)}`;
			}
		}

		destroy() {
			this.cancelActiveDrag();
			const stageEl = this.renderer.stageEl;
			if (stageEl) {
				stageEl.removeEventListener('pointerdown', this.boundPointerDown);
			}
		}
	}

	// =========================================================================
	// 4. CATALOG CLIENT & PRODUCT REGISTRY (Part 6)
	// =========================================================================

	/**
	 * Client service for interacting with the public Gun Builder catalog REST API.
	 */
	class TGB_CatalogClient {
		/**
		 * @param {string} [baseUrl] Base URL for the Gun Builder REST API endpoints.
		 */
		constructor(baseUrl) {
			let url = baseUrl || (window.taktikGunBuilder && window.taktikGunBuilder.restUrl) || '/wp-json/tgb/v1/';
			if (!url.endsWith('/')) {
				url += '/';
			}
			this.baseUrl = url;
		}

		/**
		 * Fetches paginated Base Guns.
		 *
		 * @param {number} [limit=20]
		 * @param {string} [cursor='']
		 * @param {AbortSignal} [signal]
		 * @return {Promise<{items: Array, limit: number, has_more: boolean, next_cursor: string|null}>}
		 */
		async getBaseGuns(limit = 20, cursor = '', signal = null) {
			const endpoint = new URL('base-guns', this.baseUrl);
			endpoint.searchParams.set('limit', limit);
			if (cursor) {
				endpoint.searchParams.set('cursor', cursor);
			}

			const res = await fetch(endpoint.toString(), {
				method: 'GET',
				headers: { 'Accept': 'application/json' },
				signal: signal || undefined,
			});

			if (!res.ok) {
				throw new Error(`Catalog API error: HTTP ${res.status}`);
			}
			return await res.json();
		}

		/**
		 * Fetches dynamic Part Type taxonomy terms.
		 *
		/**
		 * Fetches dynamic Part Type taxonomy terms (Legacy V1.1 compatibility).
		 *
		 * @param {AbortSignal} [signal]
		 * @return {Promise<Array<{id: number, name: string, slug: string}>>}
		 */
		async getPartTypes(signal = null) {
			const endpoint = new URL('part-types', this.baseUrl);
			const res = await fetch(endpoint.toString(), {
				method: 'GET',
				headers: { 'Accept': 'application/json' },
				signal: signal || undefined,
			});

			if (!res.ok) {
				throw new Error(`Catalog API error: HTTP ${res.status}`);
			}
			return await res.json();
		}

		/**
		 * Fetches dynamic hierarchical WooCommerce categories containing eligible parts.
		 *
		 * @param {number} [baseGunId=0] Base Gun ID to filter categories by mounting compatibility.
		 * @param {Array} [installedRails=[]] Optional array of installed rail instances.
		 * @param {AbortSignal} [signal]
		 * @return {Promise<Array<{id: number, name: string, slug: string, parent: number, count: number, children: Array}>>}
		 */
		async getCategories(baseGunId = 0, installedRails = [], signal = null) {
			const endpoint = new URL('categories', this.baseUrl);
			if (baseGunId && Number(baseGunId) > 0) {
				endpoint.searchParams.set('base_gun_id', Number(baseGunId));
			}
			if (Array.isArray(installedRails) && installedRails.length > 0) {
				const normRails = installedRails.map(r => ({
					instance_id: r.instance_id || r.instanceId || '',
					product_id: r.product_id || r.productId || 0,
					position: r.position || 'bottom',
				})).filter(r => r.instance_id && r.product_id > 0);
				if (normRails.length > 0) {
					endpoint.searchParams.set('installed_rails', JSON.stringify(normRails));
				}
			}

			const res = await fetch(endpoint.toString(), {
				method: 'GET',
				headers: { 'Accept': 'application/json' },
				signal: signal || undefined,
			});

			if (!res.ok) {
				throw new Error(`Catalog API error: HTTP ${res.status}`);
			}
			return await res.json();
		}

		/**
		 * Fetches paginated Parts for a specific WooCommerce product_cat category.
		 *
		 * @param {number} categoryId
		 * @param {number} [baseGunId=0]
		 * @param {number} [limit=20]
		 * @param {string} [cursor='']
		 * @param {Array} [installedRails=[]] Optional array of installed rail instances.
		 * @param {AbortSignal} [signal]
		 * @return {Promise<{items: Array, limit: number, has_more: boolean, next_cursor: string|null}>}
		 */
		async getPartsByCategory(categoryId, baseGunId = 0, limit = 20, cursor = '', installedRails = [], signal = null) {
			const endpoint = new URL('parts', this.baseUrl);
			endpoint.searchParams.set('category_id', categoryId);
			if (baseGunId && Number(baseGunId) > 0) {
				endpoint.searchParams.set('base_gun_id', Number(baseGunId));
			}
			endpoint.searchParams.set('limit', limit);
			if (cursor) {
				endpoint.searchParams.set('cursor', cursor);
			}
			if (Array.isArray(installedRails) && installedRails.length > 0) {
				const normRails = installedRails.map(r => ({
					instance_id: r.instance_id || r.instanceId || '',
					product_id: r.product_id || r.productId || 0,
					position: r.position || 'bottom',
				})).filter(r => r.instance_id && r.product_id > 0);
				if (normRails.length > 0) {
					endpoint.searchParams.set('installed_rails', JSON.stringify(normRails));
				}
			}

			const res = await fetch(endpoint.toString(), {
				method: 'GET',
				headers: { 'Accept': 'application/json' },
				signal: signal || undefined,
			});

			if (!res.ok) {
				throw new Error(`Catalog API error: HTTP ${res.status}`);
			}
			return await res.json();
		}

		/**
		 * Fetches paginated eligible Rail products for a Base Gun.
		 *
		 * @param {number} [baseGunId=0]
		 * @param {number} [limit=20]
		 * @param {string} [cursor='']
		 * @param {AbortSignal} [signal]
		 * @return {Promise<{items: Array, limit: number, has_more: boolean, next_cursor: string|null}>}
		 */
		async getRails(baseGunId = 0, limit = 20, cursor = '', signal = null) {
			const endpoint = new URL('rails', this.baseUrl);
			if (baseGunId && Number(baseGunId) > 0) {
				endpoint.searchParams.set('base_gun_id', Number(baseGunId));
			}
			endpoint.searchParams.set('limit', limit);
			if (cursor) {
				endpoint.searchParams.set('cursor', cursor);
			}

			const res = await fetch(endpoint.toString(), {
				method: 'GET',
				headers: { 'Accept': 'application/json' },
				signal: signal || undefined,
			});

			if (!res.ok) {
				throw new Error(`Catalog API error: HTTP ${res.status}`);
			}
			return await res.json();
		}

		/**
		 * Authoritatively validates Base Gun, Rails, and Parts compatibility via REST.
		 *
		 * @param {number} baseGunId
		 * @param {Array} [installedRails=[]]
		 * @param {Array} [parts=[]]
		 * @param {AbortSignal} [signal]
		 * @return {Promise<Object>}
		 */
		async validateBuild(baseGunId, installedRails = [], parts = [], signal = null) {
			const endpoint = new URL('validate-build', this.baseUrl);
			const res = await fetch(endpoint.toString(), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify({
					base_gun_id: baseGunId,
					installed_rails: installedRails,
					parts: parts
				}),
				signal: signal || undefined,
			});

			if (!res.ok) {
				throw new Error(`Validate build API error: HTTP ${res.status}`);
			}
			return await res.json();
		}

		/**
		 * Fetches paginated Parts for a specific Part Type (Legacy V1.1 compatibility).
		 *
		 * @param {number} typeId
		 * @param {number} [limit=20]
		 * @param {string} [cursor='']
		 * @param {AbortSignal} [signal]
		 * @return {Promise<{items: Array, limit: number, has_more: boolean, next_cursor: string|null}>}
		 */
		async getPartsByType(typeId, limit = 20, cursor = '', signal = null) {
			const endpoint = new URL('parts', this.baseUrl);
			endpoint.searchParams.set('type_id', typeId);
			endpoint.searchParams.set('limit', limit);
			if (cursor) {
				endpoint.searchParams.set('cursor', cursor);
			}

			const res = await fetch(endpoint.toString(), {
				method: 'GET',
				headers: { 'Accept': 'application/json' },
				signal: signal || undefined,
			});

			if (!res.ok) {
				throw new Error(`Catalog API error: HTTP ${res.status}`);
			}
			return await res.json();
		}
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
	const TGB_Mounting = {
		/**
		 * Evaluates compatibility status between a Base Gun and a Part product,
		 * optionally considering active installed Rails.
		 *
		 * @param {Object} baseProduct Normalized Base Gun product.
		 * @param {Object} partProduct Normalized Part product.
		 * @param {Array} [installedRails=[]] Optional array of installed rail instances.
		 * @return {'compatible'|'incompatible'|'unconfigured'}
		 */
		getCompatibility(baseProduct, partProduct, installedRails = []) {
			if (!baseProduct || !partProduct) {
				return 'unconfigured';
			}

			if (partProduct.role === 'base_gun') {
				return 'compatible';
			}

			if (partProduct.role === 'rail') {
				const positions = this.getRailCompatiblePositions(baseProduct, partProduct);
				return positions.length > 0 ? 'compatible' : 'incompatible';
			}

			if (Array.isArray(installedRails) && installedRails.length > 0) {
				const pool = this.buildCapabilityPool(baseProduct, installedRails);
				const res = this.checkPartCompatibilityWithPool(partProduct, pool);
				return res.status;
			}

			// Validate Base Gun mounting configuration
			const basePoints = (baseProduct.mounting && Array.isArray(baseProduct.mounting.points))
				? baseProduct.mounting.points
				: [];
			if (basePoints.length === 0) {
				return 'unconfigured';
			}

			// Validate Part mounting configuration
			const partInterfaces = (partProduct.mounting && Array.isArray(partProduct.mounting.interfaces))
				? partProduct.mounting.interfaces
				: [];
			const partAnchor = (partProduct.mounting && partProduct.mounting.anchor)
				? partProduct.mounting.anchor
				: null;

			if (partInterfaces.length === 0 || !partAnchor || typeof partAnchor.x_percent !== 'number' || typeof partAnchor.y_percent !== 'number') {
				return 'unconfigured';
			}

			const partInterfaceIds = partInterfaces
				.map(iface => iface.id)
				.filter(id => typeof id === 'number' && id > 0);

			const partPositions = (partProduct.mounting && Array.isArray(partProduct.mounting.positions))
				? partProduct.mounting.positions
				: [];

			// If the part has specific position requirements, at least one matching mount point must be at an accepted position.
			// If the part has no position requirements (empty array), any mount point matching the interface is compatible (legacy).
			const hasIntersection = basePoints.some(pt => {
				const ptIfaceId = pt.interface ? pt.interface.id : 0;
				const ptPos = pt.position || 'unspecified';
				if (!partInterfaceIds.includes(ptIfaceId)) {
					return false;
				}
				if (partPositions.length === 0) {
					return true;
				}
				return partPositions.includes(ptPos);
			});

			return hasIntersection ? 'compatible' : 'incompatible';
		},

		/**
		 * Determines the compatible installation positions for a Rail on a Base Gun.
		 *
		 * @param {Object} baseProduct Normalized Base Gun product.
		 * @param {Object} railProduct Normalized Rail product.
		 * @return {Array<string>} Array of compatible positions ('top', 'bottom').
		 */
		getRailCompatiblePositions(baseProduct, railProduct) {
			if (!baseProduct || !railProduct || railProduct.role !== 'rail') {
				return [];
			}
			if (baseProduct.rails_enabled === false) {
				return [];
			}

			const railMeta = railProduct.rail || {};
			const inputIfaceId = (railMeta.input_interface && railMeta.input_interface.id) || railProduct.rail_input_interface_id || 0;
			if (!inputIfaceId) {
				return [];
			}

			const supportedPositions = railMeta.supported_positions || railProduct.rail_supported_positions || [];
			if (!Array.isArray(supportedPositions) || supportedPositions.length === 0) {
				return [];
			}

			// Base Gun allowed rail positions
			const baseAllowed = baseProduct.rail_positions || ['top', 'bottom'];

			// Base Gun mount points
			const basePoints = (baseProduct.mounting && Array.isArray(baseProduct.mounting.points))
				? baseProduct.mounting.points
				: [];

			const compatible = [];
			for (const pos of supportedPositions) {
				if (!baseAllowed.includes(pos)) {
					continue;
				}
				// Does base gun provide this input interface at this position?
				const hasMount = basePoints.some(pt => {
					const ptIfaceId = pt.interface ? pt.interface.id : 0;
					const ptPos = pt.position || 'unspecified';
					return ptIfaceId === inputIfaceId && (ptPos === pos || ptPos === 'unspecified');
				});

				if (hasMount) {
					compatible.push(pos);
				}
			}

			return compatible;
		},

		/**
		 * Builds the client-side active capability pool from Base Gun and installed Rails.
		 *
		 * @param {Object} baseProduct
		 * @param {Array} installedRails
		 * @return {Array}
		 */
		buildCapabilityPool(baseProduct, installedRails = []) {
			const pool = [];

			if (baseProduct && baseProduct.mounting && Array.isArray(baseProduct.mounting.points)) {
				for (const pt of baseProduct.mounting.points) {
					const ifaceId = pt.interface ? pt.interface.id : 0;
					if (ifaceId > 0) {
						pool.push({
							interface_id: ifaceId,
							position: pt.position || 'unspecified',
							source_type: 'base_gun',
							source_id: pt.id || '',
						});
					}
				}
			}

			if (Array.isArray(installedRails)) {
				for (const rail of installedRails) {
					const railMeta = rail.rail || {};
					const outputIfaces = railMeta.output_interfaces || [];
					const pos = rail.position || 'bottom';
					for (const iface of outputIfaces) {
						const ifaceId = typeof iface === 'object' ? iface.id : iface;
						if (ifaceId > 0) {
							pool.push({
								interface_id: ifaceId,
								position: pos,
								source_type: 'rail',
								source_id: rail.instanceId || String(rail.productId),
							});
						}
					}
				}
			}

			return pool;
		},

		/**
		 * Evaluates Part compatibility against the active capability pool.
		 *
		 * @param {Object} partProduct
		 * @param {Array} pool
		 * @return {{status: 'compatible'|'incompatible'|'unconfigured', supportingSources: Array}}
		 */
		checkPartCompatibilityWithPool(partProduct, pool) {
			if (!partProduct || !Array.isArray(pool)) {
				return { status: 'unconfigured', supportingSources: [] };
			}

			const partInterfaces = (partProduct.mounting && Array.isArray(partProduct.mounting.interfaces))
				? partProduct.mounting.interfaces
				: [];
			const partAnchor = (partProduct.mounting && partProduct.mounting.anchor)
				? partProduct.mounting.anchor
				: null;

			if (partInterfaces.length === 0 || !partAnchor || typeof partAnchor.x_percent !== 'number' || typeof partAnchor.y_percent !== 'number') {
				return { status: 'unconfigured', supportingSources: [] };
			}

			const partInterfaceIds = partInterfaces
				.map(iface => iface.id)
				.filter(id => typeof id === 'number' && id > 0);

			const partPositions = (partProduct.mounting && Array.isArray(partProduct.mounting.positions))
				? partProduct.mounting.positions
				: [];

			const supportingSources = [];

			for (const cap of pool) {
				if (!partInterfaceIds.includes(cap.interface_id)) {
					continue;
				}

				// Position check:
				// If Part has no explicit positions: matches ANY capability position (legacy behavior).
				// If Part specifies explicit positions: capability position must match.
				if (partPositions.length > 0 && !partPositions.includes(cap.position)) {
					continue;
				}

				supportingSources.push(cap);
			}

			return {
				status: supportingSources.length > 0 ? 'compatible' : 'incompatible',
				supportingSources: supportingSources,
			};
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
			if (this.getCompatibility(baseProduct, partProduct) !== 'compatible') {
				return null;
			}

			const basePoints = baseProduct.mounting.points;
			const acceptedIds = partProduct.mounting.interfaces.map(iface => iface.id);
			const partPositions = (partProduct.mounting && Array.isArray(partProduct.mounting.positions))
				? partProduct.mounting.positions
				: [];

			for (let i = 0; i < basePoints.length; i++) {
				const pt = basePoints[i];
				const ptIfaceId = pt.interface ? pt.interface.id : 0;
				const ptPos = pt.position || 'unspecified';
				if (acceptedIds.includes(ptIfaceId)) {
					if (partPositions.length === 0 || partPositions.includes(ptPos)) {
						return pt;
					}
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
		calculateInitialPosition(baseX, baseY, mountPoint, partWidth, partHeight, anchorXPercent, anchorYPercent, stageWidth, stageHeight) {
			const mountX = parseFloat(mountPoint.x) || 0.0;
			const mountY = parseFloat(mountPoint.y) || 0.0;

			const absoluteMountX = baseX + mountX;
			const absoluteMountY = baseY + mountY;

			const partAnchorOffsetX = partWidth * (parseFloat(anchorXPercent) / 100.0);
			const partAnchorOffsetY = partHeight * (parseFloat(anchorYPercent) / 100.0);

			let initialX = Math.round(absoluteMountX - partAnchorOffsetX);
			let initialY = Math.round(absoluteMountY - partAnchorOffsetY);

			// Stage boundary clamping
			if (typeof stageWidth === 'number' && stageWidth > 0) {
				initialX = Math.max(0, Math.min(initialX, Math.round(stageWidth - partWidth)));
			}
			if (typeof stageHeight === 'number' && stageHeight > 0) {
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

			const sWidth = (typeof stageWidth === 'number' && stageWidth > 0) ? stageWidth : 1180;
			const sHeight = (typeof stageHeight === 'number' && stageHeight > 0) ? stageHeight : 500;
			const pWidth = Math.max(1, Math.round(partWidth || 50));
			const pHeight = Math.max(1, Math.round(partHeight || 50));

			// Extract Base Gun obstacle
			let baseGunBox = null;
			if (baseGun && typeof baseGun.x === 'number' && typeof baseGun.y === 'number' && baseGun.width > 0 && baseGun.height > 0) {
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
					if (part && typeof part.x === 'number' && typeof part.y === 'number') {
						partObstacles.push({
							id: part.instanceId || part.id || 'part',
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
						return { type: 'part', obj: part };
					}
				}
				if (collidesWithBaseGun(candX, candY, pWidth, pHeight)) {
					return { type: 'base_gun', obj: baseGunBox };
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
		}
	};

	// =========================================================================
	// 6. PRODUCT SELECTION CONTROLLER (Parts 6 & 7)
	// =========================================================================

	/**
	 * Manages the Category Navigation, Product Grid, Load More continuation,
	 * in-memory cache, Base Gun selection, and Part spawn integration.
	 */
	class TGB_ProductSelection {
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
				const status = TGB_Mounting.getCompatibility(baseProduct, product, installedRails);
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
				const status = TGB_Mounting.getCompatibility(baseProduct, product, installedRails);
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
					const compatStatus = TGB_Mounting.getCompatibility(baseProduct, product, installedRails);
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
				validPositions = TGB_Mounting.getRailCompatiblePositions(baseProduct, product);
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
				const compatStatus = baseProduct ? TGB_Mounting.getCompatibility(baseProduct, product, installedRails) : null;

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
			const compatStatus = TGB_Mounting.getCompatibility(baseProduct, product, installedRails);
			if (compatStatus !== 'compatible') {
				this.showStatus('This component is not compatible with the selected platform.', false);
				return;
			}

			// Store in registry
			this.productRegistry.set(product.id, product);

			// Lower-Left Staging Spawn (Part 12 non-overlapping placement):
			const stage = this.renderer.currentStageGeometry || { stageWidth: 1000, stageHeight: 600, baseX: 0, baseY: 0 };
			const geo = calculateProductGeometry(product);
			const currentBaseGun = (this.buildState.getBaseGun && this.buildState.getBaseGun()) || this.buildState.baseGun || null;

			const initialPos = TGB_Mounting.calculateStagingPosition(
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
			const validPositions = TGB_Mounting.getRailCompatiblePositions(baseProduct, product);
			if (!validPositions.includes(position)) {
				this.showStatus('Selected rail position is not compatible with this platform.', false);
				return;
			}

			// Store in registry
			this.productRegistry.set(product.id, product);

			// Staging spawn calculation
			const stage = this.renderer.currentStageGeometry || { stageWidth: 1000, stageHeight: 600, baseX: 0, baseY: 0 };
			const geo = calculateProductGeometry(product);
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
			const pool = TGB_Mounting.buildCapabilityPool(baseProduct, remainingRails);

			const installedParts = [...this.buildState.parts];
			const prunedPartNames = [];

			for (const partInst of installedParts) {
				const partProduct = this.productRegistry.get(partInst.productId);
				if (!partProduct) continue;

				const compatRes = TGB_Mounting.checkPartCompatibilityWithPool(partProduct, pool);
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
					const validPositions = baseProduct ? TGB_Mounting.getRailCompatiblePositions(baseProduct, product) : [];

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
					const compatStatus = baseProduct ? TGB_Mounting.getCompatibility(baseProduct, product, installedRails) : null;

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

	// =========================================================================
	// 7. CART INTEGRATION CLIENT (Part 9)
	// =========================================================================

	/**
	 * Client service managing secure Add Build to Cart submissions.
	 *
	 * Extracts minimal build identity from TGB_BuildState (never DOM inspection),
	 * enforces idempotency, prevents concurrent submissions, and communicates with
	 * the server-side TGB_Cart endpoint.
	 */
	class TGB_CartClient {
		constructor(buildState, config = null) {
			this.buildState = buildState;
			this.config = config || (window.taktikGunBuilder || {});
			this.isSubmitting = false;
			this.currentRequestId = null;
		}

		/**
		 * Submits current build to WooCommerce cart.
		 *
		 * @return {Promise<{success: boolean, data?: Object, message?: string}>}
		 */
		async addBuildToCart() {
			if (this.isSubmitting) {
				return { success: false, message: 'Submission already in progress.' };
			}

			// Reject submissions if preview mode is active
			const rootEl = document.getElementById('taktik-gun-builder');
			if (rootEl && rootEl.classList.contains('tgb-shared-preview-mode')) {
				return { success: false, message: 'Please click Customize a Copy before adding this build to cart.' };
			}

			const state = this.buildState.getState();
			const baseGun = state.baseGun;

			if (!baseGun || !baseGun.productId) {
				return { success: false, message: 'Choose a base platform before adding to cart.' };
			}

			// Unique request ID per submission attempt (Requirement 33 & 77)
			this.currentRequestId = 'req-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
			this.isSubmitting = true;

			// Minimal payload strictly from Build State (Requirement 7 & 67 + Part 3B Rails)
			const rails = (state.rails || []).map(r => ({
				product_id: r.productId,
				instance_id: r.instanceId || '',
				position: r.position || 'bottom'
			}));

			const parts = (state.parts || []).map(p => ({
				product_id: p.productId,
				instance_id: p.instanceId || ''
			}));

			const payload = {
				base_product_id: baseGun.productId,
				rails: rails,
				parts: parts,
				request_id: this.currentRequestId,
				nonce: this.config.cartNonce || ''
			};

			const endpointUrl = (this.config.ajaxUrl || '/wp-admin/admin-ajax.php') + '?action=tgb_add_build_to_cart';

			try {
				const response = await fetch(endpointUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce': this.config.cartNonce || ''
					},
					body: JSON.stringify(payload)
				});

				const res = await response.json();

				if (response.ok && res && res.success) {
					this.triggerCartFragments(res.data);
					return {
						success: true,
						data: res.data || {}
					};
				} else {
					const errorMsg = (res && res.data && res.data.message)
						? res.data.message
						: (res && res.message ? res.message : "We couldn't add this build to your cart. Please review the build and try again.");

					return {
						success: false,
						message: errorMsg
					};
				}
			} catch (err) {
				return {
					success: false,
					message: 'Network connection issue. Please check your connection and try again.'
				};
			} finally {
				this.isSubmitting = false;
			}
		}

		/**
		 * Triggers standard WooCommerce frontend cart fragments refresh events.
		 */
		triggerCartFragments(data) {
			try {
				if (typeof window.jQuery !== 'undefined') {
					window.jQuery(document.body).trigger('added_to_cart', [
						data ? data.fragments : null,
						data ? data.cart_hash : null,
						null
					]);
					window.jQuery(document.body).trigger('wc_fragment_refresh');
				}
				document.dispatchEvent(new CustomEvent('tgb_build_added_to_cart', { detail: data }));
			} catch (e) {
				// Non-blocking
			}
		}
	}

	// =========================================================================
	// 8. CURRENT BUILD CONTROLLER (Parts 8 & 9)
	// =========================================================================

	/**
	 * Controller for Current Build summary panel, component list, remove actions,
	 * live subtotal, total weight, and secure Add Build to Cart action.
	 *
	 * Completely state-driven from TGB_BuildState + TGB_ProductRegistry.
	 * Ignores part_moved events completely (zero drag overhead, Requirements 8 & 9).
	 */
	class TGB_CurrentBuild {
		constructor(root, buildState, productRegistry, currencyConfig = null, weightConfig = null) {
			this.root = root;
			this.buildState = buildState;
			this.productRegistry = productRegistry;
			this.currencyConfig = currencyConfig || (window.taktikGunBuilder && window.taktikGunBuilder.currency) || {};
			this.weightConfig = weightConfig || (window.taktikGunBuilder && window.taktikGunBuilder.weight) || {};

			this.countEl = root.querySelector('#tgb-sidebar-build-count');
			this.bodyEl = root.querySelector('#tgb-sidebar-build-body');
			this.announcerEl = root.querySelector('#tgb-live-announcer');

			this.cartClient = new TGB_CartClient(this.buildState, window.taktikGunBuilder);
			this.cartFeedback = null; // { type: 'success' | 'error', message: string, url?: string }

			this.boundStateChange = this.handleStateChange.bind(this);
			this.boundBodyClick = this.handleBodyClick.bind(this);
		}

		init() {
			if (!this.bodyEl) return;

			// Subscribe to Build State (composition changes)
			this.buildState.subscribe(this.boundStateChange);

			// Listen for remove & cart button clicks via event delegation
			this.bodyEl.addEventListener('click', this.boundBodyClick);

			// Listen for Reset Build button
			const resetBtn = this.root.querySelector('#tgb-reset-build-btn');
			if (resetBtn) {
				resetBtn.addEventListener('click', () => this.handleResetBuild());
			}

			// Initial render
			this.render();
		}

		/**
		 * Reacts strictly to composition-changing Build State events.
		 * Ignores part_moved events completely (Requirement 8 & 9).
		 */
		handleStateChange(event) {
			if (!event || event.type === 'part_moved') {
				return;
			}
			// Clear error feedback on subsequent composition mutations
			if (this.cartFeedback && this.cartFeedback.type === 'error') {
				this.cartFeedback = null;
			}
			this.render();
		}

		/**
		 * Handles click events within the Current Build panel (Remove Part, Add Build to Cart).
		 */
		handleBodyClick(event) {
			// Read-only shared preview mode blocks modification and purchasing
			if (this.root && this.root.classList.contains('tgb-shared-preview-mode')) {
				const addCartBtn = event.target.closest('#tgb-add-to-cart-btn');
				if (addCartBtn) {
					if (window.TGB && window.TGB.selection && typeof window.TGB.selection.showNotice === 'function') {
						window.TGB.selection.showNotice('Please click Customize a Copy in the top banner before adding this build to cart.', 'info');
					}
					if (typeof this.announce === 'function') {
						this.announce('Please click Customize a Copy in the top banner before adding this build to cart.');
					}
				}
				return;
			}

			// Remove part or rail button
			const removeBtn = event.target.closest('.tgb-build-item-remove');
			if (removeBtn) {
				const instanceId = removeBtn.getAttribute('data-instance-id');
				const itemType = removeBtn.getAttribute('data-item-type');
				if (!instanceId) return;

				if (itemType === 'rail') {
					if (window.TGB && window.TGB.selection && window.TGB.selection.handleRailRemoval) {
						window.TGB.selection.handleRailRemoval(instanceId);
					} else {
						this.buildState.removeRail(instanceId);
					}
					return;
				}

				const part = this.buildState.getPart(instanceId);
				const partName = part ? part.name : 'Component';

				// Remove part from authoritative Build State
				const removed = this.buildState.removePart(instanceId);
				if (removed) {
					this.announce(`${partName} removed from build.`);
				}
				return;
			}

			// Add Build to Cart button
			const addCartBtn = event.target.closest('#tgb-add-to-cart-btn');
			if (addCartBtn) {
				if (addCartBtn.disabled) return;
				this.handleAddBuildToCart();
				return;
			}

			// Reset Build button
			const resetBtn = event.target.closest('#tgb-reset-build-btn');
			if (resetBtn) {
				this.handleResetBuild();
				return;
			}
		}

		/**
		 * Resets the build: clears Build State, stage, Current Build, and persisted storage.
		 */
		handleResetBuild() {
			if (window.TGB && window.TGB.guestBuildManager) {
				window.TGB.guestBuildManager.promptReset();
				return;
			}

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

			this.announce('Build reset. All components cleared.');
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
				const ref = (result.data && result.data.build_reference) ? result.data.build_reference : '';
				const cartUrl = (result.data && result.data.cart_url)
					? result.data.cart_url
					: ((window.taktikGunBuilder && window.taktikGunBuilder.cartUrl) || '/cart/');

				this.cartFeedback = {
					type: 'success',
					message: ref ? `Build added to cart (${ref}).` : 'Build added to cart.',
					url: cartUrl
				};
				this.announce(`Build added to cart. Reference ${ref}.`);
			} else {
				this.cartFeedback = {
					type: 'error',
					message: result.message || "We couldn't add this build to your cart."
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
				this.announcerEl.textContent = '';
				void this.announcerEl.offsetWidth;
				this.announcerEl.textContent = message;
			}
		}

		/**
		 * Formats numeric price according to WooCommerce currency settings (Requirements 21 & 22).
		 */
		formatPrice(amount) {
			if (typeof amount !== 'number' || isNaN(amount)) {
				return '';
			}

			const config = Object.assign({
				symbol: '$',
				decimals: 2,
				decimal_separator: '.',
				thousand_separator: ',',
				price_format: '%1$s%2$s'
			}, this.currencyConfig || {});

			const decimals = typeof config.decimals === 'number' ? config.decimals : 2;
			const isNegative = amount < 0;
			const absAmount = Math.abs(amount);

			const fixed = absAmount.toFixed(decimals);
			const parts = fixed.split('.');
			const integerPart = parts[0];
			const fractionalPart = parts[1];

			const thousandSep = typeof config.thousand_separator === 'string' ? config.thousand_separator : ',';
			const decimalSep = typeof config.decimal_separator === 'string' ? config.decimal_separator : '.';
			const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);

			let formattedNumber = formattedInteger;
			if (decimals > 0 && typeof fractionalPart !== 'undefined') {
				formattedNumber += decimalSep + fractionalPart;
			}

			const symbol = config.symbol || '$';
			const format = config.price_format || '%1$s%2$s';
			let result = format.replace('%1$s', symbol).replace('%2$s', formattedNumber);

			return isNegative ? '-' + result : result;
		}

		/**
		 * Formats weight in grams for customer display (Requirement 35).
		 */
		formatWeight(grams) {
			if (typeof grams !== 'number' || isNaN(grams) || grams < 0) {
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
			const rails = this.buildState.rails || [];
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
				if (baseProduct && baseProduct.price && typeof baseProduct.price.unit_amount === 'number') {
					knownSubtotal += baseProduct.price.unit_amount;
				} else if (baseGun.price && typeof baseGun.price.unit_amount === 'number') {
					knownSubtotal += baseGun.price.unit_amount;
				} else {
					priceUnknownCount++;
				}

				// Base Gun Weight
				if (baseProduct && baseProduct.weight && typeof baseProduct.weight.grams === 'number') {
					knownGrams += baseProduct.weight.grams;
				} else if (baseGun.weight && typeof baseGun.weight.grams === 'number') {
					knownGrams += baseGun.weight.grams;
				} else {
					weightUnknownCount++;
				}
			}

			// Rails contribution (Section 11.1 - 11.3)
			const resolvedRails = rails.map(railInstance => {
				const product = this.productRegistry.get(railInstance.productId);

				let hasPrice = false;
				let unitPrice = null;
				if (product && product.price && typeof product.price.unit_amount === 'number') {
					unitPrice = product.price.unit_amount;
					knownSubtotal += unitPrice;
					hasPrice = true;
				} else {
					priceUnknownCount++;
				}

				let hasWeight = false;
				let grams = null;
				if (product && product.weight && typeof product.weight.grams === 'number') {
					grams = product.weight.grams;
					knownGrams += grams;
					hasWeight = true;
				} else {
					weightUnknownCount++;
				}

				return {
					instance: railInstance,
					product: product,
					unitPrice: unitPrice,
					hasPrice: hasPrice,
					grams: grams,
					hasWeight: hasWeight,
				};
			});

			// Parts contribution (each instance counts individually, Requirement 12, 25, 34)
			const resolvedParts = parts.map(partInstance => {
				const product = this.productRegistry.get(partInstance.productId);

				let hasPrice = false;
				let unitPrice = null;
				if (product && product.price && typeof product.price.unit_amount === 'number') {
					unitPrice = product.price.unit_amount;
					knownSubtotal += unitPrice;
					hasPrice = true;
				} else {
					priceUnknownCount++;
				}

				let hasWeight = false;
				let grams = null;
				if (product && product.weight && typeof product.weight.grams === 'number') {
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

			const decimals = (this.currencyConfig && typeof this.currencyConfig.decimals === 'number')
				? this.currencyConfig.decimals
				: 2;

			return {
				hasBase: Boolean(baseGun),
				baseGun: baseGun,
				baseProduct: baseProduct,
				itemCount: (baseGun ? 1 : 0) + rails.length + parts.length,
				railCount: rails.length,
				componentCount: parts.length,
				resolvedRails: resolvedRails,
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
					this.countEl.textContent = '0 Items';
				} else {
					const partsDesc = [];
					if (summary.railCount > 0) {
						partsDesc.push(`${summary.railCount} Rail${summary.railCount > 1 ? 's' : ''}`);
					}
					if (summary.componentCount > 0) {
						partsDesc.push(`${summary.componentCount} Component${summary.componentCount > 1 ? 's' : ''}`);
					}
					if (partsDesc.length > 0) {
						this.countEl.textContent = `1 Weapon • ${partsDesc.join(' • ')}`;
					} else {
						this.countEl.textContent = '1 Weapon';
					}
				}
			}

			// Update Reset button visibility
			const resetBtn = this.root.querySelector('#tgb-reset-build-btn');
			if (resetBtn) {
				resetBtn.style.display = summary.hasBase ? 'inline-flex' : 'none';
			}

			// Clear body safely
			this.bodyEl.textContent = '';

			// 2. Empty State (no Base Gun)
			if (!summary.hasBase) {
				const placeholder = document.createElement('div');
				placeholder.className = 'tgb-placeholder-notice';
				const p = document.createElement('p');
				p.textContent = 'Choose a base platform below to begin your build.';
				placeholder.appendChild(p);
				this.bodyEl.appendChild(placeholder);
				return;
			}

			// 3. Base Platform Section
			const baseSection = document.createElement('div');
			baseSection.className = 'tgb-current-build-section tgb-current-build-section--base';

			const baseTagWrap = document.createElement('div');
			baseTagWrap.className = 'tgb-card-tag-wrap';

			const baseTag = document.createElement('div');
			baseTag.className = 'tgb-card-tag';
			baseTag.textContent = 'Base Platform';
			baseTagWrap.appendChild(baseTag);

			const isBaseOutOfStock = Boolean(summary.baseProduct && summary.baseProduct.stock && summary.baseProduct.stock.in_stock === false);
			if (isBaseOutOfStock) {
				const baseStockBadge = document.createElement('span');
				baseStockBadge.className = 'tgb-build-item-stock-badge tgb-build-item-stock-badge--unavailable';
				baseStockBadge.textContent = 'Unavailable';
				baseTagWrap.appendChild(baseStockBadge);
			}
			baseSection.appendChild(baseTagWrap);

			const baseRow = document.createElement('div');
			baseRow.className = 'tgb-build-item-row tgb-build-item-row--base' + (isBaseOutOfStock ? ' is-unavailable' : '');

			// Base Thumbnail
			const baseThumbWrap = document.createElement('div');
			baseThumbWrap.className = 'tgb-build-item-thumb-wrap';
			const baseThumb = document.createElement('img');
			baseThumb.className = 'tgb-build-item-thumb';
			const baseImgUrl = (summary.baseGun.builder_image && summary.baseGun.builder_image.url)
				? summary.baseGun.builder_image.url
				: '';
			baseThumb.src = baseImgUrl;
			baseThumb.alt = summary.baseGun.name || 'Base Platform';
			baseThumb.loading = 'lazy';
			baseThumbWrap.appendChild(baseThumb);
			baseRow.appendChild(baseThumbWrap);

			// Base Details
			const baseInfo = document.createElement('div');
			baseInfo.className = 'tgb-build-item-info';

			const baseTitle = document.createElement('h4');
			baseTitle.className = 'tgb-build-item-name';
			baseTitle.textContent = summary.baseGun.name;
			baseInfo.appendChild(baseTitle);

			const baseMeta = document.createElement('div');
			baseMeta.className = 'tgb-build-item-meta';

			// Base Price
			const basePriceVal = (summary.baseProduct && summary.baseProduct.price && typeof summary.baseProduct.price.unit_amount === 'number')
				? summary.baseProduct.price.unit_amount
				: (summary.baseGun.price && typeof summary.baseGun.price.unit_amount === 'number' ? summary.baseGun.price.unit_amount : null);

			if (typeof basePriceVal === 'number') {
				const priceSpan = document.createElement('span');
				priceSpan.className = 'tgb-build-item-price';
				priceSpan.textContent = this.formatPrice(basePriceVal);
				baseMeta.appendChild(priceSpan);
			}

			// Base Weight
			const baseGramsVal = (summary.baseProduct && summary.baseProduct.weight && typeof summary.baseProduct.weight.grams === 'number')
				? summary.baseProduct.weight.grams
				: (summary.baseGun.weight && typeof summary.baseGun.weight.grams === 'number' ? summary.baseGun.weight.grams : null);

			if (typeof baseGramsVal === 'number') {
				const weightSpan = document.createElement('span');
				weightSpan.className = 'tgb-build-item-weight';
				weightSpan.textContent = this.formatWeight(baseGramsVal);
				baseMeta.appendChild(weightSpan);
			}

			baseInfo.appendChild(baseMeta);
			baseRow.appendChild(baseInfo);
			baseSection.appendChild(baseRow);
			this.bodyEl.appendChild(baseSection);

			// 3.5. Rails Section (Part 3B)
			if (summary.railCount > 0) {
				const railSection = document.createElement('div');
				railSection.className = 'tgb-current-build-section tgb-current-build-section--rails';

				const railHeader = document.createElement('div');
				railHeader.className = 'tgb-current-build-section-header';
				const railTitle = document.createElement('h3');
				railTitle.className = 'tgb-current-build-section-title';
				railTitle.textContent = `Rails / Adapters (${summary.railCount})`;
				railHeader.appendChild(railTitle);
				railSection.appendChild(railHeader);

				const railList = document.createElement('div');
				railList.className = 'tgb-build-rails-list';

				summary.resolvedRails.forEach(item => {
					const isOutOfStock = Boolean(item.product && item.product.stock && item.product.stock.in_stock === false);

					const railRow = document.createElement('div');
					railRow.className = 'tgb-build-item-row' + (isOutOfStock ? ' is-unavailable' : '');
					railRow.setAttribute('data-instance-id', item.instance.instanceId);

					// Thumbnail
					const thumbWrap = document.createElement('div');
					thumbWrap.className = 'tgb-build-item-thumb-wrap';
					const thumb = document.createElement('img');
					thumb.className = 'tgb-build-item-thumb';
					const imgUrl = (item.instance.builder_image && item.instance.builder_image.url)
						? item.instance.builder_image.url
						: (item.product && item.product.builder_image ? item.product.builder_image.url : '');
					thumb.src = imgUrl;
					thumb.alt = item.instance.name || 'Rail / Adapter';
					thumb.loading = 'lazy';
					thumbWrap.appendChild(thumb);
					railRow.appendChild(thumbWrap);

					// Details
					const info = document.createElement('div');
					info.className = 'tgb-build-item-info';

					// Header row with Position badge, Stock status, and Remove button
					const headerRow = document.createElement('div');
					headerRow.className = 'tgb-build-item-header';

					const badgesWrap = document.createElement('div');
					badgesWrap.className = 'tgb-build-item-badges';

					const posBadge = document.createElement('span');
					posBadge.className = 'tgb-build-item-type tgb-build-item-role-tag--rail';
					const posText = item.instance.position ? (item.instance.position.charAt(0).toUpperCase() + item.instance.position.slice(1) + ' Rail') : 'Rail';
					posBadge.textContent = posText;
					badgesWrap.appendChild(posBadge);

					if (isOutOfStock) {
						const stockBadge = document.createElement('span');
						stockBadge.className = 'tgb-build-item-stock-badge tgb-build-item-stock-badge--unavailable';
						stockBadge.textContent = 'Unavailable';
						badgesWrap.appendChild(stockBadge);
					}

					headerRow.appendChild(badgesWrap);

					// Remove button
					const removeBtn = document.createElement('button');
					removeBtn.type = 'button';
					removeBtn.className = 'tgb-build-item-remove';
					removeBtn.setAttribute('data-instance-id', item.instance.instanceId);
					removeBtn.setAttribute('data-item-type', 'rail');
					removeBtn.setAttribute('aria-label', `Remove ${item.instance.name} from build`);
					removeBtn.title = 'Remove rail';
					removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
					headerRow.appendChild(removeBtn);

					info.appendChild(headerRow);

					// Rail Name
					const nameEl = document.createElement('h4');
					nameEl.className = 'tgb-build-item-name';
					nameEl.textContent = item.instance.name;
					info.appendChild(nameEl);

					// Price and Weight row
					const metaRow = document.createElement('div');
					metaRow.className = 'tgb-build-item-meta';

					if (item.hasPrice) {
						const priceSpan = document.createElement('span');
						priceSpan.className = 'tgb-build-item-price';
						priceSpan.textContent = this.formatPrice(item.unitPrice);
						metaRow.appendChild(priceSpan);
					} else {
						const priceSpan = document.createElement('span');
						priceSpan.className = 'tgb-build-item-price tgb-build-item-price--unavailable';
						priceSpan.textContent = 'Price unavailable';
						metaRow.appendChild(priceSpan);
					}

					if (item.hasWeight) {
						const weightSpan = document.createElement('span');
						weightSpan.className = 'tgb-build-item-weight';
						weightSpan.textContent = this.formatWeight(item.grams);
						metaRow.appendChild(weightSpan);
					} else {
						const weightSpan = document.createElement('span');
						weightSpan.className = 'tgb-build-item-weight tgb-build-item-weight--unavailable';
						weightSpan.textContent = 'Weight unavailable';
						metaRow.appendChild(weightSpan);
					}

					info.appendChild(metaRow);
					railRow.appendChild(info);
					railList.appendChild(railRow);
				});

				railSection.appendChild(railList);
				this.bodyEl.appendChild(railSection);
			}

			// 4. Components Section
			const compSection = document.createElement('div');
			compSection.className = 'tgb-current-build-section tgb-current-build-section--components';

			const compHeader = document.createElement('div');
			compHeader.className = 'tgb-current-build-section-header';
			const compTitle = document.createElement('h3');
			compTitle.className = 'tgb-current-build-section-title';
			compTitle.textContent = `Components (${summary.componentCount})`;
			compHeader.appendChild(compTitle);
			compSection.appendChild(compHeader);

			if (summary.componentCount === 0) {
				const emptyComp = document.createElement('div');
				emptyComp.className = 'tgb-build-empty-components';
				emptyComp.textContent = 'No components added yet. Choose parts from the catalog below.';
				compSection.appendChild(emptyComp);
			} else {
				const compList = document.createElement('div');
				compList.className = 'tgb-build-components-list';

				summary.resolvedParts.forEach(item => {
					const isOutOfStock = Boolean(item.product && item.product.stock && item.product.stock.in_stock === false);

					const partRow = document.createElement('div');
					partRow.className = 'tgb-build-item-row' + (isOutOfStock ? ' is-unavailable' : '');
					partRow.setAttribute('data-instance-id', item.instance.instanceId);

					// Thumbnail
					const thumbWrap = document.createElement('div');
					thumbWrap.className = 'tgb-build-item-thumb-wrap';
					const thumb = document.createElement('img');
					thumb.className = 'tgb-build-item-thumb';
					const imgUrl = (item.instance.builder_image && item.instance.builder_image.url)
						? item.instance.builder_image.url
						: (item.product && item.product.builder_image ? item.product.builder_image.url : '');
					thumb.src = imgUrl;
					thumb.alt = item.instance.name || 'Component';
					thumb.loading = 'lazy';
					thumbWrap.appendChild(thumb);
					partRow.appendChild(thumbWrap);

					// Details
					const info = document.createElement('div');
					info.className = 'tgb-build-item-info';

					// Header row with Type badge, Stock status, and Remove button
					const headerRow = document.createElement('div');
					headerRow.className = 'tgb-build-item-header';

					const badgesWrap = document.createElement('div');
					badgesWrap.className = 'tgb-build-item-badges';

					if (item.instance.partTypeName) {
						const typeBadge = document.createElement('span');
						typeBadge.className = 'tgb-build-item-type';
						typeBadge.textContent = item.instance.partTypeName;
						badgesWrap.appendChild(typeBadge);
					}

					if (isOutOfStock) {
						const stockBadge = document.createElement('span');
						stockBadge.className = 'tgb-build-item-stock-badge tgb-build-item-stock-badge--unavailable';
						stockBadge.textContent = 'Unavailable';
						badgesWrap.appendChild(stockBadge);
					}

					headerRow.appendChild(badgesWrap);

					// Remove button
					const removeBtn = document.createElement('button');
					removeBtn.type = 'button';
					removeBtn.className = 'tgb-build-item-remove';
					removeBtn.setAttribute('data-instance-id', item.instance.instanceId);
					removeBtn.setAttribute('data-item-type', 'part');
					removeBtn.setAttribute('aria-label', `Remove ${item.instance.name} from build`);
					removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
					headerRow.appendChild(removeBtn);

					info.appendChild(headerRow);

					// Part Name
					const nameEl = document.createElement('h4');
					nameEl.className = 'tgb-build-item-name';
					nameEl.textContent = item.instance.name;
					info.appendChild(nameEl);

					// Price and Weight row
					const metaRow = document.createElement('div');
					metaRow.className = 'tgb-build-item-meta';

					if (item.hasPrice) {
						const priceSpan = document.createElement('span');
						priceSpan.className = 'tgb-build-item-price';
						priceSpan.textContent = this.formatPrice(item.unitPrice);
						metaRow.appendChild(priceSpan);
					} else {
						const priceSpan = document.createElement('span');
						priceSpan.className = 'tgb-build-item-price tgb-build-item-price--unavailable';
						priceSpan.textContent = 'Price unavailable';
						metaRow.appendChild(priceSpan);
					}

					if (item.hasWeight) {
						const weightSpan = document.createElement('span');
						weightSpan.className = 'tgb-build-item-weight';
						weightSpan.textContent = this.formatWeight(item.grams);
						metaRow.appendChild(weightSpan);
					} else {
						const weightSpan = document.createElement('span');
						weightSpan.className = 'tgb-build-item-weight tgb-build-item-weight--unavailable';
						weightSpan.textContent = 'Weight unavailable';
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
			const summarySection = document.createElement('div');
			summarySection.className = 'tgb-build-summary';

			// Summary Header
			const sumHeader = document.createElement('div');
			sumHeader.className = 'tgb-build-summary-header';
			sumHeader.textContent = 'Build Summary';
			summarySection.appendChild(sumHeader);

			// Row: Total Weight
			const weightRow = document.createElement('div');
			weightRow.className = 'tgb-summary-row';

			const weightLabel = document.createElement('span');
			weightLabel.className = 'tgb-summary-label';
			weightLabel.textContent = 'Total Weight';
			weightRow.appendChild(weightLabel);

			const weightValWrap = document.createElement('div');
			weightValWrap.className = 'tgb-summary-val-wrap';

			const weightVal = document.createElement('span');
			weightVal.className = 'tgb-summary-value tgb-summary-value--weight';
			if (summary.weight.knownGrams > 0) {
				weightVal.textContent = this.formatWeight(summary.weight.knownGrams);
			} else if (summary.weight.complete) {
				weightVal.textContent = '0 g';
			} else {
				weightVal.textContent = 'Unavailable';
			}
			weightValWrap.appendChild(weightVal);

			if (!summary.weight.complete) {
				const weightNote = document.createElement('span');
				weightNote.className = 'tgb-summary-note';
				weightNote.textContent = `Weight unavailable for ${summary.weight.unknownCount} item${summary.weight.unknownCount > 1 ? 's' : ''}`;
				weightValWrap.appendChild(weightNote);
			}

			weightRow.appendChild(weightValWrap);
			summarySection.appendChild(weightRow);

			// Divider before subtotal
			const divider = document.createElement('hr');
			divider.className = 'tgb-summary-divider';
			summarySection.appendChild(divider);

			// Row: Product Subtotal
			const priceRow = document.createElement('div');
			priceRow.className = 'tgb-summary-row tgb-summary-row--total';

			const priceLabel = document.createElement('span');
			priceLabel.className = 'tgb-summary-label tgb-summary-label--total';
			priceLabel.textContent = 'Product Subtotal';
			priceRow.appendChild(priceLabel);

			const priceValWrap = document.createElement('div');
			priceValWrap.className = 'tgb-summary-val-wrap';

			const priceVal = document.createElement('span');
			priceVal.className = 'tgb-summary-value tgb-summary-value--price';
			priceVal.textContent = this.formatPrice(summary.price.knownSubtotal);
			priceValWrap.appendChild(priceVal);

			if (!summary.price.complete) {
				const priceNote = document.createElement('span');
				priceNote.className = 'tgb-summary-note';
				priceNote.textContent = `Price unavailable for ${summary.price.unknownCount} item${summary.price.unknownCount > 1 ? 's' : ''}`;
				priceValWrap.appendChild(priceNote);
			}

			priceRow.appendChild(priceValWrap);
			summarySection.appendChild(priceRow);

			// 6. Add Build to Cart Actions Container (Part 9, Requirements 29, 30, 32, 35)
			const actionsWrap = document.createElement('div');
			actionsWrap.className = 'tgb-current-build-actions';

			const addBtn = document.createElement('button');
			addBtn.type = 'button';
			addBtn.id = 'tgb-add-to-cart-btn';
			addBtn.className = 'tgb-btn tgb-btn--primary tgb-add-to-cart-btn';

			if (this.root && this.root.classList.contains('tgb-shared-preview-mode')) {
				addBtn.disabled = true;
				addBtn.classList.add('is-disabled');
				addBtn.textContent = 'Customize a Copy to Purchase';
				addBtn.title = 'Click Customize a Copy in the banner above before purchasing.';
			} else if (!summary.hasBase) {
				addBtn.disabled = true;
				addBtn.textContent = 'Choose a base platform to start your build';
				addBtn.classList.add('is-disabled');
			} else if (this.cartClient && this.cartClient.isSubmitting) {
				addBtn.disabled = true;
				addBtn.classList.add('is-loading');
				addBtn.textContent = 'Adding Build...';
			} else {
				addBtn.disabled = false;
				addBtn.textContent = 'Add Build to Cart';
			}
			actionsWrap.appendChild(addBtn);

			// Render feedback status (success or error)
			if (this.cartFeedback) {
				const fb = document.createElement('div');
				fb.className = `tgb-cart-feedback tgb-cart-feedback--${this.cartFeedback.type}`;
				fb.setAttribute('role', this.cartFeedback.type === 'error' ? 'alert' : 'status');

				const msgWrap = document.createElement('div');
				msgWrap.className = 'tgb-cart-feedback__message';

				if (this.cartFeedback.type === 'success') {
					msgWrap.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
				} else {
					msgWrap.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
				}

				const span = document.createElement('span');
				span.textContent = this.cartFeedback.message;
				msgWrap.appendChild(span);
				fb.appendChild(msgWrap);

				if (this.cartFeedback.type === 'success' && this.cartFeedback.url) {
					const viewCartLink = document.createElement('a');
					viewCartLink.href = this.cartFeedback.url;
					viewCartLink.className = 'tgb-btn tgb-btn--secondary tgb-btn--view-cart';
					viewCartLink.textContent = 'View Cart';
					fb.appendChild(viewCartLink);
				}

				actionsWrap.appendChild(fb);
			}

			summarySection.appendChild(actionsWrap);

			this.bodyEl.appendChild(summarySection);
		}
	}

	// =========================================================================
	// 7.5. LOCAL BROWSER BUILD PERSISTENCE (V1.1 Part 1)
	// =========================================================================

	/**
	 * Service managing local browser persistence of the current working build.
	 *
	 * Persists ONLY minimal client-side identity: version, timestamp, baseProductId,
	 * and parts [{ instanceId, productId, x, y, zIndex }].
	 * Authoritative business data (pricing, weights, stock status, mount data, image URLs)
	 * is NEVER stored and is re-resolved from the WooCommerce/catalog layer on restore.
	 */
	class TGB_Persistence {
		constructor(storageKey = 'tgb_current_build_state') {
			this.storageKey = storageKey;
			this.version = 1;
			this.saveDebounceTimer = null;
			this.isRestoring = false;
		}

		/**
		 * Checks if localStorage is available and writable.
		 * Safely handles SecurityError, QuotaExceededError, or blocked storage.
		 *
		 * @return {boolean}
		 */
		isAvailable() {
			try {
				if (typeof window === 'undefined' || !('localStorage' in window) || window.localStorage === null) {
					return false;
				}
				const testKey = '__tgb_test_storage__';
				window.localStorage.setItem(testKey, testKey);
				window.localStorage.getItem(testKey);
				window.localStorage.removeItem(testKey);
				return true;
			} catch (e) {
				return false;
			}
		}

		/**
		 * Loads and strictly validates persisted build state from localStorage.
		 * Returns null if missing, unparseable, version mismatch, or fundamentally malformed.
		 * Bounded to a maximum of 30 Part instances.
		 *
		 * @return {Object|null}
		 */
		load() {
			if (!this.isAvailable()) {
				return null;
			}
			try {
				const raw = window.localStorage.getItem(this.storageKey);
				if (!raw || typeof raw !== 'string') {
					return null;
				}
				const data = JSON.parse(raw);
				if (!data || typeof data !== 'object' || Array.isArray(data)) {
					this.clear();
					return null;
				}

				// Schema version: must be integer and exactly supported version
				if (!Number.isInteger(data.version) || data.version !== this.version) {
					this.clear();
					return null;
				}

				// Base Product ID: must be positive integer
				const baseProductId = Number(data.baseProductId);
				if (!Number.isInteger(baseProductId) || baseProductId <= 0) {
					this.clear();
					return null;
				}

				// Rails array: must be an array, maximum 10 entries (Section 6.2 & 12.2)
				const validatedRails = [];
				if (Array.isArray(data.rails)) {
					for (const r of data.rails.slice(0, 10)) {
						if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
						const productId = Number(r.productId);
						if (!Number.isInteger(productId) || productId <= 0) continue;
						if (typeof r.instanceId !== 'string') continue;
						const instanceId = r.instanceId.trim();
						if (instanceId.length === 0 || instanceId.length > 64) continue;
						if (r.position !== 'top' && r.position !== 'bottom') continue;
						const position = r.position;
						if (typeof r.x !== 'number' || !Number.isFinite(r.x)) continue;
						if (typeof r.y !== 'number' || !Number.isFinite(r.y)) continue;
						let zIndex = 15;
						if (typeof r.zIndex === 'number' && Number.isInteger(r.zIndex) && r.zIndex >= 1 && r.zIndex <= 1000) {
							zIndex = r.zIndex;
						}
						validatedRails.push({
							instanceId,
							productId,
							position,
							x: r.x,
							y: r.y,
							zIndex
						});
					}
				}

				// Parts array: must be an array, maximum 30 entries (Requirement 2 & 5-C)
				if (!Array.isArray(data.parts)) {
					this.clear();
					return null;
				}
				if (data.parts.length > 30) {
					console.warn('[TGB Persistence] Persisted parts exceed maximum limit (30); rejecting oversized payload.');
					this.clear();
					return null;
				}

				// Strictly validate each individual Part entry
				const validatedParts = [];
				for (const p of data.parts) {
					if (!p || typeof p !== 'object' || Array.isArray(p)) continue;

					// Product ID: positive integer
					const productId = Number(p.productId);
					if (!Number.isInteger(productId) || productId <= 0) continue;

					// Instance ID: string, bounded length (1 to 64 chars)
					if (typeof p.instanceId !== 'string') continue;
					const instanceId = p.instanceId.trim();
					if (instanceId.length === 0 || instanceId.length > 64) continue;

					// Coordinates: finite numbers (reject NaN, Infinity, strings, null)
					if (typeof p.x !== 'number' || !Number.isFinite(p.x)) continue;
					if (typeof p.y !== 'number' || !Number.isFinite(p.y)) continue;

					// zIndex: finite integer bounded between 1 and 1000
					let zIndex = 20;
					if (typeof p.zIndex === 'number' && Number.isInteger(p.zIndex) && p.zIndex >= 1 && p.zIndex <= 1000) {
						zIndex = p.zIndex;
					} else if (p.zIndex !== undefined && (typeof p.zIndex !== 'number' || !Number.isInteger(p.zIndex) || p.zIndex < 1 || p.zIndex > 1000)) {
						continue; // skip malformed/absurd zIndex entry
					}

					validatedParts.push({
						instanceId,
						productId,
						x: p.x,
						y: p.y,
						zIndex
					});
				}

				return {
					version: data.version,
					timestamp: typeof data.timestamp === 'number' && Number.isFinite(data.timestamp) ? data.timestamp : Date.now(),
					baseProductId,
					rails: validatedRails,
					parts: validatedParts
				};
			} catch (err) {
				try {
					this.clear();
				} catch (e) {}
				return null;
			}
		}

		/**
		 * Persists only the minimal data needed to reconstruct the build.
		 *
		 * Stores: version, timestamp, baseProductId, rails [{ instanceId, productId, position, x, y, zIndex }],
		 * parts [{ instanceId, productId, x, y, zIndex }]
		 * Does NOT store: prices, weights, stock, image URLs, mount interfaces, subtotal, total weight.
		 * Maximum 10 rails, 30 parts persisted.
		 *
		 * @param {TGB_BuildState} buildState
		 */
		/**
		 * Persists only the minimal data needed to reconstruct the build.
		 *
		 * Stores: version, timestamp, baseProductId, rails [{ instanceId, productId, position, x, y, zIndex }],
		 * parts [{ instanceId, productId, x, y, zIndex }]
		 * Does NOT store: prices, weights, stock, image URLs, mount interfaces, subtotal, total weight.
		 * Maximum 10 rails, 30 parts persisted.
		 *
		 * @param {TGB_BuildState} buildState
		 */
		save(buildState) {
			if (this.guestBuildManager) {
				this.guestBuildManager.updateActiveBuildFromState(buildState);
				return;
			}
			if (window.TGB && window.TGB.guestBuildManager) {
				window.TGB.guestBuildManager.updateActiveBuildFromState(buildState);
				return;
			}
			if (!this.isAvailable() || this.isRestoring) {
				return;
			}
			if (!buildState) {
				return;
			}

			const baseGun = buildState.getBaseGun();
			if (!baseGun || !baseGun.productId) {
				this.clear();
				return;
			}

			const state = buildState.getState();
			const payload = {
				version: this.version,
				timestamp: Date.now(),
				baseProductId: Number(baseGun.productId),
				rails: (state.rails || [])
					.filter(r => r && (r.position === 'top' || r.position === 'bottom'))
					.slice(0, 10).map(r => ({
					instanceId: typeof r.instanceId === 'string' ? r.instanceId.trim().slice(0, 64) : '',
					productId: Number(r.productId),
					position: r.position,
					x: typeof r.x === 'number' && Number.isFinite(r.x) ? r.x : 0,
					y: typeof r.y === 'number' && Number.isFinite(r.y) ? r.y : 0,
					zIndex: typeof r.zIndex === 'number' && Number.isInteger(r.zIndex) ? Math.min(1000, Math.max(1, r.zIndex)) : 15
				})),
				parts: (state.parts || []).slice(0, 30).map(p => ({
					instanceId: typeof p.instanceId === 'string' ? p.instanceId.trim().slice(0, 64) : '',
					productId: Number(p.productId),
					x: typeof p.x === 'number' && Number.isFinite(p.x) ? p.x : 0,
					y: typeof p.y === 'number' && Number.isFinite(p.y) ? p.y : 0,
					zIndex: typeof p.zIndex === 'number' && Number.isInteger(p.zIndex) ? Math.min(1000, Math.max(1, p.zIndex)) : 20
				}))
			};

			try {
				window.localStorage.setItem(this.storageKey, JSON.stringify(payload));
			} catch (err) {
				console.warn('[TGB Persistence] Storage write failed safely:', err);
			}
		}

		/**
		 * Debounces persistence write for high-frequency events (e.g. dragging).
		 *
		 * @param {TGB_BuildState} buildState
		 * @param {number} [delay=250]
		 */
		saveDebounced(buildState, delay = 250) {
			if (this.guestBuildManager) {
				this.guestBuildManager.updateActiveBuildFromStateDebounced(buildState, delay);
				return;
			}
			if (window.TGB && window.TGB.guestBuildManager) {
				window.TGB.guestBuildManager.updateActiveBuildFromStateDebounced(buildState, delay);
				return;
			}
			if (!this.isAvailable() || this.isRestoring) {
				return;
			}
			if (this.saveDebounceTimer) {
				clearTimeout(this.saveDebounceTimer);
			}
			this.saveDebounceTimer = setTimeout(() => {
				this.save(buildState);
				this.saveDebounceTimer = null;
			}, delay);
		}

		/**
		 * Explicitly stores a Base Gun with empty parts (e.g. for deep links).
		 *
		 * @param {number} baseProductId
		 */
		saveBaseOnly(baseProductId) {
			if (!this.isAvailable() || !baseProductId) return;
			const pId = Number(baseProductId);
			if (!Number.isInteger(pId) || pId <= 0) return;
			const payload = {
				version: this.version,
				timestamp: Date.now(),
				baseProductId: pId,
				rails: [],
				parts: []
			};
			try {
				window.localStorage.setItem(this.storageKey, JSON.stringify(payload));
			} catch (err) {}
		}

		/**
		 * Deletes the persisted build from localStorage safely.
		 */
		clear() {
			if (this.guestBuildManager) {
				this.guestBuildManager.resetActiveBuild();
				return;
			}
			if (window.TGB && window.TGB.guestBuildManager) {
				window.TGB.guestBuildManager.resetActiveBuild();
				return;
			}
			if (!this.isAvailable()) return;
			try {
				window.localStorage.removeItem(this.storageKey);
			} catch (err) {}
		}

		/**
		 * Restores the build using current authoritative runtime WooCommerce data.
		 *
		 * @param {TGB_CatalogClient} catalogClient
		 * @param {TGB_ProductSelection} productSelection
		 * @param {TGB_BuildState} buildState
		 * @param {TGB_Renderer} renderer
		 * @param {Map} productRegistry
		 * @param {Object} [explicitBuildData=null]
		 * @return {Promise<{restored: boolean, partial?: boolean, message?: string}>}
		 */
		async restoreBuild(catalogClient, productSelection, buildState, renderer, productRegistry, explicitBuildData = null) {
			const persisted = explicitBuildData || this.load();
			if (!persisted) {
				return { restored: false, reason: 'none' };
			}

			this.isRestoring = true;

			try {
				// 1. Resolve and validate Base Gun from authoritative catalog
				let baseProduct = productRegistry.get(persisted.baseProductId);
				if (!baseProduct || baseProduct.role !== 'base_gun' || !baseProduct.builder_image) {
					try {
						const baseGunsRes = await catalogClient.getBaseGuns(100);
						const found = (baseGunsRes.items || []).find(b => b.id === persisted.baseProductId);
						if (found && found.role === 'base_gun' && found.builder_image && found.builder_image.url) {
							baseProduct = found;
							productRegistry.set(baseProduct.id, baseProduct);
						}
					} catch (e) {
						baseProduct = null;
					}
				}

				if (!baseProduct || baseProduct.role !== 'base_gun' || !baseProduct.builder_image || !baseProduct.builder_image.url) {
					// Base Gun is invalid / no longer available: clear persistence and abort restore
					if (!explicitBuildData) {
						this.clear();
					}
					renderer.showEmptyState();
					return {
						restored: false,
						reason: 'base_unavailable',
						message: 'Your previous build could not be restored because the base platform is no longer available.'
					};
				}

				// Preload image and mount Base Gun
				await renderer.loadAndRenderBaseGun(baseProduct);

				// 2. Resolve and validate Rails and Parts
				const persistedRails = Array.isArray(persisted.rails) ? persisted.rails : [];
				const persistedParts = Array.isArray(persisted.parts) ? persisted.parts : [];

				if (persistedRails.length === 0 && persistedParts.length === 0) {
					if (productSelection) {
						if (typeof productSelection.syncAllCardButtons === 'function') productSelection.syncAllCardButtons();
						if (typeof productSelection.syncSidebar === 'function') productSelection.syncSidebar();
					}
					return { restored: true, partial: false, baseGun: baseProduct, restoredPartsCount: 0, removedPartsCount: 0 };
				}

				let restoredCount = 0;
				let removedCount = 0;

				// 2A. Restore Rails (Section 12.4 Step 2)
				if (persistedRails.length > 0) {
					const neededRailIds = [...new Set(persistedRails.map(r => r.productId))];
					const missingRailFromRegistry = neededRailIds.some(id => !productRegistry.has(id));
					if (missingRailFromRegistry) {
						try {
							const railsRes = await catalogClient.getRails(baseProduct.id, 100);
							if (railsRes && Array.isArray(railsRes.items)) {
								railsRes.items.forEach(item => {
									productRegistry.set(item.id, item);
								});
							}
						} catch (e) {}
					}

					for (const railEntry of persistedRails) {
						const railProduct = productRegistry.get(railEntry.productId);
						const validPositions = railProduct ? TGB_Mounting.getRailCompatiblePositions(baseProduct, railProduct) : [];
						const isValidRail = railProduct &&
							railProduct.role === 'rail' &&
							railProduct.builder_image &&
							railProduct.builder_image.url &&
							validPositions.includes(railEntry.position);

						if (isValidRail) {
							const railGeom = calculateProductGeometry(railProduct);
							const stageW = (renderer.currentStageGeometry && renderer.currentStageGeometry.stageWidth) || 1000;
							const stageH = (renderer.currentStageGeometry && renderer.currentStageGeometry.stageHeight) || 600;
							const maxX = Math.max(0, stageW - railGeom.logicalWidth);
							const maxY = Math.max(0, stageH - railGeom.logicalHeight);
							const clampedX = Math.max(0, Math.min(railEntry.x, maxX));
							const clampedY = Math.max(0, Math.min(railEntry.y, maxY));

							buildState.addRail(
								railProduct,
								railEntry.position,
								clampedX,
								clampedY,
								railEntry.zIndex,
								railEntry.instanceId
							);
							restoredCount++;
						} else {
							removedCount++;
						}
					}
				}

				// 2B. Build active capability pool from Base Gun + Restored Rails
				const activePool = TGB_Mounting.buildCapabilityPool(baseProduct, buildState.getRails());

				// 2C. Restore Parts (Section 12.4 Step 3 & 4)
				if (persistedParts.length > 0) {
					const neededProductIds = [...new Set(persistedParts.map(p => p.productId))];
					const missingFromRegistry = neededProductIds.some(id => !productRegistry.has(id));

					if (missingFromRegistry) {
						try {
							const categories = await catalogClient.getCategories(baseProduct.id, buildState.getRails());
							if (Array.isArray(categories)) {
								const fetchBranch = async (branch) => {
									for (const cat of branch) {
										try {
											const res = await catalogClient.getPartsByCategory(cat.id, baseProduct.id, 100, '', buildState.getRails());
											if (res && Array.isArray(res.items)) {
												res.items.forEach(item => {
													productRegistry.set(item.id, item);
												});
											}
											if (cat.children && cat.children.length > 0) {
												await fetchBranch(cat.children);
											}
										} catch (err) {}
									}
								};
								await fetchBranch(categories);
							}
						} catch (err) {}

						const stillMissing = neededProductIds.some(id => !productRegistry.has(id));
						if (stillMissing) {
							try {
								const partTypes = await catalogClient.getPartTypes();
								if (Array.isArray(partTypes)) {
									await Promise.all(
										partTypes.map(async (t) => {
											try {
												const res = await catalogClient.getPartsByType(t.id, 100);
												if (res && Array.isArray(res.items)) {
													res.items.forEach(item => {
														productRegistry.set(item.id, item);
													});
												}
											} catch (err) {}
										})
									);
								}
							} catch (err) {}
						}
					}

					// Collect permitted category IDs for Base Gun when policy is selected (Part 2 Feature A)
					let permittedCategoryIds = null;
					if (baseProduct.category_policy === 'selected') {
						permittedCategoryIds = new Set();
						try {
							const cats = await catalogClient.getCategories(baseProduct.id, buildState.getRails());
							const collectCatIds = (nodes) => {
								if (Array.isArray(nodes)) {
									nodes.forEach(n => {
										if (n && n.id) permittedCategoryIds.add(n.id);
										if (n && n.children) collectCatIds(n.children);
									});
								}
							};
							collectCatIds(cats);
						} catch (e) {}
					}

					for (const partEntry of persistedParts) {
						const product = productRegistry.get(partEntry.productId);

						// Check category policy permission
						let isCategoryAllowed = true;
						if (permittedCategoryIds !== null && product) {
							if (!product.categories || !Array.isArray(product.categories) || product.categories.length === 0) {
								isCategoryAllowed = false;
							} else {
								isCategoryAllowed = product.categories.some(c => permittedCategoryIds.has(c.id));
							}
						}

						// Validate Part existence, role, builder image, compatibility with active pool, and category policy
						const compatRes = product ? TGB_Mounting.checkPartCompatibilityWithPool(product, activePool) : { status: 'unconfigured' };
						const isValidPart = product &&
							product.role === 'part' &&
							product.builder_image &&
							product.builder_image.url &&
							isCategoryAllowed &&
							compatRes.status === 'compatible';

						if (isValidPart) {
							// Coordinate Clamping (Requirement 3):
							// Clamp coordinates to stage boundaries: 0 <= x <= stageWidth - partWidth, 0 <= y <= stageHeight - partHeight
							const partGeom = calculateProductGeometry(product);
							const partWidth = partGeom.logicalWidth;
							const partHeight = partGeom.logicalHeight;
							const stageW = (renderer.currentStageGeometry && renderer.currentStageGeometry.stageWidth) || 1000;
							const stageH = (renderer.currentStageGeometry && renderer.currentStageGeometry.stageHeight) || 600;

							const maxX = Math.max(0, stageW - partWidth);
							const maxY = Math.max(0, stageH - partHeight);

							const clampedX = Math.max(0, Math.min(partEntry.x, maxX));
							const clampedY = Math.max(0, Math.min(partEntry.y, maxY));

							buildState.addPart(
								product,
								clampedX,
								clampedY,
								partEntry.zIndex,
								partEntry.instanceId
							);
							restoredCount++;
						} else {
							removedCount++;
						}
					}
				}

				if (productSelection) {
					if (typeof productSelection.loadCategories === 'function') {
						await productSelection.loadCategories(baseProduct.id);
					}
					if (typeof productSelection.syncAllCardButtons === 'function') {
						productSelection.syncAllCardButtons();
					}
					if (typeof productSelection.syncSidebar === 'function') {
						productSelection.syncSidebar();
					}
				}

				// Save clean normalized final state at end of successful restore (Section 4)
				this.isRestoring = false;
				if (this.guestBuildManager) {
					this.guestBuildManager.updateActiveBuildFromState(buildState);
				} else if (window.TGB && window.TGB.guestBuildManager) {
					window.TGB.guestBuildManager.updateActiveBuildFromState(buildState);
				} else {
					this.save(buildState);
				}

				if (removedCount > 0) {
					return {
						restored: true,
						partial: true,
						baseGun: baseProduct,
						restoredPartsCount: restoredCount,
						removedPartsCount: removedCount,
						message: 'Some previously selected components are no longer available and were removed from your restored build.'
					};
				}

				return {
					restored: true,
					partial: false,
					baseGun: baseProduct,
					restoredPartsCount: restoredCount,
					removedPartsCount: 0
				};

			} finally {
				this.isRestoring = false;
			}
		}
	}

	// =========================================================================
	// 7.6. GUEST MULTI-BUILD SESSION MANAGER (Part 4)
	// =========================================================================

	/**
	 * Manages up to 10 independent guest builds in sessionStorage.
	 * Scoped strictly to the browser tab/session (tgb_guest_builds_v2).
	 * Handles one-time migration from localStorage (tgb_current_build_state),
	 * independent Base Gun, Rails, Parts, coordinates, z-indices, autosaving,
	 * build creation, switching, renaming, deleting, resetting, and Part 5 export.
	 */
	class TGB_GuestBuildManager {
		constructor(options = {}) {
			this.storageKey = options.storageKey || 'tgb_guest_builds_v2';
			this.legacyStorageKey = options.legacyStorageKey || 'tgb_current_build_state';
			this.maxBuilds = 10;
			this.schemaVersion = 2;
			this.workspace = null;
			this.activeBuildId = null;
			this.isSwitching = false;
			this.isRestoring = false;
			this.saveDebounceTimer = null;
			this.switchToken = 0;
			this.hasUnpersistedChanges = false;

			// Context references
			this.root = options.root || null;
			this.catalogClient = options.catalogClient || null;
			this.productSelection = options.productSelection || null;
			this.buildState = options.buildState || null;
			this.renderer = options.renderer || null;
			this.productRegistry = options.productRegistry || null;
			this.currentBuild = options.currentBuild || null;
			this.persistence = options.persistence || null;

			// UI Elements
			this.managerEl = null;
			this.selectEl = null;
			this.counterEl = null;
			this.newBtn = null;
			this.renameBtn = null;
			this.resetBtn = null;
			this.deleteBtn = null;
		}

		/**
		 * Checks if sessionStorage is available and writable.
		 *
		 * @return {boolean}
		 */
		isSessionAvailable() {
			try {
				if (typeof window === 'undefined' || !('sessionStorage' in window) || window.sessionStorage === null) {
					return false;
				}
				const testKey = '__tgb_test_session__';
				window.sessionStorage.setItem(testKey, '1');
				window.sessionStorage.removeItem(testKey);
				return true;
			} catch (e) {
				return false;
			}
		}

		/**
		 * Checks if localStorage is available.
		 *
		 * @return {boolean}
		 */
		isLocalAvailable() {
			try {
				if (typeof window === 'undefined' || !('localStorage' in window) || window.localStorage === null) {
					return false;
				}
				const testKey = '__tgb_test_local__';
				window.localStorage.setItem(testKey, '1');
				window.localStorage.removeItem(testKey);
				return true;
			} catch (e) {
				return false;
			}
		}

		/**
		 * Performs a one-time migration from legacy localStorage 'tgb_current_build_state'.
		 * Only runs if sessionStorage workspace is absent and valid legacy build exists.
		 * Removes the legacy key ONLY after successful write to sessionStorage.
		 *
		 * @return {Object|null}
		 */
		migrateLegacyBuild() {
			if (!this.isSessionAvailable() || !this.isLocalAvailable()) {
				return null;
			}
			if (window.sessionStorage.getItem(this.storageKey)) {
				return null;
			}

			try {
				const raw = window.localStorage.getItem(this.legacyStorageKey);
				if (!raw || typeof raw !== 'string') {
					return null;
				}

				const legacy = JSON.parse(raw);
				if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) {
					return null;
				}

				const baseProductId = Number(legacy.baseProductId);
				if (!Number.isInteger(baseProductId) || baseProductId <= 0) {
					return null;
				}

				const rails = [];
				if (Array.isArray(legacy.rails)) {
					for (const r of legacy.rails.slice(0, 10)) {
						if (!r || typeof r !== 'object') continue;
						const pid = Number(r.productId);
						if (!Number.isInteger(pid) || pid <= 0) continue;
						if (r.position !== 'top' && r.position !== 'bottom') continue;
						rails.push({
							instanceId: typeof r.instanceId === 'string' ? r.instanceId.trim().slice(0, 64) : 'rail-' + Date.now(),
							productId: pid,
							position: r.position,
							x: typeof r.x === 'number' && Number.isFinite(r.x) ? r.x : 0,
							y: typeof r.y === 'number' && Number.isFinite(r.y) ? r.y : 0,
							zIndex: typeof r.zIndex === 'number' && Number.isInteger(r.zIndex) ? r.zIndex : 15
						});
					}
				}

				const parts = [];
				if (Array.isArray(legacy.parts)) {
					for (const p of legacy.parts.slice(0, 30)) {
						if (!p || typeof p !== 'object') continue;
						const pid = Number(p.productId);
						if (!Number.isInteger(pid) || pid <= 0) continue;
						parts.push({
							instanceId: typeof p.instanceId === 'string' ? p.instanceId.trim().slice(0, 64) : 'part-' + Date.now(),
							productId: pid,
							x: typeof p.x === 'number' && Number.isFinite(p.x) ? p.x : 0,
							y: typeof p.y === 'number' && Number.isFinite(p.y) ? p.y : 0,
							zIndex: typeof p.zIndex === 'number' && Number.isInteger(p.zIndex) ? p.zIndex : 20
						});
					}
				}

				const buildId = 'build-1';
				const timestamp = typeof legacy.timestamp === 'number' && Number.isFinite(legacy.timestamp) ? legacy.timestamp : Date.now();
				const migratedWorkspace = {
					schemaVersion: this.schemaVersion,
					activeBuildId: buildId,
					builds: [
						{
							id: buildId,
							name: 'Build 1',
							createdAt: timestamp,
							updatedAt: Date.now(),
							baseProductId: baseProductId,
							rails: rails,
							parts: parts
						}
					]
				};

				// Persist to sessionStorage FIRST
				window.sessionStorage.setItem(this.storageKey, JSON.stringify(migratedWorkspace));

				// ONLY remove legacy record from localStorage after verified successful write to sessionStorage!
				window.localStorage.removeItem(this.legacyStorageKey);
				console.log('[TGB GuestBuildManager] Successfully migrated legacy single build to sessionStorage.');

				return migratedWorkspace;
			} catch (e) {
				console.warn('[TGB GuestBuildManager] Migration failed safely without destroying legacy data:', e);
				return null;
			}
		}

		/**
		 * Initializes guest workspace.
		 *
		 * @param {Object} [context={}]
		 * @return {Object}
		 */
		init(context = {}) {
			if (context.root) this.root = context.root;
			if (context.catalogClient) this.catalogClient = context.catalogClient;
			if (context.productSelection) this.productSelection = context.productSelection;
			if (context.buildState) this.buildState = context.buildState;
			if (context.renderer) this.renderer = context.renderer;
			if (context.productRegistry) this.productRegistry = context.productRegistry;
			if (context.currentBuild) this.currentBuild = context.currentBuild;
			if (context.persistence) this.persistence = context.persistence;

			let ws = this.migrateLegacyBuild();
			if (!ws) {
				ws = this.loadWorkspace();
			}

			if (!ws) {
				ws = {
					schemaVersion: this.schemaVersion,
					activeBuildId: 'build-1',
					builds: [
						{
							id: 'build-1',
							name: 'Build 1',
							createdAt: Date.now(),
							updatedAt: Date.now(),
							baseProductId: null,
							rails: [],
							parts: []
						}
					]
				};
				this.workspace = ws;
				this.activeBuildId = 'build-1';
				this.saveWorkspace();
			} else {
				this.workspace = ws;
				this.activeBuildId = ws.activeBuildId;
			}

			this.initUI();
			this.setupBeforeUnload();
			return this.workspace;
		}

		/**
		 * Loads workspace from sessionStorage.
		 *
		 * @return {Object|null}
		 */
		loadWorkspace() {
			if (!this.isSessionAvailable()) {
				return null;
			}
			try {
				const raw = window.sessionStorage.getItem(this.storageKey);
				if (!raw || typeof raw !== 'string') {
					return null;
				}
				const data = JSON.parse(raw);
				return this.validateWorkspace(data);
			} catch (e) {
				console.warn('[TGB GuestBuildManager] Corrupted workspace JSON, safely fallback:', e);
				return null;
			}
		}

		/**
		 * Validates and normalizes workspace data. Enforces max 10 builds limit.
		 *
		 * @param {Object} data
		 * @return {Object|null}
		 */
		validateWorkspace(data) {
			if (!data || typeof data !== 'object' || Array.isArray(data)) {
				return null;
			}
			if (data.schemaVersion !== this.schemaVersion) {
				return null;
			}
			if (!Array.isArray(data.builds) || data.builds.length === 0) {
				return null;
			}

			const validBuilds = [];
			const seenIds = new Set();

			for (let i = 0; i < Math.min(data.builds.length, this.maxBuilds); i++) {
				const b = data.builds[i];
				if (!b || typeof b !== 'object' || Array.isArray(b)) continue;

				let id = typeof b.id === 'string' && b.id.trim() ? b.id.trim().slice(0, 64) : '';
				if (!id || seenIds.has(id)) {
					id = 'bld-' + (i + 1) + '-' + Math.random().toString(36).substring(2, 7);
				}
				seenIds.add(id);

				let name = typeof b.name === 'string' ? this.sanitizeName(b.name) : '';
				if (!name) {
					name = 'Build ' + (i + 1);
				}

				const createdAt = typeof b.createdAt === 'number' && Number.isFinite(b.createdAt) ? b.createdAt : Date.now();
				const updatedAt = typeof b.updatedAt === 'number' && Number.isFinite(b.updatedAt) ? b.updatedAt : Date.now();

				const baseProductId = (b.baseProductId && Number.isInteger(Number(b.baseProductId)) && Number(b.baseProductId) > 0)
					? Number(b.baseProductId)
					: null;

				const rails = [];
				if (Array.isArray(b.rails)) {
					for (const r of b.rails.slice(0, 10)) {
						if (!r || typeof r !== 'object') continue;
						const pid = Number(r.productId);
						if (!Number.isInteger(pid) || pid <= 0) continue;
						if (r.position !== 'top' && r.position !== 'bottom') continue;
						rails.push({
							instanceId: typeof r.instanceId === 'string' ? r.instanceId.trim().slice(0, 64) : 'rail-' + Date.now(),
							productId: pid,
							position: r.position,
							x: typeof r.x === 'number' && Number.isFinite(r.x) ? r.x : 0,
							y: typeof r.y === 'number' && Number.isFinite(r.y) ? r.y : 0,
							zIndex: typeof r.zIndex === 'number' && Number.isInteger(r.zIndex) ? r.zIndex : 15
						});
					}
				}

				const parts = [];
				if (Array.isArray(b.parts)) {
					for (const p of b.parts.slice(0, 30)) {
						if (!p || typeof p !== 'object') continue;
						const pid = Number(p.productId);
						if (!Number.isInteger(pid) || pid <= 0) continue;
						parts.push({
							instanceId: typeof p.instanceId === 'string' ? p.instanceId.trim().slice(0, 64) : 'part-' + Date.now(),
							productId: pid,
							x: typeof p.x === 'number' && Number.isFinite(p.x) ? p.x : 0,
							y: typeof p.y === 'number' && Number.isFinite(p.y) ? p.y : 0,
							zIndex: typeof p.zIndex === 'number' && Number.isInteger(p.zIndex) ? p.zIndex : 20
						});
					}
				}

				validBuilds.push({
					id,
					name,
					createdAt,
					updatedAt,
					baseProductId,
					rails,
					parts
				});
			}

			if (validBuilds.length === 0) {
				return null;
			}

			let activeId = typeof data.activeBuildId === 'string' ? data.activeBuildId : '';
			if (!validBuilds.some(b => b.id === activeId)) {
				activeId = validBuilds[0].id;
			}

			return {
				schemaVersion: this.schemaVersion,
				activeBuildId: activeId,
				builds: validBuilds
			};
		}

		/**
		 * Persists workspace to sessionStorage.
		 *
		 * @return {boolean}
		 */
		saveWorkspace() {
			if (!this.workspace) return false;
			if (!this.isSessionAvailable()) {
				this.notifyStorageFailure('session_disabled');
				return false;
			}

			try {
				if (this.workspace.builds.length > this.maxBuilds) {
					this.workspace.builds = this.workspace.builds.slice(0, this.maxBuilds);
				}
				const serialized = JSON.stringify(this.workspace);
				window.sessionStorage.setItem(this.storageKey, serialized);
				this.hasUnpersistedChanges = false;
				return true;
			} catch (e) {
				console.warn('[TGB GuestBuildManager] Write to sessionStorage failed:', e);
				this.hasUnpersistedChanges = true;
				this.notifyStorageFailure(e.name === 'QuotaExceededError' ? 'quota_exceeded' : 'write_error');
				return false;
			}
		}

		/**
		 * Displays storage notices to user.
		 *
		 * @param {string} reason
		 */
		notifyStorageFailure(reason) {
			let msg = 'Notice: Browser session storage is unavailable. Your builds may not be saved across refreshes.';
			if (reason === 'quota_exceeded') {
				msg = 'Warning: Browser storage quota exceeded. Your latest build changes could not be saved.';
			}
			if (this.productSelection && typeof this.productSelection.showNotice === 'function') {
				this.productSelection.showNotice(msg, 'warning');
			}
		}

		/**
		 * Sanitizes build name for secure display and storage.
		 *
		 * @param {string} raw
		 * @return {string}
		 */
		sanitizeName(raw) {
			if (typeof raw !== 'string') return '';
			let clean = raw.trim().replace(/<[^>]*>/g, '');
			clean = clean.replace(/&/g, '&amp;')
						 .replace(/</g, '&lt;')
						 .replace(/>/g, '&gt;')
						 .replace(/"/g, '&quot;')
						 .replace(/'/g, '&#039;');
			return clean.slice(0, 40).trim();
		}

		/**
		 * Unescapes HTML entities for prompt input dialogs.
		 *
		 * @param {string} str
		 * @return {string}
		 */
		unescapeName(str) {
			if (typeof str !== 'string') return '';
			return str.replace(/&amp;/g, '&')
					  .replace(/&lt;/g, '<')
					  .replace(/&gt;/g, '>')
					  .replace(/&quot;/g, '"')
					  .replace(/&#039;/g, "'");
		}

		/**
		 * Retrieves active build object.
		 *
		 * @return {Object|null}
		 */
		getActiveBuild() {
			if (!this.workspace || !Array.isArray(this.workspace.builds)) return null;
			return this.workspace.builds.find(b => b.id === this.activeBuildId) || this.workspace.builds[0] || null;
		}

		/**
		 * Updates active build from current buildState.
		 *
		 * @param {TGB_BuildState} buildState
		 */
		updateActiveBuildFromState(buildState) {
			if (!buildState || this.isSwitching || this.isRestoring) return;
			const active = this.getActiveBuild();
			if (!active) return;

			const baseGun = buildState.getBaseGun();
			active.baseProductId = (baseGun && baseGun.productId) ? Number(baseGun.productId) : null;

			const state = buildState.getState();
			active.rails = (state.rails || [])
				.filter(r => r && (r.position === 'top' || r.position === 'bottom'))
				.slice(0, 10).map(r => ({
					instanceId: typeof r.instanceId === 'string' ? r.instanceId.trim().slice(0, 64) : '',
					productId: Number(r.productId),
					position: r.position,
					x: typeof r.x === 'number' && Number.isFinite(r.x) ? r.x : 0,
					y: typeof r.y === 'number' && Number.isFinite(r.y) ? r.y : 0,
					zIndex: typeof r.zIndex === 'number' && Number.isInteger(r.zIndex) ? Math.min(1000, Math.max(1, r.zIndex)) : 15
				}));

			active.parts = (state.parts || []).slice(0, 30).map(p => ({
				instanceId: typeof p.instanceId === 'string' ? p.instanceId.trim().slice(0, 64) : '',
				productId: Number(p.productId),
				x: typeof p.x === 'number' && Number.isFinite(p.x) ? p.x : 0,
				y: typeof p.y === 'number' && Number.isFinite(p.y) ? p.y : 0,
				zIndex: typeof p.zIndex === 'number' && Number.isInteger(p.zIndex) ? Math.min(1000, Math.max(1, p.zIndex)) : 20
			}));

			active.updatedAt = Date.now();
			this.saveWorkspace();
		}

		/**
		 * Debounced save for rapid drag events.
		 *
		 * @param {TGB_BuildState} buildState
		 * @param {number} [delay=250]
		 */
		updateActiveBuildFromStateDebounced(buildState, delay = 250) {
			if (!buildState || this.isSwitching || this.isRestoring) return;
			this.hasUnpersistedChanges = true;
			if (this.saveDebounceTimer) {
				clearTimeout(this.saveDebounceTimer);
			}
			this.saveDebounceTimer = setTimeout(() => {
				this.updateActiveBuildFromState(buildState);
				this.saveDebounceTimer = null;
			}, delay);
		}

		/**
		 * Creates a new empty build (up to 10 max).
		 *
		 * @param {string} [name=null]
		 * @return {Promise<{success: boolean, build?: Object, reason?: string}>}
		 */
		async createBuild(name = null) {
			if (!this.workspace || !Array.isArray(this.workspace.builds)) return { success: false };
			if (this.workspace.builds.length >= this.maxBuilds) {
				if (this.productSelection && typeof this.productSelection.showNotice === 'function') {
					this.productSelection.showNotice('You have reached the maximum of 10 builds for this session. Delete or reset a build to create a new one.', 'warning');
				}
				if (this.currentBuild && typeof this.currentBuild.announce === 'function') {
					this.currentBuild.announce('Maximum of 10 builds reached.');
				}
				return { success: false, reason: 'limit_reached' };
			}

			// Ensure current active build is saved before creating new build
			if (this.buildState) {
				this.updateActiveBuildFromState(this.buildState);
			}

			const buildId = 'bld-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
			let buildName = name ? this.sanitizeName(name) : '';
			if (!buildName) {
				let num = 1;
				while (this.workspace.builds.some(b => b.name === `Build ${num}`)) {
					num++;
				}
				buildName = `Build ${num}`;
			}

			const newBuild = {
				id: buildId,
				name: buildName,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				baseProductId: null,
				rails: [],
				parts: []
			};

			this.workspace.builds.push(newBuild);
			this.activeBuildId = buildId;
			this.workspace.activeBuildId = buildId;
			this.saveWorkspace();

			await this.switchBuild(buildId);
			this.syncUI();

			if (this.currentBuild && typeof this.currentBuild.announce === 'function') {
				this.currentBuild.announce(`Created and switched to ${this.unescapeName(buildName)}.`);
			}
			return { success: true, build: newBuild };
		}

		/**
		 * Switches to target build. Preserves current draft, cancels in-flight requests,
		 * restores target configuration in order: Base Gun -> Rails -> Active Pool -> Parts -> Coordinates.
		 *
		 * @param {string} targetBuildId
		 * @return {Promise<boolean>}
		 */
		async switchBuild(targetBuildId) {
			if (!targetBuildId || this.isSwitching) return false;
			if (!this.workspace || !Array.isArray(this.workspace.builds)) return false;
			const target = this.workspace.builds.find(b => b.id === targetBuildId);
			if (!target) return false;

			// 1. Ensure current active build changes are saved first
			if (this.buildState && this.activeBuildId !== targetBuildId) {
				this.updateActiveBuildFromState(this.buildState);
			}

			// 2. Increment switch token to invalidate in-flight async requests
			this.switchToken++;
			const currentToken = this.switchToken;
			this.isSwitching = true;

			try {
				// 3. Update active build ID
				this.activeBuildId = targetBuildId;
				this.workspace.activeBuildId = targetBuildId;
				this.saveWorkspace();

				// 4. Clear current canvas and buildState completely
				if (this.buildState) {
					if (typeof this.buildState.reset === 'function') {
						this.buildState.reset();
					}
					if (typeof this.buildState.setBaseGun === 'function') {
						this.buildState.setBaseGun(null);
					}
				}
				if (this.renderer) {
					if (typeof this.renderer.clearStage === 'function') {
						this.renderer.clearStage();
					} else if (typeof this.renderer.showEmptyState === 'function') {
						this.renderer.showEmptyState();
					}
				}

				// 5. Restore target build if baseProductId is present
				if (target.baseProductId && this.persistence) {
					const res = await this.persistence.restoreBuild(
						this.catalogClient,
						this.productSelection,
						this.buildState,
						this.renderer,
						this.productRegistry,
						target
					);

					if (this.switchToken !== currentToken) {
						return false;
					}

					if (res && res.restored) {
						if (res.partial && res.message && this.productSelection && typeof this.productSelection.showNotice === 'function') {
							this.productSelection.showNotice(res.message, 'warning');
						}
					} else if (res && res.message && this.productSelection && typeof this.productSelection.showNotice === 'function') {
						this.productSelection.showNotice(res.message, 'error');
					}
				} else {
					// Empty build: setBaseGun(null) and showEmptyState
					if (this.buildState && typeof this.buildState.setBaseGun === 'function') {
						this.buildState.setBaseGun(null);
					}
					if (this.renderer && typeof this.renderer.showEmptyState === 'function') {
						this.renderer.showEmptyState();
					}
					if (this.productSelection) {
						if (typeof this.productSelection.loadCategories === 'function') {
							await this.productSelection.loadCategories(null);
						}
						if (typeof this.productSelection.syncAllCardButtons === 'function') {
							this.productSelection.syncAllCardButtons();
						}
						if (typeof this.productSelection.syncSidebar === 'function') {
							this.productSelection.syncSidebar();
						}
					}
				}

				if (this.switchToken !== currentToken) {
					return false;
				}

				this.syncUI();
				if (this.currentBuild && typeof this.currentBuild.announce === 'function') {
					this.currentBuild.announce(`Switched to ${this.unescapeName(target.name)}.`);
				}
				return true;
			} finally {
				if (this.switchToken === currentToken) {
					this.isSwitching = false;
				}
			}
		}

		/**
		 * Renames a build draft.
		 *
		 * @param {string} buildId
		 * @param {string} newName
		 * @return {boolean}
		 */
		renameBuild(buildId, newName) {
			if (!this.workspace || !Array.isArray(this.workspace.builds)) return false;
			const b = this.workspace.builds.find(item => item.id === buildId);
			if (!b) return false;

			const clean = this.sanitizeName(newName);
			if (!clean) {
				if (this.productSelection && typeof this.productSelection.showNotice === 'function') {
					this.productSelection.showNotice('Build name cannot be empty.', 'warning');
				}
				return false;
			}

			b.name = clean;
			b.updatedAt = Date.now();
			this.saveWorkspace();
			this.syncUI();

			if (this.currentBuild && typeof this.currentBuild.announce === 'function') {
				this.currentBuild.announce(`Build renamed to ${this.unescapeName(clean)}.`);
			}
			return true;
		}

		/**
		 * Deletes a build draft.
		 *
		 * @param {string} buildId
		 * @return {Promise<boolean>}
		 */
		async deleteBuild(buildId) {
			if (!this.workspace || !Array.isArray(this.workspace.builds)) return false;
			const idx = this.workspace.builds.findIndex(b => b.id === buildId);
			if (idx === -1) return false;

			const deleted = this.workspace.builds[idx];
			this.workspace.builds.splice(idx, 1);
			this.saveWorkspace();
			this.syncUI();

			if (this.workspace.builds.length === 0) {
				const fresh = {
					id: 'build-1',
					name: 'Build 1',
					createdAt: Date.now(),
					updatedAt: Date.now(),
					baseProductId: null,
					rails: [],
					parts: []
				};
				this.workspace.builds.push(fresh);
				this.activeBuildId = 'build-1';
				this.workspace.activeBuildId = 'build-1';
				this.saveWorkspace();
				await this.switchBuild('build-1');
			} else if (this.activeBuildId === buildId) {
				const nextIndex = Math.min(idx, this.workspace.builds.length - 1);
				const nextBuild = this.workspace.builds[nextIndex];
				this.activeBuildId = nextBuild.id;
				this.workspace.activeBuildId = nextBuild.id;
				this.saveWorkspace();
				await this.switchBuild(nextBuild.id);
			}

			if (this.currentBuild && typeof this.currentBuild.announce === 'function') {
				this.currentBuild.announce(`Deleted ${this.unescapeName(deleted.name)}.`);
			}
			return true;
		}

		/**
		 * Resets active build only. Other drafts survive intact.
		 */
		async resetActiveBuild() {
			const active = this.getActiveBuild();
			if (!active) return;

			active.baseProductId = null;
			active.rails = [];
			active.parts = [];
			active.updatedAt = Date.now();
			this.saveWorkspace();

			if (this.buildState) {
				if (typeof this.buildState.reset === 'function') {
					this.buildState.reset();
				}
				if (typeof this.buildState.setBaseGun === 'function') {
					this.buildState.setBaseGun(null);
				}
			}
			if (this.renderer && typeof this.renderer.showEmptyState === 'function') {
				this.renderer.showEmptyState();
			}
			if (this.productSelection) {
				if (typeof this.productSelection.loadCategories === 'function') {
					await this.productSelection.loadCategories(null);
				}
				if (typeof this.productSelection.syncAllCardButtons === 'function') {
					this.productSelection.syncAllCardButtons();
				}
				if (typeof this.productSelection.syncSidebar === 'function') {
					this.productSelection.syncSidebar();
				}
			}

			this.syncUI();
			if (this.currentBuild && typeof this.currentBuild.announce === 'function') {
				this.currentBuild.announce(`Build ${this.unescapeName(active.name)} reset. All components cleared.`);
			}
		}

		/**
		 * Prompts user to rename active build.
		 */
		promptRename() {
			const active = this.getActiveBuild();
			if (!active) return;
			const currentName = this.unescapeName(active.name);
			const input = window.prompt('Enter new name for this build (max 40 characters):', currentName);
			if (input === null) return;
			const trimmed = input.trim();
			if (trimmed.length === 0) {
				if (this.productSelection && typeof this.productSelection.showNotice === 'function') {
					this.productSelection.showNotice('Build name cannot be empty.', 'warning');
				}
				return;
			}
			this.renameBuild(active.id, trimmed);
		}

		/**
		 * Prompts user confirmation before deleting active build.
		 */
		async promptDelete() {
			if (!this.workspace || !Array.isArray(this.workspace.builds) || this.workspace.builds.length <= 1) return;
			const active = this.getActiveBuild();
			if (!active) return;
			const name = this.unescapeName(active.name);
			const ok = window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`);
			if (!ok) return;
			await this.deleteBuild(active.id);
		}

		/**
		 * Prompts user confirmation before resetting active build.
		 */
		async promptReset() {
			const active = this.getActiveBuild();
			if (!active) return;
			const name = this.unescapeName(active.name);
			const ok = window.confirm(`Are you sure you want to reset "${name}"? All installed components and the base gun will be cleared.`);
			if (!ok) return;
			await this.resetActiveBuild();
		}

		/**
		 * Binds UI elements and event listeners for the Session Builds Manager toolbar.
		 */
		initUI() {
			if (!this.root) return;
			if (this._uiInitialized) {
				this.syncUI();
				return;
			}
			this._uiInitialized = true;

			this.managerEl = this.root.querySelector('#tgb-build-manager');
			this.selectEl = this.root.querySelector('#tgb-build-select');
			this.counterEl = this.root.querySelector('#tgb-build-counter');
			this.newBtn = this.root.querySelector('#tgb-btn-new-build');
			this.renameBtn = this.root.querySelector('#tgb-btn-rename-build');
			this.resetBtn = this.root.querySelector('#tgb-btn-reset-build');
			this.deleteBtn = this.root.querySelector('#tgb-btn-delete-build');

			if (this.selectEl) {
				this.selectEl.addEventListener('change', (e) => {
					this.switchBuild(e.target.value);
				});
			}

			if (this.newBtn) {
				this.newBtn.addEventListener('click', () => {
					this.createBuild();
				});
			}

			if (this.renameBtn) {
				this.renameBtn.addEventListener('click', () => {
					this.promptRename();
				});
			}

			if (this.resetBtn) {
				this.resetBtn.addEventListener('click', async () => {
					await this.promptReset();
				});
			}

			if (this.deleteBtn) {
				this.deleteBtn.addEventListener('click', async () => {
					await this.promptDelete();
				});
			}

			this.syncUI();
		}

		/**
		 * Synchronizes dropdown options, active build selection, and counter badge.
		 */
		syncUI() {
			if (!this.selectEl || !this.workspace || !Array.isArray(this.workspace.builds)) return;
			const currentActive = this.activeBuildId;
			this.selectEl.innerHTML = '';
			for (const b of this.workspace.builds) {
				const opt = document.createElement('option');
				opt.value = b.id;
				opt.textContent = this.unescapeName(b.name);
				if (b.id === currentActive) {
					opt.selected = true;
				}
				this.selectEl.appendChild(opt);
			}

			if (this.counterEl) {
				this.counterEl.textContent = `${this.workspace.builds.length} / ${this.maxBuilds}`;
			}

			if (this.newBtn) {
				if (this.workspace.builds.length >= this.maxBuilds) {
					this.newBtn.disabled = true;
					this.newBtn.setAttribute('aria-disabled', 'true');
					this.newBtn.title = 'Maximum 10 builds reached for this session.';
				} else {
					this.newBtn.disabled = false;
					this.newBtn.removeAttribute('aria-disabled');
					this.newBtn.title = 'Create a new build (up to 10)';
				}
			}

			if (this.deleteBtn) {
				if (this.workspace.builds.length <= 1) {
					this.deleteBtn.disabled = true;
					this.deleteBtn.setAttribute('aria-disabled', 'true');
					this.deleteBtn.title = 'Cannot delete the only build.';
				} else {
					this.deleteBtn.disabled = false;
					this.deleteBtn.removeAttribute('aria-disabled');
					this.deleteBtn.title = 'Delete this build';
				}
			}
		}

		/**
		 * Sets up beforeunload warning when unpersisted changes exist.
		 */
		setupBeforeUnload() {
			if (typeof window === 'undefined') return;
			window.addEventListener('beforeunload', (e) => {
				if (this.hasUnpersistedChanges || this.saveDebounceTimer !== null) {
					e.preventDefault();
					e.returnValue = 'You have unsaved changes in your build session.';
					return e.returnValue;
				}
			});
		}

		/**
		 * Clean data-export handoff contract for Part 5 registered customer account migration.
		 * Returns sanitized deep clone of up to 10 builds.
		 *
		 * @return {Array<Object>}
		 */
		exportForAccountSync() {
			if (!this.workspace || !Array.isArray(this.workspace.builds)) return [];
			return this.workspace.builds.slice(0, this.maxBuilds).map(b => ({
				id: b.id,
				name: this.unescapeName(b.name),
				createdAt: b.createdAt,
				updatedAt: b.updatedAt,
				baseProductId: b.baseProductId,
				rails: (b.rails || []).map(r => ({
					instanceId: r.instanceId,
					productId: r.productId,
					position: r.position,
					x: r.x,
					y: r.y,
					zIndex: r.zIndex
				})),
				parts: (b.parts || []).map(p => ({
					instanceId: p.instanceId,
					productId: p.productId,
					x: p.x,
					y: p.y,
					zIndex: p.zIndex
				}))
			}));
		}
	}

	/**
	 * TGB_AccountBuildManager (Part 5)
	 *
	 * Manages permanent customer-saved gun builds (up to 10), manual saving,
	 * Save As New, dirty-state tracking, WooCommerce My Account integration,
	 * in-builder saved builds modal, and automatic guest-to-account transfer.
	 */
	class TGB_AccountBuildManager {
		constructor(options = {}) {
			this.root = options.root || null;
			this.buildState = options.buildState || null;
			this.renderer = options.renderer || null;
			this.catalogClient = options.catalogClient || null;
			this.productSelection = options.productSelection || null;
			this.productRegistry = options.productRegistry || null;
			this.currentBuild = options.currentBuild || null;
			this.persistence = options.persistence || null;
			this.guestBuildManager = options.guestBuildManager || null;

			const config = (typeof window !== 'undefined' && window.taktikGunBuilder) ? window.taktikGunBuilder : {};
			this.isLoggedIn = Boolean(config.isLoggedIn);
			this.currentUserId = config.currentUserId ? parseInt(config.currentUserId, 10) : 0;
			this.restNonce = config.restNonce || '';
			this.apiBase = config.savedBuildsRestUrl || (config.savedBuildsUrl && config.savedBuildsUrl.includes('/wp-json/') ? config.savedBuildsUrl : '') || (config.restUrl ? config.restUrl.replace(/\/+$/, '') + '/saved-builds' : '/wp-json/tgb/v1/saved-builds');
			this.myAccountUrl = config.myAccountSavedBuildsUrl || config.myAccountUrl || '/my-account/gun-builder-builds/';

			this.maxBuilds = 10;
			this.activeSavedBuildId = null;
			this.activeSavedBuildName = '';
			this.activeSavedBuildUpdatedAt = null;
			this.isDirty = false;
			this.isSaving = false;
			this.hasTransferredGuest = false;

			// DOM elements
			this.saveBtn = null;
			this.saveAsNewBtn = null;
			this.mySavedBuildsBtn = null;
			this.dirtyBadge = null;
			this.accountPill = null;
			this.saveLabel = null;
			this.modal = null;
			this.modalCloseBtn = null;
			this.modalBody = null;
		}

		init() {
			if (!this.root) return;

			this.saveBtn = this.root.querySelector('#tgb-btn-save-build');
			this.saveAsNewBtn = this.root.querySelector('#tgb-btn-save-as-new');
			this.mySavedBuildsBtn = this.root.querySelector('#tgb-btn-my-saved-builds');
			this.dirtyBadge = this.root.querySelector('#tgb-dirty-badge');
			this.accountPill = this.root.querySelector('#tgb-account-pill');
			this.saveLabel = this.root.querySelector('#tgb-btn-save-label');
			this.modal = this.root.querySelector('#tgb-saved-builds-modal');
			this.modalCloseBtn = this.root.querySelector('#tgb-modal-close-btn');
			this.modalBody = this.root.querySelector('#tgb-modal-saved-builds-body');

			if (!this.isLoggedIn) {
				return;
			}

			if (this.saveBtn) {
				this.saveBtn.addEventListener('click', () => this.handleSave());
			}

			if (this.saveAsNewBtn) {
				this.saveAsNewBtn.addEventListener('click', () => this.handleSaveAsNew());
			}

			if (this.mySavedBuildsBtn) {
				this.mySavedBuildsBtn.addEventListener('click', () => this.openSavedBuildsModal());
			}

			if (this.modalCloseBtn) {
				this.modalCloseBtn.addEventListener('click', () => this.closeSavedBuildsModal());
			}

			if (this.modal) {
				this.modal.addEventListener('click', (e) => {
					if (e.target === this.modal) {
						this.closeSavedBuildsModal();
					}
				});
			}

			// Setup dirty tracking
			if (this.buildState) {
				this.buildState.subscribe((event) => {
					if (!event || (this.persistence && this.persistence.isRestoring)) return;
					switch (event.type) {
						case 'base_gun_set':
						case 'part_added':
						case 'part_removed':
						case 'rail_added':
						case 'rail_removed':
						case 'part_moved':
						case 'rail_moved':
						case 'drag_ended':
							this.markDirty();
							break;
					}
				});
			}

			// Intercept guest manager switching if dirty
			if (this.guestBuildManager && typeof this.guestBuildManager.switchBuild === 'function') {
				const origSwitch = this.guestBuildManager.switchBuild.bind(this.guestBuildManager);
				this.guestBuildManager.switchBuild = async (targetBuildId) => {
					if (this.isDirty && this.activeSavedBuildId) {
						const proceed = window.confirm('You have unsaved changes in your active account build. Discard changes and switch build?');
						if (!proceed) return false;
					}
					this.activeSavedBuildId = null;
					this.activeSavedBuildName = '';
					this.activeSavedBuildUpdatedAt = null;
					this.clearDirty();
					this.updateUIForSavedBuild();
					return origSwitch(targetBuildId);
				};
			}

			// Auto guest transfer
			this.performGuestTransfer();
		}

		markDirty() {
			this.isDirty = true;
			if (this.dirtyBadge) {
				this.dirtyBadge.style.display = 'inline-flex';
			}
		}

		clearDirty() {
			this.isDirty = false;
			if (this.dirtyBadge) {
				this.dirtyBadge.style.display = 'none';
			}
		}

		updateUIForSavedBuild() {
			if (this.activeSavedBuildId) {
				if (this.saveLabel) {
					this.saveLabel.textContent = 'Save Changes';
				}
				if (this.saveAsNewBtn) {
					this.saveAsNewBtn.style.display = 'inline-flex';
				}
				if (this.accountPill) {
					this.accountPill.style.display = 'inline-flex';
					this.accountPill.textContent = `Account: ${this.activeSavedBuildName || 'Build'}`;
				}
			} else {
				if (this.saveLabel) {
					this.saveLabel.textContent = 'Save Build';
				}
				if (this.saveAsNewBtn) {
					this.saveAsNewBtn.style.display = 'none';
				}
				if (this.accountPill) {
					this.accountPill.style.display = 'none';
				}
			}
		}

		serializeCurrentBuild() {
			if (!this.buildState) return null;
			const baseGun = this.buildState.getBaseGun();
			if (!baseGun || !baseGun.productId) return null;

			const state = this.buildState.getState();
			return {
				schemaVersion: 2,
				baseProductId: Number(baseGun.productId),
				rails: (state.rails || [])
					.filter(r => r && (r.position === 'top' || r.position === 'bottom'))
					.slice(0, 10).map(r => ({
						instanceId: typeof r.instanceId === 'string' ? r.instanceId.trim().slice(0, 64) : '',
						productId: Number(r.productId),
						position: r.position,
						x: typeof r.x === 'number' && Number.isFinite(r.x) ? Math.round(r.x) : 0,
						y: typeof r.y === 'number' && Number.isFinite(r.y) ? Math.round(r.y) : 0,
						zIndex: typeof r.zIndex === 'number' && Number.isInteger(r.zIndex) ? Math.min(1000, Math.max(1, r.zIndex)) : 15
					})),
				parts: (state.parts || []).slice(0, 30).map(p => ({
					instanceId: typeof p.instanceId === 'string' ? p.instanceId.trim().slice(0, 64) : '',
					productId: Number(p.productId),
					x: typeof p.x === 'number' && Number.isFinite(p.x) ? Math.round(p.x) : 0,
					y: typeof p.y === 'number' && Number.isFinite(p.y) ? Math.round(p.y) : 0,
					zIndex: typeof p.zIndex === 'number' && Number.isInteger(p.zIndex) ? Math.min(1000, Math.max(1, p.zIndex)) : 20
				}))
			};
		}

		async handleSave() {
			if (this.isSaving) return;
			const serialized = this.serializeCurrentBuild();
			if (!serialized) {
				if (this.productSelection && typeof this.productSelection.showNotice === 'function') {
					this.productSelection.showNotice('Please select a base weapon before saving your build.', 'warning');
				}
				return;
			}

			this.isSaving = true;

			try {
				if (this.activeSavedBuildId) {
					// Updating existing saved build
					serialized.name = this.activeSavedBuildName || 'My Gun Build';
					if (this.activeSavedBuildUpdatedAt) {
						serialized.lastModified = this.activeSavedBuildUpdatedAt;
					}

					const res = await fetch(`${this.apiBase}/${this.activeSavedBuildId}`, {
						method: 'PUT',
						headers: {
							'Content-Type': 'application/json',
							'X-WP-Nonce': this.restNonce
						},
						body: JSON.stringify(serialized)
					});

					const data = await res.json();
					if (!res.ok) {
						if (res.status === 409) {
							if (this.productSelection) {
								this.productSelection.showNotice('Conflict: This build was modified in another session. Please reload or Save As New.', 'error');
							}
						} else {
							throw new Error(data.message || 'Failed to update build.');
						}
						return;
					}

					this.activeSavedBuildName = data.name;
					this.activeSavedBuildUpdatedAt = data.updatedAt;
					this.clearDirty();
					this.updateUIForSavedBuild();

					if (this.productSelection) {
						this.productSelection.showNotice(`Build "${data.name}" updated successfully.`, 'success');
					}
					if (this.currentBuild && typeof this.currentBuild.announce === 'function') {
						this.currentBuild.announce(`Build ${data.name} updated.`);
					}
				} else {
					// Creating brand new saved build
					let defaultName = 'My Gun Build';
					if (this.guestBuildManager) {
						const activeGuest = this.guestBuildManager.getActiveBuild();
						if (activeGuest && activeGuest.name) {
							defaultName = this.guestBuildManager.unescapeName(activeGuest.name);
						}
					}

					const promptVal = window.prompt('Enter a name for this build (max 40 characters):', defaultName);
					if (promptVal === null) {
						this.isSaving = false;
						return;
					}

					const name = promptVal.trim().slice(0, 40) || defaultName;
					serialized.name = name;

					const res = await fetch(this.apiBase, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-WP-Nonce': this.restNonce
						},
						body: JSON.stringify(serialized)
					});

					const data = await res.json();
					if (!res.ok) {
						throw new Error(data.message || 'Failed to save build.');
					}

					this.activeSavedBuildId = data.id;
					this.activeSavedBuildName = data.name;
					this.activeSavedBuildUpdatedAt = data.updatedAt;
					this.clearDirty();
					this.updateUIForSavedBuild();

					if (this.productSelection) {
						this.productSelection.showNotice(`Build "${data.name}" saved to your account!`, 'success');
					}
					if (this.currentBuild && typeof this.currentBuild.announce === 'function') {
						this.currentBuild.announce(`Build ${data.name} saved to account.`);
					}
				}
			} catch (err) {
				if (this.productSelection) {
					this.productSelection.showNotice(err.message || 'Failed to save build.', 'error');
				}
			} finally {
				this.isSaving = false;
			}
		}

		async handleSaveAsNew() {
			if (this.isSaving) return;
			const serialized = this.serializeCurrentBuild();
			if (!serialized) {
				if (this.productSelection) {
					this.productSelection.showNotice('Please select a base weapon before saving.', 'warning');
				}
				return;
			}

			const defaultName = (this.activeSavedBuildName || 'My Gun Build') + ' (Copy)';
			const promptVal = window.prompt('Enter name for the new build (max 40 characters):', defaultName);
			if (promptVal === null) return;

			const name = promptVal.trim().slice(0, 40) || defaultName;
			serialized.name = name;
			this.isSaving = true;

			try {
				const res = await fetch(this.apiBase, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce': this.restNonce
					},
					body: JSON.stringify(serialized)
				});

				const data = await res.json();
				if (!res.ok) {
					throw new Error(data.message || 'Failed to save as new build.');
				}

				this.activeSavedBuildId = data.id;
				this.activeSavedBuildName = data.name;
				this.activeSavedBuildUpdatedAt = data.updatedAt;
				this.clearDirty();
				this.updateUIForSavedBuild();

				if (this.productSelection) {
					this.productSelection.showNotice(`Saved as new build: "${data.name}".`, 'success');
				}
				if (this.currentBuild && typeof this.currentBuild.announce === 'function') {
					this.currentBuild.announce(`Saved as new build: ${data.name}.`);
				}
			} catch (err) {
				if (this.productSelection) {
					this.productSelection.showNotice(err.message || 'Failed to save build.', 'error');
				}
			} finally {
				this.isSaving = false;
			}
		}

		async loadSavedBuildById(buildId) {
			if (!buildId) return false;

			try {
				const res = await fetch(`${this.apiBase}/${buildId}`, {
					headers: {
						'X-WP-Nonce': this.restNonce
					}
				});

				if (!res.ok) {
					throw new Error('Could not load saved build.');
				}

				const buildData = await res.json();
				if (!buildData || !buildData.baseProductId) {
					throw new Error('Invalid saved build data.');
				}

				// Restore configuration into canvas
				const restoreRes = await this.persistence.restoreBuild(
					this.catalogClient,
					this.productSelection,
					this.buildState,
					this.renderer,
					this.productRegistry,
					buildData
				);

				if (restoreRes && restoreRes.restored) {
					this.activeSavedBuildId = buildData.id;
					this.activeSavedBuildName = buildData.name;
					this.activeSavedBuildUpdatedAt = buildData.updatedAt;
					this.clearDirty();
					this.updateUIForSavedBuild();

					if (restoreRes.partial && restoreRes.message) {
						if (this.productSelection) this.productSelection.showNotice(restoreRes.message, 'warning');
					} else {
						if (this.productSelection) this.productSelection.showNotice(`Loaded saved build "${buildData.name}".`, 'info');
					}
					return true;
				} else {
					if (this.productSelection) {
						this.productSelection.showNotice(restoreRes.message || 'Failed to restore build.', 'error');
					}
					return false;
				}
			} catch (err) {
				if (this.productSelection) {
					this.productSelection.showNotice(err.message || 'Failed to load saved build.', 'error');
				}
				return false;
			}
		}

		async openSavedBuildsModal() {
			if (!this.modal) return;
			this.modal.style.display = 'flex';
			if (!this.modalBody) return;

			this.modalBody.innerHTML = '<div style="text-align: center; padding: 30px; color: #94a3b8;">Loading saved builds...</div>';

			try {
				const res = await fetch(this.apiBase, {
					headers: { 'X-WP-Nonce': this.restNonce }
				});
				if (!res.ok) throw new Error('Failed to fetch saved builds.');
				const data = await res.json();
				this.renderSavedBuildsList(data.builds || []);
			} catch (err) {
				this.modalBody.innerHTML = `<div style="text-align: center; padding: 20px; color: #ef4444;">${err.message || 'Failed to load builds.'}</div>`;
			}
		}

		closeSavedBuildsModal() {
			if (this.modal) {
				this.modal.style.display = 'none';
			}
		}

		renderSavedBuildsList(builds) {
			if (!this.modalBody) return;
			this.modalBody.innerHTML = '';

			const count = builds.length;
			const limitBadge = this.root.querySelector('#tgb-modal-build-limit-badge');
			if (limitBadge) {
				limitBadge.textContent = `${count} / ${this.maxBuilds} Builds`;
			}

			if (count === 0) {
				this.modalBody.innerHTML = `
					<div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
						<p style="margin-bottom: 8px; font-size: 15px; font-weight: 600; color: #cbd5e1;">You don't have any saved gun builds yet.</p>
						<p style="font-size: 13px;">Create and customize a build on the canvas, then click <strong>Save Build</strong> to store it here.</p>
					</div>
				`;
				return;
			}

			for (const b of builds) {
				const item = document.createElement('div');
				item.className = 'tgb-modal-item';

				const info = document.createElement('div');
				info.className = 'tgb-modal-item-info';

				const nameEl = document.createElement('div');
				nameEl.className = 'tgb-modal-item-name';
				nameEl.textContent = b.name;

				const metaEl = document.createElement('div');
				metaEl.className = 'tgb-modal-item-meta';
				const railsCount = (b.rails || []).length;
				const partsCount = (b.parts || []).length;
				metaEl.textContent = `${railsCount} Rails • ${partsCount} Parts • Saved ${b.updatedAt ? new Date(b.updatedAt).toLocaleDateString() : ''}`;

				info.appendChild(nameEl);
				info.appendChild(metaEl);

				const actions = document.createElement('div');
				actions.className = 'tgb-modal-item-actions';

				const openBtn = document.createElement('button');
				openBtn.type = 'button';
				openBtn.className = 'tgb-btn tgb-btn--secondary';
				openBtn.style.padding = '6px 12px';
				openBtn.style.fontSize = '12px';
				openBtn.textContent = 'Open';
				openBtn.addEventListener('click', async () => {
					if (this.isDirty) {
						const ok = window.confirm('You have unsaved changes in the current build. Discard changes and open this build?');
						if (!ok) return;
					}
					this.closeSavedBuildsModal();
					await this.loadSavedBuildById(b.id);
				});

				const dupBtn = document.createElement('button');
				dupBtn.type = 'button';
				dupBtn.className = 'tgb-btn tgb-btn--secondary';
				dupBtn.style.padding = '6px 10px';
				dupBtn.style.fontSize = '12px';
				dupBtn.textContent = 'Duplicate';
				if (count >= this.maxBuilds) {
					dupBtn.disabled = true;
					dupBtn.title = 'Account limit reached (10 builds maximum)';
				}
				dupBtn.addEventListener('click', async () => {
					dupBtn.disabled = true;
					try {
						const dRes = await fetch(`${this.apiBase}/${b.id}/duplicate`, {
							method: 'POST',
							headers: { 'X-WP-Nonce': this.restNonce }
						});
						const dData = await dRes.json();
						if (!dRes.ok) throw new Error(dData.message || 'Duplicate failed.');
						if (this.productSelection) this.productSelection.showNotice(`Duplicated "${b.name}".`, 'success');
						await this.openSavedBuildsModal();
					} catch (e) {
						alert(e.message);
						dupBtn.disabled = false;
					}
				});

				const delBtn = document.createElement('button');
				delBtn.type = 'button';
				delBtn.className = 'tgb-btn tgb-btn--danger';
				delBtn.style.padding = '6px 10px';
				delBtn.style.fontSize = '12px';
				delBtn.style.background = '#dc2626';
				delBtn.style.color = '#fff';
				delBtn.style.border = 'none';
				delBtn.textContent = 'Delete';
				delBtn.addEventListener('click', async () => {
					const ok = window.confirm(`Delete "${b.name}"? This action cannot be undone.`);
					if (!ok) return;
					delBtn.disabled = true;
					try {
						const dRes = await fetch(`${this.apiBase}/${b.id}`, {
							method: 'DELETE',
							headers: { 'X-WP-Nonce': this.restNonce }
						});
						if (!dRes.ok) throw new Error('Delete failed.');
						if (this.activeSavedBuildId === b.id) {
							this.activeSavedBuildId = null;
							this.activeSavedBuildName = '';
							this.updateUIForSavedBuild();
						}
						if (this.productSelection) this.productSelection.showNotice(`Deleted "${b.name}".`, 'info');
						await this.openSavedBuildsModal();
					} catch (e) {
						alert(e.message);
						delBtn.disabled = false;
					}
				});

				actions.appendChild(openBtn);
				actions.appendChild(dupBtn);
				actions.appendChild(delBtn);

				item.appendChild(info);
				item.appendChild(actions);
				this.modalBody.appendChild(item);
			}
		}

		async performGuestTransfer() {
			if (!this.isLoggedIn || this.hasTransferredGuest) return;
			if (!this.guestBuildManager) return;

			const guestBuilds = this.guestBuildManager.exportForAccountSync();
			if (!Array.isArray(guestBuilds) || guestBuilds.length === 0) return;

			// Filter builds that actually have a baseProductId configured
			const eligible = guestBuilds.filter(b => b && b.baseProductId && Number(b.baseProductId) > 0);
			if (eligible.length === 0) return;

			this.hasTransferredGuest = true;

			try {
				const res = await fetch(`${this.apiBase}/import-guest`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce': this.restNonce
					},
					body: JSON.stringify({ builds: eligible })
				});

				const data = await res.json();
				if (!res.ok) {
					console.warn('[TGB Guest Transfer] Import request returned error: ' + JSON.stringify(data));
					return { success: false, error: data };
				}

				if (data.results && Array.isArray(data.results)) {
					let importedCount = 0;
					for (const r of data.results) {
						if (r.status === 'imported' || r.status === 'already_imported') {
							importedCount++;
							// Non-destructively remove imported build from guest sessionStorage workspace
							if (this.guestBuildManager.workspace && Array.isArray(this.guestBuildManager.workspace.builds)) {
								const idx = this.guestBuildManager.workspace.builds.findIndex(b => b.id === r.guest_id);
								if (idx !== -1) {
									this.guestBuildManager.workspace.builds.splice(idx, 1);
								}
							}
						}
					}

					// Ensure at least 1 guest build slot remains if all were imported
					if (this.guestBuildManager.workspace && this.guestBuildManager.workspace.builds.length === 0) {
						this.guestBuildManager.workspace.builds.push({
							id: 'build-1',
							name: 'Build 1',
							createdAt: Date.now(),
							updatedAt: Date.now(),
							baseProductId: null,
							rails: [],
							parts: []
						});
						this.guestBuildManager.workspace.activeBuildId = 'build-1';
						this.guestBuildManager.activeBuildId = 'build-1';
					}

					this.guestBuildManager.saveWorkspace();
					this.guestBuildManager.syncUI();

					if (importedCount > 0) {
						let msg = `${importedCount} guest ${importedCount === 1 ? 'build was' : 'builds were'} saved to your account.`;
						if (data.skipped_count > 0) {
							msg += ` (${data.skipped_count} could not be imported: 10-build account limit reached)`;
						}
						if (this.productSelection) {
							this.productSelection.showNotice(msg, 'success');
						}
						if (this.currentBuild && typeof this.currentBuild.announce === 'function') {
							this.currentBuild.announce(msg);
						}
					}

					return { success: true, importedCount, skippedCount: data.skipped_count || 0, data };
				}
				return { success: true, importedCount: 0, skippedCount: 0, data };
			} catch (err) {
				console.warn('[TGB Guest Transfer] Import failed safely:', err);
				return { success: false, error: err };
			}
		}
	}

	/**
	 * Class TGB_ShareManager
	 *
	 * Implements Part 6: Secure Shareable Build Links, Public Viewing & Revocation.
	 *
	 * Capabilities:
	 * - Generates cryptographically secure shareable public links for guests and registered customers.
	 * - Restores public shared builds into the 2D visual canvas in read-only mode.
	 * - Reflects live WooCommerce prices, stock status, and unavailable product warnings.
	 * - Prevents modification or dragging in read-only mode.
	 * - Implements "Customize a Copy" creating independent local drafts without mutating the original snapshot or owner's saved build.
	 */
	class TGB_ShareManager {
		constructor(options = {}) {
			this.root = options.root;
			this.catalogClient = options.catalogClient;
			this.productSelection = options.productSelection;
			this.buildState = options.buildState;
			this.renderer = options.renderer;
			this.productRegistry = options.productRegistry;
			this.currentBuild = options.currentBuild;
			this.guestBuildManager = options.guestBuildManager;
			this.accountBuildManager = options.accountBuildManager;
			this.persistence = options.persistence;

			this.isReadOnly = false;
			this.sharedSnapshot = null;

			this.sharesRestUrl = (window.taktikGunBuilder && window.taktikGunBuilder.sharesRestUrl)
				|| '/wp-json/tgb/v1/shares';
			this.nonce = (window.taktikGunBuilder && (window.taktikGunBuilder.restNonce || window.taktikGunBuilder.nonce)) || '';
		}

		init() {
			if (!this.root) return;

			this.shareBtn        = this.root.querySelector('#tgb-btn-share-build');
			this.shareModal      = this.root.querySelector('#tgb-share-modal');
			this.modalClose      = this.root.querySelector('#tgb-share-modal-close');
			this.urlInput        = this.root.querySelector('#tgb-share-url-input');
			this.copyBtn         = this.root.querySelector('#tgb-btn-copy-link');
			this.copyLabel       = this.root.querySelector('#tgb-btn-copy-label');
			this.expNote         = this.root.querySelector('#tgb-share-expiration-note');
			this.feedback        = this.root.querySelector('#tgb-share-feedback');

			this.previewBanner   = this.root.querySelector('#tgb-shared-preview-banner');
			this.bannerTitle     = this.root.querySelector('#tgb-shared-build-name');
			this.bannerPrice     = this.root.querySelector('#tgb-shared-build-price');
			this.bannerWarnings  = this.root.querySelector('#tgb-shared-banner-warnings');
			this.customizeBtn    = this.root.querySelector('#tgb-btn-customize-copy');

			if (this.shareBtn) {
				this.shareBtn.addEventListener('click', () => this.openShareModal());
			}

			if (this.modalClose) {
				this.modalClose.addEventListener('click', () => this.closeShareModal());
			}

			if (this.shareModal) {
				this.shareModal.addEventListener('click', (e) => {
					if (e.target === this.shareModal) this.closeShareModal();
				});
			}

			if (this.copyBtn) {
				this.copyBtn.addEventListener('click', () => this.copyLink());
			}

			if (this.customizeBtn) {
				this.customizeBtn.addEventListener('click', () => this.customizeCopy());
			}

			document.addEventListener('keydown', (e) => {
				if (e.key === 'Escape' && this.shareModal && this.shareModal.style.display !== 'none') {
					this.closeShareModal();
				}
			});
		}

		async openShareModal() {
			const baseGun = this.buildState ? this.buildState.getBaseGun() : null;
			if (!baseGun || !baseGun.productId) {
				if (this.productSelection) {
					this.productSelection.showNotice('Please select a base weapon before generating a share link.', 'warning');
				}
				return;
			}

			if (!this.shareModal || !this.urlInput) return;

			this.shareModal.style.display = 'flex';
			this.urlInput.value = 'Generating secure share link...';
			if (this.copyBtn) this.copyBtn.disabled = true;
			if (this.feedback) this.feedback.style.display = 'none';
			if (this.expNote) this.expNote.textContent = '';

			let payload = null;

			// If logged in and editing an active account build, share by savedBuildId
			if (this.accountBuildManager && this.accountBuildManager.isLoggedIn && this.accountBuildManager.activeSavedBuildId) {
				payload = {
					savedBuildId: this.accountBuildManager.activeSavedBuildId
				};
			} else {
				// Otherwise share the active working configuration
				let buildName = 'Custom Build';
				if (this.currentBuild && this.currentBuild.name) {
					buildName = this.currentBuild.name;
				} else if (this.guestBuildManager) {
					const active = this.guestBuildManager.getActiveBuild();
					if (active && active.name) buildName = active.name;
				}

				payload = {
					name: buildName,
					baseProductId: baseGun.productId,
					rails: this.buildState.getRails().map(r => ({
						instanceId: r.instanceId,
						productId: r.productId,
						position: r.position || 'bottom',
						x: r.x || 0,
						y: r.y || 0,
						zIndex: r.zIndex || 15
					})),
					parts: this.buildState.getParts().map(p => ({
						instanceId: p.instanceId,
						productId: p.productId,
						x: p.x || 0,
						y: p.y || 0,
						zIndex: p.zIndex || 20
					}))
				};
			}

			try {
				const headers = { 'Content-Type': 'application/json' };
				if (this.nonce) {
					headers['X-WP-Nonce'] = this.nonce;
				}

				const res = await fetch(this.sharesRestUrl, {
					method: 'POST',
					headers: headers,
					body: JSON.stringify(payload)
				});

				const data = await res.json();
				if (res.ok && data.share_url) {
					this.urlInput.value = data.share_url;
					if (this.copyBtn) this.copyBtn.disabled = false;
					if (this.expNote) {
						this.expNote.textContent = (data.source_type === 'guest')
							? 'This share link expires in 90 days.'
							: 'Registered build link. For security, secret tokens cannot be retrieved after closing. Copy now or use Replace Link in My Account if needed.';
					}
					if (this.feedback) {
						this.feedback.textContent = data.message || 'Share link ready!';
						this.feedback.className = 'tgb-share-feedback tgb-share-feedback--success';
						this.feedback.style.display = 'block';
					}
				} else {
					this.urlInput.value = '';
					if (this.feedback) {
						this.feedback.textContent = data.message || 'Failed to generate share link.';
						this.feedback.className = 'tgb-share-feedback tgb-share-feedback--error';
						this.feedback.style.display = 'block';
					}
				}
			} catch (err) {
				this.urlInput.value = '';
				if (this.feedback) {
					this.feedback.textContent = 'Network error generating share link.';
					this.feedback.className = 'tgb-share-feedback tgb-share-feedback--error';
					this.feedback.style.display = 'block';
				}
			}
		}

		closeShareModal() {
			if (this.shareModal) {
				this.shareModal.style.display = 'none';
			}
		}

		async copyLink() {
			if (!this.urlInput || !this.urlInput.value) return;
			const url = this.urlInput.value;

			try {
				if (navigator.clipboard && navigator.clipboard.writeText) {
					await navigator.clipboard.writeText(url);
				} else {
					this.urlInput.select();
					document.execCommand('copy');
				}
				if (this.copyLabel) this.copyLabel.textContent = 'Copied!';
				setTimeout(() => {
					if (this.copyLabel) this.copyLabel.textContent = 'Copy Link';
				}, 2000);
			} catch (err) {
				this.urlInput.select();
				document.execCommand('copy');
				if (this.copyLabel) this.copyLabel.textContent = 'Copied!';
				setTimeout(() => {
					if (this.copyLabel) this.copyLabel.textContent = 'Copy Link';
				}, 2000);
			}
		}

		async loadSharedBuild(token) {
			if (!token || typeof token !== 'string') return false;

			this.isReadOnly = true;
			this.root.classList.add('tgb-shared-preview-mode');

			if (this.currentBuild && typeof this.currentBuild.announce === 'function') {
				this.currentBuild.announce('Loading shared weapon configuration...');
			}

			try {
				const url = `${this.sharesRestUrl}/${encodeURIComponent(token)}`;
				const res = await fetch(url, { method: 'GET' });
				const data = await res.json();

				if (!res.ok || !data.success) {
					this.root.classList.remove('tgb-shared-preview-mode');
					this.isReadOnly = false;
					if (this.productSelection) {
						this.productSelection.showNotice(data.message || 'Shared build link is invalid, expired, or has been revoked.', 'error');
					}
					return false;
				}

				this.sharedSnapshot = data;

				// 1. Populate Shared Preview Banner
				if (this.previewBanner) {
					this.previewBanner.style.display = 'block';
					if (this.bannerTitle) {
						this.bannerTitle.textContent = data.name || 'Shared Build';
					}
					if (this.bannerPrice) {
						this.bannerPrice.textContent = (data.totalPrice && data.totalPrice.formatted) ? data.totalPrice.formatted : '';
					}
					if (this.bannerWarnings) {
						if (data.hasUnavailable && Array.isArray(data.unavailableItems) && data.unavailableItems.length > 0) {
							this.bannerWarnings.innerHTML = data.unavailableItems.map(item => '<div>⚠️ ' + this.escapeHtml(item.message) + '</div>').join('');
							this.bannerWarnings.style.display = 'block';
						} else {
							this.bannerWarnings.style.display = 'none';
						}
					}
				}

				// 2. Clear current visual build state
				this.buildState.clear();

				// 3. Load and render Base Gun
				if (data.baseProduct && data.baseProduct.builder_image) {
					this.productRegistry.set(data.baseProductId, data.baseProduct);
					this.buildState.setBaseGun(data.baseProduct);
					if (this.renderer && typeof this.renderer.loadAndRenderBaseGun === 'function') {
						await this.renderer.loadAndRenderBaseGun(data.baseProduct);
					}
				} else {
					if (this.renderer && typeof this.renderer.showInvalidState === 'function') {
						this.renderer.showInvalidState('The base weapon in this shared build is no longer available.');
					}
				}

				// 4. Staged Rail restoration first
				if (Array.isArray(data.rails)) {
					for (const r of data.rails) {
						const railProduct = r.product;
						if (!railProduct || !railProduct.builder_image) continue;
						this.productRegistry.set(r.productId, railProduct);
						this.buildState.addRail(
							railProduct,
							r.position || 'bottom',
							r.x || 0,
							r.y || 0,
							r.zIndex || 15,
							r.instanceId || ('rail-' + r.productId + '-' + Date.now())
						);
					}
				}

				// 5. Staged Part restoration next
				if (Array.isArray(data.parts)) {
					for (const p of data.parts) {
						const partProduct = p.product;
						if (!partProduct || !partProduct.builder_image) continue;
						this.productRegistry.set(p.productId, partProduct);
						this.buildState.addPart(
							partProduct,
							p.x || 0,
							p.y || 0,
							p.zIndex || 20,
							p.instanceId || ('part-' + p.productId + '-' + Date.now())
						);
					}
				}

				// 6. Ensure display scale matches viewport after mounting all components
				if (this.renderer && typeof this.renderer.updateDisplayScale === 'function' && this.renderer.viewportEl) {
					this.renderer.updateDisplayScale(this.renderer.viewportEl.clientWidth);
				}

				// 7. Update current build panel UI
				if (this.currentBuild) {
					this.currentBuild.name = data.name || 'Shared Build';
					this.currentBuild.render();
					this.currentBuild.announce('Viewing shared configuration in read-only mode. Click Customize a Copy to edit.');
				}

				return true;
			} catch (err) {
				console.warn('[TGB ShareManager] Failed to load shared build:', err);
				this.root.classList.remove('tgb-shared-preview-mode');
				this.isReadOnly = false;
				if (this.productSelection) {
					this.productSelection.showNotice('Network error loading shared build configuration.', 'error');
				}
				return false;
			}
		}

		customizeCopy() {
			if (!this.sharedSnapshot) return;

			// Handle Guest vs Account independence
			const isLoggedIn = (this.accountBuildManager && this.accountBuildManager.isLoggedIn);
			const copyTitle = (this.sharedSnapshot.name ? this.sharedSnapshot.name : 'Shared Build') + ' (Copy)';

			if (!isLoggedIn && this.guestBuildManager && this.guestBuildManager.workspace) {
				// Guest: Check 10-draft limit
				const builds = Array.isArray(this.guestBuildManager.workspace.builds) ? this.guestBuildManager.workspace.builds : [];
				if (builds.length >= this.guestBuildManager.maxBuilds) {
					if (this.productSelection) {
						this.productSelection.showNotice('Cannot customize copy: maximum 10 session drafts reached. Please delete a draft first.', 'warning');
					}
					return;
				}

				const buildId = 'bld-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
				const newDraft = {
					id: buildId,
					name: copyTitle,
					createdAt: Date.now(),
					updatedAt: Date.now(),
					baseProductId: this.sharedSnapshot.baseProductId,
					rails: (this.sharedSnapshot.rails || []).map(r => ({
						instanceId: r.instanceId || ('rail-' + r.productId + '-' + Date.now()),
						productId: Number(r.productId),
						position: r.position || 'bottom',
						x: typeof r.x === 'number' ? r.x : 0,
						y: typeof r.y === 'number' ? r.y : 0,
						zIndex: r.zIndex || 15
					})),
					parts: (this.sharedSnapshot.parts || []).map(p => ({
						instanceId: p.instanceId || ('part-' + p.productId + '-' + Date.now()),
						productId: Number(p.productId),
						x: typeof p.x === 'number' ? p.x : 0,
						y: typeof p.y === 'number' ? p.y : 0,
						zIndex: p.zIndex || 20
					}))
				};

				this.guestBuildManager.workspace.builds.push(newDraft);
				this.guestBuildManager.activeBuildId = buildId;
				this.guestBuildManager.workspace.activeBuildId = buildId;
				this.guestBuildManager.saveWorkspace();
				this.guestBuildManager.syncUI();
			} else if (isLoggedIn && this.accountBuildManager) {
				// Authenticated: Create independent working copy without owner's savedBuildId
				this.accountBuildManager.activeSavedBuildId = null;
				this.accountBuildManager.activeRevision = 0;
				if (this.accountBuildManager.pill) this.accountBuildManager.pill.style.display = 'none';
				if (this.accountBuildManager.saveAsNewBtn) this.accountBuildManager.saveAsNewBtn.style.display = 'none';
				if (this.accountBuildManager.saveLabel) this.accountBuildManager.saveLabel.textContent = 'Save Build';
			}

			// Exit read-only preview mode
			this.isReadOnly = false;
			this.root.classList.remove('tgb-shared-preview-mode');

			if (this.previewBanner) {
				this.previewBanner.style.display = 'none';
			}

			// Clean URL parameter ?tgb_share
			try {
				window.history.replaceState({}, document.title, window.location.pathname);
			} catch (e) {}

			if (this.currentBuild) {
				this.currentBuild.name = copyTitle;
				this.currentBuild.announce('You are now editing your independent copy.');
				this.currentBuild.render();
			}

			if (this.productSelection) {
				this.productSelection.showNotice('You are now editing your independent copy.', 'success');
			}
		}

		escapeHtml(str) {
			if (!str || typeof str !== 'string') return '';
			const div = document.createElement('div');
			div.textContent = str;
			return div.innerHTML;
		}
	}

	// =========================================================================
	// 8. API EXPORTS & NAMESPACE (Section 41 & Part 6)
	// =========================================================================

	const productRegistry = new Map();

	window.TGB_BuildState = {
		Class: TGB_BuildState,
		instance: null,
	};

	window.TGB_Interactions = {
		Class: TGB_Interactions,
		instance: null,
	};

	window.TGB_Renderer = {
		Class: TGB_Renderer,
		calculateProductGeometry,
		calculateStageGeometry,
		calculateDisplayScale,
		createLayerElement,
		toggleDebug: function() {
			const root = document.getElementById('taktik-gun-builder');
			if (root) {
				root.classList.toggle('tgb-debug');
				return root.classList.contains('tgb-debug');
			}
			return false;
		},
		instance: null,
	};

	window.TGB_Catalog = {
		Client: TGB_CatalogClient,
		Selection: TGB_ProductSelection,
		Registry: productRegistry,
		client: null,
		selection: null,
	};

	window.TGB_Mounting = TGB_Mounting;

	window.TGB_CurrentBuild = {
		Class: TGB_CurrentBuild,
		instance: null,
	};

	window.TGB_Cart = {
		Client: TGB_CartClient,
		instance: null,
	};

	window.TGB_Persistence = {
		Class: TGB_Persistence,
		instance: null,
	};

	window.TGB_GuestBuildManager = {
		Class: TGB_GuestBuildManager,
		instance: null,
	};

	window.TGB_AccountBuildManager = {
		Class: TGB_AccountBuildManager,
		instance: null,
	};

	window.TGB_ShareManager = {
		Class: TGB_ShareManager,
		instance: null,
	};

	// Unified TGB namespace for all builder subsystems
	window.TGB = {
		BuildState: TGB_BuildState,
		Renderer: TGB_Renderer,
		Interactions: TGB_Interactions,
		Catalog: window.TGB_Catalog,
		Mounting: TGB_Mounting,
		CurrentBuild: TGB_CurrentBuild,
		Cart: window.TGB_Cart,
		Persistence: TGB_Persistence,
		GuestBuildManager: window.TGB_GuestBuildManager,
		AccountBuildManager: window.TGB_AccountBuildManager,
		ShareManager: window.TGB_ShareManager,
		state: null,
		renderer: null,
		interactions: null,
		catalog: null,
		selection: null,
		currentBuild: null,
		cart: null,
		persistence: null,
		guestBuilds: null,
		guestBuildManager: null,
		accountBuildManager: null,
		shareManager: null,
		registry: productRegistry,
		productRegistry: productRegistry,
		exportGuestBuilds: function() {
			if (window.TGB.guestBuildManager) {
				return window.TGB.guestBuildManager.exportForAccountSync();
			}
			return [];
		},
		addPart: function(product, x, y, zIndex) {
			if (window.TGB.selection && (!x && !y)) {
				return window.TGB.selection.addPartToBuild(product);
			}
			if (window.TGB.state) {
				return window.TGB.state.addPart(product, x, y, zIndex);
			}
			return null;
		},
		selectBaseGun: function(product) {
			if (window.TGB.selection) {
				return window.TGB.selection.selectBaseGun(product);
			}
			return null;
		},
		removePart: function(instanceId) {
			if (window.TGB.state) {
				return window.TGB.state.removePart(instanceId);
			}
			return false;
		},
		addBuildToCart: function() {
			if (window.TGB.currentBuild) {
				return window.TGB.currentBuild.handleAddBuildToCart();
			}
			return null;
		},
		getState: function() {
			if (window.TGB.state) {
				return window.TGB.state.getState();
			}
			return null;
		},
		reset: function() {
			if (window.TGB.guestBuildManager) {
				window.TGB.guestBuildManager.promptReset();
			} else if (window.TGB.currentBuild) {
				window.TGB.currentBuild.handleResetBuild();
			} else if (window.TGB.state) {
				window.TGB.state.reset();
				window.TGB.state.setBaseGun(null);
				if (window.TGB.persistence) {
					window.TGB.persistence.clear();
				}
			}
		},
	};

	async function initMyAccountGuestSync() {
		try {
			if (typeof window === 'undefined' || !('sessionStorage' in window) || !window.sessionStorage) return;
			if (window.__tgbGuestTransferInProgress || window.__tgbGuestTransferDone) return;

			const raw = window.sessionStorage.getItem('tgb_guest_builds_v2');
			if (!raw) return;

			const guestMgr = new TGB_GuestBuildManager();
			guestMgr.init();
			const builds = guestMgr.exportForAccountSync();
			const eligible = builds.filter(b => b && b.baseProductId && Number(b.baseProductId) > 0);
			if (eligible.length === 0) return;

			window.__tgbGuestTransferInProgress = true;

			const accountMgr = new TGB_AccountBuildManager({ guestBuildManager: guestMgr });
			const result = await accountMgr.performGuestTransfer();

			window.__tgbGuestTransferInProgress = false;
			window.__tgbGuestTransferDone = true;

			const wrap = document.getElementById('tgb-my-account-wrap');
			if (wrap && result && result.importedCount > 0) {
				const feedback = document.getElementById('tgb-account-feedback');
				if (feedback) {
					feedback.textContent = `${result.importedCount} guest build(s) transferred to your account. Updating...`;
					feedback.className = 'tgb-account-feedback tgb-account-feedback--success';
					feedback.style.display = 'block';
				}
				setTimeout(() => {
					window.location.reload();
				}, 400);
				return;
			}

			// If on standard My Account dashboard (outside gun-builder-builds endpoint)
			if (result && result.importedCount > 0) {
				const accountContent = document.querySelector('.woocommerce-MyAccount-content') || document.querySelector('.woocommerce');
				if (accountContent) {
					const config = (typeof window !== 'undefined' && window.taktikGunBuilder) ? window.taktikGunBuilder : {};
					const buildsUrl = config.myAccountSavedBuildsUrl || '/my-account/gun-builder-builds/';
					let noticeHtml = `<div class="woocommerce-message tgb-account-transfer-banner" role="alert" style="margin-bottom: 24px; padding: 14px 20px; background: #1a221a; border-left: 4px solid #4CAF50; color: #e0e0e0; border-radius: 4px;">`
						+ `<strong>${result.importedCount} guest gun build(s)</strong> were automatically saved to your account. `
						+ `<a href="${buildsUrl}" class="button wc-forward" style="margin-left: 12px; display: inline-block; padding: 6px 14px; background: #c5a059; color: #111; font-weight: 600; text-decoration: none; border-radius: 3px;">View My Gun Builds &rarr;</a>`;
					if (result.skippedCount > 0) {
						noticeHtml += `<div style="margin-top: 6px; font-size: 0.9em; color: #ffb74d;">Note: ${result.skippedCount} build(s) could not be imported because your account reached the 10-build limit. They remain in your session.</div>`;
					}
					noticeHtml += `</div>`;
					accountContent.insertAdjacentHTML('afterbegin', noticeHtml);
				}
			} else if (result && result.skippedCount > 0) {
				const accountContent = document.querySelector('.woocommerce-MyAccount-content') || document.querySelector('.woocommerce');
				if (accountContent) {
					const config = (typeof window !== 'undefined' && window.taktikGunBuilder) ? window.taktikGunBuilder : {};
					const buildsUrl = config.myAccountSavedBuildsUrl || '/my-account/gun-builder-builds/';
					const noticeHtml = `<div class="woocommerce-info tgb-account-transfer-banner" role="alert" style="margin-bottom: 24px; padding: 14px 20px; background: #262115; border-left: 4px solid #ff9800; color: #e0e0e0; border-radius: 4px;">`
						+ `Your guest gun build(s) could not be imported because your account has reached the 10-build limit. Delete an existing build in <a href="${buildsUrl}" style="color: #ffb74d; text-decoration: underline;">My Gun Builds</a> to import them.</div>`;
					accountContent.insertAdjacentHTML('afterbegin', noticeHtml);
				}
			}
		} catch (e) {
			window.__tgbGuestTransferInProgress = false;
			console.warn('[TGB Account Sync] Transfer caught error:', e);
		}
	}

	if (typeof window !== 'undefined') {
		window.TGB_initMyAccountGuestSync = initMyAccountGuestSync;
	}

	/**
	 * Bootstraps the Gun Builder frontend shell, Build State, Renderer, Interactions, and Catalog.
	 */
	async function initGunBuilder() {
		const root = document.getElementById('taktik-gun-builder');
		if (!root) {
			const config = (typeof window !== 'undefined' && window.taktikGunBuilder) ? window.taktikGunBuilder : {};
			const isAccount = config.isAccountPage || (document.body && (
				document.body.classList.contains('woocommerce-account') ||
				document.getElementById('tgb-my-account-wrap') ||
				document.querySelector('.woocommerce-MyAccount-navigation, .woocommerce-MyAccount-content')
			));
			if (config.isLoggedIn && isAccount) {
				initMyAccountGuestSync();
			}
			return;
		}

		if (root.classList.contains('tgb-ready')) {
			return;
		}

		root.classList.add('tgb-ready');

		// Pre-seed registry from initial render Base Gun if present (Requirement 6)
		const initialScript = root.querySelector('.tgb-initial-render-data');
		let initialPayload = null;
		if (initialScript && initialScript.textContent) {
			try {
				initialPayload = JSON.parse(initialScript.textContent);
			} catch (e) {
				initialPayload = null;
			}
		}

		if (initialPayload && initialPayload.product && initialPayload.product.id) {
			productRegistry.set(initialPayload.product.id, initialPayload.product);
		}

		const currencyConfig = (initialPayload && initialPayload.currency)
			|| (window.taktikGunBuilder && window.taktikGunBuilder.currency)
			|| {};
		const weightConfig = (initialPayload && initialPayload.weight_unit)
			? { unit: initialPayload.weight_unit }
			: ((window.taktikGunBuilder && window.taktikGunBuilder.weight) || {});

		const buildState = new TGB_BuildState();
		const renderer = new TGB_Renderer(root, buildState);
		renderer.init();

		const interactions = new TGB_Interactions(renderer, buildState);
		interactions.init();
		renderer.setInteractions(interactions);

		const catalogClient = new TGB_CatalogClient();
		const productSelection = new TGB_ProductSelection(root, catalogClient, buildState, renderer, productRegistry);
		await productSelection.init();

		const currentBuild = new TGB_CurrentBuild(root, buildState, productRegistry, currencyConfig, weightConfig);
		currentBuild.init();

		const persistence = new TGB_Persistence('tgb_current_build_state');
		const guestBuildManager = new TGB_GuestBuildManager({
			root,
			catalogClient,
			productSelection,
			buildState,
			renderer,
			productRegistry,
			currentBuild,
			persistence
		});
		persistence.guestBuildManager = guestBuildManager;

		// Wire up global references
		window.TGB_BuildState.instance = buildState;
		window.TGB_Renderer.instance = renderer;
		window.TGB_Interactions.instance = interactions;
		window.TGB_Catalog.client = catalogClient;
		window.TGB_Catalog.selection = productSelection;
		window.TGB_CurrentBuild.instance = currentBuild;
		window.TGB_Cart.instance = currentBuild.cartClient;
		window.TGB_Persistence.instance = persistence;
		window.TGB_GuestBuildManager.instance = guestBuildManager;

		const accountBuildManager = new TGB_AccountBuildManager({
			root,
			catalogClient,
			productSelection,
			buildState,
			renderer,
			productRegistry,
			currentBuild,
			persistence,
			guestBuildManager
		});
		window.TGB_AccountBuildManager.instance = accountBuildManager;

		window.TGB.state = buildState;
		window.TGB.renderer = renderer;
		window.TGB.interactions = interactions;
		window.TGB.catalog = catalogClient;
		window.TGB.catalogClient = catalogClient;
		window.TGB.selection = productSelection;
		window.TGB.currentBuild = currentBuild;
		window.TGB.cart = currentBuild.cartClient;
		window.TGB.persistence = persistence;
		window.TGB.guestBuilds = guestBuildManager;
		window.TGB.guestBuildManager = guestBuildManager;
		window.TGB.accountBuildManager = accountBuildManager;

		const shareManager = new TGB_ShareManager({
			root,
			catalogClient,
			productSelection,
			buildState,
			renderer,
			productRegistry,
			currentBuild,
			guestBuildManager,
			accountBuildManager,
			persistence
		});
		window.TGB_ShareManager.instance = shareManager;
		window.TGB.shareManager = shareManager;

		// Initialize Guest Multi-Build Session Manager (Part 4)
		guestBuildManager.init({
			root,
			catalogClient,
			productSelection,
			buildState,
			renderer,
			productRegistry,
			currentBuild,
			persistence
		});

		// Initialize Account Build Manager (Part 5)
		accountBuildManager.init();

		// Initialize Share Manager (Part 6)
		shareManager.init();

		// 1. Deep Link vs Share vs Persistence Restoration Precedence (Section 14, Parts 4, 5 & 6)
		const urlParams = new URLSearchParams(window.location.search);
		const hasShareDeepLink = urlParams.has('tgb_share') && urlParams.get('tgb_share').trim() !== '';
		const shareToken = hasShareDeepLink ? urlParams.get('tgb_share').trim() : '';

		const hasSavedBuildDeepLink = urlParams.has('saved_build_id') && urlParams.get('saved_build_id').trim() !== '';
		const savedBuildId = hasSavedBuildDeepLink ? parseInt(urlParams.get('saved_build_id'), 10) : 0;

		const hasDeepLink = urlParams.has('product_id') && urlParams.get('product_id').trim() !== '';
		const deepLinkId = hasDeepLink ? parseInt(urlParams.get('product_id'), 10) : 0;

		if (hasShareDeepLink && shareToken !== '') {
			// Shared read-only build takes top precedence for visitors opening a share link
			try {
				await shareManager.loadSharedBuild(shareToken);
			} catch (err) {
				console.warn('[TGB ShareManager] Share link load failed safely:', err);
			}
		} else if (hasSavedBuildDeepLink && savedBuildId > 0 && accountBuildManager.isLoggedIn) {
			// Account saved build takes top precedence for logged-in users
			try {
				await accountBuildManager.loadSavedBuildById(savedBuildId);
				try {
					window.history.replaceState({}, document.title, window.location.pathname);
				} catch (e) {}
			} catch (err) {
				console.warn('[TGB AccountBuildManager] Deep link load failed safely:', err);
			}
		} else if (hasDeepLink && deepLinkId > 0) {
			// Explicit deep link takes precedence over stored session persistence
			if (initialPayload && initialPayload.status === 'ready' && initialPayload.product) {
				const active = guestBuildManager.getActiveBuild();
				if (active) {
					active.baseProductId = deepLinkId;
					active.rails = [];
					active.parts = [];
					guestBuildManager.saveWorkspace();
				}
				try {
					window.history.replaceState({}, document.title, window.location.pathname);
				} catch (e) {}
			}
		} else if (!hasDeepLink) {
			// Normal builder page load: restore active draft from session workspace
			try {
				const active = guestBuildManager.getActiveBuild();
				if (active && active.baseProductId) {
					const restoreRes = await persistence.restoreBuild(catalogClient, productSelection, buildState, renderer, productRegistry, active);
					if (restoreRes && restoreRes.restored) {
						if (restoreRes.partial && restoreRes.message) {
							productSelection.showNotice(restoreRes.message, 'warning');
							currentBuild.announce(restoreRes.message);
						} else {
							currentBuild.announce('Your previous build was restored.');
						}
					} else if (restoreRes && restoreRes.message) {
						productSelection.showNotice(restoreRes.message, 'error');
						currentBuild.announce(restoreRes.message);
					}
				}
			} catch (err) {
				console.warn('[TGB GuestBuildManager] Restore failed safely:', err);
			}
		}

		// 2. Wire Auto-Persistence Subscription (Section 12 & Part 4)
		buildState.subscribe((event) => {
			if (!event || persistence.isRestoring || guestBuildManager.isSwitching || (shareManager && shareManager.isReadOnly)) return;
			try {
				switch (event.type) {
					case 'base_gun_set':
					case 'part_added':
					case 'part_removed':
					case 'rail_added':
					case 'rail_removed':
					case 'drag_ended':
						guestBuildManager.updateActiveBuildFromState(buildState);
						try {
							if (window.location.search.includes('product_id')) {
								window.history.replaceState({}, document.title, window.location.pathname);
							}
						} catch (e) {}
						break;
					case 'part_moved':
					case 'rail_moved':
						guestBuildManager.updateActiveBuildFromStateDebounced(buildState, 250);
						break;
				}
			} catch (err) {
				console.warn('[TGB GuestBuildManager] Auto-persist error suppressed:', err);
			}
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initGunBuilder);
	} else {
		initGunBuilder();
	}

})(window, document);
