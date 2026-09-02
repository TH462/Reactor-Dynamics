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
| **ESF actuations LATCH** | Safety injection and aux feed start themselves and **stay started**. A manual stop is not a MANUAL selection — it is **refused**, out loud, until the actuation's reset permissive is satisfied (§17.4). |
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

**Interlock:** There is **no startup-rate rod stop** — SUR HI at 1 DPM is an *annunciator*, not an interlock, and the rate is yours to control. What does block withdrawal on a startup is the **intermediate range high flux rod stop at 20 % current equivalent power**, until you block the **intermediate range high flux trip** at P-10 — one press takes the trip and the stop together (**05 §PWR-T14**). Three other rod stops exist; all four are in **09 §2.0**. **Insertion is never blocked by any of them**, and pressing WITHDRAW into one is refused with the stop named.

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

> **While the trip is latched the rod drive has no power.** The reactor trip breakers sit in
> the supply line from the rod drive motor-generator set to the control rod drive mechanisms,
> so opening them removes power from the mechanisms — which is what lets the rods fall in by
> gravity in the first place. Until you reset the RPS, **WITHDRAW and INSERT are both refused
> on both banks**, and the refusal names the breakers. Pressing STOP still works: it is the
> release of a button, not a demand for motion.
>
> This is why the reset comes **before** any rod motion in every recovery procedure, and it is
> the reason a failure to scram cannot be walked back with the rod buttons — with the breakers
> open there is nothing to drive the mechanisms with. The response to rods that did not insert
> is **emergency boration** (**§7.5**, Borate), not the rod controls.

The reset is **permissive-gated** — it will not take until both conditions hold:

| Permissive | Why | Caption when it is holding |
|---|---|---|
| **No trip signal standing** | A breaker will not hold in against a live trip signal. Whatever tripped the plant has to have cleared first. | *TRIP SIGNAL STANDING* |
| **Rods at bottom** | The physical interlock: the breakers reset with the rods in. | *RODS NOT AT BOTTOM* |

The caption under **SCRAMMED** tells you which one is holding, so you do not have to press
the control to find out. When both are satisfied it reads **PRESS TO RESET**.

**When both are holding, the caption names the trip signal** — a breaker will not hold in
against a live signal whatever the rods are doing, so that is the more fundamental refusal and
it is reported first.

Pressing while blocked is refused and the reason is annunciated — it costs nothing, and it
names the condition. A trip you have not actually fixed keeps the plant latched: after a
loss of feedwater, for example, the reset stays blocked on low steam generator level until
the heat sink is restored. **Recovery is procedural, not a button.**

> **A BLOCKED trip is not a standing one.** The permissive reads each channel the way the
> protection system does, so a trip you have legitimately blocked no longer holds the reset —
> which matters on a cooldown, where blocking the low-pressure reactor trip inside **P-11** is
> a required step (**05 §4.0** step C1a). Without that, a cooldown would depressurize below the
> low-pressure setpoint and then be unable to reset the trip it caused. Blocking a trip you have
> *not* satisfied the permissive for is refused at the block control itself, not here.

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
| IR high-flux trip (25 %) block — also clears the 20 % rod stop | Power above **P-10** (10 %) |
| PR low-setpoint (35 %) block | Power above **P-10** |

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

**Four different things put heater power at 0 %, and only one of them is a mode above.**
The selector stays exactly where you left it in all four, so the panel alone cannot tell
them apart — read the annunciators:

| Zero because | Tell | Can you undo it? |
|---|---|---|
| You selected OFF | OFF lamp lit | Yes — select AUTO or a % |
| **Shed on safety injection or loss of offsite power** | **PZR HTRS SHED** (PWR-A43) | Yes — **any** heater action reloads them |
| Pressurizer level below **17 %** | PZR LVL LO / LO LO, level on the gauge | Not directly — recover level |
| Station blackout | SBO | No — there is no ac to deliver |

The shed is the one that needs a deliberate decision: the heaters are healthy and the bus
is alive, they have just been dropped off it to make room for safety loads, and **securing
injection does not put them back**.

**And there is a fifth case where the reading is NOT zero and the heat is.** The bank sits low
in the vessel — roughly **5 % to 15 % level** — and heat only enters water it is actually
immersed in. As the level falls through that band the delivered heat falls with it: at 10 %
the bank is half covered and delivers half its rating, and below 5 % it delivers nothing at all.

The **HTR PWR indication does not fall with it**, because it reads electrical power and an
uncovered element is still drawing full current. That is not a fault in the gauge — it is the
only honest thing an ammeter can say. On a healthy plant you never meet this: the 17 % cutoff
in the table above de-energizes the bank *before* it uncovers, which is exactly why that
setpoint exists. **You meet it when the level channel is lying to you** — the same failed
transmitter that fools you fools the cutoff, the heaters stay energized into steam, and the
only symptom is that pressure will not come up no matter what you demand. Cross-check level
against charging/letdown flow and subcooling margin before you conclude the heaters have
failed.

