<?php
/**
 * Product Data Service and Gallery Image Pipeline for Taktik Gun Builder.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Product_Data
 *
 * Authoritative service responsible for retrieving, normalizing, and querying
 * WooCommerce product data and resolving required builder gallery images.
 */
class TGB_Product_Data {

	/**
	 * Default query pagination limit.
	 *
	 * @var int
	 */
	const DEFAULT_LIMIT = 20;

	/**
	 * Maximum query pagination limit.
	 *
	 * @var int
	 */
	const MAX_LIMIT = 100;

	/**
	 * Runtime in-memory category cache for current request lifecycle.
	 *
	 * @var array
	 */
	private static $runtime_categories_cache = array();

	/**
	 * Initialize data service hooks and cache invalidation listeners.
	 */
	public static function init() {
		// Invalidate catalog category caches on relevant product and taxonomy mutations.
		add_action( 'save_post_product', array( __CLASS__, 'bump_catalog_version' ) );
		add_action( 'wp_trash_post', array( __CLASS__, 'on_post_status_change' ) );
		add_action( 'untrash_post', array( __CLASS__, 'on_post_status_change' ) );
		add_action( 'delete_post', array( __CLASS__, 'on_post_status_change' ) );

		// WooCommerce categories invalidation.
		add_action( 'created_product_cat', array( __CLASS__, 'bump_catalog_version' ) );
		add_action( 'edited_product_cat', array( __CLASS__, 'bump_catalog_version' ) );
		add_action( 'delete_product_cat', array( __CLASS__, 'bump_catalog_version' ) );

		// Mount interfaces invalidation.
		add_action( 'created_' . TGB_Mount_Interfaces::TAXONOMY, array( __CLASS__, 'bump_catalog_version' ) );
		add_action( 'edited_' . TGB_Mount_Interfaces::TAXONOMY, array( __CLASS__, 'bump_catalog_version' ) );
		add_action( 'delete_' . TGB_Mount_Interfaces::TAXONOMY, array( __CLASS__, 'bump_catalog_version' ) );
	}

	/**
	 * Handles post status changes (e.g. trash/delete) to invalidate caches if the post is a product.
	 *
	 * @param int $post_id Post ID.
	 */
	public static function on_post_status_change( $post_id ) {
		if ( 'product' === get_post_type( $post_id ) ) {
			self::bump_catalog_version();
		}
	}

	/**
	 * Returns current catalog cache version token.
	 *
	 * @return string Version string.
	 */
	public static function get_catalog_version() {
		$version = get_option( 'tgb_catalog_version' );
		if ( empty( $version ) ) {
			$version = (string) time();
			update_option( 'tgb_catalog_version', $version );
		}
		return (string) $version;
	}

	/**
	 * Bumps catalog cache version token, invalidating all category transients instantly.
	 */
	public static function bump_catalog_version() {
		self::$runtime_categories_cache = array();
		update_option( 'tgb_catalog_version', time() . '_' . wp_rand( 1000, 9999 ) );
	}

	// =========================================================================
	// 1. Builder Gallery Image Pipeline
	// =========================================================================

	/**
	 * Resolves the canonical builder image for a product.
	 *
	 * CRITICAL REQUIREMENT:
	 * Uses the FIRST valid image from the WooCommerce Product Gallery ($product->get_gallery_image_ids()).
	 * The WooCommerce featured image ($product->get_image_id()) is NOT automatically the builder image
	 * and is NEVER used as a fallback.
	 *
	 * If no valid first Gallery image exists or attachment metadata is invalid, returns null.
	 *
	 * @param WC_Product|int $product WooCommerce product object or product ID.
	 * @return array|null Normalized builder image structure, or null if unavailable.
	 */
	public static function get_builder_image_data( $product ) {
		$wc_product = self::resolve_wc_product( $product );
		if ( ! $wc_product ) {
			return null;
		}

		$gallery_ids = $wc_product->get_gallery_image_ids();
		if ( empty( $gallery_ids ) || ! is_array( $gallery_ids ) ) {
			return null;
		}

		// Retrieve first gallery image attachment ID.
		$first_attachment_id = absint( reset( $gallery_ids ) );
		if ( $first_attachment_id <= 0 ) {
			return null;
		}

		// Verify attachment exists and is an image.
		if ( ! wp_attachment_is_image( $first_attachment_id ) ) {
			return null;
		}

		// Resolve original/full image dimensions and URL.
		$image_src = wp_get_attachment_image_src( $first_attachment_id, 'full' );
		if ( ! $image_src || empty( $image_src[0] ) ) {
			return null;
		}

		$url    = (string) $image_src[0];
		$width  = absint( $image_src[1] );
		$height = absint( $image_src[2] );

		if ( $width <= 0 || $height <= 0 ) {
			return null;
		}

		$aspect_ratio = round( (float) $width / (float) $height, 4 );

		// Alt text: prefer attachment alt, fallback to product name.
		$alt = get_post_meta( $first_attachment_id, '_wp_attachment_image_alt', true );
		if ( empty( $alt ) ) {
			$alt = $wc_product->get_name();
		}

		return array(
			'attachment_id' => $first_attachment_id,
			'url'           => $url,
			'width'         => $width,
			'height'        => $height,
			'aspect_ratio'  => $aspect_ratio,
			'alt'           => sanitize_text_field( $alt ),
		);
	}

