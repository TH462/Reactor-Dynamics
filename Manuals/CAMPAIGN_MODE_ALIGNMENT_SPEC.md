# Campaign Mode Alignment Spec (implementation handoff)

**Document:** PWR-CAMP-SPEC-01  
**Status:** SPEC ONLY — not implemented in code  
**Date:** 2026-07-16  
**Audience:** whoever next edits the PWR campaign / scenarios / in-product procedures  

This file captures **all campaign-side changes** required so that:

1. Campaign naming matches the manuals: **Mode N, Name** (e.g. **Mode 1, At Power**).  
2. The campaign can take the player **Mode 5, Cold Shutdown → Mode 1, At Power** and **back to Mode 5**, then optionally **return to Mode 1**.  

**Do not treat this file as done work.** Manuals already use the naming; `ui/campaign_data.js`, `scenarios/*`, and `ui/manual_procedures.js` still use Hot Standby / at power language and have **no Mode 5 path**.

Related: `11_CAMPAIGN_CROSSWALK.md`, `CAMPAIGN_MANUAL_DISCREPANCIES.md`.

---

## 1. Naming convention (must match manuals)

| MODE | Full form (use in titles, teaches, level_complete) | Engine / Free Play |
|------|-----------------------------------------------------|--------------------|
| 1 | **Mode 1, At Power** | `hot_full_power`, `50_percent`; power > 5 % |
| 2 | **Mode 2, Startup** | Critical, power ≤ 5 % |
| 3 | **Mode 3, Hot Standby** | `hot_zero_power` |
| 4 | **Mode 4, Hot Shutdown** | **[narr]** only |
| 5 | **Mode 5, Cold Shutdown** | **[narr]** only |
| 6 | **Mode 6, Refueling** | Out of scope |

After first full form in a beat, short **Mode N** is OK.

**Never** call Follow / Manual / Disconnected “Mode 1” or “Mode 5.”

### Honesty (Mode 4 / Mode 5)

> **UPDATE (2026-07): the engine now HAS a cold initial condition.** A `cold_shutdown`
> (Mode 5) initial state exists, and the full **Mode 5 → 4 → 3 → 2 → 1** heatup and the
> reverse cooldown are driveable on integrated physics (engine test `mode5_to_mode1_roundtrip`;
> new controls `set_pressure_setpoint`, `set_steam_dump_setpoint`, `set_rcp`; new indications
> `plant_mode`/`plant_mode_name`, `tavg_rate_c_per_hr`). Mode 4/5 missions can now START on a
> genuinely cold board (`cold_shutdown`) rather than parking at Hot Standby. See
> `CHANGELOG.md` and `Manuals/05_MODE_TRANSITIONS.md`.

Remaining honesty caveats for Mode 4/5 missions (still true):

- Cooldown **rates are time-compressed** (the lumped model is not wall-clock accurate). The
  HEATUP no longer is: since #251 it runs on the real pump-heat ramp with the reactor
  subcritical throughout — measured, ~12.3 plant-hours cold to the settled 567.0 °F (297.2 °C)
  no-load anchor at a steady ~30 °F/hr (16.7 °C/hr) (#419 real rates end to end, including the
  ~1.8 plant-hour pressurization leg) — so what is compressed there is the wall clock, via time
  acceleration, not the evolution.
- Cold Tavg on the `cold_shutdown` board reads ~50 °C (genuinely cold) — but if a mission parks
  at **Mode 3, Hot Standby** (`hot_zero_power`) instead, never claim instruments show cold Tavg
  when they show ~304 °C.

---

## 2. String updates — existing campaign missions

Update `teaches` in `ui/campaign_data.js` and scenario `title` / `description` / key outcomes.

