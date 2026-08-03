# 07 — Abnormal and Emergency Operating Procedures

**Document:** PWR-EOP-01  
**Title:** Failure Response — PWR Trainer  
**Revision:** 19  

---

## 1.0 Purpose

Provide symptoms, automatic response, immediate operator actions, recovery, and acceptance criteria for **every modeled PWR failure**. Inject from **Tools → Failures** in Free Play, or encounter via missions.

**Typical applicability:** failures are injected in **Mode 1, At Power** (at power). Successful trip recovery leaves the plant in **Mode 3, Hot Standby** (hot, subcritical). See `05_MODE_TRANSITIONS.md` **PWR-T06**.

## 2.0 Failure index

| ID | Failure (UI display) | Category |
|----|----------------------|----------|
| PWR-E01 | Loss of Main Feedwater | power |
| PWR-E02 | RCP Trip | coolant |
| PWR-E03 | Turbine Trip | power |
| PWR-E04 | Loss of Offsite Power | power |
| PWR-E05 | Station Blackout | power |
| PWR-E06 | Steam Generator Tube Rupture (SGTR) | coolant |
| PWR-E07 | PORV Stuck Open (SBLOCA) | coolant |
| PWR-E08 | PORV Indicator Stuck Closed | instrument |
| PWR-E09 | Large LOCA (Cold-Leg Break) | coolant |
| PWR-E10 | Loss of Condenser Vacuum | power |
| PWR-E11 | Degraded HPI | safety_system |
| PWR-E12 | Auxiliary Feedwater Failure | safety_system |
| PWR-E13 | Failure to Scram (ATWS) | safety_system |
| PWR-E14 | Pressurizer Spray Stuck Open | coolant |
| PWR-E15 | Pressurizer Heaters Failed | coolant |
| PWR-E16 | SG Overfeed / Overcooling | power |
| PWR-E17 | Continuous Rod Withdrawal | reactivity |
| PWR-E18 | Control Rod Stuck on Scram | reactivity |
| PWR-E19 | Main Steam Line Break (downstream of MSIV — isolable) | power |
| PWR-E19u | Main Steam Line Break (upstream of MSIV — not isolable) | power |
| PWR-E20 | Tavg Sensor Drifting | instrument |
| PWR-E21 | Pressurizer Level Sensor Stuck | instrument |
| PWR-E22 | Pressurizer Level Sensor Failed Low | instrument |
| PWR-E23 | Reactor Coolant Pump Seal Leak | coolant |

**Combined drills:** E07 + E08 = TMI indicator deception (see **PWR-X01**).

### 2.1 Failure severity sliders

Most failures inject at a fixed severity; eight carry a slider (Tools → Failures). The slider
is the failure's physical size — the response procedures below apply at any setting.

| Failure | Slider | Range | Default |
|---------|--------|-------|---------|
| SG Tube Rupture (E06) | Rupture Severity | 0 – 100 % of full rupture | 40 % |
| Degraded HPI (E11) | HPI Capacity | 100 → 0 % of rated | 50 % |
| Large LOCA (E09) | Break Size | 0 – 50 % rated flow | 20 % |
| Continuous Rod Withdrawal (E17) | Withdrawal Rate | 0 – 6 steps/s | 3 |
| Rod Stuck on Scram (E18) | Rod Worth Held | 0 – 40 % of total | 20 % |
| Main Steam Line Break, downstream (E19) | Break Size | 0 – 100 % effective area | 30 % |
| Main Steam Line Break, upstream (E19u) | Break Size | 0 – 100 % effective area | 30 % |
| RCP Seal Leak (E23) | Leak Rate | 0 – 100 % of make-up capacity | 40 % |

---

## 3.0 Generic immediate actions (any upset)

| Priority | Action |
|----------|--------|
| 1 | **Protect the core:** verify SCRAM if required; manual SCRAM if power should be down and is not |
| 2 | **Heat sink:** SG level — feed or AFW |
| 3 | **Inventory & subcooling:** pressure, HPI, isolate open relief path |
| 4 | **Load:** turbine disconnected or matched |
| 5 | **Diagnose** on diverse instruments — never one light |
| 6 | **Re-arm ESF AUTO** only when intentional |

---

## PWR-E01 — Loss of Main Feedwater

