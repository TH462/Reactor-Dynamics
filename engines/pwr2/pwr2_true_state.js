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

  declareMissing('pressurizer', 'NOT BUILT HERE BY DESIGN — #472 is rebuilding the pressurizer on ' +
    'another lane and D1 §6 warns "D3 consumes its design; must not race it". Layer 2 holds the ' +
    'seat via extraMass.',
    ['pzr_level_pct', 'pzr_mass_frac', 'pzr_heaters_shed', 'porv_open', 'porv_stuck',
     'porv_tailpipe_temp_c', 'block_valve_open', 'spray_flow_pct', 'spray_stuck',
     'subcooling_c', 'suction_subcool_c']);

  declareMissing('containment', 'pwr2_containment.js supplies pressure and temperature; spray, ' +
    'fan coolers, recombiners and hydrogen tracking are UNBUILT (their capacities are not in the ' +
    'corpus) and sump level needs a geometry map this engine does not have.',
    ['containment_sump_pct', 'ctmt_h2_pct', 'ctmt_h2_burned', 'ctmt_spray_demand',
     'ctmt_spray_active', 'ctmt_fan_demand', 'ctmt_fan_safety', 'ctmt_fan_active',
     'ctmt_recomb_demand', 'ctmt_recomb_active']);

  /* ⚠ THE PROTECTION BLOCK SPLIT WHEN pwr2_protection.js LANDED, and the split is the useful
   * part. It used to be one entry reading "PWR2 has NO PROTECTION LAYER" — true when written,
   * false the moment the RPS existed, and it would have gone on telling consumers there was no
   * model for `scrammed` while a real sourced one answered. `scrammed` is now supplied. The
   * remaining seven were never really "no protection layer": each is blocked by its OWN missing
   * system, and lumping them under one reason hid which. */
  declareMissing('main steam isolation', 'there is no main steam isolation valve in PWR2. The ' +
    'ISOLATION SIGNAL is real — pwr2_protection.js carries the sourced low-steam-pressure and ' +
    'high-high-steam-flow functions with the table\'s lead/lag — but nothing downstream has a ' +
    'valve for it to shut, so a position would be invented.',
    ['msiv_open']);

  declareMissing('electrical', 'PWR2 has no electrical model at all: no buses, no diesels, no ' +
    'offsite supply. Both fields are the same gap, and it also keeps the sourced RCP ' +
    'undervoltage and underfrequency (57 Hz) reactor trips out of pwr2_protection.js.',
    ['station_blackout', 'ac_available']);

  declareMissing('plant mode', 'a plant MODE is a classification of temperature, pressure and ' +
    'shutdown margin against commercial mode definitions. Every input exists; the mode BANDS do ' +
    'not, and inventing them would put a made-up boundary in front of the player as though it ' +
    'were the industry one.',
    ['plant_mode', 'plant_mode_name']);

  declareMissing('load coupling detail', 'load_mode is the TURBINE load mode (follow / manual / ' +
    'disconnected), a control-layer concept with no engine state behind it; sg_imbalance_active ' +
    'is an annunciator threshold on indicated MWe against a commanded target, and PWR2 has no ' +
    'load target because nothing here commands one.',
    ['sg_imbalance_active', 'load_mode']);

  declareMissing('condenser', 'pwr2_condenser.js supplies vacuum, CW inlet temp and availability; ' +
    'there is no hotwell or condensate-pump model, so the feed-side flows stay unmapped.',
    ['condensate_flow_normalized', 'condensate_pump_running', 'fw_flow_normalized']);

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
  declareMissing('damage',
    'core uncovery needs PHASE SEPARATION, not geometry: Layer 2 is homogeneous equilibrium ' +
    'with no slip, so there is no free surface to take a level from. The compressible-volume ' +
    'machinery a level needs is issue #472, live on the workbench lane, and must not be raced.',
    ['core_uncovered_frac']);

  declareMissing('nuclear instruments', 'period and startup rate are supplied (pwr2_reactor.js, ' +
    'derived from the fission signal — no calibration needed); source/intermediate range counts ' +
    'and current stay missing because turning a neutron population into cps or amps needs a ' +
    'full-scale calibration this corpus does not give — only the TRIP setpoints are sourced.',
    ['sr_counts_cps', 'ir_amps', 'sr_energized']);

  declareMissing('auxiliary feedwater', 'pwr2_afw.js supplies flow; there is no pump curve to ' +
    'read a discharge pressure off, and no CST inventory to report running dry.',
    ['afw_blocked', 'afw_discharge_pressure_mpa']);

  declareMissing('accumulators', 'the passive injection train is not built.',
    ['accumulator_valve_open', 'accumulators_discharging', 'accumulator_flow_normalized',
     'accumulator_volume_pct', 'accumulator_pressure_mpa']);

  declareMissing('atmospheric dump', 'pwr2_relief.js builds the condenser dump and the safety ' +
    'valves; the ADVs are NOT built because their capacity is unsourced — see that file.',
    ['adv_valve_pct', 'adv_flow_normalized']);

  declareMissing('SG level geometry', 'the secondary is LUMPED by ruling, so there is no geometry ' +
    'to turn inventory into a gauge reading. sg_mass_frac IS supplied; a level percentage would ' +
    'be a fabricated linear scale.',
    ['sg_level_pct', 'sg_level_wide_pct']);

  declareMissing('RCP detail', 'Layer 4 integrates one loop momentum; per-pump cavitation is not ' +
    'modelled.', ['rcp_cavitating', 'rcp_cavitation_frac']);

  declareMissing('turbine detail', 'pwr2_turbine.js has no valve-position model — it computes the ' +
    'steam its load needs, and governor/stop valve positions belong with a trip model.',
    ['governor_valve_pct', 'stop_valve_pct']);

  declareMissing('ECCS detail', 'pwr2_eccs.js is a flow-vs-pressure curve with no pump-discharge ' +
    'head term — there is a real number to derive here, not one to invent, and it is not built.',
    ['hpi_discharge_pressure_mpa']);

  declareMissing('rate tracking', 'no Tavg rate tracker; it needs a history this layer does not ' +
    'keep.', ['tavg_rate_c_per_hr']);

  declareMissing('load coupling', 'load imbalance is a control-layer comparison between demand ' +
    'and generation, not an engine quantity.', ['load_imbalance_mwe']);

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
        pt = ctx.protection || {};
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
    put('charging_flow_actual', cv.charging_kgs);
    put('letdown_flow_actual',  cv.letdown_kgs);

    /* --- RHR --- */
    put('rhr_active',     rh.duty_kW !== undefined ? rh.duty_kW > 0 : undefined);
    put('rhr_valve_open', rh.permissive_may_open);

    /* --- break / leak --- */
    put('leak_flow', br.mdot_kgs);

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
      put('afw_pump_running', aw.total_kgs > 0);
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

    return ts;
  }

  /* coverage(ts) — what the shim supplied, what it DECLARED missing, and what is neither.
   * The third number is the one that matters: a field in no category is one nobody has thought
   * about, and it is the only failure this file can have that is not visible from the output. */
  function coverage(ts, contractFields) {
    var supplied = [], declared = [], unaccounted = [];
    contractFields.forEach(function (f) {
      if (ts[f] !== undefined) supplied.push(f);
      else if (MISSING[f]) declared.push(f);
      else unaccounted.push(f);
    });
    return { supplied: supplied, declared: declared, unaccounted: unaccounted };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.trueState = {
    MISSING: MISSING, buildTrueState: buildTrueState, coverage: coverage
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
