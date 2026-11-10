<?php
/**
 * WooCommerce single product integration class for Taktik Gun Builder.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Product_Integration
 *
 * Preserves the single product page integration hook while safely isolating
 * legacy 404 redirects until builder-ready products and page URLs are configured.
 */
class TGB_Product_Integration {

	/**
	 * Initialize product integration hooks.
	 */
	public static function init() {
		add_action( 'woocommerce_after_add_to_cart_button', array( __CLASS__, 'render_customize_button' ) );
	}

	/**
	 * Hook callback for woocommerce_after_add_to_cart_button.
	 *
	 * In Part 1, this integration point is preserved and isolated.
	 * It is controlled via the `tgb_enable_product_customize_button` filter (default false)
	 * to prevent legacy 404 redirects until Part 2/3 establishes Builder-Ready product flags.
	 */
	public static function render_customize_button() {
		/**
		 * Filter to control display of the Customize button on single product pages.
		 *
		 * @param bool $enabled Whether the button is enabled. Defaults to false during Stage 1.
		 */
		$is_enabled = apply_filters( 'tgb_enable_product_customize_button', false );

		if ( ! $is_enabled ) {
			return;
		}

		global $product;
		if ( ! $product || ! is_a( $product, 'WC_Product' ) ) {
			return;
		}

		$product_id  = $product->get_id();
		$builder_url = apply_filters( 'tgb_builder_page_url', '' );

		if ( empty( $builder_url ) ) {
			return;
		}

		$target_url = add_query_arg( 'product_id', $product_id, $builder_url );
		?>
		<a href="<?php echo esc_url( $target_url ); ?>"
		   class="button alt taktik-builder-launch-button"
		   style="margin-left: 10px;"
		   data-product-id="<?php echo esc_attr( $product_id ); ?>">
			<?php esc_html_e( 'Customize in Gun Builder', 'part-selector' ); ?>
		</a>
		<?php
	}
}
