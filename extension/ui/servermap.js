/**
 * ServerMap - In-Game Spatial Coordinate Map
 * 
 * Injects a "SERVER MAP" button into the sidebar (after Settings).
 * Opens an expandable modal with an interactive canvas scatter plot
 * of all known player coordinates.
 * 
 * Data sources:
 *   - Logged-in users: Daily Worker sync + locally harvested
 *   - Non-logged-in users: Locally harvested only
 * 
 * Coordinates are cached in localStorage. Sync occurs once per
 * French-time day (midnight Europe/Paris) to avoid rate limits.
 */

var ServerMap = {
    // localStorage keys
    SYNC_KEY: 'HM_ServerMap_Coords',
    LAST_SYNC_KEY: 'HM_ServerMap_LastSync',
    LOCAL_KEY: 'HM_ServerMap_Harvested',

    // State
    isOpen: false,
    isExpanded: false,
    canvas: null,
    ctx: null,
    coords: [],
    filteredCoords: [],
    alliances: [],

    // Hover state
    hoveredPlayer: null,

    // Filter state
    activeFilter: 'all', // 'all', 'tqc', 'pacts', 'wars'
    selectedAlliance: '',
    searchTerm: '',

    // Constants
    DOT_RADIUS: 5,
    DOT_RADIUS_HOVER: 8,

    // ===============================================================
    // INITIALIZATION
    // ===============================================================

    init: function() {
        var settingsPanel = document.getElementById("HM_SettingsPanel");
        
        if (!settingsPanel) {
            var anchor = document.getElementById("boiteComptePlus");
            if (!anchor) {
                setTimeout(this.init.bind(this), 1000);
                return;
            }
            if (!this._retryCount) this._retryCount = 0;
            if (this._retryCount < 20) {
                this._retryCount++;
                setTimeout(this.init.bind(this), 500);
                return;
            }
            if (typeof HMLogger !== "undefined") {
                HMLogger.debug("[ServerMap] Settings panel missing - map button skipped");
            }
            return;
        }

        if (document.getElementById("HM_ServerMapBtn")) return;

        // Create the sidebar button
        var btn = document.createElement("div");
        btn.id = "HM_ServerMapBtn";
        btn.className = "hm-servermap-btn hm-sidebar-below";
        btn.innerHTML = '<span class="hm-servermap-btn-text">SERVER MAP</span>' +
                         '<span class="hm-servermap-btn-count" id="HM_MapCount">0</span>';
        btn.onclick = this.toggle.bind(this);

        // Insert AFTER settings panel
        settingsPanel.parentNode.insertBefore(btn, settingsPanel.nextSibling);

        // Attempt daily sync
        this.syncIfNeeded();

        // Load data and update count badge
        this.loadCoords();

        if (typeof HMLogger !== "undefined") {
            HMLogger.debug("[ServerMap] Button initialized (" + this.coords.length + " coords cached)");
        }
    },

    // ===============================================================
    // DATA LAYER
    // ===============================================================

    loadCoords: function() {
        this.coords = this.getAllCoords();
        this.alliances = this.getUniqueAlliances();
        this.applyFilters();
        this.updateBadge();
    },

    getAllCoords: function() {
        var synced = [];
        var local = [];
        try { synced = JSON.parse(localStorage.getItem(this.SYNC_KEY) || '[]'); } catch(e) {}
        try { local = JSON.parse(localStorage.getItem(this.LOCAL_KEY) || '[]'); } catch(e) {}

        // Merge: synced (Worker pool) takes priority, local fills gaps
        var map = {};
        for (var i = 0; i < synced.length; i++) {
            var c = synced[i];
            if (c.name) map[c.name.toLowerCase()] = c;
        }
        for (var j = 0; j < local.length; j++) {
            var lc = local[j];
            if (lc.name && !map[lc.name.toLowerCase()]) {
                map[lc.name.toLowerCase()] = lc;
            }
        }
        return Object.values(map);
    },

    getUniqueAlliances: function() {
        var set = {};
        for (var i = 0; i < this.coords.length; i++) {
            var a = this.coords[i].alliance;
            if (a && a !== "None") set[a] = true;
        }
        return Object.keys(set).sort();
    },

    updateBadge: function() {
        var badge = document.getElementById("HM_MapCount");
        if (badge) badge.textContent = this.coords.length;
    },

    syncIfNeeded: async function() {
        if (typeof NetworkManager === "undefined" || !NetworkManager.isConnected) return;

        var lastSync = parseInt(localStorage.getItem(this.LAST_SYNC_KEY) || '0', 10);
        var now = new Date();

        // Calculate French midnight (00:00 Europe/Paris) for TODAY
        var parisStr = now.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
        var parisNow = new Date(parisStr);
        var parisMidnight = new Date(parisNow);
        parisMidnight.setHours(0, 0, 0, 0);

        // If last sync was before today's French midnight, pull fresh data
        if (lastSync < parisMidnight.getTime()) {
            if (typeof HMLogger !== "undefined") {
                HMLogger.info("[ServerMap] Daily sync triggered (last sync before French midnight)");
            }
            await this.pullFromWorker();
        }
    },

    pullFromWorker: async function() {
        if (typeof NetworkManager === "undefined" || !NetworkManager.isConnected) return;

        try {
            var coords = await NetworkManager.getCoords();
            if (coords && coords.length > 0) {
                localStorage.setItem(this.SYNC_KEY, JSON.stringify(coords));
                localStorage.setItem(this.LAST_SYNC_KEY, Date.now().toString());
                this.loadCoords();
                if (typeof HMLogger !== "undefined") {
                    HMLogger.info("[ServerMap] Synced " + coords.length + " coords from Worker");
                }
                if (this.isOpen) this.render();
            }
        } catch(e) {
            if (typeof HMLogger !== "undefined") {
                HMLogger.error("[ServerMap] Sync error: " + e.message);
            }
        }
    },

    // ===============================================================
    // FILTER LOGIC & UTILS
    // ===============================================================

    cleanTag: function(tag) {
        if (!tag) return "";
        return tag.replace(/[\[\]\s]/g, "").toUpperCase();
    },

    applyFilters: function() {
        var self = this;
        var diplomacy = this.getDiplomacy();
        
        this.filteredCoords = this.coords.filter(function(c) {
            var alliance = self.cleanTag(c.alliance);

            // 1. Quick Filters (ALL takes priority by skipping these)
            if (self.activeFilter === 'tqc') {
                if (alliance !== 'TQC' && alliance !== 'TQC-ACADEMY') return false;
            } else if (self.activeFilter !== 'all') {
                // Determine if this alliance belongs to the currently active filter category
                var currentAssignmentId = diplomacy.assignments[alliance];
                if (!currentAssignmentId || currentAssignmentId !== self.activeFilter) return false;
            }

            // 2. Specific alliance dropdown
            if (self.selectedAlliance && c.alliance !== self.selectedAlliance) return false;

            // 3. Player search
            if (self.searchTerm) {
                var term = self.searchTerm.toLowerCase();
                var nameMatch = c.name && c.name.toLowerCase().indexOf(term) !== -1;
                var allianceMatch = c.alliance && c.alliance.toLowerCase().indexOf(term) !== -1;
                if (!nameMatch && !allianceMatch) return false;
            }

            return true;
        });
    },

    getDiplomacy: function() {
        var defaultDiplo = { categories: [], assignments: {} };
        // 1. Try HM_OfficialDiplomacy (from Network)
        try {
            var official = JSON.parse(localStorage.getItem('HM_OfficialDiplomacy'));
            if (official && official.categories) {
                return official;
            }
        } catch(e) {}

        // Fallback to legacy
        try {
            var local = JSON.parse(localStorage.getItem('HM_Diplomacy') || '{}');
            var hwAssigns = {};
            (local.pacts || []).forEach(function(p) { hwAssigns[p.toUpperCase()] = 'pacts'; });
            (local.wars || []).forEach(function(w) { hwAssigns[w.toUpperCase()] = 'wars'; });
            return {
                categories: [
                    { id: 'pacts', name: 'Pacts', color: '#10cc70' },
                    { id: 'wars', name: 'Wars', color: '#ff4444' }
                ],
                assignments: hwAssigns
            };
        } catch(e) {}

        return defaultDiplo;
    },

    getAllianceColor: function(alliance) {
        if (!alliance || alliance === "None") return "#888888";
        var clean = this.cleanTag(alliance);
        if (clean === "TQC" || clean === "TQC-ACADEMY") return "#4488ff";
        
        var diplo = this.getDiplomacy();
        var categoryId = diplo.assignments[clean];
        if (categoryId) {
            for (var i=0; i<diplo.categories.length; i++) {
                if (diplo.categories[i].id === categoryId) {
                    return diplo.categories[i].color;
                }
            }
        }

        // Hash-based color for unknown alliances
        var hash = 0;
        for (var i = 0; i < alliance.length; i++) {
            hash = alliance.charCodeAt(i) + ((hash << 5) - hash);
        }
        var hue = Math.abs(hash) % 360;
        return "hsl(" + hue + ", 65%, 50%)";
    },

    // ===============================================================
    // TOGGLE & MODAL
    // ===============================================================

    toggle: function() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    },

    open: async function() {
        if (document.getElementById("HM_ServerMapModal")) return;

        this.isOpen = true;
        this.loadCoords();

        // Async fetch official diplomacy if NetworkManager exists
        if (typeof NetworkManager !== "undefined" && NetworkManager.getOfficialDiplomacy) {
            try {
                var official = await NetworkManager.getOfficialDiplomacy();
                if (official && official.categories) {
                    localStorage.setItem("HM_OfficialDiplomacy", JSON.stringify(official));
                }
            } catch(e) {}
        }

        var overlay = document.createElement("div");
        overlay.id = "HM_ServerMapModal";
        overlay.className = "hm-servermap-overlay";
        overlay.innerHTML = this.buildModalHTML();
        document.body.appendChild(overlay);

        // Initialize container
        this.resizeContainer();

        // Attach events
        this.attachModalEvents(overlay);

        // Populate alliance dropdown
        this.populateAllianceDropdown();

        // Initial render
        this.render();
    },

    close: function() {
        this.isOpen = false;
        this.isExpanded = false;
        this.hoveredPlayer = null;
        var modal = document.getElementById("HM_ServerMapModal");
        if (modal) modal.remove();
        document.body.style.overflow = '';
    },

    buildModalHTML: function() {
        var diplo = this.getDiplomacy();
        
        var legendHTML = '<span class="hm-legend-item"><span class="hm-legend-dot" style="background:#4488ff;"></span>TQC</span>';
        var filtersHTML = '<button class="hm-servermap-filter-btn active" data-filter="all">ALL</button>' +
                          '<button class="hm-servermap-filter-btn filter-tqc" data-filter="tqc" style="color: #4488ff; border-color: rgba(68,136,255,0.4);">TQC</button>';

        if (diplo && diplo.categories) {
            diplo.categories.forEach(function(c) {
                legendHTML += '<span class="hm-legend-item"><span class="hm-legend-dot" style="background:'+c.color+';"></span>'+c.name+'</span>';
                filtersHTML += '<button class="hm-servermap-filter-btn" data-filter="'+c.id+'" style="color: '+c.color+'; border-color: rgba('+(parseInt(c.color.slice(1,3), 16))+','+(parseInt(c.color.slice(3,5), 16))+','+(parseInt(c.color.slice(5,7), 16))+',0.4);">'+c.name.toUpperCase()+'</button>';
            });
        }
        legendHTML += '<span class="hm-legend-item"><span class="hm-legend-dot" style="background:#888;"></span>Other</span>';

        return '<div class="hm-servermap-modal' + (this.isExpanded ? ' expanded' : '') + '" id="HM_MapModalInner">' +
            // Header
            '<div class="hm-servermap-header">' +
                '<div class="hm-servermap-title">SERVER MAP</div>' +
                '<div class="hm-servermap-legend" id="HM_MapLegend" style="position:static; background:none; border:none; padding:0; flex:1; justify-content:center;">' +
                    legendHTML +
                '</div>' +
                '<div class="hm-servermap-header-actions">' +
                    '<button id="HM_MapExpand" class="hm-servermap-btn-action" title="Expand">⛶</button>' +
                    '<button id="HM_MapClose" class="hm-servermap-btn-action" title="Close">✕</button>' +
                '</div>' +
            '</div>' +
            // Filter bar
            '<div class="hm-servermap-filters">' +
                '<div class="hm-servermap-quickfilters">' +
                    filtersHTML +
                '</div>' +
                '<div class="hm-servermap-filter-row">' +
                    '<input type="text" id="HM_MapSearch" class="hm-servermap-search" placeholder="Search player..." autocomplete="off">' +
                    '<select id="HM_MapAllianceFilter" class="hm-servermap-alliance-select">' +
                        '<option value="">All Alliances</option>' +
                    '</select>' +
                '</div>' +
                '<div class="hm-servermap-dist-calc">' +
                    '<span>DIST:</span>' +
                    '<div class="hm-autocomplete-wrap">' +
                        '<input type="text" id="HM_DistOrigin" placeholder="Origin" class="hm-servermap-input-dist" autocomplete="off">' +
                        '<div id="HM_OriginDropdown" class="hm-autocomplete-dropdown hm-hidden"></div>' +
                    '</div>' +
                    '<span>→</span>' +
                    '<div class="hm-autocomplete-wrap">' +
                        '<input type="text" id="HM_DistTarget" placeholder="Target" class="hm-servermap-input-dist" autocomplete="off">' +
                        '<div id="HM_TargetDropdown" class="hm-autocomplete-dropdown hm-hidden"></div>' +
                    '</div>' +
                    '<span>@<span style="font-size:0.85em; opacity:0.5; margin-right:2px;">SPD</span><input type="number" id="HM_DistSpeed" value="20" class="hm-servermap-input-spd"></span>' +
                    '<span>= <strong id="HM_DistResult">--</strong></span>' +
                '</div>' +
            '</div>' +
            // Chain Container
            '<div class="hm-servermap-canvas-wrap" id="HM_MapCanvasWrap">' +
                '<div class="hm-chain-container" id="HM_MapChainContainer"></div>' +
                '<div class="hm-servermap-status" id="HM_MapStatus">' +
                    '<span id="HM_MapPlayerCount">' + this.filteredCoords.length + ' players (Visible)</span>' +
                    '<span id="HM_MapCoordDisplay" style="color:var(--hm-accent); font-weight:700;"></span>' +
                '</div>' +
            '</div>' +
            // Info panel (shown on click)
            '<div class="hm-servermap-info" id="HM_MapInfo" style="display:none;">' +
                '<div id="HM_MapInfoContent"></div>' +
            '</div>' +
        '</div>';
    },

    populateAllianceDropdown: function() {
        var select = document.getElementById("HM_MapAllianceFilter");
        if (select) {
            select.innerHTML = '<option value="">All Alliances</option>';
            for (var i = 0; i < this.alliances.length; i++) {
                var opt = document.createElement("option");
                opt.value = this.alliances[i];
                opt.textContent = this.alliances[i];
                select.appendChild(opt);
            }
        }
    },

    // ===============================================================
    // EVENTS
    // ===============================================================

    attachModalEvents: function(overlay) {
        var self = this;

        // Close
        document.getElementById("HM_MapClose").onclick = function() { self.close(); };
        overlay.onclick = function(e) {
            if (e.target === overlay) self.close();
        };

        // Expand
        document.getElementById("HM_MapExpand").onclick = function() {
            self.isExpanded = !self.isExpanded;
            var inner = document.getElementById("HM_MapModalInner");
            if (inner) inner.classList.toggle("expanded", self.isExpanded);
            document.body.style.overflow = self.isExpanded ? 'hidden' : '';
            setTimeout(function() {
                self.resizeContainer();
            }, 100);
        };

        // Quick filters
        var filterBtns = overlay.querySelectorAll(".hm-servermap-filter-btn");
        for (var i = 0; i < filterBtns.length; i++) {
            filterBtns[i].onclick = function(e) {
                var btn = e.currentTarget;
                for (var j = 0; j < filterBtns.length; j++) filterBtns[j].classList.remove("active");
                btn.classList.add("active");
                self.activeFilter = btn.dataset.filter;
                self.applyFilters();
                self.updateVisibility();
            };
        }

        // Alliance dropdown
        document.getElementById("HM_MapAllianceFilter").onchange = function(e) {
            self.selectedAlliance = e.target.value;
            self.applyFilters();
            self.updateVisibility();
        };

        // Search
        var searchTimeout = null;
        document.getElementById("HM_MapSearch").oninput = function(e) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() {
                self.searchTerm = e.target.value;
                self.applyFilters();
                self.updateVisibility();
            }, 200);
        };

        // ETA Math
        var calcETA = function(x1, y1, x2, y2, velocity) {
            var dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            return Math.ceil(Math.pow(0.9, velocity) * 637200 * (1 - Math.exp(-(dist / 350)))) * 1000;
        };

        var formatETA = function(ms) {
            if (isNaN(ms) || ms === null) return '--';
            var totalMins = Math.round(ms / 60000);
            if (totalMins < 1) return "<1m";
            if (totalMins < 60) return totalMins + "m";
            var h = Math.floor(totalMins / 60), m = totalMins % 60;
            return m === 0 ? h + "h" : h + "h " + String(m).padStart(2,'0') + "m";
        };

        // Distance Calculator
        var calcDist = function() {
            var n1 = document.getElementById("HM_DistOrigin").value.toLowerCase();
            var n2 = document.getElementById("HM_DistTarget").value.toLowerCase();
            var spd = parseInt(document.getElementById("HM_DistSpeed").value, 10) || 20;
            var res = document.getElementById("HM_DistResult");
            if (!n1 || !n2 || n1 === n2) {
                res.innerHTML = '--';
                return;
            }
            var p1 = self.coords.find(function(c) { return c.name.toLowerCase() === n1; });
            var p2 = self.coords.find(function(c) { return c.name.toLowerCase() === n2; });
            if (p1 && p2) {
                var dx = (p2.x || 0) - (p1.x || 0);
                var dy = (p2.y || 0) - (p1.y || 0);
                var dist = Math.sqrt(dx*dx + dy*dy);
                var ms = calcETA(p1.x || 0, p1.y || 0, p2.x || 0, p2.y || 0, spd);
                res.innerHTML = Math.round(dist) + ' <span style="font-size:0.85em; opacity:0.75; font-weight:normal; margin-left:4px;">(ETA ' + formatETA(ms) + ')</span>';
            } else {
                res.innerHTML = '???';
            }
        };
        document.getElementById("HM_DistOrigin").oninput = calcDist;
        document.getElementById("HM_DistTarget").oninput = calcDist;
        document.getElementById("HM_DistSpeed").oninput = calcDist;

        // Custom Autocomplete
        var setupAutocomplete = function(inputId, dropdownId) {
            var input = document.getElementById(inputId);
            var dropdown = document.getElementById(dropdownId);
            if (!input || !dropdown) return;
            var renderList = function(term) {
                dropdown.innerHTML = '';
                if (!term) { dropdown.classList.add('hm-hidden'); return; }
                var matches = self.coords.filter(function(p) { return p.name.toLowerCase().indexOf(term.toLowerCase()) > -1; }).slice(0, 5);
                if (matches.length === 0) { dropdown.classList.add('hm-hidden'); return; }
                dropdown.classList.remove('hm-hidden');
                matches.forEach(function(p) {
                    var div = document.createElement('div');
                    div.className = 'hm-autocomplete-item';
                    div.innerHTML = '<strong style="color:#fff;">' + self.escapeHtml(p.name) + '</strong> <span style="color:#aaa; font-size:9px;">[' + self.escapeHtml(p.alliance || 'None') + ']</span>';
                    div.onclick = function() {
                        input.value = p.name;
                        dropdown.classList.add('hm-hidden');
                        calcDist();
                    };
                    dropdown.appendChild(div);
                });
            };
            input.addEventListener('input', function(e) { renderList(e.target.value); });
            input.addEventListener('focus', function(e) { renderList(e.target.value); });
            // Close when clicking outside
            document.addEventListener('click', function(e) {
                if (e.target !== input && e.target !== dropdown && !dropdown.contains(e.target)) {
                    dropdown.classList.add('hm-hidden');
                }
            });
        };

        setupAutocomplete('HM_DistOrigin', 'HM_OriginDropdown');
        setupAutocomplete('HM_DistTarget', 'HM_TargetDropdown');

        // No canvas events in HyperChain mode

        // ESC key
        this._escHandler = function(e) {
            if (e.key === 'Escape') self.close();
        };
        document.addEventListener('keydown', this._escHandler);

        // Cleanup on close
        var origClose = this.close.bind(this);
        this.close = function() {
            document.removeEventListener('keydown', self._escHandler);
            self.close = origClose;
            origClose();
        };
    },

    // ===============================================================
    // DOM RENDERING
    // ===============================================================

    resizeContainer: function() {
        var wrap = document.getElementById("HM_MapCanvasWrap");
        if (!wrap) return;
        var rect = wrap.getBoundingClientRect();
        wrap.style.height = rect.height + 'px';
    },

    hashString: function(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return Math.abs(hash);
    },

    render: function() {
        var container = document.getElementById("HM_MapChainContainer");
        if (!container || this.coords.length === 0) return;
        container.innerHTML = ""; // Clear existing

        // Math prep (Y-Axis)
        var ys = this.coords.map(function(c) { return c.y || 0; });
        var minY = Math.min.apply(null, ys);
        var maxY = Math.max.apply(null, ys);

        // Math prep (X-Axis Mapping for geographical precision)
        var xs = this.coords.map(function(c) { return c.x || 0; });
        var minX = Math.min.apply(null, xs);
        var maxX = Math.max.apply(null, xs);
        var rangeX = (maxX - minX) || 1;

        // HyperChain splits the map into blocks of 500 units vertically.
        var BLOCK_SIZE = 500;
        var startBlock = Math.floor(minY / BLOCK_SIZE);
        var endBlock = Math.floor(maxY / BLOCK_SIZE);

        var blockFragments = {};

        for (var idx = startBlock; idx <= endBlock; idx++) {
            var blockDiv = document.createElement("div");
            blockDiv.className = "hm-chain-block";
            
            var label = document.createElement("div");
            label.className = "hm-chain-block-number";
            label.textContent = (idx - startBlock + 1).toString();
            blockDiv.appendChild(label);
            
            blockFragments[idx] = blockDiv;
            container.appendChild(blockDiv);
        }

        // We plot `coords`, not `filteredCoords`, because filtering will just toggle classes
        for (var i = 0; i < this.coords.length; i++) {
            var c = this.coords[i];
            var yVal = c.y || 0;
            var blockIdx = Math.floor(yVal / BLOCK_SIZE);
            var parent = blockFragments[blockIdx];
            if (!parent) continue;

            // X-axis mapping within the block (0 to 100%) - Horizontal spread based on Y
            var relativeY = (yVal - (blockIdx * BLOCK_SIZE)) / BLOCK_SIZE;
            var leftPct = Math.max(2, Math.min(98, relativeY * 100));

            // True Y-axis positioning inside the block (using geographical X value!)
            // We map X to the vertical spectrum (10% to 85%) inside the chain band row
            var xVal = c.x || 0;
            var xPct = ((xVal - minX) / rangeX);
            var topPct = 10 + (xPct * 75); // 10% to 85%
            
            var node = document.createElement("div");
            node.className = "hm-player-node";
            node.dataset.name = c.name;
            node.style.left = leftPct + "%";
            node.style.top = topPct + "%";
            node.style.backgroundColor = this.getAllianceColor(c.alliance);
            
            // Interaction logic
            (function(playerNode, playerData) {
                playerNode.onclick = function() {
                    ServerMap.showPlayerInfo(playerData);
                };
                playerNode.onmouseenter = function() {
                    var el = document.getElementById("HM_MapCoordDisplay");
                    if (el) el.textContent = " — " + playerData.name + " (" + playerData.x + "," + playerData.y + ")";
                };
                playerNode.onmouseleave = function() {
                    var el = document.getElementById("HM_MapCoordDisplay");
                    if (el) el.textContent = "";
                };
            })(node, c);

            var nameLabel = document.createElement("div");
            nameLabel.className = "hm-player-label";
            nameLabel.textContent = c.name;
            node.appendChild(nameLabel);

            parent.appendChild(node);
        }

        this.applyFilters();
        this.updateVisibility();
    },

    updateVisibility: function() {
        var nodes = document.querySelectorAll(".hm-player-node");
        var visibleCount = 0;
        
        // Convert filteredCoords into a fast lookup map
        var visibleNames = {};
        for (var i = 0; i < this.filteredCoords.length; i++) {
            visibleNames[this.filteredCoords[i].name] = true;
        }

        for (var j = 0; j < nodes.length; j++) {
            var node = nodes[j];
            var name = node.dataset.name;
            if (visibleNames[name]) {
                node.classList.remove("hm-hidden");
                visibleCount++;
            } else {
                node.classList.add("hm-hidden");
            }
        }
        
        var el = document.getElementById("HM_MapPlayerCount");
        if (el) el.textContent = visibleCount + " players (Visible)";

        // User feedback for empty filters
        if (visibleCount === 0 && this.coords.length > 0 && this.activeFilter !== 'all') {
            if (typeof HMToast !== "undefined") {
                HMToast.info("No players match the " + this.activeFilter.toUpperCase() + " filter.");
            }
        }
    },

    // ===============================================================
    // PLAYER INFO PANEL
    // ===============================================================

    showPlayerInfo: function(player) {
        var infoPanel = document.getElementById("HM_MapInfo");
        var content = document.getElementById("HM_MapInfoContent");
        if (!infoPanel || !content) return;

        var color = this.getAllianceColor(player.alliance);
        var profileUrl = "Membre.php?Pseudo=" + encodeURIComponent(player.name);
        content.innerHTML =
            '<div class="hm-servermap-info-header">' +
                '<a href="' + profileUrl + '" target="_blank" style="color:' + color + '; font-weight:700; text-decoration:none;">' + this.escapeHtml(player.name) + '</a>' +
                '<span style="color:var(--hm-muted); font-size:0.85em;">[' + this.escapeHtml(player.alliance || 'None') + ']</span>' +
            '</div>' +
            '<div class="hm-servermap-info-coords">' +
                '<span>HQ: ' + (player.x || 0) + ', ' + (player.y || 0) + '</span>' +
            '</div>';

        infoPanel.style.display = 'block';
    },

    // ===============================================================
    // UTILITIES
    // ===============================================================

    updateStatusBar: function() {
        var el = document.getElementById("HM_MapPlayerCount");
        if (el) el.textContent = this.filteredCoords.length + ' players';
    },

    escapeHtml: function(text) {
        if (!text) return "";
        var div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
};
