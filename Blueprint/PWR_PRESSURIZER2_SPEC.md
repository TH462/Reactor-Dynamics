# PWR Pressurizer v2 — build specification (#472, Phase 2)

**Status: SPEC, awaiting owner ruling on §7.** Written to the ruled scope
(`PWR_PRESSURIZER_REBUILD.md` §0) and calibrated against the Phase-1 characterisation
(`Diagnostic/PZR_CHARACTERIZATION.md`), which is the authority for every "measured today"
number below. Acceptance rows are `PWR_BEHAVIOR_CATALOG.md` §13 (v4.0, ruled 2026-08-12).

---

## 1. What is being replaced, and what is not

Phase 1 narrowed the job. The surge→pressure coupling **already works** — a load swing
peaks +27 psi, a trip troughs −54 psi. What is wrong is the **equilibrium**: both events
relax back to the operator's setpoint with heaters and spray delivering 0 %, because
`P_restore_rate_gain` is a term in the physics that has no physical referent.

| | v2 | why |
|---|---|---|
| Subcooled, pressurizer-governed pressure | **REBUILT** — two regions, saturation between | where all four accreted authorities and the §5 defect live |
| Level / inventory | **REBUILT as geometry**, ledger PORTED | level becomes `V_liq/V_pzr`; the void-credit ledger keeps its algebra (see §3.4) |
| Saturated / blowdown branch (`K_sat_pull`, `K_break_vent`, S7 floor) | **PORTED nearly verbatim** | it models *loop* flashing wearing a pressurizer address; the loop is #474's scope, not this rebuild's. **Declared narrowing inside scope B** |
| Relief hydraulics (`relief()`), tailpipe, `levelProgram` | **PORTED** | recent, sourced, and not implicated. `levelProgram` is a control law, not physics |

---

## 2. The structure

Two regions in one vessel, saturation between them.

### 2.1 State (new `true_state` fields — each needs a §6.3 contract line)

| Field | Unit | Meaning |
|---|---|---|
| `pzr_m_liq_kg` | kg | liquid region mass |
| `pzr_m_stm_kg` | kg | steam region mass |
| `pzr_t_liq_c` | °C | liquid region temperature (may be subcooled after a cold insurge or spray) |
| `pzr_t_stm_c` | °C | steam temperature — **published = Tsat(P)**, see §2.4 |
| `pzr_surge_kgps` | kg/s | realized surge, + = insurge. The consumed successor of the write-only `_pzr_surge_flow` |

Preserved, same names and meanings: `pressure_mpa`, `pzr_level_pct`, `pzr_mass_frac`
(now `pzr_m_liq_kg / M_rcs_kg`, so `ui/app.js:251-271` keeps working), `spray_flow_pct`,
`porv_flow`, `safety_flow`, `tailpipe_temp_c`, `heater_power_frac`, `spray_flow_frac`,
`_heater_cut`, `_heater_shed`, `_pressure_sp_eff`.

### 2.2 Level is geometry

```
V_liq            = pzr_m_liq_kg / rho_liq(pzr_t_liq_c, P)
pzr_level_pct    = 100 * V_liq / V_pzr_m3          (unclipped internally; gauge clips 0..100)
```

No reference leg, no calibrated span — consistent with the existing declaration
(`Manuals/12` §12.12). **`level_per_mass` = 776 %/frac stops being a `[tune]` constant and
becomes a geometric identity**:

```
100 * M_rcs_kg / (rho_liq * V_pzr_m3)  ==  776          [CALIBRATION CONSTRAINT]
```

`V_pzr_m3` and `M_rcs_kg` are solved together against this identity in Phase 3a and
asserted by `CV-3`. Nothing is transcribed: the probe computes both sides from config, the
way `CA-12` and `CA-15` already compute the solid point.

### 2.3 Pressure is the steam region's state

