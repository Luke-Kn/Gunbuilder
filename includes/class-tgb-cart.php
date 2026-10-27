<?php
/**
 * Secure WooCommerce Cart Integration Service for Taktik Gun Builder.
 *
 * Coordinates atomic build validation, stock aggregation, compatibility checks,
 * grouping metadata, all-or-nothing cart insertion, and rollback safety.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Cart
 *
 * Handles customer-facing Add Build to Cart workflows while treating WooCommerce
 * as the sole authority for price, stock, taxes, shipping, and checkout.
 */
class TGB_Cart {

	/**
	 * Nonce action for cart mutation security.
	 */
	const NONCE_ACTION = 'tgb_cart_nonce';

	/**
	 * Maximum allowable component parts in a single build submission.
	 * Server abuse protection bound (Requirement 69).
	 */
	const MAX_PARTS_PER_BUILD = 30;

	/**
	 * Initialize cart integration hooks.
	 */
	public static function init() {
		// AJAX Mutation Endpoints (Guest + Logged-in customers).
		add_action( 'wp_ajax_tgb_add_build_to_cart', array( __CLASS__, 'handle_add_build_ajax' ) );
		add_action( 'wp_ajax_nopriv_tgb_add_build_to_cart', array( __CLASS__, 'handle_add_build_ajax' ) );

		// WooCommerce Cart Item Display Hooks.
		add_filter( 'woocommerce_get_item_data', array( __CLASS__, 'display_cart_item_data' ), 10, 2 );

		// WooCommerce Order Line Item Metadata Hooks.
		add_action( 'woocommerce_checkout_create_order_line_item', array( __CLASS__, 'add_order_line_item_data' ), 10, 4 );
	}

	/**
	 * Ensures WooCommerce session and cart instances are active.
	 *
	 * Safe for guests, customers, shop managers, and administrators.
	 *
	 * @return bool True if WC and Cart are available, false otherwise.
	 */
	public static function ensure_cart_session() {
		if ( ! function_exists( 'WC' ) || null === WC() ) {
			return false;
		}

		if ( null === WC()->session ) {
			$session_class = apply_filters( 'woocommerce_session_handler', 'WC_Session_Handler' );
			if ( class_exists( $session_class ) ) {
				WC()->session = new $session_class();
				WC()->session->init();
			}
		}

		if ( null === WC()->customer && class_exists( 'WC_Customer' ) ) {
			WC()->customer = new WC_Customer( get_current_user_id(), true );
		}

		if ( null === WC()->cart && class_exists( 'WC_Cart' ) ) {
			WC()->cart = new WC_Cart();
		}

		return ( WC()->cart instanceof WC_Cart );
	}

