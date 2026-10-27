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
				<button type="button" class="tgb-toggle" role="switch" aria-checked="false" id="tgb-compatible-toggle">
	<span class="tgb-toggle__track" aria-hidden="true">
		<span class="tgb-toggle__thumb"></span>
	</span>
	<span class="tgb-toggle__label">Compatible only</span>
	<span class="tgb-toggle__state" aria-hidden="true">OFF</span>
</button>
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

</div>
