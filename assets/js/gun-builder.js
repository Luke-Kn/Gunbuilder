import { TGB_BuildState } from "./TGB-BuildState.js";
import { TGB_CatalogClient } from "./TGB-CatalogClient.js";
import { TGB_CurrentBuild } from "./TGB-CurrentBuild.js";
import { TGB_Interactions } from "./TGB-Interactions.js";
import { TGB_Persistence } from "./TGB-Persistence.js";
import { TGB_ProductSelection } from "./TGB-ProductSelection.js";
import { TGB_Renderer } from "./TGB-Renderer.js";
import { TGB_Utility } from "./TGB-Utility.js";

/**
 * Taktik Gun Builder - Canonical 2D Layered DOM Renderer + Unified Build State + Pointer Dragging (Parts 4 & 5)
 *
 * Implements:
 * 1. Canonical Coordinate System: 1 mm = 1 logical pixel
 * 2. Logical Product Geometry (aspect ratio preserved from WooCommerce Gallery image)
 * 3. Logical Stage Geometry & Centered Base Gun Placement
 * 4. Whole-Stage Responsive Display Scale System (displayScale = min(1, viewportWidth / stageWidth))
 * 5. Unified In-Memory Build State (Single Source of Truth)
 * 6. Generic Part Instances with Unique Instance IDs
 * 7. Pointer Events Dragging (mouse, touch, pen) with Pointer Capture
 * 8. Physical-to-Logical Coordinate Conversion (delta / displayScale)
 * 9. Stage Boundary Enforcement (clamping)
 * 10. ResizeObserver Responsive Recalculation & Drag Safety
 * 11. State-to-DOM Synchronization (rAF throttled)
 * 12. Fixed Base Gun (Non-draggable)
 *
 * @package TaktikGunBuilder
 */

