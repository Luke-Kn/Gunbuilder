# Gun Builder Development Status

## Current Phase

Stage 3 completed. Ready for Stage 4.

## Current Branch

`gun-builder`

## Completed

- Development requirements confirmed.
- Existing Part Selector analyzed and documented (comprehensive architectural audit).
- Git baseline confirmed clean on `gun-builder`.
- **Stage 1 Complete: Safe Plugin Foundation & Legacy Isolation**
  - Refactored `part-selector.php` into modular OOP loader.
  - Isolated legacy `index.html`, Fabric.js v1, Bootstrap 2, and external HTTP jQuery.
  - Created `includes/class-tgb-core.php`, `class-tgb-assets.php`, `class-tgb-shortcode.php`, `class-tgb-product-integration.php`.
  - Built clean semantic shell in `templates/gun-builder.php` scoped to `#taktik-gun-builder`.
  - Built scoped modern CSS foundation in `assets/css/gun-builder.css`.
  - Built lightweight JS initialization foundation in `assets/js/gun-builder.js`.
  - Maintained backward compatibility for shortcode `[part_selector]`.
- **Stage 2 Complete: Dynamic Builder Types + Admin Product Data**
  - Registered dedicated, non-public WordPress taxonomy `tgb_part_type` under `Products → Gun Builder Part Types`.
  - Mapped taxonomy capabilities to WooCommerce product term permissions (`manage_product_terms`, etc.).
  - Added native "Gun Builder" tab to WooCommerce Product Data panel.
  - Implemented product metadata keys: `_tgb_enabled`, `_tgb_ready`, `_tgb_role`, and `_tgb_reference_mm`.
  - Implemented single Part Type assignment dropdown enforcing 1 Part Type per Part product.
  - Implemented conditional admin behavior: Part Type selector hides when Role is Base Gun or Not configured.
  - Implemented automatic cleanup: switching Role to Base Gun or empty clears attached `tgb_part_type` terms.
  - Implemented Builder Ready integrity validation with visible admin notices explaining missing requirements.
  - Implemented strict positive decimal validation for Visual Reference Length (rejecting unit suffixes and malformed input).
  - Implemented clean configuration helpers (`is_configuration_valid()`, `is_ready()`, `is_enabled()`) keeping structural validity strictly independent of Enabled and Ready states.
  - Handled zero-term empty taxonomy state cleanly with informative guidance in the product editor.
  - Verified safe taxonomy deletion behavior (products remain intact, structural validity becomes false).
  - Admin assets scoped strictly to WooCommerce product editor screens.
- **Stage 3 Complete: Product Data Service + WooCommerce Gallery Image Pipeline**
  - Built centralized, authoritative backend product data layer in `includes/class-tgb-product-data.php`.
  - Implemented strict builder gallery image resolver (`get_builder_image_data()`): resolves the FIRST valid attachment from the WooCommerce Product Gallery, preserving original dimensions and aspect ratio, with ZERO fallback to featured images.
  - Established standardized, JSON-serializable product data contract containing product identity, role, dynamic part type, reference length in mm, builder image metadata, WooCommerce storefront pricing, stock status, weight in store unit and normalized grams, and WooCommerce status.
  - Implemented clean catalog eligibility evaluation (`is_catalog_eligible()`) enforcing 7 strict criteria without mutating database state.
  - Implemented continuation cursor streaming Base Gun catalog query (`get_base_guns()`) using supported WordPress/WooCommerce `WP_Query` with deterministic ordering and bounded candidate batching.
  - Implemented continuation cursor streaming Part catalog query by dynamic taxonomy term (`get_parts_by_type()`), verifying seamless term renaming support without hardcoded category names.
  - Verified safe handling of missing weights (explicit `null`, never `0g`), out-of-stock products, unpurchasable products, and broken gallery attachments.

## Current Task

Stage 3 completed and verified. Awaiting supervisor review.

## Next Step

Stage 4: Canonical 2D Layered DOM Renderer + Responsive Scale System (layered image elements, 1 mm = 1 logical px, stage coordinate positioning, responsive scene scaling).