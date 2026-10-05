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
        const item = setup.downloadItems && setup.downloadItems[String(query.id)];
        queueMicrotask(() => callback(item ? [structuredClone(item)] : []));
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
  const normalRelative = createHarness({ settings: siteSettings("Websites/Example") });
  const normalRelativeSuggestions = [];
  await normalRelative.context.handleDownload(makeDownload({ id: 10 }), (suggestion) => {
    normalRelativeSuggestions.push(suggestion);
  });
  assert.equal(normalRelativeSuggestions[0].filename, "Websites/Example/file.zip");
  assert.equal(normalRelative.settingsWrites, 1);
  assert.equal(normalRelative.settings.recentRoutes.length, 1, "normal downloads should still update local activity");

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
      "6": makeDownload({ id: 6 })
    },
    nativeResponse: { ok: false, error: "Helper unavailable" }
  });
  await assert.rejects(() => failedNormalMove.context.completeNativeMove(6), /Helper unavailable/);
  assert.equal(failedNormalMove.localData.pendingNativeMoves["6"].attempts, 1);
  assert.match(failedNormalMove.localData.pendingNativeMoves["6"].lastError, /Helper unavailable/);

  console.log("background privacy and native-move tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
