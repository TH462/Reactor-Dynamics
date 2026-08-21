/* run_pwr2_damage.js — Layer 5 gate: clad oxidation and core damage. (#479)
 *
 * THE CLAIM THIS LAYER MAKES, and it is an unusually strong one for this engine: **nothing here is
 * fitted.** The rate law, its two constants, its heat of reaction, the stoichiometry, the melt
 * point and all three acceptance criteria are quoted from documents in the corpus. There is no
 * knob. So this gate does not check that the model is self-consistent — it checks that the model
 * REPRODUCES ITS OWN SOURCES, at points the sources state independently of the law.
 *
 * WHAT IT CAN PROVE:
 *   - The rate law is the one Ginna UFSAR ch15 prints, retyped here rather than imported.
 *   - It agrees with the two ONSET statements that bracket it — GEND-061's "very little hydrogen
 *     until 1,200 °F" and Ginna's "significant above 1800F" — WITHOUT either being a threshold in
 *     the code. A model with a hand-placed onset would agree by construction and prove nothing;
 *     this one has only an Arrhenius exponent, and the exponent has to land in the right place.
 *   - The stoichiometry reproduces GEND-061's own arithmetic to better than 1 %, on figures the
 *     document computes for itself (9,400 kg -> "over 400 kg" of hydrogen; 10,500 -> 460).
 *   - The zirconium inventory, derived from a SOURCED lattice, lands where a TMI-2 whole-core
 *     figure scaled on power says it should.
 *
 * WHAT IT CANNOT PROVE: that the clad reaches these temperatures at the right TIME. That depends
 * on `pwr2_fuel.js`'s low-flow film coefficient, which is unsourced, and on two declared
 * optimistic simplifications (no departure from nucleate boiling; a coolant clamped at the
 * property library's 800 degC ceiling). Timing claims belong to the scenario gate, not here.
 *
 * Run: node test/run_pwr2_damage.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_damage.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_fuel'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, FU = RD.fuel;

function loadFrom(src) {
  var root = { RD: { pwr2: { fuel: RD.fuel } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.damage;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCES, RETYPED INDEPENDENTLY of the engine's copy — the house discipline. Importing the
 * constants and comparing them to themselves is vacuous.
 *
 * Ginna UFSAR ch15 (ML20339A101) §15.3.2.4.2:
 *   "d(w2)/dt = 33.3 x 10^6 exp (-45500/1.986T)   where: w = amount reacted (mg/cm2),
 *    t = time (seconds), T = temperature (Kelvin) ... The heat of reaction is 1510 cal/g"
 *   "The zirconium-steam reaction can be significant above a clad temperature of 1800F."
 * 10 CFR 50.46 via Ginna UFSAR ch15 §15.6.4.2.4.3:
 *   "1. The calculated maximum fuel element cladding temperature shall not exceed 2200F.
 *    2. The calculated total oxidation of the cladding shall nowhere exceed 0.17 times the total
 *       cladding thickness before oxidation.
 *    3. The calculated total amount of hydrogen generated ... shall not exceed 0.01 times the
 *       hypothetical amount ..."
 * GEND-061 §4.3:
 *   "very little hydrogen is generated until zirconium temperatures exceed 1,200 °F (650 °C)"
 *   "core temperatures approached 3,100 K (5,100 °F), the melting point of uranium dioxide"
 *   "The TMI-2 reactor core contains a calculated 23,600 kg (52,000 lb) of zirconium"
 *   "Since 1 mol of zirconium reacting with 2 mol of water liberates 2 mol of hydrogen,
 *    230 kg-mol of hydrogen represents the oxidation of 115 kg-mol, or 10,500 kg ... of zirconium"
 *   "approximately 40% ... of the total zirconium in the core, or approximately 9,400 kg was
 *    oxidized in that region. The reaction of that much zirconium with water would produce over
 *    400 kg of hydrogen"
 */
