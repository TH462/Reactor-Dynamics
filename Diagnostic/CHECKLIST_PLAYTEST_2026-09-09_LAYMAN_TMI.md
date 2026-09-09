> **Record, not policy.** The FIRST layman playthrough of the TMI-2 incident walkthrough
> (`pwr_tmi2_incident`, #670 Phase 3), run 2026-09-09 on `develop` at `69d54999` in
> `C:\grok_build\Reactor_Dynamics`, headless Edge, 1600x1000, one leg, **16 of 16 steps
> completed** in about 55 minutes. Ten stuck points: the PORV block valve's phantom confirm
> (blocking, ~11 of the 55 minutes); step 5's story saying the pressurizer level is climbing
> while the board shows it falling; ECCS FLOW reading 0 GPM with the pump running; "HPI" in two
> done-whens and nowhere on the board; step 6 quoting 1972 psi against a panel row printing
> 1715; step 2 saying "watched pressure climb" after the spike is over; the story clock running
> backwards between steps 9 and 10; a completion card quoting a core uncovery and a fuel
> temperature the board never showed; the 600x speed hints; and the TRIP BLOCKS panel sitting
> over the board until pressed again. This is the reviewer's record of what it experienced. It
> is not a work order and it is not policy — the `**Measured:**` and `**Verdict:**` lines added
> under each `S-n` are.
>
> **What the verification pass REFUTED, with the numbers.**
> **(1) The block valve does not need the pointer to re-enter the symbol.** The reviewer's own
> eight-trial re-measure said a second press is swallowed unless the mouse leaves and returns;
> measured headless with the shell's `handleCommand` instrumented, ten clicks 0.4 s apart with
> the pointer never moving produced **ten commands**, alternating `close_block_valve` /
> `open_block_valve` — SHUT OPEN SHUT OPEN SHUT OPEN SHUT OPEN SHUT OPEN — and the same two
> presses with a move away and back behave identically. There is no confirm and no re-entry
> gate: the symbol is a plain toggle, so the step's "then confirm" was telling the player to
> **undo** the one correct move of the morning. The defect is real and larger than filed; the
> cause attached to it is wrong.
> **(2) WARP was never refused.** "Every time I did, `#warpInfo` came back WARP dropped to 60x
> within a second or two" and "the plant never once granted it". Measured with one 600x press
> per window on the full stack: step 10 held WARP for **3350 of 3900 sim-seconds (85.9 %)** with
> **one** drop, at t = 3828 s; step 14 held it for **3720 of 3720 s (100 %)** with **zero**
> drops, achieved 2217x; step 15 held 948 of 3600 s (26.3 %) with one drop. The drop reasons the
> reviewer quoted are real ("pressure moving 42 psi/s", "48 psi/s", against the
> `RAPID_P_MPA_PER_S = 0.28` threshold — 40.6 psi/s), but they fired once per window, not
> continuously. Step 14 — the step it spent 6.5 real minutes on at 60x — takes 600x for its
> whole hour.
> **(3) The reactor vessel is not drawn full for the whole accident.** The graphic reads
> `50*(1 - core_uncovered_frac) + 50*(1 - primary_void_fraction)` (#516 item 6) and falls from
> 100 to **2.9** by step 12. At step 8, which is the screenshot the claim cites, core uncovery is
> **exactly 0.0 %** and coolant inventory has fallen 95.7 % -> 93.9 % — so a full vessel is the
> correct picture there, and the observation is right for a reason the reviewer could not see.
>
> **And one thing the pass found that nobody claimed.** The completion card's "the fuel reached
> 1297 °F" is the **full-power** fuel temperature. It came from a whole-ride maximum of
> `fuel_temp_c` on a walkthrough that starts at 100 % power, so the peak it found was t = 0:
> measured **1298 °F on line before the trip**, against a post-trip maximum of **1130 °F**
> (clad 1126 °F) at t = 13,772 s while injection refloods the core. Uncovering 94 % of this
> core never gets the fuel as hot as running it. The 94 % half stands (measured 94.3 %, coolant
> inventory bottoming at 7.4 %).

# Layman playthrough — `pwr_tmi2_incident`

Build tag on screen: **Alpha 1.7.4-rc5 · TEST BUILD** (matches the stated commit c6601740).
Page: `file:///C:/grok_build/Reactor_Dynamics/ui/shell.html?engine=pwr2`, headless Edge, 1600×1000.
Wall time: about 55 minutes. Persona: intelligent layman — I know what a pump and a valve are.

---

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| `pwr_tmi2_incident` — "TMI-2, 28 March 1979 — the first four hours, as the crew lived them" | **Finished** — panel showed "Walkthrough complete" | **16 of 16** | Step 14's block valve: the step says "click … then confirm", there is **no confirm prompt anywhere on screen**, and ten presses over ~5 minutes produced no visible change. I only knew it had worked because PRIMARY PRESSURE finally started to climb. |

Closing text: *"Injection restored, forced circulation back and the relief line isolated. At its worst the core was 94 % uncovered and the fuel reached 1297 °F; the real one went far past that, and this plant stops short of it by design."*

Everything else in the leg was clean. Fourteen of the sixteen steps satisfied themselves within
seconds of doing the obvious thing. The story text is genuinely good and I finished the run
understanding the accident.

---

## 2. Stuck points, ranked

### S-1 — Step 14, the PORV block valve. No confirm prompt, no readable valve state. (severity: blocking)

**Quoted step text:**
> "14. Close the PORV block valve: click the block valve symbol above the relief valve, then confirm."
> "○ PRIMARY PRESSURE above 750 psi  ○ PORV tailpipe temperature below 400 °F"
> "Use PORV Block Valve: PRIMARY PRESSURE rising above 750 psi and the tailpipe temperature falling"

**What I did.** I found two symbols near the words "PORV CLOSED". Hovering told me which was
which — the scanner line read *"Power-Operated Relief Valve (PORV) Block Valve — Motor-operated
isolation valve upstream of the PORV. Normally open."* — so I clicked that one (shots
`c39_blockclick1`, `c39` full board `c43_full_after_click`). Nothing on screen changed that I
could see: no dialog, no "press again to confirm" text, no label, no change to the words
"PORV CLOSED", and the green ring around the symbol was already there because the walkthrough
highlights the control. I clicked again ("then confirm"). Still nothing. I watched PRIMARY
PRESSURE for 30 s — flat at 588 psi (`c42`). I clicked twice 0.4 s apart (`c48`). I clicked once
and watched 40 s (`c49`). I clicked "CLICK TO EXPAND" on the scanner, which is where I finally
found the sentence **"Two-press confirm on isolate."** (`c50_expand`) — that sentence is not in
the walkthrough and not on the board unless you expand the scanner. I kept clicking. After roughly
ten presses spread over five minutes the valve did shut; the only way I knew was that PRIMARY
PRESSURE started rising (588 → 590 → 634 → …). Total time on this one step: **~11 minutes** of the
55, of which ~6 were legitimate waiting for 750 psi.

Afterwards I characterised it deliberately (8 controlled trials, `c67`): a press registers
**only if the pointer has re-entered the symbol since the last press**. Press, then press again
without moving the mouse off it, and the second press is silently swallowed — which is exactly
what the word "confirm" tells a player to do.

**What would have unstuck me:** a visible armed state with words on it — the TRIP BLOCKS panel
already does this ("RELEASING THIS WILL TRIP THE REACTOR NOW — the setpoint is crossed. Press
again to confirm."), and the block valve needs the same, plus an OPEN/SHUT label beside the
symbol.


**Measured:** headless Edge on `ui/shell.html?engine=pwr2&dev=1`, the service's `handleCommand`
wrapped so every board command is recorded. ONE click on the symbol emits `close_block_valve` and
`control_state.porv_block_open` goes `false`; a SECOND click emits `open_block_valve` and it goes
`true` again. Ten clicks 0.4 s apart with the pointer never leaving the symbol: ten commands,
SHUT OPEN SHUT OPEN SHUT OPEN SHUT OPEN SHUT OPEN. Two presses with a real mouse move away and
back between them: identical to two presses without one. No armed state is drawn — the tile's
text content is empty before and after the press and its markup changes by 8 bytes (the valve
pose). Source: `ui/diagram/board/components/comp_valve_vertical.js:115` emits
`onControl('toggle', st.openFrac < 0.5 ? 1 : 0)` with no arm; the only two-press confirms on this
board are SCRAM (`pwr_board.js` paintScram) and a TRIP BLOCKS release that would trip the plant
(#598 item 15). Geometry from `pwr_board_data.js`: the block valve is at (825, 230) 40x40 and the
PORV at (905, 185) 30x65 — left of it and slightly BELOW, not above.
**Verdict:** confirmed, and worse than filed — a player who does what "then confirm" says reopens
the valve. The reviewer's own re-measure (a press registers only after the pointer re-enters) is
**refuted**: the with-move and without-move legs are identical. The scanner sentence that seemed
to corroborate it, "Two-press confirm on isolate." in `pwr_board_inspect.js`, is also false and
was the only place a player could read it. Fixed: the step now says one click and names the
symbol's real position; the inspect card now says "One click shuts it; a second click opens it
again"; `board_check.html` gained three checks pinning both directions (injection-verified — forcing
the toggle to always close reddens the second-click check and nothing else).

### S-2 — Step 5's story and the board disagree about which way the pressurizer level is going. (severity: high — it is the teaching point)

**Quoted step text:**
> "THEY KNEW  Pressurizer level was climbing fast at the same time, which their training said meant the system was filling."
> "5. Verify safety injection has started by itself: the ECCS card shows the high-pressure pump running."

**What I did.** I read the step, looked at PRESSURIZER LEVEL, and it read **42 %** — down from
81 % two steps earlier and 74 % one step earlier (`c10_step5`). The alarm list was headed by
"Pressurizer Pressure Very Low". So the one gauge the whole story is about was *falling* at the
moment the text told me it was "climbing fast". It does start climbing about a minute later
(46 % and rising by step 6, 100 % by step 8), but at the instant I was reading step 5 the board
flatly contradicted the text, and I nearly concluded I had broken something.

**What would have unstuck me:** hold step 5 until the level is actually rising, or say "level is
about to start climbing — watch it" instead of "was climbing fast".


**Measured:** full-stack replay of the leg (`ProceduresHarness` on `pwr2`, `hot_full_power`, seed
42, 10x, 1 s/tick). PRESSURIZER LEVEL at step 5's first tick (t = 81.5 s): **43.1 %**, and still
falling — minimum **40.0 % at t = 97.5 s**, 16 s into the step. Back through 43 % at +29 s,
**71.3 % at +90 s**, pegged at >= 99 % at t = 200 s (step 7). At step 2's end it reads 80.1 % and
at step 3's 75.4 %, so the reviewer's 81 % / 74 % / 42 % readings are all reproduced exactly.
**Verdict:** confirmed. The crew's "climbing fast" is history and is about four minutes early on
this plant. Fixed: step 5 carries a note giving the three numbers and saying the climb starts a
minute later.

### S-3 — Step 5 says the high-pressure pump is running; the ECCS card reads `ECCS FLOW 0 GPM`. (severity: high)

**Quoted step text:**
> "5. Verify safety injection has started by itself: the ECCS card shows the high-pressure pump running."
> "✓ When HPI is injecting"

**What I did.** I looked at the card labelled ECCS. It read `AUTO` / `START` lit, `MODE HHSI`,
`DISCG 1389 psi` — and, in the box immediately left of it, **`ECCS FLOW 0 GPM`** (`c10_step5`).
The step was already ticked, so I pressed on, but "the pump is running" and "flow 0" is not a
thing a layman can reconcile. (By step 6 it read 27 GPM.) Nothing told me that a pump can run at
zero flow because the plant pressure is still up at its discharge pressure.

**What would have unstuck me:** one clause — "flow stays near zero until pressure falls below the
pump's discharge pressure" — or a done-when that waits for flow.


**Measured:** same replay. `hpi_active` latches at **t = 63.5 s at 1658 psia** (step 4), and the
flow instrument reads **exactly 0** for the next 23 s. It first goes non-zero at **t = 86.5 s,
1393 psia** — the pump's own discharge head, which the ECCS card prints as `DISCG 1389 psi`. By
t = 89.5 s (1369 psia) it is flowing.
**Verdict:** confirmed as a text gap, refuted as a plant defect. The pump is deadheaded against a
plant still above its shutoff head, and the board publishes both numbers on the same card without
saying they are the same fact. Fixed: step 5's note says so and points at DISCG.

### S-4 — "HPI" is on the tick-line and nowhere on the board. (severity: medium)

**Quoted step text:**
> "✓ When HPI is injecting" (step 5) and "○ When HPI is not injecting" (step 7)

**What I did.** I searched the board for "HPI". It is not there. The card says `ECCS`, the mode
says `HHSI`, the alarm says "Safety Injection Actuated (emergency core cooling)", the scanner
says "Emergency Core Cooling System (ECCS)". Four names for the thing, none of them the one in
the done-when. I guessed it meant the ECCS card because the step's prose said so.

**What would have unstuck me:** write the done-when in the board's own words — "when the ECCS
card shows injection".


**Measured:** against the BUILT pool (`RD.MANUAL_PROCEDURES.pwr2`), "HPI" appears in this leg only
as a highlight id (`hl: ['ECCS', 'HPI/LPI']`) and in no player-facing string. The done-when text
comes from `PRED_DISPLAY.hpi_active = { bool: 'HPI is injecting' }` in `ui/app.js`. The board
carries `ECCS` (card), `HHSI` (mode), "Safety Injection Actuated" (alarm) and "Emergency Core
Cooling System (ECCS)" (inspect card) — four names, none of them HPI.
**Verdict:** confirmed. Fixed: the label is now `ECCS injection is running`, which also gives
step 7's negative form ("ECCS injection is not running") through `fmtPredicate`'s " is " -> " is
not " replace rather than its `not:` fallback.

### S-5 — Step 6 quotes a pressure that is not the pressure on the panel it sends you to. (severity: medium)

**Quoted step text:**
> "The block is a request, not a switch. If pressure climbs back above 1972 psi the plant takes it away again."
> "The block is a permissive: the plant allows it only below 1972 psi…"

**What I did.** I opened TRIP BLOCKS as instructed and the row I was told to press reads
**"SI REACTOR TRIP · REACTOR TRIP · 1715 psi (P-11 PERMISSIVE) · ALSO BLOCKS SI ACTUATION"**
(`c12_tripblocks`). The row above it says 1775 psi. 1972 appears nowhere. I pressed BLOCK anyway
and it worked, but I spent a while hunting for 1972 assuming I was on the wrong row.

**What would have unstuck me:** use the number the panel prints, or say "the row will say 1715 psi;
the permissive that grants the block clears at 1972 psi".


**Measured:** the row prints `rps_state.trip_block_status.si_trip.setpoint`, read off a live
snapshot as **11.8245 MPa = 1715 psia / 1700 psig** — the pressure at which the safety-injection
reactor trip fires. 1972 psi is **13.596 MPa, the P-11 permissive** that decides whether the plant
will accept the block at all; the row prints the words "(P-11 PERMISSIVE)" and never that number
(`si_trip.permissive` is published as `null`).
**Verdict:** narrowed. Both numbers are correct and they are different quantities; nothing on the
step or the row said so, and a player hunting for 1972 on that panel will never find it. Fixed:
step 6's `why` now names both and says which the row prints.

### S-6 — Step 2 tells me to watch pressure climb while the board shows it falling. (severity: medium)

**Quoted step text:**
> "THEY DID  They took the turbine trip and watched pressure climb."
> "2. Verify the turbine has tripped and the steam generators are drying out…"

**What I did.** By the time the step's own condition (SG level below 55 %) was met, PRIMARY
PRESSURE read **2124 psi with a down-arrow** and the alarm panel carried "Pressurizer Pressure
Low" (`c07_step2wait`). The pressure spike the sentence refers to had already happened and gone —
step 3 later tells me it peaked near 2255 psi. As a layman reading step 2 with the board in front
of me, "watched pressure climb" reads as an instruction I have failed.

**What would have unstuck me:** "pressure spiked to about 2255 psi a few seconds ago and is now
falling again — you have missed it, that is the point of the next step."


**Measured:** same replay. PRIMARY PRESSURE peaks at **2339 psia at t = 5.5 s** (the relief valve
lifting) and reads **2095 psia and falling at t = 35 s**, where step 2's acceptance is graded —
244 psi below the peak, 30 s after it. The reviewer's 2124 psi with a down arrow is the same
moment a little later.
**Verdict:** confirmed. Fixed: step 2 carries a note giving both numbers and saying the spike is
already over.

### S-7 — The story clock runs backwards between step 9 and step 10. (severity: low)

Step 9 header: "Step 9 of 16 · **04:10:37**". Step 10 header: "Step 10 of 16 · **04:08:37**".
I noticed, assumed I had mis-read, checked, and lost confidence in the clock for the rest of the
run. (It is presumably faithful to the real timeline — the AFW valves were found at 8 minutes —
but nothing on screen says so.)


**Measured:** the built pool's `story.clock` values, in step order: 04:00, 04:00:37, 04:00:45,
04:01:07, 04:02:39, 04:03:50, 04:05:07, 04:06:28, **04:10:37, 04:08:37**, 05:13:37, ... Each clock
is correct for the event it names (App. II.1 E56, the first pump high-vibration alarm at 10
minutes; E49/E50, the auxiliary-feed discovery at 8) and the pair is in the wrong order once the
steps are sequenced for teaching.
**Verdict:** confirmed. Fixed: step 9 now takes the saturation cue's own clock (E42, 04:06:27,
rounded to step 8's 04:06:28 — one second apart in the source and two readings of the same
instant) and names E56 in its `saw` as arriving four minutes later. The steps are NOT reordered:
`test/manual_ui_map.js`'s STEP_UI table is positional, and moving the saturation reveal to after a
65-minute ride would wreck the teaching order. A new check in `run_checklist_pwr2` asserts an
incident leg's clocks never decrease (injection-verified: restoring 04:10:37 reddens it and names
the pair).

