var HMState = {
    // Global User Data
    User: {
        username: "Unknown",
        coords: { x: 0, y: 0 },
        hf: 0,
        id: 0
    },
    
    // Game Data
    UnitNames: [ "Young Dwarves", "Dwarves", "Top Dwarves", "Young Soldiers", "Soldiers", "Doorkeepers", "Top Doorkeepers", "Fire Ants", "Top Fire Ants", "Top Soldiers", "Tanks", "Top Tanks", "Killers", "Top Killers" ],
    Units: [], // Stores unit types and stats
    Tech: { velocity: 0 },
    Tokens: { army: "" },
    
    // Calculated
    Travel: { distance: 0, time: 0 },
    Target: { hf: 0, x: 0, y: 0 },
    
    // App State
    Floods: [], // Calculated flood waves
    Defense: {
        autoSecure: false,
        status: { field: 0, anthill: 0, nest: 0 }
    },
    
    // Configuration
    Config: {
        minField: 0,
        minAnthill: 0,
        minNest: 0
    },
    
    // Initialize State from Game or Storage
    init: function() {
        // Load config from LocalStorage if available
        this.Config = HMStorage.loadUIState();
        HMLogger.debug("UI State Loaded from storage.");
    },
    
    // Sync State from UI (call before any calculation or launch)
    sync: function() {
        // HF Values
        var yourHF = document.getElementById("HM_YourHF");
        var targetHF = document.getElementById("HM_TargetHF");
        
        if(yourHF) this.User.hf = parseInt(yourHF.value.replace(/[^0-9]/g, ""), 10) || 0;
        if(targetHF) this.Target.hf = parseInt(targetHF.value.replace(/[^0-9]/g, ""), 10) || 0;
        
        // Defense Auto-Secure Toggle
        var btnKeep = document.getElementById("HM_btnKeep");
        this.Defense.autoSecure = btnKeep && btnKeep.value === "Yes";
        
        // Defense Minimums
        var fieldNb = document.getElementById("HM_HFTroopsNb");
        var anthillNb = document.getElementById("HM_ATroops1Nb");
        var nestNb = document.getElementById("HM_ATroops2Nb");
        
        this.Config.minField = fieldNb ? parseInt(fieldNb.value.replace(/[^0-9]/g, ""), 10) || 0 : 0;
        this.Config.minAnthill = anthillNb ? parseInt(anthillNb.value.replace(/[^0-9]/g, ""), 10) || 0 : 0;
        this.Config.minNest = nestNb ? parseInt(nestNb.value.replace(/[^0-9]/g, ""), 10) || 0 : 0;
        
        HMLogger.debug("State synchronized with UI.");
    }
};
