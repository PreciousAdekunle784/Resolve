"""Builds the soundtrack for the Resolve demo video: original music, sound effects and the
narration, mixed with the music ducked under the voice. Everything is synthesised here, so
there is no third-party audio to license.

Usage (from video/):  python audio/build_audio.py
Inputs:  timeline.json (scene times, narration start times, SFX cues), voiceover/wav/*.wav
Output:  audio/build/soundtrack.wav (48 kHz stereo, loudness-normalised to -16 LUFS by ffmpeg)
"""
import json
import os
import subprocess
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BUILD = os.path.join(HERE, "build")
SR = 48000
os.makedirs(BUILD, exist_ok=True)
TL = json.load(open(os.path.join(ROOT, "timeline.json")))
DUR = TL["duration"] + 1.5
N = int(DUR * SR)
rng = np.random.default_rng(7)


def t_axis(n):
    return np.arange(n) / SR


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_adsr(n, a, d, s, r, sustain_len=None):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    s_len = max(0, n - a - d - r) if sustain_len is None else int(sustain_len * SR)
    e = np.concatenate([np.linspace(0, 1, a, endpoint=False), np.linspace(1, s, d, endpoint=False), np.full(s_len, s), np.linspace(s, 0, r)])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def one_pole_lowpass(x, cutoff):
    """Simple one-pole low-pass (cutoff may be an array for sweeps)."""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    # Process in blocks with a constant coefficient per block for speed.
    block = 256
    for i in range(0, len(x), block):
        ai = a[i]
        seg = x[i : i + block]
        out = np.empty_like(seg)
        for j, v in enumerate(seg):
            acc = (1 - ai) * v + ai * acc
            out[j] = acc
        y[i : i + block] = out
    return y


