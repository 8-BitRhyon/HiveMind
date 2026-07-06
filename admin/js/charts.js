/**
 * Tactical Charts & Visualization (admin/js/charts.js)
 */

window.renderAllianceHistoryChart = function(historyArray, targetAlliances, metric = 'hf') {
    const ctx = document.getElementById('allianceHistoryChart')?.getContext('2d');
    if (!ctx) return;
    
    if (window.State.charts.allianceHistory) {
        window.State.charts.allianceHistory.destroy();
    }

    if (!historyArray || historyArray.length === 0) return;

    // The API now returns data in chronological order (oldest to newest).
    const chronologicalData = historyArray;

    // Determine which alliances to graph
    let alliancesToGraph = targetAlliances || [];
    if (alliancesToGraph.length === 0 && historyArray.length > 0) {
        alliancesToGraph = historyArray[historyArray.length - 1].data.slice(0, 5).map(a => a.name);
    }

    // Colors for the lines
    const colors = {
        "TQC": "#dcb432",   // Gold
        "REB": "#e74c3c",   // Red
        "LM": "#3498db",    // Blue
        "TQC2": "#f1c40f",  // Yellow
        "default": [
            "#9b59b6", "#1abc9c", "#e67e22", "#34495e", "#ff69b4", "#00ced1"
        ]
    };

    let defaultColorIdx = 0;

    const datasets = alliancesToGraph.map(allianceName => {
        // Map to { x, y } for Time Axis
        const dataPoints = chronologicalData.map((snapshot, idx) => {
            const found = snapshot.data.find(a => a.name === allianceName);
            let val = null;
            if (found) {
                if (metric === 'hf') val = found.hf;
                else if (metric === 'anthill') val = found.anthill;
                else if (metric === 'tech') val = found.tech;
                else if (metric === 'members') val = found.members;
                else if (metric === 'density') val = found.members > 0 ? (found.hf / found.members) : 0;
                else if (metric === 'hf_delta') {
                    const prev = idx > 0 ? chronologicalData[idx-1].data.find(a => a.name === allianceName) : null;
                    val = prev ? (found.hf - prev.hf) : 0;
                }
                else if (metric === 'share') {
                    const totalSnapshotHF = snapshot.data.reduce((sum, a) => sum + (a.hf || 0), 0);
                    val = totalSnapshotHF > 0 ? ((found.hf / totalSnapshotHF) * 100) : 0;
                }
            }
            return { x: snapshot.timestamp, y: val };
        });

        // Determine color
        let color = colors[allianceName];
        if (!color) {
            color = colors.default[defaultColorIdx % colors.default.length];
            defaultColorIdx++;
        }

        return {
            label: `[${allianceName}]`,
            data: dataPoints,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.3, 
            pointRadius: 2,
            pointHoverRadius: 6,
            spanGaps: true
        };
    });

    // Initialize Chart
    window.State.charts.allianceHistory = new Chart(ctx, {
        type: 'line',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font, size: 12 } }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: window.CHART_THEME.tooltipBg,
                    titleColor: '#d4b896',
                    bodyColor: '#9a7a5c',
                    borderColor: window.CHART_THEME.tooltipBorder,
                    borderWidth: 1,
                    titleFont: { family: window.CHART_THEME.font, size: 14 },
                    bodyFont: { family: window.CHART_THEME.font, size: 12 },
                    callbacks: {
                        title: (items) => {
                            if (!items[0]) return "";
                            return new Date(items[0].parsed.x).toLocaleString("en-US", { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                if (metric === 'hf' || metric === 'density' || metric === 'hf_delta') label += window.formatHF(context.parsed.y);
                                else if (metric === 'share') label += context.parsed.y.toFixed(2) + '%';
                                else label += context.parsed.y.toLocaleString();
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: window.CHART_THEME.grid },
                    ticks: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font },
                        callback: function(value) { 
                            if (metric === 'hf' || metric === 'density' || metric === 'hf_delta') return window.formatCompact(value); 
                            if (metric === 'share') return value + '%';
                            return value.toLocaleString();
                        }
                    }
                },
                x: {
                    type: 'time',
                    time: { unit: 'day', displayFormats: { day: 'MM/dd' } },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font, size: 11 },
                        maxTicksLimit: 8
                    }
                }
            },
            interaction: { mode: 'index', axis: 'x', intersect: false }
        }
    });
};

