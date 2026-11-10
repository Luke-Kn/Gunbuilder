# TAKTIK AIRSOFT GUN BUILDER V2 — ARCHITECTURE PLAN & ROADMAP

**Document Version:** 2.0.0-dev  
**Author:** Antigravity Senior Engineering Team  
**Project:** Taktik Airsoft Gun Builder V2  
**Plugin:** `part-selector` (`1.1.0-dev`)  
**Base Platform:** WordPress 6.8+ / WooCommerce 9.8+  

---

## 1. Executive Summary & Vision

The Taktik Airsoft Gun Builder is a custom 2D browser-based interactive customizer that empowers customers to configure airsoft weapon platforms with authentic, physically scaled parts, verify compatibility, and add complete builds directly to WooCommerce cart and checkout.

Following the success of Gun Builder V1.1, the **V2 Upgrade Program** transitions the platform from a prototype with isolated custom taxonomies into a fully integrated, scalable WooCommerce e-commerce application. V2 introduces:
- Native WooCommerce `product_cat` hierarchy and discovery.
- Per-Base-Gun category permission controls.
- Dynamic Mount Interfaces and physical position modeling (`top`, `bottom`, `muzzle`).
- Purchasable rail accessories with input/output interface translation.
- Multi-build guest and customer account persistence.
- Build sharing, high-resolution visual exports, and viewport navigation (pan/zoom).

---

## 2. Core V1.1 Foundation & Architectural Principles

Based on the Part 0 comprehensive audit, Gun Builder V2 **extends and selectively refactors** the proven V1.1 plugin rather than rewriting it.

### Preserved Core Systems:
1. **2D DOM Rendering:** Hardware-accelerated CSS transforms using logical physical coordinates (1 mm = 1 logical pixel).
2. **First Gallery Image Pipeline:** Transparent PNG assets extracted strictly from the first gallery image (`_product_image_gallery`), never the featured image.
3. **Free Dragging & Clamping:** Components remain freely draggable within canvas boundaries without automatic snapping or artificial collision locks.
4. **Authoritative Cart & Checkout Integration:** Strict server-side revalidation of prices, stock, compatibility, roles, and category policies. Client-submitted prices or eligibility tokens are never trusted.
5. **Single-Build Guest Persistence:** Single-build LocalStorage persistence preserved seamlessly until upgraded in Part 4.

---

## 3. Development Roadmap: Parts 0 through 9

