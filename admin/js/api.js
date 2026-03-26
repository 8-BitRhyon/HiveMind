/**
 * Network API & Caching (admin/js/api.js)
 */

// Global Fetch Interceptor to handle Session Expiration (401s)
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const isDeleteOp = args[1]?.method === 'DELETE';
    
    if (response.status === 401 && window.State.adminSession && !isDeleteOp) {
        window.handleLogout(); // Defined in app.js
        window.showError("Session expired. Please log in again.");
        throw new Error("Session expired (401 Unauthorized)");
    }
    return response;
};

/**
 * Wrapper for fetch that caches GET requests in IndexedDB (localForage).
 * Saves 100% of network latency and skips Cloudflare operations during repeated page loads,
 * while preventing main thread locking on large string parsing.
 */
window.fetchCached = async function(url, options = {}, ttlMs = 300000) {
    if (options.method && options.method !== 'GET') {
        return window.fetch(url, options);
    }

    const forceRefresh = options.headers && options.headers["X-Force-Refresh"] === "true";
    if (forceRefresh) delete options.headers["X-Force-Refresh"];

    const cacheKey = "HM_CACHE_" + url.replace(window.State.WORKER_URL, "");
    
    // Use IndexedDB via localForage
    let cached = null;
    try {
        cached = await localforage.getItem(cacheKey);
    } catch(e) {
        console.warn("localForage Error:", e);
    }

    if (cached) {
        // Instant return if within TTL and not forcing refresh
        if (!forceRefresh && (Date.now() - cached.ts < ttlMs)) {
            return { ok: true, json: async () => cached.data };
        }
    }

    // Prepare headers for ETag check
    const headers = { ...options.headers };
    if (cached && cached.etag) {
        headers["If-None-Match"] = cached.etag;
    }

    try {
        const res = await window.fetch(url, { ...options, headers });

        if (res.status === 304 && cached) {
            console.debug(`[Cache 304] ${url} - Server confirmed no changes.`);
            cached.ts = Date.now(); // Extend TTL
            await localforage.setItem(cacheKey, cached);
            return { ok: true, json: async () => cached.data };
        }

        if (res.ok) {
            const data = await res.json();
            const etag = res.headers.get("ETag");
            await localforage.setItem(cacheKey, {
                ts: Date.now(),
                data,
                etag
            });
            return { ok: true, json: async () => data };
        }
        return res;
    } catch (err) {
        // Fallback to stale cache if network fails
        if (cached) {
            console.warn(`[Network Error] Falling back to stale cache for ${url}`, err);
            return { ok: true, json: async () => cached.data };
        }
        throw err;
    }
};

window.clearCache = async function() {
    try {
        const keys = await localforage.keys();
        for (const key of keys) {
            if (key.startsWith("HM_CACHE_")) {
                await localforage.removeItem(key);
            }
        }
    } catch(err) {
        console.error("Failed to clear cache:", err);
    }
};

window.withRefresh = function(cb) {
    return async () => {
        await window.clearCache();
        cb();
    };
};
