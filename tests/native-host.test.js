const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const path = require("node:path");

const hostPath = path.resolve(__dirname, "..", "native-host", "tidy-downloads-host.ps1");

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
