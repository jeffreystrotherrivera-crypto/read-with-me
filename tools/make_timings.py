#!/usr/bin/env python3
"""Build word-timing files for the recorded narration.

For every page that has an audio file, produce audio/page-NN.timing.json.
The title page counts too: book.json's "coverAudio" gets a timing file
built from its "coverParas" the same way.
{"duration": <sec>, "words": [[start, end], ...]} with one entry per
tappable word button on the page, in the exact order js/app.js renders
them (same tokenizing rule as renderParagraph in app.js).

Method: ffmpeg silencedetect finds the real speech spans in the MP3
(chunks and paragraphs are separated by true silence in the recording),
then words are distributed across the speech spans weighted by word
length and trailing punctuation. Good enough for read-along highlighting
that tracks the voice closely; it is an estimate, not forced alignment.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS = ["um-mommy", "stinky"]
WORD_RE = re.compile(r"^([^A-Za-z']*)([A-Za-z][A-Za-z'’\-]*)([^A-Za-z']*)$")


def page_words(paras):
    """Mirror renderParagraph: returns [(word, trailing_punct)] for buttons."""
    out = []
    for para in paras:
        for part in re.split(r"(\s+)", str(para)):
            if not part or re.fullmatch(r"\s+", part):
                continue
            m = WORD_RE.match(part)
            if m:
                out.append((m.group(2), m.group(3)))
    return out


def weight(word, punct):
    w = 2.0 + len(word) * 0.9
    if "," in punct:
        w += 1.2
    if any(c in punct for c in ".!?;:"):
        w += 2.2
    return w


def speech_spans(mp3):
    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", mp3], capture_output=True, text=True).stdout.strip())
    r = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", mp3, "-af",
         "silencedetect=noise=-35dB:d=0.12", "-f", "null", "-"],
        capture_output=True, text=True)
    sil = []
    start = None
    for line in r.stderr.splitlines():
        m = re.search(r"silence_start: ([\d.]+)", line)
        if m:
            start = float(m.group(1))
        m = re.search(r"silence_end: ([\d.]+)", line)
        if m and start is not None:
            sil.append((start, float(m.group(1))))
            start = None
    spans = []
    cur = 0.0
    for s, e in sil:
        if s > cur + 0.03:
            spans.append((cur, s))
        cur = max(cur, e)
    if dur > cur + 0.03:
        spans.append((cur, dur))
    return dur, spans or [(0.0, dur)]


def timings_for(words, spans):
    total_w = sum(weight(w, p) for w, p in words)
    speech_total = sum(e - s for s, e in spans)
    out = []
    span_i = 0
    span_pos = spans[0][0]
    used_w = 0.0
    for w, p in words:
        wt = weight(w, p)
        start = span_pos
        # advance through spans proportionally
        remaining = speech_total * wt / total_w
        t = start
        while remaining > 0:
            if span_i >= len(spans):
                t = spans[-1][1]
                break
            s, e = spans[span_i]
            avail = e - t
            if remaining <= avail:
                t += remaining
                remaining = 0
            else:
                remaining -= avail
                span_i += 1
                if span_i < len(spans):
                    t = spans[span_i][0]
                else:
                    t = spans[-1][1]
        out.append([round(start, 3), round(t, 3)])
        span_pos = t
        used_w += wt
    return out


def write_timing(book_dir, rel, paras, label):
    mp3 = os.path.join(book_dir, rel)
    words = page_words(paras)
    dur, spans = speech_spans(mp3)
    words_t = timings_for(words, spans)
    out_path = os.path.join(book_dir, rel.replace(".mp3", ".timing.json"))
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"duration": round(dur, 3), "words": words_t}, f)
    print(f"{label}: {len(words)} words, {dur:.1f}s, "
          f"{len(spans)} speech spans -> {os.path.basename(out_path)}")


def main():
    for book in BOOKS:
        book_dir = os.path.join(ROOT, "books", book)
        with open(os.path.join(book_dir, "book.json"), encoding="utf-8") as f:
            data = json.load(f)
        if data.get("coverAudio") and data.get("coverParas"):
            paras = [p for p in data["coverParas"] if str(p).strip()]
            write_timing(book_dir, data["coverAudio"], paras, f"{book} cover")
        for idx, page in enumerate(data["pages"]):
            rel = page.get("audio")
            if not rel:
                continue
            paras = [p for p in page.get("paras", []) if str(p).strip()]
            write_timing(book_dir, rel, paras, f"{book} page {idx + 1}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
