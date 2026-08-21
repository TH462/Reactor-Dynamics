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
  declareStatic('failure injection', 'the spray valves have no failure lever yet — the value ' +
    'states that the failure is not injectable, not that a lever reads healthy',
    { spray_stuck: false });
  declareStatic('containment ESF', 'sprays, fans and recombiners are unmodeled (pwr2_containment ' +
    'header) — false/0 states their absence; a large-LOCA A/B diverges here by design',
    { ctmt_h2_burned: 0, ctmt_spray_demand: false, ctmt_spray_active: false,
      ctmt_fan_safety: false, ctmt_fan_active: false,
      ctmt_recomb_demand: false, ctmt_recomb_active: false });
  declareStatic('steam lines', 'no MSIV model — the line is genuinely always open',
    { msiv_open: true });
  declareStatic('electrical', 'no electrical model — AC is genuinely always available here',
    { station_blackout: false, ac_available: true });
  declareStatic('secondary', 'a single-SG plant cannot have an SG imbalance',
    { sg_imbalance_active: false });
  declareStatic('turbine', 'the turbine is dispatched by an operator load target — the only ' +
    'mode this model has', { load_mode: 'manual' });
  declareStatic('AFW', 'no AFW block lever exists', { afw_blocked: false });
  declareStatic('ECCS accumulators', 'DECLARED OMISSION (pwr2_eccs.js header): an accumulator ' +
    'is an inventory with expanding cover gas, deferred to the compressible-volume work. ' +
    'Nominals are honest at steady state and WRONG in a large LOCA — the predicted-divergence ' +
    'set (D4 sec 8) carries them.',
    { accumulator_valve_open: true, accumulators_discharging: false,
      accumulator_flow_normalized: 0, accumulator_volume_pct: 100,
      accumulator_pressure_mpa: 4.14 });


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
  function nodeT(sys, id) {
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].id === id) return W.T_from_h(sys.nodes[i].h, sys.P);
    }
    return undefined;
  }
  /* nodeAlpha — the HOMOGENEOUS VOID FRACTION, not quality. The *_void_fraction fields shipped
   * publishing W.quality under a "same number by construction" claim; alpha and x differ 5-16x
   * over this plant's pressure range, so a consumer read 1.5 % on a core 15-20 % void by volume
   * (#490, audit #488 E16.1). Layer 0 owns the conversion. */
  function nodeAlpha(sys, id) {
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].id === id) return W.voidFraction(sys.nodes[i].h, sys.P);
    }
    return undefined;
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

    /* --- primary thermal-hydraulics, from Layers 2-4 --- */
    put('pressure_mpa',  sys.P);
    put('p_hotleg',      sys.P);          /* ONE PRESSURE — see the header */
    put('p_coldleg',     sys.P);
    put('p_pumpsuction', sys.P);
    put('thot_c',        nodeT(sys, 'hot_leg'));
    put('tcold_c',       nodeT(sys, 'cold_leg'));
    /* ⚠ the core node's BULK temperature under an EXIT name — the lumped model has no axial
     * profile, so a real exit reading would sit ~half the core dT higher (~15-20 degF at
     * rated). Declared here because the header's one-pressure caveat did not cover it
     * (audit #488 E16.3). */
    put('t_core_exit_c', nodeT(sys, 'core'));
    put('tavg_c',        RD.sg ? RD.sg.primaryTavg(sys) : undefined);
    put('core_void_fraction',    nodeAlpha(sys, 'core'));
    put('primary_void_fraction', nodeAlpha(sys, 'hot_leg'));
    /* Subcooling from TRUE P and T, exactly as the contract line says — Layer 0 owns the
     * saturation line, the loop owns the temperatures, nothing here is invented. The suction
     * margin reads the CROSSOVER node, the leg that feeds the RCP. */
    var tHot = nodeT(sys, 'hot_leg'), tXo = nodeT(sys, 'crossover');
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
    put('rhr_active',     rh.duty_kW !== undefined ? rh.duty_kW > 0 : undefined);
    put('rhr_valve_open', rh.permissive_may_open);

    /* --- break / leak --- */
    put('leak_flow', br.mdot_kgs !== undefined ? br.mdot_kgs : 0);   /* no break = zero leak, stated */

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
      put('hpi_active', ec.total_kgs > 0);
      if (RD.eccs) {
        var hpiRated = RD.eccs.hhsiFlow(0) + RD.eccs.lhsiFlow(0);     /* nameplate, both trains */
        if (hpiRated > 0) put('hpi_flow_normalized', ec.total_kgs / hpiRated);
      }
      var mode = 'standby';
      if (ec.hhsi_kgs > 0 && ec.lhsi_kgs > 0) mode = 'both';
      else if (ec.hhsi_kgs > 0) mode = 'hhsi';
      else if (ec.lhsi_kgs > 0) mode = 'lhsi';
      put('eccs_mode', mode);
    }

    /* --- AFW --- */
    if (aw.total_kgs !== undefined) {
      /* DEMAND vs DELIVERY, the house split (#200/#329/#332): the run light reads the pumps'
       * demand, the flow reads what arrives. Before 2026-08-20 both keyed on total_kgs > 0,
       * which made a demanded pump with avail 0 read SECURED — the self-healing shape. */
      put('afw_pump_running', !!(aw.mdafw_running || aw.tdafw_running));
      put('afw_active',       aw.total_kgs > 0);
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

    /* --- plant mode: this engine models At Power and post-trip Hot Standby only --- */
    var atPower = (ts.power_pct !== undefined ? ts.power_pct : 0) > 2 && ts.scrammed !== true;
    put('plant_mode', atPower ? 1 : 3);
    put('plant_mode_name', atPower ? 'At Power' : 'Hot Standby');

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

    /* --- NIS display channels [adopted]: cps = k_sr*P, amps = k_ir*P with the current
     * engine's k_sr 5.0e8 / k_ir 8.333e-3 (pwr_config.js nis block) — gauge scales, not
     * physics; the flux behind them is this engine's own --- */
    var pFrac = (ts.power_pct !== undefined ? ts.power_pct : 0) / 100;
    /* the SR proportional counter is DE-ENERGIZED at power (protected — the P-6 class fact);
     * this model has no operator lever, so energization derives from flux alone [derived] */
    var srOn = pFrac < 1e-3;
    put('sr_energized', srOn);
    put('sr_counts_cps', srOn ? 5.0e8 * Math.max(pFrac, 1e-9) : 0);
    put('ir_amps',       8.333e-3 * Math.max(pFrac, 1e-9));

    /* --- core uncovery: a DECLARED HEM PROXY (D4 sec 8 upheld). The homogeneous model has
     * no water level; sustained high core void is the nearest honest stand-in. Expect A/B
     * divergence here — that is the point of the proxy class. --- */
    var aCore = ts.core_void_fraction !== undefined ? ts.core_void_fraction : 0;
    put('core_uncovered_frac', clip((aCore - 0.5) / 0.5, 0, 1));

    /* --- SG levels: PWR2's REAL secondary mass through the current engine's SOURCED level
     * geometry [adopted: sg_mass_map, pwr_config.js — same Ginna 85,359 lbm nominal both
     * engines]. Wide % from the piecewise map; narrow is its 30-75 window (sg_wr_lo/hi). --- */
    if (ts.sg_mass_frac !== undefined) {
      var MAP = [[0, 0], [0.38845, 30], [0.5484, 37.65], [1.0, 59.25], [1.32929, 75], [2.45, 100]];
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
