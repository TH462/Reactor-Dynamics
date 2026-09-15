# 08 — Accident Study: Three Mile Island Unit 2 (1979)

**Document:** PWR-X01  
**Title:** Three Mile Island Unit 2 — the four hours in the control room  
**Revision:** 19  
**Category:** Accident case study (sourced narrative + walkthrough)  

---

## 1.0 The plant and the night

**What this chapter is.** The TMI-2 accident as it can be lived on *this* plant: what the crew
saw, what they believed, what they did — and what happens when the same actions are taken on this
board. Every historical clock and every operator-reasoning claim below is quoted from the primary
listed in §7.0. Every plant number is a measurement taken on this plant through the full stack
(service → control layer → engine) on 2026-09-08; where the model departs from the history, the
departure is stated in the same row rather than smoothed over.

**How to run it.** Open the **Walkthroughs** tab and select **TMI-2 incident**. The walkthrough
starts at full power and injects the failures behind the scenes, on the step that needs them; you
operate the board. It is on the **preview channel** while the two playthrough reviews are open.
Free play alternative: start Hot Full Power and inject **Loss of Main Feedwater**, **Auxiliary
Feedwater Failure**, **PORV Stuck Open** and **PORV Indicator Stuck Closed** together
(**07** PWR-E01, PWR-E12, PWR-E07, PWR-E08).

**The first minute arrives as five beats, not one.** Steps 2-6 are the cascade, one event to a
step and each on its own clock: the condensate polisher goes off line (told, not simulated, §6.0),
the condensate and main feed pumps trip, the turbine trips after them, the auxiliary feed pumps
start into shut valves, and the relief valve lifts and does not reseat. **On two of those beats the
walkthrough stops the clock** — the feed-pump trip and the relief valve — because the events are
seconds wide and are not the player's to control: the primary pressure spike peaks about six
seconds in and is over by thirty-five. The sim resumes when you press **Continue**; **Rewind step**
and **Stop** release it too. Steps 2, 3 and 6 ask for no action at all — read the board, then
press Continue.

**One thing is armed earlier than it is narrated, and it is a plant fact rather than an authoring
choice.** The stuck relief valve is armed with the feed-pump trip on step 3, three steps before the
beat that tells you about it. The stick does nothing to a shut valve: it latches on the first lift,
the valve lifts about five seconds in and reseats near twenty-five, and measured full-stack the
accident happens if the failure is armed at or before **21 seconds** and does not happen at all at
22 — the plant settles at **1989 psia (13.71 MPa)** with pressurizer level 41.5 % and the valve
shut. A narrated chain cannot spend that budget, so the arming rides with the initiating event and
only the **lamp** failure — which is timing-insensitive — lands on the relief-valve step.

### 1.1 Two different plants

| | TMI-2 | This plant |
|---|---|---|
| Type | Babcock & Wilcox, two once-through steam generators | Westinghouse-style, **one** U-tube steam generator (lumped single loop) |
| Rating | **2772 MWt** (GEND-061 §4.3) | **300 MWt**, ≈ **100 MWe** |
| Relief-valve setpoint | **2255 psig (15.55 MPa)** (Appendix II.1 E6) | **Press SP + 100 psi (0.69 MPa)** — **2335 psi (16.10 MPa)** at the normal **2235 psi (15.41 MPa)** program, and it follows the setpoint down a cooldown (**03** §6.1) |
| Relief capacity | one power-operated relief valve at 2772 MWt | **3.6× TMI-2's per MWt** — the anchor plant's two valves at **179,000 lb/hr** each and 1520 MWt, power-scaled (`Blueprint/PWR2_VALIDATION.md` §86) |
| Vessel level instrument | none | none — the same gap, and it is the whole reason the pressurizer is read as an inventory gauge |
| Reactor trip on turbine trip | **not fitted** — *"Some other vendors-GE and Westinghouse-voluntarily provided for these 'anticipatory trips' in their designs"* (Vol. II Pt 2) | **armed above P-9, 50 % power** (**09** §2.0) |

