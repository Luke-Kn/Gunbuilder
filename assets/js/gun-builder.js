/**
 * Taktik Gun Builder - Canonical 2D Layered DOM Renderer (Part 4)
 *
 * Implements:
 * 1. Canonical Coordinate System: 1 mm = 1 logical pixel
 * 2. Logical Product Geometry (aspect ratio preserved from WooCommerce Gallery image)
 * 3. Logical Stage Geometry & Centered Base Gun Placement
 * 4. Whole-Stage Responsive Display Scale System (displayScale = min(1, viewportWidth / stageWidth))
 * 5. Generic Layered DOM Image Layer Creation (ready for future Part mounting)
 * 6. ResizeObserver Responsive Recalculation
 * 7. Clean Image Preloading, Empty State, Invalid Product, and Error State Handling
 */

(function(window, document) {
	'use strict';

	/**
	 * Canonical Scale Constants (Section 4 & 17)
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

		// Center Base Gun inside logical workspace (Section 18)
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
	 * @param {string} layerRole Role identifier (e.g. 'base', 'optic', 'part').
	 * @param {number} zIndex Layer stacking order.
	 * @return {HTMLImageElement} Positioned image element.
	 */
	function createLayerElement(product, x, y, layerRole = 'base', zIndex = 10) {
		const geometry = calculateProductGeometry(product);
		const img = document.createElement('img');

		const cleanRole = String(layerRole).toLowerCase().replace(/[^a-z0-9_-]/g, '');
		img.className = 'tgb-layer tgb-layer--' + cleanRole;
		img.src = product.builder_image.url;
		img.alt = product.builder_image.alt || product.name || '';
		img.draggable = false; // Prevent ghost drag (Section 48)

		// Store explicit canonical logical geometry in data attributes (Section 19)
		img.dataset.tgbX = String(x);
		img.dataset.tgbY = String(y);
		img.dataset.tgbWidth = String(geometry.logicalWidth);
		img.dataset.tgbHeight = String(geometry.logicalHeight);
		img.dataset.productId = String(product.id);
		img.dataset.layerRole = cleanRole;

		// Apply logical absolute coordinates
		img.style.position = 'absolute';
		img.style.left = x + 'px';
		img.style.top = y + 'px';
		img.style.width = geometry.logicalWidth + 'px';
		img.style.height = geometry.logicalHeight + 'px';
		img.style.zIndex = String(zIndex);

		return img;
	}

	/**
	 * TGB Renderer Controller
	 */
	class TGB_Renderer {
		constructor(rootEl) {
			this.root = rootEl;
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
			this.initialized = false;
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

			// Preload image (Section 33)
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

			// 3. Clear existing layers
			this.clearLayers();

			// 4. Mount Base Gun Layer
			const baseLayer = this.renderLayer(
				product,
				this.currentStageGeometry.baseX,
				this.currentStageGeometry.baseY,
				'base',
				10
			);

			// 5. Reveal Frame
			this.frameEl.style.display = 'block';

			// 6. Calculate & Apply Display Scale
			this.updateDisplayScale(this.viewportEl.clientWidth);

			// 7. Setup ResizeObserver (Section 24)
			this.setupResizeObserver();
		}

		/**
		 * Renders and appends a product layer inside the logical stage.
		 *
		 * @param {Object} product
		 * @param {number} x Logical X.
		 * @param {number} y Logical Y.
		 * @param {string} layerRole Layer role identifier.
		 * @param {number} zIndex Stacking order.
		 * @return {HTMLImageElement}
		 */
		renderLayer(product, x, y, layerRole = 'base', zIndex = 10) {
			const layerEl = createLayerElement(product, x, y, layerRole, zIndex);
			this.stageEl.appendChild(layerEl);
			this.layers.push({
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
				this.resizeObserver = new ResizeObserver((entries) => {
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
		}
	}

	// Expose utilities on window for verification & future stages
	window.TGB_Renderer = {
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

	/**
	 * Bootstraps the Gun Builder frontend shell and renderer.
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

		const renderer = new TGB_Renderer(root);
		renderer.init();
		window.TGB_Renderer.instance = renderer;
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initGunBuilder);
	} else {
		initGunBuilder();
	}

})(window, document);