| Part | Title | Status | Scope & Deliverables |
|---|---|---|---|
| **Part 0** | Codebase Audit & V2 Architecture | **Approved** | Full codebase audit, taxonomy analysis, performance profiling, and V2 technical plan. |
| **Part 1** | WooCommerce Native Categories & Product Discovery | **Approved** | Native `product_cat` integration, automated catalog discovery, bounded cursor pagination, gallery validation fix. |
| **Part 2** | Dynamic Interfaces, Per-Gun Categories & Position Configuration | **Approved** | Per-gun category policies (`all` vs `selected`), interface deletion safety, position metadata (`top`/`bottom`/`muzzle`), rail preparation (`_tgb_allowed_rail_positions`), transient category caching. (Committed `070c0481`) |
| **Part 3A** | Purchasable Rail Products & Dynamic Compatibility Backend | **Approved** | Rail product role (`rail`), input/output interface metadata, supported rail positions (`top`, `bottom`), optional part mount positions, dynamic active interface pool (`TGB_Rail_Compatibility`), instance identity, deletion safeguards, read-only `/rails` REST catalog. Completed and approved. |
| **Part 3B** | Interactive Rail Customization & Dependency Management | **Approved** | Visual rail selection, mounting rails to Base Gun mount points in frontend builder, dynamic updating of `/categories` and `/parts` with Base Gun category policy enforcement and safe `tgb_catalog_version` caching with rail fingerprinting (`_r{rfp}_`), aggregate Rail stock validation across multiple instances and cart quantities, automatic dependent-part removal with toast notification, browser visual verification (fulfilling Test 79), authoritative `/validate-build` REST endpoint, and rail-aware WooCommerce cart integration. (105/105 Tests PASS) |
| **Part 4** | Guest Multi-Build Persistence & Session Management | **Approved** | Multi-build management in sessionStorage (`tgb_guest_builds_v2`, schemaVersion 2), max 10 builds, active build switching with race condition protection, build creation, renaming, resetting, deleting (disabled when only 1 draft remains), legacy localStorage single-build migration, 4 retained local demo products (92020, 92022, 92024, 92026), and clean Part 5 export handoff. (102/102 Tests PASS: 15 browser + 32 PHP + 55 JS) |
| **Part 5** | Registered Customer Saved Builds & Account Management | **Implemented — Pending Human Approval** | Private CPT `tgb_saved_build`, strict customer ownership isolation, atomic 10-build account limit, authenticated REST API under `tgb/v1/saved-builds`, WooCommerce My Account "My Gun Builds" endpoint (`gun-builder-builds`), builder toolbar Save/Save-As-New controls, dirty-state badge, in-builder modal browsing, and automatic idempotent guest-to-account transfer. (85 Tests: 70 Backend PHP + 15 Real Browser E2E PASS) |
| **Part 6** | Build Sharing via Deep Links & Tokens | *Not Started* | Lightweight encrypted/tokenized URL hash encoding, public read-only build restoration, fork & customize workflow. |
| **Part 7** | Client-Side Image Compositing & Spec Sheet Export | *Not Started* | Off-screen HTML5 Canvas renderer, 1:1 scale PNG/JPEG composite download, part bill-of-materials summary. |
| **Part 8** | Viewport Controls: Pan, Zoom & Stage Navigation | *Not Started* | Smooth wheel and pinch-to-zoom, pan navigation, reset viewport button, coordinate translation mapping. |
| **Part 9** | Production Hardening, Load Testing & Final Release | *Not Started* | Final security review, query optimization under full catalog load, automated end-to-end regression, bump to 2.0.0. |

---

## 4. Architectural Details: Parts 1, 2, 3A, and 3B

### Part 1: WooCommerce Native Categories & Discovery
- Replaced separate `tgb_part_type` taxonomy on the frontend with native `product_cat`.
- Introduced `/wp-json/tgb/v1/categories` returning dynamic category trees pruned of empty/incompatible branches.
- Implemented bounded continuation cursor streaming for `/parts` to eliminate catalog ceilings.
- Preserved single-save gallery image validation by running save at priority 25.

### Part 2: Dynamic Interfaces, Per-Gun Controls & Positions
- **Category Policies:** Base Guns declare `_tgb_category_policy` (`all` or `selected`) and `_tgb_allowed_categories`.
  - Selecting a parent category dynamically includes all descendants via `get_ancestors()`.
  - Parts belonging to multiple categories are permitted if at least one matches the allowed tree, but disallowed navigation branches remain hidden.
- **Dynamic Mount Interfaces (`tgb_mount_interface`):** WordPress taxonomy terms remain authoritative. Deletion guard intercepting `pre_delete_term` blocks accidental deletion of terms in active use by Base Guns or Parts.
- **Mount Point Positions:** Stored in `_tgb_mount_points` JSON schema:
  `{ "id": "mount-top-1", "label": "Top Rail", "interface_id": 123, "position": "top", "x": 450.0, "y": 9.5 }`.
  Legacy unpositioned points normalize to `'unspecified'` with full backward compatibility.
- **Optional Additional Rail Positions:** Stored in `_tgb_allowed_rail_positions` as a subset of `['top', 'bottom']`. Prepares Base Guns for Part 3 without premature rail logic.
- **Category Discovery Performance:** Implemented revision-based transient caching (`tgb_ccat_{base_gun_id}_{version_hash}`) with 12h TTL and per-request in-memory cache, reducing category discovery latency from ~167 ms to < 2 ms. The authoritative WordPress option controlling catalog cache invalidation is `tgb_catalog_version` (any historical reference to `tgb_cat_cache_version` was an inaccurate label corrected to `tgb_catalog_version`). Invalidation hooks bound to product (`save_post_product`, `wp_trash_post`, `delete_post`) and taxonomy mutations (`product_cat`, `tgb_mount_interface`) ensure zero stale category results.
- **Server-Side Enforcement:** Shared policy check `TGB_Product_Config::is_part_category_allowed_for_gun( $base_gun_id, $part_id )` enforced across REST catalog queries, candidate streaming, and WooCommerce `process_add_build()` cart validation.