window.renderDashboardChart = function(players) {
    if (window.State.charts.dashboard) { 
        window.State.charts.dashboard.destroy(); 
        window.State.charts.dashboard = null; 
    }

    const ctx = document.getElementById("dashboardHFChart");
    if (!ctx || players.length === 0) return;

    window.State.charts.dashboard = new Chart(ctx.getContext("2d"), {
        type: "bar",
        data: {
            labels: players.map(p => p.name),
            datasets: [{
                label: "Hunting Field",
                data: players.map(p => p.hf),
                backgroundColor: "rgba(201, 168, 76, 0.25)",
                borderColor: window.CHART_THEME.accent,
                borderWidth: 2
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `HF: ${ctx.parsed.x.toLocaleString()}`
                    },
                    backgroundColor: window.CHART_THEME.tooltipBg,
                    titleFont: { family: window.CHART_THEME.font, size: 14 },
                    bodyFont: { family: window.CHART_THEME.font, size: 12 },
                    borderColor: window.CHART_THEME.accent,
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font, size: 12 },
                        callback: (v) => window.formatCompact(v)
                    },
                    grid: { color: window.CHART_THEME.grid }
                },
                y: {
                    ticks: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font, size: 12 }
                    },
                    grid: { display: false }
                }
            }
        }
    });
};

window.renderTrendChart = function(historyData) {
    if (window.State.charts.trend) { 
        window.State.charts.trend.destroy(); 
        window.State.charts.trend = null; 
    }
    const ctx = document.getElementById("dashboardTrendChart");
    if (!ctx || !historyData || historyData.length === 0) return;

    // Calculate Total HF for TQC in each snapshot
    const trendData = [...historyData].reverse().map(snapshot => {
        const total = snapshot.data
            .filter(p => (p.alliance || "").toUpperCase() === "TQC")
            .reduce((sum, p) => sum + (p.hf || 0), 0);
        return { ts: snapshot.timestamp, total };
    });

    const labels = trendData.map(d => new Date(d.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    
    window.State.charts.trend = new Chart(ctx.getContext("2d"), {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Total Alliance HF",
                data: trendData.map(d => d.total),
                borderColor: window.CHART_THEME.accent,
                backgroundColor: "rgba(201, 168, 76, 0.07)",
                fill: true,
                borderWidth: 3,
                tension: 0.3,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: (ctx) => `Total: ${ctx.parsed.y.toLocaleString()}` },
                    backgroundColor: window.CHART_THEME.tooltipBg,
                    titleFont: { family: window.CHART_THEME.font, size: 14 },
                    bodyFont: { family: window.CHART_THEME.font, size: 12 },
                }
            },
            scales: {
                y: {
                    ticks: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font, size: 11 },
                        callback: (v) => window.formatCompact(v)
                    },
                    grid: { color: window.CHART_THEME.grid }
                },
                x: {
                    ticks: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font, size: 11 }
                    },
                    grid: { display: false }
                }
            }
        }
    });
};

