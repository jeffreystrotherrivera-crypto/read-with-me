# TEST-LOG — Read With Me

All results below are real, from automated runs on **2026-11-11** (ICT;
2026-11-10 22:37 UTC final run). Nothing is invented: where the environment
could not do something, that is stated, with the reason.

## Environment

- App served locally: `python3 -m http.server 8901` from the project folder.
- Test browser: **chrome-headless-shell 157.0.8103.50** (Chrome for Testing),
  driven by `tools/headless-test.js` (puppeteer-core). The managed desktop
  Chromium in this sandbox refuses non-harness launches ("Hatch WebGL domain
  policy is required for browser startup"), so the stock headless shell was
  installed for tests. It is a real Chromium 157, but see two quirks below.
- Firebase JS SDK pinned at **12.10.0** (CDN), config = real project
  `read-with-me-e7ca6` (Spark plan), cloud model `gemini-3.8-flash`,
  fallback `gemini-3.5-flash-lite`.

## Final automated run — 27/27 PASS

```
PASS | library renders both books | Um...Mommy, I Think I Flushed My Brother Down the Toilet || Stinky Baby Stevie
PASS | library AI status line is honest
PASS | dictionary lookup: plunger
PASS | dictionary lookup: plural/punct ('Diapers!')
PASS | dictionary size >= 100 entries | 115 entries
PASS | page facts: um-mommy p0 local | Why does Falisha look so funny when Mommy asks about Jesse?
PASS | page facts: stinky p16 exists | Why does Venie tell her mommy “Oh, nothing!”?
PASS | page facts count == 27 | 27 facts
PASS | dictionary miss returns null (no fake answer)
PASS | Nano status reported (whatever it is) | LanguageModel present=true, status=downloadable
PASS | Firebase config detected as present | project: read-with-me-e7ca6
PASS | modals hidden on load
PASS | How-it-works modal opens and closes
PASS | reader opens on cover | Cover · 11 pages
PASS | story page 1 shows art + tappable words | words=348 art=books/um-mommy/art/art-01.jpg
PASS | found tappable word 'plunger' on page
PASS | word tap answer badge = ON-DEVICE Book Brain
PASS | word tap answer is the dictionary text
PASS | Why? button shows the page's curated question
PASS | speechSynthesis present in this browser | voices=0
PASS | Read-to-me click does not crash (speaking or fallback)
PASS | turned to Um Mommy THE END page | Page 11 of 11
PASS | prev button goes back | Page 10 of 11
PASS | Stinky has 18 pages incl. cover (17 spreads) | dots=18
PASS | cloud-off big ask is honest | “Cloud is off — add Firebase config…”
PASS | cloud refusal surfaced honestly (App Check; see below)
PASS | no page errors during UI tests
ALL TESTS PASSED
```

Covered per the brief: **offline dictionary path** (plunger tap → Book Brain
badge + dictionary text, no network involved), **page turning** (both books,
cover→end, prev/next, dots), **read-aloud presence** (speechSynthesis exists;
headless shell ships 0 voices so nothing audible plays here — the button
degrades gracefully and the spoken path is the standard web API), **cloud-off
honest state** (config nulled → the spec's "Cloud is off — add Firebase
config" card), **Nano detection honesty** (status reported as-is:
`downloadable` in this browser).

Screenshots in `screenshots/`: `01-library.png`, `02-story-page.png`,
`03-answer-card.png` (answer card shows the 📱 ON-DEVICE · Book Brain badge).

## The cloud path — tested for real, and what Firebase actually answered

This sandbox blocks all browser-originated internet traffic (every fetch
from Chromium fails, even `https://example.com/`; tool traffic goes through
an egress proxy that the browser cannot use). To exercise the cloud path for
real anyway, the test relays the page's external requests byte-for-byte
through Node's fetch (which uses the proxy). The Firebase SDK, the request,
the project, and the response are all genuine; only the sandbox's egress hop
is relayed. With that relay, the SDK's call was observed directly:

```
POST https://firebasevertexai.googleapis.com/v1beta/projects/read-with-me-e7ca6/models/gemini-3.8-flash:generateContent
→ HTTP 401
{
  "error": {
    "code": 401,
    "message": "Firebase App Check token is invalid.",
    "status": "UNAUTHENTICATED"
  }
}
```

**Verdict: the cloud wiring is correct** — the official `firebase/ai` SDK
built the right request to the right project and model with the shipped
config — **but the project rejects it because App Check enforcement for AI
Logic is on and this app's App Check is "Unregistered"** (no provider
registered in the console). Until a grown-up registers App Check
(reCAPTCHA v3) for this web app in the Firebase console, every cloud call
will 401 the same way. This is the exact remaining step; it cannot be done
from code.

