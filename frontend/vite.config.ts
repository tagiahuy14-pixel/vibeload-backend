import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function appShell(): Plugin {
  return {
    name: "vibeload-offline-shell",
    apply: "build",
    enforce: "post",
    generateBundle: {
      order: "post",
      handler(_, bundle) {
        if (!bundle["index.html"])
          throw new Error("Missing HTML app shell in PWA build");
        const files = Object.keys(bundle)
          .filter((name) => !name.endsWith(".map"))
          .map((name) => `/${name}`);
        files.push(
          "/manifest.webmanifest",
          "/favicon.png",
          "/icons/icon-192.png",
          "/icons/icon-512.png",
          "/icons/maskable-512.png",
          "/icons/apple-touch-icon.png",
        );
        const version = createHash("sha256");
        for (const item of Object.values(bundle))
          version.update(item.type === "chunk" ? item.code : item.source);
        for (const path of files.filter((path) => !bundle[path.slice(1)]))
          version.update(readFileSync(`public${path}`));
        const template = readFileSync("src/sw-template.js", "utf8");
        version.update(template);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: template
            .replace("__CACHE_VERSION__", version.digest("hex").slice(0, 16))
            .replace("__PRECACHE_FILES__", JSON.stringify(files)),
        });
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), appShell()],
  build: {
    target: "es2022",
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            { name: "icons", test: /node_modules[\\/]lucide-react[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    strictPort: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  preview: { strictPort: true, port: 4173 },
});
