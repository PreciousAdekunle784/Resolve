// Edit decision list for the app recordings (absolute video time, in seconds).
// clip: recording in capture/frames/<clip>; from/to: clip time range played over `dur` seconds.
// cam: [progress 0..1, focusX, focusY, zoom] in app viewport pixels (1440x900).
// Overlapping shots crossfade.
export const SHOTS = [
  // Scene 2 — Resolve, then the dashboard
  { clip: "landing", from: 0.2, to: 4.6, start: 11.2, dur: 4.4, cam: [[0, 720, 450, 0.95], [1, 720, 420, 1.03]] },
  { clip: "dashboard", from: 0.3, to: 5.6, start: 15.3, dur: 4.3, cam: [[0, 780, 330, 1.02], [0.65, 760, 300, 1.2], [1, 640, 300, 1.15]] },

  // Scene 3 — report the problem
  { clip: "report", from: 0.4, to: 4.6, start: 19.4, dur: 2.0, cam: [[0, 760, 400, 1.3], [1, 840, 540, 1.25]] },
  { clip: "report", from: 5.0, to: 18.4, start: 21.15, dur: 3.3, cam: [[0, 840, 420, 1.5], [1, 840, 720, 1.5]] },
  { clip: "report", from: 18.8, to: 28.9, start: 24.25, dur: 1.9, cam: [[0, 840, 470, 1.45], [1, 840, 650, 1.45]] },
  { clip: "report", from: 29.2, to: 38.6, start: 25.95, dur: 1.9, cam: [[0, 840, 520, 1.35], [1, 840, 640, 1.38]] },
  { clip: "report", from: 41.3, to: 44.8, start: 27.6, dur: 1.75, cam: [[0, 840, 640, 1.3], [1, 840, 400, 1.22]] },

  // Scene 4 — AI investigation (genuine Gemini output, replayed)
  { clip: "analysis", from: 1.4, to: 7.0, start: 29.15, dur: 3.0, cam: [[0, 840, 300, 1.25], [1, 760, 330, 1.4]] },
  { clip: "analysis", from: 9.4, to: 13.2, start: 31.9, dur: 2.9, cam: [[0, 760, 420, 1.35], [1, 760, 500, 1.42]] },
  { clip: "analysis", from: 13.2, to: 19.2, start: 34.6, dur: 2.6, cam: [[0, 780, 470, 1.35], [1, 760, 470, 1.38]] },
  { clip: "analysis", from: 19.2, to: 24.6, start: 37.0, dur: 4.2, cam: [[0, 760, 520, 1.45], [1, 720, 520, 1.6]] },

  // Scene 5 — the complaint (the window recedes behind the PDF from 43.5s)
  { clip: "complaint", from: 1.5, to: 10.2, start: 41.0, dur: 6.6, cam: [[0, 840, 380, 1.28], [0.4, 840, 520, 1.38], [1, 840, 560, 1.3]] },
  { clip: "complaint", from: 15.0, to: 22.8, start: 47.3, dur: 2.9, cam: [[0, 840, 560, 1.35], [1, 840, 600, 1.45]] },

  // Scene 6 — submit to the bank (Gmail redirect frames are skipped)
  { clip: "submit", from: 0.6, to: 12.3, start: 50.0, dur: 4.5, cam: [[0, 840, 360, 1.15], [0.35, 640, 640, 1.38], [1, 640, 520, 1.38]] },
  { clip: "submit", from: 12.4, to: 15.3, start: 54.3, dur: 1.6, cam: [[0, 640, 520, 1.4], [1, 640, 600, 1.42]] },
  { clip: "submit", from: 17.4, to: 22.6, start: 55.7, dur: 1.9, cam: [[0, 640, 260, 1.3], [1, 640, 420, 1.32]] },
  { clip: "submit", from: 22.8, to: 28.4, start: 57.4, dur: 2.5, cam: [[0, 640, 420, 1.45], [1, 640, 560, 1.52]] },
  { clip: "submit", from: 28.4, to: 33.6, start: 59.7, dur: 2.9, cam: [[0, 640, 320, 1.45], [0.55, 640, 400, 1.5], [1, 640, 440, 1.58]] },
  { clip: "submit", from: 34.0, to: 38.6, start: 62.4, dur: 2.8, cam: [[0, 640, 330, 1.35], [1, 640, 430, 1.48]] },

  // Scene 7 — track the response
  { clip: "track", from: 0.9, to: 3.8, start: 65.0, dur: 1.6, cam: [[0, 640, 600, 1.4], [1, 640, 640, 1.45]] },
  { clip: "track", from: 7.4, to: 14.6, start: 66.4, dur: 3.3, cam: [[0, 700, 560, 1.32], [1, 640, 600, 1.45]] },
  { clip: "track", from: 16.6, to: 19.2, start: 69.5, dur: 1.4, cam: [[0, 640, 560, 1.45], [1, 640, 600, 1.45]] },
  { clip: "track", from: 21.6, to: 29.4, start: 70.7, dur: 2.6, cam: [[0, 1150, 620, 1.35], [1, 1180, 560, 1.52]] },
  { clip: "track", from: 33.4, to: 41.5, start: 73.1, dur: 4.4, cam: [[0, 1120, 450, 1.32], [1, 1120, 520, 1.35]] },
];