	// =========================================================================
	// 2. Catalog Eligibility Evaluation
	// =========================================================================

	/**
	 * Evaluates whether a product is eligible for the customer-facing Gun Builder catalog.
	 *
	 * A product is catalog-eligible only when ALL 7 criteria are met:
	 * 1. WooCommerce product exists.
	 * 2. WooCommerce product status is 'publish'.
	 * 3. Builder Enabled = 'yes'.
	 * 4. Builder Ready = 'yes'.
	 * 5. Structural configuration is valid (role + positive mm + part_type if part).
	 * 6. Required first Gallery builder image exists and is valid.
	 * 7. Role is either 'base_gun' or 'part'.
	 *
	 * Note: In-stock and purchasability are reported in the data payload but do NOT
	 * block catalog eligibility in Part 3.
	 *
	 * @param WC_Product|int $product WooCommerce product object or product ID.
	 * @return bool True if eligible for the builder catalog, false otherwise.
	 */
	public static function is_catalog_eligible( $product ) {
		$wc_product = self::resolve_wc_product( $product );
		if ( ! $wc_product ) {
			return false;
		}

		$product_id = $wc_product->get_id();

		// 1 & 2. Published status.
		if ( 'publish' !== $wc_product->get_status() ) {
			return false;
		}

		// 3. Builder Enabled.
		if ( ! TGB_Product_Config::is_enabled( $product_id ) ) {
			return false;
		}

		// 4. Builder Ready.
		if ( ! TGB_Product_Config::is_ready( $product_id ) ) {
			return false;
		}

		// 5. Structural configuration completeness.
		if ( ! TGB_Product_Config::is_configuration_valid( $product_id ) ) {
			return false;
		}

		// 6. Required first Gallery builder image.
		$builder_image = self::get_builder_image_data( $wc_product );
		if ( null === $builder_image ) {
			return false;
		}

		// 7. Role is Base Gun, Part, or Rail.
		$role = TGB_Product_Config::get_role( $product_id );
		if ( ! in_array( $role, array( TGB_Product_Config::ROLE_BASE_GUN, TGB_Product_Config::ROLE_PART, TGB_Product_Config::ROLE_RAIL ), true ) ) {
			return false;
		}

		return true;
	}

	// =========================================================================
	// 3. Single Product Normalization
	// =========================================================================

