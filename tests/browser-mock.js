(function installBrowserMock(globalScope) {
  "use strict";

  if (globalScope.chrome && globalScope.chrome.storage && globalScope.chrome.storage.local) {
    return;
  }

  const now = new Date().toISOString();
  const previewScenario = new URLSearchParams(globalScope.location.search).get("preview") || "sample";
  const localData = {
    settings: {
      version: 2,
      enabled: true,
      askOnFirstDownload: true,
      askOnlyWhenNoRuleMatches: true,
      keepHistory: true,
      historyLimit: 80,
      routePriority: "site-first",
      conflictAction: "uniquify",
      siteRules: [
        {
          id: "preview-site-skyrim",
          enabled: true,
          hostPattern: "nexusmods.com",
          includeSubdomains: true,
          sourceGame: "skyrimspecialedition",
          folder: "Mods/Nexus Mods/{game}",
          extensionMode: "all",
          extensions: [],
          notes: "Keep each game's mods together."
        }
      ],
      fileTypeRules: [
        {
          id: "preview-type-video",
          enabled: true,
          name: "Videos",
          folder: "Media/Videos",
          extensions: ["mp4", "mkv", "webm"],
          mimePatterns: ["video/*"],
          notes: ""
        },
        {
          id: "preview-type-archives",
          enabled: true,
          name: "Compressed files",
          folder: "Compressed Files",
          extensions: ["zip", "7z", "rar"],
          mimePatterns: ["application/zip"],
          notes: ""
        }
      ],
      promptHosts: {
        "example.com": {
          state: "ignored",
          firstSeenAt: now,
          lastSeenAt: now,
          lastPromptedAt: now
        }
      },
      recentRoutes: [
        {
          id: "preview-recent",
          at: now,
          host: "nexusmods.com",
          sourceName: "Nexus Mods",
          gameName: "Skyrim Special Edition",
          gameSlug: "skyrimspecialedition",
          originalFilename: "skyui.7z",
          extension: "7z",
          folder: "Mods/Nexus Mods/Skyrim Special Edition",
          ruleType: "site",
          ruleName: "nexusmods.com / Skyrim Special Edition"
        }
      ]
    }
  };

  if (previewScenario === "fresh") {
    localData.settings.siteRules = [];
    localData.settings.fileTypeRules = [];
    localData.settings.promptHosts = {};
    localData.settings.recentRoutes = [];
  } else if (previewScenario === "paused") {
    localData.settings.enabled = false;
  } else if (previewScenario === "history-off") {
    localData.settings.keepHistory = false;
    localData.settings.recentRoutes = [];
  }

  function selectKeys(keys) {
    if (keys === null || keys === undefined) {
      return structuredClone(localData);
    }
    const keyList = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const result = {};
    keyList.forEach((key) => {
      if (Object.hasOwn(localData, key)) {
        result[key] = structuredClone(localData[key]);
      }
    });
    return result;
  }

  globalScope.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return new URL(path, `${globalScope.location.origin}/`).toString();
      },
      sendMessage(message, callback) {
        const response = message && message.action === "getNativeMoveStatus"
          ? previewScenario === "fresh"
            ? { ok: true, pendingCount: 0, failedCount: 0 }
            : { ok: true, pendingCount: 1, failedCount: 1 }
          : { ok: true, pendingCount: 0, failedCount: 0 };
        queueMicrotask(() => callback(response));
      },
      sendNativeMessage(_name, _message, callback) {
        queueMicrotask(() => callback({ ok: true }));
      }
    },
    storage: {
      local: {
        get(keys, callback) {
          queueMicrotask(() => callback(selectKeys(keys)));
        },
        set(value, callback) {
          Object.assign(localData, structuredClone(value));
          queueMicrotask(callback);
        }
      }
    },
    tabs: {
      async query() {
        return previewScenario === "no-site"
          ? [{ url: "chrome://extensions" }]
          : [{ url: "https://www.nexusmods.com/skyrimspecialedition/mods/12604" }];
      },
      create() {}
    }
  };
})(globalThis);
