(function popup() {
  "use strict";

  const Core = window.DownloadRouterCore;
  const Store = window.DownloadRouterStorage;
  const els = {};
  let settings = Core.defaultSettings();
  let currentHost = "";
  let currentSourceContext = null;
  let currentDownloadItem = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindElements();
    bindEvents();
    try {
      settings = await Store.ensureSettings();
      const currentTabContext = await getCurrentTabContext();
      currentHost = currentTabContext.host;
      currentSourceContext = currentTabContext.sourceContext;
      currentDownloadItem = currentTabContext.downloadItem;
      render();
    } catch (error) {
      els["popup-route-label"].textContent = "Needs attention";
      els["popup-route-label"].className = "pill warning";
      els["popup-current-route"].textContent = "Tidy Downloads could not read this tab or its saved settings.";
      setStatus(error.message || "Open settings and try again.", "error");
    }
  }

  function bindElements() {
    [
      "popup-host",
      "popup-enabled",
      "popup-enabled-copy",
      "popup-route-summary",
      "popup-route-label",
      "popup-current-route",
      "popup-site-editor",
      "popup-editor-title",
      "popup-editor-description",
      "popup-site-form",
      "popup-site-host",
      "popup-site-host-display",
      "popup-site-folder",
      "popup-folder-suggestions",
      "popup-site-subdomains",
      "popup-save-site",
      "popup-status",
      "open-options"
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els["popup-enabled"].addEventListener("change", async () => {
      try {
        const result = await Store.updateSettings((value) => {
          value.enabled = els["popup-enabled"].checked;
        });
        settings = result.settings;
        setStatus(settings.enabled ? "Automatic sorting is on." : "Automatic sorting is paused.", "ok");
        render();
      } catch (error) {
        els["popup-enabled"].checked = settings.enabled;
        setStatus(error.message || "Could not update automatic sorting.", "error");
      }
    });

    els["popup-site-form"].addEventListener("submit", saveCurrentSiteRule);
    els["popup-site-host"].addEventListener("blur", () => {
      if (!els["popup-site-folder"].value.trim()) {
        const [suggestedFolder] = Core.suggestFoldersForHost(els["popup-site-host"].value, currentSourceContext);
        if (suggestedFolder) {
          els["popup-site-folder"].value = suggestedFolder;
        }
      }
      renderFolderSuggestions();
    });
    els["open-options"].addEventListener("click", openOptions);
  }

  async function getCurrentTabContext() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.url) {
      return { host: "", sourceContext: null, downloadItem: null };
    }
    const downloadLike = { url: tab.url, referrer: tab.url, finalUrl: tab.url };
    return {
      host: Core.getDownloadHost(downloadLike),
      sourceContext: Core.getDownloadSourceContext(downloadLike),
      downloadItem: downloadLike
    };
  }

  function render() {
    settings = Core.normalizeSettings(settings);
    els["popup-enabled"].checked = settings.enabled;
    els["popup-enabled-copy"].textContent = settings.enabled ? "On" : "Paused";
    els["popup-host"].textContent = currentHost || "No website available";
    els["popup-site-host"].value = currentHost;
    els["popup-site-host-display"].textContent = currentHost || "Unavailable";
    els["popup-route-summary"].className = "route-summary";
    els["popup-site-editor"].hidden = !currentHost;

    const matchingSiteRule = currentHost
      ? Core.findMatchingSiteRule(settings, currentDownloadItem)
      : null;
    const genericSiteRule = currentHost
      ? settings.siteRules.find((rule) => {
        return Core.normalizeHostPattern(rule.hostPattern) === currentHost
          && !rule.sourceGame
          && rule.extensionMode === "all";
      })
      : null;

    if (genericSiteRule) {
      els["popup-site-folder"].value = genericSiteRule.folder;
      els["popup-site-subdomains"].checked = genericSiteRule.includeSubdomains;
      els["popup-save-site"].textContent = "Update Website Folder";
      els["popup-editor-title"].textContent = "Edit this website folder";
      els["popup-editor-description"].textContent = genericSiteRule.folder;
    } else {
      els["popup-save-site"].textContent = "Save Website Folder";
      els["popup-editor-title"].textContent = matchingSiteRule
        ? "Add a general website folder"
        : "Choose a website folder";
      els["popup-editor-description"].textContent = matchingSiteRule
        ? `Create a fallback for other downloads from ${currentHost}.`
        : "Keep future downloads from this site together.";
    }
    renderFolderSuggestions();

    if (!els["popup-site-editor"].dataset.initialized) {
      els["popup-site-editor"].open = Boolean(currentHost && !matchingSiteRule);
      els["popup-site-editor"].dataset.initialized = "true";
    }

    if (!currentHost) {
      els["popup-route-label"].textContent = "No site";
      els["popup-route-label"].className = "pill warning";
      els["popup-route-summary"].classList.add("is-unavailable");
      els["popup-current-route"].textContent = "Open a normal website tab to see its destination.";
    } else if (!settings.enabled) {
      els["popup-route-label"].textContent = "Paused";
      els["popup-route-label"].className = "pill warning";
      els["popup-route-summary"].classList.add("is-paused");
      els["popup-current-route"].textContent = "Normal Downloads folder while sorting is paused";
    } else if (matchingSiteRule) {
      els["popup-route-label"].textContent = matchingSiteRule.sourceGame ? "Game rule" : "Website rule";
      els["popup-route-label"].className = "pill success";
      const strong = document.createElement("strong");
      strong.textContent = Core.resolveFolderTemplate(matchingSiteRule.folder, currentSourceContext);
      els["popup-current-route"].replaceChildren(strong);
    } else {
      if (!els["popup-site-folder"].value.trim()) {
        const [suggestedFolder] = Core.suggestFoldersForHost(currentHost, currentSourceContext);
        if (suggestedFolder) {
          els["popup-site-folder"].value = suggestedFolder;
        }
      }
      els["popup-route-label"].textContent = "Normal";
      els["popup-route-label"].className = "pill";
      els["popup-route-summary"].classList.add("is-normal");
      els["popup-current-route"].textContent = "File type rule or normal Downloads folder";
    }

    [els["popup-site-host"], els["popup-site-folder"], els["popup-site-subdomains"], els["popup-save-site"]]
      .forEach((element) => {
        element.disabled = !currentHost;
      });
  }

  function renderFolderSuggestions() {
    els["popup-folder-suggestions"].replaceChildren();
    const host = Core.normalizeHostPattern(els["popup-site-host"].value || currentHost);
    if (!host) {
      return;
    }
    const suggestions = Core.suggestFoldersForHost(host, currentSourceContext);

    suggestions.slice(0, 3).forEach((folder) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion-chip";
      button.textContent = folder;
      button.addEventListener("click", () => {
        els["popup-site-folder"].value = folder;
      });
      els["popup-folder-suggestions"].append(button);
    });
  }

  async function saveCurrentSiteRule(event) {
    event.preventDefault();
    const hostPattern = Core.normalizeHostPattern(els["popup-site-host"].value);
    const folderResult = Core.sanitizeDestinationPath(els["popup-site-folder"].value);

    if (!hostPattern) {
      setStatus("Enter a website first.", "error");
      return;
    }
    if (!folderResult.ok || !folderResult.value) {
      setStatus(folderResult.error || "Enter a folder.", "error");
      return;
    }

    els["popup-save-site"].disabled = true;
    try {
      const result = await Store.updateSettings((value) => {
        const upserted = Core.upsertSiteRule(value.siteRules, {
          enabled: true,
          hostPattern,
          folder: folderResult.value,
          includeSubdomains: els["popup-site-subdomains"].checked,
          sourceGame: "",
          extensionMode: "all",
          extensions: []
        });
        value.siteRules = upserted.rules;

        const previousPrompt = value.promptHosts[hostPattern];
        const now = new Date().toISOString();
        value.promptHosts[hostPattern] = {
          state: "saved",
          firstSeenAt: previousPrompt && previousPrompt.firstSeenAt || now,
          lastSeenAt: now,
          lastPromptedAt: previousPrompt && previousPrompt.lastPromptedAt || now
        };
      });

      settings = result.settings;
      currentHost = hostPattern;
      setStatus("Website folder saved.", "ok");
      els["popup-site-editor"].open = false;
      render();
    } catch (error) {
      setStatus(error.message || "Could not save this website folder.", "error");
    } finally {
      els["popup-save-site"].disabled = !currentHost;
    }
  }

  function openOptions() {
    const url = new URL(chrome.runtime.getURL("options.html"));
    chrome.tabs.create({ url: url.toString() });
    window.close();
  }

  function setStatus(message, kind) {
    els["popup-status"].textContent = message;
    els["popup-status"].className = `status ${kind}`;
  }

})();
