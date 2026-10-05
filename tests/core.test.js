const assert = require("node:assert/strict");
require("../src/core.js");

const Core = globalThis.DownloadRouterCore;

function download(overrides) {
  return Object.assign({
    filename: "C:\\Users\\Tester\\Downloads\\file.zip",
    finalUrl: "https://example.com/file.zip",
    url: "https://example.com/file.zip",
    referrer: "https://example.com/",
    mime: "application/zip",
    incognito: false
  }, overrides);
}

assert.equal(Core.sanitizeFolderPath("Mods\\Nexus").ok, true);
assert.equal(Core.sanitizeFolderPath("Mods\\Nexus").value, "Mods/Nexus");
assert.equal(Core.sanitizeFolderPath("D:\\Mods").ok, false);
assert.equal(Core.sanitizeFolderPath("\\\\server\\share").ok, false);
assert.equal(Core.sanitizeFolderPath("../Windows").ok, false);
assert.equal(Core.sanitizeFolderPath("Media/../Videos").ok, false);
assert.equal(Core.sanitizeFolderPath("CON").ok, false);
assert.equal(Core.sanitizeDestinationPath("D:\\Games\\Skyrim\\Mods").ok, true);
assert.equal(Core.sanitizeDestinationPath("D:\\Games\\Skyrim\\Mods").value, "D:\\Games\\Skyrim\\Mods");
assert.equal(Core.sanitizeDestinationPath("C:\\Windows\\Temp").ok, false);
assert.equal(Core.normalizeHostPattern("https://www.Example.com:8443/path?q=1"), "example.com");
assert.equal(Core.normalizeHostPattern("*.downloads.example.com"), "downloads.example.com");
assert.equal(Core.normalizeHostPattern("not a website"), "");
assert.deepEqual(Core.normalizeSiteRule({ hostPattern: "example.com", extensionMode: "all", extensions: ["zip"] }).extensions, []);

assert.equal(Core.sanitizeFilename("C:\\Users\\Tester\\Downloads\\archive.7z"), "archive.7z");
assert.deepEqual(Array.from(Core.getExtensionCandidates("release.tar.gz")).sort(), ["gz", "tar.gz"]);

const settings = Core.normalizeSettings({
  enabled: true,
  routePriority: "site-first",
  conflictAction: "uniquify",
  siteRules: [
    {
      hostPattern: "nexusmods.com",
      includeSubdomains: true,
      folder: "Mods/Nexus",
      enabled: true
    }
  ],
  fileTypeRules: [
    {
      name: "Videos",
      extensions: ["mp4"],
      mimePatterns: ["video/*"],
      folder: "Media/Videos",
      enabled: true
    },
    {
      name: "Archives",
      extensions: ["zip", "7z"],
      folder: "Archives",
      enabled: true
    }
  ]
});

assert.equal(settings.askOnlyWhenNoRuleMatches, true);
assert.equal(settings.keepHistory, true);
assert.equal(settings.historyLimit, 80);
assert.equal(Core.normalizeSettings({ historyLimit: 999 }).historyLimit, 80);
assert.equal(Core.normalizeSettings({ historyLimit: 20 }).historyLimit, 20);
assert.equal(Core.suggestFoldersForHost("https://www.nexusmods.com/skyrimspecialedition").includes("Mods/Nexus Mods"), true);
assert.equal(Core.suggestFoldersForHost("https://www.nexusmods.com/skyrimspecialedition")[0], "Mods/Nexus Mods/{game}");
assert.equal(Core.suggestFoldersForExtension(".mp4")[0], "Media/Videos");
assert.equal(Core.extractNexusGameSlugFromUrl("https://www.nexusmods.com/fallout4/mods/456"), "fallout4");
assert.equal(Core.extractNexusGameSlugFromUrl("https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/123"), "skyrimspecialedition");
assert.equal(Core.normalizeGamePattern("https://www.nexusmods.com/skyrimspecialedition/mods/123"), "skyrimspecialedition");

let route = Core.computeRoute(settings, download({
  filename: "C:\\Downloads\\mod.7z",
  finalUrl: "https://www.nexusmods.com/skyrimspecialedition/mod.zip",
  referrer: "https://www.nexusmods.com/"
}));
assert.equal(route.routed, true);
assert.equal(route.suggestionFilename, "Mods/Nexus/mod.7z");
assert.equal(route.ruleType, "site");

