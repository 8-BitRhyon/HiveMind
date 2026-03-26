/**
 * HiveMind Browser Compatibility Polyfill
 * 
 * Ensures a unified 'browser' namespace across Chrome, Firefox, and Edge.
 * Maps 'chrome' to 'browser' if 'browser' is missing (V8/Chromium).
 */

(function() {
    // Standardize 'browser' namespace
    if (typeof window.browser === "undefined") {
        if (typeof window.chrome !== "undefined") {
            window.browser = window.chrome;
        }
    }
})();