	/**
	 * Returns the normalized Gun Builder product data structure for a WooCommerce product.
	 *
	 * Returns structured information regardless of catalog eligibility so internal
	 * tools/admin can inspect incomplete configurations, but includes a 'catalog_eligible' flag.
	 *
	 * Returns null if the WooCommerce product does not exist.
	 *
	 * @param WC_Product|int $product WooCommerce product object or product ID.
	 * @return array|null Normalized product array, or null if not found.
	 */
	public static function get_product_data( $product ) {
		$wc_product = self::resolve_wc_product( $product );
		if ( ! $wc_product ) {
			return null;
		}

		$product_id = $wc_product->get_id();
		$role       = TGB_Product_Config::get_role( $product_id );

		// Part Type structure (simple array, not raw WP_Term object).
		$part_type_data = null;
		if ( TGB_Product_Config::ROLE_PART === $role ) {
			$term = TGB_Part_Types::get_product_part_type( $product_id );
			if ( $term ) {
				$part_type_data = array(
					'id'   => (int) $term->term_id,
					'slug' => (string) $term->slug,
					'name' => (string) $term->name,
				);
			}
		}

		// Rail structure.
		$rail_data = null;
		if ( TGB_Product_Config::ROLE_RAIL === $role ) {
			$rail_data = array(
				'input_interfaces'    => TGB_Product_Config::get_rail_input_interfaces( $product_id ),
				'output_interfaces'   => TGB_Product_Config::get_rail_output_interfaces( $product_id ),
				'supported_positions' => TGB_Product_Config::get_rail_supported_positions( $product_id ),
			);
		}

		// Builder Gallery image.
		$builder_image = self::get_builder_image_data( $wc_product );

		// Pricing data via public WooCommerce APIs.
		$has_price     = ( '' !== $wc_product->get_price() );
		$display_price = $has_price ? (float) wc_get_price_to_display( $wc_product ) : null;
		$regular_price = ( $has_price && '' !== $wc_product->get_regular_price() )
			? (float) wc_get_price_to_display( $wc_product, array( 'price' => $wc_product->get_regular_price() ) )
			: $display_price;

		$price_data = array(
			'raw'         => null !== $display_price ? $display_price : 0.0,
			'unit_amount' => $display_price,
			'display'     => null !== $display_price ? wc_price( $display_price ) : '',
			'html'        => (string) $wc_product->get_price_html(),
			'on_sale'     => (bool) $wc_product->is_on_sale(),
			'regular'     => $regular_price,
		);

		// Stock data.
		$stock_data = array(
			'status'     => (string) $wc_product->get_stock_status(),
			'in_stock'   => (bool) $wc_product->is_in_stock(),
			'backorders' => (bool) $wc_product->is_on_backorder(),
		);

		// Weight data (normalized to grams, explicit null when missing).
		$store_unit = (string) get_option( 'woocommerce_weight_unit', 'kg' );
		$raw_weight = ( $wc_product->has_weight() && '' !== $wc_product->get_weight() )
			? (float) $wc_product->get_weight()
			: null;

		$grams = null;
		if ( null !== $raw_weight ) {
			$converted = wc_get_weight( $raw_weight, 'g', $store_unit );
			$grams     = is_numeric( $converted ) ? round( (float) $converted, 2 ) : null;
		}

		$weight_data = array(
			'value' => $raw_weight,
			'unit'  => $store_unit,
			'grams' => $grams,
		);

		// WooCommerce native status.
		$woo_data = array(
			'status'      => (string) $wc_product->get_status(),
			'purchasable' => (bool) $wc_product->is_purchasable(),
			'type'        => (string) $wc_product->get_type(),
		);

		// Catalog eligibility.
		$is_eligible = self::is_catalog_eligible( $wc_product );

		// Mounting data (Base Gun mount points or Part accepted interfaces & anchor).
		$mounting_data = array();
		if ( TGB_Product_Config::ROLE_BASE_GUN === $role ) {
			$mounting_data = array(
				'points' => TGB_Mounting::get_base_mount_points( $product_id ),
			);
		} elseif ( TGB_Product_Config::ROLE_PART === $role ) {
			$mounting_data = array(
				'interfaces' => TGB_Mounting::get_part_mount_interfaces( $product_id ),
				'anchor'     => TGB_Mounting::get_part_anchor( $product_id ),
				'positions'  => TGB_Product_Config::get_part_mount_positions( $product_id ),
			);
		}

		// WooCommerce categories.
		$categories_data = array();
		$cat_terms       = get_the_terms( $product_id, 'product_cat' );
		if ( ! empty( $cat_terms ) && ! is_wp_error( $cat_terms ) ) {
			foreach ( $cat_terms as $cat_term ) {
				$categories_data[] = array(
					'id'     => (int) $cat_term->term_id,
					'slug'   => (string) $cat_term->slug,
					'name'   => (string) $cat_term->name,
					'parent' => (int) $cat_term->parent,
				);
			}
		}

		return array(
			'id'                     => $product_id,
			'name'                   => (string) $wc_product->get_name(),
			'slug'                   => (string) $wc_product->get_slug(),
			'permalink'              => (string) $wc_product->get_permalink(),
			'role'                   => $role,
			'category_policy'        => ( TGB_Product_Config::ROLE_BASE_GUN === $role ) ? TGB_Product_Config::get_category_policy( $product_id ) : null,
			'allowed_categories'     => ( TGB_Product_Config::ROLE_BASE_GUN === $role ) ? TGB_Product_Config::get_allowed_categories( $product_id ) : array(),
			'allowed_rail_positions' => ( TGB_Product_Config::ROLE_BASE_GUN === $role ) ? TGB_Product_Config::get_allowed_rail_positions( $product_id ) : array(),
			'rail'                   => $rail_data,
			'part_type'              => $part_type_data,
			'categories'             => $categories_data,
			'reference_mm'           => (float) TGB_Product_Config::get_reference_mm( $product_id ),
			'builder_image'          => $builder_image,
			'price'                  => $price_data,
			'stock'                  => $stock_data,
			'weight'                 => $weight_data,
			'woo'                    => $woo_data,
			'mounting'               => $mounting_data,
			'catalog_eligible'       => $is_eligible,
		);
	}

	// =========================================================================
	// 4. Catalog Queries (Base Guns & Parts)
	// =========================================================================

	/**
	 * Queries eligible Base Guns for the Gun Builder catalog.
	 *
	 * Filters by published status, Builder Enabled = yes, Builder Ready = yes,
	 * Role = base_gun, and valid first Gallery builder image.
	 *
	 * Uses bounded continuation cursor streaming to ensure pagination applies strictly
	 * to the final catalog-eligible product set without arbitrary catalog ceilings.
	 *
	 * @param array $args Query cursor, limit, and sorting arguments.
	 * @return array Standard query response array { items, limit, has_more, next_cursor }.
	 */
	public static function get_base_guns( array $args = array() ) {
		$normalized_args = self::normalize_query_args( $args );

		$base_query_args = array(
			'post_type'   => 'product',
			'post_status' => 'publish',
			'meta_query'  => array(
				array(
					'key'   => TGB_Product_Config::META_ROLE,
					'value' => TGB_Product_Config::ROLE_BASE_GUN,
				),
				array(
					'key'   => TGB_Product_Config::META_ENABLED,
					'value' => 'yes',
				),
				array(
					'key'   => TGB_Product_Config::META_READY,
					'value' => 'yes',
				),
				array(
					'key'     => '_product_image_gallery',
					'value'   => '',
					'compare' => '!=',
				),
			),
		);

		return self::query_catalog_products( $base_query_args, $normalized_args );
	}