var DOC = {
  A: 33.3e6, E_num: 45500, E_den: 1.986,
  heat_cal_per_g: 1510,
  pct_f: 2200, ox_frac: 0.17, h2_frac: 0.01,
  significant_f: 1800, onset_f: 1200,
  uo2_melt_k: 3100, uo2_melt_f: 5100,
  tmi_core_zr_kg: 23600, tmi_mwt: 2772,
  tmi_oxidized_kg: 9400, tmi_h2_kg: 400,      /* "over 400 kg" — a floor, not a value */
  tmi_oxidized2_kg: 10500, tmi_h2_2_kg: 460
};
var RATED_KW = 300000, PLANT_MWT = 300;

function runSuite(D, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(58) +
      'got ' + got.toFixed(4) + ' want ' + want.toFixed(4) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  function fToK(f) { return (f - 32) * 5 / 9 + 273.15; }
  function fToC(f) { return (f - 32) * 5 / 9; }

  /* hold(T_f, secs) — the reaction at a FIXED clad temperature, which is how every sourced
   * statement about it is phrased. Fuel is held cold so the melt latch cannot fire and confuse
   * an oxidation check with a damage check. */
  function hold(T_clad_f, secs, dt) {
    dt = dt || 0.02;
    var dm = D.createDamage({ rated_thermal_kW: RATED_KW }), r = null;
    for (var i = 0; i < Math.round(secs / dt); i++) {
      r = D.stepDamage(dm, dt, { cladTemp_c: fToC(T_clad_f), fuelTemp_c: 300 });
    }
    return { dm: dm, r: r };
  }

  /* ---- CONSTRUCTION, WRITTEN FIRST (D1 §31) ----------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  ck('caller rated power reaches the plant',
     D.createDamage({ rated_thermal_kW: 4242 }).rated_thermal_kW, 4242, 1e-12, 'kW');
  ck('caller initial oxide reaches the plant',
     D.createDamage({ w_mg_cm2: 12.5 }).w_mg_cm2, 12.5, 1e-12, 'mg/cm2');
  /* ⚠ VARY THE ENVELOPE, NOT THE ASSEMBLY COUNT. The first version passed
   * `n_assemblies: 40` and failed on a correct model: `deriveGeometry` holds the core ENVELOPE
   * fixed, so more assemblies means a proportionally shorter active height and
   * `rod_length_total_m` — hence the clad inventory — is UNCHANGED. A fixture that varies
   * nothing measures nothing. The envelope moves the height directly. */
  ckT('caller geometry reaches the plant — a bigger core carries more zirconium',
      D.createDamage({ geom: FU.deriveGeometry({ envelope_m3: 7.0 }) }).geom.M_clad_kg >
      D.createDamage({}).geom.M_clad_kg * 1.5,
      D.createDamage({}).geom.M_clad_kg.toFixed(0) + ' kg at the design envelope, ' +
      D.createDamage({ geom: FU.deriveGeometry({ envelope_m3: 7.0 }) }).geom.M_clad_kg.toFixed(0) +
      ' kg at 7.0 m3');
  ckT('the default lineup is UNDAMAGED and unoxidised',
      D.createDamage({}).w_mg_cm2 === 0 && D.createDamage({}).fuel_damaged === false &&
      D.createDamage({}).melted === false && D.createDamage({}).destruction_cause === 'none',
      'a default of damaged would make every probe that omits this report a wrecked core');

  /* ---- THE RATE LAW IS THE DOCUMENT'S ------------------------------------------------------ */
  head('BAKER-JUST  [retyped from Ginna UFSAR ch15, not imported from the engine]');
  ck('the pre-exponential is the sourced one', D.BJ.A, DOC.A, 1e-6, 'mg2/cm4/s');
  ck('the activation term is written as the document writes it (45500/1.986)',
     D.BJ.E_R, DOC.E_num / DOC.E_den, 1e-9, 'K');
  ck('the heat of reaction is the sourced one', D.BJ.heat_cal_per_g, DOC.heat_cal_per_g, 0,
     'cal/g');
  /* THE LAW EVALUATED AGAINST AN INDEPENDENT RE-DERIVATION, so a sign or a factor cannot hide. */
  var T1 = fToK(DOC.significant_f);
  ck('the rate at 1800 degF equals a hand-evaluation of the printed formula',
     D.rate(T1), DOC.A * Math.exp(-DOC.E_num / (DOC.E_den * T1)), 1e-9, 'mg2/cm4/s');
  ckT('the rate is STRONGLY temperature-dependent, which is the whole character of it',
      D.rate(fToK(2200)) / D.rate(fToK(1800)) > 10,
      'x' + (D.rate(fToK(2200)) / D.rate(fToK(1800))).toFixed(1) +
      ' from 1800 to 2200 degF — a linear or weakly-dependent law would not do that');

  /* ---- IT AGREES WITH THE ONSET STATEMENTS, WITHOUT HAVING A THRESHOLD --------------------
   * This is the strongest check in the file. There is NO onset temperature anywhere in the
   * engine: only an Arrhenius exponent. Yet the law has to be negligible where GEND-061 says
   * "very little hydrogen is generated" and appreciable where Ginna says it "can be significant".
   * A model with a hand-placed onset would satisfy both by construction. */
  head('ONSET  [the sources bracket it, and the code has no threshold to satisfy them with]');
  var at1200 = hold(DOC.onset_f, 100).r;
  var at1800 = hold(DOC.significant_f, 100).r;
  var at2200 = hold(DOC.pct_f, 100).r;
  ckT('at GEND-061 1200 degF the reaction is NEGLIGIBLE, as the document says',
      at1200.oxidation_frac < 0.002,
      (at1200.oxidation_frac * 100).toFixed(3) + ' % of the clad in 100 s');
  ckT('...at Ginna 1800 degF it is APPRECIABLE, as the document says',
      at1800.oxidation_frac > 0.005 && at1800.oxidation_frac < 0.05,
      (at1800.oxidation_frac * 100).toFixed(2) + ' % of the clad in 100 s');
  ckT('...and at the 2200 degF limit it is faster still, but still INSIDE 50.46 criterion 2',
      at2200.oxidation_frac > at1800.oxidation_frac &&
      at2200.oxidation_frac < DOC.ox_frac,
      (at2200.oxidation_frac * 100).toFixed(2) + ' % in 100 s against a ' +
      (DOC.ox_frac * 100).toFixed(0) + ' % ceiling — the right side of the criterion, with margin');
  ckT('the three sit in the order the two documents put them in',
      at1200.oxidation_frac < at1800.oxidation_frac &&
      at1800.oxidation_frac < at2200.oxidation_frac, '');

  /* ---- PARABOLIC, AND SELF-LIMITING -------------------------------------------------------- */
  head('PARABOLIC KINETICS  [w ~ sqrt(t): the oxide slows its own growth]');
  var p1 = hold(DOC.pct_f, 100).r, p4 = hold(DOC.pct_f, 400).r;
  ck('quadrupling the time doubles the oxide — the parabolic signature',
     p4.w_mg_cm2 / p1.w_mg_cm2, 2.0, 0.02, '(ratio)');
  ckT('...so the RATE falls as the layer thickens, rather than running away linearly',
      p4.w_mg_cm2 < 4 * p1.w_mg_cm2,
      p1.w_mg_cm2.toFixed(2) + ' mg/cm2 at 100 s, ' + p4.w_mg_cm2.toFixed(2) +
      ' at 400 s — linear kinetics would give ' + (4 * p1.w_mg_cm2).toFixed(2));
  /* THE INTEGRATION IS IN w^2 BECAUSE dw/dt IS SINGULAR AT w = 0. A model integrating w directly
   * takes an infinite first step on a fresh core, or has to be started at a fudged non-zero
   * oxide. Checked by taking the very first step from zero and requiring it be finite and small. */
  var dmFresh = D.createDamage({});
  var rFresh = D.stepDamage(dmFresh, 0.02, { cladTemp_c: fToC(2200), fuelTemp_c: 300 });
  ckT('the FIRST step from a pristine core is finite and small, not singular',
      isFinite(rFresh.w_mg_cm2) && rFresh.w_mg_cm2 > 0 && rFresh.w_mg_cm2 < 1,
      rFresh.w_mg_cm2.toExponential(3) + ' mg/cm2 — dw/dt = K/(2w) is infinite here, w^2 is not');

  /* ---- MONOTONE, AND THE HEAT STOPS WITHOUT A RULE SAYING SO ------------------------------- */
  head('MONOTONE  [the oxide does not un-grow; the HEAT stops on its own]');
  var dmC = D.createDamage({}), rHot = null, rCold = null;
  for (var i = 0; i < 5000; i++) {
    rHot = D.stepDamage(dmC, 0.02, { cladTemp_c: fToC(2200), fuelTemp_c: 300 });
  }
  var wHot = dmC.w_mg_cm2;
  for (i = 0; i < 5000; i++) {
    rCold = D.stepDamage(dmC, 0.02, { cladTemp_c: 300, fuelTemp_c: 300 });
  }
  ckT('cooling the core does NOT reverse the oxide', dmC.w_mg_cm2 >= wHot,
      wHot.toFixed(3) + ' -> ' + dmC.w_mg_cm2.toFixed(3) + ' mg/cm2 after 100 s at 300 degC');
  ckT('...but the heat release stops, with no rule in the code that says it should',
      rCold.Q_ox_kW < rHot.Q_ox_kW / 1e6 && rHot.Q_ox_kW > 0,
      rHot.Q_ox_kW.toFixed(1) + ' kW hot -> ' + rCold.Q_ox_kW.toExponential(2) +
      ' kW cold — the Arrhenius factor does it, not a threshold');
  /* SELF-LIMITING AT THE INVENTORY. There is only so much zirconium; a parabolic law integrated
   * forever would eventually claim more than the core contains. */
  var dmAll = D.createDamage({}), rAll = null;
  for (i = 0; i < 200000; i++) {
    rAll = D.stepDamage(dmAll, 1.0, { cladTemp_c: 2000, fuelTemp_c: 300 });
  }
  ckT('the reaction cannot consume more zirconium than the core contains',
      rAll.oxidation_frac <= 1.0000001 && rAll.zr_consumed_kg <= dmAll.geom.M_clad_kg * 1.0000001,
      (rAll.oxidation_frac * 100).toFixed(1) + ' % consumed, ' + rAll.zr_consumed_kg.toFixed(0) +
      ' kg of ' + dmAll.geom.M_clad_kg.toFixed(0) + ' kg present');

  /* ---- THE STOICHIOMETRY REPRODUCES GEND-061'S OWN ARITHMETIC -----------------------------
   * The document computes hydrogen from zirconium twice, in words, on two different masses. Those
   * are numbers the source derived for itself, so reproducing them is a check on OUR reading of
   * it as much as on the constant. */
  head('STOICHIOMETRY  [GEND-061 does this arithmetic itself, twice, and we must match]');
  ck('1 mol Zr -> 2 mol H2 gives the mass ratio', D.H2_PER_ZR, 2 * 2.016 / 91.224, 1e-12, '');
  ckT('9,400 kg of zirconium gives GEND-061\'s "over 400 kg" of hydrogen',
      DOC.tmi_oxidized_kg * D.H2_PER_ZR > DOC.tmi_h2_kg &&
      DOC.tmi_oxidized_kg * D.H2_PER_ZR < DOC.tmi_h2_kg * 1.05,
      (DOC.tmi_oxidized_kg * D.H2_PER_ZR).toFixed(0) + ' kg against "over 400"');
  ck('...and 10,500 kg gives its stated 460 kg', DOC.tmi_oxidized2_kg * D.H2_PER_ZR,
     DOC.tmi_h2_2_kg, 5.0, 'kg H2');
  /* AND THE ENGINE MUST USE IT, not merely export it. */
  var hSt = hold(2200, 400).r;
  ck('the reported hydrogen IS that ratio times the zirconium consumed',
     hSt.h2_kg, hSt.zr_consumed_kg * D.H2_PER_ZR, 1e-9, 'kg');

  /* ---- THE ZIRCONIUM INVENTORY, AGAINST A SOURCE IT WAS NOT BUILT FROM --------------------- */
  head('INVENTORY  [derived from a sourced lattice, checked against TMI-2 scaled on power]');
  var geom = FU.deriveGeometry();
  var zrScaled = DOC.tmi_core_zr_kg * PLANT_MWT / DOC.tmi_mwt;
  ckT('the clad inventory lands BELOW the power-scaled whole-core figure, by a thimble-grid gap',
      geom.M_clad_kg < zrScaled * 0.92 && geom.M_clad_kg > zrScaled * 0.75,
      geom.M_clad_kg.toFixed(0) + ' kg clad-only against ' + zrScaled.toFixed(0) +
      ' kg whole-core scaled from TMI-2 = ' + (100 * geom.M_clad_kg / zrScaled).toFixed(1) + ' %');
  /* wMax IS MASS-CONSISTENT, and this is the check that says so: fully oxidised, the reported
   * zirconium consumed must equal the clad mass EXACTLY. Taking wMax as rho*t instead uses the
   * outer radius for an area whose mass sits at a smaller mean radius, and misses by 6 %. */
  ck('at full oxidation the consumed mass equals the clad mass exactly',
     D.wMax(geom) * geom.clad_surface_m2 / 100, geom.M_clad_kg, 1e-9, 'kg');
  ckT('...and w_max is the mass-consistent value, NOT density x thickness',
      Math.abs(D.wMax(geom) - 352.4) < 1.0,
      D.wMax(geom).toFixed(1) + ' mg/cm2, against 374.9 from rho*t — a 6 % disagreement, and only ' +
      'one of them closes against M_clad_kg');

  /* ---- THE HEAT, AND ITS SIZE AGAINST THE DECAY TAIL --------------------------------------- */
  head('OXIDATION HEAT  [the source that makes damage ACCELERATE instead of decaying]');
  var hh = hold(DOC.pct_f, 100).r;
  /* The reported heat must be 1510 cal/g on the mass actually reacted, independently computed. */
  var dmH = D.createDamage({}), before = 0, after = 0, rH = null, sumKJ = 0;
  for (i = 0; i < 5000; i++) {
    before = dmH.w_mg_cm2;
    rH = D.stepDamage(dmH, 0.02, { cladTemp_c: fToC(DOC.pct_f), fuelTemp_c: 300 });
    after = dmH.w_mg_cm2;
    sumKJ += rH.Q_ox_kW * 0.02;
  }
  var zrKg = dmH.w_mg_cm2 * FU.deriveGeometry().clad_surface_m2 / 100;
  ck('the energy released over the ride is 1510 cal/g on the zirconium actually consumed',
     sumKJ, zrKg * 1000 * DOC.heat_cal_per_g * 4.184 / 1000, 1.0, 'kJ');
  ckT('at the 50.46 temperature limit the reaction is a REAL fraction of rated power',
      hh.zirc_heat_pct > 0.5 && hh.zirc_heat_pct < 5,
      hh.zirc_heat_pct.toFixed(2) + ' % of rated at 2200 degF — against a decay tail of ~1.5 % ' +
      'at the time a core gets there, so it roughly DOUBLES the heat source');
  /* ⚠ THE THRESHOLD IS A KILOWATT, NOT A PERCENTAGE I PICKED. The first version asked for
   * "< 1e-6 %" and measured 3.14e-5 — a number chosen for how small it looked rather than for
   * what it means. Stated as power it is 0.09 kW in a 300 MWt core, which is the honest claim:
   * unmeasurable, and 15,000x below the decay tail at any time a core is at temperature. */
  var healthy = hold(650, 100).r;
  ckT('...and it is under a KILOWATT on a healthy core at operating temperature',
      healthy.zirc_heat_pct * RATED_KW / 100 < 1.0,
      (healthy.zirc_heat_pct * RATED_KW / 100).toFixed(3) + ' kW at 650 degF clad, in a ' +
      (RATED_KW / 1000).toFixed(0) + ' MWt core');

  /* ---- THE LATCHES ------------------------------------------------------------------------- */
  head('DAMAGE LATCHES  [latched, never cleared: a damaged core stays damaged]');
  var dmL = D.createDamage({});
  var cool = D.stepDamage(dmL, 0.02, { cladTemp_c: 320, fuelTemp_c: 700 });
  ckT('a healthy plant reports UNDAMAGED, not merely low numbers',
      cool.fuel_damaged === false && cool.melted === false &&
      cool.destruction_cause === 'none', '');
  /* THE DAMAGE LATCH IS A CLAD TEMPERATURE, and the melt latch is a FUEL temperature. That is
   * the sourced split: 50.46 criterion 1 is a CLADDING limit because the clad is the barrier,
   * and the UO2 melting point is a FUEL property. Swapping them is a real defect and this pair
   * of checks is what catches it. */
  var dmD = D.createDamage({});
  var hot = D.stepDamage(dmD, 0.02, { cladTemp_c: fToC(DOC.pct_f) + 1, fuelTemp_c: 700 });
  ckT('the DAMAGE latch trips on the CLAD passing 50.46 criterion 1, with cool fuel',
      hot.fuel_damaged === true && hot.melted === false,
      'clad ' + DOC.pct_f + ' degF, fuel 700 degC — damaged but not melted');
  var dmM = D.createDamage({});
  var mlt = D.stepDamage(dmM, 0.02, { cladTemp_c: 320, fuelTemp_c: DOC.uo2_melt_k - 273.15 + 1 });
  ckT('...and the MELT latch trips on the FUEL passing the UO2 melting point, with cool clad',
      mlt.melted === true && mlt.destruction_cause === 'thermal_melt',
      'fuel ' + (DOC.uo2_melt_k - 273.15).toFixed(0) + ' degC = ' + DOC.uo2_melt_f +
      ' degF; clad 320 — melted with the clad latch untouched by it');
  /* ⚠ AND THE MELT POINT NEEDS A CASE THAT DOES *NOT* MELT. The check above drives the fuel one
   * degree past 3100 K, which a model with the melting point set ANYWHERE BELOW that also
   * satisfies — the injection self-test found it blind to 3100 K becoming 2500 K. A threshold
   * asserted only from above is a threshold nobody has located. */
  ck('the melting point carried is the sourced GEND-061 figure', D.TMI.uo2_melt_k, DOC.uo2_melt_k,
     0, 'K');
  var dmNear = D.createDamage({});
  var near = D.stepDamage(dmNear, 0.02,
    { cladTemp_c: 320, fuelTemp_c: DOC.uo2_melt_k - 273.15 - 100 });
  ckT('...and fuel 100 K BELOW it does not melt, which is what locates the threshold',
      near.melted === false && near.destruction_cause === 'none',
      'fuel at ' + (DOC.uo2_melt_k - 100) + ' K is hot enough to be alarming and is not molten');

  /* LATCHED MEANS LATCHED. Cooling the core back down must not un-damage it. */
  var back = D.stepDamage(dmD, 0.02, { cladTemp_c: 320, fuelTemp_c: 300 });
  ckT('cooling a damaged core does NOT clear the latch', back.fuel_damaged === true, '');
  var backM = D.stepDamage(dmM, 0.02, { cladTemp_c: 320, fuelTemp_c: 300 });
  ckT('...nor the melt latch, nor the cause',
      backM.melted === true && backM.destruction_cause === 'thermal_melt', '');

  /* ---- THE 50.46 CRITERIA ARE COMPUTED, NOT JUST QUOTED ------------------------------------ */
  head('10 CFR 50.46  [all three criteria are dimensionless or a temperature, so all are checkable]');
  ck('the peak-clad limit carried is the sourced 2200 degF', D.LIM.pct_limit_f, DOC.pct_f, 0, 'degF');
  ck('the oxidation limit carried is the sourced 0.17', D.LIM.oxidation_frac, DOC.ox_frac, 0, '');
  ck('the hydrogen limit carried is the sourced 0.01', D.LIM.hydrogen_frac, DOC.h2_frac, 0, '');
  var mg = D.stepDamage(D.createDamage({}), 0.02, { cladTemp_c: fToC(1700), fuelTemp_c: 300 });
  ck('the reported margin to the limit is the limit less the clad temperature',
     mg.pct_margin_f, DOC.pct_f - 1700, 1e-9, 'degF');
  ckT('...and it goes NEGATIVE past the limit, rather than clamping at zero',
      D.stepDamage(D.createDamage({}), 0.02,
        { cladTemp_c: fToC(2400), fuelTemp_c: 300 }).pct_margin_f < 0,
      'a margin that floors at zero hides how far past the limit a core went');

  /* ---- REFUSALS ---------------------------------------------------------------------------- */
  head('REFUSALS  [this layer invents neither temperature it needs]');
  ckT('omitting the clad temperature throws rather than assuming one', (function () {
        try { D.stepDamage(D.createDamage({}), 0.02, { fuelTemp_c: 300 }); return false; }
        catch (e) { return /cladTemp_c/.test(e.message); }
      })(), '');
  ckT('omitting the fuel temperature throws rather than substituting the clad\'s', (function () {
        try { D.stepDamage(D.createDamage({}), 0.02, { cladTemp_c: 300 }); return false; }
        catch (e) { return /fuelTemp_c/.test(e.message); }
      })(), '');
  /* AND A NON-FINITE TEMPERATURE MUST THROW RATHER THAN LATCH. Measured on a 20 cm2 break
   * with emergency injection running: the plant is held cool and undamaged for 1250 s, then
   * reaches the 0.1 MPa property floor (#487) and the temperatures diverge. The latches
   * reported DAMAGED and MELTED on a plant whose state had been LOST -- the alarming answer,
   * and unearned in exactly the way run_pwr2_true_state refuses 'not scrammed' from an
   * engine with no protection layer. NaN >= x is false, so NaN alone never latched; the
   * latch fired on the DIVERGING finite values on the way there. */
  ckT('a NaN clad temperature THROWS rather than latching a wrecked core', (function () {
        var dmN = D.createDamage({});
        try { D.stepDamage(dmN, 0.02, { cladTemp_c: NaN, fuelTemp_c: 300 }); return false; }
        catch (e) { return /NON-FINITE/.test(e.message) && dmN.melted === false &&
                           dmN.fuel_damaged === false; }
      })(), 'and it must leave the latches untouched on the way out');
  ckT('...and so does an infinite FUEL temperature', (function () {
        try { D.stepDamage(D.createDamage({}), 0.02,
                           { cladTemp_c: 300, fuelTemp_c: Infinity }); return false; }
        catch (e) { return /NON-FINITE/.test(e.message); }
      })(), '');
}

