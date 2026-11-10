/**
 * Taktik Gun Builder - Admin Product Data Script
 *
 * Controls conditional visibility of Part Type selector and role-specific
 * mounting configuration sections (Base Gun mount points vs Part anchors).
 * Scoped strictly to the WooCommerce product edit screen.
 */

(function($) {
	'use strict';

	$(document).ready(function() {
		var $roleSelect          = $('#_tgb_role');
		var $partTypeRow         = $('#tgb_part_type_row');
		var $baseCatsSection     = $('#tgb_base_gun_categories_section');
		var $baseMountSection    = $('#tgb_base_gun_mounting_section');
		var $baseRailsSection    = $('#tgb_base_gun_rails_section');
		var $partMountSection    = $('#tgb_part_mounting_section');
		var $railConfigSection   = $('#tgb_rail_configuration_section');
		var $mountTableBody      = $('#tgb_mount_points_table tbody');
		var $addMountBtn         = $('#tgb_add_mount_point_btn');
		var $templateEl          = $('#tgb_mount_point_template');
		var $catPolicyRadios     = $('input[name="tgb_category_policy"]');
		var $allowedCatsBox      = $('#tgb_allowed_categories_container');
		var $catSearchInput      = $('#tgb_category_search_input');

		if (!$roleSelect.length) {
			return;
		}

		function updateConditionalFields() {
			var selectedRole = $roleSelect.val();
			if (selectedRole === 'part') {
				if ($partTypeRow.length) $partTypeRow.show();
				if ($partMountSection.length) $partMountSection.show();
				if ($baseCatsSection.length) $baseCatsSection.hide();
				if ($baseMountSection.length) $baseMountSection.hide();
				if ($baseRailsSection.length) $baseRailsSection.hide();
				if ($railConfigSection.length) $railConfigSection.hide();
			} else if (selectedRole === 'base_gun') {
				if ($partTypeRow.length) $partTypeRow.hide();
				if ($partMountSection.length) $partMountSection.hide();
				if ($baseCatsSection.length) $baseCatsSection.show();
				if ($baseMountSection.length) $baseMountSection.show();
				if ($baseRailsSection.length) $baseRailsSection.show();
				if ($railConfigSection.length) $railConfigSection.hide();
			} else if (selectedRole === 'rail') {
				if ($partTypeRow.length) $partTypeRow.hide();
				if ($partMountSection.length) $partMountSection.hide();
				if ($baseCatsSection.length) $baseCatsSection.hide();
				if ($baseMountSection.length) $baseMountSection.hide();
				if ($baseRailsSection.length) $baseRailsSection.hide();
				if ($railConfigSection.length) $railConfigSection.show();
			} else {
				if ($partTypeRow.length) $partTypeRow.hide();
				if ($partMountSection.length) $partMountSection.hide();
				if ($baseCatsSection.length) $baseCatsSection.hide();
				if ($baseMountSection.length) $baseMountSection.hide();
				if ($baseRailsSection.length) $baseRailsSection.hide();
				if ($railConfigSection.length) $railConfigSection.hide();
			}
		}

		// Initial evaluation.
		updateConditionalFields();

		// Change listener on Role select.
		$roleSelect.on('change', updateConditionalFields);

		// Category Policy radio change listener.
		$catPolicyRadios.on('change', function() {
			if ($('input[name="tgb_category_policy"]:checked').val() === 'selected') {
				$allowedCatsBox.slideDown(150);
			} else {
				$allowedCatsBox.slideUp(150);
			}
		});

		// Instant category checklist search filter.
		if ($catSearchInput.length) {
			$catSearchInput.on('input', function() {
				var query = $(this).val().toLowerCase().trim();
				var $items = $('.tgb-category-item');
				if (!query) {
					$items.show();
					return;
				}
				$items.each(function() {
					var name = $(this).attr('data-name') || $(this).text().toLowerCase();
					if (name.indexOf(query) !== -1) {
						$(this).show();
					} else {
						$(this).hide();
					}
				});
			});
		}

		// Add Mount Point row.
		if ($addMountBtn.length && $templateEl.length) {
			$addMountBtn.on('click', function(e) {
				e.preventDefault();
				var templateHtml = $templateEl.html();
				var newIndex = 'new_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
				var newId = 'mount-' + Math.random().toString(36).substring(2, 14);
				var rowHtml = templateHtml
					.replace(/\{\{INDEX\}\}/g, newIndex)
					.replace(/\{\{ID\}\}/g, newId);
				$mountTableBody.append(rowHtml);
			});
		}

		// Remove Mount Point row (delegated event).
		$('#tgb_mount_points_table').on('click', '.tgb-remove-mount-point', function(e) {
			e.preventDefault();
			$(this).closest('tr').remove();
		});
	});
})(jQuery);
