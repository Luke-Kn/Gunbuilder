<?php
/**
 * Asset management class for Taktik Gun Builder.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Assets
 *
 * Handles registration and scoped enqueuing of CSS and JavaScript.
 */
class TGB_Assets {

	/**
	 * Tracks whether builder assets have already been enqueued for this request.
	 *
	 * @var bool
	 */
	private static $enqueued = false;

	/**
	 * Initialize asset hooks.
	 */
	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'register_assets' ), 10 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_enqueue_for_post' ), 20 );
	}

	/**
	 * Register Gun Builder scripts and styles without enqueuing them globally.
	 */
	public static function register_assets() {
		$js_ver  = file_exists( TGB_PLUGIN_DIR . 'assets/js/gun-builder.js' ) ? filemtime( TGB_PLUGIN_DIR . 'assets/js/gun-builder.js' ) : TGB_VERSION;
		$css_ver = file_exists( TGB_PLUGIN_DIR . 'assets/css/gun-builder.css' ) ? filemtime( TGB_PLUGIN_DIR . 'assets/css/gun-builder.css' ) : TGB_VERSION;

		// Scoped Gun Builder CSS.
		wp_register_style(
			'tgb-gun-builder-css',
			TGB_PLUGIN_URL . 'assets/css/gun-builder.css',
			array(),
			$css_ver,
			'all'
		);

		// Lightweight Gun Builder JS foundation.
		wp_register_script(
			'tgb-gun-builder-js',
			TGB_PLUGIN_URL . 'assets/js/gun-builder.js',
			array(),
			$js_ver,
			true
		);

		// Localize parameters for AJAX / REST API integration.
		wp_localize_script(
			'tgb-gun-builder-js',
			'taktikGunBuilder',
			array(
				'version'  => TGB_VERSION,
				'ajaxUrl'  => admin_url( 'admin-ajax.php' ),
				'restUrl'  => esc_url_raw( rest_url( 'tgb/v1/' ) ),
				'siteUrl'   => home_url(),
				'cartUrl'   => function_exists( 'wc_get_cart_url' ) ? wc_get_cart_url() : home_url( '/cart/' ),
				'cartNonce' => wp_create_nonce( TGB_Cart::NONCE_ACTION ),
				'isLoggedIn' => is_user_logged_in(),
				'isAccountPage' => ( function_exists( 'is_account_page' ) && is_account_page() ),
				'currentUserId' => get_current_user_id(),
				'restNonce' => wp_create_nonce( 'wp_rest' ),
				'myAccountUrl' => function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'myaccount' ) : home_url( '/my-account/' ),
				'myAccountSavedBuildsUrl' => function_exists( 'wc_get_endpoint_url' ) ? wc_get_endpoint_url( 'gun-builder-builds', '', wc_get_page_permalink( 'myaccount' ) ) : home_url( '/my-account/gun-builder-builds/' ),
				'savedBuildsUrl' => esc_url_raw( rest_url( 'tgb/v1/saved-builds' ) ),
				'savedBuildsRestUrl' => esc_url_raw( rest_url( 'tgb/v1/saved-builds' ) ),
				'sharesRestUrl' => esc_url_raw( rest_url( 'tgb/v1/shares' ) ),
				'mySharesRestUrl' => esc_url_raw( rest_url( 'tgb/v1/my-shares' ) ),
				'builderPageUrl' => TGB_Shortcode::get_builder_page_url(),
				'currency' => array(
					'code'               => function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'CAD',
					'symbol'             => function_exists( 'get_woocommerce_currency_symbol' ) ? html_entity_decode( get_woocommerce_currency_symbol(), ENT_QUOTES, 'UTF-8' ) : '$',
					'decimals'           => function_exists( 'wc_get_price_decimals' ) ? wc_get_price_decimals() : 2,
					'decimal_separator'  => function_exists( 'wc_get_price_decimal_separator' ) ? wc_get_price_decimal_separator() : '.',
					'thousand_separator' => function_exists( 'wc_get_price_thousand_separator' ) ? wc_get_price_thousand_separator() : ',',
					'price_format'       => function_exists( 'get_woocommerce_price_format' ) ? get_woocommerce_price_format() : '%1$s%2$s',
				),
				'weight'   => array(
					'unit' => (string) get_option( 'woocommerce_weight_unit', 'kg' ),
				),
			)
		);
	}

	/**
	 * Detects if the current queried post contains [part_selector] and enqueues before wp_head.
	 */
	public static function maybe_enqueue_for_post() {
		if ( is_singular() ) {
			$post = get_post();
			if ( $post && is_a( $post, 'WP_Post' ) && has_shortcode( $post->post_content, 'part_selector' ) ) {
				self::enqueue();
			}
		}

		// Also enqueue on WooCommerce My Account pages for logged-in customers to support My Gun Builds UI and guest transfer.
		if ( function_exists( 'is_account_page' ) && is_account_page() && is_user_logged_in() ) {
			self::enqueue();
		}
	}

	/**
	 * Enqueue assets when the Gun Builder shortcode or template is invoked.
	 */
	public static function enqueue() {
		if ( self::$enqueued ) {
			return;
		}

		wp_enqueue_style( 'tgb-gun-builder-css' );
		wp_enqueue_script( 'tgb-gun-builder-js' );

		self::$enqueued = true;
	}
}