| id | Current teaches (abbrev.) | Target teaches (example) |
|----|---------------------------|---------------------------|
| `pwr_hook` | scram button… | Mode 1, At Power — SCRAM and Rewind |
| `pwr_tour` | energy journey… | Mode 1, At Power — energy path; primary must not boil |
| `pwr_chain_reaction` | criticality… | Mode 3 → Mode 2 — criticality, source, SUR |
| `pwr_startup` | take reactor critical… | Mode 3, Hot Standby → Mode 1, At Power — startup to power *(extended to Mode 1, 2026-07-23)* |
| `pwr_feedback` | Doppler… | Mode 1, At Power — Doppler / MTC feedback |
| `pwr_xenon` | xenon… | After Mode 1 trip — xenon poison transient |
| `pwr_boron` | boron vs rods… | Mode 1, At Power — boron vs rods |
| `pwr_startup_challenge` | checkpoint criticality… | CHECKPOINT — Mode 3 → Mode 2 / low Mode 1, solo |
| `pwr_pressure_control` | heaters and spray… | Mode 1, At Power — PZR pressure |
| `pwr_sg_level` | feeding boilers… | Mode 1, At Power — SG level by hand |
| `pwr_feed_pump` | feed pump / three-element… | Mode 1 — feed pump vs three-element AUTO |
| `pwr_rod_auto` | rod AUTO… | Mode 1 — rod AUTO (Tavg), T-ref trap |
| `pwr_raise_power` | coordinated escalation… | Mode 1, At Power — raise power |
| `pwr_load_follow` | follow the grid… | Mode 1 — load Follow / Manual |
| `pwr_automation` | Automate tab… | Mode 1 — full AUTO suite |
| `pwr_shift_exam` | evening shift… | CHECKPOINT — Mode 1 dispatch 85↔100 MWe |
| `pwr_lower_power` | coming down… | Mode 1, At Power — lower power |
| `pwr_shutdown` | To Hot Standby… | **Mode 1, At Power → Mode 3, Hot Standby** |
| `pwr_protection` | RPS / alarms… | Mode 1 upset — RPS and alarm flood |
| `pwr_esf` | AUTO/MAN arms… | Mode 1 — ESF AUTO/MAN arms |
| `pwr_loss_of_feedwater` | losing heat sink… | Mode 1 — LOFW / AFW (→ Mode 3 if tripped) |
| `pwr_rcp_trip` | losing flow… | Mode 1 — RCP trip |
| `pwr_lof` | loss of flow… | Mode 1 — loss of flow / hot channel |
| `pwr_slb` | steam line break… | Mode 1 — steam line break |
| `pwr_msiv` | bottle the boiler… | Mode 1 — MSIV close / SG safeties |
| `pwr_stuck_porv` | stuck relief… | Mode 1 — stuck PORV (TMI rehearsal) |
| TMI / qualify | … | Mode 1 event → recover to Mode 3 |
| `pwr_sg_flood` (bonus) | flooding SG… | Mode 1 — feed left MANUAL |

### In-product procedure titles (`ui/manual_procedures.js`)

| id | New title (example) |
|----|---------------------|
| `pwr_startup` | Mode 3, Hot Standby → Mode 1, At Power — startup to power *(extended 2026-07-23; a Mode 5 → 3 heatup checklist `pwr_heatup` was added alongside)* |
| `pwr_raise_power` | Mode 1, At Power — raise power |
| `pwr_lower_power` | Mode 1, At Power — lower power |
| `pwr_shutdown` | Mode 1, At Power → Mode 3, Hot Standby |
| `pwr_pressure_control` | Mode 1, At Power — pressurizer pressure control |
| `pwr_sg_level` | Mode 1, At Power — steam generator level control |
| `pwr_loss_of_feedwater` | Mode 1 emergency — loss of main feedwater |
| `pwr_rcp_trip` | Mode 1 emergency — RCP trip / loss of flow |
| `pwr_stuck_porv` | Mode 1 emergency — stuck-open PORV recover |

Also replace “Hot Standby” alone in `purpose` / `outcome` with **Mode 3, Hot Standby**.

---

## 3. New missions — Mode 5 ↔ Mode 1 path

### 3.1 Required new scenarios

| New id | Kind | `initial_state` | Role |
|--------|------|-----------------|------|
| `pwr_mode5_to_mode3` | scenario | `hot_zero_power` | Teach Mode 5 → Mode 4 → arrive **Mode 3** **[narr]**; board already Mode 3 |
| `pwr_mode3_to_mode5` | scenario | `hot_zero_power` | After shutdown: Mode 3 → Mode 4 → **Mode 5** **[narr]** |
| `pwr_return_to_mode1` | scenario | `hot_zero_power` | After Mode 5: recall Mode 5→3, then player rods to Mode 2 and past 5% into **Mode 1** **[sim]** |

Optional narrative procedures (same content, `narrative: true` so harness skips):

- `pwr_mode5_to_mode3` procedure mirror  
- `pwr_mode3_to_mode5` procedure mirror  

### 3.2 Scenario beat sketches

#### `pwr_mode5_to_mode3`

1. **intro_mode5** — Define Mode 5, Cold Shutdown (cold, subcritical). Honesty: sim has no cold IC.  
2. **heatup_mode4** — Mode 4 heatup / PZR bubble / RCP story.  
3. **arrive_mode3** — “You are now in Mode 3, Hot Standby” — point at Tavg, pressure, subcritical power, SR.  
4. **lineup** — Quick N01 checks (RCP, rods in, SG).  
5. **level_complete** — Ready for approach to criticality (`pwr_startup`).

#### `pwr_mode3_to_mode5`

1. **mode3_hold** — Decay heat, heat sink after Mode 1→3 shutdown.  
2. **cooldown_mode4** — Borate / cooldown / depressurize narrative → Mode 4.  
3. **rhr** — RHR when permitted (optional soft action).  
4. **arrive_mode5** — Mode 5, Cold Shutdown complete; Mode 6 out of scope.  
5. **level_complete** — Plant “cold”; next path is return to Mode 1.

#### `pwr_return_to_mode1`

