# 03 — Controls and Indications

**Document:** PWR-CI-01  
**Title:** Control Station Inventory and Operating Instructions  
**Revision:** 17  

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
| **Indication** | Vertical bar + step count (0 = fully inserted, max 912 steps fully withdrawn — a fine-step drive: one step ≈ 9 pcm ≈ 1.5 ¢ near the startup critical band) |
| **Operating position** | ≈ 92 % withdrawn at hot full power |

**Procedure — move rods**

1. Select **Rod Speed**: Slow | Normal | Fast.  
2. Click **Raise** or **Lower** for a single step, or hold either to drive continuously.  
3. Watch **Startup Rate (SUR)** and power.  
4. Release to stop (a hold stops as soon as you let go; a click is already a discrete step).  

**CAUTION:** Target SUR ≤ **1 DPM** and reactor period ≥ **30 s** on approach to criticality. With the fine-step drive (one step ≈ 1.5 ¢ near the crossing), single-step nudges at **Slow** keep the crossing well inside 1 DPM — big held withdrawals are what push the rate up.

**Interlock:** Rod **withdrawal** is blocked when SUR ≥ **1.5 DPM** until SUR < **0.8 DPM**. Insertion always remains available.

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

#### 3.5.1 RPS reset — clearing the trip latch

Once tripped, the control reads **SCRAMMED** and becomes the **RPS reset**. Resetting
re-closes the reactor trip breakers; it does **not** withdraw rods and it does **not**
restart the reactor. The rods stay where they are until you deliberately withdraw them,
under the startup net.

The reset is **permissive-gated** — it will not take until both conditions hold:

| Permissive | Why | Caption when it is holding |
|---|---|---|
| **No trip signal standing** | A breaker will not hold in against a live trip signal. Whatever tripped the plant has to have cleared first. | *TRIP SIGNAL STANDING* |
| **Rods at bottom** | The physical interlock: the breakers reset with the rods in. | *RODS NOT AT BOTTOM* |

The caption under **SCRAMMED** tells you which one is holding, so you do not have to press
the control to find out. When both are satisfied it reads **PRESS TO RESET**.

Pressing while blocked is refused and the reason is annunciated — it costs nothing, and it
names the condition. A trip you have not actually fixed keeps the plant latched: after a
loss of feedwater, for example, the reset stays blocked on low steam generator level until
the heat sink is restored. **Recovery is procedural, not a button.**

**Procedure — RPS reset**

1. Diagnose and clear the condition that tripped the plant.  
2. Verify rods at bottom.  
3. Verify the caption reads **PRESS TO RESET**.  
4. Press to reset; verify the **REACTOR TRIP** alarm clears.  
5. Withdraw rods only under the startup net (**04 §PWR-N03**), and only if restart is
   intended — see the xenon caution in **04 §7.0**.

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
| Green | > **19.8 °F** (11 °C) | Healthy (above LO SUBCOOL) |
| Yellow | 0 – 19.8 °F (0 – 11 °C) | Approaching saturation |
| Red | < **0 °F** (0 °C) | Boiling / voiding risk |

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
- Normal: **2235 psi (15.41 MPa)**.  

### 5.1a Pressure setpoint (Press SP)

- The pressure-control **setpoint** (MPa) the AUTO heaters/spray drive toward, shown as a live
  readout with a numeric **Press SP** box (15 – 2466 psi (0.1 – 17 MPa); engine clamps to the relief band).  
- **Raise** it toward NOP (**2235 psi (15.41 MPa)**) during a heatup — the heaters pressurize to the new target;
  **lower** it during a cooldown so spray/relief brings pressure down. Used by the Mode-transition
  missions. (The box itself is MPa-denominated regardless of the US/SI display toggle, like the load setpoint.)

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
| **Auto** | Opens ~**2350 psi (16.20 MPa)**, reseats ~**2300 psi (15.86 MPa)** (control layer on pressure instrument) |
| **Indicator** | Shows **commanded** position — can disagree with actual (TMI) |
| **Tailpipe temp** | Hot discharge (~302 °F (150 °C) class) can reveal steam passing while light says closed |

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
- Open ≈ **2485 psi (17.13 MPa)**, reseat ≈ **2400 psi (16.55 MPa)**.  
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
- Flow is **pressure-driven** (∝ √ΔP across the orifice, referenced to the 348 psi (2.4 MPa) letdown backpressure),
  so it **tails off as RCS pressure falls** on a cooldown — it is not a throttled setpoint.  
