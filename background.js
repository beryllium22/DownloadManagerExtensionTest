importScripts("src/core.js", "src/storage.js");

const Core = self.DownloadRouterCore;
const Store = self.DownloadRouterStorage;
const PENDING_NATIVE_MOVES_KEY = "pendingNativeMoves";
const PENDING_ROUTE_RECORDS_KEY = "pendingRouteRecords";
let pendingMoveQueue = Promise.resolve();
let recoveryPromise = null;

chrome.runtime.onInstalled.addListener(() => {
  Store.ensureSettings().catch((error) => console.error("Tidy Downloads setup failed", error));
  installContextMenus();
  recoverPendingNativeMoves().catch((error) => console.error("Tidy Downloads recovery failed", error));
});

chrome.runtime.onStartup.addListener(() => {
  installContextMenus();
  recoverPendingNativeMoves().catch((error) => console.error("Tidy Downloads recovery failed", error));
});

function installContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "download-router-add-site",
      title: "Save downloads from this site to a folder",
      contexts: ["page", "link", "video", "audio", "image"]
    });
  });
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== "download-router-add-site") {
    return;
  }

  const sourceUrl = info.linkUrl || info.srcUrl || info.pageUrl || "";
  const host = Core.getDownloadHost({ url: sourceUrl });
  const optionsUrl = new URL(chrome.runtime.getURL("options.html"));
  if (host) {
    optionsUrl.searchParams.set("host", host);
    optionsUrl.hash = "site-rules";
  }

  chrome.tabs.create({ url: optionsUrl.toString() });
});

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  handleDownload(downloadItem, suggest);
  return true;
});

async function handleDownload(downloadItem, suggest) {
  let didSuggest = false;

  try {
    const settings = await Store.getSettings();
    const route = Core.computeRoute(settings, downloadItem);
    if (route.requiresNativeMove && (downloadItem.incognito || downloadItem.id === undefined)) {
      // Native moves need persistent bookkeeping. Never create that state for a
      // private download, and do not stage a file we cannot associate with an ID.
      suggest();
      return;
    }
    if (!downloadItem.incognito && downloadItem.id !== undefined) {
      // Keep this before suggest(). A tiny file can finish before a record
      // written afterwards would be visible to the completion listener.
      await rememberRouteRecord(downloadItem, route);
    }
    if (route.requiresNativeMove) {
      await rememberPendingNativeMove(downloadItem.id, route, settings);
    }

    if (route.routed && route.suggestionFilename) {
      suggest({
        filename: route.suggestionFilename,
        conflictAction: settings.conflictAction
      });
    } else {
      suggest();
    }
    didSuggest = true;

    await rememberDownloadAndPrompt(downloadItem, route);
  } catch (error) {
    console.error("Tidy Downloads could not sort download", error);
    if (!didSuggest) {
      suggest();
    }
  }
}

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta || !delta.state || delta.id === undefined) {
    return;
  }
  if (delta.state.current === "complete") {
    finishDownload(delta.id).catch((error) => console.error("Tidy Downloads could not finish a download", error));
  } else if (delta.state.current === "interrupted") {
    discardDownloadBookkeeping(delta.id).catch((error) => console.error("Tidy Downloads could not clear an interrupted download", error));
  }
});

chrome.downloads.onErased.addListener((downloadId) => {
  discardDownloadBookkeeping(downloadId).catch((error) => console.error("Tidy Downloads could not clear download bookkeeping", error));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !["getNativeMoveStatus", "retryNativeMoves"].includes(message.action)) {
    return false;
  }

  const operation = message.action === "retryNativeMoves"
    ? recoverPendingNativeMoves()
    : getNativeMoveStatus();
  operation
    .then((status) => sendResponse(Object.assign({ ok: true }, status)))
    .catch((error) => sendResponse({ ok: false, error: error.message || "Native move request failed." }));
  return true;
});

async function rememberDownloadAndPrompt(downloadItem, route) {
  // Keep the entire settings write path out of private browsing. Skipping only
  // the activity entry is not enough: prompt timestamps and normalization can
  // also turn a private download into persistent state.
  if (downloadItem.incognito) {
    return;
  }

  let promptHost = "";
  const current = await Store.getSettings();
  const preview = Core.shouldPromptForRoute(current, downloadItem, route);
  const hostKnown = Boolean(preview.host && current.promptHosts[preview.host]);
  if (!preview.shouldPrompt && !hostKnown) {
    return;
  }

  await Store.updateSettings((settings) => {
    const prompt = Core.shouldPromptForRoute(settings, downloadItem, route);
    if (prompt.shouldPrompt) {
      promptHost = prompt.host;
      const now = new Date().toISOString();
      settings.promptHosts[prompt.host] = {
        state: "prompted",
        firstSeenAt: now,
        lastSeenAt: now,
        lastPromptedAt: now
      };
    } else if (prompt.host && settings.promptHosts[prompt.host]) {
      settings.promptHosts[prompt.host].lastSeenAt = new Date().toISOString();
    }
  });

  if (promptHost) {
    await openFirstSitePrompt(promptHost, downloadItem, route);
  }
}

