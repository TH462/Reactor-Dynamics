# Reactor⚛️Dynamics — Build Decisions, Deviations & Flags

**Purpose.** A running log of every non-obvious choice made while building the modules:
decisions the spec left to the implementer, deliberate **deviations** from the literal spec
(with the reason), and **open flags** to revisit. The spec files (`CONTEXT.md`, `M1`–`M8`)
remain the source of truth for *intent*; this file records *what was actually built and why*
where the two differ or where judgment was exercised.

**How to maintain (read this before editing).**
- Append, don't rewrite history. When a flag is resolved, move it to the relevant module's
  "Resolved" note rather than deleting it.
- **Dated entry headings are `YYYY-MM-DD-<lane>-<letter>`** — e.g. `## 2026-08-05-develop-a — #339: …`.
  Lane = the worktree (`develop` / `workbench` / `backshop`); letter = the next one unused for that
  date **in your own lane**, starting at `-a`, never bare. Three lanes allocating a per-day letter
  independently collided: **10 labels here name two or three entries each**, so a citation against one
  is ambiguous. Pre-2026-08-05 labels are **not** renamed *(OWNER RULING, 2026-08-04: "Work issue 339
  in develop. Go with option 2.")*; see #339. Gated by `test/run_session_labels.js`.
- Every entry: a one-line claim, then the *why*. Reference `file:symbol` where it helps.
- Update the **Open Flags** table at the top whenever a flag is opened or closed.
- Keep it skimmable: tables and short bullets, not prose.

**Status:** M1 ✅ · M2 ✅ · M3 ✅ · M4 ✅ · M5 ✅ (+ rewind ring · attention-stops) · M6·PH ✅ · **M6 ✅ steps 1–6 (beat engine · Path 2 follow · TMI flagship · rewind · highlights/F8 · Hook + Training tab)** · M7 ✅ · M8 🟦 functional alpha (PWR) · **all three engines proven — physics layer complete** · **RBMK+BWR now have full balance-of-plant (turbine/condenser/generator + electrical output) for PWR-parity full-scope operation** (RBMK 20/20·129, BWR 10/10·63) · **blueprint reconciled to code — CONTEXT + M1/M2/M3 now describe all built engine/contract additions (BOP, block valve, SLC/LPCS/SRV, reactivity proxies, 50% states); UI/[tune] deviations remain logged below** · (next: Chernobyl/Fukushima flagships + Campaign wrapper, Qualification hints, or extend M8/M4 to RBMK+BWR)

---

## Open Flags (live)

| # | Module | Flag | Severity | Status |
|---|--------|------|----------|--------|
| F1 | M1 | Criticality uses an explicit `rho_excess` + operating-temp references instead of the spec's "set reference temps" mechanism (which yields non-physical refs). Will M2/M3 reuse this pattern? | design | **RESOLVED (M2, confirmed M3)** — yes, all three. M2 trims rho_excess per-state with pinned Doppler/graphite/void refs; M3 (also boron-free) pins Tf_ref/void_ref at full power and trims rho_excess ONCE as a fixed core constant (so post_scram_sbo comes out subcritical). The pattern is now the house style for boron-free criticality. |
| F2 | M1 | `sg_overfeed` failure `override_value: 1.2` is applied to `set_feedwater_flow {pct}` (0–100), so it underfeeds (1.2%) rather than overfeeds (~120%). Untested, not flagship. | data bug | **RESOLVED** — value fixed to 120 (pct-units slip, see `pwr_control.js` comment) and now tested end-to-end: `ops_pwr ops_sg_overfeed_p14` (2026-07-19) drives the failure under M4 to the full P-14 response. |
| F3 | M1/M4 | The M1/M4 seam: command-override failures' persistent effects live in the engine (M1), while interception lives in M4. M4 forwards *and* intercepts. M7 will scrutinize this. | seam | **open** — validate in M7 |
| F4 | M4 | `degraded_hpi` is typed `command_override` but its real effect is an engine HPI-flow multiplier (the spec itself flags this, M4 §7). Implemented via the engine hook. | taxonomy | **RESOLVED** (2026-07-27, #143) — `degraded_hpi` and `afw_failure` are both `physics_parameter` now (`pwr_control.js:285,289`, effects `degrade_hpi` / `block_afw`). Both are persistent physical states, not command interceptions, so the typing matches HR7. |
| F5 | M1 | `fuel_damaged` (cladding failure at 1200 °C) is internal, not in the §6.3 `true_state` contract. Consumers must use `fuel_temp_c`/`melted`. | contract | **RESOLVED** (2026-07-27, #144) — it is in the contract, `CONTEXT.md:395`. Consumers may read it directly. The flag outlived the fix. **But**: measured against `getTrueState()`, **41 of 82 PWR fields are still undocumented** in §6.3 — `fuel_damaged` was the one that got fixed, not the only one missing. Tracked separately as #225, **RESOLVED 2026-07-28t**: all documented, and `test/run_contract.js` now gates the diff both ways. Note the 41 had itself rotted by the time it was worked — 29 of 84 when re-measured. |
| F6 | M5 | Acceleration is realized as fixed-0.02 s step **count**, not by scaling `dt` (CONTEXT §4's literal `dt_effective` diverges — verified). Every engine (M2/M3) must stay stable at 0.02 s; the service never hands them a larger dt. | deviation | **RESOLVED** — all three stable at 0.02 s. M2 fine with explicit Euler. **M3 needed an IMPLICIT prompt term** (its Λ=5e-5 makes explicit Euler unstable at 0.02 s: dt·β/Λ=2.6>2 — see M3 D1); still first-order, so the fixed-0.02 s contract holds for every engine. The service never needs a smaller dt. |
| F7 | M8 | Alarm system-category (left-bar color, M8 §8.5) is derived UI-side by keyword (`alarmCategory()`), because M1's alarm data has no `category`. Should move into the plant profile alongside `tile_label`/`scanner_hint`. | data | **RESOLVED (2026-07-31, #157)** — `category` is authored beside `panel:` in each plant control module, projected through `getActiveAlarms()`, and read by the UI. The keyword matcher is gone; there is deliberately NO fallback, so a missing category renders `—` and `run_contract.js` fails (84 → 138 checks, all three plants, closed vocabulary). **Measured before the change: 13 of the PWR's 33 were wrong or arguable** — the matcher read alarm IDS while the words it looked for often live in LABELS, so `charging_high` (CHG FLOW HI) fell through every rule to `safety_system`, `sur_high` did the same on PWR and RBMK, and `sg_press_high` matched "press" into `coolant` despite being secondary steam. |
| F9 | M5/M6·PH/M7 | Integration tests assert `rod_nudge` reaches the engine **instantly** (`210 → 200`), but the engine now does a **rate-limited nudge** (drives a `nudge_target` over sim time — the "rod control reworked" change). The one-step assertion sees `210→210` and fails. **Pre-existing** (reproduces on clean HEAD; unrelated to the BOP work) — the stale check needs to step the sim forward after nudging. | test | **open** — fix the 3 integration tests to run the sim after `rod_nudge` |
| F8 | M8 | Control sections were made a **tabbed strip** (one section shown at a time), a user-directed deviation from M8 §5 ("always visible — not tabs, not collapsible"), to keep the control band skinny. Revisit whether tabbing the controls is acceptable for the real Instructor (M6) flow, where a scenario may need to highlight a control in a non-active tab. | deviation | **RESOLVED (M6)** — highlights auto-reveal hidden controls on both mechanisms: RBMK/BWR `findPdControl()` switches the owning view tab (`app.js`); PWR `RD.PwrSynoptic.revealControl(label)` opens the owning card tab/section via the data-driven `SYN_CONTROL_MAP` (`pwr_synoptic.js`). `verify_manual_follow.js` now checks PWR controls through the same reveal path. |
| F10 | M2/M8 | **RBMK automatic-regulator (AR) rod group** (user-directed): add a third, small-worth (~5–8% of the manual bank, no displacer), fine-step group — the authentic RBMK AR. The Automate rod channel drives IT (fixes the ±4%/step hold granularity); its diagram/control card carries its own AUTO/MAN selector mirroring the Automate channel; disengaging = taking manual control (the pre-Chernobyl condition — scenario beat material). Include AR in ORM; scram drives it in; keep the positive-scram displacer exclusively on the manual bank so the Chernobyl acceptance suite stays green. NO second manual group — the AR under manual override IS the fine manual bank. | planned | **RESOLVED (2026-07-07)** — built as specced (see the dated entry); the Chernobyl AR scenario beat is authored under F11. |
| F12 | M8/test | **`run_e2e_controls` 28/30 — 2 pre-existing reds** (was 3; (c) *AUTO charging converged to match the leak* turned green with the 2026-07-22 P7 retune/SGTR re-anchor). (a) *PZR spray manual set reaches engine* — expects spray ≥45 % at the engine, gets 12; the spray-demand reach drifted. (b) *CVCS auto make-up holds inventory vs leak* — "auto holds ≥98 %" is not physical for a severity-1.0 SGTR (now 0.03 frac/s ≈ 40× CVCS make-up authority); re-baseline to the current trajectory or assert against a small leak the servo *can* match. | test | **RESOLVED (2026-07-25, #150 — 35/35; then 2026-07-29m, #194 — 39/39)** Both original reds were stale expectations, not regressions (spray has an owner-ruled flow cap; "auto holds ≥98 %" is unphysical at severity 1.0). **But the #150 rebuild introduced a worse check than the one it replaced**: *"CVCS covers a consistent fraction of the leak (droop)"* asserted coverage stayed inside 10–50 % and equal across leak sizes — measured 400 **cycles** in, i.e. 40 s of sim time against an 83 s control loop. It pinned a transient as a steady-state property and is the whole source of #194's false claim that no leak is ever held. Now five checks measured at 4.8 τ against the **config-derived** equilibrium. Negative control: the old check *passes* on a deliberately-broken servo and *fails* on the healthy plant — it was inverted. |
| F13 | M4 | **`clip()` is defined four times** (`control_kernel.js:47`, `pwr_control.js:360`, `rbmk_control.js:127`, `bwr_control.js:100`) and issue #156 files it as HR3 drift. It is not: HR3 is *plant specifics in shared code*, and this is a one-line pure clamp local to each IIFE. **Deliberately not deduplicated** — `control_kernel.js` loads **after** all three plant control modules in every load list, so a shared `RD.*.clip` resolves only at call time (a real load-order coupling), and the alternative is a new shared-utils file that must be added to every load list. Bought for 60 characters that cannot meaningfully drift. **Measured before deciding: `clip` is the ONLY duplicated helper** — every other module-level function in those four files is genuinely local. **Revisit trigger:** if a *second* shared helper appears, create the utils file then and move `clip` in with it. The **other** half of #156 (a PWR field read inside generic kernel machinery) WAS real and is fixed — and note it had **moved**: `_stepBang` was already clean, but the boron batch-dose work re-created the same leak in `_stepConc`. See `Diagnostic/TUNING_LOG.md` 2026-07-27b. | cleanup | **RESOLVED (2026-07-27b) — won't fix, deliberate. OWNER-APPROVED**: Claude recommended won't-fix with the reasoning above; owner replied *"Do as you suggest"* (2026-07-27), so the decision is the owner's and the reasoning is Claude's. Recording it that way because the first draft of this row said only "ruled won't-fix", which reads as owner authority for what was then an agent's recommendation — the exact laundering `CONTEXT.md` §HR-provenance warns about. #156 closed `status-deliberate`. The recurrence it exposed (the leak was fixed in `_stepBang`, then re-created in `_stepConc` ~40 lines below the comment warning against it) is spun out as **#227** — nothing gates HR3 in the kernel. |
| F14 | M1 | **Pressurizer heater authority is 27× its own source, which damps the loss-of-inventory cue** (#337, 2026-08-04). WTSM 3.2 (ML11223A213 p. 3.2-9): 1794 kW is *"capable of raising the temperature of the pressurizer and its contents at approximately 55 °F/hr"* = 0.23 psi/s; ×12.6 for this plant's declared Mode 5↔1 time compression = 0.020 MPa/s, and `K_heater` is **0.55**. The #337 surge fix gives inventory a real path to pressure, but the heaters rebalance against it, so a leak that empties the pressurizer to its 17 % cutoff costs ~**1 °F** of subcooling margin against ~**9 °F** at the sourced rating. **Correcting it is measured, not free**: at 0.05 the plant can no longer ride out a full load rejection without an OTΔT trip (TR-1h, ruled identity), and below 0.20 a stuck-open spray valve depressurises it to the containment floor (TR-11). Declared to the player at `Manuals/12` §12.15. | tuning / identity | **RULED — STAYS AT 0.55** *(OWNER RULING, 2026-08-04: "F14 go with the recommendation.")*. The recommendation was: the lesson is direction and ordering, the player now gets all three parameters, and closing the gap would trade the ride-out character the plant is built around. It is a **declared departure** (`Manuals/12` §12.15), not deferred work — do not re-open it as a tuning task. **CURRENCY NOTE (2026-08-08): the "27×" arithmetic in this row is historical** — #419 wave 1 retired the ×12.6 compression it was computed through, and §12.15 re-states the departure at ~347× on current numbers. The RULING is unchanged and was re-affirmed 2026-08-07; only this row's framing had aged. |
| F15 | M1 | **A relief valve's pressure authority is carried TWICE since #337.** `K_surge_level · level_per_mass` = 310 and `K_porv_relief`/`K_safety_relief` = 300 — the two constants were always this same mass→pressure coupling, fitted per path, and the general surge law now supplies it again. Excluding relief from the surge driver is the physically obvious fix (the valves discharge from the pressurizer steam space, so that mass never crosses the surge line) but was **measured worse**: `run_meltdown` 12 → 11 and `run_scenarios` 3/3 → 1/3, i.e. it breaks physics acceptance where the double count breaks only authored content. All four combinations measured; table in `Diagnostic/TUNING_LOG.md` 2026-08-04g. | tuning | **RESOLVED (2026-08-04g)** *(OWNER RULING, 2026-08-04: "Do f15 how you recommend.")* — relief excluded from the surge driver, gains re-solved **300 → 600**. See the 2026-08-04g entry: the sourced criterion did not discriminate, so it was solved against the relief ladder's own suites (`run_meltdown`, `run_scenarios`), which are red at 300–450 and green at 500–600. **Carries one deliberate red**, `run_behavior` TR-15 leg E, now a plant question rather than a calibration one. **CURRENCY NOTE (2026-08-08): the 600 in this row is TWO re-solves stale.** 600 → 3144 (#408 wave 1 — the K-preserve across the valve-mass re-clock) → **2500** (#419 wave 2 — the F14-coupled net: `K·porv_flow_max − K_heater` = 0.0744 MPa/s; **one pair, re-solve together**). The live record is the dated entries (2026-08-07-develop-a, 2026-08-07-develop-g), not this row — citing F15 from this table shipped a wrong number once, which is why this note exists. |
| F11 | M6 | **Training update for automation**: teach the Automate tab (campaign beats + manual coverage); author `auto_channels` presets on missions/walkthroughs that should focus the player (mechanism landed 2026-07-07, no content uses it yet); revisit strict-gating text where an authored preset runs a system the steps used to have the player run. | planned | **RESOLVED (2026-07-07)** — rbmk_ar + pwr_automation missions, auto_channels presets exercised end-to-end (startScenarioAuto gate harness), Chernobyl AR tie-in. Pre-existing missions deliberately left bare (triggers tuned against bare-plant trajectories). |

---

## 2026-09-03-workbench-a — #607: checklist playtest (host, pulse, catch-up, bank position)

The running checklist is hosted in the Checklists tab (`#cklRun`). The 2026-08-11 "always show the list" directive is superseded by this issue: leaving the tab looked like a restart because the card was in the Instructor pane. Catch-up walks **forward** at start — skip an action whose `acc` is already true, or a confirm whose `past` is met; never walk backward from a later acc (those last confirms are `power_pct < 1` for the whole heatup). Shutdown-bank step grades `shutdown_bank_pct >= 98` (already a control_state param from #605); details dropped the pcm lecture. RCP Run/Stop highlights the card `imrsjyqoq6t`. Current-step glow pulses; non-current hover is steady.

## 2026-09-02-develop-a — #605: the playtest's two typing blockers were one defect, and Mode 5 was booting a latched turbine

**A click that misses a text field is a keyboard shortcut on this board.** Both "can't type"
blockers reduce to the same thing and neither is the text box. Measured on the Pressure SP tile
(`imrsg8b7b9o`, authored 100 px): the `<input>` is **42 px of an 85 px frame** at 1600×950 and
**30 × 17 px** at 1366×768, with a `psi` unit span and the ▲▼ column filling the rest **inside the
same visible border**. A click on the span leaves `document.activeElement` on BODY, and `ui/app.js`'s
global shortcut handler then takes the digits — 2/3/5 are time acceleration, so typing "2235" ends
the session at 3600×. The feedback form is the same shape: 32 characters typed, **0 in the box**,
focus on `#playBtn`, because the first SPACE is play/pause. Decision: **make the whole affordance
the target** (frame pointerdown focuses + selects; the feedback modal focuses its textarea on open)
rather than narrowing the shortcut handler, which reads correct in both worlds.

**A committed setpoint must survive until the plant answers.** `commit()` clears `rec.editing`
and the next render reads `numberFor` off the snapshot still in hand — the old value. Running, a
broadcast hides it; PAUSED it never does, and paused is when a player retypes a setpoint. Pinning
by snapshot IDENTITY was tried and fails (the command path reassembles a fresh snapshot object, so
the pin dies on its own first render); the shipped form pins on the pre-commit VALUE, releases the
moment the plant reports anything else — accepted **or clamped** — and is bounded at 20 broadcasts
so a REFUSED command still snaps back honestly.

**Mode 5 and Mode 4 boot with the turbine tripped and main feed secured** *(OWNER, 2026-09-02
playtest: "In mode 5 it should start w/ turbine tripped, SG feed off"; lineup detail RULED the same
day: "Feed pumps secured")*. Both were retired-by-reference — constructor defaults written for the
one initial condition this engine used to have. Two consequences had to ship with the ruling:

- **The FEED PUMPS selector became the pump control** (AUTO / non-zero MAN start, OFF secures),
  because `feed_pump_a`/`_b` had no operator command at all. **Securing is explicit, not inferred
  from a zero demand** — the `feed_sg` channel's demand passes through zero, and the operator's
  answer to an SG overfeed *is* demand 0 (#510 M-12). It rides as a `secure: true` payload flag on
  the existing verb so the retired engine, which knows only `pct`, is unchanged.
- **The sourced loss-of-main-feed chain fired on a normal Mode 4/5 lineup.** `main_feed_lost` is
  `capacity <= 0` and capacity folds in the operator's selector — **measured: AFAS at t=0, the
  settled Mode 4 plant falling 21 °F/hr**, caught by `run_pwr2_endurance`.
  **THE FIRST FIX WAS WRONG AND A GATE CAUGHT IT.** Making `main_feed_lost` availability-only put
  the distinction in the module; `run_pwr2_engine` reddened, because securing both pumps at 100 %
  power is a real loss of heat sink and no breaker-position signal can tell it from a failure.
  The distinction belongs in the CALLER (HR5): the module reports the loss, `pwr2_engine` arms the
  chain only when the RCS is **not on RHR** — when main feed is actually the heat sink. Both
  directions are pinned now (a cold plant on RHR must not fire it; securing RHR must re-arm it on
  the same standing loss), because either half alone is satisfiable by a chain that never fires.
  Lo-lo level, SI and loss of offsite power stay armed in every mode. *(Declared simplification,
  UNVERIFIED — `tools/find_source.js` returns 0 hits across 39 documents in 3 lanes for the mode
  conditions on this input.)* `loss_of_feedwater` separately moved its seat to pump AVAILABILITY
  (`pumpAAvail`/`pumpBAvail`, which had shipped with no command and no consumer) — the #200 fix,
  without which the first AUTO press would have cleared an injected casualty.

**Checklist acceptance can read `control_state`.** Step 3 grades on `shutdown_bank_pct` now, not
on `reactivity_pcm` (a proxy that also answers to boron and moderator temperature). Rod position is
not a flat `true_state` field, and rather than mint contract fields for the checklists alone the
instructor layer resolves it from `control_state.rod_groups[]` — with `test/procedures_harness.js`
routed through the SAME function, because it was reading `true_state` directly and would otherwise
have been a second sampler that disagreed with the live runtime about what a step checked.

**Two gates could not have caught any of this.** `run_events` scanned `CONTROL_LABEL_MAP` through a
fixed 4,000-byte window, so adding a COMMENT reddened it for a label that never moved.
`run_pwr2_kernel`'s `lofw-precondition` asserted `pumpA === false && pumpB === false` — it pinned
the anti-pattern itself; the replacement (availability gone AND selectors untouched) would have
failed on the old engine, correctly, while its companion `lofw-holds` passes on both.

**Mode 4, Hot Shutdown is no longer a Free Play preset** *(OWNER RULING, 2026-09-02: "A")*.
Measured, both ICs booted and diffed: **105 of 122 `true_state` fields identical**, and of the 17
that differ 12 are one fact restated (isothermal plant, every node reads Tavg). One independent
difference — temperature, **250 °F (121.1 °C) against 122 °F (50.0 °C)** — with the same pressure,
the same pressurizer level and the same lineup. #507 wave 10 built the preset *because Mode 5 was
unrepresentable at the old 0.1 MPa property floor*; #524 moved the floor and the entry outlived its
reason. Presets are HOLD states; transitions are produced by operating (#468). **The IC stays in
the engine and in three runners** — it is the more sensitive settled-state probe (#605's
safety-injection defect read −21 °F/hr there against −6 °F/hr at Mode 5).

## 2026-08-31-develop-d — #244/#254/#526: the pwr2 checklist pool is AUTHORED, not aliased — and the replay is the authority

**Claim:** `RD.MANUAL_PROCEDURES.pwr2` is a separate pool sharing ids with the pwr pool, every
entry replayed end to end on PWR2 (`run_checklist_pwr2.js`); a one-line fallback alias (#526's
cheap option) was refuted by measurement — the two plants disagree in the load-bearing places.

- **Why a fork, with numbers**: the 1/M ladder's authored 912-currency bursts sum past the
  200-step bank (138+90 > 200 — the second burst blew through criticality and scrammed);
  `connect_grid`/`set_load_mode`/`set_steam_demand`/`set_sr_detector` are REFUSED;
  `feed_sg` is not a kernel channel (`set_feed_coupled` is the lever); the Pressure SP floors
  at 1700 psig so the retired cooldown's dialed depressurization reads 11.87 MPa for ever.
- **Multi-check-off (#244 item 8)** is per-entry LATCHING (a ticked box stays ticked), shared
  by checklist and follow, persisted as `accs_met` (a plotted point cannot re-earn after a
  load). cmd-kind entries ride the existing `_cmdEvidence` family machinery.
- **Replay-shape rule found twice**: a step whose command needs a mid-step plant state cannot
  be one step (the harness issues cmd at step start) — the heatup's accumulator window and the
  cooldown's RHR align both split into ride-then-act pairs, which is ALSO the honest operator
  sequencing (the align-under-spray order is real: shutting spray first bounced pressure back
  over the 425 psig permissive).
- **Power legs**: boron is the commanded bulk reactivity (705 ppm up, 719 down — 705 measured
  as the rod-less on-program point; 626 is the xenon-equilibrium value); rods stay prose trim,
  so the checklist serves both the chain state and the presets.
- **The heatup pressurization is STAGED around P-11** (1700 psig floor through the ride,
  2235 psi only with the secondary hot). Full dial from cold crossed P-11 (1,972 psia) with
  steam pressure below the 327.7 psia SI setpoint; the auto-reinstate exposed the standing
  `si_lo_steam_press`, the NUREG-0737 shed latched (157.8 kW → 0) and the plant parked at
  1,921 psia — while `hot_zero_power` holds 2,250 psia on ~1–3 kW, the measurement that
  separated content-outran-the-secondary from a heater-authority defect. Plant behavior is
  CORRECT; the procedure carries the coordination, and its why-prose teaches the trap.
- Record: TUNING_LOG 2026-08-31-develop-g; the ride corpus is the session scratchpad.

## 2026-08-31-develop-c — #524: Mode 5 exists — the pressure floor was a fetch bound, and both directions of the claim were measured

**Claim:** extending Layer 0's floor 0.1 → 0.002 MPa (owner-ruled) is sufficient for Mode 5 — no
new physics, five refit coefficient sets, and every consumer re-measured. Record:
`PWR2_VALIDATION.md` §126; provenance `PWR2_L0_REBUILD.md` §3b.

- **Why 0.002**: T_sat 17.5 °C — an SG can sit at ambient; matches the liquid branch's 20 °C
  corpus edge. The floor's 0.1 was `PLow=0.1` in the NIST fetch URL (#586's `THigh=800` shape).
- **Refit decisions**: `rho_v_sat` deg 6→9 (T_sat's precedented shape; deg 6 did not
  extrapolate — 1e27 %); superheated smoothing quartic→sextic over 33 isobars, extraction moved
  from cp-fit to **h-form-fit** (recovered the 19.6 kJ/kg per-isobar floor; composed h_v 21.4
  vs the shipped 32.8 on a 50× narrower range); `Z_sat` deg 4→6 with `tau_z` on the direct Z
  residual. Off-grid validation: 5 unfitted isobars, 8.6 kJ/kg max.
- **Consumer verdicts (HR10, per-probe)**: the SG §99.6 clip residual RETIRED (floor below
  every physical inflow; flag now material-only — roundoff ticks at an exactly-landed energy
  limit are the mass floor's own idiom); the LOCA 40 cm² fixture's 107 s hold was the FLOOR
  masking end-of-blowdown — the ride now completes at 15.7 psia containment backpressure, and
  the frozen-books contract moved to a manual latch; the core-damage CEILING latch unmoved (§115 held).
- **The IC**: wave-10 construction one step colder; trim lands 918 ppm / −5,809 pcm both banks
  in — FEWER ppm than Mode 4's 999 because boron worth per ppm rises with density, the #468
  order intact either way. vtable cap 260→320 kB, justified by the 0.136 %-vs-0.12 % superheat
  measurement at the old NP.

## 2026-08-31-develop-b — #596: the in-sim report — AUX SPRAY box removed, render pass off the 60 Hz treadmill

Two decisions of record; full continuity in `TUNING_LOG` 2026-08-31-develop-b.

- **The AUX SPRAY board tile (#563 item 2) is REMOVED, one day after it shipped** *(OWNER
  DIRECTIVE, 2026-08-31, in-sim report `mth3218c-fp42sbsl`: "remove aux spray box.")*. The
  `set_aux_spray` engine door STAYS (scenarios/instructor, `run_pwr2_shell`); `Manuals/03`
  §5.3a and its §18 row deleted, §5.3's declared departure reverts to being the board's one
  pump-less depressurization path (pending Rev 17 (e)). Board decision, not a plant one (HR9).
- **Board animation moved off per-element 60 Hz CSS onto a shared ~12 Hz JS clock** (pipe
  dashes, `std_pipe.js`) **with the rest quantized to `steps()`** — measured against the
  report's 4.7 fps render-bound verdict: chart redraw gate −59 % drawChart JS, raster
  8.9 → 6.5 s / 15 s, paint events −39 %. Remaining animations join the shared clock under
  #596 (open follow-up; measured floor 3.8 s raster).

---

## 2026-08-31-develop-a — #591 + #564 + #578 + #592: the owner's playtest, and four controls that read as working

Full record: `PWR2_VALIDATION.md` §125; continuity in `TUNING_LOG` 2026-08-31-develop-a.

**Seven items, one shape.** The circulating-water inlet box was a DARK WIRE — `pwr2_condenser` has
computed the vacuum from that temperature since it was written, and only the engine's command door
was missing, while the shell's REFUSED entry (carrying the retired plant's reason) justified the
capability flag that darkened the box. The pressurizer SPRAY box read delivered flow as both the
operator's demand and the "not arriving" test of its own indication. Three TRIP BLOCKS rows offered
blocks this plant does not have while `si_trip`, one it does, had no row. The Failures tab offered
raw internal ids and listed refusals as successes. The delta-T tile derived a rod stop from the
retired plant's constant instead of reading the two signals the engine publishes.

**Two DECISIONS are recorded here rather than only in the write-up:**

1. **The AUX FEED THROTTLE and the manual START leave the board** *(OWNER RULING, 2026-08-31:
   selected "Remove START and the THROTTLE box" from three options put to him)*. This **withdraws
   the board half of #562**, which was sourced (WAT 05, ML11216A094 — "It is necessary to throttle
   AFW flow to control RCS temperature at this point"). There is no automation-channel panel on
   this board (#439 removed it), so the operator now has NO lever over post-trip cooldown rate:
   `afw_level` holds the valves and the player's authority is STOP, then re-arm AUTO. The cost was
   put to the owner before the ruling. `set_afw_flow` remains a command for scenarios, the
   instructor and the channel.
2. **The circulating-water band stays 35–85 °F, and the reason is provenance, not inheritance.**
   A first pass widened it to 95 °F so the C-9 removal point (93 °F) would be reachable — a real
   educational argument — on the reading that 35–85 °F was another retired-plant constant carried
   by reference. It is not: **85 °F is sourced** (Ginna TS Bases B 3.7.8, service-water OPERABILITY
   at ≤ 85 °F) under a **standing owner directive** for the floor (2026-08-08). Losing the
   condenser stays an equipment casualty. **What was wrong was the board reading the right value
   from the wrong plant**, so the fix is that PWR2 publishes `cw_inlet_range_c` and the board reads
   it — same numbers, different authority.

**A behaviour change fell out of it and contradicts the manual:** lake temperature alone now rings
**COND VAC LO** (25 inHg / 84.7 kPa), crossing at about **76 °F**, where `Manuals/03` §13.1 claimed
~2 inHg of margin at the 85 °F ceiling. That figure was the retired engine's; measured here, 24.85
inHg at 77 °F and 23.68 inHg at 85 °F, annunciator confirmed through the full stack. Two more
claims in the same section are withdrawn as measured-false on this plant: MWe does not fall with
vacuum (100.0 MWe across the whole band — this turbine is dispatched to a load target), and the RHR
cooldown floor does not move with it (shutdown cooling rejects to its own 95 °F component-cooling
water). Manuals to Rev 17, pending row extended.

**LEFT OPEN, deliberately: #578's dedicated lamps.** Measured doc-wide with art included, the board
has no free 130 × 32 rectangle inside its bounding box; the only free space starts at x 1650 and
going there extends the canvas, which shrinks every tile on it. The delta-T tile cannot carry a word
either (9 px short of the NIS card title). So the **turbine runback has no indication the tile's
colour can separate from a rod stop**, and growing the canvas is an owner decision.

Gates: `run_pwr2_condenser` 30 → 35 · `run_pwr2_shell` 140 → 145 · `run_pwr2_board` 52 → 67 ·
`verify_board_check` 236 → 237 · `run_pwr2_kernel` 37 → 36 (a check correctly lost with the refusal
it guarded) · `verify_e2e_ui` gains `testAdvFailPanel`. Every new check injection-verified.

---

## 2026-08-29-develop-d — #586: the vapour ceiling raised to IAPWS-95's limit, and refitted

Full record: `PWR2_VALIDATION.md` §118; continuity in `TUNING_LOG` 2026-08-29-develop-d.

- **RULING (owner, 2026-08-29: "586: a")** — build the extension rather than keep the fence.
- **`TV_MAX` 800 → 1000 degC.** The old value had NO derivation: it was `THigh=800` in the fetch
  query that built Layer 0 (`PWR2_L0_REBUILD` §3). 1000 is IAPWS-95's own documented limit, so
  it is the last ceiling this library can claim to be validated at rather than extrapolated to.
- **The four superheated-vapour parameters were REFITTED, not extended.** Measured first: the old
  coefficients evaluated past their range are 34.8 % out on cp at 1000 degC (the `g*dT` term rises
  linearly for ever). Form kept; cubic → quartic in ln(P) because the SMOOTHING was the binding
  error, not the per-isobar fits; 11 → 24 isobars. h_v max 32.8 kJ/kg over the whole extended
  range against the old fit's 35.1 over its shorter one.
- **Two consumers checked that the ruling did not name:** the sourced `k_v`/`mu_v` transport
  correlations (clip at TV_MAX — measured 2.4 % in the new band, their easiest region) and
  `CEIL_HOLD_LATCH_S` (re-measured; got more conservative, constant unchanged).
- **Claim restoration, not claim invention:** `run_pwr2_coredamage` goes 20 → 23, back to its
  pre-fence count, with every restored claim measured on a plant inside its envelope. The 50.46
  ordering is now demonstrated by the plant (two criteria breached, the third not) rather than
  asserted from constants; melt is asserted as an ABSENCE with its reason.
- Gates: water 255 → 282 (35/35 mutations), coredamage 20 → 23; six other ceiling-reading gates
  held at baseline.

## 2026-08-29-develop-c — #585/#586/#582/#584: the held-plant fallout bundle

Full record: `PWR2_VALIDATION.md` §114–117; continuity in `TUNING_LOG` 2026-08-29-develop-c.

- **RULING (owner, 2026-08-29, selections from options I wrote with recommendations — not
  verbatim owner words): #585 → "Whole-plant hold"; #586 → "Measure, then settle."** The first
  makes `beyond_model` freeze every subsystem and the ledgers book on the plant's acceptance;
  the second pre-declared the decision rule the measurement then executed.
- **Design choice (#585): deferred booking + `dt_accepted`, not rollback.** `stepBreak` proposes,
  `book()` commits after the core's verdict, and the Courant sub-stepping's partial latching
  step books the loop's own reported fraction (0.966 kg measured gap). Two arithmetic repairs
  had already failed; the plant's own report is the only non-claim available.
- **Declared simplification (#585):** pre-core subsystems act once on the LATCHING step
  (secondary bookkeeping, one ECCS tank step at most); nothing crosses the primary mass
  boundary. Post-latch the facade short-circuit freezes all of it.
- **Measurement (#586): the vapour ceiling blocks the damage chain, not the pressure floor** —
  all four break sizes latch on the `_ceilHold` persistence arm at 15.7 psia. #524 and #586
  wait on DIFFERENT walls; the ceiling extension is scoped on the issue, not started.
- **#582 executed as ruled:** CA-20b deleted whole (probe/XFAIL/COVERAGE; catalog row RETIRED
  → `run_pwr2_endurance`); plateau gate built at measured values; AFW throttle floor measured
  DERIVED (0.41–0.46 of rated at ~36 % NR) under the real control kernel.
- **#584 measured and struck:** 0.2539 psi/s at 157.8 kW vs sourced 0.23 — the 347× departure
  left with the retired engine; Manuals/12 §7.1/§12.5/§12.15 rewritten, Rev 17 pending row
  extended (c).
- Gates: loca 19 · break 31 · eccs 39 · engine 125 · endurance 22 · shell 133 · behavior
  25/25/24 (0 xfail — the battery’s only strict xfail retired). All mutation replays clean.

## 2026-08-29-develop-b — #587: the pressurizer's shell, measured and mostly inert

`pwr2_pressurizer.js:87` declared "Wall metal is not modelled" from #515; #574 gave the ring's
PHANTOM pressurizer node one and #583 deleted it with the node. The real vessel has one now:
**10,262 kg (22,624 lbm), 5,131 kJ/K, 18.00 m2, 2 lumps** — ASME on the vessel's OWN volume
through Layer 1's inputs, reusing Layer 2's `buildWall`/`stepWall` rather than growing a second
wall model. Full write-up: `PWR2_VALIDATION.md` §113.

**⚠ THE MEASUREMENT PARTLY OVERTURNS THE REQUEST.** #472 predicted the heater-driven pressure rate
would fall with a wall. A/B'd against `dryWall`: **0.2093 -> 0.2096 psi/s, 0.1 %**; the sourced
Ginna spike unmoved; a 2 h Mode 4 hold -0.77 psi. **A saturated pressurizer's temperature is pinned
by its pressure** (~0.04 degC/psi), so 39 % of the vessel's liquid heat capacity is asked for half
a degree and does nothing. It bites only over a large swing — a cooldown to cold shutdown would ask
~585 MJ, which is #524's evolution. **The half that matters is wall condensation, still unbuilt.**

**⚠ BOTH DEFECTS WERE IN THE COUPLING, NOT THE MASS.** (1) The wall took the heaters' region
priority, read the stratified insurge layer as the whole wetted wall, and pushed 92 kW / 5.54 MJ
INTO the vessel — 58 % more than the heaters — making the rate FASTER. A heat sink that heats is
the sign the temperature it is differenced against is the wrong one. (2) The saturated pool cannot
be subcooled by definition; coupling it broke the module's own single-phase invariant at
40.7 kJ/kg. The pool's share of the shell is declared inert.

**And three standing traps arrived live:** my own new check asserted a threshold without measuring
the baseline (HR10 caught it — the spray path already leaves 1.49 kJ/kg either way); an edit
orphaned a mutation anchor by splitting the line it named; and the wall had to be built BEFORE
`migrateState`'s early return, because the save that needs no other migration is the one that
would have come back with no metal.

### Open flags this entry leaves

**Wall condensation is still not modelled** and is now the measured-to-be-important half of
#587's subject. The heat capacity is in and is nearly inert until #524 makes a real cooldown
possible.

## 2026-08-29-develop-a — #588: the cadence fix, and a diagnosis retracted twice

*(OWNER RULING, 2026-08-29: "A" — fix it and re-baseline whatever moves.)* Full write-up:
`PWR2_VALIDATION.md` §112.

**Fixed.** `tick()` held `sinceEval` as a per-tick local and the post-loop `layer.evaluate()` was
unconditional, so every broadcast forced at least one protection evaluation — a floor under the
rate, invisible above 1x and the whole cadence at 1x once the broadcast halves to 50 ms in a
transient. The accumulator carries on the instance, the post-loop call fires only at the cadence,
both comparisons take the fine sampler's `- 1e-9` epsilon, and it resets wherever the timeline
moves. **10.85 evaluations/sim-s at 1x became 10.00**, matching every other speed, and it moved
**zero gates** — `run_all` 97 at baseline.

**⚠⚠ AND THE DIAGNOSIS BEHIND #588 WAS WRONG, TWICE, FROM THE SAME MISTAKE.** The claim that
acceleration perturbs the plant ~1 % is false: at MATCHED SIM INSTANTS 1x and 10x agree to
**0.000e+0 over 66 shared instants, before and after the fix**. The number came from
`while (simTime < target)` stopping 1x at 200.02 s and 10x at 200.00 s on a blowdown moving
~128 psi/s. **Two plants, two different times, called a divergence** — in the issue, in three
documents, and again in the gate's own SI-4 check. The first diagnosis (the `flooredLow` latch
arm) was disproved by injection; this one by measuring properly. Both were read off something
persuasive rather than broken first.

**⚠ TWO MUTATIONS WENT BLIND AND NEITHER WAS A GATE FAILURE.** Automation-lumped-per-broadcast is
EQUIVALENT — `stepAutomation` accumulates dt internally exactly as its comment claims — and the
post-loop over-count became equivalent BECAUSE OF THE FIX. A mutation that stops being catchable
because the code got better looks exactly like a blind spot. Both replaced by mutations that
re-introduce #588 one half at a time.

### Open flags this entry leaves

**The browser/Node cliff difference (#588) is unexplained again**, with time acceleration now
positively ruled out by a gate rather than assumed. That is worse than "explained" and better
than "explained wrongly".

## 2026-08-28-develop-j — #588: a gate for the invariance the service asserts about itself

**⚠⚠ CORRECTED 2026-08-29 (`-develop-k`): the "acceleration perturbs the plant ~1 %" claim in
this entry and in `-develop-i` is FALSE** — it compared two plants at different times (1x stops at
200.02 s, 10x at 200.00 s, on a blowdown moving ~128 psi/s). At matched sim instants they agree to
**0.000e+0, before AND after the fix**. Only the protection EVALUATION RATE was ever wrong, and
fixing it moved **zero gates**.

`layers/simulation_service.js` claims acceleration invariance **twice in its own comments** — that
controllers "behave identically at any time acceleration" (`:333`) and that "the reactor gets the
same protection at 3600x as at 1x" (`:337`). **Nothing checked either.**
`test/run_service_invariance.js` now does. Full write-up: `PWR2_VALIDATION.md` §111.

**The defect is in the source, not inferred from a trajectory.** `tick()` declares
`var sinceEval = 0;` as a **per-tick local**, so the accrued sim time since the last protection
evaluation is discarded at every broadcast boundary. Once a broadcast is shorter than
`PROTECTION_DT` the in-loop cadence never fires and protection runs at the BROADCAST rate — which
is 1x, and only 1x, because the cadence halves to 50 ms in a transient. Measured **10.85
evaluations/sim-s at 1x against 10.00 above it**, and **267.31 psi against 269.87 at 200 s**
through a large break with the station blacked out. **Above 1x it holds bit-for-bit** (10x/30x/60x
all read 297.9055 psi at 198.0 s), so the defect is bounded to the one speed a player watches a
casualty in and no gate uses.

**⚠ AND THE GATE CAUGHT ITSELF BEING HOLLOW.** Before SI-6 was added to the XFAIL map it was
simply red, so every mutation "caught" it and the self-test read 3/3. Adding it dropped the score
to **1/3** and exposed two mutations that had never caught anything — the clean-run-guard failure
`run_pwr2_geometry` documents, arriving from inside the scored set instead of from a red clean
run. SI-7 (10x vs 60x bit-for-bit on a MOVING plant) was added because the repaired self-test then
showed the quiet plant cannot see a cadence mutation at all.

**A mutation visible only through an xfail is DECLARED, not counted** — reported under `blocked`
with its reason. A blind spot the gate creates for itself is a gate failure; one an open named gap
creates is a fact about the gap.

### Open flags this entry leaves

**#588 is NOT fixed.** The fix is one line — carry `sinceEval` on the instance — and its blast
radius is every plant and every full-stack runner, at exactly the speed the authored content was
built at. That is an owner decision with a measured before/after. The three xfails (SI-2, SI-4,
SI-6) are one defect and should retire together; one closing alone is information.

## 2026-08-28-develop-i — #583: one pressurizer, and a check the defect had been feeding

*(OWNER RULINGS, 2026-08-28, selected from options I wrote: **"Delete the phantom, re-base"** and
**"Delete it, file the follow-up"** for the metal wall.)*

PWR2 carried the pressurizer **twice at two different sizes** — a rigid off-loop ring node at
125.2 ft³ (3.5453 m³) and the Layer-5 vessel at 147.5 ft³ (4.176 m³) in the `extraMass` seat — so
the plant modelled **983 ft³** of reactor coolant system against its own declared **835.8**, and
**5,598 lbm (2,539 kg)** of it was rigid water no break, safety injection, chemical-and-volume-
control or residual-heat-removal path could reach. Full measurement and the six adjudicated reds:
`PWR2_VALIDATION.md` §110.

**A DECLARATION IS NOT A LICENCE.** Both `pwr2_pressurizer.js:91` and §85's *Declared, not claimed*
list named the double count and kept it, on the stated grounds that *"removing it re-clocks every
inventory fixture (an #408-class change)"*. That is a content cost, and Hard Rule 9 says content
churn is never an input to a physics decision. The declaration made the defect legible and then
held it in place for the one reason that is explicitly not allowed to.

**AND `PWR_DESIGN_BASIS.md` §6 ASKED FOR THE CHECK IN WRITING.** *"This section exists only to close
the volume ledger and must be checked against #472's own number, not adopted over it."* Nothing
checked, because no gate loaded both files. `run_pwr2_pressurizer` now asserts
`GEO.LEDGER.pressurizer.m3 === PZ.GEOM.V_pzr_m3` — a cross-layer equality, the first thing in the
tree that could have caught it.

**FOUR CONSUMERS READ `Σ GEO.NODES` AS "THE WHOLE PLANT", and it was only ever the whole plant
because the phantom was in it**: the chemical-and-volume-control system's charging scale, its boron
mixing mass and its max fill rate, and the safety-injection accumulator — whose comment literally
read *"the whole RCS incl. pressurizer"*. Deleting the node and leaving them alone would have cut
charging and accumulator inventory **15 %** on a plant that still has a pressurizer: a second defect
manufactured by fixing the first, and every symptom would have read as the fix working. They call
`GEO.rcsVolume()` now (nodes **+** the vessel, computed once in Layer 1). The boron ledger moved to
`sys.M_total`, which **inverts a decision that was right when it was made** — #514 refused
`M_total` precisely because it included the pressurizer and the node sum did not; once the node is
gone, the node sum is the one missing a pressurizer.

**MEASURED.** Reactor-coolant mass 41,614 → **36,016 lbm** (18,876 → 16,337 kg), −13.5 %. **The
design point does not move**: 2226.4 → **2226.5 psia**, hot leg 319.53 °C unmoved, 44.1 °F of core
subcooling on both sides — which is what removing an inert volume should do, since the pressurizer
sets the pressure and the phantom never participated in it. The seat compliance came back to its
own published figure, **182.8 → 192.6 kg/MPa against §85's 192**, and the deleted node measured
**5.79 kg/MPa** against §85's "~5". The sourced Ginna loss-of-load spike holds every band and moves
5 psi **toward** the sourced 2425. A small break runs ~15 % faster on a 13.5 % smaller plant.

**⚠ THE RED THAT MATTERED: a check whose subject the defect had been manufacturing.**
`run_pwr2_reactor`'s void-half check rode `fixture({ rigid: true })` under a comment that argued the
choice honestly — *"a boiling core is exactly what it honestly produces."* That loop parked at
8.55 MPa on the saturation line **only because the phantom node was in it**, 3.5453 m³ of stagnant
water at Tavg acting as ballast. Without it the identical fixture runs to the 0.1 MPa property floor
with a 99 °C subcooled core, and booting it on the dome at 8.0/8.5/9.0 MPa collapses too. The void
state is constructed and named now, at the plant's own pressure and boron, with a second check
pinning that it **scales**. **A fixture that "honestly produces" a state can be producing it out of
the defect you are about to remove.**

**And the #574 metal band was mis-shaped, which only this change could show.** It asserted an
ABSOLUTE 40,000–47,000 kJ/K against a **typed** 93,855 kJ/K denominator. Deleting the node took
metal *and* fluid out together, so the absolute failed while the **ratio the ruling was taken on
went up, 46.3 % → 49.2 %**. The denominator is computed from the node volumes now.

### Open flags this entry leaves

None new. **Filed and not fixed here: the Layer-5 pressurizer's metal wall** — 19,200 lbm
(8,708 kg), 4,354 kJ/K — which left with the node it was hung on. `pwr2_pressurizer.js:87` declares
*"Wall metal is not modelled"*, the plant really has that metal, and building it belongs in Layer 5,
where it re-opens the Ginna-calibrated `tau_int_s`. Bundling it into a ledger fix is how a physics
change hides inside an accounting one. Two margins narrowed and are recorded in `run_pwr2_loop.js`:
the transit check's off-loop-vs-total ratio 1.290 → **1.097** against its own `> 1.05` guard, and
the Courant off-loop filter's inert margin 3.6× → **1.8×**. `run_pwr2_lossofload`'s peak-pressure
band floor is cleared by **1.2 psi** (was 0.5) — pre-existing and thin.

**⚠ AND THE CASUALTY THAT DRIVES THE SIMULATION-HALTED DIALOG STOPPED HALTING**, which is a plant
finding rather than a gate one. `verify_e2e_ui`'s #520 check rides a large break with the station
blacked out. Measured in the browser at ff=7200 — **6,807 s of plant time** — the primary now parks
at **83 psia against containment backpressure** and stays there: a wrecked plant that never leaves
the property library's range, because the steam generators still have auxiliary feed. 1,500 / 3,000
/ 7,200 s all park at the same pressure, so it is not a budget problem. **Block AFW and it runs dry
— 22 psia, held, dialog up.** The driver is now `large_loca,station_blackout,afw_failure`, which is
a better casualty because it names the reason the plant cannot cope instead of relying on where a
blowdown lands. ⚠ And the browser/Node disagreement that came with it is **a CLIFF, not a physics divergence** —
chased down and filed as **#588**. The two agree to ~1 % through the first 375 s; then Node's
pressure solve lands unbracketed at the property floor at t = 393.43 s and `pwr2_core.js:505`
latches on that ONE step, while the reported pressure is 82.76 psi and rising. The browser never
takes it and recovers to a stable 83 psia. ⚠ The mechanism I first wrote — that the `flooredLow`
arm latches on one step and wants persistence — was read off the code and **disproved by
injection**: disabling any ONE of the three arms changes nothing, because all three fire and each
is individually sufficient (#295's trap as a diagnosis problem). The real finding is that **time
acceleration perturbs the plant ~1 %** (1x 267.31 psi at 200 s against 10x's 269.87) on a service
written to be acceleration-invariant — and ~1 % is the whole ballgame at a cliff.

**Gate bill.** `run_pwr2_geometry` 39 → **41** (21 → **24** mutations, three of them the double
count returning three different ways) · `run_pwr2_reactor` 41 → **42** · `run_pwr2_pressurizer`
92 → **94** · `verify_e2e_ui` unchanged, driver re-pointed. Every other PWR2 runner unmoved at
baseline.

## 2026-08-28-develop-h — #574: the metal is in the model, and four of its five reds were somebody else's

**THE DECISION THAT SHAPED THIS: measure before you scope, even when the request already names the
scope.** *(OWNER, 2026-08-12: "each node should carry the heat capacity of its own metal wall...
The U-tubes and RCP casing are probably where it matters most.")* The ring's fluid heat capacity
measures **93,855 kJ/K** and the metal **43,484** — 46.3 % — of which the tubes and pump casing are
~9 % and the **reactor vessel is ~25 %**. The instinct in the request was half right and pointed at
the smaller half. *(OWNER RULING, 2026-08-28: "All eleven nodes", taken on that measurement.)*

**Layer 1 owns the masses, Layer 3 wires, Layer 2 integrates** — the existing division, no new
file. Every number in the geometry block is COMPUTED from a stated rule rather than typed, so a
derivation cannot drift away from its value. The one number that is not geometry is the wall-side
film, and it follows `pwr2_fuel.filmCoefficient`'s existing idiom rather than inventing a second.

**⚠ AND THE FILM IS WHERE THIS CHANGE'S OWN TWO DEFECTS WERE, both found by ONE red.** The first
cut took the flow half of that idiom and not the phase half, while its comment claimed to follow
it: a 100 %-void core stayed coupled to 88 t of metal through a LIQUID film and absorbed 1,100 MJ.
The repair then applied the FORCED-convection vapour ratio to the FREE-convection floor, which is a
different physical quantity — free convection scales with the fluid's own conductivity — and left
an unmitigated break unable to reach the 10 CFR 50.46 clad limit at all. **A coefficient that is
nearly right rewrites a scenario class silently, and the red that finds it looks like a stale band.**

**THE ADJUDICATION RULE PAID FOR ITSELF, and this is the entry's other point.** Five reds. Batch-
judging them as "the metal moved things" would have buried both defects above and four pre-existing
ones: a negative control passing by **0.024 MPa** of an 18.0 MPa envelope; a fixture railed at the
property-table ceiling **from 5 s, on the pre-change plant**, with its divergence band reading that
as healthy; a rod-limit check sampled inside the boot ramp at the bottom edge of its own band; and
`run_pwr2_coredamage` measuring its entire chain on a plant frozen since 469 s. Three of the four
were checks passing by a hair on plants outside their own valid regime.

**⚠ AND THREE MUTATIONS WENT BLIND**, which is the standing "a neighbour's change blinds a
mutation" trap arriving live. Two had only ever been caught INCIDENTALLY, by trajectory checks that
happened to diverge — so the repair is to assert the WIRING, which no trajectory can take away, and
that required exposing `eng._brkBackP`: the backpressure the break actually used was unobservable
from outside, which is the same dark-wire shape as `wallLumps` itself. The third was **mis-tagged
`grp: 'C'` when its checks live in group I**, so the scoped replay ran a group with no opinion about
it. A wrong group tag scores a covered mutation as blind — the mirror of the usual failure, and
invisible unless you apply the mutation by hand.

**A test seam is declared as one.** `dryWalls` builds the pre-#574 plant so the walls can be A/B'd
against their own absence. Zeroing the masses instead is NOT a substitute: `M → 1e-9` divides the
lump temperature by nothing, the wall goes non-finite, and the "dry" plant then sits at a frozen
Tavg through a scram — an A/B that looked like a result and was an arithmetic failure.

### Open flags this entry leaves

None new. Four issues filed and none fixed here: **#583** (the pressurizer is in the mass ledger
twice — a rigid off-loop node plus the Layer-5 vessel, 17.6 % over the declared RCS; **FIXED the
same day, see `2026-08-28-develop-i`**), **#584**
(`Manuals/12` §12.15/§7.1 describe the retired pressurizer), **#585** (a held plant creates mass),
**#586** (the core-damage chain is measured on a held plant). Two dark wires stay named and unbuilt:
`transport: 'plug'` — every node is donor-cell, which is what makes cold-water accumulation in a leg
unrepresentable — and `surge_line_voided`, which appears nowhere in `engines/ layers/ ui/ test/`.
The support-structure mass is the weakest number in the geometry block and is marked so it can be
replaced alone.

---

## 2026-08-28-develop-g — #573/#473: heater elevation, and the drawn level that was never a volume

**THE DECISION THAT SHAPED THIS: a ruling is not landed until it is on the plant that ships.**
*(OWNER RULING, 2026-08-12, answer 3 of five: "physical heater elevation with progressive authority
loss. Replaces the 17 % cliff", narrowed the same day by "2: keep both" — the cliff loses its role
as the PHYSICS, not the interlock's existence.)* It was executed: `pwr_pressurizer2.js:355` with the
band at `pwr_config.js:1211`, gated by `run_pzr2.js`, 49 checks green. Both files are in
`site/build_site.js`'s `RETIRED` set and are stripped from public builds by #523. **PWR2 — the
plant the site runs — had the cliff and nothing else, and every document said the ruling was done.**

**Built on PWR2's own geometry, not ported.** `V = 4.176 m³` at L/D = 5 (the shape assumption the
vessel-mass derivation already uses) gives D 1.021 m, L 5.104 m, so 10 points of VOLUME is 0.510 m
of bundle sitting 0.255–0.766 m above the bottom head. `elev_bot_pct 5.0 / elev_top_pct 15.0`,
declared estimate. The retired engine reached the same two percentages on a vessel 2.8 % larger —
adopted by derivation, with the arithmetic in the module so the coincidence is not mistaken for a
copy. What the gate pins is the **ordering** (`elev_top_pct < low_cut_pct`), because that is the
claim; two literals can drift into a band straddling their own protection without any probe seeing.

**⚠ A DELIVERED/ENERGIZED SPLIT WAS FORCED, AND THE NAMES CARRY THE REASON.** The obvious
implementation multiplies the heater kW by the wetted fraction and publishes it. That resurrects
**#538 by a new road**: the shell derives `heater_power_pct` from the published kW and the board's
MANUAL button re-sends the readback as the new demand, so a half-dry bank halves the operator's
demand on every press. And `run_pwr2_engine`'s **closed energy audit** sums the module's
`heater_kW`, which must be the delivered number. So: `heater_kW` delivered,
`heater_energized_kW` published. A heater kW indication is **electrical** — an uncovered element
still draws full current — so the split is prototypical as well as necessary.

**No "heaters N % submerged" readout was added**, deliberately and against the reflex. The whole
teaching payload of HE-3 is that the gauge reads full while pressure will not come up; a
submergence readout hands the player the answer. The cue is documented instead (`Manuals/03` §5.2).

**#473 turned out to be a mapping defect, not a pixel move — which is why it was worth taking in
the same change** *(OWNER RULING, 2026-08-28: "Both in one change", from three options put with the
measurement attached)*. The drawn rods sat at level **15.6–24.6 %**, straddling and above the 17 %
cutoff: a bank the level could never fall through. The reason was that `comp_pressurizer.js` ramped
level LINEARLY IN HEIGHT while level is a fraction of VOLUME everywhere else in the project — the
engine's `V_liq/V_pzr`, and Ginna's own *"650 cubic feet, which is equivalent to 87%"*. The drawn
cavity's bottom dish alone holds 10.35 % of the volume, so the surface was **17.9 px** out at 5 %
and 10.4 px at the high-level trip. `yForLevel()` integrates the cavity now; the bank draws at
y 501.3–460.4 and rod spans derive from the cavity half-width at each rod's own y.

**The elevation is ONE number:** `HEATERS.elev_*_pct` → `getControlState().heater_elev_pct` → the
wiring → the component draws the band it is handed. The component's bare-mount default is
deliberately the OLD, WRONG elevation so a dropped prop is visible rather than silently correct.

### Open flags this entry leaves

None new; the unverified band is carried in the module and in `Manuals/12` §7.1, both marked. **Two
existing declarations are now NAMED AS STALE for the shipped plant and are not fixed here**:
`Manuals/12` §12.15 still declares the retired engine's `K_heater` departure (*"about 347× the
sourced rating"*) and §7.1 still frames the vessel as *"effective coefficients, not
thermodynamics"*. PWR2 has neither — it puts joules into a real two-region energy balance. Both
need their own measurement, and re-deriving them inside a heater-elevation change would have been
a second subsystem in the blast radius.

---

## 2026-08-28-develop-f — #536: the neutron source, and a constant that could not be ported

**THE DECISION THAT SHAPED THIS: a tuning constant belongs to the ENGINE it was tuned against.**
PWR2's point kinetics had no source term, so a subcritical core decayed without bound. The obvious
repair is to port `pwr_config.kinetics.source = 1.0e-6` from the engine PWR2 replaces. **That is
wrong, and it is wrong in a way that looks conservative.** The subcritical equilibrium is
`P_eq = S·Λ/(−ρ)`, so the constant is tied to the prompt generation time — and the old engine's Λ
is the 0.01 s explicit-integrator crutch PWR2 exists to be rid of, 500× physical. Matching its
level at the real Λ needs `S = 5.7e-4 /s` (an installed source ~500× any real one) and would ramp
an *exactly critical* reactor at 0.05 %/s out of nothing, against WTSM 2.1 §2.1.10's *"the source
neutrons become inconsequential"* at criticality.

**Built instead as a derivation with one declared gap.** `N_rated = ν·(P_rated/E_f)·Λ = 4.5506e14`
neutrons (ν = 2.43 and ~200 MeV/fission both WTSM 2.1, ML11223A207); `S = 5.0e8 / N_rated =
1.0988e-6 /s`. Only the installed source strength is unsourced — no corpus document gives an
assembly total — so it lives in `pwr2_kinetics.OPEN`, whose count rises 3 → 4. **That figure was
picked by a prototypicality test, not taste:** it leaves the sourced P-6 permissive (5e-11 A,
Ginna TS Bases) unmet at Hot Standby and brings it in at −366 pcm, partway up the bank.

**Deviation from the module's own integration note, and it is required, not preferred.** A constant
source makes the system **affine**, so the closed-form advance needs the particular integral as
well as the propagator. The matrix is augmented 7×7 → **8×8** (state `[P, C₁..C₆, 1]`, `A[0][7] =
S`, zero bottom row). Measured 1.28× on `advance`, 8.7 % of a plant step; `run_pwr2_perf` 4.1×
against its 8× bound. At `S = 0` it returns the 7×7 answer bit for bit, which is what lets the
integrator claims keep their 1e-9 tolerance (HR10 — the critical-hold check was **split, not
widened**).

**OWNER RULING, 2026-08-28: "Re-scale the gauges too"** — selected from three options put to him
(leave the scales and file the gap · leave everything · re-scale). The source-range scale
`k_sr = 5.0e8` was inherited from `pwr_config`'s `nis` block, where it had been sized against a
level the old engine produced *with the inflated Λ*; on PWR2 it read the shutdown plant 0.5 cps.
Now **2.6e11**, anchored so Hot Standby reads the ~500 cps `Manuals/09` §9.0 already documents —
prose the plant was brought *up to*, not edited. **`k_ir` deliberately did NOT move**: the sourced
20 %-current-equivalent intermediate-range rod stop (WTSM 8.1 §8.1.7.3) is derived through it, so
re-scaling it would move a sourced setpoint. The ruling was read as *which gauge is actually
wrong*, not *change both*.

**Two smaller calls.** Both `Math.max(pFrac, 1e-9)` display floors are removed — they existed only
to stop the gauges reading a core that had decayed to zero, and they pinned the settled post-trip
plant at 0.5 cps against a true 89. And `sr_energized` moved off its `pFrac < 1e-3` literal onto
the 1e5 cps securing cue `Manuals/03` §4.3 prints, so the rule cannot drift from the scale again.

**Subcritical initial conditions are now CONSTRUCTED at their own source equilibrium** (#502),
after the boron trim and the #468 bank order, because the equilibrium depends on the reactivity
those settle. A NaN refuses the build rather than seeding a plant from a non-number.

### Open flags this entry leaves

None new. The unsourced installed-source strength is carried where the module's other unsourced
constants are — `pwr2_kinetics.OPEN`, asserted non-empty and flagged by `run_pwr2_kinetics`, whose
count check moved 3 → 4 so the entry cannot be quietly dropped or quietly promoted. One gap is
**named but not opened as a flag** because it is unmeasured and belongs with #523/#525: the
`Manuals/09` §11.0 initial-condition table is still the retired plant's — it carries a
`cold_shutdown` column PWR2 does not have and a Hot Standby net-reactivity row of ≈ −1000 pcm
against a measured −1137. Only the row this change made wrong was corrected.

---

## 2026-08-28-develop-c — #572: the ruling was honoured and its subject moved

**THE DECISION THAT SHAPED THIS: an owner ruling names the WORK, and the evidence pass names the
THING.** Option A was *"build the 1.5 DPM startup-rate rod-withdrawal block"*, and the ruling was
A. The evidence pass — which option A explicitly required, because the figure was unsourced —
found **no startup-rate rod stop in the corpus at all**. WTSM 8.1 §8.1.7.3 (ML11223A252) lists
four *Manual Rod Withdrawal Stops*; corroborated on the anchor plant (Ginna UFSAR ch7,
ML20339A027) and in WAT 05 Transients (ML11216A094); a rate one is not among them. The 1.5 DPM
figure is the retired engine's.

So the block that got built is the two that are real and were missing — **power range high flux
at 103 %** and **intermediate range high flux at 20 % current equivalent** — and the band that had
nothing behind it is gone. Reading the ruling literally would have shipped an unprototypical
interlock behind a sourced-looking citation, which is the exact failure the evidence-pass SOP
exists to prevent, and it would have been *citable* afterwards. Recorded this way so the next
agent reads "A" as the decision it was: build the interlock, having first found out what it is.

**The measurement in the issue stands; the mechanism in it did not.** `surBlockDpm()` did not fall
through to its `return 1.5`. `_PROT` resolves at module load to `RD.PWR_CONTROL.protection` — the
pwr table, whichever plant is running — so the lookup SUCCEEDED and drew the retired plant's
interlock. That is #557's class, not a missing-data fallback, and the two suggest different fixes;
corrected on the issue before building.

**THE DESIGN HINGE was that the intermediate-range stop had to be blockable.** `ir_amps` is linear
in power and saturates its instrument range by ~24 %, so an unblockable 20 % stop would stand for
ever at power and refuse all withdrawal — a wedge, and the kind that only shows up after release.
The source resolves it rather than a judgement call: Ginna TS Bases B 3.3.1 says the IR function
*"may be manually blocked by the operator when two-out-of-four power range channels are greater
than approximately 8% RTP (P-10 setpoint)"*. It rides the same block `hi_flux_lo` does — **one
lever, the power-ascension step** — and measured, both shipped at-power ICs boot with it
requested. That is why a change to the rod drive at 20 % power reddened nothing at power.

**WHAT WAS BUILT** — full write-up and every number in `Blueprint/PWR2_VALIDATION.md` §104.

| | where | |
|---|---|---|
| the signals | `pwr2_protection` | `ROD_STOP` constants + `rod_stop_causes`, reported per-cause so a surface can name which stop stands. Neither leaks into the RUNBACK — no source gives a flux stop one |
| the refusal | `pwr2_engine` | `rodDriveDoor` refuses OUTWARD motion by name. Inward always takes: *"The rods can always be inserted into the core"* |
| the board | `control_kernel` + `pwr_board_wiring` | `getInterlockState()` publishes each interlock's setpoint; the SUR band is drawn from the LIVE list and is absent on a plant without the interlock |

**TWO THINGS BUILT BEYOND THE LITERAL ASK, and the reason is the same both times: shipping the
minimum would have shipped a fresh instance of a defect this repo just spent two days removing.**
The integrator had clamped outward motion on `_rodStopSig` **silently** since the ΔT pair was
built — an accepted command the next step discards (#545, §100). A new block with the same silence
recreates it on arrival. And a board band drawn from a module-load table is how the filed defect
existed at all; leaving that mechanism in place while fixing its symptom would have re-armed it.

### Open flags this entry leaves

- **An unblocked startup now stops itself at 20 % power.** Prototypical, and the P-10 block is
  already the documented ascension step — but it is a NEW way for a startup to appear stuck, and
  the refusal message is the only thing carrying the player through it. No mission or checklist
  has been walked end to end against it (#525 is the standing mission-compatibility gap).
- **`_PROT` is still a module-load reference to the pwr table** everywhere else in
  `pwr_board_wiring`. This change fixed the one consumer that was measured wrong; the others —
  `_PROT.trips`, `_PROT.alarms` — have not been audited for the same shape.
- The rod stop guards the **control bank only**; the shutdown bank's drive is deliberately
  unguarded (the existing declared choice for the ΔT pair, inherited here rather than revisited).

## 2026-08-28-develop-b — #571: the reset's other permissive was dead, and the manual documented it as live

**THE DECISION THAT SHAPED THIS was refusing to fix it in the kernel.** The obvious repair is to
teach `rpsResetBlock` about PWR2 — but the kernel is plant-agnostic by rule (HR3), and its
implementation is not wrong: it iterates `config.trips`, which is the right source for a plant
whose protection the kernel owns. PWR2 hands it `trips: []` **deliberately** (#546/#547, §98),
because this plant's protection lives inside the engine. So the seam is where the fix belongs, and
the shape that fits it is the one the kernel already offers: **a data row against an instrument
the plant publishes.**

That choice is what makes the board free. `SCRAM_RESET_NOTE.TRIP_SIGNAL_PRESENT` →
`'TRIP SIGNAL STANDING'` has been wired since #75, waiting for a `reason` PWR2 never sent; a row
carrying that reason lights it with **no UI change at all**. A shell-side guard alone could not
have — the board's promise in `Manuals/03` §3.5.1 is that the caption tells you *before* you press,
and only the kernel's permissive is consulted before a press.

**THE DEFECT.** Measured, a large LOCA holding `lo_pzr_press` at **1074 psia against 1775 psia**,
asserted and tripping, rods seated: `rpsResetBlock()` null, `resetRps()` null, the latch cleared,
and **one 0.1 s protection step later it re-latched on the same signal**. Self-correcting, and
therefore quiet — the SCRAMMED lamp blinks and nothing says why. The section's own teaching point
(*"Recovery is procedural, not a button"*) was false on the plant that shipped.

**WHAT WAS BUILT** — one derivation, `standingTrip(e)`, feeding three consumers; full write-up and
every number in `Blueprint/PWR2_VALIDATION.md` §103.

| consumer | what it gets |
|---|---|
| `ex.no_trip_signal_standing` | the published instrument, in the POSITIVE so an `is_true` row reads as the condition that must hold — the `rods_fully_in` convention beside it |
| `getProtectionConfig().rps_reset_permissive` | the row, **prepended** to the pwr rows, carrying `reason: 'TRIP_SIGNAL_PRESENT'`. Order is the message, and the kernel's own comment says which is more fundamental |
| `MAPPED.reset_rps` | the facade's refusal, checked before rod bottom, naming the channel, its value and its setpoint — the detail a static row cannot carry |

**`asserted`, NOT `tripping`** — mirroring the kernel's `crossed(...)`: no delay, gates honoured.
A blocked trip therefore does not hold the reset, which is required on a cooldown (P-11 blocks the
low-pressure trip; without the carve-out a cooldown could not reset the trip it caused), and the
two implementations agree **by construction** rather than by a second copy of the gate tests —
the #294/#303/#557 class avoided by not writing the test twice.

**A DEADLOCK THAT DID NOT HAPPEN, recorded because it was close.** `turbine_trip` and the manual
pushbutton are latch INPUTS in `pwr2_protection`, not table rows, so they never appear in
`functions` and cannot reach this derivation. That is load-bearing: the turbine stays tripped
until latched, `latch_turbine` refuses under a standing reactor trip (§100), and a turbine row
here would have deadlocked the two commands against each other with no way out from the board.

**THE METHOD NOTE.** The first draft was **silently broken and looked strict**. Written against
the shared instrument status list, the new instrument never reached the reading —
`_copyStatus` does `this.reading[st[i]] = ex[st[i]]` over `specs.status` only — so
`crossed(undefined, 'is_true')` was false and **every** reset was refused, the ordinary
post-scram one included. A silent `undefined` reads exactly like a working interlock. The only
thing that told the difference was a check asserting the **clean recovery still works**, which is
why that check leads the gate section. Same family as the #545 blind mutation the day before: the
failure mode is a fix that cannot be distinguished from correct behaviour by the tests written
beside it.

### Open flags this entry leaves

- **MEASURED and FILED as #572** — the flag carried over from `-a` is a real defect. PWR1 has three
  interlocks blocking OUTWARD rod motion; PWR2 rebuilt two in the engine (the delta-T pair,
  `_rodStopSig`) and **not the 1.5 DPM startup-rate one**, while the board drew a red band for it.
  Proven by EFFECT: **10.00 DPM indicated, 6.7× the setpoint, 90 consecutive withdrawals, ZERO
  refused**, stopped only by a `hi_flux_lo` trip. Two options costed on the issue; the 1.5 figure
  owes an evidence pass before it becomes this plant's number, which is why it is filed rather
  than built here. **RESOLVED the same day — see `-c` below, and read that entry rather than this
  one**: the evidence pass found no startup-rate rod stop in the corpus at all, so the two SOURCED
  flux stops were built instead and the band was retired. This row also named the wrong mechanism
  (it said `surBlockDpm()` reached its fallback; in fact `_PROT` resolves to the pwr table
  whichever plant runs, so the lookup SUCCEEDED against the retired plant) — left visible, with
  the correction, because a flag that was half wrong is worth seeing next to what it became.
- The permissive covers `kind: 'rps'` rows only. The SI, AFAS and FWI latches have their own
  securing permissives (#512) and are not affected, but nothing checks that the two families stay
  disjoint as rows are added.

## 2026-08-28-develop-a — #545: the reactor trip breakers take the rod drive's power away

**THE DECISION THAT SHAPED THIS is that the source answered a question I was going to put as a
design choice.** The plan's second open question was whether, under a failure to scram, the rod
buttons should refuse outward only (following the engine's existing rod-stop idiom, *"inward is
always allowed — it HELPS"*) or both ways. `tools/find_source.js` settled it before it was asked —
Ginna TS Bases B 3.3.1 (ML20339A221): *"The RTBs are in the electrical power supply line from the
control rod drive motor generator set power supply to the CRDMs. **Opening of the RTBs interrupts
power to the CRDMs**, which allows the shutdown rods and control rods to fall into the core by
gravity."* One sentence supplies the whole fix: the latch means the breakers are open, the breakers
being open means no drive power **in either direction**, and gravity is what acts instead — which
is the scram ramp the engine already had, on its own branch, untouched.

*(OWNER RULINGS, 2026-08-28, both menu selections cited in that form: "#545 + the two one-liners";
"Refuse both directions".)*

**THE DEFECT** was the same shape as yesterday's turbine cluster one system over: the rods were the
**only** reactor-trip consumer wired to the latch's rising EDGE. The turbine trip, the SI pumps, the
AFW starts and the feedwater isolation on the three lines beneath it are all level-held. Measured,
full facade from Hot Full Power: scram, then hold WITHDRAW on both banks, and at t+910 s the plant
sat at **200/200 steps and 61.18 % true power** (61.93 % core thermal, 186 MWt / 634 MMBtu/hr) and
**598.4 °F (314.7 °C)** with `scrammed` reading true on the true state, the instrument **and** the
control kernel simultaneously — while the 35 % power-range flux trip stood asserted at 0.6170
against 0.350, tripping, held 751.6 s, and could do nothing, because the latch it would set was
already set.

**WHAT WAS BUILT** — full write-up and every number in `Blueprint/PWR2_VALIDATION.md` §102.

| | file | |
|---|---|---|
| the level hold | `pwr2_engine.js` | `rodDrivePowered = !eng.pt.reactor_trip`; a branch **above** the runaway branch, so an injected continuous-withdrawal drive fault stops too; the shutdown bank's own drive guarded. Demands are not rewritten (the heals-itself trap) |
| the door | `pwr2_engine.js` | `rodDriveDoor()` — `rod_target` / `sd_target` refuse **by name**, and refuse MOTION rather than the press, because the board sends `rod_stop` on every button release |
| `rods_fully_in` | `pwr2_shell.js` | both banks. The retired engine has had `.every()` since #75; this was a second copy that lost it, so rods **0/200 published `true`** |
| the reset | `pwr2_shell.js` | refuses with the rods out (the facade had **no** guard — measured, `reset_rps` at 200/200 returned `{"ok":true}`), and snaps both demands to position |

**THE METHOD NOTE WORTH KEEPING.** The first draft's level-hold mutation went **BLIND** —
`run_pwr2_engine` came back 59/60. The hold and the door are **each sufficient** for the operator's
own sequence: with the door refusing, `rodTarget` never reaches 200, so there is no demand left for
the hold to hold. That is the #295 bullet (*"a multi-part fix whose parts are each sufficient makes
a one-sided injection lie — revert BOTH to reproduce"*) reproduced by an agent who had quoted it in
the comment three lines above the check. Neither half was weakened; the demand is planted **past**
the door instead, which is the honest reproduction of the other arrival — a withdrawal demand
already standing when the trip lands, which is exactly what an ATWS is.

**THE BOARD GATE EARNED ITS KEEP.** `run_pwr2_board` reddened on the change, correctly: its #570
no-orphan sweep found the shutdown bank's two latch buttons throwing from inside a MAPPED handler,
which is the *"a control that can only throw is a dead button"* class. They are now declared
CONDITIONAL with the condition named — the one distinction that separates a permissive from a dead
control, and the reason that list is required to carry a reason.

### Open flags this entry leaves

- **The reset's OTHER permissive is dead on PWR2 and the manual documents it as live.**
  `control_kernel.rpsResetBlock` iterates `this.config.trips` for `TRIP_SIGNAL_PRESENT`, and
  `getProtectionConfig` hands PWR2 `trips: []` (§98). `Manuals/03` §3.5.1 lists it as one of **two**
  permissives, with its own board caption. Filed under #534; needs a PWR2 data path from
  `rpsReport` into a shell-published instrument.
- **`pwr_board_wiring.surBlockDpm()` reads `_PROT.interlocks` for the 1.5 DPM startup-rate rod
  withdrawal block and falls back to 1.5.** PWR2's interlock list is empty, so that block may not
  exist on this plant at all. **Noticed, not measured** — verify before writing it down anywhere.
- The both-directions rule makes a failure to scram a **boration** problem. Nothing in the campaign
  teaches that yet; the Tier C core casualty list (#507) is where it would land.

## 2026-08-27-develop-g — #570: three gates on the prose/plant seam, and why only two of them exist

**THE DECISION THAT SHAPED THIS was refusing to treat one failure as two instances of another.**
#562 (prose claimed a capability the code lacked) and §99.4 (prose was accurate, an absence was
inferred from it) look like one problem — "stale docs" — and are not. The first is partly gateable;
the second is a procedure failure and no runner reaches it. Building one gate for both would have
produced something that caught neither well.

**The ungateable half got a BROADENED rule, not a new one.** CLAUDE.md's coverage bullet already
said "to prove something is untested, break it and run the gate"; it now covers "X is not built".
A sixth rule nobody reads is worse than a fifth that binds, and the repo's own history (the
2026-07-27 "too many instructions" ruling) is the argument.

**The round-trip gate's design is a CONTROL LEG, and its first two drafts are why the file says so
at length.** Draft 1 — snapshot `control_state` before and after on one engine — passed 28 of 28
with zero possible failures, because the plant is running. That is the hollow-check pattern written
fresh into a gate whose entire purpose is to catch it, and it is recorded in the file header rather
than quietly fixed, because the next person to build a "did anything change" check will reach for
draft 1 first.

**DECLARED EXEMPTIONS ARE STRICT, both here and in the board sweep.** `INERT` (round-trip) and
`CONDITIONAL` (board) each require the REASON, and an entry whose reason stops being true reds the
runner by passing. An exemption list without reasons is a skip list, and a skip list is how the
five #567 controls survived a sweep written to find them.

**`run_manual_commands` iterates a hand-maintained table ON PURPOSE**, which is normally the trap
this repo catalogues ("a gate that iterates a hand-maintained MAP tests the map"). The distinction:
that trap is about using a map to test the CODE. Here the map IS the claim under test — the manual
is what might be lying. Its limits are written into the file: it cannot check payload KEYS (#562's
row was correct while the shell read a different key) and it cannot check surrounding prose.

**The reverse direction is deliberately not asserted.** Requiring a manual row for every MAPPED
action would push an operator's manual toward a command dump. The asymmetry is the point: the
manual may say less than the plant does, but nothing it says may be false.

### Open flags this entry leaves

- **Prose that misdescribes a LIVE mechanism is still ungated**, and stated as such in §101.5
  rather than covered by a gate that would only look like it.
- **`run_pwr2_roundtrip` covers 19 actions**, not the whole registry. The list is hand-written and
  should grow when a new operator lever lands; it is not claimed to be exhaustive.
- Agent comment volume is part of the failure mechanism and no runner addresses it.

## 2026-08-27-develop-f — #558/#551/#559/#567/#560: the latch refuses by name, and the board is engine-agnostic about it

**The design decision that mattered was not the latch — it was the REFUSAL.** `latch_turbine` is
one line of engine door; the reason this took a design is that `pwr2_engine` level-holds
`tb.tripped = true` in SIX places, so a bare un-latch is ACCEPTED and then overwritten on the next
step. That is #509 §79's defect exactly (the plant agrees and nothing happens), and shipping it
would have been worse than the missing command, because a refusal at least tells you something.
`turbineTripCauses(eng)` enumerates the six and the command names which one stands.

**The level-holds were deliberately NOT weakened.** The tempting simplification — let the latch win
and drop the re-assert — is #545's open defect on the reactor side (a latched trip that the rods can
be driven out from under). The engine keeps holding; only the *reason* became addressable.

**LATCH puts the machine on the line, and the roll stays out** *(OWNER RULING, 2026-08-27: selected
"Latch = back on the line")*. WTSM 11.3 describes a real sequence — latch closes throttle and
governor, speed control rolls, then load control — and this turbine is binary (`rpm = tripped ? 0 :
rated`). Modelling it is #307, CLOSED and `status-deliberate` as "open by design". Latch is the
defect fix; the roll is a feature that ruling already declined.

**THE SHARED BOARD IS THE CONSTRAINT NOBODY REMEMBERS UNTIL IT REDDENS.** `pwr_board_wiring.js`
serves PWR1 and PWR2, and the owner's ruling replaces a tile pair. Changing a tile's meaning for one
plant broke the other engine's gate in eight places from a single press — `board_check` clicks what
used to be MAN, which is TRIP now, so it tripped the machine, scrammed the plant, and every check
below failed on a dead plant. The resolution was NOT an engine-key branch (that is the #557 rot the
capability-flag idiom exists to avoid): the RETIRED engine gets the same verb, `latch_turbine`, as
the latch half of its own `connect_grid`, keeping its sourced vacuum permissive. **Declared
consequence**: that engine's board loses its dispatch-mode selector. `set_load_mode` is still a
command there, HR9 says content follows the plant that ships, and #523 strips it from every
published build.

**The refusal-visibility fix is scoped to the DISPATCH, not to time.** A timer would have been
easier and wrong: the Scanner's documented behaviour is that the next hover replaces a flash, and a
time-boxed guard breaks that. A click-dispatch counter stamped on the flash keeps both properties,
and the browser check asserts both halves — the message persists across frames AND a hover clears
it.

**Reachability was split across two runners rather than duplicated.** A REFUSED action is not a
defect if the control is dark, so the claim has two halves that need different fixtures: the PLANT
publishes the darkening flag (`run_pwr2_kernel` band 4, cheap and static) and the BOARD reads it
and renders disabled (`run_pwr2_board`, a real mounted board). Each names the other. Band 4's old
form — "the board never sends an action that is in REFUSED" — could not express the fix at all,
because the fix keeps the actions refused and darkens the controls.

### Open flags this entry leaves

- **#529** is untouched and its premise is now falsified — commented, not worked. It needs two
  sourcing answers first.
- **#545** stays open and adjacent. Anyone touching `turbineTripCauses` should read it before
  weakening a level-hold.
- The retired engine's board has no dispatch-mode control. Declared above, not a defect to file.

## 2026-08-27-develop-e — #540/#549/#541/#562: the SG gets an energy limiter at both walls, and aux feed gets its valve

**The decision that shaped everything else: where the level hold lives.** *(OWNER RULING,
2026-08-27, selected "Throttle in engine + AUTO channel" from three options.)* The retired engine
holds steam-generator level **inside** its own SG module — an always-on proportional taper the
operator cannot leave. Copying that into PWR2 was the cheapest option and it was rejected, because
it deletes the task the sourced material says is the operator's: *"It is necessary to throttle AFW
flow to control RCS temperature at this point"* (WAT 05 Transients, ML11216A094). An always-on hold
teaches exactly what #562 says the plant currently teaches — that auxiliary feed is
fire-and-forget. So the **throttle** is physics (`pwr2_afw.js`, a valve downstream of both pumps)
and the **hold** is an automation channel (`afw_level`) the player can take to MANUAL.

**The channel def lives in `pwr2_shell.js`, not `pwr_control.js`'s shared `PWR_CHANNELS`.** It was
written there first and moved. Putting it in the shared table gives the RETIRED engine a second
authority over a valve its own engine already holds — the duplicate-authority veto
(DESIGN_CRITERIA Q4) — for no gain, on an engine #523 retired from public builds. PWR2 admits pwr
channels one at a time by an explicit criterion (its whole vocabulary is a command PWR2 has, its
input is live); `afw_level` is the second to meet it, and it meets it without the rule being bent.

**MANUAL FIRST, THEN AUTO** (the 2026-08-12 directive) was followed literally: the throttle was
built and measured with the channel disengaged — set and readback in one currency at 100/75/50/25/0
%, delivery linear, pumps still RUNNING behind a shut valve — before the channel was allowed to
hold it. The auto-mode measurement then asserts the controller *holds* what manual proved, which is
a different claim.

**The energy limiter's reference point is `h_lo`, not `h_f(P)`, and the choice is load-bearing.**
#549's fix is the existing enthalpy clip's own inequality solved for the export instead of
absorbed. Referencing `h_f(sg.P)` looks more principled and is wrong here: `sg.h` **is** `h_f(sg.P)`
by construction, because `updatePressure` inverts the saturated-liquid line, so the stored term
vanishes identically and the export becomes heat-limited at *every* operating point — the demand
would stop setting the flow at all. Measured both ways before choosing. The gate carries the
`h_f(P)` form as a mutation so the reasoning cannot be quietly undone.

**The overfill wall is MODELLED, not declared** *(OWNER RULING, 2026-08-27: "Model it now")*. The
plan offered deferring it with a declared simplification; the owner took the model. It cost two
constants and neither is new: `carryover_mass_frac` and `mass_full_frac` are read off the plant's
own level map, which **moved to `SG.LEVEL_MAP` in `pwr2_sg.js`** in the same change. That map had
been a local inside `pwr2_true_state.js` while `pwr2_sg.js` held a hand-copied `dryout_mass_frac`
off one of its points — two files that had to be edited together. Given a cluster that is otherwise
entirely about second copies of plant constants, adding two more to the same shape was not an
option; the map got one owner and three readers.

**⚠ A FUNCTION THAT WAS ALREADY COMPLETE — corrected the next session.** This entry originally
said the high-high level turbine trip "had no report field and no consumer" and was now built. The
consumer existed: `pwr2_engine`'s FWI line has read `if (ptr.fwi) { eng.fw.isolated = true;
eng.tb.tripped = true; }` since it was written, carrying the WTSM 3.2 citation. The conclusion came
from `pwr2_protection.js`'s HEADER — *"P-14 class: feedwater regulator closure + turbine trip"* —
plus the absence of a `turbine_trip_hi_level` consumer, without grepping the engine for
`tb.tripped`. **A module header is an inherited claim, and this repo's own standing rule says
inherited claims are the risky ones.** The duplicate consumer was removed; the report field stays,
because a two-consequence function reported as one boolean is exactly how the next reader repeats
the mistake.

**BOARD: one control, not three.** The engine has a switch per pump [sourced, Ginna TS Bases
B 3.3.2(a)] and `set_afw {pump}` reaches either, but this plant has one steam generator and one aux
feed panel, and the panel was already full. Two more pump buttons would be two controls the player
cannot tell apart — the Q4 veto. **STOP now secures both pumps**, which is what #541 asked for; the
per-pump discriminator stays a command-surface capability for the instructor and scenarios. The
panel grew 60 → 100 px and CONDENSER COOLING dropped 40 px to make room for the THROTTLE box, both
through `DOC_PATCHES` — geometry measured off the doc first, and nothing else lives in that column
below 785.

### Open flags this entry leaves

- **The `h_lo` clip still binds** 3,872 of 60,000 steps on the #549 transient, worth 0.4 MJ against
  a pre-fix 16,236 MJ. Every binding step is the vessel at the 0.1 MPa property floor with
  **subcooled** aux feed arriving — a state a saturated-line model cannot represent. That is
  **#524**, not this ledger, and it is stated in the code rather than papered over.
- **`afw_level` shows `saturated:'lo'` on a healthy at-power plant** ("at minimum output — no
  authority to correct"). True — shut valve, no pump running — but it reads like a fault. The
  kernel consults `standby` for the snapshot flag and, in the note path, only for `kind:'rods'`;
  teaching the PID path about standby is a kernel change touching every plant. Declared, not fixed.
- **#532 stands.** Only the manual claims this change made false were corrected.

## 2026-08-27-develop-c — #539: the rated scale is frozen on BOTH of steamDemand's axes

**Claim.** `rated_steam` is every secondary normalization's denominator and
`PWR2_VALIDATION.md:3808` declares it frozen at the rated scale. It was frozen on neither axis:
164.2471 / 165.1924 / 165.6972 / **0.0000** kg/s across the four presets. Now one number,
spread exactly zero.

**The decisions.**

| Decision | Alternative considered | Why |
|---|---|---|
| DELETE the cold-branch recompute; compute the scale once at the design pressure | reorder `eng.tb.load_target_mwe = ic.load_mwe` below the cold block | a reorder fixes the symptom and leaves the aliasing (`eng.tb` **is** `tb`) for the next editor. Deleting removes the coupling. And a reorder alone would still leave 50 % / Hot Standby drifting, because that half of the defect is the preset's own `sg.P`, not the ordering. |
| Freeze ALL FOUR presets, not just the zero *(OWNER RULING, 2026-08-27: selected "Fix the class — one frozen scale" from options I wrote — a selection, not verbatim words)* | fix Mode 4 only, #539's filed scope | the 0.57 % / 0.88 % drift is the SAME line and the same declared-design violation. Fixing the zero alone leaves §3808 still describing something the code does not do, and it returns as its own finding at the next sweep. |
| `pwr2_relief`'s guard becomes `> 0` | leave it; the engine no longer passes 0 | the guard is the only hard refusal in the chain and its own message says it will not invent a plant. `=== undefined` refuses a MISSING plant and accepts a NOUGHT one. Defence in depth at a layer boundary costs one character. |
| The new gate asserts the INVARIANT across all four presets, re-derived | add more consequence checks (feed delivers, safeties lift) at Mode 4 | both, actually — but the invariant is the one that would have caught this. 93 green runners each measured a consequence at ONE preset, and a denominator wrong at every preset in a DIFFERENT way is invisible that way. |
| Two `d239e76` checks re-pointed, and one rewritten to INJECT its NaN | re-band them, or delete them | they were stale fixtures, not regressions, and each was adjudicated on its own per the owner's second ruling. The NaN one is the sharper lesson: a regression pin that borrows a broken preset as its fixture dies the day the preset is fixed. |

**Open flag closed:** #539. **Open flag unchanged:** #542 (the code-safety lift ramp is anchored
at the reseat pressure, so the bank parks cracked open below its own pop and never reseats).
This change restored the bank's CAPACITY; its RAMP is that issue.

---

## 2026-08-27-develop-b — #534 cluster: the restore is transactional, and the save carries its own scales

**Claim.** Five #534 findings are one code path — save, load, rewind — and are fixed as one change:
#554, #553, #555, #548 and #563 item 3. No plant number moves.

**The decisions, and why each is the one taken.**

| Decision | Alternative considered | Why |
|---|---|---|
| `_restore` constructs engine + layer into LOCALS and installs only after both loads return | a `try/catch` that rebuilds the previous plant on a throw | there is no previous plant to rebuild from — the old objects are the only copy, and a rollback path that has to reconstruct them is the same defect one layer out. Constructing into locals is a reordering, not a mechanism. |
| The Instructor gets a snapshot-and-rollback rather than the same treatment | construct a second Instructor | it is a PERSISTENT object the service does not own the lifetime of (`connect` merely points it at the layer). Its own `saveState`/`loadState` pair is the rollback. |
| The save NAMES its non-finite ids; the load re-installs `NaN` | sanitize non-finite to 0 at the boundary; or sweep `isFinite` → `Number.isFinite` | a zero is the DEFECT (a plausible reading nothing rejects), so substituting one at the boundary just moves it. `Number.isFinite` appears nowhere in this tree — ~20 guards in `engines/pwr2/` alone are the coercing form — so a sweep is a repo-wide convention change and a separate decision. Bit-exactness is the stated bar; a dead channel stays dead. |
| `rated_steam` + `M_nominal` go in the ENGINE save's `scalars`, AND the service records `initial_state` | either one alone | the engine-side persistence is what actually fixes PWR2 today. The metadata field is three lines and removes the class: `_restore` hard-coded `'hot_full_power'` directly under a comment reading *"Reconstruct the right engine + config for this plant"*, which is the trap the next engine walks into. |
| The `ui/app.js` refusal toast NAMES the reason | keep the generic *"Not a valid save file"* | the common post-#523 case is a save from the retired engine, and a returning player is owed that sentence. Costs nothing — `loadState` already returns the message. |

**Open flag closed:** none. **Open flag unchanged:** #539 (Mode 4, Hot Shutdown boots with
`rated_steam = 0`) stays open *(OWNER RULING, 2026-08-27: selected "Leave it out" from options I
wrote — a selection, not verbatim words)*. It is the root of the NaN above, it is a
plant-behaviour change owing a Hard Rule 12 pass, and this change is what makes it safe to take.

**Migration.** Four new save fields plus one metadata field, all absent-tolerant, all falling back
to the pre-fix behaviour exactly. Pinned by a `run_m5` check that deletes the field and loads.

---

## 2026-08-26-develop-a — #523: PWR2 replaces the PWR on the site; the strip is CHANNEL-GATED

**Four owner rulings, 2026-08-26, in planning** — *"Flip now, track the gaps"* · *"Strip it at
build time"* · *"Keep freePlayOnly, file the compat pass"* · *"Reword to Hot Shutdown (Mode 4)"*.

**The decision worth recording is the CONDITION, not the strip.** *"Strip it at build time"* was
the ruling; whether it strips on **every** build or only on the **public** one was mine, and it
goes the way it does for a reason that is not conservatism:

- The public site must not carry the retired engine. That is the ruling, and it is met.
- The **preview** site is where the campaign, the scenarios and the walkthroughs get vetted, and
  every one of them is authored against the retired engine — which is why `ENGINES.pwr2` still
  carries `freePlayOnly: true` under the third ruling above. A feature FLAG can be overridden by
  hand on a live site (that is how a gated feature is inspected); a deleted `<script>` tag cannot.
  An unconditional strip would have taken the preview site's guided content with it and left
  nowhere to vet the thing the third ruling explicitly deferred.

So the two rulings are only consistent with a channel condition. Making it unconditional later is
deleting one branch, and `test/run_site_build.js` asserts **both** directions so neither can drift.

**The portable build is unconditional, deliberately** — a distribution artifact should be the
plant the site runs and nothing else, and a two-engine bundle would make `run_portable` certify a
file nobody downloads.

**Two files are NOT the old engine and must never be treated as it**: `pwr_config.js` and
`pwr_instruments.js`. PWR2 reuses the published instrument layer and builds its protection config
from `RD.PWR_CONFIG.protection`. The gate asserts them as a **precondition**, because pruning them
yields a site with no plant while every other check passes.

**Card visibility is DERIVED, not declared.** `ctorPresent()` gates the `?engine=` override, the
boot fallback and the plant column. A published build cannot hold a static availability list —
the answer differs per build — so the menu measures. Full record and the two defects it exposed:
`Blueprint/PWR2_VALIDATION.md` §94.

## 2026-08-25-develop-c — #513: the aggregate gate 439 s at 10-way (was ~19 min); two owner rulings

**Decisions.** (1) *(OWNER RULING, 2026-08-25, plan question — "Move it out (Recommended)")*:
`run_pwr2_ab.js` → `measure_pwr2_ab.js`, out of `run_all` discovery — a measurement that exits 0
always cannot fail and cost ~49 s per gate run. (2) *(OWNER RULING, 2026-08-25, plan question —
"Split both (Recommended)")*: `run_behavior` split into siblings ("2-3", built as thirds by probe
id mod 3: 126/146/125 s) and `run_campaign` by plant (A structural+pwr 257 s, B rbmk+bwr 8 s) —
the 398.8 s behavior battery was the gate's makespan floor. Scheduling changes only; every probe
and suite still runs, per-part BASELINES entries, per-part gap reports with the legacy filenames
kept on part A.

**Engineering.** Mutation-replay scoping (the `run_pwr2_engine` `grp:` idiom) ported to cvcs /
shell / sg / rhr / sources with a NEW scoped-clean-pass preflight (a group must be green ALONE on
the clean build — the guard that keeps a crash-counts-as-caught replay loop honest; it caught a
latent hollow catch in cvcs's SI-boron quiet band on its first run). The per-replay
`pwr2_water`/`pwr2_vtable` cache deletion stopped (the ~0.5 s GRID build was re-paid ~135×/run;
kept as a pair — the vtable closes over the water instance). `NODE_COMPILE_CACHE` in every gate
child. `verify_e2e_ui`: 7 fixed sleeps → predicate waits; two kept deliberately (recorder-row
accumulation is wall-real; the player-paused window is a negative assertion). All `secs:` hints
re-recorded from measured solo costs. Full detail: `Diagnostic/TUNING_LOG.md`
2026-08-25-develop-c. **The remaining wall is `run_campaign` part A under contention (~440 s);
splitting its pwr missions exceeds the by-plant ruling and needs the owner.**

**Follow-up ruling, same day** *(OWNER RULING, 2026-08-25: "I approve the pwr campaign mission
split.")*: `run_campaign_c.js` — part C is a MEASURED-COST list of the three heavy pwr suites
(~116 s), not a count split: parity alternation was tried first and landed 25 s / 229 s, because
campaign suite costs span 0–51 s. The per-suite table and the drift guard (a new mission lands
in part A and moves its suite-count baseline) live in run_campaign.js's comment. Same
scheduling-only class as the first two splits.

---

## 2026-08-25-develop-b — #514: PWR2 step cost 1,090 → ~85 µs, and shell.html drops RBMK/BWR

**Claim.** The shipped PWR2 engine stepped at 1,090 µs — 51× the old engine, 68× the design
spine's own budget — because the vtable optimisation (D1 §28.1) was wired into one caller and
every later Layer 5 module went back to the direct correlations; §28.1's "stop condition
CLEARED" was Layer 4 alone. Fixed by wiring the resolved-once table idiom into every module,
adding `T_from_h` (the same two correction passes `rho_sub` uses; 0.009 °C worst in the
operating band) and `P_sat_T` (direct index on the uniform-T grid) to the vtable,
warm-starting the containment flash and SG pressure bisections, and computing Tavg once per
step. **Deliberately NOT done:** substituting `sys.M_total` for the CVCS boron-ledger mass sum
(the ledger total includes the pressurizer via `extraMass`; the sum's semantics are the
nodes') and the two ~1 % allocation trims (measured immaterial post-fix). The vtable now
builds on FIRST USE (was 500 ms at every page load, plain-PWR sessions included). Gate:
`test/run_pwr2_perf.js` — ratio-asserted (≤ 8× the old engine, measures 4.1×), lazy-build
pinned, injection self-tested. **Load cut** *(OWNER RULING, 2026-08-25, selected from options
I wrote: "Drop RBMK/BWR tags")*: shell.html no longer loads the 18 RBMK/BWR files (~308 KB);
`?engine=rbmk|bwr` falls back to PWR; `verify_e2e_ui` pruned to PWR-only in the same change
because its rbmk/bwr rows would silently screenshot the PWR fallback. Full numbers:
`Diagnostic/TUNING_LOG.md` 2026-08-25-develop-b; the stale-figure correction is
`PWR2_DESIGN.md` §28.1a.

---

## 2026-08-24-develop-e — #511: the accumulator's sizing basis (the ruled 0.435 identity over WTSM per-loop scaling)

**Claim.** The accumulator's water volume is **0.435 × this plant's own RCS volume** (the
#408 Ginna identity the old engine already carries: 2×1,115 ft³ against a 5,123 ft³ RCS,
UFSAR T15.6-15), resolved from the Layer-1 node volumes at load — 10.29 m³ / ~2,719 gal.
The alternative was per-loop power scaling of WTSM Table 5.2-2's 6,500 gal (the RCP-inertia
convention), which gives 2,287 gal — same class, different basis. **Why the identity wins:**
Hard Rule 9 — the plant's ruled identity already answers this question (pwr1's
`accumulator_capacity` was sourced-scaled to the same 0.435 at #408), and two engines
carrying two different accumulator sizes for one plant would be a parity defect of the kind
#507 exists to close. The cover pressures (650/600 psig) and fill fraction (2/3 water) are
WTSM's, intensive and unscaled. The discharge coefficient is SOLVED against the same Ginna
table's ~36 s dump — the gate measures the empty time it produces. Record: `PWR2_VALIDATION.md` §80.

## 2026-08-24-develop-d — #509: two owner selections (chart lanes fill; RCP density reference to the cold leg) + the reset seam

**Claim.** The owner's third playtest (#509, 11 items) is worked end to end; the full measured
record is `PWR2_VALIDATION.md` §79 and the session entry is `TUNING_LOG` 2026-08-24-develop-d.
Two decisions recorded here because they change standing rules:

- **Chart lanes STRETCH TO FILL** *(OWNER SELECTION, 2026-08-24: "Lanes stretch to fill
  (Recommended)" — chosen over "Keep cap, fix polish only" and "Cap becomes a floor")*. The
  #445 spec §8 56 px lane target ("extra space adds rows, it does not inflate them") is
  RETIRED; pinned lanes divide the full plot height. The 36 px floor and the 2026-08-10
  demote-to-numeric-rows selection are unchanged. `ui/test_panel/lane_reference.html`
  updated first, then `ui/app.js laneSplit` (the constant deleted, not zeroed).
- **The RCP's rated-density reference is the design COLD-LEG state** *(OWNER SELECTION,
  2026-08-24: "Recalibrate to cold leg (Recommended)" — chosen over "Keep physics, declare
  it")*. `pwr2_sources.rhoRated()` was pinned at the loop-average design point while
  `loopDensity` reads the RCP node (cold leg), so rated speed at the design point delivered
  105.16 % of `mdot_rated` by construction. Now 288.95 °C (552 °F) = tavg − dt/2, resolved
  from a single `DESIGN` object that `pwr2_engine`'s TREF/DT0_C/P0 also consume (kills the
  duplicated 304.5/31.1/15.41 literals). Measured: hot-full-power flow 1714.2 → 1646.2 kg/s
  (101.0 %), pressure 2233 psia unchanged, loop split 56.5 → 58.9 °F. One deliberate fixture
  refit in `run_pwr2_sources` (declared in the check's own comment, HR10).

The rest of #509 (the kernel scram mirror, the seal-in refusals, the feed steam element, the
AFW block valve, the SG/tee/hover art, the disabled statics) is engineering, not decisions —
§79 carries it. `run_pwr2_board` 13 → 24 checks / 5 mutations.

## 2026-08-21-develop-b — #501: the chart pre-seed and every flat seed REMOVED — charts start empty and fill live

*(OWNER RULING, 2026-08-21: selected "All flat seeds everywhere" [be removed] from options I
wrote — a selection, not verbatim words. This REVERSES three standing rulings: #237 "presets
start with 30 minutes of history", the 2026-08-01 "run them for 30 minutes to fill up the
graph with real data" real-trace pre-seed — the 2026-08-01c entry below records that build —
and the 2026-07-28 vital-tile "flat preload, not a random walk".)*

**Why now:** the pre-seed's hidden 10× background SimulationService froze the PWR2 card for
~1–2 minutes per plant select (#501 — its 40-tick slice was calibrated to the old engine's
~1 ms tick; a PWR2 tick at 10× costs ~50×). Measured headless before/after: **0.9 fps with
continuous 1.9 s long tasks → 56.7 fps, zero long tasks.** The freeze is also what made the
in-sim bug-report form untypeable, so it suppressed the owner's own defect reports.

**What went:** `ensurePreseed`/`applyPreseed`/`preseedKey` and the flat 360-row chart seed
(ui/app.js), the gauge-sparkline 60 s flat seed, and the vital-tile window preload
(comp_indicator_panel.js — its `seeded` latch survives with its one other job, dropping
build()'s untimed placeholder). `drawChart`'s <2-row "waiting" lane render is the deliberate
opening state; the T+0 run-start line stays and now marks where the record begins.
`testTrendPreseed` deleted (it gated the removed behaviour). Two checks were entangled with
the seeds and re-adjudicated, not widened: board_check's unit-neutral readout now compares
the value with trend glyphs stripped (the arrow honestly resets when a unit flip clears the
trace), and `testDiagBundle` presses play only if the plant is paused (stale since the
2026-08-11 auto-start ruling — it had been passing on fine rows captured in the ~100 ms of
600× between its own two clicks).

*(OWNER RULING, 2026-08-12: "A'" — selecting the refusal over gating `Q_rhr` or a documentation-only
close, from three options I costed. The recommendation was A'.)*

### The decision

`set_rhr {active:true}` is refused while safety injection is running. A control-layer interlock row
reading the `hpi_active` **status instrument** (HR1), `blocks_when {active: true}` so **ISOLATE is
never refused** — the same asymmetry the engine's block-open permissive already has. The engine's
two real interlocks (2.76 MPa block-open, 4.14 MPa autoclose) are untouched.

### Why a refusal and not a heat gate

Option A was one `&&` on `Q_rhr` — the WTSM "uncooled heat exchangers" fact stated directly — and it
was **measured to move zero gates**. It was rejected anyway: it leaves a control that engages, lights
`eccs_mode: RHR`, and removes no heat. That is the Q4 orphan-control case, and #453 had *just*
removed an orphan control from this same system (the RHR AUTO button). The refusal states the same
fact where the player can act on it.

### This is NOT a plant interlock, and that constraint shaped the build

`find_source.js` across 34 documents in 3 lanes finds **the pressure permissive and the autoclosure
for 8701/8702 and nothing else**. There is no safety-injection inhibit on those valves in the corpus.
Writing one would be **#453's exact error** — reading a lineup/procedural fact as an automatic
function — repeated by the session that wrote up #453's lesson. So:

- the message says **lineup**, never *interlock*: *"RHR ALIGN BLOCKED: RHR pumps in ECCS injection
  lineup (SI actuated)."*
- `Manuals/12` **§12.20** is a new declared departure that says what it is *and what it costs*.
- `Manuals/03` §11.2's new row calls it "a third refusal, and it is **not** one of the two interlocks
  above".

What it *is*: this trainer has **one `rhr_active` flag for two mutually exclusive alignments of one
set of pumps**, and **no refueling-water-tank inventory node** (declared, `pwr_config.js:2145`), so it
can never reach the real exit — the sump swap-over, where a crew opens component cooling water to the
RHR heat exchangers (WTSM 5.2 §5.2.4.5). Within every state this sim can represent, "injection is
running" and "the heat exchangers are uncooled" are the same fact.

### Q0 — the measurement

Full stack, `hot_full_power` + `large_loca`; heat currency: rated core = 19.45 units = 300 MWt.

| | align legal at | peak `Q_rhr` | ÷ decay heat | void at align+300 s |
|---|---|---|---|---|
| sev 0.05 | t+553 s | 4.28 (~66 MWt) | **8.8×** | — |
| sev 1.0 | **t+20 s** | 2.38 (~37 MWt) | **4.2×** | **0.788** |

A single-stage vertical centrifugal pump on 79 % steam, feeding heat exchangers with no cooling water.

### The reachability finding, which is the part that made this urgent

`rhr_not_aligned` (PWR-A33) annunciates at **t+191 s** of the sev-1.0 run and stands. That is
deliberate and correct — the row's comment says it reads *"you are on injection, not on shutdown
cooling"*. But `Manuals/06`'s **Immediate operator actions** for that tile said *"Re-align RHR from
the ECCS side of the board"* with no accident carve-out. **A correct alarm and an incorrect response
procedure compose into a board that recommends the defect**, and nothing links the two files.

### The blast-radius warning, measured rather than inherited

The issue warned that `pwr_thermal.js` is the heat balance every LOCA probe's bands were measured
against. Instrumented the thermal step for the first `rhr_active && hpi_active` co-occurrence per
process and ran the full 48-runner gate: **one hit**, in `run_m4`'s own #453 leg. Since #453 nothing
auto-aligns RHR, and PWR-N15 takes HPI/LPI to OFF **two steps before** it opens the suction valve —
so no LOCA probe's heat balance ever contained `Q_rhr`.

### The kernel defect found on the way, and why its comment had to be rewritten

`_evalInterlocks` clears through a hysteresis band (`v < clears_below` / `v > clears_above`); a
boolean has none. `crossed()` gained `is_true`/`is_false` at #314; the clear path did not, and it was
latent because **no interlock had ever been keyed on a status instrument**. The obvious reading is
"it latches for ever" — that is what I wrote in the comment first. **Injection disproved it**: a
boolean row carries `setpoint: null`, so the clear arm asks `true > null` → `1 > 0` → **true**, and
the interlock releases on the next pass with its own signal still standing, blocking **nothing**.
Fixed generically (`!crossed(...)` for boolean directions); reverting reddens exactly 5 checks across
two suites and nothing else in 46.

### Gates

`run_all` **48 runners at baseline**. `run_m4` 45/45 300 → **46/46 311**: the new `#458` suite
(10 checks, including two negative controls on a cold plant) plus one added to `#453`, whose
*"the OPERATOR can still align it"* leg was **re-authored** — it commanded the align with the break
open and SI running, i.e. it was pinning this defect as the feature.

## 2026-08-12-backshop-a — #477: the Indications tick becomes a monitor list, and one surface owns the chart

*(OWNER, 2026-08-12: "the check boxes select what you see in the [strip chart] which is
redundant because now the strip chart has its own menu… they are going to be used for
indications that I want to monitor… they place a duplicate at the top of the indications panel
above all the other indications… it should give both the plant indication and physics
indication.")*

### The decision

**`ui.series` has ONE writer now: the chart-settings window.** The Indications tick was the
older of the two and, since #454 gave the chart a searchable window with a per-side selector,
strictly the weaker — same state, fewer questions, no filter. What the row tick had that the
window does not is *being on the row you are already reading*, so it keeps that and points at
a list the reader curates. The row keeps a **passive dot** for "trending", because dropping it
would have made "what is on the chart?" unanswerable from the list, which the tick used to
answer for free.

Three sub-decisions, all mine, none owner-ruled:

- **Profile order, not tick order.** Matches the spine the panel is already in, and avoids
  `pinOrder()`'s documented trap where a selection's order rides on object key insertion order
  and a re-tick silently restores an old slot.
- **A monitored row is exempt from the row-type chips.** The chips narrow a list you are
  reading; the block is a list already narrowed by hand. A chip that emptied it would hide a
  channel the operator explicitly asked to watch.
- **Persisted, per plant** (`rd_monitor`) — unlike `ui.series`/`ui.seriesSide`, which are
  deliberately not, and correctly so: those are a view setting on a chart rebuilt from the
  plant's defaults every load. This is hand-curated, and ids are filtered against the live
  profile on the way in so a renamed channel drops out instead of becoming a permanent "—".

### What it cost to verify

The assertion carrying the change is *"a tick does not touch the chart"* — nothing in the list
can show a leftover plot write. Written on `tavg` it was **vacuous**: `tavg` is in
`defaultSeries`, so it was already plotted and the trace count could not move. The old handler
re-injected verbatim passed it. On `thot` the same injection reads **3 → 4 traces**. The check
now measures its own precondition and asserts two independent facts (trace count *and* the
row's swatch). Full account, plus the `.ind-grp` shared-class selector widening that made the
first run red against correct CSS: `Diagnostic/TUNING_LOG.md` 2026-08-12-backshop-a.

---

## 2026-08-11-backshop-c — #460: the rods ship in MANUAL, and the AUTO channel was absorbing the lesson

*(OWNER DIRECTIVE, 2026-08-11: "lets start with rods in manual.")* — reversing the 2026-08-01
ruling behind #289, whose premise had expired.

### The decision

`rods_tavg` loses `defaultOn`. Free play comes up with rod control in **MANUAL**; the channel,
its board control (**ROD AUTO**), its manual sections and its reachability are untouched. Only
the preset moved. Instructed content (`noDefaults`) never read `defaultOn`.

**Removing the channel was considered and rejected** — it fails Q1 (real units run rod control
in automatic at power) and destroys the compare-to-auto exercise, which is worth more than
either mode alone.

### Q0 — the measurement that reframed the question

The owner's argument was interactivity. The measurement found two stronger reasons.
`measure_stack`, full stack, `hot_full_power`, 100 → 80 MWe:

| | rods AUTO | rods MANUAL, hands off |
|---|---|---|
| power | 100 → 62.1 → 87.6 → 77.3 → 81.4 % | 100 → **81.8 %**, monotone |
| Tavg | 580.2 → 586.8 → 567.2 → 573.1 °F | 580.2 → **590.4 °F**, parks |
| settled | ~10 min, ±1.5 pts | **3 min 30 s** |

1. **The plant load-follows without the rods** (moderator feedback carried 18 points), and
   **AUTO is the worse ride on this step.** What manual does *not* do is return Tavg to
   program — it parks 17.3 °F (9.6 °C) high, and that trim is the operator's job.
2. **Inserting 60 fine steps moved Tavg −6.2 °F and generator load 0.8 points.** Rods set
   temperature; the turbine sets power. In AUTO the channel performs that Tier A coupling on
   the player's behalf and the demonstration never happens.

Manual authority is linear and forgiving — −20 steps → −1.8 °F, −60 → −6.2 °F, ~0.1 °F/step,
no overshoot at either size.

### Q4 — the veto argued FOR it

The cue exists already: the board draws the sliding Tref band (`pwr_board_wiring.js:1599`), so
an off-program park reads outside normal with no new indication, and HI TAVG sits 3.6 °F above
where it settles. The prior arrangement had the channel doing invisible work that the player's
own rod buttons cancelled through `manual_overrides`, unexplained.

### Relationship to #331

#331 ("remove or reduce the automatic systems") was ruled **"Leave automatic systems in
place."** (2026-08-05). Built to the narrow reading and **flagged to the owner rather than
assumed**: no automatic system was removed, only a preset changed.

### The gate work, and the symmetry in it

`run_all` drifted two runners. `run_behavior` 71 → 66: the five failures were TR-1g, TR-1h,
TR-1i, TR-1k and TR-18 — every probe whose *subject* is the rod controller. None was testing
the preset; all five were reading it. A `rodsAuto()` helper (the mirror of the `rodsManual()`
helper #289 was forced to write in the other direction) makes the precondition explicit with
every assertion byte-identical. Back to **71 pass / 1 xfail** — baseline, so `BASELINES` does
not move. `verify_board_check` 0 → 3: the default check inverts and the two directions swap.

**#289 added `rodsManual()` because probes about the rod-less plant were inheriting AUTO. This
change added `rodsAuto()` because probes about the rod controller were inheriting the preset.
Both directions of one defect, ten days apart, and the first did not prompt anyone to check the
other side.** A probe that inherits a lineup rather than stating one changes subject silently
when the lineup moves, and reddens later, when the cause is furthest away.

**`board_check` cost one line per check because #289 had already been burned there** and split
a toggle pair into three — the default itself, then both directions from it. The reversal
therefore reddened a check whose *name* said what moved. Copy the pattern: **give a default its
own named check** instead of leaving it the implicit precondition of its neighbours.

### Side effect

**#400**'s measured all-auto oscillation (12.93–13.65 points p2p at the 50 % plateau, never
settling) leaves the shipped free-play plant. **#400 is not fixed** — the channel still rings
when engaged.

---

## 2026-08-11-backshop-a — #447: safety injection sheds the pressurizer heaters, and the LOOP decision was a misread of its own source

**The change.** A rising edge of safety injection (`hpi_active`) or a loss of offsite power
latches `_heater_shed`, which zeroes DELIVERED heater power (`heater_power_frac`,
`_heater_dp_frac`) and is cleared only by an operator `set_heater`. Derived in
`pwr_engine.step` as step 0b, consumed in `pwr_pressurizer.autoControl` beside the existing
AC guard and 17 % cutoff. New `true_state`/instrument field `pzr_heaters_shed`, a
`PZR HTRS SHED` status row, and a new engine state `_offsite_power` — offsite power had only
ever been a one-shot coastdown effect, which is why nothing could ask whether it was there.

**Why the shed and not a gain change.** `K_heater` 0.55 MPa/s is a ruled departure
(2026-08-04, `Manuals/12` §12.15) and stays. The defect was that the term had no gate for a
regime with nothing physical behind it — its own sibling `P_restore_rate_gain` has carried
one since #408. Sourced: NUREG-0737 II.E.3.1 Clarification (7) requires the automatic shed on
an SI signal; (5)(b) and (4) make the restore an SI reset plus a manual control-room
changeover. This plant collapses those to one `set_heater`, the same collapse `pwr_control.js`
already declares for SI reset because there is no SI-reset control on the board.

**Decisions, with what would change them.**
- **Edge-triggered, not level.** A level trigger cannot be cleared while the accident lasts,
  which contradicts "can be manually loaded … if required" and makes CA-10 leg D unrepairable.
  One LOCA is one shed; securing and re-initiating SI is a second edge and a second shed.
- **Keyed on `hpi_active`, the handswitch** — no latched SI-actuation state exists here, and
  `set_hpi` is both the three ESFAS rows and a manual SI. Defensible (a real manual SI sheds
  too) but it means starting HPI by hand at power also sheds. Stated, not inherited.
- **LOOP folded in.** `pwr_pressurizer.js:79-84` argued heaters survive a LOOP *because* of
  NUREG-0578/0737. They require manual connectability, not ride-through; Ginna TS Bases B 3.4.9
  sheds on LOOP with reload "within one hour". CA-7 leg C pinned the wrong reading and now
  pins the right one — the reload is what proves the bus, which a blackout cannot do.
- **`P_restore_rate_gain` at `:511` deliberately NOT gated.** Already dead on every LOCA path
  (`loopBreak` true), so it cannot affect the oscillation, while it is the sole route to the
  SGTR/cooldown/stuck-PORV blast radius. Landed without it: `run_ops` moved zero. Deferred
  with the numbers, the `Manuals/12` §12.4c idiom.
- **Accepted wart:** the `pzr_pressure` channel's bumpless disengage sends the DELIVERED
  value, which while shed is 0 — so taking that channel to MANUAL clears the shed with nothing
  changing physically. The alternatives break bumpless transfer or the reload path.

**Gate movement** (all reconciled by hand): `run_pwr` 257→260 (migration pins, including a
guard that a mid-SI save fires no phantom shed on load), `run_contract` 175→177,
`run_behavior` 70pass/0xfail→71pass/1xfail (+CA-25, CA-20b split out as a strict xfail),
`run_campaign` 3039→3049 (the re-keyed `pwr_qualify` cue reaches `challenge` earlier).
`run_ops`, `run_meltdown_stack`, `run_procedures*`, `run_scenarios`, `run_checklist`, `run_m4`,
`run_autoctl`, `run_e2e_controls`, `run_hardrules` all unmoved. **45/45 at baseline.**

**Filed, not absorbed: #451.** The small-break pressure plateau was heater-held — recorded in
`pwr_config.js`'s own #363 note — and the state it propped was #334's deadheaded-ECCS
pathology (900 psia, inventory pinned at 59 %). With the prop gone nothing holds it and every
severity collapses to the same cold solid state. CA-20 leg B split to CA-20b, strict xfail,
band untouched.

## 2026-08-10-develop-a — #433: the MSLI fires again, on the channel's own sourced rate sensitivity

**Decision — the low-steam-pressure leg is rate-compensated (`lead_lag`), not re-windowed**
*(OWNER RULING, 2026-08-10, choosing between "Rate-compensated leg (Recommended)", "Widen the
60 s window" and "Re-measure, then I rule": "Rate-compensated leg")*. WTSM Table 12.3-1
writes the MSLI's 600 psig setpoint as **"(Rate sensitive)"** (ML11223A310:647), and the
anchor plant's own SLB analysis models its low-steam-pressure channel with
**"lead/lag=12/2"** (Ginna UFSAR ch15, ML20339A101, Table 15.0-6, event 15.1.5). Our #408
adoption took the number and dropped the rate sensitivity — and the timing miss that
produced is exactly the #433 defect.

**The filed root cause was wrong, and Phase 0 re-measured it before any code moved.** The
issue said the flow leg cannot latch because `sg_steam_flow` "reads 0 on the break." It
reads `steam_out_total`, which contains the break term: measured full-stack, it jumps
1.00 → **1.58** two samples after a sev-1.0 downstream break and holds above the 1.25
setpoint until the turbine trip (~+17 s). The 2026-08-09 measurement had watched
`steam_flow_normalized` (turbine-only). The real mechanism: the raw 600 psig crossing
arrives ~**+103 s** (the SG re-pressurizes briefly after the trip, then resumes falling),
~43 s after the 60 s flow latch expired. At the pre-#408 5.20 MPa setpoint the same design
isolated at 31.2 s — #408 moved the setpoint onto the sourced number without the sourced
channel dynamics, and its own `held_within_s` validation ran in a harness where the window
could not expire (#403), so nothing caught it.

**Build.** Kernel: actuation rows accept `lead_lag: { lead_s, lag_s }` — a discrete
backward-Euler lead/lag with unity DC gain, advanced on the `_simT` clock; the row FIRES on
the compensated signal, `reset_below` and the seal-in release stay on the RAW value (a
rate-compensated "has it recovered" overshoots). A clockless caller reads raw.
`held_within_s` gained the same degradation floor (`_dtSeen`): a caller that never supplies
`dt` now gets strict same-sample coincidence — the un-guarded degradation was a PERMANENT
latch, the opposite of what the kernel comment claimed. Both latch stamps and filter states
are serialized (`protectionTiming` in saveState) — they were retentive protection state that
did not survive a restore, the #151 rewind class.

**Constants: sourced SHAPE, fitted SCALE — the natural-circulation idiom.** Ginna's 12/2
misses on this plant: the compensated dip bottoms at **4.207 MPa**, 0.067 MPa (~10 psi)
short of the 4.14 setpoint, because our lumped SG decelerates its blowdown far faster than
a real multi-SG plant (break flow ∝ P with a single small inventory). Swept lead 12/14/16/
20/25/30/40 at lag 2: 14 catches sev-1.0 (+3 s) but not sev-0.8; **20/2 ships** — sev-1.0
isolates **+2 s**, sev-0.8 **+3 s**. Do not quote 20/2 as a real-plant figure.

**Discriminators, each measured.** TR-12c leg B (staircase cooldown to 1.34 MPa): no
isolation — the flow term keeps it out and slow steps gain almost no advance. Leg C
(bottle 600 s with safeties pegging the flow transmitter, reopen): no re-isolation. Leg D:
seal-in refuses reopen. Dump-step probe (turbine trip + SP 4.0): compensated bottoms
~5.6 MPa, 1.5 MPa clear. `run_behavior` 67pass/3xfail → **70pass** with TR-12b/TR-12c/PI-9
passing as written (the XFAIL entries deleted per their own instruction); `run_m4` 43/43 →
**44/44** (the rate-compensation suite, injection-verified: the ramp check fails with the
compensation removed). Manuals: `12` §8.5 (seconds, not "two minutes in"), `09` §3.0,
`03` §16.0 span corrections — pending Rev 15 row item (c).

---

## 2026-08-09-develop-c — the #344 gate-integrity batch, and the safety function a missing argument was hiding

**Decision 1 — `ops_harness.js` passes `evaluate()`'s `dt` (#403), and the three probes it
reddens ship as XFAIL rather than being weakened (#433).** The argument is optional in the
kernel and feeds two things: the alarm dropout hold and `held_within_s` condition latches.
The harness omitted it at both stepping call sites from the day it was written.

The alarm half was the filed defect and behaved as filed — an alarm whose condition clears
cleared at **0.1 s** without the `dt` and **2.0 s** with it, exactly `alarm_min_on_s` — and
moved no run_ops verdict, because nothing asserted a clear time. **The latch half is the
real finding.** `_condHeld[key]` is stamped with `_simT`, and with `dt` absent both are
permanently `0`, so the age is `0 - 0 = 0 <= 60` **for ever**: the latch is *permanent*, not
instantaneous. The kernel comment saying its absence *"degrades to instantaneous
coincidence"* has the sign backwards, and that sentence is why the omission looked safe.

Consequence: the MSLI's flow leg (`sg_steam_flow high 1.25 held_within_s 60`) latched the
first time flow crossed 1.25 — at `hot_full_power`, **t=0** — so the coincidence was
satisfied before any break was injected. Measured in production, full stack, full-area
downstream break: **the MSIV stays open from 825 psi (5.69 MPa) to 212 psi (1.46 MPa) over
six minutes** while Tavg falls 580 → 417 °F. The automatic isolation has never worked for a
player. Filed **#433**; TR-12b, TR-12c and PI-9 become strict XFAILs pinned to it, because
they assert the right behaviour and the plant is what is wrong (HR10, textbook).

Also noted for whoever fixes #433: the flow leg watches an instrument that reads **0** after
this break — it is flow to a turbine that has just tripped, and the break discharge does not
pass through it. Which instrument *should* carry the leg is a design question with a sourced
answer (WTSM 12.3), and it was deliberately not guessed here.

**CORRECTION (2026-08-10-develop-a): the paragraph above is wrong, and the fix measured it.**
`sg_steam_flow` is not `steam_flow` — it reads `steam_out_total`
(`pwr_instruments.js:66`), which **contains the break term**
(`pwr_steam_generator.js:361`), and on a full-area break it peaks **1.58** and holds
above the 1.25 setpoint until the turbine trip (~+17 s). The 2026-08-09 measurement
watched `steam_flow_normalized` — the turbine-only variable — and inferred the
instrument from it. The actual defect was a **timing miss**: #408's sourced-deep
600 psig setpoint put the raw crossing at ~+103 s, ~43 s after the 60 s flow latch
expired. See the 2026-08-10-develop-a entry for the fix.

**Decision 2 — EV-1's rate limit is the sourced TS number, read as a rolling hour (#398).**
*(OWNER RULING, 2026-08-09, choosing "100 F/hr TS + 50 admin": "Adopt the sourced Tech Spec
limit as the hard number … Keep ~50 F/hr as a separate soft administrative target, which is
normal practice under a 100 F/hr TS".)* The catalog's `≤ 28 °C/hr` appeared once in the whole
repo, in its own row, unsourced — advisory under HR11 and contradicted by ML11223A342:648,
ML11223A213:1801 and the shipped board's own ±55.6 °C/hr annunciation.

Three things had to be got right in order, and the first two were wrong first:
1. The §14 round-trip driver asserts **no rate at all** (12 checks, none of them one), and
   when instrumented runs the evolution at **435.8 °C/hr up / −604.2 °C/hr down** — 8–11×
   the limit. It is a fixture that proves *achievability*, and was never written to pace.
2. **A settling window does not rescue it.** The peak is at 975 s, after any plausible
   settle point: it is the 10–12 % power target driving a bottled SG, and 10 % of core
   thermal into this plant's RCS mass genuinely is ~500 °C/hr. Physics right, fixture wrong.
3. **The instantaneous derivative is the wrong yardstick.** A TS heatup limit is a rate over
   a period; asserting the peak sample asserts the *damping* of `tavg_rate_c_per_hr`.

New `mode5_heatup_paced` drives a paced heatup and asserts the worst **rolling hour** of the
nuclear heatup: **49.8 °C/hr (90 °F/hr)**. The pace target is *integrated* — a proportional
trim off the unpaced target overshot to 80.8 against a 50 target, because a lagged derivative
responds to the target's history, not its current value. Injection-verified: pace 90 measures
88.0 and reddens.

**Left open, deliberately:** the rolling window opens at criticality, because pump heat is
not pace-able by rod control and starting the RCP into a cold RCS carries Tavg **50 → ~78 °C
in ~20 min** — about **28 °C of a 55.6 °C hourly budget before a rod moves**. That is a
question about this plant's heat-to-mass ratio, not a windowing preference, and it is stated
rather than tuned away.

**Decision 3 — the catalog tier means what the PROBE ASSERTS (#399).** `[I]` was the only
provenance mechanism and #344 F6 measured zero of seven rows meeting its definition. The rule
now follows the assertion, not the sentence; SS-2/SS-3/SS-5/SS-6/SS-11 re-tier `[C]`, and
EV-5/EV-8 get a third state, **NOT ASSERTED**, because their probes check instructor cards
and an `info` line. SS-11 was re-tiered despite calling itself an invariant in its own text —
exempting it would have made the rule decorative on the day it was written. The FG-1 table
had **no Tier column at all**, which is how EV-1's rate half held `PASS` for months.

**Decision 4 — SS-8 gets an energy term, and the band stays where the row put it (#397).**
Core thermal against secondary removal at three ICs: residual **0.04 / 0.63 / 0.29 pp**,
worst single sample 0.69. This answers the question #397 explicitly left open — its 6.44 pp
at 50 % **was** the #394 limit cycle's stored-energy term, not an energy-conservation
violation, and #394 has since been fixed. The band is the row's original ±2 %, not the
measurement: 3× margin is the right slack, and pinning ±0.7 would redden on any legitimate
secondary retune.

**Decision 5 — a zero-step rod nudge is a no-op in the ENGINE (#429).** The guard goes where
the defect is, not where the one production caller happens to sit. Injection corrected my own
assumption: the rail-clip form was **never** broken (its first increment clips back onto the
target and the loop exits), so the two new checks fail against different regressions and the
second one guards a *future* edit that drops the guard trusting the strict sign.
## 2026-08-09-backshop-c — #432/#431: the bug report's recording rides the fine seam, and the schema stops asserting a rate it cannot know

**Decision.** The session recorder moves out of `ui/app.js` into **`ui/diag_recorder.js`**
(`RD.DiagRecorder`, a plain global script), samples on the service's fine sampler with MIN/MAX
extremes per bucket, and the bundle goes to **schema 1.1** with a columnar `timeseries`.
`manifest.sample_hz` is **deleted and not replaced by a scalar** — `sampling` declares the floor
and the source, and the row timestamps carry the actual rate. Scope and the extraction were both
the owner's *(OWNER RULING, 2026-08-09: selected "#432 + #431 + tool + gate" and "Extract
ui/diag_recorder.js" from options I wrote — a selection, not verbatim words)*.

**Why the extraction is the load-bearing part.** Nothing in `test/` had ever touched the
recorder, and that is not a coverage observation — it is the cause. The code was inside
`ui/app.js`, which no Node runner can reach, so it shipped sampling once per broadcast (one row
per 180 s at 3600×) under a manifest hardcoded to 1 Hz, and the first person to find out was the
owner. `run_diag_bundle.js` now drives the recorder full-stack; the `ui/manual_procedures.js`
pattern, which seven runners already use.

**Three decisions inside it worth not re-litigating.**

1. **A third side-dict (`dv`) on the fine sampler, not the chart's `tv`.** `steam_flow` and
   `fw_flow` are `tru: t.<field> * 100` for display. Reading those columns would have silently
   changed the bundle's units, so a tool comparing an old report with a new one would compare
   0.069 against 6.9. `foldExtremes` iterates a `SIDES` table now — its comment already claimed
   genericity the body did not have.
2. **The grid is an emit rule, not a constant.** Emit when 1 s of sim has passed, folding
   everything between. Spacing falls out as `max(1 s, the service's fine grid)` with the
   recorder knowing neither `CHART_FINE_MAX` nor the acceleration. **1× is unchanged.**
3. **Columnar, measured not assumed.** At the 14,400-row ring: 720 KB gzipped columnar against
   1218 KB as row objects, on a 2 MB Worker cap that also has to carry `events` and
   `snapshot_end`.

**The trap this session is worth remembering for.** The first working version passed all 31 of
its own checks and recorded **35 rows out of 1475 handed to it** in a real browser, because the
fine drain sat inside the rAF paint — one frame after the broadcast — and the recorder, a
separate synchronous subscriber, saw every row *after* it had already recorded a later
timestamp. A source scan cannot see that (every call site is present and correct) and a Node
gate cannot see it (it hands the recorder its rows itself). `verify_e2e_ui` now presses the
app's own download button and asserts the SPACING — not the `source` field, which read `mixed`
on the broken page.

---

## 2026-08-09-develop-b — #394/#378/#420: the rod limit cycle is LOOP GAIN, and the mechanism of record was wrong

**Decision.** The part-power limit cycle is fixed by **scheduling the rod-control gain on
differential rod worth** (`gainScale` on the `rods_tavg` def, `RD.pwrScruveSlope` exported from
`pwr_engine.js`), **gated on the load program being parked** so a sliding program keeps the shipped
gain. Both strict xfails retire in the same change: `run_behavior` 67pass/2xfail → **69pass/0xfail**,
`run_all` 44 runners at baseline.

**What this supersedes, and why it matters more than the fix.** `BUILD_DECISIONS.md:1160`
(2026-08-06-workbench-a) records a fix that "measures perfectly and is rejected anyway" — the
stop-exit travel cancel, rejected for costing TR-1i's sourced duty 4.34 → 5.26 °F. That entry, the
channel def, the TR-18 probe comment and both issues all name **stop-exit travel** as the
mechanism. Measured this session: the abandoned travel is real and large (571 events in 2 h, mean
1.59 steps, **75.4 pcm per half-cycle**) but it is the amplitude-setting nonlinearity, not the
cause. The cause is that this plant lumps all 4068 pcm into ONE control bank on the S-curve, so a
fine step is worth **4.657 pcm at 74.8 % withdrawn against 0.892 near the stops — 5.2×** — while
the controller's `gain` is a constant. The incidence curve is **monotone in bank position over six
points** (15.05 / 10.97 / 5.91 / 2.35 / 1.31 / 0.78 pts p2p), every authored IC starts exactly on
program, and the cycle grows out of instrument noise. Scaling `gain` by that ratio kills it.

**The gate is the whole trick, and it was forced by measurement.** Ungated, the schedule collided
with TR-1i exactly as the cancel had (5.28 → 6.52 °F), and a floor sweep proved no constant does
both: the duty cost comes from having *any* schedule (5.97 even at floor 0.75) while TR-18 needs
floor ≤ 0.60 to settle. The two are separable in **time**, not magnitude — instability is a
steady-state property, the duty is a transient one — and the separator is measured: `d(spEff)/dt` is
1.54e-2 °C/s through the ramp and 1.07e-4 through the cycle, **144×**. `progStill { rate: 0.002,
tau: 20 }` sits near the geometric mean. Gated, TR-1i reads **5.28 to the digit**, the pre-#394
value, and TR-18 settles at 15.8 min / 1.76 pts.

**#420 is resolved by ruling because the controller could never have reached it.** `maxStep`
8/16/32 → duty 5.28/5.28/5.28, unchanged to the digit — #306's finding reproduces on today's plant.
The band is now the sourced ±5 °F **scaled by this plant's declared program-span departure**,
5.00 × (33.295/29) = **5.74 °F** *(OWNER RULING, 2026-08-09: selected "Scale on the departure" from
four options)*. The #311 precedent as written: scale a closed-form limit line by a declared
geometric departure, never re-anchor it onto a fitted intercept. 8.0 % headroom.

**Also landed**: **SS-11**, the probe FG-2's headline invariant never had (SS-3 was carried by a
single instant at t = 600 s and was green through the whole life of the defect); the retired
297 °C / 8.23 MPa / 2.5 %/°C anchors struck from three catalog rows; and `Manuals/03` §14.3 +
`pwr_rod_auto`'s narration corrected — both claimed the channel *captures T-ref from indicated Tavg
at engage*, which has never been true of this build (`program: trefFromLoad`), and the mission
taught the false version as its lesson. Manual Rev 15 item (b). Full measurement record:
`Diagnostic/TUNING_LOG.md` 2026-08-09-develop-b.
## 2026-08-09-backshop-a — #414: the download is named for the build, and named ONCE

**Decision.** Off the released channel the offline download's filename carries the commit:
`Reactor_Dynamics_Alpha_1.5.1_9f8e7d6.zip`, containing a `.html` entry of the same stem. A
production deploy is unchanged (`…_Alpha_1.5.1.zip`); a local build is `…_dev`. Two owner
rulings, both taken at plan time (2026-08-09) as selections from options I put to the owner —
so the phrasing below is mine and only the choice is theirs, which is the distinction
`agent-authored-rulings` exists to keep visible. **"Transport it"**: `site/nav.js` takes the
name out of `download/manifest.js` rather than re-deriving it. **"Suffix both"**: the archive
entry follows the same rule as the zip.

**Why the structural half matters more than the suffix.** The filename had two spellings
(`site/make_download.js`, `site/nav.js`) and `test/run_portable.js` guarded them by comparing
three static literals pulled from each: the prefix, the sanitising regex, `'.zip'`. Adding a
suffix to one side leaves all three identical in both files — the gate stays green while the
offered name is no longer the built name. So the guard could not have caught the very defect
it was written for, and #414 was filed as a three-file change for that reason. The fix removes
a side instead of hardening the comparison: `downloadName(release, channel, sha, ext)` is the
single derivation, exported from `make_download.js` behind the `require.main === module` guard
that `stamp_version.js` established, and the manifest that script already writes beside the zip
transports the result to the browser. Agreement is now structural, not asserted.

**Gate.** `run_portable` **129 → 137**: −1 literal-agreement check, +1 load-order check
(`manifest.js` before `nav.js`), +6 behaviour-matrix rows over `downloadName`, +2 on `nav.js`
(takes the manifest value; contains no `Reactor_Dynamics_` literal). Three injections
confirmed red — inverted channel test (6), a name rebuilt in `nav.js` (1), reordered script
tags (1). Measured in headless Edge from `file://`:
`download="Reactor_Dynamics_Alpha_1.5.1_dev.zip"`.

**Coupling to record**: this depends on `download/manifest.js` being served `no-cache`, which
`2026-08-09-develop-a` had just added to `site/build_site.js`'s `_headers` for the version
stamps. A four-hour-cached manifest would offer the previous deploy's filename for the current
deploy's zip. Noted in `make_download.js` at the manifest write.

---

## 2026-08-08-develop-g — the winter uprate stays MONOTONIC: no LP low-backpressure knee (ruled, declared §8.35)

**Ruling** *(OWNER, 2026-08-08: "is it worth the extra computer when running the sim to do the
knee? probably not worth it i just want to show the relationship between this temperature and
the plant.")* — asked whether a turbine low-backpressure saturation knee was worth the runtime
cost. **It isn't, but the compute premise was wrong and the answer survives it**: the clip is
already evaluated every step (`clip(vacuum_rated − dP, vacuum_lost, vacuum_max_kpa)`), so a knee
is a constant, not new math. It is declined on Q3/Q4 instead — a knee flattens the 35–50 °F half
of the operator's range, so the player moves the knob and MWe stops responding, which reads as a
broken control rather than a turbine limit. Same argument `pwr_config.js` already makes one level
out for not capping the gain at `vacuum_rated`.

**Measured** (full stack, `hot_full_power`, 30 min, reactor 99.94 % throughout — the gain is
secondary-cycle efficiency on unchanged MWt): 85 °F → 2.74 inHgA / 95.4 MWe · 60 °F ref →
1.42 inHgA / 100.0 · 50 °F → 101.1 · **35 °F → 0.76 inHgA / 102.3**. The cold end therefore sits
**deeper than the anchor plant's own condenser design backpressure** (≈1.03 inHgA, derived from
Ginna UFSAR ch 10 §10.4.3's sourced 50 °F CW + 24.5 °F rise plus this model's 5.4 °F TTD) and
still scales linearly. Declared at `DESIGN_COMPANION.md` **§8.35**, which also records the trap
that prompted the question: **102 % MWe is prototypical, 102 % `power_pct` would be a Tech Spec
violation** — 102 % of RTP is the Appendix K calorimetric-uncertainty margin the Chapter 15
analyses are *performed at* (Ginna UFSAR ch 15, ML20339A101), not an operating allowance. The
~1.0–1.5 inHgA knee value and the ~0.1–0.2 %/°F sensitivity band are both **recall, UNVERIFIED**
— nothing in any lane's corpus carries a turbine exhaust-pressure limit. Docs only; no code, no
gate movement.

## 2026-08-08-develop-f — CW inlet 40–100 °F → 35–85 °F on a 60 °F default: ceiling sourced, floor and default ruled

**Rulings** *(OWNER, 2026-08-08, three in sequence)*: the range question ("We should set our
condenser cooling range to this"), the freezing catch ("wouldnt 30F be freezing?"), and the
final numbers ("can we tune this sim to run a default value of 60F? lets make the floor 35F
since its probably warmed some by the time tit gets to the condenser."). Evidence: Ginna TS
Bases B 3.7.8 (ML20339A221 Rev 101, re-fetched — the 2026-08-07 copy was in no lane) requires
the screenhouse bay ≤ 85 °F for SW OPERABILITY; the analyses bound the supply 30–85 °F with
the 30 deliberately sub-freezing; condenser design point 50 °F + 24.5 °F rise (UFSAR ch
10.4.3). The STS [90] °F UHS number is a bracketed template (the #380 lesson) and Ginna's
Bases carry no UHS spec at all. The 35 °F floor's transit warm-up is owner judgment, declared
UNVERIFIED. **The reference moved with the default** (60 °F), which is the decision with
teeth: rated-at-default is preserved bit-identical (100.0 MWe measured), and the box regains
authority — 85 °F now costs 4.6 MWe (was 1.2 from the 80 ref), 35 °F buys +2.3, and the
99.5 kPa vacuum cap no longer binds inside the range. `Manuals/03` §13.1 rewritten (Rev 15
pending, item (a)). Worklog: `Diagnostic/TUNING_LOG.md` 2026-08-08-develop-f.

## 2026-08-08-develop-e — turbine load raises rate-limited at 30 %/min (ruled); decreases stay instant (structural)

**Ruling.** *(OWNER RULING, 2026-08-08: "Do the 30% increase.")* — `turbine.load_rate_pct_per_min`
0 → 30.0, raises only, superseding the 2026-08-03 off-ruling. The measured basis: a 70 → 100 MWe
raise delivers output at +240–260 s at every rate INCLUDING instant (the reactor is the pace),
so the limiter costs no responsiveness; instant's borrowed-SG-steam spike grazed the C-4 runback
(min OPΔT margin 2.71 vs 3.49 at 30 %/min, silent). The owner also asked whether decreases
should take the same limit — recommended NO and the recommendation stood: the rejection
detector's standing gap under a ramp is rate × refTau(60 s) = 30 MWe, under the 40 MWe dump
arm, so a symmetric limit un-arms the FG-4 ride-out for any size cut (arithmetic recorded at
`load_mode.js`). #379 pair re-measured with the limit on: the one-box step charges zero runback
dwell; `persist_s` 8.5 untouched, both pair comments updated. Gate: `run_all` 44 at baseline.
Full worklog: `Diagnostic/TUNING_LOG.md` 2026-08-08-develop-e (includes the CHANGELOG
blockquote-splice repair, its own commit).

## 2026-08-08-develop-d — #425: the containment passive sink learns saturation ΔT, on a lag

**Ruling.** *(OWNER RULING, 2026-08-08: "Do next as recommended.")* — Option B of the #425
options (saturation-ΔT-keyed passive-sink enhancement), SBO boil-off parked **under the
30 psig spray hi-hi**, bundling the #386 burn-pin extension and the #384 declaration
re-measure. The endorsed recommendation is quoted verbatim on #425 (HR11).

**Decisions this entry records:**
- **The enhancement is a LAGGED state, not a static curve** — `_ctmt_sink_enh`, target
  `1 + gain·max(0, T_sat(steam partial) − ambient − knee)` clip [1,25], first-order lag.
  Static was measured infeasible: the SBO must park ≤ ~22 psig (see next bullet) while the
  sev-0.25/0.5 pulse peaks sit ABOVE that park with 1.3/4.6 psi of hi-hi margin — one
  monotone curve eats the pulse grading to brake the park. Pulses dwell 20–40 s above the
  knee; the SBO climb runs ~6.5 min. TIME separates the families; pressure does not.
- **The burn margin, not the spray point, binds the park.** The H₂ burn deposits
  `press_gain·h2_burn_gain·6.8 v/o` = **+32.4 psi** on whatever base it finds, so park +
  32.4 must clear the 60 psig design pressure — park ~22 psig gives the SBO burn ~9 psi of
  margin; the ruled 30 psig cap alone would put it 2.4 psi OVER design. (The plan-review
  analysis had this wrong twice — a +14.1 psi deposit that forgot `press_gain`, and an
  18.3 psig drained-base park that is actually ambient — recorded in TUNING_LOG.)
- **Constants**: knee 55 °C (the stuck-PORV family's ΔT — TMI-class equilibrium moves
  9.4 → 9.3 psig only), gain 0.13 /°C, lag 120 s; `slb_ctmt_gain` 0.0035 → **0.0045** (the
  MSLB is the ONE pulse long enough to charge the lag — it braked 52.0 → 39.0 psig and
  thinned the limiting-case ordering to 2.9 psi; 0.0045 re-solves to 48.2 psig = 80 % of
  design, mid-band both sides, the TR-3 shape). `press_gain` NOT re-solved (perturb: ×1.03
  flips CA-20 — it is knife-edged elsewhere).
- **Grading note, owner-review**: the sev-0.25 peak lands 30.1 psig — 0.12 psi above the
  hi-hi (was 1.3 psi). The boundary's thinness is the plant's; declared at the constants.
- **New pins live in MD-3** (engine-direct is layer-invariant under SBO — `acAvailable` is
  the engine's): boil-off max < hi-hi until the H₂ era (a damage-flag-bounded window
  catches the burn it exists to exclude — the burn fires a hair before 1200 °C), burn peak
  in (hi-hi, design) — **the #386 containment-holds pin is now family-wide** — and the
  boil-off-alone premise. CA-16 leg D integrates the engine's own live sink (`e^(−∫sink·dt)`,
  reads `_ctmt_sink_enh` per sample; gain 0 collapses it to the old 1200/τ_eff exactly).
- **#384 Rev 13(j) residual measured CLOSED before this change** (full break bottoms
  14.8 psi (0.102 MPa) abs vs a 14.7 psi (0.101 MPa) building, before AND after — the
  #385/#408 work closed it in passing); `Manuals/12` §7.2 records the closure.
- One new private state field (`_ctmt_sink_enh`, seed/migrate 1.0, legacy-save probe
  extended, NOT §6.3). Injection lever: `passive_sink_dt_gain: 0` restores the pre-#425
  plant **bitwise** (proven against the BEFORE record; reds both MD-3 pins 0.5556/0.7743).

**Gates**: run_all 44 at baseline (zero baseline moves — run_behavior 67/2xf unmoved on the
retune). Full Q0 before/after: `Diagnostic/TUNING_LOG.md` 2026-08-08-develop-d.

## 2026-08-08-develop-c — #386 stage 3: hydrogen (the ruled burn) + #387 bundled

**Rulings.** The 2026-08-05 burn ruling binds (TMI-2-style one-time deflagration + latch,
containment holds — indication-only and end-state rejected); one new ruling at plan review
*(OWNER RULING, 2026-08-08: selected "Above 30 psig" — burn peak clearly above the spray
hi-hi so the ESF answers it; a selection, not verbatim words)*.

**Decisions this entry records (the why lives with each):**
- **H₂ rate = q_ox, one constant.** d(H₂)/dt is exactly proportional to the oxidation heat
  (same Baker-Just event, 2 mol H₂ + 190 kJ per mol Zr; App. K mandates Baker-Just for
  "hydrogen generation" by name), so the rate law is sourced-by-construction and `h2_gain`
  is the single fitted scale — bracketed by Ginna's 0.30 % CWO (mitigated ≪ 4.1 v/o) and
  TMI-2's 7.9 % (unmitigated ignites). NO second f_unc (the oxide integrator carries it);
  the ledger telescopes to Δw — MD-11 pins the identity exactly.
- **Currency = v/o of Ginna's SOURCED 1.0×10⁶ ft³ free volume** (UFSAR ch15) — no
  separate conc_gain; only the product would be observable.
- **Two-node transport, GEOMETRY-gated** (`_rcs_h2 → _ctmt_h2` while a containment-side
  path *exists*): flow-keying would stall on the burn's own backpressure spike and alias
  the safety duty cycle; one-node either drops mass or stalls it on valve phase (the SBO
  boil-off family decides it). SGTR-flagged leaks hold their H₂ — the CA-16 leg B fence
  extends to hydrogen; a closed block valve holds it (the isolation lesson survives).
- **[8.0]/[85] adopted as TEMPLATE-CORROBORATED** — bracketed NUREG-1431 ice-condenser
  igniter text (the #380 placeholder class, adjudicated in the open) that TMI-2's own
  analysis happens to corroborate (GEND-061 §4.6.3: 7.9 % preburn, 86 % consumed). NOT
  [tune] — moving either re-litigates the ruling. `status-owner-review` on #386.
- **Burn ΔP anchored ADIABATIC**: GEND-061 measured ≈27.5 psi and attributes 5 psi to
  in-burn cooling (fig 4-13); this model deposits instantaneously and lets the sink terms
  cool afterward, so the ~32.5 psi adiabatic form is the correct anchor — and it is what
  puts the drained-base family (32.4 psig) on the ruled side of the 30 psig hi-hi, where
  the measured-peak form landed 27.2 (under). Q0 table in TUNING_LOG.
- **The one-time latch stands in for O₂ depletion** (no O₂ ledger, declared): H₂ may
  re-accumulate past ignition with no second burn — TMI-2 burned once. Post-melt the
  ledger integrates a term already past its validity; the published value clips at 100
  (the #326 declaration class).
- **Recombiners: spray-row clone, auto-only, fitted SLOW** (no capacity in any lane's
  corpus; existence sourced WTSM 5.0 + NUREG-0737 II.E.4.1; auto-start/auto-secure a
  declared inference — real ones are manual). Measured: **no family exists where they
  prevent ignition** (restore-at-0.8-v/o still burns — the excursion outruns restored
  injection above ~1652 °F (900 °C) clad); they win the post-recovery tail at exactly
  their e-fold. That is the prototypical shape and is declared, §12.4e.
- **The containment-holds pin is family-scoped** to LOCA/stuck-PORV: the SBO boil-off
  base passes design pressure on relief steam alone BEFORE any H₂ exists — pre-existing
  stage-2 behavior (ledgers 0.000 through the crossing), filed **#425** with the numbers
  rather than absorbed into this change.
- **#387 sequenced first, own commit** — its freshness gate (`verify_manual_data.js`)
  then enforced the `ctmt_h2` picker entry the moment the instrument landed. The 14
  missing instruments' display entries were authored BEFORE regeneration (I-12's fallback
  prints raw ids); the derived OTΔT/OPΔT channels are deliberately offerable failure
  targets (a computed protection channel failing independently is a real rack's
  summing-amp failure — my call, stated).

**Gates:** run_pwr 246, run_m4 43/43 285, run_contract 175, run_hr3 31, run_reachability
76, run_behavior 67p/2xf (CA-24), run_meltdown 12 (MD-11 +1 leg), verify_manual_data 151,
manuals Rev 14 re-stamped/packed (item n), run_manual_units 528 pairs. Fences unmoved:
run_scenarios 3/3, run_campaign 51/51 3039. Injection verification three ways with
distinct signatures; perturb h2_gain ×1.03 → 10/711 moved, zero flips.

## 2026-08-08-backshop-a — the #221 audit lane moves to a directory of its own (`C:\grok_build\RD_Audit`)

**Claim.** The audit lane is no longer a work lane wearing a settings file. It is
`C:\grok_build\RD_Audit`: the auditor's own `CLAUDE.md`, a `findings/` scratch directory, and a
**detached-HEAD worktree at `tree/`** holding the source under audit. `backshop` is an ordinary lane
again and has its orientation document back.

*(OWNER RULING, 2026-08-08: "It will audit things 'blind' without preconceived notions or the logic
behind the choices", and "Ts wont be a new branch." Asked whether backshop should stop being the
audit lane and get its `CLAUDE.md` back, the owner selected **yes — hand it back**; asked whether
harness mechanics count as "the logic behind the choices", **mechanics yes, judgments no**.)*

**Why.** The 2026-08-06 arrangement armed `backshop` with a gitignored `settings.local.json`, which
bought a no-flag launch at a stated cost: **ordinary non-audit work in backshop also ran without
`CLAUDE.md`** — no lane rules, no merge-conflict list, no gate baselines. A dedicated directory buys
the same no-flag launch and pays nothing, because nothing else happens there.

**What the shape buys, beyond tidiness.**

| | before | now |
|---|---|---|
| RoE 1 "no fixes" | prose in the charter | `deny` on `Edit`/`Write` into `tree/**` and all three work lanes, plus a detached HEAD an edit could not reach a branch through |
| auditor's orientation | `AUDIT_CHARTER.md`, opened by hand after `CLAUDE.md` was excluded | `RD_Audit/CLAUDE.md`, **auto-loaded** — the one channel that cannot be forgotten |
| ordinary work in the lane | ran unprimed | there is no ordinary work in the lane |

**THE TRAP THIS INTRODUCED, and the check that closes it.** The exclude list carried
`**/grok_build/**/CLAUDE.md` as belt-and-braces. That glob **also matches
`RD_Audit/CLAUDE.md`** — the auditor's own orientation, the one file in the lane that must load. An
auditor handed no orientation measures protection engine-direct, sees a plant with no ESF arms at
all, and files false findings; and like every other failure in this programme, the outcome is a
clean-looking audit rather than a red. So: **the list is now fully explicit with no wildcards**
(`audit_preflight.js` check 3b), and check 7 asserts the orientation is deployed, current, and *not*
excluded. Covering a newly-added worktree was always check 3's job, not a glob's.

**Second source of truth, handled rather than accepted.** `RD_Audit/CLAUDE.md` sits outside the
repo, so it cannot be tracked. It is therefore **generated** from `Blueprint/AUDITOR_ORIENTATION.md`
by `tools/audit_deploy.js`, never edited in place, and preflight refuses a slice when the two have
drifted. `.gitignore`'s own note records this repo learning that lesson with `CLAUDE.md` on
2026-07-29; a verified mirror is the answer, a second copy is not.

**`AUDIT_CHARTER.md` §1–10 MOVED to `AUDITOR_ORIENTATION.md` — moved, not copied.** The charter is
now purely the primed session's document (the lane, prep, close-out, history). Two documents both
describing how to audit will disagree eventually, and the loser is the one the auditor is reading.

**Standing trap for whoever prepares the next slice: `tree/` does not follow `develop`.** It is
pinned, and *the tooling the auditor runs comes from that pinned commit* — including
`hook_lane_status.js` and `audit_preflight.js`. Measured while building this: the hook run from the
new lane reported "UNRECOGNISED tree" and omitted the audit row entirely, because `tree/` was still
at develop's tip and had the old three-lane list. Re-point it in prep step 3 (`AUDIT_CHARTER.md`
§2a) or the auditor audits stale code with stale tools.

**Gate.** `run_hardrules` 235 → 237: +1 for `AUDITOR_ORIENTATION.md`'s single ruling citation
(verified by removing the file and re-running: 235), +1 net across the charter rewrite. The
rewrite's first draft put the dates in the **bullet prefix** rather than inside the citation window
and HR11 failed both — the format is `(OWNER RULING, <date>: "<verbatim>")` and nothing else counts.
`run_all --fast` otherwise at baseline.

## 2026-08-08-develop-b — #380 resolved by premise inversion (single-signal AFW), #355 feed program, #358 NO FLOW

**The decision that mattered was reading the brackets.** #380's premise — lo-lo "sourced real
~30–32 % NR" against our 17 — cited NUREG-1431 Tables 3.3.1-1/3.3.2-1, and those tables print
`[30.4]%`/`[32.3]%` **in square brackets: the STS template's plant-specific placeholder**, not a
plant's setting (they are also in Vol 1 ML12100A222; the previously-cited ML12100A228 is the
Bases volume and carries no setpoint numbers). The plant-specific corpus values: **Ginna 17 %
exactly** (UFSAR ch10 ML20339A040:1655), W training plant 11.5 % (ML11223A293:271). Since #419
anchored this plant to Ginna, the shipped 17 was the sourced value — the claim survived #220
claim 6 and the #374 evidence pass because both verdicted the *mechanism* (single signal) and
inherited the *number*. The trip did not move; TR-14 (40.0 s, 25–60 band, 11.0 s window) and
the #135 anchor are untouched.

**What moved is the invented half** *(OWNER RULING, 2026-08-08: selected "Single-signal AFW")*:
the AFW ESF actuation 20.0 → 17.0, same instrument/direction as the trip — the sourced design
(WTSM §5.7 cond. 1; Ginna TS Bases + NUREG-1431 Bases: the trip function *"also performs the
ESFAS function of starting the AFW pumps"*). §8.19 struck in the register. **No 60-s start
delay modeled**: Ginna's Table 15.2-4 AFW-at-115-s is analysis assumption I (licensing
conservatism), not hardware — the pump/delivery lags are the honest model. The teaching window
survives in the real ordering: warning→trip 11.0 s pre-trip, AFW fighting the drain post-trip
— and on a TOTAL feed loss PI-4 (fw_flow < 0.10 above P-9, the real condition-3 analog) has
AFW running at 2.5 s with level still 64.9 %, which the manuals' "AFW at ~37 s" timeline had
silently predated. `afw_start_level` deleted from `pwr_config` (zero readers). CC-3 dip
38.7 % ≥ 8; run_behavior 66/2 xfail at baseline.

**#355** *(OWNER RULING, 2026-08-08: selected "Program to 65 %")*: `feed_sg` gains
`program: 65` + `spSlew: 0.1` — capture still seeds spEff so engage is bumpless, then the
working setpoint slews to the program (the rods_tavg mechanics, `control_kernel._trackChannel`).
Measured: engage at 32.9 % → 65 in ~6 min, crest 68.0, settles 64.5–65.5. The save/load suite's
free-setpoint fixture (`setSp('feed_sg', 70)`) stopped being free state by design; re-pointed —
programmed channel asserts sp RE-DERIVES to 65, operator-sp round-trip moves to `boron_conc`
(720 vs ~705 capture). run_autoctl 30/30.

**#358 option A** *(OWNER RULING, 2026-08-08: selected "Option A")*: `feedNoFlow` = commanded speed > 10 % ∧
`condensate_flow` < 0.02 — **main-feed-only deliberately**; `fw_flow` is main+AFW, so the AFW
start would mask exactly the dead train being reported. Corner word NO FLOW ranked ABOVE SAT HI
(the blackout spends ~10 min engaged-unsaturated while winding 100 → 120 %; SAT HI only arrives
at the rail) and a `numberWarn` hook ambers the gpm demand box in every mode (the LOOP case
freezes 355 gpm mid-range — no rail, corner ISOLATED, and only the number kept lying). Demand
never written (#329). Injection: predicate blanked → both new board_check pins + 3 selfTest
cases red on the old behavior; restored → 222 checks green.

Docs: Rev 14 items (k)/(l)/(m) stamped+packed (run_manual_rev 15/15); `pwr_esf.js` re-measured
wholesale — it still taught a 12 % trip, an 11.03 MPa SI, AFW-at-level-19 and a ~25 % AFW hold,
all four stale before this pass; DESIGN_CRITERIA's §8.19 house-pattern example now carries the
second half of the lesson (a declared departure retires when the evidence improves).

## 2026-08-08-develop-a — #385 pressurizer inventory NODE, stages 0–3 (bundle: #415/#337/#334/#354)

The RULED follow-on executed (staging on #385; plan-review rulings 2026-08-08: hold the
derived +350 net, low-Δp law out of build scope, slider option (a)). Decisions of record —
full narrative in `TUNING_LOG` 2026-08-08-develop-a:

- **The node ships in the credit form, not the flow-ledger-with-flash form the plan drew.**
  `pzr_mass_frac` carries `pzrNodeLevel` = reconstructed base+mass backbone + a flow-accreted
  void CREDIT (admittance split applied per-displacement; unweighted return; floor 0);
  no-leak families are BITWISE the frozen line, pressure bitwise everywhere. **The flash
  outsurge term was measured unnecessary at every board severity and NOT built** — the
  backbone empties the node at loop-demand rate (TRUE-empty 4–212 s, always well before
  uncovery; sev 1.0 ≈ 1.8 s); a flash term would halve the DBA empty-time, change no story,
  and cost 3–4 `[tune]`s plus a heal rule. Deviation from the approved plan's component (c),
  flagged to the owner on #385 with the arithmetic — the plan's sizing target was measured
  on the severity map #408 retired. **RULED (OWNER RULING, 2026-08-08: "Let's not do the
  flash term if you think it won't affect gameplay in a negative way.")** — condition
  affirmed on the measurements; the term stays out, `Manuals/12` §12.5's flash-evaporation
  row already declares the class. The node project is complete at the credit form.
- **No level constant moved** — "touch one, re-solve the set" satisfied trivially; both
  documented deception targets verified on the live law (net +350; 78.33 at void 0.2).
  Mission crest unchanged by construction (free-play 62.2 % measured); **the 2026-08-08
  crest ruling applied**: no free re-key exists, the >65 % state cue stands, the #418/#419
  crest review item closes measured.
- **MD-5 adjudicated (HR10)**: the ATWS+DEG melt endpoint stands at 5285 s — the old
  <4000 s clock was paced by the retired re-lift (lying-high gauge propping the heaters).
  Window 4000 → 6000 (MD-1's precedent), inventory band config-derived; both forms pass on
  the pre-node engine.
- **#415 measured NOT reproducing** post the 2026-08-07 solid gates (arrest at 109.3–109.4 %,
  safeties cycling; the walk-down rides saturation legitimately). **No solid-wins predicate
  shipped** — the CA-19 precedent binds (a predicate change with no reachable state behind
  it is code no A/B can see).
- **#334 item 3 found ALREADY SHIPPED by #408 wave 1** (`Break Size / % of a full pipe
  shear / 0–100 / default 40`, leak_scale 0.04) — the 2026-08-08 option-(a) ruling confirms
  shipped state; the stage-6 memo's premise was one wave stale when the question was put.
  **The low-Δp complaint also resolved by measurement**: natural post-reflood states end at
  15–19 psi ≈ the building (the #384 vent + #408 re-clock moved it); the ~390 psi figure
  belongs to CA-19's forced-solid injection balance, which is the config solve by design.
- Record hygiene: F14/F15 flag rows currency-noted (above); `Manuals/12` §6.3 swept for the
  #408 two-scale retirement, §7.3 rewritten node-form, §12.4c relief line corrected;
  `pwr_config` §12.4c ledger comment and the retired `level_per_mass_surplus` name swept.

## 2026-08-07-develop-g — #419 waves 1–3 BUILT (RECONSTRUCTED — not the authoring session's record)

**RECONSTRUCTED post-hoc from commits + issue comments by a different session** (the
2026-08-07-develop-e session's plan WP2, owner-approved); the authoring session wrote no entry
here or in `TUNING_LOG.md`. Decisions of record, quoted not re-measured — full write-ups on #419:

- **Wave 1 (`1d11252`)**: pace compression retired, real Mode 5↔1 rates (stage-1 D3 ruling).
- **Wave 2 (`8ba4d84`)**: F15 relief K 3144 → **2500** = the physical net under the RULED F14
  heater. K_phys ≈ 304 is right in isolation and unshippable under F14 (the stuck-PORV race
  inverts) — the pair is marked [derived-net, F14-coupled: re-solve together].
- **Wave 3 (`413ae06`)**: the Ginna re-anchor — ladder 7.03/7.31/7.58/7.33 MPa (§8.34 retired),
  program 286.0 → 304.5 °C, dump 28 % (D1, ride-out measured surviving), reference boron 683 →
  705 (`rho_excess` re-solved at the WBN quote temperature — the old solve conflated
  measurement and anchor temperatures).
- Open on the issue: TMI deception crest ~65 % vs the 75 % annunciator (level-constants-set
  ruling if the cue matters); TR-1i strict xfail #420 (coupled #378). Gates: 42 runners at
  baseline per wave.

---

## 2026-08-07-develop-f — #418 tier 2 BUILT, waves A1–B2 (RECONSTRUCTED — not the authoring session's record)

**RECONSTRUCTED post-hoc from commits + issue comments by a different session** (the
2026-08-07-develop-e session's plan WP2, owner-approved); the authoring session wrote no entry
here or in `TUNING_LOG.md`. It ran 13:05–14:35 local — before both `-d` and `-e`; the letter
follows `run_session_labels`' newest-first rule, not the clock. Decisions of record, quoted not
re-measured — full write-ups on #418:

- **A1 (`174009c`)** derived SG pressure clock (+223 → +43 psi/s at full generation; five
  transients re-learned). **A2 (`9414ea0`)** SG mass ledger — `K_sg_level` retires into
  geometry (Ginna 35-s trip vs 78-s boil-dry reconciled). **A3 (`2c7a507`)** sourced MSSV
  capacity 0.84× rated (Ginna bank). **B1 (`ae025fc`)** tube node + transported legs under the
  invariance rule (1/h1 + 1/h2 = 1/h_sg) — steady anchors exact, `run_otdt` 46/46; new `[tune]`
  transport constants `tau_hotleg_s` 1.5 / `tau_coldleg_s` 4.0 ÷ flow (unsourced). **B2
  (`fcf7d66`)** manuals pending-Rev-14 items (a)–(f) + close-out; #418 carries
  `status-owner-review`.
- Traps rescued to `CLAUDE.md` themes: split-node capacity must come OUT of the parent node
  (C_tube silently reopened the ruled heatup pace, caught at 260.7 °C); knife-edge claims
  oscillate under re-clocking (TR-3 re-pinned on mechanism).

---

## 2026-08-07-develop-d — #419 stage 1: the cascade table posted for sign-off (no code)

**The deliverable** is on the issue — the full current → proposed → source → touches table:
https://github.com/TH462/Reactor-Dynamics/issues/419#issuecomment-5221487750. This entry records
the decisions inside it and the evidence taken this session.

**The anchor-plant declaration got its missing number.** Ginna's no-load SG pressure is **1005
psig**, sourced (TS Bases Rev 101, ML20339A221, B 3.3.2: *"steam line breaks occurring from no
load conditions (1005 psig)"* — fetched this session), and Psat(547 °F) through this sim's own
`_tsat` correlation lands within 1 % of it. The proposed ladder is therefore **Ginna's own, rung
for rung** — 1020/1060/1099/1063 psi (7.03/7.31/7.58/7.33 MPa): anchor sourced, pop = the 1085
psig first-lift MSSV (UFSAR ch 10), ADV by the sourced WTSM §7.1.3.3 placement rule (corroborated
by Ginna's own 1005–1060 psig ARV band), reseat derived at the current 3.3 % blowdown. **Landing
it retires `DESIGN_COMPANION` §8.34** ("the ladder itself is not sourced") — the departure
becomes a citation.

**Program endpoints: sourced ends, declared 4 °F top gap.** 546.9 → 580.2 °F (286.0 → 304.5 °C),
span 33.3 °F vs Ginna's real 29 (547 → 576 °F): with `h_sg`/`heat_gen_coeff` held fixed (the
#418 B1 invariance identity), our Q/h_sg = 32.6 °C vs Ginna's implied 29.9, so the top runs
4 °F high. Declared rather than chased — closing 4 °F by moving `h_sg` would reopen the entire
thermal identity for a cosmetic end.

**F15's proposed column is a bracket, not a number** — re-solve at wave inside [K_phys
derivation, 600-measured-green]. A bare number would repeat the original F15 sin (solved against
the suites, HR10). The K_phys method is the `K_steam_pressure` C_P precedent; the dome-only
order-of-magnitude is ~300-class but mixes bases (declared ~7,500-gal RCS vs power-scaled
pressurizer), so the honest derivation is wave-work on ONE basis. New geometry input landed:
pressurizer high-level 650 ft³ = 87 % ⇒ ~747 ft³ total (TS Bases B 3.4.10 ACTIONS).

**A provenance correction recorded, no reopen proposed**: the ruled `porv_flow_max` comment
cites "Ginna 210,000 lb/hr"; Ginna's own TS Bases B 3.4.11 says **179,000 lb/hr at 2335 psig**
— the 210k figure is NUREG-1431/4-loop-class. Ginna-based scaling gives 2.13e-4 vs the adopted
2.5e-4, inside the ruling's own rounding. Comment provenance fix owed at the wave's docs pass.

**Three decision rows put to the owner** (recommendation-first): **D1** `steam_dump_max` — keep
the ruled, WTSM-sourced 0.40 (recommended: it is an owner ruling with its own source, and the
full-load-rejection ride-out is taught at 40) vs adopt Ginna's sourced 28 %; **D2**
`K_surge_level` 0.4 → the real band 0.021–0.050 — recommended into the pace wave; measured cost
(perturb sweep, identical at 0.27 and 0.05) is two probe re-derivations (TR-1's PORV-lift claim,
peak 16.24 → 15.59/15.42 MPa, the A1 peak-flattening class; CA-21's dry-core fixture vacuous,
2367 → 0 samples) and **the old TR-1c/§8.21 wall did not reappear** — its premise went thermal
at #418; **D3** the boron pair (`boron_adjust_rate` 2.0 ppm/s, `boron_sample_lab_s` 60 s) goes
real — recommended into the pace wave, rates re-derived from WTSM §4.1 (on disk, backshop).

**The pace family's honest total, measured**: the thermal ramp is ALREADY real-class — fresh
full-stack re-measure puts the Mode 5→3 heatup at ~12.3 plant-h / ~30 °F/hr steady (the #418
clock stretched the recorded 11.3 by ~8 %, consistent with A1's own hold extension). The ×12.6
lives in the pressurizer clock (`setpoint_pressurize_slew_mpa_s` 0.02 → 1.586e-3: cold→NOP
10.8 min → 2.26 h) and the boron pair. The issue's "real heatup ≈ 5.8 plant-days" is a real
plant's procedural total including holds this sim deliberately does not model; the honest
modeled Mode 5→1 lands ~16–18 plant-h. Also corrected on the issue: the E-group dividers
already moved at #408 (`eccs_cooling_gain` 1.0 — at physical; `blowdown_gain` 0.25 — re-solved
on the real clock), so that ride-along is RE-AFFIRM, not work.

**Status**: #419 `status-needs-ruling` (sign-off blocks stage 2 — the sequencing ruling,
recommended pace → F15 → ladder). Owed fetches named in the table: Ginna UFSAR ch 5 text
(ML20339A035 is the figures volume), TS proper (OTΔT Ks, P-12, MSSV SR table), PTLR. No code
this session; `run_all` 42 at baseline, no re-baseline needed (`run_hardrules` 225/0 unchanged).

**SIGNED OFF AND WAVE 1 BUILT (same session)** *(OWNER RULING, 2026-08-07, verbatim: "D1:
measure first. […] D2: move it. D3: go real. Stage 2: go with recommendation.")*. Decisions of
record from the build:

- **The boron pair's "go real" changed shape on contact with the code, and the finding is the
  record**: `boron_adjust_rate` 2.0 was a GHOST — no engine read, no clamp, while raw
  `set_boron_adjust` commands ran any rate (a §14 fixture drives 3.0 ppm/s) and both automation
  channels meter at their own 0.05. The ruling landed as the constant becoming the LIVE ceiling
  (0.14, derived from WTSM 4.1's 10-gpm BA valve / 80-gpm blend / 4 wt % (7000 ppm) storage on
  the declared 7,467-gal currency; engine clamps ±). The channels sit beneath it untouched. A
  `[tune]` value nothing consumes is documentation wearing a tag.
- **TR-1's PORV-lift assertion was the compressed surge gain's rendering, and the honest gain
  inverts it**: peak 16.24 → 15.42 MPa, spray contains the full-rejection ride. Adjudicated as
  the plant being RIGHT (Ginna's loss-of-load analyses lift pressurizer relief only with no
  pressure-control credit), probe re-derived with the mechanism half pinned (dump saturated +
  self-throttle + Tavg 312..335) so the inverted claim cannot pass hollow.
- **`K_surge_level` moved position-preserving** (0.4 ÷ 12.6 = 0.032, mid-band of the
  un-compressed sourced 0.0214–0.0502) rather than re-fitted — the compression retires, the
  fit's information survives.
- **§14.1's ECCS trust-class row was stale since #408** — injection went to the real Ginna
  pump scale that wave and the trust table never heard. Retired with attribution; the
  Compressed class now holds ONE member (cooldown depressurisation).
- Re-measures with numbers: NOP at ~1.8 plant-h from the command (thermal swell rides ahead of
  the 2.26-h pure slew), accumulator window ~14 plant-min (~+9 → ~+23), full ride ~12.3
  plant-h / 30.0 °F/hr steady; PI-3 leg budget 3000 → 8000 s; §14 recovery window 300 → 900 s.
  Manuals Rev 14 pending item (g); CHANGELOG carries the wave.

**WAVE 2 (same session) — F15 IS ANCHORED, AND THE ANCHOR IS THE F14 COUPLING.** The stage-1
bracket was [K_phys derivation, 600-measured-green]; the measurement walked out of it and the
walk is the decision record:

1. **K_phys ≈ 304 is real physics** — the C_eff derivation (dome + liquid-flash, one
   power-scaled-Ginna basis) lands within 2 % of the pre-F15 original 300, and the same method
   on TMI-2's actual geometry reproduces its ~6-minute saturation. The old suites that forced
   the 600 solve (`run_meltdown`, `run_scenarios`, red at 300–450 then) are GREEN at 304 on
   the current plant — the compensation target was the compressed clocks, all since retired.
2. **But F14 forbids shipping it**: at relief 0.076 vs the ruled heater 0.55 MPa/s the
   stuck-PORV race INVERTS — the heaters hold pressure while the valve drains the pressurizer
   to 0 % (measured), so the TMI deception (level RISING on a voiding loop — Tier-A content,
   historical fact) never forms, and the campaign's TMI cluster went 43/51. K=3144 had been
   the silent second half of the F14 pair.
3. **Shipped: K = 2500 [derived-net, F14-coupled]** — K×2.5e-4 − K_heater = the plant's own
   physical net (0.0744 MPa/s). Not a fit: the only free parameter is F14, which is RULED and
   re-affirmed; the constant re-solves with F14 if that identity ever moves (stated at the
   constant). Measured at 2500: saturation ~5 min, deception crest through the 75 % annunciator
   at ~25 min (the #418 A1 owner-review crest plausibly restored), TMI 8/8 + qualify 5/5 +
   meltdown/scenarios green.
4. One content re-key on facts (`pwr_tmi2_p3` FULL row gains `hpi_active` — the third re-key
   of that grid, same reason class as #407's two) and one guard re-band (PI-3 leg 1, 30 → 14 %,
   the honest ride vents real inventory before the scram).

**WAVE 3 (same session) — THE OPTION-C RE-ANCHOR EXECUTED. Decisions of record:**

1. **The anchor's two sources agree through the sim's own physics** — 1005 psig (TS Bases
   B 3.3.2) and 547 °F (UFSAR ch 10) meet at Tsat(7.03) = 546.9 °F. The ladder that follows is
   Ginna's rung for rung, which RETIRES §8.34 (span 79 psi vs the real ~80 — the "~110 psi
   high" departure is gone). The ADV band shrank 0.25 → 0.12 by proportional-margin derivation
   on the 2.3×-narrower span.
2. **D1 executed by the owner's decision rule**: the ride-out survives at 28 % (measured — no
   scram, deeper self-throttle) → Ginna's sourced 28 % adopted, superseding the 2026-07-31
   40 % ruling by the owner's own measure-first instruction. The two declared teachings it
   narrows (the §8.21 cliff 7.1 → 3.7 °C; TR-1k's non-monotonicity → 3.1 pts) survive smaller,
   bands re-derived.
3. **The reactivity solve was quietly conflating two temperatures** — the 975-ppm anchor's
   quote point (WBN 557 °F) and this plant's no-load anchor. Decoupled; `rho_excess`
   0.087544 → 0.087354; the HZP IC lands 704.8 ppm with criticality at step 319, so the
   startup's 1/M content survives with new labels. Two latent linearizations in the
   HFP-follows check fixed on the way — the anchor chain now predicts the engine exactly.
4. **The turbine-trip burst now equals the real operating→pop margin** (~1.9 MPa both) — the
   knife-edge is Ginna's own. The shipped plant holds it (ADV at 100 %, settle under reseat);
   the bare-dump channel rig grazes (34/600 samples), and its check now claims graze-vs-park.
5. **TR-1i is the second strict xfail (#420)**: 5.28 vs the sourced ≤ 5.00 on the steep
   program, with the channel's speed thresholds corrected TO the sourced WTSM ladder this
   wave (the old ladder's 'fast' at 7.2 °F was unexercised slack). Not widened. The #378
   rejection criterion is superseded by events — re-visit together.
6. **The TMI deception crest is now an OPEN OWNER-REVIEW question**: 69.4 % (#418 A1) →
   ~75 at 25 min (wave 2) → **~65 with collapse at 47 min (wave 3)** — the 75 % annunciator
   is unreachable in free play on the final plant. The qualify exam re-keyed to a state cue;
   the level-constants set (level_per_void/level_per_mass/level_per_tavg) is where a
   restoration would be tuned, and that set is ONE object (the #337 rule) — its own change
   if ruled.

---

## 2026-08-07-develop-c — tier 2 RULED: the secondary joins the primary's fidelity (A+B, ladder stays), and content-follows-physics becomes standing law

**THE SCOPE RULING** *(OWNER RULING, 2026-08-07: selected **"A+B, keep 297 °C"** from four
options — a selection, not verbatim words, the #408 convention)*: the secondary gets (A) the
inventory/pressure re-clock from one sourced basis (Ginna anchor, per-MWt scale), THEN (B) an
SG tube-side node + hot/cold-leg transport delays — sequenced so the node is fitted on real
currency, the #408→#385 precedent. **The pressure ladder (8.23 / 8.77 / 9.31 / 9.0) is ruled
identity and does not move**; option C (re-anchor to a real-class ladder) is out of tier 2 and
survives only as a possible future identity ruling. **The #408 thermal fence is NARROWED by
the selection**: the ×12.6 Mode 5↔1 *pace* compression stays; transient loop *structure* is
declared not part of that fence (option text agent-authored, owner-selected).

**THE STANDING DIRECTIVE** *(OWNER DIRECTIVE, 2026-08-07: "changing the manual or training or
scenarios should never be a consideration for weather to change the physics … Documentation
and gameplay always follow the model/physics, not the other way around.")* — content-churn
cost is never an input to a physics decision; content re-authors to follow. Given while
probing whether the option-C rejection rested on content churn (it half did; the surviving
grounds are that the 297 °C anchor is a ruled identity and the ladder's *ordering* is what
teaches). Recorded in CLAUDE.md's HR9 block the same session.

**The plan** (approved same-session, plan-mode file + #418): three explorer sweeps + a design
pass produced wave A (K_steam_pressure 2.0 → 0.30 derived from an effective capacitance
C_P ≈ 1,025 MJ/MPa — the liquid's sensible heat dominates, dome-only measured-rejected; the
steam break re-expressed as its own mass-flow constant 0.75 because the `/K` division
otherwise quintuples break mass flow; `sg_mass_frac` state + piecewise level map whose
in-window slope reproduces K_sg_level 1.371 %/s EXACTLY so TR-14's Ginna event holds while
total inventory honors the 77.5-s boil-dry; MSSV capacity → 0.84× Ginna) and wave B (series
conductances with 1/h1 + 1/h2 = 1/h_sg and shared flow×dry factors, which makes the four-site
steady-state identity `Tavg = Tsat + Q/h_sg` INVARIANT — no formula moves, ICs get seeds;
first-order leg lags, no delay lines; raw thot keeps the DNB datum; OTΔT measure-first with
the sourced WTSM Tavg lead-lag as the pre-named remedy). Gate reds are pre-inventoried as
mechanical widenings vs re-derivations — nothing absorbed silently. Full plan on #418.

---

## 2026-08-07-develop-b — the lane merge: a deliberate deletion looks exactly like a merge loss

**THE DECISION.** `workbench` cut `CLAUDE.md` from 42,065 to 13,455 words and gated the result
(`run_doc_budget`); `develop` spent the same two days appending to the pre-cut shape. The merge
takes **the cut, wholesale**, and re-expresses develop's additions inside it — rather than
reconciling the two texts line by line, which is what a "keep both sides" habit would have done to
a file where one side's entire point was that there was too much of it. A merge is not a vote
between two edits; here it was a choice between two *documents*, and only one of them is the one
the owner ruled for.

**WHY THIS IS WRITTEN DOWN AT ALL:** `tools/merge_audit.js` flagged **31 items lost** and every one
was correct as a fact and wrong as an instruction. The audit's contract is "a named thing that a
parent had and the result does not", and a deliberate deletion satisfies it perfectly. There is no
way for the tool to distinguish a cut from a casualty — that is a limit of the check, not a bug,
and it is the mirror of the limit already documented for it (it catches a named thing disappearing,
not paragraph loss inside a section that survives). **The discipline that makes it safe is to
settle the question by COUNTING against every parent** — base 48, develop 48, workbench 0, merged 0
— rather than by deciding which side looked more deliberate. Restoring those 31 entries to clear a
red audit would have re-broken the ruled cut and reddened `run_doc_budget` in the same move.

**#349 IS CLOSED BY THE MERGE, not by this session's work.** develop's #408 wave 1 set
`safety_flow_max` to 8.0e-4 on the sourced ~3.2 safeties:PORV ratio, which is the finding #349
filed (28.6× against a sourced 3.0×). Workbench's status list still carried it as open because
workbench could not see that commit. Removed from the open-items list here; the issue is closed
with the release.

---

## 2026-08-07-develop-a — #408 wave 1: the proportional valve is RULED, and the melt verdict learns what TMI-2 proved

**THE RULING** *(OWNER RULING, 2026-08-07: "Why not go with the proportional valve other than
redoing some scenarios and trainings? The plant comes first, then the training, documentation
follow.")* — reversing the wave-1 fleet-standard relief sizing the same day it shipped, and on
HR9's own grounds: my recommendation to keep the fleet valve weighted content rework, which is
content voting on physics. The objection is the rule.

**What moved** (`engines/pwr/pwr_config.js`, arithmetic at each site): `porv_flow_max`
1.31e-3 → **2.5e-4** frac/s (~112 gpm — Ginna power-scaled; Ginna is ~152 lbm/MWt against this
plant's 149, so power-scaling and fractional parity agree; TMI-2's own single valve was 1.1e-4
of ITS mass, same decade where the fleet valve was 12×). `safety_flow_max` 2.2e-3 → **8.0e-4**
(the sourced ~3.2 safeties:PORV flow ratio — the old value was UNVERIFIED recall, and **#349's
28.6× finding closes with this row**). `K_porv_relief`/`K_safety_relief` 600 → **3144**, the F15
matched pair moved together, solved to preserve the PORV's full-open pressure authority
EXACTLY (600 × 1.31e-3 = 3144 × 2.5e-4 = 0.786 MPa/s).

**The K-preserve is the decision worth recording, not the arithmetic**: the PORV sits ON the
seam between the two clocks. Its pressure/energy authority serves the ×12.6-compressed
normal-ops insurge (the F14/F15 world — TR-1k measured the valve as the sub-arm load-rejection
backstop), while its mass now serves the REAL accident inventory clock. It is no coincidence
the fleet value ≈ proportional × 12.6 — that is why it "worked" for transients. Pressure keeps
the compressed gain; mass runs real; that split IS the ruled #408 architecture, applied to one
valve.

**Measured consequences, all in the plant's favor**: MD-10 feed-and-bleed VIABLE (bleed 112 gpm
vs feed ~150 — the one-day strict xfail dropped per the XPASS rule); the TMI-2 counterfactual
is a size fact again (full injection beats one wide-open plant-sized valve — 74.7 % held on the
45-min walk-away); the flagship authors severity 1.0 (a full stick of OUR valve ≈ TMI's
fraction; 0.20 was the same fraction of the FLEET valve); the deception builds on the DEFENDED
plant and crosses the 75 % level alarm at ~38 min, so the missions keep the historical LEVEL
cue for the securing; damage at ~2 h 20 m — the 1979 clock.

**Two engine regimes the ruling exposed, both fixed under it:**

1. **Relief at solid joins the bulk-modulus regime** (`pwr_pressurizer.js`). The §12.4c
   declared-not-attempted coupling bound the moment the valve's mass could no longer out-pass
   unterminated ECCS: bubble-gain K held pressure at the PORV band while inventory walked to
   the 120.00 % `mass_max` clip — the #361 signature by a fourth road. At solid the per-vented-
   mass gain now steps to `solid_bulk_mpa` exactly as the surge gain does, and the restore term
   stands down there too (measured soaking −0.015 MPa/s and making the PORV under-cycle 50 %).
   Spray (#346), the surge (#346), relief and the restore stand-in (both today) — the coupled
   regime is now attempted in full except commanded-spray authority, which remains declared.

2. **The terminal melt verdict separates "molten and unrecovered" from "molten and quenching"**
   (`pwr_thermal.checkDamage`). The peak clad/fuel rule stays for the DAMAGE latch (#213 —
   damage is local before it is average); but peak>2800 as the TERMINAL latch ended the model
   while the bulk core sat at ~330 °C under an active reflood, freezing the core-exit TC at
   2800 °C forever — at 96 % restored inventory the subcooling margin could not restore, and
   the flagship's own recovery ending (TMI-2: ~45 % locally molten, reflooded, stabilized) was
   unrepresentable. The clad route to `melted` now requires the node at its melt ceiling while
   inventory is NOT rising; the fuel node crossing melt stays unconditional. The ceiling
   (`_clad_ceiling` touch latch) bounds the #326 oxidation runaway without the terminal freeze
   and rewets on re-covery — measured, margin +48 °C at 75 % inventory. The unmitigated paths
   (MD-1/3/5: pool boiling away, no makeup) still terminate — measured, `run_meltdown` 12/12.

**Gate story**: `run_all` 38 runners green at updated baselines — `run_campaign` 51/51 3029
(missions re-paced to the measured real-clock arcs; budgets 42,000 sim-s; the ackThrough guard
raised with them because at the 0.05 s transient cadence the old 6e5-cycle guard exhausted at
~30,000 sim-s and mimicked an unfinishable mission), `run_meltdown` 12/12, `run_behavior` 65/1,
`run_ops` 58/69 with the ruled drain-rate red now at 284.3 s against its ≥ 300 s target (was
53.7 — the real CVCS scale nearly delivers the 2026-07-22 feel target on its own).

## 2026-08-06-develop-g — #408 stages 0–2 ruled: CVCS joins the real scale, and the sizing question splits the constants table in two

**Both #408 stage gates are RULED, five decisions in one reply** *(OWNER RULING, 2026-08-06:
"1. A / 2. Yes. But can we name it something a non nuc engineer will understand? Maybe
something like % of full primary loop shear or something like that. / 3. Re-affirm. / 4. As
recommended we will do this with 385. / Stage 2: a and c, defer b. … Definitely document b. I
want to implement it later.")*: (1) **CVCS joins the real scale** — one inventory ledger, one
implied RCS volume, retiring the config identity block's "NO single RCS volume makes both
true"; (2) the break slider relabels **in plain language** (working copy: *"Break Size — % of a
full pipe shear"*; exact wording lands in wave 1); (3) SI 12.4 MPa **re-affirmed** on the
sourced band (WTSM 12.3 1,807 psig / Ginna 1,715 psia) and the 2026-07-21 "TMI-clock-gated"
justification retired; (4) √Δp re-anchored now, Moody-class + reflood transport delay with
#385 after the re-clock; (5) pacing = authored beat speeds + free-play affordances, the
auto-accel governor **deferred and documented as #409** with the owner's KSP-warp-zones
framing.

**The decision the owner's sizing question forced, recorded here because it re-cuts the
stage-1 table**: the plant will declare an identity volume of **~1,000 ft³ (~7,500 gal) at
300 MWt**, from the sourced fleet ratio (~3 ft³/MWt: Ginna 5,123 ft³ / 1,811 MWt = 2.8,
BVPS-2 9,650 / 2,900 = 3.3 — mixed pzr bases, noted). That splits the accident family:
**power-scaled systems** (ECCS, accumulators, own-pipe break) have size-invariant fractional
rates (measured: HPI 2.6e-4 frac/s at Ginna vs ~2.1e-4 at a 4-loop) and proceed as tabled;
**absolute-size components** (SG tubes, RCP seals, possibly a fleet-standard PORV) are
fractionally **~5–6× bigger** in a small plant — SGTR ~2.5e-4 → ~1.3e-3 frac/s, and IF the
PORV is standard hardware, `porv_flow_max` lands ~1.3e-3 (making today's 0.0035 only ~2.7×
compressed, and a stuck-PORV draindown ~20–25 min *as a size fact*). Those rows re-issue as a
table amendment after a wave-1 evidence mini-pass (Zorita-class single-loop data, WTSM SG tube
dimensions) — recall-order arithmetic until then, flagged as such on the issue. **Honesty note
carried to the record**: the measurement that flipped the Decision-1 recommendation (compressed
charging holds a real-scaled SGTR) was computed on Ginna's volume and partly dissolves under
the small-plant identity; the ruling rests on coherence grounds, and the CVCS correction
SHRINKS under the declared volume (~3–5× real, not 9×).

Session artifacts: plan + constants table + UX note + rulings record, all comments on #408;
evidence ledger in `TUNING_LOG` 2026-08-06-develop-g. No code moved (plan-first held through
both gates). Next: wave 1 opens with the identity-volume declaration and the amendment pass.

## 2026-08-06-develop-f — #385 stage 2: the TMI void lift is a flow split, and the discriminator is BREAK PATH, not void magnitude

**LATE-SESSION IDENTITY RULING (#408) — the accident-inventory clock is RE-DECIDED to
real flows, plan-first.** The compressed "lumped fast scale" for accident-inventory flows
(break, HPI, LPI, accumulators) is superseded by ruling: they move to **real
fractions-per-second**, and time acceleration carries casualty pacing. *(OWNER RULING,
2026-08-06: selected "Go real flows (tier 1) as its own project" from three options — a
selection, not verbatim words.)* Nothing is implemented — the selected option's own text
requires planning before touching anything; #408 is the staged umbrella. **Why it
re-decided an original identity choice**: the compressed clock existed so casualties are
legible at 1×; the owner's pacing request *(OWNER, 2026-08-06: "4 seconds seems too
abrupt. Let's try to get it closer to 20 seconds.")* was measured impossible inside that
identity — the family shares one clock, HPI alone refloods the RCS in ~13 s, and no
single-constant change reaches 20 s with the DBA arc intact (grids in TUNING_LOG
develop-f). Asked why not full physics, the answer was a three-tier cost ladder, and the
owner chose the identity, not the compromise. **Scope fence:** the thermal ×12.6
compression is NOT reopened.

**Claim.** The pressurizer level void term is now weighted by the discharge path
(`levelRaw`: `w = void_weight_surge_ref/(void_weight_surge_ref + leak_flow)`, new `[tune]`
0.01 frac/s), fixing the measured defect that TRUE level read **exactly 100 at the moment
the core top uncovered** at every board LOCA severity ≥ 0.15 — while leaving the calibrated
TMI deception **byte-identical by construction** on the stuck-PORV/safeties/no-break paths
(`leak_flow = 0` ⇒ w ≡ 1.0).

**The decisions, and their why:**
1. *(OWNER RULING, 2026-08-06: selected "Term fix now + node follow-on" from three options
   in plan review — a selection, not verbatim words.)* The pressurizer inventory node stays
   the destination on realism grounds (path discrimination emerges from surge-line geometry
   instead of being engineered) and is COMMITTED as a follow-on after the cluster is green;
   the term fix ships now because testers form first impressions on the broken minute. The
   cluster's sweep + CA-18 become the node's acceptance tests. A hybrid (node for level,
   lumped surge for pressure) was examined and rejected — the #330/#337 split-accounting trap.
2. *(OWNER RULING, 2026-08-06: selected "Proceed on stage 1" in plan review.)* #384 goes on
   #386 stage 1's landed containment volume; spray/fan coolers only deepen LATE containment
   decay, second-order to break Δp, error direction conservative.
3. **The weight is a flow split, not a switch** — continuous in `leak_flow`, so a seal-leak
   trickle (0.005 frac/s, w ≈ 0.67) keeps most of the deception while the board-default
   break (0.076, w ≈ 0.12) suppresses it. SGTR falls on the loop-break side and its EOP
   holds void < 0.05, so the term is near-unobservable there — measured, `ops_sgtr_managed`
   and CA-14 leg D unmoved, so no `_leak_to_sg` scoping was needed.
4. **SOURCED direction, fitted magnitude**: WCAP-16009-NP-A §11-4-5 (2-phase surge-line
   DISCHARGE during blowdown) + WTSM 5.0 §5.0.1.1 give the direction; the split ratio is
   this plant's, declared `[tune]`.

**Gate math:** `run_behavior` 61 → 62 pass / 1 xfail (CA-18, injection-verified — the
pre-change engine reddens exactly its three discriminating checks); `flagship_tmi` 9/9;
`run_campaign` 51/51; `run_manual_rev` 15/0 (Rev 13 extended with item (i); `12 §7.3` was
also carrying constants three revisions stale, corrected). Full cluster plan and stage
list: TUNING_LOG 2026-08-06-develop-f.

**Stage 4 addendum — TWO DECISIONS AND A FIND.** (1) **`K_break_vent` = 1.0, chosen
against a measured trade the plan did not predict**: the sizing grid shows higher K
RAISES the blowdown floor (faster vent → earlier ECCS → refill outraces decay) while
ERASING the core uncovery (min inv at sev 1.0: 0/26/44/60 % at K 1/2/3/5) — no reflood
transport delay means containment equalization and a real uncovery are mutually
exclusive in this lumped plant. K = 1 keeps the DBA arc, which is the educational
payload (Q2); the residual gap (full break bottoms at 116 psi vs a ~34 psi building) is
DECLARED (`12 §7.2`, #384) rather than tuned away by trading the arc. (2) **CA-14 leg A
re-authored one-sided** — its "ends AT saturation" two-sided band was pinning the
SAT-PULL (which forced subcooling ≈ 0 by construction), not thermodynamics; the #363
defect was the subcooled side only, and a vented drained core's remnant steam SHOULD
superheat. Passes on both engines; still reds the pre-#363 plant (+55.8 °F subcooled) by
inspection. (3) **The find: #361's 120.00 % signature by a THIRD road — a split
accounting latent since #337.** Below ~560 °F `levelBase` floors and the level line
credits no contraction room while the surge read `_dTavg_dt` raw; the stage's earlier,
hotter ECCS refill exposed it (the arrest never fired, inventory rode the cooldown to
the clip). Fixed by making the surge read the same line the level shows, narrowest
predicate (solid ∧ base-on-floor ∧ contracting); CA-15 came back green WITHOUT
re-authoring, which is the strongest evidence the fix is the consistent one. The deeper
truth — a cold solid RCS genuinely holds more than `mass_max` credits — is the #385
node's question, noted there.

**Stage 3 addendum — A PLANNED ENGINE EDIT WAS MEASURED UNNECESSARY AND NOT SHIPPED.**
The approved plan committed `saturated = !pzr_solid && (…)` in `stepPressure` on the #384
revert post-mortem's premise (solid arrest never engages on a quenched refill at marginal
saturation). Measured on the forced state, the premise fails: the ECCS quench closes the
marginal-saturation window in seconds and the CURRENT engine finds the injection≈spillage
equilibrium (P 2.70 MPa vs 2.89 config solve, mass on the solid line, flows balanced to
0.1 %). Decision: **pin the behavior (CA-19, `run_behavior` 62 → 63), ship no engine
change** — a predicate alteration with no reachable broken state is code no A/B can see,
and HR12 does not allow "defensive" physics edits. This also ANSWERS #334's open
throughput question (posted there). If stage 4 resurrects the state, the edit ships with
its measurement. The standing equilibrium pressure (~390 psi where a real post-LBLOCA RCS
sits near containment) is the √Δp break law's low-Δp restriction — the §12.4b departure
meeting #334 item 3, carried to stage 6 rather than tuned here.

## 2026-08-06-workbench-j — one enforceable cap beats three unenforceable ones

**Decision: gate `CLAUDE.md` at 15,000 words; leave chat and write-ups to habits, not limits**
*(OWNER RULING, 2026-08-06: "Go with your recommendation." — after "Should we add word limits?
Wouldn't it hamstring you sometimes?")*. The answer to that question is yes for two of the three
caps I had proposed, and the reasoning is recorded in CLAUDE.md so it is not re-litigated: a word
limit on write-ups forbids the worked A/B that makes a trap believable and so collides with HR12,
and caps are a proxy that gets gamed by compression or by splitting one entry into two.

**Where a hard number IS right: the auto-loaded file.** `CLAUDE.md` is read into every agent's
context on every turn, which no other document in this repo is — so its length is a per-turn tax
rather than a style question. `test/run_doc_budget.js` (new runner, `run_all` 39 → 40) checks
three things, all of which its own prose already claimed and none of which anything could measure:
total words ≤ 15,000, no single physical line over 400 words, and the *Recent themes* region
inside its documented cap of 5 bullets.

**Injection-verified against the real pre-cut file** (`git show HEAD~1:CLAUDE.md`), not a
synthetic one: 42,065 words, a 5,310-word single line, and **13** bullets in the themes region —
3 checks red, exit 1. That 13 also corrects this morning's "7 bullets" figure, which counted
themes proper and missed 6 rescued traps sitting in the same region.

**The general rule this is the second instance of, in one day.** `tools/find_source.js` was
written this morning because the evidence-pass SOP *implied* a three-lane corpus grep and failed
twice anyway. This gate exists because CLAUDE.md's caps lived in prose **inside the file they
governed** and were broken for weeks. **A rule nobody can measure decays; convert it to a command
or expect to rediscover it.**

**Deliberately not gated: `Diagnostic/TUNING_LOG.md` (152,617 words) and `Blueprint/`.** They are
read on demand and their size is the point — TUNING_LOG is meant to be a strict superset of what
CLAUDE.md used to duplicate. Length is a defect only where it is paid every turn.

## 2026-08-06-workbench-i — CLAUDE.md: the fix for verbosity was to cut the file, not add a rule to it

**Decision: cut CLAUDE.md 42,065 → 13,455 words rather than add a conciseness instruction to it**
*(OWNER DIRECTIVE, 2026-08-06: "Should I add some lines in Claude to try to reduce your verbosity?";
ruling on the recommendation: "Do 2 as you recommend.")*. The file already carried a 2026-07-30
conciseness directive and a "Keep it SHORT" instruction in its own header, and had grown to 42,000
words under both. A third instruction in a file that big is the same failure mode as the paragraph
that was supposed to stop one-lane corpus greps — see this lane's `tools/find_source.js` entry.

**What was cut, and why it was safe.** 21,046 words of prose gate baselines duplicating
`BASELINES` in `test/run_all.js`, which the section itself names as the authority; the copies had
demonstrably rotted (four wrong figures, one runner listed twice with different numbers, one block
marked "unedited" from a three-day-old merge). 9,663 words of themes and standing-procedure bullets
compressed to 2,055 with every trap kept as a line. 788 words of status narrative that was a
changelog in a section whose own instruction says "current state and pointers, not a changelog".

**The precondition that made it safe, and the rule for next time: check citations BEFORE deleting,
not after.** `run_hardrules` counts `OWNER RULING`/`OWNER DIRECTIVE` sites in tracked markdown, so
deleting history deletes sites — recorded four times here as a surprise. This pass extracted all 30
dated citations in the file first and confirmed **every one exists in another tracked file**; the
208 → 203 drop is therefore sites, not rulings, and was written into `BASELINES` with that reason.

**Standing consequence.** The themes list now carries a word budget (~80) as well as its 5-bullet
cap, because the cap bounded the count and nothing bounded the size — measured at eviction time,
7 bullets averaging 500 words, two of them duplicating traps rescued below them.

## 2026-08-06-workbench-h — #371: a one-lane grep declared a departure that the corpus could refute

**Decision: move `adv_setpoint` 8.60 → 8.77 MPa (1247 → 1272 psi) onto a sourced placement rule, and
narrow `DESIGN_COMPANION` §8.34 to the relief ladder alone.** WTSM §7.1.3.3 (ML11223A244) sets the
real ARV *"approximately half the difference between the no-load steam generator pressure and the
lowest set pressure of the safety valves"*; on this plant's ladder that is (8.23 + 9.31)/2 = 8.77.
Ours sat at 34 % of that span. The same section sizes the valve at *"approximately 10% of the rated
steam flow … from each steam generator"* — `adv_max` 0.10, already there from an independent sizing
exercise, so that half of §8.34 retires outright. It also names the valve: *"The PORV (also called
an atmospheric relief valve or atmospheric dump valve)"*, which answers the question that started
this — it IS a PORV.

**Why the move is safe rather than merely justified.** Perturbation sweep at exactly this nudge: 42
of 623 behaviour checks move, **zero verdict flips**. Full stack, the loss-of-condenser spike peaks
9.06 MPa and the safeties lift at 54 s at BOTH setpoints; only the hold point moves (8.65 → 8.82 MPa,
Tavg 302.0 → 303.3 °C). `run_all` 39/39 at baseline after.

**What is NOT sourced, and must not be "corrected" next:** the ladder. Real is no-load ≈1080 psig →
ARV 1125 → five staggered safeties 1170/1200/1210/1220/1230; ours is 1194 → 1272 → one safety at
1350 — every rung ~110 psi high, span 156 psi against 90 — because the no-load anchor is tied to
this plant's ruled 297 °C Tavg. The rule is satisfied WITHIN our ladder. Moving the ladder is one
change with the Tavg anchor or it is nothing.

**Process decision: `tools/find_source.js`, and the reason it is a tool and not a rule.** §8.34
asserted *"No document in any lane's corpus contains 'atmospheric' in a steam-relief sense"* while
ML11223A293 sat in develop's inbox saying otherwise, fetched two days earlier. #315 §6 is the same
failure — an OTΔT argument built, and reverted, while ML11223A301 was already in another lane. The
SOP already implies checking; it failed twice anyway, so the fix is a command that cannot check
fewer than three lanes and **exits 1 on a real zero**. Run it before declaring anything unsourced.

**Test decision: a `range()` call on a boolean is a hollow check, and TR-17 carried one.**
`!range('sg_safety_open').max` is `!NaN` — `true`, always. Injection-verified against the plant it
was meant to exclude. Re-authored to the real discriminator (safeties open 1.8 % of the hour and
reseat, vs 99.4 % and never), which also corrects a false claim in the probe's own header. Swept:
only site in the tree.

## 2026-08-06-workbench-g — #395/#396: the precondition layer, and the gate for the day no reload can see

**Decision — preconditions WARN AND NEVER BLOCK** *(OWNER RULING, 2026-08-06: selected "Warn,
never block" from three options put to him — warn-only / hard block / block-in-missions-only —
a selection, not verbatim words)*. New `precond: [{p, op, v, tol, text}]` field on procedures,
graded live by the Instructor every checklist tick through the existing `_grade`/`_predMet`
(instrument-first, HR1) — deliberately NOT a fourth copy of the predicate evaluator, of which
this repo already had three. Verdicts ship in the snapshot's checklist block; prose stays in
the artifact (the same ship-verdicts-not-prose rule the step text already follows). The
checklist panel renders unmet rows as a caution banner with expected-vs-measured; free-play
invariants pinned by `run_checklist.js` (:56 no-reset, :82/:102 never-blocked) are untouched
and re-asserted.

**Decision — the chain gate proves the DOCUMENTED day, not an invented one.** New
`test/run_procedures_chain.js` runs heatup → PWR-N02 step-15 dilution → startup on ONE
service and asserts the day goes critical to Mode 1 (10.75 %, zero refusals — #396's two
`set_trip_block` refusals are the un-diluted day's signature, reproduced 15-red by the
dilution-skipped injection). raise/lower/shutdown/cooldown are deliberately NOT chained:
their `acc` values are authored against their own ICs and no procedure bridges the startup's
~10 % arrival to raise_power's assumed 50 % — that is the known Tier B content gap (#319),
and closing it inside a gate would be authoring content in a test (HR9/HR10). The
prerequisite mismatch those four would hit is exactly what the precondition layer now
surfaces at runtime instead.

**Decision — PWR-N02's driveable checklist stays deferred** *(OWNER RULING, 2026-08-06:
selected "Defer to Tier B pass" from two options put to him — a selection, not verbatim
words)*; the chain gate performs the dilution via `set_auto_setpoint boron_conc 683`, the
board's actual boron surface.

**Mechanism notes.** The stack runner's replay machinery was extracted verbatim to
`test/procedures_harness.js` with one new seam (`opts.svc`); `run_procedures_stack`'s
unchanged 29/29 262/262 is the refactor-neutrality assertion, measured both sides.
`pwr_startup`'s seam row is `boron_ppm ~683 ±70` — ±70 ppm ≈ the caution's ±750 pcm ECC
acceptance band at ~10.6 pcm/ppm; the post-heatup 856.8 misses it by 104 ppm of margin, and
all 16 authored rows were measured MET on their six own `from:` ICs before shipping.
Injections measured: neutered evaluation → `run_checklist` 7 red / chain 5 red; dilution
skipped → chain 15 red with the issue's verbatim refusal text. Full session record:
`Diagnostic/TUNING_LOG.md` 2026-08-06-workbench-g.

## 2026-08-06-develop-d — #392 follow-up: a probe scoped to your hypothesis cannot disconfirm it

**Decision — the render pass writes only what changed, and it writes all of it inside the paint
cycle.** Three mechanisms: a changed-only `txt()`/`setHTML()` guard, every DOM-writing subscriber
moved into the rAF (with `diagTick` **split** — accumulation stays synchronous because it diffs
alarm states, only its readout moves), and the three bubble fields **pooled** rather than torn
down. Measured on the real shell, childList mutations per 10 s of transient: **~10 900 → ~690**,
with everything left being a value that genuinely changed.

**THE METHOD FAILURES ARE THE POINT OF THIS ENTRY.** develop-c fixed a real contributor and the
owner reported the flicker *"still happening, slightly better"* — which is precisely what a
partial fix feels like, and should have been read as "keep measuring" rather than "close".

**1. The first probe could not have found this.** It counted only adds of elements carrying an
inline `animation` — the mechanism already suspected. **A probe scoped to your hypothesis cannot
disconfirm it**; it can only tell you how big the thing you already believe in is.

**2. A probe that aggregates by a non-unique key manufactures its own signal.** The
whole-page restart probe keyed on `tagName + className`, collapsing ~41 pipe polylines into one
bucket and comparing different elements' clocks between frames. It reported **8512
`stdPipeFlow` restarts in 10 s** and I was one step from shipping that as the root cause —
*against this repo's own standing note that the pipes are handled correctly*. Per-element
identity: **zero**. When a measurement contradicts a documented fact, suspect the measurement.

**3. A plausible cost argument is not a measurement.** The owner's timeline pointed at the
strip chart and every 2026-08-05 chart commit did raise per-frame cost. Neutering `drawChart`
outright moved frame p95 **25.7 → 20.3 ms** and left the longtask count unchanged. Not the cause.

**4. The answer was already in the file.** `ui/app.js`'s rAF note describes exactly this
failure — *"the compositor present a frame mid-rebuild on real GPUs … while software-rendered
headless looked fine"* — including the reason no probe here could see it. Only `render` had ever
been wrapped. **Read the note next to the thing you are debugging before instrumenting it.**

**5. A pin per PROPERTY is not a pin per FAILURE MODE.** The held-axis clamp added that morning
could exclude the data, putting the trace outside the viewBox — and `overflow: visible` meant it
drew on the board rather than clipping. Three sparkline pins existed by then, covering the
trace's shape, stability and existence; none looked at **where it was drawn**, so it took an
owner screenshot. The clamp is now a preference that re-expands to contain the data, `ys()` is
hard-clamped into the box, and the new pin is injection-verified at 229 vertices outside.

**And the owner's three clues each out-performed the instruments**: "inconsistent what flickers"
ruled out a single element, "started after the strip chart changes" produced a testable (and
false) hypothesis worth eliminating, and "brief blank/blink" identified the mechanism outright.

---

## 2026-08-06-develop-c — #392: the ADV default reverses #371a, and a 5-minute sample interval nearly shipped the reason backwards

**Decision 1 — the ADV ships in AUTO** *(OWNER, 2026-08-06: "Amos dump should start in auto"
— ADV, dictated)*. `adv_override` `0` → `null` in the engine's initial state and in
`_migrateState`, so it covers every IC, instructed content and migrated save. **No `defaultOn`
on the automation channel**: it is `kind: 'mode'`, so `_isEngaged` reads the plant
(`adv_auto` ≡ `adv_override == null`) and the flag would be redundant *and* narrower —
`engageDefaults` runs for free play only.

**This reverses 2026-08-05-workbench-h (#371a), and the reversal is measured rather than
argued.** #371a shipped the valve SHUT because AUTO "would take the code safeties out of every
bottled-SG evolution — TR-5, TR-8, the MSIV mission, TR-12b's safety lift". Measured full
stack, MSIV closure at hot full power:

| | ADV SHUT | ADV AUTO |
|---|---|---|
| peak | 1351 psi (9.32 MPa) | 1350 psi (9.31 MPa) |
| safeties lift | 1318 psi (9.09 MPa) @ 65.8 s | **1317 psi (9.08 MPa) @ 68.5 s** |
| then | **still open at 10 min** | **reseat at 5.0 min** |
| settles | 1305 psi (9.00 MPa), on the safeties | **1249 psi (8.61 MPa)**, the ADV setpoint |

Peak and lift time are essentially **identical** — AUTO delays the lift by three seconds and
does not prevent it (**TR-5 and TR-16 pin it and both pass unchanged**) — so the premise fails,
by a wider margin than the first pass suggested. **These are PEAK-TRACKED**; an earlier draft
quoted 9.06 MPa as the lift, which is the relieving plateau the safeties settle onto, not where
they popped. Sampling found the plateau; only per-step tracking finds the pop. What changed is the *steady* state, and it changed toward
prototypicality: a plant does not sit on its main steam safety valves for half an hour, and
relieving to atmosphere below the code setpoint is the entire reason an ADV exists at 8.60
against their 9.31. At power it does not open at all (819 psi / 5.65 MPa). **AUTO caps
pressure but does not cool** — Tavg holds 574 °F (301 °C) with the condenser lost — so §8.29's
"no controlled cooldown path" is still closed by an operator lever, which is what keeps TR-17
leg B meaningful.

**THE PROCESS LESSON IS THE BIGGER ONE, and it is mine: I gave the owner a recommendation
resting on an unmeasured premise, then a coarse measurement appeared to confirm the opposite.**
The recommendation said the safeties would still lift because "heat ≫ the 10 % ADV capacity".
That is wrong — the MSIV closure trips the turbine, which scrams the reactor at 1m01s, so it is
a decay-heat case within the minute. Then `--every=5m` read `sg_safety_open` FALSE throughout
and made #371a look simply correct, which would have shipped a write-up that was backwards in
the other direction. `--every=20s` found the real shape. **A 5-minute interval cannot see a
2-minute event**: when the claim is about a transient, sample the transient, not its tail —
this is `h.range()`'s trap in a new costume.

Content follows the plant (HR9), so two probes were re-authored and both injection-verified:
**TR-17** leg A (the null control rested on "the valve ships SHUT") now measures what AUTO
bought, with a **new leg A2** forcing the valve shut to keep reproducing audit #297 F3, and its
"still holds hot" check retained as a calibration guard **green on both engines**; **TR-12b**'s
safety-lift check became a relief-path check. The distinction is worth keeping: TR-5 bottles
from full power and SPIKES past the ADV; TR-12b's generator re-pressurizes *up* from a
blown-down break and never spikes. `DESIGN_COMPANION` §8.34 and `Manuals/12` §12.18 are
narrowed to the unsourced capacity; the ship-SHUT half is retired.

**Decision 2 — a rebuild guard's trigger must be the thing that changes the POPULATION, not
the thing that changes its aim.** The owner's flicker report came with the mechanism attached
(*"the steam bubbles restart their animation … the larger the transients the more
flickering"*). Measured, animation-restarting rebuilds per plant-minute on an MSIV closure:
**31.9 → 3.6**; the alarm stack separately **9.2 rebuilds/second → 0** on an *idle* plant.

Three things settled here. **A single wholesale re-render was ruled out first** rather than
assumed — mount/unmount is plant-switch only, the board render does no node churn, and the
ResizeObserver writes a transform, which does not restart descendant animations. **The
quantisation has to cover every term of the guard**: the pressurizer's level term was already
coarsened to ~3 px citing #233, but it sat in an `||` with a raw-float `heaterPower`, so the
neighbour reopened the hole — a fix applied to one term of an OR is not applied. And **travel
can be re-aimed without rebuilding**: writing a CSS custom property does not restart an
animation, so level leaves the rebuild key entirely, which matters because a draining plant
moves the surface every broadcast. Quantising it instead would only have traded a fast pop for
a slow one.

**Two planned items were measured and deliberately NOT done.** `diagTick` was on the list to
rAF-coalesce and must not be: it is an accumulator that diffs alarm states, so coalescing would
drop diagnostic history. `renderAutomate`'s expensive document sweep turns out to be RBMK-only.
The residue is a pane-visibility guard (`physicsVisible()` generalised to `paneVisible(name)`)
plus a repaint on tab switch, without which both it and the Physics tab open stale on a paused
sim.

**Decision 3 — a check that cannot be made to fail does not ship.** The vital-gauge sparklines
took the strip chart's bucketing, min/max envelope, held 1-2-5 axis, thinning, speed-following
window and fine sampling. Four `board_check` pins were drafted; **three shipped and one was
cut**. "History translates rigidly as it scrolls" stayed green against *both* defects it
describes — a moving-origin grid and a per-paint re-fit — while the held-axis pin went red on
both, so its property was already covered from a better angle. The held-axis pin was hollow on
its own first draft too: a ±0.4 psi wobble is floored by `MIN_WINDOW` to the same range either
way, and the discriminator had to be a ramp. **Both were caught by injection, neither by
reading.**

The port also surfaced an unfiled defect: **the six vital tiles were BLANK above ~600×** (a
fixed 180 s window against `accel × 0.1` sim-seconds per broadcast holds one sample at 3600×,
and the trace collapses to a single vertex — injection-confirmed 1 vertex vs 230 now).
Fine sampling needed **no new sampler** — `chartSample` already walks every series and the six
tile readings are among them, and there could not be a second one anyway since the service
holds one sampler slot and `takeFine()` clears. The cost was routing, and the drain is now
**split** (`pendingFine` for the chart, which may skip a frame; `RD.ChartFine` for the board,
which wants this frame only).

**Deferred, with the reason:** `ui/chart_math.js`, to share `niceStep` + the hold policy
between `drawChart` and the tile. It is 8 duplicated lines plus a policy block, both marked
KEEP IN SYNC, weighed against re-pointing a working strip-chart fitter for no user-visible
gain. Worth doing; not worth bundling into a five-defect fix.
---

## 2026-08-06-workbench-b — #377: a probe must not flip on a coin, and a mitigation nobody measured is dead

**Decision.** TR-1c's backstop check asserted `peak ≥ 16.20 MPa` — the PORV setpoint itself — and
the merged plant peaks 16.212 hands-off, 16.198 shipped: the physics lands ON the number, so the
check (and the `porv_open` EVENT, measured flipping together with it) is a coin toss under a 3 %
thermal nudge. Re-authored to the robust pair — the DOORSTEP (`≥ porv_open_mpa − 0.15`, from
config) and the CLIFF SPAN (sub-arm minus caught ≥ 0.5 MPa; both legs ride any nudge together, so
the difference holds at 0.71 worst-seen) — with the knife-edge ornament demoted to info. New
**TR-1k** runs the same legs on the SHIPPED lineup, where the audit's "rod control absorbs it,
12.9 psi to spare" mitigation is measured DEAD (#372 ate it; both lineups end at the backstop),
and pins the declared cliff's real cost: the sub-arm cut undershoots ~15 points deeper than the
caught one. **The §8.21 ruling comes out strengthened** — the PORV is the honest backstop on
every lineup now — and the mitigation claim turned out to live nowhere but TR-1c's own comment,
which cited a "§8.21 write-up" that never carried it. Full record:
`Diagnostic/TUNING_LOG.md` 2026-08-06-workbench-b; injections and the nudge/seed matrix there.

---

## 2026-08-06-develop-b — lane merge `develop` ← `backshop`: verifying an audit lane rather than reasoning about it

**Decision.** The backshop merge is carried as-is (no judgement calls in it — 3 commits of
audit tooling, no `Manuals/` edits, no engine change), and **audit mode is confirmed by
measurement on both sides of the merge rather than by argument** *(OWNER, 2026-08-06: "Merge
backshop. It's in audit mode. Make sure it's in audit mode after the merge.")*.

**Why measurement, when the argument is airtight.** A lane is in audit mode because its tree
carries `.claude/settings.local.json` with `claudeMdExcludes` + `autoMemoryEnabled: false`,
which layers by default and needs no flag (#383). That file is **gitignored**, so no merge or
fast-forward can touch it — the argument really is airtight. It was still measured before and
after (`audit_preflight` OK / OK, file md5 unchanged), because **this is precisely the failure
class `tools/audit_preflight.js` was built for**: its header states that a pattern which
silently fails to match "would look exactly like a clean audit". A mode whose failure is
invisible is one you check, not one you deduce. The same reasoning is why the charter pairs the
static preflight with the auditor's own first-turn self-check — neither substitutes for the
other, and this merge can only speak to the first half.

**One thing found and deliberately NOT changed.** Backshop's settings file documents itself as
mirroring `RD_workbench`'s equivalent; that file does not exist, so workbench is not an audit
lane at present — consistent with it having done ordinary #370/#371/#378 work, which is what
the comment's own "REMOVE THIS FILE to give the lane its CLAUDE.md back" instruction produces.
The comment is stale. **Re-arming workbench as an audit lane is an owner decision about how the
lanes are allocated, not a merge resolution**, so it is recorded rather than acted on. Note the
structural gap it exposes: `audit_preflight` only ever checks the tree it runs in, so no tool
in the repo can answer "which lanes are currently unprimed?" — the SessionStart hook reports a
lane's own mode, and nothing aggregates.

**Gates.** `run_all` 38/38 at baseline, `run_ops` 58/69 tracked red unmoved, `merge_audit` OK
(27 artifacts, nothing dropped). `run_hardrules` **200** — measured, and the third distinct
value for that key in one day (base 178; lanes 189/179/183; 195 after the workbench merge).

---

## 2026-08-06-develop-a — lane merge: a revision number that is a release marker, not a counter

**Decision.** The manual set's revision number **does not advance until a website release**
*(OWNER DIRECTIVE, 2026-08-06: "The revision number only matters during a release to the
website. Revision numbers should never go up until a release happens.")*. Rev 12 is what the
site carries (Alpha 1.1.0, `main` at `7a40b9a`); everything since is one pending **Rev 13**,
no matter how many changes it accumulates. The `develop` ← `workbench` merge collapsed six
unreleased rows into that one row, carrying all six changes as (a)–(f).

**Why it came up, and why the rule is better than the fix.** Both lanes edited `Manuals/` from
the same base and both allocated revision numbers from it: develop took 13/14/15 (#361, #364,
#386 stage 1), workbench took 13/14 (#370, #371). **Rev 13 and Rev 14 each named two different
changes.** That is the session-label collision #339 fixed, one artifact over, with the same
root cause — a counter that requires cross-lane coordination the lanes structurally cannot
have, since a worktree cannot see its siblings. Renumbering workbench's rows to 16/17 would
have resolved *this* collision and left the mechanism in place for the next one. Tying the
number to releases removes the class: **between releases there is exactly one pending row, so
there is nothing to allocate twice.** The cost is that a single row now describes several
changes, which is what the (a)–(f) structure absorbs, and the revision table stops being a
change log — `CHANGELOG.md` and this file already are one.

**Consequence for future manual edits:** do not open a new revision row. **Extend Rev 13's.**
The next release rolls it to 14 and starts a fresh one. Recorded in `CLAUDE.md`'s status
section, because a rule that lands only here has not landed.

**Second decision, smaller: a declared simplification was corrected rather than carried.**
Workbench's `12 §12.17` (#370) declared that this simulator has no containment at all;
develop's #386 stage 1 built containment pressure, temperature and sump the same day in the
other tree. Merged as written, chapter 12 asserted both. The §12.17 row and the `12 §8.5`
sentence that points at it now state the true position — the signal exists (§12.4d), nothing
protective reads it yet (#386 stage 2). **Withdrawing a claim that stopped being true is not
designing**, which is what made this safe to do inside a merge; anything that changed plant
behaviour would not have been. Owner-approved before the merge began.

**Gates.** `run_all` 38/38 at baseline, one tracked red (`run_ops` 58/69, unmoved). The three
keys both lanes moved were measured, not added: `run_behavior` **60pass 1xfail**,
`run_contract` **156**, `run_hardrules` **192** — the first two additive because the probes
and `true_state` fields are disjoint, the third not, because it counts citation sites and the
revision collapse *deleted* six rows' worth while the write-ups added more.

---

## 2026-08-06-workbench-a — #378: a fix that measures perfectly and is rejected anyway

**Decision.** The rod-channel limit cycle (#378, audit #297 F9) has a fix that works — cancelling
in-flight `rod_nudge` travel at the kernel's deadband exit takes a 100→50 MWe step from
13.78 pts p2p forever / never settling to 2.03 pts / settled at 14.6 min — and it is **not
shipped**, because it takes TR-1i's sourced WTSM 8.1.1 ramp duty from 4.34 to **5.26 °F against
≤ 5.00**. The uncancelled overshoot travel has been silently helping the bank chase a sliding
Tref: the sourced duty is met partly by the defect. That was the plan's pre-declared reject
criterion, applied as written. pvTau fails the same band at every value tried (0.2–3.0 s,
measured across two sessions); `kd` makes the cycle worse (measured, prior diagnosis). What
ships instead is **TR-18 as a strict xfail** — the settling probe, injection-verified in both
directions, pinning the open defect so it cannot be quietly forgotten or quietly "fixed" without
the XFAIL entry moving in the same change.

**Why record a rejection here.** The natural next attempt is one of the two things now measured
dead (filter the PV, add derivative) — and the actually promising variant (gate the cancel on a
stationary program, so step-settling cancels and ramp-chasing keeps its travel) needs the full
verification pass a wrap-up session could not give it. It is filed on #378. Full measurement
tables: `Diagnostic/TUNING_LOG.md` 2026-08-06-workbench-a.

**Session end state, for the merge** *(OWNER, 2026-08-06: "I want to merge develop and workbench
before they drift too far apart. Get yourself into a good stopping point for a clean merge.")*:
lane committed and gated; #377, #379, #380 and the §8.30 row remain open on this lane per the
2026-08-05 "Workbench takes everything left" ruling.

---

## 2026-08-05-workbench-i — #371b: an absolute patch is a time bomb under a generated file

**Decision.** `pwr_board_data.js` is GENERATED from the owner's diagram export, so every correction
the driver makes lives in `DOC_PATCHES` instead. Those corrections were written as **absolute**
tops and lefts. This re-export proved that is the wrong form: the owner moved the pressurizer up
40 px and the condenser left 208 px, and because each patch re-asserted the old absolute number,
the board silently put both tiles back where they used to be. The owner saw it immediately — *"The
condenser is shifted to the right. the pressurizer is shifted down."*

The trap is that both patches were **still correct in intent**. The pressurizer one is a +3 px
nudge that levels the spray stub; the condenser one is a −2 px nudge that squares the hotwell drop
onto a pump flange the 5 px doc grid will not let meet it halfway. Deleting them — the first thing
I did — traded a visible 208 px error for two invisible 2 px leans, which is a worse outcome
because only the ruler in board_check can see it. **Re-derived, not deleted**: `authored + delta`,
with the arithmetic written at the patch so the next re-export shows its working instead of
silently re-displacing a tile.

Three more patches were genuinely spent and are gone: two CVCS caption sizes whose readouts the
owner replaced with a different tile kind, and a feed-rate reposition the owner has now authored
into the diagram directly.

**Retired, not re-homed: the labelled STEAM DUMP readout (`imrzmlyafa3`).** The export drags it to
(1247, 875) — clear of every card, 90 px below the lowest content, and the sole reason the board's
bounding box grew an empty band that shrank every other tile. In the same export the owner added a
right-anchored % tag beside the condenser dump valve, matching the new ADV and turbine-flow tags.
Dragging a tile off the canvas while placing its replacement on the schematic is as explicit as an
export gets. Carrying both would have put `steam_dump_valve` on the board twice under two labels.

**What this costs and what it buys.** Two board_check pins go with it (−2, 211 → 209), and they
are DELETED rather than repointed: a tile-fit assertion against an item that no longer renders
passes forever and asserts nothing. Everything else the re-export moved was **re-pinned**, not
dropped — four pipe ids where one header became four, five item ids, two re-measured runs, and the
rod-card spacing re-solved against the new card height (3g = 19 again, so the same 6/6/7 rhythm).

**One near-miss worth recording.** Adding a second `imrpk8169ds`-style spacing block created a
duplicate key in the `DOC_PATCHES.items` object literal, which silently replaced ROD AUTO's colour
entry and un-greened the button. The file carries a comment warning about exactly that hazard,
nine lines above where I put the duplicate. The gate caught it; the comment did not, because I
wrote before I read. The existing block was edited in place instead.

---

## 2026-08-05-workbench-h — #371a: the valve ships shut, and that is the design

**Decision.** Atmospheric dump valves — a condenser-independent steam path, upstream of the MSIV and
outside the C-9 interlock. Capacity 0.10, setpoint 8.60, both UNVERIFIED and declared (§8.34).
Measured: 579.3 → 359 °F (304 → 182 °C) in three hours with no condenser, against §8.29's record of
four plant-hours with no cooldown at all. §8.29 RETIRED.

**Default SHUT is the load-bearing decision.** Shut, the term is identically zero and the plant is
byte-identical — the null test confirmed the entire suite unchanged but for the two contract
fields. AUTO at 8.60 would have quietly removed the SG code safeties from every bottled-generator
evolution the sim teaches, which is a large re-baseline hidden inside a feature. The declared gap
was "there is no controlled cooldown path"; a lever the operator reaches for closes it without
rewriting anything else.

**The capacity argument is worth keeping.** 0.10 is chosen so the ~55 °C/hr technical-specification
limit is achievable AND exceedable — measured, a fully-open ADV cools at −165 °C/hr, three times the
limit. #375 had just given the board a cooldown-rate meter and annunciator; sizing the valve so it
cannot break the limit would have made that instrumentation decorative. The valve and the meter were
designed against each other.

---

## 2026-08-05-workbench-g — #370c: a protection that extinguishes its own signal, and two rows that could never have armed

**Decision.** Automatic main steam line isolation: `sg_steam_flow > 1.25` coincident with
`steam_pressure < 5.20` closes the MSIV, latched-sealed against operator reopening until the
generator recovers past 7.0 MPa. §8.28 RETIRED. Three parts of the real function are declared
rather than built, each for a measured reason: no containment path (§8.31 — nothing to sense),
a fixed rather than load-programmed flow setpoint (§8.32 — no impulse-pressure signal), and
**no lo-lo Tavg leg (§8.33), because it cannot arm on this plant**.

**The three findings worth carrying forward.**

1. **A sourced row can still be dead.** The lo-lo Tavg leg is in the source and would have looked
   right in the config forever. Measured, it never fires: break flow scales with the pressure it
   destroys, so flow has decayed before Tavg falls. Building it would have shipped protection that
   reads as real and does nothing — the "condition that can never arm" trap, arriving via the
   sourced design rather than a mistake.
2. **The transmitter saturated inside its own casualty.** A 1.2 span against a true 1.75 draw meant
   every break above ~40 % read identically, and the 30 % break sat one thousandth from the
   setpoint. A gauge that cannot resolve what its protection discriminates on is the defect, not
   the setpoint.
3. **A seal-in that tracks a live signal is useless when the action removes the signal.** Closing
   the valve stops the flow that closed it, so the refusal evaporated in the instant it engaged —
   measured, the operator reopened one second after actuation and the break resumed unprotected.
   Latching on the fired latch with a physical release (pressure recovered) is the fix; the
   general lesson is that self-extinguishing protections need a latch, and the kernel now has one.

**Content moved, physics stood.** `pwr_slb`'s decision beat and two `run_m7` stimuli all assumed a
plant that never isolates. Prompt tripping on a large steam line break is what a real plant does,
so the scenario severity and the test stimuli moved (HR9), each with its reason written in place.

---

## 2026-08-05-workbench-f — #370a: the break that removed no mass, and the lane that started green on purpose

**Decision.** The main steam line break becomes a MASS FLOW in `steam_out` instead of a `dP/dt`
sink applied after the pressure integral. Flow = `STEAM_BREAK_RATE / K_steam_pressure × size ×
min(P/P_rated, 1)`, so `STEAM_BREAK_RATE` stays the single knob and the equivalence is structural
rather than a comment. The break now drains the SG, is visible to the feed controller, and — the
reason this had to come first — makes `sg_steam_flow` RISE during a break instead of falling.

**Why the order matters.** Automatic steam line isolation reads high steam flow. On the old plant
that signal moved the *wrong way* during the casualty it exists to detect, so building the
isolation first would have been protection reading a fabricated relationship — the #220/§8.24
defect class wearing a new costume.

**Proof, not assertion.** A 12-case × 7-sample matrix is byte-identical when the new flow feeds
only the pressure integral, which isolates the arithmetic from the new couplings. The divergence
that remains is the couplings themselves, measured and tabled in TUNING_LOG.

**Lane start.** Merged `7a40b9a` (last green develop) deliberately, not `develop`'s tip, which
carries another session's in-flight #364 work at 5 red runners across the four files this campaign
edits most. Recorded here so the eventual merge sees a deliberate choice rather than a stale lane.

---

## 2026-08-05-develop-i — #386 stage 1: the containment building exists

Ruled Tier 3 *(OWNER RULING, 2026-08-05: "Tier 3 for 386.")* — pressure + heat removal +
hydrogen, staged, each stage landing green. This entry is stage 1: the lumped volume and the
live backpressure. Planned against `inbox/TURNOVER_containment_planning.md`; the plan was
approved and the H₂ combustion question ruled the same day *(OWNER RULING, 2026-08-05:
selected "TMI-2-style burn" from three options put to him — one-time deflagration pressure
spike + latched event, containment holds; indication-only and end-state rejected. A
selection, not verbatim words)* — that ruling BINDS STAGE 3, recorded here so it is not
re-litigated when stage 3 starts.

**Decisions taken, and why:**

- **Hosted in `pwr_primary.js` (`stepContainment`, step 14c), not a new file.** A new engine
  file costs ~25 per-runner load-list edits (every `test/run_*.js`, `ui/shell.html`,
  `test_pwr.html`, the portable build); the receiving volume of the primary's discharge
  belongs beside the break law anyway. Step 14c makes every source same-step fresh; the two
  consumers read one step stale (CONTEXT §11), which breaks the algebraic loop.
- **The flash gate is the model.** Q0 sweep (TUNING_LOG 2026-08-05-develop-i): with unlimited
  RWST a LOCA is sustained feed-and-bleed, 36–229 RCS masses in 30 min — unbounded — but the
  flash-weighted steam yield (cp·ΔT/h_fg ≈ (T−T_sat)/540, a physical ratio) is BOUNDED at
  3.3–5.2 units, saturating as the ECCS quench takes the source below flashing. Without the
  gate the model rises forever; with it, pressure peaks on the hot blowdown and decays.
- **`press_gain` 0.08 is fitted and says so** — no document in any lane's corpus gives a free
  volume. Anchors: design pressure 0.515 MPa abs (60 psig) by citable inference (WTSM 5.0's
  "approximately half of design pressure" against WTSM 12.3's 30 psig spray setpoint).
  Measured grading: full break peaks 41 psig (⅔ design — the licensing-margin shape), only
  breaks ≥ ~25 % rated reach the 30 psig spray point, everything crosses 3.5 psig in minutes.
- **The spans stay config-fixed; only the Δp numerators go live.** The orifice coefficients
  are rated-flow-at-rated-Δp calibrations (#334 leg A depends on the break one); CA-17
  asserts the exact law — live numerator over config span — pointwise.
- **SGTR is excluded from the source sum** and CA-16 leg B pins the exclusion: the tube
  rupture discharges into the SG, the one break that bypasses containment. Dropping the gate
  reads 0.2278 MPa where ambient is required — that is the diagnosis lesson, guarded.
- **No PRT, no recirculation, indication-only sump** — declared at `Manuals/12` §12.4d rather
  than implied. The new declared row went in as **§12.4d** (the break-discharge family), NOT
  §12.19, deliberately: both lanes have collided on §12.17/§12.18 already and workbench's
  uncommitted work claims §12.19; a family letter cannot collide at the merge.
- **No board readouts in stage 1, Physics tab only.** Workbench holds uncommitted edits to
  all three board files; the Physics tab is the conflict-safe observability route, and the
  board half lands with stage 2's controls after the merge. `ui/manual_data.js` regeneration
  is likewise deferred to stage 2 (it would touch the same generated surface the board work
  regenerates).
- **Injection-verified three ways with distinct signatures**: `press_gain: 0` reddens 4
  CA-16 checks; dropping the SGTR gate reddens leg B alone; reverting the two live reads
  reddens all 3 CA-17 checks — the pre-#386 engine exactly.
- **Gate movements** (all measured): `run_behavior` 56 → 58 (CA-16, CA-17), `run_contract`
  151 → 154 (+3 fields both ways), `run_pwr` 241 → 242 (containment save-migration assert),
  Manuals Rev 13 (collapsed by the 2026-08-06 lane merge). `run_meltdown` 12, `run_scenarios` 3/3, `run_inspect` 47/47 unmoved —
  for a change to break/relief backpressure, the flagship not moving is the number that
  matters (the relief Δp change at 16 MPa is < 0.1 %).

**Stage 2 (blocked on the workbench merge):** upstream-SLB source, fan coolers + spray as M4
actuations (SI 3.5 psig unblockable, spray 30 psig sealed-in), board readouts via a new
gauge-pressure unit family (`MPa2psi` is absolute — 0.125 MPa would read "18 psi" instead of
3.5 psig). **Stage 3:** H₂ from the existing `_zr_ox2` oxide state (BUILD_DECISIONS 2026-08-03
called it "the hook for if containment lands" — it is), 10 CFR 50.46 1 %/17 % anchors,
recombiners, and the ruled burn. **Then #384**, which stage 1 deliberately does NOT attempt:
a rising backpressure only reduces break flow (CA-15 stays green), and the ECCS/break balance
at low Δp is #384's own coupled plan.

## 2026-08-05-develop-f — #364 decay-heat refit + #365 collapse: the fallout was the finding

Batch 4 of the #296 plan, ruled a REFIT rather than the declared departure the plan and I both
recommended *(OWNER RULING, 2026-08-05: "I think we should re-fit the decay heat curve for several
reasons one this is going to be used to train engineers and some of them are nuclear engineers and
will nitpick this if it's not correct two I need to redo all of the missions anyway they need a
complete redo so I am not worried about it messing up missions.")*. **The ruling was right and the
cost estimate was wrong**: the retune took one session, and `run_campaign` never broke at all.

**The decision that mattered was the TARGET, not the fit.** Two independent NRC primaries that
cross-check — ML050910161 Table 8-3 (ANS 5.1-1971 fission products in closed form, 0.1 s…2e8 s) and
ML021720702 Table 2 (actinides, as the difference) — **divided by 1.2**, because that multiplier is
a licensing margin and this is a simulator of a plant, not an ECCS evaluation model. Four groups is
the knee of the fit (3 → 11.8 %, 4 → 4.86 %, 5 → 3.31 %). The old two-group curve measured **142.5 %
maximum relative error** against that target.

**#365 collapsed in the same change** *(OWNER RULING, 2026-08-05: "365: collapse.")* — one constant,
the fork deleted, a retirement note left saying how to re-split properly. Zero new reds.

**THE ADJUDICATION IS THE ENTRY.** Eleven probes went red and every one was taken individually
(HR10), which is the only reason two genuine defects surfaced instead of being bulk-rebanded away:

- **A stale two-group copy of the decay law inside `meltdown_pwr.js`**, computing the oxidation
  anchor. It read 0.0000 % and failed a `q_ref` that was correct — and the comment directly above
  it promised the check "tracks the decay groups instead of silently going stale". #315's shape, in
  a probe written to guard against exactly this.
- **`thermal.clad_steam_h` was a constant fitted against the wrong curve.** It sits on the cooling
  side of a balance whose heating side is decay heat and its own comment states its job as deciding
  which uncoveries damage. Re-solved 1.0e-4 → 4.0e-5: **2.5× down against a 2.4× drop in the heat
  input**, i.e. tracking the other side of its own balance rather than fitting a probe.
  `perturb_sweep` first, per the house rule — ±30 % flips no verdict in either suite.

**Three probes were pinning the old defect and are now better tests.** MD-11's band check required
a monotonic escalation that only held while decay heat was overstated. TR-7b's indication checks
asserted a leg split that was 2.4× too big — the corrected plant reads 1.33 °F with 2 of 250 samples
inverted by noise, against #315's defect at 48.3 %, so the guard still discriminates by two orders
of magnitude. And CA-13's station-blackout carrier stopped working because **the plant got better**:
with real decay heat the turbine-driven AFW now wins and an SBO no longer heats at all.

**Two of my own probes from earlier today had bugs the refit exposed**, both the same mistake —
using a proxy where the engine has a predicate. CA-15 snapshotted on the clipped gauge
(`pzr_level_pct >= 99.9`) where a qualifying sample had `levelRaw` = 99.91, i.e. not solid.

**The browser gates were real consequences.** Natural circulation moved 4.47 % → 3.64 % (W ∝ Q^⅓),
under the pipe-animation ladder's 0.04 floor, so the board painted a stopped primary loop in a
blackout — the exact distinction #350 item 18 built that ladder to show. A 0.02 step was added.
`verify_e2e_ui`'s feed-tracking tolerance was **tightened** while re-deriving it: a flat 15 gpm band
was 23 % of a 64 gpm draw and would have been 79 % at 19 gpm, so the absolute form had been
loosening itself every time the plant carried less heat.

**Post-trip timings are now the more prototypical ones** and that is the headline for a trainer:
station blackout to core damage **2.6 h**, total loss of heat sink **2.4 h**, against under 2 h
before — TMI-2's core damage began around 2.5 h.

## 2026-08-05-develop-d — #361: the solid regime was measured through one hole

Batch 3 of the #296 fix plan, and the last engineering item in it.

**The decision is that this is a DOUBLE COUNT, not a missing term**, which is what makes it a
one-predicate fix rather than §12.4c's deferred three-term regime. `leak_depress` models a
bubbled plant: liquid leaves the break, the steam bubble expands into the space it vacated,
pressure falls. With no bubble that mechanism does not exist — and the break's mass is already
carried by the surge driver, because `stepInventory` adds RELIEF back out of `dm_surge` and
deliberately does not add the leak back. Counted twice it was 0.938 MPa/s against ~0.26.

**§12.4c POINTS TOWARD THIS RATHER THAN FORBIDDING IT, and the distinction is recorded at the
change site** because the next reader will check and could easily conclude the opposite.
§12.4c's refusal was about folding RELIEF into the surge, which moved the relieving equilibrium
DOWN, put the plant further below the ECCS shutoff head and un-deadheaded injection — the defect
by another road. This removes a subtractive term when solid, so the equilibrium moves UP; and
`leak_depress` is not one of the three terms §12.4c defers (relief, spray, heaters), all of which
keep their steam-space gains here as that note requires.

**WHY #346 AND #347 MISSED IT, which is the transferable part.** Both were measured on a
stuck-open PORV with the block valve isolated — a STEAM-SPACE vent, where `leak_flow` is 0 by
construction. On that path `leak_depress` is identically zero and the solid gain has nothing to
fight, so it worked, and the in-code arrest claim was generalised from it. It does not
generalise: the defeating term exists only when liquid is leaving, i.e. the whole LOCA family.
This is #315's lesson in its exact original shape — a term that is an identity in the regime you
test in is a term nothing tests — with `leak_depress` as the identity.

**THE FIX PLAN'S PREDICTED ARREST MECHANISM WAS WRONG AND THE MEASUREMENT SAYS SO.** It expected
the relief ladder to cycle with injection throttled, on the arithmetic that `porv_open_mpa`
(2350 psi) sits below `hpi_pressure_ref` (2384 psi). Measured, `porv_open` is false throughout
and pressure settles at 326 psi: a plant with a hole in it does not repressurize, and the
equilibrium is injection matching break flow at low pressure. The relief ladder arrests CA-12's
isolated path, which is a different event. Written into the CA-15 baseline note so the two are
not conflated again.

**Hysteresis was considered, measured, and NOT added.** The plan names it as the remedy if the
boundary chatters, and it does — 41 102 crossings in 135 000 steps at severity 1.0. But the
chatter is not new (21 679 pre-change) and the per-step excursion is less than half what shipped
(p95 18.47 → 7.10 psi), and it is not observable: `spray_flow_pct` is a flat 0 through the
settled window and pressure ripples 1.1 %. Hysteresis costs a tuned constant, a persisted state
field, a migration default and a §6.3 entry for a ripple no player can perceive — DESIGN_CRITERIA
Q4 answered in the negative. Recorded rather than left for someone to re-derive.

**CA-15 guards it** (`run_behavior` 55 → 56): 3 checks red on injection with the injected run
reproducing 120.00 % exactly, and 2 calibration checks green on both engines — a bubbled plant
must still depressurize on the same break, or the gate could be satisfied by deleting the term.
The settling point is computed from the level geometry rather than transcribed: 109.28 % measured
against 109.28 % predicted.

**`primary.mass_max` finally has a derivation comment**, and it says the honest thing: there is no
physical ceiling at which an RCS stops accepting mass, only a pressure at which relief opens, so
1.2 is a numerical guard whose job is to be unreachable. Reaching it is a bug by definition, and
it hides itself — the clip also truncates `m_surge`, so `_dmass_dt` goes to zero at the ceiling
and the surge driver stops seeing the mass piling up.


## 2026-08-05-backshop-a — #382: the audit's independence mechanism had never been used

**CORRECTED IN PLACE, same session.** The first version of this entry claimed *"no slice has ever
run under the mechanism"*. That is **false** and the correction is the more interesting finding —
full table in `Diagnostic/TUNING_LOG.md` 2026-08-05-backshop-a.

**What is actually true.** The exclusion mechanism has been exercised **twice and verified working**
by the charter's first-turn check: slice 2's attempt 1 was caught primed and aborted *before any
finding*, and its clean re-run reported *"First-turn priming check: PASSED"*. Slice 3's findings
runs were also unprimed. What has **never** worked is the **`--settings` flag route** — every
successful run got there through `.claude/settings.local.json`, which layers by default and needs no
flag. #297's *"launched bare"* means *without the flag*; I read it as *primed*. Different facts,
and the auditor's first-turn check is exactly what separates them.

**The error has a shape worth keeping.** I reasoned about my own priming state from inside the
session — "CLAUDE.md is in my context, therefore the harness loaded it" — when in fact
`settings.local.json` is in force in this tree and I had simply *read the file myself* on turn 1.
**A session cannot establish its own priming state by introspection.** That is why the first-turn
check is phrased as a question about what the harness did, not about what the agent can see, and I
wrote that sentence into the charter this same session without applying it.

**DECISION: FILES, NOT SKILLS** *(OWNER RULING, 2026-08-05, #383: "Let's do it with the files not
the skills.")* — #383 option 1, and the session's third design for the same problem.

The mechanism is the per-tree `.claude/settings.local.json`: `workbench` and `backshop` are
**audit lanes** where the exclusion layers by default, so a fresh session or a `/clear` there is
already unprimed. `develop` keeps the flag route. The three skills and both wrappers are **deleted**;
the procedure lives in `AUDIT_CHARTER.md` §11 (before/after, explicitly not for the audit session).

Two reasons beyond the owner's preference, both load-bearing: a skill's `description` is injected
into **every** session's prompt including an auditor's, so the skills were a priming surface bought
for nothing; and two documents describing one process drift, which is exactly how #297's *"launched
bare"* got read three different ways in a single day.

**`tools/audit_preflight.js` survives with a real correction**: it defaulted to checking
`settings.audit.json` — *the file an audit lane never loads*. It now resolves whichever file is in
force and reports how the current tree launches. Validating the file named after the job instead of
the one in force is the same class of error the script exists to catch.

**The hook leak (#383 item 1) is closed and A/B-proven.** `tools/hook_lane_status.js` reads
`.claude/settings*.json`, and in an audit lane prints `#361 [status-wip-develop] (title withheld —
audit lane)`. Proven on the real code path with a fixture row and the settings file temporarily
renamed: withheld in the audit lane, `PWR: a large-break LOCA walks inventory to the 120 % mass_ma`
in the normal one. Unreadable settings report **`unknown`, never `off`** — this hook's own header
already carried that rule. A `--settings` flag remains invisible to it, and it says so: a process
argument is not state on disk.

**The hazard is now recorded in TRACKED files** — `CLAUDE.md`'s lane table and the charter header.
Its only prior record was a comment inside a gitignored file, in the one tree already reverted.

**Decision: make the launch refuse, rather than document harder.** `tools/audit.cmd` /
`tools/audit.sh` are now the one launch path and run `tools/audit_preflight.js` first, which exits
2 and names the cause. The raw `claude --settings ...` form stays as a named fallback, with a
written prohibition on using it to get past a preflight failure.

**Check-selection rule: every preflight check is one whose omission yields a clean-looking audit,
not a red.** Settings parse; `autoMemoryEnabled === false`; every tree from `git worktree list`
carries its `CLAUDE.md` in `claudeMdExcludes` verbatim in both slash directions; the settings key
names still exist in the installed CLI; charter present; slice issue open with a `SUBJECTS TO TEST`
section (#221 process step 1, checked rather than assumed).

Three sub-decisions worth the record:

- **Verbatim comparison, not glob evaluation.** Re-implementing the CLI's picomatch semantics to
  test `**/grok_build/**/CLAUDE.md` would place a second, differently-buggy matcher in front of the
  first. The explicit per-path entries are what must hold; enumerating trees from git means a
  fourth worktree fails loudly instead of leaking.
- **The CLI-schema check exists because an unknown settings key is ignored in silence.** A rename
  at upgrade would degrade the audit to a bare launch that still prints a `--settings` flag.
  Measured: both keys present in `@anthropic-ai/claude-code@2.1.222`. Binary is 279 MB → chunked
  scan with overlap.
- **Asymmetric verdicts.** Not locating the CLI is a note; locating it and not finding the key is a
  hard failure. Absence of evidence is not evidence of a rename.

**Injection-verified** (#376's rule): green in 1.4 s; red with the right cause on a removed tree
path, `autoMemoryEnabled: true`, unparseable JSON, and a bogus slice number, all on scratchpad
copies via `--settings=<path>`.

**What the wrapper structurally cannot do, now written into the charter and the skill.** Preflight
runs outside the session it protects — it proves the configuration, never the session. The
auditor's first turn must state on the slice issue whether `CLAUDE.md` was **auto-loaded without it
reading the file**, phrased that way round because the Read tool can open `CLAUDE.md` at any time
and *"can I see it"* answers a different question with a misleading yes.

**`.claude/skills/audit-slice/SKILL.md`** saves the procedure and branches on whether the session is
primed (print the launch line, stop, do not read the slice's code) or is the auditor. Its
`description` is injected into every session's prompt **including the audit session's**, so it names
no subsystem, finding or gate score — the skill is inside the blast radius of the rule it enforces.
It also states the limit: a skill cannot launch a session with different settings, so wrapper,
skill and self-check are three parts of one mechanism and none substitutes for another.

**Batch-file trap, re-learned.** The first `audit.cmd` was LF-only and UTF-8; `cmd.exe` re-read it
in a loop and emitted 2.5 MB of `'his' is not recognized`. `tools/make_portable.cmd` already carried
the ASCII half of the warning in its header. Now ASCII + CRLF, verified with `file(1)`.

**DECISION: the skills go AROUND the wrapper, not inside it — a `/clear` workflow was proposed and
measured down** *(OWNER, 2026-08-05: "Why not make a skill that sets things up and then I can clear
that conversation… We could have another skill that restores the work tree. What are your thoughts
on this?" → "Let's do it your way.")*.

The proposal — prep skill moves `CLAUDE.md` aside, `/clear`, audit in the same window, restore skill
puts it back — fails on a measurement available in the session that proposed it: **that conversation
opened with a `/clear`, and `SessionStart` fired immediately after**, printing a WIP-tagged issue
*title* naming a plant defect into the fresh context. `/clear` clears conversation history and
nothing else.

Three priming channels; a skill closes one and a half. Conversation history — `/clear` handles it.
The `SessionStart` hook — a skill could disable it. `CLAUDE.md` auto-load — a skill could move the
file. **`autoMemoryEnabled` is a process-level setting, so no skill running inside the process can
change it**, which is the structural reason the design cannot be completed rather than merely
tightened.

Moving `CLAUDE.md` adds three failure modes the settings exclusion does not have: the file is
TRACKED, so the audit tree goes dirty in a way the lane sweep reads as a live agent and a commit
could swallow the deletion; restore depends on a *later* conversation running a skill, with no state
linking them and nothing to put the file back if the window dies; and it revisits a design the owner
proposed on 2026-08-04 and that was ruled against then in favour of the exclusion. The automation
makes it more convenient, not safer.

**So: `audit-prep` → `tools\audit.cmd <slice>` in a NEW WINDOW → `audit-close`.** The two new skills
are scoped to what a primed session can uniquely do. `audit-prep` refreshes the slice's SUBJECTS TO
TEST list — a list of exactly what a primed session can see and an auditor cannot, so no other
session can write it — and records the commit + `run_all` state the findings are measured against,
so a pre-existing red is not filed as a finding. `audit-close` triages into issues with the four
axes and maintains **the convergence table #221 asks for and nothing has ever tracked**, carrying
each slice's independence verdict read off the auditor's self-check comment; **a slice with no
self-check counts as primed**, because inferring it was fine from a thorough-looking slice is the
inference the mechanism exists to replace.

---

## 2026-08-05-develop-c — #367: buoyancy is not a pump, but a coasting rotor is

Batch 2b of the #296 fix plan.

**The decision is the SUBTRACTION rather than a `pump_running ?` switch.** Shaft-work heat was
scaled by `flow_frac` outright, and natural circulation carries flow while doing no shaft work — so
a stopped RCP kept depositing pump heat, at a fraction that GREW (0.55 % of core heat at rated,
0.85 % at 2 h, 2.57 % at 24 h) because decay heat falls faster than buoyancy flow does. But a
plain gate on `pump_running` would have thrown away the coastdown, where the flywheel really is
doing work on the fluid (WTSM 3.2, ML11223A213 p. 3.2-17). Taking `flow_frac − naturalCircFlow`
keeps it and is **continuous by construction**: `stepFlow` decays flow toward the buoyancy value,
so the difference decays with it and established circulation gets exactly zero. No step at the
handover, and **no new state field**, so no §6.3 / `run_contract` obligation — `naturalCircFlow`
is already a pure exported function and is called same-step.

**THE GUARD'S FORM WAS SET BY A MEASUREMENT, NOT A PREFERENCE.** The plan asked for a 24 h
post-scram before/after; it is **identical to every printed digit**, because a plant with a working
heat sink puts the phantom heat straight out through the SG while the dump holds Tavg on
programme. Remove the sink and it appears as 0.7 °F at 30 min growing to 1.7 °F at 3 h — real,
directional, and far too small to band without pinning a tuning. So the guard is at the mechanism:
two clones of the settled natural-circulation state through `stepCoolant` differing only in
`pump_running`, a flag `stepCoolant` reads nowhere else, so the entire `_dTavg_dt` difference is
the term — 0.00017398 °C/s now against **exactly 0** before. A first draft recomputed the term
inside the probe and therefore read identically on both engines; a copy of the formula tests the
copy.

**Two adjacent sites with the same shape are deliberately LEFT, and the reason is recorded at the
site so it is not re-derived.** The governor's `extractFrac` scales the same constant by raw
`flow_frac`, but its wrong regime requires pumps stopped AND the turbine on line, which this plant
cannot reach — measured, securing the RCPs at power scrams on the #314 breaker-position trip at
31 s and the turbine is tripped with `mwe_output` 0 by t+1 min. The steam generator's
`(1 + pump_heat_frac)` is a rated-condition normalizer, not a flow-scaled term.

**No on-hold twins filed, and that is a measured negative rather than an omission** (#239 set the
precedent of filing them): RBMK and BWR have no pump-heat term at all, and no `leak_flow`
flash-cooling term either, so #363 has no twin there either.

## 2026-08-05-develop-b — #363: one break, two halves, one regime test

Batch 2 of the #296 fix plan.

**The decision is that this is a GATE, not a retune.** Flash-cooling removes latent heat, so it can
only act at saturation; `stepPressure` has gated its half of the same break on `saturated` all
along, and the temperature half ran on `leak_flow > 0`. The two are now the same test, written in
each file's own currency (`trueSubcooling(s) <= 0` against `P_sat(Tavg) > P`) with the inverse
relation recorded at the site rather than a second copy of the formula imported across the seam.
The one deliberate difference is the boundary — `<= 0` includes exactly-saturated, where flashing
does occur, against the pressure side's strict `>` — a measure-zero disagreement on the physical
side of the line.

**Neither `[tune]` constant moved, and that was checked rather than assumed.** `blowdown_gain` and
`blowdown_sink_c` are calibrated against a two-point criterion (≤8 % SGTR holds the plateau above
600 psi; the 20 % LOCA crosses below the 4.14 MPa accumulator setpoint). Re-measured after the
gate: **2267 psi** and **3.94 MPa** — unmoved. SGTR is identical to three significant figures at
2/5/8 %, because that path stays subcooled and the term was barely acting on it. CA-14 leg D now
**asserts** that criterion instead of leaving it as a claim in a comment.

**THE FILED DIAGNOSIS NAMED THE RIGHT DEFECT AND THE WRONG DRIVER, which is the entry worth
keeping.** #363 reported a 2 % break sitting 378 °F (210 °C) subcooled. Gating the blowdown moves
that by **15 °F**. The dominant cooling there is the **ECCS cold-injection quench** — a separate
term, correctly *un*gated, because cold water mixing removes sensible heat whether or not anything
is boiling — i.e. unterminated injection, #361's family. The gate's real effect is only visible
with ECCS defeated: the old engine ends 55.8 °F (31.0 °C) subcooled and still falling with the core
melted, and spends 1194 of 2358 late-drain samples more than 9 °F (5 °C) subcooled, against 0 of
2358 after. **Isolate the neighbouring term before crediting a fix with a symptom.**

**The config's small-break narrative was false and is rewritten in three sites.** It credited
`Psat(tavg)` with holding pressure above 600 psi; measured, Tavg reaches 240.9 °F (116.1 °C) where
`Psat` is ~25 psi. The **heaters** hold that pressure (0.55 MPa/s against 0.21). Right behaviour,
wrong mechanism — the failure mode slice 2's key question exists to catch.

**CA-14, and three drafting traps recorded at the site** (`run_behavior` 53 → 54; 3 checks red on
injection, 4 green on both by design). A test datum at `tavg_c` 110 °C sat exactly on
`blowdown_sink_c`, so the term evaluated to zero and the check **passed against the ungated
engine**. A run-wide `max` of subcooling measured the initial condition (the plant starts 41 °C
subcooled) and failed on both engines — the `h.range()` trap, landing in the same session it was
rescued into `CLAUDE.md`. And a void check drafted from the full-stack final state was **cut** as
not robust: peak void is 1.00 on both engines and the final value 0.00 on both, because the void
line is gated `trueSubcooling <= 0` and a state a whisker either side of saturation is a coin toss.

## 2026-08-05-develop-a — #362/#365/#366/#368: a clip nothing could see, and three claims that expired the day another change landed

Batches 0 and 1 of the #296 fix plan (the #221 slice-2 audit findings).

**#362 — `levelBase`'s undocumented upper clip at 100 is removed.** It bound at Tavg 611.6 °F
(322.0 °C), *inside* the subcooled range at NOP, and contradicted the written contract of both its
consumers. The lower `level_prog_floor` clip stays (deliberate, #289); `levelProgram` re-clips at
both ends so the CVCS programme band is unmoved; `stepLevel` still clips the GAUGE 0..100, so
indication now pegs at 100 and reads *going solid* instead of parking on 61.5.

**The decision worth recording is why this needed a NEW PROBE rather than a repaired one.** Removing
the clip moved **no runner**. Measured incidence per sample beforehand: 95.7 % of a loss of heat
sink and 87.9 % of a station blackout, and **0.0 %** of hot full power, large LOCA 0.5, small LOCA
0.05, SGTR 0.25, stuck-open PORV, `cold_shutdown` and `hot_zero_power`. The clip lived exclusively
in the hot-and-drained corner — a LOCA drains and *cools* — and nothing in the battery was standing
there. A green suite was not evidence the clip was harmless; it was evidence of where the suite
does not look.

**CA-13 is a probe and not a CA-12 leg because the two "solids" are different states.** CA-12 gates
on level-at-top AND overfilled AND no void — right for an ECCS fill, and it *excludes* this event,
which reaches solid at an inventory DEFICIT of 94.39 % with nothing added, by thermal expansion
alone. Injection-verified: restoring the clip reddens 4 of its 6 checks (base line 144.5 → 100.0 %,
peak indicated 100.00 → 82.44 %, solid samples 790 → 0, PORV duty 0.8 → 0.0 %); the other two are
calibration guards that pass on both engines and say so. `run_behavior` **52 → 53**.

**Two checks were cut from it, both for failing to discriminate**, and the second is the more
instructive: a #347 no-bubble-no-spray check passed on **0 of 0 samples**, because a blackout stops
the RCPs and spray takes its motive head from the loop, so spray is 0.00 % on both engines. That
gate is unobservable on this path *by construction*. It is named in the probe as not-covered rather
than quietly dropped — covering it needs a solid plant with the pumps running.

**The init copy of the level algebra is gone.** `pwr_engine`'s state literal restated `levelBase`
inline; it calls `PZ.stepLevel` over the finished state now, so init and step 8 cannot differ.
Bit-identical across all five ICs, measured against the HEAD files.

**#365 (partial) — the piecewise slope branch is an identity and the comments now say so.** Both
constants have been 776 since #330. The claims that a surplus "reads ~3× steeper" are retired, and
the guard was added where one was missing: CA-9 leg B pinned the two through `levelRaw`, but
`stepPressure`'s `surge_rate` takes the same piecewise where no gauge can see it. Injection-verified
— splitting the surge branch alone reddens the new check while both level checks stay green.
**Collapsing the branch is deferred behind #361**, which reworks that line; keeping it means a
future split is deliberate rather than silent.

**Three CVCS figures were 7.76× stale from the day #330 landed**, all direct products of
`level_per_mass`. Measured off the shipped config, not recited: orifice-A drain **16.8 %/min**
(documented ~2), max charging **33.5 %/min** (documented ~13), make-up loop τ **10.7 s on both
branches** (documented 83 s — the pre-#330 deficit figure, and #330's own note already carried the
new number without this site being updated to it).

**#366 — `primary.void_onset` deleted**, zero readers repo-wide. It was not merely dead: it
misdescribed the physics it appeared to set, under a shared heading with two live constants.

**#368 — the DNB datum is documented as the mixed-mean core exit; NO CONSTANT MOVED.** The comment
claimed the hot channel. `dnb_margin_c` is `[tune]` and scenario-arbitrated, so it plausibly absorbs
the nuclear enthalpy-rise peaking factor implicitly — and that factor is **unsourced** (WTSM 19,
ML11223A342, carries the term as a Tech Spec heading with no value), so re-deriving the threshold
would have been recall dressed as fidelity. Documentation only, in four places including
`Manuals/12` §10.7 (Rev 7).
## 2026-08-05-workbench-e — #375: make the error visible, not impossible — and cap flows with physics, not bookkeeping

**Decision.** A derived cooldown/heatup-rate instrument off indicated Tavg, ±100 °F/hr
annunciators (PWR-A34/A35, not Mode-4/5-reclassified), and the dump's mass flow scaled by
upstream pressure (`min(P/P_rated, 1)`). No automatic rate limiter — the owner's chosen
increment keeps the gross cooldown makeable and makes it loud, which preserves the teaching
case a hard limiter would delete. `run_reachability` 65 → 68 (two alarms + a Part B leg that
drives the indicated rate past the setpoint).

**The rejected first cut is the record-worthy part.** Capping total `steam_out` by water
inventory fixed the empty-vessel fiction but blocked a dry bottled SG from venting its steam
dome — the solid-plant probe CA-12's peak crept to 119.83 % against its 120 % ceiling guard,
exactly where the perturb sweep had flagged fragility. The pressure-scaling form is physical
(choked flow dies with its driving pressure), touches only the blown-down regime (factor ≡ 1
at and above rated — CA-12 back at 109.35 % exactly), and the F7 evolution becomes
self-arresting at the operator's setpoint. A conservation fix that adds a bookkeeping clamp
where the model wants a physical dependence breaks the regime the clamp cannot see.

---

## 2026-08-05-workbench-d — #372: the calibrated constant was two physical things wearing one number

**Decision.** `latent_heat_secondary 19.45` is split at the rated point into latent + feed
sensible duty (`feed_sensible_frac 0.12`, steam-table derivation in the config), with
`feedwater_temp_c 227` (UNVERIFIED — no in-tree primary; evidence-pass class) and `afw_temp_c
40` (inside the sourced WTSM §5.7 40–120 °F band). The rated point is algebraically identical;
overfeed now overcools and AFW is a real heat sink — measured both ways. The follow governor's
`extractFrac` mirrors the split, because its old heat→steam identity left follow mode with no
equilibrium off the rated point (SS-6 caught the secular walk: 8.03 → 6.89 MPa over 36 min,
then a trip). TR-1b re-pinned from both sides (burst ≥ 15.80 visible, PORV < 16.20 holds);
TR-1g's endpoint sample replaced with a 120 s trailing mean (it was reading the #378 limit
cycle's phase, not the claim — mean 51.2 on a 50 ask, both plants).

**Why a split and not a new model.** The four questions: Q0 measured (the null response was
the finding); Q1 — the mechanism is textbook and the AFW temperature is sourced, the feed
temperature is not and says so; Q2 — a whole Chapter 15 transient class (overcooling) becomes
reachable with visible board cues; Q3 — zero new player-facing controls, silent. The split
preserves every calibrated behaviour at the rated point by construction instead of re-fitting
the plant, and DESIGN_COMPANION §8.27 declares what it deliberately does not buy (load-
dependent feed temp, heater train, MSRs, the loss-of-feedwater-heating casualty).

---

## 2026-08-05-workbench-c — #373: one constant was doing two valves' jobs, and a test was green because of it

**Decision.** A turbine stop-valve path, separate from the governor: `stop_valve_frac`
spring-shuts on `turbine_tripped` (`stop_valve_tau 0.15`, UNVERIFIED [tune] — the mechanism is
WTSM §7.3 verbatim, the number is not) and multiplies steam flow. `governor_tau 2.0` keeps the
load-control job unchanged. TR-1b rewritten positively (the PORV lifts on the trip burst — the
leaked steam that used to suppress it was the defect); TR-2 re-scoped to the post-burst window
its claim is actually about. Both re-specifications fail on the pre-#373 plant by construction
and are declared as such (HR10).

**Why the probe moves are not refits.** The audit measured the counterfactual before any fix
existed: at prototypical closure the RCS peak crosses the PORV setpoint (rig: 16.28; on-tree
after: 16.26), so TR-1b's "no PORV lift" was pinning a non-event — the same trap that
rewrote TR-1's PORV check positively at the 40 % dump change. The plant's relief ladder is
unchanged; the trip burst simply reaches one rung now that a tripped machine stops drawing
steam.

---

## 2026-08-05-workbench-b — #369: a spring safety senses nothing, so nothing it senses can fail

**Decision.** The SG code safety pop/reseat moved from a control-layer actuation reading the
`steam_pressure` instrument to the engine, on true pressure (`pwr_steam_generator.js`). The
`open_sg_safety`/`close_sg_safety` commands are gone; the actuation row is gone; the engine
harness no longer emulates the pair. Probe TR-16 pins both legs (`run_behavior` 53), and
`run_reachability` drops to 65 — the row it lost moved below the instrument layer.

**Why.** Audit #297 F2, measured: one stuck transmitter carried a survivable MSIV closure to
clad melt — 2696 psi (18.59 MPa) on a valve set to pop at 1350 psi (9.31 MPa), reachable from
the shipped Failures tab in two clicks. The 2026-07 "protections in-stack" ruling is for things
that SENSE — trips, instrumented relief logic — and a code safety is opened by the fluid
itself; that independence is why it is the backstop. HR1 does not require the old placement
(the audit's HR11 read of the uncited ruling stands). The teaching lever lost — failing the
safeties from the Failures tab — is a lever a real plant does not have either.

**Boundary.** The pressurizer spring safeties have the identical structure on
`primary_pressure` and are NOT moved: slice-2/4 audit scope, wants its own issue and its own
measurement rather than a "while I'm here" (HR12).

---

## 2026-08-05-workbench-a — #376: a measurement that cannot fail is not a measurement

**Decision.** `measure_stack` treats a rejected `--cmd` and a `--cmd` scheduled past `--for` as
hard errors (exit 2), matching its own unknown-`--watch`-field convention; `ops_harness.cmd()`
records `type:'refused'` alongside `error` so `checkSanity` can see it; the behaviour probes
that built harnesses `checkSanity` never inspected (TR-8, TR-1f b/c, TR-1c lo, TR-1e B–E) now
inspect them.

**Why hard error and not a warning.** The failure is asymmetric in the worst direction: a
swallowed command produces a plant where nothing happened, which reads as "the mechanism is
fine" — a false negative indistinguishable from a real null result. The audit (#297) nearly
published one. A warning is exactly the ambiguity CLAUDE.md's "COULD NOT CHECK is not clear"
rule names; the engine's unknown-id guard (`pwr_engine.js`) was already loud, and the harness
was the one swallowing it.

---

## 2026-08-04-backshop-d — #357: the word "still" was telling me the base was stale

**Decision.** Eight owner-filed board items, all done. Auxiliary pipes take live temperatures;
coolant green/orange darkened a step; the spray-flow readout moves above PZR TEMP; u-tube and valve
dashes take the fluid colour; the pressurizer's internal spray runs are anchored to the canvas dash
grid; the SG FEED RESTORE button fits its caption.

**THE PROCESS FINDING IS WORTH MORE THAN ANY OF THEM.** #357 says *"valves STILL have the light
colored dashes"* and I worked four items before noticing what "still" implied: **#350 had already
landed on `develop`** and had touched every file I was editing — including INVERTING the pipe
bore/flow convention, which two of my fixes and all of their comments were written against. The
session-start lane sweep checks tags and uncommitted files; I checked the tag on #350, noted an
agent was in `develop`, and never ran `git log develop`. **A lane tag tells you someone is there. The
log tells you what they have already done, and for feedback-shaped issues that is the part that
matters.** Merged `develop` in, dropped the stash, re-applied each fix against the real base.

**A free-slot scan that returns ZERO is usually the scan being wrong.** Item 4's target column
returned no 95x40 gap, then no 100x30 either — while PZR TEMP and HTR PWR are visibly sitting in it.
The scan treated the `pressurizer` COMPONENT TILE as solid: 108 px of box around much narrower art,
with both existing readouts inside it. Component tiles have to be excluded from the obstacle set
(their art is caught by the path pass); then the column measures, and 1088,348 at 90x38 is clear.
95 wide is not — the STEAM card starts at x 1180.

**Item 6 was mis-diagnosed in the issue and the measurement says so.** Reported as a dash SPEED
mismatch; measured at 1.04 s per period and 22.69 px/s on both the internal and external spray runs,
at five viewports from 1024 to 2560 wide. The defect is PHASE — the internal runs passed no
`phaseX/phaseY`, so their dash grid was anchored to the pressurizer's tile instead of the canvas, and
the vertical leg sat half a period out. Equal speed, different phase, at a joint, reads as different
speed. Same fix `comp_tee`/`comp_cross` carry for #233.

**One defect nobody filed, found while auditing item 2:** the charging pair was authored BACKWARDS —
102 °C on the pump suction against 60 °C on the discharge returning to the RCS. Letdown and charging
discharge read `tcold` now; tank-sourced runs read `emergency.eccs_temp_c`, the constant the quench
term already uses, so a pipe cannot disagree with the physics.

`run_all` **38/38**, `verify_board_check` **205**.

---

## 2026-08-04-backshop-c — #348: a fudge band, a stale sampling assumption, and a missing EOP step

**Decision.** The 17 % heater cutoff gets the reset differential its own sibling already has
(`heater_restore_level_pct: 20.0`). `pwr_sgtr` gets the SI-termination step its strategy depends on.
CA-11's rig and CA-10's check are re-authored, and `saw` takes a list.

**The heater latch is a defect fix, not a refinement, and the check was hiding it.** CA-10 excluded
a 1-point band below the cutoff, documented as tolerating the step-7/step-15 coupling lag. Measured,
the interlock had no differential at all and chattered: **499 of 1425 below-cutoff samples (35 %) at
full heater power**, runs up to 8, all between 16.3 and 17.0 %. The band excluded it *by
construction*; #337 moved level faster, the chatter reached past the band, and only then did anyone
look. The differential is this plant's own — WTSM 10.3 §10.3.4.1 has ONE bistable at 17 % doing two
things, and the letdown half is already `reset_below: 20.0`. Two outputs of one bistable cannot
reset differently. Now 4 violations, longest run 2, one per ECCS refill cycle; the check asserts the
STREAK, because a count would pin the number of cycles.

**CA-11 was not wrong about the physics — its SAMPLING assumed a plant that no longer exists.**
#334 sampled "2 s after injection, before the RCS has moved"; #337 made that false. Re-rigged, the
claims come out stronger: a small break on the first engine step anchors the calibration at
**0.21 % off rated** (was a 26 % miss on a 6 % band), and a full-size break gives worst pointwise
error **0.00 %** over 1800 samples with exponent **0.500**. The exponent's two points are now the
ends of the blowdown plus an asserted **span ratio**, rather than fixed pressures — those had gone
MISSING, i.e. the check had stopped asserting anything and said so.

**`pwr_sgtr` was missing SI termination.** Its strategy is to close the ΔP; with injection running
that cut break flow by **0 %** and drifted the plant toward solid. Securing first: **84 % in one
minute**. The step is real EOP content, added to the checklist, `Manuals/07` and `STEP_UI` in one
change. CLAUDE.md's standing note that securing injection "DAMAGES the core at that severity" was
measured false on this tree and corrected — it predates #346/#347.

**`pwr_stuck_porv` step 1 is the #209 class caught in the act.** Its `acc` was an end-of-hold
subcooling value, and the layers no longer agree on any end-of-hold value: **−5.2 °C** engine-direct
against **+36.6 °C** stacked. Only the transient is layer-robust — and it is also what the step
teaches, so the honest form and the robust form are one sentence. Hence `saw` as a list: a step can
legitimately carry more than one during-the-hold claim, and this one's are the only claims it has.

**`run_all` 38/38 at baseline** — the first fully green tree since #337 merged.

---

## 2026-08-04-backshop-b — #347: a scenario that never asked the player the question the accident asked

**Decision.** The TMI-2 beats are RE-ORDERED to match the plant's causal chain, and the flagship's
historical HPI securing moves from the damage branch (after the decision) to its own beat on its
historical cue, before it. `pwr_qualify`'s graded window arms on the pressurizer going solid rather
than on a subcooling alarm that no longer sounds.

**Why it was broken is one sentence.** The beats armed `subcoolAlarm` ahead of `hpiAuto`, but
injection auto-starts at T+3 s and the margin does not move until injection is SECURED. That
ordering only worked because the pre-#346 plant discarded its ECCS overfill and drained regardless
of injection; correcting the plant made it load-bearing and blocked nine missions.

**The re-order is not a repair, it is the lesson.** Full injection beats one stuck-open relief
valve — measured, 109.3 % inventory and 149 °F of margin held indefinitely — which is precisely
why the 1979 crew securing it is what caused the accident. The flagship previously asked the
player to *start* injection that had been running automatically for two minutes; it now enacts the
securing on the PZR LEVEL HIGH alarm and asks the real question, **restore it or not**. In Part 3
the confusion beat is reached from the COMPLIED branch alone: refuse the order and there is nothing
to be confused about. The old plant could not express that asymmetry, because it drained either way.

**#346 WAS NOT FINISHED, and `pwr_qualify` is what found it.** On the exam's win path — the
candidate correctly isolates the block valve — inventory ran straight back to the 120.00 % clip.
Measured: spray pinned at its 0.120 cap held pressure at 2320 psi, **164 psi below the code-safety
setpoint**, so the safeties could not lift and nothing arrested the fill. Spray controls pressure by
condensing the steam bubble and a solid pressurizer has none. #346 declared that a simplification;
it is load-bearing, and the declaration was wrong rather than generous. Gated at solid: the isolated
path holds 110.3 %. The HEATERS carry the same argument and are deliberately untouched — they are
already zero in this regime, so the term is unobservable, and their authority is ruled (F14).

**Both probes that moved pass on the pre-change engine.** `run_autoctl`'s pressure-setpoint probe
was passing only because spray was credited with authority it does not have — its own comment
already said the rig ends "with the pressurizer solid". It now secures SI first, which is the
operator action (E-1), and lands on 15.41 MPa exactly; A/B'd against the pre-gate engine, 30/30.
CA-4's flooding check was my own knife edge from the #346 session and now reads `range().max`.

**Cost: none outstanding from this pass.** `run_campaign` 51/51 (3017 → 3023 checks, no new checks
written — six missions that could not reach `level_complete` now do), `run_scenarios` 3/3,
`run_autoctl` 30/30. The remaining reds are the non-TMI half of the #337 cascade (CA-10, CA-11,
`run_procedures`, `run_procedures_stack`), untouched and verified unmoved.

---

## 2026-08-04-backshop-a — #346: the bubble is the compressibility, so losing it has to change the gain

**Decision.** The pressurizer gets a **water-solid regime**. When the level line reaches 100 % the
surge→pressure gain steps from `K_surge_level` (a pressurizer with a steam bubble) to
`solid_bulk_mpa / level_per_mass_surplus` (a pressurizer full of liquid). One factor, one law, same
currency. `primary.mass_max` is unchanged at 1.2 and stops being reachable on this path, which is
what #330 already said it should be.

**Why a gain and not a ceiling.** The filed defect is that `mass_max` discards ECCS overfill, so the
instinct is to move the ceiling. Measured, that does nothing: at 3.0 the plant runs to **300 %
inventory** with pressure still parked in the PORV band. The clip was hiding the real gap, which is
that the plant had no concept of being solid at all — the surplus level slope IS the steam-space
slope (#249 derives it from the 720 ft³ bubble), and it was still in force with the bubble gone.

**`solid_bulk_mpa` = 1300 MPa/frac is a physical constant, not a fit.** A solid RCS is a fixed
volume of liquid, so dP = B·dm/m and the gain per inventory fraction IS the isothermal bulk modulus
of the coolant — ≈ 1.3 GPa for water at ~300 °C / 15.5 MPa. **The internal check:** the same
argument on the steam side has to reproduce the shipped `K_surge_level`, and it does — isothermal
bubble compression gives 15.4 × 9650/720 = **206 MPa/frac** on #249's own geometry against the
shipped **310**. Two independent routes agreeing to within 50 % is what makes the *ratio* — solid
≈ 4× stiffer — something other than a choice of which number to trust.

**F15's premise fails at solid, and taking only that third of it is WORSE than taking none.** F15
excludes relief from the surge because the valves "release steam from the steam space"; with no
steam space they pass liquid, which is a real displacement. That variant was built: relief folded
into `dm_surge` when solid, steam-space gains standing down. Measured, it drops the relieving
equilibrium ~145 psi, which puts the plant below the ECCS shutoff head, injection out-runs the PORV,
and inventory walks back to the 120.00 % clip — the defect returning by a different road. The same
argument applies to **spray** (nothing to condense) and the **heaters** (no bubble to flash), so
the correct version is a coupled three-term regime plus a re-solve of `K_porv_relief` /
`K_safety_relief`. Declared at `Manuals/12` **§12.4c**, not attempted here.

**Guard.** `run_behavior` CA-12, five legs. Leg B computes the settling inventory **from** the level
geometry rather than transcribing it — 109.35 % measured vs 109.28 % predicted — so a retune of
`level_per_mass_surplus` or `level_prog_floor` moves the expectation with the plant. Leg D is the
calibration guard and passes on the old engine by design (a bubbled plant must be untouched); leg E
is the not-a-rescue guard. Injection-verified: the pre-#346 gain reddens **4** checks.

**Two probe-authoring traps, and the first is the one worth keeping.** "Solid" is not
`pzr_level_pct >= 100`: the **void term pegs the same gauge at 100 % on a boiling, half-empty
core** — the TMI deception, the exact opposite of solid — and this plant transits it here with the
PORV at 55 % duty, so gating on level alone left every leg-A check green against the very engine
they exist to exclude. And a window placed at t+80 min is still inside the ECCS refill, which
swings pressure 161 psi on **both** plants; at t+100 min they read 0.0 % vs 18.0 % PORV duty.

**Cost, and it is not paid here.** `run_scenarios` 3/3 → 1/3 and `run_campaign` 48/51 → 42/51, all
TMI-2. The flagship's decision point was resting on this discard — with `_mass` pinned the surge
could not push back and the PORV term ran unopposed to **52 psi with the inventory gauge reading
120 %**. The new behaviour (unthrottled injection matches a stuck-open PORV and the plant holds) is
the TMI-2 counterfactual and is right; the scenario is missing the crew's 1979 throttle-back.
**#347**, recommended as a re-author, explicitly not as a physics weakening.
## 2026-08-04-develop-m — #350: the board was drawing the DEMAND where it should have drawn the FLOW

27 items off the owner's board-and-shell list. The engineering decision underneath most of them
is one sentence: **a synoptic diagram shows what the plant is DOING, and this board was drawing
what it had been ASKED to do.** Pumps spun on their run command, pipes animated on their fittings'
opinion, the PORV relief line ran water because that is how it was authored, and the vital strip
recoloured on a raw comparison. Full measurements in `Diagnostic/TUNING_LOG.md` 2026-08-04-develop-m.

### The decision: one flow number per SYSTEM, not per element

Item 10 asks for the dash velocity to track flow. **#231 already tried that and reverted it** —
folding a component's own rate into its velocity made every fitting run at a different speed from
the pipe it joins, and the dashes stepped at the joint. That constraint is real and the revert was
right; what was wrong was the level the number lived at.

`lineFrac()` computes one fraction-of-rated per TRAIN (17 of them), and every pipe, tee, cross,
valve and pump on that train reads it. Two elements that meet are on the same train by
construction, so they cannot disagree — the #231 failure mode is not mitigated, it is unreachable.

**Each entry is one LINE's own flow, and that is load-bearing rather than tidy.** It is what lets
`pipeFlow`'s run-state REPLACE the port gate instead of being ANDed with it, which item 18 needs:
with the RCPs stopped the pump art correctly reads stopped and pulls its ports down, while
`rcs_flow` still measures 4.47 % of buoyancy-driven flow through those same pipes, and the
instrument is the better evidence. The first cut lumped the steam dump in with main steam, which
under an authoritative run-state would have drawn a shut dump valve passing full flow at power.
`board_check`'s existing #236 pins caught it before it shipped, which is the argument for those
pins.

### The trade the quantisation buys

A dash-speed change is a **discontinuity that cannot be removed**: CSS computes progress as
`((now − delay) / duration) mod 1`, `now` grows without bound, so retiming moves the dashes by an
amount that depends on how long the page has been open. Three options were available — accept
continuous jitter, abandon live speed, or quantise. Quantising onto a ladder with hysteresis means
a line re-times only when it genuinely changes band, the hop is at most one dash period, and every
element on that system hops together because they all read the one number. `setFlowSpeed`
re-derives the delay from the stashed world phase so the re-timed run lands back on #233's dash
grid rather than drifting off it.

### The colour inversion is a convention change, and it propagates

*(OWNER DIRECTIVE, 2026-08-04: "invert the colors on the pipes so the darker color is the dashes
showing water movement.")* `phaseTempColor` now returns the fluid colour at full strength as
`bore` and the darkened form as `flow`. That flips the meaning of a pair every component in the
board kit consumes, so the sense had to be corrected wherever a component used them: water and
steam BODIES take `bore`, anything that MOVES takes `flow`. Eleven components touched. Two places
were already correct and deliberately left alone — `comp_tee` and `comp_pressurizer` write
`kids[1] = bore, kids[2] = flow` onto a `K.pipe` stroke stack, which is the kit's own order.

The dash mix is 0.55 toward black where the old bore mix was 0.74: against a full-strength bore,
0.74 is invisible at the cold end of the ramp. Item 12 (the reactor's downcomer streaks) fell out
of the same change once those streaks stopped being a hard-coded `#7fb0dd` — they were the one
water surface on the board that did not track temperature.

### Item 1 needed a new published quantity, and the scaling belongs in the engine

Delivered spray was a local inside `stepPressure`. It differs from `spray_valve_pct` in two ways
that are both physics the operator has to see — no RCPs means no motive head, and the authority
taper closes it out near saturation at the core-exit temperature. Published as
`true_state.spray_flow_pct` → `instruments.pzr_spray_flow`.

**Scaled by `spray_flow_max` in the ENGINE, not on the board.** The constant that makes the
percentage mean anything lives in that layer, and a formula copied into a consumer does not move
itself when the constant is retuned (#315). The instrument is appended last with `noise: 0` and a
`noise_failure` sigma, per the appended-instrument rule; verified in `pwr_instruments._noise`,
which returns before drawing when sigma ≤ 0, so no PRNG draw is added and the existing sequence is
byte-identical.

### Two gates added, both because the property is hand-maintained

`run_inspect` **42 → 47**. Three checks assert every Physics-tab row carries scanner copy and that
`buildPhysics` actually emits it; one asserts every system acronym is spelled out in the entry that
uses it; one anchors the physics block. The rows and the entries are both hand-maintained tables,
which is the #224 shape exactly — a new row would otherwise arrive silently uncovered. The acronym
check is injection-verified (revert one expansion → red, naming the entry) and it immediately
earned its keep by catching a brief pushed to 146 characters past the collapsed-block cap.

`run_inspect` also had to learn about `DOC_REMOVE`: it reads the generated board doc statically, so
without filtering the driver's deletions it demands inspection copy for a tile nobody can point at.

### What was NOT done, and why

**Item 8's third clause.** During a blackout `feed_sg` keeps integrating against a plant it cannot
move and winds `feed_pump_speed_pct` to its 120 % rail, so the SG feed gpm box shows a demand
nothing can deliver. That is integral windup in the shared control kernel, not a board defect, and
patching the board to hide it would be the wrong layer. The board half — `bdMfwRestore` reading
green "selected" while main feed was isolated, when yellow "needs attention" is what an isolated
main feed is — is fixed.

**Unit symbols in the acronym pass** (psi, gpm, ppm, pcm, MWe, MWt, cps). Left alone: they are
units, not acronyms, and the unit directive says units keep their standard spelling. That is my
reading of a directive whose example was a system name, so it is flagged for owner review rather
than presented as settled.

### Gate state

34 of 38 runners at baseline. `run_contract` 147 → 148, `run_inspect` 42 → 47 and `verify_board_check` 194 → 205 are this change.
The other four drifts — `run_behavior` 48/3, `run_procedures` 28/29, `run_procedures_stack` 27/29,
`run_campaign` 48/51 — were MEASURED identical on a stashed clean tree and are #337's open
re-author, not absorbed here.

## 2026-08-04-develop-l — #221: excluding the priming instead of swapping the file

**Decision.** An audit slice runs with `claude --settings .claude/settings.audit.json`, which sets
`claudeMdExcludes` (the repo `CLAUDE.md` across all three trees) and `autoMemoryEnabled: false`. It
reads `Blueprint/AUDIT_CHARTER.md` instead — `CLAUDE.md`'s operating half with the diagnosis removed.

**Why not the file swap the owner proposed.** Two reasons, and the second is decisive. (1) It misses
the case #221 RoE 1 actually cites: the priming that fooled slice 1 was an auto-loaded MEMORY, not
`CLAUDE.md`. (2) It removes the competence with the priming — the lane rules, HR12, the units
convention and the which-layer map RoE 3 depends on all live in `CLAUDE.md`, and an auditor without
the gate baselines cannot distinguish a red it found from a red it caused. Mechanically it is also
worse: `CLAUDE.md` is tracked, so a swap leaves an uncommitted modification the lane sweep reads as
occupancy, in three trees, with a restore step to forget.

**The baseline is handled by a redirect.** The charter tells the auditor to establish the
pre-existing state by RUNNING `run_all`, because the baselines are data in the `BASELINES` map while
a score with its history attached is a finding. Verified mechanically: the charter contains zero
score-shaped strings.

**Declared ceiling.** This cannot be fully defeated. Source comments, `Diagnostic/`,
`BUILD_DECISIONS` and the issue threads all carry conclusions, and stripping them would change the
artifact under audit. What is removed is the unsolicited, always-on layer; the charter's opening
rule does the rest by putting every piece of repo prose on trial as a CLAIM UNDER TEST.

**Unverified in-session** — both switches take effect at session start, so the settings file carries
its own first-thing check. **A glob that failed to match looks exactly like a clean audit**, which is
why the check is written down rather than assumed.

**Recommended before relying on it:** run slice 2 primed and clean and diff the findings. #221's
claim that priming matters is itself `INFERRED`.

---

## 2026-08-04-develop-i — #341 / #319 item 2: a protection function is not protection if the operator can switch it off

**Decision.** Actuations may declare `seal_in`. While such an actuation's condition is currently
satisfied, an operator command that would **undo** it is refused (`type: 'blocked'`,
`code: 'SEAL_IN'`) with a register-aware message. The PWR's three main-feedwater isolations all
carry it. A **MFW RESTORE** button on the SG FEED card is the operator's way back.

**Why.** Main feedwater isolation latched with no control to clear it (#319 item 2 — a state the
player could enter and not leave), and separately, a restore issued by *any* path was accepted while
the isolating signal was still standing (#341). Measured full stack: restore 10 min into a post-trip
ride with Tavg parked at 567.5 °F (297.5 °C) against a 572.0 °F (300.0 °C) setpoint — accepted, feed
back at 0.3076, SG level 36.58 → 77.43 %. `actuationFired[i]` is the retentive memory, and since a
fired actuation never re-fires, nothing contested the restore. The #295 F1/F2 class.

**Shipped as ONE change on purpose.** The guard alone would protect a command no player can send
(unreachable, so unfalsifiable — the reason #332 left RHR alone); the control alone would ship a
defeatable protection function.

**Sourced.** WTSM 12.3.2.3 (ML11223A310): *"The control room operator cannot interrupt any of the
SI-initiated functions until the reset logic is satisfied. This 'locking out' of the operator
prevents the interruption of a valid SI actuation."* WTSM 11.1.4 (ML11223A293) lists the four
overrides of SG level control and the first is *"Manual control by the operator"* — the RESTORE
button is that override, not a convenience. WTSM 12.3.6.1 confirms the three automatic signals map
exactly onto this plant's three.

**DECLARED DEPARTURE.** The real reset needs a 45–60 s time-delay relay plus P-4, and is a separate
pushbutton that removes the start signal *without realigning anything* — two steps. This plant
collapses it to one: refused while the signal stands, allowed once it clears. There is no SI-reset
control on this board at all, and adding a timer plus a second pushbutton for the two-step dance is
Q4 user complexity with no dynamics behind it. The refusal teaches the same fact.

**Two design points that are not decoration.**

*The predicate is shared, not re-written.* `_sealInBlocking` asks the same question `_evalActuations`
fires on — same `arm`, same `condition`, same `crossed()` — so the refusal and the actuation cannot
drift. "Undo" is disagreement with the actuation's own asserted `params`, which keeps the kernel free
of any plant action name (HR3; `run_hr3` unmoved at 28/28).

*The re-arm is what stops the fix becoming a new dead end.* A sealed-in actuation with no
`reset_below` clears its fire latch when its condition clears — otherwise, after a legitimate
restore, a second valid signal could never re-isolate and the protection would work exactly once per
session. It issues no command, matching the source. `reset_below`, where present, remains the sole
authority, so no existing hysteresis band moved.

**What it creates.** Trip → rods seat → reset RPS (clears P-4, so the low-Tavg signal clears) →
restore accepted. That gives `reset_rps` — one of #319's three orphaned engine capabilities,
"required after every scram, and named by no checklist" — a real consequence. Restoring full feed
into a recovering generator then overfills it and re-isolates on P-14 at 12m01s, which is the
dynamics lesson rather than a rough edge.

**Board.** Only the control was missing: the SG FEED corner status word already reads ISOLATED
(`feedStatus` on the `feed_sg` stand-down, whose `offWhen` is `mfw_isolated`), so a dedicated lamp
would be Q4 duplicate authority. Geometry measured off the doc — the y=600 row holds only the
feed-rate number at x=1740, leaving 1670..1735 free for a 55×25 button in the authored idiom;
nothing was moved and `verify_board_check` stayed at 194. The button is deliberately **not**
disabled while the signal stands: a readable refusal teaches, a greyed-out button is
indistinguishable from a broken one.

**Gate:** `run_m4` 38/38 243 → **39/39 257**. Injection-verified three ways — refusal removed 4 red,
`seal_in` dropped 2 red, re-arm removed 1 red. That last one was a **hollow check** until rewritten:
it first tested re-arm on the P-14 actuation, which carries `reset_below: 85` and re-arms in a
branch that runs first, so deleting the new code left everything green. The discriminating leg
drives the SI isolation, which has no `reset_below`.

**Open, named:** no manual entry for the RESTORE control (`Manuals/03` §3.5), and no procedure step
names it — PWR-T06 post-trip is the home, and would give `reset_rps` its checklist step too.

---

## 2026-08-04-develop-g — #339: the session label names the LANE, because a per-day letter needed three trees to agree

**Decision.** Session headings in this file and `Diagnostic/TUNING_LOG.md` are
`YYYY-MM-DD-<lane>-<letter>` *(OWNER RULING, 2026-08-04: "Work issue 339 in develop. Go with option
2.")*. Lane = the worktree (develop / workbench / backshop); letter = the next unused for that date
**in that lane**, `-a` first, never bare.

**Why, and it is not tidiness.** Both files are cited by their dated headings — that is what the
suffix is *for*. Measured across both in full: **17 labels name more than one entry** (10 here, 7 in
`TUNING_LOG.md`), including `2026-08-04b` ×3 and `2026-08-03d` ×3. The old scheme allocated one
letter per **day across all lanes**, so its correctness depended on three sessions in three trees
agreeing on who got `b` — and a worktree cannot see another's uncommitted file. It was also out of
room: `2026-08-04` unsuffixed sorts *above* `2026-08-04a`, leaving no letter below `b` for a third
lane without renumbering upward.

**The departure, declared.** Option 2 as filed has no letter (`2026-08-04-develop`). Measured, **25
sessions landed on 2026-08-03**, ~8 per lane — so a bare first entry collides *within* a lane on day
one, and session two must either rename session one (the retro-rename churn option 2 exists to
avoid) or start at `b` with no `a`. The letter is therefore mandatory. The lane still does what the
ruling asked: no agent ever has to know what another lane chose.

**Not retro-renamed**, by the same ruling. The 17 legacy collisions stay as the record of the day
three lanes landed at once; `run_session_labels.js` reports them and never fails them. Enforcement
is a date cutoff — labels dated 2026-08-05 or later must be lane-form.

**Gate:** `test/run_session_labels.js`, NEW, **8 checks** (4 structural per file), `run_all` 37 → 38.
Baselined on the count rather than on failures because the checks are structural and the file list
fixed — the count moves only when a check is added, not when a session is appended.
## 2026-08-04i — #345: the gate checked the table's shape and never read the chapter

**Claim.** `run_manual_rev` could not see a lane merge that drops manual content a revision row
claims. Verified by reading it, not inherited: the only `readFileSync` touching a chapter pulled
the `**Revision:**` stamp (`test/run_manual_rev.js:92`). Shape, stamp, digest, pack — no body text.

**Why the digest check cannot cover it.** The two failures are opposites. The digest catches
*content changed with no row*. The merge case is *a row whose content went away* — and the digest
is **re-sealed by the merge**, so it agrees with the surviving text and passes. Measured
reproduction: drop the `### 5.5` heading from chapter 12, add a row claiming `**12 §5.5**`, run
`tools/stamp_manual_revision.js`, and the pre-fix gate is **fully green on the digest**.

**Decision — canary on what a row NAMES, not on what it SAYS.** Rows already carry
chapter-qualified refs. Requiring each to resolve keeps the check structural, which is what makes
it gateable at all; the file header's exclusion of prose accuracy (HR10/HR12 class) is narrowed,
not crossed. *"Does §5.5 exist"* is structural. *"Is §5.5 correct"* is not, and stays out.

**Three design calls, each measured rather than reasoned.**

| Call | Why | Evidence |
|---|---|---|
| Heading **OR** register table row | Chapter 12's §12.0 holds declared simplifications as a numbered table, so `12 §12.4b` is a row | `grep -E "^#+ *12\.4"` on chapter 12 returns **nothing** while the ref is live and correct — heading-only reddens a clean tree |
| Chapter-qualified refs **only** | Bare `§X.Y` points variously at a Blueprint doc, `CONTEXT.md`, or the chapter under discussion | **44** bare refs in the 26-row pre-zeroing table; resolving them guesses and reddens correct rows. Qualified: **11 of 11** resolve there, 1 of 1 live |
| **One** check, not one per ref | A per-ref count moves the baseline on ordinary manual work | exactly why `run_manual_units` is not baselined at all |

**The anti-hollow guard is the 15th check and injection is what earned it.** Changing the ref
syntax made the canary pass reading `0 refs resolve` — green while asserting nothing, the
coverage-claim failure this repo files under *"prove it by injection"*. The parser must now
positively find refs.

**Injection-verified three ways:** break the live ref → canary red, naming it; unqualify the ref →
guard red at 0; full re-seal reproduction → **digest green, canary red**.

**Gates.** `run_manual_rev` **13 → 15 checks / 0 failed**, `BASELINES` moved in the same change.
No `Manuals/*.md` content touched, so no revision row owed — the digest check confirms that.

**Standing obligation this creates:** write revision rows **chapter-qualified**. An unqualified
row is a row the gate cannot guard, so `CLAUDE.md`'s "grep the chapter after a merge" instruction
is narrowed, not retired.

---

## 2026-08-04h — #334 item 2: a break is an AREA, and that is the whole decision

### The change

`pwr_primary.stepInventory`'s leak branch: a LOCA's discharge now follows √Δp against
containment instead of holding the constant it was given when the break opened. Two config
constants (`break_p_ref_mpa`, `break_backpressure_mpa`), new probe **CA-11**, CA-10 leg E
re-authored, `run_behavior` **50 → 51**, `Manuals/12` §12.4b, manual set **Rev 1**.

### The decision: the source redefines what the severity slider IS

10 CFR 50 Appendix K I.C.1.b requires *"a discharge coefficient applied to the postulated break
**area**"*. That is not a detail about the flow law — it says a break is an **area**, and the
flow is an *output* of the area and the upstream state. This plant stored severity as a flow
(`severity × meta.max/100`, labelled "% rated flow") and used it directly, which is why the idea
of a break that responds to pressure never came up: a flow you assign has nothing to respond
with.

Reframing it as an area with a pressure-driven discharge is what makes every downstream
behaviour fall out — the break weakens as you depressurize, an RCS at containment pressure has
stopped discharging, and closing the ΔP is a real operator action rather than a ritual.

### Why √Δp and not Moody, stated as a departure rather than absorbed

Moody's critical mass flux is a function of stagnation pressure **and enthalpy**. This plant has
one lumped primary node and tracks no steam quality at the break, so Moody has nothing to be
evaluated against here — implementing it would mean inventing the quality it needs, which is a
fitted number wearing a citation. √Δp is the incompressible orifice law, it is **already the form
`letdownFlow` uses** for orifice discharge out of the same RCS, and it is derivable rather than
fitted. Declared at `Manuals/12` §12.4b with the direction of the error stated: √Δp falls off
**faster** than Moody once the discharge flashes, so a real break stays stronger for longer.

### The reference point is what kept the blast radius at one runner

`break_p_ref_mpa` = 15.41 makes the pressure factor exactly **1 at the operating point**, so every
break size still means its old rate at nominal conditions and only the depressurized end of the
curve is new. After a change to how every primary break discharges, `run_meltdown`, `run_pwr`,
`run_campaign`, `run_procedures`, `run_ops` and `run_scenarios` were all at baseline. Choosing a
reference that preserves the existing calibration is the difference between a physics fix and a
retune of everything downstream of it.

### CA-10 leg E was re-authored, and the distinction matters

Its old criterion — break rate above the ECCS capacity ⇒ core destroyed — is a **steady-state**
argument, valid only while the break is constant. Once discharge tracks pressure, a break that
starts above the ceiling ends below it, and the comparison decides nothing. It was not *broken by*
the fix; its premise stopped being a property of the plant. Re-pointed at what must remain true:
**ECCS is what saves the core** — same break, injection defeated, must still destroy it. That is
the property the old leg was actually protecting, expressed in a way the new physics cannot
trivially satisfy.

### The probe trap: a check that recomputes the implementation cannot fail

CA-11's first central check re-derived the engine's own formula and compared against it. It
reported **"worst error 0.00 %"** — which is the tell. It pins the *reference constants* but is
blind to the *shape*, so it would have survived any change that kept the form and moved the
exponent. Replaced with the #325/TR-15 idiom: solve `n = ln(q₂/q₁)/ln(Δp₂/Δp₁)` from two widely
separated points on a real blowdown. Measured **0.500**; injection gives **0.000** for a constant
law and **1.000** for the linear SGTR form. **Whenever a probe checks a law, check the exponent,
not the arithmetic** — the arithmetic is the implementation talking to itself.
## 2026-08-04g — #337: the pressurizer surge had one driver where it needs two

**Claim.** `stepPressure`'s surge term read `_dTavg_dt` and nothing else, so RCS inventory had no
path to primary pressure at all. It now reads a **pressurizer level rate** carrying both drivers.
`K_surge: 1.0` (°C/s) → `K_surge_level: 0.4` (%/s), which is the **same number** — 1.0 divided by
`level_per_tavg` — so the thermal channel is bit-identical and the only new physics is the mass one.

**Why the currency changed rather than a second constant being added.** A surge is a volume
displacement of the pressurizer, and WTSM 3.2 (ML11223A213, p. 3.2-8) describes it without
reference to what caused it: *"Temperature changes produces changes in coolant density, which force
water into (insurge) or out of (outsurge) the pressurizer. … the contraction of the coolant produces
an outsurge from the pressurizer. This is accommodated by an expansion of the steam bubble and a
corresponding decrease in steam density and pressure."* The conversion for both drivers already
exists in `stepLevel` (`level_per_tavg`, `level_per_mass`), so stating the law per unit **level
rate** lets one constant serve both and keeps the geometry stated once. The mass slope is taken
piecewise on the current deviation exactly as `stepLevel` takes it, so they cannot drift apart.

**Measured before**, full stack, `hot_full_power`, SGTR sev 0.03 at t=60 s: pzr level 55.0 → 15.7 %,
pressure **2235 → 2230 psi**, subcooling **73.8 → 73.6 °F**. After: **−135 psi**, **−9.0 °F**.

**`_dmass_dt` is the REALISED rate, not the raw balance** (`pwr_primary.stepInventory`, read one
step late — the §11 explicit coupling). Taken post-clip and divided by `dt`, so a plant pinned at
`mass_max` — an ECCS overfill holding 120 % — reports zero surge instead of a phantom insurge it
has nowhere to put.

**RELIEF IS EXCLUDED FROM IT, AND THE GAINS ARE RE-SOLVED 300 → 600 — F15, ruled**
*(OWNER RULING, 2026-08-04: "Do f15 how you recommend.")*.

The PORV and the code safeties discharge from the pressurizer STEAM SPACE, so that mass never
crosses the surge line. The arithmetic said so first — `K_surge_level · level_per_mass` = 310
against relief gains of 300, i.e. those constants *were* this coupling, fitted per path — but the
**structural** reason is better: the surge term is gated `saturated ? 0`, so routing relief through
it made a valve **double-strength while subcooled and half-strength once voided**, and voided is
the regime the meltdown paths, the TMI flagship and TR-15 all live in. A valve vents steam
regardless of what the bulk coolant is doing.

**The sourced criterion did not solve the gain** (WTSM 3.2 p. 3.2-11, PORVs sized to hold pressure
under the high-pressure trip through a 50 % step load decrease): satisfied at *every* value 300–1200,
peak 2364–2372 psi against a 2384 psi trip, because the PORV setpoint and the trip are 0.24 MPa
apart. Nor does a first-principles solve close — `porv_flow_max` and the gain are a matched fitted
pair. **Solved against behaviour instead:** `run_meltdown` and `run_scenarios` are both red at
300/400/450 and green at 500/600; 600 is the value reproducing the calibrated total (300 + 310), so
it is the principled point inside the measured window.

**Known cost, deliberate:** `run_behavior` TR-15 leg E now fails at every gain 400–600 (Tavg 482 /
455 / 448 / 447 °F, core undamaged) — with relief no longer weakened in saturation the plant rides
out a lost heat sink on relief bleed. A plant question, filed with the TMI-2 re-author.

**STATE: NOT GATE-GREEN.** `run_behavior` 50/0 and `run_m4`/`run_autoctl`/`run_e2e_controls` back at
baseline (all three re-authorings verified on the OLD engine too), but `run_procedures`,
`run_procedures_stack` and `run_campaign` are red — content authored against the old trajectory.
See the 2026-08-04g `TUNING_LOG` entry for the measured diagnosis of each.

**It runs both ways, and that is what broke `PI-3`.** Its leg 2 ran to `primary_pressure < 12.0`
and asserted no scram — reachable only because safety injection could not push back on pressure.
Now unthrottled SI arrests the fall at 12.47 MPa and takes the plant **solid** (`pzr_level high`
at 57 s, inventory 111.1 %), the behaviour operators throttle SI to avoid. Re-authored to assert at
the actuation instead; it passes on the OLD engine too, so it is a better test, not a refit.

### The heater is 27× its own source, and it is DELIBERATELY not fixed here

WTSM 3.2 (ML11223A213, p. 3.2-9) rates the heaters directly in the currency `K_heater` uses:
*"78 heaters … total capacity of 1794 kW. … capable of raising the temperature of the pressurizer
and its contents at approximately 55 °F/hr."* At 2235 psia that is **0.23 psi/s (1.586e-3 MPa/s)**.
× 12.6 for this plant's declared Mode 5↔1 time compression = **0.020 MPa/s**, which lands exactly
on `setpoint_pressurize_slew_mpa_s` — the config states the same physical quantity twice and the
two disagreed by 27×. `K_heater` is **0.55**, so the heaters rebalance against any surge the plant
can produce, which is why adding the mass driver alone moved the sev-0.03 case by only 9 psi.

**Not taken, because it changes ruled identity.** Measured, everything else held:

| `K_heater` | subcooling cue (leak to the 17 % cutoff) | full load rejection | `run_behavior` |
|---|---|---|---|
| **0.55** | −0.7 °F | no scram | **48 pass** ← shipped |
| 0.20 | −1.2 °F | no scram | 44 pass |
| 0.10 | −3.1 °F | no scram | 43 pass |
| 0.05 | −8.5 °F | **SCRAM 122 s** `otdt_margin low` | — |
| 0.02 | −9.4 °F | **SCRAM 103 s** `otdt_margin low` | — |

The wall between 0.10 and 0.05 is **TR-1h** — "no scram" on a full load rejection is this plant's
ride-out character, a declared departure from the Westinghouse 50 % criterion, and **OTΔT is what
binds it** (the #311 trap from the other side). Below 0.20 the pressurizer also stops winning
against its own spray and TR-11's stuck-open spray valve runs the plant to 15 psi instead of
parking. Open flag **F14**; declared to the player at `Manuals/12` §12.15.

**`K_surge_level` 0.27 was tried and refused.** The same WTSM number gives the surge coefficient a
sourced band of 0.27–0.63 (the spread is whether the vessel metal participates on a surge
timescale; a fast surge does not reach it), and the fitted 0.4 sits inside it. 0.27 costs **TR-1c**:
a 1.5× weaker insurge peaks the sub-arm rejection at 2246 psi instead of lifting the PORV, silently
retiring the §8.21 declared backstop. Not a change to make on a number the source does not pin.

---

## 2026-08-04f — a release can merge, tag and pass CI without going live

**Decision.** *(OWNER, 2026-08-04: "Let's fix the gap and release.")* The release procedure now
asserts a **`environment=Production` deployment for the released SHA**, and holds the `develop`
push until it exists. Process only — no engine, config, layer or UI change.

**What happened.** Alpha 1.0.0 merged to `main` (`305835e`), was tagged `v1.0.0`, passed both
`aggregate-gate` runs, and Vercel's commit status read **success** — while the production domain
kept serving `d5c1d8b` / `Pre Alpha`. The only deployment created for the released commit was a
**Preview** aliased to a `*.vercel.app` URL; the newest Production deployment was still the previous
release, four hours old, which is exactly what the edge was serving (`X-Vercel-Cache: HIT`,
`Age: 13895`).

**The trap is that every normal signal was green.** A *"Vercel — success"* commit status is satisfied
by a preview build, so it is not evidence of a production deploy — and nothing in the procedure
looked at the one field that separates them.

**Cause: ordering, inferred from outside.** The merge landed at 15:02:50Z and `develop` was
fast-forwarded to the **same commit** and pushed seconds later; one deployment exists for that SHA
and it is the preview. The prior release got Production **and** Preview 11 s apart for its shared
SHA, so preview-only is not normal — it reads as two same-SHA events collapsing. Not confirmable
from outside Vercel; the deployment records and the timing are what is evidenced.

**Why an assertion and not a gate.** The check needs network and a GitHub token, so it cannot live
in `run_release` (static, and CI has no `gh` auth). It is a checklist item carrying the exact
`gh api` command instead — and it has to be explicit because **a missing production deploy is
indistinguishable from a slow one from the client side, permanently**, so "wait and see" has no
terminating condition. A duplicate SHA will not produce a production build either, so recovery is
promoting the preview (owner, one click) or a **new commit** on `main`.

**Known, not fixed here:** the `YYYY-MM-DDx` session-suffix scheme collides when three lanes work
the same day — `2026-08-04b` now labels workbench's #330 entry and backshop's #326/#328 entries, so
one citable label points at three things. Renumbering another session's headings mid-release was not
worth the churn; filed instead.

---
## 2026-08-04f — #334: the 17 % heater cutoff, and a plant where a small break was worse than a big one

### The change

A second de-energization in `pwr_pressurizer.autoControl`, beside #329's AC guard: heaters off
below **17 % INDICATED** pressurizer level. `heater_cutoff_level_pct: 17.0` in config, marked
**not `[tune]`**. New probe **CA-10** (14 checks), `run_behavior` **49 → 50**. No other constant
moved.

### Why this counts as a defect and not a missing feature

The plant could reach, and then STAY IN, a state with no physical realisation: an **empty RCS at
2207 psi (15.22 MPa) with the coolant 240 °C subcooled**, held there by heater power alone. That
is not a simplification of a real plant, it is a state a real plant has an interlock to prevent —
and the interlock exists precisely because the heaters are direct-immersion elements that burn
out uncovered (WTSM 3.2, ML11223A213). The observable consequence was worse than the state: it
deadheaded the pressure-driven ECCS (0.0034 frac/s against a 0.050 leak), so **the outcome became
non-monotonic in break size** — 5 % destroyed the core, 10 % and 15 % were survivable.

### The decision worth recording: build the sourced HALF, do not invent the rest

WTSM 10.3 §10.3.4.1's bistable does **three** things at 17 %: alarm, letdown isolation, heater
cutoff. This plant has all three — the alarm at WTSM's own 25 % plus a 12 % lolo, the letdown
isolation as an M4 actuation, and the heater cutoff added here.

> **CORRECTED 2026-08-04d.** This section originally said *"the letdown isolation is deliberately
> not built here"* and blamed a chatter artifact on its absence. **Both were wrong.** The
> isolation was already in `pwr_control.js` PWR_ACTUATIONS at the same 17.0 setpoint, latched at
> `reset_below: 20.0` — missed because I grepped `pwr_primary.letdownFlow`, the ENGINE, for a
> level gate. An interlock that reads an instrument and commands a valve is an M4 actuation; the
> *"know which LAYER a gate runs at"* trap, applied to a search instead of a test. Deleting it
> reddens `run_reachability`, `run_ops` and `run_behavior`, so it is covered as well as built.
>
> **The chatter was not caused by it either.** Measured, `letdown_flow_actual` is a flat zero
> through the whole window — the isolation had fired and latched, so its absence cannot be the
> mechanism. The real driver is CA-7's own rig holding a **manual 100 % heater demand**
> indefinitely, which at no load walks pressure past the 16.20 MPa PORV setpoint; the valve
> cycles, takes mass out, level falls through the cutoff, and the loop repeats. A correct plant
> answering an incorrect operator action. Without that demand a LOOP shows no chatter at all
> (level 38–41 %, inventory 100.00 %). Full correction in `TUNING_LOG` 2026-08-04g.

**The two halves live in different layers, and that is deliberate.** Letdown isolation is a valve
command, so it is an ordinary M4 actuation. The heater cutoff cannot be: the only command that
expresses it is `set_heater`, and an actuation writing the operator's own demand is wiped by the
next button press — the #200 defect, which CA-7's comment already warns about. So it is a
de-energization in `autoControl` beside #329's AC guard, which is the house idiom for removing
power from a load without touching what the operator asked for.

**A deadband was still refused**, and that part stands: the source specifies no hysteresis, and
now that the chatter is understood as correct PORV cycling under a bad demand, there is nothing
for a deadband to fix.

### The boundary is now DERIVED, which is the test that it is right

After the fix, breaks survive up to exactly `hpi_flow_max + lpi_flow_max·lpi_inventory_gain` =
**0.160 frac/s**. That number is the ECCS capacity, falling out of the injection curve rather
than being fitted — so CA-10 leg E computes it from config instead of transcribing it, and a
retune of the ECCS moves the expectation with the plant. Before the fix the boundary was
somewhere in the middle of the range and pointed the wrong way.

### Two probe-authoring traps, and the second is the one worth keeping

**A one-step coupling lag can satisfy an "ever" assertion.** CA-10's HR1 leg asserts that a
transmitter stuck at 20 % keeps the heaters energized while true level is below the cutoff. Its
first draft set a boolean on any single qualifying sample and **passed against the truth-reading
injection it exists to catch** — because `autoControl` (step 7) reads state that `pzr_level_pct`
(step 8) has not yet written, so even a truth-read guard leaves one lagging sample. Demanding a
SUSTAINED fraction separates 100 % (1589/1589) from 1.3 % (10/793). Anywhere a probe distinguishes
"reads the instrument" from "reads truth", the explicit-coupling lag will forge one sample of
evidence for the wrong answer.

**And the mirror of it:** leg C first asserted the empty-and-pressurized state never OCCURS,
which pins a transient a blowdown is entitled to (7 samples, 9.63 MPa). The defect was that the
state was an EQUILIBRIUM — so the check measures the longest unbroken stretch, not occurrence.
Same lesson as TR-1h: permanence, not occurrence.

### Two existing probes moved and neither was broken

Both were pinning the old behaviour (#206/#219 shape). **CA-7 leg C** sampled the LOOP heater
response at 300 s, by which time the level interlock had fired and was masking the AC claim the
leg exists to make. **TR-13b**'s `leak > 0.01` was a magnitude fixture from a plant whose heaters
ran with the pressurizer empty; it now asserts the claim in its own title — that the ΔP-scaled
BASE survives the restore — which it never did. Both new forms pass on the pre-#334 engine.

---

## 2026-08-04e — board ALL-CAPS · Physics-tab contrast + indication colours · failure groups

**Decisions.** Three owner directives, 2026-08-04, UI only. `verify_board_check` **192 → 194**,
`run_inspect` **8/8 36 → 9/9 42**.

**Board text is ALL CAPS, units exempt** *(OWNER DIRECTIVE, 2026-08-04: "All text should be in all caps
except units should follow standard unit conventions for capitalization.")*. MEASURED on the rendered
board: 225 leaf text nodes, 34 not all-caps, **30 of them units**. Nine strings actually changed. Two
source-survey traps the DOM avoided: 113 lowercase `name` fields that are **rendered nowhere** (builder
metadata), and `d TEMP AVG`, which `DOC_PATCHES` already fixes to `Δ TEMP AVG`. Patched via
`DOC_PATCHES`, never the GENERATED `pwr_board_data.js`. The `board_check` guard exempts units as whole
**tokens** — "psi" and a bare "s" occur inside words, so substring stripping would mask the violation —
and is paired with a non-vacuity check, because a scan that reached nothing passes for the wrong reason.

**Physics values: 2.84:1 → 7.27:1, and the scheme means something** *(OWNER DIRECTIVE, 2026-08-04:
"make the physics numbers brighter under the physics tab. The contrast is currently too low. Also make
these physics numbers follow the indication color scheme (grey, green, yellow, red, etc.)")*. The
generic `.num-line .nv` colour `--clr-status-normal` #4a6070 is a deliberate QUIET-BOARD token, so the
fix is **scoped to `.phys-grp`** rather than repainting the shell — the All view and the RBMK/BWR grids
keep the quiet default. Grey #98A3AF 7.27:1, green 5.91, amber 8.29, red 4.76; all pass WCAG AA where
the old value failed. **Grey vs green carries the teaching**: green = "a criterion exists and is
satisfied", so the 18 purely informational rows stay grey, or green stops meaning anything. `nzCls`
returns `q-ok` at zero because zero voiding/uncovery/oxidation/cavitation/leak is the criterion being
met. **A missing value gets no colour** — the first cut painted a green em-dash for peak clad
temperature, which asserts a satisfied criterion about a number nobody has.

**Failure groups use the energy-path spine, not the catalog `category`** *(OWNER DIRECTIVE,
2026-08-04: "organize the list of failures into logical groupings.")*. 24 failures, seven groups,
matching the Graph list and Physics tab so all three read alike. The catalog's categories group badly
for a player (`power` holds eight unrelated items; `safety_system` is the untyped default) and exist to
type the failure for the control layer — the badge still shows them. Membership is hand-maintained, the
**#224 trap**, so an unlisted failure renders under "Other" rather than vanishing and the failure mode
is a misfiled row rather than a missing one; `run_inspect` guards both directions plus duplicates,
injection-verified three ways.

---

## 2026-08-04d — #282: LAUNCH prepared — Pre Alpha → Alpha 1.0.0, manual set to Rev 0

**Decisions.** Three owner directives. *(OWNER DIRECTIVE, 2026-08-04: "The plant manual revision number
should be zeroed out for this release.")* — the manual set is back to a single **Rev 0** row, stamped
through all 13 documents and repacked. *(OWNER DIRECTIVE, 2026-08-04: "The first release should not have
change log entries other than saying it's the initial Alpha release.")* — `changelog.html` carries **one
bullet**.
`site/release.js` is `Alpha 1.0.0`. **Prepared on `develop`, NOT merged** — the merge is the owner's call.

**A first release has nothing to be a change against**, which is why the one-line entry is correct
rather than thin: every feature in it is new to every reader, so a feature list on a page that means
*"what changed since the copy you had"* is a product tour under the wrong heading. `CHANGELOG.md` keeps
its full history — the gate requires the two files agree on **version and date**, explicitly not on
content.

**The predicted red was real.** The nine pre-public `## [Alpha 1.x.y]` headings are
`## [Pre-launch 1.x.y]` now, relabelled individually with content and dates untouched, and
`run_release` came out **11 / 0** — the 11th check being the CROSS row that was silently absent while
1.0.0 sorted below the rule's `floor`.

**`run_hardrules` 149 → 146: deleting history deletes citation sites.** Collapsing 26 revision rows
removed several that quoted owner rulings, outweighing the citations the launch directives added.
Verified before accepting: every affected ruling still stands in other tracked files. The revision table
and this gate pull against each other exactly as the *Recent themes* cap does.

**Zero the revision AT a release, never ahead of one.** This is the second Rev 0 — the first was
stamped 2026-07-31 in anticipation of go-public and the counter then ran to 26 before the release
happened, so it bought nothing and had to be redone. Recorded in `00_REVISION_HISTORY.md` itself,
because the argument is invisible to anyone who does not know both resets happened.

---

## 2026-08-04c — #282: the version-bump suspension is LIFTED, next release is launch

**Decision.** *(OWNER DIRECTIVE, 2026-08-04: "The next release will take the program out of pre-Alpha
and into Alpha and bring back the update tracking page. Update tracking summaries/lists should be
concise.")* The 2026-07-31 suspension of versioning + the player-facing changelog is **superseded**.
The next `develop` → `main` merge is the **launch release, `Alpha 1.0.0`** — one version for
everything accumulated under `Pre Alpha`; the Platform.Feature.Refinement digit rules resume from the
release *after* it. Docs/process only: no engine, config, layer or probe change.

**Un-suspended in four places, because that is how many carried it.** `CLAUDE.md` twice (the
*Definition of done* release bullet and the *Website changelog & version numbers* banner), the
`release-to-main` skill (banner, six struck-through checklist rows, **and its frontmatter
`description`** — the string an agent reads before opening the file), `changelog.html`'s
`ADDING AN ENTRY` comment, and `site/release.js`'s note. A rule spread across four sites is
un-suspended in four edits or not at all.

**`run_release`'s pre-release mode makes the bump and the entry ONE change** — read off the gate, not
assumed. `RELEASED` is derived from the **format** of `RD_RELEASE` (`test/run_release.js:65`), and
while it is false the SITE rule requires **zero** published entries. So a `changelog.html` entry
ahead of the bump is a red gate, and the bump without an entry is red the other way. Neither
direction was documented anywhere; both are now, at all four sites. The release moves the runner
**8 → 11** (two `RELEASED`-only checks plus one CROSS row arm on the format alone). This is also why
the launch entry was deliberately **not** drafted into the page ahead of time.

**Concise is a CAP: ≤ 8 bullets, one line each.** The brevity is the owner's directive; **the number
is the agent's** operational reading and is labelled as such at every site. It guards a specific
failure: the launch entry describes the *state of the sim* rather than a diff, so it is the one most
likely to sprawl, and `CHANGELOG.md` — the obvious thing to copy from — carries a **30-line** single
item. Rule: aggregate a system's work into one line; never derive the public page one-to-one from the
developer one.

**Simulating launch day found the plan ships a RED, and #282 records the opposite.** The three files
were copied to a scratch tree, the launch edits applied and the real runner pointed at them.
`CHANGELOG.md` still carries `## [Alpha 1.11.0]` down to `## [Alpha 1.7.0]`, so rolling
`[Unreleased]` to `## [Alpha 1.0.0]` puts **1.0.0 above 1.11.0** and fails *"version headings are
newest-first"* — **10 checks / 1 failed**. #282 says *"the ordering trap only existed because 1.0.0
had to sort below 1.10.0/1.11.0 … not needed at all"*, which was true of the *site* changelog (it was
emptied) and was never checked against the developer one. Relabelling the eight pre-launch headings so
they fail the `^Alpha \d+\.\d+\.\d+$` test gives **11 / 0** — **relabel, do not merge**, because the
per-version boundaries already took a tag diff to reconstruct once. **Second effect, which nothing
would have surfaced:** while 1.0.0 sorts below the oldest named heading it falls under the CROSS
rule's `floor`, so the launch entry's date agreement across the two files is **not checked at all**
(measured: zero CROSS rows). Fix deferred to the release — it is release-time work and a structural
call — and recorded in the skill checklist and #282.

**`run_hardrules` 142 → 149, and the trap is in the write-up.** Measured net +7, **not decomposed**:
a hand count of the citations added and the suspension quotes removed gives +5, and this gate is
already documented as over-reporting its site count (#312). Two traps caught on the change: the Rev 0
ruling was first quoted with **no date** (149/1 before 149/0), and **typing the literal marker into
prose removes a site even inside backticks** — the CLAUDE.md line naming it went 149 → 148, because a
backticked marker swallows the guard on a neighbouring real citation. Injection-verified three ways.
Refer to the markers by description; never type them.

**Still open, owner's call:** the pre-launch `v1.10.0`/`v1.11.0` tags will sort above `v1.0.0`
permanently. Recommendation: leave them — developer-facing only, and renaming rewrites published refs
on a public repo for a tidier sort nobody player-facing sees.

---
## 2026-08-04b — #330: one pressurizer, two slopes, and the fix that was one layer up from the filed diagnosis

### The change

`level_per_mass` **100 → 776** and `level_per_void` **150 → 375.33** (`pwr_config.js`). New probe
**CA-9** (`run_behavior` 48 → 49). `run_ops` **59 → 58/69** — one new PWR red, deliberate.

### The defect

Stand down the `cvcs_makeup` automation channel at `hot_full_power` — one `defaultOn` button on the
board — and the core **melted at 22.1 min, un-scrammed**. Measured full stack: inventory
**100 → 62.55 %**, pzr level **55 → 17.55 %**, and primary pressure **2235 psi (15.41 MPa)**, Tavg
**579.3 °F (304.1 °C)** and subcooling **+73.75 °F (+40.97 °C)** all dead flat to the printed
precision while the cladding ran to **24,958 °F (13,848 °C)**.

### Why the filed diagnosis was not the fix — this is the decision worth recording

#330's investigation isolated a **circular void gate**, and it is real: void requires subcooling ≤ 0,
pressure is pinned at setpoint by the subcooled branch's restore term, and that branch is selected by
`saturated`, which the void drives. Inventory loss had no path to pressure at all.

**Fixing that is not the fix**, and only measuring said so. A mass-based void route (threshold =
sourced pressurizer liquid holdup, 0.0870 of RCS) broke the deadlock and produced a defensible-looking
plant — scram at 4m03s, SI in, no melt. It also:

- made the **12 % pzr lo-lo scram unreachable** — `run_reachability` **B2 red, trough 54.34 %** —
  because `level_per_void` × `void_gain` (450 effective) lifts indicated level before level can fall.
  That is #330's own defect class: a protection setpoint that can never assert.
- reddened **MD-11**, oxidation bands 184/172/86/40 → 104/160/82/40 (the monotonic escalation broke).

Both reverted. **The root cause is one layer up**: `level_per_mass` was **100 %/frac** against
`level_per_mass_surplus` **776** — two contradictory statements about one pressurizer. The surplus
branch's own comment already carried the argument (the steam space is *"the only compressible
volume"*), and **that argument is direction-agnostic**: a subcooled RCS is incompressible liquid
everywhere else, so inventory leaving it comes out of the pressurizer at exactly the rate a surplus
packs into it. Same three tables as #249 (BVPS-2 UFSAR Tbl 5.1-1 / 5.4-12 + WTSM 3.2 Tbl 3.2-2).

With the slope corrected, the mass-based void route is unnecessary — and it is the thing that broke
MD-11 — so it was dropped rather than shipped alongside.

### The protective actuation was never broken; only the inventory it fired at

The low-pressurizer-level letdown isolation fires at **20 % indicated on both plants**. What moved is
what that corresponds to: **65 % inventory before** (core already uncovered — hence #330's "the
protective actuation is what destroys the core"), **95.1 % after**. Measured at 776: letdown isolates
at ~2m30s, level parks 16.97 %, inventory 95.10 %, and it holds there to 40 min — covered, undamaged,
**no scram needed**. An assertion that the isolation *fired* passes on both plants and proves nothing;
CA-9 leg C asserts **the inventory at which it fired**, which is the whole defect in one number.

### `level_per_void` could not stay put — the deception is a DIFFERENCE

TMI deception = `void_gain·level_per_void − level_per_mass`. At 150/100 that is **+350 %/frac**; at
150/**776** it is **−326**, i.e. level FALLS as the primary voids. Measured — `run_pwr flagship_tmi`
*"pzr level rises as inventory falls"* read **0.0** against 48.6, and `pwr_tmi2_p3` stopped reaching
`level_complete`. Re-solved by holding both documented targets fixed: net +350 ⇒ **375.33**, and the
independent check is the other target (78.3 % at the story-clock void, past the 75 % alarm).
Deliberately **not** scaled proportionally (1164), which takes the net to +2716 and pegs the gauge.

### The one red left standing — RULED A *(OWNER RULING, 2026-08-04: "A")*

`ops_cvcs_pzr_drain_rate` reads **53.7 s** against `>= 300 s`. That acceptance is a direct product of
the corrected constant, so it was a hard-coded consequence of the defect — but it encodes a
**2026-07-22 owner request** for a drain-rate feel target, and re-banding a feel target whenever the
plant moves retires it rather than reporting against it. Measured both ways:

| | drain rate | loop τ | `run_e2e_controls` |
|---|---|---|---|
| shipped (`cvcs_inventory_gain` 0.012) | 7.76× faster than target | 10.7 s | **59/59** |
| scale gain to 0.00154639 | **exactly the old rate** | 83.3 s (unchanged) | **52/59** |

A real plant takes ~79 min for this drop on one 20 gpm orifice, so both sim values are far from
prototypical — this was a choice between two game-feel numbers, and it was the owner's. **Ruled A.**
What carried it: B spends 7 checks of *measured* CVCS leak-holding behaviour to buy a *feel* number,
which is backwards under HR9; the 300 s target was never prototypical either, so there was no ground
truth on that side to defend; and the slowness is what hid the defect in the first place. The red is
now an **accepted, ruled state** — not to be cleared by re-banding the threshold or by scaling the
gain. Cheap lever if it ever plays too fast: the letdown ORIFICE size, which sets the drain
independently of charging authority (**unmeasured**; it moves the gpm calibration too).

### Three tests moved, all three validated against the OLD plant (HR10)

`run_e2e_controls` `SETTLE` became `4.8/(cpl·gain·lpm)` — **400.0 s exactly** at the old constant,
byte-identical — plus a second `SATURATE` window, because the equilibrium checks settle on the loop
**plus its 20 s error filter** (at 776 the filter dominates; at 4.8 loop-τ alone coverage read 134 %)
while the beyond-authority check needs a **ceiling** or it spans a reactor trip. TR-15 leg E 90 → 120
min: a knife edge, not a measurement (old 2180 °F / new 2068 °F at 90 min, both undamaged, both
reaching damage at ~100 min). **59/59 and green on both plants.**

### Still open, filed not fixed

The inventory → pressure coupling genuinely does not exist. With the slope corrected the plant is
protected by level and the player is told, so it is no longer a safety hole — but a draining subcooled
RCS still does not depressurize, and closing that needs the void rework that broke MD-11 here, i.e. a
re-calibration of the oxidation bands alongside it.

---
## 2026-08-04b — #326: the model kept computing past the end of its own validity

### The change

`if (s.melted) return;` at the top of `stepFuel` and `stepCladding` (`engines/pwr/pwr_thermal.js`).
New probe **MD-12**, `run_meltdown` **11 → 12**. No config constant moved; no behaviour below melt
moved.

### The decision worth recording: terminate, do not clamp

The issue offered both — *"Terminate or freeze the thermal integration once `melted` is true … A hard
clamp (say at the zirconium boiling point) would be a second-best; it hides the runaway rather than
stopping it."* That is the right call and it holds for a reason beyond tidiness: **a clamp becomes the
thing the suite pins.** Any probe written against a clamped model asserts the clamp, so the clamp can
never afterwards be shown to be wrong, and the runaway underneath it stays live and invisible. A
termination is falsifiable in one direction only — *nothing moved* — and cannot be satisfied by
choosing a number.

The boundary is not arbitrary either. `CONTEXT.md` and `Manuals/12` §5.5 both say the simulation ends
at fuel damage, and `pwr_thermal.js` already carried a long #238 note conceding that above ~1900 °C the
field *"stops meaning cladding"*. The model had a declared edge and simply kept integrating over it.

### Two nodes, and the smaller one is the one previously found

| node | why it is unbounded | 2 h, unmitigated large break |
|---|---|---|
| `fuel_temp_c` | `hFcEffective` returns 0 on a fully uncovered core, so `dTf` loses its only sink | **5032 °C (9089 °F)** |
| `clad_temp_c` | #238 Arrhenius oxidation, `q_ox = q_ref·arr/w`; `arr` exponential in T, `w` only √(integral) | **355 618 °C (640 144 °F)** |

**Below melt the clad node IS a follower** — the lower clamp at `pwr_thermal.js:300` pulls it to the
fuel node — and that is what made a `stepFuel`-only fix look sufficient to the issue's investigation.
With the oxidation term it leads: 2308 °C against fuel at 1852 °C at 20 min. Injection-verified, the
`stepFuel`-only fix leaves 3 checks red and **the same 312 089 °C clad drift to three decimals** as no
fix at all.

### A comment that had become false, and why it was corrected rather than cut

`pwr_thermal.js` asserted of the Arrhenius factor that *"w grows with it, so dw/dt self-limits and the
term never needs a cap."* Measured, oxidation heat reaches **1095 % of rated** — the exponential beats
the square root once the node's own heat outruns the sink. The below-melt half of the claim is true and
load-bearing (it is why there is an oxide *state* rather than a temperature multiplier), so the comment
was narrowed to say where it holds, not deleted. Same rule as the #220 finding that a comment carrying a
premise rots when the plant departs from it.

### The process finding, which outlives the fix

Both of the issue's own investigation comments were **correct when written and wrong when acted on**.
The rebuttal *"there is no zirconium-oxidation term in this engine"* was true until #238 merged the day
before; the filed reproduction path (a LOOP melting the core) stopped reproducing when #325 merged the
same morning — a LOOP now parks at **307.9 °C (586 °F)** with the core intact. Neither comment was
careless. This repo merges lanes faster than an investigation ages well, and **an issue comment is a
claim like any other**: re-measure on the tree you are standing in before implementing someone else's
diagnosis. That is the standing "inherited claims are the risky ones" rule, arriving from a direction it
had not arrived from before — the stale claim was *our own investigation of this very issue*.

---

## 2026-08-04b — #328: renaming the plant, and the one question that was not mechanical

### The change

`SLX-100` → `SLS-100`, expansion *Single-Loop eXperimental* → **Single Loop Simulated**. 22 sites, 12
files. Manual set **Rev 27**. No code behaviour, no gate score except the manual digest.

### The decision: the digit stays ELECTRICAL

*(OWNER DIRECTIVE, 2026-08-04, issue #328: "Rename the plant the "Single Loop Simulated - 100MWt" AKA
"SLS-100".")* — which names **MWt**. The plant's `identity` block is `mwt_rated: 300.0` /
`mwe_rated: 100.0`, and `Manuals/01` and `12` both print the pair, so taking the request literally
would have put a 3× contradiction between the name and every rating table in the set. Put to the owner
with the recommendation rather than resolved silently, because the alternative (`SLS-300`) was a real
option and the choice is his. Ruled *(OWNER RULING, 2026-08-04: selected "SLS-100 = 100 MWe" from three
options — 100 MWe, `SLS-300` = 300 MWt, or no number; a selection, not verbatim words)*.

**The word *experimental* survives** in ordinary prose and in `identity.plant_class`
(`'single-loop experimental pressurized water reactor'`), which is a class descriptor rather than an
acronym expansion. What retired is the reading of the letter X.

### Why this was 12 hand edits and not one

`identity.name` has **no runtime consumer** — nothing in `engines/`, `layers/`, `ui/app.js` or `test/`
reads it — despite the block's own header calling itself *"the ONE place human-facing absolute ratings
live"*. That is true of the *ratings*; the **name** is duplicated by hand into the manuals, the site
pages, `tools/pack_manuals.js` and two Blueprint docs. Worth knowing before the next identity change:
the ratings are centralised and the name is not.

---

## 2026-08-04 — #325: natural circulation, and the cheap version that was measured and refused

### The change

`pwr_primary.naturalCircFlow` + three config constants; `stepFlow` coasts toward it instead of toward zero.
`flow_floor` 0.1 → 0.015. `true_state.natural_circulation`. New probe **TR-15**; TR-7b leg D re-authored.
`DESIGN_COMPANION` §8.6 **retired**; manual set Rev 26. *(OWNER RULING, 2026-08-04: "Go with one B")*.

### Q0 first, and it redrew the options

#325 rated option (1) *"the largest change"*. It was not: `natural_circ_flow` already existed as the
coastdown target at `0.0`, and flipping it to a constant 0.03 made a LOOP survivable with **nine runners
unmoved**. The issue's own cost estimate was the thing that most needed measuring, and measuring it is what
made (1) affordable enough to rule on at all.

### Why (1b) and not (1a) — this is the decision worth recording

The constant floor was **built and measured before being rejected**. It circulates through a fully voided
loop: `primary_void_fraction` **1.00** with 3.00 % flow, Tavg dragged to 245 °F while the clad melted at
3827 °F. The *outcomes* stayed right in every case tested — uncovery dominates, so the core still melts —
which is exactly why it would have shipped. HR10: right answer, wrong mechanism, and the only thing that
catches it is asking what the mechanism *is*.

The void gate is also what preserves TMI-2, where tripping the pumps into a voided loop established nothing.

### The law is solved, not iterated, and that is a correctness choice

W = C·√ΔT closed against ΔT = `delta_T_rated`·Q/W gives W ∝ Q^⅓. The fixed-point form would have read a ΔT
that `flow_floor` clamps below 10 % flow — the exact band circulation lives in — and a self-referential
lagged flow term rings. Getting the cube root out of two independently-motivated relations is the internal
validation; measured 1.343 against 1.342 predicted.

### Sourced shape, fitted scale, and the distinction is declared

WTSM 3.2.6.3 (ML11223A213) gives the driving head and *"sufficient only for decay heat removal … not for
power operation"*. It does **not** give a magnitude, and neither did anything else reachable from this
environment. The *"2–5 %"* in old §8.6 and `Manuals/01` was **uncited inherited prose** and was deliberately
not used as the anchor — CLAUDE.md's "inherited claims are the risky ones" applied to this repo's own text.
C is fitted to the plant's own energy balance instead, and `Manuals/12` §12.4 replaces §8.6 as the declared
departure, naming the *magnitude* rather than the mechanism.

### `flow_floor` had to move, and it is the #315 lesson recurring

The leg split under-read **2.4×** under natural circulation because the floor clamped at 10 %. Loop ΔT is
the real-plant verification cue for exactly this condition, so leaving it clamped would have shipped the
feature with its indication broken — a term wrong in the one regime the change creates. Lowered to 1.5 %,
below the weakest circulation the plant can make.

### Deliberately not built

| | why |
|---|---|
| A board "NATURAL CIRC" lamp | Q4 duplicate authority. A real crew verifies it from loop ΔT + subcooling + stable SG pressure, all already on the board. The `true_state` field is diagnostic, for the Physics tab and probes. |
| PWR-E04/E05 checklists | Unblocked by this, but separate work (#319 item 6). E05's manual acceptance was corrected to match the plant; a checklist was not invented alongside it. |
| Two-phase / reflux circulation | The void gate ramps to zero rather than modelling degraded two-phase circulation. Declared in `Manuals/12` §12.4's neighbourhood; the lesson is "it stops", not how it stops. |

## 2026-08-03f — #332: `ac_available`, or what a bare boolean costs when nobody names the question

### The change

`true_state.ac_available` — one derived field, set at the top of `PWREngine.step()` (0a), read by
every AC load. `engines/pwr/pwr_engine.js` (derivation + roster + `boron_adjust` + two indications),
`engines/pwr/pwr_primary.js` (`acAvailable`/`chargingPumpPowered` predicates; letdown, charging and
the ECCS pump), `engines/pwr/pwr_pressurizer.js` (#329's heater guard re-expressed through it),
`Blueprint/CONTEXT.md` §6.3, new probe **CA-8**. `run_behavior` **46 → 47**.

### Why (2) and not (1), and why not "wait for #325"

#332 offered three options: point-fix each component, build an `ac_available` concept, or leave it.
It recommended (2) *"but not urgently, and not before #325 is ruled"*. #325 is still unruled and
this was taken anyway, on two grounds.

**#325 decides a different question.** What it settles is whether the PWR blackout is a survivable
evolution worth modelling in detail or a documented terminal path. Neither answer makes a motor turn
without electricity. The correctness of the fix does not depend on it, and its *scope* barely does:
`ac_available` is a name and a read, not a coping model.

**(1) had already failed once, and measuring it showed it would fail again.** The heaters were
missed in the first place because no list existed. Working this issue found a **third** load nobody
had filed — the ECCS pump injecting the RCS solid with every bus dead — which point-fixing the two
systems #332 named would have shipped untouched. That is the argument for (2) restated as a
measurement rather than an aesthetic.

### The design decisions worth recording

**A boolean mirror is not a useless abstraction, and the comment says so out loud.** Today
`ac_available === !station_blackout` exactly. The defect was never a wrong formula; it was that the
question had no name, so nobody asked it. A load now reads `ac_available` *because it needs power*,
rather than reading a casualty flag and inferring power from it. The derivation site carries the
roster of what dies and what lives, with both source quotes, so "what does a blackout take?" is
answerable in one place instead of by grepping for a flag.

**Letdown is gated on the CHARGING PUMP, not on `ac_available`** — WTSM 4.1.3.1 (ML11223A214,
p. 4.1-7) interlock 2, verbatim in `TUNING_LOG` 2026-08-03w. This was the evidence pass changing the
shape of the fix rather than merely blessing it: the obvious guard would have left a real defect
standing (grid up, charging pump secured → letdown drains 100 → 79.5 % in 13 minutes). Sourcing the
mechanism rather than the outcome is what caught it.

**Read predicates default to POWERED when the field is absent** (`s.ac_available !== false`, not
`!s.ac_available`). `letdownFlow`, `injectionFlowInv` and `pwrPressurizer.autoControl` are all called
directly with hand-built state objects by the engine's `selfTest` and by ad-hoc physics rigs; a bare
negation de-energizes every one of them, and an isolated-physics rig would start reporting zero
letdown and no injection with nothing in the fixture to explain it. Same convention in all three.

**`_migrateState` recomputes rather than defaulting.** A save taken mid-blackout would otherwise
reload with the plant electrified for one step.

**Selectors are never written.** `charging_pump_running`, `heater_auto` and `hpi_active` stay exactly
where the operator put them; only delivered flow/power/head go to zero. This is the #200 trap — a
de-energization parked in the operator's demand heals itself on the next button press — and CA-8
leg A pins it with a *positive* check that the 0.05 manual charging demand is still latched.

### Deliberately not built

| | why |
|---|---|
| RHR pump guard | Heat removal is already zero in an SBO (`condenser_cooling_available`). There is **no reachable state** where AC is out and condenser cooling is up, so the guard could not be injection-verified — and an unfalsifiable guard is worse than a filed gap. |
| Condensate pump / main feed on LOOP | Both are **nonvital** loads, lost on a plain LOOP as well as an SBO, so `ac_available` (which a LOOP keeps) is the wrong gate. Wants a second, non-1E bus. |
| A two-bus model | The honest structure, and where the two rows above go. Out of scope here: it changes LOOP behaviour, which moves #325's picture, and #325 is the owner's call. |

### The flag this leaves

**Adding an AC load is now a two-line obligation** — gate it at the read site and add a CA-8 leg.
The derivation comment says so at the point of temptation. That is a convention, not a gate: nothing
can statically detect a motor, and the only mechanised half is CA-8 itself.
## 2026-08-04a — board_check joins `run_all`: retiring a number that rotted twice

**Decision: a harness score may not live in prose.** `ui/test_panel/board_check.html` was the
last check-bearing artifact outside `run_all`, and its count was wrong twice in the same
direction — CLAUDE.md read "143/143" against 1 FAILURE / 143 before #289, and "188/188" against
1 FAILURE / 188 through 2026-08-03. Both were a pin added without running the file. **What made
them survivable is the part worth recording**: `discover()` globs `test/(run|verify)_*.js`, so an
HTML page under `ui/` is invisible to it, so there was no `BASELINES` entry, so the only record
was a sentence — and `run_all`'s own doc block says prose baselines are what rot.

`test/verify_board_check.js` is a RUNNER and adds no checks. Every assertion stays in the HTML
harness, which mounts the real board with the real driver and service; the runner loads it, waits
for the harness to stamp its title, reads the harness's own summary line, and exits on it.

**Three properties were chosen deliberately.**
- **Not `slow`.** It is a playwright gate, and #241 is the cautionary tale (an unmarked playwright
  gate under `--fast` was red in CI for 32 runs). Kept unmarked anyway: `--fast` is the invocation
  an agent runs mid-change, and hiding the count from it gives back most of what this buys. CI
  installs playwright; if this ever reddens on a fresh checkout, fix the install, do not add `slow`.
- **A partial run is a HARD failure (exit 2), not a low score.** board_check accumulates its own
  tally, so an exception thrown halfway leaves a smaller count that would otherwise read as a pass.
- **The viewport is pinned (1400x900).** The harness measures rendered rects, which depend on the
  stage scale, which depends on the viewport — an unpinned geometry check passes or fails on the
  window size it happened to get.

**And the prose copy was deleted rather than corrected.** The CLAUDE.md paragraph now points at
`BASELINES` and says explicitly not to restore a count there; ~3.6 kB of stale count history went
with it. The durable board-editing traps were carried forward, plus two new ones (a card TITLE is
not an item — it is a `.bd-box-title` child of the box, which is why the item-vs-item overlap scan
could not see `bdDtMargin` on the NIS title; and `NUDGE_KINDS` components quantise their ports to
the 5 px doc grid).

`run_all` 36 -> 37 runners. Injection-verified four ways.

---

## 2026-08-03f — Owner's board walk-round; Physics/Graph expansion

**Six owner items, all UI/board.** The engineering worth keeping is in four places.

**1. A pipe whose only gate is a fitting leg.** The ECCS panel's RWST cross-tie animated in every
state of the plant (measured at HFP: `eccs_mode=off`, `hpi_flow=0`, `hpi_active=false`, pipe
**running**) because its tee leg was gated on the charging PUMP, which never stops at power. The
generalisable part: a pipe animates only when BOTH endpoint ports report `data-active !== '0'`,
and a plain BOX port has no element at all — `portActive` returns `true` unconditionally for it.
So for **any pipe from a card edge to a fitting, the fitting leg is the entire gate.** Fixed to
follow the ECCS train; leg B (VCT) follows charging FLOW. Both directions pinned, because a leg
stuck at `'off'` passes the "dark at power" check perfectly.

**2. `Pump` is a NUDGE_KIND, so pump ports quantise to the doc grid.** The owner asked to move
the condensate/feed pumps and the polisher right to plumb three drops. Measured, only ONE was
crooked (condenser→condensate pump, 1527 vs 1525) — and the pumps could not fix it: `gridNudge`
snaps their flange faces onto the 5 px grid, so `left` 1480→1482 moved the suction **1525→1530**.
The condenser is not a nudged kind and is what moved. **Before nudging a component into
alignment, check whether its ports can land where you need them.**

**3. A card TITLE is not an item, and the overlap ruler was told to ignore it.** `bdDtMargin`
overlapped `NUCLEAR INSTRUMENTATION (NIS)` by 58.8 px. `board_check`'s geometry pin skips `box`
and `component` kinds (a readout deliberately sits inside its card) and a title renders as a
`.bd-box-title` CHILD of the box — so the only element it could hit was excluded by construction.
The #311 comment that placed the readout also had the title's end wrong by **84 px**, which is
what authored-coordinate arithmetic buys. Title → `NUC INSTR (NIS)`, sized against the widest
value the field can print (11 chars over a [-500, 1500] instrument), not the one on screen;
`NUCLEAR INSTR (NIS)` would have cleared by 3.7 px, i.e. one retune from failing. Card titles are
pinned now, for all three corner status words.

**4. Tripling the chart series is a MEMORY decision, and the naive version was a 7× regression.**
16 series → 51. Measured at the buffer's cap (1800 s of sim time at the 10 Hz broadcast = 18000
rows): 16 series **10.2 MB**, 51 series **75.8 MB**. Two changes bring it to **8.8 MB**, below the
original: `chartSample` writes only the sides a series HAS (a `null` in `v` costs what a number
costs, and 19 of the 51 have no instrument), and the record path takes one row per **0.5 s of SIM
time** rather than one per broadcast, capping at 3600 rows. Keyed on sim time and not a broadcast
count, so it is invariant under `timeAcceleration` and the 100→50 ms transient cadence — above 5×
nothing is dropped at all. The widest window is 1800 s across ~400 px, so 2 Hz remains ~9×
oversampled.

**Engine, contract:** `core_uncovered_frac` and `zirc_heat_pct` published from `stepCladding`
(they were locals). They are the mechanism between the symptom the Physics tab already showed
(peak clad temperature) and the verdict it did not (`fuel_damaged`). Published rather than
re-derived in the UI — between them they read eight config constants. `run_contract` 143 → 145.

**Also fixed, out of band:** `board_check` was 187/188 on the untouched tree while CLAUDE.md
recorded 188/188. Two harness causes — the LOAD TARGET checks sat after the RCP OFF/ON pair that
#314 turned into an immediate scram, and they read the snapshot without stepping (`set_load_target`
goes through the load-mode controller). The clamp half was also passing vacuously, and cannot use
a settled value at all, because **#318's rate limit is one-sided**: measured, 100 → 80 MW lands
inside 3 cycles while 80 → 100 crawls at 10 %/min. Now **202/202** with 14 new pins.

---

## 2026-08-03e — #238: zirconium-steam oxidation, and why the sketched shape was not built

### The change

The exposed-clad hot node (#213) gains its second heat source: `Zr + 2H₂O → ZrO₂ + 2H₂`,
190 kJ/mol (Baker and Just). Four constants in `thermal.zirc`, ~20 lines in
`pwr_thermal.stepCladding`, one new internal state (`_zr_ox2`, lazy-initialised like
`clad_temp_c`), and **MD-11** — `run_meltdown` 10 → 11.

### The defect was the DIRECTION, not the magnitude

#238's entry said the node "understates how fast a very hot core accelerates to melt". Measured,
it does not accelerate at all. Decay heat is its only source and decay heat falls, so the node
climbs **more and more slowly**: on an unmitigated large break the successive 400 °C bands took
**218 / 334 / 378 / 428 s**. After: **184 / 172 / 86 / 40 s**, strictly decreasing, 4.6× end to end.

| path | damage → melt, before | after |
|---|---|---|
| MD-1 large-break LOCA, no ECCS | 22.7 min | **8.1 min** |
| MD-2 stuck-open PORV (TMI) | 32.8 min | **4.9 min** |
| MD-3 station blackout | 38.0 min | **13.3 min** |

### The sketched shape was rejected on the source, not on taste

The entry proposed `heat × (1 + zirc_gain · max(0, clad − zirc_onset_c))` — linear above a
~1100 °C onset, `zirc_gain` fitted to a target timescale. Two things are wrong with it, and the
correct form is **simpler**, not more complex:

- **Arrhenius, so no onset constant is needed.** Baker-Just gives E/R = 45500/1.987 = **22 898 K**.
  At 900 °C the rate is 1.8 % of its 1204 °C value — the exponential retires low temperatures by
  itself, with no threshold to place and no discontinuity at one. One fewer constant than the sketch.
- **Parabolic, so there must be an oxide STATE.** The rate constant is 228× its reference value at
  2000 °C and **3140× at the melt point**; a bare temperature multiplier is unbounded and would slam
  the node to melt on contact. The protective oxide layer is what holds it, and modelling it is what
  makes the term self-limiting — a re-wetted node that dries again oxidises more slowly, because the
  oxide never un-forms. That state is also the **hydrogen hook** the entry explicitly wants.

Integrated as `w²` rather than `w`, because `dw/dt = K/2w` is singular at zero.

### The calibration is sourced, so the timescale is an OUTPUT

> *"At approximately 2200 °F, the oxidation heat … equals the decay heat generated after 8 hours
> from reactor shutdown."*

2200 °F is also **10 CFR 50.46(b)(1)** — *"The calculated maximum fuel element cladding temperature
shall not exceed 2200 °F"* — and near enough this plant's own `fuel_damage_c` (1200 °C). **The
model was stopping exactly where the second heat source turns on.** On our two-group decay curve the
8-hour figure is **1.1243 % of rated**; the algebra makes `Q_ox` equal it at the reference oxide and
temperature by construction, verified 1.1243 % vs 1.1243 %. The melt timescales above are therefore
*consequences*, not targets — which is the difference between this and a fitted `zirc_gain`.

| constant | value | status |
|---|---|---|
| `zirc.ea_over_r_k` | 22898 | **SECONDARY** — Baker-Just as reproduced; ANL-6548 named but not retrieved |
| `zirc.ref_temp_c` | 1204 | **REGULATORY PRIMARY**, retrieved — 10 CFR 50.46(b)(1) |
| `zirc.q_ref` | 0.011243 | **SECONDARY**, and load-bearing — no primary retrieved for the crossover |
| `zirc.tau_ref_s` | 80 | `[tune]`; corroboration uses the 50.46(b)(2) ECR limit (primary) with **recalled** clad geometry |

**PROVENANCE CORRECTED 2026-08-03.** The first version of this row said "three of four sourced"; an audit found only **one** was anchored to a primary that had actually been retrieved. Restated above. Two things soften it and one hardens it. Softening: **choosing** Baker-Just is not a judgement call at all — **10 CFR 50 Appendix K §5 REQUIRES it**, *"The rate of energy release, hydrogen generation, and cladding oxidation from the metal/water reaction shall be calculated using the Baker-Just equation"* (regulatory primary, retrieved) — and Appendix K incorporates ANL-6548 by reference without printing its constants, which is exactly why the numbers are a weaker class than the correlation choice. Also **"never steam-starved" was wrongly listed below as one of our simplifications**: Appendix K §5 says *"The reaction shall be assumed not to be steam limited"*, so it is the required model. Hardening: **`q_ref` carries the whole calibration and has no primary at all**, and it transfers a ratio stated for a real core onto our own decay curve — so "the melt timescale is an output, not a target" is true only *conditional on that number*. Weaker than first written.

Crossover measured: 1.0× the 8-hour decay heat at 1204 °C, 2.6× at 1300, **13.3×** at 1500, doubling
every **+66.7 °C** while decay heat falls.

### MD-11 asserts the second derivative, and that is deliberate

**A heat source that compresses melt by up to 6.7× moved zero existing gates.** Ten meltdown paths
assert *that* the core melts; none asserted how fast or which way the rate was going — the same
outcome-not-mechanism shape as #315 and #321 in the same session. A timing band would pin one
tuning and go stale on the next; MD-11 requires each 400 °C band to be crossed faster than the one
below (> 3× end to end) and recomputes the sourced anchor **from config**, so a re-fit of the decay
groups moves the expectation with the plant. Injection: `q_ref: 0` reddens 5 checks and inverts the
bands to 218/334/378/428.

### Declared, not built

Hydrogen **mass** (needs a core Zircaloy inventory this plant does not have; the entry itself calls
it the hook for *if* containment lands — the oxide state is that hook), oxidation heat into the bulk
core, and steam starvation. All three are in `Manuals/12` §5.5's NOTE.

### Pre-existing, now easier to reach

The clad node runs past **Zircaloy's ~1850 °C melting point** before `fuel_melt_c` (2800 °C, the
UO₂ figure) declares melt — MD-1 ends at 2859 °C clad against 1926 °C fuel. True on decay heat
alone; oxidation just gets there sooner. Separating clad melt/relocation from fuel melt is a larger
change and is not proposed here.

---

## 2026-08-03d — #315 §6 ruled: the leg split stays on total core heat

### The decision

**Do not drive the hot/cold leg split from the instantaneous fuel→coolant flux** *(OWNER RULING,
2026-08-03: "Do as you recommend.")*. `_Q_total` stays. No engine behaviour changed; the change is
that the question is closed, the reason is sourced to the primary, and three stale sourcing claims
are retired.

### The primary settles it — and overturned my own first answer

WTSM 12.2 (**ML11223A301**, USNRC HRTD Rev 0109) prints both setpoint equations. The only dynamic
compensation in either is on **Tavg**:

> *"1 + τ₁S / 1 + τ₂S = function generated by the lead-lag controller for Tavg dynamic compensation"*
>
> *"τ₃S / 1 + τ₃S = function generated by the rate-lag controller for Tavg dynamic compensation"*

**Nothing compensates the measured ΔT**, and the document contains no RTD, thermowell or
transport-lag wording at all — it calls the loop ΔT *"a measure of reactor power"* and reads it
directly. A ΔT carrying a ~20 s fuel lag is therefore a *worse* measure of core power, which is the
one job the real design gives that signal.

**How this nearly went wrong.** nrc.gov 403s from this session, so the pass first went to an
open-access restatement (Li Gang, FMSMT 2017) showing the trip comparing against
**ΔT·(1+τ₄s)(1+τ₅s)** — a lead-lag on the MEASURED ΔT, explicitly labelled as compensating RTD,
thermowell and transport lag. That is a *different* argument (the real channel compensates lag
*out*, so adding one is backwards), it is quotable and specific, and it was written into three
source files and posted to the issue before the primary was read. The primary has no such term; the
restatement describes a different design lineage. **All of it was reverted and rewritten.** Two
process points fall out: a peer-reviewed secondary restating someone else's equations is still not
a primary, and **the primary was already in the tree** — the workbench session fetched it that
morning (2026-08-03f) and its extract sits in `RD_workbench/inbox/sources/`. Reading the other
lanes' log first would have skipped the detour entirely.

### Measured cost of the alternative

| | OTΔT margin, full load rejection |
|---|---|
| `_Q_total` (shipped) | **18.4 %** of rated ΔT |
| corrected flux form | **1.8 %** |

The plant rides out either way — #311 wrote that check *positively*, asserting margin rather than
the absence of a trip, precisely so a near-miss could not pass as "no scram". **Not rescuable by a
faster fuel node**: `h_fc` 0.05 → 0.10 with `heat_gen_coeff` doubled to hold 389 °C at rated gives
`run_otdt` **21/39** and a scram at 1 s on `tavg high`. Those two constants are jointly calibrated,
so making the flux form viable means re-tuning the fuel node — large, and it moves Doppler timing
across every transient in the catalog.

### The candidate form was independently wrong, and the probe caught it

§6's formulation was `(Q_fuel→coolant + Q_pump)`. **TR-7b failed it by +8.9 % at t+3 min and +14 %
at t+30 min** — a steady-state offset, not a transient. Pump heat is deposited **at the pump**,
between the SG outlet and the core inlet: it lifts both legs equally and creates no rise *across the
core*. Corrected to flux alone, TR-7b passes. A probe written for one variant red-flagged a wrong
version of the other, for a physically right reason.

### The three reds, re-diagnosed on the merged tree

- **`run_campaign`** — did not reproduce. 51/51.
- **`run_pwr` "drifting pressure diverges"** — a defective check, not evidence. It compared the
  indication against its own value 40 s earlier, which measures the depth of the code-safety
  blowdown its own drift triggered (22 % margin), while the quantity it names was **exactly
  2.0000 MPa in every variant tried**. Spun out as **#321** and fixed: split into the offset it
  names plus a POSITIVE assertion of the HR1 chain it was accidentally covering. `run_pwr`
  **240 → 241**, each half injection-verified, and they discriminate independently.
- **`run_otdt`** — the one real red; the margin collapse above.

### Three stale sourcing sites retired

`pwr_config.js` ×2 and `DESIGN_COMPANION` §8.23 all still claimed ML11223A301 *"could not be
fetched"* and that the τ values are in it. Wrong on both halves: it has been read, and the τ's are
**named and never valued** (Table 12.2-1 lists both setpoints *"Variable (calculated)"*, K₁–K₆
*"manually adjusted preset"*). They are plant Tech Spec / COLR numbers, so the compensation
departure is **permanent unless a plant-specific source turns up**, not a pending fetch. The
distinction matters: the old wording sends the next agent to wait on a document that cannot answer.

## 2026-08-03e — #318: the load rate limit, and why the persistence delay is SOURCED

**Decision.** Operator load changes are rate-limited to **10 %/min, increases only**; the runback
**keeps** its persistence delay *(OWNER, 2026-08-03: "Come up with your own rate for this plant
that's fast enough to keep it interesting and slow enough to be safe.")*.

**The rate is this plant's own.** `Manuals/09` §8.0 already documented a ~10 %/min operator ramp
ceiling; the turbine now enforces it. My first pick was 5 %/min from a WTSM design-duty argument —
the measurement said 10 buys the same safety (OPΔT floor 4.57 vs 4.72) for half the wait, and I had
reached for the external source before checking what this plant had already decided.

**Increases only, because the direction is the whole point.** An increase drives ΔT up into the
OPΔT line; a decrease does the opposite (full rejection bottoms at 7.23). Limiting decreases turned
load REJECTIONS — events, not operator actions — into ramps and destroyed the ride-out.

**THE PERSISTENCE DELAY IS AN ADAPTATION OF A SOURCED FEATURE, NOT AN INVENTION.** I deleted it
twice believing it was mine. The real signal requires *"ΔT in **two out of four** reactor coolant
loops"* within 3 % (WTSM 12.2 §12.2.3.7/.8) — that 2/4 coincidence IS the law's noise immunity, and a
single-loop plant structurally cannot have it. A dwell requirement is the substitute for the voting
we cannot do. **The quote was already in the file, a few lines above the code I removed.**

**What the removal actually cost, and it was misattributed to the rate limit.** The engage test
fires on a single physics step, so a 0.10 s noise clip at margin 2.90 during a normal ramp
triggered a runback whose 5 % cut is permanent (`immediate` moves the operator's ask too). That is
`run_autoctl`'s 91.5 % and the SGTR EOP's 53.7 % inventory. One constant heals both.

**The two are complements.** The rate limit takes the normal-ramp dwell 6.40 s → 0.10 s against a
worst-casualty 10.58 s, so the constant sits in a gap two orders of magnitude wide instead of a
4.18 s squeeze. It may now be mis-sized the *other* way — 85× above the noise but only 2.08 s under
the worst casualty. Left alone: proven green, non-blocking, and my rig still does not reproduce the
gate's.

**Process note worth more than the fix.** I handed this over with both failures listed as RULED
OUT, having measured on the wrong rig (plain `SimulationService`, seed 42) for a probe that uses
`run_autoctl.js`'s own rig at seed 0xA07, and cited `ops_harness.js` — the wrong harness entirely.
A wrong "ruled out" is worse than an open question: it tells the next reader not to look there.

---

## 2026-08-03d — #311: OTΔT/OPΔT ON, and why the board readout was the real precondition

**Decision.** Wire the core ΔT margin to the board, then enable `otdt_opdt_trips`
*(OWNER RULING, 2026-08-03: "Let's go with your recommendations for all these items")*.

**What actually unblocked the flag was NOT the sourcing.** The shipped comment said turning it on
waited on "the equation form and K1/K4 checked against the document". The evidence pass ran (#311)
and settled the form, T′, P′, the 3 % rod stop and "No Interlocks" — but ML11223A301 **does not
contain K1–K6 or the τ's**; they are "manually adjusted preset" plant Tech Spec values, and Table
12.2-1 lists both setpoints as "Variable (calculated)". **The condition was waiting on something
the document never had**, and would have waited forever. The intercepts remain UNVERIFIED and are
declared as such in `otdt_opdt`, not hidden behind the flag.

**The real precondition was OBSERVABILITY, and it is a Q3 argument.** With the flag on and nothing
on the board, the player carries two reactor trips and a rod-withdrawal block driven by a
continuously computed setpoint they cannot see, watch move, or anticipate beyond a 3 %-out
annunciator. `bdDtMargin` closes it: binding margin plus the name of the trip it belongs to, amber
at the **rod stop** rather than the trip, because that is the boundary the player can still act
before.

**ONE readout, not five channels — and the space constraint is the weaker half of the reason.**
The board *is* full (measured: extent x 540..1945 / y 110..849; an occupancy scan returns no free
150×60 slot, and the free-corner survey shows 8 of 20 card corners open, of which NIS at (995,230)
is the one that already holds leg ΔT). But the design argument stands without that: **leg ΔT is
already displayed**, so `loop_delta_t` in % of rated would be a second copy of one measurement,
and each setpoint is implied by its margin — *a margin that moves while ΔT holds steady is the
moving trip line*, which is the entire OTΔT lesson. Naming the binding trip rather than combining
the two is deliberate: OTΔT is DNB, OPΔT is linear heat rate, and which one is closing is the
diagnosis.

**Sequencing paid off in a measurable way.** #311 forecast `run_campaign` 51/51 → 50/51 on
`pwr_lof`. It stayed **51/51**, because #314 was built first on recommendation and its breaker
trip catches that casualty at 23.0 s against OPΔT's 24.5 s — so the mission re-authored hours
earlier could not be re-broken by this flip.

**Three test-premise findings, one shape: a fixture nobody declared.** `run_m4`'s #295 probe
pinned a reason string; `run_m5`'s attention-stop test assumed an injected failure would not also
scram; `run_inspect` caught the new board item having no Scanner copy (the #308 class). The first
of those also caught **me**: my initial re-authoring asserted the survivor was "not one of the
three blocked trips", which is incoherent — #295's finding is that those block attempts are
*refused*, so nothing is blocked. I had written "this also passes on the old plant" into the
comment before testing it. It did not. **The discriminator is the TIME** (defect 64 s unscrammed
vs 4.1 s / 1.7 s healthy), and the corrected form passes on both configurations.

---

## 2026-08-03c — #314: the RCP breaker-position trip, and two comparators that disagreed

**Decision.** Build the **RCP breaker-position reactor trip** (1-of-1, blocked below P-7); decline
the RCP bus **under-voltage** and **under-frequency** trips as declared departures
(`DESIGN_COMPANION` §8.24) *(OWNER RULING, 2026-08-03: "Build the breaker position trip as you
recommend.")*.

**Why this one and not the other two — the split is HR1's new seam/roster line doing its job.**
All three are equally sourced (WTSM 12.2 §12.2.3.12). The breaker trip's signal **genuinely
exists**: `rcp_running` is already an instrument driving the RCP TRIP annunciator. The two bus
trips sense an **RCP electrical bus** this plant does not model, so building them means inventing
a signal and presenting it as an instrument — the #220 defect class. Note this is a **roster**
decision, exactly the kind HR1 stopped adjudicating on 2026-08-03b; it went through
`DESIGN_CRITERIA`'s four questions instead.

**Coincidence is 1-of-1, a declared adaptation.** The real rule is 2-of-4 and means *half the
pumps are gone*; this plant is single-loop with one RCP, so its analog is *the pump is gone*.
Inventing a second pump to vote with would be the same defect as inventing the bus.

**THE FINDING is worth more than the trip: `crossed()` and `_alarmRaw` had different
vocabularies.** Alarms have understood `is_false`/`is_open` since alarms existed; `crossed()` —
the path for every **trip and actuation** — knew only `high`/`low`/`is_true` and fell through to
`return false`. A trip authored with `is_false` was therefore **structurally incapable of firing,
with no throw, no warning, and green gates**. The new trip was inert on its first run and the tell
was a measurement, not an error: the plant rode the full 36-second loss-of-flow casualty to peak
core void 0.628 with the trip installed. `ui/app.js` already advertised `is_false: 'goes false'`
in its player-facing setpoint vocabulary, so the UI described a capability the kernel lacked.
**Rule: a direction word goes in both comparators, and a new trip is not built until you have
watched it fire** — no gate here can distinguish "correctly not firing" from "cannot fire".

**Blast radius, measured and small.** `pwr_lof` casualty **58.5 s → 23.0 s**, peak core void
**0.628 → 0.000**, fuel unchanged at 1279.4 °F (693 °C). Mode 5, Mode 3, HFP steady and the full
load rejection all unmoved; `run_pwr`, `run_m4`, `run_meltdown`, `run_reachability`,
`run_contract`, `run_scenarios`, `run_hr3`, `run_autoctl` all at baseline first time. Exactly one
gate moved: `run_campaign`, and only `pwr_lof`.

**A SECOND test-premise finding, and it outlives this change.** `run_m5`'s determinism check
required true power to match across two seeds within **1e-9** — *"true power identical
(noise-free)"*. **That is not a property of this plant.** HR1 means protection and every AUTO
channel decide from NOISY instruments, so as soon as an actuator moves, noise reaches TRUE STATE.
The check only held because its sequence was quiet: `rcp_trip` produced no protection action
inside 5 cycles. It does now, and the post-scram pressurizer/feed/dump channels immediately act on
their own noise. Traced rather than assumed — the scram fires on the **same cycle** in both seeds
(a boolean trip carries no noise), power stays bit-identical two cycles more, then diverges
1.7e-6 → 7.6e-6 → **1.8e-5 % power**, four orders below the power-range channel's own noise.
Re-banded to `< 0.01`, which still catches a real divergence and **passes on the pre-#314 engine
too**. Bit-identity for the SAME seed is the real determinism property and is untouched. The
generalisable part: **a test whose premise is "nothing happens" acquires a fixture nobody
declared**, and the first change that makes something happen looks like the culprit.

**`pwr_lof` re-authored, with a flag for the owner.** Its decision window is now one second, so it
is a demonstration rather than a choice, and **its premise has been invalidated three times** by
fidelity work. The new lesson — diverse *signals*, not redundant *channels* — is the right side of
`DESIGN_CRITERIA` §6, but three re-premisings is a fair argument for retiring the mission instead
of authoring a fourth. Recorded in the scenario file; not decided here.

---

## 2026-08-03b — HR1 stays binding, and it governs the SEAM rather than the ROSTER

**Decision.** HR1 remains a Hard Rule, with one sentence added separating what it governs from
what it does not *(OWNER RULING, 2026-08-03: "Apply the hr1 seam/roster sentence. Change design
criteria as you suggest.")*:

> **HR1 governs the SEAM, not the ROSTER.** Which quantities have instruments, what their
> lag/noise/failure characteristics are, and how many channels a trip votes are **plant design** —
> decided by `DESIGN_CRITERIA.md`'s four questions. A missing instrument is a design gap to be
> filed, **never an HR1 exception.**

**Why it stays binding, on §3's own admission test** (*"can this be violated silently?"*) rather
than on importance. Three measured cases: **#220**, `above_p9` deciding three protection functions
off `true_state.power_pct` with **all 34 runners green** — the fix moves nothing unless you FAIL
the channel; **#247**, the low-flow reactor trip reading true pump flow for two years; **#289**
(2026-08-01), a new `defaultOn` channel reading `true_state.power_pct`, caught by the gate. HR1 is
also one of the few rules with a working guard at all — HR2's is *none*, HR4's *partial*.

**Why the seam/roster split was needed, and it is #247 again.** That trip was filed as *"the one
documented HR1 exception"* and was not an exception — it was an instrument nobody had built. The
exception mechanism absorbed a **plant-design omission** and made it look settled;
`run_hardrules`' own comment names the failure — *"the honest reason was 'the instrument does not
exist' … that is laundering debt as compliance."* The **EXCEPTION/DEBT split fixed that at the
gate in 2026-07; the rule TEXT never got the same fix**, and still invited a missing instrument to
be filed as an exception. Now it cannot be.

**The measurement that came out of this, and it inverted the hypothesis.** I predicted the healthy
instrument layer would be transparent on slow transients and visible on fast ones, and recommended
measuring a scram and a LOCA to find the threshold. **There is no such threshold — the timing
shift belongs to the CHANNEL, not to the transient.** Full stack, seed 42, nothing failed:

| case | channel (lag) | gauge behind the plant |
|---|---|---|
| **A1 load drop 100 → 60 MWe, Tavg through 590 °F** | `tavg` (**4.0 s**) | **+4.00 s** |
| A1 load drop, power through 80 % | `power_range` (0.1 s) | +0.00 s |
| manual scram from HFP, power through 50 % | `power_range` (0.1 s) | +0.00 s |
| 20 % LOCA, pressure through the 1800 psi reactor trip | `primary_pressure` (0.5 s) | +0.00 s |

The **slow** demonstration shows the largest shift and the **fast** casualty shows none. It also
corrects a claim I made to the owner hours earlier — that the instrument layer is "nearly
transparent" during A1 — which was measured on `power_range` (0.1 s lag) when A1's subject
variable is Tavg (4.0 s). **Timing shift** follows the channel's time constant; **value
divergence** does follow transient speed (the LOCA reaches 414 psi and 25.6 °F). `DESIGN_CRITERIA`
§6.3's *"every transient in Tier A"* is replaced by the table.

**And this strengthens rather than weakens the case for the rule.** Because a healthy channel is
indistinguishable from truth on three of the four cases, a trip mis-wired to `true_state` behaves
identically in normal operation — the defect class cannot be found by playing the sim, only by a
gate.

**Blast radius:** documentation and one rule text; no code, no plant behaviour. Probe kept local
at `inbox/probe_hr1_lag.js` (gitignored).

---

## 2026-08-03 — the stated premise is PLANT DYNAMICS; instruments-vs-truth is a MODEL rule

**Decision.** The instruments-versus-truth framing is removed from every document that presented
it as the simulator's *premise, lesson, keystone or point*. **HR1 itself does not move** *(OWNER
DIRECTIVE, 2026-08-03: "THR STATED PREMIS IS NOT INSTRUMENT VS TRUTH THE PREMIS IS TO TEACH PLANT
DYNAMICS!!! We must purge the idea of the instruments vs truth premise from all documents.")*.

**Why this is a documentation change and not a model change.** `DESIGN_CRITERIA.md` §6.3 already
ruled the substance on 2026-08-02 and stated the boundary in terms: *"HR1 IS UNAFFECTED AND STAYS
EXACTLY AS IT IS. This is a statement about teaching emphasis, not about the model."* Two reasons
it must not be read as licence to soften the instrument layer, both from that section: protection
reading instruments rather than truth is what makes the failure scenarios possible at all, and **a
healthy channel's lag is itself part of the dynamics**, with no failure injected anywhere. **That
second reason was itself overstated as "every Tier A transient", and is now MEASURED and scoped**
— see the 2026-08-03b entry below: the shift belongs to the CHANNEL, and it is **4.00 s on `tavg`
during A1** against +0.00 s on power range through a scram and on pressure through a LOCA. So the edit is uniformly *subordination*,
never deletion: each site now says the coupling is what catches the bad channel, on the ordering
fact that you cannot perceive a lying instrument without already knowing what the plant should be
doing.

**The failure mode this exposes, and it is structural.** The ruling landed in
`DESIGN_CRITERIA.md` on 2026-08-02 and `CLAUDE.md`'s Domain conventions block still read *"Never
soften the gap — the dissonance is the lesson"* on 2026-08-03 — and an agent (me) read that line
and repeated the retired premise back to the owner in a recommendation the same morning. **A
ruling that does not reach `CLAUDE.md` has not landed**, because that file is loaded on every turn
and outvotes a Blueprint document nobody opened. Treat the CLAUDE.md edit as part of the ruling,
not as follow-up work.

**What was deliberately left.** Historical assertions of the old premise inside `CHANGELOG.md` and
`Diagnostic/TUNING_LOG.md` entries are RECORD; rewriting them would falsify what was believed at
the time. `M7_test_runner.md` §3.2 and `Gameplay_instructor_design.md` keep the phrase because both
describe the **architecture** — HR1 verification and the layer boundary — which is what stays.
`scenarios/bwr_isolation.js` (*"distrust their level gauge"*) is wrong twice over, since BWR
shrink/swell is real physics and the gauge is not lying, but BWR is ON HOLD.

**Blast radius:** `run_all` 35 runners at baseline except `run_hardrules` (write-up drift only —
the behavioural change is zero). Manual set Rev 12 → 13, `README.md` only, no number moved.

## 2026-08-03d — #315: the leg split read FISSION power, so a tripped reactor had no ΔT

### The change

`pwr_thermal.js` `stepCoolant`, one line: the hot/cold leg split is driven by **`_Q_total`**
(total core heat — fission + the decay tail) instead of `power_pct` (fission alone). Plus
**TR-7b** in the behaviour battery, `run_behavior` 44 → 45, and a catalog row for it.
Owner-directed after the investigation ("Fix it", 2026-08-03).

### Why it is a consistency fix rather than a new claim

`stepFuel` already runs on `_Q_total`. The Tavg balance already runs on the actual fuel→coolant
flux. The split was the **one line in that function still reading neutron flux** while the two
above it ran on heat. Energy balance: heat removed = flow × leg ΔT, and that does not stop
holding when the rods drop.

At rated, `_Q_total` is exactly 1.0 (`_P·(1 − f₀) + decay`, f₀ = 0.07, and decay is at its 7 %
equilibrium), so `delta_T_rated` keeps its meaning and **no at-power behaviour moves** — verified
byte-identical over 10 minutes at HFP, every end-state field equal to 3 decimals.

### Why it survived to now — the general shape

**Fission and total core heat are equal by construction in steady state.** Every probe in this
tree measures at or near equilibrium, so 44 of them agreed with a formula that is wrong
everywhere else. *A term that is an identity in the regime you test in is a term nothing tests.*
That is the same class as #295 (a permissive nothing exercised) and #286 (channels asserted only
in aggregate), and it is why the injection proof came before the probe was written.

### What was measured

| case (full stack, free-play lineup) | ΔT shipped | ΔT fixed |
|---|---|---|
| HFP steady, 10 min | 59.4 °F | **59.4 °F — byte-identical** |
| scram +3 min, full flow (6.61 % decay heat) | **0.0 °F** | 3.93 °F |
| scram +30 min (4.0 %) | **0.0 °F** | 2.35 °F |
| scram then RCP trip | 3.8 °F peak | 44.4 °F peak |
| RCP trip at power (low-flow scram) | 9.9 °F peak | 50.5 °F peak |
| 40 % cold-leg LOCA | 0.0 °F | **0.0 °F — the saturation cap dominates** |

**The operator-facing half is the one that matters.** Indicated `thot − tcold`, 1500 samples over
25 minutes after a trip: shipped, mean **0.000 °F**, and the **cold leg reads hotter than the hot
leg in 724 of them (48.3 %)**. Fixed: mean 3.02 °F, **0 inversions**. That question — is the hot
leg above the cold leg — is the direct read on whether flow is still cooling the core.

### Not display-only

`loop_delta_t`, the protection input for both OTΔT and OPΔT (#311), is
`100 · (indicated thot − tcold) / ΔT₀`. With that flag on, the split is a protection input.
`run_otdt` 39/39 under the fix.

### The option NOT taken, and why it is recorded

Driving the split from the **instantaneous flux** (`Q_fuel_to_coolant + Q_pump`, normalised) is
the more rigorous quantity — it carries the fuel node's stored-energy dump, so ΔT decays over
~2 minutes after a trip instead of following the neutron flux down, which is closer to a real
trip. It is **not free**: measured, it brings a full load rejection to **within 1.6 % of an OTΔT
trip** (`run_otdt` 38/39), and reddens `run_pwr` (35/36) and `run_campaign` (50/51). Those reds
may be pinning the old behaviour rather than condemning it (HR10), but settling that needs an
evidence pass on whether the leg-ΔT measurement should carry the fuel lag, plus a content re-band.
Kept in #315 §6 as a separate question.

### The issue's second consumer was measured and rejected

`pwr_steam_generator.js:321`, the condenser backpressure load fraction, is **measurably inert**:
identical output A/B even with the CW inlet 8.3 °C off reference through a scram. Structural
reason — `loadFrac` sets a `span` added to *both* legs of `pSat(cw + span) − pSat(cwRef + span)`,
so it enters only through the curvature of the saturation line. Quantified across the realistic
divergence (loadFrac 0 vs 0.07): **0.030 kPa** at 30 °C CW to **0.228 kPa** at 45 °C, against a
**3.386 kPa** (0.1 inHg) display digit. Not changed.

### Honest caveats

- **With the pumps off the split divides by `flow_floor` = 0.1**, so the fixed form reports ~37 °F
  on a plant with no forced flow. That is internally consistent given the floor — 10 % flow really
  would produce that ΔT — but the floor is a numerical guard, not a natural-circulation model, and
  this plant has none. The old form read 0 °F there by accident, not by being right.
- **The original issue was wrong about the LOCA.** It guessed the saturation cap would mask the
  effect in the transients where it was largest; measured, the cap pins ΔT to 0.0 °F in *both*
  forms for the whole break. The cases are post-trip with flow.

---

## 2026-08-03c — Physics tab: the under-the-hood numbers, and the seam it exposed in `power_pct`

### What was built

A fifth tab in the Tools block — **Operate · Inject Failure · Graph · Physics · Settings** —
showing **true plant state**, 24 rows in five groups, ordered along the energy path
(Reactivity · Core heat · Primary coolant · Loop pressure · Heat sink & output)
*(OWNER DIRECTIVE, 2026-08-03: "Add a tab to the tools block called Physics. This will show the
most important, under the hood physics numbers. Group and order them logically.")*. Data lives in
`PROFILES.pwr.physics` (`ui/app.js`); `buildPhysics()` caches its cells at build time and
`renderPhysics()` updates them only while the pane is on screen.

### Why it is not an HR1 problem

HR1 permits true state **as an explicit diagnostic overlay**; the RBMK/BWR All view has carried
an Instruments / True / Both selector for as long as it has existed, and the strip chart already
traces true physics in Learning mode. The tab is that overlay, labelled as such, and it is
**inert**: nothing on it alarms, nothing on it is what protection reads. The manual (§7.5) says
plainly to read it *after* a transient rather than during one.

### What earns a row — measured, not chosen by taste

Rows were selected against the board's own reads (the `IN()` / `TS()` calls in
`pwr_board_wiring.js`, 46 instrument keys and 3 true_state keys). Everything the board can
already show was a candidate for exclusion; what is left is the set with **no instrument at all,
or none wired to a readout**: fuel and clad temperature, decay heat, xenon, both void fractions,
RCS inventory, the three-node loop pressure split, suction subcooling, RCP cavitation, leak flow,
cycle efficiency. A few board-visible anchors stay as the denominators their group is read
against (fission power, MWe out).

### The finding: `power_pct` is FISSION power, and nothing said so

`s.power_pct` is `_P × 100` — the chain reaction alone. Total core heat is
`_Q_total = _P·(1 − f₀) + (H1 + H2)`, f₀ = 0.07, computed at `pwr_engine.js:363` and burned by
`pwr_thermal.js:42` and `:172`. **At steady power the two are equal by construction**, which is
why nothing had ever tripped over it. Measured a few seconds into a 20 %-of-rated cold-leg LOCA:
**fission 11.0 MWt against decay heat 21.0 MWt** — a core apparently making less heat than its
own decay tail. `_Q_total` was never published, so the first draft of the tab was going to
re-derive it in the UI from `power_pct`, `decay_heat_pct` and a config constant — a second copy
of a formula that does not move itself (#308's shape). **New `true_state.core_heat_pct`**
(31.2 MWt in that sample), documented in `CONTEXT.md` §6.3 so `run_contract` guards it both ways;
`run_contract` 140 → 141. The tab shows fission, decay and total as three separate rows, and
cycle efficiency divides by the total.

### Two display defects the eye would not have caught

Both found by dumping the rendered pane rather than looking at it.

- **`toFixed(0)` on MPa collapsed the loop pressure split.** 2235 / 2279 / 2199 psi all printed
  as **"15 MPa"** in SI. The spread is ~80 psi (0.55 MPa) end to end and it is the entire point
  of that group — the cold leg reaches an ECCS setpoint before the gauge does, and the pump
  suction cavitates first. `physP()` is per-unit: 0 decimals in psi, 2 in MPa. This is #238's
  quantisation trap in a new place, and it landed the same way — a number that renders fine.
- **A critical reactor printed "-0 pcm."** `toFixed(0)` on −0.004. It reads as slightly
  subcritical and means exactly on.

### And one wrong premise of my own, caught by measuring

The first `Peak clad temp` colour rule cautioned when clad exceeded the hot leg, on the reasoning
that a node above the coolant is uncovered. Measured, that fires **at hot full power**: on a
covered core `stepCladding` floors the hot node at the fuel temperature, so clad == fuel (693 °C
/ 1280 °F at HFP) and both sit far above the legs. The node only *separates from the fuel* once
uncovery starts (#213), which is the state worth marking; the alarm step is `checkDamage`'s own
criterion, `fuel_damage_c`.

### Injection-verified

LOCA at 20 % of rated, full stack in the browser: every row moves, and the conditional colours
fire where they should — `RCS inventory 0.0 %` alarm, `Loop void 100.0 %`, `RCP cavitation
100 %`, `Primary leak flow 20.00 %`, `Suction subcooling −1 °F` alarm, `Peak clad temp` caution
in the window where the hot node separates and clear again once it re-merges. Zero page errors.
Tab strip measured at 1280 / 1440 / 1920 px: five tabs, one line, no overflow (worst case 71.6 px
box against 63.0 px of text for "Inject Failure").

---

## 2026-08-03b — #307: turbine roll DEFERRED, and the declaration that was wrong about the real plant

### The decision

**Do not build turbine roll or a no-load speed hold** *(OWNER RULING, 2026-08-03: "Let's go with
your recommendation and defer it.")*. No engine, config, control or scenario code changed. Two
things that did **not** depend on the ruling were fixed in the same pass: the PWR-N05 scope note,
which misdescribed the real plant, and the overspeed trip, which was documented as live
protection the plant cannot reach.

### Why defer — the criteria argument, not the cost argument

#307's own recommendation argued build cost and blast radius. That is the weaker case. Measured
against `DESIGN_CRITERIA` §6, turbine roll takes the **procedure route** to Q2 credit and earns
**nothing on the dynamics route**: the one coupling it would add — no-load steam as a heat sink at
zero MWe — is the *"steam flow ≠ electrical output"* lesson the steam dump and #284's `mwe_output`
fix already carry. The ruled priority is dynamics first *(OWNER RULING, 2026-08-02: "The most
important ideas are plant dynamics followed by how to operate the plant.")*, and §6.9 already
records that **A1 and A2 have no deliberate demonstration anywhere**. Building a Tier B skill while
the top-priority tier has undemonstrated couplings inverts the ruling made the day before.

Q3 did **not** veto — the honest shape is one setpoint box and one permissive, below — so this is
Q2 ordering, not a complexity refusal. That distinction matters if it is ever re-opened.

### Three measurements the issue did not have

**1. The off-line rotor branch cannot be retuned; it has to be replaced.** Rated flow buys
**0.8 rpm** (0.044 % of rated) and holding 1800 needs **2250× rated** admission — #238 records
that much. It does *not* record the **`if (rpm < 1) rpm = 0` floor**, which at the shipped 0.02 s
`PHYSICS_DT` needs **> 2500× rated** just to leave standstill. So the first admission that can
start the rotor settles it at **exactly 2000 rpm**, past the 1980 rpm overspeed trip: there is no
operating point between "will not turn" and "overspeed". Start needs `flow·tpf/inertia > 1/dt`
(50); hold needs `= rpm_rated/coastdown_tau` (45). The two constraints are the wrong way round.

**2. "No-load admission" and "a speed controller" are ONE change.** Off line,
`load_target_mwe = 0` → `turbine_demand_frac = 0` → measured `governor_valve_pct` **0.000**,
`steam_flow_normalized` **0.0000**. There is no steam path off line by construction, so the
governor must be driven by *speed* rather than load when the breaker is open. The issue's plan
costs steps 1 and 2 separately; they are the same edit.

**3. The atomic sync is thermally a non-event, which is why leaving it is defensible.** Full stack
from `5_percent` at accel 10×: `connect_grid` puts the rotor at **1800 rpm** and **4.68 MWe**
inside one 30 s sample, the dump hands off **5.13 % → 0.54 %**, Tavg moves **0.1 °F**, steam
pressure **1196 → 1194 psi (8.24 → 8.23 MPa)**. The *outcome* of the evolution is already right.
What is missing is the operator's half — which is exactly what makes it Tier B and not Tier A.

### The shape to build, if it is ever re-opened — and it is NOT a synchroscope

The scope note added in `21baf03` described the real evolution as *"matches speed and phase at the
synchroscope — four operator actions"*. That was **recall**, and it is wrong for an EHC machine.
Sourced: the operator selects a **discrete speed setpoint** by pushbutton — *CLOSE VALVES, 100,
800, 1500, **1800 RPM**, OVERSPEED TEST* — plus an **acceleration rate** (SLOW ≈ **30 min** to
1800 rpm); the EHC's speed control section takes over near rated and **holds no-load speed
automatically**; synchronising *"can be carried out by the operator, or in the coordinated control
mode … automatically initiated and implemented"*; and after breaker closure the system
*"automatically shifts to load control"*.

So the prototypical control is a **speed setpoint + a rate** — the same idiom as Pressure SP and
Dump SP — and building the synchroscope would be *less* prototypical for *more* board complexity.
Recommended shape: drive the governor from a speed controller when the breaker is open, add one
**Turbine Speed SP** box, and gate `connect_grid` on a **synchronising permissive** refused with a
reason (`reset_rps` / `RODS_NOT_INSERTED` pattern). **Do not add a `breaker_closed` field** — that
is the #284 shape and #307 correctly declines it. Blast radius measured at **17 `connect_grid`
sites**. Widen `turbine_rpm`'s [0, 2000] range when you do.

**Citation strength.** WTSM §11.3 (ML11223A295) / §19.0 (ML11223A342); the discrete setpoint list
is **GE** EHC (ML11258A318), *not* Westinghouse, and is not laundered as such. All are
**search-index extracts** — nrc.gov 403s every direct fetch, including `curl` with a browser UA and
the `web.archive.org/web/2023id_/` workaround — i.e. the weaker class, per the ML11223A219
precedent of 2026-07-28q. Corroboration that it is the right document: **§8.22 already quotes WTSM
§11.3** on the far end of the same evolution (the EHC's 5 % / 1 %-per-min load floor at breaker
closure).

### The overspeed trip was unreachable and documented as live

Peak true rpm: **1800.00** on line in Follow, **1800.00** in Manual against a 2×-rated MWe demand,
**1799.10** with the MSIVs shut and the breaker closed. The sync branch is monotone toward rated
for `dt < 2·sync_tau`, so it cannot overshoot; the off-line branch cannot start. `run_reachability`
**Part A passed it** — 1980 sits strictly inside `turbine_rpm`'s [0, 2000] — which is that runner's
own hollow-assertion shape, one instrument short of its coverage. Now **B3**, and deliberately
**inverted**: it asserts the trip cannot fire, so it **goes red when the roll is built** and forces
§8.25 to be retired rather than absorbed (the §8.17 pattern). 59 → **62 checks**.

**The first injection was a bad test, and that is the lesson.** Forcing an overshoot by taking
`sync_tau` 0.5 → 0.005 changed nothing — peak 1801.02 either way — because `hot_full_power`
*starts* at rated, so `(rated − rpm)` is zero and there is nothing to overshoot. Valid injections:
setpoint → 1700 reddens one check; sync target → 2100 rpm reddens both, at a peak indicated
**2000.00**, which is the instrument range clamping and is itself the note above about widening it.

### Incidental, same class

`Manuals/12` §9.0 documented the **pre-#284** `mwe_output` — *"(core power) × 100 MWe × …"* — when
the engine has read **turbine steam admission** since that fix, whose own comment records the
50 MWe ask that indicated 98.8 MWe. The code moved; the manual kept reciting the removed defect.
Corrected, with the divergence case stated. Manual set **Rev 13**.

---

## 2026-08-03a — #311: OTΔT / OPΔT, and why the limit line is SCALED rather than re-anchored

### The decision

Build Overtemperature ΔT and Overpower ΔT in the reduced form the owner ruled *(OWNER RULING,
2026-08-02: "311: a.")* — no axial-offset term — and ship them **DEFAULT OFF**
(`protection_options.otdt_opdt_trips`).

Two reasons for OFF, and they are different in kind. The first is the #216 pattern: build off,
measure the blast radius by flipping one flag rather than guessing at it. The second is a
**sourcing block** — the ruling requires the equations to be sourced to WTSM 12.2 (ML11223A301),
and in the session that built this **every outbound host was refused by the environment's egress
policy** (nrc.gov, its mirrors, archive.org, and WebFetch on all of them). The proxy README says
a policy 403 must be reported, not routed around. Search summaries existed and were deliberately
not used: the SOP names another agent's summary as not-evidence.

### Where the numbers come from, since the document could not be read

| | source |
|---|---|
| ΔT₀ = **59.4 °F (33.0 °C)**, Tavg′ = **579.3 °F (304.1 °C)**, P′ = **2235 psi (15.41 MPa)** | MEASURED off this plant |
| K₂, K₃ (the compensation gradients) | DERIVED in closed form from this engine's own DNB criterion |
| `dnb_margin_factor` (≡ K₁), K₄ | **UNSOURCED** — fitted to this plant's measured separation |
| lead-lag τ₁/τ₂, OPΔT rate term τ₃ | **NOT BUILT** — the values are in the unreachable document |
| rod stop at (setpoint − 3 %), withdrawal-only | **SOURCED** — WTSM 8.1 §8.1.7.3, ML11223A252, quoted in the issue itself |

The derivation matters because it is what makes the gradients defensible without the document.
`pwr_thermal.hFcEffective` collapses heat transfer at `thermal.dnb_margin_c` of hot-leg
subcooling, and Thot = Tavg + ΔT/2, so ΔT_DNB = 2·(T_sat(P) − dnb_margin_c − Tavg) **exactly**.
Copying another plant's K₂/K₃ would have been positively wrong: they are gradients of *that*
plant's DNBR surface.

### Why SCALED and not re-anchored — the mistake, and what caught it

The obvious construction takes that slope and pairs it with a fitted intercept. That **rotates**
the limit line. Measured: a full load rejection lifts Tavg ~29 °F (16 °C), which at the unscaled
slope drops the trip line 120 % → 23 % against a ΔT of ~46 %, and **the plant scrammed at 55.0 s
on `otdt_margin low`** — the ride-out this plant exists to teach, whose dump was resized to 40 %
eleven days ago for exactly that purpose.

Scaling the surface instead —  OTΔT_sp = 100·f·ΔT_DNB(Tavg,P)/ΔT₀, f = 0.60 — keeps the line and
the plant's actual DNB margin moving together, which is what a limit line is for. It also puts
the equivalent linearized gradients **inside** the published real ranges (**K₂ 0.0202 /°F**
against 0.015–0.028; **K₃ 0.00134 /psi** against 0.00079–0.00143) where the unscaled ones were
1.5–2× steeper than any real value. That steepness was visible *before* the measurement and was
missed — it is the cheapest tell available and it is now a gate check.

### The plant finding this produced — the issue's pair is not symmetric

Measured across 13 casualties and 8 normal evolutions, full stack: **no casualty on this plant
reaches DNB while un-scrammed**, so #311's "can be walked into a DNB-limited condition with every
gauge in band" does not reproduce here. The three that reach DNB get there by depressurizing and
have already scrammed on low pressure (LOCA 6.0 s vs 6.5 s; PORV 12.5 s vs 18.0 s).

**OPΔT is the one with bite.** A 30 % steam line break holds **114.2 % power for 30 minutes with
no reactor trip** (power-range high is at 120 %); a 15 % break holds 107.8 % the same way. The
measured separation — normal operation ≤ **104.5 %** of rated ΔT against a casualty floor of
**111.1 %** — leaves a 105–111 window, and **K₄ = 1.08** sits mid-window. That it is also the
prototypical intercept is corroboration arrived at afterwards, not the reason it was chosen.

**OTΔT has nothing to catch as the plant stands**, and that is recorded rather than dressed up.
It is here for prototypicality and because it becomes binding the moment Tavg or pressure moves.

### What is deliberately NOT built

The **turbine runback**. The real rod-stop signal also reduces load; an actuation here fires once
(`actuationFired`), so a ramped load reduction is a new actuation class rather than a setpoint.
The ruling left the sequencing open, and adding a new actuation class in the same change as two
new trips, on constants that are not yet sourced, is the wrong order.

### Gate deltas

`run_otdt.js` **NEW, 39 checks** — its own runner because the trips ship off and `pwr_control.js`
reads the flag at load time, so no existing suite can see them. Injection-verified four ways
(rotated line → 3 red, reproducing the original defect's exact numbers; rod stops deleted → 3;
`withdrawal_only` cleared → 2; margin factor to 0.95 → the 2 K-band checks). Everything else is
**unmoved**, which is the point of the flag: `run_all --fast` is 33/33 at baseline with it off.

---

## 2026-08-02b — #295 F1/F2: a trip block is an ENABLE, not a switch

**Decision.** `setTripBlock` requires the trip's block permissive and nothing else, and
operator-set blocks auto-reinstate exactly like automatic ones. This **supersedes the
"hybrid model" of 2026-07-24**, which additionally allowed a block any time the trip was not
already asserted and exempted manual blocks from reinstatement.

**Why the supersession is not an owner-ruling reversal — and the authority order, corrected.**
The hybrid rule was owner-confirmed to solve *"you couldn't block a trip proactively during an
evolution"*. What overturns it, in HR9 order:

1. **MEASURED (Q0):** three reactor trips accepted blocks at 2235 psi (15.41 MPa) / 100 % power,
   and a 20 % cold-leg LOCA rode **64 s unscrammed**. A defeatable reactor trip is wrong on its
   own terms; this is a fact about the plant, not about any document.
2. **SPEC:** M4b §3c — *"refused … unless `trip_block_permissive` is satisfied against the
   CURRENT instruments"*. A module spec outranks authored content.
3. **PROTOTYPICALITY — UNVERIFIED, and load-bearing.** The claim that the real P-11 bypass is
   physically enabled only below ~1970 psig (attributed to NUREG-1431 LCO 3.3.1/3.3.2) came from
   #295 F1, whose own coverage statement says its NUREG references were *"cited from repo-carried
   citations plus recall"*. **Measured 2026-08-02: there is no sourced P-11 citation anywhere in
   this repo** — #220 sourced P-7/P-8/P-9 and never covered P-11. This does not affect finding
   (1); it does affect the **shape** chosen — full permissive gate vs. narrowing the proactive
   rule to trips lacking their own `block_permissive`. An evidence pass is owed before this
   shape hardens into precedent.

**The authored content is a CANARY here, not an authority** (HR9), and the first draft of this
entry got that backwards — it argued that the 2026-07-24 premise "had not survived the content
written since", which makes a checklist the arbiter of a control-layer design. Corrected. What
the content legitimately supplied was (a) the signal that something had diverged — the startup
checklist says *"the plant will not let you block them down there"* and PWR-N15 lowers the
Pressure SP inside P-11 *"which is what makes the next two steps possible"*, both false in the
kernel at the time — and (b) **blast-radius evidence**, that the fix breaks nothing authored.
Neither is a reason to change the plant. See `DESIGN_CRITERIA.md` §1 Q1.

**What it cost the plant:** nothing authored. `run_procedures` 23/23, `run_procedures_stack`
23/23 204 checks, `run_campaign` 51/51 unchanged.

**Design note — `manualTripBlocks` is now PROVENANCE ONLY.** It still records who set a block,
for the save format and the UI, and no longer changes behaviour. Kept rather than deleted
because removing it is a save-format change (`run_m4`'s legacy-save probe deletes the key
deliberately) for no behavioural gain.

**Two properties worth knowing before re-verifying this.** (1) **The two halves each heal F1
alone** — with auto-reinstate corrected, a block set outside its permissive is deleted on the
next `evaluate`, so a single-sided injection leaves the LOCA probe green (8 checks red, vs 12
with both reverted). (2) **`can_block` must track the engage rule exactly**, because the board
greys the TRIP BLOCKS buttons off that flag; a divergence hands the player a live button the
command path refuses.

---

## 2026-08-02 — #310: a procedure step can RAMP, and PWR-N15 needed two more trip blocks

### The decision

Add `ramp: [{action, arg, points}]` to the authored-procedure step schema, and author PWR-N15
as `pwr_cooldown` using it. **Chose option (b) from #310 over the recommended (a)**, on
measurement.

### Why (a) — a discrete Dump SP walk-down — cannot work here

The steam dump is `clip((P_steam − SP)/steam_dump_band, 0, 1)` with `steam_dump_band` 0.25 MPa,
capped at `steam_dump_max` 0.40, and the primary follows the secondary with τ ≈ 37 s. A setpoint
step of ΔT therefore bursts at ≈ ΔT/τ. Measured full stack from `hot_zero_power`, 30 s window:
an 18 °F (10 °C) step peaks at **−1168.2 °F/hr (−649 °C/hr)**; a whole 46.8 °F (26 °C) leg taken
at once at **−2178 °F/hr (−1210 °C/hr)**; the setpoint at its 29 psi (0.2 MPa) stop at
**−2340 °F/hr (−1300 °C/hr)**. Holding the −90 °F/hr programme with steps needs them ≤ 1.4 °F
(0.8 °C) — about 250 steps. #310 anticipated this outcome and named it the argument for (b).

### Why (b) is cheap — the fact that changed the estimate

#310 costed (b) as "a schema change to the procedure runner **and to `verify_manual_follow`**".
It is neither. **The live checklist never issues `cmd`.** `ui/app.js renderChecklist` draws the
step text, its `control`/`target` pills and its `hl` highlights, and the instructor grades off
`acc` while watching for the *player's own* command as evidence (`_cmdEvidence`). `cmd` and
`hold` exist for the two replay gates and nowhere else, and `verify_manual_follow` iterates
`STEP_UI` for control reachability without stepping the plant. So `ramp` is a replay-side field:
~10 lines in `run_procedures.js`, ~15 in `run_procedures_stack.js`, no UI, no browser gate.

Three sub-decisions inside it:

- **`cmd` stays on a ramp step and is NOT issued.** It is the representative operator action —
  what the instructor recognises, and what the player has typed by the end of the leg. Issuing
  it as well would put the leg's end value on the board at t=0, i.e. exactly the step the ramp
  exists to avoid.
- **`points` (a polyline), not `from`/`to`.** The programme is linear in TEMPERATURE and the
  setpoints are pressures, so a straight interpolation in MPa accelerates through a leg —
  measured, −72 °C/hr at leg ends against a −50 programme. Five authored points per leg holds
  ±11 %. Encoding the curve in the DATA keeps `Psat` out of a plant-agnostic runner.
- **Re-issued every 10 sim-s**, and the last point is issued exactly at the end of the step so a
  leg cannot stop a few tenths of a psi short of where the next leg starts.

### The plant finding this produced

"Block SI" is three actions and PWR-N15 named one. HPI/LPI OFF disarms the ESF arm and stops the
pumps; it does not touch the RPS, and **two** entries in `PWR_TRIPS` watch `primary_pressure`
downward — `lo_press` (12.41 MPa) and **`si_trip`** (PI-3, reactor trip on safety injection,
12.4 MPa). Both are `blockable` behind the same P-11 permissive and neither auto-blocks on the
way DOWN. Measured: unblocked, the plant scrams ~320 s into the first cooling leg; with only
`lo_press` blocked it scrams one step later. The turbine trip then puts the dump into
Tavg-error mode and the cooldown runs away at −306 °C/hr. Because the block needs the
permissive, the checklist lowers the Pressure SP to 1901 psi (13.11 MPa) first — which is where
the cooldown's own subcooling programme starts, so it costs nothing.

### `stack_only`

`run_procedures.js` gained a procedure-level `stack_only` flag. N15 cannot be replayed below
M4: the board's only boron control is the `boron_conc` channel target box (`set_auto_setpoint`;
there is no manual borate/dilute on the board at all), so engine-direct runs the cooldown
unborated, the MTC takes the core critical and the plant heats back up to 292.6 °C — nine reds
describing one missing layer. **It is guarded against becoming an escape hatch**: the flag's one
check is that the procedure really does carry a NON_ENGINE_ACTION command, so it cannot be
pinned onto a procedure engine-direct could run.

### Guard bands, and the one check that distinguishes (a) from (b)

`never tavg_rate_c_per_hr < -150` (°C/hr) is not the programme (−50) — it is the line between a
transient and a runaway, placed where every known failure of this evolution sits far beyond it
(−306 missed trip block, −649 a 10 °C step, −843 RHR at a 100 % HX split, −1300 setpoint at its
stop) and the authored ramps' worst transient (−95 for ~10 s at RHR placement) sits inside.
**Injection-verified, and the important row is the last:** flattening all four legs to a single
step each leaves **27/28** — every acceptance still passes, because a staircase *arrives*
everywhere the procedure says it will. The rate guard is the only check that can tell them
apart.

### Gate deltas

`run_procedures_stack` 22/22 176 → **23/23 204**; `run_procedures` 22/22 99 → **23/23 100**;
`run_manual_controls` 94 → **122**; `verify_manual_follow` 141 → **183**; `run_procdocs`
23 → **25** (coverage 10 → 11 of 58 documented procedures); `run_flags` 289 → **292** — that
last one was the registry gate catching a missing `procedure:pwr_cooldown` entry, which is
exactly its job: a procedure the player can open with no flag behind it ships ungated.
Manual set Rev 11 → **12**.

---

## 2026-08-01c — the trend preseed becomes real data, computed off the main thread

*(OWNER, 2026-08-01: "when you make preset starts, run them for 30 minutes to fill up the graph
with real data before saving")*

### The decision

Keep the instant flat seed, then **replace it** with a genuinely-run 30 minutes computed in
`setTimeout` slices and cached per `plant|design_version|initial_state` for the session
(`ui/app.js` `ensurePreseed`). The live recorder and the preseed now share one
`chartSample(rawIns, trueState)` so they cannot drift apart about what a row contains.

The preseed was not missing — it was **synthetic**: #237 seeded the 30-minute window with 360
identical rows, so a fresh plant drew a ruler-straight line.

### Why not synchronously, and why 40-tick slices

A 30-plant-minute full-stack run measures **1874 ms**, and a fresh chart buffer happens on
boot, reset, plant switch **and** every mission start — synchronous would freeze all four. A
tick costs ~1.04 ms, so slices are **40 ticks (~42 ms)**, under the ~50 ms a user reads as a
stutter; the first draft's 120 (~125 ms) would have been visible jank fifteen times over.

Options weighed and rejected: a **baked generated table** (zero runtime cost, but a generated
artifact that goes stale whenever physics moves and would need its own gate), and **synthetic
noise over the flat seed** (instant, but a drawing of real data rather than real data, and it
cannot show the genuine xenon/boron drifts).

### What it does not do

Change the **shape**. The initial conditions are constructed as true steady states, so 30 real
minutes is a *noisy flat line* — measured at `hot_full_power`: power 99.78–100.2 %, Tavg
304.0–304.2 °C, pzr level 54.6–55.3 %, sg_level 64.25–65.28. The gain is instrument texture and
the genuine slow drifts. This was put to the owner **before** building, because "real data"
could reasonably have been expected to look more interesting than it does.

### Two defects in the first draft

1. A same-key re-seed **while a run is in flight** — reset to the same IC, a mission restart —
   would have applied the finished trace against the **`t0` it started with**, not the new one.
   `preseed.pendingT0` is tracked separately and read at completion.
2. The 120-tick slice above.

Both were found by reading the code back rather than by running it, which is the only reason
they are not in the history as symptoms.

### The verification, and why the first two attempts were worthless

Counting distinct y-values across **all** SVG polylines returned **32 with the feature on and
32 with it off** — it was reading ~250 gauge sparklines, not the trend chart, and would have
"passed" a completely broken implementation. Scoped to `#chartCanvas` the A/B is unambiguous:
**28 distinct y over 61 points** with the swap, **exactly 1** with the `ensurePreseed` call
neutered — a perfectly horizontal line, the reported defect.

New `verify_e2e_ui` section `testTrendPreseed`, injection-verified (the gate fails with that
number in its message). The screenshot score is `ENGINES × VIEWS`, so **the baseline does not
move** — sections here are free to add.

---

## 2026-08-01b — #289: rod control joins the free-play lineup, and the dump turns out to be transient

*(OWNER RULING, 2026-08-01: "Let's start the rods in auto. Might as well, everything else
starts in auto."; and "the auto rod button doesn't follow the color convention. Auto on it
should be green not white.")*

### The decision

> **SUPERSEDED by #460** *(OWNER DIRECTIVE, 2026-08-11: "lets start with rods in manual.")* —
> `defaultOn` is gone and free play comes up in MANUAL. Everything below is the record of why
> the auto default was taken and why its gate was not optional; the gate reasoning is still
> live and is retained as a warning in `pwr_control.js` for anyone re-adding a default. What
> expired is this entry's stated premise, *"everything else starts in auto"* — the Mode 1
> lineup already put generator load in MANUAL. See the 2026-08-11-backshop-c entry.

`rods_tavg` is `defaultOn` **above 10 % indicated power**. Free-play Mode 1 presets come up with
rod control in AUTO; Mode 3/5 and instructed content (`noDefaults`) do not.

### Why the gate is not optional

A blanket default engages the channel in Mode 5 and during `pwr_heatup`, where Tavg is
hundreds of degrees below the no-load Tref the load program asks for. The channel closes that
error the only way it can — by withdrawing rods — and takes the plant critical. **Measured**:
`run_procedures_stack` `pwr_heatup` scrammed at step 6 on `source_range high` (22→21), `run_m5`
23→22, `run_behavior` 42→35. Gated at power: **one** runner moves, not three. A real unit does
not put rod control in automatic below the power range either.

**It reads the power-range INSTRUMENT, not `true_state.power_pct`.** The first cut read truth
and `run_hardrules` failed it as an undeclared HR1 site — the same defect class as **#220**,
where the P-9 permissive read the plant instead of the gauge. Worth recording plainly: that
mistake was made by the same session that had just written up #220, in a file it had just
edited. The guard caught what the author's own fresh memory did not.

### What it closes

The #289 symptom. Full rejection to 0 MWe on the shipped lineup: the dump reaches its 40 %
stop, comes back **off** it to ~6 %, the SG safeties **reseat**, the core runs back below 5 %
and Tavg returns to the no-load anchor (299 °C). Relief still *occurs* briefly — prototypical,
since a real Westinghouse plant's design case is the 50 % loss of load, not a full rejection —
but it no longer **persists**, and permanence was the filed defect.

### The evidence pass that settled TR-1g — and it went against my own probe

**WTSM 11.2 Steam Dump Control System (ML11223A294).** The dump is TRANSIENT, stated twice:

> *"The increased steam flow from the steam generators dissipates the excess energy of the
> reactor coolant **until the power in the reactor is reduced to the same value as the
> secondary load**."*
> *"the steam dumps act as an alternate heat sink (load) **until the rod control system
> returns Tavg to within 5°F of Tref**."*

So the documented 40 % dump + 10 % rod step is the **instantaneous accommodation of the step,
not an equilibrium**. TR-1g had asserted the core PARKED at 85..93 % with the dump held at its
stop for 600 s and called that "the documented ~10 % step" — but a dump pinned at its stop
forever is the signature of **rod control not acting**. It was a rods-in-manual artefact pinned
as the design case. The rod channel following turbine-only `steam_flow` is **correct**, which
resolves the open question from 2026-08-01a in favour of the channel and against the probe.

Re-authored, not re-banded. Measured: dump 40.00 % at 1 min, backing off by 2 min, closed by
3 min; core 46.5 % against a 50 MWe ask; Tavg 303.3 °C.

### Rod-less probes now say so out loud

Five probes are ABOUT the rod-less plant by name and intent, and a lineup change must not
silently convert them into something else. A `rodsManual()` helper stands the channel down in
EV-3 ("(rod-less)"), EV-11 ("slider-only ask"), TR-1 (the MTC handover past the dump's stop),
TR-1c (the hands-off ride to the PORV), and **TR-1e leg B** — that one matters most, because it
needs core and generator to DISAGREE by ~2x to discriminate at all, and on the shipped lineup
the rods run the core down to the turbine so the two AGREE. New **TR-1h** pins the
shipped-lineup full rejection, which nothing asserted. `run_behavior` 42 → **43**;
injection-verified, **7 checks red** on the pre-change lineup.

**TR-1h's first draft was wrong, and the harness caught it.** I banded *"the safeties NEVER
lift"* from a `measure_stack` run sampled every **150 seconds**, which simply missed the peak;
`h.range()` sees every step and reports peak pzr 91.9 %, steam 9.32 MPa, PORV 16.36 MPa. The
defensible claim is permanence, not occurrence, and the probe says that now.

### The board: ROD AUTO was the only AUTO that was not green

Authored `#9fb3c4` (pale grey) against `#5aad7c` on **all 8** other AUTO buttons. `buildButton`
uses the authored item colour AS the active-state colour, so an off-convention value is
invisible until the control is engaged — and since this change it is engaged on every free-play
start. Fixed through `DOC_PATCHES` (re-export-safe and idempotent, per the generated-file
rule), and pinned **twice** in `board_check`: the patched value, and the convention itself, so
a re-export that recolours any AUTO button fails rather than shipping two meanings for green.

### `board_check` was never 143/143

It was **1 FAILURE / 143**, and CLAUDE.md said otherwise. Two pre-existing harness bugs, both
found while verifying this change, neither a plant defect:

1. **The TRIP BLOCKS check unblocked `ir_high` at full power and never put it back.** The IR
   channel reads 2.0e-3 against a 1.67e-3 setpoint, so the trip condition is STANDING and the
   block is the only thing holding it off — the plant scrammed immediately, and because the
   toggle was never undone, every check below it (ESF triad, pumps, feed, SCRAM) had been
   running on a dead reactor at ~3 % power. Re-blocking after the fact cannot help either:
   `rps.scrammed` **latches**. Fixed by reading the block state from the kernel (immediate, no
   stepping) and restoring it **before** protection is ever allowed to look.
2. **The SCRAM two-step ran on an already-scrammed plant**, where those two clicks are the #75
   RESET half — so it un-scrammed the reactor and then asserted a scram. Moved into the single
   window where the plant is on line with no standing trip, behind an explicit `reset_rps`
   (which also gives the #75 reset path its first board-level coverage). Two traps inside that
   move: the reset is refused **RODS_NOT_INSERTED** until the rods seat — measured, the plant
   was still coasting at 95 % power a few ticks after the scram — and the dual-mode SCRAM/RESET
   button reads which half it is off the **RENDERED** snapshot, so it needs a re-render after
   the reset or the clicks land on the wrong half.

**board_check 143 (1 red) → 149/149.**

### The gates

`node test/run_all.js` → **35 runners at baseline**, with `run_behavior` re-baselined 42 → 43.
`board_check` **149/149** (headless Edge; not in `run_all`).

---

## 2026-08-01a — #289: the pressurizer level program had no ceiling, so the plant scrammed itself on its own setpoint
## 2026-08-01c — #238: full SI on the PWR board, and the decisions a display-unit layer forces

*(OWNER RULING, 2026-08-01: selected "m³/h" from three options put to him for the SI flow
unit — m³/h, L/min and kg/s. A selection, not verbatim words, recorded that way deliberately
rather than dressed as a quote.)*

**Decision: one conversion table in the driver, not a conversion at each of ~30 call sites.**
The board converted SI→US inline in every formatter and carried US unit strings in the
generated board data, which is why #237 could only *scope* the Settings toggle — disable SI
while the PWR was up — rather than fix it. `UNIT_FAMILIES` now declares, per family per mode:
the conversion from a base unit, its inverse, the unit string, display decimals, the ▲▼ step
and the band quantum. Readouts, tiles, setpoint boxes and range hints all read it.

**BASE UNIT IS NOT ALWAYS SI, and that was the first real decision.** Pressure and
temperature carry the engine's SI. Flow does not: the gpm figures are an authored display
scale over normalized engine internals (`Manuals/12` §646 calls them "indicative"), so the
flow family's base is **gpm** and US is the identity on it. The alternative — declaring some
notional SI base and making US a conversion — would have moved `GPM_HPI` and its four
siblings off the numbers they have always meant, for no gain.

**m³/h over L/min, and the cost was one extra hook.** m³/h is the SI volumetric flow unit a
real plant display carries; L/min is the direct gpm analogue and would have needed no per-box
overrides at all, because every box stays a whole number. The owner took m³/h. The cost is
exactly one thing: the charging box is 0–60 gpm = 0–13.6 m³/h, where a whole-unit ▲▼ nudges
4.4 gpm, so it carries a per-mode decimals+step override. kg/s was the third option and was
the weakest — it is a MASS flow, and the sim models no density for the charging, letdown or
ECCS paths.

**US IS UNCHANGED BY CONSTRUCTION, which is a design property and not a hope.** Two rules do
it. Every US family entry reproduces the arithmetic *and the rounding* that was inline before
— including one that looks like a free simplification and is not: at zero decimals the layer
formats with `String(Math.round(v))` and NOT `toFixed(0)`, because they disagree on small
negatives (`Math.round(-0.18)` is `-0` and prints "0"; `(-0.18).toFixed(0)` prints "-0"), and
leg ΔT genuinely sits there on a cold plant. And the unit STRING in US comes from the authored
item, never from the table — so the board's three spelling quirks (`F` not `°F`, `GPM`
uppercase on two items, `psig` on the accumulator) survive untouched, and — the part that is
easy to miss — switching SI→US *restores* them, because the unit span is a live text node that
would otherwise strand "MPa" over a psi reading. Measured: `board_check`'s entire pre-existing
check list is byte-identical to the pre-change run, and 166 items render identically across a
US→SI→US round trip.

**Two things a unit layer forces that are not conversions at all.**

*Band quantisation stops being a constant.* Tile band edges are rounded so the strip does not
rebuild at the render rate, and the quantum was "a whole display unit" — which stops meaning
anything once the unit changes. 1 psi is a sensible edge step; 1 MPa is 145 of them, and it
collapses the pressurizer's 15.20–15.76 control band and its 14.82/15.86 alarms onto 15 and
16, leaving the tile's seven regions indistinguishable. The quantum is per family per mode
now: 0.01 MPa, 0.5 °C.

*Display resolution is a property of the UNIT, not of the instrument.* The tile comment
records measured sigmas in display units and the rule that the last digit must be signal.
0.56 psi and 0.0039 MPa are the same noise, and they want 0 and 2 decimals. Tavg and
subcooling go the other way — they are *quieter* in °C (0.05) than in °F (0.09) — so whole
units still hold and no decimal was added.

**What the checks caught, and what they did not.** 18 checks were added to `board_check`
(143 → 162) and all were injection-verified against seven separate faults: an absolute
conversion applied to a temperature difference, a missing inverse on the command path, a
one-way unit write, a dead unit span, unit-blind decimals, a unit-blind quantum, and the
`U()` seam itself removed. **The quantum injection was initially caught by nothing** — the
first seventeen checks all stayed green with 1 MPa quantisation — so an eighteenth was
written that asserts the regions stay nested. That is the same lesson as #286: a coverage
claim is a measurable claim, and a check written beside its own fix proves nothing until it
has been made to go red.

**Two smaller calls.** The dump-setpoint range hint is *derived* from the bounds in SI so it
cannot drift from them, but US keeps its authored string verbatim — including its known
29-vs-30 psi off-by-one, which is a defect in the generated board data and fixing it here
would put the fix where nobody would look for it. And `verify_e2e_ui` keeps the toggle
assertion rather than delegating it to `board_check`: that gate is the only one that drives
the real Settings control through `ui/app.js`, so it is the only one that would notice the
button being unwired from the layer entirely.

---

## 2026-08-01b — #289: the pressurizer level program had no ceiling, so the plant scrammed itself on its own setpoint

*(OWNER RULING, 2026-08-01: selected "Add the program ceiling" from four options put to him.
A selection, not verbatim words — recorded that way deliberately rather than dressed as a
quote. He separately asked, verbatim: "Isn't auto rod control already in the sim and diagram?",
which is why the lineup half is deferred rather than built — see The other ruling below.)*

### The decision

Clamp the CVCS pressurizer level program at a **maximum** as well as a minimum: new
`level_prog_ceiling` = **61.5 %**, applied through one new function
`RD.pwrPressurizer.levelProgram()` that both the CVCS setpoint (`pwr_primary`) and the
level-deviation instrument (`pwr_instruments._levelDev`) call. The physics base line
(`levelBase`) is **deliberately left unbounded** — coolant genuinely expands, and the
resulting level-above-program is precisely what the CVCS exists to let down.

### What was actually wrong

The program is `55 % + 2.5 %/°C × (Tavg − 304.1 °C)` with `clip(base, level_prog_floor, 100)` —
a floor and **no ceiling**. It therefore crosses the **97 %** going-solid reactor trip at
**Tavg 320.9 °C (609.6 °F)**. With rod control in **MANUAL** — the shipped free-play lineup —
the core can only run back on the moderator coefficient, which *requires* Tavg to rise, and it
parks at **319.6–321.3 °C (607.3–610.3 °F)**. So on an ordinary load rejection the plant
arrived within about a degree of where its own level program trips it.

At the scram, `pzr_level_dev` was **−0.99 %** (7 MWe ask) and **−0.15 %** (10 MWe): the
pressurizer was holding **less** water than its program demanded. The trip whose job is to
catch an overfill was being fired by the **control program**, with inventory correct and
make-up working normally. That is a conflict between a `[tune]` control constant and a
protection setpoint — not a CVCS defect, and not an inventory defect.

### Measured

Full stack (M4+M5+M6), `hot_full_power`, free-play lineup, accel 10×, `set_load_target` at
t+60 s, 20-minute ride, six instrument-noise seeds. Peak **indicated** pzr level vs the 97 %
trip:

| ask | 0 | 2 | 5 | 7 | 10 | 12 | 15 MWe |
|---|---|---|---|---|---|---|---|
| **before** — trips | 0/6 | 0/6 | **1/6** | **6/6** | **6/6** | 0/6 | 0/6 |
| **before** — peak (no-trip seeds) | 95.9–96.3 | 95.9–96.3 | 96.3–96.8 | — | — | 95.2 | 92.7 |
| **after** — trips | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 |
| **after** — peak | 94.3–94.5 | 94.3–94.5 | 94.6–95.0 | 95.0–95.1 | 94.0–94.4 | 92.1–92.4 | 89.7–90.0 |

**The signature was non-monotonic and that is why it hid**: a 6–11 MWe ask scrammed, a
*larger* rejection to 0 MWe did not, and 12 MWe did not. At 5 MWe the outcome was decided by
instrument noise (1 of 6 seeds). #289 and all three of its comments tested only 0 MWe — the
one notch in the band that survives.

### The source

**WTSM 10.3 Pressurizer Level Control System (ML11223A290, Rev 0502).** The real program is
clamped at both ends — *"both minimum and maximum level limitations are placed on the level
program"* — low **25 %**, high **61.5 %**. The ceiling's stated justification is our exact
failure mode:

> *"This high level setpoint (61.5%) is low enough to ensure that the pressurizer does not go
> solid following a turbine trip from 100% power without a direct reactor trip, assuming no
> operator action and **no response by the automatic control systems (the rod control and steam
> dump control systems)**."*

The real design **guarantees no-go-solid with rod control not responding**. That is exactly
this plant's shipped lineup, and it is the guarantee we did not have. Our *slope* was already
right: theirs is (61.5 − 25)/(584.7 − 557 °F) = **2.37 %/°C** against our 2.5. Only the clamp
was missing.

### 61.5, not 55 — the number over the rule (my call, not the owner's)

The real 61.5 % **is** their full-power program value, so the structural rule is "ceiling =
program level at full-power Tavg", which for this plant gives `pzr_level_nominal` = **55**.
That was implemented first and is **wrong here**: at 55 the ceiling sits *on* the normal
operating point, so ordinary Tavg instrument noise is clipped on its upper half and the
setpoint is biased low permanently. Measured, it shifted parked CVCS inventory by **0.15 %**
and reddened `run_e2e_controls`' config-derived droop equilibrium (**98.85 vs 99.00**); at
61.5 the same check is exact (**99.00 vs 99.00**).

The principle that resolves it: **a program maximum should be a limit, not part of the normal
control law.** At 61.5 it binds only when Tavg parks abnormally high, which is its entire job.
Program-to-trip margin is 97 − 61.5 = **35.5 %** against the real design's 92 − 61.5 = 30.5 %,
so the bound is not looser than theirs.

### The trap worth more than the fix

**`_levelDev` called `levelBase`, under a comment saying the two "must not be able to drift
apart".** Clamping only the CVCS setpoint made them drift immediately: the deviation gauge
read **−38.5 %** while the controller sat exactly on its setpoint, which would have pegged
`PZR LVL DEV LO` (setpoint −10) for the whole of every load rejection. Program and physics are
now **different lines above the ceiling on purpose**, and the rule is written at the
definition site: *every consumer of "the program" must call `levelProgram`, not `levelBase`*.
`pzr_level_dev` now peaks at **+29.3 %** on the insurge and decays to ~0 as make-up lets down —
the correct story ("level is above program, make-up is letting it down").

A stale comment in `pwr_primary` also still asserted *"setpoint and physics share one line"* —
false above the ceiling, the #220 drift class — and was rewritten in the same change.

### Checked and cleared — NOT a defect

With `rods_tavg` engaged, an 8–15 MWe ask scrams on `intermediate_range high` at 500–800 s. It
was traced before being filed: `ir_high`/`pr_low_setpoint` start blocked at power,
**auto-reinstate below P-10** (measured at 220 s, 9.4 %), and the rod channel then drives power
back *up* through the IR setpoint (3.6 % → 15.1 %) with nobody re-blocking. That is the startup
net doing exactly what its config comment says it does — *"miss the blocks and the net trips
you"*. Worth knowing that automatic rod control can walk the plant into that net with no
operator asking for an ascent; the net itself is correct.

### The gates

`node test/run_all.js` → **AGGREGATE GATE: OK, 35 runners at baseline.** No baseline moved,
including `run_behavior` 42, `run_pwr` 36/36, `run_m5` 23/23, `run_procedures_stack` 22/22,
`run_reachability` 58 and `run_e2e_controls` 59/59.

### The other ruling — deferred, and why

Whether `rods_tavg` belongs in the free-play lineup is **still open**. The owner's question —
*"Isn't auto rod control already in the sim and diagram?"* — is correct and reframed it: auto
rod control is fully built and reachable (**ROD AUTO** on the rod-control board card,
`board_check`-pinned `func: ROD AUTO engages rods_tavg`, Automate tab, Manuals 02/03/04), and
the manuals already treat engaging it as a deliberate optional step with a CAUTION about
driving rods hard after a large Tavg error. So the status quo is a design position, not an
oversight. The ceiling fix works regardless of lineup, which is why it went first.

Measured blast radius if it were ever flipped: blanket `defaultOn` costs **3 runners**
(`run_behavior` 42→35, `run_m5` 23→22, `run_procedures_stack` 22→21 — the latter two are
`source_range high` **trips**, because rods in AUTO withdraw in Mode 5 and during `pwr_heatup`);
gated to at-power ICs (`power_pct > 10`) it costs **1** (`run_behavior` 42→36, six probes whose
premise is rods-in-manual). **Blocked on a second evidence pass**: TR-1g pins the sourced
WTSM 40 % dump + 10 % rod step case at core 89.3 %, and with rods engaged the core goes to
**46 %** — `steam_flow` is turbine-only by deliberate design, so the rods follow the turbine and
the dump modulates shut. Whether WTSM 11.2's 40 %+10 % describes the *initial* step response or
a *steady state* is unresolved, and it decides which side is wrong.

Also still open and deliberately untouched: the going-solid trip is **97 %, single channel, no
power permissive**, where the real one is **92 %, 2/3, P-7 gated (≥10 % power)**. Aligning it
only makes sense *after* this ceiling — 92 alone is lower and would scram more, not less.

---

## 2026-08-01a — #290: the provenance guard covered one marker of two, and three of its own rules were wrong

**Decision: widen HR11's guard rather than narrow the repo's markers.** The alternative was
to declare `OWNER RULING` the only legal marker and rewrite the eleven `OWNER DIRECTIVE`
citations to match. Rejected: the two words mean different things in ordinary use — a ruling
settles a question that was put to the owner, a directive is an instruction he volunteered —
and collapsing them to satisfy a regex would lose that distinction to make a test easier,
which is the tail wagging the dog. HR11's requirement (date + verbatim words) applies
identically to both, so the guard is what should change.

**Decision: `.claude/skills/` is in scope, even though it is agent-facing tooling rather than
published documentation.** A skill file cites rulings as authority in exactly the way the docs
do — `release-to-main/SKILL.md` rests its whole versioning-digit rule on one — and an
unverifiable directive misleads an agent whether or not it ships to a reader. Being outside
the scanned list is the reason the malformed citation there survived a gate believed to cover
it.

**Three implementation rules were wrong before one was right, and the suite was green for
two of them.** Recorded because the pattern matters more than the guard:

1. **Inline-code exclusion.** ``/`[^`]*OWNER RULING[^`]*`/`` was meant to skip prose *about*
   the marker. It also fires when the marker sits **between** two code spans — the `[^`]*`
   gap is the text after one closes and before the next opens. Four genuine citations
   silently skipped. Replaced by testing the marker's own position.
2. **Backtick parity** at that position — "odd means inside" — is false for a **double**-
   backtick span. Found not by a test but by writing the changelog entry: quoting the old
   regex put the marker inside one, and the gate flagged the paragraph explaining itself.
   Now tokenizes backtick **runs** per CommonMark.
3. **Window bounding.** The lookahead accepted any quote mark within three lines, so a
   date-only citation borrowed a quote from the following sentence. Bounding by the
   citation's parenthetical is right; **counting depth from the marker** misses the opening
   `(` behind it and reddens all nine legitimately wrapped citations, and **counting absolute
   depth** never clips a nested citation. Depth **relative to the marker** — first unmatched
   `)` closes it — is the one that holds.

**The general lesson, and it is not a new one here.** Rules 1 and 3-absolute both measured
**green on the full suite**, and 3-absolute was green *on its own injection* — the injected
malformation failed to redden and the natural reading was "the injection anchor missed".
It had not; the rule was wrong. **An injection that fails to redden is a finding, not a
misfire** — check which of the two it is before moving on. That is what separated this from
shipping a guard that looked correct and covered nothing new.

**Gate:** `run_hardrules` 58 → **75 checks** (HR11 43 → 60 sites: +11 widened marker, +4
corrected span test, +2 new scope). Not the usual write-up drift that moves this runner on
every lane merge — no ruling was added; the guard grew.

---

## 2026-07-31i — the steam dump goes to 40 %: closing a departure instead of justifying it

*(OWNER RULING, 2026-07-31: "Let's change it to 40%.")*

### The decision

`steam_dump_max` **1.05 → 0.40**, the prototypical Westinghouse capacity (WTSM §11.2,
ML11223A294). §8.17 — declared as a named departure earlier the same day under #220 — is
**retired**: the gap is closed rather than documented. The 1.05 was never sourced; it came
from the 2026-07-21 feel pass as "Claude's call, playtest-adjustable, revisit after
playtesting", and this is that revisit.

### The argument that failed, recorded because it is the instructive part

My first recommendation was **0.60**, on the reasoning that the real 40 % is sized for
*their* plant while ours needs **58 %** for the same criterion — so 0.60 copied the design
*criterion* rather than the *number*. The owner asked why not 40, and the argument did not
survive: the real design is 40 % dump **plus a 10 % rod-control step** (STPEGS UFSAR
§10.4.4, ML22140A078), and at 0.40 this plant reproduces that split — dump saturates, core
settles at **89.3 %**, a 10.7 % step. The 58 % figure is what the dump peaks at when it does
the whole job and no runback is required. It was a real measurement of the wrong quantity,
and I had presented it as the load-bearing reason.

### Measured

| event | 1.05 | 0.40 |
|---|---|---|
| turbine trip @100 % | scram +0.5 s, Tavg 304.5 °C | **indifferent** — +0.5 s, 307.2 °C |
| 50 % loss of load | no trip, dump 58 %, power 98.8 % | no trip, **no lift**, dump saturated, power 89.3 % |
| full 100 % rejection | no trip, Tavg 305.3, power **97.5 %** | no trip, Tavg **321.2**, power 46.3 %, PORV **16.37**, SG safety graze 9.32 |

Turbine trip never approaches the cap (P-9 scrams; decay heat ~6 %), and SG pressure peaks
at 8.08 MPa either way — under the 9.31 safety, the other thing the real 40 % is sized for.
**The only thing 105 % bought was a clean full rejection**, which is beyond a real
Westinghouse plant's design case anyway.

### Why this is the teaching choice, not a fidelity tax

Two effects, both of which point the same way and neither of which is about the number:

- **The P-9 trip becomes demonstrable.** Its premise is *"Above the P-9 setpoint, a turbine
  trip will cause a load rejection beyond the capacity of the Steam Dump System"*
  (NUREG-1431 Bases Function 16, ML12100A228). At 105 % that was false for this plant, so
  the interlock could only be asserted. This is the coherence problem the owner spotted on
  2026-07-26 — resized, the question is moot rather than answered.
- **The dump becomes a finite resource.** It can be driven to its stop, and past it the core
  has to shed the difference. That handover is the plant dynamics lesson, and at 105 % it
  never occurred.

**FG-4 is restored, not sacrificed.** `PLAYTEST_CHECKLIST` describes the approved signature
as *"self-parks ~64 % power with Tavg ~319 and pzr level ~93-94 % (PZR LVL HI blaring, just
under the 97 % going-solid trip)"*. At 1.05 nothing produced that. At 0.40 the rejection
gives 46 % power, Tavg 320.1, pzr level 95.6 % against the 97 % trip. That row was also
describing a *turbine trip*, which has scrammed since #216 — both corrections applied.

### The gates

**Authored content did not move**: `run_campaign` 51/51 (3038 checks) including the
Mode 5 ↔ 1 cooldown and heatup missions, `run_procedures_stack` 22/22, `run_ops` 58/68. The
cooldown was the one blast-radius unknown flagged as unmeasured before the ruling; it is
measured now.

Five probes re-banded — TR-1, TR-1d, TR-1e, TR-1f, PI-8, all carrying P4-freeze bands. **TR-1
was pinning a non-event** ("dump carries near-full power (90..103 %)", "no PORV lift") and
now pins the ladder running in order, with the **PORV assertion written POSITIVELY** so that
restoring capacity enough to suppress the lift must edit the line rather than pass through a
band. New **TR-1g** pins the 50 % design case and the documented 40 %+10 % split — the check
that says 40 % is *enough*, without which a further reduction would go unnoticed until
someone drove a full rejection. PI-8 now reports **margin to going-solid (1.4 points)** as an
info line rather than burying it in a band.

`run_behavior` 41 → **42**, `run_hardrules` 48 → **50** (prose: the dated owner quote),
`run_manual_rev` 12 → **13** (below). Manual set **Rev 23** — 01, 09 and new 12 prose.

### Found in passing: two `Set revision` lines

`Manuals/00_REVISION_HISTORY.md` carried a stale `**Set revision:** 20 (2026-07-30)` directly
under the live one, hand-added in 85264ad (#277). The `run_manual_rev` check matches the
FIRST occurrence and `stamp_manual_revision.js` rewrites the FIRST occurrence, so it was
invisible to both — through three stampings — while contradicting the set-wide revision in
the one document whose job is to state it. Removed; the gate now counts them.

---

## 2026-07-31h — #224: a stale lookup table had quietly halved a browser gate

**The filed defect was 32 mismatches in `STEP_UI`.** The real one is what `STEP_UI` is for:
`verify_manual_follow.js` **iterates the table, not the procedure steps**, so it is that
gate's coverage list. An unmapped step is **unverified**, not merely unmapped. Measured
2026-07-31: **17 of 45** controlled PWR steps covered, `pwr_heatup` at **zero**, gate green.

### The decision: PWR's control vocabulary is the board's, not a hand copy

`VIEW_CONTROLS.pwr` mirrored `ui/app.js` PD[].controls by hand. The PWR plant display has
had no view bar since the board replaced the V1 synoptic (#246) — app.js resolves a control
through `RD.PwrBoard.revealControl`. So the mirror described a display that does not exist,
and nine labels the authored procedures use (`RCP Run/Stop`, `Dump SP`, `Pressure SP`,
`Accumulator valve`, `Trip Blocks`, `Boron control`, `1/M Plot`, `Turbine — Connect Grid`,
`Rod AUTO`) were missing from it while being perfectly reachable. **Filling `STEP_UI`
against that list would have produced 9 false failures and an argument about which was
right.**

PWR now reads `PwrBoardDriver.controlLabels()` — the board's own `CONTROL_LABEL_MAP`. That
is the authority `revealControl` resolves against, and the one `run_campaign` already
validates campaign beat highlights against, so this is a third consumer of one source
rather than a fourth source. RBMK/BWR keep their listed view bars: those plants still have
one, and are on hold.

`view` becomes decorative for PWR (recorded `'board'`). `verify_manual_follow` already
ignored it on this plant.

### The finding that changed the shape of the fix

Every one of the **45 controlled steps resolves** against the board vocabulary. There was
never a procedure pointing at an unreachable control — the issue's caveat (*"some may be the
map being right and the auditor being too strict"*) resolved to a third answer: the map was
simply absent, and the auditor was right about that.

### Why the loops had to be rewritten to accept the coverage

Tripling `STEP_UI` triples what `verify_manual_follow` walks, and it walked expensively:

| loop | was | why it was wasteful |
|---|---|---|
| bar check | one `goto(...&view=<v>)` per entry | **`&view=` is read by nothing in `ui/app.js`** — every load rendered the identical page |
| follow check | reload + click `next` *i* times per entry | O(n²) in procedure length; `pwr_heatup` alone = 153 clicks, 17 loads |

Both walk once now (the follow pane only moves forward, and entries are step-ordered —
sorted defensively so an out-of-order entry cannot silently skip a step). **84 → 174 checks
for 115 s → 132 s.** Filling the table without this would have added minutes and no
assurance.

### The gate

`audit_manual_controls.js` → **`test/run_manual_controls.js`**, so auto-discovery finds it
and it carries a baseline. That rename *is* the fix for the recurrence: #159 already
observed that manual-run harnesses drift and fixed the cosmetic half (a report written into
a dead scratch directory); the half that mattered was that nothing ran it.

Injection-verified four ways: dropped entry → step reported UNVERIFIED; pill/entry mismatch;
entry with no step behind it; procedure naming a control absent from the board. **Worth
recording:** the first attempt at that last one used `Reactor Coolant Pumps (RCP)` as the
"unreachable" label and stayed green — because that label *is* on the board. A negative
assertion demonstrated with a name that exists demonstrates nothing.

`run_all` **34 → 35 runners**; `run_manual_controls` 116 checks; `verify_manual_follow`
84 → 174. Nothing else moved.

---

## 2026-07-31g — #220: the revisit. A permissive that could not be fooled, and a guard that said it could not exist

**Context.** #220's evidence pass (2026-07-27) verdicted ten "real Westinghouse PWRs do X"
claims against NRC primaries — 7 verified, 2 partly, 1 with a gap, **none wrong** — and was
deliberately scoped to evidence only. This is the revisit it deferred.

### The decision: a permissive is an instrument reading, and P-9 was not one

`above_p9` was `(s.power_pct || 0) > 50` — **true** reactor power. It gates three protection
decisions (SG hi-hi reactor trip, Reactor Trip on Turbine Trip, loss-of-main-feed AFW start).
The real one is *"actuated at approximately 50% power as determined by two-out-of-four NIS
power range detectors"* (NUREG-1431 Rev 4 Bases B 3.3.1, ML12100A228) — a nuclear-instrument
reading and nothing else.

**Measured before** (hot full power, seed 42, power-range channel stuck at 40 % with the core
at 100 %): turbine trip → scram at **+0.5 s**; SG overfeed → scram on `sg_level high` at
**+0.2 s**. **After**: neither. The turbine trip is ridden out on the 105 % dump; the hi-hi
still isolates feed and trips the turbine, and the plant trips **59 s later on `sg_level low`**.

Reads `_ins_power_pct` — the existing one-step-lag stash the AFW level hold, the CVCS level
program and the dump's Tref program already sense through. No new instrument, no new PRNG
draw. With a healthy channel the behaviour is unchanged, which is both the safety argument
for the change and the reason 34 green runners never saw the defect.

**Why this is a departure to declare rather than waive.** Combined with §8.11 (no sensor
redundancy or voting), a **single** failed channel now defeats the permissive where a real
2-of-4 arrangement out-votes it. §8.11 already took that trade explicitly — *"makes instrument
failure more impactful — acceptable and arguably more educational"* — so this inherits it, and
§8.20 records the inheritance rather than leaving it implied.

### The guard blind spot: a decision can reach truth without naming it

`run_hardrules.js` scans `layers/control/` for `getTrueState()` / `true_state`, and its
SCOPE note asserted in writing that *"nothing that DECIDES can reach truth by a path this
misses"*. That sentence was false when written. A trip's **`condition:` key is a status word
the ENGINE computes and hands over** — inside the control layer there is no truth reference
to see. `above_p9` was that path.

New **HR1(b)** block: every `condition:` key gating a trip, actuation or alarm is declared as
`instrument` / `lineup` / `latch` / `hold`, and the ones declared instrument-derived are
**verified against the engine line that defines them** — a declaration alone would have been
bookkeeping. Injection-verified three ways: the pre-fix engine line reddens 3 checks and
prints the offending expression; an undeclared permissive reddens 1; a stale declaration
reddens too. `run_hardrules` **39 → 50**.

Kept as a separate block rather than folded into the HR1 scan because it walks a different
surface (permissive keys, then engine definitions) and would otherwise vanish inside the
other's tally — the same reasoning that split HR1_EXCEPTION from HR1_DEBT.

### The comments that carried someone else's premise

The drift class #220 exists to catch, found twice by the evidence pass and fixed here:

| Site | Said | Why it was wrong |
|---|---|---|
| `pwr_steam_generator.js` | dump catches a full rejection *"(no anticipatory reactor trip exists)"* | True when written; **false since #216** turned Reactor Trip on Turbine Trip ON |
| `pwr_config.js` | *"a turbine trip is a transient the operator manages — not a scram"* | Above P-9 it is a scram. Load rejection and turbine trip are distinct design cases in the real plant too (NUREG-1431 Bases, Function 16) |
| `pwr_control.js` P-9 header | the real plant's justification, recited straight | Theirs is **dump capacity** — *"for turbine trips from 50% power or less, sufficient steam dump capacity is available"* (WTSM §12.2, ML11223A301). Ours is 105 %, so that argument is gone here |

**The owner's question, settled** *(OWNER, 2026-07-26: "If the steam dump can handle a full
load do we need the turbine trip? I thought those were related for some reason.")* — they
are related, and that recollection was exactly right. Keep the trip, but for the two reasons
that survive an oversized dump: the dump depends on the **condenser** (real interlock C-9; a
turbine trip's cause frequently removes it — TR-8 is that case), and it is **uncredited
anticipatory defence-in-depth** in reality too (*"No credit was taken in the accident analyses
for operation of these trips"*, Salem TS Bases, ML18093A272). Written into the header where
the code is read, not only into an issue thread.

### Departures declared (DESIGN_COMPANION §8 — the HR9(c) home)

**§8.17** steam dump 105 % vs the prototypical 40 % (WTSM §11.2, ML11223A294), with the
AP1000 house-load analog · **§8.18** the 1.5 DPM rod-withdrawal block, which has no real
analog while the 1.0 DPM administrative limit and the 1e5 cps source-range backstop either
side of it both do · **§8.19** the AFW 20 % / scram 17 % offset against one real signal at
one setpoint (WTSM §5.7, ML11223A229) · **§8.20** P-9 and turbine-trip sensing at status
level rather than stop-valve position and autostop oil pressure.

Housekeeping: the #219 dump-arm cliff was filed as a **duplicate §8.8** and cited by number
from four places — renumbered **§8.21**, all four repointed.

### Gates

`run_behavior` 40 → **41** (**TR-1f**; 4 checks red on the old engine, and the probe must
*fail the instrument* to observe anything at all — legs A and C are the calibration pins).
`run_hardrules` 39 → **50**. Everything else unmoved: all 34 runners green at baseline before
the new checks were added, which is the measurement that says this is a sensing fix.
## 2026-07-31f — #288: one constant was blocking the open AND forcing the close, so the deadband was zero

*(OWNER RULING, 2026-07-31: "issue 288, split them.")*

### The decision: two setpoints, and the autoclose is the HIGHER one

`emergency.rhr_valve_interlock_mpa` = 400 psi (2.76 MPa) gated the RHR hot-leg suction valve
in both directions — the open permissive in `set_rhr`, the autoclosure in step 9b. A real
plant separates the two by roughly 175 psi with the **autoclose above** the open block:

> *"Two basic features are incorporated in the interlock design: (1) an automatic closure
> signal on high RCS pressure (typically 600 psig), and (2) a block of the manual open
> signal at a lower RCS pressure (typically 425 psig)."*
> — NUREG-0933, Issue 99, *"RCS/RHR Suction Line Valve Interlock on PWRs"* (Rev. 3)

WTSM §5.1 (ADAMS **ML11223A219**) gives the same structure for valves 8701/8702: 425 psig
open block, ~585 psig autoclose. Added `emergency.rhr_autoclose_mpa` = **4.14 MPa
(600 psig)** and pointed step 9b at it. The open permissive did **not** move.

### Why not the other two options

**Do not widen the band by raising the open permissive.** 400 psi is quoted by `04`, `05`,
`09`, the campaign and the M4 actuation table, and it is inside the sourced range for a
block-open setpoint. Moving it moves authored content for no fidelity gain (HR9 — the
content follows the plant, but here the plant number is already right).

**Do not remove the autoclosure.** Tempting on the evidence: GI-99's own resolution said
*"removal of the ACI be recommended, but not required, for plant implementation"* — the
autoclosure interlock was itself judged a net risk. But that is a design decision a
licensee makes with its own PRA, ours is pinned by `rhr_valve_and_mode`, and deleting
protection on the strength of a *recommended-not-required* line is a larger call than this
issue needs. Left standing, at the sourced setpoint.

### What it changes for the player

Measured engine-direct (`cold_shutdown`, seed 42), aligning at 218 psi (1.5 MPa) then
holding a rebound: **pre-split, every rebound above 400 psi shed the valve**, including the
**409 psi (2.82 MPa)** case #287 documents — a cooldown whose pressure-control setpoint sat
nine psi over the interlock, aligned RHR, bounced, and lost it permanently against the
one-shot entry permissive. Post-split, 409 / 435 / 508 psi all hold and the valve lets go at
its 600 psi setpoint. Losing shutdown cooling now requires a real excursion rather than a
hunt, which is what makes `06 PWR-A33` an alarm about an event instead of about a boundary.

### The measurement trap: `reset()` takes an OBJECT and silently ignores a string

`PWREngine.prototype.reset = function (cmd)` reads `cmd.initial_state` and defaults to
`hot_full_power`. So `eng.reset('cold_shutdown')` does not throw, does not warn, and gives
you a **300 °C plant at 15.41 MPa** while your own log line says `cold_shutdown`. Three
successive rigs in this pass ran that way, and the first version of this section was
published from them.

It produced two confident, wrong findings. One: the valve "closed at **377 psi**", *below*
its configured 400 — a hot plant clamped to 2.6 MPa is so far off equilibrium that it surges
through the interlock inside a single 0.02 s step. Two: the 580 psi row "closed because the
plant overshot to **604 psi** mid-step" — same cause, dressed up as a physics explanation,
which is the more dangerous of the two because it *reads* like a measurement result. On the
genuine cold IC the pressure does not drift at all (max seen = value held, every row) and the
boundary is exactly 600 psig: 595 psi holds, 609 psi lets go.

**The generalisable rule: assert the IC, do not trust the argument.** One `console.log` of
`s.pressure_mpa` immediately after `reset` catches this in seconds, and nothing else in the
rig will — the engine is perfectly happy, the output is plausible, and the only tell is that
the numbers are wrong. This is HR12's neighbouring failure: the claim *was* measured, and the
measurement was of a different plant than the one named.

The new deadband check asserts `eOpen < s.pressure_mpa < eAuto` on the **observed** value for
the same reason, so it cannot pass on a pressure that drifted out of the band it tests.

### The gate

`run_pwr` **237 → 240**. `rhr_valve_and_mode` gained the config ordering, a rebound into the
deadband that must not close, and — the half that is easy to forget — an open that must
still be **REFUSED** in that same band, since the block-open permissive is unchanged and a
spent one-shot cannot be re-armed at 409 psi. Injection-verified both ways: reverting step
9b to the open permissive reddens the load-bearing check; deleting `rhr_autoclose_mpa`
reddens four (`undefined` makes the comparison always false, so the valve never closes at
all). Manuals **Rev 25**.

---

## 2026-07-31e — #137: rewind is a picker on a wall clock, and two of the issue's four items were wrong

**Decision 1 — the free-play checkpoint cadence is measured in REAL time**
*(OWNER, 2026-07-31: "The rewind cadence should be 20 seconds real time not sim time.")*.
`SANDBOX_CP_SPACING_S = 15` sim-s → `SANDBOX_CP_SPACING_MS = 20000` wall-ms, sampled inside
`tick()` so a throttled tab lays its checkpoint late rather than not at all. Measured at ring
saturation: the old ring spanned **465.9 / 46.5 / 9.3 / 3.1 real seconds** at 1× / 10× / 60× /
600×; the new one spans **620.0 at every acceleration**, with a slot covering 12,000 sim s at
600× (~103 plant-hours reachable). `_now()` is a **prototype seam**, not a convenience: a
headless runner burns no wall time, so without it no gate in this repo can see the cadence at
all.

**Decision 2 — the picker is the ONLY player rewind path.** All four entry points (strip-chart
⏪, scrub track, walkthrough/scenario nav ⏪, failure-card ⏪) open pick mode. Nothing
player-facing now issues a non-`exact` rewind.

**Decision 3 — pick mode WIDENS the plot to the whole ring.** Consequence of decision 1 that
the issue did not cost: at 600× the slots are 12,000 sim s apart and the widest chart window is
1800 s, so a cadence fix on its own ships a picker whose every mark is off the left edge. One
`chartExtent()` now serves both `drawChart` and `rewindPickClick`, widening to the oldest
checkpoint while picking; axis labels go `h:mm:ss` past ten minutes.

**Decision 4 — truncation STAYS.** The issue asked for a deliberate ruling on `_rewind`'s
`checkpoints.length = idx + 1`. Keeping it: the rewound-to moment is the new present, and the
plant does not follow from a retained "future" that was computed off abandoned state — the
chart already pops samples ahead of `sim_time` for the same reason. It is stated in the
timeline's scanner copy ("a teaching tool, not an undo") rather than left to be discovered.

**Two of the issue's items were WRONG, and are recorded here because both look authoritative.**

- *"[the `exact` path] has never had a player-facing way in"* — the picker shipped **2026-07-23**
  (`2e86c00`), two days before the issue was filed. What was true is that it was **broken**:
  `rewindPickClick` inverted `chartBuf`'s full `CHART_RECORD_SEC` extent while `drawChart`
  plotted the marks over `ui.window`, up to 6× narrower. Measured, headless Edge: clicking the
  mark drawn at **T+19 s** landed the plant at **T+0**; after the fix, **0.0 s** of error.
- *"the exact-time guard and the `_rewindCursor` walk-back … exist only to make repeated single
  presses escape a failure card [and] are dead weight"* — **declined**. They also guard the
  **beat** path, which the same issue forbids touching. A `rewind:` beat deliberately does not
  checkpoint (`layers/instructor_layer.js:295-299`), so two consecutive rewind beats are exactly
  the "every rewind restores the same newest checkpoint" case the walk-back exists for, and the
  exact-time guard is what lets a beat's rewind reach earlier than the checkpoint it just laid.
  Deleting them regresses authored content with no gate watching. Their comments now say they
  are beat-path guards.

**Gates.** `run_m5` 19/19, **79 → 83 checks**; the discriminating one accumulates 360 sim-s with
the wall clock frozen and requires zero checkpoints (pre-fix: 21, and 6 of the suite's 8 checks
red). `verify_e2e_ui` gains `testRewindPicker` — no baseline move, it scores screenshots. That
section's load-bearing check **clicks the second-oldest mark and reads the clock back**; pressing
the button and counting marks would pass on all three defects, which is the HR10 point.

---

## 2026-07-31d — #284: the test was the LOAD, not the BREAKER; and the gauge read the CORE, not the turbine

**Found while disproving #138**, which was filed as "aggressive Manual load cuts can trip the
plant". They do not — measured across cuts of 10/35/39/50/80/100 MWe at hot full power, full
stack: no scram and no PORV lift in any of them. Two other things turned up in the traces.

### The decision: what does "synchronised" mean in this model?

`stepTurbine` had three branches — tripped, "synchronised", and "connected but unloaded" — and
the second was selected by **`generator_load > 0`**. That conflates two different questions. A
synchronous machine tied to the grid spins at rated at **any** load, including zero; it motors
rather than decelerates. The load tells you what it is *doing*, the breaker tells you what is
*holding* it.

The consequence was measurable and absurd: `set_load_target 0 MWe` while synchronised sent the
rotor **1800 → 0 rpm over ~5 plant-minutes** with `turbine_tripped` false, `load_mode` still
`manual`, and the breaker never opened.

**Ruled: the predicate is the breaker.** New shared `RD.LoadMode.isOnLine(s)` —
`s.load_mode !== 'disconnected'`. Two deliberate choices inside it:

- **`turbine_tripped` is NOT part of it.** A trip and an open breaker are different events —
  that is #230's ruling (*OWNER RULING 2026-07-28: "Planned offline, no trip."*), and callers
  that care about the trip already test it separately. Folding it in here would quietly
  re-merge the two concepts #230 separated.
- **It lives in `load_mode.js`, not in the PWR engine.** `load_mode` is the shared module that
  owns the concept; open-coding `!== 'disconnected'` at a third site is how the
  `generator_load > 0` shortcut got written in the first place.

**Why this does not re-break #235.** The coastdown branch exists because cold Modes 3/5 spawn
untripped with no load and no steam, and without a friction term they pinned 1800 rpm on a cold
plant. Those ICs are authored `load_mode: 'disconnected'` (`pwr_engine.js:1446`,
`onLine ? 'follow' : 'disconnected'`), so they still take the coastdown branch. Leg C of the new
probe asserts that from the other side, so an over-reaching future fix reddens rather than
silently restoring #235.

**Unchanged:** the engine still has no no-load admission model, so an off-line untripped rotor
coasts rather than holding rated ready to re-synchronise. That limitation was already declared
in the note over `RD.LoadMode.disconnect` and is out of scope here (cf. #238).

### The second defect: `mwe_output` was never a turbine number

```
s.mwe_output = (s.power_pct / 100) * mwe_rated * (rpm / rpm_rated) * (vacuum / vacuum_rated)
```

It reads the heat the **reactor** makes and ignores the governor and the steam dump entirely.
Every existing check ran at a state where flux and turbine admission agree — steady power, or a
trip that zeroes both — so **a 2× error on a board gauge sat behind 34 green runners**.
Measured, `set_load_target 50 MWe` at hot full power: **98.8 MWe indicated with the dump venting
48 %** to the condenser. The operator asked for 50, the gauge said 99.

Now driven by `steam_flow_normalized` — turbine admission. Same case reads **50.02 MWe**.

**Calibration is preserved exactly, not approximately.** `steam_flow_rated` is 1.0 in these
normalized units and the governor sits at 100 % at rated pressure, so the new form is identical
to the old at full power. Verified against the five shipped ICs and the table `Manuals/09` §12
publishes — `hot_full_power` 100.0, `50_percent` 50.00, `5_percent` 6.36, `hot_zero_power` 0,
`cold_shutdown` 0 — so no manual edit was required. What moves is only the states where the two
numbers **disagree**: a rejection ride-out, an MSIV closure (`steam_flow_normalized` is forced
to 0 there), and the decay-heat tail after a trip. The pressure term already lives inside
`steam_flow_normalized`, so a plant over-delivering on stored SG energy walks back down as the
secondary sags instead of holding an unphysical output.

### The gate

`run_behavior` 39 → 40 — **TR-1e**, four legs: the rotor holds rated at zero load on line, the
gauge follows the ask through a dump ride-out, the rotor still coasts off line (#235), and rated
output is unchanged.

**Verified by injection, not written beside the fix.** With both engine lines reverted it fails
**3 checks** — 0 rpm at end, 0 rpm minimum, and 98.78 MWe against a 50 ±3 band. Legs C and D stay
green on the old engine *by design*: they assert what the fix must **not** change, so a red there
would mean the fix over-reached rather than that it worked.

`board_check` 143/143 unchanged.

---

## 2026-07-31c — #135: the SG drained 2.7× too fast, and no gate could tell

**The issue was NOT stale, and its stated fix was arithmetically impossible.** #135 filed the
loss-of-feedwater warning-to-trip window at "~4 s" and said *"widening it is a setpoint/lag
question in `layers/control/pwr_control.js`, not a physics change."* Measured full-stack: the
window is **2.9 s**, and the setpoints are 13 percentage points apart (SG LVL LO 30 %, lo-lo
trip 17 %) on a level falling at 4.7 %/s. **No setpoint move could fix it** — even doubling
the spacing buys about six seconds. The repo's own `TUNING_LOG` backlog row S2 had the right
instinct (*"consider slowing SG boil-down"*) and the GitHub issue contradicted it.

**The real statement.** `d(level)/dt = K_sg_level × (feed − steam)`, both normalized to rated,
so with feed lost and steam at rated **`K_sg_level` IS the drain rate in %/s**. At 5.0 the
entire narrow range held **twenty seconds of full-power steaming** — measured, true level
64.5 % → 3.1 % in 13 s, lo-lo trip at 12.9 s.

**SOURCED, not chosen** (evidence-pass SOP). Ginna UFSAR Chapter 15, Table 15.2-4, *"TIME
SEQUENCE OF EVENTS FOR LOSS OF NORMAL FEEDWATER FLOW"* (NRC ADAMS **ML20339A101**, Rev 29
11/2020, p.102 of 276): main feedwater stops at **20 s**, low-low level trip setpoint reached
at **55 s** — **35 s**. This plant runs 65 % nominal and trips at 17 %, so 48 points over 35 s
= **1.371 %/s**. `K_sg_level` **5.0 → 1.37**. Measured after: trip at 40.5 s (the extra ~5 s is
this sim's 8 s feed-pump coastdown, where the analysis stops flow instantly), window 11.6 s.
**What is fitted is the TIME, not the geometry** — Ginna's narrow-range span and level program
are its own, and no claim is made that a single-loop 100 MWe teaching plant matches them.

**Control got BETTER, and that was measured before it was claimed.** Full stack, before/after:
steady hold over 30 min **2.35 → 2.11** points of band; a 100 → 80 MWe ramp swings **9.8 → 5.4**
points and settles **64.38 → 65.12** against 65 nominal. Lower level-per-imbalance gain means
less level swing for the same flow mismatch, so **the three-element feed controller did not
need retuning** — the risk this change was expected to carry did not materialise.

**What it deliberately does NOT buy: a savable transient.** Clearing the failure the instant
the alarm arrives still trips, at 40.6 s. That is correct. A real loss of normal feedwater
**trips the reactor on low-low SG level** — it is the credited trip in the Ginna analysis
above — so the window is for reading the board, not for preventing the trip. #135 asked for
"long enough for a player to read the alarm, diagnose, and act"; the prototypical answer gives
the first two and refuses the third, and that is the answer HR9 requires.

**THE GATE GAP IS THE REAL FINDING.** A 3.6× change to a physics constant left **all 32
runners green**. Nothing in the suite asserted how fast a steam generator empties, so the
value could have drifted back with nothing to say so. New probe **TR-14** in `behavior_pwr.js`
pins the sourced anchor: trip 25–60 s after feed loss (band deliberately wide — the claim is
"a real plant's timescale", not "Ginna to the second"), warning before trip, window ≥ 7 s.
Verified by injection: at the old 5.0 it fails at **13.0 s** against the floor and **3.0 s**
against the window. `run_behavior` **38 → 39**.

**One gate did move, and it was a FIXTURE, not the assertion.** `verify_e2e_ui` sampled the
post-turbine-trip feed/steam tracking at `ff=240`, a time its own comment says was chosen to
be past the post-trip level swell. With the plant 3.6× slower that transient outlasts 240 s
and feed is legitimately still 0. Moved to **`ff=600`** — and **validated against the OLD
drain rate too** (HR10): measured feed vs steam in gpm at 240 s old 63/63 vs new 0/64; at
600 s old 53/56 vs new 57/56. It passes on both plants, so the sample point is better rather
than refitted, and the assertion itself is untouched.

---

## 2026-07-31b — #75: the RPS reset was three finished halves that had never been joined

**What was actually wrong.** The issue asked for a reset affordance and its interlock, and
triage said the engine side already worked and only the UI and the permissive were missing.
Both true, and both understated it. Three pieces existed:

1. **Engine** — `reset_rps` in `applyCommand`, with the rods-fully-inserted interlock. Green
   under an ops probe (`abuse_scram_then_recover`, PI-7/C3) since it landed.
2. **Kernel** — `resetRps()`, which computed the standing-trip permissive properly and
   returned a labelled refusal.
3. **Board** — a SCRAM button that has drawn **PRESS TO RESET** since the day it was built.

None of them reached each other. `onScramReset` was an empty stub carrying the comment
*"no engine reset command; visual only"* — false when it was written and false ever since.
And the kernel's refusal used `type: 'refused'`, a shape returned by exactly two lines in
the repository and **read by nothing**: not the service, not `app.js`, not a test, not the
spec. So the measured operator experience was: press the button that says PRESS TO RESET,
receive no reset, no refusal, and no message.

**Decision 1 — the refusal joins the existing interlock contract rather than inventing a
path.** `{ type: 'blocked', code: 'INTERLOCK', reason, message }`. `app.js` already flashes
exactly that to the scanner bar, so the operator-facing half needed no UI plumbing at all —
the orphan shape was the whole reason a working refusal was invisible. `reason` keeps the
specific code (`TRIP_SIGNAL_PRESENT` / `RODS_NOT_INSERTED`) for the board and the tests.
The alternative — teaching `app.js` about a second refusal type — was rejected because the
interlock comment already describes this case word for word: *the plant is protecting
itself, not malfunctioning, so the caller gets a labelled refusal*.

**Decision 2 — the permissive is STATE, not just a response.** A refusal you only discover
by pressing is barely better than silence. `getRpsState()` now carries `reset_permitted` and
`reset_block`, computed by the **same** evaluator the command path uses (`rpsResetBlock`),
so the caption and the refusal are one fact. A board that said PRESS TO RESET while the
plant would refuse would be a new lie in place of the old one.

**Decision 3 — rod bottom became an instrument, and the permissive became config.** The
engine's interlock reads `position_pct` truth; the kernel must not. A new **`rods_fully_in`**
status word carries it (no lag, no noise, no PRNG draw — the appended-instrument rule), and
both it and the engine interlock read one `RODS_IN_PCT` constant, so the lamp and the latch
cannot drift. The permissive list itself lives in `pwr_control.js` as
**`rps_reset_permissive`**, evaluated generically by the kernel — so this did **not** widen
#228's declared `reset_rps` leak, and `run_hr3` is unmoved at 29 checks. RBMK/BWR define no
list and fall back to the engine's own refusal, which is the correct no-op for plants on hold.

**Decision 4 — instrument ids are not operator language.** The first cut of the refusal read
*"turbine_tripped is still is_true"*. Measured — that really is the first thing standing in
the way of a reset after a hot-full-power scram, so it is the sentence an operator would
have met. A per-channel `instrument_labels` map in plant config fixes it (one map, not a
label per trip: `power_range` backs two trips, `primary_pressure` three). The template also
suppresses the direction word for `is_true` trips, after the second cut produced *"the the
turbine trip trip signal"*.

**Measured timeline**, hot full power, manual scram, seed 42: turbine trip holds the reset
for ~1 s → rod bottom holds it ~2 s more → available from ~t+4 s. Under a loss of feedwater
it stays blocked on *low steam generator level* indefinitely; under a large LOCA on *low
reactor coolant pressure*. That is the behaviour the issue wanted — recovery that is
procedural rather than a button.

**The tests missed the case that mattered, and injection is what said so.** With 18 checks
written and green, deleting the entire `rps_reset_permissive` config left the suite at
**57/57**: the standing turbine trip covers the first half-second and the rods are seated
long before the later checks run, so the rod-bottom window (~1–3 s) — the one window where
that config is the binding constraint — was never asserted. Two checks now sit inside it,
and the same deletion reddens. This is HR10 in its plainest form: eighteen passing checks
were not evidence the mechanism was right.

`run_e2e_controls` **39 → 59**, `board_check` **138 → 143** (the board pins include the
original defect: restoring the empty handler reddens it). Manual set **Rev 20** — the reset
is documented as a control in **03 §3.5.1**, with **06 PWR-A01** Recovery pointing at it.

---

## 2026-07-31a — the CHANGELOG roll was skipped twice; the instruction was not the fix, the gate is

**What was wrong.** Alpha **1.10.0** and **1.11.0** both merged to `main` without renaming
`CHANGELOG.md`'s `## [Unreleased]` heading. 434 lines covering two shipped releases sat filed
as work-in-flight, and the newest version heading in the developer changelog read **1.9.0** —
two versions behind `changelog.html` and `site/release.js`, which were both correct.

**Why it survived.** Nothing downstream reads that heading. `[Unreleased]` looks exactly as
plausible as `[Alpha 1.11.0]` to a reader, to a renderer, and to every gate in the suite. Both
CLAUDE.md's *Definition of done* and the `release-to-main` skill's checklist already said to do
it — **the instruction is what failed**, and repeating it louder would have been the same
intervention that had already not worked twice.

**Reconstructing the boundary — measured, not judged.** Entries had been inserted at the **top
of existing `### Added` / `### Fixed` subsections** rather than appended to the block, so the
two releases were interleaved and no contiguous line range separated them. The split came from
extracting the `[Unreleased]` block at tags `v1.10.0` and `v1.11.0` and diffing against `HEAD`:
two clean insertion hunks (`1a2,22`, `2a24,163`) place 1.11.0's Added and Fixed entries above
1.10.0's, seam between **#271** (armed-protection alarm bands → 1.11.0) and **#263** (moderator
re-fit → 1.10.0). **Independently confirmed**: `changelog.html`'s 1.11.0 and 1.10.0 entries were
written at release time, never touched since, and split at exactly the same place. The rewrite
was verified content-neutral — sorted non-blank lines before/after differ by precisely the four
added heading lines, nothing moved between releases.

**Decision — a new static gate, `test/run_release.js` (18 checks).** It asserts the three files
that describe a release say the same thing: `site/release.js` names a full `Alpha X.Y.Z`;
`changelog.html`'s newest live entry is that version; **`CHANGELOG.md`'s newest version heading
is that version** (the check the gate exists for); dates agree across both changelogs for every
version `CHANGELOG.md` still names individually; both files are strictly newest-first; and
`[Unreleased]` exists exactly once, above everything.

Two parsing traps worth knowing. `changelog.html` carries a **fully-formed specimen entry**
(`Alpha 1.5.0`) inside its `ADDING AN ENTRY` comment — read as data it makes the newest
published version look like 1.5.0, so comments are stripped first. And `## [Alpha 1.6.1 and
earlier]` is a deliberate catch-all for the pre-history, so the cross-check floors at the
oldest individually-named version rather than demanding a heading per site entry.

**Verified against the real failure, not a synthetic one** (HR10): run against `CHANGELOG.md`
exactly as it stood before this fix, it reports 3 red — the wrong newest heading, plus 1.11.0
and 1.10.0 published on the site and absent from the file. All 18 checks were driven red by
injection. `run_all` is **33 → 34 runners**.

**Also fixed: the skill never actually said to do it.** `release-to-main` covered
`changelog.html` and `site/release.js` and stopped there — the `CHANGELOG.md` roll appeared
only in that file's own header comment. It now has the step, the reason it is easy to skip, and
`run_release.js` on the checklist **before the merge**, since after the merge it is a red gate
on `main`.

---

## 2026-07-30i — #275: the download is named by the release string, not by the path it is served from

**The defect.** `download.html`'s button carried a **bare** `download` attribute on
`href="download/latest.zip"`, so the browser saved the file under the href's own basename:
**`latest.zip`**. No product name, no *Alpha*, no version. `site/make_download.js` had always
written a correctly-named versioned copy (`Reactor_Dynamics_Alpha_1.11.0.zip`) beside it, and
the HTML *inside* the zip has been correctly named since the bundler was written — the
anonymous wrapper was the only broken link in the chain, and it is the only one the visitor
ever sees.

**Decision — stamp the name, do not move the link.** The stable href is deliberate
(`make_download.js`'s own comment: "download.html links a STABLE path so it never needs
editing per release"), and pointing it at the versioned file would have bought a correct
filename for a **new hand-edit in the release procedure** — in a repo where the Alpha 1.10.0
and 1.11.0 developer-changelog rolls were both missed, adding a fourth thing to remember is
the wrong currency. So the href stays, and `site/nav.js` sets `download=` from
`window.RD_RELEASE` at `DOMContentLoaded`. `nav.js` already stamps `RD_VERSION` into the
footer the same way, and `site/release.js` is already the one hand-edited version string that
`make_portable.js` and `make_download.js` both read. **Net new per-release steps: zero.**

**Two alternatives rejected.** (1) *Rewrite `download.html` at build time*, the way
`stamp_version.js` writes `version.js` — but those are declared generated placeholders, while
`download.html` is hand-authored source, and mutating it at deploy makes the local file
silently differ from the deployed one. (2) *`Content-Disposition` in `vercel.json`* — puts the
version in a third hand-edited file.

**Degradation is the point.** With JS off, the bare `download` attribute is still in the
markup and the file still saves — as `latest.zip`, i.e. exactly today's behaviour. The failure
mode is *no better than before*, never *a confidently wrong version number*, which is the
failure mode a hard-coded fallback would have had.

**Gated: `run_portable.js` +7 checks (116 → 123), new `DOWNLOAD` rule.** Every way this
wiring breaks leaves a button that still works and still downloads — drop the `release.js`
tag, rename the anchor id, load the scripts in the wrong order, or change the filename prefix
in one of the two files that spell it, and nothing anywhere goes red while the site quietly
hands out the wrong name. The section pins all of that plus the no-JS fallback, and asserts
`nav.js` and `make_download.js` construct the **identical** name by extracting the prefix,
the sanitizer regex and the extension from each source rather than re-spelling the name here
(which would be a fourth place to drift). **All seven were driven red by injection** — eight
mutations, each caught — before being counted green (HR10; the `verify-checks-by-injection`
rule). Measured after: headless Edge over `file://` reports
`download="Reactor_Dynamics_Alpha_1.11.0.zip"`, byte-identical to what `make_download.js`
writes.

**Noted, not fixed:** `make_download.js`'s sweep of stale artifacts matches `*.zip` only, so a
leftover `Reactor_Dynamics_Alpha_1.10.0.html` persists in a local `download/`. `download/` is
gitignored and Vercel checks out fresh, so nothing stale can deploy; it is local litter, and
out of this issue's scope.

---

## 2026-07-30h — #249/#273: the surplus axis is fitted, and "could the gauge even get there?" is now a gate

**Decision 1 — `level_per_mass_surplus` is fitted to real geometry, not chosen.** 300 → **776 %/frac**
*(OWNER RULING, 2026-07-30: "249 - fit it.")*. The derivation is the pressurizer steam space as a
fraction of RCS volume: 0.40 × 1,400 ft³ ÷ 9,650 ft³ = **0.0580** (BVPS-2 UFSAR Tables 5.1-1 and
5.4-12, ML22144A118; full-power steam fraction from WTSM 3.2 Table 3.2-2, ML11223A213). This sim
spans 45 points of level from nominal to solid, so 45 / 0.058 = 776. **The soft step is stated in
the config**: it assumes indicated level ≈ volumetric fraction, which is this sim's convention and
not necessarily a real calibrated span.

This was not cosmetic. At 300 the going-solid coordinate was 0.15 wide and `primary.mass_max` (1.2)
clipped inventory **before** the gauge ran out of scale, so with `base(Tavg)` at its 28 % floor —
which every quench below 559.8 °F (293.2 °C) reaches — indicated level pinned at exactly
28 + 300×0.20 = **88.00 %** and stayed. **The plant could not go water-solid on injection**, which is
the single behaviour the TMI content is built on.

**Decision 2 — the shared CVCS gain was NOT scaled with it, and the first recommendation to do so
was wrong.** The documented 83 s loop τ is the **deficit** branch (`level_per_mass` 100); scaling
`cvcs_charge_per_level` to hold a surplus-side τ would have slowed leak make-up to 215 s to fix a
number on the other branch. The servo is simply faster on the surplus side now (27.8 → 10.7 s), and
measured, it does not hunt. `mass_max` also stays at 1.2: 1.06 is the physical figure but costs the
going-solid endpoint (peak 96.83 %), and it is no longer binding on that path anyway.

**Decision 3 — accumulator isolation is procedural, at a sourced pressure.** #273. The cooldown now
isolates at **1000 psig (6.89 MPa)**: NUREG-1431 Rev 4.0 (ML12100A222) **LCO 3.5.1** applicability is
*"MODES 1 and 2, MODE 3 with RCS pressure > [1000] psig"*, and LTOP **LCO 3.4.12** requires the system
operable *"with … the accumulators isolated"* (**SR 3.4.12.3**). **Deliberately not an interlock.**
An automatic closure would have been easy and is how the RHR suction valve works at 400 psi
(2.76 MPa), but real plants isolate accumulators procedurally and the whole point of the beat is
that the player learns the passive tanks are not covered by the SI block. Whether an interlock
*should* back it up is left open on #273 rather than decided here.

**Decision 4 — new gate `run_reachability.js` (55 checks), and why it has two halves that do not
overlap.** The generalisation of what went wrong: an assertion that a trip never fired is worth
exactly what the gauge can reach, and nothing checked that.
- **Part A (static, all 50 thresholds)** — every trip/actuation/alarm setpoint must sit **strictly**
  inside its instrument's declared range, because `crossed()` is strict. This is the long-standing
  C1 lesson turned into a gate.
- **Part B (dynamic, small)** — Part A would **never** have caught this: `pzr_level`'s range is
  [0,100] and its trip is 97, so the static check was perfectly happy while the level physically
  could not exceed 88.00 %. Only stepping the plant finds a clamp. Injection-verified: B1 reports
  peak 89.01 % and goes red on the pre-fit 300.
- **A probe must name its mechanism.** B2's first draft drove the low-level scram with letdown and
  failed at 29.6 % — correct plant behaviour, because the 17 % letdown isolation exists to shut
  "before the 12 % pzr-level reactor trip". A reachability probe that does not name how it expects
  to reach the setpoint just re-discovers an interlock and calls it a defect.

**Gate effect.** `run_all` 32 → **33 runners**; `run_campaign` 3026 → **3038 checks** (the new beat
plus three endpoint assertions, all injection-verified red). `run_behavior`, `run_pwr`,
`run_meltdown` and `run_procedures_stack` are **unchanged** — the fit cost nothing elsewhere.
## 2026-07-30g — #262: a failure whose ENTIRE severity range is inside make-up authority

**The decision: size `rcp_seal_leak` so every slider position is holdable**, rather than adding a
finer step to `large_loca`. The finer step cannot work — 0–50 % rated flow across 100 integer
steps cannot resolve the 0–0.14 % band where a holdable leak lives, and the smallest injectable
LOCA is already ~7× beyond charging. The gap was **unreachable**, not merely uncovered, which is
why it needed its own `severity_meta` rather than a control tweak.

**The ceiling is measured and is HALF the figure the issue was filed with.** #262 derived
authority as `charging_max · cvcs_inventory_gain` = 7.2e-4, which silently assumes letdown is
isolated. With letdown in service the net is `(0.06 − 0.03) · 0.012` = **3.6e-4**; measured, 3.5e-4
holds (charging 0.0585 of 0.0600) and 5.0e-4 does not. Sizing the slider to the filed number would
have left its **top half unholdable** — reintroducing the exact defect. Recorded because the error
class matters: an authority figure quoted without its lineup is not a number, it is half a number.

**Deviation from the source issue, deliberate:** the slider unit is "% of make-up capacity", not
gpm. The repo's gpm are display flavour that do not reconcile with the mass balance, and quoting
one here would invite the real-Tech-Spec comparison this very issue had to retract in its own
thread. Self-referential units cannot be mis-compared.

**The bottom ~20 % of the range is below the alarm on purpose.** Severity 0.15 puts charging at
0.0344 against a 0.036 setpoint — visible as a trend, not annunciated. The load-change peak is
0.0323, so catching 0.15 would mean a setpoint within 5 % of normal manoeuvring. Leakage below the
alarm point is a real condition, and building the failure so its whole range alarms would have
been less honest, not more complete.

Manuals Rev 15 → 16 (new 07 PWR-E23 + index + slider table). `run_all` OK, 32 runners.

---

## 2026-07-30f — #270/#271: indications key on ARMED PROTECTION, never on plant mode

**The decision, now applied board-wide: an indication shows the protection in force, and the
discriminator is the ARMED/BLOCKED state — not `plant_mode`.** The tempting alternative for #270
was "if Mode 5, use cold bands". It is wrong for a reason worth recording: a Mode 5 plant at
400 psi and a **LOCA** at 400 psi are the same reading and must look different. Armed state
separates them for free — measured through a real `large_loca`, `trip_blocks` stays `{}` all the
way down to 15 psi, so the hot window and red band persist exactly where they should.

**Deviation recorded: the note colour is now a region key, not always red.** `noteKind: 'ok'` for
"bypassed for the mode you are in", because the control layer already reclassifies those alarms to
`status` priority when cold. A red note would have made the tile contradict its own annunciator.

**Two latent defects surfaced under #270, both found by printing values rather than reading code.**
`bandsFor` applied `alarmHi` and never `alarmLo` — the only mode-aware helper that existed set the
high side, so the low path had never run. And its clamps are one-sided, so a band that has moved
far can be crossed over itself; that produced the Mode 5 inversion where a correct 363 psi painted
TRIP RED. The inversion guard is central, not per-helper. **It also masked the `alarmLo` bug into a
zero-width `2149..2149` band** — a guard can hide the defect it guards against, which is why the
pin asserts the band's value, not just its ordering.

**#271 — presentation follows the channel.** The NIS readouts are `value` items: bare log-ranging
numbers with no region model, so the indication is the colour of the number (the mechanism the SR
readout has used since #105) rather than a band or a tile. Three calls: *approaching* is measured
in **decades** (0.5), because per-cent is meaningless on a log scale; **grey when not armed**;
and SUR's red marks the rod-withdrawal **interlock** at 1.5 DPM, not a trip — it has none.
Thresholds are read from the alarm/interlock tables and resolved **lazily**, since `_PROT` is
assigned below them.

**Explicitly not done:** on-board numeric threshold annotations for the NIS channels. No room in
that panel, and the tiles' note slot does not exist for `value` items. The numbers live in the
inspect copy — colour is for the limit you must *notice*, text for the limit you want to *read*.

board_check **113 → 127**, injection-verified in both directions.

---

## 2026-07-30e — #263 item 2: the creep step is derived, and its INPUTS are what got gated

**The decision: derive the number rather than declare it empirical**, which was the other option
#263 offered. `pwr_startup`'s 26-step creep came from a 22/26/30 sweep kept for landing inside the
authored 1–3 % band. It is now

    creep = (critical position − the 306 steps of plotted 1/M bursts) + (excess ρ / differential worth)
          = (319 − 306) + (85 pcm / 6.70 pcm/step)
          = 13 + 13 = 26

with the excess itself derived, not chosen: the level-off must cover **3.20 decades** (6.25e-4 % →
1 %) in the authored **600 s** hold, which is **0.32 DPM**, which measures at ~85 pcm.

**What got gated is the DERIVATION'S INPUTS, not the number.** `run_reactivity` 23 → 27. Gating
"the creep is 26" would have been a tautology — the file says 26. Gating the four quantities 26 is
computed *from* means a retune that invalidates the reasoning reddens even when the procedure still
happens to pass. This is the #263 item-6 lesson (greens that mean nothing) applied preventively.

**The tolerance was wrong on the first cut and the injection test is what said so.** ±0.15 pcm/step
on the differential worth let a 3.2 % rod-worth retune through at 6.82 while the other three checks
caught it. Tightened to ±0.05 — defensible because this is a deterministic static computation with
no noise. Recorded because the general rule is worth more than the number: **a guard the injection
test walks past is not a guard**, and the injection test only told us because it was run.

**Layer discipline, one day after learning it.** The derivation was confirmed full-stack through
`test/measure_stack.js` (#266) before being written down — +78 pcm vs 80 engine-direct, level-off
1.04 % vs 1.004 %. The layer moves nothing here, but that is now a measured statement rather than
an assumed one.

---

## 2026-07-30d — #266: no service change; the harness was driving the plant through a real timer

**The decision: change NOTHING in `simulation_service.js`.** #266 proposed a `measure`-mode
advance that skips snapshot/instructor work when nothing is subscribed. Profiled first (its own
checkbox 1), that work is **~5 %** of wall clock and `engine.step` is **87.9 %** — the optimisation
would have bought nothing and added a second code path through the one layer whose job is to be
the single way commands reach the plant (HR5). Cost is linear in sim duration (six plant-hours at
0.98× drift) and the checkpoint ring is capped, so there is nothing to fix.

**What was actually wrong** was the caller: `start()` arms `setTimeout(this.broadcastMs)` and
advances in **wall** time (measured: 5.0 s of wall = 48.0 s of sim at accel 10×). 30 plant-minutes
costs 3.1 real minutes that way, 31.3 if an attention stop drops acceleration to 1× (#245) — and
**~2 seconds** driving `tick()` directly. `board_check.html` had the warning in a local comment;
it was never generalised, so it is now in CLAUDE.md's layer section.

**Delivered `test/measure_stack.js`** rather than a service change. Deliberately a HARNESS, not a
gate: `run_all` discovers `/^(run|verify)_.*\.js$/`, so this name is outside the gate list on
purpose — it produces numbers, it does not assert them, and a baseline on a measurement tool would
be a baseline on the plant's behaviour in disguise.

Three properties it commits to: the **layer is stamped in its own output** (#266 checkbox 4,
alongside lineup and the #153 protection granularity); every column prints its **source**, since
`tavg_c` and `tavg` differ by exactly the HR1 gap; and units are **US-first with SI in
parentheses** at the point of production, deltas/rates converting ×9/5 with no offset. An unknown
option or unresolvable field is a hard error — the first cut accepted a typo'd `--wach` and
printed a correct-looking table from the default field set.

**Settled as a side effect:** #263 item 5. `pwr_mode5_to_mode3` measured at both layers is
identical to every digit (all five milestones 0.00 h apart, every 12-hour state value equal), so
the header's "may differ modestly, NOT measured" caveat is retired. Its ρ/boron figures were stale
by #263's refit and are corrected (−3377 → −2828 pcm, 907 → 856.8 ppm) — a staleness the layer
question had been masking.

---

## 2026-07-30c — #267: the vital tile's red band follows the ARMED trip, not the first table row

**The decision: a tile band is resolved per-snapshot from the trips that are actually armed, and
a trip is treated as disarmed ONLY when it is BLOCKED** (`rps_state.trip_blocks`), never when a
`condition` merely fails to hold. Conditions (`above_p9`, `sr_energized`) flip on their own in
seconds; a block is deliberate and recorded. The conservative rule can only add warning regions,
never remove one the operator did not remove themselves.

**Why it was wrong.** `power_range high` has two trips — 120 % and `pr_low_setpoint` 25 % — and
`tripSp()` returns the **first table match**. The table authors the backstop first, so the tile
read 120 % everywhere, including at the three ICs (`hot_zero_power`, `5_percent`,
`cold_shutdown`) where the armed limit is 25 %. Measured on engine+M4: armed, **26 % scrams and
24 % does not**; blocked, 26 % is clear and 121 % scrams.

**Deviation from the source component, recorded.** `comp_indicator_panel.js` gains an optional
`note` — a short right-aligned annotation in the label row, shown only when the tile's limit is
**not** its at-power default. It is an *exception marker*, not a caption: a caption present on
every tile every second is one nobody reads, and the tile is 114 px tall, so a permanent extra
row would have been paid for out of the sparkline. Tri-state on purpose (`undefined` = leave
alone, `''` = clear, string = show) so a driver that never sets it is unaffected.

**Band layout while the low setpoint is armed** — `normHi === alarmHi === P-10` collapses the grey
"acceptable" region to nothing, so 10 → 25 % reads **amber** rather than as headroom. That amber
band's width is the operator's blocking window, which is the thing being taught.

**Guards.** `tripBackstop()` (least-limiting, order-independent) replaces `tripSp()` for the
static base, and is pinned — re-authoring the protection table can no longer move a tile's band
silently. board_check **106 → 113**; the 7 pins were **verified by injection** (stub `powerBand()`
to `return null` → exactly the 3 discriminating pins go red with the old values, the 3 fallback
pins stay green). `run_all` **OK, 32 runners**.

**Open, deliberately not done here.** `primary_pressure low` has the same shape (`lo_press`,
`si_trip`, both blocked at a depressurized init) and is still on the static resolver, so a Mode 5
plant at 400 psi reads pegged in a red band for a trip that is not armed. It needs the
`normLo`-vs-`alarmLo` clamp revisited at the same time or the green band lands wrong. Follow-up
on #267.

---

## 2026-07-29m — #194: no CVCS retune; the gate check was measuring 0.48 τ

**The decision: do NOT retune CVCS. No plant code changed.** #194 held that CVCS make-up covers
a constant ~24 % of any leak, so "inventory never stabilises for any leak size" — and the owner
ruled it an artifact, directing *"more proportional gain, or a slow integral term"* to make CVCS
hold a small identified leak. **Measurement refutes the premise: it already holds every leak
inside its authority at ~100 % coverage.** Retuning would have deleted the droop cue the same
ruling asked to preserve, to fix a system that was not broken. Recommended closing as
not-a-defect. See `Diagnostic/TUNING_LOG.md` 2026-07-29m for the full measured tables.

**The mistake, and why it survived so long.** `step(n)` in `run_e2e_controls` advances
**broadcast cycles** (0.1 s of sim time each), not seconds. The issue body and the test file's
comment block both labelled the 400-cycle window "400 s". It is 40 s, against a loop whose time
constant is 83 s — every number in #194 was read at **0.48 τ**. Coverage looked constant across
leak sizes because the loop is **linear** (at a fixed time every leak sits at the same fraction
of its own approach), which was misread as a droop artifact.

**Why the derived form is the right assertion (HR10).** The equilibrium follows from config
alone — `deficit* = leak / (gain · charge_per_level · level_per_mass)` — and predicts the parked
inventory to two decimals (99.00 / 98.01 predicted, 99.00 / 98.01 measured). The replaced check
had been written *from the observation*, so it enshrined the artifact. The negative control is
the point worth keeping: weakening the servo 10× to build the plant #194 described makes the old
check **pass** and three of the four new ones **fail**, while on the healthy, unchanged plant the
old check **fails** and all four new ones pass. A check can be green, cited across three
documents, and still be pointed the wrong way round.

**Gate:** `run_e2e_controls` **35/35 → 39/39** (1.2 s → 2.5 s). One follow-up filed: the
cycles-as-seconds trap in the shared `step()` helper.

---

## 2026-07-30a — #263: shape AND scale are measured; the 2026-07-21 at-power ruling is superseded

**The decision** *(OWNER RULING, 2026-07-30: "for 263 item 1 fit the measurement.")*. Fit
both moderator parameters to the three measured BEAVRS Cycle 1 HZP isothermal temperature
coefficients rather than fitting one and setting the other by preference.

**Why the previous split did not hold.** #260 shipped "shape measured, scale ruled": the
crossover from data, the magnitude from the owner's 2026-07-21 −20 pcm/°C. That was
defensible while the crossover came from a WTSM 2.1 *statement* — but the same BEAVRS
table that supplied the crossover also constrains the slope, and the two together force
the magnitude. Honouring the measurement and the ruling simultaneously is impossible under
a linear-in-boron form. The owner chose the measurement.

**What it costs, and why that is acceptable.** The at-power coefficient goes −20 →
**−26.8 pcm/°C**. A stronger coefficient means the core absorbs a rod withdrawal as
temperature rather than power — which is the prototypical behaviour at power, where the
turbine sets power and the rods set temperature. The plant is *more* self-regulating, not
less realistic. The supersession is recorded in three places and pinned by
`test/run_reactivity.js` so it cannot silently revert.

**What it bought.** Residuals against all three measured points 0.05/0.88/1.64 → ≤0.09
pcm/°F. The gate's tolerances tightened 1.4/2.2 → 0.3 — there is no declared departure left
to permit. **Nothing in the reactivity curve is set by preference any more**, which was the
open question #263 was filed to close.

**Precedent worth keeping.** Two probes were re-authored to assert the claim rather than
track the plant: `run_pwr`'s withdrawal check now pins **Tavg** (which strengthens as the
coefficient strengthens) instead of a power threshold that would need lowering at every
retune, and `run_reactivity`'s cold/hot separation became a **gap** test instead of an
absolute ppm floor. Both were validated against the pre-change plant, so they are better
tests rather than refits.

## 2026-07-29l — #260: moderator reactivity is density-shaped; rod worths and `rho_excess` re-solved

**The decision.** Delete `alpha_MTC` as a constant. Moderator reactivity becomes
`C_mod · (1 − B/mod_boron_zero_ppm) · (d(T) − d(T_ref))`, *d* = relative water density. Rod
worths go to the measured real values; `rho_excess` becomes a **solved** quantity rather than a
tuned one. *(OWNER RULING, 2026-07-29: "do the full reactivity calibration for fidelity. I dont
want to have to fix things twice.")*

**Why a constant was wrong, and what it cost.** A flat −11.11 pcm/°F from 122 °F to 579 °F
integrates to a −4944 pcm moderator defect over a Mode 5 → Mode 3 heatup — 494 ppm of dilution,
a third of it charged below 274 °F — and collapses critical boron from 819 ppm cold to 263 hot.
The operator-visible consequence, found in free play: **600 ppm was critical at 274 °F**, so
diluting toward a value that looks safe next to the hot end took the reactor critical cold.

**What each number is anchored to.** WTSM 2.1 (ML11223A207) Fig 2.1-8 gives the shape (density,
not ΔT), the −17 pcm/°F unborated point at 500 °F, and the ~1400 ppm zero crossing. WTSM 2.2
(ML11216A051) Table 2.2-1 gives control banks 4068 pcm and shutdown banks 3676 pcm. BEAVRS /
Watts Bar U1 Cycle 1 gives HZP ARO critical boron 975 ppm, which is what `rho_excess` is solved
against. `test/run_reactivity.js` pins all of it.

**The alternative that was rejected.** Reshaping the moderator term alone, holding the hot end
pinned, was the scoped option and it was recommended first. It was rejected by the owner because
it fixes the *shape* while leaving the absolute boron scale wrong — rod worth at 18 500 pcm was
2.4× anything sourceable and had collapsed rods-in critical boron to 263 ppm at HZP. Doing both
at once avoided re-authoring the same content twice. **This supersedes the rod-worth concern
parked in #238.**

**Why the at-power tuning survived.** The sourced curve gives −21.9 pcm/°C at the operating
point against the −20.0 ruled on 2026-07-21 — within 9 %. The 2026-07-21 ruling was right at
power and only wrong extrapolated to cold, which is why EV-11, the TR-1 ride-out, PI-8 and the
load-follow behaviours all held without retuning.

**Consequences accepted.** `pwr_startup` and `pwr_heatup` were re-authored (HR9 — content follows
the plant); the source-range count-rate milestones were re-derived from measurement, which is the
one assertion moved to match the plant and is called out as such. `pwr_heatup`'s ride is now
gentle enough (≈7 % peak) that its two startup-trip blocking steps are precautionary rather than
load-bearing — kept deliberately, with the measured dilution rates that *do* reach the trips
recorded in the caution. PI-9's *"nearly 3× the held worth in spare margin"* premise is down to
~1.26×: the #199 ruling stands, its cushion does not.

**Open.** No Estimated Critical Condition exists anywhere (WTSM 2.2 §2.2.3) — the thing that
would have stopped this event before the trip. One lumped control bank still carries all four
banks' worth. Tracked in #260.

## 2026-07-29j — #251: the SG boils everything that crosses it; the pump-heat netting deleted

**Claim.** Rated steam flow is the flow made by **NSSS rated heat** — rated core heat *plus*
full-flow RCP pump heat — not by core heat alone. Both the SG's generation rate and the follow
governor's demand are normalized on that, and the correction term that used to cancel pump heat
inside the steam balance is gone.

**Why.** `pwr_steam_generator.js` computed `max(0, Q_sg − Q_pump)/latent_heat_secondary`, booked
as "SG blowdown/ambient losses". It was not losses: it was sized to cancel pump heat identically
at every flow, because `extractFrac` drew steam for core power only and the extra 0.55 % had no
sink. The uncosted consequence: the steam side could never start boiling below `Q_pump`, and
`Q_sg = h_sg·(Tavg − Tsec)` settles at exactly `Q_pump`. **Measured: a pump-heat heatup is a
stable attractor at 218.69 °F (103.72 °C), ΔT = 0.321 °F = `Q_pump/h_sg` to three decimals,
forever.** A real plant rates its steam generators on NSSS thermal power, not core thermal power
— the difference *is* pump heat — and two places in this engine already assumed that
(`pwr_engine:1125,1199`, and the dump's `t_fullpower`), which is the evidence the netting was the
anomaly rather than the rest.

**The normalization choice, and what it bought.** The issue's plan expected step 3 —
recalibrating `steam_flow_rated` and giving the governor headroom above its `clip(…, 0, 1)` — to
be "the step that carries risk". Normalizing *both* sides on NSSS rated heat instead
(`latent_heat_secondary × (1 + pump_heat_frac)` in the SG, `/(1 + pump_heat_frac)` in
`extractFrac`) makes 100 % core power at full flow come out **exactly 1.0**. So
`steam_flow_rated` stays 1.0, the clip stays, rated MWe stays 100, and "100 %" still means
100 % on the steam-flow gauge and in `load_target_mwe`. The alternative — leaving the demand at
1.0055 and raising the clip — would have put every rated reading 0.55 % over full scale. The
risk item in the plan evaporated rather than being managed.

**Deviation from the filed plan, recorded as one.** Plan step 5 (measure MANUAL/DISCONNECTED
drift, decide whether they need a sink) was measured and needs **nothing**: manual at
100/75/50/25 MWe drifts at most **−2.07 psi over 4 sim-h**, disconnected ride-out +3.68 psi vs
+3.36 before. No second compensation term was added, per the plan's own instruction not to.

**The half the issue did not name.** `_buildState` set `load_mode: 'follow'` unconditionally, so
the subcritical ICs (Modes 3 and 5) spawned *synchronised* — breaker closed, `generator_load =
1e-6` — while #235 had already parked their rotor at rest. Harmless while the SG cancelled pump
heat; with the netting gone the follow governor cracks to **6.2 %** on the pump-heat demand and
drains the heatup, re-stalling it at **306.05 °F (152.25 °C)** with the same ΔT signature. Now a
single `onLine = P0 > 0.01` predicate drives rotor speed, breaker, governor position and load
mode together — they cannot disagree again. Off line here is a **planned offline, not a trip**
(#230): nothing latches, so P-9 is never armed on a cold plant.

**Result, measured with no rod motion at all.** Mode 4 (200 °F / 93.3 °C) at 0.28 plant-h;
Mode 3 (548 °F / 286.7 °C) at **10.71 plant-h**; ρ = −6287 pcm on 919 ppm with the bank at its
cold-shutdown position. Average **39.8 °F/hr (22.1 °C/hr)**, steady ~32 °F/hr after the first
hour (the first hour's 111.5 °F/hr is the compressed pressurization). Full power is unchanged to
two decimals. Rate control: secure an RCP → 0.1 °F/hr; the steam dump is far too coarse (5 %
manual demand ≈ 10× pump-heat generation, reverses the heatup at −83.4 °F/hr).

**HR10.** The new `run_campaign` heatup gate contains **no rod command at all** and asserts 0
steps of rod motion plus peak power < 0.01 %. It was validated against the OLD behaviour: with
the netting temporarily restored it **fails** on "heatup reaches an endpoint". `run_campaign`
baseline 3025 → **3026**.

---

## 2026-07-29c — #240 follow-up: the `status` class does not demand an acknowledgment

**Owner ruling** (comment on #240): *"I want status-class alarms to spawn (and arrive)
pre-acknowledged."* The parent build had deliberately declined to do this unilaterally and
flagged it, because it changes the whole `status` tier — `hpi_active` and the BWR's
`rcic_running` have been priority `status` since they were written and demanded an ACK anyway.

**Decision: implement it in the LIFECYCLE, not in presentation.** `_evalAlarms` raises a
status-class alarm straight into `active_acknowledged`. The rejected alternative was to keep
storing `active_unacknowledged` and let `getAlarms()` present it as acknowledged: that leaves
`alarmStates` saying one thing and every consumer reading another, and `acknowledge_all_alarms`
would still be silently touching it. If the plant has answered on the operator's behalf, the
state should say so.

**Decision: classify on the EFFECTIVE priority.** `_effectivePriority()` runs the #240
`reclassify` rules, so a mode/lineup-reclassified tile is auto-acknowledged too — which is the
whole point, since #240's five cold-shutdown tiles are the case that prompted the ruling.

**Deviation from a comment I wrote a day earlier, stated rather than quietly edited.** The
parent's block comment claimed "`_evalAlarms` never sees these rules". It does now. The
guarantee that was actually load-bearing is unchanged and is now stated as such: a rule can
never **stop, delay or invent** an annunciation — the clear→active transition is decided by the
instrument condition alone, and a rule is consulted only to classify something already raised.
HR1 is intact; the softening now extends to the ACK demand as well as priority and wording.

**Addition not in the ruling, and why it is not scope creep: ESCALATION.** An auto-acknowledged
tile whose condition stops being planned (heatup past Mode 4; a genuine trip landing on top of a
secured pump) is returned to `active_unacknowledged`. Without it the ruling would *create* the
failure it exists to prevent — a genuine critical, lit and steady, that never flashed. Requires
one piece of new state (`alarmAutoAcked`, saved/restored) because auto-ack and operator-ack are
otherwise indistinguishable, and an **operator** ack must never be handed back. Old saves have
no field → nothing auto-acked → nothing escalates; the conservative direction.

**Addition: a status arrival is not a fast-forward attention stop** (`_attentionStop`). A tile
that arrives pre-acknowledged and then yanks the clock to 1× while toasting "new alarm"
contradicts itself. Implemented as "the arrival must reach the board **unacknowledged**", which
is exactly the set the plant did not answer for you — nothing but the control layer can produce
a clear→acknowledged transition in one broadcast. The **transient cadence** flip deliberately
still counts status arrivals: a shorter broadcast interval costs the operator nothing, and
changing it would perturb broadcast timing for no benefit.

**What that second addition uncovered — and a caution for whoever touches `_attentionStop`
next.** `run_procedures_stack` sets `svc.timeAcceleration = 10` **once** and never restores it.
The first alarm on a quiet board snapped it to 1× permanently, so procedures were covering a
tenth of the sim time their steps assume. `bwr·bwr_startup` step 2 had been filed as a **BWR
plant defect** (#208 strict xfail) purely because of this: at t = 2.0 s `RCIC RUNNING` — a
`status` tile — took the dropout. Removing that one case gave the run its declared 10× and the
step passes on its own physics; the xfail entry is removed with the measurement recorded at the
site. **Ten more dropouts still do this** to other procedures in the same gate → **#245**, not
fixed here because fixing it re-baselines that gate and that is its own piece of work.

**Gates.** `run_m4` 23/23 (117) → **25/25 (135)**; `run_procedures_stack` 22/22 (155/155),
strict xfails **6 → 5**. Both new suites fail wholesale on the pre-ruling source (HR10); their
regression checks pass on both sides.

---

## 2026-07-29a — #203 the manual's sim-physics chapter

**Decision: a NEW chapter, not an expansion of `01` §8.0.** #203 asks for "the physics used for the
sim and the simplifications, important omissions and other useful info". `01_GENERAL_DESCRIPTION.md`
§8.0 already holds a seven-row simplifications table — but `01` is the *orientation* document an
operator reads before free play, and the honest-scope material is reference the operator returns to,
not preamble. Growing §8.0 into it would have buried the plant description under caveats. §8.0 stays
a summary and now points at `12`.

**Decision: simplifications and omissions are SEPARATE sections.** §12 is "modelled, but simply";
§13 is "not there at all". Collapsing them is what makes a scope document useless — an operator
hunting for a containment pressure indication needs "it does not exist", not "it is approximate".
§12 also answers, per row, *does this change what I should do?* — because most simplifications
don't, and the two that do (**no natural circulation**, **no sensor voting**) are exactly the ones
that make the trainer HARSHER than reality and therefore must not be read as conservative.

**Decision: numbers are graded by trustworthiness (§14).** Structural (β, Λ, damage thresholds, real
setpoints like the 4.14 MPa accumulator arming pressure) · calibrated (heat-transfer coefficients,
level gains) · deliberately time-compressed (boron rate, lab turnaround, pressurization slew) ·
display flavour (the gpm conversions). Without that grading a reader has no way to know that 2500 ppm
RWST boron and 24 000 gpm RCS flow are different kinds of claim.

**Written from the engine, and it caught two stale documents.** `01` §8.0's cold-ops row still said
Mode 5/4 was `[narr]` and that Free Play starts in Mode 3 — false since the Mode 5↔1 transition
shipped on integrated physics. And `DESIGN_COMPANION` §8.16's "levels are geometric fill" is now only
half true: SG level has a real narrow/wide window. The first was corrected; the second was left as
historical record with the current position stated in the new chapter.

---

## 2026-07-28t — #225 the §6.3 true_state contract, documented and gated

**The filed number was stale, and that is the whole argument.** #225 reported 41 of 82 PWR
`getTrueState()` fields undocumented in `CONTEXT.md` §6.3. Re-measured before acting (per the
verify-first rule): **29 of 84**. Twelve of the filed 41 had been documented in the interim
synoptic-additions pass, and **two fields the issue never listed had appeared since** —
`clad_temp_c` (#213) and `cw_inlet_temp_c`. So in the days a hand-written list sat in an issue,
it drifted in *both* directions. A list cannot hold this; only a gate can.

**Decision: the gate fails BOTH ways, not just on undocumented fields.** `test/run_contract.js`
reports an engine field missing from §6.3 (undiscoverable, or consumed anyway with no stated
meaning) **and** a documented field the engine no longer emits (a contract promising something
the snapshot does not carry — worse, because a consumer will code against it). The second half
is what would have caught a rename; the first half alone would let `foo` → `foo_c` read as
"one new undocumented field" and leave the phantom in place.

**Decision: the engine side is a UNION over every initial condition, not one reset.** Today
`getTrueState()` returns a fixed object literal so the key set is constant, but that is an
implementation detail one conditional spread would end. Unioning over `initial_states` (5 for
the PWR) makes a field that only exists in one plant state still part of the contract, and
costs nothing.

**Decision: the parse is fail-loud.** A renamed §6.3 heading or a reshaped block yields zero
documented keys — the runner exits 2 with an explicit message rather than reporting a clean
0-of-0. A doc-diffing gate that silently passes when it stops finding the doc is worse than no
gate, because the green is now evidence.

**Check count = every field name on either side (84).** Adding a `true_state` field shifts the
baseline in `run_all.js` even when the author dutifully documents it — the same deliberate
friction as `run_hr3`'s site count. Documenting a field should be part of adding it, not a
follow-up someone files.

**Scope: PWR only.** RBMK and BWR are registered in `PLANTS` with a `skip` reason rather than
omitted, so reopening them is one flag each — but their §6.3 blocks have never been diffed and
turning them on today is expected to be red. That is work for when the plants reopen (#225
says so explicitly).

**Documented with the traps, not just the names.** Several of the 29 exist precisely because
two similar fields mean different things, and the one-liners say which:
`steam_flow_normalized` is TURBINE flow alone and reads ~0 whenever the dump carries the plant
(`steam_out_total` is the real steam-line flow); `sg_level_pct` pegs on an overfill/dryout while
`sg_level_wide_pct` keeps reading; `core_void_fraction` is flux-driven DNB and
`primary_void_fraction` is inventory-driven loop voiding; `accumulator_pressure_mpa` is
indication only — injection is gated on cold-leg pressure vs a **fixed** `accumulator_trip_mpa`,
not on the computed cover-gas pressure. That last one was checked in `pwr_primary.stepAccumulators`
rather than inferred from the field name, which is how the first draft of the line came out wrong.

**Gate validated against the OLD behaviour (HR10).** Run against `HEAD:Blueprint/CONTEXT.md` it
fails with exactly the 29; against the new file it passes; with a phantom key injected it fails
`STALE 1`. Passing only on the change would have made it a refit.

---

## 2026-07-28s — #96 inspection system: the board explains itself, in two tiers

**Decision: the System Scanner IS the inspection block — one surface, two tiers.** #96 and #69
describe a new "inspection block"; the shipped Scanner (M8 §11) already occupied that role and
that screen real estate. Building a second hover-driven explainer beside it would have split the
copy and forced the player to learn which surface answers which hover. Collapsed it is the
existing one-line hint; clicking it expands the same hover into the full account. **M8 §11 gains
a §11.1** rather than being superseded.

**Decision: board copy is DATA in the driver's half, chrome copy stays inline.** `pwr_board_inspect.js`
holds 160 entries keyed by diagram item id, reached through `RD.PwrBoardDriver.inspectItem` —
the same contract as `CONTROL_LABEL_MAP` / `PIPE_TEMP`, and for the same reason: the renderer
holds no plant knowledge. Chrome (`data-scanner-hint` / `-detail` / `-doc` / `-sec`) keeps the
inline mechanism, because a Play button has no plant meaning to look up. Gauge and alarm detail
is **generated** from `RD.MANUAL` and the plant's protection table so it cannot drift from a
retune — authoring range/lag/setpoints again would have been a second copy of numbers we already
hold.

**Decision: coverage by geometric containment, not by authoring every caption.** Board tiles are
absolutely-positioned siblings (`buildStage`), so DOM ancestry cannot say which card a control
belongs to. `boxOf()` derives it from the generated doc — smallest box containing the item's
centre — and an item with no entry inherits its card, **flagged `inherited`** so the block can
say it is describing the whole card. That flag matters: an unflagged group summary reads like a
per-item answer, which is a quiet lie about coverage. Interactive items, components and
indications are therefore required by gate to carry their **own** entry; only captions may inherit.

**Decision: a geometric hit test alongside the DOM one.** `reactorVessel` is `pointer-events:none`
so the rod buttons it overlaps stay clickable — meaning the DOM never sees a hover on the biggest
object on the mimic. `RD.PwrBoard.itemIdAt(clientX, clientY)` resolves those by geometry, in the
stage's own paint order (authored z, then authoring order). Used **only** when the DOM answers
nothing, so a normal hover still resolves by DOM and pipes (which contain no items) stay silent.
This is also the primitive **#71** should consume rather than re-derive.

**Owner directive (2026-07-28), mid-build: no hover highlight.** *"when mousing over something to
have it show in the system scanner it should not highlight the object being moused over. the white
box that now appears around objects the mouse is over is very annoying."* The first cut drew a
quiet ring, per the merged text in #69. Removed, and `run_inspect.js` **pins its absence** —
the issue text still asks for a glow, so without the pin the next reader restores it in good
faith. `.instr-glow` and `.ckl-glow` are untouched: they mark something the player did not choose,
which is the case that needs a marker.

**The gate exists because every failure mode here is silent.** `run_inspect.js` (7/7, 35 checks):
orphaned keys, per-kind coverage, duplicate copy, and **manual citations resolved against the
packed markdown** — which caught ten entries citing manual-03 section numbers while pointing at
manuals 08/05 on its first run. `board_check.html` (95 → 106) pins the resolution half against a
mounted board. The driver `selfTest` carries the same coverage assertions so a board change fails
where the board is checked.

**Two defects the suites could not have found — the app was driven.** (1) The Manual link was
unclickable: reaching it meant crossing the block, whose own scanner hint re-rendered it and
detached the button mid-click → the block now never describes itself. (2) The generated gauge text
converted subcooling margin, a temperature *difference*, as an absolute (`−18 to 181 °F`), because
the manual reference records its unit as `°C` → `instrDim()` asks the gauge's own `dim` first.
Worth recording as a HR10 instance: both were green everywhere and wrong in the hand.

---

## 2026-07-28r — #240 alarm condition processing: a cold plant is not a casualty

`run_m4` **19/19 86 → 23/23 117**; everything else at baseline. Owner ruling 2026-07-28
("Go with #1 Mode-dependent severity/suppression and number 2"). The decisions:

- **The premise was sourced before it was built, and it held.** "Real plants use
  mode-dependent alarm suppression" was recall. NRC **NUREG-0700 Rev 4** (ML26022A094)
  **§4.1.2-7** states the rule; **Table 4.1**'s worked example is *our* case verbatim (a
  low-pressure signal expected in cold shutdown); **Table 4.1 Status-Alarm Separation** is
  option 2 by name; **§4.1.2-8** (system configuration processing) is why the RCP rule keys
  on the handswitch. Two design constraints came from the same document rather than taste:
  **reclassify, never filter** ("suppressed, where users can retrieve them, rather than
  filtered"), and **§4.3.6-3** — say that a mode-defined change took effect, hence the
  reworded labels and `status (normally critical)`.
- **Reclassification is presentation-only, by construction.** `reclassify` rules are
  resolved in `getAlarms()`; `_evalAlarms` never sees them. A rule therefore *cannot*
  suppress, delay or invent an annunciation — it can only soften one that already fired,
  and an unresolvable instrument falls through to the authored priority. That is what keeps
  HR1 intact: the alarm still reads its own instrument and still enters the lifecycle.
- **The rule shape is data, not a mode API.** First draft used `modes: [4,5]` and read
  `ins.plant_mode` in the kernel — an HR3 violation that `run_hr3` (#227) failed on
  immediately. The shipped form carries `instrument` + `in` from the plant module, so the
  general kernel names no plant field. Worth recording: **that gate paid for itself the
  first time a new feature touched the kernel.**
- **Mode 3 is excluded on purpose, and that is the load-bearing decision.** Hot Standby is
  where a plant sits post-trip and where a genuine depressurization must read at full
  severity. It is also self-protecting — primary Tavg pins near 300 °C for every modelled
  break, so a LOCA cannot demote its own alarms by dragging the plant "cold". The residual
  (a real leak *during* a Mode 4/5 cooldown reads Status on the pressure annunciators) is
  written into the manual as an instruction, with the never-reclassified inventory alarms
  named as the ones to trust there.

## 2026-07-28j — #241 feature flags: the build ships everything, the CHANNEL decides what it offers

`run_all` **24 runners at baseline** (+`run_flags` 16/16·290, +`verify_flags_ui` 48/48).
The decisions:

- **The discriminator is the deploy, not the branch file.** A per-branch config file is
  the obvious answer and the wrong one: `develop → main` carries it across, so the merge
  that publishes is also the merge that flips every flag on. `site/channel.js` is
  **stamped at build time** by the existing Vercel step (`VERCEL_ENV`: production = `main`
  = `public`, preview = `develop`), so one committed file gives a different answer on
  either side of the merge and nothing is hand-edited per branch. The repo copy is the
  `dev` placeholder, which is also what a clone or `file://` gets.
- **Unregistered content fails CLOSED, and that is a gate failure, not a shrug.** An id
  with no entry resolves off on the public channel — but silence is not a decision, so
  `run_flags.js` fails when a scenario, procedure or campaign mission has no entry, and
  when an entry points at content that has been renamed away. Adding content now forces
  someone to answer "does this ship?".
- **Areas and items are independent, deliberately.** A campaign mission is gated by its
  own `scenario:`/`procedure:` entry and by `campaign` — not by `scenarios`. Turning an
  area on does NOT imply its contents (`?flags=+campaign` alone still shows COMING SOON);
  `?flags=all` is the show-me-everything form. Nesting would have made "vetted" ambiguous
  at exactly the moment it matters — when the owner has cleared some of a list.
- **Gating is not secrecy, and the code says so.** Gated content is still in the bundle
  and still reachable by anyone who sets an override; that is how the owner checks a
  preview feature on the live site (`?flags=1` → the panel, on any channel). It must never
  be used as access control.
- **The manual keeps its prose; only the instructed experiences are gated.** A gated
  procedure still reads normally in the operator's manual — its ▶ Follow and 📋 Checklist
  buttons are what disappear. Gating the chapter would have gutted a feature nobody flagged
  as unvetted to protect one that was.
- **Two gates because they answer different questions.** `run_flags.js` proves the registry
  is complete and the resolver is right (asserted from BOTH sides — a resolver stuck at
  `true` passes any one-sided test, and it does not throw, it publishes).
  `verify_flags_ui.js` proves the control room OBEYS it. Both defects found while building
  this were on the second side: `.set-row { display: flex }` beats the `hidden` attribute,
  so the Features row stayed on screen while `element.hidden` read back `true` — hence every
  assertion in that harness is on **visibility**, not properties — and the instructor card's
  📋 picker was a second entry point to checklists that the first pass gated nowhere.
- **Initial stages are the owner's call, recorded as data.** Free Play and the manual are
  `public`; campaign, scenarios, walkthroughs and checklists are `preview`
  (owner, 2026-07-28: *"Everything off except Free Play"*, with the vetting rationale in
  #241). One consequence worth knowing: **the first-run Hook is a scenario**, so the public
  channel currently opens with no intro offer. One line (`scenario:pwr_hook` → `public`)
  restores it.

## 2026-07-28h — #237 UI/UX pass: the player owns the column; automation directives name real controls

board_check **81/81**; `run_all` **22 at baseline**. Narrative in TUNING_LOG 2026-07-28l;
the decisions:

- **The instructor cues, it does not steal.** Per-message focus stealing is gone
  (badge + glow on the always-visible persona header); only transitions the player's own
  action caused (scenario start, level-complete, strict-gate feedback) take the column.
  Free play keeps the M8 accordion; live content hands the layout to the player (three
  reachable states). The chat header shows the SCENE (scenario title), never a speaker —
  the transcript's per-line headers own who is talking (instructor-vs-supervisor rule).
- **SI toggle scoped, not mixed (OWNER CALL, 2026-07-28, AskUserQuestion: "Scope the
  toggle")**: SI disabled with a tooltip while the PWR board is active; full SI = a
  display-unit layer in the board driver, parked as a #238 entry. The mixed display was
  the one indefensible option.
- **A directive must name a control that exists.** The Automate sweep's real find:
  `rods_tavg` had no control in the shipped UI at all — campaign mission `pwr_rod_auto`
  was unplayable as directed, and every gate stayed green because run_campaign drives
  commands, not clicks. ROD AUTO (EXTRA_ITEMS toggle, SR DET pattern) closes it; the
  board_check functional pins now click it both ways. Lesson recorded: content gates
  validate AUTHORED intent, not UI reachability — scenario directives have no
  verify_manual_follow analog (test-gap worth an issue if it bites again).
- **Alarm timestamps are UI-side state** (first-seen sim time), severity-then-newest
  ordering — severity keeps triage, stamps carry sequence. The engine's alarm records
  stay unchanged (no snapshot/save format change).
- **Failures lock is display-side** (`ui_policy.failures:'locked'`, authored on the three
  TMI-2 chat scenarios): honest note + inert tab. The command path is deliberately NOT
  gated — a determined player can still inject via console, which is out-of-fiction
  tooling, not gameplay. If a hard gate is ever wanted it belongs in the instructor
  layer, not the UI.

## 2026-07-28g — board tells the truth about flow and speed: #235 defects + #236 pipe gating

board_check **79/79** (was 59 — the recorded "60/60" never matched code, #235 F6);
`run_all` **22 at baseline**. Narrative in `Diagnostic/TUNING_LOG.md` 2026-07-28k; the
decisions:

- **Pipe animation is plant state, and is now asserted as such.** New
  `RD.PwrBoard.pipeFlowState(id)` API + board_check pins in three plant states (full
  power / post-scram / Mode 5). The #236 class — 23/37 pipes circulating on a dead
  plant — was invisible to every gate because the harness asserted pipe *existence* only.
- **Port gating is the component's job, done on the FIRST update.** Three of the four
  mechanism defects were "the first render never wrote the gate" or "the prop was
  ignored" (`comp_pump` lastOn init, `comp_turbine_generator` missing data-active,
  `comp_valve_horizontal` dropping `flow`); the fourth was fittings gating their interior
  but not their ports. None was a wiring error — the wiring's signals were mostly right.
- **The PORV line follows actual relief** (true-state `open && blockOpen`, the porv
  comp's own truth): a dead-ended line is still when the valve is seated. Keeps the
  TMI-2 lesson coherent — the tailpipe temp and the animation now agree.
- **AFW gates on measured flow, not command** — one truth per line (matches the feed
  tee; the run-light/flow divergence the card teaches is unaffected).
- **RCP suction/discharge corrected via DOC_PATCHES**, which grew absolute
  item/pipe prop patching (null = delete) for exactly this: builder-authored semantics
  that render right only via a compensating override (`flowDir:'fwd'`) get fixed at the
  source of truth the code owns, idempotently, until the builder is corrected.
- **Turbine: windage exists** — the untripped/no-load branch coasts down like the
  tripped one (it is the same physical state at zero steam); zero-load ICs spawn the
  rotor at rest (`P0 > 0.01` — the subcritical states author `power: 1e-6`, so a bare
  `> 0` is wrong). **Deviation note:** the branch's authored "accelerate toward
  overspeed" was measured inert (≤ 0.02 rpm/s); the friction term formally retires it.
  Recorded honestly in the branch comment and parked as a #238 deferred upgrade rather
  than silently revived — reviving it is a behaviour change needing catalog + scenario.
- **ECCS MODE reads CS** (the engine publishes `eccs_mode` in control_state only) —
  chosen over exposing a new instrument: it is a lineup/command-surface mirror like its
  neighbours, and adding an instrument would shift nothing else.
- **Two label overflows were tracking, not width** — `.bd-ro-label` letter-spacing and
  the number-hint 0.14em were the entire #235 F4/F5 overflows; fixed in code for every
  tile of the class, with DOC_PATCHES moving the one tile that also sat under a valve.

## 2026-07-28f — decay heat is prompt+tracked, always; follow mode draws thermal output (#229, #132)

`run_all` **22 runners at baseline** (`run_ops` back to exactly 57/68). Narrative in
`Diagnostic/TUNING_LOG.md` 2026-07-28i; the decisions:

- **`Q_total = P·(1−f0) + decay`, branchless** (`pwr_engine.js` step 4; f0 = H1_0+H2_0).
  The old "decay embedded in P at power" form was true only in steady state; through an
  un-scrammed runback it deleted the ~5 % residual (τ≈33 min) the instant the rods moved,
  and its P-vs-decay switch stepped Q discontinuously. The new form is exactly identical at
  every steady state and in every fission-collapsed regime (scram; MD-5's ATWS void-out),
  so no calibration moved — the transient is the only change, and it is the fix. #132 was
  the same defect deferred by a citation to an owner ruling that never existed (see #229).
- **Follow mode gains `extractFrac`** (`load_mode.js` + `pwr_engine._loadModeOpts`): the
  module's own intent — "the turbine extracts what the reactor makes" — implemented as
  flux-tracking, which ceased to be the same thing the moment decay became a separate
  source. A per-plant opts hook (PWR → `_Q_total`) rather than a change to the shared
  `powerFrac`: RBMK/BWR are on hold and their gates must not move (BWR's twin defect filed
  as #239). Consequence: on a down-power the turbine carries the residual (grid output
  briefly above nuclear indication — prototypical), and without it the residual has NO
  consumer — measured, the ops daily cycle banked +16 °C to the dump crack point and
  tripped pzr-level-high on the up-ramp as the load-programmed dump reference closed the
  only relief path.
- **`ops_normal_shutdown` amended, validated both sides (HR10)**: the probe never took the
  generator offline — invisible under flux-tracking follow (draw → ~0 subcritical), exposed
  by honest physics (a synced follow turbine draws the decay steam and pins Tavg at 279 °C,
  dump shut, no restoring force). The added `set_load_mode disconnected` is the real
  procedure's step and makes the probe's own claim ("hot standby on the dump") literally
  true; the amended probe passes on the PRE-#229 physics as well.

## 2026-07-28e — partial uncovery damages the core: exposed-clad hot node (#213)

Owner-filed #213. `run_all` **22 runners at baseline** with `run_meltdown` **8 → 9** (new
MD-9). Narrative + gotchas in `Diagnostic/TUNING_LOG.md` 2026-07-28h; the decisions:

- **Deviation from the M1 spec, on HR9 grounds.** M1 §6.5/§6.10 keys damage on the
  whole-core-average fuel temperature with heat transfer degrading only below
  `significant_uncover` (0.50) — under which a core held at 50–70 % inventory (top of core
  exposed per the spec's own `core_top_uncover: 0.70`, which was **dead config** — nothing
  consumed it) reads fully cooled indefinitely. TMI-2 was destroyed by exactly that
  condition in under an hour; the average-node spec cannot represent damage that is local
  before it is average. Physics outranks the spec text (HR9).
- **Mechanism: a second, peak-clad node — not a steeper bulk collapse.** Steepening the
  bulk `h_fc` ramp instead would cool-starve the *whole* core to make its average reach
  1200 °C — wrong mechanism (the covered lower core IS still cooled) and it would move
  every existing deep-uncovery trajectory. `stepCladding` (pwr_thermal.js) heats
  `clad_temp_c` at `clad_heat_gain·_Q_total·f_unc` against weak steam convection toward
  Tsat, quenches to the wetted-core temp on reflood (`clad_quench_tau`), and is floored at
  the bulk fuel temp; `checkDamage` judges damage/melt at **max(clad, bulk)**. Constants
  are physics-anchored, not gate-fitted: ~0.9 °C/s exposed-clad heatup at early decay heat
  (severe-accident order), equilibrium gradient chosen so grazing late-decay uncovery
  stabilizes below 1200 °C while deep or early uncovery runs away. All three `[tune]`.
- **HR10 discipline**: MD-9 was authored from the intended physics and run against the OLD
  engine first (FAIL: damage never; preconditions green), then the fix turned it. Both MD-9
  branches pin inventory strictly > 50 % so the pre-existing bulk collapse cannot produce a
  false pass. MD-8's EOP recovery peaks are byte-identical (624/645/723 °C) — the node does
  not over-trigger on prompt refloods.
- **Contract**: `clad_temp_c` added to `getTrueState` (lazy-init on first step → old saves
  migrate unchanged; `run_m7` green). No new instrument — PWR deliberately has no fuel-temp
  instrument; the in-fiction tells remain subcooling margin / pzr level (prototypical), the
  truth overlay carries the diagnostic. Zirconium-oxidation runaway above ~1100 °C is a
  declared omission (understates how fast a very hot core accelerates to melt).

## 2026-07-27d — V2 board polish (#231): alignment, dash rate, instrument sigmas

Three playtest items off `e9dc316`. `run_all` **22/22 at baseline, unchanged** — no baseline
moved. Full measurement in `Diagnostic/TUNING_LOG.md` (2026-07-27d); the decisions:

- **The pressurizer offset is diagram data, not a nudge failure.** The issue's lead was to add
  `Pressurizer` to `NUDGE_KINDS`; that cannot work — `gridNudge` removes **sub-grid residue
  only**, so its authority is ±g/2 = ±2.5 px, and the measured error is 6. It is two authored
  errors compounding: the design crop puts the vessel axis 10 px left of the tile centre, and
  the tile sits 4 px right of the 1055 axis its neighbours (`ims2kt7fu64/c`, `imrppb3kuav/b`)
  share. Corrected with a measured `translate(6px,84px)` in `comp_pressurizer.js`, and
  **`board_check.html` now pins the result, not the offset** — three plumb assertions on the
  scanned port coordinates, so a re-export that moves either tile fails instead of silently
  restoring the jog. Same guard pattern as the `PIPE_TEMP` assertions below. board_check 56→59.
- **One dash-rate conversion, two authoring surfaces.** Pipes author a `speed` multiplier;
  components author a 0–100 `flow` slider. They were computing different numbers — fittings
  `(0.45 + 1.1·flow/100)` = **1.55** at flow 100, pipes a hard 1.0 with `p.speed` discarded in
  `buildPipes()` — so every fitting ran 55 % fast and the dashes stepped at each joint. Now
  both call `StdPipe.dashSpeed()`, defined so the authored default on either surface is exactly
  1.0. `p.speed` is now **honoured** rather than dropped: silently discarding authored data is
  what made this hard to see. Consequence to accept — `pms2ktjq4ma` carries `speed: 1.05` (the
  only one on the board, likely a stray slider) and now runs 5 % fast; fix it in the builder,
  not in the renderer.
- **RCS temperature sigmas move as a set.** `tavg` 0.17 → 0.05 °C, and `thot`/`tcold` with it,
  because the board shows Tavg, T-hot, T-cold **and** ΔTavg on one screen — a steady average
  over two jumpy legs is arithmetically impossible (HR9). `pzr_level` 0.3 → 0.12 %; `sg_level`
  deliberately **left at 0.3** (narrow-range SG level genuinely bounces — the two sharing 0.3
  was the tell that it was a copied default). `subcooling_margin` is derived with `noise: 0`,
  so it fell with Tavg for free — which is why the filed table showed the two with an identical
  σ. Re-sizing a sigma draws no extra PRNG numbers, so the noise **sequence** is unchanged; the
  `noise: 0` rule in that block is about *adding* instruments, not re-sizing them.
- **Stale premise cleared under a live decision.** `tile()`'s display-resolution comment
  justified whole-unit digits by citing "σ 0.2–0.45 across the board". Three of six tiles are
  now ~3x quieter, so the comment carries the new per-tile figures. The decision is unchanged
  (0.09 is still close to a full 0.1 display step) — but a false premise left under a correct
  decision is how the next agent gets it wrong.

## 2026-07-27c — V2 board + circulating-water temperature

**Board V2 (M8).** `pwr_board_data.js` regenerated from the Design builder's production
snapshot (189 items / 37 pipes). Three new renderer pieces: `comp_indicator_panel.js`
(vital-parameter tiles), `comp_tee.js` / `comp_cross.js` (pipe fittings), and a `readout`
item kind (caption + reading as one item, so a relocated indication cannot drift from its
label). Both fittings join `NUDGE_KINDS` — their ports sit at R=10, i.e. on the tile edges.

- **Tile history is real, not seeded.** The design source seeds 44 jittered samples and
  random-walks on a 500 ms timer so the card looks alive in the editor. Ported without it:
  the buffer takes the real instrument value at render cadence and starts flat. A sparkline
  is an instrument trace; 44 invented samples is fabricated instrument data (HR1).
- **Tile bands come from the protection tables, not from fractions of the scale.** The
  design falls back to "normal = 25–75 % of span", which would paint 100 % reactor power in
  the grey acceptable band. `TILE_BANDS` reads `RD.PWR_CONTROL.protection` live, so a retune
  moves the tile with it and a tile agrees with the annunciator. One-sided parameters
  collapse their unused side onto min/max rather than inventing a limit.
- **`selfTest` now guards id-keyed maps.** The re-export changed every pipe id that routed
  through a new fitting, silently orphaning 12 of 27 `PIPE_TEMP` entries — the failure mode
  is invisible (pipes revert to authored temps). Added assertions that every `PIPE_TEMP` key
  and every `CONTROL_LABEL_MAP` target still exists, plus `readout` coverage in the value
  check. **The builder's live doc is in browser localStorage; the project's `BUILTIN_DOC` is
  a stale fallback** — a re-export has to come from the owner.
- **`verify_e2e_ui`'s steam-flow check now asserts the layout claim** (#206), not just that
  a number exists: steam flow must sit directly above feed flow in the same column. It also
  passes against the V1 board, where `bdSteamFlow` sat in that same position — a stricter
  test of the same behaviour, not one refitted to V2 (HR10).

**Circulating-water temperature (M1, physics).** `condenser_cooling_available` stays a
separate availability boolean (it is what `vacuum_decay` / `full_blackout` cut, and *no circ
water* is not *warm circ water*). When cooling IS available, the vacuum target now comes from
the CW inlet temperature: condensing temperature = CW inlet + range·load + TTD, and the
backpressure is its saturation pressure.

- **Own saturation curve for the condenser.** The plant-wide `T_sat` / `P_sat_from_T` pair is
  a power law fitted to 0.1–10 MPa; at condenser pressures it puts Psat(32 °C) at 0.7 kPa
  against a true 4.75 — nearly an order of magnitude out. `pSatLowKpa` (Antoine, 0–100 °C)
  is used instead, checked at three points.
- **Formulated as a delta against `cw_inlet_ref_c`**, so the reference condition reproduces
  `vacuum_rated` exactly and every existing scenario, IC and save is bit-identical. Verified:
  `run_all` 22/22 at baseline with no number moved. `cw_inlet_ref_c` is 80 °F precisely,
  matching the board box default, so typing the default back in is also a no-op.
- **Cold water is allowed above rated**, capped at `vacuum_max_kpa` 99.5 (the practical
  condenser floor, ~1.8 kPa absolute — not the thermodynamic 101.3). Clipping at
  `vacuum_rated` left the entire cold half of the operator's range doing nothing, which
  reads as a broken control, and the winter uprate is real. Costs ~3 % above nameplate below
  ~62 °F. **Open flag:** owner is testing this; revert to a hard `vacuum_rated` ceiling if
  nameplate should be absolute.
- `rhr_sink_c` rides the same temperature — the RHR heat exchanger rejects to the same circ
  water — so the cooldown floor moves with it (~28 °C cold / ~61 °C hot).

## Cross-cutting decisions (apply to all modules)

| Topic | Decision | Why |
|-------|----------|-----|
| **Module system** | Global-namespace scripts: each file is an IIFE attaching to `globalThis.RD`. No ES modules, no build step. | User choice. Works under `file://` *and* when served (ES modules break on `file://` in Chrome), and `require()` in Node shares `globalThis`, so the same files run in the test harness with no shim. |
| **Test harnesses** | Both a Node CLI runner (`test/run_*.js`) and a browser page (`test_*.html`). | User choice. Node gives a fast tuning loop I can run directly; the browser page matches the browser-only ethos for the user to confirm. |
| **Units** | SI/MPa internal everywhere, per CONTEXT §11. | User-confirmed. The M1 code snippets had psia residue (see M1 deviations); reconciled to MPa. |
| **Repo** | Commits go directly to `main`, one per module. | Matches the linear, single-developer build (the scaffold was committed to `main`); each module is an independent, test-gated unit. |
| **Load order** | `config → protection → thermal → pressurizer → primary → steam_generator → instruments → engine`, then layers. | The engine captures `RD.pwr*` helper namespaces at IIFE-eval time, so its dependencies must load first. Encoded in `index.html`, `test_pwr.html`, and the Node runners. |

### The plant is the ground truth; scenarios follow it (2026-07-26, owner ruling → **HR9**)

> *"Are you tuning the plant to a scenario, or adjusting scenarios to the plant? We should
> focus on getting correct behavior out of the plant, then adjust scenarios to fit the plant."*
>
> *"'What should this plant actually do?' is always the right question."*

**Promoted to a Hard Rule — `Blueprint/CONTEXT.md` §3 HR9**, which is now the canonical
statement; this entry is the rationale and the worked example behind it.

**Precedence, highest authority first:**

1. **Physics and prototypicality** — what a real plant of this type does.
2. **The plant's deliberate identity** — the documented character choices (100 MWe single-loop,
   **ride-out** rather than trip-happy, TMI canon). These outrank prototypicality where they
   conflict, but only because they were ruled on explicitly.
3. **The behaviour catalog** (`run_behavior`) and the **physics acceptance suites**
   (`run_pwr`, `run_ops`) — these *encode* 1 and 2 and therefore legitimately arbitrate tuning.
4. **Control/protection setpoints.**
5. **Authored content** — campaign missions, procedures, checklists, manual prose.
6. **Gate expectations for that content** (`run_campaign`, `run_procedures*`, `run_checklist`).

**Nothing at level 5 or 6 may cause a change at levels 1–4.** When a mission breaks after a
plant change, the default presumption is that the *mission is stale*.

**Why the `[tune]` convention is not in conflict.** The file header says `[tune]` values are
*"starting points arbitrated by the scenario suite"* — that means the **physics acceptance
suites** (level 3), which are written as statements of intended behaviour independent of any
story. Campaign missions merely *observe* the plant. The failure mode this ruling guards
against is letting content-level expectations masquerade as behaviour specifications, at which
point the gate that is supposed to protect the plant is quietly enforcing a story instead.

**The guard.** A scenario breaking is a **canary, not an authority** — read it, because
occasionally it means the plant change really was wrong. But answer that question against
levels 1–3, never by asking what keeps the mission green.

**Worked example — #215.** `pwr_msiv`'s win path softlocked after #207 raised
`afw_level_target` 20 → 32, because the mission assumed a low-SG trip that AFW now often
prevents. Two candidate "fixes" were inversions of this rule and were struck: deepening the
shrink so the trip stayed unavoidable, and adding the **Reactor Trip on Turbine Trip** (P-9)
that real Westinghouse plants have and this one lacks. The second is the instructive one — it
*looks* like a plant-correctness fix, and would have made the mission pass — but **`TR-1` pins
turbine-trip ride-out as this plant's deliberate character** (level 2), so adding it would have
been tuning a protective function to rescue content. Resolution: the plant is correct, the
mission is stale, rewrite the mission.

### Manual feed stays unforgiving; the board gains STEAM FLOW (2026-07-26, owner ruling, #206)

**The question.** #206 asked for a ruling: should a bare `set_feed_pump_speed` be as
unforgiving as it is, or should the pump demand be rate-limited / level-trimmed when no
automation channel is engaged?

**The measurement that reframed it.** The issue recorded "every standing value 2–30 % floods
past 90 % to a P-14 trip". Re-measured on the shipped lineup, the failure direction **inverts
with power** — at 6 % power 5 % pump holds level indefinitely and 10 % floods; at 100 % power
**100 % holds 65.0 % flat for 30 minutes** and everything below ~95 % drains the SG to zero
and scrams inside five minutes. The pump is a fixed-demand device and the value that holds
level is simply **steam flow**. Nothing is wrong with the control.

**Ruling: add the indication, do not soften the control.** Rate-limiting or level-trimming a
MANUAL pump would make manual not manual — the plant would silently rescue the player, and the
lesson (feed must match steam) is exactly the one the mechanic exists to teach. What was
genuinely broken was informational: the board displayed feed flow and level but **no steam
flow of any kind** (`sg_steam_flow` appeared nowhere under `ui/`), so the player was asked to
match a number that was not on the board. Level is the *integral* of the flow error, so it is
structurally a late cue — by the time it moves, the correction is overdue.

**Consequences.**
- New **STEAM FLOW** readout via `EXTRA_ITEMS` in `pwr_board_wiring.js` (re-export-safe, per
  the board convention), directly above SG FEED RATE, right-anchored to the same column and on
  the same gpm scale — the pair plus level is the prototypical three-element display.
- It reads **`sg_steam_flow`** (turbine + dump + safeties), **never** `steam_flow` (governor
  only). The latter reads ~0 with the turbine tripped and the dump carrying the plant, which
  would blank the indication during the casualty it matters most in — the same blind spot that
  had the three-element channel commanding zero feed through a turbine trip. Pinned by a
  turbine-trip assertion in `verify_e2e_ui.js`.
- **HR1 holds:** the readout takes the instrument, so a failed transmitter deceives the
  operator exactly as it deceives the controller.

**Not chosen, and why:** widening the ▲▼ resolution near the match point. At full power the
workable window is ~100 ± 2 % and the arrow step is ±2 %, so one click is roughly the whole
tolerance — but making the control finer only where the answer is correct would be a hint
disguised as ergonomics. The readout tells the player where the window is; hitting it is theirs.

### Boron analyzer UI-removed — chemistry-first boron indication (2026-07-23, owner ruling)

**Claim/ruling.** Online boronometers exist in the industry but are not relied upon; the
concentration of record is chemistry grab samples + dose bookkeeping. Owner: showing a live
analyzer undercuts the sampling lesson — **remove it from the UI, keep the code**. Removal is
display-only and one-line-revertible at each spot (dated comments): board readout spliced +
'ACTUAL'→'CHEM' relabel in `extraItems()` (re-export-safe), synoptic B-row readout/dual dropped,
`app.js` trend series commented (candidate future re-add: stepped `boron_sample` history), and a
new **generic `pvDisplay:false` channel-def flag** hides a channel's pv from the automation
snapshot while the channel keeps reading it — chosen over ripping the analyzer out of the
`boron_conc` def because engage-capture/re-anchor still need an internal "roughly what's in the
loop" source, and because HR1-style instrument failures on the analyzer can still quietly fool
the makeup channel (a good future lesson). The `boron_analyzer` instrument spec, PRNG draw
order, and every save contract are untouched. Manuals 03/04 rewritten chemistry-first.
**Training content deliberately NOT reworked** (owner: Opus later, big overhaul anyway) —
complete worklist at `Diagnostic/TUNING_LOG.md` backlog **S12**.

### Boron chemistry sample — auto-confirm + CHEM SAMPLE button (2026-07-23, owner panel-design ruling)

**Claim.** With batch dosing, the channel's bookkept concentration is exact in normal ops but goes
stale exactly where real books do: external boration (ECCS/accumulators) and freehand Bor/Dil.
Real plants close that gap with the chemistry lab — a sample after every planned change, an
unscheduled one when the books are in doubt. **Decision (owner, AskUserQuestion):** model the lab.
`take_boron_sample` (engine) starts a compressed ~60 s turnaround, then posts the **mixed
(reactive) concentration rounded to 1 ppm** — deterministic; deliberately NOT an instrument-spec
gauss draw, since inserting a PRNG draw would shift every downstream instrument's noise stream
and break save/scenario determinism. Result rides `instruments.boron_sample/_pending/_seq`
(status pass-through). The `conc` channel auto-samples on dose completion (confirmatory
chemistry); a fresh result while idle re-baselines books AND displayed target to the lab number —
chosen over books-only re-anchor because a books-only update would immediately open a dose toward
the stale target (probed during design). Mid-dose results latch without applying (the totalizer
is already metering honest injection). The analyzer keeps its role as the lagged online trend;
the lab is the reference — the real instrument hierarchy, and a second HR1 surface (books vs
boronometer vs lab). UI: board CHEM SAMPLE button + lab readout (EXTRA_ITEMS, box grown in
extraItems()), dose countdown on the status value, synoptic Dose/Chem rows.
Worklog + probe numbers: `Diagnostic/TUNING_LOG.md` 2026-07-23 (chemistry-sample entry).

### Boron batch-dose rework — `conc` channel semantics (2026-07-23, owner "power doesn't follow dilution")

**Claim.** The `boron_conc` channel's closed-loop seek on the boron analyzer was structurally
wrong, not mistuned: the analyzer lags ~45 s, so any seek over-delivers ~rate×lag (probed: a
10 ppm ask injected ~15 ppm and spiked power to ~110 %; 30 ppm scrammed on high flux), while the
±8 ppm deadband swallowed the board's 1 ppm arrow nudges whole. **Decision (owner-approved,
modeled on real makeup panels):** `conc` channels now meter a **feedforward batch dose** — a new
target computes delta vs a **bookkept concentration** (`concBasis`, advanced by the commanded
injection like a real flow totalizer), delivers at `rate` (0.5 → **0.05 ppm/s**, ~2× real-plant
max makeup), and stops on the totalizer, never consulting the analyzer mid-dose. No deadband.
The books re-anchor from the filtered analyzer only when a NEW target finds them stale beyond
`reAnchorPpm` (15 — covers ECCS boration); the dose pauses with the charging pump (the engine's
own injection gate); batch state rides save/rewind (absent in old saves → books = saved target,
no phantom dose). Deliberate consequences: the channel no longer *holds* concentration against
external boration — a spent totalizer won't dilute against ECCS toward a stale target (the old
seek would have); and a failed analyzer now fools it only at dose *computation*, not
execution — matching how real batch ops depend on the flow integrator, not the boronometer.
The at-rated observation that started this ("dilution doesn't change power") is authentic PWR
physics — boron moves Tavg, power follows the turbine — now taught in Manuals 03 §7.5.
Full worklog + probe numbers: `Diagnostic/TUNING_LOG.md` 2026-07-23 (batch-dose entry; S8/S9
resolved, S11 SG-overfill still open).

### Pressurizer setpoint slew + Mode-transition checklists (2026-07-23, owner Mode-5 feel)

**Claim.** `K_heater` (0.55 MPa/s at full demand) is transient-holding authority, not a heatup
rate — but it also served operator setpoint steps, so raising the Mode-5 setpoint 350→600 psi
pressurized in ~3 s. **Decision:** slew the EFFECTIVE control target upward at
`setpoint_pressurize_slew_mpa_s = 0.02` (`pwr_pressurizer.effectiveSetpoint`, state
`s._pressure_sp_eff`, seeded at init/migration — lazily seeding on first step turned a
pre-first-step command into the seed, an instant jump). Three deliberate asymmetries: DOWN is
immediate (depressurization is spray/cooling-limited on its own); the slew binds only the
portion **above current pressure** (a freeze-the-descent setpoint raise must stop the
restore-term pull-down instantly — the first cut voided `ops_sgtr_managed` exactly there); and
heater INDICATION reads vs the commanded setpoint while the dP term uses the slewed one
(`s._heater_dp_frac`) — heaters honestly show flat-out during a pressurization that proceeds at
thermal pace. Disturbance response at fixed setpoint (SGTR plateau) keeps full authority.
Fallout: `pwr_return_to_mode1`'s `arrive_mode1` Tavg gate 298 → 296 (the no-load anchor is ~297;
298 was crossed only by power-spike flicker — razor edge, now matches the 295-ish convention of
the other Mode-5 missions). Also added `pwr_heatup` (Mode 5 → 3 live checklist; dilution-ride
design — one `set_boron_adjust −0.12` = a smooth MTC-self-regulated heatup ramp; rod-chunk trims
spiked 158 % in prototyping) and extended `pwr_startup` to Mode 1 (+`connect_grid` on-line step).
Worklog + probe numbers: `Diagnostic/TUNING_LOG.md` 2026-07-23 (slew entry).

### Fine-step rod drive — PWR `max_steps` 228 → 912 (2026-07-23, owner startup granularity)

**Claim.** The PWR control-bank step quantum was the startup-granularity bottleneck, not the
worth curve: with 8500 pcm over 228 steps, one step ≈ 36 pcm (~5.5 ¢) at the critical band
(probed), so criticality arrived in lurches and one tap at the point of adding heat jumped power
~+4 % settled / ~10 % peak. The already-shipped `rod_worth_curve_flatten = 0.8` was maxed out.
**Decision:** subdivide the drive ×4 — `max_steps` 912 (= 4 × 228, the real ~4-banks-of-travel
equivalent the single lumped bank stands in for), speeds ×4 in steps/s (identical
fraction-of-travel per second), all PWR absolute-step literals ×4 (drivers, procedures,
`rods_tavg` gain 0.4→1.6 / maxStep 2→8, `ROD_RUNAWAY_RATE_MAX` 24), UI tap stays 1 step. Result:
9.0 pcm/step (~1.4 ¢) at the crossing — real bank-D differential worth — with every tuned
evolution numerically unchanged. `loadState` rescales old saves' rod steps by the max_steps ratio
(same fraction of travel → same reactivity). Board `/228` unit suffixes patched to `/912` in
`extraItems()` (re-export-safe; generated `pwr_board_data.js` untouched). Rejected: lowering
`rod_worth_total` (breaks Mode-5→1 heatup reach, at-power authority; only ~2× gain), true
multi-bank overlap (correct long-term shape, large blast radius — stays deferred). RBMK/BWR keep
228 (on hold). Full worklog + probe numbers: `Diagnostic/TUNING_LOG.md` 2026-07-23. Gates: all
PWR gates at baseline (run_pwr 31/31 … e2e 28/30 same F12 reds), rbmk 23/23, bwr 15/15.

### TMI-2 Part 1 — guided hands-on rework + FF/board fixes (2026-07-23, issue #105)

Owner playtest of "The Fog of War" produced GitHub issue #105 (seven items). Decisions taken
(two owner rulings via `AskUserQuestion`, the rest concrete bug fixes):

- **Part 1 is now GUIDED HANDS-ON, reversing the original watch-only design (Spec §4 "No —
  scripted/historical").** Owner ruling: the player must *manipulate the controls*, not just
  watch. Implementation reuses Part 3's `operator_action`/`inaction`/`branches` machinery: the
  supervisor orders the two pivotal historical actions and the player performs them —
  `set_hpi{active:false}` (securing HPI, the mistake) and `close_block_valve` (isolation) —
  each with a supervisor-takes-over `inaction` fallback so the outcome stays historical (core
  damage). The player pulls the trigger; the rails still hold. Part 3 remains the *free-agency*
  act (branching endings); Part 1 is *guided* (fixed ending, player's hands).
- **Phase gating replaces the single watch-only gate.** `watchGate(until, msg)` pushes an
  ack-only gate whose `until` opens the next action window: gate `until TRIG.pzrLevelHigh`
  (opens the secure-HPI window) → `until TRIG.identification` (locks HPI OFF through the
  draindown so the trap can't be undone) → open isolation window → ack-only to the debrief.
  Between gates all plant actions are legal; the gates *are* the rails. The existing campaign
  test "gate blocks plant actions in character" still passes (set_hpi blocked during turnover).
- **Pacing: no scripted fast-forward buttons (owner ruling "smoothly compressed, no skips").**
  The `chat_button:{style:'skip'}` FF buttons are gone; the ~19-min-real draindown runs at an
  authored `beat.speed: 6` that snaps to `1` at each reveal. Historical elapsed-time labels
  (`story_min`, the `time_skip` divider) are kept per Spec §2.2 guardrail.
- **M5 FF-through-transient fix (`simulation_service.js`).** `_attentionStop`'s `'alarm'` clause
  snapped `timeAcceleration` back to 1 on *every* newly-firing alarm — so an authored FF through
  a scripted alarm cascade stuttered to a halt (issue #105 "fast forward keeps dropping out").
  New `this._authoredSpeed` flag (set true when a beat authors `speed>1`, cleared on user
  `set_speed`) suppresses the `'alarm'` snap while an authored FF is active; scram/new-failure
  still hard-stop. `_anyAlarmNewlyFiring` itself is untouched (still drives transient cadence).
- **Board — PORV shows TRUE valve position, not the demand light (`pwr_board_wiring.js`).** The
  `porv` compProps read `IN(s).porv_indicator` (the demand lamp — frozen "closed" by the
  `porv_indicator_stuck_closed` failure), so a stuck-open PORV rendered shut with no discharge
  flow. Now reads `s.true_state.porv_open`: the schematic vents + flows on the real valve state
  while the operator's *indicator* readout stays wrong. HR1 note: the schematic depicts the
  plant; the lie lives in the lamp/numeric indications, which still read "closed". Deliberate,
  owner-directed for the visible physical tell.
- **Board — tailpipe temp legible (`pwr_board_wiring.js`).** The PORV outflow-pipe temperature
  value turns amber (`SR_HANDOFF_COLOR`) above 100 °C; the discharge pipes (`pmrr0wvtu7z`,
  `pmrsi3xy4ch`) and the pzr→PORV inlet (`pmrr0y2b78z`) were added to `PIPE_TEMP` so they track
  live fluid temp instead of a frozen authored value.
- **Board — maintenance tag occludes the valve (`pwr_board.css`).** `.bd-maint-tag` was a badge
  floating 14 px above the tile (`top:-14px`); reworked to a clearance tag centered *over* the
  valve body on a stalk (verified: tag/valve centers coincide at (731,±486)).
- **"Pressurizer never went solid" (#105 #4) was legibility, not physics.** Probe confirmed
  `pzr_level_pct` pegs 100 % (void-insurge term dominates while inventory drains) ~t196–670;
  added an explicit "gone SOLID… with the pumps OFF" callout in `b13_lull2` so the beat lands.

Gates after the pass (all at/above baseline): `run_campaign` 51/51, `run_m5` 19/19, `run_m6`
16/16, `run_autoctl` 20/20, `run_pwr` 31/31, `run_m4` 18/18, `run_m7` OK, `run_procedures`
21/21, board_check 54/0. Interactive + historical Part-1 paths both drive to the core-damage
level_complete headlessly; PORV/tailpipe/tag verified in headless Edge.

### Test-suite review + hardening pass (2026-07-19, Fable)

Full findings: `Diagnostic/TEST_SUITE_REVIEW_2026-07-19.md`; skimmable summary in `CHANGELOG.md`
[Unreleased]. The decisions worth carrying forward:

- **C1 closed with acceptance-first sequencing.** `power_range` `[0,120]→[0,200]` in PWR + BWR
  (the RBMK precedent). The RED test was written before the config fix — the old PWR acceptance
  (`abuse_startup_yank`) had gone dead when the SR trip started catching the yank at 0.02 %.
  Rule reaffirmed: when a finding's acceptance test stops being fail-able, re-point it BEFORE
  fixing, or the fix has no red-to-green evidence.
- **`inject_failure` unknown ids now COMMAND_ERROR (all engines).** The silent no-op is what let
  `eccs_boration` inject the effect-name `primary_leak` and pass vacuously for months. API
  softness that can make a test lie is a bug in the engine, not just the test.
- **Strict expected-fail convention** (`run_procedures` KNOWN_FAILS): a documented tuning target
  reports `✗(known B3)` without reddening the gate, and an XPASS turns the gate RED until the
  annotation is removed. Rationale: a permanently red gate trains people to ignore red — but a
  silent xfail goes stale; strictness keeps both honest. Reuse this pattern elsewhere before
  letting any gate sit red on a known finding.
- **Campaign static validation** (`references resolve` pass in `run_campaign`): every beat
  reference — branch `goto`, instrument/true_state/alarm/command names, direction + `advance`
  vocabulary, `gate.message` shape, `gate` action lists, `inject_failures` ids — is checked
  against live engine/config vocabularies. Command vocabulary is scraped from the dispatchers'
  `case '...'` tokens (over-permissive by design: catches typos, never false-fails). This is the
  guard against the known "beat-authoring gotchas" class.
- **Ops driver realism ruling.** The `pwr_mode3_to_mode5` campaign driver scrammed the plant
  (full spray at 120× crossed P-11 and the lo-press trip inside ONE 30 sim-s broadcast) and the
  mission still completed — mission cards prove the DESTINATION, so transition tests must assert
  `rps_state.scrammed === false` explicitly. Scripted operators at high accel must sequence like
  the procedure: place the P-11 block at the permissive before depressurizing past it (setpoint
  walked 0.5 MPa/sample until blocked).
- **Deliberate red:** the C2 acceptance (`ops_rbmk abuse_accel_latency` "256×: same protection
  outcome as 1×") is knowingly failing — it is the tuning target's hard check, per the ops-suite
  charter.
- **Gates after this pass:** run_pwr **31/31** (191) · run_bwr **15/15** (92) · run_rbmk **23/23**
  (150) · m4 **18/18** · m5 19/19 · m6 16/16 (94, tautologies repaired) · m6ph 8/8 · M7 OK ·
  scenarios 3/3 · autoctl 20/20 · e2e_controls **30/30** · procedures **21/21** (1 known-fail B3)
  · campaign **51/51** · ops **57/67** (all FAILs documented targets incl. the deliberate C2 red).

---

## M1 — PWR Engine

**Files:** `engines/pwr/{pwr_config, pwr_protection, pwr_thermal, pwr_pressurizer, pwr_primary,
pwr_steam_generator, pwr_instruments, pwr_engine}.js`
**Acceptance:** `node test/run_pwr.js` → 11/11 suites, 51/51 checks.

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | `T_sat(P_MPa) = 179.47·P^0.239 / 145.038 − 273.15` (and redeclares its param) | `T_sat(P_MPa) = 179.47·P^0.239` (°C directly) | The `/145.038` (psi→MPa) and `−273.15` (K→°C) were residue from a psia/Kelvin draft. Dropping both reproduces steam tables to ±2 °C over 5–17 MPa (15.41 MPa → 345 °C). The bare form is correct. |
| D2 | Criticality via "set `T_fuel_ref`/`T_coolant_ref` so feedbacks net to critical" | References pinned **at** the operating temps (Doppler/MTC = 0 there, purely stabilizing on transients) **plus** an explicit `rho_excess` constant that boron is trimmed against | With the given tiny feedback coeffs (α≈−3e−5/K), the pure-reference mechanism needs references hundreds–thousands of K above operating to supply the positive reactivity that balances negative rod/boron/xenon worth — non-physical. The excess-reactivity term is the standard, physical way; same end (critical at HFP, correct power-coefficient sign). **→ Flag F1.** |
| D3 | Fuel source `P·heat_gen_coeff`; coolant input `h_fc·(Tf−Tavg)` (§6.1/6.2) | Fuel source `Q_total·heat_gen_coeff` (fission+decay); both nodes use `h_fc_effective` | Post-scram decay heat must keep the fuel hot (the TMI uncovery heatup), so the source is total heat. Using `h_fc_eff` on both nodes conserves energy through DNB/uncovery (less heat reaches coolant as coupling degrades → fuel accumulates). |
| D4 | PORV "auto-opens at 2350, auto-closes at 2300" (in the engine snippet) | Engine PORV follows **commanded** demand + stuck flag only; the 16.20/15.86 MPa auto-open/reclose live in M4 actuation (and the §14 test emulates the actuation) | HR2: the engine makes no control decisions. The spring **safety** valves (mechanical, 17.13/16.55) stay in the engine — they are physics, not control (HR7). |
| D5 | Bare turbine integrator `rpm += net_torque/inertia·dt` (§6.8) | Grid holds synchronous speed while synced; the free integrator runs only after a turbine trip | The bare integrator drifts off 1800 rpm at steady state; a synchronous generator is grid-locked. The free integrator is retained for coastdown/overspeed after trip. |
| D6 | Several `[tune]` thermal coeffs (`h_sg=0.06`, `latent_heat_secondary=1.0`, `K_void_surge`, the pressurizer K's in mixed units) | Re-derived for energy balance: `h_sg≈0.6`, `latent_heat_secondary≈19.45`, `heat_gen_coeff≈19.45`; PORV relief gain decoupled from mass-loss; `P_restore_rate_gain` dropped to 0.02 | The literal starting values don't balance the steady-state heat equation (heat-in ≫ heat-out) and the pressurizer K's were psia-scaled. These are `[tune]` and arbitrated by §14; retuned until steady state holds and the transients behave. |

### Modeling decisions (spec left open)

- **Two-phase saturation pull** (`K_sat_pull`, `pwr_pressurizer.stepPressure`): once the primary voids,
  pressure is driven toward `P_sat(Tavg)` so subcooling → 0 — the physical truth of a saturated
  system and what makes indicated subcooling erode at TMI.
- **PORV pressure vs mass decoupled:** `K_porv_relief=300` (large — the valve vents the *steam* space,
  big pressure effect) but `porv_flow_max=0.0035` (small — slow inventory loss, TMI-realistic). One
  `porv_flow` term, two gains.
- **Decay heat tracks power continuously** (refined after alpha feedback). The two-term model gained a
  production term toward the equilibrium fraction `H₀·P`, and is **pre-loaded at startup** to that
  equilibrium — so an operating reactor already carries ~7% decay heat (3.5% at 50%, ~0 cold/subcritical),
  and it persists/decays after scram exactly as before (6.85% at 60 s). Replaces the old "switch on only
  at scram" form (which displayed 0% during operation). `Q_total` still embeds decay in `P` during
  operation (rated = total) and adds it as the residual source once scrammed; steady state and the §14
  suite are unchanged.
- **Shutdown-group worth** added (`rod_worth_shutdown=0.10`) — the spec says "sum the shutdown group"
  but gives no worth; chosen for shutdown margin.
- **Initial states** are built by computing the equilibrium temps analytically from the heat balance,
  then **trimming boron to exact criticality** (HFP references captured once on first HFP build).
  `hot_zero_power` is left subcritical by a fixed margin (rods inserted + boron).
- **PRNG:** mulberry32 with a single `uint32` state; Gaussian noise via Box–Muller. The state is part of
  save/restore (CONTEXT §4) — verified bit-exact in the save/restore test.
- **PWR ops-tuning pass — pressure/secondary realism + CVCS level control** (2026-07-19, from the
  `run_ops` PWR probes). Took the PWR ops suite 15/19 → 18/19 (total ops 53 → 56/66) with regression-free
  physics fixes; each also closes a real modeling gap.
  - **Spray floor (P6).** Pressurizer spray tapered to zero as pressure nears **Psat(Thot)** (core-exit
    boiling onset) — spray is cold-leg liquid and cannot condense the bubble below the hottest coolant's
    saturation. `spray_floor_band` 3.0 MPa (a 1.0 band still let the transient undershoot into the
    low-pressure trip; 3.0 tapers early enough to stay hot). `abuse_heater_spray_fight` floors ~8 MPa
    (was 0.1). On a real cooldown Thot falls too, so the floor tracks down — cooldowns unaffected.
  - **Steam-dump capacity cap (P2).** `steam_dump_max` 1.0 → 0.5 and made a **true cap on both the manual
    override and the auto demand** (was bypassed by the override). A full load rejection now lifts the SG
    safeties; slamming the dump open is a rate-limited cooldown, not a Tavg crash.
  - **SGTR leak rescale (P1).** Per-failure `leak_scale: 0.03` on the `sgtr` def (the shared
    `primary_leak` code multiplies it; `large_loca` is unscaled) — a tube rupture drains over ~15 min
    instead of ~30 s. SGTR inventory holds >70 %.
  - **Pressure holds saturation on a violent depressurization (SGTR subcooling).** Two coupled fixes:
    (a) the sat-pull (P → Psat(Tavg)) engages whenever the coolant is **superheated** (Psat(Tavg) > P),
    not only when `primary_void_fraction` is flagged — so a depressurization at full/overfilled inventory
    (HPI overfill) still pins pressure at saturation **without touching the void bookkeeping** (TMI
    void-surge untouched); (b) the subcooled-liquid terms (`K_surge` thermal surge, break depressurize)
    are **suppressed in the saturated regime** — an HPI cold quench dropping Tavg fast no longer crashes
    pressure via a thermal-outsurge term meaningless in two-phase. Subcooling −152 °C (core-loss) → +27.
    A hard `P ≥ Psat(Tavg)` clamp and an ECCS-quench-rate cap were both tried and **reverted** (the clamp
    broke the crafted low-pressure HPI/LPI + RHR states; the rate cap conflicts with the eccs
    cold-injection thermal-shock test). `ops_sgtr_managed`'s EOP was also made faithful to the #1 EOP
    rule — throttle the cooldown/dump to hold subcooling margin, not crash-cool on a full dump.
  - **CVCS charging controls PZR level; AUTO holds level (P3 / feature).** See the "Added" CHANGELOG
    entry — a bounded `(charging − letdown)·K_cvcs_level` insurge term (K=6.0) + AUTO servo
    (`cvcs_charge_per_level` 0.006, `max(level-servo, inventory-makeup)`). Fixes `ops_normal_shutdown`
    (rampdown no longer stalls at 45 % when the pressurizer shrinks below the 30 % hold) and delivers the
    designed CVCS AUTO-holds-level behavior for the coming UI. TMI deception verified intact.
  - **New engine guards:** `cvcs_level_control`, `pressure_saturation_bounds` (run_pwr 26/26 → **28/28**)
    lock in the level-authority/AUTO-hold and the spray-floor/no-superheat behaviors as HARD gates (the
    ops probes are soft tuning targets).
  - **DEFERRED — load-follow Tavg (P4/P5), the 1 remaining PWR ops failure.** Partial-load Tavg settles
    **291.5 °C** at 50 % (need ≥293): Tsec is nearly flat (271→275) while ΔT halves (33→16) with load, so
    Tavg = Tsec + ΔT sags below band. Closing it needs the 50 % SG pressure ~+0.12 MPa higher. A **steam-
    pressure program** (governor trims the valve to defend a load-rising SG pressure) was implemented and
    **reverted**: defending pressure by trimming the load valve starves the turbine (mwe → 0) and trips
    the plant on SG level at every stable gain — it fundamentally fights load delivery. The only other
    lever (recalibrating `h_sg`/`delta_T_rated`/`steam_p_rated`) is pinned to the full-power Tavg=304
    reference and has the widest blast radius in the engine. **Verdict:** not worth a 1.5 °C miss on a
    defensible sliding-Tavg-program point; left as a documented tuning gap, NOT weakened in the test.
- **High-high SG level protection (P-14) + low-low reactor trip moved 12 %→17 %** (2026-07-18, user
  direction): added the SG level ladder's high-side protection. **P-14 at 90 %** fires three coordinated
  control-layer actions: `trip_turbine`, a new `isolate_feedwater` command (latching `feedwater_isolated`
  flag gating MAIN feed in `pwr_steam_generator.stepSecondary`; AFW is added downstream of the gate so it
  keeps feeding), and a **reactor trip** via the P-9 interlock. P-9 is a new `above_p9` status instrument
  (`power_pct > 50`) exposed through the `status` passthrough (`pwr_config`); the reactor trip is a
  `p14_reactor_trip` trip keyed on **`sg_level high 90` + condition `above_p9`** — deliberately **scoped
  to the SG-level cause** rather than a general "any turbine trip → scram" P-9, so MSIV-closure / overspeed
  / vacuum turbine trips still don't scram (a general P-9 broke `pwr_msiv` — the SG stays ~70 % there, so
  the SG-keyed trip spares it while still firing on the SLB swell to ~94 %). New `SG LVL HI HI` critical
  alarm at 88 %. **Low-low SG reactor trip 12 %→17 %** (+ its alarm): more heat-sink margin, sits just
  below the 20 % AFW auto-start (real Westinghouse establishes AFW at ~the low-low signal — its role is the
  post-trip heat sink, not trip prevention, so the small 3 % gap is correct). A steam-line break now trips
  early on the P-14 swell (turbine trip + feed isolation + scram) instead of riding to a late
  low-pzr-level trip — the automatics close the previously-unprotected high-SG-level condition; `pwr_slb`
  passes with the earlier trip. **Full realistic P-9 (all turbine trips cascade) is a logged follow-on**
  — it would require re-authoring `pwr_msiv` around a reactor trip. Gates: run_pwr 26/26, campaign 47/47,
  m4 15/15, m5 19/19, m6 16/16, autoctl 20/20, ops 53/66 (identical fail set — zero regressions).
- **Borated emergency injection** (2026-07-17): emergency-injection water carries boron. HPI/LPI and the
  accumulators deliver at `emergency.eccs_boron_ppm` (2500 ppm — RWST/SIT concentration; real RWST/SIT ≈
  2000–2700), mixed into `boron_ppm` by perfect-mixing transport `dC/dt = q_inj·(C_eccs − C)/m` in
  `pwr_primary.stepInventory` (mixing rate floored at m ≥ 0.05 to bound the update as inventory → 0). So
  ECCS/accumulator injection **raises core boron → negative reactivity** — the shutdown-margin role of
  borated safety injection during a LOCA (previously injection was mass-only; boron was CVCS borate/dilute
  only). Losses leave at the current concentration and cancel in the balance, so only the injection
  inflows shift concentration. CVCS borate/dilute is kept as a separate idealized direct-rate channel
  (`pwr_engine` step 13) — not re-derived from charging concentration — to preserve the tested CVCS
  behavior. **Deliberately not modeled:** boil-off boron concentration (steam carries no boron, so a
  boiling core concentrates its boron) — the lumped loss term does not distinguish boil-off from leakage;
  a refinement if post-LOCA boron-precipitation behavior is ever wanted. Verified: large-break LOCA + SI
  drives boron 747 → ~2050 ppm (≈ −13000 pcm added margin), accumulator-only discharge borates as the
  SITs deplete, no-injection control stays flat, asymptotes to the source with no overshoot. Gates: PWR
  **20/20**, scenarios **3/3**, campaign **47/47**, `run_autoctl` **20/20**, `run_m5` **19/19**, ops
  **53/66** (baseline, no regressions).

- **Break blowdown flash-cooling + realistic accumulator setpoint** (2026-07-17): fixed the break
  depressurization model so `accumulator_trip_mpa` could be restored from the detuned **1.5 MPa** to the
  real B&W CFT / Westinghouse SIT cover-gas pressure **4.14 MPa (600 psi)**. **Root cause (investigation
  in `Diagnostic/PWR_PRESSURE_MODEL_PLAN.md`):** the old model had no term to remove a break's enthalpy,
  so `tavg` pinned near the no-load temperature (~300 °C) for *every* break size — the saturation plateau
  `Psat(tavg) ≈ 8.9 MPa` was fixed, and break size was distinguished only by `K_leak_depressurize`, a
  direct pressure sink that ran *unconditionally* (including two-phase). That forced pressure far below
  `Psat(tavg)` while `tavg` stayed hot — thermodynamically impossible superheat (a 100 % break sat at
  2.38 MPa / 301 °C, Tsat 221 °C) — and, because nothing crossed 1.5 MPa, left the accumulators as
  effectively dead code. The prior "TMI floors ~1.8–2.3 MPa so 4.14 MPa would fire and mask the lesson"
  premise was **stale** (predates the sat-pull / loop-pressure rework): the current flagship TMI damage
  branch holds ~8.8 MPa (1271 psi) the whole way to fuel damage. **Fix — two coupled changes.**
  **(1) Blowdown flash-cooling** (`pwr_thermal.stepCoolant`): coolant leaving a break carries enthalpy
  and the remaining inventory flashes to replace it, so `dTavg += blowdown_gain · leak_flow ·
  (blowdown_sink_c − tavg)` — the same self-limiting mixing form as the ECCS quench, keyed on `leak_flow`
  ONLY (a stuck-open PORV vents the steam space via `K_porv_relief` and leaves `leak_flow=0`, so the
  flagship path is untouched). This makes the plateau *respond to break size*: a small break — decay heat
  dominates the weak cooling, `tavg` holds hot, `Psat(tavg)` pins pressure well above 600 psi; a large
  break — this term dominates, `tavg` falls toward containment, and `Psat(tavg)` (hence pressure, via the
  sat-pull) drops through the ECCS/accumulator band. **(2) Gate `K_leak_depressurize` to the subcooled
  regime** (`pwr_pressurizer.stepPressure`): once `primary_void_fraction > 0`, the direct term is dropped
  so pressure is slaved to `Psat(tavg)` (consistent, no superheat) and the two-phase descent is governed
  by *cooling*. `blowdown_gain` **0.02** [tune] tuned so ≤8 % SGTR holds the plateau (5.9 MPa / 854 psi,
  never arms accumulators) while the 20 % large-LOCA default crosses below 4.14 MPa (3.2 MPa / 462 psi)
  and dumps the accumulators + fires the cold quench; `blowdown_sink_c` **110 °C** (containment
  saturation). **Cold-shutdown lineup:** with the setpoint at 4.14 MPa, the Mode 5 state (2.5 MPa) sits
  *below* the accumulator pressure, so the cold-shutdown builder now **isolates the accumulators**
  (`accumulator_valve_open = false`, the real Mode 5 lineup); `_driveHeatup` re-aligns them once
  pressurized above the setpoint and `_driveCooldown` re-isolates before depressurizing into their band.
  "Below 600 psi" is now the *natural, physical* large-break discriminator (only a break that cools the
  RCS below Tsat(4.14) ≈ 252 °C arms the accumulators), as at TMI-2 where operators had to deliberately
  depressurize to reach CFT pressure. New config: `thermal.blowdown_gain`, `thermal.blowdown_sink_c`.
  Gates: PWR **26/26** (flagship inert to the change), campaign **47/47**, ops **53/66** (identical fail
  set — SGTR/SBO pre-exist), m4 **15/15**, m5 **19/19**, autoctl **20/20**.

- **Accumulator cold-water quench + discharge isolation valve** (2026-07-17): closed two gaps in the
  accumulator model surfaced in review. **(1) Cold-injection thermal quench.** Emergency-injection water
  now carries a *temperature*, not just mass and boron: `pwr_thermal.stepCoolant` pulls `tavg` toward
  `emergency.eccs_temp_c` (40 °C — RWST/SIT ambient) by perfect-mixing, `dTavg += eccs_cooling_gain ·
  q_inj · (eccs_temp_c − tavg)`, where `q_inj` (`s._eccs_inj_inv`, HPI/LPI + accumulators, inventory-
  frac/s) is stashed by `stepInventory` and read one step late (explicit coupling — stepCoolant runs
  before stepInventory). Added as a **direct °C/s term** (already a fractional-throughput × ΔT rate — not
  divided by `coolant_heat_capacity` like the power terms), and **self-limiting** (the mixing form cannot
  cool below `eccs_temp_c`). **RHR is excluded** — it recirculates RCS water (the separate `Q_rhr` term),
  it does not add cold make-up. `eccs_cooling_gain` (0.08, dimensionless [tune]) **decouples the thermal
  coupling from the mass/void tuning**: the raw inventory-frac rates are tuned for the inventory balance,
  so left ungained a full large-break dump would crash `tavg` ~70 °C in a single step; the gain shapes it
  to a dramatic-but-observable ~°C/s quench. **(2) Discharge isolation valve.** The accumulators were
  purely pressure-driven (an implicit check valve) with no way to isolate them — unlike RHR
  (`rhr_valve_open`) or the PORV (`block_valve_open`). Added the motor-operated discharge isolation valve
  `s.accumulator_valve_open` (default aligned/open) with `open_accumulator_valve` / `close_accumulator_valve`
  commands; `stepAccumulators` hard-gates flow on it, so a normal cooldown can depressurize below the
  check-valve setpoint without a spurious dump, and a mispositioned/leaking accumulator can be isolated.
  Migrated on load to *open* (old-save behavior unchanged); exposed in `getTrueState`. ~~**Deliberately left
  as-is:** `accumulator_trip_mpa` stays at 1.5 MPa, **not** the real ~4.14 MPa / 600 psi check-valve
  setpoint — that detune reserves accumulator action for a genuine large-break LOCA rather than
  spuriously refilling a small break and masking the TMI inventory/void lesson; revisiting it is a
  separate tuning decision, not part of this change.~~ **SUPERSEDED — struck 2026-07-27b.**
  `pwr_config.js:512` is now `accumulator_trip_mpa: 4.14`, the real 600 psi setpoint. The "deliberately
  left at 1.5" clause had been false for some time while still reading as a standing instruction not to
  change it. Struck rather than annotated: a stale *prohibition* is worse than a stale fact, because the
  next reader obeys it. Verified new `run_pwr`
  guard `eccs_cold_injection`: the quench magnitude matches `eccs_cooling_gain·q_inj·ΔT` exactly, the
  no-injection control stays flat, the self-limit holds at `eccs_temp_c`; the isolation valve blocks
  discharge and boration and preserves the full tank. Gates: PWR **26/26**, campaign **47/47**, ops
  **53/66** (baseline — SGTR/SBO failures pre-exist, no new regressions).

### Notes
- ~~`fuel_damaged` is internal (not a §6.3 field)~~ — **Flag F5, RESOLVED**: it is a §6.3 field (`CONTEXT.md:395`).
- `sg_overfeed` value units look wrong — **Flag F2**.

### Synoptic prerequisites (`develop`) — engine + instruments for the new PWR diagram
Implements `Blueprint/pwr_synoptic_prerequisites.md` so Fable can wire the synoptic from
`snapshot.instruments` + status booleans + `control_state` (no `true_state` on the Realistic board).
- **9 new §8.8 instruments** (lagged): `charging_flow`, `letdown_flow`, `steam_pressure`,
  `boron_analyzer`, `governor_valve`, `lpi_flow`, `accumulator_flow`, `steam_dump_valve`,
  `primary_leak_flow`. New SOURCE keys are **appended** so existing instruments keep their PRNG
  draw order — no perturbation to prior scenario/save-restore values.
- **6 new status booleans** in `instruments.reading` (via `_instrExtras`/`_copyStatus`):
  `afw_active`, `rhr_active`, `lpi_active`, `accumulators_discharging`,
  `condenser_cooling_available`, `safety_relief_active` (= `safety_open || safety_flow>0`).
- **CVCS setpoint vs indication split:** `s.charging_setpoint` (command) is separated from
  `s.charging_flow` (TRUE flow). `control_state.charging_flow_normalized` = setpoint;
  `instruments.charging_flow` ← true `charging_flow_actual` (0 with pump off; AUTO-modulated), so
  indication ≠ setpoint under auto make-up.
- **Governor** (`pwr_steam_generator.stepSecondary`): `governor_valve_pct` tracks load demand
  (first-order, `turbine.governor_tau`) and modulates `steam_flow = (gov/100)·steam_flow_rated·
  (P_sec/P_rated)`. At steady state gov/100 = demand, so rated flow is unchanged — no regression.
- **RHR (was DHR):** `set_rhr {active}` (+ one-release `set_dhr` alias → `rhr_active`); real physics
  in `stepCoolant` — a heat sink toward `rhr_sink_c`, gated on `pressure < rhr_permissive_mpa` +
  condenser cooling (dormant at power). `s.dhr_active` renamed `s.rhr_active`.
- **LPI:** `set_lpi {active}` + injection-vs-pressure curve (`lpiFlowNormalized`); M4 auto-starts on
  low pressure. **Accumulators:** passive, discharge below `accumulator_trip_mpa` with finite
  `accumulator_capacity` that depletes (`accumulator_volume_pct`). Both scale to inventory via
  per-system gains.
- **Break blowdown depressurization** (`pwr_pressurizer.stepPressure`, `K_leak_depressurize`): a
  primary break (`s.leak_flow`) now depressurizes the RCS (previously leaks only bled inventory, per
  the CONTEXT primary-pressure note). This brings **large LOCA into scope** — a large break crashes
  pressure into the ECCS band so LPI + accumulators actuate; the small PORV break (TMI) is unaffected
  (`leak_flow=0` there). **[SUPERSEDED 2026-07-17 — see the "Break blowdown flash-cooling" entry
  above.]** This originally paired with an accumulator setpoint detuned to 1.5 MPa on the premise that
  the model "over-depressurizes a small break (TMI floors ~2.3/1.8 MPa)". That premise became stale after
  the sat-pull / loop-pressure rework — the flagship TMI damage branch actually holds ~8.8 MPa — and
  `K_leak_depressurize` is now gated to the subcooled regime, with break-size discrimination carried by
  the physical blowdown flash-cooling term. `accumulator_trip_mpa` has been restored to the real
  4.14 MPa (600 psi).
- **M4 auto-permissives** added: low-pressure LPI auto-start (2.76 MPa) and RHR auto-align
  (3.45 MPa, gated on `rps_scrammed`). Safe setpoints — never reached in the existing suites.
- Gate green: **PWR 12/12** (TMI not regressed), **M7 31/31 + teeth**, **E2E 25/25** (set_rhr/set_lpi
  + CVCS indication + large-LOCA ECCS), **M4 10/10**; save/restore bit-exact mid-LOCA with LPI +
  accumulators + CVCS-auto active. Contracts synced: CONTEXT §6.3/§6.5/§6.7, M1 §8.8.

### Cold Shutdown (Mode 5) IC + full Mode 5 ↔ Mode 1 transition (2026-07)
Made the manuals' previously-`[narr]` cold heatup/cooldown genuinely `[sim]`. Strategy: **regime-gated
and additive** — the hot/at-power pressure path is byte-for-byte unchanged (all existing scenarios,
TMI included, never enter the cold regime), so every prior gate held at baseline.
- **Pressure control generalized to an operator setpoint.** `s.pressure_setpoint` (default
  `P_setpoint` = NOP) now drives heater/spray auto-control *and* the gentle self-restore
  (`pwr_pressurizer`), replacing the hard-coded restore to `P_equilibrium`. Command
  `set_pressure_setpoint`. Identical behaviour at NOP; lets a cold plant hold low pressure instead of
  snapping to 15.41 MPa (the blocker that made a cold state impossible before).
- **`cold_shutdown` state** (`_buildState` `cold` block, analogous to `at_operating_temp`): Tavg ≈ 50 °C,
  P ≈ 2.5 MPa (below the 2.76 MPa RHR interlock), **RCPs secured** (`flow_frac` 0 → the coolant↔SG
  term vanishes, so the SG can't back-feed and RHR alone holds the sink), RHR aligned, ~0 decay,
  SR on. `_trimToCritical` supplies the high cold-shutdown boron automatically (cold temps set before
  the trim). Holds dead-stable.
- **Secondary cooldown:** `s.steam_dump_setpoint` (default config no-load 8.90) is now operator-lowerable
  (`set_steam_dump_setpoint`), so the dump vents the secondary down and the primary cools through the SG.
- **`set_rcp`** starts/stops the RCPs — the missing control for pump-heat heatup and for securing pumps
  once RHR is in service (the two moves that make heatup and the final cooldown work).
- **Heat source for heatup is nuclear.** RCP/pressurizer heat is realistic (~0.55 % rated) but far too
  slow given the coolant heat capacity; the operator takes the core critical at low power and the
  fission heat drives Tavg to NOP (self-limiting via the temperature defect — a stable, controllable
  ascent). Documented simplification vs. the real pump-heat-dominated heatup. The heatup runs at NOP
  pressure with the turbine **offline** so the SG bottles to no-load; a gentle SUR-limited control-bank
  withdrawal holds ~10 % without a prompt excursion (an aggressive withdrawal damages fuel — the
  interlock/patience matters).
- **Cooldown requires boration** — cooling adds +reactivity via the hot-referenced MTC/Doppler, so the
  round-trip driver borates for margin (real practice), then lowers the secondary, depressurizes
  subcooling-guarded, opens RHR below the interlock, and **secures RCPs** to decouple the SG.
- **Plant MODE indicator** (`plant_mode`/`plant_mode_name`, `plantModeOf`) + `tavg_rate_c_per_hr` added
  to `true_state` (manual 05 §2 classification). New `5_percent` low-power Mode-1 state.
- **Full-stack lineup:** `ControlLayer._initialEsfArms` disarms any ESF whose *activating* auto-actuation
  trigger is already met at init (the depressurized cold lineup → low-pressure SI blocked, the real
  P-11 story), so loading Cold Shutdown no longer floods the core. Neutral for every hot IC (no trigger
  met at NOP) — TMI unaffected.
- Save-compatible: `_migrateState` defaults `pressure_setpoint ← 15.41`, `steam_dump_setpoint ← 8.90`.
- Gate green: **PWR 19/19** (incl. `cold_shutdown_hold`, `steady_five_percent`,
  `mode5_to_mode1_roundtrip`), **M5 18/18** (full-stack cold-IC guard), campaign **44/44**, autoctl
  **20/20**, M4 **15/15**, M6 **16/16**, M7 OK, ops **53/66** (baseline). TMI flagship not regressed.

**2026-07-26b — Gates must declare which LAYER they run at (new `run_procedures_stack.js`; #209).**
`run_procedures.js` drives bare engines, which made it structurally blind to anything M4 decides —
it passed a procedure that never engaged the feed channel (#202 item 5) and still passes one that
gets scrammed by the startup net under the stack (#206). Built a full-stack counterpart rather than
converting the original: the engine-direct run is a legitimate *isolated physics* view, and keeping
both means a divergence between them localises the defect to the control layer instead of merely
reporting that something broke. The new gate asserts the identical predicates plus four
stack-only ones (command accepted / no unexpected scram / no standing critical alarm / declared
`auto_channels` engaged), with deliberate scrams exempted — the first draft flagged `bwr_shutdown`
scramming at its own scram step, which is the gate being wrong, not the procedure.

**The audit this triggered is the more important outcome.** `ControlLayer.stepAutomation()` and
`engageDefaults()` each have exactly ONE production caller, both in `simulation_service.js`
(:176, :152), as does `engine.getStartupLineup()` (:156-159). Nothing below M5 can engage or tick
an automation channel. Since `feed_sg`, `cvcs_makeup` and `boron_conc` are `defaultOn`, every
engine+M4 harness — `run_ops`, `run_behavior` — tests a plant configuration the player cannot
produce, with SG level on the engine's coupled-feed fallback rather than the three-element
controller that ships. `run_ops` is where the `[tune]` knobs are arbitrated, so the tuning targets
in `OPS_TUNING_REPORT.md` were set against that configuration. Filed as #209 rather than fixed
here: engaging the real lineup will move the bands, and re-arbitrating them is its own pass.
**Convention going forward:** a runner's header must state its layer, and the layer table in
CLAUDE.md is the index. A `ControlFailureLayer` in the harness does *not* make a gate full-stack.

**2026-07-26 — Gross overcooling is ANNUNCIATED, not protected (owner ruling, #211).**
Reducing reactor power on rods while the turbine sits at a stale MANUAL load setpoint makes the
turbine an unthrottled heat sink: measured through a real `SimulationService`, Tavg 304 → 247 °C
on a daily load cycle and 304 → 130 °C (still falling) on a normal shutdown, secondary at
0.25 MPa, with the heaters holding primary pressure so subcooling ran away to ~98 °C — and **no
alarm and no trip at any point**. The alarm half was a pure wiring gap and is fixed (`LOAD IMBAL`,
Panel B caution; `load_mode.js` had computed the signal HR1-correctly all along and `Manuals/09`
had documented the annunciator all along — `sg_imbalance_active` simply never reached the
instrument layer, so no alarm *could* read it). **The protection half is deliberately NOT built.**
This plant's identity is ride-out-friendly — it has no turbine-trip reactor trip by design — and a
low-Tavg or low-steam-pressure trip would fire during legitimate cooldowns and the Mode 5 approach
unless carefully gated. The teaching outcome is that the operator learns to watch the imbalance
rather than being rescued by an automatic action. Recorded here so the absence reads as a decision
rather than an oversight. **Open, deliberately separate:** whether the free-play Mode 1 preset
should start in MANUAL at all (`getStartupLineup()`), given that the two routes into Mode 1
disagree — the preset gives MANUAL, while the startup checklist's `connect_grid` gives FOLLOW.

**2026-07-26 — The rod insertion limit is a power curve, not a floor (issue #202 item 4).**
`pwr_config.js` had carried the comment *"Power-dependent insertion limit for the control group"*
over a single `insertion_limit_pct: 30.0`, and `_updateRodDerived` compared the bank against it
unconditionally. The power dependence was never built, so the limit was calibrated for one
operating point and wrong everywhere else: 30 % of 912 = 274 steps, and the authored startup
crosses into Mode 1 at 244 — ROD INS LIMIT annunciated for the entire evolution and the automatic
rod channel (`control_kernel.js:916`) refused to insert below it. **Decision: implement the curve
the comment promised rather than suppress the alarm.** A RIL exists to preserve shutdown margin
and cap ejected-rod worth *at power*; during a startup the bank is deliberately deep and boron plus
the shutdown bank hold the margin, so the correct model is "not applicable below a low-power
threshold, then rising with power". New `_insertionLimitSteps()` + three `[tune]` constants
(`insertion_limit_min_power_pct` 5, `lo_pct` 5, `hi_pct` 70), recomputed every tick — which also
retires the `max_steps` rescale branch in `loadState`, since the value is no longer stored.
Calibrated against measurement, not preference: the bank sits at 0 % / 62 % / 92 % withdrawn at
HZP / the `5_percent` preset / full power, and **92 % across the whole load range** (follow mode
moves load on Tavg and boron feedback, not rods), so `hi_pct` 70 leaves ~22 points of margin at
full power and the alarm now carries information — *the bank is abnormally deep for this power*.
Snapshot note: `insertion_limit_steps` may now be **null** (limit not applicable); consumers must
treat null as "no limit", which is what the shutdown group already published. Old saves need no
migration — the field is derived, not stored.

**2026-07-26 — Procedure steps may carry commands no engine can execute (issue #202).**
Three of the startup checklist's new steps issue commands that live *above* the engine:
`plot_1m_point` (an operator observation consumed by the instructor layer — the 1/M plot's points
are UI state, so there is no instrument for `acc` to grade and seeing the action is the only
possible evidence), and `set_trip_block` / `set_auto_channel` (M4). `test/run_procedures.js` drives
engines directly, below M4, so it now skips them via a documented `NON_ENGINE_ACTIONS` map while
still running each step's `hold`/`acc`/`saw`. **The flag this raises is a gate gap, not a design
problem:** `run_procedures` structurally cannot validate any procedure step whose effect lives in
the control layer, and this is the second time a procedure has been green at engine level and
broken under the full stack (the SG-level collapse in item 5, and `pwr_heatup` flooding to 95 % in
#206). A full-stack procedure gate is the obvious follow-up. Also added `_cmdEvidence()`, which
discriminates command evidence by `trip_id` as it already did by `failure_id` — without it two
consecutive `set_trip_block` steps check each other off.

**2026-07-25 — Startup rate protection retuned; the "20 % coast" was never physics (issue #134).**
The complaint — power coasts to ~20 % after criticality even when leveled — was assumed to be a
weak low-power Doppler bite or too-steep differential rod worth (TUNING_LOG backlog S3). It is
neither, and touching either would have destabilized the tuned Mode-5→1 heatup. Measured on
`hot_zero_power` with rods then frozen for an hour: removing the accumulated reactivity in ONE
continuous drive released as SUR nulls parks the plant at **1.8–3.5 %**; removing the *same*
reactivity in single-step taps parks it at **10.3 %**, and from a brisker approach at **19.8 % plus
an IR-high trip**. Same worth, same feedback — the plant runs while you tap. Below the point of
adding heat there is no temperature feedback at all, so residual ρ decides everything, and
sustaining even a 1 DPM ramp means carrying ~+200 pcm that must all come back out.

The actual defects were procedural and instrumental: (a) `pwr_startup` withdrew +45 steps
(≈ +430 pcm) and returned −8 (≈ −76), named "~5–15 %" as its target and **accepted on
`power_pct > 5`**, so overshooting was a pass condition; (b) its caution attributed the overshoot to
the lumped single rod group, which the measurement disproves; (c) the SUR HI alarm (2.0 DPM) and
rod-withdrawal block (2.5 DPM) sat above anything a startup reaches — the run that coasted to 19.8 %
peaked at **1.82 DPM**, so neither fired. SUR saturates near 1.4–1.8 DPM over a wide ρ band
(2.5 DPM ⇒ ~10 s period ⇒ ρ ≈ +400 pcm), i.e. the block was a prompt-criticality backstop
mislabelled as a rate control.

Decision (owner-ruled): make the block a genuine rate control — **alarm 2.0 → 1.0 DPM, block
2.5 → 1.5, clears 1.5 → 0.8** — and rebuild the checklist around the technique rather than the
recipe, with **crossing the 5 % boundary promoted to its own deliberate step**. The by-the-book
ascent now peaks at 0.92 DPM (block never engages) and lands 1.47 % in Mode 2 → 12.4 % in Mode 1 →
12.5 MWe. Consequence worth recording: a *held* withdrawal can no longer run the plant away, so the
`pwr_startup_challenge` overshoot card is now reached in bites taken under the block — which is the
scenario's own lesson sharpened, *the inhibit can freeze your hand but it cannot subtract*.
`run_procedures` 96 → 97 checks; all 19 runners at baseline.

**2026-07-24 — SG dryout depletion (meltdown battery MD-6, structural).** A fully dry SG used to
stay a perfect heat sink forever (trip-open dump pinned `t_secondary` ~190 °C below Tavg; the 0.02
`sg_dryout_residual` passed the whole decay-heat load), so total loss of MFW+AFW parked the primary
at ~297 °C — unkillable. No constant residual could fix it: TR-2 (recoverable MFW loss) needed
≥ 0.015 to hold its < 16.20 MPa peak while MD-6 needed ≤ 0.006. **Probe finding that shaped the
design: TR-2 *also* fully dries its SG** (wide 0.0 @ ~62 s, secondary at the 0.10 MPa floor) before
AFW rebuilds level — so no level threshold separates transient from sustained dryout; the real
differentiator is **whether feed is reaching the bundle**. Decision: time-dependent depletion keyed
on feed, not level. New state `s.sg_dry_deplete` (0..1, stepped in
`pwr_steam_generator.stepSecondary`): → 1 with τ 300 s (`sg_dryout_deplete_tau`) while wide <
`sg_dryout_wide_pct` AND `feedwater_flow < sg_dryout_feed_eps` (0.01); → 0 with τ 45 s
(`sg_dryout_rewet_tau`) on any feed — AFW wets the tubes before pool level recovers, the real AFW
mechanism. `pwr_thermal.stepCoolant` scales the residual by (1 − deplete). TR-2 is *bit-identical*
(deplete never engages under AFW); MD-6 heats to Tavg 366 °C, boils down, damage @ 2835 s, melt @
6250 s. Save-compatible (missing field defaults 0 at every use site). Gates: `run_meltdown` **8/8**
(XFAIL emptied), behavior 30/0/0, PWR 31/31, all other baselines held.

---

## M2 — RBMK Engine

**Files:** `engines/rbmk/{rbmk_config, rbmk_protection, rbmk_kinetics, rbmk_thermal, rbmk_rods,
rbmk_instruments, rbmk_engine}.js`
**Acceptance:** `node test/run_rbmk.js` → **18/18 suites, 99/99 checks** (both versions). Browser
page `test_rbmk.html`. Load order: `protection → config → kinetics → thermal → rods → instruments
→ engine` (protection before config so `forVersion()` stitches the version protection in; engine
captures `RD.rbmk*` helper namespaces at IIFE-eval, so they precede it).

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | `ρ_total = ρ_rods + ρ_doppler + ρ_void + ρ_xenon + ρ_graphite` (no excess term); `void_ref = 0.30` fixed | Added a trimmed **`rho_excess`** term; Doppler/graphite refs **pinned at full-power operating temps**; **`void_ref` pinned at each state's operating void** | Reuses the M1 D2 / **Flag F1** pattern (now resolved). The RBMK has no boron — with partially-inserted rods (negative) + equilibrium xenon (negative) and every feedback zero at its reference, nothing sums to critical; an excess term is unavoidable. **Pinning `void_ref` was also load-bearing for stability:** with the spec's fixed 0.30 vs the ~0.04 low-power operating void, ρ_void carries a large *negative* standing offset, and the power-dependent amplification shrinking that offset as power rises is itself a spurious positive feedback — the reactor ran away at `low_power_xenon` with no scram. Pinning makes the amplified coefficient act on the void *change* (the real accident mechanism). |
| D2 | `energy_deposition_scale = 0.42`, `void_response_tau = 2.0`, `α_D = −1.0e−5`, `alpha_void_base` pre `0.005`, `k_disp` pre `0.008` | Retuned: `scale = 4.0`, `void_tau = 1.0`, `α_D = −3.0e−5`, `alpha_void_base` pre `0.0025`, `k_disp` pre `0.05` | All `[tune]`, arbitrated by §19. The literal starting set produced *either* a spontaneous low-power runaway *or* (after the D1 fix) a pre excursion that fizzled at ~16 % and a violently-oscillating full-power flow response. The retune (below) makes pre cross prompt critical and destroy by **steam explosion**, post shut down safely, and full-power maneuvering stable — for both versions. |
| D3 | Internal rod `position` with `position↑ = inserted` (§9/§14.1) **and** contract `position_pct` with `100 = withdrawn` (CONTEXT §6.5) | Internal `steps` = **insertion** (0 withdrawn, max inserted); `getControlState` emits contract `position_pct = 100·(1−steps/max)` and a withdrawn-based `steps` | The two conventions are genuinely opposite (the spec says so). Keeping insertion internally makes ORM (`= inserted fraction · 211`), the displacer depth `z`, and the §14.1 runaway/stall signs all natural; the inversion happens only at the contract boundary. |

### The accident-tuning chain (how pre excurses / post is safe — the heart of M2)

The pre/post divergence comes from **three** levers acting in sequence at `low_power_xenon` (ORM ≈ 7.5, xenon 135 %, EPS bypassed); they were co-tuned until pre destroys and post does not:
1. **Displacer trigger (`k_disp`).** Control rods sit nearly withdrawn (ORM low ⇒ `z ≈ 0.29 m`, inside the 1.25 m water column). On AZ-5 they insert *through* the column; the peak−start Δρ ≈ `k_disp·0.34` must clear β (0.0065) by enough to drive a **hard** prompt spike *before* ORM rises out of the high-amplification band and the rods exit the column (~1.5 s window). `k_disp = 0.05` (pre) / `0` (post) — the functional version difference.
2. **Void sustain (amplified coefficient + faster `void_tau`).** The spike drives void up; the ORM-penalty × low-power × xenon amplification (here ~6× at ORM 12) makes rising void self-reinforcing. `void_tau` cut 2.0→1.0 so void catches the spike before the displacer fades.
3. **Destruction (`energy_deposition_scale`).** The milder (post-stability-retune) excursion peaks ~37 000 % with fuel only ~1070 °C, so the **thermal-melt** path (2800 °C) never fires — destruction must come from the **steam-explosion** EMA. `scale = 4.0` lifts the peak EMA (~384) clear of the 280 threshold while non-accident energy stays ~4 and post stays negligible, so there is no melt/explosion race and post never triggers.
- **Full-power stability** (the opposing constraint): `alpha_void_base` cut 0.005→0.0025 and `α_D` strengthened −1e−5→−3e−5 so a 20 % flow reduction settles ~+3 % instead of oscillating 285 %↔66 %. The accident still excurses because its amplification is ~6× and it is displacer-*triggered*, not base-coefficient-driven.

### Modeling decisions (spec left open)

- **Two rod groups, one carries the accident.** `control_rods` (function `control`, in ORM, version per-rod function incl. the displacer) + `shutdown_rods` (function `shutdown`, **pure absorber both versions**, not in ORM). The displacer/positive-scram effect lives only in the control rods (the historical graphite-tipped manual rods); the AZ emergency rods are clean absorbers — so a full-power scram (control rods already past the water column) is unconditionally safe, while a low-power scram (control rods in the column) triggers the excursion. `rod_count` is a lumped worth-scaling factor (control 1.0, shutdown 0.2), decoupled from the ORM `total_rod_count = 211`.
- **Heat source** mirrors M1: fission embedded in `P` during operation, decay added as the residual once scrammed (`Q_total = P + (scrammed ? H : 0)`) — keeps rated fuel temp right and the post-scram fuel hot.
- **`steam_to_turbine`** is a fixed load (= initial power), not power-tracking — so an excursion outruns the turbine draw and drum pressure rises into the reliefs / `steam_pressure` trip, rather than the load magically absorbing the spike.
- **Coolant temp** is `T_sat(steam_pressure)` (the channel water boils at drum pressure, ~286 °C at 7.0 MPa), feeding fuel/graphite coupling.
- **`MAX_PROMPT_GROWTH`** caps per-step prompt growth (pre 80 / post 5) as the §3 numeric backstop; a `_P ≤ 1e9` clamp and freezing kinetics once `melted` prevent post-destruction NaNs.
- **PRNG / save-restore** identical machinery to M1 (mulberry32, Box–Muller; lag buffers + failures + RNG state saved). Save/restore verified bit-exact mid-`channel_rupture` + mid-stall + instrument-drift, for both versions.
- **Protection is version-specific data** (`forVersion`): pre has 3 trips, post adds the tighter power trip + void trip; ORM alarm setpoint 15 (pre) / 43 (post). No engineered-safety auto-actuation (RBMK is trip-to-scram in v1).
- **`rho_excess` is trimmed PER-STATE** here (each named state, each version, trimmed to ρ=0 at its operating point) — both `full_power` and `low_power_xenon` start critical, which is correct (operators held criticality at low power before AZ-5). This differs from M3, which trims once (the BWR's `post_scram_sbo` must be *subcritical*). The pre/post trims differ because the rod/void terms differ by design.
- **`K_drum_pressure = 0.0207`** — the spec gives two values (§8.3 inline `0.0207`, §20 table `3.0`); took the detailed-section value (the §20 table looks like leftover from a different scaling, same pattern as the BWR's `K_vessel_pressure`). Steady state is insensitive (balanced imbalance → 0); it only sets pressure-transient speed, and the reliefs/trip cap the excursion regardless.
- **Contract addition — `reactivity_pcm`** in `true_state` (= `_rho·1e5`), additive beyond CONTEXT §6.3, mirroring M1's reactivity-computer field. Additive only, so M7's data-contract suite is unaffected; M8/M4 (when extended to RBMK) can surface it as a reactimeter reading, never a board gauge / never fed to protection (HR1).

### Notes / open items
- **F1 resolved** here (see flag table). **F6** confirmed for M2 (stable at 0.02 s).
- The `low_power_xenon` precondition is *metastable*, not a stable equilibrium — it sits at ρ≈0 until perturbed, and a sufficiently large upward nudge (the scram, on pre) runs away. This is faithful to the physics but means scenario scripts (M6) must drive it deliberately; free-running it for very long will eventually drift (xenon burnout).

---

## M3 — BWR Engine

**Files:** `engines/bwr/{bwr_config, bwr_protection, bwr_vessel, bwr_recirculation,
bwr_safety_systems, bwr_instruments, bwr_engine}.js`
**Acceptance:** `node test/run_bwr.js` → **9/9 suites, 47/47 checks**. Browser page
`test_bwr.html`. Load order: `config → protection → vessel → recirculation → safety_systems →
instruments → engine`. The Fukushima flagship runs ~17 h of plant time at 0.02 s (~3 M steps
across its branches) — the whole suite runs in ~10 s.

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | "No prompt fast-path (standard Euler kinetics throughout)" (§3) | **Implicit (prompt-jump) Euler** for the prompt term: `P=(P+dt·ΣλC)/(1−dt·(ρ−β)/Λ)` | The BWR's Λ=5e-5 makes the prompt mode decay at β/Λ≈130 s⁻¹; **explicit** Euler is unstable at dt=0.02 (dt·β/Λ=2.6>2) — it blows up even at ρ=0, and even the scrammed `post_scram_sbo` diverged. The implicit form is still **first-order** (CONTEXT §11 forbids only *higher*-order methods) and is unconditionally stable for ρ<β — exactly the BWR's envelope (it never reaches prompt critical, §3). **Resolves Flag F6** for M3. |
| D2 | `rho_total = ρ_rods+ρ_doppler+ρ_void+ρ_xenon` (no excess term); `void_ref=0.40` fixed; `K_vessel_pressure` 0.0172 (§6.1) / 2.5 (§19 table) | Added a trimmed **`rho_excess`** (fixed core constant, full-power-critical, no per-state retrim); Tf_ref/void_ref pinned at the full-power operating point; **`K_vessel_pressure=0.5`** | Same F1 boron-free criticality pattern as M1/M2 — but trimmed ONCE (not per-state) so `post_scram_sbo` (rods fully in) comes out genuinely subcritical. The §19 table's `K_vessel_pressure=2.5` made decay-heat steam pressurize so fast it pinned vessel pressure at the relief setpoint and **ADS could never depressurize against it** (the whole intervention branch failed); 0.5 lets ADS win while still giving a sharp turbine-trip transient. |
| D3 | `ads_depressurization_tau=600 s`, `vessel_water_mass=1.0`, `rcic_flow_normalized=0.01` (§19) | `ads_tau=120 s`; `vessel_water_mass=7.0` (rcic stays 0.01) | All `[tune]`, arbitrated by §18. At 600 s ADS stalled ~3 MPa (decay steam out-vented it near the threshold) — a real ADS blows down in minutes, so 120 s. `vessel_water_mass=7` is the knob that sets the **uncovery timeline** (below); rcic_flow then matches early boiloff so RCIC holds. |

### The Fukushima timeline — how the hours-scale story is tuned (the heart of M3)

The §18 flagship is the acceptance centerpiece; the numbers were tuned so the timeline is
*approximately* right (the spec's explicit goal):
- **boiloff = `H_total/(latent·vessel_water_mass)`, gated to `scrammed`.** Gating off at power
  keeps full-power level stable (the normal steam/feedwater balance holds it); after scram it
  becomes the inventory threat. `vessel_water_mass=7` makes early-decay (7 %) boiloff ≈ the RCIC
  flow (0.01), so **RCIC holds the core covered** (level pegs ~100 %) through the grace window.
- **Battery: linear timer, `battery_duration_hours=8`** → at ~8 h depletes → RCIC (and HPCI) lose
  DC control power and stop. Observed: level falls 100 %→20 % in **~3 h** (within the spec's 2–4 h),
  then to 0; fuel then heats (h_fc collapses on uncovery) to the 1200 °C damage onset by ~14 h.
- **Intervention branch:** after RCIC fails, ADS (`trigger_ads`, fast 120 s blowdown) drops vessel
  pressure below the 1.03 MPa LPCI threshold in minutes; LPCI (0.05, large) then refills the
  vessel → **core saved, no damage**. Same start, opposite outcome — the lesson.

### Modeling decisions (spec left open)

- **Engine never auto-starts the safety systems (HR2).** Auto-start (RCIC at level<50, HPCI<30,
  ADS<15 gated `hpci_unavailable`, LPCI gated `ads_open`) is M4 **actuation data** (§13); the
  flagship test emulates it in a `runActuated` helper (as M1's TMI test emulated RPS/PORV). The
  engine computes only the running EFFECTS and the physical stop-limits (steam-pressure cutoff,
  battery depletion).
- **`K_vessel_pressure`-driven decay steam** sets vessel pressure post-scram; relief at 7.58 MPa
  holds it there (SRVs cycling), which keeps RCIC's steam drive available — until ADS or a stuck
  SRV pulls it down (and below `rcic_min_pressure` RCIC stops on its own, the §13.1 lesson).
- **Recirc drive flow RAMPS toward the setpoint** (`tau_recirc=8 s`, pump inertia). An instantaneous
  flow jump swung the void hard enough to push ρ→β in one step (numerically violent, physically
  wrong); the ramp keeps flow maneuvering gradual. The BWR's flow→power coupling is genuinely
  strong (it IS the control mechanism), so a full-range flow push moves power a lot — the test
  asserts it *settles*, not a magnitude.
- **Core-uncovery heat-transfer collapse:** below `uncover_level_pct=20`, `h_fc` fades as
  `level²` toward a near-zero floor (`0.00005`), so once the core is uncovered decay heat
  accumulates and fuel heats to damage — the only path the BWR reaches fuel damage (no prompt
  excursion).
- **Rods** are bottom-entry but use the standard contract convention (steps=withdrawn, SCRUVE
  worth) like the PWR — only the 3 s fast hydraulic scram differs. PRNG / save-restore machinery
  identical to M1/M2; save/restore verified bit-exact mid-blackout with `srv_stuck_open` +
  degraded battery + an instrument drift.
- **`full_blackout_bwr` also closes the MSIV** (sets `steam_flow=0`, `turbine_blocked`) — a
  deliberate addition beyond the spec's "drop AC: lose recirc + main feedwater" (§13). Without it,
  after scram the turbine kept drawing steam while the core only made decay steam, so vessel
  pressure *crashed* below `rcic_min_pressure` and RCIC couldn't run. MSIV closure on loss of power
  is real plant behavior and is what lets decay steam build pressure to keep RCIC's drive alive.
  (`post_scram_sbo` already starts steam-isolated; this fixes the *injected* SBO path.)
- **Recirc operating point + command band.** Full-power recirc setpoint is **40 %** drive (not
  100): the 2.5× jet-pump multiplier makes core flow ≈ 100 % there (void ≈ 0.45). Because core flow
  caps at 120 %, `set_recirc_flow` is **clamped to 0–48 %** (drive above 48 % is wasted) — the
  operator's usable recirc band.
- **Contract addition — `reactivity_pcm`** in `true_state` (additive, like M1/M2). **`mwe_rated`
  (1100 MWe)** added to config so `set_turbine_load {mwe}` maps to a steam fraction (`mwe/mwe_rated`).
- **Vessel-pressure steam source = `Q_total`** (fission + decay), so a scrammed core still boils
  (decay) and pressurizes into the reliefs — the same `Q_total` that gates boiloff, kept consistent.

### Notes
- **F1 confirmed, F6 resolved** here (see flag table).
- The actuation-gate status readings (`ads_open`, `hpci_unavailable`) are surfaced for M4's
  `evaluateCondition`; the `actuation_gates` test exercises the gate logic engine-side (ADS gated
  on hpci_unavailable, LPCI on ads_open, and `ads_failure` blocking the chain).

---

## M4 — Control & Failure Layer

**File:** `layers/control_failure_layer.js`
**Validation:** integration smoke test `node test/run_m4.js` → 11/11 suites, 37/37 checks
(a **dev** check; full validation is M7's job, per M4 §2).

### Decisions & deviations

| # | Topic | Decision | Why |
|---|-------|----------|-----|
| C1 | **M1/M4 seam** | M4 **forwards** every `inject_failure`/`clear_failure` to the engine **and** holds command-override failures to intercept commands in flight | M1 implements each failure's *persistent state* in the engine (the "hooks", M1 §9) — e.g. `loss_of_feedwater` must stop feedwater whether or not a command is sent, which per-command interception alone can't do. M4 still intercepts (transform/block, incl. the plant's own auto-actuation/scram commands). Complementary, never contradictory. **→ Flag F3.** |
| C2 | **`__true_flow__` trip** | ~~Reads `engine.getTrueState().pump_flow_pct / 100`~~ — **RETIRED 2026-07-29 (#247).** The low-flow trip now reads the `rcs_flow` elbow-tap instrument (% of rated, setpoint 25). | Called "the one documented HR1 exception" for two years, and it was not an exception — it was an **unbuilt instrument**. A trip that cannot be lagged, drifted or stuck is a trip nobody can be trained on, which is the opposite of what this simulator is for. `run_hardrules.js` (2026-07-29) forced the distinction by making every author write the *reason*, and the honest reason here was "the instrument does not exist". **There is now no HR1 exception in the PWR trip table.** |
| C3 | **`last_trip_reason`** | Stored as `"<instrument> <direction>"` (e.g. `"sg_level low"`) | CONTEXT §6.2 types it `string`; a terse, human-readable descriptor. |
| C4 | **lo/lo_lo escalation** | A low alarm with a less-extreme low sibling on the same instrument fires only when the sibling's condition also holds | Implements M4 §5. Auto-satisfied by threshold ordering, but the guard is explicit for robustness. |
| C5 | **Alarm snapshot list** | Every alarm is emitted each cycle with its current `state` (including `clear`) | The UI annunciator (M8) is a fixed tile set; it needs all tiles, lit by `state`/`priority`. |
| C6 | **`evaluateCondition` default** | Unknown gate conditions evaluate **true** (permissive) | The PWR uses no actuation gate conditions; the evaluator is built generic for the BWR's `ads_open`/`hpci_unavailable` (M3). |
| C7 | **Failure `category`** | Added a `category` field to the PWR failure **data** (`pwr_protection.js`) | M4 §10's catalog needs `category ∈ reactivity\|coolant\|power\|instrument\|safety_system`; per HR3 it is plant data, so it lives in the engine config, not in M4. |
| C8 | **`degraded_hpi`** | Routed to the engine's `hpi_flow_multiplier` hook; its `set_hpi` interception is a pass-through | The spec (M4 §7) flags it as "really physics_parameter". **→ Flag F4.** |
| C9 | **Interlocks (§4b, added with the PWR startup-forgiveness pass)** | New config-driven machinery: `config.interlocks[]` — condition-latched command blocks with hysteresis (`setpoint` engages + optional `on_engage` command, `clears_below/above` disengages), reading INSTRUMENTS (HR1). `withdrawal_only` blocks outward rod motion but never insertion. Blocked commands return `{type:'blocked', code:'INTERLOCK', message}` (register-aware). State in save/restore. | Real plants have rod stops / withdrawal inhibits that are neither trips nor failures — the plant refusing an unsafe command while telling you why. PWR instance: rod-withdrawal block at SUR ≥ 1.5 DPM (clears < 0.8) — retuned from 2.5/1.5 in 2026-07 (#134), where it was a prompt-criticality backstop that never fired on an actual startup. Pure data per HR3. |
| C10 | **Actuation `reset_below` comparison fixed** | Reset fires when the value returns to the SAFE side (`< reset_below` for high-direction, `>` for low) | Was inverted (`value > reset_below`): the PORV auto-actuation fired open and "reset" (close) in the same evaluate, flapping every cycle while pressure stayed high. Masked in practice (nothing reached 16.2 MPa in normal ops; TMI's stick intercepts the closes) — exposed when the steam-dump rework let a turbine trip actually reach the PORV band. |

---

## M5 — Simulation Service & Runtime

**File:** `layers/simulation_service.js`
**Validation:** integration smoke test `node test/run_m5.js` → 12/12 suites, 35/35 checks
(a **dev** check driving the full PWR stack; full validation is M7's job).

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | Engine handed `dt_effective = 0.02·time_acceleration`; loop runs a fixed step count of that dt (§3) | Engine always stepped at **fixed 0.02 s**; acceleration = **more steps per broadcast** | M1's Euler kinetics is only stable at 0.02 s and diverges at large dt (verified: 60× → dt 1.2 s blows up to 1e6 %). Step-count acceleration keeps every step stable and deterministic; at 1× it is identical to the spec (25 steps × 0.02 s / 500 ms). **→ Flag F6** (binds M2/M3). |
| D2 | `stepsPerBroadcast = broadcastInterval / PHYSICS_DT` (§3) | `round(accel · (broadcastMs/1000) / 0.02)` | The literal formula is dimensionally off (500 ms / 0.02 s = 25000, not 25); converted ms→s and folded acceleration into the count per D1. |
| D3 | Protection (M4 `evaluate`) runs **once per broadcast**, after the substep loop (§3) | Evaluated inside the loop whenever **`PROTECTION_DT` = 0.1 s of SIM time** has accumulated, plus the existing post-loop call on the final readings | **2026-07-31, #153.** The literal reading makes the interval between two protection evaluations `timeAcceleration × broadcastMs` — i.e. **a UI speed button decides how well the reactor is protected**. Measured full stack (PWR `50_percent`, `continuous_rod_withdrawal` sev 1.0, seed 42): indicated flux clears its 120 % setpoint for only **8.74 sim s**, so at 1×/60× the plant tripped on `power_range high` at **9.1 s**; at **256×/600× that trip was never evaluated** and the plant tripped 16.5 s / 50.9 s late on `primary_pressure high` — the wrong signal, after a **136 %** excursion; at **700× and above, including the 3600× the speed selector ships, nothing fired at all** (one evaluation per 360 sim s; the whole excursion inside a single broadcast, `scrammed` false on the far side). Post-fix, 1× → 3600×: scram **9.14 → 9.32 s**, always `power_range high`, peak **121.6 → 121.9 %**. **1× is byte-identical** — a 1× broadcast is exactly `PROTECTION_DT`, so the in-loop guard hands that evaluation to the post-loop call. Cost **+0.4 %** at 3600× (`evaluate` 7.85 µs vs `step` 18.80 µs). Safe because `getInstruments()` is a pure read (noise PRNG advances in `engine.step`) and `ControlLayer.evaluate` holds no per-call state. Guard: `run_m5`'s *Protection cadence* suite (5 of 7 red by injection). |

### Modeling decisions (spec left open)

- **Default pass-through Instructor** built into M5 (`DefaultInstructor`) as the slot's default occupant
  so the stack runs and is testable **before M6·PH lands**. It forwards commands to M4, runs no beats,
  emits `{message:null}`, tracks the register. M6·PH/M6 replace it via `opts.instructor` with no change
  to M5. (This is *not* M6·PH — that's a separate module/file.)
- **`set_register` dispatch:** the service sends it directly to **both** the Instructor and M4 (each
  consumes it; neither forwards it onward), and records `activeRegister` for the UI — per §5.
- **Save/restore split:** `saveState()` returns the state object and `loadState(state)` consumes one;
  the browser file-API wrappers (download / `<input type=file>`) are deferred to M8. Keeps the core
  logic deterministic and headless-testable (and is what M7 drives).
- **Loop mechanism:** a self-rescheduling `setTimeout` (so a cadence change applies on the next tick),
  with `tick()` / `advanceCycles(n)` exposed for synchronous, timer-free, deterministic test driving.
- **Transient detection** uses the plant's primary pressure field via a `primaryPressure()` helper
  (`pressure_mpa` / `steam_pressure_mpa` / `vessel_pressure_mpa`), per §7's "pressure_like".

### Fast-forward attention stops (2026-07-17) — auto-decelerate to real time on an operator event

- **What.** Time acceleration now auto-snaps back to **1×** on the broadcast where a plant event the
  operator must address first appears: **SCRAM** (`rps_state.scrammed` OR manual `true_state.scrammed`,
  edge-triggered), a **newly present `active_failures` id**, or a **newly annunciating alarm**
  (reuses `_anyAlarmNewlyFiring`). `_attentionStop(snap)` returns the
  first matching reason; `_assembleWithInstructor` snaps `timeAcceleration=1` and stamps
  `metadata.speed_snap = { reason }` on that same snapshot. The M8 UI toasts the reason (`app.js`
  `SPEED_SNAP_MSG`); the FF badge/speed-seg already mirror `time_acceleration`, so they self-clear.
- **NOT rapid change (2026-07-17).** A raw power/pressure excursion (`_isRapidChange`, the §7
  transient-cadence signal) is deliberately **excluded** from `_attentionStop`. It fires on any
  *commanded* maneuver — an operator or auto-channel power ramp — which is expected change, not an
  attention event; snapping to 1× on it would make fast-forwarding through a startup/load ramp
  impossible (and stalled every auto maneuver in `run_autoctl`). An excursion that genuinely warrants
  attention already annunciates an alarm, which the alarm trigger catches. `_isRapidChange` stays as
  the transient-broadcast-cadence signal only. `run_autoctl`'s headless probes re-assert their
  intended speed each cycle (the attention-stop is a UI speed policy, orthogonal to automation
  correctness). `run_autoctl` **20/20**.
- **Why here (not M4).** Time acceleration is a property of the sim driver, not the plant — CONTEXT
  treats `wall_time` as display-only, never physics. M4 sits *below* M5 and has no time concept
  (its only "speed" is rod drive rate); for it to set the clock would invert the command-down /
  snapshot-up contract (HR5). M5 is the only layer that both reads the assembled snapshot and owns
  the clock. So the state stays in M5 and the auto-decelerate lives in M5.
- **Ordering.** Applied *after* `_serviceInstructorRequests()` (so a beat's `speed` request has already
  landed) but *before* `metadata.time_acceleration` is stamped — a real trip/failure therefore
  overrides an authored fast-forward, and the snapshot carrying the event already reads 1× (no
  one-broadcast lag). It only ever decelerates, and only while accel > 1, so it never fights a paused
  or already-real-time clock.
- **Edge detection.** `_prevScrammed` / `_prevFailureIds` are captured in `_updateCadence` alongside
  `_prevTrueState`/`_prevAlarms`, and cleared to their null/false baseline on every reset path
  (`constructor` / `selectPlant` / `loadState`) so a fresh plant or just-loaded save never reads as an
  event on its first broadcast.
- **Authored *soft* stops stay content.** Pausing just before an operator action during a mode change
  is still a beat with `speed: 1` (the device documented at `instructor_layer.js` `_speedRequested`) —
  no engine change; this feature covers only the *unauthored* hard events.
- **Gate.** New `run_m5` suite "Attention stop …" (scram, failure, and the accel-must-be->1 guard);
  `run_m5` **19/19**, `run_autoctl` **20/20**.

### Loop pressure distribution (2026-07-17) — three primary-loop pressure nodes, one bubble state

- **What.** `pwr_primary.computeNodePressures(s, cfg)` writes three node pressures onto the engine
  state each step: `p_hotleg = pressure_mpa` (the pressurizer/surge-line reference), `p_pumpsuction
  = pressure_mpa − loop_dp_sg_rated·ff²` (between SG and RCP, the lowest node), and `p_coldleg =
  pressure_mpa + loop_dp_core_rated·ff²` (RCP→RX pump discharge, the highest node). Two new
  `primary.*` config constants (0.30 / 0.25 MPa at rated) set the offsets; the implied pump head is
  their sum (~0.55 MPa ≈ 80 psi). Called from `engine.step` right after `stepPressure` (step 7b, so
  injection reads it in step 9) and from `_buildState` (so `getTrueState` is valid pre-first-step).
- **Why NOT independent dynamic states.** The RCS is incompressible liquid everywhere except the
  pressurizer bubble, so it has exactly ONE thermodynamic pressure state (the bubble) plus a
  quasi-static ΔP field — pump head vs. form loss, both ∝ `flow_frac²`. Three separately-integrated
  pressures would invent compliance the water doesn't have and be numerically stiff (acoustic/
  hydraulic transients at tiny dt). Pure algebra over `pressure_mpa`/`flow_frac` is the honest,
  cheap reduction; the spread collapses to zero as the RCPs coast down.
- **Re-pointed systems.** ECCS injection (`injectionFlowInv`) and passive accumulators
  (`stepAccumulators`) discharge into the COLD leg, so they now work against `p_coldleg` — higher
  than `pressure_mpa` at power (slightly less injection), converging on it as a LOCA trips the pumps
  (where injection matters most, so the flagship is barely perturbed). RHR suction is the HOT leg,
  which equals `pressure_mpa`, so its 2.76 MPa interlock is unchanged. Spray already scaled with
  `flow_frac` (its ΔP is the cold-leg-to-pressurizer head) — left as is.
- **Contract / instruments.** Node pressures are additive true-state fields (migrate cleanly; seeded
  in `_migrateState`). The single `primary_pressure` instrument still reads `pressure_mpa` — real
  plants have one wide-range RCS gauge, not three, so the nodes are internal truth the tied-in
  systems consume, not new indicators (HR1 preserved; PRNG order untouched).
- **Gate.** PWR engine **19/19** (the merged-injection §14 test now reads the actual `p_coldleg`),
  campaign **47/47**, `run_m5` **19/19**, `run_m4` **15/15**, `run_ops` 53/66 (baseline), autoctl
  **20/20**, `verify_e2e_ui` PASS. Enables the two-orifice letdown model and RCP cavitation (suction
  node) that follow.

### Two-orifice letdown (2026-07-17) — pressure-driven CVCS letdown, four-state orifice lineup

- **What.** Letdown was a commanded normalized constant (`set_letdown_flow`); it is now **two fixed
  orifices**, each independently in/out — four states (off / A / B / A+B) via `set_letdown_orifices
  {a, b}` (each field optional, so a toggle preserves the other orifice). `pwr_primary.letdownFlow`
  computes the TRUE flow each step: `Σ Cᵢ·√(max(0, p_coldleg − letdown_backpressure_mpa))` over the
  in-service orifices. `s.letdown_flow` becomes that computed value (the `letdown_flow` instrument
  still reads it — SOURCE map unchanged, PRNG order intact); it is no longer a set field.
- **Why pressure-driven / backpressure = 2.4 MPa.** Real letdown is an orifice bleed from the cold
  leg to the letdown HX / VCT; the downstream backpressure-control valve holds ~2.4 MPa (350 psig,
  Westinghouse) to keep the letdown coolant subcooled. So flow ∝ √ΔP across the orifice and **tails
  off as RCS pressure approaches 2.4 MPa on a cooldown** — the honest behavior (you lose letdown
  driving head at low RCS pressure), not a throttled constant. Reads the cold-leg node from the
  loop-pressure rework (letdown taps the cold leg).
- **Calibration.** `letdown_orifice_a_coeff` 0.00822, `b` 0.01096 (normalized flow per √MPa), sized so
  at NOP (`p_coldleg` ≈ 15.71): A ≈ 0.030 (normal letdown), B ≈ 0.040, A+B ≈ 0.070 — A+B exceeds
  `charging_max` 0.06 (a net drain for level reduction / depressurization). [tune]
- **Compat.** `set_letdown_flow {normalized}` kept as a **deprecated alias** — maps the requested flow
  to the nearest orifice lineup by NOP-flow (off/A/B/A+B), like the `set_dhr`/`set_lpi` precedents.
  `_migrateState` derives the orifice lineup from an old save's `letdown_flow` (A above 0.015, B above
  0.050) so intent carries; the flow is then recomputed pressure-driven. All first-party callers
  (§14 `_pzrTrim`, `run_campaign` cooldown, `ops_pwr`, `run_e2e_controls`, the synoptic UI) updated to
  the orifice command.
- **UI.** The synoptic CVCS panel's letdown setpoint box is replaced by two orifice toggles (A / B,
  each In/Out) with state sync; the manual control renames "Letdown Valve (CVCS)" →
  "Letdown Orifices (CVCS)" (`manual_data.js`, `manual_ui_map.js`, the synoptic highlight map, and
  `Manuals/03` §7.3 all updated together; `audit_manual_controls` green).
- **Gate.** PWR **19/19** (Mode 5↔1 roundtrip + save/restore green with orifice letdown), campaign
  **47/47**, `run_m5` **19/19**, `run_m4` **15/15**, `run_e2e_controls` 27/28 (recorded then as "the
  blowdown gap", but the 2026-07-19 review found the failing check had silently CHANGED identity —
  the accumulator check passed after 096f574 and the CVCS charging check went stale after e28f7b0's
  leak rescale; both repaired 2026-07-19, suite 30/30), `run_ops` 53/66 (baseline), autoctl
  **20/20**, synoptic **55/55**, `verify_e2e_ui` PASS.
  Functional headless drive: clicking orifice A/B in the shell moves the letdown indication (0 → ~2 →
  ~5 % as A then B come in).

### RCP cavitation (2026-07-17) — suction-node voiding degrades pump flow

- **What.** `pwr_primary.stepCavitation(s, cfg)` computes `suction_subcool_c = Tsat(p_pumpsuction) −
  tcold` — the NPSH-like margin at the lowest-pressure node — and a severity `rcp_cavitation_frac =
  clip((cavitation_onset_c − suction_subcool_c)/cavitation_band_c, 0, 1)`, gated on `pump_running`.
  `stepFlow` then drops the delivered-flow target to `1 − cavitation_flow_loss·severity`, so a fully
  cavitating pump settles near 30 % flow. A boolean `rcp_cavitating` (severity > 0.05) drives a new
  panel-B **RCP CAVITATION** alarm and the synoptic RCP "CAVITATING" readout. Called at step 7c (after
  `computeNodePressures`, before `stepFlow` at 10).
- **Why the suction node / tcold.** The pump suction (between SG and RCP) is the lowest-pressure node
  and carries post-SG cold-leg-temperature water, so it reaches saturation first as the RCS voids or
  depressurizes — the real cavitation datum. Deliberately separate from the bulk `subcooling_margin`
  instrument (the TMI deception): cavitation is its own suction-referenced quantity, so it can't perturb
  the calibrated flagship signal.
- **Feedback is mild & stable.** severity ← p_pumpsuction ← flow_frac ← severity is closed with the
  engine's one-step explicit coupling. When flow collapses, `loop_dp_sg·ff²` shrinks and p_pumpsuction
  rises ~0.2 MPa (≈2 °C of Tsat) — small against the 8 °C band, so no oscillation; the loop settles.
- **Full mechanical effect from the start (owner ruling).** Cavitation degrades flow immediately, not
  indication-only. The TMI flagship stays green (PWR 19→**20/20**): the deception is inventory/void-
  driven (pzr sat-pull, void-surge), not flow-driven, so the flow collapse rides alongside without
  corrupting it. Probed: in the stuck-PORV damage branch the suction margin goes to ≈ −1.5 °C, severity
  → 1.0, flow 100 % → 30 % as inventory uncovers — making the scenarios' narrated "RCP cavitation noise
  developing" (`pwr_tmi2_p1/p3`) physics-driven for the first time.
- **Surfacing.** New true-state fields `suction_subcool_c` / `rcp_cavitation_frac` / `rcp_cavitating`;
  `rcp_cavitating` added to the instrument status set (HR1 status booleans) and driven as the new alarm
  and synoptic RCP state. Additive fields migrate cleanly.
- **Gate.** New §14 test `rcp_cavitation` (no cavitation at steady power → depressurize → cavitates +
  flow degrades → pump-off gating). PWR **20/20**, campaign **47/47**, `run_m4` **15/15** (alarm added),
  `run_m5` **19/19**, `run_m6` **16/16**, `run_ops` 53/66 (baseline), autoctl **20/20**, synoptic
  **55/55**, `verify_e2e_ui` PASS. (`run_procedures` 20/21 — the failing `bwr_sbo_rcic` is a pre-existing
  BWR gap, unrelated.)

## M6·PH — Placeholder Instructor

**File:** `layers/instructor_layer.js`
**Validation:** `node test/run_m6ph.js` → 8/8 suites, 18/18 checks.

A transparent pass-through occupying the Instructor slot (free-play): forwards commands straight
down to M4 (no gating), runs no beats, emits `{message:null}`, tracks the register. Implements the
exact interface the real M6 will, so M6 replaces this file's internals with no change to M4/M5/M7/M8.

### Decisions

- **`setRegister(value)` interface (vs routing `set_register` through `handleCommand`).** Per the
  M6·PH §3 interface, M5 dispatches the register via `instructor.setRegister(value)` and separately to
  M4. M5 was updated to this (it previously sent `set_register` through the instructor's
  `handleCommand`). `handleCommand` is now purely transparent.
- **M5's slot resolution:** injected instructor → else `RD.InstructorLayer` (M6·PH) if loaded → else
  M5's built-in `DefaultInstructor` fallback. The fallback now mirrors M6·PH exactly and exists only so
  M5 has zero hard dependency on the slot implementation (the swap-invariant test confirms identical
  free-play either way). Load order: `instructor_layer.js` before `simulation_service.js`.
- **`connect(layer)` added** to the instructor (beyond the spec's constructor-injection) so M5 can
  re-point the slot at the rebuilt M4 on a plant change without reconstructing scenario state.

## M6 — Instructor Layer (real) + Training UI

**Files:** `layers/instructor_layer.js` (the engine, replacing M6·PH's internals in place) ·
`scenarios/pwr_tmi.js`, `scenarios/pwr_hook.js` (authored content, `RD.SCENARIOS` registry) ·
M5 additions (`layers/simulation_service.js`) · UI (`ui/app.js`, `ui/shell.html`, `ui/shell.css`,
`ui/diagram/pwr_synoptic.js`).
**Validation:** `node test/run_m6.js` → 16/16 (beat engine, triggers, gating, branching, follow,
grading, save/restore, swap invariant) · `node test/run_scenarios.js` → 3/3 (TMI both branches,
Hook incl. world rewind) · `run_m6ph.js` **unmodified** 8/8 · `run_m5.js` 15/15 (12 original + 3
rewind) · procedures 21/21 · `verify_manual_follow.js` 81 checks · M7/M4/engine suites green.

### Decisions

- **Scenario lifecycle = M5 control-plane commands + registry.** `start_scenario {scenario_id}`
  resolves `RD.SCENARIOS[id]`, resets the plant to the scenario's `(plant_id, initial_state,
  design_version)`, then `instructor.load(sc)`. `stop_scenario`/`stop_follow` unload and clear the
  rewind ring. A plain `reset` (selectPlant) also unloads — stale progress can't outlive its plant.
  Instructor `saveState()` stores content **ids** only; `loadState` re-resolves from the registries
  and degrades to free-play with a console warning if missing.
- **Path 2 = a follow-runner mode on the same engine object** (procedures are NOT converted to
  beats — one artifact, per Gameplay §4.1). `start_follow {procedure_id}`: M5 maps active
  plant+design → profile key (`pwr|rbmk_pre|rbmk_post|bwr`) and hands the procedure to
  `loadProcedure`. Auto-advance when `(no cmd || cmdSeen) && (no saw || sawSeen) && (no acc ||
  accMetNow)`; observation steps wait for manual Next; `saw` is latched live (previously never
  evaluated in the UI). **Acceptance debounce:** acc must hold for 5 consecutive broadcasts so a
  parameter sweeping through its band doesn't advance the step in passing.
- **Strict gating (user decision) with a distinct return shape.** Off-script commands in a follow
  are blocked with `{type:'blocked', code:'GATED_BY_INSTRUCTOR', message}` (distinguishable from
  M4's `null`/error) + two-register wrong-action commentary (generic template; per-step `wrong`
  override supported). Allowed set = step's command family (rod steps allow the whole
  `rod_nudge/rod_start/rod_stop/rod_stop_all` family; `inject_failure` only with matching id) + a
  safety set (`scram`, `manual_scram`, alarm acks). Scenario beat gates additionally support
  `allow_actions` (allow-list) alongside the spec's `block_actions` — the Hook needs "everything
  but SCRAM".
- **Instrument-first grading (HR1) with the documented fallback.** `PARAM_INSTRUMENT` map in
  `instructor_layer.js` (param → instrument id per plant, verified against each engine's
  instrument set); params with no twin (`core_inventory_pct`, `melted`, …) grade on `true_state`
  per Gameplay §6's exception, reported as `graded_by` in the snapshot. The map is data (HR3);
  extract to engine configs if it grows.
- **Rewind ring lives in M5; the instructor requests via consume-flags** (no upward callbacks —
  M5 polls `consumeCheckpointRequest()`/`consumeRewindRequest()` after `step()`). Checkpoints =
  full `saveState()` (bit-exact: PRNG + lag buffers), pushed on scenario load / beat fire /
  follow-step auto-advance, cap 32. `rewind {steps, scope}`: **full** restores instructor progress
  too (retry — decision beats re-arm); **world** restores the plant only (the teacher remembers —
  the Hook's narrated rewind; beat field `rewind:{steps}`), with `rebaseTime()` clamping trigger
  anchors after time moves backward. Repeated Rewind presses walk back one boundary each (a target
  equal to "now" skips one further). A beat that carries `rewind` does not also checkpoint (keeps
  the author's step arithmetic sane). `loadState` (user file load) clears the ring.
- **Snapshot extensions via `getSnapshotBlock()`** with an M5 fallback to `getMessage()` (mocks &
  the DefaultInstructor keep working). Fixed shape, keys always present, null when inactive:
  `message, message_register, ui_policy, highlight, follow, level_complete`. Follow mode derives
  `highlight` from the step's `control` label. `ui_policy` v1 carries `{register, highlights}`
  only (layout/hint_level deferred with Qualification).
- **Beat-schema additions over M6 §4** (all additive): `gate.allow_actions`, `advance:'end'`
  (branch endpoints must not fall through into the other branch's beats — beats are one flat
  list), `highlight`, `level_complete {title, outcome_learning/industry, actions}`, `rewind
  {steps}`, `speed` (instructor-driven time acceleration — see the dedicated bullet below).
  `instructor_continue` is an instructor-internal command (consumed, never descends) — the Next
  button doubles as the spec's `manual`-trigger Continue.
- **TMI authoring vs the physics (the honest compromises).** (1) The engine's own flagship suite
  never verifies its `runUntil(P≥16.20)` (silently times out) and **commands** the PORV open — the
  lumped physics does not produce the brief post-trip pressure spike (AFW auto-start and the steam
  dump correctly hold the heat sink). The scenario does the same play: `porv_sticks` fires on
  `delay 10` post-trip and the `stuck_porv_open` injection itself opens-and-holds the valve
  (pressurizer models "stuck" as held open). (2) `afw_failure` is injected with the LOFW (the
  historical closed discharge valves) and cleared at `porv_sticks` (crew found them, ~8 min) with a
  beat-commanded `set_afw` — M4's AFW actuation is latched-once and won't re-fire after a clear.
  (3) The damage branch replays the **real 1979 error**: M4's auto-HPI starts on low pressure and
  *rescues* the plant (inventory reached 120%!), so hesitating at the decision point has the beat
  narrate-and-enact the operators' securing of HPI (`set_hpi false`; the latched actuation stays
  quiet). Subcooling-margin truth vs the lying PORV indicator is asserted live in the harness.
- **The Hook (user decision: prompted, not forced).** First **plain** load (no query string) with
  `hook_done` unset shows an invitation overlay; declining sets the flag. The hook is a normal
  scenario (`pwr_hook`) — allow-only-SCRAM gate, highlight, world-scope rewind back to pre-scram,
  `level_complete` pointing at the Training tab. Replayable from the picker.
- **Progression: one localStorage key `rd_progress`** `{hook_done, completed_scenarios[],
  completed_procedures[]}` (deviation from Gameplay §7.1's separate `rd_hook_completed` key — one
  source of truth), try/catch-guarded for `file://`. Recorded when a `level_complete` first
  renders.
- **Training tab** (the M8 placeholder pane): scenario cards from `RD.SCENARIOS` (Start/Stop,
  ✓ done) + per-plant `[sim]` walkthrough list with Follow buttons + the Reactivity Computer.
  `?scenario=<id>` deep link starts a scenario directly (and, being a query string, suppresses the
  hook prompt).
- **UI follow rewired to the instructor.** `renderFollow` renders the snapshot's `follow` block
  (acc ✓ from the instructor's grading, `via instrument / true value` tag) instead of running its
  own true_state check — Gameplay §6's "fix required". Markup preserved for
  `verify_manual_follow.js`; paused-nav stays synchronous via `cmd()`'s reassemble-on-paused path.
  `ui.follow` is a mirror **synced from the snapshot** each render (never set optimistically) —
  start_follow's internal plant reset broadcasts an intermediate free-play snapshot that would
  otherwise clear it mid-transition.
- **`start_follow` resets the plant to the procedure's `from` state** (post-review fix). Without
  it, a walkthrough started from the wrong state could be trivially completable (e.g.
  `pwr_raise_power`, from `50_percent`, "completes" instantly at full power because its
  acceptance is already true). All 20 authored `from` values are valid §6.9 named states — no new
  states were needed. Retry uses the same path. UI clears trend history + gauge smoothing on
  start (fresh timeline; smoothing across a reset displays values that were never real).
- **Beat `speed` field — instructor-driven time acceleration** (additive schema extension). A
  beat can set `speed: N`; the drop-out device is authoring the NEXT beat's trigger on the set
  point and giving it `speed: 1` ("fast-forward and watch — I'll snap us back when it matters").
  Serviced by M5 via a `consumeSpeedRequest()` consume-flag, applied AFTER any rewind so it wins
  over a checkpoint's stored speed; the broadcast's `metadata.time_acceleration` is re-stamped so
  the snapshot is honest on the fire broadcast. TMI uses it for both slow phases (30× through
  recovery/boil-off, 1× at margin-restored / core-uncovery); the UI speed seg + FF badge sync
  from the snapshot.
- **Sandbox rewind: periodic checkpoints + pick-a-moment on the strip chart.** In free play (no
  scenario/follow — gated on the instructor owning no content, so authored rewind arithmetic is
  never disturbed) M5 pushes a checkpoint every 15 sim-seconds (`SANDBOX_CP_SPACING_S`, ring cap
  32 ≈ the last 8 sim-minutes). The strip chart gets a ⏪ button on the scrubber row: in free
  play it enters a picker mode (sim pauses, checkpoint markers drawn on the chart, click a moment
  → `rewind {steps: n}` to the nearest checkpoint, Esc cancels, stays paused after the jump);
  during instructed content the same button keeps the one-boundary-per-press behavior. On any
  backwards time jump the UI drops the now-nonexistent branch of trend history and snaps gauge
  smoothing.

## M7 — Test Runner Layer (dev-only)

**File:** `layers/test_runner.js`
**Validation:** `node test/run_m7.js` → positive 31/31 integration checks across 6 suites, **plus** a
negative "teeth" test that sabotages HR1 (trips read true state) and confirms the protection-boundary
suite catches it (3 failures reported). Exit 0 only when both hold.

A synthetic operator driving the assembled stack through M5's command interface and reading the
broadcast snapshots — validating WIRING, not physics (accident sequences are not re-run, per §2/§4).
Suites: `data_contract`, `instrument_vs_truth`, `protection_boundary` (the two HR1 boundary checks —
highest value), `command_flow`, `alarm_behavior`, `config_consistency`.

### Decisions

- **Config access for §3.6 is sanctioned, true-state access is not.** Assertions read only the
  snapshot + command interface (no engine internals), **except** the config-consistency suite, which
  reads `service.layer.config` (protection data) and `service.engine.cfg.instruments` (instrument
  specs) — explicitly the spec's intent ("by reading the config"). The snapshot already carries
  `true_state` (HR4), so the protection-boundary checks compare truth vs indication from the snapshot.
- **"Trip warns first" is existence, not universality.** §3.6's "trip more extreme than the matching
  alarm" is checked as *there exists* a less-extreme same-instrument/direction alarm — because a
  critical `lo_lo` alarm legitimately **coincides** with the trip (e.g. PWR `pzr_pressure_lolo` 12.41
  MPa == the low-pressure trip). The `lo`-level warning is what must precede the trip. `__true_flow__`
  is exempt (no instrument-based alarm).
- **Built-in negative self-test.** `run_m7.js` monkey-patches `_evalTrips` to read true state and
  confirms the gate fails — a gate that can't fail proves nothing. (Lives in the harness, not the
  shipped TestRunner.)
- **Driving:** `advanceCycles`/`runSeconds` step the loop synchronously and read the returned/broadcast
  snapshot — deterministic, timer-free, exactly what the UI would see.

## M8 — User Interface (functional alpha, PWR)

**Files:** `ui/shell.html` (page) · `ui/app.js` (wiring) · `ui/shell.css` (look). Root `index.html`
forwards here. **Open `ui/shell.html`** in a browser — it loads the engine + layers and runs live.

**Status:** a **working control room wired to the live stack** (M1 + M4 + M5 + M6·PH). Started as a
static mock (commit `308b133`); now `app.js` builds a `SimulationService`, `subscribe(render)`s, renders
each snapshot, and issues commands. Alpha = PWR only + a few deliberate simplifications (below).

### What works
- **Gauges + numeric placeholder** read `snapshot.instruments` (HR1); needle/trend/sparkline live.
- **Controls issue real commands** down the stack: SCRAM (guard-cover + 3 s arm), rods (raise/stop/lower/
  ±1 nudge/speed), RCP (run=clear `rcp_trip` / stop=inject it), boron borate/dilute/off, ECCS `set_hpi`,
  heaters/spray, feed `set_feedwater_flow`, AFW `set_afw`, breaker/turbine `set_steam_demand`.
- **Alarms** render from `snapshot.alarms` (sorted critical-first, system-color bar + severity flash;
  click to acknowledge; gauge-strip tint while unacked). **Failures tab** built from M4's catalog with
  engineering-unit sliders; inject/clear reconcile off `active_failures` (never optimistic).
- **Strip chart**: live rolling buffer, **Graph-tab parameter toggles**, low-profile time x-axis,
  per-series auto-scale, window selector, CSV export. **Lifecycle**: play/pause, speed (1–3600×, FF
  badge), reset to a chosen initial state, save/load JSON. **Settings**: register (`set_register`),
  units (US↔SI display convert), true-state overlay (Instruments/True/Both).

### Decisions / deviations (alpha)
- **Layout fix (user):** Instructor and Tools boxes use `flex: 1 1 0` (basis 0), so switching tabs never
  resizes either box; overflowing tab content scrolls inside a fixed-height `.tab-body`.
- **Acceleration via the wired M5** uses fixed-dt step-count (Flag F6) — stable to 3600×.
- **Alarm category is UI-side** (`alarmCategory()` keyword map) for the left-bar color, because M1's alarm
  data carries no `category` (M8 §8.5 wants it in the profile). **→ new Flag F7.**
- **A few controls are approximations** of CONTEXT §6.7: RCP run/stop maps to clear/inject `rcp_trip`
  (no pump-start command exists); Heater/Spray/ECCS "Auto" are no-ops (the engine has no command to
  *clear* a manual override back to auto); boron borate/dilute drive charging/letdown. EDG is visual.
- **`ui/shell.html` is the entry** (self-contained, `../engines`/`../layers` paths). The §19 `diagram/`
  `panels/` split is deferred — alpha keeps markup in one page driven by `app.js`.
- **Alarm palette** (also used by Failures categories): reactivity `#C084FC`, coolant `#38BDF8`, power
  `#FBBF24`, instrument `#2DD4BF`, safety_system `#F472B6`.

### PWR learning board — data-driven synoptic (2026-07-20)

**Files:** `ui/diagram/board/` — `board_h.js` (React.createElement-compatible DOM hyperscript),
`std_pipe.js` (verbatim from the design project's `pipes.js`), `pwr_board_data.js` (the exported
`{grid,items,pipes}` diagram — generated by `tools/gen_board_data.js` from
`inbox/PWR_learning_diagram.json`), `components/*.js` (11 ported plant components), `pwr_board.js`
(renderer), `pwr_board_wiring.js` (`RD.PwrBoardDriver`). Design sources kept under
`inbox/design_import/`. Provenance + owner rulings in the `pwr-board-design-import` memory.

**What it is.** The final PWR learning diagram is authored in the Claude Design "PWR Reactor"
project (a diagram builder) and exported as data. This replaces the procedural
`ui/diagram/pwr_synoptic.js` as the sole PWR plant display; `app.js` now mounts `RD.PwrBoard` for
`plant_id === 'pwr'` (was `RD.PwrSynoptic`). Vital-few strip, alarms, strip chart, and instructor
shell are unchanged around it.

**Architecture.** The renderer is the design-agnostic half: it lays out item tiles (box / text /
button / value / number / scram / component), mounts each `component` from `RD.BoardComps`, then
DOM-scans `[data-port]` markers and routes pipes with the StdPipe kit — replicating the builder's
`scanPorts` + `gridNudge` (a sub-grid translate that lands pump/valve flange faces on grid lines)
and its flow-direction/paused rules exactly, so routes render where authored. `pwr_board_wiring.js`
is the only sim-aware half: it maps every named item to an engine command (`WIRING_REFERENCE.md`,
dumped from a live snapshot) and every indication to an instrument, converting SI→US (the board is
authored in psi/°F/gpm). Components are snapshot-driven with the internal toy-physics loops stripped;
all motion is CSS keyframes so the **pause freeze** (`metadata.running === false`) works by pausing
`animation-play-state`.

**Owner rulings (asked up front).** Full replace of the synoptic stage, keep the shell. **TRIP
BLOCKS** menu lists only the 4 blockable trips (`lo_press`, `lo_flow`, `ir_high`, `pr_low_setpoint`),
each permissive-gated (P-10 for the flux trips; low-pressure / low-power for the others). The
**Realistic** diagram-mode toggle is **disabled** — the realistic (quiet-board) diagram is not
designed yet. Every control must actually work; all did with existing engine commands (the letdown
orifice A/B/A+B selection is `set_letdown_orifices`, already in the engine).

**Deviations / notes.** (1) The turbine component gained a `tcv-drain` port the design never exposed,
so the authored turbine→condenser drain pipe resolves. (2) A few indications have no dedicated
instrument (AFW/HPI discharge pressure, AFW gpm) — shown as rated-when-active, derived, and flagged
in `WIRING_REFERENCE.md §GAPS`. (3) Boron control ON+target is a driver-side target-seeking loop
(engine exposes only a `set_boron_adjust` rate). (4) The condensate pump toggle is cosmetic (no
inventory model). (5) Rod WITHDRAW/INSERT are click-nudges (`rod_nudge ±4` at the selected S/M/F
speed) rather than press-and-hold. (6) Instructor highlight (`setTag`/`revealControl`) on the board
is a no-op stub for now — the shared highlight path still works, board highlight is future work.

**Verification.** `ui/test_panel/board_check.html` (headless Edge) — **24/24**: 144 items render,
53 ports scanned, 142 pipes resolve, driver covers every button/number/value/control-component, and
functional clicks confirm the engine responds (spray, heater, letdown orifices, generator mode,
charging pump, steam dump, load target, pressure setpoint, rod withdrawal, TRIP BLOCKS, full SCRAM).
Engine gates unregressed: PWR 31/31, e2e controls 30/30, M7 OK, campaign 51/51.

#### Follow-up (2026-07-20): real indications, condensate pump, boron-in-layer, glow

Closed the board's derived-indication gaps with real engine state, per owner request.

- **New instruments** (`afw_flow`, `afw_discharge_pressure`, `hpi_discharge_pressure`,
  `condensate_flow`) + status `condensate_pump_running`. AFW/HPI pump discharge pressures model head
  above the SG/RCS (shutoff when deadheaded, 0 idle); config params in `steam_generator` / `emergency`.
  **All four carry `noise:0` deliberately** — the instrument PRNG is a continuous cross-step stream,
  so a noise draw on an appended instrument shifts every downstream instrument's noise and silently
  moved two marginal campaign endpoints (pwr_boron, pwr_rod_auto tripped). Zero sigma skips the draw
  (`_gauss` early-returns), keeping the RNG byte-identical; lag stays. A general lesson for any future
  appended instrument.
- **Condensate pump** is a real actor: `set_condensate_pump {running}`; `stepSecondary` gates MAIN
  feed on it (AFW is a separate train, unaffected), so securing it collapses `condensate_flow`/
  `fw_flow`. Save-restore migrates old states to on.
- **Boron target-seeking moved out of the UI into the control layer.** New channel kind `conc`
  (`_stepConc` in control_kernel) + PWR channel `boron_conc`: bang-bang toward a `boron_analyzer`
  ppm setpoint via `set_boron_adjust`, needs the charging pump, drops to MAN on an operator
  `set_boron_adjust`. Board BORON ON/OFF → `set_auto_channel`; target ppm → `set_auto_setpoint`;
  setpoint read back from `automation.channels`. The old `afterRender` UI loop is deleted.
- **Instructor glow on the board.** `RD.PwrBoard.revealControl/setTag/highlightLabels` are now real:
  the driver holds a control-label→item map covering the same vocabulary as `RD.PwrSynoptic`
  `SYN_CONTROL_MAP` (so the run_campaign highlight gate still resolves), the renderer glows the
  resolved tile with `.instr-glow`, and `setTag` hangs a `.bd-maint-tag` over the AFW valve (TMI-2).
- **Checklist step-hover highlights (2026-07-24).** The same `revealControl` vocabulary now backs a
  *hover preview* on live checklists: mousing a `.ckl-step` glows every control **and indication** the
  step names, in a distinct green `.ckl-glow` (so a transient hover never wipes an active blue
  `.instr-glow` beat). Steps carry an explicit `hl: [...]` list; absent that, `stepHlLabels` falls back
  to the step's `control` string. `CONTROL_LABEL_MAP` gained an **indication** block (Reactivity,
  Startup Rate, Tavg, Plant Pressure, SG Level, Source/Intermediate Range, `1/M Plot Tool`) plus
  control aliases for the heatup checklist's `control` strings. These are board-only additions (not
  campaign-beat labels), so no `SYN_CONTROL_MAP` parity is required. `pwr_startup` was rebuilt around
  the 1/M plot (8→12 steps; SR→IR handoff sequenced so P-6 is satisfied and the 1e5 SR trip is never
  approached — probed engine-direct and through SimulationService). The Procedures (live) picker now
  collapses each card's steps into a `<details>` so it reads as a menu (`.m-step` DOM still emitted for
  `verify_manual_follow`). See `Diagnostic/TUNING_LOG.md` 2026-07-24.
- **Turbine RPM:** 1800 rpm at 100 % is correct for a ~1000 MWe PWR (half-speed, 4-pole generator —
  wet LP steam needs long last-stage blades that can't take 3600 rpm). Engine already rated 1800; the
  board shows it live (the design's "3600" was a placeholder). No change.

Verification: board_check **37/37** (adds glow, boron-channel, condensate, real-discharge checks);
gates green — PWR 31/31, e2e 30/30, autoctl 20/20, campaign 51/51, M4 18/18, M5 19/19, M6 16/16, M7 OK.

#### Follow-up (2026-07-20): visual fidelity fixes (owner review of the render)

- **Inactive buttons render grey.** The diagram's authored button color is its ACTIVE-state
  color; buttons now render grey when inactive and adopt `--bd-color` (the authored color) when
  selected (`.bd-active`) or momentarily pressed (`:active`).
- **PORV sizing.** The PORV component rendered at a fixed 90×195 px (copied literally from the
  design), overflowing its 45×70 tile and putting its ports ~60 px low — the cause of the bent PORV
  pipes. Now fills the tile like every other component (`width/height:100%`, `preserveAspectRatio
  meet`), so the item box sets its size and the ports land where the builder placed them.
- **All pumps render art-only (crooked pipes).** A pump with `showControls:true` reserves control
  space (taller viewBox), which shifts the pump art — and its ports — up and bends the connected
  pipes. Owner ruling: **no pump has its own toggle; every pump control is a separate button/panel.**
  So all five pumps render **art-only** (driver `suppressBuiltInControls`), which straightens the
  pipes. Controls: RCP → on-pump ON/OFF buttons (rewired `set_charging_pump` → `set_rcp`); ECCS →
  HPI START/STOP/AUTO panel; feed → SG FEED panel; charging → CHARGING panel (**OFF = charging pump
  off**; AUTO/MAN run the pump in auto make-up / manual charging); condensate → no control (always
  running — the owner confirmed it doesn't need operating; the engine still models it, so a
  `set_condensate_pump` command from a scenario still collapses main feed).
- **Turbine drain removed.** The exported diagram carried a `turbineGenerator/tcv-drain →
  condenser/steam-in-2` line for a port the turbine never had; a real casing drain isn't modeled and
  the owner confirmed it's unnecessary, so `tools/gen_board_data.js` drops that pipe (29 pipes now)
  and the invented drain port is removed from the turbine component.

Verification: board_check **41/41**; engine/control untouched this round.

## Change log

- **M1** built and committed (`a18c85f`). Suite 11/11.
- **M3** built. Suite **9/9 · 47 checks** (`node test/run_bwr.js`, browser `test_bwr.html`).
  Flow-controlled BWR with negative void feedback; vessel/boiling/recirc TH; the steam-driven
  safety systems (RCIC/HPCI/ADS/LPCI) + the SBO battery timer; the **Fukushima** flagship runs the
  full hold-then-uncover timeline (RCIC holds ~8 h, uncovery ~3 h after battery depletion, damage)
  vs the ADS+LPCI intervention (core saved) — the comparison. Needed an **implicit prompt term**
  (Λ=5e-5 → explicit Euler unstable at 0.02 s; resolves F6) and a faster ADS + lower vessel-pressure
  gain so depressurization beats decay steam. **Physics layer complete — all three engines proven**
  (PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47, all re-confirmed green).
- **M2** built. Suite **18/18 · 99 checks**, both versions (`node test/run_rbmk.js`, browser
  `test_rbmk.html`). Two versions in one engine via `design_version`; reuses the F1 excess/pinned-
  reference pattern (and extends it to `void_ref`, which proved load-bearing for low-power
  stability). Accident co-tuned: pre crosses prompt critical via the displacer + amplified void →
  **steam explosion**; post shuts down safely; full-power maneuvering stable. PWR suite re-confirmed
  green (11/11 · 51 — no shared code touched). **F1 resolved**, **F6** confirmed for M2.
- **M4** built and committed (`1ae7245`). Smoke 10/10. Added `category` to PWR failure data;
  M1 suite re-confirmed green after the edit.
- **This file** created after M1+M4 to capture the above; keep updating per "How to maintain".
- **M5** built. Smoke 12/12. Fixed-dt step-count acceleration (Flag F6); default pass-through
  Instructor slot; full stack (engine ↔ M4 ↔ instructor) runs end to end. M1/M4 re-confirmed green.
- **M6·PH** built. Tests 8/8. Real pass-through Instructor module in the slot; M5 aligned to the
  `setRegister` interface and prefers `RD.InstructorLayer`. Swap-invariant confirmed (free-play
  unchanged). All four suites (M1/M4/M5/M6·PH) green.
- **M6 alpha + steps 5–6** built (beat engine per `M6_instructor.md`, Path 2 follow with strict
  gating + instrument-first grading, `pwr_tmi` flagship both branches validated headless, M5
  rewind ring with full/world scopes, snapshot instructor-block extensions
  (ui_policy/highlight/follow/level_complete), highlight rendering with the F8 auto-reveal on both
  control mechanisms, the prompted first-run Hook (`pwr_hook`), Training-tab scenario picker +
  walkthrough list, `rd_progress` persistence, `?scenario=` deep link). New gates:
  `test/run_m6.js` 16/16 · `test/run_scenarios.js` 3/3. All prior gates green, `run_m6ph.js`
  untouched (swap invariant holds). **Flag F8 resolved.** See the M6 section above.
- **M6 player-review fixes** (post-build review): `start_follow` resets to the procedure's
  `from` state (kills trivially-completable walkthroughs); beat `speed` field for
  instructor-driven fast-forward with automatic drop-out at set points (TMI uses it through both
  slow phases); sandbox rewind — periodic free-play checkpoints (15 sim-s) + a pick-a-moment
  picker on the strip chart (⏪ on the scrubber, markers on the plot, click to jump). UI follow
  state now derives from the snapshot (fixes a mid-reset race). Gates: run_m6 16/16 (94 checks),
  run_m5 17/17, run_scenarios 3/3, all others green.
- **PWR startup-forgiveness tuning pass** (user report: "too touchy — pull rods halfway, nothing,
  then runaway + scram"). Diagnosis confirmed by trace: (1) NO neutron source — a subcritical
  core showed nothing (power decayed 1e-4→1e-7 %) until well past critical, and SUR was floored
  at 0.1% power, so the first visible sign was a 2$-supercritical excursion; (2) the SG thermal
  load was a BINARY gate — 0 below 1% power, full rated coupling above — so crossing the point of
  adding heat slammed a rated-capacity heat sink onto a 2% core (5 °C quench → pressurizer
  drained → `pzr_level low` trip: the "booby-trapped startup"). Fixes, all [tune]/data:
  **M1 physics** — constant neutron source (`kinetics.source = 1e-6`, P_eq = S·Λ/(−ρ): the
  approach to criticality is now visible 1/M behavior, SUR live from the first rod steps);
  SUR/period floor lowered to source range (1e-6 %); subcritical precursors initialized at
  source equilibrium; SG coupling is now pure h·ΔT with the secondary finding its natural
  NO-LOAD equilibrium (steam dump setpoint moved to the no-load pressure 8.90 MPa ≈
  Psat(no-load Tavg) with a 0.25 MPa band — the real steam-dump-in-pressure-mode behavior);
  hot-standby init made self-consistent (tavg = tcold = thot = Tsat(dump setpoint), sgP =
  setpoint → zero reset drift); `startup_rate` instrument added (lag 2 s, appended last —
  PRNG order preserved; instruments steam_pressure range → 10.5). **M4 data** — `sur_high`
  caution alarm (1.0 DPM) + rod-withdrawal interlock (≥ 1.5 DPM, clears < 0.8; see M4 C9/C10).
  **Outcome (traced):** attentive pull → SUR builds smoothly, release at 1 DPM while still
  −265 pcm subcritical, core settles gently; hands-off continuous pull → withdrawal blocked at
  +343 pcm (0.53 $), Doppler rolls the rise over, plant SELF-STABILIZES at ~29% power, and the
  only eventual trip is the honest `sg_level low` (nobody fed the boiling SG). Engine suite
  12/12 UNCHANGED, procedures 21/21, TMI/Hook 3/3, M7 protection boundary green;
  `gen_manual_reference` re-run (PWR 23 alarms). Note: RBMK/BWR startups still lack a source
  term — same treatment is a candidate follow-up.
- **RBMK + BWR startup-forgiveness pass** (the PWR recipe applied; user-approved follow-up).
  **M2** — `kinetics.source = 6e-4` (subcritical floor ~5e-5/3e-5 rated at the pre/post rod
  margins; ρ-shift ≤ 0.4 pcm even at `low_power_xenon`, so the Chernobyl preconditions are
  untouched); source enters the delayed branch only (never the prompt fast-path); hot_startup
  settles kinetics on the source equilibrium (P = S·Λ/(−ρ), precursors matched, decay preloaded
  ×0.07 recent-shutdown) — no reset free-fall; SUR floor → source range; `startup_rate`
  instrument (appended last, PRNG order preserved) + `sur_high` caution alarm (3.0 DPM) +
  rod-withdrawal interlock at **4.0 DPM / clears 2.5** — deliberately less protective than the
  PWR's 2.5/1.5: the RBMK's instability is curriculum, and in the continuous-pull trace the
  void feedback still drives ρ past the rod stop (its character intact) with the trip ending it.
  **Latent bug found & fixed:** the pre-1986 `power_range high 120%` trip could NEVER fire —
  the instrument range capped at exactly 120, and a pegged reading never strictly crosses the
  setpoint. Range → [0, 200]; the trip now catches the startup excursion at ~176%.
  **M3** — `kinetics.source = 4e-3` with a **fade above ~1% power** (`×max(0, 1 − P/0.05)`):
  the BWR's tiny Λ (5e-5) means a source big enough for a useful floor otherwise pushes
  full-power operation (+11% drift observed) — physically the source is swamped by fission at
  power, a scale separation the normalized lumped model can't express with a constant. Source
  enters the implicit prompt-jump form alongside ΣλC. Same equilibrium settle + decay preload;
  SUR floor → source range. **Latent bug found & fixed:** hot_startup seeded a phantom 2%
  TURBINE STEAM DRAW (from the config's placeholder power) against ~0.5% decay boiloff — the
  vessel depressurized into the 5.52 MPa low-pressure scram in ~2 minutes, punishing exactly
  the careful player who paused the approach. The subcritical settle now parks the turbine
  offline (no draw, no feed), and the state holds indefinitely. No BWR interlock — the negative
  void coefficient already self-limits (rods fully out from hot_startup settles at ~48% power).
  **Traced outcomes:** all three attentive pulls now show stable 1/M multiplication (release →
  power settles at a HIGHER stable level, no decay-death, no trip); RBMK continuous pulls are
  rod-blocked then either self-stabilize (~47-58%) or trip properly on the fixed flux trip
  (pre, ~176%); BWR continuous self-stabilizes at ~48%, no trip. Gates: PWR 12/12 · RBMK 23/23 ·
  BWR 12/12 all UNCHANGED, procedures 21/21, all 13 gates green; `gen_manual_reference` re-run
  (RBMK 12 alarms / 11 indications).
- **M7** built. Positive 31/31 integration checks + negative teeth test (sabotaged HR1 → caught).
  Validates the assembled stack's wiring through M5's interface. All five suites (M1/M4/M5/M6·PH/M7)
  green. Physics gate (M1) + wiring gate (M7) both pass → the PWR system is correct per CONTEXT §9.
- **M8 visual shell** (`308b133`): static mock-data prototype for layout iteration.
- **M8 functional alpha**: wired `ui/app.js` to the live stack — gauges/numeric read instruments,
  controls issue commands, alarms/instructor/strip-chart render from snapshots; Graph-tab param toggles,
  low-profile x-axis, units/register/overlay, failures, save/load/reset. Tab switching no longer resizes
  the Instructor/Tools split (flex-basis 0 + scroll). New Flag F7 (alarm category belongs in profile).
  Engine/layer suites unaffected (all five green); UI field-contract spot-checked against a live snapshot.
- **Broadcast cadence raised** to 10 Hz normal / 20 Hz transient (was 2 Hz / 5 Hz) for a smoother live
  UI — cheap, data identical. Transient thresholds scaled by interval (constant rate sensitivity). Added
  CSS tween on gauge needles + rod bars so they glide between frames. M5 cadence tests made
  cadence-agnostic. (CONTEXT §4's 2/5 Hz is the *minimum* viable cadence; rendering faster is a display
  choice that doesn't touch determinism.)
- **M8 quiet-board redesign pass (user, responsive + control-room HF):** based on the "dark/quiet
  board" philosophy (EPRI 1003662, NUREG-0700, ISA-18.2) — mute the normal, surface the abnormal.
  - **Equal-width control panels (the "Reactor Core too wide" bug):** `.control-sections` was
    `repeat(4, 1fr)` = `repeat(4, minmax(auto,1fr))`; the dense rod cluster's intrinsic width refused
    to shrink and stole space. Fixed to `repeat(4, minmax(0,1fr))` + `.section{min-width:0}` + wrap on
    `.ctl-row`. Now genuinely equal regardless of content.
  - **Responsive:** dropped the `.plant-area{min-width:760px}` floor at ≤1200px (it forced horizontal
    scroll on mid-size monitors); gauge strip wraps; stacked column fallback at ≤860px. No media
    queries existed before.
  - **Controls-only panels:** stripped all five embedded readouts (control/shutdown bank steps, boron,
    feed %, turbine MW) out of the panels — every one already exists in the diagram numeric grid, so no
    info lost. `renderControls()` reduced to the SCRAM button + alarm tint. Rod position bars removed
    from the panel (position still shown as steps in the numeric grid; can relocate a visual bar into
    the diagram block if wanted).
  - **Sidebar cards focus model:** instructor + tools are now expand/collapse cards — exactly one
    expanded at a time. Collapsed instructor shows only its latest message; collapsed tools shows only
    its tab strip (clicking a tab expands+selects). Clicking the supervisor header focuses it; a new
    instructor message auto-pops it open. Replaces the old fixed 50/50 `flex:1 1 0` split.
  - **Reactivity (user decision: "SUR on board + reactimeter tool"):** real PWRs have NO direct ρ gauge
    (high-confidence research finding) — operators infer reactivity from neutron-flux trends. Engine
    `getTrueState()` now exposes `reactivity_pcm` (= `_rho`·1e5), `startup_rate_dpm` (= 26.06·Ṗ/P) and
    `reactor_period_s` (= P/Ṗ). Added a **Startup Rate** gauge to the vital bar (the authentic operator
    proxy) and an explicitly-labeled **Reactivity Computer** (reactimeter, pcm/SUR/period) in the
    Training tab — framed as a reactor-engineering tool, NOT a board gauge.
  - **Quiet-board color (hybrid):** running/normal status muted (new `--running-muted` teal) so a calm
    board reads "all normal"; amber caution and saturated/flashing red (alarms/trips) kept fully
    salient. Applied to `.seg button.on.run` and numeric `bool-on`.
  - All engine/wiring suites re-confirmed green (PWR 11/11·51, M7 31/31 + teeth). Snapshot contract is
    additive (three new `true_state` fields), so M7's data-contract suite is unaffected.
- **Redesign follow-up (user):** (1) **Rod-position bars relocated into the diagram block** — a
  `.rod-position` strip atop the synoptic shows both banks (bar + step readout); the duplicate Control
  Bank/Shutdown Bank text rows were removed from the numeric grid. Keeps panels controls-only while
  restoring the at-a-glance rod visual as *information* in the diagram. (2) **Color muting pushed
  further:** generic selected `.seg button.on` cyan → muted teal-slate; gauge-band normal zone and rod
  fills → muted; caution-amber and trip-red stay salient.
- **Quiet-board palette pass + A/B layout harness (`develop` branch).** Per a user concept scan,
  retuned the M8 §15 palette toward a stricter quiet board: near-black backgrounds
  (`--bg-plant #0E1216`, body `#070A0C`), muted-by-default text, and color spent only on the
  abnormal. Control toggles became **outline chips** (`.seg button.on` = thin ring, not a filled
  block); **green = energized/armed** (`.on.run`: RCP run, feed start, breaker closed, and now the
  AUTO/armed states for ECCS / PZR heaters / spray), **amber = caution**, **red = alarm/trip** only.
  Speed selector de-saturated to a cyan outline (the clock still goes amber on time-accel).
  - **Diagram vertical-shrink fix shipped as two switchable variants** (so the user can A/B live
    before we commit): the synoptic was the lone `flex:1` shock-absorber in the plant column and got
    crushed by greedy neighbors (gauge-strip wrap, `bottom-row 30%`, control `min-height:150`) plus
    the relocated rod-position strip. **Layout A "Fit"** rebalances the budget (one-row gauges,
    shorter panels, `synoptic flex:2 min-height:260`, trimmed bottom row) — fits the window, clips on
    very short screens. **Layout B "Fixed"** implements M8 §2.2 (plant area holds `min-height:768`,
    `.app` scrolls instead of squishing) — synoptic always full height. Selected by a class on `.app`.
  - **A, B, and C all rejected (user) and REMOVED** — the whole variant harness (Dev-tab dropdown,
    `.layout-*` CSS, `applyVariant`/localStorage) is gone. A/B only reshuffled the vertical budget; C
    compacted the cards but still wasn't skinny enough, because four side-by-side sections are tall by
    construction.
  - **Final: TABBED CONTROL STRIP (`.control-strip`).** The four sections are stacked behind a tab bar
    (`#ctlTabs`, panes `.ctl-pane[data-cpane]`); only one shows at a time, its controls laid out as
    label-over-control groups (`.cg`) flowing horizontally across the **full** strip width. The band
    drops to ~one row (~95 px), giving the synoptic (`min-height:280`) and the chart/alarm row room
    without scroll or squish. **Deviates from M8 §5** ("always visible — not tabs, not collapsible") —
    a deliberate, user-directed HMI change. **→ Flag F8.** The Dev tab itself stays (placeholder for
    future dev tools); the §15 quiet-board palette and green-armed AUTO chips from this pass remain.
  - **New "Dev" tab** in the Tools Block (§10, dev-only surface) hosting the first dev tool: a **UI
    Layout (A/B) dropdown** (`#uiVariant`) that swaps the layout class and persists to `localStorage`
    (`rd_ui_variant`, guarded for `file://` storage blocks). Restored before first paint in `init()`.
  - All five suites (PWR/M4/M5/M6·PH/M7) re-confirmed green — UI-only change, no stack contact.
- **Rod banks relocated + display damping (user feedback, `develop`).**
  - **Rod-bank bars moved under the Reactor/Core numeric column** (was a full-width strip across the
    top of the synoptic). `buildNumeric()` appends a compact `.rod-mini` block (label + step readout
    over a thin bar) to column 0; same ids (`rodControlFill`/`Limit`/`Readout`, `rodShutdownFill`/
    `Readout`) so `renderRodBars()` is unchanged. Also reclaims ~70 px of vertical space in the diagram.
  - **Display damping for instrument jitter.** User noticed gauges/numbers/chart jump every frame —
    correctly identified as the instrument noise (`pwr_config` noise sigmas, re-randomized each step
    and shown at the 10–20 Hz broadcast cadence). The noise STAYS in the data (HR1 — a stuck/failed
    instrument must still mislead; trips/alarms read the raw reading engine-side). The UI now damps only
    the **displayed** value with a per-frame EMA (`DISPLAY_DAMP_K = 0.18`), exactly like real indicator
    needle-damping / digital filtering. Done in `dampInstruments()` at the top of `render()`, into a
    **copy** of `s.instruments` (which aliases the engine's live reading object — must not mutate;
    would corrupt engine state and saves). Skipped at ≥60× (signal then outruns the noise; damping
    would only lag). Reset on reset/load. Gauges, numeric grid, and strip chart all calm as a result.
- **SCRAM pulled into its own always-visible box (user).** With the controls now tabbed (Flag F8),
  SCRAM would vanish on non-Reactor tabs — unacceptable for an emergency control. Moved it out of the
  reactor pane into a dedicated `.scram-box` pinned to the **right edge of the control strip**
  (`.control-strip` is now `flex-direction:row` → `.ctl-main` tabs/panes + `.scram-box`), so it's
  reachable from any tab. New quiet-board color states: cover-down = **dull green** stripes (calm,
  armed/ready); cover lifted = **dull red** exposed button; **scrammed (manual or auto) = bright-red
  flashing** via a `.scram-wrap.scrammed` class (forces the indicator visible regardless of cover
  state) + `scram-flash` keyframes. Cover lift/3 s-arm/timeout behavior unchanged.
- **"Color is reserved" palette pass (user directive).** The board was equally bright everywhere, so
  an alarm had nowhere louder to go. Reworked so DIM is the resting state and color = status:
  - **Vital gauges:** value is dim blue-white `#a8b8c8` over dim labels `#4a5a6a` at rest; the renderer
    adds `.warn` (amber) / `.alarm` (red + `gauge-alarm-flash`) from each gauge's own
    `caution`/`danger` config thresholds (not hardcoded; gauges without thresholds stay dim). Sparkline
    muted to `#56657a`.
  - **SCRAM guard cover:** now nearly invisible at rest (dark `#10151a` bg, dim-green border/text) — no
    siren — and only the *fired* state is the bright-red flash (unchanged).
  - **Strip-chart traces:** recolored to muted, hue-distinct TRACKING tones (amber/blue/steel/purple/
    violet/green/olive). A trace **brightens + thickens when its parameter hits alarm** (`seriesAlarmed`
    reuses the mapped vital gauge's `danger` threshold; `lighten()` pulls the muted hue toward white) —
    the contrast against the calm baseline is the signal.
  - **Failure category pills:** dropped the saturated fills for low-saturation tinted backgrounds +
    brighter hue text (they classify, they don't warn).
  - **Diagram header decluttered:** removed the Education/Realistic and Instruments/True/Both segs from
    the synoptic header; both remain under the Settings tab (the diagram one was `overlaySeg`; Settings
    keeps `overlaySeg2`, bindUI tolerates the missing id).
  - Alarm annunciator left as the (user-approved) dark-at-rest list; the four-state lifecycle styling is
    already in place. All five suites green (UI-only).
- **Legibility + info-hierarchy pass (user).**
  - **Vital strip trimmed to the six headline gauges** (Reactor Power, Primary Pressure, Tavg, PZR
    Level, SG Level, Subcool) — the parameters scanned continuously. **Startup Rate** moved to the
    diagram's Reactor/Core column and **Grid Match** to the Turbine/Condenser column (both secondary:
    SUR matters mainly on transients, Grid Match is a turbine/grid metric). Fewer gauges also lets the
    strip breathe / read bigger.
  - **Bigger text where it counts:** diagram numeric grid 12→13 px (headers 11→12, rod readout 11→12);
    control-strip controls up (seg/btn 12 px, tabs 12 px, num-inputs 12 px, labels 11 px). General text
    palette nudged a touch brighter (`--text` `#E4E9EE`, `--text-2` `#98A3AF`, `--muted` `#69757F`);
    gauge dim value/label brightened slightly (`#b6c4d2` / `#5a6b7c`) while staying recessed.
  - **Control strip now uniform height across tabs:** `.ctl-pane` is `flex-wrap:nowrap` + `min-height`
    + vertically centered, so every section renders as one same-height row (overflow scrolls
    horizontally rather than growing the strip) — switching tabs no longer resizes the strip.
- **Strip-chart legibility + chrome (user).** (1) Legend now doubles as a **minimal, color-coded
  per-parameter scale** — each entry shows the trace label + its plot range `[min–max]` in the trace's
  own color (interpretation of "color-coded x-axis for each parameter"; ranges are the native plot
  scale). (2) The three horizontal gridlines made **hairline + non-scaling** (`stroke-width:0.5`,
  `vector-effect:non-scaling-stroke`, dim `#1b1f25`) so they stop competing with the parameter traces;
  traces also got `non-scaling-stroke` for crisp, consistent weight under the stretched viewBox.
  (3) Removed the **Elapsed** row from the Sim tab (the top-bar clock already shows sim time; dropped
  the `simElapsed` render line too). (4) Top-right logo **spelled out** "Reactor⚛️Dynamics" (was R⚛️D).
- **Two alpha-feedback fixes:** (1) decay heat now tracks power + is pre-loaded (see M1 modeling
  decisions) so an operating reactor shows ~7%, not 0. (2) Strip-chart bug: `getInstruments()` returns
  the engine's *live, mutated* reading object, so the chart was buffering one shared reference (every
  point showed the latest value). The UI now copies instrument values into the buffer and plots each
  series against a fixed range (auto-scaling had amplified steady-state noise to full height).
- **Quiet-board color refactor as a swappable A/B variant (user, `develop`).** Per a supplied
  color-refactor spec ("color is reserved exclusively for deviation from normal"), added a **Dev-tab
  dropdown** (`#uiVariant`, Current ↔ "Quiet Board (new)") that swaps a `variant-quiet` class on
  `.app`; persisted to `localStorage` (`rd_ui_variant`, guarded for `file://`), with a `?variant=`
  URL override for sharing/screenshots. **This re-introduces a Dev-tab variant selector** (the layout
  A/B harness was removed earlier — Flag F8 changelog); this one swaps *color treatment*, not layout.
  Selecting "Current" applies zero overrides, so the existing board is untouched — true A/B. The new
  variant implements the spec's six changes, almost entirely as CSS scoped under `.app.variant-quiet`
  plus three small JS hooks:
  - **(1) gauge bars** — the rainbow gradient track becomes a single dim track (`--bar-track-normal`);
    a colored fill (`g-fill`, set in `renderGauges`) appears to the needle *only* in a warn/alarm band.
    **(2) status words** — `classifyBool()` switches to `quietBoolClass()` in quiet mode: normal
    (closed/running/no/off/standby) → dim `--clr-status-normal` (no more green), abnormal
    (open/stopped/yes) → red, off-normal-but-not-failed (HPI active / AFW on) → amber. **(4) traces** —
    each `SERIES` gained a `qcolor` (the spec `--trace-*` muted palette); `traceColor()` picks per
    variant for the chart, legend, and Graph-tab swatches. **(3) SCRAM**, **(5) value text**,
    **(6) card tint**, and trend-arrow coloring are pure CSS keyed off the existing `.gauge.warn/.alarm`
    classes (same logic that already drove value-text color — so the deviation path is the proven one).
  - Deliberately **not** done: the transient green-on-clear flash (spec's `--status-cleared`, lower
    priority — the load-bearing rule "never green for currently-fine" is satisfied); the failure
    category pills (spec marks them a separate task / DO NOT CHANGE). Verified by headless-Chrome
    screenshots of both variants (quiet board reads calm at steady state; SCRAM fired → bright-red
    flash). Engine/layer suites untouched (UI-only).
- **Quiet board kept, A/B harness removed; multi-plant UI + layout/graph upgrades (user, `develop`).**
  After approving the quiet board, the user asked to drop the old look and keep quiet only — so the
  `variant-quiet` scoping was unscoped into the base rules, the Dev-tab variant dropdown / `localStorage`
  / `?variant=` override were removed, and `boolClass()` now always returns the quiet `q-*` classes
  (the old rainbow `.g-band` gradient and green `.nv.bool-on` are gone). The board is quiet-only.
  - **Multi-plant, data-driven UI.** `app.js` was refactored from PWR-hardcoded to a `PROFILES`
    table (pwr / rbmk / bwr) supplying each plant's gauges, numeric grid, strip-chart series, and
    **controls** (the tabbed control strip is now built from the profile, not static HTML). An
    **engine dropdown in the Sim tab** (`#engineSel`: PWR · RBMK pre-1986 · RBMK post-1986 · BWR)
    calls `switchEngine()` → `service.selectPlant(plant, init, design_version)` and rebuilds every
    plant-specific surface (gauges/numeric/controls/series/initial-states/failures). The M5 engine
    registry + per-plant M4 rebuild already supported this; the UI just drives it. RBMK pre/post are
    one plant with two `design_version`s. A `?engine=` URL override mirrors the old `?variant=` for
    testing/sharing. Verified by headless screenshots of all three plants (correct gauges, numeric,
    controls, and per-plant failure catalogs; AZ-5 label on the RBMK scram).
  - **Per-plant indications/controls** map to each contract: RBMK gets the ORM gauge + Reactivity/ORM
    column + MCP-flow/EPS-bypass controls; BWR gets vessel level/pressure + the RCIC/HPCI/ADS/LPCI
    safety-system column and controls + battery. Rod commands are uniform across plants (+withdraw /
    −insert), so one set of rod acts serves all three. `scram` works for all (the RBMK accepts it as
    AZ-5). Gauge state logic gained **low-side** thresholds (`caution_lo`/`danger_lo`) for level/ORM,
    and a display multiplier (`mul`) for void.
  - **Layout:** the diagram block (`.synoptic`) is now **fixed height** (`flex:0 0 340px`) and the
    chart/alarm strip (`.bottom-row`) **stretches** to fill the slack (was the reverse).
  - **Graph:** horizontal gridlines darkened to near-background (`#0f1217`) so they recede; added
    **live floating value labels** at the right edge — one per active trace, color-coded to the line,
    positioned at the line's current y and **collision-spread** (min-gap pass + overflow push-up) so
    they never overlap. Rendered as an HTML overlay (`.chart-floats`) over a new `.chart-plot` wrapper
    (the SVG viewBox is stretched, so SVG text would distort). Engine/layer suites re-confirmed green
    (UI-only; PWR 11/11, RBMK 18/18, BWR 9/9).
- **Improvement-punchlist pass (user, `develop`).** Worked the supplied punchlist; status by group:
  - **Group A (quiet-board color)** was already implemented in the prior two passes (A1 status words,
    A2 single-track gauge bars, A3 muted traces, A5 trend arrows, A6 value text, A7 card tint). Only
    **A4** needed alignment — the SCRAM fired state now uses the spec palette exactly (`#1a0600` /
    `#b03020` / `#e04020`, `0.5 s step-end` opacity flash). **E2** (grey the Startup-Rate row to
    near-invisible when `|SUR|<0.01` — no info at power) and **E4** (desaturated failure-category
    pills, the exact spec hexes) also done.
  - **B1 · PWR PORV block valve** (closed-loop gap, the key TMI recovery). **Engine extension:**
    `pwr_pressurizer.relief()` gates all PORV flow on a new `block_valve_open` state (default open);
    closing it zeroes relief AND inventory loss even while the PORV is stuck open. New commands
    `open_block_valve` / `close_block_valve`; `porv_block_open` in `control_state`. UI control on the
    Primary Inventory tab + a `PORV Block Valve` indication. Verified: stuck-PORV `porv_flow` 0.0025 →
    0 on isolate, inventory stops falling. PWR suite still 11/11·51.
  - **D1 · BWR Standby Liquid Control** (HIGH-priority ATWS mitigation). **Engine extension:** a
    negative reactivity term `ρ_slc = −slc_worth·slc_injected` (worth 0.09) that ramps in (`slc_ramp_tau`)
    and drains the tank; shuts the reactor down independently of the rods. New commands `initiate_slc`
    / `stop_slc`; `slc_active`/`slc_tank_pct` in `true_state`+`control_state`. UI control on Safety
    Systems + `SLC` / `SLC Tank` indications. Verified: with `failure_to_scram` active (rods stay
    withdrawn at 148 steps), SLC drives power 100 % → 0.2 %. BWR suite still 9/9·47.
  - **C1 · RBMK AZ-5 positive scram effect — VERIFIED MODELED (no change).** The graphite-displacer
    positive spike IS the centerpiece of M2 (`k_disp=0.05`, `rho_displacer_pre`); from `low_power_xenon`
    the AZ-5 insertion drives ρ from 0 to ~+0.017 (≈ 2.6 β) before the absorber arrives — squarely in
    the punchlist's "~+2–3 β" — and is what makes the pre-1986 flagship excurse. Confirmed, not broken.
  - **Command-contract extension note.** `open_block_valve`/`close_block_valve` (PWR) and
    `initiate_slc`/`stop_slc` (BWR) are **new commands beyond CONTEXT §6.7** — added because the
    punchlist explicitly requested the controls and the §6.7 set lacked them. Additive only (defaults
    leave existing behavior unchanged; all suites green). Fold into §6.7 when the blueprint is updated.
    **RESOLVED — folded into CONTEXT §6.7 + M1/M3 (see "Blueprint reconciliation" entry below).**
  - **DEFERRED TO v2 (user decision).** **B4** containment pressure, **D2** suppression-pool (torus)
    temp, **D3** torus level, **D5** drywell pressure all require a containment / suppression-pool model
    that **CONTEXT §8 explicitly excludes** ("No containment model … described in commentary, not
    modeled"). Faking static gauges would violate the honesty principle; the user chose to defer these
    to v2 rather than expand v1 scope.
  - **B2 / D4 / D6 done (closed-loop controls, user "do these first").**
    - **B2 · PWR steam dump / turbine bypass.** `pwr_steam_generator.stepSecondary` adds a dump path
      that vents steam to the condenser (extra steam-out in the pressure + level balance): **Auto**
      opens proportionally above `steam_dump_setpoint` (6.0 MPa) — a basic relief-to-condenser, the
      same class as the allowed pzr heater/spray auto-control — with a manual override. New command
      `set_steam_dump {mode:auto|open|closed | pct}`; `steam_dump_pct`/`steam_dump_auto` in
      `control_state`. UI on Turbine & Grid + indication. Verified: after a turbine trip, auto dump caps
      SG pressure at ~6.4 MPa vs ~12.2 MPa with the dump closed.
    - **D4 · BWR Core Spray (LPCS).** Mirrors LPCI — injects below `lpci_threshold_pressure`; `lpcs_flow`
      added to the vessel level balance. Command `start_lpcs`/`stop_lpcs`; `lpcs_running` in the contract.
    - **D6 · BWR manual SRV.** Operator-opened controlled depressurization (`srv_manual_tau=150 s` —
      slower than ADS's 120 s but fast enough to out-vent the decay steam below the 1.03 MPa injection
      window). Commands `open_srv_manual`/`close_srv_manual`; `srv_manual_open` in the contract.
      Verified end-to-end: with HPCI unavailable after RCIC fails, **manual SRV → LPCS** depressurizes
      to 0.82 MPa, LPCS engages, and the core is saved — a second, operator-driven Fukushima recovery
      path alongside ADS+LPCI. All suites still green (PWR 11/11, BWR 9/9, RBMK 18/18).
    - These add more commands beyond §6.7 (`set_steam_dump`, `start_lpcs`/`stop_lpcs`,
      `open_srv_manual`/`close_srv_manual`) — additive, defaults inert; fold into §6.7 on the next
      blueprint update. **RESOLVED — folded into CONTEXT §6.7 + M1/M3 (see "Blueprint reconciliation"
      entry below).**
  - **STILL queued (feasible, not yet done).** B3 MSIV, C2 per-trip EPS-bypass granularity, E1 ISA-18.1
    "cleared-unacknowledged" alarm state (M4 lifecycle), and UI-only E3 CSF sublabels, C3 MCP-count
    indicator (engine tracks `mcp_running` bool, not a count — would be an approximation), C4 AR-mode
    indicator (v1 is manual-only; §8 excludes auto-control).
- **Plant-Display layout — a second swappable UI variant (user spec, `develop`).** Per the "Plant
  Display Redesign" spec, added a Dev-tab **UI Layout** selector (`#uiLayout`: "Control Room (current)"
  ↔ "Plant Display (new)") that toggles a `layout-plantdisplay`/`layout-classic` class on `.app`;
  persisted to `localStorage` (`rd_ui_layout`), with a `?layout=` URL override. The classic board is
  untouched under `layout-classic`. The new layout keeps the CSF gauge bar, strip chart, alarm panel,
  and right sidebar, and replaces the tabbed control strip + synoptic table with:
  - **System Status Bar** — per-plant fixed slots (4 states: normal dim / running green / caution amber
    / alarm red-flash) with badges and group separators, rebuilt on engine switch; a right-aligned
    `SCRAMMED` badge. **ECCS/AFW auto-actuation reads ALARM (red) until the operator acknowledges it**
    (click the slot → green) or RUNNING immediately if operator-initiated (`ui.pdAck`/`ui.pdOp`).
  - **View switcher** — Diagram / Primary / Secondary / All, default **Primary**, **auto-switches to
    Diagram on scram**; an always-visible compact 2-click-arm SCRAM at the right (emergency reach from
    any view).
  - **Diagram** view: placeholder until the SVG ships, plus the critical-only controls per §5 (rods,
    ECCS/EPS/ADS, MSIV). **Primary/Secondary** cards: per-plant sections + full controls + a dim
    cross-indication strip (the other side's heat-removal-relevant params). **All** view: the numeric
    grid with its own Instruments/True/Both overlay toggle. **Subcooling** gets the §9 special treatment
    (larger text, warn <22 °C / alarm <11 °C / `SATURATED` ≤0). PWR/RBMK/BWR all mapped.
  - Implementation notes: views build once (controls via the shared `ctlGroup`; param value-slots
    updated each frame) so number inputs keep focus. A `{t,cls}` row form was added for explicit
    per-row severity (e.g. PORV-block "open" must NOT read as the PORV-open alarm). Unmodeled
    slots/controls (MSIV on PWR/RBMK, Cont. Iso) stay dim/`normal` — no faked state (MSIV is wired
    only on the BWR via `msiv_closure`). Engine/layer suites untouched (UI-only).
- **Plant Display promoted to the ONLY UI; rod control reworked (user, `develop`).** The user approved
  the Plant Display, so the classic Control Room was removed entirely: the tabbed control strip + the
  synoptic numeric grid (and their `buildControls`/`buildNumeric`/`renderNumeric`/`renderRodBars`/
  `renderControls`/`setupScramCover` functions, the `scram-box`/guard-cover, the Dev-tab UI-Layout
  selector, and the `localStorage`/`?layout=` mechanism) are gone. Plant Display is now unconditional
  (the `layout-*` classes were dropped). The Settings → Values Display toggle now drives the All view;
  the FF badge moved into the view area.
  - **Rod control — press-and-hold + smooth nudge (Flag F8-adjacent, ENGINE change).** Withdraw/Insert
    are now **hold-to-move** (pointerdown → `rod_start` at the selected speed, release anywhere →
    `rod_stop`); the Stop button is gone; rod speed (Slow/Norm/Fast) stays. The instant `+1/−1` was
    replaced by a **rate-limited nudge**: `rod_nudge {steps,speed}` now sets a `nudge_target` and drives
    toward it at the rod velocity instead of snapping, so a single step takes the same time as a held
    drive and is **sim-time-correct under time acceleration** (a wall-clock UI timer would mis-fire).
    Implemented identically in all three engines' `_stepRods`/`applyCommand` (RBMK keeps its inverted
    insertion sign); `nudge_target` is cleared on scram/`rod_start`/`rod_stop` and round-trips in
    save/restore (it lives on the rod group). Caveat: rods only move while the sim is **running** (no
    time passes when paused) — acceptable since operating implies play. All scenario suites still green
    (the `control_response`/`physics_failures` tests that nudge rods run long enough to reach the
    target): PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47. Verified the hold drives the bank (210→213 in 5 s
    at normal speed, power 100→101.7 %).
- **PWR primary-loop SVG diagram wired into the Primary view (user, `develop`).** Took the animated
  schematic from `pwr_primary_loop_diagram_v2.html` and embedded it in the **PWR** Primary view, above
  the controls, **replacing the parameter sections** there (`buildCard` renders `pd.primary.diagram`
  instead of `.pd-sections` when present; RBMK/BWR keep their sections — the diagram is PWR-only). The
  source file's slider/`requestAnimationFrame` sim is dropped; instead `renderDiagram(s)` drives the
  sensor `tspan`s (Power, Rod-ins, Subcool, Inventory, Press, PZR/SG level, PORV, T-hot/T-cold, RCP
  flow — all from the snapshot, unit-toggle-aware), the rod-gauge fill, the PZR + SG water levels, the
  flow-animation speed / `.stopped` state and pump spin (from `pump_flow_pct`), and the hot-leg warm
  tint (from T-hot) — called each broadcast while the Primary view is active. The schematic's CSS is
  scoped under `.pd-diagram` (its `--text`/`--border`/etc. vars clashed with the shell's), the SG tube
  bundle is built once (`buildDiagramBundle`), and the SVG is height-capped (240 px) so the controls
  fit below. UI-only; suites untouched.
- **PWR secondary-loop SVG diagram wired into the Secondary view (user, `develop`).** Same treatment
  for `pwr_secondary_loop_diagram_v2.html` → the **PWR** Secondary view (Steam Gen → turbine + generator
  → condenser → condensate/feed pumps), replacing its parameter sections; `renderSecDiagram(s)` drives
  Steam Flow, Steam Press, SG level, Turbine RPM, Output MW, Cond. Vacuum, Hotwell Temp (derived from
  vacuum), Feedwater Flow, the SG water level, and the flow/turbine-blade/pump animation speed. Both
  cards live in the DOM at once, so the secondary diagram's element ids are **prefixed `sec`/`sv`** to
  avoid colliding with the primary diagram's (both use `#loop`, `#sgWater`, `vSg`, …). One additive
  engine field: PWR `getTrueState()` now exposes **`steam_pressure_mpa`** (the engine computed it but
  never surfaced it) — the data-contract is additive-only, PWR suite still 11/11·51. Both diagrams are
  **PWR-only** (`pd.<view>.diagram` is set only on the PWR profile); RBMK/BWR Primary AND Secondary
  views keep their parameter sections (verified — nothing to "revert", they were never given a
  diagram). RBMK 18/18, BWR 9/9 untouched.
- **Plant-display layout overhaul + PWR full-loop diagram in the Diagram view (user, `develop`).**
  Restructured the plant-display so the **Diagram view stretches** to fill the vertical budget and the
  schematic is large/legible with no scroll bar. Changes: (1) the view switcher moved from a horizontal
  bar to a **vertical strip on the left** (`.view-switcher`, `flex:0 0 96px`, buttons stacked); (2) the
  view stack (`.view-area` + a shared `.pd-controlbar`) is wrapped in `.main-area` (`flex:1`) so it
  grows, with the chart/alarm `.bottom-row` now a fixed band (`flex:0 0 196px`); (3) the **SCRAM button
  is pinned to the right of one shared control bar** that is always visible — `populateControlBar()`
  rebuilds `#pdCtlRow` with the **active view's** controls on each `setView()` (Diagram→critical
  controls, Primary/Secondary→their control sets, All→none), replacing the old per-card `.pd-controls`;
  (4) per-view controls and the cross-check strip were removed from the cards (`buildCard` now returns
  only the diagram or the `.pd-sections` grid, which flex-fills the panel); (5) diagram SVGs fill the
  stretched area (`.pd-diagram svg.loop { height:100% }`, was a 240 px cap) and the scoped diagram
  fonts were bumped (~+15–25 %, e.g. `.lbl-val` 13→15 px) for legibility; the right column was narrowed
  (`flex 1 1 340`, max 380) to give the diagram more width. New file
  `pwr_full_plant_diagram_v2.html` integrated as `PD.pwr.plantDiagram` (the full primary+secondary loop)
  with **`fp`/`fv`-prefixed ids** (a third diagram coexisting with the primary/secondary ones, which
  reuse `#loop`/`#sgWater`/`vPower`…); `buildFullDiagramExtras()` builds its SG tube bundle / condenser
  tubes / turbine blades once, and `renderFullDiagram(s)` drives all 16 sensors (primary + secondary),
  the rod/PZR/SG levels, the two independent flow domains (`stopped-pri`/`stopped-sec` + separate
  `--flow-dur`/`--flow-dur-sec` + pump/blade speeds) and the warm tint — scoped to
  `[data-pdview="diagram"]`. `renderDiagram`'s warm-tint query was likewise scoped to
  `[data-pdview="primary"]` (three `.pd-diagram` now match). Default view is now **Diagram**. RBMK/BWR
  Diagram views keep the "SVG in development" placeholder (full-loop diagram is PWR-only). UI-only;
  PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47 still green.
- **UI review pass: diagram polish + control-bar state fixes (user, `develop`).** Thorough
  correctness review of the plant-display UI (headless interaction harness + a read-only code audit).
  Diagram changes (all three PWR schematics): (1) **smoother motion** — added `transition: y/height .16s`
  on `.water`/`.rod-fill` and `transition: d .16s` on `.surface` so level/rod geometry interpolates
  between the 10–20 Hz broadcasts instead of snapping; and a `setVarQ()` guard so animation-duration
  CSS vars (`--flow-dur*`, `--spin*`, `--blade-dur`) are only rewritten when they actually change
  (re-setting them every frame restarted the dash keyframes → stutter); `durS()` coarsened to 2 dp.
  (2) **full-diagram layout** — turbine assembly raised 12 px so it no longer touches the condenser
  (polygon/clip/shaft/blades/label/RPM-tap); **Feedwater Flow** label moved down clear of the SG;
  **T-cold** label shifted left off the SG corner. (3) **tighter crop + centering** — viewBoxes set to
  the measured content bounding boxes (via `getBBox`): primary `40 108 821 360`, secondary
  `40 40 1018 449`, full `40 92 1160 394` — trims the dead side margins and centers each in its panel
  (also renders ~13 % larger). Correctness fixes from the audit: (A) the shared control bar is rebuilt
  per view, which **reverted typed setpoints** (Feed Reg/Turbine Load/recirc…) and the **rod-speed
  selection** to their hardcoded defaults on every view switch — now persisted (`ui.ctlVals` keyed by
  input id, re-applied in `ctlGroup`; rod-speed seg re-asserted in `populateControlBar`). (B) the
  **All-view overlay segment** (Instruments/True/Both) desynced from `ui.overlay` after an engine
  rebuild — `buildViews` now calls `syncSeg`. (C) removed the dead `_cross` branch in `renderPdRows`
  (the cross-strip was already gone). (D) the SCRAM auto-disarm timer no longer clobbers a "SCRAMMED"
  label if the plant trips from another cause while the button is armed. Verified by harness: view
  switch repopulates the bar (3/7/7/0 groups), SCRAM arms→fires, all 3 engines switch (slots 7/4/8),
  setpoint `42` + rod-speed Fast + overlay True all survive round-trips; no JS errors. UI-only;
  PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47 still green.
- **RBMK + BWR balance-of-plant / electrical output — PWR-parity full-scope operation (user, `develop`).**
  Audit finding: both engines modeled reactor→coolant (+BWR safety systems) well but **stopped at the
  steam boundary** — no turbine/generator/condenser, no `mwe_output`, so they couldn't be operated
  full-scope like the PWR (which models turbine RPM+grid-sync, condenser vacuum, MWe, steam dump). The
  RBMK's `steam_to_turbine` was a *fixed* load with no `set_turbine_load`; the BWR's `set_turbine_load`
  set only a steam fraction. Added a behavioral turbine/condenser/generator to **both**, mirroring the
  PWR §6.8, plus a partial-power operating state each. **Additive & inert by default** — every existing
  suite re-confirmed green before new tests (RBMK 18/18, BWR 9/9), then extended.
  - **Shared model (mirrors `pwr_steam_generator.stepTurbine`):** grid-synced turbine holds rated speed;
    free-spinning it is driven by admitted steam and braked by windage (coasts down on a trip);
    condenser vacuum restores/decays on `condenser_cooling_available`; low-vacuum & overspeed trips.
    `mwe_output = steam_load · mwe_rated · (rpm/rated) · (vac/vac_rated)` — **electrical output tracks the
    steam actually drawn by the turbine** (a direct/drum cycle: reactor power the turbine doesn't take is
    dumped/relieved), so MWe follows load, not raw fission power. A **turbine bypass / steam dump** vents
    excess steam to the condenser to hold pressure on a load rejection.
  - **RBMK** (`rbmk_thermal.stepTurbine`/`tripTurbine`, `rbmk_config.turbine`): `steam_to_turbine` is
    now the operator load (default = P0, so the accident physics is byte-identical when untouched — the
    excursion still outruns the fixed draw). New commands `set_turbine_load {mwe}` / `set_steam_dump`;
    `turbine`/`mwe_rated=1000`/3000 rpm (50 Hz); steam dump auto @7.5 MPa (ordered below the 7.6 alarm /
    8.0 relief); instruments `turbine_rpm`/`condenser_vacuum`/`mwe_output`; new `50_percent` init state
    (orm 70, flow 80); new failures `turbine_trip` (trip_turbine) + `loss_of_condenser_vacuum`
    (vacuum_decay). **Suite 20/20 · 129** (was 18/18·99) — added `bop_pre`/`bop_post`.
  - **BWR** (`bwr_vessel.stepTurbine`/`tripTurbine`, `bwr_config.turbine`): `steam_flow_normalized` is the
    turbine draw; added rpm/vacuum/`mwe_output` (1800 rpm, `mwe_rated=1100`) and the steam dump — **gated
    on `condenser_cooling_available`** so it is **inert in station blackout** (no AC → no condenser), which
    is load-bearing: the SRVs alone hold vessel pressure and keep RCIC's steam drive alive → the
    **Fukushima timeline is unchanged**. `condenser_cooling_available=false` set on `full_blackout_bwr` and
    `post_scram_sbo`. New `50_percent` state runs reduced recirc (`recirc_pct:19` → power settles ~50% via
    the negative void feedback; tuned). New failure `loss_of_condenser_vacuum`; `set_steam_dump` command;
    dump setpoint 7.25 (above rated 7.03 so the §7.3 void-collapse transient still fires, below SRV 7.58).
    **Suite 10/10 · 63** (was 9/9·47) — added `balance_of_plant`. §7.3 turbine-trip transient preserved.
  - **New commands beyond CONTEXT §6.7** (additive; fold into §6.7 on next blueprint update, as with
    the earlier B2/D4/D6 additions): RBMK `set_turbine_load` + `set_steam_dump`; BWR `set_steam_dump`
    (`set_turbine_load` already existed). New `true_state`/`control_state` fields are additive-only, so
    M7's data-contract suite is unaffected; M4 picks up the two new per-engine failures as data (HR3).
  - **Discovered a pre-existing red gate → Flag F9.** M5/M6·PH/M7 each have one stale `rod_nudge`
    integration check (expects instant nudge; engine now rate-limits) — reproduces on clean HEAD,
    unrelated to this work. PWR 11/11·51 and M4 10/10 still green.
- **Blueprint reconciliation — folded all built engine/contract additions into the specs (user, `develop`).**
  Per "update the blueprint to match the code," folded every additive feature already built (and
  previously only logged here) into the source-of-truth specs, so `CONTEXT.md` + `M1/M2/M3` now
  describe what's actually built. **Scope:** engine + contract additions only; UI (M8) and pure `[tune]`
  deviations stay recorded here (this log remains the history/rationale, per "keep as historical record").
  - **CONTEXT.md** — `§6.3` true_state: PWR `steam_pressure_mpa` + reactivity proxies
    (`reactivity_pcm`/`startup_rate_dpm`/`reactor_period_s`); RBMK `reactivity_pcm` + BOP
    (`steam_to_turbine`/`mwe_output`/`turbine_rpm`/`condenser_vacuum_kpa`/`turbine_tripped`); BWR
    `lpcs_running`/`srv_manual_open`/`slc_active`/`slc_tank_pct`/`reactivity_pcm` + the same BOP fields.
    `§6.5` control_state: PWR `porv_block_open`/steam-dump; an RBMK-specific block; BWR `slc_active`; the
    shared `turbine_load_mwe`/steam-dump. `§6.7` command catalog: PWR `open/close_block_valve`,
    `set_steam_dump`; RBMK `set_turbine_load`, `set_steam_dump`; BWR `initiate/stop_slc`,
    `start/stop_lpcs`, `open/close_srv_manual`, `set_steam_dump`. `§6.9` named states: RBMK + BWR
    `50_percent`. **→ resolves the standing "fold into §6.7 on next blueprint update" note** for B1/B2
    (PWR block valve/steam dump), D1/D4/D6 (BWR SLC/LPCS/SRV), and the RBMK/BWR BOP commands.
  - **M1 (PWR)** — §6.4 PORV block/isolation valve (B1); §6.7 steam dump / turbine bypass (B2); new §8.9
    reactivity proxies (reactivity computer / SUR / period); §9 note that every failure carries `category` (C7).
  - **M2 (RBMK)** — §8.3 updated (`steam_to_turbine` = operator load, not fixed; steam-dump term); new §8.7
    turbine/condenser/generator BOP; §13 instrument table (+turbine_rpm/condenser_vacuum/mwe_output); §14
    `turbine_trip`/`loss_of_condenser_vacuum` failures + `category`; §15 `50_percent`; §17 contract list;
    §19 BOP acceptance paragraph; §20 params (turbine block).
  - **M3 (BWR)** — §6.1 steam-dump term; new §9.7 SLC (D1) / §9.8 LPCS (D4) / §9.9 manual SRV (D6); new
    §12.1 turbine/condenser/generator BOP (condenser-gated dump — Fukushima-preserving); §11 instrument
    table (+BOP); §13 `loss_of_condenser_vacuum`; §14 `50_percent`; §16 contract list; §17 save/restore
    list; §18 BOP acceptance paragraph; §19 params (LPCS/SRV/SLC/BOP).
  - **Not folded (by design):** `[tune]` value deviations (e.g. RBMK D2 retunes, BWR D2 `K_vessel_pressure`),
    load-order/module-system notes, and all M8 UI changes — these remain here as the built-vs-intent record.
    Flags F1–F8 unchanged; F9 (stale `rod_nudge` integration check) still open. No code changed; specs only.
- **Operator-manual enablers — SUR/period + startup states (user, `develop`).** Groundwork for building
  a full operator's manual per plant (data-driven: generated reference + engine-validated procedures).
  - **SUR / reactor period on RBMK + BWR (Phase 0a).** `getTrueState()` now exposes `startup_rate_dpm`
    (= 26.06·Ṗ/P) and `reactor_period_s` (= P/Ṗ) on all three engines (was PWR-only), from the smoothed
    power rate. RBMK gained the `_power_rate`/`_prev_power_pct` tracking BWR already had. Additive to the
    contract. Enables approach-to-criticality documentation.
  - **RBMK `hot_startup` subcritical state (Phase 0b) — WORKS.** Low power, no xenon, flow established;
    trimmed critical per-state at `orm_target`, then the control group is inserted `subcrit_margin_steps`
    (25) further so it starts SUBCRITICAL (no boron — the margin is rod position). Slow rod withdrawal →
    critical → controlled ascension to power, positive SUR, no runaway, **both versions**. Test-gated:
    `startup_pre`/`startup_post` (RBMK suite now **22/22 · 141**). The per-state `void_ref` pinning is what
    makes this clean (no standing void offset).
  - **BWR `hot_startup` — NOT PROVIDED (physics-model limitation, honest omission).** The BWR pins a single
    full-power `void_ref` (0.45); at startup (low void) the void reactivity is strongly positive, so the
    reactor self-drives to the **~44 % flow/void balance regardless of rod position** — no stable
    near-zero-power-with-flow point exists (verified across rod insertions 3–65 %). A real cold approach-to-
    criticality would need a **power-dependent `void_ref`** — a deferred physics upgrade that would require
    re-tuning against the flow-control + Fukushima suites. Documented in `bwr_config` and left out rather
    than faked (honesty principle). **→ open decision: accept (BWR manual starts from an operating point +
    a voiced simplification) vs. invest in the void-model upgrade.** BWR 10/10·63, PWR 11/11·51 green.
  - **RESOLVED (user chose: invest in the void-model upgrade).** Implemented as a **targeted
    per-state `void_ref` pinning scoped to the startup state only** — not a global tracking
    reference (probing showed that destabilized the proven flow-control / 50 % behaviors). In
    `BWREngine.reset()`: for a `subcritical` init state, pin `void_ref` at the state's low
    operating void and trim critical there (RBMK pattern), then insert the control group a margin
    (BWR `steps` = withdrawn → *decrease* steps). Every other state keeps the base full-power trim,
    so `full_power` / `50_percent` / `post_scram_sbo` and the Fukushima flagship are byte-identical.
    Added `hot_startup` to `bwr_config` + a `startup` acceptance test. **BWR now 11/11 · 69**; RBMK
    22/22 · 141 (`startup_pre`/`startup_post`); PWR 11/11 · 51. Specs synced (CONTEXT §6.3/§6.9,
    M2 §15/§19, M3 §14/§18).
- **Operator's manual — reference generator (Phase 0c + 1, `develop`).** `tools/gen_manual_reference.js`
  emits `ui/manual_data.js` (→ `RD.MANUAL`), the data-driven source for the coming in-sim help panel
  (and a later printable). **Reference sections are GENERATED from the live engine configs + a settling
  run so they can't drift:** setpoints/limits ← protection (trips/actuations/alarms); indications ←
  instrument set (ranges/lag) + linked alarms; failures ← failure catalog (display/category/severity);
  **normal values** ← running each named state and capturing true + indicated readings (operating states
  settle 60 s; transient/subcritical states captured near their initial condition). A hand-authored
  **both-register** (learning + industry) layer supplies control effects, indication meanings, plant
  overviews, and safety limits. Keyed by profile: `pwr`, `rbmk_pre`, `rbmk_post`, `bwr` (mirrors the UI
  engine selector). Re-run after any engine/config change. Verified: PWR full power reads 100 %/15.41
  MPa/1000 MWe/747 ppm/ρ≈0; RBMK `hot_startup` reads subcritical; BWR 1100 MWe. Phase 2 (authored +
  engine-validated procedures) and Phase 3 (M8 help panel) still to come.
- **Operator's manual — normal procedures, authored + engine-validated (Phase 2 part 1, `develop`).**
  `ui/manual_procedures.js` (→ `RD.MANUAL_PROCEDURES`, keyed pwr/rbmk_pre/rbmk_post/bwr) holds
  **authored, both-register** procedures as structured steps (command + hold), each with a
  **declarative `validate` block**. `test/run_procedures.js` drives every procedure through its engine
  from the stated initial state and asserts the outcome — so nothing ships unproven. **12/12 · 34
  checks**: per profile a startup / raise-power / shutdown. Validation supports `final` (end-state
  predicates), `never_melted`, `saw` (a condition held at least once — e.g. SUR>0 during ascension),
  and `never` (a condition that must never occur — e.g. `fuel_temp_c >= 1200`, proving no fuel damage).
  - **Honest simplification surfaced (startup overshoot).** Approach-to-criticality can't be held at a
    fine low power in the lumped models — RBMK/BWR climb gently (slow, per-state-pinned) but the **PWR
    overshoots** (single lumped control group, Doppler-only prompt feedback, no fine trim), settling
    high after a spike (fuel stays < 1200 °C — no damage). The procedure voices this plainly (real
    approach-to-criticality is finer and neutron-source-driven) rather than faking a clean hold. The
    validated claims are the robust, honest ones: subcritical start → positive SUR → power rises → no
    fuel damage.
  - **Phase 2 part 2 — emergency procedures, accident walkthroughs, alarm response (`develop`).**
    Added to `ui/manual_procedures.js`: an **engine-validated emergency procedure per plant** (PWR loss
    of main feedwater → trip + AFW; RBMK MCP trip → AZ-5; BWR station blackout → RCIC) and the **three
    flagship accident walkthroughs** as *narrative* procedures (PWR TMI, RBMK Chernobyl pre/post
    comparison, BWR Fukushima). The harness (`test/run_procedures.js`) skips `narrative` procedures
    (marked `NARR`) — the accidents' physics is owned by each engine's flagship acceptance suite
    (CONTEXT §9), not re-run through the manual harness. **Procedures 16/16 · 43 checks** (3 startup +
    3 power + 4 shutdown... ) plus 4 narrative accidents. Alarm response: authored both-register
    cause+action guidance in the generator (`ALARM_RESPONSE`, `buildAlarmResponse`), attached as
    `RD.MANUAL[profile].alarm_response` (authored for key alarms; priority-based default otherwise).
    Panel gained **Accidents** and **Alarm Response** sections (`mAccidents`, `mAlarms`); Procedures now
    excludes accidents. Verified by headless-Edge screenshots (PWR Alarm Response, BWR Fukushima
    walkthrough). Engine suites unaffected (PWR 11/11, RBMK 22/22, BWR 11/11). **The operator's manual
    is now feature-complete for v1** (reference + normal + emergency + accidents + alarm response, both
    registers, in-sim panel); only the printable export remains (deferred).
- **Operator's manual — in-sim help panel (Phase 3, `develop`).** A full-screen **Operator's Manual**
  overlay in M8, opened by a `📖 Manual` button in the sim controls (or the `?manual[=section]`
  deep-link). Renders `RD.MANUAL` + `RD.MANUAL_PROCEDURES` for the **active engine profile**
  (`ui.engineKey` → pwr/rbmk_pre/rbmk_post/bwr) and is **register-aware** (its Learning/Industry toggle
  drives the global `set_register`). Left-nav sections: Overview, Procedures, Controls, Indications,
  Setpoints & Limits, Normal Values, Failures. Procedures show the "validated by the engine" note,
  per-step actions/notes/command hints; setpoints/alarms show color-coded priority pills; all tables
  are generated from the live data. Re-renders on plant switch. Files: `ui/shell.html` (button +
  overlay + script loads), `ui/shell.css` (`.manual-*` styles), `ui/app.js` (`openManual`/`renderManual`
  + section renderers `mOverview`…`mFailures`, using local `mesc`/`mreg` to avoid clashing with the
  existing attribute-only `esc`). Verified by headless-Edge screenshots (PWR overview/setpoints, RBMK
  pre-1986 procedures) — renders correctly, on-theme, profile- and register-aware. UI-only; engine and
  procedure suites unaffected (PWR 11/11, RBMK 22/22, BWR 11/11, procedures 12/12).
  - **Remaining for the manual:** Phase 2 part 2 (alarm-response + abnormal/emergency + accident
    walkthroughs), and a later printable export (deferred per user).
- **Operator's manual v2 — single integrated voice + actionable, Instructor-grade procedures (`develop`).**
  Per user feedback the manual was redesigned from a two-register toggle into ONE authoritative
  operating manual, and made the **source of truth for the Instructor (M6)**. Plan: `Blueprint/
  OPERATOR_MANUAL_PLAN.md`. Decisions (locked with the user): single integrated voice (spell out +
  acronym, e.g. "Steam Generator (SG)"); on-screen control names in procedures with the internal
  command API moved to a **Dev/Commands** appendix; **every step carries `control` + `target` +
  a machine-checkable `acceptance` predicate** (the same predicate the harness asserts and M6 will
  gate/grade on — one artifact); cold startup / RCP warmup / cooldown are **out of physics scope**
  (engine starts hot) and marked narrative.
  - **Generator (`tools/gen_manual_reference.js`)** rewritten to single voice: overviews, controls
    (`control`/`uses`/`command`), indications (`name`/`measures`), alarm-response (`means`/`response`),
    and a per-plant **Glossary**. No `_learning`/`_industry` split. Regenerated `ui/manual_data.js`.
  - **Procedure schema (`ui/manual_procedures.js`)** rewritten: `{id,category,title,purpose,from,
    prereq[],cautions[],steps[],guard,outcome}`; step `{text,control,target,cmd,hold,acc,saw,note}`.
    **Harness (`test/run_procedures.js`)** checks each step's `acc`/`saw` + proc `guard` — **21/21 ·
    73 checks (4 narrative)**. PWR authored richly as the template (startup w/ SUR ≤ 1 DPM & period
    ≥ 30 s, raise/lower power, pressure & SG-level control, shutdown, loss-of-feedwater, RCP trip,
    **stuck-PORV recovery via block valve**, TMI). RBMK/BWR ported to the new schema (rich authoring
    of their full normal + failure sets is the next phase).
  - **Panel refit (`ui/app.js`, `ui/shell.html`, `ui/shell.css`)**: dropped the manual register
    toggle; renders integrated voice, rich steps (control chip + Target + "✓ when" acceptance +
    cautions + outcome), controls-by-label, and added **Glossary** and **Dev/Commands** sections.
    Verified by headless-Edge screenshots (Procedures, Controls, Glossary). Engine suites unaffected
    (PWR 11/11, RBMK 22/22, BWR 11/11).
  - **Next (phased):** rich RBMK & BWR normal procedures with targets/acceptance; full per-plant
    failure procedures (decision: every modeled failure); humanize the `✓ when` param labels; then
    the M6 Instructor consumes `acc`/`guard` directly.
- **CONTEXT §12 + manual maintenance rule; manual polish; linear scram (`develop`).**
  - **CONTEXT.md §12** added: documents the operator's manuals (single-voice; source of truth for
    M6) and a **HARD MAINTENANCE RULE** — any sim change that affects the manual must re-run
    `tools/gen_manual_reference.js`, update procedures, re-run `test/run_procedures.js`, and add new
    UI acronyms to the glossary. The procedure suite + generator are part of the acceptance gate for
    sim-facing changes.
  - **Manual panel:** removed the meta/filler notes (accidents "validated by the acceptance suite…"
    text, procedures dev note) and the **Dev/Commands tab** (coder-only; the command mapping stays in
    `RD.MANUAL[*].controls[].command` data + the plan doc). Register toggle already gone (v2 single voice).
  - **Scram made linear (PWR + BWR).** Reported "rods didn't go down on scram" — engine was correct
    (rods DID insert, power fell) but PWR/BWR scram velocity was exponential (`steps/t`) so rods
    asymptoted toward fully-in (crawl near the end) rather than reaching it. Changed to constant rate
    (`max_steps/t`): PWR rods now reach fully-in in 2.5 s (92%→0%), decisive/visible. RBMK was already
    linear. Suites green (PWR 11/11, RBMK 22/22, BWR 11/11, procedures 21/21). The diagram rod
    indicator IS wired to `position_pct` (renderFullDiagram); a view-specific refresh check is folded
    into the Group-A UI pass.
  - **Plan for the batch (user-confirmed):** do **Group A UI fixes first** (scram rod-display verify,
    PZR heater + manual spray sliders w/ cold-leg suction, acronym spell-out "Full Name (ACRONYM)"
    across the UI, manual auto-units, glossary=all-acronyms, "Follow in Instructor" button on
    procedures/accidents/failures), then a **control audit**, then **full CVCS** (charging pump +
    letdown valve + boron + safety injection + leakage make-up), then **new aux systems** (BWR
    Isolation Condenser, RBMK ECCS) + extra failure modes. Q&A on turbine/condenser/TCV/steam-dump/
    behavior recorded in session.
  - **Group A progress (`develop`):** **A1** scram made linear (done, above). **A3** acronym spell-out —
    gauges (top bar) and numeric-grid labels across all plants now "Full Name (Acronym)" (e.g. "Avg
    Coolant Temp (Tavg)", "Pressurizer Level (PZR)", "Operating Reactivity Margin (ORM)"); controls
    already followed the convention. **A4** the manual now converts dimensioned values to the active
    unit toggle (US/SI) — normal values, indication ranges, trip/alarm setpoints (via `MDIM`/`mval`
    reusing the board's `conv`/`unit`); alarm names show "Learning (INDUSTRY)". **A5** glossary
    expanded (added DPM, MWe/MWt, ECCS) to cover UI acronyms; regenerated. Suites green (PWR 11/11,
    procedures 21/21). **Remaining Group A:** A2 (PZR heater + manual spray sliders, spray from the
    cold leg) and A6 ("Follow in Instructor" button on procedures/accidents/failures).
  - **Group A complete (`develop`).** **A6** — each procedure/accident card has a "▶ Follow in
    Instructor" button; it loads the procedure into the Shift-Supervisor block and steps through it
    (Prev/Next/Restart/Stop), showing each step's text, Control, Target, and a LIVE "✓ when … met /
    not yet" acceptance check against the current snapshot — so the user follows it while operating.
    `ui.follow` state; `renderInstructor` defers to `renderFollow` when following; `?follow=<id>`
    deep-link. **A2** — Pressurizer Heaters and Pressurizer Spray are now manual **% sliders + Auto**
    (ctlGroup renders slider AND buttons); `set_heater {auto}` / `set_spray {auto|pct}` engine
    support; **spray draws from the cold leg after the RCP** — spray effectiveness scales with primary
    `flow_frac` (no RCP flow → no spray). The live control bar lives in the **PD** per-view control
    lists (PROFILES.controls is legacy); updated the PD Primary list. Suites green (PWR 11/11, RBMK
    22/22, BWR 11/11, procedures 21/21). Added `?view=` deep-link. **Next:** control audit (B), then
    full CVCS (C), then new aux systems (BWR Isolation Condenser, RBMK ECCS) + extra failures.
  - **Group B — control audit (`develop`).** Cross-referenced each plant's engine operator commands
    against the live PD control lists + the `ACTS` map. **Findings & fixes (modeled command with no UI
    control, or BOP not surfaced):**
    - **RBMK:** `set_turbine_load` and `set_steam_dump` had NO UI, and the BOP readouts (electrical
      output, turbine RPM, condenser vacuum) weren't shown anywhere — the RBMK made 1000 MW invisibly.
      Added a **Turbine / Condenser** readout section + **Turbine Load** and **Steam Dump** controls to
      the secondary view.
    - **BWR:** `set_steam_dump` had no UI; `stop_slc` / `stop_lpcs` had start-only controls; BOP
      readouts not shown. Added **Steam Dump** control, **Stop** on Core Spray + SLC, and electrical
      output / turbine RPM / condenser vacuum readouts to the secondary view.
    - **PWR:** `set_dhr` (Decay-Heat Removal) and manual `open_porv`/`close_porv` had no UI. Added a
      **Decay-Heat Removal (DHR)** control and a manual **Relief Valve (PORV)** Open/Close control to
      the primary view; renamed RCP control to the spelled-out form.
    - New `ACTS`: `rbmk-turbine-set`, `porv-open`/`porv-close`, `dhr-on`/`dhr-off`, `slc-stop`,
      `stop-lpcs`. All map to existing engine commands. Verified by headless screenshots (RBMK/BWR
      secondary, PWR primary). Suites green (PWR 11/11, RBMK 22/22, BWR 11/11, procedures 21/21).
    - **Noted, not changed:** PWR "MSIV" is a labeled placeholder (MSIV not modeled on the PWR — only
      the BWR has `msiv_closure`); left as-is with its "placeholder here" hint. A real PWR MSIV is a
      candidate for the aux-systems phase.
  - **Group C — full CVCS (PWR, `develop`).** Modeled the Chemical & Volume Control System as operator
    systems. **Boron chemistry decoupled** from net charging−letdown (the old
    `boron_ppm += boron_rate·(charging−letdown)` was non-physical): new `boron_adjust` (ppm/s) driven by
    `set_boron_adjust {rate}` (+borate/−dilute/0 hold), gated on the charging pump. **Charging pump**
    (`set_charging_pump {running}`, gates charging + boration), **letdown valve** (existing
    `set_letdown_flow` + Isolate), and **auto make-up** (`set_cvcs_auto {active}`) that modulates
    charging to hold primary inventory up to `charging_max` — leakage compensation. Config
    `boron_adjust_rate`/`cvcs_makeup_gain`/`charging_max` (pwr_config); logic in `pwr_primary.stepInventory`;
    `set_charging_flow` now also drops auto (manual override). Safety injection = HPI (existing). Spray
    already draws from the cold leg after the RCP (Group A). **Auto make-up defaults OFF** and
    `charging_max` (0.06) covers normal leakage but not a LOCA, so the flagship/TMI behavior is intact
    (PWR 11/11). UI: PWR primary gains Boron (Borate/Hold/Dilute), Charging Pump (On/Off + slider),
    Letdown Valve (slider + Isolate), and CVCS Inventory Control (Auto/Manual); numeric grid shows
    Charging/Letdown + CVCS Mode. New commands beyond CONTEXT §6.7 (`set_charging_pump`,
    `set_cvcs_auto`, `set_boron_adjust`) folded into §6.7 + M1 §6.5 + regenerated `RD.MANUAL` (per the
    §12 maintenance rule). Verified: borate 747→807 ppm drops power to 39 %; auto make-up holds
    inventory ~99 % against a leak that otherwise drains to 0 %. Suites green (PWR 11/11, RBMK 22/22,
    BWR 11/11, procedures 21/21). **Next:** new aux systems — BWR Isolation Condenser, RBMK ECCS + extra
    failure modes.
  - **New auxiliary systems (`develop`).**
    - **BWR Isolation Condenser (IC)** — the passive heat sink Fukushima Unit 1 relied on. `set_ic
      {active}`; while condensing it lowers vessel pressure (`ic_condense_rate`) and conserves inventory
      (`bwr_vessel.stepVesselLevel` zeroes boiloff), holding the core covered on decay heat with **no AC
      and no injection**. DC-valve: on battery depletion in an SBO the IC closes (`ic_active→false`) and
      boiloff resumes — the Unit-1 story. Failure `ic_failure` (valves shut). UI: control + readout +
      status slot on the BWR secondary. New acceptance test `isolation_condenser` (BWR 12/12): level
      held ~50 % for hours, then uncovers once DC is lost.
    - **RBMK ECCS** — Emergency Core Cooling for a pressure-tube rupture. `set_eccs {active}` (engine
      step 9c, after the rupture drain): makes up steam-drum level (`eccs_level_rate`) and holds a
      cooling-flow floor (`eccs_flow_floor`), arresting the drain/dryout. UI: control + readout + status
      slot on the RBMK primary. New acceptance test `eccs` (RBMK 23/23): rupture drains the drum, ECCS
      recovers level and holds the flow floor.
    - Specs updated per the §12 rule: config (`bwr_config.safety.ic_condense_rate`,
      `rbmk_config.thermal.eccs_level_rate`/`eccs_flow_floor`); contracts; CONTEXT §6.7 (`set_ic`,
      `set_eccs`); M2 §8 + M3 §6.2; regenerated `RD.MANUAL` (BWR 20 controls / 15 failures incl. IC;
      RBMK gains ECCS control + glossary). Suites green (PWR 11/11, RBMK 23/23, BWR 12/12, procedures
      21/21). The RBMK/BWR failure catalogs were already broad (14 / 15 modes); no further failures
      added this pass beyond `ic_failure`.
  - **Rod control: per-state positions + operable shutdown bank (`develop`).** Fixes the report
    "rods always start fully withdrawn no matter the starting state" and the ask to model the
    shutdown group properly.
    - **Per-state control-rod position.** The control-group operating position is now per-state
      data (`initial_states[name].rod_op_pct`, % withdrawn) instead of one fixed
      `control_op_position_pct` for every state, so the starting rod position tracks starting
      power. **PWR:** 50 % now sits at 78 % withdrawn vs 92 % at full power (boron auto-re-trims
      via `_trimToCritical`; 50 % holds ~50 % with sane boron ~696 ppm). **RBMK:** 50 %
      `orm_target` 70→90 → 57.5 % withdrawn vs 66.7 % at full power, ORM healthy (89.8, above both
      `orm_min`s), holds 50 % (both versions); `rho_excess` auto-re-trims per state. **BWR:
      deliberately NOT changed** — a BWR maneuvers with recirc flow, not rods (CONTEXT §5), and its
      `rho_excess` is a fixed full-power constant with a void-equilibrium 50 % point; deepening the
      rods was both physically misleading and numerically fragile (per-state trim makes rod depth
      cosmetic; no-trim needs a recirc knife-edge near runaway), so the BWR keeps rods at the
      operating position and drops recirc to 19 %. Documented in `bwr_config`/`bwr_engine` comments.
    - **Operable shutdown bank.** The shutdown / RBMK-AZ group (previously "not an operator
      control", M1 §7) is now operable via the existing `rod_start`/`rod_stop`/`rod_nudge` with
      `group_id: "shutdown_rods"` — the engines already routed to any group. A **scram always
      overrides** (the per-step scram velocity re-asserts insertion every tick; verified the AZ bank
      fully inserts over its 18 s scram despite the operator spamming Withdraw). UI: a "Shutdown
      Bank" hold-pill (Withdraw/Insert) on every plant's Reactor Core + Plant-Display control bars;
      the hold mechanism now tracks the held group so release stops the right one; Control/Shutdown
      bank readouts show motion/scram status. M1 §7 note updated to reflect the deviation.
    - **Other rod issue found + fixed.** The M5/M6·PH/M7 "rod_nudge reached the engine" checks were
      **pre-existing failures** — they asserted an *instant* nudge, but a nudge drives to its target
      at rod speed (M1 §7). Fixed the tests to step the sim until the target is reached (they now
      pass; the engine was correct).
    - Specs/manual per the §12 rule: `RD.MANUAL` regenerated (RBMK 50 % ORM baseline 70.3→89.8; new
      "Shutdown bank" glossary term all plants); `test/manual_ui_map.js` mirror gains "Shutdown
      Bank". Suites green (PWR 11/11, RBMK 23/23, BWR 12/12, M4 10/10, M5 12/12, M6·PH 8/8, M7
      31/31, E2E 20/20, procedures 21/21, control audit + manual-follow PASS).
- **PWR full-plant synoptic + margin cards (`develop`)** — implements
  `Blueprint/new_diagram_controls.md` Appendix A (spec authority; engine handoff
  `inbox/pwr_synoptic_handoff.md`, prerequisites already gate-green).
  - **New module `ui/diagram/pwr_synoptic.js` + `pwr_synoptic.css`.** One integrated schematic
    (viewBox 1200×640, reactor → SG → turbine-over-condenser → cooling tower per the reference
    image; steam leaves the SG top-right and runs right-then-down to the governor). 12 margin
    cards in tuned anchor zones (left column: Power & Reactivity / Rod / Emergency; top strip:
    Relief / PZR / Steam & Flow; right column: Plant Status / Turbine-Gen / Condenser / Primary
    Flow & Inventory; mid slots: SG Heat & Level and RCP between the legs), plus the two
    **embedded panels** (`pwCvcsPanel` on the CVCS box face, `pwAccumulatorPanel` on the tanks —
    not margin cards). Leaders are drawn in a stage-pixel overlay SVG from each card edge to its
    `pw*Anchor` and reconnect on resize (ResizeObserver); prominent + dash-animated on hover.
  - **HR1 / Animation HR1 enforced in code paths, verified by harness.** Realistic mode reads only
    `snapshot.instruments`, §8.8 status booleans, and `control_state` commanded pose (block valve,
    heater/spray %, rod banks). Loop dashes/RCP impeller run from `rcp_running` status at fixed
    speed (4 s coastdown on the true→false edge — no `pump_flow_pct`); relief animation keys off
    `porv_indicator` (+ block open); dump/governor/charging/letdown/LPI/accumulator animation off
    their instruments. Learning adds SUR, deception duals (PORV, boron, active instrument
    failures), contextual xenon/fuel text chips (no raw `fuel_temp_c`), Cherenkov/fuel glows, and
    a true-position relief ghost during TMI; Physics Overlay (Learning-only toggle in Settings,
    hidden in Realistic) adds ρ/period, inventory/void, P–S ΔT, loop flow, and the subcool ghost
    cursor (overlay + failed-P/T-sensor lesson only).
  - **PZR card = strict accordion** (pressure ↔ level, headline value shown in the collapsed
    header). Deviation from a literal "both sections expand": bounds the card height so the
    auto-expanding level section (TMI / level extremes) can never slide over the SG card below —
    the collapsed section still shows its headline number, so nothing is lost. User clicks pin the
    section until the priority episode changes.
  - **"What matters now"**: TMI combo (`stuck_porv_open` + `porv_indicator_stuck_closed`) pulses
    the subcool bar, PZR card (level section auto-selected), Relief card + `gRelief`, and their
    leaders — not the whole board. ECCS actuation auto-selects the matching Emergency tab
    (HPI | AFW | RHR/LPI) and dots the tab. Alarm-tile hover highlights the mapped diagram node +
    card + leader (M1 §9 table).
  - **Legacy PWR plant display retired** in `ui/app.js`: 4-view switcher, `fp*`/`sec*`/`loop`
    partial SVGs + their renderers, PD control rows, PD.pwr, and the PWR numeric/controls profile
    blocks are deleted (~470 lines); `plant_id === 'pwr'` mounts the synoptic in the view area
    (`.app.pwr-synoptic` hides the legacy chrome; chart+alarms keep ~34–38 % of the column).
    RBMK/BWR keep the legacy display unchanged (screenshot-verified). New ACTS: `rhr-on/off`,
    `lpi-on/off` (`set_rhr`/`set_lpi`), `dump-set` (`set_steam_dump {pct}`); every synoptic
    `data-act`/`data-hold` cross-checked against the ACTS/HOLD maps. Two-step SCRAM cover lives on
    the Rod card. Pause (`metadata.running === false`) freezes all diagram motion via CSS and
    shows the centered `SIMULATION PAUSED` overlay.
  - **Dev conveniences** (`?mode= ?phys=1 ?inject=a,b ?ff=secs ?run=1` URL params) added for
    headless screenshot/acceptance work. **`ui/test_panel/synoptic_check.html`**: 55-check DOM
    acceptance harness (manifest ids + anchors live, mode gating, TMI Realistic = lying indicator
    with NO relief animation + auto-expanded level section + pulses, Learning dual + ghost,
    spray-needs-RCP, accumulator idle/active UI, pause freeze, two-step SCRAM, hover contract,
    chips) — 55/55 green headless.
  - **Known deferrals:** click-popover fallback for crowded components (panels are always visible
    at 1280×800, so nothing is unreachable); `primary_void_fraction` is not exported by
    `getTrueState` today, so the overlay Void row guards to `—` (engine addition deliberately not
    made — no engine work in this pass); `pwTapSteamFlow`/`pwTapVac` optional taps omitted (their
    readings live on the Steam & Flow / Condenser cards per A.2c "optional").
  - Suites green after the change: PWR 12/12·57, M7 OK + teeth, E2E 25/25, M4 10/10 — engines
    untouched.
- **Synoptic v3 — screenshot review fixes (`develop`).** User review at ~2000×1220 exposed that
  stage-percentage card placement scattered cards into letterbox space and onto equipment at
  larger windows, the CVCS panel drifted off its box, vessels didn't match the reference
  schematic, and number inputs clipped ("1000" → "1…").
  - **Cards/panels are now anchored in SVG user units** (`PLACE {sx, sy}` + `positionCards()`
    mapped through the same viewBox transform as the diagram, clamped to the stage) — cards hug
    their equipment at any window size; leaders stay short. The CVCS panel sits on the box face
    (clamped up only on short stages).
  - **Reference-shaped vessels** (`inbox/Schematic-diagram-of-a-pressurized-water-reactor.png`):
    domed RPV with hemispherical bottom, prominent fuel rods in the core barrel, and control/
    shutdown rod drives entering through the head — rod length below the drive bridge animates
    with inserted depth (green control bank, violet shutdown bank). SG is a domed shell with a
    **nested inverted-U tube bundle** (4 concentric U's with flow dashes), tube sheet, and a
    divided bottom plenum; U-tube-top reference line retained. PZR is a capsule on the hot leg.
  - **Relief tank relocated** into the RPV↔PZR gap — it previously overlapped the reactor vessel
    (visible in the user's screenshot). T-hot tap label moved below the hot leg; tap labels are
    compact backed boxes; steam header re-routed (SG shoulder → right → down through governor).
  - **CVCS panel slimmed to 4 rows**: charging/letdown setpoints now apply on change/Enter
    (no Set buttons — synoptic `change` listener issues `set_charging_flow`/`set_letdown_flow`),
    so the panel fits the box even at 1280×800 with the charging pump visible. Number-input
    spinner buttons hidden (they ate the digits); inputs widened.
  - Verified at 1280×800 and 2000×1220 (steady + TMI); DOM harness 55/55; PWR 12/12·57, M7 OK,
    E2E 25/25, M4 10/10.
- **Load Mode — turbine/feed simplification (all plants).** Replaced decoupled MW load +
  feedwater % knobs with one mental model: **Follow Reactor** (default), **Manual** (MWe slider),
  **Disconnected** (0 MWe). Shared `engines/load_mode.js`; PWR/RBMK/BWR engines call it each
  step; feed auto-couples unless `set_feedwater_flow` decouples. **SCRAM → disconnected + turbine
  trip** (realistic load rejection). UI: PWR synoptic Turbine-Generator card (mode seg + slider),
  SG imbalance annunciator; RBMK/BWR control bands match. Phase C: `scenarios/pwr_sg_flood.js` +
  `setup_commands` on scenario load. Spec: `Blueprint/load_mode_spec.md`. Legacy
  `set_steam_demand` / `set_turbine_load` retained (force manual + set target).
- **Operations test suites (external, all plants) + first tuning harvest (`develop`).** New
  `test/ops_harness.js` + `test/ops_{pwr,rbmk,bwr}.js` + `test/run_ops.js`: 66 scenarios that run
  each engine UNDER the real M4 layer (trips/actuation/interlocks/interception live, protection
  evaluated at M5 broadcast cadence — including its scaling with time acceleration). Two families:
  `ops_*` (realistic evolutions, scripted operator: load-follow, startup, shutdown, paced cooldown,
  xenon hold, LOFW/SGTR/SBO/ATWS) and `abuse_*` (player behavior: yanks, walk-aways, command spam,
  256× acceleration, un-scram attempts). RBMK scenarios run for BOTH design versions. Failing
  checks are deliberate tuning targets; findings + priority list in
  `Diagnostic/OPS_TUNING_REPORT.md`, raw data in `Diagnostic/ops_results.json`.
  **Fixed during the harvest:** (1) BWR RCIC auto-actuation unit bug — `fw_flow low 5.0` compared a
  normalized (0–1.2) instrument against 5.0 → RCIC always on, vessel flooded, spurious 5.52 MPa
  low-pressure trips on every assembled-stack BWR run (engine suites bypass M4, so only the ops
  suite could see it); setpoint → 0.05, and the RCIC level start moved 50.0 → 45.0 (σ=0.5 noise at
  the nominal 50.0 level hair-triggered it). Manual regenerated; BWR/M4/M5/M7 suites green.
  (2) `tools/gen_manual_reference.js` and `test/run_procedures.js` crashed on load (missing
  `engines/load_mode.js` require) — both fixed; procedures 20/21 (the `bwr_sbo_rcic` failure is
  report finding B3: RCIC capacity loses to post-trip boiloff, pre-existing physics tuning).
  **Headline open findings:** PWR/BWR high-flux trips unfireable (power_range meter caps at the
  120 setpoint; RBMK precedent says widen to 200); post-1986 RBMK can still steam-explode from the
  xenon pit (violates the comparison lesson's design intent); BWR lacks a pressure regulator so
  any uncoordinated power drop trips vessel-pressure-low; PWR SGTR drains inventory ~30× too fast
  and melts at pressure with no auto-SI; a by-the-book PWR shutdown cannot avoid the pzr-level
  trip (partial-load Tavg/SG-pressure program inverted); protection latency grows with time
  acceleration; no RPS reset path after any trip (forgiveness gap).

- **2026-07-07 — Working-tree regression recovered from session checkpoints.** On the evening of
  Jul 6 (≈21:40–21:44), a bulk file drop delivered the load-mode feature (`engines/load_mode.js`,
  Turbine-Generator card Mode seg + load slider, feed auto-coupling, `pwr_sg_flood` scenario,
  Dev-tab diagnosis-export markup) but replaced `ui/app.js` with a pre-synoptic snapshot of the
  profile architecture — silently reverting the synoptic mount, the M6 training tab, rewind, and
  Diagram Mode / Physics Overlay. Commit `cf480f9` unknowingly captured that regressed app.js.
  Recovery: `ui/app.js` restored from the Claude Code file-history checkpoint of the M6 training
  session (post-edit snapshot, verified against transcript edit replay), plus four ACTS additions
  so the batch's synoptic load-mode card is live (`load-follow`, `load-manual`,
  `load-disconnect`, `spray-off`). All other batch files were confirmed to be the good versions
  plus genuine improvements and were kept. Verified: M6 16/16 suites, synoptic + cards render,
  training tab lists 3 scenarios + 9 walkthroughs. Remaining gap: scenario suite 2/3 —
  TMI-recovery "Averted" beat no longer fires after the Jul 6 engine retuning (tuning target,
  not UI).

- **2026-07-07 — Session-diagnosis export rebuilt (Dev tab).** Forensics identified the Jul 6
  file drop as a Grok agent session (its `mcps/grok_com_*` scaffolding is stamped 21:39). Grok
  built the diagnosis export live (the user's two `Diagnostic/rd_diag_*.json` test exports prove
  it worked at 20:46/21:06) and then erased its own handler in the same stale-base `app.js`
  write-back that clobbered the synoptic. Rebuilt in app.js against the exported files as the
  schema contract (`schema_version 1.0`, kind `reactor_dynamics_diagnosis`): 1 Hz true-state
  timeseries (per-plant field maps, ~4 h ring), alarm-transition/scram/session_start events,
  command log with blocked/error flags, full `service.saveState()` as `snapshot_end`, manifest
  (plant, engine key, init state, scenario, follow procedure, seed, sample_hz), optional user
  notes, `rd_diag_<stamp>_<plant>.json` download. Session boundaries reset the recorder
  (init / plant_change / scenario / restore); rewind trims the recorded future. A wiring audit
  (every `data-act`/`data-hold`/`act:`/`hold:` reference vs handlers) now reports 79/79 wired.

- **2026-07-07 — PWR training campaign "Zero to Operator" (Gameplay §8 step 7: Campaign
  progression wrapper + curriculum).** Plan: `Blueprint/pwr_training_campaign.md`. Five acts,
  19 missions + 1 bonus, mixing existing artifacts (hook, TMI, sg_flood, 9 walkthrough
  procedures) with 8 new micro-scenarios: `pwr_tour` (energy journey), `pwr_chain_reaction`
  (criticality at HZP on the neutron source), `pwr_feedback` (Doppler/MTC), `pwr_xenon`
  (post-trip dead-time arc), `pwr_boron` (Tavg via dilute/borate), `pwr_load_follow` (manual
  dispatch), `pwr_protection` (deliberate turbine trip + alarm triage), `pwr_qualify` (blind
  stuck-PORV exam, three endpoints). Wrapper: `ui/campaign_data.js` (data-driven, per-plant),
  Training-tab campaign section (sequential unlock, progress bar, Continue chains the next
  mission on level-complete; `?campaign=unlock` dev override); completion derives from the
  existing `rd_progress` record — no new persistence. Instructor snapshot block now exposes
  `scenario_id` + `current_beat_id` (also fixes the diagnosis-export manifest's scenario id).
  **Gate:** `test/run_campaign.js` — structural (missions resolve, trigger vocabulary, dual
  registers, endpoints) + functional (every new scenario driven headlessly to level_complete
  by a scripted operator; qualify win/early-win/fail paths) — 12/12, 391 checks.
  **Physics findings honored (probed, not guessed):** manual load targets couple weakly
  (1000→800 ask settles ~944 MWe, Tavg +9 °C — taught in-mission as "the slider asks, the
  physics answers"); a large manual step (→500 MWe) trips on load rejection; post-trip Xe
  crests ~113.6% eq at ~5 h (the xenon mission rides exactly that arc); HZP SUR blips during
  rod motion are subcritical multiplication, not criticality (criticality detected at
  power > 1%, matching `pwr_startup`); **an SBO is unsurvivable in current physics** (SG
  pins at 20% under AFW, inventory drains via PORV by ~14 min) — exam redesigned off it,
  logged here as an engine tuning target alongside the ops-report findings.
  **Authoring gotchas (for the next scenario writer):** snapshot `current_beat_id` is the
  PENDING beat (armed, not yet fired); the instructor clears operator-action memory on every
  beat fire, so `operator_action` triggers only see commands issued while their own beat is
  pending; composite triggers use `triggers:[...]`; gates persist until their `until` fires.

- **2026-07-07 — RBMK & BWR training campaigns (campaign wrapper now tri-plant).** Plan
  addendum in `Blueprint/pwr_training_campaign.md`. Seven new scenarios: `rbmk_tour`,
  `rbmk_void` (positive void coefficient by hand: flow 80→60 at 50% → power +3%, probed),
  `rbmk_chernobyl` (01:23:40 witnessing — engine destroys pre-1986 `low_power_xenon` in
  ~13 s regardless of AZ-5, so the flagship narrates the inevitability; aftermath beat
  carries the causal chain), `rbmk_az5_fixed` (playable rematch: post-1986 design survives
  the identical state given prompt AZ-5 — probed clean at t+3 s; hesitation loses, with the
  post-86 steam-explosion tuning gap voiced in-mission), `bwr_tour`, `bwr_recirc` (probed
  ladder: ask 22/25/28/32 → 63/71/79/89%), `bwr_isolation` (MSIV slam: trip, indicated-level
  shrink to ~28%, steam-driven recovery — shrink/swell as the teaching point),
  `bwr_fukushima` (from `post_scram_sbo` + `early_battery_failure`; IC decision branch buys
  ~4 h, both branches end at uncovery — support-failure taxonomy capstone), `bwr_qualify`
  (precision recirc maneuver 75–85% band, >95% fails; the unfireable high-flux trip is
  briefed as the exam hazard). Probed findings: BWR `set_recirc_flow` pct is an internal
  ~2.5× ask scale (ask 40 = 100% flow; big asks → sustained 110–130% overpower with no
  trip); BWR failure injections (`rcic_failure`, `hpci_failure`) do not disable
  auto-actuated systems, and BWR upsets self-recover — hence a maneuvering exam, not an
  emergency one; `bwr_sbo_rcic`[P] excluded (finding B3). Gate: `run_campaign.js` 24/24
  suites / 686 checks (structural for all three campaigns + functional happy/failure paths
  for every new scenario). Regression: RBMK 23/23, BWR 12/12, M6 16/16, M5 17/17,
  procedures 20/21 (pre-existing).

- **2026-07-07 — Playtest hardening pass (all three campaigns + M5 rewind).** A persona
  playtest (`Diagnostic/PLAYTEST_REPORT.md`: first-timer, ~220 wpm, one fumble per act,
  real headless stack at UI cadence) found systemic pacing and softlock defects; all fixed:
  **M5 rewind walk-back** — repeated ⏪ presses now walk back one checkpoint each via a
  `_rewindCursor` (cleared on every checkpoint push); previously the broadcasts between two
  presses defeated the exact-time guard and every press restored the same newest checkpoint,
  so failure cards ("Rewind to the decision") could never be escaped. **Trip-catch branches**
  — `pwr_tour` (`load_lost`), `pwr_load_follow` (`grid_lost`), `pwr_boron` (`overdone`):
  guided missions that leave the throttle/chemistry unlocked now land on a failure card with
  Rewind instead of softlocking under a stale prompt (greedy 500 MW ask trips at ~71 s;
  boron mis-press at 30× high-flux-tripped the plant). Pattern: the PROMPT beat itself
  carries `branches` (scram catch + success condition) — `current_beat_id` stays on the
  watcher, so scripted drivers `settle()` past the prompt's fire before acting.
  **pwr_boron** re-paced 30×→8× with `set_boron_adjust rate:0` commands on each prompt
  (reading time is never penalized). **bwr_fukushima decision beat at REAL TIME** — the IC
  decision was unreachable for a first-time reader (60× + 300 sim-s window = 5 wall-s under
  a 105-word card); now: hold phase delay 2400 at 60× (~40 wall-s), `batteries_die`
  `speed:1` + `inaction:150` real seconds. **pwr_feedback re-anchored** — `setup_commands`
  pin demand at 500 MWe (in Follow, the rod nudge dragged output 498→574 and the demand
  demo fired 0.1 s after arming); demo now `set_steam_demand 650`, complete at
  `all[mwe>585, delay 200]` — probed visible ~20 wall-s climb with Tavg falling on cue.
  **pwr_tmi recovery closes the block valve** (beat command; the historical ~06:22 action)
  — HPI alone plateaus below the 11.1 °C restoration setpoint, so the "Averted" ending was
  unreachable at HEAD (pre-existing red check in `run_scenarios`, now 3/3); `damage_path`
  30×→10×. **pwr_qualify** — isolation branches grade `block_valve_open` true-state (added
  to PWR `getTrueState`, additive) instead of `operator_action` (a press before `fault`
  fired was wiped from action memory → exam never ended); `fault` issues
  `open_block_valve` (briefed "normal lineup") so pre-isolating during the briefing neither
  cheeses nor softlocks; frozen window 600→300 s. **pwr_protection** `stabilizing` accepts
  `any[ack, delay 60]` (an ack during the 12-s flood window stalled the mission).
  **Read-pacing bumps** (220 wpm rule: delay ≥ words/3.7 + margin) across `pwr_hook`,
  tours ×3, `pwr_xenon` (shutdown 300×→150×, peak 600×→300×), `pwr_chain_reaction`
  (`critical` 5×→1× — the climax card lasted 3.6 s), `rbmk_chernobyl` (`az5` text moved to
  the aftermath card — it lived 1.0 s), `bwr_isolation`. **Procedures** — startup notes now
  advise Norm-until-SUR-stirs (Slow-throughout measured 13.7 min PWR / never-in-10 min for
  burst play vs 3.2 min at Norm), SUR caution admits the coarse bank reads ~2 DPM;
  `bwr_raise_power` retargeted pct 40→28 with a >=95% guard (pct 40 parked the plant at
  114% sustained — contradicting `bwr_qualify`'s >95% fail rule); `rbmk_mcp_trip` notes the
  RPS may trip first. **Findability** — `SYN_CONTROL_MAP` aliases (Mode/Load/Rod
  motion/Nudge/Boron — these beat highlight labels glowed nothing), DIL/BOR named as
  labeled, two-press SCRAM taught in `pwr_hook`. Gate: `run_campaign` 24/24 (723 checks —
  failure paths for tour/boron/qualify-pre-isolation added); `run_scenarios` 3/3 (was 2/3
  at HEAD); M5 17/17, M6 16/16, PWR 13/13, RBMK 23/23, BWR 12/12, M4 11/11,
  `verify_manual_follow` 81; `run_procedures` 20/21 and `run_e2e_controls` 23/25 unchanged
  from HEAD (pre-existing findings B3 / LPI-accumulator). Persona re-verification: 17/17
  (TMI rewind→decision→Averted in 2 presses; honest reader reaches the Fukushima IC card;
  boron fumble completes; early ack proceeds; az5 rewind rematch wins; feedback demo holds
  20 s; frozen exam fails at 6.2 min).

- **2026-07-07 — Playtest hardening, round 2 (confidence-list follow-ups).** The residual
  uncertainties from the playtest pass, closed with fixes rather than caveats:
  **UI commentary min-dwell queue** (`app.js renderInstructor`): the instructor layer keeps
  only its latest message, so any beat cascade faster than reading speed destroyed text
  forever; the UI now holds each card ≥ words/3.7 s (capped 16 s) and queues successors
  (depth 3). Blocked-command feedback bypasses the queue (the player just clicked);
  `level_complete` flushes it. **Endpoint commentary was never displayed at all** — the LC
  panel painted over the completing beat's card in the same broadcast; `renderLevelComplete`
  now renders the message (`.lc-msg`) above the panel. **Rewind-pick exactness**: strip-chart
  picks send `{rewind, steps, exact:true}`; M5 skips the press-semantics guards for exact
  picks (a second pick while paused could otherwise land one checkpoint early).
  **Cross-plant snapshot race fixed** (pre-existing): a `?scenario=` deep link that switches
  the plant let the new plant's snapshots reach the old profile's gauges/chart/synoptic —
  three distinct `.toFixed` crashes killed the whole render pass; `render()` now detects the
  plant mismatch and runs `afterPlantChange()` catch-up, plus a defensive read in
  `renderGauges`. **`pwr_sg_flood` was unwinnable since authoring** (caught by the new
  coverage guard): its `imbalance` trigger used a malformed shape (`instrument_id`/`high`/
  `setpoint` — not M6 vocabulary) and could never fire; repaired to
  `instrument sg_level above 75` (probed: floods to ~100% in ~2 sim-min) and its gauge
  highlight `sg_level`→`sg`. Now functionally tested. **Highlight coverage is a structural
  gate**: `pwr_synoptic.js` exports `highlightLabels`; `run_campaign` asserts every campaign
  beat's `control_label` (PWR) and `instrument_id` (all plants) resolves to a real target.
  **Seed sweep**: tour (happy+greedy), boron, feedback (real three-press pattern), qualify
  win, load_follow shift, sg_flood — 35/35 across seeds 1/7/13/42/99. **synoptic_check.html
  resurrected**: it wasn't Edge drift — the harness never got a script tag for
  `engines/load_mode.js` when Load Mode landed, so `pwr_engine.js` threw at load; one tag
  restores 55/55 (`SYNOPTIC-OK`). Also: `pwr_feedback.complete` gained a 600-sim-s fallback
  (three separate +1 presses settle ~560 MWe, under the 585 threshold the single steps:3
  harness command reaches — a demo must not soft-wait on the player's earlier caution).
  Gates: `run_campaign` 26/26 (739), M5 17/17, M6 16/16, scenarios 3/3, PWR 13/13, M4 11/11,
  manual-follow 81, synoptic 55/55; `run_procedures` 20/21 and `verify_e2e_ui` (pwr/primary
  `dhr-on` missing) unchanged pre-existing reds. Known residual: headless probe scripts must
  `process.exit()` — a played SimulationService holds a live interval and the process never
  exits (nine zombie node processes were reaped this session).

- **2026-07-07 — Playtest hardening, round 3 (RBMK/BWR parity pass).** The PWR lessons
  applied systematically to the other two campaigns. **Softlocks confirmed and fixed** (both
  made MORE reachable by round 1's gate additions of scram/ack): `rbmk_void` — a manual AZ-5
  mid-experiment stranded the mission at `restore_task`, and a deep flow cut (probed: 40→30%
  spikes the pre-1986 core to ~120% and TRIPS; 40%/20% spike ~113% without protection) either
  stranded it at `complete` or, if the player touched flow again post-trip, showed the
  SUCCESS card over a dead reactor; `bwr_recirc` — any scram stranded it at `down_task`.
  Both now use the prompt-with-branches pattern: scram → authored failure cards
  (`overpowered` "It Bit" / `tripped`), success composites as branches; `restore_task` text
  acknowledges over-deep cuts. **Highlights added where the text names hardware** (RBMK/BWR
  beats carried none): rbmk_tour boiling→`void` gauge, orm_intro→`orm`; rbmk_void tasks →
  'MCP / Channel Flow'; rbmk_az5_fixed intro → 'AZ-5' + the two-press "arm then CONFIRM"
  wording (seconds matter there); bwr_tour void/throttle/level → `void`/`recirc`/`level`
  gauges; bwr_recirc tasks → 'Recirc Drive'; bwr_isolation intro → `level`;
  bwr_fukushima batteries_die → 'Isolation Condenser (IC)' (auto-reveals the secondary view
  at the decision). **Coverage gate extended**: `run_campaign`'s highlight check now
  validates RBMK/BWR `control_label`s against the PD view-bar label mirror (`PD_LABELS`) —
  note the legacy plant-display labels are 'Recirc Drive'/'RCIC' etc., NOT
  `manual_ui_map`-style long forms; 'AZ-5'/'SCRAM' resolve via the status-bar button.
  **bwr_fukushima bare card** now tells the player Rewind steps back to the DC-loss
  checkpoint (3 presses). Gates: `run_campaign` 26/26 (773 checks — rbmk_void deep-cut and
  bwr_recirc scram failure paths now CI), M5/M6/scenarios/RBMK/BWR/manual-follow green,
  `run_procedures` 20/21 pre-existing. Persona re-verify (seed 11): 7/7.

- **2026-07-07 — Operator Automation layer (the Automate tab) — a deliberate v1-scope
  extension.** CONTEXT §8 deferred "automatic control systems"; built now by user request
  as `layers/auto_control.js` + a Tools-Block **Automate** tab: an AUTO/MAN toggle per
  plant control, so any subset can run automatic while the player works the rest (e.g.
  secondary on auto while hand-flying the primary, or everything auto except grid demand).
  **Architecture:** a *synthetic operator*, NOT a stack layer — it subscribes to broadcast
  snapshots beside the UI, reads **instruments only** (HR1: a stuck sensor fools it — CI'd:
  stick `sg_level` high and the feed channel drains the real SG), and issues ordinary
  commands from the top of the stack (HR5: Instructor gates and M4 interception apply;
  blocked commands surface as a row note). Engines/M4/M5 untouched except one additive
  `control_state` exposure (`heater_auto`/`spray_auto`, mirroring `steam_dump_auto`;
  CONTEXT §6.5 updated). Channel kinds: **mode** (passthrough toggles for automation the
  engine already carries — load-follow, steam-dump auto, PZR heater/spray auto, CVCS
  make-up — displayed state derives from `control_state` each snapshot so the toggle never
  fights the plant, e.g. scram → grid disconnect shows itself); **pid** (PI + feedforward,
  bumpless-transfer integrator preload, anti-windup, PV low-pass, setpoint slew, deadband +
  min-delta/period so the command stream stays sparse); **rods** (bounded `rod_nudge`
  moves — acceleration-safe since the engine ramps to a target — with rate damping);
  **bang** (PWR boron trim on rod position with hysteresis; requires the rod channel).
  Setpoints capture the current reading on engage and are editable (unit-converted in the
  tab). Rod/power channels disengage themselves on scram/meltdown, visibly. Automation
  state is session-only (not in save files); a rewind resets controller dynamics.
  **Control-design findings (probed, not guessed):** (1) a Tavg-dominant PWR rod loop
  limit-cycles for minutes (Tavg integrates the power/draw mismatch) — the shipped
  controller is **mismatch-dominant** (`1.25·(steam% − power%)` + Tavg trim), which glides;
  the governor overdelivers at held Tavg (demand 700 → ~785 MWe, SG pressure 6.3 MPa) —
  physics, asserted as such. (2) The RBMK's lumped rod group is worth ~4 %power/step at
  50 % — single slow-speed steps, ±2 % deadband, kd 15 rate damping, or it limit-cycles.
  (3) The BWR has **no pressure-restoring control** in load-follow: ANY sustained power
  descent (even a bare-plant 40→34 % recirc trim) drains vessel pressure to the 5.52 MPa
  LOCA trip — so the BWR's turbine channel is a **pressure-control PID** (`set_turbine_load`
  holds `vessel_pressure`, the real BWR governor mode), and the recirc channel slews its
  power setpoint (0.15 %/s). **Gates:** new `test/run_autoctl.js` 11/11 (all-auto holds ×3
  plants, demand swing, SP maneuvers, manual+auto mix, HR1 probe, scram stand-down, rewind
  reset, command-sparseness); engines 13/23/12, M4 11, M5 17, M6 16, M7, campaign 26/26
  unchanged green; `run_procedures` 20/21 and `verify_e2e_ui` reds pre-existing. Manual:
  `automate` control entry + AUTO/MAN + Setpoint glossary terms added to the generator and
  regenerated. Dev deep-links added: `?tab=<tools-tab>` and `?auto=<id,…|all>`.

- **2026-07-07 — Automation under time acceleration (fast-forward handoff) + training
  presets.** Probed all-auto holds at 60×/600×/3600× per plant. Findings: the BARE plants
  are acceleration-invariant (per-step physics + engine-side coupling), but broadcast-rate
  automation is not — above ~200× a broadcast is minutes of sim time and NO sampled
  controller stabilizes the boiler loops (full-dt PI integration drained every level to its
  low-level trip; clamped-dt under-integrated 36×; a dt-threshold flapped against the
  normal/transient cadence flip; the dt-observed first step let one broadcast-rate command
  slip out — a turbine left in manual for 6 sim-minutes trips low vessel pressure).
  **Shipped design:** fast regime judged from `metadata.time_acceleration ≥ 200` (correct
  on the first step). In fast: pid channels with a `fastFallback` hand their loop to the
  ENGINE's per-step coupling — feed → the new `set_feed_coupled {active}` command (all
  three engines; re-couples what `set_feedwater_flow` uncouples; CONTEXT §6.7), BWR
  turbine → `set_load_mode follow`, recirc → hold — and re-assert broadcast-rate control on
  slow-down (the next setpoint command uncouples again; integrator re-seeded). Rod
  channels drop to SINGLE steps inside a widened `dbFast` (> per-step power worth) —
  out-paces xenon drift, immune to the sampling-aliasing limit cycle probed at 3600×
  (−1/+1/−2/+3/−5 divergence). Slow regime gains true-dt integration (per-action increment
  capped at 3 design periods) and time-based PV filters (`pvTau`, pass-through at giant
  dt). Result: 9/9 accel×plant holds green; `run_autoctl.js` now 15 suites (3600× holds ×3,
  resume-on-slow-down transition). Engines/M4/M5/M6/M7/campaign/procedures unchanged-green.
  **Training presets:** scenarios and procedures may declare `auto_channels: [ids]` —
  startScenario/followProcedure engage them after the content's plant reset (on top of the
  walkthrough stand-down), so a mission can hand the player one control and put the rest of
  the plant on automatic. No authored content uses it yet (the training-update pass will).

- **2026-07-07 — RBMK Automatic Regulator rod group (resolves F10).** Third RBMK rod group
  `auto_rods` ("Automatic Regulator (AR)") — the authentic RBMK arrangement: manual bank
  (coarse, carries the pre-1986 displacer), AR (fine, normally automatic, overridable), AZ
  shutdown. **Engine:** function `'auto'` takes the pure-absorber branch (NO displacer — the
  positive scram effect stays exclusively on the manual bank); worth via rod_count 0.06 ≈
  510 pcm full travel (~2.2 pcm/step vs the manual bank's ~35); **excluded from ORM**
  (getOrm counts control/manual only) so ORM remains the manual-bank margin — the authored
  orm_target states (incl. the Chernobyl precondition) and the ORM-driven void amplification
  are byte-identical; per-state initial insertion `ar_inserted_frac` (mid-range at
  full_power/50_percent, fully WITHDRAWN at hot_startup/low_power_xenon — historically the
  ARs had been pulled at Chernobyl); scram drives it in like every group; per-state critical
  trim absorbs its initial reactivity. RBMK suite 23/23 untouched, Chernobyl comparison
  green. **Automation:** the `rods_power` channel drives the AR — hold tightens from ±4-5%
  (one manual step ≈ 4% power) to ±1% at 10× (PV low-pass added: power noise σ0.5 ≈ the AR's
  per-step worth), maneuvers land ±2; fast regime gets `fastBudget: 8` (single 2 pcm steps
  lose to xenon at 3600× — probed 0.1%/min behind). New `ar_recenter` channel (real RBMK
  practice): single manual-bank steps when the AR leaves ±25 of mid-insertion, handing the
  standing burden back to the coarse rods (CI'd: a 50→75% swing exhausts the AR, the manual
  bank steps in, the AR recovers 20–80%). **UI:** AR card (Auto/Man/Withdraw/Insert) on the
  RBMK diagram + primary control bars — Auto/Man mirrors the Automate channel (synced per
  broadcast via data-arsync); touching the drive buttons or Man IS taking manual control
  (the pre-accident condition — the Chernobyl beat hook, authored under F11); AR position
  rows in primary/All views. Manual: `ar_rods` control entry + AR glossary; regenerated.
  Gates: autoctl 16/16, engines 13/23/12, M4-M7, campaign 26/26, control audits green;
  `run_procedures` 20/21 pre-existing. **No second manual group** — the AR under manual
  override IS the fine manual bank (user decision).

- **2026-07-07 — AR defaults to AUTO (the plant's normal lineup).** The RBMK's Automatic
  Regulator channel engages by DEFAULT on plant load / reset / file load, capturing the
  CURRENT indicated power as its setpoint — never an authored number, which would fight
  every non-full-power state (at the Chernobyl precondition it would try to drag a poisoned
  core from 7% back up). Guard: `defaultOn(snapshot)` engages only where the state parks
  the AR with authority (20–80% inserted → full_power / 50_percent) and never on a
  scrammed/melted plant — hot_startup and low_power_xenon start the AR withdrawn, so they
  stay MAN (historical, and automation must not run the startup or fight the accident
  setup). Instructed content is unaffected: startScenario now stands automation down
  explicitly after the rebuild (then applies its authored `auto_channels`), walkthroughs
  already did. Machinery is general (`AutoControl.engageDefaults`), data per channel.
  Gates: autoctl 17/17 (default-lineup suite incl. scram guard + capture check), RBMK
  23/23, M6 16/16, campaign 26/26; headless UI confirms RBMK loads AR=AUTO (card synced
  green) and the PWR still loads rods=MAN.

- **2026-07-07 — Training pass for automation + the AR (resolves F11).** Two new campaign
  missions and the Chernobyl tie-in. **`rbmk_ar` "The Steady Hand"** (RBMK Act II opener,
  pre-1986 at 50%): the auto_channels preset (`rods_power`,`ar_recenter`) has the AR
  holding power from the first second; the player takes MANUAL control (driving the AR
  disengages its channel), feels the uncorrected sag, restores 50% by hand, and hands it
  back with AUTO — graded via `operator_action {group_id:'auto_rods'}` + power thresholds,
  Continue via a `manual`-trigger BRANCH (house semantics learned the hard way: when a beat
  has branches, branches are its ONLY exits — a sequential `manual` beat never fires).
  Closing card and the trip-catch card both point at Act III. **`pwr_automation` "Hands
  Off"** (PWR Act III closer): everything on auto except the grid (preset = 6 channels);
  the player is the dispatcher — 1000→700→1000 MWe on the load slider alone, with an
  honest attribution card (physics does the coarse follow, channels trim) and an HR1
  warning (automation trusts the same lying gauges). **The bare plant TRIPS on the 700
  swing** (Tavg → ~319 °C with nobody trimming; probed) — the mission genuinely needs its
  preset, so the campaign gate gained `startScenarioAuto()`: a UI-faithful harness that
  attaches an AutoControl and engages the scenario's auto_channels (first real exercise of
  the preset mechanism end-to-end). **rbmk_chernobyl intro** now reads the AR card too —
  regulators spent, crew flying manual, "the seat you sat in for three minutes at an easy
  fifty percent" — with the AR card highlighted (PD_LABELS gained the label). **Gate
  additions:** mission counts pwr 20 / rbmk 9; auto_channels ids validated against the
  AutoControl catalog; functional playthroughs for both missions incl. scram-catch
  branches. Deliberately NOT done: presets on pre-existing missions (their triggers are
  tuned against bare-plant trajectories — TMI/Fukushima/qualify stay bare by design), and
  both new missions are UNGATED (the automation issues commands down the gated path; a
  gate that admits the player must admit the machine). Gates: campaign 29/29 (882),
  autoctl 17/17, M5/M6/M7/scenarios/manual-follow green; procedures 20/21 pre-existing.

- **2026-07-07 — Campaign fully unlocked (user direction).** Every mission in every
  campaign is playable from the start: the act ordering is a recommended PATH with
  progress markers (✓ done, ▶ frontier, ○ not yet — the frontier still drives the
  "Continue campaign" button), not a gate. Sequential unlock and its `?campaign=unlock`
  dev override are retired (`buildCampaign()` simplification; campaign_data.js header and
  the plan doc updated). Completion tracking unchanged. Campaign gate 29/29; headless UI:
  zero locks, 21/21 PWR entries carry Start/Replay.

- **2026-07-07 — PWR turbine governor: pressure-compensated load control.** The governor
  moves from open-loop (valve = demand; delivered = valve × P_sg/P_rated, overdelivering
  ~12% at held Tavg — a 700 MWe ask ran the SG to 6.3 MPa and delivered ~785) to **EHC
  load-control**: the valve TARGET is pressure-compensated (demand ÷ P/P_rated, clamped
  fully open; 0.5 MPa floor), so steady-state delivered steam ≈ demand at any secondary
  pressure — the valve strokes open as pressure falls, like a real governor holding load.
  Identical at rated pressure; valve lag unchanged. One-line engine change
  (`pwr_steam_generator.js`); PWR suite 13/13 first run (TMI/steam-break/trip untouched);
  ops probes IMPROVED (51/66→52/66, 18→16 failed checks). **The load-coupling physics
  changed character** — recalibrated content: bare-plant demand map is now 900→90.0%
  exact; 800/700 → ~84% at the STEAM-DUMP ceiling (Tavg climbs ~+22–25 °C to the dump
  setpoint, HI TAVG warning annunciates — 5 °C real margin to the 335 trip, 25σ through
  the instrument); 500 still trips (sg_level low). Follow mode lost its accidental
  restoring force (the overdelivery), so `pwr_tour`'s restore is now an explicit ask back
  to 1000 then FOLLOW (beat + scripted test updated). `pwr_load_follow`'s night watch now
  OWNS the amber (dump lifting + HI TAVG acknowledged — a better lesson: the plant asking
  for reactivity support in lights). `pwr_feedback`'s two demos got CLEANER: with the draw
  truly pinned, the rod shove is wrestled ALL the way back (spike 58% → settle 50.2%,
  entire +ρ banked as Tavg +8 °C) and the 650 ask is fully delivered (643 MWe, Tavg
  −25 °C paying for it) — both registers rewritten to the probed numbers. All-auto demand
  700 now settles 725 (was 785); autoctl assertion updated (72±5). Manual regenerated
  (noise-level diffs only). RBMK/BWR turbines unchanged (they already deliver the ask;
  the BWR's pressure control lives in the automation channel). Gates: PWR 13/13, campaign
  29/29 (882), autoctl 17/17, procedures 20/21 + e2e reds pre-existing, M4–M7 green.

- **2026-07-08 — PWR hot-leg DNB + core voiding (enables steam-line-break / loss-of-flow
  AT POWER).** Prep for at-power accident scenarios. Two coupled defects in the lumped
  thermal model: (a) `thot = tavg + ΔT/2` with `ΔT ∝ power/flow` was **unbounded** — at the
  0.1 flow floor / full power it read `tavg+165` (a subcooled leg at 470 °C, nonphysical);
  (b) the DNB heat-transfer collapse (`h_fc_dnb`) was gated on **bulk** `trueSubcooling(tavg)
  ≤ 0`, which needs `tavg=345 °C` — never reached at power, so DNB was **unreachable** and a
  steam-break/LOFA couldn't bite. Fix, grounded in "subcooled liquid pins at saturation":
  **thot clamps at Tsat** (leg split capped symmetrically around tavg, killing the artifact);
  **DNB is judged at the hot leg (core exit)** via a new `_subcool_hot_c` margin and config
  `dnb_margin_c` (8 °C — real DNBR<1.3 occurs subcooled). Normal full-power hot-leg margin is
  24.7 °C, so no false trigger; all accident scenarios are post-scram where `thot≈tavg`, so
  the existing suite is untouched. **Trap found & fixed:** a first cut fed the new flux void
  into the shared `primary_void_fraction`, whose sat-pull / void-surge couplings are
  calibrated for the TMI deception — TMI's erosion phase transiently saturates the exit, so
  the flux term hijacked those couplings and locked the plant into a false saturated
  equilibrium (TMI recovery stalled at 3.5 °C margin vs the >11.1 target; caught by
  run_scenarios, NOT the engine suite — the M6 gate earning its keep). Resolution: flux
  boiling gets its **own** `core_void_fraction` (relaxed, exposed in true_state for
  indication/triggers), and does **NOT** touch the pressurizer couplings — `primary_void_fraction`
  is inventory-only again, so TMI is byte-identical. Its physical bite is the DNB
  heat-transfer collapse alone; a dedicated core-void→pressure coupling is deferred to
  at-power-scenario tuning (an unscrammed LOFA/ATWS wants heatup-pressurization, the
  opposite of the TMI sat-pull — do not reuse it). New config: `dnb_margin_c`,
  `void_flux_gain`, `void_flux_max`, `void_flux_tau` (all `[tune]`, thermal). Probed: LOFA
  at power now drives thot→Tsat, DNB (h_fc 0.05→0.004), core_void→growth, fuel heatup; a
  steam-break correctly reads as an OVERCOOLING event (margin widens, power rises via MTC —
  its hazard is reactivity/PTS, not hot-leg DNB). Manual reference regenerated: no content
  diff (these are internal coefficients, not manual-surfaced). Gates: PWR 13/13, scenarios
  3/3, M7 green, procedures 20/21 (the 1 red is pre-existing bwr_sbo_rcic).

- **2026-07-08 — Steam Line Break scenario (`pwr_slb`, PWR campaign Act IV).** First
  at-power accident scenario, built on the hot-leg DNB / core-voiding physics above. The
  lesson is counterintuitive: a broken *steam* line raises *reactor* power — the secondary
  blows down, the primary overcools, and the negative MTC turns the cooldown into positive
  reactivity, so power climbs with no rod motion. Probed full-stack trajectory (seed 42,
  severity 1.0): power 100→113% over ~60 s as Tavg falls 304→284 °C; subcooling margin
  WIDENS (overcooling, not DNB — `core_void` stays 0, confirming the steam break reads as an
  overcooling event, its hazard reactivity/PTS not hot-leg boiling); RPS auto-trips on
  **pzr-level-low at ~66 s** as the contracting primary drains the pressurizer (not high
  flux — peak 113% is under the 120% trip; and no SI — primary pressure holds ~15.3). Two
  branches at the decision point: manual trip (the craft — recognize the reactivity event and
  scram) → *Controlled*; inaction → the automatics catch it → *Caught by the Automatics*.
  Both safe by design — in this lumped model the scram dominates the cooldown, so there is no
  return-to-power to reproduce; that, plus borated-SI and PTS being unmodeled, is voiced as
  M6 §13 honesty in both endpoints. Wired: `scenarios/pwr_slb.js`, `shell.html` script tag,
  `campaign_data.js` Act IV (PWR missions 20→21), `run_campaign.js` load + count + a
  both-branches functional test. Headless UI boots with the mission under "When Things Go
  Wrong". Gates: campaign 30/30 (919), scenarios 3/3, PWR 13/13, M7 green, procedures 20/21.

- **2026-07-08 — Loss of Coolant Flow scenario (`pwr_lof`, PWR campaign Act IV).** The
  scenario that actually exercises the hot-leg DNB / core-boiling physics (the steam break is
  an overcooling event; loss of flow is the DNB event). An RCP trips at power; forced flow
  coasts down (rcp_trip → stop_pump, coastdown τ 8 s); as flow falls the core ΔT (∝ power/flow)
  drives the exit to saturation → DNB. Probed full-stack (seed 42): with no action thot pins at
  Tsat ~9 s in, `core_void_fraction` peaks 0.063, fuel 693→786 °C, and the **`__true_flow__`
  low-flow trip scrams at ~11 s** (fuel recovers, no damage). A manual scram inside ~6 s
  collapses power before saturation — **DNB is avoided entirely** (fuel stays 693 °C, core_void
  0). That asymmetry is the interactive lesson (trip FIRST — early action prevents the
  phenomenon, unlike the steam break where both branches reach the same safe place). Branches:
  operator_action scram → *Tripped in Time*; `true_state core_void_fraction > 0.02` (a
  true-state author hook — the PWR has no void gauge) → *boiling* → low-flow trip → *Caught by
  the Low-Flow Trip*. Teaches the true-flow trip (HR1 exception, reads real flow — a laggy
  meter would be too slow at coastdown speed) and voices the natural-circulation simplification
  (M6 §13: flow reads 0 with pumps off; v1 doesn't credit buoyancy-driven flow). Probed
  findings not built on: an ATWS (rcp_trip + failure_to_scram) self-limits at ~900 °C via
  Doppler — NO fuel damage — and shows a `scram=Y` flag anomaly under failure_to_scram; loss of
  flow is a survivable event in this model, so no meltdown branch is honest. Wired:
  `scenarios/pwr_lof.js`, shell.html, campaign_data.js Act IV (after the pwr_rcp_trip
  procedure; PWR 21→22 missions), run_campaign.js load + count + a both-branches functional test
  that asserts peak core_void > 0.02 (DNB genuinely engaged). Headless UI boots with the
  mission. Gates: campaign 31/31 (954), scenarios 3/3, PWR 13/13, M7 green, procedures 20/21.

- **2026-07-09 — TMI-2 three-part training module (M5 TMI2 Spec): `pwr_tmi2_p1/p2/p3` + chat-mode
  instructor.** Built the full Fog of War / Under a Microscope / Second Watch module as three
  chained campaign missions (new PWR "Act V — Three Mile Island"; old Act V retitled Act VI;
  PWR 22→25 missions). One master timeline lives in `scenarios/pwr_tmi2_common.js` (physics
  fragments + calibrated triggers + the Part 1/Part 3 parity dialogue — lead-in AND the shared
  accident exchanges are single-sourced per Spec §6/§9; probed full-stack seed 42: scram T+14 s
  on SG level, PORV lift enacted at the scram, stick+lie at reseat+12 s, auto-HPI T+44, PZR LVL
  HI T+55, fuel 1200 °C ≈ T+19 min with HPI secured; isolation+HPI recovers fully even from
  1300 °C, with `fuel_damaged` latched).
  **Engine additions (PWR):** (1) `porv_tailpipe_temp_c` true state + `porv_tailpipe_temp`
  instrument (lag 10 s, range 0–250 °C; warm ~82 °C baseline = historical seat leakage, ~150 °C
  flowing, slow 900 s cooldown after isolation) — the spec's identification beat and deviation
  point 2 had no signal without it; deliberately UNALARMED (the not-being-looked-at is the
  lesson). (2) AFW pump-demand/delivered-flow split: `set_afw` latches `afw_pump_demand`
  through a block; `afw_active` = demand && !blocked; new `afw_pump_running` status instrument
  drives the synoptic run light (honest RUNNING over zero flow — the 1979 read). The
  `afw_failure` M4 interception was REMOVED (the block is the engine's `afw_blocked` state;
  interception would have eaten the pump-demand latch); no test depended on it. (3)
  `fuel_damaged` surfaced in true_state (outcome grading). Instrument SOURCE entries appended
  last — PRNG sequences unchanged (save/restore suite still exact).
  **Instructor layer (generic, data-driven):** beat `dialogue` arrays (speaker + two registers)
  → persistent `chatLog` (cap 300) surfaced as `instructor.chat {log, rev, interactions}`
  (chat-mode scenarios only; `null` otherwise — free-play invariant intact, m6ph green);
  `instructor_interact` internal action + scenario `interactions` tables (request/responses/
  repeat variants/clear_failures — the tag mechanic; recorded for operator_action triggers);
  gate denials echo into the chat in character (deduped); beat `story_min` anchors an
  in-fiction story clock. Save/restore carries chat state.
  **UI:** chat transcript renderer in the instructor card (speaker-styled bubbles, PLAYER
  right-aligned, SYS annunciator style; ack + skip buttons from the pending beat's
  `chat_button`; skip = set_speed 60, the target beat's `speed:1` snaps back); the story clock
  runs on `story_min` anchors so the HISTORICAL durations survive the sim's ~7:1 compression
  (dividers literally teach "about 2 hours pass" — Spec §2.2 guardrail); `ui_policy` is now
  consumed (scenario drives Realistic/Learning synoptic + physics overlay, player settings
  saved/restored); synoptic gains the clickable maintenance tag (`setTag`, occludes the new
  `pwAfwValve` glyph, `instructor_interact` on click) and a Tailpipe-temp row on the Relief
  card.
  **Decisions / open questions resolved (Spec §7):** Part 3 title kept "Second Watch"; ONE
  representative AFW discharge valve/tag (spec's own recommendation); AUX formalized as a named
  character ("Marty") with the chip label kept generic "Aux Operator". Part 1 pacing acks are
  `any(manual, delay 90–120 s)` — softlock-proof and headless-drivable. Part 3 outcome tiers
  grade the PLANT (subcooling restored / fuel_damaged latch / inventory refilled), not a
  deviation checklist: Eventful Shift (full), Plugged-Not-Refilled (isolation w/o make-up),
  Caught Late (damage then player termination), Holding-Not-Won (HPI tug-of-war, never
  isolated; 600 s watch branch prevents the softlock — with HPI defended, fuel never reaches
  the identification threshold), History Repeated (crew terminates at the historical mark).
  `afw_failure` is injected at scenario START (setup_commands — the tag was hung last shift,
  true to history) so a pre-accident tag pull works. Known minor edge: pulling the tag AFTER
  the scripted 8-min discovery replays "found them shut" dialogue against already-open valves
  (accepted, logged). Historical trip cause differs (sim trips on SG level; 1979 on high
  pressure) — Part 2's Chief owns the compression/honesty notes (single-sensor, containment,
  7:1 timeline).
  **Gates:** PWR 13/13 (PRNG-exact), M4 11/11, M5 17/17, M6 16/16, M6PH 8/8, M7 green,
  campaign 36/36 (1313 checks — incl. 5 new TMI-2 functional playthroughs: P1 historical +
  gate-block, P2 replay, P3 full-save + graceful-history; structural gate now also validates
  dialogue registers, chat_button styles, and interaction tables), scenarios 3/3, procedures
  20/21 (the one FAIL is the pre-existing bwr_sbo_rcic step-3 tuning gap — unchanged by this
  build), manual regenerated (PWR 25 indications).

- **2026-07-09 — TMI-2 chat pacing (playtest feedback).** (1) Transcript lines now REVEAL ONE
  AT A TIME on a real-time reading cadence (~220 wpm, clamped 1–7 s; display-only — the
  engine's log/determinism untouched). Chat buttons and the level-complete panel are held back
  until the exchange has fully revealed; player-outgoing bubbles show immediately; an ack/tag
  click releases the current reading dwell ("I've read it"); a rebuild over existing history
  (register switch, restored save) shows the backlog instantly and paces only what follows.
  (2) Elapsed-time dividers are now OPT-IN per beat (`time_skip: true`, stamped onto the chat
  entry by the instructor layer): only the authored compressed stretches show "⏱ about N pass"
  (P1 b14_ident ~2 h; P2 p2_b6/b7/b8; P3 p3_b15_ident). A continuous conversation never shows
  an artificial time jump — the story-clock timestamps carry the drift silently. Gates re-run
  green (campaign 36/36, M6 16/16, M6PH 8/8) + browser check: first paint = 1 line, button
  held during reveal, zero dividers in the lead-in.

- **2026-07-10 — Plant & Mission window (Training tab retired).** Plant selection + start-mode
  selection moved from the sidebar into a proper modal (`#missionOverlay`, Sim tab →
  "⚛️ Plant & Mission…"): a plant column (PWR / RBMK pre / RBMK post / BWR cards, the active
  one badged) then four nested mode tabs — Free Play (starting-condition picker + start
  button), Campaign, Scenarios (now FILTERED to the selected plant/design version; the old
  tab listed all plants), Walkthroughs. Nothing touches the running sim until a start button
  is pressed. The Training tab is gone from the tool box; the Sim tab now shows a read-only
  Plant/Mode summary (live via `updateSimSummary()` in render) and inherits the Reactivity
  Computer rows. `engineSel`/`initState` selectors deleted; `switchEngine(key, init?)` takes
  the chosen starting condition; campaign helpers (`campaign`, `missionArtifact`,
  `campaignFrontier`, `campaignHtml`) take an optional engine key so the window can browse a
  non-active plant; plant-bound starts (`walkthrough`/`procedure` missions) `ensureEngine()`
  first, scenarios reset to their own plant as before. Deep links: `?missions=1` opens the
  window, `?mmode=<mode>` picks the tab, `?tab=training` kept as a compat alias that opens
  the window. Gotcha re-hit: `.plant-card` is owned by the PWR synoptic CSS — modal uses
  `.mplant-*`. Verified headless (window all 4 modes, Sim tab, cross-plant `?scenario=`
  deep link) + synoptic harness 55/55.

- **2026-07-10 — Shell UX refinement (full review pass, synoptic excluded).** A four-tier UX
  review of every shell surface (diagram + its controls excluded — new_diagram_controls.md owns
  those). (1) **Dead/dishonest controls fixed:** the instructor "Acknowledge" button is now the
  real scenario Continue (`instructor_continue`, releases the reading dwell; M8 §9 intent) and
  the walkthrough nav (Prev/Next/Rewind/↺/✕) vs Acknowledge+Rewind rows are CONTEXTUAL
  (`syncInstrNav`: follow / scenario / chat / lc / idle — a button that can't act isn't shown);
  ↺ Restart works via the existing `follow_nav {dir:'restart'}` pass-through (it was only dead
  outside follows); the dead Audio toggle row was REMOVED (returns with the audio pass); the
  "Advanced instrument failure" teaser now opens a real panel (instrument × stuck/drift/noisy/
  dead × value → `set_instrument_failure`; instrument names from RD.MANUAL indications; applied
  list tracked UI-side); Values Display is hidden for the PWR (synoptic owns truth presentation
  — an inert setting must not render); the strip-chart scrubber is honest (head pinned at LIVE,
  track click = rewind-pick mode, ⏪ labeled "Rewind"); duplicate static `#ffBadge` removed from
  shell.html (buildViews and the synoptic each inject one); dead `.shell-ribbon` CSS deleted;
  page title de-alpha'd. (2) **Discoverability:** an always-visible STATUS LINE under the sim
  controls (`#simStatus` — "PWR · Free Play — Hot Full Power", click → Plant & Mission;
  change-guarded `updateSimSummary()` runs every instructor render) fixes "nothing says what's
  running / the campaign is invisible"; a `?` help button + one-screen guide (`#helpOverlay`,
  `?help=1` deep link) covers the quiet-board color language, instruments-can-lie, where things
  live, and shortcuts; the System Scanner now answers CLICK/TAP as well as hover (touch), idle
  text says so. (3) **Focus model:** strict accordion in free play, SPLIT VIEW during live
  content — `setFocus(which, user)`: opening a tools tab mid-mission no longer collapses live
  guidance, a chat reveal no longer slams a tool shut; persona click still maximizes the
  instructor. This supersedes the planned unread-dot (no reachable collapsed-with-unread state
  remains). (4) **Consistency:** Diagram Mode reads Teaching/Realistic and Register reads
  Terminology — Plain language/Industry (display labels only; `learning`/`industry` values and
  URL params unchanged); "Free Play" standardized (was Free play/Sandbox); destructive plant
  actions (ADS, SLC, breaker open, PORV isolate) use the SCRAM two-press arm idiom
  (`armedConfirm` — CONFIRM? for 3 s) instead of native `confirm()` (Reset keeps `confirm` —
  sim lifecycle, not plant); app-level feedback is a toast (`showToast` — save/load/bad-file;
  replaces `alert`); alarm header counts unacknowledged ("Alarms (3)") and unack tiles carry an
  explicit ACK chip; manual Normal Values speak board language via generated `ts_labels`
  (TS_LABELS in gen_manual_reference.js — labels only, mval/tsCell add units; normalized flows
  ×100 %, _pct %, pcm/DPM/RPM/MWe/ppm/rods per convention) and Glossary/Indications get a
  client-side filter box. (5) **Input:** global shortcuts (Space play/pause, 1–5 speeds, A
  ack-all, M manual, ? help, Esc close — skipped in fields/modifiers; Space defers to focused
  buttons), keydown/keyup drive the press-and-hold rod buttons (was pointer-only), global
  `:focus-visible` outline + `button:disabled` styling. Gates: gen_manual_reference re-run;
  procedures 20/21 (known bwr_sbo_rcic step-3 gap); campaign 36/36 (1313 checks); synoptic
  harness 55/55; verify_e2e_ui still fails only the pre-existing stale `dhr-on` expectation;
  PLUS a new playwright-core interactive harness (scratchpad) — 36/36 (ack/continue, restart,
  split view, adv-failure inject, scrub pick, two-press ADS arm+timeout, shortcuts, filter,
  alarm ack chips/count, toasts wiring).
- **2026-07-15 — Control layer split: kernel + per-plant control modules (stage 1 of the
  control-layer rework).** `layers/control_failure_layer.js` moved verbatim to
  `layers/control/control_kernel.js` (class attached as `RD.ControlLayer` with
  `RD.ControlFailureLayer` kept as a compatibility alias) and the three protection-data files
  moved out of the engines into per-plant control modules: `engines/<p>/<p>_protection.js` →
  `layers/control/{pwr,rbmk,bwr}_control.js`, each attaching `RD.<P>_CONTROL` plus the legacy
  `RD.<P>_PROTECTION` / `cfg.protection` names (the engines' failure dispatch reads
  `cfg.protection.failures`, and the RBMK module still loads before `rbmk_config.js` for
  `forVersion()`). Rationale: the coming per-plant automation channels and new PWR systems make
  the control layer a first-class per-plant artifact; the kernel stays generic (HR3), so the
  split is a data relocation, not a fork. One behavior-adjacent hardening added now:
  `loadState` rebuilds the `actuationFired`/`interlockActive` latch arrays to default-false when
  a save's array length disagrees with the current config (old saves survive actuation-list
  changes; a standing condition may re-fire one actuation, which is the safe direction).
  Loaders updated (shell.html, test html pages, all `test/run_*.js`, `tools/gen_manual_reference.js`,
  `test/run_procedures.js` — the two list-based loaders now take explicit repo-relative paths).
  Gates: engine suites 13/13·23/23·12/12, m4 11/11, m5 17/17, m6 16/16, m6ph 8/8, M7 OK,
  autoctl 17/17, scenarios 3/3, campaign 36/36 (1313), `gen_manual_reference` output
  byte-identical; pre-existing baselines unchanged (ops 52/66 tuning targets, e2e_controls 23/25
  — the two LOCA LPI/accumulator checks, procedures 20/21 — bwr_sbo_rcic step 3).
- **2026-07-15 — Operator automation moved IN-STACK (stage 2 of the control-layer rework;
  spec: `M4b_control_layer.md`).** The channel runtime (pid/rods/bang/mode machinery) ported
  from the UI-side `layers/auto_control.js` into the Control Layer kernel; per-plant channel
  CATALOGs moved into `layers/control/{pwr,rbmk,bwr}_control.js` as `channels:` data
  (tuning unchanged). Channels now evaluate every **0.1 sim-s inside the physics loop**
  (M5 tick calls `layer.stepAutomation(dt)` per step), so control is
  **acceleration-independent** — the entire fast-forward apparatus (FAST_ACCEL 200×,
  fastFallback plant-side handoff, dbFast widened deadbands, fastBudget bursts) is DELETED;
  at 3600× the same PIDs hold the same bands with feed staying uncoupled (probed). Automation
  state (engaged/setpoints/integrators) is now saved per channel **id** in the layer's
  saveState — rewind restores controller dynamics exactly (strict improvement over the old
  reset), old saves without the key restore all-MAN. New commands `set_auto_channel`
  (id or "all") / `set_auto_setpoint` descend the stack (HR5 — Instructor can gate them);
  channel outputs, trip scrams, ESF actuations, and interlock on_engage all go through
  `_sendInternal` (an `_internal` flag distinguishing plant-issued from operator commands —
  the hook the ESF AUTO/MAN arms and `manual_overrides` disengage build on). The clean-board
  + authored `auto_channels` preset rule moved from app.js into M5's start_scenario /
  start_follow; free-play selectPlant runs `engageDefaults()` (RBMK AR lineup preserved).
  UI: Automate tab is a pure face over `snapshot.automation`; `autoCtl`/`AutoControl` gone.
  One controller fix forced by the cadence change: the PV **derivative estimator** uses a
  fixed ~2 s time constant instead of per-sample smoothing — the difference quotient's noise
  scales 1/dt, and at 0.1 s sampling the kd damping term drowned the rod error (probed:
  Tavg loop limit-cycled ±13% power; with the fix it glides). run_autoctl.js rewritten
  (19 suites, incl. save/load round-trip + 3600× no-handoff probes); demand-swing power
  checks now assert a 100-s MEAN (power breathes a few % inside the rod channel's ±0.5 °C
  Tavg deadband — a point sample lands on an arbitrary phase). Gates: all green at baseline
  (campaign 36/36·1313, ops 52/66 same set, synoptic 55/55, e2e 23/25 + procedures 20/21
  pre-existing).
- **2026-07-15 — HPI/LPI merged into ONE emergency-injection system (stage 3, user direction).**
  `pwr_primary.injectionFlowInv` = a two-segment pump curve — high-head/low-flow (hpi_flow_max
  0.06 inv-frac/s, shutoff 16.44 MPa) + low-head/high-flow (lpi_flow_max×lpi_inventory_gain
  = 0.10 inv-frac/s, shutoff 4.5 MPa) — behind the single `hpi_active` flag; at TMI pressures
  the low-head segment contributes 0, so the flagship is numerically untouched (14/14).
  `hpi_flow_normalized` REDEFINED as delivered/combined-rated (0–1; was raw inv-frac/s — the
  only consumers were a >0 check in ops_pwr and display labels). `set_lpi` is a deprecated
  engine-side alias for `set_hpi`; `lpi_active`/`lpi_flow_normalized` removed from
  true_state/control_state/status (engine `_migrateState` folds a save's lpi_active in);
  instrument `lpi_flow` RENAMED IN PLACE to `hpi_flow` (same SOURCE-map slot ⇒ PRNG sequence
  unchanged, save-side key migration in PWRInstruments.load). Protection: the 2.76 MPa
  `set_lpi` actuation deleted (the 11.03 MPa set_hpi arm covers the one system; the low-head
  regime follows from the curve); alarm relabeled HPI/LPI ACTIVE. Synoptic ECCS card:
  HPI|AFW|RHR/LPI tabs → HPI/LPI|AFW|RHR; the HPI/LPI row shows delivered % of combined rated;
  the low-pressure SVG line animates when hpi_flow > 0.4 (only reachable via the low-head
  segment). New engine suite test `merged_injection_curve`. **e2e LOCA finding:** the old
  "LPI auto-starts at 2.76 MPa" check could NEVER pass — primary pressure floors at Tsat of
  the hot voided core (~5.5 MPa), so 2.76/1.5 MPa were unreachable; the injection check now
  asserts the merged system delivering at the floor (real, passes → e2e 24/25) and the
  accumulator check stays red as the documented blowdown-model gap (tuning target).
  Gates: pwr 14/14, campaign 36/36·1313, ops 52/66 (same set), synoptic 55/55, manual
  regenerated + procedures 20/21.
- **2026-07-15 — ESF AUTO/MAN arms + AFW throttle (stage 4).** Kernel §12: per-plant
  `esf_systems` data ({id,label,commands}); actuation defs carry `arm:'hpi'|'afw'` and evaluate
  only while armed; a non-`_internal` command listed on a system flips it to MANUAL (the
  plant's own actuations are exempt — the stage-2 `_internal` flag pays off); `set_esf_auto`
  re-arms AND clears that system's `actuationFired` latches so a STANDING condition re-fires
  (the point of re-arming). State in `automation.esf` (snapshot + save; absent = armed).
  **How each PWR auto is implemented:** HPI/LPI AUTO = armed for the 11.03 MPa actuation —
  no controller needed, flow modulates physically along the merged pump curve; AFW AUTO =
  armed for the 20 % SG-level pump start, and delivery = capacity × operator throttle
  (`set_afw_flow`, new) × a built-in proportional LEVEL HOLD (full flow below
  afw_level_target 20 %, tapering to zero across afw_level_band 8 %) — this REPLACES the old
  hard `level < 20` cutoff with the same equilibrium minus the chatter, which is why every
  TMI-2/LOFW scenario passed unchanged (campaign 36/36); CVCS make-up stays engine-internal
  (`set_cvcs_auto`) surfaced as the cvcs_makeup channel — migrating a working 50 Hz
  mass-balance loop buys nothing. **Deviation from plan:** the proposed `afw_level` PID
  channel was dropped — the engine-side proportional hold at the AFW target does the same
  job scenario-safely with zero new moving parts; a nominal-level AFW program is a v2 knob.
  New fields: true `afw_flow_normalized`, control `afw_throttle_pct`. Synoptic: HPI/LPI and
  AFW segs got real Auto lamps (snapshot.automation.esf) + an AFW throttle set-box;
  `eccs-auto` is no longer a no-op. Gates: m4 13/13 (arm/disarm/refire + throttle probes),
  pwr 14/14, campaign 36/36, ops 52/66 (same), synoptic 55/55, e2e 24/25, manual regenerated
  (set_afw_flow / set_esf_auto entries; stale fast-forward wording in the Automate entry
  fixed), procedures 20/21.
- **2026-07-15 — FEED PUMP model + three-element control (stage 5, user direction).** The PWR's
  feedwater is now driven through a feed pump: `feed_pump_speed_pct` (commanded) reaches
  delivered `feedwater_demand_frac` through a first-order pump inertia (`feed_pump_tau` 8 s).
  Writers of the commanded speed: MANUAL (`set_feed_pump_speed` 0–120 / `feed_pump_nudge` ±,
  the synoptic ▼▲ + set box — both uncouple), the THREE-ELEMENT channel (`feed_sg` rebuilt:
  SG level (1) + steam-flow feedforward (2) + 25×(steam−feed) mismatch trim (3) → pump speed;
  `manual_overrides` kick it to MAN on any manual pump command; **defaultOn — the PWR's
  free-play lineup**), and the LOAD COUPLING (retained engine-side but RE-PLUMBED to write
  pump speed — the plan's "retire coupling" was softened because instructed content starts
  channels clean and every load-maneuvering scenario relied on coupling for stability; with
  the channel default-on in free play the coupling is effectively the scenario/fallback
  path — deviation documented). `set_feedwater_flow` is a deprecated PWR alias (still real on
  RBMK/BWR); `sg_overfeed` override fixed 1.2→120 (pct-units slip) and its physics effect now
  sets pump speed; `loss_of_feedwater` intercepts the new commands. Kernel `_stepPid` gained
  the `trim` hook, and **anti-windup switched from I-clamping to CONDITIONAL INTEGRATION** —
  the clamp RATCHETED the integrator at an output floor (I forced to uMin−kp·e > 0 with the
  level high) and noise excursions then trickle-fed a zero-steam-draw SG (probed: the
  default-engaged channel overfilled the SG at HZP, 65→100 % in ~15 min; with conditional
  integration HZP holds 65–68 % over 4 h at 3600×). Stability probes: HFP/50 % hold 65±1.2 %
  over 2 h at 3600×. New control_state `feed_pump_speed_pct` (+ deprecated feedwater_flow_pct
  mirror); synoptic Steam & Flow card rebuilt (pump nudge/set, speed readout, "Feed control:
  AUTO — three-element / coupled / MANUAL" status). Gates: pwr 14/14, autoctl 19/19, campaign
  36/36, ops 52/66 (same), synoptic 55/55, manual regenerated (Feed Pump Speed / Nudge
  entries), procedures 20/21, audit PASS.
- **2026-07-15 — Rod auto mode: T-avg hold with variable speed (stage 6, user direction).**
  The `rods_tavg` channel is now the full automatic rod controller the user specified: on
  engage it captures **T-ref := the CURRENT indicated Tavg** (HR1 — the sp.capture idiom),
  compares Tavg to T-ref, and a mismatch (e.g. after a turbine load change) computes rod
  direction + a Westinghouse-style **variable speed ladder** (kernel `speeds:[{above,speed}]`
  on |eEff|: >0.8 °C slow, >2 normal, >4 fast [tune]; falls back to the old two-speed fastAt
  for the RBMK/BWR defs), locking up inside a **±0.8 °C (±1.5 °F) deadband** (db 0.5→0.8).
  The power-mismatch trim term stays dominant (authentic anticipation + the anti-limit-cycle
  finding). `manual_overrides: [rod_nudge, rod_start]` — operator motion on the CONTROL bank
  drops it to MAN (kernel group_id matching; shutdown-bank motion doesn't). Synoptic Rod
  Control card gained an Auto|Man seg + live T-ref readout (mirrors the channel like the
  RBMK AR card). New autoctl probes: T-ref capture, deadband lockup (≤2 nudges/120 s steady),
  manual-motion→MAN, other-group immunity — 20/20. Gates: campaign 36/36, ops 52/66 (same),
  synoptic 55/55.
- **2026-07-15 — RCP heat (stage 7, user direction).** `pump_heat_frac: 0.0055` [tune]
  (~0.55 % of rated core heat ≈ 15–20 MW for a 4-loop plant): `Q_pump = heat_gen_coeff ×
  pump_heat_frac × flow_frac` added to the coolant node (pwr_thermal.stepCoolant), and the
  equilibrium builders (`_computeEquilibriumTemps`, `_buildState`) carry it so the
  full-power refs shift consistently (+0.18 °C — inside every tolerance) and reset stays
  transient-free. Behavior gained (probed): HZP with the steam dump held closed heats at
  ~17 °C/h on decay+pump heat; with the RCPs tripped the heatup nearly stops. **Secondary
  bookkeeping finding:** letting the pump heat cross the SG as EXTRA STEAM made secondary
  pressure creep for hours (the pressure-compensated turbine draws core-power steam only)
  until power sagged out of band — ops "steady endurance 2 h" flipped red and the autoctl
  HFP holds drifted −11 %/10 min. Fix: net Q_pump out of `steam_generation_rate` (booked
  as SG blowdown/ambient losses — the lumped model has no other outlet); all primary-side
  effects unaffected. Gates: pwr 14/14, autoctl 20/20, campaign 36/36, ops 52/66 with the
  ORIGINAL failing set restored, manual regenerated (normal-value baselines shift ~0.2 °C).
- **2026-07-16 — Source-range + intermediate-range nuclear instrumentation (stage 8, user
  direction; setpoints researched from the NRC Westinghouse Tech Manuals).** Engine: detector
  signals proportional to normalized power (`nis.k_sr 5e8` cps/unit → HZP source floor ~500
  cps, SR full scale 1e6 cps ≈ 0.2 %; `nis.k_ir 8.333e-3` A/unit → IR calibrated band tops
  ~1e-3 A ≈ 12 % — the user's "maxes out around 10 %" — with physical over-range to 2e-3);
  `sr_energized` switch state (`set_sr_detector`, HZP starts energized); new true fields
  sr_counts_cps / ir_amps / sr_energized. Instruments `source_range` (cps) and
  `intermediate_range` (AMPS — the units question) appended LAST to the SOURCE map, with a
  new **log-domain instrument mode** (`spec.log`: lag buffer + noise sigma live in log10 —
  a decade of lag is a decade at any level). Kernel §13 extensions (all data-driven): trips
  take `id`/`condition`/`blockable`, config `trip_block_permissive` (P-10 = power_range ≥
  10 %), `set_trip_block` (refused below P-10, register-aware), **auto-reinstate** (blocks
  self-clear when the permissive drops — Westinghouse convention), interlock `blocks_when`
  param predicates, actuation `params` carry. PWR net: SR high-flux scram 1e5 cps
  (condition: sr_energized), IR high-flux scram 1.67e-3 A ≈ 20 % (blockable; the ladder
  P-10 10 % < IR 20 % < PR-25 gives a playable block window — the sim's power COASTS after
  rod motion stops, so a 10–12 % window was a trap; deviation from the plan's "IR trip at
  ~10 %" documented), PR LOW-SETPOINT scram 25 % (blockable), P-6 interlock pair on the SR
  switch (can't secure until IR ≥ 1e-10 A; can't re-energize above 1e-6 A), SR auto
  re-energize actuation when IR < P-6, `sr_high_flux` caution alarm 5e4 cps. **At-power
  lineup:** a layer built (or an old save loaded) with the permissive already satisfied
  starts with the blockable trips BLOCKED — real plants block them at P-10 on the way up;
  without this every at-power state insta-tripped (probed). M7's "each trip warns first"
  invariant now exempts `blockable` trips (their warning IS the blocking procedure; a
  matching IR/PR alarm would sit lit at power). **The SR→IR handoff is now a real skill:**
  ops "by-the-book startup" gained the handoff phase (verify SR floor + IR on scale, secure
  the SR) and PASSES; the "startup yank" ABUSE scenario now trips on SR high flux — ops
  52/66 → **53/66** (the trip fixed a tuning target). pwr_chain_reaction (Act I novice
  mission, rods-only gate) secures the SR in setup_commands and its stale "one wide-range
  meter" honesty notes now describe the real SR/IR + handoff; the manual's
  approach-to-criticality procedure gained NIS-check + handoff steps (STEP_UI/audit map
  updated). Synoptic: NIS block on Power & Reactivity (SR cps / IR amps readouts, SR On|Off,
  IR + PR-25 block toggles with lamps from rps_state.trip_blocks). Gates: pwr 14/14,
  m4 14/14 (conditioned/blockable/P-6/P-10 probes), m7 OK, campaign 36/36, procedures 20/21,
  audit PASS, synoptic 55/55.
- **2026-07-16 — 1/M startup plot (stage 9, user direction).** `ui/panels/one_over_m.js`:
  the app's first DRAGGABLE window (`RD.makeDraggable(el, handle)` exported for reuse —
  pointer-capture on the titlebar, viewport-clamped, z-index 250 above the modals' 210).
  Procedure as specified: PLOT at shutdown captures the source-range INSTRUMENT (HR1) as
  baseline C₀ (plotted as 1.0 at the current rod position); each later PLOT adds
  (rod fraction withdrawn, C₀/C); ≥2 points → least-squares line extrapolated to y=0 with a
  criticality marker + "predicted criticality ≈ N% withdrawn (≈ step S)" readout, shown only
  when the slope is negative and the crossing lies beyond the last point (else "insufficient
  trend"). Refusals: SR de-energized, no reading, counter pegged (>9e5 cps). SESSION TOOL by
  design — not in save files (an operator's scratchpad, not plant state); self-clears on
  plant change, reset, or a rewind past the last captured point (subscribes to broadcasts).
  Opened from the NIS block's "1/M plot" button. **Layout finding:** the NIS block made the
  Power card overflow under the Rod card (absolutely-placed margin cards) — fixed by (a)
  compacting NIS to three lines inside a COLLAPSIBLE section (auto-opens when the SR is
  energized = a startup lineup; user toggle wins) and (b) a generic
  `.plant-card:hover { z-index: 5 }` hover-raise so an expanded card's controls stay
  reachable over a neighbor. Verified interactively (playwright-core over headless Edge,
  13 checks): open/drag/close, SR-off + pegged refusals, DOM-driven fit math (synthetic
  startup predicts 60.0 % exactly), clear semantics; synoptic harness 55/55. Real-physics
  probe: from HZP the source-range 1/M line falls 1.000 → 0.207 across the withdrawal and the
  mid-approach all-points fit predicts 21.2 % withdrawn vs 27.6 % true criticality —
  conservative-early and converging as points land, the genuine 1/M phenomenon (rod worth is
  S-shaped); an un-secured SR correctly TRIPPED the same startup at criticality.
- **2026-07-16 — PWR MSIV + SG code safety valves (stage 10, user direction).** Engine:
  `msiv_open` state with `open_msiv`/`close_msiv`; both downstream paths (turbine steam AND
  dump-to-condenser) gate on it; closing with the generator loaded calls tripTurbine (real
  MSIV closure = turbine trip). New SG code safeties UPSTREAM of the valve — pop 9.31 MPa /
  reseat 9.0 / proportional to 1.2 rated [tune], above the 8.90 no-load dump setpoint so the
  dump does normal duty and the safeties are the bottled-SG backstop. **Behavior finding:**
  at power the bottled SG does NOT settle into a quiet hot standby — Tsat(9.3 MPa) ≈ 305 °C
  barely exceeds normal Tavg, so the safeties keep drawing near-full core heat while the
  tripped turbine's coupling zeroes feed: the SG DRAINS, and in the assembled stack the
  low-SG-level trip scrams the plant (~2 min). That IS the teaching outcome; the engine
  suite asserts the physics half (safeties lift ~7 s, band held, no steam past the valve,
  SG draining, dump restored on reopen — `msiv_closure_at_power`, 15/15) and a full-stack
  probe in run_m4 asserts the protection half (level scram + MSIV SHUT annunciator; the
  alarm needed `msiv_open`/`sg_safety_open` added to the STATUS instrument list). Alarms:
  MSIV SHUT (warning, B), SG PRESS HI (caution, 9.0). Synoptic: MSIV Open|Close on the
  Steam & Flow card (two-press confirm on Close; SHUT · safeties-lifting status). ACTS
  msiv-open/close now branch: PWR = the real valve, BWR = the legacy msiv_closure failure
  toggle. Manual: MSIV command/glossary entries; regenerated. Gates: all green at baseline
  (campaign 36/36, ops 53/66, synoptic 55/55).
- **2026-07-16 — Control-layer rework: docs + final gate sweep (stage 11, closes the
  2026-07-15/16 eleven-stage plan).** CONTEXT.md brought fully current: §6.2 automation +
  esf + trip_blocks snapshot sections, §6.3/§6.5 PWR field deltas (merged HPI/LPI, AFW,
  feed pump, NIS, MSIV), §6.7 command catalog with deprecation notes, §7 file map
  (layers/control/), §8 scope amended (operator-selectable automatic control is now an
  explicit scope extension; the LPI/accumulator "do not build" note updated).
  M4b_control_layer.md gained the §12/§13 kernel schema (ESF arms, blockable trips,
  trip_block_permissive, blocks_when, actuation params). SYN_CONTROL_MAP gained the new
  controls (SR detector/NIS/HPI-LPI/Feed Pump/1/M — with an `nis` reveal that opens the
  collapsible section), fixing verify_manual_follow (now 84 checks, up from 81 — the new
  startup-handoff steps verify through the live UI). Final battery: pwr 15/15 · rbmk 23/23
  · bwr 12/12 · m4 15/15 · m5 17/17 · m6 16/16 · m6ph 8/8 · M7 OK · autoctl 20/20 ·
  scenarios 3/3 · campaign 36/36 (1313) · ops 53/66 (better than the 52/66 pre-rework
  baseline) · e2e 24/25 (accumulator blowdown gap) · procedures 20/21 (bwr_sbo_rcic) ·
  audit PASS · manual-follow PASS · synoptic 55/55. Browser smokes: TMI lie intact
  (indicator closed + hot tailpipe), BWR ?auto=all engages 5/5, TMI-2 P1 chat loads.
- **2026-07-16 — Full Blueprint spec-sheet audit & as-built reconciliation (docs only).**
  Eight parallel audits compared every spec against the code; 18 Blueprint docs updated
  (~1300 lines) to as-built reality: M1/M2/M3 tuning tables & superseded models (decay-heat
  production form, AFW proportional hold, feed pump, DNB criterion, BWR implicit kinetics,
  ramped recirc), the protection-data move to layers/control/ in all three file maps, M4/M4b
  (kernel names, generic failure forwarding, direction-aware reset, new §4b interlocks, NIS
  trip net, ESF/HPI-LPI/RHR actuations), M5 (automation/trip_blocks/instructor snapshot
  sections, fixed-dt loop, 10/20 Hz cadence, §6b rewind ring, training-lifecycle routing),
  M7 (§3.6 reality, automation-check gap flagged, test/ ecosystem map), M8 + diagram docs
  (Automate/Dev tabs, Plant & Mission window, synoptic-only PWR surface, chat pane, URL
  params), M6/Gameplay/campaign/TMI2 (real interface + chat/follow/converge coverage, 6 acts
  / 25 missions, six-ending outcome model, Script.md marked superseded), CONTEXT §4 (F6
  deviation + cadence), DESIGN_COMPANION §7/§8.14 (auto-control & LPI/accumulator exclusions
  superseded), OPERATOR_MANUAL_PLAN #4 (RCP heat). **Code findings reported, not fixed** —
  see `Diagnostic/SPEC_AUDIT_2026-07-16.md`: UI-automation concern confirmed RESOLVED (no
  residual control loops in ui/); open items include in-engine turbine trips on true state
  (needs HR7 ruling), kernel `_evaluateCondition` true-state fallback (HR1 gap), two UI
  schematic colorings from true_state, RBMK `orm_alarm_active` from true ORM, the inverted
  severity_meta default bug, dead engine-side setpoint duplicates (BWR), and stale
  manual_procedures text pointing at retired UI.
- **2026-07-16 — Audit-fix pass: mechanical protections move in-stack (owner ruling) + HR1
  closure.** Ruling: turbine trips and relief-valve pop/reseat are CONTROL decisions — moved
  from all three engines into per-plant actuation data reading INSTRUMENTS (PWR pzr safeties
  17.13/16.55 + SG safeties 9.31/9.0; RBMK drum relief 8.0/7.8; BWR SRV 7.58/7.44; turbine
  low-vacuum 74.5 kPa + overspeed trips, all plants). Engines keep valve state + flow
  hydraulics and new commands (trip_turbine, open/close_pzr_safety, open/close_sg_safety,
  open/close_relief_valve); actuation setpoints derive from engine config (single source);
  engine suites keep the protections via an instrument-reading autoM4 harness emulator
  (0.1 s cadence, all three Harnesses; the PWR loss-of-vacuum test now waits out the 5 s
  vacuum-instrument lag). Kernel: condition gates instruments-only (no true-state fallback;
  unresolvable = NOT-met; M7 §3.6 asserts resolvability), severity default =
  (default−min)/(max−min) matching the UI slider (inverted metas via min>max — degraded_hpi
  meta flipped to 100→0 so its label reads true capacity), layer-held == engine-forwarded
  severity, plant literals out of the kernel (busyNote callback), dead branches/set_lpi
  vestiges removed. HR1 sweep: RBMK/BWR board schematics + status rows read instruments
  (channel_flow, recirc_flow, rcic_status, ads_open, eps_bypassed, station_blackout,
  orm_alarm_active); RBMK ORM annunciator derives from the orm_display reading (the
  Chernobyl indicator failure now fools it too); PWR AFW level hold senses the sg_level
  instrument; SG-imbalance annunciator reads indicated power; scram view-switch reads
  rps_scrammed. Failures: degraded_hpi/afw_failure retyped physics_parameter (effects
  degrade_hpi/block_afw — the fictitious command_override typing resolved). Instructor:
  operator_action branches always evaluated before inaction siblings. Test runner: asserts
  automation + trip_blocks + condition resolvability. Misc: RHR gained an ESF arm (synoptic
  Auto button re-arms via set_esf_auto), RBMK void ceiling/knee + sync taus + BWR recirc cap
  48 → config, BWR dead setpoints removed + RCIC harness aligned to the shipping 45.0,
  boron_rate/safety_injection_flow/manual-rod-branch dead code removed, manual_procedures
  startup text un-staled, verify_e2e_ui dhr-on expectation → rhr. Manual regenerated.
  Full battery green at/above baseline: pwr 15/15 · rbmk 23/23 · bwr 12/12 · m4 15/15 ·
  m5 17/17 · m6 16/16 · m6ph 8/8 · M7 OK (new checks + teeth) · autoctl 20/20 · scenarios
  3/3 · campaign 36/36 (1313) · procedures 20/21 (bwr_sbo_rcic, pre-existing) · e2e 24/25
  (accumulator gap, pre-existing) · ops 53/66 (baseline) · audit PASS · manual-follow PASS
  (84) · verify_e2e_ui PASS (16 shots) · synoptic 55/55.
- **2026-07-16 — PWR training campaign v2 (user direction: current controls, logical
  progression, periodic challenges).** The campaign taught the SUPERSEDED feed-follows-load
  coupling as normal (pwr_load_follow "feedwater follows the steam all by itself",
  pwr_sg_flood's coupled-feed premise, the sg_level procedure's dead "Feed Reg" control +
  set_feedwater_flow, stale "Primary/Secondary view" references across seven procedures,
  the qualify blurb still advertising the abandoned SBO exam). Rebuilt to 6 acts /
  31 missions ("Act III — The Controls" now walks pressure → feed pump (manual → the
  three-element channel) → rod AUTO T-avg → power escalation → grid dispatch → full
  automation → a graded shift exam): NEW missions pwr_feed_pump, pwr_rod_auto,
  pwr_startup_challenge (Act II checkpoint: solo criticality with the SR→IR handoff),
  pwr_shift_exam (Act III checkpoint: free-form 1000→850→1000, both manual and channel
  routes pass), pwr_esf (ESF AUTO/MAN arms: auto-fire, MAN drop, re-arm semantics),
  pwr_msiv (closure at power: safeties, the drain clock, reopen-decides-the-heat-path);
  REWRITTEN pwr_load_follow (three-element feed engaged; probed: the unit now rides even a
  1000→0 step — grid_lost became the scram catch; steam dump never lifts; Tavg +18 °C) and
  pwr_sg_flood (pump-left-in-MANUAL premise; both fixes accepted; no trip ever comes —
  the 96 % line is the failure). Probed content facts (all seed 42, CLEAN scenario board —
  start_scenario runs noDefaults, so probes must go through a stub scenario, NOT bare
  selectPlant): AFW arm fires at ~19 % SG ~12 s into LOFW at power but the 12 % RPS trip
  follows ~1.7 s later (no ~20 % pin at power — that's a post-trip number); post-trip AFW
  hold parks ~24 %; re-arming an ESF does NOT reopen an operator-shut throttle; MSIV
  closure at power: SG PRESS HI 5.4 s, safeties 7.2 s, low-SG trip ~50 s (NOT the stage-10
  "~2 min" — that figure predates the feed-pump replumb), and NO reopen timing avoids the
  trip (early = drain, late = shrink) — reopening decides whether decay heat rides the
  dump (reseated safeties) or cycles the bottled safeties indefinitely; solo-startup coast
  from a full pull runs 1 %→19 % in ~42 s with power_range crossing 12 % ~7 s before the
  IR trip (deterministic overshoot card); clean-board 1000→500 still scrams at ~180 s on
  SG LOW LEVEL. Procedures: sg_level rewritten to the Feed Pump + three-element reality
  (control label swapped in manual_ui_map/STEP_UI), card-name language replaces view
  references everywhere, LOFW step notes the AFW arm, boron 30×→8×. Campaign doc updated
  (Blueprint/pwr_training_campaign.md v2 tables). Gates: campaign 44/44 (1730, was
  36/36·1313) · scenarios 3/3 · m5 17/17 · m6 16/16 · procedures 20/21 (bwr_sbo_rcic,
  pre-existing) · audit PASS · manual-follow PASS (84) · verify_e2e_ui PASS.
- **2026-07-16 — RHR/LPI rework (user direction): hot-leg suction valve with a 400 psi
  interlock, HX-flow-split cooldown control, ECCS mode indication.** RHR was a bare
  heat-sink term (`rhr_active` + a 3.45 MPa permissive). Rebuilt to the real
  shutdown-cooling / LPI system. (1) **Hot-leg suction valve** `rhr_valve_open` driven by
  `set_rhr` (`set_dhr` alias): the engine refuses the open above
  `emergency.rhr_valve_interlock_mpa = 2.76` MPa (**400 psi**, was `rhr_permissive_mpa
  3.45`) and **auto-closes** a standing-open valve each step if pressure climbs back above
  it (`pwr_engine.step` §9b — the Westinghouse autoclosure interlock). `rhr_active` now
  mirrors the valve. (2) **HX flow split** `set_rhr_hx {fraction|pct}` → `rhr_hx_fraction`
  scales heat removed (`Q_rhr = rhr_gain · rhr_hx_fraction · (Tavg−sink)`, `pwr_thermal.js`)
  — the operator throttles cooldown *rate* with total loop flow constant, so *no net
  inventory change* (RHR is recirc hot leg→HX→cold leg; the RWST-fed injection path is the
  merged HPI/LPI curve = LPI proper). (3) **`eccs_mode`** ∈ {HPI,LPI,RHR,off} derived each
  step for one ECCS card: RHR when the valve is open, else HPI/LPI split at the 4.5 MPa
  low-head shutoff. **LPI stays merged** (user ruling): the low-head regime of the one pump
  curve, armed by the 11.03 MPa Safety Injection = the LOCA signal — no separate actuation.
  Control layer: RHR auto-align setpoint 3.45→2.76 to track the interlock (a higher one
  would silently no-op); `set_rhr_hx` deliberately kept OFF the `rhr` ESF arm (throttling
  rate must not disarm the valve auto-open); `valueFieldFor` maps `set_rhr_hx`→`pct`. UI
  left to the user (backend-only per direction) — binding contract in
  `pwr_synoptic_prerequisites.md` §6.2a. Docs: M1 §6.9 + tuning table, CONTEXT §6.5/§6.7,
  M4b §3b, synoptic prereq §6.1/§6.2/§6.2a, manual reference regenerated. Save migration:
  `rhr_valve_open ← rhr_active`, `rhr_hx_fraction ← 1.0`. New engine self-test
  `rhr_valve_and_mode` (8 ✓). Gates: run_pwr 16/16 (85) · e2e_controls 27/28 (accumulator
  blowdown gap pre-existing) · m4 15/15 · autoctl 20/20 · scenarios 3/3 · campaign 44/44 ·
  ops_pwr 15/19 (tuning targets, unchanged from baseline) · procedures 20/21 · audit PASS ·
  manual-follow PASS · verify_e2e_ui PASS.

### PWR pre-ship review (2026-07-19) — outcomes + rulings

Full findings log: `Diagnostic/PWR_SHIP_REVIEW_2026-07.md`. Plan:
`Diagnostic/PWR_SHIP_REVIEW_PLAN.md` (+ Amendment A1). Seven phases; PWR-scoped, BWR/RBMK
touched only to prove shared-layer changes didn't regress. Post-review gate baselines match
the README *Project status* block. Key outcomes:

- **C4 (FIXED).** A manual operator `scram` now latches `rps_state.scrammed` in the control
  kernel (before interception, matching the automatic trip path). The automation stand-down's
  `|| true_state.scrammed` dual-read collapses to `this.rps.scrammed`; the snapshot-level
  dual-reads (simulation_service/instructor) are kept defensive.
- **C2 (RULING — documented limitation, ship as-is).** Protection evaluates once per broadcast,
  so trips are late in sim-time at high acceleration. The PWR is safe even at 256× — `ops_pwr
  abuse_accel_latency` proves it trips and does **not** melt. The "small tick() fix" is NOT
  low-risk (shared cadence contract; would flip the deliberate RBMK RED C2 guard — out of scope).
  Revisit per-substep protection post-ship only if a plant can damage within one broadcast.
- **C3 (OPEN, post-ship).** No `reset_rps` recovery-from-scram path; a feature, not a fix.
- **Phase-3 code fixes.** Rewind double-step/double-broadcast (in-tick instructor `_restore`
  now `silent`); `_initialEsfArms` condition gate given the live instrument map; automation
  `requires`-note null-guarded; `p_pumpsuction` floored at 0; stale spray-floor comment fixed.
  No crashes / NaN / reversed-sign / bypassable-cap found (four-agent read-for-bugs pass).
- **Phase-4 Mode-5 UI (ship-blockers FIXED).** The Mode-transition heatup missions were
  unplayable from the real UI: RCP **Run** issued `clear_failure` (a no-op from cold shutdown)
  instead of `set_rcp{running:true}`, and there was no pressure-/steam-dump-**setpoint** control.
  Fixed the RCP buttons (`set_rcp`) and **added Pressure SP + Dump SP controls** (owner-ruled).
  The campaign gate missed this because it only checks a highlight resolves to a card, not that
  the card can issue the instructed command. Remaining Mode-5 polish (post-ship): `plant_mode`
  text indicator, explicit `eccs_mode` readout.
- **Documented known limitations (not fixed).** Decay-heat undercount on an un-scrammed runback
  (`pwr_engine.js:220` — intersects the DEFERRED P2-A load-follow tuning; needs a ruling);
  transient-cadence rounds 1× to ~1.2× real-time during transients; `set_speed` unclamped
  (UI-unreachable); save/restore drops mid-beat instructor counters.
- **Deferred (owner ruling, A1).** P2-A `ops_load_follow` partial-load Tavg 291.5 < 293 band —
  ship target is ops **19/20**, not 19/19; the test stays honest, not weakened.

### Website Phase W1 — static shell (2026-07-19)

Spec: `Blueprint/WEBSITE_SPEC.md` (Vercel + Supabase; anonymous-first; owner-facing
analytics — decisions locked with owner, incl. ReactorDynamics.com, no GitHub link while
the repo is private, keep-raw event retention with a 100 MB tripwire). Built in this pass:

- **Root `index.html` replaced** (was a meta-refresh redirect): landing with hero
  (owner-provided `site/hero.png`; `onerror` collapses the frame while absent), plant
  picker (PWR live → `ui/shell.html?engine=pwr` — the existing engine param, no sim
  changes; BWR/RBMK dimmed COMING SOON, deliberately not links), feature strip, footer
  disclaimer. `about.html` / `privacy.html` / `feedback.html`; shared `site/site.css`
  reuses the shell.css quiet-board palette so site → control room reads continuous.
- **Feedback W1 fallback is a download, not mailto** — a `rd_feedback_*.json` bundle
  (schema mirrors the future `POST /api/feedback` payload: category/body/email/diag)
  with client-side validation of attached `rd_diag_*.json` (`kind` check, 2 MB cap) and
  the W2 honeypot field already in the DOM. Mailto was rejected to avoid publishing a
  personal address; W2 replaces only the submit handler.
- **`site/version.js`** is the deploy stamp seam (repo placeholder; Vercel build step
  overwrites from `VERCEL_GIT_COMMIT_SHA`). **`.vercelignore`** ships only the sim +
  site (verified: ui/ makes zero runtime fetches — Manuals content is embedded in
  `ui/manual_data.js`, so excluding `Manuals/` etc. is safe).
- **Gate:** scratchpad headless-Edge Playwright harness, **12/12** — landing links,
  coming-soon non-links, package/validation/required-field flows, shell reachability
  via the landing path, zero console errors (hero.png miss excepted while pending).
- **Remaining for W1 done-done (owner):** create the Vercel project, connect repo,
  drop in `site/hero.png`, point ReactorDynamics.com DNS.

### Website W1 addendum — in-sim feedback, no player uploads (2026-07-19)

**OWNER RULING (2026-07-19) — verbatim not recorded, so advisory under HR11: players can never upload their own files.** Feedback telemetry attaches
ONLY from the live session. Spec §6 updated.

- `ui/app.js`: `exportDiag()` split into `buildDiagBundle()` (returns the schema-1.0
  diagnosis bundle) + `downloadJSON()`; Dev-tab export unchanged in behavior. New
  `sendFeedback()` builds `rd_feedback_<cat>_<plant>.json` (category/body/email/
  site_version/diag) with `diag` from `buildDiagBundle()` when the pre-checked
  "Attach this session's telemetry" box is on. W2 swaps only its tail for the POST.
- `ui/shell.html`: 💬 button (sim-controls row, after ?) + `#feedbackOverlay`
  (mission-overlay pattern; Esc-close wired into the global handler; status line
  clears on open). Loads `../site/version.js` so reports carry the deploy stamp.
- `ui/shell.css`: `.fb-*` form styles; **gotcha** — `.help-modal{height:auto}` (L455)
  loses to `.mission-modal{height:min(84vh,760px)}` (L1089, later same-specificity),
  so the feedback modal needed `.mission-modal.fb-modal{height:auto}` appended at
  file end to size to content. The help overlay itself still stretches (pre-existing).
- Site `feedback.html`: file input + client-side diag validation REMOVED; form is
  text-only, always `diag:null`, notice points at the in-sim 💬 for telemetry.
- **Gates:** scratchpad harness 20/20 (incl. overlay open/error/download, diag
  attach/omit, Esc close, no-file-input assert); `verify_e2e_ui` PASS (16 shots);
  `run_e2e_controls` 30/30.

### Website W1 addendum — `vercel.json` (2026-07-19)

Deploy config added so the Vercel import needs no dashboard-only settings:

- **`rewrites`: `/sim` → `/ui/shell.html`** — wires the clean route the spec's site map
  (§2) always listed but nothing implemented. Query strings pass through, so
  `/sim?engine=pwr` works. **In-page links stay relative** (`ui/shell.html?engine=pwr`)
  on purpose: absolute `/sim` hrefs would break `file://` and the headless harness,
  which open pages off the filesystem. `/sim` is the shareable URL, not the internal one.
- **`buildCommand`** stamps `site/version.js` from `VERCEL_GIT_COMMIT_SHA` (7-char sha,
  falls back to `dev` off-Vercel) — the optional build the spec §8 anticipated. All five
  consumers pick it up: the four site pages' footers and `ui/shell.html`, so W2 feedback
  reports and telemetry `sim_version` carry the deploy sha.
  - **Gotcha:** the stamper is inlined in `vercel.json` rather than a script under
    `tools/` — `.vercelignore` excludes `tools/`, so a script there would not exist at
    build time. Anything the build needs must be outside the ignore list.
- **`outputDirectory: "."`** — repo root is the site root; setting a `buildCommand`
  otherwise makes Vercel look for a `public/` output.
- **Verified:** `vercel.json` parses; build command dry-run with a fake
  `VERCEL_GIT_COMMIT_SHA` emits `node --check`-clean JS; repo placeholder restored.
  Pre-flight link audit across all five pages found no case-sensitivity breaks
  (Windows-local vs Linux-serving) — only the known-pending `site/hero.png`.
- **Remaining for W1 done-done (owner):** create the Vercel project + connect repo
  (nothing is pushed yet — `develop` is 13 ahead of `origin/develop`, and both remote
  branches predate W1), choose the production branch (`main` has no site on it yet),
  drop in `site/hero.png`, point ReactorDynamics.com DNS.

### Website W1 addendum — public changelog page (2026-07-19)

**Two changelogs, deliberately.** `changelog.html` is player-facing and its log **starts at
the public launch**; `CHANGELOG.md` + this file stay the engineering record and keep the
pre-launch history. Owner's call: cataloguing changes to something nobody could use yet is
noise, and the public page should read as product news, not commit subjects.

- Hand-maintained plain HTML — no build step, no JS dependency for content (a changelog
  should survive JS being off, and stay indexable). An HTML-commented `<article>` template
  sits in the page source with the house rules: newest-first, tags `added`/`changed`/`fixed`,
  write for players. Ships with a `.log-empty` state to delete when the first entry lands.
- `site/site.css`: `.log-entry` / `.log-head` / `.log-tag` / `.log-empty`. Tag colours reuse
  the board palette — added=`--running`, changed=`--normal`, fixed=`--caution`.
- Linked from the **footer** of all five pages, not the top nav — an empty changelog does
  not earn nav space; the nav stays Simulator/About/Feedback.
- **Gotchas hit while wiring the footers:** (1) the header nav and the footer both contain
  `About` → `Feedback` in sequence, so a naive first-match insert landed the link in the nav
  on `index`/`privacy` and the footer on `about`/`feedback` — match the About+Feedback+Privacy
  triple to hit the footer. (2) `git checkout --` restores these files **CRLF** (autocrlf),
  so an `\n` pattern that worked pre-checkout silently matched nothing after; use `\r?\n`.
- **Gate:** scratchpad headless-Edge harness, **14/14** — page renders, stylesheet applied,
  empty state present, zero real `<article>` entries (asserts the template stays commented),
  version stamp fills, footer link present exactly once and in the footer (not nav) on all
  five pages, index→changelog navigation, zero console errors.

### PWR board — preset lineups, wide-range SG, trip-block cue, pump temps (2026-07-20)

**Wide-range SG level (engine).** New `sg_level_wide` instrument. The engine models only
the narrow (working) range as a clamped integral, so wide range is an **affine remap** of it:
narrow 0–100 % is the `SG_WR_LO..SG_WR_HI` (30–75 %) window of the wide scale
(`pwr_engine.js` `SG_WR_LO/HI`, mirrored in the SG board component's gauge placement — a
shared constant contract). Appended to SOURCE + config with `noise:0` per the cross-step
PRNG rule. The SG board component now drives the **vessel water column from wide range** over
the full vessel, while the **LVL gauge marker rides narrow range** through the same window —
so the marker lines up with the water surface at steady state and reads its alarm/trip zone.
Caveat documented: both peg together (a truly independent wide range would need an un-clamped
secondary-inventory state, which the engine doesn't have).

**Free-play preset lineups (Mode 1/3/5).** Preset starts now come up operating. Split across
the two idiomatic free-play mechanisms so **instructed content (noDefaults) is untouched**:
- Control-layer `defaultOn` on `boron_conc` (boron control ON, `sp.capture` holds the preset's
  trimmed boron — a sensible per-mode target for free) and `cvcs_makeup` (charging AUTO).
- Engine `getStartupLineup()` for control_state with no channel to carry it — today just the
  letdown orifice (Orifice A on hot presets, isolated on `cold_shutdown`); applied by
  `simulation_service.selectPlant` only when `!noDefaults`.
- ECCS/AFW arms, trip blocks, steam-dump auto, turbine follow, feed auto were already
  mode-correct via the control-layer live-instrument init / engine defaults. Verified:
  M1 blocks `ir_high`+`pr_low_setpoint`; M3 `lo_flow`; M5 `lo_press`+`lo_flow` (P-11/P-7) with
  SI in MANUAL (P-11). Added `cold_shutdown` (Mode 5) to the UI preset picker.
- **Gotcha:** opening letdown at a free-play start only balances because charging is in AUTO.
  Two test harnesses assumed letdown closed at start and broke when CVCS was stood down
  (autoctl neutral baseline; e2e CVCS-vs-leak) — both now close letdown where they isolate a
  leak/inventory contract. Not an engine base-default change (would perturb every scenario).

**TRIP BLOCKS cue.** `.bd-btn` gained a `.bd-warn` (amber) state independent of the authored
active color, plus a `.bd-badge` count. Renderer `buttonWarn`/`buttonBadge` hooks; the driver
lights the TRIP BLOCKS button amber with the blocked-trip count whenever ≥1 blockable trip is
blocked.

**Pump fluid-color temps go live.** RCP → `tcold` (cold leg), feed pump → a feedwater proxy
(`fwTemp`, between hotwell and SG saturation, tracks load). Cold make-up pumps (HPI/RWST,
charging/VCT, condensate/hotwell) stay near-constant cold. Fixes the RCP rendering hot at cold
shutdown (was hardcoded 290).

**Gates:** run_pwr 31, campaign 51, autoctl 20/20, m4/m5/m6, m7 OK, e2e 30/30, board_check 52.
(`verify_e2e_ui` fails on this checks the retired synoptic control ids — pre-existing, unrelated.)

### PWR follow-up — dynamic wide-range SG, auto-ranging Tavg, boron/feedwater assessments (2026-07-20)

**Dynamic wide-range SG level (replaced the cosmetic remap).** `sg_level_wide_pct` is now the
INTEGRATED whole-vessel inventory (clamped only at 0/100); narrow `sg_level_pct` is DERIVED as
its `sg_wr_lo..sg_wr_hi` window (`pwr_steam_generator.js`). The wide gain is scaled by
`wr_span/100` so narrow's in-window dynamics are byte-identical to the old direct integration —
so trips fire on the same schedule while wide keeps reading past the narrow pegs (a dryout drives
narrow→0 at ~26 s, then wide continues 31→14→0). Campaign 51/51 confirms the reserve behavior at
the pegs moved no endpoint. Window constants live in `cfg.steam_generator`, mirrored in the SG
board component; migration seeds wide from narrow.

**Mode 5 was never unstable — the temp meters floored it.** `tavg/thot/tcold` had `range:[232,343]`
(the at-power narrow band), so cold shutdown's true ~50 °C pegged at 232 on every gauge/number and
mis-colored the RCP. True `tavg_c` holds 50 °C rock-steady. Fix: widen ranges to `[30,343]`
(at-power unaffected; all gates green) + an **auto-ranging vital Tavg gauge** — one slot that shows
the operating band [250-343] when hot and swaps to a wide LOW-RANGE [30-260] when cold (8 °C
hysteresis), via a generic `gauge.autorange(raw)` hook. Saves a second permanent gauge. Added a
`?init=<preset>` dev URL param. Verified in-shell: cold shutdown reads "Tavg · LOW RANGE 122 °F".

**Assessments (investigated, no change made):**
- *Boron per-preset values* (HFP ~747, M3 ~348, M5 ~495 ppm) are LOW and cold<hot (backwards vs a
  real plant), but they are the exact, internally-consistent output of the lumped reactivity model:
  constant boron worth (10 pcm/ppm, no temp dependence) + cold shutdown crediting the full inserted
  control-bank worth (−8500 pcm). Making them realistic is a whole-model re-tune (touches every
  boration transient + criticality tests), not a localized fix. Left as-is.
- *Feedwater temperature* is NOT modeled and should stay a UI proxy (`fwTemp`): the secondary
  energy balance is latent-heat-only with no sensible-heat term, so an engine feed-temp would be
  inert. Modeling it properly needs a hotwell/condensate node + FW-heater train + sensible-heat
  term — a real physics feature, not plumbing for a pump color.

### PWR board — live pipe temperatures (2026-07-20)

The board pipes were painted with a STATIC temperature authored in `pwr_board_data.js` — the hot-leg
run baked at 339 °C showed red even in Mode 5 cold shutdown (true ~50 °C). Pumps already colored to
their fluid temperature (RCP→`tcold`, feed→`fwTemp`); the pipes lagged behind.

**Fix.** The driver (`pwr_board_wiring.js`) gained a `PIPE_TEMP` map (pipe `id` → live °C) and a
`pipeTemp(id, s)` API method, same keyed-by-stable-id idiom as the item maps. The renderer
(`pwr_board.js`) captures each pipe's bore + flow polylines in `buildPipes` and repaints them each
snapshot via `StdPipe.phaseTempColor(phase, °C)` in a new `updatePipeTemps(s)` (called from
`render` after `updatePipeFlowStates`, and once at build time from `lastSnap`). Pipes not in the map
keep their authored color, so this is incremental — no board_data change.

Mapped pipes: RCS hot leg → `thot`; both cold-leg runs + pressurizer spray → `tcold`; pressurizer
surge → `thot`; SG main steam-out + main-steam header + TCV/dump branches → `satTempC(steam_pressure)`.
Verified via a node probe of `drv.pipeTemp` across the three presets (HFP hot leg 320 °C / cold leg
288 °C; Mode 5 all ~50 °C; steam header tracks SG saturation), and by hot-vs-cold board screenshots:
the whole primary loop is red at power and blue in cold shutdown.

**Also verified (no change): trip blocks are correct per preset.** `_initialTripBlocks` derives from
each blockable trip's permissive against live instruments — HFP blocks `ir_high`+`pr_low_setpoint`
(P-10, startup trips blocked at power), Mode 3 blocks `lo_flow` (P-7, low power), Mode 5 blocks
`lo_press`+`lo_flow` (P-11 depressurized + P-7). Matches real PWR permissive logic. **Pump temps**
are already fluid-based (RCP shows cold-leg temp — genuinely ~288 °C hot / ~50 °C cold; the
"pump-heat" `FLUID_HEAT` fallback in `comp_pump.js` only applies when no temp is supplied, which
never happens for a wired pump).

**Gates:** run_pwr 31/31, campaign 51/51, autoctl 20/20, m4 18/18, m5 19/19, e2e 30/30,
board_check 52/52.

### PWR board — live fluid pools + neutral trip-block cue (2026-07-20)

Follow-up audit of every fluid pool for live temperature/level tracking, plus a color-scheme fix.

**Fixed (were hardcoded in `pwr_board_wiring.js` compProps):**
- *Pressurizer fluid temp* was `temp: 345` (always max-red). Now `satTempC(primary_pressure)` — the
  pressurizer sits at saturation, so it's red at operating pressure (~352 °C @ 15.4 MPa) and cools
  as the plant depressurizes (~225 °C @ 2.5 MPa in the Mode 5 IC — legitimately hotter than the
  50 °C loop, exactly as a real pressurizer runs during heatup/cooldown).
- *SG boiling vigor* was `boil: 55` (constant simmer). Now `min(100, steam_flow*85)` — vigorous at
  power (~84), calm (0) at hot standby / cold shutdown where there's no steam demand.
- *Reactor core bubbles* were keyed on `subcooling_margin < 0`, which almost never triggers (a PWR
  core stays subcooled by pressure even in a LOCA — subcooling hit only ~11 °C, never negative, in
  probes). Now `max(core_void_fraction*400, subcooling<0 ? -sub*3 : 0)` — driven by the engine's
  REAL void fraction so bubbles appear as the core actually voids (a 20 % LOCA reached void≈0.016 →
  boil≈6), with the superheat term kept as a kick if subcooling ever does go negative.

**Trip-block button → grey.** Owner color scheme: green = normal, yellow = attention, red = alarm.
Trips blocked during a startup/shutdown lineup are NORMAL (P-10/P-11/P-7 permissives), so the amber
`bd-warn` was miscuing them as "attention". Added a neutral `.bd-btn.bd-info` (grey) + grey badge;
renderer gained a `buttonInfo` hook (parallel to `buttonWarn`); driver's TRIP BLOCKS indicator moved
from `buttonWarn` → `buttonInfo`. board_check updated to assert grey (bd-info, not bd-warn).

**Audited, left as-is (documented):**
- *Reactor vessel coolant pool* color is POWER-driven (fission-heat / Cherenkov-glow model), not a
  plain thermometer — so it reads cool at hot standby (hot but 0 % power). The fuel-rod / core-glow
  visuals SHOULD stay power-driven; splitting the downcomer pool onto a temperature scale is a
  comp_reactor_vessel rework, deferred (flagged for the owner). Level (`core_inventory_pct`) IS live.
- *Condenser hotwell* temp (40 °C) and level (55 %) are static — the engine models neither (no
  hotwell instrument); the condenser runs at a near-constant ~40 °C saturation under vacuum anyway.

**Gates:** run_pwr 31, campaign 51, autoctl 20, m4 18, m5 19, m6 16, m7 OK, e2e 30, board_check 52.

### PWR board — 1/M button, reactor-vessel temperature coloring (2026-07-20)

**1/M plot launcher.** The board replaced the synoptic, which had a `data-act="one-over-m"` button;
the board had none. Added a **1/M PLOT** button (opens `RD.OneOverM.open()`). Rather than hand-edit
the GENERATED `pwr_board_data.js`, the driver now exposes `extraItems()` and the renderer appends
those to `doc.items` at mount (deduped by id, before tiles build) — control tiles kept in driver
code survive a diagram re-export. New `EXTRA_ITEMS` + BUTTONS `bdOneOverM` entry in the driver.
Placed under TRIP BLOCKS (both are NIS/startup-net tools) at 370,890. board_check's tile-count
check stays balanced (injection precedes tile build); headless click test confirms the window opens.

**Reactor vessel: water color = temperature, fuel/glow = power.** Owner ruling — "glowing fuel rods
signify heat being generated, the fluid color signifies fluid temperature." comp_reactor_vessel's
`applyColors` drove BOTH fuel and the coolant gradients off `power`, so at hot standby (302 °C, 0 %)
the vessel read cool. Split it: `applyColors` keeps fuel rods + flux/thermal/fuel glows on power;
new `applyFluidTemp(tcold,thot)` colors the coolant via `StdPipe.phaseTempColor('water',·)` — the
downcomer/lower-plenum pool at Tcold, the core channel Tcold(inlet)→Thot(exit), the hot reservoir
and hot-leg throat at Thot. Driver passes `tcold/thot` in reactorVessel compProps. Verified: hot
standby now shows hot-red water with DARK fuel; full power glowing fuel in hot water; cold shutdown
blue. Same phaseTempColor ramp as the pipes, so the loop reads consistently end to end.

**Pressurizer level auto-hold — it already exists (no code change).** User asked for a pzr-level
auto-hold. The engine's `cvcs_auto` (CVCS make-up channel, board **CHARGING → AUTO**) already
modulates charging to the `pzr_level_nominal` setpoint (`pwr_primary.js` §9:
`charging = letdown + max(level_servo, inventory_makeup)`), and it defaults ON on free-play presets.
Probed: baseline holds 54.9 %; opening both letdown orifices, AUTO holds 53.4 % while charging
maxes to chase. Limitation (documented, realistic): it's charging-side only — it can raise/hold a
LOW level but can't drive a HIGH level down (letdown is a fixed-orifice lineup, as in a real CVCS).
The gap was discoverability (the control is labeled "CHARGING", not "PZR LEVEL"), not capability.

**Gates:** run_pwr 31, campaign 51, autoctl 20, m4 18, m5 19, e2e 30, board_check 52.

### PWR board — SG/feed/condenser temps, accumulator flow gating + clickability (2026-07-20)

Continuation of the coolant-color audit (owner: water color = temperature everywhere).

- **SG U-tubes + channel-head reservoirs → leg temps.** comp_steam_generator drove the tube
  bundle + hot/cold channel-head rects off `power`. Now `thot/tcold` props color them via
  `phaseTempColor('water',·)` (hot-leg side = Thot, cold-leg side = Tcold); the tube-bundle glow
  stays power-gated (heat transferred). Driver passes thot/tcold in steamGenerator compProps.
- **Feed-pump temp → load, not steam pressure.** `fwTemp` was `40+0.62·(satTempC(steam_pressure)−40)`,
  which read ~205 °C at hot standby even with the feed pump OFF (feedwater actually cold). Final
  feedwater temp is set by the FW-heater train (turbine extraction ∝ load), so now
  `40 + 1.8·power_range` (40 °C no-load → 220 °C full). Condenser hotwell likewise `33 + 0.12·power`
  (cool, backpressure rises with load). Cooling tower already had an internal inlet/outlet temp
  model — left as-is.
- **Accumulators not feeding at power.** The passive SITs inject only below the 600 psi check-valve
  setpoint (`accumulator_trip_mpa: 4.14`, already correct). The board animated the discharge whenever
  the isolation valve was open. Added a `flow` prop to comp_valve_vertical: open + water-filled bore
  but NO streak / inactive downstream port when `flow=false`. Driver gates it on
  `accumulators_discharging` (false at power). So the valve reads OPEN/aligned while the line sits
  still — physically the check valve holding back injection.
- **Accumulator isolation valve clickable.** It sits at (625,660), inside the reactor-vessel tile's
  box (360–640 × 400–835). It was already reachable at center, but to be safe clickable COMPONENT
  tiles (it.clickable) now lift to z-index 1 like buttons, so a big neighbor's transparent tile
  can't swallow the click. Verified: ports data-active=0 at power (no flow), z-index 1, click still
  toggles open↔closed.
- **Charging card NOT relabeled** (owner ruling — pzr-level-via-charging is learned in training).

**Gates:** run_pwr 31, campaign 51, autoctl 20, m4 18, m5 19, e2e 30, board_check 52.

### PWR board — one water ramp everywhere (2026-07-20)

Owner ruling: ALL water on the board uses the shared `StdPipe.phaseTempColor('water',·)` ramp
(aqua→blue→purple→red); steam uses the grey steam ramp. Remaining offenders used their own
`mix(COOL,HOT,·)` blend:
- **Cooling tower** (`comp_cooling_tower`): basin/trough water now `phaseTempColor('water', outletTemp)`,
  falling rain `phaseTempColor('water', inletTemp)`. Plume/haze/shell-glow are heat-rejection vapor,
  not liquid water — kept as-is.
- **Condenser** (`comp_condenser`): the circulating cooling water (tube-bundle gradient + inlet/outlet
  chambers) now on the ramp — cold supply (~25 °C) / warm return (25 + load·14). Hotwell/steam were
  already on the ramp.
- **Condensate/feedwater + CW-loop pipes** added to the driver `PIPE_TEMP` map so the pipes match the
  components they join: feed pump→SG = `fwTemp` (hot, load-driven, matches the feed pump), condensate
  lines = `condTemp` (~33–45 °C), CW return/supply = warm/cold. New shared `condTemp(s)` helper (also
  used by the condenser compProps).

**Gates:** run_pwr 31, campaign 51, autoctl 20, m4 18, m5 19, e2e 30, board_check 52.

### PWR — CVCS pzr-level control, feed-pump color, pump-off pipe gating (2026-07-20, playtest)

Playtest findings.

**Pressurizer level control (physically correct, no truth-peeking).** AUTO charging held level
with `charging = letdown + max(level_demand, inv_demand)` — the `max` floored charging at letdown, so
a HIGH level was never brought down (charging never dropped below letdown). First attempt gated the
`inv_demand` make-up floor on true `leak_flow`, but that's unphysical (a real CVCS level controller
cannot know a leak exists). Root cause: a liquid leak did NOT lower the pzr level in `stepLevel`
(only porv/safety steam-space vents did), so the level servo couldn't see a leak — hence the bolted-on
mass-peeking term. Fix: add `leak_flow` as an inventory-out term on the level in `stepLevel`
(`cvcs_surge = (charging − letdown − leak_flow)·K_cvcs_level`), same coefficient as letdown so the
mass and level equilibria agree; then AUTO charging becomes a PURE level servo
(`charging = clip(letdown + level_demand, 0, charging_max)`, reading only indicated level, HR1). A
leak now lowers the level → the servo charges up to hold it → makes the leak up on its own, exactly
like a real plant; a high level drives charging below letdown to come back down. TMI path untouched
(stuck PORV vents steam, leak_flow=0, level rises via void_surge). Gates: e2e 30/30 (leak-match +
inventory-hold both pass), autoctl 20, run_pwr 31, campaign 51, m5 19.

**Feed-pump fluid color + pump-off pipe gating (board).** Feed pump + both its pipes now read one
`fwTemp` (the pump matched only its discharge before). `comp_pump` gates its suction/discharge port
`data-active` on the running state, so turning any pump off stops the connected pipes' flow animation.

**Open playtest items (tasks #22–27):** spray too strong (PORV never lifts on a full-power heat-sink
loss — spray AUTO holds ~2255 psi vs ~2379 with spray off), reactor-vessel z-order over the rod
cards, slow-rod-insertion SCRAM at 100%, a spray/PORV tuning test, and a meta-analysis of why the
prior production-readiness review missed all of these (control-loop / physical-plausibility gap).

### PWR CVCS make-up — bumpless transfer + letdown low-level isolation (2026-07-21)

**Reported symptom (owner playtest):** "CVCS seems unbalanced and the auto doesn't work
very well" → then "you shouldn't be able to drain the plant in 30 seconds."

**Root cause.** Under AUTO make-up, `charging_setpoint` sat frozen at its init value (0)
while the true `charging_flow` modulated (`pwr_primary.stepInventory`). Toggling CVCS make-up
to MANUAL ran `charging_flow = charging_setpoint = 0` (`pwr_engine.js set_charging_flow`
path via the auto-off branch), so letdown (orifice A ≈ 0.030) kept bleeding against **zero**
charging → net −0.030/s drained the pressurizer in ~15 s and the whole RCS in ~33 s from one
click.

**Why 33 s (and why NOT rescaled).** `level_per_mass = 100` maps pzr level to total RCS mass
1:1 (mass 1.0 → 55 %; the pzr empties ~0.45 below nominal), and CVCS letdown/charging share the
**same normalized inventory-fraction scale as leak/LOCA/ECCS** (0.06 charging ≡ 40 gpm ≡ a big
slice of the lumped inventory). So a 20 gpm letdown reads as ~3 %/s of inventory — unphysical in
absolute terms, but rescaling *only* CVCS would break the leak/LOCA make-up calibration tuned
against those units (charging_max ≈ 2× a 0.03 leak, ≈ ½ a 0.12 LOCA). Ruling: do **not** rescale;
fix it the way a real plant is bounded — make it impossible to drain the plant via CVCS.

**Fixes.**
1. **Bumpless AUTO→MANUAL transfer** (`pwr_engine.js set_cvcs_auto`): on the true→false edge,
   `charging_setpoint ← charging_flow` — the manual station tracks the live auto output, so
   MANUAL holds inventory instead of snapping to a stale setpoint. (Residual: manual inherits the
   auto controller's small proportional droop bias → a slow, operator-trimmable level drift, not a
   drain.)
2. **Letdown isolation on low pzr level ~17 %** (`pwr_control.js PWR_ACTUATIONS`, config-driven
   actuation → `set_letdown_orifices {a:false,b:false}`). Real Westinghouse interlock; fires before
   the 12 % low-level reactor trip. Latched (`reset_below: 20` re-arms the fire latch only; no
   `reset_action`, operator re-opens). Bounds every over-letdown case — including the A+B lineup
   whose flow (~0.070) exceeds charging_max (0.060) and used to drain silently — to a self-arrest
   at ~17 %, mass floored (~0.49 in probe), RCS never empties.

**Gates:** pwr 31/31, autoctl 20/20, m4 18/18, scenarios 3/3, procedures 21/21, campaign
51/51 (2897), ops 58/67 (unchanged 9 documented RBMK/BWR tuning targets, zero pwr — actually
+1 vs the stale README 57). `run_e2e_controls` stayed **27/30** — the 3 reds are pre-existing
(stash-verified) and unrelated to make-up balance; logged as **F12** (stale PZR-spray reach +
two CVCS-auto-vs-severity-1.0-SGTR expectations that predate the SGTR leak rescale). README
baseline line corrected (e2e 30→27, ops 57→58).

### Manual unification + instructor auto-checklists (2026-07-21)

**One PWR manual.** Owner ruling: the `Manuals/*.md` set is THE manual; the generated web
manual (RD.MANUAL pwr profile) was retired after a full content-gap audit ported everything
worth keeping (per-IC normal values → 09 §11.0 regenerated from the LIVE engine, indication
ranges + linked alarms → 03 §16.0, engine command reference → 03 §18.0, `set_rhr_hx` +
~50 °C/h → 03 §11.2 + 05, severity sliders + new PWR-E22 `pzr_level_sensor_low` procedure
→ 07) and left the stale bits behind (1000-MWe-era normal values, HPI 11.03, HZP steam 8.9).
`gen_manual_reference.js` now emits a pwr **reference-only stub** (indication id→name for
the Failures-tab picker — the one non-manual consumer of the profile); RBMK/BWR profiles
unchanged until their own passes produce md sets.

**Manual on the site.** `tools/pack_manuals.js` packs the 13 operator docs into
`ui/manual_md.js` (`RD.MANUAL_MD`, ~184 KB; the three dev logs deliberately excluded), and
`ui/md_render.js` (`RD.mdToHtml`, escape-all GFM-ish: tables/lists/fences/quotes/hard
breaks; `.md` links → in-manual `data-doc` nav) renders them in the Manual overlay.
Procedures/Accidents remain LIVE sections from RD.MANUAL_PROCEDURES (follow + checklist
buttons). Edit a manual → re-run the packer. Old renderer path kept for rbmk/bwr
(`p.reference_only` guards the pwr stub from it).

**Auto-checklists (Path 3).** `instructor_layer.js` gained a checklist runtime orthogonal
to mode: a procedure run PASSIVELY against the live plant — no reset (vs `start_follow`),
no command gating, sequential auto-check of the active step (acc graded instrument-first
with the follow debounce; saw latched; cmd-family observed when nothing gradable; pure
observation steps hand-tick via `checklist_check`, which is also the operator override).
M5 commands: `start_checklist` / `stop_checklist` / `checklist_check` (each broadcasts).
Snapshot block `instructor.checklist` (step text NOT duplicated — UI reads
RD.MANUAL_PROCEDURES like follow). Survives save/load independent of mode; any
scenario/follow load clears it. UI: chat-style bubbles in the instructor card (done ✓ /
active ▸ + live acc status / pending ○), 📋 picker on the card (free play only), 📋 buttons
on manual proc cards + walkthrough rows. New gate `test/run_checklist.js` (24 checks).

**Stale-scale sweep (found while auditing):** `manual_procedures.js` pwr still commanded
600/700 MWe (→ 60/70) and told the operator HZP Tavg ≈ 304 (→ 297, the no-load anchor);
manuals 04/05 said Mode 3 ≈ 304 °C in five places (→ 297); 09 imbalance cue 40 MWe (→ 4),
"Rated MWe 1000" (→ 100), missing `rcp_cavitation` row; `pwr_config.js` `mwe_output`
instrument range was `[0,1300]` (→ `[0,130]`, noise 1.0 → 0.1 — same relative noise as
pre-rescale).

**Gates:** checklist 24/24, procedures 21/21, m6ph 8/8, m6 16/16, m5 19/19, m4 18/18,
pwr 31/31, behavior 30/0/0, ops-pwr 20/20, autoctl 20/20, scenarios 3/3, campaign 51/51
(2897). Full run_ops 58/67 — the 9 fails are the documented RBMK/BWR tuning targets
(zero pwr). md-renderer smoke: 13/13 docs render with balanced tables/lists.
`verify_manual_follow` PWR bar checks fail 30 on clean HEAD too (worktree-verified
pre-existing: like `verify_e2e_ui`, it still probes the retired `RD.PwrSynoptic`
reveal while the board display mounts); its manual-pill and rbmk/bwr checks pass.

### P7 CVCS↔inventory retune — letdown drain rate, SGTR re-anchor, SI on level (2026-07-22)

**Owner request:** "letdown can drain the pressurizer way too fast — too fast to respond to and
unrealistic; do a tuning pass and evaluate associated behaviors." This SUPERSEDES the 2026-07-21
ruling ("do not rescale; bound it with interlocks") — the drain *rate* itself is now the defect.

**The retune.** New `[tune]` `cvcs_inventory_gain: 0.012` (`pwr_config.js reactivity`): CVCS
charging/letdown normalized flows (gauge scale — orifice A 0.030 ≡ 20 gpm) enter
`pwr_primary.stepInventory`'s mass balance through this gain instead of 1:1 on the accident
scale (leak/ECCS/relief keep the fast lumped scale — accident pacing untouched). Result:
uncompensated orifice-A drain ≈ **2.2 %/min** of pzr level (was ~2 %/s — the "drain the plant in
30 s" bug); A+B ≈ 5 %/min; max manual charging ≈ 13 %/min (going-solid regime). Gain window was
constraint-derived before tuning: probe `ops_cvcs_pzr_drain_rate` needs ≥300 s per 15 % (g ≤
0.017); CA-4's PI-8 overfill backstop must trip inside 300 s (g ≥ ~0.008). 0.012 splits it.

**Servo re-tune (forced by the same change).** The AUTO make-up loop gain is
`cvcs_charge_per_level · g · level_per_mass`; with g down ~80×, the old 0.001 parked a CC-8-size
leak (2.4e-4 frac/s) ~20 % below program → CC-10's "inventory 97..103" failed at 96. Stiffening
alone hits CA-3's noise ceiling (charging must NOT chase gauge noise: max excursion ≤ letdown +
0.012 over 600 s). Resolution: a first-order **damping filter on the level error**
(`cvcs_level_filter_tau: 20 s`, new engine state `_cvcs_err_f`, reseeded on AUTO engage — a real
M/A station's damping) kills the noise path, letting `cvcs_charge_per_level` go 0.001 → **0.01**
(loop τ ≈ 83 s; the CC-8 leak parks ~2 % low). Save-compat: `_cvcs_err_f` lazily seeded, old
saves fine. Deleted dead config `cvcs_makeup_gain` (defined, never read) and the write-only
`_charging_actual` stash (stale since the CC-10 derived-level rework).

**Knock-on 1 — SGTR re-anchored (`leak_scale` 0.12 → 0.03).** The FG-6 anchor "full rupture =
2× charging_max" was premised on charging living on the accident inventory scale; post-retune
that comparison is meaningless — and the old scenario pass was FAKE: AUTO charging had been
delivering up to 0.06 frac/s ≈ a second full HPI, silently carrying `ops_sgtr_managed`
(inventory hit literal 0.0 without it). New anchor, same intent: full rupture = 0.03 frac/s ≈
½ HPI high-head rated ≈ 2× SI-at-pressure — still overwhelms CVCS (~40× its make-up authority),
still forces trip + SI + EOP, and the subcooling-guarded walk-down now WINS the inventory race
(min 55.2 %, final 92 %). Behavior probes that encode absolute leak sizes had severities ×4
(CA-3 0.012, CC-8/CC-10 0.008, CC-10b 0.024); TR-13's anchor is now computed against
`charging_max · cvcs_inventory_gain`; TR-13's "delivered < 0.9×base" outcome check re-scoped to
assert the ΔP-modulation MECHANISM (post-retune hands-off anatomy: trip + SI hold the primary
subcooled at pressure while the overcooled secondary sags, so ΔP can sit at/above rated — the
walk-down outcome lives in `ops_sgtr_managed`).

**Knock-on 2 — SI on pzr level lo-lo (P1(b) CLOSED).** With the smaller leak the heaters
out-muscle `K_leak_depressurize`, so the pressure-only SI path never fires while a leak drains
the RCS at full pressure — exactly the P1(b) gap. New ESF actuation (`pwr_control.js`):
`pzr_level low 12 %` → `set_hpi`, latched (re-arm above 20 %, NO reset_action — securing SI is
deliberate), riding the existing `hpi` ESF arm, so the cold P-11 disarm and operator-manual
override gate it for free. TMI untouched: its deceived level reads HIGH, so this path stays
silent (and that silence IS the historical lesson).

**Knock-on 3 — `ops_sgtr_managed` EOP made faithful.** The scripted EOP throttled SI on
subcooling alone; real SI-termination criteria require subcooling AND pzr level recovered.
Added the level condition (terminate only >33 %, re-initiate <20 % or margin <15). The old
script survived only on the phantom charging.

**Manuals:** 09 §3.0 gained the SI-on-level row AND the (previously undocumented) 17 % letdown
isolation row; 06 PWR-A14 notes auto-SI; 03 §7.3 gained a "rate feel" bullet (≈2 %/min etc.).
Repacked (`pack_manuals`), reference regenerated.

**Gates after:** pwr 31/31 · rbmk 23/23 · bwr 15/15 · behavior 30/0/0 · ops **59/68** (PWR
21/21, zero fails — P7 green; 9 remaining are documented RBMK/BWR + deliberate C2) · m4 18/18 ·
m5 19/19 · m6 16/16 · m7 OK · autoctl 20/20 · scenarios 3/3 · campaign 51/51 (2897) ·
procedures 21/21 · checklist 24/24 · e2e_controls **28/30** (F12 shrank by one — "AUTO charging
converged" turned green; 2 stale reds stand) · `verify_e2e_ui` FAIL **pre-existing** (verified
identical on clean HEAD 4df8ac5; same retired-PwrSynoptic-probe family as the documented
`verify_manual_follow` 30-check fail).

### Owner ruling — ECCS/HPI is a dedicated pump train (justifies the CVCS↔HPI scale gap) (2026-07-22)

Following the P7 CVCS retune, a review flagged one *seam*: CVCS charging and HPI represent, in a
real Westinghouse plant, the **same** centrifugal charging pumps (they do double duty as high-head
SI), yet the model puts them on very different flow scales (charging ≈ 7.2e-4 frac/s max via
`cvcs_inventory_gain`; HPI high-head 0.06 frac/s). **Owner ruling:** in *this* plant the **ECCS/HPI
has its own dedicated pump** (RWST-sourced SI train), NOT the charging pump doing double duty — so
the scale difference is physically correct, not a compromise. This is already how the model is
built end-to-end: independent flags (`hpi_active` via `set_hpi` vs `charging_pump_running` via
`set_charging_pump`), independent injection gating (`injectionFlowInv` checks only `hpi_active`),
its own discharge-pressure instrument (`hpi_discharge_pressure`), and a dedicated **ECCS pump**
element on the board (`pwr_board_wiring.js`, "eccs pump (RWST — cold)"). Comments in
`pwr_primary.injectionFlowInv` and the `pwr_config.js emergency` block were reframed from "the
classic HPI charging-pump head" to "dedicated ECCS train (head coincides with the classic
centrifugal-charging curve)" so the seam isn't re-flagged. **Comment/doc only — no physics or gate
change** (`run_pwr` 31/31 unchanged).