### Failure
`loss_of_feedwater` — feed commands forced to zero / feed lost.

### Symptoms
- SG level falling; SG LVL LO → LO LO  
- Feed flow ~0 despite demand  
- Tavg / pressure rising if power remains  

### Automatic
- Low SG level → SCRAM (~17 %, lo-lo)  
- AFW AUTO start ~20 % if armed (established just above the trip)  

### Timing — what to expect

From a total loss of main feedwater at full power, measured: **SG LVL LO** (30 %) at about
**29 s**, AFW auto-start at about **37 s**, **SG LVL LO LO** and the reactor trip at about
**40 s**. That leaves roughly **11 s** between the first warning and the trip.

**Expect the trip. You are not going to prevent it.** Even restoring feed the instant the
warning comes in still trips the plant — the feed pump takes time to come back up while the
generator keeps boiling. That is prototypical, not a limitation: a real loss of normal
feedwater trips the reactor on low-low steam generator level, and that trip is the credited
protection for the event. Use the window to confirm the diagnosis and to check that AFW is
lined up and coming, not to chase the trip.

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Confirm SG level falling / feed lost |
| 2 | **SCRAM** if not tripped |
| 3 | Turbine load **0 / Disconnected** |
| 4 | **AFW Start** (verify delivery by level response) |
| 5 | Throttle AFW to hold level without severe overcooling |
| 6 | Stabilize PZR pressure |

### Recovery / acceptance
Reactor shut down; SG inventory restored on AFW; core not damaged (`fuel` safe); subcooling restored.

### If AFW also failed
See **PWR-E12** — critical heat-sink challenge; minimize heat load (verify scram) and use any remaining secondary path.

---

## PWR-E02 — RCP Trip / Loss of Flow

### Failure
`rcp_trip` — pump stop / flow coastdown.

### Symptoms
- RCP TRIP alarm; flow falling  
- Rising core ΔT / temperatures  
- Automatic low-flow SCRAM  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Verify reactor trip (manual SCRAM if needed) |
| 2 | Remove turbine load |
| 3 | Maintain secondary heat sink (AFW/feed as available) |
| 4 | Allow natural circulation for decay heat |
| 5 | Monitor subcooling and inventory |

### Acceptance
Shutdown; cooled without fuel damage.

---

## PWR-E03 — Turbine Trip

### Failure
`turbine_trip` — load commands overridden to 0; reconnect blocked.

### Symptoms
- TURB TRIP / steam demand low  
- **Above 50 % power (P-9): REACTOR TRIP, automatically and immediately** — expect the scram
  with the turbine trip, not after it  
- Below P-9: no reactor trip; power and Tavg respond and the steam dump carries the transient  
- Steam dump drives open on Tavg error; SG level shrinks then recovers  

**WARNING — a turbine trip above P-9 scrams the reactor.** This plant carries **Reactor Trip
on Turbine Trip** (P-9, ≥ 50 % power). Do not plan to "ride out" a turbine trip at power. What
this plant rides out is a **load rejection** — the generator taking less load with the turbine
still on line — which is a different event and does not arm P-9.

**A planned offline is not a turbine trip.** Taking the generator off line with the **OFF**
selector (`disconnect_grid`) opens the breaker: load goes to zero, the stop valves stay open,
no trip latches, and P-9 never arms. It is reversible with **FOLLOW** or **MAN**. See `03` §12.1.

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Verify 0 MWe |
| 2 | **Above P-9: confirm the automatic reactor trip and go to the post-trip response.** Below P-9: insert rods to match the lost load, or SCRAM if pressure/Tavg is challenged |
| 3 | Steam dump as needed for secondary pressure |
| 4 | Control SG level (swell/shrink) |
| 5 | Stabilize at Hot Shutdown or low power per drill |

### Acceptance
Load rejected safely; above P-9 the reactor tripped automatically and the plant is stable on
the dump and AFW; below P-9 nuclear power matched or scrammed. No SG dryout or flood.

### Note — high-high SG level (P-14)
A **high-high SG level (≥90 %)** — from overfeed or a steam-line-break level swell — trips the
turbine automatically to protect it from moisture carryover, **isolates main feedwater** (AFW keeps
feeding), and **trips the reactor** if power is **≥50 %** (the P-9 interlock). Expect all three
together. Main feed stays isolated until you restore it deliberately once level is controlled; verify
AFW is carrying the heat sink in the meantime. Annunciates as **SG LVL HI HI** (PWR-A16b).

