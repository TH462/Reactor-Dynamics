/*
 * test/measure_stack.js — take a MEASUREMENT from a long FULL-STACK plant evolution.
 *
 * WHY THIS EXISTS (issue #266)
 * ---------------------------
 * When a number was needed for a long evolution, the only probe that reliably finished
 * was an ENGINE-DIRECT one — and engine-direct is a different plant. It has no automation
 * channels ticking, no `engageDefaults()` and no startup lineup, so `feed_sg`,
 * `cvcs_makeup` and `boron_conc` are all absent (CLAUDE.md, "Know which LAYER a gate runs
 * at"). Two published numbers were wrong because of it:
 *
 *   - PI-9: the stuck-rod SLB measured engine-direct at rho = -2049 pcm, "1.26x the held
 *     rod worth". At engine+M4 it is -27,458 pcm, 16.9x — 13x off, because engine-direct
 *     has no HPI, so the 2500 ppm RWST injection that dominates the answer never happened.
 *   - `pwr_mode5_to_mode3`'s published milestone table was measured engine-direct on a
 *     mission that runs full-stack.
 *
 * #266 filed that as a PERFORMANCE gap — "a cycle-at-a-time service loop from Node cannot
 * cover a 12-plant-hour ride", two attempts "exceeded ten minutes of wall clock without
 * finishing". THAT DIAGNOSIS WAS WRONG, and the correction is the reason this file is
 * short. Measured 2026-07-30 on this machine, PWR `hot_full_power`, full stack:
 *
 *   | drive method                                    | 30 plant-minutes |
 *   |-------------------------------------------------|------------------|
 *   | `svc.start()` at accel 10x                      | 3.1 REAL minutes |
 *   | `svc.start()` after an attention stop drops 1x   | 31.3 REAL minutes|
 *   | `svc.tick()` / `advanceCycles()` in a loop       | ~2 SECONDS       |
 *
 * `start()` arms `setTimeout(this.broadcastMs)`, so it advances in WALL time — measured,
 * 5.0 s of wall bought 48.0 s of sim at accel 10x (9.6x real). Drive `tick()` directly and
 * the whole thing is synchronous: a 12-plant-hour ride is ~40 s, and cost is LINEAR in sim
 * duration (six consecutive plant-hours measured at 2977/2892/2863/2862/2844/2907 ms,
 * last/first 0.98x; the checkpoint ring stays capped at 32).
 *
 * Profiled per cycle, the cost is 87.9 % `engine.step` — snapshot assembly, alarm scanning
 * and instructor evaluation together are ~5 %. There was never per-cycle overhead worth
 * optimising, and no `measure`-mode advance is needed. Acceleration barely matters either
 * (1 plant-hour costs 4.0 s at 1x and 3.1 s at 3600x) because the physics dt is FIXED —
 * what you pay for is sim duration, not tick count.
 *
 * SO THE RULE IS: never drive a measurement with `start()`. This harness never does.
 *
 * WHAT IT GUARANTEES
 * ------------------
 * 1. FULL STACK. M4 + M5 + M6, through `SimulationService`, with the shipped lineup —
 *    the plant a player actually gets.
 * 2. THE LAYER IS STAMPED IN THE OUTPUT (#266 checkbox 4). Every table this prints carries
 *    the layer, the lineup and the acceleration in its header, so a wrong-layer figure is
 *    visible in the artifact rather than found a day later in a catalog entry.
 * 3. US CUSTOMARY FIRST, SI in parentheses, for every field it knows the dimension of —
 *    the 2026-07-29 owner directive, applied where the numbers are produced rather than
 *    left to whoever pastes them into an issue. Temperature DIFFERENCES and RATES convert
 *    x9/5 with NO offset; the table below marks those `delta: true`.
 *
 * USAGE
 * -----
 *   node test/measure_stack.js --for=12h --watch=tavg_c,pressure_mpa --every=1h
 *   node test/measure_stack.js --ic=cold_shutdown --for=30m --every=5m \
 *        --watch=tavg_c,plant_mode,boron_ppm
 *   node test/measure_stack.js --ic=5_percent --for=20m --every=2m \
 *        --watch=power_pct,tavg_c --cmd='0s:{"action":"set_rcp","running":true}'
 *   node test/measure_stack.js --list                     # field names, by source
 *
 *   --plant=pwr|rbmk|bwr      default pwr
 *   --version=<id>            engine design version (rbmk: pre_chernobyl / post_chernobyl)
 *   --ic=<initial_state>      default hot_full_power
 *   --for=<dur>               PLANT time to cover: 90s / 30m / 12h. default 1h
 *   --every=<dur>             sample interval in plant time. default: 12 rows
 *   --accel=<n>               time acceleration. default 60. Protection is evaluated once
 *                             per broadcast, so a HIGH value coarsens trip latency (#153) —
 *                             use 10 or less if the number you want depends on when a trip
 *                             fires, and this harness prints the resulting granularity.
 *   --lineup=default|bare     default = free play (engageDefaults + startup lineup);
 *                             bare = noDefaults, what campaign missions and Path-2 use
 *   --watch=a,b,c             fields to sample. Resolved against true_state, then
 *                             instruments, then control_state; the SOURCE is printed, since
 *                             `tavg_c` (truth) and `tavg` (the instrument) are not the same
 *                             number and HR1 is the whole reason they differ.
 *   --cmd='<t>:<json>'        schedule a command at a plant time. Repeatable.
 *   --seed=<int>              instrument PRNG seed. default 4242 — every number ever taken
 *                             with this harness. NOT the probe default: OpsHarness seeds
 *                             0xC0FFEE, so a measure_stack figure and a behavior/ops figure
 *                             are different plants. Sweep it whenever the thing you are
 *                             measuring is noise-excited (#394: the part-power limit cycle
 *                             reads 1.83-4.89 pts across seeds).
 *   --attention-stops         keep the attention-stop dropout ON (default OFF: a headless
 *                             measurement has no operator to protect, and leaving it on is
 *                             what silently ran 11 of 22 procedures at a tenth of their
 *                             declared speed in #245)
 *   --csv                     emit CSV instead of the aligned table
 *   --quiet                   suppress the header (implies you know the layer)
 */
