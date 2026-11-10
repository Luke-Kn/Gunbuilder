<?php
/**
 * Asset management class for Taktik Gun Builder.
 *
 * @package TaktikGunBuilder
 */

if (!defined('ABSPATH')) {
	exit;
}

/**
 * Class TGB_Assets
 *
 * Handles registration and scoped enqueuing of CSS and JavaScript.
 */
class TGB_Assets
{

	/**
	 * Tracks whether builder assets have already been enqueued for this request.
	 *
	 * @var bool
	 */
	private static $enqueued = false;

	/**
	 * Initialize asset hooks.
	 */
	public static function init()
	{
		add_action('wp_enqueue_scripts', array(__CLASS__, 'register_assets'), 10);
		add_action('wp_enqueue_scripts', array(__CLASS__, 'maybe_enqueue_for_post'), 20);
	}

	/**
	 * Register Gun Builder scripts and styles without enqueuing them globally.
	 */
	public static function register_assets()
	{
		$js_ver = file_exists(TGB_PLUGIN_DIR . 'assets/js/gun-builder.js') ? filemtime(TGB_PLUGIN_DIR . 'assets/js/gun-builder.js') : TGB_VERSION;
		$css_ver = file_exists(TGB_PLUGIN_DIR . 'assets/css/gun-builder.css') ? filemtime(TGB_PLUGIN_DIR . 'assets/css/gun-builder.css') : TGB_VERSION;

		// Scoped Gun Builder CSS.
		wp_register_style(
			'tgb-gun-builder-css',
			TGB_PLUGIN_URL . 'assets/css/gun-builder.css',
			array(),
			TGB_VERSION,
			'all'
		);

		wp_register_style(
			'tgb-gun-build-list-css',
			TGB_PLUGIN_URL . 'assets/css/build-list.css',
			array(),
			TGB_VERSION,
			'all'
		);

		wp_register_style(
			'tgb-gun-builder-cart-css',
			TGB_PLUGIN_URL . 'assets/css/cart.css',
			array(),
			TGB_VERSION,
			'all'
		);


		wp_register_style(
			'tgb-gun-builder-category-css',
			TGB_PLUGIN_URL . 'assets/css/category.css',
			array(),
			TGB_VERSION,
			'all'
		);

		wp_register_style(
			'tgb-gun-builder-compatibility-toggle-css',
			TGB_PLUGIN_URL . 'assets/css/compatibility-toggle.css',
			array(),
			TGB_VERSION,
			'all'
		);

		wp_register_style(
			'tgb-gun-builder-header-css',
			TGB_PLUGIN_URL . 'assets/css/header.css',
			array(),
			TGB_VERSION,
			'all'
		);

		wp_register_style(
			'tgb-gun-builder-item-card-css',
			TGB_PLUGIN_URL . 'assets/css/item-card.css',
			array(),
			TGB_VERSION,
			'all'
		);

		wp_register_style(
			'tgb-gun-builder-mobile-css',
			TGB_PLUGIN_URL . 'assets/css/mobile.css',
			array(),
			TGB_VERSION,
			'all'
		);

		wp_register_style(
			'tgb-gun-builder-root-css',
			TGB_PLUGIN_URL . 'assets/css/root.css',
			array(),
			TGB_VERSION,
			'all'
		);

		wp_register_style(
			'tgb-gun-builder-search-bar-css',
			TGB_PLUGIN_URL . 'assets/css/search-bar.css',
			array(),
			TGB_VERSION,
			'all'
		);

		wp_register_style(
			'tgb-gun-builder-size-slider-css',
			TGB_PLUGIN_URL . 'assets/css/size-slider.css',
			array(),
			TGB_VERSION,
			'all'
		);

		wp_register_style(
			'tgb-gun-builder-stage-css',
			TGB_PLUGIN_URL . 'assets/css/stage.css',
			array(),
			TGB_VERSION,
			$css_ver,
			'all'
		);

		// Lightweight Gun Builder JS foundation.

		wp_register_script_module(
			'tgb-build-state-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-BuildState.js',
			array(),
			TGB_VERSION,
			array()
		);

		wp_register_script_module(
			'tgb-cart-client-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-CartClient.js',
			array(),
			TGB_VERSION,
			array()
		);

		wp_register_script_module(
			'tgb-catalog-client-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-CatalogClient.js',
			array(),
			TGB_VERSION,
			array()
		);

		wp_register_script_module(
			'tgb-current-build-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-CurrentBuild.js',
			array(),
			TGB_VERSION,
			array()
		);

		wp_register_script_module(
			'tgb-interactions-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-Interactions.js',
			array(),
			TGB_VERSION,
			array()
		);


		wp_register_script_module(
			'tgb-persistence-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-Persistence.js',
			array(),
			TGB_VERSION,
			array()
		);

		wp_register_script_module(
			'tgb-product-selection-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-ProductSelection.js',
			array(),
			TGB_VERSION,
			array()
		);

		wp_register_script_module(
			'tgb-renderer-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-Renderer.js',
			array(),
			TGB_VERSION,
			array()
		);


		wp_register_script_module(
			'tgb-utility-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-Utility.js',
			array(),
			TGB_VERSION,
			array()
		);


		wp_register_script_module(
			'tgb-utility-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-Utility.js',
			array(),
			TGB_VERSION,
			array()
		);



		wp_register_script_module(
			'tgb-account-manager-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-AccountBuildManager.js',
			array(),
			TGB_VERSION,
			array()
		);



		wp_register_script_module(
			'tgb-guest-account-manager-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-AccountBuildManager.js',
			array(),
			TGB_VERSION,
			array()
		);


		wp_register_script_module(
			'tgb-share-manager-js',
			TGB_PLUGIN_URL . 'assets/js/TGB-ShareManager.js',
			array(),
			TGB_VERSION,
			array()
		);


		wp_register_script_module(
			'tgb-gun-builder-js',
			TGB_PLUGIN_URL . 'assets/js/gun-builder.js',
			array(),
			$js_ver,
			array()
		);

		// Localize parameters for AJAX / REST API integration.
		wp_localize_script(
			'tgb-gun-builder-js',
			'taktikGunBuilder',
			array(
				'version' => TGB_VERSION,
				'ajaxUrl' => admin_url('admin-ajax.php'),
				'restUrl' => esc_url_raw(rest_url('tgb/v1/')),
				'siteUrl' => home_url(),
				'cartUrl' => function_exists('wc_get_cart_url') ? wc_get_cart_url() : home_url('/cart/'),
				'cartNonce' => wp_create_nonce(TGB_Cart::NONCE_ACTION),
				'isLoggedIn' => is_user_logged_in(),
				'isAccountPage' => (function_exists('is_account_page') && is_account_page()),
				'currentUserId' => get_current_user_id(),
				'restNonce' => wp_create_nonce('wp_rest'),
				'myAccountUrl' => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : home_url('/my-account/'),
				'myAccountSavedBuildsUrl' => function_exists('wc_get_endpoint_url') ? wc_get_endpoint_url('gun-builder-builds', '', wc_get_page_permalink('myaccount')) : home_url('/my-account/gun-builder-builds/'),
				'savedBuildsUrl' => esc_url_raw(rest_url('tgb/v1/saved-builds')),
				'savedBuildsRestUrl' => esc_url_raw(rest_url('tgb/v1/saved-builds')),
				'sharesRestUrl' => esc_url_raw(rest_url('tgb/v1/shares')),
				'mySharesRestUrl' => esc_url_raw(rest_url('tgb/v1/my-shares')),
				'builderPageUrl' => TGB_Shortcode::get_builder_page_url(),
				'currency' => array(
					'code' => function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'CAD',
					'symbol' => function_exists('get_woocommerce_currency_symbol') ? html_entity_decode(get_woocommerce_currency_symbol(), ENT_QUOTES, 'UTF-8') : '$',
					'decimals' => function_exists('wc_get_price_decimals') ? wc_get_price_decimals() : 2,
					'decimal_separator' => function_exists('wc_get_price_decimal_separator') ? wc_get_price_decimal_separator() : '.',
					'thousand_separator' => function_exists('wc_get_price_thousand_separator') ? wc_get_price_thousand_separator() : ',',
					'price_format' => function_exists('get_woocommerce_price_format') ? get_woocommerce_price_format() : '%1$s%2$s',
				),
				'weight' => array(
					'unit' => (string) get_option('woocommerce_weight_unit', 'kg'),
				),
			)
		);
	}

