/**
 * Diplomacy Manager (admin/js/diplomacy.js)
 * Manages war/pact relationships, persists to server + localStorage fallback.
 * Drives Realm Graph node colors and badge rendering across all tabs.
 */

window.Diplomacy = {

    // ── Persistence ──────────────────────────────────────────────
    load: async function() {
        try {
            const res = await window.fetchCached(
                `${window.State.WORKER_URL}/admin/diplomacy`,
                { headers: { "Authorization": `Bearer ${window.State.adminSession.token}` } },
                60000
            );
            const data = res.ok ? await res.json() : null;
            if (data) {
                window.State.diplomacyData = data;
                // Merge notes from localStorage (notes are local-only)
                const localNotes = localStorage.getItem("HM_DiploNotes");
                if (localNotes) window.State.diplomacyData.notes = localNotes;
                return;
            }
        } catch(e) { console.warn("[Diplomacy] Server load failed, using local fallback"); }

        // Fallback to localStorage
        const local = localStorage.getItem("HM_Diplomacy");
        if (local) {
            window.State.diplomacyData = JSON.parse(local);
        } else {
            window.State.diplomacyData = { pacts: [], wars: [] };
        }
    },

    save: async function() {
        const d = window.State.diplomacyData;
        // Always save locally
        localStorage.setItem("HM_Diplomacy", JSON.stringify({ pacts: d.pacts, wars: d.wars }));
        // Try to push to server
        try {
            await window.fetch(`${window.State.WORKER_URL}/admin/diplomacy`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${window.State.adminSession.token}`
                },
                body: JSON.stringify({ pacts: d.pacts, wars: d.wars })
            });
        } catch(e) { /* offline — local save is enough */ }
    },

    addWar: async function(name) {
        if (!name || !name.trim()) return;
        name = name.trim().toUpperCase();
        const d = window.State.diplomacyData;
        if (d.wars.includes(name)) return;
        d.pacts = d.pacts.filter(p => p !== name); // Can't be both
        d.wars.push(name);
        await this.save();
        this.render();
    },

    removeWar: async function(name) {
        window.State.diplomacyData.wars = window.State.diplomacyData.wars.filter(w => w !== name);
        await this.save();
        this.render();
    },

    addPact: async function(name) {
        if (!name || !name.trim()) return;
        name = name.trim().toUpperCase();
        const d = window.State.diplomacyData;
        if (d.pacts.includes(name)) return;
        d.wars = d.wars.filter(w => w !== name); // Can't be both
        d.pacts.push(name);
        await this.save();
        this.render();
    },

    removePact: async function(name) {
        window.State.diplomacyData.pacts = window.State.diplomacyData.pacts.filter(p => p !== name);
        await this.save();
        this.render();
    },

    // ── Rendering ─────────────────────────────────────────────────
    render: function() {
        const d = window.State.diplomacyData || { pacts: [], wars: [] };

        // Wars list
        const warsList = document.getElementById("warsList");
        if (warsList) {
            warsList.innerHTML = d.wars.length === 0
                ? '<span style="font-size:0.85em; color:var(--text-muted)">No active wars.</span>'
                : d.wars.map(w => `
                    <div class="diplo-tag diplo-war">
                        <span>${window.escapeHtml(w)}</span>
                        <button class="diplo-remove" data-type="war" data-name="${window.escapeHtml(w)}" title="Remove">&times;</button>
                    </div>`).join("");
        }

        // Pacts list
        const pactsList = document.getElementById("pactsList");
        if (pactsList) {
            pactsList.innerHTML = d.pacts.length === 0
                ? '<span style="font-size:0.85em; color:var(--text-muted)">No active pacts.</span>'
                : d.pacts.map(p => `
                    <div class="diplo-tag diplo-pact">
                        <span>${window.escapeHtml(p)}</span>
                        <button class="diplo-remove" data-type="pact" data-name="${window.escapeHtml(p)}" title="Remove">&times;</button>
                    </div>`).join("");
        }

        // Notes
        const notesEl = document.getElementById("diploNotes");
        if (notesEl && !notesEl._userEditing) {
            notesEl.value = d.notes || "";
        }

        // Realm legend diplo summary
        const summary = document.getElementById("diploSummary");
        if (summary) {
            const warLine = d.wars.length > 0 ? `<div><span style="color:#c05050;letter-spacing:0.06em;">WAR:</span> ${d.wars.join(", ")}</div>` : "";
            const pactLine = d.pacts.length > 0 ? `<div><span style="color:#6ab055;letter-spacing:0.06em;">PACT:</span> ${d.pacts.join(", ")}</div>` : "";
            summary.innerHTML = warLine + pactLine || '<span style="color:var(--text-muted);font-style:italic;">None established.</span>';
        }

        // Update the profiler filter and intelAllianceFilter to include diplo status
        this.renderDiploTable();

        // Refresh graph colors if realm is active
        if (window.RealmGraph && window.RealmGraph.network) {
            window.RealmGraph.render();
        }
    },

    renderDiploTable: function() {
        const tbody = document.getElementById("diploTableBody");
        if (!tbody) return;

        const d = window.State.diplomacyData || { pacts: [], wars: [] };
        const alliances = window.State.allianceHistoryData;
        if (!alliances || alliances.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Load Alliance Rankings first.</td></tr>';
            return;
        }

        const latest = alliances[0].data || [];
        tbody.innerHTML = latest.map(a => {
            const isTQC  = a.name === "TQC";
            const isWar  = d.wars.includes(a.name);
            const isPact = d.pacts.includes(a.name);

            let status = '<span style="color:var(--text-muted)">Neutral</span>';
            if (isTQC)   status = '<span style="color:#c9a84c; font-weight:bold">[ HOME ]</span>';
            else if (isWar)  status = '<span style="color:#c05050;letter-spacing:0.06em;">WAR</span>';
            else if (isPact) status = '<span style="color:#6ab055;letter-spacing:0.06em;">PACT</span>';

            let actions = "";
            if (!isTQC) {
                if (isWar)  actions = `<button class="btn-danger diplo-table-remove" data-type="war"  data-name="${window.escapeHtml(a.name)}">Remove War</button>`;
                else if (isPact) actions = `<button class="btn-danger diplo-table-remove" data-type="pact" data-name="${window.escapeHtml(a.name)}">Remove Pact</button>`;
                else actions = `
                    <button class="btn-chart diplo-set" data-type="war"  data-name="${window.escapeHtml(a.name)}" title="Mark as War" style="width:auto;padding:3px 8px;font-size:0.75em;color:#e74c3c;border-color:rgba(139,26,26,0.4);">War</button>
                    <button class="btn-chart diplo-set" data-type="pact" data-name="${window.escapeHtml(a.name)}" title="Mark as Pact" style="width:auto;padding:3px 8px;font-size:0.75em;color:#2ecc71;border-color:rgba(46,120,46,0.4);margin-left:4px;">Pact</button>`;
            }

            return `<tr>
                <td>#${a.rank}</td>
                <td style="font-weight:${isTQC?'bold':'normal'}; color:${isTQC?'#c9a84c':isWar?'#c05050':isPact?'#6ab055':'var(--text-primary)'}">
                    ${window.escapeHtml(a.name)}
                </td>
                <td>${window.formatCompact(a.hf)}</td>
                <td>${a.members}</td>
                <td>${status}</td>
                <td>${actions}</td>
            </tr>`;
        }).join("");
    },

    initListeners: function() {
        // Add war
        document.getElementById("addWarBtn")?.addEventListener("click", () => {
            const val = document.getElementById("newWarInput")?.value;
            this.addWar(val);
            if (document.getElementById("newWarInput")) document.getElementById("newWarInput").value = "";
        });
        document.getElementById("newWarInput")?.addEventListener("keypress", (e) => {
            if (e.key === "Enter") document.getElementById("addWarBtn")?.click();
        });

        // Add pact
        document.getElementById("addPactBtn")?.addEventListener("click", () => {
            const val = document.getElementById("newPactInput")?.value;
            this.addPact(val);
            if (document.getElementById("newPactInput")) document.getElementById("newPactInput").value = "";
        });
        document.getElementById("newPactInput")?.addEventListener("keypress", (e) => {
            if (e.key === "Enter") document.getElementById("addPactBtn")?.click();
        });

        // Notes save
        document.getElementById("saveDiploNotes")?.addEventListener("click", () => {
            const notes = document.getElementById("diploNotes")?.value || "";
            window.State.diplomacyData.notes = notes;
            localStorage.setItem("HM_DiploNotes", notes);
            const btn = document.getElementById("saveDiploNotes");
            if (btn) { btn.textContent = "Saved"; setTimeout(() => { btn.textContent = "Save Notes"; }, 1500); }
        });
        document.getElementById("diploNotes")?.addEventListener("focus", function() { this._userEditing = true; });
        document.getElementById("diploNotes")?.addEventListener("blur",  function() { this._userEditing = false; });

        // Event delegation for tag remove buttons and table actions
        document.getElementById("warsList")?.addEventListener("click", (e) => {
            const btn = e.target.closest(".diplo-remove");
            if (btn && btn.dataset.type === "war") this.removeWar(btn.dataset.name);
        });
        document.getElementById("pactsList")?.addEventListener("click", (e) => {
            const btn = e.target.closest(".diplo-remove");
            if (btn && btn.dataset.type === "pact") this.removePact(btn.dataset.name);
        });
        document.getElementById("diploTableBody")?.addEventListener("click", (e) => {
            const rm = e.target.closest(".diplo-table-remove");
            if (rm) {
                if (rm.dataset.type === "war")  this.removeWar(rm.dataset.name);
                if (rm.dataset.type === "pact") this.removePact(rm.dataset.name);
            }
            const set = e.target.closest(".diplo-set");
            if (set) {
                if (set.dataset.type === "war")  this.addWar(set.dataset.name);
                if (set.dataset.type === "pact") this.addPact(set.dataset.name);
            }
        });

        // Profiler filter 2
        document.getElementById("intelAllianceFilter2")?.addEventListener("change", (e) => {
            if (window.State.hfDataSnapshot) {
                window.renderProfilerChart(window.State.hfDataSnapshot, e.target.value);
            }
        });
    }
};