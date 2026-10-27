# Changelog

## Unreleased

- Nexus game pages, download popups, and numeric game ids resolve to the game folder. A page path wins over a conflicting `?game=` value, and site sections such as collections or search are not treated as games.
- A missing `{game}` token no longer creates an "Unknown Game" folder. Empty pieces of a folder template are dropped, so the file still lands in the rest of the path.
- Folder and file names are cleaned for Windows: illegal characters, trailing dots and spaces, reserved names such as `CON`, hidden characters, and paths that are too long.
- Files staged for a move onto another drive are never replaced in the staging folder. The helper still follows Replace only for the final file, and it will not overwrite a folder or delete the old file before the new one is in place.
- A restart of the extension no longer starts a second move for the same download, and it does not ask the helper to move a file that never reached the staging folder.
- Older activity lists keep the newest entries when settings are saved again, and an older "leave this site alone" answer is kept.

## 1.2.0

- Settings are organized into Home, Websites, File types, Behavior, and Activity.
- Website rules can save a site, or one game on that site, into a folder. `{game}` fills in the Nexus Mods game name.
- File type rules can save videos, archives, and other kinds of files into their own folders.
- The toolbar popup shows where the next download from the current page will go, and suggests a folder for that site.
- Downloads that belong on another drive are staged inside Downloads, then moved by the optional Windows helper.
- Activity stays on this computer. It records the file name, website, and folder, not the full download link. Private windows are not recorded and stay in the normal Downloads folder.
