import { TGB_Utility } from "./TGB-Utility.js";

export	class TGB_Persistence {
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
						const validPositions = railProduct ? TGB_Utility.TGB_Mounting.getRailCompatiblePositions(baseProduct, railProduct) : [];
						const isValidRail = railProduct &&
							railProduct.role === 'rail' &&
							railProduct.builder_image &&
							railProduct.builder_image.url &&
							validPositions.includes(railEntry.position);

						if (isValidRail) {
							const railGeom = TGB_Utility.calculateProductGeometry(railProduct);
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
				const activePool = TGB_Utility.TGB_Mounting.buildCapabilityPool(baseProduct, buildState.getRails());

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
						const compatRes = product ? TGB_Utility.TGB_Mounting.checkPartCompatibilityWithPool(product, activePool) : { status: 'unconfigured' };
						const isValidPart = product &&
							product.role === 'part' &&
							product.builder_image &&
							product.builder_image.url &&
							isCategoryAllowed &&
							compatRes.status === 'compatible';

						if (isValidPart) {
							// Coordinate Clamping (Requirement 3):
							// Clamp coordinates to stage boundaries: 0 <= x <= stageWidth - partWidth, 0 <= y <= stageHeight - partHeight
							const partGeom = TGB_Utility.calculateProductGeometry(product);
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