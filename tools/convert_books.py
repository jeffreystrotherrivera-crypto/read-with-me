#!/usr/bin/env python3
"""
Convert Jeff Rivera's picture books from the reader-site format
(content/books/<slug>/chapters/01.txt with [img:file.jpg] spread markers,
the exact format parsed by the reader site's pic_spreads() in
public/index.php) into per-book book.json files for Read With Me.

Front/back matter handling for a kids' reader (documented, deliberate):
- Um Mommy Book 1: the copyright/sequel-link spread and the post-story
  spreads (Thank You page, "books the author recommends" lists) are NOT
  story pages and are dropped; the praise quotes from the first spread
  are kept as `praise` on the cover page; the story's "THE END" spread
  keeps only its "THE END" line.
- Stinky Baby Stevie: all spreads are title/story pages; kept whole,
  minus a lone "****" scene-break ornament line.
No story words are changed anywhere.
"""
import json, re, shutil, sys
from pathlib import Path

SRC = Path.home() / "workspace/reader-site/content/books"
DST = Path.home() / "workspace/read-with-me/books"

def pic_spreads(text):
    """Faithful port of the reader site's pic_spreads() (PHP)."""
    spreads, img, paras, buf = [], None, [], ""
    def flush_para():
        nonlocal buf
        if buf.strip():
            paras.append(buf.strip())
        buf = ""
    def flush_spread():
        nonlocal img, paras
        flush_para()
        if img is not None or paras:
            spreads.append({"img": img, "paras": list(paras)})
        img, paras = None, []
    for line in re.split(r"\r?\n", text):
        m = re.match(r"^\s*\[img:([^\]]+)\]\s*$", line)
        if m:
            flush_spread(); img = m.group(1).strip(); continue
        if re.match(r"^\s*\[page\]\s*$", line):
            flush_spread(); continue
        if line.strip() == "":
            flush_para(); continue
        buf += ("" if buf == "" else " ") + line.strip()
    flush_spread()
    return spreads or [{"img": None, "paras": []}]

def safe_name(name, i):
    ext = Path(name).suffix.lower()
    return f"art-{i:02d}{ext}"

def build(slug, out_dir, title, subtitle, drop_spreads=(), trim_rules=None):
    book_src = SRC / slug
    text = (book_src / "chapters/01.txt").read_text(encoding="utf-8")
    spreads = pic_spreads(text)
    out = DST / out_dir
    (out / "art").mkdir(parents=True, exist_ok=True)
    pages, praise = [], []
    art_i = 0
    for si, sp in enumerate(spreads):
        if si in drop_spreads:
            continue
        paras = sp["paras"]
        if trim_rules:
            paras = trim_rules(si, paras)
            if paras is None:
                continue
        page = {"paras": paras}
        if sp["img"]:
            art_i += 1
            name = safe_name(sp["img"], art_i)
            shutil.copyfile(book_src / "pics" / sp["img"], out / "art" / name)
            page["img"] = f"art/{name}"
        pages.append(page)
    shutil.copyfile(book_src / "cover.jpg", out / "cover.jpg")
    data = {"id": out_dir, "title": title, "subtitle": subtitle,
            "author": "Jeff Rivera", "cover": "cover.jpg", "pages": pages}
    (out / "book.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{title}: {len(spreads)} spreads in source -> {len(pages)} pages, {art_i} art files")
    return data

# ---- Um Mommy Book 1 -------------------------------------------------------
# spread 0: praise quotes (page01 art) -> moved to cover-page `praise`
# spread 1: copyright + Amazon sequel link + contents -> dropped
# spread 11 (page12 art): "THE END" + sequel link + About the Author -> keep "THE END" only
# spreads 12,13,14: Thank You / recommended-books lists -> dropped
raw = pic_spreads((SRC / "um-mommy-i-think-i-flushed-my-brother-down-the-toilet/chapters/01.txt").read_text(encoding="utf-8"))
praise = raw[0]["paras"]
def um_trim(si, paras):
    if si == 11:
        return ["THE END"]
    return paras
um = build("um-mommy-i-think-i-flushed-my-brother-down-the-toilet", "um-mommy",
           "Um...Mommy, I Think I Flushed My Brother Down the Toilet",
           "Book 1 of the Um Mommy series",
           drop_spreads={0, 1, 12, 13, 14}, trim_rules=um_trim)
um["praise"] = praise
(DST / "um-mommy/book.json").write_text(json.dumps(um, ensure_ascii=False, indent=1), encoding="utf-8")

# ---- Stinky Baby Stevie ----------------------------------------------------
def stinky_trim(si, paras):
    # drop the book's "***" scene-break ornaments (standalone or leading a paragraph)
    out = []
    for p in paras:
        p = re.sub(r"^\*+\s*", "", p)
        if p:
            out.append(p)
    return out
build("stinky-baby-stevie", "stinky",
      "Stinky Baby Stevie",
      "A Kids Book",
      trim_rules=stinky_trim)
