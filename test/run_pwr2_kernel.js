/*
 * run_pwr2_kernel.js — DOES THE CONTROL KERNEL PASS ON WHAT THE OPERATOR SENT? (#546/#547)
 *
 * run_pwr2_forwarding asks that question of the ENGINE'S internal layers ("does each layer
 * pass on what it receives?"). This asks it one layer up, of the M4 control kernel, and it
 * exists because the answer was NO and nothing stood at the seam:
 *
 *   - #546  With Failure to Scram armed from the casualty menu, the operator's SCRAM was
 *           DROPPED at control_kernel.js:345 (`return null` — the value a SUCCESSFUL command
 *           also returns), and the #509 engine-owned-RPS mirror then erased the kernel's own
 *           manual-trip latch inside the same evaluate. Measured at hot full power: 99.52 %
 *           power, 0 annunciators and no trip at +60 s, against 61.19 % / 6 / latched when
 *           the same command reaches the plant.
 *   - #547  With PORV Stuck Open armed, CLOSE PORV was rewritten into `open_porv`
 *           (control_kernel.js:346) — a name PWR2 REFUSES — so the operator got internal
 *           jargon naming a command that is not a control, telling them to press the button
 *           they had just pressed.
 *
 * ROOT: PWR2 kept the RETIRED plant's failure table by reference, and seven of its rows are
 * `command_override` — the kernel's licence to drop or rewrite a command, written in the old
 * plant's action names and payload keys. PWR2 models all seven inside its own engine, so the
 * kernel held a SECOND, contradicting authority (HR9). pwr2_shell.getProtectionConfig now
 * hands over the MENU fields only.
 *
 * The five bands, and why each is shaped as it is:
 *
 *   0. PRECONDITIONS. A differential that asserts "nothing was rewritten" passes trivially on
 *      an empty menu, and an absence check that pins a NON-EVENT is the hollow-check class
 *      this repo keeps finding. So: the menu is the size it should be, the retired table still
 *      carries the seven rows the strip is protecting against, and the menu fields survived.
 *   1. THE DIFFERENTIAL. Every casualty row x every board-reachable action: the command that
 *      ARRIVES at engine.applyCommand must be byte-identical to the same press with no row
 *      armed. A response may differ ONLY when the arrived command is identical — that is the
 *      plant refusing out loud (an RCP start with no offsite power), not the kernel rewriting.
 *   2. BEHAVIOUR, through the shipped stack. Band 1 says the command arrives unchanged; this
 *      says the plant then does the declared thing. It rides real physics because a command
 *      that arrives and is never read is the same defect wearing a passing check.
 *   3. THE STATIC CROSS-PLANT CHECK. For every `command_override` row in every shipped
 *      protection config, both the intercepted action AND the override action must exist in
 *      that engine's command surface. This is what would have caught #547 at build time, and
 *      it holds for any future plant that reuses a table.
 *   4. BOARD VOCABULARY. No board-reachable action may land in PWR2's REFUSED registry.
 *      run_pwr2_board's no-orphan sweep is HOLLOW for this: it accepts a press whose result is
 *      "an error WITH a message", so a button that can only throw developer jargon passes it.
 *      The five that do are STRICT XFAILS here (born failing) rather than a loosened baseline.
 *
 * Strict xfail: a listed check that PASSES reds this runner until the entry is promoted.
 *
 * Injection self-test: the strip, the kernel's interception guard, the mirror and the engine's
 * own scram block are reverted from source and the matching checks must go red.
 *
 *   node test/run_pwr2_kernel.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');

global.window = global;

var LAYERS = path.join(__dirname, '..', 'layers');
var KPATH = path.join(LAYERS, 'control', 'control_kernel.js');
var CPATH = path.join(LAYERS, 'control', 'pwr_control.js');
var SHPATH = path.join(SRC, 'pwr2_shell.js');

require(path.join(__dirname, '..', 'engines', 'load_mode.js'));
require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_config.js'));
require(KPATH);
require(CPATH);
require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_instruments.js'));
require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_engine.js'));
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
 'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater', 'pwr2_engine', 'pwr2_shell'
].forEach(function (f) { require(path.join(SRC, f + '.js')); });
require(path.join(LAYERS, 'instructor_layer.js'));
require(path.join(LAYERS, 'simulation_service.js'));

var RD = globalThis.RD;

/* ---- the expected-fail set ---------------------------------------------------------------
 * Band 4 only. Each entry is a board control that sends a command PWR2 REFUSES, so the press
 * can only throw. They are the BOARD still speaking the retired plant's vocabulary — the
 * #534 pattern-2 shape one door over from this runner's subject — and are tracked separately.
 * A fix that lands without promoting its entry reds this runner. */
