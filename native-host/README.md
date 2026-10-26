# Tidy Downloads Native Helper

Full Windows paths such as `D:\Games\Skyrim\Mods` require this helper.

Why: Chromium extensions can only choose download paths inside the browser's normal Downloads folder. Tidy Downloads first saves absolute-path downloads into a staging folder, then asks this helper to move the completed file to the folder you chose.

## Install

1. Load the extension in Brave.
2. Open `brave://extensions`.
3. Copy the extension ID shown for Tidy Downloads.
4. Run:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\native-host\install-native-host.ps1 -ExtensionId YOUR_EXTENSION_ID
```

5. Restart Brave.
6. Open Tidy Downloads settings and choose `Check Helper`.

The installer copies the helper to `%LOCALAPPDATA%\Tidy Downloads\native-host` and writes user-level registry keys under `HKCU`, so it does not need administrator access. Moving this project folder later does not disconnect the helper. The registry entries cover Brave stable, Beta, Dev, and Nightly, plus Chrome, Chromium, and Edge.

## Uninstall

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\native-host\uninstall-native-host.ps1
```
