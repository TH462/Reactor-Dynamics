/*
 * run_manual_notmodelled.js — DOES A NOT-MODELLED PROTECTION STAY DEAD IN EVERY OTHER CHAPTER? (#626)
 *
 * `Manuals/09_SETPOINTS_LIMITS.md` has been re-measured against the shipped PWR2 (Pressurized
 * Water Reactor, generation 2) engine and marks a list of protections **NOT MODELLED** — the
 * plant genuinely does not have them (see the row-by-row evidence already in that chapter: e.g.
 * `pwr2_containment` declares `ctmt_spray_active` permanently false, `ctmt_h2_burned` is a
 * registered static zero). Meanwhile other chapters — `06_ALARM_RESPONSE.md`,
 * `12_SIM_PHYSICS.md`, and in principle any other — were written or last revised BEFORE that
 * re-measurement, or before an engine change retired a function 09 used to carry, and can go on
 * teaching a response to, or a mechanism for, a protection that no longer exists.
 *
 * THAT IS HOW #532 HAPPENED (six sites taught an engineered-safeguards arm that never existed)
 * and it is issue #626's own finding: `06` PWR-A13a/A14 taught a 12 % reactor trip and an
 * SI-on-low-level path the SAME DAY 09 §2.0/§3.0 declared both absent, and nothing gated it —
 * `run_manual_setpoints` (#532) reads chapter 09's OWN tables against the engine; `run_manual_
 * commands` reads the command table; `run_manual_units` reads number formatting. A chapter
 * teaching a response to a protection 09 declares absent is invisible to all three, because none
 * of them reads a SECOND chapter's prose at all. Measured at the time this runner was written
 * (2026-09-18, before the #626 bundle landed): chapter 12 §12.4d/e and line 706 describe
 * containment spray, fan-cooler safety realign, an unblockable containment SI backup, an
 * automatic steam-line isolation and a hydrogen ignition — ALL FIVE marked NOT MODELLED in the
 * SAME TREE'S chapter 09 — and chapter 06 still carries the 12 % PZR-level trip and the
 * SI-on-level path from issue #626 itself.
 *
 * THE DESIGN: chapter 09 is read as the MACHINE-READABLE AUTHORITY — every `**NOT MODELLED**`
 * row is parsed out of its tables, never hand-copied into this file, so a NEW absent protection
 * (09 declaring one more function dead) is picked up automatically. What IS hand-authored is the
 * BRIDGE from a 09 row to the words another chapter would use to teach it as live — that step is
 * unavoidable (a row's own wording, e.g. "HPI start (SI on PZR level lo-lo)", is not the phrase a
 * human writes in prose, e.g. "SI initiates on PZR level lo-lo") — so it is kept SMALL, EXPLICIT,
 * and ITS COVERAGE IS ASSERTED BOTH WAYS: every row 09 marks NOT MODELLED must be claimed by
 * exactly one BRIDGE entry (an unclaimed row FAILS, so a new NOT MODELLED row with no bridge
 * entry cannot slip past silently — same idiom `run_manual_setpoints` uses for its own ROWS map),
 * and every BRIDGE entry must still match a real 09 row (a stale entry pointing at nothing FAILS
 * too, so a row that stops being NOT MODELLED — like #601's rod stop, like #624's letdown
 * isolation — cannot leave a dead bridge silently passing).
 *
 * WHAT IT READS: every `.md` file directly under `Manuals/` whose name starts with two digits
 * (`0X_*` / `1X_*`), EXCEPT `09_SETPOINTS_LIMITS.md` itself (which is the authority, not a
 * suspect) — so `01, 02, 03, 04, 05, 06, 07, 08, 10, 11, 12`. `00_REVISION_HISTORY.md`,
 * `README.md`, `ISSUES_AND_FINDINGS.md` and the two `CAMPAIGN_*` docs are NOT numbered-chapter
 * files and are not scanned (a changelog and internal working docs, not player-facing teaching).
 *
 * WHAT IT CANNOT SEE:
 *   - It works LINE BY LINE. This manual set's convention is one logical row/paragraph per
 *     physical line (a markdown pipe table cannot embed a newline), which is why that is a safe
 *     unit here — but a live-teaching claim and its own hedge split across TWO lines (e.g. a
 *     sentence that continues "...but not on this plant" in the NEXT line) would be invisible:
 *     the live signal fires on its line, the hedge is never checked against it.
 *   - It is a SIGNATURE MATCH, not a semantic parse. The BRIDGE's `live` patterns are phrased
 *     from what this codebase's chapters currently say (or said, per #626 and this run's own
 *     first pass) about each function; a rewrite that describes the same wrong mechanism in
 *     unanticipated words will not be caught. This is the same exposure `run_manual_setpoints`
 *     names for its own ROWS map, and the reason both files assert COVERAGE rather than trusting
 *     a hand-written pattern to be complete: coverage catches a row with NO bridge at all, not a
 *     bridge whose wording has gone stale.
 *   - It reads WORDS, not the engine. It cannot tell you the 09 marking itself is right — that is
 *     `run_manual_setpoints`' job, checking 09 against `pwr2_protection` and its siblings.
 *   - A hedge pattern anywhere on the line clears a live-signal match on that SAME line, even if
 *     the hedge is about a DIFFERENT clause of a long combined sentence. Long rows (chapter 12's
 *     numbered-table entries run to hundreds of words on one physical line) are the case where
 *     this could hide a real defect sitting far from an unrelated hedge on the same line — none
 *     was found in the corpus scanned when this was written, but it is a structural gap, not a
 *     covered case.
 *
 * Run: node test/run_manual_notmodelled.js
 * Test override: RD_NOTMODELLED_MANUALS_DIR=<path> points the whole run at a different manuals
 * directory (used for the injection self-test below; never set in normal use).
 */
