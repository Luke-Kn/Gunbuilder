<?php
/**
 * Saved Builds management and WooCommerce My Account integration.
 *
 * Implements Part 5: Registered Customer Saved Builds, Account CRUD,
 * Private CPT Storage, and Automatic Guest-to-Account Transfer.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Saved_Builds
 */
class TGB_Saved_Builds {

	/**
	 * Post type identifier for customer saved builds.
	 */
	const POST_TYPE = 'tgb_saved_build';

	/**
	 * Meta key constants.
	 */
	const META_SCHEMA_VERSION = '_tgb_build_schema_version';
	const META_BASE_PRODUCT_ID = '_tgb_base_product_id';
	const META_RAILS           = '_tgb_rails';
	const META_PARTS           = '_tgb_parts';
	const META_SOURCE_GUEST_ID = '_tgb_source_guest_id';
	const META_REVISION        = '_tgb_build_revision';

	/**
	 * Maximum permanently saved builds allowed per registered customer.
	 */
	const MAX_ACCOUNT_BUILDS = 10;

	/**
	 * WooCommerce My Account endpoint slug.
	 */
	const ACCOUNT_ENDPOINT = 'gun-builder-builds';

	/**
	 * Initialize hooks and subsystems.
	 */
	public static function init() {
		// 1. Post type registration.
		add_action( 'init', array( __CLASS__, 'register_post_type' ), 5 );

		// 2. REST API endpoints.
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest_routes' ) );

		// 3. WooCommerce My Account integration.
		add_action( 'init', array( __CLASS__, 'add_account_endpoint' ), 10 );
		add_filter( 'woocommerce_account_menu_items', array( __CLASS__, 'add_account_menu_item' ), 20 );
		add_action( 'woocommerce_account_' . self::ACCOUNT_ENDPOINT . '_endpoint', array( __CLASS__, 'render_account_endpoint' ) );

		// 4. Scoped query var for rewrite rule.
		add_filter( 'query_vars', array( __CLASS__, 'add_query_vars' ), 10 );
	}

	/**
	 * Registers the private custom post type for saved builds.
	 *
	 * Strictly non-public: no public single URL, no search, no archive,
	 * no UI, and no generic REST exposure.
	 */
	public static function register_post_type() {
		register_post_type(
			self::POST_TYPE,
			array(
				'labels'              => array(
					'name'          => __( 'Saved Gun Builds', 'part-selector' ),
					'singular_name' => __( 'Saved Gun Build', 'part-selector' ),
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
	 * Registers WooCommerce My Account rewrite endpoint.
	 */
	public static function add_account_endpoint() {
		add_rewrite_endpoint( self::ACCOUNT_ENDPOINT, EP_ROOT | EP_PAGES );

		// Flush rules once if endpoint not yet recognized.
		if ( 'yes' !== get_option( 'tgb_saved_builds_endpoint_flushed', 'no' ) ) {
			flush_rewrite_rules( false );
			update_option( 'tgb_saved_builds_endpoint_flushed', 'yes' );
		}
	}

	/**
	 * Registers endpoint query variable.
	 *
	 * @param array $vars Query vars.
	 * @return array
	 */
	public static function add_query_vars( $vars ) {
		$vars[] = self::ACCOUNT_ENDPOINT;
		return $vars;
	}

	/**
	 * Adds "My Gun Builds" to WooCommerce My Account menu.
	 *
	 * @param array $items Existing account menu items.
	 * @return array Modified menu items.
	 */
	public static function add_menu_item( $items ) {
		return self::add_account_menu_item( $items );
	}

	/**
	 * Adds "My Gun Builds" to WooCommerce My Account menu.
	 *
	 * @param array $items Existing account menu items.
	 * @return array Modified menu items.
	 */
	public static function add_account_menu_item( $items ) {
		$new_items = array();

		foreach ( $items as $key => $label ) {
			// Insert right before customer logout, or after orders.
			if ( 'customer-logout' === $key ) {
				$new_items[ self::ACCOUNT_ENDPOINT ] = __( 'My Gun Builds', 'part-selector' );
			}
			$new_items[ $key ] = $label;
		}

		if ( ! isset( $new_items[ self::ACCOUNT_ENDPOINT ] ) ) {
			$new_items[ self::ACCOUNT_ENDPOINT ] = __( 'My Gun Builds', 'part-selector' );
		}

		return $new_items;
	}

	/**
	 * Renders the WooCommerce My Account "My Gun Builds" tab.
	 */
	public static function render_account_endpoint() {
		if ( ! is_user_logged_in() ) {
			echo '<div class="woocommerce-error" role="alert">' . esc_html__( 'Please sign in to view your saved gun builds.', 'part-selector' ) . '</div>';
			return;
		}

		TGB_Assets::enqueue();

		$user_id      = get_current_user_id();
		$builds       = self::get_user_builds( $user_id );
		$builder_url  = TGB_Shortcode::get_builder_page_url();
		$total_count  = count( $builds );
		$max_builds   = self::MAX_ACCOUNT_BUILDS;

		$template_path = TGB_PLUGIN_DIR . 'templates/myaccount/saved-builds.php';
		if ( file_exists( $template_path ) ) {
			include $template_path;
		} else {
			self::render_fallback_account_ui( $builds, $builder_url, $total_count, $max_builds );
		}
	}

	/**
	 * Fallback renderer if template file is missing.
	 *
	 * @param array  $builds Array of build summaries.
	 * @param string $builder_url URL to builder page.
	 * @param int    $total_count Total builds.
	 * @param int    $max_builds Maximum builds.
	 */
	private static function render_fallback_account_ui( $builds, $builder_url, $total_count, $max_builds ) {
		?>
		<div class="tgb-my-account-builds">
			<h2><?php esc_html_e( 'My Saved Gun Builds', 'part-selector' ); ?></h2>
			<p><?php printf( esc_html__( 'You have %1$d of %2$d saved builds.', 'part-selector' ), $total_count, $max_builds ); ?></p>
			<?php if ( empty( $builds ) ) : ?>
				<p><?php esc_html_e( "You don't have any saved gun builds yet.", 'part-selector' ); ?></p>
				<p><a href="<?php echo esc_url( $builder_url ); ?>" class="button"><?php esc_html_e( 'Launch Gun Builder', 'part-selector' ); ?></a></p>
			<?php endif; ?>
		</div>
		<?php
	}

	// =========================================================================
	// REST API ROUTE REGISTRATION & HANDLERS
	// =========================================================================

	/**
	 * Registers REST API endpoints under namespace 'tgb/v1'.
	 */
	public static function register_rest_routes() {
		// 1. List current customer's saved builds.
		register_rest_route(
			'tgb/v1',
			'/saved-builds',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'rest_get_builds' ),
					'permission_callback' => array( __CLASS__, 'rest_auth_check' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'rest_create_build' ),
					'permission_callback' => array( __CLASS__, 'rest_auth_check' ),
				),
			)
		);

		// 2. Import temporary guest drafts into authenticated account.
		register_rest_route(
			'tgb/v1',
			'/saved-builds/import-guest',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'rest_import_guest_builds' ),
				'permission_callback' => array( __CLASS__, 'rest_auth_check' ),
			)
		);

