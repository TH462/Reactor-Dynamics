/* run_pwr2_fuel.js — Layer 5 gate: the lumped fuel node. (#479)
 *
 * WHAT THIS GATE CAN AND CANNOT PROVE, stated first because the fuel model's inputs are the least
 * sourced in the engine and a gate that hides that is worse than no gate:
 *
 *   IT CAN prove the GEOMETRY, because that is derived from two sourced numbers (rod OD, rod
 *   pitch) plus the core envelope already in pwr2_geometry.js, and the derivation is checkable
 *   three ways that do not share a route — assembly pitch against the real Westinghouse 17x17
 *   value, active height against 12 ft, and coolant volume against the geometry file's own node.
 *
 *   IT CAN prove the PROPERTY CORRELATIONS are the ones claimed, because a correlation has to
 *   reproduce anchor values at more than one temperature. cp and k are checked at 300 K and
 *   1000 K. A recalled correlation hitting four independent anchors is real evidence; a recalled
 *   SCALAR can only ever agree with itself, which is why the anchors are the check and not the
 *   constants.
 *
 *   IT CANNOT prove h_gap, k_clad, h_film or the 2.6 % direct deposition. Those are UNSOURCED —
 *   `find_source` returns zero for numeric gap conductance across 35 documents in 3 lanes — and
 *   no arrangement of checks written here can source them. What the gate does instead is pin
 *   their SENSITIVITY, so that when the evidence pass lands, the size of the correction to the
 *   fuel temperature is already known rather than discovered.
 *
 * THE CONSERVATION CHECK IS THE LOAD-BEARING ONE. The fuel node sits between fission and the
 * coolant, so an error in it silently creates or destroys energy in a plant whose whole Layer 3
 * is a conservation core. Checked at steady state AND through a transient, because those fail
 * differently: a steady-state balance passes for any model that reaches equilibrium at all.
 *
 * Run: node test/run_pwr2_fuel.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_fuel.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');

/* ⚠ THE INDEPENDENCE CLAIM EXPIRED (#517), AND THE LOADER IS WHERE IT SHOWED. This said
 * pwr2_fuel.js "depends on NOTHING else in the engine ... the harness needs no other module
 * loaded", and that held until the superheat factor gave it exactly ONE dependency: Layer 0, for
 * the sourced steam transport properties. The mutation harness evals the file into a bare root,
 * so `W` came back undefined and every film-coefficient call threw. A new cross-layer dependency
 * breaks the LOADER first, and loudly rather than silently, which is the good case. */
