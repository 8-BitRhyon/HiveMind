// ====================================================================================================
// HiveMind Extension - Main Initialization Script
// ====================================================================================================
// This file should be loaded LAST (after all other modules are loaded)

(function() {
    'use strict';
    
    console.log("%c[HiveMind] v2.51 Initializing...", "color: #4a9eff; font-weight: bold; font-size: 14px;");
    
    // ===== DEPENDENCY CHECK =====
    var requiredModules = [
        'HMLogger',
        'HMStorage', 
        'HMToast',
        'HMState',
        'HMAPI',
        'Utils',
        'HMEngine'
    ];
    
    var missing = [];
    requiredModules.forEach(function(mod) {
        if(typeof window[mod] === 'undefined') {
            missing.push(mod);
        }
    });
    
    if(missing.length > 0) {
        console.error("[HiveMind] CRITICAL: Missing required modules:", missing);
        console.error("[HiveMind] Please ensure all core files are loaded before init.js");
        alert("HiveMind Extension Error: Missing core modules. Check console for details.");
        return;
    }
    
    HMLogger.debug("All core modules loaded ✓");
    
    // ===== MULTI-ACCOUNT SAFETY CHECK =====
    var currentUser = document.getElementById("pseudo")?.textContent.trim();
    if(currentUser) {
        var seenAccounts = HMStorage.load("SeenAccounts", []);
        
        if(!seenAccounts.includes(currentUser)) {
            seenAccounts.push(currentUser);
            HMStorage.save("SeenAccounts", seenAccounts);
        }
        
        if(seenAccounts.length > 1) {
            var msg = "⚠️ MULTI-ACCOUNT VIOLATION\n\n" +
                     "This extension has been used with " + seenAccounts.length + " accounts:\n" +
                     seenAccounts.join(", ") + "\n\n" +
                     "Game Rules: 1 player = 1 account per server\n\n" +
                     "Extension is now DISABLED for compliance.\n\n" +
                     "To use with a different account, clear browser data first.";
            
            alert(msg);
            HMLogger.error("Multi-account detected - extension disabled");
            return;
        }
        
        HMLogger.info("Account check passed: " + currentUser);
    }
    
    // ===== INITIALIZE STATE =====
    if(typeof HMState !== 'undefined' && HMState.init) {
        HMState.init();
        HMLogger.debug("State initialized");
    }
    
    // ===== LOAD SETTINGS =====
    var settings = HMStorage.loadSettings();
    HMLogger.setDebug(settings.debugMode);
    HMLogger.debug("Settings loaded");

    // ===== INITIALIZE GLOBAL UI =====
    if(typeof ThemeManager !== 'undefined') {
        ThemeManager.init();
    }
    
    if(typeof ClockManager !== 'undefined') {
        ClockManager.init();
    }
    
    if(typeof SettingsPanel !== 'undefined') {
        SettingsPanel.init();
    }
    
    // ===== INITIALIZE NETWORK (Worker Connectivity) =====
    if(typeof NetworkManager !== 'undefined') {
        NetworkManager.init().then(() => {
            HMLogger.debug("NetworkManager initialized");
            
            // Self-Sync HF: If connected, extract player's own HF from the DOM (Sidebar)
            // Membre.php fails for your own profile due to a game redirect, so we read the native UI.
            if (NetworkManager.isConnected && NetworkManager.inGameName) {
                var lastSync = parseInt(HMStorage.load("HM_LastSelfSync", "0"), 10);
                if (Date.now() - lastSync > 60000) { // 1 minute throttle
                    
                    try {
                        var getHFFromDoc = function(doc) {
                            var img = doc.querySelector('img[src*="icone_tdc.png"]') || doc.querySelector('.icone_terrain_boite_info');
                            if (img && img.nextElementSibling && img.nextElementSibling.classList.contains('texte_ligne_boite_info')) {
                                return img.nextElementSibling;
                            }
                            return null;
                        };

                        var hfElement = getHFFromDoc(document);
                        
                        // Check parent frames if not in current document
                        if (!hfElement && window.parent && window.parent.frames) {
                            for (var i = 0; i < window.parent.frames.length; i++) {
                                try {
                                    hfElement = getHFFromDoc(window.parent.frames[i].document);
                                    if (hfElement) break;
                                } catch(e) {} // Ignore cross-origin issues
                            }
                        }

                        if (hfElement && hfElement.textContent) {
                            var hfVal = parseInt(hfElement.textContent.replace(/[^0-9]/g, ""), 10);
                            if (hfVal > 0) {
                                var lastHF = parseInt(HMStorage.load("HM_LastSelfHF_Value", "0"), 10);
                                var timeSinceSync = Date.now() - lastSync;
                                
                                // Only sync if HF has actually changed OR 1 hour has passed (force sync)
                                if (hfVal !== lastHF || timeSinceSync > 3600000) {
                                    var myAlliance = (HMState.User && HMState.User.alliance) ? HMState.User.alliance.replace(/\[|\]/g, "").trim() : "";
                                    var myInfo = { 
                                        name: NetworkManager.inGameName, 
                                        hf: hfVal,
                                        alliance: myAlliance
                                    };
                                    
                                    // Sync to HF Graph History
                                    NetworkManager.submitHFData([myInfo], "self_sync");
                                    
                                    // Sync to Main Dashboard Table (stats::players::history)
                                    if (typeof NetworkManager.submitBatchIntel === 'function') {
                                        NetworkManager.submitBatchIntel([myInfo]);
                                    }
                                    
                                    HMStorage.save("HM_LastSelfSync", Date.now().toString());
                                    HMStorage.save("HM_LastSelfHF_Value", hfVal.toString());
                                    HMLogger.info(`[Self-Sync] Synced updated HF: ${hfVal} (Alliance: ${myAlliance || "None"})`);
                                } else {
                                    // Data hasn't changed, skip network request
                                    HMStorage.save("HM_LastSelfSync", Date.now().toString()); // Reset 1-min throttle
                                    HMLogger.debug("[Self-Sync] HF unchanged, skipping network sync.");
                                }
                            }
                        }
                    } catch (e) {
                        HMLogger.error("[Self-Sync] DOM scraping failed: " + e);
                    }
                }
            }
        });
    }
    
    // ===== INITIALIZE PAGE-SPECIFIC FEATURES =====
    var path = window.location.pathname.toLowerCase(); 
    var isAttackPage = path.includes("ennemie.php") || path.includes("guerre.php");
    var isRankingPage = path.includes("classement") || path.includes("ranking");
    var isAlliancePage = path.includes("alliance.php");
    var isAllianceRankingPage = path.includes("classementalliance.php");
    var isReportPage = path.includes("rapport.php") || path.includes("report.php");
    var isBuildPage = path.includes("construction.php") || path.includes("laboratoire.php") || path.includes("reine.php");
    var isChatPage = path.includes("chat.php");
    

    
    // Attack Page Features
    if(isAttackPage) {
        HMLogger.debug("Attack page detected");
        
        // Initialize Engine (loads army, tech, etc.)
        if(typeof HMEngine !== 'undefined') {
            HMEngine.init();
        }

        // 1. Initialize feature managers first
        if(typeof FloodManager !== 'undefined') HMLogger.debug("FloodManager ready");
        if(typeof DefenseManager !== 'undefined') HMLogger.debug("DefenseManager ready");
        if(typeof QueueManager !== 'undefined') QueueManager.init();
        if(typeof StrategyManager !== 'undefined') StrategyManager.init();
        if(typeof KeyboardManager !== 'undefined') KeyboardManager.init();
        if(typeof HistoryManager !== 'undefined') HMLogger.debug("HistoryManager ready");

        // 2. Build THE HUD (Now that managers are ready)
        if(typeof HMBuilder !== 'undefined') {
            HMBuilder.build();
        } else {
            HMLogger.error("HMBuilder missing - HUD will not load");
        }
    }
    
    // Ranking/Alliance Pages
    if(isRankingPage || isAlliancePage) {
        HMLogger.debug("Ranking/Alliance page detected");
        
        // Initialize Range Indicators
        if(typeof RangeManager !== 'undefined' && settings.showRange) {
            RangeManager.init();
        }
        
        // Initialize Memberlist Enhancements (alliance page only)
        if(isAlliancePage) {
            if(typeof MemberlistManager !== 'undefined') {
                MemberlistManager.init();
            }

            // Auto-scrape alliance members
            if(typeof QueueManager !== 'undefined' && window.location.href.toLowerCase().includes("membres")) {
                QueueManager.scrapeCurrentPage();
            }
        }
        
        // Auto-scrape enemy alliance member pages (classementAlliance.php?alliance=XXX)
        if(isAllianceRankingPage && typeof QueueManager !== 'undefined') {
            HMLogger.debug("Enemy Alliance page detected — triggering scrape");
            QueueManager.scrapeCurrentPage();
        }
    }
    
    // Report Pages
    if (isReportPage) {
        HMLogger.debug("Report page detected");
        if (typeof ReportManager !== 'undefined') {
            ReportManager.init();
        }
    }
    
    // Construction / Lab / Queen Pages
    if (isBuildPage) {
        HMLogger.debug("Build/Research page detected");
        if (typeof TimerManager !== 'undefined') {
            TimerManager.init();
        }
    }
    
    // Chat Page
    if (isChatPage) {
        HMLogger.debug("Chat page detected");
        if (typeof ChatManager !== 'undefined') {
            ChatManager.init();
        }
    }

    // Profile/Member Page - Enemy Intel Overlay
    var isMemberPage = path.includes("membre.php") || path.includes("member.php");
    if (isMemberPage) {
        HMLogger.info("[Intel] Profile page detected, initializing overlay...");
        if (typeof IntelOverlay !== 'undefined') {
            IntelOverlay.init();
        }
    }

    // Alliance Rankings
    var isClassementPage = path.includes("classement2.php");
    var isAllianceTotal = window.location.search.includes("type_classement=alliance_total");
    if (isClassementPage) {
        if (isAllianceTotal) {
            HMLogger.debug("Alliance Rankings detected");
            if (typeof AllianceRankingsParser !== 'undefined') {
                AllianceRankingsParser.init();
            }
        } else {
            HMLogger.debug("Player Rankings detected");
            if (typeof PlayerRankingsParser !== 'undefined') {
                PlayerRankingsParser.init();
            }
        }
    }

    // Messagerie (Inbox) - Passive Intel Collection
    var isMessagePage = path.includes("messagerie.php");
    if (isMessagePage) {
        HMLogger.debug("Message inbox detected");
        if (typeof MessagerieParser !== 'undefined') {
            MessagerieParser.init();
        }
    }

    // Diplomacy - Alliance Description Page
    var isAllianceDesc = path.includes("alliance.php") && window.location.search.includes("Description");
    if (isAllianceDesc) {
        HMLogger.debug("Alliance Diplomacy detected");
        if (typeof DiplomacyParser !== 'undefined') {
            DiplomacyParser.init();
        }
    }

    // ===== GLOBAL KEYBOARD SHORTCUTS =====
    document.addEventListener('keydown', function(e) {
        // Ctrl+Shift+H: Toggle debug mode
        if(e.ctrlKey && e.shiftKey && e.key === 'H') {
            e.preventDefault();
            HMLogger.setDebug(!HMLogger.debugMode);
            HMToast.info("Debug mode " + (HMLogger.debugMode ? "ON" : "OFF"));
        }
        
        // Ctrl+Shift+C: Clear all storage
        if(e.ctrlKey && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            if(confirm("Clear ALL HiveMind data? This cannot be undone.")) {
                HMStorage.clear();
            }
        }
        
        // Ctrl+Shift+S: Show storage stats
        if(e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            var usage = HMStorage.getUsage();
            console.log("[HiveMind Storage]", usage);
            HMToast.info(usage.keys + " items, " + usage.kb + " KB");
        }
    });
    
    // ===== CONSOLE HELPERS =====
    window.HiveMind = {
        version: "2.51",
        debug: function() {
            console.log("%c[HiveMind Debug Info]", "font-weight: bold; font-size: 14px;");
            console.log("State:", HMState);
            console.log("Storage:", HMStorage.getUsage());
            console.log("Settings:", HMStorage.loadSettings());
            
            if(typeof QueueManager !== 'undefined') {
                console.log("Queue:", QueueManager.queue);
            }
            
            if(typeof HistoryManager !== 'undefined') {
                console.log("History:", HistoryManager.getHistory().length + " entries");
            }
        },
        
        reset: function() {
            if(confirm("Reset ALL HiveMind data and reload page?")) {
                HMStorage.clear();
                location.reload();
            }
        },
        
        help: function() {
            console.log("%c[HiveMind Console Commands]", "font-weight: bold;");
            console.log("  HiveMind.debug()  - Show current state");
            console.log("  HiveMind.reset()  - Clear all data and reload");
            console.log("  HiveMind.help()   - Show this message");
            console.log("");
            console.log("Keyboard Shortcuts:");
            console.log("  Ctrl+Shift+H  - Toggle debug mode");
            console.log("  Ctrl+Shift+C  - Clear storage");
            console.log("  Ctrl+Shift+S  - Show storage stats");
        }
    };
    
    // ===== SUCCESS =====
    HMLogger.success("HiveMind v2.51 initialized successfully!");
    HMToast.success("HiveMind loaded");
    
    console.log("%cType HiveMind.help() for console commands", "color: #4a9eff;");
    
})();
