# 03 — Controls and Indications

**Document:** PWR-CI-01  
**Title:** Control Station Inventory and Operating Instructions  
**Revision:** 0  

---

## 1.0 Purpose

Describe every operator control and major indication on the PWR board, with purpose, location, operating procedure, and cautions. Use this as the **control station operating procedure** companion to plant evolutions in `04`–`07`.

**Naming rule:** Controls are named by **on-screen label**.

---

## 2.0 General control rules

| Rule | Detail |
|------|--------|
| **Command path** | Controls issue commands; the next snapshot shows the result. Nothing “teleports.” |
| **Instruments only** | You see lagged/noisy/failable readings, not true state (unless diagnostic overlay). |
| **AUTO vs MAN** | Manual action on an automated control often forces MAN until re-engaged. |
| **ESF arms** | Manual start/stop/throttle of HPI or AFW takes that system to MANUAL; press AUTO to re-arm. |
| **Two-press** | SCRAM, MSIV close, PORV block isolate, etc. require arm then confirm. |
| **Tap vs. hold (rod drive)** | Control-bank Raise/Lower: a quick click steps one step; hold to drive continuously, release to stop. Shutdown-bank Withdraw/Insert: one click drives the whole way (fast speed) — no hold. |

---

## 3.0 Rod Control card

**Location:** Synoptic left margin — Rod Control  
**Highlight id:** `reactor-rods`

### 3.1 Control Bank — Raise / Lower

| Item | Detail |
|------|--------|
| **Purpose** | Move the operable control rod group to change reactivity and power |
| **Direction** | Raise = withdraw = add reactivity; Lower = insert = remove reactivity |
| **Quick click** | Steps the bank **one step** |
| **Hold** | Drives continuously at the selected **Rod Speed**; release to halt |
| **Indication** | Vertical bar + step count (0 = fully inserted, max ≈ 228 steps fully withdrawn) |
| **Operating position** | ≈ 92 % withdrawn at hot full power |

**Procedure — move rods**

1. Select **Rod Speed**: Slow | Normal | Fast.  
2. Click **Raise** or **Lower** for a single step, or hold either to drive continuously.  
3. Watch **Startup Rate (SUR)** and power.  
4. Release to stop (a hold stops as soon as you let go; a click is already a discrete step).  

**CAUTION:** Target SUR ≤ **1 DPM** and reactor period ≥ **30 s** on approach to criticality. This trainer’s coarse single bank may briefly read ~2 DPM at the criticality crossing.

**Interlock:** Rod **withdrawal** is blocked when SUR ≥ **2.5 DPM** until SUR < **1.5 DPM**. Insertion always remains available.

### 3.2 Rod Speed

| Speed | Use |
|-------|-----|
| **Slow** | Final approach to criticality; fine power trim |
| **Normal** | Routine power maneuvering |
| **Fast** | Large intentional moves (watch SUR) |

### 3.3 Shutdown Bank — Withdraw / Insert

| Item | Detail |
|------|--------|
| **Purpose** | Emergency-protection rod group — carries shutdown margin, not used for routine reactivity trim |
| **Normal position** | Fully **withdrawn** (green) at power |
| **Withdraw / Insert** | One click drives it the **whole way** out or in, at **fast** speed (not held — it is a full-stroke command, not a step or a drive-to-release control) |
| **Indication** | Vertical bar + step count, same as the control bank |
| **SCRAM** | Drives fully in automatically and **overrides** any manual Withdraw/Insert command |

**CAUTION:** Red if not fully withdrawn during power operation (abnormal) — parking it in at power gives up shutdown margin. Insert it deliberately only as part of a planned shutdown/cooldown, not as a substitute for control-bank trim.

### 3.4 Insertion Limit

- Power-dependent floor on control bank withdrawal position.  
- Alarm **ROD INS LIMIT** when at/below limit.  
- Do not park rods below the limit during power operation without a plan to restore.

### 3.5 SCRAM

| Item | Detail |
|------|--------|
| **Purpose** | Emergency / rapid shutdown — full rod insertion |
| **Action** | Arm (cover / first press), then confirm SCRAM within timeout |
| **Effect** | All rods drive in; reactor power collapses; turbine load goes **Disconnected**; decay heat remains |

**Procedure — manual SCRAM**

1. Arm the SCRAM control.  
2. Confirm SCRAM.  
3. Verify **REACTOR TRIP** alarm, power falling, rods inserting.  
4. Verify heat sink (SG level / AFW) and inventory.  

