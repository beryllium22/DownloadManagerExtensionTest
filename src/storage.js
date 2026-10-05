(function attachStorage(globalScope) {
  "use strict";

  const SETTINGS_KEY = "settings";
  const SETTINGS_LOCK = "tidy-downloads-settings";
  let writeQueue = Promise.resolve();

  function runtimeError() {
    return globalScope.chrome && globalScope.chrome.runtime && globalScope.chrome.runtime.lastError
      ? globalScope.chrome.runtime.lastError
      : null;
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      globalScope.chrome.storage.local.get(keys, (result) => {
        const error = runtimeError();
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(result || {});
      });
    });
  }

  function storageSet(value) {
    return new Promise((resolve, reject) => {
      globalScope.chrome.storage.local.set(value, () => {
        const error = runtimeError();
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve();
      });
    });
  }

  async function readSettings() {
    const result = await storageGet(SETTINGS_KEY);
    return globalScope.DownloadRouterCore.normalizeSettings(result[SETTINGS_KEY]);
  }

  async function writeSettings(settings) {
    const normalized = globalScope.DownloadRouterCore.normalizeSettings(settings);
    await storageSet({ [SETTINGS_KEY]: normalized });
    return normalized;
  }

  function withStorageLock(operation) {
    const locks = globalScope.navigator && globalScope.navigator.locks;
    return locks && typeof locks.request === "function"
      ? locks.request(SETTINGS_LOCK, operation)
      : operation();
  }

  function enqueueWrite(operation) {
    const run = () => withStorageLock(operation);
    const scheduled = writeQueue.then(run, run);
    writeQueue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  async function getSettings() {
    await writeQueue;
    return withStorageLock(readSettings);
  }

  function saveSettings(settings) {
    return enqueueWrite(() => writeSettings(settings));
  }

  async function ensureSettings() {
    const result = await updateSettings(() => undefined);
    return result.settings;
  }

  function updateSettings(mutator) {
    return enqueueWrite(async () => {
      const settings = await readSettings();
      const result = await mutator(settings);
      const normalized = await writeSettings(settings);
      return { settings: normalized, result };
    });
  }

  globalScope.DownloadRouterStorage = {
    ensureSettings,
    getSettings,
    saveSettings,
    updateSettings
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
