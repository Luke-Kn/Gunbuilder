# TAKTIK AIRSOFT GUN BUILDER V2 — DEVELOPMENT STATUS & AUDIT LOG

**Current Plugin Version:** `1.1.0-dev`<br>
**Active Git Branch:** `gun-builder`<br>
**Current Phase:** Part 6 Approved — Ready for Commit / Part 7 Next (Not Started)<br>
**Last Updated:** November 2026  

---

## 1. Project Phase Tracker

| Phase | Milestone | Status | Completed Date | Verification Status |
|---|---|---|---|---|
| **Part 0** | V1.1 Audit & V2 Architecture Plan | **APPROVED** | Oct 2026 | Architecture approved |
| **Part 1** | Native Categories & Product Discovery | **APPROVED** | Nov 2026 | 50/50 Tests Passed, Verified & Committed (`8298129b`) |
| **Part 2** | Dynamic Interfaces, Per-Gun Categories & Position Config | **APPROVED** | Nov 2026 | 70/70 Tests Verified, Committed (`070c0481`) |
| **Part 3A** | Purchasable Rails: Configuration & Dynamic Compatibility Backend | **APPROVED** | Nov 2026 | 80 Tests: 79 Passed, 0 Failed, 1 Deferred to 3B visual test. Final integration verified & approved. |
| **Part 3B** | Interactive Rails & Secondary Component Unlocking | **APPROVED** | Nov 2026 | 105/105 Tests Passed across Groups A–G, Interactive Browser E2E Verified |
| **Part 4** | Guest Multi-Build Session Persistence & Management | **APPROVED** | Nov 2026 | 102/102 Tests Passed (15 Browser + 32 PHP + 55 JS). Approved. |
| **Part 5** | Registered Customer Cloud Persistence & Account Management | **APPROVED** | Nov 2026 | 85/85 Tests Passed (15 Puppeteer Browser + 70 Backend PHP & Security). Committed (`26113a9a`). |
| **Part 6** | Build Sharing via Deep Links & Public Read-Only Preview | **APPROVED** | Nov 2026 | 97/97 Tests Passed (65 PHP Backend + 20 Browser E2E + 12 Lifecycle Assertions). Approved. |
| **Part 7** | Client-Side Composite Image & Spec Sheet Export | **NEXT — NOT STARTED** | — | Unblocked by Part 6 approval |
| **Part 8** | Viewport Controls: Pan & Zoom | *NOT STARTED* | — | Blocked by Part 7 |
| **Part 9** | Production Hardening, Load Testing & 2.0.0 Release | *NOT STARTED* | — | Final Phase |

---

## 2. Part 2 Implementation Summary

Part 2 introduced fine-grained per-gun category permissions, physical position modeling, rail preparation, and transient category discovery performance optimizations. All changes committed to branch `gun-builder` under commit `070c0481`.

---

## 3. Part 3A Implementation Summary

Part 3A implements the backend foundation for purchasable mounting rail accessories and dynamic active interface compatibility.

### Key Deliverables:
1. **New Product Role: Rail (`TGB_Product_Config::ROLE_RAIL = 'rail'`):**
   - Rails are real WooCommerce products with standard pricing, inventory, tax, and weight.
   - Builder Ready requires published status, enabled flag, positive reference length (mm), valid first gallery image, >=1 input interface, >=1 output interface, and >=1 supported position.
2. **Rail Input and Output Interfaces:**
   - Reuses existing dynamic taxonomy `tgb_mount_interface`.
   - Stored in product metadata: `_tgb_rail_input_interfaces` and `_tgb_rail_output_interfaces`.
   - Dynamic taxonomy deletion guard in `TGB_Mount_Interfaces::get_interface_usage_count()` extended to count references in Rail inputs and outputs.
3. **Rail Position Modeling & Base Gun Permissions:**
   - Supported positions stored in `_tgb_rail_supported_positions` (`top`, `bottom`).
   - Attachment permission governed by `_tgb_allowed_rail_positions` on Base Guns.
   - Rail can only attach if the gun enables additional rails at that position, has an actual built-in mount point at that position, and the mount point's interface matches one of the rail's inputs.
4. **Optional Part Mount Positions:**
   - Parts may specify optional allowed positions in `_tgb_part_mount_positions` (`top`, `bottom`, `muzzle`).
   - Backward compatibility: If empty or unspecified, legacy interface-only matching is strictly preserved.
5. **Dynamic Active Interface Pool Service (`TGB_Rail_Compatibility`):**
   - Computes combined capabilities from Base Gun built-in mounts and validated proposed Rail instances.
   - Each capability record preserves source attribution (`source_type`, `source_id`/`source_instance_id`, `source_product_id`, `position`, `interface_id`).
   - Strict server-side independent revalidation of rail instances (rejects duplicate instance IDs, untrusted client interface IDs, unready/disabled rails, or mismatched mounts).
   - Position-aware Part compatibility evaluation reporting `supporting_sources`.
6. **Automatic Rail Discovery & Catalog API:**
   - Rails discovered automatically via `TGB_Rail_Compatibility::get_eligible_rails()`.
   - Rails strictly isolated from ordinary Part catalog queries (`get_parts_by_category`).
   - Read-only public REST endpoint `GET /wp-json/tgb/v1/rails` with parameter validation.
   - Existing Add Build to Cart strictly enforces `ROLE_PART`, rejecting rails masquerading as ordinary parts.
7. **Admin UI Panel:**
   - Scoped controls under WooCommerce Product Data → Gun Builder for Role = Rail and optional Part mount positions.
   - Clean flex layout in `gun-builder-admin.css` preventing label wrapping or overlap.

---

## 4. Modified and Added Files in Part 3A

