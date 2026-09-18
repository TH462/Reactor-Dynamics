/*
 * verify_flags_ui.js — what the feature flags actually DO to the shipped UI (#241).
 *
 * run_flags.js proves the registry is complete and the resolver answers correctly.
 * Neither says the control room OBEYS it — and every defect found while building
 * this was on that side of the line: a Features row that stayed on screen because
 * `.set-row { display: flex }` beats the `hidden` attribute (the DOM property read
 * back true the whole time), and a second entry point to checklists in the
 * instructor card that the first pass never gated.
 *
 * So this drives the real page. It asserts VISIBILITY, not element properties —
 * "the button is not on screen" is the claim that matters, and it is the one the
 * property check got wrong.
 *
 * Three builds are exercised:
 *   dev      — the repo as it stands: everything offered, Features panel present
 *   public   — RD_CHANNEL pinned to 'public', i.e. exactly what `main` deploys
 *   override — the same public build with ?flags= / the panel, the routes the
 *              owner uses to inspect a gated feature on the live site
 *
 * Run: node test/verify_flags_ui.js
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
/* ?engine=pwr — THE RETIRED ENGINE, DELIBERATELY, and it is the subject of this gate rather
 * than an oversight. What is under test is whether the control room OBEYS site/flags.js, and
 * every flag in that registry gates CONTENT: 26 scenarios, 18 procedures, the campaign, the
 * checklists. All of it is authored against the retired engine, which is why ui/app.js gives
 * ENGINES.pwr2 `freePlayOnly: true` — on the shipped plant those tabs answer with the
 * Free-Play-only note BEFORE any flag is consulted, so a run there would score the flags
 * green or red on a panel that never asked them.
 *
 * Measured 2026-08-26, when PWR2 became the default: 27/42, and all 15 failures were that
 * one substitution — including three "public: says COMING SOON" rows, which is the shape a
 * flag gate CANNOT be allowed to pass by accident.
 *
 * This moves to pwr2 when the scenario-compatibility pass lifts freePlayOnly, and not before.
 * The engine still loads from the repo tree; only PUBLISHED builds drop it. */
var SHELL = 'file:///' + path.join(ROOT, 'ui', 'shell.html').replace(/\\/g, '/') + '?engine=pwr&mmode=free';
// `&mmode=` is the dev/screenshot door that keeps the Campaign and Scenarios tabs drawn (#660 item 19
// removed them from the player's window); this gate probes those areas through it.
var LANDING = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

var pass = 0, fail = 0;
var C = { red: '[31m', green: '[32m', dim: '[2m', bold: '[1m', off: '[0m' };
function ck(name, ok, detail) {
  ok ? pass++ : fail++;
  console.log((ok ? C.green + 'PASS' : C.red + 'FAIL') + C.off + '  ' + name +
    (ok || detail == null ? '' : C.dim + '   -> ' + detail + C.off));
}

// Pin RD_CHANNEL before site/channel.js loads: a non-writable property makes the
// stamp file's plain assignment a silent no-op, which is how a production build
// is reproduced without editing a tracked file.
function pinChannel(ch) {
  return 'Object.defineProperty(window, "RD_CHANNEL", { value: ' + JSON.stringify(ch) +
    ', writable: false, configurable: false });';
}

