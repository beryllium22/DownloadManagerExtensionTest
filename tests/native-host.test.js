const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const path = require("node:path");

const hostPath = path.resolve(__dirname, "..", "native-host", "tidy-downloads-host.ps1");
const hostSource = fs.readFileSync(hostPath, "utf8");
assert.match(hostSource, /\.tidy-incoming-/);
assert.match(hostSource, /A folder already uses that name/);
assert.doesNotMatch(hostSource, /Remove-Item -LiteralPath \$destination -Force/);
const directoryGuard = hostSource.indexOf("A folder already uses that name");
const replaceIndex = hostSource.indexOf("$replaceExisting");
const copyIndex = hostSource.indexOf("Copy-Item -LiteralPath $sourcePath -Destination $incoming", replaceIndex);
const backupMove = hostSource.indexOf("Move-Item -LiteralPath $destination -Destination $backup", copyIndex);
const incomingMove = hostSource.indexOf("Move-Item -LiteralPath $incoming -Destination $destination", backupMove);
const removeBackup = hostSource.indexOf("Remove-Item -LiteralPath $backup -Force", incomingMove);
const removeSource = hostSource.indexOf("Remove-Item -LiteralPath $sourcePath -Force", removeBackup);
assert.ok(
  directoryGuard > 0
  && replaceIndex > directoryGuard
  && copyIndex > replaceIndex
  && backupMove > copyIndex
  && incomingMove > backupMove
  && removeBackup > incomingMove
  && removeSource > removeBackup,
  "overwrite must copy the new file in before moving the old file aside, and must not delete the download first"
);

function callHost(message) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32LE(payload.length, 0);
    const child = execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", hostPath],
      { encoding: null, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        if (!stdout || stdout.length < 4) {
          reject(new Error("Native host returned an incomplete response."));
          return;
        }
        const responseLength = stdout.readUInt32LE(0);
        const response = JSON.parse(stdout.subarray(4, 4 + responseLength).toString("utf8"));
        resolve(response);
      }
    );
    child.stdin.end(Buffer.concat([length, payload]));
  });
}

async function run() {
  const ping = await callHost({ action: "ping" });
  assert.equal(ping.ok, true);
  assert.equal(ping.name, "com.tidy_downloads.host");

  const rejectedMove = await callHost({
    action: "moveDownload",
    sourcePath: "C:\\Users\\Tester\\Downloads\\outside-staging.zip",
    targetFolder: "D:\\Downloads",
    conflictAction: "uniquify"
  });
  assert.equal(rejectedMove.ok, false);
  assert.match(rejectedMove.error, /staging folder/i);

  console.log("native host tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
