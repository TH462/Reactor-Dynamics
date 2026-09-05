/*
 * run_style.js — the prose gate for player-facing text.
 *
 * `Blueprint/STYLE_GUIDE.md` carries 41 numbered rules. Most of them are judgement
 * and stay judgement. This runner enforces the SEVEN that a regex can decide, on the
 * two corpora the player actually reads at the board: the live PWR2 checklist pool
 * (`ui/manual_procedures.js` → `RD.MANUAL_PROCEDURES.pwr2`) and the PWR alarm-tile
 * label pairs (`layers/control/pwr_control.js`).
 *
 *   node test/run_style.js
 *   node test/run_style.js --self-test    # prove every check can actually FAIL
 *
 * WHY IT EXISTS. The style guide's first version proposed that "the review checklist
 * and search-for-banned-words are the whole enforcement mechanism, deliberately".
 * That is not how anything else in this directory works, and the precedent is the
 * owner's *(OWNER RULING, 2026-08-10: selected "Cap at 25, evict to TRAPS.md")* — a
 * cap written in prose inside the document it governs does not hold; a cap in a
 * runner does. The doc-budget runner's own header puts it plainly: gated rather than
 * written in prose for the reason that file exists.
 *
 * EVERY CHECK HERE WAS AT ZERO WHEN IT WAS WRITTEN, deliberately, and that is the
 * whole design. A gate born red teaches the next person to read past it; a gate born
 * green fails the first time someone authors the thing it forbids. The two `must`
 * sites that existed in the pool on 2026-09-03 (pwr_heatup step 8, pwr_cooldown
 * step 7) were rewritten in the same change — the constraint they stated moved into
 * the `why` block, which is where it belonged.
 *
 * WHAT IT DOES NOT SCORE, and why. The BACKLOG counts printed below the checks —
 * over-cap step texts, and the banned-word tallies across `Manuals/` — are for a
 * human to read and are kept OFF the scraped tally line, the same split
 * `run_manual_units` makes for its coverage counts. The reason is what a moving
 * number MEANS. A scored count here would move on every ordinary prose edit, and a
 * gate that cries during ordinary edits teaches the next person to update the number
 * without reading it. A scored count in `run_hr3` moves when someone adds a leak,
 * which deserves a second look. Same mechanism, opposite conclusion.
 *
 * TWO TRAPS THIS RUNNER IS SUBJECT TO, stated so the next person does not inherit a
 * claim it cannot make:
 *
 *   1. THE ALARM HALF IS A SOURCE SCAN. It reads `label_learning:` / `label_industry:`
 *      string literals out of the control module. A source scan cannot tell you a
 *      string is REACHABLE — `/\(partial\)/` once passed green on
 *      `(false ? ' (partial)' : '')` (#485). So the claim is narrow and is only ever
 *      "these are the AUTHORED strings", never "this is what the player sees".
 *   2. THE CHECKLIST HALF READS THE BUILT OBJECT, NOT THE FILE. That is on purpose:
 *      the source file also contains the retired PWR pool and the BWR pool, and the
 *      BWR pool carries closed-up percents ('power ≈ 80%'). Grepping the file scores
 *      a plant that is on hold. `RD.MANUAL_PROCEDURES.pwr2` is the shipped plant.
 *
 * The scored checks are the vague-quantifier rule (W12), the modal rule (W16), the
 * reversal rule (W17), percent spacing (N4), the bare-megawatt rule (N6) and two
 * alarm-label shape rules (U4). Everything else in the guide is marked JUDGEMENT
 * there and must stay a review conversation: do not invent a check for a rule a grep
 * cannot decide, because a check that cannot fail is worse than no check.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

var SELF_TEST = process.argv.indexOf('--self-test') !== -1;
var ROOT = path.join(__dirname, '..');
var MANUAL_DIR = path.join(ROOT, 'Manuals');

// ---------------------------------------------------------------- the word lists

// W12. `approximately` is banned only WITHOUT a following number — "approximately
// 90%" is the guide's own counter-example and the reason the qualifier is here.
var VAGUE = /\b(slowly|rapidly|adequate|sufficient|as necessary|as required|periodically|soon|several|a few)\b|\bapproximately\b(?!\s*[~<>≈]?\s*[-+]?\d)/i;
var MODAL = /\b(shall|should|must)\b/i;
var REVERSAL = /\b(unless|except|however)\b/i;
// N4. A digit closed up against a percent sign. The board's render-time badges
// ('TRIP 25%') are exempt by scope: they are built in the wiring layer, not authored
// in the checklist pool, and two board checks assert those strings by name.
var TIGHT_PCT = /\d%/;
// N6. A bare megawatt. `MWe` and `MWt` are the only correct forms; fission power and
// core thermal power are equal ONLY at steady power.
var BARE_MW = /\d\s*MW(?![et])\b/;

// ---------------------------------------------------------------- the corpora

function loadChecklist() {
  require('../ui/manual_procedures.js');
  var pool = (globalThis.RD.MANUAL_PROCEDURES || {}).pwr2 || {};
  var steps = [];
  Object.keys(pool).forEach(function (key) {
    (pool[key].steps || []).forEach(function (st, i) {
      steps.push({ proc: pool[key].id || key, n: i + 1, step: st });
    });
  });
  return steps;
}

// Source scan — see trap 1 in the header. Pairs are read independently rather than
// zipped, because a mismatched count is not this runner's business to adjudicate.
function loadAlarmLabels() {
  var src = fs.readFileSync(path.join(ROOT, 'layers', 'control', 'pwr_control.js'), 'utf8');
  function pull(field) {
    var re = new RegExp(field + ":\\s*'((?:[^'\\\\]|\\\\.)*)'", 'g');
    var out = [], m;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
    return out;
  }
  return { learning: pull('label_learning'), industry: pull('label_industry') };
}

function loadManualText() {
  return fs.readdirSync(MANUAL_DIR)
    .filter(function (f) { return /\.md$/.test(f); })
    .map(function (f) {
      return { file: f, lines: fs.readFileSync(path.join(MANUAL_DIR, f), 'utf8').split('\n') };
    });
}

// ---------------------------------------------------------------- the checks
//
// Each carries its own `inject`, which is what makes --self-test honest: the mutation
// is written next to the assertion it is meant to break, so a check that can no
// longer fail is visible here rather than in a green run six months from now.

function stepFields(s, fields) {
  return fields.map(function (f) { return s.step[f]; }).filter(function (v) { return typeof v === 'string'; });
}

function scanSteps(data, fields, re) {
  var hits = [];
  data.steps.forEach(function (s) {
    stepFields(s, fields).forEach(function (txt) {
      var m = txt.match(re);
      if (m) hits.push(s.proc + ' step ' + s.n + ' — "' + m[0] + '" in: ' + txt.slice(0, 90));
    });
  });
  return hits;
}

var CHECKS = [
  {
    id: 'checklist_vague',
    rule: 'W12 — no vague quantifier in a checklist step',
    run: function (d) { return scanSteps(d, ['text', 'target', 'control', 'note'], VAGUE); },
    inject: function (d) { d.steps[0].step.text = 'Raise pressure slowly to the program point.'; },
  },
  {
    id: 'checklist_modal',
    rule: 'W16 — no shall/should/must in a checklist step (the step is an imperative)',
    run: function (d) { return scanSteps(d, ['text'], MODAL); },
    inject: function (d) { d.steps[0].step.text = 'The operator must open the valve.'; },
  },
  {
    id: 'checklist_reversal',
    rule: 'W17 — no unless/except/however in a checklist step (split into two conditionals)',
    run: function (d) { return scanSteps(d, ['text'], REVERSAL); },
    inject: function (d) { d.steps[0].step.text = 'Open the valve unless pressure is high.'; },
  },
  {
    id: 'checklist_percent',
    rule: 'N4 — a space before the percent sign (house style is 629 spaced to 12)',
    run: function (d) { return scanSteps(d, ['text', 'target', 'note'], TIGHT_PCT); },
    inject: function (d) { d.steps[0].step.target = 'level 40%'; },
  },
  {
    id: 'bare_megawatt',
    rule: 'N6 — never a bare MW; MWe for electrical output, MWt for thermal',
    run: function (d) {
      var hits = scanSteps(d, ['text', 'target', 'note', 'why'], BARE_MW);
      d.manual.forEach(function (f) {
        f.lines.forEach(function (l, i) {
          if (BARE_MW.test(l)) hits.push(f.file + ':' + (i + 1) + ' — ' + l.trim().slice(0, 90));
        });
      });
      return hits;
    },
    inject: function (d) { d.manual[0].lines.push('The plant is rated 100 MW gross.'); },
  },
  /* THE DETAILS PARAGRAPH IS SUPPLEMENTAL CONTEXT, NOT A CHAPTER *(OWNER, 2026-09-03, #619
   * item 12: "the click to expand description is way to verbose. nobody is going to read all
   * that… This text is a supplemental description to give a little context to the player about
   * the step. they should be no more than 2 or 3 sentences.")*.
   *
   * SENTENCES, NOT WORDS, and the reason is the corpus. The owner's rule is stated in
   * sentences; a word cap was tried first and it fought the units rule — the steps that must
   * carry "1972 psi (13.6 MPa)" three times run long in three sentences and would have been
   * "fixed" by deleting the SI pairs `run_manual_units` requires. So the scored check counts
   * sentences and the word count goes to the backlog below, unscored, the same split this
   * runner already makes for the twenty-word step cap.
   *
   * FOUR, not three, for the same reason every other cap here has a rung of slack: three is
   * the owner's guidance and four is where prose stops being supplemental and starts being a
   * chapter. When it binds, CUT — the reasoning belongs in the manual chapter the step cites.
   * At authoring: 61 of 61 pass, worst 3 sentences / 102 words (pwr_heatup step 8, the
   * accumulator window). Before this pass the worst was 9 sentences / 246 words. */
  {
    id: 'checklist_why_length',
    rule: 'W-detail — a step\'s details paragraph is supplemental context: at most 4 sentences',
    run: function (d) {
      return d.steps.filter(function (s) { return typeof s.step.why === 'string'; })
        .map(function (s) {
          var n = s.step.why.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)
            .filter(function (x) { return x.trim().length > 1; }).length;
          return { s: s, n: n };
        })
        .filter(function (r) { return r.n > 4; })
        .map(function (r) {
          return r.s.proc + ' step ' + r.s.n + ' — ' + r.n + ' sentences: ' + r.s.step.why.slice(0, 90);
        });
    },
    inject: function (d) {
      d.steps[0].step.why = 'One. Two. Three. Four. Five sentences is a chapter, not a note.';
    },
  },
  {
    id: 'industry_label_case',
    rule: 'U4 — an Industry alarm label is a terse board legend: upper case throughout',
    run: function (d) {
      return d.labels.industry.filter(function (s) { return /[a-z]/.test(s); })
        .map(function (s) { return 'label_industry: "' + s + '"'; });
    },
    inject: function (d) { d.labels.industry.push('Pressurizer Pressure Low'); },
  },
  {
    id: 'label_vague',
    rule: 'W12 — no vague quantifier in an alarm label, either register',
    run: function (d) {
      return d.labels.learning.concat(d.labels.industry)
        .filter(function (s) { return VAGUE.test(s); })
        .map(function (s) { return 'label: "' + s + '"'; });
    },
    inject: function (d) { d.labels.learning.push('Feedwater Flow Adequate'); },
  },
];

