/*
 * auto_control.js — Operator Automation (the "Automate" tab).
 *
 * A synthetic operator, NOT a stack layer: it sits beside the UI (peer of M7's
 * test-runner idea), reads each broadcast snapshot, and issues ordinary plant
 * commands down the full stack through the send() it was given (HR5 — so
 * Instructor gating and M4 failure interception apply to automation exactly as
 * they apply to a human). Every controller reads snapshot.INSTRUMENTS, never
 * true state (HR1) — a stuck sensor fools the automation just like it fools
 * the operator, which is the educational point.
 *
 * Channel kinds:
 *   mode — a passthrough toggle for automation the ENGINE already carries
 *          (load-follow, steam-dump auto, PZR heater/spray auto, CVCS
 *          make-up). Engage/disengage send the mode commands once; the
 *          displayed state is derived from control_state each snapshot, so if
 *          the plant drops the mode itself (e.g. scram → grid disconnect) the
 *          toggle follows the truth instead of fighting it.
 *   pid  — a PI controller on an instrument reading driving a setpoint
 *          command (feedwater→level, recirc→power). Feedforward + bumpless
 *          transfer (the integrator initializes so the first output equals
 *          the current control position), anti-windup clamping, deadband, a
 *          minimum sim-time action period and a minimum output delta so the
 *          command stream stays sparse.
 *   rods — discrete rod control: error → a bounded rod_nudge at a chosen
 *          speed. Nudges (not rod_start) so every action is a bounded,
 *          engine-ramped move regardless of time acceleration.
 *   bang — boron trim (PWR): bang-bang with hysteresis on the CONTROL-ROD
 *          position, borating/diluting so the rod controller stays inside its
 *          authority band through xenon/load drifts. Requires the rod channel.
 *
 * Setpoints capture the CURRENT reading on engage (hold the plant where the
 * operator had it) and are user-editable afterwards.
 *
 * Scram: channels marked offOnScram (rods / recirc-power / boron) disengage
 * themselves — holding power against a scrammed core would mean driving rods
 * back out. Level / pressure / BOP channels keep working post-scram.
 *
 * Time acceleration: controllers work in sim time (true-dt integration, time-
 * based PV filters). At/above FAST_ACCEL (≥200×, judged from the snapshot's
 * time_acceleration so the very first step decides correctly) a broadcast is
 * minutes of sim time and NO sampled controller can stabilize the fast loops —
 * the boiler integrates a feed/steam mismatch to a trip inside one broadcast
 * (probed) — so pid channels with a fastFallback hand their loop to the
 * ENGINE's own per-step coupling (feed→load coupling, turbine load-follow) and
 * re-assert broadcast-rate control when the player slows back down (their next
 * setpoint command uncouples again). Rod channels drop to single steps inside
 * a widened deadband (dbFast > per-step power worth) — enough to out-pace
 * xenon, immune to sampling-aliasing limit cycles. Automation state (toggles,
 * integrators) is UI-session state: it is not part of save files, and a rewind
 * resets controller dynamics while keeping toggles.
 *
 * Attaches RD.AutoControl (browser <script> or Node require, like the engines).
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function rodGroup(snap, fn) {
    var gs = snap.control_state && snap.control_state.rod_groups || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].function === fn) return gs[i];
    return null;
  }
  function rodGroupById(snap, id) {
    var gs = snap.control_state && snap.control_state.rod_groups || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].id === id) return gs[i];
    return null;
  }

  // =================================================================== catalog
  // Per-plant automation channels (HR3 spirit: plant-specific behavior as data;
  // the machinery below is general). Groups are display sections in the tab.
  //
  // pid def: pv(snap), cmd(u)->command, uMin/uMax, kp, ki, db, minDelta,
  //          period (sim s), ff(snap)?, init(snap)? (integrator preload for
  //          bumpless transfer), sp {capture(snap), min, max, dim?, unit, dp}.
  // rods def: group_id, pv(snap), gain (steps per PV unit of error), db,
  //          maxStep, period, fastAt (error size that picks 'normal' speed).
  // mode def: isOn(controlState), engage(snap)->[cmds], disengage(snap)->[cmds].
  // bang def: (boron trim) hi/lo engage thresholds + hiStop/loStop hysteresis
  //          on control-rod position_pct, rate (ppm/s), requires (channel id).

  var CATALOG = {
    // ------------------------------------------------------------------ PWR
    pwr: [
      { id: 'rods_tavg', kind: 'rods', group: 'Reactor',
        label: 'Control Rods → Tavg',
        hint: 'Rod control — nudges the control bank to hold average coolant temperature at the setpoint (the real PWR rod-control variable). Raise steam demand and watch the rods withdraw to restore Tavg.',
        group_id: 'control_rods', offOnScram: true,
        pv: function (s) { return s.instruments.tavg; },
        sp: { capture: function (s) { return s.instruments.tavg; }, min: 285, max: 315, dim: 'temp', unit: '°C', dp: 1, step: 0.5 },
        // Two-term control like a real rod controller: a DOMINANT steam-vs-power
        // mismatch term (power chases the turbine draw — fast, self-stable) with
        // the Tavg error as a slow trim. Tavg integrates the mismatch, so a
        // Tavg-dominant loop limit-cycles for minutes; mismatch-dominant glides.
        trim: function (s) { return 1.25 * (s.instruments.steam_flow * 100 - s.instruments.power_range); },
        gain: 0.4, db: 0.5, maxStep: 2, period: 5.0, fastAt: 4.0, kd: 5, spSlew: 0.05, dbFast: 1.0 },

      { id: 'boron_trim', kind: 'bang', group: 'Reactor',
        label: 'Boron → rod position trim',
        hint: 'CVCS chemistry trim — borates when the auto rods sit too deep, dilutes when they run out of travel, so rod control keeps its authority through xenon and load drifts. Needs the rod channel engaged and the charging pump running.',
        requires: 'rods_tavg', offOnScram: true,
        hi: 96.0, lo: 55.0, hiStop: 90.0, loStop: 62.0, rate: 0.5 },

      { id: 'pzr_pressure', kind: 'mode', group: 'Primary',
        label: 'Pressurizer pressure (heaters + spray)',
        hint: 'Returns the pressurizer heaters and spray to their proportional automatic control holding ~2235 psia. Manual = both freeze at their current output.',
        isOn: function (cs) { return !!(cs.heater_auto && cs.spray_auto); },
        engage: function () { return [{ action: 'set_heater', auto: true }, { action: 'set_spray', auto: true }]; },
        disengage: function (s) {
          var cs = s.control_state;
          return [{ action: 'set_heater', power_pct: cs.heater_power_pct }, { action: 'set_spray', pct: cs.spray_valve_pct }];
        } },

      { id: 'cvcs_makeup', kind: 'mode', group: 'Primary',
        label: 'CVCS make-up (inventory)',
        hint: 'Automatic make-up — charging modulates to hold primary inventory (compensates letdown and identified leakage).',
        isOn: function (cs) { return !!cs.cvcs_auto; },
        engage: function () { return [{ action: 'set_cvcs_auto', active: true }]; },
        disengage: function () { return [{ action: 'set_cvcs_auto', active: false }]; } },

      { id: 'feed_sg', kind: 'pid', group: 'Secondary',
        label: 'Feedwater → SG level',
        hint: 'Feedwater controller — steam-flow feedforward plus level trim holds steam-generator level at the setpoint (three-element style). Engaging takes feedwater off the load coupling.',
        pv: function (s) { return s.instruments.sg_level; },
        ff: function (s) { return clip(s.instruments.steam_flow * 100, 0, 120); },
        cmd: function (u) { return { action: 'set_feedwater_flow', pct: u }; },
        uMin: 0, uMax: 120, kp: 1.5, ki: 0.03, db: 0.3, minDelta: 1.0, period: 3.0, pvTau: 1.5,
        fastFallback: [{ action: 'set_feed_coupled', active: true }],
        sp: { capture: function (s) { return s.instruments.sg_level; }, min: 30, max: 80, unit: '%', dp: 0, step: 1 } },

      { id: 'steam_dump', kind: 'mode', group: 'Secondary',
        label: 'Steam dump (turbine bypass)',
        hint: 'Automatic pressure-mode steam dump — opens proportionally above the no-load setpoint (carries a load rejection). Manual = freeze at the current valve position.',
        isOn: function (cs) { return !!cs.steam_dump_auto; },
        engage: function () { return [{ action: 'set_steam_dump', mode: 'auto' }]; },
        disengage: function (s) { return [{ action: 'set_steam_dump', pct: s.control_state.steam_dump_pct || 0 }]; } },

      { id: 'grid_follow', kind: 'mode', group: 'Secondary',
        label: 'Turbine / grid (load follow)',
        hint: 'Load-follow — turbine demand tracks reactor power (feedwater couples to load). Turn OFF to set grid demand yourself and let the other channels chase it.',
        isOn: function (cs) { return cs.load_mode === 'follow'; },
        engage: function () { return [{ action: 'set_load_mode', mode: 'follow' }]; },
        disengage: function () { return [{ action: 'set_load_mode', mode: 'manual' }]; } },
    ],

    // ------------------------------------------------------------------ RBMK
    rbmk: [
      { id: 'rods_power', kind: 'rods', group: 'Reactor',
        label: 'AR Rods → Power (automatic regulator)',
        hint: 'The RBMK\'s Automatic Regulator — a small, fine-stepped rod group (~2 pcm/step vs the manual bank\'s ~35) holding indicated power at the setpoint. Starts in AUTO (the plant\'s normal lineup), capturing the current power; switching it to MAN is taking manual control — the pre-accident condition at Chernobyl. When it runs out of travel, re-center it with the manual bank (or engage the re-center channel).',
        group_id: 'auto_rods', offOnScram: true,
        // AUTO by default (free play / plant load) — but only where the state
        // parks the AR with authority (mid-range). Startup and the Chernobyl
        // precondition start it fully withdrawn → stays MAN (historical, and
        // automation must not run the startup or fight the accident setup).
        defaultOn: function (s) {
          if (s.rps_state && s.rps_state.scrammed) return false;
          if (s.true_state && (s.true_state.scrammed || s.true_state.melted)) return false;
          var gs = s.control_state.rod_groups;
          for (var i = 0; i < gs.length; i++) {
            if (gs[i].id !== 'auto_rods') continue;
            var ins = 100 - gs[i].position_pct;
            return ins >= 20 && ins <= 80;
          }
          return false;
        },
        pv: function (s) { return s.instruments.power_range; },
        sp: { capture: function (s) { return s.instruments.power_range; }, min: 1, max: 110, unit: '%', dp: 1, step: 1 },
        pvTau: 2.0,   // power_range noise σ0.5 ≈ the AR's per-step worth — filter or it hunts noise
        gain: 4.0, db: 0.5, maxStep: 6, period: 3.0, fastAt: 2.0, kd: 6, spSlew: 0.1, dbFast: 2.0, fastBudget: 8 },

      { id: 'ar_recenter', kind: 'rods', group: 'Reactor',
        label: 'Manual bank → AR re-center',
        hint: 'Re-centers the Automatic Regulator with the manual bank (real RBMK practice): when the AR nears either end of its travel, single manual-bank steps hand the standing reactivity burden back to the coarse rods so the AR keeps fine authority. Watch the ORM — the manual bank is what it counts.',
        group_id: 'control_rods', offOnScram: true, requires: 'rods_power',
        // PV = AR INSERTED % (100 − position_pct): mid-range = 50. Only acts
        // outside ±25 of mid (the deadband), one slow step per period.
        pv: function (s) {
          var gs = s.control_state.rod_groups;
          for (var i = 0; i < gs.length; i++) if (gs[i].id === 'auto_rods') return 100 - gs[i].position_pct;
          return null;
        },
        sp: { capture: function () { return 50; }, min: 30, max: 70, unit: '% ins', dp: 0, step: 5 },
        gain: 0.04, db: 25.0, maxStep: 1, period: 15.0, fastAt: 1e9, kd: 0, dbFast: 25.0 },

      { id: 'feed_drum', kind: 'pid', group: 'Coolant Circuit',
        label: 'Feedwater → Drum level',
        hint: 'Feedwater controller — power feedforward plus level trim holds steam-drum level at the setpoint. Engaging takes feedwater off the load coupling.',
        pv: function (s) { return s.instruments.drum_level; },
        ff: function (s) { return clip(s.instruments.power_range, 0, 110); },
        cmd: function (u) { return { action: 'set_feedwater_flow', pct: u }; },
        uMin: 0, uMax: 110, kp: 1.5, ki: 0.03, db: 0.3, minDelta: 1.0, period: 3.0, pvTau: 1.5,
        fastFallback: [{ action: 'set_feed_coupled', active: true }],
        sp: { capture: function (s) { return s.instruments.drum_level; }, min: 40, max: 90, unit: '%', dp: 0, step: 1 } },

      { id: 'grid_follow', kind: 'mode', group: 'Balance of Plant',
        label: 'Turbine / grid (load follow)',
        hint: 'Load-follow — turbine steam load tracks reactor power. Turn OFF to set turbine load yourself.',
        isOn: function (cs) { return cs.load_mode === 'follow'; },
        engage: function () { return [{ action: 'set_load_mode', mode: 'follow' }]; },
        disengage: function () { return [{ action: 'set_load_mode', mode: 'manual' }]; } },

      { id: 'steam_dump', kind: 'mode', group: 'Balance of Plant',
        label: 'Steam dump (turbine bypass)',
        hint: 'Automatic steam dump — holds drum pressure on a load rejection. Manual = freeze at the current valve position.',
        isOn: function (cs) { return !!cs.steam_dump_auto; },
        engage: function () { return [{ action: 'set_steam_dump', mode: 'auto' }]; },
        disengage: function (s) { return [{ action: 'set_steam_dump', pct: s.control_state.steam_dump_pct || 0 }]; } },
    ],

    // ------------------------------------------------------------------ BWR
    bwr: [
      { id: 'recirc_power', kind: 'pid', group: 'Reactor',
        label: 'Recirculation → Power',
        hint: 'Recirc flow controller — modulates drive flow to hold indicated power at the setpoint (the BWR\'s normal power control). Rods stay yours unless the trim channel is on.',
        offOnScram: true,
        pv: function (s) { return s.instruments.power_range; },
        cmd: function (u) { return { action: 'set_recirc_flow', pct: u }; },
        init: function (s) { return s.control_state.recirc_flow_setpoint_pct; },
        // spSlew ramps power-setpoint changes (~0.15 %/s): an instant recirc step
        // collapses steam flow and trips the plant on low vessel pressure.
        uMin: 0, uMax: 48, kp: 0.35, ki: 0.02, db: 0.3, minDelta: 0.2, period: 2.0, pvTau: 1.5, spSlew: 0.15,
        fastFallback: [],   // hold the current drive flow; negative void feedback self-stabilizes
        sp: { capture: function (s) { return s.instruments.power_range; }, min: 5, max: 110, unit: '%', dp: 1, step: 1 } },

      { id: 'rods_trim', kind: 'rods', group: 'Reactor',
        label: 'Control Rods → Power (coarse trim)',
        hint: 'Slow, wide-deadband rod trim — steps in only when recirculation is saturated or off automatic (one BWR rod step is worth several % power). Fine control belongs to recirculation.',
        group_id: 'control_rods', offOnScram: true,
        pv: function (s) { return s.instruments.power_range; },
        sp: { capture: function (s) { return s.instruments.power_range; }, min: 5, max: 110, unit: '%', dp: 1, step: 1 },
        // One mid-travel BWR rod step ≈ several % power: while the engaged recirc
        // channel still has drive-flow authority, the trim must NOT fire (probed:
        // a single noise-triggered step at 600× ran power to 112% and the
        // pressure controller chased it into the low-pressure trip).
        standby: function (s, ac) {
          var rc = ac.byId.recirc_power;
          if (!rc || !rc.engaged) return false;
          var u = s.control_state.recirc_flow_setpoint_pct;
          return u > 2 && u < 46;
        },
        standbyNote: 'standing by — recirc has authority',
        gain: 0.3, db: 5.0, maxStep: 1, period: 12.0, fastAt: 1e9, kd: 8, dbFast: 6.0 },

      { id: 'feed_level', kind: 'pid', group: 'Vessel',
        label: 'Feedwater → Vessel level',
        hint: 'Feedwater controller — steam-flow feedforward plus level trim holds vessel water level at the setpoint. Engaging takes feedwater off the load coupling.',
        pv: function (s) { return s.instruments.vessel_level; },
        ff: function (s) { return clip(s.instruments.steam_flow * 100, 0, 120); },
        cmd: function (u) { return { action: 'set_feedwater_flow', pct: u }; },
        uMin: 0, uMax: 120, kp: 2.0, ki: 0.04, db: 0.3, minDelta: 1.0, period: 3.0, pvTau: 1.5,
        fastFallback: [{ action: 'set_feed_coupled', active: true }],
        sp: { capture: function (s) { return s.instruments.vessel_level; }, min: 40, max: 90, unit: '%', dp: 0, step: 1 } },

      { id: 'turbine_pressure', kind: 'pid', group: 'Balance of Plant',
        label: 'Turbine load → Vessel pressure',
        hint: 'Turbine pressure control (the real BWR governor mode) — turbine load modulates to hold vessel pressure, so power maneuvers on recirc/rods don\'t drain the vessel into the low-pressure trip. Turn OFF to set turbine load yourself.',
        pv: function (s) { return s.instruments.vessel_pressure; },
        cmd: function (u) { return { action: 'set_turbine_load', mwe: u }; },
        init: function (s) { return s.control_state.load_target_mwe; },
        // Reverse-acting (more load → pressure falls): negative gains.
        uMin: 0, uMax: 1150, kp: -600, ki: -12, db: 0.015, minDelta: 12, period: 2.0, pvTau: 1.5,
        fastFallback: [{ action: 'set_load_mode', mode: 'follow' }],
        sp: { capture: function (s) { return s.instruments.vessel_pressure; }, min: 6.0, max: 7.4, dim: 'pressure', unit: 'MPa', dp: 2, step: 0.05 } },

      { id: 'steam_dump', kind: 'mode', group: 'Balance of Plant',
        label: 'Steam dump (turbine bypass)',
        hint: 'Automatic steam dump — sheds excess steam to the condenser on a load rejection (needs AC / condenser). Manual = freeze at the current valve position.',
        isOn: function (cs) { return !!cs.steam_dump_auto; },
        engage: function () { return [{ action: 'set_steam_dump', mode: 'auto' }]; },
        disengage: function (s) { return [{ action: 'set_steam_dump', pct: s.control_state.steam_dump_pct || 0 }]; } },
    ],
  };

  // ================================================================ machinery
  function AutoControl(send) {
    this.send = send;          // function(command) -> result (descends the stack, HR5)
    this.plantId = null;
    this.chans = [];
    this.byId = {};
    this._lastT = null;
  }

  AutoControl.prototype.setPlant = function (plantId) {
    this.plantId = plantId;
    this.byId = {};
    var self = this;
    this.chans = (CATALOG[plantId] || []).map(function (def) {
      var c = { def: def, engaged: false, sp: null, I: 0, lastAct: null, lastSent: null, note: '', bangMode: 'idle' };
      self.byId[def.id] = c;
      return c;
    });
    this._lastT = null;
  };

  AutoControl.prototype.channels = function () { return this.chans; };
  AutoControl.prototype.get = function (id) { return this.byId[id] || null; };

  // Engaged truth for display/master logic: mode channels read the plant.
  AutoControl.prototype.isEngaged = function (c, snap) {
    if (c.def.kind === 'mode') return snap && snap.control_state ? !!c.def.isOn(snap.control_state) : c.engaged;
    return c.engaged;
  };

  AutoControl.prototype.setSetpoint = function (id, value) {
    var c = this.byId[id]; if (!c || !c.def.sp) return;
    c.sp = clip(value, c.def.sp.min, c.def.sp.max);
  };

  AutoControl.prototype.toggle = function (id, on, snap) {
    var c = this.byId[id]; if (!c || !snap) return;
    var def = c.def, i;
    if (def.kind === 'mode') {
      var cmds = on ? def.engage(snap) : def.disengage(snap);
      for (i = 0; i < cmds.length; i++) this.send(cmds[i]);
      c.engaged = on;
      return;
    }
    c.engaged = !!on;
    c.note = '';
    if (on) {
      if (def.sp) { var cap = def.sp.capture(snap); c.sp = cap != null && isFinite(cap) ? clip(cap, def.sp.min, def.sp.max) : def.sp.min; }
      c.spEff = c.sp;                                // slewed working setpoint starts at the capture
      c.I = def.init ? (def.init(snap) || 0) : 0;   // bumpless transfer
      if (def.kind === 'pid' && def.init == null && def.ff == null) c.I = 0;
      c.lastAct = null; c.lastSent = null; c.bangMode = 'idle'; c.fastMode = false;
      c.pvF = null; c.rate = null;                   // PV filter + damped derivative
    } else {
      // leave the plant exactly where automation had it — plus safe stand-down
      if (def.kind === 'rods') this.send({ action: 'rod_stop', group_id: def.group_id });
      if (def.kind === 'bang') { this.send({ action: 'set_boron_adjust', rate: 0 }); c.bangMode = 'idle'; }
    }
  };

  // Default lineup for a freshly loaded plant (free play / reset / file load —
  // NOT instructed content, which stands automation down and uses authored
  // auto_channels presets): engage every channel whose defaultOn(snapshot)
  // says the plant normally runs it automatic in this state.
  AutoControl.prototype.engageDefaults = function (snap) {
    if (!snap || !snap.metadata || snap.metadata.plant_id !== this.plantId) return;
    for (var i = 0; i < this.chans.length; i++) {
      var c = this.chans[i];
      if (c.def.defaultOn && !c.engaged && c.def.defaultOn(snap)) this.toggle(c.def.id, true, snap);
    }
  };

  AutoControl.prototype.engageAll = function (snap) {
    for (var i = 0; i < this.chans.length; i++) {
      var c = this.chans[i];
      if (!this.isEngaged(c, snap)) this.toggle(c.def.id, true, snap);
    }
  };
  AutoControl.prototype.disengageAll = function (snap) {
    for (var i = 0; i < this.chans.length; i++) {
      var c = this.chans[i];
      if (this.isEngaged(c, snap)) this.toggle(c.def.id, false, snap);
    }
  };

  AutoControl.prototype.resetDynamics = function () {
    for (var i = 0; i < this.chans.length; i++) {
      var c = this.chans[i];
      c.lastAct = null; c.lastSent = null; c.note = ''; c.fastMode = false;
      c.pvF = null; c.rate = null; c.spEff = c.sp;
      if (c.def.kind === 'pid') c.I = null;   // re-init from the plant on the next step
      if (c.def.kind === 'bang') c.bangMode = 'idle';
    }
  };

  // ------------------------------------------------------------------- step
  AutoControl.prototype.step = function (snap) {
    if (!snap || !snap.metadata || snap.metadata.plant_id !== this.plantId) return;
    if (!snap.instruments || !snap.control_state) return;
    var t = snap.metadata.sim_time;
    if (this._lastT != null && t < this._lastT - 1e-6) this.resetDynamics();  // rewind
    // TRUE sim-time dt — at high acceleration a broadcast is minutes of sim
    // time, and every controller must integrate/filter/budget in sim time or
    // it goes 36× too slow at 3600× (probed: level loops starved the boilers
    // to the low-level trips). Anti-windup clamps make full-dt integration safe.
    var dt = this._lastT == null ? 0 : Math.max(0, t - this._lastT);
    this._lastT = t;

    var dead = !!(snap.true_state && snap.true_state.melted);
    // A protection trip latches rps_state; a MANUAL scram only shows in
    // true_state — automation stands down on either.
    var scrammed = !!((snap.rps_state && snap.rps_state.scrammed) ||
                      (snap.true_state && snap.true_state.scrammed));

    for (var i = 0; i < this.chans.length; i++) {
      var c = this.chans[i], def = c.def;
      if (def.kind === 'mode') continue;                    // the engine runs these
      if (!c.engaged) continue;
      if (dead || (scrammed && def.offOnScram)) {           // stand down, visibly
        this.toggle(def.id, false, snap);
        c.note = dead ? 'off — core destroyed' : 'off — reactor scrammed';
        continue;
      }
      if (def.requires && !(this.byId[def.requires] && this.byId[def.requires].engaged)) {
        c.note = 'idle — needs ' + this.byId[def.requires].def.label;
        continue;
      }
      this._track(c, snap, dt);
      if (def.kind === 'pid') this._stepPid(c, snap, t, dt);
      else if (def.kind === 'rods') this._stepRods(c, snap, t, dt);
      else if (def.kind === 'bang') this._stepBang(c, snap, t);
    }
  };

  // Fast-forward regime: decided from the snapshot's time acceleration (known
  // on the very first step — judging by observed dt let one broadcast-rate
  // action slip out before the handoff, and 6 sim-minutes of a frozen wrong
  // output is a boiler drained / a turbine over-drawing to the trip; probed).
  var FAST_ACCEL = 200;
  function isFast(snap) { return (snap.metadata.time_acceleration || 1) >= FAST_ACCEL; }

  // Shared per-step tracking for pid/rods: slew the working setpoint toward the
  // user's, low-pass the PV against instrument noise, and keep a damped PV rate
  // for derivative (anticipation) action.
  AutoControl.prototype._track = function (c, snap, dt) {
    var def = c.def;
    if (def.sp && c.sp != null) {
      if (c.spEff == null) c.spEff = c.sp;
      if (def.spSlew && dt > 0) {
        var d = c.sp - c.spEff;
        c.spEff += clip(d, -def.spSlew * dt, def.spSlew * dt);
      } else c.spEff = c.sp;
    }
    if (def.pv) {
      var pv = def.pv(snap);
      if (pv == null || !isFinite(pv)) return;
      c.pvNow = pv;
      // Time-based low-pass (pvTau seconds): filters instrument noise at real
      // time but passes through at accelerated dt — a per-sample alpha would
      // hand the controller a reading minutes stale at 3600×.
      var a = def.pvTau ? dt / (def.pvTau + dt) : 1.0;
      var prev = c.pvF;
      c.pvF = (prev == null || a >= 1) ? pv : prev + a * (pv - prev);
      if (dt > 0 && prev != null) {
        var r = (c.pvF - prev) / dt;
        c.rate = c.rate == null ? r : c.rate + 0.5 * (r - c.rate);
      }
    }
  };

  AutoControl.prototype._stepPid = function (c, snap, t, dt) {
    var def = c.def;
    if (c.pvF == null) return;
    // Fast-forward handoff: above FAST_ACCEL a sampled controller cannot
    // stabilize the fast loops (a broadcast is minutes of sim time), so hand
    // the loop to the engine's own per-step coupling; resume (re-asserted,
    // integrator re-seeded) when the player slows back down.
    if (def.fastFallback && isFast(snap)) {
      if (!c.fastMode) {
        for (var fi = 0; fi < def.fastFallback.length; fi++) this.send(def.fastFallback[fi]);
        c.fastMode = true;
      }
      c.note = 'fast-forward — plant-side control';
      return;
    }
    if (c.fastMode) { c.fastMode = false; c.I = null; c.lastSent = null; c.pvF = c.pvNow; c.rate = null; }
    var pv = c.pvF;
    var ff = def.ff ? def.ff(snap) : 0;
    if (c.I == null) c.I = def.init ? (def.init(snap) || 0) : 0;   // post-rewind re-init
    var e = (c.spEff != null ? c.spEff : c.sp) - pv;
    // Integrate in sim time, but never more than a few design periods per
    // action — a single giant sample must not carry a giant integral kick.
    if (Math.abs(e) > def.db) c.I += (def.ki || 0) * e * Math.min(dt, 3 * def.period);   // freeze in the deadband (no creep)
    c.I = clip(c.I, def.uMin - ff - def.kp * e, def.uMax - ff - def.kp * e);   // anti-windup
    var u = clip(ff + def.kp * e + c.I, def.uMin, def.uMax);
    c.outNow = u;
    if (c.lastSent != null && Math.abs(e) <= def.db) { c.note = 'holding'; return; }
    if (c.lastAct != null && t - c.lastAct < def.period) return;
    if (c.lastSent != null && Math.abs(u - c.lastSent) < def.minDelta) return;
    var r = this.send(def.cmd(u));
    c.note = (r && r.type === 'blocked') ? '⛔ ' + (r.message || 'blocked') : '';
    c.lastSent = u; c.lastAct = t;
  };

  AutoControl.prototype._stepRods = function (c, snap, t, dt) {
    var def = c.def;
    if (c.pvF == null) return;
    if (def.standby && def.standby(snap, this)) { c.note = def.standbyNote || 'standing by'; return; }
    // Damped error: back off while the PV is already moving toward the setpoint
    // (kd seconds of anticipation, plus an optional plant-specific trim term) —
    // the lumped rod group is coarse and the instruments lag, so undamped
    // stepping limit-cycles.
    var fast = isFast(snap);
    // Fast-forward regime: a broadcast outlives the whole void/thermal response
    // to a rod move, so rate damping is blind (aliasing) — take SINGLE steps
    // inside a deadband wider than the per-step power worth (dbFast), which
    // still out-paces xenon drift by an order of magnitude. Probed at 3600×:
    // dt-scaled budgets produced a diverging −1/+1/−2/+3/−5 limit cycle.
    var db = fast && def.dbFast ? def.dbFast : def.db;
    var e = (c.spEff != null ? c.spEff : c.sp) - c.pvF;
    var eEff = e + (def.trim ? def.trim(snap) : 0) - (fast ? 0 : (def.kd || 0) * (c.rate || 0));
    if (Math.abs(e) <= db) { c.note = 'holding'; return; }
    if (c.lastAct != null && t - c.lastAct < def.period) return;
    var g = rodGroupById(snap, def.group_id) || rodGroup(snap, 'control');
    // Fast budget: coarse groups take 1 careful step per broadcast; fine groups
    // (RBMK AR, ~2 pcm/step) may take a small burst (fastBudget) or they lose
    // to xenon drift at 3600× (probed: single steps fell 0.1 %/min behind).
    var budget = fast ? (def.fastBudget || 1) : def.maxStep;
    var steps = clip(Math.round(def.gain * eEff), -budget, budget);
    if (!steps) steps = e > 0 ? (fast ? 1 : 0) : (fast ? -1 : 0);   // outside the deadband, fast mode always takes its one step
    if (!steps) return;
    if (steps > 0 !== e > 0) { c.note = 'damping'; return; }   // never step against the raw error
    if (g) {
      if (steps < 0 && g.at_insertion_limit) { c.note = 'at insertion limit'; return; }
      if (steps > 0 && g.steps >= g.max_steps) { c.note = 'rods fully withdrawn'; return; }
      if (steps < 0 && g.steps <= 0) { c.note = 'rods fully inserted'; return; }
    }
    var speed = Math.abs(eEff) >= def.fastAt ? 'normal' : 'slow';
    var r = this.send({ action: 'rod_nudge', group_id: def.group_id, steps: steps, speed: speed });
    c.note = (r && r.type === 'blocked') ? '⛔ ' + (r.message || 'withdrawal blocked') : (steps > 0 ? 'withdrawing' : 'inserting');
    c.lastAct = t;
  };

  // Boron trim: bang-bang with hysteresis on the control bank's position so the
  // rod channel keeps authority. Dilute (−, +ρ) walks the rods back IN from the
  // top of travel; borate (+, −ρ) lets them come back OUT of the deep band.
  AutoControl.prototype._stepBang = function (c, snap, t) {
    var def = c.def;
    var g = rodGroup(snap, 'control');
    if (!g) return;
    var pos = g.position_pct;
    c.pvNow = pos;
    var want = c.bangMode;
    if (c.bangMode === 'idle') {
      if (pos >= def.hi) want = 'dilute';
      else if (pos <= def.lo) want = 'borate';
    } else if (c.bangMode === 'dilute' && pos <= def.hiStop) want = 'idle';
    else if (c.bangMode === 'borate' && pos >= def.loStop) want = 'idle';
    if (want === c.bangMode) {
      c.note = c.bangMode === 'idle' ? 'in band' : (c.bangMode + '…' +
        (snap.control_state.charging_pump_running === false ? ' (charging pump OFF)' : ''));
      return;
    }
    var rate = want === 'borate' ? def.rate : want === 'dilute' ? -def.rate : 0;
    var r = this.send({ action: 'set_boron_adjust', rate: rate });
    if (r && r.type === 'blocked') { c.note = '⛔ ' + (r.message || 'blocked'); return; }
    c.bangMode = want;
    c.lastAct = t;
    c.note = want === 'idle' ? 'in band' : want + '…';
  };

  AutoControl.CATALOG = CATALOG;
  RD.AutoControl = AutoControl;

})(globalThis.RD || (globalThis.RD = {}));