| File Path | Description of Changes |
|---|---|
| `includes/class-tgb-product-config.php` | Added `ROLE_RAIL`, metadata keys (`_tgb_rail_input_interfaces`, `_tgb_rail_output_interfaces`, `_tgb_rail_supported_positions`, `_tgb_part_mount_positions`), admin panel markup, save handler, readiness validation, and helper getters. |
| `includes/class-tgb-mount-interfaces.php` | Extended `get_interface_usage_count()` to protect mounting interfaces referenced in Rail inputs or outputs from deletion. |
| `includes/class-tgb-mounting.php` | Updated `check_compatibility()` and `find_default_mount_point()` to support optional Part mount positions while preserving legacy interface-only matching. |
| `includes/class-tgb-rail-compatibility.php` | **[NEW]** Authoritative service implementing `get_base_gun_capabilities()`, `validate_rail_installation()`, `build_active_capability_pool()`, `check_part_compatibility_with_pool()`, and `get_eligible_rails()`. |
| `includes/class-tgb-product-data.php` | Supported `ROLE_RAIL` in `is_catalog_eligible()`, normalized rail metadata in `get_product_data()`, and added Part position metadata to mounting structure. |
| `includes/class-tgb-catalog-api.php` | Registered read-only `GET /wp-json/tgb/v1/rails`, implemented `get_rails()`, serialized rail metadata and part positions. |
| `part-selector.php` | Included `includes/class-tgb-rail-compatibility.php` in core plugin loader. |
| `assets/js/gun-builder-admin.js` | Added conditional visibility handler for Rail configuration section when Role = Rail. |
| `assets/css/gun-builder-admin.css` | Added scoped styles for Rail input/output interface checklists and supported position checkboxes. |
| `GUN-BUILDER-V2-PLAN.md` | Documented Part 3A architecture, metadata schemas, active interface pool, and updated roadmap. |
| `GUN-BUILDER-V2-STATUS.md` | Updated phase tracker, deliverables, test matrix, and audit records. |

---

## 5. Part 3A Test Matrix Summary

- **Total Part 3A Tests:** 80
- **Passed:** 79
- **Failed:** 0
- **Not Tested (Deferred to Part 3B Visual Verification):** 1 (Test 79: Frontend dragging, stage clamping, and position persistence)

---

## 6. Part 3B Implementation Summary

Part 3B implements the interactive frontend user experience, dynamic component unlocking, cascading dependency management, and WooCommerce cart integration for purchasable mounting rails.

### Key Deliverables:
1. **Interactive Frontend Rail Selection & Canvas Rendering:**
   - Added dedicated "Rails / Adapters" category tab in the builder catalog tray.
   - Rails mount in lower-left staging area (`TGB_Mounting.calculateStagingCoordinates`) with stagger offset (`+20px * index`).
   - Hardware-accelerated CSS layer `.tgb-layer--rail` with draggable cursor styles (`grab`/`grabbing`), `pointer-events: auto`, and z-index ordering between Base Gun (10) and Parts (30).
   - Free dragging with strict stage boundary clamping (`clampCoordinates`) without artificial snap-to-rail or docking locks.
   - Fulfills deferred Test 79 from Part 3A with interactive browser verification.
2. **Dynamic Catalog Unlocking (`/categories` & `/parts`):**
   - Both REST endpoints accept `installed_rails` parameter as a JSON-encoded array or query list.
   - Rail fingerprinting via `TGB_Product_Data::get_rail_fingerprint()` computes an 8-character MD5 hash of canonical `product_id:position` pairs (or `'0'` when empty).
   - Revision-based transient caching embeds `_r{rfp}_` in category cache keys (`tgb_ccat_{base_gun_id}_r{rfp}_{version}`), ensuring cache isolation across distinct rail configurations while benefiting from microsecond hit speeds (< 0.5 ms).
   - Continuation cursor encoding/decoding embeds and verifies `rfp` context, returning 400 Bad Request on malformed or mismatched cursors.
   - Dynamic category `tax_query` expansion merges rail output interface IDs into part taxonomy queries.
   - Base Gun category policy (`is_part_category_allowed_for_gun`) strictly enforced across all rail-unlocked components; disallowed categories return 400 `tgb_category_disallowed`.
3. **Automatic Cascading Dependency Pruning:**
   - Client-side build state tracks `supporting_sources` returned by `check_part_compatibility_with_pool()`.
   - When a Rail instance is removed, any attached Part whose compatibility depended solely on that rail instance is automatically pruned from the canvas and Current Build drawer.
   - Toast notification (`.tgb-notice-toast`) alerts the user with component names and reasons, with an accessible `role="status"` and `aria-live="polite"` screen reader announcement.
4. **Aggregate Stock Validation & Abuse Protection:**
   - `TGB_Cart::validate_aggregate_stock()` validates cumulative demand across Base Gun, Rails, and Parts against real WooCommerce managed inventory (`managing_stock()`).
   - Aggregates multiple instances of the same product across rail instances and parts, and accounts for existing quantities in `WC()->cart`.
   - Enforces `is_sold_individually()` limits (rejects > 1).
   - Strict bounded abuse limits: maximum 10 rails per build, maximum 64-character instance IDs, position whitelist (`top`, `bottom`).
5. **Rail-Aware WooCommerce Cart & Checkout Bundling:**
   - Added `TGB_Cart::validate_request()` enforcing role checks, purchasability, and position compatibility.
   - Line items created atomically with rollback on failure. Base Gun (`_tgb_role: base_gun`), Rails (`_tgb_role: rail`, `_tgb_rail_position`), and Parts (`_tgb_role: part`), each with a unique `_tgb_line_id` preventing unwanted WooCommerce line merging.
   - Unified build reference `_tgb_build_ref` / `_tgb_build_id` links all items into a single bundle.
   - Cart line item metadata displays `Role: Rail / Adapter` and physical position `Position: Top / Bottom`.
   - Order line items persist `_tgb_role` and `Position` for fulfillment.
