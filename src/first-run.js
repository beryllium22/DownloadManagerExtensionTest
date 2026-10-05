(function firstRunPrompt() {
  "use strict";

  const Core = window.DownloadRouterCore;
  const Store = window.DownloadRouterStorage;
  const params = new URLSearchParams(window.location.search);
  const host = Core.normalizeHostPattern(params.get("host"));
  const filename = params.get("filename") || "download";
  const extension = Core.uniqueNormalizedExtensions(params.get("extension"))[0] || "";
  const sourceContext = {
    host,
    siteName: host || "",
    sourceName: params.get("source") || "",
    gameSlug: Core.normalizeGamePattern(params.get("gameSlug")),
    gameName: params.get("gameName") || Core.friendlyGameName(params.get("gameSlug"))
  };
  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindElements();
    render();
    bindEvents();
  }

  function bindElements() {
    [
      "prompt-host",
      "site-prompt-form",
      "site-host",
      "site-folder",
      "site-folder-suggestions",
      "site-subdomains",
      "save-site-rule",
      "site-status",
      "file-type-section",
      "file-type-choice-label",
      "type-prompt-form",
      "type-extension",
      "type-folder",
      "type-folder-suggestions",
      "save-file-rule",
      "type-status",
      "prompt-filename",
      "keep-default",
      "open-settings"
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els["site-prompt-form"].addEventListener("submit", saveSiteRule);
    els["type-prompt-form"].addEventListener("submit", saveFileTypeRule);
    els["keep-default"].addEventListener("click", keepDefault);
    els["open-settings"].addEventListener("click", openSettings);
  }

  function render() {
    const sourceDetails = sourceContext.gameName
      ? `${host || "Unknown website"} / ${sourceContext.gameName}`
      : host || "Unknown website";
    els["prompt-host"].textContent = sourceDetails;
    els["site-host"].value = host;
    els["prompt-filename"].textContent = filename;
    els["type-extension"].value = extension;
    els["file-type-choice-label"].textContent = extension
      ? `Organize every .${extension} file instead`
      : "Organize every file of this type instead";
    const siteSuggestions = Core.suggestFoldersForHost(host, sourceContext);
    const typeSuggestions = Core.suggestFoldersForExtension(extension);
    if (siteSuggestions[0]) {
      els["site-folder"].value = siteSuggestions[0];
    }
    if (typeSuggestions[0]) {
      els["type-folder"].value = typeSuggestions[0];
    }
    renderSuggestions(els["site-folder-suggestions"], siteSuggestions, els["site-folder"]);
    renderSuggestions(els["type-folder-suggestions"], typeSuggestions, els["type-folder"]);

    if (!extension) {
      els["file-type-section"].hidden = true;
    }
  }

  function renderSuggestions(container, suggestions, input) {
    container.replaceChildren();
    suggestions.slice(0, 3).forEach((folder) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion-chip";
      button.textContent = folder;
      button.addEventListener("click", () => {
        input.value = folder;
      });
      container.append(button);
    });
  }

  async function saveSiteRule(event) {
    event.preventDefault();
    const folderResult = Core.sanitizeDestinationPath(els["site-folder"].value);

    if (!host) {
      setStatus(els["site-status"], "No website was available for this download.", "error");
      return;
    }
    if (!folderResult.ok || !folderResult.value) {
      setStatus(els["site-status"], folderResult.error || "Enter a folder.", "error");
      return;
    }

    els["save-site-rule"].disabled = true;
    els["save-site-rule"].textContent = "Saving...";
    try {
      await Store.updateSettings((settings) => {
        const upserted = Core.upsertSiteRule(settings.siteRules, {
          hostPattern: host,
          includeSubdomains: els["site-subdomains"].checked,
          folder: folderResult.value,
          enabled: true,
          sourceGame: "",
          extensionMode: "all",
          extensions: []
        });
        settings.siteRules = upserted.rules;
        markHost(settings, "saved");
      });

      setStatus(els["site-status"], "Folder saved. You're all set.", "ok");
      setTimeout(() => window.close(), 650);
    } catch (error) {
      setStatus(els["site-status"], error.message || "Could not save this website folder.", "error");
      els["save-site-rule"].disabled = false;
      els["save-site-rule"].textContent = "Use This Folder";
    }
  }

  async function saveFileTypeRule(event) {
    event.preventDefault();
    const extensions = Core.uniqueNormalizedExtensions(els["type-extension"].value);
    const folderResult = Core.sanitizeDestinationPath(els["type-folder"].value);

    if (!extensions.length) {
      setStatus(els["type-status"], "Enter a file ending such as mp4.", "error");
      return;
    }
    if (!folderResult.ok || !folderResult.value) {
      setStatus(els["type-status"], folderResult.error || "Enter a folder.", "error");
      return;
    }

    els["save-file-rule"].disabled = true;
    els["save-file-rule"].textContent = "Saving...";
    try {
      await Store.updateSettings((settings) => {
        const upserted = Core.upsertFileTypeRule(settings.fileTypeRules, {
          name: `.${extensions.join(", .")}`,
          extensions,
          folder: folderResult.value,
          enabled: true
        });
        settings.fileTypeRules = upserted.rules;
        if (host) {
          markHost(settings, "ignored");
        }
      });

      setStatus(els["type-status"], "File type folder saved. You're all set.", "ok");
      setTimeout(() => window.close(), 650);
    } catch (error) {
      setStatus(els["type-status"], error.message || "Could not save this file type folder.", "error");
      els["save-file-rule"].disabled = false;
      els["save-file-rule"].textContent = "Use This Folder For This File Type";
    }
  }

  async function keepDefault() {
    els["keep-default"].disabled = true;
    els["keep-default"].textContent = "Saving...";
    try {
      if (host) {
        await Store.updateSettings((settings) => {
          markHost(settings, "ignored");
        });
      }
      window.close();
    } catch (error) {
      setStatus(els["site-status"], error.message || "Could not remember this choice.", "error");
      els["keep-default"].disabled = false;
      els["keep-default"].textContent = "Not Now";
    }
  }

  function openSettings() {
    const url = new URL(chrome.runtime.getURL("options.html"));
    if (host) {
      url.searchParams.set("host", host);
      url.hash = "site-rules";
    }
    chrome.tabs.create({ url: url.toString() });
    window.close();
  }

  function markHost(settings, state) {
    settings.promptHosts[host] = {
      state,
      firstSeenAt: settings.promptHosts[host] && settings.promptHosts[host].firstSeenAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      lastPromptedAt: settings.promptHosts[host] && settings.promptHosts[host].lastPromptedAt || new Date().toISOString()
    };
  }

  function setStatus(element, message, kind) {
    element.textContent = message;
    element.className = `status ${kind}`;
  }
})();