// ---------------------------------------------------------------- run

function build() {
  return { steps: loadChecklist(), labels: loadAlarmLabels(), manual: loadManualText() };
}

function words(s) { return s.trim().split(/\s+/).filter(Boolean).length; }

console.log('\n' + B + 'STYLE GUARD' + X + D + '  — Blueprint/STYLE_GUIDE.md, the rules a regex can decide' + X);
console.log(D + '  corpora: RD.MANUAL_PROCEDURES.pwr2 · layers/control/pwr_control.js labels · Manuals/*.md' + X + '\n');

if (SELF_TEST) {
  // Prove each check fails on its own injected violation, then that it passes clean.
  var selfFailed = 0;
  CHECKS.forEach(function (c) {
    var clean = build();
    var okClean = c.run(clean).length === 0;
    var dirty = build();
    c.inject(dirty);
    var firedDirty = c.run(dirty).length > 0;
    var ok = okClean && firedDirty;
    if (!ok) selfFailed++;
    console.log((ok ? G + 'CAN FAIL' : R + 'INERT  ') + X + '  ' + c.id +
      D + '  (clean: ' + (okClean ? 'green' : 'ALREADY RED') + ' · injected: ' + (firedDirty ? 'red' : 'STILL GREEN') + ')' + X);
  });
  console.log('\n' + B + '─'.repeat(42) + X);
  console.log(B + (selfFailed ? R + 'SELF-TEST: INERT CHECKS' : G + 'SELF-TEST: OK') + X +
    '  ' + CHECKS.length + ' checks, ' + selfFailed + ' failed');
  console.log(D + 'A self-test result is NOT a baseline — it says the harness can detect something, not that the corpus is clean.' + X);
  process.exit(selfFailed ? 1 : 0);
}

