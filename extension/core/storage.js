// ====================================================================================================
// HMStorage: LocalStorage Management
// ====================================================================================================

var HMStorage = {
    PREFIX: "HM_",
    
    // Core operations
    save: function(key, data) {
        try {
            var fullKey = this.PREFIX + key;
            localStorage.setItem(fullKey, JSON.stringify(data));
            if(typeof HMLogger !== "undefined") {
                HMLogger.debug("Storage saved: " + key);
            }
            return true;
        } catch(e) {
            if(typeof HMLogger !== "undefined") {
                HMLogger.error("Storage save failed (" + key + "): " + e.message);
            }
            console.error("HMStorage save error:", e);
            return false;
        }
    },
    
    load: function(key, defaultValue) {
        try {
            var fullKey = this.PREFIX + key;
            var item = localStorage.getItem(fullKey);
            
            if(item === null) {
                return defaultValue !== undefined ? defaultValue : null;
            }
            
            return JSON.parse(item);
        } catch(e) {
            if(typeof HMLogger !== "undefined") {
                HMLogger.error("Storage load failed (" + key + "): " + e.message);
            }
            console.error("HMStorage load error:", e);
            return defaultValue !== undefined ? defaultValue : null;
        }
    },
    
    remove: function(key) {
        try {
            var fullKey = this.PREFIX + key;
            localStorage.removeItem(fullKey);
            if(typeof HMLogger !== "undefined") {
                HMLogger.debug("Storage removed: " + key);
            }
        } catch(e) {
            if(typeof HMLogger !== "undefined") {
                HMLogger.error("Storage remove failed (" + key + "): " + e.message);
            }
        }
    },
    
    // Clear all HiveMind data
    clear: function() {
        try {
            var keys = Object.keys(localStorage);
            var count = 0;
            
            keys.forEach(k => {
                if(k.startsWith(this.PREFIX)) {
                    localStorage.removeItem(k);
                    count++;
                }
            });
            
            if(typeof HMLogger !== "undefined") {
                HMLogger.info("Storage cleared: " + count + " items removed");
            }
            
            if(typeof HMToast !== "undefined") {
                HMToast.success("All HiveMind data cleared");
            }
        } catch(e) {
            if(typeof HMLogger !== "undefined") {
                HMLogger.error("Storage clear failed: " + e.message);
            }
        }
    },
    
    // List all HiveMind keys
    list: function() {
        var keys = Object.keys(localStorage);
        var hmKeys = keys.filter(k => k.startsWith(this.PREFIX));
        
        console.log("HiveMind Storage Keys:");
        hmKeys.forEach(k => {
            var size = localStorage.getItem(k).length;
            console.log("  " + k + " (" + size + " bytes)");
        });
        
        return hmKeys;
    },
    
    // ===== SPECIFIC LOADERS =====
    
    loadUIState: function() {
        return this.load("UIState", {
            minField: 0,
            minAnthill: 10000000,
            minNest: 0
        });
    },
    
    saveUIState: function(config) {
        this.save("UIState", config);
    },
    
    // Settings management
    loadSettings: function() {
        return this.load("Settings", {
            confirmFlood: true,
            autoDefense: true,
            showRange: true,
            debugMode: false,
            maxRetries: 3,
            delayBetweenWaves: 2000
        });
    },
    
    saveSettings: function(settings) {
        this.save("Settings", settings);
        
        // Apply settings immediately
        if(typeof HMLogger !== "undefined" && settings.debugMode !== undefined) {
            HMLogger.setDebug(settings.debugMode);
        }
    },
    
    // Get storage usage stats
    getUsage: function() {
        var keys = Object.keys(localStorage);
        var hmKeys = keys.filter(k => k.startsWith(this.PREFIX));
        var totalSize = 0;
        
        hmKeys.forEach(k => {
            totalSize += localStorage.getItem(k).length;
        });
        
        return {
            keys: hmKeys.length,
            bytes: totalSize,
            kb: (totalSize / 1024).toFixed(2),
            mb: (totalSize / 1024 / 1024).toFixed(2)
        };
    }
};

// Initialize
if(typeof HMLogger !== "undefined") {
    HMLogger.debug("Storage initialized");
}