(async function () {
  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });

  // The first-run hook is a modal that eats clicks. Hide it (rather than pressing
  // Skip, which would persist hook_done) once its own assertion is made.
  /* Settings is a MODAL since #439, and the Features row lives inside it. Everything
   * below that asks "is Features offered on this channel?" must therefore open Settings
   * first — otherwise `isVisible('#featureRow')` is false because the modal is shut, and
   * the check passes its public half for the wrong reason while its dev half fails. That
   * is the vacuous-guard failure this very file's comments record twice already; a
   * visibility probe that cannot tell "gated off" from "not on screen" is not measuring
   * the flag any more. */
  async function openSettings(page) {
    if (await page.isVisible('#settingsOverlay')) return;
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsOverlay', { state: 'visible' });
  }
  async function closeSettings(page) {
    if (await page.isVisible('#settingsOverlay')) await page.click('#settingsClose');
  }
  // #missionBtn is gone with the Operate tab (#439), and the .sim-status bar that replaced it
  // is gone too (#689). #mainMenuBtn — "Main Menu", beside Settings — is the shipped entry
  // point to this window now, so this is the path a player takes, not a test-only door.
  async function openMission(page, tab) {
    var open = await page.evaluate(function () { return !document.getElementById('missionOverlay').hidden; });
    if (!open) await page.click('#mainMenuBtn');
    await page.click('[data-mmode="' + tab + '"]');
    return (await page.textContent('#mpContent')) || '';
  }
  async function build(channel, url) {
    var ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (channel) await ctx.addInitScript(pinChannel(channel));
    var page = await ctx.newPage();
    await page.goto(url || SHELL);
    await page.waitForSelector('#mainMenuBtn');
    // CLOSE THE PLANT & MISSION WINDOW, which is up on load since 2026-08-11. It covers the
    // board and intercepts every click this file then makes. (It replaced the selection
    // screen that used to be dismissed here; that overlay no longer exists.)
    //
    // Dismissed the way a PLAYER dismisses it rather than by adding a deep-link param to
    // the URL — a deep link would work and would mean this file tests a boot path no
    // visitor takes, which is the shape HR10 warns about.
    if (await page.isVisible('#missionOverlay')) await page.click('#missionClose');
    return { ctx: ctx, page: page };
  }

  // ------------------------------------------------------- the dev build
  var b = await build(null);
  ck('dev: build reports the dev channel', await b.page.evaluate(function () { return RD.Flags.baseChannel(); }) === 'dev');
  // RETIRED (owner ruling, 2026-07-30: the training campaign help copy "is being removed
  // and replaced with something else… going to open with a short tour instead", and the
  // campaign is being closely owner-directed). bf41f67 deleted #hookPrompt and the "start
  // the training campaign" help copy, so TWO PAIRED GUARDS lost their subject:
  //   dev "first-run hook IS offered"       + public "first-run hook is NOT offered"
  //   dev "help guide promises the campaign" + public "no longer promises the campaign"
  // In each pair the dev half FAILED and the public half went VACUOUS — passing because its
  // pattern no longer appears anywhere, which is how a deleted test passes. Third and fourth
  // instance of that in this one file today: it is a structural weakness of paired flag
  // guards, not bad luck. Retired rather than re-pointed at #tourOverlay, because the tour
  // carries NO data-flag — it shows on BOTH channels, so the channel distinction these
  // guarded no longer exists. Re-point them only if the tour is deliberately gated later.
  await openSettings(b.page);
  ck('dev: Features row is offered', await b.page.isVisible('#featureRow'));
  await closeSettings(b.page);
  // The picker lives on the CHECKLISTS tab, and the Instructor became the leftmost and
  // default tab on 2026-08-11 — so this has to select the tab a player would select. It
  // checked a pane that simply was not the one on screen.
  await b.page.click('#tabbar [data-tab="checklists"]');
  ck('dev: the checklist picker is offered', await b.page.isVisible('#instrCklRow'));
  /* ---- THE ACTIVE STEP CARD SAYS WHICH CONTROL TO USE (#598 item 13) --------------------
   * The card was collapsed to the instruction alone, and measuring the cost produced the
   * owner's ruling to promote the control back out: only 41 % of the 46 pwr2 steps carrying a
   * control name it in their instruction text, so 27 steps had no visible answer to "which
   * knob". This asserts it IN THE RENDERED DOM and not by scanning app.js for the string —
   * #485's lesson, where `/\(partial\)/` passed green against `(false ? ' (partial)' : '')`.
   * A source scan cannot tell you a string is reachable; starting a real checklist can.
   *
   * Deliberately NOT pinned to a particular step's wording: the claim is that the active card
   * carries a `.ckl-use` line naming a control, which survives any content edit and fails the
   * moment the block is folded back into Details. */
  await b.page.click('#tabbar [data-tab="checklists"]');
  /* ⚠ THE FIRST LISTED CHECKLIST IS NOT A FIXTURE — PICK THE ONE THAT CAN ANSWER THE QUESTION
   * (2026-09-15). This used to click `#cklMenu [data-ckl-start]`, whichever that was, and the
   * step it landed on is an OBSERVE step, whose "Watch for:" line is drawn by a DIFFERENT branch
   * of `renderChecklist`. MEASURED: with the deleted "Use <control>: <target>" branch put back,
   * the check below still PASSED — it could never see the rung it exists to forbid. `.ckl-use`
   * is drawn only under the ACTIVE step (`if (active)` in renderChecklist), so the only way to
   * exercise the DO branch is to start a walkthrough whose FIRST step carries a real control.
   * Chosen from `RD.MANUAL_PROCEDURES` for the running plant, so no content edit can quietly
   * turn it back into the observe case — it would have to remove every controlled first step,
   * which the `err` return below reports rather than passing over. */
  var cklStarted = await b.page.evaluate(function () {
    var snap = (window.RD && RD.PwrBoard && RD.PwrBoard.lastSnapshot) ? RD.PwrBoard.lastSnapshot() : null;
    var pid = (snap && snap.metadata && snap.metadata.plant_id) || null;
    var pool = ((window.RD || {}).MANUAL_PROCEDURES || {})[pid] || [];
    function procOf(id) { for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i]; return null; }
    var btns = Array.prototype.slice.call(document.querySelectorAll('#cklMenu [data-ckl-start]'));
    if (!btns.length) btns = Array.prototype.slice.call(document.querySelectorAll('[data-ckl-start]'));
    var fallback = btns[0] || null;
    for (var b = 0; b < btns.length; b++) {
      var p = procOf(btns[b].getAttribute('data-ckl-start'));
      var s0 = p && p.steps && p.steps[0];
      if (s0 && s0.control && !/^\(observe/i.test(s0.control)) { btns[b].click(); return 'do:' + p.id; }
    }
    if (!fallback) return false;
    fallback.click();
    return 'fallback';
  });
  if (cklStarted) {
    await b.page.waitForSelector('.ckl-step.ckl-active', { timeout: 20000 }).catch(function () {});
    /* ⚠ DATA-DRIVEN, NOT FIXTURE-DRIVEN, and the first cut of this check was the latter. It
     * asserted a `.ckl-use` line simply EXISTS on the active step — and passed, because the
     * picker happened to start one of the three checklists whose first step carries a control.
     * The other three open on an obs() confirmation with no control and no target, and 13 of the
     * 61 pwr2 steps are that shape, so the check was pinned to which procedure the menu listed
     * first. Found by screenshotting the card and reading `use line: null` under a green gate.
     *
     * The claim is CONDITIONAL and that is what makes it honest: when the active step HAS a
     * control the card must name it OUTSIDE the fold; when it has none there must be no line.
     * Both halves are read from the step's own data via RD.MANUAL_PROCEDURES, so no content edit
     * can turn this green or red for the wrong reason. */
    var seen = await b.page.evaluate(function () {
      var a = document.querySelector('.ckl-step.ckl-active');
      if (!a) return { err: 'no active step card' };
      var steps = Array.prototype.slice.call(document.querySelectorAll('.ckl-step'));
      var idx = steps.indexOf(a);
      var head = document.querySelector('.ckl-head b');
      var title = head ? (head.textContent || '').trim() : null;
      /* THE POOL IS THE RUNNING PLANT'S, read off the live snapshot — NOT a hard-coded
       * 'pwr2'. The first cut hard-coded it and this check went red against a correctly
       * rendered card: this build boots the retired engine, whose pwr_startup step 1 IS an
       * observation with a target, while pwr2's step 1 has neither. The two pools share
       * procedure TITLES, so a title lookup in the wrong pool silently answers about a
       * different plant's step — the #557 family, in a test. */
      var snap = (window.RD && RD.PwrBoard && RD.PwrBoard.lastSnapshot) ? RD.PwrBoard.lastSnapshot() : null;
      var pid = (snap && snap.metadata && snap.metadata.plant_id) || null;
      var all = (window.RD || {}).MANUAL_PROCEDURES || {};
      var pool = (pid && all[pid]) || [];
      var proc = null;
      for (var i = 0; i < pool.length; i++) if ((pool[i].title || '').trim() === title) proc = pool[i];
      var st = (proc && proc.steps) ? proc.steps[idx] : null;
      var el = a.querySelector('.ckl-use');
      return { idx: idx, title: title, found: !!proc, plant: pid,
               control: st ? (st.control || null) : undefined,
               target: st ? (st.target || null) : undefined,
               line: el ? (el.textContent || '').trim() : null };
    });
    /* ⚠ THE CLAIM IS NOW THE OPPOSITE OF WHAT #598 item 13 ASSERTED, AND THAT IS A RULING, NOT A
     * REGRESSION *(OWNER RULING, 2026-09-14/15: "Hide it in the renderer")*. The authored step
     * file `Blueprint/WALKTHROUGH_STEPS_OWNER.md` carries the "Use <control>: <target>" rung on
     * one of the nineteen steps that declare a `control`, so the rung is the renderer's addition
     * and the renderer stops drawing it. The #598 ruling was made against a card collapsed to the
     * instruction alone; it is superseded.
     *
     * THE CHECK IS INVERTED, NOT DELETED: the active step must draw NO `.ckl-use` line, so the
     * rung coming back reddens it. Read from the step's own data through `RD.MANUAL_PROCEDURES`,
     * so no content edit can turn it green or red for the wrong reason — the property #598's
     * author built in.
     *
     * INJECTION-PROVEN, and the FIRST cut of this inversion was HOLLOW. With the deleted
     * `renderChecklist` branch put back it still passed, because the walkthrough the picker
     * happened to start opens on an OBSERVE step and `.ckl-use` renders only under the active
     * one. With the selection above pointed at a controlled first step it goes RED naming the
     * line: `pwr step 1 of "Mode 1, At Power — raise power" ... got "Use Rod Speed: small,
     * steady power rise"`. That is the difference between testing the ruling and restating the
     * renderer.
     *
     * ⚠ WHAT IT DOES NOT COVER, stated rather than implied: the `wantWatch` clause below — an
     * OBSERVE step must still draw "Watch for:" — is reached only on the fallback path, when no
     * listed walkthrough opens on a controlled step. On this build one always does, so that
     * half is UNASSERTED here. It is not a second check pretending to be one. */
    var obs = seen.control && /^\(observe/i.test(seen.control);
    var wantWatch = !!(obs && seen.target);
    ck('dev: the active step draws NO "Use …" rung (2026-09-15 ruling, supersedes #598 item 13)',
      seen.found === true && seen.control !== undefined &&
      (wantWatch
        ? (!!seen.line && /^Watch for:/.test(seen.line) && !/\(observe\)/.test(seen.line))
        : seen.line === null),
      seen.plant + ' step ' + (seen.idx + 1) + ' of "' + seen.title + '" control=' +
      JSON.stringify(seen.control) + ' target=' + JSON.stringify(seen.target) +
      ' — expected ' + (wantWatch ? 'a "Watch for:" line' : 'NO line') +
      ', got ' + (seen.line === null ? 'none' : '"' + seen.line.slice(0, 70) + '"'));
    /* ⚰ "the expander is labelled Details, not Why" (#598 item 13) WAS HERE AND COULD NEVER FAIL.
     * It read `.ckl-step.ckl-active .ckl-why-btn` and asserted `folded === null || /Details/i`. No
     * file in `ui/` has ever emitted `.ckl-why-btn` — the class exists only in shell.css and in the
     * handler #737 deleted (see the headstone at ui/app.js:8344) — so the query returned null on
     * every run and the first clause passed unconditionally. It went green at the injection that
     * was supposed to break it AND at the deletion of the feature it described, which is the whole
     * signature of a hollow check.
     *
     * DELETED RATHER THAN REPAIRED, because there is nothing left to point it at: the card has no
     * expander at all now — the active step's detail block is always open. Its real concern, that
     * the step names its control OUTSIDE the fold, is asserted by the LIVE check immediately above
     * this comment, so nothing is lost by removing it. Do not re-add a check here without an
     * element to read; that is how this one came to exist. (#738 orphan sweep.) */

    /* ---- #628 item 1: THE NUMBERED INSTRUCTION IS THE HEAD OF EVERY CARD -------------------
     * *(OWNER, 2026-09-04: "move the numbered step to always be the first part of the stack.
     * then the rest of the step that appears when its active goes below it.")*
     *
     * Asserted over EVERY rendered card, not just the active one, because the whole point of
     * the ruling is that the active card stops being the exception. Read as DOM ORDER —
     * `.ckl-txt` is the first element child of `.ckl-body` — which is the claim itself and not
     * a proxy for it: putting any block back above the instruction reddens this, and no content
     * edit can touch it. Injection-proven: moving the `.ckl-txt` line back under the active
     * block fails with "step 1 leads with ckl-act". */
    var lead = await b.page.evaluate(function () {
      var out = { n: 0, bad: null };
      var cards = document.querySelectorAll('.ckl-step .ckl-body');
      for (var i = 0; i < cards.length; i++) {
        var f = cards[i].firstElementChild;
        out.n++;
        if (!f || !f.classList.contains('ckl-txt')) {
          out.bad = 'step ' + (i + 1) + ' leads with ' + (f ? (f.className || f.tagName) : 'nothing');
          break;
        }
      }
      return out;
    });
    ck('dev: every checklist card leads with its numbered instruction (#628)',
      lead.n > 0 && lead.bad === null, lead.bad || (lead.n + ' cards'));

    /* ---- #628 item 2: THE SUGGESTED SPEED RUNG IS A RUNG THE PLAYER HAS --------------------
     * *(OWNER, 2026-09-04: "Add a suggested time warp value for the long term waiting steps.")*
     *
     * Two claims, both read off the LIVE ladder rather than a list written here — a literal
     * copy in the test would only prove the test and the code share an author's memory:
     *   1. every suggestion is one of the `#speed [data-speed]` buttons, so the card can never
     *      name a speed the board does not offer;
     *   2. it is the SMALLEST rung that brings the wait under 30 s of wall clock at nominal
     *      rate *(OWNER, 2026-09-05: "Change it to 30s")*, recomputed here from the ladder —
     *      which pins the rule, not one worked value, and keeps WARP off the waits that PLAY
     *      can carry. The 30 is deliberately WRITTEN OUT here rather than read from app.js:
     *      the check has to be able to disagree with the code, and a test that imports the
     *      constant it is checking asserts only that the constant equals itself. Moving the
     *      target is therefore a two-file change, on purpose — the second file is this one.
     *
     * Driven over EVERY pool in RD.MANUAL_PROCEDURES rather than the running plant's alone.
     * This build boots the retired engine (the `.ckl-use` check above found that out the hard
     * way), and the pool that matters is pwr2's — 24 of its 66 steps carry a hold of 180 s or
     * more, against 23 of the retired pool's 113 with different numbers. Both are shipped
     * artifacts and the rule is plant-agnostic, so sweep every pool and the gate cannot be
     * quietly aimed at the wrong plant (#579). The floor is a FLOOR, not a tally: authoring a
     * procedure must not redden this, but dropping pwr2 out of the sweep must. */
    var hint = await b.page.evaluate(function () {
      var lad = [];
      document.querySelectorAll('#speed [data-speed]').forEach(function (btn) {
        lad.push({ speed: +btn.getAttribute('data-speed'), warp: btn.classList.contains('warp') });
      });
      lad.sort(function (a, b2) { return a.speed - b2.speed; });
      var all = (window.RD || {}).MANUAL_PROCEDURES || {};
      var out = { rungs: lad.length, n: 0, bad: null, pools: [] };
      if (typeof RD.CklSpeedHint !== 'function') { out.bad = 'RD.CklSpeedHint is not exposed'; return out; }
      Object.keys(all).forEach(function (pid) {
        var pool = all[pid] || [], seen = 0;
        for (var p = 0; p < pool.length; p++) {
          for (var s = 0; s < (pool[p].steps || []).length; s++) {
            var h = +pool[p].steps[s].hold || 0;
            if (h < 180) continue;
            out.n++; seen++;
            var got = RD.CklSpeedHint(h);
            var want = lad[lad.length - 1];
            for (var k = 0; k < lad.length; k++) if (h / lad[k].speed <= 30) { want = lad[k]; break; }
            if (!out.bad && (!got || got.speed !== want.speed || got.warp !== want.warp)) {
              out.bad = pid + ' ' + pool[p].id + ' step ' + (s + 1) + ' (' + h + ' s): wanted ' +
                        want.speed + 'x, got ' + (got ? got.speed + 'x' : 'nothing');
            }
          }
        }
        out.pools.push(pid + ':' + seen);
      });
      return out;
    });
    ck('dev: every long wait suggests the smallest ladder rung that clears it in 30 s (#628)',
      hint.rungs >= 2 && hint.n >= 24 && hint.bad === null &&
      hint.pools.some(function (p) { return /^pwr2:[1-9]/.test(p); }),
      hint.bad || (hint.n + ' waiting steps [' + hint.pools.join(' ') + '], ' + hint.rungs + ' rungs'));

    /* And the rendered card actually SAYS it. THIS CHECK HAD TO START ITS OWN CHECKLIST, and
     * the first cut did not — it read whatever the picker had opened, whose step 1 holds for
     * 2 s, so it asserted the NEGATIVE half ("a short step has no wait line") and passed while
     * the card printed a hard-coded 2×. Injection found it: rewriting `rung.speed` to a literal
     * left the gate green. The hollow-check trap, in a check written beside its own fix.
     *
     * So: pick the first procedure in the LIVE pool whose step 1 carries a hold of 180 s or
     * more and start THAT one — data-driven, so it is `pwr_stuck_porv` on the retired engine
     * and `pwr_cooldown` on pwr2 without either id appearing here. Then the rendered line must
     * name the rung RD.CklSpeedHint picks. Step 1 is asserted to be the active one, because an
     * auto-advance would put us back on a step with no wait and re-hollow the check. */
    var wait = await b.page.evaluate(function () {
      var snap = (window.RD && RD.PwrBoard && RD.PwrBoard.lastSnapshot) ? RD.PwrBoard.lastSnapshot() : null;
      var pid = (snap && snap.metadata && snap.metadata.plant_id) || null;
      var pool = ((window.RD || {}).MANUAL_PROCEDURES || {})[pid] || [];
      for (var i = 0; i < pool.length; i++) {
        if ((+pool[i].steps[0].hold || 0) < 180) continue;
        var btn = document.querySelector('[data-ckl-start="' + pool[i].id + '"]');
        if (!btn) continue;
        btn.click();
        return { plant: pid, id: pool[i].id, hold: +pool[i].steps[0].hold };
      }
      return { plant: pid, id: null };
    });
    if (wait.id) await b.page.waitForSelector('.ckl-step.ckl-active .ckl-wait', { timeout: 20000 }).catch(function () {});
    var waitLine = await b.page.evaluate(function () {
      var a = document.querySelector('.ckl-step.ckl-active');
      if (!a) return { idx: -1, line: null };
      var steps = Array.prototype.slice.call(document.querySelectorAll('.ckl-step'));
      var el = a.querySelector('.ckl-wait');
      return { idx: steps.indexOf(a), line: el ? (el.textContent || '').trim() : null };
    });
    var wantRung = wait.id ? await b.page.evaluate(function (h) { return RD.CklSpeedHint(h).speed; }, wait.hold) : null;
    ck('dev: and a waiting step\'s card names that rung (#628)',
      !!wait.id && waitLine.idx === 0 && !!waitLine.line && waitLine.line.indexOf(wantRung + '×') >= 0,
      wait.id ? (wait.plant + ' ' + wait.id + ' step ' + (waitLine.idx + 1) + ', hold=' + wait.hold +
                 's, expected ' + wantRung + 'x, got ' +
                 (waitLine.line === null ? 'no wait line' : '"' + String(waitLine.line).slice(0, 80) + '"'))
              : 'no procedure in the ' + wait.plant + ' pool opens on a long wait');
  } else {
    ck('dev: a checklist could be started from the picker', false, 'no [data-ckl-start] button found');
  }

  var camp = await openMission(b.page, 'campaign');
  ck('dev: campaign lists its missions', /Act I/.test(camp) && !/COMING SOON/.test(camp), camp.slice(0, 60));
  ck('dev: campaign missions are startable',
    (await b.page.$$('#mpContent [data-camp-start]')).length > 20);
  ck('dev: scenarios are listed', /Welcome to the Control Room/.test(await openMission(b.page, 'scenarios')));
  var walk = await openMission(b.page, 'walkthroughs');
  ck('dev: walkthroughs listed with Start buttons',
    /Start/.test(walk) && (await b.page.$$('#mpContent [data-wtstart]')).length > 0);
  ck('dev: no Follow-in-Instructor buttons remain (#660 item 14)',
    (await b.page.$$('#mpContent [data-follow]')).length === 0 && !/Follow/.test(walk));
  await b.ctx.close();

  /* THE TMI-2 INCIDENT WALKTHROUGH IS PREVIEW-ONLY (#670, plan R4 ruled 2026-09-08). Asserted
   * on BOTH channels and on the rendered list, not on the registry: `mpWalkthroughs` filters the
   * pool by `flagOn('procedure:' + id)`, so the Start button's presence is the only thing that
   * says what a visitor is offered.
   *
   * ⚠ ON `?engine=pwr2`, AND THAT IS THE WHOLE CHECK. `SHELL` boots the RETIRED engine, whose
   * pool has no incident leg at all — so run against it the dev half FAILS for the wrong reason
   * and, worse, the public half PASSES for the wrong reason. Measured both ways at authoring:
   * on `engine=pwr` the public assertion is green over a list that could never have contained
   * the row. The shipped plant is pwr2 (#523) and it is the only pool this claim is about. */
  var WT2 = SHELL.replace('engine=pwr&', 'engine=pwr2&');
  b = await build('dev', WT2);
  var walk2 = await openMission(b.page, 'walkthroughs');
  ck('dev (pwr2): the TMI-2 incident walkthrough is offered (#670)',
    (await b.page.$$('[data-wtstart="pwr_tmi2_incident"]')).length === 1,
    (await b.page.$$eval('#mpContent [data-wtstart]', function (n) { return n.map(function (x) { return x.getAttribute('data-wtstart'); }); })).join(',') ||
    walk2.slice(0, 60));
  await b.ctx.close();

  /* ---- #686: THE STATUS LINE UNDER THE SPEED BAR CONSOLIDATES WITH THE CARD'S OWN LINE ------
   * *(OWNER RULING, 2026-09-10, "All decisions as recommended" ratifying option B)*. Same fact,
   * same rung as `.ckl-wait` on a qualifying step (`hold >= 180`); NOTHING under the speed bar
   * on a step that does not qualify — "nothing on other steps" is the ruling's own words.
   * Asserted on the SHIPPED plant's own pool (pwr2, #523), each case its own fresh build so the
   * second checklist never has to contend with the first one's run state. */
  b = await build('dev', WT2);
  await b.page.click('#tabbar [data-tab="checklists"]');
  var w2 = await b.page.evaluate(function () {
    var pool = ((window.RD || {}).MANUAL_PROCEDURES || {}).pwr2 || [];
    for (var i = 0; i < pool.length; i++) {
      if ((+pool[i].steps[0].hold || 0) < 180) continue;
      var btn = document.querySelector('[data-ckl-start="' + pool[i].id + '"]');
      if (!btn) continue;
      btn.click();
      return { id: pool[i].id, hold: +pool[i].steps[0].hold };
    }
    return { id: null };
  });
  if (w2.id) await b.page.waitForSelector('.ckl-step.ckl-active .ckl-wait', { timeout: 20000 }).catch(function () {});
  var lines2 = w2.id ? await b.page.evaluate(function () {
    var a = document.querySelector('.ckl-step.ckl-active');
    var cardEl = a ? a.querySelector('.ckl-wait') : null;
    var barEl = document.getElementById('warpInfo');
    return { card: cardEl ? (cardEl.textContent || '').trim() : null,
             bar: barEl ? (barEl.textContent || '').trim() : null,
             barHidden: barEl ? barEl.hidden : null };
  }) : null;
  var wantRung2 = w2.id ? await b.page.evaluate(function (h) { return RD.CklSpeedHint(h).speed; }, w2.hold) : null;
  ck('dev (pwr2): the speed-bar line names the same rung as the card on a qualifying step (#686)',
    !!w2.id && !!lines2 && lines2.barHidden === false && !!lines2.bar && lines2.bar.indexOf(wantRung2 + '×') >= 0,
    w2.id ? (w2.id + ' hold=' + w2.hold + ', card="' + (lines2.card || '').slice(0, 70) +
             '", bar="' + (lines2.bar || '') + '"')
          : 'no pwr2 procedure opens on a long-wait step');
  await b.ctx.close();

  b = await build('dev', WT2);
  await b.page.click('#tabbar [data-tab="checklists"]');
  var w2b = await b.page.evaluate(function () {
    var pool = ((window.RD || {}).MANUAL_PROCEDURES || {}).pwr2 || [];
    for (var i = 0; i < pool.length; i++) {
      if ((+pool[i].steps[0].hold || 0) >= 180) continue;
      var btn = document.querySelector('[data-ckl-start="' + pool[i].id + '"]');
      if (!btn) continue;
      btn.click();
      return { id: pool[i].id, hold: +pool[i].steps[0].hold || 0 };
    }
    return { id: null };
  });
  if (w2b.id) {
    await b.page.waitForSelector('.ckl-step.ckl-active', { timeout: 20000 }).catch(function () {});
    await b.page.waitForTimeout(1200);   // let a broadcast land so #warpInfo's own guard has run
  }
  var lineNo = w2b.id ? await b.page.evaluate(function () {
    var el = document.getElementById('warpInfo');
    return { text: el ? (el.textContent || '').trim() : null, hidden: el ? el.hidden : null };
  }) : null;
  ck('dev (pwr2): and prints nothing under the speed bar on a step below the hold gate (#686)',
    !!w2b.id && !!lineNo && (lineNo.hidden === true || lineNo.text === ''),
    w2b.id ? (w2b.id + ' hold=' + w2b.hold + ' -> ' + JSON.stringify(lineNo))
           : 'no non-qualifying pwr2 procedure found to open');
  await b.ctx.close();

  // The player's window (no `mmode` in the URL) offers exactly Free Play and Walkthroughs
  // (#660 item 19); the campaign and scenario areas are reachable only through the door.
  b = await build('dev', SHELL.replace('&mmode=free', ''));
  await b.page.click('#mainMenuBtn');
  var tabsPlain = await b.page.$$eval('#mpModes [data-mmode]', function (els) { return els.map(function (e) { return e.getAttribute('data-mmode'); }); });
  ck('player window: only Free Play and Walkthroughs tabs', tabsPlain.join(',') === 'free,walkthroughs', tabsPlain.join(','));
  await b.ctx.close();

  // ------------------------------------ the public build (what `main` deploys)
  b = await build('public');
  ck('public: build reports the public channel', await b.page.evaluate(function () { return RD.Flags.baseChannel(); }) === 'public');
  await openSettings(b.page);
  ck('public: Features row is not on screen', !(await b.page.isVisible('#featureRow')));
  await closeSettings(b.page);
  /* THE PICKER IS ON SCREEN NOW *(OWNER RULING, 2026-09-12: "A", on #722 — `checklists` and
   * `walkthroughs` are stage:'public')*, and the check that used to assert its ABSENCE here
   * was HOLLOW, which the flip is what exposed. It read `isVisible('#instrCklRow')` with the
   * INSTRUCTOR tab active — the row lives in the checklists pane, so it is off screen on that
   * tab whatever the flag says. MEASURED both ways before rewriting it: `?flags=all` on the
   * public channel, no tab click, still `false`. It could never have failed.
   *
   * So it clicks the tab a player clicks, and asserts the shipped answer. Its negative half is
   * NOT deleted — it is the `flags=all,-checklists` probe further down, which now clicks the
   * same tab and was hollow in the same way. One flag, two channels of it, both non-vacuous. */
  await b.page.click('#tabbar [data-tab="checklists"]');
  ck('public: the checklist picker IS on screen (#722)', await b.page.isVisible('#instrCklRow'));
  var help = await b.page.textContent('#helpOverlay');
  ck('public: free play is still offered', /Start Free Play/.test(await openMission(b.page, 'free')));
  var tabs = ['campaign', 'scenarios'];
  for (var i = 0; i < tabs.length; i++) {
    var t = await openMission(b.page, tabs[i]);
    ck('public: ' + tabs[i] + ' says COMING SOON', /COMING SOON/.test(t), t.slice(0, 70));
    ck('public: ' + tabs[i] + ' offers nothing to start',
      (await b.page.$$('#mpContent .btn, #mpContent [data-camp-start], #mpContent [data-trstart]')).length === 0);
  }
  /* …AND WALKTHROUGHS IS NO LONGER ONE OF THEM (#722). It was the third entry in that loop
   * until the ruling; keeping it there and relaxing the pattern would have left the loop
   * asserting nothing about the one area whose state changed. It gets its own check instead —
   * the tab LISTS rather than saying COMING SOON. WHICH legs it lists is asserted further
   * down, on `?engine=pwr2`, because THIS url boots the retired engine (see the header) and
   * its pool authors the same six ids plus eleven more; a content assertion here would be
   * reading the wrong plant's pool for the right answer. */
  var pubList = await openMission(b.page, 'walkthroughs');
  var pubIds = await b.page.$$eval('#mpContent [data-wtstart]',
    function (els) { return els.map(function (e) { return e.getAttribute('data-wtstart'); }); });
  ck('public: walkthroughs LIST rather than saying COMING SOON (#722)',
    !/COMING SOON/.test(pubList) && pubIds.length > 0, pubIds.join(',') || pubList.slice(0, 70));
  // The manual keeps its PROSE — only the instructed experiences are gated.
  await b.page.click('#missionClose');
  await b.page.click('#manualBtn');
  ck('public: the manual still opens', await b.page.isVisible('#manualOverlay'));
  /* HOLLOW IN THE SAME WAY, and found by the same flip: this queried #manualContent the
   * instant the manual opened, which is the `readme` DOCUMENT — the 📋 buttons are drawn by
   * mProcedures() on the "Procedures (live)" section, which nothing here had selected.
   * MEASURED: 0 on open with `?flags=all`, 17 on the Procedures section of the same page.
   * It now navigates there and asserts the SHIPPED SET rather than an absence — a count of
   * zero is also what a page that failed to render produces. Three claims, and NONE of them
   * is a written list, so the check holds on either engine's pool: every button that IS drawn
   * names a procedure the resolver says is offered; at least one is drawn; and there are more
   * procedure CARDS than buttons, which is what proves the gate is still withholding rather
   * than the page simply drawing everything. [data-follow] stays an absence — that button is
   * retired (#660 item 14), so its subject is gone rather than gated. */
  await b.page.click('#manualNav [data-msec="procedures"]');
  var mIds = await b.page.$$eval('#manualContent [data-checklist]',
    function (els) { return els.map(function (e) { return e.getAttribute('data-checklist'); }); });
  var mCards = (await b.page.$$('#manualContent .m-card')).length;
  var mAllOffered = await b.page.evaluate(function (ids) {
    return ids.every(function (id) { return RD.Flags.on('procedure:' + id) === true; });
  }, mIds);
  ck('public: a 📋 Checklist button appears on the offered procedures and no others (#722)',
    mIds.length > 0 && mAllOffered && mCards > mIds.length &&
    (await b.page.$$('#manualContent [data-follow]')).length === 0,
    mIds.length + ' buttons on ' + mCards + ' cards: ' + mIds.join(','));
  ck('public: manual prose is still there',
    ((await b.page.textContent('#manualContent')) || '').length > 200);
  await b.ctx.close();

  // ------------------------------- the routes back in on a public build
  b = await build('public', SHELL + '&flags=1');
  await openSettings(b.page);
  ck('public + ?flags=1: the Features panel is reachable', await b.page.isVisible('#featureRow'));
  await closeSettings(b.page);
  await b.ctx.close();

  /* ---- THE GREEN [NEW] BADGE MUST NOT OUTRUN THE FLAG (#688, quality pass 2026-09-11) -------
   *
   * MEASURED before the fix, on the public channel, this URL: the Walkthroughs tab read
   * "Walkthroughs NEW" — the badge painted 33x14 px in rgb(121, 210, 151) — directly above a
   * panel reading "COMING SOON. Guided procedure walkthroughs are in final review." The badge
   * was the literal `true` in renderMissionSelect's mode tuple while the panel asks
   * site/flags.js, and `walkthroughs` is stage:'preview' there — so the public site advertised
   * a locked door in the colour that means "here now".
   *
   * BOTH HALVES, ONE URL, because either alone is hollow. The half where nothing is offered
   * alone passes on a badge that never renders anywhere; the half where it is offered alone
   * passes on a badge that renders everywhere. Asserted on the PAINTED RECT and the COMPUTED
   * COLOUR, never the class name — a badge whose .mp-new rule never loaded still carries the
   * class and still reads NEW (#485). The COMING SOON / list text is read in the same breath so
   * the pair can never agree for the wrong reason: if the panel and the badge ever disagree
   * again, one of these two reds.
   *
   * THE PAIR IS NO LONGER public-vs-dev *(OWNER RULING, 2026-09-12: "A", on #722)*. `walkthroughs`
   * is stage:'public' now, so BOTH channels list and both must paint the badge — a channel split
   * would assert nothing. The split that still separates the two outcomes is the flag itself:
   * the shipped public page (offered → badge + list), and the same public page with
   * `?flags=-walkthroughs` (withheld → no badge + COMING SOON). Same claim, same two directions,
   * measured where they still differ. The dev half stays as its own row underneath. */
  async function wtBadge(page) {
    return page.evaluate(function () {
      var t = document.querySelector('#mpModes [data-mmode="walkthroughs"]');
      var s = t ? t.querySelector('.mp-new') : null;
      var r = s ? s.getBoundingClientRect() : null;
      return { tab: !!t, painted: !!(r && r.width > 2 && r.height > 2),
               w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
               color: s ? getComputedStyle(s).color : null,
               flag: RD.Flags.on('walkthroughs') };
    });
  }
  b = await build('public', WT2 + '&flags=-walkthroughs');
  var pubBadgeTxt = await openMission(b.page, 'walkthroughs');
  var pubBadge = await wtBadge(b.page);
  ck('public + ?flags=-walkthroughs: the tab carries NO green NEW badge over its COMING SOON panel',
    pubBadge.tab && !pubBadge.painted && pubBadge.flag === false && /COMING SOON/.test(pubBadgeTxt),
    JSON.stringify(pubBadge) + ' | ' + pubBadgeTxt.replace(/\s+/g, ' ').slice(0, 60));
  await b.ctx.close();

  b = await build('public', WT2);
  var pubOnTxt = await openMission(b.page, 'walkthroughs');
  var pubOnBadge = await wtBadge(b.page);
  ck('public (as shipped): the Walkthroughs tab DOES carry the green NEW badge over its live list (#722)',
    pubOnBadge.painted && pubOnBadge.color === 'rgb(121, 210, 151)' && pubOnBadge.flag === true &&
    !/COMING SOON/.test(pubOnTxt) && (await b.page.$$('[data-wtstart]')).length > 0,
    JSON.stringify(pubOnBadge) + ' | ' + pubOnTxt.replace(/\s+/g, ' ').slice(0, 60));
  await b.ctx.close();

  b = await build('dev', WT2);
  var devBadgeTxt = await openMission(b.page, 'walkthroughs');
  var devBadge = await wtBadge(b.page);
  ck('dev: the Walkthroughs tab DOES carry the green NEW badge over its live list',
    devBadge.painted && devBadge.color === 'rgb(121, 210, 151)' && devBadge.flag === true &&
    !/COMING SOON/.test(devBadgeTxt) && (await b.page.$$('[data-wtstart]')).length > 0,
    JSON.stringify(devBadge) + ' | ' + devBadgeTxt.replace(/\s+/g, ' ').slice(0, 60));
  await b.ctx.close();

  /* …and the same SHIPPED public page, which now lists — so the incident leg's absence is
   * measured against a live list rather than against a closed tab. The `?flags=+walkthroughs`
   * override this used to carry is gone with the ruling: forcing an area that is already
   * stage:'public' adds nothing, and it hid the fact that the list is now the public answer.
   * Non-vacuous by construction — the same selector finds the row one build up, on dev. */
  b = await build('public', WT2);
  await openMission(b.page, 'walkthroughs');
  var pubWalkIds = await b.page.$$eval('#mpContent [data-wtstart]',
    function (els) { return els.map(function (e) { return e.getAttribute('data-wtstart'); }); });
  /* ONLY THE HEATUP LEG NOW *(OWNER DIRECTIVE, 2026-09-15: "Release and unlock only the mode 5
   * to 3 walkthrough. I still need to test the mode 3 to 1 and other walkthroughs.")*. This check
   * asserted the #722 policy (all six public) and that policy is superseded, so the check is
   * RE-POINTED, not relaxed: it still pins an exact list, still pins the incident leg's absence,
   * and it now also pins that the withdrawn five are absent BY NAME. Validated against the OLD
   * behaviour too — with the five back at 'public' this form goes red naming them, so it is not
   * a check refitted to whatever the build happens to do. */
  ck('public: ONLY the Mode 5 to Mode 3 heatup is offered; the other five legs and the incident walkthrough are NOT (#722, owner 2026-09-15)',
    pubWalkIds.join(',') === 'pwr_heatup' &&
    (await b.page.evaluate(function () {
      return ['pwr_startup', 'pwr_raise_power', 'pwr_lower_power', 'pwr_shutdown', 'pwr_cooldown',
              'pwr_tmi2_incident'].every(function (id) { return RD.Flags.on('procedure:' + id) === false; });
    })) === true,
    pubWalkIds.join(','));
  await b.ctx.close();

  /* ---- THE CHAIN HANDOFF, THE SECOND ROUTE INTO A WALKTHROUGH (2026-09-15) ------------------
   * *(OWNER, 2026-09-15: "I found a way to play the locked walkthroughs in the live version.
   * when finishing the mode 5-3 walkthrough it produces a button at the bottom that brings you
   * to the next walkthrough. it works and brings up the mode 3-1 walkthrough which should be
   * locked.")*
   *
   * THIS FILE PASSED 53/53 WHILE THAT SHIPPED, and that is the interesting half. Every
   * walkthrough check above reads what `[data-wtstart]` renders in the Plant & Mission LIST —
   * one route. The finished card resolves `pr.next` out of the pool by id on a completely
   * separate path, so the defect took the route nothing here was watching. A list check cannot
   * cover a handoff; only the handoff can.
   *
   * IT DRIVES THE RENDERER'S OWN FUNCTION, not a copy and not a source scan. `nextLegFor` is
   * exactly what the finished card calls to decide whether to draw the button, exposed on
   * `RD.__dev` under `?dev=1` beside `tripCauses()` for the same reason that one is: a copy in
   * this file goes stale the day the decision changes. A source scan could not do this job at
   * all — `/flagOn/` matching in a render expression is the `(false ? ' (partial)' : '')` shape
   * (#485), green on a branch nothing can reach.
   *
   * BOTH CHANNELS, so the check cannot pass by the button never existing. `pwr_heatup` is public
   * and its `next` (`pwr_startup`) is not, which is the shipped asymmetry; on dev both are on and
   * the handoff must still resolve, or a "fix" that simply deleted the chain would read green.
   *
   * NOT COVERED BY THE `?follow=` DEEP LINK a few lines of app.js away: that is a hand-typed URL
   * in the `?inject=` / `?ff=` family and `site/flags.js` says plainly that gating is not access
   * control. This is a button the app DREW for the player, which is a different claim. */
  async function chainLeg(channel) {
    var c = await build(channel, WT2.replace('?engine=pwr2', '?engine=pwr2&dev=1'));
    var r = await c.page.evaluate(function () {
      var pool = (RD.MANUAL_PROCEDURES || {}).pwr2 || [];
      var heatup = pool.filter(function (x) { return x.id === 'pwr_heatup'; })[0] || null;
      var nl = RD.__dev && RD.__dev.nextLegFor ? RD.__dev.nextLegFor(heatup, true) : 'NO HOOK';
      return {
        channel: RD.Flags.baseChannel(),
        next: heatup ? heatup.next : null,
        nextOn: heatup && heatup.next ? RD.Flags.on('procedure:' + heatup.next) : null,
        offered: nl === 'NO HOOK' ? 'NO HOOK' : (nl ? nl.id : null),
        /* the NEGATIVE control on the same call: an unfinished leg never offers a handoff,
         * so a fix that returned null unconditionally cannot pass the dev half below. */
        offeredWhileRunning: (RD.__dev && RD.__dev.nextLegFor && RD.__dev.nextLegFor(heatup, false)) ? 'yes' : null,
      };
    });
    await c.ctx.close();
    return r;
  }
  var chainPub = await chainLeg('public');
  ck('public: a finished pwr_heatup does NOT offer the gated next leg (the chain handoff is gated, owner 2026-09-15)',
    chainPub.channel === 'public' && chainPub.next === 'pwr_startup' &&
    chainPub.nextOn === false && chainPub.offered === null,
    JSON.stringify(chainPub));
  var chainDev = await chainLeg(null);
  ck('dev: the same finished leg DOES offer it — the handoff still works where the next leg is on',
    chainDev.channel === 'dev' && chainDev.nextOn === true &&
    chainDev.offered === 'pwr_startup' && chainDev.offeredWhileRunning === null,
    JSON.stringify(chainDev));

  b = await build('public', SHELL + '&flags=%2Bcampaign');
  /* Area and item flags are independent by design: opening the AREA alone does not open a
   * mission that is still gated on its own entry.
   *
   * IT USED TO ASSERT COMING SOON, and #722 voided that premise rather than breaking the check:
   * four campaign missions are `kind: procedure` on ids the ruling flipped public
   * (pwr_startup, pwr_raise_power, pwr_lower_power, pwr_shutdown), so the area forced on now
   * lists those four and campaignHtml no longer falls through to soonPanel. THE CLAIM IS
   * UNCHANGED and is now asserted directly, which is stronger than the proxy it replaces: of
   * the plant's 35 campaign missions the tab lists ONLY the ones whose own entry resolves on,
   * it lists strictly fewer than all of them, and the ones it withholds are still gated.
   *
   * NOT A LEAK, and worth writing down because the shape is the one #241 exists to prevent: no
   * visitor reaches this. `campaign` is stage:'preview', and on pwr2 — the plant the site runs —
   * mpCampaign() returns the Free-Play-only note before any flag is consulted. This URL forces
   * the area AND boots the retired engine, which a published build does not carry (#523). */
  var campTxt = await openMission(b.page, 'campaign');
  var campShown = await b.page.$$eval('#mpContent [data-camp-start]',
    function (els) { return els.map(function (e) { return e.getAttribute('data-camp-start'); }); });
  var campSplit = await b.page.evaluate(function () {
    var c = (RD.CAMPAIGNS || {}).pwr, all = [];
    (c.acts || []).forEach(function (a) { (a.missions || []).forEach(function (m) { all.push(m.kind + ':' + m.id); }); });
    (c.bonus || []).forEach(function (m) { all.push(m.kind + ':' + m.id); });
    return { total: all.length, on: all.filter(function (id) { return RD.Flags.on(id); }) };
  });
  /* THE "> 0" WAS A FIXTURE, NOT THE CLAIM, and the 2026-09-15 walkthrough withdrawal proved it:
   * campaign missions are gated on the SAME procedure: ids as the walkthroughs, so gating five
   * legs took the public mission count to 0 and reddened a check about an unrelated relation. That
   * coupling is worth knowing and is why this comment exists. The claim here is the IDENTITY —
   * what the area draws is exactly what the flags say is on — and it holds at zero. Non-vacuity is
   * carried by the very next check, which forces every flag on and requires the campaign to open in
   * full: if the area could not render a mission at all, that one goes red. */
  ck('public + ?flags=+campaign: the area alone offers only missions whose OWN entry is public',
    campShown.length < campSplit.total &&
    campShown.slice().sort().join(',') === campSplit.on.slice().sort().join(',') &&
    /* …and the COMING SOON clause becomes CONDITIONAL rather than being dropped. It was
     * unconditional, which quietly assumed at least one mission was public — a fixture, not a
     * claim, and the 2026-09-15 withdrawal took that set to zero. app.js:5473 returns
     * soonPanel('campaign') when nothing is offerable, which is the DESIGNED answer for an empty
     * area, so both halves are asserted here: offer something and the panel must list it; offer
     * nothing and it must say COMING SOON rather than draw an empty list. Neither state can now
     * pass by accident. */
    (campShown.length ? !/COMING SOON/.test(campTxt) : /COMING SOON/.test(campTxt)),
    campShown.length + ' of ' + campSplit.total + ': ' + campShown.join(','));
  await b.ctx.close();

  b = await build('public', SHELL + '&flags=all');
  var all = await openMission(b.page, 'campaign');
  ck('public + ?flags=all: the campaign opens in full', /Act I/.test(all) && !/COMING SOON/.test(all));
  ck('public: a URL override is never persisted',
    await b.page.evaluate(function () { return localStorage.getItem('rd_flags'); }) === null);
  await b.ctx.close();

  // ------------------------------------ each AREA flag, in isolation
  // Every tab is defended twice — by its area flag and by its items — so with
  // everything else on, only the area flag can still be closing it. Without
  // these, deleting an area check goes unnoticed: the item gates cover for it
  // until the day the owner vets a whole list, and then the area leaks.
  var AREAS = [
    { flag: 'campaign', tab: 'campaign' },
    { flag: 'scenarios', tab: 'scenarios' },
    { flag: 'walkthroughs', tab: 'walkthroughs' },
  ];
  for (var a = 0; a < AREAS.length; a++) {
    b = await build('public', SHELL + '&flags=all,-' + AREAS[a].flag);
    ck('only ' + AREAS[a].flag + ' off (everything else on): the tab still says COMING SOON',
      /COMING SOON/.test(await openMission(b.page, AREAS[a].tab)));
    await b.ctx.close();
  }
  // checklists is not a tab: with it off, walkthroughs still list with their Start
  // buttons — only the instructor picker goes.
  b = await build('public', SHELL + '&flags=all,-checklists');
  var wt = await openMission(b.page, 'walkthroughs');
  ck('only checklists off: walkthroughs still list with Start buttons',
    /Start/.test(wt) && !/COMING SOON/.test(wt) && (await b.page.$$('#mpContent [data-wtstart]')).length > 0);
  await b.page.click('#missionClose');
  /* THE TAB CLICK IS LOAD-BEARING and was missing (#722). Without it this read #instrCklRow
   * with the Instructor tab active, where the row is off screen whatever the flag says —
   * measured `false` on the public channel with `?flags=all`, i.e. the check could not fail.
   * It is the negative half of "public: the checklist picker IS on screen" above, which
   * clicks the same tab; the pair only means something if both of them do. */
  await b.page.click('#tabbar [data-tab="checklists"]');
  ck('only checklists off: the instructor picker is gone', !(await b.page.isVisible('#instrCklRow')));
  await b.ctx.close();

  // ---------------------------------------------- the panel drives the app
  b = await build(null);
  await openSettings(b.page);
  await b.page.click('#featureBtn');
  ck('panel: lists every registered flag',
    (await b.page.$$('.fl-row')).length === await b.page.evaluate(function () { return RD.Flags.ids().length; }));
  await b.page.click('[data-flid="campaign"]');
  ck('panel: a toggle writes an override', await b.page.evaluate(function () { return RD.Flags.on('campaign'); }) === false);
  await b.page.click('#featureClose');
  await closeSettings(b.page);      // Features opens from inside Settings, which is still up
  ck('panel: the mission window follows it', /COMING SOON/.test(await openMission(b.page, 'campaign')));
  await b.page.click('#missionClose');
  await openSettings(b.page);
  await b.page.click('#featureBtn');
  await b.page.click('[data-flreset="1"]');
  ck('panel: clearing restores the shipped answer', await b.page.evaluate(function () { return RD.Flags.on('campaign'); }) === true);
  await b.page.click('[data-flch="public"]');
  await b.page.click('#featureClose');
  await closeSettings(b.page);
  ck('panel: view-as public gates the campaign', /COMING SOON/.test(await openMission(b.page, 'campaign')));
  await b.page.reload();
  await b.page.waitForSelector('#mainMenuBtn');
  if (await b.page.isVisible('#missionOverlay')) await b.page.click('#missionClose');
  ck('panel: view-as survives a reload', await b.page.evaluate(function () { return RD.Flags.channel(); }) === 'public');
  ck('panel: the build still knows what it is', await b.page.evaluate(function () { return RD.Flags.baseChannel(); }) === 'dev');
  await openSettings(b.page);
  ck('panel: the way back is still on screen', await b.page.isVisible('#featureRow'));
  await closeSettings(b.page);
  await b.ctx.close();

  // ----------------------------------------------------- the landing page
  /* WHAT THESE ASSERT, AND WHY THEY STOPPED QUOTING SENTENCES (2026-09-13, #742/#744 seam).
   *
   * Until #742 the hero promised "Guided training" behind the `campaign` flag and the fourth
   * feature card carried a "Guided training — coming soon" alternate; the three checks here
   * quoted both phrases. The owner had both removed ("we dont have an instructor yet"), which
   * left all three pinning copy that exists NOWHERE on the page — two of them red, and the
   * third, the public-channel negative `!/Guided training/`, GREEN AND VACUOUS: the exact
   * anti-pattern the #263 note below names, shipped three lines under it.
   *
   * SO WHAT IS GUARDED NOW IS THE MECHANISM AND THE RULE, not the wording. The rule is the one
   * #742 wrote into index.html — "any claim here must rest on a 'public' flag" — and the defect
   * behind it is worth keeping in view: the hero sat on `campaign`, stage 'preview', so every
   * visitor to the RELEASED site read the data-flag-off alternate and never the sentence anyone
   * wrote for them. Nothing in the tree could see that. `run_flags` checks the registry, not the
   * page; a copy check quoting the dev sentence passes while the public channel shows the other
   * one. The enumeration below is over whatever the page actually carries — never a list typed
   * here — so a claim added tomorrow is covered the day it lands. */
  var ctx = await browser.newContext();
  var page = await ctx.newPage();
  await page.goto(LANDING);
  ck('landing dev: the hero carries the walkthrough promise',
    /guided\s+walkthroughs/i.test(await page.textContent('.hero .sub')));
  await ctx.close();

  ctx = await browser.newContext();
  await ctx.addInitScript(pinChannel('public'));
  page = await ctx.newPage();
  await page.goto(LANDING);
  var gated = await page.evaluate(function () {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('[data-flag]'), function (el) {
      var f = el.getAttribute('data-flag');
      out.push({ flag: f, on: RD.Flags.on(f), stage: RD.Flags.stage(f) });
    });
    return out;
  });
  var offPublic = gated.filter(function (g) { return !g.on; });
  ck('landing public: every gated claim rests on a flag the public channel has',
    gated.length > 0 && offPublic.length === 0,
    gated.length === 0
      ? 'the page carries no [data-flag] element at all, so the swap below proves nothing — ' +
        're-point this pair or delete it deliberately'
      : offPublic.map(function (g) { return g.flag + ' (stage ' + g.stage + ')'; }).join(', ') +
        ' — a visitor to the released site reads the data-flag-off alternate here, not the ' +
        'sentence that was written');

  /* THE SWAP ITSELF, PROVEN ON THE PAGE. Without this the check above is satisfied by an
   * `applyDom` that does nothing at all: every flag reads on, no element is ever rewritten, and
   * a landing page that over-promises on the public channel looks identical to a correct one.
   * `?flags=-<id>` is the one-page-load override, so this needs no build and no stamp file. */
  var subFlag = gated.length ? gated[0].flag : null;
  await page.goto(LANDING + (subFlag ? '?flags=-' + subFlag : ''));
  var heroOff = (await page.textContent('.hero .sub')) || '';
  var heroAlt = (await page.getAttribute('.hero .sub', 'data-flag-off')) || '';
  ck('landing public: the alternate swaps in when that flag is forced off',
    !!subFlag && !!heroAlt && !/guided\s+walkthroughs/i.test(heroOff) &&
    heroOff.replace(/\s+/g, ' ').trim() === heroAlt.replace(/\s+/g, ' ').trim(),
    'rendered "' + heroOff.slice(0, 60) + '…" against alternate "' + heroAlt.slice(0, 60) + '…"');
  // REMOVED (#263 item 6): this was `!/The full experience/` on the PWR card, and the
  // phrase has not existed anywhere in the site since the card was rewritten — so the
  // check could never fail. Second vacuous negative in this file; the other was the hero
  // one three lines up. Do not re-add it: the card carries no `data-flag` any more, so it
  // makes no channel-dependent promise to guard, and the over-promise guard now lives
  // where the promise does — the hero negative above and the features coming-soon check.
  // A negative assertion is only worth its line if the pattern still appears SOMEWHERE.
  /* AND REMOVED AGAIN, for the same reason, 2026-09-13: `!/Guided training/` on the hero and
   * `/Guided training — coming soon/` on `.features` both quoted copy #742 deleted. The note
   * above is the standing rule; the block that replaced them is above it. */
  await page.goto(LANDING);
  ck('landing public: the page still sells the plant',
    /Real reactor physics/.test(await page.textContent('.hero .sub')));
  await ctx.close();

  await browser.close();
  console.log('\n' + C.bold + '──────────────────────────────────────────' + C.off);
  console.log(C.bold + (fail ? C.red + 'FLAG UI: FAIL' : C.green + 'FLAG UI: PASS') + C.off +
    '   ' + pass + '/' + (pass + fail) + ' checks');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
