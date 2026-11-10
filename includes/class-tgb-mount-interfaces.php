<?php
/**
 * Dynamic Mount Interfaces taxonomy manager for Taktik Gun Builder.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Mount_Interfaces
 *
 * Registers and manages the custom taxonomy for Gun Builder Mount Interfaces.
 */
class TGB_Mount_Interfaces {

	/**
	 * Taxonomy slug.
	 *
	 * @var string
	 */
	const TAXONOMY = 'tgb_mount_interface';

	/**
	 * Initialize taxonomy hooks.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register_taxonomy' ), 5 );
		add_action( 'pre_delete_term', array( __CLASS__, 'check_interface_deletion' ), 10, 2 );
	}

	/**
	 * Registers the custom taxonomy for dynamic Builder Mount Interfaces.
	 */
	public static function register_taxonomy() {
		$labels = array(
			'name'                       => _x( 'Gun Builder Mount Interfaces', 'taxonomy general name', 'part-selector' ),
			'singular_name'              => _x( 'Mount Interface', 'taxonomy singular name', 'part-selector' ),
			'search_items'               => __( 'Search Mount Interfaces', 'part-selector' ),
			'popular_items'              => null,
			'all_items'                  => __( 'All Mount Interfaces', 'part-selector' ),
			'parent_item'                => null,
			'parent_item_colon'          => null,
			'edit_item'                  => __( 'Edit Mount Interface', 'part-selector' ),
			'update_item'                => __( 'Update Mount Interface', 'part-selector' ),
			'add_new_item'               => __( 'Add New Mount Interface', 'part-selector' ),
			'new_item_name'              => __( 'New Mount Interface Name', 'part-selector' ),
			'separate_items_with_commas' => null,
			'add_or_remove_items'        => null,
			'choose_from_most_used'      => null,
			'not_found'                  => __( 'No Mount Interfaces found.', 'part-selector' ),
			'menu_name'                  => __( 'Gun Builder Mount Interfaces', 'part-selector' ),
		);

		$args = array(
			'hierarchical'          => false, // Non-hierarchical standard list.
			'labels'                => $labels,
			'show_ui'               => true,
			'show_admin_column'     => false,
			'show_in_menu'          => 'edit.php?post_type=product', // Submenu under WooCommerce Products.
			'show_in_nav_menus'     => false,
			'show_tagcloud'         => false,
			'show_in_quick_edit'    => false,
			'meta_box_cb'           => false, // Suppress default metabox; product data tab controls the assignment.
			'public'                => false,
			'publicly_queryable'    => false,
			'query_var'             => false,
			'rewrite'               => false,
			'capabilities'          => array(
				'manage_terms' => 'manage_product_terms',
				'edit_terms'   => 'edit_product_terms',
				'delete_terms' => 'delete_product_terms',
				'assign_terms' => 'assign_product_terms',
			),
		);

		register_taxonomy( self::TAXONOMY, array( 'product' ), $args );
	}

	/**
	 * Retrieves all available Builder Mount Interfaces.
	 *
	 * @return WP_Term[] Array of term objects.
	 */
	public static function get_all_interfaces() {
		$terms = get_terms(
			array(
				'taxonomy'   => self::TAXONOMY,
				'hide_empty' => false,
			)
		);

		if ( is_wp_error( $terms ) || ! is_array( $terms ) ) {
			return array();
		}

		return $terms;
	}

	/**
	 * Retrieves assigned Mount Interfaces for a specific Part product.
	 *
	 * @param int $product_id WooCommerce product ID.
	 * @return WP_Term[] Array of assigned term objects.
	 */
	public static function get_product_interfaces( $product_id ) {
		$terms = wp_get_object_terms( $product_id, self::TAXONOMY );

		if ( ! is_wp_error( $terms ) && is_array( $terms ) ) {
			return $terms;
		}

		return array();
	}

