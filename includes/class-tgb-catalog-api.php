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

		// 2. GET /wp-json/tgb/v1/categories (V2 Native WooCommerce Categories)
		register_rest_route(
			self::NAMESPACE,
			'/categories',
			array(
				'methods'             => array( 'GET', 'POST' ),
				'callback'            => array( __CLASS__, 'get_categories' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'base_gun_id'     => array(
						'description'       => __( 'Base Gun ID to filter categories and counts by mounting compatibility.', 'part-selector' ),
						'type'              => 'integer',
						'required'          => false,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_base_gun_id' ),
					),
					'installed_rails' => array(
						'description'       => __( 'Active installed Rail instances to calculate unlocked categories.', 'part-selector' ),
						'type'              => 'array',
						'required'          => false,
						'sanitize_callback' => array( __CLASS__, 'sanitize_installed_rails' ),
						'validate_callback' => array( __CLASS__, 'validate_installed_rails' ),
					),
				),
			)
		);

		// 3. GET /wp-json/tgb/v1/part-types (Legacy V1.1 compatibility)
		register_rest_route(
			self::NAMESPACE,
			'/part-types',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_part_types' ),
				'permission_callback' => '__return_true',
			)
		);

		// 4. GET /wp-json/tgb/v1/parts
		register_rest_route(
			self::NAMESPACE,
			'/parts',
			array(
				'methods'             => array( 'GET', 'POST' ),
				'callback'            => array( __CLASS__, 'get_parts' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'category_id'     => array(
						'description'       => __( 'WooCommerce product_cat taxonomy term ID.', 'part-selector' ),
						'type'              => 'integer',
						'required'          => false,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_category_id' ),
					),
					'type_id'         => array(
						'description'       => __( 'Legacy Dynamic Part Type taxonomy term ID.', 'part-selector' ),
						'type'              => 'integer',
						'required'          => false,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_type_id' ),
					),
					'base_gun_id'     => array(
						'description'       => __( 'Base Gun ID to filter parts by mounting compatibility.', 'part-selector' ),
						'type'              => 'integer',
						'required'          => false,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_base_gun_id' ),
					),
					'installed_rails' => array(
						'description'       => __( 'Active installed Rail instances to filter parts by active capability pool.', 'part-selector' ),
						'type'              => 'array',
						'required'          => false,
						'sanitize_callback' => array( __CLASS__, 'sanitize_installed_rails' ),
						'validate_callback' => array( __CLASS__, 'validate_installed_rails' ),
					),
					'limit'           => array(
						'description'       => __( 'Maximum number of items to return.', 'part-selector' ),
						'type'              => 'integer',
						'default'           => 20,
						'minimum'           => 1,
						'maximum'           => 100,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_limit' ),
					),
					'cursor'          => array(
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
				'callback'            => array(__CLASS__, 'search_parts'),
				'permission_callback' => '__return_true',
				'args'                => array(
					'q'       => array(
						'description'       => __('Search query string.', 'part-selector'),
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_text_field',
					),
					'type_id' => array(
						'description'       => __('Dynamic Part Type taxonomy term ID.', 'part-selector'),
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
						'validate_callback' => array(__CLASS__, 'validate_type_id'),
					),
					'limit'   => array(
						'description'       => __('Maximum number of items to return.', 'part-selector'),
												'validate_callback' => array(__CLASS__, 'validate_limit'),
					),
					'cursor'  => array(
						'description'       => __('Continuation cursor for pagination.', 'part-selector'),
						'type'              => 'string',
						'required'          => false,
						'sanitize_callback' => 'sanitize_text_field',
						'validate_callback' => array(__CLASS__, 'validate_cursor'),
					)
				)
			)
		);
		// 5. GET /wp-json/tgb/v1/rails
		register_rest_route(
			self::NAMESPACE,
			'/rails',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_rails' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'base_gun_id' => array(
						'description'       => __( 'Base Gun ID to filter rails by category policy and mounting compatibility.', 'part-selector' ),
						'type'              => 'integer',
						'required'          => false,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_base_gun_id' ),
					),
					'limit'       => array(
						'description'       => __( 'Maximum number of items to return.', 'part-selector' ),
						'type'              => 'integer',
						'default'           => 20,
						'minimum'           => 1,
						'maximum'           => 100,
						'sanitize_callback' => 'absint',					
						'validate_callback' => array( __CLASS__, 'validate_limit' ),
					),
				),
			)
		);

		// 6. POST /wp-json/tgb/v1/validate-build (Dynamic capability and compatibility preview)
		register_rest_route(
			self::NAMESPACE,
			'/validate-build',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'validate_build' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'base_gun_id'     => array(
						'description'       => __( 'Base Gun product ID.', 'part-selector' ),
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
						'validate_callback' => array( __CLASS__, 'validate_base_gun_id' ),
					),
					'installed_rails' => array(
						'description'       => __( 'Proposed installed Rail instances.', 'part-selector' ),
						'type'              => 'array',
						'required'          => false,
						'sanitize_callback' => array( __CLASS__, 'sanitize_installed_rails' ),
						'validate_callback' => array( __CLASS__, 'validate_installed_rails' ),
					),
					'parts'           => array(
						'description'       => __( 'Parts to evaluate against resulting capability pool.', 'part-selector' ),
						'type'              => 'array',
						'required'          => false,
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
		if ( empty( $param ) ) {
			return true;
		}

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
	 * Validates WooCommerce product_cat Category ID parameter.
	 *
	 * @param mixed           $param   Parameter value.
	 * @param WP_REST_Request $request Request object.
	 * @param string          $key     Parameter key.
	 * @return bool|WP_Error
	 */
	public static function validate_category_id( $param, $request, $key ) {
		if ( empty( $param ) ) {
			return true;
		}

		if ( ! is_numeric( $param ) || (int) $param <= 0 ) {
			return new WP_Error(
				'tgb_invalid_category_id',
				__( 'Category ID must be a positive integer.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		$term_id = absint( $param );
		$term    = get_term( $term_id, 'product_cat' );
		if ( ! $term || is_wp_error( $term ) ) {
			return new WP_Error(
				'tgb_category_not_found',
				__( 'The requested Product Category does not exist.', 'part-selector' ),
				array( 'status' => 404 )
			);
		}

		return true;
	}

	/**
	 * Validates Base Gun ID parameter.
	 *
	 * @param mixed           $param   Parameter value.
	 * @param WP_REST_Request $request Request object.
	 * @param string          $key     Parameter key.
	 * @return bool|WP_Error
	 */
	public static function validate_base_gun_id( $param, $request, $key ) {
		if ( empty( $param ) ) {
			return true;
		}

		if ( ! is_numeric( $param ) || (int) $param <= 0 ) {
			return new WP_Error(
				'tgb_invalid_base_gun_id',
				__( 'Base Gun ID must be a positive integer.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		$product_id = absint( $param );
		$product    = wc_get_product( $product_id );
		if ( ! $product ) {
			return new WP_Error(
				'tgb_base_gun_not_found',
				__( 'The requested Base Gun product does not exist.', 'part-selector' ),
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

	/**
	 * Validates installed_rails parameter structure and bounds.
	 *
	 * Untrusted input must be an array (or valid JSON array string) of rail objects,
	 * each specifying instance_id, product_id, and position ('top' or 'bottom').
	 *
	 * @param mixed           $param   Parameter value.
	 * @param WP_REST_Request $request Request object.
	 * @param string          $key     Parameter key.
	 * @return bool|WP_Error
	 */
	public static function validate_installed_rails( $param, $request = null, $key = '' ) {
		if ( empty( $param ) ) {
			return true;
		}

		if ( is_string( $param ) ) {
			$decoded = json_decode( $param, true );
			if ( ! is_array( $decoded ) ) {
				return new WP_Error(
					'tgb_invalid_installed_rails',
					__( 'Installed rails parameter must be an array or valid JSON array.', 'part-selector' ),
					array( 'status' => 400 )
				);
			}
			$param = $decoded;
		}

		if ( ! is_array( $param ) ) {
			return new WP_Error(
				'tgb_invalid_installed_rails',
				__( 'Installed rails parameter must be an array.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		// Security/resource bounds: maximum 10 rail instances per build.
		if ( count( $param ) > 10 ) {
			return new WP_Error(
				'tgb_too_many_rails',
				__( 'Cannot install more than 10 rails in a build.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		$seen_instances = array();
		foreach ( $param as $idx => $rail ) {
			if ( ! is_array( $rail ) ) {
				return new WP_Error(
					'tgb_invalid_rail_entry',
					__( 'Each rail entry must be an object.', 'part-selector' ),
					array( 'status' => 400 )
				);
			}

			$instance_id = '';
			if ( isset( $rail['instance_id'] ) && is_string( $rail['instance_id'] ) ) {
				$instance_id = sanitize_key( $rail['instance_id'] );
			} elseif ( isset( $rail['instanceId'] ) && is_string( $rail['instanceId'] ) ) {
				$instance_id = sanitize_key( $rail['instanceId'] );
			}

			$product_id = 0;
			if ( isset( $rail['product_id'] ) ) {
				$product_id = absint( $rail['product_id'] );
			} elseif ( isset( $rail['productId'] ) ) {
				$product_id = absint( $rail['productId'] );
			}

			$position = '';
			if ( isset( $rail['position'] ) && is_string( $rail['position'] ) ) {
				$position = sanitize_key( $rail['position'] );
			}

			if ( '' === $instance_id ) {
				return new WP_Error(
					'tgb_missing_instance_id',
					__( 'Each rail must have a valid non-empty instance_id.', 'part-selector' ),
					array( 'status' => 400 )
				);
			}

			if ( in_array( $instance_id, $seen_instances, true ) ) {
				return new WP_Error(
					'tgb_duplicate_instance_id',
					__( 'Duplicate rail instance_id detected.', 'part-selector' ),
					array( 'status' => 400 )
				);
			}
			$seen_instances[] = $instance_id;

			if ( $product_id <= 0 ) {
				return new WP_Error(
					'tgb_invalid_rail_product_id',
					__( 'Invalid rail product_id.', 'part-selector' ),
					array( 'status' => 400 )
				);
			}

			if ( ! in_array( $position, array( 'top', 'bottom' ), true ) ) {
				return new WP_Error(
					'tgb_invalid_rail_position',
					__( 'Rail position must be "top" or "bottom".', 'part-selector' ),
					array( 'status' => 400 )
				);
			}
		}

		return true;
	}

	/**
	 * Sanitizes installed_rails parameter into a clean list of rail instances.
	 *
	 * @param mixed $param Raw parameter value.
	 * @return array Sanitized array of rail instances.
	 */
	public static function sanitize_installed_rails( $param ) {
		if ( empty( $param ) ) {
			return array();
		}

		if ( is_string( $param ) ) {
			$decoded = json_decode( $param, true );
			if ( is_array( $decoded ) ) {
				$param = $decoded;
			} else {
				return array();
			}
		}

		if ( ! is_array( $param ) ) {
			return array();
		}

		$sanitized = array();
		foreach ( $param as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$instance_id = isset( $entry['instance_id'] ) ? substr( sanitize_key( (string) $entry['instance_id'] ), 0, 64 ) : '';
			$product_id  = isset( $entry['product_id'] ) ? absint( $entry['product_id'] ) : 0;
			$raw_pos     = isset( $entry['position'] ) && null !== $entry['position'] ? sanitize_key( (string) $entry['position'] ) : '';
			$position    = in_array( $raw_pos, array( 'top', 'bottom' ), true ) ? $raw_pos : '';

			if ( '' !== $instance_id && $product_id > 0 && '' !== $position ) {
				$sanitized[] = array(
					'instance_id' => $instance_id,
					'product_id'  => $product_id,
					'position'    => $position,
				);
			}
		}

		return $sanitized;
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
	 * Retrieves hierarchical WooCommerce product categories with compatible Parts.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response
	 */
	public static function get_categories( $request ) {
		$base_gun_id     = $request->get_param( 'base_gun_id' ) ? absint( $request->get_param( 'base_gun_id' ) ) : 0;
		$installed_rails = $request->get_param( 'installed_rails' );

		if ( ! empty( $installed_rails ) ) {
			$rail_val = self::validate_installed_rails( $installed_rails, $request, 'installed_rails' );
			if ( is_wp_error( $rail_val ) ) {
				return $rail_val;
			}
			$installed_rails = self::sanitize_installed_rails( $installed_rails );
		} else {
			$installed_rails = array();
		}

		$categories = TGB_Product_Data::get_compatible_categories( $base_gun_id, $installed_rails );

		return rest_ensure_response( $categories );
	}

	/**
	 * Retrieves eligible Parts for a specific category or Part Type.
	 *
	 * Supports WooCommerce product_cat terms (via category_id) as primary V2 path,
	 * with backward-compatible fallback to tgb_part_type terms (via type_id).
	 * If base_gun_id is supplied, restricts results to compatible Parts.
	 * If installed_rails is supplied, evaluates compatibility against the active capability pool.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function get_parts( $request ) {
		$category_id     = $request->get_param( 'category_id' ) ? absint( $request->get_param( 'category_id' ) ) : 0;
		$type_id         = $request->get_param( 'type_id' ) ? absint( $request->get_param( 'type_id' ) ) : 0;
		$base_gun_id     = $request->get_param( 'base_gun_id' ) ? absint( $request->get_param( 'base_gun_id' ) ) : 0;
		$limit           = $request->get_param( 'limit' ) ? absint( $request->get_param( 'limit' ) ) : 20;
		$cursor          = $request->get_param( 'cursor' ) ? sanitize_text_field( $request->get_param( 'cursor' ) ) : null;
		$installed_rails = $request->get_param( 'installed_rails' );

		if ( ! empty( $installed_rails ) ) {
			$rail_val = self::validate_installed_rails( $installed_rails, $request, 'installed_rails' );
			if ( is_wp_error( $rail_val ) ) {
				return $rail_val;
			}
			$installed_rails = self::sanitize_installed_rails( $installed_rails );
		} else {
			$installed_rails = array();
		}

		if ( $category_id <= 0 && $type_id <= 0 ) {
			return new WP_Error(
				'tgb_missing_category',
				__( 'Either category_id or type_id is required.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		$query_args = array(
			'limit'           => $limit,
			'cursor'          => $cursor,
			'base_gun_id'     => $base_gun_id,
			'installed_rails' => $installed_rails,
		);

		if ( $category_id > 0 ) {
			if ( $base_gun_id > 0 && ! TGB_Product_Config::is_category_allowed_for_gun( $base_gun_id, $category_id ) ) {
				return new WP_Error(
					'tgb_category_disallowed',
					__( 'Category is not permitted under Base Gun policy.', 'part-selector' ),
					array( 'status' => 400 )
				);
			}
			$result = TGB_Product_Data::get_parts_by_category( $category_id, $query_args );
		} else {
			$result = TGB_Product_Data::get_parts_by_type( $type_id, $query_args );
		}

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


	public static function search_parts($request)
	{
		$query   = $request->get_param('q') ? sanitize_text_field($request->get_param('q')) : '';
		$type_id = absint($request->get_param('type_id'));
		$limit   = $request->get_param('limit') ? absint($request->get_param('limit')) : 20;
		$cursor  = $request->get_param('cursor') ? sanitize_text_field($request->get_param('cursor')) : null;

		$query_args = array(
			'limit'  => $limit,
			'cursor' => $cursor,
		);

		$result = TGB_Product_Data::search_parts($query, $type_id, $query_args);

		$serialized_items = array();
		if (! empty($result['items']) && is_array($result['items'])) {
			foreach ($result['items'] as $item) {
				$serialized_items[] = self::serialize_product($item);
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
	 * Endpoint handler for POST /wp-json/tgb/v1/validate-build.
	 *
	 * Authoritatively validates Base Gun, proposed Rails, and Parts compatibility.
	 *
	 * @param WP_REST_Request $request REST request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function validate_build( WP_REST_Request $request ) {
		$base_gun_id     = absint( $request->get_param( 'base_gun_id' ) );
		$installed_rails = $request->get_param( 'installed_rails' );
		$parts           = $request->get_param( 'parts' );
		if ( empty( $parts ) ) {
			$parts = $request->get_param( 'installed_parts' );
		}

		if ( $base_gun_id <= 0 ) {
			return new WP_Error(
				'tgb_invalid_base_gun',
				__( 'Valid Base Gun ID is required.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		if ( ! empty( $installed_rails ) ) {
			$rail_val = self::validate_installed_rails( $installed_rails, $request, 'installed_rails' );
			if ( is_wp_error( $rail_val ) ) {
				return $rail_val;
			}
			$installed_rails = self::sanitize_installed_rails( $installed_rails );
		} else {
			$installed_rails = array();
		}

		if ( empty( $parts ) ) {
			$parts = array();
		} elseif ( is_string( $parts ) ) {
			$decoded_parts = json_decode( $parts, true );
			if ( is_array( $decoded_parts ) ) {
				$parts = $decoded_parts;
			}
		}

		$result = TGB_Rail_Compatibility::validate_proposed_build( $base_gun_id, $installed_rails, $parts );

		return rest_ensure_response( $result );
	}

	/**
	 * Endpoint handler for GET /wp-json/tgb/v1/rails.
	 *
	 * Returns read-only eligible Rail products with normalized public product data.
	 *
	 * @param WP_REST_Request $request REST request object.
	 * @return WP_REST_Response
	 */
	public static function get_rails( WP_REST_Request $request ) {
		$base_gun_id = (int) $request->get_param( 'base_gun_id' );
		$limit       = (int) $request->get_param( 'limit' );
		if ( $limit <= 0 ) {
			$limit = 20;
		}

		$result = TGB_Rail_Compatibility::get_eligible_rails(
			$base_gun_id,
			array( 'limit' => $limit )
		);

		$serialized_items = array();
		foreach ( $result['items'] as $item ) {
			$serialized_items[] = self::serialize_product( $item );
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
			'categories'   => ! empty( $product['categories'] ) && is_array( $product['categories'] ) ? array_values( array_map( function( $cat ) {
				return array(
					'id'     => (int) ( $cat['id'] ?? 0 ),
					'name'   => (string) ( $cat['name'] ?? '' ),
					'slug'   => (string) ( $cat['slug'] ?? '' ),
					'parent' => (int) ( $cat['parent'] ?? 0 ),
				);
			}, $product['categories'] ) ) : array(),
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
			'category_policy'        => ( 'base_gun' === ( $product['role'] ?? '' ) ) ? (string) ( $product['category_policy'] ?? 'all' ) : null,
			'allowed_rail_positions' => ( 'base_gun' === ( $product['role'] ?? '' ) && ! empty( $product['allowed_rail_positions'] ) ) ? array_values( (array) $product['allowed_rail_positions'] ) : array(),
			'rail'                   => ( 'rail' === ( $product['role'] ?? '' ) ) ? self::serialize_rail( $product ) : null,
			'mounting'               => self::serialize_mounting( $product ),
		);
	}

	/**
	 * Serializes normalized rail configuration for public REST consumption.
	 *
	 * Resolves taxonomy terms for input and output interfaces to include IDs, names, and slugs.
	 *
	 * @param array $product Normalized product data from TGB_Product_Data.
	 * @return array|null Public rail structure.
	 */
	private static function serialize_rail( array $product ) {
		if ( empty( $product['rail'] ) || ! is_array( $product['rail'] ) ) {
			return null;
		}

		$raw = $product['rail'];
		$resolve_terms = function( $term_ids ) {
			$terms = array();
			if ( ! empty( $term_ids ) && is_array( $term_ids ) ) {
				foreach ( $term_ids as $tid ) {
					$t = get_term( absint( $tid ), 'tgb_mount_interface' );
					if ( $t && ! is_wp_error( $t ) ) {
						$terms[] = array(
							'id'   => (int) $t->term_id,
							'name' => (string) $t->name,
							'slug' => (string) $t->slug,
						);
					}
				}
			}
			return $terms;
		};

		$inputs  = $resolve_terms( $raw['input_interfaces'] ?? array() );
		$outputs = $resolve_terms( $raw['output_interfaces'] ?? array() );

		return array(
			'input_interface'     => ! empty( $inputs ) ? $inputs[0] : null,
			'input_interfaces'    => $inputs,
			'output_interfaces'   => $outputs,
			'supported_positions' => ! empty( $raw['supported_positions'] ) ? array_values( (array) $raw['supported_positions'] ) : array(),
		);
	}

	/**
	 * Serializes normalized mounting data for public REST consumption.
	 *
	 * Base Gun returns { points: [ { id, label, interface: { id, name, slug }, position, x, y } ] }.
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
						'position'  => (string) ( $pt['position'] ?? 'unspecified' ),
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
				'positions'  => ! empty( $raw_mounting['positions'] ) ? (array) $raw_mounting['positions'] : array(),
			);
		}

		return array();
	}
}
