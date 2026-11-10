/* Read With Me — app UI: library, picture-book reader, read-aloud,
   tap-a-word, Why? button, free-form questions, big asks, answer cards
   with source badges, in-memory question history, grown-ups panel.
   No accounts, no analytics, nothing persisted: all state (including
   the question history and the parent cloud toggle) lives in memory
   only and dies with the page. */
(function () {
  "use strict";
  var AI = window.RWM.AI;

  var BOOKS = [
    {
      id: "um-mommy",
      dir: "books/um-mommy/",
      blurb: "Falisha Whiskers has a problem — a brother-sized, toilet-shaped problem. Book 1 of the Um Mommy series.",
      realTopic: "Tell me about real toilets and plumbing",
      realPrompt: "How do real toilets and plumbing work? Where does the water go when you flush?"
    },
    {
      id: "stinky",
      dir: "books/stinky/",
      blurb: "Venie’s baby brother Stevie is cute, curly-haired — and very, very stinky. Dedicated to the author’s nephew, Job.",
      realTopic: "Tell me about real babies and diapers",
      realPrompt: "Tell me about real babies: why do babies wear diapers, and how do grown-ups change them?"
    }
  ];

  var state = {
    book: null,        // loaded book.json data (+ meta from BOOKS)
    page: -1,          // -1 = cover page, 0..n-1 = story pages
    speaking: false,
    speakMode: null,   // "audio" (recorded narration) | "synth" (fallback)
    aloud: false,      // read-aloud mode: stays on across page turns
    history: []        // [{question, text, source}] — memory only, never saved
  };

  /* ---------------- DOM helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var BADGES = {
    "local":          { cls: "b-local", label: "📱 ON-DEVICE · Book Brain" },
    "nano":           { cls: "b-nano",  label: "📱 ON-DEVICE · Gemini Nano" },
    "firebase-device":{ cls: "b-fbdev", label: "📱 ON-DEVICE · Firebase AI Logic" },
    "firebase-cloud": { cls: "b-cloud", label: "☁️ CLOUD · Firebase AI Logic" },
    "offline":        { cls: "b-off",   label: "📱 ON-DEVICE · Book Brain (offline answer)" }
  };

  /* ------------- read-aloud: recorded Kokoro narration first -------------
     Every story page ships with narration pre-recorded with the Kokoro
     voice (books/<id>/audio/page-NN.mp3, made by tools/generate_audio.py),
     and the player below plays that file. The browser's built-in speech
     synthesis is only a fallback: for the cover (no recording), for a
     page with no recording, or if a recording fails to load. */
  var player = null;
  function getPlayer() {
    if (!player) {
      player = new Audio();
      player.preload = "auto";
      player.addEventListener("ended", function () {
        if (state.speakMode === "audio") stopSpeaking();
      });
      player.addEventListener("error", function () {
        if (state.speakMode === "audio" && state.speaking) {
          state.speakMode = null; // recording would not load — fall back
          speakText(currentReadText());
        }
      });
      player.addEventListener("timeupdate", updateWordHighlight);
      player.addEventListener("pause", clearWordHighlight);
      player.addEventListener("ended", clearWordHighlight);
    }
    return player;
  }
  function setSpeaking(mode) {
    state.speaking = true;
    state.speakMode = mode;
    $("listenBtn").classList.add("speaking");
    $("listenBtn").textContent = "⏹ Stop reading";
  }
  function setNotSpeaking() {
    state.speaking = false;
    state.speakMode = null;
    $("listenBtn").classList.remove("speaking");
    $("listenBtn").textContent = "🔊 Read to me";
  }
  function haltPlayback() { // stop sound, keep the read-aloud mode flag
    if (player) { try { player.pause(); } catch (e) { /* noop */ } }
    if (typeof clearWordHighlight === "function") clearWordHighlight();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setNotSpeaking();
  }
  function stopSpeaking() { // full stop: sound off AND read-aloud mode off
    state.aloud = false;
    haltPlayback();
  }
  function currentAudioSrc() {
    if (!state.book || state.page < 0) return null;
    var p = state.book.pages[state.page];
    return p && p.audio ? state.book._meta.dir + p.audio : null;
  }

  /* ---- read-along word highlighting ---------------------------------
     Each recording has a timing file (audio/page-NN.timing.json, built
     by tools/make_timings.py from the real speech spans in the MP3).
     While the recording plays, the word being spoken gets .reading-now. */
  var timingCache = {};   // src -> {words:[[start,end],...]} | "loading" | null
  var timingSrc = null;   // src the loaded timings belong to
  var hlIdx = -1;
  function loadTimings(src) {
    timingSrc = src;
    hlIdx = -1;
    if (timingCache[src] !== undefined) return;
    timingCache[src] = "loading";
    fetch(src.replace(/\.mp3$/, ".timing.json"))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { timingCache[src] = d; })
      .catch(function () { timingCache[src] = null; });
  }
  function clearWordHighlight() {
    if (hlIdx >= 0) {
      var els = document.querySelectorAll("#pageText .w.reading-now");
      for (var i = 0; i < els.length; i++) els[i].classList.remove("reading-now");
    }
    hlIdx = -1;
  }
  function updateWordHighlight() {
    if (!player || state.speakMode !== "audio") return;
    var d = timingCache[timingSrc];
    if (!d || d === "loading" || !d.words) return;
    var t = player.currentTime;
    var words = d.words;
    var idx = -1;
    for (var i = 0; i < words.length; i++) {
      if (t >= words[i][0]) idx = i; else break;
    }
    if (idx === hlIdx) return;
    clearWordHighlight();
    hlIdx = idx;
    if (idx < 0) return;
    var els = document.querySelectorAll("#pageText .w");
    if (els[idx]) {
      els[idx].classList.add("reading-now");
      hlIdx = idx;
    }
  }
  function currentReadText() {
    if (!state.book) return "";
    return state.page < 0
      ? state.book.title + ". By " + state.book.author + "."
      : currentPageText();
  }
  function startReading() {
    haltPlayback();
    var src = currentAudioSrc();
    if (src) {
      var pl = getPlayer();
      loadTimings(src);
      pl.src = src;
      setSpeaking("audio");
      var pr = pl.play();
      if (pr && pr.catch) pr.catch(function () {
        if (state.speakMode === "audio") { state.speakMode = null; speakText(currentReadText()); }
      });
      return true;
    }
    if (!currentReadText().trim()) return true; // picture page: nothing to read
    return speakText(currentReadText());
  }
  function pickVoice() {
    var voices = window.speechSynthesis.getVoices();
    var enUS = voices.filter(function (v) { return /^en[-_]US/i.test(v.lang); });
    return enUS.filter(function (v) { return /google us english/i.test(v.name); })[0]
        || enUS.filter(function (v) { return /natural|neural/i.test(v.name); })[0]
        || enUS[0]
        || voices.filter(function (v) { return /^en/i.test(v.lang); })[0]
        || null;
  }
  function speakText(text) {
    if (!text || !text.trim()) { setNotSpeaking(); return false; }
    if (!("speechSynthesis" in window)) { setNotSpeaking(); return false; }
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.pitch = 1.05;
    var v = pickVoice();
    if (v) u.voice = v;
    u.onend = u.onerror = function () { if (state.speakMode === "synth") setNotSpeaking(); };
    setSpeaking("synth");
    window.speechSynthesis.speak(u);
    return true;
  }

  /* ---------------- library ---------------- */
  async function loadBookIndex() {
    var wrap = $("bookCards");
    wrap.textContent = "";
    for (var i = 0; i < BOOKS.length; i++) {
      (function (meta) {
        var card = el("article", "book-card");
        var img = el("img");
        img.src = meta.dir + "cover.jpg";
        img.alt = "Cover of " + meta.id;
        img.loading = "lazy";
        card.appendChild(img);
        var h = el("h2", null, "Loading…");
        card.appendChild(h);
        card.appendChild(el("p", "by", "by Jeff Rivera"));
        card.appendChild(el("p", "blurb", meta.blurb));
        var meta2 = el("p", "meta", "");
        card.appendChild(meta2);
        var btn = el("button", "read-btn", "📖 Read this book");
        btn.disabled = true;
        card.appendChild(btn);
        wrap.appendChild(card);
        fetch(meta.dir + "book.json")
          .then(function (r) { return r.json(); })
          .then(function (data) {
            data._meta = meta;
            meta._data = data;
            h.textContent = data.title;
            img.alt = "Cover of " + data.title;
            meta2.textContent = data.subtitle + " · " + data.pages.length + " story pages · tap words, ask why!";
            btn.disabled = false;
            btn.addEventListener("click", function () { openBook(meta); });
          })
          .catch(function () {
            h.textContent = "This book could not load";
            meta2.textContent = "Serve the app over http(s) — book files cannot load from file://.";
          });
      })(BOOKS[i]);
    }
    refreshStatusLines();
  }

  /* ---------------- reader ---------------- */
  function openBook(meta) {
    state.book = meta._data;
    state.page = -1;
    stopSpeaking();
    $("libraryView").hidden = true;
    $("readerView").hidden = false;
    $("readerTitle").textContent = state.book.title;
    $("realBtnLabel").textContent = state.book._meta.realTopic;
    clearAnswers();
    renderPage();
    window.scrollTo({ top: 0 });
  }

  function closeBook() {
    stopSpeaking();
    state.book = null;
    $("readerView").hidden = true;
    $("libraryView").hidden = false;
  }

  function pageCount() { return state.book.pages.length + 1; } // + cover

  function currentPageText() {
    if (!state.book || state.page < 0) return state.book ? state.book.title : "";
    return state.book.pages[state.page].paras.join(" ");
  }

  function storyText() {
    return state.book.pages.map(function (p) { return p.paras.join(" "); }).join(" ");
  }

  function renderPage() {
    var book = state.book;
    var total = pageCount();
    $("pageCount").textContent = state.page < 0
      ? "Cover · " + total + " pages"
      : "Page " + (state.page + 2) + " of " + total;

    var art = $("pageArt");
    var praise = $("praiseBox");
    praise.hidden = true;
    praise.textContent = "";

    if (state.page < 0) {
      art.src = book._meta.dir + book.cover;
      art.alt = "Cover of " + book.title;
      $("pageText").innerHTML = "";
      var t = el("p", null, "");
      var b = el("strong", null, book.title);
      t.appendChild(b);
      $("pageText").appendChild(t);
      $("pageText").appendChild(el("p", null, "by " + book.author + " · " + book.subtitle));
      $("pageText").appendChild(el("p", "empty-note", "Tap “Next” to start the story — and remember, you can tap any word to learn what it means!"));
      if (book.praise && book.praise.length) {
        praise.hidden = false;
        praise.appendChild(el("p", null, "⭐ Grown-ups say nice things about this book:"));
        book.praise.forEach(function (line) { praise.appendChild(el("p", null, line)); });
      }
    } else {
      var page = book.pages[state.page];
      if (page.img) {
        art.src = book._meta.dir + page.img;
        art.alt = "Story picture for page " + (state.page + 1);
        art.parentElement.style.display = "";
      } else {
        art.removeAttribute("src");
        art.alt = "";
        art.parentElement.style.display = "none";
      }
      var box = $("pageText");
      box.innerHTML = "";
      if (!page.paras.length) {
        box.appendChild(el("p", "empty-note", "🖼️ A picture page! Look closely… what do you see? Tap Next when you are ready."));
      }
      page.paras.forEach(function (para) { box.appendChild(renderParagraph(para)); });
    }

    $("prevBtn").disabled = state.page < 0;
    $("nextBtn").textContent = state.page >= book.pages.length - 1 ? "🎉 The End!" : "Next →";
    var dots = $("pageDots");
    dots.innerHTML = "";
    for (var i = 0; i < total; i++) {
      var d = el("span");
      if (i === state.page + 1) d.className = "on";
      dots.appendChild(d);
    }
  }

  // Wrap every word in a tappable button, keeping punctuation outside the lookup.
  function renderParagraph(text) {
    var p = el("p");
    var parts = String(text).split(/(\s+)/);
    parts.forEach(function (part) {
      if (!part) return;
      if (/^\s+$/.test(part)) { p.appendChild(document.createTextNode(" ")); return; }
      var m = part.match(/^([^A-Za-z']*)([A-Za-z][A-Za-z'’\-]*)([^A-Za-z']*)$/);
      if (!m) { p.appendChild(document.createTextNode(part)); return; }
      if (m[1]) p.appendChild(document.createTextNode(m[1]));
      var btn = el("button", "w", m[2]);
      btn.type = "button";
      btn.setAttribute("aria-label", "What does “" + m[2] + "” mean?");
      btn.addEventListener("click", function () { onWordTap(m[2]); });
      p.appendChild(btn);
      if (m[3]) p.appendChild(document.createTextNode(m[3]));
    });
    return p;
  }

  function go(delta) {
    var total = pageCount();
    var next = state.page + delta;
    if (next < -1 || next > total - 2) {
      if (delta > 0 && state.page === total - 2) { /* already at end */ }
      return;
    }
    haltPlayback(); // stops the old page's sound; read-aloud mode survives
    state.page = next;
    renderPage();
    if (state.aloud) startReading(); // read the new page too
  }

  /* ---------------- answers ---------------- */
  function makeCard(question, badgeSource, initialText, thinking) {
    var card = el("article", "answer-card" + (thinking ? " thinking" : ""));
    var badge = BADGES[badgeSource] || BADGES.offline;
    var b = el("span", "badge " + badge.cls, badge.label);
    card.appendChild(b);
    if (question) card.appendChild(el("p", "q", question));
    var a = el("p", "a" + (thinking ? " dots-anim" : ""), initialText);
    card.appendChild(a);
    return { card: card, answerEl: a };
  }

  function showAnswer(question, result) {
    var area = $("answerArea");
    area.innerHTML = "";
    var made = makeCard(question, result.source, result.text, false);
    area.appendChild(made.card);
    made.card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    state.history.unshift({ question: question, text: result.text, source: result.source });
    renderHistory();
  }

  function showThinking(question) {
    var area = $("answerArea");
    area.innerHTML = "";
    var made = makeCard(question, "offline", "Thinking", true);
    made.card.querySelector(".badge").textContent = "🤔 Thinking…";
    area.appendChild(made.card);
    return made;
  }

  function renderHistory() {
    var box = $("historyBox");
    var list = $("historyList");
    list.innerHTML = "";
    box.hidden = state.history.length === 0;
    // history panel shows everything except the newest (already shown big)
    state.history.slice(1).forEach(function (h) {
      var made = makeCard(h.question, h.source, h.text, false);
      list.appendChild(made.card);
    });
    if (state.history.length === 1) box.hidden = false; // show header w/ clear even for one
  }

  function clearAnswers() {
    $("answerArea").innerHTML = "";
    state.history = [];
    renderHistory();
  }

  function clearHistory() {
    state.history = [];
    $("answerArea").innerHTML = "";
    renderHistory();
  }

  function ctx() {
    return {
      bookTitle: state.book.title,
      pageText: currentPageText(),
      storyText: storyText(),
      lastPageText: state.book.pages.length
        ? state.book.pages[state.book.pages.length - 1].paras.join(" ") : "",
      realTopic: state.book._meta.realPrompt
    };
  }

  async function onWordTap(word) {
    stopSpeaking();
    var thinking = showThinking("What does “" + word + "” mean?");
    try {
      var res = await AI.askWord(word, ctx());
      showAnswer("What does “" + (res.word || word) + "” mean?", res);
    } catch (e) {
      showAnswer("What does “" + word + "” mean?", { text: "My Book Brain hiccuped! Try that word again.", source: "offline" });
    }
    void thinking;
  }

  function onWhy() {
    stopSpeaking();
    if (state.page < 0) {
      showAnswer("Why this book?", {
        text: "This is “" + state.book.title + "” by Jeff Rivera. Tap Next to start reading — then the Why? button will tell you a secret about every page!",
        source: "local"
      });
      return;
    }
    var fact = AI.askPageWhy(state.book._meta.id, state.page);
    if (fact) showAnswer(fact.question, fact);
    else showAnswer("Why?", { text: "This page is just for looking! Turn the page and ask me why there.", source: "local" });
  }

  async function onBigAsk(kind) {
    stopSpeaking();
    var label = kind === "ending" ? "✨ Make me a new ending!" : "🌍 " + state.book._meta.realTopic;
    showThinking(label);
    try {
      var res = await AI.bigAsk(kind, ctx());
      showAnswer(label, res);
    } catch (e) {
      showAnswer(label, { text: "The big storyteller could not be reached. Word taps and Why? questions still work on this device!", source: "offline" });
    }
  }

  async function onFreeAsk(question) {
    stopSpeaking();
    showThinking("You asked: “" + question + "”");
    try {
      var res = await AI.askFree(question, ctx());
      showAnswer("You asked: “" + question + "”", res);
    } catch (e) {
      showAnswer("You asked: “" + question + "”", { text: "My brain hiccuped! Ask me again.", source: "offline" });
    }
  }

  /* ---------------- grown-ups panel / status ---------------- */
  async function refreshStatusLines() {
    var st = await AI.getStatus();
    $("libraryAiStatus").textContent =
      "🤖 AI helpers on this device: " + st.nano.note + " " + st.cloud.note;
    $("nanoStatusNote").textContent = st.nano.note + " (status: " + st.nano.status + ")";
    $("cloudStatusNote").textContent = st.cloud.note;
    var toggle = $("cloudToggle");
    toggle.checked = AI.cloudEnabled() && st.cloud.configured;
    toggle.disabled = !st.cloud.configured;
    if (!st.cloud.configured) toggle.checked = false;
  }

  /* ---------------- events ---------------- */
  function init() {
    $("brandBtn").addEventListener("click", closeBook);
    $("backBtn").addEventListener("click", closeBook);
    $("prevBtn").addEventListener("click", function () { go(-1); });
    $("nextBtn").addEventListener("click", function () { go(1); });
    $("zonePrev").addEventListener("click", function () { go(-1); });
    $("zoneNext").addEventListener("click", function () { go(1); });
    document.addEventListener("keydown", function (e) {
      if ($("readerView").hidden) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    });
    var touchX = null;
    var stage = document.querySelector(".page-art-wrap");
    stage.addEventListener("touchstart", function (e) { touchX = e.changedTouches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      if (touchX == null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
      touchX = null;
    }, { passive: true });

    $("listenBtn").addEventListener("click", function () {
      if (state.speaking || state.aloud) { stopSpeaking(); return; }
      state.aloud = true;
      if (!startReading()) {
        state.aloud = false;
        showAnswer("🔊 Read to me", { text: "This page has no recorded narration, and this browser does not have a reading voice built in — but a grown-up reading out loud is even better!", source: "local" });
      }
    });
    if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = function () {};

    $("whyBtn").addEventListener("click", onWhy);
    $("endingBtn").addEventListener("click", function () { onBigAsk("ending"); });
    $("realBtn").addEventListener("click", function () { onBigAsk("real"); });
    $("askForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = $("askInput").value.trim();
      if (!q) return;
      $("askInput").value = "";
      onFreeAsk(q);
    });

    $("clearHistoryBtn").addEventListener("click", clearHistory);
    $("clearHistoryBtn2").addEventListener("click", clearHistory);

    $("cloudToggle").addEventListener("change", function (e) {
      AI.setCloudEnabled(e.target.checked);
      refreshStatusLines();
    });

    $("howBtn").addEventListener("click", function () { $("howModal").hidden = false; });
    $("parentBtn").addEventListener("click", function () {
      $("parentModal").hidden = false;
      refreshStatusLines();
    });
    document.querySelectorAll("[data-close]").forEach(function (n) {
      n.addEventListener("click", function () {
        $("howModal").hidden = true;
        $("parentModal").hidden = true;
      });
    });
    document.querySelectorAll(".modal-backdrop").forEach(function (bd) {
      bd.addEventListener("click", function (e) { if (e.target === bd) bd.hidden = true; });
    });

    loadBookIndex();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