**Why the walkthrough defeats this plant's anticipatory trip** *(ruled 2026-09-08)*. At TMI-2 the
turbine tripped and the reactor kept running for eight seconds; primary pressure climbed into the
relief valve, which is the event the whole accident hangs from. The report is explicit about what
the missing feature cost and what a fitted one would have done:

> *"The anticipatory trip prevents, in most instances, the opening of the PORV… The influence of
> the lack of such a feature is to decrease the time available to the operating crew to cope with
> the event."* — Vol. II Pt 2

That is exactly this plant's behaviour: a turbine trip above P-9 scrams the reactor at once, the
pressure turns before it reaches the valve, and there is no stuck valve to find. The walkthrough
therefore injects **Anticipatory Trip Failure** on its first step and says so to the player in one
sentence. It is a declared departure from this plant's own sourced behaviour, taken so the
accident can happen at all — and the departure is itself the first lesson: one relay decides
whether this night is a routine trip or an accident.

**The consequence of the bigger relief valve.** Per megawatt this plant loses inventory through a
stuck-open valve faster than TMI-2 did. Read the *shape* of the ride below — the plateau, the
level that rises while mass falls, the margin that pegs — and not the minutes as real-plant
figures.

---

## 2.0 The first minutes — 04:00:36 to 04:02:39

**NOTE — how to read the clocks.** The source quotes a wall clock for the first two events only
(04:00:36 and 04:00:37) and gives *elapsed time after initiation* for everything after. **Every
other wall clock in this chapter is derived** by adding the elapsed time to 04:00:37 — arithmetic
on the source, not a quote from it.

