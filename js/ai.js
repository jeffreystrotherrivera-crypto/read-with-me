/* =====================================================================
   Read With Me — hybrid inference router (the technical core).

   THREE LAYERS, tried in order, and every answer reports which layer
   actually produced it (the UI stamps it with a badge — nothing is
   faked, and a layer that isn't really there is never claimed):

   Layer 1 — ON-DEVICE "Book Brain" (this app's own local layer):
     * the built-in kid dictionary (js/dictionary.js)
     * hand-written per-page facts (js/page-facts.js)
     Pure local data. Works offline / in airplane mode, in any browser.

   Layer 2 — ON-DEVICE Gemini Nano via Chrome's Prompt API:
     * window.LanguageModel (older Chrome: window.ai.languageModel)
     * Used for free-form questions when Chrome reports the model
       available. Detection is honest: we call availability() and only
       claim the layer when it answers 'available' (or a session can
       really be created after a user-approved download).

   Layer 3 — CLOUD via Firebase AI Logic (Google's official web SDK,
     package "firebase/ai", loaded as ES modules from the Firebase CDN):
     * getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE,
         inCloudParams: { model: <Gemini cloud model> } })
       This IS Firebase AI Logic's hybrid mode: the SDK itself tries
       Chrome's on-device model (via the same Prompt API) first and
       falls back to the cloud Gemini model. Each response carries
       response.inferenceSource ("on_device" | "in_cloud"), and we
       badge the answer from that value — "ON-DEVICE · Firebase AI
       Logic" vs "CLOUD · Firebase AI Logic".
     * Used for the "big asks" (new endings, real-world facts) and as
       a last resort for words/questions the first layers can't answer.
     * Config comes ONLY from window.RWM_FIREBASE_CONFIG, set by
       firebase-config.js (see firebase-config.example.js). No config
       (or the grown-ups' cloud toggle off) => this layer reports
       itself honestly off and the app keeps working on-device.

   What is NOT Firebase AI Logic: layers 1 and 2 are this app's own
   code. Layer 2 and the on-device half of layer 3 both ultimately run
   Gemini Nano through Chrome's Prompt API, but they are reached
   through different code paths (direct Prompt API vs. the Firebase
   SDK), and the badges say which path served each answer.
   ===================================================================== */
