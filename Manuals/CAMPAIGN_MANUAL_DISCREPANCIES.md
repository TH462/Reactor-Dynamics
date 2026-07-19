# PWR Plant Manuals vs Training Campaign — Discrepancies

**Document:** PWR-MAN-CMP-01  
**Date:** 2026-07-16  
**Updated:** 2026-07-16 (manuals Rev 2)  
**Purpose:** Record differences between the external operator manuals in `Manuals/` and the PWR training campaign (“Zero to Operator”) as shipped in `ui/campaign_data.js` / `Blueprint/pwr_training_campaign.md`, with in-product walkthroughs in `ui/manual_procedures.js`.  

**Scope of this file:** Comparison. Manuals Rev 2 aligned naming to **Mode N, Name** and added crosswalk + campaign **spec**. **UPDATE 2026-07:** the campaign is now aligned — `teaches` and procedure titles use **Mode N, Name**; the engine has a **`cold_shutdown` (Mode 5)** initial condition with the full Mode 5 ↔ Mode 1 transition simulated; and the three **Mode-5-path missions** (`pwr_mode5_to_mode3`, `pwr_mode3_to_mode5`, `pwr_return_to_mode1`) are authored and driven on the board (PWR campaign now **34 missions** + 1 bonus). `11_CAMPAIGN_CROSSWALK.md` is **refreshed (Rev 1)** and maps all 34 + bonus — verified current in the 2026-07-19 pre-ship review. This discrepancies file is now largely historical; the naming, Mode-5 path, and crosswalk items are all closed.

**Handoff for campaign implementers:** `CAMPAIGN_MODE_ALIGNMENT_SPEC.md`  
**Live map:** `11_CAMPAIGN_CROSSWALK.md`

---

## 1. Sources compared

| Source | Role |
|--------|------|
| `Manuals/*.md` (Rev 2) | Operator manuals (**Mode N, Name** convention, N/T/A/E/X procedures) |
| `ui/campaign_data.js` → `RD.CAMPAIGNS.pwr` | As-built campaign syllabus (31 missions + 1 bonus) |
| `Blueprint/pwr_training_campaign.md` | Campaign design / mission intent |
| `ui/manual_procedures.js` → `RD.MANUAL_PROCEDURES.pwr` | In-product procedure walkthroughs used by campaign `[P]` missions |

---

## 2. Summary judgment

| Area | Assessment |
|------|------------|
| Physics & setpoints | Largely **aligned** (same plant, same engine numbers) |
| Control surface topics | Campaign more UI-skill; manuals ops breadth + §17 campaign skills (Rev 2) |
| Failure coverage | Manuals list **all** modeled failures; campaign drills a **subset** |
| Plant MODE language | **Manuals:** Mode 1, At Power … Mode 5, Cold Shutdown. **Campaign:** now aligned — `teaches` + procedure titles use **Mode N, Name** (2026-07) |
| Startup path | Manuals Mode 5↔1; **now fully covered** — engine simulates the path (`cold_shutdown` IC) and three campaign missions (`pwr_mode5_to_mode3`, `pwr_mode3_to_mode5`, `pwr_return_to_mode1`) drive it on the board |
| Traceability | IDs still differ; **11_CAMPAIGN_CROSSWALK.md** maps them (Rev 1 — all 34 missions + bonus, current) |

Manuals Rev 2 closed naming + documentation gaps. Campaign Mode-N **strings are aligned**, the **engine supports the Mode 5 path**, and the **three Mode-5 missions are authored** (spec §3 complete). Remaining housekeeping: the crosswalk mission map.

---

## 3. Terminology discrepancies

| Topic | Manuals | Campaign / in-product procedures | Severity |
|-------|---------|----------------------------------|----------|
| Plant state names | **Mode 1, At Power**, **Mode 2, Startup**, **Mode 3, Hot Standby**, **Mode 4 / Mode 5** | Campaign `teaches` + procedure titles now use **Mode N, Name** | **RESOLVED** (2026-07) |
| Shutdown endpoint | **PWR-N14** / **PWR-T04**: Mode 1, At Power → **Mode 3, Hot Standby** | Mission 18 `pwr_shutdown`: “Mode 1, At Power → **Mode 3, Hot Standby**” | **RESOLVED** |
| Post-trip state | Hot, subcritical = still **Mode 3, Hot Standby** (by T class) | “Stable hot standby,” “shutdown board” | **L** |
| Turbine load modes | Explicitly **not** plant MODES (Follow / Manual / Disconnected) | Same three load modes in `pwr_tour` / `pwr_load_follow` — consistent concept, different framing | **L** |
| SCRAM | Two-press arm/confirm documented | Mission 1 teaches SCRAM; playtest noted two-press friction vs beat text | **M** (product/playtest; manuals clearer) |