var XFAIL = {
  /* ALL FIVE PROMOTED (#551/#559/#567, 2026-08-27) — the entries are kept as a record of what
   * they were, because a promoted xfail with its reason deleted is a check nobody can date.
   *
   *   connect_grid / set_load_mode — Grid MANUAL and FOLLOW were a dispatch-MODE pair on a
   *     plant with one dispatch mode, and MANUAL threw TWICE per press. The pair is the
   *     turbine LATCH / TRIP now, which is what those tiles were reaching for: the real gap
   *     was that NO command in the registry un-latched the turbine (896 combinations).
   *   set_sr_detector / set_condenser_cw_temp — the plant publishes `sr_detector_fixed` and
   *     `condenser_cw_temp_fixed`, and the board darkens them the way it already darkens the
   *     ADV box. The refusal texts stay; the invitation to press does not.
   *   set_adv_setpoint — this one WAS already unreachable, and the entry said so while
   *     admitting "probably is not a measurement". It never needed a fix, only the measurement
   *     that band 4 now makes. Promoting it is the measurement landing.
   *
   * The band still runs for every action, so a NEW refused board action reds this runner
   * instead of joining a list. */
};

/* ---- PAYLOAD SHAPES ARE THE BOARD'S OWN --------------------------------------------------
 * Lifted from ui/diagram/board/pwr_board_wiring.js (its single cmd() funnel at :233, plus the
 * VALVE_TOGGLE ternaries at :2023 that a naive `action:` grep misses) and from the ui/app.js
 * surfaces still live on a PWR2 session. A synthetic payload would test a command no player
 * can send, which is how the #506 class of mapper defects survived: the command lands, does
 * the wrong thing, and nothing says so. */
var ACTIONS = [
  { action: 'scram' },
  { action: 'reset_rps' },
  { action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'normal' },
  { action: 'rod_nudge', group_id: 'control_rods', steps: 1, speed: 'normal' },
  { action: 'rod_stop', group_id: 'control_rods' },
  { action: 'rod_stop_all' },
  { action: 'set_load_target', mwe: 80 },
  /* connect_grid and set_load_mode LEFT this list with the tiles that sent them
   * (#551/#559/#567): the grid FOLLOW / MAN pair is the turbine LATCH / TRIP pair now. */
  { action: 'disconnect_grid' },
  { action: 'latch_turbine' },
  { action: 'trip_turbine' },
  { action: 'set_heater', power_pct: 60 },
  { action: 'set_heater', auto: true },
  { action: 'set_spray', pct: 40 },
  { action: 'set_spray', auto: true },
  { action: 'set_pressure_setpoint', mpa: 15.4 },
  { action: 'open_porv_manual' },
  { action: 'close_porv' },
  { action: 'open_block_valve' },
  { action: 'close_block_valve' },
  { action: 'set_charging_flow', normalized: 0.0002 },
  { action: 'set_charging_pump', running: true },
  { action: 'set_charging_pump', running: false },
  { action: 'set_cvcs_auto', active: false },
  { action: 'set_letdown_orifices', a: true, b: false },
  { action: 'set_letdown_flow', normalized: 0.0002 },
  { action: 'set_boron_adjust', rate: 1 },
  { action: 'take_boron_sample' },
  { action: 'set_feed_pump_speed', pct: 90 },
  { action: 'set_feedwater_flow', pct: 90 },
  { action: 'feed_pump_nudge', delta_pct: 5 },
  { action: 'set_feed_coupled', active: true },
  { action: 'isolate_feedwater', active: false },
  { action: 'set_afw', active: true },
  { action: 'set_afw', active: false },
  { action: 'set_afw_flow', normalized: 0.5 },
  { action: 'set_afw_block', open: true },
  { action: 'set_hpi', active: true },
  { action: 'set_hpi', active: false },
  { action: 'set_lpi', active: true },
  { action: 'set_rhr', active: true },
  { action: 'set_rhr', active: false },
  { action: 'set_rhr_hx', pct: 50 },
  { action: 'set_dhr', active: true },
  { action: 'open_msiv' },
  { action: 'close_msiv' },
  { action: 'open_accumulator_valve' },
  { action: 'close_accumulator_valve' },
  { action: 'set_steam_dump', mode: 'auto' },
  { action: 'set_steam_dump', mode: 'closed' },
  { action: 'set_steam_dump', mode: 'open' },
  { action: 'set_steam_dump_setpoint', mpa: 7.0 },
  { action: 'set_adv', mode: 'auto' },
  { action: 'set_adv', mode: 'closed' },
  { action: 'set_adv_setpoint', mpa: 7.2 },
  { action: 'set_rcp', running: false },
  { action: 'set_rcp', running: true },
  { action: 'set_sr_detector', on: true },
  { action: 'set_condenser_cw_temp', c: 30 },
  { action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: true },
  /* kernel-consumed verbs, swept so a silent change of hands would show up as a divergence */
  { action: 'set_esf_auto', system: 'afw', auto: true },
  { action: 'set_auto_channel', channel_id: 'boron_conc', engaged: true },
  { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 700 },
  { action: 'acknowledge_all_alarms' }
];

/* the seven rows the retired table types as command_override — named so band 0 can prove the
 * strip is defending against something that still exists rather than passing on an empty set */
