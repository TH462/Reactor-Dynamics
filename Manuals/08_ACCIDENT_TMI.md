# 08 — Accident Study: Three Mile Island Unit 2 (1979)

**Document:** PWR-X01  
**Title:** Three Mile Island — An Accident of Information  
**Revision:** 17  
**Category:** Accident case study (narrative + recoverable drill)  

---

## 1.0 Purpose

Teach the TMI-2 sequence as hosted on this PWR trainer: how a **stuck-open Power-Operated Relief Valve (PORV)** with a **closed indication**, a **rising Pressurizer (PZR) level** during inventory loss, and **throttled High-Pressure Injection (HPI)** produced core damage — and how the correct diagnosis recovers the plant.

This is an **accident of information**, not primarily of equipment unavailability.

**MODE context:** The event begins in **Mode 1, At Power** (power operation). After trip and recovery the plant is held in **Mode 3, Hot Standby** (hot standby/shutdown class). Cooldown to **Mode 5, Cold Shutdown** is outside the flagship lesson, but it is **[sim]** — run **PWR-T21** on the board afterwards if you want the full recovery.

---

## 2.0 Historical context (compressed)

| Item | Detail |
|------|--------|
| **Plant** | TMI-2, Pressurized Water Reactor, Pennsylvania, USA |
| **Date** | 28 March 1979 |
| **Initiator** | Loss of main feedwater / secondary upset |
| **Critical failure** | PORV opened on high pressure and **stuck open** |
| **Deception** | Control-room indication showed PORV **closed** (command/seal-in logic class problem) |
| **Misleading parameter** | Pressurizer level **rose** while coolant left through the open PORV |
| **Crew error (simplified)** | Throttled HPI based on high level / “solid plant” mental model |
| **Result** | Core uncovery and fuel damage; large offsite release of radioactivity **did not** occur at TMI scale of public fear, but the industry changed forever |
| **What would have worked** | Recognize open relief path; **isolate block valve**; keep injection |

---

## 3.0 How this trainer models TMI

| Element | Model behavior |
|---------|----------------|
| PORV stuck open | `stuck_porv_open` — close command fails; steam/inventory leaves |
| Lying indicator | `porv_indicator_stuck_closed` — light reads closed |
| PZR level rise | Void surge pushes liquid into PZR while **core inventory falls** |
| Truth-teller | **Subcooling margin** (and pressure trend, tailpipe temperature) |
| Recovery | **PORV Block Valve → Isolate** stops loss even if PORV stuck open |
| Wrong path | Throttle HPI on high PZR level → uncovery / fuel damage branch |
| Right path | Isolate + keep HPI → core stays covered |

**Simplifications (honest):** point kinetics; single loop; containment and hydrogen are lumped models (the building, its ESF, the H₂ inventory and the one-time burn exist — `12` §12.4d/§12.4e — but no relief tank, no releases); peak damage may be understated vs history; scenario pacing may be compressed.

---

## 4.0 Key instruments — what to trust

| Indication | Trust in TMI-class event |
|------------|---------------------------|
| PORV position light | **LOW** — may show closed while open |
| PZR level | **LOW as inventory meter** — can rise while losing mass |
| Primary pressure | **HIGH** — falling pressure is real leak signature |
| **Subcooling margin** | **HIGHEST** — erodes toward 0 as you lose the liquid state |
| PORV tailpipe temperature | **HIGH** — hot line suggests steam passing |
| HPI flow / pump status | Confirm injection actually running |
| Power / rods | Confirm trip after initiator |

---

## 5.0 Scenario walkthrough (training)

### 5.1 Setup options

| Method | How |
|--------|-----|
| **Campaign** | Act V TMI-2 parts 1–3; Act VI compressed TMI / qualify |
| **Free Play drill** | Hot Full Power → inject failures as below |
| **Procedure walkthrough** | In-product “Stuck-open relief valve” + TMI narrative procedure |

### 5.2 Recommended Free Play injection sequence

| Step | Action |
|------|--------|
| 1 | Start **Hot Full Power**, speed 1×–10× |
| 2 | Optional: inject **Loss of Main Feedwater** (historical initiator) |
| 3 | Observe pressure rise → PORV auto-open **100 psi (0.69 MPa) above the pressure setpoint** — **2335 psi (16.099 MPa)** at the 2235 psi (15.41 MPa) nominal |
| 4 | Inject **PORV Stuck Open** |
| 5 | Inject **PORV Indicator Stuck Closed** |
| 6 | Watch the board without using Learning duals if practicing Realistic |

