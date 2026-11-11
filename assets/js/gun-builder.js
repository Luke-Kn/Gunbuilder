import { TGB_AccountBuildManager } from "./TGB-AccountBuildManager.js";
import { TGB_BuildState } from "./TGB-BuildState.js";
import { TGB_CatalogClient } from "./TGB-CatalogClient.js";
import { TGB_CurrentBuild } from "./TGB-CurrentBuild.js";
import { TGB_GuestBuildManager } from "./TGB-GuestBuildManager.js";
import { TGB_Interactions } from "./TGB-Interactions.js";
import { TGB_Persistence } from "./TGB-Persistence.js";
import { TGB_ProductSelection } from "./TGB-ProductSelection.js";
import { TGB_Renderer } from "./TGB-Renderer.js";
import { TGB_ShareManager } from "./TGB-ShareManager.js";
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

// (function (window, document) {

//     async function initGunBuilder() {
//         const root = document.getElementById("taktik-gun-builder");
//         if (!root) {
//             return;
//         }

//         if (root.classList.contains("tgb-ready")) {
//             return;
//         }

//         root.classList.add("tgb-ready");

//         // Pre-seed registry from initial render Base Gun if present (Requirement 6)
//         const initialScript = root.querySelector(".tgb-initial-render-data");
//         let initialPayload = null;
//         if (initialScript && initialScript.textContent) {
//             try {
//                 initialPayload = JSON.parse(initialScript.textContent);
//             } catch (e) {
//                 initialPayload = null;
//             }
//         }

//         const currencyConfig =
//             (initialPayload && initialPayload.currency) ||
//             (window.taktikGunBuilder && window.taktikGunBuilder.currency) ||
//             {};
//         const weightConfig =
//             initialPayload && initialPayload.weight_unit
//                 ? { unit: initialPayload.weight_unit }
//                 : (window.taktikGunBuilder && window.taktikGunBuilder.weight) || {};

//         const buildState = new TGB_BuildState();
//         const renderer = new TGB_Renderer(root, buildState);
//         renderer.init();

//         const interactions = new TGB_Interactions(renderer, buildState);
//         interactions.init();
//         renderer.setInteractions(interactions);

//         const catalogClient = new TGB_CatalogClient();
//         const productSelection = new TGB_ProductSelection(
//             root,
//             catalogClient,
//             buildState,
//             renderer,
//             TGB_Utility.productRegistry,
//         );
//         await productSelection.init();
//         const currentBuild = new TGB_CurrentBuild(
//             root,
//             buildState,
//             TGB_Utility.productRegistry,
//             currencyConfig,
//             weightConfig,
//         );
//         currentBuild.init();

//         const persistence = new TGB_Persistence("tgb_current_build_state");

//         if (initialPayload && initialPayload.product && initialPayload.product.id) {
//             productSelection.productRegistry.set(initialPayload.product.id, initialPayload.product);
//         }

// 		window.TGB = {};
//         window.TGB.state = buildState;
//         window.TGB.renderer = renderer;
//         window.TGB.interactions = interactions;
//         window.TGB.catalog = catalogClient;
//         window.TGB.selection = productSelection;
//         window.TGB.currentBuild = currentBuild;
//         window.TGB.cart = currentBuild.cartClient;
//         window.TGB.persistence = persistence;

//         // 1. Deep Link vs Persistence Restoration Precedence (Section 14 & Test I)
//         const urlParams = new URLSearchParams(window.location.search);
//         const hasDeepLink = urlParams.has("product_id") && urlParams.get("product_id").trim() !== "";
//         const deepLinkId = hasDeepLink ? parseInt(urlParams.get("product_id"), 10) : 0;

//         if (hasDeepLink && deepLinkId > 0) {
//             // Explicit deep link takes precedence over stored local persistence (Rule B & Test I)
//             if (initialPayload && initialPayload.status === "ready" && initialPayload.product) {
//                 persistence.saveBaseOnly(deepLinkId);
//                 try {
//                     window.history.replaceState({}, document.title, window.location.pathname);
//                 } catch (e) {}
//             }
//         } else if (!hasDeepLink) {
//             // Normal builder page load: restore persisted build if present (Rule A & Test A)
//             try {
//                 const persisted = persistence.load();
//                 if (persisted) {
//                     const restoreRes = await persistence.restoreBuild(
//                         catalogClient,
//                         productSelection,
//                         buildState,
//                         renderer,
//                         TGB_Utility.productRegistry,
//                     );
//                     if (restoreRes && restoreRes.restored) {
//                         if (restoreRes.partial && restoreRes.message) {
//                             productSelection.showNotice(restoreRes.message, "warning");
//                             currentBuild.announce(restoreRes.message);
//                         } else {
//                             currentBuild.announce("Your previous build was restored.");
//                         }
//                     } else if (restoreRes && restoreRes.message) {
//                         productSelection.showNotice(restoreRes.message, "error");
//                         currentBuild.announce(restoreRes.message);
//                     }
//                 }
//             } catch (err) {
//                 console.warn("[TGB Persistence] Restore failed safely:", err);
//             }
//         }