---

## 4.0 Power & Reactivity card

**Location:** Left margin  
**Highlight id:** `reactor-power`

### 4.1 Indications

| Indication | Use |
|------------|-----|
| **Reactor Power** | Primary flux power % |
| **Tavg** | Average RCS temperature |
| **Leg ΔT** | Thot − Tcold (core thermal rise) |
| **Subcooling margin bar** | **Primary TMI diagnostic** — distance to boiling |
| **SUR** (Learning) | Startup rate, decades/min |
| **Xenon chip** (contextual) | Building / peaking / burning off |
| **Fuel status** (contextual) | Stable / damage / melt messaging — not raw °C |

### 4.2 Subcooling margin bar zones

| Zone | Margin | Meaning |
|------|--------|---------|
| Green | > **11 °C** | Healthy (above LO SUBCOOL) |
| Yellow | 0–11 °C | Approaching saturation |
| Red | < **0 °C** | Boiling / voiding risk |

**WARNING:** Do not throttle HPI solely because PZR level is high if subcooling is eroding.

### 4.3 Source Range detector (NIS)

| Control | Purpose |
|---------|---------|
| **SR detector On/Off** | Energize / secure source-range counter |

**Handoff rules (P-6):**

1. Do **not** switch SR **OFF** until Intermediate Range ≥ **1e-10 A** (on scale).  
2. Do **not** switch SR **ON** at high flux (IR ≥ **1e-6 A**) — detector protection.  
3. Secure SR during power rise **before** SR high-flux trip (**1e5 cps**).  

### 4.4 Startup trip blocks

| Block | When allowed |
|-------|----------------|
| IR high-flux trip block | Power above **P-10** (10 %) |
| PR low-setpoint (25 %) block | Power above **P-10** |

Blocks **auto-reinstate** when power falls below P-10.

---

## 5.0 Pressurizer (PZR) controls

**Location:** PZR Pressurizer card — pressure & level sections  
**Highlight id:** `pzr-pressurizer`

### 5.1 Primary pressure indication

- System reference pressure for the whole RCS (uniform model).  
- Normal: **15.41 MPa**.  

### 5.1a Pressure setpoint (Press SP)

- The pressure-control **setpoint** (MPa) the AUTO heaters/spray drive toward, shown as a live
  readout with a numeric **Press SP** box (0.1–17 MPa; engine clamps to the relief band).  
- **Raise** it toward NOP (**15.41 MPa**) during a heatup — the heaters pressurize to the new target;
  **lower** it during a cooldown so spray/relief brings pressure down. Used by the Mode-transition
  missions. (MPa-denominated regardless of the US/SI display toggle, like the load setpoint.)

### 5.2 PZR Heaters

| Mode | Effect |
|------|--------|
| **AUTO** | Heaters proportional when pressure below setpoint band |
| **ON / %** | Manual heat — raises pressure by boiling PZR liquid into steam space |
| **OFF** | No heater power |

**Use to RAISE pressure** (restore subcooling, recover after spray/overcooling).

### 5.3 PZR Spray

| Mode | Effect |
|------|--------|
| **AUTO** | Spray when pressure above setpoint band |
| **Manual open / %** | Condenses steam — **lowers** pressure |
| **Requires** | RCP flow (no flow → no effective spray) |

**Use to LOWER pressure** carefully. Return to AUTO when on target.

**CAUTION:** Spray stuck open (failure) depressurizes continuously — isolate cause, heat if needed, trip if required.

### 5.4 PZR Level

- Normal ≈ **55 %** at HFP.  
- Controlled primarily by **CVCS** charging/letdown.  
- **TMI trap:** level can **rise** while total inventory **falls** (void surge).  

---

## 6.0 Relief Valves card

**Location:** Top margin near PZR  
**Highlight id:** `pzr-relief`

### 6.1 PORV — Open / Close

| Item | Detail |
|------|--------|
| **Purpose** | Power-Operated Relief Valve — rapid pressure relief |
| **Auto** | Opens ~**16.20 MPa**, reseats ~**15.86 MPa** (control layer on pressure instrument) |
| **Indicator** | Shows **commanded** position — can disagree with actual (TMI) |
| **Tailpipe temp** | Hot discharge (~150 °C class) can reveal steam passing while light says closed |

**Procedure — if PORV should be shut but leak suspected**