window.renderEconomyChart = function(data) {
    if (window.State.charts.economy) { 
        window.State.charts.economy.destroy(); 
        window.State.charts.economy = null; 
    }
    
    const ctx = document.getElementById("dashboardEconomyChart");
    if (!ctx) return;
    
    window.State.charts.economy = new Chart(ctx.getContext("2d"), {
        type: "bar",
        data: {
            labels: ["Looted (Stolen from enemies)", "Robbed (Stolen by enemies)", "Net Gain/Loss"],
            datasets: [{
                label: "Hunting Field",
                data: [data.totalLooted, data.totalRobbed, data.net],
                backgroundColor: [
                    "rgba(201, 168, 76, 0.55)", // Brass for Loot
                    "rgba(139, 26, 26, 0.55)",  // Dark red for Robbed
                    data.net >= 0 ? "rgba(201, 168, 76, 0.65)" : "rgba(139, 26, 26, 0.65)" // Net color
                ],
                borderColor: [
                    window.CHART_THEME.accent,
                    window.CHART_THEME.maroon,
                    data.net >= 0 ? window.CHART_THEME.accent : window.CHART_THEME.maroon
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: (ctx) => `HF: ${ctx.parsed.y.toLocaleString()}` },
                    backgroundColor: window.CHART_THEME.tooltipBg,
                    titleFont: { family: window.CHART_THEME.font, size: 14 },
                    bodyFont: { family: window.CHART_THEME.font, size: 12 },
                    borderColor: window.CHART_THEME.accent,
                    borderWidth: 1
                }
            },
            scales: {
                y: {
                    ticks: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font, size: 12 },
                        callback: (v) => window.formatCompact(v)
                    },
                    grid: { color: window.CHART_THEME.grid }
                },
                x: {
                    ticks: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font, size: 12 }
                    },
                    grid: { display: false }
                }
            }
        }
    });
};

/* ═══════════════════════════════════════════════════════════
   VISUAL INTELLIGENCE CHARTS
   ═══════════════════════════════════════════════════════════ */

function getAllianceAura(allianceName) {
    if (!allianceName || allianceName === "None" || allianceName === "") return "rgba(150, 150, 150, 0.4)"; // Neutral Grey
    
    // Check diplomacy state
    const diplo = window.State.diplomacyData || { pacts: [], wars: [] };
    if (allianceName.toUpperCase() === "TQC") return "rgba(52, 152, 219, 0.9)"; // Blue for Home Team
    if (diplo.pacts.includes(allianceName)) return "rgba(46, 204, 113, 0.8)"; // Green for Pact
    if (diplo.wars.includes(allianceName)) return "rgba(231, 76, 60, 0.8)"; // Red for War

    // Proprietary HSL hash for generic alliances so each has a unique, deterministic color
    let hash = 0;
    for (let i = 0; i < allianceName.length; i++) {
        hash = allianceName.charCodeAt(i) + ((hash << 5) - hash);
    }
    let hue = Math.abs(hash) % 360;
    return `hsla(${hue}, 70%, 55%, 0.7)`;
}