### 5.3 PZR Spray

| Mode | Effect |
|------|--------|
| **AUTO** | Spray when pressure above setpoint band |
| **Manual open / %** | Condenses steam — **lowers** pressure |
| **Requires** | Nothing on this simulator — see the note |

**DECLARED DEPARTURE — spray keeps working with the Reactor Coolant Pumps (RCPs) stopped.**
On a real unit the spray line is driven by the pumps' own differential head, so a loss of
offsite power takes normal spray away and the operator depressurizes with the Power Operated
Relief Valve (PORV) instead. A real unit answers that with **auxiliary spray** from the
charging pumps. This departure was declared because the board had no auxiliary spray control,
so the one spray control was left working without the pumps, standing in for it.

**The engine models auxiliary spray, but it has no board control** — one was added 2026-08-30
and removed the next day by owner direction, so on the board this departure is once again the
only pump-less way down in pressure. The capability remains in the model for scenarios and the
instructor. Retiring the departure — making normal spray lose its head with the pumps off,
which is what the real plant does — is filed and will be its own change.

The stand-in's old "conservative direction" note is **withdrawn**: it claimed about **half** the
condensing duty of real auxiliary spray, and this plant measures the opposite. From Hot Standby
at 2235 psi (15.41 MPa) with every RCP secured, 600 s at 100 %:

| lever | pressure after 600 s |
|---|---|
| normal spray | **1212 psi (8.36 MPa)** |
| auxiliary spray | **1353 psi (9.33 MPa)** |
| neither | 2245 psi (15.48 MPa) |

The stand-in is the **stronger** lever here, not the weaker one.

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
| **Auto** | **It follows YOUR setpoint, it is not a fixed number.** The valve lifts at **Press SP + 100 psi (0.69 MPa)** and reseats at **+85 psi (0.586 MPa)** — a 15 psi (0.103 MPa) deadband, at the top of the same error ladder the heaters and spray sit on. At the normal **2235 psi (15.41 MPa)** setpoint that is **2335 psi (16.10 MPa)** open, **2320 psi (15.996 MPa)** shut. **Lower Press SP on a cooldown and the PORV lift point comes down with it** — which is the point, and also the trap: a setpoint dropped faster than the plant depressurizes puts the relief path under the pressure you are still sitting at |
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

- Mechanical spring safeties, inside the engine — **not** a control-layer actuation, and nothing
  on the board arms, blocks or isolates them.  
- Open at **2500 psi (17.24 MPa)** — the 2485 psig nominal setpoint — and reseat **5 % below**,
  at **2375 psi (16.375 MPa)**. Unlike the PORV these do **not** follow Press SP: they are a fixed
  mechanical rating and they are the last line.  
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
- Flow is **pressure-driven** (∝ √ΔP across the orifice, referenced to the **300 psi (2.07 MPa)** letdown backpressure — the pressure-control valve downstream of the orifice, WTSM §4.1),
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
| **Rate** | Not a dial and not compressed — the mass balance sets it. About **0.047 ppm/s borating / 0.026 ppm/s diluting** at full charging (measured at 626 ppm); boration slows toward the 2,500 ppm boric-acid tank, dilution slows as boron falls |
| **Indication** | Chemistry samples (CHEM) — there is **no live boron meter** on the panels |

**How you know the concentration — chemistry, not a gauge.** There is no online boron
readout in this control room, because that is how the industry actually works: boron
concentration is known from **grab samples analyzed by the chemistry lab**, plus the
operator's own dose bookkeeping. (Online "boronometers" exist at some plants but are
not relied upon.) Between samples you infer boron the way real crews do: from the dose
you ordered, and from the plant's response — rod position, Tavg drift.

**BORON CONTROL (target ppm) — batch dose.** The board's BORON CONTROL ON/OFF + target
works like a real makeup panel: entering a new target computes the change and **meters it
as a batch**, stopped by the flow totalizer — a dose lands on the ppm asked without
overshoot. The panel asks for 0.05 ppm/s and the plant delivers what the charging lineup
and the boric-acid tank allow, which is about **0.043 ppm/s** at normal reactor coolant
boron: there is no rate constant to dial, only a mass balance. Any target change executes, however small (1 ppm nudges work).
The dose pauses if the charging pump stops and resumes with it. Boron driven directly
(a procedure walkthrough issuing a borate/dilute rate) takes the channel to **MAN**.