```
rho_stm_target   = pzr_m_stm_kg / (V_pzr_m3 - V_liq)
P                relaxed toward the P satisfying rho_g_sat(P) = rho_stm_target
```

`rho_g_sat(P)` is a new saturated-vapour-density correlation living beside the existing
`P_sat_from_T`, both exported. Relaxation uses the house idiom
(`x += (target - x) * dt / (tau + dt)`), not a Newton solve.

**This is where the sourced anchor lands — and the direction is the OPPOSITE of what this
spec first said. Correction, 2026-08-12, before any code was written.**

`solid_bulk_mpa`'s comment carries the check: isothermal bubble compression gives
`dP/dm_frac = P · V_RCS / V_steam`, which on the sourced geometry (BVPS-2 UFSAR Tbl 5.1-1
RCS 9,650 ft³; WTSM 3.2 Tbl 3.2-2 full-power steam volume 720 ft³) is **206 MPa/frac**. The
comment compares that to *"the shipped `K_surge_level · level_per_mass` = 310"* and
concludes the two agree to within 50 %.

**That comparison is STALE and this spec repeated it.** `K_surge_level` was **0.4** when
the comment was written (0.4 × 776 = 310.4 ✓); it has been **0.032 since #419 wave 3** — a
12.5× reduction the comment never followed. The shipped gain is therefore

```
K_surge_level × level_per_mass  =  0.032 × 776  =  24.8 MPa/frac
```

**~8.3× SOFTER than the sourced figure, not 1.5× stiffer.** The first draft of this section
asserted the opposite because it inherited a number from a comment instead of multiplying
the live constants — the standing trap *"verify a claim before you act on it; an inherited
claim is the risky one"*, committed and then caught by arithmetic.

**On this plant's own declared volumes** (RCS currency 7,467 gal = 28.26 m³ from the
`K_porv_relief` block; `V_pzr_m3` = 4.29 m³ derived from the §2.2 identity; steam space at
55 % level = 1.93 m³):

```
dP/dm_frac = 15.41 × 28.26 / 1.93 = 226 MPa/frac
```

**The 24.8 figure is independently confirmed by measurement**, which is why it is the one
to trust: Phase 1's neutered load swing moved level 55.0 → 65.4 (10.4 points = 0.0134 frac)
and pressure **+48 psi peak = 0.33 MPa**, i.e. an effective **24.6 MPa/frac**. Theory and
plant agree to 1 %.

**Consequence the build must expect rather than discover.** A two-region model computes this
gain from geometry, so v2's bubbled surge response will be **roughly an order of magnitude
stiffer than v1's**, in the direction the source points. Phase 3b's first pressure
measurements will therefore diverge hugely from v1 — that is the rebuild working, not a
defect, and it is predicted here so it cannot later be adjudicated as a surprise. It also
raises a real question for §7's sibling: at 226 MPa/frac the Phase-1 insurge would move
pressure ~420 psi and lift the PORV, so **either the sourced geometry or the surge
magnitude needs a second look during 3b** — with the manual-mode rows as the arbiter.

`K_surge_level` ceases to exist either way. This remains the strongest evidence that the
rebuild is a re-derivation rather than a re-dressing: the check sat in the config for
months, the constant it checked moved 12.5×, and nothing connected the two.

### 2.4 Declared simplifications (both revisitable, neither free)

- **The steam region is always saturated at P.** No independent superheat state: it is a
  stiff second solve with no acceptance row behind it. Consequence: a steam space cannot be
  superheated by the heaters alone.
- **A wall-metal node IS REQUIRED. This reverses an earlier deferral in this same spec, and
  the reversal is the point.** It was written off as "second-order, nothing bands on it".
  §7's arithmetic then showed it is **the** term setting heater authority: 1794 kW into the
  pressurizer liquid alone gives **5.8 psi/s**, with 10 t of vessel metal **3.6**, with 20 t
  **2.6** — a 2.2× swing in the quantity an owner ruling was about to be requested on.
  A node is only "second-order" with respect to the rows you happened to look at; this one
  sets the headline number. Vessel mass needs a source (WTSM 3.2 Tbl 3.2-2 class) or an
  explicit declared estimate — **not** a `[tune]`, because it is a mass and masses are
  measurable.

