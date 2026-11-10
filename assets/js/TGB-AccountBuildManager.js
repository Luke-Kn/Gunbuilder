export	class TGB_AccountBuildManager {
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