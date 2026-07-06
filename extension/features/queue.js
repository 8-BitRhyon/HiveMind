// ====================================================================================================
// QueueManager: Multi-Target Flood Queue System
// ====================================================================================================

var QueueManager = {
    queue: [],
    members: [],
    processing: false,

    // ________________________________________________________________________________________________
    // Initialize queue system
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    init: async function() {
        HMLogger.info("QueueManager: Initializing...");
        
        // Load persisted queue FIRST
        this.load();
        
        // Then fetch members and attach events
        await this.fetchAllianceMembers();
        this.attachEvents();
        this.renderQueue();
        
        // UX Reminder: If after load/fetch we still have data, we are good.
        // If not, remind user to visit the alliance page.
        if (this.members.length === 0 && !window.location.href.includes("alliance.php?Membres")) {
            HMToast.info("Alliance targets not synced. Visit your Members page to load them.");
        }
        
        HMLogger.info("QueueManager: Initialized");
    },

    // ________________________________________________________________________________________________
    // Attach UI event handlers (Usually handled by HMBuilder)
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    attachEvents: function() {
        // IDs here should match those in builder.js
        var btnAdd = document.getElementById("HM_btnAddToQueue");
        if (btnAdd) btnAdd.onclick = () => this.addToQueue();

        var btnAutoAdd = document.getElementById("HM_btnAutoAdd");
        if (btnAutoAdd && !btnAutoAdd.onclick) {
            btnAutoAdd.onclick = () => this.autoAddMostMembers();
        }

        var btnNuke = document.getElementById("HM_btnNukeQueue"); // I'll add this to UI
        if (btnNuke) btnNuke.onclick = () => this.nukeStorage();
    },

    // ________________________________________________________________________________________________
    // Fetch alliance members for dropdown
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    fetchAllianceMembers: async function(force = false) {
        try {
            // 1. Try Cache First (Skip if forced)
            if (!force) {
                var cached = localStorage.getItem("HM_AllianceMembers");
                if (cached) {
                    try {
                        var members = JSON.parse(cached);
                        if (Array.isArray(members) && members.length > 0) {
                            this.members = members;
                            this.updateMemberDropdown();
                            HMLogger.info(`[Queue] Loaded ${members.length} members from cache`);
                            return this.members;
                        }
                    } catch (e) { HMLogger.warn("Failed to parse cached members"); }
                }
            }

            // 2. Otherwise Fetch
            HMLogger.info("[Queue] Performing fresh scrape...");

            // NEW: If we are already ON the alliance members page, don't fetch! Just scrape local DOM.
            if (window.location.href.includes("alliance.php?Membres")) {
                HMLogger.info("[Queue] On target page. Scrapping local DOM to ensure session validity.");
                await this.scrapeCurrentPage();
                return this.members;
            }
            
            var allianceUrl = $("a[href*='alliance.php?Membres']").attr("href");
            if (!allianceUrl) {
                var baseLink = $("a[href*='alliance.php']").attr("href");
                if (baseLink) allianceUrl = baseLink.split('?')[0] + "?Membres";
                else allianceUrl = "alliance.php?Membres";
            }
            
            if (allianceUrl.match(/^https?:\/\//)) {
                allianceUrl = allianceUrl.replace(/^https?:\/\/[^\/]+/, "");
            }

            var html = await window.HMAPI.get(allianceUrl);
            var doc = new DOMParser().parseFromString(html, "text/html");
            
            // SECURITY: Don't clear members list if parse fails or looks like login
            var results = await this.parseMembers(doc, "Fetched", allianceUrl);
            return (results && results.length > 0) ? results : this.members;
        } catch (e) {
            HMLogger.error("Failed to fetch alliance members: " + e.message);
            return this.members; // Return existing instead of empty
        }
    },

    // ________________________________________________________________________________________________
    // Scrape current page (Direct DOM access) - Restores "autoScrapeAlliance" behavior
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    scrapeCurrentPage: async function() {
        var frameId = (window === window.top) ? "TOP" : "IFRAME";
        HMLogger.info(`[Queue] [${frameId}] Starting auto-scrape (${window.location.pathname})...`);
        
        var retries = 15; // Increased to 15s for very slow connections
        var members = null;
        
        while (retries > 0) {
            members = this.parseMembers(document, "DOM", window.location.href);
            
            // If we found members, success!
            if (members && members.length > 0) {
                HMLogger.success(`[Queue] Scraped ${members.length} members from DOM`);
                return members;
            }
            
            // If parseMembers returned an empty array [], it means it FOUND rows but they were skipped.
            // In this case, we might still want to retry a few times in case more rows are loading,
            // but we shouldn't treat it as "Table not found".
            
            HMLogger.debug(`[Queue] No valid members found in DOM yet, retrying in 1s (${retries} left)...`);
            await Utils.humanDelay(1000);
            retries--;
        }
        
        if (window.location.href.toLowerCase().includes("membres")) {
            var allTables = document.querySelectorAll("table");
            var tableDetails = Array.from(allTables).map(t => {
                var info = (t.id || "no-id") + "." + (t.className || "no-class");
                var rows = t.querySelectorAll("tr").length;
                return `${info}(${rows}r)`;
            }).join(", ");
            
            HMLogger.warn(`[Queue] [${frameId}] Auto-scrape failed after 15s on Alliance page.`);
            HMLogger.info(`[Queue] [${frameId}] Diagnostic (${window.location.href}): Found ${allTables.length} tables: ${tableDetails}`);
            
            var allianceContainer = document.getElementById("alliance") || document.querySelector(".alliance");
            if (allianceContainer) {
                HMLogger.info(`[Queue] Alliance container found (${allianceContainer.tagName}). Len: ${allianceContainer.innerHTML.length}`);
            } else {
                HMLogger.info(`[Queue] Alliance container NOT found.`);
            }
        }
        return null;
    },

    // Shared parsing logic
    parseMembers: function(doc, source, sourceUrl) {
        try {
            var rows = [];
            var memberTable = null; // Reference to the actual table containing member data
            
            // Strategy 1: ID or Class (Most specific)
            var table = doc.getElementById("tabMembresAlliance") || doc.querySelector(".tabMembresAlliance");
            if (table) {
                memberTable = table;
            }
            
            // Strategy 2: Header-based search (Case-insensitive)
            if (!memberTable) {
                var tables = doc.querySelectorAll("table");
                for (var t of tables) {
                    var text = t.textContent.toLowerCase();
                    if (text.includes("grade") && (text.includes("name") || text.includes("nom") || text.includes("pseudo"))) {
                        memberTable = t;
                        break;
                    }
                }
            }
            
            // Strategy 3: Heuristic Fallback (CSS classes)
            if (!memberTable) {
                var fallbackTable = doc.querySelector("table.tab_triable, table.boite_classement");
                if (fallbackTable) {
                    memberTable = fallbackTable;
                }
            }
            
            // Strategy 4: Fallback based on containing membre.php links
            if (!memberTable) {
                var allTables = doc.querySelectorAll("table");
                var bestTable = null;
                var maxCount = 0;
                for (var t of allTables) {
                    var cells = t.querySelectorAll("a[href*='Membre.php'], a[href*='membre.php']");
                    if (cells.length > maxCount) {
                        maxCount = cells.length;
                        bestTable = t;
                    }
                }
                if (bestTable) {
                    memberTable = bestTable;
                }
            }

            if (memberTable) {
                var rawRows = memberTable.querySelectorAll("tbody tr");
                if (rawRows.length === 0) rawRows = memberTable.querySelectorAll("tr");
                rows = Array.from(rawRows).filter(tr => {
                    return tr.querySelector("a[href*='Membre.php'], a[href*='membre.php'], a[href*='Pseudo='], a[href*='pseudo=']");
                });
            }
            
            if (!rows || rows.length === 0) {
                // If we found NO members, and the title says Login, then it's a real session issue.
                if (doc.title && doc.title.toLowerCase().includes("login")) {
                    HMLogger.error(`[Queue] Scraper fetched LOGIN PAGE! Session invalid. Source: ${sourceUrl}`);
                    HMToast.error("HiveMind Session Expired. Please refresh your Alliance Members page.");
                    return null;
                }
                HMLogger.debug(`[Queue] No rows found using any strategy. (Source: ${source})`);
                return null;
            }

        // SUCCESS: We found table rows!
        var parsed = [];
        var totalRows = rows.length;
        
        HMLogger.debug(`[Queue] Scrutinizing ${totalRows} rows from ${source}...`);
        
        // Detect Current User reliably (look at TOP frame's state/DOM if available)
        var currentUser = $("#pseudo").text().trim() || 
                        HMState?.User?.username || 
                        window.top.document.getElementById("pseudo")?.textContent.trim() || 
                        "";
        
        HMLogger.debug(`[Queue] Filtering out current user: "${currentUser}"`);
        
        // Normalize for comparison
        var normalize = (name) => (name || "").toLowerCase().trim().replace(/^s\d+\s*/, '').replace(/\s+/g, '');
        var normalizedCurrent = normalize(currentUser);

        // Dynamic Column Detection — search WITHIN the member table, not the global document
        var colIndices = { grade: 2, name: 3, hf: 5, tech: -1, anthill: -1, fight: -1, state: 9, alliance: -1 }; // Defaults
        
        // Find the ACTUAL column header row within the same table that contains our data
        var headerRow = null;
        var searchScope = memberTable || doc;
        
        // First try: CSS class used by the game
        headerRow = searchScope.querySelector("tr.table_menu");
        
        // Second try: Scan rows WITHIN the member table for column keywords
        if (!headerRow && memberTable) {
            var tableRows = memberTable.querySelectorAll("tr");
            for (var r of tableRows) {
                var rowText = r.textContent.toLowerCase();
                // The column header row should contain player-related column names
                if ((rowText.includes("pseudo") || rowText.includes("joueur") || rowText.includes("name")) && 
                    (rowText.includes("chasse") || rowText.includes("terrain") || rowText.includes("hunting") || rowText.includes("field"))) {
                    headerRow = r;
                    HMLogger.debug(`[Queue] Found column header row via keyword scan within member table`);
                    break;
                }
            }
        }
        
        // Third try: Look for the first row that has a cell mentioning a stat keyword
        if (!headerRow && memberTable) {
            var tableRows = memberTable.querySelectorAll("tr");
            for (var r of tableRows) {
                var cells = r.querySelectorAll("td, th");
                var hasStatKeyword = false;
                cells.forEach(function(c) {
                    var t = c.textContent.toLowerCase();
                    if (t.includes("techno") || t.includes("technology") || t.includes("fourmili") || t.includes("anthill") || t.includes("chasse") || t.includes("field")) {
                        hasStatKeyword = true;
                    }
                });
                if (hasStatKeyword) {
                    headerRow = r;
                    HMLogger.debug(`[Queue] Found column header row via stat keyword fallback`);
                    break;
                }
            }
        }
        
        if (headerRow) {
            var headers = headerRow.querySelectorAll("td, th");
            let logicalIndex = 0;
            headers.forEach((th) => {
                var txt = th.textContent.toLowerCase().trim();
                if (txt.includes("alliance")) colIndices.alliance = logicalIndex;
                if (txt.includes("grade") || txt.includes("rang")) colIndices.grade = logicalIndex;
                if (txt.includes("pseudo") || txt.includes("joueur") || txt.includes("nom") || txt.includes("name")) colIndices.name = logicalIndex;
                if (txt.includes("chasse") || txt.includes("field") || txt.includes("hunting") || txt.includes("terrain")) colIndices.hf = logicalIndex;
                if (txt.includes("techno") || txt.includes("technology")) colIndices.tech = logicalIndex;
                if (txt.includes("fourmili") || txt.includes("anthill")) colIndices.anthill = logicalIndex;
                if (txt.includes("combat") || txt.includes("fight")) colIndices.fight = logicalIndex;
                if (txt.includes("état") || txt.includes("state") || txt.includes("etat")) colIndices.state = logicalIndex;
                
                // Advance physical col index by the span of this header cell
                var colspan = parseInt(th.getAttribute("colspan") || "1", 10);
                logicalIndex += colspan;
            });
            HMLogger.info(`[Queue] Column detection: Name=${colIndices.name}, HF=${colIndices.hf}, Tech=${colIndices.tech}, Anthill=${colIndices.anthill}, Fight=${colIndices.fight}, State=${colIndices.state}, Alliance=${colIndices.alliance}`);
        } else {
            HMLogger.warn(`[Queue] Could not find column header row! Using defaults. Tech/Anthill will be 0.`);
        }

        // Alliance Cross-Referencing Logic
        var myAllianceTag = "TQC";
        var isSearchOrGlobal = (colIndices.alliance !== -1); // If there's an alliance column, it's not a single alliance page
        
        // If it's a single alliance page, extract from URL
        if (!isSearchOrGlobal) {
            var urlParams = new URLSearchParams(window.location.search);
            var urlAlliance = urlParams.get("alliance");
            if (urlAlliance) {
                myAllianceTag = urlAlliance.replace(/\[|\]/g, "").trim();
                HMLogger.info(`[Queue] Enemy alliance page detected: ${myAllianceTag}`);
            } else {
                // Own alliance: cross-reference from cached rankings
                try {
                    var cachedRankings = JSON.parse(localStorage.getItem("HM_PlayerRankings") || "[]");
                    var me = cachedRankings.find(p => p.name.toLowerCase() === currentUser.toLowerCase());
                    if (me && me.alliance) {
                        myAllianceTag = me.alliance;
                    }
                } catch(e) {}
            }
        }
        
        myAllianceTag = myAllianceTag.replace(/\[|\]/g, "").trim();

        Array.from(rows).forEach((row, idx) => {
            var cells = row.querySelectorAll("td");
            if (cells.length < 5) {
                if (idx > 0 && idx < 10) HMLogger.debug(`[Queue] Skipping row ${idx}: insufficient cells (${cells.length})`);
                return;
            }
            
            // Find name and link
            var nameLink = row.querySelector("a[href*='Membre.php']") || 
                          row.querySelector("a[href*='membre.php']") ||
                          row.querySelector("a[href*='Pseudo=']") ||
                          row.querySelector("a[href*='pseudo=']") ||
                          cells[colIndices.name]?.querySelector("a");
            
            if (!nameLink) {
                if (idx < 10) HMLogger.debug(`[Queue] Skipping row ${idx}: no profile link found`);
                return;
            }

            var pseudo = nameLink.textContent.trim();
            var href = nameLink.getAttribute("href") || "";
            var idMatch = href.match(/Pseudo=([^&]+)/i);
            var playerId = idMatch ? idMatch[1] : pseudo;
            
            var normalizedPseudo = normalize(pseudo);

            // EXCLUSION: Skip current user
            if (!pseudo || normalizedPseudo === normalizedCurrent) {
                HMLogger.debug(`[Queue] Skipping row ${idx} ("${pseudo}"): current user or empty`);
                return;
            }

            var getStat = (colIndex) => {
                if (colIndex < 0 || colIndex >= cells.length) return 0;
                var text = cells[colIndex].textContent || "";
                return parseInt(text.replace(/[\s.,]/g, ''), 10) || 0;
            };

            var grade = colIndices.grade >= 0 && cells[colIndices.grade] ? cells[colIndices.grade].textContent.trim() : "";
            var hf = getStat(colIndices.hf);
            var tech = getStat(colIndices.tech);
            var anthill = getStat(colIndices.anthill);
            var fight = getStat(colIndices.fight);
            
            var state = "active";
            if (colIndices.state >= 0 && cells[colIndices.state]) {
                var stateImg = cells[colIndices.state].querySelector("img");
                if (stateImg) {
                    var src = stateImg.getAttribute("src") || "";
                    if (src.includes("vacances")) state = "vacation";
                    else if (src.includes("inactif")) state = "inactive";
                    else if (src.includes("supprime")) state = "deleted";
                }
            }

            var playerAlliance = undefined;
            if (isSearchOrGlobal) {
                var extAlliance = cells[colIndices.alliance] ? cells[colIndices.alliance].textContent.replace(/\[|\]/g, "").trim() : "";
                if (extAlliance) {
                    playerAlliance = extAlliance;
                }
                // If it's empty (like broken search results), leave undefined so worker doesn't overwrite
            } else {
                playerAlliance = myAllianceTag; // Blanket tag since we're strictly on an alliance page
            }

            var roleEmoji = "";
            var emojis = ["❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "🎓", "🩷"];
            for (var e of emojis) { if (grade.includes(e)) { roleEmoji = e; break; } }

            var playerObj = {
                id: playerId,
                name: pseudo,
                grade: grade,
                roleEmoji: roleEmoji,
                hf: hf,
                tech: tech,
                anthill: anthill,
                fight: fight,
                state: state
            };
            
            if (playerAlliance !== undefined) {
                playerObj.alliance = playerAlliance;
            }

            parsed.push(playerObj);
        });

            HMLogger.debug(`[Queue] Parsing complete: ${parsed.length} kept, ${totalRows - parsed.length} skipped.`);

            // PERSISTENCE: Only update global state if we found valid data
            if (parsed.length > 0) {
                this.members = parsed;
                // AUTO-NUKE: Only clear storage if we actually found new data to replace it with
                this.nukeStorage(true); 
                localStorage.setItem("HM_AllianceMembers", JSON.stringify(this.members));
                HMLogger.info(`[Queue] Updated member cache with ${this.members.length} targets.`);
                
                // === UNIFIED BATCH INTEL ===
                var intelPayload = parsed
                    .filter(function(m) { return m.hf > 0 || m.tech > 0 || m.anthill > 0 || m.fight > 0; })
                    .map(function(m) { 
                        return { 
                            name: m.name, 
                            alliance: (m.alliance || "").replace(/\[|\]/g, "").trim(),
                            hf: m.hf,
                            tech: m.tech,
                            anthill: m.anthill,
                            rank: 0,
                            fight: m.fight || 0
                        }; 
                    });
                
                
                if (intelPayload.length > 0) {
                    
                    // INJECT SELF: Since queue.js intentionally skips parsing the active user from the table,
                    // we must dynamically extract the active user's live HF from the DOM and append it 
                    // to the batch snapshot so the Dashboard's "Cycled Internally" math works perfectly.
                    try {
                        var currentUser = $("#pseudo").text().trim() || (typeof NetworkManager !== "undefined" ? NetworkManager.inGameName : "unknown");
                        var hfElement = document.getElementById("chasseur") || document.getElementById("Hunters");
                        
                        var getHFFromDoc = function(doc) {
                            var img = doc.querySelector('img[src*="icone_tdc.png"]') || doc.querySelector('.icone_terrain_boite_info');
                            if (img && img.nextElementSibling && img.nextElementSibling.classList.contains('texte_ligne_boite_info')) {
                                return img.nextElementSibling;
                            }
                            return null;
                        };

                        var activeHFEl = getHFFromDoc(document);
                        if (!activeHFEl && window.parent && window.parent.frames) {
                            for (var z = 0; z < window.parent.frames.length; z++) {
                                try {
                                    activeHFEl = getHFFromDoc(window.parent.frames[z].document);
                                    if (activeHFEl) break;
                                } catch(e) {}
                            }
                        }

                        if (activeHFEl && activeHFEl.textContent && currentUser) {
                            var activeHFVal = parseInt(activeHFEl.textContent.replace(/[^0-9]/g, ""), 10);
                            if (activeHFVal > 0) {
                                // Use the user's actual alliance from HMState to avoid misattribution on enemy alliance pages
                                var myActualAlliance = (HMState.User && HMState.User.alliance) ? HMState.User.alliance : "";
                                
                                // Normalize for comparison
                                var normalizedMyTag = myActualAlliance.replace(/\[|\]/g, "").trim().toLowerCase();
                                var normalizedPageTag = myAllianceTag.toLowerCase();

                                // Only inject self if we are on our own alliance page OR if we have a known alliance
                                // This prevents "Raydonia" from being attributed to "RIP" just because they are viewing RIP's members.
                                if (normalizedMyTag === normalizedPageTag || myActualAlliance !== "") {
                                    intelPayload.push({
                                        name: currentUser,
                                        alliance: myActualAlliance.replace(/\[|\]/g, "").trim(),
                                        hf: activeHFVal,
                                        tech: 0,
                                        anthill: 0,
                                        rank: 0,
                                        fight: 0
                                    });
                                    HMLogger.info(`[Queue] Appended active user (${currentUser}) to batch intel with CORRECT alliance: ${myActualAlliance}`);
                                } else {
                                    HMLogger.debug(`[Queue] Skipping self-injection: User is not in alliance "${myAllianceTag}"`);
                                }
                            }
                        }
                    } catch (e) {
                         HMLogger.error("[Queue] Failed to append active user to batch intel: " + e.message);
                    }

                    
                    // LOCAL DEDUPLICATION: Avoid hammering the API if literally nothing changed
                    var currentHash = JSON.stringify(intelPayload);
                    var previousHash = HMStorage.load("HM_LastIntelHash", "");
                    
                    if (currentHash === previousHash) {
                        HMLogger.info("[Queue] Data identical to last scrape. Skipping API submission to save bandwidth.");
                    } else {
                        HMStorage.save("HM_LastIntelHash", currentHash);
                        
                        if (typeof NetworkManager !== "undefined" && NetworkManager.isConnected) {
                            // Primary path: use authenticated NetworkManager
                            NetworkManager.submitBatchIntel(intelPayload).then(success => {
                                if (success) {
                                    HMLogger.info(`[Queue] Successfully synced ${intelPayload.length} members to database`);
                                    HMToast.success(`Synced ${intelPayload.length} alliance targets`);
                                } else {
                                    HMLogger.error("[Queue] Failed to sync alliance targets to database");
                                    HMToast.error("Database sync failed");
                                }
                            });
                        } else {
                            HMLogger.warn("[Queue] NetworkManager not connected. Please log in with your Personal Access Token to submit intelligence.");
                        }
                    }
                }
            }

            this.updateMemberDropdown();
            return this.members;
        } catch (e) {
            HMLogger.error("Failed to parse members: " + e.message);
            return null;
        }
    },

    // ________________________________________________________________________________________________
    // Update member dropdown
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    updateMemberDropdown: function() {
        var select = document.getElementById("HM_SelMember");
        if (!select) return;

        var currentVal = select.value;
        var placeholder = '<option value="">-- Select Alliance Member --</option>';
        select.innerHTML = placeholder;
        
        // 1. Get User HF for filtering (from HMState)
        var userHF = HMState.User?.hf || 0;
        var settings = JSON.parse(localStorage.getItem("HM_Settings") || "{}");
        var showAll = settings.queueShowAll || false;
        
        // 2. Filter by range if not showing all
        var targets = this.members;
        var filteredCount = 0;
        if (!showAll && userHF > 0) {
            var min = userHF * 0.5;
            var max = userHF * 3.0;
            targets = this.members.filter(m => {
                if (!m.hf) return true; // Keep if HF unknown/0
                return m.hf >= min && m.hf <= max;
            });
            filteredCount = this.members.length - targets.length;
            HMLogger.info(`[Queue] Dropdown: ${targets.length}/${this.members.length} targets in range. ${filteredCount} hidden.`);
        }

        // 3. Sort by HF Descending (highest hunters first)
        targets.sort((a, b) => (b.hf || 0) - (a.hf || 0));

        if (targets.length === 0 && this.members.length > 0) {
            var opt = document.createElement("option");
            opt.value = "";
            opt.disabled = true;
            opt.textContent = "-- No Targets in Range (Check 'Show All') --";
            select.appendChild(opt);
        }

        targets.forEach(m => {
            var opt = document.createElement("option");
            opt.value = m.name;
            var hfStr = m.hf ? " (" + Utils.formatCompact(m.hf) + " HF)" : "";
            var statusPrefix = m.state === "holiday" ? "[H] " : m.state.startsWith("inactive") ? "[I] " : "";
            opt.textContent = statusPrefix + (m.roleEmoji || "") + " " + m.name + hfStr;
            select.appendChild(opt);
        });
        
        // Restore selection if still in list
        if (currentVal) select.value = currentVal;
    },
    
    // Compatibility Shim for Builder.js which might call window.FloodQueueManager.addTarget()
    addTarget: function(name) {
        this.addToQueue(name);
    },

    // ________________________________________________________________________________________________
    // Add member to queue
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    addToQueue: async function(name) {
        var selectedPseudo = name || $("#HM_SelMember").val();
        if (!selectedPseudo) return HMToast.warn("Select a member first");

        var alreadyQueued = this.queue.some(item => item.pseudo === selectedPseudo);
        if (alreadyQueued) {
            return HMToast.warn("Member already in queue");
        }

        // 1. Initial Capture (Coords & Basic Setup)
        var floodData = await this.captureCurrentFloodSetup(selectedPseudo);
        
        this.queue.push({
            pseudo: selectedPseudo,
            setup: floodData,
            status: "pending",
            addedAt: Date.now()
        });

        // 2. Sort & Recalculate Projections (Cumulative Intelligence)
        // Fastest First ensures simulation follows landing order
        this.queue.sort((a, b) => (a.setup.travelTime || 0) - (b.setup.travelTime || 0));
        await this.recalculateQueueProjections();

        this.renderQueue();
        this.save();
        HMToast.success(`Added ${selectedPseudo} to queue (Chain Updated)`);
    },

    autoAddMostMembers: function() {
        return new Promise((resolve) => {
            if (this.members.length === 0) {
                HMToast.warn("No alliance members available. Try fetching them first.");
                resolve();
                return;
            }

            var currentUser = $("#pseudo").text().trim() || 
                              HMState?.User?.username || 
                              window.top.document.getElementById("pseudo")?.textContent.trim() || 
                              "";
            var normalizedCurrent = currentUser.toLowerCase().trim();
            var queuedPseudos = new Set(this.queue.map(item => item.pseudo.toLowerCase().trim()));

            var candidates = this.members.filter(m => {
                if (!m.name) return false;
                var normName = m.name.toLowerCase().trim();
                if (normName === normalizedCurrent) return false;
                if (queuedPseudos.has(normName)) return false;
                if (m.state) {
                    var s = m.state.toLowerCase();
                    if (s === "vacation" || s === "deleted" || s === "holiday") return false;
                }
                return true;
            });

            if (candidates.length === 0) {
                HMToast.info("All available targets are already in the queue.");
                resolve();
                return;
            }

            // Sort by HF ascending
            candidates.sort((a, b) => (a.hf || 0) - (b.hf || 0));

            // Load saved exclusions
            var exclusions = new Set(JSON.parse(localStorage.getItem("HM_AutoAddExclusions") || "[]"));

            // Build HTML for the selection modal
            var listHtml = `<div style="max-height: 250px; overflow-y: auto; text-align: left; border: 1px solid var(--hm-border); padding: 8px; background: rgba(0,0,0,0.15); margin-bottom: 8px;">`;
            candidates.forEach((c, index) => {
                var isExcluded = exclusions.has(c.name.toLowerCase().trim());
                var checked = !isExcluded ? "checked" : "";
                var hfCompact = c.hf ? Utils.formatCompact(c.hf) + " HF" : "Unknown HF";
                listHtml += `
                    <div style="margin-bottom: 6px; display: flex; align-items: center; gap: 8px; font-family: var(--font-mono, monospace); font-size: 0.9em; color: var(--hm-text);">
                        <input type="checkbox" class="hm-autoadd-candidate" data-pseudo="${c.name}" id="cand_${index}" ${checked} style="cursor: pointer;">
                        <label for="cand_${index}" style="cursor: pointer; display: flex; align-items: center; gap: 4px; flex: 1;">
                            <span>${c.roleEmoji || ""}</span>
                            <strong>${c.name}</strong>
                            <span style="color: var(--hm-muted); font-size: 0.85em;">(${hfCompact})</span>
                        </label>
                    </div>
                `;
            });
            listHtml += `</div>`;
            listHtml += `
                <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                    <button type="button" id="HM_BtnSelAllEx" class="hm-btn-small" style="font-size:0.75rem; padding: 2px 6px; cursor: pointer;">Check All</button>
                    <button type="button" id="HM_BtnDeselAllEx" class="hm-btn-small" style="font-size:0.75rem; padding: 2px 6px; cursor: pointer;">Uncheck All</button>
                </div>
                <div style="font-size: 0.8em; color: var(--hm-muted); text-align: left; line-height: 1.4;">
                    Checked members will be processed by the simulator. Unchecked members are excluded. Selections are saved automatically.
                </div>
            `;

            HMUI.confirm("⚡ Auto-Add Candidates", listHtml, async () => {
                var selectedPseudos = [];
                var newExclusions = [];
                
                document.querySelectorAll(".hm-autoadd-candidate").forEach(input => {
                    var name = input.getAttribute("data-pseudo");
                    var nameLower = name.toLowerCase().trim();
                    if (input.checked) {
                        selectedPseudos.push(name);
                    } else {
                        newExclusions.push(nameLower);
                    }
                });

                localStorage.setItem("HM_AutoAddExclusions", JSON.stringify(newExclusions));

                if (selectedPseudos.length === 0) {
                    HMToast.info("No targets selected.");
                    resolve();
                    return;
                }

                await this.runAutoAddSimulation(selectedPseudos);
                resolve();
            });

            // Handle cancel: override the cancel button's onclick to also resolve
            var btnCancel = document.getElementById("HM_ModalCancel");
            if (btnCancel) {
                var originalCancelClick = btnCancel.onclick;
                btnCancel.onclick = function() {
                    if (originalCancelClick) originalCancelClick();
                    resolve();
                };
            }

            // Attach Select/Deselect handlers
            var btnSelAll = document.getElementById("HM_BtnSelAllEx");
            if (btnSelAll) {
                btnSelAll.onclick = function() {
                    document.querySelectorAll(".hm-autoadd-candidate").forEach(input => input.checked = true);
                };
            }
            var btnDeselAll = document.getElementById("HM_BtnDeselAllEx");
            if (btnDeselAll) {
                btnDeselAll.onclick = function() {
                    document.querySelectorAll(".hm-autoadd-candidate").forEach(input => input.checked = false);
                };
            }
        });
    },

    runAutoAddSimulation: async function(selectedPseudos) {
        var candidates = selectedPseudos.map(name => this.members.find(m => m.name === name)).filter(Boolean);
        candidates.sort((a, b) => (a.hf || 0) - (b.hf || 0));

        var runningHF = HMState.User.hf;
        var runningArmy = [...HMState.Units];
        
        var userHFText = $("#chasseur").text() || $("#Hunters").text();
        if (userHFText) {
            runningHF = parseInt(userHFText.replace(/[^0-9]/g, "")) || runningHF;
        }

        var addedTargets = [];
        HMLogger.info(`[Queue] Running greedy auto-add simulation for ${candidates.length} targets. Starting HF: ${runningHF}`);

        for (var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i];
            var candHF = candidate.hf || 0;
            var minRange = runningHF * 0.5;
            var maxRange = runningHF * 3.0;

            if (candHF < minRange || candHF > maxRange) {
                HMLogger.debug(`[Queue] Candidate "${candidate.name}" (HF: ${candHF}) out of range [${minRange.toFixed(0)}, ${maxRange.toFixed(0)}]. Skipping.`);
                continue;
            }

            var setup = await this.captureCurrentFloodSetup(candidate.name, runningHF, runningArmy);
            if (!setup || setup.totalAmount === 0 || setup.isPartial === true) {
                HMLogger.info(`[Queue] Simulation hit army limit or partial flood on "${candidate.name}". Stopping greedy add.`);
                break;
            }

            addedTargets.push({
                pseudo: candidate.name,
                setup: setup,
                status: "pending",
                addedAt: Date.now()
            });

            // Advance simulation
            runningHF += setup.totalAmount;
            if (setup.remainingArmy) {
                runningArmy = [...setup.remainingArmy];
            }
        }

        if (addedTargets.length > 0) {
            // Sort by travelTime ascending
            addedTargets.sort((a, b) => (a.setup.travelTime || 0) - (b.setup.travelTime || 0));
            this.queue = this.queue.concat(addedTargets);
            await this.recalculateQueueProjections();
            this.save();
            this.renderQueue();
            HMToast.success(`Greedily added ${addedTargets.length} targets to queue.`);
        } else {
            HMToast.info("No additional targets could be fully flooded within range.");
        }
    },

    playCompletionChime: function() {
        try {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            var ctx = new AudioContext();
            var now = ctx.currentTime;

            // Arpeggio: C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
            var notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, index) => {
                var osc = ctx.createOscillator();
                var gain = ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + index * 0.08);
                
                gain.gain.setValueAtTime(0.1, now + index * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 0.8);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start(now + index * 0.08);
                osc.stop(now + index * 0.08 + 0.8);
            });
        } catch (e) {
            HMLogger.error("Failed to play queue completion chime: " + e.message);
        }
    },

    /**
     * Simulation Chain Engine:
     * Iterates through the sorted queue and recalculates each target's gain,
     * passing the 'runningHF' forward to the next target.
     */
    recalculateQueueProjections: async function() {
        HMLogger.info("[Queue] Chaining Cumulative Projections (HF + Army)...");
        
        // Start with ACTUAL current state
        var runningHF = HMState.User.hf;
        var runningArmy = [...HMState.Units]; // Cumulative pool
        
        // Sync runningHF from DOM if possible (most accurate for start of chain)
        var userHFText = $("#chasseur").text() || $("#Hunters").text();
        if (userHFText) {
            runningHF = parseInt(userHFText.replace(/[^0-9]/g, "")) || runningHF;
        }

        for (var i = 0; i < this.queue.length; i++) {
            var item = this.queue[i];
            if (item.status !== "pending") continue;

            // Simulate this target using the runningHF AND runningArmy depletion
            item.setup = await this.captureCurrentFloodSetup(item.pseudo, runningHF, runningArmy);
            
            // ADVANCE the chain
            runningHF += (item.setup.totalAmount || 0);
            
            // runningArmy is already modified by reference or returned from capture?
            // Actually, captureCurrentFloodSetup modifies the array passed if we let it.
            // Let's ensure it updates runningArmy for the next target.
            if (item.setup.remainingArmy) {
                runningArmy = [...item.setup.remainingArmy];
            }
        }
        
        HMLogger.info(`[Queue] Simulation Chain Complete. Terminal Projection: ${Utils.formatCompact(runningHF)} HF`);
    },

    // ________________________________________________________________________________________________
    // Capture current flood configuration (Deep Simulation)
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    captureCurrentFloodSetup: async function(pseudo, forcedUserHF, forcedArmy) {
        // Find member in cache to get their HF
        var member = this.members.find(m => m.name === pseudo);
        var targetHF = member ? member.hf : parseInt($("#HM_TargetHF").val().replace(/[^0-9]/g, "")) || 0;
        
        // Use forced HF/Army or current state
        var userHF = forcedUserHF || parseInt($("#HM_YourHF").val().replace(/[^0-9]/g, "")) || HMState.User.hf;
        var armyPool = forcedArmy ? [...forcedArmy] : [...HMState.Units];

        // Local snapshot of current UI state
        var setup = {
            strategy: $("#HM_SelType").val(),
            targetHF: targetHF,
            yourHF: userHF,
            fixedAmount: parseInt($("#HM_Amount").val().replace(/[^0-9]/g, "")) || 0,
            defense: {
                enabled: $("#HM_btnKeep").val() === "Yes",
                field: {type: $("#HM_HFTroopsType").val(), nb: $("#HM_HFTroopsNb").val()},
                anthill1: {type: $("#HM_ATroops1Type").val(), nb: $("#HM_ATroops1Nb").val()},
                anthill2: {type: $("#HM_ATroops2Type").val(), nb: $("#HM_ATroops2Nb").val()}
            },
            waves: [], // Success Matrix
            unitName: "" // Dominant troop used
        };

        // 1. Fetch Coords & HF if missing (Player Profile)
        var targetData = {};
        await HMEngine.getPlayerInfo(pseudo, targetData);
        setup.x = targetData.x || 0;
        setup.y = targetData.y || 0;
        if (targetData.hf > 0) setup.targetHF = targetData.hf;

        // 2. Calculate Distance & Travel Time (Projection)
        setup.travelTime = Utils.calculateTravelTime(
            HMState.User.x, HMState.User.y,
            setup.x, setup.y,
            HMState.Tech.velocity
        );

        // 3. SIMULATION: Run the math for THIS target
        var backupTarget = JSON.parse(JSON.stringify(HMState.Target));
        var backupUserHF = HMState.User.hf;
        var backupUnits = [...HMState.Units];
        var backupInputTarget = $("#HM_TargetHF").val();
        var backupInputUser = $("#HM_YourHF").val();
        
        // Spoof DOM and State
        $("#HM_TargetHF").val(Utils.formatInt(setup.targetHF));
        $("#HM_YourHF").val(Utils.formatInt(setup.yourHF));
        HMState.Target.hf = setup.targetHF;
        HMState.User.hf = setup.yourHF;
        HMState.Units = [...armyPool]; // Use the "Depleted" chain army
        
        if (typeof FloodManager !== "undefined") {
            FloodManager.compute();
            
            // Capture projections
            setup.totalAmount = 0;
            setup.waveCount = 0;
            setup.waves = HMState.Floods.map(f => {
                if (f.launch) {
                    setup.totalAmount += (f.amount - (f.missing || 0));
                    setup.waveCount++;
                }
                return {
                    amount: f.amount,
                    success: f.launch && !f.missing,
                    partial: f.partial,
                    missing: f.missing
                };
            });
            
            // Capture Unit Transparency (Identify dominant unit type used in first wave)
            var dominantIdx = -1;
            if (HMState.Floods[0] && HMState.Floods[0].army) {
                var max = 0;
                for(var j=0; j<HMState.Floods[0].army.length; j++) {
                    if (HMState.Floods[0].army[j] > max) {
                        max = HMState.Floods[0].army[j];
                        dominantIdx = j;
                    }
                }
            }
            if (dominantIdx > -1) {
                setup.unitName = HMState.UnitNames[dominantIdx] || "Troops";
            } else {
                setup.unitName = "None";
            }

            // Capture the depleted army for the NEXT target in the chain
            setup.remainingArmy = HMState.RemainingUnits ? [...HMState.RemainingUnits] : [...HMState.Units]; 
            
            setup.totalTroopsNeeded = setup.waves.reduce((sum, w) => sum + w.amount, 0);
            setup.isPartial = setup.waves.some(w => w.partial || (w.amount > 0 && !w.success));
        }

        // Restore State & DOM
        HMState.Target = backupTarget;
        HMState.User.hf = backupUserHF;
        HMState.Units = backupUnits;
        $("#HM_TargetHF").val(backupInputTarget);
        $("#HM_YourHF").val(backupInputUser);
        
        if (typeof FloodManager !== "undefined") FloodManager.compute(); 

        return setup;
    },

    // ________________________________________________________________________________________________
    // Render queue table
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    renderQueue: function() {
        var container = document.getElementById("HM_QueueContainer");
        if (!container) return;

        if (this.queue.length === 0) {
            container.innerHTML = '<div class="hm-empty">No targets in queue. Load members and add them above.</div>';
            return;
        }

        var totalRequired = this.queue.reduce((sum, item) => sum + (item.setup.totalTroopsNeeded || 0), 0);
        var currentArmy = HMState.Units.reduce((sum, u) => sum + u, 0);
        var deficit = totalRequired - currentArmy;
        var isShort = deficit > 0;

        var html = '<table class="hm-table" style="width:100%;">';
        html += '<thead><tr>';
        html += '<th style="width:30px;">#</th>';
        html += '<th>Target</th>';
        html += '<th style="text-align:right;">Amount</th>';
        html += '<th>Units</th>';
        html += '<th>Waves</th>';
        html += '<th style="text-align:right;">ETA</th>';
        html += '<th>Status</th>';
        html += '<th style="text-align:center;">Actions</th>';
        html += '</tr></thead><tbody>';

        this.queue.forEach((item, idx) => {
            var s = item.setup;
            var statusColor = item.status === "completed" ? "var(--hm-success, #4CAF50)" : 
                            item.status === "failed" ? "var(--hm-error, #f44336)" : 
                            item.status === "processing" ? "#FF9800" : "var(--hm-muted)";
            
            var statusIcon = item.status === "completed" ? "✓" : 
                             item.status === "failed" ? "✗" : 
                             item.status === "processing" ? "⏳" : "⋯";

            // Wave Success Matrix (Dots)
            var dots = (s.waves || []).map(w => {
                var color = w.success ? "var(--hm-success, #4CAF50)" : (w.partial ? "#FFC107" : "var(--hm-error, #f44336)");
                var title = w.success ? "Success" : (w.partial ? `Partial (-${Utils.formatInt(w.missing)})` : "Failure (No Troops)");
                return `<span style="color:${color}; cursor:help; font-size:14px; margin-right:2px;" title="${title}">●</span>`;
            }).join("");

            var rowOpacity = item.status === "processing" ? "opacity:0.7;" : "";
            var partialFlag = s.isPartial ? ' style="color:var(--hm-header-color, #FF9800); font-weight:700;"' : '';

            html += `<tr style="${rowOpacity}">`;
            html += `<td style="color:var(--hm-muted);">${idx + 1}</td>`;
            html += `<td style="font-weight:700;">${item.pseudo}</td>`;
            html += `<td style="text-align:right; font-family:var(--font-mono);">${Utils.formatCompact(s.totalAmount || 0)}</td>`;
            html += `<td${partialFlag}>${s.unitName || "—"}<br><small style="color:var(--hm-muted);">${Utils.formatCompact(s.totalTroopsNeeded || 0)}</small></td>`;
            html += `<td>${this.getStrategyName(s.strategy)}<br>${dots}</td>`;
            html += `<td style="text-align:right; color:var(--hm-muted);">${Utils.formatTime(s.travelTime || 0)}</td>`;
            html += `<td style="color:${statusColor}; text-transform:uppercase; font-size:10px; letter-spacing:0.5px;">${statusIcon} ${item.status}</td>`;
            html += `<td style="text-align:center;">`;
            html += `<button type="button" class="hm-btn-small hm-btn-danger hm-queue-remove" data-idx="${idx}">REMOVE</button>`;
            html += `</td></tr>`;
        });

        html += '</tbody></table>';

        // Chain Requirement + Process Button (Theme-aware)
        var reqBorder = isShort ? "var(--hm-error, #f44336)" : "var(--hm-success, #4CAF50)";
        var btnLabel = isShort ? `PROCESS (${Utils.formatCompact(deficit)} SHORT)` : "PROCESS QUEUE";

        html += `<div style="margin-top:15px; display:flex; gap:10px; align-items:stretch;">
                    <div style="flex:1; border:1px solid var(--hm-border, #333); border-left:4px solid ${reqBorder}; border-radius:4px; padding:10px; background:var(--hm-bg, transparent);">
                        <div style="font-size:10px; color:var(--hm-muted); text-transform:uppercase; letter-spacing:1px;">Chain Requirement</div>
                        <div style="font-size:14px; font-weight:700; color:var(--hm-text, inherit);">${Utils.formatCompact(totalRequired)} <span style="font-size:11px; font-weight:400; color:var(--hm-muted);">units needed</span></div>
                    </div>
                    <button type="button" id="HM_QueueProcess" class="hm-btn-primary" style="flex:2; font-size:16px; padding:10px 20px;">
                        ▶ ${btnLabel}
                    </button>
                    <button type="button" id="HM_QueueReset" class="hm-btn" style="padding:10px 15px; font-size:10px;">RESET</button>
                 </div>`;

        container.innerHTML = html;

        // Event Delegation: REMOVE buttons
        var self = this;
        container.querySelectorAll(".hm-queue-remove").forEach(btn => {
            btn.onclick = function() {
                var idx = parseInt(this.getAttribute("data-idx"));
                self.removeFromQueue(idx);
            };
        });

        // Process button
        var processBtn = document.getElementById("HM_QueueProcess");
        if (processBtn) {
            processBtn.onclick = function() { self.processQueue(); };
        }

        // Reset button
        var resetBtn = document.getElementById("HM_QueueReset");
        if (resetBtn) {
            resetBtn.onclick = function() { self.clearQueue(); };
        }
    },
    
    getStrategyName: function(code) {
        var map = {"0": "Optimized", "1": "Degressive", "2": "Uniform"};
        return map[code] || "Unknown";
    },

    removeFromQueue: async function(idx) {
        this.queue.splice(idx, 1);
        // Recalculate chain because the removed target's gain no longer applies to subsequent items
        await this.recalculateQueueProjections();
        this.save();
        this.renderQueue();
        HMToast.success("Removed from queue (Chain Balanced)");
    },

    clearQueue: function() {
        if (!confirm("Clear entire queue? This cannot be undone.")) return;
        this.queue = [];
        this.save();
        this.renderQueue();
        HMToast.success("Queue cleared");
    },
    
    processQueue: async function() {
        if (this.processing) {
            HMToast.warn("Already processing queue");
            return;
        }

        var pending = this.queue.filter(item => item.status === "pending");
        if (pending.length === 0) {
            HMToast.info("No pending targets in queue");
            return;
        }

        if (!confirm(`Process ${pending.length} queued floods?`)) return;

        this.processing = true;
        var btnProcess = document.getElementById("HM_QueueProcess");
        if (btnProcess) btnProcess.disabled = true;

        HMToast.info(`Starting queue processing: ${pending.length} targets`);

        for (var i = 0; i < this.queue.length; i++) {
            var item = this.queue[i];
            if (item.status !== "pending") continue;

            try {
                item.status = "processing";
                this.renderQueue();

                await this.applyFloodSetup(item.pseudo, item.setup);

                // Wait for floods to complete (Starting from Wave 0)
                if(typeof FloodManager !== "undefined") {
                     await FloodManager.launchSequence(0); 
                }

                item.status = "completed";
                HMToast.success(`Completed: ${item.pseudo}`);

                if (i < this.queue.length - 1) {
                    await Utils.humanDelay(5000, 10000);
                }

            } catch (e) {
                item.status = "failed";
                HMLogger.error(`Queue processing failed for ${item.pseudo}: ${e.message}`);
                HMToast.error(`Failed: ${item.pseudo}`);
            }

            this.renderQueue();
            this.save();
        }

        this.processing = false;
        if (btnProcess) btnProcess.disabled = false;
        var completed = this.queue.filter(q => q.status === "completed").length;
        var failed = this.queue.filter(q => q.status === "failed").length;
        var total = this.queue.length;
        HMToast.success(`✅ QUEUE COMPLETE — ${completed}/${total} targets flooded${failed > 0 ? `, ${failed} failed` : ""}`);
        HMLogger.info(`[Queue] Processing finished: ${completed} completed, ${failed} failed out of ${total} targets`);

        this.playCompletionChime();

        // Prominent completion modal with auto-reload countdown
        var targetList = this.queue.map(q => {
            var icon = q.status === "completed" ? "✅" : (q.status === "failed" ? "❌" : "⏭️");
            return `${icon} ${q.pseudo}`;
        }).join("<br>");

        var countdown = 5;
        var reloadInterval = null;
        var isCancelled = false;

        var updateModalText = () => {
            var bodyHtml = `<div style="text-align:center; line-height:2;">` +
                `<b>${completed}</b> of <b>${total}</b> targets flooded to <span style="color:var(--hm-success, #4CAF50); font-weight:bold;">🌿 Hunting Field</span>` +
                (failed > 0 ? `<br><span style="color:var(--hm-error, #f44336);">${failed} failed</span>` : "") +
                `<hr style="border-color:var(--hm-border); opacity:0.3; margin:8px 0;">` +
                `<div style="text-align:left; font-size:0.9em;">${targetList}</div>` +
                `<hr style="border-color:var(--hm-border); opacity:0.3; margin:8px 0;">` +
                `<div>` +
                (isCancelled 
                    ? `<span style="color:var(--hm-error, #f44336); font-weight:bold;">Reload cancelled.</span>` 
                    : `Auto-reloading page in <b id="HM_ReloadCountdown" style="font-family:var(--font-mono); font-size:1.2em;">${countdown}</b> seconds...<br>` +
                      `<button type="button" id="HM_BtnCancelReload" class="hm-btn-small" style="margin-top:8px; background:var(--hm-error, #f44336); color:#fff; border:none; padding:4px 8px; cursor:pointer; border-radius:3px;">Cancel Reload</button>`
                ) +
                `</div>` +
                `</div>`;
            
            var mBody = document.getElementById("HM_ModalBody");
            if (mBody) {
                mBody.innerHTML = bodyHtml;
                
                var btnCancelReload = document.getElementById("HM_BtnCancelReload");
                if (btnCancelReload) {
                    btnCancelReload.onclick = () => {
                        isCancelled = true;
                        if (reloadInterval) {
                            clearInterval(reloadInterval);
                            reloadInterval = null;
                        }
                        updateModalText();
                    };
                }
            }
        };

        HMUI.alert(
            "✅ Queue Complete",
            "",
            () => {
                if (reloadInterval) {
                    clearInterval(reloadInterval);
                    reloadInterval = null;
                }
            }
        );

        updateModalText();

        reloadInterval = setInterval(() => {
            countdown--;
            var countdownEl = document.getElementById("HM_ReloadCountdown");
            if (countdownEl) {
                countdownEl.textContent = countdown;
            }
            if (countdown <= 0) {
                clearInterval(reloadInterval);
                reloadInterval = null;
                if (!isCancelled) {
                    window.location.reload();
                }
            }
        }, 1000);
    },

    applyFloodSetup: async function(pseudo, setup) {
        HMLogger.info(`[Queue] Activating target: ${pseudo}...`);
        
        // 1. FRESH TARGET SCAN: Get latest HF/Coords and numerical ID
        var targetInfo = {};
        await HMEngine.getPlayerInfo(pseudo, targetInfo);
        Object.assign(HMState.Target, targetInfo);
        
        // 2. TARGET ACTIVATION: Fetch the specific attack page for this ID
        // This ensures the game session and security tokens (t) are synced for the CORRECT target.
        if (targetInfo.id) {
            HMLogger.info(`[Queue] Initializing attack session for ID: ${targetInfo.id}`);
            var attackUrl = `/ennemie.php?Attaquer=${targetInfo.id}&lieu=1`;
            var attackPageTxt = await window.HMAPI.get(attackUrl);
            var doc = new DOMParser().parseFromString(attackPageTxt, "text/html");
            
            // Sync Hidden Tokens (t, etc.) from the fresh attack page into the current DOM
            var freshForm = doc.querySelector("#formulaireChoixArmee");
            if (freshForm) {
                var currentForm = document.querySelector("#formulaireChoixArmee");
                if (currentForm) {
                    // CRITICAL: Update the form's action URL to point to the CORRECT target
                    var freshAction = freshForm.getAttribute("action");
                    if (freshAction) {
                        currentForm.setAttribute("action", freshAction);
                        HMLogger.info(`[Queue] Form action updated: ${freshAction}`);
                    }
                    
                    freshForm.querySelectorAll("input[type='hidden']").forEach(freshInp => {
                        var currentInp = currentForm.querySelector(`input[name='${freshInp.name}']`);
                        if (currentInp) {
                            currentInp.value = freshInp.value;
                        }
                    });
                }
            }
        } else {
            HMLogger.warn("[Queue] Target ID not found on profile. Falling back to pseudo-only targeting.");
        }

        // 3. SAFETY: Force lieu=1 on all synced hidden inputs and the DOM select
        // The fresh attack page could inject lieu=2 (Anthill) or lieu=3 (Nest).
        // This is the QUEUE-LEVEL interlock — FloodManager has its own as a second layer.
        var currentForm = document.querySelector("#formulaireChoixArmee");
        if (currentForm) {
            var lieuHidden = currentForm.querySelector("input[name='lieu']");
            if (lieuHidden && lieuHidden.value !== "1") {
                HMLogger.warn(`[Queue] SAFETY: Hidden lieu was "${lieuHidden.value}", forcing to "1" (HF)`);
                lieuHidden.value = "1";
            }
        }
        var lieuSelect = document.querySelector("select[name='lieu']");
        if (lieuSelect) {
            if (lieuSelect.value !== "1") {
                HMLogger.warn(`[Queue] SAFETY: DOM lieu select was "${lieuSelect.value}", forcing to "1" (HF)`);
            }
            lieuSelect.value = "1";
        }

        // 4. PROJECTED state sync
        HMState.User.hf = setup.yourHF;

        // 5. APPLY SETTINGS TO UI
        $("input[name=pseudoCible]").val(pseudo);
        $("#HM_SelType").val(setup.strategy);
        $("#HM_TargetHF").val(Utils.formatInt(HMState.Target.hf));
        $("#HM_YourHF").val(Utils.formatInt(setup.yourHF)); 

        if (setup.defense) {
            $("#HM_btnKeep").val(setup.defense.enabled ? "Yes" : "No");
            $("#HM_HFTroopsType").val(setup.defense.field.type);
            $("#HM_HFTroopsNb").val(setup.defense.field.nb);
            $("#HM_ATroops1Type").val(setup.defense.anthill1.type);
            $("#HM_ATroops1Nb").val(setup.defense.anthill1.nb);
            $("#HM_ATroops2Type").val(setup.defense.anthill2.type);
            $("#HM_ATroops2Nb").val(setup.defense.anthill2.nb);
        }

        // 6. RE-COMPUTE LOGISTICS & WAVES
        HMEngine.calculateLogistics();
        if (typeof FloodManager !== "undefined") {
            FloodManager.compute();
            HMLogger.info(`[Queue] Sequential Optimization Complete: ${HMState.Floods.filter(f=>f.launch).length} waves prepared.`);
        }

        // 7. FINAL ASSERTION: Abort if lieu is not 1 after all setup
        var finalLieu = document.querySelector("select[name='lieu']");
        if (finalLieu && finalLieu.value !== "1") {
            var msg = `[Queue] CRITICAL ABORT: lieu is "${finalLieu.value}" after setup. Refusing to launch.`;
            HMLogger.error(msg);
            HMToast.error("SAFETY: Attack destination is not Hunting Field. Queue aborted.");
            throw new Error(msg);
        }
    },

    // ________________________________________________________________________________________________
    // Data Fetching Helpers
    // ¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    
    /**
     * Fetch player coordinates from their profile page
     */
    fetchPlayerCoords: async function(playerName) {
        try {
            var html = await window.HMAPI.get("/Membre.php?Pseudo=" + encodeURIComponent(playerName));
            var text = html.replace(/<[^>]*>/g, ' '); // Strip HTML for easier regex
            
            // Patterns for French/English
            var match = text.match(/Location\s*:\s*x=(\d+)\s*et\s*y=(\d+)/i) || 
                        text.match(/x\s*=\s*(\d+).*y\s*=\s*(\d+)/i);
            
            if (match) {
                return { x: parseInt(match[1]), y: parseInt(match[2]) };
            }
            return null;
        } catch (e) { return null; }
    },

    /**
     * Get player's attack ID via search page
     */
    fetchPlayerAttackId: async function(playerName) {
        try {
            var html = await window.HMAPI.get("/ennemie.php?Rechercher&pseudoCible=" + encodeURIComponent(playerName));
            var match = html.match(/Attaquer=(\d+)/);
            return match ? match[1] : null;
        } catch (e) { return null; }
    },

    save: function() {
        try {
            HMStorage.save("FloodQueue", this.queue);
            HMLogger.info(`[Queue] Saved ${this.queue.length} items to storage`);
        } catch (e) { HMLogger.error("[Queue] Save failed: " + e.message); }
    },

    load: function() {
        try {
            var data = HMStorage.load("FloodQueue", []);
            // Safety: Ensure it's an array
            if (!Array.isArray(data)) {
                HMLogger.warn("[Queue] Storage data was not an array, resetting.");
                data = [];
            }
            this.queue = data;
            HMLogger.info(`[Queue] Loaded ${this.queue.length} items from storage`);
        } catch (e) {
            HMLogger.error("[Queue] Load failed: " + e.message);
            this.queue = [];
        }
    },
    
    nukeStorage: function(silent = false) {
        if (!silent) {
            if (!confirm("⚠️ This will DELETE all queue data from storage. Continue?")) return;
        }

        localStorage.removeItem("FloodQueue");
        localStorage.removeItem("HM_AllianceMembers");
        
        // ONLY reset in-memory if NOT silent (not part of a scrape)
        if (!silent) {
            this.queue = [];
            this.members = [];
            this.renderQueue();
            this.updateMemberDropdown();
            HMToast.success("Storage nuked - queue reset");
        } else {
            HMLogger.info("[Queue] Persistent storage cleared for fresh scrape");
        }
    }
};

// Global Exposure (Immediate)
window.QueueManager = QueueManager;
window.FloodQueueManager = QueueManager;