'use strict';
var fs = require('fs');
var path = require('path');

var RED = '[31m', GREEN = '[32m', BOLD = '[1m', DIM = '[2m', RST = '[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  var ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? '  ' + GREEN + 'PASS' + RST + '  ' : '  ' + RED + 'FAIL' + RST + '  ') + name +
              (note ? '  -- ' + note : ''));
  return ok;
}

var MANUALS_DIR = process.env.RD_NOTMODELLED_MANUALS_DIR ||
                   path.join(__dirname, '..', 'Manuals');
var CH09 = '09_SETPOINTS_LIMITS.md';

/* Strip markdown emphasis and normalize the two-character subscript this chapter uses (H₂) so a
 * hand-written BRIDGE key can be plain ASCII. Lower-cased for a case-insensitive exact match. */
function normLabel(s) {
  return s.replace(/\*\*/g, '').replace(/₂/g, '2').replace(/\s+/g, ' ').trim().toLowerCase();
}

/* ---- 1. PARSE CHAPTER 09's NOT-MODELLED ROWS — the machine-readable authority ---------------
 * Any pipe-table row anywhere in the file whose FIRST bolded marker is NOT MODELLED. Column
 * position and table identity do not matter here: all this file needs from a row is its own
 * label (first cell) — the row's SETPOINT VALUE and its NUMERIC truth are `run_manual_setpoints`'
 * job, not this one's. */
var ch09Path = path.join(MANUALS_DIR, CH09);
var ch09 = fs.readFileSync(ch09Path, 'utf8').replace(/\r\n/g, '\n');
var notModelledRows = [];
ch09.split('\n').forEach(function (line, i) {
  if (line.charAt(0) !== '|') return;
  if (!/\*\*\s*NOT MODELLED/i.test(line)) return;
  var cells = line.split('|').slice(1, -1).map(function (c) { return c.trim(); });
  if (!cells.length || !cells[0]) return;
  notModelledRows.push({ label: cells[0], norm: normLabel(cells[0]), lineNo: i + 1, raw: line });
});

