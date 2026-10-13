/**
 * Taktik Gun Builder - Admin Product Data Script
 *
 * Controls conditional visibility of Part Type selector based on Builder Role.
 * Scoped strictly to the WooCommerce product edit screen.
 */

(function($) {
	'use strict';

	$(document).ready(function() {
		var $roleSelect = $('#_tgb_role');
		var $partTypeRow = $('#tgb_part_type_row');

		if (!$roleSelect.length || !$partTypeRow.length) {
			return;
		}

		function updateConditionalFields() {
			var selectedRole = $roleSelect.val();
			if (selectedRole === 'part') {
				$partTypeRow.show();
			} else {
				$partTypeRow.hide();
			}
		}

		// Initial evaluation.
		updateConditionalFields();

		// Change listener.
		$roleSelect.on('change', updateConditionalFields);
	});
})(jQuery);
