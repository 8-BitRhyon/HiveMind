window.HMAPI = {
    /**
     * Helper to resolve relative URLs to absolute URLs
     * This ensures fetch always targets the correct origin even in content script context.
     */
    _resolveUrl: function(url) {
        if (!url) return url;
        if (url.startsWith('http')) return url;
        
        // Resolve relative to current page origin
        var base = window.location.origin;
        var path = url.startsWith('/') ? url : '/' + url;
        return base + path;
    },

    get: async function (url) {
        try {
            var targetUrl = this._resolveUrl(url);
            
            // Try Background Fetch first (More stable for sessions)
            if (typeof browser !== "undefined" && browser.runtime && browser.runtime.sendMessage) {
                try {
                    var resp = await this._fetchBackground(targetUrl, "GET");
                    if (resp) return resp;
                } catch (e) {
                    HMLogger.warn("Background fetch failed, falling back to local: " + e.message);
                }
            }

            // Fallback to local fetch
            var response = await fetch(targetUrl, {
                credentials: 'include'
            });
            if (!response.ok) throw new Error("Network response was not ok");
            return await response.text();
        } catch (error) {
            HMLogger.error("API Get Error: " + error.message);
            throw error;
        }
    },
    
    post: async function (url, data) {
        try {
            var targetUrl = this._resolveUrl(url);
            var body = data;
            
            if (data && typeof data === "object" && !(data instanceof URLSearchParams) && !(data instanceof FormData)) {
                var searchParams = new URLSearchParams();
                for (var key in data) searchParams.append(key, data[key]);
                body = searchParams.toString();
            }

            // Try Background Fetch first
            if (typeof browser !== "undefined" && browser.runtime && browser.runtime.sendMessage) {
                try {
                    var resp = await this._fetchBackground(targetUrl, "POST", body);
                    if (resp) return resp;
                } catch (e) {
                    HMLogger.warn("Background POST failed, fallback: " + e.message);
                }
            }

            var response = await fetch(targetUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                credentials: 'include',
                body: body
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.text();
        } catch (error) {
            HMLogger.error(`API POST Failed [${url}]: ${error.message}`);
            throw error;
        }
    },

    _fetchBackground: function(url, method, body) {
        return new Promise((resolve, reject) => {
            browser.runtime.sendMessage({
                type: "HM_FETCH",
                payload: {
                    url: url,
                    method: method,
                    body: body,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                    }
                }
            }, response => {
                if (browser.runtime.lastError) {
                    reject(new Error(browser.runtime.lastError.message));
                } else if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response ? response.error : "Unknown background error"));
                }
            });
        });
    },
    
    // Game Specific Endpoints
    Endpoints: {
        moveTroops: "armee_transfert_post.php",
        attack: "guerre.php" // Simplified, actual URLs might vary
    }
};
HMLogger.debug("HMAPI Layer Initialized (window.HMAPI)");