	/**
	 * Queries eligible Parts for a specific dynamic Builder Part Type term.
	 *
	 * Filters by published status, Builder Enabled = yes, Builder Ready = yes,
	 * Role = part, assignment to the specified tgb_part_type term, and valid first Gallery image.
	 *
	 * Uses bounded continuation cursor streaming to ensure pagination applies strictly
	 * to the final catalog-eligible product set without arbitrary catalog ceilings.
	 *
	 * @param int   $term_id Part Type term ID.
	 * @param array $args    Query cursor, limit, and sorting arguments.
	 * @return array Standard query response array { items, limit, has_more, next_cursor }.
	 */
	public static function get_parts_by_type( $term_id, array $args = array() ) {
		$term_id         = absint( $term_id );
		$normalized_args = self::normalize_query_args( $args );

		// Validate term exists and belongs to tgb_part_type taxonomy.
		if ( $term_id <= 0 || ! term_exists( $term_id, TGB_Part_Types::TAXONOMY ) ) {
			return array(
				'items'       => array(),
				'limit'       => $normalized_args['limit'],
				'has_more'    => false,
				'next_cursor' => null,
			);
		}

		$base_query_args = array(
			'post_type'   => 'product',
			'post_status' => 'publish',
			'tax_query'   => array(
				array(
					'taxonomy' => TGB_Part_Types::TAXONOMY,
					'field'    => 'term_id',
					'terms'    => $term_id,
				),
			),
			'meta_query'  => array(
				array(
					'key'   => TGB_Product_Config::META_ROLE,
					'value' => TGB_Product_Config::ROLE_PART,
				),
				array(
					'key'   => TGB_Product_Config::META_ENABLED,
					'value' => 'yes',
				),
				array(
					'key'   => TGB_Product_Config::META_READY,
					'value' => 'yes',
				),
				array(
					'key'     => '_product_image_gallery',
					'value'   => '',
					'compare' => '!=',
				),
			),
		);

		return self::query_catalog_products( $base_query_args, $normalized_args );
	}

	/**
	 * Queries eligible Parts for a specific WooCommerce product_cat term.
	 *
	 * Filters by published status, Builder Enabled = yes, Builder Ready = yes,
	 * Role = part, assignment to the specified product_cat term (including children),
	 * and valid first Gallery image.
	 *
	 * If base_gun_id is provided in $args, only compatible Parts are returned.
	 *
	 * Uses bounded continuation cursor streaming to ensure pagination applies strictly
	 * to the final catalog-eligible product set without arbitrary catalog ceilings.
	 *
	 * @param int   $category_id WooCommerce product_cat term ID.
	 * @param array $args        Query cursor, limit, base_gun_id, and sorting arguments.
	 * @return array Standard query response array { items, limit, has_more, next_cursor }.
	 */
	public static function get_parts_by_category( $category_id, array $args = array() ) {
		$category_id     = absint( $category_id );
		$normalized_args = self::normalize_query_args( $args );

		// Validate term exists and belongs to product_cat taxonomy.
		if ( $category_id <= 0 || ! term_exists( $category_id, 'product_cat' ) ) {
			return array(
				'items'       => array(),
				'limit'       => $normalized_args['limit'],
				'has_more'    => false,
				'next_cursor' => null,
			);
		}

		$tax_query = array(
			array(
				'taxonomy'         => 'product_cat',
				'field'            => 'term_id',
				'terms'            => $category_id,
				'include_children' => true,
			),
		);

		// If Base Gun ID is provided, enforce category policy and narrow candidate stream to mount interfaces matching the Base Gun and installed Rails.
		if ( ! empty( $normalized_args['base_gun_id'] ) ) {
			if ( ! TGB_Product_Config::is_category_allowed_for_gun( $normalized_args['base_gun_id'], $category_id ) ) {
				return array(
					'items'       => array(),
					'limit'       => $normalized_args['limit'],
					'has_more'    => false,
					'next_cursor' => null,
				);
			}

			$interface_ids = array();
			if ( ! empty( $normalized_args['installed_rails'] ) ) {
				$capability_pool = TGB_Rail_Compatibility::build_active_capability_pool( $normalized_args['base_gun_id'], $normalized_args['installed_rails'] );
				$interface_ids   = array_unique( array_map( function( $cap ) {
					return (int) $cap['interface_id'];
				}, (array) ( $capability_pool['capabilities'] ?? array() ) ) );
			} else {
				$base_points = TGB_Mounting::get_base_mount_points( $normalized_args['base_gun_id'] );
				if ( empty( $base_points ) ) {
					// Base Gun has no mount points, so no parts can be compatible.
					return array(
						'items'       => array(),
						'limit'       => $normalized_args['limit'],
						'has_more'    => false,
						'next_cursor' => null,
					);
				}

				$interface_ids = array_unique( array_map( function( $pt ) {
					return (int) $pt['interface']['id'];
				}, $base_points ) );
			}

			if ( ! empty( $interface_ids ) ) {
				$tax_query[] = array(
					'taxonomy' => TGB_Mount_Interfaces::TAXONOMY,
					'field'    => 'term_id',
					'terms'    => $interface_ids,
					'operator' => 'IN',
				);
			} elseif ( ! empty( $normalized_args['installed_rails'] ) ) {
				// Base gun + installed rails have 0 capabilities
				return array(
					'items'       => array(),
					'limit'       => $normalized_args['limit'],
					'has_more'    => false,
					'next_cursor' => null,
				);
			}
		}

		$base_query_args = array(
			'post_type'   => 'product',
			'post_status' => 'publish',
			'tax_query'   => $tax_query,
			'meta_query'  => array(
				array(
					'key'   => TGB_Product_Config::META_ROLE,
					'value' => TGB_Product_Config::ROLE_PART,
				),
				array(
					'key'   => TGB_Product_Config::META_ENABLED,
					'value' => 'yes',
				),
				array(
					'key'   => TGB_Product_Config::META_READY,
					'value' => 'yes',
				),
				array(
					'key'     => '_product_image_gallery',
					'value'   => '',
					'compare' => '!=',
				),
			),
		);

		return self::query_catalog_products( $base_query_args, $normalized_args );
	}