(function () {
  "use strict";
  window.RWM = window.RWM || {};

  var FB_SDK_VERSION = "12.10.0"; // >= 12.5.0 required for hybrid on-device inference
  var FB_BASE = "https://www.gstatic.com/firebasejs/" + FB_SDK_VERSION + "/";

  var SYSTEM_PROMPT =
    "You are a kind reading buddy for a child aged 5 to 8. " +
    "Use very simple words and short sentences. Be warm and a little bit funny. " +
    "Never mention anything scary, rude, or grown-up. " +
    "If you do not know something, say so honestly. " +
    "For word meanings, answer in at most 40 words. " +
    "For story questions, answer in at most 70 words. " +
    "For new endings and real-world facts, answer in at most 110 words. " +
    "Do not use lists, headings, or emojis. Just talk like a storyteller.";

  var settings = { cloudEnabled: true }; // grown-ups panel can turn this off

  /* ---------------- small utilities ---------------- */

  function trimToWords(text, max) {
    var words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (words.length <= max) return words.join(" ");
    return words.slice(0, max).join(" ") + "…";
  }

  function cleanWord(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/^[^a-z]+|[^a-z'-]+$/g, "")
      .replace(/'s$/, "")
      .trim();
  }

  function wordCandidates(w) {
    var list = [w];
    if (/ies$/.test(w) && w.length > 3) list.push(w.replace(/ies$/, "y"));
    if (/es$/.test(w) && w.length > 3) list.push(w.replace(/es$/, ""));
    if (/s$/.test(w) && w.length > 3) list.push(w.replace(/s$/, ""));
    if (/ing$/.test(w) && w.length > 5) {
      list.push(w.replace(/ing$/, ""), w.replace(/ing$/, "e"));
      var stem = w.replace(/ing$/, "");
      if (/([a-z])\1$/.test(stem)) list.push(stem.slice(0, -1)); // twirlling-style doubles
    }
    if (/ed$/.test(w) && w.length > 4) {
      list.push(w.replace(/ed$/, ""), w.replace(/ed$/, "e"));
      var stem2 = w.replace(/ed$/, "");
      if (/([a-z])\1$/.test(stem2)) list.push(stem2.slice(0, -1));
    }
    if (/ly$/.test(w) && w.length > 4) list.push(w.replace(/ly$/, ""));
    return list.filter(function (v, i) { return list.indexOf(v) === i; });
  }

  function lookupWord(raw) {
    var dict = window.RWM_DICTIONARY || {};
    var w = cleanWord(raw);
    if (!w) return null;
    var cands = wordCandidates(w);
    for (var i = 0; i < cands.length; i++) {
      if (dict[cands[i]]) return { word: cands[i], definition: dict[cands[i]] };
    }
    return null;
  }

  function pageFact(bookId, pageIndex) {
    var facts = window.RWM_PAGE_FACTS || {};
    return facts[bookId + ":" + pageIndex] || null;
  }

  /* ---------------- Layer 2: Chrome Prompt API (Gemini Nano) ---------------- */

  function nanoAPI() {
    if (typeof window.LanguageModel !== "undefined") return window.LanguageModel;
    if (window.ai && window.ai.languageModel) return window.ai.languageModel;
    return null;
  }

  var nanoState = { checked: false, status: "unknown", note: "" };

  function nanoOptions() {
    return {
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }]
    };
  }

  async function checkNano() {
    var api = nanoAPI();
    if (!api) {
      nanoState = { checked: true, status: "none",
        note: "This browser does not offer Chrome’s built-in AI (Prompt API). On-device answers come from the Book Brain instead." };
      return nanoState;
    }
    try {
      var avail = await api.availability(nanoOptions());
      // Chrome returns 'available' | 'downloadable' | 'downloading' | 'unavailable'
      var note;
      if (avail === "available") note = "Gemini Nano is ready on this device. Free-form questions can be answered on-device.";
      else if (avail === "downloadable") note = "Gemini Nano can be downloaded on this device (Chrome will ask the first time it is used).";
      else if (avail === "downloading") note = "Gemini Nano is downloading right now. It will answer on-device when it is ready.";
      else note = "Chrome offers the Prompt API here, but the on-device model is not available on this device.";
      nanoState = { checked: true, status: String(avail || "unavailable"), note: note };
    } catch (e) {
      nanoState = { checked: true, status: "error",
        note: "Chrome’s built-in AI could not be checked (" + (e && e.name ? e.name : "error") + "). The Book Brain still works." };
    }
    return nanoState;
  }

  async function nanoAsk(prompt) {
    var api = nanoAPI();
    if (!api) throw new Error("nano-unavailable");
    var st = nanoState.checked ? nanoState : await checkNano();
    if (st.status === "unavailable" || st.status === "none" || st.status === "error") {
      throw new Error("nano-unavailable");
    }
    var session = await api.create({
      initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
      expectedInputs: nanoOptions().expectedInputs,
      expectedOutputs: nanoOptions().expectedOutputs
    });
    try {
      var out = String(await session.prompt(prompt) || "").trim();
      // chrome-headless-shell (the automated-test browser) ships a stub
      // Prompt API that openly says the model is not available and just
      // echoes the input back. Never show a child that echo as an
      // "answer" — treat it as the layer being unavailable, so the
      // router falls through to the next layer (or the honest
      // offline card). Real Chrome with Gemini Nano never sends this.
      if (/^On-device model is not available/i.test(out)) throw new Error("nano-stub");
      return out;
    } finally {
      try { session.destroy(); } catch (e) { /* older builds */ }
    }
  }

  /* ---------------- Layer 3: Firebase AI Logic (hybrid) ---------------- */

  function firebaseConfig() {
    var cfg = window.RWM_FIREBASE_CONFIG;
    if (!cfg || typeof cfg !== "object") return null;
    if (!cfg.apiKey || !cfg.projectId || !cfg.appId) return null;
    if (/YOUR_|PLACEHOLDER|EXAMPLE/i.test(cfg.apiKey)) return null;
    return cfg;
  }

  var fb = { state: "idle", aiMod: null, ai: null, models: {}, error: null, deviceInitTried: false };

  async function ensureFirebase() {
    if (fb.state === "ready") return true;
    if (fb.state === "failed") throw fb.error;
    var cfg = firebaseConfig();
    if (!cfg) {
      fb.state = "failed";
      fb.error = new Error("cloud-not-configured");
      throw fb.error;
    }
    try {
      var appMod = await import(FB_BASE + "firebase-app.js");
      var aiMod = await import(FB_BASE + "firebase-ai.js");
      var app = appMod.initializeApp(cfg);
      // App Check MUST be initialized before any AI Logic call:
      // enforcement is on for this project and un-attested calls are
      // rejected (verified live: HTTP 401 "Firebase App Check token is
      // invalid"). Registered 2026-11-11 with the Fraud Defense /
      // reCAPTCHA Enterprise provider; the site key is public and
      // lives in firebase-config.js.
      // Local testing note: to run against localhost with a debug
      // token, register the token in the console (App Check → Apps →
      // Manage debug tokens) and set self.FIREBASE_APPCHECK_DEBUG_TOKEN
      // in the page BEFORE this script loads. Debug tokens are for
      // local development only and must never ship in production code,
      // which is why none is set here.
      if (cfg.appCheckSiteKey) {
        var acMod = await import(FB_BASE + "firebase-app-check.js");
        acMod.initializeAppCheck(app, {
          provider: new acMod.ReCaptchaEnterpriseProvider(cfg.appCheckSiteKey),
          isTokenAutoRefreshEnabled: true
        });
      }
      fb.aiMod = aiMod;
      fb.ai = aiMod.getAI(app, { backend: new aiMod.GoogleAIBackend() });
      fb.state = "ready";
      return true;
    } catch (e) {
      fb.state = "failed";
      fb.error = e;
      throw e;
    }
  }

  // Firebase AI Logic HYBRID mode: PREFER_ON_DEVICE makes the SDK try
  // Chrome's on-device Gemini Nano (Prompt API) first and fall back to
  // the cloud model named in inCloudParams. Every response reports
  // which side served it via response.inferenceSource.
  function hybridModel(cloudModelName) {
    if (!fb.models[cloudModelName]) {
      fb.models[cloudModelName] = fb.aiMod.getGenerativeModel(fb.ai, {
        mode: fb.aiMod.InferenceMode.PREFER_ON_DEVICE,
        inCloudParams: { model: cloudModelName },
        systemInstruction: SYSTEM_PROMPT
      });
    }
    return fb.models[cloudModelName];
  }

  async function hybridAsk(prompt) {
    if (!settings.cloudEnabled) throw new Error("cloud-disabled");
    await ensureFirebase();
    var cfg = firebaseConfig();
    var names = [cfg.cloudModel || "gemini-3.8-flash"];
    if (cfg.fallbackModel && cfg.fallbackModel !== names[0]) names.push(cfg.fallbackModel);
    var lastErr = null;
    for (var i = 0; i < names.length; i++) {
      var model = hybridModel(names[i]);
      // Docs: initializeDeviceModel() must be called after/on a user
      // interaction and before the first prompt when using on-device
      // inference. Big asks start from a click, so this is the moment.
      if (!fb.deviceInitTried && typeof model.initializeDeviceModel === "function") {
        fb.deviceInitTried = true;
        try { model.initializeDeviceModel(function () {}); } catch (e) { /* non-fatal */ }
      }
      try {
        var result = await model.generateContent(prompt);
        var text = String(result.response.text() || "").trim();
        var src = result.response.inferenceSource; // "on_device" | "in_cloud"
        // Same stub guard as Layer 2: the automated-test browser's
        // Prompt API stub "answers" by echoing the input while openly
        // saying the model is not available. The Firebase SDK counts
        // that echo as a successful on-device response in hybrid mode —
        // we do not. Treat it as a failure so the router falls through.
        // (Real Chrome with Gemini Nano never produces this text.)
        if (src === "on_device" && /^On-device model is not available/i.test(text)) {
          throw new Error("on-device model is a test stub in this browser, not a real model");
        }
        return { text: text, source: src === "on_device" ? "firebase-device" : "firebase-cloud" };
      } catch (e) {
        lastErr = e; // try the lightweight fallback model once, then give up
      }
    }
    throw lastErr;
  }

  function cloudNote() {
    var cfg = firebaseConfig();
    if (!cfg) return "Cloud is OFF — no Firebase config found (firebase-config.js). On-device answers still work.";
    if (!settings.cloudEnabled) return "Cloud is OFF — a grown-up turned it off in the Grown-ups panel.";
    if (fb.state === "failed" && fb.error && fb.error.message !== "cloud-not-configured") {
      return "Cloud could not start (" + (fb.error.name || "error") + "). On-device answers still work.";
    }
    return "Cloud is ON — Firebase AI Logic hybrid mode is ready for big asks (project: " + cfg.projectId + ").";
  }

  /* ---------------- prompt builders ---------------- */

  function ctxText(ctx) {
    return (ctx.pageText || "").slice(0, 900);
  }

  function wordPrompt(word, ctx) {
    return "A child reading the picture book \"" + ctx.bookTitle + "\" tapped the word \"" + word +
      "\". The page says: \"" + ctxText(ctx) + "\". " +
      "Explain what \"" + word + "\" means to a 6-year-old in at most 40 words. Use a friendly example.";
  }

  function freePrompt(question, ctx) {
    return "A child is reading the picture book \"" + ctx.bookTitle + "\" by Jeff Rivera. " +
      "This page says: \"" + ctxText(ctx) + "\". " +
      "The child asks: \"" + question + "\". Answer the child in at most 70 simple words.";
  }

  function endingPrompt(ctx) {
    return "Write a NEW, different, happy ending (at most 110 words, very simple words) for the picture book \"" +
      ctx.bookTitle + "\" by Jeff Rivera. The story so far, in the book's own words, begins: \"" +
      (ctx.storyText || "").slice(0, 900) + "\" and its real last page says: \"" +
      (ctx.lastPageText || "").slice(0, 400) + "\". Keep the same characters. Make the new ending sweet and a little bit silly.";
  }

  function realWorldPrompt(topic, ctx) {
    return "A child reading \"" + ctx.bookTitle + "\" asks about the real world: " + topic +
      " Answer with true, simple facts for a 6-year-old, at most 110 words. Be correct first, funny second.";
  }

  /* ---------------- public ask flows ---------------- */

  // Tap-a-word: local dictionary -> Nano -> Firebase hybrid -> honest fallback.
  async function askWord(rawWord, ctx) {
    var hit = lookupWord(rawWord);
    if (hit) return { text: hit.definition, source: "local", word: hit.word };
    var word = cleanWord(rawWord) || rawWord;
    try {
      var nanoText = await nanoAsk(wordPrompt(word, ctx));
      if (nanoText) return { text: trimToWords(nanoText, 45), source: "nano", word: word };
    } catch (e) { /* fall through */ }
    try {
      var hy = await hybridAsk(wordPrompt(word, ctx));
      if (hy.text) return { text: trimToWords(hy.text, 45), source: hy.source, word: word };
    } catch (e) { /* fall through */ }
    return {
      text: "Hmm, “" + word + "” is not in my Book Brain yet, and no other helper is awake right now. Try asking a grown-up — grown-ups love tricky words!",
      source: "offline", word: word
    };
  }

  // The page Why? button: the curated per-page fact always answers locally.
  function askPageWhy(bookId, pageIndex) {
    var fact = pageFact(bookId, pageIndex);
    if (fact) return { text: fact.a, source: "local", question: fact.q };
    return null;
  }

  // Free-form question: Nano -> Firebase hybrid -> friendly offline answer.
  async function askFree(question, ctx) {
    // A "what does X mean" question can often be served locally.
    var m = String(question).match(/what does ([a-z' -]+?) mean/i) ||
            String(question).match(/what is an? ([a-z' -]+?)\??$/i);
    if (m) {
      var hit = lookupWord(m[1]);
      if (hit) return { text: hit.definition, source: "local" };
    }
    try {
      var nanoText = await nanoAsk(freePrompt(question, ctx));
      if (nanoText) return { text: trimToWords(nanoText, 80), source: "nano" };
    } catch (e) { /* fall through */ }
    try {
      var hy = await hybridAsk(freePrompt(question, ctx));
      if (hy.text) return { text: trimToWords(hy.text, 80), source: hy.source };
    } catch (e) { /* fall through */ }
    return {
      text: "That is a great question, and I want to answer it properly! My Book Brain does not know that one, and my other helpers are asleep (no on-device model here, and the cloud is " +
        (!settings.cloudEnabled ? "turned off by a grown-up" : (firebaseConfig() ? "not answering right now" : "not set up")) + "). Ask a grown-up — or try tapping a word in the story instead!",
      source: "offline"
    };
  }

  // Big asks: Firebase AI Logic hybrid first; Nano as an on-device stand-in;
  // otherwise the honest cloud-off card the spec requires.
  async function bigAsk(kind, ctx) {
    var prompt = kind === "ending" ? endingPrompt(ctx) : realWorldPrompt(ctx.realTopic, ctx);
    var hyErr = null;
    try {
      var hy = await hybridAsk(prompt);
      if (hy.text) return { text: trimToWords(hy.text, 130), source: hy.source };
    } catch (e) {
      hyErr = e;
      if (e && e.message === "cloud-disabled") {
        return {
          text: "The cloud is turned OFF by a grown-up, and big asks need the cloud’s bigger storyteller brain. Word taps and Why? questions still work right here on this device!",
          source: "offline"
        };
      }
      // not configured / failed -> try Nano stand-in below
    }
    try {
      var nanoText = await nanoAsk(prompt);
      if (nanoText) return { text: trimToWords(nanoText, 130), source: "nano" };
    } catch (e) { /* fall through */ }
    // Honest end states — the wording depends on WHY the cloud did not answer:
    if (!firebaseConfig()) {
      // No config in this copy of the app at all (the state the original
      // spec describes): say exactly that.
      return {
        text: "Cloud is off — add Firebase config to wake up the big storyteller. (This is the honest cloud-off state: big asks like new endings travel to Firebase AI Logic, and this copy of the app has no firebase-config.js yet.) Everything else — reading, word taps, Why? questions — works right here on the device.",
        source: "offline"
      };
    }
    var errMsg = String((hyErr && (hyErr.message || hyErr)) || "");
    if (/app ?check/i.test(errMsg)) {
      // History, verified live 2026-11-11 against read-with-me-e7ca6:
      // before App Check was registered, firebasevertexai.googleapis.com
      // answered HTTP 401 "Firebase App Check token is invalid."
      // (UNAUTHENTICATED). App Check was registered later that day
      // (Fraud Defense / reCAPTCHA Enterprise) and this app initializes
      // it in ensureFirebase() before calling getAI. If this branch is
      // reached now, attestation itself was rejected (e.g. an
      // environment reCAPTCHA scores as a bot) — the honest card below
      // still applies.
      return {
        text: "The cloud storyteller is locked right now. Firebase answered: “App Check token is invalid” — this browser could not prove it is a real visitor, so the cloud would not answer. Everything on this device — reading, word taps, Why? questions — still works!",
        source: "offline"
      };
    }
    return {
      text: "The cloud storyteller could not be reached just now, so this big ask could not travel. Please try again in a little while! (For grown-ups, the error was: “" +
        errMsg.slice(0, 140) + "”.) Reading, word taps and Why? questions still work right here on the device.",
      source: "offline"
    };
  }

  /* ---------------- status for the UI ---------------- */

  async function getStatus() {
    var nano = await checkNano();
    return {
      nano: nano,
      cloud: {
        configured: !!firebaseConfig(),
        enabled: settings.cloudEnabled,
        state: fb.state,
        note: cloudNote()
      }
    };
  }

  window.RWM.AI = {
    askWord: askWord,
    askPageWhy: askPageWhy,
    askFree: askFree,
    bigAsk: bigAsk,
    getStatus: getStatus,
    lookupWord: lookupWord,
    setCloudEnabled: function (v) { settings.cloudEnabled = !!v; },
    cloudEnabled: function () { return settings.cloudEnabled; },
    firebaseConfigured: function () { return !!firebaseConfig(); },
    _internals: { cleanWord: cleanWord, wordCandidates: wordCandidates, trimToWords: trimToWords, hybridAsk: hybridAsk }
  };
})();
