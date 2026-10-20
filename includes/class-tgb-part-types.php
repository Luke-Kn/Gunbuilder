<?php
/**
 * Dynamic Builder Part Types taxonomy manager for Taktik Gun Builder.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Part_Types
 *
 * Registers and manages the custom taxonomy for Gun Builder Part Types.
 */
class TGB_Part_Types {

	/**
	 * Taxonomy slug.
	 *
	 * @var string
	 */
	const TAXONOMY = 'tgb_part_type';

	/**
	 * Initialize taxonomy hooks.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register_taxonomy' ), 5 );
	}

	/**
	 * Registers the custom taxonomy for dynamic Builder Part Types.
	 */
	public static function register_taxonomy() {
		$labels = array(
			'name'                       => _x( 'Gun Builder Part Types', 'taxonomy general name', 'part-selector' ),
			'singular_name'              => _x( 'Part Type', 'taxonomy singular name', 'part-selector' ),
			'search_items'               => __( 'Search Part Types', 'part-selector' ),
			'popular_items'              => null,
			'all_items'                  => __( 'All Part Types', 'part-selector' ),
			'parent_item'                => null,
			'parent_item_colon'          => null,
			'edit_item'                  => __( 'Edit Part Type', 'part-selector' ),
			'update_item'                => __( 'Update Part Type', 'part-selector' ),
			'add_new_item'               => __( 'Add New Part Type', 'part-selector' ),
			'new_item_name'              => __( 'New Part Type Name', 'part-selector' ),
			'separate_items_with_commas' => null,
			'add_or_remove_items'        => null,
			'choose_from_most_used'      => null,
			'not_found'                  => __( 'No Part Types found.', 'part-selector' ),
			'menu_name'                  => __( 'Gun Builder Part Types', 'part-selector' ),
		);

		$args = array(
			'hierarchical'          => true, // Hierarchical provides clean category-style table in admin without tag clouds.
			'labels'                => $labels,
			'show_ui'               => true,
			'show_admin_column'     => false,
			'show_in_menu'          => 'edit.php?post_type=product', // Submenu under WooCommerce Products.
			'show_in_nav_menus'     => false,
			'show_tagcloud'         => false,
			'show_in_quick_edit'    => false,
			'meta_box_cb'           => false, // Suppress default metabox; product tab controls the assignment.
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
	 * Retrieves all available Builder Part Types.
	 *
	 * @return WP_Term[] Array of term objects.
	 */
	public static function get_all_types() {
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
	 * Retrieves the assigned Part Type for a specific product.
	 *
	 * @param int $product_id WooCommerce product ID.
	 * @return WP_Term|null The assigned term object, or null if none assigned.
	 */
	public static function get_product_part_type( $product_id ) {
		$terms = wp_get_object_terms( $product_id, self::TAXONOMY );

		if ( ! is_wp_error( $terms ) && ! empty( $terms ) ) {
			return $terms[0];
		}

		return null;
	}
}
