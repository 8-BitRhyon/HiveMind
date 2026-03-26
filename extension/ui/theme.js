/**
 * ThemeManager - UI Theme Switching System
 * 
 * Allows users to switch between different visual themes.
 * Themes are defined in styles.css using data-hm-theme attribute.
 * 
 * Available themes:
 * - brutalist: Freshman Brutalist (default) - Gray/Black minimalist
 * - cyber: Dark Cyber - Dark blue with neon green/red accents
 * - terminal: Terminal Green - Black with green matrix style
 * - sepia: Warm Sepia - Vintage paper/ink aesthetic
 */

var ThemeManager = {
    // Storage key
    STORAGE_KEY: "HM_Theme",
    
    // Default theme
    DEFAULT_THEME: "brutalist",
    
    // Available themes
    THEMES: {
        brutalist: { name: "Concrete Brutalist", icon: "🏗️" },
        cyber: { name: "Neon Syndicate", icon: "⚡" },
        terminal: { name: "Phosphor CRT", icon: "▓" },
        sepia: { name: "Warm Sepia", icon: "📜" }
    },
    
    /**
     * Initialize theme system
     */
    init: function() {
        var savedTheme = localStorage.getItem(this.STORAGE_KEY) || this.DEFAULT_THEME;
        this.apply(savedTheme);
        
        if (typeof HMLogger !== "undefined") {
            HMLogger.info("[Theme] Initialized with theme: " + savedTheme);
        }
    },
    
    /**
     * Apply a theme
     * @param {string} themeName - Name of the theme to apply
     */
    apply: function(themeName) {
        if (!this.THEMES[themeName]) {
            if (typeof HMLogger !== "undefined") {
                HMLogger.warn("[Theme] Unknown theme: " + themeName);
            }
            themeName = this.DEFAULT_THEME;
        }
        
        // Apply to html element so all components inherit
        document.documentElement.setAttribute("data-hm-theme", themeName);
        
        // Also apply to HM containers specifically
        var containers = document.querySelectorAll(".HM_Container, .hm-clock-container");
        containers.forEach(function(el) {
            el.setAttribute("data-hm-theme", themeName);
        });
        
        // Save preference
        localStorage.setItem(this.STORAGE_KEY, themeName);
        
        if (typeof HMLogger !== "undefined") {
            HMLogger.info("[Theme] Applied: " + this.THEMES[themeName].name);
        }
    },
    
    /**
     * Get current theme
     */
    getCurrent: function() {
        return localStorage.getItem(this.STORAGE_KEY) || this.DEFAULT_THEME;
    },
    
    /**
     * Cycle to next theme
     */
    cycleNext: function() {
        var themeNames = Object.keys(this.THEMES);
        var currentIndex = themeNames.indexOf(this.getCurrent());
        var nextIndex = (currentIndex + 1) % themeNames.length;
        this.apply(themeNames[nextIndex]);
        return themeNames[nextIndex];
    },
    
    /**
     * Get theme display info
     */
    getThemeInfo: function(themeName) {
        return this.THEMES[themeName] || this.THEMES[this.DEFAULT_THEME];
    }
};