	/**
	 * Retrieves hierarchical WooCommerce product categories containing eligible (and compatible) Parts.
	 *
	 * Filters out any category branches that contain 0 eligible Builder Parts.
	 * If $base_gun_id is provided, further restricts categories and counts to Parts that are
	 * strictly mount-compatible with the specified Base Gun and any active installed Rails.
	 *
	 * Preserves parent-child hierarchy and sorts categories logically.
	 *
	 * @param int   $base_gun_id     Optional Base Gun product ID for compatibility filtering.
	 * @param array $installed_rails Optional array of installed rail instances.
	 * @return array Array of top-level category nodes with nested children and item counts.
	 */
	/**
	 * Computes an 8-character normalized rail fingerprint for cache isolation.
	 *
	 * @param array $installed_rails Installed rail instances.
	 * @return string
	 */
	public static function get_rail_fingerprint( array $installed_rails = array() ) {
		if ( empty( $installed_rails ) ) {
			return '0';
		}
		$norm_pairs = array();
		foreach ( $installed_rails as $r ) {
			if ( is_array( $r ) && isset( $r['product_id'], $r['position'] ) ) {
				$norm_pairs[] = (int) $r['product_id'] . ':' . (string) $r['position'];
			}
		}
		if ( empty( $norm_pairs ) ) {
			return '0';
		}
		sort( $norm_pairs );
		return substr( md5( implode( '|', $norm_pairs ) ), 0, 8 );
	}

	/**
	 * Generates the transient cache key for compatible categories.
	 *
	 * @param int   $base_gun_id     Base Gun product ID.
	 * @param array $installed_rails Array of rail instances.
	 * @return string Transient cache key.
	 */
	public static function get_category_cache_key( $base_gun_id = 0, array $installed_rails = array() ) {
		$rfp     = self::get_rail_fingerprint( $installed_rails );
		$version = self::get_catalog_version();
		return 'tgb_ccat_' . absint( $base_gun_id ) . '_r' . $rfp . '_' . md5( $version );
	}

	public static function get_compatible_categories( $base_gun_id = 0, array $installed_rails = array() ) {
		$base_gun_id = absint( $base_gun_id );
		$rfp         = self::get_rail_fingerprint( $installed_rails );
		$runtime_key = $base_gun_id . '_r' . $rfp;

		// 1. In-memory runtime cache check.
		if ( isset( self::$runtime_categories_cache[ $runtime_key ] ) ) {
			return self::$runtime_categories_cache[ $runtime_key ];
		}

		// 2. Persistent transient cache check (versioned to guarantee instant invalidation).
		$cache_key  = self::get_category_cache_key( $base_gun_id, $installed_rails );
		$cached_res = get_transient( $cache_key );
		if ( false !== $cached_res && is_array( $cached_res ) ) {
			self::$runtime_categories_cache[ $runtime_key ] = $cached_res;
			return $cached_res;
		}

		$query_args = array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'fields'         => 'ids',
			'no_found_rows'  => true,
			'meta_query'     => array(
				array(
					'key'   => TGB_Product_Config::META_ROLE,
					'value' => TGB_Product_Config::ROLE_PART,
				),
				array(
					'key'   => TGB_Product_Config::META_ENABLED,
					'value' => 'yes',
				),
				array(
					'key'   => TGB_Product_Config::META_READY,
					'value' => 'yes',
				),
				array(
					'key'     => '_product_image_gallery',
					'value'   => '',
					'compare' => '!=',
				),
			),
		);

		$part_ids         = get_posts( $query_args );
		$qualifying_parts = array();

		// Build capability pool if rails are present
		$capability_pool = null;
		if ( $base_gun_id > 0 && ! empty( $installed_rails ) ) {
			$capability_pool = TGB_Rail_Compatibility::build_active_capability_pool( $base_gun_id, $installed_rails );
		}

