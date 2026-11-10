<?php
/**
 * WooCommerce product configuration and metadata manager for Taktik Gun Builder.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Product_Config
 *
 * Handles WooCommerce product editor fields, data persistence, and validation.
 */
class TGB_Product_Config {

	// Metadata Keys.
	const META_ENABLED                 = '_tgb_enabled';
	const META_READY                   = '_tgb_ready';
	const META_ROLE                    = '_tgb_role';
	const META_REFERENCE_MM            = '_tgb_reference_mm';
	const META_CATEGORY_POLICY         = '_tgb_category_policy';
	const META_ALLOWED_CATEGORIES      = '_tgb_allowed_categories';
	const META_ALLOWED_RAIL_POSITIONS  = '_tgb_allowed_rail_positions';
	const META_RAIL_INPUT_INTERFACES   = '_tgb_rail_input_interfaces';
	const META_RAIL_OUTPUT_INTERFACES  = '_tgb_rail_output_interfaces';
	const META_RAIL_POSITIONS          = '_tgb_rail_supported_positions';
	const META_PART_POSITIONS          = '_tgb_part_mount_positions';

	// Allowed Roles.
	const ROLE_BASE_GUN = 'base_gun';
	const ROLE_PART     = 'part';
	const ROLE_RAIL     = 'rail';

	// Category Policy Options.
	const POLICY_ALL      = 'all';
	const POLICY_SELECTED = 'selected';

	/**
	 * Initialize product configuration hooks.
	 */
	public static function init() {
		// WooCommerce Product Data Tab & Panel.
		add_filter( 'woocommerce_product_data_tabs', array( __CLASS__, 'add_product_data_tab' ) );
		add_action( 'woocommerce_product_data_panels', array( __CLASS__, 'render_product_data_panel' ) );
		// Hook save at priority 25 to run after WC_Meta_Box_Product_Images::save (priority 20).
		add_action( 'woocommerce_process_product_meta', array( __CLASS__, 'save_product_data' ), 25, 2 );

		// Admin notice handler for validation errors.
		add_action( 'admin_notices', array( __CLASS__, 'display_admin_notices' ) );

		// Enqueue admin assets only on product edit screens.
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_admin_assets' ) );
	}

	/**
	 * Enqueue admin script and styles strictly on WooCommerce product edit screens.
	 *
	 * @param string $hook_suffix Current admin page hook.
	 */
	public static function enqueue_admin_assets( $hook_suffix ) {
		if ( ! in_array( $hook_suffix, array( 'post.php', 'post-new.php' ), true ) ) {
			return;
		}

		$screen = get_current_screen();
		if ( ! $screen || 'product' !== $screen->post_type ) {
			return;
		}

		wp_enqueue_style(
			'tgb-admin-css',
			TGB_PLUGIN_URL . 'assets/css/gun-builder-admin.css',
			array(),
			TGB_VERSION
		);

		wp_enqueue_script(
			'tgb-admin-js',
			TGB_PLUGIN_URL . 'assets/js/gun-builder-admin.js',
			array( 'jquery' ),
			TGB_VERSION,
			true
		);
	}

	/**
	 * Registers the "Gun Builder" tab in WooCommerce Product data panel.
	 *
	 * @param array $tabs Existing product data tabs.
	 * @return array Modified tabs.
	 */
	public static function add_product_data_tab( $tabs ) {
		$tabs['tgb_gun_builder'] = array(
			'label'    => __( 'Gun Builder', 'part-selector' ),
			'target'   => 'tgb_gun_builder_data',
			'class'    => array( 'show_if_simple', 'show_if_variable' ),
			'priority' => 75,
		);
		return $tabs;
	}

