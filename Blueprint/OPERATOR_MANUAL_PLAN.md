# Operator's Manual — Enhancement Plan & Procedure List

**Status:** APPROVED & IN BUILD. Foundation + PWR template built (integrated voice, glossary,
rich per-step schema with acceptance, panel refit — all validated). Remaining: rich RBMK/BWR
normal procedures and the full per-plant failure procedures (phased). See BUILD_DECISIONS
"Operator's manual v2".
**Purpose.** Turn the current reference-plus-toggle manual into **one authoritative operating
manual** the user can follow step by step to operate each plant — and make it the **source of
truth for the Instructor module (M6)**: every procedure step carries a machine-checkable
acceptance criterion that both the validation harness and the Instructor consume.

Supersedes the two-register manual behavior described in the M8 BUILD_DECISIONS "Phase 1–3"
entries; the generated reference data (`RD.MANUAL`) and validated-procedure mechanism
(`RD.MANUAL_PROCEDURES`, `test/run_procedures.js`) are kept and extended.

---

## 1. Locked decisions (from review)

1. **Single integrated voice.** One document, not two registers. Every term is spelled out with
   its acronym on first use and the acronym reused after — e.g. *Steam Generator (SG)*,
   *Pressurizer (PZR)*, *Startup Rate (SUR)*, *Operating Reactivity Margin (ORM)*, *Reactor
   Coolant Pump (RCP)*. Plain-language meaning is woven in, not siloed. The manual's
   Learning/Industry toggle is **removed**. (The sim's board-label register toggle is separate
   and unaffected.)
2. **Controls are named by their on-screen label**, never the internal command. Raw command
   names (`rod_start`, `set_channel_flow`, …) move to a **dev/Instructor appendix** only (M6 and
   the test harness use them).
3. **Every modeled failure gets a full step-by-step response procedure** (symptoms → immediate
   actions → recovery → acceptance). Built in phases, per plant.
4. **Cold operations are out of physics scope** — every engine state starts hot; there is no
   cold state, no RCP pump-heat warmup, and no modeled heatup/cooldown *rate*. So cold startup /
   RCP warmup / cooldown are written as **clearly-marked narrative context (`[narr]`)**, not
   step-followable. All step-followable (`[sim]`) procedures begin at **Hot Standby**.

---

## 2. Content model & voice

- **Acronym convention:** first mention "Auxiliary Feedwater (AFW)"; thereafter "AFW". A glossary
  section lists every acronym.
- **No jargon without a plain gloss:** "subcooling margin (how far the coolant is from boiling)".
- **Numbers, always:** targets, limits, and acceptance bands are explicit (see §3).
- **Modeled-honestly:** `[narr]` blocks say plainly what the trainer does not simulate.

## 3. Procedure schema (the Instructor source-of-truth)

Each procedure: `{ id, title, purpose, applies_to (profiles), from_state, prerequisites[],
cautions[], steps[], outcome }`. Each **step**:

| field | meaning | consumed by |
|---|---|---|
| `text` | integrated-voice instruction | manual render |
| `control` | on-screen control to use (label) | manual render |
| `target` | the setpoint/value to drive to (value + unit) | manual render |
| `acceptance` | checkable predicate: `{param, op, value, tol}` (or a `saw`/`never` form) | **harness + Instructor (M6)** |
| `caution` | limit / what to watch | manual render |

`acceptance` is the load-bearing addition: the same predicate the harness asserts is the one the
Instructor gates on and checks the trainee against. One artifact, no divergence.

**Value sourcing** (all verifiable):
- **Engine-derived:** operating points and setpoints already captured in `RD.MANUAL`
  (normal values, trips/actuations/alarms, safety limits).
- **Operational standards (authored, then engine-validated):** e.g. SUR ≤ 1 decade/min (DPM),
  reactor period ≥ 30 s on the startup range, ~10 %/min power-ramp ceiling. Each target is proven
  *achievable* by running the procedure through the engine (`test/run_procedures.js`).

## 4. What is modeled vs narrative

