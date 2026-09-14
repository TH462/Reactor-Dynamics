/*
 * run_manual_controls.js — every controlled procedure step names a control the
 * player can actually reach, and is COVERED by the browser gate.
 *
 * WHY THIS IS A GATE (#224). It was `test/audit_manual_controls.js`: same checks,
 * but not a `run_*.js`, so `run_all`'s auto-discovery never saw it and it had no
 * baseline. Manual-run harnesses drift — #159 said so, and this is the half that
 * mattered. Measured 2026-07-31 it reported **32 mismatches, exit 1**, and had been
 * doing so silently through the #197 / #202 / #206 procedure re-authoring.
 *
 * WHAT IT ACTUALLY GUARDS, which is more than the name suggests. `STEP_UI` in
 * `manual_ui_map.js` is the COVERAGE LIST for `verify_manual_follow.js` — that gate
 * iterates the table, not the procedure steps. So a step with no entry is not merely
 * unmapped, it is **unverified**, and the browser gate reports a confident PASS over
 * whatever slice remains. At the point this was written the table covered 17 of the
 * 45 controlled PWR steps and `pwr_heatup` had none at all. Nothing said so, because
 * the only thing that could say so was not in the gate list.
 *
 * THE THREE CHECKS, per controlled step (a step whose `control` is absent or reads
 * `(observe…)` is not a control step and is skipped):
 *   1. it has a `STEP_UI` entry            — i.e. the browser gate will look at it
 *   2. the entry's control matches the pill — catches steps inserted above an entry,
 *      which is exactly how `pwr_startup` came to pin `Control Bank` at the 1/M step
 *   3. the control exists on that plant's display vocabulary — for PWR, the board's
 *      own CONTROL_LABEL_MAP (see manual_ui_map.js); for RBMK/BWR, the view-bar lists
 * …plus the reverse: a `STEP_UI` entry pointing at a step that no longer exists.
 *
 * Static — no browser, no plant stepped. `verify_manual_follow.js` is the dynamic
 * half and mounts the real UI.
 *
 *   node test/run_manual_controls.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var map = require('./manual_ui_map.js');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

// Report destination: repo-relative Diagnostic/ by default (where the other
// generated reports live). `node test/run_manual_controls.js <dir>` overrides.
var SCRATCH = process.env.GROK_GOAL_SCRATCH || process.argv[2] || path.join(__dirname, '..', 'Diagnostic');

require('../ui/manual_procedures.js');
var RD = globalThis.RD;

var checks = 0, failed = 0, mismatches = [];
function ck(label, ok, detail) {
  checks++;
  if (!ok) { failed++; mismatches.push(label + (detail ? ': ' + detail : '')); }
}

var covered = 0, controlled = 0;
Object.keys(RD.MANUAL_PROCEDURES).forEach(function (prof) {
  RD.MANUAL_PROCEDURES[prof].forEach(function (proc) {
    if (proc.narrative) return;
    var expects = map.STEP_UI[prof + ':' + proc.id] ||
                  (map.OWN_POOL_PROFILES.indexOf(prof) >= 0 ? null : map.STEP_UI[proc.id]) || [];
    (proc.steps || []).forEach(function (st, idx) {
      if (!st.control || /^\(observe/.test(st.control)) return;
      controlled++;
      var where = prof + ' · ' + proc.id + ' step ' + (idx + 1);
      var exp = expects.filter(function (e) { return e.i === idx; })[0];
      if (!exp) { ck(where, false, 'no STEP_UI entry for control "' + st.control + '" — this step is UNVERIFIED by verify_manual_follow'); return; }
      covered++;
      if (exp.control !== st.control) { ck(where, false, 'pill "' + st.control + '" != STEP_UI "' + exp.control + '"'); return; }
      ck(where, map.controlOnView(prof, exp.view, st.control),
        '"' + st.control + '" not on ' + prof + '/' + exp.view);
    });
    // Reverse: an entry whose step has gone away or lost its control.
    expects.forEach(function (e) {
      var st = (proc.steps || [])[e.i];
      ck(prof + ' · ' + proc.id + ' STEP_UI step ' + (e.i + 1),
        !!(st && st.control), 'STEP_UI entry has no procedure step behind it');
    });
  });
});

// ============================================================================
// HIGHLIGHT-LABEL CHECK (#598 item 14) — every `hl` label must resolve to a board item.
//
// A step's `hl` is the list of controls the live checklist GLOWS on the board: app.js hands
// each one to RD.PwrBoard.revealControl, which looks it up in CONTROL_LABEL_MAP and returns
// null for anything it does not know. A null glows nothing, silently — the step renders, the
// checklist advances, and the one affordance that says WHERE to look is simply absent.
//
// NOTHING IN test/ READ `st.hl` UNTIL THIS. `st.control` has been validated against the board
// vocabulary since #304 (the block below), and `hl` — which is a strictly larger vocabulary,
// carried by all 60 pwr2 steps where `control` is carried by 47 — had no check at all. The pass
// that found it turned up three dead labels in the shipped pool.
//
// Resolved through the DRIVER's own map, not a hand-maintained list: a gate that iterates a copy
// of the vocabulary tests the copy (the house trap), and this one has to fail when a label is
// deleted from CONTROL_LABEL_MAP as much as when one is invented in a procedure.
// ============================================================================
(function highlightLabels() {
  if (!globalThis.RD || !globalThis.RD.PwrBoardDriver) return;
  var DRV = globalThis.RD.PwrBoardDriver;
  if (!DRV.controlLabels) return;
  var known = {};
  DRV.controlLabels().forEach(function (l) { known[l] = true; });

  /* ============================ THE RESOLVED-ID CHECK (#745) ============================
   * The disjoint check below compares LABEL STRINGS. `Turbine Load` and `Main Breaker` are
   * different strings and the same board element (`imro8k5pzem`), so a step naming both got
   * ONE ring, the control it named first glowed not at all, and every gate agreed the step
   * was correctly authored. Fourteen steps were doing it, eight in the live pwr2 pool.
   *
   * RESOLVE THE WAY THE RENDERER DOES, OR THIS LIES. Two corrections, both filed as prior
   * measurements on #745/#747 and both REPRODUCED here before anything was built on them —
   * cited that way on purpose, because every agent in this repo comments under the owner's
   * account and authorship on an issue is not evidence of who measured what:
   *
   *   1. `controlLabelItem` IS NOT THE RENDERER'S RESOLVER. `ui/app.js`'s `hlTarget` calls
   *      `RD.Highlight.resolve`, which tries the SHELL overrides FIRST and only then falls
   *      back to the board map. #735 registered `Plot point` as a shell target precisely
   *      because it was landing on `bdOneOverM`, the button that OPENS the plot. Resolving
   *      through the board map alone reports `pwr_startup` 4 as a collision when the board
   *      paints two distinct elements — a false positive that would have bought a fix for a
   *      step that never had the defect. A shell target is namespaced `shell:<selector>` here
   *      so it can never collide with a board id.
   *   2. A STEP'S PRESS LIST IS NOT ALWAYS `hl`. `stepHlLabels` (ui/app.js) uses `hl` when it
   *      has entries, ELSE the step's own `control`, skipping the "(observe…)" placeholders.
   *      `pwr_raise_power` 9 authors no `hl` at all: its press target is `control: 'Boron
   *      control'` and its `hl_watch` carries `'Boron'` — one element, and `applyCklWatchGlow`
   *      drops the steady ring on it. A check walking only `hl` and `hl_watch` never sees that
   *      whole sub-class. Fold `control` in exactly as the renderer does.
   *
   * ⚠ THE MODEL IS EXACT FOR THE ONE SHELL TARGET THERE IS, AND THAT WAS MEASURED, NOT REASONED.
   * The obvious worry is that a shell target FALLS BACK to the board map when its selector
   * matches nothing — which would make `1/M Plot Tool` and `Plot point` collide whenever the 1/M
   * window is shut, and this check optimistic. IT DOES NOT HAPPEN. Measured in headless Chromium
   * 2026-09-14, `?engine=pwr2`: `#oomWin` is built at INIT and merely `display:none` until
   * opened, `document.querySelector` matches hidden elements, and `RD.Highlight.resolve` returns
   * the plot button in BOTH states — `same: false` closed and open, against `same: true` for
   * `Boron`/`Boron control` and `Turbine Load`/`Main Breaker` probed in the same run as controls.
   * So the namespacing below matches the renderer exactly rather than approximating it.
   *
   * What IS true in the closed state is a different thing and not this check's subject: the ring
   * lands on a 0x0 `display:none` button, so the player sees no pulse for that label until they
   * open the tool. On `pwr_startup` 4 that is arguably right — the step tells them to open it
   * first — but a class-COUNT gate cannot tell an invisible ring from a visible one.
   * ==================================================================================== */
  /* The bus is a plain global-namespace script and its SHELL_TARGETS is a plain object;
   * nothing on this path touches `document`. Required here rather than at the top of the
   * file so this stays the only section that depends on it. */
  /* ⚠ If this ever throws, SHELL is empty and the check degrades to the BOARD-MAP resolution
   * corrected against above — i.e. it reds on `pwr_startup` 4 for a defect that is not there.
   * That is a loud failure, not a silent one, and the message names the labels, so the next
   * reader can get here. Do not "fix" such a red by relaxing the check. */
  try { require('../ui/highlight_bus.js'); } catch (e) { /* fall through with SHELL empty */ }
  var SHELL = (globalThis.RD.Highlight && globalThis.RD.Highlight.SHELL_TARGETS) || {};
  function resolveLabel(lab) {
    if (SHELL[lab]) return 'shell:' + SHELL[lab];
    return DRV.controlLabelItem ? (DRV.controlLabelItem(lab) || null) : null;
  }
  function pressLabels(st) {
    if (st.hl && st.hl.length) return st.hl;
    if (st.control && !/^\(observe/i.test(st.control)) return [st.control];
    return [];
  }
  /* ---- "can the player act on this?" (#748) — see the long note after this IIFE ---- */
  var ITEM = {};
  ((globalThis.window && globalThis.window.RD_PWR_BOARD_DOC &&
    globalThis.window.RD_PWR_BOARD_DOC.items) || []).forEach(function (it) { ITEM[it.id] = it; });
  (DRV.extraItems ? DRV.extraItems() : []).forEach(function (it) { ITEM[it.id] = it; });
  function kindOf(id) { return (ITEM[id] && ITEM[id].kind) || 'board item'; }
  var INSP = globalThis.RD.PwrBoardInspect;
  var ACT = {}, ACT_OR_INSIDE = {};
  (DRV.actionableIds ? DRV.actionableIds() : DRV.pressableIds()).forEach(function (id) {
    ACT[id] = true;
    var cur = id, guard = 0;
    while (cur && guard++ < 8) { ACT_OR_INSIDE[cur] = true; cur = (INSP && INSP.parentOf) ? INSP.parentOf(cur) : null; }
  });
  // A CARD earns its ring from what it contains; every other kind answers for itself.
  function workable(id) { return !!(ACT[id] || (kindOf(id) === 'box' && ACT_OR_INSIDE[id])); }
  /* The pwr board's vocabulary answers for the pwr pools only. A plant with its own board
   * (rbmk/bwr use the process-diagram labels) is checked by run_campaign's own pool. */
  var retiredPoolPulseOnReadout = 0;
  ['pwr', 'pwr2'].forEach(function (prof) {
    (RD.MANUAL_PROCEDURES[prof] || []).forEach(function (proc) {
      (proc.steps || []).forEach(function (st, idx) {
        var where = prof + ' · ' + proc.id + ' step ' + (idx + 1);
        (st.hl || []).forEach(function (lab) {
          ck(where + ' hl',
             known[lab] === true,
             '"' + lab + '" is not in the board highlight vocabulary — this step glows nothing');
        });
        /* THE SECOND LIST IS CHECKED THE SAME WAY OR IT IS NOT CHECKED AT ALL (#685).
         * `hl_watch` is "watch this indication" to `hl`'s "press this control" and it resolves
         * through the SAME `revealControl` lookup, so it fails the same silent way: a label the
         * board does not carry glows nothing and looks exactly like a step that asked for no
         * watch target. A new field with no gate is how the twelve dead `hl` labels in #598
         * item 14 survived. */
        (st.hl_watch || []).forEach(function (lab) {
          ck(where + ' hl_watch',
             known[lab] === true,
             '"' + lab + '" is not in the board highlight vocabulary — this step watches nothing');
        });
        /* ONE LABEL, ONE TREATMENT. A label in both lists resolves to ONE board element, which
         * can only wear one ring — so the author has asked for a pulse and a steady dash on the
         * same thing and will get whichever the renderer applies last. It is an authoring
         * defect, not a rendering one, and nothing else can see it. */
        if (st.hl && st.hl.length && st.hl_watch && st.hl_watch.length) {
          var both = st.hl.filter(function (l) { return st.hl_watch.indexOf(l) >= 0; });
          ck(where + ' hl/hl_watch are disjoint', both.length === 0,
             '"' + both.join('", "') + '" is in BOTH lists — one element cannot be both the ' +
             'control to press and the indication to watch');
        }
        /* …AND THE SAME CLAIM ON RESOLVED IDS (#745). One check per step, so the count is
         * DERIVED from the pool rather than typed: add a step and the tally moves by one. */
        var byId = {}, shared = [];
        pressLabels(st).concat(st.hl_watch || []).forEach(function (lab) {
          var id = resolveLabel(lab);
          if (!id) return;                       // unknown labels are the check above's job
          (byId[id] = byId[id] || []).push(lab);
        });
        Object.keys(byId).forEach(function (id) {
          if (byId[id].length > 1) shared.push('"' + byId[id].join('" + "') + '" -> ' + id);
        });
        ck(where + ' hl/hl_watch resolve to distinct elements', shared.length === 0,
           shared.join('; ') + ' — two labels, ONE board element: it can wear one ring, so ' +
           'the first is silently dropped');
        /* ============ THE PULSING RING MEANS "PRESS THIS" (#748) ==========================
         * See the block above this IIFE's end for what this asserts, what it does NOT, and
         * why the obvious version of it is born wrong. */
        pressLabels(st).forEach(function (lab) {
          var id = resolveLabel(lab);
          if (!id || /^shell:/.test(id)) return;   // unknown / shell-owned: not this check's subject
          if (prof !== 'pwr2') { if (!workable(id)) retiredPoolPulseOnReadout++; return; }
          ck(where + ' pulses only on something the player can work',
             workable(id),
             '"' + lab + '" -> ' + id + ' is a ' + kindOf(id) + ' — a pure readout. The pulsing ' +
             'ring is the "press this" affordance; move the label to hl_watch');
        });
      });
    });
  });
  console.log('\n' + B + 'Pulse-vs-watch scan' + X + D + '  (#748 — hl rings a control, hl_watch rings an indication)' + X);
  console.log('  board items the player can work: ' + (DRV.actionableIds ? DRV.actionableIds().length : 0) +
    '   of which press/hold buttons: ' + DRV.pressableIds().length);
  console.log('  retired `pwr` pool, NOT GATED (see the note below): ' + retiredPoolPulseOnReadout +
    ' pulsing rings on a pure readout');
})();

