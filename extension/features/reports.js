// ====================================================================================================
// HiveMind - Combat Report Parser
// ====================================================================================================
// Parses battle reports on rapport.php and provides:
// 1. A parsed summary panel with attacker/defender data
// 2. Profitability calculation (troop cost analysis)
// 3. Copy to BBCode button for forum posts
// 4. Copy to JSON button for intel sharing

var ReportManager = {

  // Unit display names and their food costs (per unit)
  // Index matches the game's unit ordering
  UNIT_NAMES: [
    "Jeune Soldate Naine", "Soldate Naine", "Soldate Naine d'Élite",
    "Jeune Soldate", "Soldate", "Concierge", "Concierge d'Élite",
    "Artilleuse", "Artilleuse d'Élite", "Soldate d'Élite",
    "Tank", "Tank d'Élite", "Tueuse", "Tueuse d'Élite"
  ],

  UNIT_NAMES_EN: [
    "Young Dwarves", "Dwarves", "Top Dwarves",
    "Young Soldiers", "Soldiers", "Doorkeepers", "Top Doorkeepers",
    "Fire Ants", "Top Fire Ants", "Top Soldiers",
    "Tanks", "Top Tanks", "Killers", "Top Killers"
  ],

  UNIT_SHORT: ["YD", "D", "TD", "YS", "S", "DK", "TDK", "FA", "TFA", "TS", "T", "TT", "K", "TK"],

  // Approximate food cost per unit (for profitability calc)
  // These are base costs — actual varies by tech level
  UNIT_COSTS: [2, 4, 8, 6, 12, 20, 40, 30, 60, 24, 80, 160, 50, 100],

  init: function () {
    var path = window.location.pathname.toLowerCase();
    if (!path.includes("rapport.php") && !path.includes("report.php")) return;

    HMLogger.info("[Reports] Combat report page detected");
    this.parseReport();
  },

  // ────────────────────────────────────────────────────────────────────
  // MAIN PARSER
  // Scans the report page and extracts combat data from tables
  // ────────────────────────────────────────────────────────────────────
  parseReport: function () {
    var centre = document.getElementById("centre");
    if (!centre) {
      HMLogger.warn("[Reports] No #centre element found");
      return;
    }

    var data = {
      attacker: { name: "", troops: {}, losses: {}, surviving: {} },
      defender: { name: "", troops: {}, losses: {}, surviving: {} },
      hfStolen: 0,
      outcome: "",
      timestamp: "",
      raw: centre.textContent || ""
    };

    // ── Extract player names ──
    // Reports typically have: "ATTAQUANT : PlayerName" and "DÉFENSEUR : PlayerName"
    // or the names appear in table headers
    var allText = centre.textContent || "";

    var attackerMatch = allText.match(/(?:ATTAQUANT|Attacker|Attaquant)\s*:?\s*([^\n\r]+)/i);
    var defenderMatch = allText.match(/(?:D[ÉE]FENSEUR|Defender|Défenseur)\s*:?\s*([^\n\r]+)/i);

    if (attackerMatch) data.attacker.name = attackerMatch[1].trim();
    if (defenderMatch) data.defender.name = defenderMatch[1].trim();

    // ── Extract HF/TdC changes ──
    var hfMatch = allText.match(/(?:terrain de chasse|hunting field|tdc)[^\d]*?(\d[\d\s]*)/i);
    if (hfMatch) data.hfStolen = parseInt(hfMatch[1].replace(/\s/g, ""), 10);

    // ── Extract outcome ──
    if (allText.match(/victoire|victory|gagn/i)) data.outcome = "VICTORY";
    else if (allText.match(/d[ée]faite|defeat|perdu/i)) data.outcome = "DEFEAT";
    else if (allText.match(/nul|draw|match nul/i)) data.outcome = "DRAW";
    else data.outcome = "UNKNOWN";

    // ── Parse troop tables ──
    // The game uses tables with class "tableau_rapport" or standard tables
    // within #centre that contain troop type names and numbers
    var tables = centre.querySelectorAll("table");
    this.parseTroopTables(tables, data);

    // ── Extract damage data and calculate tech levels ──
    this.extractDamageData(allText, data);
    data.techLevels = this.calculateTechLevels(data);

    // ── Calculate profitability ──
    data.attackerLossCost = this.calculateCost(data.attacker.losses);
    data.defenderLossCost = this.calculateCost(data.defender.losses);
    data.profitability = data.defenderLossCost - data.attackerLossCost;

    // ── Store parsed data ──
    this.reportData = data;

    // ── Inject HiveMind panel ──
    this.injectPanel(data);

    // ── Auto-submit intel to Worker for enemy strength tracking ──
    if (typeof NetworkManager !== "undefined" && NetworkManager.isConnected) {
        NetworkManager.submitIntelReport({
            attacker: { name: data.attacker.name, troops: data.attacker.troops, losses: data.attacker.losses },
            defender: { name: data.defender.name, troops: data.defender.troops, losses: data.defender.losses },
            hfStolen: data.hfStolen,
            outcome: data.outcome,
            techLevels: data.techLevels
        });
    }

    HMLogger.info("[Reports] Report parsed: " + data.attacker.name + " vs " + data.defender.name + " → " + data.outcome);
  },

  // ────────────────────────────────────────────────────────────────────
  // TROOP TABLE PARSER
  // Scans all tables on the page looking for unit names and quantities
  // ────────────────────────────────────────────────────────────────────
  parseTroopTables: function (tables, data) {
    var self = this;

    tables.forEach(function (table) {
      var rows = table.querySelectorAll("tr");
      var isAttackerTable = false;
      var isDefenderTable = false;

      // Determine if this is an attacker or defender table
      var headerText = (table.textContent || "").toLowerCase();
      if (headerText.match(/attaqu/i)) isAttackerTable = true;
      else if (headerText.match(/d[ée]fens/i)) isDefenderTable = true;

      rows.forEach(function (row) {
        var cells = row.querySelectorAll("td, th");
        if (cells.length < 2) return;

        var label = (cells[0].textContent || "").trim();
        var unitIdx = self.findUnitIndex(label);
        if (unitIdx === -1) return;

        // Parse numbers from remaining cells
        // Typically: | Unit Name | Sent | Surviving | Lost |
        var numbers = [];
        for (var c = 1; c < cells.length; c++) {
          var numText = cells[c].textContent.replace(/\s/g, "").replace(/[^\d-]/g, "");
          if (numText) numbers.push(parseInt(numText, 10) || 0);
        }

        var target = isDefenderTable ? data.defender : data.attacker;

        if (numbers.length >= 3) {
          // Sent, Surviving, Lost
          target.troops[unitIdx] = numbers[0];
          target.surviving[unitIdx] = numbers[1];
          target.losses[unitIdx] = numbers[2];
        } else if (numbers.length >= 2) {
          // Sent, Lost (or Sent, Surviving)
          target.troops[unitIdx] = numbers[0];
          target.losses[unitIdx] = numbers[1];
        } else if (numbers.length >= 1) {
          target.troops[unitIdx] = numbers[0];
        }
      });
    });
  },

  // ────────────────────────────────────────────────────────────────────
  // UNIT NAME MATCHER
  // Fuzzy matches unit names from the report against known unit names
  // ────────────────────────────────────────────────────────────────────
  findUnitIndex: function (label) {
    if (!label) return -1;
    var lower = label.toLowerCase().trim();

    // Try exact match first
    for (var i = 0; i < this.UNIT_NAMES.length; i++) {
      if (lower === this.UNIT_NAMES[i].toLowerCase()) return i;
    }

    // Try partial match (start of name)
    for (var j = 0; j < this.UNIT_NAMES.length; j++) {
      if (lower.startsWith(this.UNIT_NAMES[j].toLowerCase().substring(0, 6))) return j;
    }

    // Try keyword match for common abbreviations/alternate names
    var keywords = {
      "jeune soldate naine": 0, "jsn": 0, "young dwarf": 0,
      "soldate naine d": 2, "naine d'élite": 2, "top dwarf": 2,
      "soldate naine": 1, "naine": 1, "dwarf": 1,
      "jeune soldate": 3, "js": 3, "young soldier": 3,
      "soldate d'élite": 9, "soldate d'elite": 9, "top soldier": 9,
      "soldate": 4, "soldier": 4,
      "concierge d": 6, "concierge d'élite": 6, "top doorkeeper": 6,
      "concierge": 5, "doorkeeper": 5,
      "artilleuse d": 8, "artilleuse d'élite": 8, "top fire ant": 8,
      "artilleuse": 7, "fire ant": 7,
      "tank d": 11, "tank d'élite": 11, "top tank": 11,
      "tank": 10,
      "tueuse d": 13, "tueuse d'élite": 13, "top killer": 13,
      "tueuse": 12, "killer": 12,
    };

    // Sort keys by length descending to match longer strings first
    var sortedKeys = Object.keys(keywords).sort(function (a, b) { return b.length - a.length; });
    for (var k = 0; k < sortedKeys.length; k++) {
      if (lower.includes(sortedKeys[k])) return keywords[sortedKeys[k]];
    }

    return -1;
  },

  // ────────────────────────────────────────────────────────────────────
  // DAMAGE DATA EXTRACTION
  // Parses "inflicts X (+Y) damage and kills Z" lines from report text
  // ────────────────────────────────────────────────────────────────────
  extractDamageData: function(allText, data) {
    // Initialize damage data
    data.attacker.damage = { base: 0, bonus: 0, total: 0, kills: 0 };
    data.defender.damage = { base: 0, bonus: 0, total: 0, kills: 0 };

    // Pattern: "You inflict/deal X (+Y) damage and kill Z enemies"
    // French: "Vous infligez X (+Y) dégâts et tuez Z ennemis"
    var youDealMatch = allText.match(
      /(?:you (?:inflict|deal)|vous infligez)\s*([\d\s,.']+)\s*\(\+([\d\s,.']+)\)\s*(?:damage|d[ée]g[aâ]ts)\s*(?:and|et)\s*(?:kill|tuez)\s*([\d\s,.']+)/i
    );
    
    // Pattern: "The enemy inflicts/deals X (+Y) damage ... and kills Z"
    // French: "L'ennemi inflige X (+Y) dégâts ... et tue Z"
    var enemyDealsMatch = allText.match(
      /(?:(?:the )?enemy (?:inflicts|deals)|l['']ennemi inflige)\s*([\d\s,.']+)\s*\(\+([\d\s,.']+)\)\s*(?:damage|d[ée]g[aâ]ts)[\s\S]*?(?:kills?|tue)\s*([\d\s,.']+)/i
    );

    var parseNum = function(str) {
      return parseInt(str.replace(/[\s,.']/g, ""), 10) || 0;
    };

    // "You deal" = attacker's damage output → tells us about attacker's Weapons
    // But more importantly, the kills tell us about DEFENDER's HP (Shield/Nest)
    if (youDealMatch) {
      data.attacker.damage = {
        base: parseNum(youDealMatch[1]),
        bonus: parseNum(youDealMatch[2]),
        total: parseNum(youDealMatch[1]) + parseNum(youDealMatch[2]),
        kills: parseNum(youDealMatch[3])
      };
    }

    // "Enemy deals" = defender's damage output → tells us about DEFENDER's Weapons
    if (enemyDealsMatch) {
      data.defender.damage = {
        base: parseNum(enemyDealsMatch[1]),
        bonus: parseNum(enemyDealsMatch[2]),
        total: parseNum(enemyDealsMatch[1]) + parseNum(enemyDealsMatch[2]),
        kills: parseNum(enemyDealsMatch[3])
      };
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // TECH LEVEL CALCULATOR (ManyFeathers' Method)
  // Reverse-engineers Weapons, Shield, Nest, Dome from damage data
  // ────────────────────────────────────────────────────────────────────
  
  // Base HP for each unit type (index matches UNIT_NAMES)
  UNIT_BASE_HP: [4, 8, 16, 6, 12, 20, 40, 30, 60, 24, 80, 160, 50, 100],

  calculateTechLevels: function(data) {
    var result = {
      defender: { weapons: null, shield: null, nest: null, dome: null, confidence: "none" },
      attacker: { weapons: null, shield: null, nest: null, dome: null, confidence: "none" }
    };

    // Calculate DEFENDER's tech levels
    // Defender's Weapons: from "enemy inflicts X (+Y)" line
    if (data.defender.damage && data.defender.damage.base > 0 && data.defender.damage.bonus > 0) {
      var defWeapons = Math.round((data.defender.damage.bonus / data.defender.damage.base) * 10);
      result.defender.weapons = defWeapons;
      result.defender.confidence = "estimated";
      HMLogger.info("[Reports] Defender Weapons level estimated: " + defWeapons);
    }

    // Defender's Shield/Nest: from "you inflict X (+Y) and kill Z"
    // We need: total damage dealt TO defender, kills, and which unit type was killed
    if (data.attacker.damage && data.attacker.damage.total > 0 && data.attacker.damage.kills >= 15) {
      var defenderTroopResult = this.estimateDefenderHP(data);
      if (defenderTroopResult) {
        var lifeBonus = data.attacker.damage.total / defenderTroopResult.baseHP;
        
        // Assume Shield = Weapons (standard assumption per ManyFeathers)
        var assumedShield = result.defender.weapons || 0;
        var shieldBonus = assumedShield / 10; // 10% per level
        
        // For Nest: lifeBonus = 1 (base) + shield% + 0.3 (base nest) + nestLevel * 0.15
        var nestCalc = (lifeBonus - 1 - shieldBonus - 0.3) / 0.15;
        
        // Check if result is integer (or close to it)
        var nestLevel = Math.round(nestCalc);
        var nestRemainder = nestCalc - Math.floor(nestCalc);
        
        // Handle ManyFeathers' .3333/.6666 rule for Shield adjustment
        if (Math.abs(nestRemainder - 0.333) < 0.05) {
          // Take lower Shield value and recalculate
          assumedShield = assumedShield - 1;
          shieldBonus = assumedShield / 10;
          nestCalc = (lifeBonus - 1 - shieldBonus - 0.3) / 0.15;
          nestLevel = Math.round(nestCalc);
          result.defender.shield = assumedShield;
        } else if (Math.abs(nestRemainder - 0.667) < 0.05) {
          // Take higher Shield value and recalculate
          assumedShield = assumedShield + 1;
          shieldBonus = assumedShield / 10;
          nestCalc = (lifeBonus - 1 - shieldBonus - 0.3) / 0.15;
          nestLevel = Math.round(nestCalc);
          result.defender.shield = assumedShield;
        } else {
          result.defender.shield = assumedShield;
        }
        
        if (nestLevel >= 0 && nestLevel <= 50) {
          result.defender.nest = nestLevel;
          result.defender.confidence = "calculated";
          HMLogger.info("[Reports] Defender Shield: " + result.defender.shield + ", Nest: " + nestLevel + " (life bonus: " + lifeBonus.toFixed(3) + ")");
        }
      }
    }

    // Calculate ATTACKER's Weapons: from "you inflict X (+Y)" line
    if (data.attacker.damage && data.attacker.damage.base > 0 && data.attacker.damage.bonus > 0) {
      var atkWeapons = Math.round((data.attacker.damage.bonus / data.attacker.damage.base) * 10);
      result.attacker.weapons = atkWeapons;
      result.attacker.confidence = "estimated";
    }

    return result;
  },

  /**
   * Determines the dominant defender unit type and calculates base HP.
   * For accurate calculation, ideally only one type of unit is killed.
   */
  estimateDefenderHP: function(data) {
    var defTroops = data.defender.troops;
    var kills = data.attacker.damage.kills;
    
    if (!defTroops || Object.keys(defTroops).length === 0 || kills < 15) return null;

    // Find dominant unit type (largest count among defender troops)
    var dominantIdx = -1;
    var dominantCount = 0;
    for (var idx in defTroops) {
      if (defTroops[idx] > dominantCount) {
        dominantCount = defTroops[idx];
        dominantIdx = parseInt(idx, 10);
      }
    }

    if (dominantIdx === -1 || dominantIdx >= this.UNIT_BASE_HP.length) return null;

    var unitBaseHP = this.UNIT_BASE_HP[dominantIdx];
    var totalBaseHP = kills * unitBaseHP;

    return {
      unitIdx: dominantIdx,
      unitName: this.UNIT_SHORT[dominantIdx],
      baseHP: totalBaseHP,
      unitBaseHP: unitBaseHP
    };
  },

  // ────────────────────────────────────────────────────────────────────
  // COST CALCULATION
  // ────────────────────────────────────────────────────────────────────
  calculateCost: function (losses) {
    var total = 0;
    for (var idx in losses) {
      var qty = losses[idx] || 0;
      var cost = this.UNIT_COSTS[idx] || 0;
      total += qty * cost;
    }
    return total;
  },

  // ────────────────────────────────────────────────────────────────────
  // UI PANEL INJECTION
  // Injects a themed HiveMind panel into the report page
  // ────────────────────────────────────────────────────────────────────
  injectPanel: function (data) {
    var panel = document.createElement("div");
    panel.id = "HM_ReportPanel";
    panel.style.cssText =
      "background:var(--hm-bg, #a8a8a6); border:3px solid var(--hm-border, #000);" +
      "padding:0; margin:15px 0; font-family:var(--font-mono, monospace); font-size:12px;" +
      "color:var(--hm-text, #000); max-width:600px;";

    // ── Header ──
    var header = document.createElement("div");
    header.style.cssText =
      "background:var(--hm-text, #000); color:var(--hm-bg, #fff);" +
      "padding:12px 16px; font-family:var(--font-display, sans-serif);" +
      "font-size:1.4rem; font-weight:900; text-transform:uppercase; letter-spacing:1px;" +
      "display:flex; justify-content:space-between; align-items:center;";
    header.innerHTML = "🐜 Combat Analysis" +
      "<span style='font-size:0.7rem; font-weight:400; font-family:var(--font-mono);'>" +
      data.outcome + "</span>";
    panel.appendChild(header);

    // ── Body ──
    var body = document.createElement("div");
    body.style.cssText = "padding:16px;";

    // Players
    body.innerHTML +=
      "<div style='display:flex; justify-content:space-between; margin-bottom:12px;'>" +
      "<div><span style='color:var(--hm-muted); font-size:10px; text-transform:uppercase;'>ATTACKER</span>" +
      "<br><b>" + (data.attacker.name || "???") + "</b></div>" +
      "<div style='text-align:right;'><span style='color:var(--hm-muted); font-size:10px; text-transform:uppercase;'>DEFENDER</span>" +
      "<br><b>" + (data.defender.name || "???") + "</b></div></div>";

    // Losses table
    body.innerHTML += this.buildLossTable(data);

    // Profitability
    var profColor = data.profitability >= 0 ? "var(--hm-success, #2d5a27)" : "var(--hm-error, #8b2020)";
    var profSign = data.profitability >= 0 ? "+" : "";
    body.innerHTML +=
      "<div style='margin-top:12px; padding:8px; border:1px dashed var(--hm-border);'>" +
      "<span style='color:var(--hm-muted); font-size:10px; text-transform:uppercase;'>PROFITABILITY</span>" +
      "<br><span style='font-size:1.3rem; font-weight:900; color:" + profColor + ";'>" +
      profSign + this.formatNum(data.profitability) + " food</span>" +
      (data.hfStolen > 0 ? " &nbsp;·&nbsp; <b>" + this.formatNum(data.hfStolen) + " HF</b> stolen" : "") +
      "</div>";

    panel.appendChild(body);

    // ── Footer (buttons) ──
    var footer = document.createElement("div");
    footer.style.cssText =
      "display:flex; gap:8px; padding:12px 16px; border-top:1px dashed var(--hm-border);";

    var btnBBCode = document.createElement("button");
    btnBBCode.textContent = "📋 COPY BBCODE";
    btnBBCode.className = "hm-btn";
    btnBBCode.style.cssText = "flex:1; padding:8px; font-weight:700;";
    btnBBCode.addEventListener("click", function () {
      ReportManager.copyBBCode(data);
    });

    var btnJSON = document.createElement("button");
    btnJSON.textContent = "{ } COPY JSON";
    btnJSON.className = "hm-btn";
    btnJSON.style.cssText = "flex:1; padding:8px; font-weight:700;";
    btnJSON.addEventListener("click", function () {
      ReportManager.copyJSON(data);
    });

    footer.appendChild(btnBBCode);
    footer.appendChild(btnJSON);
    panel.appendChild(footer);

    // Insert into page
    var centre = document.getElementById("centre");
    if (centre) {
      centre.insertBefore(panel, centre.firstChild);
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // LOSS TABLE BUILDER
  // ────────────────────────────────────────────────────────────────────
  buildLossTable: function (data) {
    var html = "<table style='width:100%; border-collapse:collapse; font-size:11px; margin-top:8px;'>";
    html += "<tr style='border-bottom:2px solid var(--hm-border);'>" +
      "<th style='text-align:left; padding:4px; font-size:10px; text-transform:uppercase;'>Unit</th>" +
      "<th style='text-align:right; padding:4px; font-size:10px;'>ATK Sent</th>" +
      "<th style='text-align:right; padding:4px; font-size:10px;'>ATK Lost</th>" +
      "<th style='text-align:right; padding:4px; font-size:10px;'>DEF Sent</th>" +
      "<th style='text-align:right; padding:4px; font-size:10px;'>DEF Lost</th></tr>";

    var hasData = false;
    for (var i = 0; i < this.UNIT_SHORT.length; i++) {
      var atkSent = data.attacker.troops[i] || 0;
      var atkLost = data.attacker.losses[i] || 0;
      var defSent = data.defender.troops[i] || 0;
      var defLost = data.defender.losses[i] || 0;

      if (atkSent === 0 && defSent === 0) continue;
      hasData = true;

      var lostStyle = "color:var(--hm-error);font-weight:700;";
      html += "<tr style='border-bottom:1px dotted var(--hm-border);'>" +
        "<td style='padding:4px;'><b>" + this.UNIT_SHORT[i] + "</b> <span style='color:var(--hm-muted); font-size:10px;'>" + this.UNIT_NAMES_EN[i] + "</span></td>" +
        "<td style='text-align:right; padding:4px;'>" + this.formatNum(atkSent) + "</td>" +
        "<td style='text-align:right; padding:4px;" + (atkLost > 0 ? lostStyle : "") + "'>" + (atkLost > 0 ? "-" + this.formatNum(atkLost) : "0") + "</td>" +
        "<td style='text-align:right; padding:4px;'>" + this.formatNum(defSent) + "</td>" +
        "<td style='text-align:right; padding:4px;" + (defLost > 0 ? lostStyle : "") + "'>" + (defLost > 0 ? "-" + this.formatNum(defLost) : "0") + "</td></tr>";
    }

    if (!hasData) {
      html += "<tr><td colspan='5' style='text-align:center; padding:12px; color:var(--hm-muted); font-style:italic;'>" +
        "No troop data parsed — report format may not be recognized</td></tr>";
    }

    // Totals row
    html += "<tr style='border-top:2px solid var(--hm-border); font-weight:700;'>" +
      "<td style='padding:4px;'>TOTAL COST</td>" +
      "<td colspan='2' style='text-align:right; padding:4px;'>" + this.formatNum(data.attackerLossCost) + " food lost</td>" +
      "<td colspan='2' style='text-align:right; padding:4px;'>" + this.formatNum(data.defenderLossCost) + " food lost</td></tr>";

    html += "</table>";
    return html;
  },

  // ────────────────────────────────────────────────────────────────────
  // BBCODE EXPORT
  // ────────────────────────────────────────────────────────────────────
  copyBBCode: function (data) {
    var bb = "[b]⚔ COMBAT REPORT[/b]\n";
    bb += "[b]Attacker:[/b] " + (data.attacker.name || "???") + "\n";
    bb += "[b]Defender:[/b] " + (data.defender.name || "???") + "\n";
    bb += "[b]Outcome:[/b] " + data.outcome + "\n";
    if (data.hfStolen > 0) bb += "[b]HF Stolen:[/b] " + this.formatNum(data.hfStolen) + "\n";
    bb += "\n";

    // Attacker losses
    bb += "[b]Attacker Losses:[/b]\n";
    var atkHasLoss = false;
    for (var i = 0; i < this.UNIT_SHORT.length; i++) {
      if ((data.attacker.losses[i] || 0) > 0) {
        bb += "  " + this.UNIT_SHORT[i] + ": -" + this.formatNum(data.attacker.losses[i]) + "\n";
        atkHasLoss = true;
      }
    }
    if (!atkHasLoss) bb += "  None\n";

    // Defender losses
    bb += "[b]Defender Losses:[/b]\n";
    var defHasLoss = false;
    for (var j = 0; j < this.UNIT_SHORT.length; j++) {
      if ((data.defender.losses[j] || 0) > 0) {
        bb += "  " + this.UNIT_SHORT[j] + ": -" + this.formatNum(data.defender.losses[j]) + "\n";
        defHasLoss = true;
      }
    }
    if (!defHasLoss) bb += "  None\n";

    bb += "\n[b]Profitability:[/b] " + (data.profitability >= 0 ? "+" : "") + this.formatNum(data.profitability) + " food\n";
    bb += "[i]— Generated by HiveMind[/i]";

    navigator.clipboard.writeText(bb).then(function () {
      HMToast.success("BBCode copied to clipboard!");
    }).catch(function () {
      // Fallback
      prompt("Copy this BBCode:", bb);
    });
  },

  // ────────────────────────────────────────────────────────────────────
  // JSON EXPORT
  // ────────────────────────────────────────────────────────────────────
  copyJSON: function (data) {
    var exportData = {
      type: "combat_report",
      timestamp: new Date().toISOString(),
      attacker: data.attacker.name,
      defender: data.defender.name,
      outcome: data.outcome,
      hfStolen: data.hfStolen,
      attackerLosses: {},
      defenderLosses: {},
      profitability: data.profitability
    };

    for (var i = 0; i < this.UNIT_SHORT.length; i++) {
      if ((data.attacker.losses[i] || 0) > 0)
        exportData.attackerLosses[this.UNIT_SHORT[i]] = data.attacker.losses[i];
      if ((data.defender.losses[i] || 0) > 0)
        exportData.defenderLosses[this.UNIT_SHORT[i]] = data.defender.losses[i];
    }

    var json = JSON.stringify(exportData, null, 2);

    navigator.clipboard.writeText(json).then(function () {
      HMToast.success("JSON copied to clipboard!");
    }).catch(function () {
      prompt("Copy this JSON:", json);
    });
  },

  // ────────────────────────────────────────────────────────────────────
  // FORMATTING
  // ────────────────────────────────────────────────────────────────────
  formatNum: function (n) {
    if (typeof n !== "number" || isNaN(n)) return "0";
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
};