	/**
	 * Detects if the current queried post contains [part_selector] and enqueues before wp_head.
	 */
	public static function maybe_enqueue_for_post()
	{
		if (is_singular()) {
			$post = get_post();
			if ($post && is_a($post, 'WP_Post') && has_shortcode($post->post_content, 'part_selector')) {
				self::enqueue();
			}
		}

		// Also enqueue on WooCommerce My Account pages for logged-in customers to support My Gun Builds UI and guest transfer.
		if (function_exists('is_account_page') && is_account_page() && is_user_logged_in()) {
			self::enqueue();
		}
	}

	/**
	 * Enqueue assets when the Gun Builder shortcode or template is invoked.
	 */
	public static function enqueue()
	{
		if (self::$enqueued) {
			return;
		}

		wp_enqueue_style('tgb-gun-builder-css');
		wp_enqueue_style('tgb-gun-builder-cart-css');
		wp_enqueue_style('tgb-gun-builder-category-css');
		wp_enqueue_style('tgb-gun-builder-compatibility-toggle-css');
		wp_enqueue_style('tgb-gun-builder-header-css');
		wp_enqueue_style('tgb-gun-builder-item-card-css');
		wp_enqueue_style('tgb-gun-builder-mobile-css');
		wp_enqueue_style('tgb-gun-builder-root-css');
		wp_enqueue_style('tgb-gun-builder-search-bar-css');
		wp_enqueue_style('tgb-gun-builder-size-slider-css');
		wp_enqueue_style('tgb-gun-builder-stage-css');
		wp_enqueue_style('tgb-gun-build-list-css');

		wp_enqueue_script_module('tgb-gun-builder-js');
		wp_enqueue_script_module('tgb-build-state-js');
		wp_enqueue_script_module('tgb-cart-client-js');
		wp_enqueue_script_module('tgb-catalog-client-js');
		wp_enqueue_script_module('tgb-current-build-js');
		wp_enqueue_script_module('tgb-interactions-js');
		wp_enqueue_script_module('tgb-persistence-js');
		wp_enqueue_script_module('tgb-product-selection-js');
		wp_enqueue_script_module('tgb-renderer-js');
		wp_enqueue_script_module('tgb-utility-js');
		wp_enqueue_script_module('tgb-account-manager-js');
		wp_enqueue_script_module('tgb-guest-account-manager-js');
		wp_enqueue_script_module('tgb-share-manager-js');

		self::$enqueued = true;
	}
}
