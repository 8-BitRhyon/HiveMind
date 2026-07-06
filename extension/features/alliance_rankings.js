// ====================================================================================================
// HiveMind - Alliance Rankings Parser
// ====================================================================================================
// Parses the Alliance Rankings page (classement2.php?type_classement=alliance_total)
// Extracts Name, Field, Anthill, Tech, Fight, and Members and sends to Worker
// ====================================================================================================

var AllianceRankingsParser = {
    _observer: null,
    _debounceTimer: null,

    init: function () {
        HMLogger.info("[Alliance Rankings] Initializing parser");
        this.parseRankings();
        this.watchForPagination();
    },

    /**
     * Watches for XAJAX table swaps triggered by pagination clicks.
     */
    watchForPagination: function () {
        var self = this;
        var container = document.getElementById("centre") ||
                        document.getElementById("contenu") ||
                        document.querySelector(".tab_triable")?.parentNode;

        if (!container) return;
        if (this._observer) this._observer.disconnect();

        this._observer = new MutationObserver(function (mutations) {
            var isRelevant = mutations.some(function (m) {
                return m.addedNodes.length > 0 || m.removedNodes.length > 0;
            });
            if (isRelevant) {
                clearTimeout(self._debounceTimer);
                self._debounceTimer = setTimeout(function () {
                    if (document.querySelector(".tab_triable")) {
                        HMLogger.info("[Alliance Rankings] Pagination detected — re-scraping...");
                        self.parseRankings();
                    }
                }, 500);
            }
        });

        this._observer.observe(container, { childList: true, subtree: true });
        HMLogger.debug("[Alliance Rankings] Pagination observer installed");
    },

    parseRankings: function () {
        // Must be the total points ranking
        var typeSelect = document.getElementById("type_classement");
        if (!typeSelect || typeSelect.value !== "alliance_total") {
            HMLogger.info("[Alliance Rankings] Not on the total rankings view. Aborting.");
            return;
        }

        var table = document.querySelector(".tab_triable");
        if (!table) {
            HMLogger.error("[Alliance Rankings] Could not find .tab_triable table");
            return;
        }

        var rows = table.querySelectorAll("tbody tr");
        var alliances = [];

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            
            // Skip header row
            if (row.querySelector("th")) continue;

            var cells = row.querySelectorAll("td");
            // Expecting 7 columns: Grade, Alliance, Field, Anthill, Technology, Fight, Members
            if (cells.length < 7) continue;

            try {
                var rankStr = cells[0].textContent.trim();
                var nameStr = cells[1].textContent.trim();
                var fieldStr = cells[2].textContent.trim();
                var anthillStr = cells[3].textContent.trim();
                var techStr = cells[4].textContent.trim();
                var fightStr = cells[5].textContent.trim();
                var membersStr = cells[6].textContent.trim();

                var rank = this.parseNum(rankStr);
                var field = this.parseNum(fieldStr);
                var anthill = this.parseNum(anthillStr);
                var tech = this.parseNum(techStr);
                var fight = this.parseNum(fightStr);
                var members = this.parseNum(membersStr);

                // Only grab named alliances
                if (nameStr && rank > 0) {
                    alliances.push({
                        rank: rank,
                        name: nameStr,
                        hf: field,
                        anthill: anthill,
                        tech: tech,
                        fight: fight,
                        members: members
                    });
                }
            } catch (err) {
                HMLogger.error("[Alliance Rankings] Error parsing row index " + i + ": " + err.message);
            }
        }

        if (alliances.length > 0) {
            // Apply payload hashing
            var payloadStr = alliances.map(a => a.rank + ":" + a.name + ":" + a.hf + ":" + a.anthill + ":" + a.tech + ":" + a.fight + ":" + a.members).join("|");
            var hash = 0;
            for (var j = 0; j < payloadStr.length; j++) {
                var char = payloadStr.charCodeAt(j);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            var hashStr = hash.toString();

            var cacheKey = "HM_AllianceRanksHash";
            var lastHash = typeof HMStorage !== "undefined" ? HMStorage.load(cacheKey, "") : localStorage.getItem(cacheKey);
            var lastSyncStr = typeof HMStorage !== "undefined" ? HMStorage.load(cacheKey + "_Time", "0") : localStorage.getItem(cacheKey + "_Time");
            var lastSync = parseInt(lastSyncStr || "0", 10);
            
            if (hashStr === lastHash && Date.now() - lastSync < 3600000) {
                HMLogger.debug("[Alliance Rankings] Data has not changed since last hour, skipping network sync.");
                return;
            }

            HMLogger.info(`[Alliance Rankings] Parsed ${alliances.length} alliances. Syncing new data...`);
            
            if (typeof HMStorage !== "undefined") {
                HMStorage.save(cacheKey, hashStr);
                HMStorage.save(cacheKey + "_Time", Date.now().toString());
            } else {
                localStorage.setItem(cacheKey, hashStr);
                localStorage.setItem(cacheKey + "_Time", Date.now().toString());
            }

            this.submitRankings(alliances);
        } else {
            HMLogger.debug("[Alliance Rankings] No alliance data found in table.");
        }
    },

    submitRankings: function (alliances) {
        if (typeof NetworkManager === "undefined" || !NetworkManager.isConnected) {
            // Queue and retry if auth hasn't landed yet
            var self = this;
            setTimeout(function() {
                HMLogger.info("[Alliance Rankings] Retrying submission...");
                self.submitRankings(alliances);
            }, 2000);
            return;
        }

        try {
            NetworkManager.submitAllianceRankings(alliances)
                .then(function(success) {
                    if (success) {
                        HMLogger.info("[Alliance Rankings] Successfully synced rankings!");
                        if (typeof UI !== "undefined" && UI.toast) {
                            UI.toast("Alliance rankings updated!");
                        }
                    }
                });
        } catch (e) {
            HMLogger.error("[Alliance Rankings] Exception during submit API call: " + e.message);
        }
    },

    parseNum: function (str) {
        if (!str) return 0;
        return parseInt(str.replace(/[\s,.']/g, ""), 10) || 0;
    }
};
