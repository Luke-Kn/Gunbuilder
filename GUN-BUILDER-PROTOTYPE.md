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