---

## PWR-E04 — Loss of Offsite Power

### Failure
`loss_of_offsite_power` — pump coast-down class effect.

### Symptoms
- Forced flow loss symptoms; plant electrical support degraded as modeled  
- Likely reactor/turbine trips  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Verify SCRAM |
| 2 | Verify heat sink (AFW preferred when main feed lost with power) |
| 3 | Natural circulation monitoring |
| 4 | Inventory/pressure control with available systems |

### Acceptance
Core covered and cooled on available systems.

### Note
Distinct from full **SBO** (E05); still treat heat sink as priority.

---

## PWR-E05 — Station Blackout (SBO)

### Failure
`station_blackout` — full blackout effect as modeled.

### Symptoms
- SBO alarm  
- AC-dependent systems lost  
- Severe challenge to normal feed and many pumps  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Verify reactor shutdown |
| 2 | Start/verify **AFW** if available under blackout model |
| 3 | Minimize DC/control load conceptually; act quickly |
| 4 | Natural circulation / secondary heat removal focus |
| 5 | Recognize trainer limitation: SBO may be unsurvivable under some physics configurations |

### Acceptance
Best achievable: core covered as long as secondary heat removal works. Document outcome honestly if core damage occurs.

---

## PWR-E06 — Steam Generator Tube Rupture (SGTR)

### Failure
`sgtr` — primary-to-secondary leak; severity = leak rate % rated flow (default ~3 %, max 8 %).

### Symptoms
- Primary inventory dropping; charging rises and then saturates  
- Pressurizer level falling through the trip despite full charging — make-up cannot hold it  
- Subcooling eroding as the primary depressurizes  
- **The steam generator tells you NOTHING.** SG level does not rise, and secondary pressure follows
  primary *temperature* rather than the leak — see the declared departure below. **Diagnose this on
  the PRIMARY side.**

> **DECLARED DEPARTURE — the secondary does not receive the leak** (`DESIGN_COMPANION.md` §8.26,
> ruled 2026-08-03). On a real plant a tube rupture raises level and activity in the **affected**
> generator, and that is how you identify *which* one. This trainer models **one** steam generator,
> so that lesson cannot exist here at all — and the leak is modelled as a primary-side mass sink
> with ΔP modulation, delivering neither mass nor energy to the secondary. Measured: with the leak
> at 0.011–0.015 frac/s and feed, AFW and steam flow all at zero, SG level held at **67.98 %**
> constant for four minutes. **An earlier revision of this page listed "possible rising SG level"
> as a symptom. It does not happen; that line is withdrawn.**

### Immediate actions

| Step | Action |
|------|--------|
| 1 | SCRAM if not automatic / as pressure falls |
| 2 | Identify the leak on the PRIMARY side — inventory falling with charging saturated, level below program and still going, subcooling eroding. The steam generator will not confirm it for you (see the departure above) |
| 3 | Maximize charging / ensure HPI as needed |
| 4 | Depressurize primary carefully toward secondary pressure to reduce break flow (heaters off, spray if available, PORV only with care) |
| 5 | Isolate / control steam paths per training objective (MSIV strategy if used). **On this trainer the MSIV does not change the secondary pressure trend** — SG pressure is capped at Psat(Tavg), so it tracks primary temperature rather than steam inventory. Measured: 134.6 psi with the MSIV open against 134.0 psi shut, at the same point in the transient |
| 6 | Maintain heat sink and subcooling |

### Acceptance
Break flow reduced; core covered; plant stabilized for “cooldown” narrative.

---

## PWR-E07 — PORV Stuck Open (Small-Break LOCA)

### Failure
`stuck_porv_open` — close_porv overridden; PORV remains open.

### Symptoms
- Pressure falling; inventory loss  
- Subcooling eroding  
- PZR level may **rise** (void surge) while inventory falls  
- PORV OPEN alarm **only if indicator agrees**  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Diagnose on **subcooling**, pressure, inventory — not PORV light alone |
| 2 | Command PORV **Close** (may fail) |
| 3 | **PORV Block Valve → Isolate** (CONFIRM?) — stops the leak |
| 4 | Ensure **HPI** running; **do not throttle** for high PZR level |
| 5 | SCRAM if required |
| 6 | Restore pressure/inventory/subcooling |

