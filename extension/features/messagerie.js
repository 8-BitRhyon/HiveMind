// ====================================================================================================
// HiveMind - Messagerie Parser
// ====================================================================================================
// Parses the in-game message inbox (messagerie.php) for combat intelligence.
//
// The messagerie has two layers of data:
//   1. MESSAGE LIST — visible subjects in `a.intitule_message` contain:
//      "Robbed by X : 20 743 352 cm?", "Loot from X : 19 760 610 cm?",
//      "Invasion from X", "Onslaught on X", "Attack on X cancelled"
//
//   2. CONVERSATION BODIES — loaded dynamically via AJAX when user clicks a row.
//      These contain detailed combat reports with troop counts and damage lines.
//      We detect these with a MutationObserver on #liste_conversations.
//
// Architecture: Messages are in #table_liste_conversations as <tr class="en_tete_message">
// rows with data-type="Combats"|"Chasses"|etc. Clicking a row triggers an AJAX POST
// that injects .contenu_conversation rows after the header row.
// ====================================================================================================

var MessagerieParser = {

    // ── Unit data for tech level calculation ──
    UNIT_BASE_HP: [4, 8, 16, 6, 12, 20, 40, 30, 60, 24, 80, 160, 50, 100],

    // Track what we've already parsed to avoid duplicates
    _parsedSubjects: new Set(),
    _parsedConversations: new Set(),
    _pendingSubjectIntel: null, // Queued intel awaiting auth
    _retryCount: 0,
    _maxRetries: 5,

    init: function () {
        HMLogger.info("[Messagerie] Inbox detected — scanning for intel");

        // Load parsed history from sessionStorage to prevent spamming on page reload
        try {
            var cachedSubjects = sessionStorage.getItem("HM_ParsedSubjects");
            var cachedConvs = sessionStorage.getItem("HM_ParsedConversations");
            if (cachedSubjects) this._parsedSubjects = new Set(JSON.parse(cachedSubjects));
            if (cachedConvs) this._parsedConversations = new Set(JSON.parse(cachedConvs));
        } catch(e) {}

        // Phase 1: Parse all visible message subjects
        this.parseMessageSubjects();

        // Phase 2: Watch for conversation bodies loaded via AJAX
        this.observeConversationOpens();
    },

    // ════════════════════════════════════════════════════════════════════
    // PHASE 1: MESSAGE SUBJECT PARSING
    // Scans all visible tr.en_tete_message rows for intel in the subject line
    // ════════════════════════════════════════════════════════════════════
    parseMessageSubjects: function () {
        var rows = document.querySelectorAll("tr.en_tete_message");
        var results = { robberies: [], loots: [], conquests: [], invasions: [], onslaughts: [] };

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var subjectEl = row.querySelector("a.intitule_message");
            if (!subjectEl) continue;

            var subject = subjectEl.textContent.trim();
            var convId = row.id; // e.g., "conversation_28389791"

            // Skip if already parsed this session
            if (this._parsedSubjects.has(convId)) continue;
            
            this._parsedSubjects.add(convId);
            try { sessionStorage.setItem("HM_ParsedSubjects", JSON.stringify(Array.from(this._parsedSubjects).slice(-200))); } catch(e) {}

            // Only parse system messages (from Antzzz)
            var participantEl = row.querySelector(".td_participants a");
            var participant = participantEl ? participantEl.textContent.trim() : "";

            // ── Robbery: "Robbed by X : 20 743 352 cm?" ──
            var robberyMatch = subject.match(/(?:robbed by|pill[ée] par)\s+(.+?)\s*:\s*([\d\s,.]+)\s*cm/i);
            if (robberyMatch) {
                results.robberies.push({
                    attacker: robberyMatch[1].trim(),
                    hfStolen: this.parseNum(robberyMatch[2]),
                    convId: convId
                });
                continue;
            }

            // ── Loot: "Loot from X : 19 760 610 cm?" ──
            var lootMatch = subject.match(/(?:loot from|butin de)\s+(.+?)\s*:\s*([\d\s,.]+)\s*cm/i);
            if (lootMatch) {
                results.loots.push({
                    target: lootMatch[1].trim(),
                    hfGained: this.parseNum(lootMatch[2]),
                    convId: convId
                });
                continue;
            }

            // ── Onslaught/Conquest: "Onslaught on X : your troops have conquered the Hunting Field" ──
            var onslaughtMatch = subject.match(/(?:onslaught on|assaut sur)\s+(.+?)\s*:\s*(.+)/i);
            if (onslaughtMatch) {
                var outcome = "UNKNOWN";
                if (onslaughtMatch[2].match(/(?:conquered|conquis|victory|victoire)/i)) outcome = "VICTORY";
                else if (onslaughtMatch[2].match(/(?:failed|[ée]chou[ée]|defeat|défaite|retreated)/i)) outcome = "DEFEAT";
                
                results.onslaughts.push({
                    target: onslaughtMatch[1].trim(),
                    outcome: outcome,
                    convId: convId
                });
                continue;
            }

            // ── Invasion: "Invasion from X : your troops have lost the Hunting Field" ──
            var invasionMatch = subject.match(/(?:invasion from|invasion de)\s+(.+?)\s*:\s*(.+)/i);
            if (invasionMatch) {
                var outcome = "UNKNOWN";
                if (invasionMatch[2].match(/(?:lost|perdu|defeat|défaite)/i)) outcome = "DEFEAT";
                else if (invasionMatch[2].match(/(?:repelled|repouss[ée]|victory|victoire)/i)) outcome = "VICTORY";

                results.invasions.push({
                    attacker: invasionMatch[1].trim(),
                    outcome: outcome,
                    convId: convId
                });
                continue;
            }
        }

        // Submit what we found
        this.submitSubjectIntel(results);

        var total = results.robberies.length + results.loots.length +
            results.conquests.length + results.invasions.length + results.onslaughts.length;
        if (total > 0) {
            HMLogger.info("[Messagerie] Subjects parsed: " +
                results.robberies.length + " robberies, " +
                results.loots.length + " loots, " +
                results.onslaughts.length + " onslaughts, " +
                results.invasions.length + " invasions");
        }
    },

    // ════════════════════════════════════════════════════════════════════
    // PHASE 2: CONVERSATION BODY OBSERVER
    // Watches for dynamically loaded conversation content (AJAX)
    // When the game calls chargerConversation(), it injects <tr> rows
    // with class "contenu_conversation" after the header row.
    // ════════════════════════════════════════════════════════════════════
    observeConversationOpens: function () {
        var container = document.getElementById("liste_conversations");
        if (!container) return;

        var self = this;
        var observer = new MutationObserver(function (mutations) {
            for (var m = 0; m < mutations.length; m++) {
                var added = mutations[m].addedNodes;
                for (var n = 0; n < added.length; n++) {
                    var node = added[n];
                    if (node.nodeType !== 1) continue; // skip text nodes

                    // Look for conversation content rows
                    if (node.classList && node.classList.contains("contenu_conversation")) {
                        self.parseConversationBody(node);
                    }

                    // Also check children — AJAX may inject a wrapper
                    var contentRows = node.querySelectorAll ? node.querySelectorAll(".contenu_conversation") : [];
                    for (var c = 0; c < contentRows.length; c++) {
                        self.parseConversationBody(contentRows[c]);
                    }

                    // Parse any TR that contains combat report text
                    if (node.tagName === "TR" || (node.querySelectorAll && node.querySelectorAll("tr").length)) {
                        var text = node.textContent || "";
                        if (text.match(/(?:attacking\s+troops|troupes?\s+en\s+attaque|enemy\s+inflicts|l['']ennemi\s+inflige)/i)) {
                            self.parseInlineReport(text);
                        }
                    }
                }
            }
        });

        observer.observe(container, { childList: true, subtree: true });
        HMLogger.info("[Messagerie] MutationObserver active — watching for opened conversations");
    },

    // ════════════════════════════════════════════════════════════════════
    // CONVERSATION BODY PARSER
    // Parses the HTML injected when a conversation is opened
    // ════════════════════════════════════════════════════════════════════
    parseConversationBody: function (node) {
        var text = node.textContent || node.innerText || "";
        if (!text.trim()) return;

        // Check for duplicate parsing this session
        var closestTr = node.closest ? node.closest("tr[id]") : null;
        var bodyId = closestTr ? closestTr.id : text.substring(0, 50);
        if (this._parsedConversations.has(bodyId)) return;
        
        this._parsedConversations.add(bodyId);
        try { sessionStorage.setItem("HM_ParsedConversations", JSON.stringify(Array.from(this._parsedConversations).slice(-100))); } catch(e) {}

        this.parseInlineReport(text);
    },

    // ════════════════════════════════════════════════════════════════════
    // INLINE REPORT PARSER
    // Extracts troop counts and damage data from report text
    // ════════════════════════════════════════════════════════════════════
    parseInlineReport: function (text) {
        var report = {
            attacker: null,
            defender: null,
            attackerTroops: {},
            defenderTroops: {},
            damage: { enemyBase: 0, enemyBonus: 0, youBase: 0, youBonus: 0, enemyKills: 0, youKills: 0 },
            techLevels: { weapons: null, shield: null, nest: null },
            hfStolen: 0,
            outcome: "UNKNOWN"
        };

        // ── Who attacked? ──
        // Enemy attacks YOU: "Hemanthekolbold attacks your Hunting Field :"
        var enemyAttackMatch = text.match(/(\S+)\s+attacks?\s+(?:your\s+)?(?:hunting\s*field|nest|anthill)/i);
        if (!enemyAttackMatch) {
            enemyAttackMatch = text.match(/(\S+)\s+attaque\s+(?:votre\s+)?(?:terrain|nid|fourmili)/i);
        }
        
        // YOU attack enemy: "You attack lari Hunting Field" or "Vous attaquez le terrain de chasse de lari"
        var youAttackMatch = text.match(/(?:you\s+attack|vous\s+attaquez)\s+(?:le\s+terrain\s+de\s+chasse\s+de\s+|le\s+nid\s+de\s+|la\s+fourmili[èe]re\s+de\s+)?([^\s:]+)/i);

        if (enemyAttackMatch) {
            report.attacker = enemyAttackMatch[1];
            report.defender = "TQC_SELF";
        } else if (youAttackMatch) {
            report.attacker = "TQC_SELF";
            report.defender = youAttackMatch[1];
            
            // Clean up captured name just in case it matched 'Hunting' or similar (though it shouldn't if names are one word)
            if (report.defender.toLowerCase() === "hunting" || report.defender.toLowerCase() === "terrain") {
                 // Fallback if regex acts weirdly
            }
        }

        // ── Attacking troops ──
        // "Attacking troops :10 685 671 Young dwarves."
        var atkTroopMatch = text.match(/(?:attacking\s+troops?|troupes?\s+(?:en\s+)?attaque)\s*:\s*([^\n.]+)/i);
        if (atkTroopMatch) {
            report.attackerTroops = this.parseTroopString(atkTroopMatch[1]);
        }

        // ── Defending troops ──
        // "Defending troops :1 Young dwarf."
        var defTroopMatch = text.match(/(?:defending\s+troops?|troupes?\s+(?:en\s+)?d[ée]fense)\s*:\s*([^\n.]+)/i);
        if (defTroopMatch) {
            report.defenderTroops = this.parseTroopString(defTroopMatch[1]);
        }

        // ── Enemy damage line ──
        var enemyDmgMatch = text.match(
            /(?:(?:the\s+)?enemy\s+(?:inflicts?|deals?)|l[''\u2019]ennemi\s+inflige)\s*([\d\s,.]+)\s*\(\+([\d\s,.]+)\)\s*(?:damages?|d[ée]g[aâ]ts)[\s\S]*?(?:kills?|tue)\s*([\d\s,.]+)/i
        );
        if (enemyDmgMatch) {
            report.damage.enemyBase = this.parseNum(enemyDmgMatch[1]);
            report.damage.enemyBonus = this.parseNum(enemyDmgMatch[2]);
            report.damage.enemyKills = this.parseNum(enemyDmgMatch[3]);

            // Weapons = bonus / base × 10 (minimum 100 base damage to avoid false positives)
            if (report.damage.enemyBase >= 100) {
                report.techLevels.weapons = Math.round(
                    (report.damage.enemyBonus / report.damage.enemyBase) * 10
                );
                HMLogger.info("[Messagerie] Enemy Weapons: " + report.techLevels.weapons +
                    " (from " + report.damage.enemyBase + " + " + report.damage.enemyBonus + ")");
            }
        }

        // ── "You deal" damage line ──
        var youDmgMatch = text.match(
            /(?:you\s+(?:inflict|deal)|vous\s+infligez)\s*([\d\s,.]+)\s*\(\+([\d\s,.]+)\)\s*(?:damages?|d[ée]g[aâ]ts)[\s\S]*?(?:kills?|tuez)\s*([\d\s,.]+)/i
        );
        if (youDmgMatch) {
            report.damage.youBase = this.parseNum(youDmgMatch[1]);
            report.damage.youBonus = this.parseNum(youDmgMatch[2]);
            report.damage.youKills = this.parseNum(youDmgMatch[3]);

            // Determine whose troops died to your damage
            var enemyTroops = report.attacker === "TQC_SELF" ? report.defenderTroops : report.attackerTroops;

            // Shield/Nest from life bonus if enough kills
            if (report.damage.youKills >= 15 && Object.keys(enemyTroops).length > 0) {
                var totalDmg = report.damage.youBase + report.damage.youBonus;
                var hpResult = this.estimateBaseHP(enemyTroops, report.damage.youKills);
                if (hpResult > 0) {
                    var lifeBonus = totalDmg / hpResult;
                    var assumedShield = report.techLevels.weapons || 0;
                    var shieldPct = assumedShield / 10;
                    var nestCalc = (lifeBonus - 1 - shieldPct - 0.3) / 0.15;
                    var rem = nestCalc - Math.floor(nestCalc);

                    // ManyFeathers' .3333/.6666 adjustment
                    if (Math.abs(rem - 0.333) < 0.05) {
                        assumedShield--;
                        nestCalc = (lifeBonus - 1 - (assumedShield / 10) - 0.3) / 0.15;
                    } else if (Math.abs(rem - 0.667) < 0.05) {
                        assumedShield++;
                        nestCalc = (lifeBonus - 1 - (assumedShield / 10) - 0.3) / 0.15;
                    }

                    report.techLevels.shield = assumedShield;
                    var nestLevel = Math.round(nestCalc);
                    if (nestLevel >= 0 && nestLevel <= 50) {
                        report.techLevels.nest = nestLevel;
                        HMLogger.info("[Messagerie] Enemy Shield: " + assumedShield + ", Nest: " + nestLevel);
                    }
                }
            }
        }

        // ── HF stolen lines ──
        // "X took 15 917 003 cm? during last attack."
        var stolenMatches = text.match(/took\s+([\d\s,.]+)\s*cm/gi);
        if (stolenMatches) {
            for (var s = 0; s < stolenMatches.length; s++) {
                var numMatch = stolenMatches[s].match(/([\d\s,.]+)/);
                if (numMatch) report.hfStolen += this.parseNum(numMatch[1]);
            }
        }

        // ── Conquered lines ──
        // "Your ants conquered 9 274 956 cm?"
        var conqueredMatches = text.match(/conquered\s+([\d\s,.]+)\s*cm/gi);
        if (conqueredMatches) {
            for (var q = 0; q < conqueredMatches.length; q++) {
                var cMatch = conqueredMatches[q].match(/([\d\s,.]+)/);
                if (cMatch) report.hfStolen += this.parseNum(cMatch[1]);
            }
        }

        // ── Outcome ──
        if (text.match(/(?:humiliating\s+defeat|d[ée]faite|enemy\s+penetrate|troops?\s+failed)/i)) {
            report.outcome = "DEFEAT";
        } else if (text.match(/(?:victory|victoire|conquered|conquis)/i)) {
            report.outcome = "VICTORY";
        }

        // Only submit if we found meaningful data
        var hasData = report.attacker ||
            Object.keys(report.attackerTroops).length > 0 ||
            report.damage.enemyBase > 0 ||
            report.hfStolen > 0;

        if (!hasData) return;

        // Submit to Worker
        this.submitReportIntel(report);
    },

    // ════════════════════════════════════════════════════════════════════
    // TROOP STRING PARSER
    // "10 685 671 Young dwarves, 3 Dwarfs" → { unitIdx: count }
    // ════════════════════════════════════════════════════════════════════
    parseTroopString: function (str) {
        var troops = {};
        // Split by comma to get individual unit blocks
        var parts = str.split(",");

        for (var p = 0; p < parts.length; p++) {
            var part = parts[p].trim();
            if (!part) continue;

            // Extract the leading number (with spaces/dots as thousand separators)
            var numMatch = part.match(/^([\d][\d\s,.]*)/);
            if (!numMatch) continue;

            var count = this.parseNum(numMatch[1]);
            if (count <= 0) continue;

            // Match the unit name after the number
            var unitText = part.substring(numMatch[0].length).trim().toLowerCase();

            // Map unit names to indices
            var unitIdx = this.matchUnitName(unitText);
            if (unitIdx !== -1) {
                troops[unitIdx] = count;
            }
        }
        return troops;
    },

    matchUnitName: function (text) {
        // English unit names (ordered from most specific → least specific)
        var patterns = [
            [/young\s*dwarf/i, 0],
            [/(?:top|elite)\s*dwarf/i, 2],
            [/dwarf/i, 1],
            [/young\s*soldier/i, 3],
            [/(?:top|elite)\s*soldier/i, 9],
            [/soldier/i, 4],
            [/(?:top|elite)\s*doorkeeper/i, 6],
            [/doorkeeper/i, 5],
            [/(?:top|elite)\s*(?:fire\s*ant|artill)/i, 8],
            [/fire\s*ant|artill/i, 7],
            [/(?:top|elite)\s*tank/i, 11],
            [/tank/i, 10],
            [/(?:top|elite)\s*(?:killer|tueuse)/i, 13],
            [/killer|tueuse/i, 12],
            // French
            [/jeune.*naine/i, 0],
            [/naine.*[ée]lite/i, 2],
            [/naine/i, 1],
            [/jeune.*soldate/i, 3],
            [/soldate.*[ée]lite/i, 9],
            [/soldate/i, 4],
            [/concierge.*[ée]lite/i, 6],
            [/concierge/i, 5]
        ];

        for (var i = 0; i < patterns.length; i++) {
            if (patterns[i][0].test(text)) return patterns[i][1];
        }
        return -1;
    },

    // ════════════════════════════════════════════════════════════════════
    // HP ESTIMATION (for Shield/Nest calculation)
    // ════════════════════════════════════════════════════════════════════
    estimateBaseHP: function (troops, kills) {
        // Find dominant unit type (largest count)
        var dominantIdx = -1;
        var dominantCount = 0;
        for (var idx in troops) {
            if (troops[idx] > dominantCount) {
                dominantCount = troops[idx];
                dominantIdx = parseInt(idx, 10);
            }
        }
        if (dominantIdx === -1 || dominantIdx >= this.UNIT_BASE_HP.length) return 0;
        return kills * this.UNIT_BASE_HP[dominantIdx];
    },

    // ════════════════════════════════════════════════════════════════════
    // INTEL SUBMISSION
    // ════════════════════════════════════════════════════════════════════
    submitSubjectIntel: function (results) {
        if (typeof NetworkManager === "undefined" || !NetworkManager.isConnected) {
            // Auth not ready yet — queue and retry
            this._pendingSubjectIntel = results;
            this.retrySubjectSubmission();
            return;
        }

        // Collect all reports into a single batch array
        var batch = [];

        // Robberies — enemy stole HF from us
        for (var r = 0; r < results.robberies.length; r++) {
            var rob = results.robberies[r];
            batch.push({
                attacker: { name: rob.attacker, troops: {}, losses: {} },
                defender: { name: "TQC_SELF", troops: {}, losses: {} },
                hfStolen: rob.hfStolen,
                outcome: "DEFEAT"
            });
        }

        // Loots — we stole HF from enemy
        for (var l = 0; l < results.loots.length; l++) {
            var loot = results.loots[l];
            batch.push({
                attacker: { name: "TQC_SELF", troops: {}, losses: {} },
                defender: { name: loot.target, troops: {}, losses: {} },
                hfStolen: loot.hfGained,
                outcome: "VICTORY"
            });
        }

        // Invasions - enemy attacked us
        for (var i = 0; i < results.invasions.length; i++) {
            var inv = results.invasions[i];
            batch.push({
                attacker: { name: inv.attacker, troops: {}, losses: {} },
                defender: { name: "TQC_SELF", troops: {}, losses: {} },
                hfStolen: 0,
                outcome: inv.outcome || "UNKNOWN"
            });
        }
        
        // Onslaughts - we attacked enemy
        for (var o = 0; o < results.onslaughts.length; o++) {
            var ons = results.onslaughts[o];
            batch.push({
                attacker: { name: "TQC_SELF", troops: {}, losses: {} },
                defender: { name: ons.target, troops: {}, losses: {} },
                hfStolen: 0,
                outcome: ons.outcome || "UNKNOWN"
            });
        }

        if (batch.length > 0) {
            NetworkManager.submitBatchReports(batch);
        }

        this._pendingSubjectIntel = null;
        HMLogger.info("[Messagerie] Subject intel batched (" + results.robberies.length + " robberies, " + results.loots.length + " loots) in single request");
    },

    retrySubjectSubmission: function () {
        if (this._retryCount >= this._maxRetries) {
            HMLogger.info("[Messagerie] Auth retry limit reached — subject intel not submitted");
            return;
        }
        this._retryCount++;
        var self = this;
        setTimeout(function () {
            if (self._pendingSubjectIntel) {
                HMLogger.info("[Messagerie] Retrying subject intel submission (attempt " + self._retryCount + ")");
                self.submitSubjectIntel(self._pendingSubjectIntel);
            }
        }, 3000);
    },

    submitReportIntel: function (report) {
        if (typeof NetworkManager === "undefined" || !NetworkManager.isConnected) return;
        if (!report.attacker || !report.defender) return;

        var techData = null;
        if (report.techLevels.weapons !== null || report.techLevels.shield !== null) {
            techData = {
                attacker: null,
                defender: null
            };
            
            // The enemy is the one whose tech levels we calculated
            var enemyTech = {
                weapons: report.techLevels.weapons,
                shield: report.techLevels.shield,
                nest: report.techLevels.nest,
                dome: null,
                confidence: report.techLevels.nest !== null ? "calculated" : "estimated"
            };
            
            if (report.attacker === "TQC_SELF") {
                techData.defender = enemyTech;
            } else {
                techData.attacker = enemyTech;
            }
        }

        NetworkManager.submitIntelReport({
            attacker: { name: report.attacker, troops: report.attackerTroops, losses: {} },
            defender: { name: report.defender, troops: report.defenderTroops, losses: {} },
            hfStolen: report.hfStolen,
            outcome: report.outcome,
            techLevels: techData
        });

        var enemyName = report.attacker === "TQC_SELF" ? report.defender : report.attacker;
        HMLogger.info("[Messagerie] Intel submitted for " + enemyName +
            (report.techLevels.weapons !== null ? " (Weapons " + report.techLevels.weapons + ")" : ""));
    },

    // ════════════════════════════════════════════════════════════════════
    // UTILITY
    // ════════════════════════════════════════════════════════════════════
    parseNum: function (str) {
        if (!str) return 0;
        return parseInt(str.replace(/[\s,.']/g, ""), 10) || 0;
    }
};