async function openFirstSitePrompt(host, downloadItem, route) {
  const url = new URL(chrome.runtime.getURL("first-run.html"));
  const sourceContext = Core.getDownloadSourceContext(downloadItem);
  url.searchParams.set("host", host);
  url.searchParams.set("filename", Core.sanitizeFilename(downloadItem.filename, downloadItem.finalUrl || downloadItem.url));
  url.searchParams.set("extension", Core.getPrimaryExtension(downloadItem.filename, downloadItem.finalUrl || downloadItem.url));
  if (sourceContext.sourceName) {
    url.searchParams.set("source", sourceContext.sourceName);
  }
  if (sourceContext.gameSlug) {
    url.searchParams.set("gameSlug", sourceContext.gameSlug);
  }
  if (sourceContext.gameName) {
    url.searchParams.set("gameName", sourceContext.gameName);
  }
  if (route && route.routed) {
    url.searchParams.set("routed", route.folder);
  }

  try {
    await chrome.windows.create({
      url: url.toString(),
      type: "popup",
      width: 500,
      height: 720,
      focused: true
    });
  } catch (error) {
    console.error("Tidy Downloads could not open first-site prompt", error);
  }
}

async function rememberPendingNativeMove(downloadId, route, settings) {
  await updatePendingNativeMoves((pendingMoves) => {
    pendingMoves[String(downloadId)] = {
      createdAt: new Date().toISOString(),
      targetFolder: route.folder,
      conflictAction: settings.conflictAction,
      ruleType: route.ruleType,
      ruleName: route.ruleName,
      attempts: 0,
      lastAttemptAt: "",
      lastError: ""
    };
  });
}

async function completeNativeMove(downloadId) {
  const pendingMoves = await getPendingNativeMoves();
  const pending = pendingMoves[String(downloadId)];
  if (!pending) {
    return;
  }

  const items = await downloadsSearch({ id: downloadId });
  const item = items && items[0];
  if (!item || !item.filename || item.incognito) {
    // Defensively clean up records created by older extension versions without
    // disclosing a private download path to the native helper.
    await discardDownloadBookkeeping(downloadId);
    return;
  }
  if (item.state && item.state !== "complete") {
    return;
  }

  try {
    const response = await sendNativeMessage({
      action: "moveDownload",
      sourcePath: item.filename,
      targetFolder: pending.targetFolder,
      conflictAction: pending.conflictAction || "uniquify"
    });

    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "Native helper did not move the file.");
    }

    const finalName = response.path
      ? String(response.path).split(/[/\\]/).filter(Boolean).pop()
      : "";
    try {
      await commitRouteRecord(downloadId, finalName);
    } catch (error) {
      console.error("Tidy Downloads moved the file but could not record its destination", error);
    }
    await removePendingNativeMove(downloadId);
    try {
      await downloadsErase({ id: downloadId });
    } catch (error) {
      console.warn("Tidy Downloads moved the file but could not clean up its staging history entry", error);
    }
  } catch (error) {
    await updatePendingNativeMoves((moves) => {
      const failed = moves[String(downloadId)];
      if (failed) {
        failed.attempts = (Number(failed.attempts) || 0) + 1;
        failed.lastAttemptAt = new Date().toISOString();
        failed.lastError = String(error.message || error).slice(0, 500);
      }
    });
    throw error;
  }
}

async function removePendingNativeMove(downloadId) {
  await updatePendingNativeMoves((pendingMoves) => {
    delete pendingMoves[String(downloadId)];
  });
}

async function readPendingNativeMoves() {
  const result = await getLocal(PENDING_NATIVE_MOVES_KEY);
  return result[PENDING_NATIVE_MOVES_KEY] && typeof result[PENDING_NATIVE_MOVES_KEY] === "object"
    ? result[PENDING_NATIVE_MOVES_KEY]
    : {};
}

async function getPendingNativeMoves() {
  await pendingMoveQueue;
  return readPendingNativeMoves();
}

function updatePendingNativeMoves(mutator) {
  return updateLocalMap(PENDING_NATIVE_MOVES_KEY, mutator);
}