'use strict';
var C = '\x1b[36m', G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

require('../engines/load_mode.js');
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js',
 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'engines/rbmk/rbmk_config.js', 'layers/control/rbmk_control.js', 'engines/rbmk/rbmk_kinetics.js', 'engines/rbmk/rbmk_thermal.js',
 'engines/rbmk/rbmk_rods.js', 'engines/rbmk/rbmk_instruments.js', 'engines/rbmk/rbmk_engine.js',
 'engines/bwr/bwr_config.js', 'layers/control/bwr_control.js', 'engines/bwr/bwr_vessel.js', 'engines/bwr/bwr_recirculation.js',
 'engines/bwr/bwr_safety_systems.js', 'engines/bwr/bwr_instruments.js', 'engines/bwr/bwr_engine.js',
 'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js'
].forEach(function (f) { require('../' + f); });
var RD = globalThis.RD;

// ---------------------------------------------------------------- unit presentation
// US customary FIRST with SI in parentheses (OWNER DIRECTIVE 2026-07-29). `delta: true`
// marks a DIFFERENCE or a RATE — those convert x9/5 with NO 32-degree offset, which is the
// one that gets written wrong: 41 C of subcooling is 73.8 F, not 105.8.
var UNITS = {
  _c:    { us: function (v) { return v * 9 / 5 + 32; }, uu: 'F',   su: 'C' },
  _mpa:  { us: function (v) { return v * 145.038; },    uu: 'psi', su: 'MPa' },
  _kpa:  { us: function (v) { return v * 0.2953; },     uu: 'inHg', su: 'kPa' },
};
// Explicit per-field overrides where the suffix rule is wrong or absent.
var FIELD_UNITS = {
  subcooling_c:       { us: function (v) { return v * 9 / 5; }, uu: 'F',    su: 'C', delta: true },
  suction_subcool_c:  { us: function (v) { return v * 9 / 5; }, uu: 'F',    su: 'C', delta: true },
  tavg_rate_c_per_hr: { us: function (v) { return v * 9 / 5; }, uu: 'F/hr', su: 'C/hr', delta: true },
  subcooling_margin:  { us: function (v) { return v * 9 / 5; }, uu: 'F',    su: 'C', delta: true },
  tavg:               { us: function (v) { return v * 9 / 5 + 32; }, uu: 'F', su: 'C' },
  thot:               { us: function (v) { return v * 9 / 5 + 32; }, uu: 'F', su: 'C' },
  tcold:              { us: function (v) { return v * 9 / 5 + 32; }, uu: 'F', su: 'C' },
  primary_pressure:   { us: function (v) { return v * 145.038; },    uu: 'psi', su: 'MPa' },
  steam_pressure:     { us: function (v) { return v * 145.038; },    uu: 'psi', su: 'MPa' },
  porv_tailpipe_temp: { us: function (v) { return v * 9 / 5 + 32; }, uu: 'F', su: 'C' },
  condenser_vacuum:   { us: function (v) { return v * 0.2953; },     uu: 'inHg', su: 'kPa' },
  cw_inlet_temp:      { us: function (v) { return v * 9 / 5 + 32; }, uu: 'F', su: 'C' },
};
function unitFor(field) {
  if (FIELD_UNITS[field]) return FIELD_UNITS[field];
  var k = Object.keys(UNITS).filter(function (s) { return field.length > s.length && field.slice(-s.length) === s; });
  return k.length ? UNITS[k[0]] : null;
}
function sig(v) {
  var a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  if (a === 0) return '0';
  if (a >= 0.001) return v.toFixed(4);
  return v.toExponential(2);
}
// One cell: US first, SI in parentheses. Non-numeric passes through untouched — booleans
// and mode names are the point of several of these fields.
function fmt(field, v) {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v !== 'number') return String(v);
  if (!isFinite(v)) return String(v);
  var u = unitFor(field);
  if (!u) return sig(v);
  return sig(u.us(v)) + ' ' + u.uu + ' (' + sig(v) + ' ' + u.su + ')';
}