//         // 2. Wire Auto-Persistence Subscription (Section 12)
//         buildState.subscribe(event => {
//             if (!event || persistence.isRestoring) return;
//             try {
//                 switch (event.type) {
//                     case "base_gun_set":
//                     case "part_added":
//                     case "part_removed":
//                     case "drag_ended":
//                         persistence.save(buildState);
//                         try {
//                             if (window.location.search.includes("product_id")) {
//                                 window.history.replaceState({}, document.title, window.location.pathname);
//                             }
//                         } catch (e) {}
//                         break;
//                     case "part_moved":
//                         persistence.saveDebounced(buildState, 250);
//                         break;
//                 }
//             } catch (err) {
//                 console.warn("[TGB Persistence] Auto-persist error suppressed:", err);
//             }
//         });
//     }

//     if (document.readyState === "loading") {
//         document.addEventListener("DOMContentLoaded", initGunBuilder);
//     } else {
//         initGunBuilder();
//     }
// })(window, document);

// document.querySelectorAll(".tgb-toggle").forEach(btn => {
//     btn.addEventListener("click", () => {
//         const on = btn.getAttribute("aria-checked") !== "true";
//         btn.setAttribute("aria-checked", String(on));
//         btn.querySelector(".tgb-toggle__state").textContent = on ? "ON" : "OFF";
//         btn.dispatchEvent(new CustomEvent("tgb:toggle", { bubbles: true, detail: { checked: on } }));