window.renderGlassCannonChart = function(hfData, intelData, minHF = 100000, maxHF = 1000000000, allianceFilter = "ALL") {
    if (window.State.charts.glassCannon) {
        window.State.charts.glassCannon.destroy();
        window.State.charts.glassCannon = null;
    }

    const ctx = document.getElementById("glassCannonChart")?.getContext("2d");
    if (!ctx) return;

    hfData = hfData || [];
    intelData = intelData || [];

    // Map HF to Tech. If intelData has specific Defense Tech, use it. Otherwise, use global Tech Level.
    let scatterData = hfData.map(p => {
        let defenseTech = p.tech || 0; // Fallback to overall tech rating from ranking
        let isCalculated = false;
        
        // Search for this player in intelData to see if we have specific scout reports!
        const intel = intelData.find(i => i.name.toLowerCase() === p.name.toLowerCase());
        if (intel && intel.tech && (intel.tech.weapons !== null || intel.tech.shield !== null || intel.tech.nest !== null)) {
            defenseTech = (intel.tech.weapons || 0) + (intel.tech.shield || 0) + (intel.tech.nest || 0);
            isCalculated = (intel.tech.confidence === "calculated");
        }

        return {
            x: defenseTech,
            y: p.hf || 0,
            name: p.name,
            alliance: p.alliance || "None",
            isCalculated
        };
    }).filter(p => p.x > 0 && p.y >= minHF && p.y <= maxHF); // Filter for functional targets

    // New: Filter by Alliance if specified
    if (allianceFilter && allianceFilter !== "ALL") {
        scatterData = scatterData.filter(d => d.alliance === allianceFilter);
    }

    window.State.charts.glassCannon = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Targets',
                data: scatterData,
                backgroundColor: scatterData.map(d => getAllianceAura(d.alliance)),
                borderColor: window.CHART_THEME.accent,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointHoverBorderColor: window.CHART_THEME.accent,
                pointHoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: window.CHART_THEME.tooltipBg,
                    titleFont: { family: window.CHART_THEME.font, size: 15 },
                    bodyFont: { family: window.CHART_THEME.font, size: 13 },
                    callbacks: {
                        label: function(ctx) {
                            const d = ctx.raw;
                            const confidence = d.isCalculated ? "(Confirmed Intel)" : "(Estimated)";
                            return [
                                `${d.name} [${d.alliance}] - ${confidence}`,
                                `HF: ${window.formatCompact(d.y)}`,
                                `Defensive Tech: ${d.x} (${d.isCalculated ? 'Confirmed' : 'Estimate/Global'})`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Defensive Tech Capability', color: window.CHART_THEME.text, font: {family: window.CHART_THEME.font, size: 14} },
                    grid: { color: window.CHART_THEME.grid },
                    ticks: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font } }
                },
                y: {
                    title: { display: true, text: 'Hunting Field (Loot Potential)', color: window.CHART_THEME.text, font: {family: window.CHART_THEME.font, size: 14} },
                    grid: { color: window.CHART_THEME.grid },
                    ticks: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font }, callback: (v) => window.formatCompact(v) }
                }
            }
        }
    });
};

