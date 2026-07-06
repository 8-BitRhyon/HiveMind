/**
 * War Room Intelligence Module (admin/js/warroom.js)
 * Covers: Anomaly Feed, Member Contribution, Strike Queue,
 *         Snapshot Diff, Player vs Player, ⌘K Command Palette
 */

// ═══════════════════════════════════════════════════════════
// ANOMALY ALERT FEED
// ═══════════════════════════════════════════════════════════

window.renderAnomalyFeed = function() {
    const container = document.getElementById("anomalyFeed");
    if (!container) return;

    const latest = window.State.hfDataSnapshot;
    const prev   = window.State.hfPreviousSnapshot;

    if (!latest || !prev || prev.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85em;padding:12px 0;">Need at least 2 snapshots to detect anomalies.</div>';
        return;
    }

    const THRESHOLD_DROP  = -0.10; // -10% = alert
    const THRESHOLD_SPIKE =  0.20; // +20% = note

    const anomalies = [];
    latest.forEach(p => {
        const prevP = prev.find(x => x.name.toLowerCase() === p.name.toLowerCase());
        if (!prevP || !prevP.hf || prevP.hf === 0) return;
        const pct = (p.hf - prevP.hf) / prevP.hf;
        if (pct <= THRESHOLD_DROP || pct >= THRESHOLD_SPIKE) {
            anomalies.push({ ...p, prevHF: prevP.hf, pct, diff: p.hf - prevP.hf });
        }
    });

    // Sort by severity (largest absolute % change first)
    anomalies.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

    if (anomalies.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85em;padding:12px 0;letter-spacing:0.04em;">— No significant anomalies detected since last snapshot.</div>';
        return;
    }

    container.innerHTML = anomalies.map(a => {
        const isDrop  = a.pct < 0;
        const absPct  = Math.abs(a.pct);
        const pctStr  = (isDrop ? "" : "+") + (a.pct * 100).toFixed(1) + "%";
        const diffStr = window.formatCompact(Math.abs(a.diff));
        
        let badgeClass = "info";
        let badgeText = "INFO";
        if (absPct >= 0.5) {
            badgeClass = "critical";
            badgeText = "CRITICAL";
        } else if (absPct >= 0.2) {
            badgeClass = "warning";
            badgeText = "WARNING";
        }

        const roster = window.State.tqcRoster || [];
        const isTqc = roster.length > 0 ? roster.some(m => m.toLowerCase() === a.name?.toLowerCase()) : (a.alliance || "").toUpperCase() === "TQC";
        const reason = isDrop
            ? (isTqc ? "TQC member under attack? Verify garrison before counter." : "Possible enemy attack or voluntary transfer.")
            : "Large HF spike — possible Flood received or active farming.";

        return `
        <div class="anomaly-item">
            <span class="anomaly-badge ${badgeClass}">${badgeText}</span>
            <span class="anomaly-player">${window.escapeHtml(a.name)}</span>
            <span class="anomaly-detail">
                <span class="${isDrop ? 'delta-down' : 'delta-up'}">${isDrop ? '▼' : '▲'} ${pctStr} (${isDrop ? '-' : '+'}${diffStr} HF)</span>
                — ${reason}
            </span>
        </div>`;
    }).join("");
};

// ═══════════════════════════════════════════════════════════
// MEMBER HF DISTRIBUTION TABLE
// Ordered low → high so the full chain range is visible.
// Each tier band is color-coded by HF bracket for Flood planning.
// ═══════════════════════════════════════════════════════════