**CHEM SAMPLE — the authoritative number.** Chemistry confirms every completed dose
automatically: an RCS grab sample is drawn and the lab posts the result (`sample N ppm`)
after a **30-minute** lab turnaround — real time, matching a real lab's 30–60 min. (Through
Rev 16 this read “compressed ~60 s”, which was the retired engine's.) Take a **manual sample**
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
| **Running** | Forced flow; coastdown on trip (spray works either way on this simulator — §5.3) |
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
| Steam pressure | ≈ **808 psi (5.57 MPa)** at power |

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
| **≤ 17 %** | SG LVL LO LO → reactor SCRAM **and** AFW auto-start (one signal for both, as in the real plant) |

On a gauge, **red** at the two trip bands (≥90 %, ≤17 %), **amber** at the alarm bands, **green** through the normal ~30–75 % operating range. See §09 for the authoritative setpoint table. AFW also auto-starts on collapsed feed flow at power and on the post-trip handoff — see §12.

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
| **NO FLOW marking** | The commanded gpm turns **amber** — and the SG FEED corner reads **NO FLOW** — when the plant is delivering none of it (dead feed train: blackout, isolation). The demand stays where you left it; the colour says the plant is not doing that number. FEED FLOW below has the truth |

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
5. Re-engage **AUTO** (SG FEED RATE panel) when done; the channel regulates to the
   programmed **65 %** level, walking there gently from wherever level stands at engage.
   To hold a different level on purpose, stay in MANUAL.  

#### RESTORE — main feedwater isolation

| Item | Detail |
|------|--------|
| **Purpose** | Re-open main feedwater after an **automatic isolation**. Lit while main feed is isolated |
| **Location** | SG FEED card, below **AUTO** |
| **Isolates automatically on** | Reactor trip coincident with low Tavg · SG level **high (≥ 90 %)** · safety injection |
| **While isolated** | Main feed is zero. **AFW is the only feed path**, and the SG FEED corner reads `ISOLATED` |
| **Refused when** | The signal that closed the valves is **still present**. The plant says so rather than the button going dead |

The isolation **seals in**: it holds until the actuating signal clears, and pressing RESTORE
before then is refused with a message naming the reason. This is deliberate — an isolation is a
protective action, and being able to switch one off while it is still legitimately demanded would
make it no protection at all.

**After a reactor trip, the usual blocker is the trip itself.** The low-Tavg isolation is a
*coincidence* — low Tavg **and** the trip latch — so resetting the RPS (**§3.5.1**) clears half of
it and the restore is then accepted. That is the ordinary sequence: **confirm the trip → reset the
RPS → restore main feed**, and only if you actually need main feed. In Mode 3, Hot Standby you do
not: AFW carries decay heat indefinitely.

**WARNING:** restore only after you have set feed demand to something decay heat can absorb.
Main feed returns at whatever the pump was last commanded, and the generator is already
recovering on AFW — measured, restoring into a recovering generator with feed demand still up
drives level from 36.6 % to 77 % in about two minutes and isolates you again at the 90 % high
level. Set **SG FEED RATE** to match **STEAM FLOW** first (see the matched pair above); at decay
heat that is a very small number.

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
| **STOP** | Secures the aux feed pumps. **STOP secures BOTH** — the motor-driven and the turbine-driven pump are separate machines with a switch each, and this button works both. There is **no manual START:** the card is STOP and AUTO |
| **AUTO** | A **lamp, not a defeat**. The actuation starts the pumps on **low-low SG level, 17 % of narrow range** — the same signal that trips the reactor — and also on a standing safety injection, loss of main feed, or loss of offsite power. **Nothing you can press disarms it**, so the lamp is lit whenever the pumps are not in your hands, and pressing AUTO cannot make it lit any harder. |
| **Manual action** | Securing the pumps is the one manual action on this card. While an actuation is latched the pumps are held running and a stop is refused — see the securing note below |
| **Delivery** | Capacity × throttle, and **the throttle is not yours.** Level control lives in the **`afw_level` automation channel**, which holds narrow-range level at **33 ± 5 %** — full flow below 28 %, tapering shut by 38 % |

> **Aux feed throttling cuts both ways, and on this board the CHANNEL does it, not you.** Too
> little and the generator boils down toward the low-low level that started the pumps. Too much
> and you overcool the primary: aux feed arrives at about **70 °F (21.1 °C)** against a secondary
> near **550 °F (287.8 °C)**, so an unthrottled pump drags reactor coolant temperature down with
> it. **The symptom the procedures name is that all the steam dump valves shut** — if the dumps
> are closed and temperature is still falling, there is too much aux feed. Left wide open long
> enough the generator fills past the top of the narrow range and starts carrying water into the
> steam lines; the **high-high level turbine trip at 90 % narrow range** exists to get the
> machine off the line before that happens.
>
> **What you watch, since you no longer hold the valve:** the steam dumps and the level trend.
> If the dumps are shut and temperature keeps falling, the channel is overfeeding — secure the
> pumps with **STOP** and let level recover, then re-arm **AUTO**. That is the whole of the
> operator's authority over aux feed on this plant.

