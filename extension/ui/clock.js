/**
 * ClockManager - Dual-Clock Display (Server + Local Time)
 * 
 * Injects clocks directly into the sidebar showing:
 * 1. Server time (Europe/Paris timezone)
 * 2. Local time (user's system timezone)
 */

var ClockManager = {
    // Update interval (1 second)
    INTERVAL_MS: 1000,
    
    // Timer reference
    _timer: null,
    
    /**
     * Initialize the clock display
     * Injects directly into the sidebar DOM for proper visibility
     */
    init: function() {
        // Find the Option+ box to insert after
        var optionPlus = document.getElementById("boiteComptePlus");
        if (!optionPlus) {
            // Try again after DOM loads
            setTimeout(this.init.bind(this), 500);
            return;
        }
        
        // Prevent duplicate initialization
        if (document.getElementById("HM_ClockContainer")) {
            return;
        }
        
        // Create clock container
        var clockContainer = document.createElement("div");
        clockContainer.id = "HM_ClockContainer";
        clockContainer.className = "hm-clock-container hm-sidebar-below";
        clockContainer.innerHTML = `
            <div class="hm-clock-row">
                <span class="hm-clock-label">SERVER:</span>
                <span id="HM_ServerClock" class="hm-clock-time">--:--:--</span>
            </div>
            <div class="hm-clock-row">
                <span class="hm-clock-label">LOCAL:</span>
                <span id="HM_LocalClock" class="hm-clock-time">--:--:--</span>
            </div>
            <div class="hm-clock-diff" id="HM_ClockDiff"></div>
        `;
        
        // Insert AFTER the Option+ box (as next sibling)
        optionPlus.parentNode.insertBefore(clockContainer, optionPlus.nextSibling);
        
        // Start the clock
        this.update();
        this._timer = setInterval(this.update.bind(this), this.INTERVAL_MS);
        
        if (typeof HMLogger !== "undefined") {
            HMLogger.debug("[Clock] Dual-clock initialized (after Option+ box)");
        }
    },
    
    /**
     * Legacy positioning functions - no longer needed
     * Clock is now injected directly into #menuBoite sidebar
     */
    positionClock: function() {
        // No-op: positioning handled by CSS and sidebar injection
    },
    
    reposition: function() {
        // No-op: positioning handled by CSS and sidebar injection
    },
    
    setupHoverBehavior: function() {
        // No-op: visibility handled by sidebar context
    },
    
    /**
     * Update both clocks
     */
    update: function() {
        var now = new Date();
        
        // Server time (Paris)
        var serverTime = now.toLocaleTimeString("en-US", {
            timeZone: "Europe/Paris",
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
        
        // Local time
        var localTime = now.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
        
        // Update displays
        var serverEl = document.getElementById("HM_ServerClock");
        var localEl = document.getElementById("HM_LocalClock");
        var diffEl = document.getElementById("HM_ClockDiff");
        
        if (serverEl) serverEl.textContent = serverTime;
        if (localEl) localEl.textContent = localTime;
        
        // Calculate and display time difference
        if (diffEl) {
            var diffHours = this.getTimeDiffHours(now);
            if (diffHours !== 0) {
                var sign = diffHours > 0 ? "+" : "";
                diffEl.textContent = "(" + sign + diffHours + "h from server)";
            } else {
                diffEl.textContent = "(same as server)";
            }
        }
    },
    
    /**
     * Get the hour difference between local and Paris time
     */
    getTimeDiffHours: function(date) {
        // Get Paris time offset
        var parisTime = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
        var localTime = new Date(date.toLocaleString("en-US"));
        
        // Difference in hours (rounded)
        var diffMs = localTime - parisTime;
        var diffHours = Math.round(diffMs / (1000 * 60 * 60));
        
        return diffHours;
    },
    
    /**
     * Clean up timer
     */
    destroy: function() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        var container = document.getElementById("HM_ClockContainer");
        if (container) {
            container.remove();
        }
    }
};