### Part 3A: Purchasable Rail Products & Dynamic Compatibility Backend (Approved)
- **Status:** Complete and approved following final integration verification.
- **New Builder Role: Rail (`TGB_Product_Config::ROLE_RAIL = 'rail'`):**
  - Rails are real, purchasable WooCommerce products using normal pricing, inventory, tax, and shipping settings.
  - Saved using existing `_tgb_role` convention.
  - Builder Ready requires: published status, `_tgb_enabled = 'yes'`, positive `_tgb_reference_mm`, valid first gallery image, >=1 input interface, >=1 output interface, and >=1 supported position.
- **Input and Output Interfaces:**
  - Dynamic taxonomy `tgb_mount_interface` is reused without creating duplicate taxonomies.
  - Stored in product metadata: `_tgb_rail_input_interfaces` (int[]) and `_tgb_rail_output_interfaces` (int[]).
  - Any matching input interface satisfies the attachment rule. All configured output interfaces become active once installed.
  - Deletion safeguard extended to include references stored in `_tgb_rail_input_interfaces` and `_tgb_rail_output_interfaces`.
- **Supported Rail Positions & Base Gun Permissions:**
  - Rail supported positions stored in `_tgb_rail_supported_positions` as a subset of `['top', 'bottom']`.
  - Base Gun permissions stored in `_tgb_allowed_rail_positions`.
  - A rail can be installed only if: the Base Gun explicitly allows rails at that position, has a built-in mount point at that position, and the mount point's interface matches one of the rail's input interfaces.
- **Optional Part Mount Positions:**
  - Parts may specify optional allowed positions in `_tgb_part_mount_positions` (`top`, `bottom`, `muzzle`).
  - Backward compatibility: If empty or unspecified, legacy interface-only matching across any position is preserved.
  - If specified, the interface must exist at one of the accepted physical positions.
- **Dynamic Active Interface Pool (`TGB_Rail_Compatibility`):**
  - Computes all available capabilities for a Base Gun and a proposed set of installed Rail instances.
  - Base Gun capabilities preserve mount point IDs and positions.
  - Rail capabilities track output interface ID, physical position, source instance ID, and source product ID.
  - Independent validation of rail instances: verifies product exists, role is `'rail'`, published, builder-enabled, builder-ready, valid configuration, permitted by Base Gun category policy, supported position, and matching input interface at that position.
  - Rejects duplicate instance IDs, untrusted client interface IDs, or invalid instances.
  - Identifies supporting sources (`supporting_sources`) for compatible parts.
  - Multi-instance support: multiple instances of the same rail product remain distinguishable by unique instance IDs.
  - Scope boundary: Supports multiple rails attached directly to Base Gun mount points; rail-to-rail stacking/chaining is intentionally deferred.
- **Discovery & API:**
  - Rail products queried via `TGB_Rail_Compatibility::get_eligible_rails( $base_gun_id )`.
  - Enforces Base Gun category policy on Rails.
  - Excluded from ordinary Part catalog queries (`get_parts_by_category`).
  - Read-only public REST endpoint GET `/wp-json/tgb/v1/rails` with strict parameter validation.
  - Cart integrity: Existing Add Build to Cart strictly enforces `ROLE_PART`, rejecting rails submitted as parts. Part 3B introduces rail-aware cart integration.