1. Command **PORV Close**.  
2. Check **subcooling**, primary pressure trend, **tailpipe temperature**, inventory.  
3. If leak continues → **Isolate PORV Block Valve**.  

### 6.2 PORV Block Valve — Open / Isolate

| Item | Detail |
|------|--------|
| **Purpose** | Isolation valve upstream of PORV |
| **Default** | Open (relief path available) |
| **Isolate** | Stops all PORV line flow even if PORV stuck open — **key TMI recovery** |
| **Arming** | Two-press CONFIRM? on Isolate |

**NOTE:** Spring safety valves are a **separate** path; block valve does not isolate safeties.

### 6.3 Safety valves (indication only)

- Mechanical / control-actuated spring safeties.  
- Open ≈ **17.13 MPa**, reseat ≈ **16.55 MPa**.  
- No direct operator open/close command.  

---

## 7.0 CVCS panel (Chemical & Volume Control)

**Location:** Embedded on CVCS equipment box  
**Highlight id:** `cvcs`

### 7.1 Charging Pump — On / Off

- Required for boration/dilution and charging flow.  
- Impeller / flow indication follows `charging_flow` instrument.  

### 7.2 Charging flow setpoint

- Injects inventory into cold leg.  
- Raises PZR level / inventory; carries boron concentration change when adjusting.  

### 7.3 Letdown Orifices (A / B)

- Two fixed orifices, each independently **in** or **out** — four lineups: **off / A / B / A+B**.  
- Removes coolant from the RCS (bleeds the cold leg to the letdown HX / VCT); lowers inventory / PZR level.  
- Flow is **pressure-driven** (∝ √ΔP across the orifice, referenced to the 2.4 MPa letdown backpressure),
  so it **tails off as RCS pressure falls** on a cooldown — it is not a throttled setpoint.  
- Nominal at NOP: **A ≈ 3 %**, **B ≈ 4 %**, **A+B ≈ 7 %** of rated (A+B is max letdown — a net drain,
  exceeding normal charging, for level reduction / depressurization).  
- **Isolate** = both orifices out (letdown zero).  

### 7.4 CVCS Inventory Control AUTO / MANUAL

| Mode | Behavior |
|------|----------|
| **AUTO** | Make-up modulates charging toward inventory hold |
| **MANUAL** | Operator sets charging flow and the letdown orifice lineup |

### 7.5 Borate / Dilute / Hold

| Control | Effect |
|---------|--------|
| **Borate** | Raises boron ppm → removes reactivity (power down / more shutdown margin) |
| **Dilute** | Lowers boron ppm → adds reactivity (power up) |
| **Hold** | Stop chemistry change |
| **Requires** | Charging pump running |
| **Rate** | Compressed for training (~ppm/s scale); real plants are slower |
| **Indication** | Boron analyzer (slow lag ~45 s) — may disagree briefly with true boron |

**Procedure — dilute for power rise (slow)**

1. Charging pump **On**.  
2. Select **Dilute**.  
3. Watch boron analyzer and power / Tavg.  
4. **Hold** when near target; trim with rods.  

**Procedure — borate for power reduction / xenon prep**

1. Charging pump **On**.  
2. Select **Borate**.  
3. Coordinate with rod insertion and load reduction.  
4. **Hold** at target.  

---

## 8.0 Primary Flow / RCP card

**Location:** Bottom margin near cold leg  
**Highlight id:** `rcp` / `primary-inventory`

### 8.1 RCP status and Start / Stop

| Item | Detail |
|------|--------|
| **Running** | Forced flow; spray works; coastdown on trip |
| **Trip** | Flow falls; low-flow protection SCRAMs; natural circulation for decay heat |
| **Run / Stop** | **Run** starts the pumps (`set_rcp{running:true}`) and clears any RCP-trip failure; **Stop** secures them (`set_rcp{running:false}`). Starting the RCPs is the first step of the Mode 5→3 heatup and the Mode 5→1 startup. |
| **Modeling note** | Single representative pump. (Blocked while the station is blacked out — no AC.) |

**CAUTION:** At power, loss of flow is an immediate trip condition. Do not stop RCPs at power except as directed by emergency procedure / drill script.

### 8.2 Inventory / void (Physics Overlay)

- `core_inventory_pct`, `primary_void_fraction` — Learning + overlay.  
- Infer inventory from PZR level + CVCS + subcooling when overlay off.  

---

## 9.0 Steam Generator and feed controls

### 9.1 SG Level card