console.log('\n' + BOLD + 'CHAPTER 09\'S NOT-MODELLED ROWS vs EVERY OTHER MANUAL CHAPTER  (#626)' + RST);
/* THE FLOOR WAS A MAGIC NUMBER AND IT EXPIRED (#784, 2026-09-21). This asserted
 * `notModelledRows.length >= 10`, which is a claim about HOW MUCH OF THE PLANT IS UNBUILT --
 * it reddens every time a system gets built, which is the plant improving. Four rows retired the
 * day containment spray, the fan coolers and the steam-line isolation went in, and the floor
 * reported that as a parse failure.
 *
 * What this check is actually for is the parser: a markdown change that turns a NOT MODELLED row
 * into something the `line.charAt(0) === '|'` scan no longer sees would leave this whole gate
 * silently measuring nothing -- the EMPTY failure mode, which reads exactly like success. So
 * assert the parse against an INDEPENDENT count of the marker in the chapter, and that every
 * parsed row carries a label. A row that stops being a table row now reddens; a row that is
 * legitimately built and removed does not. */
var markerHits = ch09.split('\n').filter(function (l) { return /\*\*\s*NOT MODELLED/i.test(l); }).length;
var unlabelled = notModelledRows.filter(function (r) { return !r.label || !r.norm; });
ck('chapter 09\'s NOT MODELLED rows parse -- every marker in the chapter is a parsed, labelled row',
   notModelledRows.length > 0 && notModelledRows.length === markerHits && unlabelled.length === 0,
   notModelledRows.length + ' rows parsed of ' + markerHits + ' markers in the chapter' +
   (unlabelled.length ? ', ' + unlabelled.length + ' UNLABELLED' : '') + ': ' +
   notModelledRows.map(function (r) { return r.label; }).join(' | '));

/* ---- 2. THE BRIDGE — hand-authored, small, on purpose ----------------------------------------
 * Keyed by the NORMALIZED 09 label. `live`: patterns that fire if another chapter teaches the
 * function as acting. `hedge` (chapter-local, in addition to GLOBAL_HEDGE below): extra
 * disclaiming phrasing specific to this row's own likely correct wording, so a chapter that gets
 * it RIGHT is not flagged for merely mentioning the function by name. */
var GLOBAL_HEDGE = [
  /not modell?ed/i,
  /does not exist/i,
  /there is no\b/i,
  /\bno\b\s+(such\s+)?(automatic|auto)\b/i,
  /this (plant|one) (does not|has no)/i,
  /\bno\b\s+(spray|fan.?cooler|recombiner|switch)/i,
  /nothing actuates/i,
  /trips? on neither/i,
  /trips? nothing/i,
  /starts? nothing/i,
  /never existed/i,
  /is not (built|modell?ed|reachable)/i,
  /not built/i,
  /does not (ignite|trip|scram|actuate|isolate)/i,
  /cannot (ignite|trip|scram)/i,
  /has no such/i,
  /no\b.{0,20}(reactor )?trip on this plant/i,
  /is (a|the) registered static (zero|0|false)/i
];

