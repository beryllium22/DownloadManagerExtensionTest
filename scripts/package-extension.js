"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const projectRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.json"), "utf8"));
const outputName = `tidy-downloads-for-brave-${manifest.version}`;
const outputDir = path.join(projectRoot, "dist", outputName);
const zipPath = path.join(projectRoot, "dist", `${outputName}.zip`);

const rootFiles = [
  "README.md",
  "background.js",
  "first-run.html",
  "manifest.json",
  "options.html",
  "popup.html"
];
const directories = ["icons", "src", "styles"];

function listedFiles() {
  const entries = rootFiles.map((file) => ({
    archiveName: file,
    source: path.join(projectRoot, file)
  }));
  directories.forEach((directory) => {
    walkFiles(path.join(projectRoot, directory), directory, entries);
  });
  fs.readdirSync(path.join(projectRoot, "native-host")).sort().forEach((name) => {
    const source = path.join(projectRoot, "native-host", name);
    if (fs.statSync(source).isFile()) {
      entries.push({ archiveName: `native-host/${name}`, source });
    }
  });
  return entries;
}

function walkFiles(directory, relativeDirectory, entries) {
  fs.readdirSync(directory).sort().forEach((name) => {
    const source = path.join(directory, name);
    const archiveName = `${relativeDirectory}/${name}`;
    if (fs.statSync(source).isDirectory()) {
      walkFiles(source, archiveName, entries);
      return;
    }
    entries.push({ archiveName, source });
  });
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function zipFiles(entries, destination) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime(new Date());

  entries.forEach((entry) => {
    const data = fs.readFileSync(entry.source);
    const name = Buffer.from(entry.archiveName.replace(/\\/g, "/"), "utf8");
    const compressed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.dosTime, 10);
    local.writeUInt16LE(stamp.dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.dosTime, 12);
    central.writeUInt16LE(stamp.dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  fs.writeFileSync(destination, Buffer.concat(localParts.concat(centralParts, end)));
}

function copyUnpacked(entries) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  entries.forEach((entry) => {
    const destination = path.join(outputDir, entry.archiveName);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(entry.source, destination);
  });
}

function main() {
  const entries = listedFiles();
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  copyUnpacked(entries);
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  zipFiles(entries, zipPath);
  console.log(`Packaged ${entries.length} files`);
  console.log(outputDir);
  console.log(zipPath);
}

if (require.main === module) {
  main();
}

module.exports = { listedFiles, zipFiles };