### Part 3B: Interactive Rail Customization & Secondary Component Unlocking (Implemented)
- **Status:** Implemented — Pending Human Approval (105/105 Tests PASS).
- **Frontend Rail Selection & Canvas Rendering:**
  - Added dedicated "Rails / Adapters" category tab in the builder catalog tray.
  - Staging calculation mounts rails in the lower-left staging area (`TGB_Mounting.calculateStagingCoordinates`) with stagger offset (`+20px * index`).
  - Rendered with hardware-accelerated CSS class `.tgb-layer--rail`, draggable cursor styles (`grab`/`grabbing`), `pointer-events: auto`, and z-index ordering between Base Gun (10) and Parts (30).
  - Free dragging with strict stage boundary clamping (`clampCoordinates`) without artificial snap-to-rail or docking locks.
  - Complete browser visual verification of rendering, dragging, stage clamping, and position persistence (fulfilling Test 79 from Part 3A).
- **Dynamic Catalog Unlocking (`/categories` & `/parts`):**
  - Both REST endpoints accept `installed_rails` parameter as a JSON-encoded array or query list.
  - Rail fingerprinting via `TGB_Product_Data::get_rail_fingerprint()` computes an 8-character MD5 hash of canonical `product_id:position` pairs (or `'0'` when empty).
  - Revision-based transient caching embeds `_r{rfp}_` in category cache keys (`tgb_ccat_{base_gun_id}_r{rfp}_{version}`), ensuring cache isolation across distinct rail configurations while benefiting from microsecond hit speeds (< 0.5 ms).
  - Continuation cursor encoding/decoding embeds and verifies `rfp` context, returning 400 Bad Request on malformed or mismatched cursors.
  - Dynamic category `tax_query` expansion merges rail output interface IDs into part taxonomy queries.
  - Base Gun category policy (`is_part_category_allowed_for_gun`) strictly enforced across all rail-unlocked components; disallowed categories return 400 `tgb_category_disallowed`.
- **Automatic Cascading Dependency Pruning:**
  - Client-side build state tracks `supporting_sources` returned by `check_part_compatibility_with_pool()`.
  - When a Rail instance is removed, any attached Part whose compatibility depended solely on that rail instance is automatically pruned from the canvas and Current Build drawer.
  - Toast notification (`.tgb-notice-toast`) alerts the user with component names and reasons, with an accessible `role="status"` and `aria-live="polite"` screen reader announcement.
- **Aggregate Stock Validation & Abuse Protection:**
  - `TGB_Cart::validate_aggregate_stock()` validates cumulative demand across Base Gun, Rails, and Parts against real WooCommerce managed inventory (`managing_stock()`).
  - Aggregates multiple instances of the same product across rail instances and parts, and accounts for existing quantities in `WC()->cart`.
  - Enforces `is_sold_individually()` limits (rejects > 1).
  - Strict bounded abuse limits: maximum 10 rails per build, maximum 64-character instance IDs, position whitelist (`top`, `bottom`).
- **Rail-Aware WooCommerce Cart & Checkout Bundling:**
  - Added `TGB_Cart::validate_request()` enforcing role checks, purchasability, and position compatibility.
  - Line items created atomically with rollback on failure. Base Gun (`_tgb_role: base_gun`), Rails (`_tgb_role: rail`, `_tgb_rail_position`), and Parts (`_tgb_role: part`), each with a unique `_tgb_line_id` preventing unwanted WooCommerce line merging.
  - Unified build reference `_tgb_build_ref` / `_tgb_build_id` links all items into a single bundle.
  - Cart line item metadata displays `Role: Rail / Adapter` and physical position `Position: Top / Bottom`.
  - Order line items persist `_tgb_role` and `Position` for fulfillment.
- **Authoritative REST Validation Endpoint:**
  - Route `POST /wp-json/tgb/v1/validate-build` connects to `TGB_Rail_Compatibility::validate_proposed_build()`.
  - Recomputes capability pool and validates Base Gun, Rails, and Parts server-side, returning total price, total weight, validity flag, and error diagnostics.

