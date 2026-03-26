// ====================================================================================================
// History Manager: Attack Logging (Last 50 Operations)
// ====================================================================================================

var HistoryManager = {
    MAX_ENTRIES: 50,
    
    log: function(event) {
        var history = HMStorage.load("HM_AttackHistory", []);
        
        history.unshift({
            timestamp: Date.now(),
            target: event.target || "Unknown",
            coords: event.coords || "--,--",
            waves: event.waves || 0,
            total: event.total || 0,
            type: event.type || "flood",
            success: event.success || false
        });
        
        // Keep last 50 entries
        if(history.length > this.MAX_ENTRIES) {
            history = history.slice(0, this.MAX_ENTRIES);
        }
        
        HMStorage.save("HM_AttackHistory", history);
        HMLogger.info("[History] Operation logged: " + event.type);
    },
    
    getHistory: function() {
        return HMStorage.load("HM_AttackHistory", []);
    },
    
    clear: function() {
        HMStorage.save("HM_AttackHistory", []);
        HMToast.info("Attack history cleared");
    },
    
    // Quick summary for console/debugging
    summary: function() {
        var history = this.getHistory();
        if(history.length === 0) {
            console.log("[HiveMind History] No operations logged.");
            return;
        }
        
        console.log("[HiveMind History] Last " + history.length + " operations:");
        history.slice(0, 10).forEach((h, i) => {
            var date = new Date(h.timestamp).toLocaleString();
            var icon = h.success ? "✓" : "✗";
            console.log(`  ${icon} ${date} | ${h.target} (${h.coords}) | ${h.waves} waves, ${h.total} troops`);
        });
    }
};
