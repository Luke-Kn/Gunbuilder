<?php
/**
 * Public REST API Catalog Controller for Taktik Gun Builder.
 *
 * Provides read-only REST endpoints for retrieving eligible Base Guns,
 * dynamic Part Types, and Parts by taxonomy term with continuation cursor pagination.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Catalog_API
 */
class TGB_Catalog_API {

	/**
	 * REST API route namespace.
	 *
	 * @var string
	 */
	const NAMESPACE = 'tgb/v1';

	/**
	 * Initializes the REST API controller.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * Registers catalog REST API routes.
	 */
	public static function register_routes() {
		// 1. GET /wp-json/tgb/v1/base-guns
		register_rest_route(
			self::NAMESPACE,
			'/base-guns',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_base_guns' ),
				'permission_callback' => '__return_true', // Public storefront data.
				'args'                => array(
					'limit'  => array(
						'description'       => __( 'Maximum number of items to return.', 'part-selector' ),
						'type'              => 'integer',
						'default'           => 20,
						'minimum'           => 1,
						'maximum'           => 100,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_limit' ),
					),
					'cursor' => array(
						'description'       => __( 'Continuation cursor for pagination.', 'part-selector' ),
						'type'              => 'string',
						'required'          => false,
						'sanitize_callback' => 'sanitize_text_field',
						'validate_callback' => array( __CLASS__, 'validate_cursor' ),
					),
				),
			)
		);