### Acceptance
Block valve isolated; inventory trend stabilized; core covered; melted false.

### Key teaching
This is the recovery **missed at TMI**. See **PWR-X01**.

---

## PWR-E08 — PORV Indicator Stuck Closed

### Failure
`porv_indicator_stuck_closed` — indicator forced closed regardless of true valve.

### Symptoms
- PORV OPEN alarm may be **absent** while valve open (if combined with E07)  
- Board looks “normal” on the light  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Treat PORV light as **untrusted** |
| 2 | Use subcooling, tailpipe temperature, pressure, inventory |
| 3 | If leak signature present → isolate block valve (**E07** steps) |
| 4 | In Learning mode, dual Indicated/Actual may reveal the lie — practice without it in Realistic |

### Acceptance
Operator does not use the light as sole truth.

---

## PWR-E09 — Large LOCA (Cold-Leg Break)

### Failure
`large_loca` — large primary leak; severity break size % (default ~20 %, max 50 %).

### Symptoms
- Rapid depressurization  
- Inventory collapse; voids  
- HPI, accumulators as pressure falls  
- SCRAM on low pressure / level  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Verify SCRAM |
| 2 | Verify **HPI On** (manual if needed) — leave on |
| 3 | Confirm accumulators discharge when pressure low enough |
| 4 | Secondary heat sink for residual heat if available |
| 5 | Do not secure ECCS on misleading level |

### Acceptance
Core cooling maximized; damage avoided if injection timely. Large breaks are severe — success = covered core / no melt when systems work.

---

## PWR-E10 — Loss of Condenser Vacuum

### Failure
`loss_of_condenser_vacuum` — vacuum decay.

### Symptoms
- COND VAC LO → COND VAC TRIP  
- Turbine trip at vacuum trip setpoint  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Reduce load early if vacuum falling |
| 2 | Verify turbine trip when required |
| 3 | Control reactor (SCRAM if heatup/pressure) |
| 4 | Steam dump may be limited without vacuum — watch SG pressure |
| 5 | AFW / heat sink management |

### Acceptance
Turbine protected; reactor stable shutdown or matched state.

---

## PWR-E11 — Degraded HPI

### Failure
`degraded_hpi` — reduced HPI capacity (severity slider: capacity %; lower capacity = worse).

### Symptoms
- During LOCA/low pressure, injection flow less than expected  
- Subcooling/inventory recover slowly or not at all  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Verify HPI demand On |
| 2 | Isolate break if possible (PORV block, etc.) to reduce required injection |
| 3 | Depressurize only as strategy requires — match pump curve (more flow at low P) |
| 4 | Maximize secondary heat removal to reduce primary boil-off |
| 5 | Watch fuel status / subcooling |

### Acceptance
Best achievable cooling; isolate break; avoid melt if capacity allows.

---

## PWR-E12 — Auxiliary Feedwater Failure

### Failure
`afw_failure` — AFW delivery blocked (pumps may still indicate running).

### Symptoms
- After LOFW or low SG level, level does **not** recover despite AFW Start  
- Run lights may lie about delivery  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Verify main feed status; attempt main feed if failure allows |
| 2 | SCRAM (minimize heat) |
| 3 | Confirm AFW **failure** by **level not rising** |
| 4 | Use any remaining heat sink path (steam dump / residual feed) |
| 5 | Primary feed-and-bleed class thinking: HPI + PORV path only as last resort training concept |

### Acceptance
Core protected if any heat sink restored; recognize dual failure severity.

---

## PWR-E13 — Failure to Scram (ATWS)

### Failure
`failure_to_scram` — scram command blocked.

### Symptoms
- SCRAM commanded or trip condition but rods do not fully insert / power remains  
- Board may show attempt without collapse  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Attempt manual SCRAM again (may still fail) |
| 2 | **Emergency boration** (CVCS Borate, charging On) — max rate |
| 3 | Insert rods manually if any motion possible |
| 4 | Reduce turbine load carefully or trip turbine per power/heat sink strategy |
| 5 | Maintain feed/AFW — ATWS + dry SG is catastrophic  
| 6 | Lower power by heat-up / MTC if plant allows while borating |

