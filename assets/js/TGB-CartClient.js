 import { TGB_Utility } from "./TGB-Utility.js";
 
 export class TGB_CartClient {
    constructor(buildState, config = null) {
      this.buildState = buildState;
      this.config = config || window.taktikGunBuilder || {};
      this.isSubmitting = false;
      this.currentRequestId = null;
              this.instance = this;

    }

    /**
     * Submits current build to WooCommerce cart.
     *
     * @return {Promise<{success: boolean, data?: Object, message?: string}>}
     */
    async addBuildToCart() {
      if (this.isSubmitting) {
        return { success: false, message: "Submission already in progress." };
      }

      const state = this.buildState.getState();
      const baseGun = state.baseGun;

      if (!baseGun || !baseGun.productId) {
        return {
          success: false,
          message: "Choose a base platform before adding to cart.",
        };
      }

      // Unique request ID per submission attempt (Requirement 33 & 77)
      this.currentRequestId =
        "req-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
      this.isSubmitting = true;

      // Minimal payload strictly from Build State (Requirement 7 & 67)
      const parts = (state.parts || []).map((p) => ({
        product_id: p.productId,
        instance_id: p.instanceId || "",
      }));

      const payload = {
        base_product_id: baseGun.productId,
        parts: parts,
        request_id: this.currentRequestId,
        nonce: this.config.cartNonce || "",
      };

      const endpointUrl =
        (this.config.ajaxUrl || "/wp-admin/admin-ajax.php") +
        "?action=tgb_add_build_to_cart";

      try {
        const response = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": this.config.cartNonce || "",
          },
          body: JSON.stringify(payload),
        });

        const res = await response.json();

        if (response.ok && res && res.success) {
          this.triggerCartFragments(res.data);
          return {
            success: true,
            data: res.data || {},
          };
        } else {
          const errorMsg =
            res && res.data && res.data.message
              ? res.data.message
              : res && res.message
                ? res.message
                : "We couldn't add this build to your cart. Please review the build and try again.";

          return {
            success: false,
            message: errorMsg,
          };
        }
      } catch (err) {
        return {
          success: false,
          message:
            "Network connection issue. Please check your connection and try again.",
        };
      } finally {
        this.isSubmitting = false;
      }
    }

    /**
     * Triggers standard WooCommerce frontend cart fragments refresh events.
     */
    triggerCartFragments(data) {
      try {
        if (typeof window.jQuery !== "undefined") {
          window
            .jQuery(document.body)
            .trigger("added_to_cart", [
              data ? data.fragments : null,
              data ? data.cart_hash : null,
              null,
            ]);
          window.jQuery(document.body).trigger("wc_fragment_refresh");
        }
        document.dispatchEvent(
          new CustomEvent("tgb_build_added_to_cart", { detail: data }),
        );
      } catch (e) {
        // Non-blocking
      }
    }
  }