// ------------------------------------------------------------------------ arg parsing
function dur(s, dflt) {
  if (s == null) return dflt;
  var m = /^([0-9.]+)\s*([smh]?)$/.exec(String(s).trim());
  if (!m) die('cannot read a duration from "' + s + '" — use 90s, 30m or 12h');
  var n = parseFloat(m[1]);
  return m[2] === 'h' ? n * 3600 : m[2] === 'm' ? n * 60 : n;
}
function die(msg) { console.error(R + 'measure_stack: ' + msg + X); process.exit(2); }

// Whitelisted, and a typo is a HARD ERROR rather than a silent default. `--wach=tavg_c`
// accepted as an unknown key would have run the default field set and printed a table that
// looks entirely correct — the quiet-wrong-answer class this harness exists to stop.
var KNOWN = { plant: 1, version: 1, ic: 1, for: 1, every: 1, accel: 1, lineup: 1, watch: 1,
              cmd: 1, seed: 1, 'attention-stops': 1, csv: 1, quiet: 1, list: 1, help: 1 };
var argv = process.argv.slice(2), OPT = { cmds: [] };
argv.forEach(function (a) {
  var m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
  if (!m) die('unrecognised argument "' + a + '" — options are --' + Object.keys(KNOWN).join(' --'));
  var k = m[1], v = m[2];
  if (!KNOWN[k]) die('unknown option "--' + k + '" — options are --' + Object.keys(KNOWN).join(' --'));
  if (k === 'cmd') OPT.cmds.push(v);
  else OPT[k.replace(/-/g, '_')] = (v == null ? true : v);
});
if (OPT.help) { console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }

var PLANT = OPT.plant || 'pwr';
var IC = OPT.ic || 'hot_full_power';
var VERSION = OPT.version || null;
var ACCEL = OPT.accel != null ? parseFloat(OPT.accel) : 60;
var BARE = OPT.lineup === 'bare';
var FOR = dur(OPT.for, 3600);
var EVERY = OPT.every != null ? dur(OPT.every) : Math.max(1, FOR / 12);
var WATCH = (OPT.watch || 'power_pct,tavg_c,pressure_mpa,sg_level_pct').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
// The instrument PRNG seed. Default 4242 — the value this harness has always used, so an
// un-seeded command reproduces every number ever taken with it. It is NOT the probe default:
// `OpsHarness` seeds 0xC0FFEE (test/ops_harness.js), so a measure_stack number and a
// behavior/ops probe number are different plants and comparing them silently is a mistake
// (#394/#378: the limit cycle's amplitude reads 1.83-4.89 pts across seeds — a one-seed
// verdict on a noise-excited instability is one PRNG's opinion). Printed in the header for
// the same reason the layer is: a wrong-seed figure must be visible in the artifact.
var SEED = OPT.seed != null ? parseInt(OPT.seed, 10) : 4242;
if (!isFinite(SEED)) die('--seed needs an integer, got "' + OPT.seed + '"');