---

## 4. Curriculum structure discrepancies

| Topic | Manuals | Campaign | Severity |
|-------|---------|----------|----------|
| Learning order | Recommends MODE table → controls → **Mode 5, Cold Shutdown→One** master path → failures | Six acts: Machine → Physics → Controls → Upsets → TMI-2 → Qualify; **starts with SCRAM and HFP tour**, not cold startup | **H** |
| Cold path (Mode 5, Cold Shutdown) | Full narrative **PWR-T20 / T21**, N03, N15 | **Absent** — all missions use hot ICs (`hot_full_power`, `50_percent`, `hot_zero_power`) | **H** |
| Time budget | Commercial procedures can be long (esp. criticality) | Design goal: **~5 min wall-clock** per mission; `pwr_startup` walkthrough is known to exceed that | **M** |
| Gating | Free Play + self-directed procedure following | All missions open; recommended act order only | **L** |
| Checkpoints | None graded in manuals | Two graded: `pwr_startup_challenge`, `pwr_shift_exam` + `pwr_qualify` | **M** |
| Mission count in manuals overview | `02` says “~31 missions” (correct) | 31 required + **bonus** `pwr_sg_flood` | **L** |

---

## 5. Procedure / mission crosswalk

### 5.1 Campaign missions that map cleanly to manuals

| # | Campaign mission | Kind | Closest manual coverage | Notes |
|---|------------------|------|---------------------------|-------|
| 1 | `pwr_hook` | [S] | `02` SCRAM / `03` SCRAM | Manuals don’t use a “hook” lesson format |
| 2 | `pwr_tour` | [S] | `01` energy path | Campaign: Manual 900 MWe then Follow; manuals also use load examples |
| 3 | `pwr_chain_reaction` | [S] | `01` / N02 concepts | Campaign starts subcritical; manuals Mode 3, Hot Standby→Two |
| 4 | `pwr_startup` | [P] | **PWR-N02** (+ N01, T13) | Same intent; **IDs differ**; in-product steps shorter than N02 |
| 5 | `pwr_feedback` | [S] | `01` Doppler/MTC | No dedicated N procedure |
| 6 | `pwr_xenon` | [S] | **PWR-N09** | Campaign is post-scram xenon arc; N09 is broader chemistry/ops |
| 7 | `pwr_boron` | [S] | **PWR-N09** | Campaign: dilute then borate from 50 % |
| 9 | `pwr_pressure_control` | [P] | **PWR-N10** | Aligned |
| 10 | `pwr_sg_level` | [P] | **PWR-N12** | Aligned (manual feed focus) |
| 13 | `pwr_raise_power` | [P] | **PWR-N07** / N06 | In-product from 50 % with fixed MWe targets |
| 14 | `pwr_load_follow` | [S] | **PWR-T07/T08**, N07/N08 | Campaign story ~800 MWe ramp |
| 17 | `pwr_lower_power` | [P] | **PWR-N08** | Aligned |
| 18 | `pwr_shutdown` | [P] | **PWR-N14** | Endpoint naming: Hot Standby vs Mode 3, Hot Standby |
| 19 | `pwr_protection` | [S] | `06` + **PWR-E03** | Alarm flood + turbine trip |
| 20 | `pwr_esf` | [S] | **PWR-T12**, AFW/HPI in `03` | Dedicated ESF arms lesson only in campaign |
| 21 | `pwr_loss_of_feedwater` | [P] | **PWR-E01** | Aligned |
| 22 | `pwr_rcp_trip` | [P] | **PWR-E02** | Aligned |
| 23 | `pwr_lof` | [S] | **PWR-E02** (overlap) | Second LOF angle (hot channel / trip speed) — manuals don’t split E02 vs LOF scenario |
| 24 | `pwr_slb` | [S] | **PWR-E19** | Aligned topic |
| 25 | `pwr_msiv` | [S] | `03` MSIV + A23 | No dedicated **PWR-N##** “bottle the boiler” procedure |
| 26 | `pwr_stuck_porv` | [P] | **PWR-E07** / E08 | Aligned |
| 27–29 | TMI-2 p1–p3 | [S] | **PWR-X01** (compressed) | Campaign has multi-part chat module manuals don’t reproduce |
| 30 | `pwr_tmi` | [S] | **PWR-X01** | Aligned topic |
| 31 | `pwr_qualify` | [S] | **PWR-E07/E08/X01** exam style | Manuals are not graded |
| Bonus | `pwr_sg_flood` | [S] | N12 MANUAL feed + **E16** partial | Named “what control did you forget?” only in campaign |