//         if (on) {
//             let incompatibleCards = document.querySelectorAll(".tgb-card-compat-badge--incompatible");
//             incompatibleCards.forEach(card => {
//                 card.closest(".tgb-product-card").style.display = "none";
//             });
//         } else {
//             let incompatibleCards = document.querySelectorAll(".tgb-card-compat-badge--incompatible");
//             incompatibleCards.forEach(card => {
//                 card.closest(".tgb-product-card").style.display = "flex";
//             });
//         }
//     });
// });
(function (window, document) {
  "use strict";
  //document.addEventListener("click", (e) => console.log(e.target), true);
  const productRegistry = new Map();

  // window.TGB_BuildState = {
  //     Class: TGB_BuildState,
  //     instance: null,
  // };

  // window.TGB_Interactions = {
  //     Class: TGB_Interactions,
  //     instance: null,
  // };

  // // window.TGB_Renderer = {
  // //     Class: TGB_Renderer,
  // //     TGB_Utility.calculateProductGeometry,
  // //     calculateStageGeometry,
  // //     calculateDisplayScale,
  // //     createLayerElement,
  // //     toggleDebug: function () {
  // //         const root = document.getElementById("taktik-gun-builder");
  // //         if (root) {
  // //             root.classList.toggle("tgb-debug");
  // //             return root.classList.contains("tgb-debug");
  // //         }
  // //         return false;
  // //     },
  // //     instance: null,
  // // };

  // window.TGB_Catalog = {
  //     Client: TGB_CatalogClient,
  //     Selection: TGB_ProductSelection,
  //     Registry: productRegistry,
  //     client: null,
  //     selection: null,
  // };

  // //window.TGB_Mounting = TGB_Mounting;

  // window.TGB_CurrentBuild = {
  //     Class: TGB_CurrentBuild,
  //     instance: null,
  // };

  // window.TGB_Cart = {
  //     Client: TGB_CartClient,
  //     instance: null,
  // };

  // window.TGB_Persistence = {
  //     Class: TGB_Persistence,
  //     instance: null,
  // };

  // window.TGB_GuestBuildManager = {
  //     Class: TGB_GuestBuildManager,
  //     instance: null,
  // };

  // window.TGB_AccountBuildManager = {
  //     Class: TGB_AccountBuildManager,
  //     instance: null,
  // };

  // window.TGB_ShareManager = {
  //     Class: TGB_ShareManager,
  //     instance: null,
  // };

  // // Unified TGB namespace for all builder subsystems
  // window.TGB = {
  //     BuildState: TGB_BuildState,
  //     Renderer: TGB_Renderer,
  //     Interactions: TGB_Interactions,
  //     Catalog: window.TGB_Catalog,
  //     Mounting: TGB_Mounting,
  //     CurrentBuild: TGB_CurrentBuild,
  //     Cart: window.TGB_Cart,
  //     Persistence: TGB_Persistence,
  //     GuestBuildManager: window.TGB_GuestBuildManager,
  //     AccountBuildManager: window.TGB_AccountBuildManager,
  //     ShareManager: window.TGB_ShareManager,
  //     state: null,
  //     renderer: null,
  //     interactions: null,
  //     catalog: null,
  //     selection: null,
  //     currentBuild: null,
  //     cart: null,
  //     persistence: null,
  //     guestBuilds: null,
  //     guestBuildManager: null,
  //     accountBuildManager: null,
  //     shareManager: null,
  //     registry: productRegistry,
  //     productRegistry: productRegistry,
  //     exportGuestBuilds: function () {
  //         if (window.TGB.guestBuildManager) {
  //             return window.TGB.guestBuildManager.exportForAccountSync();
  //         }
  //         return [];
  //     },
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
  //         if (window.TGB.guestBuildManager) {
  //             window.TGB.guestBuildManager.promptReset();
  //         } else if (window.TGB.currentBuild) {
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

  async function initMyAccountGuestSync() {
    try {
      if (
        typeof window === "undefined" ||
        !("sessionStorage" in window) ||
        !window.sessionStorage
      )
        return;
      if (window.__tgbGuestTransferInProgress || window.__tgbGuestTransferDone)
        return;

      const raw = window.sessionStorage.getItem("tgb_guest_builds_v2");
      if (!raw) return;

      const guestMgr = new TGB_GuestBuildManager();
      guestMgr.init();
      const builds = guestMgr.exportForAccountSync();
      const eligible = builds.filter(
        (b) => b && b.baseProductId && Number(b.baseProductId) > 0,
      );
      if (eligible.length === 0) return;

      window.__tgbGuestTransferInProgress = true;

      const accountMgr = new TGB_AccountBuildManager({
        guestBuildManager: guestMgr,
      });
      const result = await accountMgr.performGuestTransfer();

      window.__tgbGuestTransferInProgress = false;
      window.__tgbGuestTransferDone = true;

      const wrap = document.getElementById("tgb-my-account-wrap");
      if (wrap && result && result.importedCount > 0) {
        const feedback = document.getElementById("tgb-account-feedback");
        if (feedback) {
          feedback.textContent = `${result.importedCount} guest build(s) transferred to your account. Updating...`;
          feedback.className =
            "tgb-account-feedback tgb-account-feedback--success";
          feedback.style.display = "block";
        }
        setTimeout(() => {
          window.location.reload();
        }, 400);
        return;
      }

      // If on standard My Account dashboard (outside gun-builder-builds endpoint)
      if (result && result.importedCount > 0) {
        const accountContent =
          document.querySelector(".woocommerce-MyAccount-content") ||
          document.querySelector(".woocommerce");
        if (accountContent) {
          const config =
            typeof window !== "undefined" && window.taktikGunBuilder
              ? window.taktikGunBuilder
              : {};
          const buildsUrl =
            config.myAccountSavedBuildsUrl || "/my-account/gun-builder-builds/";
          let noticeHtml =
            `<div class="woocommerce-message tgb-account-transfer-banner" role="alert" style="margin-bottom: 24px; padding: 14px 20px; background: #1a221a; border-left: 4px solid #4CAF50; color: #e0e0e0; border-radius: 4px;">` +
            `<strong>${result.importedCount} guest gun build(s)</strong> were automatically saved to your account. ` +
            `<a href="${buildsUrl}" class="button wc-forward" style="margin-left: 12px; display: inline-block; padding: 6px 14px; background: #c5a059; color: #111; font-weight: 600; text-decoration: none; border-radius: 3px;">View My Gun Builds &rarr;</a>`;
          if (result.skippedCount > 0) {
            noticeHtml += `<div style="margin-top: 6px; font-size: 0.9em; color: #ffb74d;">Note: ${result.skippedCount} build(s) could not be imported because your account reached the 10-build limit. They remain in your session.</div>`;
          }
          noticeHtml += `</div>`;
          accountContent.insertAdjacentHTML("afterbegin", noticeHtml);
        }
      } else if (result && result.skippedCount > 0) {
        const accountContent =
          document.querySelector(".woocommerce-MyAccount-content") ||
          document.querySelector(".woocommerce");
        if (accountContent) {
          const config =
            typeof window !== "undefined" && window.taktikGunBuilder
              ? window.taktikGunBuilder
              : {};
          const buildsUrl =
            config.myAccountSavedBuildsUrl || "/my-account/gun-builder-builds/";
          const noticeHtml =
            `<div class="woocommerce-info tgb-account-transfer-banner" role="alert" style="margin-bottom: 24px; padding: 14px 20px; background: #262115; border-left: 4px solid #ff9800; color: #e0e0e0; border-radius: 4px;">` +
            `Your guest gun build(s) could not be imported because your account has reached the 10-build limit. Delete an existing build in <a href="${buildsUrl}" style="color: #ffb74d; text-decoration: underline;">My Gun Builds</a> to import them.</div>`;
          accountContent.insertAdjacentHTML("afterbegin", noticeHtml);
        }
      }
    } catch (e) {
      window.__tgbGuestTransferInProgress = false;
      console.warn("[TGB Account Sync] Transfer caught error:", e);
    }
  }

  if (typeof window !== "undefined") {
    window.TGB_initMyAccountGuestSync = initMyAccountGuestSync;
  }

  /**
   * Bootstraps the Gun Builder frontend shell, Build State, Renderer, Interactions, and Catalog.
   */
  async function initGunBuilder() {
    const root = document.getElementById("taktik-gun-builder");
    if (!root) {
      const config =
        typeof window !== "undefined" && window.taktikGunBuilder
          ? window.taktikGunBuilder
          : {};
      const isAccount =
        config.isAccountPage ||
        (document.body &&
          (document.body.classList.contains("woocommerce-account") ||
            document.getElementById("tgb-my-account-wrap") ||
            document.querySelector(
              ".woocommerce-MyAccount-navigation, .woocommerce-MyAccount-content",
            )));
      if (config.isLoggedIn && isAccount) {
        initMyAccountGuestSync();
      }
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

    if (initialPayload && initialPayload.product && initialPayload.product.id) {
      productRegistry.set(initialPayload.product.id, initialPayload.product);
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
      productRegistry,
    );
    await productSelection.init();

    const currentBuild = new TGB_CurrentBuild(
      root,
      buildState,
      productRegistry,
      currencyConfig,
      weightConfig,
    );
    currentBuild.init();

    const persistence = new TGB_Persistence("tgb_current_build_state");
    const guestBuildManager = new TGB_GuestBuildManager({
      root,
      catalogClient,
      productSelection,
      buildState,
      renderer,
      productRegistry,
      currentBuild,
      persistence,
    });
    persistence.guestBuildManager = guestBuildManager;

    // Wire up global references
    // window.TGB_BuildState.instance = buildState;
    // window.TGB_Renderer.instance = renderer;
    // window.TGB_Interactions.instance = interactions;
    // window.TGB_Catalog.client = catalogClient;
    // window.TGB_Catalog.selection = productSelection;
    // window.TGB_CurrentBuild.instance = currentBuild;
    // window.TGB_Cart.instance = currentBuild.cartClient;
    // window.TGB_Persistence.instance = persistence;
    // window.TGB_GuestBuildManager.instance = guestBuildManager;

    const accountBuildManager = new TGB_AccountBuildManager({
      root,
      catalogClient,
      productSelection,
      buildState,
      renderer,
      productRegistry,
      currentBuild,
      persistence,
      guestBuildManager,
    });
    // window.TGB_AccountBuildManager.instance = accountBuildManager;

    // window.TGB.state = buildState;
    // window.TGB.renderer = renderer;
    // window.TGB.interactions = interactions;
    // window.TGB.catalog = catalogClient;
    // window.TGB.catalogClient = catalogClient;
    // window.TGB.selection = productSelection;
    // window.TGB.currentBuild = currentBuild;
    // window.TGB.cart = currentBuild.cartClient;
    // window.TGB.persistence = persistence;
    // window.TGB.guestBuilds = guestBuildManager;
    // window.TGB.guestBuildManager = guestBuildManager;
    // window.TGB.accountBuildManager = accountBuildManager;

    const shareManager = new TGB_ShareManager({
      root,
      catalogClient,
      productSelection,
      buildState,
      renderer,
      productRegistry,
      currentBuild,
      guestBuildManager,
      accountBuildManager,
      persistence,
    });
    // window.TGB_ShareManager.instance = shareManager;
    // window.TGB.shareManager = shareManager;

    // Initialize Guest Multi-Build Session Manager (Part 4)
    guestBuildManager.init({
      root,
      catalogClient,
      productSelection,
      buildState,
      renderer,
      productRegistry,
      currentBuild,
      persistence,
    });

    // Initialize Account Build Manager (Part 5)
    accountBuildManager.init();

    // Initialize Share Manager (Part 6)
    shareManager.init();

    // 1. Deep Link vs Share vs Persistence Restoration Precedence (Section 14, Parts 4, 5 & 6)
    const urlParams = new URLSearchParams(window.location.search);
    const hasShareDeepLink =
      urlParams.has("tgb_share") && urlParams.get("tgb_share").trim() !== "";
    const shareToken = hasShareDeepLink
      ? urlParams.get("tgb_share").trim()
      : "";

    const hasSavedBuildDeepLink =
      urlParams.has("saved_build_id") &&
      urlParams.get("saved_build_id").trim() !== "";
    const savedBuildId = hasSavedBuildDeepLink
      ? parseInt(urlParams.get("saved_build_id"), 10)
      : 0;

    const hasDeepLink =
      urlParams.has("product_id") && urlParams.get("product_id").trim() !== "";
    const deepLinkId = hasDeepLink
      ? parseInt(urlParams.get("product_id"), 10)
      : 0;

    if (hasShareDeepLink && shareToken !== "") {
      // Shared read-only build takes top precedence for visitors opening a share link
      try {
        await shareManager.loadSharedBuild(shareToken);
      } catch (err) {
        console.warn("[TGB ShareManager] Share link load failed safely:", err);
      }
    } else if (
      hasSavedBuildDeepLink &&
      savedBuildId > 0 &&
      accountBuildManager.isLoggedIn
    ) {
      // Account saved build takes top precedence for logged-in users
      try {
        await accountBuildManager.loadSavedBuildById(savedBuildId);
        try {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
        } catch (e) {}
      } catch (err) {
        console.warn(
          "[TGB AccountBuildManager] Deep link load failed safely:",
          err,
        );
      }
    } else if (hasDeepLink && deepLinkId > 0) {
      // Explicit deep link takes precedence over stored session persistence
      if (
        initialPayload &&
        initialPayload.status === "ready" &&
        initialPayload.product
      ) {
        const active = guestBuildManager.getActiveBuild();
        if (active) {
          active.baseProductId = deepLinkId;
          active.rails = [];
          active.parts = [];
          guestBuildManager.saveWorkspace();
        }
        try {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
        } catch (e) {}
      }
    } else if (!hasDeepLink) {
      // Normal builder page load: restore active draft from session workspace
      try {
        const active = guestBuildManager.getActiveBuild();
        if (active && active.baseProductId) {
          const restoreRes = await persistence.restoreBuild(
            catalogClient,
            productSelection,
            buildState,
            renderer,
            productRegistry,
            active,
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
        console.warn("[TGB GuestBuildManager] Restore failed safely:", err);
      }
    }

    // 2. Wire Auto-Persistence Subscription (Section 12 & Part 4)
    buildState.subscribe((event) => {
      if (
        !event ||
        persistence.isRestoring ||
        guestBuildManager.isSwitching ||
        (shareManager && shareManager.isReadOnly)
      )
        return;
      try {
        switch (event.type) {
          case "base_gun_set":
          case "part_added":
          case "part_removed":
          case "rail_added":
          case "rail_removed":
          case "drag_ended":
            guestBuildManager.updateActiveBuildFromState(buildState);
            try {
              if (window.location.search.includes("product_id")) {
                window.history.replaceState(
                  {},
                  document.title,
                  window.location.pathname,
                );
              }
            } catch (e) {}
            break;
          case "part_moved":
          case "rail_moved":
            guestBuildManager.updateActiveBuildFromStateDebounced(
              buildState,
              250,
            );
            break;
        }
      } catch (err) {
        console.warn(
          "[TGB GuestBuildManager] Auto-persist error suppressed:",
          err,
        );
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGunBuilder);
  } else {
    initGunBuilder();
  }
})(window, document);
