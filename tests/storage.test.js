const assert = require("node:assert/strict");

const localData = {};

globalThis.chrome = {
  runtime: { lastError: null },
  storage: {
    local: {
      get(keys, callback) {
        setTimeout(() => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          const result = {};
          keyList.forEach((key) => {
            if (Object.hasOwn(localData, key)) {
              result[key] = structuredClone(localData[key]);
            }
          });
          callback(result);
        }, 2);
      },
      set(value, callback) {
        setTimeout(() => {
          Object.assign(localData, structuredClone(value));
          callback();
        }, 2);
      }
    }
  }
};

require("../src/core.js");
require("../src/storage.js");

const Core = globalThis.DownloadRouterCore;
const Store = globalThis.DownloadRouterStorage;

async function run() {
  await Store.ensureSettings();

  await Promise.all(Array.from({ length: 12 }, (_value, index) => {
    return Store.updateSettings((settings) => {
      settings.siteRules.push(Core.normalizeSiteRule({
        hostPattern: `site-${index}.example.com`,
        folder: `Websites/Site ${index}`
      }));
    });
  }));

  const settings = await Store.getSettings();
  assert.equal(settings.siteRules.length, 12);
  assert.equal(new Set(settings.siteRules.map((rule) => rule.hostPattern)).size, 12);
  console.log("storage tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
