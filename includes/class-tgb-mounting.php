<?php
/**
 * Structured Mounting and Compatibility Service for Taktik Gun Builder.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Mounting
 *
 * Authoritative service managing Base Gun mount points, Part attachment anchors,
 * taxonomy-based mount interface intersection, and default initial placement math.
 */
class TGB_Mounting {

	// Metadata Keys.
	const META_MOUNT_POINTS = '_tgb_mount_points';
	const META_ANCHOR_X     = '_tgb_mount_anchor_x';
	const META_ANCHOR_Y     = '_tgb_mount_anchor_y';

	/**
	 * Status constants.
	 */
	const STATUS_COMPATIBLE   = 'compatible';
	const STATUS_INCOMPATIBLE = 'incompatible';
	const STATUS_UNCONFIGURED = 'unconfigured';

	/**
	 * Retrieves structured, normalized mount points for a Base Gun.
	 *
	 * Coordinates are base-gun-local in millimetres (1 mm = 1 logical px):
	 * X = distance from LEFT edge of builder image.
	 * Y = distance from TOP edge of builder image.
	 *
	 * @param int $product_id Base Gun WooCommerce product ID.
	 * @return array Normalized array of mount point definitions.
	 */
	public static function get_base_mount_points( $product_id ) {
		$raw_points = get_post_meta( $product_id, self::META_MOUNT_POINTS, true );
		if ( empty( $raw_points ) ) {
			return array();
		}

		if ( is_string( $raw_points ) ) {
			$decoded = json_decode( $raw_points, true );
			$raw_points = is_array( $decoded ) ? $decoded : array();
		}

		if ( ! is_array( $raw_points ) ) {
			return array();
		}

		$normalized = array();
		foreach ( $raw_points as $point ) {
			if ( ! is_array( $point ) ) {
				continue;
			}

			$interface_id = isset( $point['interface_id'] ) ? absint( $point['interface_id'] ) : 0;
			$term         = $interface_id > 0 ? get_term( $interface_id, TGB_Mount_Interfaces::TAXONOMY ) : null;

			// If referenced taxonomy term was deleted or does not exist, omit this point for safety.
			if ( ! $term || is_wp_error( $term ) ) {
				continue;
			}

			$point_id = ! empty( $point['id'] ) ? sanitize_key( $point['id'] ) : self::generate_mount_id();
			$label    = ! empty( $point['label'] ) ? sanitize_text_field( $point['label'] ) : __( 'Mount Point', 'part-selector' );
			$x        = isset( $point['x'] ) && is_numeric( $point['x'] ) ? (float) $point['x'] : 0.0;
			$y        = isset( $point['y'] ) && is_numeric( $point['y'] ) ? (float) $point['y'] : 0.0;

			$normalized[] = array(
				'id'        => $point_id,
				'label'     => $label,
				'interface' => array(
					'id'   => (int) $term->term_id,
					'name' => (string) $term->name,
					'slug' => (string) $term->slug,
				),
				'x'         => $x,
				'y'         => $y,
			);
		}

		return $normalized;
	}

	/**
	 * Retrieves accepted Mount Interfaces for a Part product.
	 *
	 * @param int $product_id Part WooCommerce product ID.
	 * @return array Array of normalized interface objects.
	 */
	public static function get_part_mount_interfaces( $product_id ) {
		$terms = TGB_Mount_Interfaces::get_product_interfaces( $product_id );
		$interfaces = array();

		foreach ( $terms as $term ) {
			$interfaces[] = array(
				'id'   => (int) $term->term_id,
				'name' => (string) $term->name,
				'slug' => (string) $term->slug,
			);
		}

		return $interfaces;
	}

