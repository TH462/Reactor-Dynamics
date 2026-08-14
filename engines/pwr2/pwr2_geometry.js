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
 * **The RCS volume ledger carries a 12.1 % unattributed fraction** — 101.4 ft³ (2.87 m³) of
 * 835.8 ft³ (23.67 m³). Inventory-dependent timings (boil-off, time to uncovery, ECCS
 * adequacy margins) are good to about ±12 % and NO BETTER. Declared, not hidden: D1 §24.
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
    pressurizer:  { m3: ft3(125.2), kind: '[derived]', note: '#472 owns the model; volume from the design basis' }
  };
  var RCS_TOTAL_M3 = ft3(835.8);        // [derived] the ledger sum
  var UNATTRIBUTED_M3 = ft3(101.4);     // [derived] D1 §24 — 12.1 % of the total, DECLARED

  /* ================================================================ NODES
   * The 12-node topology is D3 §2. Volumes below are what §2's table never carried.
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
      kind: '[derived]', note: 'Almaraz 3.23 m3 x 0.3054; ECCS injects here' },
    { id: 'pressurizer', V: ft3(125.2),z:  9.00, transport: 'stirred', wallLumps: 1,
      kind: '[derived]', note: '#472 owns the model — three states, D2 §25.2' }
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
    hot_leg:   { L: 7.25, kind: '[sourced]', note: 'Almaraz 23.8 ft — NUREG/IA-0444 Table 7, verified 2026-08-14' },
    crossover: { L: 8.20, kind: '[derived]', note: 'Almaraz crossover, same length-unchanged rule' },
    cold_leg:  { L: 7.40, kind: '[derived]', note: 'Almaraz cold leg, same rule' }
  };

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
    RCS_TOTAL_M3: RCS_TOTAL_M3,
    UNATTRIBUTED_M3: UNATTRIBUTED_M3,
    /* The declared band travels WITH the data, so a consumer cannot read the volumes
     * without meeting the uncertainty. D1 §24. */
    INVENTORY_UNCERTAINTY: 0.121,
    ALMARAZ_VESSEL_FRACTIONS: {                       // [sourced], kept for re-derivation
      upper_head: 0.117, upper_plenum: 0.278, core: 0.140,
      lower_plenum: 0.200, downcomer: 0.198, residual: 0.066
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