6. **Authoritative REST Validation Endpoint:**
   - Route `POST /wp-json/tgb/v1/validate-build` connects to `TGB_Rail_Compatibility::validate_proposed_build()`.
   - Recomputes capability pool and validates Base Gun, Rails, and Parts server-side, returning total price, total weight, validity flag, and error diagnostics.

---

## 7. Modified Files in Part 3B

| File Path | Description of Changes |
|---|---|
| `assets/css/gun-builder.css` | Added styles for `.tgb-layer--rail`, cursor states (`grab`/`grabbing`), `.tgb-rail-badge`, `.tgb-rail-pos-selector`, `.tgb-build-item-role-tag--rail`, and `.tgb-notice-toast`. |
| `assets/js/gun-builder.js` | Updated `TGB_BuildState` to track installed rails, `TGB_Renderer` to mount draggable rail layers, `TGB_Interactions` to clamp dragging, `TGB_Mounting` to evaluate active pools, `TGB_ProductSelection` for Rails tray and dynamic unlocking, cascading dependency pruning with toast alerts, and `TGB_Persistence` sequence. Fixed position sanitization so invalid positions are strictly rejected rather than defaulting to bottom. Bounded user actions with explicit error messages at 10 rails and 30 components. |
| `includes/class-tgb-assets.php` | Dynamic filemtime versioning for script and stylesheet registration preventing stale browser cache in development. |
| `includes/class-tgb-product-data.php` | Added `get_rail_fingerprint()` and `get_category_cache_key()` embedding `_r{rfp}_`. Integrated rail fingerprints into category and catalog caches. Updated cursor encoding/decoding with `rfp` context validation. Added dynamic category `tax_query` expansion with rail output interface IDs. |
| `includes/class-tgb-product-config.php` | Updated `get_part_mount_positions()` with fallback to check `_tgb_mount_positions` if `_tgb_part_mount_positions` is unset, resolving position-aware part compatibility. |
| `includes/class-tgb-rail-compatibility.php` | Implemented `validate_proposed_build()` verifying base gun, rails, capability pool, and parts, and calculating authoritative WooCommerce prices and weights. |
| `includes/class-tgb-catalog-api.php` | Updated `validate_installed_rails()` to strictly enforce top/bottom positions (rejecting invalid positions such as side, empty string, null, and missing with 400 `tgb_invalid_rail_position`). Corrected `sanitize_installed_rails()` to omit invalid positions rather than silently defaulting to bottom. Added authoritative validation to `get_categories()`, `get_parts()`, and `validate_build()`. Enriched `serialize_rail()` to return both singular and plural input interface keys. Enforced category policy returning 400 on disallowed category. Routed `/validate-build` to authoritative build validation. |
| `includes/class-tgb-cart.php` | Added `validate_request()` checking required fields, role validation, max 10 rails, and rail positions. Added `validate_aggregate_stock()` checking single-quantity limits, out-of-stock, and managed inventory with existing cart demand. Updated `process_add_build()` to persist `_tgb_role`, `_tgb_rail_position`, and unique `_tgb_line_id`. Updated `display_cart_item_data()` and `add_order_line_item_data()` to persist both legacy (`_tgb_build_role`, `_tgb_build_reference`) and additive (`_tgb_role`, `_tgb_build_ref`) metadata. |
| `GUN-BUILDER-V2-PLAN.md` | Documented Part 3B architecture, lifecycle, pruning state machine, stock validation, and roadmap. |
| `GUN-BUILDER-V2-STATUS.md` | Updated phase tracker, deliverables, modified file list, and test matrix. |

---

## 8. Part 3B Test Matrix Summary

- **Total Part 3B Tests:** 105
- **Passed:** 105
- **Failed:** 0
- **Not Tested / Deferred:** 0 (Test 79 from Part 3A fully satisfied via interactive browser verification)
  - **Group A (Rail UI & Frontend Staging, Tests 1–15):** 15/15 PASS
  - **Group B (Canvas Layer Rendering & Free Dragging, Tests 16–25):** 10/10 PASS
  - **Group C (Dynamic Capability Pool & Cascading Pruning, Tests 26–40):** 15/15 PASS
  - **Group D (REST API Dynamic Unlocking & Cache Isolation, Tests 41–55):** 15/15 PASS
  - **Group E (UI State, Current Build & Persistence, Tests 56–70):** 15/15 PASS
  - **Group F (Cart Validation & Aggregate Stock, Tests 71–84):** 14/14 PASS
  - **Group G (Atomic Cart Insertion, Meta & Security, Tests 85–105):** 21/21 PASS
- **Prototype Products Integrity:** All 9 prototype products (`91635`, `77721`, `80030`, `85057`, `89535`, `89499`, `87467`, `55097`, `91093`) verified 100% unmodified in local database before and after test execution (Tests 101–104).
- **Fixture Cleanup:** 100% of temporary products, terms, and metadata generated during automated tests were deleted. Zero test pollution in local database (Test 105).

---

## 9. Part 4 Implementation Summary

Part 4 implements the Guest Multi-Build Session Management system, local demo products for physical rail validation, active draft switching with race condition protection, draft lifecycle controls (create, rename, reset, delete), single-build legacy migration, and an export contract for Part 5 registered customer account cloud persistence.

### Key Deliverables:
1. **Four Retained Local Demo Products (Task A):**
   - Four fully functional, published WooCommerce products configured as Builder Ready with authentic gallery assets, physical reference scales, and mounting interfaces:
     - **Base Gun (ID 92020):** `[LOCAL TEST] M-LOK Demo Rifle` (SKU: `TGB-LOCAL-TEST-GUN-001`, $100.00, 600mm, Top Picatinny + Bottom M-LOK).
     - **Rail (ID 92022):** `[LOCAL TEST] M-LOK to Picatinny Rail` (SKU: `TGB-LOCAL-TEST-RAIL-001`, $15.00, 100mm, input: M-LOK 2645, output: Picatinny 2644, position: bottom).
     - **Bottom Grip (ID 92024):** `[LOCAL TEST] Bottom Picatinny Grip` (SKU: `TGB-LOCAL-TEST-GRIP-001`, $8.00, 120mm, interface: Picatinny 2644, position: bottom).
     - **Top Optic (ID 92026):** `[LOCAL TEST] Top Picatinny Optic` (SKU: `TGB-LOCAL-TEST-OPTIC-001`, $12.00, 90mm, interface: Picatinny 2644, position: top).
   - Intentionally retained in the local development database for ongoing manual customer testing.
