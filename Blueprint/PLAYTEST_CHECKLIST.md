# Playtest Checklist — feel verification for the tuning phases

**Purpose:** the owner couldn't playtest during the tuning pass, so every feel decision
below was made by probe + judgment and is ADJUSTABLE. Play each item, judge it against
the **tempo principle** (*fast enough to be interesting, slow enough to be manageable*)
and the **teaching goal** (*this plant exists to teach how a PWR works — physics and
behavior*), then report. Each item lists the knob to turn if it feels wrong (all in
`engines/pwr/pwr_config.js` unless noted). Nothing here requires code archaeology —
they're all one-line constants.

## Phase 2 — physical pressurizer level

| Check | What good feels like | Knob if wrong |
|---|---|---|
| Steady 100 %: pzr level ~55 %, breathing gently with charging/letdown | Alive but not twitchy | `cvcs_charge_per_level` 0.001 (higher = tighter/twitchier hold) |
| Crack open letdown B with charging in MAN: level falls visibly; close it, AUTO recovers | Cause-and-effect readable in ~a minute | `level_per_mass` 100 (%/inventory-frac) |
| Heat up / cool down: level walks with Tavg | Level = thermometer feel, ~2.5 %/°C | `level_per_tavg` 2.5 |
| TMI-2 module p1: level dips at the blowdown, swells hard when HPI packs the plant ("going solid" call at ~86 %), pegs 100 through the voiding, reads honest-empty after isolation | The deception should feel *convincing* — you'd have throttled HPI too | `level_per_void` 150 (deception strength), `level_per_mass_surplus` 300 (going-solid steepness) |

## Phase 3 — the Tavg program (this plant's map)

| Check | What good feels like | Knob if wrong |
|---|---|---|
| Free play, Mode 1, engage `rods_tavg` + `feed_sg`, swing 100→50→100 | Tavg slides ~304 → 300.5 → 304 °C; pzr level breathes 55→46→55; unhurried but visibly coupled | `steam_dump_setpoint` 8.23 MPa **is** the no-load anchor (lower = deeper program + harder post-trip shrink) |
| Hot standby (Mode 3): Tavg parks at 297 °C, level ~37 % | The plant "holds its own temperature" on the dump | same anchor |
| Slider-only cut of ~150 MWe (EV-11, re-calibrated): output now delivers the ask almost exactly (the real-like MTC), but Tavg parks ~+7 °C high of program and pzr level rides ~71 % — the plant quietly shows the cost of lazy dispatch; SG level still parks low until you mind the feed | The mismatch should read as "informative", not punitive — a real core's feel | `alpha_MTC` −2.0e-4 (stronger = tighter tracking, smaller mismatch) |

## Phase 4 — trips, ride-out, casualties

| Check | What good feels like | Knob if wrong |
|---|---|---|
| **Turbine trip @100 % (the ride-out signature):** NO scram. Dump opens (~65 %), plant self-parks ~64 % power with Tavg ~319 and pzr level ~93-94 % (PZR LVL HI blaring, just under the 97 % going-solid trip) — stable but loudly asking for trim. Walk the rods in at your own pace; it lands at 297 °C no-load | The signature FG-4 experience: drama then *your* recovery, no protection theatrics | `steam_dump_max` 1.05 (bigger = flatter ride); `alpha_MTC` (stronger = parks lower/cooler) |
| **Manual scram from 100 % (TR-15 shrink taste):** FWI at Tavg < 300, feed_sg channel note "off — main feedwater isolated", AFW takes over; SG narrow-range dips to ~13 % then recovers over ~3–5 min; pressure dips, heaters restore ≤ 5 min | Dip should *get your attention* without feeling broken. **This is the two-tuning demo item — say "deeper" or "softer"** | Softer: raise anchor (dump setpoint) or lower `K_sg_level` 5.0. Deeper: opposite. Faster AFW recovery: `afw_flow_frac` 0.15 |
| **Loss of feedwater @100 %:** AFW auto-starts ~immediately (PI-4), SG drains anyway, lo-lo 17 % scrams in ≤ ~60 s (the re-told "Plant Protects Itself" mission) | Protection acting on a *real* limit reads honest | `afw_flow_frac`, lo-lo setpoint 17 (pwr_control) |
| **Loss of condenser vacuum @100 %:** turbine trips at 74.5 kPa, dump is GONE (no condenser), feed dies with the hotwell, SG drains → genuine-limit trip. No anticipation anywhere | The slow-motion heat-sink death should feel inevitable, not scripted | — |
| **MSIV closure @100 %:** feed pumps starve with the steam line (decision clock), safeties pop 9.31, drain race to the 12 % trip; reopen = decay heat to the condenser | The ~50 s decision window: enough to think, not enough to dawdle | drain rate via `K_sg_level` |
| **Scram recovery (PI-7):** after any trip — `reset_rps` refused while a trip signal stands or rods are out; then reset, withdraw, restart under the startup net | Recovery should feel procedural, not magic | — |