### 2.5 Flash and condense — the emergent surge gain

```
T_liq > Tsat(P):  m_flash = m_liq*cp*(T_liq - Tsat) / (h_fg * flash_tau_s)   liquid -> steam, liquid cools
T_liq < Tsat(P):  m_cond  = (symmetric, cond_tau_s)                          steam -> liquid
```

An outsurge grows the steam volume → `rho_stm` falls → P falls → Tsat falls below T_liq →
flashing partially restores P. **That is the surge→pressure gain, emergent from geometry
and one time constant** instead of `K_surge_level`.

**THE FLASH MUST BE SOLVED IMPLICITLY — measured, 2026-08-12, and it is a 4× error.** As
pressure rises, saturation temperature rises with it, so part of the delivered heat warms
the liquid and metal to the *new* Tsat and only the remainder flashes. The full balance is

```
Q·dt  =  m_flash · h_fg(P_new)  +  C · (Tsat(P_new) − Tsat(P_old))
```

which is implicit in `P_new` and is solved by bisection on `m_flash`. Flashing against the
OLD Tsat — the obvious explicit form — puts **all** the energy into latent heat and reads
**10.77 psi/s where the correct answer is 2.61**. This was caught by the first
region-level test rather than by a gate, and it is precisely the class of error a fitted
gain absorbs invisibly: v1 would simply have been re-tuned to whatever the explicit form
produced.

