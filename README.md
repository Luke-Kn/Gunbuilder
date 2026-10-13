# Taktik Airsoft Gun Builder (Part Selector Rebuild)

**Current Status:** Stage 1 — Safe Plugin Foundation & Legacy Isolation
**Plugin Slug:** `part-selector`
**Primary Shortcode:** `[part_selector]`

---

## Overview

This plugin transforms the legacy Taktik Airsoft "Part Selector" into a modular, modern 2D Airsoft Gun Builder. The project is being developed local-first on the Local WordPress environment before staging/production deployment.

## Key Requirements & Principles

1. **WordPress & WooCommerce Core Integration:** WooCommerce remains the single source of truth for products, pricing, stock, cart, and checkout.
2. **Canonical Physical Scale:** 1 cm = 10 logical pixels (1 mm = 1 logical pixel) across all weapon bases and accessories.
3. **Admin-Managed Part Types:** Dynamic category drawers and mounting rules (no hardcoded category names in application logic).
4. **Mobile-First Responsive Design:** Clean layout, touch/pointer interaction, and whole-scene viewport scaling.

## Project Documentation

- [`GUN-BUILDER-PLAN.md`](GUN-BUILDER-PLAN.md): Detailed development roadmap and architectural requirements.
- [`GUN-BUILDER-STATUS.md`](GUN-BUILDER-STATUS.md): Current implementation progress and completed stages.
- [`/AGENTS.md`](../../../AGENTS.md): Local development rules and coding agent boundaries.

## Architecture (Stage 1 Foundation)

- `part-selector.php`: Primary plugin entry point and bootstrap.
- `includes/`:
  - `class-tgb-core.php`: Core plugin orchestrator.
  - `class-tgb-assets.php`: Scoped CSS/JS asset registration and on-demand enqueue.
  - `class-tgb-shortcode.php`: Safe output-buffered shortcode rendering for `[part_selector]`.
  - `class-tgb-product-integration.php`: WooCommerce single product page integration hooks (safely isolated).
- `templates/`:
  - `gun-builder.php`: Semantic HTML structural container scoped to `#taktik-gun-builder`.
- `assets/`:
  - `css/gun-builder.css`: Scoped modern stylesheet (dark mode / tactical styling).
  - `js/gun-builder.js`: Lightweight initialization script (zero external dependencies).