- Nominal at NOP: **A ≈ 3 %**, **B ≈ 4 %**, **A+B ≈ 7 %** of rated (A+B is max letdown — a net drain,
  exceeding normal charging, for level reduction / depressurization).  
- **Rate feel:** uncompensated (charging secured), orifice A walks PZR level down **≈ 2 %/min**;
  A+B ≈ 5 %/min; max charging with letdown isolated raises level ≈ 13 %/min. Minutes to act, not seconds —
  and the **17 % low-level letdown isolation** (see 09 §3.0) backstops an unattended drain.  
- **Isolate** = both orifices out (letdown zero).  

### 7.4 CVCS Inventory Control AUTO / MANUAL

| Mode | Behavior |
|------|----------|
| **AUTO** | Make-up modulates charging toward inventory hold |
| **MANUAL** | Operator sets charging flow and the letdown orifice lineup |

### 7.5 Borate / Dilute / Hold

| Control | Effect |
|---------|--------|
| **Borate** | *Raise* the boron target → removes reactivity (power down / more shutdown margin) |
| **Dilute** | *Lower* the boron target → adds reactivity (power up) |
| **Hold** | Leave the target where it is — a running dose finishes and stops itself |
| **How** | **BORON CONTROL ON/OFF + target ppm** — you set a target and the batch dose delivers it: *borate* = raise the target, *dilute* = lower it |
| **Requires** | Charging pump running |
| **Rate** | Compressed for training (~ppm/s scale); real plants are slower |
| **Indication** | Chemistry samples (CHEM) — there is **no live boron meter** on the panels |

**How you know the concentration — chemistry, not a gauge.** There is no online boron
readout in this control room, because that is how the industry actually works: boron
concentration is known from **grab samples analyzed by the chemistry lab**, plus the
operator's own dose bookkeeping. (Online "boronometers" exist at some plants but are
not relied upon.) Between samples you infer boron the way real crews do: from the dose
you ordered, and from the plant's response — rod position, Tavg drift.

**BORON CONTROL (target ppm) — batch dose.** The board's BORON CONTROL ON/OFF + target
works like a real makeup panel: entering a new target computes the change and **meters it
as a batch** at ~0.05 ppm/s, stopped by the flow totalizer — a dose lands on the ppm
asked without overshoot. Any target change executes, however small (1 ppm nudges work).
The dose pauses if the charging pump stops and resumes with it. Boron driven directly
(a procedure walkthrough issuing a borate/dilute rate) takes the channel to **MAN**.

**CHEM SAMPLE — the authoritative number.** Chemistry confirms every completed dose
automatically: an RCS grab sample is drawn and the lab posts the result (`sample N ppm`)
after a compressed ~60 s turnaround — real labs take 30–60 min. Take a **manual sample**
(CHEM SAMPLE button) when the dose books may be stale: after ECCS/accumulator injection
(which borates the core outside the makeup system) or after boron was driven directly in
a procedure. A fresh result while no dose is running **re-baselines the panel** — the books and the
displayed target snap to the lab number, so the next dose is computed from reality.

> **At full power, dilution moves Tavg, not power.** With the turbine at rated load the
> reactor self-regulates back to ~100 % — the boron change appears as a Tavg change
> (~0.9 °F / 0.5 °C per ppm). Use dilution to manage rod position / Tavg; move POWER with the
> turbine load. Below rated load, dilution does raise power.

**Procedure — dilute for power rise (slow)**

1. Charging pump **On**; BORON CONTROL **On**.  
2. Set a **lower** boron target (dilute) — the batch dose meters the change and stops at it.  
3. Watch power / Tavg respond; track the dose you have ordered.  
4. At the planned change, confirm with a **CHEM SAMPLE**; trim with rods.  

**Procedure — borate for power reduction / xenon prep**

1. Charging pump **On**; BORON CONTROL **On**.  
2. Set a **higher** boron target (borate).  
3. Coordinate with rod insertion and load reduction as the dose delivers.  
4. Confirm the new concentration with a **CHEM SAMPLE**.  

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
| Steam pressure | ≈ **819 psi (5.65 MPa)** at power |

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

#### STEAM FLOW / SG FEED RATE — the matched pair

