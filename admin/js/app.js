/**
 * Main Application Orchestration (admin/js/app.js)
 */

document.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("HM_AdminSession");
    if (saved) {
        window.State.adminSession = JSON.parse(saved);
        showDashboard();
    }

    // Auth Listeners
    document.getElementById("loginBtn").addEventListener("click", handleLogin);
    document.getElementById("adminKey").addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleLogin();
    });
    document.getElementById("logoutBtn").addEventListener("click", window.handleLogout);

    // Tab switching
    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    // Sub-Modals & Tab Switching (History)
    document.getElementById("closeHistoryModal")?.addEventListener("click", () => {
        document.getElementById("playerHistoryModal").classList.add("hidden");
    });
    document.getElementById("closeAllianceHistoryModal")?.addEventListener("click", () => {
        document.getElementById("allianceHistoryModal").classList.add("hidden");
    });

    // ⌘K Command Palette
    window.CmdPalette?.initListeners();

    // Inject ⌘K hint button into header
    const header = document.querySelector("header");
    if (header) {
        const hint = document.createElement("button");
        hint.className = "cmd-hint";
        hint.title = "Open command palette";
        hint.innerHTML = '<kbd>⌘</kbd><kbd>K</kbd><span>Search</span>';
        hint.addEventListener("click", () => window.CmdPalette?.open());
        // Insert before logout button
        const logout = document.getElementById("logoutBtn");
        if (logout) header.insertBefore(hint, logout);
    }

    // War Room — click-to-copy on HF values via class
    document.addEventListener("click", (e) => {
        const cell = e.target.closest(".hf-copy");
        if (cell) {
            navigator.clipboard.writeText(cell.dataset.val || cell.textContent.trim()).then(() => {
                const orig = cell.textContent;
                cell.textContent = "Copied";
                setTimeout(() => { cell.textContent = orig; }, 1000);
            });
        }
    });

    document.querySelectorAll(".history-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const parentNav = tab.closest(".history-tabs");
            if (parentNav) {
                parentNav.querySelectorAll(".history-tab").forEach(t => t.classList.remove("active"));
            }
            const modalContent = tab.closest(".modal-content");
            if (modalContent) {
                modalContent.querySelectorAll(".history-tab-content").forEach(c => c.classList.add("hidden"));
            }
            tab.classList.add("active");
            document.getElementById(tab.dataset.target)?.classList.remove("hidden");
        });
    });

    // ═══════════════════════════════════════════════════════════
    // FILTERING & SORTING BUTTONS
    // ═══════════════════════════════════════════════════════════
    document.getElementById("intelSearchInput").addEventListener("input", window.filterIntelTable);
    document.getElementById("intelRefreshBtn").addEventListener("click", window.withRefresh(window.loadIntel));

    const syncIntelFilters = (val) => {
        const f1 = document.getElementById("intelAllianceFilter");
        const f2 = document.getElementById("intelAllianceFilter2");
        if (f1 && f1.value !== val) f1.value = val;
        if (f2 && f2.value !== val) f2.value = val;

        if (window.State.hfDataSnapshot) {
            window.renderProfilerChart(window.State.hfDataSnapshot, val);
            const minHF = parseInt(document.getElementById("gcMinHF")?.value, 10) || 100000;
            const maxHF = parseInt(document.getElementById("gcMaxHF")?.value, 10) || 1000000000;
            window.renderGlassCannonChart(window.State.hfDataSnapshot, window.State.intelDataSnapshot, minHF, maxHF, val);
        }
    };

    document.getElementById("intelAllianceFilter")?.addEventListener("change", (e) => syncIntelFilters(e.target.value));
    document.getElementById("intelAllianceFilter2")?.addEventListener("change", (e) => syncIntelFilters(e.target.value));

    document.getElementById("visualIntelRefreshBtn")?.addEventListener("click", window.withRefresh(async () => {
        await window.loadHFLatest();
        await window.loadIntel();
        // Charts are rendered inside loadIntel, but we ensure the filter is respected
        const filterVal = document.getElementById("intelAllianceFilter")?.value || "ALL";
        syncIntelFilters(filterVal);
    }));

    document.getElementById("btnUpdateGC")?.addEventListener("click", () => {
        if (window.State.hfDataSnapshot) {
            const minHF = parseInt(document.getElementById("gcMinHF")?.value, 10) || 100000;
            const maxHF = parseInt(document.getElementById("gcMaxHF")?.value, 10) || 1000000000;
            const filterVal = document.getElementById("intelAllianceFilter")?.value || "ALL";
            window.renderGlassCannonChart(window.State.hfDataSnapshot, window.State.intelDataSnapshot, minHF, maxHF, filterVal);
        }
    });

    document.getElementById("searchInput").addEventListener("input", window.filterHFTable);
    document.getElementById("allianceFilter").addEventListener("change", window.filterHFTable);
    document.getElementById("refreshBtn")?.addEventListener("click", window.withRefresh(() => {
        window.loadHFLatest(); 
        loadDashboard(); 
    }));

    document.getElementById("alliancesRefreshBtn")?.addEventListener("click", window.withRefresh(window.loadAlliances));
    
    // Sort Listeners
    document.querySelectorAll("#hfTable th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.sort;
            if (window.State.playerSortCol === col) {
                window.State.playerSortDesc = !window.State.playerSortDesc;
            } else {
                window.State.playerSortCol = col;
                window.State.playerSortDesc = (col !== "rank" && col !== "name");
            }
            window.loadHFLatest();
        });
    });

    document.querySelectorAll("#alliancesTable th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.dataset.sort;
            if (window.State.allianceSortCol === col) {
                window.State.allianceSortDesc = !window.State.allianceSortDesc;
            } else {
                window.State.allianceSortCol = col;
                window.State.allianceSortDesc = (col !== "rank" && col !== "name");
            }
            window.loadAlliances();
        });
    });

    document.getElementById("logFilter").addEventListener("change", () => {
        window.State.currentPage = 1;
        loadLogs();
    });

    document.getElementById("refreshLogs").addEventListener("click", window.withRefresh(loadLogs));
    document.getElementById("prevLogs").addEventListener("click", () => changePage(-1));
    document.getElementById("nextLogs").addEventListener("click", () => changePage(1));

    // Token Management UI
    document.getElementById("createTokenBtn").addEventListener("click", showCreateTokenModal);
    document.getElementById("cancelCreateToken").addEventListener("click", hideCreateTokenModal);
    document.getElementById("confirmCreateToken").addEventListener("click", createToken);
    document.getElementById("copyToken").addEventListener("click", copyTokenToClipboard);

    // ═══════════════════════════════════════════════════════════
    // EVENT DELEGATION FOR TABLES
    // ═══════════════════════════════════════════════════════════

    // 1. HF Tracker (Player List) Event Delegation
    const hfBody = document.getElementById("hfBody");
    if (hfBody) {
        hfBody.addEventListener("click", (e) => {
            const playerLink = e.target.closest(".player-name-link");
            if (playerLink) {
                const playerName = playerLink.dataset.player;
                if (playerName) openPlayerHistoryModal(playerName);
            }
        });
    }

    // Strike queue / diff table — player-name-link opens history modal
    document.getElementById("strikeTableBody")?.addEventListener("click", (e) => {
        const link = e.target.closest(".player-name-link");
        if (link?.dataset.player) openPlayerHistoryModal(link.dataset.player);
    });
    document.getElementById("diffTableBody")?.addEventListener("click", (e) => {
        const link = e.target.closest(".player-name-link");
        if (link?.dataset.player) openPlayerHistoryModal(link.dataset.player);
    });

    // 2. Alliance Rankings Event Delegation
    const alliancesBody = document.getElementById("alliancesTableBody");
    if (alliancesBody) {
        alliancesBody.addEventListener("click", (e) => {
            // Alliance Name Clicked
            const allianceLink = e.target.closest(".alliance-name-link");
            if (allianceLink) {
                const allianceName = allianceLink.dataset.alliance;
                if (allianceName) openAllianceHistoryModal(allianceName);
                return;
            }

            // Chart Button Clicked
            const chartBtn = e.target.closest(".btn-chart-alliance");
            if (chartBtn) {
                const allianceName = chartBtn.dataset.alliance;
                if (allianceName) {
                    window.State.activeChartTargets = [allianceName];
                    window.renderAllianceHistoryChart(window.State.allianceHistoryData, window.State.activeChartTargets);
                    window.loadAlliances(); // Refresh checkboxes
                }
                return;
            }

            // Checkbox Toggled
            const checkbox = e.target.closest(".chart-toggle");
            if (checkbox) {
                // Must let the browser check the box first, then process
                setTimeout(() => {
                    const checkedBoxes = Array.from(document.querySelectorAll(".chart-toggle:checked"));
                    const selectedAlliances = checkedBoxes.map(box => box.dataset.alliance);
                    
                    if (selectedAlliances.length > 0) {
                        window.State.activeChartTargets = selectedAlliances;
                        window.renderAllianceHistoryChart(window.State.allianceHistoryData, window.State.activeChartTargets);
                    } else {
                        checkbox.checked = true;
                        window.State.activeChartTargets = [checkbox.dataset.alliance || "TQC"];
                        window.renderAllianceHistoryChart(window.State.allianceHistoryData, window.State.activeChartTargets);
                    }
                }, 0);
            }
        });
    }

    // 3. Tokens Event Delegation 
    const tokensBody = document.getElementById("tokensBody");
    if (tokensBody) {
        tokensBody.addEventListener("click", (e) => {
            const revokeBtn = e.target.closest(".btn-danger-revoke");
            if (revokeBtn) {
                const tokenId = revokeBtn.dataset.id;
                const ign = revokeBtn.dataset.ign;
                if (tokenId && ign) revokeToken(tokenId, ign);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // VOLTRON PATTERN COMPLIANCE
    // ═══════════════════════════════════════════════════════════
    window.TabManager = { switch: switchTab };
    window.ModalManager = {
        openPlayer: openPlayerHistoryModal,
        openAlliance: openAllianceHistoryModal,
        openPvp: window.openPvpModal
    };
    window.PageActions = { search: () => window.CmdPalette?.open() };
    window.KanbanManager = { init: () => console.log("[Voltron] Kanban logic is currently handled by War Room anomalies.") };
});

// ═══════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════
async function handleLogin() {
    const key = document.getElementById("adminKey").value.trim();
    if (!key) { window.showError("Enter the Admin Key"); return; }
    const btn = document.getElementById("loginBtn");
    btn.disabled = true; btn.textContent = "...";

    try {
        const response = await fetch(`${window.State.WORKER_URL}/admin/auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adminKey: key })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Authentication failed");
        }
        const data = await response.json();
        window.State.adminSession = { token: data.token };
        localStorage.setItem("HM_AdminSession", JSON.stringify(window.State.adminSession));
        showDashboard();
    } catch (err) { window.showError(err.message); } 
    finally { btn.disabled = false; btn.textContent = "Authenticate"; }
}

window.handleLogout = function() {
    window.State.adminSession = null;
    localStorage.removeItem("HM_AdminSession");
    document.getElementById("dashboardScreen").classList.remove("active");
    document.getElementById("loginScreen").classList.add("active");
    document.getElementById("adminKey").value = "";
};

function showDashboard() {
    document.getElementById("loginScreen").classList.remove("active");
    document.getElementById("dashboardScreen").classList.add("active");

    const headers = { "Authorization": `Bearer ${window.State.adminSession.token}` };
    const W = window.State.WORKER_URL;

    document.getElementById("freshnessText").textContent = "Syncing...";

    // Fire all 8 endpoints in ONE parallel batch — eliminates all duplicate requests
    Promise.all([
        window.fetchCached(`${W}/admin/players/history`,   { headers }),
        window.fetchCached(`${W}/admin/tokens`,            { headers }),
        window.fetchCached(`${W}/admin/logs?event=hf_submit&page=1&limit=1`, { headers }),
        window.fetchCached(`${W}/admin/diplomacy`,         { headers }),
        window.fetchCached(`${W}/admin/alliances/history`, { headers }),
        window.fetchCached(`${W}/admin/economy`,           { headers }),
        window.fetchCached(`${W}/intel/list`,              { headers }),
        window.fetchCached(`${W}/admin/logs?page=1&limit=50`, { headers })
    ]).then(async ([histRes, tokRes, logsOneRes, diploRes, alliHistRes, econRes, intelRes, logsRes]) => {

        const [histData, tokData, logsOneData, diploData, alliHistData, econData, intelData, logsData] = await Promise.all([
            histRes.ok     ? histRes.json()      : [],
            tokRes.ok      ? tokRes.json()       : { tokens: [] },
            logsOneRes.ok  ? logsOneRes.json()   : { logs: [] },
            diploRes.ok    ? diploRes.json()     : { pacts: [], wars: [] },
            alliHistRes.ok ? alliHistRes.json()  : [],
            econRes.ok     ? econRes.json()      : null,
            intelRes.ok    ? intelRes.json()     : { list: [] },
            logsRes.ok     ? logsRes.json()      : { logs: [] }
        ]);

        // Distribute into State
        window.State.playerHistoryData   = Array.isArray(histData) ? histData : [];
        window.State.diplomacyData       = diploData;
        window.State.allianceHistoryData = Array.isArray(alliHistData) ? alliHistData : [];
        window.State.intelDataSnapshot   = intelData?.list || (Array.isArray(intelData) ? intelData : []);

        const latestPlayers = window.State.playerHistoryData[0]?.data || [];
        window.State.hfDataSnapshot     = latestPlayers;
        window.State.hfPreviousSnapshot = window.State.playerHistoryData[1]?.data || null;

        // Dashboard KPIs + charts
        _renderDashboardFromState(histData, tokData, logsOneData);

        // Economy
        if (econData) window.renderEconomyChart(econData);

        // Tokens table
        _renderTokensFromState(tokData);

        // Logs table
        _renderLogsFromState(logsData);

        // Alliances (reads from State — no re-fetch)
        if (window.State.allianceHistoryData.length > 0) {
            window.loadAlliances();
        }

        // HF table + Visual Intel charts
        if (latestPlayers.length > 0) {
            window.filterHFTable();
            _populateAllianceFilters(latestPlayers);
            const minHF = parseInt(document.getElementById("gcMinHF")?.value, 10) || 100000;
            const maxHF = parseInt(document.getElementById("gcMaxHF")?.value, 10) || 1000000000;
            window.renderGlassCannonChart(latestPlayers, window.State.intelDataSnapshot, minHF, maxHF);
            window.renderProfilerChart(latestPlayers, "ALL");
        }

        // Heatmap
        if (window.State.intelDataSnapshot.length > 0) {
            window.renderActivityHeatmap(window.State.intelDataSnapshot);
        }

        // Snapshot diff
        window.initSnapshotDiff(window.State.playerHistoryData);

        // Diplomacy
        if (window.Diplomacy) {
            window.Diplomacy.initListeners();
            window.Diplomacy.render();
        }

        console.log("[HiveMind] Bootstrap complete — 8 endpoints, 2 parallel rounds");

    }).catch(err => {
        console.error("[HiveMind] Bootstrap failed, falling back:", err);
        loadDashboard();
        window.loadHFLatest();
        window.loadIntel();
        window.loadAlliances();
    });

    loadTokens(); // tokens tab loads independently
}

function _populateAllianceFilters(players) {
    const alliances = [...new Set(players.filter(p => p.alliance).map(p => p.alliance))].sort();
    [["intelAllianceFilter","All Alliances"],["intelAllianceFilter2","Server Average"]].forEach(([id, def]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const cur = el.value;
        el.innerHTML = `<option value="ALL">${def}</option>`;
        alliances.forEach(a => { const o = document.createElement("option"); o.value = a; o.textContent = a; el.appendChild(o); });
        if ([...el.options].some(o => o.value === cur)) el.value = cur;
    });
}

function _renderTokensFromState(tokData) {
    const tbody = document.getElementById("tokensBody");
    if (!tbody) return;
    const tokens = tokData?.tokens || [];
    if (!tokens.length) { tbody.innerHTML = "<tr><td colspan='4'>No tokens yet. Create one.</td></tr>"; return; }
    tbody.innerHTML = tokens.map(t => `<tr>
        <td><strong>${window.escapeHtml(t.ign)}</strong></td>
        <td>${t.role}</td>
        <td>${window.formatDate(t.created_at)}</td>
        <td><button class="btn-danger btn-danger-revoke" data-id="${t.id}" data-ign="${window.escapeHtml(t.ign)}">Revoke</button></td>
    </tr>`).join("");
}

function _renderLogsFromState(logsData) {
    const tbody = document.getElementById("logsBody");
    if (!tbody) return;
    const logs = logsData?.logs || [];
    if (!logs.length) { tbody.innerHTML = "<tr><td colspan='4'>No logs found</td></tr>"; return; }
    tbody.innerHTML = logs.map(log => `<tr>
        <td>${window.formatDate(log.timestamp)}</td>
        <td><strong>${log.event}</strong></td>
        <td>${window.escapeHtml(log.ign || log.submittedBy || "—")}</td>
        <td>${formatLogDetails(log)}</td>
    </tr>`).join("");
    document.getElementById("logPage").textContent = `Page ${window.State.currentPage}`;
    document.getElementById("prevLogs").disabled = window.State.currentPage === 1;
    document.getElementById("nextLogs").disabled = logs.length < 50;
}

function _renderDashboardFromState(histData, tokData, logsOneData) {
    try {
        const players    = (histData[0]?.data || []).map(p => ({
            ...p, prev_hf: histData[1]?.data?.find(x => x.name?.toLowerCase() === p.name?.toLowerCase())?.hf || null
        }));
        const tokens     = tokData?.tokens || [];
        const tqcPlayers = players.filter(p => p.alliance?.toUpperCase() === "TQC");

        document.getElementById("kpiPlayers").textContent      = tqcPlayers.length;
        document.getElementById("kpiPlayersDetail").textContent = tqcPlayers.length > 0 ? "TQC members on record" : "No TQC data yet";

        const totalHF     = tqcPlayers.reduce((s, p) => s + (p.hf || 0), 0);
        const totalPrevHF = tqcPlayers.reduce((s, p) => s + (p.prev_hf ?? p.hf ?? 0), 0);
        document.getElementById("kpiTotalHF").textContent      = window.formatCompact(totalHF);
        document.getElementById("kpiTotalHFDetail").textContent = totalHF > 0 ? totalHF.toLocaleString() + " total" : "No data";

        let gains = 0, losses = 0;
        tqcPlayers.forEach(p => {
            const diff = (p.hf || 0) - (p.prev_hf ?? p.hf ?? 0);
            if (diff > 0) gains += diff; else if (diff < 0) losses += Math.abs(diff);
        });
        const net = gains - losses, cycled = Math.min(gains, losses);
        const deltaEl = document.getElementById("kpiTotalHFDelta");
        if (deltaEl && (net !== 0 || cycled > 0)) {
            const pct = totalPrevHF > 0 ? ((Math.abs(net) / totalPrevHF) * 100).toFixed(1) : "0.0";
            const cls = net > 0 ? "delta-up" : net < 0 ? "delta-down" : "text-muted";
            const arr = net > 0 ? "▲" : net < 0 ? "▼" : "—";
            let html = net !== 0 ? `<span class="${cls}">${arr} ${window.formatCompact(Math.abs(net))} Net (${pct}%)</span>` : `<span class="text-muted" style="font-size:14px;">No Net Change</span>`;
            if (cycled > 0) html += `<div style="font-size:0.85em;margin-top:4px;color:var(--text-muted);font-family:var(--font-pixel);">≈ ${window.formatCompact(cycled)} cycled</div>`;
            deltaEl.innerHTML = html;
        }

        tqcPlayers.sort((a, b) => b.hf - a.hf);
        if (tqcPlayers.length > 0) {
            document.getElementById("kpiTopPlayer").textContent      = window.formatCompact(tqcPlayers[0].hf);
            document.getElementById("kpiTopPlayerDetail").textContent = tqcPlayers[0].name;
        }
        document.getElementById("kpiTokens").textContent      = tokens.length;
        document.getElementById("kpiTokensDetail").textContent = tokens.length > 0 ? "Authorized users" : "None issued";

        const ts = logsOneData?.logs?.[0]?.timestamp || histData[0]?.timestamp || 0;
        if (ts > 0) {
            document.getElementById("freshnessText").textContent = `Last sync: ${window.timeAgo(ts)}`;
            const banner = document.getElementById("freshnessBanner");
            if (banner) {
                const ageMin = (Date.now() - ts) / 60000;
                banner.className = "freshness-banner" + (ageMin < 30 ? " fresh" : ageMin < 1440 ? " stale" : " old");
            }
        }

        window.State.playerHistoryData = histData;
        window.initSnapshotDiff(histData);
        window.renderDashboardChart(tqcPlayers.slice(0, 15));
        renderTopList(tqcPlayers.slice(0, 10));
        if (histData.length > 0) window.renderTrendChart(histData);

    } catch (err) { console.error("Dashboard render error:", err); }
}


function switchTab(tabName) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
    document.getElementById(`${tabName}Tab`).classList.add("active");

    // Initialize/Refresh Realm Graph if switching to visualIntel.
    // CRITICAL: defer init until AFTER the browser has painted the tab at full size.
    // If init() fires while display:none is still resolving, the canvas gets 0px height
    // and vis-network stores that — causing the "nodes in top half, black void" split.
    if (tabName === "visualIntel" && window.RealmGraph) {
        if (!window.RealmGraph.network) {
            // Double rAF ensures the tab's layout is fully committed before vis measures it
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    window.RealmGraph.init();
                    window.RealmGraph.loadData();
                });
            });
        } else {
            // Already initialized — just refresh data and refit
            window.RealmGraph.loadData();
            setTimeout(() => {
                if (window.RealmGraph.network) {
                    window.RealmGraph.network.setSize('100%', '100%');
                    window.RealmGraph.network.redraw();
                    window.RealmGraph.network.fit({ animation: false });
                }
            }, 50);
        }
    }

    // War Room — render all widgets on first visit
    if (tabName === "warroom") {
        window.renderAnomalyFeed();
        window.renderContributionChart();
        // Populate snapshot diff dropdowns
        if (window.State.playerHistoryData) {
            window.initSnapshotDiff(window.State.playerHistoryData);
        }
    }

    // Diplomacy — render table on visit
    if (tabName === "diplomacy") {
        window.Diplomacy?.renderDiploTable();
    }
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD KPI MATH
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
    try {
        const headers = { "Authorization": `Bearer ${window.State.adminSession.token}` };
        const [histRes, tokRes, logsRes] = await Promise.all([
            window.fetchCached(`${window.State.WORKER_URL}/admin/players/history`, { headers }),
            window.fetchCached(`${window.State.WORKER_URL}/admin/tokens`, { headers }),
            window.fetchCached(`${window.State.WORKER_URL}/admin/logs?event=hf_submit&page=1&limit=1`, { headers })
        ]);

        const [histData, tokData, logsData] = await Promise.all([
            histRes.ok ? histRes.json() : [],
            tokRes.ok ? tokRes.json() : { tokens: [] },
            logsRes.ok ? logsRes.json() : { logs: [] }
        ]);

        const players = (histData[0]?.data || []).map(p => ({
            ...p,
            prev_hf: histData[1]?.data?.find(x => x.name?.toLowerCase() === p.name?.toLowerCase())?.hf || null,
            ts: histData[0]?.timestamp || Date.now(),
            by: "snapshot"
        }));

        const tokens = tokData.tokens || [];
        const tqcPlayers = players.filter(p => p.alliance && p.alliance.toUpperCase() === "TQC");

        document.getElementById("kpiPlayers").textContent = tqcPlayers.length;
        document.getElementById("kpiPlayersDetail").textContent = tqcPlayers.length > 0 ? "TQC members on record" : "No TQC data yet";

        const totalHF = tqcPlayers.reduce((sum, p) => sum + (p.hf || 0), 0);
        const totalPrevHF = tqcPlayers.reduce((sum, p) => sum + (p.prev_hf !== null ? p.prev_hf : (p.hf || 0)), 0);
        
        document.getElementById("kpiTotalHF").textContent = window.formatCompact(totalHF);
        document.getElementById("kpiTotalHFDetail").textContent = totalHF > 0 ? totalHF.toLocaleString() + " total" : "No data";

        let internalGains = 0, internalLosses = 0;
        tqcPlayers.forEach(p => {
            const prev = p.prev_hf !== null ? p.prev_hf : (p.hf || 0);
            const diff = (p.hf || 0) - prev;
            if (diff > 0) internalGains += diff;
            if (diff < 0) internalLosses += Math.abs(diff);
        });

        const netDelta = internalGains - internalLosses;
        const cycled = Math.min(internalGains, internalLosses);
        const deltaEl = document.getElementById("kpiTotalHFDelta");
        if (deltaEl) {
            if (netDelta !== 0 || cycled > 0) {
                const pct = totalPrevHF > 0 ? ((Math.abs(netDelta) / totalPrevHF) * 100).toFixed(1) : "0.0";
                const arrow = netDelta > 0 ? "\u25B2" : (netDelta < 0 ? "\u25BC" : "—");
                const cls = netDelta > 0 ? "delta-up" : (netDelta < 0 ? "delta-down" : "text-muted");
                
                let html = "";
                if (netDelta !== 0) {
                    html += `<span class="${cls}">${arrow} ${window.formatCompact(Math.abs(netDelta))} Net (${pct}%)</span>`;
                } else {
                    html += `<span class="text-muted" style="display:inline-block; font-size:14px; font-weight:normal;">No Net Change</span>`;
                }
                if (cycled > 0) {
                    html += `<div style="font-size: 0.85em; margin-top: 4px; color: var(--text-muted); font-weight: normal; font-family: var(--font-pixel);">≈ ${window.formatCompact(cycled)} cycled internally</div>`;
                }
                deltaEl.innerHTML = html;
            } else {
                deltaEl.innerHTML = "";
            }
        }

        tqcPlayers.sort((a, b) => b.hf - a.hf);
        if (tqcPlayers.length > 0) {
            document.getElementById("kpiTopPlayer").textContent = window.formatCompact(tqcPlayers[0].hf);
            document.getElementById("kpiTopPlayerDetail").textContent = tqcPlayers[0].name;
        } else {
            document.getElementById("kpiTopPlayer").textContent = "—";
            document.getElementById("kpiTopPlayerDetail").textContent = "No data";
        }

        document.getElementById("kpiTokens").textContent = tokens.length;
        document.getElementById("kpiTokensDetail").textContent = tokens.length > 0 ? "Authorized users" : "None issued";

        let ts = 0;
        if (logsData && logsData.logs && logsData.logs.length > 0) {
            ts = logsData.logs[0].timestamp;
        } else if (histData.length > 0) {
            ts = histData[0].timestamp; 
        }

        if (ts > 0) {
            document.getElementById("freshnessText").textContent = `Last sync: ${window.timeAgo(ts)}`;
            const banner = document.getElementById("freshnessBanner");
            if (banner) {
                const ageMin = (Date.now() - ts) / 60000;
                banner.className = "freshness-banner" + (ageMin < 30 ? " fresh" : ageMin < 1440 ? " stale" : " old");
            }
        }

        window.renderDashboardChart(tqcPlayers.slice(0, 15));
        renderTopList(tqcPlayers.slice(0, 10));

        if (histData.length > 0) {
            window.renderTrendChart(histData);
            // Store for diff + PvP usage
            window.State.playerHistoryData = histData;
            window.initSnapshotDiff(histData);
        }

    } catch (err) { console.error("Dashboard error:", err); }
}

function renderTopList(players) {
    const container = document.getElementById("dashboardTopList");
    if (!container) return;
    if (players.length === 0) { container.innerHTML = '<div class="top-list-empty">No data collected yet</div>'; return; }
    container.innerHTML = players.map((p, i) => {
        let flag = "";
        if (p.prev_hf && p.prev_hf > 0) {
            const change = ((p.hf - p.prev_hf) / p.prev_hf) * 100;
            if (change < -10) flag = '<span class="anomaly-flag anomaly-drop" title="Significant HF loss detected">\u25BC</span>';
            else if (change > 20) flag = '<span class="anomaly-flag anomaly-spike" title="Large HF spike detected">\u25B2</span>';
        }
        return `
        <div class="top-list-item">
            <span class="top-list-rank">${i + 1}.</span>
            <span class="top-list-name">${window.escapeHtml(p.name)} ${flag}</span>
            <span class="top-list-value">${window.formatCompact(p.hf)}</span>
        </div>`;
    }).join("");
}

// ═══════════════════════════════════════════════════════════
// TOKENS & LOGS
// ═══════════════════════════════════════════════════════════
async function loadTokens() {
    const tbody = document.getElementById("tokensBody");
    tbody.innerHTML = "<tr><td colspan='4' class='loading-cell'>Loading...</td></tr>";
    try {
        const response = await window.fetchCached(`${window.State.WORKER_URL}/admin/tokens`, {
            headers: { "Authorization": `Bearer ${window.State.adminSession.token}` }
        });
        if (!response.ok) throw new Error("Failed to load tokens");
        const data = await response.json();
        if (data.tokens.length === 0) { tbody.innerHTML = "<tr><td colspan='4'>No tokens yet. Create one.</td></tr>"; return; }
        
        // Changed to use dataset attributes for event delegation
        tbody.innerHTML = data.tokens.map(t => `
            <tr>
                <td><strong>${window.escapeHtml(t.ign)}</strong></td>
                <td>${t.role}</td>
                <td>${window.formatDate(t.created_at)}</td>
                <td>
                    <button class="btn-danger btn-danger-revoke" data-id="${t.id}" data-ign="${window.escapeHtml(t.ign)}">
                        Revoke
                    </button>
                </td>
            </tr>
        `).join("");
    } catch (err) { tbody.innerHTML = `<tr><td colspan='4' style="color: var(--error);">Error: ${window.escapeHtml(err.message)}</td></tr>`; }
}
function showCreateTokenModal() {
    document.getElementById("createTokenModal").classList.remove("hidden");
    document.getElementById("newTokenIGN").value = "";
    document.getElementById("newTokenRole").value = "member";
    document.getElementById("generatedToken").classList.add("hidden");
}
function hideCreateTokenModal() { document.getElementById("createTokenModal").classList.add("hidden"); }
async function createToken() {
    const ign = document.getElementById("newTokenIGN").value.trim();
    const role = document.getElementById("newTokenRole").value;
    if (!ign) { alert("Enter an In-Game Name"); return; }
    const btn = document.getElementById("confirmCreateToken");
    btn.disabled = true; btn.textContent = "...";
    try {
        const response = await window.fetch(`${window.State.WORKER_URL}/admin/token/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${window.State.adminSession.token}` },
            body: JSON.stringify({ ign, role })
        });
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || "Failed to create token"); }
        const data = await response.json();
        document.getElementById("tokenValue").textContent = data.token;
        document.getElementById("generatedToken").classList.remove("hidden");
        loadTokens();
    } catch (err) { alert("Error: " + err.message); } 
    finally { btn.disabled = false; btn.textContent = "Generate"; }
}
function copyTokenToClipboard() {
    const token = document.getElementById("tokenValue").textContent;
    navigator.clipboard.writeText(token).then(() => {
        document.getElementById("copyToken").textContent = "Copied";
        setTimeout(() => { document.getElementById("copyToken").textContent = "Copy"; }, 2000);
    });
}
async function revokeToken(tokenId, ign) {
    if (!confirm(`Revoke token for ${ign}? They will lose access immediately.`)) return;
    try {
        const response = await window.fetch(`${window.State.WORKER_URL}/admin/token/${tokenId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${window.State.adminSession.token}` }
        });
        if (!response.ok) throw new Error("Failed to revoke token");
        loadTokens();
    } catch (err) { alert("Error: " + err.message); }
}

async function loadLogs() {
    const tbody = document.getElementById("logsBody");
    tbody.innerHTML = "<tr><td colspan='4' class='loading-cell'>Loading...</td></tr>";
    const filter = document.getElementById("logFilter").value;
    const params = new URLSearchParams({ page: window.State.currentPage, limit: 50 });
    if (filter) params.append("event", filter);
    try {
        const response = await window.fetchCached(`${window.State.WORKER_URL}/admin/logs?${params}`, {
            headers: { "Authorization": `Bearer ${window.State.adminSession.token}` }
        });
        if (!response.ok) throw new Error("Failed to load logs");
        const data = await response.json();
        if (data.logs.length === 0) { tbody.innerHTML = "<tr><td colspan='4'>No logs found</td></tr>"; return; }
        
        tbody.innerHTML = data.logs.map(log => `
            <tr>
                <td>${window.formatDate(log.timestamp)}</td>
                <td><strong>${log.event}</strong></td>
                <td>${window.escapeHtml(log.ign || log.submittedBy || "—")}</td>
                <td>${formatLogDetails(log)}</td>
            </tr>
        `).join("");
        
        document.getElementById("logPage").textContent = `Page ${window.State.currentPage}`;
        document.getElementById("prevLogs").disabled = window.State.currentPage === 1;
        document.getElementById("nextLogs").disabled = data.logs.length < 50;
    } catch (err) { tbody.innerHTML = `<tr><td colspan='4' style="color: var(--error);">Error: ${window.escapeHtml(err.message)}</td></tr>`; }
}

function changePage(delta) {
    window.State.currentPage += delta;
    if (window.State.currentPage < 1) window.State.currentPage = 1;
    loadLogs();
}

function formatLogDetails(log) {
    if (log.event === "hf_submit") return `${log.count || 0} players via ${log.source || "unknown"}`;
    if (log.event === "token_created") return `Created for ${log.ign || "?"} (${log.role || "member"})`;
    if (log.event === "token_revoked") return `Revoked for ${log.ign || "?"}`;
    const details = { ...log }; delete details.event; delete details.timestamp;
    const str = JSON.stringify(details);
    return str === "{}" ? "—" : window.escapeHtml(str);
}

// ═══════════════════════════════════════════════════════════
// HISTORY MODALS (Abstracted from tracker.js)
// ═══════════════════════════════════════════════════════════
async function openPlayerHistoryModal(playerName) {
    const modal = document.getElementById("playerHistoryModal");
    const title = document.getElementById("historyModalTitle");
    modal.classList.remove("hidden");
    title.textContent = `Player Intelligence: ${playerName}`;

    document.getElementById("historyModalMaxHF").textContent = "Loading...";
    document.getElementById("historyModalMaxTech").textContent = "Loading...";
    document.getElementById("historyModalMaxAnthill").textContent = "Loading...";
    document.getElementById("historyModalMaxFight").textContent = "Loading...";
    document.getElementById("historyDetailedBody").innerHTML = "<tr><td colspan='5' class='loading-cell'>Loading...</td></tr>";

    if (window.State.charts.playerHistory) {
        window.State.charts.playerHistory.destroy();
        window.State.charts.playerHistory = null;
    }

    try {
        const response = await window.fetchCached(`${window.State.WORKER_URL}/admin/players/history`, {
            headers: { "Authorization": `Bearer ${window.State.adminSession.token}` }
        });
        if (!response.ok) throw new Error("Failed to load history");

        const data = await response.json();
        const historyData = Array.isArray(data) ? data : [];
        const playerChronology = [];
        let maxHF = 0, maxTech = 0, maxAnthill = 0, maxFight = 0;

        [...historyData].reverse().forEach(snapshot => {
            const p = snapshot.data.find(x => x.name.toLowerCase() === playerName.toLowerCase());
            if (p) {
                playerChronology.push({ ts: snapshot.timestamp, ...p });
                if (p.hf > maxHF) maxHF = p.hf;
                if (p.tech > maxTech) maxTech = p.tech;
                if (p.anthill > maxAnthill) maxAnthill = p.anthill;
                if (p.fight > maxFight) maxFight = p.fight;
            }
        });

        if (playerChronology.length === 0) {
            document.getElementById("historyDetailedBody").innerHTML = "<tr><td colspan='5'>No historical data found.</td></tr>";
            return;
        }

        document.getElementById("historyModalMaxHF").textContent = window.formatCompact(maxHF);
        document.getElementById("historyModalMaxTech").textContent = maxTech.toLocaleString();
        document.getElementById("historyModalMaxAnthill").textContent = maxAnthill.toLocaleString();
        document.getElementById("historyModalMaxFight").textContent = window.formatCompact(maxFight);

        const tbody = document.getElementById("historyDetailedBody");
        tbody.innerHTML = [...playerChronology].reverse().map(p => `
            <tr>
                <td>${new Date(p.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })} <span style="font-size:0.8em;color:var(--text-muted)">${new Date(p.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span></td>
                <td>${window.formatHF(p.hf)}</td>
                <td>${p.tech.toLocaleString()}</td>
                <td>${p.anthill.toLocaleString()}</td>
                <td>${window.formatHF(p.fight)}</td>
            </tr>
        `).join("");

        const labels = playerChronology.map(p => new Date(p.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        const ctx = document.getElementById("historyDetailedChart").getContext("2d");

        window.State.charts.playerHistory = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [
                    { label: "HF", data: playerChronology.map(p => p.hf || null), spanGaps: true, borderColor: window.CHART_THEME.accentGlow, backgroundColor: "transparent", yAxisID: 'y' },
                    { label: "Tech", data: playerChronology.map(p => p.tech || null), spanGaps: true, borderColor: window.CHART_THEME.muted, backgroundColor: "transparent", yAxisID: 'y1' },
                    { label: "Anthill", data: playerChronology.map(p => p.anthill || null), spanGaps: true, borderColor: window.CHART_THEME.maroon, backgroundColor: "transparent", yAxisID: 'y1' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font } }, grid: { color: window.CHART_THEME.grid } },
                    y: { type: 'linear', display: true, position: 'left', ticks: { color: window.CHART_THEME.accentGlow, font: { family: window.CHART_THEME.font }, callback: (v) => window.formatCompact(v) }, grid: { color: window.CHART_THEME.grid } },
                    y1: { type: 'linear', display: true, position: 'right', ticks: { color: window.CHART_THEME.maroon, font: { family: window.CHART_THEME.font } }, grid: { drawOnChartArea: false } }
                },
                plugins: {
                    legend: { labels: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font, size: 13 } } },
                    tooltip: { mode: 'index', intersect: false, backgroundColor: window.CHART_THEME.tooltipBg, titleFont: { family: window.CHART_THEME.font }, bodyFont: { family: window.CHART_THEME.font } }
                }
            }
        });

    } catch (err) { document.getElementById("historyDetailedBody").innerHTML = `<tr><td colspan='5' style="color:var(--error)">Error: ${window.escapeHtml(err.message)}</td></tr>`; }
}

async function openAllianceHistoryModal(allianceName) {
    const modal = document.getElementById("allianceHistoryModal");
    const title = document.getElementById("allianceHistoryModalTitle");
    modal.classList.remove("hidden");
    title.textContent = `Alliance Intelligence: ${allianceName}`;

    document.getElementById("allianceModalMaxHF").textContent = "Loading...";
    document.getElementById("allianceModalMaxAvgHF").textContent = "Loading...";
    document.getElementById("allianceModalMaxAnthill").textContent = "Loading...";
    document.getElementById("allianceModalMaxMembers").textContent = "Loading...";
    document.getElementById("allianceDetailedBody").innerHTML = "<tr><td colspan='5' class='loading-cell'>Loading...</td></tr>";

    if (window.State.charts.allianceHistoryModal) {
        window.State.charts.allianceHistoryModal.destroy();
        window.State.charts.allianceHistoryModal = null;
    }

    try {
        const response = await window.fetchCached(`${window.State.WORKER_URL}/admin/players/history`, {
            headers: { "Authorization": `Bearer ${window.State.adminSession.token}` }
        });
        if (!response.ok) throw new Error("Failed to load history");

        const data = await response.json();
        const historyData = Array.isArray(data) ? data : [];
        const allianceChronology = [];
        let maxHF = 0, maxAvgHF = 0, maxAnthill = 0, maxMembers = 0;

        [...historyData].reverse().forEach(snapshot => {
            const members = snapshot.data.filter(x => x.alliance === allianceName);
            if (members.length > 0) {
                const totalHF = members.reduce((sum, m) => sum + (m.hf || 0), 0);
                const totalAnthill = members.reduce((sum, m) => sum + (m.anthill || 0), 0);
                const avgHF = Math.floor(totalHF / members.length);
                const count = members.length;
                
                allianceChronology.push({ ts: snapshot.timestamp, hf: totalHF, avgHF: avgHF, anthill: totalAnthill, members: count });
                if (totalHF > maxHF) maxHF = totalHF;
                if (avgHF > maxAvgHF) maxAvgHF = avgHF;
                if (totalAnthill > maxAnthill) maxAnthill = totalAnthill;
                if (count > maxMembers) maxMembers = count;
            }
        });

        if (allianceChronology.length === 0) {
            document.getElementById("allianceDetailedBody").innerHTML = "<tr><td colspan='5'>No historical data found for this alliance.</td></tr>";
            return;
        }

        document.getElementById("allianceModalMaxHF").textContent = window.formatCompact(maxHF);
        document.getElementById("allianceModalMaxAvgHF").textContent = window.formatCompact(maxAvgHF);
        document.getElementById("allianceModalMaxAnthill").textContent = maxAnthill.toLocaleString();
        document.getElementById("allianceModalMaxMembers").textContent = maxMembers.toLocaleString();

        const tbody = document.getElementById("allianceDetailedBody");
        tbody.innerHTML = [...allianceChronology].reverse().map(a => `
            <tr>
                <td>${new Date(a.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })} <span style="font-size:0.8em;color:var(--text-muted)">${new Date(a.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span></td>
                <td>${window.formatHF(a.hf)}</td>
                <td><span style="color: #7ab8e8;">${window.formatHF(a.avgHF)}</span></td>
                <td>${a.anthill.toLocaleString()}</td>
                <td>${a.members.toLocaleString()}</td>
            </tr>
        `).join("");

        const labels = allianceChronology.map(a => new Date(a.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        const ctx = document.getElementById("allianceDetailedChart").getContext("2d");

        window.State.charts.allianceHistoryModal = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [
                    { label: "Total HF", data: allianceChronology.map(a => a.hf || null), spanGaps: true, borderColor: window.CHART_THEME.accentGlow, backgroundColor: "transparent", yAxisID: 'y' },
                    { label: "Avg HF/Memb", data: allianceChronology.map(a => a.avgHF || null), spanGaps: true, borderColor: '#7ab8e8', backgroundColor: "transparent", yAxisID: 'y1' },
                    { label: "Total Anthill", data: allianceChronology.map(a => a.anthill || null), spanGaps: true, borderColor: window.CHART_THEME.maroon, backgroundColor: "transparent", yAxisID: 'y1' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font } }, grid: { color: window.CHART_THEME.grid } },
                    y: { type: 'linear', display: true, position: 'left', ticks: { color: window.CHART_THEME.accentGlow, font: { family: window.CHART_THEME.font }, callback: (v) => window.formatCompact(v) }, grid: { color: window.CHART_THEME.grid } },
                    y1: { type: 'linear', display: true, position: 'right', ticks: { color: window.CHART_THEME.maroon, font: { family: window.CHART_THEME.font }, callback: (v) => window.formatCompact(v) }, grid: { drawOnChartArea: false } }
                },
                plugins: {
                    legend: { labels: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font, size: 13 } } },
                    tooltip: { mode: 'index', intersect: false, backgroundColor: window.CHART_THEME.tooltipBg, titleFont: { family: window.CHART_THEME.font }, bodyFont: { family: window.CHART_THEME.font } }
                }
            }
        });

    } catch (err) { document.getElementById("allianceDetailedBody").innerHTML = `<tr><td colspan='5' style="color:var(--error)">Error: ${window.escapeHtml(err.message)}</td></tr>`; }
}