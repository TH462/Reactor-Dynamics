/*
 * run_dashboard_time.js — the ops dashboard reads EASTERN, everywhere.
 *
 * OWNER DIRECTIVE, 2026-08-13: "I need all dates in times in my telemetry site to be in
 * eastern time." The first pass at this (2026-08-12) converted the point-in-time stamps
 * and deliberately left the traffic table's day buckets on UTC, because relabelling a
 * bucket without re-grouping its query is a lie about what the row contains. This gate
 * covers the finished job: the conversion itself, AND the two ways it silently rots.
 *
 * WHY A GATE AT ALL — three failure modes, none of which throws or looks wrong:
 *
 *   1. DST. A fixed -5 (or -4) offset is right for half the year and drifts an hour in
 *      March. Worse, the "obviously safe" fix — sample the zone offset at NOON, away
 *      from the 02:00 switch — is wrong on exactly the two days a year this is about,
 *      in OPPOSITE directions: it puts 2026-03-08 an hour early and 2026-11-01 an hour
 *      late. That was the first implementation here and it passed every test written
 *      against an ordinary day. All four cases are pinned below.
 *   2. A RE-GROUP QUIETLY BECOMING A RELABEL. The by-day table is correct only because
 *      analytics.js asks RUM for `datetimeHour` and sums the hours into Eastern days
 *      here-side. Someone simplifying that back to the API's own `date` dimension gets
 *      a page that still says "Date (ET)" and is wrong by four or five hours in every
 *      row. Nothing about the output would look off. Pinned statically.
 *   3. A NEW VIEW PRINTING A RAW TIMESTAMP. Analytics Engine hands back UTC strings that
 *      are already shaped "YYYY-MM-DD HH:MM:SS"; dropping one straight into a cell reads
 *      as a perfectly good time and is four hours out.
 *
 * The static half STRIPS COMMENTS FIRST. Every comment in these files discusses UTC at
 * length — it has to, that is where the reasoning lives — so a scan that does not strip
 * them fails green on prose (the trap CLAUDE.md records against the Indications tab).
 *
 * STORAGE AND QUERIES STAY UTC and this gate does not object to them: Analytics Engine
 * stores UTC, the SQL windows are relative (NOW() - INTERVAL), the GraphQL filter is sent
 * as UTC because that is all it accepts, and the R2 bundle keys are UTC day prefixes.
 * Only what is DISPLAYED is converted. Checks that would forbid UTC in the query layer
 * would be forbidding the correct thing.
 *
 *   node test/run_dashboard_time.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

// ---------------------------------------------------------------- harness
var T = [];
function test(name, fn) {
  var checks = [];
  var ck = function (desc, pass, detail) { checks.push({ desc: desc, pass: !!pass, detail: detail }); };
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), false, String((e && e.stack) || e)); }
  T.push({ name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks });
}
function eq(ck, desc, got, want) {
  ck(desc, String(got) === String(want), 'got ' + got + ', want ' + want);
}

/* Comments out, string literals left alone. Order matters: strings are masked FIRST so a
 * `//` inside a URL or a regex-looking literal cannot open a fake comment, then the
 * comments are removed from the masked copy and the strings restored. Doing it the other
 * way round eats half of `'https://x'`. */
function stripComments(src) {
  var strings = [];
  var masked = src.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, function (m) {
    strings.push(m);
    return '' + (strings.length - 1) + '';
  });
  masked = masked.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  return masked.replace(/(\d+)/g, function (_, i) { return strings[+i]; });
}

// Every quoted literal in a source file, unescaped enough to test for a word.
function literals(src) {
  return (stripComments(src)
    .match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || []);
}

/* VIEWS = the pages that RENDER AN INSTANT, which is what the Eastern sweep below is
 * about. `usage.js` (#674) is deliberately NOT one: every figure on it is a count, a
 * percentage or a duration, so it has no instant to convert and an ET import there would
 * be an unused symbol added to satisfy a gate. It is read anyway — it now owns the
 * Analytics Engine queries — and carries its own tripwire further down. */
