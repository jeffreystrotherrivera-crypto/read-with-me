#!/usr/bin/env node
/* Headless test for Read With Me's 2026-11-11 additions:
   (1) the title page is a full book page (large cover art, big title
       card) whose words highlight along with its OWN Kokoro recording;
   (2) narration resume: pause/stop keeps the position, localStorage
       persists it across a reload, play resumes mid-page, a natural
       finish clears it, and positions never leak across pages.
   Uses the same puppeteer-core + chrome-headless-shell as
   tools/headless-test.js, against http://localhost:8901/. */
const puppeteer = require("/home/hatch/workspace/reader-site/tools/node_modules/puppeteer-core");

const BASE = "http://localhost:8901/";
const SHOTS = "/home/hatch/workspace/read-with-me/screenshots";
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + detail : ""));
  if (!ok) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.RWM_CHROME ||
      "/home/hatch/.cache/puppeteer/chrome-headless-shell/linux-157.0.8103.50/chrome-headless-shell-linux64/chrome-headless-shell",
    headless: true,
    protocolTimeout: 120000,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push("pageerror: " + e.message));

  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector(".book-card .read-btn:not([disabled])", { timeout: 10000 });

  /* ---------- title page: full-page presentation ---------- */
  await page.$$eval(".book-card .read-btn", (btns) => btns[0].click()); // Um Mommy
  await page.waitForSelector("#readerView:not([hidden])", { timeout: 5000 });
  await sleep(300);
  const titleLayout = await page.evaluate(() => {
    const box = document.getElementById("pageText");
    const title = box.querySelector(".cover-title");
    const art = document.getElementById("pageArt");
    const cs = getComputedStyle(title);
    return {
      boxHasTitleClass: box.classList.contains("title-page"),
      titleWords: title ? title.querySelectorAll(".w").length : -1,
      totalWords: box.querySelectorAll(".w").length,
      titleFontPx: parseFloat(cs.fontSize),
      boxHeight: box.getBoundingClientRect().height,
      artHeight: art.getBoundingClientRect().height,
      artWrapCover: document.querySelector(".page-art-wrap").classList.contains("cover-art")
    };
  });
  report("title page uses the title-page layout", titleLayout.boxHasTitleClass && titleLayout.artWrapCover,
    JSON.stringify(titleLayout));
  report("title text is tappable word spans (20 for Um Mommy)", titleLayout.totalWords === 20,
    "words=" + titleLayout.totalWords);
  report("title set big (>=30px at 420px wide)", titleLayout.titleFontPx >= 30, titleLayout.titleFontPx + "px");
  report("title card is a full page, not a strip (height >= 300px)", titleLayout.boxHeight >= 300,
    Math.round(titleLayout.boxHeight) + "px");
  report("cover art shown large (height >= 250px)", titleLayout.artHeight >= 250,
    Math.round(titleLayout.artHeight) + "px");
  await page.screenshot({ path: SHOTS + "/10-title-page.png", fullPage: true });

  /* ---------- title page: recorded narration + highlighting ---------- */
  await page.evaluate(() => document.getElementById("listenBtn").click());
  await page.waitForFunction(() => {
    const p = window.RWM && window.RWM._player;
    return p && /page-00\.mp3$/.test(p.src || "");
  }, { timeout: 8000 });
  report("title page plays its own recording (page-00.mp3)", true);

  // Can this headless build actually advance MP3 playback?
  const playMode = await page.evaluate(async () => {
    const p = window.RWM._player;
    const t0 = p.currentTime;
    await new Promise((r) => setTimeout(r, 2500));
    return { advanced: p.currentTime > t0 + 0.5, t: p.currentTime };
  });
  console.log("INFO | headless playback " + (playMode.advanced ? "advances in real time" : "does NOT advance; using seek-driven checks") + " | t=" + playMode.t.toFixed(2));

  async function highlightedIndex() {
    return page.evaluate(() => {
      const els = [...document.querySelectorAll("#pageText .w")];
      return els.findIndex((n) => n.classList.contains("reading-now"));
    });
  }
  let hl1 = -1;
  for (let i = 0; i < 12 && hl1 < 0; i++) { hl1 = await highlightedIndex(); if (hl1 < 0) await sleep(500); }
  if (!playMode.advanced) {
    // Seek-driven: jump into the middle; a timeupdate must move the
    // highlight to the word that owns that moment.
    await page.evaluate(() => { window.RWM._player.currentTime = 4.5; });
    await sleep(600);
    hl1 = await highlightedIndex();
  }
  report("a word is highlighted during title narration", hl1 >= 0, "index=" + hl1);
  const hl1Time = await page.evaluate(() => window.RWM._player.currentTime);
  await sleep(playMode.advanced ? 1800 : 100);
  if (!playMode.advanced) {
    await page.evaluate(() => { window.RWM._player.currentTime = 7.5; });
    await sleep(600);
  }
  const hl2 = await highlightedIndex();
  report("highlight advances with the narration", hl2 > hl1, hl1 + " -> " + hl2 + " (t=" + hl1Time.toFixed(1) + "s)");
  await page.screenshot({ path: SHOTS + "/11-title-highlight.png", fullPage: true });
  await page.evaluate(() => document.getElementById("listenBtn").click()); // stop
  await sleep(200);

  /* ---------- resume on a long story page ---------- */
  await page.evaluate(() => document.getElementById("nextBtn").click()); // story page 1 (104.8s)
  await sleep(300);
  await page.evaluate(() => document.getElementById("listenBtn").click());
  await page.waitForFunction(() => {
    const p = window.RWM && window.RWM._player;
    return p && /um-mommy\/audio\/page-01\.mp3$/.test(p.src || "");
  }, { timeout: 8000 });
  if (playMode.advanced) {
    await page.waitForFunction(() => window.RWM._player.currentTime >= 6, { timeout: 12000 });
  } else {
    await page.evaluate(() => { window.RWM._player.currentTime = 30; });
    await sleep(400);
  }
  const tBeforeStop = await page.evaluate(() => window.RWM._player.currentTime);
  await page.evaluate(() => document.getElementById("listenBtn").click()); // stop
  await sleep(300);
  const saved1 = await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem("rwm-audio-positions-v1") || "{}");
    const k = Object.keys(all).find((x) => /um-mommy\/audio\/page-01\.mp3$/.test(x));
    return k ? all[k] : null;
  });
  report("stopping saves the position", saved1 !== null && Math.abs(saved1 - tBeforeStop) <= 1.5,
    "played to " + tBeforeStop.toFixed(1) + "s, saved " + saved1);

  await page.evaluate(() => document.getElementById("listenBtn").click()); // play again
  await sleep(1600);
  const tResumed = await page.evaluate(() => window.RWM._player.currentTime);
  report("play again resumes where it stopped (not from 0)",
    tResumed >= saved1 - 1.2, "resumed at " + tResumed.toFixed(1) + "s vs saved " + saved1);
  const hlResume = await highlightedIndex();
  report("highlight follows the resumed position", hlResume > 10, "word index=" + hlResume);
  await page.evaluate(() => document.getElementById("listenBtn").click()); // stop again
  await sleep(300);

  /* ---------- persistence across a full reload ---------- */
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".book-card .read-btn:not([disabled])", { timeout: 10000 });
  await page.$$eval(".book-card .read-btn", (btns) => btns[0].click());
  await page.waitForSelector("#readerView:not([hidden])", { timeout: 5000 });
  await page.evaluate(() => document.getElementById("nextBtn").click());
  await sleep(300);
  await page.evaluate(() => document.getElementById("listenBtn").click());
  await sleep(1600);
  const tAfterReload = await page.evaluate(() => window.RWM._player.currentTime);
  report("after leaving and returning, play resumes at the saved spot",
    tAfterReload >= saved1 - 1.5, "at " + tAfterReload.toFixed(1) + "s vs saved " + saved1);
  await page.evaluate(() => document.getElementById("listenBtn").click());
  await sleep(200);

  /* ---------- positions do not leak across pages ---------- */
  await page.evaluate(() => document.getElementById("nextBtn").click()); // page 2 (1.5s clip)
  await sleep(300);
  await page.evaluate(() => document.getElementById("listenBtn").click());
  await sleep(700);
  const tPage2 = await page.evaluate(() => window.RWM._player.currentTime);
  report("a different page starts from its own beginning", tPage2 < 1.4, "page 2 at " + tPage2.toFixed(2) + "s");

  /* ---------- natural finish clears the saved position ---------- */
  // Use a long page (Um Mommy page 5, 19.4s) so nothing races the
  // end of the clip: play it a few seconds, stop — the app saves
  // the position. Play again (resumes mid-track), run it out to a
  // natural finish, and the saved position must be gone.
  await page.evaluate(() => document.getElementById("listenBtn").click()); // stop page 2 if playing
  await sleep(200);
  for (let i = 0; i < 3; i++) { await page.evaluate(() => document.getElementById("nextBtn").click()); await sleep(150); }
  await page.evaluate(() => document.getElementById("listenBtn").click()); // play page 5
  await page.waitForFunction(() => {
    const p = window.RWM._player;
    return p && !p.paused && /um-mommy\/audio\/page-05\.mp3$/.test(p.src || "");
  }, { timeout: 8000 });
  // Play in real time to ~3s, then stop: the app saves the position
  // (the same pattern page 1 proved above). No synthetic seeks here:
  // this headless build drops a seek issued while the plain-HTTP
  // test server is still streaming the file.
  await page.waitForFunction(() => window.RWM._player.currentTime >= 3, { timeout: 12000 });
  await page.evaluate(() => document.getElementById("listenBtn").click()); // stop -> saves ~3
  await sleep(300);
  const seeded = await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem("rwm-audio-positions-v1") || "{}");
    const k = Object.keys(all).find((x) => /um-mommy\/audio\/page-05\.mp3$/.test(x));
    return k ? all[k] : null;
  });
  report("mid-track stop saved the position", seeded !== null && seeded > 2.4 && seeded < 4.6,
    "saved=" + seeded);
  await page.evaluate(() => document.getElementById("listenBtn").click()); // play: resumes ~3
  await sleep(1200);
  const tResumed5 = await page.evaluate(() => window.RWM._player.currentTime);
  report("play resumes mid-track on this page too", tResumed5 >= seeded + 0.5,
    "at " + tResumed5.toFixed(1) + "s vs saved " + seeded);
  // Run the track out: once the file is fully buffered, a seek to
  // the last moment is reliable even in this build; retry once if
  // the seek was dropped.
  await page.waitForFunction(() => {
    const p = window.RWM._player;
    return p.buffered && p.buffered.length && p.buffered.end(0) >= p.duration - 0.1;
  }, { timeout: 15000 });
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate(() => {
      const p = window.RWM._player;
      if (p.paused) p.play().catch(() => {});
      p.currentTime = p.duration - 0.8;
    });
    await sleep(700);
    const tSeek = await page.evaluate(() => window.RWM._player.currentTime);
    if (tSeek > 15 || await page.evaluate(() => window.RWM._player.ended)) break;
  }
  let cleared = false;
  for (let i = 0; i < 20 && !cleared; i++) {
    await sleep(400);
    cleared = await page.evaluate(() => {
      const all = JSON.parse(localStorage.getItem("rwm-audio-positions-v1") || "{}");
      return !Object.keys(all).some((x) => /um-mommy\/audio\/page-05\.mp3$/.test(x));
    });
  }
  const endedNaturally = await page.evaluate(() => window.RWM._player.ended);
  report("finishing a track clears its saved position", cleared === true && endedNaturally,
    "ended=" + endedNaturally);

  const realErrors = pageErrors.filter((e) => !/favicon/.test(e));
  report("no page errors during resume/title tests", realErrors.length === 0, realErrors.slice(0, 3).join(" ;; "));

  await browser.close();
  console.log(failures === 0 ? "ALL TESTS PASSED" : failures + " TEST(S) FAILED");
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(2); });