**PI-8 — RESOLVED (owner ruling: recalibrate the power defect, done 2026-07-21).**
`alpha_MTC` went −3.3e-5 → −2.0e-4 (real-PWR range): an un-trimmed 15 % cut now parks
~+7 °C, and the high-pzr-level trip is in at **97 %** (clears the ride-out swell; the
75 % alarm warns first). Playtest check: flood the plant with max charging, letdown off
— PI-8 should scram in seconds ("going solid" caught). Then try the same with the
pressurizer level sensor failed LOW: charging chases the lie to the tank cap and
**nothing trips** — the single-channel deception is CA-4's teaching point (real plants
vote 2-of-3 for exactly this reason).

**⚑ New mission text to review — "The Plant Protects Itself" (re-told for the ride-out
plant):** since a turbine trip no longer scrams, the mission's casualty is now a loss of
main feedwater — AFW auto-starts, the SG drains anyway, protection wins on the lo-lo
limit. Read the new beat text in play and judge whether the drama and the alarm-flood
reading lesson still land.

## Phase 5 — casualty ladder

| Check | What good feels like | Knob if wrong |
|---|---|---|
| **Turbine trip revisited (trip-open dump):** the dump now drives open the instant the turbine trips (Tavg-error mode, real Westinghouse) — the catch is GRACEFUL: reactor stays near full power into the condenser, Tavg swells only ~1-5 °C. Walk rods in at leisure | Drama moved from "spike and alarms" to "the machine catches it" — confirm that reads as competence, not anticlimax | `dump_trip_mode_band_c` 8.0 (bigger = softer open) |
| **Loss of feed + AFW blocked (the TMI arc on real physics):** lo-lo trip ~45 s, SG dries out over ~2 min, then a slow ~15-min decay-heat repressurization to the PORV lift — all emergent, no scripting | The quarter-hour dread should feel like TMI's timeline. Too fast/slow? | `sg_dryout_residual` 0.02 (smaller = faster heat-up), decay-heat constants |
| **Full SGTR (severity 1.0):** leak ~2× charging — CVCS visibly loses (charging pegged, level falling), trip ~10 s, SI at 12.4. Then the EOP: spray the pressure down toward SG pressure and *watch the leak die with the ΔP* | The one-SG teaching: you can't isolate your only heat sink — you take the pressure to it. Confirm the leak-vs-ΔP coupling reads on the gauges | `leak_scale` 1.5, `sgtr_dp_ref` 9.8 |
| **SI at 12.4 MPa:** injection now arrives with the low-pressure trip (12.41), not 1.4 MPa later | Casualties get help earlier — TMI module timing verified unchanged | `SI_MPA` + the ESF literal in pwr_control |

## Phase 6 (ratings layer, manuals, plant name) — to be filled when built
## Phase 6 (ratings layer, manuals, plant name) — to be filled when built