### 5.2 Campaign missions with **weak or no** dedicated manual procedure

| Mission | Gap in manuals |
|---------|----------------|
| `pwr_startup_challenge` | No graded solo-criticality exam procedure; N02 is instructional only |
| `pwr_feed_pump` | N12 mentions three-element vs MANUAL; no separate “specialist” procedure |
| `pwr_rod_auto` | `03` / T10 cover rod AUTO; no T-ref-capture trap drill steps |
| `pwr_automation` | Automate tab in `03`/T10; no full multi-channel dispatcher exercise |
| `pwr_shift_exam` | No free-form 850↔1000 MWe graded shift procedure |
| TMI-2 Parts 1–3 | Single narrative **X01**; not three mission scripts |

### 5.3 Manual procedures with **no** campaign mission

| Manual ID | Title | Notes |
|-----------|-------|-------|
| PWR-N01 | Mode 3, Hot Standby lineup | Implied by Free Play Hot Standby; not a campaign step |
| PWR-N03 | Mode 5, Cold Shutdown → Three heatup | **[narr]**; campaign never teaches cold path |
| PWR-N04 | Mode 2, Startup / POAH | Partially inside startup/chain missions |
| PWR-N05 | Turbine roll & sync | Partially inside load/tour missions |
| PWR-N11 | PZR level / CVCS inventory | Not a dedicated mission (boron mission touches CVCS) |
| PWR-N13 | RCP operation (approx) | Only trip scenario, not normal ops |
| PWR-N15 | Mode 3, Hot Standby → Five cooldown | **[narr]**; no campaign equivalent |
| PWR-T20 / T21 | Master Mode 5, Cold Shutdown ↔ Mode 1, At Power | **Absent** from campaign entirely |
| PWR-A01–A26 | Full alarm response set | Campaign teaches alarm *philosophy* (`pwr_protection`), not each ARP |
| PWR-E04–E06, E09–E18, E20–E21 | Many failures | Not in campaign syllabus (see §6) |

### 5.4 ID system mismatch

| Layer | Example IDs |
|-------|-------------|
| Campaign / `MANUAL_PROCEDURES` | `pwr_startup`, `pwr_raise_power`, `pwr_stuck_porv` |
| External manuals | `PWR-N02`, `PWR-N07`, `PWR-E07` |
| Operator Manual Plan (Blueprint) | Same N/E scheme as external manuals |

**Discrepancy:** No table in either product maps `pwr_*` ↔ `PWR-N##` / `PWR-E##`. Trainers and learners must infer.

---

## 6. Failure-coverage discrepancies