var data = build();
var failed = 0;

CHECKS.forEach(function (c) {
  var hits = c.run(data);
  if (hits.length) {
    failed++;
    console.log(R + 'FAIL' + X + '  ' + B + c.id + X + '  ' + D + c.rule + X);
    hits.slice(0, 8).forEach(function (h) { console.log('        ' + h); });
    if (hits.length > 8) console.log(D + '        …and ' + (hits.length - 8) + ' more' + X);
  } else {
    console.log(G + 'PASS' + X + '  ' + B + c.id + X + '  ' + D + c.rule + X);
  }
});

// ---------------------------------------------------------------- the backlog
//
// Printed for a human, kept OFF the scraped tally — see the header. These are known
// debts against rules the guide states, not regressions.

var over = data.steps.filter(function (s) { return s.step.text && words(s.step.text) > 20; });
var longest = data.steps.reduce(function (a, s) {
  return (s.step.text && words(s.step.text) > words(a.step && a.step.text || '')) ? s : a;
}, { step: { text: '' } });

function manualCount(re) {
  var n = 0;
  data.manual.forEach(function (f) { f.lines.forEach(function (l) { if (re.test(l)) n++; }); });
  return n;
}

console.log('\n' + D + '  backlog (reported, not scored — the guide states these rules and the corpus does not yet meet them):' + X);
console.log(D + '    step texts over the twenty-word cap (W2): ' + over.length + ' of ' +
  data.steps.filter(function (s) { return s.step.text; }).length +
  ' · longest ' + words(longest.step.text) + ' words (' + longest.proc + ' step ' + longest.n + ')' + X);
