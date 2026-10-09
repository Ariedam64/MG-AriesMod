// Builds a static page that renders the kit in the current theme, over a
// stand-in for the garden, to look at the menus without opening the game.
//
//   node scripts/kitPreview.mjs   ->  node_modules/.cache/kit-preview.html

import esbuild from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache");
mkdirSync(OUT, { recursive: true });

const result = await esbuild.build({
  entryPoints: [join(ROOT, "scripts", "kitPreviewEntry.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  write: false,
  logLevel: "error",
  define: { __ARIES_MOD_VERSION__: JSON.stringify("preview") },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\/script");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kit preview</title>
<style>
html, body { margin: 0; min-height: 100vh; }
body {
  background-color: #3f6b3a;
  background-image: linear-gradient(rgba(0,0,0,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.08) 1px, transparent 1px);
  background-size: 64px 64px;
}
</style>
</head>
<body>
<script>${js}</script>
</body>
</html>
`;
const file = join(OUT, "kit-preview.html");
writeFileSync(file, html);
console.log(file);