Two indications, deliberately on the **same gpm scale** and stacked in the same column so
they can be compared at a glance. Together with SG level they are the *three elements* the
feedwater controller regulates on — and the same three you use when you take it manual.

| Indication | Reads | Why it is there |
|------------|-------|-----------------|
| **STEAM FLOW** | Total **main steam line** flow — turbine **plus** steam dump **plus** any lifted safety | What the generator is losing |
| **SG FEED RATE** | Measured feedwater flow (not pump demand) | What you are putting back |
| **SG LEVEL** | Narrow-range level | The **integral** of the difference — a *late* cue |

**STEAM FLOW is main-steam-line flow, not turbine flow.** With the turbine tripped and the
dump carrying the plant, the governor is shut but the generator is still boiling hard — this
indication stays up, and feed must follow *it*. Watch the pair through a turbine trip: the
governor goes to 0 % and the dump to ~98 %, and STEAM FLOW barely moves.

**Reading the pair**

- **Feed = steam** → level is steady, wherever it happens to be.
- **Feed < steam** → level is falling. It will keep falling until you fix the *flow*.
- **Feed > steam** → level is rising, likewise.

Level tells you what already happened; the flow mismatch tells you what is about to.

#### Feed Pump — Set gpm / ▲▼

| Item | Detail |
|------|--------|
| **Purpose** | Command main feed pump speed, shown as **0–1200 gpm** (= 0–120 % pump speed) |
| **Manual effect** | Takes the three-element controller to **MANUAL** |
| **▲▼ step** | ±20 gpm |
| **Character** | A **fixed-demand** device. It holds the speed you set — it has no level feedback of its own |

**WARNING:** in MANUAL the pump does exactly what you asked and nothing else. Set it to match
steam flow and level holds indefinitely; set it wrong and level ramps to a trip in *whichever*
direction the error points — high-high (≥90 %, feed isolation and turbine trip) or low-low
(≤17 %, reactor trip). There is no value that is safe at all powers: matching flow at 100 %
power is ~1000 gpm, at 6 % power it is ~50 gpm.

**Procedure — control SG level manually**

1. Note controller status (three-element **AUTO** vs **MANUAL**).  
2. Read **STEAM FLOW**. Set **SG FEED RATE** to match it — that stops the level *moving*.  
3. Only then trim: a little above steam flow to raise level, a little below to lower it.  
4. Return to the matched value as level approaches where you want it — level lags, so trim
   back **before** you arrive, not after.  
5. Re-engage **AUTO** (SG FEED RATE panel) when done; the channel captures current level as
   its setpoint, so engage it at a level you are happy to hold.  

#### MSIV — Open / Close

| Item | Detail |
|------|--------|
| **Open** | Steam path SG → turbine / dump available |
| **Close** | Isolates main steam; turbine trips; SG bottles toward safeties; feed loss path can drain SG toward low-level trip |
| **Close — as a casualty response** | Terminates a steam line break **downstream** of the valve (PWR-E19): the blowdown stops and the generator re-pressurizes. Does nothing for a break **upstream**, between generator and valve — that one has no isolation on this single-generator plant |
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
| **AUTO arm** | Actuates on low primary pressure (~**1798 psi (12.4 MPa)**) when armed |
| **Pump curve** | High-head trickle at operating pressure; high volume below ~**653 psi (4.5 MPa)** shutoff region |
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
- **Cold-water quench:** accumulator/ECCS water injects **cold** (RWST/SIT ~104 °F (40 °C)), so a large-break dump
  **cools T-avg** as well as restoring inventory and boron.  

### 11.2 RHR

| Control | Effect |
|---------|--------|
| **Suction valve Open / Shut** | The RHR hot-leg suction valve — the system's entry point. **Interlocked on two separate setpoints**: it will not **open** above **400 psi (2.76 MPa)**, and **autocloses** only once pressure rises back above **600 psi (4.14 MPa)** (protects the low-pressure piping). The ~200 psi (1.38 MPa) gap between them is deliberate — see **09 §RHR** |
| **AUTO** | Arms the valve to open itself when scrammed and pressure is below the **400 psi (2.76 MPa)** block-open permissive |
| **Cooldown Rate (HX flow split)** | Throttles how much RHR flow passes through the heat exchanger vs the bypass — this sets the **cooldown RATE without disturbing inventory**. Walk it up slowly to hold the ~**122 °F (50 °C)/h** cooldown limit; full HX flow on a hot plant overshoots the limit |
| **Indication** | `eccs_mode` shows **RHR** while the system is in service; primary temperature trend is the rate instrument |
| **Scope** | The Mode 4→5 decay-heat path: below the interlock pressure RHR carries the plant to Cold Shutdown and holds it there (see `05_MODE_TRANSITIONS.md` PWR-T21) |

