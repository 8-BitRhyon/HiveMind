var HMBuilder = {
    // Port of hivemind_script.js buildGUI
    build: function() {
        if (window !== window.top) return; // Never build HUD in iframes
        console.log("Restoring UI Builder (Refined)...");
        var title = "HIVEMIND";
        var version = "2.51";
        
        var html = `
     <div class="HM_Container">
         <!-- HEADER -->
         <div class="hm-header">
             <div class="hm-header-controls">
                 <div>
                     <h1 class="hm-title">${title}</h1>
                     <div class="hm-version">v${version}</div>
                 </div>
             </div>
         </div>

         <!-- MODAL TEMPLATE -->
         <div id="HM_Modal" class="hm-modal-overlay" style="display:none;">
             <div class="hm-modal">
                 <div class="hm-modal-header">
                     <h3 id="HM_ModalTitle" style="margin:0;">CONFIRMATION</h3>
                 </div>
                 <div class="hm-modal-body" id="HM_ModalBody"></div>
                 <div class="hm-modal-footer">
                      <button type="button" id="HM_ModalCancel" class="hm-btn-small">CANCEL</button>
                      <button type="button" id="HM_ModalConfirm" class="hm-btn-primary" style="font-size:1rem; padding:10px 20px;">CONFIRM</button>
                 </div>
             </div>
         </div>
         
         <!-- MISSION SECTION -->
         <div class="hm-section">
             <div class="hm-section-header">
                 <span>MISSION</span>
                 <button type="button" id='HM_btnSave' class="hm-btn">Sync Data</button>
             </div>
             <div class="hm-section-content">
                 <div class="hm-grid-2" style="margin-bottom: 24px;">
                     <div>
                         <div class="hm-data-label">Distance (Travel)</div>
                         <div id='HM_distance' class="hm-data-value">--</div>
                     </div>
                     <div>
                         <div class="hm-data-label">Arrival Estimate</div>
                         <div id='HM_eta' class="hm-data-value">--</div>
                     </div>
                 </div>
                 
                 <div class="hm-grid-3" style="margin-bottom: 24px;">
                     <div>
                         <div class="hm-data-label">Algorithm</div>
                         <select id='HM_SelType' class="hm-select">
                             <option value='0' ${HMState.Config.inputs?.HM_SelType == '0' ? 'selected' : ''}>Optimized</option>
                             <option value='1' ${HMState.Config.inputs?.HM_SelType == '1' ? 'selected' : ''}>Degressive</option>
                             <option value='2' ${HMState.Config.inputs?.HM_SelType == '2' ? 'selected' : ''}>Uniform</option>
                         </select>
                     </div>
                     <div>
                         <div class="hm-data-label">Active Waves</div>
                         <select id='HM_SelNb' class="hm-select">
                            ${[1,2,3,4,5,6,7,8].map(n => `<option value="${n}" ${(HMState.Config.inputs?.HM_SelNb || "4") == n ? 'selected' : ''}>${n}</option>`).join('')}
                         </select>
                     </div>
                     <div>
                         <div class="hm-data-label">WAVE SIZE</div>
                         <input type='text' id='HM_Amount' class="hm-input" placeholder="Fixed" value="${HMState.Config.inputs?.HM_Amount || ''}" disabled>
                     </div>
                 </div>
                 
                 <div class="hm-grid-2" style="margin-bottom: 24px;">
                     <div>
                         <div class="hm-data-label">Your Initial HF</div>
                         <input type='text' id='HM_YourHF' class="hm-input" value="${HMState.Config.inputs?.HM_YourHF || ''}">
                     </div>
                     <div>
                         <div class="hm-data-label">Target Initial HF</div>
                         <input type='text' id='HM_TargetHF' class="hm-input" value="${HMState.Config.inputs?.HM_TargetHF || ''}">
                     </div>
                 </div>
                 
                 <div>
                     <div class="hm-data-label">COMPUTED FLOOD CAPACITY</div>
                     <div id='HM_cdf' class="hm-data-value large">0</div>
                 </div>
             </div>
         </div>

         <!-- DEFENSIVE PROTOCOLS SECTION -->
         <div class="hm-section">
             <div class="hm-section-header collapsible ${HMState.Config.collapsed?.["defense-content"] ? 'collapsed' : ''}" data-target="defense-content">
                 <div class="hm-flex-center">
                     <span>DEFENSIVE PROTOCOLS</span>
                     <span class="hm-collapse-icon">▼</span>
                 </div>
                 <button type="button" id='HM_btnRefreshStatus' class="hm-btn">Refresh Status</button>
             </div>
             <div id="defense-content" class="hm-section-content ${HMState.Config.collapsed?.["defense-content"] ? 'collapsed' : ''}">
                 <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
                     <div class="hm-data-label" style="margin-bottom:0;">Auto-Secure Protocol</div>
                     <button type="button" id='HM_btnKeep' value='${HMState.Config.inputs?.HM_btnKeep || "Yes"}' class="hm-toggle ${HMState.Config.inputs?.HM_btnKeep === 'No' ? '' : 'on'}">${HMState.Config.inputs?.HM_btnKeep === 'No' ? 'DISABLED' : 'ENABLED'}</button>
                 </div>
                 
                 <div id="HM_DefensiveInputs" style="${HMState.Config.inputs?.HM_btnKeep === 'No' ? 'opacity:0.4; pointer-events:none;' : ''}">
                     <div class="hm-defense-grid" style="margin-bottom: 20px; font-size: 11px; color: var(--hm-muted); font-weight:700; text-transform:uppercase;">
                         <span style="text-align: left;">TARGET LOCK</span>
                         <span style="text-align: left;">MIN QTY</span>
                         <span style="text-align: left;">DESIGNATION</span>
                         <span style="text-align: right;">Status</span>
                     </div>
                     <div class="hm-defense-grid">
                         <div class="hm-defense-label">FIELD</div>
                         <input type='text' id='HM_HFTroopsNb' value='${HMState.Config.inputs?.HM_HFTroopsNb || '1'}' class="hm-defense-input" placeholder="0">
                         <select id='HM_HFTroopsType' class="hm-select"></select>
                         <span id="hm-status-field" class="hm-defense-status">--</span>
                     </div>
                     <div class="hm-defense-grid">
                         <div class="hm-defense-label">ANTHILL</div>
                         <input type='text' id='HM_ATroops1Nb' value='${HMState.Config.inputs?.HM_ATroops1Nb || '10000'}' class="hm-defense-input" placeholder="0">
                         <select id='HM_ATroops1Type' class="hm-select"></select>
                         <span id="hm-status-anthill" class="hm-defense-status">--</span>
                     </div>
                     <div class="hm-defense-grid">
                         <div class="hm-defense-label">NEST</div>
                         <input type='text' id='HM_ATroops2Nb' value='${HMState.Config.inputs?.HM_ATroops2Nb || '0'}' class="hm-defense-input" placeholder="0">
                         <select id='HM_ATroops2Type' class="hm-select"></select>
                         <span id="hm-status-nest" class="hm-defense-status">--</span>
                     </div>
                     <div class="hm-hint">Passive Defense. Script only re-garrisons if current presence is below Min Qty.</div>
                 </div>
             </div>
         </div>

         <!-- DRAFTS / STRATEGIES -->
         <div class="hm-section">
             <div class="hm-section-header collapsible ${HMState.Config.collapsed?.["HM_Drafts"] ? 'collapsed' : ''}" data-target="HM_Drafts">
                 <div class="hm-flex-center">
                     <span>STRATEGIES (DRAFTS)</span>
                     <span class="hm-collapse-icon">▼</span>
                 </div>
             </div>
             <div id="HM_Drafts" class="hm-section-content ${HMState.Config.collapsed?.["HM_Drafts"] ? 'collapsed' : ''}">
                 <div class="hm-input-group" style="margin-top:20px;">
                    <select id='HM_SelDraft' class="hm-select" style="width: auto; min-width: 150px;"></select>
                    <button id='HM_btnLoadDraft' class="hm-btn">Recall</button>
                 </div>
                 <div class="hm-input-group" style="margin-top:12px;">
                    <input type='text' id='HM_DraftName' class="hm-input" placeholder="Strategem ID" style="text-align: left;">
                    <button id='HM_btnSaveDraft' class="hm-btn">Commit</button>
                    <button id='HM_btnDeleteDraft' class="hm-btn hm-btn-danger">Purge</button>
                 </div>
             </div>
         </div>

         <!-- WAVE TABLE SECTION -->
         <div class="hm-section" style="border-bottom:none;">
             <div class="hm-section-header collapsible ${HMState.Config.collapsed?.["HM_Results"] ? 'collapsed' : ''}" data-target="HM_Results">
                 <div class="hm-flex-center">
                     <span>WAVE TABLE</span>
                     <span class="hm-collapse-icon">▼</span>
                 </div>
                 <button type="button" id='HM_btnRefresh' class="hm-btn">Refresh Data</button>
             </div>
             <div id="HM_Results" class="hm-section-content ${HMState.Config.collapsed?.["HM_Results"] ? 'collapsed' : ''}">
                 <div id="HM_divOutput">
                    <table class="hm-table">
                       <thead>
                           <tr>
                               <th width="30">Launch</th>
                               <th width="40">%</th>
                               <th width="100">Amount</th>
                               <th width="100">Your HF</th>
                               <th width="100">Target HF</th>
                               <th style="text-align: right;">Status</th>
                           </tr>
                       </thead>
                       <tbody id="HM_ResultBody">
                           <tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--hm-muted);">Set Target Info to generate waves.</td></tr>
                       </tbody>
                    </table>
                 </div>
             </div>
         </div>

         <!-- FLOOD QUEUE SECTION -->
         <div class="hm-section">
             <div class="hm-section-header collapsible ${HMState.Config.collapsed?.["HM_Queue"] ? 'collapsed' : ''}" data-target="HM_Queue">
                 <div class="hm-flex-center">
                     <span>FLOOD QUEUE</span>
                     <span class="hm-collapse-icon">▼</span>
                 </div>
                 <button type="button" id='HM_btnLoadMembers' class="hm-btn">⤓ LOAD MEMBERS</button>
             </div>
             <div id="HM_Queue" class="hm-section-content ${HMState.Config.collapsed?.["HM_Queue"] ? 'collapsed' : ''}">
                 <div class="hm-input-group" style="margin-top:20px;">
                     <select id='HM_SelMember' class="hm-select" style="flex:1; min-width: 200px;">
                         <option value="">-- Select Alliance Member --</option>
                     </select>
                     <button type="button" id='HM_btnAddToQueue' class="hm-btn hm-btn-success">+ ADD</button>
                     <button type="button" id='HM_btnAutoAdd' class="hm-btn hm-btn-accent">⚡ AUTO-ADD MOST</button>
                 </div>
                 <div id="HM_QueueContainer" style="margin-top:20px;">
                     <div class="hm-empty">No targets in queue. Load members and add them above.</div>
                 </div>
                 <div class="hm-input-group" style="margin-top:12px; justify-content: flex-end; gap: 8px;">
                     <div style="flex:1; display:flex; align-items:center; gap:6px; font-size:11px; color:var(--hm-muted);">
                         <input type="checkbox" id="HM_chkShowAllTargets" ${HMState.Config.inputs?.HM_chkShowAllTargets ? 'checked' : ''} style="margin:0;">
                         <label for="HM_chkShowAllTargets">Show All Targets</label>
                     </div>
                     <button type="button" id='HM_btnNukeQueue' class="hm-btn hm-btn-danger" style="font-size:10px; padding:4px 8px;">NUKE STORAGE</button>
                 </div>
             </div>
         </div>

         <div class="hm-footer">
             <button type="button" id='HM_btnLaunch' class="hm-btn-primary" style="margin-bottom: 20px; border-radius: 0; width: 100%;">INITIATE FLOOD SEQUENCE</button>
             <div class="hm-footer-disclaimer">HIVEMIND IS A CALCULATION TOOL. YOU ARE RESPONSIBLE FOR ALL ACTIONS.</div>
         </div>
     </div>
        `;

        // Inject into page
        var container = document.getElementById("hivemind_container");
        if (!container) {
            container = document.createElement("div");
            container.id = "hivemind_container";
        }
        
        // Locate original position (Directly below the unit selection table)
        var table = document.getElementById("tabChoixArmee");
        if (table) {
            table.parentNode.insertBefore(container, table.nextSibling);
        } else {
            document.body.appendChild(container);
        }
        
        container.innerHTML = html;

        // Apply Load State Sync
        this.syncInputStates();
        this.attachGlobalEvents();
        
        // Restore saved UI state (inputs, selects, collapsed sections)
        this.restoreUI();
        
        // Initial Refresh if data exists
        if (HMState.Floods.length > 0) FloodManager.compute();
        
        // Populate member dropdown immediately after build
        if (typeof QueueManager !== 'undefined') {
            QueueManager.updateMemberDropdown();
        }
    },
    
    syncInputStates: function() {
        if (!HMState.Config.inputs) HMState.Config.inputs = {};
        document.querySelectorAll(".hm-input, .hm-select, .hm-defense-input, .hm-toggle").forEach(el => {
            if (el.id) HMState.Config.inputs[el.id] = el.value;
        });
        HMLogger.debug("[UI] State synced to internal config");
    },

    updateControlStates: function() {
        var modeEl = document.getElementById("HM_SelMode");
        var typeEl = document.getElementById("HM_SelType");
        if (!modeEl || !typeEl) return;
        
        var mode = modeEl.value;
        var type = parseInt(typeEl.value);
        var nbInp = document.getElementById("HM_SelNb");
        var amtInp = document.getElementById("HM_Amount");
        if (!nbInp || !amtInp) return;
        
        if (mode === "attack") {
            // In Attack Mode, type 0 = Overwhelm (Auto-waves), 
            // 1 = Full Strike (1 Wave), 2 = Precise (N Waves)
            nbInp.disabled = (type === 1);
            amtInp.disabled = true;
            amtInp.placeholder = (type === 0) ? "Strategic" : "Max Force";
        } else {
            // Flood Mode Logic
            if(type === 0) { // Optimized
                nbInp.disabled = true;
                amtInp.disabled = true;
                amtInp.placeholder = "Auto";
            } else if (type === 1) { // Degressive
                nbInp.disabled = false;
                amtInp.disabled = true;
                amtInp.placeholder = "20%";
            } else if (type === 2) { // Uniform
                nbInp.disabled = false;
                amtInp.disabled = false;
                amtInp.placeholder = "Amount";
            }
        }
    },

    saveUI: function() {
        var state = {
            inputs: {},
            collapsed: {}
        };

        // Inputs
        document.querySelectorAll(".hm-input, .hm-select, .hm-defense-input, .hm-toggle").forEach(el => {
            if (el.id) state.inputs[el.id] = el.value;
        });

        // Toggles mapping
        state.inputs.HM_btnKeep = document.getElementById("HM_btnKeep").classList.contains("on") ? "Yes" : "No";

        // Collapsed sections
        document.querySelectorAll(".hm-section-content").forEach(el => {
            if (el.id) state.collapsed[el.id] = el.classList.contains("collapsed");
        });

        HMStorage.saveUIState(state);
    },
    
    restoreUI: function() {
        var state = HMStorage.loadUIState();
        if (!state || !state.inputs) return;
        
        // Restore inputs and selects
        Object.keys(state.inputs).forEach(id => {
            var el = document.getElementById(id);
            if (!el) return;
            
            if (el.tagName === "SELECT") {
                // For selects, set the value
                el.value = state.inputs[id];
            } else if (el.tagName === "INPUT") {
                el.value = state.inputs[id];
            } else if (el.tagName === "BUTTON" && id === "HM_btnKeep") {
                // Restore toggle state
                if (state.inputs[id] === "Yes") {
                    el.classList.add("on");
                    el.value = "Yes";
                    el.innerHTML = "ENABLED";
                } else {
                    el.classList.remove("on");
                    el.value = "No";
                    el.innerHTML = "DISABLED";
                }
            }
        });
        
        // Restore collapsed sections
        if (state.collapsed) {
            Object.keys(state.collapsed).forEach(id => {
                var el = document.getElementById(id);
                if (el && state.collapsed[id]) {
                    el.classList.add("collapsed");
                }
            });
        }
        
        HMLogger.debug("[UI] State restored from localStorage");
    },

    attachGlobalEvents: function() {
        var self = this;

        // Sync Data / Save Btn
        document.getElementById("HM_btnSave").onclick = function(e) {
             e.preventDefault();
             self.saveUI();
             HMToast.success("Local State Synced");
             if(typeof FloodManager !== "undefined") FloodManager.compute();
        };

        // Refresh Data
        document.getElementById("HM_btnRefresh") && (document.getElementById("HM_btnRefresh").onclick = function() {
             if(typeof FloodManager !== "undefined") FloodManager.compute();
        });

        // Refresh Status
        document.getElementById("HM_btnRefreshStatus") && (document.getElementById("HM_btnRefreshStatus").onclick = function() {
             if(typeof DefenseManager !== "undefined") DefenseManager.refresh();
        });

        // Launch Sequence
        document.getElementById("HM_btnLaunch").onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            var activeWaves = HMState.Floods.filter(f => f.launch).length;
            if(activeWaves === 0) {
                HMToast.error("No active waves to launch.");
                return;
            }

            // Calculate actual deployable amount (account for partial floods)
            var activeFloods = HMState.Floods.filter(f => f.launch);
            var totalAmount = activeFloods.reduce((sum, f) => {
                var actual = f.amount - (f.missing || 0);
                return sum + Math.max(0, actual);
            }, 0);
            var hasPartial = activeFloods.some(f => f.partial);
            
            // Detect destination (lieu) for warning
            var lieuSelect = document.querySelector("select[name='lieu']");
            var lieu = lieuSelect ? lieuSelect.value : "1";
            var lieuLabels = { "1": "🌿 Hunting Field", "2": "Anthill (Dome)", "3": "🐜 Nest" };
            var destText = lieuLabels[lieu] || "Unknown (lieu=" + lieu + ")";
            var isAnthillAttack = lieu !== "1";
            
            // Ally detection for launch modal
            var targetInput = document.querySelector("input[name='pseudoCible']");
            var targetPseudo = targetInput ? targetInput.value.trim() : "";
            var isAlly = false;
            try {
              var cachedMembers = JSON.parse(localStorage.getItem("HM_AllianceMembers") || "[]");
              isAlly = cachedMembers.some(function(m) {
                return m.name && m.name.toLowerCase().trim() === targetPseudo.toLowerCase().trim();
              });
            } catch(e) {}
            
            var warningBanner = "";
            if (isAlly && isAnthillAttack) {
              // ALLY + Anthill/Nest selected → safeguard will redirect
              warningBanner = `<div style='background:rgba(45,90,39,0.15); border:2px solid var(--hm-success, #2d5a27); padding:10px; margin:8px 0; text-align:center;'>
                   <span style='font-size:1.4em;'>⛑️ ALLY SAFEGUARD</span><br>
                   <b style='color:var(--hm-success, #2d5a27);'>"${targetPseudo}" is an alliance member.</b><br>
                   <small>Attack will be <b>redirected to Hunting Field</b> automatically.</small>
                 </div>`;
              destText = "🌿 Hunting Field (forced by safety)";
            } else if (isAnthillAttack) {
              // ENEMY + Anthill/Nest selected → show danger warning
              warningBanner = `<div style='background:rgba(139,32,32,0.15); border:2px solid var(--hm-error, #8b2020); padding:10px; margin:8px 0; text-align:center;'>
                   <span style='font-size:1.4em;'>⚠️ ANTHILL ATTACK</span><br>
                   <b style='color:var(--hm-error, #8b2020);'>You are targeting the DOME, not the Hunting Field.</b><br>
                   <small>Troops sent to the anthill will engage in combat, not a HF transfer.</small>
                 </div>`;
            }
            
            HMUI.confirm(
                "LAUNCH COORDINATED FLOOD",
                `<div style='font-family:var(--font-mono); font-size:13px;'>
                    ${warningBanner}
                    <p>Target: <b>${targetPseudo}</b> ${isAlly ? '<span style="color:var(--hm-success);">(ALLY)</span>' : ''}</p>
                    <p>You are about to initiate a synchronized sequence of <b>${activeWaves} waves</b>.</p>
                    <p>Total HF Transfer: <b>${Utils.formatInt(totalAmount)}</b>${hasPartial ? " <span style='color:#ffcc00;'>(includes partial)</span>" : ""}</p>
                    <p>Destination: <b>${destText}</b></p>
                    <p style='color:var(--hm-error); font-weight:700;'>THIS ACTION IS SEMI-AUTOMATED BUT REQUIRES YOUR OVERSIGHT.</p>
                 </div>`,
                async () => {
                    // Find first active wave
                    var firstIdx = HMState.Floods.findIndex(f => f.launch);
                    if(firstIdx >= 0 && typeof FloodManager !== "undefined") {
                        await FloodManager.launchSequence(firstIdx);
                    }
                }
            );
        };
        
        // Mode/Type Change Sync
        var modeSel = document.getElementById("HM_SelMode");
        var typeSel = document.getElementById("HM_SelType");
        if (modeSel) modeSel.onchange = () => { self.updateControlStates(); self.saveUI(); };
        if (typeSel) typeSel.onchange = () => { self.updateControlStates(); self.saveUI(); };

        // Initial state set
        this.updateControlStates();

        // Input Changes
        document.querySelectorAll(".hm-input, .hm-select, .hm-defense-input").forEach(el => {
            el.oninput = () => { 
                self.saveUI(); 
                if(el.id === "HM_SelType" || el.id === "HM_SelMode") self.syncInputStates(); 
                if(typeof FloodManager !== "undefined") FloodManager.compute();
            };
        });

        // Designation dropdowns refresh presence
        document.querySelectorAll("#HM_DefensiveInputs select").forEach(el => {
            el.onchange = () => { self.saveUI(); if(typeof DefenseManager !== "undefined") DefenseManager.refresh(); };
        });

        // Keep Toggle
        var btnKeep = document.getElementById("HM_btnKeep");
        if (btnKeep) {
            btnKeep.onclick = function() {
                this.classList.toggle("on");
                var isOn = this.classList.contains("on");
                this.innerText = isOn ? "ENABLED" : "DISABLED";
                var defInputs = document.getElementById("HM_DefensiveInputs");
                if (defInputs) {
                    defInputs.style.opacity = isOn ? "1" : "0.4";
                    defInputs.style.pointerEvents = isOn ? "all" : "none";
                }
                self.saveUI();
            };
        }
        // Collapsible sections
        document.querySelectorAll(".hm-section-header.collapsible").forEach((header) => {
            header.onclick = function (e) {
                if(e.target.tagName === "BUTTON") return;
                
                var targetId = this.getAttribute("data-target");
                var content = document.getElementById(targetId);
                if (content) {
                    content.classList.toggle("collapsed");
                    this.classList.toggle("collapsed");
                    self.saveUI();
                }
            };
        });
        
        // Strategy Handlers
        if(typeof StrategyManager !== "undefined") {
            StrategyManager.init();
        }
        
        // Queue Handlers
        if(typeof FloodQueueManager !== "undefined") {
            // Load Members button
            var btnLoad = document.getElementById("HM_btnLoadMembers");
            if (btnLoad) {
                btnLoad.onclick = async function() {
                    var originalText = this.textContent;
                    this.textContent = "Loading...";
                    try {
                        var members = await QueueManager.fetchAllianceMembers(true);
                        HMToast.success("Loaded " + (members ? members.length : 0) + " members");
                    } catch (e) {
                        HMLogger.error("UI Load Members failed: " + e.message);
                    } finally {
                        this.textContent = originalText;
                    }
                };
            }

            // Show All Targets Toggle
            var chkShowAll = document.getElementById("HM_chkShowAllTargets");
            if (chkShowAll) {
                chkShowAll.onchange = function() {
                    var settings = JSON.parse(localStorage.getItem("HM_Settings") || "{}");
                    settings.queueShowAll = this.checked;
                    localStorage.setItem("HM_Settings", JSON.stringify(settings));
                    QueueManager.updateMemberDropdown();
                    self.saveUI();
                };
            }
            
            // Add to Queue button
            var btnAdd = document.getElementById("HM_btnAddToQueue");
            if (btnAdd) {
                btnAdd.onclick = async function() {
                    var sel = document.getElementById("HM_SelMember");
                    var name = sel.value;
                    if (!name) {
                        HMToast.error("Select a member first");
                        return;
                    }
                    this.textContent = "Adding...";
                    await FloodQueueManager.addTarget(name);
                    this.textContent = "+ ADD";
                    sel.selectedIndex = 0;
                };
            }

            // Auto-Add Most button
            var btnAutoAdd = document.getElementById("HM_btnAutoAdd");
            if (btnAutoAdd) {
                btnAutoAdd.onclick = async function() {
                    var originalText = this.textContent;
                    this.textContent = "Adding...";
                    this.disabled = true;
                    try {
                        await QueueManager.autoAddMostMembers();
                    } catch (e) {
                        HMLogger.error("Auto-Add Most failed: " + e.message);
                    } finally {
                        this.textContent = originalText;
                        this.disabled = false;
                    }
                };
            }

            // Nuke Queue button
            var btnNuke = document.getElementById("HM_btnNukeQueue");
            if (btnNuke) {
                btnNuke.onclick = function() {
                    QueueManager.nukeStorage();
                };
            }
            
            // Render queue on load
            QueueManager.renderQueue();
        }
    }
};