var BRIDGE = {
  'tavg': {
    id: 'Tavg high -- reactor trip',
    live: [/high[- ]?tavg\w*.{0,40}(reactor )?(trip|scram)/i, /(reactor )?(trip|scram).{0,40}high[- ]?tavg/i]
  },
  'pzr level': {
    /* DIRECTIONAL ON PURPOSE, TWICE OVER. (1) This plant's PZR level trip is NOT MODELLED only on
     * the LOW side -- the HIGH side (PI-8, going-solid backstop, 09 Section 2.0) is real and armed
     * above P-7, and chapter 06 correctly teaches a response to IT. A direction-blind pattern
     * (just "pzr level" near "SCRAM") caught that legitimate row as a false positive when this was
     * written ("do not throttle on high PZR level"). (2) A bare "lo-lo" near "SCRAM" is ALSO not
     * enough on its own -- the SG (steam generator) level lo-lo trip is real (09 Section 2.0) and
     * chapter 06/07 correctly teach it ("Low SG level -> SCRAM (17 %, lo-lo)"), and a qualifier-
     * free "lo-lo" pattern caught that too. So every pattern below anchors the low-side marker to
     * PZR/pressurizer explicitly, or -- for the plain "12 %" figure, specific enough on its own on
     * this plant -- keeps the proximity to the trip word tight (20 chars, not 60). */
    id: 'PZR (pressurizer) level low -- reactor trip',
    live: [/\b(pzr|pressurizer)\s*(lvl|level)?\s*lo-?lo\b.{0,60}(SCRAM|reactor trip)/i,
           /(SCRAM|reactor trip).{0,60}\b(pzr|pressurizer)\s*(lvl|level)?\s*lo-?lo\b/i,
           /\blow\s*(pzr|pressurizer)\s*level\b.{0,60}(SCRAM|reactor trip)/i,
           /(SCRAM|reactor trip).{0,60}\blow\s*(pzr|pressurizer)\s*level\b/i,
           /\b12\s?%\b.{0,20}(SCRAM|reactor trip)/i,
           /(SCRAM|reactor trip).{0,20}\b12\s?%\b/i]
  },
  'source range': {
    id: 'Source range high flux -- reactor trip',
    live: [/source range.{0,50}(reactor )?(trip|scram)/i, /(reactor )?(trip|scram).{0,50}source range/i]
  },
  'sr re-energize block': {
    id: 'SR (source range) re-energize block interlock',
    live: [/re-?energi\w*.{0,60}(block|interlock)/i, /(block|interlock).{0,60}re-?energi\w*/i]
  },
  'hpi start (si on pzr level lo-lo)': {
    id: 'HPI (high-pressure injection) / SI (safety injection) start on PZR level lo-lo',
    live: [/SI initiates? on (pzr|pressurizer) level/i, /\bauto\s*SI\b/i, /HPI auto-actuation/i,
           /safety injection.{0,40}(level lo-?lo|low pressurizer level)/i]
  },
  'main steam line isolation (msli)': {
    id: 'MSLI (main steam line isolation) on low steam pressure',
    live: [/steam lines?\s+isolate\w*\s+automatically/i,
           /automatic\w*.{0,30}(main )?steam line isolation/i,
           /shuts? the MSIV without any operator action/i,
           /MSIV (closes|shuts).{0,30}(automatic\w*|on low steam pressure)/i]
  },
  /* RETIRED 2026-09-21 (#784, OWNER RULING "Authorise it -- auto-only"). FOUR entries stood here:
   * 'msli (containment leg)', 'si backup (containment)', 'containment spray' and
   * 'fan coolers, safety realign'. They are GONE because the systems are BUILT -- containment
   * spray, the recirculation fan coolers and the steam-line isolation now actuate automatically
   * inside the PWR2 engine on the sourced 3.5 psig (0.1254 MPa) and 30 psig (0.3082 MPa)
   * setpoints; chapter 09 no longer marks those four rows NOT MODELLED, and chapter 06's PWR-A36
   * to PWR-A39 cards now teach them as live. Keeping the entries would have made this gate red on
   * prose that is CORRECT.
   *
   * THE GATE SAID SO ITSELF, and that is the part worth keeping. Direction 2 -- "every BRIDGE
   * entry still points at a row chapter 09 actually marks NOT MODELLED" -- caught all four the
   * moment the manual was updated. A hand-maintained map is a thing a gate TESTS, never a thing a
   * gate silently TRUSTS (CLAUDE.md's standing list), and this file was built knowing that.
   *
   * The HYDROGEN entries below stay: the recombiners and the burn are still unmodelled. */
  'h2 recombiners, auto-start': {
    id: 'H2 (hydrogen) recombiners, auto-start',
    live: [/recombiners?.{0,20}(auto-?start|started automatically|in service)/i,
           /started automatically.{0,30}recombiner/i]
  },
  'h2 ignition (the burn)': {
    id: 'H2 (hydrogen) ignition -- the deflagration burn',
    live: [/hydrogen.{0,60}(ignit\w*|deflagrat\w*)/i, /\bburn\b.{0,40}(occurred|spike|containment pressure)/i,
           /the hydrogen ignited/i]
  },
  'step load change': {
    id: 'Step load change on a raise (10% step, as opposed to a ramp)',
    live: [/step (load )?(change|increase|raise)\b.{0,40}(10\s?%|permitted|allowed|possible)/i]
  }
};

/* Coverage, direction 1: every row 09 marks NOT MODELLED must be claimed. An unclaimed row is
 * the exact failure this design is exposed to (see the file header) — assert it first. */