window.renderContributionChart = function() {
    const container = document.getElementById("contributionTable");
    if (!container || !window.State.hfDataSnapshot) return;

    const roster = window.State.tqcRoster || [];
    const tqcMembers = window.State.hfDataSnapshot
        .filter(p => {
            const isTqcTagged = (p.alliance || "").toUpperCase() === "TQC";
            const isRostered = roster.some(m => m.toLowerCase() === p.name?.toLowerCase());
            // If roster is populated, it acts as the master list (exclusive).
            // If roster is empty, fall back to automated scraper tags.
            return roster.length > 0 ? isRostered : isTqcTagged;
        })
        .sort((a, b) => a.hf - b.hf); // LOW → HIGH intentional for chain planning

    if (tqcMembers.length === 0) {
        container.innerHTML = '<div class="loading-cell">No TQC members found.</div>';
        return;
    }

    const totalHF   = tqcMembers.reduce((s, p) => s + (p.hf || 0), 0);
    const maxHF     = tqcMembers[tqcMembers.length - 1].hf;
    const minHF     = tqcMembers[0].hf;
    const rangeSpan = maxHF - minHF || 1;

    // Derive Flood chain bands: each member can receive from anyone
    // with HF in [50%, 300%] of their own HF (game mechanic).
    // We highlight who can receive from whom by banding the range.
    const rows = tqcMembers.map((p, i) => {
        const pct    = totalHF > 0 ? ((p.hf / totalHF) * 100).toFixed(1) : "0.0";
        const barPct = ((p.hf - minHF) / rangeSpan * 100).toFixed(1);

        // Flood eligibility band color: low = dimmer brass, high = brighter gold
        const t = (p.hf - minHF) / rangeSpan;
        const barColor = `hsl(${38 + t * 12}, ${55 + t * 20}%, ${28 + t * 22}%)`;

        // Mark prev/next delta if available
        let delta = "";
        if (window.State.hfPreviousSnapshot) {
            const prev = window.State.hfPreviousSnapshot.find(x => x.name === p.name);
            if (prev) {
                const diff = p.hf - prev.hf;
                if (diff > 0) delta = `<span class="delta-up" style="font-size:0.75em;margin-left:4px;">+${window.formatCompact(diff)}</span>`;
                else if (diff < 0) delta = `<span class="delta-down" style="font-size:0.75em;margin-left:4px;">${window.formatCompact(diff)}</span>`;
            }
        }

        return `<div class="contrib-row" style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-bottom:1px solid var(--border);">
            <span style="width:18px;text-align:right;color:var(--text-muted);font-size:0.75em;font-family:var(--font-pixel);flex-shrink:0;">${i + 1}</span>
            <span style="flex:1;min-width:0;font-size:0.83em;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;text-decoration:underline;" class="player-name-link" data-player="${window.escapeHtml(p.name)}">${window.escapeHtml(p.name)}${delta}</span>
            <div style="width:80px;height:8px;background:var(--border);border-radius:1px;overflow:hidden;flex-shrink:0;">
                <div style="height:100%;width:${barPct}%;background:${barColor};border-radius:1px;min-width:2px;"></div>
            </div>
            <span style="width:60px;text-align:right;font-family:var(--font-pixel);font-size:0.92em;color:var(--accent-glow);flex-shrink:0;">${window.formatCompact(p.hf)}</span>
            <span style="width:36px;text-align:right;font-size:0.72em;color:var(--text-muted);flex-shrink:0;">${pct}%</span>
        </div>`;
    });

    container.innerHTML = rows.join("");

    // Wire up player name clicks → history modal
    container.querySelectorAll(".player-name-link").forEach(el => {
        el.addEventListener("click", () => {
            const name = el.dataset.player;
            if (name && typeof openPlayerHistoryModal === "function") openPlayerHistoryModal(name);
        });
    });
};

// ═══════════════════════════════════════════════════════════
// STRIKE QUEUE
// ═══════════════════════════════════════════════════════════

function calcFlightTime(x1, y1, x2, y2, velocity) {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.ceil(Math.pow(0.9, velocity) * 637200 * (1 - Math.exp(-(dist / 350)))) * 1000;
}

