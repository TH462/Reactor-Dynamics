/*
 * run_site_report.js — guards the pure pieces `tools/site_report.js` added 2026-09-21 (#805)
 * to make closed-day traffic figures exact instead of Cloudflare's rounded ones.
 *
 * WHAT THIS DOES NOT DO. It never spawns `wrangler` and never touches the network — the CLI
 * itself has no runner today (it is a manual reporting tool, not part of `run_all`) and this
 * file does not attempt to become a heavyweight one. It covers exactly the surface that is
 * pure and was actually wrong once already:
 *
 *   1. THE DAY-BOUNDARY MAPPING. `easternYMD`/`addDaysYMD`/`closedDayWindow` compute which
 *      days are "closed" (Eastern) and `easternMidnightISO` finds the UTC instant of Eastern
 *      midnight for one. That last one had a REAL BUG, found while building this: a first
 *      draft anchored the offset lookup at noon UTC of the target day, reasoned as "nowhere
 *      near the 2 a.m. local DST switch" — true, but irrelevant, because by noon UTC
 *      (~7-8 a.m. local) the spring-forward jump had ALREADY HAPPENED, so it read back EDT
 *      and returned 2026-03-08T04:00:00Z when the correct instant (verified against `Intl`'s
 *      own formatting of both candidates) is 05:00:00Z — local midnight on a spring-forward
 *      day is still the OLD offset, not the new one. Section 3 pins both 2026 transition days
 *      in both directions so a regression to that shape fails loudly instead of drifting a
 *      handful of hours twice a year.
 *   2. THE SOURCE LABEL. `cfSourceLabel` is the vocabulary that has to tell `store`
 *      (first-party, exact), `cf` (Cloudflare, exact) and `cf~N` (Cloudflare, rounded) apart —
 *      the whole point of #805 is that "the same number from a different source" stops being
 *      ambiguous.
 *   3. THE no-data DISTINCTION. `classifyClosedDays` must tell a day the store never captured
 *      apart from a real zero-traffic day — conflating them is exactly the "a missing day
 *      drawn as a quiet day" failure mode `run_dashboard_stats.js` already guards on the
 *      dashboard's side of the same store.
 *   4. THE FALLBACK PATH. `d1Query` takes an injectable `runner` — this file feeds it a
 *      stubbed subprocess (a function returning canned stdout, or rejecting to simulate a
 *      timeout / wrangler-not-found) and checks it resolves or rejects correctly without ever
 *      needing an actual `wrangler` on PATH. `parseD1Output` is exercised directly against
 *      every stdout shape actually seen: the real success envelope
 *      (`[{results:[...], success:true, meta:{...}}]`, captured live 2026-09-21) and the
 *      failure envelope wrangler itself prints on a bad query (`{error:{text:"..."}}`, no
 *      array, no `results`), plus unparseable garbage.
 *
 * INJECTIONS prove the checks above are not hollow (HR10) — each swaps in a small, genuinely
 * broken stand-in for one piece and shows the SAME assertion that passes on the real
 * implementation catches it. `--inject=noon-anchor-dst` reintroduces the exact bug from (1);
 * `--inject=silent-zero` reintroduces the exact defect (3) exists to prevent.
 *
 *   node test/run_site_report.js
 *   node test/run_site_report.js --inject=noon-anchor-dst   (proof the DST check can fail)
 *   node test/run_site_report.js --list-injections
 */
'use strict';

const path = require('path');
const MOD = require(path.join(__dirname, '..', 'tools', 'site_report.js'));

const BOLD = '\x1b[1m', RED = '\x1b[31m', GREEN = '\x1b[32m', RST = '\x1b[0m';
let nPass = 0, nFail = 0;
function ck(name, cond, note) {
  const ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? '  ' + GREEN + 'PASS' + RST + '  ' : '  ' + RED + 'FAIL' + RST + '  ') + name +
    (note ? '  -- ' + note : ''));
  return ok;
}
function head(s) { console.log('\n' + BOLD + s + RST); }