	/**
	 * Renders the Gun Builder fields inside the WooCommerce Product data panel.
	 */
	public static function render_product_data_panel() {
		global $post;
		$product_id = $post ? $post->ID : 0;

		$enabled      = get_post_meta( $product_id, self::META_ENABLED, true );
		$ready        = get_post_meta( $product_id, self::META_READY, true );
		$role         = get_post_meta( $product_id, self::META_ROLE, true );
		$reference_mm = get_post_meta( $product_id, self::META_REFERENCE_MM, true );

		$category_policy        = self::get_category_policy( $product_id );
		$allowed_categories     = self::get_allowed_categories( $product_id );
		$allowed_rail_positions = self::get_allowed_rail_positions( $product_id );

		$current_part_type = TGB_Part_Types::get_product_part_type( $product_id );
		$current_term_id   = $current_part_type ? $current_part_type->term_id : 0;
		$available_types   = TGB_Part_Types::get_all_types();
		?>
		<div id="tgb_gun_builder_data" class="panel woocommerce_options_panel hidden">
			<?php wp_nonce_field( 'tgb_save_product_config', 'tgb_product_config_nonce' ); ?>

			<div class="options_group">
				<p class="form-field">
					<strong><?php esc_html_e( 'Gun Builder Configuration', 'part-selector' ); ?></strong>
					<span class="description" style="display: block; margin-top: 4px;">
						<?php esc_html_e( 'Configure participation, structural role, and reference dimensions for the interactive 2D Gun Builder.', 'part-selector' ); ?>
					</span>
				</p>

				<?php
				// 1. Builder Enabled.
				woocommerce_wp_checkbox(
					array(
						'id'          => self::META_ENABLED,
						'value'       => $enabled,
						'label'       => __( 'Enable in Gun Builder', 'part-selector' ),
						'description' => __( 'Allow this product to be available in the Gun Builder catalog.', 'part-selector' ),
					)
				);

				// 2. Builder Ready.
				woocommerce_wp_checkbox(
					array(
						'id'          => self::META_READY,
						'value'       => $ready,
						'label'       => __( 'Builder Ready', 'part-selector' ),
						'description' => __( 'Confirm configuration is complete and approved. Requires valid role and measurements.', 'part-selector' ),
					)
				);

				// 3. Builder Role.
				woocommerce_wp_select(
					array(
						'id'          => self::META_ROLE,
						'value'       => $role,
						'label'       => __( 'Builder Role', 'part-selector' ),
						'options'     => array(
							''                  => __( '-- Not Configured --', 'part-selector' ),
							self::ROLE_BASE_GUN => __( 'Base Gun', 'part-selector' ),
							self::ROLE_PART     => __( 'Part', 'part-selector' ),
							self::ROLE_RAIL     => __( 'Rail', 'part-selector' ),
						),
						'description' => __( 'Choose whether this product is a base weapon, an attachable part, or a mounting rail adapter.', 'part-selector' ),
					)
				);
				?>

				<!-- 4. Product Categories (Part Role: Automatic grouping via native WooCommerce taxonomy) -->
				<p class="form-field tgb-part-type-row" id="tgb_part_type_row">
					<label><?php esc_html_e( 'Product Categories', 'part-selector' ); ?></label>
					<span class="tgb-assigned-categories" style="display: inline-block; padding: 7px 0;">
						<?php
						$assigned_cats = wp_get_post_terms( $product_id, 'product_cat', array( 'fields' => 'names' ) );
						if ( ! empty( $assigned_cats ) && ! is_wp_error( $assigned_cats ) ) {
							echo '<strong>' . esc_html( implode( ', ', $assigned_cats ) ) . '</strong>';
						} else {
							echo '<em style="color: #d63638;">' . esc_html__( 'No categories assigned yet. Please assign at least one category in the Product categories box.', 'part-selector' ) . '</em>';
						}
						?>
					</span>
					<span class="description" style="display: block; margin-top: 4px;">
						<?php esc_html_e( 'Gun Builder component grouping is automatically derived from the standard WooCommerce Product Categories assigned to this product.', 'part-selector' ); ?>
					</span>
				</p>

				<?php
				// 5. Visual Reference Length (mm).
				woocommerce_wp_text_input(
					array(
						'id'                => self::META_REFERENCE_MM,
						'value'             => $reference_mm,
						'label'             => __( 'Visual Reference Length (mm)', 'part-selector' ),
						'placeholder'       => 'e.g. 780',
						'type'              => 'text',
						'desc_tip'          => true,
						'description'       => __( 'Real-world horizontal length in millimetres as shown in the builder image. Numbers only, no unit suffixes.', 'part-selector' ),
					)
				);
				?>

				<!-- 6. Component Category Availability (Conditional on Role = Base Gun) -->
				<div id="tgb_base_gun_categories_section" class="tgb-mounting-section" style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
					<p class="form-field">
						<strong><?php esc_html_e( 'Component Category Availability', 'part-selector' ); ?></strong>
						<span class="description" style="display: block; margin-top: 4px;">
							<?php esc_html_e( 'Specify which WooCommerce product categories are permitted for this Base Gun. Mounting compatibility is checked separately.', 'part-selector' ); ?>
						</span>
					</p>

					<div class="tgb-mounting-content" style="padding: 0 20px 10px 162px;">
						<div class="tgb-category-policy-group">
							<div class="tgb-category-policy-row">
								<label class="tgb-category-policy-label">
									<input type="radio" name="tgb_category_policy" value="<?php echo esc_attr( self::POLICY_ALL ); ?>" <?php checked( $category_policy, self::POLICY_ALL ); ?> />
									<span class="tgb-category-policy-title"><?php esc_html_e( 'All eligible categories', 'part-selector' ); ?></span>
									<span class="tgb-category-policy-desc"><?php esc_html_e( '(No category restrictions; all mount-compatible builder parts are available)', 'part-selector' ); ?></span>
								</label>
							</div>
							<div class="tgb-category-policy-row">
								<label class="tgb-category-policy-label">
									<input type="radio" name="tgb_category_policy" value="<?php echo esc_attr( self::POLICY_SELECTED ); ?>" <?php checked( $category_policy, self::POLICY_SELECTED ); ?> />
									<span class="tgb-category-policy-title"><?php esc_html_e( 'Selected categories only', 'part-selector' ); ?></span>
									<span class="tgb-category-policy-desc"><?php esc_html_e( '(Only parts in selected categories or their descendants will be shown)', 'part-selector' ); ?></span>
								</label>
							</div>
						</div>

						<div id="tgb_allowed_categories_container" style="<?php echo ( self::POLICY_SELECTED === $category_policy ) ? '' : 'display: none;'; ?>">
							<div class="tgb-category-search-wrap">
								<input type="text" id="tgb_category_search_input" class="regular-text" placeholder="<?php esc_attr_e( 'Search categories...', 'part-selector' ); ?>" />
							</div>
							<div class="tgb-category-tree-box">
								<?php self::render_category_checklist( $allowed_categories ); ?>
							</div>
							<span class="description tgb-category-tree-desc">
								<?php esc_html_e( 'Selecting a parent category dynamically includes its descendants. Individual subcategories can also be selected independently.', 'part-selector' ); ?>
							</span>
						</div>
					</div>
				</div>

				<!-- 7. Base Gun Mounting Points (Conditional on Role = Base Gun) -->
				<div id="tgb_base_gun_mounting_section" class="tgb-mounting-section" style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
					<p class="form-field">
						<strong><?php esc_html_e( 'Base Platform Mount Points', 'part-selector' ); ?></strong>
						<span class="description" style="display: block; margin-top: 4px;">
							<?php esc_html_e( 'Define attachment positions in millimetres (1 mm = 1 logical px) relative to the top-left (0,0) of the weapon builder image.', 'part-selector' ); ?>
						</span>
					</p>

					<?php
					$available_interfaces = TGB_Mount_Interfaces::get_all_interfaces();
					$base_mount_points    = TGB_Mounting::get_base_mount_points( $product_id );
					?>

					<div style="padding: 0 20px 20px 162px;">
						<?php if ( empty( $available_interfaces ) ) : ?>
							<p class="notice notice-warning inline" style="margin-bottom: 15px; padding: 10px;">
								<?php
								printf(
									/* translators: %s: URL to mount interfaces admin screen */
									wp_kses_post( __( 'No Mount Interfaces found. <a href="%s" target="_blank">Create Mount Interfaces under Products → Gun Builder Mount Interfaces</a> first.', 'part-selector' ) ),
									esc_url( admin_url( 'edit-tags.php?taxonomy=' . TGB_Mount_Interfaces::TAXONOMY . '&post_type=product' ) )
								);
								?>
							</p>
						<?php endif; ?>

						<table class="widefat tgb-mount-points-table" id="tgb_mount_points_table" style="max-width: 850px; margin-bottom: 10px;">
							<thead>
								<tr>
									<th style="width: 26%;"><?php esc_html_e( 'Label / Location', 'part-selector' ); ?></th>
									<th style="width: 24%;"><?php esc_html_e( 'Mount Interface', 'part-selector' ); ?></th>
									<th style="width: 20%;"><?php esc_html_e( 'Position', 'part-selector' ); ?></th>
									<th style="width: 12%;"><?php esc_html_e( 'Local X (mm)', 'part-selector' ); ?></th>
									<th style="width: 12%;"><?php esc_html_e( 'Local Y (mm)', 'part-selector' ); ?></th>
									<th style="width: 6%; text-align: center;"><?php esc_html_e( 'Action', 'part-selector' ); ?></th>
								</tr>
							</thead>
							<tbody>
								<?php if ( ! empty( $base_mount_points ) ) : ?>
									<?php foreach ( $base_mount_points as $idx => $pt ) : ?>
										<tr class="tgb-mount-point-row">
											<td>
												<input type="hidden" name="tgb_mount_points[<?php echo esc_attr( $idx ); ?>][id]" value="<?php echo esc_attr( $pt['id'] ); ?>" />
												<input type="text" name="tgb_mount_points[<?php echo esc_attr( $idx ); ?>][label]" value="<?php echo esc_attr( $pt['label'] ); ?>" placeholder="<?php esc_attr_e( 'e.g. Top Rail Rear', 'part-selector' ); ?>" style="width: 100%;" />
											</td>
											<td>
												<select name="tgb_mount_points[<?php echo esc_attr( $idx ); ?>][interface_id]" style="width: 100%;">
													<option value="0"><?php esc_html_e( '-- Select Interface --', 'part-selector' ); ?></option>
													<?php foreach ( $available_interfaces as $iface ) : ?>
														<option value="<?php echo esc_attr( $iface->term_id ); ?>" <?php selected( $pt['interface']['id'], $iface->term_id ); ?>>
															<?php echo esc_html( $iface->name ); ?>
														</option>
													<?php endforeach; ?>
												</select>
											</td>
											<td>
												<select name="tgb_mount_points[<?php echo esc_attr( $idx ); ?>][position]" style="width: 100%;">
													<option value="unspecified" <?php selected( $pt['position'], 'unspecified' ); ?>><?php esc_html_e( '-- Unspecified --', 'part-selector' ); ?></option>
													<option value="top" <?php selected( $pt['position'], 'top' ); ?>><?php esc_html_e( 'Top', 'part-selector' ); ?></option>
													<option value="bottom" <?php selected( $pt['position'], 'bottom' ); ?>><?php esc_html_e( 'Bottom', 'part-selector' ); ?></option>
													<option value="muzzle" <?php selected( $pt['position'], 'muzzle' ); ?>><?php esc_html_e( 'Muzzle', 'part-selector' ); ?></option>
												</select>
											</td>
											<td>
												<input type="number" step="any" min="0" name="tgb_mount_points[<?php echo esc_attr( $idx ); ?>][x]" value="<?php echo esc_attr( $pt['x'] ); ?>" placeholder="0" style="width: 100%;" />
											</td>
											<td>
												<input type="number" step="any" min="0" name="tgb_mount_points[<?php echo esc_attr( $idx ); ?>][y]" value="<?php echo esc_attr( $pt['y'] ); ?>" placeholder="0" style="width: 100%;" />
											</td>
											<td style="text-align: center; vertical-align: middle;">
												<button type="button" class="button tgb-remove-mount-point" title="<?php esc_attr_e( 'Remove Mount Point', 'part-selector' ); ?>">&times;</button>
											</td>
										</tr>
									<?php endforeach; ?>
								<?php endif; ?>
							</tbody>
						</table>

						<button type="button" class="button button-secondary" id="tgb_add_mount_point_btn" <?php disabled( empty( $available_interfaces ) ); ?>>
							<?php esc_html_e( '+ Add Mount Point', 'part-selector' ); ?>
						</button>
					</div>
				</div>

				<!-- 8. Optional Additional Rail Positions (Conditional on Role = Base Gun) -->
				<div id="tgb_base_gun_rails_section" class="tgb-mounting-section" style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
					<p class="form-field">
						<strong><?php esc_html_e( 'Optional Additional Rail Positions', 'part-selector' ); ?></strong>
						<span class="description" style="display: block; margin-top: 4px;">
							<?php esc_html_e( 'Allow each Base Gun to declare whether optional rails may be installed at the top or bottom in a future phase.', 'part-selector' ); ?>
						</span>
					</p>

					<div class="tgb-mounting-content" style="padding: 0 20px 20px 162px;">
						<p class="tgb-rail-heading">
							<strong><?php esc_html_e( 'Allow Additional Rails At:', 'part-selector' ); ?></strong>
						</p>
						<div class="tgb-rail-positions-group">
							<label class="tgb-rail-position-label">
								<input type="checkbox" name="tgb_allowed_rail_positions[]" value="top" <?php checked( in_array( 'top', $allowed_rail_positions, true ) ); ?> />
								<span class="tgb-rail-position-text"><?php esc_html_e( 'Top', 'part-selector' ); ?></span>
							</label>
							<label class="tgb-rail-position-label">
								<input type="checkbox" name="tgb_allowed_rail_positions[]" value="bottom" <?php checked( in_array( 'bottom', $allowed_rail_positions, true ) ); ?> />
								<span class="tgb-rail-position-text"><?php esc_html_e( 'Bottom', 'part-selector' ); ?></span>
							</label>
						</div>
						<span class="description tgb-rail-desc">
							<?php esc_html_e( 'Controls future purchasable rail accessory compatibility. Built-in rails are configured above under Base Platform Mount Points.', 'part-selector' ); ?>
						</span>
					</div>
				</div>

				<!-- 9. Part Mounting (Conditional on Role = Part) -->
				<div id="tgb_part_mounting_section" class="tgb-mounting-section" style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
					<p class="form-field">
						<strong><?php esc_html_e( 'Part Mounting & Attachment Anchor', 'part-selector' ); ?></strong>
						<span class="description" style="display: block; margin-top: 4px;">
							<?php esc_html_e( 'Specify which mount standards this component accepts and the visual anchor point on its image that docks to the weapon mount.', 'part-selector' ); ?>
						</span>
					</p>

					<!-- Accepted Interfaces -->
					<div class="form-field" style="padding: 10px 20px 10px 162px;">
						<label style="width: 150px; margin-left: -162px; float: left;"><?php esc_html_e( 'Accepted Interfaces', 'part-selector' ); ?></label>
						<?php
						$current_part_interfaces = TGB_Mount_Interfaces::get_product_interfaces( $product_id );
						$current_interface_ids   = wp_list_pluck( $current_part_interfaces, 'term_id' );
						?>

						<?php if ( ! empty( $available_interfaces ) ) : ?>
							<div class="tgb-interfaces-checkbox-group" style="display: flex; flex-wrap: wrap; gap: 10px; max-width: 600px;">
								<?php foreach ( $available_interfaces as $iface ) : ?>
									<label style="display: inline-flex; align-items: center; gap: 4px; font-weight: normal; margin-right: 15px;">
										<input type="checkbox" name="tgb_mount_interfaces[]" value="<?php echo esc_attr( $iface->term_id ); ?>" <?php checked( in_array( $iface->term_id, $current_interface_ids, true ) ); ?> />
										<?php echo esc_html( $iface->name ); ?>
									</label>
								<?php endforeach; ?>
							</div>
							<span class="description" style="display: block; margin-top: 6px;">
								<?php esc_html_e( 'Select all physical mounting interfaces compatible with this component (e.g. M-LOK, Picatinny).', 'part-selector' ); ?>
							</span>
						<?php else : ?>
							<p class="description">
								<?php
								printf(
									/* translators: %s: URL to mount interfaces admin screen */
									wp_kses_post( __( '<a href="%s" target="_blank">Create Mount Interfaces under Products → Gun Builder Mount Interfaces</a>.', 'part-selector' ) ),
									esc_url( admin_url( 'edit-tags.php?taxonomy=' . TGB_Mount_Interfaces::TAXONOMY . '&post_type=product' ) )
								);
								?>
							</p>
						<?php endif; ?>
					</div>

					<?php
					$anchor_data = TGB_Mounting::get_part_anchor( $product_id );
					$anchor_x    = $anchor_data ? $anchor_data['x_percent'] : get_post_meta( $product_id, TGB_Mounting::META_ANCHOR_X, true );
					$anchor_y    = $anchor_data ? $anchor_data['y_percent'] : get_post_meta( $product_id, TGB_Mounting::META_ANCHOR_Y, true );

					// Attachment Anchor X (%).
					woocommerce_wp_text_input(
						array(
							'id'                => TGB_Mounting::META_ANCHOR_X,
							'value'             => $anchor_x,
							'label'             => __( 'Attachment Anchor X (%)', 'part-selector' ),
							'placeholder'       => 'e.g. 50',
							'type'              => 'text',
							'desc_tip'          => true,
							'description'       => __( 'Horizontal percentage across the component image representing the attachment point (0% = left edge, 50% = center, 100% = right edge).', 'part-selector' ),
						)
					);

					// Attachment Anchor Y (%).
					woocommerce_wp_text_input(
						array(
							'id'                => TGB_Mounting::META_ANCHOR_Y,
							'value'             => $anchor_y,
							'label'             => __( 'Attachment Anchor Y (%)', 'part-selector' ),
							'placeholder'       => 'e.g. 100',
							'type'              => 'text',
							'desc_tip'          => true,
							'description'       => __( 'Vertical percentage across the component image representing the attachment point (0% = top edge, 50% = center, 100% = bottom edge).', 'part-selector' ),
						)
					);
					?>

					<!-- Optional Part Mount Positions -->
					<div class="form-field" style="padding: 10px 20px 10px 162px;">
						<label style="width: 150px; margin-left: -162px; float: left;"><?php esc_html_e( 'Allowed Positions (Optional)', 'part-selector' ); ?></label>
						<?php
						$current_part_positions = self::get_part_mount_positions( $product_id );
						?>
						<div class="tgb-part-positions-group" style="display: flex; flex-wrap: wrap; gap: 15px; max-width: 600px;">
							<label style="display: inline-flex; align-items: center; gap: 4px; font-weight: normal; cursor: pointer;">
								<input type="checkbox" name="tgb_part_mount_positions[]" value="top" <?php checked( in_array( 'top', $current_part_positions, true ) ); ?> />
								<span><?php esc_html_e( 'Top', 'part-selector' ); ?></span>
							</label>
							<label style="display: inline-flex; align-items: center; gap: 4px; font-weight: normal; cursor: pointer;">
								<input type="checkbox" name="tgb_part_mount_positions[]" value="bottom" <?php checked( in_array( 'bottom', $current_part_positions, true ) ); ?> />
								<span><?php esc_html_e( 'Bottom', 'part-selector' ); ?></span>
							</label>
							<label style="display: inline-flex; align-items: center; gap: 4px; font-weight: normal; cursor: pointer;">
								<input type="checkbox" name="tgb_part_mount_positions[]" value="muzzle" <?php checked( in_array( 'muzzle', $current_part_positions, true ) ); ?> />
								<span><?php esc_html_e( 'Muzzle', 'part-selector' ); ?></span>
							</label>
						</div>
						<span class="description" style="display: block; margin-top: 6px;">
							<?php esc_html_e( 'Leave all unchecked for unrestricted compatibility across any mount position. Check specific positions if this component can only attach at Top, Bottom, or Muzzle.', 'part-selector' ); ?>
						</span>
					</div>
				</div>

				<!-- 10. Rail Configuration (Conditional on Role = Rail) -->
				<div id="tgb_rail_configuration_section" class="tgb-mounting-section" style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
					<p class="form-field">
						<strong><?php esc_html_e( 'Rail Accessory Configuration', 'part-selector' ); ?></strong>
						<span class="description" style="display: block; margin-top: 4px;">
							<?php esc_html_e( 'Configure input mounting standards (what the rail attaches to), output standards (what the rail provides), and physical positions.', 'part-selector' ); ?>
						</span>
					</p>

					<?php
					$rail_input_ifaces  = self::get_rail_input_interfaces( $product_id );
					$rail_output_ifaces = self::get_rail_output_interfaces( $product_id );
					$rail_positions     = self::get_rail_supported_positions( $product_id );
					?>

					<!-- Rail Input Interfaces -->
					<div class="form-field" style="padding: 10px 20px 10px 162px;">
						<label style="width: 150px; margin-left: -162px; float: left;"><?php esc_html_e( 'Input Interfaces', 'part-selector' ); ?></label>
						<?php if ( ! empty( $available_interfaces ) ) : ?>
							<div class="tgb-interfaces-checkbox-group" style="display: flex; flex-wrap: wrap; gap: 10px; max-width: 600px;">
								<?php foreach ( $available_interfaces as $iface ) : ?>
									<label style="display: inline-flex; align-items: center; gap: 4px; font-weight: normal; margin-right: 15px; cursor: pointer;">
										<input type="checkbox" name="tgb_rail_input_interfaces[]" value="<?php echo esc_attr( $iface->term_id ); ?>" <?php checked( in_array( $iface->term_id, $rail_input_ifaces, true ) ); ?> />
										<?php echo esc_html( $iface->name ); ?>
									</label>
								<?php endforeach; ?>
							</div>
							<span class="description" style="display: block; margin-top: 6px;">
								<?php esc_html_e( 'Select mounting interfaces this rail accepts/attaches to on the Base Gun (e.g. M-LOK). Any matching interface allows installation.', 'part-selector' ); ?>
							</span>
						<?php else : ?>
							<p class="description"><?php esc_html_e( 'No Mount Interfaces found.', 'part-selector' ); ?></p>
						<?php endif; ?>
					</div>

					<!-- Rail Output Interfaces -->
					<div class="form-field" style="padding: 10px 20px 10px 162px;">
						<label style="width: 150px; margin-left: -162px; float: left;"><?php esc_html_e( 'Output Interfaces', 'part-selector' ); ?></label>
						<?php if ( ! empty( $available_interfaces ) ) : ?>
							<div class="tgb-interfaces-checkbox-group" style="display: flex; flex-wrap: wrap; gap: 10px; max-width: 600px;">
								<?php foreach ( $available_interfaces as $iface ) : ?>
									<label style="display: inline-flex; align-items: center; gap: 4px; font-weight: normal; margin-right: 15px; cursor: pointer;">
										<input type="checkbox" name="tgb_rail_output_interfaces[]" value="<?php echo esc_attr( $iface->term_id ); ?>" <?php checked( in_array( $iface->term_id, $rail_output_ifaces, true ) ); ?> />
										<?php echo esc_html( $iface->name ); ?>
									</label>
								<?php endforeach; ?>
							</div>
							<span class="description" style="display: block; margin-top: 6px;">
								<?php esc_html_e( 'Select mounting interfaces this rail provides once installed (e.g. Picatinny). All configured outputs become available.', 'part-selector' ); ?>
							</span>
						<?php else : ?>
							<p class="description"><?php esc_html_e( 'No Mount Interfaces found.', 'part-selector' ); ?></p>
						<?php endif; ?>
					</div>

					<!-- Supported Positions -->
					<div class="form-field" style="padding: 10px 20px 10px 162px;">
						<label style="width: 150px; margin-left: -162px; float: left;"><?php esc_html_e( 'Supported Positions', 'part-selector' ); ?></label>
						<div class="tgb-rail-positions-group" style="display: flex; flex-wrap: wrap; gap: 15px; max-width: 600px;">
							<label style="display: inline-flex; align-items: center; gap: 4px; font-weight: normal; cursor: pointer;">
								<input type="checkbox" name="tgb_rail_supported_positions[]" value="top" <?php checked( in_array( 'top', $rail_positions, true ) ); ?> />
								<span><?php esc_html_e( 'Top', 'part-selector' ); ?></span>
							</label>
							<label style="display: inline-flex; align-items: center; gap: 4px; font-weight: normal; cursor: pointer;">
								<input type="checkbox" name="tgb_rail_supported_positions[]" value="bottom" <?php checked( in_array( 'bottom', $rail_positions, true ) ); ?> />
								<span><?php esc_html_e( 'Bottom', 'part-selector' ); ?></span>
							</label>
						</div>
						<span class="description" style="display: block; margin-top: 6px;">
							<?php esc_html_e( 'Select which physical positions this rail supports on compatible Base Guns (Top, Bottom, or Both).', 'part-selector' ); ?>
						</span>
					</div>
				</div>

				<!-- Mount Point Row Template for JS Cloning -->
				<script type="text/template" id="tgb_mount_point_template">
					<tr class="tgb-mount-point-row">
						<td>
							<input type="hidden" name="tgb_mount_points[{{INDEX}}][id]" value="{{ID}}" />
							<input type="text" name="tgb_mount_points[{{INDEX}}][label]" value="" placeholder="<?php esc_attr_e( 'e.g. Top Rail Rear', 'part-selector' ); ?>" style="width: 100%;" />
						</td>
						<td>
							<select name="tgb_mount_points[{{INDEX}}][interface_id]" style="width: 100%;">
								<option value="0"><?php esc_html_e( '-- Select Interface --', 'part-selector' ); ?></option>
								<?php foreach ( $available_interfaces as $iface ) : ?>
									<option value="<?php echo esc_attr( $iface->term_id ); ?>">
										<?php echo esc_html( $iface->name ); ?>
									</option>
								<?php endforeach; ?>
							</select>
						</td>
						<td>
							<select name="tgb_mount_points[{{INDEX}}][position]" style="width: 100%;">
								<option value="unspecified"><?php esc_html_e( '-- Unspecified --', 'part-selector' ); ?></option>
								<option value="top"><?php esc_html_e( 'Top', 'part-selector' ); ?></option>
								<option value="bottom"><?php esc_html_e( 'Bottom', 'part-selector' ); ?></option>
								<option value="muzzle"><?php esc_html_e( 'Muzzle', 'part-selector' ); ?></option>
							</select>
						</td>
						<td>
							<input type="number" step="any" min="0" name="tgb_mount_points[{{INDEX}}][x]" value="0" placeholder="0" style="width: 100%;" />
						</td>
						<td>
							<input type="number" step="any" min="0" name="tgb_mount_points[{{INDEX}}][y]" value="0" placeholder="0" style="width: 100%;" />
						</td>
						<td style="text-align: center; vertical-align: middle;">
							<button type="button" class="button tgb-remove-mount-point" title="<?php esc_attr_e( 'Remove Mount Point', 'part-selector' ); ?>">&times;</button>
						</td>
					</tr>
				</script>
			</div>
		</div>
		<?php
	}

