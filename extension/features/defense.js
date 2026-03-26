// ====================================================================================================
// DefenseManager: Robust Calys-Style Defensive Protocol
// ====================================================================================================

var DefenseManager = {
    // Unit ID mapping (index -> game parameter)
    // Index matches HMState.UnitNames: 0=YoungDwarf, 1=Dwarf, etc.
    UNIT_MAP: ["unite1", "unite2", "unite3", "unite4", "unite5", "unite6", "unite14", "unite7", "unite8", "unite9", "unite10", "unite13", "unite11", "unite12"],
    
    // Cached token (refreshed on each POST response)
    armyToken: "",
    
    // ________________________________________________________________________________________________
    // Refresh status indicators for all defensive positions.
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    refresh: async function() {
        var locations = [
            { id: "field",   inputId: "HM_HFTroopsNb",   selectId: "HM_HFTroopsType",   statusId: "hm-status-field" },
            { id: "anthill", inputId: "HM_ATroops1Nb",   selectId: "HM_ATroops1Type",   statusId: "hm-status-anthill" },
            { id: "nest",    inputId: "HM_ATroops2Nb",   selectId: "HM_ATroops2Type",   statusId: "hm-status-nest" }
        ];
        
        for (var i = 0; i < locations.length; i++) {
            var loc = locations[i];
            var el = document.getElementById(loc.statusId);
            if (el) el.innerHTML = '<span class="hm-spinner"></span>';
            
            try {
                var typeIdx = parseInt(document.getElementById(loc.selectId).value, 10);
                var targetQty = parseInt(document.getElementById(loc.inputId).value.replace(/[^0-9]/g, "") || "0", 10);
                
                if (targetQty <= 0) {
                    if (el) el.innerHTML = "--";
                    continue;
                }
                
                var dist = await HMEngine.getUnitDistribution(typeIdx);
                var current = dist[loc.id] || 0;
                var isOk = current >= targetQty;
                var icon = isOk ? "✔️" : "❌";
                
                if (el) {
                    el.innerHTML = `<span style="font-weight:700; font-family:var(--font-mono);">${Utils.formatCompact(current)}/${Utils.formatCompact(targetQty)} ${icon}</span>`;
                    el.style.color = isOk ? "var(--hm-text)" : "#c8102e";
                }
            } catch (e) {
                if (el) el.innerHTML = "ERR";
                console.error(e);
            }
        }
    },
    
    // ________________________________________________________________________________________________
    // Launch the defensive troop movement sequence.
    // Calys-style: ONE initial GET to fetch token + troop counts, then POSTs only.
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    launchMoveTroops: async function() {
        var btnKeep = document.getElementById("HM_btnKeep");
        if (!btnKeep || btnKeep.value !== "Yes") {
            HMLogger.info("[Defense] Auto-Secure disabled, skipping.");
            return;
        }
        
        HMLogger.info("[Defense] Starting Atomic Sync Sequence...");
        
        document.getElementById("hm-status-field").innerHTML = "⏳";
        document.getElementById("hm-status-anthill").innerHTML = "⏳";
        document.getElementById("hm-status-nest").innerHTML = "⏳";
        
        try {
            // Step 0: Initial GET to fetch token (ONLY ONE GET for entire sequence)
            var initialResp = await fetch("/Armee.php?deplacement=3&v=" + Date.now(), {
                credentials: "include"
            }).then(r => r.text());
            
            var tokenMatch = initialResp.match(/name="t" id="t" value="([^"]*)"/);
            if (tokenMatch) {
                this.armyToken = tokenMatch[1];
                HMLogger.info("[Defense] Initial token: " + this.armyToken.substring(0, 10) + "...");
            } else {
                throw new Error("Failed to get initial token");
            }
            
            await Utils.humanDelay(800, 1200);
            
            // SAFETY ORDER: Anthill first (cover), then Nest, then Field last (scout)
            
            // Step 1: Anthill (primary cover)
            await this.executeTransfer({ 
                inputId: "HM_ATroops1Nb", 
                selectId: "HM_ATroops1Type", 
                dest: "2", 
                statusId: "hm-status-anthill", 
                label: "Anthill" 
            });
            await Utils.humanDelay(800, 1200);
            
            // Step 2: Nest (secondary reserve) 
            await this.executeTransfer({ 
                inputId: "HM_ATroops2Nb", 
                selectId: "HM_ATroops2Type", 
                dest: "3", 
                statusId: "hm-status-nest", 
                label: "Nest" 
            });
            await Utils.humanDelay(800, 1200);
            
            // Step 3: Field (scout - exposed last)
            await this.executeTransfer({ 
                inputId: "HM_HFTroopsNb", 
                selectId: "HM_HFTroopsType", 
                dest: "1", 
                statusId: "hm-status-field", 
                label: "Field" 
            });
            
            this.finishSequence();
        } catch (e) {
            HMLogger.error("[Defense] Sequence failed: " + e.message);
            HMToast.error("Defense sync failed: " + e.message);
        }
    },
    
    // ________________________________________________________________________________________________
    // Execute a single transfer step (POST only - no GET).
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    executeTransfer: async function(config) {
        var statusEl = document.getElementById(config.statusId);
        var targetQty = parseInt(document.getElementById(config.inputId).value.replace(/[^0-9]/g, ""), 10) || 0;
        var typeIdx = parseInt(document.getElementById(config.selectId).value, 10);
        
        // Skip if no target quantity
        if (targetQty <= 0) {
            HMLogger.info(`[Defense] ${config.label}: Skipped (no qty)`);
            if (statusEl) statusEl.innerHTML = "--";
            return;
        }
        
        // Use cached token (from initial GET or previous POST response)
        var token = this.armyToken;
        var unitId = this.UNIT_MAP[typeIdx] || "unite1";
        
        // Build POST body - always send full quantity from Nest
        // Server will handle "already have enough" case
        var req = "t=" + token +
                  "&nbTroupes=" + targetQty +
                  "&ChoixUnite=" + unitId +
                  "&LieuOrigine=3" +
                  "&LieuDestination=" + config.dest +
                  "&Transferer=Envoyer";
        
        HMLogger.info(`[Defense] ${config.label}: Sending ${targetQty} ${unitId} from Nest`);
        
        var resp = await fetch("/Armee.php", {
            credentials: "include",
            headers: {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: req,
            method: "POST"
        }).then(r => r.text());
        
        // CRITICAL: Extract NEW token from POST response for next step
        var newToken = resp.match(/name="t" id="t" value="([^"]*)"/);
        if (newToken) {
            this.armyToken = newToken[1];
            HMLogger.info(`[Defense] ${config.label}: Token rotated`);
        }
        
        // Check for errors in response
        var hasError = resp.includes("pas assez") || resp.includes("not enough") || 
                       resp.includes("Erreur") || resp.includes("Error");
        
        if (!hasError) {
            HMLogger.info(`[Defense] ${config.label}: SUCCESS`);
            if (statusEl) statusEl.innerHTML = "✔️";
        } else {
            HMLogger.warn(`[Defense] ${config.label}: Server message detected`);
            if (statusEl) statusEl.innerHTML = "⚠️";
        }
    },
    
    // ________________________________________________________________________________________________
    // Final cleanup after sequence.
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    finishSequence: function() {
        HMToast.success("Defensive Perimeter Secured");
        HMLogger.info("[Defense] Sequence Complete.");
    },
    
    // ________________________________________________________________________________________________
    // Sync function (called after floods complete).
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    sync: function() {
        this.launchMoveTroops();
    }
};

window.DefenseManager = DefenseManager;
