import { TGB_Utility } from "./TGB-Utility.js";

export class TGB_CatalogClient {
    /**
     * @param {string} [baseUrl] Base URL for the Gun Builder REST API endpoints.
     */
    constructor(baseUrl) {
        let url =
            baseUrl ||
            (window.taktikGunBuilder && window.taktikGunBuilder.restUrl) ||
            "http://" + window.location.hostname + "/wp-json/tgb/v1/";
        if (!url.endsWith("/")) {
            url += "/";
        }
        this.baseUrl = url;
        this.instance = this;
    }

    /**
     * Fetches paginated Base Guns.
     *
     * @param {number} [limit=20]
     * @param {string} [cursor='']
     * @param {AbortSignal} [signal]
     * @return {Promise<{items: Array, limit: number, has_more: boolean, next_cursor: string|null}>}

    /**
     * Fetches dynamic Part Type taxonomy terms.
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
     * Fetches paginated Parts for a specific Part Type.
     *
     * @param {number} typeId
     * @param {number} [limit=20]
     * @param {string} [cursor='']
     * @param {AbortSignal} [signal]
     * @return {Promise<{items: Array, limit: number, has_more: boolean, next_cursor: string|null}>}
     */
    async getPartsByType(categoryID, limit = 20, cursor = "", signal = null) {
        const endpoint = new URL("parts", this.baseUrl);
        endpoint.searchParams.set("category", categoryID);
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