- **`[sim]`** — from Hot Standby: approach to criticality, low-power ops, turbine roll & sync,
  power ascension, maneuvering, reactivity/xenon (PWR boron), pressure/level/flow control, normal
  shutdown, every modeled failure response, depressurization (BWR).
- **`[narr]`** — cold startup, RCP/heatup to operating temperature & pressure, controlled
  cooldown. Written as context with a clear "not simulated in v1" banner. (Candidates for a future
  physics phase — cold state + heatup/cooldown — if we choose to close them later.)

---

## 5. Master procedure list

IDs: `<PLANT>-N##` normal · `-A##` alarm response · `-E##` emergency/failure · `-X##` accident.
Alarm-response entries are one per annunciator (already enumerated in `RD.MANUAL[*].alarm_response`);
listed here by count. Failure procedures are enumerated in full (decision 3).

### 5.1 PWR — Pressurized Water Reactor

**Normal operations**
| id | procedure | scope |
|---|---|---|
| PWR-N01 | Prerequisites & plant lineup (at Hot Standby) | [sim] |
| PWR-N02 | Approach to criticality — dilute boron / withdraw Control Rods; SUR ≤ 1 DPM, period ≥ 30 s | [sim] |
| PWR-N03 | Plant heatup to operating T/P (RCP warmup, draw PZR steam bubble) | [narr] |
| PWR-N04 | Low-power operation & Point of Adding Heat (POAH) | [sim] |
| PWR-N05 | Turbine roll & generator synchronization | [sim] |
| PWR-N06 | Power ascension to 100 % (coordinate rods, boron, turbine load) | [sim] |
| PWR-N07 | Power maneuvering — raise power | [sim] |
| PWR-N08 | Power maneuvering — lower power | [sim] |
| PWR-N09 | Boron & reactivity management (incl. xenon transient) | [sim] |
| PWR-N10 | Pressurizer (PZR) pressure control — heaters/spray/PORV | [sim] |
| PWR-N11 | Pressurizer level control — charging/letdown (CVCS) | [sim] |
| PWR-N12 | Steam Generator (SG) level & feedwater control | [sim] |
| PWR-N13 | Reactor Coolant Pump (RCP) operation | [sim, approx] |
| PWR-N14 | Normal shutdown to Hot Standby | [sim] |
| PWR-N15 | Cooldown & Decay-Heat Removal (DHR/RHR) | [narr] |

**Alarm response** — PWR-A01…A22 (one per annunciator).
**Emergency / failure (PWR-E01…E21):** loss of main feedwater · RCP trip / loss of flow · turbine
trip · loss of offsite power · station blackout · SG tube rupture (SGTR) · stuck-open PORV
small-break LOCA · large LOCA · loss of condenser vacuum · degraded HPI · AFW failure · ATWS
(failure to scram) · PZR spray stuck open · PZR heaters failed · SG overfeed/overcooling ·
continuous rod withdrawal · stuck rod on scram · main steam line break · Tavg sensor failure ·
PZR level sensor stuck · PORV indicator stuck.
**Accident:** PWR-X01 Three Mile Island (1979).

### 5.2 RBMK — Chernobyl-type (pre-1986 & post-1986)

**Normal operations**
| id | procedure | scope |
|---|---|---|
| RBMK-N01 | Prerequisites & lineup (at Hot Standby) | [sim] |
| RBMK-N02 | Approach to criticality — withdraw Control Rods; watch SUR **and ORM** | [sim] |
| RBMK-N03 | Heatup to operating T/P | [narr] |
| RBMK-N04 | Establish channel flow — Main Circulation Pumps (MCP) | [sim] |
| RBMK-N05 | Turbine roll & synchronization | [sim] |
| RBMK-N06 | Power ascension (flow + rods) with ORM management — avoid the low-power/low-ORM danger zone | [sim] |
| RBMK-N07 | Power maneuvering — raise power (reduce flow / withdraw rods) | [sim] |
| RBMK-N08 | Power maneuvering — lower power | [sim] |
| RBMK-N09 | ORM management — keep above the minimum (15 pre / 43 post) | [sim] |
| RBMK-N10 | Xenon management | [sim] |
| RBMK-N11 | Steam-drum pressure control | [sim] |
| RBMK-N12 | Steam-drum level & feedwater control | [sim] |
| RBMK-N13 | Normal shutdown — AZ-5 from full power (unconditionally safe) | [sim] |
| RBMK-N14 | Cooldown | [narr] |

