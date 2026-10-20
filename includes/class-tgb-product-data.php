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
	 * Initialize data service hooks if required.
	 */
	public static function init() {
		// Pure data service for Stage 3; hooks reserved for future stage integrations.
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

		// 7. Role is either Base Gun or Part.
		$role = TGB_Product_Config::get_role( $product_id );
		if ( ! in_array( $role, array( TGB_Product_Config::ROLE_BASE_GUN, TGB_Product_Config::ROLE_PART ), true ) ) {
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

		// Builder Gallery image.
		$builder_image = self::get_builder_image_data( $wc_product );

		// Pricing data via public WooCommerce APIs.
		$display_price = (float) wc_get_price_to_display( $wc_product );
		$regular_price = (float) ( '' !== $wc_product->get_regular_price()
			? wc_get_price_to_display( $wc_product, array( 'price' => $wc_product->get_regular_price() ) )
			: $display_price );

		$price_data = array(
			'raw'     => $display_price,
			'display' => wc_price( $display_price ),
			'html'    => (string) $wc_product->get_price_html(),
			'on_sale' => (bool) $wc_product->is_on_sale(),
			'regular' => $regular_price,
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
			);
		}

		return array(
			'id'               => $product_id,
			'name'             => (string) $wc_product->get_name(),
			'slug'             => (string) $wc_product->get_slug(),
			'permalink'        => (string) $wc_product->get_permalink(),
			'role'             => $role,
			'part_type'        => $part_type_data,
			'reference_mm'     => (float) TGB_Product_Config::get_reference_mm( $product_id ),
			'builder_image'    => $builder_image,
			'price'            => $price_data,
			'stock'            => $stock_data,
			'weight'           => $weight_data,
			'woo'              => $woo_data,
			'mounting'         => $mounting_data,
			'catalog_eligible' => $is_eligible,
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
		if ( $product instanceof WC_Product ) {
			return $product;
		}

		if ( is_numeric( $product ) && absint( $product ) > 0 ) {
			$resolved = wc_get_product( absint( $product ) );
			return ( $resolved instanceof WC_Product ) ? $resolved : null;
		}

		return null;
	}

	/**
	 * Encodes a candidate database offset into an opaque cursor token.
	 *
	 * @param int $offset 0-based candidate database offset.
	 * @return string Opaque base64-encoded cursor token.
	 */
	public static function encode_cursor( $offset ) {
		$offset = max( 0, (int) $offset );
		return base64_encode( (string) wp_json_encode( array( 'offset' => $offset ) ) );
	}

	/**
	 * Decodes an input cursor into a candidate database offset integer.
	 *
	 * Accepts opaque base64 cursor strings, raw numeric strings, or integers.
	 * Returns 0 if cursor is missing, empty, or invalid.
	 *
	 * @param mixed $cursor Raw input cursor.
	 * @return int 0-based candidate offset.
	 */
	public static function decode_cursor( $cursor ) {
		if ( empty( $cursor ) ) {
			return 0;
		}

		if ( is_int( $cursor ) || ( is_string( $cursor ) && ctype_digit( $cursor ) ) ) {
			return max( 0, (int) $cursor );
		}

		if ( is_string( $cursor ) ) {
			$decoded = base64_decode( $cursor, true );
			if ( false !== $decoded ) {
				$data = json_decode( $decoded, true );
				if ( is_array( $data ) && isset( $data['offset'] ) && is_numeric( $data['offset'] ) ) {
					return max( 0, (int) $data['offset'] );
				}
				if ( is_numeric( $decoded ) ) {
					return max( 0, (int) $decoded );
				}
			}
		}

		return 0;
	}

	/**
	 * Normalizes and bounds query arguments for cursor pagination.
	 *
	 * @param array $args Input arguments.
	 * @return array Normalized arguments { limit, cursor, orderby, order, _batch_size }.
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
		$limit        = $normalized_args['limit'];
		$start_offset = self::decode_cursor( $normalized_args['cursor'] );

		$items       = array();
		$has_more    = false;
		$next_cursor = null;

		$candidate_offset = $start_offset;

		// Bounded database batch size: at least 20, at most 100 candidate IDs per query.
		$batch_size = ( isset( $normalized_args['_batch_size'] ) && $normalized_args['_batch_size'] > 0 )
			? absint( $normalized_args['_batch_size'] )
			: max( 20, min( 100, $limit * 2 ) );

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

				if ( count( $items ) < $limit ) {
					$product_data = self::get_product_data( $product );
					if ( $product_data ) {
						$items[] = $product_data;
					}
				} else {
					// We already collected $limit items and just found 1 additional eligible product.
					// This product begins the next continuation result set.
					$has_more    = true;
					$next_cursor = self::encode_cursor( $current_scan_offset );
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
