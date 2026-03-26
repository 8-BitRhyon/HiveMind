// ====================================================================================================
// HMEngine: Data Fetching & Logistics
// ====================================================================================================
var HMEngine = {
    dataLoaded: false,
    
    init: function() {
        HMLogger.debug("Engine: Initializing Data Fetch...");
        
        // Parallel Fetching
        var pTimestamp = this.getArmyTimeStamp();
        var pTechno = this.getTechno();
        var pArmy = this.getArmy();
        var pPlayer = this.getPlayerInfo($("#pseudo").text(), HMState.User);
        var pTarget = this.getPlayerInfo($("input[name=pseudoCible]").val(), HMState.Target);
        
        Promise.all([pTimestamp, pTechno, pArmy, pPlayer, pTarget])
        .then(() => {
            HMLogger.debug("Engine: All Data Loaded.");
            this.dataLoaded = true;
            HMState.dataLoaded = true;
            
            // Calculate Distance & ETA
            this.calculateLogistics();
            
            // Update UI with fetched data
            this.updateUI();
        })
        .catch((err) => {
             HMLogger.error("Critical Data Load Failure: " + err);
             HMToast.error("Failed to load game data.");
        });
    },
    
    calculateLogistics: function() {
        // Use standard formula from Utils
        HMState.Travel.time = Utils.calculateTravelTime(
            HMState.User.x, HMState.User.y, 
            HMState.Target.x, HMState.Target.y, 
            HMState.Tech.velocity
        );
        HMState.Travel.distance = HMState.Travel.time / 1000;
    },
    
    updateUI: function() {
        // Update DOM elements that rely on data
        if(document.getElementById("HM_distance")) {
            document.getElementById("HM_distance").innerHTML = Utils.formatTime(HMState.Travel.time);
        }
        
        if(document.getElementById("HM_eta")) {
            var eta = new Date();
            eta.setTime(eta.getTime() + HMState.Travel.time);
            document.getElementById("HM_eta").innerHTML = Utils.formatDateTime(eta);
        }
        
        // Update Inputs
        if(document.getElementById("HM_YourHF")) {
            document.getElementById("HM_YourHF").value = Utils.formatInt(HMState.User.hf);
            document.getElementById("HM_TargetHF").value = Utils.formatInt(HMState.Target.hf);
        }
        
        // Trigger Flood Calc
        if(typeof FloodManager !== "undefined") FloodManager.compute();
        
        // Update Dropdowns
        this.updateDropdowns();
        if(typeof QueueManager !== "undefined") QueueManager.updateMemberDropdown();
    },
    
    updateDropdowns: function() {
         var html = "";
         var hasUnits = false;
         
         // Standardized Unit Names (Excluding Workers)
         var names = [
             "Young Dwarf", "Dwarf", "Top Dwarf", "Young Soldier", "Soldier", "Doorkeeper", "Top Doorkeeper", "Fire Ant", "Top Fire Ant", "Top Soldier", "Tank", "Top Tank", "Killer", "Top Killer"
         ];
         
         for(var i=0; i<names.length; i++) {
             // Only show if we have units OR if we want to show all types
             if(HMState.Units[i] > 0 || true) { // Show all for selection
                 html += `<option value="${i}">${names[i]}</option>`;
                 hasUnits = true;
             }
         }
         
         ["HM_HFTroopsType", "HM_ATroops1Type", "HM_ATroops2Type"].forEach(id => {
             var el = document.getElementById(id);
             if(el) el.innerHTML = html;
         });
    },
    
    // --- FETCH METHODS ---
    
    getArmyTimeStamp: function() {
        return window.HMAPI.get("/Armee.php").then(txt => {
            var match = txt.match(/name="t" id="t" value="([^"]*)"/);
            if(match) HMState.Tokens.army = match[1];
        });
    },
    
    getTechno: function() {
        return window.HMAPI.get("/laboratoire.php").then(txt => {
            var doc = new DOMParser().parseFromString(txt, "text/html");
             // Extract Vitesse d'attaque (Index 6 usually)
             var rows = doc.querySelectorAll(".ligneAmelioration");
             if(rows.length > 6) {
                 var txt = rows[6].querySelector(".niveau_amelioration").textContent;
                 HMState.Tech.velocity = parseInt(txt.split(" ")[1]) || 0;
             }
        });
    },
    
    getArmy: function() {
         var self = this;
         // Helper to parse rows
         var parseRows = function(rows) {
             HMState.Units = new Array(14).fill(0); // 14 units (excluding Workers)
             var found = false;
             
             Array.from(rows).forEach(row => {
                 if (row.cells.length < 4) return;
                 var name = row.cells[0].textContent.trim();
                 if (!name) return;
                 
                  // Mapper
                  var idx = -1;
                  // Specific matching logic
                   if (name.match(/Young dwarf|Jeune Soldate Naine/i)) idx = 0;
                   else if (name.match(/Top dwarf|Naine d'Elite/i)) idx = 2;
                   else if (name.match(/Dwarf|Naine/i)) idx = 1;
                   
                   else if (name.match(/Young soldier|Jeune Soldate/i)) idx = 3;
                   else if (name.match(/Top soldier|Soldate d'élite/i)) idx = 9;
                   else if (name.match(/Soldier|Soldate/i)) idx = 4;
                   
                   else if (name.match(/Top doorkeeper|Concierge d'élite/i)) idx = 6;
                   else if (name.match(/Doorkeeper|Concierge/i)) idx = 5;
                   
                   else if (name.match(/Top fire|Artilleuse d'élite/i)) idx = 8;
                   else if (name.match(/Fire|Artilleuse/i)) idx = 7;
                   
                   else if (name.match(/Top tank|Tank d'élite/i)) idx = 11;
                   else if (name.match(/Tank/i)) idx = 10;
                   
                   else if (name.match(/Top killer/i)) idx = 13;
                   else if (name.match(/Killer/i)) idx = 12;
                 
                 if(idx > -1) {
                     found = true;
                     var total = 0;
                     for(var c=1; c<=3; c++) {
                         total += parseInt(row.cells[c].textContent.replace(/[^0-9]/g, "") || "0", 10);
                     }
                     HMState.Units[idx] = total;
                 }
             });
             return found;
         };
         
         // Try Local Table first
         var localTable = document.getElementById("tabChoixArmee");
         if(localTable && parseRows(localTable.rows)) {
             return Promise.resolve();
         }
         
         // Fallback Fetch
         return Utils.get("/Armee.php").then(txt => {
             var doc = new DOMParser().parseFromString(txt, "text/html");
             var rows = doc.querySelectorAll("#tabChoixArmee tr");
             parseRows(rows);
         });
    },
    
    getPlayerInfo: function(pseudo, targetObj) {
        if(!pseudo) return Promise.resolve();
        return window.HMAPI.get("/Membre.php?Pseudo=" + pseudo).then(txt => {
             var doc = new DOMParser().parseFromString(txt, "text/html");
             
             // Extract ID (from Attack Link)
             var attackLink = doc.querySelector("a[href*='Attaquer=']");
             if (attackLink) {
                 var mId = attackLink.getAttribute("href").match(/Attaquer=(\d+)/);
                 if (mId) targetObj.id = mId[1];
             }

             // Extract Coords
             var box = doc.querySelector(".boite_membre");
             if(box) {
                 var link = box.querySelector("a[href^='carte2.php']");
                 if(link) {
                     var m = link.textContent.match(/x=(\d*) et y=(\d*)/);
                     if(m) {
                         targetObj.x = parseInt(m[1]);
                         targetObj.y = parseInt(m[2]);
                     }
                 }
             }
             
             // Extract HF
             var scores = doc.querySelector(".tableau_score");
             if(scores && scores.rows.length > 1) {
                 var hfTxt = scores.rows[1].cells[1].textContent;
                 targetObj.hf = parseInt(hfTxt.replace(/\s/g, "") || "0", 10);
             }
        });
    },
    
    // Scrape attack page for form data and security tokens
    scrapeAttackPage: function() {
        var data = {
            tokens: {},
            hiddenInputs: {},
            targetInfo: {},
            formAction: "",
            valid: false
        };
        
        try {
            var form = document.querySelector('form#formulaireChoixArmee, form[action*="ennemie.php"]');
            if (!form) {
                HMLogger.error("Attack form not found on page");
                return data;
            }
            
            data.formAction = form.getAttribute("action") || "/ennemie.php";
            
            var hiddenInputs = form.querySelectorAll('input[type="hidden"]');
            hiddenInputs.forEach(input => {
                var name = input.getAttribute('name');
                var value = input.value;
                if (name && value) {
                    data.hiddenInputs[name] = value;
                    if (name === 't' || name === 'token' || name === 'security') {
                        data.tokens[name] = value;
                    }
                }
            });
            
            var pseudoCibleInput = document.querySelector('input[name="pseudoCible"]');
            if (pseudoCibleInput) {
                data.targetInfo.pseudo = pseudoCibleInput.value;
            }
            
            var lieuSelect = document.querySelector('select[name="lieu"]');
            if (lieuSelect) {
                data.targetInfo.lieu = lieuSelect.value;
            }
            
            var urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('Attaquer')) {
                data.targetInfo.attackId = urlParams.get('Attaquer');
            }
            
            data.valid = (
                data.formAction && 
                Object.keys(data.hiddenInputs).length > 0 &&
                data.targetInfo.pseudo
            );
            
            if (data.valid) {
                HMLogger.info(`Attack page scraped: Target=${data.targetInfo.pseudo}`);
            } else {
                HMLogger.warn("Attack page scrape incomplete");
            }
            
        } catch (e) {
            HMLogger.error("scrapeAttackPage failed: " + e.message);
        }
        
        return data;
    },
    
    getUnitDistribution: async function(unitTypeIdx) {
        var url = "/Armee.php?deplacement=3&v=" + Date.now();
        var txt = await window.HMAPI.get(url);
        var doc = new DOMParser().parseFromString(txt, "text/html");
        
        var tokenMatch = txt.match(/name="t" id="t" value="([^"]*)"/);
        var dist = { field: 0, anthill: 0, nest: 0, found: false, token: tokenMatch ? tokenMatch[1] : "", unitId: "" };
        
        var names = HMState.UnitNames || [
             "Worker", "Young Dwarf", "Dwarf", "Top Dwarf", "Young Soldier", "Soldier", "Doorkeeper", "Top Doorkeeper", "Fire Ant", "Top Fire Ant", "Top Soldier", "Tank", "Top Tank", "Killer", "Top Killer"
        ];
        
        var searchName = names[unitTypeIdx].toLowerCase().trim();
        
        var options = doc.querySelectorAll('select[name="ChoixUnite"] option');
        Array.from(options).forEach(opt => {
            var optText = opt.textContent.trim().toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
            if (optText === searchName) dist.unitId = opt.value;
        });
        
        if(!dist.unitId) {
            var map = ["unite1", "unite2", "unite3", "unite4", "unite5", "unite6", "unite14", "unite7", "unite8", "unite9", "unite10", "unite13", "unite11", "unite12"];
            dist.unitId = map[unitTypeIdx] || "unite1";
        }

        var rows = doc.querySelectorAll('tr[align="center"]');
        Array.from(rows).forEach(row => {
            if (dist.found) return;
            var labelEl = row.querySelector(".pas_sur_telephone");
            if(!labelEl) return;
            
            var label = labelEl.textContent.trim().toLowerCase();
            if (label === searchName || label.includes(searchName) || searchName.includes(label)) {
                var spans = row.querySelectorAll("span[id]");
                spans.forEach(span => {
                    var m = span.id.match(/\((\d+),'([^']+)',(\d)\)/);
                    if(m) {
                        var amount = parseInt(m[1], 10);
                        var loc = parseInt(m[3], 10);
                        if(loc === 1) dist.field += amount;
                        else if(loc === 2) dist.anthill += amount;
                        else if(loc === 3) dist.nest += amount;
                        dist.found = true;
                    }
                });
            }
        });
        
        if(!dist.found) HMLogger.warn(`Distribution not found for ${searchName}`);
        return dist; 
    }
};
