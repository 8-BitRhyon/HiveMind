/**
 * RankingScraper - Scrapes HF data from ranking/alliance pages
 * 
 * Pages:
 *   classement2.php          — Player rankings (Field column)
 *   classementAlliance.php   — Specific alliance member list (Field column)
 * 
 * Scrapes on page load, submits to Worker via NetworkManager.submitHFData()
 */

var RankingScraper = {

    init: function() {
        var path = window.location.pathname.toLowerCase();
        
        // Only scrape the global Player Rankings
        // Alliance pages are handled by QueueManager in queue.js
        if (path.includes("classement2.php")) {
            HMLogger.info("[RankingScraper] Global Ranking page detected, scraping HF data...");
            this.scrapeRankingTable();
        }
    },

    scrapeRankingTable: function() {
        // Find the main ranking table
        var tables = document.querySelectorAll("table");
        var rankTable = null;

        for (var i = 0; i < tables.length; i++) {
            var text = tables[i].textContent.toLowerCase();
            if (text.includes("field") || text.includes("chasse")) {
                rankTable = tables[i];
                break;
            }
        }

        if (!rankTable) {
            HMLogger.debug("[RankingScraper] No ranking table with Field column found");
            return;
        }

        // Detect Field column index from header
        var headerRow = rankTable.querySelector("tr");
        if (!headerRow) return;

        var headers = headerRow.querySelectorAll("td, th");
        var fieldColIdx = -1;
        var nameColIdx = -1;

        for (var h = 0; h < headers.length; h++) {
            var txt = headers[h].textContent.toLowerCase().trim();
            if (txt.includes("field") || txt.includes("chasse")) fieldColIdx = h;
            if (txt.includes("name") || txt.includes("nom") || txt.includes("pseudo") || txt.includes("alliance")) {
                // For alliance ranking, the "Alliance" column will contain alliance name,
                // but we also need the player/alliance name
                if (nameColIdx === -1) nameColIdx = h;
            }
        }

        if (fieldColIdx === -1) {
            HMLogger.debug("[RankingScraper] Could not find Field column");
            return;
        }

        // Parse rows
        var rows = rankTable.querySelectorAll("tr");
        var players = [];
        var isAllianceRanking = window.location.href.toLowerCase().includes("alliance_total") ||
                               window.location.href.toLowerCase().includes("classementalliance");

        for (var r = 1; r < rows.length; r++) {
            var cells = rows[r].querySelectorAll("td");
            if (cells.length <= fieldColIdx) continue;

            // Extract name — look for profile link first
            var nameLink = rows[r].querySelector("a[href*='Membre.php'], a[href*='membre.php']");
            var allianceLink = rows[r].querySelector("a[href*='classementAlliance.php']");
            
            var name = "";
            if (nameLink) {
                name = nameLink.textContent.trim();
            } else if (!isAllianceRanking && nameColIdx >= 0 && cells[nameColIdx]) {
                name = cells[nameColIdx].textContent.trim();
            }

            // For alliance rankings, skip — we want player-level data
            if (!name && isAllianceRanking && !nameLink) continue;
            if (!name) continue;

            // Clean parenthetical alliance tag from name like "germinal (-LM-)"
            name = name.replace(/\s*\([^)]*\)\s*$/, "").trim();

            // Extract HF
            var hfText = cells[fieldColIdx].textContent.replace(/\s/g, "").replace(/[^0-9]/g, "");
            var hf = parseInt(hfText, 10) || 0;

            if (hf > 0) {
                players.push({ name: name, hf: hf });
            }
        }

        if (players.length === 0) {
            HMLogger.debug("[RankingScraper] No player HF data found on this page");
            return;
        }

        // Generate a hash of the current payload
        var payloadStr = players.map(p => p.name + ":" + p.hf).join("|");
        var hash = 0;
        for (var i = 0; i < payloadStr.length; i++) {
            var char = payloadStr.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        var hashStr = hash.toString();

        // Check cache
        var cacheKey = "HM_RankHash_" + window.location.search;
        var lastHash = typeof HMStorage !== "undefined" ? HMStorage.load(cacheKey, "") : localStorage.getItem(cacheKey);
        var lastSyncStr = typeof HMStorage !== "undefined" ? HMStorage.load(cacheKey + "_Time", "0") : localStorage.getItem(cacheKey + "_Time");
        var lastSync = parseInt(lastSyncStr || "0", 10);
        
        if (hashStr === lastHash && Date.now() - lastSync < 3600000) {
            HMLogger.debug("[RankingScraper] Data has not changed since last hour, skipping network sync.");
            return;
        }

        HMLogger.info(`[RankingScraper] Scraped ${players.length} players from ranking page. Syncing new data...`);

        // Submit to Worker
        if (typeof NetworkManager !== "undefined" && NetworkManager.isConnected) {
            var source = window.location.href.includes("classementAlliance") ? "alliance_ranking" : "player_ranking";
            NetworkManager.submitHFData(players, source);
            
            // Save to Cache
            if (typeof HMStorage !== "undefined") {
                HMStorage.save(cacheKey, hashStr);
                HMStorage.save(cacheKey + "_Time", Date.now().toString());
            } else {
                localStorage.setItem(cacheKey, hashStr);
                localStorage.setItem(cacheKey + "_Time", Date.now().toString());
            }
        } else {
            HMLogger.debug("[RankingScraper] NetworkManager not connected, HF data not submitted");
        }
    }
};