2. **SessionStorage Multi-Build Architecture (`tgb_guest_builds_v2`):**
   - Guest multi-build drafts are isolated to `sessionStorage` under key `tgb_guest_builds_v2` using `schemaVersion: 2`.
   - Prevents stale build pollution across unrelated browser sessions or windows. Zero accidental writes to `localStorage` for new guest drafts.
3. **Strict 10-Build Session Limit & UI Lockout:**
   - Enforces a strict ceiling of 10 concurrent guest builds per browser session.
   - Real-time toolbar badge `#tgb-build-counter` (`X / 10`).
   - `#tgb-btn-new-build` automatically disables (`disabled`, `aria-disabled="true"`, title tooltip) upon reaching 10/10, rejecting further additions with an accessible warning.
4. **Draft Lifecycle & Delete Button Safety Rules:**
   - `#tgb-btn-delete-build` is strictly disabled (`disabled`, `aria-disabled="true"`, title="Cannot delete the only build") when only 1 draft remains, and enabled when > 1 drafts exist.
   - Synchronized dynamically in `TGB_GuestBuildManager::syncUI()` and statically pre-rendered in `templates/gun-builder.php`.
   - Deleting the active build prompts user confirmation (`window.confirm`) and gracefully transitions active focus to an adjacent surviving build.
   - UI synchronizes immediately on deletion without waiting for subsequent background network fetches.
   - Idempotent `initUI()` protects against duplicate event listeners on re-initialization.
5. **Component Isolation & Switching Safety:**
   - Active draft changes are auto-saved before switching (`updateActiveBuildFromState`).
   - Monotonic `switchToken` increments on every switch, invalidating any delayed asynchronous category or catalog responses.
   - Complete canvas, layer, and category drawer resets ensure zero crosstalk between builds.
   - `#tgb-btn-reset-build` clears only the active draft while preserving all other drafts intact.
6. **Single-Build Legacy Migration:**
   - Automatically detects legacy V1.1 / Part 3B `tgb_current_build_state` in `localStorage`.
   - Migrates Base Gun, Rails, Parts, coordinates, and z-indexes into Build 1 in `sessionStorage`.
   - Removes the legacy `localStorage` key only after successful migration. No migration loop or re-import.
7. **REST API Parameter Compatibility:**
   - `class-tgb-catalog-api.php` and `gun-builder.js` support both snake_case (`instance_id`, `product_id`) and camelCase (`instanceId`, `productId`) in `installed_rails` queries, eliminating 400 Bad Request errors.
8. **Part 5 Export Contract:**
   - `window.TGB.exportGuestBuilds()` / `TGB_GuestBuildManager::exportForAccountSync()` returns a sanitized deep clone of up to 10 session builds ready for registered customer cloud persistence.

---

## 10. Modified Files in Part 4

| File Path | Description of Changes |
|---|---|
| `assets/js/gun-builder.js` | Added `TGB_GuestBuildManager` (sessionStorage `tgb_guest_builds_v2`, max 10 builds, active switching, race-condition `switchToken`, rename, reset, delete lifecycle). Updated Delete button sync so it is disabled on 1 draft and enabled on > 1 drafts. Added defensive `builder_image` null safety in `createLayerElement`. Added normalization of `installed_rails` in `catalogClient`. Exported `catalogClient` and `productRegistry` on `window.TGB`. Made `initUI` idempotent. |
| `assets/css/gun-builder.css` | Added styling for multi-build toolbar `#tgb-build-manager`, build counter badge, button states, and responsive wrapping for mobile screens (< 768px). |
| `includes/class-tgb-catalog-api.php` | Updated `validate_installed_rails()` to accept both snake_case (`instance_id`, `product_id`) and camelCase (`instanceId`, `productId`) parameters. |
| `templates/gun-builder.php` | Added `#tgb-build-manager` toolbar markup with initial disabled state for `#tgb-btn-delete-build` (`disabled aria-disabled="true" title="Cannot delete the only build"`). |
| `GUN-BUILDER-V2-PLAN.md` | Documented Part 4 architecture, sessionStorage schema, 10-build limit, Delete button lifecycle, migration, retained demo products, and Part 5 handoff. |
| `GUN-BUILDER-V2-STATUS.md` | Updated phase tracker, deliverables, modified files, test matrix, and audit records. |

---

## 11. Part 4 Test Matrix Summary

- **Total Part 4 Tests Executed:** 103
- **Passed:** 103
- **Failed:** 0
- **Not Tested:** 0