| Clock | Elapsed | TMI-2 (sourced) | This plant (measured) |
|---|---|---|---|
| **04:00:36** | −1 s | Condensate pump CO-P1A trips — postulated closure of the condensate polisher valves *"because of water in the control air system"* (E1) | No polisher model — the initiator is **narrated**, not injected (§6.0). Walkthrough step 2, which asks for no action |
| **04:00:37** | 0 s | *"Feedwater pumps FW-P1A and FW-P1B tripped"* (E2) | **Loss of Main Feedwater** injected, **and the relief-valve stick armed with it**; FEED FLOW to 0. Walkthrough step 3 — **the sim pauses here** |
| 04:00:37 | 0 s | Turbine trip follows, *"Normal following trip of feedwater pumps"* (E3) | Nothing injected — the turbine trips out of the feed loss on its own, within about a second. TURBINE TRIP lit. Walkthrough step 4 |
| 04:00:37 | 0 s | Auxiliary feed pumps start into **valves already shut** — *"Block valves EF-V12A and EF-V12B were closed"* (E4) | **Auxiliary Feedwater Failure** injected, hidden — the pumps run and deliver nothing. Walkthrough step 5 |
| **04:00:40** | 3 s | *"RCS pressure reaches the setpoint of the pilot-operated relief valve (PORV) RC-R2. PORV opens. (Setpoint = 2255 psig)"* — **2255 psig (15.55 MPa)** (E6) | The relief valve lifts at **5 s, 2346 psia (16.175 MPa)**. Its setpoint here is **Press SP + 100 psi (0.69 MPa)** = **2335 psi (16.10 MPa)** at the normal program (**03** §6.1) |
| **04:00:45** | 8 s | *"Reactor trips on high pressure. (Setpoint = 2355 psig)"* — **2355 psig (16.24 MPa)**; the reactimeter peak is **2346 psig (16.175 MPa)**, the strip chart **2435 psig (16.79 MPa)** (E7) | **The reactor trips at 43 s on over-temperature ΔT** — the declared divergence of §1.1. *(The historical peak and this plant's lift pressure share their digits by coincidence: different plants, different datum.)* |
| **04:00:50** | 13 s | The valve is told to shut at **2205 psig (15.20 MPa)** and does not: *"Valve did not close."* The lamp is a solenoid indication — *"Light 'off' indicates solenoid deenergized. There is no actual position indicator."* (E12) | **PORV Stuck Open** was armed on the feed trip and **latches on the lift at 5 s**; **PORV Indicator Stuck Closed** lands on walkthrough step 6, which carries E6 and E12 together at E6's clock — **the sim pauses here too**. Until it lands the lamp reads honestly, which is what the crew had for their first thirteen seconds |
| 04:00:52 | 15 s | Pressurizer level peaks at **255 in**; *"RCS parameters are normal."* (E17) | — |
| **04:01:07** | 30 s | Relief-line high-temperature alarm at **239.2 °F (115.1 °C)**, dismissed: *"Alarms were not considered abnormal, because the PORV had previously opened."* (E20) | Tailpipe temperature rises above hot-leg temperature and stays there — the unalarmed indication that tells the truth (**03** §6.1, ~**302 °F (150 °C)** class while relief passes) |
| 04:01:55 | 1 min 18 s | Both steam generators dry out: *"Indicates dryout. No feedwater was being admitted."* (E28) | At 1 min: **1705 psia (11.756 MPa)**, pressurizer level 67 %, RCS mass 98.5 % |
| **04:02:39** | 2 min 2 s | Safety injection actuates on its own — *"Actuation on low RCS pressure (setpoint 1600 psig.)"*, **1600 psig (11.03 MPa)** (E31) | Safety injection actuates at **65.5 s** on low pressurizer pressure, **1715 psi (11.824 MPa)** (**09** §2.0) |

**The lesson of these two minutes.** Nothing on either board was lying about *itself*. The lamp
reported the signal it was wired to report; the tailpipe alarm reported a hot pipe; the
pressurizer reported its own level. What was missing at TMI-2 is missing here too — a direct
reading of how much water is in the vessel.

---

## 3.0 The deception — 04:03:50 to 04:06:28

### 3.1 What the crew knew

The standing condition, in the report's own words:

> *"No instruments are provided for reading the level of water in the reactor vessel."*
> — Vol. II Pt 2 §II.A, Figure II-6 caption

> *"Their training on this particular equipment has taught the operators that the only credible
> check on the amount of coolant in the system is the indicator showing water level in the
> pressurizer… If the pressurizer level remains high, the operators are not trained to anticipate
> that coolant water may be leaking out of the primary system."* — Vol. I

> *"the operator training at Met Ed, at B&W, even back in the navy, tells these men that the
> condition to avoid at all costs is 'going solid'"* — Vol. I

### 3.2 What they did

| Clock | Elapsed | TMI-2 (sourced) | This plant (measured) |
|---|---|---|---|
| **04:03:50** | 3 min 13 s | *"ESF emergency injection bypassed by operator."* (E33) — taken **before** any valve was touched | There is no engineered-safeguards bypass switch on this board (**03** §17.4). The nearest action is the **trip block** on the safety-injection trip, gated by permissive **P-11**, **1973 psi (13.6 MPa)** (**09** §2.0) |
| **04:05:07** | 4 min 30 s | *"Operator throttles makeup valves (MU-V16) to reduce injection flow."* Purpose: *"(a) to reduce rate of rise of pressurizer level (b) to prevent pump damage as RCS pressure drops."* (E35) | Injection is **On / Off** here, with no throttle valve (§6.0). Securing it is refused for **60 s** after actuation and until the reactor is tripped (P-4); the stop is **first accepted at 2.09 min** and was **accepted on the ride at 4.50 min** — the crew's clock works on this plant |
| 04:05:15 | 4 min 38 s | One of three makeup pumps stopped, two valves shut, two throttled (E36) | No partial equivalent — one control, one decision |
| **04:05:29** | 4 min 52 s | Letdown raised to its high limit as part of the *same* action: *"they stopped makeup pump MU-PlC and increased letdown flow to its high limit"* (§II.A); flow alarms above **160 gpm** six seconds later (E37, E38) | **Letdown Orifices A + B** — the maximum lineup on this plant, a net drain against charging (**03** §7.3) |
| 04:05:37 | 5 min 0 s | Pressurizer level peaks at **377 in** (E39) | Level is already pegged at **100 %** here, and the plant reads **1045 psia (7.205 MPa)** with **97.2 %** of its mass still aboard at 4.5 min |
| **04:06:28** | 5 min 51 s | *"Pressurizer level goes offscale high (greater than 400 inches)."* (E43) | — |

### 3.3 The coupling, on this plant's numbers

**They throttled on a level that was still rising, not on a pegged gauge.** The sourced order is
throttle at 4 min 30 s → level peaks at 5 min → off scale at 5 min 51 s. The reaction was to the
*rate*.

On this plant the same divergence is **emergent physics, not a script**: at 4.5 minutes the
pressurizer reads **100 % on 97.2 % of the plant's water**, while pressure has fallen from
2235 psi (15.41 MPa) to **1045 psia (7.205 MPa)**. Steam forming in the hot leg pushes liquid up
the surge line; the gauge measures the surge, not the inventory. Rising level with falling pressure is the
signature — one of those two indications is about water and the other is about heat, and only
their disagreement carries the diagnosis.

**WARNING:** Do not throttle or secure injection on rising pressurizer level alone. Read the
subcooling margin and the pressure trend with it.

---

## 4.0 Boiling and the pumps — 04:06 to 05:41

| Clock | Elapsed | TMI-2 (sourced) | This plant (measured) |
|---|---|---|---|
| **04:06:27** | 5 min 50 s | *"RCS pressure reaches minimum (~1350 psig), then begins to increase. Temperature reaches saturation."* — **1350 psig (9.31 MPa)**; *"Reaching saturation temperature means that steam voids can form in system"* (E42) | Board **subcooling margin 0.0 at 5 min**; the hot leg first reads above saturation at **2.7 min** |
| **04:08:37** | 8 min | *"operator finds emergency feedwater block valves EF-V12A and EF-V12B shut and opens them"* (E49), on three cues — *"low OTSG level, low steam pressure, high emergency feedwater discharge pressure"*. The report's verdict: *"the 8-minute delay in restoring emergency flow did not directly affect the outcome of the accident-though it did serve to divert the attention of the operators"* (Vol. I) | Opening the aux feed block takes flow **0.000 → 1.000 within 30 s**; plant at **1049 psia (7.233 MPa)**, RCS mass **90.8 %** |
| **04:10:37** | 10 min | First reactor coolant pump high-vibration alarm — *"Indication of voids in system. Apparently not recognized."* (E56) | **RCP CAVITATION** stands from **2.58 min** — a step, not a ramp, crossing its threshold 20 s after the margin reaches zero. Indication only: no damage model, no automatic pump trip |
| 04:30:37 | 30 min | RCS at or near saturation and staying there | **967 psia (6.667 MPa)**, RCS mass **53.8 %** |
| 04:57 | 57 min | — | **The subcooling margin pegs on its floor, −50.4 °F (−28 °C), and stays there to about 150 min.** That is this board's "the instrument has run out of scale" |
| **05:13:37** | 1 h 13 min | Loop B pumps secured: *"Operator stops reactor coolant pump RC-P2B because of increasing vibration and decreasing flow and amperage"* (E99) | The cue has stood for **71 minutes** by now. Securing pumps is a real handswitch here |
| 05:20:37 | 1 h 20 min | *"The operators now have adequate information to deduce that the PORV is open — (a) No reduction in outlet temperature, and (b) PORV outlet 70°F hotter than code safety outlets."* (E103) | The same comparison is on this board: tailpipe temperature against hot-leg temperature |
| **05:41:37** | 1 h 41 min | Loop A pumps secured — *"The pump has been operating without adequate suction head."* (E111). Then: *"As soon as all the pumps were stopped, circulation of coolant decreased drastically, because natural circulation was blocked by steam."* (§II.A) | Forced flow stops. The primary **holds about 1020 psia (7.033 MPa)** through this window, on the auxiliary-feed level hold; the accumulators are **100 % full at 60 min** and have bled only to **86 % at 120 min** — on this plant they never dump |
| **06:11:37** | 2 h 11 min | Loop A hot leg **off the top of its scale** — *"TAVE will not be correctly shown."* (E119) | **The hot leg never pegs here.** Its detector spans **32 – 752 °F (0 – 400 °C)** and the whole ride's peak reading is **632.0 °F (333.3 °C)** at 232 min. The pegged instrument on this board is the **subcooling margin**, above |

**The pumps are the hard lesson.** Vibration, falling flow and falling amperage all said the same
thing — the pumps were passing a froth and had no suction head. Securing them was the correct
equipment decision and it removed the last forced circulation from a core that could not set up
natural circulation, because the loops were full of steam.

---

## 5.0 The block valve and the recovery — 06:18 onward

| Clock | Elapsed | TMI-2 (sourced) | This plant (measured) |
|---|---|---|---|
| **06:18:37** | 2 h 18 min | *"Operator closes PORV block valve RC-V2."* / *"RCS pressure begins to increase."* (E122, E124). The relieving shift supervisor read the discharge temperatures: *"Mehler dismisses the pressurizer level reading and moves to a fresh conclusion: The PORV is leaking."* (Vol. I) | **PORV Block Valve → Isolate** (two-press CONFIRM). Discharge goes to zero and pressure turns up, whatever the relief valve is doing — the block valve is upstream of it (**03** §6.2) |
| 06:28:37 | 2 h 28 min | Loop B hot leg off scale: *"There is now clear evidence of superheating in the hot legs."* (E126) | — |
| 06:45:37 | 2 h 45 min | *"Radiation alarms are now indicative of extensive fuel damage."* (E136) | **Not modelled on this path** — see §6.0 |
| **07:12:37** | 3 h 12 min | Block valve **reopened** *"in an attempt to control RCS pressure"* (E163) | — |
| **07:20:37** | 3 h 20 min | Injection restored by hand: *"ESF manually initiated. Makeup pump MU-P1C starts."* Post-accident: *"Rapid quenching probably caused major fuel damage."* (E167) | Injection restarts on one control |
| ~07:27 – 07:30 | ~3 h 27 – 3 h 30 min | Not sustained: safety injection reset, the makeup pump stopped, the block valve shut again — the reason is rationing, not diagnosis: *"There was thus an inclination to use ES as little as possible (high pressure injection water is taken from the BWST)."* (§II.A) | This plant has no injection water inventory to ration — a declared simplification, and it removes the pressure the crew was under |
| **07:41** | 3 h 41 min | Block valve **reopened again** (§II.A) | — |
| **07:56** | 3 h 56 min | Safety injection actuates again, injection at maximum (§II.A) | At **260 min** the plant reads **1505 psia (10.377 MPa)**, RCS mass **78.0 %**, and it is alive |
| 09:43 | 5 h 43 min | The RCS is repressurized and held between 2000 and 2200 psig *"by operation of the PORV block valve"* for the next hour and a half (§II.A) | The same control, used the same way |
| **13:50:37** | 9 h 50 min | Hydrogen burn in containment, heard as an *"Audible 'thump'"*, **28 psig (0.193 MPa)** peak, read at the time as *"electrical noise"* (E273) | **Not modelled** — §6.0 |
| **19:50:37** | 15 h 50 min | *"Start reactor coolant pump RC-P1A."* Post-accident: *"Adequate core cooling now has been established."* (E347) | A real handswitch |

**The recovery is one valve.** Everything upstream of 06:18 is diagnosis; the action itself was
available from the first minute. **This is the step to take away from the chapter:** an open
relief path is stopped by the block valve whether or not the relief valve can be commanded shut,
and whether or not its lamp agrees.

### 5.1 Correct recovery on this board

| # | Action | Why |
|---|---|---|
| 1 | Read subcooling margin and pressure trend together | The leak signature. Rising level does not contradict it |
| 2 | Command **PORV Close** | It can fail; the attempt costs nothing |
| 3 | **PORV Block Valve → Isolate** | Stops the loss, stuck valve or not |
| 4 | Leave **injection running** | Inventory. Securing it is a decision, not a tidy-up |
| 5 | Restore the heat sink — aux feed block valves open, feed to the steam generator | Decay heat |
| 6 | With the path isolated, recover pressure deliberately | Heaters were shed on the injection signal; reload them first (**03** §17.4) |

**CAUTION:** The spring safety valves are a separate path. The block valve isolates the relief
line only (**03** §6.3).

---

## 6.0 What the model does not show

Each gap below carries the measurement or the file that declares it, so the departure is checkable
rather than asserted.

| Gap | The declaration |
|---|---|
| **Cladding heat-up while the core is uncovered** | Measured: the cladding reads **555 °F (290.6 °C) at 94 % uncovered** (`Blueprint/PWR2_VALIDATION.md` §83). The core is a homogeneous node that credits residual steam flow with cooling every rod, so an uncovered core here does not get hot. This is the model defect the whole damage chain below hangs from |
| **Oxidation and hydrogen generation on this path** | The reaction **is** built and sourced — Baker-Just, mandated by 10 CFR 50 Appendix K (`engines/pwr2/pwr2_damage.js`). It self-gates on temperature: at 572 °F (300 °C) the law integrates to 0.07 mg/cm² in a year. With the cladding never heating, this path generates **no hydrogen at all** |
| **The 13:50 hydrogen burn** | Not modelled. `ctmt_h2_burned` is a **registered static 0** in `engines/pwr2/pwr2_true_state.js`, and containment has **no spray, no fan coolers and no recombiners** (`engines/pwr2/pwr2_containment.js`) — their capacities are in no document in the corpus, so none was invented. That containment only ever heats and pressurises |
| **Fuel damage on the TMI path** | The damage latch is a **cladding** temperature of **2200 °F (1204.4 °C)** — 10 CFR 50.46 criterion 1, *"the calculated maximum fuel element cladding temperature shall not exceed 2200F"*. It is a clad limit, not a fuel one, and the fuel runs far hotter than the clad in normal operation. **1200 °F (648.9 °C)** is a third quantity — GEND-061's onset of significant hydrogen generation. On this ride none of the three is reached |
| **A quench tank / pressurizer relief tank** | There is none (**12** §13.0). Relief and safety discharge go **directly to the containment atmosphere** (`engines/pwr2/pwr2_engine.js`), where a real plant fills a relief tank and bursts its rupture disc first |
| **The condensate polisher** | No polisher model — the board's polisher status is behavioural, not a resin condition, so the historical initiator is narrated rather than injected. **Ruled, not merely observed** *(OWNER RULING, 2026-09-10: "All decisions as recommended", ratifying #693's option A)*: modelling it was costed against giving it a failure-registry row and a board command, and declined on player complexity rather than on fidelity. The walkthrough's step 2 is that narration |
| **A partial injection throttle** | Injection is one **On / Off** control merging the high- and low-head pumps (**03** §11.0). TMI-2's crew shut two makeup valves, throttled two more and stopped one of three pumps. Here the same decision is all or nothing, which makes it a starker choice than the crew faced |
| **Offsite release and dose** | No source term, no release model, no radiation monitors. The simulation ends at fuel damage (**12** §13.0) |