console.log('\nPWR2 Layer 5 -- DAMAGE: Baker-Just oxidation, and nothing in it is fitted');
var D = loadFrom(SRC), rec = [];
runSuite(D, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['the rate law loses its temperature dependence (a constant reaction rate)',
   '    return BJ.A * Math.exp(-BJ.E_R / T_k);', '    return BJ.A * 1e-16;'],
  ['the Arrhenius exponent loses its sign — the reaction runs FASTER when cold',
   '    return BJ.A * Math.exp(-BJ.E_R / T_k);', '    return BJ.A * Math.exp(BJ.E_R / T_k);'],
  ['the pre-exponential moved off its sourced value', '    A:    33.3e6,', '    A:    10.0e6,'],
  ['the activation energy moved off its sourced value',
   '    E_R:  45500 / 1.986,', '    E_R:  30000 / 1.986,'],
  ['the heat of reaction moved off its sourced value',
   '    heat_cal_per_g: 1510,', '    heat_cal_per_g: 800,'],
  ['integration reverts to LINEAR kinetics (no parabolic self-limiting)',
   '    var w1 = Math.sqrt(w0 * w0 + rate(T_k) * (dt > 0 ? dt : 0));',
   '    var w1 = w0 + rate(T_k) * (dt > 0 ? dt : 0);'],
  ['the oxide is allowed to consume more zirconium than the core contains',
   '    if (w1 > w_max) w1 = w_max;                 /* cannot oxidise metal that is no longer there */',
   ''],
  ['the oxide UN-GROWS when the core cools (the state stops being monotone)',
   '    dm.w_mg_cm2 = w1;', '    dm.w_mg_cm2 = w1 * 0.999;'],
  ['w_max reverts to density x thickness, so the inventory stops closing on M_clad',
   '    return geom.M_clad_kg / geom.clad_surface_m2 * 100;      /* kg/m2 -> mg/cm2 */',
   '    return 374.9;'],
  ['the hydrogen ratio is inverted (2 mol Zr per mol H2)',
   '  var H2_PER_ZR = 2 * M_H2 / M_ZR;   /* [derived] 1 mol Zr -> 2 mol H2, GEND-061 §4.3 */',
   '  var H2_PER_ZR = M_ZR / (2 * M_H2);'],
  ['the calorie conversion is dropped, so the heat is 4.184x too small',
   '    var Q_ox_kW = dt > 0 ? dZr_kg * 1000 * BJ.heat_cal_per_g * CAL_J / 1000 / dt : 0;',
   '    var Q_ox_kW = dt > 0 ? dZr_kg * 1000 * BJ.heat_cal_per_g / 1000 / dt : 0;'],
  ['the DAMAGE latch reads the FUEL temperature instead of the clad',
   '    if (drivers.cladTemp_c >= pct_c) dm.fuel_damaged = true;',
   '    if (drivers.fuelTemp_c >= pct_c) dm.fuel_damaged = true;'],
  ['the MELT latch reads the CLAD temperature instead of the fuel',
   '    if (drivers.fuelTemp_c >= TMI.uo2_melt_k - 273.15) {',
   '    if (drivers.cladTemp_c >= TMI.uo2_melt_k - 273.15) {'],
  ['the latches CLEAR when the core cools (damage becomes reversible)',
   '    if (drivers.cladTemp_c >= pct_c) dm.fuel_damaged = true;',
   '    dm.fuel_damaged = drivers.cladTemp_c >= pct_c;'],
  ['destruction_cause stays "none" through a melt',
   "      dm.destruction_cause = 'thermal_melt';", "      dm.destruction_cause = 'none';"],
  ['the peak-clad limit moved off 10 CFR 50.46', '    pct_limit_f:        2200,',
   '    pct_limit_f:        2600,'],
  ['the UO2 melting point moved off the GEND-061 figure', '    uo2_melt_k:      3100,',
   '    uo2_melt_k:      2500,'],
  ['the margin FLOORS at zero, hiding how far past the limit a core went',
   '      pct_margin_f: LIM.pct_limit_f - (drivers.cladTemp_c * 9 / 5 + 32),',
   '      pct_margin_f: Math.max(0, LIM.pct_limit_f - (drivers.cladTemp_c * 9 / 5 + 32)),'],
  ['a lost (non-finite) state is allowed to latch damage -- the alarming unearned answer',
   '    if (!isFinite(drivers.cladTemp_c) || !isFinite(drivers.fuelTemp_c)) {',
   '    if (false) {'],
  /* CONSTRUCTION */
  ['caller rated power ignored at construction',
   '      rated_thermal_kW: opts.rated_thermal_kW === undefined ? 300000 : opts.rated_thermal_kW,',
   '      rated_thermal_kW: 300000,'],
  ['caller initial oxide ignored at construction',
   '      w_mg_cm2:  opts.w_mg_cm2 === undefined ? 0 : opts.w_mg_cm2,', '      w_mg_cm2:  0,'],
  ['caller geometry ignored at construction',
   '    var g = opts.geom || F.deriveGeometry(opts);', '    var g = F.deriveGeometry();'],
  ['a fresh core is created ALREADY DAMAGED', '      fuel_damaged: false,',
   '      fuel_damaged: true,']
];

/* ---- THE CLEAN-RUN GUARD ---------------------------------------------------------------- */
if (fail > 0) {
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
  else console.log('  caught    ' + m[0].padEnd(74) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_damage: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