### Acceptance
Power driven down; core cooled; eventually subcritical. Stuck-rod partial ATWS see **E18**.

---

## PWR-E14 — Pressurizer Spray Stuck Open

### Failure
`stuck_open_spray` — spray forced open.

### Symptoms
- Pressure falling despite heaters  
- Spray indication open  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Attempt spray close / AUTO (may fail) |
| 2 | Energize heaters max |
| 3 | If pressure approaches trip/HPI, SCRAM as required |
| 4 | Stop RCP only if procedure/drill requires (spray needs flow — stopping RCP reduces spray effectiveness but loses forced flow) — prefer pressure recovery without at-power RCP stop |
| 5 | HPI if pressure LO-LO path |

### Acceptance
Pressure stabilized or plant safely tripped and controlled.

---

## PWR-E15 — Pressurizer Heaters Failed

### Failure
`failed_pzr_heaters` — heater power forced off.

### Symptoms
- Cannot raise pressure with heaters  
- Slow pressure decay / inability to recover from spray or cooldown  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Secure spray  
| 2 | Reduce cooldown / match load and power to stop pressure bleed  
| 3 | Use inventory strategy carefully (insurge)  
| 4 | SCRAM if subcooling threatened and unrecoverable  
| 5 | HPI if pressure collapses  

### Acceptance
Subcooling maintained or safe shutdown on HPI/heat sink.

---

## PWR-E16 — SG Overfeed / Overcooling

### Failure
`sg_overfeed` — feed forced high (~120 % pump speed class).

### Symptoms
- SG level rising hard (SG LVL HI)  
- Primary Tavg falling; power may rise (MTC)  
- Shrink/swell confusion  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Attempt feed reduce / MANUAL take-over (may be overridden by failure) |
| 2 | SCRAM if power/Tavg excursion severe |
| 3 | Reduce turbine steam demand carefully if overcooling-driven power rise  
| 4 | When failure cleared, restore normal feed AUTO  

### Acceptance
Level returned to band; primary temperature controlled; no trip if recoverable, else safe trip.

---

## PWR-E17 — Continuous Rod Withdrawal

### Failure
`continuous_rod_withdrawal` — runaway outward motion; severity steps/s.

### Symptoms
- Rods withdrawing uncommanded  
- SUR high; power rising  
- Possible HI FLUX / trip  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Attempt **Lower** (hold) to insert against the runaway  
| 2 | **SCRAM** immediately if motion continues  
| 3 | After trip, verify rods in (unless E18)  
| 4 | Stabilize heat sink  

### Acceptance
Power terminated; scram successful or ATWS path if combined.

---

## PWR-E18 — Control Rod Stuck on Scram

### Failure
`stuck_rod_on_scram` — portion of rod worth held out; severity % worth held.

### Symptoms
- After SCRAM, power not as low as expected  
- Partial rod insertion indication  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Verify scram signal present  
| 2 | Emergency borate  
| 3 | Maintain heat sink aggressively  
| 4 | Treat residual power as ATWS-lite  
| 5 | Do not assume “scrammed = zero heat”  

### Acceptance
Power reduced by boron/feedback; core cooled; damage avoided.

---

## PWR-E19 — Main Steam Line Break

### Failure
`steam_line_break` — break **downstream** of the MSIV (turbine hall); severity break size %.  
`steam_line_break_upstream` — break **upstream** of the MSIV (between generator and valve);
same severity scale.

**The location decides whether you can end it.** The MSIV sits between the steam generator and
the turbine. A break downstream of the valve is on the far side of it, so shutting the MSIV puts
steel between the generator and the break and the blowdown **stops**. A break upstream is on the
generator side, where no isolation this plant owns can reach it — it blows the generator down
whatever you shut. A multi-loop plant answers a steam line break by isolating the faulted
generator and steaming the intact ones; **this plant has one generator**, so against an upstream
break there is nothing to fall back on. Trip, and ride the cooldown out.

