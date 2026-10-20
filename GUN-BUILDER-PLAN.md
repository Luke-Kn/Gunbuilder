# Taktik Gun Builder

## Goal

Rebuild the existing Part Selector into a 2D Gun Builder for Taktik Airsoft.

Reuse useful existing Part Selector code where appropriate.

Replace obsolete architecture and visual design where necessary.

## Product Scaling

Every product uses the same physical scale.

1 cm = 10 logical pixels.

Therefore:

1 mm = 1 logical pixel.

Example:

780 mm gun = 780 logical pixels.

140 mm optic = 140 logical pixels.

Responsive scaling may make the complete builder smaller on the physical screen, but all products must preserve the same proportions.

## Product Positioning

Accessories receive a reasonable default position.

The customer may reposition selected accessories.

Customers cannot:

- resize
- stretch
- independently change scale
- change color

No rotation unless explicitly approved.

## Product Types

The administrator must be able to add and remove accessory types without changing source code.

Examples for the prototype:

- Silencers
- Grips
- Optics
- Accessories

The application must not depend on those specific names being permanently present.

## Prototype

The first prototype contains exactly:

- 1 gun
- 2 silencers
- 2 grips
- 2 optics
- 2 accessories

Total: 9 items.

## Product Selection

Product Selection must be generated from the available admin-managed types.

Compatible products should be displayed for the selected gun.

## Current Build

Current Build should include:

- selected gun
- selected accessories
- individual prices
- total price
- remove
- reset
- Add Build to Cart

## WooCommerce

WooCommerce remains responsible for:

- product
- price
- sale price
- stock
- product status
- cart
- checkout

Do not duplicate WooCommerce product data unnecessarily.

## Images

Use real Taktik product images.

Reference measurements must represent the product as shown in the image.

Images must preserve their aspect ratio.

## Mobile

Development is mobile-first.

Priority test widths include approximately:

- 320 px
- 375 px
- 390 px
- 430 px

Desktop/tablet testing comes after the mobile interaction is working.

## Existing Part Selector

Before development:

Analyze the existing plugin thoroughly.

For every meaningful part, classify it as:

KEEP
MODIFY
REPLACE
REMOVE

Possible reusable areas may include:

- WordPress hooks
- WooCommerce product retrieval
- product IDs
- product information retrieval
- AJAX/API logic
- shortcode/page integration
- cart integration
- existing admin logic

Do not assume any part is reusable until it has been inspected.

## Development Order

1. Analyze existing Part Selector.
2. Document reusable code.
3. Establish new architecture.
4. Rebuild admin-managed product types.
5. Build common product scaling.
6. Build rendering system.
7. Build default positioning.
8. Add user drag positioning.
9. Add exact nine-product prototype.
10. Add compatibility filtering.
11. Build mobile-first customer UI.
12. Build Current Build.
13. Add WooCommerce pricing.
14. Add Build to Cart.
15. Mobile testing.
16. Desktop/browser testing.
17. Security/error testing.
18. Prepare for live deployment only after local version is stable.