// ====================================================================================================
// HMLogger: Centralized Logging System
// ====================================================================================================

var HMLogger = {
    prefix: "[HiveMind]",
    debugMode: false, // Set to true for verbose logging
    
    // Log levels
    info: function(msg) {
        console.log(this.prefix + " ℹ️ " + msg);
    },
    
    warn: function(msg) {
        console.warn(this.prefix + " ⚠️ " + msg);
    },
    
    error: function(msg) {
        console.error(this.prefix + " ❌ " + msg);
    },
    
    debug: function(msg) {
        if(this.debugMode) {
            console.log(this.prefix + " 🐛 [DEBUG] " + msg);
        }
    },
    
    success: function(msg) {
        console.log(this.prefix + " ✓ " + msg);
    },
    
    // Enable/disable debug mode
    setDebug: function(enabled) {
        this.debugMode = enabled;
        this.info("Debug mode " + (enabled ? "ENABLED" : "DISABLED"));
    },
    
    // Structured logging for specific events
    logEvent: function(category, action, details) {
        var timestamp = new Date().toISOString();
        var msg = `[${category}] ${action}`;
        if(details) msg += ": " + JSON.stringify(details);
        
        if(this.debugMode) {
            console.log(this.prefix + " 📝 " + timestamp + " " + msg);
        }
    },
    
    // Performance timing
    time: function(label) {
        console.time(this.prefix + " ⏱️ " + label);
    },
    
    timeEnd: function(label) {
        console.timeEnd(this.prefix + " ⏱️ " + label);
    }
};

// Initialize
HMLogger.debug("Logger initialized");
