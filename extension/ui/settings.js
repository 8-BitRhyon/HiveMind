/**
 * SettingsPanel - Centralized Settings UI
 * 
 * Injects a collapsible settings panel below the clock in the sidebar.
 * Provides UI for:
 * - Theme selection
 * - Future settings (garrison size, auto-defense, etc.)
 */

var SettingsPanel = {
    // Panel state
    isExpanded: false,
    
    /**
     * Initialize the settings panel
     * Positions after the clock element (outside sidebar)
     */
    init: function() {
        // Wait for clock to be created first
        var clock = document.getElementById("HM_ClockContainer");
        
        if (!clock) {
            // Check if sidebar anchor even exists on this page
            var anchor = document.getElementById("boiteComptePlus");
            if (!anchor) {
                // If the sidebar anchor isn't here, we don't expect the clock either.
                // Re-check after a delay (matching ClockManager)
                setTimeout(this.init.bind(this), 1000);
                return;
            }

            // Sidebar anchor exists, so clock SHOULD be here soon. Retry.
            if (!this._retryCount) this._retryCount = 0;
            if (this._retryCount < 20) { // Be more patient (10s)
                this._retryCount++;
                setTimeout(this.init.bind(this), 500);
                return;
            }
            
            // Still no clock after 10s? Log a silent info instead of warning
            if (typeof HMLogger !== "undefined") {
                HMLogger.debug("[Settings] Clock container missing - settings skipped on this page");
            }
            return;
        }
        
        // Prevent duplicate initialization
        if (document.getElementById("HM_SettingsPanel")) {
            return;
        }
        
        // Create settings container
        var panel = document.createElement("div");
        panel.id = "HM_SettingsPanel";
        panel.className = "hm-settings-panel hm-sidebar-below";
        
        // Create header with toggle
        var header = document.createElement("div");
        header.className = "hm-settings-header";
        header.innerHTML = `
            <span class="hm-settings-title">⚙ SETTINGS</span>
            <span class="hm-settings-toggle" id="HM_SettingsToggle">▼</span>
        `;
        header.onclick = this.toggle.bind(this);
        
        // Create content area (initially hidden)
        var content = document.createElement("div");
        content.id = "HM_SettingsContent";
        content.className = "hm-settings-content";
        content.style.display = "none";
        
        // Build settings sections
        content.innerHTML = this.buildSettingsHTML();
        
        panel.appendChild(header);
        panel.appendChild(content);
        
        // Insert AFTER the clock element
        clock.parentNode.insertBefore(panel, clock.nextSibling);
        
        // Attach event handlers
        this.attachEvents();
        
        if (typeof HMLogger !== "undefined") {
            HMLogger.debug("[Settings] Panel initialized (positioned after clock)");
        }
    },
    
    /**
     * Legacy reposition function - no longer needed
     * Panel is now injected directly into sidebar
     */
    reposition: function() {
        // No-op: positioning handled by sidebar injection
    },
    
    /**
     * Build the settings HTML
     */
    buildSettingsHTML: function() {
        var currentTheme = typeof ThemeManager !== "undefined" ? ThemeManager.getCurrent() : "brutalist";
        
        return `
            <!-- Theme Selection -->
            <div class="hm-setting-group">
                <div class="hm-setting-label">THEME</div>
                <div class="hm-setting-row">
                    <select id="HM_ThemeSelect" class="hm-select">
                        <option value="brutalist" ${currentTheme === "brutalist" ? "selected" : ""}>Concrete Brutalist</option>
                        <option value="cyber" ${currentTheme === "cyber" ? "selected" : ""}>Neon Syndicate</option>
                        <option value="terminal" ${currentTheme === "terminal" ? "selected" : ""}>Phosphor CRT</option>
                        <option value="sepia" ${currentTheme === "sepia" ? "selected" : ""}>Warm Sepia</option>
                    </select>
                </div>
            </div>
            
            <!-- Defense Settings -->
            <div class="hm-setting-group">
                <div class="hm-setting-label">DEFENSE</div>
                <div class="hm-setting-row">
                    <label class="hm-setting-input-label">Garrison Size:</label>
                    <input type="number" id="HM_GarrisonSize" class="hm-input-small" 
                           value="${this.getSetting('garrisonSize', 300000)}" 
                           min="0" step="50000">
                </div>
            </div>
            
            <!-- Queue Settings -->
            <div class="hm-setting-group">
                <div class="hm-setting-label">QUEUE</div>
                <div class="hm-setting-row">
                    <label class="hm-checkbox-label">
                        <input type="checkbox" id="HM_AutoDefense" 
                               ${this.getSetting('autoDefense', true) ? 'checked' : ''}>
                        Auto-defense after queue
                    </label>
                </div>
                <div class="hm-setting-row">
                    <label class="hm-checkbox-label">
                        <input type="checkbox" id="HM_ConfirmFlood" 
                               ${this.getSetting('confirmFlood', true) ? 'checked' : ''}>
                        Confirm before flooding
                    </label>
                </div>
            </div>
            
            <!-- Visual Settings -->
            <div class="hm-setting-group">
                <div class="hm-setting-label">VISUAL</div>
                <div class="hm-setting-row">
                    <label class="hm-checkbox-label">
                        <input type="checkbox" id="HM_ShowRange" 
                               ${this.getSetting('showRange', true) ? 'checked' : ''}>
                        Show Range Indicators
                    </label>
                </div>
            </div>
            
            <!-- HiveMind Network -->
            <div class="hm-setting-group">
                <div class="hm-setting-label">NETWORK</div>
                <div class="hm-setting-row" id="HM_NetworkStatus">
                    <span style="color: var(--hm-error);">⚫ Offline</span>
                </div>
                <div class="hm-setting-row">
                    <input type="text" id="HM_ManualIGN" class="hm-input-small" 
                           placeholder="Your In-Game Name (if auto-detect fails)" 
                           value="${localStorage.getItem('HM_ManualIGN') || ''}"
                           style="width: 100%; margin-bottom: 6px;">
                </div>
                <div class="hm-setting-row">
                    <input type="password" id="HM_AllianceKey" class="hm-input-small" 
                           placeholder="Personal Access Token" 
                           value="${localStorage.getItem('HM_AccessToken') || ''}"
                           style="width: 100%; margin-bottom: 6px;">
                </div>
                <div class="hm-setting-row">
                    <button id="HM_ConnectBtn" class="hm-btn-small" style="width: 100%;">
                        Connect to Network
                    </button>
                </div>
            </div>
            
            <!-- Version Info -->
            <div class="hm-setting-footer">
                HiveMind v2.51 | TQC Alliance
            </div>
        `;
    },
    
    /**
     * Toggle panel visibility
     */
    toggle: function() {
        var content = document.getElementById("HM_SettingsContent");
        var toggle = document.getElementById("HM_SettingsToggle");
        
        this.isExpanded = !this.isExpanded;
        
        if (this.isExpanded) {
            content.style.display = "block";
            toggle.textContent = "▲";
        } else {
            content.style.display = "none";
            toggle.textContent = "▼";
        }
    },
    
    /**
     * Attach event handlers to settings inputs
     */
    attachEvents: function() {
        var self = this;
        
        // Theme selection
        var themeSelect = document.getElementById("HM_ThemeSelect");
        if (themeSelect) {
            themeSelect.onchange = function() {
                if (typeof ThemeManager !== "undefined") {
                    ThemeManager.apply(this.value);
                }
            };
        }
        
        // Garrison size
        var garrisonInput = document.getElementById("HM_GarrisonSize");
        if (garrisonInput) {
            garrisonInput.onchange = function() {
                self.saveSetting('garrisonSize', parseInt(this.value) || 300000);
            };
        }
        
        // Auto-defense checkbox
        var autoDefense = document.getElementById("HM_AutoDefense");
        if (autoDefense) {
            autoDefense.onchange = function() {
                self.saveSetting('autoDefense', this.checked);
            };
        }
        
        // Confirm flood checkbox
        var confirmFlood = document.getElementById("HM_ConfirmFlood");
        if (confirmFlood) {
            confirmFlood.onchange = function() {
                self.saveSetting('confirmFlood', this.checked);
            };
        }
        
        // Range Indicators checkbox
        var showRange = document.getElementById("HM_ShowRange");
        if (showRange) {
            showRange.onchange = function() {
                self.saveSetting('showRange', this.checked);
                if (typeof RangeManager !== "undefined") {
                     if(!this.checked) RangeManager.clearIndicators();
                     else RangeManager.highlightRows();
                }
            };
        }
        
        
        // Manual IGN input - save to localStorage
        var ignInput = document.getElementById("HM_ManualIGN");
        if (ignInput) {
            ignInput.onchange = function() {
                localStorage.setItem("HM_ManualIGN", this.value.trim());
            };
        }
        
        // Network Connect button
        var connectBtn = document.getElementById("HM_ConnectBtn");
        if (connectBtn) {
            connectBtn.onclick = async function() {
                // Save IGN before connecting
                var ignInput = document.getElementById("HM_ManualIGN");
                if (ignInput && ignInput.value.trim()) {
                    localStorage.setItem("HM_ManualIGN", ignInput.value.trim());
                }
                
                var keyInput = document.getElementById("HM_AllianceKey");
                var key = keyInput ? keyInput.value.trim() : "";
                
                if (!key) {
                    HMToast.error("Please enter your Personal Access Token");
                    return;
                }
                
                connectBtn.disabled = true;
                connectBtn.textContent = "Connecting...";
                
                if (typeof NetworkManager !== "undefined") {
                    var success = await NetworkManager.authenticate(key);
                    if (success) {
                        self.updateNetworkStatus(true);
                    } else {
                        self.updateNetworkStatus(false);
                    }
                } else {
                    HMToast.error("Network module not loaded");
                }
                
                connectBtn.disabled = false;
                connectBtn.textContent = "Connect to Network";
            };
        }
        
        // Auto-login on panel init if key is stored
        this.tryAutoLogin();
    },
    
    /**
     * Attempt auto-login using stored key
     */
    tryAutoLogin: async function() {
        if (typeof NetworkManager !== "undefined" && NetworkManager.autoLogin) {
            var success = await NetworkManager.autoLogin();
            this.updateNetworkStatus(success);
        }
    },
    
    /**
     * Update the network status indicator
     */
    updateNetworkStatus: function(isConnected) {
        var statusEl = document.getElementById("HM_NetworkStatus");
        var connectBtn = document.getElementById("HM_ConnectBtn");
        
        if (statusEl) {
            if (isConnected) {
                var ign = (typeof NetworkManager !== "undefined" && NetworkManager.inGameName) 
                          ? NetworkManager.inGameName : "Connected";
                statusEl.innerHTML = '<span style="color: var(--hm-success);">🟢 ' + ign + '</span>';
            } else {
                statusEl.innerHTML = '<span style="color: var(--hm-error);">⚫ Offline</span>';
            }
        }
        
        if (connectBtn) {
            connectBtn.textContent = isConnected ? "Disconnect" : "Connect to Network";
            if (isConnected) {
                connectBtn.onclick = async function() {
                    if (typeof NetworkManager !== "undefined") {
                        await NetworkManager.logout();
                        SettingsPanel.updateNetworkStatus(false);
                    }
                };
            }
        }
    },
    
    /**
     * Get a setting value
     */
    getSetting: function(key, defaultValue) {
        var settings = JSON.parse(localStorage.getItem("HM_Settings") || "{}");
        return settings[key] !== undefined ? settings[key] : defaultValue;
    },
    
    /**
     * Save a setting value
     */
    saveSetting: function(key, value) {
        var settings = JSON.parse(localStorage.getItem("HM_Settings") || "{}");
        settings[key] = value;
        localStorage.setItem("HM_Settings", JSON.stringify(settings));
        
        if (typeof HMLogger !== "undefined") {
            HMLogger.info("[Settings] Saved: " + key + " = " + value);
        }
    }
};
