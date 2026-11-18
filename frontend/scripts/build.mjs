import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// A host may export NODE_ENV=development. Always produce the real production
// React bundle and enable import.meta.env.PROD (including service worker setup).
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
    "build",
  ],
  {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, NODE_ENV: "production" },
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
await import("./verify-build.mjs");
