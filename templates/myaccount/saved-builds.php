<?php
/**
 * WooCommerce My Account "My Gun Builds" endpoint template.
 *
 * Displays a list of the customer's permanently saved builds with management actions:
 * Open/Edit in Gun Builder, Rename, Duplicate, and Delete.
 *
 * @package TaktikGunBuilder
 *
 * @var array  $builds      Array of build summaries.
 * @var string $builder_url URL to the Gun Builder page.
 * @var int    $total_count Total number of saved builds.
 * @var int    $max_builds  Maximum allowed builds (10).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$nonce = wp_create_nonce( 'wp_rest' );
$rest_base = esc_url_raw( rest_url( 'tgb/v1/saved-builds' ) );
$shares_base = esc_url_raw( rest_url( 'tgb/v1/shares' ) );
$user_shares = class_exists( 'TGB_Shares' ) ? TGB_Shares::get_user_shares_map( get_current_user_id() ) : array();
?>

<div class="tgb-my-account-wrap" id="tgb-my-account-wrap" data-nonce="<?php echo esc_attr( $nonce ); ?>" data-rest-base="<?php echo esc_attr( $rest_base ); ?>" data-shares-base="<?php echo esc_attr( $shares_base ); ?>" data-builder-url="<?php echo esc_url( $builder_url ); ?>">

	<header class="tgb-my-account-header">
		<div class="tgb-my-account-header__info">
			<h2 class="tgb-my-account-title"><?php esc_html_e( 'My Saved Gun Builds', 'part-selector' ); ?></h2>
			<p class="tgb-my-account-subtitle">
				<?php esc_html_e( 'Manage your custom weapon builds. You can open any saved build in the builder, duplicate, rename, or order directly.', 'part-selector' ); ?>
			</p>
		</div>
		<div class="tgb-my-account-header__meta">
			<span class="tgb-build-limit-badge <?php echo ( $total_count >= $max_builds ) ? 'tgb-build-limit-badge--max' : ''; ?>">
				<span class="tgb-build-limit-badge__count"><?php echo esc_html( $total_count ); ?></span> / <?php echo esc_html( $max_builds ); ?> <?php esc_html_e( 'Builds', 'part-selector' ); ?>
			</span>
			<a href="<?php echo esc_url( $builder_url ); ?>" class="button tgb-btn-launch-builder">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
				<?php esc_html_e( 'Open Gun Builder', 'part-selector' ); ?>
			</a>
		</div>
	</header>

	<div id="tgb-account-feedback" class="tgb-account-feedback" style="display: none;" role="status"></div>

	<?php if ( empty( $builds ) ) : ?>
		<div class="tgb-my-account-empty">
			<div class="tgb-my-account-empty__icon">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
					<line x1="8" y1="21" x2="16" y2="21"></line>
					<line x1="12" y1="17" x2="12" y2="21"></line>
				</svg>
			</div>
			<h3 class="tgb-my-account-empty__heading"><?php esc_html_e( "You don't have any saved gun builds yet.", 'part-selector' ); ?></h3>
			<p class="tgb-my-account-empty__desc">
				<?php esc_html_e( 'Customize your first airsoft platform with genuine accessories, physical scaling, and instant cart bundling.', 'part-selector' ); ?>
			</p>
			<a href="<?php echo esc_url( $builder_url ); ?>" class="button button-primary tgb-btn-start-building">
				<?php esc_html_e( 'Start Your First Build', 'part-selector' ); ?>
			</a>
		</div>
	<?php else : ?>
		<div class="tgb-saved-builds-grid" id="tgb-saved-builds-grid">
			<?php foreach ( $builds as $b ) :
				$edit_url   = add_query_arg( 'saved_build_id', $b['id'], $builder_url );
				$b_share    = isset( $user_shares[ $b['id'] ] ) ? $user_shares[ $b['id'] ] : null;
				$has_active = ( $b_share && empty( $b_share['isRevoked'] ) );
			?>
				<article class="tgb-build-card" id="tgb-build-card-<?php echo esc_attr( $b['id'] ); ?>" data-build-id="<?php echo esc_attr( $b['id'] ); ?>">
					<div class="tgb-build-card__thumbnail">
						<?php if ( ! empty( $b['baseGunImage'] ) ) : ?>
							<img src="<?php echo esc_url( $b['baseGunImage'] ); ?>" alt="<?php echo esc_attr( $b['name'] ); ?>" loading="lazy" />
						<?php else : ?>
							<div class="tgb-build-card__no-thumb">
								<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
							</div>
						<?php endif; ?>
					</div>

					<div class="tgb-build-card__body">
						<div class="tgb-build-card__header">
							<h3 class="tgb-build-card__name" id="tgb-build-title-<?php echo esc_attr( $b['id'] ); ?>">
								<?php echo esc_html( $b['name'] ); ?>
								<?php if ( $has_active ) : ?>
									<span class="tgb-card-share-status tgb-card-share-status--active" id="tgb-share-badge-<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Active public share link', 'part-selector' ); ?>">
										&#128279; <?php esc_html_e( 'Shared', 'part-selector' ); ?>
									</span>
								<?php endif; ?>
							</h3>
							<span class="tgb-build-card__date"><?php echo esc_html( $b['dateFormatted'] ); ?></span>
						</div>

						<p class="tgb-build-card__platform">
							<strong><?php esc_html_e( 'Platform:', 'part-selector' ); ?></strong>
							<?php echo esc_html( $b['baseGunName'] ); ?>
						</p>

						<div class="tgb-build-card__specs">
							<span class="tgb-spec-badge">
								<strong><?php echo esc_html( $b['railsCount'] ); ?></strong> <?php echo esc_html( _n( 'Rail', 'Rails', $b['railsCount'], 'part-selector' ) ); ?>
							</span>
							<span class="tgb-spec-badge">
								<strong><?php echo esc_html( $b['partsCount'] ); ?></strong> <?php echo esc_html( _n( 'Component', 'Components', $b['partsCount'], 'part-selector' ) ); ?>
							</span>
						</div>

						<div class="tgb-build-card__actions">
							<a href="<?php echo esc_url( $edit_url ); ?>" class="button button-primary tgb-btn-action tgb-btn-action--open" title="<?php esc_attr_e( 'Open and customize this build in the Gun Builder', 'part-selector' ); ?>">
								<?php esc_html_e( 'Open in Builder', 'part-selector' ); ?>
							</a>
							<?php if ( $has_active ) : ?>
								<button type="button" class="button tgb-btn-action tgb-card-action--share" data-action="replace-share" data-share-id="<?php echo esc_attr( $b_share['id'] ); ?>" data-id="<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Invalidate previous link and generate a new secure share link', 'part-selector' ); ?>">
									<?php esc_html_e( 'Replace Link', 'part-selector' ); ?>
								</button>
								<button type="button" class="button tgb-btn-action" data-action="revoke-share" data-share-id="<?php echo esc_attr( $b_share['id'] ); ?>" data-id="<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Immediately revoke public access to this share link', 'part-selector' ); ?>">
									<?php esc_html_e( 'Revoke Link', 'part-selector' ); ?>
								</button>
							<?php else : ?>
								<button type="button" class="button tgb-btn-action tgb-card-action--share" data-action="share-build" data-id="<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Generate a shareable public link for this build', 'part-selector' ); ?>">
									<?php esc_html_e( 'Share', 'part-selector' ); ?>
								</button>
							<?php endif; ?>
							<button type="button" class="button tgb-btn-action tgb-btn-action--rename" data-action="rename" data-id="<?php echo esc_attr( $b['id'] ); ?>" data-name="<?php echo esc_attr( $b['name'] ); ?>" title="<?php esc_attr_e( 'Rename this build', 'part-selector' ); ?>">
								<?php esc_html_e( 'Rename', 'part-selector' ); ?>
							</button>
							<button type="button" class="button tgb-btn-action tgb-btn-action--duplicate" data-action="duplicate" data-id="<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Duplicate build', 'part-selector' ); ?>" <?php echo ( $total_count >= $max_builds ) ? 'disabled aria-disabled="true"' : ''; ?>>
								<?php esc_html_e( 'Duplicate', 'part-selector' ); ?>
							</button>
							<button type="button" class="button tgb-btn-action tgb-btn-action--delete" data-action="delete" data-id="<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Delete this build', 'part-selector' ); ?>">
								<?php esc_html_e( 'Delete', 'part-selector' ); ?>
							</button>
						</div>
					</div>
				</article>
			<?php endforeach; ?>
		</div>
	<?php endif; ?>

	<!-- Account Share Dialog Modal -->
	<div class="tgb-modal-backdrop" id="tgb-account-share-modal" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="tgb-account-share-modal-title">
		<div class="tgb-modal-panel tgb-modal-panel--share">
			<div class="tgb-modal-header">
				<h3 class="tgb-modal-title" id="tgb-account-share-modal-title"><?php esc_html_e( 'Share Gun Build', 'part-selector' ); ?></h3>
				<button type="button" class="tgb-modal-close" id="tgb-account-share-modal-close" aria-label="<?php esc_attr_e( 'Close', 'part-selector' ); ?>">&times;</button>
			</div>
			<div class="tgb-modal-body">
				<p class="tgb-share-modal-desc" id="tgb-account-share-modal-desc">
					<?php esc_html_e( 'Anyone with this link can view your gun configuration, review components, and customize their own copy.', 'part-selector' ); ?>
				</p>
				<div class="tgb-share-input-group">
					<input type="text" class="tgb-share-url-input" id="tgb-account-share-url-input" readonly aria-label="<?php esc_attr_e( 'Shareable Link', 'part-selector' ); ?>" />
					<button type="button" class="button button-primary tgb-btn--copy-link" id="tgb-account-btn-copy-link">
						<span id="tgb-account-btn-copy-label"><?php esc_html_e( 'Copy Link', 'part-selector' ); ?></span>
					</button>
				</div>
				<p class="tgb-share-expiration-note">
					<?php esc_html_e( 'Registered build link. For security, secret tokens are not stored in plain text and cannot be retrieved after closing. Copy your link now. If you lose it, click "Replace Link" in My Account to generate a new URL (which invalidates the old one).', 'part-selector' ); ?>
				</p>
			</div>
		</div>
	</div>

</div>

<script>
(function() {
	const wrap = document.getElementById('tgb-my-account-wrap');
	if (!wrap) return;

	const nonce = wrap.dataset.nonce;
	const restBase = wrap.dataset.restBase;
	const sharesBase = wrap.dataset.sharesBase;
	const feedback = document.getElementById('tgb-account-feedback');

	function showNotice(msg, type = 'info') {
		if (!feedback) return;
		feedback.textContent = msg;
		feedback.className = 'tgb-account-feedback tgb-account-feedback--' + type;
		feedback.style.display = 'block';
		setTimeout(() => {
			if (type !== 'error') feedback.style.display = 'none';
		}, 5000);
	}

	wrap.addEventListener('click', async function(e) {
		const btn = e.target.closest('button[data-action]');
		if (!btn) return;

		const action = btn.dataset.action;
		const buildId = btn.dataset.id;
		if (!buildId) return;

		if (action === 'delete') {
			if (!confirm('Are you sure you want to permanently delete this saved build?')) {
				return;
			}
			btn.disabled = true;
			try {
				const res = await fetch(`${restBase}/${buildId}`, {
					method: 'DELETE',
					headers: {
						'X-WP-Nonce': nonce,
						'Content-Type': 'application/json'
					}
				});
				const data = await res.json();
				if (res.ok) {
					const card = document.getElementById(`tgb-build-card-${buildId}`);
					if (card) card.remove();
					showNotice(data.message || 'Build deleted.', 'success');
					window.location.reload();
				} else {
					showNotice(data.message || 'Failed to delete build.', 'error');
					btn.disabled = false;
				}
			} catch (err) {
				showNotice('Network error deleting build.', 'error');
				btn.disabled = false;
			}
		}

		if (action === 'rename') {
			const currentName = btn.dataset.name || '';
			const newName = prompt('Enter new build name:', currentName);
			if (newName === null) return;
			const trimmed = newName.trim();
			if (!trimmed) {
				alert('Build name cannot be empty.');
				return;
			}

			btn.disabled = true;
			try {
				const res = await fetch(`${restBase}/${buildId}`, {
					method: 'PUT',
					headers: {
						'X-WP-Nonce': nonce,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ name: trimmed })
				});
				const data = await res.json();
				if (res.ok) {
					const titleEl = document.getElementById(`tgb-build-title-${buildId}`);
					if (titleEl) titleEl.textContent = trimmed;
					btn.dataset.name = trimmed;
					showNotice('Build renamed successfully.', 'success');
				} else {
					showNotice(data.message || 'Failed to rename build.', 'error');
				}
			} catch (err) {
				showNotice('Network error renaming build.', 'error');
			} finally {
				btn.disabled = false;
			}
		}

		if (action === 'duplicate') {
			btn.disabled = true;
			try {
				const res = await fetch(`${restBase}/${buildId}/duplicate`, {
					method: 'POST',
					headers: {
						'X-WP-Nonce': nonce,
						'Content-Type': 'application/json'
					}
				});
				const data = await res.json();
				if (res.ok) {
					showNotice('Build duplicated successfully.', 'success');
					window.location.reload();
				} else {
					showNotice(data.message || 'Failed to duplicate build.', 'error');
					btn.disabled = false;
				}
			} catch (err) {
				showNotice('Network error duplicating build.', 'error');
				btn.disabled = false;
			}
		}

		if (action === 'share-build') {
			btn.disabled = true;
			try {
				const res = await fetch(sharesBase, {
					method: 'POST',
					headers: {
						'X-WP-Nonce': nonce,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ savedBuildId: parseInt(buildId, 10) })
				});
				const data = await res.json();
				if (res.ok && data.share_url) {
					openShareModal(data.share_url, data.name);
					showNotice(data.message || 'Share link created.', 'success');
					// Refresh card actions on next interaction or reload
					setTimeout(() => window.location.reload(), 2500);
				} else {
					showNotice(data.message || 'Failed to create share link.', 'error');
				}
			} catch (err) {
				showNotice('Network error creating share link.', 'error');
			} finally {
				btn.disabled = false;
			}
		}

		if (action === 'replace-share') {
			const shareId = btn.dataset.shareId;
			if (!shareId) return;
			if (!confirm('Generating a replacement link will immediately revoke and invalidate the previous link. Anyone with the old link will no longer be able to view your build. Continue?')) {
				return;
			}

			btn.disabled = true;
			try {
				const res = await fetch(`${sharesBase}/${shareId}/replace`, {
					method: 'POST',
					headers: {
						'X-WP-Nonce': nonce,
						'Content-Type': 'application/json'
					}
				});
				const data = await res.json();
				if (res.ok && data.share_url) {
					openShareModal(data.share_url, data.name);
					showNotice(data.message || 'Replacement link created.', 'success');
				} else {
					showNotice(data.message || 'Failed to replace share link.', 'error');
				}
			} catch (err) {
				showNotice('Network error replacing share link.', 'error');
			} finally {
				btn.disabled = false;
			}
		}

		if (action === 'revoke-share') {
			const shareId = btn.dataset.shareId;
			if (!shareId) return;
			if (!confirm('Are you sure you want to revoke this share link? Anyone who received the link will immediately lose access.')) {
				return;
			}

			btn.disabled = true;
			try {
				const res = await fetch(`${sharesBase}/${shareId}`, {
					method: 'DELETE',
					headers: {
						'X-WP-Nonce': nonce,
						'Content-Type': 'application/json'
					}
				});
				const data = await res.json();
				if (res.ok) {
					showNotice(data.message || 'Share link revoked.', 'success');
					const badge = document.getElementById(`tgb-share-badge-${buildId}`);
					if (badge) badge.remove();
					btn.style.display = 'none';
					const replaceBtn = btn.parentElement.querySelector('[data-action="replace-share"]');
					if (replaceBtn) replaceBtn.style.display = 'none';
					// Add Share button
					const shareBtn = document.createElement('button');
					shareBtn.type = 'button';
					shareBtn.className = 'button tgb-btn-action tgb-card-action--share';
					shareBtn.dataset.action = 'share-build';
					shareBtn.dataset.id = buildId;
					shareBtn.title = 'Share this build';
					shareBtn.textContent = 'Share';
					btn.parentElement.insertBefore(shareBtn, btn);
				} else {
					showNotice(data.message || 'Failed to revoke share link.', 'error');
					btn.disabled = false;
				}
			} catch (err) {
				showNotice('Network error revoking share link.', 'error');
				btn.disabled = false;
			}
		}
	});

	// Share Modal in My Account
	const shareModal = document.getElementById('tgb-account-share-modal');
	const shareModalClose = document.getElementById('tgb-account-share-modal-close');
	const shareUrlInput = document.getElementById('tgb-account-share-url-input');
	const copyBtn = document.getElementById('tgb-account-btn-copy-link');
	const copyLabel = document.getElementById('tgb-account-btn-copy-label');

	function openShareModal(url, name) {
		if (!shareModal || !shareUrlInput) return;
		shareUrlInput.value = url;
		shareModal.style.display = 'flex';
	}

	function closeShareModal() {
		if (shareModal) shareModal.style.display = 'none';
	}

	if (shareModalClose) {
		shareModalClose.addEventListener('click', closeShareModal);
	}

	if (shareModal) {
		shareModal.addEventListener('click', (e) => {
			if (e.target === shareModal) closeShareModal();
		});
	}

	if (copyBtn && shareUrlInput) {
		copyBtn.addEventListener('click', async () => {
			const url = shareUrlInput.value;
			if (!url) return;
			try {
				if (navigator.clipboard && navigator.clipboard.writeText) {
					await navigator.clipboard.writeText(url);
				} else {
					shareUrlInput.select();
					document.execCommand('copy');
				}
				if (copyLabel) copyLabel.textContent = 'Copied!';
				setTimeout(() => {
					if (copyLabel) copyLabel.textContent = 'Copy Link';
				}, 2000);
			} catch (err) {
				shareUrlInput.select();
				document.execCommand('copy');
				if (copyLabel) copyLabel.textContent = 'Copied!';
				setTimeout(() => {
					if (copyLabel) copyLabel.textContent = 'Copy Link';
				}, 2000);
			}
		});
	}

	// Delegate guest transfer to shared initMyAccountGuestSync in gun-builder.js
	if (typeof window.TGB_initMyAccountGuestSync === 'function') {
		window.TGB_initMyAccountGuestSync();
	}
})();
</script>
