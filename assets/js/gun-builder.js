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
		addPart(product, initialX = 0, initialY = 0, zIndex = null) {
			if (!product) {
				return null;
			}

			const geometry = calculateProductGeometry(product);
			const instanceId = this._generateInstanceId();
			const partZIndex = typeof zIndex === 'number' ? zIndex : this.nextZIndex++;

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
			if (!product.builder_image || !product.builder_image.url) {
				this.showInvalidState('Weapon image is not available.');
				return;
			}

			this.showLoadingState();

			// Preload image
			const preloader = new Image();
			preloader.src = product.builder_image.url;

			preloader.onload = () => {
				this.hideAllStates();
				this.mountBaseGun(product);
			};

			preloader.onerror = () => {
				this.showErrorState();
			};
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
				});
			}

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

			this.activeDrag = null;
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
	// 5. PRODUCT SELECTION CONTROLLER (Part 6)
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
			this.activeCategoryKey = 'base_gun';
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
				this.productRegistry.set(currentBase.productId, {
					id: currentBase.productId,
					name: currentBase.name,
					role: 'base_gun',
					reference_mm: currentBase.reference_mm,
					builder_image: currentBase.builder_image,
				});
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
		}

		/**
		 * Switches to a category (with in-memory cache and request cancellation).
		 *
		 * @param {string|number} categoryKey
		 * @param {boolean} [forceRefresh=false]
		 */
		async switchCategory(categoryKey, forceRefresh = false) {
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
				// Part Button
				const hasBase = Boolean(currentBase);
				const inStock = !product.stock || product.stock.in_stock !== false;

				if (!inStock) {
					btn.className += ' tgb-btn--unavailable is-unavailable';
					btn.textContent = 'Unavailable';
					btn.disabled = true;
				} else if (!hasBase) {
					btn.className += ' tgb-btn--add';
					btn.textContent = 'Add';
					btn.disabled = true;
					btn.title = 'Choose a base platform first.';
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
		 * Adds a Part to the build at a neutral centered position.
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

			// Store in registry
			this.productRegistry.set(product.id, product);

			// Neutral Center Placement (Requirement 28):
			// x = (stageWidth - partWidth) / 2, y = (stageHeight - partHeight) / 2
			const stage = this.renderer.currentStageGeometry || { stageWidth: 1000, stageHeight: 600 };
			const geo = calculateProductGeometry(product);

			let spawnX = Math.round((stage.stageWidth - geo.logicalWidth) / 2);
			let spawnY = Math.round((stage.stageHeight - geo.logicalHeight) / 2);

			// Boundary Clamping
			spawnX = Math.max(0, Math.min(spawnX, Math.round(stage.stageWidth - geo.logicalWidth)));
			spawnY = Math.max(0, Math.min(spawnY, Math.round(stage.stageHeight - geo.logicalHeight)));

			// Add to authoritative Build State (Part 5)
			const partInstance = this.buildState.addPart(product, spawnX, spawnY);

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
					// Part button
					const inStock = !product.stock || product.stock.in_stock !== false;
					if (!inStock) {
						btn.className = 'tgb-btn tgb-btn--unavailable is-unavailable';
						btn.textContent = 'Unavailable';
						btn.disabled = true;
					} else if (!hasBase) {
						btn.className = 'tgb-btn tgb-btn--add';
						btn.textContent = 'Add';
						btn.disabled = true;
						btn.title = 'Choose a base platform first.';
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
		 * Updates sidebar Current Build summary panel.
		 */
		syncSidebar() {
			if (!this.sidebarCountEl || !this.sidebarBodyEl) return;

			const currentBase = this.buildState.getBaseGun();
			const partsCount = (this.buildState.parts || []).length;

			if (!currentBase) {
				this.sidebarCountEl.textContent = '0 Items';
				this.sidebarBodyEl.textContent = '';
				const notice = document.createElement('div');
				notice.className = 'tgb-placeholder-notice';
				const p = document.createElement('p');
				p.textContent = 'Select a base platform below to begin customizing your build.';
				notice.appendChild(p);
				this.sidebarBodyEl.appendChild(notice);
			} else {
				if (partsCount === 0) {
					this.sidebarCountEl.textContent = '1 Weapon';
				} else if (partsCount === 1) {
					this.sidebarCountEl.textContent = '1 Weapon • 1 Component';
				} else {
					this.sidebarCountEl.textContent = `1 Weapon • ${partsCount} Components`;
				}

				this.sidebarBodyEl.textContent = '';
				const card = document.createElement('div');
				card.className = 'tgb-current-base-card';

				const tag = document.createElement('div');
				tag.className = 'tgb-card-tag';
				tag.textContent = 'Base Platform';
				card.appendChild(tag);

				const title = document.createElement('h3');
				title.className = 'tgb-card-title';
				title.textContent = currentBase.name;
				card.appendChild(title);

				const specs = document.createElement('div');
				specs.className = 'tgb-card-specs';
				const specItem = document.createElement('span');
				specItem.className = 'tgb-spec-item';

				const specLabel = document.createElement('span');
				specLabel.className = 'tgb-spec-label';
				specLabel.textContent = 'Length: ';
				specItem.appendChild(specLabel);

				const specVal = document.createElement('span');
				specVal.className = 'tgb-spec-value';
				specVal.textContent = `${currentBase.reference_mm} mm`;
				specItem.appendChild(specVal);

				specs.appendChild(specItem);
				card.appendChild(specs);

				this.sidebarBodyEl.appendChild(card);
			}
		}

		/**
		 * Handles Build State notifications.
		 */
		handleStateChange() {
			this.syncAllCardButtons();
			this.syncSidebar();
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
	}

	// =========================================================================
	// 6. API EXPORTS & NAMESPACE (Section 41 & Part 6)
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

	// Unified TGB namespace for all builder subsystems
	window.TGB = {
		BuildState: TGB_BuildState,
		Renderer: TGB_Renderer,
		Interactions: TGB_Interactions,
		Catalog: window.TGB_Catalog,
		state: null,
		renderer: null,
		interactions: null,
		catalog: null,
		selection: null,
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
		getState: function() {
			if (window.TGB.state) {
				return window.TGB.state.getState();
			}
			return null;
		},
		reset: function() {
			if (window.TGB.state) {
				window.TGB.state.reset();
			}
		},
	};

	/**
	 * Bootstraps the Gun Builder frontend shell, Build State, Renderer, Interactions, and Catalog.
	 */
	function initGunBuilder() {
		const root = document.getElementById('taktik-gun-builder');
		if (!root) {
			return;
		}

		if (root.classList.contains('tgb-ready')) {
			return;
		}

		root.classList.add('tgb-ready');

		const buildState = new TGB_BuildState();
		const renderer = new TGB_Renderer(root, buildState);
		renderer.init();

		const interactions = new TGB_Interactions(renderer, buildState);
		interactions.init();
		renderer.setInteractions(interactions);

		const catalogClient = new TGB_CatalogClient();
		const productSelection = new TGB_ProductSelection(root, catalogClient, buildState, renderer, productRegistry);
		productSelection.init();

		// Wire up global references
		window.TGB_BuildState.instance = buildState;
		window.TGB_Renderer.instance = renderer;
		window.TGB_Interactions.instance = interactions;
		window.TGB_Catalog.client = catalogClient;
		window.TGB_Catalog.selection = productSelection;

		window.TGB.state = buildState;
		window.TGB.renderer = renderer;
		window.TGB.interactions = interactions;
		window.TGB.catalog = catalogClient;
		window.TGB.selection = productSelection;
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initGunBuilder);
	} else {
		initGunBuilder();
	}

})(window, document);
