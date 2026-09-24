/* verify_ckl_relevance.js — THE CHECKLIST LIST DESCRIBES THE PLANT THE PLAYER IS IN (#606).
 *
 * Owner playtest, 2026-09-02: "when I started up in mode 5 the mode 5 checklist was greyed
 * out but some where white."
 *
 * The Checklists tab greys a procedure whose entry conditions the live plant does not meet
 * and prints the gate ("Requires RCS temperature near 547 degF"). The verdict itself was
 * always right — measured at Mode 5, only the heatup grades ready. What was wrong is WHEN it
 * was computed: `cklMenuKey` was `engineKey | active procedure id`, and NEITHER changes when
 * the player resets the plant to a different initial condition, so the list built at the
 * default hot_full_power boot survived the switch to Cold Shutdown verbatim — the Mode 5
 * heatup greyed, the at-power legs white, every gate sentence describing a plant that no
 * longer existed.
 *
 * IT NEEDS A BROWSER, which is why it is its own runner and not a check in
 * run_checklist_pwr2. The stale value lived in a closure variable in ui/app.js that Node
 * cannot reach, the rank itself was correct at both ends, and a source scan of either would
 * have read as working. The only thing that can see it is the rendered list before and after
 * the switch.
 *
 * THE DISCRIMINATOR IS THE FLIP, not the Mode 5 reading. Booting straight to
 * ?init=cold_shutdown builds the list once, correctly, and passes on the defect — so this
 * drives the player's own path: boot at the default Hot Full Power, read the list, then pick
 * Cold Shutdown (Mode 5) in the Plant & Mission window and read it again. Measured on the
 * pre-fix build, the second read is byte-identical to the first.
 *
 * Run: node test/verify_ckl_relevance.js
 */
'use strict';
var path = require('path');
var http = require('http');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');
var PORT = 9700 + Math.floor(Math.random() * 40);
var C = { green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  var ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? C.green + '  PASS' : C.red + '  FAIL') + C.off + '  ' + name +
    (note ? C.dim + '  — ' + note + C.off : ''));
}

var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
             '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
             '.md': 'text/plain', '.ico': 'image/x-icon' };

/* The list as the PLAYER sees it: one row per procedure, whether it is greyed, and the gate
 * sentence under it. Read off the rendered DOM — the point of the gate is that the render is
 * where the staleness lived. */
function readMenu(page) {
  return page.evaluate(function () {
    return [].map.call(document.querySelectorAll('#cklMenu button[data-ckl-start]'), function (b) {
      return { id: b.getAttribute('data-ckl-start'),
               gated: b.classList.contains('ckl-gated'),
               gate: ((b.querySelector('.ckl-gate') || {}).textContent || '') };
    });
  });
}
function sig(rows) {
  return rows.map(function (r) { return r.id + (r.gated ? '-' : '+') + r.gate; }).join(';');
}

