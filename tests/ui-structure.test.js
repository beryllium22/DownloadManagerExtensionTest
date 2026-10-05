const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const pages = [
  { html: "options.html", script: "src/options.js" },
  { html: "popup.html", script: "src/popup.js" },
  { html: "first-run.html", script: "src/first-run.js" }
];

pages.forEach(({ html, script }) => {
  const markup = fs.readFileSync(path.join(projectRoot, html), "utf8");
  const source = fs.readFileSync(path.join(projectRoot, script), "utf8");
  const ids = Array.from(markup.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${html} contains duplicate IDs`);

  const bindingBlock = source.match(/function bindElements\(\) \{[\s\S]*?\[([\s\S]*?)\]\.forEach/);
  assert.ok(bindingBlock, `${script} is missing its element binding list`);
  const boundIds = Array.from(bindingBlock[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
  boundIds.forEach((id) => {
    assert.ok(ids.includes(id), `${script} binds #${id}, but ${html} does not define it`);
  });

  Array.from(markup.matchAll(/aria-controls="([^"]+)"/g), (match) => match[1]).forEach((id) => {
    assert.ok(ids.includes(id), `${html} points aria-controls at missing #${id}`);
  });
  Array.from(markup.matchAll(/aria-labelledby="([^"]+)"/g), (match) => match[1]).forEach((id) => {
    assert.ok(ids.includes(id), `${html} points aria-labelledby at missing #${id}`);
  });
  Array.from(markup.matchAll(/aria-describedby="([^"]+)"/g), (match) => match[1]).forEach((id) => {
    assert.ok(ids.includes(id), `${html} points aria-describedby at missing #${id}`);
  });
});

const optionsMarkup = fs.readFileSync(path.join(projectRoot, "options.html"), "utf8");
const optionsSource = fs.readFileSync(path.join(projectRoot, "src/options.js"), "utf8");
[
  "restore-dialog",
  "restore-sorting-status",
  "restore-enabled-rule-count",
  "restore-collision-status",
  "restore-path-list",
  "restore-warning",
  "restore-confirm-checkbox",
  "cancel-restore",
  "apply-restore"
].forEach((id) => {
  assert.match(optionsMarkup, new RegExp(`id="${id}"`), `options.html is missing #${id}`);
});

const importStart = optionsSource.indexOf("async function importSettings");
const previewStart = optionsSource.indexOf("function openRestoreDialog", importStart);
const applyStart = optionsSource.indexOf("async function applySettingsImport", previewStart);
const applyEnd = optionsSource.indexOf("function updateRestoreApplyState", applyStart);
assert.ok(importStart >= 0 && previewStart > importStart && applyStart > previewStart && applyEnd > applyStart);
const importBlock = optionsSource.slice(importStart, previewStart);
const applyBlock = optionsSource.slice(applyStart, applyEnd);
assert.match(importBlock, /Core\.prepareSettingsImport\(imported\)/);
assert.match(importBlock, /Core\.MAX_SETTINGS_IMPORT_BYTES/);
assert.doesNotMatch(importBlock, /Store\.saveSettings/, "selecting a backup must not write settings");
assert.equal((applyBlock.match(/Store\.saveSettings/g) || []).length, 1, "only explicit restore approval should save the staged settings");
assert.match(applyBlock, /restore-confirm-checkbox/);

console.log("UI structure tests passed");