window.renderProfilerChart = function(players, selectedAlliance) {
    if (window.State.charts.profiler) {
        window.State.charts.profiler.destroy();
        window.State.charts.profiler = null;
    }
    const ctx = document.getElementById("profilerChart")?.getContext("2d");
    if (!ctx) return;
    players = players || [];
    if (players.length === 0) return;

    // 1. Calculate the exact Global Averages to establish the 50% baseline marker
    let globalSumHF = 0, globalSumTech = 0, globalSumFight = 0, globalSumAnthill = 0;
    players.forEach(p => {
        globalSumHF += p.hf || 0;
        globalSumTech += p.tech || 0;
        globalSumFight += p.fight || 0;
        globalSumAnthill += p.anthill || 0;
    });

    const globalAvgHF = globalSumHF / players.length || 1;
    const globalAvgTech = globalSumTech / players.length || 1;
    const globalAvgFight = globalSumFight / players.length || 1;
    const globalAvgAnthill = globalSumAnthill / players.length || 1;

    // 2. Filter to selected group (or global)
    const targets = selectedAlliance === "ALL" ? players : players.filter(p => p.alliance === selectedAlliance);
    
    let avgHFIndex = 0, avgTechIndex = 0, avgFightIndex = 0, avgAnthillIndex = 0;

    if (targets.length > 0) {
        let sumTech = 0, sumAnthill = 0, sumFight = 0, sumHF = 0;
        targets.forEach(p => {
            sumTech += p.tech || 0;
            sumAnthill += p.anthill || 0;
            sumFight += p.fight || 0;
            sumHF += p.hf || 0;
        });
        
        const count = targets.length;
        const targetAvgHF = sumHF / count;
        const targetAvgTech = sumTech / count;
        const targetAvgFight = sumFight / count;
        const targetAvgAnthill = sumAnthill / count;

        // 3. Normalize: Score of 50 = exactly Server Average. 
        // Maxes out at 100 for 2x or greater than Server Average.
        avgHFIndex = Math.min((targetAvgHF / globalAvgHF) * 50, 100);
        avgTechIndex = Math.min((targetAvgTech / globalAvgTech) * 50, 100);
        avgFightIndex = Math.min((targetAvgFight / globalAvgFight) * 50, 100);
        avgAnthillIndex = Math.min((targetAvgAnthill / globalAvgAnthill) * 50, 100);
    }

    const isGlobal = selectedAlliance === "ALL";

    window.State.charts.profiler = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Economy (HF)', 'Infrastructure (Anthill)', 'Technology', 'Military (Fight)'],
            datasets: [{
                label: isGlobal ? "Server Average Baseline" : `${selectedAlliance} Profile vs Global`,
                data: [avgHFIndex, avgAnthillIndex, avgTechIndex, avgFightIndex],
                backgroundColor: isGlobal ? 'rgba(201, 168, 76, 0.06)' : 'rgba(201, 168, 76, 0.2)',
                borderColor: window.CHART_THEME.accent,
                pointBackgroundColor: window.CHART_THEME.maroon,
                pointBorderColor: '#1a0f08',
                pointHoverBackgroundColor: '#e8c46a',
                pointHoverBorderColor: window.CHART_THEME.maroon
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: window.CHART_THEME.grid },
                    grid: { color: window.CHART_THEME.grid },
                    pointLabels: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font, size: 13 } },
                    ticks: { 
                        display: false, 
                        min: 0, 
                        max: 100, 
                        stepSize: 25 
                    }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { color: window.CHART_THEME.text, font: {family: window.CHART_THEME.font} } },
                tooltip: {
                    backgroundColor: window.CHART_THEME.tooltipBg,
                    titleFont: { family: window.CHART_THEME.font, size: 14 },
                    bodyFont: { family: window.CHART_THEME.font, size: 12 },
                    callbacks: { 
                        label: function(ctx) {
                            const val = ctx.parsed.r;
                            if (val === 50) return "Exactly Average (50%)";
                            if (val > 50) return `+${((val-50)/50 * 100).toFixed(0)}% Above Average`;
                            return `${((50-val)/50 * 100).toFixed(0)}% Below Average`;
                        } 
                    }
                }
            }
        }
    });
};

/* ═══════════════════════════════════════════════════════════
   PHASE 1: KPI SPARKLINES
   Tiny inline trend charts inside dashboard KPI cards
   ═══════════════════════════════════════════════════════════ */

