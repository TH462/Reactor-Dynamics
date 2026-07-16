# 11 — Campaign ↔ Manuals Crosswalk

**Document:** PWR-XW-01  
**Revision:** 0  
**Campaign:** PWR — Zero to Operator (`ui/campaign_data.js`)  
**Manuals:** this `Manuals/` set (MODE naming Rev 2)  

Use this table to jump between a campaign mission and the matching operator procedure.  
Campaign code still uses older “Hot Standby / at power” wording until `CAMPAIGN_MODE_ALIGNMENT_SPEC.md` is implemented.

---

## 1. MODE quick map

| Free Play / engine | Plant MODE (manuals) |
|--------------------|----------------------|
| `hot_full_power`, `50_percent` | **Mode 1, At Power** |
| Critical ≤ 5 % | **Mode 2, Startup** |
| `hot_zero_power` | **Mode 3, Hot Standby** |
| Cooldown / cold story | **Mode 4 / Mode 5** **[narr]** |

---

## 2. Mission → procedure map

| # | Campaign id | Kind | Plant MODE focus | Manual procedure(s) |
|---|-------------|------|------------------|---------------------|
| 1 | `pwr_hook` | [S] | Mode 1 | `02` SCRAM; `03` SCRAM |
| 2 | `pwr_tour` | [S] | Mode 1 | `01` energy path; T07 load Manual |
| 3 | `pwr_chain_reaction` | [S] | Mode 3 → 2 | N02 concepts; SUR |
| 4 | `pwr_startup` | [P] | Mode 3 → 2 | **PWR-N01**, **PWR-N02**, T13 |
| 5 | `pwr_feedback` | [S] | Mode 1 | `01` Doppler/MTC |
| 6 | `pwr_xenon` | [S] | post Mode 1 trip | **PWR-N09** |
| 7 | `pwr_boron` | [S] | Mode 1 | **PWR-N09** |
| 8 | `pwr_startup_challenge` | [S] | Mode 3 → 2 / low Mode 1 | N02 (graded in campaign only) |
| 9 | `pwr_pressure_control` | [P] | Mode 1 | **PWR-N10** |
| 10 | `pwr_sg_level` | [P] | Mode 1 | **PWR-N12** |
| 11 | `pwr_feed_pump` | [S] | Mode 1 | **PWR-N12** + § feed specialist (`03`) |
| 12 | `pwr_rod_auto` | [S] | Mode 1 | **PWR-T10/T11**; rod AUTO note (`03`) |
| 13 | `pwr_raise_power` | [P] | Mode 1 | **PWR-N07** / N06 |
| 14 | `pwr_load_follow` | [S] | Mode 1 | **PWR-T07/T08** |
| 15 | `pwr_automation` | [S] | Mode 1 | **PWR-T10** |
| 16 | `pwr_shift_exam` | [S] | Mode 1 | N07/N08 (graded in campaign only) |
| 17 | `pwr_lower_power` | [P] | Mode 1 | **PWR-N08** |
| 18 | `pwr_shutdown` | [P] | Mode 1 → 3 | **PWR-N14**, **PWR-T04** |
| 19 | `pwr_protection` | [S] | Mode 1 | `06`; **PWR-E03** |
| 20 | `pwr_esf` | [S] | Mode 1 | **PWR-T12**; HPI/AFW in `03` |
| 21 | `pwr_loss_of_feedwater` | [P] | Mode 1 | **PWR-E01** |
| 22 | `pwr_rcp_trip` | [P] | Mode 1 | **PWR-E02** |
| 23 | `pwr_lof` | [S] | Mode 1 | **PWR-E02** (second LOF angle) |
| 24 | `pwr_slb` | [S] | Mode 1 | **PWR-E19** |
| 25 | `pwr_msiv` | [S] | Mode 1 | `03` MSIV; A23; bottle note |
| 26 | `pwr_stuck_porv` | [P] | Mode 1 | **PWR-E07**, E08 |
| 27–29 | `pwr_tmi2_p*` | [S] | Mode 1 → 3 | **PWR-X01** |
| 30 | `pwr_tmi` | [S] | Mode 1 → 3 | **PWR-X01** |
| 31 | `pwr_qualify` | [S] | Mode 1 | E07/E08/X01 exam style |
| Bonus | `pwr_sg_flood` | [S] | Mode 1 | N12 MANUAL; E16 partial |

### Planned (not in campaign yet)

| Proposed id | MODE path | Manual |
|-------------|-----------|--------|
| `pwr_mode5_to_mode3` | Mode 5 → Mode 3 | **PWR-T20** Phase A–B, **PWR-N03** |
| `pwr_mode3_to_mode5` | Mode 3 → Mode 5 | **PWR-T21** Phase C, **PWR-N15** |
| `pwr_return_to_mode1` | Mode 5 → Mode 1 | **PWR-T20** full + N02/N06 |

See `CAMPAIGN_MODE_ALIGNMENT_SPEC.md`.

---

## 3. Procedure id systems

| Layer | Example |
|-------|---------|
| Campaign / in-product walkthrough | `pwr_startup` |
| External manuals | **PWR-N02** |

---

## 4. Manual topics not in campaign

| Manual | Topic |
|--------|-------|
| PWR-N03 / N15 / T20 / T21 | Full Mode 5 ↔ Mode 1 commercial path |
| PWR-A01–A26 | Per-annunciator ARP |
| PWR-E04–E06, E09–E18, E20–E21 | Failures not in syllabus |
| PWR-N11, N13 | CVCS level detail; RCP normal ops |

---

## 5. Campaign topics expanded in manuals (Rev 2)

| Topic | Manual location |
|-------|-----------------|
| ESF AUTO/MAN re-arm | `05` PWR-T12; `03` Emergency card |
| MSIV “bottle the boiler” | `03` MSIV; `07` related; below |
| Rod AUTO T-ref capture | `03` Automate / T10 caution |
| Feed three-element vs MANUAL | `03` / **PWR-N12** |
| 1/M / NIS handoff | `03` NIS; N02; `05` T13 |
| Mode 5 path | `05` T20/T21; N03/N15 |