		// 3. Single build CRUD operations.
		register_rest_route(
			'tgb/v1',
			'/saved-builds/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'rest_get_single_build' ),
					'permission_callback' => array( __CLASS__, 'rest_auth_check' ),
					'args'                => array(
						'id' => array(
							'validate_callback' => function( $param ) {
								return is_numeric( $param ) && $param > 0;
							},
						),
					),
				),
				array(
					'methods'             => WP_REST_Server::EDITABLE, // PUT and PATCH
					'callback'            => array( __CLASS__, 'rest_update_build' ),
					'permission_callback' => array( __CLASS__, 'rest_auth_check' ),
					'args'                => array(
						'id' => array(
							'validate_callback' => function( $param ) {
								return is_numeric( $param ) && $param > 0;
							},
						),
					),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( __CLASS__, 'rest_delete_build' ),
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

		// 4. Duplicate single saved build.
		register_rest_route(
			'tgb/v1',
			'/saved-builds/(?P<id>\d+)/duplicate',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'rest_duplicate_build' ),
				'permission_callback' => array( __CLASS__, 'rest_auth_check' ),
				'args'                => array(
					'id' => array(
						'validate_callback' => function( $param ) {
							return is_numeric( $param ) && $param > 0;
						},
					),
				),
			)
		);
	}

	/**
	 * Universal permission check: customer must be authenticated.
	 *
	 * @param WP_REST_Request $request
	 * @return bool|WP_Error
	 */
	public static function rest_auth_check( $request ) {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'tgb_rest_authentication_required',
				__( 'You must be logged in to manage saved builds.', 'part-selector' ),
				array( 'status' => 401 )
			);
		}
		return true;
	}

	/**
	 * REST: List all saved builds belonging to the authenticated customer.
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function rest_get_builds( $request ) {
		$user_id = get_current_user_id();
		$builds  = self::get_user_builds( $user_id );

		$response = new WP_REST_Response(
			array(
				'total'      => count( $builds ),
				'max_builds' => self::MAX_ACCOUNT_BUILDS,
				'items'      => $builds,
				'builds'     => $builds,
			),
			200
		);

		// Strictly prevent caching of private customer configurations.
		$response->header( 'Cache-Control', 'no-cache, no-store, must-revalidate, private' );
		$response->header( 'Pragma', 'no-cache' );
		$response->header( 'Expires', '0' );

		return $response;
	}

	/**
	 * Programmatically creates a saved build for a user.
	 *
	 * Enforces validation, customer mutex locking, and 10-build limit atomically.
	 *
	 * @param int   $user_id User ID.
	 * @param array $data Raw build configuration payload.
	 * @return int|WP_Error Created post ID on success, WP_Error on failure.
	 */
	public static function create_build( $user_id, $data ) {
		$user_id = absint( $user_id );
		if ( $user_id <= 0 ) {
			return new WP_Error(
				'tgb_invalid_user',
				__( 'Invalid user ID.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		if ( empty( $data ) || ! is_array( $data ) ) {
			return new WP_Error(
				'tgb_invalid_payload',
				__( 'Invalid or empty build configuration payload.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		$validated = self::validate_build_data( $data );
		if ( is_wp_error( $validated ) ) {
			return $validated;
		}

		return self::persist_build_record( $user_id, $validated );
	}

	/**
	 * REST: Create a new permanently saved build.
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_create_build( $request ) {
		$user_id = get_current_user_id();
		$body    = $request->get_json_params();

		$created_id = self::create_build( $user_id, $body );
		if ( is_wp_error( $created_id ) ) {
			return $created_id;
		}

		$detail  = self::get_build_detail( $created_id, $user_id );
		$payload = $detail;
		$payload['message'] = __( 'Build saved successfully to your account.', 'part-selector' );
		$payload['build']   = $detail;

		$response = new WP_REST_Response( $payload, 201 );
		$response->header( 'Cache-Control', 'no-cache, no-store, must-revalidate, private' );
		return $response;
	}

	/**
	 * REST: Load a single saved build.
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_get_single_build( $request ) {
		$user_id  = get_current_user_id();
		$build_id = (int) $request->get_param( 'id' );

		$detail = self::get_build_detail( $build_id, $user_id );
		if ( ! $detail ) {
			return new WP_Error(
				'tgb_build_not_found',
				__( 'Saved build not found or you do not have permission to view it.', 'part-selector' ),
				array( 'status' => 404 )
			);
		}

		$response = new WP_REST_Response( $detail, 200 );
		$response->header( 'Cache-Control', 'no-cache, no-store, must-revalidate, private' );
		return $response;
	}

	/**
	 * REST: Update an existing saved build.
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_update_build( $request ) {
		$user_id  = get_current_user_id();
		$build_id = (int) $request->get_param( 'id' );

		$post = self::get_user_build_post( $build_id, $user_id );
		if ( ! $post ) {
			return new WP_Error(
				'tgb_build_not_found',
				__( 'Saved build not found or you do not have permission to modify it.', 'part-selector' ),
				array( 'status' => 404 )
			);
		}

		$body = $request->get_json_params();
		if ( empty( $body ) || ! is_array( $body ) ) {
			return new WP_Error(
				'tgb_invalid_payload',
				__( 'Invalid or empty build configuration payload.', 'part-selector' ),
				array( 'status' => 400 )
			);
		}

		// Optional concurrency conflict check.
		$current_rev = (int) get_post_meta( $build_id, self::META_REVISION, true );
		if ( isset( $body['expected_revision'] ) && (int) $body['expected_revision'] > 0 ) {
			$expected_rev = (int) $body['expected_revision'];
			if ( $current_rev > $expected_rev ) {
				return new WP_Error(
					'tgb_concurrency_conflict',
					__( 'This build has been modified elsewhere. Please reload the latest version or save as a new build.', 'part-selector' ),
					array(
						'status'           => 409,
						'current_revision' => $current_rev,
					)
				);
			}
		} elseif ( isset( $body['lastModified'] ) ) {
			$post_modified_ts = get_post_modified_time( 'U', false, $post );
			$client_ts = is_numeric( $body['lastModified'] ) ? (int) $body['lastModified'] : strtotime( $body['lastModified'] );
			if ( $client_ts > 2000000000 ) {
				$client_ts = (int) round( $client_ts / 1000 );
			}
			if ( $client_ts > 0 && $post_modified_ts > ( $client_ts + 2 ) ) {
				return new WP_Error(
					'tgb_concurrency_conflict',
					__( 'This build has been modified elsewhere. Please reload the latest version or save as a new build.', 'part-selector' ),
					array( 'status' => 409 )
				);
			}
		}

		// If only renaming:
		if ( isset( $body['name'] ) && ! isset( $body['baseProductId'] ) && ! isset( $body['rails'] ) && ! isset( $body['parts'] ) ) {
			$name = sanitize_text_field( trim( $body['name'] ) );
			if ( empty( $name ) ) {
				return new WP_Error( 'tgb_empty_name', __( 'Build name cannot be empty.', 'part-selector' ), array( 'status' => 400 ) );
			}
			wp_update_post(
				array(
					'ID'         => $build_id,
					'post_title' => $name,
				)
			);
			update_post_meta( $build_id, self::META_REVISION, $current_rev + 1 );
			$detail = self::get_build_detail( $build_id, $user_id );
			$payload = $detail;
			$payload['message'] = __( 'Build renamed successfully.', 'part-selector' );
			$payload['build']   = $detail;
			return new WP_REST_Response( $payload, 200 );
		}

		// Full build update:
		$validated = self::validate_build_data( $body );
		if ( is_wp_error( $validated ) ) {
			return $validated;
		}

		$updated = self::update_build_record( $build_id, $validated, $current_rev + 1 );
		if ( is_wp_error( $updated ) ) {
			return $updated;
		}

		$detail = self::get_build_detail( $build_id, $user_id );
		$payload = $detail;
		$payload['message'] = __( 'Build updated successfully.', 'part-selector' );
		$payload['build']   = $detail;

		$response = new WP_REST_Response( $payload, 200 );
		$response->header( 'Cache-Control', 'no-cache, no-store, must-revalidate, private' );
		return $response;
	}

	/**
	 * REST: Delete a saved build.
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_delete_build( $request ) {
		$user_id  = get_current_user_id();
		$build_id = (int) $request->get_param( 'id' );

		$post = self::get_user_build_post( $build_id, $user_id );
		if ( ! $post ) {
			return new WP_Error(
				'tgb_build_not_found',
				__( 'Saved build not found or you do not have permission to delete it.', 'part-selector' ),
				array( 'status' => 404 )
			);
		}

		// Force permanent deletion without moving to trash.
		$result = wp_delete_post( $build_id, true );
		if ( ! $result ) {
			return new WP_Error(
				'tgb_delete_failed',
				__( 'Unable to delete the saved build.', 'part-selector' ),
				array( 'status' => 500 )
			);
		}

		return new WP_REST_Response(
			array(
				'message'     => __( 'Build deleted successfully.', 'part-selector' ),
				'deleted_id'  => $build_id,
				'total_count' => self::count_user_builds( $user_id ),
			),
			200
		);
	}

	/**
	 * REST: Duplicate an existing saved build.
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_duplicate_build( $request ) {
		$user_id  = get_current_user_id();
		$build_id = (int) $request->get_param( 'id' );

		$post = self::get_user_build_post( $build_id, $user_id );
		if ( ! $post ) {
			return new WP_Error(
				'tgb_build_not_found',
				__( 'Saved build not found or you do not have permission to duplicate it.', 'part-selector' ),
				array( 'status' => 404 )
			);
		}

		$current_count = self::count_user_builds( $user_id );
		if ( $current_count >= self::MAX_ACCOUNT_BUILDS ) {
			return new WP_Error(
				'tgb_build_limit_reached',
				__( 'You have reached the maximum of 10 saved builds. Delete an existing build to duplicate.', 'part-selector' ),
				array( 'status' => 403 )
			);
		}

		$source_detail = self::get_build_detail( $build_id, $user_id );
		if ( ! $source_detail ) {
			return new WP_Error( 'tgb_build_not_found', __( 'Unable to load build for duplication.', 'part-selector' ), array( 'status' => 404 ) );
		}

		$duplicate_data = array(
			'schemaVersion' => 2,
			'name'          => sprintf( __( '%s (Copy)', 'part-selector' ), $source_detail['name'] ),
			'baseProductId' => $source_detail['baseProductId'],
			'rails'         => $source_detail['rails'],
			'parts'         => $source_detail['parts'],
		);

		$new_id = self::persist_build_record( $user_id, $duplicate_data );
		if ( is_wp_error( $new_id ) ) {
			return $new_id;
		}

		$new_detail = self::get_build_detail( $new_id, $user_id );
		$payload = $new_detail;
		$payload['message'] = __( 'Build duplicated successfully.', 'part-selector' );
		$payload['build']   = $new_detail;

		return new WP_REST_Response( $payload, 201 );
	}

	/**
	 * REST: Imports guest drafts into the authenticated customer's account.
	 *
	 * Enforces the 10-build limit, supports partial capacity, deduplicates by guest ID,
	 * and returns explicit per-build status.
	 *
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_import_guest_builds( $request ) {
		$user_id = get_current_user_id();
		$body    = $request->get_json_params();

		$guest_builds = isset( $body['builds'] ) && is_array( $body['builds'] )
			? $body['builds']
			: ( is_array( $body ) ? $body : array() );

		if ( empty( $guest_builds ) ) {
			return new WP_REST_Response(
				array(
					'imported'         => array(),
					'skipped_limit'    => array(),
					'already_imported' => array(),
					'message'          => __( 'No guest builds were provided for import.', 'part-selector' ),
					'total_count'      => self::count_user_builds( $user_id ),
				),
				200
			);
		}

		$locked = self::acquire_customer_lock( $user_id, 10 );
		if ( ! $locked ) {
			return new WP_Error(
				'tgb_lock_timeout',
				__( 'Could not acquire lock to process guest import. Please try again.', 'part-selector' ),
				array( 'status' => 409 )
			);
		}

		try {
			// Retrieve all existing guest source IDs already imported by this user (under customer lock)
			$existing_imported_guest_ids = self::get_user_imported_guest_ids( $user_id );

			$current_count   = self::count_user_builds( $user_id );
			$available_slots = max( 0, self::MAX_ACCOUNT_BUILDS - $current_count );

			$imported         = array();
			$skipped_limit    = array();
			$already_imported = array();
			$results          = array();

			foreach ( $guest_builds as $draft ) {
				if ( ! is_array( $draft ) ) {
					continue;
				}

				$guest_id = isset( $draft['id'] ) ? sanitize_text_field( $draft['id'] ) : '';
				if ( empty( $guest_id ) ) {
					continue;
				}

				// 1. Idempotency check: already imported by this customer?
				if ( in_array( $guest_id, $existing_imported_guest_ids, true ) ) {
					$already_imported[] = $guest_id;
					$results[]          = array(
						'guest_id' => $guest_id,
						'status'   => 'already_imported',
						'message'  => __( 'Draft already imported to this account.', 'part-selector' ),
					);
					continue;
				}

				// 2. Account limit check.
				if ( count( $imported ) >= $available_slots ) {
					$skipped_limit[] = $guest_id;
					$results[]       = array(
						'guest_id' => $guest_id,
						'status'   => 'skipped_limit',
						'message'  => __( 'Account 10-build limit reached.', 'part-selector' ),
					);
					continue;
				}

				// 3. Must have a valid base product ID to be worth saving.
				$base_pid = isset( $draft['baseProductId'] ) ? absint( $draft['baseProductId'] ) : 0;
				if ( $base_pid <= 0 ) {
					// Empty draft: skip or treat as already handled.
					$already_imported[] = $guest_id;
					$results[]          = array(
						'guest_id' => $guest_id,
						'status'   => 'already_imported',
						'message'  => __( 'Empty draft ignored.', 'part-selector' ),
					);
					continue;
				}

				$validated = self::validate_build_data( $draft );
				if ( is_wp_error( $validated ) ) {
					$results[] = array(
						'guest_id' => $guest_id,
						'status'   => 'invalid',
						'message'  => $validated->get_error_message(),
					);
					continue;
				}

				// Attach source guest ID for future idempotency.
				$validated['sourceGuestId'] = $guest_id;

				$new_id = self::persist_build_record( $user_id, $validated );
				if ( ! is_wp_error( $new_id ) ) {
					$imported[]                    = $guest_id;
					$existing_imported_guest_ids[] = $guest_id;
					$results[]                     = array(
						'guest_id' => $guest_id,
						'status'   => 'imported',
						'build_id' => $new_id,
						'name'     => $validated['name'],
					);
				} elseif ( 'tgb_already_imported' === $new_id->get_error_code() ) {
					$already_imported[]            = $guest_id;
					$existing_imported_guest_ids[] = $guest_id;
					$results[]                     = array(
						'guest_id' => $guest_id,
						'status'   => 'already_imported',
						'message'  => __( 'Draft already imported to this account.', 'part-selector' ),
					);
				} elseif ( 'tgb_build_limit_reached' === $new_id->get_error_code() ) {
					$skipped_limit[] = $guest_id;
					$results[]       = array(
						'guest_id' => $guest_id,
						'status'   => 'skipped_limit',
						'message'  => __( 'Account 10-build limit reached.', 'part-selector' ),
					);
				} else {
					$results[] = array(
						'guest_id' => $guest_id,
						'status'   => 'error',
						'message'  => $new_id->get_error_message(),
					);
				}
			}
		} catch ( Throwable $t ) {
			return new WP_Error( 'tgb_import_error', $t->getMessage(), array( 'status' => 500 ) );
		} finally {
			self::release_customer_lock( $user_id );
		}

		$imported_count = count( $imported );
		$skipped_count  = count( $skipped_limit );

		if ( $imported_count > 0 && $skipped_count > 0 ) {
			$msg = sprintf(
				__( '%1$d build(s) saved to your account. %2$d build(s) could not be imported because your account reached the 10-build limit.', 'part-selector' ),
				$imported_count,
				$skipped_count
			);
		} elseif ( $imported_count > 0 ) {
			$msg = sprintf(
				_n(
					'%d guest build was saved to your account.',
					'%d guest builds were saved to your account.',
					$imported_count,
					'part-selector'
				),
				$imported_count
			);
		} elseif ( $skipped_count > 0 ) {
			$msg = __( 'Your guest builds could not be imported because your account has already reached the maximum of 10 saved builds.', 'part-selector' );
		} else {
			$msg = __( 'All guest builds have already been imported.', 'part-selector' );
		}

		return new WP_REST_Response(
			array(
				'imported_count'   => $imported_count,
				'skipped_count'    => $skipped_count,
				'results'          => $results,
				'imported'         => $imported,
				'skipped_limit'    => $skipped_limit,
				'already_imported' => $already_imported,
				'message'          => $msg,
				'total_count'      => self::count_user_builds( $user_id ),
			),
			200
		);
	}

	// =========================================================================
	// DATABASE & CRUD OPERATIONS
	// =========================================================================

	/**
	 * Counts active saved builds for a customer.
	 *
	 * @param int $user_id
	 * @return int
	 */
	public static function count_user_builds( $user_id ) {
		global $wpdb;
		$user_id = absint( $user_id );
		if ( $user_id <= 0 ) {
			return 0;
		}

		return (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = %s AND post_author = %d AND post_status = 'publish'",
				self::POST_TYPE,
				$user_id
			)
		);
	}

	/**
	 * Retrieves list of saved builds for a customer.
	 *
	 * @param int $user_id
	 * @return array Array of formatted summary items.
	 */
	public static function get_user_builds( $user_id ) {
		$user_id = absint( $user_id );
		if ( $user_id <= 0 ) {
			return array();
		}

		$posts = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'publish',
				'author'         => $user_id,
				'posts_per_page' => self::MAX_ACCOUNT_BUILDS,
				'orderby'        => 'modified',
				'order'          => 'DESC',
			)
		);

		$items = array();
		foreach ( $posts as $p ) {
			$items[] = self::format_build_summary( $p );
		}

		return $items;
	}

	/**
	 * Retrieves single saved build post ensuring ownership.
	 *
	 * @param int $build_id
	 * @param int $user_id
	 * @return WP_Post|null
	 */
	public static function get_user_build_post( $build_id, $user_id ) {
		$build_id = absint( $build_id );
		$user_id  = absint( $user_id );

		if ( $build_id <= 0 || $user_id <= 0 ) {
			return null;
		}

		$post = get_post( $build_id );
		if ( ! $post || self::POST_TYPE !== $post->post_type || 'publish' !== $post->post_status ) {
			return null;
		}

		if ( (int) $post->post_author !== $user_id ) {
			return null;
		}

		return $post;
	}

	/**
	 * Retrieves full build details for editing and restoration.
	 *
	 * @param int $build_id
	 * @param int $user_id
	 * @return array|null
	 */
	public static function get_build_detail( $build_id, $user_id ) {
		$post = self::get_user_build_post( $build_id, $user_id );
		if ( ! $post ) {
			return null;
		}

		$base_pid = (int) get_post_meta( $post->ID, self::META_BASE_PRODUCT_ID, true );
		$rails    = get_post_meta( $post->ID, self::META_RAILS, true );
		$parts    = get_post_meta( $post->ID, self::META_PARTS, true );
		$revision = (int) get_post_meta( $post->ID, self::META_REVISION, true );

		if ( ! is_array( $rails ) ) {
			$rails = array();
		}
		if ( ! is_array( $parts ) ) {
			$parts = array();
		}

		$base_product = null;
		if ( $base_pid > 0 ) {
			$p = wc_get_product( $base_pid );
			if ( $p ) {
				$base_product = array(
					'id'        => $base_pid,
					'name'      => $p->get_name(),
					'available' => $p->is_purchasable() && $p->is_in_stock(),
				);
			}
		}

		return array(
			'id'            => (int) $post->ID,
			'name'          => $post->post_title,
			'schemaVersion' => (int) get_post_meta( $post->ID, self::META_SCHEMA_VERSION, true ) ?: 2,
			'baseProductId' => $base_pid ?: null,
			'baseProduct'   => $base_product,
			'rails'         => $rails,
			'parts'         => $parts,
			'revision'      => $revision ?: 1,
			'createdAt'     => get_post_time( 'U', true, $post ) * 1000,
			'updatedAt'     => get_post_modified_time( 'U', true, $post ) * 1000,
		);
	}

	/**
	 * Retrieves array of guest source IDs already imported by a user.
	 *
	 * @param int $user_id
	 * @return array
	 */
	public static function get_user_imported_guest_ids( $user_id ) {
		global $wpdb;
		$user_id = absint( $user_id );
		if ( $user_id <= 0 ) {
			return array();
		}

		$results = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT pm.meta_value FROM {$wpdb->postmeta} pm
				 INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id
				 WHERE p.post_type = %s AND p.post_author = %d AND p.post_status = 'publish' AND pm.meta_key = %s AND pm.meta_value != ''",
				self::POST_TYPE,
				$user_id,
				self::META_SOURCE_GUEST_ID
			)
		);

		return is_array( $results ) ? array_unique( $results ) : array();
	}

	/**
	 * Formats a WP_Post object into an account summary array.
	 *
	 * @param WP_Post $post
	 * @return array
	 */
	private static function format_build_summary( $post ) {
		$base_pid = (int) get_post_meta( $post->ID, self::META_BASE_PRODUCT_ID, true );
		$rails    = get_post_meta( $post->ID, self::META_RAILS, true );
		$parts    = get_post_meta( $post->ID, self::META_PARTS, true );

		$base_gun_name  = __( 'None selected', 'part-selector' );
		$base_gun_image = '';

		if ( $base_pid > 0 ) {
			$p = wc_get_product( $base_pid );
			if ( $p ) {
				$base_gun_name = $p->get_name();
				// Use the builder first gallery image if available, else thumbnail.
				$pdata = TGB_Product_Data::get_product_data( $base_pid );
				if ( ! empty( $pdata['builder_image']['url'] ) ) {
					$base_gun_image = $pdata['builder_image']['url'];
				} else {
					$img_id = $p->get_image_id();
					if ( $img_id ) {
						$base_gun_image = wp_get_attachment_image_url( $img_id, 'thumbnail' ) ?: '';
					}
				}
			}
		}

		return array(
			'id'             => (int) $post->ID,
			'name'           => $post->post_title,
			'baseProductId'  => $base_pid ?: null,
			'baseGunName'    => $base_gun_name,
			'baseGunImage'   => $base_gun_image,
			'railsCount'     => is_array( $rails ) ? count( $rails ) : 0,
			'partsCount'     => is_array( $parts ) ? count( $parts ) : 0,
			'createdAt'      => get_post_time( 'U', true, $post ) * 1000,
			'updatedAt'      => get_post_modified_time( 'U', true, $post ) * 1000,
			'dateFormatted'  => get_the_modified_date( 'M j, Y', $post ),
		);
	}

	/**
	 * Validates raw submitted build JSON against schema limits.
	 *
	 * @param array $data
	 * @return array|WP_Error Sanitized data structure.
	 */
	public static function validate_build_data( $data ) {
		if ( ! is_array( $data ) ) {
			return new WP_Error( 'tgb_invalid_payload', __( 'Payload must be an object.', 'part-selector' ), array( 'status' => 400 ) );
		}

		$name = isset( $data['name'] ) ? sanitize_text_field( trim( $data['name'] ) ) : '';
		if ( empty( $name ) ) {
			$name = __( 'My Custom Build', 'part-selector' );
		}
		if ( mb_strlen( $name ) > 100 ) {
			$name = mb_substr( $name, 0, 100 );
		}

		if ( ! isset( $data['baseProductId'] ) || ! is_numeric( $data['baseProductId'] ) || absint( $data['baseProductId'] ) <= 0 ) {
			return new WP_Error( 'tgb_invalid_payload', __( 'A valid base weapon product ID is required.', 'part-selector' ), array( 'status' => 400 ) );
		}
		$base_product_id = absint( $data['baseProductId'] );

		if ( isset( $data['rails'] ) && ! is_array( $data['rails'] ) ) {
			return new WP_Error( 'tgb_invalid_payload', __( 'Rails must be an array.', 'part-selector' ), array( 'status' => 400 ) );
		}

		// Validate Rails array (max 10).
		$clean_rails = array();
		if ( isset( $data['rails'] ) && is_array( $data['rails'] ) ) {
			if ( count( $data['rails'] ) > 10 ) {
				return new WP_Error( 'tgb_too_many_rails', __( 'Build exceeds the maximum allowable rails limit (10).', 'part-selector' ), array( 'status' => 400 ) );
			}

			foreach ( $data['rails'] as $r ) {
				if ( ! is_array( $r ) ) continue;
				$pid = isset( $r['productId'] ) ? absint( $r['productId'] ) : 0;
				$pos = isset( $r['position'] ) ? sanitize_key( $r['position'] ) : 'bottom';
				if ( ! in_array( $pos, array( 'top', 'bottom' ), true ) ) {
					$pos = 'bottom';
				}
				$inst_id = isset( $r['instanceId'] ) ? sanitize_text_field( $r['instanceId'] ) : 'rail-' . wp_generate_password( 6, false );

				$clean_rails[] = array(
					'instanceId' => $inst_id,
					'productId'  => $pid,
					'position'   => $pos,
					'x'          => isset( $r['x'] ) ? (int) round( (float) $r['x'] ) : 0,
					'y'          => isset( $r['y'] ) ? (int) round( (float) $r['y'] ) : 0,
					'zIndex'     => isset( $r['zIndex'] ) ? (int) $r['zIndex'] : 15,
				);
			}
		}

		if ( isset( $data['parts'] ) && ! is_array( $data['parts'] ) ) {
			return new WP_Error( 'tgb_invalid_payload', __( 'Parts must be an array.', 'part-selector' ), array( 'status' => 400 ) );
		}

		// Validate Parts array (max 30).
		$clean_parts = array();
		if ( isset( $data['parts'] ) && is_array( $data['parts'] ) ) {
			if ( count( $data['parts'] ) > 30 ) {
				return new WP_Error( 'tgb_too_many_parts', __( 'Build exceeds the maximum allowable parts limit (30).', 'part-selector' ), array( 'status' => 400 ) );
			}

			foreach ( $data['parts'] as $p ) {
				if ( ! is_array( $p ) ) continue;
				$pid     = isset( $p['productId'] ) ? absint( $p['productId'] ) : 0;
				$inst_id = isset( $p['instanceId'] ) ? sanitize_text_field( $p['instanceId'] ) : 'part-' . wp_generate_password( 6, false );

				$clean_parts[] = array(
					'instanceId' => $inst_id,
					'productId'  => $pid,
					'x'          => isset( $p['x'] ) ? (int) round( (float) $p['x'] ) : 0,
					'y'          => isset( $p['y'] ) ? (int) round( (float) $p['y'] ) : 0,
					'zIndex'     => isset( $p['zIndex'] ) ? (int) $p['zIndex'] : 20,
				);
			}
		}

		$clean_data = array(
			'schemaVersion' => 2,
			'name'          => $name,
			'baseProductId' => $base_product_id ?: null,
			'rails'         => $clean_rails,
			'parts'         => $clean_parts,
		);

		if ( ! empty( $data['sourceGuestId'] ) ) {
			$clean_data['sourceGuestId'] = sanitize_text_field( $data['sourceGuestId'] );
		}

		return $clean_data;
	}

	/**
	 * Tracks per-customer lock depth for nested lock requests within the same PHP process.
	 *
	 * @var array<int, int>
	 */
	private static $customer_lock_depth = array();

	/**
	 * Acquires an advisory per-customer lock in MySQL.
	 *
	 * Uses MySQL GET_LOCK() which is storage-engine agnostic (works with MyISAM and InnoDB),
	 * serializes concurrent writes for the same customer even when the customer has zero builds,
	 * and keeps different customers completely independent.
	 *
	 * @param int $user_id Customer ID.
	 * @param int $timeout Timeout in seconds (default 10).
	 * @return bool True if acquired, false on timeout or error.
	 */
	public static function acquire_customer_lock( $user_id, $timeout = 10 ) {
		global $wpdb;
		$user_id = absint( $user_id );
		if ( $user_id <= 0 ) {
			return false;
		}

		$depth = isset( self::$customer_lock_depth[ $user_id ] ) ? self::$customer_lock_depth[ $user_id ] : 0;
		if ( $depth > 0 ) {
			self::$customer_lock_depth[ $user_id ] = $depth + 1;
			return true;
		}

		$lock_name = 'tgb_customer_lock_' . $user_id;
		$acquired  = $wpdb->get_var(
			$wpdb->prepare( 'SELECT GET_LOCK(%s, %d)', $lock_name, $timeout )
		);

		if ( (int) $acquired === 1 ) {
			self::$customer_lock_depth[ $user_id ] = 1;
			return true;
		}

		return false;
	}

	/**
	 * Releases an advisory per-customer lock in MySQL.
	 *
	 * @param int $user_id Customer ID.
	 * @return bool True if released or decrementing depth.
	 */
	public static function release_customer_lock( $user_id ) {
		global $wpdb;
		$user_id = absint( $user_id );
		if ( $user_id <= 0 ) {
			return false;
		}

		$depth = isset( self::$customer_lock_depth[ $user_id ] ) ? self::$customer_lock_depth[ $user_id ] : 0;
		if ( $depth > 1 ) {
			self::$customer_lock_depth[ $user_id ] = $depth - 1;
			return true;
		}

		self::$customer_lock_depth[ $user_id ] = 0;
		$lock_name = 'tgb_customer_lock_' . $user_id;
		$released  = $wpdb->get_var(
			$wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock_name )
		);

		return (int) $released === 1;
	}

	/**
	 * Persists a validated build record into wp_posts and wp_postmeta.
	 *
	 * Uses an advisory MySQL named lock (GET_LOCK) scoped to the customer ID to serialize
	 * concurrent write operations and strictly guarantee that the 10-build limit cannot be
	 * exceeded, regardless of storage engine (MyISAM/InnoDB), indexes, or transaction isolation.
	 *
	 * If sourceGuestId is present, enforces atomic idempotency under lock to ensure duplicate
	 * simultaneous requests create at most one post.
	 *
	 * If any failure occurs during metadata persistence, immediately deletes the post record
	 * to prevent partial or corrupted records.
	 *
	 * @param int   $user_id Owner user ID.
	 * @param array $data Validated data structure.
	 * @return int|WP_Error Created post ID.
	 */
	public static function persist_build_record( $user_id, $data ) {
		global $wpdb;
		$user_id = absint( $user_id );
		if ( $user_id <= 0 ) {
			return new WP_Error( 'tgb_invalid_user', __( 'Invalid user ID.', 'part-selector' ), array( 'status' => 400 ) );
		}

		$locked = self::acquire_customer_lock( $user_id, 10 );
		if ( ! $locked ) {
			return new WP_Error(
				'tgb_lock_timeout',
				__( 'Could not acquire lock to save build. Please try again.', 'part-selector' ),
				array( 'status' => 409 )
			);
		}

		$post_id = 0;

		try {
			// 1. Atomic idempotency check: if sourceGuestId is provided, check if already imported for this user.
			if ( ! empty( $data['sourceGuestId'] ) ) {
				$already_id = $wpdb->get_var(
					$wpdb->prepare(
						"SELECT p.ID FROM {$wpdb->posts} p
						 INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
						 WHERE p.post_type = %s AND p.post_author = %d AND pm.meta_key = %s AND pm.meta_value = %s AND p.post_status = 'publish'
						 LIMIT 1",
						self::POST_TYPE,
						$user_id,
						self::META_SOURCE_GUEST_ID,
						$data['sourceGuestId']
					)
				);

				if ( $already_id ) {
					return new WP_Error(
						'tgb_already_imported',
						__( 'Draft already imported to this account.', 'part-selector' ),
						array(
							'status'            => 200,
							'existing_build_id' => (int) $already_id,
						)
					);
				}
			}

			// 2. Limit check under customer lock: strict 10-build account limit.
			$count = (int) $wpdb->get_var(
				$wpdb->prepare(
					"SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = %s AND post_author = %d AND post_status = 'publish'",
					self::POST_TYPE,
					$user_id
				)
			);

			if ( $count >= self::MAX_ACCOUNT_BUILDS ) {
				return new WP_Error(
					'tgb_build_limit_reached',
					__( 'You have reached the maximum of 10 saved builds. Delete an existing build to save another.', 'part-selector' ),
					array( 'status' => 403 )
				);
			}

			// 3. Insert post record.
			$post_id = wp_insert_post(
				array(
					'post_type'    => self::POST_TYPE,
					'post_status'  => 'publish',
					'post_author'  => $user_id,
					'post_title'   => $data['name'],
					'post_content' => '',
				),
				true
			);

			if ( is_wp_error( $post_id ) ) {
				return $post_id;
			}

			// 4. Update metadata.
			update_post_meta( $post_id, self::META_SCHEMA_VERSION, 2 );
			update_post_meta( $post_id, self::META_BASE_PRODUCT_ID, $data['baseProductId'] ?: 0 );
			update_post_meta( $post_id, self::META_RAILS, $data['rails'] );
			update_post_meta( $post_id, self::META_PARTS, $data['parts'] );
			update_post_meta( $post_id, self::META_REVISION, 1 );

			if ( ! empty( $data['sourceGuestId'] ) ) {
				update_post_meta( $post_id, self::META_SOURCE_GUEST_ID, sanitize_text_field( $data['sourceGuestId'] ) );
			}

			return $post_id;

		} catch ( Throwable $t ) {
			if ( $post_id > 0 ) {
				wp_delete_post( $post_id, true );
			}
			return new WP_Error(
				'tgb_save_failed',
				$t->getMessage(),
				array( 'status' => 500 )
			);
		} finally {
			self::release_customer_lock( $user_id );
		}
	}

	/**
	 * Updates an existing validated build record.
	 *
	 * @param int   $build_id
	 * @param array $data
	 * @param int   $new_revision
	 * @return true|WP_Error
	 */
	public static function update_build_record( $build_id, $data, $new_revision = 1 ) {
		$post_id = wp_update_post(
			array(
				'ID'         => $build_id,
				'post_title' => $data['name'],
			),
			true
		);

		if ( is_wp_error( $post_id ) ) {
			return $post_id;
		}

		update_post_meta( $build_id, self::META_SCHEMA_VERSION, 2 );
		update_post_meta( $build_id, self::META_BASE_PRODUCT_ID, $data['baseProductId'] ?: 0 );
		update_post_meta( $build_id, self::META_RAILS, $data['rails'] );
		update_post_meta( $build_id, self::META_PARTS, $data['parts'] );
		update_post_meta( $build_id, self::META_REVISION, $new_revision );

		return true;
	}
}