function formatDuration(ms) {
    if (!ms || ms <= 0) return "—";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

window.computeStrikeQueue = function() {
    const tbody = document.getElementById("strikeTableBody");
    if (!tbody) return;

    const myX = parseFloat(document.getElementById("myX")?.value);
    const myY = parseFloat(document.getElementById("myY")?.value);
    const spd = parseInt(document.getElementById("mySpeed")?.value, 10) || 20;

    const hfData    = window.State.hfDataSnapshot    || [];
    const intelData = window.State.intelDataSnapshot || [];
    const diplo     = window.State.diplomacyData     || { pacts: [], wars: [] };
    const coordData = window.RealmGraph?.playerCoords || [];

    // Build targets — only enemies (war or unknown), exclude TQC + pacts
    const targets = hfData
        .filter(p => {
            const a = (p.alliance || "").toUpperCase();
            return a !== "TQC" && !diplo.pacts.includes(p.alliance) && p.hf > 0;
        })
        .map(p => {
            const intel = intelData.find(i => i.name.toLowerCase() === p.name.toLowerCase());
            let defTech = p.tech || 1;
            if (intel?.tech) {
                const t = intel.tech;
                if (t.weapons !== null || t.shield !== null || t.nest !== null)
                    defTech = (t.weapons || 0) + (t.shield || 0) + (t.nest || 0);
            }
            const gcScore = defTech > 0 ? (p.hf / defTech) : 0;

            const coordEntry = coordData.find(c => c.name.toLowerCase() === p.name.toLowerCase());
            let flightMs = null;
            if (coordEntry && !isNaN(myX) && !isNaN(myY)) {
                flightMs = calcFlightTime(myX, myY, coordEntry.x, coordEntry.y, spd);
            }

            return { ...p, defTech, gcScore, flightMs, coords: coordEntry };
        })
        .filter(p => p.gcScore > 0)
        .sort((a, b) => b.gcScore - a.gcScore)
        .slice(0, 50);

    if (targets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">No eligible targets found. Load player data and intel first.</td></tr>';
        return;
    }

    const diplo2 = window.State.diplomacyData || { wars: [] };
    tbody.innerHTML = targets.map((t, i) => {
        const isWar    = diplo2.wars.includes(t.alliance);
        const allianceColor = isWar ? "#c05050" : "var(--text-secondary)";
        const coordStr = t.coords ? `${t.coords.x}, ${t.coords.y}` : '<span style="color:var(--text-muted)">Unknown</span>';
        const flightStr = t.flightMs !== null ? formatDuration(t.flightMs) : '<span style="color:var(--text-muted)">No coords</span>';
        const gcFormatted = t.gcScore >= 1000000 ? (t.gcScore/1000000).toFixed(1)+"M" : t.gcScore >= 1000 ? (t.gcScore/1000).toFixed(0)+"K" : t.gcScore.toFixed(0);

        return `<tr>
            <td style="color:var(--text-muted); font-family:var(--font-pixel)">${i+1}</td>
            <td style="color:var(--accent); cursor:pointer; text-decoration:underline;" class="player-name-link" data-player="${window.escapeHtml(t.name)}">${window.escapeHtml(t.name)}</td>
            <td style="color:${allianceColor}">${window.escapeHtml(t.alliance || "—")} ${isWar ? '<span class="badge-war">WAR</span>' : ""}</td>
            <td style="font-family:var(--font-pixel)">${window.formatCompact(t.hf)}</td>
            <td style="color:var(--text-muted)">${t.defTech}</td>
            <td style="color:var(--accent-glow); font-family:var(--font-pixel); font-weight:bold">${gcFormatted}</td>
            <td style="color: ${t.flightMs && t.flightMs < 3600000 ? '#6ab055' : t.flightMs && t.flightMs < 7200000 ? '#c9a84c' : 'var(--text-secondary)'}">${flightStr}</td>
            <td style="font-family:var(--font-pixel); font-size:0.9em">${coordStr}</td>
        </tr>`;
    }).join("");
};

// ═══════════════════════════════════════════════════════════
// SNAPSHOT DIFF — TIME TRAVEL
// ═══════════════════════════════════════════════════════════

window.initSnapshotDiff = function(historyData) {
    const fromEl = document.getElementById("diffFromSnap");
    const toEl   = document.getElementById("diffToSnap");
    if (!fromEl || !toEl || !historyData || historyData.length < 2) return;

    const opts = historyData.map((snap, i) => {
        const d = new Date(snap.timestamp);
        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
                      " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        return `<option value="${i}">${label} (${snap.data?.length || 0} players)</option>`;
    }).join("");

    fromEl.innerHTML = opts;
    toEl.innerHTML   = opts;
    // Default: compare most recent vs one before
    fromEl.value = "1";
    toEl.value   = "0";
};

window.runSnapshotDiff = function() {
    const historyData = window.State.playerHistoryData;
    const fromIdx = parseInt(document.getElementById("diffFromSnap")?.value, 10);
    const toIdx   = parseInt(document.getElementById("diffToSnap")?.value,   10);
    const tbody   = document.getElementById("diffTableBody");
    const summary = document.getElementById("diffSummary");
    if (!tbody || !historyData) return;

    if (fromIdx === toIdx) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Select two different snapshots.</td></tr>';
        return;
    }

    const snapFrom = historyData[fromIdx]?.data || [];
    const snapTo   = historyData[toIdx]?.data   || [];

    const allNames = new Set([...snapFrom.map(p=>p.name), ...snapTo.map(p=>p.name)]);
    const rows = [];

    allNames.forEach(name => {
        const from = snapFrom.find(p => p.name === name);
        const to   = snapTo.find(p   => p.name === name);
        const hfBefore = from?.hf || 0;
        const hfAfter  = to?.hf   || 0;
        const hfDiff   = hfAfter - hfBefore;
        const hfPct    = hfBefore > 0 ? (hfDiff / hfBefore) * 100 : (hfAfter > 0 ? 100 : 0);
        const status   = !from ? "NEW" : !to ? "GONE" : "tracked";
        rows.push({ name, alliance: (to || from)?.alliance || "—", hfBefore, hfAfter, hfDiff, hfPct, status });
    });

    rows.sort((a, b) => b.hfDiff - a.hfDiff); // Biggest gainers first by default

    // Summary stats
    const gained = rows.filter(r => r.hfDiff > 0);
    const lost   = rows.filter(r => r.hfDiff < 0);
    const newP   = rows.filter(r => r.status === "NEW");
    const goneP  = rows.filter(r => r.status === "GONE");

    if (summary) {
        summary.style.display = "flex";
        summary.innerHTML = [
            { label: "Gained HF", val: gained.length, color: "#6ab055" },
            { label: "Lost HF",   val: lost.length,   color: "#c05050" },
            { label: "New Players", val: newP.length, color: "#7ab8e8" },
            { label: "Disappeared", val: goneP.length, color: "var(--text-muted)" },
            { label: "Total ΔHF", val: window.formatCompact(rows.reduce((s,r)=>s+r.hfDiff,0)), color: "#c9a84c" }
        ].map(s => `
            <div style="background:var(--bg-surface);border:1px solid var(--border);padding:8px 14px;border-radius:4px;text-align:center;">
                <div style="font-size:0.7em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${s.label}</div>
                <div style="font-size:1.1em;color:${s.color};font-family:var(--font-pixel)">${s.val}</div>
            </div>`).join("");
    }

    tbody.innerHTML = rows.map(r => {
        const dStr   = (r.hfDiff >= 0 ? "+" : "") + window.formatCompact(r.hfDiff);
        const pStr   = (r.hfPct  >= 0 ? "+" : "") + r.hfPct.toFixed(1) + "%";
        const dColor = r.hfDiff > 0 ? "#6ab055" : r.hfDiff < 0 ? "#c05050" : "var(--text-muted)";
        const statusBadge = r.status === "NEW"
            ? '<span style="background:rgba(52,100,180,0.25);color:#7ab8e8;padding:1px 6px;border-radius:3px;font-size:0.75em;">NEW</span>'
            : r.status === "GONE"
            ? '<span style="background:rgba(80,80,80,0.25);color:var(--text-muted);padding:1px 6px;border-radius:3px;font-size:0.75em;">GONE</span>'
            : "";

        return `<tr>
            <td style="color:var(--accent);cursor:pointer;text-decoration:underline" class="player-name-link" data-player="${window.escapeHtml(r.name)}">${window.escapeHtml(r.name)}</td>
            <td style="color:var(--text-secondary)">${window.escapeHtml(r.alliance)}</td>
            <td style="font-family:var(--font-pixel)">${r.hfBefore > 0 ? window.formatCompact(r.hfBefore) : "—"}</td>
            <td style="font-family:var(--font-pixel)">${r.hfAfter  > 0 ? window.formatCompact(r.hfAfter)  : "—"}</td>
            <td style="color:${dColor};font-family:var(--font-pixel)">${r.hfDiff !== 0 ? dStr : "—"}</td>
            <td style="color:${dColor}">${r.hfDiff !== 0 ? pStr : "—"}</td>
            <td>${statusBadge}</td>
        </tr>`;
    }).join("");
};

