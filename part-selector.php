<?php
/**
 * Plugin Name: Part Selector
 * Plugin URI: https://taktikairsoft.com
 * Description: Modular 2D Airsoft Gun Builder for Taktik Airsoft (transformed from Part Selector).
 * Version: 1.1.0-dev
 * Author: Taktik Airsoft / MTL New Media
 * Author URI: https://taktikairsoft.com
 * Text Domain: part-selector
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// =============================================================================
// Constants
// =============================================================================
define( 'TGB_VERSION', '1.1.0-dev' );
define( 'TGB_PLUGIN_FILE', __FILE__ );
define( 'TGB_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'TGB_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'TGB_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

// =============================================================================
// Foundational Subsystems
// =============================================================================
require_once TGB_PLUGIN_DIR . 'includes/class-tgb-core.php';
require_once TGB_PLUGIN_DIR . 'includes/class-tgb-assets.php';
require_once TGB_PLUGIN_DIR . 'includes/class-tgb-shortcode.php';
require_once TGB_PLUGIN_DIR . 'includes/class-tgb-product-integration.php';
require_once TGB_PLUGIN_DIR . 'includes/class-tgb-part-types.php';
require_once TGB_PLUGIN_DIR . 'includes/class-tgb-mount-interfaces.php';
require_once TGB_PLUGIN_DIR . 'includes/class-tgb-mounting.php';
require_once TGB_PLUGIN_DIR . 'includes/class-tgb-product-config.php';
require_once TGB_PLUGIN_DIR . 'includes/class-tgb-product-data.php';
require_once TGB_PLUGIN_DIR . 'includes/class-tgb-catalog-api.php';

// =============================================================================
// Bootstrap
// =============================================================================
/**
 * Returns the main plugin instance.
 *
 * @return TGB_Core
 */
function taktik_gun_builder() {
	return TGB_Core::instance();
}

// Initialize plugin.
taktik_gun_builder();


/**
 * Register the top-level admin menu item.
 */
function tgb_register_menu() {
	//$hook = 
    add_menu_page(
		__( 'Gun Builder', 'taktik-gun-builder' ),
		__( 'Gun Builder', 'taktik-gun-builder' ),
		'manage_options',
		'taktik-gun-builder',
		'tgb_render_page',
		'dashicons-admin-tools',
		56
	);

	// Only load assets on our own screen.
	//add_action( "admin_print_scripts-{$hook}", 'tgb_enqueue_assets' );
}
add_action( 'admin_menu', 'tgb_register_menu' );

/**
 * Enqueue CSS + JS and pass data to the front end.
 */
function tgb_enqueue_assets() {
	wp_enqueue_style(
		'tgb-fonts',
		'https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@400;500;600&display=swap',
		array(),
		null
	);
	wp_enqueue_style( 'tgb-admin', TGB_URL . 'assets/admin.css', array( 'tgb-fonts' ), TGB_VERSION );
	wp_enqueue_script( 'tgb-admin', TGB_URL . 'assets/admin.js', array(), TGB_VERSION, true );

	wp_localize_script(
		'tgb-admin',
		'TGB',
		array(
			'restUrl'    => esc_url_raw( rest_url( 'taktik-gun-builder/v1/' ) ),
			'nonce'      => wp_create_nonce( 'wp_rest' ),
			/**
			 * Component categories shown as pills. The first one is the
			 * base platform and gates all the others.
			 */
			'categories' => apply_filters(
				'tgb_categories',
				array(
					array( 'id' => 'base',   'label' => __( 'Base Platform', 'taktik-gun-builder' ) ),
				)
			),
			/**
			 * Builder-ready products, keyed by category id.
			 * Replace with a WP_Query / WooCommerce lookup.
			 */
			'products'   => apply_filters( 'tgb_products', array() ),
			'i18n'       => array(
				'items'      => __( 'items', 'taktik-gun-builder' ),
				'item'       => __( 'item', 'taktik-gun-builder' ),
				'noProducts' => __( 'No builder-ready products are available in this category.', 'taktik-gun-builder' ),
			),
		)
	);
}

/**
 * Render the admin page.
 */
function tgb_render_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	require TGB_PLUGIN_DIR . 'templates/admin-page.php';
}