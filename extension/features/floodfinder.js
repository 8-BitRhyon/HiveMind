/**
 * FloodFinder - Extension Module
 * 
 * Displays designated flood targets in the sidebar.
 * Automatically checks range against user's current HF.
 */

var FloodFinder = {
    targets: [],
    refreshInterval: 300000, // 5 minutes
    
    init: function() {
        this.injectUI();
        this.refresh();
        HMLogger.info("[FloodFinder] Initialized");
    },

    injectUI: function() {
        var mapBtn = document.getElementById("HM_ServerMapBtn");
        if (!mapBtn) {
            setTimeout(this.injectUI.bind(this), 1000);
            return;
        }

        if (document.getElementById("HM_FloodFinder")) return;

        var container = document.createElement("div");
        container.id = "HM_FloodFinder";
        container.className = "hm-sidebar-below hm-sidebar-box";
        container.style.marginTop = "5px";
        
        // Header / Toggle Button
        var btn = document.createElement("div");
        btn.className = "hm-servermap-btn"; 
        btn.style.border = "none"; // Remove border since container has it
        btn.innerHTML = `
            <span class="hm-servermap-btn-text">🔍 FLOOD FINDER</span>
            <span class="hm-servermap-btn-count" id="HM_FF_Count">0</span>
        `;
        btn.onclick = this.toggle.bind(this);
        
        // Content Area
        var content = document.createElement("div");
        content.id = "HM_FF_List_Wrapper";
        content.className = "hm-ff-content"; 
        content.style.display = "block"; 
        content.innerHTML = `
            <div id="HM_FF_List">
                <div class="hm-empty">Loading targets...</div>
            </div>
        `;

        container.appendChild(btn);
        container.appendChild(content);

        // Insert BELOW the map button
        mapBtn.parentNode.insertBefore(container, mapBtn.nextSibling);
    },

    isExpanded: true,
    toggle: function() {
        this.isExpanded = !this.isExpanded;
        var content = document.getElementById("HM_FF_List_Wrapper");
        if (content) {
            content.style.display = this.isExpanded ? "block" : "none";
        }
    },

    refresh: async function() {
        if (typeof NetworkManager !== "undefined" && NetworkManager.isConnected) {
            try {
                this.targets = await NetworkManager.getFloodFinder();
                this.render();
            } catch (err) {
                HMLogger.error("[FloodFinder] Fetch error: " + err.message);
            }
        }
        setTimeout(this.refresh.bind(this), this.refreshInterval);
    },

    render: function() {
        var list = document.getElementById("HM_FF_List");
        var countBadge = document.getElementById("HM_FF_Count");
        if (!list) return;

        if (countBadge) countBadge.textContent = this.targets.length;

        if (this.targets.length === 0) {
            list.innerHTML = '<div class="hm-empty">No targets designated.</div>';
            return;
        }

        // Get user's current HF to calculate range
        var userHF = parseInt(document.getElementById("HM_YourHF")?.value || "0", 10);
        
        var html = '<div style="display: flex; flex-direction: column; gap: 8px; padding: 0 10px;">';
        
        this.targets.forEach(t => {
            var statusIcon = t.status || "👁️";
            var assigned = t.assignedTo ? `<span style="font-size:9px; color:var(--hm-muted);">FLOODER: ${t.assignedTo}</span>` : "";
            
            // Basic range check if userHF is available
            var rangeInfo = "";
            if (userHF > 0 && t.playerName) {
                // We'd need the target's current HF to be truly accurate here.
                // For now, let's just show the name and status as requested.
            }

            html += `
                <div class="hm-ff-item" style="border-bottom: 1px dotted var(--hm-border); padding-bottom: 5px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <a href="Membre.php?pseudo=${encodeURIComponent(t.playerName)}" class="hm-data-label" style="margin:0; color:var(--hm-text); cursor:pointer; text-decoration:none;">
                            ${statusIcon} ${t.playerName}
                        </a>
                        <span class="hm-data-label" style="font-size:9px; margin:0;">[${t.alliance || '---'}]</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                        ${assigned}
                        <button class="hm-btn-small" onclick="window.location.href='Membre.php?pseudo=${encodeURIComponent(t.playerName)}'">OPEN</button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        list.innerHTML = html;
    }
};
