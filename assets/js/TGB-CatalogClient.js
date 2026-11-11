export class TGB_CatalogClient {
  /**
   * @param {string} [baseUrl] Base URL for the Gun Builder REST API endpoints.
   */
  constructor(baseUrl) {
    let url =
      baseUrl ||
      (window.taktikGunBuilder && window.taktikGunBuilder.restUrl) ||
      window.location.origin + "/wp-json/tgb/v1/";
    if (!url.endsWith("/")) {
      url += "/";
    }
    this.baseUrl = url;
  }

  /**
   * Fetches paginated Base Guns.
   *
   * @param {number} [limit=20]
   * @param {string} [cursor='']
   * @param {AbortSignal} [signal]
   * @return {Promise<{items: Array, limit: number, has_more: boolean, next_cursor: string|null}>}
   */
//   async getBaseGuns(limit = 20, cursor = "", signal = null) {
//     const endpoint = new URL("base-guns", this.baseUrl);
//     endpoint.searchParams.set("limit", limit);
//     if (cursor) {
//       endpoint.searchParams.set("cursor", cursor);
//     }

//     const res = await fetch(endpoint.toString(), {
//       method: "GET",
//       headers: { Accept: "application/json" },
//       signal: signal || undefined,
//     });

//     if (!res.ok) {
//       throw new Error(`Catalog API error: HTTP ${res.status}`);
//     }
//     return await res.json();
//   }

  /**
		 * Fetches dynamic Part Type taxonomy terms.
		 *
		/**
		 * Fetches dynamic Part Type taxonomy terms (Legacy V1.1 compatibility).
		 *
		 * @param {AbortSignal} [signal]
		 * @return {Promise<Array<{id: number, name: string, slug: string}>>}
		 */
  async getPartTypes(signal = null) {
    const endpoint = new URL("part-types", this.baseUrl);
    const res = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: signal || undefined,
    });

    if (!res.ok) {
      throw new Error(`Catalog API error: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Fetches dynamic hierarchical WooCommerce categories containing eligible parts.
   *
   * @param {number} [baseGunId=0] Base Gun ID to filter categories by mounting compatibility.
   * @param {Array} [installedRails=[]] Optional array of installed rail instances.
   * @param {AbortSignal} [signal]
   * @return {Promise<Array<{id: number, name: string, slug: string, parent: number, count: number, children: Array}>>}
   */
  async getCategories(baseGunId = 0, installedRails = [], signal = null) {

    const endpoint = new URL("categories", this.baseUrl);
    if (baseGunId && Number(baseGunId) > 0) {
      endpoint.searchParams.set("product_id", Number(baseGunId));
    }
    if (Array.isArray(installedRails) && installedRails.length > 0) {
      const normRails = installedRails
        .map((r) => ({
          instance_id: r.instance_id || r.instanceId || "",
          product_id: r.product_id || r.productId || 0,
          position: r.position || "bottom",
        }))
        .filter((r) => r.instance_id && r.product_id > 0);
      if (normRails.length > 0) {
        endpoint.searchParams.set("installed_rails", JSON.stringify(normRails));
      }
    }

    const res = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: signal || undefined,
    });

    if (!res.ok) {
      throw new Error(`Catalog API error: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Fetches paginated Parts for a specific WooCommerce product_cat category.
   *
   * @param {number} categoryId
   * @param {number} [baseGunId=0]
   * @param {number} [limit=20]
   * @param {string} [cursor='']
   * @param {Array} [installedRails=[]] Optional array of installed rail instances.
   * @param {AbortSignal} [signal]
   * @return {Promise<{items: Array, limit: number, has_more: boolean, next_cursor: string|null}>}
   */
  async getPartsByCategory(
    categoryId,
    baseGunId = 0,
    limit = 20,
    cursor = "",
    installedRails = [],
    signal = null,
  ) {
    const endpoint = new URL("parts", this.baseUrl);
    endpoint.searchParams.set("category_id", categoryId);
    if (baseGunId && Number(baseGunId) > 0) {
      endpoint.searchParams.set("base_gun_id", Number(baseGunId));
    }
    endpoint.searchParams.set("limit", limit);
    if (cursor) {
      endpoint.searchParams.set("cursor", cursor);
    }
    if (Array.isArray(installedRails) && installedRails.length > 0) {
      const normRails = installedRails
        .map((r) => ({
          instance_id: r.instance_id || r.instanceId || "",
          product_id: r.product_id || r.productId || 0,
          position: r.position || "bottom",
        }))
        .filter((r) => r.instance_id && r.product_id > 0);
      if (normRails.length > 0) {
        endpoint.searchParams.set("installed_rails", JSON.stringify(normRails));
      }
    }

    const res = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: signal || undefined,
    });

    if (!res.ok) {
      throw new Error(`Catalog API error: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Fetches paginated eligible Rail products for a Base Gun.
   *
   * @param {number} [baseGunId=0]
   * @param {number} [limit=20]
   * @param {string} [cursor='']
   * @param {AbortSignal} [signal]
   * @return {Promise<{items: Array, limit: number, has_more: boolean, next_cursor: string|null}>}
   */
  async getRails(baseGunId = 0, limit = 20, cursor = "", signal = null) {
    const endpoint = new URL("rails", this.baseUrl);
    if (baseGunId && Number(baseGunId) > 0) {
      endpoint.searchParams.set("base_gun_id", Number(baseGunId));
    }
    endpoint.searchParams.set("limit", limit);
    if (cursor) {
      endpoint.searchParams.set("cursor", cursor);
    }

    const res = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: signal || undefined,
    });

    if (!res.ok) {
      throw new Error(`Catalog API error: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Authoritatively validates Base Gun, Rails, and Parts compatibility via REST.
   *
   * @param {number} baseGunId
   * @param {Array} [installedRails=[]]
   * @param {Array} [parts=[]]
   * @param {AbortSignal} [signal]
   * @return {Promise<Object>}
   */
  async validateBuild(
    baseGunId,
    installedRails = [],
    parts = [],
    signal = null,
  ) {
    const endpoint = new URL("validate-build", this.baseUrl);
    const res = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        base_gun_id: baseGunId,
        installed_rails: installedRails,
        parts: parts,
      }),
      signal: signal || undefined,
    });

    if (!res.ok) {
      throw new Error(`Validate build API error: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Fetches paginated Parts for a specific Part Type (Legacy V1.1 compatibility).
   *
   * @param {number} typeId
   * @param {number} [limit=20]
   * @param {string} [cursor='']
   * @param {AbortSignal} [signal]
   * @return {Promise<{items: Array, limit: number, has_more: boolean, next_cursor: string|null}>}
   */
  async getPartsByType(typeId, limit = 20, cursor = "", signal = null) {
    const endpoint = new URL("parts", this.baseUrl);
    endpoint.searchParams.set("type_id", typeId);
    endpoint.searchParams.set("limit", limit);
    if (cursor) {
      endpoint.searchParams.set("cursor", cursor);
    }

    const res = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: signal || undefined,
    });

    if (!res.ok) {
      throw new Error(`Catalog API error: HTTP ${res.status}`);
    }
    return await res.json();
  }
}
