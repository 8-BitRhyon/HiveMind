/**
 * ChatManager - Mute/Block System for Antzzz Chat
 *
 * DOM structure (chat.php):
 *   #chatAlliance > #nouveauxMessages  (new messages, dynamic)
 *   #chatAlliance > #anciensMessages   (existing messages on load)
 *   Each message: <p id="MSGID">HH:MM:SS <strong><a href="Membre.php?Pseudo=USER">USER</a></strong>(<a>ALLIANCE</a>): text</p>
 *
 * Features:
 *  - Mute button [🔇] injected next to each username
 *  - Muted users' messages hidden via display:none
 *  - MutationObserver auto-hides new messages from muted users
 *  - Muted Users panel with unmute controls
 *  - Optional: hide all images in chat (NSFW blanket protection)
 */

var ChatManager = {

  STORAGE_KEY: "HM_MutedUsers",
  IMG_BLOCK_KEY: "HM_ChatBlockImages",

  // ════════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════════
  init: function () {
    var chatContainer = document.getElementById("chatAlliance");
    if (!chatContainer) {
      if (typeof HMLogger !== "undefined") HMLogger.info("[Chat] No chat container found on this page");
      return;
    }

    if (typeof HMLogger !== "undefined") HMLogger.info("[Chat] Chat page detected, initializing mute system");

    // Process existing messages
    this.processAllMessages();

    // Inject muted users panel
    this.injectMutePanel();

    // Watch for new messages
    this.observeNewMessages();

    // Apply image blocking if enabled
    if (this.isImageBlockingEnabled()) {
      this.blockAllImages();
    }

    if (typeof HMLogger !== "undefined") {
      var muted = this.getMutedUsers();
      HMLogger.info("[Chat] Mute system ready. " + muted.length + " user(s) muted");
    }
  },

  // ════════════════════════════════════════════════════════════════════
  // MUTE LIST (localStorage)
  // ════════════════════════════════════════════════════════════════════
  getMutedUsers: function () {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  },

  saveMutedUsers: function (list) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
  },

  muteUser: function (username) {
    var list = this.getMutedUsers();
    var lower = username.toLowerCase();
    if (list.indexOf(lower) === -1) {
      list.push(lower);
      this.saveMutedUsers(list);
      if (typeof HMLogger !== "undefined") HMLogger.info("[Chat] Muted: " + username);
      if (typeof HMToast !== "undefined") HMToast.success("Muted " + username);
    }
    this.processAllMessages();
    this.refreshMutePanel();
  },

  unmuteUser: function (username) {
    var list = this.getMutedUsers();
    var lower = username.toLowerCase();
    var idx = list.indexOf(lower);
    if (idx !== -1) {
      list.splice(idx, 1);
      this.saveMutedUsers(list);
      if (typeof HMLogger !== "undefined") HMLogger.info("[Chat] Unmuted: " + username);
      if (typeof HMToast !== "undefined") HMToast.success("Unmuted " + username);
    }
    this.processAllMessages();
    this.refreshMutePanel();
  },

  isMuted: function (username) {
    return this.getMutedUsers().indexOf(username.toLowerCase()) !== -1;
  },

  // ════════════════════════════════════════════════════════════════════
  // MESSAGE PROCESSING
  // ════════════════════════════════════════════════════════════════════
  processAllMessages: function () {
    var containers = ["nouveauxMessages", "anciensMessages"];
    var self = this;

    containers.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var messages = el.querySelectorAll("p[id]");
      messages.forEach(function (p) {
        self.processMessage(p);
      });
    });
  },

  processMessage: function (p) {
    if (!p) return;

    // Extract username from <strong><a href="Membre.php?Pseudo=USER">USER</a></strong>
    var strongLink = p.querySelector("strong > a[href*='Membre.php']");
    if (!strongLink) return;

    var username = strongLink.textContent.trim();
    if (!username) return;

    // Hide/show based on mute list
    if (this.isMuted(username)) {
      p.style.display = "none";
    } else {
      p.style.display = "";
    }

    // Inject mute button if not already present
    if (!p.querySelector(".hm-mute-btn")) {
      this.injectMuteButton(p, username);
    }
  },

  injectMuteButton: function (p, username) {
    var self = this;
    var btn = document.createElement("span");
    btn.className = "hm-mute-btn";
    btn.title = this.isMuted(username) ? "Unmute " + username : "Mute " + username;
    btn.textContent = this.isMuted(username) ? "🔊" : "🔇";
    btn.style.cssText =
      "cursor:pointer; font-size:10px; margin-left:4px; opacity:0.3;" +
      "transition:opacity 0.15s;";

    // Show on hover of the parent <p>
    p.addEventListener("mouseenter", function () { btn.style.opacity = "1"; });
    p.addEventListener("mouseleave", function () { btn.style.opacity = "0.3"; });

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (self.isMuted(username)) {
        self.unmuteUser(username);
      } else {
        self.muteUser(username);
      }
    });

    // Insert after the alliance link, before the colon/message text
    var strong = p.querySelector("strong");
    if (strong && strong.nextSibling) {
      // Find the alliance link that follows <strong>
      var allianceLink = strong.nextElementSibling;
      if (allianceLink && allianceLink.tagName === "A") {
        allianceLink.parentNode.insertBefore(btn, allianceLink.nextSibling);
      } else {
        strong.parentNode.insertBefore(btn, strong.nextSibling);
      }
    }
  },

  // ════════════════════════════════════════════════════════════════════
  // MUTATION OBSERVER (auto-hide new messages)
  // ════════════════════════════════════════════════════════════════════
  observeNewMessages: function () {
    var self = this;
    var targets = ["nouveauxMessages", "anciensMessages"];

    targets.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;

      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType === 1 && node.tagName === "P") {
              self.processMessage(node);

              // Also block images if enabled
              if (self.isImageBlockingEnabled()) {
                self.blockImagesInElement(node);
              }
            }
          });
        });
      });

      observer.observe(el, { childList: true });
    });

    if (typeof HMLogger !== "undefined") HMLogger.info("[Chat] MutationObserver active");
  },

  // ════════════════════════════════════════════════════════════════════
  // IMAGE BLOCKING (NSFW protection)
  // ════════════════════════════════════════════════════════════════════
  isImageBlockingEnabled: function () {
    return localStorage.getItem(this.IMG_BLOCK_KEY) === "true";
  },

  setImageBlocking: function (enabled) {
    localStorage.setItem(this.IMG_BLOCK_KEY, enabled ? "true" : "false");
    if (enabled) {
      this.blockAllImages();
    } else {
      this.unblockAllImages();
    }
    this.refreshMutePanel();
  },

  blockAllImages: function () {
    var containers = ["nouveauxMessages", "anciensMessages"];
    var self = this;
    containers.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) self.blockImagesInElement(el);
    });
  },

  blockImagesInElement: function (el) {
    // Only block non-smiley images (smileys are from images/smiley/)
    var imgs = el.querySelectorAll("img");
    imgs.forEach(function (img) {
      var src = img.getAttribute("src") || "";
      // Skip game smileys — they're safe
      if (src.indexOf("images/smiley/") !== -1) return;

      // Replace with a placeholder
      if (!img.dataset.hmBlocked) {
        img.dataset.hmBlocked = "true";
        img.dataset.hmOrigSrc = src;
        img.style.display = "none";

        var placeholder = document.createElement("span");
        placeholder.className = "hm-img-blocked";
        placeholder.textContent = "[🚫 Image hidden]";
        placeholder.title = "Click to reveal (image may be NSFW)";
        placeholder.style.cssText =
          "color:#8b2020; font-size:10px; cursor:pointer; font-family:var(--font-mono);";
        placeholder.addEventListener("click", function () {
          img.style.display = "";
          placeholder.remove();
        });

        img.parentNode.insertBefore(placeholder, img.nextSibling);
      }
    });
  },

  unblockAllImages: function () {
    var blocked = document.querySelectorAll("img[data-hm-blocked]");
    blocked.forEach(function (img) {
      img.style.display = "";
      delete img.dataset.hmBlocked;
    });
    var placeholders = document.querySelectorAll(".hm-img-blocked");
    placeholders.forEach(function (el) { el.remove(); });
  },

  // ════════════════════════════════════════════════════════════════════
  // MUTE PANEL UI
  // ════════════════════════════════════════════════════════════════════
  injectMutePanel: function () {
    var chatContainer = document.getElementById("chatAlliance");
    if (!chatContainer) return;

    // Remove existing panel
    var existing = document.getElementById("HM_MutePanel");
    if (existing) existing.remove();

    var panel = document.createElement("div");
    panel.id = "HM_MutePanel";
    panel.style.cssText =
      "background:var(--hm-bg, #f4ecd8); border:2px solid var(--hm-border, #5c4033);" +
      "font-family:var(--font-mono, monospace); margin-bottom:12px;" +
      "box-shadow:6px 6px 0 rgba(0,0,0,0.3);";

    // Header
    var header = document.createElement("div");
    header.style.cssText =
      "background:var(--hm-text, #000); color:var(--hm-bg, #fff);" +
      "padding:6px 12px; font-size:10px; font-weight:900;" +
      "text-transform:uppercase; letter-spacing:1.5px; cursor:pointer;" +
      "display:flex; justify-content:space-between; align-items:center;" +
      "font-family:var(--font-display, sans-serif);";
    header.innerHTML = "<span>🔇 HIVEMIND — MUTED USERS</span><span id='HM_MutePanelToggle'>▼</span>";

    var self = this;
    header.addEventListener("click", function () {
      var content = document.getElementById("HM_MutePanelContent");
      var toggle = document.getElementById("HM_MutePanelToggle");
      if (content.style.display === "none") {
        content.style.display = "block";
        toggle.textContent = "▲";
      } else {
        content.style.display = "none";
        toggle.textContent = "▼";
      }
    });

    // Content
    var content = document.createElement("div");
    content.id = "HM_MutePanelContent";
    content.style.cssText = "padding:10px 12px; display:none;";

    panel.appendChild(header);
    panel.appendChild(content);

    // Insert before chat
    chatContainer.parentNode.insertBefore(panel, chatContainer);

    this.refreshMutePanel();
  },

  refreshMutePanel: function () {
    var content = document.getElementById("HM_MutePanelContent");
    if (!content) return;

    var muted = this.getMutedUsers();
    var self = this;
    var html = "";

    // Image blocking toggle
    var imgBlocked = this.isImageBlockingEnabled();
    html += '<div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px dashed var(--hm-border, #ccc);">';
    html += '<label style="font-size:11px; cursor:pointer; display:flex; align-items:center; gap:6px;">';
    html += '<input type="checkbox" id="HM_BlockImages" ' + (imgBlocked ? "checked" : "") + '>';
    html += '<span style="font-weight:700;">Hide external images (NSFW protection)</span>';
    html += "</label></div>";

    // Muted users list
    if (muted.length === 0) {
      html += '<div style="color:var(--hm-muted, #888); font-size:11px; font-style:italic; text-align:center; padding:8px 0;">No muted users. Click 🔇 next to a username in chat to mute.</div>';
    } else {
      html += '<div style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--hm-muted); margin-bottom:6px; letter-spacing:0.5px;">' + muted.length + " muted</div>";
      muted.forEach(function (user) {
        html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:3px 0; border-bottom:1px dotted var(--hm-border, #ccc);" data-hm-muted-user="' + user + '">';
        html += '<span style="font-size:12px; font-weight:700;">' + user + "</span>";
        html += '<button class="hm-unmute-btn" data-user="' + user + '" style="background:transparent; border:1px solid var(--hm-error, #8b2020); color:var(--hm-error); font-size:9px; padding:2px 6px; cursor:pointer; font-family:var(--font-mono);">UNMUTE</button>';
        html += "</div>";
      });
    }

    content.innerHTML = html;

    // Attach events
    var imgToggle = document.getElementById("HM_BlockImages");
    if (imgToggle) {
      imgToggle.addEventListener("change", function () {
        self.setImageBlocking(this.checked);
      });
    }

    var unmuteBtns = content.querySelectorAll(".hm-unmute-btn");
    unmuteBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        self.unmuteUser(this.getAttribute("data-user"));
      });
    });

    // Update all mute buttons in chat
    var allMuteBtns = document.querySelectorAll(".hm-mute-btn");
    allMuteBtns.forEach(function (btn) {
      // Remove and re-add via processAllMessages
    });
    // Re-process to update button icons
    var containers = ["nouveauxMessages", "anciensMessages"];
    containers.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var messages = el.querySelectorAll("p[id]");
      messages.forEach(function (p) {
        var existingBtn = p.querySelector(".hm-mute-btn");
        if (existingBtn) existingBtn.remove();
        self.processMessage(p);
      });
    });
  }
};
