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
		var $roleSelect       = $('#_tgb_role');
		var $partTypeRow      = $('#tgb_part_type_row');
		var $baseMountSection = $('#tgb_base_gun_mounting_section');
		var $partMountSection = $('#tgb_part_mounting_section');
		var $mountTableBody   = $('#tgb_mount_points_table tbody');
		var $addMountBtn      = $('#tgb_add_mount_point_btn');
		var $templateEl       = $('#tgb_mount_point_template');

		if (!$roleSelect.length) {
			return;
		}

		function updateConditionalFields() {
			var selectedRole = $roleSelect.val();
			if (selectedRole === 'part') {
				if ($partTypeRow.length) $partTypeRow.show();
				if ($partMountSection.length) $partMountSection.show();
				if ($baseMountSection.length) $baseMountSection.hide();
			} else if (selectedRole === 'base_gun') {
				if ($partTypeRow.length) $partTypeRow.hide();
				if ($partMountSection.length) $partMountSection.hide();
				if ($baseMountSection.length) $baseMountSection.show();
			} else {
				if ($partTypeRow.length) $partTypeRow.hide();
				if ($partMountSection.length) $partMountSection.hide();
				if ($baseMountSection.length) $baseMountSection.hide();
			}
		}

		// Initial evaluation.
		updateConditionalFields();

		// Change listener on Role select.
		$roleSelect.on('change', updateConditionalFields);

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
