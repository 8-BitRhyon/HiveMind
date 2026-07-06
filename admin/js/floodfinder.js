/**
 * HyperChain Flood Finder (admin/js/floodfinder.js)
 * Manages the designated target list and flooder assignments.
 */

window.FloodFinder = {
    targets: [],

    init: function() {
        this.load();
        this.initListeners();
    },

    initListeners: function() {
        const addBtn = document.getElementById("ffAddBtn");
        if (addBtn) {
            addBtn.onclick = () => {
                const nameInput = document.getElementById("ffAddName");
                const name = nameInput.value.trim();
                if (name) {
                    this.addTarget(name);
                    nameInput.value = "";
                }
            };
        }

        // Auto-complete for add input
        const ffAddInput = document.getElementById("ffAddName");
        if (ffAddInput) {
            ffAddInput.onfocus = () => this.populateAutocomplete("");
            ffAddInput.oninput = (e) => this.populateAutocomplete(e.target.value);
        }
    },

    load: async function() {
        try {
            const res = await window.fetchCached(
                `${window.State.WORKER_URL}/admin/flood-finder`,
                { headers: { "Authorization": `Bearer ${window.State.adminSession.token}` } },
                30000 // 30s cache
            );
            const data = res.ok ? await res.json() : { targets: [] };
            this.targets = data.targets || [];
            this.render();
        } catch (e) {
            console.error("[FloodFinder] Load failed", e);
        }
    },

    save: async function() {
        try {
            const res = await fetch(`${window.State.WORKER_URL}/admin/flood-finder`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${window.State.adminSession.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ targets: this.targets })
            });
            if (res.ok) {
                console.log("[FloodFinder] Targets saved");
            }
        } catch (e) {
            console.error("[FloodFinder] Save failed", e);
        }
    },

    render: function() {
        const tbody = document.getElementById("ffTableBody");
        if (!tbody) return;

        if (this.targets.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No targets designated. Add one above.</td></tr>`;
            return;
        }

        // Get fresh data from State to show current HF and last seen
        const playerMap = {};
        if (window.State.hfDataSnapshot) {
            window.State.hfDataSnapshot.forEach(p => {
                if (p && p.name) {
                    playerMap[p.name.toLowerCase()] = { ...p };
                }
            });
        }

        if (window.RealmGraph && window.RealmGraph.playerCoords) {
            window.RealmGraph.playerCoords.forEach(p => {
                if (p && p.name) {
                    const key = p.name.toLowerCase();
                    if (!playerMap[key]) {
                        playerMap[key] = { name: p.name, alliance: p.alliance };
                    }
                    // Merge coordinates
                    playerMap[key].x = p.x;
                    playerMap[key].y = p.y;
                    if (p.alliance && !playerMap[key].alliance) {
                        playerMap[key].alliance = p.alliance;
                    }
                }
            });
        }

        tbody.innerHTML = this.targets.map((t, idx) => {
            if (!t || !t.playerName) return "";
            const live = playerMap[t.playerName.toLowerCase()] || {};
            const hf = live.hf ? window.Utils.formatInt(live.hf) : "???";
            const lastSeen = live.ts ? window.Utils.timeAgo(live.ts) : "Never";
            const yBlock = live.y !== undefined ? Math.floor(live.y / 200) + 1 : "?";
            
            return `
                <tr>
                    <td style="text-align:center; font-size:1.2rem;">
                        <select onchange="window.FloodFinder.updateStatus(${idx}, this.value)" style="background:transparent; border:none; color:inherit; font-size:inherit; cursor:pointer;">
                            <option value="🎯" ${t.status === '🎯' ? 'selected' : ''}>🎯</option>
                            <option value="👁️" ${t.status === '👁️' ? 'selected' : ''}>👁️</option>
                            <option value="🔹" ${t.status === '🔹' ? 'selected' : ''}>🔹</option>
                            <option value="🔒" ${t.status === '🔒' ? 'selected' : ''}>🔒</option>
                        </select>
                    </td>
                    <td><strong class="player-link" onclick="window.CmdPalette.open('${t.playerName}')">${t.playerName}</strong></td>
                    <td><span class="alliance-tag">${t.alliance || live.alliance || '---'}</span></td>
                    <td>${yBlock}</td>
                    <td class="hf-copy" data-val="${live.hf || 0}">${hf}</td>
                    <td style="font-size:0.8em; color:var(--text-muted);">${lastSeen}</td>
                    <td>
                        <input type="text" value="${t.assignedTo || ''}" placeholder="Assigned to..." 
                               onblur="window.FloodFinder.updateAssignment(${idx}, this.value)"
                               style="background:rgba(0,0,0,0.1); border:1px solid var(--border-dark); color:var(--text-primary); padding:2px 6px; font-size:0.9em; width:100%;">
                    </td>
                    <td>
                        <button onclick="window.FloodFinder.removeTarget(${idx})" class="btn-secondary" style="padding:2px 8px; font-size:0.75rem; color:var(--error);">Remove</button>
                    </td>
                </tr>
            `;
        }).join("");
    },

    addTarget: function(name) {
        if (!name) return;
        // Check if already exists
        if (this.targets.some(t => t && t.playerName && t.playerName.toLowerCase() === name.toLowerCase())) return;

        // Try to find alliance in state (checking all sources)
        let alliance = "";
        const targetLower = name.toLowerCase().trim();

        if (window.State.hfDataSnapshot) {
            const p = window.State.hfDataSnapshot.find(x => x && x.name && x.name.toLowerCase() === targetLower);
            if (p && p.alliance) alliance = p.alliance;
        }
        if (!alliance && window.RealmGraph && window.RealmGraph.playerCoords) {
            const p = window.RealmGraph.playerCoords.find(x => x && x.name && x.name.toLowerCase() === targetLower);
            if (p && p.alliance) alliance = p.alliance;
        }
        if (!alliance && window.State.intelDataSnapshot) {
            const p = window.State.intelDataSnapshot.find(x => x && x.name && x.name.toLowerCase() === targetLower);
            if (p && p.alliance) alliance = p.alliance;
        }
        if (!alliance && window.State.tqcRoster) {
            const hasIt = window.State.tqcRoster.some(x => x && x.toLowerCase() === targetLower);
            if (hasIt) alliance = "TQC";
        }

        this.targets.push({
            playerName: name,
            alliance: alliance,
            status: "👁️",
            assignedTo: "",
            last_updated: Date.now()
        });
        this.render();
        this.save();
    },

    removeTarget: function(idx) {
        if (confirm(`Remove ${this.targets[idx].playerName} from Flood Finder?`)) {
            this.targets.splice(idx, 1);
            this.render();
            this.save();
        }
    },

    updateStatus: function(idx, status) {
        this.targets[idx].status = status;
        this.save();
    },

    updateAssignment: function(idx, name) {
        if (this.targets[idx].assignedTo === name) return;
        this.targets[idx].assignedTo = name;
        this.save();
    },

    populateAutocomplete: function(filterText = "") {
        const datalist = document.getElementById("ffPlayersList");
        if (!datalist) return;

        const allPlayers = new Map();
        const addPlayerInfo = (name, alliance) => {
            if (!name) return;
            const key = name.toLowerCase().trim();
            if (!allPlayers.has(key)) {
                allPlayers.set(key, { name: name.trim(), alliance: alliance || "" });
            } else if (alliance && !allPlayers.get(key).alliance) {
                allPlayers.get(key).alliance = alliance;
            }
        };

        if (window.State.hfDataSnapshot) {
            window.State.hfDataSnapshot.forEach(p => {
                if (p && p.name) addPlayerInfo(p.name, p.alliance);
            });
        }
        if (window.RealmGraph && window.RealmGraph.playerCoords) {
            window.RealmGraph.playerCoords.forEach(p => {
                if (p && p.name) addPlayerInfo(p.name, p.alliance);
            });
        }
        if (window.State.intelDataSnapshot) {
            window.State.intelDataSnapshot.forEach(p => {
                if (p && p.name) addPlayerInfo(p.name, p.alliance);
            });
        }
        if (window.State.tqcRoster) {
            window.State.tqcRoster.forEach(name => {
                if (name) addPlayerInfo(name, "TQC");
            });
        }

        const cleanFilter = (filterText || "").trim().toLowerCase();
        let matches = Array.from(allPlayers.values());
        if (cleanFilter) {
            matches = matches.filter(p => 
                p && p.name && p.name.toLowerCase().includes(cleanFilter)
            );
        }

        datalist.innerHTML = matches
            .slice(0, 100) // Top 100 matching for perf
            .map(p => `<option value="${p.name}">${p.alliance ? '['+p.alliance+']' : ''}</option>`)
            .join("");
    }
};
