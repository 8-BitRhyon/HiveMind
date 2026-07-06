/**
 * Main Application Orchestration (admin/js/app.js)
 */

document.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("HM_AdminSession");
    if (saved) {
        const session = JSON.parse(saved);
        // Client-side JWT expiration gate — prevents flashing an empty dashboard
        // when a stale token fires 8 endpoints that all return 401.
        try {
            const payload = JSON.parse(atob(session.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
            if (payload.exp && Date.now() > payload.exp) {
                // Token expired — purge silently, show login
                localStorage.removeItem("HM_AdminSession");
                console.warn("[HiveMind] Expired session purged from localStorage.");
            } else {
                window.State.adminSession = session;
                showDashboard();
            }
        } catch (e) {
            // Malformed token — purge
            localStorage.removeItem("HM_AdminSession");
            console.warn("[HiveMind] Malformed session token purged.", e);
        }
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

    // Start Header Clocks
    startAdminClocks();

    // Sub-Modals & Tab Switching (History)
    document.getElementById("closeHistoryModal")?.addEventListener("click", () => {
        document.getElementById("playerHistoryModal").classList.add("hidden");
    });
    document.getElementById("closeAllianceHistoryModal")?.addEventListener("click", () => {
        document.getElementById("allianceHistoryModal").classList.add("hidden");
    });

    // ⌘K Command Palette
    window.CmdPalette?.initListeners();
    window.initWindowChrome?.();
    window.AllianceCommandCenter?.initListeners();
    window.Roster?.initListeners();
    // Only load roster if we have a valid session — otherwise it crashes on null token
    if (window.State.adminSession) window.Roster?.load();

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
        if (logout && logout.parentNode) {
            logout.parentNode.insertBefore(hint, logout);
        }
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

    // QoL: Double-Click on table rows to search them in Cmd Palette
    document.addEventListener("dblclick", (e) => {
        const tr = e.target.closest("tr");
        if (tr) {
            // Find if there's a link with a player or alliance dataset
            const link = tr.querySelector("[data-player]") || tr.querySelector("[data-alliance]");
            if (link && window.CmdPalette) {
                const query = link.dataset.player || link.dataset.alliance;
                window.CmdPalette.open(query);
            }
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

    // QoL: Local CSV Export
    const exportCsvBtn = document.getElementById("exportCsvBtn");
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener("click", () => {
            const data = window.State.hfDataSnapshot;
            if (!data || data.length === 0) {
                alert("No data to export. Try syncing first.");
                return;
            }

            // Create CSV Headers
            const headers = ["Player", "Alliance", "HF", "Anthill", "Tech", "Fight", "Timestamp"];
            // Extract and format rows
            const rows = data.map(p => {
                const now = new Date().toISOString();
                return [
                    `"${(p.name || '').replace(/"/g, '""')}"`,
                    `"${(p.alliance || '').replace(/"/g, '""')}"`,
                    p.hf || 0,
                    p.anthill || 0,
                    p.tech || 0,
                    p.fight || 0,
                    now
                ].join(',');
            });

            const csvContent = headers.join(',') + '\n' + rows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `HIVEMIND_LEDGER_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }


    document.getElementById("alliancesRefreshBtn")?.addEventListener("click", window.withRefresh(window.loadAlliances));
    document.getElementById("alliancesSearchInput")?.addEventListener("input", () => {
        window.filterAlliancesTable?.();
    });
    
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

    // Chart.js Global Loader Interceptor
    if (window.Chart) {
        window.Chart.register({
            id: 'hideLoaderPlugin',
            afterInit: (chart) => {
                const id = chart.canvas.id;
                const loader = document.getElementById('loading_' + id);
                if (loader) loader.style.display = 'none';
            }
        });
    }

    // Keyboard Shortcuts (1-6) for Tabs
    document.addEventListener("keydown", (e) => {
        // Prevent triggering while typing in inputs
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
        if (e.metaKey || e.ctrlKey || e.altKey) return; // ignore complex combos, except bare numbers
        
        const keyMap = {
            "1": "dashboardScreen",
            "2": "playerTrackerScreen",
            "3": "visualIntelTab", // This ID is 'visualIntelTab' not Screen in HTML
            "4": "allianceRankingsTab",
            "5": "diplomacyTab",
            "6": "warRoomTab"
        };
        
        // Minor correction: standard tab names are dashboardScreen, playerTrackerScreen, alliancesScreen, diplomacyScreen, warRoomScreen.
        // Let's grab all actual tabs
        const tabs = document.querySelectorAll(".tab");
        const num = parseInt(e.key);
        if (!isNaN(num) && num > 0 && num <= tabs.length) {
            tabs[num - 1].click();
        }
    });

    // Search / Command Palette Trigger
    const searchBtn = document.getElementById("headerSearchBtn");
    if (searchBtn) {
        searchBtn.addEventListener("click", () => {
            window.CmdPalette?.open();
        });
    }

    // Theme Toggle Logic
    const themeBtn = document.getElementById("themeToggleBtn");
    if (themeBtn) {
        const savedTheme = localStorage.getItem("HM_Theme") || "light";
        document.documentElement.setAttribute("data-theme", savedTheme);
        themeBtn.addEventListener("click", () => {
            const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
            const newTheme = currentTheme === "light" ? "dark" : "light";
            document.documentElement.setAttribute("data-theme", newTheme);
            localStorage.setItem("HM_Theme", newTheme);
            
            // Re-draw charts slightly via tab switch or soft reload if needed
            if (window.Chart) {
                // Changing the generic tooltips/chart generic styles might happen automatically 
                // if CSS variables update, but hardcoded Chart.js colors won't unless refreshed.
                // We'll rely on the user refreshing the app/tabs.
            }
        });
    }

    // Dynamic Retro OS Title Bars
    const updateTitles = () => {
        document.querySelectorAll('.window-card').forEach(card => {
            if (card.hasAttribute('data-window-title') && card.getAttribute('data-window-title').length > 0) return;
            let title = "";
            const h3 = card.querySelector('h3');
            const kpiLabel = card.querySelector('.kpi-label');
            if (h3) title = h3.textContent;
            else if (kpiLabel) title = kpiLabel.textContent;
            else if (card.classList.contains('modal-content')) {
                const modalH3 = card.querySelector('.modal-header h3');
                if (modalH3) title = modalH3.textContent;
            }
            if (title) card.setAttribute('data-window-title', title.toUpperCase());
        });
    };
    updateTitles();
    // Re-run in case DOM elements load later
    setTimeout(updateTitles, 1000);

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
        window.State.adminSession = { 
            token: data.token,
            role: data.role || 'admin',
            ign: data.ign || 'Unknown'
        };
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

    // 1. Critical Path: Player History & Diplomacy
    // These drive the main dashboard KPIs and the Realm Graph.
    const loadHistory = async () => {
        const res = await window.fetchCached(`${W}/admin/players/history`, { headers }, 300000, (data) => {
            window.State.playerHistoryData = data;
            const latest = data[0]?.data || [];
            window.State.hfDataSnapshot = latest;
            window.State.hfPreviousSnapshot = data[1]?.data || null;
            _renderDashboardFromState(data, window.State.lastTokenData, window.State.lastLogsOneData);
            window.filterHFTable();
            window.initSnapshotDiff(data);
        });
        const data = await res.json();
        window.State.playerHistoryData = data;
        const latest = data[0]?.data || [];
        window.State.hfDataSnapshot = latest;
        window.State.hfPreviousSnapshot = data[1]?.data || null;
        _renderDashboardFromState(data, window.State.lastTokenData, window.State.lastLogsOneData);
        window.filterHFTable();
        window.initSnapshotDiff(data);
    };

    const loadDiplomacy = async () => {
        const res = await window.fetchCached(`${W}/admin/diplomacy`, { headers }, 600000, (data) => {
            window.State.diplomacyData = data;
            if (window.Diplomacy) window.Diplomacy.render();
        });
        const data = await res.json();
        window.State.diplomacyData = data;
        if (window.Diplomacy) {
            window.Diplomacy.initListeners();
            window.Diplomacy.render();
        }
    };

    // 2. Secondary Path: Alliance History & Economy
    const loadAlliances = async () => {
        const res = await window.fetchCached(`${W}/admin/alliances/history`, { headers }, 300000, (data) => {
            window.State.allianceHistoryData = data;
            window.loadAlliances();
            window.renderAllianceStackedArea(data);
        });
        const data = await res.json();
        window.State.allianceHistoryData = data;
        window.loadAlliances();
        window.renderAllianceStackedArea(data);
    };

    const loadEconomy = async () => {
        const res = await window.fetchCached(`${W}/admin/economy`, { headers }, 600000, (data) => {
            window.renderEconomyChart(data);
        });
        const data = await res.json();
        if (data) window.renderEconomyChart(data);
    };

    // 3. Background Path: Logs & Tokens (Heavy payloads)
    const loadLogsAndTokens = async () => {
        // We fetch these in parallel but they render independently
        window.fetchCached(`${W}/admin/tokens`, { headers }, 60000, (data) => {
             window.State.lastTokenData = data;
             _renderTokensFromState(data);
        }).then(res => res.json()).then(data => {
             window.State.lastTokenData = data;
             _renderTokensFromState(data);
        });

        window.fetchCached(`${W}/admin/logs?page=1&limit=1000`, { headers }, 60000, (data) => {
            window.State.logs = data.logs || [];
            _renderLogsFromState(data);
        }).then(res => res.json()).then(data => {
            window.State.logs = data.logs || [];
            _renderLogsFromState(data);
        });
    };

    const loadIntel = async () => {
        window.fetchCached(`${W}/intel/list`, { headers }, 300000, (data) => {
            window.State.intelDataSnapshot = data?.list || data || [];
        }).then(res => res.json()).then(data => {
            window.State.intelDataSnapshot = data?.list || data || [];
        });
    };

    // Fire everything!
    loadHistory();
    loadDiplomacy();
    loadAlliances();
    loadEconomy();
    loadLogsAndTokens();
    loadIntel();

    // Roster — must load after auth is confirmed
    if (window.Roster) window.Roster.load();

    // IAM — Super Admin Check
    if (window.IAM) window.IAM.init();

    console.log("[HiveMind] Incremental bootstrap started — using SWR for instant load.");
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
    const logs = window.State.logs || [];

    if (!tokens.length) { 
        tbody.innerHTML = "<tr><td colspan='6'>No tokens yet. Create one.</td></tr>"; 
        document.getElementById("tokenSummaryBar").style.display = "none";
        return; 
    }

    // Cross-reference tokens with activity logs to find last activity
    const ignLastSeen = {};
    logs.forEach(log => {
        const ign = log.ign || log.submittedBy;
        if (ign && log.timestamp) {
            if (!ignLastSeen[ign] || log.timestamp > ignLastSeen[ign]) {
                ignLastSeen[ign] = log.timestamp;
            }
        }
    });

    let activeCount = 0, dormantCount = 0, neverCount = 0;
    const DAY7 = 7 * 86400000;

    tbody.innerHTML = tokens.map(t => {
        const lastSeen = ignLastSeen[t.ign] || 0;
        let statusClass, statusText;
        if (lastSeen === 0) {
            statusClass = "never"; statusText = "Never Used"; neverCount++;
        } else if (Date.now() - lastSeen < DAY7) {
            statusClass = "active"; statusText = "Active"; activeCount++;
        } else {
            statusClass = "dormant"; statusText = "Dormant"; dormantCount++;
        }

        return `<tr>
        <td><strong>${window.escapeHtml(t.ign)}</strong></td>
        <td>${t.role}</td>
        <td>${window.formatDate(t.created_at)}</td>
        <td>${lastSeen > 0 ? window.timeAgo(lastSeen) : "<span style='color:var(--text-muted)'>—</span>"}</td>
        <td><span class="token-status ${statusClass}">${statusText}</span></td>
        <td><button class="btn-danger btn-danger-revoke" data-id="${t.id}" data-ign="${window.escapeHtml(t.ign)}">Revoke</button></td>
    </tr>`;
    }).join("");

    // Token Summary Bar
    const bar = document.getElementById("tokenSummaryBar");
    bar.style.display = "flex";
    document.getElementById("tokenCountTotal").textContent = tokens.length;
    document.getElementById("tokenCountActive").textContent = activeCount;
    document.getElementById("tokenCountDormant").textContent = dormantCount;
    document.getElementById("tokenCountNever").textContent = neverCount;
}

function _renderLogsFromState(logsData) {
    const tbody = document.getElementById("logsBody");
    if (!tbody) return;
    const logs = logsData?.logs || [];
    window.State.logs = logs;
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

    // Phase 2: Security KPIs from logs
    _renderSecurityOverview(logs);

    // Phase 1: Activity Heatmap from logs
    window.renderActivityHeatmap(logs);
}

function _renderSecurityOverview(logs) {
    if (!logs || logs.length === 0) return;

    const DAY = 86400000;
    const now = Date.now();
    
    let fails24h = 0;
    let success24h = 0;
    let lockoutsTotal = 0;
    let rateLimitsTotal = 0;

    logs.forEach(log => {
        if (!log.timestamp) return;
        const isRecent = (now - log.timestamp) < DAY;

        if (log.event === "auth_failure") {
            if (isRecent) fails24h++;
        } else if (log.event === "auth_success") {
            if (isRecent) success24h++;
        } else if (log.event === "auth_account_locked") {
            lockoutsTotal++;
        } else if (log.event === "auth_rate_limited") {
            rateLimitsTotal++;
        }
    });

    const elFails = document.getElementById("secFailures");
    if (elFails) {
        elFails.textContent = fails24h;
        elFails.className = fails24h > 10 ? "sec-value danger" : (fails24h > 0 ? "sec-value warning" : "sec-value");
    }

    const elSuccess = document.getElementById("secSessions");
    if (elSuccess) {
        elSuccess.textContent = success24h;
        elSuccess.className = "sec-value success";
    }

    const elLockouts = document.getElementById("secLockouts");
    if (elLockouts) {
        elLockouts.textContent = lockoutsTotal;
        elLockouts.className = lockoutsTotal > 0 ? "sec-value danger" : "sec-value";
    }

    const elRateLimits = document.getElementById("secRateLimits");
    if (elRateLimits) {
        elRateLimits.textContent = rateLimitsTotal;
    }

    window.renderSecurityTimeline(logs);
}

function _renderDashboardFromState(histData, tokData, logsOneData) {
    try {
        const players    = (histData[0]?.data || []).map(p => ({
            ...p, prev_hf: histData[1]?.data?.find(x => x.name?.toLowerCase() === p.name?.toLowerCase())?.hf || null
        }));
        const tokens     = tokData?.tokens || [];
        const roster     = window.State.tqcRoster || [];
        const tqcPlayers = players.filter(p => {
            const isTqcTagged = p.alliance?.toUpperCase() === "TQC";
            const isRostered = roster.some(m => m.toLowerCase() === p.name?.toLowerCase());
            return roster.length > 0 ? isRostered : isTqcTagged;
        });

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

        // Power Balance — uses ALL players, not just TQC
        window.renderPowerBalance(players);

        // KPI Sparklines — extract trend data from historical snapshots
        if (histData.length >= 2) {
            const reversed = [...histData].reverse();
            const roster = window.State.tqcRoster || [];
            
            // Tracked Players over time
            const playerCounts = reversed.map(s => (s.data || []).filter(p => {
                const isTqcTagged = p.alliance?.toUpperCase() === "TQC";
                const isRostered = roster.some(m => m.toLowerCase() === p.name?.toLowerCase());
                return roster.length > 0 ? isRostered : isTqcTagged;
            }).length);
            window.renderKPISparkline("sparkPlayers", playerCounts, "#3498db", "sparkPlayers");

            // Total HF over time
            const totalHFs = reversed.map(s => (s.data || []).filter(p => {
                const isTqcTagged = p.alliance?.toUpperCase() === "TQC";
                const isRostered = roster.some(m => m.toLowerCase() === p.name?.toLowerCase());
                return roster.length > 0 ? isRostered : isTqcTagged;
            }).reduce((sum, p) => sum + (p.hf || 0), 0));
            window.renderKPISparkline("sparkHF", totalHFs, "#c9a84c", "sparkHF");

            // Top player HF over time
            const topHFs = reversed.map(s => {
                const tqc = (s.data || []).filter(p => {
                    const isTqcTagged = p.alliance?.toUpperCase() === "TQC";
                    const isRostered = roster.some(m => m.toLowerCase() === p.name?.toLowerCase());
                    return roster.length > 0 ? isRostered : isTqcTagged;
                });
                return tqc.length > 0 ? Math.max(...tqc.map(p => p.hf || 0)) : 0;
            });
            window.renderKPISparkline("sparkTop", topHFs, "#e67e22", "sparkTop");
        }

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

    // Diplomacy — refresh views
    if (tabName === "diplomacy" && window.Diplomacy) {
        window.Diplomacy.render();
    }

    // War Room — render all widgets on first visit
    if (tabName === "warroom") {
        window.renderAnomalyFeed();
        window.renderContributionChart();
        // Populate snapshot diff dropdowns
        if (window.State.playerHistoryData) {
            window.initSnapshotDiff(window.State.playerHistoryData);
        }
        // Render activity heatmap with cached logs
        if (window.State.logs?.length > 0) {
            window.renderActivityHeatmap(window.State.logs);
        }
    }

    // Flood Finder
    if (tabName === "floodfinder" && window.FloodFinder) {
        window.FloodFinder.init();
    }

    // IAM (Access Control)
    if (tabName === "iam" && window.IAM) {
        window.IAM.load();
    }

    // Logs tab — re-render Security Overview on visit
    if (tabName === "logs") {
        if (window.State.logs?.length > 0) {
            _renderSecurityOverview(window.State.logs);
        }
    }

    // Alliances tab — re-render stacked area on visit
    if (tabName === "alliances") {
        if (window.State.allianceHistoryData?.length > 0) {
            window.renderAllianceStackedArea(window.State.allianceHistoryData);
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
            window.fetchCached(`${window.State.WORKER_URL}/admin/logs?page=1&limit=1000`, { headers })
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
        const roster = window.State.tqcRoster || [];
        const tqcPlayers = players.filter(p => {
            const isTqcTagged = p.alliance && p.alliance.toUpperCase() === "TQC";
            const isRostered = roster.some(m => m.toLowerCase() === p.name?.toLowerCase());
            return roster.length > 0 ? isRostered : isTqcTagged;
        });

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
    tbody.innerHTML = "<tr><td colspan='6' class='loading-cell'>Loading...</td></tr>";
    try {
        // Always fetch fresh — never cache token lists, since create/revoke must reflect immediately
        const response = await window.fetch(`${window.State.WORKER_URL}/admin/tokens`, {
            headers: { "Authorization": `Bearer ${window.State.adminSession.token}` }
        });
        if (!response.ok) throw new Error("Failed to load tokens");
        const data = await response.json();
        // Delegate to the shared renderer which handles status badges
        _renderTokensFromState(data);
    } catch (err) { tbody.innerHTML = `<tr><td colspan='6' style="color: var(--error);">Error: ${window.escapeHtml(err.message)}</td></tr>`; }
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
    if (log.event === "admin_diplomacy_update") return log.detail || "Updated diplomacy configuration";
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

    document.getElementById("historyModalMaxFight").textContent = "Loading...";

    // Re-init chrome for modal
    window.initWindowChrome?.();

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
    document.getElementById("allianceModalHegemony").textContent = "Calculating...";
    document.getElementById("allianceModalStability").textContent = "Calculating...";
    document.getElementById("allianceDetailedBody").innerHTML = "<tr><td colspan='5' class='loading-cell'>Loading...</td></tr>";
    document.getElementById("allianceMemberBreakdown").innerHTML = "";

    // Track target to prevent race conditions on slow fetches
    window.State.currentAllianceModalTarget = allianceName;

    // Bulletproof canvas cleanup — use Chart.getChart() to find whatever
    // is on the canvas, regardless of what State holds
    const existingDetailedChart = Chart.getChart("allianceDetailedChart");
    if (existingDetailedChart) existingDetailedChart.destroy();
    window.State.charts.allianceHistoryModal = null;

    const existingHegemonyChart = Chart.getChart("allianceHegemonyChart");
    if (existingHegemonyChart) existingHegemonyChart.destroy();
    window.State.charts.allianceHegemony = null;

    try {
        const response = await window.fetchCached(`${window.State.WORKER_URL}/admin/players/history`, {
            headers: { "Authorization": `Bearer ${window.State.adminSession.token}` }
        });
        if (!response.ok) throw new Error("Failed to load history");

        const data = await response.json();
        
        // Race condition check: If the user opened a different alliance while we were fetching, ignore this result
        if (window.State.currentAllianceModalTarget !== allianceName) return;

        // historyData is newest-first from the API
        const historyData = Array.isArray(data) ? data : [];
        const allianceChronology = [];
        let maxHF = 0, maxAvgHF = 0, maxAnthill = 0, maxMembers = 0;

        const roster = window.State.tqcRoster || [];
        const isTQC = allianceName.toUpperCase() === "TQC";
        const getAllianceMembers = (snapData) => {
            return (snapData || []).filter(x => {
                const isTagged = (x.alliance || "").toUpperCase() === allianceName.toUpperCase();
                if (isTQC && roster.length > 0) {
                    return roster.some(m => m.toLowerCase() === x.name?.toLowerCase());
                }
                return isTagged;
            });
        };

        // Build chronology oldest → newest for charting
        [...historyData].reverse().forEach(snapshot => {
            const members = getAllianceMembers(snapshot.data);
            if (members.length > 0) {
                const totalHF = members.reduce((sum, m) => sum + (m.hf || 0), 0);
                const totalAnthill = members.reduce((sum, m) => sum + (m.anthill || 0), 0);
                const avgHF = Math.floor(totalHF / members.length);
                const count = members.length;
                
                allianceChronology.push({ ts: snapshot.timestamp, hf: totalHF, avgHF: avgHF, anthill: totalAnthill, members: count, memberNames: members.map(m => m.name) });
                if (totalHF > maxHF) maxHF = totalHF;
                if (avgHF > maxAvgHF) maxAvgHF = avgHF;
                if (totalAnthill > maxAnthill) maxAnthill = totalAnthill;
                if (count > maxMembers) maxMembers = count;
            }
        });

        if (allianceChronology.length === 0) {
            document.getElementById("allianceDetailedBody").innerHTML = "<tr><td colspan='5'>No historical data found for this alliance.</td></tr>";
            document.getElementById("allianceModalHegemony").textContent = "—";
            document.getElementById("allianceModalStability").textContent = "—";
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
        
        // Secondary cleanup right before creation to handle race conditions
        const finalCheckDetailed = Chart.getChart("allianceDetailedChart");
        if (finalCheckDetailed) finalCheckDetailed.destroy();
        
        const ctx = document.getElementById("allianceDetailedChart").getContext("2d");

        window.State.charts.allianceHistoryModal = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [
                    { label: "Total HF", data: allianceChronology.map(a => a.hf || null), spanGaps: true, borderColor: window.CHART_THEME.accentGlow, backgroundColor: "transparent", yAxisID: 'y' },
                    { label: "Avg HF/Memb", data: allianceChronology.map(a => a.avgHF || null), spanGaps: true, borderColor: '#7ab8e8', backgroundColor: "transparent", yAxisID: 'y1' },
                    { label: "Total Anthill", data: allianceChronology.map(a => a.anthill || null), spanGaps: true, borderColor: window.CHART_THEME.maroon, backgroundColor: "transparent", yAxisID: 'y2' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font } }, grid: { color: window.CHART_THEME.grid } },
                    y: { type: 'linear', display: true, position: 'left', ticks: { color: window.CHART_THEME.accentGlow, font: { family: window.CHART_THEME.font }, callback: (v) => window.formatCompact(v) }, grid: { color: window.CHART_THEME.grid } },
                    y1: { type: 'linear', display: true, position: 'right', ticks: { color: '#7ab8e8', font: { family: window.CHART_THEME.font }, callback: (v) => window.formatCompact(v) }, grid: { drawOnChartArea: false } },
                    y2: { type: 'linear', display: true, position: 'right', ticks: { color: window.CHART_THEME.maroon, font: { family: window.CHART_THEME.font }, callback: (v) => v.toLocaleString() }, grid: { drawOnChartArea: false } }
                },
                plugins: {
                    legend: { labels: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font, size: 13 } } },
                    tooltip: { mode: 'index', intersect: false, backgroundColor: window.CHART_THEME.tooltipBg, titleFont: { family: window.CHART_THEME.font }, bodyFont: { family: window.CHART_THEME.font } }
                }
            }
        });

        // ── Power Structure Analysis ──
        // historyData[0] is the LATEST snapshot (newest-first from API)
        const latestSnapshot = historyData[0];
        const latestMembers = getAllianceMembers(latestSnapshot.data).sort((a,b) => b.hf - a.hf);
        const totalSumHF = latestMembers.reduce((sum, m) => sum + (m.hf || 0), 0);
        
        // 1. Hegemony Index — % of total HF held by the top 3 players
        const top3HF = latestMembers.slice(0, 3).reduce((sum, m) => sum + (m.hf || 0), 0);
        const hegemony = totalSumHF > 0 ? ((top3HF / totalSumHF) * 100) : 0;
        document.getElementById("allianceModalHegemony").textContent = hegemony.toFixed(1) + "%";

        // 2. Roster Stability — compare current roster against the oldest snapshot within 30 days
        //    historyData is newest-first, so we iterate backwards to find the oldest entry ≥ monthAgo
        const monthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        let baselineSnapshot = null;
        for (let i = historyData.length - 1; i >= 0; i--) {
            if (historyData[i].timestamp >= monthAgo) {
                baselineSnapshot = historyData[i];
                break; // found the oldest snapshot within 30 days
            }
        }
        // Fallback: if all data is within 30 days, use the very oldest snapshot
        if (!baselineSnapshot && historyData.length > 1) {
            baselineSnapshot = historyData[historyData.length - 1];
        }

        if (baselineSnapshot && baselineSnapshot !== latestSnapshot) {
            const oldRoster = getAllianceMembers(baselineSnapshot.data).map(x => x.name);
            const newRoster = latestMembers.map(x => x.name);
            const joined = newRoster.filter(n => !oldRoster.includes(n)).length;
            const left = oldRoster.filter(n => !newRoster.includes(n)).length;
            document.getElementById("allianceModalStability").textContent = `+${joined} / -${left}`;
        } else {
            document.getElementById("allianceModalStability").textContent = "Insufficient history";
        }

        // 3. Hegemony Doughnut Chart
        // Secondary cleanup right before creation
        const finalCheckHeg = Chart.getChart("allianceHegemonyChart");
        if (finalCheckHeg) finalCheckHeg.destroy();

        const hegCtx = document.getElementById("allianceHegemonyChart").getContext("2d");
        const top5 = latestMembers.slice(0, 5);
        const restSum = latestMembers.slice(5).reduce((sum, m) => sum + (m.hf || 0), 0);
        
        window.State.charts.allianceHegemony = new Chart(hegCtx, {
            type: 'doughnut',
            data: {
                labels: [...top5.map(m => m.name), 'Others'],
                datasets: [{
                    data: [...top5.map(m => m.hf), restSum],
                    backgroundColor: ['#dcb432', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', 'rgba(255,255,255,0.1)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: window.CHART_THEME.text, boxWidth: 10, font: { size: 10 } } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${window.formatHF(ctx.raw)} (${((ctx.raw/totalSumHF)*100).toFixed(1)}%)` } }
                }
            }
        });

        // 4. Breakdown Table — top 10 members and their contribution %
        document.getElementById("allianceMemberBreakdown").innerHTML = latestMembers.slice(0, 10).map((m, idx) => `
            <tr>
                <td style="color:var(--text-muted)">#${idx+1}</td>
                <td style="color:var(--accent); font-weight:600;">${window.escapeHtml(m.name)}</td>
                <td>${window.formatCompact(m.hf)} <span style="font-size:0.8em; color:var(--text-muted)">(${((m.hf/totalSumHF)*100).toFixed(1)}%)</span></td>
            </tr>
        `).join("");

    } catch (err) { document.getElementById("allianceDetailedBody").innerHTML = `<tr><td colspan='5' style="color:var(--error)">Error: ${window.escapeHtml(err.message)}</td></tr>`; }
}
// ===============================================================
// RETRO OS WINDOW ENGINE
// ===============================================================

