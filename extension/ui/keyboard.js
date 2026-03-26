// ====================================================================================================
// Keyboard Manager: Shortcuts for Power Users
// ====================================================================================================

var KeyboardManager = {
    init: function() {
        document.addEventListener("keydown", (e) => {
            // Only activate when HiveMind panel is visible
            var panel = document.getElementById("HM_Container");
            if(!panel) return;
            
            // Ctrl+Enter: Launch floods
            if(e.ctrlKey && e.key === "Enter") {
                e.preventDefault();
                var launchBtn = document.getElementById("HM_btnLaunch");
                if(launchBtn && !launchBtn.disabled) launchBtn.click();
            }
            
            // Ctrl+S: Save configuration
            if(e.ctrlKey && e.key === "s") {
                e.preventDefault();
                if(typeof HMStorage !== "undefined") {
                    HMStorage.saveConfig();
                }
            }
            
            // Escape: Close any open modals
            if(e.key === "Escape") {
                var modal = document.getElementById("HM_Modal");
                if(modal && modal.style.display !== "none") {
                    modal.style.display = "none";
                }
            }
        });
        
        HMLogger.debug("Keyboard shortcuts initialized (Ctrl+Enter, Ctrl+S, Esc)");
    }
};