(function (window, document) {
    // let tgb_catalogClient = new TGB_CatalogClient();
    // let tgb_buildState = new TGB_BuildState();
    // let tgb_renderer = new TGB_Renderer(TGB_Utility.root, tgb_buildState);
    // let tgb_selection = new TGB_ProductSelection(
    //     TGB_Utility.root,
    //     tgb_catalogClient,
    //     tgb_buildState,
    //     tgb_renderer,
    //     TGB_Utility.productRegistry,
    // );

    // tgb_selection.init();

    // window.TGB_BuildState = tgb_buildState;

    // window.TGB_Interactions = new TGB_Interactions();

    // window.TGB_Renderer = tgb_renderer;

    // window.TGB_Catalog = tgb_catalogClient;

    // window.TGB_Mounting = TGB_Utility.TGB_Mounting;

    // window.TGB_CurrentBuild = new TGB_CurrentBuild(TGB_Utility.root, tgb_buildState, TGB_Utility.productRegistry);

    // window.TGB_Cart = new TGB_CartClient();

    // window.TGB_Persistence = new TGB_Persistence();

    // initGunBuilder();

    // Unified TGB namespace for all builder subsystems
    // window.TGB = {
    //     BuildState: window.TGB_BuildState,
    //     Renderer: window.TGB_Renderer,
    //     Interactions: window.TGB_Interactions,
    //     Catalog: window.TGB_Catalog,
    //     Mounting: window.TGB_Mounting,
    //     CurrentBuild: window.TGB_CurrentBuild,
    //     Cart: window.TGB_Cart,
    //     Persistence: window.TGB_Persistence,
    //     state: null,
    //     renderer: null,
    //     interactions: null,
    //     catalog: null,
    //     selection: null,
    //     currentBuild: null,
    //     cart: null,
    //     persistence: null,
    //     registry: tgb_selection.productRegistry,
    //     addPart: function (product, x, y, zIndex) {
    //         if (window.TGB.selection && !x && !y) {
    //             return window.TGB.selection.addPartToBuild(product);
    //         }
    //         if (window.TGB.state) {
    //             return window.TGB.state.addPart(product, x, y, zIndex);
    //         }
    //         return null;
    //     },
    //     selectBaseGun: function (product) {
    //         if (window.TGB.selection) {
    //             return window.TGB.selection.selectBaseGun(product);
    //         }
    //         return null;
    //     },
    //     removePart: function (instanceId) {
    //         if (window.TGB.state) {
    //             return window.TGB.state.removePart(instanceId);
    //         }
    //         return false;
    //     },
    //     addBuildToCart: function () {
    //         if (window.TGB.currentBuild) {
    //             return window.TGB.currentBuild.handleAddBuildToCart();
    //         }
    //         return null;
    //     },
    //     getState: function () {
    //         if (window.TGB.state) {
    //             return window.TGB.state.getState();
    //         }
    //         return null;
    //     },
    //     reset: function () {
    //         if (window.TGB.currentBuild) {
    //             window.TGB.currentBuild.handleResetBuild();
    //         } else if (window.TGB.state) {
    //             window.TGB.state.reset();
    //             window.TGB.state.setBaseGun(null);
    //             if (window.TGB.persistence) {
    //                 window.TGB.persistence.clear();
    //             }
    //         }
    //     },
    // };

    /**
     * Bootstraps the Gun Builder frontend shell, Build State, Renderer, Interactions, and Catalog.
     */
    async function initGunBuilder() {
        const root = document.getElementById("taktik-gun-builder");
        if (!root) {
            return;
        }

        if (root.classList.contains("tgb-ready")) {
            return;
        }

        root.classList.add("tgb-ready");

        // Pre-seed registry from initial render Base Gun if present (Requirement 6)
        const initialScript = root.querySelector(".tgb-initial-render-data");
        let initialPayload = null;
        if (initialScript && initialScript.textContent) {
            try {
                initialPayload = JSON.parse(initialScript.textContent);
            } catch (e) {
                initialPayload = null;
            }
        }

        const currencyConfig =
            (initialPayload && initialPayload.currency) ||
            (window.taktikGunBuilder && window.taktikGunBuilder.currency) ||
            {};
        const weightConfig =
            initialPayload && initialPayload.weight_unit
                ? { unit: initialPayload.weight_unit }
                : (window.taktikGunBuilder && window.taktikGunBuilder.weight) || {};

        const buildState = new TGB_BuildState();
        const renderer = new TGB_Renderer(root, buildState);
        renderer.init();

        const interactions = new TGB_Interactions(renderer, buildState);
        interactions.init();
        renderer.setInteractions(interactions);

        const catalogClient = new TGB_CatalogClient();
        const productSelection = new TGB_ProductSelection(
            root,
            catalogClient,
            buildState,
            renderer,
            TGB_Utility.productRegistry,
        );
        await productSelection.init();
        const currentBuild = new TGB_CurrentBuild(
            root,
            buildState,
            TGB_Utility.productRegistry,
            currencyConfig,
            weightConfig,
        );
        currentBuild.init();

        const persistence = new TGB_Persistence("tgb_current_build_state");

        if (initialPayload && initialPayload.product && initialPayload.product.id) {
            productSelection.productRegistry.set(initialPayload.product.id, initialPayload.product);
        }
        // Wire up global references
        // window.TGB_BuildState.instance = buildState;
        // window.TGB_Renderer.instance = renderer;
        // window.TGB_Interactions.instance = interactions;
        // window.TGB_Catalog.client = catalogClient;
        // window.TGB_Catalog.selection = productSelection;
        // window.TGB_CurrentBuild.instance = currentBuild;
        // window.TGB_Cart.instance = currentBuild.cartClient;
        // window.TGB_Persistence.instance = persistence;
        window.TGB = {};
        window.TGB.state = buildState;
        window.TGB.renderer = renderer;
        window.TGB.interactions = interactions;
        window.TGB.catalog = catalogClient;
        window.TGB.selection = productSelection;
        window.TGB.currentBuild = currentBuild;
        window.TGB.cart = currentBuild.cartClient;
        window.TGB.persistence = persistence;

        // 1. Deep Link vs Persistence Restoration Precedence (Section 14 & Test I)
        const urlParams = new URLSearchParams(window.location.search);
        const hasDeepLink = urlParams.has("product_id") && urlParams.get("product_id").trim() !== "";
        const deepLinkId = hasDeepLink ? parseInt(urlParams.get("product_id"), 10) : 0;

        if (hasDeepLink && deepLinkId > 0) {
            // Explicit deep link takes precedence over stored local persistence (Rule B & Test I)
            if (initialPayload && initialPayload.status === "ready" && initialPayload.product) {
                persistence.saveBaseOnly(deepLinkId);
                try {
                    window.history.replaceState({}, document.title, window.location.pathname);
                } catch (e) {}
            }
        } else if (!hasDeepLink) {
            // Normal builder page load: restore persisted build if present (Rule A & Test A)
            try {
                const persisted = persistence.load();
                if (persisted) {
                    const restoreRes = await persistence.restoreBuild(
                        catalogClient,
                        productSelection,
                        buildState,
                        renderer,
                        TGB_Utility.productRegistry,
                    );
                    if (restoreRes && restoreRes.restored) {
                        if (restoreRes.partial && restoreRes.message) {
                            productSelection.showNotice(restoreRes.message, "warning");
                            currentBuild.announce(restoreRes.message);
                        } else {
                            currentBuild.announce("Your previous build was restored.");
                        }
                    } else if (restoreRes && restoreRes.message) {
                        productSelection.showNotice(restoreRes.message, "error");
                        currentBuild.announce(restoreRes.message);
                    }
                }
            } catch (err) {
                console.warn("[TGB Persistence] Restore failed safely:", err);
            }
        }

        // 2. Wire Auto-Persistence Subscription (Section 12)
        buildState.subscribe(event => {
            if (!event || persistence.isRestoring) return;
            try {
                switch (event.type) {
                    case "base_gun_set":
                    case "part_added":
                    case "part_removed":
                    case "drag_ended":
                        persistence.save(buildState);
                        try {
                            if (window.location.search.includes("product_id")) {
                                window.history.replaceState({}, document.title, window.location.pathname);
                            }
                        } catch (e) {}
                        break;
                    case "part_moved":
                        persistence.saveDebounced(buildState, 250);
                        break;
                }
            } catch (err) {
                console.warn("[TGB Persistence] Auto-persist error suppressed:", err);
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initGunBuilder);
    } else {
        initGunBuilder();
    }
})(window, document);

document.querySelectorAll(".tgb-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
        const on = btn.getAttribute("aria-checked") !== "true";
        btn.setAttribute("aria-checked", String(on));
        btn.querySelector(".tgb-toggle__state").textContent = on ? "ON" : "OFF";
        btn.dispatchEvent(new CustomEvent("tgb:toggle", { bubbles: true, detail: { checked: on } }));

        if (on) {
            let incompatibleCards = document.querySelectorAll(".tgb-card-compat-badge--incompatible");
            incompatibleCards.forEach(card => {
                card.closest(".tgb-product-card").style.display = "none";
            });
        } else {
            let incompatibleCards = document.querySelectorAll(".tgb-card-compat-badge--incompatible");
            incompatibleCards.forEach(card => {
                card.closest(".tgb-product-card").style.display = "flex";
            });
        }
    });
});