### Part 4: Guest Multi-Build Persistence & Session Management (Implemented — Pending Human Approval)
- **Status:** Implemented — Pending Human Approval (102/102 Tests PASS: 15 browser + 32 PHP + 55 JS).
- **SessionStorage Architecture (`tgb_guest_builds_v2`, Schema Version 2):**
  - Guest multi-build drafts are stored exclusively in client `sessionStorage` under key `tgb_guest_builds_v2` with `schemaVersion: 2`.
  - Independent browser tabs/sessions start with a clean workspace without accidental leakage into persistent `localStorage`.
  - JSON schema:
    ```json
    {
      "schemaVersion": 2,
      "activeBuildId": "bld-...",
      "builds": [
        {
          "id": "bld-...",
          "name": "Build 1",
          "createdAt": 1731170000000,
          "updatedAt": 1731170000000,
          "baseProductId": 92020,
          "rails": [
            { "instanceId": "rail-r1", "productId": 92022, "position": "bottom", "x": 210, "y": 75, "zIndex": 15 }
          ],
          "parts": [
            { "instanceId": "grip-g1", "productId": 92024, "x": 230, "y": 85, "zIndex": 20 }
          ]
        }
      ]
    }
    ```
- **Strict 10-Build Session Limit & UI Lockout:**
  - Guests can create up to 10 distinct builds per session.
  - Live toolbar badge `#tgb-build-counter` shows real-time count (`X / 10`).
  - `#tgb-btn-new-build` is automatically disabled (`disabled`, `aria-disabled="true"`, tooltip) upon reaching 10/10, rejecting creation attempts with a clear warning notice.
- **Active Build Switching & Race-Condition Invalidation:**
  - Automatic snapshot saving of the active draft before switching (`updateActiveBuildFromState`).
  - Monotonic `switchToken` invalidates any delayed asynchronous catalog/category responses from prior builds.
  - Complete canvas, layer, and selection drawer reset between switches to guarantee zero crosstalk.
- **Delete Button Lifecycle & Safety Rules:**
  - `#tgb-btn-delete-build` is strictly disabled (`disabled`, `aria-disabled="true"`, title="Cannot delete the only build") when only 1 draft remains.
  - Dynamically enabled when > 1 drafts exist.
  - Initial HTML template state in `templates/gun-builder.php` renders disabled by default.
  - Deleting the active build prompts user confirmation (`window.confirm`) and shifts active selection to an adjacent remaining draft.
  - Immediate synchronous UI update on deletion without waiting for subsequent background network fetches.
- **Reset Active Build Isolation:**
  - `#tgb-btn-reset-build` clears only the active build (`baseProductId: null`, `rails: []`, `parts: []`) while leaving all other session drafts completely intact.
- **Single-Build Legacy Migration:**
  - Automatic detection of legacy V1.1 / Part 3B `tgb_current_build_state` in `localStorage`.
  - Migrates Base Gun, Rails, Parts, coordinates, and z-indexes into Build 1 in `sessionStorage`.
  - Removes the legacy `localStorage` key only after successful commit. No migration loop or accidental re-import.
- **Retained Four Local Demo Products (Task A):**
  - Kept published in local WooCommerce database for ongoing manual and automated testing:
    - Base Gun: `92020` ([LOCAL TEST] M-LOK Demo Rifle)
    - Rail: `92022` ([LOCAL TEST] M-LOK to Picatinny Rail)
    - Bottom Picatinny Grip: `92024` ([LOCAL TEST] Bottom Picatinny Grip)
    - Top Picatinny Optic: `92026` ([LOCAL TEST] Top Picatinny Optic)
- **Part 5 Handoff Contract:**
  - Exposes `window.TGB.exportGuestBuilds()` / `exportForAccountSync()` returning sanitized deep clones of up to 10 session builds ready for registered customer cloud persistence.

### Part 5: Registered Customer Saved Builds & Account Management (Implemented — Pending Human Approval)
- **Status:** Implemented — Pending Human Approval (85 Tests: 70 PHP Backend & Security + 15 Puppeteer Real Browser E2E PASS).
- **Private Custom Post Type (`tgb_saved_build`):**
  - Registered strictly private: `public => false`, `publicly_queryable => false`, `exclude_from_search => true`, `show_ui => false`, `show_in_rest => false`, `query_var => false`, `supports => ['title', 'author']`.
  - Zero URL frontend exposure, zero indexation by search engines, zero pollution in WordPress standard post queries.
  - Ownership strictly governed by `post_author` derived server-side from `get_current_user_id()`.