window.initWindowChrome = function() {
    const dock = document.getElementById("minimized-dock");
    const dockItems = document.getElementById("dock-items");

    document.querySelectorAll(".window-card").forEach((card, idx) => {
        // Skip if already initialized
        if (card.querySelector(".window-titlebar")) return;

        // ONLY apply to cards inside modals (as requested)
        const modalParent = card.closest(".modal");
        if (!modalParent) return;

        // Smart label: derive from content
        const dataTitle = card.getAttribute("data-window-title");
        const h3 = card.querySelector("h3");
        const h2 = card.querySelector("h2");
        const kpiLabel = card.querySelector(".kpi-label");
        const smartTitle = dataTitle || h3?.textContent?.trim() || h2?.textContent?.trim() || kpiLabel?.textContent?.trim() || "Window " + (idx + 1);

        card.setAttribute("data-window-id", `win-${idx}`);

        const titlebar = document.createElement("div");
        titlebar.className = "window-titlebar";

        titlebar.innerHTML = `
            <span class="window-titlebar-title">${window.escapeHtml(smartTitle)}</span>
            <div class="window-controls">
                <button class="win-min" title="Minimize to dock">■</button>
                <button class="win-max" title="Toggle fullscreen">□</button>
                <button class="win-close" title="Hide panel">×</button>
            </div>
        `;

        card.appendChild(titlebar);

        // ── Minimize ──
        titlebar.querySelector(".win-min").addEventListener("click", (e) => {
            e.stopPropagation();
            // If in modal, hide the OVERLAY, not just the card
            if (modalParent) modalParent.classList.add("hidden");
            else card.style.display = "none";
            
            dock.classList.remove("hidden");

            const pill = document.createElement("button");
            pill.className = "dock-pill";
            pill.textContent = smartTitle;
            pill.addEventListener("click", () => {
                if (modalParent) modalParent.classList.remove("hidden");
                else card.style.display = "";
                
                pill.remove();
                if (dockItems.children.length === 0) dock.classList.add("hidden");
            });
            dockItems.appendChild(pill);
        });

        // ── Maximize (toggle — relocates to body) ──
        titlebar.querySelector(".win-max").addEventListener("click", (e) => {
            e.stopPropagation();
            if (card.classList.contains("window-maximized")) {
                _unmaximize(card);
            } else {
                _maximize(card);
            }
        });

        // ── Close ──
        titlebar.querySelector(".win-close").addEventListener("click", (e) => {
            e.stopPropagation();
            if (card.classList.contains("window-maximized")) _unmaximize(card);
            if (modalParent) modalParent.classList.add("hidden");
            else card.style.display = "none";
        });
    });

    function _maximize(card) {
        // Remember original parent and position
        card._origParent = card.parentElement;
        card._origNext = card.nextElementSibling;

        // Create backdrop
        const backdrop = document.createElement("div");
        backdrop.className = "window-maximize-backdrop";
        backdrop.addEventListener("click", () => _unmaximize(card));
        document.body.appendChild(backdrop);
        card._maximizeBackdrop = backdrop;

        // Move card to body so it escapes all parent flex/grid constraints
        document.body.appendChild(card);
        card.classList.add("window-maximized");
    }

    function _unmaximize(card) {
        card.classList.remove("window-maximized");

        // Move card back to its original parent
        if (card._origParent) {
            if (card._origNext) {
                card._origParent.insertBefore(card, card._origNext);
            } else {
                card._origParent.appendChild(card);
            }
            card._origParent = null;
            card._origNext = null;
        }

        // Remove backdrop
        if (card._maximizeBackdrop) {
            card._maximizeBackdrop.remove();
            card._maximizeBackdrop = null;
        }
    }

    // ── Global ESC key handler (bind once) ──
    if (!window._windowEscBound) {
        window._windowEscBound = true;
        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return;

            // 1. Un-maximize any fullscreen window
            const maxed = document.querySelector(".window-maximized");
            if (maxed) {
                _unmaximize(maxed);
                return;
            }

            // 2. Close the topmost visible modal
            const modals = document.querySelectorAll(".modal:not(.hidden)");
            if (modals.length > 0) {
                modals[modals.length - 1].classList.add("hidden");
                return;
            }
        });
    }

    // ── Click-outside to close modals (bind once) ──
    if (!window._modalClickOutBound) {
        window._modalClickOutBound = true;
        document.querySelectorAll(".modal").forEach(modal => {
            modal.addEventListener("click", (e) => {
                // Only close if clicking the dark overlay itself, not its children
                if (e.target === modal) {
                    modal.classList.add("hidden");
                }
            });
        });
    }
};

