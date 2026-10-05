# Tidy Downloads for Brave

### Built for modders. Made for manual downloads.

**Spend less time hunting through archives—and more time building your next mod setup.**

Manual mod downloads add up quickly. A few files from Nexus Mods become a crowded Downloads folder: different games, patches, textures, optional files, and archives you meant to install later. Before long, finding the right download becomes another job.

**Tidy Downloads for Brave** is a lightweight browser extension built for game modders who want a clearer way to organize and keep track of those manual downloads. It routes new files into folders you choose, separates Nexus Mods downloads by game when game information is available, and gives you an optional local view of recent routing activity.

It is not a mod manager. It does not install mods, manage load orders, or resolve dependencies. It handles the step before that: keeping the files you download organized and easy to find.

## 🎮 Give every game's downloads a home

Instead of mixing Skyrim and Fallout archives together, use one Nexus Mods rule with a game-aware destination:

```text
Mods/Nexus Mods/{game}
```

When the download page, URL, or referrer identifies the game, files can land in folders such as:

```text
Downloads/
└── Mods/
    └── Nexus Mods/
        ├── Skyrim Special Edition/
        └── Fallout 4/
```

Add game-specific rules when you want more control, or use the shared rule to keep recognized games separated automatically.

## Keep track of what you downloaded—and where it went

The optional recent-activity view shows filenames, websites, available game/source information, and routing destinations. It helps answer the everyday modding question:

> “Where did that archive I just downloaded end up?”

This is a local routing record, not a mod-version tracker or a permanent archive catalogue.

## Your websites. Your folders. Your workflow.

- **Organize by source.** Give Nexus Mods and other download websites their own destinations.
- **Organize by file type.** Create rules for ZIP, 7z, RAR, and other file endings, alongside categories for documents and media.
- **Refine your rules.** Use game-specific matching, subdomains, and file endings where a general website rule is not enough.
- **Choose a local drive folder.** The optional Windows native helper moves completed downloads into your chosen folder, including destinations on another drive.
- **Add rules as you browse.** Use a page context-menu shortcut or an optional first-download prompt.
- **Stay in control.** Pause routing, switch website/file-type priority, turn activity history off, and export or restore your configuration.

Downloads without a matching rule keep Brave's normal download behavior.

## Local settings, without cloud sync

Rules and recent activity are stored locally in extension storage. Recent activity does not retain full download URLs or their query parameters. Incognito downloads are excluded from recent activity and first-download prompts; downloads requiring a native move stay with the browser's normal destination in incognito.

Exported settings may include remembered websites, filenames, destinations, and activity timestamps. Treat those backups as private.

## Start simple. Expand when you need to.

Load the extension in Brave, add a Nexus Mods website rule, and choose a game-aware folder. Subfolders inside Brave's normal Downloads location work without additional software. Full Windows drive paths require the separately installed native helper.

---

**For modders who download manually—and want the files, not the folder chaos.**

---

## Installation and technical reference

## Folder modes

Subfolders work immediately:

- `Media/Videos`
- `Mods/Nexus Mods`

These save inside Brave's normal Downloads folder.

Full Windows folders need the native helper:

- `D:\Games\Skyrim\Mods`
- `D:\Media\Videos`

Chromium does not allow extensions to directly choose arbitrary drive paths. Tidy Downloads handles this by saving the file to a staging folder first, then asking the local helper to move it after the download finishes.

## Nexus Mods game sorting

Tidy Downloads can detect the Nexus game from the download page, final URL, or referrer when the URL includes a game path such as:

- `https://www.nexusmods.com/skyrimspecialedition/mods/123`
- `https://www.nexusmods.com/fallout4/mods/456`

Use `{game}` in a website folder to automatically split one Nexus rule by game:

- Website: `nexusmods.com`
- Folder: `Mods/Nexus Mods/{game}`

That routes downloads into folders like:

- `Mods/Nexus Mods/Skyrim Special Edition`
- `Mods/Nexus Mods/Fallout 4`

For game-specific rules, open a website rule, expand **Advanced matching**, and fill in **Limit to a game or source** with a Nexus game name, game slug, or game URL. Leave it empty when one rule should cover every game on the site.

## Install in Brave

1. Open `brave://extensions`.
2. Turn on `Developer mode`.
3. Choose `Load unpacked`.
4. Select the project folder that contains `manifest.json`.

## Enable full drive paths

1. Load the extension in Brave.
2. Open `brave://extensions`.
3. Copy the extension ID for Tidy Downloads.
4. Run:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\native-host\install-native-host.ps1 -ExtensionId YOUR_EXTENSION_ID
```

5. Restart Brave.
6. Open Tidy Downloads settings and choose `Check Helper`.

If a completed file could not be moved because the helper was unavailable, the pending move is kept. Install or restart the helper, then use **Retry Pending Moves** in settings.

## Recommended first setup

1. Open the extension settings.
2. Choose `Add Suggested Folders`.
3. Add special websites you care about, such as Nexus Mods.
4. Leave unknown sites alone; they will keep using Brave's normal Downloads folder unless you save a folder for them.

## Rule priority

When several website rules match, the most specific rule wins automatically. Game-specific, file-ending-specific, and subdomain-specific rules take priority over a general website rule. Within file type rules, a narrow exact file-ending rule takes priority over a broader preset.

## Development

Run the syntax and routing tests with:

```powershell
npm test
```

Preview the popup and settings pages with realistic local sample data:

```powershell
npm run preview
```

Then open `http://127.0.0.1:4174/options.html` or `http://127.0.0.1:4174/popup.html`. The preview mock is only injected by the development server; it is never loaded by the extension. The server listens only on loopback and exposes only the UI files required by those previews.

Build a versioned unpacked folder and ZIP in `dist` with:

```powershell
npm run package
```
