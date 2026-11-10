<?php
/**
 * Class TGB_Shares
 *
 * Implements Part 6: Secure Shareable Build Links, Public Viewing & Revocation.
 *
 * Provides a cryptographically secure, non-public snapshot storage layer for sharing
 * airsoft gun configurations via unguessable bearer tokens (32 random bytes / SHA-256 hashed).
 *
 * Enforces:
 * - Complete isolation of private account builds (tgb_saved_build).
 * - Read-only public preview with live WooCommerce pricing, inventory, and unavailable item alerts.
 * - Mandatory 90-day expiration on anonymous guest links.
 * - Immediate revocation and rotation by registered account owners.
 * - Abuse prevention and anonymous rate limiting.
 * - Automatic revocation when the underlying saved build is deleted.
 * - Automatic bounded WP-Cron cleanup of expired anonymous shares.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class TGB_Shares {

	/**
	 * Private custom post type slug for shared snapshots.
	 */
	const POST_TYPE = 'tgb_shared_build';

	/**
	 * Metadata keys.
	 */
	const META_TOKEN_HASH            = '_tgb_share_token_hash';
	const META_SCHEMA_VERSION        = '_tgb_build_schema_version';
	const META_BASE_PRODUCT_ID       = '_tgb_base_product_id';
	const META_RAILS                 = '_tgb_rails';
	const META_PARTS                 = '_tgb_parts';
	const META_SOURCE_TYPE           = '_tgb_share_source_type'; // 'guest' | 'account'
	const META_SOURCE_SAVED_BUILD_ID = '_tgb_source_saved_build_id';
	const META_CREATED_AT            = '_tgb_share_created_at';
	const META_EXPIRES_AT            = '_tgb_share_expires_at'; // UTC timestamp, 0 = no expiration
	const META_IS_REVOKED            = '_tgb_is_revoked'; // '0' | '1'
	const META_REVOKED_AT            = '_tgb_share_revoked_at';

	/**
	 * Guest link lifespan in days.
	 */
	const GUEST_EXPIRATION_DAYS = 90;

	/**
	 * Guest link lifespan in seconds: 90 days.
	 */
	const GUEST_LIFESPAN = 7776000; // 90 * DAY_IN_SECONDS (90 * 86400)

	/**
	 * Anonymous rate limit: maximum shares per IP per hour.
	 */
	const GUEST_RATE_LIMIT_HOUR = 25;

	/**
	 * Initialize hooks and subsystems.
	 */
	public static function init() {
		// 1. Register private non-public CPT for share snapshots.
		add_action( 'init', array( __CLASS__, 'register_post_type' ), 5 );

		// 2. Register REST API routes.
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest_routes' ) );

		// 3. WP-Cron scheduled cleanup of expired guest shares.
		add_action( 'tgb_cleanup_expired_shares', array( __CLASS__, 'cleanup_expired_shares' ) );
		if ( ! wp_next_scheduled( 'tgb_cleanup_expired_shares' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'tgb_cleanup_expired_shares' );
		}

		// 4. Auto-revoke shares when source account saved build is deleted.
		add_action( 'deleted_post', array( __CLASS__, 'on_source_build_deleted' ), 10, 2 );
	}

	/**
	 * Registers the private custom post type for shared builds.
	 *
	 * Strictly non-public: no public single URL, no archive, no search,
	 * no admin UI, and no generic REST exposure.
	 */
	public static function register_post_type() {
		register_post_type(
			self::POST_TYPE,
			array(
				'labels'              => array(
					'name'          => __( 'Shared Gun Builds', 'part-selector' ),
					'singular_name' => __( 'Shared Gun Build', 'part-selector' ),
				),
				'public'              => false,
				'publicly_queryable'  => false,
				'exclude_from_search' => true,
				'show_ui'             => false,
				'show_in_rest'        => false,
				'show_in_nav_menus'   => false,
				'has_archive'         => false,
				'rewrite'             => false,
				'query_var'           => false,
				'can_export'          => true,
				'delete_with_user'    => true,
				'supports'            => array( 'title', 'author' ),
			)
		);
	}

	/**
	 * Generates a cryptographically strong random bearer token.
	 *
	 * @return string 64-character lowercase hexadecimal string (32 bytes entropy).
	 */
	public static function generate_token() {
		return bin2hex( random_bytes( 32 ) );
	}

	/**
	 * Computes a deterministic SHA-256 hash of a bearer token for database storage/lookup.
	 *
	 * @param string $token Raw bearer token.
	 * @return string 64-character SHA-256 hash.
	 */
	public static function hash_token( $token ) {
		return hash( 'sha256', trim( $token ) );
	}

	/**
	 * Generates a dynamic public share URL pointing to the Gun Builder page.
	 *
	 * @param string $token Raw bearer token.
	 * @return string Complete public share URL.
	 */
	public static function get_share_url( $token ) {
		$builder_page = TGB_Shortcode::get_builder_page_url();
		return add_query_arg( 'tgb_share', rawurlencode( $token ), $builder_page );
	}

	// =========================================================================
	// REST API Routes
	// =========================================================================

	/**
	 * Registers REST routes under namespace 'tgb/v1'.
	 */
	public static function register_rest_routes() {
		// 1. Create a new share (Guests & Logged-in Customers).
		register_rest_route(
			'tgb/v1',
			'/shares',
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'rest_create_share' ),
					'permission_callback' => '__return_true', // Public with internal rate-limiting and auth checks.
				),
			)
		);

		// 2. Public read-only share retrieval by token.
		register_rest_route(
			'tgb/v1',
			'/shares/(?P<token>[a-fA-F0-9]{32,128})',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'rest_get_share' ),
					'permission_callback' => '__return_true', // Unauthenticated public access with token lookup.
					'args'                => array(
						'token' => array(
							'validate_callback' => function( $param ) {
								return is_string( $param ) && preg_match( '/^[a-fA-F0-9]{32,128}$/', $param );
							},
						),
					),
				),
			)
		);

		// 3. List authenticated customer's own shares.
		register_rest_route(
			'tgb/v1',
			'/my-shares',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'rest_get_my_shares' ),
					'permission_callback' => array( __CLASS__, 'rest_auth_check' ),
				),
			)
		);

		// 4. Revoke an active share (Owner only).
		register_rest_route(
			'tgb/v1',
			'/shares/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( __CLASS__, 'rest_revoke_share' ),
					'permission_callback' => array( __CLASS__, 'rest_auth_check' ),
					'args'                => array(
						'id' => array(
							'validate_callback' => function( $param ) {
								return is_numeric( $param ) && $param > 0;
							},
						),
					),
				),
			)
		);

		// 5. Replace an existing share link with a fresh token (Owner only).
		register_rest_route(
			'tgb/v1',
			'/shares/(?P<id>\d+)/replace',
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'rest_replace_share' ),
					'permission_callback' => array( __CLASS__, 'rest_auth_check' ),
					'args'                => array(
						'id' => array(
							'validate_callback' => function( $param ) {
								return is_numeric( $param ) && $param > 0;
							},
						),
					),
				),
			)
		);
	}

	/**
	 * Permission check: user must be authenticated.
	 *
	 * @return bool|WP_Error
	 */
	public static function rest_auth_check() {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'tgb_unauthorized',
				__( 'Authentication required for this operation.', 'part-selector' ),
				array( 'status' => 401 )
			);
		}
		return true;
	}

	/**
	 * Checks and enforces anonymous guest rate limiting by IP hash.
	 *
	 * @return bool True if allowed, false if limit exceeded.
	 */
	private static function check_guest_rate_limit() {
		$ip = ! empty( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '0.0.0.0';
		$ip_key = 'tgb_srate_' . md5( $ip );

		$current = (int) get_transient( $ip_key );
		if ( $current >= self::GUEST_RATE_LIMIT_HOUR ) {
			return false;
		}

		set_transient( $ip_key, $current + 1, HOUR_IN_SECONDS );
		return true;
	}

	// =========================================================================
	// REST Controllers
	// =========================================================================

	/**
	 * REST: Create a new shareable snapshot.
	 *
	 * Supports:
	 * - Guests sharing their active configuration (90-day expiration, rate limited).
	 * - Authenticated customers sharing an unsaved working configuration.
	 * - Authenticated customers sharing a saved account build by ID.
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_create_share( $request ) {
		$user_id = get_current_user_id();
		$body    = $request->get_json_params();

		if ( empty( $body ) || ! is_array( $body ) ) {
			return new WP_Error(
				'tgb_invalid_payload',
				__( 'Invalid share request payload.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		$is_guest            = ( $user_id <= 0 );
		$source_type         = $is_guest ? 'guest' : 'account';
		$source_saved_id     = 0;
		$validated_data      = null;

		// 1. Guest rate limiting.
		if ( $is_guest ) {
			if ( ! self::check_guest_rate_limit() ) {
				return new WP_Error(
					'tgb_rate_limited',
					__( 'Too many share links created recently. Please try again later.', 'part-selector' ),
					array( 'status' => 429 )
				);
			}
		}

		// 2. Case A: Sharing by saved-build ID (authenticated only).
		if ( ! empty( $body['savedBuildId'] ) ) {
			if ( $is_guest ) {
				return new WP_Error(
					'tgb_unauthorized',
					__( 'You must be logged in to share an account build.', 'part-selector' ),
					array( 'status' => 401 )
				);
			}

			$source_saved_id = absint( $body['savedBuildId'] );
			$post = TGB_Saved_Builds::get_user_build_post( $source_saved_id, $user_id );
			if ( ! $post ) {
				return new WP_Error(
					'tgb_build_not_found',
					__( 'Saved build not found or you do not have permission to share it.', 'part-selector' ),
					array( 'status' => 404 )
				);
			}

			$detail = TGB_Saved_Builds::get_build_detail( $source_saved_id, $user_id );
			if ( ! $detail ) {
				return new WP_Error(
					'tgb_build_not_found',
					__( 'Unable to load build detail for sharing.', 'part-selector' ),
					array( 'status' => 404 )
				);
			}

			$validated_data = array(
				'schemaVersion' => 2,
				'name'          => $detail['name'],
				'baseProductId' => $detail['baseProductId'],
				'rails'         => $detail['rails'],
				'parts'         => $detail['parts'],
			);
		} else {
			// Case B: Sharing working configuration (guest or logged-in).
			$validated = TGB_Saved_Builds::validate_build_data( $body );
			if ( is_wp_error( $validated ) ) {
				return $validated;
			}
			$validated_data = $validated;
		}

		// 3. Ensure Base Gun is valid and positive.
		if ( empty( $validated_data['baseProductId'] ) || (int) $validated_data['baseProductId'] <= 0 ) {
			return new WP_Error(
				'tgb_invalid_payload',
				__( 'A valid base weapon must be selected to generate a share link.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		// 3b. Verify unique instance IDs across Rails and Parts (Section 4.4).
		$seen_instance_ids = array();
		if ( ! empty( $validated_data['rails'] ) && is_array( $validated_data['rails'] ) ) {
			foreach ( $validated_data['rails'] as $r ) {
				$iid = ! empty( $r['instanceId'] ) ? trim( (string) $r['instanceId'] ) : '';
				if ( '' === $iid ) continue;
				if ( isset( $seen_instance_ids[ $iid ] ) ) {
					return new WP_Error(
						'tgb_duplicate_instance_id',
						__( 'Duplicate rail instance ID detected.', 'part-selector' ),
						array( 'status' => 400 )
					);
				}
				$seen_instance_ids[ $iid ] = true;
			}
		}
		if ( ! empty( $validated_data['parts'] ) && is_array( $validated_data['parts'] ) ) {
			foreach ( $validated_data['parts'] as $p ) {
				$iid = ! empty( $p['instanceId'] ) ? trim( (string) $p['instanceId'] ) : '';
				if ( '' === $iid ) continue;
				if ( isset( $seen_instance_ids[ $iid ] ) ) {
					return new WP_Error(
						'tgb_duplicate_instance_id',
						__( 'Duplicate part instance ID detected.', 'part-selector' ),
						array( 'status' => 400 )
					);
				}
				$seen_instance_ids[ $iid ] = true;
			}
		}

		// 4. Generate cryptographically unpredictable token & hash.
		$raw_token  = self::generate_token();
		$token_hash = self::hash_token( $raw_token );
		$created_at = time();

		// 5. Expiration: mandatory 90 days for guests; permanent (0) for registered account owners.
		$expires_at = $is_guest ? ( $created_at + self::GUEST_LIFESPAN ) : 0;

		// 6. Create tgb_shared_build post.
		$share_id = wp_insert_post(
			array(
				'post_type'    => self::POST_TYPE,
				'post_status'  => 'publish',
				'post_author'  => $user_id,
				'post_title'   => sanitize_text_field( $validated_data['name'] ),
				'post_content' => '',
			),
			true
		);

		if ( is_wp_error( $share_id ) ) {
			return $share_id;
		}

		// 7. Store metadata snapshot.
		update_post_meta( $share_id, self::META_TOKEN_HASH, $token_hash );
		update_post_meta( $share_id, self::META_SCHEMA_VERSION, 2 );
		update_post_meta( $share_id, self::META_BASE_PRODUCT_ID, (int) $validated_data['baseProductId'] );
		update_post_meta( $share_id, self::META_RAILS, $validated_data['rails'] );
		update_post_meta( $share_id, self::META_PARTS, $validated_data['parts'] );
		update_post_meta( $share_id, self::META_SOURCE_TYPE, $source_type );
		update_post_meta( $share_id, self::META_SOURCE_SAVED_BUILD_ID, $source_saved_id );
		update_post_meta( $share_id, self::META_CREATED_AT, $created_at );
		update_post_meta( $share_id, self::META_EXPIRES_AT, $expires_at );
		update_post_meta( $share_id, self::META_IS_REVOKED, '0' );

		$share_url = self::get_share_url( $raw_token );

		$response_data = array(
			'success'         => true,
			'share_id'        => $share_id,
			'share_token'     => $raw_token,
			'share_url'       => $share_url,
			'name'            => $validated_data['name'],
			'source_type'     => $source_type,
			'created_at'      => $created_at,
			'expires_at'      => $expires_at,
			'expires_in_days' => $is_guest ? self::GUEST_EXPIRATION_DAYS : null,
			'message'         => $is_guest
				? __( 'Share link created! This link will expire in 90 days.', 'part-selector' )
				: __( 'Share link created! You can manage or revoke this link from My Account.', 'part-selector' ),
		);

		$response = new WP_REST_Response( $response_data, 201 );
		$response->header( 'Cache-Control', 'no-cache, no-store, must-revalidate, private' );
		return $response;
	}

	/**
	 * REST: Public read-only share retrieval by token.
	 *
	 * Unauthenticated. Validates token hash, checks revocation, checks 90-day expiration,
	 * dynamically resolves live WooCommerce pricing and stock status, and filters out
	 * all private owner and internal metadata.
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_get_share( $request ) {
		global $wpdb;

		$token = sanitize_text_field( $request->get_param( 'token' ) );
		if ( empty( $token ) || ! is_string( $token ) || ! preg_match( '/^[0-9a-fA-F]{64}$/', $token ) ) {
			return new WP_Error(
				'tgb_invalid_token',
				__( 'A valid share token is required.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		$token_hash = self::hash_token( $token );

		// Query active post matching token hash.
		$share_id = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT p.ID FROM {$wpdb->posts} p
				 INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
				 WHERE p.post_type = %s
				   AND p.post_status = 'publish'
				   AND pm.meta_key = %s
				   AND pm.meta_value = %s
				 LIMIT 1",
				self::POST_TYPE,
				self::META_TOKEN_HASH,
				$token_hash
			)
		);

		if ( ! $share_id ) {
			return new WP_Error(
				'tgb_share_not_found',
				__( 'This shared build link is invalid or has been revoked.', 'part-selector' ),
				array( 'status' => 404 )
			);
		}

		// 1. Revocation check.
		$is_revoked = get_post_meta( $share_id, self::META_IS_REVOKED, true );
		if ( '1' === $is_revoked ) {
			return new WP_Error(
				'tgb_share_revoked',
				__( 'This shared build link has been revoked by its owner.', 'part-selector' ),
				array( 'status' => 404 )
			);
		}

		// 2. Expiration check (immediate check without waiting for cron).
		$expires_at = (int) get_post_meta( $share_id, self::META_EXPIRES_AT, true );
		if ( $expires_at > 0 && time() >= $expires_at ) {
			return new WP_Error(
				'tgb_share_expired',
				__( 'This shared build link has expired after 90 days.', 'part-selector' ),
				array( 'status' => 410 )
			);
		}

		$post = get_post( $share_id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return new WP_Error(
				'tgb_share_not_found',
				__( 'Shared build not found.', 'part-selector' ),
				array( 'status' => 404 )
			);
		}

		$base_pid    = (int) get_post_meta( $share_id, self::META_BASE_PRODUCT_ID, true );
		$raw_rails   = get_post_meta( $share_id, self::META_RAILS, true );
		$raw_parts   = get_post_meta( $share_id, self::META_PARTS, true );
		$source_type = get_post_meta( $share_id, self::META_SOURCE_TYPE, true ) ?: 'guest';
		$created_at  = (int) get_post_meta( $share_id, self::META_CREATED_AT, true );

		if ( ! is_array( $raw_rails ) ) {
			$raw_rails = array();
		}
		if ( ! is_array( $raw_parts ) ) {
			$raw_parts = array();
		}

		// 3. Resolve live WooCommerce product data & current pricing.
		$resolved_base_product = null;
		$base_product_available = false;
		$unavailable_items     = array();
		$total_price_raw       = 0.0;

		if ( $base_pid > 0 ) {
			$wc_gun = wc_get_product( $base_pid );
			if ( $wc_gun && 'publish' === $wc_gun->get_status() ) {
				$pdata = TGB_Product_Data::get_product_data( $base_pid );
				$gun_price = (float) $wc_gun->get_price();
				$base_product_available = $wc_gun->is_purchasable() && $wc_gun->is_in_stock();

				if ( $pdata ) {
					$pdata['available']   = $base_product_available;
					$pdata['in_stock']    = $wc_gun->is_in_stock();
					$pdata['purchasable'] = $wc_gun->is_purchasable();
					$total_price_raw     += (float) ( isset( $pdata['price']['raw'] ) ? $pdata['price']['raw'] : $gun_price );
					$resolved_base_product = $pdata;
				}
			} else {
				$unavailable_items[] = array(
					'type'       => 'base_gun',
					'product_id' => $base_pid,
					'message'    => __( 'The base weapon is no longer available.', 'part-selector' ),
				);
			}
		}

		// Resolve Rails with live product info.
		$resolved_rails = array();
		foreach ( $raw_rails as $r ) {
			if ( ! is_array( $r ) ) continue;
			$r_pid   = isset( $r['productId'] ) ? absint( $r['productId'] ) : 0;
			$wc_rail = $r_pid > 0 ? wc_get_product( $r_pid ) : null;

			$rail_available = false;
			$rail_info      = null;

			if ( $wc_rail && 'publish' === $wc_rail->get_status() ) {
				$r_price = (float) $wc_rail->get_price();
				$rail_available = $wc_rail->is_purchasable() && $wc_rail->is_in_stock();
				$rpdata = TGB_Product_Data::get_product_data( $r_pid );

				if ( $rpdata ) {
					$rpdata['available']   = $rail_available;
					$rpdata['in_stock']    = $wc_rail->is_in_stock();
					$rpdata['purchasable'] = $wc_rail->is_purchasable();
					$total_price_raw      += (float) ( isset( $rpdata['price']['raw'] ) ? $rpdata['price']['raw'] : $r_price );
					$rail_info             = $rpdata;
				}
			} else {
				$unavailable_items[] = array(
					'type'        => 'rail',
					'instance_id' => isset( $r['instanceId'] ) ? $r['instanceId'] : '',
					'product_id'  => $r_pid,
					'message'     => __( 'An installed rail is no longer available.', 'part-selector' ),
				);
			}

			$resolved_rails[] = array(
				'instanceId' => isset( $r['instanceId'] ) ? sanitize_text_field( $r['instanceId'] ) : '',
				'productId'  => $r_pid,
				'position'   => isset( $r['position'] ) ? sanitize_key( $r['position'] ) : 'bottom',
				'x'          => isset( $r['x'] ) ? (int) $r['x'] : 0,
				'y'          => isset( $r['y'] ) ? (int) $r['y'] : 0,
				'zIndex'     => isset( $r['zIndex'] ) ? (int) $r['zIndex'] : 15,
				'product'    => $rail_info,
				'available'  => $rail_available,
			);
		}

		// Resolve Parts with live product info.
		$resolved_parts = array();
		foreach ( $raw_parts as $p ) {
			if ( ! is_array( $p ) ) continue;
			$p_pid   = isset( $p['productId'] ) ? absint( $p['productId'] ) : 0;
			$wc_part = $p_pid > 0 ? wc_get_product( $p_pid ) : null;

			$part_available = false;
			$part_info      = null;

			if ( $wc_part && 'publish' === $wc_part->get_status() ) {
				$p_price = (float) $wc_part->get_price();
				$part_available = $wc_part->is_purchasable() && $wc_part->is_in_stock();
				$ppdata = TGB_Product_Data::get_product_data( $p_pid );

				if ( $ppdata ) {
					$ppdata['available']   = $part_available;
					$ppdata['in_stock']    = $wc_part->is_in_stock();
					$ppdata['purchasable'] = $wc_part->is_purchasable();
					$total_price_raw      += (float) ( isset( $ppdata['price']['raw'] ) ? $ppdata['price']['raw'] : $p_price );
					$part_info             = $ppdata;
				}
			} else {
				$unavailable_items[] = array(
					'type'        => 'part',
					'instance_id' => isset( $p['instanceId'] ) ? $p['instanceId'] : '',
					'product_id'  => $p_pid,
					'message'     => __( 'An attached component is no longer available.', 'part-selector' ),
				);
			}

			$resolved_parts[] = array(
				'instanceId' => isset( $p['instanceId'] ) ? sanitize_text_field( $p['instanceId'] ) : '',
				'productId'  => $p_pid,
				'x'          => isset( $p['x'] ) ? (int) $p['x'] : 0,
				'y'          => isset( $p['y'] ) ? (int) $p['y'] : 0,
				'zIndex'     => isset( $p['zIndex'] ) ? (int) $p['zIndex'] : 20,
				'product'    => $part_info,
				'available'  => $part_available,
			);
		}

		// 4. Construct sanitized allowlisted public payload.
		$payload = array(
			'success'          => true,
			'name'             => esc_html( $post->post_title ),
			'schemaVersion'    => 2,
			'baseProductId'    => $base_pid ?: null,
			'baseProduct'      => $resolved_base_product,
			'rails'            => $resolved_rails,
			'parts'            => $resolved_parts,
			'sourceType'       => $source_type,
			'createdAt'        => $created_at ? $created_at * 1000 : null,
			'expiresAt'        => $expires_at ? $expires_at * 1000 : null,
			'isExpired'        => false,
			'isRevoked'        => false,
			'unavailableItems' => $unavailable_items,
			'hasUnavailable'   => count( $unavailable_items ) > 0,
			'totalPrice'       => array(
				'raw'       => round( $total_price_raw, 2 ),
				'formatted' => html_entity_decode( wp_strip_all_tags( wc_price( $total_price_raw ) ), ENT_QUOTES, 'UTF-8' ),
			),
		);

		$response = new WP_REST_Response( $payload, 200 );
		$response->header( 'Cache-Control', 'no-cache, no-store, must-revalidate, private' );
		$response->header( 'X-Robots-Tag', 'noindex, nofollow, noarchive' );
		$response->header( 'Referrer-Policy', 'strict-origin-when-cross-origin' );

		return $response;
	}

	/**
	 * REST: List authenticated customer's own active and revoked shares.
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_get_my_shares( $request ) {
		$user_id = get_current_user_id();

		$posts = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'publish',
				'author'         => $user_id,
				'posts_per_page' => 50,
				'orderby'        => 'date',
				'order'          => 'DESC',
			)
		);

		$shares = array();
		foreach ( $posts as $p ) {
			$is_revoked  = ( '1' === get_post_meta( $p->ID, self::META_IS_REVOKED, true ) );
			$source_id   = (int) get_post_meta( $p->ID, self::META_SOURCE_SAVED_BUILD_ID, true );
			$created_at  = (int) get_post_meta( $p->ID, self::META_CREATED_AT, true );
			$expires_at  = (int) get_post_meta( $p->ID, self::META_EXPIRES_AT, true );
			$source_type = get_post_meta( $p->ID, self::META_SOURCE_TYPE, true ) ?: 'account';

			$shares[] = array(
				'id'                 => (int) $p->ID,
				'name'               => esc_html( $p->post_title ),
				'sourceSavedBuildId' => $source_id ?: null,
				'sourceType'         => $source_type,
				'isRevoked'          => $is_revoked,
				'createdAt'          => $created_at ? $created_at * 1000 : null,
				'createdFormatted'   => get_the_date( 'M j, Y', $p ),
				'expiresAt'          => $expires_at ? $expires_at * 1000 : null,
			);
		}

		$response = new WP_REST_Response(
			array(
				'success' => true,
				'shares'  => $shares,
			),
			200
		);
		$response->header( 'Cache-Control', 'no-cache, no-store, must-revalidate, private' );
		return $response;
	}

	/**
	 * Returns an associative array mapping source saved_build_id => active share data.
	 *
	 * @param int $user_id
	 * @return array
	 */
	public static function get_user_shares_map( $user_id ) {
		if ( ! $user_id || $user_id <= 0 ) {
			return array();
		}

		$posts = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'publish',
				'author'         => $user_id,
				'posts_per_page' => 100,
				'orderby'        => 'date',
				'order'          => 'DESC',
			)
		);

		$map = array();
		foreach ( $posts as $p ) {
			$source_id = (int) get_post_meta( $p->ID, self::META_SOURCE_SAVED_BUILD_ID, true );
			if ( ! $source_id ) {
				continue;
			}

			$is_revoked = ( '1' === get_post_meta( $p->ID, self::META_IS_REVOKED, true ) );
			$expires_at = (int) get_post_meta( $p->ID, self::META_EXPIRES_AT, true );
			$created_at = (int) get_post_meta( $p->ID, self::META_CREATED_AT, true );

			// If multiple shares exist for the same build, keep the latest active one
			if ( ! isset( $map[ $source_id ] ) || ( ! $is_revoked && ! empty( $map[ $source_id ]['isRevoked'] ) ) ) {
				$map[ $source_id ] = array(
					'id'               => (int) $p->ID,
					'name'             => $p->post_title,
					'isRevoked'        => $is_revoked,
					'createdAt'        => $created_at,
					'createdFormatted' => get_the_date( 'M j, Y', $p ),
					'expiresAt'        => $expires_at,
				);
			}
		}

		return $map;
	}

	/**
	 * REST: Revoke an active share link (Owner only).
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_revoke_share( $request ) {
		$user_id  = get_current_user_id();
		$share_id = (int) $request->get_param( 'id' );

		$post = get_post( $share_id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return new WP_Error(
				'tgb_share_not_found',
				__( 'Shared build not found.', 'part-selector' ),
				array( 'status' => 404 )
			);
		}

		// Verify owner.
		if ( (int) $post->post_author !== $user_id ) {
			return new WP_Error(
				'tgb_forbidden',
				__( 'You do not have permission to revoke this share link.', 'part-selector' ),
				array( 'status' => 403 )
			);
		}

		update_post_meta( $share_id, self::META_IS_REVOKED, '1' );
		update_post_meta( $share_id, self::META_REVOKED_AT, time() );

		$response = new WP_REST_Response(
			array(
				'success'  => true,
				'share_id' => $share_id,
				'message'  => __( 'Share link revoked immediately. Anyone with the previous link can no longer view this build.', 'part-selector' ),
			),
			200
		);
		$response->header( 'Cache-Control', 'no-cache, no-store, must-revalidate, private' );
		return $response;
	}

	/**
	 * REST: Replace an existing share link with a fresh token (Owner only).
	 *
	 * Revokes the previous token immediately and returns a new share URL.
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_replace_share( $request ) {
		$user_id  = get_current_user_id();
		$share_id = (int) $request->get_param( 'id' );

		$post = get_post( $share_id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return new WP_Error(
				'tgb_share_not_found',
				__( 'Shared build not found.', 'part-selector' ),
				array( 'status' => 404 )
			);
		}

		// Verify owner.
		if ( (int) $post->post_author !== $user_id ) {
			return new WP_Error(
				'tgb_forbidden',
				__( 'You do not have permission to replace this share link.', 'part-selector' ),
				array( 'status' => 403 )
			);
		}

		// 1. Revoke the previous share immediately.
		update_post_meta( $share_id, self::META_IS_REVOKED, '1' );
		update_post_meta( $share_id, self::META_REVOKED_AT, time() );

		// 2. Load existing snapshot configuration.
		$base_pid  = (int) get_post_meta( $share_id, self::META_BASE_PRODUCT_ID, true );
		$raw_rails = get_post_meta( $share_id, self::META_RAILS, true );
		$raw_parts = get_post_meta( $share_id, self::META_PARTS, true );
		$source_id = (int) get_post_meta( $share_id, self::META_SOURCE_SAVED_BUILD_ID, true );

		// If a source saved build exists, re-snapshot from the live saved build.
		if ( $source_id > 0 ) {
			$saved_detail = TGB_Saved_Builds::get_build_detail( $source_id, $user_id );
			if ( $saved_detail ) {
				$base_pid  = $saved_detail['baseProductId'];
				$raw_rails = $saved_detail['rails'];
				$raw_parts = $saved_detail['parts'];
			}
		}

		// 3. Generate fresh token and create new snapshot.
		$raw_token  = self::generate_token();
		$token_hash = self::hash_token( $raw_token );
		$created_at = time();

		$new_share_id = wp_insert_post(
			array(
				'post_type'    => self::POST_TYPE,
				'post_status'  => 'publish',
				'post_author'  => $user_id,
				'post_title'   => sanitize_text_field( $post->post_title ),
				'post_content' => '',
			),
			true
		);

		if ( is_wp_error( $new_share_id ) ) {
			return $new_share_id;
		}

		update_post_meta( $new_share_id, self::META_TOKEN_HASH, $token_hash );
		update_post_meta( $new_share_id, self::META_SCHEMA_VERSION, 2 );
		update_post_meta( $new_share_id, self::META_BASE_PRODUCT_ID, $base_pid );
		update_post_meta( $new_share_id, self::META_RAILS, $raw_rails );
		update_post_meta( $new_share_id, self::META_PARTS, $raw_parts );
		update_post_meta( $new_share_id, self::META_SOURCE_TYPE, 'account' );
		update_post_meta( $new_share_id, self::META_SOURCE_SAVED_BUILD_ID, $source_id );
		update_post_meta( $new_share_id, self::META_CREATED_AT, $created_at );
		update_post_meta( $new_share_id, self::META_EXPIRES_AT, 0 );
		update_post_meta( $new_share_id, self::META_IS_REVOKED, '0' );

		$share_url = self::get_share_url( $raw_token );

		$response_data = array(
			'success'          => true,
			'new_share_id'     => $new_share_id,
			'replaced_share_id'=> $share_id,
			'share_token'      => $raw_token,
			'share_url'        => $share_url,
			'name'             => $post->post_title,
			'message'          => __( 'Previous share link was revoked and replaced with a fresh link.', 'part-selector' ),
		);

		$response = new WP_REST_Response( $response_data, 201 );
		$response->header( 'Cache-Control', 'no-cache, no-store, must-revalidate, private' );
		return $response;
	}

	// =========================================================================
	// Cleanup and Deletion Safeguards
	// =========================================================================

	/**
	 * Automatically revokes all shares associated with a deleted source saved build.
	 *
	 * Hooked into 'deleted_post'.
	 *
	 * @param int     $post_id Deleted post ID.
	 * @param WP_Post $post    Post object.
	 */
	public static function on_source_build_deleted( $post_id, $post ) {
		if ( ! $post || TGB_Saved_Builds::POST_TYPE !== $post->post_type ) {
			return;
		}

		global $wpdb;
		$shares = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT post_id FROM {$wpdb->postmeta}
				 WHERE meta_key = %s AND meta_value = %d",
				self::META_SOURCE_SAVED_BUILD_ID,
				$post_id
			)
		);

		if ( ! empty( $shares ) && is_array( $shares ) ) {
			foreach ( $shares as $sid ) {
				update_post_meta( (int) $sid, self::META_IS_REVOKED, '1' );
				update_post_meta( (int) $sid, self::META_REVOKED_AT, time() );
			}
		}
	}

	/**
	 * Scheduled WP-Cron task to cleanly purge expired anonymous guest shares.
	 *
	 * Bounded to 50 records per run to prevent timeout or resource exhaustion.
	 * Strictly ignores account-owned shares and private account saved builds.
	 */
	public static function cleanup_expired_shares() {
		global $wpdb;

		$now = time();
		$expired_ids = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT p.ID FROM {$wpdb->posts} p
				 INNER JOIN {$wpdb->postmeta} pm_exp ON p.ID = pm_exp.post_id AND pm_exp.meta_key = %s
				 INNER JOIN {$wpdb->postmeta} pm_src ON p.ID = pm_src.post_id AND pm_src.meta_key = %s
				 WHERE p.post_type = %s
				   AND pm_src.meta_value = 'guest'
				   AND CAST(pm_exp.meta_value AS UNSIGNED) > 0
				   AND CAST(pm_exp.meta_value AS UNSIGNED) <= %d
				 LIMIT 50",
				self::META_EXPIRES_AT,
				self::META_SOURCE_TYPE,
				self::POST_TYPE,
				$now
			)
		);

		if ( ! empty( $expired_ids ) && is_array( $expired_ids ) ) {
			foreach ( $expired_ids as $id ) {
				wp_delete_post( (int) $id, true );
			}
		}
	}
}
