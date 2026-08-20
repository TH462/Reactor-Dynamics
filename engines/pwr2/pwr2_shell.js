/* pwr2_shell.js — PWR2Engine: THE SHELL-FACING CLASS (Option B stage B2, 2026-08-20, owner
 * ruling "Next: option B"). The parallel-phase engine the M4/M5/M8 stack can hold exactly the
 * way it holds RD.PWREngine — same method surface, same `instruments.reading` member, same
 * command door — wrapped around the pwr2_engine facade, which stays the single place the
 * plant is assembled and stepped.
 *
 * THE SURFACE (from the D4 interface design + the M5/M4 call-site inventory):
 *   step(dt) · getTrueState() · getInstruments() · instruments.reading ·
 *   getControlState() · getProtectionConfig() · getActiveFailures() · applyCommand(cmd) ·
 *   reset() · getStartupLineup() · saveState()/loadState()   [schema pwr2-1.0]
 *
 * INSTRUMENTS: the class carries a REUSED `RD.PWRInstruments` instance (D4: "reuse
 * pwr_instruments.js unchanged — it consumes published truth"), fed the shim's true_state
 * each step. That reuse is exactly why stage B1 had to complete the contract first: the
 * SOURCE map's inputs are contract fields. PWR2's own internal channels (pwr2_instruments)
 * keep serving the internal RPS — two instrument layers over one truth is the declared
 * parallel-phase shape, and unifying them is future work.
 *
 * PROTECTION CONFIG: `pwr_control.js:1730` WRITES `RD.PWR_CONFIG.protection` and the engine
 * hands the same object back (the inverted coupling D4 flags). This class is the same
 * courier. Consequence, DECLARED: under the shell, M4's protection channels run over this
 * plant alongside PWR2's own internal RPS — two protection systems whose actions converge
 * (both scram; the internal RPS usually first, since its setpoints are this plant's own).
 *
 * COMMANDS: every action in the current engine's applyCommand switch is in EXACTLY ONE of
 * three registries below — MAPPED (translates to the facade's door or a system state),
 * REHOMED (the D4 class: a command that wrote a derived quantity now sets the actuator that
 * produces it), or REFUSED (the target machinery does not exist in PWR2; the entry says
 * why). A REFUSED command is a no-op that reports itself — never a silent swallow. The gate
 * asserts the partition against the current engine's own switch, so a new old-engine action
 * cannot appear unaccounted.
 *
 * SAVE: schema 'pwr2-1.0'. Per the D4 §5 owner-facing recommendation, PWR2 does NOT load
 * 'pwr-1.0' saves — the two engines have genuinely different state, and any rule inventing
 * node-level distribution from lumped values would be fabrication wearing physics' name.
 * The save is a deep copy of the native state with the two non-serializable links (the
 * pressurizer's extraMass closure on sys, the channel-spec references in the internal
 * instruments) re-established on load. The gate's round-trip check is bit-exactness: save,
 * run N steps, record; load, run N steps, compare EXACTLY — determinism is the contract.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  if (!RD || !RD.engine) throw new Error('pwr2_shell: load the pwr2 stack (incl. pwr2_engine) first');
  var EN = RD.engine, PZ = RD.pressurizer, IN = RD.instruments;

  /* ---- the command registries (see header). value: a mapper fn or a reason string. ---- */
  var MAPPED = {
    scram:            function (e, c) { EN.command(e, 'scram', true); },
    reset_rps:        function (e, c) { EN.command(e, 'reset_protection', true); },
    rod_nudge:        function (e, c) {
      EN.command(e, 'rod_target', e.rodTarget + (c.steps !== undefined ? c.steps : (c.direction > 0 ? 1 : -1)));
    },
    rod_start:        function (e, c) { EN.command(e, 'rod_target', c.direction > 0 ? 200 : 0); },
    rod_stop:         function (e, c) { EN.command(e, 'rod_target', e.rodSteps); },
    rod_stop_all:     function (e, c) { EN.command(e, 'rod_target', e.rodSteps); },
    set_load_target:  function (e, c) { EN.command(e, 'load_mwe', c.mwe !== undefined ? c.mwe : c.value); },
    trip_turbine:     function (e, c) { EN.command(e, 'turbine_trip', true); },
    turbine_trip:     function (e, c) { EN.command(e, 'turbine_trip', true); },
    set_pressure_setpoint: function (e, c) { EN.command(e, 'pzr_setpoint_mpa', c.mpa !== undefined ? c.mpa : c.value); },
    set_heater:       function (e, c) {
      var v = c.pct !== undefined ? c.pct / 100 : (c.auto ? null : c.value);
      EN.command(e, 'pzr_heaters_manual', v === undefined ? null : v);
    },
    set_spray:        function (e, c) {
      var v = c.pct !== undefined ? c.pct / 100 : (c.auto ? null : c.value);
      EN.command(e, 'pzr_spray_manual', v === undefined ? null : v);
    },
    open_block_valve:  function (e, c) { EN.command(e, 'block_valve', true); },
    close_block_valve: function (e, c) { EN.command(e, 'block_valve', false); },
    stuck_porv_open:   function (e, c) { EN.command(e, 'porv_stick', true); },
    set_charging_flow: function (e, c) {
      e._plcsAuto = false;
      e.cv.chargingDemand = Math.max(0, Math.min(1, c.normalized !== undefined ? c.normalized : c.value));
    },
    set_cvcs_auto:     function (e, c) { e._plcsAuto = c.enabled === false ? false : true; },
    set_letdown_flow:  function (e, c) { EN.command(e, 'letdown', c.normalized !== undefined ? c.normalized : c.value); },
    set_letdown_orifices: function (e, c) {
      var n = (c.a ? 1 : 0) + (c.b ? 1 : 0);                /* two-orifice lineup -> fraction */
      EN.command(e, 'letdown', n / 2);
    },
    set_boron_adjust:  function (e, c) { EN.command(e, 'makeup', c.mode || 'match'); },
    take_boron_sample: function (e, c) { /* a sample request; the reading arrives via CVCS */ },
    set_hpi:           function (e, c) { EN.command(e, 'hhsi', c.running !== false); },
    set_lpi:           function (e, c) { EN.command(e, 'lhsi', c.running !== false); },
    set_afw:           function (e, c) { EN.command(e, 'afw', c.running !== false); },
    set_afw_flow:      function (e, c) { EN.command(e, 'afw', (c.normalized !== undefined ? c.normalized : 1) > 0); },
    coast_down_pumps:  function (e, c) { EN.command(e, 'pump_trip', true); },
    stop_pump:         function (e, c) { EN.command(e, 'pump_trip', true); },
    set_steam_dump_setpoint: function (e, c) {
      EN.command(e, 'dump_pressure_setpoint_mpa', c.mpa !== undefined ? c.mpa : c.value);
    },
    set_adv:           function (e, c) { EN.command(e, 'adv_demand', (c.pct !== undefined ? c.pct : 0) / 100); },
    set_instrument_failure: function (e, c) {
      /* the pwr1 instrument ids and pwr2 channel ids largely coincide (deliberately);
       * unknown ids throw inside the module, which is the behavior we want */
      var mode = c.mode === 'fail_low' ? 'low' : c.mode === 'fail_high' ? 'high'
               : c.mode === 'noisy' ? 'noisy' : 'stuck';
      EN.command(e, 'instrument_fail', { id: c.instrument, mode: mode });
    },
    clear_instrument_failure: function (e, c) { EN.command(e, 'instrument_restore', c.instrument || true); },
    clear_all_failures: function (e, c) {
      EN.command(e, 'instrument_restore', true);
      EN.command(e, 'porv_stick', false);
      EN.command(e, 'break_close', true);
    }
  };

  /* REHOMED (D4 §3): the old command wrote a derived quantity; the new one sets the actuator
   * that produces it. Each entry documents the re-homing. */
  var REHOMED = {
    /* severity was a fitted leak scalar; PWR2's break takes an AREA and a LOCATION. The scale
     * [derived]: severity 1.0 = 20 cm2 (0.002 m2), the run_pwr2_coredamage class of small
     * break; location defaults to the old implicit cold leg (D4: "default to the current
     * implicit location so existing scenarios keep working"). */
    primary_leak: function (e, c) {
      var sev = c.severity !== undefined ? c.severity : 0.5;
      EN.command(e, 'break_open', { area_m2: Math.max(1e-5, sev * 0.002), node: c.node || 'cold_leg' });
    },
    /* the old open_porv wrote relief demand directly; PWR2's PORV is its controller's — the
     * OPERATOR path is the failure lever pair (stick to open, block valve to close) */
    open_porv_manual: function (e, c) { EN.command(e, 'porv_stick', true); },
    close_porv:       function (e, c) { EN.command(e, 'porv_stick', false); },
    /* grid disconnect is a load rejection: the actuator is the load target */
    disconnect_grid:  function (e, c) { EN.command(e, 'load_mwe', 0); },
    /* set_rcp false = trip the pump (the actuator PWR2 has); true is REFUSED below */
    set_rcp:          function (e, c) {
      if (c.running === false) EN.command(e, 'pump_trip', true);
      else throw new Error('pwr2_shell: set_rcp restart REFUSED — no RCP restart is modeled ' +
        '(the pump trips one way; see pwr2_sources)');
    },
    inject_failure:   function (e, c) {
      if (c.failure_id === 'stuck_porv_open') EN.command(e, 'porv_stick', true);
      else if (c.failure_id === 'primary_leak') REHOMED.primary_leak(e, c);
      else throw new Error('pwr2_shell: failure "' + c.failure_id + '" REFUSED — not in ' +
        'PWR2\'s failure set yet (PORV stick, primary leak, instrument failures exist)');
    },
    clear_failure:    function (e, c) {
      if (c.failure_id === 'stuck_porv_open') EN.command(e, 'porv_stick', false);
      else if (c.failure_id === 'primary_leak') EN.command(e, 'break_close', true);
      /* clearing an unknown failure is a no-op: there is nothing to clear */
    }
  };

  /* REFUSED: the machinery does not exist in PWR2. A refusal THROWS with its reason —
   * a command that silently does nothing reads exactly like a plant that survived it
   * (the same rule pwr2_instruments applies to misspelled failures). */
  var REFUSED = {
    open_porv:        'the PORV is its controller\'s; the operator path is stick/block (REHOMED pair)',
    open_pzr_safety:  'code safeties are spring-loaded metal with no lever — deliberate (§55)',
    close_pzr_safety: 'code safeties are spring-loaded metal with no lever — deliberate (§55)',
    set_load_mode:    'one dispatch mode exists (operator load target); Follow/Disconnected are the old engine\'s',
    connect_grid:     'reconnection is: reset protection, un-trip the turbine, set a load target — three real commands',
    set_steam_dump:   'the dump is controller-driven (tavg/pressure modes, C-7/C-8/C-9); no manual valve lever yet',
    set_adv_setpoint: 'the ADV auto setpoint is a sourced constant (1040 psig, §48); only demand is an operator lever',
    set_sr_detector:  'the SR channel auto-energizes below the P-6 class point; no operator lever',
    set_charging_pump: 'CVCS has no discrete pump model — charging demand is the actuator',
    set_condensate_pump: 'no condensate train model (fw = steam by construction)',
    set_condenser_cw_temp: 'the condenser model has CW pumps on/off only',
    set_containment_spray: 'containment sprays are unmodeled (matches the shim\'s registered statics)',
    set_ctmt_fans:    'containment fan coolers are unmodeled (registered static)',
    set_ctmt_recombiners: 'recombiners are unmodeled (registered static)',
    set_rhr:          'the RHR align command is owed (the #458-class SI refusal belongs with it); the module exists and reports',
    set_dhr:          'an alias of set_rhr — the RHR align command is owed, module exists',
    set_rhr_hx:       'the RHR heat-exchanger split waits on the same owed align command',
    set_feed_pump_speed: 'no feed train model — the SG is fed what leaves it, by construction',
    set_feedwater_flow:  'no feed train model — the SG is fed what leaves it, by construction',
    feed_pump_nudge:  'no feed pump model to nudge (feed = steam by construction)',
    set_feed_coupled: 'no three-element feed controller — feed = steam by construction',
    isolate_feedwater: 'no feed train model, so no isolation valve to shut either',
    loss_of_feedwater: 'no feed train model to lose — the SG is fed what leaves it',
    sg_overfeed:      'no feed train model, so nothing can overfeed the generator',
    set_steam_demand: 'the turbine is dispatched by load target only',
    open_msiv:        'no MSIV model — the line is always open (registered static)',
    close_msiv:       'no MSIV model — the steam line has no isolation valve to shut',
    open_accumulator_valve:  'accumulators are a declared omission (pwr2_eccs.js header)',
    close_accumulator_valve: 'accumulators are a declared omission',
    set_afw_block:    'no AFW block lever (registered static afw_blocked:false)',
    block_afw:        'no AFW block lever (registered static afw_blocked:false)',
    full_blackout:    'no electrical model (registered static ac_available:true)',
    degrade_hpi:      'no HPI degradation lever yet',
    failed_pzr_heaters: 'no heater failure lever yet (the shed logic is real; a failure is not)',
    failure_to_scram: 'no ATWS lever yet — the RPS cannot be failed',
    stuck_control_rod: 'one lumped bank; a single stuck rod has no representation',
    stuck_open_spray:  'no spray failure lever (registered static spray_stuck:false)',
    rod_withdrawal_runaway: 'no rod failure lever yet',
    secondary_depressurize: 'no steam-line break model yet',
    secondary_depressurize_upstream: 'no steam-line break model yet',
    vacuum_decay:     'no condenser vacuum failure lever yet'
  };

  function PWR2Engine(opts) {
    opts = opts || {};
    this.eng = EN.createEngine(opts);
    this.schema = 'pwr2-1.0';
    this._ts = EN.step(this.eng, 0.02);        /* prime: one step so every consumer has a state */
    /* the REUSED shell instrument layer (see header). Requires the pwr1 files loaded — the
     * parallel-phase shell loads both engines; a standalone harness must too, or say why not. */
    if (root.RD.PWRInstruments && root.RD.PWR_CONFIG) {
      this.instruments = new root.RD.PWRInstruments(root.RD.PWR_CONFIG, opts.seed);
      /* reset() PRIMES the lag buffers from truth — update() alone leaves the linear-lag
       * branch integrating from undefined (measured: every reading NaN) */
      this.instruments.reset(this._ts, {});
      this.instruments.update(this._ts, 0.02, {});
    } else {
      throw new Error('pwr2_shell: RD.PWRInstruments/RD.PWR_CONFIG not loaded — the shell ' +
        'class REUSES the published instrument layer (D4) and cannot honestly run without it');
    }
  }

  PWR2Engine.prototype.step = function (dt) {
    this._ts = EN.step(this.eng, dt);
    this.instruments.update(this._ts, dt, {});
    return this._ts;
  };

  PWR2Engine.prototype.getTrueState = function () { return this._ts; };
  PWR2Engine.prototype.getInstruments = function () { return this.instruments.reading; };
  PWR2Engine.prototype.getProtectionConfig = function () {
    /* the courier pattern (see header): M4 writes RD.PWR_CONFIG.protection; engines hand it back */
    return root.RD.PWR_CONFIG.protection;
  };
  PWR2Engine.prototype.getStartupLineup = function () { return []; };
  PWR2Engine.prototype.getActiveFailures = function () {
    var out = [];
    if (this.eng.pz.porvStuck) out.push('stuck_porv_open');
    if (this.eng.brk && this.eng.brk.open) out.push('primary_leak');
    var f = this.eng.ins.failure;
    Object.keys(f).forEach(function (id) { if (f[id]) out.push('instrument:' + id); });
    return out;
  };

  PWR2Engine.prototype.getControlState = function () {
    var e = this.eng, ts = this._ts;
    return {
      /* one lumped bank presented as the control group; the shutdown group is the same bank
       * under scram (honest for a one-bank plant, and the consumer's shape is kept) */
      rod_groups: [{ id: 'control', position_pct: 100 * e.rodSteps / 200,
                     scrammed: !!ts.scrammed, at_insertion_limit: e.rodSteps >= 200 }],
      porv_demand: e.pz.porvOpen ? 'open' : 'shut',
      porv_block_open: e.pz.blockOpen !== false,
      heater_power_pct: ts.pzr_heater_kw !== undefined ? 100 * ts.pzr_heater_kw / 157.8 : 0,
      spray_valve_pct: ts.spray_flow_pct !== undefined ? ts.spray_flow_pct : 0,
      heater_auto: e.pzDrivers.heaters_manual === undefined,
      spray_auto: e.pzDrivers.spray_manual === undefined,
      pressure_setpoint: e.pz.setpoint_mpa,
      charging_flow_normalized: e.cv.chargingDemand === null ? 0 : e.cv.chargingDemand,
      letdown_flow_normalized: e.cv.letdownOpen,
      charging_pump_running: true,
      condensate_pump_running: ts.condensate_pump_running === true,
      steam_demand_mwe: e.tb.load_target_mwe,
      load_mode: 'manual',
      load_target_mwe: e.tb.load_target_mwe,
      steam_dump_pct: ts.steam_dump_valve_pct !== undefined ? ts.steam_dump_valve_pct : 0,
      steam_dump_auto: true,
      adv_pct: ts.adv_valve_pct !== undefined ? ts.adv_valve_pct : 0,
      adv_auto: e.advDemand === 0,
      adv_setpoint: 1040 / 145.03774,
      steam_dump_setpoint: e.dcDrivers.pressure_setpoint_mpa,
      governor_valve_pct: ts.governor_valve_pct !== undefined ? ts.governor_valve_pct : 0,
      hpi_active: ts.hpi_active === true,
      eccs_mode: ts.eccs_mode,
      accumulator_valve_open: true,
      afw_throttle_pct: e.aw.mdafwRunning ? 100 : 0,
      sr_energized: ts.sr_energized === true,
      msiv_open: true,
      pumps: [{ id: 'rcp', running: !e.sys.pumpTripped }]
    };
  };

  PWR2Engine.prototype.applyCommand = function (cmd) {
    if (!cmd || !cmd.action) throw new Error('pwr2_shell: a command needs an action');
    var a = cmd.action;
    if (MAPPED[a])  { MAPPED[a](this.eng, cmd);  return { ok: true, action: a }; }
    if (REHOMED[a]) { REHOMED[a](this.eng, cmd); return { ok: true, action: a, rehomed: true }; }
    if (REFUSED[a] !== undefined) {
      throw new Error('pwr2_shell: "' + a + '" REFUSED — ' + REFUSED[a]);
    }
    throw new Error('pwr2_shell: unknown action "' + a + '" — not in any registry');
  };

  PWR2Engine.prototype.reset = function () {
    var opts = {};
    this.eng = EN.createEngine(opts);
    this._ts = EN.step(this.eng, 0.02);
    this.instruments = new root.RD.PWRInstruments(root.RD.PWR_CONFIG, undefined);
    this.instruments.reset(this._ts, {});
    this.instruments.update(this._ts, 0.02, {});
  };

  /* ---- save/load: schema pwr2-1.0 (see header — pwr-1.0 is deliberately NOT loadable) ---- */
  PWR2Engine.prototype.saveState = function () {
    var e = this.eng;
    /* strip the two non-serializable links; JSON round-trips the rest (plain data by design) */
    var extraMass = e.sys.extraMass;
    delete e.sys.extraMass;
    var chs = {};
    Object.keys(e.ins.channels).forEach(function (id) {
      var c = e.ins.channels[id];
      chs[id] = { lag1: c.lag1, lag2: c.lag2, noise: c.noise, rngState: c.rngState };
    });
    /* the READINGS dict itself rides along: the facade's control/RPS drivers read it one step
     * old, and a load that left it empty would hand them the first-step truth fallback for one
     * step — measured as a 6th-decimal divergence that cascades (bit-exactness is the bar) */
    var insReading = {};
    Object.keys(e.ins.reading).forEach(function (id) { insReading[id] = e.ins.reading[id]; });
    (function(){
    });
    var body = {
      sys: e.sys, rx: e.rx, sg: e.sg, tb: e.tb, rl: e.rl, cd: e.cd, dc: e.dc, cv: e.cv,
      ec: e.ec, aw: e.aw, dm: e.dm, pt: e.pt, pz: e.pz, ctm: e.ctm, rh: e.rh,
      brk: e.brk || null,
      ins: { noiseScale: e.ins.noiseScale, failure: e.ins.failure, channels: chs,
             reading: insReading },
      ts: this._ts,                                   /* the published snapshot, restored as-is */
      shellIns: this.instruments.save(),              /* pwr_instruments' own documented API */
      scalars: {
        rodTarget: e.rodTarget, rodSteps: e.rodSteps, simTime: e.simTime,
        _scramT: e._scramT, _manualTrip: e._manualTrip, _lastTrip: e._lastTrip,
        _rodStopSig: e._rodStopSig, _runbackSig: e._runbackSig, _rbT: e._rbT,
        _rbActive: e._rbActive, _pzRelief: e._pzRelief, _pzReliefH: e._pzReliefH,
        _Qox: e._Qox, _cdAvail: e._cdAvail, _plcsAuto: e._plcsAuto,
        _tavgPrev: e._tavgPrev, _tavgRate: e._tavgRate, advDemand: e.advDemand,
        advBlock: e.advBlock, cwPumps: e.cwPumps,
        pzDrivers: e.pzDrivers, dcDrivers: e.dcDrivers
      }
    };
    var out = JSON.parse(JSON.stringify(body));      /* deep copy, and PROVES serializability */
    e.sys.extraMass = extraMass;
    return { schema: this.schema, state: out };
  };

  PWR2Engine.prototype.loadState = function (saved) {
    if (!saved || saved.schema !== 'pwr2-1.0') {
      throw new Error('pwr2_shell: schema "' + (saved && saved.schema) + '" REFUSED — pwr2-1.0 ' +
        'only. pwr-1.0 saves are not loadable BY DESIGN (D4 §5): inventing node-level ' +
        'distribution from lumped values would be fabrication indistinguishable from physics.');
    }
    var st = JSON.parse(JSON.stringify(saved.state));
    var e = this.eng;
    ['sys', 'rx', 'sg', 'tb', 'rl', 'cd', 'dc', 'cv', 'ec', 'aw', 'dm', 'pt', 'pz', 'ctm', 'rh']
      .forEach(function (k) { e[k] = st[k]; });
    e.brk = st.brk || null;
    /* re-link 1: the pressurizer's seat on the conservation core */
    e.sys.extraMass = PZ.extraMassFn(e.pz);
    /* re-link 2: the internal channels' saved dynamic state onto fresh spec references */
    e.ins = IN.createInstruments({ noise_scale: st.ins.noiseScale });
    Object.keys(st.ins.channels).forEach(function (id) {
      if (!e.ins.channels[id]) return;
      var c = e.ins.channels[id], sc = st.ins.channels[id];
      c.lag1 = sc.lag1; c.lag2 = sc.lag2; c.noise = sc.noise; c.rngState = sc.rngState;
    });
    e.ins.failure = st.ins.failure;
    Object.keys(st.ins.reading || {}).forEach(function (id) { e.ins.reading[id] = st.ins.reading[id]; });
    Object.keys(st.scalars).forEach(function (k) { e[k] = st.scalars[k]; });
    this._ts = st.ts;                          /* the same step's own snapshot — no re-derive */
    this.instruments.load(st.shellIns);
  };

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.shell = {
    PWR2Engine: PWR2Engine,
    MAPPED: MAPPED, REHOMED: REHOMED, REFUSED: REFUSED
  };
})(globalThis);