// ═══════════════════════════════════════════════════════════
// PLAYER vs PLAYER COMPARISON
// ═══════════════════════════════════════════════════════════

window.openPvpModal = function(preloadName) {
    const modal = document.getElementById("pvpModal");
    if (!modal) return;
    modal.classList.remove("hidden");

    // Populate datalists
    const players = window.State.hfDataSnapshot || [];
    const opts    = players.map(p => `<option value="${window.escapeHtml(p.name)}">`).join("");
    document.getElementById("pvpPlayersDataA").innerHTML = opts;
    document.getElementById("pvpPlayersDataB").innerHTML = opts;

    if (preloadName) document.getElementById("pvpPlayerA").value = preloadName;
    document.getElementById("pvpModalTitle").textContent = "Player vs Player — Intelligence Report";
};

window.runPvpComparison = async function() {
    const nameA = document.getElementById("pvpPlayerA")?.value?.trim();
    const nameB = document.getElementById("pvpPlayerB")?.value?.trim();
    if (!nameA || !nameB) { alert("Enter two player names."); return; }

    const historyData = window.State.playerHistoryData;
    if (!historyData) { alert("No history data loaded."); return; }

    const chronological = [...historyData].reverse();

    function getTimeline(name) {
        const points = [];
        chronological.forEach(snap => {
            const p = snap.data.find(x => x.name.toLowerCase() === name.toLowerCase());
            if (p) points.push({ ts: snap.timestamp, ...p });
        });
        return points;
    }

    const timelineA = getTimeline(nameA);
    const timelineB = getTimeline(nameB);

    if (timelineA.length === 0 && timelineB.length === 0) {
        alert("Neither player found in history."); return;
    }

    document.getElementById("pvpModalTitle").textContent = `${nameA} vs ${nameB}`;

    // Metrics grid
    const latestA = timelineA[timelineA.length - 1];
    const latestB = timelineB[timelineB.length - 1];
    const grid = document.getElementById("pvpMetricsGrid");
    if (grid) {
        const metrics = [
            { label: "Field (HF)", a: latestA?.hf, b: latestB?.hf, fmt: window.formatCompact },
            { label: "Tech",       a: latestA?.tech, b: latestB?.tech, fmt: v => v?.toLocaleString() || "—" },
            { label: "Anthill",    a: latestA?.anthill, b: latestB?.anthill, fmt: v => v?.toLocaleString() || "—" },
            { label: "Fight",      a: latestA?.fight, b: latestB?.fight, fmt: window.formatCompact }
        ];
        grid.innerHTML = metrics.map(m => {
            const aVal = m.a ?? 0, bVal = m.b ?? 0;
            const aWins = aVal >= bVal;
            return `<div class="history-metric">
                <div class="history-metric-label">${m.label}</div>
                <div style="display:flex;gap:8px;justify-content:center;align-items:baseline;margin-top:4px;">
                    <span style="font-family:var(--font-pixel);font-size:1.1rem;color:${aWins?'#e8c46a':'var(--text-secondary)'}">${m.fmt(m.a)}</span>
                    <span style="color:var(--text-muted);font-size:0.75em">vs</span>
                    <span style="font-family:var(--font-pixel);font-size:1.1rem;color:${!aWins?'#e8c46a':'var(--text-secondary)'}">${m.fmt(m.b)}</span>
                </div>
            </div>`;
        }).join("");
    }

    // Build unified label set
    const allTs = [...new Set([...timelineA.map(p=>p.ts), ...timelineB.map(p=>p.ts)])].sort();
    const labels = allTs.map(ts => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }));

    if (window.State.charts.pvp) {
        window.State.charts.pvp.destroy();
        window.State.charts.pvp = null;
    }

    const ctx = document.getElementById("pvpChart")?.getContext("2d");
    if (!ctx) return;

    window.State.charts.pvp = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: nameA,
                    data: allTs.map(ts => { const p = timelineA.find(x => x.ts === ts); return p?.hf || null; }),
                    borderColor: "#e8c46a", backgroundColor: "rgba(232,196,106,0.08)",
                    spanGaps: true, borderWidth: 2, tension: 0.3, pointRadius: 3
                },
                {
                    label: nameB,
                    data: allTs.map(ts => { const p = timelineB.find(x => x.ts === ts); return p?.hf || null; }),
                    borderColor: "#7ab8e8", backgroundColor: "rgba(122,184,232,0.08)",
                    spanGaps: true, borderWidth: 2, tension: 0.3, pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font } } },
                tooltip: {
                    mode: "index", intersect: false,
                    backgroundColor: window.CHART_THEME.tooltipBg,
                    titleFont: { family: window.CHART_THEME.font },
                    bodyFont:  { family: window.CHART_THEME.font },
                    callbacks: { label: ctx => `${ctx.dataset.label}: ${window.formatCompact(ctx.parsed.y)} HF` }
                }
            },
            scales: {
                x: { ticks: { color: window.CHART_THEME.muted, font: { family: window.CHART_THEME.font, size: 11 } }, grid: { color: window.CHART_THEME.grid } },
                y: { ticks: { color: window.CHART_THEME.text,  font: { family: window.CHART_THEME.font }, callback: v => window.formatCompact(v) }, grid: { color: window.CHART_THEME.grid } }
            }
        }
    });
};

