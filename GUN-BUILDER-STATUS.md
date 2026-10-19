# Gun Builder Development Status

## Current Phase

Stage 4 completed. Ready for Stage 5.

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
- **Stage 4 Complete: Canonical 2D Layered DOM Renderer + Responsive Scale System**
  - Built generic 2D layered DOM renderer using standard HTML `<img>` elements (explicitly zero Canvas, Fabric.js, Konva, WebGL, or SVG primary engines).
  - Established canonical coordinate system: 1 mm = 1 logical px (780mm reference length = 780 logical px).
  - Preserved original Gallery image aspect ratio mathematically: `logical_height = reference_mm * (image_height / image_width)` with zero distortion, stretching, or recoloring.
  - Implemented server-side initial Base Gun resolver via `?product_id=`, validating existence, catalog eligibility, published status, and `base_gun` role through `TGB_Product_Data`.
  - Embedded minimal, safe JSON initial render payload into `#tgb-initial-render-data` without leaking internal WooCommerce data.
  - Calculated dynamic stage geometry based on Base Gun dimensions with generic workspace padding: horizontal `max(200, 20% width)`, vertical `max(120, 40% height)`, and minimum logical stage height of 500 units.
  - Placed Base Gun centered within logical stage coordinates: `x = (stageWidth - gunWidth) / 2`, `y = (stageHeight - gunHeight) / 2`.
  - Implemented single whole-stage display scale: `displayScale = min(1, viewportWidth / stageWidth)` applied via CSS `transform: scale(displayScale)` on `.tgb-stage`, while `#tgb-stage-frame` maintains physical dimensions (`logical * displayScale`) to prevent layout collapse.
  - Integrated `ResizeObserver` on `#tgb-stage-viewport` with window resize fallback to recalculate `displayScale` smoothly without changing logical coordinates or product proportions.
  - Implemented real logical grid using background gradients matching 10mm (10px minor) and 100mm (100px major) that scale natively with the stage.
  - Built robust state management for loading, empty (no `product_id`), invalid product, and image failure states without layout jumping or broken icons.
  - Confirmed universal two-product scaling (195mm optic rendered at exactly 25.0% width of 780mm gun across both desktop and 320px mobile viewports).
  - Executed customer-facing visual refinements: removed developer badge and implementation subtitle in favor of polished branding ("Build and customize your tactical loadout"), removed future-stage roadmap hints, concealed nonfunctional price/cart presentation until its proper stage, and compacted mobile vertical padding.
  - Retained internal debug/measurement HUD (toggled via `?tgb_debug=1` or `TGB_Renderer.toggleDebug()`) while keeping it hidden by default from customer presentation.
  - Documented Gallery asset quality limitation: current test product image (ID 91639) contains a solid white background, watermark branding, and substantial outer padding; final prototype assets require tightly-cropped, side-profile transparent PNGs.
  - Explicitly preserved boundary: no dragging, pointer events, custom repositioning, coordinate persistence, state store, REST/AJAX endpoints, or cart functionality implemented.
- **Stage 5 Complete: Unified Build State + Pointer Dragging**
  - Built centralized in-memory client-side Build State store (`TGB_BuildState`) as single source of truth for all build components.
  - Implemented generic Part instance representations using unique, collision-resistant instance IDs (`part-...` via `crypto.randomUUID()` with fallback), supporting multiple simultaneous instances of the same WooCommerce product ID.
  - Represented Base Gun in Build State with canonical logical coordinates and dimensions ($1\text{ mm} = 1\text{ logical px}$); Base Gun remains strictly fixed (non-draggable).
  - Implemented unified Pointer Events dragging (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) with pointer capture (`setPointerCapture()`) supporting mouse, touch, and stylus uniformly.
  - Implemented exact screen-to-logical coordinate delta conversion: `logicalDelta = physicalDelta / displayScale`, ensuring stored positions reflect physical millimeter geometry regardless of screen scale.
  - Enforced logical stage boundary clamping: $X \in [0, \text{stageWidth} - \text{partWidth}]$, $Y \in [0, \text{stageHeight} - \text{partHeight}]$, preventing parts from being lost outside the builder workspace.
  - Preserved logical coordinates and visual positioning across viewport resize cycles (desktop $\leftrightarrow$ 390px $\leftrightarrow$ 320px) without coordinate drift.
  - Scoped `touch-action: none` strictly to `.tgb-layer--part` elements; normal page scrolling outside draggable parts remains unaffected.
  - Implemented single active pointer policy to ensure multi-touch gestures do not corrupt drag state.
  - Optimized DOM synchronization using `requestAnimationFrame` queueing on pointer movement, preventing unnecessary style reflows.
  - Maintained modern visual presentation with subtle elevation styling (`is-dragging`), `cursor: grab`/`grabbing`, without resize handles, rotation controls, or color modifications.
  - Clean state mutation API: `setBaseGun`, `addPart`, `removePart`, `updatePartPosition`, `getPart`, `getBaseGun`, `getState`, `reset`, `subscribe`.
  - Memory-only state architecture without database, localStorage, or cookie persistence.
  - Extended diagnostic HUD (`?tgb_debug=1`) to display active dragging instance ID, logical X/Y coordinates, and live display scale.
  - Strictly preserved scope boundaries: no Product Selection UI, category tabs, catalog endpoints, mounting points, snap logic, compatibility rules, pricing/weight totals, or cart integration implemented.

## Current Task

Stage 5 completed, thoroughly tested, and verified. Awaiting supervisor review.

## Next Step

Stage 6: Product Selection UI & Dynamic Part Drawer (drawer tabs, product cards, category switching, and adding parts to build state).