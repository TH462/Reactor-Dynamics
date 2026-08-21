/* pwr2_feedwater.js — Layer 5: THE FEED TRAIN, retiring feed ≡ steam. (#479)
 *
 * Until 2026-08-21 the facade fed the SG exactly what left it ({feed: out, steam: out} — the
 * same variable), a declared simplification whose measured cost was the one A/B row the old
 * engine won (R6: ~41 points of missing level transient on a 30 % load swing,
 * PWR2_VALIDATION.md §60). This module makes dM = feed + afw − steam real: two main feed
 * pumps, one regulating valve, the sourced three-element controller, and feedwater isolation.
 *
 * ---------------------------------------------------------------------------------------
 * SOURCED:
 *
 *   Ginna UFSAR ch10 (ML20339A040) p.7: *"In the event of failure of one feedwater pump, the
 *   feedwater pump remaining in service will carry approximately 60% of full load feedwater
 *   flow. If both main feedwater pumps fail, the turbine will be tripped and the motor-driven
 *   auxiliary feedwater pumps (MDAFW) will start automatically."* — two pumps, 60 % of
 *   full-load flow each; the loss-of-both consequence is the caller's (HR5) and this module
 *   only REPORTS main_feed_lost.
 *
 *   WTSM 11.1 (ML11223A293), the steam generator water level control chapter — the
 *   three-element design verbatim: steam flow vs feed flow gives the FLOW ERROR; actual level
 *   "first conditioned by a lag unit" so that "shrink and swell effects [do not mask] actual
 *   steam generator inventory changes"; the level error feeds a PI whose *"time constant
 *   associated with the integral portion of the controller is two minutes"*; the total error
 *   (flow error + level PI) positions the feed regulating valve — *"An opening signal to the
 *   valve results when either (1) the actual level is less than the programmed level or (2)
 *   feed flow is less than steam flow."*
 *
 *   WAT 05 (ML11216A094) §5.3.2: the level lag is 5 seconds — "the output reaches a specific
 *   value 5 seconds after the actual parameter reaches that value ... This prevents an
 *   inappropriate response to shrink and swell."
 *
 *   Ginna UFSAR ch15 (ML20339A101) Table 15.0-6: *"Feedwater Isolation Delay from SI ...
 *   32.0"* — the SI-driven isolation's analysis delay; and ch15 §15.1.5's narrative: "The
 *   safety injection signal stops normal feedwater flow by closing the main feedwater
 *   isolation valves". WTSM 11.1 §11.1.4: feedwater isolation "causes automatic closure of
 *   all feed regulating and bypass valves ... and main feedwater isolation valves" and
 *   OVERRIDES the level control system — which is why `isolated` zeroes the valve here rather
 *   than merely gating the flow.
 *
 *   THE PROGRAM LEVEL IS 65 % NARROW RANGE *(OWNER RULING #355, 2026-08-08: "Program to
 *   65 %" — adopted; it is the sourced mass map's own reading at nominal inventory, so the
 *   at-power plant holds Ginna's 85,359 lbm)*. Ginna ch15 Table 15.0-4 note (g) models "a
 *   constant 52% narrow range span" — DECLINED, declared: that is the accident ANALYSES'
 *   modeling value, not the operating program, and adopting it would un-anchor the adopted
 *   map's nominal-mass knot. WTSM 11.1's 33→44 % ramp is the 4-loop training plant's.
 *
 * ---------------------------------------------------------------------------------------
 * ADOPTED / TUNE:
 *   pump_tau_s 8.0        [adopted, pwr_config.js feed_pump_tau [tune]] — pump+train response
 *   kp_lvl, kv_per_s      [tune] — the two PI gains; the source gives the STRUCTURE (two PI
 *                         stages) and one time constant (the 2-minute integral); the gains are
 *                         this plant's, arbitrated by the stability pass in the gates.
 *
 * DECLARED SIMPLIFICATIONS:
 *   NO FEED PUMP SPEED CONTROL. WTSM 11.1.2.2's pump-speed system exists to keep the valve
 *   mid-travel; with no valve-wear model there is nothing for it to protect. The valve alone
 *   carries the authority, so it rides ~0.83 at full power instead of mid-travel.
 *   CONSTANT FEED ENTHALPY. Feed arrives at pwr2_sg's sourced 435 degF (224 degC) h_feed even
 *   seconds after a trip — no condensate/heater train inventory to cool it down.
 *   ONE VALVE, LUMPED PUMPS. Same one-loop convention as pwr2_afw/pwr2_cvcs.
 *
 * HR5: this module EVALUATES and REPORTS. It does not trip the turbine, start AFW, or scram —
 * `main_feed_lost` is a report the caller (and the protection layer) consume.
 * UNITS: everything here is a FRACTION of rated full-load feed (= rated steam); the caller
 * converts to kg/s once.
 */