**Procedure — establish AFW (loss of main feed)**

1. Confirm main feed lost / SG level falling.  
2. SCRAM if not already tripped.  
3. **Verify the auto-start.** The pumps start themselves on low-low SG level, a standing safety injection, loss of main feed, or loss of offsite power — there is no manual start to press.  
4. Verify the level recovers toward **33 % narrow range** and that the steam dumps are not all shut — the channel throttles, and shut dumps with falling temperature mean it is overfeeding.  
5. When stable, secure the pumps with **STOP** if the procedure calls for it — the AUTO lamp needs no action from you, and the actuation is standing whether or not you touched the pumps.  

**Securing note:** an aux feed stop is refused while a **safety injection** is standing, because
the SI signal is itself an aux feed start — secure the injection at its own panel first. Inside
the actuation reset time delay the stop refuses and says so; after it, one click resets the
function and secures the pumps even with the signal still present.

**Failure note:** `afw_failure` can show pumps “running” with **zero delivery** (shut valves) — verify level response, not just run lights.

---

## 11.0 Emergency injection (HPI/LPI)

**Tab:** HPI/LPI  

| Control | Effect |
|---------|--------|
| **On / Off** | Start/stop merged high/low pressure injection |
| **AUTO** | **A LAMP, NOT A CONTROL — it is disabled on this plant and pressing it does nothing.** The injection actuates on low primary pressure (~**1715 psi (11.824 MPa)**) unconditionally: there is no arm to set, and nothing on the board disarms it. What the button *does* do is **light while a safety injection is latched**, so read it as SI ACTUATED. It is left in place because the contrast is the lesson — a real plant gives the operator an ESF arm here, and this one does not; what it gives you instead is the reset permissive (§17.4). |
| **Pump curve** | **Two pumps with two very different curves, merged into one control.** The high-head set shuts off at **1390 psi (9.58 MPa)** — above that it delivers nothing at all — and rises from a trickle there to full **300 gpm** only once you are below about **515 psi (3.55 MPa)**. The low-head set shuts off much lower, at **215 psi (1.48 MPa)**, and is where the volume is: **1200 gpm** near atmospheric. So injection that reads as barely moving the inventory at 1200 psi (8.27 MPa) is not broken — **it is the pressure**, and depressurizing is what turns the flow on |
| **Indication** | `hpi_flow`, HPI ACTIVE alarm/status |

**Procedure — HPI on small-break LOCA / stuck PORV**

1. Confirm subcooling eroding / pressure falling.  
2. Ensure HPI **On** (or AUTO actuation).  
3. **Do not throttle** solely on rising PZR level.  
4. Isolate PORV path if stuck open.  
5. Restore inventory and subcooling.  

**Securing note — two conditions, and the clock is the one that surprises people.** Once safety
injection has latched, **Off is refused** until *both*: the reset time-delay relay has run
(**60 s** from the actuation), **and** the reactor is tripped — the P-4 permissive. The refusal
message names whichever one you are waiting on and counts the seconds down. After both are
satisfied, one click resets the function and secures the pumps, **signal present or not** — so
securing injection on a live low-pressure signal is something the board will let you do, and
owning that decision is the point of the delay. Aux feed cannot be secured underneath a standing
injection at all (§10), because the SI signal is itself an aux feed start.

### 11.1 Accumulators (passive)

- Embedded panel — status + flow when discharging.  
- **Passive discharge:** the check valve opens automatically when primary (cold-leg) pressure falls
  below the arming setpoint; finite borated capacity depletes as they inject (volume % → 0).  
- **Discharge isolation valve** (motor-operated, in series with the check valve): **Open / Isolate**.
  Default **aligned (open)**. Isolate before depressurizing below the check-valve setpoint on a normal
  cooldown so the accumulators do **not** spuriously dump into the depressurized RCS; also used to isolate
  a leaking/mispositioned tank. A shut valve **blocks discharge at any pressure**.  
- **Cold-water quench:** accumulator/ECCS water injects **cold**, and the two sources are not the same temperature: the **RWST is 70 °F (21.1 °C)** — the usual Technical Specification floor, and what the injection pumps deliver — while the **accumulators sit at 120 °F (48.9 °C)**, the midpoint of their sourced 100–150 °F operating band, so a large-break dump
  **cools T-avg** as well as restoring inventory and boron.  

### 11.2 RHR

