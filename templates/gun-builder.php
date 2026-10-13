<?php
/**
 * Main template shell for the Taktik Gun Builder.
 *
 * This file replaces the legacy index.html. It provides a clean, valid semantic HTML
 * container for the Gun Builder, properly scoped inside the WordPress/Astra page content.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$initial_product_id = ! empty( $atts['product_id'] ) ? absint( $atts['product_id'] ) : 0;
?>

<div id="taktik-gun-builder" class="tgb-root" data-version="<?php echo esc_attr( TGB_VERSION ); ?>" data-product-id="<?php echo esc_attr( $initial_product_id ); ?>">

	<!-- Top Bar / Builder Header -->
	<header class="tgb-header">
		<div class="tgb-header-meta">
			<span class="tgb-badge"><?php esc_html_e( 'Taktik Airsoft', 'part-selector' ); ?></span>
			<h1 class="tgb-title"><?php esc_html_e( 'Custom Gun Builder', 'part-selector' ); ?></h1>
			<p class="tgb-subtitle"><?php esc_html_e( 'Interactive 2D Airsoft Weapon & Component Configurator', 'part-selector' ); ?></p>
		</div>
		<div class="tgb-header-status">
			<span class="tgb-status-indicator" title="<?php esc_attr_e( 'Modular Architecture Active', 'part-selector' ); ?>">
				<span class="tgb-status-dot"></span>
				<span class="tgb-status-text"><?php esc_html_e( 'Foundation Active (Part 1)', 'part-selector' ); ?></span>
			</span>
		</div>
	</header>

	<!-- Main Builder Workspace -->
	<div class="tgb-workspace">

		<!-- Primary Visual Viewport / Canvas Region -->
		<section class="tgb-viewport-section" aria-label="<?php esc_attr_e( 'Gun Visual Viewport', 'part-selector' ); ?>">
			<div class="tgb-viewport-container" id="tgb-viewport-container">
				<!-- Canvas / Visual Layer Host -->
				<div class="tgb-stage-wrapper" id="tgb-stage-wrapper">
					<div class="tgb-placeholder-canvas">
						<div class="tgb-placeholder-canvas-inner">
							<svg class="tgb-placeholder-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
								<line x1="8" y1="21" x2="16" y2="21"></line>
								<line x1="12" y1="17" x2="12" y2="21"></line>
							</svg>
							<h3><?php esc_html_e( '2D Interactive Visual Viewport', 'part-selector' ); ?></h3>
							<p>
								<?php esc_html_e( 'Canonical physical scale (1 cm = 10 logical px) and layered component rendering will be mounted here in upcoming development stages.', 'part-selector' ); ?>
							</p>
							<?php if ( $initial_product_id > 0 ) : ?>
								<div class="tgb-target-indicator">
									<span><?php esc_html_e( 'Base Product ID Detected:', 'part-selector' ); ?></span>
									<code>#<?php echo esc_html( $initial_product_id ); ?></code>
								</div>
							<?php endif; ?>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Sidebar / Current Build Summary Region -->
		<aside class="tgb-sidebar-section" aria-label="<?php esc_attr_e( 'Current Build Summary', 'part-selector' ); ?>">
			<div class="tgb-panel tgb-current-build-panel">
				<div class="tgb-panel-header">
					<h2 class="tgb-panel-title"><?php esc_html_e( 'Current Build', 'part-selector' ); ?></h2>
					<span class="tgb-build-count"><?php esc_html_e( '0 Parts', 'part-selector' ); ?></span>
				</div>
				<div class="tgb-panel-body">
					<div class="tgb-placeholder-notice">
						<p><?php esc_html_e( 'Selected weapon base and installed components will be listed here with individual pricing and weight.', 'part-selector' ); ?></p>
					</div>
				</div>
				<div class="tgb-panel-footer">
					<div class="tgb-total-row">
						<span class="tgb-total-label"><?php esc_html_e( 'Estimated Total:', 'part-selector' ); ?></span>
						<span class="tgb-total-value">$0.00</span>
					</div>
					<button type="button" class="tgb-button tgb-button-primary" disabled>
						<?php esc_html_e( 'Add Build to Cart', 'part-selector' ); ?>
					</button>
				</div>
			</div>
		</aside>

	</div>

	<!-- Component Selection Tray / Drawer Region -->
	<section class="tgb-tray-section" aria-label="<?php esc_attr_e( 'Component Selection Tray', 'part-selector' ); ?>">
		<div class="tgb-panel tgb-tray-panel">
			<div class="tgb-panel-header">
				<h2 class="tgb-panel-title"><?php esc_html_e( 'Components & Accessories', 'part-selector' ); ?></h2>
				<span class="tgb-tray-hint"><?php esc_html_e( 'Dynamic Category Drawer', 'part-selector' ); ?></span>
			</div>
			<div class="tgb-panel-body">
				<div class="tgb-placeholder-notice">
					<p><?php esc_html_e( 'Dynamic admin-managed part categories (Optics, Silencers, Grips, etc.) and compatible inventory items will be loaded dynamically here.', 'part-selector' ); ?></p>
				</div>
			</div>
		</div>
	</section>

</div>
