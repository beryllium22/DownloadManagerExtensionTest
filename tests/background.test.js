const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

require("../src/core.js");
const Core = globalThis.DownloadRouterCore;
const backgroundSource = fs.readFileSync(path.resolve(__dirname, "../background.js"), "utf8");

function createEvent() {
  return { addListener() {} };
}

function createHarness(options) {
  const setup = options || {};
  let settings = Core.normalizeSettings(setup.settings || {});
  let settingsWrites = 0;
  const actions = [];
  const localData = structuredClone(setup.localData || {});
  const nativeMessages = [];
  const erasedDownloads = [];
  const openedWindows = [];

  const Store = {
    async ensureSettings() {
      return structuredClone(settings);
    },
    async getSettings() {
      return structuredClone(settings);
    },
    async updateSettings(mutator) {
      settingsWrites += 1;
      const next = structuredClone(settings);
      const result = await mutator(next);
      settings = Core.normalizeSettings(next);
      return { settings: structuredClone(settings), result };
    }
  };

  function storageGet(keys, callback) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const result = {};
    keyList.forEach((key) => {
      if (Object.hasOwn(localData, key)) {
        result[key] = structuredClone(localData[key]);
      }
    });
    queueMicrotask(() => callback(result));
  }

  function storageSet(value, callback) {
    actions.push("storage-set");
    Object.assign(localData, structuredClone(value));
    queueMicrotask(callback);
  }

  const chrome = {
    contextMenus: {
      onClicked: createEvent(),
      create() {},
      removeAll(callback) { callback(); }
    },
    downloads: {
      onChanged: createEvent(),
      onDeterminingFilename: createEvent(),
      onErased: createEvent(),
      search(query, callback) {
        const respond = () => {
          const item = setup.downloadItems && setup.downloadItems[String(query.id)];
          callback(item ? [structuredClone(item)] : []);
        };
        if (setup.deferSearch && setup.deferSearch(query, respond)) {
          return;
        }
        queueMicrotask(respond);
      },
      erase(query, callback) {
        erasedDownloads.push(query.id);
        queueMicrotask(() => callback([query.id]));
      }
    },
    runtime: {
      lastError: null,
      onInstalled: createEvent(),
      onMessage: createEvent(),
      onStartup: createEvent(),
      getURL(relativePath) {
        return `chrome-extension://test-extension/${relativePath}`;
      },
      sendNativeMessage(_host, message, callback) {
        nativeMessages.push(structuredClone(message));
        queueMicrotask(() => callback(setup.nativeResponse || { ok: true }));
      }
    },
    storage: {
      local: { get: storageGet, set: storageSet }
    },
    tabs: { create() {} },
    windows: {
      async create(details) {
        openedWindows.push(structuredClone(details));
      }
    }
  };

  const context = {
    URL,
    chrome,
    console,
    importScripts() {},
    queueMicrotask,
    setTimeout,
    clearTimeout
  };
  context.self = context;
  context.DownloadRouterCore = Core;
  context.DownloadRouterStorage = Store;
  vm.createContext(context);
  vm.runInContext(backgroundSource, context, { filename: "background.js" });

  return {
    context,
    actions,
    localData,
    nativeMessages,
    erasedDownloads,
    openedWindows,
    get settings() { return structuredClone(settings); },
    get settingsWrites() { return settingsWrites; }
  };
}

function makeDownload(overrides) {
  return Object.assign({
    id: 1,
    filename: "C:\\Users\\Tester\\Downloads\\file.zip",
    finalUrl: "https://example.com/file.zip",
    url: "https://example.com/file.zip",
    referrer: "https://example.com/",
    mime: "application/zip",
    incognito: false,
    state: "complete"
  }, overrides);
}

function siteSettings(folder) {
  return {
    enabled: true,
    askOnFirstDownload: false,
    siteRules: [{
      hostPattern: "example.com",
      includeSubdomains: true,
      folder,
      enabled: true
    }]
  };
}

