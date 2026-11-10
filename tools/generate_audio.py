#!/usr/bin/env python3
"""Pre-generate Read With Me's read-aloud narration with Kokoro TTS.

The book texts are fixed, so narration is baked at build time instead of
synthesized in the browser: one MP3 per story page, stored next to the
book as audio/page-NN.mp3, and an "audio" field added to that page in
book.json. Page text is used EXACTLY as it appears in book.json
(paragraphs in order); nothing about the book data changes except the
added "audio" fields.

Voice: Kokoro `af_heart` (warm American female storyteller), speed 0.97.
Engine: kokoro 0.9.4 (hexgrad/Kokoro-82M) on CPU, espeak-ng phonemizer.
Pages with no text (a pure picture page) get no audio and no field.

Run:  HF_HUB_DISABLE_XET=1 ~/.venvs/kokoro/bin/python tools/generate_audio.py
(Xet downloads stall behind this sandbox's proxy; classic HTTP works.)
"""
import json
import os
import subprocess
import sys
import tempfile

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS = ["um-mommy", "stinky"]
VOICE = "af_heart"
SPEED = 0.97
SR = 24000
GAP_BETWEEN_CHUNKS = np.zeros(int(SR * 0.15), dtype=np.float32)
GAP_BETWEEN_PARAS = np.zeros(int(SR * 0.45), dtype=np.float32)


def synth_page(pipeline, paras):
    """Synthesize one page: per paragraph, chunks joined with a short
    breath; paragraphs joined with a longer pause. Returns float32 PCM."""
    para_audios = []
    for para in paras:
        chunks = []
        for _gs, _ps, audio in pipeline(para, voice=VOICE, speed=SPEED):
            if audio is not None and len(audio):
                chunks.append(np.asarray(audio, dtype=np.float32))
        if not chunks:
            continue
        joined = chunks[0]
        for c in chunks[1:]:
            joined = np.concatenate([joined, GAP_BETWEEN_CHUNKS, c])
        para_audios.append(joined)
    if not para_audios:
        return None
    out = para_audios[0]
    for a in para_audios[1:]:
        out = np.concatenate([out, GAP_BETWEEN_PARAS, a])
    return out


def main():
    pipeline = KPipeline(lang_code="a")
    total_files = 0
    total_bytes = 0
    for book in BOOKS:
        book_dir = os.path.join(ROOT, "books", book)
        json_path = os.path.join(book_dir, "book.json")
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        audio_dir = os.path.join(book_dir, "audio")
        os.makedirs(audio_dir, exist_ok=True)
        for idx, page in enumerate(data["pages"]):
            rel = f"audio/page-{idx + 1:02d}.mp3"
            paras = [p for p in page.get("paras", []) if p.strip()]
            if not paras:
                page.pop("audio", None)
                print(f"{book} page {idx + 1}: no text — no audio")
                continue
            pcm = synth_page(pipeline, paras)
            if pcm is None:
                print(f"{book} page {idx + 1}: SYNTH RETURNED NOTHING", file=sys.stderr)
                return 1
            mp3_path = os.path.join(book_dir, rel)
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
                wav_path = tf.name
            try:
                sf.write(wav_path, pcm, SR)
                subprocess.run(
                    ["ffmpeg", "-y", "-v", "error", "-i", wav_path,
                     "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1", mp3_path],
                    check=True)
            finally:
                os.unlink(wav_path)
            page["audio"] = rel
            size = os.path.getsize(mp3_path)
            total_files += 1
            total_bytes += size
            print(f"{book} page {idx + 1}: {rel} {size} bytes, {len(pcm) / SR:.1f}s")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write("\n")
    print(f"TOTAL: {total_files} files, {total_bytes} bytes ({total_bytes / 1048576:.2f} MiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