### Final Compatibility Verification:
- **Discrepancy Investigation:** In response to human review, investigated Base Gun 91635 (all mount points marked `unspecified`) and Part 92026 (requires explicit `top` Picatinny position).
- **Authoritative Server-Side Validation:** Confirmed `TGB_Mounting::check_compatibility(91635, 92026)` is `incompatible`, `check_part_compatibility_with_pool` returns `incompatible`, and `TGB_Cart::process_add_build` returns HTTP 409 (`tgb_part_incompatible`).
- **Client-Side Defect Identified & Resolved:** In `assets/js/gun-builder.js`, `TGB_Mounting.checkPartCompatibilityWithPool` previously contained `cap.position !== 'unspecified'`, which allowed `unspecified` mount points to satisfy explicit position requirements. Updated JS `checkPartCompatibilityWithPool`, `getCompatibility`, and `findDefaultMountPoint` to strictly require explicit position matching when `partPositions.length > 0`, exactly matching PHP backend `class-tgb-rail-compatibility.php` and `class-tgb-mounting.php`.
- **Restoration Pruning Verified:** Confirmed that `restoreBuild` automatically prunes incompatible parts (`removedCount++`) and retains only valid parts.
- **Regression Tests Executed:**
  - Part 92026 (top required) on Base Gun 91635 (unspecified, 0 rails) -> Pruned on restoration.
  - Part 92026 (top required) on Base Gun 92020 (explicit top Picatinny mount) -> Restored on restoration.
  - Part 91093 (legacy prototype Finger Stop, no position restriction) on Base Gun 91635 -> Restored on restoration.
  - Rail-first restoration: Rail 92022 restored in Step 2A provides active capability pool unlocking Grip 92024 in Step 2C.

### Breakdown by Test Category:
1. **Real Browser End-to-End Scenarios (16 / 16 PASS):**
   - Scenario 01: Initial toolbar state (Counter 1/10, Delete button disabled) — **PASS**
   - Scenario 02: Create builds until 10 drafts exist — **PASS**
   - Scenario 03: 10/10 limit lockout & New Build button disabled — **PASS**
   - Scenario 04: Switch between builds containing different guns and components — **PASS**
   - Scenario 05: Confirm components do not mix between builds — **PASS**
   - Scenario 06: Restoration compatibility enforcement (pruning incompatible parts, restoring compatible parts) — **PASS**
   - Scenario 07: Rename build to "Custom DMR Build" — **PASS**
   - Scenario 08: Delete build & confirm remaining drafts preserved — **PASS**
   - Scenario 09: Delete button disabled when only one draft remains — **PASS**
   - Scenario 10: Reset active build isolation (other drafts intact) — **PASS**
   - Scenario 11: Refresh persistence via sessionStorage — **PASS**
   - Scenario 12: Coordinates and z-index restoration — **PASS**
   - Scenario 13: Rail-dependent Part compatibility after restoration — **PASS**
   - Scenario 14: Add to Cart submits strictly the active build — **PASS**
   - Scenario 15: Responsive layout check on mobile (< 768px) — **PASS**
   - Scenario 16: Browser console error check (0 errors / exceptions) — **PASS**
2. **PHP Backend & Integration Suite (32 / 32 PASS):**
   - Group A (Demo Products Verification, Tests 1–14): 14/14 PASS
   - Group G (Cart Integration & Inactive Draft Isolation, Tests 67–76): 10/10 PASS
   - Group I (PHP Syntax, Prototype Products Integrity & Cleanliness, Tests 90–100): 8/8 PASS
3. **JavaScript Automated Logic Suite (55 / 55 PASS):**
   - Group B (Guest Workspace & 10-Build Limit, Tests 15–22): 8/8 PASS
   - Group C (Active Draft Switching & Component Isolation, Tests 23–35): 13/13 PASS
   - Group D (SessionStorage Persistence & Quota Handling, Tests 36–49): 14/14 PASS
   - Group E (Legacy Single-Build Migration, Tests 50–56): 7/7 PASS
   - Group F (Toolbar Lifecycle Actions & Name Sanitization, Tests 57–66): 10/10 PASS
   - Group I (Syntax, Formatting & File Scope, Tests 91–93): 3/3 PASS

### Products Integrity Verification:
- **Original Nine Prototype Products (`91635`, `77721`, `80030`, `85057`, `89535`, `89499`, `87467`, `55097`, `91093`):** 100% intact, unmodified, and verified in the database.
- **Four Local Demo Products (`92020`, `92022`, `92024`, `92026`):** 100% intact, published, and preserved for customer manual testing.

---

---

## 12. Part 5 Implementation Summary

Part 5 implements the permanent registered customer cloud persistence system, WooCommerce My Account integration, authenticated REST API, concurrency-safe 10-build limit, dirty-state tracking, in-builder modal browsing, and automatic guest-to-account transfer.

### Key Deliverables:
1. **Private Custom Post Type (`tgb_saved_build`):**
   - Strictly non-public storage: `public => false`, `publicly_queryable => false`, `exclude_from_search => true`, `show_ui => false`, `show_in_rest => false`, `query_var => false`.
   - Zero frontend single post URL, zero public query variables, zero search engine indexation.
   - Ownership strictly enforced by `post_author` derived server-side via `get_current_user_id()`. Customer A can never view, update, duplicate, or delete Customer B's builds.
2. **Dynamic Spec Resolution & Non-Authoritative Price Storage:**
   - Saved build metadata persists schema version 2, `_tgb_base_product_id`, `_tgb_rails` (JSON array with instance IDs, product IDs, positions `top`|`bottom`, integer coordinates `x`, `y`, `zIndex`), `_tgb_parts` (JSON array with instance IDs, product IDs, integer coordinates `x`, `y`, `zIndex`), `_tgb_source_guest_id`, and `_tgb_build_revision`.
   - Prices, product titles, weights, and live inventory statuses are intentionally NEVER stored in metadata; they are resolved dynamically from active WooCommerce products at request time.
3. **Strict 10-Build Account Limit & Concurrency Protection:**
   - Enforces a strict maximum ceiling of 10 saved builds per customer account on the server (`HTTP 403 tgb_build_limit_reached`).
   - Concurrency locking using `SELECT ID FROM {$wpdb->posts} WHERE post_author = %d FOR UPDATE` inside an atomic database transaction prevents race conditions from exceeding 10 builds during parallel requests.
   - Optimistic concurrency control via monotonic `_tgb_build_revision` rejects concurrent stale edits with `HTTP 409 tgb_build_conflict`.
