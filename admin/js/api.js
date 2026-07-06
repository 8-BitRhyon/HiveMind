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

    // Auto-invalidate cache for this URL on mutating requests
    const method = args[1]?.method || 'GET';
    if (response.ok && ["POST", "PUT", "DELETE", "PATCH"].includes(method.toUpperCase())) {
        const cacheKey = "HM_CACHE_" + requestUrl.replace(window.State.WORKER_URL, "");
        localforage.removeItem(cacheKey).catch(() => {});
    }

    return response;
};

/**
 * Wrapper for fetch that caches GET requests in IndexedDB (localForage).
 * Supports "Stale-While-Revalidate" (SWR): returns cache instantly, then updates in background.
 */
window.fetchCached = async function(url, options = {}, ttlMs = 300000, onUpdate = null) {
    if (options.method && options.method !== 'GET') {
        return window.fetch(url, options);
    }

    const forceRefresh = options.headers && options.headers["X-Force-Refresh"] === "true";
    if (forceRefresh) delete options.headers["X-Force-Refresh"];

    const cacheKey = "HM_CACHE_" + url.replace(window.State.WORKER_URL, "");
    
    // 1. Try to get from Cache
    let cached = null;
    try {
        cached = await localforage.getItem(cacheKey);
    } catch(e) {
        console.warn("localForage Error:", e);
    }

    // 2. Background Revalidation Function
    const revalidate = async () => {
        const headers = { ...options.headers };
        if (cached && cached.etag) {
            headers["If-None-Match"] = cached.etag;
        }

        try {
            const res = await window.fetch(url, { ...options, headers });

            if (res.status === 304 && cached) {
                // Server says nothing changed
                cached.ts = Date.now();
                await localforage.setItem(cacheKey, cached);
                return;
            }

            if (res.ok) {
                const data = await res.json();
                const etag = res.headers.get("ETag");
                await localforage.setItem(cacheKey, {
                    ts: Date.now(),
                    data,
                    etag
                });
                // If data actually changed (or first load), notify the UI
                if (onUpdate) onUpdate(data);
                return data;
            }
        } catch (err) {
            console.warn(`[Background Refresh] Failed for ${url}`, err);
        }
    };

    // 3. Main Return Logic
    if (cached) {
        const isExpired = (Date.now() - cached.ts > ttlMs);
        
        if (!forceRefresh && !isExpired) {
            // Valid cache — return instantly but still revalidate in background if ETag exists
            revalidate(); 
            return { ok: true, json: async () => cached.data, _fromCache: true };
        }
        
        if (!forceRefresh && isExpired) {
            // Stale cache — return instantly but force a revalidate
            revalidate();
            return { ok: true, json: async () => cached.data, _stale: true };
        }
    }

    // 4. No cache or Force Refresh — standard fetch
    const freshData = await revalidate();
    if (freshData) {
        return { ok: true, json: async () => freshData };
    }
    
    // If revalidate failed but we have a stale cache, use it as last resort
    if (cached) {
        return { ok: true, json: async () => cached.data, _lastResort: true };
    }

    // Otherwise, it's a genuine failure
    throw new Error(`Failed to fetch and no cache available for ${url}`);
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
