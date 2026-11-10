import { TGB_Utility } from "./TGB-Utility.js";

export 	class TGB_BuildState {
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

			const geometry = TGB_Utility.calculateProductGeometry(product);
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

			const geometry = TGB_Utility.calculateProductGeometry(product);
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