**NOTE:** `12_SIM_PHYSICS.md` §12.4d and §12.4e describe a containment with spray, fan coolers,
recombiners and a one-time hydrogen burn. Those sections were written against the engine this
plant replaced; the containment the site now runs is the one declared in the table above. Read
this chapter's row, not those two, until chapter 12 takes its own pass.

**Where the numbers come from, and how far they carry.** Every plant figure in §2.0–§5.0 was taken
on one continuous full-stack ride from Hot Full Power on 2026-09-08. To 15 minutes that ride and
the engine-direct rides agree within 3 %; at 30 minutes within 3.4 %. **Past 50 minutes the
figures are the shipped plant's alone** — the auxiliary-feed level-hold channel throttles feed
there, which holds the primary near 1020 psia (7.033 MPa) instead of letting it fall, and it is
the reason the accumulators never dump. Numbers past 30 minutes were taken on a scripted ride
whose holds are not a player's route; treat them as the shape of the ride, not as step targets.

---

## 7.0 Sources

**Primary — the chronology and the operator reasoning.**

| Document | What it carries |
|---|---|
| **NUREG/CR-1250, Vol. II, Part 2** — *Three Mile Island: A Report to the Commissioners and to the Public*, NRC Special Inquiry Group (Rogovin), January 1980 | §II.A *Sequence of Physical Events* and **Appendix II.1** *Sequence of Events* — the numbered event table (`E<n>` above) with the information available to the operators and the post-accident calculations in adjacent columns |
| **NUREG/CR-1250, Vol. I** — *Narrative of the Accident* | What the operators believed and why; quoted above for the training, the "going solid" rule and the block-valve closure |
| **GEND-061** — TMI-2 hydrogen burn report | Core inventory, the burn, the 2772 MWt rating, the oxidation onset; its *"almost 30 lb/in² gage"* burn pressure corroborates Appendix II.1's 28 psig (0.193 MPa) |
| **IE Bulletin 79-06A** — *Review of Operational Errors and System Misalignments Identified During the Three Mile Island Incident* | The regulator's immediate instructions to licensees |
| **IE Bulletins 79-05C / 79-06C** — *Nuclear Incident at Three Mile Island — Supplement* | The follow-on supplement |

