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

$builds      = isset( $builds ) && is_array( $builds ) ? $builds : array();
$builder_url = isset( $builder_url ) ? $builder_url : ( class_exists( 'TGB_Shortcode' ) ? TGB_Shortcode::get_builder_page_url() : home_url( '/' ) );
$total_count = isset( $total_count ) ? (int) $total_count : count( $builds );
$max_builds  = isset( $max_builds ) ? (int) $max_builds : 10;
$nonce       = wp_create_nonce( 'wp_rest' );
$rest_base   = esc_url_raw( rest_url( 'tgb/v1/saved-builds' ) );
$shares_base = esc_url_raw( rest_url( 'tgb/v1/shares' ) );
$user_shares = class_exists( 'TGB_Shares' ) ? TGB_Shares::get_user_shares_map( get_current_user_id() ) : array();
?>

<div class="tgb-my-account-wrap" id="tgb-my-account-wrap" data-nonce="<?php echo esc_attr( $nonce ); ?>" data-rest-base="<?php echo esc_attr( $rest_base ); ?>" data-shares-base="<?php echo esc_attr( $shares_base ); ?>" data-builder-url="<?php echo esc_url( $builder_url ); ?>">

	<header class="tgb-my-account-header">
		<div class="tgb-my-account-header__info">
			<div class="tgb-badge"><?php esc_html_e( 'Taktik Airsoft', 'part-selector' ); ?></div>
			<h2 class="tgb-my-account-title"><?php esc_html_e( 'My Saved Gun Builds', 'part-selector' ); ?></h2>
			<p class="tgb-my-account-subtitle">
				<?php esc_html_e( 'Manage your custom weapon builds. You can open any saved build in the builder, duplicate, rename, or order directly.', 'part-selector' ); ?>
			</p>
		</div>
		<div class="tgb-my-account-header__meta">
			<span class="tgb-build-limit-badge <?php echo ( $total_count >= $max_builds ) ? 'tgb-build-limit-badge--max' : ''; ?>">
				<span class="tgb-build-limit-badge__count"><?php echo esc_html( $total_count ); ?></span> / <?php echo esc_html( $max_builds ); ?> <?php esc_html_e( 'Builds', 'part-selector' ); ?>
			</span>
			<a href="<?php echo esc_url( $builder_url ); ?>" class="tgb-btn tgb-btn--primary tgb-btn-launch-builder">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
				<span><?php esc_html_e( 'Open Gun Builder', 'part-selector' ); ?></span>
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
			<a href="<?php echo esc_url( $builder_url ); ?>" class="tgb-btn tgb-btn--primary tgb-btn-start-building">
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
					<div class="tgb-build-card__thumbnail" id="tgb-thumb-<?php echo esc_attr( $b['id'] ); ?>">
						<?php if ( ! empty( $b['baseGunImage'] ) ) : ?>
							<img src="<?php echo esc_url( $b['baseGunImage'] ); ?>" alt="<?php echo esc_attr( $b['name'] ); ?>" class="tgb-build-card__base-img" loading="lazy" />
						<?php else : ?>
							<div class="tgb-build-card__no-thumb">
								<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
							</div>
						<?php endif; ?>
						<script type="application/json" class="tgb-build-preview-data"><?php echo wp_json_encode( ! empty( $b['preview'] ) ? $b['preview'] : null, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ); ?></script>
					</div>

					<div class="tgb-build-card__body">
						<div class="tgb-build-card__header">
							<h3 class="tgb-build-card__name" id="tgb-build-title-<?php echo esc_attr( $b['id'] ); ?>">
								<?php echo esc_html( $b['name'] ); ?>
								<?php if ( $has_active ) : ?>
									<span class="tgb-card-share-status tgb-card-share-status--active" id="tgb-share-badge-<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Active public share link', 'part-selector' ); ?>">
										<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
										<?php esc_html_e( 'Shared', 'part-selector' ); ?>
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
							<a href="<?php echo esc_url( $edit_url ); ?>" class="tgb-btn tgb-btn--primary tgb-btn-action tgb-btn-action--open" title="<?php esc_attr_e( 'Open and customize this build in the Gun Builder', 'part-selector' ); ?>">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
								<span><?php esc_html_e( 'Open in Builder', 'part-selector' ); ?></span>
							</a>
							<div class="tgb-build-card__secondary-actions">
								<?php if ( $has_active ) : ?>
									<button type="button" class="tgb-btn tgb-btn--secondary tgb-btn-action tgb-card-action--share" data-action="replace-share" data-share-id="<?php echo esc_attr( $b_share['id'] ); ?>" data-id="<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Invalidate previous link and generate a new secure share link', 'part-selector' ); ?>">
										<?php esc_html_e( 'Replace Link', 'part-selector' ); ?>
									</button>
									<button type="button" class="tgb-btn tgb-btn--secondary tgb-btn-action" data-action="revoke-share" data-share-id="<?php echo esc_attr( $b_share['id'] ); ?>" data-id="<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Immediately revoke public access to this share link', 'part-selector' ); ?>">
										<?php esc_html_e( 'Revoke Link', 'part-selector' ); ?>
									</button>
								<?php else : ?>
									<button type="button" class="tgb-btn tgb-btn--secondary tgb-btn-action tgb-card-action--share" data-action="share-build" data-id="<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Generate a shareable public link for this build', 'part-selector' ); ?>">
										<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
										<span><?php esc_html_e( 'Share', 'part-selector' ); ?></span>
									</button>
								<?php endif; ?>
								<button type="button" class="tgb-btn tgb-btn--secondary tgb-btn-action tgb-btn-action--rename" data-action="rename" data-id="<?php echo esc_attr( $b['id'] ); ?>" data-name="<?php echo esc_attr( $b['name'] ); ?>" title="<?php esc_attr_e( 'Rename this build', 'part-selector' ); ?>">
									<?php esc_html_e( 'Rename', 'part-selector' ); ?>
								</button>
								<button type="button" class="tgb-btn tgb-btn--secondary tgb-btn-action tgb-btn-action--duplicate" data-action="duplicate" data-id="<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Duplicate build', 'part-selector' ); ?>" <?php echo ( $total_count >= $max_builds ) ? 'disabled aria-disabled="true"' : ''; ?>>
									<?php esc_html_e( 'Duplicate', 'part-selector' ); ?>
								</button>
								<button type="button" class="tgb-btn tgb-btn--danger-subtle tgb-btn-action tgb-btn-action--delete" data-action="delete" data-id="<?php echo esc_attr( $b['id'] ); ?>" title="<?php esc_attr_e( 'Delete this build', 'part-selector' ); ?>">
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
									<span><?php esc_html_e( 'Delete', 'part-selector' ); ?></span>
								</button>
							</div>
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
				<h3 class="tgb-modal-title" id="tgb-account-share-modal-title"><?php esc_html_e( 'Share Your Gun Build', 'part-selector' ); ?></h3>
				<button type="button" class="tgb-modal-close" id="tgb-account-share-modal-close" aria-label="<?php esc_attr_e( 'Close', 'part-selector' ); ?>">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
				</button>
			</div>
			<div class="tgb-modal-body">
				<p class="tgb-share-modal-desc" id="tgb-account-share-modal-desc">
					<?php esc_html_e( 'Share your configuration with someone else. They can view your setup and customize their own copy.', 'part-selector' ); ?>
				</p>
				<div class="tgb-share-input-group">
					<input type="text" class="tgb-share-url-input" id="tgb-account-share-url-input" readonly aria-label="<?php esc_attr_e( 'Shareable Link', 'part-selector' ); ?>" />
					<button type="button" class="tgb-btn tgb-btn--primary tgb-btn--copy-link" id="tgb-account-btn-copy-link">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
						<span id="tgb-account-btn-copy-label"><?php esc_html_e( 'Copy Link', 'part-selector' ); ?></span>
					</button>
				</div>
				<div class="tgb-share-feedback" id="tgb-account-share-feedback" style="display: none;" role="alert"></div>
				<div class="tgb-share-expiration-wrap">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
					<p class="tgb-share-expiration-note">
						<?php esc_html_e( 'Registered build link. For security, secret tokens cannot be retrieved after closing. Copy now or use Replace Link in My Account if needed.', 'part-selector' ); ?>
					</p>
				</div>
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

	// Initialize composite thumbnail lazy rendering
	if (window.TGB_ExportManager && typeof window.TGB_ExportManager.initCardPreviews === 'function') {
		window.TGB_ExportManager.initCardPreviews(wrap);
	}

	wrap.addEventListener('click', async function(e) {
		const btn = e.target.closest('button[data-action]');
		if (!btn) return;

		const action = btn.dataset.action;
		const buildId = btn.dataset.id;
		if (!buildId) return;

		if (action === 'delete') {
			const ok = window.TGB_Dialog
				? await window.TGB_Dialog.confirm({
					title: 'Delete Saved Build?',
					message: 'Are you sure you want to permanently delete this saved build? This action cannot be undone.',
					isDanger: true,
					confirmText: 'Delete Build',
					cancelText: 'Cancel'
				})
				: confirm('Are you sure you want to permanently delete this saved build?');
			if (!ok) return;

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
			const newName = window.TGB_Dialog
				? await window.TGB_Dialog.prompt({
					title: 'Rename Build',
					message: 'Enter new build name (max 40 characters):',
					defaultValue: currentName,
					maxLength: 40,
					confirmText: 'Rename'
				})
				: prompt('Enter new build name:', currentName);
			if (newName === null) return;
			const trimmed = newName.trim();
			if (!trimmed) {
				if (window.TGB_Dialog) {
					await window.TGB_Dialog.alert('Build name cannot be empty.');
				} else {
					alert('Build name cannot be empty.');
				}
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
					if (titleEl) {
						// Keep share badge if present
						const badge = titleEl.querySelector('.tgb-card-share-status');
						titleEl.textContent = trimmed + ' ';
						if (badge) titleEl.appendChild(badge);
					}
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
			const ok = window.TGB_Dialog
				? await window.TGB_Dialog.confirm({
					title: 'Generate Replacement Link?',
					message: 'Generating a replacement link will immediately revoke and invalidate the previous link. Anyone with the old link will no longer be able to view your build. Continue?',
					confirmText: 'Replace Link',
					cancelText: 'Cancel'
				})
				: confirm('Generating a replacement link will immediately revoke and invalidate the previous link. Anyone with the old link will no longer be able to view your build. Continue?');
			if (!ok) return;

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
			const ok = window.TGB_Dialog
				? await window.TGB_Dialog.confirm({
					title: 'Revoke Share Link?',
					message: 'Are you sure you want to revoke this share link? Anyone who received the link will immediately lose access.',
					isDanger: true,
					confirmText: 'Revoke Link',
					cancelText: 'Cancel'
				})
				: confirm('Are you sure you want to revoke this share link? Anyone who received the link will immediately lose access.');
			if (!ok) return;

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
					shareBtn.className = 'tgb-btn tgb-btn--secondary tgb-btn-action tgb-card-action--share';
					shareBtn.dataset.action = 'share-build';
					shareBtn.dataset.id = buildId;
					shareBtn.title = 'Share this build';
					shareBtn.innerHTML = `
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
						<span>Share</span>
					`;
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
	const shareFeedback = document.getElementById('tgb-account-share-feedback');

	async function openShareModal(url, name) {
		if (!shareModal || !shareUrlInput) return;
		shareUrlInput.value = url;
		shareModal.style.display = 'flex';

		let autoCopied = false;
		if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
			try {
				await navigator.clipboard.writeText(url);
				autoCopied = true;
			} catch (clipErr) {
				autoCopied = false;
			}
		}

		if (autoCopied) {
			if (copyLabel) copyLabel.textContent = 'Copied!';
			if (shareFeedback) {
				shareFeedback.textContent = 'Link copied to clipboard!';
				shareFeedback.className = 'tgb-share-feedback tgb-share-feedback--success';
				shareFeedback.style.display = 'block';
			}
			setTimeout(() => {
				if (copyLabel) copyLabel.textContent = 'Copy Link';
			}, 2500);
		} else {
			if (shareFeedback) {
				shareFeedback.textContent = 'Share link ready! Click Copy Link to copy.';
				shareFeedback.className = 'tgb-share-feedback tgb-share-feedback--info';
				shareFeedback.style.display = 'block';
			}
		}
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

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && shareModal && shareModal.style.display !== 'none') {
			closeShareModal();
		}
	});

	if (copyBtn && shareUrlInput) {
		copyBtn.addEventListener('click', async () => {
			const url = shareUrlInput.value;
			if (!url) return;
			let copied = false;
			try {
				if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
					await navigator.clipboard.writeText(url);
					copied = true;
				} else {
					shareUrlInput.select();
					copied = document.execCommand('copy');
				}
			} catch (err) {
				shareUrlInput.select();
				try {
					copied = document.execCommand('copy');
				} catch (e) {
					copied = false;
				}
			}

			if (copied) {
				if (copyLabel) copyLabel.textContent = 'Copied!';
				if (shareFeedback) {
					shareFeedback.textContent = 'Link copied to clipboard!';
					shareFeedback.className = 'tgb-share-feedback tgb-share-feedback--success';
					shareFeedback.style.display = 'block';
				}
				setTimeout(() => {
					if (copyLabel) copyLabel.textContent = 'Copy Link';
				}, 2500);
			} else {
				if (shareFeedback) {
					shareFeedback.textContent = 'Please select and copy the link manually.';
					shareFeedback.className = 'tgb-share-feedback tgb-share-feedback--error';
					shareFeedback.style.display = 'block';
				}
			}
		});
	}

	// Delegate guest transfer to shared initMyAccountGuestSync in gun-builder.js
	if (typeof window.TGB_initMyAccountGuestSync === 'function') {
		window.TGB_initMyAccountGuestSync();
	}
})();
</script>