/* pwr2_geometry.js — Layer 1: SLS-100 plant geometry for the PWR2 engine. (#479)
 *
 * DATA ONLY. No functions that step anything, no state, and it reads NOTHING — not even Layer 0.
 * Layer 1 sits directly above the water properties in the build stack (Blueprint/PWR2_DESIGN.md
 * §7) and everything above it reads these numbers.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY NUMBER CARRIES ITS PROVENANCE. `[tune]` does not exist in PWR2 and must never appear
 * here (D1 §2). The three kinds, used literally and not decoratively:
 *
 *   [ruled]    an owner decision. Changed only by another owner decision.
 *   [sourced]  a real-plant figure with its document named AT the definition.
 *   [derived]  computed from [ruled]/[sourced] values by a rule stated next to it.
 *   [recalled] NOT one of the three, used ONLY where a value is knowingly unsourced and the
 *              owner has ruled it may stand. Exactly one family qualifies: the form-loss
 *              coefficients (D3 §7, OWNER RULING 2026-08-14). If you add a second, you are
 *              probably doing the thing this engine exists to stop.
 *
 * ---------------------------------------------------------------------------------------
 * THE HONEST HEADLINE, because it governs how much anything below is worth:
 *
 * **The RCS volume ledger carries a 9.2 % unattributed fraction** — 79.1 ft³ (2.24 m³) of
 * 858.1 ft³ (24.30 m³). Inventory-dependent timings (boil-off, time to uncovery, ECCS
 * adequacy margins) are good to about ±9 % and NO BETTER. Declared, not hidden: D1 §24.
 * (It was 12.1 % of 835.8 ft³ until #583: the pressurizer row was a 125.2 ft³ DESIGN-BASIS
 * PLACEHOLDER, and #472's real vessel is 147.5 ft³ — swapping it closes 22.3 ft³ of the
 * declared shortfall. The fraction fell because a gap was CLOSED, not because a band moved.)
 *
 * **The vessel split assumes internal proportions are SCALE-INVARIANT** and that is a claim,
 * not a measurement (D3 §7.0). Its likely error direction is known — a smaller plant's plena
 * and heads plausibly grow as a fraction, because their heights do not shrink with power.
 *
 * UNITS ARE SI (CLAUDE.md: engine internals stay SI). US-customary appears in comments only,
 * because that is how the owner reads them.
 *     V m3 · L m · A m2 · z m (elevation, core midplane = 0) · d m
 */