var unclaimed = notModelledRows.filter(function (r) { return !BRIDGE[r.norm]; });
ck('every chapter-09 NOT MODELLED row has a BRIDGE entry -- an unclaimed row would go unchecked',
   unclaimed.length === 0,
   unclaimed.length ? unclaimed.map(function (r) { return r.label + ' (line ' + r.lineNo + ')'; }).join(' | ')
                     : notModelledRows.length + ' rows, all claimed');

/* Coverage, direction 2: every BRIDGE entry must still point at a real row. A stale entry (the 09
 * row stopped being NOT MODELLED, e.g. #601, #624) would otherwise pass silently forever. */
var claimedNorms = {};
notModelledRows.forEach(function (r) { claimedNorms[r.norm] = true; });
var staleBridge = Object.keys(BRIDGE).filter(function (k) { return !claimedNorms[k]; });
ck('every BRIDGE entry still points at a row chapter 09 actually marks NOT MODELLED',
   staleBridge.length === 0,
   staleBridge.length ? staleBridge.map(function (k) { return BRIDGE[k].id; }).join(' | ')
                       : Object.keys(BRIDGE).length + ' bridge entries, all live');

/* ---- 3. SCAN EVERY OTHER NUMBERED CHAPTER -----------------------------------------------------
 * Line by line (see the file header for why a line is the right unit here and where that stops
 * being true). A finding is a live-signal match on a line that carries NO hedge (global or the
 * row's own extra hedges, none currently defined) anywhere on that same line. */
/* Numbered CHAPTER files only, 09 (the authority) excluded. `00_REVISION_HISTORY.md` matches the
 * two-digit prefix too but is a changelog, not player-facing teaching, so it is named out
 * explicitly rather than trusted to the digit pattern alone -- a bug caught while writing this
 * (the first pass scanned it and reported changelog LINES as if they taught a dead protection). */
var chapterFiles = fs.readdirSync(MANUALS_DIR)
  .filter(function (f) { return /^\d{2}_.*\.md$/.test(f) && f !== CH09 && f !== '00_REVISION_HISTORY.md'; })
  .sort();

console.log(DIM + '  scanning: ' + chapterFiles.join(', ') + RST);

var findingsByRow = {};   // norm -> [ {file, lineNo, text} ]
Object.keys(BRIDGE).forEach(function (k) { findingsByRow[k] = []; });

/* THE UNIT OF TEACHING IS THE SECTION, NOT THE LINE (#626, corrected 2026-09-18).
 *
 * The first cut of this gate matched line-by-line and cleared a match only with a hedge on
 * that SAME line. Run against the finished bundle it produced SIX reds of which FIVE were its
 * own false positives -- four were markdown HEADINGS ("## PWR-A38 -- Containment Spray
 * Running"), which name a board tile and assert nothing at all, and two were `| Setpoint |`
 * rows naming the sourced REAL-plant signal. In every one of those cases the chapter hedged
 * correctly two lines below ("declared static false on this plant, always -- this tile can
 * never light"). A gate that is wrong five times out of six is a gate that gets re-banded and
 * then ignored, which is the failure mode CLAUDE.md's standing list already names.
 *
 * Two changes, and the second is the one with a cost:
 *   1. A HEADING NEVER MATCHES. It is a name. This is free -- a heading cannot teach a
 *      mechanism as live, so nothing is lost.
 *   2. A hedge anywhere in the enclosing BLOCK -- a run of consecutive non-blank lines --
 *      clears matches in that block. A markdown table is one block, so an alarm card's
 *      `| Setpoint |` row naming the sourced REAL-plant signal is governed by the `| Means |`
 *      row directly beneath it that says the plant does not act on it. A blank line ends the
 *      block, so a separate PARAGRAPH does not lend its hedge to its neighbours.
 *
 *      THE SECTION WAS TRIED FIRST AND WAS WRONG -- it is recorded here because it looked
 *      obviously right and took a real defect with it. Scoping the hedge to the whole `###`
 *      section turned this gate green at 16/16, INCLUDING `12_SIM_PHYSICS.md` §8.5, where the
 *      hedge "There is NO containment-pressure leg on this plant" cleared an unrelated and
 *      still-wrong claim four lines up that the steam lines isolate automatically on high
 *      steam flow coincident with low steam pressure -- which chapter 09 marks NOT MODELLED
 *      on every signal. One hedge about one mechanism silently vouched for a different one.
 *      The block is the widest scope that cannot do that.
 */