const nexusDownload = download({
  filename: "C:\\Downloads\\skyui.7z",
  finalUrl: "https://files.nexusmods.com/skyrimspecialedition/skyui.7z",
  referrer: "https://www.nexusmods.com/skyrimspecialedition/mods/12604?tab=files"
});
const nexusSource = Core.getDownloadSourceContext(nexusDownload);
assert.equal(nexusSource.sourceName, "Nexus Mods");
assert.equal(nexusSource.gameSlug, "skyrimspecialedition");
assert.equal(nexusSource.gameName, "Skyrim Special Edition");
assert.equal(Core.sourceGameMatches({ sourceGame: "Skyrim Special Edition" }, nexusDownload), true);
assert.equal(Core.sourceGameMatches({ sourceGame: "fallout4" }, nexusDownload), false);

const nexusGameSettings = Core.normalizeSettings({
  enabled: true,
  siteRules: [
    {
      hostPattern: "nexusmods.com",
      includeSubdomains: true,
      folder: "Mods/Nexus Mods/{game}",
      enabled: true
    }
  ]
});

route = Core.computeRoute(nexusGameSettings, nexusDownload);
assert.equal(route.routed, true);
assert.equal(route.folder, "Mods/Nexus Mods/Skyrim Special Edition");
assert.equal(route.suggestionFilename, "Mods/Nexus Mods/Skyrim Special Edition/skyui.7z");

const gameSpecificSettings = Core.normalizeSettings({
  enabled: true,
  siteRules: [
    {
      hostPattern: "nexusmods.com",
      sourceGame: "fallout4",
      folder: "Mods/Fallout 4",
      enabled: true
    },
    {
      hostPattern: "nexusmods.com",
      sourceGame: "Skyrim Special Edition",
      folder: "Mods/Skyrim SE",
      enabled: true
    }
  ]
});

route = Core.computeRoute(gameSpecificSettings, nexusDownload);
assert.equal(route.routed, true);
assert.equal(route.folder, "Mods/Skyrim SE");

const recentNexus = Core.buildRecentRoute(nexusDownload, route);
assert.equal(recentNexus.gameName, "Skyrim Special Edition");
assert.equal(recentNexus.sourceName, "Nexus Mods");

const falloutDownload = download({
  filename: "C:\\Downloads\\settlements.7z",
  finalUrl: "https://files.nexusmods.com/fallout4/settlements.7z",
  referrer: "https://www.nexusmods.com/fallout4/mods/100"
});
const skyrimOnlySettings = Core.normalizeSettings({
  enabled: true,
  siteRules: [
    {
      hostPattern: "nexusmods.com",
      sourceGame: "Skyrim Special Edition",
      folder: "Mods/Skyrim SE",
      enabled: true
    }
  ]
});
assert.equal(Core.hasSavedSiteRule(skyrimOnlySettings, "nexusmods.com", falloutDownload), false);
assert.equal(Core.shouldPromptForHost(skyrimOnlySettings, falloutDownload).shouldPrompt, true);

route = Core.computeRoute(settings, download({
  filename: "C:\\Downloads\\clip.mp4",
  finalUrl: "https://cdn.example.net/clip.mp4",
  mime: "video/mp4"
}));
assert.equal(route.suggestionFilename, "Media/Videos/clip.mp4");
assert.equal(route.ruleType, "file-type");

const absoluteSettings = Core.normalizeSettings({
  enabled: true,
  siteRules: [
    {
      hostPattern: "nexusmods.com",
      includeSubdomains: true,
      folder: "D:\\Games\\Skyrim\\Mods",
      enabled: true
    }
  ]
});

route = Core.computeRoute(absoluteSettings, download({
  filename: "C:\\Downloads\\mod.7z",
  finalUrl: "https://nexusmods.com/mod.7z",
  referrer: "https://nexusmods.com/"
}));
assert.equal(route.routed, true);
assert.equal(route.requiresNativeMove, true);
assert.equal(route.folder, "D:\\Games\\Skyrim\\Mods");
assert.equal(route.suggestionFilename, "Tidy Downloads Staging/mod.7z");