/* The DETAILS paragraph's word count, unscored — the scored half counts sentences (see the
 * `checklist_why_length` note). Reported because "3 sentences" and "short" are not the same
 * claim: a step carrying three US/SI pressure pairs runs long inside the cap, and that is the
 * corpus telling you the units rule and the brevity rule are pulling against each other. */
var whys = data.steps.map(function (s) { return s.step.why; })
  .filter(function (w) { return typeof w === 'string'; });
var whyW = whys.map(function (w) { return words(w); });
console.log(D + '    step details (why) word count: mean ' +
  Math.round(whyW.reduce(function (a, b) { return a + b; }, 0) / (whyW.length || 1)) +
  ' · longest ' + Math.max.apply(null, whyW.concat([0])) +
  ' · over 80 words: ' + whyW.filter(function (w) { return w > 80; }).length +
  ' of ' + whyW.length + X);
console.log(D + '    Manuals/ lines carrying a modal (W16): ' + manualCount(MODAL) +
  ' · a reversal (W17): ' + manualCount(REVERSAL) +
  ' · a vague quantifier (W12): ' + manualCount(VAGUE) + X);
console.log(D + '    the voice rule itself is not here and cannot be: threading technical, accessible and concise is judgement.' + X);

console.log('\n' + B + '─'.repeat(42) + X);
console.log(B + (failed ? R + 'STYLE GUARD: FAILED' : G + 'STYLE GUARD: OK') + X +
  '  ' + CHECKS.length + ' checks, ' + failed + ' failed');
console.log(D + 'OK means no banned construction was authored. It says nothing about whether the prose is any good.' + X);
process.exit(failed ? 1 : 0);
