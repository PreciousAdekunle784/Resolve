// Renders the composition to MP4 (or preview stills).
//
//   node video/render.mjs 16x9                    -> out/resolve-demo-16x9.mp4
//   node video/render.mjs 9x16                    -> out/resolve-demo-9x16.mp4
//   node video/render.mjs 16x9 --preview 3,12.5   -> out/preview/16x9-3.png, ...
//   node video/render.mjs 16x9 --from 40 --to 50  -> render a section only (for checking)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serve } from "./tools/serve.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const layout = args[0] ?? "16x9";
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const OUT = path.join(here, "out");
mkdirSync(path.join(OUT, "preview"), { recursive: true });

// Separate ports so both layouts can render at the same time.
const PORT = Number(process.env.RENDER_PORT ?? (layout === "9x16" ? 4174 : 4173)) + (opt("preview") ? 10 : 0);
const server = await serve(PORT);
const browser = await chromium.launch();
const [w, h] = layout === "9x16" ? [1080, 1920] : [1920, 1080];
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(`http://localhost:${PORT}/composition/index.html`);
const info = await page.evaluate((l) => window.setup(l), layout);

if (opt("preview")) {
  for (const t of opt("preview").split(",").map(Number)) {
    await page.evaluate((f) => window.renderFrame(f), Math.round(t * info.fps));
    const file = path.join(OUT, "preview", `${layout}-${t}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
} else {
  const from = Math.round(Number(opt("from") ?? 0) * info.fps);
  const to = Math.round(Number(opt("to") ?? info.duration) * info.fps);
  const soundtrack = path.join(here, "audio/build/soundtrack.wav");
  const partial = from > 0 || to < info.frames;
  const file = path.join(OUT, partial ? `section-${layout}-${from}-${to}.mp4` : `resolve-demo-${layout}.mp4`);
  const ffArgs = ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(info.fps), "-c:v", "mjpeg", "-i", "-"];
  const withAudio = existsSync(soundtrack);
  if (withAudio) ffArgs.push("-ss", String(from / info.fps), "-i", soundtrack);
  ffArgs.push("-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(info.fps));
  if (withAudio) ffArgs.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  ffArgs.push("-movflags", "+faststart", file);
  const ff = spawn("ffmpeg", ffArgs, { stdio: ["pipe", "inherit", "inherit"] });
  const started = Date.now();
  for (let f = from; f < to; f++) {
    await page.evaluate((n) => window.renderFrame(n), f);
    const jpg = await page.screenshot({ type: "jpeg", quality: 93 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 150 === 0) console.log(`${layout} frame ${f}/${to} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log("wrote", file, withAudio ? "(with soundtrack)" : "(no soundtrack yet)");
}
await browser.close();
server.close();