### 5.3 What you should see (correct mental model)

1. Reactor may trip on secondary low level / other protection.  
2. PORV is **actually open** but light may read **closed**.  
3. Primary pressure falls; **subcooling falls**.  
4. PZR level may **rise** — this is **not** “we have too much water.”  
5. Core inventory is **falling**.  

### 5.4 Correct recovery (do this)

| Step | Action | Why |
|------|--------|-----|
| 1 | Declare “open primary relief path” based on subcooling/pressure | Diagnosis |
| 2 | Command PORV Close (may fail) | Attempt direct shut |
| 3 | **Isolate PORV Block Valve** (CONFIRM?) | Stops the SBLOCA |
| 4 | Ensure **HPI On** — leave it on | Inventory |
| 5 | Restore heat sink (AFW if feed lost) | Decay heat |
| 6 | When isolated, recover pressure/level deliberately | Stabilize |
| 7 | Re-arm ESF only when intentional | Avoid surprises |

### 5.5 Incorrect path (historical — avoid)

| Step | Wrong action | Consequence |
|------|--------------|-------------|
| 1 | Believe PORV closed | Miss the leak |
| 2 | See high PZR level | Think solid / overfilled |
| 3 | Throttle or stop HPI | Uncovery |
| 4 | Focus only on secondary | Core damage branch |

---

## 6.0 Procedure PWR-X01 — TMI recovery (operator)

### Purpose
Recover a stuck-open PORV LOCA with possible lying indicator without core damage.

### Prerequisites
- Ability to operate Relief card, HPI, AFW, SCRAM.  
- Understanding of subcooling bar (**03**, **06**).  

### Precautions

| Type | Text |
|------|------|
| **WARNING** | Do **not** trust the PORV position light. |
| **WARNING** | Do **not** throttle HPI on rising PZR level alone. |
| **CAUTION** | Block valve Isolate is two-press armed. |
| **NOTE** | Spring safeties are a separate path; block valve isolates PORV line only. |

### Steps

| # | Action | Control | Acceptance |
|---|--------|---------|------------|
| 1 | Confirm upset: pressure trending down or subcooling eroding | Subcool bar, pressure | Leak signature present |
| 2 | Confirm reactor trip if required | SCRAM / REACTOR TRIP | Power collapsing |
| 3 | Establish heat sink | AFW / feed | SG level held |
| 4 | Attempt PORV Close | PORV Close | May not work |
| 5 | **Isolate PORV Block Valve** | Block Valve Isolate | Inventory loss stops |
| 6 | Verify HPI running; leave on until subcooling/inventory healthy | HPI On / AUTO | Injection active as needed |
| 7 | Stabilize pressure with heaters when leak isolated — injection actuated early here, so they are **shed**; reload them first | PZR Heaters | P recovering toward 2235 psi (15.41 MPa) class |
| 8 | Restore normal CVCS carefully | CVCS | Level control without losing subcooling |
| 9 | Clear drill failures when complete | Failures tab | Clean board |

### Outcome
Leak isolated; core covered; plant in controlled Hot Shutdown — the recovery TMI missed.

### Guard criteria (training)
- Never melted.  
- Prefer fuel temperature never ≥ **2192 °F (1200 °C)** (cladding damage threshold in model).  

---

## 7.0 Mission map (campaign)

| Mission | Teaching focus |
|---------|----------------|
| TMI-2 Part 1 | Live the fog of war — limited hindsight |
| TMI-2 Part 2 | Replay: board vs plant truth |
| TMI-2 Part 3 | Second watch — change the outcome |
| Compressed TMI / Qualify | Blind stuck-PORV exam graded on instruments |

Use Plant & Mission to launch; follow Instructor gates.

---

## 8.0 After-action review questions

1. Which single indication would you defend as the “truth-teller,” and why?  
2. Why can PZR level rise while the core loses inventory?  
3. What does the block valve do that PORV Close cannot when the PORV is stuck?  
4. How would Realistic mode change what you saw compared to Learning duals?  
5. If HPI were degraded (**E11**), what becomes more urgent?  

---

## 9.0 Related documents

- `07_ABNORMAL_EMERGENCY.md` — **PWR-E01**, **E07**, **E08**, **E11**, **E12**  
- `06_ALARM_RESPONSE.md` — LO SUBCOOL, SUBCOOL LOST, PORV OPEN, PZR LVL HI  
- `03_CONTROLS_AND_INDICATIONS.md` — Relief / subcooling / HPI  
- `Blueprint/M5 TMI2 Scenario Spec.md` — detailed scenario design (developers)  
