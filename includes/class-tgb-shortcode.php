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

		$raw_product_id      = absint( $atts['product_id'] );
		$initial_render_data = self::resolve_initial_render_data( $raw_product_id );

		// Locate clean template.
		$template_path = TGB_PLUGIN_DIR . 'templates/gun-builder.php';

		if ( ! file_exists( $template_path ) ) {
			return '<!-- Taktik Gun Builder: Template not found -->';
		}

		ob_start();
		include $template_path;
		return ob_get_clean();
	}

	/**
	 * Resolves initial Base Gun render data safely.
	 *
	 * Evaluates catalog eligibility and Base Gun role. Never fatals on invalid IDs.
	 * Returns sanitized structure for frontend consumption.
	 *
	 * @param int $product_id Raw product ID.
	 * @return array Initial render data { status, message, product }.
	 */
	public static function resolve_initial_render_data( $product_id ) {
		$product_id = absint( $product_id );

		if ( $product_id <= 0 ) {
			return array(
				'status'  => 'empty',
				'message' => __( 'Select a base gun to start your build.', 'part-selector' ),
				'product' => null,
			);
		}

		$product_data = TGB_Product_Data::get_product_data( $product_id );

		// Product must exist, be catalog eligible, and have role = base_gun.
		if (
			! $product_data ||
			true !== $product_data['catalog_eligible'] ||
			TGB_Product_Config::ROLE_BASE_GUN !== $product_data['role'] ||
			empty( $product_data['builder_image'] )
		) {
			return array(
				'status'  => 'invalid',
				'message' => __( 'This product is not currently available in the Gun Builder.', 'part-selector' ),
				'product' => null,
			);
		}

		// Prepare strictly scoped rendering payload (Section 11).
		$serialized_data = TGB_Catalog_API::serialize_product( $product_data );
		$render_product = array(
			'id'            => (int) $product_data['id'],
			'name'          => (string) $product_data['name'],
			'role'          => (string) $product_data['role'],
			'reference_mm'  => (float) $product_data['reference_mm'],
			'builder_image' => array(
				'url'          => (string) $product_data['builder_image']['url'],
				'width'        => (int) $product_data['builder_image']['width'],
				'height'       => (int) $product_data['builder_image']['height'],
				'aspect_ratio' => (float) $product_data['builder_image']['aspect_ratio'],
				'alt'          => (string) $product_data['builder_image']['alt'],
			),
			'mounting'      => $serialized_data['mounting'] ?? null,
		);

		return array(
			'status'  => 'ready',
			'message' => '',
			'product' => $render_product,
		);
	}
}