### S-8 — The end screen quotes two numbers the board never showed me. (severity: low)

> "At its worst the core was 94 % uncovered and the fuel reached 1297 °F"

There is no core-water-level indication and no fuel temperature anywhere on the board, and the
reactor vessel on the diagram is drawn **completely full of green water** for the whole accident
(`c21_pre8`), including at the moment step 8 tells me "the pressurizer fills as the core loses
water". So the single most important physical fact of the story is asserted twice in prose and
never shown. Step 7 does say "this plant carries no water-level instrument in the reactor vessel
and neither did that one", which covers the instrument — but not the picture, which actively
shows a full vessel.


**Measured:** three separate claims, three different answers.
(a) **The vessel graphic IS a core level.** `reactorVessel.coreInv` in `pwr_board_wiring.js` is
`50*(1 - core_uncovered_frac) + 50*(1 - primary_void_fraction)` since #516 item 6. Over the ride
it runs 100 -> **2.9** (step 12) -> 90.9 (step 16). "Drawn full for the whole accident" is
**refuted**.
(b) **At step 8 it is correctly full.** Measured across that step: `core_uncovered_frac` exactly
**0.0**, coolant inventory 95.7 % -> 93.9 %, `coreInv` 91.3 -> 90.4. The core is not uncovered at
four and a half minutes; the plant is losing mass, not covering. Uncovery reaches 50 % at
t = 2120 s, 90 % at t = 3039 s and peaks at **94.3 %** at t = 6157 s, inventory bottoming at
**7.4 %** — so the completion card's "94 % uncovered" stands.
(c) **"the fuel reached 1297 °F" is the FULL-POWER fuel temperature.** Whole-ride maximum of
`fuel_temp_c` is **1298 °F at t = 0**, with the plant on line at 100 %; the post-trip maximum is
**1130 °F** (clad 1126 °F) at t = 13,772 s, during the reflood at step 15. The figure was a
whole-ride max taken on a walkthrough that begins at full power.
**Verdict:** narrowed on the picture (the graphic does show uncovery; step 8 is not the place to
see it), and one NEW confirmed defect nobody claimed — the fuel-temperature number. Fixed: step 8
carries a note saying the full vessel is correct here and when it empties; the outcome and step
16's `why` now give 1130 °F against 1298 °F on line, which is a truer statement of the
declared model gap than the old sentence was.

