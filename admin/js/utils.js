/**
 * Shared Utilities (admin/js/utils.js)
 */

window.escapeHtml = function(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
};

window.formatDate = function(timestamp) {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString();
};

window.formatHF = function(hf) {
    if (!hf && hf !== 0) return "—";
    return hf.toLocaleString();
};

window.formatCompact = function(num) {
    if (!num && num !== 0) return "—";
    // Support for Trillions (T), Billions (G), Millions (M), Thousands (K)
    if (num >= 1000000000000) return (num / 1000000000000).toFixed(1).replace(/\.0$/, '') + "T";
    if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + "G";
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + "M";
    if (num >= 1000) return (num / 1000).toFixed(0) + "K";
    return num.toLocaleString();
};

window.timeAgo = function(timestamp) {
    if (!timestamp) return "—";
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

window.showError = function(msg) {
    const loginError = document.getElementById("loginError");
    if(loginError) loginError.textContent = msg;
};

// ═══════════════════════════════════════════════════════════
// Performance Utilities
// ═══════════════════════════════════════════════════════════
window.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};