		foreach ( $part_ids as $part_id ) {
			if ( ! self::is_catalog_eligible( $part_id ) ) {
				continue;
			}
			if ( $base_gun_id > 0 ) {
				if ( null !== $capability_pool ) {
					$eval = TGB_Rail_Compatibility::check_part_compatibility_with_pool( $part_id, $capability_pool );
					if ( TGB_Rail_Compatibility::STATUS_COMPATIBLE !== $eval['status'] ) {
						continue;
					}
				} else {
					$status = TGB_Mounting::check_compatibility( $base_gun_id, $part_id );
					if ( TGB_Mounting::STATUS_COMPATIBLE !== $status ) {
						continue;
					}
				}
				// Part 2 Feature A: Base Gun Category Policy check
				if ( ! TGB_Product_Config::is_part_category_allowed_for_gun( $base_gun_id, $part_id ) ) {
					continue;
				}
			}
			$qualifying_parts[] = $part_id;
		}

		if ( empty( $qualifying_parts ) ) {
			set_transient( $cache_key, array(), 12 * HOUR_IN_SECONDS );
			self::$runtime_categories_cache[ $runtime_key ] = array();
			return array();
		}

		// Map qualifying parts to categories and resolve all ancestor terms.
		$term_parts         = array(); // term_id => array of part_ids
		$all_terms          = array(); // term_id => WP_Term
		$ancestor_cache     = array(); // term_id => array of ancestor term IDs
		$is_selected_policy = ( $base_gun_id > 0 && TGB_Product_Config::POLICY_SELECTED === TGB_Product_Config::get_category_policy( $base_gun_id ) );

		foreach ( $qualifying_parts as $part_id ) {
			$terms = wp_get_post_terms( $part_id, 'product_cat' );
			if ( empty( $terms ) || is_wp_error( $terms ) ) {
				continue;
			}

			foreach ( $terms as $term ) {
				// If Base Gun has Selected policy, omit terms outside the permitted category tree.
				if ( $is_selected_policy && ! TGB_Product_Config::is_category_allowed_for_gun( $base_gun_id, $term->term_id ) ) {
					continue;
				}

				if ( ! isset( $all_terms[ $term->term_id ] ) ) {
					$all_terms[ $term->term_id ] = $term;
				}
				if ( ! isset( $term_parts[ $term->term_id ] ) ) {
					$term_parts[ $term->term_id ] = array();
				}
				$term_parts[ $term->term_id ][ $part_id ] = true;

				// Include all parent ancestors so the full branch is connected.
				if ( ! isset( $ancestor_cache[ $term->term_id ] ) ) {
					$ancestor_cache[ $term->term_id ] = get_ancestors( $term->term_id, 'product_cat', 'taxonomy' );
				}
				$ancestor_ids = $ancestor_cache[ $term->term_id ];

				foreach ( $ancestor_ids as $ancestor_id ) {
					if ( ! isset( $all_terms[ $ancestor_id ] ) ) {
						$anc_term = get_term( $ancestor_id, 'product_cat' );
						if ( $anc_term && ! is_wp_error( $anc_term ) ) {
							$all_terms[ $ancestor_id ] = $anc_term;
						}
					}
					if ( ! isset( $term_parts[ $ancestor_id ] ) ) {
						$term_parts[ $ancestor_id ] = array();
					}
					$term_parts[ $ancestor_id ][ $part_id ] = true;
				}
			}
		}

		// Group terms by parent ID.
		$terms_by_parent = array();
		foreach ( $all_terms as $term_id => $term ) {
			$parent = (int) $term->parent;
			if ( ! isset( $terms_by_parent[ $parent ] ) ) {
				$terms_by_parent[ $parent ] = array();
			}
			$terms_by_parent[ $parent ][] = $term;
		}

		// Recursive tree builder.
		$build_branch = function( $parent_id ) use ( &$build_branch, &$terms_by_parent, &$term_parts ) {
			if ( empty( $terms_by_parent[ $parent_id ] ) ) {
				return array();
			}

			// Sort by menu_order (if available) then name alphabetically.
			usort( $terms_by_parent[ $parent_id ], function( $a, $b ) {
				$order_a = isset( $a->term_group ) ? (int) $a->term_group : 0;
				$order_b = isset( $b->term_group ) ? (int) $b->term_group : 0;
				if ( $order_a !== $order_b ) {
					return $order_a - $order_b;
				}
				return strcasecmp( $a->name, $b->name );
			} );

			$branch = array();
			foreach ( $terms_by_parent[ $parent_id ] as $term ) {
				$count    = isset( $term_parts[ $term->term_id ] ) ? count( $term_parts[ $term->term_id ] ) : 0;
				$children = $build_branch( $term->term_id );

				$branch[] = array(
					'id'       => (int) $term->term_id,
					'name'     => (string) $term->name,
					'slug'     => (string) $term->slug,
					'parent'   => (int) $term->parent,
					'count'    => $count,
					'children' => $children,
				);
			}

			return $branch;
		};

		$tree = $build_branch( 0 );

		// Save to transient cache and in-memory runtime cache.
		set_transient( $cache_key, $tree, 12 * HOUR_IN_SECONDS );
		self::$runtime_categories_cache[ $runtime_key ] = $tree;

