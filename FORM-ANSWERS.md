# FORM ANSWERS — Read With Me · #BuildHybridAI 2026 (Devpost)

Hackathon: https://firebasehybridaihackathon.devpost.com/
Deadline: **November 30, 2026, 2:00 PM PT**. Entry prepared, **NOT submitted**.

---

## ⚠️ FOR REVIEW BEFORE SUBMITTING (not part of the entry)

1. **Public code repository — MISSING, required.** The rules require a public
   GitHub or GitLab repo with an open-source license visible at the top of the
   repo page. The code has an MIT LICENSE file locally, but the project is not
   pushed to any public repo yet. A repo must be created and pushed before the
   form can be completed.
2. **Demo video — file ready, YouTube upload still needed.** The rules require
   the video to be publicly visible on YouTube with the link pasted into the
   form. File: `read-with-me-demo.mp4` in this folder (2 min 1 sec, under the
   3-minute limit). It still needs to be uploaded to YouTube as Public.
3. **One rules line to weigh — "all AI inference through Firebase AI Logic."**
   The requirements say: *"All of your app's AI inference must go through
   Firebase AI Logic, so don't call other model APIs directly."* Read With Me's
   hybrid layer does exactly that (Firebase AI Logic, `PREFER_ON_DEVICE`). The
   app ALSO has a separate, clearly-labeled layer that talks to Chrome's
   built-in Prompt API (Gemini Nano) directly, and a "Book Brain" layer that is
   not AI at all (a hand-written dictionary). Both are disclosed openly in the
   app's own How-it-works panel and in the description below — nothing is
   hidden. A strict judge could still read that line against the direct Nano
   layer. Options: submit as-is with the open disclosure, or trim the direct
   Nano layer from the app before submitting. Decision needed at review.
4. **Cloud answer is not shown completing in the video — by environment, not
   by app defect.** App Check is registered (reCAPTCHA Enterprise) and wired,
   but attestation cannot complete inside an automated test browser
   (bot-scored), so in the capture the "new ending" card stays on its honest
   "Thinking…" state; the video then opens the app's How-it-works panel, which
   explains the cloud layer. The rules explicitly accept App Check debug tokens
   in submissions, so a re-capture with a console-registered debug token (or a
   capture in a normal Chrome profile) could show a completed cloud answer.
5. **Tooling note:** the capture browser's "Chrome for Testing" info bar is
   visible at the top of the video frames. It is the browser's own banner, not
   part of the app.
6. **Official Rules page status:** as of this check (Nov 11, 2026, ~20:20 UTC)
   the /rules page still showed "Official Rules will be posted prior to the
   start of the Submission Period," while the hackathon homepage carries the
   full requirements summarized below. Worth one re-read of the final Official
   Rules at submit time.

---

## Submission form fields

**Project name**
Read With Me

**Elevator pitch / tagline**
A read-along picture-book app for kids that answers "what does that word mean?"
and "why?" right on the device — and only goes to the cloud for the big asks.

**Platform (select at least one)**
Web (Chrome)

**Try it / demo link**
https://joinlightningrod.com/readwithme/

**Code repository link**
⚠️ TO ADD — public repo not created yet (see note 1 above).

**Demo video link (YouTube, public)**
⚠️ TO ADD — video file ready locally (`read-with-me-demo.mp4`, 2:01); upload
to YouTube as Public and paste the link here (see note 2 above).

**Built with (tags)**
Firebase AI Logic · Firebase App Check (reCAPTCHA Enterprise) · Gemini Nano
(Chrome Prompt API) · Gemini 3.8 Flash (cloud, via Firebase AI Logic) ·
Kokoro TTS · JavaScript · HTML · CSS · Firebase (Spark plan)

**Team**
Jeff Rivera — solo entrant — jeff@bypasshollywood.com — Devpost:
jeffreystrotherrivera

---

## Project description (Devpost story fields)

### Inspiration

I'm a children's book author. My picture books — *Um... Mommy, I Think I
Flushed My Brother Down the Toilet* and *Stinky Baby Stevie* — are the books
inside this app. When kids read, the same two things happen on every page: they
hit a word they don't know, and they ask "why?" A grown-up isn't always there
to answer, and the usual fix — send the child's question to a cloud AI — means
a kid's words leave the device for something as small as "what's a plunger?"

I built Read With Me so the small questions get answered on the device itself,
instantly and privately, and the cloud is saved for the big, creative asks
where it's actually worth it. That's exactly the split hybrid inference is
for.

### What it does

Read With Me is a free read-along library with two of my published picture
books, full text and original illustrations:

- **Tap any word** in the story and a kid-friendly definition appears.
- **"Why?" button** on every page answers a question about that exact page.
- **Ask anything** about the page in the question box.
- **"Make me a new ending"** and **"Tell me about the real world"** — the big
  asks — go to Firebase AI Logic in hybrid mode.
- **Read to me**: real recorded narration (Kokoro voice) reads each page aloud
  with word-by-word highlighting. Stop, leave, come back — it resumes where it
  stopped, on this device only.
