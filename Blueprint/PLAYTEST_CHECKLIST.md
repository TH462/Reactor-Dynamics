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
| Slider-only cut of ~150 MWe (EV-11): output settles ~45 MWe ABOVE the ask; Tavg parks ~+18 °C high; HI TAVG + PZR LEVEL HI annunciate; SG level parks low until you mind the feed | **Owner ruling to revisit:** is this teaching ("the plant shows you the cost of lazy dispatch") or annoyance? It's currently pinned as character (EV-11) | If annoyance: the honest fix is the power-defect calibration (see PI-8 note below) — flag it and we'll plan it |

## Phase 4 — trips, ride-out, casualties

| Check | What good feels like | Knob if wrong |
|---|---|---|
| **Turbine trip @100 % (the ride-out signature):** NO scram. Dump roars open (~75 %), plant self-parks ~75 % power with Tavg ~323 and pzr level pegged high — stable but loudly asking for trim. Walk the rods in at your own pace; it lands at 297 °C no-load | The signature FG-4 experience: drama then *your* recovery, no protection theatrics | `steam_dump_max` 1.05 (bigger = flatter, tamer ride) |
| **Manual scram from 100 % (TR-15 shrink taste):** FWI at Tavg < 300, feed_sg channel note "off — main feedwater isolated", AFW takes over; SG narrow-range dips to ~13 % then recovers over ~3–5 min; pressure dips, heaters restore ≤ 5 min | Dip should *get your attention* without feeling broken. **This is the two-tuning demo item — say "deeper" or "softer"** | Softer: raise anchor (dump setpoint) or lower `K_sg_level` 5.0. Deeper: opposite. Faster AFW recovery: `afw_flow_frac` 0.15 |
| **Loss of feedwater @100 %:** AFW auto-starts ~immediately (PI-4), SG drains anyway, lo-lo 17 % scrams in ≤ ~60 s (the re-told "Plant Protects Itself" mission) | Protection acting on a *real* limit reads honest | `afw_flow_frac`, lo-lo setpoint 17 (pwr_control) |
| **Loss of condenser vacuum @100 %:** turbine trips at 74.5 kPa, dump is GONE (no condenser), feed dies with the hotwell, SG drains → genuine-limit trip. No anticipation anywhere | The slow-motion heat-sink death should feel inevitable, not scripted | — |
| **MSIV closure @100 %:** feed pumps starve with the steam line (decision clock), safeties pop 9.31, drain race to the 12 % trip; reopen = decay heat to the condenser | The ~50 s decision window: enough to think, not enough to dawdle | drain rate via `K_sg_level` |
| **Scram recovery (PI-7):** after any trip — `reset_rps` refused while a trip signal stands or rods are out; then reset, withdraw, restart under the startup net | Recovery should feel procedural, not magic | — |

**⚑ PI-8 (high pzr level trip ~92 %) — DEFERRED, owner ruling needed.** Discovered
conflict: because a slider-only mismatch parks Tavg +18 °C, the *thermal* level base pegs
100 % — a 92 % level trip would scram every lazy dispatch (and break the shift exam's
manual route). Options: **(a)** accept it — realistic, forces trim, exam gets harder;
**(b)** implement PI-8 as alarm + rod-withdrawal-block only; **(c)** recalibrate the
power-defect/MTC so an un-trimmed 15 % cut parks ~+7 °C like a real core (most physical,
best for the teaching goal, biggest re-validation — all 51 campaign gates). CA-4's
backstop waits on this ruling.

## Phase 5+ (spray cap, SGTR, SI raise) — to be filled when built
## Phase 6 (ratings layer, manuals, plant name) — to be filled when built