**Alarm response** — RBMK-A01…A11.
**Emergency / failure (RBMK-E01…E13):** MCP trip · partial MCP trip / flow runback · loss of
feedwater · channel dryout · Emergency Protection (EPS) bypass · ORM indicator failure · ATWS
(AZ-5 failure to insert) · stuck rods on scram · continuous rod withdrawal · pressure-tube rupture
· void sensor failure · turbine trip · loss of condenser vacuum.
**Accident:** RBMK-X01 Chernobyl (1986), pre vs post comparison.

### 5.3 BWR — Boiling Water Reactor

**Normal operations**
| id | procedure | scope |
|---|---|---|
| BWR-N01 | Prerequisites & lineup (at Hot Standby) | [sim] |
| BWR-N02 | Approach to criticality — withdraw Control Rods; recirculation established | [sim] |
| BWR-N03 | Heatup to operating T/P | [narr] |
| BWR-N04 | Turbine roll & synchronization | [sim] |
| BWR-N05 | Power ascension — rods to criticality, then recirculation flow | [sim] |
| BWR-N06 | Power maneuvering — raise power (increase recirc flow) | [sim] |
| BWR-N07 | Power maneuvering — lower power (reduce recirc flow) | [sim] |
| BWR-N08 | Xenon management | [sim] |
| BWR-N09 | Vessel pressure control — Safety/Relief Valves (SRV) & turbine bypass | [sim] |
| BWR-N10 | Vessel level & feedwater control | [sim] |
| BWR-N11 | Recirculation flow control (jet pumps) | [sim] |
| BWR-N12 | Normal shutdown | [sim] |
| BWR-N13 | Depressurization & cooldown (depressurize [sim] · cooldown [narr]) | mixed |

**Alarm response** — BWR-A01…A09.
**Emergency / failure (BWR-E01…E14):** RCIC failure · HPCI failure · station blackout · loss of
feedwater · turbine trip · ATWS (→ Standby Liquid Control, SLC) · Automatic Depressurization
System (ADS) failure · Low-Pressure Coolant Injection (LPCI) failure · recirc pump trip ·
stuck-open relief valve · early battery depletion · vessel level sensor failure · loss of
condenser vacuum · Main Steam Isolation Valve (MSIV) closure.
**Accident:** BWR-X01 Fukushima Daiichi (2011).

**Totals:** ~15 normal + 22/11/9 alarm + 21/13/14 failure + 1 accident per plant.

---

## 6. Build sequence

1. **Schema + voice + panel refit.** Extend the procedure schema (per-step `control`/`target`/
   `acceptance`); update the generator's authored layer to single integrated voice + acronym;
   drop the manual register toggle; move commands to a dev appendix; render the richer steps
   (targets + acceptance) in the panel. Add a Glossary section.
2. **Normal procedures, per plant**, authored with concrete targets + acceptance, each validated
   in `test/run_procedures.js`. PWR first as the template, then RBMK, then BWR.
3. **Alarm-response upgrade** to procedure-grade (symptom → response → acceptance).
4. **Failure procedures** — every modeled failure, per plant, validated (inject → respond →
   acceptance). Phased: flagship-relevant first, then the remainder.
5. **Accident case studies** — keep narrative; cross-link to the relevant failure procedures.
6. **Instructor hook check** — confirm the `acceptance` predicates are sufficient for M6 to gate
   and grade (a short design review against the M6 spec).

## 7. Open items / to confirm during build

- **Operational limit values** (SUR/period/ramp ceilings, heatup-rate references for `[narr]`):
  authored to real-plant norms, then engine-validated for achievability. Will surface any target
  the lumped model can't hit and adjust honestly.
- **PWR RCP procedure (N13)** is approximate (start/stop maps to clearing/injecting an RCP-trip).
  Documented as such.
- **Cold-ops physics** (heatup/cooldown/cold state) remains a candidate future phase if we later
  want N03/N15 to become `[sim]`.
