const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const defaultPort = Number(process.env.TIDY_DOWNLOADS_PREVIEW_PORT) || 4174;
const publicFiles = new Map([
  ["/options.html", "options.html"],
  ["/popup.html", "popup.html"],
  ["/first-run.html", "first-run.html"],
  ["/styles/ui.css", "styles/ui.css"],
  ["/src/core.js", "src/core.js"],
  ["/src/storage.js", "src/storage.js"],
  ["/src/options.js", "src/options.js"],
  ["/src/popup.js", "src/popup.js"],
  ["/src/first-run.js", "src/first-run.js"],
  ["/tests/browser-mock.js", "tests/browser-mock.js"]
]);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

function securityHeaders(contentType) {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Content-Type": contentType || "text/plain; charset=utf-8",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
}

function sendText(response, statusCode, message, extraHeaders) {
  const body = Buffer.from(message);
  response.writeHead(statusCode, Object.assign(
    securityHeaders("text/plain; charset=utf-8"),
    { "Content-Length": body.length },
    extraHeaders || {}
  ));
  response.end(body);
}

function createPreviewServer() {
  let server;
  server = http.createServer((request, response) => {
    if (!request || !["GET", "HEAD"].includes(request.method)) {
      sendText(response, 405, "Method not allowed", { Allow: "GET, HEAD" });
      return;
    }

    const address = server.address();
    const expectedHost = address && typeof address === "object" ? `127.0.0.1:${address.port}` : "";
    if (!expectedHost || request.headers.host !== expectedHost) {
      sendText(response, 421, "Misdirected request");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url || "", "http://127.0.0.1").pathname);
    } catch (_error) {
      sendText(response, 400, "Bad request");
      return;
    }

    if (pathname === "/") {
      pathname = "/options.html";
    }

    const relativePath = publicFiles.get(pathname);
    if (!relativePath) {
      sendText(response, 404, "Not found");
      return;
    }

    const target = path.resolve(projectRoot, relativePath);
    if (!target.startsWith(`${projectRoot}${path.sep}`)) {
      sendText(response, 404, "Not found");
      return;
    }

    fs.readFile(target, (error, input) => {
      if (error) {
        sendText(response, error.code === "ENOENT" ? 404 : 500, "Not found");
        return;
      }

      const extension = path.extname(target).toLowerCase();
      const data = extension === ".html"
        ? Buffer.from(input.toString("utf8").replace(
          "</head>",
          "    <script src=\"/tests/browser-mock.js\"></script>\n  </head>"
        ))
        : input;
      response.writeHead(200, Object.assign(
        securityHeaders(contentTypes[extension]),
        { "Content-Length": data.length }
      ));
      response.end(request.method === "HEAD" ? undefined : data);
    });
  });
  return server;
}

if (require.main === module) {
  const server = createPreviewServer();
  server.listen(defaultPort, "127.0.0.1", () => {
    const address = server.address();
    console.log(`Tidy Downloads preview: http://127.0.0.1:${address.port}/`);
  });
}

module.exports = { createPreviewServer };