window.renderKPISparkline = function(canvasId, dataPoints, color, chartKey) {
    if (window.State.charts[chartKey]) {
        window.State.charts[chartKey].destroy();
        window.State.charts[chartKey] = null;
    }
    const ctx = document.getElementById(canvasId)?.getContext("2d");
    if (!ctx || !dataPoints || dataPoints.length < 2) return;

    window.State.charts[chartKey] = new Chart(ctx, {
        type: "line",
        data: {
            labels: dataPoints.map((_, i) => i),
            datasets: [{
                data: dataPoints,
                borderColor: color || window.CHART_THEME.accent,
                backgroundColor: "transparent",
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0.4,
                fill: {
                    target: 'origin',
                    above: (function(c) {
                        // Convert hex to rgba with 0.08 alpha
                        if (c && c.startsWith('#')) {
                            const r = parseInt(c.slice(1,3), 16);
                            const g = parseInt(c.slice(3,5), 16);
                            const b = parseInt(c.slice(5,7), 16);
                            return `rgba(${r}, ${g}, ${b}, 0.08)`;
                        }
                        return c;
                    })(color || window.CHART_THEME.accent)
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: { display: false },
                y: { display: false }
            },
            animation: { duration: 600, easing: "easeOutQuart" },
            elements: { line: { capBezierPoints: true } }
        }
    });
};

/* ═══════════════════════════════════════════════════════════
   PHASE 1: SERVER POWER BALANCE (DONUT)
   Shows HF distribution across top alliances
   ═══════════════════════════════════════════════════════════ */

window.renderPowerBalance = function(players) {
    if (window.State.charts.powerBalance) {
        window.State.charts.powerBalance.destroy();
        window.State.charts.powerBalance = null;
    }
    const ctx = document.getElementById("powerBalanceChart")?.getContext("2d");
    if (!ctx || !players || players.length === 0) return;

    // Aggregate HF by alliance
    const allianceMap = {};
    players.forEach(p => {
        const a = p.alliance || "Unaffiliated";
        allianceMap[a] = (allianceMap[a] || 0) + (p.hf || 0);
    });

    // Sort by HF descending, take top 8, group rest as "Others"
    const sorted = Object.entries(allianceMap).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 8);
    const othersHF = sorted.slice(8).reduce((s, e) => s + e[1], 0);
    if (othersHF > 0) top.push(["Others", othersHF]);

    const labels = top.map(e => e[0]);
    const data = top.map(e => e[1]);

    // Deterministic colors per alliance
    const palette = [
        "#c9a84c", "#e74c3c", "#3498db", "#2ecc71", "#9b59b6",
        "#e67e22", "#1abc9c", "#f1c40f", "#95a5a6"
    ];

    // Resolve panel background for segment borders (CSS vars don't work in <canvas>)
    const panelBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim() || '#faf6ef';

    window.State.charts.powerBalance = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: palette.slice(0, labels.length),
                borderColor: panelBg,
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "55%",
            plugins: {
                legend: {
                    position: "right",
                    labels: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font, size: 11 },
                        padding: 10,
                        usePointStyle: true,
                        pointStyleWidth: 10
                    }
                },
                tooltip: {
                    backgroundColor: window.CHART_THEME.tooltipBg,
                    titleFont: { family: window.CHART_THEME.font, size: 14 },
                    bodyFont: { family: window.CHART_THEME.font, size: 12 },
                    borderColor: window.CHART_THEME.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: function(ctx) {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((ctx.parsed / total) * 100).toFixed(1);
                            return ` ${ctx.label}: ${window.formatCompact(ctx.parsed)} (${pct}%)`;
                        }
                    }
                }
            },
            animation: { animateRotate: true, animateScale: true, duration: 800 }
        }
    });
};

/* ═══════════════════════════════════════════════════════════
   PHASE 1: ALLIANCE STACKED AREA
   Territory visualization of top alliances over time
   ═══════════════════════════════════════════════════════════ */