### S-9 — The ⏩ speed advice does not survive contact with the plant. (severity: low)

Steps 10, 14 and 15 all say "set the speed control to 600× (WARP…)". Every time I did, `#warpInfo`
came back **"WARP dropped to 60× — pressure moving 55 psi/s"** within a second or two. The status
line is excellent — it always told me exactly why — but the step promising 600× and the plant
never once granting it made step 14's "About 62 plant-minutes" take **6.5 real minutes** of
watching a number crawl. The step's own fallback ("press Ack All … or use 60×") is the real answer
and could be the primary advice.


**Measured:** the leg replayed with `configurePacing({ warp: true })` and ONE 600x press at each
window's start — what the hint tells the player to do — recording `metadata.speed_snap` and the
sim time spent on the WARP tier.
| step | requested | landed | WARP held | drops | achieved |
|---|---|---|---|---|---|
| 10 | 600x | 600x | **3350 / 3900 s (85.9 %)** | 1, at t = 3828 s ("pressure moving 42 psi/s") | 292x |
| 14 | 600x | 600x | **3720 / 3720 s (100 %)** | 0 | 2217x |
| 15 | 600x | 600x | 948 / 3600 s (26.3 %) | 1, at t = 12,951 s ("pressure moving 48 psi/s") | 182x |
The threshold is `RAPID_P_MPA_PER_S = 0.28` in `simulation_service.js` — 40.6 psi/s over the
watch's span.
**Verdict:** refuted. The plant granted 600x on all three windows and never refused one; step 14,
the step the reviewer spent 6.5 real minutes on at 60x, holds WARP for its entire hour. What is
true is that a single drop arrives per busy window and the reviewer read the first one as a
standing refusal. The hints are correct and are NOT changed; steps 10, 14 and 15 gained a clause
saying a drop is expected and that pressing 600x again resumes.