route = Core.computeRoute(settings, download({
  filename: "C:\\Downloads\\unknown.exe",
  finalUrl: "https://updates.example.net/unknown.exe",
  mime: "application/octet-stream"
}));
assert.equal(route.routed, false);

const fileFirst = Core.normalizeSettings(Object.assign({}, settings, { routePriority: "file-type-first" }));
route = Core.computeRoute(fileFirst, download({
  filename: "C:\\Downloads\\mod.7z",
  finalUrl: "https://nexusmods.com/mod.7z",
  mime: "application/x-7z-compressed"
}));
assert.equal(route.suggestionFilename, "Archives/mod.7z");
assert.equal(route.ruleType, "file-type");

const prompt = Core.shouldPromptForHost(Core.defaultSettings(), download({
  finalUrl: "https://downloads.example.org/file.bin",
  referrer: ""
}));
assert.equal(prompt.shouldPrompt, true);
assert.equal(prompt.host, "downloads.example.org");

const genericBeforeSpecific = Core.normalizeSettings({
  siteRules: [
    {
      hostPattern: "nexusmods.com",
      folder: "Mods/General",
      enabled: true
    },
    {
      hostPattern: "nexusmods.com",
      sourceGame: "Skyrim Special Edition",
      folder: "Mods/Skyrim SE",
      enabled: true
    }
  ]
});
route = Core.computeRoute(genericBeforeSpecific, nexusDownload);
assert.equal(route.folder, "Mods/Skyrim SE");

const broadBeforeNarrowFileType = Core.normalizeSettings({
  fileTypeRules: [
    {
      name: "Compressed files",
      extensions: ["zip", "7z", "rar"],
      mimePatterns: ["application/zip"],
      folder: "Compressed Files",
      enabled: true
    },
    {
      name: "ZIP files",
      extensions: ["zip"],
      folder: "ZIP Files",
      enabled: true
    }
  ]
});
route = Core.computeRoute(broadBeforeNarrowFileType, download({ filename: "C:\\Downloads\\package.zip" }));
assert.equal(route.folder, "ZIP Files");

const parentBeforeSubdomain = Core.normalizeSettings({
  siteRules: [
    { hostPattern: "example.com", folder: "Websites/Example", enabled: true },
    { hostPattern: "downloads.example.com", folder: "Websites/Example Downloads", enabled: true }
  ]
});
route = Core.computeRoute(parentBeforeSubdomain, download({
  finalUrl: "https://downloads.example.com/package.zip",
  referrer: "https://downloads.example.com/"
}));
assert.equal(route.folder, "Websites/Example Downloads");

const specializedRule = Core.normalizeSiteRule({
  hostPattern: "nexusmods.com",
  sourceGame: "fallout4",
  folder: "Mods/Fallout 4"
});
let upserted = Core.upsertSiteRule([specializedRule], {
  hostPattern: "nexusmods.com",
  folder: "Mods/Nexus Mods",
  includeSubdomains: true
});
assert.equal(upserted.created, true);
assert.equal(upserted.rules.length, 2);
assert.equal(upserted.rules[0].sourceGame, "fallout4");

upserted = Core.upsertSiteRule(upserted.rules, {
  hostPattern: "nexusmods.com",
  folder: "Mods/All Nexus Downloads",
  includeSubdomains: false
});
assert.equal(upserted.created, false);
assert.equal(upserted.rules.length, 2);
assert.equal(upserted.rule.folder, "Mods/All Nexus Downloads");
assert.equal(upserted.rule.includeSubdomains, false);

let fileUpsert = Core.upsertFileTypeRule([], {
  name: "ZIP files",
  extensions: ["zip"],
  folder: "Compressed Files"
});
fileUpsert = Core.upsertFileTypeRule(fileUpsert.rules, {
  name: "ZIP downloads",
  extensions: [".ZIP"],
  folder: "Archives/ZIP"
});
assert.equal(fileUpsert.created, false);
assert.equal(fileUpsert.rules.length, 1);
assert.equal(fileUpsert.rule.folder, "Archives/ZIP");

const recent = Core.buildRecentRoute(download({
  finalUrl: "https://downloads.example.com/file.zip?token=secret",
  url: "https://downloads.example.com/file.zip?token=secret"
}), { routed: false, ruleType: "default" });
assert.equal(Object.hasOwn(recent, "url"), false);