/* ============================================================================
 * WHAT THE PULSE CHECK ABOVE ASSERTS, AND WHAT IT DOES NOT (#748)
 *
 * THE RULING IT ENFORCES: pulsing (`hl`) = a control to press, steady (`hl_watch`) = an
 * indication to watch. A fresh-context layman playing `pwr_startup` end to end reported the
 * split did not hold — `SOURCE RANGE` and `STARTUP RATE`, two read-only meters, wore the same
 * animated ring as `WITHDRAW` on eight consecutive steps.
 *
 * ⚠ THE OBVIOUS CHECK IS BORN WRONG, AND THIS IS THE HOUSE TRAP (CLAUDE.md: "ASK WHAT A GATE
 * READS, not only what it asserts"). "Every `hl` id is in `pressableIds()`" reds on four
 * correctly-authored steps: `pressableIds()` reads `BUTTONS`, so a TYPED NUMBER BOX — `Boron
 * Target`, `Pressure SP`, `Dump Setpoint`, `Load Setpoint` — comes back read-only, as do the
 * clickable valve symbols and SCRAM, which render from their own kinds. A first sweep built on
 * it reported 27 offenders; the authority, not the pool, was wrong. The fix was to widen the
 * BOARD's own introspection — `PwrBoardDriver.actionableIds()` reads `BUTTONS`, `NUMBERS`,
 * `VALVE_TOGGLE` and the `scram` kind, i.e. every map the renderer dispatches a player action
 * from — so the invariant is answerable rather than approximated, and wiring a new number box
 * widens it in the same edit.
 *
 * LEAF RULE, NOT AN ANCESTOR WALK. `workable()` credits a container (`kind: 'box'` — a CARD)
 * for holding something actionable, because `hl: ['Steam Dump']` legitimately rings the whole
 * card; every other kind is judged on ITSELF. The #304 scan below walks ancestors instead, and
 * that is right for its question and wrong for this one: `SOURCE RANGE` sits inside the NUC
 * INSTR card, so the day anyone puts a button on that card an ancestor walk would go quietly
 * blind to exactly the defect this check exists for.
 *
 * WHAT IT DOES NOT COVER, measured rather than guessed:
 *   1. THE REVERSE DIRECTION IS NOT GATED. 24 pwr2 sites put a steady ring on something
 *      actionable, and they were adjudicated site by site as CORRECT: 21 are cards (watch the
 *      STEAM DUMP card, the RHR card, the BORON card), and `pwr_tmi2_incident` 6 and 8 watch
 *      the PORV — a clickable valve the player is being taught NOT to trust. "hl_watch must not
 *      be actionable" would red all of them. There is no rule here to enforce.
 *   2. THE RETIRED `pwr` POOL IS OUT OF SCOPE. Measured on this tree: 56 sites in
 *      `RD.MANUAL_PROCEDURES.pwr` fail the same invariant (`Plant Pressure`, `Tavg`, `SG Level`,
 *      `Source Range` in `hl`). That pool drives the retired engine, it is a separate
 *      adjudication, and gating it here would only invite a mass edit of steps nobody measured.
 *      The count is PRINTED below every run so it cannot quietly grow.
 *   3. IT SAYS NOTHING ABOUT WHETHER THE RING IS VISIBLE — a ring on a `display:none` element
 *      is still a resolved id (the #745 block above has the same blind spot, for the same
 *      reason: a static check cannot see the rendered board). The one live instance is narrow
 *      and was MEASURED, so do not write it up as the broad claim: with the 1/M window OPEN,
 *      `Plot point` rings correctly at 107x24; with the window SHUT it rings at 0x0 at (0,0).
 *      "Nothing inside a floating window can be ringed" is REFUTED. Separately, step 12's ✕
 *      (`[data-oom="close"]`, 27x22) can be ringed by no label at all, because `SHELL_TARGETS`
 *      holds exactly one entry — a vocabulary gap, not a rendering one.
 *   4. IT SAYS NOTHING ABOUT WHETHER THE STEP SHOULD BE PRESSING THAT CONTROL AT ALL. A step
 *      whose text forbids the press it rings passes here; that is a reading, not a wiring.
 * ============================================================================ */

