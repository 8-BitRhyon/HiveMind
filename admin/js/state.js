/**
 * State Management (admin/js/state.js)
 */
window.State = {
    WORKER_URL: window.HM_CONFIG.WORKER_URL,
    adminSession: null,
    
    // UI State
    currentTab: "dashboard",
    currentPage: 1,

    // Chart instances
    charts: {
        dashboard: null,
        hf: null,
        economy: null,
        trend: null,
        allianceHistory: null,
        playerHistory: null,
        contribution: null,
        pvp: null,
        glassCannon: null,
        profiler: null,
        // Phase 1: Data Viz
        sparkPlayers: null,
        sparkHF: null,
        sparkTop: null,
        sparkTokens: null,
        powerBalance: null,
        allianceStacked: null,
        activityHeatmap: null,
        // Phase 2: Security
        securityTimeline: null
    },

    // Loaded by warroom.js
    playerHistoryData: null,

    // Tracking sorting & filtering state
    allianceSortCol: "rank",
    allianceSortDesc: false,
    playerSortCol: "rank",
    playerSortDesc: false,

    // In-memory caching for modals & charts
    allianceHistoryData: null,
    activeChartTargets: null,
    logs: []
};

window.CHART_THEME = {
    font: "'IBM Plex Sans', sans-serif",
    pixelFont: "'IBM Plex Mono', monospace",
    text: "#d4b896",
    muted: "#9a7a5c",
    accent: "#c9a84c",
    accentGlow: "#e8c46a",
    accentDim: "#8a6f2e",
    maroon: "#8b1a1a",
    grid: "rgba(201, 168, 76, 0.08)",
    tooltipBg: "rgba(20, 10, 4, 0.96)",
    tooltipBorder: "#6b4e1a"
};