---

## 12.0 Turbine-Generator card

**Highlight id:** `turbine-generator`

### 12.1 Load mode

The generator card carries a three-position selector: **FOLLOW / MAN / OFF**.

| Position | Operator action | Behavior |
|------|-----------------|----------|
| **FOLLOW** | Press **FOLLOW** (`connect_grid`) | Synchronises and loads; load tracks reactor power (lag ~45 s) |
| **MAN** | Press **MAN**, or move the load slider | Synchronises and loads; operator sets the MWe target |
| **OFF** | Press **OFF** (`disconnect_grid`) | Breaker open, **0 MWe** — a **planned offline** |

**A planned offline is NOT a turbine trip.** Pressing **OFF** opens the generator breaker:
load goes to zero, but the **stop valves stay open**, no trip latches, and **P-9 is never
armed** — so it does not scram the reactor and it is fully reversible with FOLLOW or MAN.
A real turbine trip arrives by its own routes: low vacuum, the P-14 high-high SG level
actuation, a reactor trip, MSIV closure at load, or the injected `turbine_trip` failure.
Overspeed is configured as a sixth route but **cannot occur here** — this plant has no turbine
roll model, so the rotor never exceeds the rated speed the grid holds it at (**12** §12.14).

**WARNING:** a genuine **turbine trip above 50 % power (P-9) scrams the reactor** — see `09`
§2.0 and **PWR-E03**. What this plant rides out is a *load rejection*, not a turbine trip.

**NOTE — selecting a mode does not un-trip the machine.** FOLLOW and MAN go through
`connect_grid`, which clears a prior trip and re-synchronises; a bare load-mode selection on a
tripped turbine does nothing. If the machine is tripped and the card looks unresponsive, that
is what you are seeing — press **FOLLOW** or **MAN**, not the load slider.

The **OFF** lamp lights on either condition — breaker open *or* turbine tripped — so read
**TURB TRIP** to tell a planned offline from a trip.

### 12.2 Turbine Load (MWe)

- Slider / setpoint **0 – rated (~100 MWe)**.  
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
| **Dump SP** | No-load steam-dump **pressure setpoint** (MPa, live readout + numeric box; 29 – 1349 psi (0.2 – 9.3 MPa), engine clamps to the SG-safety band) the AUTO dump holds. **Lower** it on a cooldown to vent the SG and cool the primary through the steam generators; **raise** it back toward the no-load point on a heatup. |

### 12.4 Indications

| Indication | Meaning |
|------------|---------|
| Turbine RPM | ~1800 when synchronized (the grid holds it there at any load, including zero); falls to zero on a coastdown. The overspeed trip is configured but unreachable — no roll model, **12** §12.14 |
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
| **CW inlet temp** | **Circulating-water inlet temperature — an operator setting**, not just an indication |

**Low vacuum** → alarms → turbine trip at trip setpoint (~**22 inHg (74.5 kPa)** instrument path).

### 13.1 Circulating-water inlet temperature (CW INLET TEMP)

The condenser can only pull the exhaust down to saturation at whatever temperature the
cooling water can hold, so **circ-water temperature sets how much vacuum you get** — and the
penalty grows with load, because more heat is rejected across the tubes at high power.

| Property | Value |
|----------|-------|
| Command | `set_condenser_cw_temp` |
| Range | **40 – 100 °F** (4.4 – 37.8 °C) |
| Reference | **80 °F** (26.7 °C) — the default; at the reference the plant makes exactly rated vacuum |

**What it does:**

- **Warm circ water** → less vacuum → **less MWe at the same steam flow**, and a shorter walk
  to the **22 inHg (74.5 kPa)** turbine trip. This is the summer derate, and it is real here.
- **Cold circ water** → vacuum **above** the rated value, and a couple of percent above
  nameplate output. The winter uprate is real too.
- It also raises the floor an **RHR cooldown** can reach: the RHR heat exchanger rejects to
  the same circulating water, so warm circ water both raises the achievable temperature and
  slows the approach to it (§11.2, and `05` PWR-T21).