(function (root) {
  'use strict';

  var FW = {
    kind: '[sourced/adopted per field — header]',
    /* [sourced] ch10: one pump carries ~60 % of full-load flow */
    pump_frac_each: 0.60,
    /* [adopted tune] pwr_config feed_pump_tau — pump/train response to a demand change */
    pump_tau_s: 8.0,
    /* [ruled #355, adopted] the programmed level, % narrow range */
    program_pct: 65.0,
    /* [sourced] WAT 05 §5.3.2 — the anti-shrink/swell level lag */
    level_lag_s: 5.0,
    /* [sourced] WTSM 11.1 — the level PI's integral time constant, "two minutes" */
    level_ti_s: 120.0,
    /* [tune] level PI proportional gain, flow-fraction per % narrow range */
    kp_lvl: 0.02,
    /* [tune] valve slew gain — the total-error PI realized as valve RATE (its integral) */
    kv_per_s: 0.25,
    /* [sourced] Table 15.0-6 "Feedwater Isolation Delay from SI ... 32.0" */
    si_fwi_delay_s: 32.0,
    src: 'Ginna UFSAR ch10 (ML20339A040); WTSM 11.1 (ML11223A293); WAT 05 (ML11216A094) ' +
         '5.3.2; Ginna UFSAR ch15 (ML20339A101) Table 15.0-6; program level OWNER RULING #355'
  };

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  function createFeedwater(opts) {
    opts = opts || {};
    var atPower = opts.at_power !== false;      /* the engine's only IC is Hot Full Power */
    return {
      pumpA: opts.pumpA === undefined ? true : !!opts.pumpA,
      pumpB: opts.pumpB === undefined ? true : !!opts.pumpB,
      pumpAAvail: opts.pumpAAvail === undefined ? 1 : opts.pumpAAvail,
      pumpBAvail: opts.pumpBAvail === undefined ? 1 : opts.pumpBAvail,
      auto: opts.auto === undefined ? true : !!opts.auto,
      manual_frac: opts.manual_frac === undefined ? 1.0 : opts.manual_frac,
      isolated: false,                          /* the FWI latch — operator-reset only */
      valve: atPower ? 1.0 / (2 * FW.pump_frac_each) : 0,   /* mid-load position at rated */
      feed_frac: atPower ? 1.0 : 0,             /* DELIVERED, behind the pump lag */
      lvlLag: FW.program_pct,                   /* primed on-program: no boot kick */
      lvlInt: 0,                                /* % NR · s */
      _siHeld_s: 0
    };
  }

  /* stepFeedwater(fw, dt, drivers) — drivers, all INDICATED where a channel exists (HR1):
   *   sg_level_pct       narrow-range level, %        (element 1)
   *   steam_flow_frac    steam flow / rated           (element 2)
   *   fw_flow_frac       feed flow / rated            (element 3)
   *   si_active          the LATCHED SI signal — drives isolation after the sourced delay
   */
  function stepFeedwater(fw, dt, drivers) {
    drivers = drivers || {};
    var capacity = FW.pump_frac_each * ((fw.pumpA ? Math.max(0, fw.pumpAAvail) : 0) +
                                        (fw.pumpB ? Math.max(0, fw.pumpBAvail) : 0));

    /* SI -> feedwater isolation, the sourced 32 s behind the LATCHED signal. Held-time, not
     * edge: a reset that clears si before the delay elapses cancels the isolation. */
    if (drivers.si_active) {
      fw._siHeld_s += (dt > 0 ? dt : 0);
      if (fw._siHeld_s >= FW.si_fwi_delay_s) fw.isolated = true;
    } else fw._siHeld_s = 0;

    if (fw.isolated) {
      /* WTSM 11.1 §11.1.4: isolation closes the regulating valve and OVERRIDES the SGWLCS */
      fw.valve = 0;
    } else if (fw.auto) {
      var lvl = drivers.sg_level_pct;
      var wS = drivers.steam_flow_frac, wF = drivers.fw_flow_frac;
      if (lvl !== undefined && isFinite(lvl) && dt > 0) {
        fw.lvlLag += (dt / FW.level_lag_s) * (lvl - fw.lvlLag);
        var lvlErr = FW.program_pct - fw.lvlLag;                      /* % NR */
        /* ANTI-WINDUP, both halves — measured without them (2026-08-21): a one-pump
         * boil-down banks ~100 s of +40 % error, and the discharge refills the SG to
         * 100 % NR / 17,033 kg after the trip. (1) no integration while the valve is
         * RAILED — a saturated actuator cannot use more demand; (2) the bank is capped
         * at a 0.25 flow-fraction contribution, a real trim, never the whole valve. */
        if (fw.valve > 0.02 && fw.valve < 0.98) {
          fw.lvlInt = clip(fw.lvlInt + lvlErr * dt,
                           -0.25 / FW.kp_lvl * FW.level_ti_s, 0.25 / FW.kp_lvl * FW.level_ti_s);
        }
        var pi = FW.kp_lvl * (lvlErr + fw.lvlInt / FW.level_ti_s);    /* flow-fraction */
        var flowErr = (wS !== undefined && wF !== undefined && isFinite(wS) && isFinite(wF))
                      ? (wS - wF) : 0;
        /* the total-error controller, realized as the valve's rate (its own integral) */
        fw.valve = clip(fw.valve + FW.kv_per_s * (pi + flowErr) * dt, 0, 1);
      }
    } else {
      /* MANUAL: the operator's demand is a flow fraction; the valve is slaved so a later
       * re-engage of auto starts from the position that carries today's flow */
      fw.valve = capacity > 0 ? clip(fw.manual_frac / (2 * FW.pump_frac_each), 0, 1) : fw.valve;
    }

    var demand = fw.isolated ? 0
               : clip((fw.auto ? fw.valve : clip(fw.manual_frac / (2 * FW.pump_frac_each), 0, 1))
                      * 2 * FW.pump_frac_each, 0, capacity);
    if (dt > 0) fw.feed_frac += (demand - fw.feed_frac) * (dt / FW.pump_tau_s);
    if (fw.feed_frac < 0) fw.feed_frac = 0;

    return {
      feed_frac: fw.feed_frac,                  /* DELIVERED main feed, fraction of rated */
      demand_frac: demand,
      valve: fw.valve,
      capacity_frac: capacity,
      isolated: fw.isolated,
      /* [sourced ch10] the loss-of-both-pumps fact the caller's turbine trip and the
       * protection layer's MDAFW start both consume — a STATE signal (breaker positions),
       * not an analog channel, the turbine_tripped convention */
      main_feed_lost: capacity <= 0
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.feedwater = {
    FW: FW, createFeedwater: createFeedwater, stepFeedwater: stepFeedwater
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