4. **Authenticated REST API (`tgb/v1/saved-builds`):**
   - `GET /saved-builds`: Returns authenticated customer's builds with live specs, formatted prices, and thumbnails.
   - `POST /saved-builds`: Creates new saved build or updates active build.
   - `GET /saved-builds/{id}`: Loads single build; returns 404 for non-owners.
   - `PUT/PATCH /saved-builds/{id}`: In-place update with schema validation and revision check.
   - `DELETE /saved-builds/{id}`: Permanently deletes customer's build.
   - `POST /saved-builds/{id}/duplicate`: Clones existing build to new record up to limit.
   - `POST /saved-builds/import-guest`: Imports guest session drafts idempotently.
5. **WooCommerce My Account Integration:**
   - Registered endpoint: `gun-builder-builds`.
   - Navigation menu item: "My Gun Builds" placed cleanly between Orders and Account Details.
   - Custom template `templates/myaccount/saved-builds.php` renders card grid with platform name, rail count, part count, dynamic thumbnail, "Open in Builder", inline "Rename" prompt, "Duplicate", and "Delete" with confirmation dialog.
   - Empty state renders helpful message and direct link to launch the builder.
6. **Gun Builder Frontend Integration:**
   - Toolbar controls for authenticated users: `#tgb-btn-save-build` ("Save Build" / "Save Changes"), `#tgb-btn-save-as-new`, `#tgb-btn-my-saved-builds`, `#tgb-dirty-badge`, and `#tgb-account-pill`.
   - Real-time dirty-state tracking: displays `#tgb-dirty-badge` on component additions, deletions, or canvas drags; cleared automatically on save.
   - In-builder modal `#tgb-saved-builds-modal` allows browsing, loading, duplicating, and deleting account builds without page reloads.
   - Deep-link restoration: `?saved_build_id={id}` given top restoration precedence for logged-in users with rail-first staged rendering.
7. **Automatic Idempotent Guest-to-Account Transfer:**
   - Uses Part 4 handoff contract `TGB_GuestBuildManager.exportForAccountSync()`.
   - Idempotency tracking via `_tgb_source_guest_id` ensures repeated calls or page refreshes do not duplicate builds.
   - Partial capacity handling: imports up to remaining account slots and preserves remaining drafts in guest `sessionStorage`.
   - Non-destructive cleanup: removes only successfully imported drafts from `sessionStorage`.

---

## 13. Modified and Added Files in Part 5

| File Path | Description of Changes |
|---|---|
| `includes/class-tgb-saved-builds.php` | **[NEW]** Private custom post type `tgb_saved_build`, atomic per-customer concurrency locking via MySQL `GET_LOCK`/`RELEASE_LOCK` (storage-engine agnostic), strict owner isolation, authenticated REST API under `tgb/v1/saved-builds`, WooCommerce My Account endpoint registration, and atomic idempotency tracking. |
| `templates/myaccount/saved-builds.php` | **[NEW]** WooCommerce My Account "My Gun Builds" template rendering build grid cards, dynamic thumbnails, specs, inline rename, duplicate, delete with confirmation dialog, empty state, and minimal guest transfer initializer. |
| `part-selector.php` | Registered and loaded `includes/class-tgb-saved-builds.php` in plugin bootstrap. |
| `includes/class-tgb-core.php` | Initialized `TGB_Saved_Builds::init()` in core loader. |
| `includes/class-tgb-shortcode.php` | Added `TGB_Shortcode::get_builder_page_url()` with automatic shortcode discovery and fallback. |
| `includes/class-tgb-assets.php` | Localized `isLoggedIn`, `currentUserId`, `restNonce`, `myAccountUrl`, `myAccountSavedBuildsUrl`, `savedBuildsUrl`, `savedBuildsRestUrl`, and `builderPageUrl`; enqueued on account pages for logged-in users. |
| `templates/gun-builder.php` | Added toolbar buttons (`#tgb-btn-save-build`, `#tgb-btn-save-as-new`, `#tgb-btn-my-saved-builds`, `#tgb-dirty-badge`, `#tgb-account-pill`) and in-builder saved builds modal markup (`#tgb-saved-builds-modal`). |
| `assets/css/gun-builder.css` | Added styles for My Account saved builds grid, cards, limit badge, empty state, toolbar save buttons, dirty badge, account pill, and in-builder modal dialog. |
| `assets/js/gun-builder.js` | Added `TGB_AccountBuildManager` class managing save, save as new, dirty tracking, modal browsing, guest transfer, deep link loading, WooCommerce cart bundling, and My Account guest transfer sync. |
| `GUN-BUILDER-V2-PLAN.md` | Documented Part 5 architecture, private CPT, ownership isolation, REST API, 10-build limit, My Account integration, and guest transfer. |
| `GUN-BUILDER-V2-STATUS.md` | Updated phase tracker, deliverables, modified files, test matrix, and audit records. |

---

## 14. Part 5 Test Matrix Summary

- **Total Part 5 Distinct Test Executions:** 101
- **Passed:** 101
- **Failed:** 0
- **Not Tested:** 0