**CAUTION:** raising CW temperature at full power walks vacuum down toward the trip. Watch
**COND VAC LO** (25 inHg (84.7 kPa)) — it is the warning before **COND VAC TRIP** (22 inHg (74.5 kPa)).

---

## 14.0 Automation channels (board AUTO procedures)

### 14.1 Engage a channel

1. Find the channel's AUTO control on its board card — **STEAM GEN FEED → AUTO** (three-element SG level), **ROD AUTO** on the rod-control card (Tavg), **BORON → ON** (target ppm), **STEAM DUMP → AUTO**, **CHARGING → AUTO**.  
2. Where the card carries a setpoint box (boron target ppm, dump setpoint), set/verify it; the other channels capture the current reading on engage.  
3. Press **AUTO** — the button stays lit while the channel is engaged.  

### 14.2 Return to manual

1. Operate the underlying control (rods, feed %, etc.), **or** select **MAN**.  
2. Channel disengages; operator owns the parameter.  

### 14.3 Rod AUTO (Tavg)

- Captures **T-ref** from indicated Tavg at engage.  
- Holds Tavg with variable rod speed and deadband (~±1.4 °F / ±0.8 °C).  
- Manual rod motion → MAN.  
- Drops out on scram.  

**CAUTION:** If you engage **ROD AUTO** after a large Tavg error, rods will drive hard. Capture near the temperature you want — if the capture was wrong, take it back to MAN, trim Tavg, and re-engage.

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

