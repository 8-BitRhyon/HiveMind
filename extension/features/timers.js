// ====================================================================================================
// HiveMind - Timer Manager
// ====================================================================================================
// QoL enhancements for construction.php, laboratoire.php, and reine.php pages:
// 1. Completion time injection (exact finish date + live countdown)
// 2. Materials affordability indicator (can afford / deficit)
// 3. Build time comparison (fastest upgrade finder + banner)

var TimerManager = {

  init: function () {
    var path = window.location.pathname.toLowerCase();

    if (path.includes("construction.php")) {
      this.pageType = "construction";
      HMLogger.info("[Timers] Construction page detected");
    } else if (path.includes("laboratoire.php")) {
      this.pageType = "lab";
      HMLogger.info("[Timers] Laboratory page detected");
    } else if (path.includes("reine.php")) {
      this.pageType = "queen";
      HMLogger.info("[Timers] Queen page detected");
    } else {
      return;
    }

    this.injectCompletionTime();
    this.analyzeBuildings();
  },

  // ════════════════════════════════════════════════════════════════════
  // FEATURE: COMPLETION TIME
  // Game shows: "-Incubator 29 completed in: <span id="batiment_xxx">12 days...</span>"
  // with `reste(SECONDS, "batiment_xxx")` countdown script.
  // We parse the seconds and show the exact finish date.
  // ════════════════════════════════════════════════════════════════════
  injectCompletionTime: function () {
    var centre = document.getElementById("centre");
    if (!centre) return;

    // Find the <strong> that contains the active build info
    var strongEls = centre.querySelectorAll("strong");
    var found = false;

    strongEls.forEach(function (el) {
      var text = el.textContent || "";
      // Look for the countdown script pattern: reste(SECONDS, ...)
      // The seconds value is also present in the strong's text
      var match = text.match(/\((\d+)/);
      if (!match) return;

      var seconds = parseInt(match[1], 10);
      if (isNaN(seconds) || seconds <= 0) return;

      found = true;
      var finishTime = new Date(Date.now() + seconds * 1000);

      // Parse building name from text like "-Incubator 29 completed in:"
      var rawText = el.textContent || "";
      var nameMatch = rawText.match(/^[^a-zA-Z]*([A-Za-zÀ-ÿ\s]+?)\s*\d+\s*completed/i);
      var buildName = nameMatch ? nameMatch[1].trim().toUpperCase() : "UPGRADE";
      var lvlMatch = rawText.match(/(\d+)\s*completed/);
      var buildLvl = lvlMatch ? lvlMatch[1] : "";

      // ── Build a structured card widget ──
      var widget = document.createElement("div");
      widget.style.cssText =
        "display:block; margin:12px 0; padding:0; max-width:340px;" +
        "background:var(--hm-bg, #f4ecd8);" +
        "border:2px solid var(--hm-border, #5c4033);" +
        "font-family:var(--font-mono); box-shadow:6px 6px 0 rgba(0,0,0,0.3);";

      // Row 1: Building name
      var labelRow = document.createElement("div");
      labelRow.style.cssText =
        "background:var(--hm-text, #000); color:var(--hm-bg, #fff);" +
        "padding:5px 12px; font-size:9px; font-weight:900;" +
        "text-transform:uppercase; letter-spacing:2px;" +
        "font-family:var(--font-display, sans-serif);";
      labelRow.textContent = "BUILDING: " + buildName + (buildLvl ? " → L" + buildLvl : "");
      widget.appendChild(labelRow);

      // Row 2: Date + Countdown
      var bodyRow = document.createElement("div");
      bodyRow.style.cssText =
        "display:flex; justify-content:space-between; align-items:baseline;" +
        "padding:10px 12px;";

      var dateSpan = document.createElement("span");
      dateSpan.style.cssText =
        "font-size:1.4rem; font-weight:900; color:var(--hm-text, #000);" +
        "font-family:var(--font-display, sans-serif); letter-spacing:-0.5px;";
      dateSpan.textContent = TimerManager.formatFinishTime(finishTime);

      var countSpan = document.createElement("span");
      countSpan.style.cssText =
        "font-size:12px; font-weight:700; color:var(--hm-muted, #888);" +
        "white-space:nowrap;";
      countSpan.textContent = TimerManager.formatCountdown(seconds * 1000);

      bodyRow.appendChild(dateSpan);
      bodyRow.appendChild(countSpan);
      widget.appendChild(bodyRow);

      el.insertAdjacentElement("afterend", widget);

      TimerManager.startLiveCountdown(widget, dateSpan, countSpan, finishTime);
      HMLogger.info("[Timers] " + buildName + " L" + buildLvl + " finishes at " + TimerManager.formatFinishTime(finishTime));
    });

    if (!found) {
      HMLogger.info("[Timers] No active upgrade/research on this page");
    }
  },

  startLiveCountdown: function (widget, dateSpan, countSpan, finishTime) {
    var update = function () {
      var remaining = finishTime.getTime() - Date.now();
      if (remaining <= 0) {
        widget.style.borderColor = "var(--hm-success, #2d5a27)";
        dateSpan.textContent = "✅ COMPLETE";
        dateSpan.style.color = "var(--hm-success, #2d5a27)";
        countSpan.textContent = "Reload page";
        clearInterval(interval);
        return;
      }
      countSpan.textContent = TimerManager.formatCountdown(remaining);
    };

    update();
    var interval = setInterval(update, 1000);
  },

  // ════════════════════════════════════════════════════════════════════
  // BUILDING ANALYSIS
  // Parses each .ligneAmelioration row using precise selectors:
  //   Name:     .desciption_amelioration h2
  //   Level:    .niveau_amelioration
  //   Time:     td.temps
  //   Cost:     td.materiaux
  // ════════════════════════════════════════════════════════════════════
  analyzeBuildings: function () {
    var rows = document.querySelectorAll(".ligneAmelioration");
    if (rows.length === 0) return;

    // Get available materials (not workers — buildings cost materials)
    var matEl = document.getElementById("nb_materiaux");
    var availableMats = 0;
    if (matEl) {
      availableMats = parseInt(matEl.textContent.replace(/\s/g, ""), 10) || 0;
    }

    HMLogger.info("[Timers] Available materials: " + this.formatBigNum(availableMats));

    // Parse each building row
    var buildings = [];
    rows.forEach(function (row, idx) {
      var info = TimerManager.parseBuildingRow(row, idx);
      if (info) buildings.push(info);
    });

    if (buildings.length === 0) return;

    // Inject affordability indicators
    if (availableMats > 0) {
      this.injectAffordability(buildings, availableMats);
    }

    // Find and highlight fastest upgrade
    this.injectFastestBanner(buildings);
  },

  // ── Parse a single .ligneAmelioration row ──
  parseBuildingRow: function (row, idx) {
    // Name: from <h2> inside .desciption_amelioration
    var descCell = row.querySelector(".desciption_amelioration");
    var h2 = descCell ? descCell.querySelector("h2") : null;
    var name = h2 ? h2.textContent.trim() : "Building " + (idx + 1);

    // Level: from .niveau_amelioration — e.g. "level 29" or "level 28 -> 29"
    var levelEl = row.querySelector(".niveau_amelioration");
    var level = 0;
    if (levelEl) {
      var nums = levelEl.textContent.match(/\d+/g);
      // Take the LAST number (target level)
      if (nums && nums.length > 0) level = parseInt(nums[nums.length - 1], 10);
    }

    // Cost: from td.materiaux — e.g. "5 037 587 853"
    var matCell = row.querySelector("td.materiaux");
    var cost = 0;
    if (matCell) {
      cost = parseInt(matCell.textContent.replace(/\s/g, ""), 10) || 0;
    }

    // Duration: from td.temps — e.g. "14D 2H 46m 32s" or "58m 55s" or "21D 26s"
    var timeCell = row.querySelector("td.temps");
    var duration = 0;
    var durationStr = "";
    if (timeCell) {
      durationStr = timeCell.textContent.trim();
      duration = this.parseTimeString(durationStr);
    }

    // Requirements: check for .verificationNonOK links (unmet prerequisites)
    var unmetReqs = [];
    var reqLinks = row.querySelectorAll(".verificationNonOK");
    reqLinks.forEach(function (link) {
      unmetReqs.push(link.textContent.trim());
    });
    var isLocked = unmetReqs.length > 0;

    return {
      name: name,
      level: level,
      cost: cost,
      duration: duration,
      durationStr: durationStr,
      row: row,
      costCell: row.querySelector(".cout_amelioration"),
      isLocked: isLocked,
      unmetReqs: unmetReqs,
      idx: idx
    };
  },

  // Parse flexible time strings: "14D 2H 46m 32s", "21D 26s", "58m 55s", "2D 10H 37s"
  parseTimeString: function (str) {
    var total = 0;
    var d = str.match(/(\d+)\s*[Dd]/);
    var h = str.match(/(\d+)\s*[Hh]/);
    var m = str.match(/(\d+)\s*m(?:in)?/);
    var s = str.match(/(\d+)\s*s/);

    if (d) total += parseInt(d[1], 10) * 86400;
    if (h) total += parseInt(h[1], 10) * 3600;
    if (m) total += parseInt(m[1], 10) * 60;
    if (s) total += parseInt(s[1], 10);
    return total;
  },

  // ════════════════════════════════════════════════════════════════════
  // FEATURE 1: MATERIALS AFFORDABILITY INDICATOR
  // Compares each building's material cost against available materials.
  // Shows ✓/⚠/✗ badges with human-readable deficit amounts.
  // ════════════════════════════════════════════════════════════════════
  injectAffordability: function (buildings, available) {
    buildings.forEach(function (b) {
      if (!b.costCell) return;

      var badge = document.createElement("div");
      badge.style.cssText =
        "font-family:var(--font-mono); font-size:11px; font-weight:700;" +
        "margin-top:4px; padding:2px 6px; display:inline-block;";

      if (b.isLocked) {
        // Requirements not met — show lock with reason
        badge.textContent = "🔒 REQUIRES: " + b.unmetReqs[0];
        badge.style.color = "var(--hm-error, #8b2020)";
        badge.style.borderLeft = "3px solid var(--hm-error, #8b2020)";
        badge.style.paddingLeft = "6px";
        badge.style.opacity = "0.8";
      } else if (b.cost <= 0) {
        return; // no cost info, skip
      } else if (available >= b.cost) {
        // Can afford + requirements met
        badge.textContent = "✓ CAN BUILD";
        badge.style.color = "var(--hm-success, #2d5a27)";
        badge.style.borderLeft = "3px solid var(--hm-success, #2d5a27)";
        badge.style.paddingLeft = "6px";
      } else {
        // Can't afford — show deficit
        var deficit = b.cost - available;
        var pct = Math.floor((available / b.cost) * 100);
        badge.textContent = "✗ Need " + TimerManager.formatBigNum(deficit) + " mats (" + pct + "% ready)";
        badge.style.color = pct >= 50 ? "#b57d00" : "var(--hm-error, #8b2020)";
        badge.style.borderLeft = "3px solid " + (pct >= 50 ? "#b57d00" : "var(--hm-error, #8b2020)");
        badge.style.paddingLeft = "6px";
      }

      b.costCell.appendChild(badge);
    });
  },

  // ════════════════════════════════════════════════════════════════════
  // FEATURE 3: BUILD TIME COMPARISON (Fastest Upgrade Finder)
  // Banner at top showing fastest & slowest, green border on fastest row.
  // ════════════════════════════════════════════════════════════════════
  injectFastestBanner: function (buildings) {
    // Only include buildings that aren't locked behind unmet requirements
    var upgradeable = buildings.filter(function (b) { return b.duration > 0 && !b.isLocked; });
    if (upgradeable.length === 0) return;

    upgradeable.sort(function (a, b) { return a.duration - b.duration; });

    var fastest = upgradeable[0];
    var slowest = upgradeable[upgradeable.length - 1];

    // Create banner
    var banner = document.createElement("div");
    banner.style.cssText =
      "padding:10px 16px; margin-bottom:8px;" +
      "background:var(--hm-bg, #f4ecd8); color:var(--hm-text, #5c4033);" +
      "border:2px solid var(--hm-border, #5c4033);" +
      "font-family:var(--font-mono); font-size:12px;" +
      "display:flex; justify-content:space-between; align-items:center;";

    var leftDiv = document.createElement("div");
    leftDiv.innerHTML =
      "<span style='font-family:var(--font-display); font-weight:900; text-transform:uppercase; font-size:11px; letter-spacing:1px; color:var(--hm-muted);'>⚡ FASTEST UPGRADE</span><br>" +
      "<b>" + fastest.name + "</b> → L" + fastest.level +
      " <span style='color:var(--hm-success, #2d5a27); font-weight:700;'>(" + fastest.durationStr + ")</span>";

    var rightDiv = document.createElement("div");
    rightDiv.style.textAlign = "right";
    rightDiv.innerHTML =
      "<span style='font-family:var(--font-display); font-weight:900; text-transform:uppercase; font-size:11px; letter-spacing:1px; color:var(--hm-muted);'>🐢 SLOWEST</span><br>" +
      "<b>" + slowest.name + "</b> → L" + slowest.level +
      " <span style='color:var(--hm-error, #8b2020);'>(" + slowest.durationStr + ")</span>";

    banner.appendChild(leftDiv);
    banner.appendChild(rightDiv);

    // Insert before the building table
    var firstRow = buildings[0].row;
    var table = firstRow ? firstRow.closest("table") : null;
    if (table && table.parentNode) {
      table.parentNode.insertBefore(banner, table);
    }

    // Highlight fastest row
    fastest.row.style.borderLeft = "4px solid var(--hm-success, #2d5a27)";
    fastest.row.style.paddingLeft = "8px";

    HMLogger.info("[Timers] ⚡ Fastest: " + fastest.name + " (" + fastest.durationStr + ")");
    HMLogger.info("[Timers] 🐢 Slowest: " + slowest.name + " (" + slowest.durationStr + ")");
  },

  // ════════════════════════════════════════════════════════════════════
  // FORMATTING UTILITIES
  // ════════════════════════════════════════════════════════════════════
  formatCountdown: function (ms) {
    var totalSec = Math.floor(ms / 1000);
    var d = Math.floor(totalSec / 86400);
    var h = Math.floor((totalSec % 86400) / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;

    var parts = [];
    if (d > 0) parts.push(d + "d");
    if (h > 0 || d > 0) parts.push(h + "h");
    parts.push((m < 10 ? "0" : "") + m + "m");
    parts.push((s < 10 ? "0" : "") + s + "s");
    return parts.join(" ");
  },

  formatFinishTime: function (date) {
    var h = date.getHours();
    var m = date.getMinutes();
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var timeStr = (h < 10 ? "0" : "") + h + "h" + (m < 10 ? "0" : "") + m;
    return date.getDate() + " " + months[date.getMonth()] + " " + timeStr;
  },

  // Format large numbers: 420B, 5.04B, 81.9M, etc.
  formatBigNum: function (n) {
    if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
    return n.toString();
  }
};
