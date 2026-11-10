# Read With Me 📖

A read-along e-reader for kids. On-device AI explains tricky words and answers
"why?" questions privately and offline. The cloud steps in only for the big
stuff.

Built for the **#BuildHybridAI 2026** hackathon (Firebase AI Logic).

**The books** — real, published children's books by the builder, Jeff Rivera:

- **_Um...Mommy, I Think I Flushed My Brother Down the Toilet_** — Book 1 of the
  Um Mommy series
- **_Stinky Baby Stevie_** — a Kids Book

Both books ship inside the app with their full text and original illustrations.

## How it works — hybrid AI, three layers, every answer badged

Every answer card wears a badge naming the layer that actually produced it:

| Badge | Layer | What it is |
|---|---|---|
| 📱 ON-DEVICE · Book Brain | Built into the app | A hand-written kid dictionary (115 words from the two books) + one curated "why?" fact per page. No AI model, no network — works in airplane mode, in every browser. |
| 📱 ON-DEVICE · Gemini Nano | Chrome Prompt API | When the browser offers Chrome's built-in Gemini Nano (`LanguageModel` API), free-form questions are answered on-device. Detected honestly at runtime — never faked. |
| 📱 / ☁️ Firebase AI Logic | Firebase AI Logic hybrid | `getGenerativeModel` with `InferenceMode.PREFER_ON_DEVICE` (Firebase JS SDK 12.10.0, Google AI backend). The SDK tries on-device inference first, falls back to the cloud model (`gemini-3.8-flash`, fallback `gemini-3.5-flash-lite`), and reports which side answered via `response.inferenceSource` — the badge follows that, not our guess. Used for "big asks": *Make me a new ending* and *Tell me about real toilets and plumbing*. |

Privacy by design: no accounts, no sign-up, no analytics, nothing is stored.
Questions live only in the page's memory while it is open, and a **Clear**
button wipes them. A **Grown-ups panel** holds the cloud on/off toggle and the
privacy notes. Read-aloud narration is pre-recorded with the **Kokoro**
voice (`af_heart`, generated locally by `tools/generate_audio.py`) — one
MP3 per story page, shipped with the app, so it also works offline; the
browser's built-in speech synthesis remains only as a fallback.

## Setup

The Firebase web config for the **Read With Me** project
(`read-with-me-e7ca6`, free Spark plan) is already in `firebase-config.js`.
To use your own project instead:

1. Create a free Firebase project, enable **AI Logic** (Gemini Developer API),
   and copy your web app's config.
2. Paste the values into `firebase-config.js` (see `firebase-config.example.js`
   for the field-by-field template).
3. Serve the folder statically — any static host works, e.g.:

   ```sh
   python3 -m http.server 8000
   # then open http://localhost:8000/
   ```

   (Opening `index.html` from `file://` will not work — the app fetches the
   book files.)
4. Open the page in Chrome 139+ on desktop for the full hybrid experience.

**One console step is still outstanding for this project:** App Check
enforcement for AI Logic is on, and this app's App Check is not registered
yet, so cloud calls currently return HTTP 401 *"Firebase App Check token is
invalid."* Registering App Check (reCAPTCHA v3 provider) in the Firebase
console is the remaining step — see `BUILD-NOTES.md`. Everything on-device
works regardless.

If `firebase-config.js` is missing or blank, the app still fully works
on-device and says so honestly: big asks return a "Cloud is off — add
Firebase config" card.

## Judge demo script (≈3 minutes)

1. **Airplane mode first.** Turn on airplane mode / disconnect, reload, open
   *Um...Mommy…* Tap the word **"plunger"** — instant definition, badge
   **📱 ON-DEVICE · Book Brain**. Tap **Why?** — a fact about that exact page,
   same badge. Turn pages, use **🔊 Read to me**. This layer never needs a
   network.
2. **Nano question (Chrome desktop with Gemini Nano available).** Reconnect.
   Ask in the question box: *"Why is Falisha in trouble?"* If Chrome offers
   Gemini Nano, the badge reads **📱 ON-DEVICE · Gemini Nano** and the answer
   was generated locally — check the **Grown-ups panel** for the live Nano
   status line on this machine.
3. **Cloud big ask.** Tap **✨ Make me a new ending**. The request goes to
   Firebase AI Logic in hybrid mode; the badge names the side that answered
   (**☁️ CLOUD · Firebase AI Logic**, or 📱 if the SDK served it on-device).
   Then open **Grown-ups**, switch **Cloud answers OFF**, and tap the button
   again — big asks now honestly explain the cloud is off, while words and
   Why? keep working.
4. **Privacy.** Ask a few questions, watch them collect under *Questions we
   asked*, then hit **Clear** — they're gone. Reload: nothing was saved.
   There is no account, no analytics, nothing to leak.

## Project layout

```
index.html                  app shell (library, reader, modals)
css/style.css               warm picture-book theme, big tap targets
js/app.js                   UI: library, reader, read-aloud, answer cards
js/ai.js                    the hybrid router (3 layers, badges, fallbacks)
js/dictionary.js            Layer 1a: 115 kid-friendly definitions
js/page-facts.js            Layer 1b: one curated why-fact per page (27)
firebase-config.js          this project's Firebase web config (public values)
firebase-config.example.js  blank template + field guide
books/um-mommy/             book.json + art/ (10 pages, 10 illustrations)
books/stinky/               book.json + art/ (17 pages, 17 illustrations)
tools/convert_books.py      reader-site -> app book converter (provenance)
tools/headless-test.js      automated test suite (see TEST-LOG.md)
screenshots/                library, story page, answer card
```

The books were converted from the author's own book-reader site assets with
`tools/convert_books.py`; no story words were changed (front/back matter was
trimmed — details in `BUILD-NOTES.md`).

## License

MIT for the app code (see `LICENSE`). The two books' text and illustrations
remain © Jeff Rivera, all rights reserved.