window.renderAllianceStackedArea = function(historyData, metric = 'hf') {
    if (window.State.charts.allianceStacked) {
        window.State.charts.allianceStacked.destroy();
        window.State.charts.allianceStacked = null;
    }
    const ctx = document.getElementById("allianceStackedChart")?.getContext("2d");
    if (!ctx || !historyData || historyData.length < 2) return;

    // The API returns data in chronological order (oldest to newest).
    const chronological = historyData;

    // Determine top 5 alliances by latest snapshot for the selected metric
    const latest = chronological[chronological.length - 1]?.data || [];
    const allianceVals = {};
    latest.forEach(a => { 
        if (metric === 'hf') allianceVals[a.name] = a.hf || 0;
        else if (metric === 'anthill') allianceVals[a.name] = a.anthill || 0;
        else if (metric === 'tech') allianceVals[a.name] = a.tech || 0;
        else if (metric === 'members') allianceVals[a.name] = a.members || 0;
        else if (metric === 'density') allianceVals[a.name] = a.members > 0 ? (a.hf / a.members) : 0;
        else allianceVals[a.name] = a.hf || 0;
    });
    const top5 = Object.entries(allianceVals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);

    const areaColors = [
        { border: "#c9a84c", bg: "rgba(201, 168, 76, 0.35)" },
        { border: "#e74c3c", bg: "rgba(231, 76, 60, 0.30)" },
        { border: "#3498db", bg: "rgba(52, 152, 219, 0.30)" },
        { border: "#2ecc71", bg: "rgba(46, 204, 113, 0.25)" },
        { border: "#9b59b6", bg: "rgba(155, 89, 182, 0.25)" }
    ];

    const datasets = top5.map((name, idx) => {
        const points = chronological.map(s => {
            const found = s.data.find(a => a.name === name);
            let val = null;
            if (found) {
                if (metric === 'hf') val = found.hf;
                else if (metric === 'anthill') val = found.anthill;
                else if (metric === 'tech') val = found.tech;
                else if (metric === 'members') val = found.members;
                else if (metric === 'density') val = found.members > 0 ? (found.hf / found.members) : 0;
                else if (metric === 'share') {
                    const totalSnapshotHF = s.data.reduce((sum, a) => sum + (a.hf || 0), 0);
                    val = totalSnapshotHF > 0 ? ((found.hf / totalSnapshotHF) * 100) : 0;
                }
                else val = found.hf;
            }
            return { x: s.timestamp, y: val };
        });
        return {
            label: `[${name}]`,
            data: points,
            borderColor: areaColors[idx].border,
            backgroundColor: areaColors[idx].bg,
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 1,
            pointHoverRadius: 5,
            spanGaps: true
        };
    });

    window.State.charts.allianceStacked = new Chart(ctx, {
        type: "line",
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    position: "top",
                    labels: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font, size: 12 } }
                },
                tooltip: {
                    mode: "index",
                    intersect: false,
                    backgroundColor: window.CHART_THEME.tooltipBg,
                    titleFont: { family: window.CHART_THEME.font, size: 14 },
                    bodyFont: { family: window.CHART_THEME.font, size: 12 },
                    borderColor: window.CHART_THEME.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        title: (items) => {
                            if (!items[0]) return "";
                            return new Date(items[0].parsed.x).toLocaleString("en-US", { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        },
                        label: ctx => {
                            let val = ctx.parsed.y;
                            if (metric === 'hf' || metric === 'density') val = window.formatCompact(val);
                            else if (metric === 'share') val = val.toFixed(2) + '%';
                            else if (val === null) val = '—';
                            else val = val.toLocaleString();
                            return ` ${ctx.dataset.label}: ${val}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    stacked: true,
                    grid: { color: window.CHART_THEME.grid },
                    ticks: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font },
                        callback: v => {
                            if (metric === 'hf' || metric === 'density') return window.formatCompact(v);
                            if (metric === 'share') return v + '%';
                            return v.toLocaleString();
                        }
                    }
                },
                x: {
                    type: 'time',
                    time: { unit: 'day', displayFormats: { day: 'MM/dd' } },
                    grid: { display: false },
                    ticks: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font, size: 11 },
                        maxTicksLimit: 8
                    }
                }
            }
        }
    });
};

/* ═══════════════════════════════════════════════════════════
   PHASE 1: ACTIVITY HEATMAP
   GitHub-style grid showing data submission frequency
   ═══════════════════════════════════════════════════════════ */

window.renderActivityHeatmap = function(logs) {
    const container = document.getElementById("activityHeatmap");
    if (!container) return;

    // Build a map of day → event count for the last 28 days
    const now = Date.now();
    const DAY = 86400000;
    const dayMap = {};
    for (let i = 0; i < 28; i++) {
        const d = new Date(now - (i * DAY));
        const key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
        dayMap[key] = 0;
    }

    (logs || []).forEach(log => {
        if (!log.timestamp) return;
        const d = new Date(log.timestamp);
        const key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
        if (dayMap[key] !== undefined) dayMap[key]++;
    });

    const values = Object.values(dayMap);
    const maxVal = Math.max(...values, 1);

    // Render grid (newest first, so reverse the keys)
    const keys = Object.keys(dayMap).reverse();
    let html = '<div class="heatmap-grid">';
    keys.forEach(key => {
        const count = dayMap[key];
        const intensity = count / maxVal;
        let bg;
        if (count === 0) bg = "var(--bg-surface)";
        else if (intensity < 0.25) bg = "rgba(201, 168, 76, 0.2)";
        else if (intensity < 0.5) bg = "rgba(201, 168, 76, 0.4)";
        else if (intensity < 0.75) bg = "rgba(201, 168, 76, 0.6)";
        else bg = "rgba(201, 168, 76, 0.85)";

        const parts = key.split("-");
        const label = `${parts[1]}/${parts[2]}: ${count} events`;
        html += `<div class="heatmap-cell" style="background:${bg}" title="${label}"></div>`;
    });
    html += '</div>';
    html += `<div class="heatmap-legend">
        <span>Less</span>
        <div class="heatmap-legend-swatch" style="background:var(--bg-surface)"></div>
        <div class="heatmap-legend-swatch" style="background:rgba(201,168,76,0.2)"></div>
        <div class="heatmap-legend-swatch" style="background:rgba(201,168,76,0.4)"></div>
        <div class="heatmap-legend-swatch" style="background:rgba(201,168,76,0.6)"></div>
        <div class="heatmap-legend-swatch" style="background:rgba(201,168,76,0.85)"></div>
        <span>More</span>
    </div>`;

    container.innerHTML = html;
};

/* ═══════════════════════════════════════════════════════════
   PHASE 2: SECURITY TIMELINE
   Bar chart showing auth successes vs failures over time
   ═══════════════════════════════════════════════════════════ */

window.renderSecurityTimeline = function(logs) {
    if (window.State.charts.securityTimeline) {
        window.State.charts.securityTimeline.destroy();
        window.State.charts.securityTimeline = null;
    }
    const ctx = document.getElementById("securityTimelineChart")?.getContext("2d");
    if (!ctx || !logs || logs.length === 0) return;

    // Group by day
    const dayBuckets = {};
    logs.forEach(log => {
        if (!log.timestamp) return;
        const d = new Date(log.timestamp);
        const key = `${d.getMonth()+1}/${d.getDate()}`;
        if (!dayBuckets[key]) dayBuckets[key] = { success: 0, failure: 0, lockout: 0 };
        if (log.event === "auth_success") dayBuckets[key].success++;
        else if (log.event === "auth_failure" || log.event === "auth_rate_limited") dayBuckets[key].failure++;
        else if (log.event === "auth_account_locked") dayBuckets[key].lockout++;
    });

    const labels = Object.keys(dayBuckets);
    const successes = labels.map(k => dayBuckets[k].success);
    const failures = labels.map(k => dayBuckets[k].failure);
    const lockouts = labels.map(k => dayBuckets[k].lockout);

    window.State.charts.securityTimeline = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "Auth Success",
                    data: successes,
                    backgroundColor: "rgba(46, 204, 113, 0.6)",
                    borderColor: "#2ecc71",
                    borderWidth: 1
                },
                {
                    label: "Auth Failure",
                    data: failures,
                    backgroundColor: "rgba(231, 76, 60, 0.6)",
                    borderColor: "#e74c3c",
                    borderWidth: 1
                },
                {
                    label: "Lockouts",
                    data: lockouts,
                    backgroundColor: "rgba(230, 126, 34, 0.6)",
                    borderColor: "#e67e22",
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "top",
                    labels: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font, size: 11 } }
                },
                tooltip: {
                    backgroundColor: window.CHART_THEME.tooltipBg,
                    titleFont: { family: window.CHART_THEME.font, size: 14 },
                    bodyFont: { family: window.CHART_THEME.font, size: 12 },
                    borderColor: window.CHART_THEME.tooltipBorder,
                    borderWidth: 1
                }
            },
            scales: {
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: window.CHART_THEME.grid },
                    ticks: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font }, stepSize: 1 }
                },
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { color: window.CHART_THEME.text, font: { family: window.CHART_THEME.font, size: 11 } }
                }
            }
        }
    });
};