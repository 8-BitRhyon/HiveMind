/**
 * Diplomacy Parser
 * Parses alliance.php?Description to extract Pacts and Wars.
 * Submits the data to the HiveMind Worker to inform the Admin Panel graphs.
 */
var DiplomacyParser = {
    init: function () {
        HMLogger.debug("[Diplomacy] Initializing scraper...");
        this.waitForContent();
    },

    waitForContent: function () {
        var self = this;
        var attempts = 0;
        var interval = setInterval(function () {
            var allianceDiv = document.getElementById("alliance") || document.getElementById("centre");
            var html = allianceDiv ? allianceDiv.innerHTML : "";
            
            // Wait for XAJAX to inject the table or text
            if (html.includes("tab_pacte") || html.includes("In war with") || html.includes("Pacts:")) {
                clearInterval(interval);
                HMLogger.debug("[Diplomacy] XAJAX content loaded.");
                self.parseDiplomacy();
            } else if (attempts > 20) { // 10 seconds max
                clearInterval(interval);
                HMLogger.debug("[Diplomacy] Timeout waiting for XAJAX content.");
                self.parseDiplomacy(); // try anyway
            }
            attempts++;
        }, 500);
    },

    parseDiplomacy: function () {
        var pacts = [];
        var wars = [];

        try {
            // 1. Extract Pacts
            var pactTable = document.getElementById("tab_pacte");
            if (pactTable) {
                HMLogger.info("[Diplomacy] Found pact table");
                var pactLinks = pactTable.querySelectorAll("a");
                pactLinks.forEach(function (link) {
                    var href = link.getAttribute("href") || "";
                    if (href.includes("classementAlliance.php")) {
                        // Extract tag from URL (e.g., ?alliance=TAG) for guaranteed reliability
                        var mapMatch = href.match(/[?&]alliance=([^&]+)/);
                        var allianceTag = mapMatch ? mapMatch[1] : link.textContent.trim();
                        if (allianceTag) {
                            pacts.push(allianceTag);
                        }
                    }
                });
            } else {
                HMLogger.warn("[Diplomacy] Could not find #tab_pacte");
            }

            // 2. Extract Wars
            var allElements = document.querySelectorAll("strong");
            let inWarElement = null;
            allElements.forEach(function(el) {
                if (el.textContent.includes("In war with")) {
                    inWarElement = el;
                }
            });

            if (inWarElement) {
                HMLogger.info("[Diplomacy] Found 'In war with' element");
                var parentCenter = inWarElement.closest("center") || inWarElement.parentNode;
                if (parentCenter) {
                    // Check if it says "No war"
                    if (!parentCenter.textContent.includes("No war")) {
                        var warLinks = parentCenter.querySelectorAll("a");
                        warLinks.forEach(function (link) {
                            var href = link.getAttribute("href") || "";
                            if (href.includes("classementAlliance.php")) {
                                var warMatch = href.match(/[?&]alliance=([^&]+)/);
                                var allianceTag = warMatch ? warMatch[1] : link.textContent.trim();
                                if (allianceTag) {
                                    wars.push(allianceTag);
                                }
                            }
                        });
                    } else {
                        HMLogger.info("[Diplomacy] No wars declared.");
                    }
                }
            } else {
                HMLogger.warn("[Diplomacy] Could not find 'In war with' element");
            }

            HMLogger.info("[Diplomacy] Found " + pacts.length + " pacts and " + wars.length + " wars.");

            // 3. Submit
            if (pacts.length > 0 || wars.length > 0) {
                // Local cached version for immediate UI use (Server Map, etc)
                localStorage.setItem("HM_Diplomacy", JSON.stringify({ pacts: pacts, wars: wars }));
                
                var payloadStr = pacts.join(",") + "|" + wars.join(",");
                var hash = 0;
                for (var i = 0; i < payloadStr.length; i++) {
                    var char = payloadStr.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }
                var hashStr = hash.toString();

                var cacheKey = "HM_DiplomacyHash";
                var lastHash = typeof HMStorage !== "undefined" ? HMStorage.load(cacheKey, "") : localStorage.getItem(cacheKey);
                var lastSyncStr = typeof HMStorage !== "undefined" ? HMStorage.load(cacheKey + "_Time", "0") : localStorage.getItem(cacheKey + "_Time");
                var lastSync = parseInt(lastSyncStr || "0", 10);
                
                if (hashStr === lastHash && Date.now() - lastSync < 3600000) {
                    HMLogger.debug("[Diplomacy] Data has not changed since last hour, skipping network sync.");
                    return;
                }

                HMLogger.info("[Diplomacy] Diplomacy data updated. Syncing to network...");
                
                if (typeof HMStorage !== "undefined") {
                    HMStorage.save(cacheKey, hashStr);
                    HMStorage.save(cacheKey + "_Time", Date.now().toString());
                } else {
                    localStorage.setItem(cacheKey, hashStr);
                    localStorage.setItem(cacheKey + "_Time", Date.now().toString());
                }

                this.submitDiplomacyData(pacts, wars);
            }

        } catch (err) {
            HMLogger.error("[Diplomacy] Error parsing HTML: " + err.message);
        }
    },

    submitDiplomacyData: function (pacts, wars) {
        if (typeof NetworkManager === "undefined" || !NetworkManager.isConnected) {
            // Queue and retry if auth hasn't landed yet
            var self = this;
            setTimeout(function() {
                HMLogger.info("[Diplomacy] Retrying submission...");
                self.submitDiplomacyData(pacts, wars);
            }, 2000);
            return;
        }

        try {
            NetworkManager.submitDiplomacy({ pacts: pacts, wars: wars })
                .then(function(success) {
                    if (success) {
                        HMLogger.info("[Diplomacy] Successfully synced diplomacy status!");
                        if (typeof UI !== "undefined" && UI.toast) {
                            UI.toast("Diplomacy status synced!");
                        }
                    }
                });
        } catch (e) {
            HMLogger.error("[Diplomacy] Exception during submit API call: " + e.message);
        }
    }
};
