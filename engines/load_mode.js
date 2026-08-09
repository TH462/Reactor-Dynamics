/*
 * load_mode.js — shared turbine/load + coupled feedwater logic (Load Mode).
 *
 * One operator mental model: "how hard are we pushing the generator?" Feedwater
 * auto-tracks load in follow/manual when feed_auto_coupled is true.
 *
 * Modes: follow (default) | manual | disconnected
 *
 * Attaches RD.LoadMode.
 */
;(function (RD) {
  'use strict';

  var DEFAULT_TAU = 45; // seconds — turbine governor / operator lag
  var IMBALANCE_FRAC = 0.04;  // annunciator threshold, fraction of rated (plant-agnostic)

  // Ceiling on the LOAD-COUPLED feed demand, as a fraction of rated feed flow.
  // Per-plant via opts.maxCoupledFeedFrac; this is the legacy default.
  //
  // It must not exceed what that plant's turbine can actually draw. The PWR governor
  // clamps steam to rated (pwr_steam_generator: clip(turbine_demand_frac, 0, 1)
  // before the pressure compensation), so an above-rated ask there boiled rated
  // while feeding 1.2 — a PERMANENT +0.2 imbalance no controller can null. SG level
  // integrated 65 % → 89 % and scrammed on sg_level high 36-112 s later, long after
  // the operator stopped associating cause with effect. 1.2 is the feed pump's
  // runout capacity, reused here as a demand ceiling by mistake (issue #130).
  //
  // The PWR passes 1.0 (see pwr_engine _loadModeOpts). RBMK and BWR keep the legacy
  // 1.2 deliberately: they are ON HOLD, their governors differ, and changing the
  // shared default moved their gates. They should adopt an explicit cap when their
  // plants are reopened — the reasoning is not PWR-specific.
  //
  // Capping does NOT soften the EV-11 teaching behavior: feed still tracks the load
  // TARGET rather than actual steam flow, so a slider move still shows the transient
  // feed-vs-steam mismatch. It only removes a SUSTAINED ask the plant can never
  // satisfy. The pump's own 0..120 % runout clamp is untouched — an operator command
  // or the sg_overfeed failure can still drive feed past rated on purpose.
  var DEFAULT_MAX_COUPLED_FEED_FRAC = 1.2;

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  function powerFrac(s) {
    if (s._P != null) return s._P;
    return (s.power_pct || 0) / 100;
  }

  function initState(s, P0, mweRated) {
    if (s.load_mode == null) s.load_mode = 'follow';
    if (s.load_target_mwe == null) s.load_target_mwe = P0 * mweRated;
    // The operator's ASK, separate from the effective reference that ramps toward it.
    // Old saves have no such field: seed it from the effective value, which is exactly
    // where a plant with no rate limit would have left them.
    if (s.load_cmd_mwe == null) s.load_cmd_mwe = s.load_target_mwe;
    if (s.load_follow_tau == null) s.load_follow_tau = DEFAULT_TAU;
    if (s.feed_auto_coupled == null) s.feed_auto_coupled = true;
  }

  // opts: { mweRated, setLoad(s, mwe, rated), setFeed(s, frac), tripTurbine?(s),
  //         maxCoupledFeedFrac? }
  function step(s, dt, opts) {
    var tau = s.load_follow_tau != null ? s.load_follow_tau : DEFAULT_TAU;
    var alpha = dt / (tau + dt);
    var rated = opts.mweRated;
    var feedMax = opts.maxCoupledFeedFrac != null ? opts.maxCoupledFeedFrac : DEFAULT_MAX_COUPLED_FEED_FRAC;

    if (s.load_mode === 'disconnected') {
      s.load_target_mwe = 0;
      opts.setLoad(s, 0, rated);
      // Coupled feed follows the ACTUAL total steam draw (turbine + dump +
      // safeties), not the (zero) load: after a turbine trip the steam dump
      // still draws from the SG, and any feed regulation matches steam flow —
      // so a ride-out (turbine trip, reactor at power on the dump) doesn't
      // silently drain the SG, and a post-trip SG holds level until the P-4
      // isolation hands off to AFW. Reads the previous step's total draw
      // (explicit coupling). The follow/manual branches below deliberately keep
      // feed on the load TARGET: the feed-vs-actual-steam mismatch on a slider
      // ask is the EV-11 / shift-exam teaching behavior.
      if (s.feed_auto_coupled) {
        // Pure flow-matching with the pump's lag systematically over/under-feeds
        // a moving draw (a declining draw slowly FILLS the SG into the P-14
        // isolation) — so the fallback carries a gentle single-element level
        // trim toward the normal working level, like any standing feed
        // regulation. Reads the SG level instrument (HR1), one step lagged.
        var lvl = s._ins_sg_level != null ? s._ins_sg_level : (s.sg_level_pct != null ? s.sg_level_pct : 65);
        var trim = 0.002 * (65 - lvl);
        // Keeps the 1.2 ceiling, NOT feedMax: this branch matches an ACTUAL measured
        // draw, and turbine plus a wide-open dump plus lifted safeties genuinely can
        // exceed rated. Clamping it to 1.0 here would under-feed a real ride-out.
        // (The PWR dump was 105 % of rated on its own when this was written; it is 40 %
        // since 2026-07-31, so the dump alone no longer gets there — but the safeties
        // are exactly what lift during a full rejection at 40 %, and this is shared
        // cross-plant code. The ceiling is not a PWR dump number and must not track one.)
        opts.setFeed(s, clip((s.steam_out_total != null ? s.steam_out_total : 0) + trim, 0, 1.2));
      }
    } else if (s.load_mode === 'follow') {
      // Follow tracks what the reactor MAKES — its thermal output. Plants that
      // distinguish prompt fission power from total heat (PWR since #229: decay
      // heat is a separate, lagging source, so through a runback the plant makes
      // ~2-5 % more heat than the flux instruments read) supply extractFrac; the
      // turbine, like a real pressure-mode follow governor, draws the steam that
      // heat actually generates. Without the hook this falls back to fission
      // power — identical whenever Q ≡ P (steady state, and RBMK/BWR as built).
      var makesFrac = opts.extractFrac ? opts.extractFrac(s) : powerFrac(s);
      s.load_target_mwe += alpha * (makesFrac * rated - s.load_target_mwe);
      opts.setLoad(s, s.load_target_mwe, rated);
      if (s.feed_auto_coupled) opts.setFeed(s, clip(s.load_target_mwe / rated, 0, feedMax));
    } else {
      // manual — `load_cmd_mwe` is what the operator ASKED for; `load_target_mwe` is the
      // EHC reference that ramps toward it at the unit's load rate. Real turbine control
      // works this way: WTSM 11.3 (ML11223A295) shows the operator setting a target and a
      // RATE on a thumbwheel — *"the system electronically changes the reference load from
      // 50% to 100% at 1%/min"* — so a step change in demand is not something a real
      // operator can produce at all.
      //
      // `loadRatePctPerMin` is OPTIONAL and per-plant. Absent (RBMK, BWR) the reference
      // snaps as before, so those plants are byte-identical — they are ON HOLD and must not
      // move. The rate is % of RATED per minute, not % of the change.
      //
      // IT LIMITS INCREASES ONLY, and that is the whole reason the limit exists rather than a
      // softening of it. The excursion it was built to stop is a load INCREASE: raising demand
      // drives power up and loop dT with it, and a 70 -> 100 MW step peaked dT within 0.51 of
      // the OPdT trip. A load DECREASE does the opposite — measured, a full rejection bottoms
      // the OPdT margin at 7.23, nowhere near the line.
      //
      // Limiting decreases too was measurably WRONG, not merely unnecessary: a load REJECTION
      // is the grid or the machine throwing load off, and throttling it to 10 %/min turns this
      // plant's defining ride-out into a leisurely ramp. It took out 5 behaviour probes, the
      // `pwr_tour` greedy-ask branch and the SGTR EOP before the direction test was added.
      // Rejections still arrive instantly, as they must.
      //
      // AND THE ARITHMETIC MAKES IT STRUCTURAL, not a tuning choice (2026-08-08, the ruling
      // that set the PWR raise rate to 30): the rejection detector below reads
      // (ref - target) through refTau = 60 s, and the PWR dump's ride-out arms at 40 MWe of
      // gap. A ramped decrease caps that standing gap at rate x 60 s — 30 MWe at 30 %/min —
      // so at any rate in the useful family the dump can NEVER fast-open on an operator cut,
      // however large, and the board's load box is the only free-play route to the graded
      // ride-out (a turbine trip at power scrams via P-9). Symmetrize this and FG-4 dies.
      var rate = opts.loadRatePctPerMin;
      var gap0 = (s.load_cmd_mwe != null) ? s.load_cmd_mwe - s.load_target_mwe : 0;
      if (rate > 0 && s.load_cmd_mwe != null && gap0 > 0) {
        var stepMwe = (rate / 100) * rated * (dt / 60);
        s.load_target_mwe += (gap0 <= stepMwe) ? gap0 : stepMwe;
      } else if (s.load_cmd_mwe != null) {
        s.load_target_mwe = s.load_cmd_mwe;
      }
      opts.setLoad(s, s.load_target_mwe, rated);
      if (s.feed_auto_coupled) opts.setFeed(s, clip(s.load_target_mwe / rated, 0, feedMax));
    }

    // LOAD-REJECTION detector: a slow-following reference of the load TARGET, so
    // (ref − target) measures how far and how recently load has been THROWN OFF. The
    // PWR's fast-open steam dump arms on it (C-7 class). It must key on load FALLING,
    // not on the power/load mismatch: that mismatch is equally positive when the
    // operator deliberately raises power (dilution), and arming there opens the dump
    // into a rising plant, overcools it and lets MTC run power up — measured, it
    // tripped `pwr_boron`. The reference decays back, so the arm is transient like the
    // real interlock rather than a standing make-up path.
    if (s.load_ref_mwe == null) s.load_ref_mwe = s.load_target_mwe || 0;
    var refTau = s.load_reject_ref_tau != null ? s.load_reject_ref_tau : 60.0;
    s.load_ref_mwe += (dt / (refTau + dt)) * (s.load_target_mwe - s.load_ref_mwe);
    s.load_rejected_mwe = Math.max(0, s.load_ref_mwe - s.load_target_mwe);

    // The imbalance ANNUNCIATOR reads INDICATED power (the engine stashes the
    // previous step's power_range reading as s._ins_power_pct) — HR1: an
    // annunciator is an indication, not physics. The load-follow tracking
    // above stays on true output (extractFrac / true power): the turbine
    // extracts what the reactor makes.
    var indMwe = (s._ins_power_pct != null ? s._ins_power_pct / 100 : powerFrac(s)) * rated;
    s.load_imbalance_mwe = indMwe - s.load_target_mwe;
    s.sg_imbalance_active = Math.abs(s.load_imbalance_mwe) > IMBALANCE_FRAC * rated;
  }

  // Take the unit off line. TWO DIFFERENT EVENTS share this path, and which one you
  // get is decided by whether a `tripFn` is passed (#230):
  //
  //   disconnect(s, tripFn) — TURBINE TRIP. The stop valves slam shut. This is what a
  //     reactor trip, an MSIV closure at load, or the turbine-trip failure produces,
  //     and above the P-9 power permissive it is exactly what arms the reactor trip on
  //     turbine trip. The `turbine_tripped` flag LATCHES until the operator restores
  //     the machine (connect_grid).
  //   offline(s) — PLANNED OFFLINE. The generator breaker opens, load goes to zero,
  //     and the turbine is NOT tripped. Nothing latches, so P-9 is never armed.
  //
  // They used to be the same thing: `disconnect_grid`, the operator's own take-it-off-
  // line control, called the trip path. So a planned offline during a heatup recorded a
  // turbine trip at 0 % power, that flag persisted for the whole evolution, and the
  // reactor scrammed the moment power later crossed P-9 — measured, and the reason #230
  // was filed. The plant already modelled the ride-out separately (TR-1 drives it with
  // `set_load_target 0`), so this was a command mapping, not a missing model.
  // OWNER RULING 2026-07-28, #230 option 1: "Planned offline, no trip."
  //
  // NOTE the rotor still coasts down afterwards. A real unit holds rated speed on
  // no-load steam, ready to re-synchronise, but this engine has no no-load admission
  // model — an unloaded rotor with no steam coasts to rest by the same branch #235
  // added to stop cold Modes 3/5 pinning 1800 rpm. Out of scope here: this ruling is
  // about protection semantics. Speed-hold is a turbine-model question (cf. #238).
  //
  // RBMK/BWR still pass `tripFn` from their own `disconnect_grid` and are unchanged —
  // they are on hold, and this is a per-plant call about what that command means.
  function disconnect(s, tripFn) {
    s.load_mode = 'disconnected';
    s.load_target_mwe = 0;
    if (tripFn) tripFn(s);
  }

  function offline(s) { disconnect(s, null); }

  // IS THE GENERATOR BREAKER CLOSED? The one question that decides whether the grid is
  // holding the rotor, and it is NOT the same question as "is the machine carrying load"
  // — a synchronous machine tied to the grid spins at rated at ANY load, including zero,
  // and will motor rather than decelerate.
  //
  // It exists because the PWR turbine model asked it as `generator_load > 0` (#284), so
  // an operator sliding the Manual load target to 0 MWe while synchronised dropped into
  // the OFFLINE coastdown branch: measured, the rotor walked 1800 -> 0 rpm over ~5 plant-
  // minutes with `turbine_tripped` false and the breaker still closed. The load test is
  // right for the case it was written for (#235: cold Modes 3/5, authored untripped with
  // no load and no steam, pinning 1800 rpm) — but those ICs are authored `disconnected`,
  // so keying on the breaker keeps that fix and drops the on-line case out of it.
  //
  // `turbine_tripped` is deliberately NOT part of this predicate: a trip and an open
  // breaker are different events (#230, owner ruling 2026-07-28 "Planned offline, no
  // trip") and callers that care about the trip test it separately.
  function isOnLine(s) { return s.load_mode !== 'disconnected'; }

  function setMode(s, mode, opts) {
    if (mode !== 'follow' && mode !== 'manual' && mode !== 'disconnected') return;
    s.load_mode = mode;
    // Always route 'disconnected' through disconnect() so the load target is zeroed;
    // whether it also trips is the caller's tripFn, per the note above. This used to be
    // gated on `opts.tripFn` being present, which meant a caller that wanted a planned
    // offline got the mode set but the target left standing.
    if (mode === 'disconnected') disconnect(s, opts && opts.tripFn);
    if (mode === 'follow' && opts && opts.rated) {
      s.load_target_mwe = powerFrac(s) * opts.rated;
    }
  }

  RD.LoadMode = {
    DEFAULT_TAU: DEFAULT_TAU,
    IMBALANCE_FRAC: IMBALANCE_FRAC,
    initState: initState,
    step: step,
    disconnect: disconnect,
    offline: offline,
    isOnLine: isOnLine,
    setMode: setMode,
    clip: clip,
  };
})(globalThis.RD || (globalThis.RD = {}));