### S-10 — The TRIP BLOCKS panel stays open on top of the board. (severity: cosmetic)

After step 6 it covered ROD CONTROL and part of REACTOR POWER / AVG COOLANT TEMPERATURE for the
next four steps until I worked out that pressing TRIP BLOCKS again closes it (`c21_pre8` shows the
obstruction).


**Measured:** `toggleTripBlocks` in `pwr_board_wiring.js` opens the popover and closes it only on
a second press of the TRIP BLOCKS button (`if (pop) { closePop(); return; }`). There is no
outside-click handler and no close control on the popover.
**Verdict:** confirmed (cosmetic). Fixed by wording, not by the board: step 6's note now says the
panel stays open until TRIP BLOCKS is pressed again.

---

## 3. Per-step log

Format: step / first sentence · what I did · time & Continue · did I understand *why* the crew did it.

**Step 1 of 16 · 04:00 — "Verify the plant is at full power: REACTOR POWER near 100 % with the TURBINE-GENERATOR carrying load."**
Nothing to do. Board: REACTOR POWER 99.8 %, TURBINE-GENERATOR OUTPUT 100 MW. Continue was already
`ready` when the step drew. Shot `c05_started`.
Confusion: none. The pre-amble under the buttons — "One protection channel is out of service before
this begins: the reactor trip that fires when the turbine trips" — is a good, honest warning, though
I had to take "protection channel" on trust.
*Why:* yes — the crew were doing routine maintenance on a condensate polisher and had no reason to
think anything was wrong. The board even has a `CONDENSATE POLISHER / IN SERVICE` box, which made
the story concrete.