// ------------------------------------------------------------------------------ injections
// Array-form on purpose: each entry is one self-contained reproduction of a real or
// plausible defect, run only under `--inject=<name>`. A broken stand-in is defined INLINE
// (never by mutating the module) so the main battery below always exercises the real code.
const INJECTIONS = [
  {
    name: 'noon-anchor-dst',
    note: 'the ACTUAL first-draft bug: anchor the DST offset lookup at noon UTC',
    run: () => {
      // The broken approach this file's own header documents being replaced.
      function brokenEasternMidnightISO(ymd) {
        const [y, m, d] = ymd.split('-').map(Number);
        const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(anchor);
        const tzName = (parts.find((p) => p.type === 'timeZoneName') || {}).value || 'GMT+0';
        const mo = /GMT([+-]\d+)/.exec(tzName);
        const offMin = mo ? Number(mo[1]) * 60 : 0;
        return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offMin * 60000).toISOString();
      }
      const broken = brokenEasternMidnightISO('2026-03-08');
      const correct = MOD.easternMidnightISO('2026-03-08');
      console.log(`  broken:  ${broken}`);
      console.log(`  correct: ${correct}  (real answer, verified against Intl's own formatting)`);
      // The assertion is "the broken value is WRONG" — true here means the pinned check in
      // the main battery (which requires the CORRECT value) would fail against this stand-in,
      // i.e. the guard has teeth. `ck` PASSING this line is what proves that.
      return ck('[INJECTED] the noon-anchor stand-in gets 2026-03-08 WRONG (main-battery check would catch it)',
        broken !== correct, `broken=${broken} vs correct=${correct}`);
    },
  },
  {
    name: 'silent-zero',
    note: 'a day with no rollup_runs row read as a real zero instead of no-data',
    run: () => {
      function brokenClassify(from, to, joinedRows) {
        // The naive shape: trust whatever came back, assume absence means zero traffic.
        const byDay = new Map((joinedRows || []).map((r) => [String(r.day), r]));
        const days = [];
        for (let d = from; d <= to; d = MOD.addDaysYMD(d, 1)) days.push(d);
        return days.map((day) => {
          const r = byDay.get(day) || { pageloads: 0, visits: 0, si: 1 };
          return { day, status: 'store', pageloads: Number(r.pageloads) || 0, visits: Number(r.visits) || 0 };
        });
      }
      // 2026-08-25 has no rollup_runs row anywhere in the live store (it begins 2026-09-02).
      const rows = brokenClassify('2026-08-25', '2026-08-25', []);
      console.log(`  broken:  ${JSON.stringify(rows[0])}`);
      // Same shape as above: PASS here means the broken stand-in mislabels the day (status
      // 'store' instead of 'no-data'), which is exactly what the main-battery check rejects.
      return ck('[INJECTED] the naive stand-in mislabels an uncaptured day as store/0 (main-battery check would catch it)',
        rows[0].status !== 'no-data', `status=${rows[0].status} pageloads=${rows[0].pageloads} — a day the store never saw, drawn as a real exact zero`);
    },
  },
];

if (process.argv.includes('--list-injections')) { INJECTIONS.forEach((i) => console.log(i.name)); process.exit(0); }
const NAMED = (process.argv.find((a) => a.startsWith('--inject=')) || '').slice('--inject='.length);

