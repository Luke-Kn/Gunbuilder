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
		} else {
			// For Base Gun or unconfigured, remove any attached Part Type terms to prevent stale relationships.
			wp_set_object_terms( $post_id, array(), TGB_Part_Types::TAXONOMY, false );
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
