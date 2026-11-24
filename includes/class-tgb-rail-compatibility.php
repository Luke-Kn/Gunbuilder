<?php
/**
 * Dynamic Active Interface Pool and Rail Compatibility Service for Taktik Gun Builder.
 *
 * Computes available built-in and rail-introduced mounting capabilities,
 * evaluates proposed rail instances, and validates position-aware part compatibility.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Rail_Compatibility
 *
 * Core backend service for Part 3A.
 */
class TGB_Rail_Compatibility {

	/**
	 * Status constants.
	 */
	const STATUS_COMPATIBLE   = 'compatible';
	const STATUS_INCOMPATIBLE = 'incompatible';
	const STATUS_UNCONFIGURED = 'unconfigured';

	/**
	 * Retrieves built-in mounting capabilities for a Base Gun.
	 *
	 * Preserves mount-point identifiers, positions, and interface term IDs.
	 *
	 * @param int $base_gun_id Base Gun WooCommerce product ID.
	 * @return array Array of normalized capability records.
	 */
	public static function get_base_gun_capabilities( $base_gun_id ) {
		$base_gun_id = absint( $base_gun_id );
		if ( $base_gun_id <= 0 ) {
			return array();
		}

		$mount_points = TGB_Mounting::get_base_mount_points( $base_gun_id );
		if ( empty( $mount_points ) ) {
			return array();
		}

		$capabilities = array();
		foreach ( $mount_points as $pt ) {
			$interface_id = isset( $pt['interface']['id'] ) ? absint( $pt['interface']['id'] ) : 0;
			if ( $interface_id <= 0 ) {
				continue;
			}

			$capabilities[] = array(
				'interface_id' => $interface_id,
				'position'     => ! empty( $pt['position'] ) ? (string) $pt['position'] : 'unspecified',
				'source_type'  => 'base_gun',
				'source_id'    => ! empty( $pt['id'] ) ? (string) $pt['id'] : '',
				'label'        => ! empty( $pt['label'] ) ? (string) $pt['label'] : '',
			);
		}

		return $capabilities;
	}