if (OPT.list) {
  var e0 = new RD.SimulationService({ seed: 1 });
  e0.selectPlant(PLANT, IC, VERSION, undefined);
  var s0 = e0.assembleSnapshot();
  [['true_state', s0.true_state], ['instruments', s0.instruments], ['control_state', s0.control_state]].forEach(function (p) {
    console.log('\n' + B + p[0] + X + '\n  ' + Object.keys(p[1] || {}).join(' '));
  });
  console.log('\n' + D + 'Resolution order is true_state -> instruments -> control_state, and the source is' +
    '\nprinted per column. `tavg_c` (truth) and `tavg` (the instrument) are DIFFERENT numbers.' + X);
  process.exit(0);
}

// ------------------------------------------------------------------------ build the stack
var svc = new RD.SimulationService({ seed: SEED });
svc.selectPlant(PLANT, IC, VERSION, BARE ? { noDefaults: true } : undefined);
// Drive tick() directly. NEVER svc.start() — see the header table: start() is timer-driven
// and advances in wall time, which is what made #266 believe this was impossible.
svc.running = true;
svc.timeAcceleration = ACCEL;
svc.attentionStops = !!OPT.attention_stops;

// Resolve each watched field to a source ONCE, against the initial snapshot, so a field
// that only appears later cannot silently switch source mid-run and change what the column
// means. An unresolvable field is a hard error — a column of dashes reads as "the plant did
// nothing", which is exactly the kind of quiet wrong answer this harness exists to stop.
var snap0 = svc.assembleSnapshot();
var SRC = {};
WATCH.forEach(function (f) {
  if (snap0.true_state && f in snap0.true_state) SRC[f] = 'true_state';
  else if (snap0.instruments && f in snap0.instruments) SRC[f] = 'instruments';
  else if (snap0.control_state && f in snap0.control_state) SRC[f] = 'control_state';
  else die('no field "' + f + '" in true_state, instruments or control_state — run --list');
});
function read(snap, f) { return (snap[SRC[f]] || {})[f]; }

// Scheduled commands: '<plant time>:<json>'
var SCHED = OPT.cmds.map(function (spec) {
  var i = spec.indexOf(':');
  if (i < 0) die('--cmd needs "<time>:<json>", got "' + spec + '"');
  var at = dur(spec.slice(0, i)), body;
  try { body = JSON.parse(spec.slice(i + 1)); }
  catch (err) { die('--cmd payload is not JSON: ' + spec.slice(i + 1)); }
  return { at: at, body: body, sent: false };
}).sort(function (a, b) { return a.at - b.at; });

// ------------------------------------------------------------------------ header
var stepsPerTick = svc._stepsPerBroadcast();
var protMs = svc.broadcastMs * ACCEL;   // sim-time granularity of the RPS/alarm evaluation
if (!OPT.quiet) {
  console.log('\n' + B + 'MEASUREMENT — FULL STACK (M4 + M5 + M6)' + X);
  console.log(D + '  Automation channels tick, engageDefaults() ran, the startup lineup is applied.' +
    '\n  This is the plant a player gets — NOT an engine-direct probe.' + X);
  console.log('  plant          ' + PLANT + (VERSION ? ' / ' + VERSION : '') + '   initial condition ' + C + IC + X);
  console.log('  lineup         ' + (BARE ? 'bare (noDefaults — campaign / Path-2)' : 'default (free play)'));
  console.log('  seed           ' + SEED + (OPT.seed == null ? D + ' (default)' + X : C + ' (--seed)' + X) +
    '   ' + D + 'OpsHarness probes use 0xC0FFEE — a different plant' + X);
  console.log('  acceleration   ' + ACCEL + 'x   ' + D + '(' + stepsPerTick + ' physics steps per broadcast; protection ' +
    'evaluated every ' + (protMs / 1000).toFixed(2) + ' sim-s — #153)' + X);
  console.log('  attention stop ' + (svc.attentionStops ? Y + 'ON — a trip will drop acceleration mid-run (#245)' + X : 'off'));
  console.log('  covering       ' + (FOR / 3600).toFixed(2) + ' plant-hours, sampled every ' + (EVERY >= 60 ? (EVERY / 60).toFixed(1) + ' min' : EVERY + ' s'));
  if (SCHED.length) SCHED.forEach(function (c) { console.log('  command @' + c.at + 's  ' + JSON.stringify(c.body)); });
  console.log('  units          ' + D + 'US customary first, SI in parentheses' + X);
  console.log('');
}

