/**
 * Tactical Charts & Visualization (admin/js/charts.js)
 */

window.renderAllianceHistoryChart = function(historyArray, targetAlliances) {
    const ctx = document.getElementById('allianceHistoryChart')?.getContext('2d');
    if (!ctx) return;
    
    if (window.State.charts.allianceHistory) {
        window.State.charts.allianceHistory.destroy();
    }

    if (!historyArray || historyArray.length === 0) return;

    // The API returns newest first. We need chronological (oldest to newest) for charting.
    const chronologicalData = [...historyArray].reverse();

    // Generate Labels (Timestamps)
    const labels = chronologicalData.map(snapshot => {
        const d = new Date(snapshot.timestamp);
        return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    });

    // Determine which alliances to graph
    let alliancesToGraph = targetAlliances || [];
    if (alliancesToGraph.length === 0 && historyArray[0]) {
        alliancesToGraph = historyArray[0].data.slice(0, 5).map(a => a.name);
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
        // Extract data points for this alliance across time
        const dataPoints = chronologicalData.map(snapshot => {
            const found = snapshot.data.find(a => a.name === allianceName);
            return found ? found.hf : null; // nulls will gap the line if they didn't exist
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
            tension: 0.3, // slight curve
            pointRadius: 3,
            pointHoverRadius: 6
        };
    });

    // Initialize Chart
    window.State.charts.allianceHistory = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
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
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += window.formatHF(context.parsed.y);
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
                        callback: function(value) { return window.formatHF(value); }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: window.CHART_THEME.text,
                        font: { family: window.CHART_THEME.font, size: 11 },
                        maxTicksLimit: 10
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
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

window.renderActivityHeatmap = function(intelData) {
    if (window.State.charts.heatmap) {
        window.State.charts.heatmap.destroy();
        window.State.charts.heatmap = null;
    }
    const ctx = document.getElementById("activityHeatmapChart")?.getContext("2d");
    if (!ctx) return;
    intelData = intelData || [];

    // Distribute `lastSeen` timestamps into hour buckets (0-23)
    const hourBuckets = new Array(24).fill(0);
    intelData.forEach(p => {
        if (p.lastSeen) {
            const h = new Date(p.lastSeen).getHours();
            hourBuckets[h]++;
        }
    });

    window.State.charts.heatmap = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i}:00`),
            datasets: [{
                label: 'Recent Enemy Activity (Local Time)',
                data: hourBuckets,
                backgroundColor: hourBuckets.map(val => {
                    const max = Math.max(...hourBuckets, 1);
                    const intensity = 0.2 + (val / max) * 0.8;
                    const h = Math.round(40 + intensity * 14); const s = Math.round(50 + intensity * 30); const l = Math.round(18 + intensity * 32); return `hsla(${h}, ${s}%, ${l}%, ${0.5 + intensity * 0.5})`;
                }),
                borderColor: window.CHART_THEME.accent,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { 
                    backgroundColor: window.CHART_THEME.tooltipBg,
                    titleFont: { family: window.CHART_THEME.font }, bodyFont: { family: window.CHART_THEME.font }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: window.CHART_THEME.grid }, ticks: { color: window.CHART_THEME.text, font: {family: window.CHART_THEME.font} } },
                x: { grid: { display: false }, ticks: { color: window.CHART_THEME.text, font: {family: window.CHART_THEME.font} } }
            }
        }
    });
};