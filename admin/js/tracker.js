/**
 * Table Rendering & Tracker Logic (admin/js/tracker.js)
 */

window.loadAlliances = async function() {
    const tbody = document.getElementById("alliancesTableBody");
    if (!tbody) return;
    
    tbody.innerHTML = "<tr><td colspan='7' class='loading-cell'>Loading Alliance Data...</td></tr>";

    try {
        const headers = { "Authorization": `Bearer ${window.State.adminSession.token}` };
        
        const [diploRes, histRes, alliancesRes] = await Promise.all([
            window.fetchCached(`${window.State.WORKER_URL}/admin/diplomacy`, { headers }),
            window.fetchCached(`${window.State.WORKER_URL}/admin/alliances/history`, { headers }),
            window.fetchCached(`${window.State.WORKER_URL}/admin/alliances`, { headers })
        ]);

        if (!alliancesRes.ok) throw new Error("Failed to load alliance rankings");

        const pactsData = diploRes.ok ? await diploRes.json() : {};
        const historyData = histRes.ok ? await histRes.json() : [];
        const alliancesData = await alliancesRes.json();

        const pacts = pactsData.pacts || [];
        const wars = pactsData.wars || [];

        window.State.allianceHistoryData = historyData;

        // Use the master consolidated list for the table display
        const latestSnapshot = alliancesData.data || [];
        if (!latestSnapshot || latestSnapshot.length === 0) {
            tbody.innerHTML = "<tr><td colspan='10'>No alliance data found. Please scrape rankings in-game.</td></tr>";
            return;
        }

        // Pre-calculate deltas and cache in State
        const prevData = historyData.length > 1 ? historyData[historyData.length - 2].data : null;
        latestSnapshot.forEach(a => {
            const prev = prevData ? prevData.find(p => p.name === a.name) : null;
            a.hf_delta = prev ? (a.hf - prev.hf) : 0;
            a.rank_delta = prev ? (prev.rank - a.rank) : 0;
            a.members_delta = prev ? (a.members - prev.members) : 0;
        });

        // Populate Diplo Filter Dropdown
        const filterSelect = document.getElementById("allianceDiploFilter");
        if (filterSelect) {
            filterSelect.innerHTML = `
                <option value="ALL">All Categories</option>
                <option value="NONE">Neutral Only</option>
                <option value="DIPLO">Any Diplo Category</option>
            `;
            const cats = window.State.diplomacyData?.categories || [];
            cats.forEach(c => {
                const opt = document.createElement("option");
                opt.value = `cat_${c.id}`;
                opt.textContent = `Category: ${c.name}`;
                filterSelect.appendChild(opt);
            });
        }

        // Initialize Listeners for new buttons (only once)
        if (!window.State._alliancesListenersInit) {
            window.State._alliancesListenersInit = true;
            document.getElementById("allianceDiploFilter")?.addEventListener("change", () => window.filterAlliancesTable());
            document.getElementById("allianceChartMetric")?.addEventListener("change", () => window.filterAlliancesTable());
            
            document.getElementById("btnCompareAllVisible")?.addEventListener("click", () => {
                const checkboxes = document.querySelectorAll(".chart-toggle");
                checkboxes.forEach(cb => {
                    const name = cb.dataset.alliance;
                    if (!window.State.activeChartTargets.includes(name)) {
                        window.State.activeChartTargets.push(name);
                    }
                });
                const metric = document.getElementById("allianceChartMetric")?.value || "hf";
                window.renderAllianceHistoryChart(window.State.allianceHistoryData, window.State.activeChartTargets, metric);
                window.renderAllianceStackedArea(window.State.allianceHistoryData, metric);
                window.filterAlliancesTable();
            });

            document.getElementById("btnClearComparison")?.addEventListener("click", () => {
                window.State.activeChartTargets = ["TQC"];
                const metric = document.getElementById("allianceChartMetric")?.value || "hf";
                window.renderAllianceHistoryChart(window.State.allianceHistoryData, window.State.activeChartTargets, metric);
                window.renderAllianceStackedArea(window.State.allianceHistoryData, metric);
                window.filterAlliancesTable();
            });

            // Delegate Table Events (Checkboxes & Links)
            const tableBody = document.getElementById("alliancesTableBody");
            tableBody?.addEventListener("change", (e) => {
                if (e.target.classList.contains("chart-toggle")) {
                    const name = e.target.dataset.alliance;
                    if (!window.State.activeChartTargets) window.State.activeChartTargets = ["TQC"];
                    
                    if (e.target.checked) {
                        if (!window.State.activeChartTargets.includes(name)) window.State.activeChartTargets.push(name);
                    } else {
                        window.State.activeChartTargets = window.State.activeChartTargets.filter(t => t !== name);
                    }
                    const metric = document.getElementById("allianceChartMetric")?.value || "hf";
                    window.renderAllianceHistoryChart(window.State.allianceHistoryData, window.State.activeChartTargets, metric);
                }
            });

            tableBody?.addEventListener("click", (e) => {
                const nameLink = e.target.closest(".alliance-name-link");
                const chartBtn = e.target.closest(".btn-chart-alliance");
                const allianceName = nameLink?.dataset.alliance || chartBtn?.dataset.alliance;
                
                if (allianceName) {
                    window.openAllianceHistoryModal(allianceName);
                }
            });
        }

        window.State.latestAllianceSnapshot = latestSnapshot;
        window.State.previousAllianceSnapshot = prevData;
        window.filterAlliancesTable();

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan='10' style="color: var(--error);">Error: ${window.escapeHtml(err.message)}</td></tr>`;
    }
};

window.filterAlliancesTable = window.debounce(function() {
    const tbody = document.getElementById("alliancesTableBody");
    if (!tbody || !window.State.latestAllianceSnapshot) return;

    const term = (document.getElementById("alliancesSearchInput")?.value || "").toLowerCase();
    const diploFilter = document.getElementById("allianceDiploFilter")?.value || "ALL";
    const diploAssignments = window.State.diplomacyData?.assignments || {};

    // 1. Filter
    let filtered = window.State.latestAllianceSnapshot.filter(a => {
        const matchesTerm = a.name.toLowerCase().includes(term);
        if (!matchesTerm) return false;

        if (diploFilter === "ALL") return true;
        const assignment = diploAssignments[a.name];
        if (diploFilter === "NONE") return !assignment;
        if (diploFilter === "DIPLO") return !!assignment;
        if (diploFilter.startsWith("cat_")) {
            const catId = diploFilter.replace("cat_", "");
            return assignment === catId;
        }
        return true;
    });

    // 2. Sort
    filtered.sort((a, b) => {
        let valA = a[window.State.allianceSortCol];
        let valB = b[window.State.allianceSortCol];
        if (window.State.allianceSortCol === "name") {
            return window.State.allianceSortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
        }
        // For rank, we usually want ascending by default (1, 2, 3)
        if (window.State.allianceSortCol === "rank") {
             return window.State.allianceSortDesc ? (valB - valA) : (valA - valB);
        }
        // For everything else (hf, delta, etc), descending is natural
        return window.State.allianceSortDesc ? (valA - valB) : (valB - valA);
    });

    // 3. Limit to 100 for performance and as requested
    const displayList = filtered.slice(0, 100);

    // Update charts with current metric
    const metric = document.getElementById("allianceChartMetric")?.value || "hf";
    window.renderAllianceHistoryChart(window.State.allianceHistoryData, window.State.activeChartTargets, metric);
    window.renderAllianceStackedArea(window.State.allianceHistoryData, metric);

    // 4. Render
    tbody.innerHTML = displayList.map(a => {
        const isTQC = a.name === "TQC";
        const assignment = diploAssignments[a.name];
        const isChecked = (window.State.activeChartTargets && window.State.activeChartTargets.includes(a.name)) ? "checked" : "";

        let nameHtml = window.escapeHtml(a.name);
        let rowStyle = "";

        if (isTQC) {
            nameHtml = `<span style="color: #dcb432;">[TQC]</span>`;
            rowStyle = 'style="background-color: rgba(220, 180, 50, 0.1); font-weight: bold;"';
        } else if (assignment) {
            const cat = window.State.diplomacyData.categories.find(c => c.id === assignment);
            if (cat) {
                nameHtml += ` <span class="badge-diplo" style="background: ${cat.color}22; border-color: ${cat.color}; color: ${cat.color};">${cat.name.toUpperCase()}</span>`;
                rowStyle = `style="background-color: ${cat.color}11;"`;
            }
        }
        
        const rankDelta = a.rank_delta !== 0 ? `<span class="delta-${a.rank_delta > 0 ? 'up' : 'down'}">(${a.rank_delta > 0 ? '↑' : '↓'} ${Math.abs(a.rank_delta)})</span>` : "";
        const hfDelta = a.hf_delta !== 0 ? `<span class="delta-${a.hf_delta > 0 ? 'up' : 'down'}" style="font-size:0.8em; display:block;">${a.hf_delta > 0 ? '+' : ''}${window.formatCompact(a.hf_delta)}</span>` : "";
        const memDelta = a.members_delta !== 0 ? `<span class="delta-${a.members_delta > 0 ? 'up' : 'down'}">${a.members_delta > 0 ? '+' : ''}${a.members_delta}</span>` : "";

        const avgHF = a.members > 0 ? Math.floor(a.hf / a.members) : 0;

        return `
        <tr ${rowStyle}>
            <td>#${a.rank} ${rankDelta}</td>
            <td style="cursor: pointer; color: var(--accent); text-decoration: underline;" class="alliance-name-link" data-alliance="${window.escapeHtml(a.name)}">${nameHtml}</td>
            <td>${window.formatHF(a.hf)}</td>
            <td style="font-family: var(--font-pixel);">${hfDelta || '—'}</td>
            <td><span style="color: #7ab8e8;">${window.formatHF(avgHF)}</span></td>
            <td>${a.anthill.toLocaleString()}</td>
            <td>${a.tech.toLocaleString()}</td>
            <td>${a.fight.toLocaleString()}</td>
            <td>${a.members.toLocaleString()} ${memDelta}</td>
            <td style="text-align:center;">
                <button class="btn-chart btn-chart-alliance" title="View Chart" data-alliance="${window.escapeHtml(a.name)}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                </button>
                <label for="comp_${window.escapeHtml(a.name)}" class="sr-only">Compare ${window.escapeHtml(a.name)}</label>
                <input type="checkbox" id="comp_${window.escapeHtml(a.name)}" name="comp_${window.escapeHtml(a.name)}" class="chart-toggle" data-alliance="${window.escapeHtml(a.name)}" ${isChecked} title="Compare">
            </td>
        </tr>`;
    }).join("");

    if (filtered.length > 100) {
        tbody.innerHTML += `<tr><td colspan="9" style="text-align:center; padding: 10px; color: var(--text-muted); font-size: 0.8em;">... and ${filtered.length - 100} more alliances. Use search to find specific targets.</td></tr>`;
    }
}, 250);

window.loadHFLatest = async function() {
    const tbody = document.getElementById("hfBody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='6' class='loading-cell'>Loading Player Rankings...</td></tr>";

    try {
        const headers = { "Authorization": `Bearer ${window.State.adminSession.token}` };
        
        const [histRes, logsRes] = await Promise.all([
            window.fetchCached(`${window.State.WORKER_URL}/admin/players/history`, { headers }),
            window.fetchCached(`${window.State.WORKER_URL}/admin/logs?event=hf_submit&page=1&limit=1`, { headers })
        ]);

        if (!histRes.ok) throw new Error("Failed to load player history");

        const historyData = await histRes.json();
        const logsData = logsRes.ok ? await logsRes.json() : { logs: [] };
            
        if (!historyData || historyData.length === 0) {
            tbody.innerHTML = "<tr><td colspan='6'>No player data scraped yet. Visit the Player Rankings page in-game.</td></tr>";
            document.getElementById("freshnessText").textContent = "No data synced yet";
            return;
        }

        const latestSnapshot = historyData[0].data;

        if (!latestSnapshot || latestSnapshot.length === 0) {
            tbody.innerHTML = "<tr><td colspan='6'>Latest snapshot is empty.</td></tr>";
            return;
        }
        
        let ts = 0;
        if (logsData && logsData.logs && logsData.logs.length > 0) {
            ts = logsData.logs[0].timestamp;
        } else {
            ts = historyData[0].timestamp;
        }

        if (ts > 0) {
            document.getElementById("freshnessText").textContent = `Last sync: ${window.timeAgo(ts)}`;
            const banner = document.getElementById("freshnessBanner");
            if (banner) {
                const ageMin = (Date.now() - ts) / 60000;
                banner.className = "freshness-banner" + (ageMin < 30 ? " fresh" : ageMin < 1440 ? " stale" : " old");
            }
        }

        let previousSnapshot = null;
        if (historyData.length > 1) {
            previousSnapshot = historyData[1].data;
        }

        const alliances = new Set();
        latestSnapshot.forEach(p => {
            if (p.alliance) alliances.add(p.alliance);
        });

        const populateSelect = (id, label, defaultVal = "ALL") => {
            const el = document.getElementById(id);
            if (!el) return;
            const currentVal = el.value;
            el.innerHTML = `<option value="${defaultVal}">${label}</option>`;
            [...alliances].sort().forEach(a => {
                const opt = document.createElement("option");
                opt.value = a;
                opt.textContent = a;
                el.appendChild(opt);
            });
            if (Array.from(el.options).some(o => o.value === currentVal)) {
                el.value = currentVal;
            }
        };

        populateSelect("allianceFilter", "All Alliances", "");
        populateSelect("intelAllianceFilter", "All Alliances", "ALL");
        populateSelect("intelAllianceFilter2", "Server Average", "ALL");

        latestSnapshot.sort((a, b) => {
            let valA = a[window.State.playerSortCol];
            let valB = b[window.State.playerSortCol];
            if (window.State.playerSortCol === "name") {
                return window.State.playerSortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
            }
            return window.State.playerSortDesc ? (valB - valA) : (valA - valB);
        });

        document.querySelectorAll("#hfTable th.sortable").forEach(th => {
            const label = th.dataset.label || th.innerText.split(" ")[0];
            if (th.dataset.sort === window.State.playerSortCol) {
                th.innerText = label + (window.State.playerSortDesc ? " \u2193" : " \u2191");
            } else {
                th.innerText = label + " \u2195";
            }
        });

        // Store into global state for the debounced state-driven rendering
        window.State.hfDataSnapshot = latestSnapshot;
        window.State.hfPreviousSnapshot = previousSnapshot;

        window.filterHFTable();

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan='6' style="color: var(--error);">Error: ${window.escapeHtml(err.message)}</td></tr>`;
    }
};

