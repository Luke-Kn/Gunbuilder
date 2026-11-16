<?php
/**
 * Administrator settings manager for Taktik Gun Builder.
 *
 * @package TaktikGunBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class TGB_Settings
 *
 * Manages plugin-wide administrator settings including the switchable Category Source.
 */
class TGB_Settings {

	/**
	 * Option name for the category source setting.
	 *
	 * @var string
	 */
	const OPTION_CATEGORY_SOURCE = 'tgb_category_source';

	/**
	 * Category source: Custom Gun Builder categories (tgb_part_type).
	 *
	 * @var string
	 */
	const SOURCE_CUSTOM = 'custom';

	/**
	 * Category source: Native WooCommerce product categories (product_cat).
	 *
	 * @var string
	 */
	const SOURCE_WOOCOMMERCE = 'woocommerce';

	/**
	 * Settings page slug under Products menu.
	 *
	 * @var string
	 */
	const MENU_SLUG = 'tgb-settings';

	/**
	 * Initialize settings hooks.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'add_admin_menu' ), 25 );
		add_action( 'admin_post_tgb_save_settings', array( __CLASS__, 'handle_save_settings' ) );
	}

	/**
	 * Retrieves the currently active Category Source setting.
	 *
	 * Defaults to 'woocommerce' to preserve existing installations.
	 *
	 * @return string 'custom' or 'woocommerce'
	 */
	public static function get_category_source() {
		$source = get_option( self::OPTION_CATEGORY_SOURCE, self::SOURCE_WOOCOMMERCE );
		if ( ! in_array( $source, array( self::SOURCE_CUSTOM, self::SOURCE_WOOCOMMERCE ), true ) ) {
			return self::SOURCE_WOOCOMMERCE;
		}
		return $source;
	}

	/**
	 * Helper: Checks if Custom Gun Builder category source is active.
	 *
	 * @return bool
	 */
	public static function is_custom_source() {
		return self::SOURCE_CUSTOM === self::get_category_source();
	}

	/**
	 * Helper: Checks if WooCommerce Website category source is active.
	 *
	 * @return bool
	 */
	public static function is_woocommerce_source() {
		return self::SOURCE_WOOCOMMERCE === self::get_category_source();
	}

	/**
	 * Registers the Gun Builder Settings page under the Products menu.
	 */
	public static function add_admin_menu() {
		add_submenu_page(
			'edit.php?post_type=product',
			__( 'Gun Builder Settings', 'part-selector' ),
			__( 'Gun Builder Settings', 'part-selector' ),
			'manage_woocommerce',
			self::MENU_SLUG,
			array( __CLASS__, 'render_settings_page' )
		);
	}

	/**
	 * Computes live catalog readiness metrics comparing WooCommerce and Custom category assignments.
	 *
	 * @return array Live catalog metrics.
	 */
	public static function get_readiness_summary() {
		// 1. Fetch all eligible Part products
		$query = new WP_Query(
			array(
				'post_type'      => 'product',
				'post_status'    => 'publish',
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'no_found_rows'  => true,
				'meta_query'     => array(
					array(
						'key'   => TGB_Product_Config::META_ROLE,
						'value' => TGB_Product_Config::ROLE_PART,
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
			)
		);

		$part_ids = $query->posts;
		$total_parts = count( $part_ids );

		$woo_assigned_count    = 0;
		$custom_assigned_count = 0;
		$custom_missing_count  = 0;

		foreach ( $part_ids as $pid ) {
			$woo_terms = wp_get_object_terms( $pid, 'product_cat', array( 'fields' => 'ids' ) );
			if ( ! empty( $woo_terms ) && ! is_wp_error( $woo_terms ) ) {
				$woo_assigned_count++;
			}

			$custom_terms = wp_get_object_terms( $pid, TGB_Part_Types::TAXONOMY, array( 'fields' => 'ids' ) );
			if ( ! empty( $custom_terms ) && ! is_wp_error( $custom_terms ) ) {
				$custom_assigned_count++;
			} else {
				$custom_missing_count++;
			}
		}

		// 2. Fetch custom categories containing eligible parts
		$all_custom_terms = get_terms(
			array(
				'taxonomy'   => TGB_Part_Types::TAXONOMY,
				'hide_empty' => false,
			)
		);

		$total_custom_terms = is_array( $all_custom_terms ) ? count( $all_custom_terms ) : 0;
		$terms_with_parts   = 0;

		if ( is_array( $all_custom_terms ) ) {
			foreach ( $all_custom_terms as $cterm ) {
				$prod_count = count(
					get_posts(
						array(
							'post_type'      => 'product',
							'post_status'    => 'publish',
							'posts_per_page' => -1,
							'fields'         => 'ids',
							'tax_query'      => array(
								array(
									'taxonomy' => TGB_Part_Types::TAXONOMY,
									'terms'    => $cterm->term_id,
								),
							),
							'meta_query'     => array(
								array(
									'key'   => TGB_Product_Config::META_ROLE,
									'value' => TGB_Product_Config::ROLE_PART,
								),
								array(
									'key'   => TGB_Product_Config::META_ENABLED,
									'value' => 'yes',
								),
							),
						)
					)
				);
				if ( $prod_count > 0 ) {
					$terms_with_parts++;
				}
			}
		}

		return array(
			'total_parts'                 => $total_parts,
			'woo_assigned_parts'          => $woo_assigned_count,
			'custom_assigned_parts'       => $custom_assigned_count,
			'custom_missing_parts'        => $custom_missing_count,
			'total_custom_categories'     => $total_custom_terms,
			'custom_categories_with_parts'=> $terms_with_parts,
		);
	}

	/**
	 * Handles POST submission to save settings.
	 */
	public static function handle_save_settings() {
		if ( ! current_user_can( 'manage_woocommerce' ) && ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to modify Gun Builder settings.', 'part-selector' ), 403 );
		}

		check_admin_referer( 'tgb_save_settings_action', 'tgb_settings_nonce' );

		$raw_source = isset( $_POST['tgb_category_source'] ) ? sanitize_key( wp_unslash( $_POST['tgb_category_source'] ) ) : self::SOURCE_WOOCOMMERCE;
		$new_source = ( self::SOURCE_CUSTOM === $raw_source ) ? self::SOURCE_CUSTOM : self::SOURCE_WOOCOMMERCE;
		$old_source = self::get_category_source();

		update_option( self::OPTION_CATEGORY_SOURCE, $new_source );

		// If category source changed, immediately invalidate all category and catalog transient caches
		if ( $new_source !== $old_source ) {
			TGB_Product_Data::bump_catalog_version();
		}

		$redirect_url = add_query_arg(
			array(
				'post_type' => 'product',
				'page'      => self::MENU_SLUG,
				'updated'   => 'true',
			),
			admin_url( 'edit.php' )
		);

		wp_safe_redirect( $redirect_url );
		exit;
	}

	/**
	 * Renders the Gun Builder Settings page.
	 */
	public static function render_settings_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) && ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to view Gun Builder settings.', 'part-selector' ), 403 );
		}