var VIEWS = ['worker/src/dashboard.js', 'worker/src/analytics.js',
             'worker/src/sessions.js', 'worker/src/features.js'];
var SRC = {};
['worker/src/render.js', 'worker/src/usage.js'].concat(VIEWS)
  .forEach(function (p) { SRC[p] = read(p); });
var CODE = {};
Object.keys(SRC).forEach(function (p) { CODE[p] = stripComments(SRC[p]); });

// ================================================================= behaviour
// The helpers are an ES module and this runner is CommonJS, so they are imported through
// a data: URL rather than re-implemented here. Re-implementing would test the copy.
function behaviour(M) {
  test('the zone does the work, not arithmetic', function (ck) {
    ck('render.js names America/New_York', /America\/New_York/.test(CODE['worker/src/render.js']));
    // A hand-rolled offset is the failure this whole file exists to prevent, and it is
    // invisible for half the year. 4/5 hours in ms or in seconds, in either sign.
    var arith = /[-+]?\s*(?:4|5)\s*\*\s*(?:60|3600|3_600)/.test(CODE['worker/src/render.js'])
      || /1[48]000000|144e5|18e6/.test(CODE['worker/src/render.js']);
    ck('no fixed 4h/5h offset arithmetic anywhere in render.js', !arith);
    ck('Intl formatting lives ONLY in render.js', VIEWS.every(function (p) {
      return !/Intl\.DateTimeFormat/.test(CODE[p]);
    }));
  });

  test('an instant converts to the Eastern wall clock', function (ck) {
    // EDT, -4. Analytics Engine's own wire format, which carries no zone marker at all.
    eq(ck, 'AE string, EDT', M.et('2026-08-11 18:30:00'), '2026-08-11 14:30:00');
    // EST, -5. Same input shape, an hour further back — the pair a fixed offset passes
    // only one of.
    eq(ck, 'AE string, EST', M.et('2026-01-15 18:30:00'), '2026-01-15 13:30:00');
    eq(ck, 'explicit ISO-Z', M.et('2026-08-11T18:30:00Z'), '2026-08-11 14:30:00');
    eq(ck, 'epoch ms', M.et(Date.UTC(2026, 7, 11, 18, 30, 0)), '2026-08-11 14:30:00');
    eq(ck, 'a Date object', M.et(new Date(Date.UTC(2026, 7, 11, 18, 30, 0))), '2026-08-11 14:30:00');
  });

  test('the weekday follows the Eastern date, not the UTC one', function (ck) {
    // 02:00 Wednesday UTC is 22:00 TUESDAY in Eastern. Computing the letter off the UTC
    // date prints the wrong one for every evening's traffic, which is most of it.
    eq(ck, 'evening rolls the day back', M.etWithDow('2026-08-12 02:00:00'), '2026-08-11 22:00:00 T');
    eq(ck, 'daytime is unaffected', M.etWithDow('2026-08-11 18:30:00'), '2026-08-11 14:30:00 T');
    eq(ck, 'zone spelled out, EDT', M.etFull('2026-08-11 18:30:00'), '2026-08-11 14:30:00 T EDT');
    eq(ck, 'zone spelled out, EST', M.etFull('2026-01-15 18:30:00'), '2026-01-15 13:30:00 Th EST');
  });

  test('a bare date is a DAY and is never converted', function (ck) {
    /* The reports view falls back to the R2 key's day prefix when an id carries no
     * parseable stamp. Treating that as midnight UTC and converting prints the PREVIOUS
     * day at 20:00 — a report filed on the 11th listed under the 10th, which is worse
     * than a date with no time. */
    eq(ck, 'et passes it through', M.et('2026-08-12'), '2026-08-12');
    eq(ck, 'etDay passes it through', M.etDay('2026-08-12'), '2026-08-12');
    eq(ck, 'etWithDow gives it a weekday', M.etWithDow('2026-08-12'), '2026-08-12 W');
    eq(ck, 'etFull does not invent a zone for it', M.etFull('2026-08-12'), '2026-08-12 W');
    eq(ck, 'withDow is zone-free', M.withDow('2026-08-12'), '2026-08-12 W');
  });

  test('an instant lands in the right Eastern DAY', function (ck) {
    // The bucketing key for the traffic table. 02:00Z belongs to the previous ET day;
    // 04:00Z (EDT midnight) is the first hour of the new one, and 03:59Z is not.
    eq(ck, '02:00Z is the previous day', M.etDay('2026-08-12T02:00:00Z'), '2026-08-11');
    eq(ck, '03:59Z is still the previous day', M.etDay('2026-08-11T03:59:00Z'), '2026-08-10');
    eq(ck, '04:00Z opens the day (EDT)', M.etDay('2026-08-11T04:00:00Z'), '2026-08-11');
    eq(ck, '04:30Z is still the previous day (EST)', M.etDay('2026-01-15T04:30:00Z'), '2026-01-14');
    eq(ck, '05:00Z opens the day (EST)', M.etDay('2026-01-15T05:00:00Z'), '2026-01-15');
  });

  test('a day BEGINS at the right instant, including both DST switches', function (ck) {
    var iso = function (x) { return new Date(M.etDayStartMs(x)).toISOString(); };
    eq(ck, 'ordinary EDT day', iso('2026-08-11 15:00:00'), '2026-08-11T04:00:00.000Z');
    eq(ck, 'ordinary EST day', iso('2026-01-15 15:00:00'), '2026-01-15T05:00:00.000Z');
    /* THE TWO THAT CAUGHT THE FIRST IMPLEMENTATION. Noon on the spring-forward day is
     * already EDT, so an offset sampled there dates the day's start an hour EARLY, into
     * the 7th; noon on the fall-back day is already EST, so it dates it an hour LATE and
     * loses the day's first hour. Neither is visible on any other day of the year. */
    eq(ck, 'spring forward — the day still starts at 00:00 EST', iso('2026-03-08 15:00:00'),
      '2026-03-08T05:00:00.000Z');
    eq(ck, 'the day after it starts at 00:00 EDT', iso('2026-03-09 15:00:00'),
      '2026-03-09T04:00:00.000Z');
    eq(ck, 'fall back — the day still starts at 00:00 EDT', iso('2026-11-01 15:00:00'),
      '2026-11-01T04:00:00.000Z');
    eq(ck, 'the day after it starts at 00:00 EST', iso('2026-11-02 15:00:00'),
      '2026-11-02T05:00:00.000Z');
    eq(ck, 'accepts epoch ms', iso(Date.UTC(2026, 7, 11, 15)), '2026-08-11T04:00:00.000Z');
    eq(ck, 'accepts a Date', iso(new Date(Date.UTC(2026, 7, 11, 15))), '2026-08-11T04:00:00.000Z');

    /* A FULL YEAR, both directions. Two spot cases can be satisfied by a lookup that is
     * wrong everywhere else, so every day of 2026 is asserted to be its own container:
     * the returned instant must fall inside the day it was asked about, and one
     * millisecond earlier must not. That is the property a window boundary needs, and it
     * is the one an off-by-an-hour offset breaks. */
    var bad = [];
    for (var t = Date.UTC(2026, 0, 1, 12); t < Date.UTC(2027, 0, 1, 12); t += 864e5) {
      var s = M.etDayStartMs(t);
      if (M.etDay(s) !== M.etDay(t) || M.etDay(s - 1) === M.etDay(s)) bad.push(M.etDay(t));
    }
    ck('365 days each contain their own start, and not the instant before it',
      bad.length === 0, bad.slice(0, 5).join(', '));
  });

  test('the 7d window never reaches past the full-resolution edge', function (ck) {
    /* THE COST OF THE EASTERN ALIGNMENT, and it took three days to surface because it is
     * only wrong for four hours out of every twenty-four.
     *
     * RUM holds full resolution behind a fixed edge at 00:00 UTC of (today - 7). It is a
     * cliff, measured on the live dataset 2026-08-17 one second either side:
     * datetime_geq 2026-08-09T23:59:59Z answered at sampleInterval 10 (50 pageloads),
     * 2026-08-10T00:00:00Z at sampleInterval 1 (67). Cross it and EVERY table on the page
     * is rounded to +/-10 — the by-day rows, top pages, referrers, countries, devices,
     * because they all share one window start. Nothing errors and no row is missing.
     *
     * `now - 7*24h` between 00:00 and 04:00 UTC — 8pm to midnight Eastern — is already in
     * the previous Eastern day, so its midnight lands 20 hours the wrong side. The old
     * UTC-midnight expression sat exactly ON the edge at every hour of the day, which is
     * why nobody had ever seen the 7d view round before.
     *
     * A YEAR OF HOURS, not a handful of spot checks: the defect is a function of the
     * hour-of-day, so a test that samples one hour proves nothing about the other 23. */
    var DAY = 864e5;
    var edgeOf = function (now) { return now - (now % DAY) - 7 * DAY; };
    var iso = function (x) { return new Date(x).toISOString(); };

    var past = [], notMidnight = [], short = [];
    for (var t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 36e5) {
      var f = M.windowStartMs(t, 7);
      if (f < edgeOf(t)) past.push(iso(t));
      // Unclamped, it must still be a true Eastern midnight — the clamp is allowed to
      // shorten the window, never to leave it on some arbitrary instant.
      if (f > edgeOf(t) && f !== M.etDayStartMs(f)) notMidnight.push(iso(t));
      // And it must still be a WEEK. A clamp that silently returned `now` would satisfy
      // every check above while showing a day of traffic under a 7d heading.
      if (t - f < 6.5 * DAY) short.push(iso(t) + ' -> ' + iso(f));
    }
    ck('8760 hours: never earlier than the edge', past.length === 0,
      past.length + ' bad, first: ' + past.slice(0, 3).join(', '));
    ck('8760 hours: an unclamped start is an Eastern midnight', notMidnight.length === 0,
      notMidnight.length + ' bad, first: ' + notMidnight.slice(0, 3).join(', '));
    ck('8760 hours: the window is still at least 6.5 days wide', short.length === 0,
      short.length + ' bad, first: ' + short.slice(0, 3).join(', '));

    /* The two instants that separate the fix from the defect. 01:39Z is 21:39 Eastern —
     * the reading that found this in the wild. Both name the SAME calendar day back, and
     * the unclamped form answers 20 hours apart for them. */
    eq(ck, 'evening (21:39 ET) clamps to the edge',
      iso(M.windowStartMs(Date.UTC(2026, 7, 17, 1, 39), 7)), '2026-08-10T00:00:00.000Z');
    eq(ck, 'daytime (14:00 ET) keeps the Eastern midnight',
      iso(M.windowStartMs(Date.UTC(2026, 7, 17, 18, 0), 7)), '2026-08-10T04:00:00.000Z');
    eq(ck, 'the unclamped answer for that evening, for the record',
      iso(M.etDayStartMs(Date.UTC(2026, 7, 17, 1, 39) - 7 * DAY)), '2026-08-09T04:00:00.000Z');

    /* WIDER WINDOWS ARE LEFT ALONE. Past the edge the coarse tier is unavoidable, so
     * clamping would buy nothing and silently shorten the window that was asked for —
     * a 30d heading over 7 days of traffic is a worse lie than a rounded number. */
    eq(ck, '30d is not clamped',
      iso(M.windowStartMs(Date.UTC(2026, 7, 17, 1, 39), 30)), '2026-07-17T04:00:00.000Z');
    eq(ck, '90d is not clamped',
      iso(M.windowStartMs(Date.UTC(2026, 7, 17, 1, 39), 90)), '2026-05-18T04:00:00.000Z');
    eq(ck, '14d is not clamped',
      iso(M.windowStartMs(Date.UTC(2026, 7, 17, 1, 39), 14)), '2026-08-02T04:00:00.000Z');
    // A 1d window is nowhere near the edge and must be untouched by any of this.
    eq(ck, '1d is an Eastern midnight, unclamped',
      iso(M.windowStartMs(Date.UTC(2026, 7, 17, 1, 39), 1)), '2026-08-15T04:00:00.000Z');

    // EST, the other half of the year: the edge is zone-free, the alignment is not.
    eq(ck, 'winter evening clamps to the edge',
      iso(M.windowStartMs(Date.UTC(2026, 0, 15, 2, 30), 7)), '2026-01-08T00:00:00.000Z');
    eq(ck, 'winter daytime keeps the Eastern midnight',
      iso(M.windowStartMs(Date.UTC(2026, 0, 15, 18, 0), 7)), '2026-01-08T05:00:00.000Z');
  });

  test('a short oldest bucket says so on the row', function (ck) {
    /* The clamp above buys exact counts by opening the window partway into the oldest
     * Eastern day. That row is then a few hours of traffic under a full day's date, and a
     * trimmed bucket and a genuinely quiet day are the SAME ROW without the word — which
     * is the misreading the Eastern alignment was built to remove in the first place.
     *
     * Checked here rather than by scanning analytics.js because the scan cannot do it: a
     * regex for "(partial)" passes on `(false ? ' (partial)' : '')`, measured on the first
     * injection run of this very check. The literal being present is not the claim. */
    eq(ck, 'the partial day is marked', M.dayLabel('2026-08-09', '2026-08-09'), '2026-08-09 Su (partial)');
    eq(ck, 'every other day is not', M.dayLabel('2026-08-10', '2026-08-09'), '2026-08-10 M');
    eq(ck, 'no partial day, no marks', M.dayLabel('2026-08-09', null), '2026-08-09 Su');
    // The unclamped case passes null, and `withDow(null)` is ''. Two nulls must not match
    // each other into a phantom marked row.
    eq(ck, 'null does not mark itself', M.dayLabel(null, null), '');
  });

  test('unparseable input degrades to the input, never to a wrong time', function (ck) {
    eq(ck, 'empty string', M.et(''), '');
    eq(ck, 'null', M.et(null), '');
    eq(ck, 'garbage survives as itself', M.et('not a date'), 'not a date');
    eq(ck, 'etDay of garbage', M.etDay('not a date'), 'not a date');
    ck('etDayStartMs of garbage is null', M.etDayStartMs('not a date') === null);
  });
}