	/**
	 * Retrieves attachment anchor percentage for a Part product.
	 *
	 * Represents the visual point on the Part image (0% to 100%) that aligns
	 * to a Base Gun mount point.
	 *
	 * @param int $product_id Part WooCommerce product ID.
	 * @return array|null Associative array with x_percent and y_percent, or null if unconfigured.
	 */
	public static function get_part_anchor( $product_id ) {
		$raw_x = get_post_meta( $product_id, self::META_ANCHOR_X, true );
		$raw_y = get_post_meta( $product_id, self::META_ANCHOR_Y, true );

		if ( '' === $raw_x || '' === $raw_y || ! is_numeric( $raw_x ) || ! is_numeric( $raw_y ) ) {
			return null;
		}

		$x = (float) $raw_x;
		$y = (float) $raw_y;

		if ( $x < 0.0 || $x > 100.0 || $y < 0.0 || $y > 100.0 ) {
			return null;
		}

		return array(
			'x_percent' => $x,
			'y_percent' => $y,
		);
	}

	/**
	 * Generates a stable unique mount point ID.
	 *
	 * @return string
	 */
	public static function generate_mount_id() {
		return 'mount-' . wp_generate_password( 12, false, false );
	}

	/**
	 * Strictly validates and normalizes an anchor percentage value (0 to 100).
	 *
	 * @param mixed $raw_value Raw input value.
	 * @return string Normalized decimal string if valid, or '' if invalid.
	 */
	public static function sanitize_anchor_percent( $raw_value ) {
		if ( ! is_string( $raw_value ) && ! is_numeric( $raw_value ) ) {
			return '';
		}

		$trimmed = trim( (string) $raw_value );

		// Strictly match non-negative decimals or integers (e.g. 0, 50, 100, 33.5).
		if ( ! preg_match( '/^\d+(\.\d+)?$/', $trimmed ) ) {
			return '';
		}

		$float_val = (float) $trimmed;
		if ( $float_val < 0.0 || $float_val > 100.0 ) {
			return '';
		}

		return (string) $float_val;
	}

	/**
	 * Strictly sanitizes Base Gun mount points submitted from admin.
	 *
	 * @param array      $raw_rows    Raw row array from $_POST.
	 * @param float|null $max_width   Base Gun width in mm (optional boundary check).
	 * @param float|null $max_height  Base Gun height in mm (optional boundary check).
	 * @return array Sanitized array of mount points.
	 */
	public static function sanitize_mount_points( array $raw_rows, $max_width = null, $max_height = null ) {
		$sanitized = array();

		foreach ( $raw_rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}

			// Validate interface term exists.
			$interface_id = isset( $row['interface_id'] ) ? absint( $row['interface_id'] ) : 0;
			if ( $interface_id <= 0 || ! term_exists( $interface_id, TGB_Mount_Interfaces::TAXONOMY ) ) {
				continue;
			}

			// Sanitize Label.
			$label = isset( $row['label'] ) ? sanitize_text_field( wp_unslash( $row['label'] ) ) : '';
			if ( '' === $label ) {
				$label = __( 'Mount Point', 'part-selector' );
			}

			// Validate X coordinate (0 <= x <= max_width if provided).
			$raw_x = isset( $row['x'] ) ? trim( (string) $row['x'] ) : '';
			if ( ! preg_match( '/^\d+(\.\d+)?$/', $raw_x ) ) {
				continue;
			}
			$x = (float) $raw_x;
			if ( $max_width !== null && $max_width > 0 && $x > $max_width ) {
				$x = $max_width;
			}

			// Validate Y coordinate (0 <= y <= max_height if provided).
			$raw_y = isset( $row['y'] ) ? trim( (string) $row['y'] ) : '';
			if ( ! preg_match( '/^\d+(\.\d+)?$/', $raw_y ) ) {
				continue;
			}
			$y = (float) $raw_y;
			if ( $max_height !== null && $max_height > 0 && $y > $max_height ) {
				$y = $max_height;
			}

			// Ensure stable unique ID.
			$point_id = isset( $row['id'] ) && '' !== trim( (string) $row['id'] )
				? sanitize_key( $row['id'] )
				: self::generate_mount_id();

			$sanitized[] = array(
				'id'           => $point_id,
				'label'        => $label,
				'interface_id' => $interface_id,
				'x'            => $x,
				'y'            => $y,
			);
		}

