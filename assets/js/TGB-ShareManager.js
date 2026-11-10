	export class TGB_ShareManager {
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
