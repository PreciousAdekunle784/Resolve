# Resolve product demo video

An 85-second product walkthrough built from **real recordings of the Resolve
app**. It is rendered in two versions:

- `out/resolve-demo-16x9.mp4`: 1920 × 1080, 30 fps
- `out/resolve-demo-9x16.mp4`: 1080 × 1920, for social media

The narration script is in [VOICEOVER.md](VOICEOVER.md).

## What's real and what's illustrative

| Element | Status |
| --- | --- |
| App screens (dashboard, report wizard, AI analysis, complaint builder, Submit tab, replies, tracking) | **Real.** Screen recordings of Resolve's production build, driven like a real user. |
| AI analysis, complaint letter, reply explanation and recovery plan | **Real Gemini output** (`gemini-3.6-flash`). It was generated on the live site for this scenario with a temporary account, then deleted (`capture/gemini-outputs.json`). The recording replays exactly that output. The only change: the demo email address in the letter is swapped for the demo account's address. |
| Sending by Gmail | **Real code path**, recorded against Resolve's Google OAuth/Gmail emulator (`tests/e2e/mock-google.mjs`), which works like a test mail server. The video says so on screen. |
| Bank, recipient, transaction and the bank's reply | **Fictional, illustrative.** "Northbridge Bank" and "Example Recipient" are not real. No real bank is shown failing a transfer. |
| Phone screen (scene 1) and the closing progress card | **Motion graphics.** They are not app screens: the phone is a fictional banking app, and the card summarises states the app actually reached. |
| Refunds | **Never shown.** The story ends with the complaint under investigation and the resolution pending. |

## Structure

```
video/
  composition/      HTML scenes (time-driven) — main.js, shots.js (edit list), styles.css, scenario.js
  capture/          scripts that produced the inputs
    live-gemini.mjs   genuine Gemini outputs from the live site (temporary account, deleted afterwards)
    demo-env.mjs      local demo environment (prod build + test backend replaying those outputs)
    record.mjs        drives the app like a user and records it (Chrome screencast + cursor log)
    make-evidence.mjs renders the fictional receipt used as evidence
    frames/           recordings (generated, git-ignored, ~500 MB)
  voiceover/        script.json, generate.py (Kokoro TTS), wav/ (generated)
  audio/            build_audio.py — original music + SFX synthesis and the final mix
  tools/            serve.mjs (static server), cues.mjs (sound cues from recorded clicks)
  timeline.json     scene times, narration start times, sound cues
  render.mjs        frame-accurate renderer (Chromium → FFmpeg)
  assets/           receipt image, complaint PDF and its page renders
  out/              final videos (and preview stills)
```

## Rebuild

Run these from the repository root unless noted. Each step can be re-run on its
own.

```bash
# 0. Fictional receipt image (evidence)
node video/capture/make-evidence.mjs

# 1. (optional) Refresh the genuine Gemini outputs from the live site
node video/capture/live-gemini.mjs https://resolve-finance.vercel.app https://<project>.supabase.co

# 2. Record the app (needs PostgreSQL for the test backend)
NEXT_DIST_DIR=.next-e2e npx next build
node video/capture/record.mjs

# 3. Narration (Kokoro model files: see voiceover/generate.py)
python video/voiceover/generate.py <models_dir>

# 4. Sound cues + soundtrack (run inside video/)
node tools/cues.mjs && python audio/build_audio.py

# 5. Render
node video/render.mjs 16x9
node video/render.mjs 9x16
node video/render.mjs 16x9 --preview 12,40,61   # stills for checking
```

## Editing

- **Timing and camera moves:** `composition/shots.js`. Each shot maps a slice of
  a recording onto the timeline, with camera keyframes in app pixels.
- **Text, labels and graphics:** `composition/main.js` (the `CHAPTERS`,
  `CALLOUTS` and `NOTES` arrays, and each scene's renderer).
- **Narration:** edit `voiceover/script.json` and regenerate. Adjust the start
  times in `timeline.json`.
- **Music and sound effects:** `audio/build_audio.py`. Effect cues are in
  `tools/cues.mjs`.