// ===============================================================
// ALLIANCE COMMAND CENTER
// ===============================================================

window.AllianceCommandCenter = {
    _chart: null,
    _econChart: null,

    open: function(focusTab) {
        const modal = document.getElementById("allianceCommandModal");
        if (!modal) return;
        modal.classList.remove("hidden");

        // Switch to the correct sub-tab
        const tabMap = { roster: "accRoster", hf: "accHFTrajectory", top: "accRoster", tokens: "accActivity" };
        const target = tabMap[focusTab] || "accRoster";
        this.switchTab(target);
        this.populateData();

        // Re-init chrome for newly visible modal
        window.initWindowChrome?.();
    },

    close: function() {
        document.getElementById("allianceCommandModal")?.classList.add("hidden");
    },

    switchTab: function(tabId) {
        document.querySelectorAll(".acc-content").forEach(el => el.classList.add("hidden"));
        document.getElementById(tabId)?.classList.remove("hidden");

        document.querySelectorAll(".acc-tab").forEach(btn => {
            const isActive = btn.dataset.accTab === tabId;
            btn.classList.toggle("active", isActive);
            btn.style.background = isActive ? "var(--chrome-bg)" : "var(--bg-surface)";
            btn.style.borderColor = isActive ? "var(--border-gold)" : "var(--border-dark)";
            btn.style.color = isActive ? "var(--chrome-text)" : "var(--text-muted)";
        });

        // Render charts when their tab becomes visible
        if (tabId === "accHFTrajectory") this.renderHFChart();
        if (tabId === "accEconomy") this.renderEconomyChart();
    },

    populateData: function() {
        const players = window.State.hfDataSnapshot || [];
        const roster = window.State.tqcRoster || [];
        
        const tqcPlayers = players.filter(p => {
            const isTqcTagged = (p.alliance || "").toUpperCase() === "TQC";
            const isRostered = roster.some(m => m.toLowerCase() === p.name?.toLowerCase());
            return roster.length > 0 ? isRostered : isTqcTagged;
        });

        // Roster stats
        const el = (id) => document.getElementById(id);
        if (el("accMemberCount")) {
            el("accMemberCount").textContent = tqcPlayers.length;
        }
        
        const totalHF = tqcPlayers.reduce((acc, p) => acc + (p.hf || 0), 0);
        if (el("accAvgHF")) {
            el("accAvgHF").textContent = window.formatHF ? window.formatHF(Math.round(totalHF / (tqcPlayers.length || 1))) : Math.round(totalHF / (tqcPlayers.length || 1)).toLocaleString();
        }
        
        const totalAnthill = tqcPlayers.reduce((acc, p) => acc + (p.anthill || 0), 0);
        if (el("accTotalAnthill")) {
            el("accTotalAnthill").textContent = totalAnthill.toLocaleString();
        }

        // Economy stats
        const totalTech = tqcPlayers.reduce((acc, p) => acc + (p.tech || 0), 0);
        const totalFight = tqcPlayers.reduce((acc, p) => acc + (p.fight || 0), 0);
        if (el("accTotalTech")) el("accTotalTech").textContent = totalTech.toLocaleString();
        if (el("accTotalFight")) el("accTotalFight").textContent = totalFight.toLocaleString();
        if (el("accAvgTech")) el("accAvgTech").textContent = Math.round(totalTech / (tqcPlayers.length || 1)).toLocaleString();

        // Roster table
        const sorted = [...tqcPlayers].sort((a, b) => b.hf - a.hf);
        const tbody = el("accRosterBody");
        if (tbody) {
            tbody.innerHTML = sorted.map((p, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td style="color: var(--accent); font-weight: 600;">${window.escapeHtml(p.name)}</td>
                    <td>${window.formatHF ? window.formatHF(p.hf) : p.hf.toLocaleString()}</td>
                    <td>${(p.anthill || 0).toLocaleString()}</td>
                    <td>${(p.tech || 0).toLocaleString()}</td>
                    <td>${(p.fight || 0).toLocaleString()}</td>
                </tr>`).join("");
        }

        // Activity feed from logs
        this.populateActivity();
    },

    populateActivity: function() {
        const tbody = document.getElementById("accActivityBody");
        if (!tbody) return;
        const logs = window.State.logs || [];
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">No activity logged yet.</td></tr>';
            return;
        }
        const recent = logs.slice(-50).reverse();
        tbody.innerHTML = recent.map(log => {
            const ts = new Date(log.ts || log.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
            return `<tr>
                <td style="white-space:nowrap; font-family:var(--font-ui); font-size:0.8em;">${ts}</td>
                <td style="font-weight:600; color:var(--accent);">${window.escapeHtml(log.event || log.type || "—")}</td>
                <td style="font-size:0.85em;">${window.escapeHtml(JSON.stringify(log.details || log.data || "").substring(0, 80))}</td>
                <td>${window.escapeHtml(log.by || log.submittedBy || "—")}</td>
            </tr>`;
        }).join("");
    },

    renderHFChart: function() {
        const history = window.State.allianceHistoryData;
        if (!history || history.length === 0) return;

        // Find TQC entries across history snapshots
        const tqcHistory = history.map(snap => {
            const tqc = (snap.data || []).find(a => a.name === "TQC");
            return { timestamp: snap.timestamp, hf: tqc?.hf || 0, members: tqc?.members || 0, anthill: tqc?.anthill || 0 };
        }).filter(item => item.hf > 0);

        if (tqcHistory.length === 0) return;

        const labels = tqcHistory.map(s => new Date(s.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        const ctx = document.getElementById("accHFChart");
        if (!ctx) return;

        if (this._chart) this._chart.destroy();
        this._chart = new Chart(ctx.getContext("2d"), {
            type: "line",
            data: {
                labels,
                datasets: [
                    { label: "Total HF", data: tqcHistory.map(s => s.hf), borderColor: window.CHART_THEME.accentGlow, backgroundColor: "rgba(232, 196, 106, 0.1)", fill: true, tension: 0.3 },
                    { label: "Members", data: tqcHistory.map(s => s.members), borderColor: "#7ab8e8", backgroundColor: "transparent", yAxisID: "y1" }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font } }, grid: { color: window.CHART_THEME.grid } },
                    y: { ticks: { color: window.CHART_THEME.accentGlow, font: { family: window.CHART_THEME.font }, callback: v => window.formatCompact?.(v) || v }, grid: { color: window.CHART_THEME.grid } },
                    y1: { type: "linear", display: true, position: "right", ticks: { color: "#7ab8e8", font: { family: window.CHART_THEME.font } }, grid: { drawOnChartArea: false } }
                },
                plugins: {
                    legend: { labels: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font, size: 12 } } },
                    tooltip: { mode: "index", intersect: false, backgroundColor: window.CHART_THEME.tooltipBg }
                }
            }
        });
    },

    renderEconomyChart: function() {
        const history = window.State.allianceHistoryData;
        if (!history || history.length === 0) return;

        const tqcHistory = history.map(snap => {
            const tqc = (snap.data || []).find(a => a.name === "TQC");
            return { timestamp: snap.timestamp, tech: tqc?.tech || 0, fight: tqc?.fight || 0, anthill: tqc?.anthill || 0 };
        }).filter(item => item.tech > 0 || item.fight > 0);

        if (tqcHistory.length === 0) return;
        const labels = tqcHistory.map(s => new Date(s.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        const ctx = document.getElementById("accEconomyChart");
        if (!ctx) return;

        if (this._econChart) this._econChart.destroy();
        this._econChart = new Chart(ctx.getContext("2d"), {
            type: "line",
            data: {
                labels,
                datasets: [
                    { label: "Tech", data: tqcHistory.map(s => s.tech), borderColor: "#7ab8e8", backgroundColor: "transparent" },
                    { label: "Fight", data: tqcHistory.map(s => s.fight), borderColor: "#e07a5f", backgroundColor: "transparent" },
                    { label: "Anthill", data: tqcHistory.map(s => s.anthill), borderColor: window.CHART_THEME.maroon, backgroundColor: "transparent" }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font } }, grid: { color: window.CHART_THEME.grid } },
                    y: { ticks: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font }, callback: v => v.toLocaleString() }, grid: { color: window.CHART_THEME.grid } }
                },
                plugins: {
                    legend: { labels: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font, size: 12 } } },
                    tooltip: { mode: "index", intersect: false, backgroundColor: window.CHART_THEME.tooltipBg }
                }
            }
        });
    },

    initListeners: function() {
        // Stat card clicks
        document.querySelectorAll(".stat-card-clickable").forEach(card => {
            card.addEventListener("click", () => this.open(card.dataset.statType));
        });

        // Sub-tab switching
        document.querySelectorAll(".acc-tab").forEach(btn => {
            btn.addEventListener("click", () => this.switchTab(btn.dataset.accTab));
        });

        // Close modal
        document.getElementById("closeAllianceCommand")?.addEventListener("click", () => this.close());
        document.getElementById("closeAllianceCommandBtn")?.addEventListener("click", () => this.close());
    }
};

// ═══════════════════════════════════════════════════════════
// CLOCK LOGIC
// ═══════════════════════════════════════════════════════════
function startAdminClocks() {
    const serverEl = document.getElementById("clockServer");
    const localEl = document.getElementById("clockLocal");
    if (!serverEl || !localEl) return;

    function updateClocks() {
        const now = new Date();
        
        const serverTime = now.toLocaleTimeString("en-US", {
            timeZone: "Europe/Paris",
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
        
        const localTime = now.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        serverEl.textContent = serverTime;
        localEl.textContent = localTime;
    }

    updateClocks();
    setInterval(updateClocks, 1000);
}