Every board instrument, with its indicating range, typical lag, and the annunciators it
drives (see `06_ALARM_RESPONSE.md` for each alarm's response). A reading pegged at a range
end may be **over-range, not truth** — the power range reads to 200 % precisely so a pegged
meter can still cross the 120 % trip.

| Instrument | Unit | Range | Typical lag | Primary use | Drives alarms |
|------------|------|-------|-------------|-------------|---------------|
| power_range | % | 0 – 200 | 0.1 s | Power control, high flux | HI FLUX |
| source_range | cps | 1 – 1e6 | 0.5 s | Startup counts | SR HI FLUX |
| intermediate_range | A | 1e-11 – 2e-3 | 0.5 s | SR handoff to ~10 % | — |
| startup_rate | DPM | −5 – 10 | 2 s | Approach rate / interlock | SUR HI |
| tavg | °F (°C) | 86 – 649.4 (30 – 343) | 4 s | Thermal state / rod program | HI TAVG |
| thot / tcold | °F (°C) | 86 – 649.4 (30 – 343) | 4 s | ΔT, natural-circ check | — |
| primary_pressure | psi (MPa) | 0 – 3002 (0 – 20.7) | 0.5 s | Subcooling / trips | PZR PRESS HI / LO / LO LO |
| pzr_level | % | 0 – 100 | 2 s | Inventory (can mislead) | PZR LVL HI / LO / LO LO |
| subcooling_margin | °F (°C) | −50.4 – 149.4 (−28 – 83) | derived | LOCA diagnosis | LO SUBCOOL, SUBCOOL LOST |
| sg_level | % | 0 – 100 | 3 s | Heat sink (narrow range) | SG LVL HI HI / HI / LO / LO LO |
| sg_level_wide | % | 0 – 100 | 4 s | Heat sink below the narrow taps (dryout diagnosis) | — |
| steam_flow / fw_flow | ×rated | 0 – 1.2 | 1 s | Mass match — **`steam_flow` is TURBINE flow only** | — |
| sg_steam_flow | ×rated | 0 – 1.2 | 1 s | **Total** steam leaving the SG (turbine + dump + safeties) — the main-steam-line transmitter, and what feed regulation must match | — |
| cw_inlet_temp | °F (°C) | 32 – 113 (0 – 45) | 20 s | Circulating-water inlet — sets achievable vacuum and the RHR cooldown floor (§13.1) | — |
| condensate_flow | ×rated | 0 – 1.2 | 1 s | Hotwell → feed train | — |
| steam_pressure | psi (MPa) | 0 – 1523 (0 – 10.5) | 0.5 s | SG / dump | SG PRESS HI |

> **Trap — `steam_flow` vs `sg_steam_flow`.** With the turbine off line or tripped, the steam
> dump carries the plant and **`steam_flow` reads ~0 while the generator is still boiling**.
> Feed regulation follows `sg_steam_flow`; load-following consumers (the Tavg program, the rod
> channel) follow `steam_flow`. Reading the wrong one during a ride-out is how an SG drains
> with the flow gauge apparently at zero.

| steam_dump_valve | % | 0 – 100 | 0.3 s | Dump/bypass position | — |
| governor_valve | % | 0 – 100 | 0.3 s | Turbine admission | — |
| mwe_output | MWe | 0 – 130 | 0.2 s | Grid | — |
| turbine_rpm | RPM | 0 – 2000 | 0.5 s | Sync (overspeed unreachable — **12** §12.14) | — |
| condenser_vacuum | inHg (kPa) | 0 – 30.1 (0 – 102) | 5 s | Turbine health | COND VAC LO / TRIP |
| boron_sample (CHEM) | ppm | 0 – 2500 | ~60 s lab | Chemistry grab sample — the boron reference | — |
| charging_flow / letdown_flow | norm | 0 – 0.12 | 2 s | CVCS lineup | — |
| hpi_flow | norm | 0 – 1.2 | 1 s | ECCS delivery | (HPI ACTIVE status) |
| hpi_discharge_pressure | psi (MPa) | 0 – 2611 (0 – 18) | 0.5 s | Pump vs RCS head | — |
| afw_flow | norm | 0 – 1.2 | 1 s | AFW delivery | — |
| afw_discharge_pressure | psi (MPa) | 0 – 1740 (0 – 12) | 0.5 s | AFW pump health | — |
| accumulator_flow | norm | 0 – 1.2 | 0.5 s | Passive injection | — |
| primary_leak_flow | norm | 0 – 1 | 0.2 s | Identified leakage | — |
| porv_indicator | open/closed | status | — | **May lie** (shows the command) | PORV OPEN |
| porv_tailpipe_temp | °F (°C) | 32 – 482 (0 – 250) | 10 s | Stuck PORV clue | — |

---

## 17.0 Campaign-aligned skills (manuals supplement)

These topics appear as dedicated **campaign** missions; manuals cover them here so Free Play users have the same procedure-grade notes. Plant MODE: almost all are **Mode 1, At Power** unless noted.

### 17.1 1/M and NIS handoff (Mode 3 → Mode 2)

- Source Range counts show subcritical multiplication as rods withdraw (1/M idea: counts rise as you approach criticality).  
- When Intermediate Range ≥ **1e-10 A** (P-6), secure **SR detector** — see **PWR-T13** / **PWR-N03**.  
- Campaign mission `pwr_startup` / `pwr_startup_challenge` grade this path; manuals do not auto-grade.

### 17.2 Rod AUTO — T-ref capture trap (Mode 1)

1. Stabilize Tavg where you want it.  
2. Engage **ROD AUTO** (rod-control card) — the reference **captures current indicated Tavg**.  
3. If you engage with a large Tavg error vs desired plant, rods will drive hard.  
4. Any manual rod motion → **MAN**.  
5. Channel drops out on SCRAM.  

See **PWR-T10** / **T11**. Campaign: `pwr_rod_auto`.

### 17.3 Feed specialist — three-element vs MANUAL (Mode 1)

| Driver | Who minds SG level |
|--------|--------------------|
| Three-element **AUTO** | Controller (normal) |
| Load coupling | Feed tracks load when coupled |
| **MANUAL** feed gpm | **You** — any Set gpm / ▲▼ |

Leaving feed MANUAL while reducing power floods the SG (campaign bonus `pwr_sg_flood`): the
pump holds the speed you set while steam flow falls away beneath it, so the mismatch grows
even though you touched nothing. **STEAM FLOW is the indication that shows this happening** —
level will not admit it for several minutes. Re-engage AUTO when done — **PWR-N12**.

### 17.4 ESF AUTO / MAN arms (Mode 1)

- **AUTO:** AFW / HPI can start themselves on setpoints.  
- **Any manual** Start/Stop/throttle → that system **MANUAL** until you press **AUTO** re-arm.  
- Re-arm with a standing start condition may **fire immediately**.  

**PWR-T12**. Campaign: `pwr_esf`.

### 17.5 MSIV — “bottle the boiler” (Mode 1)

1. **MSIV Close** (CONFIRM?) isolates main steam.  
2. Turbine load rejects; SG pressure rises toward **SG safeties** (~1350 psi (9.31 MPa) open).  
3. With feed lost or reduced, SG level can fall toward LO-LO trip on a short clock.  
4. Establish **AFW** / trip reactor as required.  

Campaign: `pwr_msiv`. Alarms: **PWR-A23**, A24.

### 17.6 Checkpoints and exams

Campaign grades solo criticality (`pwr_startup_challenge`), shift dispatch (`pwr_shift_exam`), and senior stuck-PORV exam (`pwr_qualify`). Manuals provide the underlying procedures (N02, N07/N08, E07/X01) but **not** the grading scripts.

---

## 18.0 Engine command reference

Every on-screen control issues one of these engine commands (the same names appear in the
Instructor's procedure steps, the board's automation channels, and diagnostic logs).
Listed for cross-reference — normal operation never requires typing a command.

| Control (section) | Command | Params |
|-------------------|---------|--------|
| Rods — Raise / Lower hold (§3.1) | `rod_start` / `rod_stop` | `{group_id, direction, speed}` / `{group_id}` |
| Rods — Nudge (§3.1) | `rod_nudge` | `{group_id, steps, speed}` |
| Rods — Stop All (§3.1) | `rod_stop_all` | — |
| SCRAM (§3.5) | `scram` | — |
| Boron Borate / Dilute (§7.5) | `set_boron_adjust` | `{rate}` |
| Boron chemistry sample (§7.5) | `take_boron_sample` | — |
| Charging pump On/Off (§7.1) | `set_charging_pump` | `{running}` |
| Charging flow (§7.2) | `set_charging_flow` | `{normalized}` |
| Letdown orifices A / B (§7.3) | `set_letdown_orifices` | `{a, b}` |
| CVCS inventory AUTO (§7.4) | `set_cvcs_auto` | `{active}` |
| PZR heaters (§5.2) | `set_heater` | `{power_pct}` |
| PZR spray (§5.3) | `set_spray` | `{open}` |
| PORV open / close (§6.1) | `open_porv` / `close_porv` | — |
| PORV block valve (§6.2) | `open_block_valve` / `close_block_valve` | — |
| RCP run / stop (§8.1) | `set_rcp` | `{running}` |
| Feed pump speed (§9.2) | `set_feed_pump_speed` | `{pct}` |
| Feed pump nudge (§9.2) | `feed_pump_nudge` | `{delta_pct}` |
| AFW start / stop (§10) | `set_afw` | `{active}` |
| AFW throttle (§10) | `set_afw_flow` | `{pct}` |
| AFW block / discharge valve (§10) | `set_afw_block` | `{open}` |
| ESF auto re-arm (§17.4) | `set_esf_auto` | `{system, auto}` |
| Accumulator discharge isolation (§11.1) | `open_accumulator_valve` / `close_accumulator_valve` | — |
| Generator **FOLLOW / MAN** (§12.1) | `connect_grid` (+ `set_load_mode`) | — / `{mode}` |
| Generator **OFF** — planned offline (§12.1) | `disconnect_grid` | — |
| Turbine load (§12.2) | `set_steam_demand` | `{mwe}` |
| CW inlet temperature (§13.1) | `set_condenser_cw_temp` | `{c}` |
| Steam dump / bypass (§12.3) | `set_steam_dump` | `{mode | pct}` |
| Pressure setpoint box (§5) | `set_pressure_setpoint` | `{mpa}` |
| Steam-dump setpoint box (§12.3) | `set_steam_dump_setpoint` | `{mpa}` |
| HPI/LPI (§11.0) | `set_hpi` | `{active}` |
| RHR suction valve (§11.2) | `set_rhr` | `{active}` |
| RHR cooldown rate / HX split (§11.2) | `set_rhr_hx` | `{fraction | pct}` |
| SR detector on/off (§4.3) | `set_sr_detector` | `{on}` |
| Startup trip blocks (§4.4) | `set_trip_block` | `{trip_id, blocked}` |
| MSIV open / close (§9.2) | `open_msiv` / `close_msiv` | — |
| Automation AUTO/MAN (§14) | `set_auto_channel` / `set_auto_setpoint` | `{channel_id, engaged}` / `{channel_id, value}` |

---

## 19.0 Related documents

- `04_NORMAL_OPERATIONS.md`  
- `05_MODE_TRANSITIONS.md`  
- `09_SETPOINTS_LIMITS.md`  
- `11_CAMPAIGN_CROSSWALK.md`  
- `CAMPAIGN_MODE_ALIGNMENT_SPEC.md`  
