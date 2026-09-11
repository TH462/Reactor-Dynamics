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

/* `story` (#670) EXPANDS TO ITS FOUR STRINGS. Named as one field at the call sites, so the
 * expansion lives here rather than in four checks.
 *
 * IT JOINS THE PROSE CHECKS AND NOT THE IMPERATIVE ONES, and the split is deliberate. Vague
 * quantifiers, closed-up percents, bare megawatts and SI units are wrong in any player-facing
 * string, so `story` joins all four. `checklist_modal` (W16) and `checklist_reversal` (W17) scan
 * `['text']` only and state a rule about the STEP BEING AN IMPERATIVE — a narrative field is
 * past-tense reporting, where "the crew believed the valve should have shut" is correct and
 * forbidding it would be a category error. `why` is treated the same way for the same reason. */
var STORY_KEYS = ['clock', 'saw', 'knew', 'did'];
function stepFields(s, fields) {
  var out = [];
  fields.forEach(function (f) {
    if (f === 'story') {
      var sy = s.step.story;
      if (sy) STORY_KEYS.forEach(function (k) { if (typeof sy[k] === 'string') out.push(sy[k]); });
      return;
    }
    if (typeof s.step[f] === 'string') out.push(s.step[f]);
  });
  return out;
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
    run: function (d) { return scanSteps(d, ['text', 'target', 'control', 'note', 'story'], VAGUE); },
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
    run: function (d) { return scanSteps(d, ['text', 'target', 'note', 'story'], TIGHT_PCT); },
    inject: function (d) { d.steps[0].step.target = 'level 40%'; },
  },
  {
    id: 'bare_megawatt',
    rule: 'N6 — never a bare MW; MWe for electrical output, MWt for thermal',
    run: function (d) {
      var hits = scanSteps(d, ['text', 'target', 'note', 'why', 'story'], BARE_MW);
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
   * "fixed" by deleting the SI pairs `run_manual_units` requires. (That argument is now spent
   * on its own terms — the 2026-09-06 ruling took SI out of the checklists entirely — but the
   * split stands, because the rule the owner stated is a SENTENCE rule and this is the check
   * that enforces it. The step LINE's word cap is its own scored check below.)
   *
   * THREE, NOT FOUR (#692, 2026-09-11). It was four, with a comment arguing that "three is the
   * owner's guidance and four is where prose stops being supplemental and starts being a
   * chapter" — a gate deliberately set one rung looser than the rule it enforces. He has now
   * said 2-3 TWICE *(OWNER, 2026-09-03, #619 item 12: "they should be no more than 2 or 3
   * sentences."; OWNER, 2026-09-09 playtest sheet §B, filed as #692: "Steps shouldn't be more
   * than 2-3 sentences.")*, and a gate looser than a twice-stated owner rule is the gate being
   * wrong. Seven blocks sat in the one-sentence gap it left open and were rewritten in the same
   * change. When it binds, CUT — the reasoning belongs in the manual chapter the step cites. */
  {
    id: 'checklist_why_length',
    rule: 'W-detail — a step\'s details paragraph is supplemental context: at most 3 sentences',
    run: function (d) {
      return d.steps.filter(function (s) { return typeof s.step.why === 'string'; })
        .map(function (s) {
          var n = s.step.why.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)
            .filter(function (x) { return x.trim().length > 1; }).length;
          return { s: s, n: n };
        })
        .filter(function (r) { return r.n > 3; })
        .map(function (r) {
          return r.s.proc + ' step ' + r.s.n + ' — ' + r.n + ' sentences: ' + r.s.step.why.slice(0, 90);
        });
    },
    inject: function (d) {
      d.steps[0].step.why = 'One. Two. Three. Four sentences is a chapter, not a note.';
    },
  },
  /* THE STEP LINE'S WORD CAP, SCORED (#692, 2026-09-11). `Blueprint/STYLE_GUIDE.md` W2 caps a
   * step's instruction line at TWENTY WORDS and has done since the guide was written. Nothing
   * enforced it: the count was printed in the BACKLOG block below, unscored, on the argument
   * quoted in this runner's header — that a moving number teaches the next person to update it
   * without reading it.
   *
   * THAT ARGUMENT WAS WRONG HERE, and the measurement is what says so. The backlog number went
   * 0 of 61 (at authoring) to 8 of 67 to 46 of 67 to 55 of 89 across four authoring passes, and
   * the guide's own prose still claimed "0 of 61 shipped step texts exceed 20 words" on the day
   * #692 was filed. An unscored count did not get read; it got inherited. The owner reported the
   * symptom himself twice — "Many steps are too wordy. The step text and the info text."
   *
   * WORDS, NOT SENTENCES, and that is the whole point of having both checks. Measured on the
   * pool the day #692 was filed: 0 of 85 step lines exceeded three sentences and 54 of them
   * exceeded twenty words, longest 58 (`pwr_heatup` step 10). The sentence rule was already
   * satisfied by a pool the owner was reading as too wordy, because a 58-word instruction can
   * be three sentences. The sentence cap governs the DETAILS paragraph; this governs the LINE.
   *
   * WHITESPACE SPLIT, deliberately naive, matching the backlog counter it replaces so the two
   * numbers cannot disagree. "1615 psi" is two words and "AVG COOLANT TEMPERATURE" is three;
   * the cap is a reading-length budget, not a token count, and a tile name genuinely costs the
   * reader three words. When it binds, move the displaced clause to `note` (which renders under
   * the active step) or to `target` — not into the `why`, which has its own cap. */
  {
    id: 'checklist_text_words',
    rule: 'W2 — a step\'s instruction line is at most 20 words (move the rest to note/target)',
    run: function (d) {
      return d.steps.filter(function (s) { return typeof s.step.text === 'string'; })
        .map(function (s) { return { s: s, n: words(s.step.text) }; })
        .filter(function (r) { return r.n > 20; })
        .map(function (r) {
          return r.s.proc + ' step ' + r.s.n + ' — ' + r.n + ' words: ' + r.s.step.text.slice(0, 90);
        });
    },
    inject: function (d) {
      d.steps[0].step.text = 'Press AUTO on the STEAM DUMP card until its status reads PRESS, ' +
        'then lower the DUMP SETPOINT box fifty pounds at a time all the way down to 120 psi.';
    },
  },
  /* NO SI IN THE LIVE CHECKLIST *(OWNER RULING, 2026-09-06: "DO not include SI. There will be
   * an option to switch between imperial and SI but i dont think thats been implemented yet.")*.
   * The board prints no SI anywhere, and both readability reviews found the "(15.41 MPa)" pair
   * doubling the densest lines in a 42-character column (Blueprint/CHECKLIST_WRITING_GUIDE.md
   * §6). Every player-facing string of the pwr2 pool, including the generated done-when labels
   * and the leg-level prose the picker draws. `run_manual_units` cannot gate this: it only
   * asks that an SI value HAVE a US partner, so a pool with no SI passes it trivially. */
  {
    id: 'checklist_no_si',
    rule: 'U-ruling — no SI unit in any player-facing checklist string (board is US; SI toggle not built)',
    run: function (d) {
      var SI = /\b(MPa|kPa)\b|°C\b/;
      var hits = [];
      function chk(where, s) { if (typeof s === 'string' && SI.test(s)) hits.push(where + ' — "' + s.match(SI)[0] + '" in: ' + s.slice(0, 80)); }
      var pool = (globalThis.RD.MANUAL_PROCEDURES || {}).pwr2 || [];
      pool.forEach(function (p) {
        ['title', 'purpose', 'outcome'].forEach(function (k) { chk(p.id + '.' + k, p[k]); });
        (p.prereq || []).forEach(function (s, i) { chk(p.id + '.prereq' + i, s); });
        (p.cautions || []).forEach(function (s, i) { chk(p.id + '.caution' + i, s); });
        (p.precond || []).forEach(function (c, i) { chk(p.id + '.precond' + i, c.text); });
      });
      d.steps.forEach(function (s) {
        ['text', 'note', 'why', 'target', 'wait_hint'].forEach(function (k) { chk(s.proc + ' step ' + s.n + '.' + k, s.step[k]); });
        // the incident walkthrough's narrative block (#670) — four strings on the card, bound by
        // the ruling exactly as `why` is. It is prose ABOUT a plant, which is where an "(11 MPa)"
        // is most likely to be written without thinking.
        if (s.step.story) STORY_KEYS.forEach(function (k) { chk(s.proc + ' step ' + s.n + '.story.' + k, s.step.story[k]); });
        (s.step.accs || []).forEach(function (a, j) { chk(s.proc + ' step ' + s.n + '.accs' + j, a.label); });
        if (s.step.overtaken) { chk(s.proc + ' step ' + s.n + '.overtaken', s.step.overtaken.text); chk(s.proc + ' step ' + s.n + '.overtaken', s.step.overtaken.label); }
      });
      return hits;
    },
    inject: function (d) { d.steps[0].step.target = 'PRIMARY PRESSURE 2235 psi (15.41 MPa)'; },
  },
  /* THE NARRATIVE BLOCK IS FOUR LINES, NOT FOUR PARAGRAPHS (#670 Phase 1).
   *
   * `checklist_why_length` does not reach `story` and should not: the two answer different
   * questions (the plant lesson vs. what happened that morning) and share no budget. But the
   * story block sits ABOVE the numbered instruction and is ALWAYS drawn — it is not behind the
   * details fold — so its length is paid on every step of an incident walkthrough, which is the
   * same argument that made F2 load-bearing at #660 item 3. TWO sentences per field, half the
   * `why` cap, because there are four of them: a step whose four narrative fields each ran to
   * the `why` cap would put eight sentences over the instruction.
   *
   * PER FIELD, not per block, so the cap cannot be gamed by moving prose from `did` into `knew`
   * — each line has its own job and a long one means the wrong material is in it. `clock` is
   * counted like the rest even though it is a timestamp: a `clock` long enough to trip this is
   * carrying narrative that belongs in `saw`.
   *
   * When it binds, CUT. The long-form account lives in `Manuals/08_ACCIDENT_TMI.md` and the step
   * cites it. */
  {
    id: 'checklist_story_length',
    rule: 'W-story — an incident step\'s narrative field is at most 2 sentences (it is drawn above the instruction, always)',
    run: function (d) {
      var hits = [];
      d.steps.forEach(function (s) {
        if (!s.step.story) return;
        STORY_KEYS.forEach(function (k) {
          var v = s.step.story[k];
          if (typeof v !== 'string') return;
          var n = v.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)
            .filter(function (x) { return x.trim().length > 1; }).length;
          if (n > 2) hits.push(s.proc + ' step ' + s.n + '.story.' + k + ' — ' + n + ' sentences: ' + v.slice(0, 90));
        });
      });
      return hits;
    },
    inject: function (d) {
      d.steps[0].step.story = { clock: '04:00', saw: 'One. Two. Three sentences is a paragraph.',
                                knew: 'Short.', did: 'Short.' };
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
/* The step-line word count is SCORED since #692 (`checklist_text_words`). It stays printed here
 * because the DISTRIBUTION is what an author needs — "0 over cap, longest 20" and "0 over cap,
 * longest 11" are very different pools and the pass/fail line cannot say which one you have. */
console.log(D + '    step texts over the twenty-word cap (W2 — now SCORED above): ' + over.length + ' of ' +
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