def lowpass_fft(x, cutoff, slope=2.0):
    """Zero-phase spectral low-pass (fast, for static filtering of long signals)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (f / cutoff) ** (2 * slope))
    return np.fft.irfft(X, len(x))


def highpass_fft(x, cutoff, slope=2.0):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 - 1 / np.sqrt(1 + (f / cutoff) ** (2 * slope))
    return np.fft.irfft(X, len(x))


def reverb(x, seconds=2.8, damp=5000, mix=0.3):
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir = lowpass_fft(ir, damp)
    ir /= np.sqrt(np.sum(ir**2))
    L = len(x) + n
    size = 1 << (L - 1).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - mix) + wet * mix * 0.9


def place(buf, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


# ---------------------------------------------------------------------------
# Instruments
# ---------------------------------------------------------------------------
def pad_note(freq, length, bright=1.0):
    n = int(length * SR)
    t = t_axis(n)
    out = np.zeros(n)
    for detune in (-0.07, 0.0, 0.065):  # semitone fractions
        f = freq * 2 ** (detune / 12)
        phase = rng.uniform(0, 2 * np.pi)
        for h in range(1, 9):
            out += np.sin(2 * np.pi * f * h * t + phase * h) / h**1.6 * (bright if h > 2 else 1)
    return out * env_adsr(n, min(2.5, length * 0.4), 0.5, 0.85, min(2.5, length * 0.4)) / 6


def bell(freq, length=1.8):
    n = int(length * SR)
    t = t_axis(n)
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * 1.2 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t * 2.8)
    s += 0.25 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 5)
    return s * env_adsr(n, 0.004, 0.0, 1.0, 0.05)


def bass_note(freq, length=0.32):
    n = int(length * SR)
    t = t_axis(n)
    s = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * 2 * freq * t) + 0.08 * np.sin(2 * np.pi * 3 * freq * t)
    return s * env_adsr(n, 0.008, 0.12, 0.55, 0.08)


def hat(length=0.06):
    n = int(length * SR)
    s = rng.standard_normal(n)
    s = np.diff(np.concatenate([[0], s]))  # crude high-pass
    return s * np.exp(-np.linspace(0, 9, n)) * 0.5


def kick(length=0.35):
    n = int(length * SR)
    t = t_axis(n)
    f = 46 + 70 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)


# ---------------------------------------------------------------------------
# Music: B minor → D major, ~84 BPM. Sparse and tense under the problem,
# opening up at the reveal, a gentle pulse while the product works, and a
# warm resolution at the end.
# ---------------------------------------------------------------------------
def build_music():
    music = np.zeros(N)
    bpm = 84
    beat = 60 / bpm
    bar = beat * 4
    # chord roots/voicings (MIDI)
    chords = {
        "Bm": [47, 54, 59, 62, 66],
        "G": [43, 50, 55, 59, 62],
        "D": [50, 57, 62, 66, 69],
        "A": [45, 52, 57, 61, 64],
        "Em": [40, 52, 55, 59, 64],
        "Dmaj9": [50, 57, 61, 64, 66, 69],
    }
    prog = ["Bm", "G", "D", "A"]

    # Problem (0-9s): a low drone and a hesitant high note.
    drone = pad_note(midi(35), 9.5, bright=0.4) * 0.9
    place(music, drone, 0.0, 0.55)
    for k, at in enumerate([1.2, 3.6, 6.0]):
        place(music, bell(midi(78 - (k % 2))), at, 0.10)
    # Tension swell into the reveal.
    n = int(2.2 * SR)
    noise = rng.standard_normal(n) * np.linspace(0, 1, n) ** 2
    place(music, lowpass_fft(noise, 2500), 6.9, 0.05)

    # Pads from the reveal to the end.
    t0 = 9.0
    i = 0
    end = 77.0
    while t0 < end:
        name = prog[i % 4]
        length = bar * 2
        for m in chords[name]:
            place(music, pad_note(midi(m), length + 1.2, bright=0.7 if t0 < 19 else 1.0), t0, 0.16)
        t0 += length
        i += 1

    # Gentle pulse (bass + hats) while the product is being used: 19.5s → 77s.
    t = 19.5
    step = beat / 2
    k = 0
    while t < 76.5:
        bar_index = int((t - 9.0) // (bar * 2)) % 4
        root = chords[prog[bar_index]][0] - 12
        level = 0.16 + 0.10 * min(1, (t - 19.5) / 30)
        place(music, bass_note(midi(root + 12)), t, level * (1.0 if k % 2 == 0 else 0.6))
        if t > 29:
            place(music, hat(), t + step / 2, 0.035 + 0.02 * min(1, (t - 29) / 30))
        if t > 41 and k % 8 == 0:
            place(music, kick(), t, 0.22)
        t += step
        k += 1

    # Arpeggio sparkle while things are being generated.
    for start, stop in ((29.5, 40.5), (41.5, 49.5), (50.5, 64.5), (65.5, 76.5)):
        t = start
        j = 0
        while t < stop:
            bar_index = int((t - 9.0) // (bar * 2)) % 4
            notes = chords[prog[bar_index]][2:]
            place(music, bell(midi(notes[j % len(notes)] + 12), 1.2), t, 0.045)
            t += beat / 2
            j += 1

    # Closing: a warm, open chord with a soft low hit.
    for m in chords["Dmaj9"]:
        place(music, pad_note(midi(m), 8.5, bright=0.8), 77.0, 0.17)
    place(music, kick(1.2), 77.0, 0.35)
    for k, m in enumerate([74, 78, 81, 85]):
        place(music, bell(midi(m), 2.5), 77.2 + k * 0.18, 0.06)

    music = reverb(music, 3.2, 4500, 0.35)
    # Gentle fades.
    fade = np.ones(N)
    fi = int(0.6 * SR)
    fade[:fi] = np.linspace(0, 1, fi)
    fo = int(3.5 * SR)
    fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
    return music * fade


# ---------------------------------------------------------------------------
# Sound effects
# ---------------------------------------------------------------------------
def sfx(kind):
    if kind == "notify":  # phone notification
        a = bell(midi(88), 0.7) * 0.6
        b = np.pad(bell(midi(95), 0.9) * 0.6, (int(0.11 * SR), 0))
        n = max(len(a), len(b))
        return np.pad(a, (0, n - len(a))) + np.pad(b, (0, n - len(b)))
    if kind == "message":  # incoming chat message
        n = int(0.18 * SR)
        t = t_axis(n)
        f = 700 + 500 * (t / t[-1])
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 18) * 0.7
    if kind == "click":
        n = int(0.05 * SR)
        s = highpass_fft(rng.standard_normal(n), 1800) * np.exp(-np.linspace(0, 14, n))
        th = np.sin(2 * np.pi * 180 * t_axis(n)) * np.exp(-np.linspace(0, 20, n)) * 0.6
        return (s * 0.35 + th) * 0.5
    if kind == "whoosh":
        n = int(0.9 * SR)
        s = rng.standard_normal(n)
        sweep = 300 + 5000 * np.sin(np.linspace(0, np.pi, n)) ** 2
        s = one_pole_lowpass(s, sweep)
        return s * np.sin(np.linspace(0, np.pi, n)) ** 2 * 1.4
    if kind == "doc":  # document generation shimmer
        out = np.zeros(int(1.6 * SR))
        for k, m in enumerate([86, 90, 93, 98, 102]):
            place(out, bell(midi(m), 1.0) * 0.25, k * 0.07, 1)
        return reverb(out, 1.2, 7000, 0.4)
    if kind == "send":
        w = sfx("whoosh") * 0.8
        out = np.zeros(int(1.8 * SR))
        place(out, w, 0, 1)
        place(out, bell(midi(86), 1.2) * 0.5, 0.45, 1)
        place(out, bell(midi(93), 1.2) * 0.5, 0.58, 1)
        return out
    if kind == "status":  # positive status update
        out = np.zeros(int(1.2 * SR))
        place(out, bell(midi(81), 1.0) * 0.45, 0, 1)
        place(out, bell(midi(85), 1.0) * 0.45, 0.09, 1)
        return out
    if kind == "type":  # soft keyboard tick
        n = int(0.025 * SR)
        return highpass_fft(rng.standard_normal(n), 2500) * np.exp(-np.linspace(0, 10, n)) * 0.12
    if kind == "logo":
        out = np.zeros(int(3.0 * SR))
        place(out, kick(1.5) * 0.8, 0, 1)
        for k, m in enumerate([74, 81, 86]):
            place(out, bell(midi(m), 2.4) * 0.3, 0.05 + k * 0.05, 1)
        return reverb(out, 2.5, 5000, 0.45)
    raise ValueError(kind)


def read_wav(path):
    """Reads a WAV via ffmpeg, resampled to 48 kHz mono float."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], check=True, capture_output=True
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(float)


