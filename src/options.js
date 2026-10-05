(function optionsPage() {
  "use strict";

  const Core = window.DownloadRouterCore;
  const Store = window.DownloadRouterStorage;
  const state = {
    settings: Core.defaultSettings(),
    activeTab: "overview",
    editingKind: "",
    editingId: "",
    quickFolderEdited: false,
    dialogReturnFocus: null,
    pendingImport: null,
    restoreDialogReturnFocus: null,
    toastTimer: null
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindElements();
    bindEvents();
    try {
      state.settings = await Store.ensureSettings();
      applyIncomingHost();
      render();
      refreshNativeMoveStatus().catch((error) => {
        setStatus(els["native-host-status"], error.message || "Could not read pending move status.", "error");
      });
    } catch (error) {
      els["overview-health"].textContent = "Could not load";
      els["overview-health"].className = "pill warning";
      setStatus(els["quick-site-status"], error.message || "Tidy Downloads could not load its saved settings.", "error");
    }
  }

  function bindElements() {
    [
      "enabled",
      "ask-on-first-download",
      "ask-only-unmatched",
      "keep-history",
      "history-limit",
      "test-native-host",
      "native-host-status",
      "native-move-summary",
      "native-move-count",
      "native-move-detail",
      "retry-native-moves",
      "route-priority",
      "conflict-action",
      "overview-health",
      "overview-title",
      "overview-summary",
      "site-rule-count",
      "file-rule-count",
      "prompt-count",
      "site-tab-count",
      "file-tab-count",
      "history-tab-count",
      "preset-grid",
      "preset-status",
      "apply-recommended-presets",
      "quick-site-form",
      "quick-site-host",
      "quick-site-folder",
      "quick-site-subdomains",
      "quick-site-save",
      "quick-site-status",
      "add-site-rule",
      "add-file-rule",
      "site-filter",
      "file-filter",
      "site-rules-list",
      "file-rules-list",
      "prompt-list",
      "history-list",
      "clear-prompts",
      "clear-history",
      "export-settings",
      "import-settings",
      "import-file",
      "app-toast",
      "rule-dialog",
      "rule-form",
      "rule-dialog-title",
      "rule-dialog-description",
      "close-rule-dialog",
      "rule-id",
      "rule-kind",
      "site-rule-fields",
      "file-rule-fields",
      "site-host",
      "site-folder",
      "site-source-game",
      "site-extension-mode",
      "site-extensions",
      "site-include-subdomains",
      "site-enabled",
      "file-name",
      "file-folder",
      "file-extensions",
      "file-mime-patterns",
      "file-enabled",
      "rule-preview",
      "rule-preview-mode",
      "rule-preview-source",
      "rule-preview-folder",
      "rule-preview-description",
      "rule-notes",
      "rule-form-status",
      "save-rule",
      "delete-rule",
      "cancel-rule",
      "restore-dialog",
      "close-restore-dialog",
      "restore-file-name",
      "restore-sorting-status",
      "restore-enabled-rule-count",
      "restore-collision-status",
      "restore-path-section",
      "restore-path-list",
      "restore-warning",
      "restore-warning-text",
      "restore-confirm-line",
      "restore-confirm-checkbox",
      "restore-status",
      "cancel-restore",
      "apply-restore"
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
    tabButtons.forEach((button, index) => {
      button.addEventListener("click", () => setActiveTab(button.dataset.tab, true));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          return;
        }
        event.preventDefault();
        let nextIndex = index;
        if (event.key === "ArrowLeft") {
          nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
        } else if (event.key === "ArrowRight") {
          nextIndex = (index + 1) % tabButtons.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabButtons.length - 1;
        }
        const nextButton = tabButtons[nextIndex];
        setActiveTab(nextButton.dataset.tab, true);
        nextButton.focus();
      });
    });

    els.enabled.addEventListener("change", () => updateSimpleSetting("enabled", els.enabled.checked));
    els["ask-on-first-download"].addEventListener("change", () => {
      updateSimpleSetting("askOnFirstDownload", els["ask-on-first-download"].checked);
    });
    els["ask-only-unmatched"].addEventListener("change", () => {
      updateSimpleSetting("askOnlyWhenNoRuleMatches", els["ask-only-unmatched"].checked);
    });
    els["keep-history"].addEventListener("change", async () => {
      const keepHistory = els["keep-history"].checked;
      const result = await Store.updateSettings((settings) => {
        settings.keepHistory = keepHistory;
        if (!keepHistory) {
          settings.recentRoutes = [];
        }
      });
      state.settings = result.settings;
      render();
    });
    els["history-limit"].addEventListener("change", () => updateSimpleSetting("historyLimit", Number(els["history-limit"].value)));
    els["test-native-host"].addEventListener("click", testNativeHost);
    els["retry-native-moves"].addEventListener("click", retryNativeMoves);
    els["route-priority"].addEventListener("change", () => updateSimpleSetting("routePriority", els["route-priority"].value));
    els["conflict-action"].addEventListener("change", () => updateSimpleSetting("conflictAction", els["conflict-action"].value));

    els["apply-recommended-presets"].addEventListener("click", addRecommendedPresets);
    els["quick-site-form"].addEventListener("submit", addQuickSiteRule);
    els["quick-site-host"].addEventListener("blur", suggestQuickSiteFolder);
    els["quick-site-folder"].addEventListener("input", () => {
      state.quickFolderEdited = true;
    });
    document.querySelectorAll("[data-open-site-dialog], #add-site-rule").forEach((button) => {
      button.addEventListener("click", () => openSiteRuleDialog());
    });
    els["add-file-rule"].addEventListener("click", () => openFileRuleDialog());
    els["site-filter"].addEventListener("input", renderSiteRules);
    els["file-filter"].addEventListener("input", renderFileRules);
    els["clear-prompts"].addEventListener("click", clearPrompts);
    els["clear-history"].addEventListener("click", clearHistory);
    els["export-settings"].addEventListener("click", exportSettings);
    els["import-settings"].addEventListener("click", () => {
      state.restoreDialogReturnFocus = els["import-settings"];
      els["import-file"].click();
    });
    els["import-file"].addEventListener("change", importSettings);

    els["rule-form"].addEventListener("submit", saveDialogRule);
    els["site-extension-mode"].addEventListener("change", updateSiteExtensionField);
    [
      "site-host",
      "site-folder",
      "site-source-game",
      "site-extension-mode",
      "site-extensions",
      "file-name",
      "file-folder",
      "file-extensions",
      "file-mime-patterns"
    ].forEach((id) => {
      els[id].addEventListener("input", updateRulePreview);
    });
    els["close-rule-dialog"].addEventListener("click", closeRuleDialog);
    els["cancel-rule"].addEventListener("click", closeRuleDialog);
    els["delete-rule"].addEventListener("click", deleteDialogRule);
    els["close-restore-dialog"].addEventListener("click", closeRestoreDialog);
    els["cancel-restore"].addEventListener("click", closeRestoreDialog);
    els["apply-restore"].addEventListener("click", applySettingsImport);
    els["restore-confirm-checkbox"].addEventListener("change", updateRestoreApplyState);
    els["restore-dialog"].addEventListener("cancel", (event) => {
      event.preventDefault();
      closeRestoreDialog();
    });
  }

  function applyIncomingHost() {
    const params = new URLSearchParams(window.location.search);
    const host = Core.normalizeHostPattern(params.get("host"));
    if (host) {
      els["quick-site-host"].value = host;
      els["site-host"].value = host;
      setActiveTab("site-rules");
      openSiteRuleDialog({ hostPattern: host, includeSubdomains: true, enabled: true, folder: "" });
    } else if (window.location.hash) {
      setActiveTab(window.location.hash.slice(1));
    }
  }

  function setActiveTab(tab, updateHash) {
    const knownTabs = new Set(["overview", "site-rules", "file-type-rules", "prompts", "history"]);
    state.activeTab = knownTabs.has(tab) ? tab : "overview";
    document.querySelectorAll(".tab-button").forEach((button) => {
      const selected = button.dataset.tab === state.activeTab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.hidden = panel.id !== state.activeTab;
    });
    if (updateHash && window.location.hash !== `#${state.activeTab}`) {
      window.history.replaceState(null, "", `#${state.activeTab}`);
    }
  }

  async function updateSimpleSetting(key, value) {
    try {
      const result = await Store.updateSettings((settings) => {
        settings[key] = value;
      });
      state.settings = result.settings;
      render();
    } catch (error) {
      render();
      els["overview-title"].textContent = "That change was not saved";
      els["overview-summary"].textContent = error.message || "Try the setting again.";
      els["overview-health"].textContent = "Try again";
      els["overview-health"].className = "pill warning";
    }
  }

  function render() {
    state.settings = Core.normalizeSettings(state.settings);
    els.enabled.checked = state.settings.enabled;
    els["ask-on-first-download"].checked = state.settings.askOnFirstDownload;
    els["ask-only-unmatched"].checked = state.settings.askOnlyWhenNoRuleMatches;
    els["ask-only-unmatched"].disabled = !state.settings.askOnFirstDownload;
    els["ask-only-unmatched"].closest(".toggle-row").classList.toggle("field-disabled", !state.settings.askOnFirstDownload);
    els["keep-history"].checked = state.settings.keepHistory;
    els["history-limit"].value = String(state.settings.historyLimit);
    els["history-limit"].disabled = !state.settings.keepHistory;
    els["history-limit"].closest("label").classList.toggle("field-disabled", !state.settings.keepHistory);
    els["route-priority"].value = state.settings.routePriority;
    els["conflict-action"].value = state.settings.conflictAction;

    const validationErrors = Core.validateSettings(state.settings);
    const activeSiteCount = state.settings.siteRules.filter((rule) => rule.enabled).length;
    const activeFileCount = state.settings.fileTypeRules.filter((rule) => rule.enabled).length;
    const activeRuleCount = activeSiteCount + activeFileCount;

    if (validationErrors.length) {
      els["overview-title"].textContent = "A few rules need attention";
      els["overview-summary"].textContent = "Review the highlighted rules before relying on automatic sorting.";
      els["overview-health"].textContent = `${validationErrors.length} fix needed${validationErrors.length === 1 ? "" : "s"}`;
      els["overview-health"].className = "pill warning";
    } else if (!state.settings.enabled) {
      els["overview-title"].textContent = "Automatic sorting is paused";
      els["overview-summary"].textContent = `${activeRuleCount} saved rule${activeRuleCount === 1 ? " is" : "s are"} ready whenever you turn sorting back on.`;
      els["overview-health"].textContent = "Paused";
      els["overview-health"].className = "pill warning";
    } else if (!activeRuleCount) {
      els["overview-title"].textContent = "Let's organize your first download";
      els["overview-summary"].textContent = "Add the suggested folders below, then customize any website that needs its own place.";
      els["overview-health"].textContent = "Setup needed";
      els["overview-health"].className = "pill warning";
    } else {
      els["overview-title"].textContent = "Your downloads are being organized";
      els["overview-summary"].textContent = `${activeSiteCount} website rule${activeSiteCount === 1 ? "" : "s"} and ${activeFileCount} file type rule${activeFileCount === 1 ? "" : "s"} are active.`;
      els["overview-health"].textContent = "Sorting on";
      els["overview-health"].className = "pill success";
    }

    els["site-rule-count"].textContent = String(state.settings.siteRules.length);
    els["file-rule-count"].textContent = String(state.settings.fileTypeRules.length);
    els["prompt-count"].textContent = String(Object.keys(state.settings.promptHosts).length);
    els["site-tab-count"].textContent = String(state.settings.siteRules.length);
    els["file-tab-count"].textContent = String(state.settings.fileTypeRules.length);
    els["history-tab-count"].textContent = String(state.settings.recentRoutes.length);

    renderPresets();
    renderSiteRules();
    renderFileRules();
    renderPrompts();
    renderHistory();
  }

  function renderPresets() {
    els["preset-grid"].replaceChildren();
    let availableCount = 0;
    Core.PRESET_FILE_TYPE_RULES.forEach((preset) => {
      const exists = state.settings.fileTypeRules.some((rule) => rule.name.toLowerCase() === preset.name.toLowerCase());
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-button";
      button.disabled = exists;
      button.innerHTML = `<strong>${escapeHtml(preset.name)}</strong><span class="muted">${exists ? "Already added" : `Save to ${escapeHtml(preset.folder)}`}</span><span class="preset-state-icon" aria-hidden="true">${exists ? "✓" : "+"}</span>`;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await addPreset(preset);
        } catch (error) {
          button.disabled = false;
          setStatus(els["preset-status"], error.message || `Could not add the ${preset.name} folder.`, "error");
        }
      });
      els["preset-grid"].append(button);
      if (!exists) {
        availableCount += 1;
      }
    });
    els["apply-recommended-presets"].disabled = availableCount === 0;
    els["apply-recommended-presets"].textContent = availableCount === 0
      ? "Suggested Folders Ready"
      : "Add Suggested Folders";
  }

  async function addPreset(preset) {
    const result = await Store.updateSettings((settings) => {
      const existing = settings.fileTypeRules.some((rule) => rule.name.toLowerCase() === preset.name.toLowerCase());
      if (!existing) {
        settings.fileTypeRules.push(Core.normalizeFileTypeRule(Object.assign({ enabled: true }, preset)));
      }
    });
    state.settings = result.settings;
    setStatus(els["preset-status"], `${preset.name} folder added.`, "ok");
    render();
  }

  async function addRecommendedPresets() {
    els["apply-recommended-presets"].disabled = true;
    els["apply-recommended-presets"].textContent = "Adding...";
    try {
      const result = await Store.updateSettings((settings) => {
        Core.PRESET_FILE_TYPE_RULES.forEach((preset) => {
          const existing = settings.fileTypeRules.some((rule) => rule.name.toLowerCase() === preset.name.toLowerCase());
          if (!existing) {
            settings.fileTypeRules.push(Core.normalizeFileTypeRule(Object.assign({ enabled: true }, preset)));
          }
        });
      });
      state.settings = result.settings;
      setStatus(els["preset-status"], "Suggested folders are ready.", "ok");
      render();
    } catch (error) {
      els["apply-recommended-presets"].disabled = false;
      els["apply-recommended-presets"].textContent = "Add Suggested Folders";
      setStatus(els["preset-status"], error.message || "Could not add the suggested folders.", "error");
    }
  }

  function renderSiteRules() {
    const filter = els["site-filter"].value.trim().toLowerCase();
    const hasRules = state.settings.siteRules.length > 0;
    const rules = state.settings.siteRules.filter((rule) => {
      return !filter
        || rule.hostPattern.includes(filter)
        || rule.folder.toLowerCase().includes(filter)
        || rule.sourceGame.toLowerCase().includes(filter);
    });
    els["site-rules-list"].replaceChildren();
    els["site-filter"].closest(".search-toolbar").hidden = !hasRules;

    if (!rules.length) {
      if (filter) {
        els["site-rules-list"].append(emptyState(
          "No matching website rules",
          "Try a different website or folder name.",
          "Clear Search",
          () => {
            els["site-filter"].value = "";
            renderSiteRules();
            els["site-filter"].focus();
          }
        ));
      } else {
        els["site-rules-list"].append(emptyState(
          "No website rules yet",
          "Create one when a website should always save to a specific place.",
          "Create Website Rule",
          () => openSiteRuleDialog()
        ));
      }
      return;
    }

    rules.forEach((rule) => els["site-rules-list"].append(siteRuleCard(rule)));
  }

  function siteRuleCard(rule) {
    const card = document.createElement("article");
    card.className = `rule-card${rule.enabled ? "" : " disabled"}`;
    const filterLabel = rule.extensionMode === "all"
      ? "All file types"
      : `${rule.extensionMode === "only" ? "Only" : "Except"} ${rule.extensions.map((extension) => `.${extension}`).join(", ")}`;
    const sourceLabel = rule.sourceGame ? friendlyGameLabel(rule.sourceGame) : "All site downloads";
    const sourceDisplay = rule.sourceGame
      ? `${rule.hostPattern} · ${sourceLabel}`
      : rule.hostPattern;
    card.innerHTML = `
      <div class="rule-card-header">
        <div class="rule-title">
          <h3>${escapeHtml(rule.hostPattern)}</h3>
          ${rule.sourceGame ? `<span class="pill">${escapeHtml(sourceLabel)}</span>` : ""}
          <span class="pill ${rule.enabled ? "success" : "warning"}">${rule.enabled ? "Active" : "Paused"}</span>
        </div>
        <div class="row-actions">
          <button type="button" data-action="toggle" aria-label="${rule.enabled ? "Pause" : "Activate"} ${escapeHtml(rule.hostPattern)} rule">${rule.enabled ? "Pause" : "Activate"}</button>
          <button type="button" data-action="edit" aria-label="Edit ${escapeHtml(rule.hostPattern)} rule">Edit</button>
        </div>
      </div>
      <div class="rule-route">
        <div class="rule-endpoint">
          <span class="route-overline">From</span>
          <strong title="${escapeHtml(sourceDisplay)}">${escapeHtml(sourceDisplay)}</strong>
        </div>
        <span class="route-arrow" aria-hidden="true">→</span>
        <div class="rule-endpoint destination">
          <span class="route-overline">Save to</span>
          <strong title="${escapeHtml(rule.folder)}">${escapeHtml(rule.folder)}</strong>
        </div>
      </div>
      <div class="rule-details">
        <span class="pill">${rule.includeSubdomains ? "Related addresses included" : "Exact address only"}</span>
        <span class="pill">${escapeHtml(filterLabel)}</span>
        ${rule.notes ? `<span class="rule-note"><strong>Note:</strong> ${escapeHtml(rule.notes)}</span>` : ""}
      </div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener("click", () => openSiteRuleDialog(rule));
    card.querySelector('[data-action="toggle"]').addEventListener("click", () => toggleRule("site", rule.id));
    return card;
  }

  function renderFileRules() {
    const filter = els["file-filter"].value.trim().toLowerCase();
    const hasRules = state.settings.fileTypeRules.length > 0;
    const rules = state.settings.fileTypeRules.filter((rule) => {
      return !filter
        || rule.name.toLowerCase().includes(filter)
        || rule.folder.toLowerCase().includes(filter)
        || rule.extensions.join(",").includes(filter)
        || rule.mimePatterns.join(",").includes(filter);
    });
    els["file-rules-list"].replaceChildren();
    els["file-filter"].closest(".search-toolbar").hidden = !hasRules;

    if (!rules.length) {
      if (filter) {
        els["file-rules-list"].append(emptyState(
          "No matching file type rules",
          "Try a different rule name, file ending, or folder.",
          "Clear Search",
          () => {
            els["file-filter"].value = "";
            renderFileRules();
            els["file-filter"].focus();
          }
        ));
      } else {
        els["file-rules-list"].append(emptyState(
          "No file type rules yet",
          "Create one for a format such as .mp4, .zip, or .pdf.",
          "Create File Type Rule",
          () => openFileRuleDialog()
        ));
      }
      return;
    }

    rules.forEach((rule) => els["file-rules-list"].append(fileRuleCard(rule)));
  }

  function fileRuleCard(rule) {
    const card = document.createElement("article");
    card.className = `rule-card${rule.enabled ? "" : " disabled"}`;
    const extensionLabel = rule.extensions.length
      ? rule.extensions.map((extension) => `.${extension}`).join(", ")
      : rule.mimePatterns.join(", ");
    card.innerHTML = `
      <div class="rule-card-header">
        <div class="rule-title">
          <h3>${escapeHtml(rule.name)}</h3>
          <span class="pill ${rule.enabled ? "success" : "warning"}">${rule.enabled ? "Active" : "Paused"}</span>
        </div>
        <div class="row-actions">
          <button type="button" data-action="toggle" aria-label="${rule.enabled ? "Pause" : "Activate"} ${escapeHtml(rule.name)} rule">${rule.enabled ? "Pause" : "Activate"}</button>
          <button type="button" data-action="edit" aria-label="Edit ${escapeHtml(rule.name)} rule">Edit</button>
        </div>
      </div>
      <div class="rule-route">
        <div class="rule-endpoint">
          <span class="route-overline">Matches</span>
          <strong title="${escapeHtml(extensionLabel)}">${escapeHtml(extensionLabel || "Content type pattern")}</strong>
        </div>
        <span class="route-arrow" aria-hidden="true">→</span>
        <div class="rule-endpoint destination">
          <span class="route-overline">Save to</span>
          <strong title="${escapeHtml(rule.folder)}">${escapeHtml(rule.folder)}</strong>
        </div>
      </div>
      <div class="rule-details">
        ${rule.mimePatterns.length ? `<span class="pill">Also matches ${escapeHtml(rule.mimePatterns.join(", "))}</span>` : ""}
        ${rule.notes ? `<span class="rule-note"><strong>Note:</strong> ${escapeHtml(rule.notes)}</span>` : ""}
      </div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener("click", () => openFileRuleDialog(rule));
    card.querySelector('[data-action="toggle"]').addEventListener("click", () => toggleRule("file", rule.id));
    return card;
  }

  function renderPrompts() {
    const entries = Object.entries(state.settings.promptHosts).sort(([a], [b]) => a.localeCompare(b));
    els["prompt-list"].replaceChildren();

    if (!entries.length) {
      els["prompt-list"].append(emptyState(
        "No remembered websites",
        "Websites appear here after you answer a first-time folder question."
      ));
      return;
    }

    const table = document.createElement("table");
    table.className = "data-table";
    table.innerHTML = "<thead><tr><th>Website</th><th>Choice</th><th>Last seen</th><th></th></tr></thead><tbody></tbody>";
    const tbody = table.querySelector("tbody");

    entries.forEach(([host, entry]) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Website">${escapeHtml(host)}</td>
        <td data-label="Choice">${escapeHtml(promptStateLabel(entry.state))}</td>
        <td data-label="Last seen">${escapeHtml(formatDate(entry.lastSeenAt))}</td>
        <td data-label="Action"><button type="button" aria-label="Ask about ${escapeHtml(host)} again">Ask Again</button></td>
      `;
      row.querySelector("button").addEventListener("click", () => resetPrompt(host));
      tbody.append(row);
    });

    els["prompt-list"].append(table);
  }

  function renderHistory() {
    els["history-list"].replaceChildren();
    const routes = state.settings.recentRoutes || [];

    if (!routes.length) {
      els["history-list"].append(state.settings.keepHistory
        ? emptyState("No activity yet", "New downloads will appear here after Tidy Downloads routes them.")
        : emptyState(
          "Activity is turned off",
          "Turn it on under Privacy if you want a local list of recent destinations.",
          "Open Privacy",
          () => setActiveTab("prompts", true)
        ));
      return;
    }

    const table = document.createElement("table");
    table.className = "data-table";
    table.innerHTML = "<thead><tr><th>When</th><th>Website</th><th>Game/source</th><th>File</th><th>Route</th></tr></thead><tbody></tbody>";
    const tbody = table.querySelector("tbody");

    routes.forEach((route) => {
      const row = document.createElement("tr");
      const destination = route.folder ? `${route.folder} (${routeTypeLabel(route.ruleType)})` : "Normal Downloads folder";
      row.innerHTML = `
        <td data-label="When">${escapeHtml(formatDate(route.at))}</td>
        <td data-label="Website">${escapeHtml(route.host || "Unknown")}</td>
        <td data-label="Game or source">${escapeHtml(route.gameName || route.sourceName || "None")}</td>
        <td data-label="File">${escapeHtml(route.originalFilename || "download")}</td>
        <td data-label="Destination">${escapeHtml(destination)}</td>
      `;
      tbody.append(row);
    });

    els["history-list"].append(table);
  }

  async function addQuickSiteRule(event) {
    event.preventDefault();
    const hostPattern = Core.normalizeHostPattern(els["quick-site-host"].value);
    const folderResult = Core.sanitizeDestinationPath(els["quick-site-folder"].value);

    if (!hostPattern) {
      setStatus(els["quick-site-status"], "Enter a website such as nexusmods.com.", "error");
      return;
    }
    if (!folderResult.ok || !folderResult.value) {
      setStatus(els["quick-site-status"], folderResult.error || "Enter a folder.", "error");
      return;
    }

    els["quick-site-save"].disabled = true;
    els["quick-site-save"].textContent = "Saving...";
    try {
      const result = await Store.updateSettings((settings) => {
        const upserted = Core.upsertSiteRule(settings.siteRules, {
          hostPattern,
          folder: folderResult.value,
          includeSubdomains: els["quick-site-subdomains"].checked,
          enabled: true,
          sourceGame: "",
          extensionMode: "all",
          extensions: []
        });
        settings.siteRules = upserted.rules;
        const previousPrompt = settings.promptHosts[hostPattern];
        const now = new Date().toISOString();
        settings.promptHosts[hostPattern] = {
          state: "saved",
          firstSeenAt: previousPrompt && previousPrompt.firstSeenAt || now,
          lastSeenAt: now,
          lastPromptedAt: previousPrompt && previousPrompt.lastPromptedAt || now
        };
        return upserted.created;
      });

      state.settings = result.settings;
      els["quick-site-folder"].value = "";
      state.quickFolderEdited = false;
      setStatus(els["quick-site-status"], result.result ? "Website folder saved." : "Website folder updated.", "ok");
      render();
    } catch (error) {
      setStatus(els["quick-site-status"], error.message || "Could not save this website folder.", "error");
    } finally {
      els["quick-site-save"].disabled = false;
      els["quick-site-save"].textContent = "Save Website Folder";
    }
  }

  function suggestQuickSiteFolder() {
    if (state.quickFolderEdited || els["quick-site-folder"].value.trim()) {
      return;
    }
    const host = Core.normalizeHostPattern(els["quick-site-host"].value);
    if (!host) {
      return;
    }
    const [suggestedFolder] = Core.suggestFoldersForHost(host);
    if (suggestedFolder) {
      els["quick-site-folder"].value = suggestedFolder;
    }
  }

  function openSiteRuleDialog(rule) {
    state.dialogReturnFocus = document.activeElement;
    const value = Core.normalizeSiteRule(rule || { enabled: true, includeSubdomains: true });
    state.editingKind = "site";
    state.editingId = rule && rule.id ? rule.id : "";
    els["rule-dialog-title"].textContent = state.editingId ? "Edit Website Rule" : "New Website Rule";
    els["rule-dialog-description"].textContent = "Choose which website downloads should match and where they should save.";
    els["rule-kind"].value = "site";
    els["rule-id"].value = state.editingId;
    els["site-rule-fields"].hidden = false;
    els["file-rule-fields"].hidden = true;
    els["site-host"].value = value.hostPattern;
    els["site-folder"].value = value.folder;
    els["site-folder"].placeholder = Core.suggestFoldersForHost(value.hostPattern)[0] || "Mods/Nexus Mods";
    els["site-source-game"].value = value.sourceGame;
    els["site-extension-mode"].value = value.extensionMode;
    els["site-extensions"].value = value.extensions.join(", ");
    els["site-include-subdomains"].checked = value.includeSubdomains;
    els["site-enabled"].checked = value.enabled;
    els["rule-notes"].value = value.notes;
    els["site-rule-fields"].querySelector(".advanced-fields").open = Boolean(value.sourceGame || value.extensionMode !== "all");
    els["delete-rule"].hidden = !state.editingId;
    els["delete-rule"].textContent = "Delete";
    els["delete-rule"].dataset.confirming = "false";
    els["save-rule"].textContent = "Save Rule";
    setStatus(els["rule-form-status"], "", "");
    updateSiteExtensionField();
    updateRulePreview();
    showDialog();
  }

  function openFileRuleDialog(rule) {
    state.dialogReturnFocus = document.activeElement;
    const value = Core.normalizeFileTypeRule(rule || { enabled: true, name: "", folder: "" });
    state.editingKind = "file";
    state.editingId = rule && rule.id ? rule.id : "";
    els["rule-dialog-title"].textContent = state.editingId ? "Edit File Type Rule" : "New File Type Rule";
    els["rule-dialog-description"].textContent = "Choose which file endings should match and where they should save.";
    els["rule-kind"].value = "file";
    els["rule-id"].value = state.editingId;
    els["site-rule-fields"].hidden = true;
    els["file-rule-fields"].hidden = false;
    els["file-name"].value = value.name === "File type folder" ? "" : value.name;
    els["file-folder"].value = value.folder;
    els["file-extensions"].value = value.extensions.join(", ");
    els["file-mime-patterns"].value = value.mimePatterns.join(", ");
    els["file-enabled"].checked = value.enabled;
    els["rule-notes"].value = value.notes;
    els["file-rule-fields"].querySelector(".advanced-fields").open = Boolean(value.mimePatterns.length);
    els["delete-rule"].hidden = !state.editingId;
    els["delete-rule"].textContent = "Delete";
    els["delete-rule"].dataset.confirming = "false";
    els["save-rule"].textContent = "Save Rule";
    setStatus(els["rule-form-status"], "", "");
    updateRulePreview();
    showDialog();
  }

  function updateSiteExtensionField() {
    const usesExtensions = els["site-extension-mode"].value !== "all";
    els["site-extensions"].disabled = !usesExtensions;
    els["site-extensions"].closest("label").classList.toggle("field-disabled", !usesExtensions);
    updateRulePreview();
  }

  function updateRulePreview() {
    const kind = els["rule-kind"].value;
    const isSiteRule = kind === "site";
    const folderInput = isSiteRule ? els["site-folder"].value : els["file-folder"].value;
    const folderResult = Core.sanitizeDestinationPath(folderInput);
    const fullComputerPath = /^[a-z]:[\\/]/i.test(folderInput.trim()) || folderInput.trim().startsWith("\\\\");
    let source = "Choose what should match";
    let description = "The preview updates while you type.";
    let issue = folderInput.trim() && !folderResult.ok ? folderResult.error : "";

    if (isSiteRule) {
      const rawHost = els["site-host"].value.trim();
      const host = Core.normalizeHostPattern(rawHost);
      const game = Core.normalizeGamePattern(els["site-source-game"].value);
      const extensions = Core.uniqueNormalizedExtensions(els["site-extensions"].value);
      const extensionMode = els["site-extension-mode"].value;
      source = host || rawHost || "Choose a website";
      if (game) {
        source += ` · ${friendlyGameLabel(game)}`;
      }
      if (rawHost && !host) {
        issue = "Enter a normal website address.";
      } else if (extensionMode !== "all" && !extensions.length) {
        issue = "Add at least one file ending for this advanced match.";
      }
      if (extensionMode === "only" && extensions.length) {
        description = `Only ${extensions.map((extension) => `.${extension}`).join(", ")} downloads from this website will use this rule.`;
      } else if (extensionMode === "except" && extensions.length) {
        description = `Downloads from this website will use this rule except ${extensions.map((extension) => `.${extension}`).join(", ")}.`;
      } else if (game) {
        description = `Downloads detected for ${friendlyGameLabel(game)} will use this destination.`;
      } else {
        description = "All downloads from this website will use this destination.";
      }
    } else if (kind === "file") {
      const extensions = Core.uniqueNormalizedExtensions(els["file-extensions"].value);
      const mimePatterns = Core.uniqueMimePatterns(els["file-mime-patterns"].value);
      source = extensions.length
        ? extensions.map((extension) => `.${extension}`).join(", ")
        : mimePatterns.length
          ? mimePatterns.join(", ")
          : "Choose file endings";
      if (!extensions.length && !mimePatterns.length) {
        issue = "Add one or more file endings.";
      }
      const name = els["file-name"].value.trim() || "This file type rule";
      description = `${name} will send matching files to this destination.`;
    }

    els["rule-preview-source"].textContent = source;
    els["rule-preview-folder"].textContent = folderResult.ok && folderResult.value
      ? folderResult.value
      : folderInput.trim() || "Choose a folder";
    els["rule-preview-description"].textContent = issue || description;
    els["rule-preview"].classList.toggle("has-error", Boolean(issue));
    els["rule-preview-mode"].textContent = issue
      ? "Needs attention"
      : fullComputerPath
        ? "Computer helper"
        : "Inside Downloads";
    els["rule-preview-mode"].className = `pill ${issue || fullComputerPath ? "warning" : "success"}`;
  }

  function showDialog() {
    if (typeof els["rule-dialog"].showModal === "function") {
      els["rule-dialog"].showModal();
    } else {
      els["rule-dialog"].setAttribute("open", "");
    }
    requestAnimationFrame(() => {
      const firstField = state.editingKind === "site" ? els["site-host"] : els["file-name"];
      firstField.focus();
      if (state.editingId && typeof firstField.select === "function") {
        firstField.select();
      }
    });
  }

  function closeRuleDialog() {
    els["rule-dialog"].close();
    const returnFocus = state.dialogReturnFocus;
    requestAnimationFrame(() => {
      if (returnFocus && returnFocus.isConnected) {
        returnFocus.focus();
        return;
      }
      const activeTab = document.querySelector('.tab-button[aria-selected="true"]');
      if (activeTab) {
        activeTab.focus();
      }
    });
  }

  async function saveDialogRule(event) {
    event.preventDefault();
    const kind = els["rule-kind"].value;
    const id = els["rule-id"].value;
    els["save-rule"].disabled = true;
    els["save-rule"].textContent = "Saving...";

    try {
      if (kind === "site") {
        const hostPattern = Core.normalizeHostPattern(els["site-host"].value);
        const folderResult = Core.sanitizeDestinationPath(els["site-folder"].value);
        const sourceGame = Core.normalizeGamePattern(els["site-source-game"].value);
        const extensionMode = els["site-extension-mode"].value;
        const extensions = Core.uniqueNormalizedExtensions(els["site-extensions"].value);

        if (!hostPattern) {
          setStatus(els["rule-form-status"], "Enter a website first.", "error");
          return;
        }
        if (!folderResult.ok || !folderResult.value) {
          setStatus(els["rule-form-status"], folderResult.error || "Enter a folder.", "error");
          return;
        }
        if (extensionMode !== "all" && !extensions.length) {
          setStatus(els["rule-form-status"], "Add at least one file ending, or choose All files.", "error");
          return;
        }

        const result = await Store.updateSettings((settings) => {
          const upserted = Core.upsertSiteRule(settings.siteRules, {
            id: id || undefined,
            hostPattern,
            folder: folderResult.value,
            sourceGame,
            includeSubdomains: els["site-include-subdomains"].checked,
            enabled: els["site-enabled"].checked,
            extensionMode,
            extensions,
            notes: els["rule-notes"].value
          });
          settings.siteRules = upserted.rules;
          const previousPrompt = settings.promptHosts[hostPattern];
          const now = new Date().toISOString();
          settings.promptHosts[hostPattern] = {
            state: "saved",
            firstSeenAt: previousPrompt && previousPrompt.firstSeenAt || now,
            lastSeenAt: now,
            lastPromptedAt: previousPrompt && previousPrompt.lastPromptedAt || now
          };
        });
        state.settings = result.settings;
      } else {
        const folderResult = Core.sanitizeDestinationPath(els["file-folder"].value);
        const extensions = Core.uniqueNormalizedExtensions(els["file-extensions"].value);
        const mimePatterns = Core.uniqueMimePatterns(els["file-mime-patterns"].value);

        if (!folderResult.ok || !folderResult.value) {
          setStatus(els["rule-form-status"], folderResult.error || "Enter a folder.", "error");
          return;
        }
        if (!extensions.length && !mimePatterns.length) {
          setStatus(els["rule-form-status"], "Add file endings or an advanced match.", "error");
          return;
        }

        const result = await Store.updateSettings((settings) => {
          const upserted = Core.upsertFileTypeRule(settings.fileTypeRules, {
            id: id || undefined,
            name: els["file-name"].value || "File type folder",
            folder: folderResult.value,
            extensions,
            mimePatterns,
            enabled: els["file-enabled"].checked,
            notes: els["rule-notes"].value
          });
          settings.fileTypeRules = upserted.rules;
        });
        state.settings = result.settings;
      }

      closeRuleDialog();
      render();
      showToast(kind === "site" ? "Website rule saved." : "File type rule saved.", "ok");
    } catch (error) {
      setStatus(els["rule-form-status"], error.message || "Could not save this folder rule.", "error");
    } finally {
      els["save-rule"].disabled = false;
      els["save-rule"].textContent = "Save Rule";
    }
  }

  async function deleteDialogRule() {
    if (!state.editingId || !state.editingKind) {
      return;
    }
    if (els["delete-rule"].dataset.confirming !== "true") {
      els["delete-rule"].dataset.confirming = "true";
      els["delete-rule"].textContent = "Confirm Delete";
      setStatus(els["rule-form-status"], "Click Confirm Delete to remove this rule.", "error");
      return;
    }
    const result = await Store.updateSettings((settings) => {
      if (state.editingKind === "site") {
        settings.siteRules = settings.siteRules.filter((rule) => rule.id !== state.editingId);
      } else {
        settings.fileTypeRules = settings.fileTypeRules.filter((rule) => rule.id !== state.editingId);
      }
    });
    state.settings = result.settings;
    closeRuleDialog();
    render();
    showToast("Rule deleted.", "ok");
  }

  async function toggleRule(kind, id) {
    const result = await Store.updateSettings((settings) => {
      const list = kind === "site" ? settings.siteRules : settings.fileTypeRules;
      const rule = list.find((item) => item.id === id);
      if (rule) {
        rule.enabled = !rule.enabled;
        return rule.enabled;
      }
      return null;
    });
    state.settings = result.settings;
    render();
    if (typeof result.result === "boolean") {
      showToast(result.result ? "Rule activated." : "Rule paused.", "ok");
    }
  }

  async function resetPrompt(host) {
    const result = await Store.updateSettings((settings) => {
      delete settings.promptHosts[host];
    });
    state.settings = result.settings;
    render();
  }

  async function clearPrompts() {
    if (!confirmButtonAction(els["clear-prompts"], "Confirm Reset", "Reset All Answers")) {
      return;
    }
    const result = await Store.updateSettings((settings) => {
      settings.promptHosts = {};
    });
    state.settings = result.settings;
    resetConfirmButton(els["clear-prompts"], "Reset All Answers");
    render();
    showToast("Remembered answers reset.", "ok");
  }

  async function clearHistory() {
    if (!confirmButtonAction(els["clear-history"], "Confirm Clear", "Clear Activity")) {
      return;
    }
    const result = await Store.updateSettings((settings) => {
      settings.recentRoutes = [];
    });
    state.settings = result.settings;
    resetConfirmButton(els["clear-history"], "Clear Activity");
    render();
    showToast("Recent activity cleared.", "ok");
  }

  function confirmButtonAction(button, confirmLabel, resetLabel) {
    if (button.dataset.confirming === "true") {
      return true;
    }
    button.dataset.confirming = "true";
    button.textContent = confirmLabel;
    setTimeout(() => resetConfirmButton(button, resetLabel), 4000);
    return false;
  }

  function resetConfirmButton(button, label) {
    button.dataset.confirming = "false";
    button.textContent = label;
  }

  async function testNativeHost() {
    setStatus(els["native-host-status"], "Checking helper...", "");
    try {
      const response = await sendNativeMessage({ action: "ping" });
      if (response && response.ok) {
        setStatus(els["native-host-status"], "Helper is installed and ready for full folder paths.", "ok");
        await refreshNativeMoveStatus();
      } else {
        setStatus(els["native-host-status"], response && response.error ? response.error : "Helper did not respond correctly.", "error");
      }
    } catch (error) {
      setStatus(els["native-host-status"], `${error.message}. Run native-host\\install-native-host.ps1 after loading the extension.`, "error");
    }
  }

  async function refreshNativeMoveStatus() {
    const status = await sendRuntimeMessage({ action: "getNativeMoveStatus" });
    const count = Number(status && status.pendingCount) || 0;
    const failedCount = Number(status && status.failedCount) || 0;
    els["native-move-summary"].hidden = count === 0;
    els["retry-native-moves"].hidden = count === 0;
    els["native-move-count"].textContent = count === 1 ? "1 pending move" : `${count} pending moves`;
    els["native-move-detail"].textContent = failedCount
      ? `${failedCount} ${failedCount === 1 ? "needs" : "need"} the helper or another retry.`
      : "Waiting for the download to finish.";
  }

  async function retryNativeMoves() {
    els["retry-native-moves"].disabled = true;
    setStatus(els["native-host-status"], "Retrying pending moves...", "");
    try {
      const status = await sendRuntimeMessage({ action: "retryNativeMoves" });
      const remaining = Number(status && status.pendingCount) || 0;
      setStatus(
        els["native-host-status"],
        remaining ? `${remaining} move${remaining === 1 ? " is" : "s are"} still pending.` : "Pending moves finished.",
        remaining ? "error" : "ok"
      );
      await refreshNativeMoveStatus();
    } catch (error) {
      setStatus(els["native-host-status"], error.message || "Could not retry pending moves.", "error");
    } finally {
      els["retry-native-moves"].disabled = false;
    }
  }

  function sendNativeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(Core.NATIVE_HOST_NAME, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.ok === false) {
          reject(new Error(response.error || "The background task could not complete the request."));
          return;
        }
        resolve(response || {});
      });
    });
  }

  function exportSettings() {
    const blob = new Blob([JSON.stringify(state.settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tidy-downloads-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Settings backup downloaded.", "ok");
  }

  async function importSettings(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    try {
      if (file.size > Core.MAX_SETTINGS_IMPORT_BYTES) {
        throw new Error("The backup is larger than 1 MB.");
      }
      const imported = JSON.parse(await file.text());
      const prepared = Core.prepareSettingsImport(imported);
      if (prepared.errors.length) {
        showToast(`Restore blocked: ${prepared.errors[0]}`, "error");
        return;
      }
      openRestoreDialog(file.name, prepared);
    } catch (error) {
      showToast(`Restore failed: ${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  }

  function openRestoreDialog(fileName, prepared) {
    state.pendingImport = prepared;
    const summary = prepared.summary;
    els["restore-file-name"].textContent = fileName || "Tidy Downloads backup";
    els["restore-sorting-status"].textContent = summary.sortingEnabled ? "On" : "Paused";
    els["restore-enabled-rule-count"].textContent = `${summary.enabledRuleCount} enabled (${summary.enabledSiteRuleCount} website, ${summary.enabledFileTypeRuleCount} file type)`;
    els["restore-collision-status"].textContent = {
      uniquify: "Keep both files",
      prompt: "Ask before replacing",
      overwrite: "Replace existing files"
    }[summary.conflictAction] || summary.conflictAction;

    els["restore-path-list"].replaceChildren();
    summary.absoluteDestinations.forEach((folder) => {
      const item = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = folder;
      item.append(code);
      els["restore-path-list"].append(item);
    });
    els["restore-path-section"].hidden = summary.absoluteDestinations.length === 0;

    const hazardMessages = [];
    if (summary.absoluteDestinations.length) {
      hazardMessages.push("move matching files to full paths outside Downloads");
    }
    if (summary.overwriteEnabled) {
      hazardMessages.push("replace existing files that have the same name");
    }
    els["restore-warning-text"].textContent = hazardMessages.length
      ? `This backup can ${hazardMessages.join(" and ")}.`
      : "";
    els["restore-warning"].hidden = !summary.requiresHazardConfirmation;
    els["restore-confirm-line"].hidden = !summary.requiresHazardConfirmation;
    els["restore-confirm-checkbox"].checked = false;
    setStatus(els["restore-status"], "Nothing has been changed yet.", "");
    updateRestoreApplyState();

    if (!els["restore-dialog"].open) {
      els["restore-dialog"].showModal();
    }
  }

  async function applySettingsImport() {
    const prepared = state.pendingImport;
    if (!prepared) {
      return;
    }
    if (prepared.summary.requiresHazardConfirmation && !els["restore-confirm-checkbox"].checked) {
      setStatus(els["restore-status"], "Confirm that you understand these file actions before restoring.", "error");
      return;
    }

    els["apply-restore"].disabled = true;
    setStatus(els["restore-status"], "Restoring settings...", "");
    try {
      const restored = await Store.saveSettings(prepared.settings);
      state.settings = restored;
      closeRestoreDialog();
      render();
      showToast("Settings restored successfully.", "ok");
    } catch (error) {
      setStatus(els["restore-status"], `Restore failed: ${error.message}`, "error");
      updateRestoreApplyState();
    }
  }

  function updateRestoreApplyState() {
    const prepared = state.pendingImport;
    const needsConfirmation = Boolean(prepared && prepared.summary.requiresHazardConfirmation);
    els["apply-restore"].disabled = !prepared || (needsConfirmation && !els["restore-confirm-checkbox"].checked);
  }

  function closeRestoreDialog() {
    if (els["restore-dialog"].open) {
      els["restore-dialog"].close();
    }
    state.pendingImport = null;
    els["restore-confirm-checkbox"].checked = false;
    els["apply-restore"].disabled = true;
    setStatus(els["restore-status"], "", "");
    const returnFocus = state.restoreDialogReturnFocus;
    state.restoreDialogReturnFocus = null;
    if (returnFocus && returnFocus.isConnected) {
      returnFocus.focus();
    }
  }

  function emptyState(title, description, actionLabel, onAction) {
    const element = document.createElement("div");
    element.className = "empty-state";
    const icon = document.createElement("span");
    icon.className = "empty-state-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M3.5 7.5h6l2 2h9v9h-17z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
      </svg>
    `;
    const heading = document.createElement("h3");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = description || "";
    element.append(icon, heading, copy);
    if (actionLabel && typeof onAction === "function") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "primary";
      button.textContent = actionLabel;
      button.addEventListener("click", onAction);
      element.append(button);
    }
    return element;
  }

  function setStatus(element, message, kind) {
    element.textContent = message;
    element.className = `status${kind ? ` ${kind}` : ""}`;
  }

  function showToast(message, kind) {
    clearTimeout(state.toastTimer);
    els["app-toast"].textContent = message;
    els["app-toast"].className = `toast${kind ? ` ${kind}` : ""}`;
    els["app-toast"].hidden = false;
    state.toastTimer = setTimeout(() => {
      els["app-toast"].hidden = true;
    }, kind === "error" ? 6500 : 3600);
  }

  function formatDate(value) {
    if (!value) {
      return "Unknown";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  }

  function promptStateLabel(stateValue) {
    if (stateValue === "saved") {
      return "Folder saved";
    }
    if (stateValue === "ignored") {
      return "Keep normal Downloads folder";
    }
    return "Already asked";
  }

  function routeTypeLabel(type) {
    if (type === "site") {
      return "website";
    }
    if (type === "file-type") {
      return "file type";
    }
    return "default";
  }

  function friendlyGameLabel(value) {
    return Core.friendlyGameName(value) || value || "All site downloads";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
