var StrategyManager = {
    init: function() {
        this.refreshList();
        this.attachEvents();
    },
    
    attachEvents: function() {
        var self = this;
        
        var btnSave = document.getElementById("HM_btnSaveDraft");
        if(btnSave) {
            btnSave.onclick = function(e) {
                e.preventDefault();
                var name = document.getElementById("HM_DraftName").value.trim();
                // Basic Validation
                if(!name) { HMToast.error("Please enter a name."); return; }
                self.save(name);
            };
        }
        
        var btnLoad = document.getElementById("HM_btnLoadDraft");
        if(btnLoad) {
            btnLoad.onclick = function(e) {
                e.preventDefault();
                var name = document.getElementById("HM_SelDraft").value;
                if(!name) return;
                self.load(name);
            };
        }
        
        var btnDel = document.getElementById("HM_btnDeleteDraft");
        if(btnDel) {
            btnDel.onclick = function(e) {
                e.preventDefault();
                var name = document.getElementById("HM_SelDraft").value;
                if(!name) return;
                
                // Simple Confirm
                if(confirm("Delete strategy '" + name + "'? This cannot be undone.")) {
                    self.delete(name);
                }
            };
        }
    },
    
    getDrafts: function() {
        return HMStorage.load("HM_Strategies", {});
    },
    
    refreshList: function() {
        var drafts = this.getDrafts();
        var sel = document.getElementById("HM_SelDraft");
        if(!sel) return;
        
        sel.innerHTML = '<option value="">-- Load Strategem --</option>';
        Object.keys(drafts).sort().forEach(function(name) {
            var opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
        });
    },
    
    save: function(name) {
        var drafts = this.getDrafts();
        
        var state = {
            amount: document.getElementById("HM_Amount").value,
            yourHF: document.getElementById("HM_YourHF").value,
            targetHF: document.getElementById("HM_TargetHF").value,
            hfTroops: document.getElementById("HM_HFTroopsNb").value,
            a1Nb: document.getElementById("HM_ATroops1Nb").value,
            a2Nb: document.getElementById("HM_ATroops2Nb").value,
            
            type: document.getElementById("HM_SelType").value,
            hfType: document.getElementById("HM_HFTroopsType").value,
            a1Type: document.getElementById("HM_ATroops1Type").value,
            a2Type: document.getElementById("HM_ATroops2Type").value,
            
            defensiveMode: document.getElementById("HM_btnKeep").value
        };
        
        drafts[name] = state;
        HMStorage.save("HM_Strategies", drafts);
        this.refreshList();
        
        // Also set the input to match so user knows it saved
        document.getElementById("HM_SelDraft").value = name;
        HMToast.success(`Strategy '${name}' Saved`);
    },
    
    load: function(name) {
        var drafts = this.getDrafts();
        var state = drafts[name];
        if(!state) return;
        
        // Populate inputs
        var setVal = (id, val) => {
            var el = document.getElementById(id);
            if(el) el.value = val || "";
        };
        
        setVal("HM_Amount", state.amount);
        setVal("HM_YourHF", state.yourHF);
        setVal("HM_TargetHF", state.targetHF);
        setVal("HM_HFTroopsNb", state.hfTroops);
        setVal("HM_ATroops1Nb", state.a1Nb);
        setVal("HM_ATroops2Nb", state.a2Nb);
        
        setVal("HM_SelType", state.type || 0);
        setVal("HM_HFTroopsType", state.hfType || 0);
        setVal("HM_ATroops1Type", state.a1Type || 0);
        setVal("HM_ATroops2Type", state.a2Type || 0);
        
        // Defensive Toggle
        var keepBtn = document.getElementById("HM_btnKeep");
        if(keepBtn && state.defensiveMode && keepBtn.value !== state.defensiveMode) {
            // Trigger click or manual update?
            // Manual update is safer since we don't have the switch logic exposed easily yet
            // Wait, DefenseManager isn't exposing switchBtnKeep.
            // Let's toggle it via click if mismatched, or just update value/class
            // Simpler: Just update value, the logic reads the value.
            // But visuals need to update.
            keepBtn.click(); // Hacky but works if listener is there.
        }
        
        if(typeof FloodManager !== "undefined") FloodManager.compute();
        HMToast.success(`Strategy '${name}' Loaded`);
    },
    
    delete: function(name) {
        var drafts = this.getDrafts();
        delete drafts[name];
        HMStorage.save("HM_Strategies", drafts);
        this.refreshList();
        document.getElementById("HM_DraftName").value = "";
        HMToast.success("Strategy Pruned");
    }
};
