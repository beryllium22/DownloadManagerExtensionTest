const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.json"), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, packageJson.version);
assert.equal(fs.existsSync(path.join(projectRoot, manifest.background.service_worker)), true);
assert.equal(fs.existsSync(path.join(projectRoot, manifest.action.default_popup)), true);
assert.equal(fs.existsSync(path.join(projectRoot, manifest.options_page)), true);

Object.entries(manifest.icons).forEach(([declaredSize, iconPath]) => {
  const icon = fs.readFileSync(path.join(projectRoot, iconPath));
  assert.equal(icon.subarray(1, 4).toString("ascii"), "PNG", `${iconPath} is not a PNG`);
  assert.equal(icon.readUInt32BE(16), Number(declaredSize), `${iconPath} has the wrong width`);
  assert.equal(icon.readUInt32BE(20), Number(declaredSize), `${iconPath} has the wrong height`);
});

console.log("manifest tests passed");
