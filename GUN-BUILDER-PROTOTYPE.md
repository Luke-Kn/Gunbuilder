# Taktik Gun Builder — Prototype Documentation (Nine-Product Prototype)

This document provides permanent, authoritative documentation for the local nine-product prototype established in **Part 6 — Dynamic Product Selection + Nine-Product Prototype**.

Because WooCommerce product configuration, metadata, and gallery attachments reside in the WordPress MySQL database and are not tracked directly by Git, this file serves as the definitive reference for the local environment setup.

---

## 1. Prototype Summary

The Part 6 prototype establishes an exact nine-product catalog configuration spanning all primary functional categories:

- **1 Base Gun Platform**
- **2 Silencers**
- **2 Grips**
- **2 Optics**
- **2 Accessories**
- **Total: 9 Builder-Ready Products**

All 9 products are real, published WooCommerce products from the local Taktik Airsoft catalog. Each product is configured with:
- `_tgb_enabled`: `yes`
- `_tgb_ready`: `yes`
- `_tgb_role`: `base_gun` or `part`
- `_tgb_reference_mm`: positive physical left-to-right millimeter dimension based on documented specifications
- `tgb_part_type`: single assigned taxonomy term (for Parts)
- **FIRST WooCommerce Gallery Image**: prepared transparent PNG, tightly cropped around the product in true side/profile orientation, with all promotional banners and watermarks removed.

---

## 2. Dynamic Taxonomy Structure

The prototype utilizes four dynamic taxonomy terms under `tgb_part_type`:

| Term ID | Name | Slug | Purpose |
|---|---|---|---|
| 2641 | **Accessories** | `accessories` | Flashlights, lasers, rail accessories |
| 2639 | **Grips** | `grips` | Foregrips, angled grips, handstops |
| 2640 | **Optics** | `optics` | Red dots, holographic sights, scopes |
| 2638 | **Silencers** | `silencers` | Mock suppressors, barrel extensions |

> **Note:** The Base Gun platform is a structural architectural role (`role = base_gun`) and is **never** a taxonomy term.

---

## 3. Product Catalog Specifications