- **Metadata Schema & Non-Authoritative Prices:**
  - `_tgb_build_schema_version`: `2` (strict schema validation).
  - `_tgb_base_product_id`: `(int) $base_gun_id`.
  - `_tgb_rails`: JSON-encoded array (up to 10 rails) with `instanceId`, `productId`, `position` (`top`|`bottom`), integer coordinates `x`, `y`, `zIndex`.
  - `_tgb_parts`: JSON-encoded array (up to 30 components) with `instanceId`, `productId`, integer coordinates `x`, `y`, `zIndex`.
  - `_tgb_source_guest_id`: string tracking original guest draft ID for idempotent sync.
  - `_tgb_build_revision`: monotonic integer for optimistic concurrency conflict detection (`HTTP 409 tgb_build_conflict`).
  - No static prices or product names stored in metadata. All specs, prices, and weights are dynamically resolved at request time.
- **Strict 10-Build Account Limit & Concurrency Protection:**
  - Enforces max 10 saved builds per customer account server-side (`HTTP 403 tgb_build_limit_reached`).
  - Implements atomic row-level database locking (`SELECT ID FROM {$wpdb->posts} WHERE post_author = %d FOR UPDATE`) inside transactions to eliminate race condition over-saving.
- **Authenticated REST API (`tgb/v1/saved-builds`):**
  - `GET /saved-builds`: Lists authenticated customer's builds with live resolved specs and thumbnails.
  - `POST /saved-builds`: Saves active build or creates new saved build.
  - `GET /saved-builds/{id}`: Loads single build; returns 404 on non-owner access.
  - `PUT/PATCH /saved-builds/{id}`: In-place update with optimistic locking.
  - `DELETE /saved-builds/{id}`: Permanently deletes customer's build.
  - `POST /saved-builds/{id}/duplicate`: Clones existing build to new record up to limit.
  - `POST /saved-builds/import-guest`: Idempotent automatic guest draft transfer.
- **WooCommerce My Account Integration:**
  - Endpoint slug: `gun-builder-builds`.
  - Navigation menu item: `My Gun Builds` positioned cleanly in account menu.
  - Grid card view with build thumbnail, base platform, rail & part counts, "Open in Builder", inline "Rename", "Duplicate", and "Delete" with confirmation dialog.
  - Accessible feedback banner `#tgb-account-feedback`.
- **Gun Builder Toolbar Controls & Modal:**
  - Toolbar controls for authenticated users: `#tgb-btn-save-build` ("Save Build" / "Save Changes"), `#tgb-btn-save-as-new`, `#tgb-btn-my-saved-builds`, `#tgb-dirty-badge`, and `#tgb-account-pill`.
  - Real-time dirty-state tracking displays `#tgb-dirty-badge` on component addition, removal, or canvas dragging; cleared on save.
  - In-builder saved builds modal `#tgb-saved-builds-modal` allows loading, duplicating, and deleting saved builds without leaving the customizer.
  - Deep-link loading via `?saved_build_id={id}` given highest priority for logged-in users with rail-first staged restoration.
- **Automatic Idempotent Guest-to-Account Transfer:**
  - Seamlessly imports guest drafts on login using Part 4 contract `TGB_GuestBuildManager.exportForAccountSync()`.
  - Tracks imported guest IDs via `_tgb_source_guest_id` to guarantee idempotent execution.
  - Partial capacity handling: imports up to available account slots and retains remaining drafts in guest `sessionStorage`.
  - Non-destructive cleanup: removes only successfully imported drafts from `sessionStorage`.

### Part 6: Secure Shareable Build Links, Public Viewing & Revocation (APPROVED)
- **Status:** APPROVED (97/97 Tests Passed: 65 PHP Backend & Security + 20 Puppeteer Real Browser E2E + 12 Lifecycle Assertions PASS).
- **Private Custom Post Type (`tgb_shared_build`):**
  - Registered strictly non-public: `public => false`, `publicly_queryable => false`, `exclude_from_search => true`, `show_ui => false`, `show_in_rest => false`.
  - Zero URL frontend post exposure, zero WordPress search indexation, zero generic REST API pollution.