**Why Appendix II.1 and not NUREG-0600 or NSAC-1.** The appendix states in its own introduction
that it *is* the reconciliation of those two plus the utility's own sequence: *"An attempt has
been made to reconcile discrepancies found in other published sequences."* It also flags the
disagreements it could not reconcile and names which reference it believes.

**NOT in this project's source corpus, stated plainly:** the **Kemeny Commission report** and
**NUREG-0600** were both sought and neither was obtained — NUREG-0600's full text 404s at its
public identifier and it is not in the NRC's web document store; the Kemeny report is not carried
by the archive the others came from. Nothing in this chapter rests on either.

**A trap for anyone re-extracting the appendix.** `pdftotext -layout` **mis-assigns Appendix
II.1's Event column by one row**, printing *"Reactor trips on high pressure"* against the 3-second
event instead of the 8-second one — exactly the distinction §2.0 turns on. Both documents are
laid out in columns, so grepping a text rendering for a quote returns zero even when the quote is
right; read down the column by its x-offset.

### 7.1 Related documents in this set

| Document | For |
|---|---|
| `07_ABNORMAL_EMERGENCY.md` | **PWR-E01** loss of main feedwater, **PWR-E07** stuck-open relief valve, **PWR-E08** relief indicator stuck closed, **PWR-E11** degraded injection, **PWR-E12** aux feed failure |
| `06_ALARM_RESPONSE.md` | **PWR-A07** PORV OPEN, **PWR-A10** LO SUBCOOL, **PWR-A11** SUBCOOL LOST, **PWR-A12** PZR LVL HI, **PWR-A27** RCP CAVITATION |
| `03_CONTROLS_AND_INDICATIONS.md` | §6.0 relief and block valve, §7.3 letdown orifices, §11.0 injection, §17.4 the reset permissive |
| `09_SETPOINTS_LIMITS.md` | The trips, permissives and actuation setpoints quoted above |
| `12_SIM_PHYSICS.md` | What this simulation computes and what it leaves out |