**Highlight id:** `sg-level`

| Indication | Normal |
|------------|--------|
| SG level | ≈ **65 %** |
| Steam pressure | ≈ **5.65 MPa** at power |

**Shrink and swell:** On rapid load/power change, indicated level can move the **wrong way** briefly. Do not chase with large feed swings.

**Imbalance annunciator:** `▲ filling` / `▼ draining` when turbine load and reactor power are mismatched (> ~40 MWe class).

**Level ladder (protection):**

| Level | Event |
|-------|-------|
| **≥ 90 %** | **P-14:** turbine trip + main-feed isolation + reactor trip (if ≥50 % power) |
| ≥ 88 % | SG LVL HI HI alarm |
| ≥ 75 % | SG LVL HI alarm |
| **65 %** | nominal |
| ≤ 30 % | SG LVL LO alarm |
| ≤ 20 % | AFW auto-start |
| **≤ 17 %** | SG LVL LO LO → reactor SCRAM |

On a gauge, **red** at the two trip bands (≥90 %, ≤17 %), **amber** at the alarm/AFW bands, **green** through the normal ~30–75 % operating range. See §09 for the authoritative setpoint table.

### 9.2 Steam & Flow card

**Highlight id:** `sg-steam`

#### Feed Pump — Set % / Nudge

| Item | Detail |
|------|--------|
| **Purpose** | Command main feed pump speed (0–120 %) |
| **Manual effect** | Takes three-element controller to **MANUAL** |
| **Coupled mode** | When load-coupled, feed may track load — card may show “tracks load” |
| **Nudge** | Fine ±% adjustments |

**Procedure — raise SG level manually**

1. Note controller status (AUTO three-element vs MANUAL).  
2. Raise **Feed Pump** % (or ▲ nudge).  
3. Wait for level lag; avoid overshoot.  
4. Re-engage **Automate → Feed pump → SG level → AUTO**.  

#### MSIV — Open / Close

| Item | Detail |
|------|--------|
| **Open** | Steam path SG → turbine / dump available |
| **Close** | Isolates main steam; turbine trips; SG bottles toward safeties; feed loss path can drain SG toward low-level trip |
| **Close arming** | Two-press CONFIRM? |

**WARNING:** Closing MSIV at power is a major transient. Expect turbine trip and rising SG pressure.

---

## 10.0 Auxiliary Feedwater (AFW) — Emergency Cooling card

**Tab:** AFW  
**Highlight id:** `emergency-cooling`

| Control | Effect |
|---------|--------|
| **Start / Stop** | Enable AFW delivery to SG |
| **Throttle %** | 0–100 % of capacity |
| **AUTO arm** | Auto-starts on low SG level (~**20 %** instrument) when armed |
| **Manual action** | Puts AFW in MANUAL until AUTO re-armed |
| **Delivery** | Capacity × throttle × level-hold taper near target |

**Procedure — establish AFW (loss of main feed)**

1. Confirm main feed lost / SG level falling.  
2. SCRAM if not already tripped.  
3. **AFW Start** (or verify auto-start).  
4. Throttle to hold SG level without overcooling.  
5. Re-arm AUTO when stable if desired.  

**Failure note:** `afw_failure` can show pumps “running” with **zero delivery** (shut valves) — verify level response, not just run lights.

---

## 11.0 Emergency injection (HPI/LPI)

**Tab:** HPI/LPI  

| Control | Effect |
|---------|--------|
| **On / Off** | Start/stop merged high/low pressure injection |
| **AUTO arm** | Actuates on low primary pressure (~**11.03 MPa**) when armed |
| **Pump curve** | High-head trickle at operating pressure; high volume below ~**4.5 MPa** shutoff region |
| **Indication** | `hpi_flow`, HPI ACTIVE alarm/status |

**Procedure — HPI on small-break LOCA / stuck PORV**

1. Confirm subcooling eroding / pressure falling.  
2. Ensure HPI **On** (or AUTO actuation).  
3. **Do not throttle** solely on rising PZR level.  
4. Isolate PORV path if stuck open.  
5. Restore inventory and subcooling.  

### 11.1 Accumulators (passive)

- Embedded panel — status + flow when discharging.  
- **Passive discharge:** the check valve opens automatically when primary (cold-leg) pressure falls
  below the arming setpoint; finite borated capacity depletes as they inject (volume % → 0).  