		return $tree;
	}

	// =========================================================================
	// 5. Internal Helper Utilities
	// =========================================================================

	/**
	 * Resolves input into a valid WC_Product instance.
	 *
	 * @param WC_Product|int $product Product object or ID.
	 * @return WC_Product|null WC_Product on success, or null on failure.
	 */
	private static function resolve_wc_product( $product ) {
		if ( class_exists( 'WC_Product' ) && $product instanceof WC_Product ) {
			return $product;
		}

		if ( function_exists( 'wc_get_product' ) && is_numeric( $product ) && absint( $product ) > 0 ) {
			$resolved = wc_get_product( absint( $product ) );
			return ( class_exists( 'WC_Product' ) && $resolved instanceof WC_Product ) ? $resolved : null;
		}

		return null;
	}

	/**
	 * Encodes a candidate database offset into an opaque cursor token.
	 *
	 * Accepts either ($offset, $rfp) or ($date, $post_id, $rfp).
	 *
	 * @param mixed  $date_or_offset Date string or integer offset.
	 * @param mixed  $post_id_or_rfp Integer post_id or string rail fingerprint.
	 * @param string $rfp            Optional rail fingerprint when 3 args passed.
	 * @return string Opaque base64-encoded cursor token.
	 */
	public static function encode_cursor( $date_or_offset, $post_id_or_rfp = 0, $rfp = '' ) {
		if ( func_num_args() >= 3 || ( is_numeric( $post_id_or_rfp ) && $post_id_or_rfp > 0 ) ) {
			$data = array(
				'date'    => (string) $date_or_offset,
				'post_id' => absint( $post_id_or_rfp ),
				'offset'  => absint( $post_id_or_rfp ),
				'rfp'     => (string) $rfp,
			);
		} else {
			$offset  = max( 0, (int) $date_or_offset );
			$rfp_val = is_string( $post_id_or_rfp ) ? $post_id_or_rfp : (string) $rfp;
			$data    = array(
				'offset'  => $offset,
				'post_id' => $offset,
			);
			if ( '' !== $rfp_val ) {
				$data['rfp'] = $rfp_val;
			}
		}
		return base64_encode( (string) wp_json_encode( $data ) );
	}

	/**
	 * Decodes an input cursor into a candidate database offset integer or structured token.
	 *
	 * Accepts opaque base64 cursor strings, raw numeric strings, or integers.
	 * Returns 0 if cursor is missing, empty, invalid, or if rfp context changed.
	 *
	 * @param mixed  $cursor       Raw input cursor.
	 * @param string $expected_rfp Optional expected rail fingerprint.
	 * @return array|int 0-based candidate offset or structured array.
	 */
	public static function decode_cursor( $cursor, $expected_rfp = '' ) {
		if ( empty( $cursor ) ) {
			return 0;
		}

		if ( is_int( $cursor ) || ( is_string( $cursor ) && ctype_digit( $cursor ) ) ) {
			$val = max( 0, (int) $cursor );
			return array(
				'offset'  => $val,
				'post_id' => $val,
			);
		}

		if ( is_string( $cursor ) ) {
			$decoded = base64_decode( $cursor, true );
			if ( false !== $decoded ) {
				$data = json_decode( $decoded, true );
				if ( is_array( $data ) && ( isset( $data['offset'] ) || isset( $data['post_id'] ) ) ) {
					if ( '' !== $expected_rfp && isset( $data['rfp'] ) && (string) $data['rfp'] !== (string) $expected_rfp ) {
						return null; // Context changed: reset cursor
					}
					if ( ! isset( $data['offset'] ) && isset( $data['post_id'] ) ) {
						$data['offset'] = (int) $data['post_id'];
					}
					if ( ! isset( $data['post_id'] ) && isset( $data['offset'] ) ) {
						$data['post_id'] = (int) $data['offset'];
					}
					return $data;
				}
				if ( is_numeric( $decoded ) ) {
					$val = max( 0, (int) $decoded );
					return array(
						'offset'  => $val,
						'post_id' => $val,
					);
				}
			}
		}

		return 0;
	}

	/**
	 * Normalizes and bounds query arguments for cursor pagination.
	 *
	 * @param array $args Input arguments.
	 * @return array Normalized arguments { limit, cursor, orderby, order, _batch_size, installed_rails }.
	 */
	private static function normalize_query_args( array $args ) {
		$limit = isset( $args['limit'] ) ? absint( $args['limit'] ) : self::DEFAULT_LIMIT;
		$limit = max( 1, min( self::MAX_LIMIT, $limit ) );

		$cursor = isset( $args['cursor'] ) ? $args['cursor'] : null;

		$orderby = isset( $args['orderby'] ) ? sanitize_text_field( $args['orderby'] ) : 'menu_order title';
		$order   = isset( $args['order'] ) && 'DESC' === strtoupper( $args['order'] ) ? 'DESC' : 'ASC';

		// Ensure deterministic order across candidate batches by appending ID tiebreaker if not present.
		if ( false === stripos( $orderby, 'ID' ) ) {
			$orderby .= ' ID';
		}

		$normalized = array(
			'limit'   => $limit,
			'cursor'  => $cursor,
			'orderby' => $orderby,
			'order'   => $order,
		);

		if ( isset( $args['base_gun_id'] ) && absint( $args['base_gun_id'] ) > 0 ) {
			$normalized['base_gun_id'] = absint( $args['base_gun_id'] );
		}

		if ( isset( $args['installed_rails'] ) && is_array( $args['installed_rails'] ) ) {
			$normalized['installed_rails'] = $args['installed_rails'];
		}

		if ( isset( $args['_batch_size'] ) && absint( $args['_batch_size'] ) > 0 ) {
			$normalized['_batch_size'] = absint( $args['_batch_size'] );
		}

		return $normalized;
	}

	/**
	 * Queries catalog-eligible products using bounded continuation cursor streaming.
	 *
	 * Pagination applies strictly to the final eligible product set, guaranteeing
	 * result sets never underfill due to ineligible candidate filtering.
	 *
	 * The continuation cursor represents the candidate database offset where scanning
	 * should resume on the next request, eliminating rescanning of prior candidates
	 * and avoiding arbitrary catalog ceilings.
	 *
	 * @param array $base_query_args Base WP_Query arguments (meta_query, tax_query, etc.).
	 * @param array $normalized_args Normalized query arguments (limit, cursor, orderby, order, _batch_size).
	 * @return array Response matching pagination contract { items, limit, has_more, next_cursor }.
	 */
	private static function query_catalog_products( array $base_query_args, array $normalized_args ) {
		$limit = $normalized_args['limit'];

		// Calculate rail context fingerprint for cursor safety
		$rfp          = self::get_rail_fingerprint( $normalized_args['installed_rails'] ?? array() );
		$cursor_data  = self::decode_cursor( $normalized_args['cursor'], $rfp );
		$start_offset = is_array( $cursor_data ) ? (int) ( $cursor_data['offset'] ?? 0 ) : (int) $cursor_data;

		$items       = array();
		$has_more    = false;
		$next_cursor = null;

		$candidate_offset = $start_offset;

		// Bounded database batch size: at least 20, at most 100 candidate IDs per query.
		$batch_size = ( isset( $normalized_args['_batch_size'] ) && $normalized_args['_batch_size'] > 0 )
			? absint( $normalized_args['_batch_size'] )
			: max( 20, min( 100, $limit * 2 ) );

		// Pre-compute capability pool if rails are provided
		$capability_pool = null;
		if ( ! empty( $normalized_args['base_gun_id'] ) && ! empty( $normalized_args['installed_rails'] ) ) {
			$capability_pool = TGB_Rail_Compatibility::build_active_capability_pool( $normalized_args['base_gun_id'], $normalized_args['installed_rails'] );
		}

		while ( true ) {
			$query_args = array_merge(
				$base_query_args,
				array(
					'posts_per_page' => $batch_size,
					'offset'         => $candidate_offset,
					'fields'         => 'ids',
					'no_found_rows'  => true,
					'orderby'        => $normalized_args['orderby'],
					'order'          => $normalized_args['order'],
				)
			);

			$candidate_query = new WP_Query( $query_args );

			if ( ! ( $candidate_query instanceof WP_Query ) || empty( $candidate_query->posts ) || ! is_array( $candidate_query->posts ) ) {
				// No more candidates in database; candidate stream genuinely exhausted.
				break;
			}

			$batch_candidate_ids = $candidate_query->posts;

			foreach ( $batch_candidate_ids as $candidate_id ) {
				$current_scan_offset = $candidate_offset;
				$candidate_offset++;

				$product = wc_get_product( $candidate_id );
				if ( ! $product ) {
					continue;
				}

				if ( ! self::is_catalog_eligible( $product ) ) {
					continue;
				}

				if ( ! empty( $normalized_args['base_gun_id'] ) ) {
					if ( null !== $capability_pool ) {
						$eval = TGB_Rail_Compatibility::check_part_compatibility_with_pool( $candidate_id, $capability_pool );
						if ( TGB_Rail_Compatibility::STATUS_COMPATIBLE !== $eval['status'] ) {
							continue;
						}
					} else {
						$compat = TGB_Mounting::check_compatibility( $normalized_args['base_gun_id'], $candidate_id );
						if ( TGB_Mounting::STATUS_COMPATIBLE !== $compat ) {
							continue;
						}
					}

					// Part 2 Feature A: Enforce Base Gun Category Policy.
					if ( ! TGB_Product_Config::is_part_category_allowed_for_gun( $normalized_args['base_gun_id'], $candidate_id ) ) {
						continue;
					}
				}

				if ( count( $items ) < $limit ) {
					$product_data = self::get_product_data( $product );
					if ( $product_data ) {
						$items[] = $product_data;
					}
				} else {
					// We already collected $limit items and just found 1 additional eligible product.
					// This product begins the next continuation result set.
					$has_more    = true;
					$next_cursor = self::encode_cursor( $current_scan_offset, $rfp );
					break 2;
				}
			}

			// If fewer candidates were returned than requested in this batch,
			// the database candidate stream is genuinely exhausted.
			if ( count( $batch_candidate_ids ) < $batch_size ) {
				break;
			}
		}

		return array(
			'items'       => array_values( $items ),
			'limit'       => $limit,
			'has_more'    => $has_more,
			'next_cursor' => $next_cursor,
		);
	}
}
