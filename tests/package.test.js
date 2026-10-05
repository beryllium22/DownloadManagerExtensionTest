const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.json"), "utf8"));
const packageName = `tidy-downloads-for-brave-${manifest.version}`;
const packageRoot = path.join(projectRoot, "dist", packageName);
const archivePath = path.join(projectRoot, "dist", `${packageName}.zip`);
const rootFiles = [
  "README.md",
  "background.js",
  "first-run.html",
  "manifest.json",
  "options.html",
  "popup.html"
];

function listFiles(root, relativeRoot) {
  const relative = relativeRoot || "";
  const directory = path.join(root, relative);
  const output = [];
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      output.push(...listFiles(root, child));
    } else if (entry.isFile()) {
      output.push(child.split(path.sep).join("/"));
    }
  });
  return output;
}

function expectedFiles() {
  const files = rootFiles.slice();
  ["icons", "src", "styles"].forEach((directory) => {
    files.push(...listFiles(projectRoot, directory));
  });
  fs.readdirSync(path.join(projectRoot, "native-host"), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .forEach((entry) => files.push(`native-host/${entry.name}`));
  return files.sort();
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verifyTree(root, expected) {
  const actual = listFiles(root).sort();
  assert.deepEqual(actual, expected, `${root} contains missing or unexpected files`);
  expected.forEach((relativePath) => {
    assert.equal(
      sha256(path.join(root, relativePath)),
      sha256(path.join(projectRoot, relativePath)),
      `${relativePath} is stale in the packaged artifact`
    );
  });
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function run() {
  assert.equal(fs.existsSync(packageRoot), true, `Run npm run package to create ${packageName}`);
  assert.equal(fs.existsSync(archivePath), true, `Run npm run package to create ${packageName}.zip`);

  const expected = expectedFiles();
  verifyTree(packageRoot, expected);

  const extractedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tidy-downloads-package-"));
  try {
    execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath ${quotePowerShellLiteral(archivePath)} -DestinationPath ${quotePowerShellLiteral(extractedRoot)} -Force`
    ], { stdio: "pipe" });
    verifyTree(extractedRoot, expected);
  } finally {
    fs.rmSync(extractedRoot, { recursive: true, force: true });
  }

  const packagedBackground = fs.readFileSync(path.join(packageRoot, "background.js"), "utf8");
  const packagedOptions = fs.readFileSync(path.join(packageRoot, "src/options.js"), "utf8");
  assert.match(packagedBackground, /if \(downloadItem\.incognito\) \{/);
  assert.match(packagedBackground, /!item \|\| item\.incognito \|\| item\.state === "interrupted"/);
  assert.match(packagedOptions, /Core\.prepareSettingsImport\(imported\)/);
  assert.match(packagedOptions, /Store\.saveSettings\(prepared\.settings\)/);

  console.log("packaged artifact parity and security tests passed");
}

run();