	/**
	 * Strictly validates and normalizes a visual reference length input in millimetres.
	 *
	 * Must be a positive decimal or integer number (e.g. 780, 140.5, 0.5).
	 * Rejects units (e.g. 14cm, 780mm), negative numbers, zero, text, or malformed input.
	 *
	 * @param mixed $raw_value Raw input value.
	 * @return string Normalized positive decimal string if valid, or '' if invalid.
	 */
	public static function sanitize_reference_mm( $raw_value ) {
		if ( ! is_string( $raw_value ) && ! is_numeric( $raw_value ) ) {
			return '';
		}

		$trimmed = trim( (string) $raw_value );

		// Strictly match positive numbers with optional decimal part (e.g. 780, 140.5, 0.5).
		if ( ! preg_match( '/^\d+(\.\d+)?$/', $trimmed ) ) {
			return '';
		}

		$float_val = (float) $trimmed;
		if ( $float_val <= 0.0 ) {
			return '';
		}

		// Return normalized decimal representation (no unit text, no exponential notation).
		return (string) $float_val;
	}

	/**
	 * Saves Gun Builder configuration metadata and manages taxonomy relationships.
	 *
	 * @param int     $post_id Post ID.
	 * @param WP_Post $post    Post object.
	 */
	public static function save_product_data( $post_id, $post ) {
		// 1. Permission and nonce checks.
		$post_id = absint( $post_id );
		if ( $post_id <= 0 ) {
			return;
		}

		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}