// ------------------------------------------------------------------------ run
var rows = [], nextSample = 0, t0 = process.hrtime.bigint();
var accelDropped = false, scrammedAt = null;
function sample(snap) {
  var r = { t: svc.simTime };
  WATCH.forEach(function (f) { r[f] = read(snap, f); });
  rows.push(r);
}
sample(snap0);
nextSample = EVERY;
while (svc.simTime < FOR) {
  SCHED.forEach(function (c) {
    if (!c.sent && svc.simTime >= c.at) {
      c.sent = true;
      // The return is the only evidence the command LANDED (#376). A rejected
      // command with the run allowed to continue prints a clean table of a plant
      // in which nothing happened — indistinguishable from a real null result,
      // which is how a full-size steam line break nearly got filed as "no effect"
      // (the engine's unknown-id guard fired; this loop swallowed it). Same
      // quiet-wrong-answer class as the unknown --watch field above.
      var r = svc.handleCommand(c.body);
      if (r && (r.type === 'error' || r.type === 'blocked' || r.type === 'refused')) {
        die('command REJECTED at ' + c.at + 's — ' + (r.code || r.type) +
          (r.message ? ': ' + r.message : '') + '\n  ' + JSON.stringify(c.body));
      }
    }
  });
  var snap = svc.tick();
  if (svc.timeAcceleration !== ACCEL && !accelDropped) { accelDropped = true; }
  if (scrammedAt == null && snap && snap.rps_state && snap.rps_state.scrammed) scrammedAt = svc.simTime;
  if (svc.simTime >= nextSample) { sample(snap); nextSample += EVERY; }
}
// A command scheduled at or past --for never fires, while the header above already
// promised it (#376). That run is not a measurement of the commanded evolution.
SCHED.forEach(function (c) {
  if (!c.sent) die('command @' + c.at + 's never fired — the run ends at ' + FOR + 's; schedule commands strictly before --for');
});
var finalSnap = svc.assembleSnapshot();
if (rows[rows.length - 1].t < svc.simTime) sample(finalSnap);
var wallMs = Number(process.hrtime.bigint() - t0) / 1e6;

// ------------------------------------------------------------------------ output
function tfmt(s) {
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + 'h' : '') + (h || m ? String(m).padStart(h ? 2 : 1, '0') + 'm' : '') + sec.toFixed(0).padStart(2, '0') + 's';
}
if (OPT.csv) {
  console.log(['sim_s'].concat(WATCH.map(function (f) { return f + '[' + SRC[f] + ']'; })).join(','));
  rows.forEach(function (r) { console.log([r.t.toFixed(1)].concat(WATCH.map(function (f) { return r[f]; })).join(',')); });
} else {
  var head = ['time'].concat(WATCH.map(function (f) { return f + ' [' + SRC[f].slice(0, 4) + ']'; }));
  var body = rows.map(function (r) { return [tfmt(r.t)].concat(WATCH.map(function (f) { return fmt(f, r[f]); })); });
  var w = head.map(function (h, i) {
    return body.reduce(function (m, b) { return Math.max(m, b[i].length); }, h.length);
  });
  console.log(B + head.map(function (h, i) { return h.padEnd(w[i]); }).join('  ') + X);
  console.log(D + w.map(function (n) { return '─'.repeat(n); }).join('  ') + X);
  body.forEach(function (b) { console.log(b.map(function (c, i) { return c.padEnd(w[i]); }).join('  ')); });
}

if (!OPT.quiet) {
  console.log('');
  if (scrammedAt != null) console.log(Y + '  REACTOR TRIP at ' + tfmt(scrammedAt) + ' — ' +
    (finalSnap.rps_state.last_trip_reason || 'reason not recorded') + X);
  if (accelDropped) console.log(Y + '  Time acceleration changed mid-run (now ' + svc.timeAcceleration +
    'x). Sim time is still exact — tick() is synchronous — but PROTECTION LATENCY changed with it (#245).' + X);
  console.log(D + '  ' + (FOR / 3600).toFixed(2) + ' plant-hours in ' + (wallMs / 1000).toFixed(1) +
    ' s of wall clock (' + (svc.simTime / (wallMs / 1000)).toFixed(0) + 'x real time), full stack.' + X);
}