		// 2. GET /wp-json/tgb/v1/part-types
		register_rest_route(
			self::NAMESPACE,
			'/part-types',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_part_types' ),
				'permission_callback' => '__return_true',
			)
		);

		// 3. GET /wp-json/tgb/v1/parts
		register_rest_route(
			self::NAMESPACE,
			'/parts',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_parts' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'type_id' => array(
						'description'       => __( 'Dynamic Part Type taxonomy term ID.', 'part-selector' ),
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_type_id' ),
					),
					'limit'   => array(
						'description'       => __( 'Maximum number of items to return.', 'part-selector' ),
						'type'              => 'integer',
						'default'           => 20,
						'minimum'           => 1,
						'maximum'           => 100,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_limit' ),
					),
					'cursor'  => array(
						'description'       => __( 'Continuation cursor for pagination.', 'part-selector' ),
						'type'              => 'string',
						'required'          => false,
						'sanitize_callback' => 'sanitize_text_field',
						'validate_callback' => array( __CLASS__, 'validate_cursor' ),
					),
				),
			)
		);


		// 4. GET /wp-json/tgb/v1/parts/search
		register_rest_route(	
			self::NAMESPACE,
			'/parts/search',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'search_parts' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'q'       => array(
						'description'       => __( 'Search query string.', 'part-selector' ),
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_text_field',
					),
				'type_id' => array(
						'description'       => __( 'Dynamic Part Type taxonomy term ID.', 'part-selector' ),
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_type_id' ),
					),
					'limit'   => array(
						'description'       => __( 'Maximum number of items to return.', 'part-selector' ),
						'type'              => 'integer',
						'default'           => 20,
						'minimum'           => 1,
						'maximum'           => 100,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_limit' ),
					),
					'cursor'  => array(
						'description'       => __( 'Continuation cursor for pagination.', 'part-selector' ),
						'type'              => 'string',
						'required'          => false,
						'sanitize_callback' => 'sanitize_text_field',
						'validate_callback' => array( __CLASS__, 'validate_cursor' ),
					),
				),
			)
		);
	}

	// =========================================================================
	// Parameter Validators
	// =========================================================================

	/**
	 * Validates limit parameter.
	 *
	 * @param mixed           $param   Parameter value.
	 * @param WP_REST_Request $request Request object.
	 * @param string          $key     Parameter key.
	 * @return bool|WP_Error
	 */
	public static function validate_limit( $param, $request, $key ) {
		if ( ! is_numeric( $param ) ) {
			return new WP_Error(
				'tgb_invalid_limit',
				__( 'Limit must be an integer between 1 and 100.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		$val = (int) $param;
		if ( $val < 1 || $val > 100 ) {
			return new WP_Error(
				'tgb_invalid_limit',
				__( 'Limit must be an integer between 1 and 100.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}
		return true;
	}

	/**
	 * Validates Part Type ID parameter.
	 *
	 * @param mixed           $param   Parameter value.
	 * @param WP_REST_Request $request Request object.
	 * @param string          $key     Parameter key.
	 * @return bool|WP_Error
	 */
	public static function validate_type_id( $param, $request, $key ) {
		$term_id = absint( $param );
		if ( $term_id <= 0 ) {
			return new WP_Error(
				'tgb_invalid_type_id',
				__( 'Invalid Part Type ID.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		$term = get_term( $term_id, 'tgb_part_type' );
		if ( ! $term || is_wp_error( $term ) ) {
			return new WP_Error(
				'tgb_part_type_not_found',
				__( 'The requested Part Type does not exist.', 'part-selector' ),
				array( 'status' => 404 )
			);
		}

		return true;
	}

	/**
	 * Validates continuation cursor security and structure.
	 *
	 * Untrusted input must decode safely into the expected schema.
	 * Rejects non-base64, non-JSON, negative offsets, and corrupted payloads.
	 *
	 * @param mixed           $param   Parameter value.
	 * @param WP_REST_Request $request Request object.
	 * @param string          $key     Parameter key.
	 * @return bool|WP_Error
	 */
	public static function validate_cursor( $param, $request, $key ) {
		if ( empty( $param ) ) {
			return true;
		}

		if ( ! is_string( $param ) ) {
			return new WP_Error(
				'tgb_invalid_cursor',
				__( 'Malformed continuation cursor.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		// Decode base64
		$decoded_raw = base64_decode( $param, true );
		if ( false === $decoded_raw ) {
			return new WP_Error(
				'tgb_invalid_cursor',
				__( 'Malformed continuation cursor: invalid encoding.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		// Parse JSON
		$decoded = json_decode( $decoded_raw, true );
		if ( ! is_array( $decoded ) || ! isset( $decoded['offset'] ) || ! is_numeric( $decoded['offset'] ) ) {
			return new WP_Error(
				'tgb_invalid_cursor',
				__( 'Malformed continuation cursor: invalid payload structure.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		// Offset must be non-negative integer
		if ( (int) $decoded['offset'] < 0 ) {
			return new WP_Error(
				'tgb_invalid_cursor',
				__( 'Malformed continuation cursor: negative offset.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		return true;
	}

	// =========================================================================
	// Endpoint Handlers
	// =========================================================================

	/**
	 * Retrieves eligible Base Guns.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function get_base_guns( $request ) {
		$limit  = $request->get_param( 'limit' ) ? absint( $request->get_param( 'limit' ) ) : 20;
		$cursor = $request->get_param( 'cursor' ) ? sanitize_text_field( $request->get_param( 'cursor' ) ) : null;

		$query_args = array(
			'limit'  => $limit,
			'cursor' => $cursor,
		);

		$result = TGB_Product_Data::get_base_guns( $query_args );

		$serialized_items = array();
		if ( ! empty( $result['items'] ) && is_array( $result['items'] ) ) {
			foreach ( $result['items'] as $item ) {
				$serialized_items[] = self::serialize_product( $item );
			}
		}

		return rest_ensure_response(
			array(
				'items'       => $serialized_items,
				'limit'       => (int) $result['limit'],
				'has_more'    => (bool) $result['has_more'],
				'next_cursor' => $result['next_cursor'],
			)
		);
	}

	/**
	 * Retrieves all active Part Types from dynamic taxonomy.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public static function get_part_types( $request ) {
		$terms = TGB_Part_Types::get_all_types();

		$data = array();
		if ( ! empty( $terms ) && is_array( $terms ) ) {
			// Sort deterministically alphabetically by name.
			usort(
				$terms,
				function( $a, $b ) {
					return strcasecmp( $a->name, $b->name );
				}
			);

			foreach ( $terms as $term ) {
				$data[] = array(
					'id'    => (int) $term->term_id,
					'name'  => (string) $term->name,
					'slug'  => (string) $term->slug,
					'count' => (int) $term->count,
				);
			}
		}

		return rest_ensure_response( $data );
	}

	/**
	 * Retrieves eligible Parts for a specific dynamic Part Type.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function get_parts( $request ) {
		$type_id = absint( $request->get_param( 'type_id' ) );
		$limit   = $request->get_param( 'limit' ) ? absint( $request->get_param( 'limit' ) ) : 20;
		$cursor  = $request->get_param( 'cursor' ) ? sanitize_text_field( $request->get_param( 'cursor' ) ) : null;
		
		$query_args = array(
			'limit'  => $limit,
			'cursor' => $cursor,
		);

		$result = TGB_Product_Data::get_parts_by_type( $type_id, $query_args );

		$serialized_items = array();
		if ( ! empty( $result['items'] ) && is_array( $result['items'] ) ) {
			foreach ( $result['items'] as $item ) {
				$serialized_items[] = self::serialize_product( $item );
			}
		}

		return rest_ensure_response(
			array(
				'items'       => $serialized_items,
				'limit'       => (int) $result['limit'],
				'has_more'    => (bool) $result['has_more'],
				'next_cursor' => $result['next_cursor'],
			)
		);
	}


public static function search_parts( $request ) {
	$query   = $request->get_param( 'q' ) ? sanitize_text_field( $request->get_param( 'q' ) ) : '';
	$type_id = absint( $request->get_param( 'type_id' ) );
	$limit   = $request->get_param( 'limit' ) ? absint( $request->get_param( 'limit' ) ) : 20;
	$cursor  = $request->get_param( 'cursor' ) ? sanitize_text_field( $request->get_param( 'cursor' ) ) : null;

	$query_args = array(
		'limit'  => $limit,
		'cursor' => $cursor,
	);

	$result = TGB_Product_Data::search_parts( $query, $type_id, $query_args );

	$serialized_items = array();
	if ( ! empty( $result['items'] ) && is_array( $result['items'] ) ) {
		foreach ( $result['items'] as $item ) {
			$serialized_items[] = self::serialize_product( $item );
		}
	}

	return rest_ensure_response(
		array(
			'items'       => $serialized_items,
			'limit'       => (int) $result['limit'],
			'has_more'    => (bool) $result['has_more'],
			'next_cursor' => $result['next_cursor'],
		)
	);
}
	// =========================================================================
	// Public Product Serialization (Section 8)
	// =========================================================================

	/**
	 * Serializes a normalized product data payload for public JSON output.
	 *
	 * Strictly uses an explicit whitelist to prevent accidental leakage of
	 * internal meta keys, post objects, user IDs, or server paths.
	 *
	 * @param array $product Normalized product data from TGB_Product_Data.
	 * @return array Clean public representation.
	 */
	public static function serialize_product( array $product ) {
		return array(
			'id'           => (int) ( $product['id'] ?? 0 ),
			'name'         => (string) ( $product['name'] ?? '' ),
			'slug'         => (string) ( $product['slug'] ?? '' ),
			'permalink'    => (string) ( $product['permalink'] ?? '' ),
			'role'         => (string) ( $product['role'] ?? '' ),
			'part_type'    => ! empty( $product['part_type'] ) ? array(
				'id'   => (int) ( $product['part_type']['id'] ?? 0 ),
				'slug' => (string) ( $product['part_type']['slug'] ?? '' ),
				'name' => (string) ( $product['part_type']['name'] ?? '' ),
			) : null,
			'reference_mm' => (float) ( $product['reference_mm'] ?? 0 ),
			'builder_image'=> ! empty( $product['builder_image'] ) ? array(
				'attachment_id' => (int) ( $product['builder_image']['attachment_id'] ?? 0 ),
				'url'           => (string) ( $product['builder_image']['url'] ?? '' ),
				'width'         => (int) ( $product['builder_image']['width'] ?? 0 ),
				'height'        => (int) ( $product['builder_image']['height'] ?? 0 ),
				'aspect_ratio'  => (float) ( $product['builder_image']['aspect_ratio'] ?? 1.0 ),
				'alt'           => (string) ( $product['builder_image']['alt'] ?? '' ),
			) : null,
			'price'        => ! empty( $product['price'] ) ? array(
				'raw'         => (float) ( $product['price']['raw'] ?? 0.0 ),
				'unit_amount' => isset( $product['price']['unit_amount'] ) && null !== $product['price']['unit_amount']
					? (float) $product['price']['unit_amount']
					: null,
				'display'     => (string) wp_strip_all_tags( html_entity_decode( (string) ( $product['price']['display'] ?? '' ), ENT_QUOTES, 'UTF-8' ) ),
				'on_sale'     => (bool) ( $product['price']['on_sale'] ?? false ),
				'regular'     => isset( $product['price']['regular'] ) && null !== $product['price']['regular']
					? (float) $product['price']['regular']
					: null,
			) : null,
			'stock'        => ! empty( $product['stock'] ) ? array(
				'status'     => (string) ( $product['stock']['status'] ?? 'outofstock' ),
				'in_stock'   => (bool) ( $product['stock']['in_stock'] ?? false ),
				'backorders' => (bool) ( $product['stock']['backorders'] ?? false ),
			) : null,
			'weight'       => $product['weight'] ?? null,
			'woo'          => ! empty( $product['woo'] ) ? array(
				'purchasable' => (bool) ( $product['woo']['purchasable'] ?? false ),
				'type'        => (string) ( $product['woo']['type'] ?? 'simple' ),
			) : null,
			'mounting'     => self::serialize_mounting( $product ),
		);
	}

	/**
	 * Serializes normalized mounting data for public REST consumption.
	 *
	 * Base Gun returns { points: [ { id, label, interface: { id, name, slug }, x, y } ] }.
	 * Part returns { interfaces: [ { id, name, slug } ], anchor: { x_percent, y_percent } | null }.
	 *
	 * @param array $product Normalized product data from TGB_Product_Data.
	 * @return array Public mounting structure.
	 */
	private static function serialize_mounting( array $product ) {
		$role = (string) ( $product['role'] ?? '' );
		$raw_mounting = ( isset( $product['mounting'] ) && is_array( $product['mounting'] ) )
			? $product['mounting']
			: array();

		if ( 'base_gun' === $role ) {
			$points = array();
			if ( ! empty( $raw_mounting['points'] ) && is_array( $raw_mounting['points'] ) ) {
				foreach ( $raw_mounting['points'] as $pt ) {
					if ( ! is_array( $pt ) ) {
						continue;
					}
					$points[] = array(
						'id'        => (string) ( $pt['id'] ?? '' ),
						'label'     => (string) ( $pt['label'] ?? '' ),
						'interface' => array(
							'id'   => (int) ( $pt['interface']['id'] ?? 0 ),
							'name' => (string) ( $pt['interface']['name'] ?? '' ),
							'slug' => (string) ( $pt['interface']['slug'] ?? '' ),
						),
						'x'         => (float) ( $pt['x'] ?? 0.0 ),
						'y'         => (float) ( $pt['y'] ?? 0.0 ),
					);
				}
			}
			return array(
				'points' => $points,
			);
		}

		if ( 'part' === $role ) {
			$interfaces = array();
			if ( ! empty( $raw_mounting['interfaces'] ) && is_array( $raw_mounting['interfaces'] ) ) {
				foreach ( $raw_mounting['interfaces'] as $iface ) {
					if ( ! is_array( $iface ) ) {
						continue;
					}
					$interfaces[] = array(
						'id'   => (int) ( $iface['id'] ?? 0 ),
						'name' => (string) ( $iface['name'] ?? '' ),
						'slug' => (string) ( $iface['slug'] ?? '' ),
					);
				}
			}

			$anchor = null;
			if ( ! empty( $raw_mounting['anchor'] ) && is_array( $raw_mounting['anchor'] ) ) {
				$anchor = array(
					'x_percent' => (float) ( $raw_mounting['anchor']['x_percent'] ?? 0.0 ),
					'y_percent' => (float) ( $raw_mounting['anchor']['y_percent'] ?? 0.0 ),
				);
			}

			return array(
				'interfaces' => $interfaces,
				'anchor'     => $anchor,
			);
		}

		return array();
	}
}
