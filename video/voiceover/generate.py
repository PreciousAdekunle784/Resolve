"""Generates the narration with Kokoro (open-source TTS, Apache-2.0).

Usage:
  python generate.py <models_dir> [voice]
Needs: pip install kokoro-onnx soundfile
Model files (download once, not committed):
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
Writes one WAV per line to voiceover/wav/ and durations to voiceover/durations.json.
"""
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

here = os.path.dirname(os.path.abspath(__file__))
models = sys.argv[1]
script = json.load(open(os.path.join(here, "script.json")))
voice = sys.argv[2] if len(sys.argv) > 2 else script["voice"]
kokoro = Kokoro(os.path.join(models, "kokoro-v1.0.onnx"), os.path.join(models, "voices-v1.0.bin"))
out_dir = os.path.join(here, "wav")
os.makedirs(out_dir, exist_ok=True)
durations = {}
for line in script["lines"]:
    samples, rate = kokoro.create(line["text"], voice=voice, speed=script["speed"], lang="en-us")
    sf.write(os.path.join(out_dir, f"{line['id']}.wav"), samples, rate)
    durations[line["id"]] = round(len(samples) / rate, 3)
    print(line["id"], durations[line["id"]], "s")
json.dump(durations, open(os.path.join(here, "durations.json"), "w"), indent=2)