		return $sanitized;
	}

	/**
	 * Determines mount compatibility between a Base Gun and a Part.
	 *
	 * A Part is mount-compatible when at least one Part accepted mount-interface
	 * term ID matches at least one Base Gun mount-point interface term ID,
	 * and the Part has a configured attachment anchor.
	 *
	 * @param int $base_gun_id Base Gun product ID.
	 * @param int $part_id     Part product ID.
	 * @return string 'compatible', 'incompatible', or 'unconfigured'.
	 */
	public static function check_compatibility( $base_gun_id, $part_id ) {
		$base_points = self::get_base_mount_points( $base_gun_id );
		if ( empty( $base_points ) ) {
			return self::STATUS_UNCONFIGURED;
		}

		$part_interfaces = self::get_part_mount_interfaces( $part_id );
		$part_anchor     = self::get_part_anchor( $part_id );

		if ( empty( $part_interfaces ) || null === $part_anchor ) {
			return self::STATUS_UNCONFIGURED;
		}

		$base_interface_ids = array_map( function( $pt ) {
			return (int) $pt['interface']['id'];
		}, $base_points );

		$part_interface_ids = array_map( function( $iface ) {
			return (int) $iface['id'];
		}, $part_interfaces );

		$intersection = array_intersect( $part_interface_ids, $base_interface_ids );

		return ! empty( $intersection ) ? self::STATUS_COMPATIBLE : self::STATUS_INCOMPATIBLE;
	}

	/**
	 * Finds the deterministic default mount point on a Base Gun for a Part.
	 *
	 * Iterates Base Gun mount points in their configured admin order and selects
	 * the FIRST mount point whose interface ID is accepted by the Part.
	 *
	 * @param int $base_gun_id Base Gun product ID.
	 * @param int $part_id     Part product ID.
	 * @return array|null Selected mount point definition, or null if none match.
	 */
	public static function find_default_mount_point( $base_gun_id, $part_id ) {
		$base_points     = self::get_base_mount_points( $base_gun_id );
		$part_interfaces = self::get_part_mount_interfaces( $part_id );

		if ( empty( $base_points ) || empty( $part_interfaces ) ) {
			return null;
		}

		$accepted_ids = array_map( function( $iface ) {
			return (int) $iface['id'];
		}, $part_interfaces );

		foreach ( $base_points as $point ) {
			if ( in_array( (int) $point['interface']['id'], $accepted_ids, true ) ) {
				return $point;
			}
		}

		return null;
	}

	/**
	 * Calculates the canonical initial placement position for a Part.
	 *
	 * @param float $base_x           Base Gun stage X.
	 * @param float $base_y           Base Gun stage Y.
	 * @param array $mount_point      Selected Base Gun mount point { x, y }.
	 * @param float $part_width       Part logical width (1 mm = 1 px).
	 * @param float $part_height      Part logical height (1 mm = 1 px).
	 * @param float $anchor_x_percent Part visual attachment anchor X percentage (0-100).
	 * @param float $anchor_y_percent Part visual attachment anchor Y percentage (0-100).
	 * @return array { x: int, y: int } Logical stage coordinates.
	 */
	public static function calculate_initial_position( $base_x, $base_y, array $mount_point, $part_width, $part_height, $anchor_x_percent, $anchor_y_percent ) {
		$absolute_mount_x = $base_x + (float) ( $mount_point['x'] ?? 0.0 );
		$absolute_mount_y = $base_y + (float) ( $mount_point['y'] ?? 0.0 );

		$part_anchor_offset_x = (float) $part_width * ( (float) $anchor_x_percent / 100.0 );
		$part_anchor_offset_y = (float) $part_height * ( (float) $anchor_y_percent / 100.0 );

		return array(
			'x' => (int) round( $absolute_mount_x - $part_anchor_offset_x ),
			'y' => (int) round( $absolute_mount_y - $part_anchor_offset_y ),
		);
	}
}