	/**
	 * Validates whether a specific Rail product can attach at a given physical position on a Base Gun.
	 *
	 * Verification criteria:
	 * 1. Base Gun exists and is configured as a Base Gun.
	 * 2. Requested position is 'top' or 'bottom'.
	 * 3. Base Gun explicitly allows additional rails at that position (_tgb_allowed_rail_positions).
	 * 4. Rail product exists, is published, builder-enabled, builder-ready, and has valid configuration.
	 * 5. Rail product is permitted under the Base Gun's category policy.
	 * 6. Rail product supports the requested position (_tgb_rail_supported_positions).
	 * 7. Base Gun has at least one built-in mount point at that position accepting one of the rail's input interfaces.
	 *
	 * @param int    $base_gun_id      Base Gun product ID.
	 * @param int    $rail_product_id  Rail product ID.
	 * @param string $position         Physical position ('top' or 'bottom').
	 * @return array Associative array with 'valid' (bool) and 'reason' (string).
	 */
	public static function validate_rail_installation( $base_gun_id, $rail_product_id, $position ) {
		$base_gun_id     = absint( $base_gun_id );
		$rail_product_id = absint( $rail_product_id );
		$position        = sanitize_key( $position );

		// 1. Position check.
		if ( ! in_array( $position, array( 'top', 'bottom' ), true ) ) {
			return array(
				'valid'  => false,
				'reason' => 'invalid_position',
			);
		}

		// 2. Base Gun existence and role check.
		if ( $base_gun_id <= 0 || TGB_Product_Config::get_role( $base_gun_id ) !== TGB_Product_Config::ROLE_BASE_GUN ) {
			return array(
				'valid'  => false,
				'reason' => 'invalid_base_gun',
			);
		}

		// 3. Base Gun rail permission for this position.
		$allowed_rail_positions = TGB_Product_Config::get_allowed_rail_positions( $base_gun_id );
		if ( ! in_array( $position, $allowed_rail_positions, true ) ) {
			return array(
				'valid'  => false,
				'reason' => 'position_not_allowed_by_gun',
			);
		}

		// 4. Rail product existence.
		$rail_product = wc_get_product( $rail_product_id );
		if ( ! $rail_product || ! ( $rail_product instanceof WC_Product ) ) {
			return array(
				'valid'  => false,
				'reason' => 'rail_not_found',
			);
		}

		// Published status.
		if ( 'publish' !== $rail_product->get_status() ) {
			return array(
				'valid'  => false,
				'reason' => 'rail_not_published',
			);
		}

		// Role check.
		if ( TGB_Product_Config::get_role( $rail_product_id ) !== TGB_Product_Config::ROLE_RAIL ) {
			return array(
				'valid'  => false,
				'reason' => 'wrong_role',
			);
		}

		// Enabled & Ready.
		if ( ! TGB_Product_Config::is_enabled( $rail_product_id ) ) {
			return array(
				'valid'  => false,
				'reason' => 'rail_disabled',
			);
		}

		if ( ! TGB_Product_Config::is_ready( $rail_product_id ) ) {
			return array(
				'valid'  => false,
				'reason' => 'rail_not_ready',
			);
		}

		// Configuration validity (positive mm, input ifaces, output ifaces, supported pos).
		if ( ! TGB_Product_Config::is_configuration_valid( $rail_product_id ) ) {
			return array(
				'valid'  => false,
				'reason' => 'invalid_rail_configuration',
			);
		}

		// 5. Category policy enforcement.
		if ( ! TGB_Product_Config::is_part_category_allowed_for_gun( $base_gun_id, $rail_product_id ) ) {
			return array(
				'valid'  => false,
				'reason' => 'category_disallowed_by_gun',
			);
		}

		// 6. Rail supported position check.
		$rail_supported_pos = TGB_Product_Config::get_rail_supported_positions( $rail_product_id );
		if ( ! in_array( $position, $rail_supported_pos, true ) ) {
			return array(
				'valid'  => false,
				'reason' => 'position_not_supported_by_rail',
			);
		}

		// 7. Base Gun built-in mount interface match at that exact position.
		$base_mount_points = TGB_Mounting::get_base_mount_points( $base_gun_id );
		$rail_inputs       = TGB_Product_Config::get_rail_input_interfaces( $rail_product_id );

		$matched_mount = false;
		foreach ( $base_mount_points as $pt ) {
			$pt_pos      = (string) ( $pt['position'] ?? 'unspecified' );
			$pt_iface_id = isset( $pt['interface']['id'] ) ? (int) $pt['interface']['id'] : 0;

			// Unspecified legacy positions do NOT authorize rail installation at Top or Bottom.
			if ( $pt_pos === $position && in_array( $pt_iface_id, $rail_inputs, true ) ) {
				$matched_mount = true;
				break;
			}
		}

		if ( ! $matched_mount ) {
			return array(
				'valid'  => false,
				'reason' => 'no_matching_mount_at_position',
			);
		}

		return array(
			'valid'  => true,
			'reason' => '',
		);
	}

