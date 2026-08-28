/* pwr2_true_state.js — THE SHIM: PWR2's layers, in the shape the contract names. (#479)
 *
 * `Blueprint/CONTEXT.md` §6.3 documents 109 `true_state` fields. The control layer, the instructor
 * and the board all read that block, and PWR2 is not rebuilding any of them — so the engine has to
 * present itself in their vocabulary. This is that translation and nothing more.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ THIS FILE INVENTS NOTHING. It is the single rule the design turns on.
 *
 * Roughly half the contract is blocked behind systems PWR2 does not have — the pressurizer (#472
 * owns it), protection, damage modelling, the nuclear instruments, accumulators. A shim that
 * returned `0` for `containment_pressure_mpa` because containment is not built would be **the same
 * defect D4 §23.4 catalogues**: invisible, because a consumer cannot tell an unbuilt system from a
 * quiet one. A containment at 0 MPa reads exactly like a containment that is fine.
 *
 * ⚠ AND THE REVERSE DEFECT IS EQUALLY REAL, and this file had it. Break discharge, containment and
 * the condenser all landed as gated Layer 5 systems while this shim still declared all three fully
 * missing — a stale registry telling a consumer "no model exists" for a field a real, sourced model
 * already answers. `buildTrueState()` had no `ctx.break_` / `ctx.containment` / `ctx.condenser` /
 * `ctx.eccs` block at all; the wiring stopped one call short of where the physics landed. Found by
 * re-reading this file after the containment commit rather than by a gate — nothing here could have
 * caught it, because a field that is merely ABSENT and a field that is DECLARED missing both read
 * as "not supplied" to every consumer downstream. **Declaring a system missing is a claim, and it
 * rots exactly like any other claim the moment the system gets built.**
 *
 * So an unbuilt field is **ABSENT from the output and DECLARED in `MISSING`, with the reason and
 * the system that owns it**. `run_contract.js` then reports it as a documented field the engine
 * does not have, which is true, and the gap becomes a counted backlog instead of a silent zero.
 *
 * ---------------------------------------------------------------------------------------
 * THE DECLARED SIMPLIFICATIONS, stated here rather than discovered downstream:
 *
 *   ONE PRESSURE. Layer 3 carries a single system pressure, so `p_hotleg`, `p_coldleg` and
 *   `p_pumpsuction` are all `sys.P`. A real plant's pump suction sits below its discharge by the
 *   loop resistance; this model has no such split, and three fields reading identical is the
 *   honest presentation of that — not three independent measurements that happen to agree.
 *
 *   SG LEVEL IS A MASS FRACTION. `pwr2_sg.js` is lumped by ruling, so there is no geometry to turn
 *   inventory into a gauge reading. `sg_mass_frac` is real; `sg_level_pct` and `sg_level_wide_pct`
 *   are NOT derivable from it without a level-geometry map, and that map is an instrument-layer
 *   concern. Declared missing rather than faked with a linear scale.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W  = RD && RD.water;
  /* #514: node temperatures through the table (pwr2_core's idiom). The five temperature
   * fields were each pwr2_water's 40-iteration Newton — ~14 % of the whole engine step,
   * paid once per physics step (18,000 of these objects are built per broadcast at 3600x,
   * because the instruments need a fresh truth every step). */
  var VT = RD && RD.vtable;
  var TFH = VT ? VT.T_from_h : (W && W.T_from_h);

  /* ---- WHAT IS NOT BUILT, AND WHO OWNS IT ---------------------------------------------------
   * Every entry is a documented §6.3 field this engine cannot honestly supply. The reason is not
   * decoration: it is what tells the next reader whether the field is waiting on a design, on
   * another lane, or on a decision. */
  var MISSING = {};
  function declareMissing(system, reason, fields) {
    fields.forEach(function (f) { MISSING[f] = { system: system, reason: reason }; });
  }

  /* ---- STATICS (stage B1, 2026-08-20 — owner ruling "Next: option B") ----------------------
   * The shell contract needs all 109 fields EMITTED; the declared-missing discipline existed so
   * an unbuilt system could not be faked. The reconciliation is a THIRD class: a STATIC is a
   * constant that states the model's truth about an unmodeled system — `ac_available: true` is
   * not a fabricated reading, it is the fact that this plant has no electrical failure model.
   * Every static is registered here with its reason, the gate asserts the registry matches what
   * is emitted, and an injection check proves statics never move when the plant does. The
   * boundary case is the accumulators: their nominal statics (full, pressurized, not
   * discharging) are honest at steady state and WRONG in a large LOCA — pwr2_eccs.js's header
   * declares the omission, and the A/B is expected to diverge there (D4 §8 upheld them as
   * proxies for exactly this reason). */
  var STATIC = {};
  function declareStatic(system, reason, fieldValues) {
    Object.keys(fieldValues).forEach(function (f) {
      STATIC[f] = { system: system, reason: reason, value: fieldValues[f] };
    });
  }
  /* the 'failure injection' spray_stuck static RETIRED #507 wave 6 — drivers.spray_stick is
   * a real lever now (the porv_stick twin) and the field is LIVE from the pressurizer result */
  declareStatic('containment ESF', 'sprays, fans and recombiners are unmodeled (pwr2_containment ' +
    'header) — false/0 states their absence; a large-LOCA A/B diverges here by design',
    { ctmt_h2_burned: 0, ctmt_spray_demand: false, ctmt_spray_active: false,
      ctmt_fan_safety: false, ctmt_fan_active: false,
      ctmt_recomb_demand: false, ctmt_recomb_active: false });
  /* the 'steam lines' msiv_open static RETIRED #511 — the MSIV is a real valve (see the
   * secondary block below) */
  /* the 'electrical' static RETIRED #507 wave 4 — station_blackout / ac_available are LIVE
   * fields now, supplied from the facade's two-bus state (see the B1 block below) */
  declareStatic('secondary', 'a single-SG plant cannot have an SG imbalance',
    { sg_imbalance_active: false });
  declareStatic('turbine', 'the turbine is dispatched by an operator load target — the only ' +
    'mode this model has', { load_mode: 'manual' });
  /* the 'AFW' afw_blocked static RETIRED #507 wave 6 — the discharge block is real state
   * (pwr2_afw af.blocked, the TMI-2 tagged-shut valves) and the field is LIVE below */
  /* the 'ECCS accumulators' statics RETIRED #511 (2026-08-24) — the tank is real state now
   * (pwr2_eccs ec.acc: water under isothermally-expanding nitrogen) and all five fields are
   * LIVE below. The 'steam lines' msiv_open static retires in the same change — the MSIV is
   * a real valve (pwr2_engine eng.msiv). */


  /* ⚠ THE PRESSURIZER BLOCK SHRANK ON 2026-08-18 — pwr2_pressurizer.js exists (owner ruling
   * 2026-08-18: "Option 1", superseding the wait-for-#472 posture the old reason cited), so
   * seven of its eleven fields are SUPPLIED below. The four that stay missing are each blocked
   * by their OWN absent machinery, named per the protection-block precedent — the old single
   * "not built" reason would have kept telling consumers there was no model while a sourced
   * one answered. */
  /* ⚠ SHRANK AGAIN when stage 2b landed (2026-08-19): porv_stuck is a real failure lever now
   * (drivers.porv_stick — PWR2's first failure-injection machinery), the block valve and the
   * tailpipe are modelled, and all three are SUPPLIED below. spray_stuck is the one survivor:
   * the spray valves have no failure lever yet, and a false here would describe one. */


  /* ⚠ THE PROTECTION BLOCK SPLIT WHEN pwr2_protection.js LANDED, and the split is the useful
   * part. It used to be one entry reading "PWR2 has NO PROTECTION LAYER" — true when written,
   * false the moment the RPS existed, and it would have gone on telling consumers there was no
   * model for `scrammed` while a real sourced one answered. `scrammed` is now supplied. The
   * remaining seven were never really "no protection layer": each is blocked by its OWN missing
   * system, and lumping them under one reason hid which. */





  /* ⚠ FIVE OF THESE SIX WERE BUILT ON 2026-08-17 and this block was rewritten in the same commit,
   * which is the discipline this file's header records the hard way: "Declaring a system missing
   * is a claim, and it rots exactly like any other claim the moment the system gets built."
   *
   * `core_uncovered_frac` STAYS MISSING, and the reason is NOT the generic one it used to carry.
   * The geometry is all present — the core node has a volume, a midplane elevation datum and a
   * 3.66 m flow length, so an area falls out. What is absent is PHASE SEPARATION: `pwr2_water.js`
   * is homogeneous equilibrium with no slip — the vapour is dispersed through the node, and
   * there is no free surface anywhere in the engine. A collapsed level computed from void would
   * make the uncovered fraction identically equal to the core node's void fraction, which asserts
   * a stratification the model does not contain. A free surface with a compressible volume above
   * it is exactly the machinery issue #472 is building on the workbench lane, and a second
   * incompatible one here is the race the design spine forbids. */











  /* ---- THE TRANSLATION ---------------------------------------------------------------------
   * buildTrueState(ctx) — ctx carries the live plant and the most recent return of each Layer 5
   * system. Nothing here recomputes physics; if a value is not in ctx it is not in the output. */
  /* Both take the ONE id->node map buildTrueState builds per call — the old per-field linear
   * scans re-walked sys.nodes seven times a step (#514). */
  function nodeT(nd, P, id) {
    var n = nd[id];
    return n ? TFH(n.h, P) : undefined;
  }
  /* nodeAlpha — the HOMOGENEOUS VOID FRACTION, not quality. The *_void_fraction fields shipped
   * publishing W.quality under a "same number by construction" claim; alpha and x differ 5-16x
   * over this plant's pressure range, so a consumer read 1.5 % on a core 15-20 % void by volume
   * (#490, audit #488 E16.1). Layer 0 owns the conversion. */
  function nodeAlpha(nd, P, id) {
    var n = nd[id];
    return n ? W.voidFraction(n.h, P) : undefined;
  }

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  function buildTrueState(ctx) {
    ctx = ctx || {};
    var sys = ctx.sys;
    if (!sys) {
      throw new Error('pwr2_true_state: ctx.sys is REQUIRED — this layer translates a plant, it ' +
                      'does not build one.');
    }
    var rx = ctx.reactor || {}, sg = ctx.sg || {}, tb = ctx.turbine || {},
        rl = ctx.relief || {}, cv = ctx.cvcs || {}, rh = ctx.rhr || {},
        br = ctx.break_ || {}, ct = ctx.containment || {}, cd = ctx.condenser || {},
        ec = ctx.eccs || {}, aw = ctx.afw || {}, dg = ctx.damage || {},
        pt = ctx.protection || {}, pz = ctx.pressurizer || {};
    var ts = {};
    function put(k, v) { if (v !== undefined && v !== null) ts[k] = v; }

    /* the ONE node scan (#514) — see nodeT above */
    var nd = {};
    for (var ni = 0; ni < sys.nodes.length; ni++) nd[sys.nodes[ni].id] = sys.nodes[ni];

    /* --- primary thermal-hydraulics, from Layers 2-4 --- */
    put('pressure_mpa',  sys.P);
    put('p_hotleg',      sys.P);          /* ONE PRESSURE — see the header */
    put('p_coldleg',     sys.P);
    put('p_pumpsuction', sys.P);
    var tHot = nodeT(nd, sys.P, 'hot_leg'), tXo = nodeT(nd, sys.P, 'crossover');
    put('thot_c',        tHot);
    put('tcold_c',       nodeT(nd, sys.P, 'cold_leg'));
    /* ⚠ the core node's BULK temperature under an EXIT name — the lumped model has no axial
     * profile, so a real exit reading would sit ~half the core dT higher (~15-20 degF at
     * rated). Declared here because the header's one-pressure caveat did not cover it
     * (audit #488 E16.3). */
    put('t_core_exit_c', nodeT(nd, sys.P, 'core'));
    /* Tavg comes IN from the engine's own step when it has one (#514 — stepInner already
     * computes it for the SG drive; recomputing here doubled primaryTavg's two leg inverses).
     * A caller without one (hand-wired harnesses) still gets the identical helper. */
    put('tavg_c',        ctx.tavg !== undefined ? ctx.tavg
                                                : (RD.sg ? RD.sg.primaryTavg(sys) : undefined));
    put('core_void_fraction',    nodeAlpha(nd, sys.P, 'core'));
    put('primary_void_fraction', nodeAlpha(nd, sys.P, 'hot_leg'));
    /* #517 — HOW DRY. `core_void_fraction` clips at 1, so from the moment the core goes fully
     * void it is a constant and the board can no longer distinguish a core that has just dried
     * out from one 131 degC into superheat. Measured, 5 cm2 unmitigated break: void hits 1.0 at
     * 580 s and this is the ONLY field that moves for the next 1,220 s. 0 whenever the core node
     * is at or below h_g, so it reads 0 through every normal evolution. */
    put('core_superheat_c', (function () {
      var n = nd.core;
      return n ? W.superheat_c(n.h, sys.P) : undefined;
    })());
    /* Subcooling from TRUE P and T, exactly as the contract line says — Layer 0 owns the
     * saturation line, the loop owns the temperatures, nothing here is invented. The suction
     * margin reads the CROSSOVER node, the leg that feeds the RCP. */
    if (tHot !== undefined) put('subcooling_c', W.subcooling(tHot, sys.P));
    if (tXo !== undefined)  put('suction_subcool_c', W.subcooling(tXo, sys.P));

    /* --- pressurizer (pwr2_pressurizer.js, stage 1 — owner ruling 2026-08-18 "Option 1") --- */
    put('pzr_level_pct',     pz.level_pct);
    /* the contract's pzr_mass_frac is the pressurizer's SHARE of total primary mass — the
     * liquid inventory sitting in the vessel over the whole plant's ledger. */
    if (pz.m_pzr !== undefined && typeof sys.M_total === 'number' && sys.M_total > 0) {
      put('pzr_mass_frac', pz.m_pzr / sys.M_total);
    }
    put('pzr_heaters_shed',  pz.heaters_shed);
    put('spray_stuck',       pz.spray_stuck === true);   /* LIVE since #507 wave 6 */
    put('porv_open',         pz.porv_open);
    put('porv_stuck',        pz.porv_stuck);
    put('block_valve_open',  pz.block_valve_open);
    put('porv_tailpipe_temp_c', pz.tailpipe_temp_c);
    if (pz.spray_frac !== undefined) put('spray_flow_pct', 100 * pz.spray_frac);
    if (typeof sys.M_total === 'number' && typeof ctx.M_nominal === 'number' && ctx.M_nominal > 0) {
      put('core_inventory_pct', 100 * sys.M_total / ctx.M_nominal);
    }
    if (typeof sys.mdot_loop === 'number') {
      put('pump_running',  sys.mdot_loop > 1);
      if (typeof ctx.mdot_rated === 'number' && ctx.mdot_rated > 0) {
        put('pump_flow_pct', 100 * sys.mdot_loop / ctx.mdot_rated);
        /* Natural circulation: flowing, but far below forced flow. The threshold is the CALLER'S
         * because it is a lineup question, not a physics one. */
        if (typeof ctx.natcirc_frac === 'number') {
          put('natural_circulation',
              sys.mdot_loop > 0 && sys.mdot_loop < ctx.natcirc_frac * ctx.mdot_rated);
        }
      }
    }

    /* --- reactor --- */
    put('power_pct',      rx.power_pct);
    put('core_heat_pct',  rx.core_heat_pct);
    put('decay_heat_pct', rx.decay_pct);
    put('fuel_temp_c',    rx.T_fuel_c);
    put('reactivity_pcm', rx.rho_pcm);
    put('xenon_pct_eq',   rx.xenon_pct_eq);
    put('boron_ppm',      ctx.boron_ppm);
    /* period_s is genuinely Infinity at true steady state -- reported as such (a perfectly
     * steady reactor HAS an infinite period), not suppressed to undefined, which would make the
     * field flicker in and out of `unaccounted` depending on plant state. */
    put('reactor_period_s',   rx.period_s);
    put('startup_rate_dpm',   rx.startup_rate_dpm);

    /* --- steam generator --- */
    put('steam_pressure_mpa', sg.P_sec);
    put('t_sg_c',             sg.T_sec);
    put('sg_mass_frac',       sg.mass_frac);
    /* THE WET WALL IS NOT PUBLISHED ON true_state, and the reason is a gate boundary worth
     * knowing (#562). `sg_carryover_frac` — the liquid fraction of the steam leaving the
     * generator — was written here and PULLED: `Blueprint/CONTEXT.md` §6.3 is checked by
     * `run_contract.js` against the RETIRED `engines/pwr` engine ONLY, so a PWR2-only field
     * cannot be documented there without the gate reporting it STALE, and publishing it
     * UNdocumented breaks the §6.3 rule in the other direction. Making the retired engine emit
     * a constant 0 to satisfy the gate would be exactly the fabricated-zero defect this file's
     * header exists to forbid — a containment at 0 MPa reads like a containment that is fine.
     * So carryover is reported on `stepSG`'s RETURN (`carryover_frac`, `solid`, `steam_out_h`)
     * where the engine consumes it, and the player sees the wall through what it DOES: the
     * high-high level turbine trip, the pegged level gauges and the primary's cooldown.
     * THE REAL GAP IS THAT run_contract IS PWR1-ONLY WHILE PWR2 IS THE PLANT THE SITE RUNS —
     * filed rather than worked around here. */

    /* --- turbine / generator --- */
    put('mwe_output',        tb.mwe_output);
    put('load_target_mwe',   tb.load_target_mwe);
    put('steam_demand_mwe',  tb.load_target_mwe);
    /* ⚠ a SYNTHESIZED two-state constant (1800 or 0) — pwr2_turbine declares "no shaft
     * dynamics" and this forwards that caveat, which the field name alone cannot carry: a
     * consumer cannot tell this 1800 from a measured one (audit #488 E16.4). */
    put('turbine_rpm',       tb.rpm);
    if (tb.rpm !== undefined) put('turbine_tripped', tb.rpm === 0);
    if (tb.steam_kgs !== undefined && ctx.rated_steam_kgs) {
      put('steam_flow_normalized', tb.steam_kgs / ctx.rated_steam_kgs);
    }

    /* --- relief --- */
    /* dump_demand IS the valve position in pwr2_relief's model (flow = demand * capacity when
     * the condenser is available), and the layer reports it. The first version re-derived the
     * position from dump_kgs with a retyped 0.28 — the current engine's capacity constant,
     * untagged, in a file whose charter is "this file invents nothing" — and read 0 % on a
     * commanded-open dump with the condenser unavailable, which is a flow fact wearing a
     * position name (#491, audit #488 E16.2). */
    put('steam_dump_valve_pct',
        rl.dump_demand !== undefined ? 100 * rl.dump_demand : undefined);
    put('sg_safety_open', rl.safety_open);
    if (tb.steam_kgs !== undefined && rl.total_kgs !== undefined && ctx.rated_steam_kgs) {
      put('steam_out_total', (tb.steam_kgs + rl.total_kgs) / ctx.rated_steam_kgs);
    }

    /* --- CVCS --- */
    /* THE #408 CURRENCY [adopted] (2026-08-21): the contract's CVCS flow fields read
     * "gpm / 450,000" — the current engine's fraction-of-RCS-per-second, kept as the SHARED
     * currency because every consumer converts with that literal (the board's GPM_CHARGING
     * 450,000; the CHG FLOW HI annunciator at 8.0e-5 = 36 gpm). The shipped B1 form
     * published kg/s here, which read as ~343,000 gpm: the finish list's "120 gpm balance /
     * standing annunciator" was THIS mistranslation, not a plant defect — the true settled
     * flows are the module's own sourced-scaled 12.1 / 12.5 gpm. */
    var FRAC_PER_KGS = 60 * 264.172 / 1000 / 450000;   /* kg/s -> gpm -> the currency */
    put('charging_flow_actual', cv.charging_kgs * FRAC_PER_KGS);
    put('letdown_flow_actual',  cv.letdown_kgs * FRAC_PER_KGS);

    /* --- RHR --- */
    /* THE VALVE, like the contract and the old engine (#510 M-10): §6.3 defines the field
     * as "aligned = hot-leg suction valve open" and pwr1 mirrors rhr_valve_open. The old
     * duty>0 form painted "RHR Active: no" over "RHR Suction Valve: OPEN" on the shipped
     * Mode 4 preset (aligned, HX throttled to a hold — duty 0 by intent). */
    put('rhr_active',     rh.valve_open !== undefined ? rh.valve_open === true : undefined);
    /* THE VALVE, not the permissive (#507 wave 2) — the old form read open on any
     * depressurized plant with the system secured, a lamp lying about the lineup */
    put('rhr_valve_open', rh.valve_open !== undefined ? rh.valve_open : rh.permissive_may_open);

    /* --- break / leak --- */
    /* THE SAME #408 CURRENCY AS THE CVCS FLOWS ABOVE (#550): §6.3 defines leak_flow as
     * NORMALIZED (inventory-fraction/s) and the instrument spec's whole range is [0, 0.06].
     * Published raw kg/s it was 28,391x the currency — the board's break-flow gauge pegged
     * at 0.0600 (27,000 gpm) for a 2.4 gpm seal leak and a 2,117 gpm guillotine alike, and
     * sizing the leak is the seal-leak row's whole teaching point. */
    put('leak_flow', (br.mdot_kgs || 0) * FRAC_PER_KGS);   /* no break = zero leak, stated */

    /* --- containment --- */
    put('containment_pressure_mpa', ct.containment_pressure_mpa);
    put('containment_temp_c',       ct.containment_temp_c);

    /* --- condenser --- */
    put('condenser_vacuum_kpa',        cd.condenser_vacuum_kpa);
    put('cw_inlet_temp_c',             cd.cw_inlet_temp_c);
    put('condenser_cooling_available', cd.available);

    /* --- ECCS ---
     * [derived] naming state pwr2_eccs.js already carries, not new physics: `mode` and the two
     * booleans/normalization below are read straight off its flow return, not computed here. */
    if (ec.total_kgs !== undefined) {
      /* PUMP injection only (#511): the accumulator is passive and has its own fields below —
       * before the split an accumulator dump lit hpi_active and read as pump flow */
      var pumpKgs = (ec.hhsi_kgs || 0) + (ec.lhsi_kgs || 0);
      put('hpi_active', pumpKgs > 0);
      if (RD.eccs) {
        var hpiRated = RD.eccs.hhsiFlow(0) + RD.eccs.lhsiFlow(0);     /* nameplate, both trains */
        if (hpiRated > 0) put('hpi_flow_normalized', pumpKgs / hpiRated);
      }
      var mode = 'standby';
      if (ec.hhsi_kgs > 0 && ec.lhsi_kgs > 0) mode = 'both';
      else if (ec.hhsi_kgs > 0) mode = 'hhsi';
      else if (ec.lhsi_kgs > 0) mode = 'lhsi';
      /* an ALIGNED RHR wins the word (#507 wave 2): shutdown cooling and low-head injection
       * are the same pumps in two alignments (#458), and the lineup word says which */
      if (rh.valve_open === true) mode = 'rhr';
      put('eccs_mode', mode);
    }
    /* --- the accumulator (#511 — LIVE; the five old statics retired) --- */
    if (ec.acc_pressure_mpa !== undefined) {
      put('accumulator_valve_open',     ec.acc_valve_open === true);
      put('accumulators_discharging',   (ec.acc_kgs || 0) > 0);
      put('accumulator_volume_pct',     100 * (ec.acc_water_frac !== undefined ? ec.acc_water_frac : 0));
      put('accumulator_pressure_mpa',   ec.acc_pressure_mpa);
      /* normalized to the sourced full-dump rate (M0 / 36 s), so 1.0 is the design-basis
       * blowdown discharge — the same convention the flow coefficient is solved against */
      if (RD.eccs && RD.eccs.ACC) {
        var accRated = RD.eccs.accK() * Math.sqrt(RD.eccs.ACC.p0_mpa / 2);
        if (accRated > 0) put('accumulator_flow_normalized', (ec.acc_kgs || 0) / accRated);
      }
    }

    /* --- AFW --- */
    if (aw.total_kgs !== undefined) {
      /* DEMAND vs DELIVERY, the house split (#200/#329/#332): the run light reads the pumps'
       * demand, the flow reads what arrives. Before 2026-08-20 both keyed on total_kgs > 0,
       * which made a demanded pump with avail 0 read SECURED — the self-healing shape. */
      put('afw_pump_running', !!(aw.mdafw_running || aw.tdafw_running));
      put('afw_active',       aw.total_kgs > 0);
      put('afw_blocked',      aw.blocked === true);      /* LIVE since #507 wave 6 */
      put('afw_flow_normalized', aw.afw_flow_normalized);
    }

    /* --- CORE DAMAGE, from pwr2_damage.js + the clad node in pwr2_fuel.js ---
     * `clad_temp_c` comes from the REACTOR's return, not from the damage model: the cladding is a
     * thermal node in `pwr2_fuel.js` and the oxidation model READS it. Wiring it the other way
     * round would report a temperature the plant's own energy balance never saw.
     *
     * ⚠ NOT INSIDE ANY OTHER SYSTEM'S GUARD, and the first version of this block WAS — it landed
     * inside `if (aw.total_kgs !== undefined)`, so a caller supplying a damage model but no
     * auxiliary feedwater got all five fields silently dropped. That is this file's own headline
     * defect ("the wiring stopped one call short of where the physics landed") reproduced in a
     * commit whose whole subject is not doing that. It reads as ABSENT, i.e. "no model", which is
     * indistinguishable from the truth to every consumer downstream. Each `put` guards itself. */
    /* --- PROTECTION, from pwr2_protection.js ---
     * `scrammed` is the LATCHED reactor trip. The reactor protection system is automatic plant
     * hardware, so the latch is plant state and belongs here — but the ROD INSERTION that follows
     * it is the caller's, exactly as pwr2_protection.js's header says. A consumer seeing
     * `scrammed` true while power stays up is looking at a wiring gap, and that is the intended
     * visibility rather than something to paper over here. */
    put('scrammed', pt.reactor_trip);

    /* ---- THE MODEL HAS STOPPED, AND UNTIL #517 NOBODY WAS TOLD ---------------------------------
     * `pwr2_core` latches `sys.beyond_model` when the plant leaves the range Layer 0 is
     * characterised over, and every later step HOLDS: state frozen, clock running (the #487/#499
     * contract). That is the right physics answer — a fabricated continuation would be worse. But
     * the flag lived on `sys` and NOTHING published it: `grep beyond_model ui layers` returned
     * zero hits, no true_state key matched it, and the player got a plausible, internally
     * consistent, completely static plant that went on accepting commands. Measured on the TMI
     * ride: identical values for 160 minutes, `plant_mode` still 'Hot Standby', destruction cause
     * 'none'. A simulator that has stopped simulating must SAY SO — that is Hard Rule 1's spirit
     * (never soften the gap between the model and the truth) applied to the model itself.
     * `held_why` is the facade's own reason string when it has one, so a report carries the cause
     * rather than just the fact. */
    put('model_held', ctx.beyond_model === true);
    /* 'none' rather than null, because `put` DROPS null and a field that only exists on a held
     * plant is a field `run_contract` can never see — the same convention `destruction_cause`
     * already uses for exactly this reason. */
    put('model_held_why', ctx.held_why || 'none');

    put('clad_temp_c',       rx.T_clad_c);
    put('fuel_damaged',      dg.fuel_damaged);
    put('melted',            dg.melted);
    put('destruction_cause', dg.destruction_cause);
    put('zirc_heat_pct',     dg.zirc_heat_pct);

    /* ================= STAGE B1 — THE CONTRACT COMPLETED (2026-08-20) =====================
     * Every remaining sec 6.3 field, each a derivation/translation from state this engine
     * really has, or a registered STATIC (see the registry above). Display scales adopted
     * from the current engine are marked [adopted] with their source constant — they are
     * gauge calibrations, not physics. */

    /* --- plant mode, the commercial ladder (#507 wave 10): Mode 1 at power, then by Tavg —
     * Mode 5 Cold Shutdown below 200 degF (93.3 degC, unreachable while Layer 0 floors at
     * 0.1 MPa — the branch exists for the day it extends), Mode 4 Hot Shutdown to 350 degF
     * (176.7 degC), Mode 3 Hot Standby above. Mode 2 (Startup, criticality to 5 %) is
     * folded into 3 — DECLARED, the band is minutes wide on this plant. The At-Power
     * threshold is the commercial ladder's own 5 % (#510 LOW: it shipped at 2 %, so the
     * 2-5 % band printed "At Power" while this comment claimed it folded into 3). --- */
    var atPower = (ts.power_pct !== undefined ? ts.power_pct : 0) > 5 && ts.scrammed !== true;
    var tvM = ts.tavg_c;
    var mode = atPower ? 1
             : (typeof tvM === 'number' && tvM < 93.3) ? 5
             : (typeof tvM === 'number' && tvM < 176.7) ? 4
             : 3;
    put('plant_mode', mode);
    put('plant_mode_name', mode === 1 ? 'At Power'
                         : mode === 5 ? 'Cold Shutdown'
                         : mode === 4 ? 'Hot Shutdown' : 'Hot Standby');

    /* --- feed train (REAL since 2026-08-21 — pwr2_feedwater retired feed ≡ steam): the
     * delivered main-feed fraction from the module, plus AFW on the same rated-steam scale
     * (the current engine's fw_flow convention: main + auxiliary). A caller with no
     * feedwater result simply does not get the fields — the shim's absent-system rule. --- */
    if (ctx.feedwater && ctx.feedwater.feed_frac !== undefined) {
      var afwN = (aw.total_kgs !== undefined && ctx.rated_steam_kgs > 0)
                 ? aw.total_kgs / ctx.rated_steam_kgs : 0;
      put('fw_flow_normalized',        ctx.feedwater.feed_frac + afwN);
      put('condensate_flow_normalized', ctx.feedwater.feed_frac);
    }
    put('condensate_pump_running',   ctx.condenser_available === true);

    /* --- electrical (LIVE since #507 wave 4 — the registered static retired): the facade's
     * two-bus state. Absent ctx means a healthy grid (module fixtures build without an
     * engine), the acAvailable absent-means-powered convention. --- */
    put('ac_available',     ctx.ac_available !== false);
    put('station_blackout', ctx.station_blackout === true);

    /* --- NIS display channels: cps = K_SR*P, amps = K_IR*P — gauge scales, not physics; the
     * flux behind them is this engine's own. PWR2_VALIDATION §34 records the genuine zero
     * behind both: no corpus document gives a full-scale calibration for turning a neutron
     * population into counts or amps, so these are ADOPTED numbers and say so.
     *
     * ⚠ K_SR IS THIS PLANT'S, NOT THE RETIRED PLANT'S, SINCE #536. It was 5.0e8 — inherited
     * from `pwr_config.js`'s nis block, where it had been sized against a subcritical level
     * that engine produced with a 500x-inflated prompt generation time. PWR2 runs the real
     * Lambda, so its source-held level is ~500x lower and the SAME scale read the shutdown
     * plant at 0.5 counts per second, pinned on a display floor. Re-anchored (owner ruling,
     * 2026-08-28, choosing "re-scale the gauges too" from three options put to him) so that
     * HOT STANDBY READS ~500 cps — which is what `Manuals/09` §9.0 already documents, "~500 cps
     * class at HZP source equilibrium", so this makes the plant match prose it already ships.
     * Measured across the ladder: Mode 3 hot standby 502, P-6 point 1,560, SR->IR handoff
     * caution 5.0e4, Mode 4 hot shutdown 101, settled post-trip 89.
     *
     * ⚠ K_IR DOES NOT MOVE, AND MUST NOT. `pwr2_protection.js` derives the SOURCED intermediate-
     * range high-flux rod stop through it — WTSM 8.1 §8.1.7.3's "20 % current equivalent power"
     * IS 1.667e-3 A only at 8.333e-3 — so re-scaling it would move a sourced setpoint. It also
     * does not need to: at this scale the sourced P-6 permissive (5e-11 A, Ginna TS Bases) is
     * UNMET at hot standby (1.61e-11 A) and comes in at -366 pcm, partway up the bank, which is
     * where a real startup meets it. That is the test that picked the source strength. --- */
    var K_SR = 2.6e11;      /* cps per unit rated fraction  [adopted] — anchor above */
    var K_IR = 8.333e-3;    /* amps per unit rated fraction [adopted] — pwr_config nis block */
    var SR_SECURE_CPS = 1.0e5;
    var pFrac = (ts.power_pct !== undefined ? ts.power_pct : 0) / 100;
    /* The SR proportional counter is DE-ENERGIZED on the way up (protected — the P-6 class
     * fact); this model has no operator lever, so energization derives from flux alone
     * [derived]. THE CUE IS THE ONE THE MANUAL ALREADY GIVES — `Manuals/03` §4.3 and
     * `Manuals/04`: "Secure SR during power rise BEFORE SR high-flux trip (1e5 cps)" — rather
     * than the bare `pFrac < 1e-3` literal this carried, which was the same cue expressed on the
     * OLD scale and at the new one would let the gauge indicate 2.6e8 cps, four decades past its
     * own 1e6 range top. Written against the setpoint, so it cannot drift from k_sr again. */
    var srOn = pFrac * K_SR < SR_SECURE_CPS;
    put('sr_energized', srOn);
    /* NO FLOOR. Both channels carried `Math.max(pFrac, 1e-9)`, which existed ONLY because a
     * sourceless core decayed to zero and the gauges had to be stopped from reading it. With a
     * source the level is genuinely non-zero at every plant state, and the floor now hides real
     * physics: it pinned the post-trip plant at 0.5 cps against a true 89. */
    put('sr_counts_cps', srOn ? K_SR * pFrac : 0);
    put('ir_amps',       K_IR * pFrac);

    /* --- core uncovery: a DECLARED HEM PROXY (D4 sec 8 upheld). The homogeneous model has
     * no water level; sustained high core void is the nearest honest stand-in. Expect A/B
     * divergence here — that is the point of the proxy class. --- */
    var aCore = ts.core_void_fraction !== undefined ? ts.core_void_fraction : 0;
    /* ⚠ THE PROXY SATURATED, AND THE SATURATION WAS THE WHOLE BLIND SPOT (#517). void 0.5 -> 1.0
     * maps onto 0 -> 100 % and then STOPS: on the 5 cm2 unmitigated ride this pinned at 100 % at
     * 580 s and reported the identical number for the remaining 1,220 s, while the core went on
     * drying (0 -> 131 degC of superheat) and the clad climbed 555 -> 677 degF. "100 % uncovered"
     * an hour before anything is actually damaged is a proxy that has stopped carrying
     * information. Superheat is the only quantity that still moves there, so the top of the range
     * is now the DRYING half: void does 0 -> 0.9 of the scale, superheat the last 0.1 over a
     * [derived] 150 degC span (the 5 cm2 ride plateaus at 131, the 20 cm2 reaches 248 — so the
     * span is inside the measured envelope and does not peg on the ordinary case).
     * STILL A DECLARED HEM PROXY: there is no water level here and this does not invent one —
     * it stops throwing away the one signal the homogeneous model does have. #472's stratified
     * vessel is what replaces it. */
    var shCore = ts.core_superheat_c !== undefined ? ts.core_superheat_c : 0;
    put('core_uncovered_frac',
        clip(0.9 * (aCore - 0.5) / 0.5, 0, 0.9) + clip(0.1 * shCore / 150, 0, 0.1));

    /* --- SG levels: PWR2's REAL secondary mass through the current engine's SOURCED level
     * geometry [adopted: sg_mass_map, pwr_config.js — same Ginna 85,359 lbm nominal both
     * engines]. Wide % from the piecewise map; narrow is its 30-75 window (sg_wr_lo/hi). --- */
    if (ts.sg_mass_frac !== undefined) {
      /* THE MAP MOVED TO pwr2_sg.js's SG.LEVEL_MAP (#562, 2026-08-27) and this reads it. It
       * is steam-generator GEOMETRY, and it was a local here while pwr2_sg held a hand-copied
       * `dryout_mass_frac` off one of its points — two files to edit together, which is the
       * second-copy shape #557/#556/#561 record. The wall needed two more points off the same
       * curve, so it got one owner. Falls back to the literal only if Layer 5 is absent from
       * the fixture, which the true-state gate does deliberately. */
      var MAP = (RD.sg && RD.sg.SG && RD.sg.SG.LEVEL_MAP) ||
                [[0, 0], [0.38845, 30], [0.5484, 37.65], [1.0, 59.25], [1.32929, 75], [2.45, 100]];
      var mf = ts.sg_mass_frac, wide = 100;
      for (var mi = 1; mi < MAP.length; mi++) {
        if (mf <= MAP[mi][0]) {
          var m0 = MAP[mi - 1], m1 = MAP[mi];
          wide = m0[1] + (m1[1] - m0[1]) * (mf - m0[0]) / (m1[0] - m0[0]);
          break;
        }
      }
      if (mf > MAP[MAP.length - 1][0]) wide = 100;
      put('sg_level_wide_pct', clip(wide, 0, 100));
      put('sg_level_pct', clip((wide - 30) / (75 - 30) * 100, 0, 100));
    }

    /* --- RCP cavitation: from the REAL suction subcooling margin (the crossover node feeds
     * the pump). Thresholds [open]: onset below 3 degC of margin, full by 0. --- */
    if (ts.suction_subcool_c !== undefined) {
      var cavF = clip((3 - ts.suction_subcool_c) / 3, 0, 1);
      var pumpOn = ts.pump_running !== false && ctx.pump_running !== false;
      put('rcp_cavitation_frac', pumpOn ? cavF : 0);
      put('rcp_cavitating', pumpOn && cavF > 0.5);
    }

    /* --- the MSIV (#511 — LIVE; the 'steam lines' static retired). Absent ctx means OPEN:
     * a layer fixture with no MSIV machinery is a line with nothing shut in it, which is
     * also what keeps the field accounted for on engine-direct fixtures. --- */
    put('msiv_open', ctx.msiv_open !== false);

    /* --- turbine valves: the governor IS the steam demand; the stop valve is the trip --- */
    var tripped = ctx.turbine_tripped === true;
    put('stop_valve_pct', tripped ? 0 : 100);
    put('governor_valve_pct', tripped ? 0 :
        clip((ts.steam_flow_normalized !== undefined ? ts.steam_flow_normalized : 0) * 100, 0, 110));

    /* --- ADV (pwr2_relief.js, sec 48): direct reads, normalized to its own 8.18 kg/s --- */
    if (rl.adv_frac !== undefined) put('adv_valve_pct', clip(rl.adv_frac * 100, 0, 100));
    if (rl.adv_kgs !== undefined)  put('adv_flow_normalized', clip(rl.adv_kgs / 8.18, 0, 1.5));

    /* --- pump discharge pressures: min(dead-head, system P) while running — with flow the
     * discharge sits at the injection point; against a shut check valve it sits at dead-head.
     * HHSI dead-head 9.58 MPa [sourced, the shutoff head]; AFW dead-head 8.3 MPa [open]. --- */
    put('hpi_discharge_pressure_mpa',
        ts.hpi_active === true ? Math.min(9.58, Math.max(sys.P, 0.101)) : 0);
    put('afw_discharge_pressure_mpa',
        ts.afw_active === true && ts.steam_pressure_mpa !== undefined
          ? Math.min(8.3, Math.max(ts.steam_pressure_mpa, 0.101)) : 0);

    /* --- rates and imbalances --- */
    if (typeof ctx.tavg_rate_c_per_hr === 'number') {
      put('tavg_rate_c_per_hr', ctx.tavg_rate_c_per_hr);
    }
    if (typeof ctx.load_target_mwe === 'number' && ts.mwe_output !== undefined) {
      put('load_imbalance_mwe', ctx.load_target_mwe - ts.mwe_output);
    }

    /* --- containment sump and hydrogen, from state this engine really tracks --- */
    if (ct.m_sump_kg !== undefined && typeof ctx.M_nominal === 'number' && ctx.M_nominal > 0) {
      /* display scale [derived]: 100 % = the whole primary inventory in the sump — an honest
       * ruler for a model with no sump geometry (pwr2_containment.js names the absence) */
      put('containment_sump_pct', clip(100 * ct.m_sump_kg / ctx.M_nominal, 0, 100));
    }
    if (dg.oxidation_frac !== undefined && ct.m_air !== undefined) {
      /* Zr + 2 H2O -> ZrO2 + 2 H2: oxidized clad (M_clad 2136 kg, pwr2_damage.js sec header)
       * gives kmol H2 = ox * 2136 / 91.224 * 2; mole fraction against the tracked air +
       * vapour atmosphere. A real translation — the H2 SOURCE is the damage model's own. */
      var nH2 = dg.oxidation_frac * 2136 / 91.224 * 2;
      var nTot = ct.m_air / 28.97 + (ct.m_vapour_kg || 0) / 18.02 + nH2;
      put('ctmt_h2_pct', nTot > 0 ? clip(100 * nH2 / nTot, 0, 100) : 0);
    }

    /* --- the registered statics, emitted last so nothing above can shadow one --- */
    Object.keys(STATIC).forEach(function (sf) { ts[sf] = STATIC[sf].value; });

    return ts;
  }

  /* coverage(ts) — what the shim supplied, what it DECLARED missing, and what is neither.
   * The third number is the one that matters: a field in no category is one nobody has thought
   * about, and it is the only failure this file can have that is not visible from the output. */
  function coverage(ts, contractFields) {
    var supplied = [], declared = [], unaccounted = [], statics = [];
    contractFields.forEach(function (f) {
      if (ts[f] !== undefined) {
        supplied.push(f);
        if (STATIC[f]) statics.push(f);       /* a supplied constant, registered with a reason */
      }
      else if (MISSING[f]) declared.push(f);
      else unaccounted.push(f);
    });
    return { supplied: supplied, declared: declared, unaccounted: unaccounted, statics: statics };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.trueState = {
    MISSING: MISSING, STATIC: STATIC, buildTrueState: buildTrueState, coverage: coverage
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
