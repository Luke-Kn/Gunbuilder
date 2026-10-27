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
require_once TGB_PLUGIN_DIR . 'includes/class-tgb-cart.php';

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
