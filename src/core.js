(function attachCore(globalScope) {
  "use strict";

  const SETTINGS_VERSION = 2;
  const MAX_RECENT_ROUTES = 200;
  const MAX_FOLDER_LENGTH = 180;
  const MAX_SETTINGS_IMPORT_BYTES = 1024 * 1024;
  const MAX_SETTINGS_IMPORT_RULES = 500;
  const MAX_SETTINGS_IMPORT_PROMPT_HOSTS = 2000;
  const DEFAULT_HISTORY_LIMIT = 80;
  const NATIVE_HOST_NAME = "com.tidy_downloads.host";
  const STAGING_FOLDER = "Tidy Downloads Staging";
  const HISTORY_LIMITS = new Set([20, 80, 200]);
  const NEXUS_HOST_PATTERN = "nexusmods.com";
  const FOLDER_TOKEN_PATTERN = /\{(game|gameSlug|site|host)\}/gi;
  const NEXUS_NON_GAME_PATHS = new Set([
    "about",
    "account",
    "api",
    "core",
    "images",
    "mods",
    "news",
    "premium",
    "users"
  ]);
  const KNOWN_NEXUS_GAME_NAMES = {
    baldursgate3: "Baldur's Gate 3",
    cyberpunk2077: "Cyberpunk 2077",
    dragonageorigins: "Dragon Age: Origins",
    eldenring: "Elden Ring",
    fallout3: "Fallout 3",
    fallout4: "Fallout 4",
    fallout76: "Fallout 76",
    monsterhunterworld: "Monster Hunter: World",
    morrowind: "Morrowind",
    newvegas: "Fallout: New Vegas",
    oblivion: "Oblivion",
    oblivionremastered: "Oblivion Remastered",
    skyrim: "Skyrim",
    skyrimspecialedition: "Skyrim Special Edition",
    starfield: "Starfield",
    stardewvalley: "Stardew Valley",
    subnautica: "Subnautica",
    witcher3: "The Witcher 3"
  };
  const RESERVED_WINDOWS_NAMES = new Set([
    "con",
    "prn",
    "aux",
    "nul",
    "com1",
    "com2",
    "com3",
    "com4",
    "com5",
    "com6",
    "com7",
    "com8",
    "com9",
    "lpt1",
    "lpt2",
    "lpt3",
    "lpt4",
    "lpt5",
    "lpt6",
    "lpt7",
    "lpt8",
    "lpt9"
  ]);

  const PRESET_FILE_TYPE_RULES = [
    {
      name: "Compressed files",
      extensions: ["zip", "7z", "rar", "tar", "tar.gz", "tgz", "gz", "bz2", "xz"],
      mimePatterns: ["application/zip", "application/x-7z-compressed", "application/x-rar-compressed"],
      folder: "Compressed Files"
    },
    {
      name: "Videos",
      extensions: ["mp4", "mkv", "mov", "webm", "avi", "wmv", "m4v"],
      mimePatterns: ["video/*"],
      folder: "Media/Videos"
    },
    {
      name: "Audio",
      extensions: ["mp3", "wav", "flac", "m4a", "aac", "ogg", "opus"],
      mimePatterns: ["audio/*"],
      folder: "Media/Audio"
    },
    {
      name: "Images",
      extensions: ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "heic"],
      mimePatterns: ["image/*"],
      folder: "Pictures"
    },
    {
      name: "Documents",
      extensions: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md"],
      mimePatterns: ["application/pdf", "text/*"],
      folder: "Documents"
    },
    {
      name: "Installers",
      extensions: ["exe", "msi", "msix", "appx", "dmg", "pkg", "deb", "rpm"],
      mimePatterns: ["application/x-msdownload", "application/x-msi"],
      folder: "Installers"
    }
  ];

  const HOST_FOLDER_SUGGESTIONS = [
    { patterns: ["nexusmods.com"], folders: ["Mods/Nexus Mods/{game}", "Mods/Nexus Mods", "Game Mods", "Compressed Files"] },
    { patterns: ["github.com", "gitlab.com"], folders: ["Code", "Code/Downloads", "Compressed Files"] },
    { patterns: ["youtube.com", "youtu.be", "vimeo.com"], folders: ["Media/Videos", "Media", "Downloads/Video"] },
    { patterns: ["soundcloud.com", "bandcamp.com", "spotify.com"], folders: ["Media/Audio", "Music", "Media"] },
    { patterns: ["drive.google.com", "docs.google.com", "dropbox.com", "onedrive.live.com"], folders: ["Cloud Downloads", "Documents", "Pictures"] },
    { patterns: ["itch.io", "steampowered.com", "gog.com"], folders: ["Games", "Games/Downloads", "Compressed Files"] },
    { patterns: ["mega.nz", "mediafire.com"], folders: ["Shared Downloads", "Compressed Files", "Media"] }
  ];

  const EXTENSION_FOLDER_SUGGESTIONS = [
    { extensions: ["zip", "7z", "rar", "tar", "tar.gz", "tgz", "gz", "bz2", "xz"], folders: ["Compressed Files", "Archives"] },
    { extensions: ["mp4", "mkv", "mov", "webm", "avi", "wmv", "m4v"], folders: ["Media/Videos", "Videos"] },
    { extensions: ["mp3", "wav", "flac", "m4a", "aac", "ogg", "opus"], folders: ["Media/Audio", "Music"] },
    { extensions: ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "heic"], folders: ["Pictures", "Images"] },
    { extensions: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md"], folders: ["Documents"] },
    { extensions: ["exe", "msi", "msix", "appx", "dmg", "pkg", "deb", "rpm"], folders: ["Installers"] },
    { extensions: ["torrent"], folders: ["Torrents"] },
    { extensions: ["jar", "py", "js", "ts", "json", "xml", "yml", "yaml"], folders: ["Code/Downloads"] }
  ];

  function nowIso() {
    return new Date().toISOString();
  }

  function makeId(prefix) {
    const random = globalScope.crypto && globalScope.crypto.getRandomValues
      ? Array.from(globalScope.crypto.getRandomValues(new Uint32Array(2)), (part) => part.toString(36)).join("")
      : Math.random().toString(36).slice(2);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }

  function defaultSettings() {
    return {
      version: SETTINGS_VERSION,
      enabled: true,
      askOnFirstDownload: true,
      askOnlyWhenNoRuleMatches: true,
      keepHistory: true,
      historyLimit: DEFAULT_HISTORY_LIMIT,
      routePriority: "site-first",
      conflictAction: "uniquify",
      siteRules: [],
      fileTypeRules: [],
      promptHosts: {},
      recentRoutes: []
    };
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeArray(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string") {
      return value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  function normalizeExtension(extension) {
    return String(extension || "")
      .trim()
      .toLowerCase()
      .replace(/^\.+/, "")
      .replace(/\s+/g, "");
  }

  function uniqueNormalizedExtensions(value) {
    return Array.from(new Set(normalizeArray(value).map(normalizeExtension).filter(Boolean)));
  }

  function normalizeMimePattern(pattern) {
    return String(pattern || "").trim().toLowerCase();
  }

  function uniqueMimePatterns(value) {
    return Array.from(new Set(normalizeArray(value).map(normalizeMimePattern).filter(Boolean)));
  }

  function uniqueFolders(folders) {
    return Array.from(new Set((folders || []).map((folder) => sanitizeFolderPath(folder)).filter((result) => {
      return result.ok && result.value;
    }).map((result) => result.value)));
  }

  function normalizeHostPattern(input) {
    let value = String(input || "").trim().toLowerCase();
    if (!value) {
      return "";
    }

    value = value.replace(/^(https?:\/\/)?\*\./, (_match, scheme) => scheme || "");
    const candidates = /^https?:\/\//.test(value) ? [value] : [`https://${value}`];
    for (const candidate of candidates) {
      try {
        const parsed = new URL(candidate);
        if (/^https?:$/.test(parsed.protocol) && parsed.hostname) {
          return parsed.hostname
            .toLowerCase()
            .replace(/^www\./, "")
            .replace(/\.$/, "");
        }
      } catch (_error) {
        // Invalid websites normalize to an empty pattern.
      }
    }
    return "";
  }

  function getHostFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) {
        return "";
      }
      return normalizeHostPattern(parsed.hostname);
    } catch (_error) {
      return "";
    }
  }

  function getDownloadHost(downloadItem) {
    const urls = [
      downloadItem && downloadItem.referrer,
      downloadItem && downloadItem.finalUrl,
      downloadItem && downloadItem.url
    ];

    for (const url of urls) {
      const host = getHostFromUrl(url);
      if (host) {
        return host;
      }
    }
    return "";
  }

  function parseHttpUrl(value) {
    const input = String(value || "").trim();
    if (!input) {
      return null;
    }

    const candidates = /^https?:\/\//i.test(input) ? [input] : [input, `https://${input}`];
    for (const candidate of candidates) {
      try {
        const parsed = new URL(candidate);
        if (/^https?:$/.test(parsed.protocol)) {
          return parsed;
        }
      } catch (_error) {
        // Try the next form.
      }
    }
    return null;
  }

  function cleanGameSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "")
      .replace(/^[-_]+|[-_]+$/g, "");
  }

  function gameMatchKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function extractNexusGameSlugFromUrl(url) {
    const parsed = parseHttpUrl(url);
    if (!parsed || !hostMatches({ hostPattern: NEXUS_HOST_PATTERN, includeSubdomains: true }, parsed.hostname)) {
      return "";
    }

    const queryGame = parsed.searchParams.get("game_domain_name")
      || parsed.searchParams.get("game")
      || parsed.searchParams.get("gameName");
    const querySlug = cleanGameSlug(queryGame);
    if (querySlug) {
      return querySlug;
    }

    const parts = parsed.pathname
      .split("/")
      .map((part) => {
        try {
          return decodeURIComponent(part);
        } catch (_error) {
          return part;
        }
      })
      .filter(Boolean);

    const gamesIndex = parts.findIndex((part) => part.toLowerCase() === "games");
    if (gamesIndex >= 0 && parts[gamesIndex + 1]) {
      const gameFromApiPath = cleanGameSlug(parts[gamesIndex + 1]);
      if (gameFromApiPath) {
        return gameFromApiPath;
      }
    }

    const firstPathPart = parts[0] && cleanGameSlug(parts[0]);
    if (firstPathPart && !NEXUS_NON_GAME_PATHS.has(firstPathPart)) {
      return firstPathPart;
    }

    return "";
  }

  function normalizeGamePattern(input) {
    const value = String(input || "").trim().toLowerCase();
    if (!value) {
      return "";
    }

    const nexusSlug = extractNexusGameSlugFromUrl(value);
    if (nexusSlug) {
      return nexusSlug;
    }

    return value
      .replace(/\s+/g, " ")
      .replace(/^[./\\]+|[./\\]+$/g, "");
  }

  function friendlyGameName(value) {
    const normalized = normalizeGamePattern(value);
    const key = gameMatchKey(normalized);
    if (!key) {
      return "";
    }
    if (KNOWN_NEXUS_GAME_NAMES[key]) {
      return KNOWN_NEXUS_GAME_NAMES[key];
    }
    return normalized
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function getDownloadSourceContext(downloadItem) {
    const host = getDownloadHost(downloadItem);
    const context = {
      host,
      siteName: friendlyHostName(host),
      sourceType: "",
      sourceName: "",
      gameSlug: "",
      gameName: ""
    };
    const urls = [
      downloadItem && downloadItem.referrer,
      downloadItem && downloadItem.finalUrl,
      downloadItem && downloadItem.url
    ];

    if (hostMatches({ hostPattern: NEXUS_HOST_PATTERN, includeSubdomains: true }, host)) {
      context.sourceType = "nexusmods";
      context.sourceName = "Nexus Mods";
    }

    for (const url of urls) {
      const gameSlug = extractNexusGameSlugFromUrl(url);
      if (gameSlug) {
        context.sourceType = "nexusmods";
        context.sourceName = "Nexus Mods";
        context.gameSlug = gameSlug;
        context.gameName = friendlyGameName(gameSlug);
        break;
      }
    }

    return context;
  }

  function isReservedWindowsSegment(segment) {
    const baseName = segment.split(".")[0].toLowerCase();
    return RESERVED_WINDOWS_NAMES.has(baseName);
  }

  function sanitizeFolderPath(input) {
    let value = String(input || "").trim();
    if (!value) {
      return { ok: true, value: "", error: "" };
    }

    value = value.replace(/\\/g, "/").replace(/\/+/g, "/");
    value = value.replace(/^\.\//, "").replace(/\/$/, "");

    if (/^[a-z]:\//i.test(value) || value.startsWith("/") || value.startsWith("//")) {
      return {
        ok: false,
        value: "",
        error: "Use a relative folder under the browser Downloads directory, not an absolute path."
      };
    }

    if (value.length > MAX_FOLDER_LENGTH) {
      return {
        ok: false,
        value: "",
        error: `Folder paths must be ${MAX_FOLDER_LENGTH} characters or fewer.`
      };
    }

    const segments = value.split("/");
    const blockedSegments = new Set(["appdata", "program files", "program files (x86)", "system32", "windows"]);

    for (const segment of segments) {
      const normalized = segment.trim();
      const lower = normalized.toLowerCase();

      if (!normalized || normalized === "." || normalized === "..") {
        return {
          ok: false,
          value: "",
          error: "Folder paths cannot contain blank, current, or parent directory segments."
        };
      }

      if (normalized.startsWith(".") || normalized.startsWith("~")) {
        return {
          ok: false,
          value: "",
          error: "Hidden and home-relative folder segments are not allowed."
        };
      }

      if (/[<>:"|?*\x00-\x1F]/.test(normalized)) {
        return {
          ok: false,
          value: "",
          error: "Folder names cannot contain Windows path control characters."
        };
      }

      if (isReservedWindowsSegment(normalized)) {
        return {
          ok: false,
          value: "",
          error: "Folder names cannot use reserved Windows device names."
        };
      }

      if (blockedSegments.has(lower)) {
        return {
          ok: false,
          value: "",
          error: "System-looking folders are blocked to avoid unsafe or confusing destinations."
        };
      }
    }

    return { ok: true, value: segments.join("/"), error: "" };
  }

  function sanitizeAbsoluteFolderPath(input) {
    let value = String(input || "").trim();
    if (!value) {
      return { ok: false, value: "", error: "Choose a folder." };
    }

    value = value.replace(/\//g, "\\").replace(/\\+$/g, "");

    if (!/^[a-z]:\\/i.test(value)) {
      if (value.startsWith("\\\\")) {
        return {
          ok: false,
          value: "",
          error: "Network folders are not supported yet. Use a local drive such as D:\\Mods."
        };
      }
      return {
        ok: false,
        value: "",
        error: "Use a full Windows folder path such as D:\\Games\\Skyrim\\Mods."
      };
    }

    if (/^[a-z]:\\?$/i.test(value)) {
      return {
        ok: false,
        value: "",
        error: "Choose a folder, not the root of a drive."
      };
    }

    if (value.length > 240) {
      return {
        ok: false,
        value: "",
        error: "Folder paths must be 240 characters or fewer."
      };
    }

    const drive = value.slice(0, 2);
    const rest = value.slice(3);
    const segments = rest.split("\\");
    const blockedSegments = new Set(["appdata", "program files", "program files (x86)", "system32", "windows"]);

    for (const segment of segments) {
      const normalized = segment.trim();
      const lower = normalized.toLowerCase();

      if (!normalized || normalized === "." || normalized === "..") {
        return {
          ok: false,
          value: "",
          error: "Folder paths cannot contain blank, current, or parent directory segments."
        };
      }

      if (/[<>:"|?*\x00-\x1F]/.test(normalized)) {
        return {
          ok: false,
          value: "",
          error: "Folder names cannot contain Windows path control characters."
        };
      }

      if (isReservedWindowsSegment(normalized)) {
        return {
          ok: false,
          value: "",
          error: "Folder names cannot use reserved Windows device names."
        };
      }

      if (blockedSegments.has(lower)) {
        return {
          ok: false,
          value: "",
          error: "System folders are blocked. Choose a normal personal folder or game folder."
        };
      }
    }

    return { ok: true, value: `${drive.toUpperCase()}\\${segments.join("\\")}`, error: "" };
  }

  function getDestinationKind(input) {
    const value = String(input || "").trim();
    if (/^[a-z]:[\\/]/i.test(value)) {
      return "absolute";
    }
    if (value.startsWith("\\\\")) {
      return "absolute";
    }
    return "relative";
  }

  function sanitizeDestinationPath(input) {
    return getDestinationKind(input) === "absolute"
      ? sanitizeAbsoluteFolderPath(input)
      : sanitizeFolderPath(input);
  }

  function sanitizeFilename(input, fallbackUrl) {
    let value = String(input || "").trim();

    if (!value && fallbackUrl) {
      try {
        const parsed = new URL(fallbackUrl);
        value = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
      } catch (_error) {
        value = "";
      }
    }

    value = value.split(/[\\/]/).filter(Boolean).pop() || "download";
    value = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, " ").trim();
    value = value.replace(/^\.+/, "").replace(/[. ]+$/, "");

    if (!value) {
      value = "download";
    }

    if (isReservedWindowsSegment(value)) {
      value = `_${value}`;
    }

    return value;
  }

  function getExtensionCandidates(filename, fallbackUrl) {
    const safeName = sanitizeFilename(filename, fallbackUrl).toLowerCase();
    const parts = safeName.split(".").filter(Boolean);
    const candidates = new Set();

    if (parts.length > 1) {
      for (let index = 1; index < parts.length; index += 1) {
        candidates.add(parts.slice(index).join("."));
      }
    }

    return candidates;
  }

  function getPrimaryExtension(filename, fallbackUrl) {
    const candidates = Array.from(getExtensionCandidates(filename, fallbackUrl));
    return candidates.length ? candidates[0].split(".").pop() : "";
  }

  function friendlyHostName(host) {
    const normalizedHost = normalizeHostPattern(host);
    if (!normalizedHost) {
      return "Website";
    }

    const parts = normalizedHost.split(".").filter((part) => part && !["www", "downloads", "cdn", "files"].includes(part));
    const coreName = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return coreName
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Website";
  }

  function safeFolderTokenValue(value, fallback) {
    const sanitized = String(value || "")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^\.+/, "")
      .replace(/[. ]+$/g, "")
      .trim();
    return sanitized || fallback;
  }

  function resolveFolderTemplate(folder, sourceContext) {
    const context = sourceContext || {};
    return String(folder || "").replace(FOLDER_TOKEN_PATTERN, (_match, token) => {
      const normalizedToken = String(token || "").toLowerCase();
      if (normalizedToken === "game") {
        return safeFolderTokenValue(context.gameName || context.gameSlug, "Unknown Game");
      }
      if (normalizedToken === "gameslug") {
        return safeFolderTokenValue(context.gameSlug || context.gameName, "unknown-game");
      }
      if (normalizedToken === "site") {
        return safeFolderTokenValue(context.sourceName || context.siteName, "Website");
      }
      if (normalizedToken === "host") {
        return safeFolderTokenValue(context.host, "website");
      }
      return _match;
    });
  }

  function suggestFoldersForHost(host, sourceContext) {
    const normalizedHost = normalizeHostPattern(host);
    if (!normalizedHost) {
      return ["Websites", "Downloads"];
    }

    const sourceSuggestions = [];
    if (hostMatches({ hostPattern: NEXUS_HOST_PATTERN, includeSubdomains: true }, normalizedHost)) {
      sourceSuggestions.push("Mods/Nexus Mods/{game}", "Mods/{game}", "Game Mods/{game}");
      if (sourceContext && (sourceContext.gameName || sourceContext.gameSlug)) {
        sourceSuggestions.push(`Mods/Nexus Mods/${safeFolderTokenValue(sourceContext.gameName || sourceContext.gameSlug, "Unknown Game")}`);
      }
    }

    const matched = HOST_FOLDER_SUGGESTIONS.find((entry) => {
      return entry.patterns.some((pattern) => hostMatches({ hostPattern: pattern, includeSubdomains: true }, normalizedHost));
    });
    const fallback = [`Websites/${friendlyHostName(normalizedHost)}`, "Downloads"];
    return uniqueFolders(sourceSuggestions.concat(matched ? matched.folders : [], fallback)).slice(0, 5);
  }

  function suggestFoldersForExtension(extension) {
    const normalizedExtension = normalizeExtension(extension);
    if (!normalizedExtension) {
      return ["Downloads"];
    }

    const matched = EXTENSION_FOLDER_SUGGESTIONS.find((entry) => entry.extensions.includes(normalizedExtension));
    return uniqueFolders((matched ? matched.folders : []).concat("Downloads")).slice(0, 4);
  }

  function hostMatches(rule, host) {
    const pattern = normalizeHostPattern(rule && rule.hostPattern);
    const normalizedHost = normalizeHostPattern(host);

    if (!pattern || !normalizedHost) {
      return false;
    }

    if (rule && rule.includeSubdomains === false) {
      return normalizedHost === pattern;
    }

    return normalizedHost === pattern || normalizedHost.endsWith(`.${pattern}`);
  }

  function sourceGameMatches(rule, downloadItem) {
    const expectedGame = normalizeGamePattern(rule && rule.sourceGame);
    if (!expectedGame) {
      return true;
    }

    const sourceContext = getDownloadSourceContext(downloadItem);
    const expectedKey = gameMatchKey(expectedGame);
    return [sourceContext.gameSlug, sourceContext.gameName].some((value) => gameMatchKey(value) === expectedKey);
  }

  function extensionsMatch(extensions, candidates) {
    const normalizedExtensions = uniqueNormalizedExtensions(extensions);
    if (!normalizedExtensions.length) {
      return false;
    }

    for (const extension of normalizedExtensions) {
      if (candidates.has(extension)) {
        return true;
      }
    }
    return false;
  }

  function mimeMatches(patterns, mime) {
    const normalizedMime = normalizeMimePattern(mime);
    if (!normalizedMime) {
      return false;
    }

    return uniqueMimePatterns(patterns).some((pattern) => {
      if (!pattern) {
        return false;
      }
      if (pattern.endsWith("/*")) {
        return normalizedMime.startsWith(pattern.slice(0, -1));
      }
      return normalizedMime === pattern;
    });
  }

  function siteRuleMatches(rule, downloadItem) {
    if (!rule || rule.enabled === false) {
      return false;
    }

    const host = getDownloadHost(downloadItem);
    if (!hostMatches(rule, host)) {
      return false;
    }

    if (!sourceGameMatches(rule, downloadItem)) {
      return false;
    }

    const mode = rule.extensionMode || "all";
    if (mode === "all") {
      return true;
    }

    const candidates = getExtensionCandidates(downloadItem.filename, downloadItem.finalUrl || downloadItem.url);
    const matchedExtension = extensionsMatch(rule.extensions, candidates);

    if (mode === "only") {
      return matchedExtension;
    }
    if (mode === "except") {
      return !matchedExtension;
    }
    return true;
  }

  function fileTypeRuleMatches(rule, downloadItem) {
    if (!rule || rule.enabled === false) {
      return false;
    }

    const candidates = getExtensionCandidates(downloadItem.filename, downloadItem.finalUrl || downloadItem.url);
    return extensionsMatch(rule.extensions, candidates) || mimeMatches(rule.mimePatterns, downloadItem.mime);
  }

  function normalizeSiteRule(rule) {
    const folderResult = sanitizeDestinationPath(rule && rule.folder);
    const extensionMode = ["all", "only", "except"].includes(rule && rule.extensionMode) ? rule.extensionMode : "all";
    return {
      id: rule && rule.id ? String(rule.id) : makeId("site"),
      enabled: rule ? rule.enabled !== false : true,
      hostPattern: normalizeHostPattern(rule && rule.hostPattern),
      includeSubdomains: rule ? rule.includeSubdomains !== false : true,
      sourceGame: normalizeGamePattern(rule && rule.sourceGame),
      folder: folderResult.ok ? folderResult.value : "",
      extensionMode,
      extensions: extensionMode === "all" ? [] : uniqueNormalizedExtensions(rule && rule.extensions),
      notes: String((rule && rule.notes) || "").trim()
    };
  }

  function normalizeFileTypeRule(rule) {
    const folderResult = sanitizeDestinationPath(rule && rule.folder);
    return {
      id: rule && rule.id ? String(rule.id) : makeId("type"),
      enabled: rule ? rule.enabled !== false : true,
      name: String((rule && rule.name) || "File type folder").trim(),
      folder: folderResult.ok ? folderResult.value : "",
      extensions: uniqueNormalizedExtensions(rule && rule.extensions),
      mimePatterns: uniqueMimePatterns(rule && rule.mimePatterns),
      notes: String((rule && rule.notes) || "").trim()
    };
  }

  function normalizePromptHosts(promptHosts) {
    const output = {};
    const input = promptHosts && typeof promptHosts === "object" ? promptHosts : {};

    for (const [host, entry] of Object.entries(input)) {
      const normalizedHost = normalizeHostPattern(host);
      if (!normalizedHost) {
        continue;
      }
      const normalizedEntry = entry && typeof entry === "object" ? entry : {};
      output[normalizedHost] = {
        state: ["prompted", "ignored", "saved"].includes(normalizedEntry.state) ? normalizedEntry.state : "prompted",
        firstSeenAt: normalizedEntry.firstSeenAt || nowIso(),
        lastSeenAt: normalizedEntry.lastSeenAt || normalizedEntry.firstSeenAt || nowIso(),
        lastPromptedAt: normalizedEntry.lastPromptedAt || normalizedEntry.firstSeenAt || nowIso()
      };
    }

    return output;
  }

  function normalizeRecentRoute(route) {
    const value = route && typeof route === "object" ? route : {};
    const parsedAt = new Date(value.at);
    const folderResult = sanitizeDestinationPath(value.folder);

    return {
      id: value.id ? String(value.id) : makeId("recent"),
      at: Number.isNaN(parsedAt.getTime()) ? nowIso() : parsedAt.toISOString(),
      host: normalizeHostPattern(value.host),
      sourceName: String(value.sourceName || "").trim().slice(0, 120),
      gameName: String(value.gameName || "").trim().slice(0, 120),
      gameSlug: normalizeGamePattern(value.gameSlug).slice(0, 120),
      originalFilename: sanitizeFilename(value.originalFilename),
      extension: normalizeExtension(value.extension),
      folder: folderResult.ok ? folderResult.value : "",
      ruleType: ["site", "file-type", "default"].includes(value.ruleType) ? value.ruleType : "default",
      ruleName: String(value.ruleName || "").trim().slice(0, 180)
    };
  }

  function normalizeSettings(input) {
    const defaults = defaultSettings();
    const source = input && typeof input === "object" ? input : {};
    const requestedHistoryLimit = Number(source.historyLimit);
    const historyLimit = HISTORY_LIMITS.has(requestedHistoryLimit) ? requestedHistoryLimit : defaults.historyLimit;
    const keepHistory = source.keepHistory !== undefined ? source.keepHistory !== false : defaults.keepHistory;
    const recentRoutes = keepHistory
      ? normalizeArray(source.recentRoutes)
        .filter((route) => route && typeof route === "object")
        .map(normalizeRecentRoute)
        .slice(0, historyLimit)
      : [];

    return {
      version: SETTINGS_VERSION,
      enabled: source.enabled !== undefined ? source.enabled !== false : defaults.enabled,
      askOnFirstDownload: source.askOnFirstDownload !== undefined
        ? source.askOnFirstDownload !== false
        : defaults.askOnFirstDownload,
      askOnlyWhenNoRuleMatches: source.askOnlyWhenNoRuleMatches !== undefined
        ? source.askOnlyWhenNoRuleMatches !== false
        : defaults.askOnlyWhenNoRuleMatches,
      keepHistory,
      historyLimit,
      routePriority: source.routePriority === "file-type-first" ? "file-type-first" : "site-first",
      conflictAction: ["uniquify", "overwrite", "prompt"].includes(source.conflictAction)
        ? source.conflictAction
        : defaults.conflictAction,
      siteRules: normalizeArray(source.siteRules).map(normalizeSiteRule).filter((rule) => rule.hostPattern),
      fileTypeRules: normalizeArray(source.fileTypeRules).map(normalizeFileTypeRule).filter((rule) => {
        return rule.extensions.length || rule.mimePatterns.length;
      }),
      promptHosts: normalizePromptHosts(source.promptHosts),
      // Older versions retained the full download URL here. It was not used by
      // the UI, so normalizing now deliberately drops it (including query data).
      recentRoutes
    };
  }

  function isMoreSpecific(candidate, current) {
    if (!current) {
      return true;
    }

    for (let index = 0; index < candidate.length; index += 1) {
      if (candidate[index] !== current[index]) {
        return candidate[index] > current[index];
      }
    }
    return false;
  }

  function findMatchingSiteRule(settings, downloadItem) {
    const host = getDownloadHost(downloadItem);
    let bestRule = null;
    let bestSpecificity = null;

    (settings.siteRules || []).forEach((rule) => {
      if (!siteRuleMatches(rule, downloadItem)) {
        return;
      }

      const pattern = normalizeHostPattern(rule.hostPattern);
      const specificity = [
        rule.sourceGame ? 1 : 0,
        rule.extensionMode && rule.extensionMode !== "all" ? 1 : 0,
        pattern.split(".").filter(Boolean).length,
        rule.includeSubdomains === false && pattern === host ? 1 : 0,
        pattern.length
      ];

      if (isMoreSpecific(specificity, bestSpecificity)) {
        bestRule = rule;
        bestSpecificity = specificity;
      }
    });

    return bestRule;
  }

  function findMatchingFileTypeRule(settings, downloadItem) {
    const candidates = getExtensionCandidates(
      downloadItem && downloadItem.filename,
      downloadItem && (downloadItem.finalUrl || downloadItem.url)
    );
    const mime = normalizeMimePattern(downloadItem && downloadItem.mime);
    let bestRule = null;
    let bestSpecificity = null;

    (settings.fileTypeRules || []).forEach((rule) => {
      if (!fileTypeRuleMatches(rule, downloadItem)) {
        return;
      }

      const matchedExtensions = uniqueNormalizedExtensions(rule.extensions).filter((extension) => candidates.has(extension));
      const matchedMimePatterns = uniqueMimePatterns(rule.mimePatterns).filter((pattern) => {
        return pattern.endsWith("/*") ? mime.startsWith(pattern.slice(0, -1)) : mime === pattern;
      });
      const longestExtension = matchedExtensions.reduce((length, extension) => Math.max(length, extension.length), 0);
      const mimeSpecificity = matchedMimePatterns.some((pattern) => !pattern.endsWith("/*")) ? 2 : matchedMimePatterns.length ? 1 : 0;
      const totalMatchers = uniqueNormalizedExtensions(rule.extensions).length + uniqueMimePatterns(rule.mimePatterns).length;
      const specificity = [
        matchedExtensions.length ? 1 : 0,
        longestExtension,
        -totalMatchers,
        mimeSpecificity
      ];

      if (isMoreSpecific(specificity, bestSpecificity)) {
        bestRule = rule;
        bestSpecificity = specificity;
      }
    });

    return bestRule;
  }

  function computeRoute(rawSettings, downloadItem) {
    const settings = normalizeSettings(rawSettings);
    const url = (downloadItem && (downloadItem.finalUrl || downloadItem.url)) || "";
    const filename = sanitizeFilename(downloadItem && downloadItem.filename, url);
    const sourceContext = getDownloadSourceContext(downloadItem);
    const emptyRoute = {
      routed: false,
      filename,
      suggestionFilename: "",
      folder: "",
      sourceContext,
      ruleType: "default",
      ruleId: "",
      ruleName: "",
      reason: "default"
    };

    if (!settings.enabled) {
      return Object.assign({}, emptyRoute, { reason: "disabled" });
    }

    const siteRule = findMatchingSiteRule(settings, downloadItem);
    const fileTypeRule = findMatchingFileTypeRule(settings, downloadItem);
    const firstRule = settings.routePriority === "file-type-first" ? fileTypeRule : siteRule;
    const secondRule = settings.routePriority === "file-type-first" ? siteRule : fileTypeRule;
    const firstType = settings.routePriority === "file-type-first" ? "file-type" : "site";
    const secondType = settings.routePriority === "file-type-first" ? "site" : "file-type";
    const selectedRule = firstRule || secondRule;
    const selectedType = firstRule ? firstType : secondRule ? secondType : "";

    if (!selectedRule) {
      return emptyRoute;
    }

    const resolvedFolder = resolveFolderTemplate(selectedRule.folder, sourceContext);
    const folderResult = sanitizeDestinationPath(resolvedFolder);
    const ruleName = selectedRule.name
      || (selectedRule.sourceGame
        ? `${selectedRule.hostPattern} / ${friendlyGameName(selectedRule.sourceGame)}`
        : selectedRule.hostPattern)
      || "";
    if (!folderResult.ok || !folderResult.value) {
      return Object.assign({}, emptyRoute, {
        reason: folderResult.error || "invalid-folder",
        ruleType: selectedType,
        ruleId: selectedRule.id || "",
        ruleName
      });
    }

    const destinationKind = getDestinationKind(folderResult.value);
    const suggestionFilename = destinationKind === "absolute"
      ? `${STAGING_FOLDER}/${filename}`
      : `${folderResult.value}/${filename}`;

    return {
      routed: true,
      filename,
      suggestionFilename,
      folder: folderResult.value,
      destinationKind,
      requiresNativeMove: destinationKind === "absolute",
      nativeHostName: destinationKind === "absolute" ? NATIVE_HOST_NAME : "",
      ruleType: selectedType,
      ruleId: selectedRule.id || "",
      ruleName,
      sourceContext,
      reason: "matched"
    };
  }

  function hasSavedSiteRule(settings, host, downloadItem) {
    const normalizedHost = normalizeHostPattern(host);
    if (!normalizedHost) {
      return false;
    }
    return normalizeSettings(settings).siteRules.some((rule) => {
      return hostMatches(rule, normalizedHost) && (!downloadItem || sourceGameMatches(rule, downloadItem));
    });
  }

  function shouldPromptForHost(rawSettings, downloadItem) {
    const settings = normalizeSettings(rawSettings);
    const host = getDownloadHost(downloadItem);

    if (!settings.enabled || !settings.askOnFirstDownload || !host || downloadItem.incognito) {
      return { shouldPrompt: false, host };
    }

    if (settings.promptHosts[host] || hasSavedSiteRule(settings, host, downloadItem)) {
      return { shouldPrompt: false, host };
    }

    return { shouldPrompt: true, host };
  }

  function buildRecentRoute(downloadItem, route) {
    const host = getDownloadHost(downloadItem);
    const sourceContext = route && route.sourceContext ? route.sourceContext : getDownloadSourceContext(downloadItem);
    return {
      id: makeId("recent"),
      at: nowIso(),
      host,
      sourceName: sourceContext.sourceName || "",
      gameName: sourceContext.gameName || "",
      gameSlug: sourceContext.gameSlug || "",
      originalFilename: sanitizeFilename(downloadItem && downloadItem.filename, downloadItem && (downloadItem.finalUrl || downloadItem.url)),
      extension: getPrimaryExtension(downloadItem && downloadItem.filename, downloadItem && (downloadItem.finalUrl || downloadItem.url)),
      folder: route && route.routed ? route.folder : "",
      ruleType: route && route.ruleType ? route.ruleType : "default",
      ruleName: route && route.ruleName ? route.ruleName : ""
    };
  }

  function siteRuleIdentity(rule) {
    const value = normalizeSiteRule(rule);
    return [
      value.hostPattern,
      value.sourceGame,
      value.extensionMode,
      value.extensions.slice().sort().join(",")
    ].join("|");
  }

  function upsertSiteRule(existingRules, rawRule) {
    const input = rawRule && typeof rawRule === "object" ? rawRule : {};
    const candidate = normalizeSiteRule(input);
    const rules = normalizeArray(existingRules).map(normalizeSiteRule);
    let index = input.id ? rules.findIndex((rule) => rule.id === String(input.id)) : -1;

    if (index < 0) {
      const identity = siteRuleIdentity(candidate);
      index = rules.findIndex((rule) => siteRuleIdentity(rule) === identity);
    }

    if (index < 0) {
      rules.push(candidate);
      return { created: true, rule: candidate, rules };
    }

    const updated = normalizeSiteRule(Object.assign({}, rules[index], input, { id: rules[index].id }));
    rules[index] = updated;
    return { created: false, rule: updated, rules };
  }

  function fileTypeRuleIdentity(rule) {
    const value = normalizeFileTypeRule(rule);
    return [
      value.extensions.slice().sort().join(","),
      value.mimePatterns.slice().sort().join(",")
    ].join("|");
  }

  function upsertFileTypeRule(existingRules, rawRule) {
    const input = rawRule && typeof rawRule === "object" ? rawRule : {};
    const candidate = normalizeFileTypeRule(input);
    const rules = normalizeArray(existingRules).map(normalizeFileTypeRule);
    let index = input.id ? rules.findIndex((rule) => rule.id === String(input.id)) : -1;

    if (index < 0) {
      const identity = fileTypeRuleIdentity(candidate);
      index = rules.findIndex((rule) => fileTypeRuleIdentity(rule) === identity);
    }

    if (index < 0) {
      rules.push(candidate);
      return { created: true, rule: candidate, rules };
    }

    const updated = normalizeFileTypeRule(Object.assign({}, rules[index], input, { id: rules[index].id }));
    rules[index] = updated;
    return { created: false, rule: updated, rules };
  }

  function validateSettings(rawSettings) {
    const settings = normalizeSettings(rawSettings);
    const errors = [];

    settings.siteRules.forEach((rule, index) => {
      if (!rule.hostPattern) {
        errors.push(`Website folder ${index + 1} is missing a website.`);
      }
      const folderResult = sanitizeDestinationPath(rule.folder);
      if (!folderResult.ok || !folderResult.value) {
        errors.push(`Website folder ${rule.hostPattern || index + 1}: ${folderResult.error || "folder is required"}`);
      }
      if (rule.extensionMode !== "all" && !rule.extensions.length) {
        errors.push(`Website folder ${rule.hostPattern || index + 1} needs at least one file ending.`);
      }
    });

    settings.fileTypeRules.forEach((rule, index) => {
      if (!rule.extensions.length && !rule.mimePatterns.length) {
        errors.push(`File type folder ${rule.name || index + 1} needs file endings or an advanced match.`);
      }
      const folderResult = sanitizeDestinationPath(rule.folder);
      if (!folderResult.ok || !folderResult.value) {
        errors.push(`File type folder ${rule.name || index + 1}: ${folderResult.error || "folder is required"}`);
      }
    });

    return errors;
  }

  function prepareSettingsImport(input) {
    const errors = [];
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {
        settings: null,
        errors: ["The backup must contain a settings object."],
        summary: null
      };
    }

    const version = Number(input.version);
    if (Number.isFinite(version) && version > SETTINGS_VERSION) {
      errors.push(`This backup was created by a newer Tidy Downloads version (${version}).`);
    }

    ["siteRules", "fileTypeRules", "recentRoutes"].forEach((property) => {
      if (input[property] !== undefined && !Array.isArray(input[property])) {
        errors.push(`${property} must be a list.`);
      }
    });
    if (input.promptHosts !== undefined && (
      !input.promptHosts
      || typeof input.promptHosts !== "object"
      || Array.isArray(input.promptHosts)
    )) {
      errors.push("promptHosts must be an object.");
    }

    const siteRuleCount = Array.isArray(input.siteRules) ? input.siteRules.length : 0;
    const fileTypeRuleCount = Array.isArray(input.fileTypeRules) ? input.fileTypeRules.length : 0;
    if (siteRuleCount + fileTypeRuleCount > MAX_SETTINGS_IMPORT_RULES) {
      errors.push(`A backup can contain at most ${MAX_SETTINGS_IMPORT_RULES} folder rules.`);
    }

    const promptHostCount = input.promptHosts && typeof input.promptHosts === "object" && !Array.isArray(input.promptHosts)
      ? Object.keys(input.promptHosts).length
      : 0;
    if (promptHostCount > MAX_SETTINGS_IMPORT_PROMPT_HOSTS) {
      errors.push(`A backup can contain at most ${MAX_SETTINGS_IMPORT_PROMPT_HOSTS} remembered websites.`);
    }

    if (errors.length) {
      return { settings: null, errors, summary: null };
    }

    const settings = normalizeSettings(input);
    errors.push(...validateSettings(settings));
    if (errors.length) {
      return { settings: null, errors, summary: null };
    }

    const siteRules = settings.siteRules || [];
    const fileTypeRules = settings.fileTypeRules || [];
    const allRules = siteRules.concat(fileTypeRules);
    const absoluteDestinations = Array.from(new Set(
      allRules
        .map((rule) => rule.folder)
        .filter((folder) => folder && getDestinationKind(folder) === "absolute")
    ));
    const enabledSiteRuleCount = siteRules.filter((rule) => rule.enabled).length;
    const enabledFileTypeRuleCount = fileTypeRules.filter((rule) => rule.enabled).length;
    const overwriteEnabled = settings.conflictAction === "overwrite";

    return {
      settings,
      errors,
      summary: {
        sortingEnabled: settings.enabled,
        siteRuleCount: siteRules.length,
        fileTypeRuleCount: fileTypeRules.length,
        enabledSiteRuleCount,
        enabledFileTypeRuleCount,
        enabledRuleCount: enabledSiteRuleCount + enabledFileTypeRuleCount,
        absoluteDestinations,
        conflictAction: settings.conflictAction,
        overwriteEnabled,
        requiresHazardConfirmation: overwriteEnabled || absoluteDestinations.length > 0
      }
    };
  }

  globalScope.DownloadRouterCore = {
    DEFAULT_HISTORY_LIMIT,
    HISTORY_LIMITS: Array.from(HISTORY_LIMITS),
    MAX_RECENT_ROUTES,
    MAX_SETTINGS_IMPORT_BYTES,
    MAX_SETTINGS_IMPORT_PROMPT_HOSTS,
    MAX_SETTINGS_IMPORT_RULES,
    NATIVE_HOST_NAME,
    STAGING_FOLDER,
    PRESET_FILE_TYPE_RULES: deepClone(PRESET_FILE_TYPE_RULES),
    SETTINGS_VERSION,
    buildRecentRoute,
    computeRoute,
    defaultSettings,
    extractNexusGameSlugFromUrl,
    findMatchingFileTypeRule,
    findMatchingSiteRule,
    friendlyGameName,
    gameMatchKey,
    getDownloadHost,
    getDownloadSourceContext,
    getExtensionCandidates,
    getPrimaryExtension,
    hasSavedSiteRule,
    hostMatches,
    makeId,
    normalizeFileTypeRule,
    normalizeGamePattern,
    normalizeHostPattern,
    normalizeSettings,
    normalizeSiteRule,
    prepareSettingsImport,
    resolveFolderTemplate,
    sanitizeFilename,
    sanitizeDestinationPath,
    sanitizeFolderPath,
    sourceGameMatches,
    shouldPromptForHost,
    suggestFoldersForExtension,
    suggestFoldersForHost,
    uniqueMimePatterns,
    uniqueNormalizedExtensions,
    upsertFileTypeRule,
    upsertSiteRule,
    validateSettings
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
