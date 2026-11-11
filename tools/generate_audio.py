#!/usr/bin/env python3
"""Pre-generate Read With Me's read-aloud narration with Kokoro TTS.

The book texts are fixed, so narration is baked at build time instead of
synthesized in the browser: one MP3 per story page, stored next to the
book as audio/page-NN.mp3, and an "audio" field added to that page in
book.json. Page text is used EXACTLY as it appears in book.json
(paragraphs in order); nothing about the book data changes except the
added "audio" fields.

Each book also gets a TITLE PAGE recording (audio/page-00.mp3): the
title, "by Jeff Rivera" and the subtitle, read in the same voice. Its
paragraphs live in book.json as "coverParas" and its file as
"coverAudio"; the title page renders those paragraphs as tappable,
highlightable words exactly like a story page.

Voice: Kokoro `af_heart` (warm American female storyteller), speed 0.97.
Engine: kokoro 0.9.4 (hexgrad/Kokoro-82M) on CPU, espeak-ng phonemizer.
Pages with no text (a pure picture page) get no audio and no field.

PRONUNCIATION: Kokoro's G2P (misaki/espeak-ng) misreads a few written
forms in these books. The fixes below respell ONLY the text fed to the
synthesizer — the words printed in the book never change. Every entry
was verified against the phoneme strings the pipeline itself produces
(KPipeline with model=False; see the 2026-11-11 pronunciation pass):
  BINKIE  caps form was spelled out letter by letter
          (bˌiˌIˌɛnkˌAˌIˈi); "Binkie" gives bˈɪŋki = "BINK-ee". Same
          for STEVIE (spelled out) vs "Stevie" (stˈivi).
  Job     the nephew's name is the biblical Job (ʤˈOb, "JOHB"); plain
          "Job" phonemizes to ʤˈɑb, the work kind of job. Feed "Jobe".
  gi-gi-gi-gi-normous / gi-gi-gi-normous
          the stutter before "ginormous" came out with a hard G
          (ɡˈiɡˈi...) because espeak reads "gi" as in "give"; spelling
          it "ji-ji-..." gives the soft-G stutter ʤˈIʤˈI... that
          lands on "ginormous" (ʤInˈɔɹməs).
  Sssh    consonant-only strings are spelled out by the G2P
          (ˌɛsˌɛsˌɛsˈAʧ = "ess ess ess aitch"); the spoken word "Shush"
          (ʃˈʌʃ) is the sound the line means.
Checked and CORRECT as written (phoneme evidence on file): Binkie in
normal case (bˈɪŋki), Stevie (stˈivi), Venie (vˈini, rhymes with Leenie
lˈini / Greenlee ɡɹˈinli as the book's rhyme intends), Falisha
(fælˈiʃə), Faseesha (fæsˈiʃə — Jesse's baby-talk for Falisha, wrong on
purpose in the story itself), Jesse (ʤˈɛsi), Jell-O (ʤˈɛlˌO), Rivera
(ɹɪvˈɛɹə), Afro (ˈæfɹO), Limburger, fellies, slobbery, gooshy family,
and both book titles in sentence case.

Run:  HF_HUB_DISABLE_XET=1 ~/.venvs/kokoro/bin/python tools/generate_audio.py
      ... regenerate everything, or select pieces, e.g.
      HF_HUB_DISABLE_XET=1 ~/.venvs/kokoro/bin/python tools/generate_audio.py stinky:1,4,cover
(Xet downloads stall behind this sandbox's proxy; classic HTTP works.)
"""
import json
import os
import re
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

# The title page of each book, read aloud: title, byline, subtitle.
# For Stinky the title is the one printed on its own cover and title
# page — "Stinky Binkie Baby Stevie" (book.json's shorter "title" is
# the library-catalog name).
COVER_PARAS = {
    "um-mommy": [
        "Um... Mommy, I Think I Flushed My Brother Down the Toilet",
        "by Jeff Rivera",
        "Book 1 of the Um Mommy series",
    ],
    "stinky": [
        "Stinky Binkie Baby Stevie",
        "by Jeff Rivera",
        "A Kids Book",
    ],
}
COVER_AUDIO = "audio/page-00.mp3"

# Written form (as printed) -> spoken form (fed to Kokoro). Applied per
# word token, punctuation around the word untouched.
PRONUNCIATION = {
    "BINKIE": "Binkie",
    "STEVIE": "Stevie",
    "Job": "Jobe",
    "gi-gi-gi-gi-normous": "ji-ji-ji-ji-normous",
    "gi-gi-gi-normous": "ji-ji-ji-normous",
    "Sssh": "Shush",
}
WORD_RE = re.compile(r"^([^A-Za-z']*)([A-Za-z][A-Za-z'’\-]*)([^A-Za-z']*)$")


def tts_text(text):
    """Respell the flagged words in a paragraph for the synthesizer."""
    out = []
    for part in re.split(r"(\s+)", str(text)):
        m = WORD_RE.match(part) if part and not part.isspace() else None
        if m and m.group(2) in PRONUNCIATION:
            part = m.group(1) + PRONUNCIATION[m.group(2)] + m.group(3)
        out.append(part)
    return "".join(out)


def synth_page(pipeline, paras):
    """Synthesize one page: per paragraph, chunks joined with a short
    breath; paragraphs joined with a longer pause. Returns float32 PCM.
    The pronunciation map is applied to the TTS input only."""
    para_audios = []
    for para in paras:
        chunks = []
        for _gs, _ps, audio in pipeline(tts_text(para), voice=VOICE, speed=SPEED):
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


def write_mp3(pcm, mp3_path):
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
    return os.path.getsize(mp3_path)


def parse_selection(argv):
    """'stinky:1,4,cover' -> {'stinky': {'1', '4', 'cover'}} (1-based
    page numbers as printed in the file names). None = everything."""
    sel = {}
    for arg in argv:
        book, _, pages = arg.partition(":")
        if book not in BOOKS:
            raise SystemExit(f"unknown book {book!r} (want one of {BOOKS})")
        sel[book] = {p.strip() for p in pages.split(",") if p.strip()}
    return sel or None


def main(argv):
    selection = parse_selection(argv)
    pipeline = KPipeline(lang_code="a")
    total_files = 0
    total_bytes = 0
    for book in BOOKS:
        if selection is not None and book not in selection:
            continue
        want = selection[book] if selection else None
        book_dir = os.path.join(ROOT, "books", book)
        json_path = os.path.join(book_dir, "book.json")
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        audio_dir = os.path.join(book_dir, "audio")
        os.makedirs(audio_dir, exist_ok=True)

        if want is None or "cover" in want:
            paras = COVER_PARAS[book]
            pcm = synth_page(pipeline, paras)
            if pcm is None:
                print(f"{book} cover: SYNTH RETURNED NOTHING", file=sys.stderr)
                return 1
            size = write_mp3(pcm, os.path.join(book_dir, COVER_AUDIO))
            data["coverParas"] = paras
            data["coverAudio"] = COVER_AUDIO
            total_files += 1
            total_bytes += size
            print(f"{book} cover: {COVER_AUDIO} {size} bytes, {len(pcm) / SR:.1f}s")

        for idx, page in enumerate(data["pages"]):
            if want is not None and str(idx + 1) not in want:
                continue
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
            size = write_mp3(pcm, os.path.join(book_dir, rel))
            page["audio"] = rel
            total_files += 1
            total_bytes += size
            print(f"{book} page {idx + 1}: {rel} {size} bytes, {len(pcm) / SR:.1f}s")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write("\n")
    print(f"TOTAL: {total_files} files, {total_bytes} bytes ({total_bytes / 1048576:.2f} MiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
