// Writes the sound-effect cue list into timeline.json:
// clicks are taken from the real recordings (mapped through the edit), plus hand-placed cues.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS } from "../composition/shots.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tlPath = path.join(root, "timeline.json");
const tl = JSON.parse(readFileSync(tlPath, "utf8"));
const cues = [];
for (const [i, s] of SHOTS.entries()) {
  const idx = JSON.parse(readFileSync(path.join(root, "capture/frames", s.clip, "index.json"), "utf8"));
  const next = SHOTS[i + 1];
  for (const e of idx.events) {
    if (e.type !== "click" || e.t < s.from || e.t > s.to) continue;
    const at = s.start + ((e.t - s.from) / (s.to - s.from)) * s.dur;
    if (next && at > next.start + 0.15) continue; // hidden by the crossfade
    cues.push({ t: +at.toFixed(3), kind: "click" });
  }
}
const manual = [
  { t: 0.72, kind: "notify" },
  { t: 4.15, kind: "message" },
  { t: 8.55, kind: "whoosh", gain: 0.8 },
  { t: 9.35, kind: "logo", gain: 0.55 },
  { t: 11.05, kind: "whoosh", gain: 0.6 },
  { t: 32.0, kind: "status", gain: 0.7 },
  { t: 43.55, kind: "doc" },
  { t: 49.2, kind: "status", gain: 0.8 },
  { t: 61.75, kind: "send" },
  { t: 66.05, kind: "message", gain: 0.9 },
  { t: 68.3, kind: "status", gain: 0.7 },
  { t: 74.5, kind: "whoosh", gain: 0.5 },
  { t: 75.05, kind: "status", gain: 0.55 },
  { t: 77.0, kind: "logo", gain: 0.8 },
];
tl.sfx = [...cues, ...manual].sort((a, b) => a.t - b.t);
writeFileSync(tlPath, JSON.stringify(tl, null, 2) + "\n");
console.log(`${cues.length} click cues + ${manual.length} effects`);