	/**
	 * AJAX endpoint handler for Add Build to Cart.
	 */
	public static function handle_add_build_ajax() {
		// Strict POST-only enforcement.
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Invalid request method. Only POST is accepted.', 'part-selector' ) ),
				405
			);
		}

		// Parse input payload (JSON body or $_POST).
		$raw_input = file_get_contents( 'php://input' );
		$payload   = json_decode( $raw_input, true );

		if ( ! is_array( $payload ) || empty( $payload ) ) {
			$payload = $_POST;
		}

		// CSRF / Nonce Protection (Guest & Logged-in compatible).
		$nonce = $payload['nonce'] ?? ( $_SERVER['HTTP_X_WP_NONCE'] ?? ( $_REQUEST['nonce'] ?? '' ) );
		if ( empty( $nonce ) || ! wp_verify_nonce( $nonce, self::NONCE_ACTION ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Security validation failed. Please refresh the page and try again.', 'part-selector' ) ),
				403
			);
		}

		$result = self::process_add_build( $payload );

		if ( is_wp_error( $result ) ) {
			$status_code = (int) $result->get_error_data();
			if ( $status_code < 400 || $status_code > 599 ) {
				$status_code = 400;
			}
			wp_send_json_error( array( 'message' => $result->get_error_message() ), $status_code );
		}

		wp_send_json_success( $result );
	}



	/**
	 * Core Build Validation and Atomic Cart Insertion.
	 *
	 * Fully revalidates the entire build server-side before mutating cart.
	 * Never trusts client price, stock, subtotal, compatibility, or role.
	 *
	 * @param array $payload Sanitized input payload.
	 * @return array|WP_Error Response payload array on success, WP_Error on failure.
	 */
	public static function process_add_build( array $payload ) {
		// Ensure WooCommerce Cart and Session are available.
		if ( ! self::ensure_cart_session() ) {
			return new WP_Error(
				'tgb_cart_unavailable',
				__( 'WooCommerce cart service is currently unavailable.', 'part-selector' ),
				500
			);
		}

		// 1. Idempotency / Duplicate Submission Protection (Requirement 33 & 77).
		$request_id = ! empty( $payload['request_id'] ) ? sanitize_key( substr( (string) $payload['request_id'], 0, 64 ) ) : '';
		if ( ! empty( $request_id ) && null !== WC()->session ) {
			$processed = WC()->session->get( 'tgb_processed_requests', array() );
			if ( is_array( $processed ) && isset( $processed[ $request_id ] ) ) {
				$entry = $processed[ $request_id ];
				// If processed within the last 60 seconds, return cached response.
				if ( is_array( $entry ) && ( time() - (int) ( $entry['timestamp'] ?? 0 ) ) < 60 ) {
					return $entry['response'];
				}
			}
		}

		// 2. Structural Payload Validation (Requirement 7 & 70).
		if ( ! isset( $payload['base_product_id'] ) || ! is_numeric( $payload['base_product_id'] ) ) {
			return new WP_Error(
				'tgb_invalid_base_id',
				__( 'A valid base platform is required to add a build to the cart.', 'part-selector' ),
				400
			);
		}

		$base_product_id = (int) $payload['base_product_id'];
		if ( $base_product_id <= 0 ) {
			return new WP_Error(
				'tgb_invalid_base_id',
				__( 'Invalid base platform product ID.', 'part-selector' ),
				400
			);
		}

		$raw_parts = isset( $payload['parts'] ) ? $payload['parts'] : array();
		if ( ! is_array( $raw_parts ) ) {
			return new WP_Error(
				'tgb_malformed_parts',
				__( 'Invalid components list format.', 'part-selector' ),
				400
			);
		}

		// Bounded Part Count (Abuse protection, Requirement 69).
		if ( count( $raw_parts ) > self::MAX_PARTS_PER_BUILD ) {
			return new WP_Error(
				'tgb_too_many_parts',
				sprintf(
					/* translators: %d: maximum parts count */
					__( 'Build exceeds the maximum allowable components limit (%d).', 'part-selector' ),
					self::MAX_PARTS_PER_BUILD
				),
				400
			);
		}

		// Sanitize parts list.
		$sanitized_parts = array();
		foreach ( $raw_parts as $raw_part ) {
			if ( ! is_array( $raw_part ) || empty( $raw_part['product_id'] ) || ! is_numeric( $raw_part['product_id'] ) ) {
				return new WP_Error(
					'tgb_malformed_part_item',
					__( 'One of the components in the build payload is malformed.', 'part-selector' ),
					400
				);
			}

			$part_pid = (int) $raw_part['product_id'];
			if ( $part_pid <= 0 ) {
				return new WP_Error(
					'tgb_invalid_part_id',
					__( 'Invalid component product ID.', 'part-selector' ),
					400
				);
			}

			$instance_id = ! empty( $raw_part['instance_id'] )
				? sanitize_key( substr( (string) $raw_part['instance_id'], 0, 64 ) )
				: '';

			$sanitized_parts[] = array(
				'product_id'  => $part_pid,
				'instance_id' => $instance_id,
			);
		}

		// 3. Server-Side Base Gun Revalidation (Requirement 9 & 39).
		$base_product = wc_get_product( $base_product_id );
		if ( ! $base_product || ! ( $base_product instanceof WC_Product ) ) {
			return new WP_Error(
				'tgb_base_not_found',
				__( 'The selected base platform could not be found.', 'part-selector' ),
				400
			);
		}

		// Enforce catalog eligibility (published, enabled, ready, valid config, gallery image).
		if ( ! TGB_Product_Data::is_catalog_eligible( $base_product ) ) {
			return new WP_Error(
				'tgb_base_ineligible',
				__( 'The selected base platform is not eligible for the Gun Builder.', 'part-selector' ),
				409
			);
		}

		// Enforce strict Base Gun role.
		if ( TGB_Product_Config::get_role( $base_product_id ) !== TGB_Product_Config::ROLE_BASE_GUN ) {
			return new WP_Error(
				'tgb_wrong_base_role',
				__( 'The specified base product is not configured as a base platform.', 'part-selector' ),
				409
			);
		}

		// Enforce WooCommerce purchasability (unpriced products return false, Requirement 55).
		if ( ! $base_product->is_purchasable() ) {
			return new WP_Error(
				'tgb_base_not_purchasable',
				__( 'The selected base platform cannot be purchased at this time.', 'part-selector' ),
				409
			);
		}

		// 4. Server-Side Parts Revalidation & Compatibility (Requirements 10, 11, 12, 40).
		$resolved_parts = array();
		foreach ( $sanitized_parts as $part_entry ) {
			$part_pid     = $part_entry['product_id'];
			$part_product = wc_get_product( $part_pid );

			if ( ! $part_product || ! ( $part_product instanceof WC_Product ) ) {
				return new WP_Error(
					'tgb_part_not_found',
					__( 'One of the selected components could not be found.', 'part-selector' ),
					409
				);
			}

			// Catalog eligibility.
			if ( ! TGB_Product_Data::is_catalog_eligible( $part_product ) ) {
				return new WP_Error(
					'tgb_part_ineligible',
					__( 'One of the selected components is no longer eligible for the Gun Builder.', 'part-selector' ),
					409
				);
			}

			// Role must be 'part'.
			if ( TGB_Product_Config::get_role( $part_pid ) !== TGB_Product_Config::ROLE_PART ) {
				return new WP_Error(
					'tgb_wrong_part_role',
					__( 'One of the selected items is not configured as a component part.', 'part-selector' ),
					409
				);
			}

			// Purchasability.
			if ( ! $part_product->is_purchasable() ) {
				return new WP_Error(
					'tgb_part_not_purchasable',
					__( 'One of the selected components cannot be purchased at this time.', 'part-selector' ),
					409
				);
			}

			// Structured Mount Compatibility (Requirement 11 & 40).
			$compat_status = TGB_Mounting::check_compatibility( $base_product_id, $part_pid );
			if ( TGB_Mounting::STATUS_COMPATIBLE !== $compat_status ) {
				return new WP_Error(
					'tgb_part_incompatible',
					__( 'This build contains a component that is not compatible with the selected platform.', 'part-selector' ),
					409
				);
			}

			$resolved_parts[] = array(
				'product'     => $part_product,
				'product_id'  => $part_pid,
				'instance_id' => $part_entry['instance_id'],
			);
		}

		// 5. Stock Revalidation & Aggregate Duplicate Stock (Requirements 17, 18, 19, 48, 49).
		$requested_quantities = array();
		$requested_quantities[ $base_product_id ] = 1;

		foreach ( $resolved_parts as $part_item ) {
			$pid = $part_item['product_id'];
			$requested_quantities[ $pid ] = ( $requested_quantities[ $pid ] ?? 0 ) + 1;
		}

		// Check each requested product against managed stock and cart quantities.
		foreach ( $requested_quantities as $product_id => $requested_qty ) {
			$product = ( $product_id === $base_product_id ) ? $base_product : wc_get_product( $product_id );

			// If product is sold individually, cannot add more than 1 in total.
			if ( $product->is_sold_individually() ) {
				$in_cart = 0;
				foreach ( WC()->cart->get_cart() as $cart_item ) {
					if ( (int) $cart_item['product_id'] === $product_id ) {
						$in_cart += (int) $cart_item['quantity'];
					}
				}
				if ( ( $requested_qty + $in_cart ) > 1 ) {
					return new WP_Error(
						'tgb_sold_individually',
						sprintf(
							/* translators: %s: product title */
							__( '"%s" can only be purchased once.', 'part-selector' ),
							$product->get_name()
						),
						409
					);
				}
			}

			// General in-stock check.
			if ( ! $product->is_in_stock() && ! $product->backorders_allowed() ) {
				return new WP_Error(
					'tgb_product_out_of_stock',
					sprintf(
						/* translators: %s: product title */
						__( '"%s" is currently out of stock.', 'part-selector' ),
						$product->get_name()
					),
					409
				);
			}

			// Managing stock check with existing cart aggregation.
			if ( $product->managing_stock() && ! $product->backorders_allowed() ) {
				$available_stock = (int) $product->get_stock_quantity();
				$already_in_cart = 0;

				foreach ( WC()->cart->get_cart() as $cart_item ) {
					if ( (int) $cart_item['product_id'] === $product_id ) {
						$already_in_cart += (int) $cart_item['quantity'];
					}
				}

				$total_needed = $requested_qty + $already_in_cart;
				if ( $total_needed > $available_stock ) {
					return new WP_Error(
						'tgb_insufficient_stock',
						sprintf(
							/* translators: %s: product title */
							__( 'Insufficient stock for "%s". Not enough inventory available.', 'part-selector' ),
							$product->get_name()
						),
						409
					);
				}
			}
		}

		// 6. Build ID & Human-Friendly Reference Generation (Requirements 20 & 21).
		$build_id        = wp_generate_uuid4();
		$build_reference = 'GB-' . strtoupper( substr( md5( $build_id ), 0, 6 ) );

		// 7. Atomic Cart Insertion with Rollback Protection (Requirements 13, 14, 22, 23, 50).
		$added_cart_keys = array();

		try {
			// Testing hook to force simulated failure if required by testing suite (Requirement 50).
			if ( ! apply_filters( 'tgb_test_force_cart_insert_allowed', true, 'base_gun', $base_product_id ) ) {
				throw new Exception( __( 'Simulated insertion failure for Base Gun.', 'part-selector' ) );
			}

			// Add Base Gun.
			$base_cart_item_data = array(
				'_tgb_build_id'        => $build_id,
				'_tgb_build_reference' => $build_reference,
				'_tgb_build_role'      => 'base_gun',
				'_tgb_line_id'         => wp_generate_uuid4(), // Guarantees distinct cart line.
			);

			$base_cart_key = WC()->cart->add_to_cart( $base_product_id, 1, 0, array(), $base_cart_item_data );
			if ( ! $base_cart_key ) {
				throw new Exception( __( 'Failed to add base platform to WooCommerce cart.', 'part-selector' ) );
			}
			$added_cart_keys[] = $base_cart_key;

			// Add each Part instance individually.
			foreach ( $resolved_parts as $part_data ) {
				$part_pid = $part_data['product_id'];

				// Testing hook to force mid-insert failure if requested by test fixture (Requirement 50).
				if ( ! apply_filters( 'tgb_test_force_cart_insert_allowed', true, 'part', $part_pid ) ) {
					throw new Exception( __( 'Simulated insertion failure for Part component.', 'part-selector' ) );
				}

				$part_type_term = TGB_Part_Types::get_product_part_type( $part_pid );

				$part_cart_item_data = array(
					'_tgb_build_id'        => $build_id,
					'_tgb_build_reference' => $build_reference,
					'_tgb_build_role'      => 'part',
					'_tgb_line_id'         => wp_generate_uuid4(), // Guarantees distinct cart line for identical products.
				);

				if ( $part_type_term ) {
					$part_cart_item_data['_tgb_part_type_id'] = (int) $part_type_term->term_id;
				}

				if ( ! empty( $part_data['instance_id'] ) ) {
					$part_cart_item_data['_tgb_client_instance_id'] = $part_data['instance_id'];
				}

				$part_cart_key = WC()->cart->add_to_cart( $part_pid, 1, 0, array(), $part_cart_item_data );
				if ( ! $part_cart_key ) {
					throw new Exception( __( 'Failed to add component to WooCommerce cart.', 'part-selector' ) );
				}
				$added_cart_keys[] = $part_cart_key;
			}

		} catch ( Exception $e ) {
			// Rollback ONLY the cart lines created during this request (Requirements 13 & 14).
			foreach ( $added_cart_keys as $key_to_remove ) {
				WC()->cart->remove_cart_item( $key_to_remove );
			}

			return new WP_Error(
				'tgb_cart_insert_failed',
				__( "We couldn't add this build to your cart. Please review the build and try again.", 'part-selector' ),
				500
			);
		}

		// 8. Construct Safe Success Response (Requirement 34).
		$response_data = array(
			'build_reference' => $build_reference,
			'build_id'        => $build_id,
			'item_count'      => 1 + count( $resolved_parts ),
			'cart_count'      => WC()->cart->get_cart_contents_count(),
			'cart_url'        => wc_get_cart_url(),
			'message'         => __( 'Build added to cart.', 'part-selector' ),
		);

		// Cache successful request for idempotency with bounded retention.
		if ( ! empty( $request_id ) && null !== WC()->session ) {
			$processed = WC()->session->get( 'tgb_processed_requests', array() );
			if ( ! is_array( $processed ) ) {
				$processed = array();
			}

			// Prune entries older than 120 seconds.
			$now = time();
			foreach ( $processed as $key => $entry ) {
				if ( ( $now - (int) ( $entry['timestamp'] ?? 0 ) ) > 120 ) {
					unset( $processed[ $key ] );
				}
			}

			// Bound to maximum 10 recent entries to prevent indefinite session growth.
			if ( count( $processed ) >= 10 ) {
				$processed = array_slice( $processed, -9, null, true );
			}

			$processed[ $request_id ] = array(
				'timestamp' => $now,
				'response'  => $response_data,
			);
			WC()->session->set( 'tgb_processed_requests', $processed );
		}

		return $response_data;
	}

	// =========================================================================
	// WooCommerce Display & Order Hooks (Requirements 26 & 27)
	// =========================================================================

	/**
	 * Formats readable Gun Builder metadata in WooCommerce Cart and Checkout.
	 *
	 * Displays clean, customer-friendly labels without exposing raw internal UUIDs.
	 *
	 * @param array $item_data Existing item data.
	 * @param array $cart_item Cart item data array.
	 * @return array Modified item data.
	 */
	public static function display_cart_item_data( $item_data, $cart_item ) {
		if ( empty( $cart_item['_tgb_build_reference'] ) ) {
			return $item_data;
		}

		$item_data[] = array(
			'key'   => __( 'Gun Builder', 'part-selector' ),
			'value' => esc_html( $cart_item['_tgb_build_reference'] ),
		);

		$role_label = ( 'base_gun' === ( $cart_item['_tgb_build_role'] ?? '' ) )
			? __( 'Base Platform', 'part-selector' )
			: __( 'Component', 'part-selector' );

		$item_data[] = array(
			'key'   => __( 'Build Role', 'part-selector' ),
			'value' => esc_html( $role_label ),
		);

		return $item_data;
	}

	/**
	 * Transfers Gun Builder grouping metadata to WooCommerce Order line items.
	 *
	 * Preserves internal identifiers for staff order inspection while showing
	 * customer-facing reference numbers.
	 *
	 * @param WC_Order_Item_Product $item          Order item object.
	 * @param string                $cart_item_key Cart item key.
	 * @param array                 $values        Cart item values.
	 * @param WC_Order              $order         Order object.
	 */
	public static function add_order_line_item_data( $item, $cart_item_key, $values, $order ) {
		if ( empty( $values['_tgb_build_id'] ) ) {
			return;
		}

		// Visible metadata on customer invoices and order emails.
		$item->add_meta_data( __( 'Gun Builder', 'part-selector' ), $values['_tgb_build_reference'], false );

		$role_label = ( 'base_gun' === ( $values['_tgb_build_role'] ?? '' ) )
			? __( 'Base Platform', 'part-selector' )
			: __( 'Component', 'part-selector' );

		$item->add_meta_data( __( 'Build Role', 'part-selector' ), $role_label, false );

		// Hidden internal metadata for store administration and audit.
		$item->add_meta_data( '_tgb_build_id', $values['_tgb_build_id'], true );
		$item->add_meta_data( '_tgb_line_id', $values['_tgb_line_id'], true );

		if ( ! empty( $values['_tgb_part_type_id'] ) ) {
			$item->add_meta_data( '_tgb_part_type_id', (int) $values['_tgb_part_type_id'], true );
		}

		if ( ! empty( $values['_tgb_client_instance_id'] ) ) {
			$item->add_meta_data( '_tgb_client_instance_id', sanitize_key( $values['_tgb_client_instance_id'] ), true );
		}
	}
}
