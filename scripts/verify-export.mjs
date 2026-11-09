/**
 * Serve perfect-stop-html5/ over HTTP and prove every referenced asset loads.
 *
 *   node scripts/verify-export.mjs           run checks, exit 1 on any failure
 *   node scripts/verify-export.mjs --serve   keep serving on :4173 (browser tests)
 *
 * Checks: HTML/CSS/JS references resolve with 200, every file on disk is
 * reachable, MIME types are correct for CSS/JS/fonts/audio, no absolute
 * root-path references, and the Turbopack chunk base is relative.
 */
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportDir = path.join(root, "perfect-stop-html5");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
};

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function startServer(port) {
  const server = http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = path.join(exportDir, urlPath);
    if (!file.startsWith(exportDir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" }).end(`404 ${urlPath}`);
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function extractRefs(html) {
  const refs = new Set();
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/(?:href|src)='([^']+)'/g)) refs.add(m[1]);
  return [...refs];
}

function extractCssUrls(css) {
  const urls = [];
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) urls.push(m[1]);
  return urls;
}

async function runChecks(port) {
  const base = `http://127.0.0.1:${port}/`;
  const failures = [];
  let requests = 0;

  async function get(ref, expectedTypes = []) {
    const url = new URL(ref, base);
    requests += 1;
    const res = await fetch(url);
    const type = res.headers.get("content-type") ?? "";
    if (res.status !== 200) {
      failures.push(`${res.status} ${url.pathname}`);
      return { ok: false, text: "", url };
    }
    if (expectedTypes.length > 0 && !expectedTypes.some((t) => type.includes(t))) {
      failures.push(`bad MIME "${type}" for ${url.pathname} (expected ${expectedTypes.join("|")})`);
    }
    const text = ["text/", "application/json", "javascript"].some((p) => type.includes(p))
      ? await res.text()
      : "";
    return { ok: true, text, url };
  }

  if (!existsSync(path.join(exportDir, "index.html"))) {
    console.error("perfect-stop-html5/index.html missing — run `npm run export:crazygames` first");
    process.exit(1);
  }

  const page = await get("index.html", ["text/html"]);
  if (!page.ok) {
    console.error("FATAL: index.html does not load");
    process.exit(1);
  }

  // Absolute root references would escape the game folder on CrazyGames.
  for (const bad of page.text.match(/(?:href|src)="\/(?!\/)[^"]*"/g) ?? []) {
    failures.push(`absolute reference in index.html: ${bad}`);
  }

  // Every reference in the HTML.
  const cssTexts = [];
  for (const ref of extractRefs(page.text)) {
    if (ref.startsWith("data:") || ref.startsWith("#")) continue;
    if (ref.startsWith("http")) {
      failures.push(`external reference in index.html: ${ref}`);
      continue;
    }
    const types = ref.endsWith(".css") ? ["text/css"]
      : ref.endsWith(".js") ? ["javascript"]
      : ref.endsWith(".woff2") ? ["font/woff2"]
      : [];
    const r = await get(ref, types);
    if (r.ok && ref.endsWith(".css")) cssTexts.push({ url: r.url, text: r.text });
  }

  // Font/media URLs declared inside CSS.
  for (const css of cssTexts) {
    for (const u of extractCssUrls(css.text)) {
      if (u.startsWith("data:")) continue;
      await get(new URL(u, css.url).href, u.endsWith(".woff2") ? ["font/woff2"] : []);
    }
  }

  // Runtime-loaded files (not present in HTML).
  for (const audio of ["audio/music1-15.mp3", "audio/music16-plus.mp3"]) {
    await get(audio, ["audio/mpeg"]);
  }

  // The Turbopack runtime must use a relative chunk base.
  const chunksDir = path.join(exportDir, "_next", "static", "chunks");
  const runtime = existsSync(chunksDir)
    ? readdirSync(chunksDir).find((f) => f.startsWith("turbopack-"))
    : undefined;
  if (!runtime) {
    failures.push("turbopack runtime chunk missing");
  } else {
    const r = await get(`_next/static/chunks/${runtime}`, ["javascript"]);
    if (r.ok && !r.text.includes('"./_next/"')) {
      failures.push(`turbopack chunk base is not "./_next/" in ${runtime}`);
    }
  }

  // Every file on disk must be servable (catches path/MIME issues wholesale).
  for (const file of walk(exportDir)) {
    const rel = path.relative(exportDir, file).split(path.sep).join("/");
    await get(encodeURI(rel));
  }

  return { requests, failures };
}

const serve = process.argv.includes("--serve");
const portArg = process.argv.indexOf("--port");
const port = portArg !== -1 ? Number(process.argv[portArg + 1]) : serve ? 4173 : 0;
const { server, port: bound } = await startServer(port);

if (serve) {
  console.log(`serving perfect-stop-html5/ at http://127.0.0.1:${bound}/`);
} else {
  const { requests, failures } = await runChecks(bound);
  server.close();
  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s) out of ${requests} requests:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`\nOK — ${requests} requests, all 200, MIME types correct, no absolute references.`);
}