async function run() {
  const finishedDownload = makeDownload({ id: 10, state: "complete" });
  const normalRelative = createHarness({
    settings: siteSettings("Websites/Example"),
    downloadItems: { "10": finishedDownload }
  });
  const normalRelativeSuggestions = [];
  await normalRelative.context.handleDownload(finishedDownload, (suggestion) => {
    normalRelativeSuggestions.push(suggestion);
  });
  assert.equal(normalRelativeSuggestions[0].filename, "Websites/Example/file.zip");
  assert.equal(normalRelative.settingsWrites, 0, "activity is not written while the download is still being named");
  assert.equal(normalRelative.settings.recentRoutes.length, 0);
  assert.ok(normalRelative.localData.pendingRouteRecords["10"], "a finished download needs a stored route");
  await normalRelative.context.finishDownload(10);
  assert.equal(normalRelative.settings.recentRoutes.length, 1, "normal downloads should update local activity after completion");
  assert.equal(normalRelative.settings.recentRoutes[0].folder, "Websites/Example");
  assert.equal(normalRelative.localData.pendingRouteRecords["10"], undefined);

  const normalPrompt = createHarness({ settings: { enabled: true, askOnFirstDownload: true } });
  await normalPrompt.context.handleDownload(makeDownload({
    id: 11,
    filename: "C:\\Users\\Tester\\Downloads\\file.bin",
    finalUrl: "https://new-site.example/file.bin",
    url: "https://new-site.example/file.bin",
    referrer: "https://new-site.example/",
    mime: "application/octet-stream"
  }), () => {});
  assert.equal(normalPrompt.settingsWrites, 1);
  assert.equal(normalPrompt.openedWindows.length, 1, "normal first-site prompting should remain available");
  assert.equal(normalPrompt.settings.promptHosts["new-site.example"].state, "prompted");

  const privateRelative = createHarness({ settings: siteSettings("Websites/Example") });
  const privateRelativeSuggestions = [];
  await privateRelative.context.handleDownload(makeDownload({ incognito: true }), (suggestion) => {
    privateRelativeSuggestions.push(suggestion);
  });
  assert.equal(privateRelativeSuggestions.length, 1);
  assert.equal(privateRelativeSuggestions[0].filename, "Websites/Example/file.zip");
  assert.equal(privateRelative.settingsWrites, 0, "private routing must not write settings or prompt timestamps");
  assert.equal(privateRelative.openedWindows.length, 0);
  assert.equal(Object.hasOwn(privateRelative.localData, "pendingNativeMoves"), false);

  const privateAbsolute = createHarness({ settings: siteSettings("D:\\Private Downloads") });
  const privateAbsoluteSuggestions = [];
  await privateAbsolute.context.handleDownload(makeDownload({ id: 2, incognito: true }), (suggestion) => {
    privateAbsoluteSuggestions.push(suggestion);
  });
  assert.deepEqual(privateAbsoluteSuggestions, [undefined], "private absolute routes must use the browser's normal destination");
  assert.equal(privateAbsolute.settingsWrites, 0);
  assert.equal(Object.hasOwn(privateAbsolute.localData, "pendingNativeMoves"), false);
  assert.equal(privateAbsolute.nativeMessages.length, 0);

  const normalAbsolute = createHarness({ settings: siteSettings("D:\\Organized") });
  let normalAbsoluteSuggestion;
  await normalAbsolute.context.handleDownload(makeDownload({ id: 3 }), (suggestion) => {
    normalAbsolute.actions.push("suggest");
    normalAbsoluteSuggestion = suggestion;
  });
  assert.equal(normalAbsoluteSuggestion.filename, "Tidy Downloads Staging/file.zip");
  assert.equal(normalAbsolute.localData.pendingNativeMoves["3"].targetFolder, "D:\\Organized");
  assert.ok(
    normalAbsolute.actions.indexOf("storage-set") < normalAbsolute.actions.indexOf("suggest"),
    "normal native moves must be persisted before staging is suggested"
  );

  const oldPrivatePending = createHarness({
    settings: siteSettings("D:\\Organized"),
    localData: {
      pendingNativeMoves: {
        "4": { targetFolder: "D:\\Organized", conflictAction: "uniquify", attempts: 0 }
      }
    },
    downloadItems: {
      "4": makeDownload({ id: 4, incognito: true })
    }
  });
  await oldPrivatePending.context.completeNativeMove(4);
  assert.deepEqual(oldPrivatePending.localData.pendingNativeMoves, {});
  assert.equal(oldPrivatePending.nativeMessages.length, 0, "old private pending records must never reach the native helper");

  const recoveredPrivatePending = createHarness({
    settings: siteSettings("D:\\Organized"),
    localData: {
      pendingNativeMoves: {
        "5": { targetFolder: "D:\\Organized", conflictAction: "uniquify", attempts: 0 }
      }
    },
    downloadItems: {
      "5": makeDownload({ id: 5, incognito: true })
    }
  });
  await recoveredPrivatePending.context.recoverPendingNativeMoves();
  assert.deepEqual(recoveredPrivatePending.localData.pendingNativeMoves, {});
  assert.equal(recoveredPrivatePending.nativeMessages.length, 0);

  const failedNormalMove = createHarness({
    settings: siteSettings("D:\\Organized"),
    localData: {
      pendingNativeMoves: {
        "6": { targetFolder: "D:\\Organized", conflictAction: "uniquify", attempts: 0, lastError: "" }
      }
    },
    downloadItems: {
      "6": makeDownload({
        id: 6,
        filename: "C:\\Users\\Tester\\Downloads\\Tidy Downloads Staging\\file.zip"
      })
    },
    nativeResponse: { ok: false, error: "Helper unavailable" }
  });
  await assert.rejects(() => failedNormalMove.context.completeNativeMove(6), /Helper unavailable/);
  assert.equal(failedNormalMove.localData.pendingNativeMoves["6"].attempts, 1);
  assert.match(failedNormalMove.localData.pendingNativeMoves["6"].lastError, /Helper unavailable/);

  const presetPrompt = createHarness({
    settings: {
      enabled: true,
      askOnFirstDownload: true,
      askOnlyWhenNoRuleMatches: true,
      fileTypeRules: Core.PRESET_FILE_TYPE_RULES
    }
  });
  await presetPrompt.context.handleDownload(makeDownload({
    id: 14,
    filename: "SkyUI.7z",
    finalUrl: "https://files.nexusmods.com/cdn/SkyUI.7z",
    url: "https://files.nexusmods.com/cdn/SkyUI.7z",
    referrer: "https://www.nexusmods.com/",
    mime: "application/zip"
  }), () => {});
  assert.equal(presetPrompt.openedWindows.length, 1, "suggested archive folders should still ask about a new website");
  assert.equal(presetPrompt.settings.recentRoutes.length, 0);

  const interrupted = createHarness({ settings: siteSettings("D:\\Organized") });
  await interrupted.context.handleDownload(makeDownload({ id: 12, state: "in_progress" }), () => {});
  assert.ok(interrupted.localData.pendingNativeMoves["12"]);
  assert.ok(interrupted.localData.pendingRouteRecords["12"]);
  await interrupted.context.discardDownloadBookkeeping(12);
  assert.equal(interrupted.localData.pendingNativeMoves["12"], undefined);
  assert.equal(interrupted.localData.pendingRouteRecords["12"], undefined);
  assert.equal(interrupted.settings.recentRoutes.length, 0);

  const moved = createHarness({
    settings: siteSettings("D:\\Organized"),
    downloadItems: {
      "13": makeDownload({
        id: 13,
        filename: "C:\\Users\\Tester\\Downloads\\Tidy Downloads Staging\\file.zip",
        state: "complete"
      })
    },
    nativeResponse: { ok: true, path: "D:\\Organized\\file (1).zip" }
  });
  await moved.context.handleDownload(makeDownload({ id: 13 }), () => {});
  assert.equal(moved.settings.recentRoutes.length, 0);
  await moved.context.completeNativeMove(13);
  assert.equal(moved.settings.recentRoutes.length, 1);
  assert.equal(moved.settings.recentRoutes[0].originalFilename, "file (1).zip");
  assert.equal(moved.settings.recentRoutes[0].folder, "D:\\Organized");
  assert.equal(moved.localData.pendingNativeMoves["13"], undefined);
  assert.equal(moved.localData.pendingRouteRecords["13"], undefined);

  const overwriteStaging = createHarness({
    settings: Object.assign(siteSettings("D:\\Organized"), { conflictAction: "overwrite" })
  });
  let overwriteSuggestion;
  await overwriteStaging.context.handleDownload(makeDownload({ id: 30 }), (suggestion) => {
    overwriteSuggestion = suggestion;
  });
  assert.equal(overwriteSuggestion.conflictAction, "uniquify", "staging must not replace a file that is still waiting to move");
  assert.equal(overwriteStaging.localData.pendingNativeMoves["30"].conflictAction, "overwrite");

  const overwriteRelative = createHarness({
    settings: Object.assign(siteSettings("Websites/Example"), { conflictAction: "overwrite", askOnFirstDownload: false })
  });
  let relativeSuggestion;
  await overwriteRelative.context.handleDownload(makeDownload({ id: 31 }), (suggestion) => {
    relativeSuggestion = suggestion;
  });
  assert.equal(relativeSuggestion.conflictAction, "overwrite");

  const unstaged = createHarness({
    settings: siteSettings("D:\\Organized"),
    localData: {
      pendingNativeMoves: {
        "32": { targetFolder: "D:\\Organized", conflictAction: "overwrite", attempts: 0, lastError: "" }
      }
    },
    downloadItems: {
      "32": makeDownload({ id: 32, filename: "C:\\Users\\Tester\\Downloads\\file.zip" })
    }
  });
  await unstaged.context.completeNativeMove(32);
  assert.equal(unstaged.nativeMessages.length, 0, "a file outside staging must not be sent to the helper");
  assert.equal(unstaged.localData.pendingNativeMoves["32"], undefined);

  const raced = createHarness({
    settings: siteSettings("D:\\Organized"),
    localData: {
      pendingNativeMoves: {
        "33": { targetFolder: "D:\\Organized", conflictAction: "uniquify", attempts: 0, lastError: "" }
      }
    },
    downloadItems: {
      "33": makeDownload({
        id: 33,
        filename: "C:\\Users\\Tester\\Downloads\\Tidy Downloads Staging\\file.zip"
      })
    },
    nativeResponse: { ok: true, path: "D:\\Organized\\file.zip" }
  });
  await Promise.all([
    raced.context.completeNativeMove(33),
    raced.context.completeNativeMove(33)
  ]);
  assert.equal(raced.nativeMessages.length, 1, "one download must not be moved twice");

  const earlyItem = makeDownload({
    id: 35,
    state: "in_progress",
    filename: "C:\\Users\\Tester\\Downloads\\Tidy Downloads Staging\\file.zip"
  });
  const deferredSearches = [];
  const earlyComplete = createHarness({
    settings: siteSettings("D:\\Organized"),
    localData: {
      pendingNativeMoves: {
        "35": { targetFolder: "D:\\Organized", conflictAction: "uniquify", attempts: 0, lastError: "" }
      }
    },
    downloadItems: { "35": earlyItem },
    nativeResponse: { ok: true, path: "D:\\Organized\\file.zip" },
    deferSearch(_query, respond) {
      if (deferredSearches.length === 0) {
        deferredSearches.push(respond);
        return true;
      }
      return false;
    }
  });
  const earlyCheck = earlyComplete.context.completeNativeMove(35);
  for (let step = 0; step < 8 && deferredSearches.length === 0; step += 1) {
    await Promise.resolve();
  }
  assert.equal(deferredSearches.length, 1);
  const finishedCheck = earlyComplete.context.completeNativeMove(35);
  deferredSearches[0]();
  earlyItem.state = "complete";
  await earlyCheck;
  await finishedCheck;
  assert.equal(earlyComplete.nativeMessages.length, 1, "a completion that arrives during an earlier check still moves once");

  assert.doesNotMatch(backgroundSource, /^await\b/m, "listeners have to be registered before the service worker awaits");
  const startupBlock = backgroundSource.slice(
    backgroundSource.indexOf("chrome.runtime.onStartup.addListener"),
    backgroundSource.indexOf("function installContextMenus")
  );
  assert.match(startupBlock, /ensureSettings/);
  assert.match(startupBlock, /recoverPendingNativeMoves/);

  console.log("background privacy and native-move tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
