/**
 * PlayerRankingsParser
 * Scrapes individual player rankings from classement2.php
 * Extracts: Rank, Name, Alliance, Field, Anthill, Tech, Fight
 * Pipes data to HF Tracker and Enemy Intel batch processor
 */
var PlayerRankingsParser = {
    _observer: null,
    _debounceTimer: null,

    init: function () {
        HMLogger.info("[Player Rankings] Initializing scraper...");
        this.parseRankings();
        this.watchForPagination();
    },

    /**
     * Watches for XAJAX table swaps triggered by pagination clicks.
     * The game replaces the table content in-place without a full reload.
     */
    watchForPagination: function () {
        var self = this;

        // Find the container that XAJAX replaces (typically #centre or the table's parent)
        var container = document.getElementById("centre") ||
                        document.getElementById("contenu") ||
                        document.querySelector(".tab_triable")?.parentNode;
        
        if (!container) {
            HMLogger.debug("[Player Rankings] No container found for pagination observer");
            return;
        }

        if (this._observer) {
            this._observer.disconnect();
        }

        this._observer = new MutationObserver(function (mutations) {
            // Check if the mutations actually affect ranking rows
            var isRelevant = mutations.some(function (m) {
                return m.addedNodes.length > 0 || m.removedNodes.length > 0;
            });

            if (isRelevant) {
                // Debounce: XAJAX often fires multiple mutations in rapid succession
                clearTimeout(self._debounceTimer);
                self._debounceTimer = setTimeout(function () {
                    // Verify there's actually a ranking table present
                    if (document.querySelector(".tab_triable")) {
                        HMLogger.info("[Player Rankings] Pagination detected — re-scraping...");
                        self.parseRankings();
                    }
                }, 500);
            }
        });

        this._observer.observe(container, { childList: true, subtree: true });
        HMLogger.debug("[Player Rankings] Pagination observer installed on container");
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

        var headerRow = null;
        var colIndices = { alliance: -1, name: 1, hf: 2, anthill: 3, tech: 4, fight: 5 }; // Defaults for classement2.php

        // Find the true header row
        for (var r of rows) {
            var text = r.textContent.toLowerCase();
            if ((text.includes("pseudo") || text.includes("joueur") || text.includes("name")) && 
                (text.includes("chasse") || text.includes("field") || text.includes("terrain"))) {
                headerRow = r;
                break;
            }
        }

        if (headerRow) {
            var headers = headerRow.querySelectorAll("td, th");
            let logicalIndex = 0;
            headers.forEach((th) => {
                var txt = th.textContent.toLowerCase().trim();
                if (txt.includes("alliance")) colIndices.alliance = logicalIndex;
                if (txt.includes("pseudo") || txt.includes("joueur") || txt.includes("nom") || txt.includes("name")) colIndices.name = logicalIndex;
                if (txt.includes("chasse") || txt.includes("field") || txt.includes("hunting") || txt.includes("terrain")) colIndices.hf = logicalIndex;
                if (txt.includes("techno") || txt.includes("technology")) colIndices.tech = logicalIndex;
                if (txt.includes("fourmili") || txt.includes("anthill")) colIndices.anthill = logicalIndex;
                if (txt.includes("combat") || txt.includes("fight")) colIndices.fight = logicalIndex;
                
                var colspan = parseInt(th.getAttribute("colspan") || "1", 10);
                logicalIndex += colspan;
            });
        }

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            
            // Skip header and formatting rows
            if (row.querySelector("th") || row.cells.length < 3) continue;

            var cells = row.querySelectorAll("td");
            if (cells.length >= 5) {
                try {
                    // Name Extraction
                    var nameCell = cells[colIndices.name] || cells[1];
                    var name = "";
                    var alliance = "";
                    
                    var playerLink = nameCell.querySelector("a[href*='Membre.php'], a[href*='membre.php']");

                    if (playerLink) {
                        name = playerLink.textContent.trim();
                    } else if (nameCell.querySelector("a")) {
                        name = nameCell.querySelector("a").textContent.trim();
                    } else {
                        name = nameCell.textContent.trim().split(" ")[0];
                    }

                    // Alliance Extraction
                    if (colIndices.alliance >= 0 && cells[colIndices.alliance]) {
                        // Alliance is in its own column (e.g. Search Page)
                        var allianceCell = cells[colIndices.alliance];
                        alliance = allianceCell.textContent.trim().replace(/[\[\]()]/g, "").trim();
                    } else {
                        // Alliance is inside the Name column (e.g. Global Leaderboard)
                        var allianceLink = nameCell.querySelector("a[href*='Alliance.php'], a[href*='alliance.php'], a[href*='classementAlliance.php']");
                        if (allianceLink) {
                            alliance = allianceLink.textContent.trim().replace(/[\[\]()]/g, "").trim();
                        } else {
                            var links = nameCell.querySelectorAll("a");
                            if (links.length >= 2) {
                                alliance = links[1].textContent.trim().replace(/[\[\]()]/g, "").trim();
                            } else {
                                var bracketMatch = nameCell.textContent.match(/\[([^\]]+)\]|\(([^)]+)\)/);
                                if (bracketMatch) alliance = (bracketMatch[1] || bracketMatch[2]).trim();
                            }
                        }
                    }

                    // Stats Extraction using dynamic column indices
                    var field = colIndices.hf >= 0 && cells[colIndices.hf] ? this.parseNum(cells[colIndices.hf].textContent) : 0;
                    var anthill = colIndices.anthill >= 0 && cells[colIndices.anthill] ? this.parseNum(cells[colIndices.anthill].textContent) : 0;
                    var tech = colIndices.tech >= 0 && cells[colIndices.tech] ? this.parseNum(cells[colIndices.tech].textContent) : 0;
                    var fight = colIndices.fight >= 0 && cells[colIndices.fight] ? this.parseNum(cells[colIndices.fight].textContent) : 0;

                    if (name) {
                        var isSearchPage = document.querySelector("input[name='recherche']") !== null;

                        var playerObj = {
                            name: name,
                            hf: field,
                            anthill: anthill,
                            tech: tech,
                            fight: fight
                        };
                        
                        // If it's a search page and the alliance is empty, omit it to prevent the worker from wiping it.
                        // If it's NOT a search page (e.g. global leaderboard) and alliance is empty, submit "" so the worker clears it.
                        if (alliance || !isSearchPage) {
                            playerObj.alliance = alliance;
                        }
                        
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
