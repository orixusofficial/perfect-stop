/**
 * Build a self-contained CrazyGames-ready HTML5 export.
 *
 * Runs `next build` (output: "export" → out/), validates that no asset
 * reference is absolute (a leading "/" escapes the game folder on portal
 * hosting), then mirrors the result into perfect-stop-html5/.
 *
 * Usage: npm run export:crazygames
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
const exportDir = path.join(root, "perfect-stop-html5");
const TEXT_EXT = new Set([".html", ".htm", ".txt", ".js", ".css", ".json", ".svg"]);

function fail(message) {
  console.error(`\nEXPORT FAILED: ${message}`);
  process.exit(1);
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

// 1. Build the static export.
console.log("[1/3] next build");
const build = spawnSync("set EXPORT_MODE=true && npm run build", {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if (build.status !== 0) fail("next build did not exit cleanly");
if (!existsSync(path.join(outDir, "index.html"))) {
  fail("out/index.html missing — output: \"export\" is not active");
}

// 2. Validate every reference. Absolute root paths ("/_next/…", "/audio/…",
//    href="/…") resolve against the portal's origin, not the game folder.
console.log("[2/3] validating asset references");
const problems = [];
for (const file of walk(outDir)) {
  const ext = path.extname(file).toLowerCase();
  if (!TEXT_EXT.has(ext)) continue;
  const rel = path.relative(outDir, file).split(path.sep).join("/");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const checks = [];
  if (ext === ".html" || ext === ".htm" || ext === ".txt") {
    checks.push([/(?:href|src)="\/(?!\/)/, "absolute href/src"]);
    checks.push([/(?:href|src)='\/(?!\/)/, "absolute href/src"]);
    checks.push([/["'`]\/_next\//, "absolute _next path"]);
    checks.push([/["'`]\/audio\//, "absolute audio path"]);
  } else if (ext === ".css") {
    checks.push([/url\(\s*["']?\/(?!\/)/, "absolute url()"]);
    checks.push([/["'`]\/_next\//, "absolute _next path"]);
  } else if (ext === ".js") {
    // Build-manifest rewrite metadata ("/_next/:path+") is consumed by the
    // Next server only; a static host never applies it, so it is inert here.
    if (!/Manifest\.js$/.test(rel)) {
      checks.push([/["'`]\/_next\//, "absolute _next path"]);
    }
    checks.push([/["'`]\/audio\//, "absolute audio path"]);
  }
  for (const [re, label] of checks) {
    const match = text.match(re);
    if (match) problems.push(`${rel}: ${label} → ${match[0]}`);
  }
}
if (problems.length > 0) {
  console.error(problems.slice(0, 20).join("\n"));
  fail(`${problems.length} absolute reference(s) found`);
}

// 3. Publish a clean copy for upload.
console.log("[3/3] writing perfect-stop-html5/");
rmSync(exportDir, { recursive: true, force: true });
cpSync(outDir, exportDir, { recursive: true });
const count = walk(exportDir).length;

console.log(`\nOK — ${count} files in perfect-stop-html5/`);
console.log("Upload the CONTENTS of that folder (index.html at the zip root).");
console.log("Verify first: npm run verify:export");