**Two results that only exist because the gain is gone.** Full-heater authority computes to
**2.61 psi/s at 55 % level**, and it **varies with level** — 2.85 psi/s at 25 %, 2.37 at
90 % — because a fuller pressurizer has more liquid to heat. v1 carried one constant for
every level. (The analytic estimate in §7 gave 3.44 psi/s because it counted only
`C · dTsat/dP` and ignored the latent heat of the flashed mass; 2.61 is the complete
balance and supersedes it. Both are ~20–30× below the shipped 80 psi/s and ~11× above the
config's mis-derived 0.23 psi/s "ceiling".) It also gives the plant a bubble draw
for free: heaters on a solid vessel raise T_liq to Tsat and create the steam region, which
is the evolution `Manuals/04` PWR-N01 currently has no step for (WTSM 19.2.2 makes it the
first evolution of a heatup).

### 2.6 Heaters — power, elevation, and two independent limiters

```
Q_heater = heater_power_frac * heater_power_mw * 1e6 * heater_authority_mult * wetted_frac
wetted_frac = clip((level_true - heater_elev_bot_pct)
                 / (heater_elev_top_pct - heater_elev_bot_pct), 0, 1)
```

- `heater_power_mw = 1.794` — **sourced** (S9, WTSM: 78 heaters, 1794 kW). Not `[tune]`.
- **THERE IS NO AUTHORITY MULTIPLIER.** *(OWNER, 2026-08-12: "why have a multiplier? why not
  have physics. how much does the real one output?")* — and the arithmetic agrees, see §7.
  Pressure rate is not a property of a heater; it is `Q / (C · dTsat/dP)`, an **output** of
  what the heat goes into. v1 needed `K_heater` because v1 has no thermodynamics to put the
  joules into. v2 does, so the constant disappears rather than being re-banded.
- `wetted_frac` reads **TRUE** level: it is physics, not an instrument reading.
- **The S1 bistable survives untouched in `autoControl`, reading INDICATED level** (HR1)
  *(OWNER RULING, 2026-08-12: "keep both")*. Two different things: the latch is the plant
  protecting its hardware; `wetted_frac` is what an uncovered rod can physically heat.

**Proposed elevations: `heater_elev_top_pct = 15.0`, `heater_elev_bot_pct = 5.0`** — the
bank sits *below* the 17 % cutoff, which is the whole point of the cutoff (it fires before
uncovery, not after). S2 puts the bank *"in the lower portion of the pressurizer vessel."*

**The educational consequence, which is the Q3 argument for building it at all:** with a
healthy transmitter the player never sees `wetted_frac` move — the latch protects first, as
designed. It becomes visible exactly when indicated and true level **diverge** — the TMI
deception. A deceived gauge reads high, the latch does not cut, and the heaters are then
running in steam. **FG-8's two halves are the same lesson**, and #334 is the record of what
that state does when nothing bounds it.

### 2.7 Spray, relief, solid

- **Spray**: `m_cond_spray = spray_kgps * cp * (Tsat - T_spray) / h_fg`, spray water and
  condensate join the liquid region; `T_spray` = cold-leg temperature; scaled by
  `flow_frac` (no RCP, no spray) as today. **"No bubble, no spray" (#347) becomes
  emergent** — `m_stm → 0` leaves nothing to condense, so the load-bearing §12.4c
  declaration stops being a special case and becomes a consequence. The Psat(Thot) taper
  is KEPT as a guard (its subject is loop boiling, which we still do not model).
  `spray_flow_pct` still publishes delivered flow (the #350 indication split).
- **Relief**: PORV and safeties draw **steam** from the steam region. `relief()` ports
  verbatim (block valve, `porv_stuck_frac`, √Δp against live containment). **Relief-is-not-
  surge becomes structural** — drawing steam does not move the liquid level, so `TD-5`
  stops being a fitted admittance case and becomes geometry. When solid the valve draws
  liquid and §2.8 applies.
- **Solid** (`V_liq >= V_pzr_m3`): `dP = bulk_mod_eff_mpa * dV_net / V_total`, no steam
  solve. Calibrated to reproduce the arrest at ~109.3 % inventory (`SA-1`). Spray pressure
  authority and heater flashing are both zero **by construction**, which collapses the four
  separately-gated solid patches (#346, #347, #361, 2026-08-07) into one regime.
  **Numerical note:** integrate implicitly and sub-step if `dt·dP` exceeds a band. A ringing
  solid branch is fixed by the integrator, **never** by lowering the gain.

### 2.8 What is NOT rebuilt: the saturated/blowdown branch

Entry predicate unchanged (`primary_void_fraction > 0 || Psat(Tavg) > P`). `K_sat_pull`,
`K_break_vent`, the `vfVent` weakening and the S7 containment floor move to the v2 config
block **with their comments intact**. They are recent, sourced, and #384/#408-hardened, and
their subject is the loop. Re-deriving them here would mean modelling loop flashing, which
is #474.

---

## 3. The surge line as a node boundary (#474 must not be blocked)

Today the boundary is three code sites: the identity `p_hotleg = pressure_mpa`
(`pwr_primary.js:30`), a one-step-late `_dmass_dt` in, and a **write-only**
`_pzr_surge_flow` out. v2 replaces that with a named contract.

**In**: `_surge_demand_m3s` (+ toward the pressurizer), `_surge_t_c` (insurge enthalpy =
hot-leg temperature; an outsurge leaves at `pzr_t_liq_c`), `p_hotleg`.
**Out**: `pzr_surge_kgps`, `pressure_mpa`.

```
surgeDemand(s, cfg) = thermal   (beta * V_loop * _dTavg_dt — the re-expression of
                                 level_per_tavg, KEEPING #384-s4's floored-base suppression)
                    + inventory (_dmass_dt with relief added back — relief is not a surge)
                    + void      (the PORTED ledger, §3.4)
```

**`surgeDemand` lives inside `pwr_pressurizer2.js` during the bridge**, marked *"moves to
the hot-leg node at #474"*. Build-alongside means v1-path files stay untouched; #474
inherits a **contract**, not a location. The lumped loop simply wears a node's interface
until there is a node.

### 3.4 The void ledger is PORTED, not re-derived — and this is the honest part

A two-region model produces the deception's **shape** for free (a growing bubble raises
level) but **not its calibration**, because the void *source* is loop bookkeeping —
`pwr_primary.js:441`, `void = clip((1-m)*3.0, 0, 1)` gated on subcooling — and the loop is
out of scope. So the ledger keeps its algebra, re-expressed as a boundary volumetric flow:
flow-form accretion, the `w = void_weight_surge_ref / (ref + leak_flow)` split, unweighted
collapse, the ≥ 0 floor. **Anyone promising the deception "falls out of better physics" is
promising #474's work.** `TD-1`/`TD-2` are algebra-preserving by construction, so any drift
in them during the build is a **conversion bug**, not a recalibration.

---

## 4. Module, switch, config

**`engines/pwr/pwr_pressurizer2.js`** — same idiom as every engine file: IIFE onto
`globalThis.RD`, pure functions over `(s, cfg, dt)`, SI internal, no import/export.

Public surface (a drop-in for the engine's load-time-cached `PZ`): `P_sat_from_T`,
`rho_g_sat`, `effectiveSetpoint`, `autoControl`, `relief`, `stepPressure`, `stepLevel`,
`stepTailpipe`, `levelBase`, `levelProgram`, `surgeDemand`. **`levelRaw` and `pzrNodeLevel`
are NOT on the v2 surface** — probes calling them are refit territory (§6).

**Switch** (disposable; dies at cutover). The file is model *and* selector:

```js
var sel = (RD.PWR_CONFIG.pressurizer2.enabled === 1)
       || (typeof process !== 'undefined' && process.env.RD_PZR2 === '1')
       || (typeof location !== 'undefined' && /[?&]pzr2=1/.test(location.search));
if (RD.PWREngine) throw new Error('pwr_pressurizer2.js must load BEFORE pwr_engine.js');
if (sel) RD.pwrPressurizer = RD.pwrPressurizer2;
```

`pwr_engine.js:22` caches `PZ = RD.pwrPressurizer` at load time, so ordering is what makes
this work and the throw is what makes mis-ordering loud instead of silently-v1. One
`require`/`<script>` line goes into each of the ~28 load-list carriers, guarded by a grep
parity check (anything loading `pwr_pressurizer.js` must also load the v2 file).
`measure_stack` and `_perturb_child` get a `--pzr2` flag in the same pre-load slot as
`--nudge` (a nudge cannot flip 0→1 by multiplication), stamping
`MODEL: pressurizer2 — NOT THE SHIPPED PLANT` in the header.

**Config**: a new `pressurizer2:` block; the v1 block is untouched until cutover.
`enabled: 0` · `V_pzr_m3`, `M_rcs_kg` (solved against §2.2) · `heater_power_mw: 1.794`
(sourced) · `heater_authority_mult` (§7) · `heater_elev_top_pct: 15.0`,
`heater_elev_bot_pct: 5.0` · `spray_capacity_kgps: 23.68` (S10) · `flash_tau_s`,
`cond_tau_s` · `bulk_mod_eff_mpa` · ported `void_disp_lvl_equiv: 375.33` +
`void_weight_surge_ref` (the matched-pair comment moves with them) · ported `K_sat_pull`,
`K_break_vent`. **Target: ≤ 12 `[tune]` constants against v1's 22**, with the level slope
and the bubbled pressure gain converted from tunes into derived identities.

---

## 5. Answers to the dossier's open questions

**§6.3 — what replaces `P_restore_rate_gain`? *Nothing.*** Its own comment called it a
stand-in for heater *and* charging authority. Charging is CVCS's own channel
(`cvcs_makeup`) and always was. Heater authority becomes the heaters, acting through real
physics. Pressure-holding is then **the automatic channel's job**, which is what `MO-2b`
asserts — and Phase 1 showed the channel is currently not doing that job at all (heaters
peak 1.77 % on a trip while the term holds 2235 psi flat). Removing the term is what makes
the controller's own probes mean something.

**§6.4 — what is `K_heater` for?** See §7. It is the one thing in this spec that cannot be
settled by measurement alone, because both candidate values are now measured and they fail
in opposite directions.

**§6.2 — temperature node?** Yes, ruled; it is §2's whole shape rather than an add-on.

**§6.1a — the board (#473)** draws the bank between `heater_elev_bot_pct` and
`heater_elev_top_pct`, which are the model's own constants — one source, no second number
to drift. Board work goes through `EXTRA_ITEMS`/`DOC_PATCHES` (never hand-edit generated
`pwr_board_data.js`), then `node test/verify_board_check.js`, `RD.PwrBoard.ports()` to
*measure* the alignment, and a screenshot for art overlap.

---

## 6. Acceptance, refit, and the fences that die

**New conservation fences** (they replace `CA-23`, whose subject is v1 migration algebra):

- **CV-1** mass closure across the boundary: `pzr_m_liq + pzr_m_stm + loop ≡ _mass·M_rcs`
  to 1e-9. Strictly stronger than the identity it replaces.
- **CV-2** energy-closure residual bounded.
- **CV-3** the level-geometry identity of §2.2, both sides computed from config.
- **CV-4** ledger bounds and no-ratchet — ports `CA-18`'s surviving legs to the flow form.

**Refit** (probes asserting v1 internals, not catalog behaviour): `CA-9`'s 776 ± 20 slope
pin → the geometric identity · `CA-12`'s solid point → `V_liq = V_pzr` · `CA-15`/`CA-19`/
`CA-20`'s `stepPressure` clones → v2 calls · **`run_autoctl:407` re-anchored to the
controller**, which is its actual subject (today it measures `P_restore_rate_gain`).
**Die with v1**: `CA-23`, `CA-18` leg B's state-form algebra, every `levelRaw` consumer.
**Preserved untouched**: `CA-20b`'s xfail (owner: out of scope, measured) and
`ops_cvcs_pzr_drain_rate`'s ruled red.

**During the bridge, v1 itself plays the frozen-line role** — the A/B parity rows are the
#385 idiom applied one level up, and they are deleted at cutover.

---

## 7. Heater authority — THE RULING REQUEST IS WITHDRAWN

*(OWNER, 2026-08-12: "why have a multiplier? why not have physics. how much does the real
one output?")* — the question dissolved the dilemma below rather than choosing between its
horns. **Both numbers this section was going to ask you to pick between are wrong, in
opposite directions, and the trade-off it described does not exist.**

**What the real one outputs is 1794 kW.** That is the sourced quantity (S9). A pressure
*rate* is not a property of a heater at all — it is `Q / (C · dTsat/dP)`, where `C` is the
heat capacity of what is actually being heated. Computed with this repo's own saturation
correlation (Tsat 345.0 °C at 15.41 MPa, dTsat/dP = **5.35 °C/MPa**), pressurizer liquid
1402 kg at 55 % level, cp ≈ 6.0 kJ/kg·K:

| 1794 kW heats… | dP/dt |
|---|---|
| the pressurizer liquid alone | 0.0398 MPa/s = **5.78 psi/s** |
| + 10 t of vessel metal | 0.0250 MPa/s = **3.62 psi/s** |
| + 20 t of vessel metal | 0.0182 MPa/s = **2.64 psi/s** |

**The config's "sourced ceiling" of 1.586e-3 MPa/s (0.230 psi/s) is not the source's
number — it is a derivation error.** Back-solve it and the implied heated capacity is
**211 MJ/°C**, which is essentially the entire RCS coolant node (231 MJ/°C). It was computed
as though the pressurizer heaters had to warm the whole reactor coolant system. They do not:
they boil the pressurizer's own liquid, and the bubble sets system pressure. The real
ceiling is **15–25× higher** than the figure `Manuals/12` §12.15 declares the departure
against, so **the shipped 0.55 MPa/s overstates by ~20×, not 347×** — and the manual chapter
says otherwise and needs correcting.

**Why the dilemma evaporates.** Its two horns were: (a) the sourced value cannot recover
MO-2's −140 psi outsurge inside `CC-6`'s ~5 min band, and (b) 347× makes a manual heater
press a casualty in 115 s. At real physics (~0.025 MPa/s): recovering 0.97 MPa takes
**~40 s**, comfortably inside CC-6; and a full manual press reaches the PORV in **~32 s**
instead of 1.4 s — which is the *prototypical* outcome, since walking away with the heaters
on should eventually lift the valve. Neither horn survives.

**So v2 ships no multiplier**, `heater_authority_mult` is deleted from §4's config list, and
the number to defend becomes the **vessel metal mass** (§2.4) — a mass, which is sourceable,
rather than a gain, which is not.

---

### The withdrawn dilemma, kept for the record

Both ends were measured and appeared to fail in opposite directions. The reasoning was
sound given a wrong baseline, which is exactly why it is left visible rather than deleted:

| | `heater_authority_mult` ≈ 347 (today's 0.55 MPa/s) | ≈ 1 (the sourced 1.586e-3 MPa/s) |
|---|---|---|
| Manual full heaters at power | **PORV cycles at t+5 s; SI at t+115 s** (MO-3) — an operator button press is a self-inflicted casualty | the same 0.79 MPa rise takes **500 s**, with spray and the operator in the loop throughout |
| Recovering MO-2's −140 psi trip outsurge | seconds | **~10 min**, against `CC-6`'s ~5 min band |
| Prototypicality (Q2) | declared departure, `Manuals/12` §12.15 | **honours the source** |
| Player complexity (Q4) | a control that punishes use | a control that behaves like the manual says |

**My recommendation: bring the multiplier down to the sourced value and re-band `CC-6`,
after measuring what CC-6's band was actually protecting.** The reasoning: `CC-6`'s ~5 min
is a *feel* number minted in the P4 tuning pass, while 1794 kW is a *sourced* one, and HR9
puts prototypicality above a content band. A real PWR does droop for minutes after a trip —
that is the behaviour `MO-2` says we currently cannot show at all. The intermediate option
(something like 5–20×) is available and I would take it only if re-banding `CC-6` turns out
to break the post-trip beat pacing in a way the missions cannot absorb.

**The sweep has now run, and it supports the single jump.** `K_heater ×1.03` moves **18 of
260** scenario-suite checks and **flips none**, and every mover is in the Mode 5↔1
heatup/cooldown family — heaters move what heaters do work on. There is no wide set of
unrelated checks riding on it, so the staged reduction buys nothing it would otherwise buy.
**Stated limit:** a 3 % nudge says which checks *feel* a constant, not how they behave under
a 347× change. It rules out a twenty-probe pile-up; it does not promise the heatup family
will be easy, and the heatup pacing (`EV-1`, the sourced 100 °F/hr TS limit) is where the
work will land.

**What the same sweep says about the rebuild's evidence base, which matters more than §7.**
Zero verdict flips across all nine pressurizer constants: **the 37-scenario suite is nearly
blind to pressurizer tuning**, `K_spray` and `solid_bulk_mpa` are outright INERT in it, and
`level_per_void` — the deception constant — moves exactly one check. **Phase 3d's A/B must
therefore lean on the behaviour battery, not on `run_pwr`.** A green scenario suite will be
weak evidence that the rebuild landed correctly, and the plan's adjudication protocol should
weight the battery accordingly.

**Defaults if I get no reply:** I build v2 with `heater_authority_mult` as a config
constant defaulted to today's effective value, so the switch is a pure A/B and the
authority question can be answered by a one-line nudge afterwards. Nothing in §2 depends on
which number wins.