// ----------------------------------------------------------------------------------- main
(async () => {
  if (NAMED) {
    const spec = INJECTIONS.find((i) => i.name === NAMED);
    if (!spec) { console.error(`Unknown injection ${JSON.stringify(NAMED)}. --list-injections for the set.`); process.exit(2); }
    head(`INJECTION: ${spec.name}  (${spec.note})`);
    const caught = spec.run();
    console.log(caught
      ? `\n${GREEN}The check catches it.${RST}`
      : `\n${RED}The check did NOT catch it — the guard is hollow.${RST}`);
    process.exit(caught ? 0 : 1);
  }

  head('easternYMD — the day-label mapping RUM/`traffic_daily` disagree on');
  // The exact shape of the bug this file exists to fix: the same instant reads a different
  // calendar day in UTC than in Eastern near either day's boundary.
  ck('23:30 UTC is still the same Eastern day (EDT, UTC-4)',
    MOD.easternYMD(new Date('2026-09-19T23:30:00Z')) === '2026-09-19');
  ck('02:00 UTC has already rolled to the PREVIOUS Eastern day (EDT)',
    MOD.easternYMD(new Date('2026-09-20T02:00:00Z')) === '2026-09-19');
  ck('05:00 UTC is the first UTC instant of the new Eastern day (EDT)',
    MOD.easternYMD(new Date('2026-09-20T04:00:00Z')) === '2026-09-20');
  ck('EST (winter): 04:59 UTC is still the previous Eastern day',
    MOD.easternYMD(new Date('2026-01-05T04:59:00Z')) === '2026-01-04');
  ck('EST (winter): 05:00 UTC is the new Eastern day',
    MOD.easternYMD(new Date('2026-01-05T05:00:00Z')) === '2026-01-05');

  head('addDaysYMD — calendar arithmetic (month/year/leap-day rollover)');
  ck('simple -1', MOD.addDaysYMD('2026-09-21', -1) === '2026-09-20');
  ck('simple +1', MOD.addDaysYMD('2026-09-20', 1) === '2026-09-21');
  ck('month rollover', MOD.addDaysYMD('2026-03-01', -1) === '2026-02-28');
  ck('year rollover', MOD.addDaysYMD('2026-01-01', -1) === '2025-12-31');
  ck('leap day exists in 2028', MOD.addDaysYMD('2028-02-28', 1) === '2028-02-29');
  ck('non-leap 2026 skips Feb 29', MOD.addDaysYMD('2026-02-28', 1) === '2026-03-01');
  ck('multi-day span', MOD.addDaysYMD('2026-09-21', -30) === '2026-08-22');

  head('easternMidnightISO — the DST bug found and fixed while building this (#805)');
  ck('regular EDT day (summer)', MOD.easternMidnightISO('2026-07-04') === '2026-07-04T04:00:00.000Z');
  ck('regular EST day (winter)', MOD.easternMidnightISO('2026-01-04') === '2026-01-04T05:00:00.000Z');
  // 2026's spring-forward is 2026-03-08 (2nd Sunday of March); the transition itself is at
  // 2 a.m. LOCAL, so midnight of that same calendar day is still the OLD offset (EST).
  ck('day BEFORE spring-forward (still EST)', MOD.easternMidnightISO('2026-03-07') === '2026-03-07T05:00:00.000Z');
  ck('spring-forward day itself — midnight is STILL EST, not EDT',
    MOD.easternMidnightISO('2026-03-08') === '2026-03-08T05:00:00.000Z',
    'this is the exact case the noon-UTC-anchor draft got wrong — see --inject=noon-anchor-dst');
  ck('day AFTER spring-forward (now EDT)', MOD.easternMidnightISO('2026-03-09') === '2026-03-09T04:00:00.000Z');
  // 2026's fall-back is 2026-11-01 (1st Sunday of November); midnight of that day is still EDT.
  ck('day BEFORE fall-back (still EDT)', MOD.easternMidnightISO('2026-10-31') === '2026-10-31T04:00:00.000Z');
  ck('fall-back day itself — midnight is STILL EDT, not EST',
    MOD.easternMidnightISO('2026-11-01') === '2026-11-01T04:00:00.000Z');
  ck('day AFTER fall-back (now EST)', MOD.easternMidnightISO('2026-11-02') === '2026-11-02T05:00:00.000Z');

  head('closedDayWindow — always at least one closed day, never touches today');
  {
    const w = MOD.closedDayWindow(7, new Date('2026-09-21T15:00:00Z'));
    ck('todayET is the Eastern day of `now`', w.todayET === '2026-09-21');
    ck('to is yesterday (Eastern) — never today', w.to === '2026-09-20');
    ck('from is DAYS back from today', w.from === '2026-09-14');
    ck('hasClosedDays true for days>=1', w.hasClosedDays === true);
  }
  {
    const w1 = MOD.closedDayWindow(1, new Date('2026-09-21T15:00:00Z'));
    ck('DAYS=1 still gives exactly one closed day (yesterday)', w1.from === w1.to && w1.to === '2026-09-20');
  }

  head('classifyClosedDays — store / failed / no-data, never a silent 0 (#805 item 4)');
  {
    const rows = MOD.classifyClosedDays('2026-09-01', '2026-09-04', [
      { day: '2026-09-02', note: '', pageloads: 4, visits: 3, si: 1 },
      { day: '2026-09-03', note: 'traffic failed: timeout', pageloads: 0, visits: 0, si: 1 },
    ]);
    ck('4 days walked with no gaps', rows.length === 4);
    ck('day before the store began -> no-data, not 0', rows[0].day === '2026-09-01' && rows[0].status === 'no-data');
    ck('captured day -> store, with the real figures', rows[1].status === 'store' && rows[1].pageloads === 4 && rows[1].visits === 3);
    ck('a run that recorded a traffic failure -> failed, not store', rows[2].status === 'failed');
    ck('failed row carries the note', /timeout/.test(rows[2].note || ''));
    ck('day after the last captured row -> no-data', rows[3].day === '2026-09-04' && rows[3].status === 'no-data');
  }
  {
    // A genuine zero-traffic day (row present, pageloads 0) must read `store`, not `no-data` —
    // the other half of the same distinction.
    const rows = MOD.classifyClosedDays('2026-09-06', '2026-09-06', [
      { day: '2026-09-06', note: '', pageloads: 0, visits: 0, si: 1 },
    ]);
    ck('a captured, genuinely quiet day is `store` with 0, not `no-data`',
      rows[0].status === 'store' && rows[0].pageloads === 0);
  }

  head('cfSourceLabel — the three-state vocabulary (store / cf / cf~N)');
  ck('sampleInterval 1 -> cf', MOD.cfSourceLabel(1) === 'cf');
  ck('sampleInterval 10 -> cf~10', MOD.cfSourceLabel(10) === 'cf~10');
  ck('sampleInterval 0/undefined defensively floors to cf, not cf~0', MOD.cfSourceLabel(0) === 'cf' && MOD.cfSourceLabel(undefined) === 'cf');

  head('parseD1Output — every wrangler --json stdout shape actually seen');
  ck('the real success envelope (captured live 2026-09-21)',
    JSON.stringify(MOD.parseD1Output(JSON.stringify([{ results: [{ day: '2026-09-19', pageloads: 45 }], success: true, meta: {} }])))
      === JSON.stringify([{ day: '2026-09-19', pageloads: 45 }]));
  ck('an empty result set is [] , not an error', Array.isArray(MOD.parseD1Output(JSON.stringify([{ results: [], success: true }]))));
  {
    let threw = null;
    try { MOD.parseD1Output('not json at all'); } catch (e) { threw = e; }
    ck('unparseable stdout throws, names itself', threw && /unparseable/i.test(threw.message));
  }
  {
    // wrangler's OWN failure shape on a bad query/db — no array wrapper, no `results`.
    let threw = null;
    try { MOD.parseD1Output(JSON.stringify({ error: { text: "Couldn't find a D1 DB with name or binding 'x'" } })); }
    catch (e) { threw = e; }
    ck('the {error:{text}} shape throws with wrangler\'s own message', threw && /D1 DB/.test(threw.message));
  }
  {
    let threw = null;
    try { MOD.parseD1Output(JSON.stringify([{ success: false }])); } catch (e) { threw = e; }
    ck('success:false throws rather than returning rows', !!threw);
  }

  head('d1Query — the fallback path, with a STUBBED subprocess (no wrangler, no network)');
  {
    const rows = await MOD.d1Query('SELECT 1', async () => JSON.stringify([{ results: [{ x: 1 }], success: true }]));
    ck('a stubbed runner returning the real shape resolves to rows', rows.length === 1 && rows[0].x === 1);
  }
  {
    let threw = null;
    try { await MOD.d1Query('SELECT 1', async () => { throw new Error('wrangler timed out after 20s'); }); }
    catch (e) { threw = e; }
    ck('a runner that rejects (simulated timeout) propagates, not swallowed', threw && /timed out/.test(threw.message));
  }
  {
    let threw = null;
    try { await MOD.d1Query('SELECT 1', async () => { throw new Error("spawn npx ENOENT"); }); }
    catch (e) { threw = e; }
    ck('a runner that rejects (simulated missing wrangler) propagates', threw && /ENOENT/.test(threw.message));
  }
  {
    let threw = null;
    try { await MOD.d1Query('SELECT 1', async () => 'garbage, not json'); } catch (e) { threw = e; }
    ck('a stubbed runner returning garbage throws via parseD1Output, not a crash', threw && /unparseable/i.test(threw.message));
  }

  console.log(`\n${BOLD}${nPass} passed, ${nFail} failed${RST}`);
  process.exit(nFail ? 1 : 0);
})();