		$current_source = self::get_category_source();
		$summary        = self::get_readiness_summary();
		$updated        = isset( $_GET['updated'] ) && 'true' === $_GET['updated'];
		?>
		<div class="wrap tgb-settings-wrap">
			<h1><?php esc_html_e( 'Taktik Gun Builder — Settings', 'part-selector' ); ?></h1>

			<?php if ( $updated ) : ?>
				<div class="notice notice-success is-dismissible">
					<p><?php esc_html_e( 'Gun Builder settings updated successfully.', 'part-selector' ); ?></p>
				</div>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="tgb_save_settings" />
				<?php wp_nonce_field( 'tgb_save_settings_action', 'tgb_settings_nonce' ); ?>

				<div class="card" style="max-width: 900px; padding: 20px 24px; margin-top: 20px;">
					<h2 style="margin-top: 0; padding-bottom: 8px; border-bottom: 1px solid #ddd;">
						<?php esc_html_e( 'Category Source', 'part-selector' ); ?>
					</h2>
					<p class="description" style="font-size: 14px; margin-bottom: 20px;">
						<?php esc_html_e( 'Choose which category taxonomy powers the Gun Builder component navigation, Base Gun category policies, and catalog discovery.', 'part-selector' ); ?>
					</p>

					<fieldset style="margin-bottom: 24px;">
						<!-- Option B: WooCommerce Categories -->
						<div style="margin-bottom: 16px; padding: 12px 16px; background: <?php echo ( self::SOURCE_WOOCOMMERCE === $current_source ) ? '#f0f6fc' : '#fff'; ?>; border: 1px solid <?php echo ( self::SOURCE_WOOCOMMERCE === $current_source ) ? '#72aee6' : '#dcdcde'; ?>; border-radius: 4px;">
							<label style="font-weight: 600; font-size: 15px; display: block; margin-bottom: 4px; cursor: pointer;">
								<input type="radio" name="tgb_category_source" value="<?php echo esc_attr( self::SOURCE_WOOCOMMERCE ); ?>" <?php checked( $current_source, self::SOURCE_WOOCOMMERCE ); ?> style="margin-top: -3px;" />
								<?php esc_html_e( 'Option B — WooCommerce Website Categories', 'part-selector' ); ?>
								<?php if ( self::SOURCE_WOOCOMMERCE === $current_source ) : ?>
									<span class="badge" style="background: #2271b1; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: 8px; text-transform: uppercase;"><?php esc_html_e( 'Active', 'part-selector' ); ?></span>
								<?php endif; ?>
							</label>
							<p class="description" style="margin: 4px 0 0 24px; color: #50575e;">
								<?php esc_html_e( 'Automatically use eligible product categories from the existing WooCommerce catalog (product_cat).', 'part-selector' ); ?>
							</p>
						</div>

