# BUILD-NOTES — Read With Me

## Stack

- Vanilla HTML/CSS/JS, no build step, no framework, no npm dependencies.
- Firebase JS SDK **12.10.0** loaded as ES modules from the official CDN
  (`https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js` +
  `firebase-ai.js`), imported lazily only when a hybrid call is made — the
  app boots and reads fully offline without touching the network.
- Books are static JSON + JPEG art under `books/`, produced by
  `tools/convert_books.py` from the author's reader-site assets.
- Read-aloud: narration pre-recorded with **Kokoro TTS** (kokoro 0.9.4,
  hexgrad/Kokoro-82M, voice `af_heart`, speed 0.97, generated on CPU by
  `tools/generate_audio.py`) — one MP3 per story page under
  `books/<id>/audio/`, referenced by each page's `audio` field in
  book.json; the app plays the file and keeps read-aloud going across
  page turns. The browser's built-in `speechSynthesis` (best en-US
  voice) is only a fallback for pages with no recording (cover, the one
  text-free picture page) or if a file fails to load.

## What is genuinely Firebase AI Logic — and what is not

Truthful paper trail for the Devpost "How we built it" answer:

- **Firebase AI Logic (real):** Layer 3 in `js/ai.js`. `getAI(app, { backend:
  new GoogleAIBackend() })`, then `getGenerativeModel(ai, { mode:
  InferenceMode.PREFER_ON_DEVICE, inCloudParams: { model: "gemini-3.8-flash" },
  systemInstruction })`. Badges for this layer come from
  `response.inferenceSource` (`"on_device"` → 📱 ON-DEVICE · Firebase AI
  Logic; `"in_cloud"` → ☁️ CLOUD · Firebase AI Logic) — the SDK's own
  report, not our guesswork. A failed primary-model call retries once with
  `gemini-3.5-flash-lite`.
- **NOT Firebase — the app's own layers, labeled as such everywhere:**
  - Layer 1 "Book Brain" is a hand-written dictionary (115 entries,
    `js/dictionary.js`) and hand-written per-page facts (`js/page-facts.js`).
    Plain local data, zero AI, zero network. Its badge never says Firebase
    or Nano.
  - Layer 2 talks **directly** to Chrome's built-in Prompt API
    (`LanguageModel` / `window.ai.languageModel`) — that is Gemini Nano via
    Chrome, not via Firebase. (Firebase hybrid mode *also* uses the Prompt
    API under the hood for its on-device side; when an answer comes through
    Layer 3 we badge it Firebase AI Logic, and when it comes through our
    direct call we badge it Gemini Nano. The distinction is preserved in
    code and in the UI legend.)

## Books: provenance and edits

Source: Jeff Rivera's own reader site (`~/workspace/reader-site/content/
books/…`), chapter text with `[img:…]` spread markers + extracted
illustrations, converted with a faithful port of the reader site's own
`pic_spreads()` parser. **No story words were changed.** Deliberate
front/back-matter handling:

- *Um Mommy*: praise-quotes spread moved to a `praise` field shown on the
  cover page; copyright/ToC spread dropped; the final spread trimmed to just
  "THE END" (sequel link + About the Author removed); Thank-You and
  recommended-books spreads dropped. Result: 10 story pages / 10 art files.
- *Stinky Baby Stevie*: all 17 spreads kept (17 pages / 17 art); standalone
  `***` scene-break ornaments stripped (they were decoration, not words);
  one page (index 7) is art-only and the reader renders a "look at the
  picture" note for it.
- Title note: the app uses **"Stinky Baby Stevie"** (the reader-site /
  published title, per instructions). The in-book title page art reads
  "STINKY BINKIE BABY STEVIE" — that's the book's own cover art, unchanged.

## Real problems hit (and what was done)

1. **App Check blocks the cloud — the one open item.** Live-verified
   2026-11-11: the SDK's `generateContent` POST to
   `firebasevertexai.googleapis.com/v1beta/projects/read-with-me-e7ca6/
   models/gemini-3.8-flash:generateContent` returns **HTTP 401,
   "Firebase App Check token is invalid." (UNAUTHENTICATED)**. Firebase
   enforces App Check for AI Logic (from Nov 2, 2026) and this project's
   App Check is "Unregistered". **Remaining step (console, owner-side):
   register App Check with the reCAPTCHA v3 provider for this web app,
   then add the App Check initialization to the app (the SDK docs' guided
   setup shows the snippet; local development will additionally need a
   registered debug token).** After that, re-run `tools/headless-test.js`;
   its cloud check passes on a genuine cloud answer. Until then the app
   degrades honestly (see TEST-LOG.md).
2. **`initializeDeviceModel` is absent from the 12.10.0 web bundle.**
   The docs describe calling it before the first hybrid prompt, but the
   shipped `firebase-ai.js` (12.10.0) does not export it on the model.
   `js/ai.js` calls it only if it exists (`typeof … === 'function'`), so
   the code follows the docs where the SDK allows and never crashes where
   it doesn't.
3. **Test browser's Prompt API is an echo stub.** chrome-headless-shell's
   `LanguageModel` reports `downloadable` but echoes prompts back with an
   "On-device model is not available in Chromium" prefix; worse, the
   Firebase SDK counts that echo as a successful on-device hybrid response.
   The app explicitly detects that stub text in both Nano paths and treats
   the layer as unavailable, so a stub echo can never be badged as an
   answer. No effect on real Chrome.
4. **Modals rendered despite `hidden`.** `.modal-backdrop{display:flex}`
   overrode the `hidden` attribute, so both modals painted on load. Fixed
   with a global `[hidden]{display:none !important}` rule and a regression
   check in the test suite.
5. **Sandbox browser has no internet.** All Chromium fetches fail here
   (egress proxy is tool-only). Tests relay external requests through Node
   fetch byte-for-byte, which is how the App Check 401 above was captured
   from the real project. The managed desktop Chromium also refuses
   scripted launches, hence chrome-headless-shell for tests.
6. **Book conversion details.** The reader-site spreads needed the
   front/back-matter judgment calls listed above, and Stinky's ornament
   lines merged into paragraph starts needed a regex cleanup pass
   (standalone and paragraph-leading `***`/`****` only).

## What remains

1. **Register App Check** (owner, Firebase console — reCAPTCHA v3) and add
   the App Check init snippet to `js/ai.js`'s Firebase bootstrap; register
   a debug token for local testing. Then verify a cloud 200 end-to-end and
   update TEST-LOG.md.
2. **Verify real Gemini Nano** on Chrome desktop 139+ with the model
   downloaded (the direct Layer-2 path and the SDK's on-device hybrid
   path). Cannot be proven in this sandbox (stub only).
3. Optional polish for judging: host the folder on Firebase Hosting under
   the same project (Spark plan) so the demo URL is a firebaseapp.com /
   web.app address; nothing in the code depends on the host.
4. The Devpost submission itself (text, screenshots are ready in
   `screenshots/`) — not done here, per instructions.

## Firebase config the app expects (`firebase-config.js`)

Public web-config values (safe to ship in client code; protection is App
Check + console rules, not secrecy):

- `apiKey`, `authDomain`, `projectId`, `storageBucket`,
  `messagingSenderId`, `appId` — required.
- `cloudModel` — optional, this project: `"gemini-3.8-flash"`.
- `fallbackModel` — optional, this project: `"gemini-3.5-flash-lite"`.

Currently shipped values are the real ones for project
`read-with-me-e7ca6`. A missing/placeholder config is detected and the app
falls back to fully on-device with an honest "Cloud is off" card.
