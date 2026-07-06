var FloodManager = {
  // --------------------------------------------------------
  // VALIDATION (Call before launch)
  // --------------------------------------------------------
  validateFloodSequence: function () {
    var errors = [];
    var warnings = [];

    // Check 1: Do we have enough troops?
    var totalNeeded = HMState.Floods.reduce(
      (sum, f) => sum + (f.launch ? f.amount : 0),
      0,
    );
    var totalAvailable = HMState.Units.reduce((sum, u) => sum + u, 0);

    if (totalNeeded > totalAvailable) {
      errors.push(
        `Insufficient troops: Need ${Utils.formatInt(totalNeeded)}, have ${Utils.formatInt(totalAvailable)}`,
      );
    }

    // Check 2: Are we attacking ourselves?
    var targetName = document.querySelector("input[name='pseudoCible']");
    var userName = document.getElementById("pseudo");
    if (targetName && userName && targetName.value === userName.textContent) {
      errors.push("Target is yourself! Aborting friendly fire.");
    }

    // Check 3: Is target within reasonable reach? (>24h warning)
    if (HMState.Travel.time > 86400000) {
      warnings.push("Target is >24h away. Consider closer targets.");
    }

    // Check 4: Defensive reserves check
    if (
      document.getElementById("HM_btnKeep") &&
      document.getElementById("HM_btnKeep").value === "Yes"
    ) {
      var reserved =
        parseInt(
          (document.getElementById("HM_HFTroopsNb")?.value || "0").replace(
            /[^0-9]/g,
            "",
          ),
        ) +
        parseInt(
          (document.getElementById("HM_ATroops1Nb")?.value || "0").replace(
            /[^0-9]/g,
            "",
          ),
        ) +
        parseInt(
          (document.getElementById("HM_ATroops2Nb")?.value || "0").replace(
            /[^0-9]/g,
            "",
          ),
        );

      if (totalNeeded + reserved > totalAvailable) {
        warnings.push("Not enough troops for attack + defensive reserves");
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  // --------------------------------------------------------
  // RETRY LOGIC (Exponential Backoff)
  // --------------------------------------------------------
  launchSequenceWithRetry: async function (idx, retries) {
    retries = retries || 3;
    var self = this;

    for (var attempt = 1; attempt <= retries; attempt++) {
      try {
        await self.launchSequence(idx);
        return true; // Success
      } catch (e) {
        HMLogger.warn(
          `Wave ${idx} attempt ${attempt}/${retries} failed: ${e.message}`,
        );

        if (attempt < retries) {
          // Exponential backoff: 2s, 4s, 8s
          var delay = Math.pow(2, attempt) * 1000;
          HMToast.warn(`Retrying in ${delay / 1000}s...`);
          await Utils.humanDelay(delay, delay + 500);
        } else {
          HMToast.error(`Wave ${idx} failed after ${retries} attempts`);
          throw e;
        }
      }
    }
  },

  // --------------------------------------------------------
  // CORE CALCULATION LOGIC
  // --------------------------------------------------------
  compute: function () {
    if (!HMState.dataLoaded) return;

    var type = document.getElementById("HM_SelType").value;
    var nb = parseInt(document.getElementById("HM_SelNb").value);

    // Enable/Disable inputs based on Algorithm Type
    // 0=Opti, 1=Degressive, 2=Uniform
    document.getElementById("HM_SelNb").disabled = type < 1;
    document.getElementById("HM_Amount").disabled = type < 2;

    // Parse HF Values
    var inputUserHF = document
      .getElementById("HM_YourHF")
      .value.replace(/[^0-9]/g, "");
    var inputTargetHF = document
      .getElementById("HM_TargetHF")
      .value.replace(/[^0-9]/g, "");

    HMState.User.hf = parseInt(inputUserHF || "0", 10);
    HMState.Target.hf = parseInt(inputTargetHF || "0", 10);

    var playerHF = HMState.User.hf;
    var targetHF = HMState.Target.hf;

    HMState.Floods = [];

    // --- LOGIC PORTED FROM hivemind_script.js ---

    if (type == 1) {
      // === DEGRESSIVE ===
      // Each wave steals 20% of the target's REMAINING HF
      for (var i = 0; i < nb; i++) {
        var f = {
          launch: true,
          amount: Math.floor(targetHF * 0.2),
          type: "20 %",
          pHF: playerHF,
          tHF: targetHF,
          reach: playerHF < targetHF * 2 && playerHF * 3 > targetHF,
          missing: 0,
        };
        HMState.Floods.push(f);

        playerHF += f.amount;
        targetHF -= f.amount;
      }
    } else if (type == 2) {
      // === UNIFORM ===
      // Each wave steals a fixed amount (capped at 20% by game mechanics)
      var fixedAmount = parseInt(
        document.getElementById("HM_Amount").value.replace(/[^0-9]/g, "") ||
          "0",
        10,
      );

      for (var i = 0; i < nb; i++) {
        var actualAmount = Math.min(fixedAmount, Math.floor(targetHF * 0.2));
        var f = {
          launch: true,
          amount: actualAmount,
          type: "[" + Math.round((actualAmount / (targetHF || 1)) * 100) + "%]",
          pHF: playerHF,
          tHF: targetHF,
          reach: playerHF < targetHF * 2 && playerHF * 3 > targetHF,
          missing: 0,
        };
        HMState.Floods.push(f);

        playerHF += actualAmount;
        targetHF -= actualAmount;
      }
    } else {
      // === OPTIMIZED (Default) ===
      var f = {
        launch: true,
        amount: 0,
        type: "20 %",
        pHF: playerHF,
        tHF: targetHF,
        reach: true,
      };

      // Optimized Logic
      if (f.pHF < f.tHF * 2 && f.pHF * 3 > f.tHF) {
        if (type == 0) {
          f.amount = Math.floor(f.tHF * 0.2);
          while (f.pHF + f.amount < Math.floor((f.tHF - f.amount) * 2)) {
            var nextF = {
              launch: true,
              amount: f.amount,
              type: "20 %",
              pHF: f.pHF,
              tHF: f.tHF,
              reach: f.pHF < f.tHF * 2 && f.pHF * 3 > f.tHF,
              missing: 0,
            };
            HMState.Floods.push(nextF);

            f.pHF += f.amount;
            f.tHF -= f.amount;
            f.amount = Math.floor(f.tHF * 0.2);
          }

          // Limit flood
          f.amount = Math.floor((2 / 3) * (f.tHF - 1 - f.pHF / 2));
          f.type = "<b>" + Math.round((f.amount / f.tHF) * 100) + " %</b>";
          var limitF = {
            launch: true,
            amount: f.amount,
            type: f.type,
            pHF: f.pHF,
            tHF: f.tHF,
            reach: true,
            missing: 0,
          };
          HMState.Floods.push(limitF);

          f.pHF += f.amount;
          f.tHF -= f.amount;

          // Last flood
          f.amount = Math.floor(f.tHF * 0.2);
          f.type = "20 %";
          HMState.Floods.push({
            launch: true,
            amount: f.amount,
            type: f.type,
            pHF: f.pHF,
            tHF: f.tHF,
            reach: true,
            missing: 0,
          });
        }
      } else {
        // Fallback if out of range
        f.amount = 0;
        f.type = "OUT OF RANGE";
        f.reach = false;
        HMState.Floods.push(f);
      }
    }

    // Calculate Launch Capability (Army Distribution)
    this.computeLaunch();

    // Render
    this.renderTable();
  },

  computeLaunch: function () {
    var army = [...HMState.Units]; // Copy
    var cdf = 0;

    // 1. TROOP RESERVATION (Calys Logic)
    // If Auto-Secure is enabled, subtract these from available army BEFORE distribution
    var btnKeep = document.getElementById("HM_btnKeep");
    if (btnKeep && btnKeep.value === "Yes") {
      var resField = parseInt(
        document.getElementById("HM_HFTroopsNb").value.replace(/[^0-9]/g, "") ||
          "0",
        10,
      );
      var resFieldType = parseInt(
        document.getElementById("HM_HFTroopsType").value,
        10,
      );

      var resA1 = parseInt(
        document.getElementById("HM_ATroops1Nb").value.replace(/[^0-9]/g, "") ||
          "0",
        10,
      );
      var resA1Type = parseInt(
        document.getElementById("HM_ATroops1Type").value,
        10,
      );

      var resA2 = parseInt(
        document.getElementById("HM_ATroops2Nb").value.replace(/[^0-9]/g, "") ||
          "0",
        10,
      );
      var resA2Type = parseInt(
        document.getElementById("HM_ATroops2Type").value,
        10,
      );

      if (resField > 0 && army[resFieldType] !== undefined)
        army[resFieldType] = Math.max(0, army[resFieldType] - resField);
      if (resA1 > 0 && army[resA1Type] !== undefined)
        army[resA1Type] = Math.max(0, army[resA1Type] - resA1);
      if (resA2 > 0 && army[resA2Type] !== undefined)
        army[resA2Type] = Math.max(0, army[resA2Type] - resA2);
    }

    // Calculate Total Capacity
    for (var i = 0; i < army.length; i++) {
      cdf += army[i];
    }

    // Update CFC Display
    var elCFC = document.getElementById("HM_cdf");
    if (elCFC) elCFC.innerHTML = Utils.formatInt(cdf);

    // Distribute troops to waves
    HMState.Floods.forEach((f) => {
      f.army = new Array(15).fill(0);
      f.missing = 0;
      f.partial = false;

      // CRITICAL: Only allocate troops to waves marked for launch!
      // Unchecked waves should NOT consume the army pool.
      if (!f.launch) {
        return; // Skip unchecked waves
      }

      var needed = f.amount;
      var troopsFound = 0;

      // Young Dwarfs first (index 0), then Dwarfs (1), etc.
      for (var j = 0; j < army.length; j++) {
        if (needed <= 0) break;

        var available = army[j];
        if (available > 0) {
          var take = Math.min(available, needed);
          f.army[j] = take;
          army[j] -= take;
          needed -= take;
          troopsFound += take;

          // Debug: Log which unit type is being used
          var unitName = HMState.UnitNames[j] || "Type" + j;
          HMLogger.info(`[Flood] Wave allocated ${take} ${unitName}`);
        }
      }

      if (needed > 0) {
        f.missing = needed;
        if (troopsFound > 0) {
          f.partial = true; // Flag as partial if some troops were sent
        } else {
          // NO TROOPS AT ALL for this wave
          f.launch = false; // Disable by default
        }
      }
    });
    HMState.RemainingUnits = [...army];
  },

  renderTable: function () {
    var container = document.getElementById("HM_divOutput");
    if (!container) return;

    var html = `<table class="hm-table"><thead><tr>
            <th>LAUNCH</th>
            <th style="text-align:right">%</th>
            <th style="text-align:right">AMOUNT</th>
            <th style="text-align:right">YOUR HF</th>
            <th style="text-align:right">TARGET HF</th>
            <th style="text-align:right">STATUS</th>
        </tr></thead><tbody>`;

    var total = 0;
    var activeCount = 0;

    HMState.Floods.forEach((f, i) => {
      if (f.launch) {
        // Account for partial: subtract missing
        total += Math.max(0, f.amount - (f.missing || 0));
        activeCount++;
      }
      var rowClass = f.reach ? "" : "hm-row-error";
      var rowOpacity = f.launch ? "" : "opacity: 0.5;";

      var statusText = f.launch ? "Pending" : "Skipped";
      var statusClass = f.launch ? "pending" : "";

      if (f.partial) {
        statusText = "PARTIAL";
        statusClass = "warning"; // Assuming warning class exists or just color-coded
      } else if (!f.launch && f.missing === f.amount) {
        statusText = "EMPTY";
      }

      html += `<tr class="${rowClass}" style="${rowOpacity}">
                <td><button type="button" class="hm-toggle-sm ${f.launch ? "on" : ""} HM_SwitchLaunch" data-idx="${i}">${f.launch ? "✓" : "-"}</button></td>
                <td style="text-align:right; font-weight:700;">${f.type}</td>
                <td style="text-align:right; font-family:var(--font-mono);">${Utils.formatInt(f.amount)}</td>
                <td style="text-align:right; color:var(--hm-muted);">${Utils.formatInt(f.pHF)}</td>
                <td style="text-align:right; color:var(--hm-muted);">${Utils.formatInt(f.tHF)}</td>
                 <td style="text-align:right;" id="HM_Status_${i}"><span class="hm-status-dot ${statusClass}"></span>${statusText} ${f.partial ? `<br><small style="color:#ffcc00">-${Utils.formatInt(f.missing)}</small>` : ""}</td>
            </tr>`;
    });

    html += `<tr class="total-row"><td colspan="2">ACTIVE (${activeCount})</td><td style="text-align:right; font-weight:900;">${Utils.formatInt(total)}</td><td colspan="3"></td></tr></tbody></table>`;
    container.innerHTML = html;

    // Re-attach events
    var self = this;
    $(".HM_SwitchLaunch").click(function () {
      var idx = $(this).data("idx");
      HMState.Floods[idx].launch = !HMState.Floods[idx].launch;
      self.computeLaunch();
      self.renderTable();
    });
  },

  launchSequence: async function (idx) {
    var self = this;

    if (idx === 0) {
      // NETWORK: Check for target conflicts and lock
      if (typeof NetworkManager !== "undefined" && NetworkManager.isConnected) {
        var targetId = HMState.Target?.id || "unknown";
        var targetName = HMState.Target?.name || "Unknown";

        // Acquire lock
        await NetworkManager.lockTarget(targetId, targetName);
        HMLogger.info("[Network] Target locked for flooding: " + targetName);
      }
    }

    var f = HMState.Floods[idx];
    var statusEl = document.getElementById("HM_Status_" + idx);

    // Recalculate if needed (safety)
    if (!f.amount || f.amount <= 0) {
      HMLogger.warn("Wave " + idx + " empty or invalid.");
      return;
    }

    // Construct Payload (FormData)
    var fd = new URLSearchParams();

    // 1. Scrap Hidden Inputs from valid form
    document
      .querySelectorAll("#formulaireChoixArmee input[type='hidden']")
      .forEach((inp) => {
        fd.append(inp.name, inp.value);
      });

    fd.append("ChoixArmee", "1");

    // 2. Target info
    var pc = document.querySelector("input[name='pseudoCible']");
    if (pc) fd.append("pseudoCible", pc.value);

    // CONTEXT-AWARE SAFETY INTERLOCK
    // lieu=1 = Hunting Field, lieu=2 = Anthill/Dome, lieu=3 = Nest
    // For ALLIANCE members: ALWAYS force lieu=1 (prevent catastrophic friendly fire)
    // For ENEMIES: respect user's chosen lieu, but warn if targeting anthill/nest
    var lieuSelect = document.querySelector("select[name='lieu']");
    var userChosenLieu = lieuSelect ? lieuSelect.value : "1";

    // Determine if target is an alliance member
    var targetName = document.querySelector("input[name='pseudoCible']");
    var targetPseudo = targetName ? targetName.value.trim() : "";
    var isAlly = false;
    try {
      var cachedMembers = JSON.parse(localStorage.getItem("HM_AllianceMembers") || "[]");
      HMLogger.debug(`[Attack] Ally check: target="${targetPseudo}", cached members=${cachedMembers.length}`);
      if (cachedMembers.length > 0) {
        HMLogger.debug(`[Attack] Sample cached names: ${cachedMembers.slice(0, 5).map(m => m.name).join(", ")}`);
      }
      isAlly = cachedMembers.some(function(m) {
        return m.name && m.name.toLowerCase().trim() === targetPseudo.toLowerCase().trim();
      });
      HMLogger.info(`[Attack] Target "${targetPseudo}" is ${isAlly ? "ALLY" : "ENEMY"}`);
    } catch(e) {
      HMLogger.warn(`[Attack] Ally check failed: ${e.message}`);
    }

    if (isAlly && userChosenLieu !== "1") {
      HMLogger.warn(`[Attack] SAFETY: Alliance member "${targetPseudo}" detected. Forcing lieu=1 (HF).`);
      userChosenLieu = "1"; // Override for allies — non-negotiable
    }

    // 3. Army dispatch (must be populated by computeLaunch)
    if (!f.army) {
      HMLogger.error("Wave " + idx + " has no assigned units.");
      if (statusEl) {
        statusEl.innerHTML = "ERR";
        statusEl.style.color = "red";
      }
      return;
    }

    // Unit mapping: array index -> form parameter (matches original Caly's code)
    var map = [
      "unite1",  // 0: JSN (Young Dwarf)
      "unite2",  // 1: N (Dwarf)
      "unite3",  // 2: NE (Top Dwarf)
      "unite4",  // 3: JS (Young Soldier)
      "unite5",  // 4: S (Soldier)
      "unite6",  // 5: C (Doorkeeper)
      "unite14", // 6: CE (Top Doorkeeper)
      "unite7",  // 7: A (Fire Ant)
      "unite8",  // 8: AE (Top Fire Ant)
      "unite9",  // 9: SE (Top Soldier)
      "unite10", // 10: Tk (Tank)
      "unite13", // 11: TkE (Top Tank)
      "unite11", // 12: Tu (Killer)
      "unite12", // 13: TuE (Top Killer)
    ];

    for (var i = 0; i < map.length; i++) {
      fd.append(map[i], f.army[i] || 0);
    }

    // NOTE: Original Caly's does NOT send 'Envoyer' or 'lieu' in POST body.
    // ChoixArmee=1 + hidden inputs + unit data is the complete payload.

    HMLogger.info(`[Attack] Launching Wave ${idx}...`);

    try {
      // CONTEXT-AWARE LIEU INJECTION
      var actionUrl = $("#formulaireChoixArmee").attr("action");
      if (actionUrl && actionUrl.includes("lieu=")) {
        actionUrl = actionUrl.replace(/lieu=\d+/, "lieu=" + userChosenLieu);
      } else if (actionUrl) {
        actionUrl += (actionUrl.includes("?") ? "&" : "?") + "lieu=" + userChosenLieu;
      }

      var lieuMatch = actionUrl.match(/lieu=(\d+)/);
      var actualLieu = lieuMatch ? lieuMatch[1] : "1";
      var lieuLabels = { "1": "🌿 HF (Hunting Field)", "2": "🏰 ANTHILL (Dome)", "3": "🐜 NEST" };
      var destLabel = lieuLabels[actualLieu] || "⚠️ lieu=" + actualLieu;

      // Use jQuery $.post matching original Caly's implementation
      // This maintains session context and cookie handling natively
      var dataSend = {};
      for (var pair of fd.entries()) {
        dataSend[pair[0]] = pair[1];
      }

      // POST using native fetch matching jQuery $.post behavior
      // NO X-Requested-With header (which HMAPI adds via background fetch)
      // Includes cookies via credentials: 'include'
      var body = new URLSearchParams(dataSend).toString();
      var rawResp = await fetch(actionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        credentials: "include",
        body: body
      });
      var resp = await rawResp.text();

      // 0. Update Token for next wave if present in response
      var nextToken = resp.match(/name="t" id="t" value="([^"]*)"/);
      if (nextToken) {
        var tInput = document.querySelector(
          "#formulaireChoixArmee input[name='t'][id='t']",
        );
        if (tInput) {
          tInput.value = nextToken[1];
          // HMLogger.info("[Attack] Security Token Rotated.");
        }
      }

      // Check Success (French/English)
      var isSuccess = false;
      var isAllianceWarning = false;
      var rLow = resp.toLowerCase();

      // Parse response to plain text for reliable string matching (decodes &#39; etc.)
      var respDoc = new DOMParser().parseFromString(resp, "text/html");
      var respText = (respDoc.body ? respDoc.body.textContent : "").toLowerCase();

      if (
        resp.includes("troupes sont en marche") ||
        /troops[\s\S]*walking/i.test(resp)
      )
        isSuccess = true;
      else if (
        rLow.indexOf('class="vert"') > -1 &&
        (rLow.indexOf("troupes") > -1 || rLow.indexOf("troops") > -1)
      )
        isSuccess = true;
      else if (rLow.indexOf("your troops") > -1 && rLow.indexOf("walking") > -1)
        isSuccess = true;
      else if (
        respText.indexOf("vous allez attaquer") > -1 ||
        respText.indexOf("you're going to attack") > -1 ||
        respText.indexOf("you're going to attack") > -1
      )
        isAllianceWarning = true;

      // Handle Alliance Warning (Friendly Fire)
      // The original Caly's code does NOT handle this explicitly — $.post just works.
      // If we get a warning, the game expects the SAME form data re-submitted.
      // The warning page returns the same form; re-submitting is the confirmation.
      if (isAllianceWarning) {
        HMLogger.info(`[Attack] Friendly fire warning on ally. Re-submitting as confirmation...`);

        // Extract fresh token from warning page
        var warningToken = respDoc.querySelector("input[name='t']");
        if (warningToken) {
          dataSend["t"] = warningToken.value;
        }

        // Re-POST the same payload — this IS the confirmation in the game's logic
        var confirmBody = new URLSearchParams(dataSend).toString();
        var confirmResp = await fetch(actionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          credentials: "include",
          body: confirmBody
        });
        resp = await confirmResp.text();

        // Re-evaluate success on the new response
        rLow = resp.toLowerCase();
        if (resp.includes("troupes sont en marche") || /troops[\s\S]*walking/i.test(resp)) isSuccess = true;
        else if (rLow.indexOf('class="vert"') > -1 && (rLow.indexOf("troupes") > -1 || rLow.indexOf("troops") > -1)) isSuccess = true;
        else if (rLow.indexOf("your troops") > -1 && rLow.indexOf("walking") > -1) isSuccess = true;

        // Update token for next wave
        var nextToken2 = resp.match(/name="t" id="t" value="([^"]*)"/);
        if (nextToken2) {
          var tInput = document.querySelector("#formulaireChoixArmee input[name='t'][id='t']");
          if (tInput) tInput.value = nextToken2[1];
        }

        if (!isSuccess) {
          var postDoc = new DOMParser().parseFromString(resp, "text/html");
          var postText = (postDoc.body ? postDoc.body.textContent : "").trim().substring(0, 300);
          HMLogger.warn(`[Attack] Confirmation re-POST failed. Server response: ${postText}`);
        }
      }

      if (isSuccess) {
        if (statusEl) {
          statusEl.innerHTML = `DONE ${destLabel}`;
          statusEl.style.color = "#33ff00";
        }
        HMLogger.info(`[Attack] Wave ${idx} SUCCESS → ${destLabel} (lieu=${actualLieu})`);

        // Chain Next
        var nextIdx = -1;
        for (let k = idx + 1; k < HMState.Floods.length; k++) {
          if (HMState.Floods[k].launch) {
            nextIdx = k;
            break;
          }
        }

        if (nextIdx > -1) {
          await Utils.humanDelay(1500, 2500);
          await self.launchSequence(nextIdx);
        } else {
          // All waves done — show completion toast + modal
          var totalLaunched = HMState.Floods.filter(f => f.launch).length;
          var targetName = HMState.Target?.name || "target";
          HMLogger.info(`[Attack] All ${totalLaunched} waves complete!`);
          HMToast.success(`✅ FLOOD COMPLETE — ${totalLaunched} wave${totalLaunched > 1 ? "s" : ""} sent to ${destLabel}`);

          // Prominent completion modal
          HMUI.alert(
            "✅ Flood Sequence Complete",
            `<div style="text-align:center; line-height:2;">` +
            `<span style="font-size:2em;">${actualLieu === "1" ? "🌿" : "🏰"}</span><br>` +
            `<b>${totalLaunched} wave${totalLaunched > 1 ? "s" : ""}</b> sent to <b>${targetName}</b><br>` +
            `Destination: <span style="color:${actualLieu === "1" ? "var(--hm-success)" : "var(--hm-error)"}; font-weight:bold;">${destLabel}</span><br>` +
            `<small style="color:var(--hm-muted);">lieu=${actualLieu} confirmed</small>` +
            `</div>`
          );

          // Check if queue is running and advance to next target
          if (
            typeof FloodQueueManager !== "undefined" &&
            HMState.FloodQueue &&
            HMState.FloodQueue.isRunning
          ) {
            HMLogger.info(
              "[Attack] Queue mode active - advancing to next target",
            );
            await Utils.humanDelay(2000); // 2s delay before navigation
            FloodQueueManager.advanceToNextTarget();
          } else {
            // Normal mode: trigger defense sync IF enabled in settings
            var settings = JSON.parse(
              localStorage.getItem("HM_Settings") || "{}",
            );
            var autoDefense =
              settings.autoDefense !== undefined ? settings.autoDefense : true;

            if (autoDefense && typeof DefenseManager !== "undefined") {
              HMLogger.info("[Attack] Auto-defense triggering (Settings: ON)");
              DefenseManager.sync();
            } else {
              HMLogger.info("[Attack] Auto-defense skipped (Settings: OFF)");
            }
          }
        }
      } else {
        if (statusEl) {
          statusEl.innerHTML = "FAIL";
          statusEl.style.color = "red";
        }

        // PARSE ACTUAL ERROR FROM SERVER
        var doc = new DOMParser().parseFromString(resp, "text/html");
        var center = doc.querySelector("center");
        var reason = "Unknown Server Error";

        if (center) {
          // Filter out scripts/styles
          Array.from(center.querySelectorAll("script, style")).forEach((el) =>
            el.remove(),
          );
          reason = center.textContent.trim().split("\n")[0].substring(0, 150);
        }

        HMLogger.error(`[Attack] Wave ${idx} REJECTED: ${reason}`);
        HMToast.error("Server: " + reason);
      }
    } catch (e) {
      HMLogger.error("Attack Network Error: " + e);
      if (statusEl) statusEl.innerHTML = "ERR";
    }
  },
};
