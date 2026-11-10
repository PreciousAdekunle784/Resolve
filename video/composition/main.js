// Resolve product demo — time-driven composition.
// Every frame is a pure function of time, so renders are deterministic.
// The browser-window shots play back real screen recordings of the app (capture/frames).
import { RECEIPT_CSS, receiptScreen } from "./scenario.js";
import { SHOTS } from "./shots.js";

const FPS = 30;
const DURATION = 85;
const CHROME = 52; // browser chrome height above the 1440x900 app viewport

// ---------------------------------------------------------------- helpers
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const outBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
/** Fades in over [a, a+fi] and out over [b-fo, b]. */
const window01 = (t, a, b, fi = 0.5, fo = 0.5) => Math.min(inOut(prog(t, a, a + fi)), 1 - inOut(prog(t, b - fo, b)));
const h = (tag, cls, html = "") => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};
const set = (el, styles) => Object.assign(el.style, styles);

const LOGO_SVG = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="#2563eb"/>
  <rect width="32" height="16" rx="8" fill="#3b82f6" opacity="0.55"/><rect y="8" width="32" height="8" fill="#3b82f6" opacity="0.55"/>
  <path d="M11 23V9.5h5.75a4.25 4.25 0 010 8.5H11" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M16.5 18.5l2.25 2.5 4.25-5" stroke="#bfdbfe" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