function loadFrom(src) {
  var root = { RD: { pwr2: {} } };
  /* Layer 0 into the SAME root, before the eval (#517). Pure functions, no state, so one
   * copy is safe to share across every mutation. */
  var wsrc = fs.readFileSync(path.join(E, 'pwr2_water.js'), 'utf8');
  new Function('RD_ROOT',
    wsrc.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)'))(root);
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.fuel;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCE, RETYPED INDEPENDENTLY of the engine's copy — the ECCS discipline.
 * ML050910161 (WCAP-16009-NP-A Rev 0, Jan 2005) Fig 3-1, "Westinghouse 17x17 Fuel Assembly
 * Lattice". The page is OCR-mangled; these are the values the metric and US columns agree on. */
var DOC = { rod_od_in: 0.374, rod_od_mm: 9.50, rod_pitch_in: 0.496, rod_pitch_mm: 12.6,
            thimble_in: 0.474, lattice: 17 };
/* WTSM 12.2 (ML11223A301) — the melt limit, used as a sanity BOUND and not as a target. */
var MELT_LIMIT_F = 4700;
/* Anchors for the recalled Fink correlations. Also recalled — they are a CONSISTENCY check on the
 * correlation's shape, not a source for it. */
var CP_300 = 235, CP_1000 = 311, K_300 = 7.6, K_1000 = 3.5;

var T_COOL = 304.5, Q_RATED = 300000;

function runSuite(F, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(54) +
      'got ' + got.toFixed(3) + ' want ' + want.toFixed(3) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  /* ---- CONSTRUCTION, WRITTEN FIRST (D1 §31) ---------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  /* VARY ONE AT A TIME. The first version passed both a count AND an envelope, so ignoring the
   * envelope entirely still reddened the check via the count — the gate was blind to it and the
   * injection self-test said so. Two separate fixtures, each moving exactly one argument. */
  ck('caller assembly count reaches the geometry',
     F.deriveGeometry({ n_assemblies: 40 }).n_assemblies, 40, 1e-12, '');
  ckT('caller envelope reaches the geometry — ALONE, count left at its default',
      Math.abs(F.deriveGeometry({ envelope_m3: 7.0 }).H_m - F.deriveGeometry().H_m) > 1e-6,
      'envelope is the only argument moved, so nothing else can redden this');
  var fCustom = F.createFuel({ T_fuel_c: 123.5, rated_thermal_kW: 4242 });
  ck('caller initial fuel temperature reaches the plant', fCustom.T_fuel_c, 123.5, 1e-12, 'degC');
  ck('caller rated power reaches the plant', fCustom.rated_thermal_kW, 4242, 1e-12, 'kW');

  /* ---- GEOMETRY, DERIVED FROM THE SOURCED LATTICE ----------------------------------------- */
  head('GEOMETRY  [derived from two sourced numbers plus the core envelope]');
  var g = F.deriveGeometry();
  ck('rod OD matches the source', F.GEOM.rod_od_in, DOC.rod_od_in, 1e-12, 'in');
  ck('rod pitch matches the source', F.GEOM.rod_pitch_in, DOC.rod_pitch_in, 1e-12, 'in');
  ck('rod OD metric and US columns agree', F.GEOM.rod_od_in * 25.4, DOC.rod_od_mm, 0.01, 'mm');
  ck('rod pitch metric and US columns agree', F.GEOM.rod_pitch_in * 25.4, DOC.rod_pitch_mm,
     0.05, 'mm');
  ck('pellet is the rod less twice the clad and gap', g.pellet_in,
     DOC.rod_od_in - 2 * (F.SPLIT.clad_t_in + F.SPLIT.gap_t_in), 1e-12, 'in');
  ck('264 fuel rods per assembly (289 lattice less 24 thimbles and 1 instrument)',
     g.n_rod_per_assy, 264, 1e-12, '');
  ck('assembly pitch is 17 rod pitches', g.assy_pitch_in, DOC.lattice * DOC.rod_pitch_in,
     1e-9, 'in');
  ckT('assembly pitch lands just SHORT of the real 17x17 8.466 in, by a water gap',
      g.assy_pitch_in < 8.466 && g.assy_pitch_in > 8.40,
      'lattice-only arithmetic omits the inter-assembly gap: ' +
      (8.466 - g.assy_pitch_in).toFixed(3) + ' in short, right sign and size');
  ck('active height derives to 12 ft', g.H_ft, 12.0, 0.15, 'ft');
  /* M_fuel COMPUTED INDEPENDENTLY HERE, from retyped constants, rather than range-checked. The
   * range check ("9-14 t") was blind to UO2 at theoretical density instead of 95 % — a 5.3 % mass
   * error that sat comfortably inside it. A band wide enough to be safe is wide enough to be
   * useless; the gate has to know what the number should BE. */
  var RHO_RETYPED = 10410;      /* 95 % of 10 960 theoretical */
  var pelletM = (DOC.rod_od_in - 2 * (F.SPLIT.clad_t_in + F.SPLIT.gap_t_in)) * 0.0254;
  var hM = (3.53 / 21) / Math.pow(DOC.lattice * DOC.rod_pitch_in * 0.0254, 2);
  var expectM = Math.PI / 4 * pelletM * pelletM * hM * 264 * 21 * RHO_RETYPED;
  ck('fuel mass matches an independent computation from the retyped lattice',
     g.M_fuel_kg, expectM, 1.0, 'kg');
  ck('UO2 density is 95 % of theoretical, not theoretical', F.RHO_UO2, RHO_RETYPED, 1e-9, 'kg/m3');
  ckT('fuel loading is plant-sized and BELOW a real 17x17 per assembly',
      (g.M_fuel_kg * 0.8815 / 1000) / g.n_assemblies < 0.53,
      (g.M_fuel_kg / 1000).toFixed(2) + ' t UO2 = ' + (g.M_fuel_kg * 0.8815 / 1000).toFixed(2) +
      ' MTU, ' + ((g.M_fuel_kg * 0.8815 / 1000) / g.n_assemblies).toFixed(3) +
      ' MTU/assy vs ~0.53 real — low, as the 95 % density predicts');

  /* ---- PROPERTIES: the anchors are the check, not the constants ---------------------------- */
  head('PROPERTIES  [a correlation must hit anchors at more than one temperature]');
  ck('UO2 cp at 300 K', F.cp_uo2(300), CP_300, 4, 'J/kgK');
  ck('UO2 cp at 1000 K', F.cp_uo2(1000), CP_1000, 4, 'J/kgK');
  ck('UO2 k at 300 K', F.k_uo2(300), K_300, 0.3, 'W/mK');
  ck('UO2 k at 1000 K', F.k_uo2(1000), K_1000, 0.15, 'W/mK');
  ckT('cp RISES with temperature and k FALLS — opposite signs, and both matter',
      F.cp_uo2(1000) > F.cp_uo2(300) && F.k_uo2(1000) < F.k_uo2(300),
      'a constant stand-in for either would pass a single-point check and fail this');

  /* ---- THE RESISTANCE STACK ---------------------------------------------------------------- */
  head('RESISTANCE  [the volume-average form, which is the easy thing to get wrong]');
  var c = F.conductance(g, 966);
  ck('the four fractions sum to one',
     c.frac_pellet + c.frac_gap + c.frac_clad + c.frac_film, 1.0, 1e-12, '');
  ck('pellet term is the VOLUME-AVERAGE form 1/(8*pi*k), not centerline 1/(4*pi*k)',
     c.r_pellet, 1 / (8 * Math.PI * F.k_uo2(966)), 1e-12, 'mK/W');
  /* THE STACK IS PELLET-AND-GAP, and which of the two leads MOVED when h_gap was solved against
   * the sourced Doppler defect (D1 section 35): pellet 54.7 / gap 35.4 became pellet 42.1 / gap
   * 48.9. A gap-led stack is what fresh fuel with an OPEN gap looks like, and beginning-of-life is
   * the condition the 975 ppm critical-boron anchor is measured at too, so the two are consistent.
   * The check therefore asserts what is structural -- those two terms carry the stack and the
   * metal terms do not -- rather than which of them happens to lead today. */
  ckT('pellet and gap carry the stack; clad and film are minor',
      c.frac_pellet + c.frac_gap > 0.85 && c.frac_pellet > 0.3 && c.frac_gap > 0.3 &&
      c.frac_clad < 0.12 && c.frac_film < 0.12,
      (c.frac_pellet * 100).toFixed(1) + ' % pellet, ' + (c.frac_gap * 100).toFixed(1) +
      ' % gap, ' + (c.frac_clad * 100).toFixed(1) + ' % clad, ' + (c.frac_film * 100).toFixed(1) + ' % film');
  ckT('every term is present and positive',
      c.r_pellet > 0 && c.r_gap > 0 && c.r_clad > 0 && c.r_film > 0, '');
  ckT('conductance FALLS as fuel heats (k_UO2 falls with temperature)',
      F.conductance(g, 1400).UA_W_per_K < F.conductance(g, 600).UA_W_per_K,
      'so the fuel rise is superlinear in power — a constant-k model would miss it');

  /* ---- THE CLAD NODE AND THE REGIME FILM COEFFICIENT (added 2026-08-17) -------------------
   * Until today the clad was a pure RESISTANCE with no temperature, and the film coefficient was
   * a constant. This file's own OPEN block named the consequence: "the fuel rise does not grow
   * when flow is lost, so this model UNDERSTATES fuel heatup on a loss of forced circulation."
   * Measured downstream of that: the cladding sat 1 degC above the coolant for an entire
   * blowdown, so core damage could not be modelled on top of it at all (D4 section 36). */
  head('CLAD NODE  [it was a resistance with no temperature, and no heat-up was possible]');
  /* THE NEUTRALITY CLAIM, WHICH IS WHAT LETS THIS BE ADDED AT ALL. The gap conductance is SOLVED
   * against a sourced Doppler defect; if the stack moved, that solve would have to be re-opened.
   * Two checks, because there are two ways it could move: the coefficient at rated, and the
   * split of the stack. */
  ck('the film coefficient at RATED is exactly its anchor -- the regime factors are 1 there',
     F.filmCoefficient(1, 0), F.OPEN.h_film.value, 0, 'W/m2K');
  var cSplit = F.conductance(g, 966);
  ck('splitting the stack at the clad changes the SERIES total by nothing',
     cSplit.r_fc + cSplit.r_cw, cSplit.r_total, 1e-15, 'mK/W');
  ckT('...and half the clad conduction lands on each side of the node',
      Math.abs(cSplit.r_fc - (cSplit.r_pellet + cSplit.r_gap + cSplit.r_clad / 2)) < 1e-15 &&
      Math.abs(cSplit.r_cw - (cSplit.r_clad / 2 + cSplit.r_film)) < 1e-15,
      'the standard thin-shell lumping; the choice is free at steady state because they sum');

  /* THE COEFFICIENT MUST ACTUALLY MOVE, and in the right direction, or it is a constant wearing
   * a function name -- the flag-asserted-at-one-point-only trap. */
  ckT('losing flow collapses the film coefficient, monotonically',
      F.filmCoefficient(0.5, 0) < F.filmCoefficient(1, 0) &&
      F.filmCoefficient(0.1, 0) < F.filmCoefficient(0.5, 0) &&
      F.filmCoefficient(0.01, 0) < F.filmCoefficient(0.1, 0),
      F.filmCoefficient(1, 0).toFixed(0) + ' -> ' + F.filmCoefficient(0.5, 0).toFixed(0) + ' -> ' +
      F.filmCoefficient(0.1, 0).toFixed(0) + ' -> ' + F.filmCoefficient(0.01, 0).toFixed(0) +
      ' W/m2K at flow 1 / 0.5 / 0.1 / 0.01');
  ckT('...and voiding it lowers it too, at the same mass flux',
      F.filmCoefficient(1, 1) < F.filmCoefficient(1, 0),
      F.filmCoefficient(1, 1).toFixed(0) + ' W/m2K on pure vapour against ' +
      F.filmCoefficient(1, 0).toFixed(0) + ' on liquid');
  /* THE FLOOR. Without it h -> 0 at zero flow and the rod temperature is INFINITE, which is not
   * physics, it is a missing regime. A rod in stagnant gas still loses heat by natural
   * convection. */
  ck('a stagnant, voided core floors at the natural-convection value, not at zero',
     F.filmCoefficient(0, 1), F.OPEN.h_stagnant.value, 1e-12, 'W/m2K');
  /* vapor_ratio IS NOW DERIVED FROM SOURCED DATA (audit #488 D12 refuted the "corpus has
   * neither" claim), and the derivation is pinned here with the source's own rows: WCAP-16009
   * Table 10-3, read from the page image. The Dittus-Boelter property group evaluated on
   * those rows brackets the constant -- move the constant outside the sourced band, or break
   * the group's exponents, and this reds. */
  function dbGroup(kf, kg, cf, cg, mf, mg) {
    return Math.pow(kg / kf, 0.6) * Math.pow(cg / cf, 0.4) * Math.pow(mg / mf, -0.4);
  }
  var vrLo = dbGroup(0.36401, 0.02841, 1.13990, 0.85307, 0.26501, 0.04183);   /* 502 psia */
  var vrMid = dbGroup(0.32846, 0.03684, 1.30120, 1.26690, 0.21846, 0.04636);  /* 1050 psia */
  var vrHi = dbGroup(0.31134, 0.04174, 1.41290, 1.54050, 0.20318, 0.04837);   /* 1334 psia */
  ck('the sourced property group at 1050 psia (WCAP-16009 Table 10-3)', vrMid, 0.495, 0.002, '-');
  ckT('vapor_ratio sits inside the sourced band over the blowdown regime',
      F.OPEN.vapor_ratio.value >= vrLo && F.OPEN.vapor_ratio.value <= vrHi,
      F.OPEN.vapor_ratio.value + ' against ' + vrLo.toFixed(3) + '..' + vrHi.toFixed(3) +
      ' (502..1334 psia) -- a constant outside what its own source brackets is recall again');

  /* THE CLAD IS A BODY WITH A MASS, and the mass is what makes the oxidation history right --
   * Baker-Just is an exponential in temperature INTEGRATED OVER TIME, so a clad that steps
   * instantly when cooling is lost gives a badly wrong answer. */
  var claddM = Math.PI * (Math.pow(DOC.rod_od_in * 0.0254 / 2, 2) -
      Math.pow((DOC.rod_od_in - 2 * F.SPLIT.clad_t_in) * 0.0254 / 2, 2)) *
      g.rod_length_total_m * F.RHO_ZR;
  ck('clad mass falls out of the same sourced lattice as the fuel', g.M_clad_kg, claddM, 1.0, 'kg');
  /* THE CROSS-CHECK IS AGAINST A SOURCE THIS MODEL WAS NOT BUILT FROM. GEND-061 (TMI-2 hydrogen
   * burn report) section 4.3: "The TMI-2 reactor core contains a calculated 23,600 kg (52,000 lb)
   * of zirconium" at 2772 MWt. Power-scaled to this 300 MWt plant that is 2554 kg. The
   * lattice-derived figure here is CLAD ONLY and must therefore land BELOW it -- a whole-core
   * zirconium figure includes guide thimbles and spacer grids, which this arithmetic cannot see.
   * Landing above or equal would mean the clad alone accounts for all the core zirconium. */
  var zrScaled = 23600 * 300 / 2772;
  ckT('...and lands BELOW GEND-061 whole-core zirconium scaled on power, by a thimble-grid gap',
      g.M_clad_kg < zrScaled * 0.92 && g.M_clad_kg > zrScaled * 0.75,
      g.M_clad_kg.toFixed(0) + ' kg clad-only against ' + zrScaled.toFixed(0) +
      ' kg whole-core scaled from TMI-2 = ' + (100 * g.M_clad_kg / zrScaled).toFixed(1) +
      ' % -- the balance is thimbles and grids, which a clad calculation cannot include');

  /* THE TWO TIME CONSTANTS DIFFER BY ~50x, and that separation is the physical content: the fuel
   * is slow because it is heavy, the clad is fast because it is thin. */
  var fClad = F.createFuel({ T_fuel_c: T_COOL, T_clad_c: T_COOL });
  var rClad = F.stepFuel(fClad, 0.02,
    { Q_core_kW: Q_RATED, coolTemp_c: T_COOL, flowFrac: 1, voidFrac: 0 });
  ckT('the clad time constant is far SHORTER than the fuel one, as a thin shell must be',
      rClad.tau_clad_s > 0 && rClad.tau_clad_s < rClad.tau_s / 10,
      rClad.tau_clad_s.toFixed(4) + ' s clad against ' + rClad.tau_s.toFixed(2) + ' s fuel');
  /* ⚠ AND THE CLAD MUST LAG, WHICH ONLY A TRANSIENT CAN SHOW. Every other check in this section
   * reads a SETTLED state, where the clad sits at its equilibrium by definition — so a model
   * that slams it straight there each step satisfies all of them, and the injection self-test
   * found exactly that blind spot. The lag is not cosmetic: it is the whole reason the clad is a
   * node, because Baker-Just integrates an exponential in temperature over time and a step
   * change gives a badly wrong oxidation history.
   *
   * ⚠ THE FIXTURE HAS TO START THE FUEL HOT. Written with BOTH nodes at the coolant temperature
   * it measured 0.1 % of the gap closed and looked like a failure — correctly, because with cold
   * fuel there is no temperature difference across the gap and so no heat reaching the clad yet.
   * That measures the fuel's time constant, not the clad's. Fuel at its steady value and clad
   * cold isolates the one being tested. */
  var fLag = F.createFuel({ T_fuel_c: F.steadyFuelTemp(g, Q_RATED, T_COOL), T_clad_c: T_COOL });
  var cladEq = F.steadyCladTemp(g, Q_RATED, T_COOL);
  var rLag1 = F.stepFuel(fLag, 0.02,
    { Q_core_kW: Q_RATED, coolTemp_c: T_COOL, flowFrac: 1, voidFrac: 0 });
  var covered = (rLag1.T_clad_c - T_COOL) / (cladEq - T_COOL);
  ckT('the clad LAGS -- one step covers PART of the gap, and a slaved clad would cover all of it',
      rLag1.T_clad_c > T_COOL && covered < 0.9,
      'one 0.02 s step closed ' + (covered * 100).toFixed(1) + ' % of the way to ' +
      cladEq.toFixed(1) + ' degC; a clad slaved to equilibrium closes 100 % on step one');
  var fLag2 = F.createFuel({ T_fuel_c: F.steadyFuelTemp(g, Q_RATED, T_COOL), T_clad_c: T_COOL });
  var rLagN = null;
  for (i = 0; i < 500; i++) {
    rLagN = F.stepFuel(fLag2, 0.02,
      { Q_core_kW: Q_RATED, coolTemp_c: T_COOL, flowFrac: 1, voidFrac: 0 });
  }
  ck('...and it CONVERGES to that equilibrium, so the lag is a delay and not an offset',
     rLagN.T_clad_c, cladEq, 1.0, 'degC');
  ckT('...and it is SHORT against the house timestep, which is why the advance is not Euler',
      rClad.tau_clad_s < 0.2,
      rClad.tau_clad_s.toFixed(4) + ' s against dt = 0.02 -- a ratio of ' +
      (rClad.tau_clad_s / 0.02).toFixed(1) + ', where explicit Euler is stable but inaccurate');

  /* THE POINT OF ALL OF IT: the cladding must RUN AWAY when cooling stops. Same power, same
   * coolant, one difference. */
  /* #517: at void 1 the layer REFUSES an unstated superheat. These fixtures are SATURATED-steam
   * fixtures — that is the state they were written against and the state their numbers were
   * measured in — so they say so explicitly. `superheat_c: 0` makes the new factor exactly 1 by
   * construction, so every expectation below is the one it was before the wing existed; the
   * superheat factor gets its OWN checks rather than perturbing these. */
  function settleClad(flowFrac, voidFrac, Q) {
    var fx = F.createFuel({ T_fuel_c: T_COOL, T_clad_c: T_COOL }), rx = null;
    for (var n = 0; n < 20000; n++) {
      rx = F.stepFuel(fx, 0.02,
        { Q_core_kW: Q, coolTemp_c: T_COOL, flowFrac: flowFrac, voidFrac: voidFrac,
          superheat_c: 0, P_MPa: 15.41 });
    }
    return rx;
  }
  var cooled = settleClad(1, 0, Q_RATED * 0.03);          /* decay heat, rods cooled */
  var dry    = settleClad(0, 1, Q_RATED * 0.03);          /* decay heat, stagnant and voided */
  ckT('at the SAME decay power, a stagnant voided core runs the clad hundreds of degrees hotter',
      dry.T_clad_c > cooled.T_clad_c + 300,
      cooled.T_clad_c.toFixed(1) + ' degC cooled -> ' + dry.T_clad_c.toFixed(1) +
      ' degC stagnant (' + dry.T_clad_f.toFixed(0) + ' degF) at 3 % of rated');
  ckT('...and the clad sits ABOVE the coolant and BELOW the fuel, both ways',
      cooled.T_clad_c > T_COOL && cooled.T_clad_c < cooled.T_fuel_c &&
      dry.T_clad_c > T_COOL && dry.T_clad_c < dry.T_fuel_c, '');

  /* OXIDATION HEAT: the hook the damage model will use. It must warm the clad AND reach the
   * coolant -- heat that vanishes into a node is the defect the conservation section exists for,
   * and a new heat SOURCE is the easiest way to introduce it. */
  var fOx = F.createFuel({ T_fuel_c: T_COOL, T_clad_c: T_COOL }), rOx = null, rNo = null;
  var fNo = F.createFuel({ T_fuel_c: T_COOL, T_clad_c: T_COOL });
  for (i = 0; i < 5000; i++) {
    rOx = F.stepFuel(fOx, 0.02, { Q_core_kW: Q_RATED * 0.03, coolTemp_c: T_COOL,
                                  flowFrac: 0.02, voidFrac: 1, Q_ox_kW: 5000,
                                  superheat_c: 0, P_MPa: 15.41 });
    rNo = F.stepFuel(fNo, 0.02, { Q_core_kW: Q_RATED * 0.03, coolTemp_c: T_COOL,
                                  flowFrac: 0.02, voidFrac: 1,
                                  superheat_c: 0, P_MPa: 15.41 });
  }
  /* ⚠ ASSERTED AS AN IDENTITY, AND THE FIRST VERSION ASSERTED A GUESS. It asked for "more than
   * 50 degC" of extra clad temperature from 5 MW of reaction heat and measured 12.7. The model
   * was right and the expectation was invented: at this regime UA_cw is 397 kW/K, so 5000 kW can
   * only ever be 12.6 degC. Widening 50 down to 10 would have replaced one guess with another.
   * The rise Q_ox produces is EXACTLY Q_ox/UA_cw, which is checkable and cannot be fitted. */
  ckT('oxidation heat raises the clad, and by exactly Q_ox / UA_cw',
      rOx.T_clad_c > rNo.T_clad_c &&
      Math.abs((rOx.T_clad_c - rNo.T_clad_c) - 5000 / rNo.UA_cw_kW_per_K) < 0.5,
      rNo.T_clad_c.toFixed(1) + ' -> ' + rOx.T_clad_c.toFixed(1) + ' degC, a rise of ' +
      (rOx.T_clad_c - rNo.T_clad_c).toFixed(2) + ' against 5000/' +
      rNo.UA_cw_kW_per_K.toFixed(1) + ' = ' + (5000 / rNo.UA_cw_kW_per_K).toFixed(2) + ' degC');
  ck('...and ALL of it reaches the coolant at steady state -- none is destroyed',
     rOx.heats.core - rNo.heats.core, 5000, 5.0, 'kW');
  ckT('...and it is zero when not supplied, rather than assumed', rNo.Q_ox_kW === 0, '');

  /* ---- THE SUPERHEAT FACTOR (#517) ---------------------------------------------------------- */
  head('SUPERHEAT  [voidFrac clips at 1 — above h_g this factor is the only thing that moves]');
  ckT('the factor is EXACTLY 1 at zero superheat, so vapor_ratio keeps its landed calibration',
      F.superheatFactor(0, 1.5) === 1 && F.superheatFactor(-40, 1.5) === 1 &&
      F.superheatFactor(undefined, 1.5) === 1,
      'a second factor that is not 1 at the boundary would be a silent re-tune of the first');
  ckT('...and the film coefficient at zero superheat is bit-identical to the pre-wing form',
      F.filmCoefficient(0.01, 1, 0, 1.5) ===
        30000 * Math.pow(0.01, 0.8) * ((1 - 1) + 1 * 0.5),
      F.filmCoefficient(0.01, 1, 0, 1.5).toFixed(4) + ' W/m2K');
  ckT('a LIQUID core is untouched by it — the phase term still zeroes the whole vapour branch',
      F.filmCoefficient(1, 0, 0, 15.41) === 30000 &&
      F.filmCoefficient(1, 0, 400, 15.41) === 30000,
      'void 0 with 400 degC of nominal superheat is not a state, and must not move the answer');
  /* ⚠ THE MAGNITUDE IS THE CLAIM, NOT THE DIRECTION. A check that only asserted "superheat
   * changes the film coefficient" would pass a fabricated factor of 3. Measured across the
   * pressures this plant actually superheats at, the honest sourced group moves it under 10 % —
   * so the band is the assertion, and it is what a made-up degradation would red against. */
  var shRows = [[54, 248], [133, 183], [226, 128], [377, 88]];   /* psia, degC — the measured ride */
  var shOk = true, shNote = [];
  shRows.forEach(function (r) {
    var P = r[0] / 145.038, fac = F.superheatFactor(r[1], P);
    if (!(fac > 0.90 && fac < 1.10)) shOk = false;
    shNote.push(r[0] + 'psia/+' + r[1] + 'C:' + fac.toFixed(3));
  });
  ckT('across the MEASURED superheat regime the factor stays inside 0.90-1.10',
      shOk, shNote.join(' '));
  ckT('...so it does NOT explain a cool clad on a dry core — under 10 % against the flow term, ' +
      'orders of magnitude',
      Math.abs(F.filmCoefficient(0.0074, 1, 131, 226 / 145.038) /
               F.filmCoefficient(0.0074, 1, 0, 226 / 145.038) - 1) < 0.10 &&
      F.filmCoefficient(1, 1, 0, 15.41) / F.filmCoefficient(0.0074, 1, 0, 15.41) > 50,
      'superheat ' +
      ((F.filmCoefficient(0.0074, 1, 131, 226 / 145.038) /
        F.filmCoefficient(0.0074, 1, 0, 226 / 145.038) - 1) * 100).toFixed(1) +
      ' % against the flow term at ' +
      (F.filmCoefficient(1, 1, 0, 15.41) / F.filmCoefficient(0.0074, 1, 0, 15.41)).toFixed(0) +
      'x — the collapse is the loop stopping, not the steam drying (§83 gap 1, #472)');
  /* The HIGH-pressure penalty is real and is why the term is not simply deleted as negligible:
   * it is small only in the regime this plant reaches, which is a measurement, not a property
   * of the mechanism. If a future change lets a core superheat at pressure, this is live. */
  ckT('at 2235 psia the same superheat costs far more — small HERE is not small everywhere',
      F.superheatFactor(130, 15.41) < 0.7,
      F.superheatFactor(130, 15.41).toFixed(3) + ' at 2235 psia vs ' +
      F.superheatFactor(130, 226 / 145.038).toFixed(3) + ' at 226 psia');
  /* ---- THE CAP, WHICH IS THE SOURCED HALF -----------------------------------------------------
   * The raw Dittus-Boelter group goes ABOVE 1 at high superheat and low pressure — correct
   * arithmetic for fully-developed turbulent single-phase flow, and the wrong answer on a dry
   * core. WCAP-16009-NP-A B-2-9-2, on the ORNL dryout tests: "Despite increased mixture velocity,
   * low flowrates, increasing void fraction, and superheating of vapor decreases heat transfer."
   * MEASURED consequence of leaving it uncapped, 20 cm2 damage ride at 698 degC of superheat:
   * peak clad 27,337 -> 2,416 degF and oxidation 100 % -> 24 %. An observability term had made
   * core damage harder to reach. This is the check that stops that coming back. */
  ckT('the factor NEVER exceeds 1 — superheat may degrade cooling, never improve it (sourced)',
      [[54, 698], [54, 400], [15, 500], [133, 250], [226, 131], [2235, 130]]
        .every(function (r) { return F.superheatFactor(r[1], r[0] / 145.038) <= 1; }),
      'raw group at 54 psia / +698 degC would read ' +
      (globalThis.RD && globalThis.RD.pwr2 && globalThis.RD.pwr2.water
        ? (globalThis.RD.pwr2.water.vaporFilmGroup(
             globalThis.RD.pwr2.water.T_sat(54 / 145.038) + 698, 54 / 145.038) /
           globalThis.RD.pwr2.water.vaporFilmGroup(
             globalThis.RD.pwr2.water.T_sat(54 / 145.038), 54 / 145.038)).toFixed(2)
        : '?') + ' — capped to 1.00');
  ckT('...and the cap BINDS on the damage ride regime, so it is not a decorative guard',
      F.superheatFactor(698, 54 / 145.038) === 1 && F.superheatFactor(130, 15.41) < 1,
      'binds at 698 degC / 54 psia, does not bind at 130 degC / 2235 psia — both live');
  /* THE REFUSAL. The layer will not invent "the steam is saturated" — same idiom as the two
   * throws above it, applied exactly where superheat can exist and nowhere else. */
  var threwDry = false, threwWet = false;
  try {
    F.stepFuel(F.createFuel({ T_fuel_c: T_COOL }), 0.02,
      { Q_core_kW: Q_RATED * 0.03, coolTemp_c: T_COOL, flowFrac: 0.01, voidFrac: 1 });
  } catch (e) { threwDry = /superheat_c/.test(e.message); }
  try {
    F.stepFuel(F.createFuel({ T_fuel_c: T_COOL }), 0.02,
      { Q_core_kW: Q_RATED * 0.03, coolTemp_c: T_COOL, flowFrac: 0.01, voidFrac: 0.99 });
  } catch (e) { threwWet = true; }
  ckT('at void 1 an unstated superheat is REFUSED, and below it no fixture is burdened',
      threwDry && !threwWet,
      'void 1 throws, void 0.99 does not — superheat is 0 by definition below h_g');

  /* ---- CONSERVATION: the load-bearing check ------------------------------------------------ */
  head('CONSERVATION  [an error here creates energy inside a conservation core]');
  var f = F.createFuel({ T_fuel_c: T_COOL });
  var r = null, i;
  for (i = 0; i < 4000; i++) r = F.stepFuel(f, 0.02, { Q_core_kW: Q_RATED, coolTemp_c: T_COOL, flowFrac: 1, voidFrac: 0 });
  /* TOLERANCE 1e-3 kW = 1 W out of 300 MW, 3e-9 relative. It is NOT slack for a modelling error:
   * MEASURED, the residual here is the CONVERGENCE remainder of the exponential approach — after
   * 4 000 steps (24.5 tau) it is -1.3e-4 kW and by 44 000 steps it is exactly 0.0. The first
   * version of this check asked for 1e-6 and failed on that remainder, which is a test writing its
   * tolerance tighter than the horizon it budgeted. A mutation that genuinely breaks conservation
   * misses by ~15 000 kW, so the tolerance costs nothing in detection. */
  ck('at steady state, heat into the coolant equals heat out of the core',
     r.heats.core, Q_RATED, 1.0, 'kW');
  ckT('the direct-deposition split is real, not cosmetic',
      r.Q_direct_kW > 0 && Math.abs(r.Q_direct_kW + r.Q_through_gap_kW - Q_RATED) < 1.0,
      (r.Q_direct_kW / 1000).toFixed(1) + ' MW bypasses the gap and reaches the moderator直接'
        .replace('直接', ' directly'));
  /* THROUGH A TRANSIENT, which fails differently: a steady-state balance passes for any model
   * that reaches equilibrium at all, however wrong the path there was. */
  /* STORED ENERGY ACCUMULATED STEP BY STEP, not estimated from the endpoints.
   *
   * The first version took `stored = dT_total * M * cp(T_final)`, which uses the FINAL cp for the
   * whole excursion. cp rises ~15 % from 305 to 582 degC, so that estimate carried a 0.357 %
   * residual of its own — and a 1 % band around it was wide enough to hide a mutant that computed
   * the coolant heat from UA*(T_f - T_cool) instead of the fuel's energy change. The gate was
   * blind to a genuine conservation break because MY reference calculation was the sloppy one.
   *
   * Summing C_i * dT_i per step, with cp reported by the model at each step, the clean residual
   * falls to roundoff and the band can close to 0.01 %. */
  /* ⚠ THERE ARE TWO NODES NOW, AND THE CLAD'S STORAGE IS NOT OPTIONAL IN THIS SUM. Written for
   * the fuel alone it reads a 0.292 % residual on a correct model — the clad's own heat capacity,
   * mistaken for a conservation break. Its capacity is ~1/50th of the fuel's, which is exactly
   * small enough to look like a tolerance problem and be waved through by widening the band. */
  var f2 = F.createFuel({ T_fuel_c: T_COOL }), inKJ = 0, outKJ = 0, storedKJ = 0, r2, tPrev, cPrev;
  var Cclad_kJ = g.M_clad_kg * F.CP_ZR / 1000;
  for (i = 0; i < 1000; i++) {
    tPrev = f2.T_fuel_c; cPrev = f2.T_clad_c;
    r2 = F.stepFuel(f2, 0.02, { Q_core_kW: Q_RATED, coolTemp_c: T_COOL, flowFrac: 1, voidFrac: 0 });
    inKJ += Q_RATED * 0.02;
    outKJ += r2.heats.core * 0.02;
    storedKJ += g.M_fuel_kg * r2.cp_J_per_kgK / 1000 * (f2.T_fuel_c - tPrev)
              + Cclad_kJ * (f2.T_clad_c - cPrev);
  }
  var resid = Math.abs(inKJ - outKJ - storedKJ) / inKJ;
  ckT('through a HEATUP transient, in = out + stored to better than 0.01 %', resid < 1e-4,
      'in ' + (inKJ / 1000).toFixed(0) + ' MJ, out ' + (outKJ / 1000).toFixed(0) +
      ' MJ, stored ' + (storedKJ / 1000).toFixed(0) + ' MJ, residual ' +
      (resid * 100).toExponential(2) + ' %');
  ckT('the fuel node ABSORBS energy while heating (out < in during the transient)',
      outKJ < inKJ, 'a model that passes heat straight through has no time constant');

  /* ---- THE ANALYTIC ADVANCE ---------------------------------------------------------------- */
  head('INTEGRATION  [analytic, so stability cannot depend on a caller timestep]');
  var tau = r.tau_s;
  ckT('the time constant is physical', tau > 1 && tau < 10, tau.toFixed(2) + ' s');
  /* dt = 30 tau. Explicit Euler at this dt returns T_eq + (T-T_eq)*(1-30) — a 29x overshoot with
   * the wrong sign, growing every step. The analytic form cannot overshoot at ANY dt. */
  var fBig = F.createFuel({ T_fuel_c: T_COOL });
  var rBig = F.stepFuel(fBig, 30 * tau, { Q_core_kW: Q_RATED, coolTemp_c: T_COOL, flowFrac: 1, voidFrac: 0 });
  ckT('one step of 30 tau lands ON equilibrium rather than overshooting',
      rBig.T_fuel_c > T_COOL && rBig.T_fuel_c < T_COOL + 400 && isFinite(rBig.T_fuel_c),
      'explicit Euler here overshoots by 29x with the wrong sign and diverges; got ' +
      rBig.T_fuel_c.toFixed(1) + ' degC');
  ckT('a zero-length step changes nothing',
      Math.abs(F.stepFuel(F.createFuel({ T_fuel_c: 500 }), 0,
        { Q_core_kW: Q_RATED, coolTemp_c: T_COOL, flowFrac: 1, voidFrac: 0 }).T_fuel_c - 500) < 1e-12, '');
  ck('the direct steady solve agrees with integrating to convergence',
     F.steadyFuelTemp(g, Q_RATED, T_COOL), r.T_fuel_c, 0.5, 'degC');

  /* ---- THE STEADY STATE, REPORTED AGAINST ITS COMPARISON POINTS ---------------------------- */
  head('STEADY STATE  [reported against comparison points, NOT fitted to them]');
  ckT('fuel sits above coolant, surface between them, centerline above all',
      r.T_fuel_c > T_COOL && r.T_surface_c > T_COOL && r.T_centerline_c > r.T_surface_c &&
      r.T_centerline_c > r.T_fuel_c, '');
  /* THE UNIFORM-GENERATION IDENTITY, and it is what tells 4*pi from 8*pi. For a cylinder with
   * uniform heat generation, T_centre - T_surface = q'/(4 pi k) while T_average - T_surface =
   * q'/(8 pi k) — so the centre rise is EXACTLY TWICE the average rise, whatever k, q' or the
   * geometry are. The gate was blind to the centerline being computed with the average's own
   * coefficient because nothing checked its VALUE, only that it was the largest of three. */
  ckT('centre rise is exactly twice the average rise (uniform generation)',
      Math.abs((r.T_centerline_c - r.T_surface_c) / (r.T_fuel_c - r.T_surface_c) - 2) < 1e-6,
      'ratio ' + ((r.T_centerline_c - r.T_surface_c) / (r.T_fuel_c - r.T_surface_c)).toFixed(6) +
      ' — an identity, so it holds independently of every unsourced constant in the stack');
  ckT('centerline is comfortably below the WTSM melt limit',
      r.T_centerline_f < MELT_LIMIT_F * 0.6,
      r.T_centerline_f.toFixed(0) + ' F against a ' + MELT_LIMIT_F + ' F limit');
  ckT('linear heat rate is below a real 17x17 at full power',
      r.linear_heat_W_per_m / 1000 < 18.3 && r.linear_heat_W_per_m / 1000 > 10,
      (r.linear_heat_W_per_m / 1000).toFixed(2) + ' kW/m vs ~18.3 — this plant is less power-dense');
  ckT('the fuel rise agrees with the first engine, reached from sourced inputs',
      r.T_fuel_rise_c > 350 && r.T_fuel_rise_c < 420,
      r.T_fuel_rise_c.toFixed(1) + ' degC (' + (r.T_fuel_rise_c * 9 / 5).toFixed(0) +
      ' degF) against the first engine 389 degC / 700 degF — 2.4 % apart, and reached by a ' +
      'COMPLETELY different route: theirs from two [tune] constants, ours from sourced rod ' +
      'geometry and a gap conductance solved against a sourced Doppler defect (D1 section 35)');

  /* ⚠ THIS CHECK WAS RE-POINTED, NOT RE-BANDED, AND THE DISTINCTION MATTERS.
   *
   * It used to assert that the derived reference DISAGREED with kinetics' default — pinning a real
   * defect: kinetics carried 693 inherited from the first engine while this model derived 582, so
   * constructing kinetics with its default injected ~278 pcm of spurious Doppler at full power.
   *
   * That defect is FIXED. kinetics now derives its reference from this module. A check asserting
   * the disagreement would today be asserting the ABSENCE OF THE FIX, and re-banding it — widening
   * the tolerance until it passed again — would have kept a check that argues for the bug. When
   * the thing a check pins gets repaired, the check has to be turned around to guard the repair. */
  var derivedRef = F.steadyFuelTemp(g, Q_RATED, T_COOL);
  ckT('the derived reference now AGREES with the first engine, from independent inputs',
      Math.abs(derivedRef - 693) < 15,
      'derived ' + derivedRef.toFixed(1) + ' degC against the first engine 693 — theirs from two ' +
      '[tune] constants, ours from sourced rod geometry and a gap conductance solved against the ' +
      'sourced Doppler defect. Two routes, ' + Math.abs(derivedRef - 693).toFixed(1) + ' degC apart');

  /* ---- RESPONSE ---------------------------------------------------------------------------- */
  head('RESPONSE  [the couplings the fuel node exists to carry]');
  var hi = F.steadyFuelTemp(g, Q_RATED, T_COOL), lo = F.steadyFuelTemp(g, Q_RATED * 0.5, T_COOL);
  ckT('halving power lowers the fuel temperature', lo < hi - 100,
      hi.toFixed(1) + ' -> ' + lo.toFixed(1) + ' degC');
  ckT('the fuel rise is SUPERLINEAR in power, because k_UO2 falls as it heats',
      (hi - T_COOL) > 2 * (lo - T_COOL) * 1.001,
      'full-power rise ' + (hi - T_COOL).toFixed(1) + ' vs twice the half-power rise ' +
      (2 * (lo - T_COOL)).toFixed(1) + ' degC');
  /* ⚠ THIS CHECK ORIGINALLY ASSERTED ONE-FOR-ONE AND FAILED — correctly. Written from the
   * assumption that "the rise is set by Q/UA so the offset carries through", it contradicted the
   * superlinearity check three lines above, which says the rise itself grows as fuel heats. Both
   * cannot be true. MEASURED, d(T_fuel)/d(T_coolant) = 1.159, flat across +10/+20/+40 K:
   *
   *     coolant +0   fuel 581.78   rise 277.28
   *     coolant +20  fuel 604.95   rise 280.45      1.1588
   *     coolant +40  fuel 628.15   rise 283.65      1.1594
   *
   * The fuel node AMPLIFIES a coolant temperature change by ~16 %, because hotter fuel has lower
   * k_UO2, so the pellet resistance — 55 % of the stack — rises with it. That matters beyond this
   * gate: on a load drop the coolant rises and the fuel rises MORE, so the Doppler and moderator
   * terms do not offset on the naive arithmetic. Recorded here because it is the kind of coupling
   * a one-for-one assumption would have hidden for as long as nobody measured it. */
  var amp = (F.steadyFuelTemp(g, Q_RATED, T_COOL + 20) - hi) / 20;
  ckT('a coolant temperature change is AMPLIFIED into the fuel, not carried one for one',
      amp > 1.10 && amp < 1.22,
      'd(T_fuel)/d(T_cool) = ' + amp.toFixed(4) + ' — hotter fuel conducts worse, so the rise grows');

  /* ---- REFUSALS ---------------------------------------------------------------------------- */
  head('REFUSALS  [this layer invents neither a power nor a coolant temperature]');
  ckT('omitting core power throws rather than assuming one', (function () {
        try { F.stepFuel(F.createFuel({}), 0.02, { coolTemp_c: T_COOL }); return false; }
        catch (e) { return /Q_core_kW/.test(e.message); }
      })(), '');
  ckT('omitting coolant temperature throws rather than assuming one', (function () {
        try { F.stepFuel(F.createFuel({}), 0.02, { Q_core_kW: Q_RATED }); return false; }
        catch (e) { return /coolTemp_c/.test(e.message); }
      })(), '');
}

console.log('\nPWR2 Layer 5 -- FUEL: the lumped node, and Doppler\'s lever arm');
var F = loadFrom(SRC), rec = [];
runSuite(F, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

/* MUTATIONS. Cost budgeted AS EACH WAS ADDED (D1 §31): the suite runs 5 000 integration steps
 * plus ~10 direct solves, measured at 0.35 s clean, so a 22-mutation replay is ~8 s. That is why
 * the conservation transient is 1 000 steps and not 200 000 — the horizon was chosen against the
 * replay cost, not after it. */
var MUTATIONS = [
  /* ---- #517, the superheat wing ---- */
  ['superheatFactor: always 1 — the wing deleted, the blind spot restored',
   'if (!(superheat_c > 0)) return 1;', 'if (true) return 1;'],
  ['superheatFactor: NOT 1 at the boundary (a silent re-tune of vapor_ratio)',
   'var g0 = W.vaporFilmGroup(Ts, P_MPa);', 'var g0 = W.vaporFilmGroup(Ts, P_MPa) * 1.3;'],
  ['superheatFactor: a FABRICATED degradation the measured band rejects',
   'var f = W.vaporFilmGroup(Ts + superheat_c, P_MPa) / g0;',
   'var f = 1 / (1 + superheat_c / 100);'],
  ['superheatFactor: the sourced degrade-only CAP removed (superheat starts COOLING the core)',
   'return f < 1 ? f : 1;', 'return f;'],
  ['filmCoefficient: the superheat factor multiplied onto the LIQUID branch too',
   'var phase  = (1 - v) + v * OPEN.vapor_ratio.value * superheatFactor(superheat_c, P_MPa);',
   'var phase  = ((1 - v) + v * OPEN.vapor_ratio.value) * superheatFactor(superheat_c, P_MPa);'],
  ['stepFuel: the void-1 superheat refusal removed (the layer invents saturated steam)',
   'if (drivers.voidFrac >= 1 &&', 'if (false &&'],
  ['pellet resistance uses the CENTERLINE form 1/(4 pi k) instead of volume-average 1/(8 pi k)',
   'var r_pellet = 1 / (8 * Math.PI * k_f);', 'var r_pellet = 1 / (4 * Math.PI * k_f);'],
  ['guide thimbles counted as fuel rods (289 instead of 264)',
   'var nRod = GEOM.lattice_n * GEOM.lattice_n - 25;',
   'var nRod = GEOM.lattice_n * GEOM.lattice_n;'],
  ['direct energy deposition dropped — all fission heat routed through the gap',
   'value: 0.974,', 'value: 1.0,'],
  ['heat to the coolant taken from UA*dT instead of the fuel energy change (breaks conservation)',
   '    var Q_out  = dt > 0 ? (Q_fuel + Q_ox) - stored / dt : Q_fuel + Q_ox;',
   '    var Q_out  = UA_cw * (fuel.T_clad_c - drivers.coolTemp_c);'],
  ['the direct deposition never reaches the coolant (energy destroyed)',
   'heats: { core: Q_out + Q_direct },', 'heats: { core: Q_out },'],
  ['UO2 specific heat becomes a constant',
   'return cp_mol / M_MOL_UO2;', 'return 300;'],
  ['UO2 conductivity becomes a constant',
   'return 100 / (7.5408 + 17.692 * t + 3.6142 * t * t)\n         + 6400 / Math.pow(t, 2.5) * Math.exp(-16.35 / t);',
   'return 3.5;'],
  ['gap resistance dropped from the stack',
   'var r_total  = r_pellet + r_gap + r_clad + r_film;',
   'var r_total  = r_pellet + r_clad + r_film;'],
  ['clad resistance dropped from the stack',
   'var r_clad   = Math.log(g.clad_ro_m / g.clad_ri_m) / (2 * Math.PI * OPEN.k_clad.value);',
   'var r_clad   = 0;'],
  ['film resistance dropped from the stack',
   'var r_film   = 1 / (Math.PI * g.rod_od_m * h_f);', 'var r_film   = 0;'],
  ['the two-node advance becomes EXPLICIT EULER (unstable at a large caller timestep)',
   '      var e1 = Math.exp(l1 * dt), e2 = Math.exp(l2 * dt), k = 1 / (l1 - l2);',
   '      var e1 = 1 + l1 * dt, e2 = 1 + l2 * dt, k = 1 / (l1 - l2);'],
  ['assembly pitch built from rod OD instead of rod PITCH (rods touching)',
   'var assyPitch = GEOM.lattice_n * GEOM.rod_pitch_in * IN;',
   'var assyPitch = GEOM.lattice_n * GEOM.rod_od_in * IN;'],
  ['UO2 at theoretical density instead of 95 %', 'var RHO_UO2   = 10410;',
   'var RHO_UO2   = 10960;'],
  ['centerline uses the volume-average form 1/(8 pi k) instead of 1/(4 pi k)',
   'var T_ctr   = T_surf + qPrime / (4 * Math.PI * k_uo2(T_f_k));',
   'var T_ctr   = T_surf + qPrime / (8 * Math.PI * k_uo2(T_f_k));'],
  /* ---- THE CLAD NODE AND THE REGIME FILM COEFFICIENT (2026-08-17) ---- */
  ['the film coefficient stops responding to the coolant (the defect this file DECLARED)',
   '    var forced = OPEN.h_film.value * Math.pow(f, OPEN.dittus_exp.value) * phase;',
   '    var forced = OPEN.h_film.value;'],
  ['the film coefficient loses its stagnant FLOOR (no heat sink at all at zero flow)',
   '    return forced > OPEN.h_stagnant.value ? forced : OPEN.h_stagnant.value;',
   '    return forced;'],
  ['the stack is no longer split at the clad -- the clad node gets ALL the resistance',
   '    var r_fc = r_pellet + r_gap + r_clad / 2;', '    var r_fc = r_pellet + r_gap + r_clad;'],
  ['the clad stores no energy (its temperature slaves instantly, so oxidation sees a STEP)',
   '    var T_cnew  = T_c_eq + adv[1];', '    var T_cnew  = T_c_eq;'],
  ['oxidation heat is generated but never reaches the coolant (energy destroyed)',
   '    var Q_out  = dt > 0 ? (Q_fuel + Q_ox) - stored / dt : Q_fuel + Q_ox;',
   '    var Q_out  = dt > 0 ? Q_fuel - stored / dt : Q_fuel;'],
  ['the clad mass is taken as the FUEL mass (a 50x time constant)',
   '    var Cclad = fuel.geom.M_clad_kg * CP_ZR / 1000;         /* kJ/K */',
   '    var Cclad = fuel.geom.M_fuel_kg * CP_ZR / 1000;'],
  ['Zircaloy density moved off its value (clad mass and the Zr inventory both wrong)',
   '  var RHO_ZR = 6560;', '  var RHO_ZR = 4000;'],
  ['the steady solve returns the STALE inherited reference instead of deriving one',
   '  function steadyFuelTemp(g, Q_kW, T_cool_c) {\n    var T = T_cool_c + 300;',
   '  function steadyFuelTemp(g, Q_kW, T_cool_c) {\n    return 693;\n    var T = T_cool_c + 300;'],
  ['the steady solve stops iterating (one pass, wrong k)',
   'for (var i = 0; i < 60; i++) {', 'for (var i = 0; i < 1; i++) {'],
  ['the pellet no longer shrinks by clad and gap (pellet = rod OD)',
   'var pellet_in = GEOM.rod_od_in - 2 * (SPLIT.clad_t_in + SPLIT.gap_t_in);',
   'var pellet_in = GEOM.rod_od_in;'],
  /* h_gap is no longer a free placeholder: it is SOLVED against the sourced Doppler defect
   * (D1 section 35), so this mutation now tests that the solve VALUE is what the file carries. */
  ['gap conductance moved off its SOLVED value', 'value: 3000,', 'value: 6000,'],
  ['the fuel stores no energy (temperature slaved to equilibrium, no time constant)',
   '    var T_new   = T_eq + adv[0];', '    var T_new   = T_eq;'],
  ['the rod OD moved off its sourced value', 'rod_od_in:   0.374,', 'rod_od_in:   0.400,'],
  ['the rod pitch moved off its sourced value', 'rod_pitch_in:0.496,', 'rod_pitch_in:0.530,'],
  /* CONSTRUCTION */
  ['caller assembly count ignored at construction',
   'var nAssy    = opts.n_assemblies === undefined ? 21   : opts.n_assemblies;',
   'var nAssy    = 21;'],
  ['caller envelope ignored at construction',
   'var envelope = opts.envelope_m3  === undefined ? 3.53 : opts.envelope_m3;',
   'var envelope = 3.53;'],
  ['caller initial fuel temperature ignored at construction',
   '    var Tf = opts.T_fuel_c === undefined ? 693.0 : opts.T_fuel_c;', '    var Tf = 693.0;'],
  ['caller rated power ignored at construction',
   'rated_thermal_kW: opts.rated_thermal_kW === undefined ? 300000 : opts.rated_thermal_kW',
   'rated_thermal_kW: 300000']
];

/* ---- THE CLEAN-RUN GUARD --------------------------------------------------------------
 * A MUTATION SELF-TEST IS ONLY MEANINGFUL IF THE UNMUTATED SUITE IS GREEN. If any check fails in
 * the clean run it fails in every mutant too, so `f2 > 0` holds unconditionally and EVERY mutation
 * is reported as caught. Coverage then reads 25/25 while the suite is measuring nothing.
 *
 * MEASURED in run_pwr2_kinetics.js, 2026-08-16: a fixture producing NaN made one check fail in the
 * clean run. The self-test reported 23/25. Fixing that ONE check dropped it to 21/25 -- the two
 * extra "caught" mutations had never been caught by anything, and both were genuinely blind.
 *
 * So the tally is REFUSED, not annotated, when the clean run is red. */
if (fail > 0) {
  /* PRINT THE SCORE FIRST. run_all parses this line to report drift; exiting without it
   * makes a legitimately-failing gate read as `score ?`, which is LESS informative than
   * before the guard existed. The guard refuses the MUTATION TALLY, not the tally line. */
  console.log('  ' + require('path').basename(__filename, '.js') + ': ' + pass +
              ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
  console.log('  MUTATION SELF-TEST SKIPPED -- ' + fail + ' check(s) failed in the CLEAN run.');
  console.log('  A failing check fails in every mutant too, so every mutation would report as');
  console.log('  caught and the coverage number would be a lie. Fix the check first.');
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('='.repeat(70));
var blind = 0;
MUTATIONS.forEach(function (m) {
  if (SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true); }
  catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(72) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_fuel: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
