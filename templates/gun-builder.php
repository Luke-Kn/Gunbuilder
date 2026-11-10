<?php
/**
 * Main template shell for the Taktik Gun Builder.
 *
 * Implements the Canonical 2D Layered DOM Renderer viewport (Part 4),
 * scoped initial render data, and modern tactical visual workspace.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$raw_product_id      = ! empty( $atts['product_id'] ) ? absint( $atts['product_id'] ) : 0;
$initial_render_data = isset( $initial_render_data ) && is_array( $initial_render_data )
	? $initial_render_data
	: TGB_Shortcode::resolve_initial_render_data( $raw_product_id );
?>

<div id="taktik-gun-builder" class="tgb-root" data-version="<?php echo esc_attr( TGB_VERSION ); ?>" data-product-id="<?php echo esc_attr( $raw_product_id ); ?>" data-render-status="<?php echo esc_attr( $initial_render_data['status'] ); ?>">

	<!-- Scoped Initial Render Data (Section 11) -->
	<script type="application/json" class="tgb-initial-render-data"><?php echo wp_json_encode( $initial_render_data ); ?></script>

	<!-- Top Bar / Builder Header -->
	<header class="tgb-header">
		<div class="tgb-header-meta">
			<span class="tgb-badge"><?php esc_html_e( 'Taktik Airsoft', 'part-selector' ); ?></span>
			<h1 class="tgb-title"><?php esc_html_e( 'Gun Builder', 'part-selector' ); ?></h1>
			<p class="tgb-subtitle"><?php esc_html_e( 'Build your setup with compatible parts.', 'part-selector' ); ?></p>
		</div>
	</header>

	<!-- Public Shared Build Preview Banner (Part 6) -->
	<div class="tgb-shared-preview-banner" id="tgb-shared-preview-banner" style="display: none;" role="region" aria-label="<?php esc_attr_e( 'Shared Build Preview', 'part-selector' ); ?>">
		<div class="tgb-shared-banner__content">
			<div class="tgb-shared-banner__icon">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
			</div>
			<div class="tgb-shared-banner__text">
				<div class="tgb-shared-banner__title-row">
					<span class="tgb-shared-banner__badge"><?php esc_html_e( 'Read-Only Preview', 'part-selector' ); ?></span>
					<strong class="tgb-shared-banner__build-name" id="tgb-shared-build-name"></strong>
					<span class="tgb-shared-banner__price" id="tgb-shared-build-price"></span>
				</div>
				<p class="tgb-shared-banner__subtitle" id="tgb-shared-banner-subtitle">
					<?php esc_html_e( 'Viewing a shared configuration. Pricing reflects current store availability. Click Customize a Copy to edit your own version.', 'part-selector' ); ?>
				</p>
				<div class="tgb-shared-banner__warnings" id="tgb-shared-banner-warnings" style="display: none;"></div>
			</div>
			<div class="tgb-shared-banner__actions">
				<button type="button" class="tgb-btn tgb-btn--primary tgb-btn--customize-copy" id="tgb-btn-customize-copy">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
					<span><?php esc_html_e( 'Customize a Copy', 'part-selector' ); ?></span>
				</button>
			</div>
		</div>
	</div>

	<!-- Guest & Account Multi-Build Manager (Parts 4 & 5) -->
	<section class="tgb-build-manager" id="tgb-build-manager" aria-label="<?php esc_attr_e( 'Builds Manager', 'part-selector' ); ?>">
		<div class="tgb-build-manager__inner">
			<div class="tgb-build-manager__info">
				<div class="tgb-build-manager__title-wrap">
					<span class="tgb-build-manager__label"><?php esc_html_e( 'Session Builds', 'part-selector' ); ?></span>
					<span class="tgb-build-manager__counter" id="tgb-build-counter" aria-label="<?php esc_attr_e( 'Build count', 'part-selector' ); ?>">1 / 10</span>
					<span class="tgb-dirty-badge" id="tgb-dirty-badge" style="display: none;" title="<?php esc_attr_e( 'You have unsaved changes', 'part-selector' ); ?>">
						<?php esc_html_e( 'Unsaved', 'part-selector' ); ?>
					</span>
					<span class="tgb-account-pill" id="tgb-account-pill" style="display: none;">
						<?php esc_html_e( 'Account Build', 'part-selector' ); ?>
					</span>
				</div>
				<p class="tgb-build-manager__disclaimer" id="tgb-build-manager-disclaimer">
					<?php if ( is_user_logged_in() ) : ?>
						<?php
						$current_user = wp_get_current_user();
						printf(
							/* translators: %s: username */
							esc_html__( 'Logged in as %s. Click Save Build to store configurations permanently in your account (up to 10).', 'part-selector' ),
							'<strong>' . esc_html( $current_user->display_name ) . '</strong>'
						);
						?>
					<?php else : ?>
						<?php esc_html_e( 'Saved for this browser tab only. Log in or register to save builds permanently to your account.', 'part-selector' ); ?>
					<?php endif; ?>
				</p>
			</div>
			<div class="tgb-build-manager__controls">
				<div class="tgb-build-manager__select-wrap">
					<label for="tgb-build-select" class="screen-reader-text"><?php esc_html_e( 'Select Active Build', 'part-selector' ); ?></label>
					<select class="tgb-build-select" id="tgb-build-select" aria-label="<?php esc_attr_e( 'Select Active Build', 'part-selector' ); ?>">
						<option value="build-1"><?php esc_html_e( 'Build 1', 'part-selector' ); ?></option>
					</select>
				</div>
				<div class="tgb-build-manager__actions">
					<?php if ( is_user_logged_in() ) : ?>
						<button type="button" class="tgb-btn-build tgb-btn-build--save" id="tgb-btn-save-build" title="<?php esc_attr_e( 'Save build permanently to your account', 'part-selector' ); ?>">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
							<span id="tgb-btn-save-label"><?php esc_html_e( 'Save Build', 'part-selector' ); ?></span>
						</button>
						<button type="button" class="tgb-btn-build tgb-btn-build--save-as-new" id="tgb-btn-save-as-new" style="display: none;" title="<?php esc_attr_e( 'Save this modified configuration as a separate new build', 'part-selector' ); ?>">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
							<span><?php esc_html_e( 'Save As New', 'part-selector' ); ?></span>
						</button>
						<button type="button" class="tgb-btn-build tgb-btn-build--account-list" id="tgb-btn-my-saved-builds" title="<?php esc_attr_e( 'Browse your permanently saved account builds', 'part-selector' ); ?>">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
							<span><?php esc_html_e( 'My Saved Builds', 'part-selector' ); ?></span>
						</button>
					<?php endif; ?>
					<button type="button" class="tgb-btn-build tgb-btn-build--share" id="tgb-btn-share-build" title="<?php esc_attr_e( 'Generate a secure share link for this build', 'part-selector' ); ?>">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
						<span><?php esc_html_e( 'Share Build', 'part-selector' ); ?></span>
					</button>
					<button type="button" class="tgb-btn-build tgb-btn-build--new" id="tgb-btn-new-build" title="<?php esc_attr_e( 'Create a new build (up to 10)', 'part-selector' ); ?>">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
						<span><?php esc_html_e( 'New Build', 'part-selector' ); ?></span>
					</button>
					<button type="button" class="tgb-btn-build tgb-btn-build--rename" id="tgb-btn-rename-build" title="<?php esc_attr_e( 'Rename this build', 'part-selector' ); ?>">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
						<span><?php esc_html_e( 'Rename', 'part-selector' ); ?></span>
					</button>
					<button type="button" class="tgb-btn-build tgb-btn-build--reset" id="tgb-btn-reset-build" title="<?php esc_attr_e( 'Reset active build', 'part-selector' ); ?>">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
						<span><?php esc_html_e( 'Reset', 'part-selector' ); ?></span>
					</button>
					<button type="button" class="tgb-btn-build tgb-btn-build--delete" id="tgb-btn-delete-build" disabled aria-disabled="true" title="<?php esc_attr_e( 'Cannot delete the only build', 'part-selector' ); ?>">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
						<span><?php esc_html_e( 'Delete', 'part-selector' ); ?></span>
					</button>
				</div>
			</div>
		</div>
	</section>

	<!-- Main Builder Workspace -->
	<div class="tgb-workspace">

		<!-- Primary Visual Viewport Section -->
		<section class="tgb-viewport-section" aria-label="<?php esc_attr_e( 'Gun Visual Viewport', 'part-selector' ); ?>">
			<div class="tgb-viewport-container" id="tgb-viewport-container">
				<div class="tgb-stage-viewport" id="tgb-stage-viewport">

					<!-- Loading State (Image Preloading) -->
					<div class="tgb-stage-loading" id="tgb-stage-loading" style="display: none;" aria-live="polite">
						<div class="tgb-spinner"></div>
						<span class="tgb-loading-text"><?php esc_html_e( 'Loading weapon blueprint...', 'part-selector' ); ?></span>
					</div>

					<!-- Error State (Image Load Failure) -->
					<div class="tgb-stage-state tgb-stage-state--error" id="tgb-stage-error" style="display: none;" role="alert">
						<div class="tgb-state-icon">
							<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="10"></circle>
								<line x1="12" y1="8" x2="12" y2="12"></line>
								<line x1="12" y1="16" x2="12.01" y2="16"></line>
							</svg>
						</div>
						<h3 class="tgb-state-title"><?php esc_html_e( 'Image Load Failed', 'part-selector' ); ?></h3>
						<p class="tgb-state-desc"><?php esc_html_e( 'Unable to load weapon imagery. Please check your connection or contact support.', 'part-selector' ); ?></p>
					</div>

					<!-- Empty State (No product_id provided) -->
					<div class="tgb-stage-state tgb-stage-state--empty" id="tgb-stage-empty" <?php echo ( 'empty' === $initial_render_data['status'] ) ? '' : 'style="display: none;"'; ?>>
						<div class="tgb-state-icon">
							<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
								<circle cx="8.5" cy="8.5" r="1.5"></circle>
								<polyline points="21 15 16 10 5 21"></polyline>
							</svg>
						</div>
						<h3 class="tgb-state-title"><?php esc_html_e( 'Choose a base platform to begin your build', 'part-selector' ); ?></h3>
						<p class="tgb-state-desc"><?php esc_html_e( 'Select a base gun from the catalog below to start customizing your loadout.', 'part-selector' ); ?></p>
					</div>

					<!-- Invalid Product State (Ineligible / Part ID / Missing) -->
					<div class="tgb-stage-state tgb-stage-state--invalid" id="tgb-stage-invalid" <?php echo ( 'invalid' === $initial_render_data['status'] ) ? '' : 'style="display: none;"'; ?>>
						<div class="tgb-state-icon">
							<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
								<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
								<line x1="12" y1="9" x2="12" y2="13"></line>
								<line x1="12" y1="17" x2="12.01" y2="17"></line>
							</svg>
						</div>
						<h3 class="tgb-state-title"><?php esc_html_e( 'Product Unavailable', 'part-selector' ); ?></h3>
						<p class="tgb-state-desc"><?php esc_html_e( 'This product is not currently available in the Gun Builder. Choose a base platform below to start.', 'part-selector' ); ?></p>
					</div>

					<!-- Physical Display Frame & Canonical Logical Stage (Section 15) -->
					<div class="tgb-stage-frame" id="tgb-stage-frame" <?php echo ( 'ready' === $initial_render_data['status'] ) ? '' : 'style="display: none;"'; ?>>
						<div class="tgb-stage" id="tgb-stage">
							<!-- Layer elements are mounted here by the generic TGB Layered DOM Renderer -->
						</div>
					</div>

					<!-- Measurement HUD (Internal / Debug mode only) -->
					<div class="tgb-stage-hud" id="tgb-stage-hud" aria-hidden="true">
						<span class="tgb-stage-hud__scale" id="tgb-stage-hud-scale"></span>
					</div>

				</div>
			</div>
		</section>

		<!-- Sidebar / Current Build Summary Region -->
		<aside class="tgb-sidebar-section" aria-label="<?php esc_attr_e( 'Current Build Summary', 'part-selector' ); ?>">
			<div class="tgb-panel tgb-current-build-panel">
				<div class="tgb-panel-header">
					<h2 class="tgb-panel-title"><?php esc_html_e( 'Current Build', 'part-selector' ); ?></h2>
					<div class="tgb-panel-header-actions">
						<span class="tgb-build-count" id="tgb-sidebar-build-count">
							<?php echo ( 'ready' === $initial_render_data['status'] ) ? esc_html__( '1 Weapon', 'part-selector' ) : esc_html__( '0 Items', 'part-selector' ); ?>
						</span>
						<button type="button" class="tgb-btn-reset-build" id="tgb-reset-build-btn" aria-label="<?php esc_attr_e( 'Reset build', 'part-selector' ); ?>" title="<?php esc_attr_e( 'Reset build', 'part-selector' ); ?>" style="display: none;">
							<?php esc_html_e( 'Reset', 'part-selector' ); ?>
						</button>
					</div>
				</div>
				<div class="tgb-panel-body" id="tgb-sidebar-build-body">
					<?php if ( 'ready' === $initial_render_data['status'] && ! empty( $initial_render_data['product'] ) ) : ?>
						<div class="tgb-current-base-card" id="tgb-sidebar-base-card">
							<div class="tgb-card-tag"><?php esc_html_e( 'Base Platform', 'part-selector' ); ?></div>
							<h3 class="tgb-card-title"><?php echo esc_html( $initial_render_data['product']['name'] ); ?></h3>
							<div class="tgb-card-specs">
								<span class="tgb-spec-item">
									<span class="tgb-spec-label"><?php esc_html_e( 'Length:', 'part-selector' ); ?></span>
									<span class="tgb-spec-value"><?php echo esc_html( $initial_render_data['product']['reference_mm'] ); ?> mm</span>
								</span>
							</div>
						</div>
					<?php else : ?>
						<div class="tgb-placeholder-notice" id="tgb-sidebar-placeholder">
							<p><?php esc_html_e( 'Choose a base platform below to begin your build.', 'part-selector' ); ?></p>
						</div>
					<?php endif; ?>
				</div>
			</div>
		</aside>

	</div>

	<!-- Product Selection Region (Part 6) -->
	<section class="tgb-tray-section" aria-label="<?php esc_attr_e( 'Product Selection', 'part-selector' ); ?>">
		<div class="tgb-panel tgb-tray-panel">
			<div class="tgb-panel-header">
				<h2 class="tgb-panel-title"><?php esc_html_e( 'Choose components for your build', 'part-selector' ); ?></h2>
			</div>
			<div class="tgb-panel-body tgb-selection-body">
				<!-- Category Navigation Strip -->
				<nav class="tgb-category-nav" id="tgb-category-nav" aria-label="<?php esc_attr_e( 'Product Categories', 'part-selector' ); ?>" role="tablist">
					<!-- Dynamically populated: Base Platform + taxonomy terms -->
				</nav>

				<!-- Subcategory Navigation Strip (Hierarchical children) -->
				<nav class="tgb-subcategory-nav" id="tgb-subcategory-nav" aria-label="<?php esc_attr_e( 'Subcategories', 'part-selector' ); ?>" style="display: none;">
					<!-- Dynamically populated with child categories -->
				</nav>

				<!-- Tray Status Notification (e.g. empty or error) -->
				<div class="tgb-tray-status" id="tgb-tray-status" style="display: none;"></div>

				<!-- Catalog Loading Skeletons -->
				<div class="tgb-catalog-loading" id="tgb-catalog-loading" style="display: none;" aria-live="polite">
					<div class="tgb-skeleton-card">
						<div class="tgb-skeleton-thumb"></div>
						<div class="tgb-skeleton-line tgb-skeleton-line--title"></div>
						<div class="tgb-skeleton-line tgb-skeleton-line--price"></div>
						<div class="tgb-skeleton-btn"></div>
					</div>
					<div class="tgb-skeleton-card">
						<div class="tgb-skeleton-thumb"></div>
						<div class="tgb-skeleton-line tgb-skeleton-line--title"></div>
						<div class="tgb-skeleton-line tgb-skeleton-line--price"></div>
						<div class="tgb-skeleton-btn"></div>
					</div>
					<div class="tgb-skeleton-card">
						<div class="tgb-skeleton-thumb"></div>
						<div class="tgb-skeleton-line tgb-skeleton-line--title"></div>
						<div class="tgb-skeleton-line tgb-skeleton-line--price"></div>
						<div class="tgb-skeleton-btn"></div>
					</div>
					<div class="tgb-skeleton-card">
						<div class="tgb-skeleton-thumb"></div>
						<div class="tgb-skeleton-line tgb-skeleton-line--title"></div>
						<div class="tgb-skeleton-line tgb-skeleton-line--price"></div>
						<div class="tgb-skeleton-btn"></div>
					</div>
				</div>

				<!-- Products Grid -->
				<div class="tgb-catalog-grid" id="tgb-catalog-grid" role="tabpanel" aria-live="polite"></div>

				<!-- Catalog Continuation Actions -->
				<div class="tgb-catalog-actions" id="tgb-catalog-actions" style="display: none;">
					<button type="button" class="tgb-btn tgb-btn--secondary tgb-load-more-btn" id="tgb-load-more-btn">
						<?php esc_html_e( 'Load More', 'part-selector' ); ?>
					</button>
				</div>
			</div>
		</div>
	</section>

	<!-- Accessible Screen Reader Live Announcer (Part 8) -->
	<div class="screen-reader-text" id="tgb-live-announcer" aria-live="polite" aria-atomic="true"></div>

	<?php if ( is_user_logged_in() ) : ?>
		<!-- In-Builder Saved Builds Modal (Part 5) -->
		<div class="tgb-modal-backdrop" id="tgb-saved-builds-modal" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="tgb-modal-title">
			<div class="tgb-modal-panel">
				<div class="tgb-modal-header">
					<h3 class="tgb-modal-title" id="tgb-modal-title"><?php esc_html_e( 'My Saved Builds', 'part-selector' ); ?></h3>
					<button type="button" class="tgb-modal-close" id="tgb-modal-close-btn" aria-label="<?php esc_attr_e( 'Close', 'part-selector' ); ?>">&times;</button>
				</div>
				<div class="tgb-modal-body" id="tgb-modal-saved-builds-body">
					<!-- Dynamically injected saved builds list -->
				</div>
			</div>
		</div>
	<?php endif; ?>

	<!-- Share Build Modal Dialog (Part 6) -->
	<div class="tgb-modal-backdrop" id="tgb-share-modal" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="tgb-share-modal-title">
		<div class="tgb-modal-panel tgb-modal-panel--share">
			<div class="tgb-modal-header">
				<h3 class="tgb-modal-title" id="tgb-share-modal-title"><?php esc_html_e( 'Share This Gun Build', 'part-selector' ); ?></h3>
				<button type="button" class="tgb-modal-close" id="tgb-share-modal-close" aria-label="<?php esc_attr_e( 'Close', 'part-selector' ); ?>">&times;</button>
			</div>
			<div class="tgb-modal-body" id="tgb-share-modal-body">
				<p class="tgb-share-modal-desc">
					<?php esc_html_e( 'Anyone with this secure link can view your gun configuration, review components, and customize their own copy.', 'part-selector' ); ?>
				</p>
				<div class="tgb-share-input-group">
					<input type="text" class="tgb-share-url-input" id="tgb-share-url-input" readonly aria-label="<?php esc_attr_e( 'Shareable Link', 'part-selector' ); ?>" />
					<button type="button" class="tgb-btn tgb-btn--primary tgb-btn--copy-link" id="tgb-btn-copy-link">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
						<span id="tgb-btn-copy-label"><?php esc_html_e( 'Copy Link', 'part-selector' ); ?></span>
					</button>
				</div>
				<p class="tgb-share-expiration-note" id="tgb-share-expiration-note"></p>
				<div class="tgb-share-feedback" id="tgb-share-feedback" style="display: none;" role="alert"></div>
			</div>
		</div>
	</div>

</div>