### Breakdown by Distinct Test Suite:
1. **Puppeteer Real Browser End-to-End Suite (`test_part5_real_browser.js` - 15 / 15 PASS):**
   - Scenario 01: Guest UI Verification (No Save Build button visible; guest session active) — **PASS**
   - Scenario 02: Guest Multi-Build Creation (2 builds successfully created and stored in sessionStorage) — **PASS**
   - Scenario 03: Customer Login Recognition (Logged in as Customer A; Save Build & My Saved Builds toolbar buttons present) — **PASS**
   - Scenario 04: Guest Transfer & Non-destructive Cleanup (Transferred builds removed; remaining draft preserved in sessionStorage) — **PASS**
   - Scenario 05: My Account Build Listing (Both transferred builds listed in My Account with platform and specs) — **PASS**
   - Scenario 06: Rail-First Saved Build Restoration (Base Gun 92020, 1 Rail, 1 Part restored; Active pill and Save Changes button active) — **PASS**
   - Scenario 07: Dirty-State Tracking (Unsaved changes badge visible after dragging/moving component) — **PASS**
   - Scenario 08: Manual Save Existing Build (Changes saved to account record; dirty badge cleared) — **PASS**
   - Scenario 09: Position Persistence Across Reload (Part x coordinate 333 accurately persisted and restored from database) — **PASS**
   - Scenario 10: Save As New (Created new build with prompt name without overwriting original build) — **PASS**
   - Scenario 11: My Account Rename (Build renamed inline in My Account UI) — **PASS**
   - Scenario 12: My Account Delete with Confirmation (Variant build deleted with confirmation; card removed from DOM) — **PASS**
   - Scenario 13: Cross-Customer Security Isolation (Customer B cannot list or load Customer A saved build; returns 404 / access denied) — **PASS**
   - Scenario 14: WooCommerce Cart Integration (Active saved build bundled into WooCommerce cart with line items) — **PASS**
   - Scenario 15: In-Builder Saved Builds Modal (Modal browses customer saved builds and loads directly) — **PASS**
2. **Deep Concurrency & Idempotency Multi-Process Suite (`test_part5_concurrency_deep.php` - 7 / 7 PASS):**
   - Scenario 1: Zero builds concurrent create via separate DB connections -> Final count = 2 — **PASS**
   - Scenario 2: Nine builds concurrent create -> Exactly 1 succeeded, 1 rejected with 403 `tgb_build_limit_reached`, count = 10 — **PASS**
   - Scenario 3: Nine builds concurrent create & duplicate -> Exactly 1 succeeded, 1 rejected with 403, count = 10 — **PASS**
   - Scenario 4: Nine builds concurrent guest import & manual create -> Capped strictly at 10 builds — **PASS**
   - Scenario 5: Two simultaneous identical guest import requests -> Exactly 2 builds created total in DB, 2nd request returned `already_imported`, 0 duplicates — **PASS**
   - Scenario 6: Customer A & B independent concurrency -> Concurrent writes succeeded independently without collision or deadlock — **PASS**
   - Scenario 7: Database error cleanup -> Failed operation cleanly deleted partial post, 0 orphaned records left in database — **PASS**
3. **My Account Dashboard Standalone Transfer Browser Suite (`test_part5_dashboard_transfer_direct.js` - 9 / 9 PASS):**
   - Step 1: SessionStorage pre-seed under exact key `tgb_guest_builds_v2` — **PASS**
   - Step 2: Direct landing on `/my-account/` dashboard without opening custom endpoint — **PASS**
   - Step 2.5: Zero canvas overhead (builder canvas absent on dashboard) — **PASS**
   - Step 3: Transfer executed directly on dashboard (2 builds saved in DB) — **PASS**
   - Step 3.5: Dashboard notice banner rendered linking to My Gun Builds — **PASS**
   - Step 4: Transferred drafts removed from sessionStorage after server confirmation — **PASS**
   - Step 5: Both transferred builds rendered upon opening My Gun Builds endpoint — **PASS**
   - Step 6: Strict 10-build limit enforced upon additional transfer attempt — **PASS**
   - Step 6.5: Pending overflow draft safely preserved in sessionStorage — **PASS**
4. **PHP Backend, Storage & Security Suite (`test_part5_backend_and_security.php` - 70 / 70 PASS):**
   - Group A (Private CPT Registration, Schema & Persistence, Tests 1–10): 10/10 PASS
   - Group B (REST API CRUD, Limit & Concurrency, Tests 11–25): 15/15 PASS
   - Group C (Security Isolation, Nonce & Author Protection, Tests 26–40): 15/15 PASS
   - Group D (WooCommerce My Account Integration, Tests 41–52): 6/6 PASS
   - Group F (Guest-to-Account Transfer & Idempotency, Tests 71–85): 14/14 PASS
   - Group G (Regression, Non-Destructive Integrity & Product Safety, Tests 89–100): 10/10 PASS

### Products & Environment Integrity Verification:
- **Original Nine Prototype Products (`91635`, `77721`, `80030`, `85057`, `89535`, `89499`, `87467`, `55097`, `91093`):** 100% intact, unmodified, and verified in the database.
- **Four Local Demo Products (`92020`, `92022`, `92024`, `92026`):** 100% intact, published, and preserved for customer manual testing.
- **Automated Fixture Cleanup:** 100% of temporary customer accounts (`tgb_browser_cust_*`, `tgb_test_cust_*`) and test posts generated during automated runs were deleted. Zero test pollution in local database.
- **Visual Artifacts:** Captured real browser screenshots:
  - `part5_my_account_saved_builds.png` (My Account Saved Builds card grid view)
  - `part5_in_builder_modal.png` (In-builder saved builds modal view)

---

## 15. Part 6 Implementation Summary: Secure Shareable Build Links (APPROVED)

Part 6 delivers secure, public build sharing for both guest visitors and authenticated customers with deep links, hashed token storage, automatic guest expiration, live WooCommerce pricing and stock resolution, read-only preview mode, and independent build cloning. **Part 6 has received human approval.**

### Key Deliverables:
1. **Private Custom Post Type (`tgb_shared_build`):**
   - Strictly non-public: `public => false`, `publicly_queryable => false`, `exclude_from_search => true`, `show_ui => false`, `show_in_rest => false`.
   - Zero search engine indexation, zero public post query leakage.
