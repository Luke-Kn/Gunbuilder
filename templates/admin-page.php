<?php
if (!defined('ABSPATH')) {
	exit;
}
?>
<script src="http://localhost:10003/wp-content/plugins/Gunbuilder/assets/js/gun-builder_admin.js"></script>
<link rel="stylesheet" href="http://localhost:10003/wp-content/plugins/Gunbuilder/assets/css/admin.css">
<div class="tgb" id="tgb-app">

	<header class="tgb-header">
		<span class="tgb-badge">Taktik Airsoft</span>
		<h1 class="tgb-title"><?php esc_html_e('Admin Panel', 'taktik-gun-builder'); ?></h1>
	</header>

	<div class="tgb-grid">

		<!-- Stage: preview of the current build -->
		<section class="tgb-panel tgb-stage" id="tgb-stage" aria-live="polite">
			<div class="tgb-empty-state tgb" id="item_selector">
				<input type="text" class="tgb-input" name="item" pattern="^\d+$" placeholder="Enter the item ID"
					id="input_id"><button id="submit_id" class="tgb-btn">Submit</button>
			</div>
			<div hidden class="tgb-item-display tgb" id="item_display">
				<img class="main-image" src="" alt="" id="main-image">
				<div>

					<!--<div class="tgb-item-attributes" id="tgb-build-list">
						<label class="item-label" for="">Name</label>
						<input type="text" class="tgb-input" name="item" pattern="^\d+$" placeholder="">
					</div>-->
					<div class="tgb-item-attributes" id="tgb-build-list">
						<label class="item-label" for="">Length</label>
						<input type="text" class="tgb-input" name="item" pattern="^\d+$" placeholder="">
					</div>
					<div class="tgb-item-attributes" id="tgb-build-list">
						<label class="item-label" for="">Height</label>
						<input type="text" class="tgb-input" name="item" pattern="^\d+$" placeholder="">
					</div>
					<button id="submit_id" class="tgb-btn">Add Item</button>
				</div>
			</div>
		</section>

	</div>

	<!-- Component picker -->
	<section class="tgb-panel tgb-picker">
		<div class="tgb-panel-head">
			<h2><?php esc_html_e('Choose components to modify', 'taktik-gun-builder'); ?></h2>
		</div>
		<div class="tgb-panel-body">
			<div class="tgb-pills" id="tgb-pills" role="tablist"></div>
			<div class="tgb-products" id="tgb-products"></div>
		</div>
	</section>

</div>