| Failure (manuals) | Manual ID | In campaign? |
|-------------------|-----------|--------------|
| Loss of main feedwater | E01 | Yes — `pwr_loss_of_feedwater` |
| RCP trip | E02 | Yes — `pwr_rcp_trip` (+ `pwr_lof`) |
| Turbine trip | E03 | Yes — via `pwr_protection` |
| Loss of offsite power | E04 | **No** dedicated mission |
| Station blackout | E05 | **No** — design explicitly **abandoned** SBO exam (unsurvivable) |
| SGTR | E06 | **No** |
| Stuck PORV / indicator | E07–E08 | Yes — stuck_porv, TMI, qualify |
| Large LOCA | E09 | **No** |
| Loss of condenser vacuum | E10 | **No** |
| Degraded HPI | E11 | **No** |
| AFW failure | E12 | **No** (ESF lesson assumes AFW works) |
| ATWS | E13 | **No** |
| Spray stuck / heaters failed | E14–E15 | **No** |
| SG overfeed | E16 | Partial — bonus `pwr_sg_flood` (MANUAL feed), not same failure inject |
| Continuous rod withdrawal | E17 | **No** |
| Stuck rod on scram | E18 | **No** |
| Steam line break | E19 | Yes — `pwr_slb` |
| Tavg / PZR level sensor fails | E20–E21 | **No** |
| MSIV at power | (controls + A23) | Yes — `pwr_msiv` (scenario, not E-id) |

**Severity:** **H** for training completeness if manuals are treated as “do every EOP in the campaign.” Campaign is deliberately curated; manuals are encyclopedia-complete.

---

## 7. Content / technical discrepancies

| ID | Topic | Manuals say | Campaign / procedures say | Severity |
|----|-------|-------------|---------------------------|----------|
| D-01 | NIS honesty | Full SR / IR / PR model with P-6, P-10, SR handoff required | `pwr_chain_reaction` honesty beat: power_range “covers the whole span” (older simplicity framing) | **M** |
| D-02 | Startup SUR target | SUR ≤ 1 DPM preferred; trainer may ~2 DPM at crossing | Procedure cautions similar; challenge mission holds 1–10 % band | **L** |
| D-03 | Load step size | Warns against large Manual cuts (trip risk) | `pwr_tour` uses 900 MWe; playtest softlock if player cuts too deep | **M** |
| D-04 | Raise-power targets | Generic Mode 1, At Power escalation | In-product `pwr_raise_power`: rods then **≈ 700 MWe** from 50 % | **L** |
| D-05 | Lower-power targets | Generic | In-product: **600 MWe** then rods | **L** |
| D-06 | Load-follow story | T07/T08 general | Campaign: **800 MWe** evening ramp then back to 1000 + Follow | **L** |
| D-07 | Shutdown method | N14 allows controlled down-power then SCRAM | In-product shutdown: load → 0 then **SCRAM** | **L** |
| D-08 | TMI recovery | Isolate block valve; keep HPI; trust subcooling | Same core teaching across stuck_porv / tmi / qualify | **Aligned** |
| D-09 | SBO | E05 documented with “may be unsurvivable” | Campaign **removed** SBO qualify path for same physics reason | **Aligned** (intent) / manuals still teach E05 |
| D-10 | Rewind | Mentioned as mission recovery | Central to campaign failure cards; playtest found rewind quirks | **M** (product) |
| D-11 | Act id `act5` | Not discussed in depth | Act VI still keyed `act5` for progress persistence | **L** (dev only) |
| D-12 | 1/M panel | Little/no 1/M scratchpad procedure in manuals | Campaign Act II / startup tooling emphasizes 1/M | **M** |
| D-13 | Mode 5, Cold Shutdown in Free Play | Explicitly no IC; narr only | Campaign never references Mode 5, Cold Shutdown | **Aligned** on sim limits; manuals still sell Mode 5, Cold Shutdown path as training story |

---

## 8. Overlap confusion risks (operator-facing)

1. **“Do I use the Manuals or the campaign?”**  
   Campaign is the guided curriculum; manuals are the commercial reference. Manuals do not say “Mission 13 = N07.”

2. **Hot Standby vs Mode 3, Hot Standby**  
   Same board state, two names. After Rev 1 manuals, campaign/in-product text will feel “old.”

3. **Two loss-of-flow lessons** (`pwr_rcp_trip` vs `pwr_lof`) map to one emergency procedure (E02).

4. **Four TMI experiences** (stuck_porv, tmi2×3, tmi, qualify) vs one **PWR-X01** chapter.

5. **Mode 5, Cold Shutdown → Mode 1, At Power** is a manuals centerpiece; **zero campaign missions** exercise it. A reader of manuals may expect Free Play cold starts that do not exist.

6. **In-product Operator’s Manual (M key)** is generated from `manual_data` / `manual_procedures` — a **third** surface that matches the campaign walkthroughs better than the external `Manuals/` set.

