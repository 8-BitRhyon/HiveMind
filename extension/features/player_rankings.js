/**
 * PlayerRankingsParser
 * Scrapes individual player rankings from classement2.php
 * Extracts: Rank, Name, Alliance, Field, Anthill, Tech, Fight
 * Pipes data to HF Tracker and Enemy Intel batch processor
 */
var PlayerRankingsParser = {
    init: function () {
        HMLogger.info("[Player Rankings] Initializing scraper...");
        this.parseRankings();
    },

    parseRankings: function () {
        var players = [];
        var hfData = [];

        var table = document.querySelector(".tab_triable");
        if (!table) {
            HMLogger.warn("[Player Rankings] No .tab_triable table found");
            return;
        }

        var rows = table.querySelectorAll("tbody tr");
        if (!rows || rows.length === 0) {
            HMLogger.warn("[Player Rankings] No data rows found");
            return;
        }

        HMLogger.info("[Player Rankings] Found table with " + rows.length + " total rows.");
        var parsedCount = 0;

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            
            // Skip header row
            if (row.querySelector("th")) continue;

            var cells = row.querySelectorAll("td");
            // Expecting >= 6 columns: Position, Joueur (+ Alliance), Terrain, Fourmiliere, Technologie, Combats
            if (cells.length >= 6) {
                try {
                    // Name & Alliance Extraction (typically in cell 1 after Rank in cell 0)
                    var nameCell = cells[1];
                    var name = "";
                    var alliance = "";
                    
                    var links = nameCell.querySelectorAll("a");
                    if (links.length >= 2) {
                        name = links[0].textContent.trim();
                        alliance = links[1].textContent.trim().replace(/[\[\]()]/g, "").trim();
                    } else if (links.length === 1) {
                        name = links[0].textContent.trim();
                    } else {
                        name = nameCell.textContent.trim().split(" ")[0];
                    }

                    // Stats Extraction
                    var field = this.parseNum(cells[2].textContent);
                    var anthill = this.parseNum(cells[3].textContent);
                    var tech = this.parseNum(cells[4].textContent);
                    var fight = this.parseNum(cells[5].textContent);

                    if (name) {
                        // Building the payload for Enemy Intel Bulk Upload
                        var playerObj = {
                            name: name,
                            alliance: alliance,
                            hf: field,
                            anthill: anthill,
                            tech: tech,
                            fight: fight
                        };
                        players.push(playerObj);

                        // Building the payload for HF Tracker Bulk Update
                        if (field > 0) {
                            hfData.push({
                                name: name,
                                hf: field
                            });
                        }
                        parsedCount++;
                    } else {
                        HMLogger.warn("[Player Rankings] Invalid row data: Name missing");
                    }

                } catch (err) {
                    HMLogger.warn("[Player Rankings] Failed to parse row: " + err.message);
                }
            } else {
                if (i !== 0 && cells.length > 0) {
                    HMLogger.warn("[Player Rankings] Skipped row " + i + " - only has " + cells.length + " cells");
                }
            }
        }

        HMLogger.info("[Player Rankings] Extracted " + parsedCount + " valid players from " + rows.length + " rows.");

        if (players.length > 0) {
            // Generate a hash of the current payload
            var payloadStr = players.map(p => p.name + ":" + p.hf + ":" + p.anthill + ":" + p.tech + ":" + p.fight).join("|");
            var hash = 0;
            for (var j = 0; j < payloadStr.length; j++) {
                var char = payloadStr.charCodeAt(j);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            var hashStr = hash.toString();

            // Check cache
            var cacheKey = "HM_GlobalRankHash_" + window.location.search;
            var lastHash = typeof HMStorage !== "undefined" ? HMStorage.load(cacheKey, "") : localStorage.getItem(cacheKey);
            var lastSyncStr = typeof HMStorage !== "undefined" ? HMStorage.load(cacheKey + "_Time", "0") : localStorage.getItem(cacheKey + "_Time");
            var lastSync = parseInt(lastSyncStr || "0", 10);
            
            if (hashStr === lastHash && Date.now() - lastSync < 3600000) {
                HMLogger.debug("[Player Rankings] Data has not changed since last hour, skipping network sync.");
                return;
            }

            HMLogger.info(`[Player Rankings] Parsed ${players.length} players. Syncing new data...`);
            
            // Save to Cache
            if (typeof HMStorage !== "undefined") {
                HMStorage.save(cacheKey, hashStr);
                HMStorage.save(cacheKey + "_Time", Date.now().toString());
            } else {
                localStorage.setItem(cacheKey, hashStr);
                localStorage.setItem(cacheKey + "_Time", Date.now().toString());
            }

            this.submitBatchIntel(players);
        }
    },

    submitBatchIntel: function (players) {
        HMLogger.info("[Player Rankings] submitBatchIntel called. isConnected=" + (typeof NetworkManager !== "undefined" ? NetworkManager.isConnected : "undefined"));
        
        // Primary path: use authenticated NetworkManager
        if (typeof NetworkManager !== "undefined" && NetworkManager.isConnected) {
            HMLogger.info("[Player Rankings] Submitting via NetworkManager...");
            try {
                var promise = NetworkManager.submitBatchIntel(players);
                if (promise && promise.then) {
                    promise.then(function(success) {
                        if (success) {
                            HMLogger.info("[Player Rankings] Successfully synced player intel data!");
                            if (typeof HMToast !== "undefined") HMToast.success("Player rankings harvested!");
                        }
                    }).catch(function(err) {
                        HMLogger.error("[Player Rankings] Batch API error: " + err.message);
                    });
                }
            } catch (e) {
                HMLogger.error("[Player Rankings] Exception: " + e.message);
            }
            return;
        }

        // Since OWASP hardening, unauthenticated submissions are no longer allowed.
        HMLogger.warn("[Player Rankings] Cannot submit: NetworkManager not connected.");
        if (typeof HMToast !== "undefined") {
            HMToast.error("Please connect your Personal Access Token in the settings to harvest rankings.");
        }
    },

    parseNum: function (str) {
        if (!str) return 0;
        return parseInt(str.replace(/[\s,.']/g, ""), 10) || 0;
    }
};