function blockHedges(lines) {
  /* index -> true if the BLOCK containing this line (consecutive non-blank lines) hedges */
  var out = new Array(lines.length), bounds = [], start = null;
  lines.forEach(function (l, i) {
    if (l.trim()) { if (start === null) start = i; }
    else if (start !== null) { bounds.push([start, i]); start = null; }
  });
  if (start !== null) bounds.push([start, lines.length]);
  bounds.forEach(function (b) {
    var hedged = false;
    for (var i = b[0]; i < b[1] && !hedged; i++) {
      var t = lines[i].replace(/\*\*/g, '').replace(/₂/g, '2');
      hedged = GLOBAL_HEDGE.some(function (h) { return h.test(t); });
    }
    for (var j = b[0]; j < b[1]; j++) out[j] = hedged;
  });
  return out;
}

chapterFiles.forEach(function (fname) {
  var text = fs.readFileSync(path.join(MANUALS_DIR, fname), 'utf8').replace(/\r\n/g, '\n');
  var lines = text.split('\n');
  var secHedged = blockHedges(lines);
  lines.forEach(function (line, i) {
    if (!line.trim()) return;
    if (/^#{1,6}\s/.test(line)) return;          /* a heading is a NAME, not a claim */
    if (secHedged[i]) return;                     /* the block hedged; that governs the block */
    /* Markdown emphasis is stripped before every pattern runs, on BOTH live signals and hedges.
     * Caught while writing this: "There is **no** high-Tavg reactor trip" is a correct hedge that
     * a literal `/there is no\b/i` MISSES, because the bold markers sit between the two words --
     * the exact false positive `normLabel` (above) already had to solve for chapter 09's own
     * labels. Same fix, same reason, applied to every line this loop reads. */
    var t = line.replace(/\*\*/g, '').replace(/₂/g, '2');
    var hedged = GLOBAL_HEDGE.some(function (h) { return h.test(t); });
    Object.keys(BRIDGE).forEach(function (norm) {
      var spec = BRIDGE[norm];
      /* Keep the MATCH, not just the line's opening -- these rows run to hundreds of characters
       * (chapter 12's numbered-table entries especially) and a blind prefix slice reliably missed
       * the very phrase that tripped the check, which is exactly the "what does this gate READ"
       * question the header promises an answer to. */
      var m = null;
      for (var s = 0; s < spec.live.length && !m; s++) { spec.live[s].lastIndex = 0; m = spec.live[s].exec(t); }
      if (!m) return;
      if (hedged) return;
      var idx = Math.max(0, m.index - 60);
      var snippet = (idx > 0 ? '...' : '') + t.slice(idx, m.index + m[0].length + 60).trim() +
                    (idx + 120 < t.length ? '...' : '');
      findingsByRow[norm].push({ file: fname, lineNo: i + 1, text: snippet });
    });
  });
});

Object.keys(BRIDGE).forEach(function (norm) {
  var spec = BRIDGE[norm];
  var hits = findingsByRow[norm];
  ck(spec.id + ' is not taught as live in any other chapter',
     hits.length === 0,
     hits.length ? hits.map(function (h) { return h.file + ':' + h.lineNo + '  "' + h.text + '"'; }).join('   |   ')
                  : 'no occurrences in ' + chapterFiles.length + ' scanned chapters');
});

console.log(DIM + '  (this reads the manual set\'s prose, never the engine -- 09\'s own NOT MODELLED ' +
            'marking is verified against pwr2_protection by run_manual_setpoints, not here)' + RST);

console.log('\n' + '='.repeat(74));
console.log('  run_manual_notmodelled: ' + nPass + ' passed, ' + nFail + ' failed  (' +
            (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