const migrated = Core.normalizeSettings({
  recentRoutes: [{
    id: "old-route",
    at: "2026-01-02T03:04:05.000Z",
    host: "downloads.example.com",
    originalFilename: "file.zip",
    extension: "zip",
    ruleType: "default",
    url: "https://downloads.example.com/file.zip?token=secret"
  }]
});
assert.equal(migrated.version, 2);
assert.equal(Object.hasOwn(migrated.recentRoutes[0], "url"), false);
assert.equal(Core.normalizeSettings({ keepHistory: false, recentRoutes: [recent] }).recentRoutes.length, 0);

const hazardousImportInput = {
  version: 2,
  enabled: true,
  conflictAction: "overwrite",
  siteRules: [{ hostPattern: "example.com", folder: "d:/Games/Mods" }],
  fileTypeRules: [{ name: "Videos", extensions: ["mp4"], folder: "E:\\Media\\Videos", enabled: false }]
};
const hazardousImportSnapshot = JSON.stringify(hazardousImportInput);
const hazardousImport = Core.prepareSettingsImport(hazardousImportInput);
assert.deepEqual(hazardousImport.errors, []);
assert.equal(JSON.stringify(hazardousImportInput), hazardousImportSnapshot, "import preparation must not mutate untrusted input");
assert.equal(hazardousImport.summary.sortingEnabled, true);
assert.equal(hazardousImport.summary.enabledSiteRuleCount, 1, "an omitted enabled flag is active after normalization");
assert.equal(hazardousImport.summary.enabledFileTypeRuleCount, 0);
assert.equal(hazardousImport.summary.enabledRuleCount, 1);
assert.deepEqual(hazardousImport.summary.absoluteDestinations, ["D:\\Games\\Mods", "E:\\Media\\Videos"]);
assert.equal(hazardousImport.summary.overwriteEnabled, true);
assert.equal(hazardousImport.summary.requiresHazardConfirmation, true);

const overwriteOnlyImport = Core.prepareSettingsImport({
  conflictAction: "overwrite",
  siteRules: [{ hostPattern: "example.com", folder: "Websites/Example" }]
});
assert.deepEqual(overwriteOnlyImport.errors, []);
assert.deepEqual(overwriteOnlyImport.summary.absoluteDestinations, []);
assert.equal(overwriteOnlyImport.summary.requiresHazardConfirmation, true);

const safeImport = Core.prepareSettingsImport({
  enabled: true,
  conflictAction: "uniquify",
  siteRules: [{ hostPattern: "example.com", folder: "Websites/Example", enabled: true }]
});
assert.deepEqual(safeImport.errors, []);
assert.equal(safeImport.summary.requiresHazardConfirmation, false);

const pausedDormantImport = Core.prepareSettingsImport({
  enabled: false,
  conflictAction: "uniquify",
  fileTypeRules: [{ name: "Archives", extensions: ["zip"], folder: "F:\\Dormant", enabled: false }]
});
assert.equal(pausedDormantImport.summary.sortingEnabled, false);
assert.equal(pausedDormantImport.summary.enabledRuleCount, 0);
assert.deepEqual(pausedDormantImport.summary.absoluteDestinations, ["F:\\Dormant"]);
assert.equal(pausedDormantImport.summary.requiresHazardConfirmation, true, "dormant full paths must still be disclosed before restore");

const futureImport = Core.prepareSettingsImport({ version: Core.SETTINGS_VERSION + 1 });
assert.equal(futureImport.settings, null);
assert.match(futureImport.errors[0], /newer Tidy Downloads version/);

const oversizedRuleImport = Core.prepareSettingsImport({
  siteRules: Array.from({ length: Core.MAX_SETTINGS_IMPORT_RULES + 1 }, () => ({
    hostPattern: "example.com",
    folder: "Websites/Example"
  }))
});
assert.equal(oversizedRuleImport.settings, null);
assert.match(oversizedRuleImport.errors.join(" "), /at most 500 folder rules/);
assert.equal(Core.MAX_SETTINGS_IMPORT_BYTES, 1024 * 1024);

console.log("core tests passed");
