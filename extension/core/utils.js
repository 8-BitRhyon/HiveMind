var Utils = {
    // Basic formatting
    formatInt: function(n) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    },

    formatCompact: function(n) {
        if (n < 1000) return n.toString();
        if (n < 1000000) {
            return (n / 1000).toFixed(1).replace(/\.0$/, '') + "K";
        }
        return (n / 1000000).toFixed(1).replace(/\.0$/, '') + "M";
    },
    
    // Time formatting
    formatTime: function(ms) {
        if (ms < 0) return "0s";
        var s = Math.floor(ms / 1000);
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var s2 = s % 60;
        return (h > 0 ? h + "h " : "") + (m > 0 ? m + "m " : "") + s2 + "s";
    },
    
    // Date formatting for ETA
    formatDateTime: function(date) {
        return date.toLocaleString();
    },

    // Logistics Calculations
    calculateTravelTime: function(x1, y1, x2, y2, velocity) {
        // Formula: 0.9^V * 637200 * (1 - exp(-(sqrt(dx^2 + dy^2) / 350)))
        var dist = Math.ceil(
            Math.pow(0.9, velocity) * 637200 * 
            (1 - Math.exp(-(Math.sqrt(Math.pow(x1-x2, 2) + Math.pow(y1-y2, 2)) / 350)))
        );
        return dist * 1000; // ms
    },
    
    // Network helpers
    get: async function(url) {
        try {
            var response = await fetch(url);
            if (!response.ok) throw new Error("Network Error");
            return await response.text();
        } catch (e) {
            console.error("Fetch Error: " + url, e);
            throw e;
        }
    },
    
    post: function(url, data) {
        // Implementation moved to API module, but keeping util reference if needed
        // Or simply deprecate this in favor of API.post
    },
    
    // UI Helpers
    humanDelay: function(min, max) {
        var delay = (max !== undefined) ? (Math.random() * (max - min) + min) : min;
        return new Promise(resolve => setTimeout(resolve, delay));
    },
    
    // Rate Limiter (prevents triggering server anti-bot)
    RateLimiter: {
        requests: [],
        maxPerMinute: 30,
        
        canMakeRequest: function() {
            var now = Date.now();
            this.requests = this.requests.filter(t => now - t < 60000);
            return this.requests.length < this.maxPerMinute;
        },
        
        recordRequest: function() {
            this.requests.push(Date.now());
        },
        
        waitIfNeeded: async function() {
            if(!this.canMakeRequest()) {
                HMLogger.warn("Rate limit reached, waiting...");
                HMToast.warn("Rate limit reached, pausing for safety...");
                await new Promise(r => setTimeout(r, 5000)); // Wait 5s before retry
            }
            this.recordRequest();
        }
    }
};