window.filterHFTable = window.debounce(function() {
    const tbody = document.getElementById("hfBody");
    if (!tbody || !window.State.hfDataSnapshot) return;

    const term = document.getElementById("searchInput").value.toLowerCase();
    const alliance = document.getElementById("allianceFilter").value;

    const filtered = window.State.hfDataSnapshot.filter(p => {
        const name = (p.name || "").toLowerCase();
        const rowAlliance = p.alliance || "";
        const roster = window.State.tqcRoster || [];
        
        const matchesTerm = name.includes(term) || rowAlliance.toLowerCase().includes(term);
        
        let matchesAlliance = false;
        if (alliance === "") {
            matchesAlliance = true;
        } else if (alliance.toUpperCase() === "TQC") {
            // Special Case: TQC respects the manual roster if populated
            const isRostered = roster.some(m => m.toLowerCase() === p.name?.toLowerCase());
            const isTqcTagged = rowAlliance.toUpperCase() === "TQC";
            matchesAlliance = roster.length > 0 ? isRostered : isTqcTagged;
        } else {
            matchesAlliance = rowAlliance === alliance;
        }
        
        return matchesTerm && matchesAlliance;
    });

    // Re-render only filtered data
    tbody.innerHTML = filtered.map(p => {
        let hfDeltaHtml = "";
        let rankDeltaHtml = "";

        if (window.State.hfPreviousSnapshot) {
            const prev = window.State.hfPreviousSnapshot.find(x => x.name === p.name);
            if (prev) {
                const rankDiff = prev.rank - p.rank;
                if (rankDiff > 0) rankDeltaHtml = `<span class="delta-up">\u2191${rankDiff}</span>`;
                else if (rankDiff < 0) rankDeltaHtml = `<span class="delta-down">\u2193${Math.abs(rankDiff)}</span>`;

                const hfDiff = p.hf - prev.hf;
                if (hfDiff > 0) hfDeltaHtml = `<span class="delta-up" style="margin-left: 6px;">(\u2191 ${window.formatHF(hfDiff)})</span>`;
                else if (hfDiff < 0) hfDeltaHtml = `<span class="delta-down" style="margin-left: 6px;">(\u2193 ${window.formatHF(Math.abs(hfDiff))})</span>`;
            }
        }

        const roster = window.State.tqcRoster || [];
        const isVerified = roster.some(m => m.toLowerCase() === p.name?.toLowerCase());
        const nameBadge = isVerified ? ' <span title="Verified TQC Member" style="color: var(--accent-gold); font-size: 0.75em; border: 1px solid var(--accent-gold); padding: 1px 4px; border-radius: 2px; vertical-align: middle; margin-left: 5px;">V</span>' : '';

        // Override displayed alliance based on roster truth
        let displayedAlliance = p.alliance || "";
        const isTqcTagged = (p.alliance || "").toUpperCase() === "TQC";
        if (roster.length > 0) {
            if (isVerified) displayedAlliance = "TQC";
            else if (isTqcTagged) displayedAlliance = ""; // Hide stale TQC tag
        }

        const allianceHtml = displayedAlliance ? `<span style="color: var(--accent);">${window.escapeHtml(displayedAlliance)}</span>` : '<span style="color:var(--text-muted)">—</span>';

        return `
        <tr data-alliance="${window.escapeHtml(displayedAlliance)}">
            <td style="cursor: pointer; color: var(--accent); text-decoration: underline;" class="player-name-link" data-player="${window.escapeHtml(p.name)}">${window.escapeHtml(p.name)}${nameBadge} ${rankDeltaHtml}</td>
            <td>${allianceHtml}</td>
            <td>${window.formatHF(p.hf)} ${hfDeltaHtml}</td>
            <td>${p.anthill.toLocaleString()}</td>
            <td>${p.tech.toLocaleString()}</td>
            <td>${p.fight.toLocaleString()}</td>
        </tr>`;
    }).join("");
}, 250); // 250ms debounce