		if ( wp_is_post_revision( $post_id ) ) {
			return;
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		if ( ! isset( $_POST['tgb_product_config_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['tgb_product_config_nonce'] ) ), 'tgb_save_product_config' ) ) {
			return;
		}

		// 2. Sanitize Builder Enabled (independent of Ready and configuration validity).
		$enabled_val = isset( $_POST[ self::META_ENABLED ] ) ? 'yes' : 'no';
		update_post_meta( $post_id, self::META_ENABLED, $enabled_val );

		// 3. Role validation.
		$submitted_role = isset( $_POST[ self::META_ROLE ] ) ? sanitize_key( wp_unslash( $_POST[ self::META_ROLE ] ) ) : '';
		$valid_role     = in_array( $submitted_role, array( self::ROLE_BASE_GUN, self::ROLE_PART, self::ROLE_RAIL ), true ) ? $submitted_role : '';
		update_post_meta( $post_id, self::META_ROLE, $valid_role );

		// 4. Strict Reference measurement validation (must be positive decimal, no unit suffixes).
		$raw_mm_input     = isset( $_POST[ self::META_REFERENCE_MM ] ) ? wp_unslash( $_POST[ self::META_REFERENCE_MM ] ) : '';
		$reference_mm_val = self::sanitize_reference_mm( $raw_mm_input );
		update_post_meta( $post_id, self::META_REFERENCE_MM, $reference_mm_val );

		// 5. Taxonomy assignment and configuration based on Role.
		$part_type_id = isset( $_POST['tgb_part_type_id'] ) ? absint( $_POST['tgb_part_type_id'] ) : 0;

		$valid_rail_inputs    = array();
		$valid_rail_outputs   = array();
		$valid_rail_positions = array();

		if ( self::ROLE_PART === $valid_role ) {
			if ( $part_type_id > 0 && term_exists( $part_type_id, TGB_Part_Types::TAXONOMY ) ) {
				// Assign term if submitted (legacy support).
				wp_set_object_terms( $post_id, array( $part_type_id ), TGB_Part_Types::TAXONOMY, false );
			}
			// Note: Existing tgb_part_type terms are preserved for backward compatibility.

			// Save Part Accepted Mount Interfaces (tgb_mount_interface taxonomy).
			$raw_interfaces = isset( $_POST['tgb_mount_interfaces'] ) && is_array( $_POST['tgb_mount_interfaces'] )
				? array_map( 'absint', $_POST['tgb_mount_interfaces'] )
				: array();
			$valid_interfaces = array();
			foreach ( $raw_interfaces as $iface_id ) {
				if ( $iface_id > 0 && term_exists( $iface_id, TGB_Mount_Interfaces::TAXONOMY ) ) {
					$valid_interfaces[] = $iface_id;
				}
			}
			wp_set_object_terms( $post_id, $valid_interfaces, TGB_Mount_Interfaces::TAXONOMY, false );

			// Save Part Attachment Anchor percentages.
			$raw_anchor_x = isset( $_POST[ TGB_Mounting::META_ANCHOR_X ] ) ? wp_unslash( $_POST[ TGB_Mounting::META_ANCHOR_X ] ) : '';
			$raw_anchor_y = isset( $_POST[ TGB_Mounting::META_ANCHOR_Y ] ) ? wp_unslash( $_POST[ TGB_Mounting::META_ANCHOR_Y ] ) : '';
			$anchor_x_val = TGB_Mounting::sanitize_anchor_percent( $raw_anchor_x );
			$anchor_y_val = TGB_Mounting::sanitize_anchor_percent( $raw_anchor_y );
			update_post_meta( $post_id, TGB_Mounting::META_ANCHOR_X, $anchor_x_val );
			update_post_meta( $post_id, TGB_Mounting::META_ANCHOR_Y, $anchor_y_val );

			// Save Part Mount Positions (optional).
			$raw_part_positions = isset( $_POST['tgb_part_mount_positions'] ) && is_array( $_POST['tgb_part_mount_positions'] )
				? $_POST['tgb_part_mount_positions']
				: array();
			$valid_part_positions = array();
			foreach ( $raw_part_positions as $ppos ) {
				$ppos = sanitize_key( $ppos );
				if ( in_array( $ppos, array( 'top', 'bottom', 'muzzle' ), true ) ) {
					$valid_part_positions[] = $ppos;
				}
			}
			update_post_meta( $post_id, self::META_PART_POSITIONS, array_values( array_unique( $valid_part_positions ) ) );

			// Clear Base Gun and Rail metadata.
			delete_post_meta( $post_id, TGB_Mounting::META_MOUNT_POINTS );
			delete_post_meta( $post_id, self::META_CATEGORY_POLICY );
			delete_post_meta( $post_id, self::META_ALLOWED_CATEGORIES );
			delete_post_meta( $post_id, self::META_ALLOWED_RAIL_POSITIONS );
			delete_post_meta( $post_id, self::META_RAIL_INPUT_INTERFACES );
			delete_post_meta( $post_id, self::META_RAIL_OUTPUT_INTERFACES );
			delete_post_meta( $post_id, self::META_RAIL_POSITIONS );

		} elseif ( self::ROLE_BASE_GUN === $valid_role ) {
			// For Base Gun, remove Part Mount Interface and Part Type terms.
			wp_set_object_terms( $post_id, array(), TGB_Part_Types::TAXONOMY, false );
			wp_set_object_terms( $post_id, array(), TGB_Mount_Interfaces::TAXONOMY, false );

			// Clear Part anchors and positions.
			delete_post_meta( $post_id, TGB_Mounting::META_ANCHOR_X );
			delete_post_meta( $post_id, TGB_Mounting::META_ANCHOR_Y );
			delete_post_meta( $post_id, self::META_PART_POSITIONS );
			delete_post_meta( $post_id, self::META_RAIL_INPUT_INTERFACES );
			delete_post_meta( $post_id, self::META_RAIL_OUTPUT_INTERFACES );
			delete_post_meta( $post_id, self::META_RAIL_POSITIONS );

			// Save Base Gun Mount Points.
			$raw_mount_points = isset( $_POST['tgb_mount_points'] ) && is_array( $_POST['tgb_mount_points'] )
				? $_POST['tgb_mount_points']
				: array();
			$base_max_w = ! empty( $reference_mm_val ) ? (float) $reference_mm_val : null;
			$sanitized_points = TGB_Mounting::sanitize_mount_points( $raw_mount_points, $base_max_w );
			update_post_meta( $post_id, TGB_Mounting::META_MOUNT_POINTS, wp_json_encode( $sanitized_points ) );

			// Save Base Gun Category Policy.
			$raw_policy      = isset( $_POST['tgb_category_policy'] ) ? sanitize_key( wp_unslash( $_POST['tgb_category_policy'] ) ) : self::POLICY_ALL;
			$category_policy = ( self::POLICY_SELECTED === $raw_policy ) ? self::POLICY_SELECTED : self::POLICY_ALL;
			update_post_meta( $post_id, self::META_CATEGORY_POLICY, $category_policy );

			// Save Base Gun Allowed Categories.
			$valid_allowed_cats = array();
			if ( self::POLICY_SELECTED === $category_policy ) {
				$raw_cats = isset( $_POST['tgb_allowed_categories'] ) && is_array( $_POST['tgb_allowed_categories'] )
					? $_POST['tgb_allowed_categories']
					: array();
				foreach ( $raw_cats as $cid ) {
					$cid = absint( $cid );
					if ( $cid > 0 && term_exists( $cid, 'product_cat' ) ) {
						$valid_allowed_cats[] = $cid;
					}
				}
				$valid_allowed_cats = array_values( array_unique( $valid_allowed_cats ) );
			}
			update_post_meta( $post_id, self::META_ALLOWED_CATEGORIES, $valid_allowed_cats );

			// Save Base Gun Allowed Rail Positions.
			$raw_rails   = isset( $_POST['tgb_allowed_rail_positions'] ) && is_array( $_POST['tgb_allowed_rail_positions'] )
				? $_POST['tgb_allowed_rail_positions']
				: array();
			$valid_rails = array();
			foreach ( $raw_rails as $rpos ) {
				$rpos = sanitize_key( $rpos );
				if ( in_array( $rpos, array( 'top', 'bottom' ), true ) ) {
					$valid_rails[] = $rpos;
				}
			}
			update_post_meta( $post_id, self::META_ALLOWED_RAIL_POSITIONS, array_values( array_unique( $valid_rails ) ) );

		} elseif ( self::ROLE_RAIL === $valid_role ) {
			// For Rail, remove Part Type and Part Mount Interface terms.
			wp_set_object_terms( $post_id, array(), TGB_Part_Types::TAXONOMY, false );
			wp_set_object_terms( $post_id, array(), TGB_Mount_Interfaces::TAXONOMY, false );

			// Clear Part anchors and positions.
			delete_post_meta( $post_id, TGB_Mounting::META_ANCHOR_X );
			delete_post_meta( $post_id, TGB_Mounting::META_ANCHOR_Y );
			delete_post_meta( $post_id, self::META_PART_POSITIONS );

			// Clear Base Gun metadata.
			delete_post_meta( $post_id, TGB_Mounting::META_MOUNT_POINTS );
			delete_post_meta( $post_id, self::META_CATEGORY_POLICY );
			delete_post_meta( $post_id, self::META_ALLOWED_CATEGORIES );
			delete_post_meta( $post_id, self::META_ALLOWED_RAIL_POSITIONS );

			// Save Rail Input Interfaces.
			$raw_rail_inputs = isset( $_POST['tgb_rail_input_interfaces'] ) && is_array( $_POST['tgb_rail_input_interfaces'] )
				? array_map( 'absint', $_POST['tgb_rail_input_interfaces'] )
				: array();
			foreach ( $raw_rail_inputs as $in_id ) {
				if ( $in_id > 0 && term_exists( $in_id, TGB_Mount_Interfaces::TAXONOMY ) ) {
					$valid_rail_inputs[] = $in_id;
				}
			}
			$valid_rail_inputs = array_values( array_unique( $valid_rail_inputs ) );
			update_post_meta( $post_id, self::META_RAIL_INPUT_INTERFACES, $valid_rail_inputs );

			// Save Rail Output Interfaces.
			$raw_rail_outputs = isset( $_POST['tgb_rail_output_interfaces'] ) && is_array( $_POST['tgb_rail_output_interfaces'] )
				? array_map( 'absint', $_POST['tgb_rail_output_interfaces'] )
				: array();
			foreach ( $raw_rail_outputs as $out_id ) {
				if ( $out_id > 0 && term_exists( $out_id, TGB_Mount_Interfaces::TAXONOMY ) ) {
					$valid_rail_outputs[] = $out_id;
				}
			}
			$valid_rail_outputs = array_values( array_unique( $valid_rail_outputs ) );
			update_post_meta( $post_id, self::META_RAIL_OUTPUT_INTERFACES, $valid_rail_outputs );

			// Save Rail Supported Positions.
			$raw_rail_positions = isset( $_POST['tgb_rail_supported_positions'] ) && is_array( $_POST['tgb_rail_supported_positions'] )
				? $_POST['tgb_rail_supported_positions']
				: array();
			foreach ( $raw_rail_positions as $rpos ) {
				$rpos = sanitize_key( $rpos );
				if ( in_array( $rpos, array( 'top', 'bottom' ), true ) ) {
					$valid_rail_positions[] = $rpos;
				}
			}
			$valid_rail_positions = array_values( array_unique( $valid_rail_positions ) );
			update_post_meta( $post_id, self::META_RAIL_POSITIONS, $valid_rail_positions );

		} else {
			// For unconfigured products, remove all builder taxonomy relationships and mounting metadata.
			wp_set_object_terms( $post_id, array(), TGB_Part_Types::TAXONOMY, false );
			wp_set_object_terms( $post_id, array(), TGB_Mount_Interfaces::TAXONOMY, false );
			delete_post_meta( $post_id, TGB_Mounting::META_ANCHOR_X );
			delete_post_meta( $post_id, TGB_Mounting::META_ANCHOR_Y );
			delete_post_meta( $post_id, self::META_PART_POSITIONS );
			delete_post_meta( $post_id, TGB_Mounting::META_MOUNT_POINTS );
			delete_post_meta( $post_id, self::META_CATEGORY_POLICY );
			delete_post_meta( $post_id, self::META_ALLOWED_CATEGORIES );
			delete_post_meta( $post_id, self::META_ALLOWED_RAIL_POSITIONS );
			delete_post_meta( $post_id, self::META_RAIL_INPUT_INTERFACES );
			delete_post_meta( $post_id, self::META_RAIL_OUTPUT_INTERFACES );
			delete_post_meta( $post_id, self::META_RAIL_POSITIONS );
		}

		// 6. Builder Ready validation.
		$requested_ready = isset( $_POST[ self::META_READY ] ) ? 'yes' : 'no';
		$user_id         = get_current_user_id();

		if ( 'yes' === $requested_ready ) {
			$errors = array();

			if ( empty( $valid_role ) ) {
				$errors[] = __( 'A Builder Role (Base Gun, Part, or Rail) must be selected.', 'part-selector' );
			}

			if ( empty( $reference_mm_val ) ) {
				if ( '' !== trim( (string) $raw_mm_input ) ) {
					$errors[] = __( 'Visual Reference Length must be a positive number in millimetres (e.g. 780 or 140.5). Units or invalid characters were rejected.', 'part-selector' );
				} else {
					$errors[] = __( 'A positive Visual Reference Length in millimetres is required.', 'part-selector' );
				}
			}

			// Validate Gallery Image exists and is a valid image attachment for both roles
			clean_post_cache( $post_id );
			$wc_prod     = wc_get_product( $post_id );
			$gallery_ids = $wc_prod ? $wc_prod->get_gallery_image_ids() : array();

			// Fallback: If in-memory product object is stale, check posted gallery IDs
			if ( empty( $gallery_ids ) && isset( $_POST['product_image_gallery'] ) ) {
				$gallery_ids = array_filter( array_map( 'absint', explode( ',', sanitize_text_field( wp_unslash( $_POST['product_image_gallery'] ) ) ) ) );
			}

			$first_attachment_id     = ! empty( $gallery_ids ) ? absint( reset( $gallery_ids ) ) : 0;
			$has_valid_gallery_image = false;

			if ( $first_attachment_id > 0 && wp_attachment_is_image( $first_attachment_id ) ) {
				$img_src = wp_get_attachment_image_src( $first_attachment_id, 'full' );
				if ( $img_src && ! empty( $img_src[0] ) && ! empty( $img_src[1] ) && ! empty( $img_src[2] ) ) {
					$has_valid_gallery_image = true;
				}
			}

			if ( ! $has_valid_gallery_image ) {
				$errors[] = __( 'Upload a prepared transparent image as the first Product Gallery image.', 'part-selector' );
			}

			if ( self::ROLE_PART === $valid_role ) {
				// V2 requirement: At least one native WooCommerce category
				$assigned_cats = wp_get_object_terms( $post_id, 'product_cat' );
				if ( empty( $assigned_cats ) || is_wp_error( $assigned_cats ) ) {
					$errors[] = __( 'A product category is required before this Part can appear in the builder.', 'part-selector' );
				}

				// V2 requirement: At least one accepted mounting interface
				$assigned_ifaces = wp_get_object_terms( $post_id, TGB_Mount_Interfaces::TAXONOMY );
				if ( empty( $assigned_ifaces ) || is_wp_error( $assigned_ifaces ) ) {
					$errors[] = __( 'Select at least one accepted mounting interface.', 'part-selector' );
				}
			} elseif ( self::ROLE_BASE_GUN === $valid_role ) {
				// Part 2 requirement: If Selected categories only is chosen, at least one category must be selected
				if ( self::POLICY_SELECTED === $category_policy && empty( $valid_allowed_cats ) ) {
					$errors[] = __( 'When "Selected categories only" is chosen, select at least one permitted category before marking Builder Ready.', 'part-selector' );
				}
			} elseif ( self::ROLE_RAIL === $valid_role ) {
				// Part 3A requirement: Rail readiness
				if ( empty( $valid_rail_inputs ) ) {
					$errors[] = __( 'Select at least one accepted input mounting interface for this Rail.', 'part-selector' );
				}
				if ( empty( $valid_rail_outputs ) ) {
					$errors[] = __( 'Select at least one output mounting interface for this Rail.', 'part-selector' );
				}
				if ( empty( $valid_rail_positions ) ) {
					$errors[] = __( 'Select at least one supported mounting position (Top or Bottom) for this Rail.', 'part-selector' );
				}
			}

			if ( ! empty( $errors ) ) {
				// Reject Ready = Yes; save as No and queue visible admin notice.
				update_post_meta( $post_id, self::META_READY, 'no' );
				set_transient(
					'tgb_ready_notice_' . $user_id . '_' . $post_id,
					implode( ' ', $errors ),
					60
				);
			} else {
				update_post_meta( $post_id, self::META_READY, 'yes' );
			}
		} else {
			update_post_meta( $post_id, self::META_READY, 'no' );

			// If user did not check Ready, but entered an invalid reference length, notify them of rejected input.
			if ( '' !== trim( (string) $raw_mm_input ) && empty( $reference_mm_val ) ) {
				set_transient(
					'tgb_ready_notice_' . $user_id . '_' . $post_id,
					__( 'Visual Reference Length was rejected. Please enter a positive number in millimetres (e.g. 780 or 140.5) without units.', 'part-selector' ),
					60
				);
			}
		}
	}

	/**
	 * Displays admin notices if Builder Ready validation failed or input was rejected during save.
	 */
	public static function display_admin_notices() {
		$user_id = get_current_user_id();
		$post_id = 0;

		if ( isset( $_GET['post'] ) ) {
			$post_id = absint( $_GET['post'] );
		} elseif ( ! empty( $GLOBALS['post']->ID ) ) {
			$post_id = $GLOBALS['post']->ID;
		}

		if ( ! $post_id ) {
			return;
		}

		$transient_key = 'tgb_ready_notice_' . $user_id . '_' . $post_id;
		$error_message = get_transient( $transient_key );

		if ( $error_message ) {
			delete_transient( $transient_key );
			?>
			<div class="notice notice-error is-dismissible">
				<p>
					<strong><?php esc_html_e( 'Gun Builder Configuration Notice:', 'part-selector' ); ?></strong>
					<?php echo esc_html( $error_message ); ?>
				</p>
			</div>
			<?php
		}
	}

	// =========================================================================
	// Configuration Inspection & Helper API (For Future Stages)
	// =========================================================================

	/**
	 * Returns the configured Builder Role for a product.
	 *
	 * @param int $product_id WooCommerce Product ID.
	 * @return string 'base_gun', 'part', or '' (not configured).
	 */
	public static function get_role( $product_id ) {
		return (string) get_post_meta( $product_id, self::META_ROLE, true );
	}

	/**
	 * Checks whether the product is enabled for the Gun Builder catalog.
	 *
	 * Indicates customer exposure permission once all other requirements are met.
	 * Does NOT indicate whether structural configuration or administrator readiness is complete.
	 *
	 * @param int $product_id WooCommerce Product ID.
	 * @return bool True if enabled ('yes'), false otherwise.
	 */
	public static function is_enabled( $product_id ) {
		return 'yes' === get_post_meta( $product_id, self::META_ENABLED, true );
	}

	/**
	 * Checks whether the product has administrator Ready approval.
	 *
	 * Indicates the administrator completed and approved configuration.
	 * Does NOT represent customer exposure (which also requires is_enabled()).
	 *
	 * @param int $product_id WooCommerce Product ID.
	 * @return bool True if marked Ready ('yes'), false otherwise.
	 */
	public static function is_ready( $product_id ) {
		return 'yes' === get_post_meta( $product_id, self::META_READY, true );
	}

	/**
	 * Returns the sanitized visual reference length in millimetres.
	 *
	 * Represents the physical left-to-right length depicted in the product's builder image.
	 *
	 * @param int $product_id WooCommerce Product ID.
	 * @return float Positive float in millimetres, or 0.0 if not set or invalid.
	 */
	public static function get_reference_mm( $product_id ) {
		$val = get_post_meta( $product_id, self::META_REFERENCE_MM, true );
		$sanitized = self::sanitize_reference_mm( $val );
		return ( '' !== $sanitized ) ? (float) $sanitized : 0.0;
	}

	/**
	 * Evaluates whether a product's structural builder configuration is complete and valid.
	 *
	 * Structural Validity Requirements:
	 * - Base Gun: Role === 'base_gun' AND Reference Length > 0.
	 * - Part: Role === 'part' AND Reference Length > 0 AND at least 1 WooCommerce category AND at least 1 mount interface.
	 *
	 * Note: This helper evaluates STRUCTURAL completeness only.
	 * It is completely independent of:
	 * - is_enabled(): Whether the product is turned on for customers.
	 * - is_ready(): Whether the administrator has approved it.
	 *
	 * @param int $product_id WooCommerce Product ID.
	 * @return bool True if structural configuration is valid, false otherwise.
	 */
	public static function is_configuration_valid( $product_id ) {
		$role = self::get_role( $product_id );
		$mm   = self::get_reference_mm( $product_id );

		if ( $mm <= 0.0 ) {
			return false;
		}

		if ( self::ROLE_BASE_GUN === $role ) {
			return true;
		}

		if ( self::ROLE_PART === $role ) {
			// Part requires positive reference mm, at least one WooCommerce category, and at least one mount interface.
			$has_cat = has_term( '', 'product_cat', $product_id );
			$ifaces  = TGB_Mount_Interfaces::get_product_interfaces( $product_id );
			return ( $has_cat && ! empty( $ifaces ) );
		}

		if ( self::ROLE_RAIL === $role ) {
			// Rail requires positive reference mm, at least one input interface, one output interface, and one supported position.
			$inputs  = self::get_rail_input_interfaces( $product_id );
			$outputs = self::get_rail_output_interfaces( $product_id );
			$pos     = self::get_rail_supported_positions( $product_id );
			return ( ! empty( $inputs ) && ! empty( $outputs ) && ! empty( $pos ) );
		}

		return false;
	}

	/**
	 * Returns full product configuration summary array.
	 *
	 * @param int $product_id WooCommerce Product ID.
	 * @return array Configuration details including validity, ready, and enabled states.
	 */
	public static function get_product_config( $product_id ) {
		$part_type  = TGB_Part_Types::get_product_part_type( $product_id );
		$wc_terms   = wp_get_post_terms( $product_id, 'product_cat' );
		$categories = array();
		if ( ! is_wp_error( $wc_terms ) && is_array( $wc_terms ) ) {
			foreach ( $wc_terms as $cat_term ) {
				$categories[] = array(
					'id'     => (int) $cat_term->term_id,
					'name'   => (string) $cat_term->name,
					'slug'   => (string) $cat_term->slug,
					'parent' => (int) $cat_term->parent,
				);
			}
		}

		$role = self::get_role( $product_id );

		return array(
			'product_id'             => $product_id,
			'enabled'                => self::is_enabled( $product_id ),
			'ready'                  => self::is_ready( $product_id ),
			'configuration_valid'    => self::is_configuration_valid( $product_id ),
			'role'                   => $role,
			'reference_mm'           => self::get_reference_mm( $product_id ),
			'categories'             => $categories,
			'category_policy'        => ( self::ROLE_BASE_GUN === $role ) ? self::get_category_policy( $product_id ) : null,
			'allowed_categories'     => ( self::ROLE_BASE_GUN === $role ) ? self::get_allowed_categories( $product_id ) : array(),
			'allowed_rail_positions' => ( self::ROLE_BASE_GUN === $role ) ? self::get_allowed_rail_positions( $product_id ) : array(),
			'rail_input_interfaces'  => ( self::ROLE_RAIL === $role ) ? self::get_rail_input_interfaces( $product_id ) : array(),
			'rail_output_interfaces' => ( self::ROLE_RAIL === $role ) ? self::get_rail_output_interfaces( $product_id ) : array(),
			'rail_positions'         => ( self::ROLE_RAIL === $role ) ? self::get_rail_supported_positions( $product_id ) : array(),
			'part_mount_positions'   => ( self::ROLE_PART === $role ) ? self::get_part_mount_positions( $product_id ) : array(),
			'part_type_term_id'      => $part_type ? $part_type->term_id : 0,
			'part_type_name'         => $part_type ? $part_type->name : '',
			'part_type_slug'         => $part_type ? $part_type->slug : '',
		);
	}

	// =========================================================================
	// Part 2: Category Policy & Rail Position Helpers
	// =========================================================================

	/**
	 * Returns the Category Policy for a Base Gun.
	 *
	 * Safe default: If unconfigured or empty, returns 'all' (unrestricted).
	 *
	 * @param int $product_id Base Gun Product ID.
	 * @return string 'all' or 'selected'.
	 */
	public static function get_category_policy( $product_id ) {
		$policy = get_post_meta( $product_id, self::META_CATEGORY_POLICY, true );
		return ( self::POLICY_SELECTED === $policy ) ? self::POLICY_SELECTED : self::POLICY_ALL;
	}

	/**
	 * Returns the list of permitted product_cat term IDs for a Base Gun.
	 *
	 * @param int $product_id Base Gun Product ID.
	 * @return int[] Array of sanitized product_cat term IDs.
	 */
	public static function get_allowed_categories( $product_id ) {
		$cats = get_post_meta( $product_id, self::META_ALLOWED_CATEGORIES, true );
		if ( is_string( $cats ) ) {
			$cats = json_decode( $cats, true );
		}
		if ( ! is_array( $cats ) ) {
			return array();
		}

		$valid = array();
		foreach ( $cats as $cid ) {
			$cid = absint( $cid );
			if ( $cid > 0 && term_exists( $cid, 'product_cat' ) ) {
				$valid[] = $cid;
			}
		}
		return array_values( array_unique( $valid ) );
	}

	/**
	 * Checks whether a specific WooCommerce category is permitted for a Base Gun.
	 *
	 * If the Base Gun policy is 'all' (or legacy unconfigured), all categories are allowed.
	 * If the policy is 'selected', returns true if:
	 * 1. The category ID is directly in the allowed list, OR
	 * 2. An ancestor category is in the allowed list (parent selection includes descendants).
	 *
	 * @param int $base_gun_id Base Gun product ID.
	 * @param int $category_id WooCommerce product_cat term ID.
	 * @return bool True if permitted, false otherwise.
	 */
	public static function is_category_allowed_for_gun( $base_gun_id, $category_id ) {
		$base_gun_id = absint( $base_gun_id );
		$category_id = absint( $category_id );

		if ( $base_gun_id <= 0 || $category_id <= 0 ) {
			return true;
		}

		// Non-existent or deleted categories are never allowed.
		if ( ! term_exists( $category_id, 'product_cat' ) ) {
			return false;
		}

		$policy = self::get_category_policy( $base_gun_id );
		if ( self::POLICY_SELECTED !== $policy ) {
			return true;
		}

		$allowed_ids = self::get_allowed_categories( $base_gun_id );
		if ( empty( $allowed_ids ) ) {
			return false;
		}

		// Direct match.
		if ( in_array( $category_id, $allowed_ids, true ) ) {
			return true;
		}

		// Hierarchical descendant match: Is any parent ancestor in the allowed list?
		$ancestors = get_ancestors( $category_id, 'product_cat', 'taxonomy' );
		foreach ( $ancestors as $anc_id ) {
			if ( in_array( (int) $anc_id, $allowed_ids, true ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Checks whether a Part product is eligible under a Base Gun's category policy.
	 *
	 * Multi-category rule: A Part is eligible if at least ONE of its assigned categories
	 * falls within the Base Gun's permitted category tree.
	 *
	 * @param int $base_gun_id Base Gun product ID.
	 * @param int $part_id     Part product ID.
	 * @return bool True if eligible, false otherwise.
	 */
	public static function is_part_category_allowed_for_gun( $base_gun_id, $part_id ) {
		$base_gun_id = absint( $base_gun_id );
		$part_id     = absint( $part_id );

		if ( $base_gun_id <= 0 ) {
			return true;
		}

		$policy = self::get_category_policy( $base_gun_id );
		if ( self::POLICY_SELECTED !== $policy ) {
			return true;
		}

		$allowed_ids = self::get_allowed_categories( $base_gun_id );
		if ( empty( $allowed_ids ) ) {
			return false;
		}

		$part_cats = wp_get_post_terms( $part_id, 'product_cat', array( 'fields' => 'ids' ) );
		if ( empty( $part_cats ) || is_wp_error( $part_cats ) ) {
			return false;
		}

		foreach ( $part_cats as $cat_id ) {
			if ( self::is_category_allowed_for_gun( $base_gun_id, $cat_id ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Returns the allowed optional rail positions for a Base Gun.
	 *
	 * @param int $product_id Base Gun Product ID.
	 * @return string[] Array subset of ['top', 'bottom'].
	 */
	public static function get_allowed_rail_positions( $product_id ) {
		$raw = get_post_meta( $product_id, self::META_ALLOWED_RAIL_POSITIONS, true );
		if ( is_string( $raw ) ) {
			$raw = json_decode( $raw, true );
		}
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$valid = array();
		foreach ( $raw as $pos ) {
			$key = sanitize_key( $pos );
			if ( in_array( $key, array( 'top', 'bottom' ), true ) ) {
				$valid[] = $key;
			}
		}
		return array_values( array_unique( $valid ) );
	}

	/**
	 * Returns the configured input interface term IDs for a Rail product.
	 *
	 * @param int $product_id Rail Product ID.
	 * @return int[] Array of sanitized tgb_mount_interface term IDs.
	 */
	public static function get_rail_input_interfaces( $product_id ) {
		$raw = get_post_meta( $product_id, self::META_RAIL_INPUT_INTERFACES, true );
		if ( is_string( $raw ) ) {
			$raw = json_decode( $raw, true );
		}
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$valid = array();
		foreach ( $raw as $iid ) {
			$iid = absint( $iid );
			if ( $iid > 0 && term_exists( $iid, TGB_Mount_Interfaces::TAXONOMY ) ) {
				$valid[] = $iid;
			}
		}
		return array_values( array_unique( $valid ) );
	}

	/**
	 * Returns the configured output interface term IDs for a Rail product.
	 *
	 * @param int $product_id Rail Product ID.
	 * @return int[] Array of sanitized tgb_mount_interface term IDs.
	 */
	public static function get_rail_output_interfaces( $product_id ) {
		$raw = get_post_meta( $product_id, self::META_RAIL_OUTPUT_INTERFACES, true );
		if ( is_string( $raw ) ) {
			$raw = json_decode( $raw, true );
		}
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$valid = array();
		foreach ( $raw as $iid ) {
			$iid = absint( $iid );
			if ( $iid > 0 && term_exists( $iid, TGB_Mount_Interfaces::TAXONOMY ) ) {
				$valid[] = $iid;
			}
		}
		return array_values( array_unique( $valid ) );
	}

	/**
	 * Returns the supported physical positions for a Rail product.
	 *
	 * @param int $product_id Rail Product ID.
	 * @return string[] Array subset of ['top', 'bottom'].
	 */
	public static function get_rail_supported_positions( $product_id ) {
		$raw = get_post_meta( $product_id, self::META_RAIL_POSITIONS, true );
		if ( is_string( $raw ) ) {
			$raw = json_decode( $raw, true );
		}
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$valid = array();
		foreach ( $raw as $pos ) {
			$key = sanitize_key( $pos );
			if ( in_array( $key, array( 'top', 'bottom' ), true ) ) {
				$valid[] = $key;
			}
		}
		return array_values( array_unique( $valid ) );
	}

	/**
	 * Returns the optional mount positions for a Part product.
	 *
	 * Unspecified/empty means compatibility is unrestricted by position (legacy behavior).
	 *
	 * @param int $product_id Part Product ID.
	 * @return string[] Array subset of ['top', 'bottom', 'muzzle'].
	 */
	public static function get_part_mount_positions( $product_id ) {
		$raw = get_post_meta( $product_id, self::META_PART_POSITIONS, true );
		if ( empty( $raw ) ) {
			$raw = get_post_meta( $product_id, '_tgb_mount_positions', true );
		}
		if ( is_string( $raw ) ) {
			$raw = json_decode( $raw, true );
		}
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$valid = array();
		foreach ( $raw as $pos ) {
			$key = sanitize_key( $pos );
			if ( in_array( $key, array( 'top', 'bottom', 'muzzle' ), true ) ) {
				$valid[] = $key;
			}
		}
		return array_values( array_unique( $valid ) );
	}

	/**
	 * Renders a hierarchical, searchable checklist of WooCommerce product categories.
	 *
	 * Preserves parent-child nesting with visual indentation.
	 *
	 * @param array $selected_ids Array of selected product_cat term IDs.
	 */
	public static function render_category_checklist( array $selected_ids = array() ) {
		$all_cats = get_terms(
			array(
				'taxonomy'   => 'product_cat',
				'hide_empty' => false,
			)
		);

		if ( empty( $all_cats ) || is_wp_error( $all_cats ) ) {
			echo '<p class="description">' . esc_html__( 'No WooCommerce product categories found.', 'part-selector' ) . '</p>';
			return;
		}

		$cats_by_parent = array();
		foreach ( $all_cats as $cat ) {
			$parent = (int) $cat->parent;
			if ( ! isset( $cats_by_parent[ $parent ] ) ) {
				$cats_by_parent[ $parent ] = array();
			}
			$cats_by_parent[ $parent ][] = $cat;
		}

		$render_level = function( $parent_id, $depth ) use ( &$render_level, &$cats_by_parent, $selected_ids ) {
			if ( empty( $cats_by_parent[ $parent_id ] ) ) {
				return;
			}

			usort( $cats_by_parent[ $parent_id ], function( $a, $b ) {
				return strcasecmp( $a->name, $b->name );
			} );

			foreach ( $cats_by_parent[ $parent_id ] as $cat ) {
				$is_checked = in_array( (int) $cat->term_id, $selected_ids, true );
				$indent     = $depth * 18;
				?>
				<div class="tgb-category-item" data-name="<?php echo esc_attr( strtolower( $cat->name ) ); ?>" style="margin-left: <?php echo esc_attr( $indent ); ?>px; margin-bottom: 4px;">
					<label style="display: inline-flex; align-items: center; gap: 6px; font-weight: normal; cursor: pointer;">
						<input type="checkbox" name="tgb_allowed_categories[]" value="<?php echo esc_attr( $cat->term_id ); ?>" <?php checked( $is_checked ); ?> />
						<span><?php echo esc_html( $cat->name ); ?></span>
					</label>
				</div>
				<?php
				$render_level( $cat->term_id, $depth + 1 );
			}
		};

		$render_level( 0, 0 );
	}
}
