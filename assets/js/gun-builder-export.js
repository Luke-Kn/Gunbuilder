/**
 * Taktik Gun Builder - Part 7 High-Quality PNG Export & Specification Sheet
 *
 * Implements:
 * 1. Client-side HTML5 Canvas compositing from authoritative build state.
 * 2. Exact preservation of logical geometry, physical scale, and component positions.
 * 3. Dynamic bounding box calculation including overhanging muzzle devices and optics.
 * 4. Transparent (alpha channel) and solid white background options.
 * 5. Resolution scaling: Standard (1×), High (2× default), Maximum (3×).
 * 6. Visual stacking preservation (Base Gun z=10, Rails/Parts sorted by z-index).
 * 7. Memory and dimension safety guards preventing browser canvas crashes.
 * 8. Sanitized file naming (taktik-{build-name}.png).
 * 9. CORS and image-load verification preventing blank exports.
 * 10. Printable Bill of Materials (BOM) specification sheet.
 *
 * @package TaktikGunBuilder
 */

(function(window, document) {
	'use strict';

	const PADDING_PX = 30; // Logical pixels margin around complete weapon composition
	const MAX_DIMENSION_PX = 8192; // Safe browser canvas dimension limit
	const MAX_AREA_PX = 25000000; // 25 Megapixels (iOS / mobile canvas memory limit)

	const QUALITY_SCALES = {
		standard: 1.0,
		high: 2.0,
		maximum: 3.0,
	};

	/**
	 * Class TGB_ExportManager
	 *
	 * Manages the Download PNG dialog, client-side canvas composition, and file download.
	 */
	class TGB_ExportManager {
		/**
		 * Constructor.
		 *
		 * @param {Object} options Configuration dependencies.
		 */
		constructor(options = {}) {
			this.root = options.root || document.getElementById('taktik-gun-builder');
			this.buildState = options.buildState || null;
			this.renderer = options.renderer || null;
			this.guestBuildManager = options.guestBuildManager || null;
			this.accountBuildManager = options.accountBuildManager || null;
			this.shareManager = options.shareManager || null;
			this.currentBuild = options.currentBuild || null;

			// Dialog DOM Elements
			this.modalEl = null;
			this.triggerBtn = null;
			this.closeBtn = null;
			this.cancelBtn = null;
			this.downloadBtn = null;
			this.downloadBtnLabel = null;
			this.printSpecBtn = null;
			this.feedbackEl = null;
			this.buildNameEl = null;
			this.buildMetaEl = null;
			this.dimsStandardEl = null;
			this.dimsHighEl = null;
			this.dimsMaxEl = null;

			this.isExporting = false;
			this.currentSnapshot = null;
			this.currentComposition = null;
		}

		/**
		 * Initializes export manager and attaches DOM listeners.
		 */
		init() {
			if (!this.root) {
				return;
			}

			this.modalEl = document.getElementById('tgb-export-modal');
			this.triggerBtn = document.getElementById('tgb-btn-export-png');
			this.closeBtn = document.getElementById('tgb-export-modal-close');
			this.cancelBtn = document.getElementById('tgb-export-btn-cancel');
			this.downloadBtn = document.getElementById('tgb-export-btn-download');
			this.downloadBtnLabel = document.getElementById('tgb-export-btn-label');
			this.printSpecBtn = document.getElementById('tgb-btn-print-spec');
			this.feedbackEl = document.getElementById('tgb-export-feedback');
			this.buildNameEl = document.getElementById('tgb-export-build-name');
			this.buildMetaEl = document.getElementById('tgb-export-build-meta');
			this.dimsStandardEl = document.getElementById('tgb-export-dims-standard');
			this.dimsHighEl = document.getElementById('tgb-export-dims-high');
			this.dimsMaxEl = document.getElementById('tgb-export-dims-max');

			if (this.triggerBtn) {
				this.triggerBtn.addEventListener('click', (e) => {
					e.preventDefault();
					this.openDialog();
				});
			}

			if (this.closeBtn) {
				this.closeBtn.addEventListener('click', (e) => {
					e.preventDefault();
					this.closeDialog();
				});
			}

			if (this.cancelBtn) {
				this.cancelBtn.addEventListener('click', (e) => {
					e.preventDefault();
					this.closeDialog();
				});
			}

			if (this.downloadBtn) {
				this.downloadBtn.addEventListener('click', (e) => {
					e.preventDefault();
					this.handleDownloadClick();
				});
			}

			if (this.printSpecBtn) {
				this.printSpecBtn.addEventListener('click', (e) => {
					e.preventDefault();
					this.handlePrintSpecClick();
				});
			}

			// Backdrop click to close
			if (this.modalEl) {
				this.modalEl.addEventListener('click', (e) => {
					if (e.target === this.modalEl) {
						this.closeDialog();
					}
				});
			}

			// Escape key to close
			document.addEventListener('keydown', (e) => {
				if (e.key === 'Escape' && this.modalEl && this.modalEl.style.display !== 'none') {
					this.closeDialog();
				}
			});

			// Update toolbar button state on initial load
			this.syncTriggerButtonState();

			// Subscribe to build state changes to update button enabled/disabled state
			if (this.buildState && typeof this.buildState.subscribe === 'function') {
				this.buildState.subscribe(() => {
					this.syncTriggerButtonState();
				});
			}
		}

		/**
		 * Synchronizes the Download PNG toolbar button availability.
		 */
		syncTriggerButtonState() {
			if (!this.triggerBtn) {
				return;
			}

			const state = this.buildState ? this.buildState.getState() : null;
			const hasBase = Boolean(state && state.baseGun && state.baseGun.productId);

			if (hasBase) {
				this.triggerBtn.disabled = false;
				this.triggerBtn.classList.remove('is-disabled');
				this.triggerBtn.title = 'Download PNG of current build';
			} else {
				this.triggerBtn.disabled = true;
				this.triggerBtn.classList.add('is-disabled');
				this.triggerBtn.title = 'Choose a base platform to enable PNG export';
			}
		}

		/**
		 * Captures a frozen defensive snapshot of the active build state.
		 *
		 * @return {Object|null}
		 */
		captureBuildSnapshot() {
			if (!this.buildState) {
				return null;
			}

			const rawState = this.buildState.getState();
			if (!rawState || !rawState.baseGun) {
				return null;
			}

			// Determine build name from active managers
			let buildName = 'Gun Build';
			if (this.accountBuildManager && typeof this.accountBuildManager.getActiveSavedBuild === 'function') {
				const saved = this.accountBuildManager.getActiveSavedBuild();
				if (saved && saved.name) {
					buildName = saved.name;
				}
			}

			if (buildName === 'Gun Build' && this.guestBuildManager && typeof this.guestBuildManager.getActiveBuild === 'function') {
				const guest = this.guestBuildManager.getActiveBuild();
				if (guest && guest.name) {
					buildName = guest.name;
				}
			}

			if (buildName === 'Gun Build' && this.shareManager && this.shareManager.activeShareData && this.shareManager.activeShareData.name) {
				buildName = this.shareManager.activeShareData.name;
			}

			if (buildName === 'Gun Build' && this.currentBuild && this.currentBuild.name) {
				buildName = this.currentBuild.name;
			}

			if (buildName === 'Gun Build' && rawState.baseGun.name) {
				buildName = rawState.baseGun.name;
			}

			// Enrich items with productRegistry (for SKU, live price, and name)
			const registry = (window.TGB && window.TGB.productRegistry) ? window.TGB.productRegistry : null;
			const enrich = (item) => {
				if (!item) return {};
				const copy = Object.assign({}, item);
				const reg = registry && registry.get ? registry.get(copy.productId || copy.id) : null;
				if (reg) {
					if (!copy.sku && reg.sku) copy.sku = reg.sku;
					if (!copy.price && reg.price) copy.price = reg.price;
					if (!copy.name && reg.name) copy.name = reg.name;
				}
				return copy;
			};

			return {
				name: buildName,
				baseGun: enrich(rawState.baseGun),
				rails: Array.isArray(rawState.rails) ? rawState.rails.map(r => enrich(r)) : [],
				parts: Array.isArray(rawState.parts) ? rawState.parts.map(p => enrich(p)) : [],
			};
		}

		/**
		 * Calculates logical geometry and layer stacking for canvas composition.
		 *
		 * @param {Object} snapshot Build state snapshot.
		 * @return {Object} Composition layout specification.
		 */
		computeComposition(snapshot) {
			if (!snapshot || !snapshot.baseGun) {
				throw new Error('No base platform found in active configuration.');
			}

			const baseGun = snapshot.baseGun;
			const img = baseGun.builder_image || {};
			const imgUrl = img.url || '';

			if (!imgUrl) {
				throw new Error('Base weapon builder image is missing or unavailable.');
			}

			// Resolve base gun dimensions
			const refMm = parseFloat(baseGun.reference_mm) || 800;
			const imgW = parseFloat(img.width) || 1;
			const imgH = parseFloat(img.height) || 1;
			const baseLogicalW = parseFloat(refMm.toFixed(4));
			const baseLogicalH = parseFloat((baseLogicalW * (imgH / imgW)).toFixed(4));

			// Resolve Base Gun coordinates inside stage workspace
			let baseX = typeof baseGun.x === 'number' ? baseGun.x : 0;
			let baseY = typeof baseGun.y === 'number' ? baseGun.y : 0;

			// If Base Gun coordinates are unset, center them in standard workspace margins
			if (baseX === 0 && baseY === 0) {
				const horizPadding = Math.max(200, Math.round(baseLogicalW * 0.20));
				const vertPadding = Math.max(120, Math.round(baseLogicalH * 0.40));
				baseX = horizPadding;
				baseY = vertPadding;
			}

			const layers = [];

			// 1. Base Gun Layer (Z = 10)
			layers.push({
				role: 'base',
				id: baseGun.productId || baseGun.id || 0,
				instanceId: 'base-gun',
				name: baseGun.name || 'Base Gun',
				x: baseX,
				y: baseY,
				width: baseLogicalW,
				height: baseLogicalH,
				zIndex: 10,
				url: imgUrl,
			});

			// 2. Installed Rail Layers
			if (Array.isArray(snapshot.rails)) {
				snapshot.rails.forEach((rail, index) => {
					const rImg = rail.builder_image || {};
					if (rImg.url) {
						const rW = parseFloat(rail.width) || parseFloat(rail.reference_mm) || 100;
						const rH = parseFloat(rail.height) || (rW * (parseFloat(rImg.height || 1) / parseFloat(rImg.width || 1)));
						layers.push({
							role: 'rail',
							id: rail.productId || 0,
							instanceId: rail.instanceId || `rail-${index}`,
							name: rail.name || 'Rail',
							x: parseFloat(rail.x) || 0,
							y: parseFloat(rail.y) || 0,
							width: parseFloat(rW.toFixed(4)),
							height: parseFloat(rH.toFixed(4)),
							zIndex: typeof rail.zIndex === 'number' ? rail.zIndex : (20 + index),
							url: rImg.url,
						});
					}
				});
			}

			// 3. Installed Part Layers
			if (Array.isArray(snapshot.parts)) {
				snapshot.parts.forEach((part, index) => {
					const pImg = part.builder_image || {};
					if (pImg.url) {
						const pW = parseFloat(part.width) || parseFloat(part.reference_mm) || 100;
						const pH = parseFloat(part.height) || (pW * (parseFloat(pImg.height || 1) / parseFloat(pImg.width || 1)));
						layers.push({
							role: 'part',
							id: part.productId || 0,
							instanceId: part.instanceId || `part-${index}`,
							name: part.name || 'Component',
							x: parseFloat(part.x) || 0,
							y: parseFloat(part.y) || 0,
							width: parseFloat(pW.toFixed(4)),
							height: parseFloat(pH.toFixed(4)),
							zIndex: typeof part.zIndex === 'number' ? part.zIndex : (30 + index),
							url: pImg.url,
						});
					}
				});
			}

			// 4. Compute global bounding box across all mounted components
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;

			layers.forEach((l) => {
				minX = Math.min(minX, l.x);
				minY = Math.min(minY, l.y);
				maxX = Math.max(maxX, l.x + l.width);
				maxY = Math.max(maxY, l.y + l.height);
			});

			if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
				minX = 0;
				minY = 0;
				maxX = baseLogicalW;
				maxY = baseLogicalH;
			}

			// 5. Apply padding around total envelope
			const rawWidth = Math.ceil(maxX - minX);
			const rawHeight = Math.ceil(maxY - minY);
			const totalWidth = rawWidth + (PADDING_PX * 2);
			const totalHeight = rawHeight + (PADDING_PX * 2);

			// 6. Compute normalized draw coordinates relative to bounding box + padding
			layers.forEach((l) => {
				l.drawX = Math.round((l.x - minX) + PADDING_PX);
				l.drawY = Math.round((l.y - minY) + PADDING_PX);
			});

			// 7. Sort layers ascending by z-index (Base Gun at 10 first, then rails/parts in exact order)
			layers.sort((a, b) => {
				if (a.zIndex !== b.zIndex) {
					return a.zIndex - b.zIndex;
				}
				// Stable tie-breaking: base < rail < part
				const roleOrder = { base: 1, rail: 2, part: 3 };
				return (roleOrder[a.role] || 4) - (roleOrder[b.role] || 4);
			});

			return {
				layers,
				width: totalWidth,
				height: totalHeight,
				minX,
				minY,
				maxX,
				maxY,
				componentCount: layers.length,
			};
		}

		/**
		 * Opens the export dialog and populates build summary and estimated dimensions.
		 */
		openDialog() {
			const snapshot = this.captureBuildSnapshot();
			if (!snapshot || !snapshot.baseGun) {
				if (window.TGB && window.TGB.selection && typeof window.TGB.selection.showNotice === 'function') {
					window.TGB.selection.showNotice('Please choose a base weapon before exporting a PNG image.', 'info');
				}
				return;
			}

			this.currentSnapshot = snapshot;

			try {
				this.currentComposition = this.computeComposition(snapshot);
			} catch (err) {
				this.showFeedback(err.message || 'Unable to prepare build image.', 'error');
				return;
			}

			// Update dialog text
			if (this.buildNameEl) {
				this.buildNameEl.textContent = snapshot.name;
			}

			if (this.buildMetaEl) {
				const count = this.currentComposition.componentCount;
				const partsText = count === 1 ? '1 Component' : `${count} Components`;
				this.buildMetaEl.textContent = `${snapshot.baseGun.name || 'Base Platform'} • ${partsText}`;
			}

			// Update resolution labels
			const w = this.currentComposition.width;
			const h = this.currentComposition.height;

			if (this.dimsStandardEl) {
				this.dimsStandardEl.textContent = `${w} × ${h} px (1× logical resolution)`;
			}
			if (this.dimsHighEl) {
				this.dimsHighEl.textContent = `${w * 2} × ${h * 2} px (2× high-definition)`;
			}
			if (this.dimsMaxEl) {
				this.dimsMaxEl.textContent = `${w * 3} × ${h * 3} px (3× ultra-definition)`;
			}

			this.hideFeedback();

			if (this.modalEl) {
				this.modalEl.style.display = 'flex';
				// Focus download button
				setTimeout(() => {
					if (this.downloadBtn) {
						this.downloadBtn.focus();
					}
				}, 50);
			}
		}

		/**
		 * Closes the export dialog.
		 */
		closeDialog() {
			if (this.isExporting) {
				return;
			}

			if (this.modalEl) {
				this.modalEl.style.display = 'none';
			}

			this.hideFeedback();
		}

		/**
		 * Checks if an image URL shares the same origin as the current document.
		 *
		 * @param {string} url
		 * @return {boolean}
		 */
		isSameOrigin(url) {
			try {
				const parsed = new URL(url, window.location.href);
				return parsed.origin === window.location.origin;
			} catch (e) {
				return false;
			}
		}

		/**
		 * Preloads image elements for all layers with anonymous CORS handling.
		 *
		 * @param {Array} layers List of layer objects with url property.
		 * @return {Promise<Map<string, HTMLImageElement>>}
		 */
		preloadImages(layers) {
			const uniqueUrls = Array.from(new Set(layers.map(l => l.url).filter(Boolean)));
			const imageMap = new Map();

			const loadPromises = uniqueUrls.map((url) => {
				return new Promise((resolve, reject) => {
					const img = new Image();
					img.crossOrigin = 'anonymous';

					img.onload = () => {
						if (img.naturalWidth > 0 && img.naturalHeight > 0) {
							imageMap.set(url, img);
							resolve(img);
						} else {
							reject(new Error(`Product image returned invalid dimensions (0×0): ${url}`));
						}
					};

					img.onerror = () => {
						// Only retry without crossOrigin if the image is same-origin with the page.
						// Retrying without crossOrigin on a remote cross-origin domain produces an opaque
						// resource that taints the canvas, causing export failure or incomplete rendering.
						if (this.isSameOrigin(url)) {
							const retryImg = new Image();
							retryImg.onload = () => {
								if (retryImg.naturalWidth > 0 && retryImg.naturalHeight > 0) {
									imageMap.set(url, retryImg);
									resolve(retryImg);
								} else {
									reject(new Error(`Failed to load product image: ${url}`));
								}
							};
							retryImg.onerror = () => {
								reject(new Error(`Failed to load product image: ${url}`));
							};
							retryImg.src = url;
						} else {
							reject(new Error(`Cannot export build: Component image from cross-origin source "${url}" lacks CORS permissions and cannot be rendered cleanly.`));
						}
					};

					img.src = url;
				});
			});

			return Promise.all(loadPromises).then(() => imageMap);
		}

		/**
		 * Renders the composition onto an off-screen HTML5 Canvas.
		 *
		 * @param {Object} composition Layout and layer coordinates.
		 * @param {Map<string, HTMLImageElement>} imageMap Preloaded image cache.
		 * @param {Object} options Background and scale options.
		 * @return {HTMLCanvasElement}
		 */
		renderToCanvas(composition, imageMap, options = {}) {
			const quality = options.quality || 'high';
			const background = options.background || 'transparent';

			let scale = QUALITY_SCALES[quality] || 2.0;

			// Check safety limits
			let targetW = Math.round(composition.width * scale);
			let targetH = Math.round(composition.height * scale);

			if (targetW > MAX_DIMENSION_PX || targetH > MAX_DIMENSION_PX || (targetW * targetH) > MAX_AREA_PX) {
				console.warn(`[TGB Export] Requested canvas (${targetW}×${targetH}) exceeds safe device limits. Falling back to High (2×).`);
				scale = 2.0;
				targetW = Math.round(composition.width * scale);
				targetH = Math.round(composition.height * scale);
			}

			const canvas = document.createElement('canvas');
			canvas.width = targetW;
			canvas.height = targetH;

			const ctx = canvas.getContext('2d', { willReadFrequently: false });
			if (!ctx) {
				throw new Error('Unable to create 2D canvas rendering context.');
			}

			// Background Option
			if (background === 'white') {
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
			} else {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
			}

			// High-quality image smoothing
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';

			// Verify every layer has a preloaded image
			composition.layers.forEach((layer) => {
				if (!imageMap.has(layer.url)) {
					throw new Error(`Cannot export build: Image for component "${layer.name}" could not be loaded.`);
				}
			});

			// Draw each layer in strict z-index order
			let drawnCount = 0;
			composition.layers.forEach((layer) => {
				const img = imageMap.get(layer.url);
				if (img) {
					const dx = Math.round(layer.drawX * scale);
					const dy = Math.round(layer.drawY * scale);
					const dw = Math.round(layer.width * scale);
					const dh = Math.round(layer.height * scale);

					ctx.drawImage(img, dx, dy, dw, dh);
					drawnCount++;
				}
			});

			if (drawnCount !== composition.layers.length) {
				throw new Error(`Export incomplete: Only ${drawnCount} of ${composition.layers.length} component images could be rendered.`);
			}

			// Origin-clean check: Ensure canvas was not tainted by opaque cross-origin data
			try {
				ctx.getImageData(0, 0, 1, 1);
			} catch (taintErr) {
				throw new Error('Export blocked: Canvas tainted by cross-origin images lacking CORS permissions.');
			}

			return canvas;
		}

		/**
		 * Converts canvas to PNG Blob.
		 *
		 * @param {HTMLCanvasElement} canvas
		 * @return {Promise<Blob>}
		 */
		canvasToBlob(canvas) {
			return new Promise((resolve, reject) => {
				try {
					canvas.toBlob((blob) => {
						if (blob && blob.size > 0) {
							resolve(blob);
						} else {
							reject(new Error('Canvas export produced an empty or invalid PNG blob.'));
						}
					}, 'image/png');
				} catch (err) {
					// Catches CORS SecurityError if remote images tainted the canvas
					if (err.name === 'SecurityError') {
						reject(new Error('Browser security prevented export: One or more product images are hosted on a domain without CORS permissions.'));
					} else {
						reject(err);
					}
				}
			});
		}

		/**
		 * Triggers a browser download for the generated PNG blob.
		 *
		 * @param {Blob} blob PNG image blob.
		 * @param {string} filename Safe download filename.
		 */
		downloadBlob(blob, filename) {
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			link.style.display = 'none';

			document.body.appendChild(link);
			link.click();

			setTimeout(() => {
				if (link.parentNode) {
					link.parentNode.removeChild(link);
				}
				URL.revokeObjectURL(url);
			}, 2000);
		}

		/**
		 * Sanitizes a build name for safe filesystem compatibility.
		 *
		 * @param {string} buildName
		 * @return {string}
		 */
		sanitizeFilename(buildName) {
			let clean = (buildName || '')
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '');

			if (!clean || clean === 'build' || clean === 'untitled') {
				clean = 'gun-build';
			}

			// Clamp length to 60 characters
			if (clean.length > 60) {
				clean = clean.substring(0, 60).replace(/-+$/, '');
			}

			return `taktik-${clean}.png`;
		}

		/**
		 * Handles click on the Download PNG button inside the modal dialog.
		 */
		async handleDownloadClick() {
			if (this.isExporting) {
				return;
			}

			if (!this.currentSnapshot || !this.currentComposition) {
				this.showFeedback('Configuration snapshot is not available. Please reopen the dialog.', 'error');
				return;
			}

			// Read selected options
			let selectedBg = 'transparent';
			const bgRadio = this.modalEl ? this.modalEl.querySelector('input[name="tgb_export_bg"]:checked') : null;
			if (bgRadio) {
				selectedBg = bgRadio.value;
			}

			let selectedQuality = 'high';
			const qualityRadio = this.modalEl ? this.modalEl.querySelector('input[name="tgb_export_quality"]:checked') : null;
			if (qualityRadio) {
				selectedQuality = qualityRadio.value;
			}

			this.setExportingState(true);
			this.hideFeedback();

			try {
				// 1. Preload all product images
				const imageMap = await this.preloadImages(this.currentComposition.layers);

				// 2. Render composition to off-screen canvas
				const canvas = this.renderToCanvas(this.currentComposition, imageMap, {
					background: selectedBg,
					quality: selectedQuality,
				});

				// 3. Encode to PNG Blob
				const blob = await this.canvasToBlob(canvas);

				// 4. Trigger download
				const filename = this.sanitizeFilename(this.currentSnapshot.name);
				this.downloadBlob(blob, filename);

				this.showFeedback(`Success! "${filename}" downloaded (${(blob.size / 1024).toFixed(1)} KB).`, 'success');

				// Automatically close dialog after brief delay on success
				setTimeout(() => {
					this.closeDialog();
				}, 1500);
			} catch (err) {
				console.error('[TGB Export Error]', err);
				this.showFeedback(err.message || 'PNG export failed. Please try again.', 'error');
			} finally {
				this.setExportingState(false);
			}
		}

		/**
		 * Generates and prints a lightweight Bill of Materials (BOM) specification sheet (Section 12).
		 */
		handlePrintSpecClick() {
			if (!this.currentSnapshot) {
				return;
			}

			const snapshot = this.currentSnapshot;
			const baseGun = snapshot.baseGun || {};
			const rails = Array.isArray(snapshot.rails) ? snapshot.rails : [];
			const parts = Array.isArray(snapshot.parts) ? snapshot.parts : [];

			// Helper to get numeric price
			const getPriceAmount = (p) => {
				if (!p) return 0;
				if (typeof p.unit_amount === 'number') return p.unit_amount;
				if (typeof p.raw === 'number') return p.raw;
				const val = parseFloat(p.raw);
				return isNaN(val) ? 0 : val;
			};

			// Helper to format item price
			const formatItemPrice = (p) => {
				if (!p) return '—';
				if (p.display) return this.escapeHtml(p.display);
				const amt = getPriceAmount(p);
				return amt > 0 ? `$${amt.toFixed(2)}` : '—';
			};

			// Calculate subtotal
			let subtotal = getPriceAmount(baseGun.price);
			rails.forEach(r => {
				subtotal += getPriceAmount(r.price);
			});
			parts.forEach(p => {
				subtotal += getPriceAmount(p.price);
			});

			const formattedSubtotal = `$${subtotal.toFixed(2)}`;

			const printWindow = window.open('', '_blank', 'width=850,height=900');
			if (!printWindow) {
				alert('Please allow popups to open the printable build specification sheet.');
				return;
			}

			let railsHtml = '';
			if (rails.length > 0) {
				railsHtml = `
					<div class="spec-section">
						<h3>Mounted Accessory Rails (${rails.length})</h3>
						<table>
							<thead><tr><th>Product</th><th>SKU</th><th>Position</th><th>Length</th><th>Price</th></tr></thead>
							<tbody>
								${rails.map(r => `
									<tr>
										<td><strong>${this.escapeHtml(r.name || 'Accessory Rail')}</strong></td>
										<td><code>${this.escapeHtml(r.sku || '—')}</code></td>
										<td>${this.escapeHtml(r.position ? (r.position.charAt(0).toUpperCase() + r.position.slice(1)) : 'Bottom')}</td>
										<td>${r.reference_mm ? `${this.escapeHtml(String(r.reference_mm))} mm` : '—'}</td>
										<td>${formatItemPrice(r.price)}</td>
									</tr>
								`).join('')}
							</tbody>
						</table>
					</div>
				`;
			}

			let partsHtml = '';
			if (parts.length > 0) {
				partsHtml = `
					<div class="spec-section">
						<h3>Mounted Components & Accessories (${parts.length})</h3>
						<table>
							<thead><tr><th>Product</th><th>SKU</th><th>Type / Category</th><th>Length</th><th>Price</th></tr></thead>
							<tbody>
								${parts.map(p => `
									<tr>
										<td><strong>${this.escapeHtml(p.name || 'Component')}</strong></td>
										<td><code>${this.escapeHtml(p.sku || '—')}</code></td>
										<td>${this.escapeHtml(p.partTypeName || p.role || 'Accessory')}</td>
										<td>${p.reference_mm ? `${this.escapeHtml(String(p.reference_mm))} mm` : '—'}</td>
										<td>${formatItemPrice(p.price)}</td>
									</tr>
								`).join('')}
							</tbody>
						</table>
					</div>
				`;
			}

			const docContent = `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<title>Build Specification — ${this.escapeHtml(snapshot.name)}</title>
	<style>
		body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; line-height: 1.5; padding: 40px; margin: 0; background: #fff; }
		.header { border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-start; }
		.brand { font-size: 18px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #d32f2f; }
		.build-name { font-size: 26px; font-weight: 700; margin: 5px 0 0; color: #111; }
		.date { color: #666; font-size: 13px; text-align: right; }
		.spec-section { margin-bottom: 25px; }
		.spec-section h3 { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px; color: #333; }
		table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 14px; }
		th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eee; }
		th { background: #f8f9fa; font-weight: 600; color: #444; border-top: 1px solid #eee; }
		code { font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace; font-size: 12px; background: #f1f3f5; padding: 2px 6px; border-radius: 3px; color: #495057; }
		.totals-box { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-top: 30px; }
		.totals-label { font-size: 15px; font-weight: 700; text-transform: uppercase; color: #333; }
		.totals-value { font-size: 24px; font-weight: 800; color: #111; }
		.footer { margin-top: 40px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 15px; }
		@media print {
			body { padding: 0; }
			.totals-box { background: #fff; border: 1px solid #999; }
			th { background: #eee !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
			@page { margin: 1.5cm; }
		}
	</style>
</head>
<body>
	<div class="header">
		<div>
			<div class="brand">Taktik Airsoft Gun Builder</div>
			<h1 class="build-name">${this.escapeHtml(snapshot.name)}</h1>
		</div>
		<div class="date">Generated: ${new Date().toLocaleDateString()}<br><small>Taktik Airsoft 2D Builder V2</small></div>
	</div>

	<div class="spec-section">
		<h3>Base Weapon Platform</h3>
		<table>
			<thead><tr><th>Platform Name</th><th>SKU</th><th>Reference Length</th><th>Price</th></tr></thead>
			<tbody>
				<tr>
					<td><strong>${this.escapeHtml(baseGun.name || 'Base Platform')}</strong></td>
					<td><code>${this.escapeHtml(baseGun.sku || '—')}</code></td>
					<td>${baseGun.reference_mm ? `${this.escapeHtml(String(baseGun.reference_mm))} mm` : '—'}</td>
					<td>${formatItemPrice(baseGun.price)}</td>
				</tr>
			</tbody>
		</table>
	</div>

	${railsHtml}
	${partsHtml}

	<div class="totals-box">
		<div class="totals-label">Total Configuration Price</div>
		<div class="totals-value">${this.escapeHtml(formattedSubtotal)}</div>
	</div>

	<div class="footer">
		Taktik Airsoft • 2D Custom Gun Builder • https://taktikairsoft.com/
	</div>

	<script>
		window.onload = function() {
			window.print();
		};
	</script>
</body>
</html>`;

			printWindow.document.open();
			printWindow.document.write(docContent);
			printWindow.document.close();
		}

		/**
		 * Sets exporting state and updates button UI.
		 *
		 * @param {boolean} exporting
		 */
		setExportingState(exporting) {
			this.isExporting = exporting;

			if (this.downloadBtn) {
				this.downloadBtn.disabled = exporting;
				if (exporting) {
					this.downloadBtn.classList.add('is-loading');
					if (this.downloadBtnLabel) {
						this.downloadBtnLabel.textContent = 'Generating PNG...';
					}
				} else {
					this.downloadBtn.classList.remove('is-loading');
					if (this.downloadBtnLabel) {
						this.downloadBtnLabel.textContent = 'Download PNG';
					}
				}
			}

			if (this.cancelBtn) {
				this.cancelBtn.disabled = exporting;
			}
		}

		/**
		 * Shows feedback message inside dialog.
		 *
		 * @param {string} message
		 * @param {string} type 'error' | 'success' | 'info'
		 */
		showFeedback(message, type = 'info') {
			if (!this.feedbackEl) {
				return;
			}
			this.feedbackEl.textContent = message;
			this.feedbackEl.className = `tgb-export-feedback tgb-export-feedback--${type}`;
			this.feedbackEl.style.display = 'block';
		}

		/**
		 * Hides feedback message.
		 */
		hideFeedback() {
			if (this.feedbackEl) {
				this.feedbackEl.style.display = 'none';
				this.feedbackEl.textContent = '';
			}
		}

		/**
		 * HTML entity escape helper.
		 *
		 * @param {any} str
		 * @return {string}
		 */
		escapeHtml(str) {
			if (str === null || str === undefined) {
				return '';
			}
			return String(str)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');
		}
	}

	// Expose globally
	window.TGB_ExportManager = TGB_ExportManager;

})(window, document);