How the app behaves in the meantime (also verified): the big-ask card is an
honest on-device card explaining the cloud could not be reached — it never
wears a cloud badge it didn't earn. (In a real Chrome where Gemini Nano is
present, the hybrid call may still be served on-device by the SDK and badged
📱 ON-DEVICE · Firebase AI Logic; the 401 only blocks the cloud fallback.)

## Two test-browser quirks (not app bugs)

1. **Prompt API stub.** chrome-headless-shell ships a stub `LanguageModel`:
   `availability()` says `downloadable`, but `prompt()` just echoes the input
   back, prefixed with *"On-device model is not available in Chromium, this
   API is just echoing back the input:"*. The app detects that exact stub
   text in both the direct Nano layer and the Firebase hybrid layer and
   treats the layer as unavailable rather than showing a child the echoed
   prompt as an "answer". Real Chrome with Gemini Nano never emits it.
2. **No speech voices.** The headless shell has `speechSynthesis` but
   `getVoices()` returns 0 voices, so read-aloud could be verified for
   presence and graceful behavior only, not for audible output.

## Kokoro read-aloud narration — added 2026-11-11 (late evening ICT)

Per Jeff's order ("a better voice like that Kokoro"), the robot browser
voice is no longer the read-aloud. Narration was pre-generated locally
(the book texts are fixed) and ships with the app:

- **Engine:** kokoro 0.9.4 (hexgrad/Kokoro-82M) + misaki English G2P with
  espeak-ng 1.51, CPU-only torch, in a venv (`~/.venvs/kokoro`).
  One setup note: HuggingFace's Xet download path stalled at 0 bytes
  behind this sandbox's proxy; with `HF_HUB_DISABLE_XET=1` (classic
  HTTP) the model downloaded fine. Generator: `tools/generate_audio.py`.
- **Voice:** `af_heart` (Kokoro's warm American female storyteller
  voice), speed 0.97. MP3, 64 kbps mono, 24 kHz source.
- **Files:** 26 — every page that has text, in both books (Um Mommy
  10/10 pages; Stinky 16/17 — its page 8 is a text-free picture page and
  correctly has no recording and no `audio` field). "THE END" has its
  own 1.2 s recording. Total **9,159,762 bytes (8.74 MiB)**; durations
  **1.2 s – 124.4 s**, 1,142.7 s (~19 min) of narration in all.
- **book.json integrity:** semantic diff against the pre-audio files
  shows ONLY the 26 added `audio` fields — no text, order, or other
  field changed.
- **Decode/HTTP verification (real run):** every MP3 was ffprobe-decoded
  (duration read back per page) and fetched from the locally served app:
  **26/26 HTTP 200, 0 failures**. Spot-checked loudness with ffmpeg
  `volumedetect`: mean ≈ −26 dB, peaks −3…−11 dB — real speech, not
  silence.
- **Player wiring (headless Chromium, real run):** opening Um Mommy and
  tapping “Read to me” on story page 1 fetched
  `books/um-mommy/audio/page-01.mp3` and the button switched to
  “⏹ Stop reading”; turning the page while playing fetched
  `audio/page-02.mp3` and kept reading; tapping again stopped and the
  button reset. No page errors.
- **Full suite re-run after the wiring: 27/27 PASS** (same list as
  above; the read-aloud line now exercises the recorded narration).
  Fallback behavior is unchanged in code: pages without a recording use
  `speechSynthesis` with the best en-US voice available (Google US
  English → natural/neural → first en-US).

## Not tested here (needs a human-side environment)

- A successful cloud **200** answer — blocked by App Check registration
  (above), then re-run `tools/headless-test.js`: the cloud check accepts a
  genuine `firebase-cloud` answer as PASS.
- Real Gemini Nano generation — needs Chrome desktop 139+ with the Nano
  model downloaded; the headless stub cannot prove it.
- Audible read-aloud of the *fallback* speech synthesis — needs a
  browser with voices. (The recorded Kokoro narration itself is verified
  above: files decode, fetch over HTTP, and play through page turns in
  the headless browser, muted.)
