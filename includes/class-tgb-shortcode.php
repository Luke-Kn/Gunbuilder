<?php
/**
 * Shortcode management class for Taktik Gun Builder.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Shortcode
 *
 * Handles the [part_selector] shortcode registration and template rendering.
 */
class TGB_Shortcode {

	/**
	 * Initialize shortcode hooks.
	 */
	public static function init() {
		// Preserves the existing primary shortcode name [part_selector].
		add_shortcode( 'part_selector', array( __CLASS__, 'render' ) );
	}

	/**
	 * Render the Gun Builder shortcode template.
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string Rendered HTML markup.
	 */
	public static function render( $atts = array() ) {
		// Enqueue modern scoped assets on demand.
		TGB_Assets::enqueue();

		// Sanitize attributes if any are passed.
		$atts = shortcode_atts(
			array(
				'product_id' => isset( $_GET['product_id'] ) ? absint( $_GET['product_id'] ) : 0,
			),
			$atts,
			'part_selector'
		);

		// Locate clean template.
		$template_path = TGB_PLUGIN_DIR . 'templates/gun-builder.php';

		if ( ! file_exists( $template_path ) ) {
			return '<!-- Taktik Gun Builder: Template not found -->';
		}

		ob_start();
		include $template_path;
		return ob_get_clean();
	}
}