**Step 2 of 16 · 04:00:37 — "Verify the turbine has tripped and the steam generators are drying out: TURBINE TRIP lit, STEAM GENERATOR LEVEL falling below 55 %."**
Waited at 1×. Satisfied after ~20 s wall (SG level 65 → 54 %). Continue lit. Shot `c07_step2wait`.
Confusion: **S-6** — "watched pressure climb" against a falling 2124 psi and a "Pressurizer Pressure
Low" alarm. Also I could not find a light literally labelled "TURBINE TRIP"; there is a `TRIP`
button on the TURBINE-GENERATOR card that goes bright, plus an alarm "Turbine Trip / Low Steam
Demand". Close enough on the second look.
*Why:* yes — the polisher work knocked out the condensate pumps, which took the feed pumps, which
took the turbine. The chain is spelled out.

**Step 3 of 16 · 04:00:45 — "Verify the reactor has tripped: REACTOR POWER collapsing and the REACTOR TRIP alarm in."**
Nothing to do; already ✓ on arrival. Board: `SCRAMMED / TRIP SIGNAL STANDING`, power 3.3 %.
Shot `c08_step3`.
Confusion: the alarm is not called "REACTOR TRIP"; it is **"Reactor Trip — Ot Delta T"**, and
"Ot Delta T" means nothing to me. The step's closing note is the best thing in the whole
walkthrough, though — it says plainly that the real plant tripped on high pressure at 8 seconds
and this one trips on over-temperature at ~53 seconds, and why. That kind of "here is where the
model differs" note is exactly what I needed.
*Why:* yes.