---

## 9. Alignment checklist (what matches well)

- Same PWR plant, synoptic controls, instrument-first (HR1) philosophy  
- Negative feedbacks, subcooling, decay heat after shutdown  
- SCRAM, AFW on LOFW, PORV block isolate on stuck open, load Follow/Manual  
- TMI as accident of information  
- Approximate mission count (~31) stated in manuals §12  
- SBO not used as qualification exam  

---

## 10. Recommended reconciliations (not implemented)

| Priority | Action |
|----------|--------|
| 1 | Add a **mission ↔ procedure crosswalk** table to manuals README (and/or campaign Blueprint) |
| 2 | Adopt **Mode 1, At Power / Mode 3, Hot Standby** phrasing in campaign `teaches` strings and in-product procedure titles (e.g. shutdown “to Mode 3, Hot Standby”) |
| 3 | Label manuals **PWR-T20/T21** clearly as “commercial story; campaign never leaves hot envelope” |
| 4 | Either add campaign missions for high-value missing E-procedures or mark those E-procs “Free Play only” in manuals index |
| 5 | Point manuals N02 explicitly at walkthrough id `pwr_startup` for dual use |
| 6 | Soften or update chain-reaction honesty text re: NIS if SR/IR are now first-class |
| 7 | Document in manuals that **in-product M-key manual** ≠ this `Manuals/` folder |

---

## 11. Full campaign inventory (reference)

| # | Act | id | kind |
|---|-----|-----|------|
| 1 | I | `pwr_hook` | scenario |
| 2 | I | `pwr_tour` | scenario |
| 3 | I | `pwr_chain_reaction` | scenario |
| 4 | II | `pwr_startup` | procedure |
| 5 | II | `pwr_feedback` | scenario |
| 6 | II | `pwr_xenon` | scenario |
| 7 | II | `pwr_boron` | scenario |
| 8 | II | `pwr_startup_challenge` | scenario (checkpoint) |
| 9 | III | `pwr_pressure_control` | procedure |
| 10 | III | `pwr_sg_level` | procedure |
| 11 | III | `pwr_feed_pump` | scenario |
| 12 | III | `pwr_rod_auto` | scenario |
| 13 | III | `pwr_raise_power` | procedure |
| 14 | III | `pwr_load_follow` | scenario |
| 15 | III | `pwr_automation` | scenario |
| 16 | III | `pwr_shift_exam` | scenario (checkpoint) |
| 17 | III | `pwr_lower_power` | procedure |
| 18 | III | `pwr_shutdown` | procedure |
| 19 | IV | `pwr_protection` | scenario |
| 20 | IV | `pwr_esf` | scenario |
| 21 | IV | `pwr_loss_of_feedwater` | procedure |
| 22 | IV | `pwr_rcp_trip` | procedure |
| 23 | IV | `pwr_lof` | scenario |
| 24 | IV | `pwr_slb` | scenario |
| 25 | IV | `pwr_msiv` | scenario |
| 26 | IV | `pwr_stuck_porv` | procedure |
| 27 | V | `pwr_tmi2_p1` | scenario |
| 28 | V | `pwr_tmi2_p2` | scenario |
| 29 | V | `pwr_tmi2_p3` | scenario |
| 30 | VI | `pwr_tmi` | scenario |
| 31 | VI | `pwr_qualify` | scenario |
| Bonus | — | `pwr_sg_flood` | scenario |

In-product procedures used by campaign:  
`pwr_startup`, `pwr_pressure_control`, `pwr_sg_level`, `pwr_raise_power`, `pwr_lower_power`, `pwr_shutdown`, `pwr_loss_of_feedwater`, `pwr_rcp_trip`, `pwr_stuck_porv`  
(+ narrative `pwr_tmi` in procedures file; campaign also runs `pwr_tmi` as scenario).

---

## 12. Change control

| Date | Change |
|------|--------|
| 2026-07-16 | Initial comparison of `Manuals/` Rev 1 vs campaign v2 (31 missions) and `manual_procedures.js` PWR set. |
| 2026-07-16 | Manuals Rev 2: Mode N, Name convention; crosswalk; campaign alignment **spec** (code not changed). |