(async function () {
  var srv = http.createServer(function (rq, rs) {
    var u = decodeURIComponent(rq.url.split('?')[0]); if (u === '/') u = '/index.html';
    var f = path.join(ROOT, u);
    fs.readFile(f, function (e, d) {
      if (e) { rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      rs.end(d);
    });
  });
  await new Promise(function (r) { srv.listen(PORT, r); });

  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });
  var page = await browser.newPage();
  var url = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2';

  try {
    /* ---- 1. the default boot: Hot Full Power (Mode 1) ---------------------------------- */
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.click('[data-mfree]');                  // Free Play, the engine's own default IC
    await page.waitForTimeout(2500);
    await page.click('#tabbar [data-tab="checklists"]');
    await page.waitForTimeout(900);
    var atPower = await readMenu(page);
    var heatM1 = atPower.filter(function (r) { return r.id === 'pwr_heatup'; })[0];
    var raiseM1 = atPower.filter(function (r) { return r.id === 'pwr_raise_power'; })[0];
    var lowerM1 = atPower.filter(function (r) { return r.id === 'pwr_lower_power'; })[0];
    /* SINCE #653 (2026-09-07) THE ASCENSION IS GREY HERE TOO, on purpose: it carries a
     * `control_bank_steps < 600` precondition ("this checklist follows the startup checklist,
     * not a power preset"), and the Hot Full Power preset boots above it. Warns, never blocks —
     * the click test below still proves that. The rampdown is the leg that must read WHITE at
     * power.
     *
     * ⚠ THE REASON WRITTEN HERE WAS STALE AND THE CHECK COULD NOT CATCH IT (#752 unit 3). It
     * said the preset "boots the control bank on its top stop (627), where every WITHDRAW in
     * that leg is a no-op" — true when #653 wrote it, and false since #704 moved the at-power
     * initial conditions off the upper stop. MEASURED on this tree: `hot_full_power` boots at
     * **606 / 627** with boron 612.3 ppm at 100.00 % power, and is still at 606 ten minutes
     * later. The precondition is unchanged and still bites (606 > 600, by 6 steps), so the check
     * passes either way — which is exactly why nothing but a reader could find this. The bank
     * DOES have 21 steps of travel at Hot Full Power; it is not pinned. */
    ck('Mode 1 boot: the list is populated; the Mode 5 heatup and the ascension (preset bank at 606, above its 600 precondition) are greyed, the rampdown is white',
       atPower.length >= 5 && heatM1 && heatM1.gated && raiseM1 && raiseM1.gated && lowerM1 && !lowerM1.gated,
       atPower.length + ' rows; heatup ' + (heatM1 && heatM1.gated ? 'grey' : 'WHITE') +
       ', raise_power ' + (raiseM1 && raiseM1.gated ? 'grey' : 'WHITE') +
       ', lower_power ' + (lowerM1 && lowerM1.gated ? 'GREY' : 'white'));

    /* THE INCIDENT WALKTHROUGH IS THE ROW THAT MUST BE WHITE AT FULL POWER (#670 Phase 2).
     * It starts from Hot Full Power and its only entry condition is REACTOR POWER above 90 %,
     * so at the Mode 1 boot it is offered and at Mode 5 it is greyed (asserted by the "every
     * other leg is greyed" check below, which counts exactly one white row). It is also the
     * LAST row, by category rather than by luck — see the CYCLE literal. */
    var tmiM1 = atPower.filter(function (r) { return r.id === 'pwr_tmi2_incident'; })[0];
    ck('Mode 1 boot: the TMI-2 incident walkthrough is listed, LAST, and white (#670)',
       !!tmiM1 && !tmiM1.gated && atPower[atPower.length - 1].id === 'pwr_tmi2_incident',
       tmiM1 ? (tmiM1.gated ? 'GREYED: ' + tmiM1.gate : 'white') + ', position ' +
               (atPower.map(function (r) { return r.id; }).indexOf('pwr_tmi2_incident') + 1) +
               ' of ' + atPower.length
             : 'row missing from the list');

    /* ---- 2. the player switches to Cold Shutdown (Mode 5) ------------------------------ */
    /* Through the Plant & Mission window, which is the only path a player has to a different
     * initial condition. A fresh load lands on that window, so reloading IS the player's
     * gesture — what matters to the defect is that the engine does not change across it. */
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.click('[data-mmode="free"]');
    await page.waitForTimeout(200);
    await page.click('[data-minit="cold_shutdown"]');
    await page.waitForTimeout(200);
    await page.click('[data-mfree]');
    await page.waitForTimeout(3000);
    await page.click('#tabbar [data-tab="checklists"]');
    await page.waitForTimeout(1200);
    var mode5 = await readMenu(page);

    ck('THE LIST RE-GRADES ON THE PLANT SWITCH (#606 — this was byte-identical before)',
       sig(mode5) !== sig(atPower),
       sig(mode5) === sig(atPower) ? 'IDENTICAL to the Mode 1 list' : 'verdict changed');

    /* THE ORDER IS THE OPERATING CYCLE *(OWNER, 2026-09-02, #606: "the checklists should be
     * in a logical order. ie, starting in mode 5 it should start with mode 5 to mode 3 and end
     * with mode 3 to mode 5")*.
     *
     * The within-category tiebreak was `title.localeCompare`, and these titles begin with the
     * mode they START FROM — so "Mode 3, Hot Standby -> Mode 1" sorted above "Mode 5, Cold
     * Shutdown -> Mode 3" and STARTUP listed its second leg first; POWER inverted the same way
     * ("load rampdown" above "power ascension"); SHUTDOWN was right by luck. Measured pre-fix:
     * startup, heatup, lower_power, raise_power, shutdown, cooldown.
     *
     * The expected sequence is written out LITERALLY rather than read back off the pool,
     * because reading it off the same array the renderer sorts by would assert nothing. It is
     * the pool's declaration order, which run_checklist_pwr2 independently gates against the
     * `next` chain — so if this list and that chain ever disagree, one of the two reddens. */
    /* THE TMI-2 INCIDENT WALKTHROUGH LISTS AFTER ALL SIX (#670 Phase 2). Its category is
     * `incident`, which is last in `CKL_CAT_ORDER`, so it cannot land between two cycle legs
     * however the pool is later re-typed. Written into the literal for the reason the paragraph
     * above gives — reading the expected order off the pool would assert nothing. */
    var CYCLE = ['pwr_heatup', 'pwr_startup', 'pwr_raise_power', 'pwr_lower_power',
                 'pwr_shutdown', 'pwr_cooldown', 'pwr_tmi2_incident'];
    var order = mode5.map(function (r) { return r.id; });
    ck('the list runs the plant operating cycle: Mode 5 -> Mode 3 first, Mode 3 -> Mode 5 last, the incident after all six',
       order.join(',') === CYCLE.join(','), order.join(' -> '));
    ck('and the same order at Mode 1 — it is a STANDARD order, not one recomputed from the plant',
       atPower.map(function (r) { return r.id; }).join(',') === order.join(','),
       atPower.map(function (r) { return r.id; }).join(' -> '));

    var heat = mode5.filter(function (r) { return r.id === 'pwr_heatup'; })[0];
    ck('Mode 5: the Mode 5 heatup is the WHITE row',
       heat && !heat.gated, heat ? (heat.gated ? 'greyed: ' + heat.gate : 'white') : 'row missing');
    ck('Mode 5: every other leg is greyed AND states its gate',
       mode5.filter(function (r) { return !r.gated; }).length === 1 &&
       mode5.every(function (r) { return r.gated ? !!r.gate : true; }),
       mode5.filter(function (r) { return !r.gated; }).map(function (r) { return r.id; }).join(',') + ' white');

    /* ---- 3. a greyed row is still startable, and says why ------------------------------ */
    /* WARN, NEVER BLOCK (owner ruling 2026-08-06) *(and OWNER, 2026-09-02: "you should still
     * be able to click on the non relevant checklist but it should say its not applicable to
     * the current mode at the top")*. The cooldown is the honest subject: it is greyed at
     * Mode 5 because the plant is already cold. */
    await page.click('#cklMenu button[data-ckl-start="pwr_cooldown"]');
    await page.waitForTimeout(2500);
    var banner = await page.evaluate(function () {
      var log = document.querySelector('#cklLog');
      var cau = log ? log.querySelector('.m-caution') : null;
      return { running: !!log, text: cau ? cau.textContent : null };
    });
    /* ---- 4. the running checklist fills its column, and owns the only scroller ---------- */
    /* #612, owner playtest 2026-09-03: "the right column scroll window should go to the bottom of
     * the column. There is currently an unused black space below it." #607 moved the running
     * checklist into the CHECKLISTS pane, which is a plain content-sized `.tabpane` — so it never
     * got the height treatment `.tabpane.instructor` has had since the transcript needed it.
     * Measured before the fix at 1600x950: the pane ended 189 px short of the viewport and the log
     * was capped at 456 px by `.ckl-log { max-height: 48vh }`.
     *
     * The threshold is a BAND, not the measured number: the gap is padding plus the tools card's
     * own chrome, so pinning 19 px would re-red on any spacing change. 60 px is comfortably below
     * the 189 px defect and comfortably above the chrome. */
    var lay = await page.evaluate(function () {
      var log = document.getElementById('cklLog');
      /* the run lives in the INSTRUCTOR pane since #660 item 15 — measure the pane that holds it */
      var pane = log ? log.closest('.tabpane') : null;
      var chain = [], el = log;
      while (el && el !== document.documentElement) {
        var ov = getComputedStyle(el).overflowY;
        if ((ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight + 1) chain.push(el.id || el.className);
        el = el.parentElement;
      }
      var r = pane ? pane.getBoundingClientRect() : null;
      return { gap: r ? Math.round(window.innerHeight - r.bottom) : null,
               logH: log ? log.clientHeight : 0, scrollers: chain };
    });
    ck('the running checklist reaches the bottom of its column (#612)',
       lay.gap !== null && lay.gap < 60,
       'gap below the pane: ' + lay.gap + ' px (was 189 before the fix); log ' + lay.logH + ' px');
    /* A GUARD, NOT EVIDENCE. Measured: this passes on the PRE-FIX build too — `.tab-body`'s
     * content happened to fit, so the second scroller the layout permits never materialised.
     * It is kept because a nested scroller is what would make the log's saved scroll position
     * meaningless (only the log's is restored), and nothing else would notice. It can only ever
     * catch a FUTURE regression; it is not proof that anything was fixed. */
    ck('GUARD: the log is the only scroller in the column (#612 — passes pre-fix too; one step drawn may need none, #660)',
       lay.scrollers.length <= 1,
       lay.scrollers.length ? lay.scrollers.join(' > ') : 'none scrollable');

    ck('a greyed checklist still STARTS when clicked (warn, never block)', banner.running);
    ck('and it names the mode the plant is actually in, at the top',
       !!banner.text && /Not applicable in Mode 5, Cold Shutdown/.test(banner.text),
       banner.text ? banner.text.slice(0, 80) : 'no caution banner');
    /* #606 adjacent (2026-09-05): the detail line under that headline printed the raw param and
     * SI-only numbers — "wants tavg_c ≈ 286, reads 50.2" — and, once it went through the criteria
     * formatter, the 8 °C band came out as 46 °F (the temp converter's +32 on a DIFFERENCE). The
     * cooldown's entry row is Tavg near 547 °F on a 122 °F plant, so the line must read US-first,
     * name no internal, and put the band at 14 °F. */
    var detail = banner.text ? banner.text.replace(/\s+/g, ' ') : '';
    /* THE SI PAIRS CAME OUT OF THIS ASSERTION (#670 operator pass 2, S-10), and nothing else did.
     * It used to require "within 14 °F (8 °C) of 547 °F (286 °C)". The owner's 2026-09-06 ruling
     * retired the pair from live checklists, so the parenthesised halves went.
     *
     * THE FORM MOVED AGAIN AT #653 product defect 3 (2026-09-11): a tolerance is arithmetic the
     * player has to do, so `fmtPredicate` now prints the two ENDS — "AVG COOLANT TEMPERATURE 532
     * to 561 °F". Every claim this check was written for survives and is pinned HARDER, not
     * refitted, and the tolerance trap is the reason:
     *
     *   the ±8 °C band, converted as a DIFFERENCE and applied to 547 °F  ->  532 to 561 °F
     *   the same band run through the `temp` converter's +32 (the bug)   ->  501 to 593 °F
     *
     * so the endpoints discriminate the defect at least as sharply as the old "14 °F" did, and
     * they additionally pin the ANCHOR, which the old form carried in a separate clause. What is
     * NOT asserted any more is the literal word "within" — that was the thing the owner's own
     * reviewers objected to, so pinning it would have been pinning the defect. VERIFIED against
     * the OLD behaviour as HR10 requires: the pre-#653 render is
     * "within 14.4 °F of 547 °F", which this regex REJECTS (no "532 to"), so this is a
     * statement about the new form and says so. */
    ck('...and the detail line is player-facing: US-only, no raw param, the 8 °C tolerance drawn as a 532-561 °F BAND',
       /* the label is the TILE's word since #653 pass 3 (PRED_DISPLAY: AVG COOLANT TEMPERATURE, not Tavg) */
       /wants AVG COOLANT TEMPERATURE 532(\.\d)? to 561(\.\d)? °F, reads 12\d(\.\d)? °F/.test(detail) &&
       !/tavg_c/.test(detail) && !/°C|MPa/.test(detail),
       detail ? detail.replace(/^.*?—/, '').slice(0, 120) : 'no banner text');
    /* ---- 3b. THE ENTRY BANNER NEVER RETURNS MID-CHECKLIST (#614) ----------------------- */
    /* Owner playtest 2026-09-03: "the not applicable to this mode warning… erroneously appears
     * in the middle of the mode 5-3 checklist when it gets to mode 4. This should only appear
     * when first opening a checklist and should never appear in the middle of a checklist."
     *
     * THIS WAS THE SCROLL BOUNCE. `precond` are ENTRY conditions — the heatup's are `tavg_c < 95`
     * and friends, true of the cold plant you start on and false the moment you heat it — so a
     * banner rendered from LIVE verdicts vanished and reappeared as the plant crossed
     * Mode 5 -> 4 -> 3, changing the panel's height under the reader every time.
     *
     * DRIVABLE, because the checklist advances itself: pwr_heatup's first step is an observation
     * (`plant_mode ~ 5`) that is already true on a Mode 5 boot, so it checks off within a couple
     * of broadcasts and `step_index` leaves 0 with no plant driving at all. That is what made
     * this assertable when nothing else about a live advance was. */
    await page.click('[data-ckl-stop]').catch(function () {});
    await page.waitForTimeout(400);
    await page.click('#tabbar [data-tab="checklists"]');   // the list is its own tab now (#660 item 15)
    await page.waitForTimeout(300);
    await page.click('#cklMenu button[data-ckl-start="pwr_heatup"]');
    await page.waitForTimeout(3500);
    /* EVERY STEP WAITS FOR CONTINUE since #660 item 16: the opening confirm satisfies itself on
     * the cold plant and lights the button; the player's press is part of this fixture now. */
    await page.click('.wt-continue:not([disabled])').catch(function () {});
    await page.waitForTimeout(800);
    var run = await page.evaluate(function () {
      var log = document.getElementById('cklLog');
      return { banner: !!(log && log.querySelector('.m-caution')),
               idx: (window.__lastCklIdx === undefined ? null : window.__lastCklIdx),
               /* one step is drawn at a time (#660 item 15): the header carries the index */
               stepno: log ? ((log.querySelector('.ckl-stepno') || {}).textContent || '') : '',
               active: log ? !!log.querySelector('.ckl-active') : false };
    });
    var stepNo = +(/Step (\d+)/.exec(run.stepno) || [0, 0])[1];
    ck('the heatup advanced off step 0 on its own (the fixture is not vacuous)',
       run.active && stepNo > 1, '"' + run.stepno + '", active step present');
    /* A GUARD, NOT EVIDENCE — and the distinction cost a rewrite to see. The heatup's
     * preconditions are MET at Mode 5, so "no banner" is true here on the pre-fix build too;
     * this cannot fail on the defect it was written for. The discriminating test would need the
     * plant driven ACROSS a mode boundary mid-checklist (Mode 5 -> 4 is where the owner saw it),
     * which nothing in this harness can do — three attempts at driving a live advance failed.
     * What it does catch is a future change that starts rendering the banner unconditionally. */
    ck('GUARD: no entry banner mid-checklist (#614 — vacuous here; the heatup enters with its ' +
       'preconditions met, so this passes pre-fix too)',
       run.banner === false, run.banner ? 'a .m-caution banner is present mid-checklist' : 'none');

    /* ---- 3c. NO WALKTHROUGH DRAWS A CAUTION BLOCK — THE RULING, PINNED (#755 item 2) --------
     *
     * ⚠ THIS SECTION USED TO ASSERT THE OPPOSITE, AND ITS SUBJECT IS GONE. #653 product defect 1
     * was that `pr.cautions` rendered in exactly one place — `mProcCard`, the Manual tab's browse
     * card — so every caution on every leg was off-screen from the moment the walkthrough started;
     * two checks here then pinned the heatup's three cautions being DRAWN, collapsed, and opening
     * to reach "100 °F per hour". On 2026-09-14 the owner's own authored walkthrough source
     * (`Blueprint/WALKTHROUGH_STEPS_OWNER.md`) carried no caution block at all and #755 item 2
     * removed the `cautions` array from all seven pwr2 legs. A check cannot assert the presence of
     * content the author has deleted, so those two go with it — 29 checks to 28.
     *
     * WHAT REPLACES THEM IS A PIN ON THE RULING, NOT A HOLLOW ABSENCE. It reads the RENDERED panel
     * exactly as its predecessors did and reddens the moment any pwr2 leg authors a caution again,
     * which is the only way the removal can be undone by accident. Discriminating by construction:
     * restoring `cautions` to `pwr_heatup` in ui/manual_procedures.js reds it and prints the
     * summary text. It says NOTHING about the renderer, which now has no live subject in this
     * pool — if the owner rules cautions back in, this check inverts and the #653 pair above is
     * what should come back, not a rebanding of this one. */
    var caut = await page.evaluate(function () {
      var log = document.getElementById('cklLog');
      var sum = log && log.querySelector('[data-ckl-cautions]');
      return { sum: sum ? sum.textContent.replace(/\s+/g, ' ').trim() : null,
               lines: log ? log.querySelectorAll('.ckl-caut-l').length : 0 };
    });
    ck('no caution block is drawn on a running walkthrough — the #755 item 2 ruling, pinned',
       caut.sum === null && caut.lines === 0,
       caut.sum ? 'a caution summary is back: "' + caut.sum + '" · ' + caut.lines + ' lines'
                : 'none drawn, and the pwr2 pool authors none');

    /* ---- 3d. THE DETAILS PARAGRAPH IS LABELLED (#692 item 3, #687 item 4) -------------------
     * *(OWNER, 2026-09-09: "The why text needs to have some indication that its extra learning
     * info not actually a step. Maby but it in a buttle and label it appropriately?")*
     *
     * A SOURCE SCAN CANNOT MAKE THIS CLAIM — the label is composed in `renderChecklist`, and the
     * pool carries no such string, so grepping `ui/app.js` for "Why this step" would pass on a
     * branch that never runs. The active step's details are force-open since #660 item 3, so the
     * label is on screen whenever a `why` is.
     *
     * INJECTION, run 2026-09-11: drop the `<span class="ckl-why-lbl">` from the `st.why` branch
     * and this goes red while the `why` text itself still renders — i.e. it pins the LABEL, not
     * the paragraph. */
    /* THE LITERAL IS GONE FROM THIS ASSERTION (#741). It read `lbl === 'Why this step'`, which
     * pins DISPLAY TEXT: every future wording change reds a gate that is not about wording, and
     * the cheapest way out is to edit the gate — which trains people to treat it as noise. The
     * claim is "the block is labelled and the label is a LEGEND, not prose", so that is what it
     * asserts now: present, non-empty, short enough to be a heading, and not a restatement of the
     * paragraph. The #692/#741 wording is free to change without touching this file.
     * IT STILL PINS THE LABEL AND NOT THE PARAGRAPH — the #653 injection is unchanged: drop the
     * `<span class="ckl-why-lbl">` and `lbl` is null while `body` still measures the prose.
     * AND IT IS ALSO THE BOX CHECK NOW (#741, owner 2026-09-13: "Put it in its own box, move it
     * slightly away from the work steps"). Both halves are read off computed style on the
     * RENDERED element, never off the stylesheet or a hook that recomputes them: a border on all
     * four sides distinguishes the box from the left-rule it replaced, and the top margin is what
     * "move it slightly away" means in pixels. Measured on this tree at 12 px; banded at >= 10 so
     * a spacing tweak does not red it but reverting to the old 6 px does. */
    var whyLbl = await page.evaluate(function () {
      var log = document.getElementById('cklLog');
      var w = log && log.querySelector('.ckl-why');
      var l = w && w.querySelector('.ckl-why-lbl');
      var cs = w ? getComputedStyle(w) : null;
      return { hasWhy: !!w, lbl: l ? l.textContent.trim() : null,
               body: w ? w.textContent.replace(/\s+/g, ' ').trim().length : 0,
               borders: cs ? [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth] : null,
               marginTop: cs ? parseFloat(cs.marginTop) : null };
    });
    var lblOk = !!whyLbl.lbl && whyLbl.lbl.length >= 4 && whyLbl.lbl.length <= 40 &&
                whyLbl.lbl.length < whyLbl.body;
    ck('the active step\'s why is LABELLED as extra learning material, not left as a bare grey paragraph',
       whyLbl.hasWhy && lblOk && whyLbl.body > 40,
       whyLbl.hasWhy ? ('label ' + JSON.stringify(whyLbl.lbl) + ', ' + whyLbl.body + ' chars')
                     : 'no .ckl-why on the active step');
    var allBordered = !!whyLbl.borders && whyLbl.borders.every(function (b) { return parseFloat(b) > 0; });
    ck('...and it is a BOX set apart from the work rows — bordered on all four sides, and moved away (#741)',
       whyLbl.hasWhy && allBordered && whyLbl.marginTop >= 10,
       whyLbl.hasWhy ? ('borders ' + JSON.stringify(whyLbl.borders) + ', margin-top ' + whyLbl.marginTop + 'px')
                     : 'no .ckl-why on the active step');

    /* ---- 5. EVERY PIXEL OF A NUMBER TILE TYPES INTO ITS BOX (#615) --------------------- */
    /* Owner playtest 2026-09-03: "I'm unable to type into any field (number boxes and the
     * feedback form)". #605 made the FRAME focus the input; measured at 1366x768 the tiles are
     * 48x28 around a 48x18 frame, so a ~10 px LABEL BAND across the top — up to 731 px2, better
     * than a third of the tile — was outside every handler. A click there focuses nothing,
     * activeElement stays on BODY, and the digits go to the GLOBAL shortcuts, where 2/3/5 are
     * time acceleration. That is the "2235 ended at 3600x" the standing trap list records.
     *
     * It lives in this browser runner because one is already open here; a second Playwright
     * gate costs ~16 s for a single assertion. Injection-verified: BODY / keystrokes lost
     * before the fix, INPUT / "2235" after. */
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1300);
    await page.click('[data-mfree]');
    await page.waitForTimeout(2400);
    var band = await page.evaluate(function () {
      var hit = null;
      [].forEach.call(document.querySelectorAll('.bd-num-frame'), function (f) {
        if (hit) return;
        var tile = f.closest('.bd-tile') || f.parentElement;
        var fb = f.getBoundingClientRect(), tb = tile.getBoundingClientRect();
        var top = fb.top - tb.top, bot = tb.bottom - fb.bottom;
        if (top > 6) hit = { x: Math.round(tb.left + tb.width / 2), y: Math.round(tb.top + top / 2), px: Math.round(top) };
        else if (bot > 6) hit = { x: Math.round(tb.left + tb.width / 2), y: Math.round(fb.bottom + bot / 2), px: Math.round(bot) };
      });
      return hit;
    });
    if (!band) {
      ck('a number tile has a band outside its frame (the fixture is not vacuous)', false,
         'no tile has one — the geometry changed; re-derive this check');
    } else {
      await page.mouse.click(band.x, band.y);
      await page.keyboard.type('2235');
      var landed = await page.evaluate(function () {
        var a = document.activeElement;
        return { tag: a ? a.tagName : null, val: (a && a.value !== undefined) ? a.value : null };
      });
      ck('clicking a number tile OUTSIDE its frame still types into the box (#615)',
         landed.tag === 'INPUT' && /2235/.test(String(landed.val || '')),
         band.px + ' px band; focus landed on ' + landed.tag +
         (landed.tag === 'INPUT' ? ' value ' + landed.val : ' — keystrokes lost to the global shortcuts'));
    }

    /* ---- 6. THE REWIND BUTTON FOLLOWS THE RING, ON THE BOARD (#660 items 17-18) -------- */
    /* `rewind_ready` is computed in M5 and gated in Node by run_checklist — but whether the
     * BUTTON follows it is a render question, and the checklist card is key-cached. Measured
     * here before `rewind_ready` joined that key: the snapshot read false and the button stayed
     * ENABLED, because nothing else in the key had moved. Exactly #606's shape, one card over.
     *
     * The ring is emptied directly rather than by loading a save file: what the button reads is
     * `checkpoints.length`, and a file dialog is not reachable from here. `?dev=1` is what
     * hands a harness the live service (ui/app.js) — the button is still read off the DOM. */
    await page.goto(url + '&dev=1', { waitUntil: 'load' });
    await page.waitForTimeout(1300);
    await page.click('[data-mmode="free"]');
    await page.waitForTimeout(200);
    await page.click('[data-minit="hot_full_power"]');
    await page.waitForTimeout(200);
    await page.click('[data-mfree]');
    await page.waitForTimeout(2600);
    await page.click('#tabbar [data-tab="checklists"]');
    await page.waitForTimeout(700);
    await page.click('button[data-ckl-start="pwr_lower_power"]');
    await page.waitForTimeout(2200);
    function readRw(pg) {
      return pg.evaluate(function () {
        var b = document.querySelector('.wt-rewind');
        var svc = window.RD && RD.__dev && RD.__dev.service ? RD.__dev.service() : null;
        var c = (svc && svc.instructor && svc.instructor.getSnapshotBlock)
          ? (svc.instructor.getSnapshotBlock().checklist || {}) : {};
        return { present: !!b, disabled: b ? !!b.disabled : null,
                 idx: c.step_index, ready: !!c.rewind_ready, ring: svc ? svc.checkpoints.length : null };
      });
    }
    var rw0 = await readRw(page);
    await page.evaluate(function () { RD.__dev.service().handleCommand({ action: 'checklist_check', index: 0 }); });
    await page.waitForTimeout(1200);
    var rw1 = await readRw(page);
    ck('Rewind is dark on step 0 and lights on step 1, with the ring behind it (#660 items 17-18)',
       rw0.present && rw0.disabled === true && rw0.ready === false &&
       rw1.disabled === false && rw1.ready === true && rw1.ring === rw0.ring + 1,
       'step 0: ' + (rw0.disabled ? 'dark' : 'LIT') + ' ready ' + rw0.ready + ' ring ' + rw0.ring +
       ' → step 1: ' + (rw1.disabled ? 'DARK' : 'lit') + ' ready ' + rw1.ready + ' ring ' + rw1.ring);
    await page.evaluate(function () { var s = RD.__dev.service(); s.checkpoints = []; s.tick(); });
    await page.waitForTimeout(900);
    var rw2 = await readRw(page);
    ck('...and goes dark again the moment the ring is gone, which is what loading a save does',
       rw2.idx === 1 && rw2.ring === 0 && rw2.ready === false && rw2.disabled === true,
       'step ' + rw2.idx + ', ring ' + rw2.ring + ', ready ' + rw2.ready + ', button ' +
       (rw2.disabled ? 'dark' : 'STILL LIT — the render key does not carry rewind_ready'));

    /* ---- 7. NO SI IN THE LIVE CHECKLIST PANEL, AS RENDERED (#670 operator pass 2, S-10) --
     *
     * OWNER RULING (2026-09-06): "DO not include SI. There will be an option to switch between
     * imperial and SI but i dont think thats been implemented yet."
     *
     * `run_style`'s `checklist_no_si` already walks every AUTHORED string of the pool and it was
     * green while the panel printed "> 240 degF (116 degC)" on the TMI-2 leg's step 4. The SI was
     * never authored: `fmtPredValue` in ui/app.js COMPOSED it, from a numeric `v` and a unit
     * table, for any predicate carrying a `dim` and no `label` to render instead. 18 sites across
     * four walkthroughs, six of them precondition-banner lines. A source scan of the pool cannot
     * see a string that is concatenated in another file at render time, which is why this check
     * is HERE, in the browser, reading the panel the player reads.
     *
     * THE FIXTURE IS THE HEATUP STARTED AT FULL POWER, deliberately: both of its preconditions
     * fail (tavg_c < 95, pressure_mpa < 5), so ONE render exercises both SI paths at once — the
     * precondition banner's "wants ... , reads ..." line and the active step's own criteria line.
     * The list warns rather than blocks, so the click is a real player gesture.
     *
     * PROVEN RED BY INJECTION: restoring the SI tail to fmtPredValue
     * (`return usTxt + ' (' + ... + siU + ')'`) reddens this AND the detail-line check above it,
     * reporting the offending line verbatim -- "wants AVG COOLANT TEMPERATURE < 203 degF
     * (95 degC), reads 579 degF (304 degC)". */
    await page.goto(url + '&dev=1', { waitUntil: 'load' });
    await page.waitForTimeout(1300);
    await page.click('[data-mmode="free"]');
    await page.waitForTimeout(200);
    await page.click('[data-minit="hot_full_power"]');
    await page.waitForTimeout(200);
    await page.click('[data-mfree]');
    await page.waitForTimeout(2600);
    await page.click('#tabbar [data-tab="checklists"]');
    await page.waitForTimeout(700);
    await page.click('button[data-ckl-start="pwr_heatup"]');
    await page.waitForTimeout(2200);
    var si = await page.evaluate(function () {
      var el = document.getElementById('cklRun');
      var txt = el ? (el.innerText || '') : '(#cklRun not rendered)';
      var bad = txt.split(String.fromCharCode(10)).filter(function (l) { return /MPa|kPa|°C/.test(l); });
      return { len: txt.length, bad: bad, hasBanner: /wants /.test(txt) };
    });
    ck('the live checklist panel renders NO SI - the rendered line, not the authored string (#670 S-10)',
       si.len > 200 && si.bad.length === 0,
       si.len <= 200 ? 'panel did not render: ' + si.len + ' chars'
                     : (si.bad.length ? si.bad.length + ' offending line(s): ' + si.bad.join(' | ').slice(0, 200)
                                      : 'clean over ' + si.len + ' chars' + (si.hasBanner ? ', precondition banner drawn' : ', NO banner — fixture may have stopped covering the banner path')));

    /* ---- 6. THE LETTERED SUBSTEP ROWS, ON THE RENDERED PANEL (#741) --------------------
     * *(OWNER RULING, 2026-09-13: "1:A, 2:A, 3:a now." — option A being: extend the browser gate
     * to assert the rows actually draw.)*
     *
     * THIS WAS THE ONE PIECE OF NEW PLAYER-FACING UI WITH NOTHING BEHIND IT. #741 shipped the
     * prefixes and the two-line row asserted only on the AUTHORING side; nothing read the panel.
     *
     * WHY THE OBVIOUS ROUTE DOES NOT WORK, so the next person does not spend the afternoon I did.
     * Two attempts at driving a real leg deep enough to reach a multi-row step both failed:
     *   - NO LEG HAS ONE EARLY. Measured on all seven pwr2 legs: every first step draws zero or
     *     one row, so the panel at load never exercises this.
     *   - PRESSING CONTINUE IS NOT DRIVING. Continue lights only when the step's acceptance is
     *     MET, and those acceptances want the plant operated (load set, rods pulled). A loop that
     *     only clicks Continue stalls on step 2 for ever.
     *   - and Playwright's default 30 s click timeout turns each miss in such a loop into half a
     *     minute, which is what made the second attempt look like a hang rather than a stall.
     *
     * SO THE FIXTURE IS A SYNTHETIC LEG, pushed into the live pool before it is started — the
     * idiom `run_checklist.js` already uses for `zz_pause_probe`. The subject here is the
     * RENDERER, not the content: what has to be true is that `renderChecklist` honours `hidden`,
     * draws one row per visible entry with a letter off the STEP's number, carries each row's own
     * met state, and draws the `ask` above its done-when. A hand-built step exercises every one of
     * those in a single paint, on the first step of the leg, deterministically.
     *
     * IT READS THE RENDERED DOM, never a hook that recomputes a row — the trap that let a single
     * production line be deleted elsewhere in this repo with every check still green. */
    await (async function () {
      async function paint(mutate) {
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        await page.evaluate(function (mode) {
          var P = window.RD.MANUAL_PROCEDURES.pwr2;
          P = P.filter(function (x) { return x.id !== 'zz_row_probe'; });
          window.RD.MANUAL_PROCEDURES.pwr2 = P;
          /* met-at-boot / hidden / unmet-with-ask / unmet-plain — one of each shape the
           * renderer branches on. `power_pct > -1` is true on any plant; `< -1` never is. */
          var accs = [
            { p: 'power_pct', op: '>', v: -1, label: 'This one is already met' },
            { cmd: { action: 'set_spray', open: true, pct: 50 }, label: 'Hidden twin', hidden: true },
            { p: 'power_pct', op: '<', v: -1, ask: 'Do the first thing.', label: 'The first done-when' },
            { p: 'power_pct', op: '<', v: -1, label: 'The second done-when' }
          ];
          if (mode === 'unhide') delete accs[1].hidden;
          if (mode === 'single') accs = [accs[0]];
          if (mode === 'noask') delete accs[2].ask;
          /* the ordered variant drops the hidden cmd twin, which would otherwise be the blocking
           * row (a cmd entry is unmet until it is pressed) and put EVERY visible row behind it */
          if (mode === 'ordered') accs.splice(1, 1);
          P.push({ id: 'zz_row_probe', category: 'control', manual_ref: 'ZZ-01',
                   title: 'Row probe', purpose: 'Render fixture.', from: 'hot_full_power',
                   steps: [{ text: 'A step with several rows.', why: 'Fixture.',
                             control: '(observe)', accs: accs,
                             accs_ordered: mode === 'ordered' || undefined }] });
        }, mutate);
        await page.click('[data-mmode="free"]', { timeout: 4000 }).catch(function () {});
        await page.waitForTimeout(200);
        await page.click('[data-mfree]', { timeout: 4000 }).catch(function () {});
        await page.waitForTimeout(2600);
        await page.click('#tabbar [data-tab="checklists"]', { timeout: 4000 });
        await page.waitForTimeout(700);
        await page.click('button[data-ckl-start="zz_row_probe"]', { timeout: 4000 });
        await page.waitForTimeout(2200);
        return page.evaluate(function () {
          var card = document.querySelector('.ckl-step.ckl-active');
          if (!card) return null;
          return [].map.call(card.querySelectorAll('.ckl-crit'), function (r) {
            var n = r.querySelector('.ckl-crit-n'), when = r.querySelector('.ckl-crit-when');
            return { tag: n ? n.textContent.trim() : null,
                     when: when ? when.textContent.trim() : null,
                     met: r.classList.contains('ckl-crit-met'),
                     wait: r.classList.contains('ckl-crit-wait'),
                     text: r.textContent.replace(/\s+/g, ' ').trim() };
          });
        });
      }

      var base = await paint(null);
      ck('#741 render: one row per VISIBLE entry — the hidden twin is graded but not drawn',
         !!base && base.length === 3 && !base.some(function (r) { return /Hidden twin/.test(r.text); }),
         base ? base.length + ' rows: ' + base.map(function (r) { return JSON.stringify(r.text.slice(0, 28)); }).join(', ')
              : 'the probe leg did not render');
      ck('...lettered a/b/c off the STEP number, in order, counting visible rows not array slots',
         !!base && base.length === 3 && base[0].tag === '1a' && base[1].tag === '1b' && base[2].tag === '1c',
         base ? 'tags ' + JSON.stringify(base.map(function (r) { return r.tag; })) : 'no rows');
      ck('...each row carries its OWN met state, not the step\'s',
         !!base && base[0].met === true && base[1].met === false && base[2].met === false &&
         /✓/.test(base[0].text) && /○/.test(base[1].text),
         base ? 'met flags ' + JSON.stringify(base.map(function (r) { return r.met; })) : 'no rows');
      ck('...and a row with an `ask` draws the instruction AND its done-when, two lines',
         !!base && base[1].when === 'The first done-when' && /Do the first thing\./.test(base[1].text) &&
         base[0].when === null && base[2].when === null,
         base ? 'row 1b when=' + JSON.stringify(base[1].when) : 'no rows');

      /* THREE FIXTURE VARIANTS, each against a different renderer branch: `hidden`, the
       * `visN > 1` suppression, and the `ask` second line. They are titled VARIANT and not
       * "red by injection" on purpose — they mutate the POOL, so they prove the renderer honours
       * each branch, not that these checks can fail. THAT proof is against the PRODUCTION
       * renderer and is recorded in run_all's BASELINES entry: deleting the prefix span reds 2,
       * dropping the `if (en.hidden) continue` reds 4, forcing `ckl-crit-met` on reds 1. Rerun
       * those three if you touch the loop in ui/app.js. */
      var unhid = await paint('unhide');
      ck('...VARIANT: un-hiding the twin draws a fourth row and re-letters to d',
         !!unhid && unhid.length === 4 && unhid[3].tag === '1d',
         unhid ? unhid.length + ' rows, tags ' + JSON.stringify(unhid.map(function (r) { return r.tag; })) : 'no rows');
      var single = await paint('single');
      ck('...VARIANT: a ONE-row step draws no letter at all (the visN > 1 suppression)',
         !!single && single.length === 1 && single[0].tag === null,
         single ? single.length + ' row, tag ' + JSON.stringify(single[0].tag) : 'no rows');
      var noask = await paint('noask');
      ck('...VARIANT: dropping the `ask` drops the second line and leaves the done-when',
         !!noask && noask.length === 3 && noask[1].when === null && /The first done-when/.test(noask[1].text),
         noask ? 'row 1b when=' + JSON.stringify(noask[1].when) + ', text ' + JSON.stringify(noask[1].text.slice(0, 40)) : 'no rows');

      /* #756: THE CARD HAS TO SAY WHICH ROW IS LIVE, or an ordered step is a button that silently
       * does nothing. Same three-row fixture, `accs_ordered` on: row a is met, row b is the one
       * the player is on, row c is BEHIND the sequencer. Read off the rendered card, because the
       * runtime's per-row `met` bits are what run_checklist_pwr2 2x asserts and this is the other
       * end of the wire. The comparison against `base` above is the discriminator: the same
       * fixture WITHOUT the flag draws row c identically to row b. */
      var ordr = await paint('ordered');
      ck('#756 render: a row still behind the sequencer is drawn muted, with no done-when',
         !!ordr && ordr.length === 3 && ordr[2].wait === true && ordr[2].when === null &&
         /·/.test(ordr[2].text) && !/○/.test(ordr[2].text),
         ordr ? 'row 1c wait=' + ordr[2].wait + ' when=' + JSON.stringify(ordr[2].when) +
                ' text ' + JSON.stringify(ordr[2].text.slice(0, 34)) : 'no rows');
      ck('...and the row the player is ON keeps the live treatment: not muted, ask + done-when',
         !!ordr && ordr[0].met === true && ordr[1].wait === false && ordr[1].when === 'The first done-when' &&
         /○/.test(ordr[1].text) && /Do the first thing\./.test(ordr[1].text) &&
         base[2].wait === false,
         ordr ? 'row 1b wait=' + ordr[1].wait + ' when=' + JSON.stringify(ordr[1].when) +
                '; UNORDERED row 1c wait=' + base[2].wait : 'no rows');
    })();


    /* ---- 7. A STEP OPENS SHOWING ITS OWN BEGINNING (#653, layman pass 2026-09-15) ------
     *
     * Reported and then re-measured on the SHIPPED pool: `pwr_startup` step 9 (note 2,103
     * characters) opened at `scrollTop 144` in a 728 px log, first visible words mid-sentence
     * ("...stop, and the step to use the speed buttons on..."), with the step number, the
     * instruction and the done-when all above the fold. The cause is the minimal-scroll idiom in
     * `renderChecklist`: advancing forward, the new step is always BELOW the viewport, so the
     * bottom-align branch is the only one that can run — correct while the step FITS, and
     * exactly wrong once it does not.
     *
     * A SYNTHETIC TWO-STEP LEG, for the same reason section 6 uses one: this needs a real step
     * ADVANCE (the scroll fires on nothing else) and a step TALLER than the log, and no shipped
     * leg offers both inside one click. Step 1 is met on any plant, so Continue lights; step 2
     * carries a 4,000-character note, which overflows every viewport this gate runs at.
     *
     * THE FIRST ASSERTION IS THE ANTI-VACUITY ONE. If the fixture stops overflowing — a wider
     * panel, a smaller font — the alignment claim becomes trivially true and would certify the
     * old behaviour, so the overflow is asserted before the alignment is.
     *
     * INJECTION-PROVEN on the production renderer: restoring the pre-fix pair (deleting the
     * `act.offsetHeight > log.clientHeight` branch in ui/app.js) reds the alignment check
     * naming the offset it landed at, and nothing else in this runner moves. */
    await (async function () {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      await page.evaluate(function () {
        var P = window.RD.MANUAL_PROCEDURES.pwr2.filter(function (x) { return x.id !== 'zz_tall_probe'; });
        window.RD.MANUAL_PROCEDURES.pwr2 = P;
        var note = [];
        for (var i = 0; i < 40; i++) note.push('Sentence ' + i + ' of a deliberately long note, written to make this step taller than the panel that draws it.');
        P.push({ id: 'zz_tall_probe', category: 'control', manual_ref: 'ZZ-02',
                 title: 'Tall step probe', purpose: 'Render fixture.', from: 'hot_full_power',
                 steps: [{ text: 'A step that is met the moment it starts.', control: '(observe)',
                           accs: [{ p: 'power_pct', op: '>', v: -1, label: 'Already met' }] },
                         { text: 'THE TALL STEP — its number and instruction must be visible.',
                           why: 'Fixture.', control: '(observe)', note: note.join(' '),
                           accs: [{ p: 'power_pct', op: '<', v: -1, label: 'Never met' }] }] });
      });
      await page.click('[data-mmode="free"]', { timeout: 4000 }).catch(function () {});
      await page.waitForTimeout(200);
      await page.click('[data-mfree]', { timeout: 4000 }).catch(function () {});
      await page.waitForTimeout(2600);
      await page.click('#tabbar [data-tab="checklists"]', { timeout: 4000 });
      await page.waitForTimeout(700);
      await page.click('button[data-ckl-start="zz_tall_probe"]', { timeout: 4000 });
      await page.waitForTimeout(2200);
      /* THE REAL CONTINUE BUTTON, once the step's own acceptance has lit it — the app's own
       * advance path, so the scroll under test is the one a player triggers.
       *
       * DISPATCHED WITHOUT MOVING THE POINTER, and that is not a shortcut. `page.click` drives
       * the real mouse INTO the log, and the auto-scroll stands down while `pointerInside(log)`
       * — #605's guard, kept by #612 — so the first cut of this check measured scrollTop 0 on a
       * step top of 25 and reddened against a working fix. The player this is about has their
       * mouse on the BOARD, which is #612's own words for why the hover guard was never enough,
       * so the pointer belongs outside the log and a synthesised click is how it stays there. */
      await page.waitForSelector('.ckl-step.ckl-active .ckl-ack:not([disabled])', { timeout: 15000 }).catch(function () {});
      await page.evaluate(function () {
        var b = document.querySelector('.ckl-step.ckl-active .ckl-ack');
        if (b) b.click();
      });
      await page.waitForTimeout(1800);
      var geo = await page.evaluate(function () {
        var log = document.querySelector('#cklRun .ckl-log') || document.querySelector('.ckl-log');
        var act = log ? log.querySelector('.ckl-active') : null;
        if (!log || !act) return null;
        return { scrollTop: log.scrollTop, clientH: log.clientHeight,
                 actTop: act.offsetTop - log.offsetTop, actH: act.offsetHeight,
                 head: ((act.querySelector('.ckl-txt') || {}).textContent || '').trim().slice(0, 40) };
      });
      ck('#653 scroll: the fixture step really does overflow the panel (anti-vacuity)',
         !!geo && geo.actH > geo.clientH + 40 && /^2\./.test(geo.head),
         geo ? 'step ' + JSON.stringify(geo.head) + ' is ' + geo.actH + ' px in a ' + geo.clientH + ' px log'
             : 'the tall fixture did not advance to step 2');
      ck('...and it opens at its OWN top, not scrolled past its number and instruction',
         !!geo && Math.abs(geo.scrollTop - geo.actTop) <= 2,
         geo ? 'scrollTop ' + Math.round(geo.scrollTop) + ' vs step top ' + geo.actTop +
               ' (pre-fix would be ' + Math.round(geo.actTop + geo.actH - geo.clientH) + ')'
             : 'no geometry');
    })();

    /* ---- 7b. CONTINUE LIGHTING BELOW THE FOLD IS BROUGHT INTO VIEW (#653, layman pass 3) --
     *
     * Measured 2026-09-24 at 1600x1000 on `pwr_startup` step 9 with the 1/M window open: a
     * 785 px step in a 728 px log opens at its own top (section 7), so its Continue row sits
     * below the log floor (y 954 against 931), and when 9b lit it nothing scrolled — the player
     * was told to press a button that was not on screen. Two defects, both in renderChecklist:
     * no scroll on the READY event, and the reader-scrolled test (`userScrolled`) demanding the
     * whole active step be visible, which a tall step never is — so any scroll, the app's own
     * included, disarmed every later auto-scroll on that step.
     *
     * Same synthetic-leg reason as section 7. Step 2 is tall and turns ready LATER, on a
     * command (a `cmd` row), sent through the dev service handle so the pointer stays OFF the
     * log, as a player's does. The first assertion is the anti-vacuity one: the row must start
     * below the fold, or the second passes on any renderer.
     *
     * INJECTION-PROVEN: deleting the ready-event block reds the second check (row still below
     * the floor); restoring the full-visibility-only `visible` test reds it too (userScrolled
     * arms on the open scroll). Nothing else in this runner moves. */
    await (async function () {
      await page.goto(url + '&dev=1', { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      await page.evaluate(function () {
        var P = window.RD.MANUAL_PROCEDURES.pwr2.filter(function (x) { return x.id !== 'zz_tall_ready'; });
        window.RD.MANUAL_PROCEDURES.pwr2 = P;
        var note = [];
        for (var i = 0; i < 40; i++) note.push('Sentence ' + i + ' of a deliberately long note, written to make this step taller than the panel that draws it.');
        P.push({ id: 'zz_tall_ready', category: 'control', manual_ref: 'ZZ-03',
                 title: 'Tall ready probe', purpose: 'Render fixture.', from: 'hot_full_power',
                 steps: [{ text: 'A step that is met the moment it starts.', control: '(observe)',
                           accs: [{ p: 'power_pct', op: '>', v: -1, label: 'Already met' }] },
                         { text: 'THE TALL STEP — it turns ready on a command.', why: 'Fixture.',
                           control: '(observe)', note: note.join(' '),
                           accs: [{ cmd: 'set_pressure_setpoint', ask: 'Send the setpoint.', label: 'Setpoint sent' }] }] });
      });
      await page.click('[data-mmode="free"]', { timeout: 4000 }).catch(function () {});
      await page.waitForTimeout(200);
      await page.click('[data-mfree]', { timeout: 4000 }).catch(function () {});
      await page.waitForTimeout(2600);
      await page.click('#tabbar [data-tab="checklists"]', { timeout: 4000 });
      await page.waitForTimeout(700);
      await page.click('button[data-ckl-start="zz_tall_ready"]', { timeout: 4000 });
      await page.waitForTimeout(2200);
      await page.mouse.move(300, 500);
      await page.waitForSelector('.ckl-step.ckl-active .ckl-ack:not([disabled])', { timeout: 15000 }).catch(function () {});
      await page.evaluate(function () {
        var b = document.querySelector('.ckl-step.ckl-active .ckl-ack');
        if (b) b.click();
      });
      await page.waitForTimeout(1800);
      function geoFn() {
        var log = document.querySelector('#cklRun .ckl-log') || document.querySelector('.ckl-log');
        var act = log ? log.querySelector('.ckl-active') : null;
        var row = act ? act.querySelector('.ckl-ack-row') : null;
        var cont = act ? act.querySelector('.wt-continue') : null;
        if (!log || !act || !row) return null;
        var L = log.getBoundingClientRect(), R = row.getBoundingClientRect();
        return { logTop: Math.round(L.top), logBot: Math.round(L.bottom), rowTop: Math.round(R.top),
                 rowBot: Math.round(R.bottom), actH: act.offsetHeight, clientH: log.clientHeight,
                 ready: !!cont && /\bready\b/.test(cont.className),
                 head: ((act.querySelector('.ckl-txt') || {}).textContent || '').trim().slice(0, 30) };
      }
      var g0 = await page.evaluate(geoFn);
      await page.evaluate(function () {
        window.RD.__dev.service().handleCommand({ action: 'set_pressure_setpoint', mpa: 15.51 });
      });
      await page.waitForSelector('.ckl-step.ckl-active .wt-continue.ready', { timeout: 15000 }).catch(function () {});
      await page.waitForTimeout(1200);
      var g1 = await page.evaluate(geoFn);
      ck('#653 pass 3: the tall step opens NOT ready, with its Continue row below the log floor (anti-vacuity)',
         !!g0 && /^2\./.test(g0.head) && !g0.ready && g0.actH > g0.clientH + 40 && g0.rowBot > g0.logBot,
         g0 ? JSON.stringify(g0) : 'the fixture did not advance to step 2');
      ck('...and when Continue lights, the row is scrolled into the log without the pointer in it',
         !!g1 && g1.ready && g1.rowBot <= g1.logBot + 1 && g1.rowTop >= g1.logTop - 1,
         g1 ? JSON.stringify(g1) : 'no geometry');
    })();

    /* ---- 8. AN OUT-OF-TURN PRESS SAYS WHY (#759) ---------------------------------------
     * *(OWNER RULING, 2026-09-15: "Fix the text AND say why")*.
     *
     * Measured on the shipped pool before this: `pwr_startup` step 5 with rung 5a unmet (source
     * range 501 counts per second against a 700 target), Plot point pressed — the plot took the
     * points, 1 -> 2 -> 3 circles, the panel recomputing each press — while the rung never
     * ticked and NOTHING was said on the card, the panel or anywhere else.
     *
     * A REAL PRESS ON A REAL BUTTON. The fixture is the leg, not the press: an ordered step
     * whose first row can never be met and whose second row is a `plot_1m_point` cmd entry, run
     * from Hot Standby (Mode 3) because the 1/M tool refuses the press outright while the source
     * range is de-energized — at Hot Full Power there would be no command at all and the check
     * would pass on a plant that never produced the event.
     *
     * THE SENTENCE IS DERIVED, NOT AUTHORED, so the assertion is that it quotes the BLOCKING
     * row's own `ask` — a check pinned to a string would pass on a hard-coded one.
     *
     * INJECTION-PROVEN three ways, each red for its own reason and no other: dropping
     * `holder.outOfTurn` in `_accsCmdWatch` (nothing recorded); dropping `ck.out_of_turn` from
     * `renderChecklist`'s key (recorded, never repainted — the failure this was actually built
     * through); and dropping the `.ckl-oot` block itself. */
    await (async function () {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      await page.evaluate(function () {
        var P = window.RD.MANUAL_PROCEDURES.pwr2.filter(function (x) { return x.id !== 'zz_oot_probe'; });
        window.RD.MANUAL_PROCEDURES.pwr2 = P;
        P.push({ id: 'zz_oot_probe', category: 'control', manual_ref: 'ZZ-03',
                 title: 'Out-of-turn probe', purpose: 'Render fixture.', from: 'hot_zero_power',
                 steps: [{ text: 'An ordered step whose first rung is not met.', control: '(observe)',
                           accs_ordered: true,
                           accs: [{ p: 'power_pct', op: '<', v: -1, ask: 'Wait for the counts to pass the target.', label: 'Never met' },
                                  { cmd: 'plot_1m_point', ask: 'Press Plot point on the 1/M PLOT panel.' }] }] });
      });
      await page.click('[data-mmode="free"]', { timeout: 4000 }).catch(function () {});
      await page.waitForTimeout(200);
      await page.click('[data-minit="hot_zero_power"]', { timeout: 4000 }).catch(function () {});
      await page.waitForTimeout(250);
      await page.click('[data-mfree]', { timeout: 4000 }).catch(function () {});
      await page.waitForTimeout(3000);
      await page.click('#tabbar [data-tab="checklists"]', { timeout: 4000 });
      await page.waitForTimeout(700);
      await page.click('button[data-ckl-start="zz_oot_probe"]', { timeout: 4000 });
      await page.waitForTimeout(1800);
      await page.evaluate(function () { if (window.RD.OneOverM) window.RD.OneOverM.open(); });
      await page.waitForTimeout(500);
      await page.click('[data-oom="plot"]', { timeout: 6000 }).catch(function () {});
      await page.waitForTimeout(1500);
      var out = await page.evaluate(function () {
        var card = document.querySelector('.ckl-step.ckl-active');
        var line = card ? card.querySelector('.ckl-oot') : null;
        return { line: line ? line.textContent.replace(/\s+/g, ' ').trim() : null,
                 msg: ((document.getElementById('oomMsg') || {}).textContent || '').slice(0, 60),
                 rows: card ? card.querySelectorAll('.ckl-crit').length : 0 };
      });
      ck('#759: the press really landed — the 1/M tool took the sample (the event this is about)',
         !!out && /cps|C₀|C =/.test(out.msg), out ? 'oomMsg ' + JSON.stringify(out.msg) : 'no panel');
      ck('...and the card prints a reason, derived from the BLOCKING rung, not the pressed one',
         !!out && !!out.line && /^Not yet/.test(out.line) &&
         out.line.indexOf('Wait for the counts to pass the target.') > 0 &&
         out.line.indexOf('Plot point') < 0,
         out ? JSON.stringify(out.line) : 'no .ckl-oot line');
    })();

    /* ---- 9. A LETTERED SUBSTEP CAN OWN MORE THAN ONE CHECK-OFF, ITS OWN NOTE AND ITS OWN
     * "Suggested time warp" LINE (the walkthrough-step-format project, `Blueprint/
     * walkthrough_steps/02_mode3_to_mode1.md`). Written before any pool step authored `accs[].cont` /
     * `.note` / `.wait_speed` / `.speed_text`; `pwr_startup` has carried all four since
     * 2026-09-23, but the fixture stays SYNTHETIC on purpose — it pins the letter math on one of
     * everything, which no single shipped step happens to hold. Same idiom as section 6.
     *
     * THREE THINGS THE LETTER MATH MUST GET RIGHT AT ONCE: a `cont` row draws (still graded,
     * still its own ✓/○) but consumes NO letter, so the substep after it is `1b`, not `1c` — the
     * defect this proves is real: a naive `visN`/`visSeen` that still counted `cont` rows would
     * print `1c` here. And a step that is ONE substep wide, even with a `cont` check-off under
     * it, still suppresses letters altogether (the `single` variant), because the `visN > 1`
     * test has to count HEADS, not `accs` rows.
     *
     * READ OFF THE RENDERED DOM, not a hook — same reason section 6 gives. */
    await (async function () {
      async function paint(mode) {
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        await page.evaluate(function (mode) {
          var P = window.RD.MANUAL_PROCEDURES.pwr2.filter(function (x) { return x.id !== 'zz_substep_probe'; });
          window.RD.MANUAL_PROCEDURES.pwr2 = P;
          // head A (met) + its `cont` check-off (met) + head B (unmet) — one of everything.
          var accs = [
            { p: 'power_pct', op: '>', v: -1, ask: 'Do thing A.', label: 'A done-when',
              note: 'Note for substep A.', wait_speed: 5 },
            { p: 'power_pct', op: '>', v: -1, label: 'A confirmed a second way', cont: true },
            { p: 'power_pct', op: '<', v: -1, ask: 'Do thing B.', label: 'B done-when',
              speed_text: 'Custom prose for B, not a bare rung.' }
          ];
          if (mode === 'single') accs = accs.slice(0, 2);   // head A + its cont row, nothing else
          P.push({ id: 'zz_substep_probe', category: 'control', manual_ref: 'ZZ-04',
                   title: 'Substep probe', purpose: 'Render fixture.', from: 'hot_full_power',
                   steps: [{ text: 'A step with a cont row and a per-substep speed line.',
                             control: '(observe)', accs: accs }] });
        }, mode);
        await page.click('[data-mmode="free"]', { timeout: 4000 }).catch(function () {});
        await page.waitForTimeout(200);
        await page.click('[data-mfree]', { timeout: 4000 }).catch(function () {});
        await page.waitForTimeout(2600);
        await page.click('#tabbar [data-tab="checklists"]', { timeout: 4000 });
        await page.waitForTimeout(700);
        await page.click('button[data-ckl-start="zz_substep_probe"]', { timeout: 4000 });
        await page.waitForTimeout(2200);
        return page.evaluate(function () {
          var card = document.querySelector('.ckl-step.ckl-active');
          if (!card) return null;
          /* In DOM order, rows AND the `.ckl-crit-tail` a head with a `cont` row defers its note and
           * speed into (layman pass 2, 2026-09-24): the tail is folded back onto its head (the
           * nearest lettered row, or row 0 on an unlettered step) and `order` records where it
           * drew, so the placement is asserted as well as the text. */
          var out = [], order = [];
          [].forEach.call(card.querySelectorAll('.ckl-crit, .ckl-crit-tail'), function (r) {
            var tail = r.classList.contains('ckl-crit-tail');
            var n = r.querySelector('.ckl-crit-n');
            var note = r.querySelector('.ckl-crit-note');
            var speed = r.querySelector('.ckl-crit-speed');
            order.push(tail ? 'tail' : 'row');
            var rec = { tag: n ? n.textContent.trim() : null,
                        met: r.classList.contains('ckl-crit-met'),
                        note: note ? note.textContent.trim() : null,
                        speed: speed ? speed.textContent.trim() : null };
            if (!tail) { out.push(rec); return; }
            for (var k = out.length - 1; k >= 0; k--) {
              if (out[k].tag !== null || k === 0) { out[k].note = rec.note; out[k].speed = rec.speed; out[k].tailMet = rec.met; break; }
            }
          });
          return { rows: out, order: order.join(',') };
        }).then(function (r) { if (!r) return null; r.rows.order = r.order; return r.rows; });
      }

      var base = await paint(null);
      ck('#substep render: three rows for a head + its cont row + a second head',
         !!base && base.length === 3,
         base ? base.length + ' rows' : 'the probe leg did not render');
      ck('...the `cont` row draws — still graded — but consumes no letter',
         !!base && base.length === 3 && base[1].tag === null && base[1].met === true,
         base ? 'tags ' + JSON.stringify(base.map(function (r) { return r.tag; })) +
                ' met ' + JSON.stringify(base.map(function (r) { return r.met; })) : 'no rows');
      ck('...and the SECOND HEAD is lettered `1b`, not `1c` — the letter skips the cont row',
         !!base && base[0].tag === '1a' && base[2].tag === '1b',
         base ? 'tags ' + JSON.stringify(base.map(function (r) { return r.tag; })) : 'no rows');
      ck('...head A draws its own note and its wait_speed as a snapped N× line',
         !!base && base[0].note === 'Note for substep A.' &&
         base[0].speed === 'Suggested time warp: 5×.',
         base ? 'note ' + JSON.stringify(base[0].note) + ' speed ' + JSON.stringify(base[0].speed) : 'no rows');
      ck('...the cont row draws NEITHER note NOR speed line — the head already carries them',
         !!base && base[1].note === null && base[1].speed === null,
         base ? 'cont note ' + JSON.stringify(base[1].note) + ' speed ' + JSON.stringify(base[1].speed) : 'no rows');
      ck('...head B\'s authored speed_text REPLACES the bare rung, verbatim (its own punctuation, not doubled)',
         !!base && base[2].speed === 'Suggested time warp: Custom prose for B, not a bare rung.',
         base ? 'B speed ' + JSON.stringify(base[2].speed) : 'no rows');
      ck('...and the head\'s note + speed draw AFTER its cont check-off, not between the two (layman pass 2, 2026-09-24)',
         !!base && base.order === 'row,row,tail,row' && base[0].tailMet === base[0].met,
         base ? 'DOM order ' + base.order + ' (want row,row,tail,row)' : 'no rows');

      var single = await paint('single');
      ck('...VARIANT: a head + its cont row is still ONE substep — no letters at all',
         !!single && single.length === 2 && single[0].tag === null && single[1].tag === null &&
         single.order === 'row,row,tail' && single[0].note === 'Note for substep A.',
         single ? 'order ' + single.order + ' tags ' + JSON.stringify(single.map(function (r) { return r.tag; })) : 'no rows');
    })();

    /* ---- 10. A `below_1m` ROW PAST THE MARK SAYS WHERE THE MARK IS (quality pass, 2026-09-24,
     * `pwr_startup` 9a). Measured in headless Edge, seed 42, prediction 211: a stop at 209 or 211
     * never ticks 9a and the card said only "It ticks after the rods have been still for a
     * plant-minute". The line draws only once the reading is already past prediction-minus-N.
     * SYNTHETIC row, and the instructor's 1/M table is planted through RD.OneOverMCore itself so
     * the printed prediction is exactly bank+d: first d = +5 (mark = bank+2, not past: no line),
     * then d = +1 on the SAME card (mark = bank-2, past: the line). The second read is also the
     * render-key proof — `met` and `no_1m` do not move between the two, so a key that ignores
     * `pred_1m`/`obs` leaves the first paint standing. */
    await (async function () {
      await page.goto(url + '&dev=1', { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      await page.evaluate(function () {
        var P = window.RD.MANUAL_PROCEDURES.pwr2.filter(function (x) { return x.id !== 'zz_1m_probe'; });
        window.RD.MANUAL_PROCEDURES.pwr2 = P;
        P.push({ id: 'zz_1m_probe', category: 'control', manual_ref: 'ZZ-05', title: '1/M mark probe',
                 purpose: 'Render fixture.', from: 'hot_full_power',
                 steps: [{ text: 'Stop short of the prediction.', control: '(observe)', accs_ordered: true,
                           accs: [{ p: 'control_bank_steps', op: 'stopped', v: 600, below_1m: 3,
                                    ask: 'Stop 3 short.', label: 'Rods stopped 3 short' },
                                  { p: 'power_pct', op: '<', v: -1, ask: 'Never.', label: 'never' }] }] });
      });
      await page.click('[data-mmode="free"]', { timeout: 4000 }).catch(function () {});
      await page.waitForTimeout(200);
      await page.click('[data-minit="hot_full_power"]', { timeout: 4000 }).catch(function () {});
      await page.waitForTimeout(200);
      await page.click('[data-mfree]', { timeout: 4000 }).catch(function () {});
      await page.waitForTimeout(2600);
      await page.click('#tabbar [data-tab="checklists"]', { timeout: 4000 });
      await page.waitForTimeout(700);
      await page.click('button[data-ckl-start="zz_1m_probe"]', { timeout: 4000 });
      await page.waitForTimeout(1500);
      async function plant(d) {
        var bank = await page.evaluate(function (d) {
          var C = RD.OneOverMCore, svc = RD.__dev.service(), s = svc.assembleSnapshot();
          var M = C.fullScale(s), b = C.controlGroup(s).steps, xp = (b + d) / M, tb = svc.instructor.oneOverM;
          C.clear(tb);
          C.add(tb, 0, 1000, s.metadata.sim_time);
          C.add(tb, 0.5, 1000 / (1 - 0.5 / xp), s.metadata.sim_time);
          return b;
        }, d);
        await page.waitForTimeout(1500);
        var r = await page.evaluate(function () {
          var card = document.querySelector('.ckl-step.ckl-active');
          var row = card ? card.querySelector('.ckl-crit') : null;
          var ws = row ? [].map.call(row.querySelectorAll('.ckl-crit-when'), function (e) { return e.textContent.trim(); }) : [];
          var svc = RD.__dev.service(), c = svc.instructor.getSnapshotBlock().checklist || {};
          return { past: ws.filter(function (t) { return /^Past the mark/.test(t); })[0] || null,
                   acc: (c.accs || [])[0] || null };
        });
        r.bank = bank;
        return r;
      }
      var far = await plant(5), near = await plant(1);
      ck('#1/M mark: the fixture row really is graded against the planted prediction (anti-vacuity)',
         !!far.acc && far.acc.pred_1m === far.bank + 5 && !!near.acc && near.acc.pred_1m === near.bank + 1 && !near.acc.met,
         'pred ' + (far.acc && far.acc.pred_1m) + ' / ' + (near.acc && near.acc.pred_1m) + ' bank ' + far.bank + ' / ' + near.bank);
      ck('...a reading NOT past prediction-minus-3 draws no "Past the mark" line',
         !far.past, JSON.stringify(far.past));
      ck('...a reading past it names the prediction, the tick position and the reading — on the SAME card (render key)',
         !!near.past && near.past.indexOf('predicts step ' + (near.bank + 1)) !== -1 &&
         near.past.indexOf('at ' + (near.bank - 2) + ' or below') !== -1 && near.past.indexOf('reads ' + near.bank) !== -1,
         JSON.stringify(near.past));
    })();

  } catch (err) {
    ck('the gate ran to completion', false, String((err && err.message) || err).slice(0, 160));
  }

  await browser.close();
  srv.close();
  console.log(C.bold + '\nCHECKLIST RELEVANCE: ' + (nFail ? C.red + nFail + ' FAILED' : C.green + 'PASS') +
    C.off + '  ' + nPass + ' passed / ' + (nPass + nFail) + ' checks\n');
  process.exit(nFail ? 1 : 0);
})();