- **Cryptographic Security & Hashed-Token Architecture:**
  - Raw bearer token generated via `bin2hex(random_bytes(32))` (64-character high-entropy hex string).
  - Raw bearer token is NEVER stored in the database. Only deterministic SHA-256 hash stored in `_tgb_share_token_hash`.
  - Token lookups compute `hash('sha256', $token)` for fast indexed meta query lookup.
- **Existing Share Link Security & Replacement Model:**
  - Raw 256-bit bearer tokens are returned once upon creation or replacement and are never stored in plaintext in the database.
  - Once the creation dialog is closed or the browser session is restarted, raw tokens cannot be recovered or displayed again.
  - Existing share cards in My Account display active share status and provide "Replace Link" (which prompts the user, invalidates the previous link, and generates a fresh token) and "Revoke Link".
  - Customer private saved build records (`tgb_saved_build`) are completely unaffected by share replacement or revocation.
- **Guest 90-Day Automatic Expiration:**
  - Anonymous shares expire strictly after 90 days (`_tgb_share_expires_at = created_at + 7776000`).
  - Enforced immediately on access server-side (returns HTTP 410 Gone) without waiting for background cron.
  - Daily bounded WP-Cron job (`tgb_cleanup_expired_shares`) purges expired guest share records from database.
- **Registered Account Owner Management & Revocation:**
  - Registered customers can share any saved build by ID or unsaved working configuration.
  - Account shares have permanent lifespan (`_tgb_share_expires_at = 0`).
  - Owner can list active shares via `GET /tgb/v1/my-shares`.
  - Immediate manual revocation via `DELETE /tgb/v1/shares/{id}` sets `_tgb_is_revoked = '1'`.
  - Token replacement via `POST /tgb/v1/shares/{id}/replace` revokes existing token and generates fresh link.
  - Automatic cascade revocation: Deleting source `tgb_saved_build` automatically revokes all associated shared links via `deleted_post` hook.
- **Public Read-Only Preview & Live WooCommerce Data:**
  - Accessible via `?tgb_share={TOKEN}` without logging in.
  - Staged visual restoration: Base Gun -> Rails -> Parts with exact positions and z-indexes.
  - Builder enters `.tgb-shared-preview-mode`: pointer dragging, adding, and deletion are strictly blocked.
  - Displays top preview banner `#tgb-shared-preview-banner` showing build name, live calculated total price, and unavailable item warnings.
  - Dynamically queries current WooCommerce catalog for pricing, stock availability, and image URLs. Stored database snapshot is never mutated during viewing.
- **Independent "Customize a Copy" Fork:**
  - Recipient clicks "Customize a Copy" `#tgb-btn-customize-copy`.
  - For Guests: Clones snapshot into independent `sessionStorage` draft (`bld-...`) with `(Copy)` suffix, respecting 10-draft limit.
  - For Logged-in Customers: Creates independent working configuration (`activeSavedBuildId = null`), enabling normal editing and "Save Build".
  - Exits read-only mode, clears URL parameter via `history.replaceState()`, and enables full drag/edit interactions.
  - Original shared build snapshot and owner's account saved build remain 100% untouched.
- **Privacy & Abuse Prevention:**
  - Allowlisted public REST response: excludes customer email, user ID, author ID, and other saved builds.
  - Anonymous rate limiting: maximum 25 share creations per hour per IP via transient rate buckets (`HTTP 429`).
  - Title XSS neutralization via `sanitize_text_field()` and `esc_html()`.
  - Payload schema validation: strict Base Gun verification, max 10 rails, max 30 parts, coordinate/z-index bounds, unique instance IDs.

### Part 7: Client-Side Composite Image & Spec Sheet Export (Next — Not Started)
- **Status:** Next — Not Started (Unblocked by Part 6 approval).
- **Core Scope:**
  - HTML5 canvas compositing of high-resolution airsoft gun build visual image.
  - Printable / downloadable specification sheet with active component breakdown and live store specs.
  - Viewport pan/zoom controls remain deferred to Part 8. Production release hardening remains Part 9.
