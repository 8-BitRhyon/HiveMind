/**
 * HMSimulator
 * Core logic for combat outcome prediction and recovery estimation.
 */
var HMSimulator = {
    // Unit Base Laying Times (from combat_mechanics.md / ManyFeathers)
    // These represent Level 0 (Base) costs in seconds.
    UNIT_STATS: {
        "YD": { name: "Young dwarves", baseLay: 300 },
        "D":  { name: "Dwarves", baseLay: 450 },
        "TD": { name: "Top dwarves", baseLay: 570 },
        "YS": { name: "Young soldiers", baseLay: 740 },
        "S":  { name: "Soldiers", baseLay: 1000 },
        "DK": { name: "Doorkeepers", baseLay: 1410 },
        "FA": { name: "Fire ants", baseLay: 1440 },
        "TFA":{ name: "Top fire ants", baseLay: 1520 },
        "TS": { name: "Top soldiers", baseLay: 1450 },
        "T":  { name: "Tanks", baseLay: 1860 },
        "K":  { name: "Killers", baseLay: 2740 },
        "TK": { name: "Top killers", baseLay: 2740 },
        "W":  { name: "Worker", baseLay: 60 } // Added from user spreadsheet
    },

    /**
     * Calculates the time required to lay a set of units.
     * @param {string} unitCode - The code from UNIT_STATS
     * @param {number} count - Number of units to lay
     * @param {number} lsLevel - Total Laying Speed level (Incubator + Solarium + Laying Device)
     * @returns {number} Seconds required
     */
    calculateLayingTime: function(unitCode, count, lsLevel) {
        var unit = this.UNIT_STATS[unitCode];
        if (!unit) return 0;
        
        // Formula: Time = BaseLay * (0.9 ^ Level)
        var timePerUnit = unit.baseLay * Math.pow(0.9, lsLevel);
        return timePerUnit * count;
    },

    /**
     * Formats seconds into a human-readable string (D H M S)
     */
    formatDuration: function(seconds) {
        if (seconds === 0) return "0s";
        var d = Math.floor(seconds / (3600*24));
        var h = Math.floor(seconds % (3600*24) / 3600);
        var m = Math.floor(seconds % 3600 / 60);
        var s = Math.floor(seconds % 60);

        var parts = [];
        if (d > 0) parts.push(d + "d");
        if (h > 0) parts.push(h + "h");
        if (m > 0) parts.push(m + "m");
        if (s > 0 || parts.length === 0) parts.push(s + "s");
        
        return parts.join(" ");
    },

    /**
     * Estimates recovery time for a list of losses.
     * @param {Object} losses - Map of { unitCode: count }
     * @param {number} lsLevel - Current LS level
     */
    estimateRecovery: function(losses, lsLevel) {
        var totalSeconds = 0;
        for (var code in losses) {
            totalSeconds += this.calculateLayingTime(code, losses[code], lsLevel);
        }
        return {
            seconds: totalSeconds,
            formatted: this.formatDuration(totalSeconds)
        };
    }
};

// Global attachment
window.HMSimulator = HMSimulator;