const CURSOR_SVG = `<svg viewBox="0 0 26 26" width="26" height="26"><path d="M3 2l17 10.2-7.4 1.6 4.3 8.2-3.3 1.7-4.3-8.3L3 20.6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const LOCK_SVG = `<svg width="13" height="13" viewBox="0 0 20 20" fill="#9aa0aa"><path fill-rule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clip-rule="evenodd"/></svg>`;

// ---------------------------------------------------------------- state
let L; // layout
let stage;
const clips = {};
const els = {};

// ---------------------------------------------------------------- clips
async function loadClips() {
  const names = [...new Set(SHOTS.map((s) => s.clip))];
  await Promise.all(
    names.map(async (n) => {
      const idx = await (await fetch(`../capture/frames/${n}/index.json`)).json();
      idx.moves = idx.events.filter((e) => e.type === "move");
      idx.clicks = idx.events.filter((e) => e.type === "click");
      clips[n] = idx;
    }),
  );
}

function frameAt(clip, tc) {
  const f = clips[clip].frames;
  let lo = 0;
  let hi = f.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (f[mid].t <= tc) lo = mid;
    else hi = mid - 1;
  }
  return f[lo];
}

function cursorAt(clip, tc) {
  const m = clips[clip].moves;
  if (!m.length) return null;
  let i = 0;
  while (i < m.length - 1 && m[i + 1].t <= tc) i++;
  const a = m[i];
  const b = m[i + 1];
  if (!b || tc <= a.t) return { x: a.x, y: a.y };
  const k = clamp((tc - a.t) / Math.max(0.001, b.t - a.t));
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
}

function clickAt(clip, tc) {
  for (const c of clips[clip].clicks) {
    const age = tc - c.t;
    if (age >= 0 && age < 0.5) return { ...c, age };
  }
  return null;
}

/** Shot playback: clip time for absolute time t, with a gentle ease at both ends. */
function clipTime(shot, t) {
  const p = clamp((t - shot.start) / shot.dur);
  return lerp(shot.from, shot.to, p);
}

function camAt(shot, t) {
  const p = clamp((t - shot.start) / shot.dur);
  const k = shot.cam;
  if (k.length === 1) return { x: k[0][1], y: k[0][2], z: k[0][3] };
  let i = 0;
  while (i < k.length - 2 && k[i + 1][0] <= p) i++;
  const a = k[i];
  const b = k[i + 1];
  const q = inOut(clamp((p - a[0]) / Math.max(0.0001, b[0] - a[0])));
  return { x: lerp(a[1], b[1], q), y: lerp(a[2], b[2], q), z: lerp(a[3], b[3], q) };
}

// ---------------------------------------------------------------- layout
function layoutFor(name) {
  const vertical = name === "9x16";
  const w = vertical ? 1080 : 1920;
  const hgt = vertical ? 1920 : 1080;
  return {
    name,
    vertical,
    w,
    h: hgt,
    // Base scale for the browser window and the extra zoom applied in vertical framing.
    base: vertical ? w / 1440 : (w * 0.8) / 1440,
    zoomBoost: vertical ? 1.22 : 1,
    winCY: vertical ? hgt * 0.53 : hgt * 0.52,
  };
}

// ---------------------------------------------------------------- build DOM
function build() {
  stage = document.getElementById("stage");
  set(stage, { width: `${L.w}px`, height: `${L.h}px` });
  document.head.appendChild(Object.assign(document.createElement("style"), { textContent: RECEIPT_CSS }));

  // Background
  const bg = h("div", "layer");
  els.grid = h("div", "bg-grid");
  els.glowA = h("div", "glow");
  els.glowB = h("div", "glow");
  set(els.glowA, { width: "900px", height: "600px", background: "rgb(37 99 235 / 0.22)" });
  set(els.glowB, { width: "700px", height: "520px", background: "rgb(99 102 241 / 0.16)" });
  bg.append(els.grid, els.glowA, els.glowB);
  stage.append(bg);

  // Scene 1: phone, chat, pills
  els.s1 = h("div", "layer");
  els.phoneWrap = h("div", "abs");
  set(els.phoneWrap, { perspective: "2400px", left: "0", top: "0", width: `${L.w}px`, height: `${L.h}px` });
  els.phone = h("div", "phone", `<div class="screen"><div class="scale">${receiptScreen()}</div><div class="island"></div></div><div class="sheen"></div>`);
  els.phone.querySelector(".scale").style.transform = `scale(${402 / 720})`;
  els.phoneWrap.append(els.phone);
  els.pillOk = h("div", "status-pill ok abs", `<span class="dot"></span>Bank app: transfer successful`);
  els.chat = h(
    "div",
    "chat",
    `<div class="who"><div class="avatar">ER</div>Example Recipient<span class="time">2 days later</span></div>
     <div class="bubble">Hi, the ₦85,000 still hasn't come in. I've checked my account again — nothing.</div>`,
  );
  els.pillBad = h("div", "status-pill bad abs", `<span class="dot"></span>Recipient: not received`);
  els.nowWhat = h("div", "headline abs", `Now what?`);
  els.s1.append(els.phoneWrap, els.pillOk, els.chat, els.pillBad, els.nowWhat);
  stage.append(els.s1);

  // Scene 2: logo reveal
  els.s2 = h("div", "layer");
  els.horizon = h("div", "horizon");
  els.beamL = h("div", "beam");
  els.beamR = h("div", "beam");
  els.logo = h("div", "logo abs", `${LOGO_SVG(L.vertical ? 104 : 96)}<span>Resolve</span>`);
  els.tag = h("div", "abs", `AI-powered financial complaint assistant`);
  set(els.tag, { fontSize: L.vertical ? "30px" : "26px", color: "var(--ink-400)", letterSpacing: "0.01em", fontWeight: "400" });
  els.s2.append(els.beamL, els.beamR, els.horizon, els.logo, els.tag);
  stage.append(els.s2);

  // App window (scenes 2–7)
  els.cv = h("div", "layer");
  set(els.cv, { perspective: "2600px" });
  els.win = h(
    "div",
    "win",
    `<div class="chrome"><div class="lights"><i></i><i></i><i></i></div><div class="url">${LOCK_SVG}<span class="u"></span></div><div style="width:58px"></div></div>
     <div class="vp"><img class="a"><img class="b"><div class="ripple"></div><div class="cursor">${CURSOR_SVG}</div></div>`,
  );
  els.imgA = els.win.querySelector("img.a");
  els.imgB = els.win.querySelector("img.b");
  els.cursor = els.win.querySelector(".cursor");
  els.ripple = els.win.querySelector(".ripple");
  els.url = els.win.querySelector(".u");
  els.cv.append(els.win);
  stage.append(els.cv);
  els.dim = h("div", "layer");
  set(els.dim, { background: "radial-gradient(ellipse at 50% 50%, rgb(3 4 10 / 0.55), rgb(3 4 10 / 0.9))" });
  stage.append(els.dim);

  // Scene 5: complaint document
  els.paperWrap = h("div", "layer");
  set(els.paperWrap, { perspective: "2200px" });
  els.paper = h("div", "paper", `<img src="../assets/complaint-page-1.png">`);
  els.bands = [
    [0.356, 0.43, "Transaction details"],
    [0.433, 0.523, "What went wrong"],
    [0.588, 0.646, "Supporting evidence"],
    [0.654, 0.729, "Resolution requested"],
  ].map(([a, b, label]) => {
    const band = h("div", "hl");
    set(band, { top: `${a * 100}%`, height: `${(b - a) * 100}%` });
    els.paper.append(band);
    const tag = h("div", "callout abs", `<span class="ic">✓</span>${label}`);
    els.paperWrap.append(tag);
    return { band, tag, a, b };
  });
  els.paperWrap.prepend(els.paper);
  stage.append(els.paperWrap);

  // Scene 7: progress rail
  els.rail = h(
    "div",
    "rail",
    [
      ["Complaint prepared", "Reviewed and approved by you"],
      ["Submitted to Northbridge Bank", "Sent from your Gmail — delivery confirmed by Gmail"],
      ["Acknowledged by the bank", 'Reference <b>NB/CMP/2026/04571</b>'],
      ["Under investigation", "Bank says it will update within 5 working days"],
      ["Resolution", "Pending — Resolve helps you follow up"],
    ]
      .map(([a, b], i) => `<div class="row r${i}"><div class="dot">✓</div>${i < 4 ? '<div class="line"><i></i></div>' : ""}<div><div class="label">${a}</div><div class="sub">${b}</div></div></div>`)
      .join(""),
  );
  els.railRows = [...els.rail.querySelectorAll(".row")];
  stage.append(els.rail);

  // Scene 8: closing
  els.s8 = h("div", "layer");
  els.horizon2 = h("div", "horizon");
  els.close1 = h("div", "headline abs", `YOUR MONEY MATTERS.`);
  els.close2 = h("div", "headline abs", `<span class="grad">SO DOES WHAT HAPPENS NEXT.</span>`);
  els.words = h("div", "abs", ["Investigate.", "Submit.", "Track.", "Resolve."].map((w) => `<span>${w}</span>`).join(" "));
  set(els.words, { fontSize: L.vertical ? "40px" : "34px", fontWeight: "400", color: "var(--ink-300)", display: "flex", gap: L.vertical ? "18px" : "22px", whiteSpace: "nowrap", justifyContent: "center", width: "100%", left: "0" });
  els.wordSpans = [...els.words.querySelectorAll("span")];
  els.wordSpans[3].style.color = "#fff";
  els.wordSpans[3].style.fontWeight = "600";
  els.endLogo = h("div", "logo abs", `${LOGO_SVG(L.vertical ? 64 : 56)}<span>Resolve</span>`);
  els.endUrl = h("div", "abs", `resolve-finance.vercel.app`);
  set(els.endUrl, { fontSize: L.vertical ? "26px" : "22px", color: "var(--brand-300)", letterSpacing: "0.02em", width: "100%", left: "0", textAlign: "center" });
  els.endNote = h("div", "note abs", `Resolve is an independent assistant — not a bank or regulator. It cannot guarantee refunds.`);
  set(els.endNote, { width: "100%", left: "0", textAlign: "center", fontSize: L.vertical ? "20px" : "16px" });
  els.s8.append(els.horizon2, els.close1, els.close2, els.words, els.endLogo, els.endUrl, els.endNote);
  stage.append(els.s8);

  // Chapter label, callout, note (overlays)
  els.chapter = h("div", "chapter abs", `<span class="num"></span><span class="t"></span>`);
  els.callout = h("div", "callout abs", `<span class="ic"></span><span class="t"></span>`);
  els.note = h("div", "note abs");
  stage.append(els.chapter, els.callout, els.note);
  els.fade = h("div", "layer");
  set(els.fade, { background: "#000", pointerEvents: "none" });
  stage.append(els.fade);
}

// ---------------------------------------------------------------- per-frame rendering
async function setImg(img, src) {
  if (img.dataset.src === src) return;
  img.dataset.src = src;
  img.src = src;
  try {
    await img.decode();
  } catch {
    /* keep going: a missing frame should not stop the render */
  }
}

function renderBackground(t) {
  const W = L.w;
  const H = L.h;
  set(els.glowA, { left: `${W * 0.15 + Math.sin(t * 0.21) * 60}px`, top: `${H * 0.1 + Math.cos(t * 0.17) * 40}px`, opacity: String(0.6 + 0.2 * Math.sin(t * 0.3)) });
  set(els.glowB, { left: `${W * 0.6 + Math.cos(t * 0.19) * 70}px`, top: `${H * 0.45 + Math.sin(t * 0.23) * 50}px` });
  set(els.grid, { transform: `translate(${(t * 6) % 72}px, ${(t * 3) % 72}px)`, opacity: String(t < 9 ? 0.5 : 0.9) });
}

function renderScene1(t) {
  const a = window01(t, 0, 9.2, 0.6, 0.8);
  els.s1.style.opacity = String(a);
  if (a <= 0) return;
  const W = L.w;
  const H = L.h;
  const push = inOut(prog(t, 0, 9));
  const ry = lerp(-24, -6, push);
  const rx = lerp(8, 3, push);
  const s = lerp(0.98, 1.1, push) * (L.vertical ? 1.12 : 1);
  const cx = L.vertical ? W / 2 : W * 0.34;
  const cy = L.vertical ? H * 0.37 : H / 2;
  const ty = lerp(30, -10, push) + (1 - outExpo(prog(t, 0, 1.4))) * 120;
  set(els.phone, {
    left: `${cx - 215}px`,
    top: `${cy - 450}px`,
    transform: `translateY(${ty}px) scale(${s}) rotateY(${ry}deg) rotateX(${rx}deg)`,
    opacity: String(outExpo(prog(t, 0.1, 1.0))),
  });
  // The success tick pops in when the transfer "completes".
  const check = els.phone.querySelector(".bk-check");
  const cp = prog(t, 0.7, 1.15);
  set(check, { transform: `scale(${cp <= 0 ? 0.3 : outBack(cp)})`, opacity: String(clamp(cp * 3)) });

  const right = L.vertical ? W / 2 : W * 0.62;
  const pOk = outExpo(prog(t, 2.6, 3.3));
  set(els.pillOk, {
    left: `${L.vertical ? right - 230 : right}px`,
    top: `${L.vertical ? H * 0.66 : H * 0.24}px`,
    opacity: String(pOk * (1 - 0.55 * prog(t, 5.0, 5.6))),
    transform: `translateY(${(1 - pOk) * 24}px)`,
  });
  const pChat = outExpo(prog(t, 4.1, 4.9));
  set(els.chat, {
    left: `${L.vertical ? right - 260 : right}px`,
    top: `${L.vertical ? H * 0.71 : H * 0.34}px`,
    opacity: String(pChat),
    transform: `translateY(${(1 - pChat) * 36}px) scale(${lerp(0.96, 1, pChat)})`,
  });
  const pBad = outExpo(prog(t, 5.3, 6.0));
  set(els.pillBad, {
    left: `${L.vertical ? right - 175 : right}px`,
    top: `${L.vertical ? H * 0.84 : H * 0.63}px`,
    opacity: String(pBad),
    transform: `translateY(${(1 - pBad) * 24}px)`,
  });
  const pNow = outExpo(prog(t, 6.55, 7.3));
  set(els.nowWhat, {
    left: `${L.vertical ? 0 : right}px`,
    width: L.vertical ? `${W}px` : "auto",
    top: `${L.vertical ? H * 0.9 : H * 0.72}px`,
    fontSize: L.vertical ? "76px" : "78px",
    textAlign: L.vertical ? "center" : "left",
    opacity: String(pNow),
    transform: `translateY(${(1 - pNow) * 20}px)`,
    filter: `blur(${(1 - pNow) * 8}px)`,
  });
}

function renderScene2(t) {
  const a = window01(t, 8.6, 12.2, 0.5, 0.9);
  els.s2.style.opacity = String(a);
  if (a <= 0) return;
  const W = L.w;
  const H = L.h;
  const rise = outExpo(prog(t, 8.7, 10.4));
  const size = L.vertical ? 1900 : 2600;
  set(els.horizon, { width: `${size}px`, height: `${size}px`, marginLeft: `${-size / 2}px`, top: `${lerp(H * 1.05, H * 0.66, rise)}px` });
  set(els.beamL, { left: "-4%", transform: `rotate(-36deg)`, transformOrigin: "top left", opacity: String(0.9 * rise), clipPath: "polygon(30% 0,58% 0,100% 100%,10% 100%)" });
  set(els.beamR, { right: "-4%", transform: `rotate(36deg)`, transformOrigin: "top right", opacity: String(0.9 * rise), clipPath: "polygon(42% 0,70% 0,90% 100%,0 100%)" });
  const lp = outExpo(prog(t, 9.4, 10.4));
  const out = inOut(prog(t, 11.0, 12.0));
  set(els.logo, {
    fontSize: L.vertical ? "96px" : "88px",
    left: "0",
    width: `${W}px`,
    justifyContent: "center",
    top: `${H * 0.4 - 50 - out * 40}px`,
    opacity: String(lp * (1 - out)),
    transform: `scale(${lerp(0.88, 1, lp)})`,
    filter: `blur(${(1 - lp) * 10}px)`,
  });
  const tp = outExpo(prog(t, 10.0, 10.9));
  set(els.tag, { left: "0", width: `${W}px`, textAlign: "center", top: `${H * 0.4 + 80 - out * 40}px`, opacity: String(tp * (1 - out)) });
}

async function renderApp(t) {
  // Active shot(s)
  let i = -1;
  for (let k = 0; k < SHOTS.length; k++) if (SHOTS[k].start <= t) i = k;
  const visible = t >= SHOTS[0].start && t < SHOTS[SHOTS.length - 1].start + SHOTS[SHOTS.length - 1].dur + 0.6;
  const enter = outExpo(prog(t, SHOTS[0].start, SHOTS[0].start + 1.5));
  const exit = inOut(prog(t, 76.6, 77.5));
  els.cv.style.opacity = String(visible ? enter * (1 - exit) : 0);
  if (!visible || i < 0) return;

  const cur = SHOTS[i];
  const prev = i > 0 ? SHOTS[i - 1] : null;
  // Crossfade from the previous shot while it is still running.
  let mix = 1;
  if (prev && t < prev.start + prev.dur) mix = inOut(clamp((t - cur.start) / Math.max(0.05, prev.start + prev.dur - cur.start)));
  const tcCur = clipTime(cur, t);
  const fCur = frameAt(cur.clip, tcCur);
  const camCur = camAt(cur, t);
  let cam = camCur;
  await setImg(els.imgB, `../capture/frames/${cur.clip}/${fCur.f}`);
  els.imgB.style.opacity = String(mix);
  if (mix < 1) {
    const tcPrev = clipTime(prev, t);
    const fPrev = frameAt(prev.clip, tcPrev);
    await setImg(els.imgA, `../capture/frames/${prev.clip}/${fPrev.f}`);
    els.imgA.style.opacity = "1";
    const cp = camAt(prev, t);
    cam = { x: lerp(cp.x, camCur.x, mix), y: lerp(cp.y, camCur.y, mix), z: lerp(cp.z, camCur.z, mix) };
  } else {
    els.imgA.style.opacity = "0";
  }
  els.url.innerHTML = `<b>resolve-finance.vercel.app</b>${fCur.url === "/" ? "" : fCur.url.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, "8f3c…e21a")}`;

  // Cursor (from the dominant shot)
  const shot = mix >= 0.5 || !prev ? cur : prev;
  const tc = shot === cur ? tcCur : clipTime(prev, t);
  const c = cursorAt(shot.clip, tc);
  const hideCursor = shot.noCursor;
  if (c && !hideCursor) {
    set(els.cursor, { display: "block", transform: `translate(${c.x - 3}px, ${c.y - 2}px)` });
    const k = clickAt(shot.clip, tc);
    if (k) {
      const r = lerp(8, 34, outExpo(k.age / 0.5));
      set(els.ripple, { display: "block", left: `${k.x - r}px`, top: `${k.y - r}px`, width: `${r * 2}px`, height: `${r * 2}px`, opacity: String(1 - k.age / 0.5) });
    } else els.ripple.style.display = "none";
  } else {
    els.cursor.style.display = "none";
    els.ripple.style.display = "none";
  }

  // Camera: centre the focus point (viewport coordinates) with the given zoom.
  const tilt = (1 - enter) * 16;
  const recede = window01(t, 43.4, 47.6, 0.6, 0.6) + window01(t, 74.3, 77.2, 0.6, 0.6) * 0.8;
  const S = L.base * cam.z * L.zoomBoost * (1 - 0.08 * recede);
  const fx = cam.x;
  const fy = cam.y + CHROME;
  let tx = L.w / 2 - fx * S;
  let ty = L.winCY - fy * S;
  // Keep the window from drifting too far off-stage (16:9 only).
  if (!L.vertical) {
    tx = clamp(tx, L.w - 1440 * S - 60, 60);
    ty = clamp(ty, L.h - 952 * S - 40, 40);
  }
  // Entrance: the window tilts up into place; it recedes (and softens) behind the document and the progress card.
  set(els.win, {
    transform: `translate(${tx}px, ${ty + (1 - enter) * 120}px) scale(${S}) rotateX(${tilt}deg)`,
    filter: recede > 0.01 ? `blur(${recede * 3}px)` : "none",
  });
  els.dim.style.opacity = String(recede * 0.85);
}

function renderPaper(t) {
  const a = window01(t, 43.5, 47.6, 0.7, 0.6);
  els.paperWrap.style.opacity = String(a);
  if (a <= 0) return;
  const p = outExpo(prog(t, 43.5, 44.8));
  const W = L.w;
  const H = L.h;
  const pw = L.vertical ? 700 : 660;
  const ph = (pw * 1871) / 1323;
  const left = L.vertical ? (W - pw) / 2 : W * 0.5 - pw / 2 + 200;
  const top = L.vertical ? H * 0.18 : (H - ph) / 2 + 120;
  const drift = prog(t, 43.5, 47.6);
  set(els.paper, {
    width: `${pw}px`,
    left: `${left}px`,
    top: `${top}px`,
    transform: `translateY(${(1 - p) * 180 - drift * 30}px) rotateX(${lerp(24, 6, p)}deg) rotateY(${lerp(-18, -8, p) + drift * 3}deg) scale(${lerp(0.92, 1, p)})`,
  });
  els.bands.forEach((b, i) => {
    const bp = outExpo(prog(t, 44.6 + i * 0.55, 45.1 + i * 0.55));
    set(b.band, { transform: `scaleX(${bp})`, transformOrigin: "left", opacity: String(bp) });
    const y = top + ph * ((b.a + b.b) / 2) - 26;
    set(b.tag, {
      left: L.vertical ? `${(W - 360) / 2}px` : `${left - 340}px`,
      top: L.vertical ? `${H * 0.765 + i * 70}px` : `${y}px`,
      opacity: String(bp),
      transform: `translateX(${(1 - bp) * -24}px)`,
      fontSize: L.vertical ? "26px" : "21px",
    });
  });
}

function renderRail(t) {
  const a = window01(t, 74.4, 77.2, 0.6, 0.5);
  els.rail.style.opacity = String(a);
  if (a <= 0) return;
  const W = L.w;
  const H = L.h;
  const width = L.vertical ? 900 : 760;
  set(els.rail, { width: `${width}px`, left: `${(W - width) / 2}px`, top: `${L.vertical ? H * 0.3 : H * 0.17}px`, transform: `translateY(${(1 - outExpo(prog(t, 74.4, 75.2))) * 40}px) scale(${L.vertical ? 1.08 : 1})` });
  els.railRows.forEach((row, i) => {
    const rp = outExpo(prog(t, 74.7 + i * 0.32, 75.2 + i * 0.32));
    row.style.opacity = String(rp);
    row.style.transform = `translateX(${(1 - rp) * 20}px)`;
    row.className = `row r${i} ${i < 3 ? "done" : i === 3 ? "now" : ""}`;
    const line = row.querySelector(".line i");
    if (line) line.style.height = i < 3 ? `${prog(t, 75.0 + i * 0.32, 75.4 + i * 0.32) * 100}%` : "0%";
    row.querySelector(".dot").textContent = i < 3 ? "✓" : "";
  });
}

function renderClosing(t) {
  const a = window01(t, 77.1, 86, 0.7, 0.1);
  els.s8.style.opacity = String(a);
  if (a <= 0) return;
  const W = L.w;
  const H = L.h;
  const rise = outExpo(prog(t, 77.1, 79));
  const size = L.vertical ? 2000 : 2800;
  set(els.horizon2, { width: `${size}px`, height: `${size}px`, marginLeft: `${-size / 2}px`, top: `${lerp(H * 1.1, H * 0.78, rise)}px` });
  const fs = L.vertical ? 56 : 92;
  const l1 = outExpo(prog(t, 77.5, 78.6));
  const l2 = outExpo(prog(t, 78.1, 79.3));
  const baseY = L.vertical ? H * 0.28 : H * 0.22;
  set(els.close1, { left: "0", width: `${W}px`, top: `${baseY}px`, fontSize: `${fs}px`, opacity: String(l1), transform: `translateY(${(1 - l1) * 24}px)`, filter: `blur(${(1 - l1) * 8}px)`, padding: "0 40px" });
  set(els.close2, { left: "0", width: `${W}px`, top: `${baseY + fs * (L.vertical ? 1.3 : 1.15)}px`, fontSize: `${fs}px`, opacity: String(l2), transform: `translateY(${(1 - l2) * 24}px)`, filter: `blur(${(1 - l2) * 8}px)`, padding: "0 40px" });
  set(els.words, { top: `${baseY + fs * (L.vertical ? 3.3 : 2.75)}px` });
  els.wordSpans.forEach((s, i) => {
    const wp = outExpo(prog(t, 79.6 + i * 0.32, 80.2 + i * 0.32));
    s.style.opacity = String(wp);
    s.style.display = "inline-block";
    s.style.transform = `translateY(${(1 - wp) * 14}px)`;
  });
  const lg = outExpo(prog(t, 81.2, 82.2));
  set(els.endLogo, { fontSize: L.vertical ? "56px" : "48px", left: "0", width: `${W}px`, justifyContent: "center", top: `${L.vertical ? H * 0.63 : H * 0.6}px`, opacity: String(lg), transform: `scale(${lerp(0.9, 1, lg)})` });
  set(els.endUrl, { top: `${L.vertical ? H * 0.63 + 100 : H * 0.6 + 86}px`, opacity: String(outExpo(prog(t, 81.7, 82.6))) });
  set(els.endNote, { top: `${H - (L.vertical ? 140 : 70)}px`, opacity: String(0.9 * outExpo(prog(t, 82.0, 83.0))) });
  els.fade.style.opacity = String(inOut(prog(t, 84.2, 85)));
}

// Chapter titles, callouts and honesty notes.
const CHAPTERS = [
  [19.6, 28.9, "01", "Report the problem"],
  [29.2, 40.8, "02", "AI investigation"],
  [41.1, 49.8, "03", "Structured complaint"],
  [50.1, 64.8, "04", "Submit to your bank"],
  [65.1, 74.2, "05", "Track the response"],
];
const CALLOUTS = [
  [31.0, 33.6, "✦", "AI analysis powered by Google Gemini"],
  [37.6, 40.6, "✓", "Every fact labelled by its source"],
  [61.0, 64.6, "✓", "Sent from your own Gmail · confirmed by Gmail"],
  [67.9, 70.6, "✦", "Bank reply explained, with its reference number"],
];
const NOTES = [
  [0.4, 8.6, "Illustrative scenario. Northbridge Bank and Example Recipient are fictional."],
  [11.2, 49.9, "Recorded in Resolve · demo account with a fictional bank and transaction"],
  [50.1, 64.9, "Demo recording: Gmail sending shown against a test mail server"],
  [65.1, 77.0, "Illustrative bank reply · AI output generated by Google Gemini"],
];

function renderOverlays(t) {
  const ch = CHAPTERS.find(([a, b]) => t >= a && t <= b);
  if (ch) {
    const [a, b, n, title] = ch;
    const p = window01(t, a, b, 0.6, 0.5);
    els.chapter.querySelector(".num").textContent = n;
    els.chapter.querySelector(".t").textContent = title;
    set(els.chapter, {
      opacity: String(p),
      left: L.vertical ? "50%" : "56px",
      top: L.vertical ? "110px" : "40px",
      fontSize: L.vertical ? "30px" : "21px",
      transform: `translate(${L.vertical ? "-50%" : "0"}, ${(1 - p) * -10}px)`,
    });
  } else els.chapter.style.opacity = "0";

  const co = CALLOUTS.find(([a, b]) => t >= a && t <= b);
  if (co) {
    const [a, b, icon, text] = co;
    const p = window01(t, a, b, 0.5, 0.4);
    els.callout.querySelector(".ic").textContent = icon;
    els.callout.querySelector(".t").textContent = text;
    set(els.callout, {
      opacity: String(p),
      fontSize: L.vertical ? "28px" : "21px",
      left: L.vertical ? "50%" : "auto",
      right: L.vertical ? "auto" : "72px",
      top: L.vertical ? `${L.h - 330}px` : `${L.h - 130}px`,
      transform: `translate(${L.vertical ? "-50%" : "0"}, ${(1 - p) * 16}px)`,
    });
  } else els.callout.style.opacity = "0";

  const no = NOTES.find(([a, b]) => t >= a && t <= b);
  if (no) {
    const [a, b, text] = no;
    els.note.textContent = text;
    set(els.note, {
      opacity: String(window01(t, a, b, 0.5, 0.4)),
      left: L.vertical ? "50%" : "56px",
      bottom: L.vertical ? "60px" : "30px",
      fontSize: L.vertical ? "21px" : "15px",
      transform: L.vertical ? "translateX(-50%)" : "none",
      whiteSpace: L.vertical ? "normal" : "nowrap",
      width: L.vertical ? "900px" : "auto",
      textAlign: "center",
    });
  } else els.note.style.opacity = "0";
}

// ---------------------------------------------------------------- API
export async function setup(layoutName = "16x9") {
  L = layoutFor(layoutName);
  build();
  await loadClips();
  await document.fonts.ready;
  return { fps: FPS, duration: DURATION, frames: DURATION * FPS, width: L.w, height: L.h };
}

export async function renderFrame(frame) {
  const t = frame / FPS;
  renderBackground(t);
  renderScene1(t);
  renderScene2(t);
  await renderApp(t);
  renderPaper(t);
  renderRail(t);
  renderClosing(t);
  renderOverlays(t);
  if (t < 77) els.fade.style.opacity = String(1 - outExpo(prog(t, 0, 0.6)));
  return t;
}