function updateLocalMap(storageKey, mutator) {
  const operation = async () => {
    const values = await readLocalMap(storageKey);
    const result = await mutator(values);
    await setLocal({ [storageKey]: values });
    return result;
  };
  const scheduled = pendingMoveQueue.then(operation, operation);
  pendingMoveQueue = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

async function readLocalMap(storageKey) {
  const result = await getLocal(storageKey);
  return result[storageKey] && typeof result[storageKey] === "object"
    ? result[storageKey]
    : {};
}

async function rememberRouteRecord(downloadItem, route) {
  const recent = Core.buildRecentRoute(downloadItem, route);
  await updateLocalMap(PENDING_ROUTE_RECORDS_KEY, (records) => {
    records[String(downloadItem.id)] = {
      createdAt: new Date().toISOString(),
      requiresNativeMove: Boolean(route && route.requiresNativeMove),
      recent
    };
  });
}

async function getRouteRecords() {
  await pendingMoveQueue;
  return readLocalMap(PENDING_ROUTE_RECORDS_KEY);
}

async function getRouteRecord(downloadId) {
  const records = await getRouteRecords();
  return records[String(downloadId)] || null;
}

async function removeRouteRecord(downloadId) {
  await updateLocalMap(PENDING_ROUTE_RECORDS_KEY, (records) => {
    delete records[String(downloadId)];
  });
}

async function discardDownloadBookkeeping(downloadId) {
  await removeRouteRecord(downloadId);
  await removePendingNativeMove(downloadId);
}

async function finishDownload(downloadId) {
  const record = await getRouteRecord(downloadId);
  if (record && record.requiresNativeMove) {
    const pendingMoves = await getPendingNativeMoves();
    if (pendingMoves[String(downloadId)]) {
      await completeNativeMove(downloadId);
      return;
    }
    await removeRouteRecord(downloadId);
    return;
  }
  if (record) {
    await commitRouteRecord(downloadId);
    return;
  }
  await completeNativeMove(downloadId);
}

async function commitRouteRecord(downloadId, finalFilename) {
  const record = await getRouteRecord(downloadId);
  if (!record || !record.recent) {
    return;
  }

  const items = await downloadsSearch({ id: Number(downloadId) });
  const item = items && items[0];
  if (!item) {
    return;
  }
  if (item.incognito || item.state === "interrupted") {
    await removeRouteRecord(downloadId);
    return;
  }
  if (item.state && item.state !== "complete") {
    return;
  }

  const recent = Object.assign({}, record.recent);
  if (finalFilename) {
    recent.originalFilename = Core.sanitizeFilename(finalFilename);
  }

  await Store.updateSettings((settings) => {
    if (!settings.keepHistory) {
      settings.recentRoutes = [];
      return;
    }
    const alreadyRecorded = (settings.recentRoutes || []).some((entry) => entry.id === recent.id);
    if (alreadyRecorded) {
      return;
    }
    settings.recentRoutes = [recent].concat(settings.recentRoutes || []).slice(0, settings.historyLimit || Core.DEFAULT_HISTORY_LIMIT);
  });
  await removeRouteRecord(downloadId);
}

async function recoverFinishedRouteRecords() {
  const records = await getRouteRecords();
  for (const downloadId of Object.keys(records)) {
    const numericId = Number(downloadId);
    if (!Number.isInteger(numericId)) {
      await removeRouteRecord(downloadId);
      continue;
    }

    const items = await downloadsSearch({ id: numericId });
    const item = items && items[0];
    if (!item || item.incognito || item.state === "interrupted") {
      await discardDownloadBookkeeping(numericId);
      continue;
    }
    if (item.state !== "complete") {
      continue;
    }

    try {
      if (records[downloadId].requiresNativeMove) {
        await completeNativeMove(numericId);
      } else {
        await commitRouteRecord(numericId);
      }
    } catch (error) {
      console.error("Tidy Downloads could not record a finished download", error);
    }
  }
}

async function getNativeMoveStatus() {
  const pendingMoves = await getPendingNativeMoves();
  const entries = Object.values(pendingMoves);
  return {
    pendingCount: entries.length,
    failedCount: entries.filter((entry) => entry && entry.lastError).length
  };
}

function recoverPendingNativeMoves() {
  if (recoveryPromise) {
    return recoveryPromise;
  }

  recoveryPromise = (async () => {
    await recoverFinishedRouteRecords();
    const pendingMoves = await getPendingNativeMoves();
    for (const downloadId of Object.keys(pendingMoves)) {
      const numericId = Number(downloadId);
      if (!Number.isInteger(numericId)) {
        await removePendingNativeMove(downloadId);
        continue;
      }

      const items = await downloadsSearch({ id: numericId });
      const item = items && items[0];
      if (!item || item.incognito || item.state === "interrupted") {
        await discardDownloadBookkeeping(numericId);
        continue;
      }
      if (item.state === "complete") {
        try {
          await completeNativeMove(numericId);
        } catch (error) {
          console.error("Tidy Downloads could not recover a native move", error);
        }
      }
    }
    return getNativeMoveStatus();
  })().finally(() => {
    recoveryPromise = null;
  });

  return recoveryPromise;
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

function downloadsSearch(query) {
  return new Promise((resolve, reject) => {
    chrome.downloads.search(query, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items || []);
    });
  });
}

function downloadsErase(query) {
  return new Promise((resolve, reject) => {
    chrome.downloads.erase(query, (ids) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(ids || []);
    });
  });
}

function getLocal(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result || {});
    });
  });
}

function setLocal(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}
