# Taktik Airsoft Gun Builder (Part Selector Rebuild)

**Current Status:** Parts 1–11 Complete — Production Hardened
**Plugin Slug:** `part-selector`
**Primary Shortcode:** `[part_selector]`

---

## Overview

This plugin transforms the legacy Taktik Airsoft "Part Selector" into a modular, modern 2D Airsoft Gun Builder. The project is developed local-first on the Local WordPress environment before staging/production deployment.

## Key Requirements & Principles

1. **WordPress & WooCommerce Core Integration:** WooCommerce remains the single source of truth for products, pricing, stock, cart, and checkout.
2. **Canonical Physical Scale:** 1 cm = 10 logical pixels (1 mm = 1 logical pixel) across all weapon bases and accessories.
3. **Admin-Managed Part Types & Mount Interfaces:** Dynamic category drawers and mounting rules (no hardcoded category names in application logic).
4. **Mobile-First Responsive Design:** Clean layout, touch/pointer interaction, and whole-scene viewport scaling.
5. **Secure Add Build to Cart:** Server-validated atomic cart insertion with distinct instance IDs and full stock revalidation.

## Project Documentation

- [`GUN-BUILDER-PLAN.md`](GUN-BUILDER-PLAN.md): Detailed development roadmap and architectural requirements.
- [`GUN-BUILDER-STATUS.md`](GUN-BUILDER-STATUS.md): Current implementation progress and completed stages.
- [`GUN-BUILDER-PROTOTYPE.md`](GUN-BUILDER-PROTOTYPE.md): Authoritative nine-product prototype documentation.
- [`/AGENTS.md`](../../../AGENTS.md): Local development rules and coding agent boundaries.

## Architecture

- `part-selector.php`: Primary plugin entry point and bootstrap.
- `includes/`:
  - `class-tgb-core.php`: Core plugin orchestrator.
  - `class-tgb-assets.php`: Scoped CSS/JS asset registration and on-demand enqueue.
  - `class-tgb-shortcode.php`: Safe output-buffered shortcode rendering for `[part_selector]`.
  - `class-tgb-product-integration.php`: WooCommerce single product page integration hooks (safely isolated).
  - `class-tgb-part-types.php`: Dynamic `tgb_part_type` taxonomy management.
  - `class-tgb-mount-interfaces.php`: Dynamic `tgb_mount_interface` taxonomy management.
  - `class-tgb-mounting.php`: Structured mounting service, interface intersection, and anchor math.
  - `class-tgb-product-config.php`: WooCommerce Product Data admin panel integration and validation.
  - `class-tgb-product-data.php`: Authoritative product data extraction and first Gallery image pipeline.
  - `class-tgb-catalog-api.php`: Public read-only REST catalog endpoints (`/tgb/v1`).
  - `class-tgb-cart.php`: Secure atomic Add Build to Cart AJAX handler and WooCommerce cart/order metadata hooks.
- `templates/`:
  - `gun-builder.php`: Semantic HTML structural container scoped to `#taktik-gun-builder`.
- `assets/`:
  - `css/gun-builder.css`: Scoped modern stylesheet (responsive, dark mode tactical styling).
  - `css/gun-builder-admin.css`: Scoped admin styling for WooCommerce product edit screen.
  - `js/gun-builder.js`: Modular vanilla JS application (BuildState, Pointer dragging, catalog, mounting, Current Build, cart).
  - `js/gun-builder-admin.js`: Scoped admin script for role-conditional mounting fields.
