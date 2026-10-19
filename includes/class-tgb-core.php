<?php
/**
 * Core plugin class for Taktik Gun Builder.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Core
 *
 * Coordinates initialization, hooks, and sub-components.
 */
class TGB_Core {

	/**
	 * Single instance of the class.
	 *
	 * @var TGB_Core|null
	 */
	private static $instance = null;

	/**
	 * Returns the single instance of the class.
	 *
	 * @return TGB_Core
	 */
	public static function instance() {
		if ( is_null( self::$instance ) ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->init_hooks();
		$this->init_components();
	}

	/**
	 * Register core WordPress hooks.
	 */
	private function init_hooks() {
		add_action( 'init', array( $this, 'on_init' ) );
	}

	/**
	 * Initialize sub-components.
	 */
	private function init_components() {
		TGB_Assets::init();
		TGB_Shortcode::init();
		TGB_Product_Integration::init();
		TGB_Part_Types::init();
		TGB_Product_Config::init();
		TGB_Product_Data::init();
	}

	/**
	 * General init callback.
	 */
	public function on_init() {
		// Translation / text domain loading ready for future localization.
		load_plugin_textdomain( 'part-selector', false, dirname( TGB_PLUGIN_BASENAME ) . '/languages' );
	}
}
