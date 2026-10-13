/**
 * Taktik Gun Builder - Foundation JavaScript (Part 1)
 *
 * Lightweight initialization script. Scoped strictly to #taktik-gun-builder.
 * Future renderer, state store, and touch interaction will be mounted here in subsequent stages.
 */

(function() {
	'use strict';

	/**
	 * Bootstraps the Gun Builder frontend shell.
	 */
	function initGunBuilder() {
		const root = document.getElementById('taktik-gun-builder');
		if (!root) {
			return;
		}

		// Prevent double initialization
		if (root.classList.contains('tgb-ready')) {
			return;
		}

		// Mark shell ready
		root.classList.add('tgb-ready');

		const version = root.dataset.version || (window.taktikGunBuilder && window.taktikGunBuilder.version) || '1.1.0';
		const productId = root.dataset.productId || '0';

		if (window.console && typeof window.console.log === 'function') {
			console.log('[Taktik Gun Builder] Foundation initialized (v' + version + ', initial product: #' + productId + ')');
		}
	}

	// Mount on DOMContentLoaded or immediately if DOM is already ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initGunBuilder);
	} else {
		initGunBuilder();
	}
})();