### Symptoms
- Steam pressure falling; severe overcooling  
- Tavg drop → reactivity add → power rise possible  
- MSIV SHUT annunciates if you isolate (turbine trips with it)  
- DNB / core-exit boiling risk at power in model  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | **SCRAM**  
| 2 | **MSIV Close** (two-press). **Downstream break: this terminates it** — steam pressure stops falling and the bottled generator re-pressurizes to its code safeties (1350 psi (9.31 MPa) lift / 9.0 reseat), and you are now in the bottled-SG condition of alarm card **PWR-A23**. **Upstream break: it will not help** — steam pressure keeps falling; do not wait on it  
| 3 | Stop AFW/feed overfill into faulted path if level high  
| 4 | Control pressure (spray/heaters) as primary cools  
| 5 | Borate if return-to-power risk  
| 6 | Stabilize intact heat sink — after a successful isolation the generator is bottled and dry-heading toward the low-level trip; feed it (AFW) and control pressure per **PWR-A23**  

### Acceptance
Break isolated (downstream) or effects mitigated (upstream); reactor shut down; core cooled
without melt.

> **Model honesty.** There is **no automatic safety injection on low steam-line pressure** in
> this plant, and none is needed — the scrammed core holds more than 9,600 pcm subcritical
> through a full blowdown even with the maximum stuck rod, so there is no return-to-power to
> borate against. Real plants carry the interlock; here it would inject into an intact primary
> with nothing to make up. Pressurized thermal shock — a cold, deeply subcooled primary held at
> full pressure — is a genuine concern this model does **not** represent.

---

## PWR-E20 — Tavg Sensor Drifting

### Failure
`tavg_sensor_failure` — instrument drift on Tavg.

### Symptoms
- Tavg disagrees with Thot/Tcold average story  
- Rod AUTO (Tavg) may drive rods wrongly  
- Tavg-based alarms/trips can misbehave  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Place **Rod control AUTO → MAN**  
| 2 | Control on power, Thot/Tcold, pressure, not drifted Tavg alone  
| 3 | Expect protection that reads Tavg instrument to be **fooled** (HR1)  
| 4 | Stabilize plant manually  
| 5 | Clear failure when drill ends  

### Acceptance
No rod run from bad AUTO; plant stable on diverse indications.

---

## PWR-E21 — Pressurizer Level Sensor Stuck

### Failure
`pzr_level_sensor_stuck` — level instrument frozen.

### Symptoms
- PZR level indication not moving while charging/letdown or transient should move it  
- CVCS AUTO may wrong-charge  
- Operator can under/over fill real inventory  

### Immediate actions

| Step | Action |
|------|--------|
| 1 | CVCS inventory → **MANUAL**  
| 2 | Control inventory using pressure, subcooling, charging/letdown flows, power history  
| 3 | Do not trust stuck level for HPI throttle decisions  
| 4 | In Learning/overlay, compare truth if teaching — Realistic: diverse only  

### Acceptance
No LOCA-style HPI throttle error; inventory managed.

---

## PWR-E22 — Pressurizer Level Sensor Failed Low

### Failure
`pzr_level_sensor_low` — the level channel fails and reads a fixed LOW value (~20 %)
regardless of true level.

### Symptoms
- PZR level pinned low while pressure, Tavg, and charging history say otherwise  
- CVCS AUTO charges hard trying to "restore" level that is not actually low  
- PZR LVL LO / LO LO alarms with no supporting evidence on any other channel  

### The teaching point
The **PI-8 going-solid trip (97 %) reads this same single channel** — with the sensor
failed low, that backstop is **defeated**. An overfill driven by the wrong-charging CVCS
(or by an over-eager operator) can now take the pressurizer solid with no automatic
protection: the first hard evidence is pressure spiking against the sprays and the PORV.
One failed sensor removes the very protection sized for the error it causes.

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Cross-check: pressure + subcooling + charging/letdown totals vs the level reading |
| 2 | CVCS inventory → **MANUAL** — stop the auto-charge chasing a phantom low level |
| 3 | Manage inventory on the diverse evidence (pressure response to heaters/spray is the honest level-proxy) |
| 4 | Treat the 97 % high-level trip as **inoperable** — do not lean on it while the channel is failed |

### Acceptance
No solid-pressurizer event; inventory managed on diverse indications.

---

## PWR-E23 — Reactor Coolant Pump Seal Leak