- **Every answer wears a badge naming the layer that actually made it** —
  on-device Book Brain, on-device Gemini Nano, on-device Firebase AI Logic, or
  cloud Firebase AI Logic. Nothing is hidden from the reader or the grown-ups.
- **Privacy by design**: no accounts, no sign-up, no analytics, no ads.
  Questions live only in the page's memory and a Clear button wipes them. A
  Grown-ups panel holds the cloud on/off switch.

### How I built it

Plain HTML, CSS and JavaScript — no framework, no build step — with the
Firebase JS SDK (12.10.0) loaded lazily, so the app boots and reads fully
offline. Three layers, honestly labeled:

1. **Book Brain (built into the app, not AI).** A hand-written dictionary of
   115 words from the two books, plus one hand-written "why?" fact for each of
   the 27 pages. Instant, offline, works in every browser, even in airplane
   mode.
2. **Gemini Nano (on-device).** Where Chrome offers its built-in model through
   the Prompt API, free-form questions are answered on the device. Detected
   honestly at runtime — if it isn't really there, the app says so and never
   fakes an answer.
3. **Firebase AI Logic (the hybrid layer).** `getGenerativeModel` with
   `InferenceMode.PREFER_ON_DEVICE`, cloud model `gemini-3.8-flash` with a
   `gemini-3.5-flash-lite` retry. The badge follows the SDK's own
   `response.inferenceSource` — on-device or in-cloud — not my guess. App
   Check (reCAPTCHA Enterprise) is initialized before the first AI Logic call,
   as Firebase requires.

Narration is pre-recorded with the Kokoro TTS voice (af_heart), one MP3 per
page shipped with the app, with timing files so the spoken word highlights as
it plays; pronunciation of tricky words (Binkie, Job, "ginormous," "Sssh") was
checked by ear and fixed. The books were converted from my own published
reader-site files with a small Python tool — no story words were changed.

**Built during the submission period:** the app itself was designed and built
for this hackathon on November 10–11, 2026. The two picture books are my own
previously published works; everything else — the reader, the three AI layers,
the badges, the narration and highlighting — is new.

**How Firebase AI Logic is used (required summary):** Firebase AI Logic is the
app's hybrid inference layer. Big asks are sent to a generative model created
with `PREFER_ON_DEVICE`, so the SDK answers on-device when a local model is
available and falls back to the cloud Gemini model when it isn't — and reports
which side answered, which the app shows on the answer's badge. App Check
protects the calls.

**Value proposition (required summary):** Kids get instant, private answers to
reading questions without their words leaving the device for small stuff;
parents get an app with no accounts and nothing stored; and the cloud is spent
only where it adds something a device can't — a brand-new story ending.

### Challenges I ran into

- **App Check.** Firebase enforces App Check for AI Logic, and my first cloud
  calls came back 401 "App Check token is invalid." I registered App Check
  with the reCAPTCHA Enterprise provider and initialized it before the AI
  Logic calls. Honest limit: an automated test browser can't complete
  reCAPTCHA attestation, so the cloud path still can't be proven from a
  headless test rig — in a real visitor's browser the flow is complete.
- **A test-browser trap.** The headless test browser's built-in model was a
  stub that echoed prompts back, and the SDK counted the echo as a successful
  on-device answer. The app now detects that stub text explicitly, so an echo
  can never be badged as a real answer.
- **Highlighting that tells the truth.** The word highlighting is driven by
  timing spans taken from the actual recordings, not guessed — so the word
  that lights up is the word being spoken.

### Accomplishments I'm proud of

- The badge system. Every single answer says where it was made, and the badge
  comes from the SDK's own report wherever the SDK is involved.
- Airplane mode is a real feature, not a slogan: the dictionary, the page
  facts and the narration all work with the network off.
- The automated test suite passes 27/27, including the honest-failure cases —
  cloud off, config missing, model unavailable — each producing a plain,
  truthful message instead of a fake answer.

### What I learned

Hybrid inference is mostly a honesty problem: the tech will happily let you
claim an answer came from wherever you like. Building the UI so the badge has
to follow the SDK's own `inferenceSource` — and handling the stub-echo case —
taught me more about shipping trustworthy on-device AI than the happy path
did.

### What's next

- More of my picture books in the library (the Um...Mommy series has three).
- A debug-token test pass so the automated suite can prove a genuine cloud
  answer end to end.
- Reading-level settings in the Grown-ups panel, so definitions grow up with
  the reader.

---

## Screenshot gallery (in `screenshots/`)

- `20-demo-library.png` — library, both books
- `21-demo-title-page.png` — the book's real title page
- `22-demo-readalong-highlight.png` — narration playing, word highlighted
- `23-demo-word-card.png` — "plunger" definition, ON-DEVICE · Book Brain badge
- `24-demo-why-card.png` — page "Why?" fact card
- `25-demo-ending-thinking.png` — big ask in flight (see note 4 above)
- `26-demo-how-it-works.png` — the badge legend: all three layers explained