// ================================================================= source
test('no view prints a UTC label to the reader', function (ck) {
  /* Comments are stripped first — every one of these files argues about UTC at length,
   * because that is where the reasoning has to live. A scan that reads the prose passes
   * green on the very sentence explaining the bug. */
  VIEWS.concat(['worker/src/render.js']).forEach(function (p) {
    var hits = literals(SRC[p]).filter(function (s) { return /UTC/.test(s); });
    ck(p.replace('worker/src/', '') + ' has no UTC in a rendered string', hits.length === 0,
      hits.join(' | '));
  });
  // The positive half: the pages SAY which zone they are in, or the reader has to guess.
  ck('the reports view states the zone', /Times are Eastern/.test(SRC['worker/src/dashboard.js']));
  ck('the analytics view states the zone', /<b>Eastern<\/b>/.test(SRC['worker/src/analytics.js']));
  ck('the sessions view states the zone', /<b>Eastern<\/b>/.test(SRC['worker/src/sessions.js']));
});

test('the traffic table is RE-GROUPED into Eastern days, not relabelled', function (ck) {
  var a = CODE['worker/src/analytics.js'];
  /* This is the check with the most consequence in the file. Asking RUM for `date` gets
   * UTC calendar days; the row marked 2026-08-11 holds 20:00 on the 10th through 20:00
   * on the 11th Eastern. A page built on that dimension and headed "Date (ET)" is wrong
   * by four or five hours in every row and looks entirely correct. */
  ck('the by-day query groups by datetimeHour', /rumGroup\(\s*'datetimeHour'/.test(a));
  ck("no query asks for the API's own UTC `date` dimension", !/rumGroup\(\s*'date'/.test(a));
  ck('the hours are bucketed with etDay()', /etDay\(\s*d\.datetimeHour\s*\)/.test(a));
  ck('the column says ET', /label:\s*'Date \(ET\)'/.test(a));
  /* The limit must cover every hour in the window or the tail is dropped silently — the
   * rows simply stop, which reads as a quiet week rather than as a truncation. */
  ck('the hourly limit scales with the window', /days\s*\*\s*24/.test(a));
});

test('the query window is aligned to an Eastern midnight, and clamped', function (ck) {
  var a = CODE['worker/src/analytics.js'];
  /* The behaviour is pinned above, against the real function. These are the wiring: that
   * the view actually CALLS it, and that nobody re-derives the window inline beside it —
   * a second copy would pass every behavioural check while the page used the other one. */
  ck('the window start comes from windowStartMs', /const fromMs = windowStartMs\(nowMs, days\)/.test(a));
  ck('the filter is minted from that instant', /const from = new Date\(fromMs\)\.toISOString\(\)/.test(a));
  ck('the view does not compute its own start from etDayStartMs',
    !/const from\w* = [^;]*etDayStartMs\(\s*(?:Date\.)?now/i.test(a));
  /* The old form: `new Date(...).toISOString().slice(0, 11) + '00:00:00Z'` — a UTC
   * midnight. It leaves the oldest row holding the last 19 or 20 hours of its Eastern
   * day, which reads as a quiet morning rather than as a partial bucket. */
  ck('no UTC-midnight string surgery survives', !/toISOString\(\)\.slice\(0,\s*11\)/.test(a));

  /* The clamp shortens the oldest bucket, and an unlabelled short bucket is exactly the
   * misreading #480 existed to remove — a real drop in traffic and a trimmed window look
   * identical on the row. It is only an acceptable trade while it is SAID. */
  ck('the partial day is computed from the actual start',
    /const partialDay = fromMs > etDayStartMs\(fromMs\)/.test(a));
  // The labelling itself is pinned behaviourally above; this is only that the by-day
  // table routes through it and hands it the day it actually computed.
  ck('the by-day rows are titled by dayLabel', /date: dayLabel\(r\.date, partialDay\)/.test(a));
  ck('and the marker is explained under the table', /marked <b>\(partial\)<\/b>/.test(a));

  /* The old warning opened "Window > 7 days:" — a claim about the window rather than
   * about the answer, and false for every one of the four hours a day the 7d view was
   * rounding. It named the wrong cause to the one person who could have caught it. */
  ck('the coarse warning does not attribute itself to the window size',
    !/Window &gt; 7 days/.test(a));
  ck('the coarse warning still reports the interval it got',
    /rounded to the nearest ' \+ g\.coarse/.test(a));
});

test('every view routes its instants through the Eastern helpers', function (ck) {
  var ET = /\b(et|etWithDow|etFull|etDay)\b/;
  VIEWS.forEach(function (p) {
    var imports = (/import\s*\{([^}]*)\}\s*from\s*'\.\/render\.js'/.exec(CODE[p]) || [, ''])[1];
    ck(p.replace('worker/src/', '') + ' imports an ET helper', ET.test(imports), imports.trim());
  });
  /* An Analytics Engine timestamp is already shaped "YYYY-MM-DD HH:MM:SS", so a raw one
   * in a cell looks like a perfectly good time and is four hours out. The columns that
   * carry one are named here; each must be wrapped where it is rendered. */
  var s = CODE['worker/src/sessions.js'];
  ck('sessions: the written time is converted', /etWithDow\(r\.timestamp\)/.test(s));
  ck('sessions: first_seen is converted', /etWithDow\(r\.first_seen\)/.test(s));
  var d = CODE['worker/src/dashboard.js'];
  ck('reports: the list is converted', /etWithDow\(when\)/.test(d));
  ck('reports: the detail heading is converted', /etFull\(when\)/.test(d));
  ck('features: the KV stamp is converted', /etFull\(updated\)/.test(CODE['worker/src/features.js']));
  /* THE USAGE PAGE'S TRIPWIRE. It is exempt from the import sweep above because it prints
   * no instant — so the thing worth pinning is that it still does not. An Analytics Engine
   * timestamp is already shaped "YYYY-MM-DD HH:MM:SS", so the first one rendered there
   * would look like a perfectly good time and be four hours out, with no ET helper in the
   * file to have been forgotten. The day a column below is legitimately wanted, import
   * `etWithDow` and wrap it — do not delete this check. */
  var u = CODE['worker/src/usage.js'];
  var stamps = /\{\s*key:\s*'(timestamp|first_seen|last_seen|when|day|date|ran_at)'/.exec(u);
  ck('usage: no raw Analytics Engine timestamp is rendered', !stamps,
    stamps ? 'column ' + stamps[1] + ' needs an ET helper' : '');
});

test('storage and queries stay UTC — deliberately', function (ck) {
  /* The other direction, and it matters as much: converting a STORED value would shift
   * the R2 key space and break every existing bundle's prefix, and the GraphQL filter
   * only accepts UTC. These pin the boundary so a later "make it all Eastern" pass does
   * not walk past the display layer. */
  ck('bundle keys are still minted from a UTC day',
    /toISOString\(\)\.slice\(0, 10\)/.test(CODE['worker/src/index.js'] = stripComments(read('worker/src/index.js'))));
  ck('the KV stamp is still written in UTC',
    /updated: new Date\(\)\.toISOString\(\)/.test(CODE['worker/src/features.js']));
  /* MOVED TO usage.js (#674) — the in-sim block left the analytics page, and with it every
   * Analytics Engine query in the tree. This check followed the CODE rather than staying
   * pointed at a file that no longer runs one; left where it was it would have gone green
   * over a page with nothing to assert about. */
  ck('the SQL window is still relative and zone-free',
    /NOW\(\) - INTERVAL/.test(CODE['worker/src/usage.js']));
  ck('the GraphQL filter is still sent as UTC ISO',
    /toISOString\(\)/.test(CODE['worker/src/analytics.js']));
});

// ================================================================= report
(async function main() {
  var src = read('worker/src/render.js');
  var M;
  try {
    M = await import('data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64'));
  } catch (e) {
    // render.js is an ES module and this runner is CommonJS. A data: URL is the only way
    // to execute it here without a package.json declaring module type for the whole repo.
    T.push({ name: 'import worker/src/render.js', pass: false,
      checks: [{ desc: 'data: URL import failed: ' + e.message, pass: false }] });
    M = null;
  }
  if (M) behaviour(M);

  var C = { red: '[31m', green: '[32m', dim: '[2m', bold: '[1m', off: '[0m' };
  var passS = 0, failS = 0, passC = 0, failC = 0;
  T.forEach(function (t) {
    t.pass ? passS++ : failS++;
    t.checks.forEach(function (c) { c.pass ? passC++ : failC++; });
    console.log((t.pass ? C.green + 'PASS' : C.red + 'FAIL') + C.off + '  ' + t.name +
      C.dim + '  (' + t.checks.filter(function (c) { return c.pass; }).length + '/' + t.checks.length + ')' + C.off);
    t.checks.filter(function (c) { return !c.pass; }).forEach(function (c) {
      console.log('   ' + C.red + '✗' + C.off + ' ' + c.desc + (c.detail ? C.dim + '  — ' + c.detail + C.off : ''));
    });
  });
  console.log('\n' + C.bold + '─'.repeat(42) + C.off);
  console.log(C.bold + (failS ? C.red + 'DASHBOARD TIME: FAIL' : C.green + 'DASHBOARD TIME: OK') + C.off +
    '   Suites: ' + passS + '/' + (passS + failS) + '   Checks: ' + passC + '/' + (passC + failC));
  process.exit(failS ? 1 : 0);
})();