**Step 4 of 16 · 04:01:07 — "Verify the relief valve reading: the PORV light beside the pressurizer reads CLOSED, and the temperature under it is above 240 °F and climbing."**
Read the board: `PORV CLOSED` with `482 F` under it. Already ✓. Shot `c09_step4`.
Confusion: none — and this step *fixed* a confusion I already had, because at step 2 I had seen
"PORV CLOSED" and thought the story about a relief valve opening was wrong. The note ("The light
shows what the valve was told to do, not what the disc did… That one reading is the whole accident,
and it was on the board the entire time") is the single best sentence in the leg. One nit: it says
"A seated relief valve leaves that pipe near 180 °F" and at step 1 that pipe read **122 °F**.
*Why:* yes — completely. This is where I understood the accident.

**Step 5 of 16 · 04:02:39 — "Verify safety injection has started by itself: the ECCS card shows the high-pressure pump running."**
Read the ECCS card; already ✓. Shot `c10_step5`.
Confusion: **S-2** (level falling, not climbing), **S-3** (`ECCS FLOW 0 GPM`), **S-4** ("HPI").
*Why:* yes — pressure fell through a setpoint and the plant injected water by itself, which is
correct because the plant is leaking. The note saying "What comes next is the crew taking it away"
set up the next step well.

**Step 6 of 16 · 04:03:50 — "Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the SI REACTOR TRIP row."**
Found the `TRIP BLOCKS` button on the ROD CONTROL card (it carries a small badge "2"), clicked it,
got a four-row panel, clicked BLOCK on the `SI REACTOR TRIP` row. Ticked instantly. Shots
`c12_tripblocks`, `c14_blocked`.
Confusion: **S-5** (1972 psi vs the panel's 1715 psi). "SI" is never expanded — I inferred Safety
Injection from the "Safety Injection Actuated" alarm. "(P-11 PERMISSIVE)" is on the row and is
never explained anywhere.
*Why:* yes — they wanted to stop the plant putting water in, so first they had to stop it doing it
automatically. The line "Nothing on the board says the core has just been put on the operator
alone" landed.

**Step 7 of 16 · 04:05:07 — "Press STOP on the ECCS card to shut the high-pressure injection down."**
Clicked `STOP` on the ECCS card. Ticked immediately. Shot `c16_eccsstop`.
Confusion: "255 inches and rising" — the board is in per cent, not inches, so I could not check
that number. Otherwise clean.
*Why:* **yes, and this is the step that taught me the accident.** "The level was rising because the
water was boiling: steam under the pressurizer pushes water up into it, so the level goes up while
the plant empties" plus "a solid pressurizer is the thing to avoid at all costs" is a complete
explanation of why a competent crew did the wrong thing. The `the crew's action, as taken — not a
recommendation` tag mattered here — without it I would have thought I was being taught procedure.

**Step 8 of 16 · 04:06:28 — "Verify PRESSURIZER LEVEL has gone to the top of its scale and is sitting there."**
Waited at 1×; ~15 s wall to 100 %. Board: PZR 100 %, SUBCOOLING MARGIN `-0 F`, SG level 0 %.
Shot `c21_pre8`.
Confusion: **S-8** — the reactor vessel on the diagram is drawn full of water while the text says
"the plant empties". Also SUBCOOLING MARGIN reading `-0 F` looks like a typo until you realise it
means "exactly at boiling".
*Why:* yes.

**Step 9 of 16 · 04:10:37 — "Verify SUBCOOLING MARGIN has reached zero and the pump cavitation alarm is in."**
Both conditions already ✓ on arrival. Shot `c21_step9`.
Confusion: the story says "high-vibration alarm"; the alarm on the board is
**"Reactor Coolant Pump Cavitation"**. I worked it out because the note explains that the pumps are
"pushing a froth of steam and water, which is what the vibration is" — but the two words should
match. "Cavitation" itself is explained by that sentence, which was enough for me.
*Why:* yes — and this is the second big lesson: the pumps were telling them there was steam in the
system and nobody read it that way.

**Step 10 of 16 · 04:08:37 — "Open the auxiliary feedwater block valves: click the valve symbol on the AFW line."**
Looked for a valve symbol near the box labelled `AFW / FLOW 0 GPM / DISCG 0 psi`. There is one
directly above it; hovering gave *"Auxiliary Feedwater (AFW) Block Valve — The AFW discharge valve
— independent of the pump start/stop buttons."* One click opened it: AFW FLOW went 0 → 74 GPM
(`c27_afwopen`). Set 600× as told; it took it at "achieving 470×" then dropped to 60×
("pressure moving 42 psi/s"). SG level was at 36 % almost immediately; total ~10 s wall.
Confusion: **S-7** (clock ran backwards from step 9). The step calls them "valves" plural and there
is one symbol. And I only found the symbol because I had learned to hover things — the step says
"the AFW line" and there is no line labelled AFW.
*Why:* yes — the emergency pumps had been running into shut valves for eight minutes and delivering
nothing. The note is honest that this did not change the outcome, which I appreciated.

**Step 11 of 16 · 05:13:37 — "Press OFF on the reactor coolant pumps to secure them."**
The first tick (PZR below 80 %) was already green. Hovered the small `OFF` button beside
`RCP FLOW`, scanner said "OFF (RCP) — Stops the reactor coolant pump", clicked it. The cavitation
alarm cleared and both ticks went green within ~3 s. Shot `c32_rcpoff`.
Confusion: the story talks about "loop B pumps" and "loop A pumps"; the board has **one** switch,
which the note explains ("This board carries one handswitch"). Good.
*Why:* yes — the pumps were shaking themselves apart pumping steam. The sting is in the note: it
was the right answer to the pump problem and it also removed the last thing stirring the core.

**Step 12 of 16 · 05:41:37 — "Verify PRESSURIZER LEVEL is falling: below 50 % and still going down."**
Set 60× as told. Level fell 67 % → 49 % over ~72 s wall. Continue lit. Shot `c34_step12wait`.
Confusion: none.
*Why:* yes — "the gauge that read full for 48 minutes is falling now, and nothing has been put
right" is a good, chilling line.

**Step 13 of 16 · 06:11:37 — "Verify SUBCOOLING MARGIN is pegged on the bottom of its scale at -50 °F."**
Already ✓ on arrival (board read `-50 F`). Shot `c35_step13`.
Confusion: none. The note explaining that the real plant's cue was a hot leg going off-scale, and
that this plant's detector cannot reproduce it, is another good "here is the difference" note.
*Why:* yes.

**Step 14 of 16 · 06:18:37 — "Close the PORV block valve: click the block valve symbol above the relief valve, then confirm."**
See **S-1**. ~10 presses over ~5 minutes, then ~6.5 minutes at 60× waiting for 750 psi
(588 → 783 psi). Both ticks green; tailpipe fell to 122 °F. Shots `c39_blockclick1`,
`c43_full_after_click`, `c50_expand`, `c58_pre15`.
Confusion: **S-1**, **S-9**. Also "above the relief valve" — the block valve symbol is to the
**left and slightly below** the PORV symbol on the diagram, so the word "above" sent me to the
wrong one first. Hovering saved me.
*Why:* yes — and this is the emotional centre of the story. A man who had just walked in, with no
stake in the last two hours, asked why one pipe was hotter than the others and fixed it in a
minute. The note says it takes 2 h 18 min to arrive, which is the point.

**Step 15 of 16 · 07:20:37 — "Press START on the ECCS card to put high-pressure injection back in."**
Clicked `START` on the ECCS card. Set 600× (accepted at 470×, then dropped to 60×). SUBCOOLING
MARGIN went -1 → 4 → **18 °F** in under 10 s wall. Continue lit. Shot `c60_step15done`.
Confusion: "the borated water tank alarmed low" — there is no such tank anywhere on the board, so
that part of the story is prose only. The instruction "Watch SUBCOOLING MARGIN, not the pressure"
was genuinely useful, because pressure was doing something confusing at the same time.
*Why:* yes — the crew put injection back but rationed it because they thought they were running out
of water.

**Step 16 of 16 · 19:50:37 — "Press ON for the reactor coolant pumps to restore forced circulation."**
Hovered the `ON` button beside `RCP FLOW` ("ON (RCP) — Starts the reactor coolant pump"), clicked.
Ticked within ~4 s. Shot `c62_step16done`.
Confusion: the clock jumps from 07:20 to **19:50** with no comment; the story says "Nearly sixteen
hours in" so I worked it out, but the two are hard to line up.
*Why:* yes. And the note is the right way to end — it says outright that core damage, containment
radiation and the hydrogen burn are not modelled, and tells them instead of faking them.

**Complete** — "Injection restored, forced circulation back and the relief line isolated…"
Shot `c63_end`.

### Things I had to do that the text never said
1. **Press the block valve far more than "twice", with the mouse leaving the symbol between
   presses** (S-1). The only place the two-press rule is written is inside the *expanded* scanner
   ("Two-press confirm on isolate"), which the step never points at.
2. **Hover controls to find them.** Steps 10, 14 and 16 name controls ("the valve symbol on the AFW
   line", "the block valve symbol above the relief valve", "ON for the reactor coolant pumps") that
   carry no visible text label. The scanner strip at the bottom is what made them findable, and no
   step mentions the scanner exists.
3. **Close the TRIP BLOCKS panel** by pressing TRIP BLOCKS again, to see the board underneath.
4. **Ignore the "set the speed control to 600×" advice** and accept 60×, because WARP was refused
   every time (S-9).

---

## 4. Words and numbers I could not find on the board

| The walkthrough said | What is actually on the board |
|---|---|
| "✓ When **HPI** is injecting" (steps 5, 7) | No "HPI" anywhere. The card is `ECCS`; its mode reads `HHSI`; the alarm reads "Safety Injection Actuated (emergency core cooling)"; the scanner says "Emergency Core Cooling System (ECCS)" |
| "the **ECCS** card shows the high-pressure pump running" (step 5) | `ECCS FLOW **0** GPM` at that instant, with `MODE HHSI` and `DISCG 1389 psi` |
| "**SI** actuation blocked", "the **SI REACTOR TRIP** row" (step 6) | The row exists and says `SI REACTOR TRIP`; "SI" is never expanded to Safety Injection anywhere |
| "the plant allows it only below **1972 psi**" (step 6) | That row reads `REACTOR TRIP · **1715** psi (P-11 PERMISSIVE)`; the row above reads `1775 psi`. 1972 is nowhere |
| "**(P-11 PERMISSIVE)**" (on the panel, referenced by the step) | Printed on two rows, explained nowhere |
| "the **REACTOR TRIP** alarm in" (step 3) | The alarm is `Reactor Trip — **Ot Delta T**` |
| "the first reactor coolant pump **high-vibration** alarm" (step 9) | The alarm is `Reactor Coolant Pump **Cavitation**` |
| "level indicator went off the top of its scale, past **400 inches**"; "**255 inches** and rising" (steps 7, 8) | `PRESSURIZER LEVEL` is in **per cent** (0–100). No inches scale anywhere |
| "the **loop B** pumps … the **loop A** pumps 28 minutes later" (step 11) | One `OFF`/`ON` pair beside `RCP FLOW`. No loop A/B labels (the step's note does say so) |
| "The **loop A hot leg** read off the top of its scale" (step 13) | Two unlabelled temperatures on the loop piping (`568 F` / `527 F`); nothing named "hot leg" |
| "the **tank** the injection water comes from had alarmed low" (step 15) | No borated-water tank on the board |
| "A seated relief valve leaves that pipe near **180 °F**" (step 4) | At full power in step 1 that pipe read **122 °F** |
| "the core was **94 % uncovered** and the fuel reached **1297 °F**" (completion) | No core water level and no fuel temperature anywhere; the reactor vessel is drawn full of water throughout |
| "**TURBINE TRIP** lit" (step 2) | A `TRIP` button on the `TURBINE-GENERATOR` card that brightens, plus a `Turbine Trip / Low Steam Demand` alarm |
| "click the valve symbol on the **AFW line**" (step 10) | Nothing labelled "AFW line"; there is an `AFW` box and an unlabelled valve symbol above it |
| "**PORV**" (steps 4, 14) | The board says `PORV`; the story says "relief valve". Bridged only by step 4's wording and the scanner |
| "**TMI-2**" (title) | Expanded to "Three Mile Island" only in step 3's note, five screens in |

**Measured (the whole table), and the verdicts.**
- **"A seated relief valve leaves that pipe near 180 °F"** — measured on the shipped plant at
  100 % power with the valve seated: **122 °F**, exactly what the reviewer read. The same wrong
  180 °F was in the tailpipe's inspect card. **Confirmed**; both fixed to 120 °F.
- **"SI" never expanded, "(P-11 PERMISSIVE)" explained nowhere** — **confirmed** against the
  built pool and the row's `sub` line; step 6's `why` now expands both.
- **"click the valve symbol on the AFW line"** — `pwr_board_data.js`: the AFW block valve is at
  (1120, 425) and the AFW card at (1120, 485), i.e. directly above it, and nothing is labelled
  "AFW line". **Confirmed**; the step now says "directly above the AFW card" and its note says
  one symbol serves the crew's two valves.
- **"TMI-2" in the title** — **confirmed**; the title now reads "Three Mile Island Unit 2".
- **"HPI", "ECCS FLOW 0", "1972 psi"** — see S-4, S-3, S-5.
- **"255 inches", "400 inches", "loop A/loop B", "the loop A hot leg", "the tank the injection
  water comes from", "high-vibration"** — every one of these is inside a `story` block, which the
  panel draws under CLOCK / THE CREW SAW / THEY KNEW / THEY DID and which is the historical
  record, not an instruction about this board. **Refuted as board defects**, kept as record. Step
  9's `why` now names the board's own words (Reactor Coolant Pump Cavitation) beside the
  historical "vibration".
- **"TURBINE TRIP lit" (step 2)** and **"Reactor Trip - Ot Delta T" (step 3)** — **confirmed** and
  NOT fixed in this wave. No board item is engraved TURBINE TRIP; the TURBINE-GENERATOR card's
  TRIP button brightens and the alarm reads "Turbine Trip / Low Steam Demand". "Ot Delta T" is
  the alarm's own industry label (overtemperature delta-T) and renaming it reaches every leg, not
  just this one. Both are second-pass items.
- **A pre-existing red found while gating this** — `run_inspect` was at **55/56 on HEAD** against a
  56/56 baseline: the ECCS STOP button's inspect card cited `08_accident_tmi §5.5`, a section the
  #670 Phase 2 rewrite of that chapter deleted. Repointed to §3.2, "What they did".


---

## 5. What the text got right

- Step 4's note — "The light shows what the valve was told to do, not what the disc did, and this
  valve carries no position indicator" — turns a contradiction I had already noticed into the point
  of the whole story.
- Every step where this plant differs from the real one says so explicitly and gives both numbers
  (steps 3, 11, 13, 14, 16). I never had to wonder whether the sim was broken or the history was.
- The `the crew's action, as taken — not a recommendation` tag on steps 6, 7 and 11. Without it I
  would have learned the wrong lesson from the actions I was being asked to take.
- Step 7's explanation of *why* level rises while the plant empties, in plain words, with the
  "solid pressurizer" training bias attached. This is the one paragraph the walkthrough exists for
  and it works.
- The three-line CLOCK / THE CREW SAW / THEY KNEW / THEY DID block is short enough to actually read
  every time and separates fact from what they believed.
- `#warpInfo` always said why speed was refused ("WARP dropped to 60× — pressure moving 55 psi/s"),
  so I never guessed.
- The hover scanner names and explains every control I could not identify, including
  "independent of the pump start/stop buttons" for the AFW valve, which is precisely the thing
  step 10 is about.
- Steps 15 and 16's notes say plainly what the crew did *next* that this walkthrough does not make
  me do (stopped the pump again 17 minutes later), so I did not mistake the sim's tidy ending for
  history.
- The closing card admits what is not modelled — core damage, containment radiation, the hydrogen
  burn — rather than pretending.

---

## 6. The story, as I understood it after playing

At four in the morning the plant was running at full power and two men were unblocking a filter in
the basement. That work tripped the pumps that feed water to the steam generators, and with no
feedwater the steam generators stopped taking heat out of the reactor. The turbine tripped, the
pressure in the reactor system spiked, and a relief valve on top of the pressurizer opened to let
the pressure off — all of which was normal. Then the reactor tripped. What was not normal is that
the relief valve did not shut again when it was told to; the light on the panel went out because
the *signal* to the valve was removed, and there is no instrument that says where the valve
actually is, so for two and a quarter hours the plant quietly leaked its coolant out of a hole
nobody knew was open, with the only clue being a discharge pipe running hundreds of degrees hotter
than it should. The plant noticed the falling pressure and started the emergency pumps by itself,
which was exactly right. But at the same time the pressurizer level gauge was climbing to the top
of its scale, and the crew had been trained that a pressurizer full of water is the worst thing
that can happen, so they blocked the automatic injection and shut the pumps off. The trap is that
the level gauge was lying by telling the truth: the water in the reactor was boiling, and steam
forming underneath was pushing water up into the pressurizer, so the one gauge they had for "how
much water is in the plant" read *full* precisely because the plant was emptying. There was no
gauge for the water level in the reactor vessel itself — not on this plant and not on that one.
Everything after that follows: the coolant lost its margin to boiling, the main pumps started
shaking because they were churning froth instead of water and had to be shut down, and with them
off there was nothing left circulating. It ended when a supervisor who had just arrived ignored the
level gauge, looked at the pipe temperatures instead, decided the relief valve was leaking and
ordered the block valve upstream of it shut. Pressure started coming back within minutes. Even then
they did not know the core had been uncovered and damaged, and would not for another day.
