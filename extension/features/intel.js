/**
 * IntelOverlay — Profile page enemy strength display
 * 
 * When a user visits Membre.php (a player's profile), this module:
 * 1. Extracts the player name from the page
 * 2. Queries the Worker for aggregated troop intel
 * 3. Injects a panel showing known troop levels (or ? for unknown)
 * 
 * Data is aggregated from all combat reports submitted by TQC members.
 */

var IntelOverlay = {

    // Official TQC Abbreviations and Names
    UNIT_SHORT: ["YD", "D", "TD", "YS", "S", "DK", "TDK", "FA", "TFA", "TS", "T", "TT", "K", "TK"],
    UNIT_NAMES: [
        "Young Dwarves", "Dwarves", "Top Dwarves",
        "Young Soldiers", "Soldiers", "Doorkeepers", "Top Doorkeepers",
        "Fire Ants", "Top Fire Ants", "Top Soldiers",
        "Tanks", "Top Tanks", "Killers", "Top Killers"
    ],

    init: function() {
        var path = window.location.pathname.toLowerCase();
        if (!path.includes("membre.php")) return;

        HMLogger.info("[Intel] Profile page detected");
        this.loadPlayerIntel();
    },

    loadPlayerIntel: function() {
        // Extract player name from the profile page
        var playerName = this.extractPlayerName();
        if (!playerName) {
            HMLogger.debug("[Intel] Could not extract player name from profile page");
            return;
        }

        HMLogger.info("[Intel] Looking up intel for: " + playerName);

        if (typeof NetworkManager === "undefined" || !NetworkManager.isConnected) {
            HMLogger.debug("[Intel] NetworkManager not connected, skipping intel lookup");
            return;
        }

        var self = this;

        // 1. Silent Coordinate Harvester (One-Time Scrape)
        this.harvestCoordinates(playerName);

        // 2. Fetch Combat Intel
        NetworkManager.getPlayerIntel(playerName).then(function(intel) {
            if (intel) {
                self.injectPanel(playerName, intel);
            }
        });
    },

    extractPlayerName: function() {
        // Try multiple methods to find the player name on the profile page
        // 0. Use the query param if available (Pseudo=...)
        var urlParams = new URLSearchParams(window.location.search);
        var pseudo = urlParams.get('Pseudo') || urlParams.get('pseudo');
        if (pseudo) {
            HMLogger.debug("[Intel] Extracted name from URL: " + pseudo);
            return pseudo;
        }

        var centre = document.getElementById("centre") || document.querySelector(".boite_centre") || document.body;
        if (!centre) return null;

        var text = centre.textContent || "";

        // Method 1: Look for "Profil de : PlayerName" (French) or "Profile of : PlayerName"
        var match = text.match(/(?:profil de|profile of)\s*:?\s*([^\n\r]+)/i);
        if (match) {
            var name = match[1].trim();
            // Clean up trailing punctuation or tabs
            name = name.split(/[\t\n\r]/)[0].trim();
            if (name.length > 0 && name.length < 50) return name;
        }

        // Method 2: Look for player name in headings
        var headings = centre.querySelectorAll("h1, h2, h3, .titre_boite");
        for (var i = 0; i < headings.length; i++) {
            var heading = headings[i].textContent.trim();
            // Profile headers are usually "Profil de : XYZ" or just "XYZ"
            if (heading.toLowerCase().includes("profil de")) {
                var hMatch = heading.match(/(?:profil de|profile of)\s*:?\s*([^\n\r]+)/i);
                if (hMatch) return hMatch[1].trim();
            }
            if (heading.length > 2 && heading.length < 40 && !heading.includes("(") && !heading.match(/[0-9]/)) {
                return heading;
            }
        }

        // Method 3: Look for bolded name near top in the info table
        var bolds = centre.querySelectorAll("b, strong, .nom_joueur");
        for (var j = 0; j < bolds.length; j++) {
            var boldText = bolds[j].textContent.trim();
            if (boldText.length > 2 && boldText.length < 30 && !boldText.match(/[0-9]/)) {
                // Heuristic: first bold text that looks like a name
                if (!boldText.includes(":") && !boldText.includes("Level")) return boldText;
            }
        }

        return null;
    },

    harvestCoordinates: function(playerName) {
        // Search globally in the document for the coordinate link
        var links = document.querySelectorAll("a[href*='carte2.php']");
        HMLogger.debug("[Intel] Found " + links.length + " possible coordinate links");
        
        for (var i = 0; i < links.length; i++) {
            var href = links[i].getAttribute("href");
            // Match x=123 and y=456
            var match = href.match(/[xy]=(-?\d+).*?[xy]=(-?\d+)/i);
            if (match) {
                var x = parseInt(match[1], 10);
                var y = parseInt(match[2], 10);
                
                // If y is first in some weird URL, swap them
                if (href.indexOf('y=') < href.indexOf('x=')) {
                    var temp = x; x = y; y = temp;
                }

                HMLogger.info("[Intel] Harvested coordinates for " + playerName + ": " + x + ", " + y);
                
                // Always save locally (even without login) for ServerMap
                try {
                    var localCoords = JSON.parse(localStorage.getItem('HM_ServerMap_Harvested') || '[]');
                    var existingIdx = -1;
                    for (var li = 0; li < localCoords.length; li++) {
                        if (localCoords[li].name && localCoords[li].name.toLowerCase() === playerName.toLowerCase()) {
                            existingIdx = li;
                            break;
                        }
                    }
                    var coordEntry = { name: playerName, x: x, y: y, alliance: "None", ts: Date.now() };
                    if (existingIdx >= 0) localCoords[existingIdx] = coordEntry;
                    else localCoords.push(coordEntry);
                    localStorage.setItem('HM_ServerMap_Harvested', JSON.stringify(localCoords));
                    HMLogger.debug("[Intel] Coordinate saved to local cache");
                } catch(localErr) {
                    HMLogger.error("[Intel] Failed to save coord locally: " + localErr.message);
                }

                // Dedup: hash the coord payload and skip if unchanged within 1hr
                var coordPayload = playerName.toLowerCase() + ":" + x + ":" + y;
                var hash = 0;
                for (var ci = 0; ci < coordPayload.length; ci++) {
                    hash = ((hash << 5) - hash) + coordPayload.charCodeAt(ci);
                    hash = hash & hash;
                }
                var hashStr = hash.toString();

                var cacheKey = "HM_CoordHash_" + playerName.toLowerCase();
                var lastHash = typeof HMStorage !== "undefined" ? HMStorage.load(cacheKey, "") : localStorage.getItem(cacheKey);
                var lastSync = parseInt((typeof HMStorage !== "undefined" ? HMStorage.load(cacheKey + "_ts", "0") : localStorage.getItem(cacheKey + "_ts")) || "0");

                if (hashStr === lastHash && Date.now() - lastSync < 3600000) {
                    HMLogger.info("[Intel] Coordinates unchanged for " + playerName + ", skipping API call (1hr cooldown).");
                    break;
                }

                // Submit to Worker via NetworkManager
                if (typeof NetworkManager !== "undefined" && NetworkManager.submitCoords) {
                    NetworkManager.submitCoords([{ name: playerName, x: x, y: y }]);
                    if (typeof HMStorage !== "undefined") {
                        HMStorage.save(cacheKey, hashStr);
                        HMStorage.save(cacheKey + "_ts", String(Date.now()));
                    } else {
                        localStorage.setItem(cacheKey, hashStr);
                        localStorage.setItem(cacheKey + "_ts", String(Date.now()));
                    }
                }
                break;
            }
        }
    },

    injectPanel: function(playerName, intel) {
        var panel = document.createElement("div");
        panel.id = "HM_IntelPanel";
        panel.style.cssText =
            "background:var(--hm-bg, #a8a8a6); border:3px solid var(--hm-border, #000);" +
            "padding:0; margin:15px 0; font-family:var(--font-mono, monospace); font-size:12px;" +
            "color:var(--hm-text, #000); max-width:600px;";

        // Header
        var header = document.createElement("div");
        header.style.cssText =
            "background:var(--hm-text, #000); color:var(--hm-bg, #fff);" +
            "padding:12px 16px; font-family:var(--font-display, sans-serif);" +
            "font-size:1.2rem; font-weight:900; text-transform:uppercase; letter-spacing:1px;" +
            "display:flex; justify-content:space-between; align-items:center;";
        
        var statusBadge = intel.known 
            ? "<span style='font-size:0.7rem; font-weight:400; color:#4a8c5c;'>INTEL AVAILABLE</span>"
            : "<span style='font-size:0.7rem; font-weight:400; color:#b5832a;'>NO INTEL</span>";
        header.innerHTML = "Enemy Intel: " + this.escapeHtml(playerName) + " " + statusBadge;
        panel.appendChild(header);

        // Body
        var body = document.createElement("div");
        body.style.cssText = "padding:16px;";

        if (!intel.known || intel.reports === 0) {
            body.innerHTML = "<div style='text-align:center; padding:20px; color:var(--hm-muted, #666);'>" +
                "<p style='margin:0; font-style:italic;'>No combat data available for this player.</p>" +
                "<p style='margin:8px 0 0 0; font-size:11px;'>Intel is collected when TQC members view battle reports involving this player.</p>" +
                "</div>";
        } else {
            // Tech Levels Summary (ManyFeathers' method)
            if (intel.tech && (intel.tech.weapons !== null || intel.tech.shield !== null || intel.tech.nest !== null)) {
                var techHTML = "<div style='margin-bottom:14px; padding:12px; background:var(--hm-bg, #999); border:2px solid var(--hm-border);'>" +
                    "<span style='color:var(--hm-muted); font-size:10px; text-transform:uppercase; letter-spacing:1px;'>TECH LEVELS (reverse-engineered)</span>" +
                    "<div style='display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-top:8px;'>";

                var techItems = [
                    { label: "Weapons", val: intel.tech.weapons },
                    { label: "Shield", val: intel.tech.shield },
                    { label: "Anthill", val: intel.tech.anthill },
                    { label: "Nest", val: intel.tech.nest }
                ];

                for (var t = 0; t < techItems.length; t++) {
                    var item = techItems[t];
                    var valDisplay = item.val !== null && item.val !== undefined ? "<b>" + item.val + "</b>" : "<span style='color:var(--hm-muted);'>?</span>";
                    techHTML += "<div style='text-align:center;'>" +
                        "<div style='font-size:10px; color:var(--hm-muted); text-transform:uppercase;'>" + item.label + "</div>" +
                        "<div style='font-size:1.3rem; font-weight:900; margin-top:2px;'>" + valDisplay + "</div></div>";
                }

                techHTML += "</div>";
                if (intel.tech.confidence) {
                    techHTML += "<div style='margin-top:6px; font-size:10px; color:var(--hm-muted); text-align:right;'>" +
                        "Confidence: " + intel.tech.confidence + "</div>";
                }
                techHTML += "</div>";
                body.innerHTML += techHTML;
            }

            // Build troop table
            body.innerHTML += this.buildTroopTable(intel);

            // Metadata
            body.innerHTML += "<div style='margin-top:12px; padding:8px; border:1px dashed var(--hm-border); font-size:11px;'>" +
                "<span style='color:var(--hm-muted); text-transform:uppercase; font-size:10px;'>Intelligence Summary</span><br>" +
                "Based on <b>" + (intel.reportsCount || 0) + " combat report" + (intel.reportsCount === 1 ? "" : "s") + "</b>" +
                (intel.lastSeen ? " &middot; Last seen: <b>" + this.timeAgo(intel.lastSeen) + "</b>" : "") +
                "</div>";
        }

        panel.appendChild(body);

        // Insert into page
        var container = document.getElementById("centre") || document.querySelector(".boite_centre") || document.body;
        if (container) {
            container.insertBefore(panel, container.firstChild);
        }
    },

    buildTroopTable: function(intel) {
        var html = "<table style='width:100%; border-collapse:collapse; font-size:11px;'>";
        html += "<tr style='border-bottom:2px solid var(--hm-border);'>" +
            "<th style='text-align:left; padding:4px; font-size:10px; text-transform:uppercase;'>Unit</th>" +
            "<th style='text-align:right; padding:4px; font-size:10px;'>Known Strength</th>" +
            "<th style='text-align:left; padding:4px; font-size:10px;'>Confidence</th></tr>";

        var hasAny = false;
        for (var i = 0; i < this.UNIT_SHORT.length; i++) {
            var count = intel.troops[String(i)];
            var display = "?";
            var confidence = "Unknown";
            var confColor = "var(--hm-muted, #888)";

            if (count !== undefined && count !== null) {
                display = this.formatNum(count);
                confidence = count > 0 ? "Observed" : "None seen";
                confColor = count > 0 ? "var(--hm-success, #2d5a27)" : "var(--hm-muted)";
                hasAny = true;
            }

            // Only show rows where we have data, or high-tier units that are strategically important
            if (count !== undefined || i >= 10) { // Always show Tank, TankE, Killer, KillerE
                html += "<tr style='border-bottom:1px dotted var(--hm-border);'>" +
                    "<td style='padding:4px;'><b>" + this.UNIT_SHORT[i] + "</b> <span style='color:var(--hm-muted); font-size:10px;'>" + this.UNIT_NAMES[i] + "</span></td>" +
                    "<td style='text-align:right; padding:4px; font-weight:700;" + (count > 0 ? " color:var(--hm-error, #8b2020);" : "") + "'>" + display + "</td>" +
                    "<td style='padding:4px; color:" + confColor + "; font-size:10px;'>" + confidence + "</td></tr>";
            }
        }

        if (!hasAny) {
            html += "<tr><td colspan='3' style='text-align:center; padding:12px; color:var(--hm-muted); font-style:italic;'>" +
                "No troop data observed yet</td></tr>";
        }

        html += "</table>";
        return html;
    },

    formatNum: function(n) {
        if (typeof n !== "number" || isNaN(n)) return "?";
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    },

    timeAgo: function(ts) {
        if (!ts) return "unknown";
        var diff = Date.now() - ts;
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return mins + "m ago";
        var hours = Math.floor(mins / 60);
        if (hours < 24) return hours + "h ago";
        var days = Math.floor(hours / 24);
        return days + "d ago";
    },

    escapeHtml: function(text) {
        if (!text) return "";
        var div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
};
