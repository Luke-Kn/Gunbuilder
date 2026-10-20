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
}