						<!-- Option A: Custom Gun Builder Categories -->
						<div style="padding: 12px 16px; background: <?php echo ( self::SOURCE_CUSTOM === $current_source ) ? '#f0f6fc' : '#fff'; ?>; border: 1px solid <?php echo ( self::SOURCE_CUSTOM === $current_source ) ? '#72aee6' : '#dcdcde'; ?>; border-radius: 4px;">
							<label style="font-weight: 600; font-size: 15px; display: block; margin-bottom: 4px; cursor: pointer;">
								<input type="radio" name="tgb_category_source" value="<?php echo esc_attr( self::SOURCE_CUSTOM ); ?>" <?php checked( $current_source, self::SOURCE_CUSTOM ); ?> style="margin-top: -3px;" />
								<?php esc_html_e( 'Option A — Custom Gun Builder Categories', 'part-selector' ); ?>
								<?php if ( self::SOURCE_CUSTOM === $current_source ) : ?>
									<span class="badge" style="background: #2271b1; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: 8px; text-transform: uppercase;"><?php esc_html_e( 'Active', 'part-selector' ); ?></span>
								<?php endif; ?>
							</label>
							<p class="description" style="margin: 4px 0 0 24px; color: #50575e;">
								<?php esc_html_e( 'Use categories created specifically for the Gun Builder (tgb_part_type). Manage them independently from the website\'s WooCommerce product categories.', 'part-selector' ); ?>
							</p>
						</div>
					</fieldset>

					<!-- Readiness Summary Preview (Section 11 Requirement) -->
					<div style="background: #fdfdfd; border: 1px solid #ccd0d4; border-radius: 4px; padding: 16px; margin-bottom: 20px;">
						<h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #333;">
							<?php esc_html_e( 'Catalog Readiness Preview', 'part-selector' ); ?>
						</h3>
						<table class="widefat striped" style="border: 0; box-shadow: none;">
							<tbody>
								<tr>
									<td style="width: 60%; font-weight: 600;"><?php esc_html_e( 'Total Eligible Builder Parts:', 'part-selector' ); ?></td>
									<td><strong><?php echo esc_html( $summary['total_parts'] ); ?></strong></td>
								</tr>
								<tr>
									<td style="font-weight: 600;"><?php esc_html_e( 'Parts assigned to WooCommerce Categories:', 'part-selector' ); ?></td>
									<td><span style="color: #007017; font-weight: 600;"><?php echo esc_html( $summary['woo_assigned_parts'] ); ?></span> / <?php echo esc_html( $summary['total_parts'] ); ?></td>
								</tr>
								<tr>
									<td style="font-weight: 600;"><?php esc_html_e( 'Parts assigned to Custom Gun Builder Part Types:', 'part-selector' ); ?></td>
									<td><span style="color: <?php echo ( $summary['custom_assigned_parts'] > 0 ) ? '#007017' : '#d63638'; ?>; font-weight: 600;"><?php echo esc_html( $summary['custom_assigned_parts'] ); ?></span> / <?php echo esc_html( $summary['total_parts'] ); ?></td>
								</tr>
								<tr>
									<td style="font-weight: 600;"><?php esc_html_e( 'Parts missing Custom Category assignments:', 'part-selector' ); ?></td>
									<td>
										<?php if ( $summary['custom_missing_parts'] > 0 ) : ?>
											<span style="color: #d63638; font-weight: 600;"><?php echo esc_html( $summary['custom_missing_parts'] ); ?></span>
											<span class="description" style="margin-left: 8px;">(<?php esc_html_e( 'These will not appear in the builder when Custom mode is active until assigned.', 'part-selector' ); ?>)</span>
										<?php else : ?>
											<span style="color: #007017; font-weight: 600;">0 (All assigned)</span>
										<?php endif; ?>
									</td>
								</tr>
								<tr>
									<td style="font-weight: 600;"><?php esc_html_e( 'Custom Part Types containing eligible parts:', 'part-selector' ); ?></td>
									<td><?php echo esc_html( $summary['custom_categories_with_parts'] ); ?> of <?php echo esc_html( $summary['total_custom_categories'] ); ?> categories</td>
								</tr>
							</tbody>
						</table>

						<?php if ( $summary['custom_missing_parts'] > 0 ) : ?>
							<div style="margin-top: 12px; padding: 10px 14px; background: #fff8e5; border-left: 4px solid #dba617; font-size: 13px;">
								<strong><?php esc_html_e( 'Administrator Notice:', 'part-selector' ); ?></strong>
								<?php
								printf(
									/* translators: %s link to part types admin */
									esc_html__( '%1$d parts do not have custom Part Types assigned. To ensure all components are available before switching to Custom mode, assign them in product settings or manage categories in %2$s.', 'part-selector' ),
									absint( $summary['custom_missing_parts'] ),
									'<a href="' . esc_url( admin_url( 'edit-tags.php?taxonomy=' . TGB_Part_Types::TAXONOMY . '&post_type=product' ) ) . '"><strong>' . esc_html__( 'Gun Builder Part Types', 'part-selector' ) . '</strong></a>'
								);
								?>
							</div>
						<?php endif; ?>
					</div>

					<p class="submit" style="margin-bottom: 0; padding-bottom: 0;">
						<input type="submit" class="button button-primary" value="<?php esc_attr_e( 'Save Category Source', 'part-selector' ); ?>" />
					</p>
				</div>
			</form>
		</div>
		<?php
	}
}