// ============================================================================
// INOPERABLE-CLAIM CHECK (#304) — a manual may not call a control read-only
// while the board gives it a press handler.
//
// WHY. Three times in two days a chapter asserted control behaviour that
// `Manuals/03` — the control inventory, which owns this — already had right:
// N05's "selecting a load mode does not close the breaker" (#303, there is no
// breaker), 01 4.1's "shutdown bank ... read-only to operator" (it has
// Withdraw/Insert on the board and 03 3.3 documents the full stroke), and
// 01 6.0's "Follow (default)" (the shipped lineup is MANUAL). HR12 was widened
// to cover control behaviour in the same change; this is the half of it that
// can be mechanised.
//
// SCOPE, deliberately narrow. Only the NEGATIVE claim is checkable: "this
// control cannot be operated" is decidable against the wiring, whereas "this
// control does X" is not. A wrong claim about what a control DOES still gets
// past this — see the HR12 note. Narrow and silent beats broad and noisy: the
// phrase list below is short on purpose, because "not used for routine trim"
// (03 3.3, correct) must not fire while "read-only to operator" (01 4.1,
// wrong) must.
//
// OPERABLE = the label's card, or anything inside it, has a `press` or `hold`
// handler. `pressableIds()` excludes entries carrying only `active`/`warn`/
// `badge` — those decorate a control, they are not one.
// ============================================================================
var INOPERABLE_PHRASES = [
  'read-only', 'read only', 'not operable', 'cannot be operated', 'no operator control',
  'observation only', 'display only', 'indication only', 'not adjustable',
  'operator cannot', 'not an operator control',
];

