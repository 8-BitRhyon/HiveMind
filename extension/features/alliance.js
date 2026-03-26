var AllianceManager = {
    exportIntel: function() {
        if(!HMState.Floods || HMState.Floods.length === 0) {
            HMToast.error("No Intel to Report");
            return;
        }
        
        // Serialize
        var payload = HMState.Floods.map(f => ({
            t: f.type,
            a: f.amount,
            p: f.pHF,
            tg: f.tHF,
            m: f.missing || 0,
            l: f.launch,
            re: f.reach
        }));
        
        var json = JSON.stringify(payload);
        
        navigator.clipboard.writeText(json).then(() => {
            HMToast.success("Intel Copied");
        }, () => {
             // Fallback
             try {
                document.getElementById("HM_IntelInput").value = json;
             } catch(e) {}
             HMToast.error("Clipboard Access Denied");
        });
    },
    
    importIntel: function() {
        try {
            var raw = document.getElementById("HM_IntelInput").value.trim();
            if(!raw) return HMToast.error("Input Empty");
            
            var payload = JSON.parse(raw);
            if(!Array.isArray(payload)) throw new Error("Invalid Format");
            
            // Hydrate State
            HMState.Floods = payload.map(p => ({
                 type: p.t,
                 amount: p.a,
                 pHF: p.p,
                 tHF: p.tg,
                 missing: p.m,
                 launch: p.l,
                 reach: p.re
            }));
            
            // Trigger Render in FloodManager
            FloodManager.renderTable("HM_divOutput", HMState.Floods);
            HMToast.success("Intel Parsed");
            
        } catch(e) {
            HMToast.error("Corrupted Data");
            HMLogger.error("Import Error: " + e);
        }
    }
};

var MemberlistManager = {
    init: async function() {
        HMLogger.info("MemberlistManager: Initializing...");
        
        // 1. Ensure User Coords are loaded
        if(HMState.User.x === 0 && HMState.User.y === 0) {
            var pseudo = $("#pseudo").text();
            if(pseudo) await HMEngine.getPlayerInfo(pseudo, HMState.User);
        }
        
        // 2. Fetch User Tech if needed for ETA
        if(HMState.Tech.velocity === 0) {
            await HMEngine.getTechno();
        }

        this.injectRangeColumn();
    },

    injectRangeColumn: function() {
        var table = $("table.tableau_classement");
        if(!table.length) return;
        
        var self = this;
        var rows = table.find("tr").slice(1);
        
        // BATCH CALCULATION: Cache distances by coordinate key
        var distanceCache = new Map();
        var rowData = [];
        
        // Pass 1: Collect coordinates and calculate unique distances
        rows.each((i, row) => {
            var $row = $(row);
            var coordsTxt = $row.find("td").filter((idx, td) => $(td).text().includes(" - ")).text();
            
            if(coordsTxt) {
                var m = coordsTxt.match(/(\d+)\s*-\s*(\d+)/);
                if(m) {
                    var key = m[1] + "-" + m[2];
                    if(!distanceCache.has(key)) {
                        var x = parseInt(m[1]), y = parseInt(m[2]);
                        var dist = self.calculateDistance(HMState.User.x, HMState.User.y, x, y, HMState.Tech.velocity);
                        distanceCache.set(key, dist);
                    }
                    rowData.push({ $row, key });
                } else {
                    rowData.push({ $row, key: null });
                }
            } else {
                rowData.push({ $row, key: null });
            }
        });
        
        // Add Header (single DOM op)
        var header = table.find("tr").first();
        header.append("<th class='hm-memberlist-header'>Tactical Range</th>");
        
        // Pass 2: Inject columns using cached distances (single DOM pass)
        rowData.forEach(rd => {
            if(rd.key) {
                var dist = distanceCache.get(rd.key);
                var color = dist < 3600000 ? "#c8102e" : "inherit";
                var weight = dist < 3600000 ? "700" : "400";
                rd.$row.append(`<td style="color:${color}; font-weight:${weight}; font-family:var(--font-mono); text-align:right; border-left:1px dashed #000;">${Utils.formatTime(dist)}</td>`);
            } else {
                rd.$row.append("<td>--</td>");
            }
        });
        
        HMLogger.info(`MemberlistManager: ${distanceCache.size} unique distances calculated for ${rows.length} rows`);
    },

    calculateDistance: function(x1, y1, x2, y2, velocity) {
        var dist = Math.ceil(
            Math.pow(0.9, velocity) * 637200 * 
            (1 - Math.exp(-(Math.sqrt(Math.pow(x1-x2, 2) + Math.pow(y1-y2, 2)) / 350)))
        );
        return dist * 1000; // Return ms
    }
};
