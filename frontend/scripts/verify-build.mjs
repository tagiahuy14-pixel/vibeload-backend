import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const sw = readFileSync("dist/sw.js", "utf8");
const match = sw.match(/const FILES = (\[[^\n]+\])/);
assert(match, "Build must emit a precache list");
const paths = JSON.parse(match[1]);
assert(
  paths.includes("/index.html"),
  "Offline navigation needs a cached HTML app shell",
);
for (const path of paths) {
  assert(
    !path.includes("://") && path.startsWith("/"),
    "Only same-origin app assets may be cached",
  );
  assert(
    existsSync(resolve("dist", path.slice(1))),
    `Missing precached file: ${path}`,
  );
}
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
assert.equal(manifest.start_url, "/");
assert.equal(manifest.display, "standalone");
for (const icon of manifest.icons) {
  const png = readFileSync(resolve("dist", icon.src.slice(1)));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
}
const scripts = readdirSync("dist/assets")
  .filter((name) => name.endsWith(".js"))
  .map((name) => readFileSync(`dist/assets/${name}`));
const javascript = scripts.map((content) => content.toString()).join("\n");
assert(
  javascript.includes("/sw.js") && javascript.includes("serviceWorker"),
  "Build must retain production PWA registration",
);
assert(
  !javascript.includes("Download the React DevTools"),
  "Development React was emitted",
);
console.log(
  `Build verified: offline HTML + ${manifest.icons.length} PWA icons; JavaScript ${scripts.reduce((sum, content) => sum + gzipSync(content).length, 0)} bytes gzip.`,
);