### Failure
`rcp_seal_leak` — a small containment-side primary leak; severity is the **leak rate as a
percentage of make-up capacity** (default 40 %, max 100 %). Unlike every other leak in this
chapter, **every setting of this slider is inside what charging can replace.**

### Why this one is different
E06 (SGTR) and E09 (Large LOCA) are casualties: they outrun make-up, force a trip and drive an
EOP. This one does not. Charging simply comes up and holds it, indefinitely, and the plant will
sit there losing coolant to containment for as long as you let it. It is the everyday leak the
chemical and volume control system exists to make up — and the one that teaches you to read the
board rather than react to it.

It is also **not ΔP-modulated**. An SGTR stops when you depressurize to steam-generator pressure;
this one does not care what the primary is at. You do not terminate it from the control room.

### Symptoms
- **CHG FLOW HI (A30)** — the cue, and usually the only alarm you get
- Charging flow steady and high; letdown unchanged
- Pressurizer level a per cent or two below program, and *stable* there — not falling
- **No** reactor trip, no ESF actuation, no subcooling loss
- At low severity, no alarm at all — only an elevated charging trend

### What the board will NOT tell you
**PZR LVL LO does not come in.** It is set at 25 % and a held leak parks level around 52–54 %.
If you are waiting for a level alarm to tell you there is a leak, you will wait for the whole
shift. Likewise **PZR LVL DEV LO (A31) stays clear** — the deviation only opens when make-up
*stops* holding, so its silence here is information, not the absence of a problem.

### Immediate actions

| Step | Action |
|------|--------|
| 1 | Confirm the make-up is real: charging high with letdown normal, level at or just below program, subcooling healthy |
| 2 | Rule out the impostors — letdown isolated or throttled, or a deliberate level-setpoint change, produce the same alarm |
| 3 | Locate it: containment sump level and humidity, pressurizer relief tank pressure/temperature (a weeping PORV or safety), steam generator activity (a tube leak is **E06** territory) |
| 4 | Trend the charging demand at steady load. Flat = a stable leak you can plan around; rising = it is growing |
| 5 | Plan a shutdown on your own terms rather than waiting for make-up to lose it |

### If it grows past make-up
**PZR LVL DEV LO (A31)** comes in, charging saturates, and level starts a genuine descent. That
is no longer this procedure — go to the loss-of-coolant response and be ready for safety
injection at **PZR LVL LO LO (12 %)**.

### Acceptance
Leak identified and its size trended, with the plant still in a stable, alarm-quiet condition —
no trip, no ESF, and the decision to shut down made deliberately rather than forced.

---

## 4.0 Combined: TMI-class stuck PORV + lying indicator

| Step | Action |
|------|--------|
| 1 | Inject or encounter `stuck_porv_open` + `porv_indicator_stuck_closed` |
| 2 | Expect: pressure ↓, subcooling ↓, PZR level ↑, PORV light closed |
| 3 | **Isolate block valve**; keep HPI |
| 4 | Full narrative: **PWR-X01** |

---

## 5.0 Post-event recovery checklist

| # | Check |
|---|--------|
| 1 | Reactivity: subcritical / rods in |
| 2 | Heat sink: SG level held (feed or AFW) |
| 3 | RCS inventory: stable or improving |
| 4 | Subcooling: positive and improving |
| 5 | Pressure: controlled; relief paths isolated if leaking |
| 6 | ESF: intentional AUTO/MAN state |
| 7 | Failures: cleared or documented still active |
| 8 | Alarms: understood, not merely silenced |

---

## 6.0 Related documents

- `06_ALARM_RESPONSE.md`  
- `08_ACCIDENT_TMI.md`  
- `05_MODE_TRANSITIONS.md` (T06 post-trip)  
- `09_SETPOINTS_LIMITS.md`

> **Single-loop note (SGTR):** this plant has ONE steam generator, so the classic multi-loop strategy — isolate the faulted SG and steam the intact ones — does not exist here. The EOP is to **depressurize the primary to SG pressure**, which stops the tube leak (it is driven by the pressure difference), then cool down to RHR. **Radiological note:** the SG you are steaming through the dump *is* the contaminated one — in a real plant this is a monitored, minimized release path; multi-loop plants avoid it entirely by steaming their intact generators.
