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
		img.src = product.builder_image.url;
		img.alt = product.builder_image.alt || product.name || '';
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
		 * Retrieves the Base Gun state entry.
		 *
		 * @return {Object|null}
		 */
		getBaseGun() {
			return this.baseGun ? Object.assign({}, this.baseGun) : null;
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
				parts: this.parts.map(p => Object.assign({}, p)),
			};
		}

		/**
		 * Resets the build: clears all parts while preserving the Base Gun.
		 */
		reset() {
			this.parts = [];
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
		 * @return {string}
		 */
		_generateInstanceId() {
			if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
				return 'part-' + crypto.randomUUID();
			}
			return 'part-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
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

				case 'reset':
				case 'build_reset':
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

			this.layers = this.layers.filter(l => l.layerRole === 'base');
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

			// Must be on a draggable Part layer (NOT on Base Gun)
			const target = e.target.closest('.tgb-layer--part');
			if (!target) {
				return;
			}

			const instanceId = target.dataset.tgbInstanceId;
			if (!instanceId) {
				return;
			}

			const part = this.buildState.getPart(instanceId);
			if (!part) {
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
				element: target,
				startClientX: e.clientX,
				startClientY: e.clientY,
				startLogicalX: part.x,
				startLogicalY: part.y,
				partWidth: part.width,
				partHeight: part.height,
				displayScale: displayScale,
				latestClientX: e.clientX,
				latestClientY: e.clientY,
				rafId: null,
			};

			target.classList.add('is-dragging');

			target.addEventListener('pointermove', this.boundPointerMove);
			target.addEventListener('pointerup', this.boundPointerUp);
			target.addEventListener('pointercancel', this.boundPointerCancel);

			this.updateDebugHUD(instanceId, part.x, part.y, displayScale);
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
					this.buildState.updatePartPosition(this.activeDrag.instanceId, clampedX, clampedY);

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
		 * Fetches paginated Parts for a specific Part Type.
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
		 * Evaluates compatibility status between a Base Gun and a Part product.
		 *
		 * @param {Object} baseProduct Normalized Base Gun product.
		 * @param {Object} partProduct Normalized Part product.
		 * @return {'compatible'|'incompatible'|'unconfigured'}
		 */
		getCompatibility(baseProduct, partProduct) {
			if (!baseProduct || !partProduct) {
				return 'unconfigured';
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

			const baseInterfaceIds = basePoints
				.map(pt => pt.interface && pt.interface.id)
				.filter(id => typeof id === 'number' && id > 0);

			const partInterfaceIds = partInterfaces
				.map(iface => iface.id)
				.filter(id => typeof id === 'number' && id > 0);

			const hasIntersection = partInterfaceIds.some(id => baseInterfaceIds.includes(id));

			return hasIntersection ? 'compatible' : 'incompatible';
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
			this.statusEl = root.querySelector('#tgb-tray-status');
			this.loadingEl = root.querySelector('#tgb-catalog-loading');
			this.gridEl = root.querySelector('#tgb-catalog-grid');
			this.actionsEl = root.querySelector('#tgb-catalog-actions');
			this.loadMoreBtn = root.querySelector('#tgb-load-more-btn');

			// Sidebar elements
			this.sidebarCountEl = root.querySelector('#tgb-sidebar-build-count');
			this.sidebarBodyEl = root.querySelector('#tgb-sidebar-build-body');

			this.categories = []; // [{ id: 'base_gun', name: 'Base Platform' }, ...]
			this.activeCategoryKey = '2661';
			this.activeCategoryId = 120;

			this.categoryCache = new Map(); // key => { items: [], has_more: false, next_cursor: null, loaded: false }

			this.activeAbortController = null;
			this.requestId = 0;

			this.boundHandleTabClick = this.handleTabClick.bind(this);
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

			// 1. Setup Base Platform tab
			this.categories = [
				{ id: 'base_gun', name: 'Base Platform', slug: 'base-platform' }
			];

			// 2. Fetch dynamic part types from API
			try {
				const partTypes = await this.catalog.getPartTypes();
				if (Array.isArray(partTypes)) {
					// Dynamic terms from taxonomy
					partTypes.forEach(t => {
						this.categories.push({
							id: t.id,
							name: t.name,
							slug: t.slug,
						});
					});
				}
			} catch (err) {
				console.warn('[TGB] Failed to fetch part types, proceeding with base platform:', err);
			}

			// 3. Render Navigation Tabs
			this.renderCategoryNav();

			// 4. Attach Event Listeners
			this.navEl.addEventListener('click', this.boundHandleTabClick);
			this.gridEl.addEventListener('click', this.boundHandleGridClick);
			if (this.loadMoreBtn) {
				this.loadMoreBtn.addEventListener('click', this.boundHandleLoadMore);
			}

			// 5. Subscribe to Build State
			this.buildState.subscribe(this.boundStateChange);

			// 6. Pre-seed registry from initial render Base Gun if present
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

			// 7. Load default category (Base Platform)
			await this.switchCategory('base_gun');

			// 8. Initial sync with current build state
			this.syncSidebar();
		}

		/**
		 * Renders the category navigation tab buttons.
		 */
		renderCategoryNav() {
			this.navEl.textContent = '';
			this.categories.forEach(cat => {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'tgb-category-btn' + (cat.id === this.activeCategoryKey ? ' is-active' : '');
				btn.setAttribute('role', 'tab');
				btn.setAttribute('aria-selected', cat.id === this.activeCategoryKey ? 'true' : 'false');
				btn.setAttribute('data-category-key', String(cat.id));
				btn.textContent = cat.name;
				this.navEl.appendChild(btn);
			});
			let search_bar  = document.getElementById('tgb-search-bar');

			search_bar.addEventListener('change', async (e) => {
				this.gridEl.textContent = '';
				this.showLoading();
			let data = await fetch(`http://localhost:10003/wp-json/tgb/v1/parts/search?type_id=${this.activeCategoryKey}&q=${search_bar.value}&limit=100`)
			.then(response => response.json())
			this.hideLoading();
			this.renderProducts(data.items)
			
		})
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
			const tabs = this.navEl.querySelectorAll('.tgb-category-btn');
			tabs.forEach(tab => {
				const isCurrent = tab.getAttribute('data-category-key') === String(categoryKey);
				tab.classList.toggle('is-active', isCurrent);
				tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
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
			this.gridEl.textContent = '';
			if (this.actionsEl) {
				this.actionsEl.style.display = 'none';
			}

			try {
				let res;
				if (categoryKey === 'base_gun') {
					res = await this.catalog.getBaseGuns(20, '', controller.signal);
				} else {
					res = await this.catalog.getPartsByType(Number(categoryKey), 20, '', controller.signal);
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
			const cache = this.categoryCache.get(this.activeCategoryKey);
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
				if (this.activeCategoryKey === 'base_gun') {
					res = await this.catalog.getBaseGuns(20, cache.next_cursor, controller.signal);
				} else {
					res = await this.catalog.getPartsByType(Number(this.activeCategoryKey), 20, cache.next_cursor, controller.signal);
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
		 * Renders a full list of product cards.
		 *
		 * @param {Array} items
		 */
		renderProducts(items) {
			this.gridEl.textContent = '';
			if (!items || items.length === 0) {
				this.showStatus('No builder-ready products are available in this category.', false);
				return;
			}

			items.forEach(product => {
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
			const card = document.createElement('div');
			card.className = 'tgb-product-card';
			card.setAttribute('data-product-id', String(product.id));

			const isBaseGun = product.role === 'base_gun';
			const currentBase = this.buildState.getBaseGun();
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

			// Compatibility Badge (Part 7)
			if (!isBaseGun) {
				const compatBadge = document.createElement('span');
				compatBadge.className = 'tgb-card-compat-badge';
				compatBadge.setAttribute('data-compat-product', String(product.id));

				const baseProduct = currentBase ? this.productRegistry.get(currentBase.productId) : null;
				if (baseProduct) {
					const compatStatus = TGB_Mounting.getCompatibility(baseProduct, product);
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

			// Action Button
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'tgb-btn';
			btn.setAttribute('data-action', isBaseGun ? 'select-base' : 'add-part');
			btn.setAttribute('data-product-id', String(product.id));

			if (isBaseGun) {
				if (isCurrentBaseSelected) {
					btn.className += ' tgb-btn--selected is-selected';
					btn.textContent = 'Selected';
					btn.disabled = true;
				} else {
					btn.className += ' tgb-btn--select';
					btn.textContent = 'Select';
				}
			} else {
				// Part Button (Part 7: Compatibility + Inventory Priority)
				const hasBase = Boolean(currentBase);
				const baseProduct = hasBase ? this.productRegistry.get(currentBase.productId) : null;
				const inStock = !product.stock || product.stock.in_stock !== false;
				const compatStatus = baseProduct ? TGB_Mounting.getCompatibility(baseProduct, product) : null;

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
					if (compatStatus === 'incompatible') {
						btn.className += ' tgb-btn--incompatible is-incompatible';
						btn.title = 'Not compatible with selected platform.';
					} else {
						btn.className += ' tgb-btn--unconfigured is-unconfigured';
						btn.title = 'Mount information unavailable.';
					}
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
			return parts.filter(p => p.productId === productId).length;
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
		 * Handles card action clicks (Select Base Gun or Add Part).
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
			}
		}

		/**
		 * Selects a Base Gun, recovering the builder if empty or invalid,
		 * and clearing existing parts if replacing an already-mounted weapon.
		 *
		 * @param {Object} product Normalized Base Gun product.
		 */
		selectBaseGun(product) {
			if (!product || product.role !== 'base_gun') {
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
				this.showStatus('Choose a base platform first.', false);
				return;
			}

			if (product.stock && product.stock.in_stock === false) {
				return;
			}

			const baseProduct = this.productRegistry.get(currentBase.productId);
			const compatStatus = TGB_Mounting.getCompatibility(baseProduct, product);
			if (compatStatus !== 'compatible') {
				this.showStatus('This component is not compatible with the selected platform.', false);
				return;
			}

			// Store in registry
			this.productRegistry.set(product.id, product);

			// Lower-Left Staging Spawn (Part 12 non-overlapping placement):
			const stage = this.renderer.currentStageGeometry || { stageWidth: 1000, stageHeight: 600, baseX: 0, baseY: 0 };
			const geo = calculateProductGeometry(product);
			const existingParts = (this.buildState.parts) || [];
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
		 * Synchronizes card action buttons and in-build counts across the active grid.
		 */
		syncAllCardButtons() {
			const currentBase = this.buildState.getBaseGun();
			const hasBase = Boolean(currentBase);

			const cards = this.gridEl.querySelectorAll('.tgb-product-card');
			cards.forEach(card => {
				const productId = parseInt(card.getAttribute('data-product-id'), 10);
				const product = this.productRegistry.get(productId);
				if (!product) return;

				const isBaseGun = product.role === 'base_gun';
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
				} else {
					// Part button & compatibility badge (Part 7)
					const compatBadge = card.querySelector('.tgb-card-compat-badge');
					const baseProduct = hasBase ? this.productRegistry.get(currentBase.productId) : null;
					const inStock = !product.stock || product.stock.in_stock !== false;
					const compatStatus = baseProduct ? TGB_Mounting.getCompatibility(baseProduct, product) : null;

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

			const state = this.buildState.getState();
			const baseGun = state.baseGun;

			if (!baseGun || !baseGun.productId) {
				return { success: false, message: 'Choose a base platform before adding to cart.' };
			}

			// Unique request ID per submission attempt (Requirement 33 & 77)
			this.currentRequestId = 'req-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
			this.isSubmitting = true;

			// Minimal payload strictly from Build State (Requirement 7 & 67)
			const parts = (state.parts || []).map(p => ({
				product_id: p.productId,
				instance_id: p.instanceId || ''
			}));

			const payload = {
				base_product_id: baseGun.productId,
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
			// Remove part button
			const removeBtn = event.target.closest('.tgb-build-item-remove');
			if (removeBtn) {
				const instanceId = removeBtn.getAttribute('data-instance-id');
				if (!instanceId) return;

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
					this.countEl.textContent = '0 Items';
				} else if (summary.componentCount === 0) {
					this.countEl.textContent = '1 Weapon';
				} else if (summary.componentCount === 1) {
					this.countEl.textContent = '1 Weapon • 1 Component';
				} else {
					this.countEl.textContent = `1 Weapon • ${summary.componentCount} Components`;
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
					removeBtn.setAttribute('aria-label', `Remove ${item.instance.name} from build`);
					removeBtn.title = 'Remove component';
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

			if (!summary.hasBase) {
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
		 * Stores: version, timestamp, baseProductId, parts [{ instanceId, productId, x, y, zIndex }]
		 * Does NOT store: prices, weights, stock, image URLs, mount interfaces, subtotal, total weight.
		 * Maximum 30 parts persisted.
		 *
		 * @param {TGB_BuildState} buildState
		 */
		save(buildState) {
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
		 * @return {Promise<{restored: boolean, partial?: boolean, message?: string}>}
		 */
		async restoreBuild(catalogClient, productSelection, buildState, renderer, productRegistry) {
			const persisted = this.load();
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
					this.clear();
					renderer.showEmptyState();
					return {
						restored: false,
						reason: 'base_unavailable',
						message: 'Your previous build could not be restored because the base platform is no longer available.'
					};
				}

				// Preload image and mount Base Gun
				await renderer.loadAndRenderBaseGun(baseProduct);

				// 2. Resolve and validate Parts
				const persistedParts = Array.isArray(persisted.parts) ? persisted.parts : [];
				if (persistedParts.length === 0) {
					productSelection.syncAllCardButtons();
					productSelection.syncSidebar();
					return { restored: true, partial: false, baseGun: baseProduct, restoredPartsCount: 0, removedPartsCount: 0 };
				}

				// Ensure all Part Types and Parts are loaded into registry
				const neededProductIds = [...new Set(persistedParts.map(p => p.productId))];
				const missingFromRegistry = neededProductIds.some(id => !productRegistry.has(id));

				if (missingFromRegistry) {
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
											productSelection.categoryCache.set(String(t.id), {
												items: res.items,
												has_more: Boolean(res.has_more),
												next_cursor: res.next_cursor || null,
												loaded: true
											});
										}
									} catch (err) {}
								})
							);
						}
					} catch (err) {}
				}
				let restoredCount = 0;
				let removedCount = 0;

				for (const partEntry of persistedParts) {
					const product = productRegistry.get(partEntry.productId);

					// Validate Part existence, role, builder image, and compatibility
					const isValidPart = product &&
						product.role === 'part' &&
						product.builder_image &&
						product.builder_image.url &&
						TGB_Mounting.getCompatibility(baseProduct, product) === 'compatible';

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

				productSelection.syncAllCardButtons();
				productSelection.syncSidebar();

				// Save clean normalized final state at end of successful restore (Section 4)
				this.isRestoring = false;
				this.save(buildState);

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
		state: null,
		renderer: null,
		interactions: null,
		catalog: null,
		selection: null,
		currentBuild: null,
		cart: null,
		persistence: null,
		registry: productRegistry,
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
			if (window.TGB.currentBuild) {
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

	/**
	 * Bootstraps the Gun Builder frontend shell, Build State, Renderer, Interactions, and Catalog.
	 */
	async function initGunBuilder() {
		const root = document.getElementById('taktik-gun-builder');
		if (!root) {
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

		// Wire up global references
		window.TGB_BuildState.instance = buildState;
		window.TGB_Renderer.instance = renderer;
		window.TGB_Interactions.instance = interactions;
		window.TGB_Catalog.client = catalogClient;
		window.TGB_Catalog.selection = productSelection;
		window.TGB_CurrentBuild.instance = currentBuild;
		window.TGB_Cart.instance = currentBuild.cartClient;
		window.TGB_Persistence.instance = persistence;

		window.TGB.state = buildState;
		window.TGB.renderer = renderer;
		window.TGB.interactions = interactions;
		window.TGB.catalog = catalogClient;
		window.TGB.selection = productSelection;
		window.TGB.currentBuild = currentBuild;
		window.TGB.cart = currentBuild.cartClient;
		window.TGB.persistence = persistence;

		// 1. Deep Link vs Persistence Restoration Precedence (Section 14 & Test I)
		const urlParams = new URLSearchParams(window.location.search);
		const hasDeepLink = urlParams.has('product_id') && urlParams.get('product_id').trim() !== '';
		const deepLinkId = hasDeepLink ? parseInt(urlParams.get('product_id'), 10) : 0;

		if (hasDeepLink && deepLinkId > 0) {
			// Explicit deep link takes precedence over stored local persistence (Rule B & Test I)
			if (initialPayload && initialPayload.status === 'ready' && initialPayload.product) {
				persistence.saveBaseOnly(deepLinkId);
				try {
					window.history.replaceState({}, document.title, window.location.pathname);
				} catch (e) {}
			}
		} else if (!hasDeepLink) {
			// Normal builder page load: restore persisted build if present (Rule A & Test A)
			try {
				const persisted = persistence.load();
				if (persisted) {
					const restoreRes = await persistence.restoreBuild(catalogClient, productSelection, buildState, renderer, productRegistry);
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
				console.warn('[TGB Persistence] Restore failed safely:', err);
			}
		}

		// 2. Wire Auto-Persistence Subscription (Section 12)
		buildState.subscribe((event) => {
			if (!event || persistence.isRestoring) return;
			try {
				switch (event.type) {
					case 'base_gun_set':
					case 'part_added':
					case 'part_removed':
					case 'drag_ended':
						persistence.save(buildState);
						try {
							if (window.location.search.includes('product_id')) {
								window.history.replaceState({}, document.title, window.location.pathname);
							}
						} catch (e) {}
						break;
					case 'part_moved':
						persistence.saveDebounced(buildState, 250);
						break;
				}
			} catch (err) {
				console.warn('[TGB Persistence] Auto-persist error suppressed:', err);
			}
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initGunBuilder);
	} else {
		initGunBuilder();
	}

})(window, document);


document.querySelectorAll('.tgb-toggle').forEach((btn) => {
	btn.addEventListener('click', () => {
		const on = btn.getAttribute('aria-checked') !== 'true';
		btn.setAttribute('aria-checked', String(on));
		btn.querySelector('.tgb-toggle__state').textContent = on ? 'ON' : 'OFF';
		btn.dispatchEvent(new CustomEvent('tgb:toggle', { bubbles: true, detail: { checked: on } }));

		if(on){
			let incompatibleCards = document.querySelectorAll('.tgb-card-compat-badge--incompatible');
			incompatibleCards.forEach(card => {
				console.log(card.closest('.tgb-product-card'));
				card.closest('.tgb-product-card').style.display = 'none';
			});
		}else{
			let incompatibleCards = document.querySelectorAll('.tgb-card-compat-badge--incompatible');
			incompatibleCards.forEach(card => {
				card.closest('.tgb-product-card').style.display = 'flex';
			});
		}
	});
});