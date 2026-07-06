/**
 * Roster Management (admin/js/roster.js)
 * Manages the verified TQC member list.
 */

window.Roster = {
    load: async function() {
        if (!window.State.adminSession?.token) return; // No session — skip silently
        try {
            const res = await window.fetchCached(
                `${window.State.WORKER_URL}/admin/roster`,
                { headers: { "Authorization": `Bearer ${window.State.adminSession.token}` } },
                60000
            );
            const data = res.ok ? await res.json() : { members: [] };
            window.State.tqcRoster = data.members || [];
            this.render();
        } catch(e) { console.warn("[Roster] Load failed", e); }
    },

    save: async function() {
        try {
            await window.fetch(`${window.State.WORKER_URL}/admin/roster`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${window.State.adminSession.token}`
                },
                body: JSON.stringify({ members: window.State.tqcRoster })
            });
            await this.load(); // Refresh state and render
            // Trigger a re-render of all components that use roster
            if (window.renderContributionChart) window.renderContributionChart();
            if (window.filterHFTable) window.filterHFTable();
            if (window.loadDashboard) window.loadDashboard();
        } catch(e) { console.warn("[Roster] Save failed", e); }
    },

    add: async function(name) {
        if (!name) return;
        name = name.trim();
        if (!window.State.tqcRoster.includes(name)) {
            window.State.tqcRoster.push(name);
            await this.save();
        }
    },

    remove: async function(name) {
        window.State.tqcRoster = window.State.tqcRoster.filter(m => m !== name);
        await this.save();
    },

    render: function() {
        const container = document.getElementById("rosterList");
        if (!container) return;

        if (window.State.tqcRoster.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85em; text-align: center; padding: 10px;">No members designated.</div>';
            return;
        }

        container.innerHTML = window.State.tqcRoster.sort().map(name => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <span style="font-family: var(--font-mono); font-size: 0.9em; color: var(--accent);">${window.escapeHtml(name)}</span>
                <button class="roster-remove" data-name="${window.escapeHtml(name)}" style="background: none; border: none; color: var(--maroon); cursor: pointer; font-size: 1.1em; line-height: 1;">&times;</button>
            </div>
        `).join("");
    },

    initListeners: function() {
        document.getElementById("addRosterBtn")?.addEventListener("click", () => {
            const input = document.getElementById("rosterInput");
            if (input && input.value) {
                this.add(input.value);
                input.value = "";
            }
        });

        document.getElementById("rosterInput")?.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                this.add(e.target.value);
                e.target.value = "";
            }
        });

        document.getElementById("rosterList")?.addEventListener("click", (e) => {
            if (e.target.classList.contains("roster-remove")) {
                this.remove(e.target.dataset.name);
            }
        });
    }
};