const unitMap = {
    0: "Young Dwarf", 1: "Dwarf", 2: "Elite Dwarf",
    3: "Young S", 4: "Soldier", 5: "Door K", 6: "Elite Door K",
    7: "Artillery", 8: "Elite Art", 9: "Elite S", 
    10: "Tank", 11: "Elite Tank", 12: "Killer", 13: "Elite Killer"
};

window.renderIntelTable = function(list) {
    const tbody = document.getElementById("intelTableBody");
    tbody.innerHTML = "";

    list.forEach(player => {
        const tr = document.createElement("tr");

        let techStr = "—";
        if (player.tech && (player.tech.weapons !== null || player.tech.shield !== null || player.tech.nest !== null)) {
            const parts = [];
            if (player.tech.weapons !== null) parts.push(`W:${player.tech.weapons}`);
            if (player.tech.shield !== null) parts.push(`S:${player.tech.shield}`);
            if (player.tech.nest !== null) parts.push(`N:${player.tech.nest}`);
            
            const confClass = player.tech.confidence === "calculated" ? "tech-high" : "tech-est";
            techStr = `<span class="${confClass}">${parts.join(" | ")}</span>`;
        }

        let totalTroops = 0;
        let troopDetails = [];
        if (player.troops) {
            for (const [unit, count] of Object.entries(player.troops)) {
                totalTroops += count;
                troopDetails.push(`${unitMap[unit] || "Unit "+unit}: ${window.formatCompact(count)}`);
            }
        }
        
        const troopStr = totalTroops > 0 
            ? `<span title="${troopDetails.join('&#10;')}">${window.formatCompact(totalTroops)} total</span>`
            : "—";

        tr.innerHTML = `
            <td><strong>${window.escapeHtml(player.name)}</strong><br><span style="font-size:0.8em;color:var(--text-dim)">(from ${player.reports} reports)</span></td>
            <td>${troopStr}</td>
            <td>${techStr}</td>
            <td>${window.timeAgo(player.lastSeen)}</td>
        `;
        tbody.appendChild(tr);
    });
};