- **Discharge isolation valve** (motor-operated, in series with the check valve): **Open / Isolate**.
  Default **aligned (open)**. Isolate before depressurizing below the check-valve setpoint on a normal
  cooldown so the accumulators do **not** spuriously dump into the depressurized RCS; also used to isolate
  a leaking/mispositioned tank. A shut valve **blocks discharge at any pressure**.  
- **Cold-water quench:** accumulator/ECCS water injects **cold** (RWST/SIT ~40 °C), so a large-break dump
  **cools T-avg** as well as restoring inventory and boron.  

### 11.2 RHR / DHR

| Control | Effect |
|---------|--------|
| **On / Off** | Residual / decay heat removal path |
| **AUTO** | May arm when scrammed and pressure low enough (~**3.45 MPa** class) |
| **Scope** | Post-shutdown cooldown assist; full cold ops **[narr]** |

---

## 12.0 Turbine-Generator card

**Highlight id:** `turbine-generator`

### 12.1 Load mode

| Mode | Operator action | Behavior |
|------|-----------------|----------|
| **Follow** | Select Follow / connect grid path | Load tracks reactor power (lag ~45 s) |
| **Manual** | Select Manual or move load slider | Operator sets MWe target |
| **Disconnected** | Open breaker / trip / SCRAM | 0 MWe |

### 12.2 Turbine Load (MWe)

- Slider / setpoint **0 – rated (~1000 MWe)**.  
- Setting a target forces **Manual** mode.  
- Raising load draws more steam → power follows (with feedback).  

**Procedure — raise electrical load (with rods)**

1. Withdraw rods slightly (or dilute) so reactor can support higher power.  
2. Raise **Turbine Load** to new MWe.  
3. Or use **Follow** and let load track after rod raise.  
4. Verify SG level stable; re-engage feed AUTO if needed.  

**Procedure — lower electrical load**

1. Reduce **Turbine Load** first.  
2. Insert rods (or borate) to match.  
3. Watch SG swell / level high.  

### 12.3 Steam Dump / Bypass

| Mode | Use |
|------|-----|
| **AUTO** | Opens on high SG pressure / load rejection as configured |
| **Manual % / Open** | Dump steam to condenser, bypass turbine |
| **Dump SP** | No-load steam-dump **pressure setpoint** (MPa, live readout + numeric box; 0.2–9.3 MPa, engine clamps to the SG-safety band) the AUTO dump holds. **Lower** it on a cooldown to vent the SG and cool the primary through the steam generators; **raise** it back toward the no-load point on a heatup. |

### 12.4 Indications

| Indication | Meaning |
|------------|---------|
| Turbine RPM | ~1800 class when synchronized; overspeed trips turbine |
| MWe output | Gross electrical output |
| Governor valve % | Steam admission position |
| TURB TRIP / steam demand low | Turbine not accepting load |

---

## 13.0 Condenser card

**Highlight id:** `condenser`

| Indication | Meaning |
|------------|---------|
| Condenser vacuum | Required for turbine operation |
| Cooling available | Circulating water / cooling path status |

**Low vacuum** → alarms → turbine trip at trip setpoint (~**74.5 kPa** instrument path).

---

## 14.0 Automate tab (channel procedures)

### 14.1 Engage a channel

1. Open **Tools → Automate**.  
2. Locate channel (e.g. Feed pump → SG level).  
3. Set/verify setpoint (captured on engage).  
4. Select **AUTO**.  
5. Confirm `note` status (holding / blocked / scrammed).  

### 14.2 Return to manual

1. Operate the underlying control (rods, feed %, etc.), **or** select **MAN**.  
2. Channel disengages; operator owns the parameter.  

### 14.3 Rod AUTO (Tavg)

- Captures **T-ref** from indicated Tavg at engage.  
- Holds Tavg with variable rod speed and deadband (~±0.8 °C).  
- Manual rod motion → MAN.  
- Drops out on scram.  

**CAUTION:** If you engage rod AUTO after a large Tavg error, rods will drive hard. Capture near the temperature you want, or edit setpoint carefully.

---

## 15.0 Failures tab (operator drill control)

Not a plant control — **trainer control**.

1. Open **Failures**.  
2. Select failure (e.g. PORV Stuck Open).  
3. Set severity if offered.  
4. **Inject**.  
5. Execute the matching **PWR-E##** procedure.  
6. **Clear** or Reset when drill complete.  

---

## 16.0 Indication catalog (operator-facing)

