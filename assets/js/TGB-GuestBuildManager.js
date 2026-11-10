	export class TGB_GuestBuildManager {
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