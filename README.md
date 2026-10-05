# Tidy Downloads for Brave

A lightweight Chromium extension that helps Brave save downloads into folders automatically.

You can sort downloads by:

- Website, such as `nexusmods.com` to `Mods/Nexus Mods`
- Nexus Mods game, such as `nexusmods.com` to `Mods/Nexus Mods/{game}`
- Full computer folder, such as `nexusmods.com` to `D:\Games\Skyrim\Mods`
- File type, such as `.mp4` to `Media/Videos`
- Broad media type, such as videos, audio, pictures, documents, compressed files, and installers

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

## Privacy and safety

- Folder names are checked before saving.
- Absolute paths are handled by the native helper and still block obvious system folders.
- The helper only accepts files created inside the Tidy Downloads staging folder.
- Parent folders like `../Something` are blocked.
- System-looking folders are blocked to avoid confusing or unsafe destinations.
- Recent activity is stored only in extension storage and can be turned off.
- Recent activity does not retain full download URLs or URL query data.
- Incognito downloads do not trigger the first-time website prompt or appear in recent activity.
- Incognito downloads that match a full Windows path stay with the browser's normal download destination and are never sent to the native helper.
- Restoring a backup always shows the normalized settings first; full paths and overwrite behavior require an extra acknowledgment.

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