(function (root) {
  'use strict';

  var FT3 = 35.3147;                    // m3 -> ft3, comments only
  function ft3(v) { return v / FT3; }   // ft3 -> m3, so the sourced units stay visible

  /* ================================================================ COMPONENT LEDGER
   * [sourced] NUREG/IA-0444 (USNRC, April 2014), Tables 5-7, via GovInfo
   * GOVPUB-Y3_N88-PURL-gpo49031. Almaraz I, W 3-loop, 2947 MWt. Verified against the
   * document by this repo 2026-08-14: the component column sums to 280.97 m3, matching the
   * stated total to the digit, which is how the table's row alignment was settled.
   *
   * SCALING RULE, [sourced] from the same document's own geometry (D3 §1a-i):
   *   loop LENGTH is set by layout and does NOT scale with power. Only AREA scales, with
   *   flow, to hold velocity. So V x ratio at L unchanged.
   * Power ratio: SLS-100 300 MWt against Almaraz per-loop 982.3 MWt = 0.3054. */
  var LEDGER = {
    rpv:          { m3: ft3(315.1), kind: '[derived]', note: 'sourced plena ratios + hemispherical heads; D3 §1a-v' },
    piping:       { m3: ft3(108.1), kind: '[derived]', note: 'Almaraz per-loop 353 ft3 x 0.3054' },
    sg_primary:   { m3: ft3(259.3), kind: '[derived]', note: 'EPRI NP-1721 Model 51 tube geometry, scaled' },
    rcp:          { m3: ft3(28.1),  kind: '[derived]', note: 'sourced casing water 80 ft3 x 300/852.75' },
    /* ⚠ NOT A NODE (#583). This row is the Layer-5 VESSEL — `pwr2_pressurizer.GEOM.V_pzr_m3`,
     * 4.176 m3 — and it deliberately has no entry in NODES below. Until 2026-08-28 the ring
     * ALSO carried a stagnant `pressurizer` node at the 125.2 ft3 design-basis placeholder, so
     * the plant modelled 983 ft3 of RCS against this table's own 835.8: the pressurizer was in
     * the ledger twice, at two different sizes, and 2,539 kg of it was rigid water no break,
     * ECCS, CVCS or RHR path could reach. `PWR_DESIGN_BASIS.md` §6 flagged the 125.2 as a
     * placeholder when it wrote it — "must be checked against #472's own number, not adopted
     * over it" — and nothing ever checked. `run_pwr2_pressurizer` now asserts the equality. */
    pressurizer:  { m3: 4.176, kind: '[derived]',
                    note: 'the LAYER-5 VESSEL, not a ring node (#583) — pwr2_pressurizer GEOM, ' +
                          'Ginna TS Bases ML20339A221 B 3.4.9 (650 ft3 = 87 %) scaled per-MWt = 147.5 ft3' }
  };
  var RCS_TOTAL_M3 = ft3(858.1);        // [derived] the ledger sum = 10 ring nodes + the vessel
  var UNATTRIBUTED_M3 = ft3(79.1);      // [derived] D1 §24 — 9.2 % of the total, DECLARED
  /* THE WHOLE REACTOR COOLANT SYSTEM, computed — nodes PLUS the Layer-5 vessel.
   * Four consumers used to sum NODES and call it the plant (CVCS volume scale, CVCS boron mass,
   * CVCS max fill rate, the ECCS accumulator, whose comment literally read "the whole RCS incl.
   * pressurizer"). That was accidentally right while the phantom node existed and would have
   * silently cut charging and accumulator inventory 15 % the moment it went. One function now,
   * so the next consumer cannot get it wrong: #583. */
  function rcsVolume() {
    var V = 0;
    for (var i = 0; i < NODES.length; i++) V += NODES[i].V;
    return V + LEDGER.pressurizer.m3;
  }

  /* ================================================================ NODES
   * The topology is D3 §2's, less its `pressurizer` row — TEN nodes since #583, because the
   * pressurizer is Layer 5's vessel and a ring node of that name double-counted it. Volumes
   * below are what §2's table never carried.
   *
   * VESSEL SPLIT — *(OWNER RULING, 2026-08-14: selected "Scale from real-plant proportions")*.
   * Almaraz vessel internal fractions, [sourced] NUREG/IA-0444 Table 6:
   *   upper head 11.7 % · upper plenum 27.8 % · core 14.0 % · lower plenum 20.0 %
   *   DOWNCOMER 19.8 % · residual (guide tubes, bypass, supports) 6.6 %
   *
   * WHY NOT THE AREA RULE: it gives a 79 mm annular gap, NARROWER than the 93 mm already
   * found mechanically unbuildable, and a downcomer at 14.2 % of the vessel against a real
   * plant's 19.8 % — under-sized ~28 %. Three independent methods agreed on that direction
   * (D3 §7.0a). The rule is wrong here, not the arithmetic.
   *
   * ELEVATIONS: [derived] from PWR_LOOP_GEOMETRY.md §5's layout, core midplane = 0.
   * ⚠ That section's LENGTHS are NOT used — see LOOP below. Its elevations survive because a
   * longer horizontal run does not change where a nozzle sits. */
  var NODES = [
    { id: 'downcomer',   V: ft3(62.5), z: -0.30, transport: 'plug',    wallLumps: 3,
      kind: '[derived]', note: 'Almaraz 19.8 % of vessel; thick vessel wall, Biot not small' },
    { id: 'lower_plenum',V: ft3(49.0), z: -2.60, transport: 'stirred', wallLumps: 2,
      kind: '[derived]', note: 'remainder x Almaraz lower/upper ratio' },
    { id: 'core',        V: ft3(72.8), z:  0.00, transport: 'plug',    wallLumps: 1,
      kind: '[derived]', note: '21 assemblies x 3.53 m3 x 0.584 lattice coolant fraction — INDEPENDENT of the vessel split' },
    { id: 'upper_plenum',V: ft3(67.9), z:  2.60, transport: 'stirred', wallLumps: 2,
      kind: '[derived]', note: 'remainder x Almaraz lower/upper ratio' },
    { id: 'vessel_heads',V: ft3(62.9), z:  3.60, transport: 'stirred', wallLumps: 1,
      kind: '[sourced]', note: 'hemispherical pair; CASL-U-2012-0131-004 Table 16 + WTSM §3.1' },
    { id: 'hot_leg',     V: ft3(34.30),z:  2.44, transport: 'plug',    wallLumps: 2,
      kind: '[derived]', note: 'Almaraz 3.18 m3 x 0.3054 — VERIFIED against the source 2026-08-14' },
    { id: 'sg_primary',  V: ft3(259.3),z:  8.00, transport: 'plug',    wallLumps: 1,
      kind: '[derived]', note: 'EPRI NP-1721 Model 51; thin tubing, heat sink to secondary' },
    { id: 'crossover',   V: ft3(38.82),z: -1.52, transport: 'plug',    wallLumps: 2,
      kind: '[derived]', note: 'Almaraz 3.60 m3 x 0.3054; loop-seal behaviour lives here' },
    { id: 'rcp',         V: ft3(28.1), z: -1.52, transport: 'stirred', wallLumps: 1,
      kind: '[derived]', note: 'sourced casing water 80 ft3, power-scaled' },
    { id: 'cold_leg',    V: ft3(34.85),z:  0.61, transport: 'plug',    wallLumps: 2,
      kind: '[derived]', note: 'Almaraz 3.23 m3 x 0.3054; ECCS injects here' }
    /* ⚠ THERE IS NO `pressurizer` NODE, and that is the fix, not an omission (#583). The
     * vessel is Layer 5's — three regions, its own volume, plugged into Layer 2's `extraMass`
     * seat — and a ring node of the same name double-counted it. See LEDGER.pressurizer above.
     * The topology is TEN nodes: nine on the ring plus `vessel_heads` off it. */
  ];

  /* ================================================================ LOOP RUNS
   * ⚠ TWO LENGTH SETS WERE LIVE AND THEY ARE INCOMPATIBLE. Resolved here in favour of the
   * SOURCED one, and the conflict is recorded rather than quietly dropped:
   *
   *   PWR_LOOP_GEOMETRY.md §5 (authored, "DECIDED"):  hot 10 ft, crossover 13, cold 8
   *   -> hot leg 25.1 in bore at 24.8 ft/s
   *   §1a-i's SOURCED rule (length unchanged from the reference plant):
   *   -> hot leg 16.3 in bore at 59.0 ft/s, which is the REFERENCE PLANT'S OWN VELOCITY,
   *      preserved by construction because area scales with flow
   *
   * The 108.1 ft3 piping volume — the number that matched the source to 0.3 % — was derived
   * ASSUMING lengths unchanged. Adopting §5's 10 ft would keep the volume and halve the
   * velocity, breaking the very rule that licensed the volume. So lengths are [sourced]. */
  var LOOP = {
    hot_leg:   { L: 7.25,  kind: '[sourced]', note: 'Almaraz 23.8 ft — NUREG/IA-0444 Table 7, verified 2026-08-14' },
    crossover: { L: 8.20,  kind: '[derived]', note: 'Almaraz crossover, same length-unchanged rule' },
    cold_leg:  { L: 7.40,  kind: '[derived]', note: 'Almaraz cold leg, same rule' },
    /* [derived], NOT [sourced] — and this file's own gate caught the difference. D1 §4 rules
     * the active fuel length at the standard 12 ft on a DESIGN argument ("a 300 MWt plant buying
     * custom-length fuel would be a poor design decision"), not from a document that states it.
     * That is exactly what [derived] means: computed from a stated rule written next to it. */
    core:      { L: 3.66,  kind: '[derived]', note: 'active fuel 12 ft — D1 §4 design rule: no custom-length fuel' },
    sg_primary:{ L: 20.24, kind: '[sourced]', note: 'average tube length 66.4 ft — EPRI NP-1721 Model 51' }
  };

  /* ⚠ FOUR RING NODES HAVE NO SOURCED FLOW LENGTH: downcomer, lower_plenum, upper_plenum, rcp.
   * They are needed for the loop inertia SUM(L/A) that Layer 4's momentum equation integrates.
   * MEASURED so the omission is a number rather than a shrug: the five sourced nodes above give
   * 232.9 1/m, and a generous estimate for the four missing ones adds ~13 1/m — **5.3 %**.
   * Layer 4 therefore builds momentum on the sourced five and DECLARES the ~5 % it omits.
   * Do not paper over this by inventing lengths: the vessel nodes have large flow areas, so
   * their contribution is genuinely small, and a fabricated length would look identical to a
   * sourced one in six months. It is on the geometry evidence list (§7). */
  var LOOP_INERTIA_OMITTED = 0.053;

  /* ================================================================ METAL WALLS (#574)
   * *(OWNER, 2026-08-12, on #474: "each node should carry the heat capacity of its own metal
   * wall, not just the fluid it contains ... thermal lag through cladding/tube walls, RCP casing
   * warm-up, RPV wall stored heat during a cooldown.")* — built for EVERY node
   * *(OWNER RULING, 2026-08-28: "All eleven nodes", from three costed options; there are ten
   * since #583 deleted the phantom pressurizer, and the ruling was "every one", not "eleven")*.
   *
   * ⚠ THE RULING WAS TAKEN AGAINST A MEASUREMENT THAT PARTLY OVERTURNED ITS OWN PREMISE. The
   * comment above guessed "the U-tubes and RCP casing are probably where it matters most".
   * Measured before designing (HR12): the ring's FLUID heat capacity is 93,855 kJ/K, and against
   * it the tubes and casing are ~9 % between them while the REACTOR VESSEL is ~25 %. The whole
   * metal set is ~40 % of the fluid. The vessel is the term that decides a cooldown.
   *
   * ⚠ AND THE BLAST RADIUS IS SET BY CONDUCTION TIME, NOT BY THAT 40 %. A tube wall is 1.27 mm
   * and tracks its fluid in seconds — it brings its whole capacity to a fast transient. The
   * vessel shell is ~114 mm and its own diffusion time t^2/alpha is ~1,080 s, so a 30-second
   * transient reaches only its inner lump. THAT IS WHAT `wallLumps` IS FOR, and it is why this
   * change should move cooldowns hard and trips barely at all.
   *
   * WHAT EACH NUMBER IS MADE OF — nothing here is typed, everything is computed from a stated
   * rule so the derivation cannot drift away from the value:
   *
   *   PIPES      bore from this file's OWN V/L, wall thickness scaled from the sourced
   *              reference (ML11223A213 Table 3.2-1) by the same r_D diameter rule the volumes
   *              use. ⚠ Do NOT take PWR_LOOP_GEOMETRY.md's M_wall table — it is computed on the
   *              §5 lengths this file explicitly REJECTED (see LOOP above).
   *   SG TUBES   from the SOURCED heat-transfer area (18,135 ft2, EPRI NP-1721 Model 51) and
   *              the Model 51 tube size. CROSS-CHECK, and it is a strong one: the tube INNER
   *              volume implied by that area and bore is 7.343 m3 against this file's
   *              independently derived sg_primary node volume of 7.3426 m3 — 0.006 %. Two
   *              numbers that were never fitted to each other agree, so the tube geometry is
   *              consistent with the volume ledger.
   *   VESSEL     ASME thin-wall at the code-safety design pressure, t = P*r/(S - 0.6P) — the
   *              IDENTICAL method pwr_config.js used for the pressurizer vessel, and one the
   *              owner ruled acceptable *(OWNER RULING, 2026-08-15: "Go with your
   *              recommendations")* on the argument that a MASS is something a document can
   *              later settle where a gain never could. The shell goes to the DOWNCOMER (it is
   *              the annulus against the vessel wall), the heads to the plenum and head nodes.
   *   INTERNALS  the core barrel is DERIVED from the downcomer annulus this file already fixes;
   *              the support structures are a flat ESTIMATE and are the least defensible number
   *              in this block. Marked separately so they can be replaced alone.
   *
   * ⚠ THE FUEL IS NOT HERE. `pwr2_fuel.js` owns the rods' thermal mass; adding it again as
   * "core wall" would double-count the one metal capacity the plant already had. */
  var WALL_MAT = {
    /* SA-508 / SA-533B pressure-boundary steel — the pipes, the vessel, the heads. [derived
     * from standard property tables; cp matches the 0.5 pwr_config uses for the same steel] */
    cs:    { rho: 7850, cp: 0.50,  k: 40, name: 'carbon / low-alloy pressure steel' },
    /* Inconel 600 — Model 51 tubing. */
    tube:  { rho: 8470, cp: 0.465, k: 15, name: 'Inconel 600 tubing' },
    /* Type 304 — core barrel, internals, pump casing. */
    ss:    { rho: 7900, cp: 0.50,  k: 16, name: 'Type 304 stainless' }
  };
  var IN_M = 0.0254;
  /* the reference plant's sourced pipe sizes, ML11223A213 Table 3.2-1 (inches) */
  var REF_PIPE = { hot_leg:   { D: 29.0, t: 2.84 },
                   crossover: { D: 31.0, t: 2.99 },
                   cold_leg:  { D: 27.5, t: 2.69 } };
  /* ASME thin-wall inputs. 17.13 MPa is the code-safety design pressure this plant is built to
   * (pwr2_pressurizer's safety setpoint); 138 MPa is the SA-533B allowable at temperature. */
  var ASME = { P_design_mpa: 17.13, S_allow_mpa: 138 };
  function asmeT(r_m) { return ASME.P_design_mpa * r_m / (ASME.S_allow_mpa - 0.6 * ASME.P_design_mpa); }

  /* ---- the derivations, run once at load so the numbers ARE their rule ---------------------- */
  var WALLS = (function () {
    var w = {}, i;
    function nodeV(id) { for (i = 0; i < NODES.length; i++) if (NODES[i].id === id) return NODES[i].V; }

    /* PIPES ---------------------------------------------------------------------------------- */
    ['hot_leg', 'crossover', 'cold_leg'].forEach(function (id) {
      var L = LOOP[id].L, A = nodeV(id) / L, D = Math.sqrt(4 * A / Math.PI);
      var t = REF_PIPE[id].t * IN_M * (D / (REF_PIPE[id].D * IN_M));   /* same r_D rule as the volumes */
      var Vm = Math.PI * t * (D + t) * L;
      w[id] = { M_kg: Vm * WALL_MAT.cs.rho, A_m2: Math.PI * D * L, t_m: t, mat: 'cs',
                kind: '[derived]', note: 'bore ' + (D / IN_M).toFixed(2) + ' in from V/L; wall ' +
                      (t / IN_M).toFixed(3) + ' in, ML11223A213 Table 3.2-1 scaled by r_D' };
    });

    /* SG TUBES ------------------------------------------------------------------------------- */
    var TUBE_OD = 0.875 * IN_M, TUBE_WALL = 0.050 * IN_M;   /* [sourced] EPRI NP-1721 Model 51 */
    var TUBE_ID = TUBE_OD - 2 * TUBE_WALL;
    var A_out = 18135 / 10.7639;                            /* [sourced] m2, the SAME area pwr2_sg uses */
    var L_tube_total = A_out / (Math.PI * TUBE_OD);         /* total tube length, m */
    var A_in = Math.PI * TUBE_ID * L_tube_total;
    var Vm_tube = Math.PI / 4 * (TUBE_OD * TUBE_OD - TUBE_ID * TUBE_ID) * L_tube_total;
    w.sg_primary = { M_kg: Vm_tube * WALL_MAT.tube.rho, A_m2: A_in, t_m: TUBE_WALL, mat: 'tube',
                     kind: '[derived from sourced]',
                     note: 'Model 51 0.875 in OD x 0.050 in wall over the sourced 18,135 ft2; the ' +
                           'implied tube-bore volume reproduces this file\'s own sg_primary node' };
    /* the cross-check itself, published so a consumer can assert it rather than trust this note */
    w.sg_primary.V_implied_m3 = Math.PI / 4 * TUBE_ID * TUBE_ID * L_tube_total;

    /* VESSEL --------------------------------------------------------------------------------- */
    /* internal volume = the five vessel-side nodes, grossed up by Almaraz's 6.6 % residual */
    var V_vessel = (nodeV('downcomer') + nodeV('lower_plenum') + nodeV('core') +
                    nodeV('upper_plenum') + nodeV('vessel_heads')) / (1 - 0.066);
    var LD = 2.5;                                            /* [derived] RPV proportion, declared */
    var D_v = Math.cbrt(4 * V_vessel / (LD * Math.PI)), L_v = LD * D_v, r_v = D_v / 2;
    var t_v = asmeT(r_v);
    var Vm_shell = Math.PI * L_v * t_v * (D_v + t_v);
    var Vm_head  = 2 * Math.PI * r_v * r_v * t_v;            /* one hemisphere */
    /* THE SHELL IS THE DOWNCOMER'S WALL. The downcomer is the annulus between the barrel and
     * the vessel, so it is the node whose water touches the pressure boundary — which is also
     * why this file already gives it wallLumps: 3 and the note "thick vessel wall, Biot not
     * small". The two agree, and neither was written for the other. */
    w.downcomer = { M_kg: Vm_shell * WALL_MAT.cs.rho, A_m2: Math.PI * D_v * L_v, t_m: t_v, mat: 'cs',
                    kind: '[derived]', note: 'RPV shell, ASME t = ' + (t_v * 1000).toFixed(0) +
                          ' mm at ' + ASME.P_design_mpa + ' MPa; ID ' + D_v.toFixed(3) + ' m' };
    w.lower_plenum = { M_kg: Vm_head * WALL_MAT.cs.rho, A_m2: 2 * Math.PI * r_v * r_v, t_m: t_v,
                       mat: 'cs', kind: '[derived]', note: 'lower hemispherical head' };
    w.vessel_heads = { M_kg: Vm_head * WALL_MAT.cs.rho, A_m2: 2 * Math.PI * r_v * r_v, t_m: t_v,
                       mat: 'cs', kind: '[derived]', note: 'upper hemispherical head' };

    /* CORE BARREL — derived from the downcomer annulus, which this file already fixes.
     * The barrel's OD follows from the vessel ID and the downcomer volume over the core height. */
    var L_dc = LOOP.core.L + 0.34;                           /* [derived] active fuel + lower nozzle */
    var d_barrel = Math.sqrt(D_v * D_v - 4 * nodeV('downcomer') / (Math.PI * L_dc));
    var t_barrel = 0.050;                                    /* [estimate] 50 mm, standard barrel */
    var Vm_barrel = Math.PI * t_barrel * d_barrel * L_dc;
    w.core = { M_kg: Vm_barrel * WALL_MAT.ss.rho, A_m2: Math.PI * d_barrel * L_dc, t_m: t_barrel,
               mat: 'ss', kind: '[derived]',
               note: 'core barrel, OD ' + d_barrel.toFixed(3) + ' m from the downcomer annulus. ' +
                     'THE FUEL IS NOT HERE — pwr2_fuel owns the rods' };

    /* ⚠ THE SUPPORT STRUCTURES ARE THE WEAKEST NUMBER IN THIS FILE and are marked so they can
     * be replaced without touching anything else. No corpus document gives an internals weight.
     * 6,000 kg apiece for the upper support/guide-tube assembly and the lower core plate is an
     * ENGINEERING ESTIMATE of the same class as PWR_LOOP_GEOMETRY.md's pump casing, and of the
     * same class the owner accepted for the pressurizer vessel mass — a MASS a document can
     * settle later. It is ~13 % of the metal total, so it is not where the answer comes from. */
    var M_support = 6000;
    w.upper_plenum = { M_kg: M_support, A_m2: 40, t_m: 0.060, mat: 'ss', kind: '[estimate]',
                       note: 'upper support / guide tubes — UNSOURCED, replace when a weight surfaces' };
    Object.assign(w.lower_plenum, {});                        /* head only; the core plate rides below */
    w.lower_plenum.M_kg += M_support;
    w.lower_plenum.note += ' + lower core plate [estimate], UNSOURCED';
    w.lower_plenum.kind = '[derived + estimate]';

    /* RCP CASING ----------------------------------------------------------------------------- */
    /* ⚠ PWR_LOOP_GEOMETRY.md's 5,300 lbm is NOT reusable: it was computed on a 9.5 ft3 casing
     * cavity, and this file's rcp node is 28.1 ft3 (sourced casing water, power-scaled). The
     * METHOD is reused instead — a shell 2.5x the adjoining cold-leg pipe wall — on this file's
     * own cavity, so the estimate is consistent with the geometry it sits in. Squat proportion
     * L/D = 1.3, a single-stage centrifugal casing. [estimate], as the source method is. */
    var V_rcp = nodeV('rcp'), LD_p = 1.3;
    var D_p = Math.cbrt(4 * V_rcp / (LD_p * Math.PI)), L_p = LD_p * D_p;
    var t_p = 2.5 * w.cold_leg.t_m;
    w.rcp = { M_kg: Math.PI * t_p * (D_p + t_p) * L_p * WALL_MAT.ss.rho,
              A_m2: Math.PI * D_p * L_p, t_m: t_p, mat: 'ss', kind: '[estimate]',
              note: 'casing shell 2.5x the cold-leg wall (PWR_LOOP_GEOMETRY method) on THIS ' +
                    'file\'s 28.1 ft3 cavity — its own 5,300 lbm is on a 9.5 ft3 one' };

    /* PRESSURIZER — DELIBERATELY ABSENT (#583) ------------------------------------------------
     * There was a `w.pressurizer` here, 8,708 kg / 4,354 kJ/K on an ASME shell derived from the
     * ring node's own 3.5453 m3. The NODE was a double count of the Layer-5 vessel and is gone,
     * and the header this block used to carry said so: "if #583 resolves by deleting the node,
     * the wall moves with it and there is one place to change rather than two." It did, so it has.
     *
     * ⚠ THE PLANT REALLY HAS THAT METAL — this file is not the place it now belongs.
     * `pwr2_pressurizer.js` declares "Wall metal is not modelled (no heat capacity, no wall
     * condensation)", so the vessel's shell is owed to LAYER 5, where it would damp the
     * heater-driven pressure rate and add a condensation surface. Filed as its own issue rather
     * than smuggled in here on a node that does not exist. WALLS is keyed by NODE ID and every
     * node must have one (the gate asserts it); a Layer-5 vessel is not a node. */
    return w;
  })();

  /* the metal:fluid ratio, published so a gate can pin it rather than re-derive it */
  function wallMassTotal() {
    var m = 0; Object.keys(WALLS).forEach(function (k) { m += WALLS[k].M_kg; }); return m;
  }

  /* Form losses — the ONLY [recalled] family in this file, and it is ruled.
   * *(OWNER RULING, 2026-08-14: selected "Declare unsourced, proceed")* after a dedicated
   * evidence pass found nothing in any lane's corpus or in NUREG/IA-0444. They feed the
   * pump-head CROSS-CHECK, not plant behaviour: a 30 % error moves derived head ~18 %.
   * DO NOT back these out of the sourced pump head — that was the rejected option, and it
   * would make the pump-head comparison circular, destroying the one non-circular
   * constraint this geometry has passed (D3 §1a-v). */
  var FORM_LOSS_K = {
    per_leg:            { K: 1.75, kind: '[recalled]', note: 'range 1.5-2.0; UNSOURCED, ruled to stand' },
    grid_spacers:       { K: 7.0,  kind: '[recalled]', note: 'UNSOURCED, ruled to stand' },
    tube_entrance_exit: { K: 2.5,  kind: '[recalled]', note: 'UNSOURCED, ruled to stand' }
  };

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.geometry = {
    NODES: NODES, LEDGER: LEDGER, LOOP: LOOP, FORM_LOSS_K: FORM_LOSS_K,
    LOOP_INERTIA_OMITTED: LOOP_INERTIA_OMITTED,
    /* THE METAL WALLS (#574). One entry per node, keyed by node id; every node has one, which
     * is the point — `wallLumps` shipped on every node with zero consumers for months and read
     * as a working feature. A node missing from here is a defect, and the gate says so. */
    WALLS: WALLS, WALL_MAT: WALL_MAT, ASME: ASME, wallMassTotal: wallMassTotal,
    RCS_TOTAL_M3: RCS_TOTAL_M3,
    /* THE WHOLE RCS, computed: nodes + the Layer-5 vessel. Consumers that mean "the plant" call
     * THIS, not `Σ NODES` — which stopped being the plant when #583 deleted the phantom node. */
    rcsVolume: rcsVolume,
    UNATTRIBUTED_M3: UNATTRIBUTED_M3,
    /* The declared band travels WITH the data, so a consumer cannot read the volumes
     * without meeting the uncertainty. D1 §24.
     * 0.121 -> 0.092 at #583: NOT a re-band. The pressurizer row was a 125.2 ft3 placeholder
     * against a 135.3 ft3 reference target; #472's real vessel is 147.5, so 22.3 ft3 of the
     * declared shortfall is now attributed. The gate's floor moved with it, and its own comment
     * says why. */
    INVENTORY_UNCERTAINTY: 0.092,
    ALMARAZ_VESSEL_FRACTIONS: {                       // [sourced], kept for re-derivation
      upper_head: 0.117, upper_plenum: 0.278, core: 0.140,
      lower_plenum: 0.200, downcomer: 0.198, residual: 0.066
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
