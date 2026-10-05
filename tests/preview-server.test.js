const assert = require("node:assert/strict");
const http = require("node:http");

const { createPreviewServer } = require("./preview-server.js");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function request(port, pathname, options) {
  const requestOptions = options || {};
  return new Promise((resolve, reject) => {
    const clientRequest = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: requestOptions.method || "GET",
      headers: {
        Host: requestOptions.host || `127.0.0.1:${port}`
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    clientRequest.on("error", reject);
    clientRequest.end();
  });
}

async function run() {
  const server = createPreviewServer();
  const port = await listen(server);

  try {
    const root = await request(port, "/");
    assert.equal(root.statusCode, 200);
    assert.match(root.body, /<title>Tidy Downloads Settings<\/title>/);
    assert.match(root.body, /<script src="\/tests\/browser-mock\.js"><\/script>/);
    assert.match(root.headers["content-security-policy"], /default-src 'self'/);
    assert.equal(root.headers["x-content-type-options"], "nosniff");

    const allowedPaths = [
      "/options.html?preview=fresh",
      "/popup.html",
      "/first-run.html",
      "/styles/ui.css",
      "/src/core.js",
      "/src/storage.js",
      "/src/options.js",
      "/src/popup.js",
      "/src/first-run.js",
      "/tests/browser-mock.js"
    ];
    for (const pathname of allowedPaths) {
      const response = await request(port, pathname);
      assert.equal(response.statusCode, 200, `${pathname} should be previewable`);
    }

    const blockedPaths = [
      "/.git/config",
      "/package.json",
      "/README.md",
      "/background.js",
      "/native-host/tidy-downloads-host.ps1",
      "/dist/tidy-downloads-for-brave-1.0.0/background.js",
      "/.brave-test-profile-2/History",
      "/tests/preview-server.js",
      "/src/%2e%2e/package.json"
    ];
    for (const pathname of blockedPaths) {
      const response = await request(port, pathname);
      assert.notEqual(response.statusCode, 200, `${pathname} must not be served`);
    }

    const wrongHost = await request(port, "/options.html", { host: "attacker.example" });
    assert.equal(wrongHost.statusCode, 421);

    const head = await request(port, "/options.html", { method: "HEAD" });
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, "");

    const post = await request(port, "/options.html", { method: "POST" });
    assert.equal(post.statusCode, 405);
    assert.equal(post.headers.allow, "GET, HEAD");

    console.log("preview server security tests passed");
  } finally {
    await close(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