	/**
	 * Builds the active mounting capability pool for a Base Gun and a proposed set of installed Rails.
	 *
	 * Resolves built-in Base Gun capabilities, strictly re-validates each proposed Rail instance,
	 * appends validated Rail output capabilities with source attribution, and records any invalid
	 * Rail instances with specific failure reasons.
	 *
	 * Untrusted client-submitted interface IDs are never accepted; all capabilities are derived
	 * directly from authoritative WooCommerce product metadata.
	 *
	 * @param int   $base_gun_id     Base Gun product ID.
	 * @param array $installed_rails Array of proposed rail instances:
	 *                               [ [ 'instance_id' => string, 'product_id' => int, 'position' => string ], ... ]
	 * @return array Array containing:
	 *               - base_gun_id (int)
	 *               - capabilities (array)
	 *               - valid_rails (array)
	 *               - invalid_rails (array)
	 */
	public static function build_active_capability_pool( $base_gun_id, array $installed_rails = array() ) {
		$base_gun_id = absint( $base_gun_id );

		// 1. Initialize with built-in Base Gun capabilities.
		$capabilities  = self::get_base_gun_capabilities( $base_gun_id );
		$valid_rails   = array();
		$invalid_rails = array();

		$seen_instance_ids = array();

		foreach ( $installed_rails as $idx => $entry ) {
			if ( ! is_array( $entry ) ) {
				$invalid_rails[] = array(
					'entry_index' => $idx,
					'reason'      => 'malformed_entry',
				);
				continue;
			}

			$instance_id = isset( $entry['instance_id'] ) ? sanitize_key( (string) $entry['instance_id'] ) : '';
			$product_id  = isset( $entry['product_id'] ) ? absint( $entry['product_id'] ) : 0;
			$position    = isset( $entry['position'] ) ? sanitize_key( (string) $entry['position'] ) : '';

			// Validate instance ID uniqueness and presence.
			if ( '' === $instance_id ) {
				$invalid_rails[] = array(
					'instance_id' => '',
					'product_id'  => $product_id,
					'position'    => $position,
					'reason'      => 'missing_instance_id',
				);
				continue;
			}

			if ( in_array( $instance_id, $seen_instance_ids, true ) ) {
				$invalid_rails[] = array(
					'instance_id' => $instance_id,
					'product_id'  => $product_id,
					'position'    => $position,
					'reason'      => 'duplicate_instance_id',
				);
				continue;
			}
			$seen_instance_ids[] = $instance_id;

			// Revalidate rail installation independently.
			$check = self::validate_rail_installation( $base_gun_id, $product_id, $position );
			if ( ! $check['valid'] ) {
				$invalid_rails[] = array(
					'instance_id' => $instance_id,
					'product_id'  => $product_id,
					'position'    => $position,
					'reason'      => $check['reason'],
				);
				continue;
			}

			// Valid rail: derive output interfaces from authoritative product metadata.
			$outputs = TGB_Product_Config::get_rail_output_interfaces( $product_id );
			foreach ( $outputs as $out_iface_id ) {
				$capabilities[] = array(
					'interface_id'       => (int) $out_iface_id,
					'position'           => $position,
					'source_type'        => 'rail',
					'source_instance_id' => $instance_id,
					'source_product_id'  => $product_id,
				);
			}

			$valid_rails[] = array(
				'instance_id'        => $instance_id,
				'product_id'         => $product_id,
				'position'           => $position,
				'output_interfaces'  => $outputs,
			);
		}

		return array(
			'base_gun_id'   => $base_gun_id,
			'capabilities'  => $capabilities,
			'valid_rails'   => $valid_rails,
			'invalid_rails' => $invalid_rails,
		);
	}

	/**
	 * Evaluates Part compatibility against the active capability pool.
	 *
	 * Determines whether any capability in the pool (built-in or rail-introduced) satisfies
	 * the Part's accepted interfaces and optional position requirements.
	 *
	 * Returns detailed supporting source attribution for downstream UI and cascade evaluation.
	 *
	 * @param int   $part_id         Part WooCommerce product ID.
	 * @param array $capability_pool Active capability pool generated by build_active_capability_pool().
	 * @return array Associative array with:
	 *               - status ('compatible', 'incompatible', 'unconfigured')
	 *               - supporting_sources (array of matching capability records)
	 */
	public static function check_part_compatibility_with_pool( $part_id, array $capability_pool ) {
		$part_id = absint( $part_id );
		if ( $part_id <= 0 ) {
			return array(
				'status'             => self::STATUS_UNCONFIGURED,
				'supporting_sources' => array(),
			);
		}

		$part_interfaces = TGB_Mounting::get_part_mount_interfaces( $part_id );
		$part_anchor     = TGB_Mounting::get_part_anchor( $part_id );

		if ( empty( $part_interfaces ) || null === $part_anchor ) {
			return array(
				'status'             => self::STATUS_UNCONFIGURED,
				'supporting_sources' => array(),
			);
		}

		$part_positions = TGB_Product_Config::get_part_mount_positions( $part_id );
		$accepted_ifaces = array_map( function( $iface ) {
			return (int) $iface['id'];
		}, $part_interfaces );

		$pool_capabilities = isset( $capability_pool['capabilities'] ) && is_array( $capability_pool['capabilities'] )
			? $capability_pool['capabilities']
			: array();

		$supporting_sources = array();

		foreach ( $pool_capabilities as $cap ) {
			$cap_iface = isset( $cap['interface_id'] ) ? (int) $cap['interface_id'] : 0;
			$cap_pos   = isset( $cap['position'] ) ? (string) $cap['position'] : 'unspecified';

			if ( ! in_array( $cap_iface, $accepted_ifaces, true ) ) {
				continue;
			}

			// If Part has no explicit positions: matches ANY capability position (legacy behavior).
			if ( empty( $part_positions ) ) {
				$supporting_sources[] = $cap;
				continue;
			}

			// If Part specifies explicit positions: capability position must match.
			if ( in_array( $cap_pos, $part_positions, true ) ) {
				$supporting_sources[] = $cap;
			}
		}

		return array(
			'status'             => ! empty( $supporting_sources ) ? self::STATUS_COMPATIBLE : self::STATUS_INCOMPATIBLE,
			'supporting_sources' => $supporting_sources,
		);
	}

