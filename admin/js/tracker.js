/**
 * Table Rendering & Tracker Logic (admin/js/tracker.js)
 */

window.loadAlliances = async function() {
    const tbody = document.getElementById("alliancesTableBody");
    if (!tbody) return;
    
    tbody.innerHTML = "<tr><td colspan='7' class='loading-cell'>Loading Alliance Data...</td></tr>";

    try {
        const headers = { "Authorization": `Bearer ${window.State.adminSession.token}` };
        
        // Parallel Fetch: Diplomacy and History
        const [diploRes, histRes] = await Promise.all([
            window.fetchCached(`${window.State.WORKER_URL}/admin/diplomacy`, { headers }),
            window.fetchCached(`${window.State.WORKER_URL}/admin/alliances/history`, { headers })
        ]);

        const diploData = diploRes.ok ? await diploRes.json() : { pacts: [], wars: [] };
        window.State.diplomacyData = diploData;
        const pacts = diploData.pacts || [];
        const wars = diploData.wars || [];
        const historyData = histRes.ok ? await histRes.json() : [];
        
        if (!historyData || historyData.length === 0) {
            tbody.innerHTML = "<tr><td colspan='8'>No Alliance data scraped yet. Visit the rankings page in-game.</td></tr>";
            return;
        }

        window.State.allianceHistoryData = historyData;

        const latestSnapshot = historyData[0].data;
        if (!latestSnapshot || latestSnapshot.length === 0) {
            tbody.innerHTML = "<tr><td colspan='8'>Latest snapshot is empty.</td></tr>";
            return;
        }

        let previousSnapshot = null;
        if (historyData.length > 1) {
            previousSnapshot = historyData[1].data;
        }

        let sortedPacts = latestSnapshot.filter(a => pacts.includes(a.name));
        let sortedWars = latestSnapshot.filter(a => wars.includes(a.name));
        
        if (!window.State.activeChartTargets) {
            window.State.activeChartTargets = ["TQC"];
            if (sortedPacts.length > 0) window.State.activeChartTargets.push(...sortedPacts.slice(0, 2).map(a => a.name));
            if (sortedWars.length > 0) window.State.activeChartTargets.push(...sortedWars.slice(0, 2).map(a => a.name));
        }

        window.renderAllianceHistoryChart(historyData, window.State.activeChartTargets);

        latestSnapshot.forEach(a => {
            a.avghf = a.members > 0 ? Math.floor(a.hf / a.members) : 0;
        });

        latestSnapshot.sort((a, b) => {
            let valA = a[window.State.allianceSortCol];
            let valB = b[window.State.allianceSortCol];
            if (window.State.allianceSortCol === "name") {
                return window.State.allianceSortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
            }
            return window.State.allianceSortDesc ? (valB - valA) : (valA - valB);
        });

        document.querySelectorAll("#alliancesTable th.sortable").forEach(th => {
            const text = th.innerText.split(" ")[0]; 
            if (th.dataset.sort === window.State.allianceSortCol) {
                th.innerText = text + (window.State.allianceSortDesc ? " ↓" : " ↑");
            } else {
                th.innerText = text + " ↕";
            }
        });

        tbody.innerHTML = latestSnapshot.map(a => {
            const isTQC = a.name === "TQC";
            const isPact = pacts.includes(a.name);
            const isWar = wars.includes(a.name);
            const isChecked = (window.State.activeChartTargets && window.State.activeChartTargets.includes(a.name)) ? "checked" : "";

            let rowClass = '';
            if (isTQC) rowClass = 'style="background-color: rgba(220, 180, 50, 0.1); font-weight: bold;"';
            else if (isWar) rowClass = 'style="background-color: rgba(231, 76, 60, 0.1);"';
            else if (isPact) rowClass = 'style="background-color: rgba(46, 204, 113, 0.1);"';

            let nameHtml = window.escapeHtml(a.name);
            if (isTQC) nameHtml = `<span style="color: #dcb432;">[TQC]</span>`;
            else if (isWar) nameHtml += ` <span class="badge-war">WAR</span>`;
            else if (isPact) nameHtml += ` <span class="badge-pact">PACT</span>`;
            
            let rankDeltaHtml = "", hfDeltaHtml = "", membersDeltaHtml = "";
            
            if (previousSnapshot) {
                const prevA = previousSnapshot.find(p => p.name === a.name);
                if (prevA) {
                    const rankDiff = prevA.rank - a.rank;
                    if (rankDiff > 0) rankDeltaHtml = `<span class="delta-up">(↑ ${rankDiff})</span>`;
                    else if (rankDiff < 0) rankDeltaHtml = `<span class="delta-down">(↓ ${Math.abs(rankDiff)})</span>`;
                    
                    const hfDiff = a.hf - prevA.hf;
                    if (hfDiff > 0) hfDeltaHtml = `<span class="delta-up" style="margin-left: 6px;">(↑ ${window.formatHF(hfDiff)})</span>`;
                    else if (hfDiff < 0) hfDeltaHtml = `<span class="delta-down" style="margin-left: 6px;">(↓ ${window.formatHF(Math.abs(hfDiff))})</span>`;
                    
                    const memDiff = a.members - prevA.members;
                    if (memDiff > 0) membersDeltaHtml = `<span class="delta-up">(+${memDiff})</span>`;
                    else if (memDiff < 0) membersDeltaHtml = `<span class="delta-down">(${memDiff})</span>`;
                }
            }

            // Notice no onclick='' on the name or buttons here (Event Delegation handles it)
            return `
            <tr ${rowClass}>
                <td>#${a.rank} ${rankDeltaHtml}</td>
                <td style="cursor: pointer; color: var(--accent); text-decoration: underline;" class="alliance-name-link" data-alliance="${window.escapeHtml(a.name)}">${nameHtml}</td>
                <td>${window.formatHF(a.hf)} ${hfDeltaHtml}</td>
                <td><span style="color: #7ab8e8;">${window.formatHF(a.avghf)}</span></td>
                <td>${a.anthill.toLocaleString()}</td>
                <td>${a.tech.toLocaleString()}</td>
                <td>${a.fight.toLocaleString()}</td>
                <td>${a.members.toLocaleString()} ${membersDeltaHtml}</td>
                <td style="text-align:center;">
                    <button class="btn-chart btn-chart-alliance" title="View Chart" data-alliance="${window.escapeHtml(a.name)}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                    </button>
                    <input type="checkbox" class="chart-toggle" data-alliance="${window.escapeHtml(a.name)}" ${isChecked} title="Compare">
                </td>
            </tr>`;
        }).join("");

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan='8' style="color: var(--error);">Error: ${window.escapeHtml(err.message)}</td></tr>`;
    }
};

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
        
        const matchesTerm = name.includes(term) || rowAlliance.toLowerCase().includes(term);
        const matchesAlliance = alliance === "" || rowAlliance === alliance;
        
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

        const allianceHtml = p.alliance ? `<span style="color: var(--accent);">${window.escapeHtml(p.alliance)}</span>` : '<span style="color:var(--text-muted)">—</span>';

        return `
        <tr data-alliance="${window.escapeHtml(p.alliance || '')}">
            <td style="cursor: pointer; color: var(--accent); text-decoration: underline;" class="player-name-link" data-player="${window.escapeHtml(p.name)}">${window.escapeHtml(p.name)} ${rankDeltaHtml}</td>
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