window.loadIntel = async function() {
    const tbody = document.getElementById("intelTableBody");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='4' class='loading-cell'>Loading intel...</td></tr>";

    try {
        const response = await window.fetchCached(`${window.State.WORKER_URL}/intel/list`, {
            headers: { "Authorization": `Bearer ${window.State.adminSession.token}` }
        });

        if (!response.ok) throw new Error("Failed to load intel");

        const data = await response.json();
        const list = data.list || [];

        window.State.intelDataSnapshot = list;

        if (list.length === 0) {
            tbody.innerHTML = "<tr><td colspan='4'>No intel found</td></tr>";
        } else {
            window.renderIntelTable(list);
        }

        // Always render Visual Intel that relies on this dataset, even if empty, so the UI has charts.
        window.renderActivityHeatmap(list);
        
        // Refresh Intelligence Charts with current filters
        const allianceFilter = document.getElementById("intelAllianceFilter")?.value || "ALL";
        
        if (window.State.hfDataSnapshot) {
            const minHF = parseInt(document.getElementById("gcMinHF")?.value, 10) || 100000;
            const maxHF = parseInt(document.getElementById("gcMaxHF")?.value, 10) || 1000000000;
            window.renderGlassCannonChart(window.State.hfDataSnapshot, list, minHF, maxHF, allianceFilter);
            window.renderProfilerChart(window.State.hfDataSnapshot, allianceFilter);
        }

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan='4' style="color: var(--error);">Error: ${window.escapeHtml(err.message)}</td></tr>`;
    }
};

window.filterIntelTable = window.debounce(function() {
    const term = document.getElementById("intelSearchInput").value.toLowerCase();
    const rows = document.querySelectorAll("#intelTableBody tr");

    rows.forEach(row => {
        if (row.cells.length < 4) return;
        const name = row.cells[0].textContent.toLowerCase();
        row.style.display = name.includes(term) ? "" : "none";
    });
}, 250);