(function inoperableClaims() {
  if (!globalThis.RD || !globalThis.RD.PwrBoardDriver || !globalThis.RD.PwrBoardInspect) return;
  var DRV = globalThis.RD.PwrBoardDriver, I = globalThis.RD.PwrBoardInspect;
  if (!DRV.pressableIds) return;

  // Every id that is, or is inside, something pressable.
  var operableIds = {};
  DRV.pressableIds().forEach(function (id) {
    var cur = id, guard = 0;
    while (cur && guard++ < 8) { operableIds[cur] = true; cur = I.parentOf(cur); }
  });
  var operable = DRV.controlLabels().filter(function (l) { return !!operableIds[DRV.controlLabelItem(l)]; });

  // DROP TERSE ALIASES. CONTROL_LABEL_MAP deliberately points several names at one card —
  // 'Mode', 'Load', 'Turbine Load' and 'Main Breaker' are all the generator card — and the
  // one-word ones are ordinary English in this domain. Measured: keyword-matching 'Mode'
  // fires on "Training display only; does not change plant MODE" (05), which is correct
  // prose about a plant MODE and nothing to do with the load-mode control. So a single-word
  // label is skipped WHEN A LONGER LABEL SHARES ITS CARD — that keeps 'Turbine Load' and
  // 'Shutdown Bank' while dropping 'Mode', 'Load', 'Boron', 'Nudge', 'NIS', 'HPI'. It is
  // self-maintaining: a new terse alias is excluded automatically. Unambiguous single words
  // with no longer sibling ('MSIV', 'SCRAM') are kept.
  operable = operable.filter(function (l) {
    if (/\s/.test(l)) return true;
    var card = DRV.controlLabelItem(l);
    return !operable.some(function (o) { return o !== l && o.length > l.length && DRV.controlLabelItem(o) === card; });
  });
  // Longest label first so "Turbine Load" is preferred over "Load" on a line carrying both.
  operable.sort(function (a, b) { return b.length - a.length; });
  // CASE-INSENSITIVE, and this is not cosmetic: the defect that motivated the check writes
  // "Shutdown bank" while CONTROL_LABEL_MAP holds "Shutdown Bank". The first cut matched
  // exactly and stayed GREEN on the real #304 text — caught only by re-injecting it.
  var operableLc = operable.map(function (l) { return l.toLowerCase(); });

  var MANUAL_DIR = path.join(__dirname, '..', 'Manuals');
  fs.readdirSync(MANUAL_DIR).filter(function (f) { return /\.md$/.test(f); }).forEach(function (f) {
    // The revision history QUOTES the defects it records ("01 4.1 called the shutdown
    // bank read-only"), so scanning it would fail the gate on its own changelog.
    if (f === '00_REVISION_HISTORY.md') return;
    var lines = fs.readFileSync(path.join(MANUAL_DIR, f), 'utf8').split(/\r?\n/);
    lines.forEach(function (line, i) {
      var low = line.toLowerCase();
      var phrase = INOPERABLE_PHRASES.filter(function (ph) { return low.indexOf(ph) >= 0; })[0];
      if (!phrase) return;
      var li = operableLc.reduce(function (acc, l, n) { return acc >= 0 ? acc : (low.indexOf(l) >= 0 ? n : -1); }, -1);
      if (li < 0) return;
      var label = operable[li];
      ck(f + ':' + (i + 1), false,
        'calls "' + label + '" ' + phrase.toUpperCase() + ', but the board gives it a press handler' +
        ' — see Manuals/03 and pwr_board_wiring.js (HR12: control behaviour is measurable)');
    });
  });
  console.log('\n' + B + 'Inoperable-claim scan' + X + D + '  (#304 — negative control claims vs the wiring)' + X);
  console.log('  operable board controls: ' + operable.length + ' of ' + DRV.controlLabels().length +
    '   phrases watched: ' + INOPERABLE_PHRASES.length);
})();

fs.mkdirSync(SCRATCH, { recursive: true });
fs.writeFileSync(path.join(SCRATCH, 'manual-audit.txt'),
  (mismatches.length ? mismatches.join('\n') : 'PASS — every controlled procedure step is mapped and reachable.') + '\n');

if (mismatches.length) mismatches.forEach(function (m) { console.log(R + '  ✗ ' + X + m); });
console.log('\n' + B + 'Coverage' + X + D + '  (STEP_UI is what verify_manual_follow iterates)' + X);
console.log('  controlled procedure steps: ' + controlled + '   mapped: ' + covered +
  (covered < controlled ? '   ' + R + '→ ' + (controlled - covered) + ' unverified' + X : '   ' + G + 'all covered' + X));
console.log('\n' + B + '──────────────────────────────────────────' + X);
console.log(B + (failed ? R + 'MANUAL CONTROLS: FAIL' : G + 'MANUAL CONTROLS: OK') + X + '  ' + checks + ' checks, ' + failed + ' failed' + X);
process.exit(failed ? 1 : 0);