| Instrument | Unit | Typical lag | Primary use |
|------------|------|-------------|-------------|
| power_range | % | 0.1 s | Power control, high flux |
| source_range | cps | 0.5 s | Startup counts |
| intermediate_range | A | 0.5 s | SR handoff to ~10 % |
| startup_rate | DPM | 2 s | Approach rate / interlock |
| tavg / thot / tcold | °C | 4 s | Thermal state |
| primary_pressure | MPa | 0.5 s | Subcooling / trips |
| pzr_level | % | 2 s | Inventory (can mislead) |
| subcooling_margin | °C | derived | LOCA diagnosis |
| sg_level | % | 3 s | Heat sink |
| steam_flow / fw_flow | ×rated | 1 s | Mass match |
| steam_pressure | MPa | 0.5 s | SG / dump |
| mwe_output | MWe | 0.2 s | Grid |
| turbine_rpm | RPM | 0.5 s | Sync / overspeed |
| condenser_vacuum | kPa | 5 s | Turbine health |
| boron_analyzer | ppm | 45 s | Chemistry |
| charging/letdown flow | norm | 2 s | CVCS |
| hpi_flow | norm | 1 s | ECCS |
| porv_indicator | open/closed | boolean | **May lie** |
| porv_tailpipe_temp | °C | 10 s | Stuck PORV clue |

---

## 17.0 Campaign-aligned skills (manuals supplement)

These topics appear as dedicated **campaign** missions; manuals cover them here so Free Play users have the same procedure-grade notes. Plant MODE: almost all are **Mode 1, At Power** unless noted.

### 17.1 1/M and NIS handoff (Mode 3 → Mode 2)

- Source Range counts show subcritical multiplication as rods withdraw (1/M idea: counts rise as you approach criticality).  
- When Intermediate Range ≥ **1e-10 A** (P-6), secure **SR detector** — see **PWR-T13** / **PWR-N02**.  
- Campaign mission `pwr_startup` / `pwr_startup_challenge` grade this path; manuals do not auto-grade.

### 17.2 Rod AUTO — T-ref capture trap (Mode 1)

1. Stabilize Tavg where you want it.  
2. Engage **Automate → Rod control → Tavg (AUTO)** — setpoint **captures current indicated Tavg**.  
3. If you engage with a large Tavg error vs desired plant, rods will drive hard.  
4. Any manual rod motion → **MAN**.  
5. Channel drops out on SCRAM.  

See **PWR-T10** / **T11**. Campaign: `pwr_rod_auto`.

### 17.3 Feed specialist — three-element vs MANUAL (Mode 1)

| Driver | Who minds SG level |
|--------|--------------------|
| Three-element **AUTO** | Controller (normal) |
| Load coupling | Feed tracks load when coupled |
| **MANUAL** feed % | **You** — any Set % / nudge |

Leaving feed MANUAL while reducing power floods the SG (campaign bonus `pwr_sg_flood`). Re-engage AUTO when done — **PWR-N12**.

### 17.4 ESF AUTO / MAN arms (Mode 1)

- **AUTO:** AFW / HPI can start themselves on setpoints.  
- **Any manual** Start/Stop/throttle → that system **MANUAL** until you press **AUTO** re-arm.  
- Re-arm with a standing start condition may **fire immediately**.  

**PWR-T12**. Campaign: `pwr_esf`.

### 17.5 MSIV — “bottle the boiler” (Mode 1)

1. **MSIV Close** (CONFIRM?) isolates main steam.  
2. Turbine load rejects; SG pressure rises toward **SG safeties** (~9.31 MPa open).  
3. With feed lost or reduced, SG level can fall toward LO-LO trip on a short clock.  
4. Establish **AFW** / trip reactor as required.  

Campaign: `pwr_msiv`. Alarms: **PWR-A23**, A24.

### 17.6 Checkpoints and exams

Campaign grades solo criticality (`pwr_startup_challenge`), shift dispatch (`pwr_shift_exam`), and senior stuck-PORV exam (`pwr_qualify`). Manuals provide the underlying procedures (N02, N07/N08, E07/X01) but **not** the grading scripts.

---

## 18.0 Related documents

- `04_NORMAL_OPERATIONS.md`  
- `05_MODE_TRANSITIONS.md`  
- `09_SETPOINTS_LIMITS.md`  
- `11_CAMPAIGN_CROSSWALK.md`  
- `CAMPAIGN_MODE_ALIGNMENT_SPEC.md`  