	/**
	 * Queries eligible Rail products for a Base Gun.
	 *
	 * Filters by published status, Builder Enabled = yes, Builder Ready = yes,
	 * Role = rail, valid first Gallery image, and Base Gun category policy.
	 *
	 * @param int   $base_gun_id Base Gun product ID.
	 * @param array $args        Optional query arguments (limit, cursor).
	 * @return array Array with 'items' and pagination metadata.
	 */
	public static function get_eligible_rails( $base_gun_id = 0, array $args = array() ) {
		$base_gun_id = absint( $base_gun_id );
		$limit       = isset( $args['limit'] ) ? min( 100, max( 1, absint( $args['limit'] ) ) ) : 20;

		$query_args = array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'posts_per_page' => -1, // Evaluate candidate rails in memory
			'fields'         => 'ids',
			'meta_query'     => array(
				array(
					'key'   => TGB_Product_Config::META_ROLE,
					'value' => TGB_Product_Config::ROLE_RAIL,
				),
				array(
					'key'   => TGB_Product_Config::META_ENABLED,
					'value' => 'yes',
				),
				array(
					'key'   => TGB_Product_Config::META_READY,
					'value' => 'yes',
				),
			),
		);

		$candidate_ids = get_posts( $query_args );
		if ( empty( $candidate_ids ) || ! is_array( $candidate_ids ) ) {
			return array(
				'items'       => array(),
				'limit'       => $limit,
				'has_more'    => false,
				'next_cursor' => null,
			);
		}

		$eligible_items = array();
		foreach ( $candidate_ids as $pid ) {
			$wc_prod = wc_get_product( $pid );
			if ( ! $wc_prod || ! ( $wc_prod instanceof WC_Product ) ) {
				continue;
			}

			// Validate configuration completeness.
			if ( ! TGB_Product_Config::is_configuration_valid( $pid ) ) {
				continue;
			}

			// Validate gallery image.
			$img_data = TGB_Product_Data::get_builder_image_data( $wc_prod );
			if ( null === $img_data ) {
				continue;
			}

			// Enforce Base Gun category policy if base_gun_id is provided.
			if ( $base_gun_id > 0 && ! TGB_Product_Config::is_part_category_allowed_for_gun( $base_gun_id, $pid ) ) {
				continue;
			}

			$data = TGB_Product_Data::get_product_data( $wc_prod );
			if ( $data ) {
				$eligible_items[] = $data;
			}
		}

		$has_more = count( $eligible_items ) > $limit;
		$paged_items = array_slice( $eligible_items, 0, $limit );