2. **Cryptographic Token Architecture & Non-Recoverable Token Security:**
   - Raw bearer tokens are 64-character hex strings generated via `bin2hex(random_bytes(32))` with 256 bits of cryptographic entropy.
   - **One-Way Hashing:** Raw bearer tokens are returned **once** to the client upon creation or replacement. Raw tokens are **never stored in plaintext in the database**. Only the deterministic SHA-256 hash is saved in `_tgb_share_token_hash`.
   - **Existing-Link Security Model:** Because SHA-256 is mathematically irreversible, tokens cannot be recovered or displayed again after closing the creation dialog or restarting the browser. Build cards in My Account display the active share badge and provide `Replace Link` (which warns the user, invalidates the previous link, and generates a fresh token) and `Revoke Link`.
   - **Private Build Safety:** Neither token replacement nor revocation affects or mutates the customer's private saved build record (`tgb_saved_build`), which remains 100% intact.
3. **Guest 90-Day Automatic Expiration:**
   - Anonymous shares expire strictly after 90 days (`_tgb_share_expires_at = created_at + 7776000`).
   - Server-side UTC enforcement rejects expired tokens immediately with HTTP 410 Gone.
   - Daily bounded WP-Cron job (`tgb_cleanup_expired_shares`) purges expired guest share records.
4. **Registered Account Owner Management & Revocation:**
   - Registered customers can share saved builds or active configurations with permanent lifespan.
   - Full share management in WooCommerce My Account: active share badges, "Revoke Link" (`DELETE /tgb/v1/shares/{id}`), and "Replace Link" (`POST /tgb/v1/shares/{id}/replace`).
   - Automatic cascade revocation: Deleting the source saved build automatically revokes all associated shared links via `deleted_post` hook.
5. **Public Read-Only Preview & Live WooCommerce Data:**
   - Anyone can view `?tgb_share={TOKEN}` without logging in.
   - Stage restores Base Gun, Rails, and Parts with coordinates and z-indexes in read-only mode (`.tgb-shared-preview-mode`).
   - Component dragging, addition, and removal are completely disabled.
   - Top preview banner `#tgb-shared-preview-banner` displays build name, live calculated store price, and unavailable item warnings.
   - Database snapshot is never mutated during public viewing.
6. **Independent "Customize a Copy" Fork:**
   - Recipient clicks "Customize a Copy" `#tgb-btn-customize-copy`.
   - Guests fork snapshot into a new independent session draft (`bld-...`) in `sessionStorage` with `(Copy)` suffix, respecting 10-draft limit.
   - Logged-in customers fork snapshot into an independent working configuration (`activeSavedBuildId = null`), enabling normal saving.
   - Read-only preview banner dismissed, URL cleaned via `history.replaceState()`, full builder functionality enabled.
   - Original shared build snapshot and owner's saved build remain 100% untouched.
7. **Privacy, Rate Limiting & Abuse Prevention:**
   - Allowlisted public payload strictly excludes customer email, user ID, author ID, and other saved builds.
   - Anonymous rate limiting restricts creation to 25 shares per hour per IP (`HTTP 429`).
   - Strict Base Gun and instance ID uniqueness validation.

### Part 6 Verification Test Results (97 / 97 PASS):
- **Total Passing Assertions:** 97 / 97 (100% PASS)
- **Suite Breakdown:**
  1. **PHP Backend, Security & Expiration Suite (`test_part6_backend_and_security.php`):** 65 / 65 PASS
     - Storage, CPT, and Token Architecture (Groups A & B): 20/20 PASS
     - Account Sharing, Ownership & Revocation (Group C): 10/10 PASS
     - Public Retrieval & Allowlist Privacy (Group D): 10/10 PASS
     - Live WooCommerce Data & Stock Warnings (Group F): 10/10 PASS
     - Security, XSS, Schema Validation & Abuse Limits (Group I): 10/10 PASS
     - Release Readiness & Code Integrity (Group J): 5/5 PASS
  2. **Real Browser Workflow Suite (`test_part6_real_browser.js`):** 20 / 20 PASS
     - Workflow 1: Guest creates share, copies URL, views 90-day notice — PASS
     - Workflow 2: Recipient opens link read-only, verifies banner, customizes independent copy without mutating original snapshot — PASS
     - Workflow 3: Customer A shares from My Account, revokes link, confirms immediate 404 public lockout while private saved build remains intact — PASS
     - Workflow 4: Ownership isolation: Customer B denied revoking Customer A share; Customer B saves independent copy without overwriting Customer A build — PASS
     - Workflow 5: 90-day expired share immediately rejected in browser with safe fallback — PASS
     - Responsive Viewports: 1280px desktop and 375px mobile verified — PASS
  3. **Real Browser Lifecycle & Replacement Suite (`test_part6_copy_and_replace_lifecycle.js`):** 12 / 12 PASS
     - Step 1–3: Customer A creates share, copies URL, verifies public anonymous access — PASS
     - Step 4–6: Browser session closed completely; reopened in fresh context; confirmed card displays active badge without direct copy button (preserving hashed token security) — PASS
     - Step 7–10: Replace Link workflow confirmed; dialog warns of invalidation; fresh 64-char token generated; old URL immediately blocked (404); new URL publicly accessible — PASS
     - Step 11: Revocation immediately blocks public access — PASS
     - Step 12: Customer private saved build verified 100% intact in database and UI — PASS

### Products & Environment Integrity Verification:
- **Original Nine Prototype Products (`91635, 77721, 80030, 85057, 89535, 89499, 87467, 55097, 91093`):** 100% intact, unmodified, and verified in the database.
- **Four Local Demo Products (`92020, 92022, 92024, 92026`):** 100% intact, published, and preserved for customer testing.
- **No Production Access:** Confirmed local environment execution only.
- **Zero Git Commits:** Kept on working tree for human inspection.

---

## 16. Part 7 Scope Boundaries (Next — Not Started)

Part 7 is unblocked following human approval of Part 6:
1. **Client-Side Composite Image & Spec Sheet Export:** HTML5 canvas compositing of high-resolution gun configuration and downloadable specification sheet.
2. **Scope Boundaries:** Part 7 does NOT include viewport pan/zoom controls (Part 8) or production release hardening (Part 9).
3. **Execution Status:** NOT STARTED. Awaiting instruction to begin.