def write_wav(path, stereo):
    data = np.clip(stereo, -1, 1)
    pcm = (data * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    print("music…")
    music = build_music()

    print("narration…")
    voice = np.zeros(N)
    for line_id, at in TL["voiceover"].items():
        v = read_wav(os.path.join(ROOT, "voiceover", "wav", f"{line_id}.wav"))
        v = v / (np.max(np.abs(v)) + 1e-9) * 0.9
        place(voice, v, at, 1.0)

    print("sound effects…")
    effects = np.zeros(N)
    gains = {"notify": 0.5, "message": 0.35, "click": 0.22, "whoosh": 0.18, "doc": 0.4, "send": 0.45, "status": 0.4, "type": 0.5, "logo": 0.6}
    for cue in TL.get("sfx", []):
        place(effects, sfx(cue["kind"]), cue["t"], gains[cue["kind"]] * cue.get("gain", 1.0))

    # Duck the music under the narration (smoothed envelope, about -9 dB).
    env = np.abs(voice)
    win = int(0.25 * SR)
    env = np.convolve(env, np.ones(win) / win, mode="same")
    env = np.clip(env / 0.05, 0, 1)
    att = int(0.12 * SR)
    env = np.convolve(env, np.ones(att) / att, mode="same")
    duck = 1 - 0.65 * env

    music_l = music * duck
    # A touch of stereo width for music and effects; narration stays centred.
    delay = int(0.012 * SR)
    music_r = np.roll(music_l, delay)
    fx_r = np.roll(effects, int(0.004 * SR))
    left = music_l * 0.9 + effects * 0.9 + voice
    right = music_r * 0.9 + fx_r * 0.9 + voice
    stereo = np.stack([left, right], axis=1)
    stereo /= np.max(np.abs(stereo)) + 1e-9
    stereo *= 0.89

    raw = os.path.join(BUILD, "mix-raw.wav")
    write_wav(raw, stereo)
    out = os.path.join(BUILD, "soundtrack.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(SR), out], check=True
    )
    # Stems for review / re-editing.
    write_wav(os.path.join(BUILD, "stem-music.wav"), np.stack([music_l, music_r], axis=1) / (np.max(np.abs(music_l)) + 1e-9) * 0.8)
    write_wav(os.path.join(BUILD, "stem-voice.wav"), np.stack([voice, voice], axis=1))
    print("wrote", out)


if __name__ == "__main__":
    main()
