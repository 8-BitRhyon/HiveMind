/**
 * Realm Graph - Obsidian-style Spatial Map (admin/js/realm.js)
 * Enhancements: Custom Autocomplete, Tactical Sidebar, Alliance Filtering, Copy/Paste
 */

window.RealmGraph = {
    network: null,
    nodes: new vis.DataSet([]),
    edges: new vis.DataSet([]),
    playerCoords: [],
    currentSourceId: null,
    currentTargetId: null,
    _themeColors: null,
    
    _getTheme: function() {
        if (!this._themeColors) {
            const cs = getComputedStyle(document.documentElement);
            this._themeColors = {
                fontColor: cs.getPropertyValue('--text-secondary').trim() || '#5c4a3a',
                bgDark: cs.getPropertyValue('--bg-dark').trim() || '#f0e6d6',
                accent: cs.getPropertyValue('--accent').trim() || '#c75c3a',
                border: cs.getPropertyValue('--border').trim() || '#c4b8a8',
                muted: cs.getPropertyValue('--text-muted').trim() || '#806c59'
            };
        }
        return this._themeColors;
    },
    
    init: function() {
        const container = document.getElementById('realmMap');
        if (!container) return;

        const data = { nodes: this.nodes, edges: this.edges };
        
        // Read CSS variables from the active theme
        const t = this._getTheme();
        const fontColor = t.fontColor;
        const bgDark = t.bgDark;
        const accentColor = t.accent;
        const borderColor = t.border;
        const mutedColor = t.muted;

        const options = {
            nodes: {
                shape: 'dot',
                size: 14,
                font: { 
                    size: 13, 
                    color: fontColor, 
                    strokeWidth: 2, 
                    strokeColor: bgDark, 
                    face: "'IBM Plex Mono', 'Courier New', monospace"
                },

                borderWidth: 1.5,
                borderWidthSelected: 3,
                shadow: { enabled: true, color: 'rgba(0,0,0,0.15)', size: 6, x: 2, y: 2 }
            },
            configure: { enabled: false },
            edges: {
                width: 1.5,
                color: { color: borderColor + '66', highlight: accentColor, hover: borderColor + '99' },
                smooth: { type: 'dynamic' },
                font: { 
                    size: 10, 
                    color: accentColor, 
                    strokeWidth: 0, 
                    align: 'middle',
                    face: "'IBM Plex Mono', 'Courier New', monospace"
                },
                selectionWidth: 2
            },

            physics: {
                enabled: true,
                barnesHut: { gravitationalConstant: -8000, centralGravity: 0.3, springLength: 180, springConstant: 0.04, damping: 0.09, avoidOverlap: 0.5 },
                maxVelocity: 80, minVelocity: 0.1, solver: 'barnesHut', timestep: 0.4,
                stabilization: { enabled: true, iterations: 300, updateInterval: 25, fit: true }
            },
            interaction: { hover: true, tooltipDelay: 100, hideEdgesOnDrag: true, navigationButtons: false, keyboard: { enabled: true, bindToWindow: false } },
            layout: { improvedLayout: true }
        };

        this.network = new vis.Network(container, data, options);

        this._fixCanvasDPR = () => {
            const c = container.querySelector('canvas');
            if (!c) return;
            const cs2 = getComputedStyle(document.documentElement);
            c.style.background = cs2.getPropertyValue('--bg-dark').trim() || '#f0e6d6';
            const w = container.clientWidth, h = container.clientHeight;
            if (w > 0 && h > 0) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
        };
        this._fixCanvasDPR();
        
        const resizeObserver = new ResizeObserver(() => {
            if (container.clientWidth > 0 && container.clientHeight > 0) {
                if (this.network) {
                    this.network.setSize('100%', '100%');
                    this.network.redraw();
                    if (this._fixCanvasDPR) this._fixCanvasDPR();
                }
            }
        });
        resizeObserver.observe(container);


        this.network.on("stabilizationIterationsDone", () => {
            if (this.network) {
                this.network.setSize('100%', '100%');
                this.network.fit({ animation: { duration: 600, easingFunction: "easeInOutQuad" } });
                this.network.setOptions({ physics: { enabled: false } });
                if (this._fixCanvasDPR) this._fixCanvasDPR();
            }
        });


        this.network.on("afterDrawing", () => { if (this._fixCanvasDPR) this._fixCanvasDPR(); });

        this.network.on("click", (params) => {
            if (params.nodes.length > 0) {
                const id = params.nodes[0];
                this.network.selectNodes([id]);
                this.network.focus(id, { scale: 1.4, animation: { duration: 500 } });
                this.handleNodeClick(id);
            } else {
                this.closeSidebar();
            }
        });

        // UI Listeners
        document.getElementById('realmSpeed')?.addEventListener('input', (e) => {
            document.getElementById('realmSpeedVal_label').textContent = `SPD: ${e.target.value}`;
            this.updateTacticalPath();
            if (this.currentSelectedNodeId) this.handleNodeClick(this.currentSelectedNodeId);
        });

        this.setupAutocomplete('etaFrom', 'etaFromDropdown', (name) => {
            this.currentSourceId = name.toLowerCase();
            this.updateTacticalPath();
        });
        this.setupAutocomplete('etaTo', 'etaToDropdown', (name) => {
            this.currentTargetId = name.toLowerCase();
            this.updateTacticalPath();
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.autocomplete-wrapper')) {
                document.querySelectorAll('.autocomplete-dropdown').forEach(el => el.classList.add('hidden'));
            }
        });

        document.getElementById('clearPathBtn')?.addEventListener('click', () => {
            this.currentSourceId = null;
            this.currentTargetId = null;
            const fromInput = document.getElementById('etaFrom');
            if (fromInput) fromInput.value = '';
            const toInput = document.getElementById('etaTo');
            if (toInput) toInput.value = '';
            this.updateTacticalPath();
        });

        document.getElementById('realmMaximize')?.addEventListener('click', () => this.toggleFullscreen());
        
        // Sidebar Listeners
        document.getElementById('closeSidebar')?.addEventListener('click', () => this.closeSidebar());
        document.getElementById('sidebarAllianceFilter')?.addEventListener('change', () => {
            if (this.currentSelectedNodeId) this.handleNodeClick(this.currentSelectedNodeId);
        });
        
        document.getElementById('sidebarCopyETA')?.addEventListener('click', (e) => {
            const sidebarETA = document.getElementById('sidebarNearestETA');
            const eta = sidebarETA ? (sidebarETA.dataset.eta || sidebarETA.textContent.split('\n').pop().trim()) : '';
            if (eta && eta !== '--') {
                navigator.clipboard.writeText(eta).then(() => {
                    const btn = e.currentTarget;
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = `<span style="color:var(--success); font-family:var(--font-pixel); font-size:0.85em;">Copied!</span>`;
                    setTimeout(() => btn.innerHTML = originalHtml, 1500);
                });
            }
        });
    },

    setupAutocomplete: function(inputId, dropdownId, onSelectCallback = null) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        if (!input || !dropdown) return;

        let activeIndex = -1;

        const renderList = (term) => {
            dropdown.innerHTML = '';
            if (!term) { dropdown.classList.add('hidden'); return; }
            const matches = this.playerCoords.filter(p => p.name.toLowerCase().includes(term.toLowerCase())).slice(0, 15);
            if (matches.length === 0) { dropdown.classList.add('hidden'); return; }
            dropdown.classList.remove('hidden');
            activeIndex = -1;
            matches.forEach((p, i) => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerHTML = `
                    <span style="color:var(--accent-glow); font-weight:600;">${p.name}</span>
                    <span style="color:var(--text-muted); font-size:0.75rem; float:right;">[${p.alliance || 'None'}]</span>
                `;
                div.addEventListener('click', () => {
                    input.value = p.name;
                    dropdown.classList.add('hidden');
                    if (onSelectCallback) onSelectCallback(p.name);
                });
                dropdown.appendChild(div);
            });

        };

        input.addEventListener('input', (e) => renderList(e.target.value));
        input.addEventListener('focus', (e) => renderList(e.target.value));
        input.addEventListener('keydown', (e) => {
            const items = dropdown.querySelectorAll('.autocomplete-item');
            if (dropdown.classList.contains('hidden') || items.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = (activeIndex + 1) % items.length; }
            else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = (activeIndex - 1 + items.length) % items.length; }
            else if (e.key === 'Enter') { e.preventDefault(); if (activeIndex >= 0) items[activeIndex].click(); else items[0].click(); }
            items.forEach((item, index) => {
                item.classList.toggle('active', index === activeIndex);
                if (index === activeIndex) item.scrollIntoView({ block: 'nearest' });
            });
        });
    },

    updateTacticalPath: function() {
        const fromInput = document.getElementById('etaFrom');
        const toInput = document.getElementById('etaTo');
        const resultEl = document.getElementById('etaResult');
        if (!resultEl) return;

        const sourceNode = this.nodes.get(this.currentSourceId || '');
        const targetNode = this.nodes.get(this.currentTargetId || '');

        if (fromInput) fromInput.value = sourceNode ? sourceNode.label : (this.currentSourceId || '');
        if (toInput) toInput.value = targetNode ? targetNode.label : (this.currentTargetId || '');

        this._drawTacticalEdge();

        if (!sourceNode || !targetNode) {
            resultEl.textContent = '--';
            return;
        }

        const velocity = parseInt(document.getElementById('realmSpeed').value, 10) || 20;
        const ms = this.calculateETA(sourceNode.x_coord, sourceNode.y_coord, targetNode.x_coord, targetNode.y_coord, velocity);
        const flightTime = this.formatFlight(ms);
        resultEl.textContent = flightTime;

        // Sync with Sidebar if active
        const sidebarETA = document.getElementById('sidebarNearestETA');
        if (sidebarETA && document.getElementById('realmSidebar')?.classList.contains('active')) {
            sidebarETA.dataset.eta = flightTime;
            sidebarETA.innerHTML = `<span style="font-size:0.65em; color:var(--text-muted); display:block; text-transform:uppercase; letter-spacing:1px;">Objective Path</span> ${flightTime}`;
        }
    },

    _drawTacticalEdge: function() {
        // Find existing tactical path and remove it
        const existingPath = this.edges.get('tactical-path');
        if (existingPath) this.edges.remove('tactical-path');

        // Reset previous waypoint styles
        this._resetWaypointStyles();

        if (this.currentSourceId && this.currentTargetId && this.currentSourceId !== this.currentTargetId) {
            const s = this.nodes.get(this.currentSourceId);
            const t = this.nodes.get(this.currentTargetId);
            if (s && t) {
                const velocity = parseInt(document.getElementById('realmSpeed').value, 10) || 20;
                const ms = this.calculateETA(s.x_coord, s.y_coord, t.x_coord, t.y_coord, velocity);
                
                // Add tactical path edge
                this.edges.add({
                    id: 'tactical-path',
                    from: this.currentSourceId,
                    to: this.currentTargetId,
                    label: this.formatFlight(ms),
                    font: { size: 11, color: '#c75c3a', strokeWidth: 3, strokeColor: 'rgba(255,255,255,0.8)', face: 'monospace', align: 'top', weight: 'bold' },
                    color: { color: '#c75c3a', opacity: 1 },
                    width: 3,
                    dashes: [6, 4],
                    shadow: { enabled: true, color: 'rgba(199,92,58,0.5)', size: 10 },
                    smooth: { type: 'curvedCW', roundness: 0.2 } // Subtle curve for tactical feel
                });

                // Highlight Waypoints
                this.nodes.update({ id: this.currentSourceId, shadow: { enabled: true, color: 'rgba(199,92,58,0.5)', size: 12 } });
                this.nodes.update({ id: this.currentTargetId, shadow: { enabled: true, color: 'rgba(199,92,58,0.5)', size: 12 } });
            }
        }
    },

    _resetWaypointStyles: function() {
        // Simple way to reset shadow for all nodes without deep cloning
        const allNodes = this.nodes.get();
        const updates = allNodes.filter(n => n.shadow && n.shadow.color === 'rgba(199,92,58,0.5)').map(n => ({
            id: n.id,
            shadow: { enabled: true, color: 'rgba(0,0,0,0.15)', size: 6, x: 2, y: 2 }
        }));
        if (updates.length > 0) this.nodes.update(updates);
    },

    toggleFullscreen: function() {
        const wrapper = document.querySelector('.realm-container-wrapper');
        if (!wrapper) return;
        const isFullscreen = wrapper.classList.toggle('fullscreen');
        document.body.style.overflow = isFullscreen ? 'hidden' : '';
        if (this.network) {
            setTimeout(() => {
                this.network.setSize('100%', '100%');
                if (this._fixCanvasDPR) this._fixCanvasDPR();
                this.network.redraw();
                if (isFullscreen) this.network.fit({ animation: { duration: 600 } });
            }, 100);
        }
    },

    loadData: async function() {
        try {
            const headers = { "Authorization": `Bearer ${window.State.adminSession.token}` };
            const resp = await fetch(`${window.State.WORKER_URL}/admin/players/coords`, { headers });
            if (!resp.ok) return;

            this.playerCoords = await resp.json();
            
            const alliances = [...new Set(this.playerCoords.map(p => p.alliance).filter(Boolean))].sort();
            const filterEl = document.getElementById('sidebarAllianceFilter');
            if (filterEl) {
                const cur = filterEl.value;
                filterEl.innerHTML = '<option value="ALL">All Alliances</option>';
                alliances.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a; opt.textContent = a;
                    filterEl.appendChild(opt);
                });
                if ([...filterEl.options].some(o => o.value === cur)) filterEl.value = cur;
            }

            this.render();
        } catch (e) { console.error("[Realm] Failed to load coords:", e); }
    },

    render: function() {
        if (this.network) this.network.setOptions({ physics: { enabled: true } });

        const xs = this.playerCoords.map(p => p.x).filter(v => !isNaN(v));
        const ys = this.playerCoords.map(p => p.y).filter(v => !isNaN(v));
        const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
        const xRange = (xMax - xMin) || 1, yRange = (yMax - yMin) || 1;
        const SPREAD = 1400; 

        const newNodes = this.playerCoords.map(p => {
            const color = this.getAllianceAura(p.alliance || "None");
            return {
                id: p.name.toLowerCase(),
                label: p.name,
                alliance: p.alliance || 'None',
                x: ((p.x - xMin) / xRange - 0.5) * SPREAD,
                y: ((p.y - yMin) / yRange - 0.5) * SPREAD,
                x_coord: p.x, y_coord: p.y,
                color: { background: color, border: this._darken(color), highlight: { background: color, border: 'var(--accent)' }, hover: { background: color, border: 'var(--border-dark)' } }
            };
        });

        this.nodes.clear();
        this.nodes.add(newNodes);
    },

    _darken: function(color) {
        if (color.startsWith('hsl')) return color.replace(/(\d+)%\)/, (m, l) => `${Math.max(0, parseInt(l) - 20)}%)`);
        return color;
    },

    getAllianceAura: function(allianceName) {
        if (!allianceName || allianceName === "None") return "#777777";
        const d = window.State.diplomacyData || { categories: [], assignments: {} };
        const tag = allianceName.toUpperCase();
        
        // Own alliance special case (if not explicitly assigned)
        if (tag === "TQC" && !d.assignments[tag]) return "#4488ff";

        // Check new dynamic assignments
        const assignmentId = d.assignments[tag];
        if (assignmentId && d.categories) {
            const cat = d.categories.find(c => c.id === assignmentId);
            if (cat) return cat.color;
        }

        // Fallback to legacy structure just in case (transitional)
        if (d.pacts && d.pacts.includes(allianceName)) return "#10cc70";
        if (d.wars && d.wars.includes(allianceName)) return "#ff4444";

        // Random hash for others
        let hash = 0;
        for (let i = 0; i < allianceName.length; i++) hash = allianceName.charCodeAt(i) + ((hash << 5) - hash);
        return `hsl(${Math.abs(hash) % 360}, 65%, 50%)`;
    },

    calculateETA: function(x1, y1, x2, y2, velocity) {
        const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        return Math.ceil(Math.pow(0.9, velocity) * 637200 * (1 - Math.exp(-(dist / 350)))) * 1000;
    },

    formatFlight: function(ms) {
        if (isNaN(ms) || ms === null) return '--';
        const totalMins = Math.round(ms / 60000);
        if (totalMins < 1) return "<1m";
        if (totalMins < 60) return `${totalMins}m`;
        const h = Math.floor(totalMins / 60), m = totalMins % 60;
        return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2,'0')}m`;
    },

    closeSidebar: function() {
        document.getElementById('realmSidebar')?.classList.remove('active');
        const overlay = document.getElementById('realmOverlay');
        if (overlay) overlay.style.display = 'none';
        this.currentSelectedNodeId = null;
        this.edges.clear();
        this._drawTacticalEdge(); // Restore path if hidden by nearest edges
    },

    handleNodeClick: function(nodeId) {
        const activeNode = this.nodes.get(nodeId);
        if (!activeNode) return;
        
        this.currentSelectedNodeId = nodeId;

        const velocity = parseInt(document.getElementById('realmSpeed').value, 10) || 20;
        const allianceFilter = document.getElementById('sidebarAllianceFilter')?.value || "ALL";

        let otherNodes = this.nodes.get({ filter: (n) => n.id !== nodeId });
        if (allianceFilter !== "ALL") otherNodes = otherNodes.filter(n => n.alliance === allianceFilter);

        const edgeData = otherNodes.map(target => {
            const time = this.calculateETA(activeNode.x_coord, activeNode.y_coord, target.x_coord, target.y_coord, velocity);
            return { target, time };
        }).sort((a, b) => a.time - b.time);

        const top10 = edgeData.slice(0, 10);
        
        this.edges.clear();
        this._drawTacticalEdge(); // Ensure tactical path is always on top

        const t = this._getTheme();
        const accentColor = t.accent;
        const borderColor = t.border;
        const mutedColor = t.muted;
        const bgDark = t.bgDark;

        const newEdges = top10.map(({ target, time }) => ({
            from: nodeId,
            to: target.id,
            label: this.formatFlight(time),
            font: { size: 10, align: 'middle', color: accentColor, strokeWidth: 2, strokeColor: bgDark },
            color: { color: borderColor + '88', highlight: accentColor },
            width: 1.2,
            length: 150
        }));
        this.edges.add(newEdges);

        if (this.network) {
            this.network.setOptions({ physics: { enabled: true } });
            setTimeout(() => { if (this.network && this.currentSelectedNodeId === nodeId) this.network.setOptions({ physics: { enabled: false } }); }, 1200);
        }

        // Overlay & Sidebar
        const overlay = document.getElementById('realmOverlay');
        if (overlay) {
            const nearest = top10[0];
            overlay.innerHTML = `
                <div style="color:var(--text-muted); font-size:0.75em; font-family:var(--font-pixel);">[SELECTED]</div>
                <div style="color:var(--accent-glow); font-size:1.4em; font-weight:bold;">${activeNode.label}</div>
                <div style="color:var(--text-muted); font-size:0.85em;">HQ: ${activeNode.x_coord}, ${activeNode.y_coord}</div>
                <hr style="border:none; border-top:1px solid rgba(201,168,76,0.1); margin:10px 0;">
                <div style="color:var(--text-muted); font-size:0.75em; font-family:var(--font-pixel);">[NEAREST]</div>
                <div style="color:var(--text-secondary); font-size:1.1em;">${nearest ? nearest.target.label : 'None'}</div>
                <div style="color:var(--accent); font-size:0.9em; font-family:var(--font-pixel);">${nearest ? this.formatFlight(nearest.time) : '--'}</div>
            `;
            overlay.style.display = 'flex';
        }

        const sidebarNodeName = document.getElementById('sidebarNodeName');
        if (sidebarNodeName) sidebarNodeName.textContent = activeNode.label;
        const sidebarNodeAlliance = document.getElementById('sidebarNodeAlliance');
        if (sidebarNodeAlliance) sidebarNodeAlliance.textContent = `[${activeNode.alliance}]`;
        const sidebarNodeCoords = document.getElementById('sidebarNodeCoords');
        if (sidebarNodeCoords) sidebarNodeCoords.textContent = `HEX: ${activeNode.x_coord}, ${activeNode.y_coord}`;

        // Sync Sidebar ETA with Tactical Path or Nearest Target
        const sidebarETA = document.getElementById('sidebarNearestETA');
        if (sidebarETA) {
            const sourceNode = this.nodes.get(this.currentSourceId);
            const targetNode = this.nodes.get(this.currentTargetId);
            
            if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
                // Show Tactical Path ETA
                const ms = this.calculateETA(sourceNode.x_coord, sourceNode.y_coord, targetNode.x_coord, targetNode.y_coord, velocity);
                const flightTime = this.formatFlight(ms);
                sidebarETA.dataset.eta = flightTime;
                sidebarETA.innerHTML = `<span style="font-size:0.65em; color:var(--text-muted); display:block; text-transform:uppercase; letter-spacing:1px;">Objective Path</span> ${flightTime}`;
            } else {
                // Fallback to absolute nearest in scan
                const nearest = top10[0];
                const flightTime = nearest ? this.formatFlight(nearest.time) : '--';
                sidebarETA.dataset.eta = flightTime;
                sidebarETA.innerHTML = nearest ? `<span style="font-size:0.65em; color:var(--text-muted); display:block; text-transform:uppercase; letter-spacing:1px;">Nearest Contact</span> ${flightTime}` : '--';
            }
        }

        // Add Path Controls to Sidebar Body
        const listContainer = document.getElementById('sidebarNearestList');
        if (listContainer) {
            let pathControls = `
                <div style="display:flex; gap:10px; margin-bottom:20px; padding-bottom:15px; border-bottom:1px solid rgba(255,168,0,0.1);">
                    <button class="btn-sidebar-action" id="setAsSource" style="flex:1; height:36px; padding:0; font-size:0.75em;">Set as Origin</button>
                    <button class="btn-sidebar-action" id="setAsTarget" style="flex:1; height:36px; padding:0; font-size:0.75em;">Set as Target</button>
                </div>
            `;
            
            listContainer.innerHTML = pathControls + (top10.length === 0 ? `<div style="padding:15px; text-align:center; color:var(--text-muted); font-style:italic;">Scan returned 0 hits for criteria.</div>` : top10.map(({ target, time }) => `
                <div class="nearest-item" data-id="${target.id}">
                    <div class="nearest-item-main">
                        <strong style="color:var(--accent); font-size:1.1em;">${target.label}</strong>
                        <span style="font-size:0.8em; color:var(--text-muted);">[${target.alliance}]</span>
                    </div>
                    <div class="nearest-item-meta">
                        <span style="font-family:var(--font-pixel); color:var(--accent-glow); font-size:1.1em;">${this.formatFlight(time)}</span>
                        <span style="font-family:var(--font-pixel); font-size:0.8em; color:var(--text-secondary);">${target.x_coord}, ${target.y_coord}</span>
                    </div>
                </div>
            `).join(''));

            listContainer.querySelectorAll('.nearest-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    this.network.selectNodes([id]);
                    this.handleNodeClick(id);
                });
            });

            document.getElementById('setAsSource')?.addEventListener('click', () => {
                this.currentSourceId = nodeId;
                this.updateTacticalPath();
            });
            document.getElementById('setAsTarget')?.addEventListener('click', () => {
                this.currentTargetId = nodeId;
                this.updateTacticalPath();
            });
        }
        document.getElementById('realmSidebar')?.classList.add('active');
    }
};