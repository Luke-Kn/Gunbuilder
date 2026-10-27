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

		$currency_settings = array(
			'code'               => function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'CAD',
			'symbol'             => function_exists( 'get_woocommerce_currency_symbol' ) ? html_entity_decode( get_woocommerce_currency_symbol(), ENT_QUOTES, 'UTF-8' ) : '$',
			'decimals'           => function_exists( 'wc_get_price_decimals' ) ? wc_get_price_decimals() : 2,
			'decimal_separator'  => function_exists( 'wc_get_price_decimal_separator' ) ? wc_get_price_decimal_separator() : '.',
			'thousand_separator' => function_exists( 'wc_get_price_thousand_separator' ) ? wc_get_price_thousand_separator() : ',',
			'price_format'       => function_exists( 'get_woocommerce_price_format' ) ? get_woocommerce_price_format() : '%1$s%2$s',
		);

		$store_weight_unit = (string) get_option( 'woocommerce_weight_unit', 'kg' );

		if ( $product_id <= 0 ) {
			return array(
				'status'      => 'empty',
				'message'     => __( 'Select a base gun to start your build.', 'part-selector' ),
				'product'     => null,
				'currency'    => $currency_settings,
				'weight_unit' => $store_weight_unit,
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
				'status'      => 'invalid',
				'message'     => __( 'This product is not currently available in the Gun Builder.', 'part-selector' ),
				'product'     => null,
				'currency'    => $currency_settings,
				'weight_unit' => $store_weight_unit,
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
			'price'         => $serialized_data['price'] ?? null,
			'weight'        => $serialized_data['weight'] ?? null,
			'mounting'      => $serialized_data['mounting'] ?? null,
		);

		return array(
			'status'      => 'ready',
			'message'     => '',
			'product'     => $render_product,
			'currency'    => $currency_settings,
			'weight_unit' => $store_weight_unit,
		);
	}
}