### Product 1: Base Gun Platform
- **WooCommerce Product ID:** `91635`
- **Product Title:** VFC BCM MK2 MCMR 11.5 EVO Deluxe GBBR Gray
- **Builder Role:** `base_gun`
- **Part Type:** N/A (Structural platform)
- **Visual Reference Length:** **780 mm**
- **Reference Measurement Source / Basis:** Manufacturer specification for the BCM MK2 11.5" GBBR indicates an overall length of 710 mm (stock fully collapsed) to 790 mm (stock fully extended). In the builder image, the adjustable Bravo SOPMOD stock is pictured in its extended configuration, measuring approximately 780 mm from flash hider tip to buttpad.
- **Original Source Image:** Attachment `91639` (`Polish_20260819_134442380.jpg`, $1919 \times 1213$)
- **Prepared Builder Asset:** Attachment `91840` (`tgb-base-gun-bcm-mk2-clean.png`)
- **Builder Asset Dimensions:** $1492 \times 473$ px
- **Transparent Background:** Yes (pure alpha channel)
- **Tight Crop:** Yes (10 px transparent margin around firearm silhouette)
- **Side Orientation:** Yes (true 90° profile view facing right)
- **Prepared Asset Created:** Yes (`wp-content/uploads/tgb-prepared/tgb-base-gun-bcm-mk2-clean.png`)
- **Gallery Order Modified:** Yes (prepared asset set as Gallery Image #1)
- **Catalog Eligibility:** **YES** (`is_catalog_eligible = true`)

---

### Product 2: Silencer 1
- **WooCommerce Product ID:** `77721`
- **Product Title:** Taktik MCX Style Silencer Suppressor Plastic Black
- **Builder Role:** `part`
- **Part Type:** `Silencers` (Term ID: 2638)
- **Visual Reference Length:** **183 mm**
- **Reference Measurement Source / Basis:** WooCommerce product description explicitly specifies physical dimensions: `183mm X 38mm X 38mm`.
- **Original Source Image:** Attachment `80027` (`Taktik-3D-Printed-MCX-Style-Silencer-Suppressor-Black.jpg`, $1919 \times 1213$)
- **Prepared Builder Asset:** Attachment `91841` (`tgb-silencer-mcx-style-clean.png`)
- **Builder Asset Dimensions:** $1363 \times 316$ px
- **Transparent Background:** Yes (pure alpha channel)
- **Tight Crop:** Yes (10 px transparent padding)
- **Side Orientation:** Yes (horizontal profile)
- **Prepared Asset Created:** Yes (`wp-content/uploads/tgb-prepared/tgb-silencer-mcx-style-clean.png`)
- **Gallery Order Modified:** Yes (prepared asset set as Gallery Image #1)
- **Catalog Eligibility:** **YES** (`is_catalog_eligible = true`)

---

### Product 3: Silencer 2
- **WooCommerce Product ID:** `80030`
- **Product Title:** Taktik HUXWRX Style Silencer Suppressor ABS CF Black
- **Builder Role:** `part`
- **Part Type:** `Silencers` (Term ID: 2638)
- **Visual Reference Length:** **136 mm**
- **Reference Measurement Source / Basis:** WooCommerce product description explicitly specifies physical dimensions: `136mm X 42mm`.
- **Original Source Image:** Attachment `80031` (`Taktik-3D-Print-HUXWRX-Style-Silencer-Suppressor-Black.jpg`, $1919 \times 1213$)
- **Prepared Builder Asset:** Attachment `91842` (`tgb-silencer-huxwrx-style-clean.png`)
- **Builder Asset Dimensions:** $1060 \times 349$ px
- **Transparent Background:** Yes (pure alpha channel)
- **Tight Crop:** Yes (10 px transparent padding)
- **Side Orientation:** Yes (horizontal profile)
- **Prepared Asset Created:** Yes (`wp-content/uploads/tgb-prepared/tgb-silencer-huxwrx-style-clean.png`)
- **Gallery Order Modified:** Yes (prepared asset set as Gallery Image #1)
- **Catalog Eligibility:** **YES** (`is_catalog_eligible = true`)

---

### Product 4: Grip 1
- **WooCommerce Product ID:** `85057`
- **Product Title:** Taktik M-LOK MLok SI Curved Grip HandStop ABS Tan
- **Builder Role:** `part`
- **Part Type:** `Grips` (Term ID: 2639)
- **Visual Reference Length:** **120 mm**
- **Reference Measurement Source / Basis:** Strike Industries SI LINK Curved Foregrip specification: total rail contact and physical length is 120 mm (4.72 inches).
- **Original Source Image:** Attachment `85059` (`Taktik-M-LOK-MLok-SI-Curved-Grip-HandStop-ABS-Tan.jpg`, $1024 \times 644$)
- **Prepared Builder Asset:** Attachment `91843` (`tgb-grip-si-curved-tan-clean.png`)
- **Builder Asset Dimensions:** $507 \times 284$ px
- **Transparent Background:** Yes (pure alpha channel)
- **Tight Crop:** Yes (10 px transparent padding)
- **Side Orientation:** Yes (profile view of curved handstop)
- **Prepared Asset Created:** Yes (`wp-content/uploads/tgb-prepared/tgb-grip-si-curved-tan-clean.png`)
- **Gallery Order Modified:** Yes (prepared asset set as Gallery Image #1)
- **Catalog Eligibility:** **YES** (`is_catalog_eligible = true`)

---

### Product 5: Grip 2
- **WooCommerce Product ID:** `89535`
- **Product Title:** RGW Anchor Style Hand Stop for M-LOK or Keymod Airsoft DE
- **Builder Role:** `part`
- **Part Type:** `Grips` (Term ID: 2639)
- **Visual Reference Length:** **60 mm**
- **Reference Measurement Source / Basis:** Railscales Anchor vertical handstop specification: 60 mm overall length (2.375 inches) $\times$ 57 mm height.
- **Original Source Image:** Attachment `89536` (`RGW-Anchor-Style-Hand-Stop-for-M-LOK-or-Keymod-Airsoft-DE.png`, $1024 \times 644$)
- **Prepared Builder Asset:** Attachment `91844` (`tgb-grip-anchor-style-de-clean.png`)
- **Builder Asset Dimensions:** $188 \times 274$ px
- **Transparent Background:** Yes (pure alpha channel)
- **Tight Crop:** Yes (10 px transparent padding)
- **Side Orientation:** Yes (pure side profile)
- **Prepared Asset Created:** Yes (`wp-content/uploads/tgb-prepared/tgb-grip-anchor-style-de-clean.png`)
- **Gallery Order Modified:** Yes (prepared asset set as Gallery Image #1)
- **Catalog Eligibility:** **YES** (`is_catalog_eligible = true`)

---

### Product 6: Optic 1
- **WooCommerce Product ID:** `89499`
- **Product Title:** RHAM Red dot sight EXPS3 Holographic Style Black
- **Builder Role:** `part`
- **Part Type:** `Optics` (Term ID: 2640)
- **Visual Reference Length:** **97 mm**
- **Reference Measurement Source / Basis:** EOTech EXPS3 holographic weapon sight specification: $96.5\text{ mm}$ physical length ($3.8\text{ inches}$). Configured to $97\text{ mm}$.
- **Original Source Image:** Attachment `46951` (`Holy-Warrior-EXPS3-Holographic-Style-Black.jpg`, $1024 \times 644$)
- **Prepared Builder Asset:** Attachment `91845` (`tgb-optic-exps3-black-clean.png`)
- **Builder Asset Dimensions:** $443 \times 326$ px
- **Transparent Background:** Yes (pure alpha channel)
- **Tight Crop:** Yes (10 px transparent padding)
- **Side Orientation:** Yes (crisp true 90° profile view)
- **Prepared Asset Created:** Yes (`wp-content/uploads/tgb-prepared/tgb-optic-exps3-black-clean.png`)
- **Gallery Order Modified:** Yes (prepared asset set as Gallery Image #1)
- **Catalog Eligibility:** **YES** (`is_catalog_eligible = true`)

---

### Product 7: Optic 2
- **WooCommerce Product ID:** `87467`
- **Product Title:** G&P Retro 4x20 Airsoft Scope for M4 M16 Carry Handle Picatinny Rails Rifle Black
- **Builder Role:** `part`
- **Part Type:** `Optics` (Term ID: 2640)
- **Visual Reference Length:** **150 mm**
- **Reference Measurement Source / Basis:** Colt / G&P Retro 4x20 carry handle scope specification: $150\text{ mm}$ overall physical tube length ($5.9\text{ inches}$).
- **Original Source Image:** Attachment `87477` (`GP-Retro-4x20-Airsoft-Scope-for-M4-M16-Carry-Handle-Picatinny-Rails-Rifle-Black.jpg`, $1919 \times 1213$)
- **Prepared Builder Asset:** Attachment `91846` (`tgb-optic-retro-4x20-scope-clean.png`)
- **Builder Asset Dimensions:** $495 \times 340$ px
- **Transparent Background:** Yes (pure alpha channel)
- **Tight Crop:** Yes (10 px transparent padding)
- **Side Orientation:** Yes (horizontal side profile with open flip caps)
- **Prepared Asset Created:** Yes (`wp-content/uploads/tgb-prepared/tgb-optic-retro-4x20-scope-clean.png`)
- **Gallery Order Modified:** Yes (prepared asset set as Gallery Image #1)
- **Catalog Eligibility:** **YES** (`is_catalog_eligible = true`)

---

### Product 8: Accessory 1
- **WooCommerce Product ID:** `55097`
- **Product Title:** SF M600 Flashlight Black
- **Builder Role:** `part`
- **Part Type:** `Accessories` (Term ID: 2641)
- **Visual Reference Length:** **140 mm**
- **Reference Measurement Source / Basis:** Surefire M600 Scout Light weaponlight specification: $140\text{ mm}$ overall length ($5.5\text{ inches}$).
- **Original Source Image:** Attachment `55098` (`element-sf-m600b-flashlight-black.jpg`, $1008 \times 628$)
- **Prepared Builder Asset:** Attachment `91847` (`tgb-accessory-sf-m600-black-clean.png`)
- **Builder Asset Dimensions:** $555 \times 361$ px
- **Transparent Background:** Yes (pure alpha channel)
- **Tight Crop:** Yes (10 px transparent padding)
- **Side Orientation:** Yes (horizontal profile assembled with rail clamp)
- **Prepared Asset Created:** Yes (`wp-content/uploads/tgb-prepared/tgb-accessory-sf-m600-black-clean.png`)
- **Gallery Order Modified:** Yes (prepared asset set as Gallery Image #1)
- **Catalog Eligibility:** **YES** (`is_catalog_eligible = true`)

---

### Product 9: Accessory 2
- **WooCommerce Product ID:** `91093`
- **Product Title:** RGW ARI Finger Stop Picatinny Black
- **Builder Role:** `part`
- **Part Type:** `Accessories` (Term ID: 2641)
- **Visual Reference Length:** **35 mm**
- **Reference Measurement Source / Basis:** Arisaka Defense Finger Stop specification: $35\text{ mm}$ physical length ($1.37\text{ inches}$).
- **Original Source Image:** Attachment `91149` (`RGW-ARI-Finger-Stop-Picatinny-Black.jpg`, $1919 \times 1213$)
- **Prepared Builder Asset:** Attachment `91848` (`tgb-accessory-ari-finger-stop-clean.png`)
- **Builder Asset Dimensions:** $592 \times 582$ px
- **Transparent Background:** Yes (pure alpha channel)
- **Tight Crop:** Yes (10 px transparent padding)
- **Side Orientation:** Yes (pure side profile)
- **Prepared Asset Created:** Yes (`wp-content/uploads/tgb-prepared/tgb-accessory-ari-finger-stop-clean.png`)
- **Gallery Order Modified:** Yes (prepared asset set as Gallery Image #1)
- **Catalog Eligibility:** **YES** (`is_catalog_eligible = true`)

---

## 4. Final Prototype Count Verification

Catalog eligibility verified via `TGB_Product_Data::get_base_guns()` and `TGB_Product_Data::get_parts_by_type()`:

| Category | Role | Taxonomy Term | Eligible Product Count |
|---|---|---|---|
| Base Platform | `base_gun` | — | **1** |
| Silencers | `part` | `Silencers` (2638) | **2** |
| Grips | `part` | `Grips` (2639) | **2** |
| Optics | `part` | `Optics` (2640) | **2** |
| Accessories | `part` | `Accessories` (2641) | **2** |
| **Total** | | | **9** |

---

## 5. Persistence Policy

Unlike temporary integration tests, these nine configured prototype records and their prepared gallery assets are **permanent local project fixtures**. They must NOT be deleted after testing, as Parts 7 through 12 depend upon them.

---

## 6. Part 7: Mounting Interfaces & Structured Compatibility

Part 7 introduces structured mount compatibility and default initial placement. Compatibility is evaluated strictly via taxonomy term ID intersection between Part accepted interfaces and Base Gun mount points.

### 6.1 Prototype Mount Interface Taxonomy Terms (`tgb_mount_interface`)

| Term ID | Name | Slug | Purpose & Real-World Interface Standard |
|---|---|---|---|
| **2644** | **Picatinny** | `picatinny` | MIL-STD-1913 / STANAG 2324 accessory mounting rail standard |
| **2645** | **M-LOK** | `m-lok` | Magpul M-LOK direct attachment modular locking slot standard |
| **2646** | **14mm CCW** | `14mm-ccw` | Standard 14mm Counter-Clockwise airsoft muzzle thread standard |
| **2647** | **Carry Handle** | `carry-handle` | AR-15 / M16 carrying handle channel screw-mount standard |

---

### 6.2 Base Gun Platform Mount Points (Product `91635`)

The Base Gun platform (*VFC BCM MK2 MCMR 11.5 EVO Deluxe GBBR Gray*) is configured with four base-local mount points. Coordinates are canonical millimeters ($1\text{ mm} = 1\text{ logical px}$) measured from the top-left ($0, 0$) of the Base Gun builder image ($1492 \times 473$ px, reference length $780\text{ mm}$):

| Mount Point ID | Label | Interface (Term ID) | Local X (mm) | Local Y (mm) | Calibration Basis |
|---|---|---|---|---|---|
| `mount-top-rail-rear` | Top Rail Rear | Picatinny (`2644`) | `450.0` | `9.5` | Flat-top upper receiver MIL-STD-1913 Picatinny rail section above ejection port / magwell. Primary optics / sight mounting point. |
| `mount-top-rail-fwd` | Top Rail Forward | Picatinny (`2644`) | `185.0` | `6.3` | MCMR 12 o'clock Picatinny rail section forward of the receiver towards the gas block. Forward accessory / magnifier point. |
| `mount-lower-handguard` | Lower Handguard | M-LOK (`2645`) | `220.0` | `59.0` | MCMR 6 o'clock lower M-LOK slot section. Primary foregrip, angled grip, and handstop mounting point. |
| `mount-muzzle` | Muzzle | 14mm CCW (`2646`) | `65.0` | `38.2` | Outer barrel $14\text{ mm}$ CCW muzzle thread shoulder at flash hider interface, centered along bore axis. |

---

### 6.3 Eight-Part Prototype Compatibility Matrix

| Product ID | Product Title | Part Type | Accepted Mount Interface(s) | Matching Base Gun Mount Point | Compatible? | Specification / Manufacturer Evidence |
|---|---|---|---|---|---|---|
| **77721** | Taktik MCX Style Silencer Suppressor Plastic Black | Silencers (`2638`) | 14mm CCW (`2646`) | `mount-muzzle` (`2646`) | **YES** | Product description: "14mm CCW self threading". Attaches directly to 14mm CCW barrel threads. |
| **80030** | Taktik HUXWRX Style QD 556 Silencer Suppressor ABS Black | Silencers (`2638`) | 14mm CCW (`2646`) | `mount-muzzle` (`2646`) | **YES** | Product specifications: "Thread: 14mm CCW". Includes 14mm CCW flash hider mount. |
| **85057** | Taktik M-LOK MLok SI Curved Grip HandStop ABS CF Black | Grips (`2639`) | M-LOK (`2645`) | `mount-lower-handguard` (`2645`) | **YES** | Product specifications: "2 MLok Screws... M-lok attachment". Mounts to M-LOK handguard slots. |
| **89535** | RGW Anchor HandStop M-LOK Black | Grips (`2639`) | M-LOK (`2645`) | `mount-lower-handguard` (`2645`) | **YES** | Manufacturer specs: RGW Anchor HandStop designed for direct M-LOK slot attachment. |
| **89499** | RHAM EXPS3 Holographic Sight Black | Optics (`2640`) | Picatinny (`2644`) | `mount-top-rail-rear` (`2644`) | **YES** *(Out of Stock)* | Manufacturer specs: EXPS3 features integrated MIL-STD-1913 Picatinny quick-detach mount. (Card shows *Compatible*, Add button shows *Unavailable* per inventory). |
| **87467** | G&P Retro 4x20 Scope for Carry Handle Black | Optics (`2640`) | Carry Handle (`2647`) | *None* | **NO** | Manufacturer specs: Attaches specifically via AR-15 carry handle screw channel. BCM MK2 platform has no carry handle. |
| **55097** | SF M600 Flashlight Black | Accessories (`2641`) | Picatinny (`2644`) | `mount-top-rail-rear` (`2644`) | **YES** | Manufacturer specs: Surefire M600 Scout weaponlight includes integrated thumbscrew Picatinny rail clamp. |
| **91093** | RGW ARI Finger Stop Picatinny Black | Accessories (`2641`) | Picatinny (`2644`) | `mount-top-rail-rear` (`2644`) | **YES** | Product specifications: "RGW ARI Finger Stop Picatinny Black". Cross-bolt clamp for Picatinny rails. |

**Compatibility Summary:**
- **Total Prototype Parts:** 8
- **Compatible with Base Gun:** 7
- **Incompatible with Base Gun:** 1 (Genuine incompatibility: Product `87467` requires a Carry Handle)
- **Unconfigured:** 0

---

### 6.4 Part Attachment Anchors & Visual Calibration Basis

Attachment anchors represent the exact visual point on the Part builder image (as percentages $0\text{--}100\%$) that docks to the Base Gun mount point:

| Product ID | Product Title | Anchor X (%) | Anchor Y (%) | Visual Calibration Basis |
|---|---|---|---|---|
| **77721** | Taktik MCX Style Silencer | `100.0%` | `50.0%` | Silencer builder image is right-facing barrel-facing; the rear $14\text{ mm}$ CCW barrel thread socket is at the far right edge ($X=100\%$) centered along bore ($Y=50\%$). |
| **80030** | Taktik HUXWRX Style QD 556 Silencer | `100.0%` | `50.0%` | Rear female thread collar at right edge ($X=100\%$) centered along cylindrical suppressor bore ($Y=50\%$). |
| **85057** | Taktik M-LOK SI Curved Grip HandStop | `50.0%` | `0.0%` | Top flat mounting surface interfaces with lower handguard ($Y=0\%$), centered longitudinally ($X=50\%$). |
| **89535** | RGW Anchor HandStop M-LOK Black | `50.0%` | `0.0%` | Top flat M-LOK mating surface ($Y=0\%$), centered across grip width ($X=50\%$). |
| **89499** | RHAM EXPS3 Holographic Sight Black | `50.0%` | `100.0%` | Bottom cross-bolt clamping surface ($Y=100\%$), centered along sight housing base ($X=50\%$). |
| **87467** | G&P Retro 4x20 Scope for Carry Handle | `40.0%` | `100.0%` | Carry handle screw lug at bottom base ($Y=100\%$), $40\%$ from left edge. |
| **55097** | SF M600 Flashlight Black | `66.0%` | `69.0%` | Integrated rail clamp bracket on light body is located $66\%$ from bezel, $69\%$ down from top edge. |
| **91093** | RGW ARI Finger Stop Picatinny Black | `50.0%` | `24.0%` | Upper rail clamp channel rests $24\%$ from top edge ($Y=24\%$), centered horizontally ($X=50\%$). |

---

### 6.5 Default Initial Placement Records

When added to the build, initial placement coordinates are calculated via:
$$\text{initialX} = \text{baseX} + \text{mountX} - (\text{partWidth} \times \text{anchorX} / 100)$$
$$\text{initialY} = \text{baseY} + \text{mountY} - (\text{partHeight} \times \text{anchorY} / 100)$$
*(With canonical stage dimensions $1180 \times 500\text{ logical px}$ and centered Base Gun at $\text{baseX} = 200.0$, $\text{baseY} = 126.0$ for the $780 \times 247.3\text{ mm}$ Base Gun):*

| Product ID | Selected Mount Point | Absolute Mount (X, Y) | Part Dimensions (W × H mm) | Anchor Offset (X, Y mm) | Calculated Initial (X, Y mm) | Stage Clamping? | Post-Add Freedom |
|---|---|---|---|---|---|---|---|
| **77721** (Silencer) | `mount-muzzle` | $(265.0, 164.2)$ | $183.0 \times 42.4$ | $(183.0, 21.2)$ | $(82, 143)$ | **NO** (unclamped) | 100% Free pointer dragging |
| **80030** (Silencer) | `mount-muzzle` | $(265.0, 164.2)$ | $136.0 \times 44.8$ | $(136.0, 22.4)$ | $(129, 142)$ | **NO** (unclamped) | 100% Free pointer dragging |
| **85057** (Grip) | `mount-lower-handguard` | $(420.0, 185.0)$ | $120.0 \times 67.2$ | $(60.0, 0.0)$ | $(360, 185)$ | **NO** (unclamped) | 100% Free pointer dragging |
| **89535** (Grip) | `mount-lower-handguard` | $(420.0, 185.0)$ | $60.0 \times 87.4$ | $(30.0, 0.0)$ | $(390, 185)$ | **NO** (unclamped) | 100% Free pointer dragging |
| **89499** (Optic) | `mount-top-rail-rear` | $(650.0, 135.5)$ | $97.0 \times 71.4$ | $(48.5, 71.4)$ | $(602, 64)$ | **NO** (unclamped) | 100% Free pointer dragging |
| **87467** (Scope) | *Incompatible* | N/A | $150.0 \times 103.0$ | N/A | N/A *(Add disabled)* | N/A | N/A |
| **55097** (Accessory) | `mount-top-rail-rear` | $(650.0, 135.5)$ | $140.0 \times 91.1$ | $(92.4, 62.8)$ | $(558, 73)$ | **NO** (unclamped) | 100% Free pointer dragging |
| **91093** (Accessory) | `mount-top-rail-rear` | $(650.0, 135.5)$ | $35.0 \times 34.4$ | $(17.5, 8.3)$ | $(633, 127)$ | **NO** (unclamped) | 100% Free pointer dragging |
