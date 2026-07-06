/**
 * Diplomacy Manager (admin/js/diplomacy.js)
 * Manages dynamic categories, alliance assignments, discoveries, and audit logs.
 */

window.Diplomacy = {
    // ── Persistence ──────────────────────────────────────────────
    load: async function(forceRefresh = false, bootstrapData = null) {
        if (bootstrapData) {
            this.normalizeData(bootstrapData);
            this.loadDiscoveries();
            return;
        }

        try {
            const headers = { "Authorization": `Bearer ${window.State.adminSession.token}` };
            if (forceRefresh) headers["X-Force-Refresh"] = "true";
            
            const res = await window.fetchCached(
                `${window.State.WORKER_URL}/admin/diplomacy`,
                { headers },
                60000
            );
            const data = res.ok ? await res.json() : null;
            if (data) {
                this.normalizeData(data);
                this.loadDiscoveries();
                return;
            }
        } catch(e) { console.warn("[Diplomacy] Server load failed, using local fallback", e); }

        // Fallback to localStorage
        const local = localStorage.getItem("HM_Diplomacy_New");
        if (local) {
            this.normalizeData(JSON.parse(local));
        } else {
            this.normalizeData({});
        }
        this.loadDiscoveries();
    },

    loadDiscoveries: async function() {
        try {
            const res = await window.fetchCached(
                `${window.State.WORKER_URL}/intel/diplomacy/discovery`,
                { headers: { "Authorization": `Bearer ${window.State.adminSession.token}` } },
                60000
            );
            if (res.ok) {
                window.State.diplomacyDiscoveries = await res.json();
                this.renderDiscoveries();
            }
        } catch(e) { console.warn("[Diplomacy] Discoveries load failed", e); }
    },

    normalizeData: function(data) {
        // Handle legacy data or empty states
        const defaultCats = [
            { id: "sisters", name: "Sisters", color: "#00ffff" },
            { id: "pacts", name: "Ally", color: "#10cc70" },
            { id: "naps", name: "NAP", color: "#ffd700" },
            { id: "wars", name: "War", color: "#ff4444" }
        ];

        window.State.diplomacyData = {
            categories: (data.categories && data.categories.length > 0) ? data.categories : defaultCats,
            assignments: data.assignments || {},
            audit: data.audit || []
        };
    },

    save: async function() {
        const d = window.State.diplomacyData;
        localStorage.setItem("HM_Diplomacy_New", JSON.stringify(d));
        
        try {
            await window.fetch(`${window.State.WORKER_URL}/admin/diplomacy`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${window.State.adminSession.token}`
                },
                body: JSON.stringify(d)
            });
            // Force reload to get matching ETags / update timestamp
            await this.load(true);
        } catch(e) { console.warn("[Diplomacy] Post failed", e); }
    },

    logAudit: function(action, target, detail) {
        const d = window.State.diplomacyData;
        const ign = window.State.adminSession ? window.State.adminSession.ign : "Admin";
        d.audit.unshift({
            ts: Date.now(),
            admin: ign,
            action: action,
            target: target,
            detail: detail
        });
        // Keep last 100
        if (d.audit.length > 100) d.audit.pop();
    },

    // ── Category Management ──────────────────────────────────────
    addCategory: async function(name, color) {
        if (!name || !name.trim()) return;
        const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        const d = window.State.diplomacyData;
        if (d.categories.find(c => c.id === id)) return;
        
        d.categories.push({ id, name: name.trim(), color });
        this.logAudit("add_category", name, color);
        await this.save();
        this.render();
    },

    removeCategory: async function(id) {
        const d = window.State.diplomacyData;
        const cat = d.categories.find(c => c.id === id);
        if (!cat || id === "pacts" || id === "wars") return; // Keep base required categories safely if needed, but let's allow anything.
        
        d.categories = d.categories.filter(c => c.id !== id);
        // Unassign anyone in this category
        for (const [tag, catId] of Object.entries(d.assignments)) {
            if (catId === id) delete d.assignments[tag];
        }
        
        this.logAudit("remove_category", cat.name, "");
        await this.save();
        this.render();
    },

    // ── Assignments ──────────────────────────────────────────────
    setAssignment: async function(tag, categoryId) {
        if (!tag || !tag.trim()) return;
        tag = tag.trim().toUpperCase();
        const d = window.State.diplomacyData;
        
        const oldCat = d.assignments[tag];
        if (oldCat === categoryId) return;

        if (categoryId === "") {
            delete d.assignments[tag];
            this.logAudit("remove_assignment", tag, oldCat || 'none');
        } else {
            d.assignments[tag] = categoryId;
            const newCatName = d.categories.find(c => c.id === categoryId)?.name || categoryId;
            this.logAudit("set_assignment", tag, newCatName);
        }
        
        await this.save();
        this.render();
    },

    // ── Rendering ─────────────────────────────────────────────────
    render: function() {
        // Defensive initialization
        if (!window.State.diplomacyData) window.State.diplomacyData = { categories: [], assignments: {} };
        const d = window.State.diplomacyData;
        if (!d.categories) d.categories = [];
        if (!d.assignments) d.assignments = {};

        // 1. Categories
        const catContainer = document.getElementById("diploCategories");
        if (catContainer) {
            catContainer.innerHTML = d.categories.map(c => `
                <div style="display:flex; align-items:center; padding: 6px 10px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-dark);">
                    <div style="width: 14px; height: 14px; background: ${c.color}; border-radius: 50%; margin-right: 10px; box-shadow: 0 0 4px ${c.color};"></div>
                    <span style="flex:1; font-weight:bold; color:var(--text-primary);">${window.escapeHtml(c.name)}</span>
                    <button class="btn-danger diplo-btn-rm-cat" data-id="${c.id}" style="padding:2px 6px; font-size:0.7em;">Delete</button>
                </div>
            `).join("");
        }

        // 2. Discoveries
        this.renderDiscoveries();

        // 3. Ledger
        this.renderDiploTable();

        // 4. Audit Log
        this.renderAudit();

        // Refresh graph colors if realm is active (though we'd need to adapt realm graph to categories later)
        if (window.RealmGraph && window.RealmGraph.network) {
            window.RealmGraph.render();
        }
    },

    renderDiscoveries: function() {
        const discContainer = document.getElementById("diploDiscoveries");
        if (!discContainer) return;
        
        const disc = window.State.diplomacyDiscoveries;
        if (!disc || (!disc.pacts?.length && !disc.wars?.length)) {
            discContainer.innerHTML = '<span style="font-size:0.85em; color:var(--text-muted)">No recent discoveries from the field.</span>';
            return;
        }

        const d = window.State.diplomacyData || { categories: [], assignments: {} };
        const timeAgo = disc.timestamp ? window.timeAgo(disc.timestamp) : "unknown time";
        const submittedBy = disc.submittedBy || "unknown";

        let html = `<div style="font-size:0.8em; color:var(--text-muted); margin-bottom:8px;">Source: <strong>${window.escapeHtml(submittedBy)}</strong> (${timeAgo})</div>`;
        
        let items = [];
        (disc.pacts || []).forEach(tag => {
            if (!d.assignments[tag]) items.push({ tag, type: 'Pact' });
        });
        (disc.wars || []).forEach(tag => {
             if (!d.assignments[tag]) items.push({ tag, type: 'War' });
        });

        if (items.length === 0) {
            discContainer.innerHTML = '<span style="font-size:0.85em; color:var(--text-muted)">All recent discoveries have already been assigned.</span>';
            return;
        }

        html += items.map(item => `
            <div style="display:flex; align-items:center; padding: 6px; background: rgba(0,0,0,0.2); border: 1px dashed var(--border-dark);">
                <span style="flex:1;"><strong>[${window.escapeHtml(item.tag)}]</strong> reported as ${item.type}</span>
                <button class="btn-chart diplo-btn-assign" data-tag="${window.escapeHtml(item.tag)}" style="padding:2px 6px;">Assign...</button>
            </div>
        `).join("");

        discContainer.innerHTML = html;
    },
    
    renderAudit: function() {
        const container = document.getElementById("diploAuditLog");
        if (!container) return;
        const audit = window.State.diplomacyData?.audit || [];
        if (audit.length === 0) {
            container.innerHTML = '<span style="color:var(--text-muted)">No activity recorded.</span>';
            return;
        }
        container.innerHTML = audit.map(a => `
            <div style="padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-muted);">
                <span style="color:var(--accent-glow)">[${window.formatDate ? window.formatDate(a.ts) : new Date(a.ts).toLocaleString()}]</span>
                <strong style="color:var(--text-primary)">${window.escapeHtml(a.admin)}</strong>: 
                <span style="color:var(--accent)">${a.action}</span> 
                on <strong>${window.escapeHtml(a.target)}</strong> 
                ${a.detail ? `<span style="font-size:0.9em;">(${window.escapeHtml(a.detail)})</span>` : ""}
            </div>
        `).join("");
    },

    renderDiploTable: function() {
        const tbody = document.getElementById("diploTableBody");
        if (!tbody) return;

        const d = window.State.diplomacyData || { categories: [], assignments: {} };
        if (!d.categories) d.categories = [];
        if (!d.assignments) d.assignments = {};
        
        const alliances = window.State.allianceHistoryData;
        const searchInput = document.getElementById("diploSearchInput")?.value.toLowerCase().trim() || "";
        const filterSelect = document.getElementById("diploFilterSelect")?.value || "ALL";

        if (!alliances || alliances.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Load Alliance Rankings first.</td></tr>';
            return;
        }

        const latest = alliances[alliances.length - 1].data || [];
        
        const rows = latest.filter(a => {
            const tag = a.name.toUpperCase();
            if (searchInput && !tag.toLowerCase().includes(searchInput)) return false;
            if (filterSelect === "ASSIGNED" && !d.assignments[tag]) return false;
            return true;
        }).map(a => {
            const tag = a.name.toUpperCase();
            const currentAssignment = d.assignments[tag] || "";
            let color = "var(--text-primary)";
            
            if (currentAssignment) {
                const cat = d.categories.find(c => c.id === currentAssignment);
                if (cat) color = cat.color;
            } else if (tag === "TQC") {
                color = "#4488ff"; // Hardcoded default for own alliance visually if missing
            }

            // Build options list for this specific row
            const optionsHtml = [`<option value="" ${currentAssignment === "" ? "selected" : ""}>-- Neutral --</option>`]
                .concat(d.categories.map(c => `<option value="${c.id}" ${c.id === currentAssignment ? "selected" : ""}>${window.escapeHtml(c.name)}</option>`))
                .join("");

            return `<tr>
                <td>#${a.rank}</td>
                <td style="font-weight:bold; color:${color}; font-family: var(--font-mono);">
                    ${window.escapeHtml(a.name)}
                </td>
                <td>${window.formatCompact(a.hf)}</td>
                <td>${a.members}</td>
                <td>
                    <label for="assign_${window.escapeHtml(a.name)}" class="sr-only">Assignment for ${window.escapeHtml(a.name)}</label>
                    <select id="assign_${window.escapeHtml(a.name)}" name="assign_${window.escapeHtml(a.name)}" class="diplo-row-select" data-tag="${window.escapeHtml(a.name)}" style="padding:4px; max-width: 150px; background:var(--bg-input); border:1px solid var(--border-dark); color:var(--text-primary);">
                        ${optionsHtml}
                    </select>
                </td>
            </tr>`;
        });

        tbody.innerHTML = rows.length ? rows.join("") : '<tr><td colspan="5" class="loading-cell">No matching alliances found.</td></tr>';
    },

    initListeners: function() {
        // Categories Configuration
        document.getElementById("addCatBtn")?.addEventListener("click", () => {
            const nameEl = document.getElementById("newCatName");
            const colorEl = document.getElementById("newCatColor");
            if (nameEl && colorEl) {
                this.addCategory(nameEl.value, colorEl.value);
                nameEl.value = "";
            }
        });

        document.getElementById("diploCategories")?.addEventListener("click", (e) => {
            const btn = e.target.closest(".diplo-btn-rm-cat");
            if (btn) this.removeCategory(btn.dataset.id);
        });

        // Ledger Filters
        document.getElementById("diploSearchInput")?.addEventListener("input", () => this.renderDiploTable());
        document.getElementById("diploFilterSelect")?.addEventListener("change", () => this.renderDiploTable());

        // Ledger Assignments (Event Delegation)
        document.getElementById("diploTableBody")?.addEventListener("change", (e) => {
            if (e.target.classList.contains("diplo-row-select")) {
                this.setAssignment(e.target.dataset.tag, e.target.value);
            }
        });

        // Discoveries (Event Delegation)
        document.getElementById("diploDiscoveries")?.addEventListener("click", (e) => {
            const btn = e.target.closest(".diplo-btn-assign");
            if (btn) {
                // Focus the search input to bring them to the ledger row immediately
                const searchEl = document.getElementById("diploSearchInput");
                if (searchEl) {
                    searchEl.value = btn.dataset.tag;
                    this.renderDiploTable();
                    searchEl.focus();
                }
            }
        });
    }
};