var OVERRIDE_ROWS = ['stuck_porv_open', 'turbine_trip', 'loss_of_feedwater', 'sg_overfeed',
                     'failure_to_scram', 'failed_pzr_heaters', 'stuck_open_spray'];

var U = { psia: function (m) { return m * 145.038; }, F: function (c) { return c * 9 / 5 + 32; } };

/* Each plant's own answer to "is this an operator command?" — PWR2's three registries, and
 * the retired engine's applyCommand switch, parsed from its source the way run_pwr2_shell
 * already partitions it (:849). Parsing beats a hand-list: a hand-list ages into a lie. */
function pwr2Accepts(a) {
  var SH = RD.pwr2.shell;
  return !!(SH.MAPPED[a] || SH.REHOMED[a]);
}
var PWR1_ACTIONS = null;
function pwr1Accepts(a) {
  if (!PWR1_ACTIONS) {
    /* the switch only — the failure-effect cases further down the file are not commands */
    var src = fs.readFileSync(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_engine.js'), 'utf8');
    var i = src.indexOf('PWREngine.prototype.applyCommand');
    var j = src.indexOf('PWREngine.prototype.', i + 10);
    var body = src.slice(i, j === -1 ? src.length : j), m, re = /case '([a-z_0-9]+)'/g;
    PWR1_ACTIONS = {};
    while ((m = re.exec(body)) !== null) PWR1_ACTIONS[m[1]] = true;
  }
  return !!PWR1_ACTIONS[a];
}

function mkWorld(settle) {
  var svc = new RD.SimulationService({ seed: 0xB0A2D });
  svc.selectPlant('pwr2', 'hot_full_power', null, undefined);
  svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
  var snap = null;
  function cmd(c) {
    var r;
    try { r = svc.handleCommand(c); }
    catch (e) { r = { type: 'error', code: 'COMMAND_ERROR', message: String(e && e.message || e) }; }
    return r;
  }
  function tick(n) { for (var i = 0; i < (n || 1); i++) snap = svc.tick(); return snap; }
  tick(settle === undefined ? 12 : settle);
  return { svc: svc, cmd: cmd, tick: tick,
           snap: function () { return snap; },
           eng: function () { return svc.engine.eng; },
           shell: function () { return svc.engine; } };
}

/* ============================================================================ the suite */
function runSuite(rec, quiet, only) {
  var nX = { pass: 0, xfail: 0, fail: 0, xpass: 0 };
  function grp(g) { return only === undefined || only === g; }
  function ck(id, name, cond, note) {
    var ok = !!cond, xf = XFAIL[id], verdict;
    if (ok && !xf) { verdict = 'PASS'; nX.pass++; }
    else if (!ok && xf) { verdict = 'XFAIL'; nX.xfail++; }
    else if (!ok && !xf) { verdict = 'FAIL'; nX.fail++; }
    else { verdict = 'XPASS'; nX.xpass++; }
    rec.push({ id: id, ok: ok, verdict: verdict });
    if (quiet) return ok;
    console.log('  ' + (verdict === 'XPASS' ? 'UNEXPECTED PASS' : verdict.padEnd(5)) + '  ' +
      name + (note ? '  -- ' + note : '') +
      (verdict === 'XFAIL' ? '\n           [expected: ' + xf + ']' : '') +
      (verdict === 'XPASS' ? '\n           [the fix landed — PROMOTE the xfail: ' + xf + ']' : ''));
    return ok;
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  var SH = RD.pwr2.shell;

  /* ---------------------------------------------------------- band 0: preconditions (P) */
  if (grp('P')) {
    head('0 -- PRECONDITIONS (without these the differential below is vacuous)');
    var probe = new RD.pwr2.shell.PWR2Engine({ initial_state: 'hot_full_power' });
    var cfg = probe.getProtectionConfig();
    var menu = Object.keys(cfg.failures);
    ck('pre-menu-size', 'the shipped casualty menu is 22 rows', menu.length === 22,
       menu.length + ' rows');
    /* THE ROW THAT MAKES THE DIFFERENTIAL MEAN ANYTHING. If the retired table ever stops
     * typing these seven as command_override, band 1 becomes an assertion about nothing —
     * and would stay green for ever while saying so. */
    var oldF = RD.PWR_CONFIG.protection.failures;
    var stillCO = OVERRIDE_ROWS.filter(function (id) {
      return oldF[id] && oldF[id].type === 'command_override' &&
             (oldF[id].intercepts || []).length > 0;
    });
    ck('pre-retired-table', 'the retired table still types 7 rows command_override WITH intercepts',
       stillCO.length === 7, stillCO.length + '/7');
    /* THE LEAK TEST IS THE KERNEL'S OWN GUARD (control_kernel.js:344), not "no `effect` key":
     * `effect` is legitimate and common on physics_parameter rows, where it names the ENGINE
     * lever (stop_pump, coast_down_pumps, primary_leak) and the kernel never reads it. What
     * must not survive is a row the interception loop would act on. */
    var leaked = menu.filter(function (id) {
      var d = cfg.failures[id];
      return d && d.type === 'command_override' &&
             ((d.intercepts || []).length > 0 || d.override !== undefined ||
              d.override_value !== undefined);
    });
    ck('pre-no-intercepts', 'no PWR2 row can reach the kernel\'s interception body',
       leaked.length === 0, leaked.length ? 'leaked: ' + leaked.join(',') : 'clean');
    /* the strip must not have gutted the MENU — getFailureCatalog reads exactly these */
    var lost = OVERRIDE_ROWS.filter(function (id) {
      var d = cfg.failures[id];
      return !d || !d.display || !d.category;
    });
    ck('pre-menu-fields', 'all 7 stripped rows keep display + category (the Failures tab reads them)',
       lost.length === 0, lost.length ? 'lost: ' + lost.join(',') : 'intact');
    var cat = new RD.ControlLayer(probe, cfg).getFailureCatalog();
    ck('pre-catalog', 'getFailureCatalog still publishes all 22 rows with a display name',
       cat.length === 22 && cat.every(function (f) { return !!f.display; }), cat.length + ' entries');
    ck('pre-porv-slider', 'stuck_porv_open keeps its severity slider metadata',
       !!(cfg.failures.stuck_porv_open && cfg.failures.stuck_porv_open.severity_meta));
  }

  /* ------------------------------------------------------------ band 1: the differential (D)
   * ONE world, no ticking. The interception is a pure function of (activeFailures, command),
   * so a frozen plant makes every plant-side guard identical between the armed and unarmed
   * passes and the only thing that can differ is the kernel. The row is armed by pushing its
   * def straight onto layer.activeFailures — which is exactly what injectFailure does with it
   * (control_kernel.js:378) — so no physics changes underfoot and the comparison is clean.
   * Band 2 then runs the REAL menu path with the real plant, which is the claim that matters. */
  if (grp('D')) {
    head('1 -- THE DIFFERENTIAL: 22 casualty rows x ' + ACTIONS.length + ' board actions');
    var w = mkWorld();
    var eng = w.svc.engine, real = eng.applyCommand.bind(eng), arrived = [];
    eng.applyCommand = function (c) { arrived.push(JSON.stringify(c)); return real(c); };
    var layer = w.svc.layer;
    var cfgD = eng.getProtectionConfig();
    function press(c) {
      arrived.length = 0;
      var r = w.cmd(JSON.parse(JSON.stringify(c)));
      return { got: arrived.join('|'), res: JSON.stringify(r) };
    }
    var base = ACTIONS.map(press);
    var rowsD = Object.keys(cfgD.failures);
    var rewrote = [], dropped = [], unlabelled = [];
    rowsD.forEach(function (id) {
      layer.activeFailures.push({ id: id, def: cfgD.failures[id], severity: 1.0 });
      ACTIONS.forEach(function (c, i) {
        var t = press(c), b = base[i];
        if (t.got !== b.got) {
          if (b.got && !t.got) dropped.push(id + ' / ' + c.action);
          else rewrote.push(id + ' / ' + c.action + '  ' + b.got + ' -> ' + (t.got || '(nothing)'));
        } else if (t.res !== b.res) {
          /* allowed ONLY as a labelled refusal from the plant itself */
          var r = null;
          try { r = JSON.parse(t.res); } catch (e) { r = null; }
          if (!r || !r.message) unlabelled.push(id + ' / ' + c.action + ' -> ' + t.res);
        }
      });
      layer.activeFailures.pop();
    });
    eng.applyCommand = real;
    ck('diff-no-rewrite', 'no casualty row REWRITES an operator command on its way to the plant',
       rewrote.length === 0,
       rewrote.length ? rewrote.length + ': ' + rewrote.slice(0, 4).join(' ; ') : 'all ' +
       (rowsD.length * ACTIONS.length) + ' pairs byte-identical');
    ck('diff-no-drop', 'no casualty row DROPS an operator command',
       dropped.length === 0,
       dropped.length ? dropped.length + ': ' + dropped.slice(0, 4).join(' ; ') : 'none dropped');
    ck('diff-refusals-labelled',
       'every response divergence is the PLANT refusing out loud, not a silent change',
       unlabelled.length === 0,
       unlabelled.length ? unlabelled.slice(0, 3).join(' ; ') : 'all carry a message');
  }

  /* ------------------------------------------------------------- band 2: behaviour (B*) */
  if (grp('B1')) {
    /* #546. Injected through the REAL casualty menu, pressed through the REAL stack. */
    head('2a -- ANTICIPATED TRANSIENT WITHOUT SCRAM: the pushbutton reaches the plant (#546)');
    var wA = mkWorld();
    wA.cmd({ action: 'inject_failure', failure_id: 'failure_to_scram', severity: 1.0 });
    wA.tick(30);
    var pre = wA.eng().pt.reactor_trip;
    var rA = wA.cmd({ action: 'scram' });
    /* THE HALF THE MIRROR ATE: the kernel latched at :283 and the mirror cleared it at :452
     * before any snapshot was assembled, so no snapshot ever carried it. Read the FIRST one. */
    var s1 = wA.tick(1);
    ck('atws-accepted', 'the SCRAM press is ACCEPTED (was a bare null — the value success returns)',
       !!(rA && rA.ok === true && rA.action === 'scram'), JSON.stringify(rA));
    ck('atws-first-snapshot', 'rps_state.scrammed is TRUE in the FIRST snapshot after the press',
       !!(s1 && s1.rps_state && s1.rps_state.scrammed === true));
    wA.tick(60);
    var tsA = wA.svc.engine.getTrueState(), eA = wA.eng(), sA = wA.snap();
    var annA = (sA && sA.alarms || []).filter(function (a) { return a.state !== 'clear'; }).length;
    ck('atws-pre-untripped', 'precondition: the plant was NOT tripped before the press', pre === false);
    ck('atws-latched', 'the trip LATCHES (a failure to scram is the DROP failing, not the logic)',
       eA.pt.reactor_trip === true, 'cause ' + eA.pt.trip_cause);
    /* FULLY OUT, in the plant's own currency (#602 phase 2) — the bank is 627 steps now and
     * `200` was 'fully withdrawn' written as an absolute. */
    var bankK = RD.pwr2.kinetics.RODS.max_steps;
    ck('atws-rods-held', 'the rods stay FULLY OUT — the drop is what failed',
       Math.abs(eA.rodSteps - bankK) < 0.5,
       eA.rodSteps.toFixed(1) + ' of ' + bankK + ' steps');
    ck('atws-annunciators', 'annunciators light (0 of them was the player-visible symptom)',
       annA >= 4, annA + ' lit');
    ck('atws-self-limits', 'power self-limits through moderator feedback instead of standing at 99 %',
       tsA.power_pct < 80, tsA.power_pct.toFixed(2) + ' % / Tavg ' + U.F(tsA.tavg_c).toFixed(1) + ' F');
  }

  if (grp('B2')) {
    /* #547. The stick needs the valve LIFTED first — arming alone was enough to trigger the
     * rewrite (the kernel intercepts on the action name and never reads valve state), but the
     * surviving-demand half needs the manual lift. */
    head('2b -- STUCK-OPEN PORV: the operator\'s CLOSE reaches the plant (#547)');
    var wP = mkWorld();
    wP.cmd({ action: 'inject_failure', failure_id: 'stuck_porv_open', severity: 1.0 });
    wP.cmd({ action: 'open_porv_manual' });
    wP.tick(30);
    var liftedP = wP.svc.engine.getTrueState().porv_open;
    var rP = wP.cmd({ action: 'close_porv' });
    wP.tick(30);
    var tsP = wP.svc.engine.getTrueState(), eP = wP.eng();
    ck('porv-lifted', 'precondition: the valve is actually open and stuck', liftedP === true &&
       tsP.porv_stuck === true);
    ck('porv-close-accepted', 'CLOSE PORV is ACCEPTED (was a REFUSED throw naming open_porv)',
       !!(rP && rP.ok === true), JSON.stringify(rP));
    ck('porv-demand-cleared', 'the operator\'s own manual-open demand is CLEARED by their close',
       eP.pz.porvManual === false);
    ck('porv-still-stuck', 'and the valve stays OPEN anyway — the TMI-2 lesson survives the fix',
       tsP.porv_open === true, U.psia(tsP.pressure_mpa).toFixed(1) + ' psia');
  }

  if (grp('B3')) {
    head('2c -- FAILED HEATERS: the demand STANDS, and the repair gives it back');
    var wH = mkWorld();
    wH.cmd({ action: 'inject_failure', failure_id: 'failed_pzr_heaters', severity: 1.0 });
    wH.tick(30);
    wH.cmd({ action: 'set_heater', power_pct: 80 });
    wH.tick(30);
    var eH = wH.eng();
    ck('heater-demand-stands', 'the operator\'s 80 % demand is what reaches the plant (was 0)',
       Math.abs((eH.pzDrivers.heaters_manual || 0) - 0.8) < 1e-6,
       'pzDrivers.heaters_manual = ' + eH.pzDrivers.heaters_manual);
    ck('heater-dead-while-failed', 'and it delivers nothing while the heaters are failed',
       wH.svc.engine.getTrueState().pzr_heater_kw < 0.01);
    wH.cmd({ action: 'clear_failure', failure_id: 'failed_pzr_heaters' });
    wH.tick(60);
    ck('heater-repair-restores', 'REPAIR restores heat at the standing demand (was 0.00 kW for ever)',
       wH.svc.engine.getTrueState().pzr_heater_kw > 10,
       wH.svc.engine.getTrueState().pzr_heater_kw.toFixed(2) + ' kW');
  }

  if (grp('B4')) {
    head('2d -- OVERFEED: the operator\'s corrective command is not inverted');
    var wO = mkWorld();
    wO.cmd({ action: 'inject_failure', failure_id: 'sg_overfeed', severity: 1.0 });
    wO.tick(30);
    /* the operator tries to STOP the overfeed. The kernel used to rewrite this to 120 %. */
    wO.cmd({ action: 'set_feedwater_flow', pct: 0 });
    wO.tick(30);
    var eO = wO.eng();
    ck('overfeed-demand-honest', 'a feed demand of 0 % arrives as 0 %, not as the failure\'s 120 %',
       Math.abs(eO.fw.manual_frac) < 1e-9, 'fw.manual_frac = ' + eO.fw.manual_frac);
    ck('overfeed-still-overfeeding', 'and the overfeed continues anyway — the engine owns it',
       eO.fw.overfeed === true &&
       wO.svc.engine.getTrueState().fw_flow_normalized > 1.15,
       wO.svc.engine.getTrueState().fw_flow_normalized.toFixed(4));
    var lvlBad = wO.svc.engine.getTrueState().sg_level_pct;
    wO.cmd({ action: 'clear_failure', failure_id: 'sg_overfeed' });
    wO.tick(60);
    var lvlAfter = wO.svc.engine.getTrueState().sg_level_pct;
    ck('overfeed-repair-recovers',
       'REPAIR then honours the demand and level FALLS (the kernel drove it to 98 % instead)',
       lvlAfter < lvlBad, lvlBad.toFixed(2) + ' -> ' + lvlAfter.toFixed(2) + ' %');
  }

  if (grp('B5')) {
    head('2e -- TURBINE TRIP + LOSS OF FEEDWATER: the failures hold with the kernel out of it');
    var wT = mkWorld();
    wT.cmd({ action: 'inject_failure', failure_id: 'turbine_trip', severity: 1.0 });
    wT.tick(30);
    wT.cmd({ action: 'set_load_target', mwe: 100 });
    wT.tick(60);
    var eT = wT.eng(), tsT = wT.svc.engine.getTrueState();
    ck('turbine-demand-stands', 'the operator\'s 100 MWe load target survives (was zeroed)',
       Math.abs(eT.tb.load_target_mwe - 100) < 0.5, eT.tb.load_target_mwe.toFixed(1) + ' MWe');
    ck('turbine-still-tripped', 'and the turbine stays tripped at 0 MWe — the engine owns it',
       tsT.turbine_tripped === true && tsT.mwe_output < 0.5, tsT.mwe_output.toFixed(2) + ' MWe');

    var wF = mkWorld();
    wF.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater', severity: 1.0 });
    wF.tick(30);
    wF.cmd({ action: 'set_feedwater_flow', pct: 100 });
    wF.tick(60);
    var tsF = wF.svc.engine.getTrueState(), eF = wF.eng();
    ck('lofw-precondition', 'precondition: both main feed pumps are stopped',
       eF.fw.pumpA === false && eF.fw.pumpB === false);
    ck('lofw-holds', 'a 100 % feed demand cannot restore flow — the STOPPED PUMPS hold it',
       tsF.fw_flow_normalized < 0.05, tsF.fw_flow_normalized.toFixed(4) + ' of rated');

    var wS = mkWorld();
    wS.cmd({ action: 'inject_failure', failure_id: 'stuck_open_spray', severity: 1.0 });
    wS.tick(30);
    wS.cmd({ action: 'set_spray', auto: true });
    wS.tick(60);
    var tsS = wS.svc.engine.getTrueState();
    ck('spray-holds', 'returning the spray to AUTO cannot un-stick it — the engine owns it',
       tsS.spray_stuck === true && tsS.spray_flow_pct > 90,
       tsS.spray_flow_pct.toFixed(1) + ' % / ' + U.psia(tsS.pressure_mpa).toFixed(1) + ' psia');
  }

  /* --------------------------------------------------- band 3: static, every plant (S) */
  if (grp('S')) {
    head('3 -- STATIC, EVERY SHIPPED PLANT: an override may not name an action its engine lacks');
    /* This is the build-time form of #547. It is plant-agnostic on purpose: any future plant
     * that reuses a table inherits it, and PWR2 inherited exactly this. */
    var PLANTS = [
      { id: 'pwr',  cfg: RD.PWR_CONFIG.protection, has: pwr1Accepts },
      { id: 'pwr2', cfg: new RD.pwr2.shell.PWR2Engine({ initial_state: 'hot_full_power' })
                          .getProtectionConfig(), has: pwr2Accepts }
    ];
    var badS = [];
    PLANTS.forEach(function (p) {
      Object.keys(p.cfg.failures || {}).forEach(function (id) {
        var d = p.cfg.failures[id];
        if (!d || d.type !== 'command_override') return;
        (d.intercepts || []).forEach(function (a) {
          if (!p.has(a)) badS.push(p.id + ':' + id + ' intercepts "' + a + '" — not a command');
        });
        if (d.override && !p.has(d.override)) {
          badS.push(p.id + ':' + id + ' overrides to "' + d.override + '" — not a command');
        }
      });
    });
    ck('static-override-surface',
       'every command_override names actions its own engine accepts',
       badS.length === 0, badS.length ? badS.join(' ; ') : 'checked pwr + pwr2');
    /* Precondition: the check must actually be looking at something on at least one plant. */
    var seen = 0;
    PLANTS.forEach(function (p) {
      Object.keys(p.cfg.failures || {}).forEach(function (id) {
        if (p.cfg.failures[id].type === 'command_override' &&
            (p.cfg.failures[id].intercepts || []).length) seen++;
      });
    });
    ck('static-not-vacuous', 'and it had rows to check (7 on the retired plant, 0 on PWR2)',
       seen === 7, seen + ' rows carry intercepts across both plants');
  }

  /* ------------------------------------------------------- band 4: board vocabulary (V) */
  if (grp('V')) {
    head('4 -- BOARD VOCABULARY: a press must not land in the REFUSED registry');
    var names = ACTIONS.map(function (c) { return c.action; })
      .filter(function (a, i, arr) { return arr.indexOf(a) === i; });
    /* A REFUSED ACTION IS ONLY A DEFECT IF THE PLAYER CAN REACH IT (#567). The board darkens
     * a control the running plant does not carry, off a capability flag the plant publishes —
     * so an action may legitimately stay in REFUSED provided its control is dark. This band
     * owns the PLANT half of that claim: the flag exists and is set. The BOARD half — that the
     * control actually reads the flag and renders disabled — is `run_pwr2_board`'s, where a
     * real board is mounted. Neither half is worth anything alone, which is why they name each
     * other rather than one of them quietly covering both. */
    /* `set_condenser_cw_temp` LEFT THIS MAP at #591 item 1 / #592, and its check left with it —
     * the action moved from REFUSED to MAPPED, so there is no longer a refusal to darken. The
     * entry is deleted rather than kept: this loop iterates REFUSED and looks each action up
     * here, so a leftover row would be a map entry nothing can reach, which is the
     * hand-maintained-map trap this repo already has a name for. What replaced it is a live
     * wire and three checks in `run_pwr2_condenser` plus four in `run_pwr2_board`. */
    var DARKENED = {
      set_sr_detector:       'sr_detector_fixed',
      set_adv_setpoint:      'adv_setpoint_fixed'
    };
    var csV = eng.getControlState();
    names.forEach(function (a) {
      if (SH.REFUSED[a] === undefined) return;             /* only the interesting ones */
      var flag = DARKENED[a];
      ck('board-vocab-' + a,
         'the board never sends "' + a + '", or the plant publishes the flag that darkens it',
         !!flag && csV[flag] === true,
         flag ? ('control_state.' + flag + ' = ' + csV[flag]) : 'REFUSED and nothing darkens it');
    });
    var unknown = names.filter(function (a) {
      return !SH.MAPPED[a] && !SH.REHOMED[a] && SH.REFUSED[a] === undefined &&
             ['set_esf_auto', 'set_auto_channel', 'set_auto_setpoint',
              'acknowledge_all_alarms'].indexOf(a) === -1;
    });
    ck('board-vocab-known', 'every other board action is in a PWR2 registry or is kernel-owned',
       unknown.length === 0, unknown.length ? unknown.join(',') : names.length + ' actions');
  }

  return nX;
}

/* ================================================================================= driver */
var BOLD = '\x1b[1m', RST = '\x1b[0m';
console.log(BOLD + '\nPWR2 x M4 CONTROL KERNEL -- does the kernel pass on what the operator sent? (#546/#547)' + RST);
var rec = [], tally = runSuite(rec, false);
var nFail = tally.fail, nXpass = tally.xpass;

/* ---- THE CLEAN-RUN GUARD ------------------------------------------------------------------
 * A failing check fails in every mutant too, so every mutation would report as caught and the
 * coverage number would be a lie. */
if (nFail > 0 || nXpass > 0) {
  console.log('\n  run_pwr2_kernel: ' + tally.pass + ' passed, ' + tally.xfail + ' xfail, ' +
              nFail + ' failed, ' + nXpass + ' unexpected-pass');
  console.log('  MUTATION SELF-TEST SKIPPED -- the CLEAN run is not green. Fix the check first.');
  process.exit(1);
}

/* ---- injection self-test ------------------------------------------------------------------
 * The multi-file form (run_pwr2_board's): [desc, PATH, SRC, anchor, replacement, {grp}].
 * `grp` scopes the replay to the band that can SEE the mutation — the whole suite per mutant
 * would ride the plant seven times over. Each named group is preflighted ALONE on the clean
 * build first, because in the replay loop a crash counts as caught, so a group that cannot
 * stand alone would silently stand in for coverage. */
var SRCS = {};
[['K', KPATH], ['C', CPATH], ['SH', SHPATH]].forEach(function (p) {
  SRCS[p[0]] = { path: p[1], text: fs.readFileSync(p[1], 'utf8').replace(/\r\n/g, '\n') };
});

var MUTS = [
  ['the strip is reverted — PWR2 takes the retired plant\'s interception fields again', 'SH',
   "            out[id] = def.type === 'command_override'\n" +
   "              ? { type: def.type, category: def.category, display: def.display,\n" +
   "                  severity_meta: def.severity_meta }\n" +
   "              : def;",
   '            out[id] = def;', { grp: 'D' }],

  ['the strip drops the MENU fields too (display gone, the Failures tab goes blank)', 'SH',
   '              ? { type: def.type, category: def.category, display: def.display,\n' +
   '                  severity_meta: def.severity_meta }',
   '              ? { type: def.type }', { grp: 'P' }],

  ['the kernel intercepts on TYPE alone, ignoring the missing intercepts list', 'K',
   "      if (def.type !== 'command_override' || !def.intercepts || def.intercepts.indexOf(cmd.action) === -1) continue;",
   "      if (def.type !== 'command_override') continue;\n" +
   "      if (!def.intercepts) { if (cmd.action === 'scram') return null; continue; }\n" +
   "      if (def.intercepts.indexOf(cmd.action) === -1) continue;", { grp: 'D' }],

  ['the #509 mirror is severed — an engine-owned trip never reaches rps_state', 'K',
   '      var engScram = this.lastInstruments.rps_scrammed === true;',
   '      var engScram = false;', { grp: 'B1' }],

  /* ANCHOR ON THE MENU'S DOOR, NOT THE DIRECT COMMAND. Each of these two failures is armed at
   * TWO independent sites in pwr2_shell — REHOMED.<id> (the direct command) and a line of the
   * REHOMED.inject_failure mirror, which is what the casualty menu actually reaches. The first
   * pair of anchors named the direct door and both mutations came back BLIND: this gate drives
   * the menu, so only the mirror line is on its path. Measured, not reasoned — the self-test
   * reported it. */
  ['the menu never arms the engine\'s scram block (the ATWS drops the rods)', 'SH',
   "      else if (c.failure_id === 'failure_to_scram') EN.command(e, 'scram_block', true);",
   '', { grp: 'B1' }],

  ['the retired table overrides to a name its OWN engine lacks (the #547 shape, at build time)', 'C',
   "intercepts: ['close_porv'], override: 'open_porv',",
   "intercepts: ['close_porv'], override: 'open_porv_that_does_not_exist',", { grp: 'S' }],

  ['the menu\'s PORV stick never latches the valve (the close would then really shut it)', 'SH',
   "      else if (c.failure_id === 'stuck_porv_open') EN.command(e, 'porv_stick', true);",
   '', { grp: 'B2' }]
];

/* re-execute a module's source into RD; every consumer looks its constructor up live */
function install(text) { (0, eval)(text); }

console.log('\n' + '='.repeat(74));
console.log('  SCOPED-CLEAN-PASS PREFLIGHT');
console.log('='.repeat(74));
var scopeBad = 0;
MUTS.map(function (m) { return m[4].grp; })
    .filter(function (g, i, a) { return a.indexOf(g) === i; })
    .forEach(function (g) {
      var rg = [], threw = false;
      try { runSuite(rg, true, g); } catch (e) { threw = true; }
      var fg = rg.filter(function (r) { return !r.ok && r.verdict !== 'XFAIL'; }).length;
      if (threw || fg > 0) {
        scopeBad++;
        console.log('  SCOPE ' + g + (threw ? ' THREW' : ' RED (' + fg + ')') +
                    ' on the CLEAN build -- the group cannot stand alone; GATE FAILS');
      } else console.log('  scope ' + g + ' clean alone (' + rg.length + ' checks)');
    });

console.log('\ninjection self-test (' + MUTS.length + ' mutations):');
var blind = 0;
MUTS.forEach(function (m) {
  var S = SRCS[m[1]], mutated = S.text.replace(m[2], m[3]);
  if (mutated === S.text) { console.log('  ANCHOR MISS ' + m[0]); blind++; return; }
  var r2 = [], crashed = false;
  try { install(mutated); runSuite(r2, true, m[4].grp); }
  catch (e) { crashed = true; }
  install(S.text);                                   /* restore before the next mutation */
  var reds = r2.filter(function (r) { return !r.ok && r.verdict !== 'XFAIL'; }).length;
  var caught = crashed ? 1 : reds;
  if (!caught) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].slice(0, 72).padEnd(74) +
                   (crashed ? 'threw' : reds + ' red'));
});

console.log('\n' + '='.repeat(74));
console.log('  injection self-test: ' + (MUTS.length - blind) + '/' + MUTS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  strict: an xfail that PASSES reds this runner until it is promoted.');
console.log('  run_pwr2_kernel: ' + tally.pass + ' passed, ' + tally.xfail + ' xfail, ' +
            nFail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit((nFail > 0 || nXpass > 0 || blind > 0 || scopeBad > 0) ? 1 : 0);