	/**
	 * Guards against accidental deletion of mounting interfaces currently in use.
	 *
	 * Fires on pre_delete_term action before any database mutations occur.
	 * Calls wp_die to abort deletion if any products currently reference this interface.
	 *
	 * @param int    $term_id  Term ID being deleted.
	 * @param string $taxonomy Taxonomy slug.
	 */
	public static function check_interface_deletion( $term_id, $taxonomy ) {
		if ( self::TAXONOMY !== $taxonomy ) {
			return;
		}

		$term = get_term( $term_id, self::TAXONOMY );
		if ( ! $term || is_wp_error( $term ) ) {
			return;
		}

		$usage_count = self::get_interface_usage_count( $term_id );
		if ( $usage_count > 0 ) {
			$message = sprintf(
				/* translators: 1: Interface name, 2: Number of products */
				__( 'Cannot delete "%1$s": This Mount Interface is currently configured on %2$d Gun Builder product(s). Please remove or reassign it from those products before deleting.', 'part-selector' ),
				$term->name,
				$usage_count
			);
			wp_die(
				esc_html( $message ),
				esc_html__( 'Mount Interface In Use', 'part-selector' ),
				array(
					'response'  => 403,
					'back_link' => true,
				)
			);
		}
	}

	/**
	 * Checks whether a Mount Interface can be safely deleted.
	 *
	 * @param int $term_id Term ID of the interface.
	 * @return bool True if safe to delete (0 active usages), false if in use.
	 */
	public static function can_delete_interface( $term_id ) {
		return 0 === self::get_interface_usage_count( $term_id );
	}

	/**
	 * Counts how many Gun Builder products currently reference a given Mount Interface.
	 *
	 * Checks both Part accepted interfaces and Base Gun mount point metadata.
	 *
	 * @param int $term_id Term ID of the interface.
	 * @return int Number of products actively referencing this interface.
	 */
	public static function get_interface_usage_count( $term_id ) {
		$term_id = absint( $term_id );
		if ( $term_id <= 0 ) {
			return 0;
		}

		// 1. Check Part products with this term assigned
		$parts_with_iface = get_posts(
			array(
				'post_type'      => 'product',
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'tax_query'      => array(
					array(
						'taxonomy' => self::TAXONOMY,
						'field'    => 'term_id',
						'terms'    => $term_id,
					),
				),
			)
		);
		$count = is_array( $parts_with_iface ) ? count( $parts_with_iface ) : 0;

		// 2. Check Base Guns with this interface in _tgb_mount_points
		$base_guns = get_posts(
			array(
				'post_type'      => 'product',
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'meta_query'     => array(
					array(
						'key'   => '_tgb_role',
						'value' => 'base_gun',
					),
				),
			)
		);

		if ( ! empty( $base_guns ) && is_array( $base_guns ) ) {
			foreach ( $base_guns as $bg_id ) {
				$raw_pts = get_post_meta( $bg_id, '_tgb_mount_points', true );
				if ( empty( $raw_pts ) ) {
					continue;
				}
				if ( is_string( $raw_pts ) ) {
					$raw_pts = json_decode( $raw_pts, true );
				}
				if ( is_array( $raw_pts ) ) {
					foreach ( $raw_pts as $pt ) {
						if ( isset( $pt['interface_id'] ) && (int) $pt['interface_id'] === $term_id ) {
							$count++;
							break;
						}
					}
				}
			}
		}

		// 3. Check Rail products with this interface in input or output interfaces
		$rails = get_posts(
			array(
				'post_type'      => 'product',
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'meta_query'     => array(
					array(
						'key'   => '_tgb_role',
						'value' => 'rail',
					),
				),
			)
		);

		if ( ! empty( $rails ) && is_array( $rails ) ) {
			foreach ( $rails as $rail_id ) {
				$inputs  = get_post_meta( $rail_id, '_tgb_rail_input_interfaces', true );
				$outputs = get_post_meta( $rail_id, '_tgb_rail_output_interfaces', true );

				if ( is_string( $inputs ) ) {
					$inputs = json_decode( $inputs, true );
				}
				if ( is_string( $outputs ) ) {
					$outputs = json_decode( $outputs, true );
				}

				$inputs  = is_array( $inputs ) ? array_map( 'intval', $inputs ) : array();
				$outputs = is_array( $outputs ) ? array_map( 'intval', $outputs ) : array();

				if ( in_array( $term_id, $inputs, true ) || in_array( $term_id, $outputs, true ) ) {
					$count++;
				}
			}
		}

		return $count;
	}
}