		return array(
			'items'       => $paged_items,
			'limit'       => $limit,
			'has_more'    => $has_more,
			'next_cursor' => null,
		);
	}

	/**
	 * Validates a proposed build (Base Gun + Rails + Parts) authoritatively server-side.
	 *
	 * Re-derives all capabilities, checks category policy for rails and parts,
	 * verifies rail positions and part mounting interfaces against active pool,
	 * and computes genuine pricing and weight from WooCommerce products.
	 *
	 * @param int   $base_gun_id     Base Gun product ID.
	 * @param array $installed_rails Array of rail instances.
	 * @param array $installed_parts Array of part instances or product IDs.
	 * @return array Validation result array.
	 */
	public static function validate_proposed_build( $base_gun_id, array $installed_rails = array(), array $installed_parts = array() ) {
		$base_gun_id = absint( $base_gun_id );
		$errors      = array();

		// 1. Base Gun check.
		if ( $base_gun_id <= 0 || TGB_Product_Config::get_role( $base_gun_id ) !== TGB_Product_Config::ROLE_BASE_GUN ) {
			return array(
				'valid'         => false,
				'base_gun_id'   => $base_gun_id,
				'total_price'   => 0.0,
				'total_weight'  => 0.0,
				'pricing'       => array( 'total_price' => 0.0 ),
				'weight'        => array( 'total_grams' => 0.0 ),
				'valid_rails'   => array(),
				'invalid_rails' => array(),
				'parts'         => array(),
				'errors'        => array( __( 'A valid Base Gun is required.', 'part-selector' ) ),
				'capabilities'  => array(),
			);
		}

		$base_product = wc_get_product( $base_gun_id );
		if ( ! $base_product || ! ( $base_product instanceof WC_Product ) ) {
			return array(
				'valid'         => false,
				'base_gun_id'   => $base_gun_id,
				'total_price'   => 0.0,
				'total_weight'  => 0.0,
				'pricing'       => array( 'total_price' => 0.0 ),
				'weight'        => array( 'total_grams' => 0.0 ),
				'valid_rails'   => array(),
				'invalid_rails' => array(),
				'parts'         => array(),
				'errors'        => array( __( 'Base Gun product could not be loaded.', 'part-selector' ) ),
				'capabilities'  => array(),
			);
		}

		$total_price  = (float) $base_product->get_price();
		$total_weight = (float) $base_product->get_weight();

		// 2. Build active capability pool.
		$pool_result = self::build_active_capability_pool( $base_gun_id, $installed_rails );
		if ( ! empty( $pool_result['invalid_rails'] ) ) {
			foreach ( $pool_result['invalid_rails'] as $inv ) {
				$reason = isset( $inv['reason'] ) ? $inv['reason'] : 'invalid_rail';
				$errors[] = sprintf( 'Rail instance %s is invalid: %s', $inv['instance_id'] ?? 'unknown', $reason );
			}
		}

		// Accumulate valid rails price/weight
		foreach ( $pool_result['valid_rails'] as $vr ) {
			$rp = wc_get_product( $vr['product_id'] );
			if ( $rp ) {
				$total_price  += (float) $rp->get_price();
				$total_weight += (float) $rp->get_weight();
			}
		}

		// 3. Validate parts against pool and base gun policy.
		$validated_parts = array();
		$all_parts_valid = true;

		foreach ( $installed_parts as $part_entry ) {
			$part_id = is_array( $part_entry ) && isset( $part_entry['product_id'] )
				? absint( $part_entry['product_id'] )
				: absint( $part_entry );

			if ( $part_id <= 0 ) {
				continue;
			}

			$part_prod = wc_get_product( $part_id );
			if ( ! $part_prod || ! ( $part_prod instanceof WC_Product ) ) {
				$all_parts_valid = false;
				$errors[] = sprintf( 'Part product %d not found.', $part_id );
				continue;
			}

			$comp        = self::check_part_compatibility_with_pool( $part_id, $pool_result );
			$cat_allowed = TGB_Product_Config::is_part_category_allowed_for_gun( $base_gun_id, $part_id );

			$is_compatible = ( 'compatible' === $comp['status'] ) && $cat_allowed;
			if ( ! $is_compatible ) {
				$all_parts_valid = false;
				$fail_reason = ( ! $cat_allowed ) ? 'category_disallowed' : 'no_matching_interface_or_position';
				$errors[] = sprintf( 'Part %s (%d) is incompatible: %s', $part_prod->get_name(), $part_id, $fail_reason );
			} else {
				$total_price  += (float) $part_prod->get_price();
				$total_weight += (float) $part_prod->get_weight();
			}

			$validated_parts[] = array(
				'product_id'         => $part_id,
				'compatible'         => $is_compatible,
				'status'             => $comp['status'],
				'reason'             => ( ! $cat_allowed ) ? 'category_disallowed' : ( ! empty( $comp['supporting_sources'] ) ? '' : 'no_matching_interface' ),
				'supporting_sources' => $comp['supporting_sources'],
			);
		}

		$is_overall_valid = empty( $pool_result['invalid_rails'] ) && $all_parts_valid && empty( $errors );

		return array(
			'valid'         => $is_overall_valid,
			'base_gun_id'   => $base_gun_id,
			'total_price'   => $total_price,
			'total_weight'  => $total_weight,
			'pricing'       => array(
				'total_price' => $total_price,
				'formatted'   => function_exists( 'wc_price' ) ? wc_price( $total_price ) : sprintf( '$%.2f', $total_price ),
			),
			'weight'        => array(
				'total_grams' => $total_weight,
			),
			'valid_rails'   => $pool_result['valid_rails'],
			'invalid_rails' => $pool_result['invalid_rails'],
			'parts'         => $validated_parts,
			'errors'        => $errors,
			'capabilities'  => $pool_result['capabilities'],
		);
	}
}
