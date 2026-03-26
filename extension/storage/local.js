var HMStorage = {
    save: function(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },
    load: function(key, defaultVal) {
        var val = localStorage.getItem(key);
        return val ? JSON.parse(val) : defaultVal;
    },
    
    // Specific Saves
    saveConfig: function() {
        this.save("HM_Config", HMState.Config);
        HMToast.success("Configuration Saved");
    },
    
    // UI Persistence
    saveUIState: function(state) {
        this.save("HM_UI_State", state);
    },
    
    loadUIState: function() {
        return this.load("HM_UI_State", {});
    },

    saveDrafts: function(drafts) {
        this.save("HM_Drafts", drafts);
    }
};