// ═══════════════════════════════════════════════════════════
// ⌘K COMMAND PALETTE
// ═══════════════════════════════════════════════════════════

window.CmdPalette = {
    open: function() {
        const el = document.getElementById("cmdPalette");
        if (!el) return;
        el.classList.remove("hidden");
        setTimeout(() => document.getElementById("cmdInput")?.focus(), 50);
        this.query("");
    },
    close: function() {
        document.getElementById("cmdPalette")?.classList.add("hidden");
        if (document.getElementById("cmdInput")) document.getElementById("cmdInput").value = "";
    },
    query: function(term) {
        const results = document.getElementById("cmdResults");
        if (!results) return;
        term = term.toLowerCase().trim();

        const items = [];

        // Tab navigation
        const tabs = [
            { label: "Dashboard",      tab: "dashboard",   icon: "▪" },
            { label: "Player Tracker", tab: "hf",          icon: "▪" },
            { label: "Enemy Intel",    tab: "intel",       icon: "▪" },
            { label: "Visual Intel",   tab: "visualIntel", icon: "▪" },
            { label: "Alliance Rankings", tab: "alliances", icon: "▪" },
            { label: "War Room",       tab: "warroom",     icon: "▪" },
            { label: "Diplomacy",      tab: "diplomacy",   icon: "▪" },
            { label: "Tokens",         tab: "tokens",      icon: "▪" },
            { label: "Activity Logs",  tab: "logs",        icon: "▪" }
        ];
        tabs.forEach(t => {
            if (!term || t.label.toLowerCase().includes(term)) {
                items.push({
                    type: "tab", icon: t.icon, label: `Go to ${t.label}`,
                    sub: "Tab",
                    action: () => { document.querySelector(`[data-tab="${t.tab}"]`)?.click(); this.close(); }
                });
            }
        });

        // Player search
        const players = window.State.hfDataSnapshot || [];
        players.filter(p => !term || p.name.toLowerCase().includes(term)).slice(0, 8).forEach(p => {
            items.push({
                type: "player", icon: "◈", label: p.name,
                sub: `${p.alliance || "—"} · ${window.formatCompact(p.hf)} HF`,
                action: () => {
                    // Open player history modal
                    document.querySelector(`[data-tab="hf"]`)?.click();
                    setTimeout(() => {
                        const link = document.querySelector(`[data-player="${p.name}"]`);
                        link?.click();
                    }, 300);
                    this.close();
                }
            });
        });

        // Actions
        const actions = [
            { label: "Force Refresh All Data", icon: "↺", sub: "Action",
              action: async () => { await window.clearCache(); location.reload(); this.close(); } },
            { label: "Open PvP Comparison", icon: "▪", sub: "Action",
              action: () => { window.openPvpModal(); this.close(); } },
            { label: "Compute Strike Queue", icon: "◎", sub: "Action",
              action: () => { document.querySelector('[data-tab="warroom"]')?.click(); this.close(); } }
        ];
        actions.filter(a => !term || a.label.toLowerCase().includes(term)).forEach(a => items.push({ type: "action", ...a }));

        if (items.length === 0) {
            results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.9em;">No results found.</div>';
            return;
        }

        results.innerHTML = items.slice(0, 10).map((item, i) => `
            <div class="cmd-result-item" data-idx="${i}">
                <span class="cmd-result-icon">${item.icon}</span>
                <div class="cmd-result-text">
                    <span class="cmd-result-label">${window.escapeHtml(item.label)}</span>
                    <span class="cmd-result-sub">${window.escapeHtml(item.sub || "")}</span>
                </div>
            </div>`).join("");

        // Attach click actions
        results.querySelectorAll(".cmd-result-item").forEach((el, i) => {
            el.addEventListener("click", () => items[i].action());
            el.addEventListener("mouseenter", () => {
                results.querySelectorAll(".cmd-result-item").forEach(x => x.classList.remove("active"));
                el.classList.add("active");
            });
        });

        // Highlight first
        results.querySelector(".cmd-result-item")?.classList.add("active");
        this._items = items;
    },

    initListeners: function() {
        // ⌘K / Ctrl+K
        document.addEventListener("keydown", (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                const pal = document.getElementById("cmdPalette");
                if (pal?.classList.contains("hidden")) this.open();
                else this.close();
            }
            if (e.key === "Escape") this.close();

            // Arrow key navigation inside palette
            const pal = document.getElementById("cmdPalette");
            if (!pal || pal.classList.contains("hidden")) return;
            const items = document.querySelectorAll(".cmd-result-item");
            const active = document.querySelector(".cmd-result-item.active");
            if (!items.length) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                const next = active?.nextElementSibling || items[0];
                items.forEach(x => x.classList.remove("active"));
                next.classList.add("active");
                next.scrollIntoView({ block: "nearest" });
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                const prev = active?.previousElementSibling || items[items.length - 1];
                items.forEach(x => x.classList.remove("active"));
                prev.classList.add("active");
                prev.scrollIntoView({ block: "nearest" });
            }
            if (e.key === "Enter") {
                const idx = parseInt(document.querySelector(".cmd-result-item.active")?.dataset.idx ?? "-1");
                if (idx >= 0 && this._items?.[idx]) this._items[idx].action();
            }
        });

        document.getElementById("cmdInput")?.addEventListener("input", (e) => this.query(e.target.value));
        document.getElementById("cmdBackdrop")?.addEventListener("click", () => this.close());

        // PvP modal close
        document.getElementById("closePvpModal")?.addEventListener("click", () => {
            document.getElementById("pvpModal")?.classList.add("hidden");
        });
        document.getElementById("runPvpBtn")?.addEventListener("click", window.runPvpComparison);

        // Strike queue
        document.getElementById("computeStrikesBtn")?.addEventListener("click", window.computeStrikeQueue);

        // Snapshot diff
        document.getElementById("runDiffBtn")?.addEventListener("click", window.runSnapshotDiff);
    }
};