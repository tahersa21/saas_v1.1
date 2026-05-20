/**
 * Production static file server for the dashboard SPA.
 *
 * Why not `vite preview`?  It doesn't support:
 *   - Brotli/gzip pre-compressed file serving (.br / .gz)
 *   - Long-lived cache headers for fingerprinted assets
 *   - Proper SPA fallback with cache control
 *
 * This tiny server replaces `vite preview` in the `serve` script and gives
 * us a significant LCP improvement in PageSpeed by reducing transfer size.
 */
import { createServer } from "node:http";
import { createReadStream, statSync, existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = resolve(__dirname, "dist/public");
const PORT = Number(process.env.PORT ?? 3000);
const BASE = (process.env.BASE_PATH ?? "/").replace(/\/$/, "");

// MIME types
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2",
  ".woff": "font/woff",
  ".ttf":  "font/ttf",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".txt":  "text/plain",
  ".webmanifest": "application/manifest+json",
};

/**
 * Returns true if the file path looks like a Vite-fingerprinted asset
 * (contains a content hash: 8+ hex chars between dashes/dots).
 */
function isHashedAsset(filePath) {
  return /[/-][0-9a-f]{8,}[-.]/i.test(filePath);
}

function serveFile(filePath, req, res) {
  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const hashed = isHashedAsset(filePath);

  // Pick the best pre-compressed variant the client accepts.
  const accept = req.headers["accept-encoding"] ?? "";
  let compressed = null;
  if (accept.includes("br") && existsSync(filePath + ".br")) {
    compressed = { path: filePath + ".br", encoding: "br" };
  } else if (accept.includes("gzip") && existsSync(filePath + ".gz")) {
    compressed = { path: filePath + ".gz", encoding: "gzip" };
  }

  const sourcePath = compressed ? compressed.path : filePath;
  let stat;
  try { stat = statSync(sourcePath); } catch {
    return false; // file not found
  }

  const headers = {
    "Content-Type": mime,
    // Hashed assets are immutable; everything else (index.html) revalidates.
    "Cache-Control": hashed
      ? "public, max-age=31536000, immutable"
      : "no-cache, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Accept-Encoding",
  };
  if (compressed) {
    headers["Content-Encoding"] = compressed.encoding;
  } else {
    headers["Content-Length"] = String(stat.size);
  }

  res.writeHead(200, headers);
  if (req.method === "HEAD") { res.end(); return true; }

  createReadStream(sourcePath).pipe(res);
  return true;
}

const server = createServer((req, res) => {
  // Strip base path prefix so routing works under a sub-path.
  let urlPath = req.url.split("?")[0];
  if (BASE && urlPath.startsWith(BASE)) {
    urlPath = urlPath.slice(BASE.length) || "/";
  }

  // Resolve to an actual file path (prevent traversal).
  const safePath = resolve(DIST, "." + urlPath);
  if (!safePath.startsWith(DIST)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  // 1. Try exact path.
  if (existsSync(safePath) && statSync(safePath).isFile()) {
    serveFile(safePath, req, res); return;
  }

  // 2. Try path + /index.html (directory index).
  const indexPath = join(safePath, "index.html");
  if (existsSync(indexPath)) {
    serveFile(indexPath, req, res); return;
  }

  // 3. SPA fallback — serve root index.html for every unknown route.
  const rootIndex = join(DIST, "index.html");
  if (existsSync(rootIndex)) {
    serveFile(rootIndex, req, res); return;
  }

  res.writeHead(404); res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[dashboard] production server → http://0.0.0.0:${PORT}${BASE || "/"}`);
});