1. **from_mode5** — Recall Mode 5; board jumps to Mode 3 representation.  
2. **gate_rods** — Withdraw to criticality (Mode 2).  
3. **past_five** — Raise power > 5% → Mode 1, At Power.  
4. **level_complete** — Back in Mode 1.

### 3.3 Suggested campaign act order

Insert into `RD.CAMPAIGNS.pwr.acts` (recommended Continue order):

```
Act I — The Machine          (unchanged: hook, tour, chain_reaction)
Act II — The Physics
  + pwr_mode5_to_mode3          [NEW]   Mode 5 → Mode 3
  + pwr_startup                 Mode 3 → Mode 2
  + pwr_feedback, xenon, boron
  + pwr_startup_challenge       Mode 2 / low Mode 1
Act III — The Controls        (Mode 1 ops …)
  + … raise, load, automation, shift exam, lower …
  + pwr_shutdown                Mode 1 → Mode 3
  + pwr_mode3_to_mode5          [NEW]   Mode 3 → Mode 5
  + pwr_return_to_mode1         [NEW]   Mode 5 → Mode 1 (close the loop)
Act IV — When Things Go Wrong (Mode 1 upsets)
Act V — TMI-2
Act VI — Reckoning
```

**Round trip satisfied when:** player can run  
`mode5_to_mode3` → `startup` → … Mode 1 … → `shutdown` → `mode3_to_mode5` → `return_to_mode1`.

---

## 4. Files to touch (implementer checklist)

| File | Action |
|------|--------|
| `ui/campaign_data.js` | teaches strings; insert 3 missions; order |
| `scenarios/pwr_mode5_to_mode3.js` | **NEW** |
| `scenarios/pwr_mode3_to_mode5.js` | **NEW** |
| `scenarios/pwr_return_to_mode1.js` | **NEW** |
| `scenarios/pwr_*.js` | Light Mode N in title/description/key beats |
| `ui/manual_procedures.js` | Titles / purpose / outcome Mode language; optional narr procs |
| `index.html` / test HTML | Script tags for new scenarios |
| `test/run_campaign.js` | Register new scenarios if list is explicit |
| `Blueprint/pwr_training_campaign.md` | Syllabus tables sync |
| `Manuals/CAMPAIGN_MANUAL_DISCREPANCIES.md` | Mark items resolved after ship |

**Out of scope for manuals commit:** all of the above code (this is the work order).

---

## 5. Tests after implementation

1. `node test/run_procedures.js` — existing procs green; narrative Mode 5 procs skipped.  
2. `node test/run_campaign.js` — new missions complete.  
3. Manual smoke: Plant & Mission → play Mode 5→3 → startup → shutdown → Mode 3→5 → return Mode 1.  
4. Grep campaign for residual “To Hot Standby” without Mode 3.

---

## 6. Acceptance criteria (campaign done when…)

- [x] All PWR campaign `teaches` use **Mode N, Name** where a plant state is named. *(done — `ui/campaign_data.js` teaches + in-product procedure titles in `ui/manual_procedures.js`.)*
- [x] Player can complete a path that **starts at Mode 5, Cold Shutdown** and reaches **Mode 1, At Power** on the board. *(`pwr_return_to_mode1`, driven from the `cold_shutdown` IC — no longer narrative-only.)*
- [x] Player can complete a path from **Mode 3, Hot Standby** to **Mode 5, Cold Shutdown**. *(`pwr_mode3_to_mode5`.)*
- [x] Player can **heat up** from Mode 5 to Mode 3 on the board. *(`pwr_mode5_to_mode3`.)*
- [x] Mode 5 honesty banners present. *(Each transition mission's intro states the compressed rate + nuclear-heat-source simplification.)*
- [x] Manuals `11_CAMPAIGN_CROSSWALK.md` updated for the 3 new missions (PWR mission count 31 → 34). *(Verified current at Rev 1 in the 2026-07-19 pre-ship review — maps all 34 missions + bonus.)*
- [x] Discrepancies file updated: naming + Mode 5 path resolved.

---

## 7. Change control

| Date | Note |
|------|------|
| 2026-07-16 | Spec authored from manuals Rev 2; **no campaign code changed**. |
| 2026-07-16 | **§2 string alignment applied** — all PWR campaign `teaches` (`ui/campaign_data.js`), PWR procedure titles/purpose/outcome (`ui/manual_procedures.js`), and the two startup scenario descriptions now use **Mode N, Name**. §3 new Mode-5-path missions still pending (engine cold IC + Mode 5↔1 transition already landed separately). |
| 2026-07-17 | **§3 new missions authored** — `pwr_mode5_to_mode3` (Act II), `pwr_mode3_to_mode5` + `pwr_return_to_mode1` (Act III), driven on integrated physics from the `cold_shutdown` board. Required a control-layer P-7/P-11 RPS trip bypass so a cold plant loads un-scrammed and can be heated. PWR campaign 31 → **34 missions**; run_campaign **47/47** with functional drives for all three. Remaining: `11_CAMPAIGN_CROSSWALK.md` mission-map refresh. |
