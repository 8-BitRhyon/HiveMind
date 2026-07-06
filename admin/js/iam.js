/**
 * Identity & Access Management (IAM) Controller (admin/js/iam.js)
 * Only initialized for Root-level sessions.
 */

window.IAM = {
    admins: [],

    init: function() {
        if (window.State.adminSession?.role !== 'root') return;
        
        console.log("[IAM] Root session detected. Initializing Access Control...");
        this.injectTabButton();
        this.initListeners();
    },

    injectTabButton: function() {
        if (document.querySelector('[data-tab="iam"]')) return;
        
        const nav = document.querySelector('nav.tabs');
        if (!nav) return;

        const btn = document.createElement("button");
        btn.className = "tab";
        btn.dataset.tab = "iam";
        btn.style.color = "var(--accent)"; // Highlight the God-tab
        btn.style.fontWeight = "bold";
        btn.innerHTML = '<span style="margin-right:5px;">🛡️</span>Access Control';
        
        // Add to nav
        nav.appendChild(btn);

        // Add listener to the new button
        btn.addEventListener("click", () => window.switchTab("iam"));
    },

    initListeners: function() {
        const addBtn = document.getElementById("iamAddAdminBtn");
        if (addBtn) {
            addBtn.onclick = async () => {
                const ignInp = document.getElementById("iamAdminIGN");
                const keyInp = document.getElementById("iamAdminKey");
                const ign = ignInp.value.trim();
                const key = keyInp.value.trim();
                
                if (!key) {
                    alert("A secret key is required to authorize an admin.");
                    return;
                }

                await this.addAdmin(ign, key);
                ignInp.value = "";
                keyInp.value = "";
            };
        }
    },

    load: async function() {
        try {
            const res = await fetch(`${window.State.WORKER_URL}/admin/iam/admins`, {
                headers: { "Authorization": `Bearer ${window.State.adminSession.token}` }
            });
            if (res.status === 404) {
                console.warn("[IAM] Unauthorized or IAM disabled on server.");
                return;
            }
            const data = await res.json();
            this.admins = data.admins || [];
            this.render();
        } catch (e) {
            console.error("[IAM] Load failed", e);
        }
    },

    render: function() {
        const tbody = document.getElementById("iamTableBody");
        if (!tbody) return;

        if (this.admins.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">No secondary admins authorized.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.admins.map(a => {
            if (!a) return "";
            const keyPreview = a.key || "unknown";
            const ign = a.ign || "Unknown Admin";
            const role = (a.role || "admin").toUpperCase();
            const dateStr = a.created_at ? new Date(a.created_at).toLocaleString() : "Unknown date";
            return `
                <tr>
                    <td><code style="background:rgba(0,0,0,0.1); padding:2px 5px;">${keyPreview}</code></td>
                    <td><strong>${ign}</strong></td>
                    <td><span class="badge-pact" style="background:var(--accent);">${role}</span></td>
                    <td style="font-size:0.8em; color:var(--text-muted);">${dateStr}</td>
                    <td>
                        <button onclick="window.IAM.revokeAdmin('${a.key}')" class="btn-secondary" style="padding:2px 8px; font-size:0.75rem; color:var(--error);">Revoke Access</button>
                    </td>
                </tr>
            `;
        }).join("");
    },

    addAdmin: async function(ign, key) {
        try {
            const res = await fetch(`${window.State.WORKER_URL}/admin/iam/admins`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${window.State.adminSession.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ ign, key })
            });
            if (res.ok) {
                console.log("[IAM] Admin authorized:", ign);
                this.load();
            } else {
                let errMsg = "Failed to authorize admin";
                try {
                    const err = await res.json();
                    errMsg = err.error || errMsg;
                } catch (_) {
                    try { errMsg = await res.text(); } catch (_) {}
                }
                alert(errMsg);
            }
        } catch (e) {
            console.error("[IAM] Add failed", e);
            alert("Network error: failed to authorize admin.");
        }
    },

    revokeAdmin: async function(key) {
        if (!confirm("Are you sure you want to REVOKE this admin's access immediately?")) return;

        try {
            const res = await fetch(`${window.State.WORKER_URL}/admin/iam/admins?key=${encodeURIComponent(key)}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${window.State.adminSession.token}` }
            });
            if (res.ok) {
                console.log("[IAM] Admin revoked");
                this.load();
            } else {
                let errMsg = "Failed to revoke admin";
                try {
                    const err = await res.json();
                    errMsg = err.error || errMsg;
                } catch (_) {
                    try { errMsg = await res.text(); } catch (_) {}
                }
                alert(errMsg);
            }
        } catch (e) {
            console.error("[IAM] Revoke failed", e);
            alert("Network error: failed to revoke admin.");
        }
    }
};
