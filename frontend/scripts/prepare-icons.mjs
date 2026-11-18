import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Read Android branding without modifying it. Generated assets stay in web/.
const root = new URL("../", import.meta.url);
const source = new URL(
  "../app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
  root,
);
const publicDir = new URL("public/", root);
const icons = new URL("icons/", publicDir);
await mkdir(icons, { recursive: true });
await copyFile(source, new URL("icon-192.png", icons));
await sharp(fileURLToPath(source))
  .resize(512, 512)
  .png()
  .toFile(fileURLToPath(new URL("icon-512.png", icons)));
await sharp(fileURLToPath(source))
  .resize(180, 180)
  .png()
  .toFile(fileURLToPath(new URL("apple-touch-icon.png", icons)));
await sharp(fileURLToPath(source))
  .resize(48, 48)
  .png()
  .toFile(fileURLToPath(new URL("favicon.png", publicDir)));
const inset = await sharp(fileURLToPath(source))
  .resize(328, 328)
  .png()
  .toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#1d4ed8" },
})
  .composite([{ input: inset, left: 92, top: 92 }])
  .png()
  .toFile(fileURLToPath(new URL("maskable-512.png", icons)));
console.log("Prepared VibeLoad web icons; Android assets were read only.");
