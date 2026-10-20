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
	const META_ENABLED      = '_tgb_enabled';
	const META_READY        = '_tgb_ready';
	const META_ROLE         = '_tgb_role';
	const META_REFERENCE_MM = '_tgb_reference_mm';

	// Allowed Roles.
	const ROLE_BASE_GUN = 'base_gun';
	const ROLE_PART     = 'part';

	/**
	 * Initialize product configuration hooks.
	 */
	public static function init() {
		// WooCommerce Product Data Tab & Panel.
		add_filter( 'woocommerce_product_data_tabs', array( __CLASS__, 'add_product_data_tab' ) );
		add_action( 'woocommerce_product_data_panels', array( __CLASS__, 'render_product_data_panel' ) );
		add_action( 'woocommerce_process_product_meta', array( __CLASS__, 'save_product_data' ), 10, 2 );

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
							''                 => __( '-- Not Configured --', 'part-selector' ),
							self::ROLE_BASE_GUN => __( 'Base Gun', 'part-selector' ),
							self::ROLE_PART     => __( 'Part', 'part-selector' ),
						),
						'description' => __( 'Choose whether this product is a base weapon or an attachable part.', 'part-selector' ),
					)
				);
				?>

				<!-- 4. Part Type (Conditional on Role = Part) -->
				<p class="form-field tgb-part-type-row" id="tgb_part_type_row">
					<label for="tgb_part_type_id"><?php esc_html_e( 'Builder Part Type', 'part-selector' ); ?></label>
					<?php if ( ! empty( $available_types ) ) : ?>
						<select name="tgb_part_type_id" id="tgb_part_type_id" class="select short">
							<option value="0"><?php esc_html_e( '-- Select Part Type --', 'part-selector' ); ?></option>
							<?php foreach ( $available_types as $type_term ) : ?>
								<option value="<?php echo esc_attr( $type_term->term_id ); ?>" <?php selected( $current_term_id, $type_term->term_id ); ?>>
									<?php echo esc_html( $type_term->name ); ?>
								</option>
							<?php endforeach; ?>
						</select>
						<span class="description">
							<?php esc_html_e( 'Assign the primary component category for this part.', 'part-selector' ); ?>
						</span>
					<?php else : ?>
						<select name="tgb_part_type_id" id="tgb_part_type_id" class="select short" disabled>
							<option value="0"><?php esc_html_e( '-- No Part Types created yet --', 'part-selector' ); ?></option>
						</select>
						<span class="description">
							<?php
							printf(
								/* translators: %s: URL to taxonomy management screen */
								wp_kses_post( __( '<a href="%s" target="_blank">Create Part Types under Products → Gun Builder Part Types</a>.', 'part-selector' ) ),
								esc_url( admin_url( 'edit-tags.php?taxonomy=' . TGB_Part_Types::TAXONOMY . '&post_type=product' ) )
							);
							?>
						</span>
					<?php endif; ?>
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

				<!-- 6. Base Gun Mounting Points (Conditional on Role = Base Gun) -->
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

						<table class="widefat tgb-mount-points-table" id="tgb_mount_points_table" style="max-width: 800px; margin-bottom: 10px;">
							<thead>
								<tr>
									<th style="width: 30%;"><?php esc_html_e( 'Label / Location', 'part-selector' ); ?></th>
									<th style="width: 30%;"><?php esc_html_e( 'Mount Interface', 'part-selector' ); ?></th>
									<th style="width: 15%;"><?php esc_html_e( 'Local X (mm)', 'part-selector' ); ?></th>
									<th style="width: 15%;"><?php esc_html_e( 'Local Y (mm)', 'part-selector' ); ?></th>
									<th style="width: 10%; text-align: center;"><?php esc_html_e( 'Action', 'part-selector' ); ?></th>
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

				<!-- 7. Part Mounting (Conditional on Role = Part) -->
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
		$valid_role     = in_array( $submitted_role, array( self::ROLE_BASE_GUN, self::ROLE_PART ), true ) ? $submitted_role : '';
		update_post_meta( $post_id, self::META_ROLE, $valid_role );

		// 4. Strict Reference measurement validation (must be positive decimal, no unit suffixes).
		$raw_mm_input     = isset( $_POST[ self::META_REFERENCE_MM ] ) ? wp_unslash( $_POST[ self::META_REFERENCE_MM ] ) : '';
		$reference_mm_val = self::sanitize_reference_mm( $raw_mm_input );
		update_post_meta( $post_id, self::META_REFERENCE_MM, $reference_mm_val );

		// 5. Taxonomy assignment based on Role.
		$part_type_id = isset( $_POST['tgb_part_type_id'] ) ? absint( $_POST['tgb_part_type_id'] ) : 0;

		if ( self::ROLE_PART === $valid_role ) {
			if ( $part_type_id > 0 && term_exists( $part_type_id, TGB_Part_Types::TAXONOMY ) ) {
				// Assign exactly the one selected term.
				wp_set_object_terms( $post_id, array( $part_type_id ), TGB_Part_Types::TAXONOMY, false );
			} else {
				// Clear term if none or invalid selected.
				wp_set_object_terms( $post_id, array(), TGB_Part_Types::TAXONOMY, false );
			}

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

			// Clear Base Gun mount points to prevent stale data.
			delete_post_meta( $post_id, TGB_Mounting::META_MOUNT_POINTS );

		} elseif ( self::ROLE_BASE_GUN === $valid_role ) {
			// For Base Gun, remove Part Type and Part Mount Interface terms.
			wp_set_object_terms( $post_id, array(), TGB_Part_Types::TAXONOMY, false );
			wp_set_object_terms( $post_id, array(), TGB_Mount_Interfaces::TAXONOMY, false );

			// Clear Part anchors.
			delete_post_meta( $post_id, TGB_Mounting::META_ANCHOR_X );
			delete_post_meta( $post_id, TGB_Mounting::META_ANCHOR_Y );

			// Save Base Gun Mount Points.
			$raw_mount_points = isset( $_POST['tgb_mount_points'] ) && is_array( $_POST['tgb_mount_points'] )
				? $_POST['tgb_mount_points']
				: array();
			$base_max_w = ! empty( $reference_mm_val ) ? (float) $reference_mm_val : null;
			$sanitized_points = TGB_Mounting::sanitize_mount_points( $raw_mount_points, $base_max_w );
			update_post_meta( $post_id, TGB_Mounting::META_MOUNT_POINTS, wp_json_encode( $sanitized_points ) );

		} else {
			// For unconfigured products, remove all builder taxonomy relationships and mounting metadata.
			wp_set_object_terms( $post_id, array(), TGB_Part_Types::TAXONOMY, false );
			wp_set_object_terms( $post_id, array(), TGB_Mount_Interfaces::TAXONOMY, false );
			delete_post_meta( $post_id, TGB_Mounting::META_ANCHOR_X );
			delete_post_meta( $post_id, TGB_Mounting::META_ANCHOR_Y );
			delete_post_meta( $post_id, TGB_Mounting::META_MOUNT_POINTS );
		}

		// 6. Builder Ready validation.
		$requested_ready = isset( $_POST[ self::META_READY ] ) ? 'yes' : 'no';
		$assigned_terms  = wp_get_object_terms( $post_id, TGB_Part_Types::TAXONOMY );
		$user_id         = get_current_user_id();

		if ( 'yes' === $requested_ready ) {
			$errors = array();

			if ( empty( $valid_role ) ) {
				$errors[] = __( 'A Builder Role (Base Gun or Part) must be selected.', 'part-selector' );
			}

			if ( empty( $reference_mm_val ) ) {
				if ( '' !== trim( (string) $raw_mm_input ) ) {
					$errors[] = __( 'Visual Reference Length must be a positive number in millimetres (e.g. 780 or 140.5). Units or invalid characters were rejected.', 'part-selector' );
				} else {
					$errors[] = __( 'A positive Visual Reference Length in millimetres is required.', 'part-selector' );
				}
			}

			if ( self::ROLE_PART === $valid_role && empty( $assigned_terms ) ) {
				$errors[] = __( 'Parts must have exactly one Builder Part Type assigned.', 'part-selector' );
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
	 * - Part: Role === 'part' AND Reference Length > 0 AND exactly 1 valid 'tgb_part_type' assigned.
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
			$part_type = TGB_Part_Types::get_product_part_type( $product_id );
			return ( null !== $part_type );
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
		$part_type = TGB_Part_Types::get_product_part_type( $product_id );

		return array(
			'product_id'             => $product_id,
			'enabled'                => self::is_enabled( $product_id ),
			'ready'                  => self::is_ready( $product_id ),
			'configuration_valid'    => self::is_configuration_valid( $product_id ),
			'role'                   => self::get_role( $product_id ),
			'reference_mm'           => self::get_reference_mm( $product_id ),
			'part_type_term_id'      => $part_type ? $part_type->term_id : 0,
			'part_type_name'         => $part_type ? $part_type->name : '',
			'part_type_slug'         => $part_type ? $part_type->slug : '',
		);
	}
}