| Control | Effect |
|---------|--------|
| **Suction valve Open / Shut** | The RHR hot-leg suction valve — the system's entry point, and **the only way RHR goes in service: nothing opens it for you** (#453). **Interlocked on two separate setpoints**: it will not **open** above **440 psi (3.03 MPa)** — the sourced 425 psig, and **autocloses** only once pressure rises back above **600 psi (4.14 MPa)** (protects the low-pressure piping). The ~200 psi (1.38 MPa) gap between them is deliberate — see **09 §RHR**. **Throttle the HX split first** — see the rate row below and **04 PWR-N15** step 5 |
| **…and OPEN is refused while safety injection is running** *(added 2026-08-12, #458)* | A third refusal, and it is **not** one of the two interlocks above. The RHR pumps **are** the low-head injection pumps: with SI actuated they are lined up to the refueling water tank and their heat exchangers have no cooling water, so the trainer will not also put them on hot-leg suction. The refusal is labelled on the board — *"RHR ALIGN BLOCKED: RHR pumps in ECCS injection lineup (SI actuated)"*. **Shut is never refused**; taking a system out of service always works. Secure injection to clear it, and read **12** §12.20 before treating this as something a real plant does |
| **Cooldown Rate (HX flow split)** | Throttles how much RHR flow passes through the heat exchanger vs the bypass — this sets the **cooldown RATE without disturbing inventory**. Walk it up slowly to hold the ~**122 °F (50 °C)/h** cooldown limit; full HX flow on a hot plant overshoots the limit |
| **Indication** | `eccs_mode` shows **RHR** while the system is in service; primary temperature trend is the rate instrument |
| **Scope** | The Mode 4→5 decay-heat path: below the interlock pressure RHR carries the plant to Cold Shutdown and holds it there (see `05_MODE_TRANSITIONS.md` PWR-T21) |

---

## 12.0 Turbine-Generator card

**Highlight id:** `turbine-generator`

### 12.1 Latch, trip and offline

The generator card carries three buttons: **LATCH / TRIP / OFF**.

| Button | Operator action | Behavior |
|------|-----------------|----------|
| **LATCH** | Press **LATCH** (`latch_turbine`) | Latches the machine back up after a trip and puts it on the line. **Refuses, and says why, while anything is still holding the trip** |
| **TRIP** | Press **TRIP** (`trip_turbine`) | Trips the turbine by hand — stop valves shut, load to zero |
| **OFF** | Press **OFF** (`disconnect_grid`) | Breaker open, **0 MWe** — a **planned offline**, no trip |

> **This card used to be a FOLLOW / MAN dispatch-mode selector, and it was replaced.** This
> plant has one dispatch mode — you set a load target and the turbine holds it — so a mode
> selector had nothing to select, and worse: **nothing in the whole command set could un-latch
> the turbine**, so after any trip the generator was dead for the rest of the session and the
> two buttons that looked like the way back could only refuse. *Latched* and *tripped* are the
> real states of a turbine, and these are the two operator actions that move it between them.

**What LATCH refuses on.** It will not latch a machine into a plant that is still tripping it,
and the refusal names which of these is standing:

| Holding the trip | Clear it by |
|---|---|
| The **reactor trip** is latched | Reset the protection system |
| The **main steam isolation valve** is shut | Open it — the turbine has no steam supply |
| **Both main feed pumps** are lost | Restore feed |
| The **condenser** is unavailable | Restore circulating water / vacuum |
| **High-high SG level** isolation is latched | Let level recover, then reset |
| The trip is an **injected casualty** | The instructor clears it |

**The order after a scram is: reset the protection, LATCH, then set a load target.** Latching
does not by itself make power — the reactor has to be making steam, and after a scram it is
subcritical.

**A planned offline is NOT a turbine trip.** Pressing **OFF** opens the generator breaker:
load goes to zero, but the **stop valves stay open**, no trip latches, and **P-9 is never
armed** — so it does not scram the reactor and it is fully reversible by setting a load target.
A real turbine trip arrives by its own routes: low vacuum, the P-14 high-high SG level
actuation, a reactor trip, MSIV closure at load, or the injected `turbine_trip` failure.
Overspeed is configured as a sixth route but **cannot occur here** — this plant has no turbine
roll model, so the rotor never exceeds the rated speed the grid holds it at (**12** §12.14).

**WARNING:** a genuine **turbine trip above 50 % power (P-9) scrams the reactor** — see `09`
§2.0 and **PWR-E03**. What this plant rides out is a *load rejection*, not a turbine trip.

**NOTE — the load slider does not un-trip the machine.** Typing a load target at a tripped
turbine is accepted and reads back at the target you asked for while the governor sits at
0.0 % and the machine makes nothing. If the card looks unresponsive, that is what you are
seeing — press **LATCH**, not the load slider.

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
| **Dump SP** | No-load steam-dump **pressure setpoint** (MPa, live readout + numeric box; **29 – 1099 psi (0.2 – 7.58 MPa)** — the box refuses anything above the SG safeties' first lift, because the engine itself does **not** clamp it) the AUTO dump holds. **Lower** it on a cooldown to vent the SG and cool the primary through the steam generators; **raise** it back toward the no-load point on a heatup. |

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
| Command | `set_condenser_cw_temp` — **live** (#592). The box next to COND VAC sets the inlet temperature; the condenser computes the vacuum from it |
| Range | **35 – 85 °F (1.7 – 29.4 °C)**. The **85 °F** ceiling is the real plant's own: Technical Specifications require the intake bay at or below 85 °F for the service-water system to be OPERABLE, and the accident analyses bound the supply there. The **35 °F** floor is an owner judgment about intake-transit warming — the analyses' own floor is a sub-freezing 30 °F |
| Boots at | **50 °F (10 °C)** — the sourced design inlet, on every initial condition. Measured there: **100.0 MWe** and **27.52 inHg (93.2 kPa)** of vacuum at full power, i.e. the design point IS the rated point |

> **⚠ THE BOX WAS DARK UNTIL 2026-08-31, AND THE REASON MATTERS.** The condenser has computed
> vacuum from this temperature since it was built; the *command* sat in the engine's refused list
> carrying the retired plant's reason ("pumps on/off only"), and the board darkened the box on the
> strength of that refusal. Nothing was missing but the door. Filed as **#592** by the manual pass
> that found the mismatch, and fixed with the owner's playtest item on the same card.

**MEASURED ACROSS THE BAND** — hot full power, 600 s, and every figure re-taken on *this* plant:

| CW inlet | Vacuum | Backpressure | MWe |
|----------|--------|--------------|-----|
| 35 °F (floor) | 28.40 inHg (96.2 kPa) | 1.53 inHg | 100.0 |
| **50 °F (design)** | **27.52 inHg (93.2 kPa)** | 2.40 inHg | 100.0 |
| 60 °F | 26.72 inHg (90.5 kPa) | 3.20 inHg | 100.0 |
| 77 °F | 24.85 inHg (84.1 kPa) | 5.08 inHg | 100.0 |
| 85 °F (ceiling) | 23.68 inHg (80.2 kPa) | 6.24 inHg | 100.0 |

**What circulating-water temperature does on this plant:**

- **Warm circ water** → the condenser can only pull down to a warmer saturation → **less vacuum**,
  and the **22 inHg (74.5 kPa)** turbine trip gets closer.
- **Cold circ water** → vacuum **above** the rated value.
- **It does NOT move MWe here** — measured **100.0 MWe at every step from 35 °F to 85 °F**. This
  turbine is dispatched to a **load target**, not floated on the backpressure, so warm water costs
  you vacuum and margin rather than output. On a real machine it costs both; that is a declared
  departure of this model, not a claim about plants.
- **Nor does it move the RHR cooldown floor.** Shutdown cooling on this plant rejects to its own
  component-cooling water at a fixed **95 °F (35 °C)**, which does not read this box. The old
  coupling was the retired engine's.

**⚠ CHANGED, AND IT IS A REAL ONE: lake temperature ALONE CAN NOW RING COND VAC LO.** The alarm is
at **25 inHg (84.7 kPa)** and the band crosses it at about **76 °F** — measured, 24.85 inHg at
77 °F and 23.68 inHg at the 85 °F ceiling, with the annunciator confirmed in through the full
stack. The previous edition of this section said the opposite ("even the 85 °F ceiling leaves
~2 inHg of margin"); that was measured on the retired engine and is false here by about 1.3 inHg
the wrong way. **A hot summer day is now an alarm you have to answer.**

The walk continues to **COND VAC TRIP (22 inHg / 74.5 kPa)**, but *not* from lake temperature: the
ceiling stops 1.7 inHg short. Reaching the trip — and the **C-9** interlock removal that takes the
steam dumps with it — needs an equipment casualty: the circulating-water pumps, condenser air
removal, or tube fouling.

---

## 14.0 Automation channels (board AUTO procedures)

### 14.1 Engage a channel

1. Find the channel's AUTO control on its board card — **STEAM GEN FEED → AUTO** (three-element SG level), **BORON → ON** (target ppm), **STEAM DUMP → AUTO**, **CHARGING → AUTO**. (There is no rod AUTO control on this plant — see §14.3.)  
2. Where the card carries a setpoint box (boron target ppm, dump setpoint), set/verify it; the other channels capture the current reading on engage.  
3. Press **AUTO** — the button stays lit while the channel is engaged.  

### 14.2 Return to manual

1. Operate the underlying control (rods, feed %, etc.), **or** select **MAN**.  
2. Channel disengages; operator owns the parameter.  

### 14.3 Rod control is MANUAL on this plant, and that is deliberate

**There is no automatic rod controller here, and there is no button for one** *(OWNER DIRECTIVE,
2026-08-30: "I want to keep rod control manual. This is a learning plant not an actual power plant
and I think making the player move rods manually will help their learning.")*.

Until Rev 17 a **ROD AUTO** pushbutton sat on the rod-control card, permanently dark, on the
argument that the contrast was the lesson. It was removed *(OWNER DIRECTIVE, #598 items 9/10:
"Remove the ROD AUTO button. Move the 1/m button to where the ROD AUTO button used to be.")* —
the player had to ask what it was for, which is a control failing the test a control is for. The
**1/M PLOT** button now occupies that slot. The contrast is still worth teaching and this section
is where it is taught, which is the right place for it: a real plant hands the control bank to a
controller that holds average coolant temperature on a reference programmed from turbine load,
and the operator supervises it. Here the operator IS that controller.

**What that leaves you holding:**

- **The rods set temperature; the turbine sets power.** Inserting 60 fine steps at 80 MWe moves
  Tavg about 6 °F (3.3 °C) and generator load less than one point — roughly **0.1 °F (0.06 °C) per
  fine step**, linear over the useful range.
- **The plant load-follows without the rods, but it does not put Tavg back.** On a 100 → 80 MWe
  cut, moderator feedback alone takes power to 81.8 % and parks it in about 3½ minutes — and
  settles Tavg roughly **17 °F (9.4 °C) above program**. Trimming that off is your job, in MAN.
  A controller would have closed it for you and you would not have seen the coupling work.
- **Reactivity per step is not constant.** One rod step is worth several times more mid-bank than
  near either stop, so the same tap moves the plant differently depending on where the bank is.
  With no controller de-rating itself on your behalf, this is yours to feel.

> **NOTE:** every rod stop in this plant still acts — see **09 §**. The stops block *withdrawal*;
> insertion is always available.

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
meter can still cross the 118 % trip.

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
| sg_steam_flow | ×rated | 0 – 2.0 | 1 s | **Total** steam leaving the SG (turbine + dump + safeties + break discharge) — the main-steam-line transmitter, and what feed regulation must match. Span covers a full-area break's ~1.75 total draw | — |
| cw_inlet_temp | °F (°C) | 32 – 113 (0 – 45) | 20 s | Circulating-water inlet — sets achievable vacuum and the RHR cooldown floor (§13.1) | — |
| condensate_flow | ×rated | 0 – 1.2 | 1 s | Hotwell → feed train | — |
| steam_pressure | psi (MPa) | 0 – 1233 (0 – 8.5) | 0.5 s | SG / dump | SG PRESS HI |

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
| boron_sample (CHEM) | ppm | 0 – 2500 | 30 min lab | Chemistry grab sample — the boron reference | — |
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

### 17.2 Holding Tavg by hand (Mode 1)

There is no automatic rod control on this plant (§14.3), so this is the drill that replaces the old
engage-the-controller one.

1. Note **Tavg** against **T-ref** on the rod-control card.
2. Tap the bank in the direction that closes the deviation and **stop** — rod worth per step
   changes with bank position, so the same tap does not always move the plant the same amount.
3. Wait for the plant to answer before tapping again. The coupling is slow; chasing it is the
   commonest mistake.
4. Change generator load and watch T-ref slide. **The turbine set the power; you set the
   temperature.**

See **PWR-T10** / **T11**.

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

### 17.4 Getting an ESF actuation back — the reset permissive (Mode 1)

**There is no ESF AUTO / MAN selector on this plant.** A real plant gives the operator an arm
switch per engineered-safeguard system, and pressing MAN takes that system out of automatic. Here
the actuations live inside the protection logic and **nothing on the board defeats them** — the
HPI AUTO button is dark, and the AFW AUTO button is a lamp that is already lit. What you get
instead is a **reset permissive**, and it is a better thing to learn, because it is what a real
operator is actually fighting on a trip.

**What an actuation does.** Safety injection and aux feed **latch**. While a latch stands the
pumps are held running: the demand is re-asserted every step, so an Off click does not quietly
lose to the plant a second later — it is **refused up front**, with the reason on the screen.

**What clears it.**

| To secure | You must have |
|---|---|
| **Safety injection** (HPI/LPI, §11) | the reset time-delay relay run out — **60 s** from actuation — **and** a tripped reactor (**P-4**) |
| **Aux feed** (§10) | **no standing safety injection** (secure that first — it is itself an aux feed start), then the same **60 s** relay |

Once satisfied, **one click both resets the function and secures the pumps** — you do not reset
and then stop as two actions. And it works **with the actuating signal still present**: the
circuit blocks automatic *re*-actuation on that same standing signal, so securing injection while
pressure is still low is a thing the board will let you do. That is the decision the delay exists
to make you own.

**The trap.** The refusal counts down in seconds and reads like a malfunction the first time. It
is not — it is the relay. Read the message: it names *which* permissive you are short of, and the
two are cleared in different ways (one by waiting, one by tripping the reactor).

*Sourced — the reset circuit's time-delay relay "produces an output (energizes) some time after
it is started (usually 45–60 sec)", with SI reset additionally requiring the P-4 reactor-trip
contact: Westinghouse Technical Systems Manual §12.3.2.3 (ADAMS ML11223A310). The top of the band
is the installed value.*

**PWR-T12**. Campaign: `pwr_esf`.

### 17.5 MSIV — “bottle the boiler” (Mode 1)

1. **MSIV Close** (CONFIRM?) isolates main steam.  
2. Turbine load rejects; SG pressure rises toward the **SG safeties** — a staggered bank, first
   lift **1099 psi (7.58 MPa)**, the rest at **1155 psi (7.96 MPa)** (**09 §3.0**).  
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
| PORV open / close (§6.1) | `open_porv_manual` / `close_porv` | — |
| PORV block valve (§6.2) | `open_block_valve` / `close_block_valve` | — |
| RCP run / stop (§8.1) | `set_rcp` | `{running}` |
| Feed pump speed (§9.2) | `set_feed_pump_speed` | `{pct}` |
| Feed pump nudge (§9.2) | `feed_pump_nudge` | `{delta_pct}` |
| AFW start / stop (§10) | `set_afw` | `{active}` |
| AFW throttle (§10) | `set_afw_flow` | `{pct}` |
| AFW block / discharge valve (§10) | `set_afw_block` | `{open}` |
| ESF arm — **`afw` only**, and only `auto: true` (§17.4) | `set_esf_auto` | `{system: 'afw', auto}` |
| Accumulator discharge isolation (§11.1) | `open_accumulator_valve` / `close_accumulator_valve` | — |
| Generator **LATCH** (§12.1) | `latch_turbine` | — |
| Generator **TRIP** (§12.1) | `trip_turbine` | — |
| Generator **OFF** — planned offline (§12.1) | `disconnect_grid` | — |
| Turbine load (§12.2) | `set_load_target` | `{mwe}` |
| CW inlet temperature (§13.1) | **CW INLET TEMP** box on the CONDENSER COOLING card, 35 – 85 °F | `set_condenser_cw_temp` |
| Steam dump / bypass (§12.3) | `set_steam_dump` | `{mode}` — **AUTO or CLOSED only**; there is no manual position lever |
| Pressure setpoint box (§5) | `set_pressure_setpoint` | `{mpa}` |
| Steam-dump setpoint box (§12.3) | `set_steam_dump_setpoint` | `{mpa}` |
| HPI/LPI (§11.0) | `set_hpi` | `{active}` |
| RHR suction valve (§11.2) | `set_rhr` | `{active}` |
| RHR cooldown rate / HX split (§11.2) | `set_rhr_hx` | `{fraction | pct}` |
| SR detector on/off (§4.3) | *(no operator lever — the source-range channel energizes itself below the P-6 class point; the button reads dark)* | — |
| Startup trip blocks (§4.4) | `set_trip_block` | `{trip_id, blocked}` |
| MSIV open / close (§9.2) | `open_msiv` / `close_msiv` | — |
| Automation AUTO/MAN (§14) | `set_auto_channel` / `set_auto_setpoint` | `{channel_id, engaged}` / `{channel_id, value}` |

> **Four rows of this table documented actions the plant REFUSES**, found 2026-08-27 by the new
> `test/run_manual_commands.js` gate and corrected above: `open_porv` (the operator path is
> `open_porv_manual`), `set_steam_demand` (this turbine is dispatched by load target), and the
> circulating-water temperature and source-range detector levers, neither of which this plant has.
> A fifth documented `set_steam_dump {pct}`, which the shell silently swallowed. **A manual that
> tells the operator to use a command they will be refused for is the same defect as a board button
> that can only throw** — see §12.1's note on the generator card for the board half of it.

---

## 19.0 Related documents

- `04_NORMAL_OPERATIONS.md`  
- `05_MODE_TRANSITIONS.md`  
- `09_SETPOINTS_LIMITS.md`  
- `11_CAMPAIGN_CROSSWALK.md`  
- `CAMPAIGN_MODE_ALIGNMENT_SPEC.md`  
