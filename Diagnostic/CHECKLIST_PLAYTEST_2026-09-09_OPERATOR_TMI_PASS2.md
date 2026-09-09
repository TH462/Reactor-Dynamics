# TMI-2 incident walkthrough — operator play-test (pass 2)

> **Record, not policy.** The SECOND, confirming operator pass over `pwr_tmi2_incident`, run
> 2026-09-09 by a fresh-context agent with no repo access against `develop` at `f1063d8a`
> (Alpha 1.7.4-rc7). **One leg of one, completed — 16 of 16 steps, "Walkthrough complete".**
> It got stuck nowhere it could not recover: a 175-plant-minute step 14 it nearly abandoned, a
> Continue on step 16 that lit and went dark again, and a step-8 green outline drawn on the
> wrong tile. **The good news is confirmed:** every one of its diagram-symbol clicks landed on
> target, nothing in the leg was unfindable, and the TRIP BLOCKS overlay defect fixed at
> `f1063d8a` has held — `verify_e2e_ui`'s hit-test gate is green on this tree.
>
> **What the verification pass changed, with the numbers.**
> **S-3, S-4, S-7, S-8 and S-10 reproduced exactly.** **S-6's diagnosis is REFUTED**: the WARP
> refusal's `psi/s` is not a warped-frame figure — `spanS` in
> `simulation_service._warpWatch` is PLANT seconds. It is an instantaneous rate over one 0.5 s
> WARP step against a 40.6 psi/s (0.28 MPa/s) threshold, which is why every refusal reads just
> above 41; the observation stands and the line now names its window. **S-1's cause is
> replaced**: the "About 62 plant-minutes" is this step's `hold` — the REPLAY HARNESS'S DWELL,
> printed to the player as a prediction since #628. Measured full-stack on two routes, step 14's
> cue is met in **3.1 plant-minutes** (641 → 993 psi), so the 62 is wrong in the other direction
> too and the 175 did not reproduce. **S-2 did not reproduce**: on both measured routes
> `pump_flow_pct` at first-met is **89.7 %** and climbs monotonically to 99.2 with no boundary
> crossing — and the shipped gate passes step 16 at **99.76 %**, nowhere near the 80 % edge, so
> it could never have seen this. **S-5 is confirmed and narrowed**: the recovery is real but it
> is not the pumps' 40 seconds — at the instant the step accepts, subcooling is **0.0 °F** and
> the pressurizer **5 %**; ticked on it reaches **+42 °F and 30 %** over about **29
> plant-minutes**.
>
> **Two sweeps went wider than the report.** The SI brackets are 18 rendered sites across FOUR
> walkthroughs, not the 3 seen — and `run_style`'s `checklist_no_si` was green throughout
> because it walks the pool's AUTHORED strings while `fmtPredValue` in `ui/app.js` COMPOSES the
> SI at render time from a numeric `v`. And "lit on the TRIP BLOCKS panel" is **7 live sites**,
> for a state the panel has never had.
>
> The body below is the reviewer's own text, unedited. A refuted claim stays in it: the record
> is what the player experienced.


**Build under test, as printed in the header:** `Reactor⚛️Dynamics  Alpha 1.7.4-rc7  TEST BUILD`.
Matches the tag I was given. Page title reads `[TEST] Reactor⚛️Dynamics — Control Room`.

**Persona:** licensed reactor operator, first time on this board. No repo access; everything below
comes from the walkthrough panel, the board, the SCANNER hover line and the alarm list.

**Leg:** `pwr_tmi2_incident` — listed as *"Three Mile Island Unit 2, 28 March 1979 — the first four
hours, as the crew lived them · starts at Hot Full Power (Mode 1)"*, seventh and last in the
Walkthroughs list.

---

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| `pwr_tmi2_incident` | **Complete — "Walkthrough complete"** | **16 of 16** | Step 14 is the leg. Its own ⏩ line budgets *"About 62 plant-minutes at 1×"*; it took me **175 plant-minutes**, ~90 of them on a pressure plateau **6–13 psi short** of the acceptance with nothing on screen saying whether waiting longer would work. |

Plant clock at the close: **T+05:21:59**. Final board: PRIMARY PRESSURE 867 psi, SUBCOOLING MARGIN
−1 °F, PRESSURIZER LEVEL 0 %, STEAM GENERATOR LEVEL 38 %, RCP FLOW 80 %, PORV tailpipe 122 °F,
8 standing alarms.

The content is the strongest thing here. Every step names its control in words that are on the
board, the target card is outlined in green while the step is live, and the walkthrough repeatedly
pre-empts the exact board reading that would otherwise look like a bug. My stuck points are almost
all about *pacing and thresholds*, not about finding things.

Screenshots referenced below are in `shots/`.

---

## 2. Stuck points, ranked

### S-1 — Step 14: a 62-minute step that took 175 plant-minutes, ~90 of them on a plateau
**Quoted:**
> `14. Close the PORV block valve: one click on the small valve symbol just left of the PORV.`
> `○ PRIMARY PRESSURE above 750 psi`
> `○ PORV tailpipe temperature below 400 °F`
> `⏩ About 62 plant-minutes at 1× — set the speed control to 600× … Shutting this valve is what
> turns pressure round, so this is the fastest pressure moves all run and WARP will refuse it or
> drop out of it — the line under the speed bar names the rate. Use 60×.`
> `… pressure turns upward within 2 plant-minutes and the discharge pipe starts cooling.`

**What I did.** Clicked the block valve once at T+01:33:34 (588 psi). Pressure did turn upward
within seconds — 588 → 592 psi — exactly as promised. The tailpipe cue met at ~T+02:47. Then:

| plant clock | PRIMARY PRESSURE | rise since previous |
|---|---|---|
| T+01:33 | 588 psi | — (valve just shut) |
| T+02:10 | 663 psi | ~2.0 psi/plant-min |
| T+02:47 | 688 psi | 0.68 psi/plant-min |
| T+02:58 | 734 psi | (a 60× burst) |
| T+03:19 | 737 psi | 0.14 psi/plant-min |
| T+04:20 | 744 psi | **0.11 psi/plant-min** |
| T+04:28 | **869 psi** | **+125 psi in 8 plant-minutes — step checks off** |

For roughly 90 plant-minutes the gauge sat between 734 and 744 psi against a `> 750 psi`
acceptance, rising about a tenth of a psi a minute and *decelerating*. As the operator I had no way
to tell "slow but converging" from "this will never get there": the acceptance is a bare number, the
⏩ estimate was already 2× exceeded, and nothing on the panel shows a trend against the target. I
came within one keystroke of calling the leg broken. Then it stepped 125 psi in eight minutes and
ticked. `shots/47_step14_long.png`, `shots/48_step14_long2.png`.

**What would have unstuck me:** the ⏩ line should carry the real distribution (it does for step 15:
*"measured between 30 plant-minutes and 70"*) and warn that pressure crawls for an hour before the
last 100 psi arrive quickly.

**Measured:** `test/run_checklist_pwr2.js pwr_tmi2_incident` (25/25) plus two purpose-built
full-stack player-route harnesses (`RD.SimulationService`, pwr2, `hot_full_power`, accel 60, the
step's `inject`/`cmd` issued and the step advanced the instant its acceptances read true — the
replay's fixed `hold` is not the player's route). **Route A (advance on acceptance): step 14 met
in 3.1 plant-minutes, 634 → 980 psi. Route B (step 10 held to the 36 % steam-generator level this
reviewer carried out of it): 3.1 plant-minutes, 642 → 994 psi.** The 175 minutes did not
reproduce on either. The "About 62 plant-minutes" is not an estimate of anything: `ui/app.js`
composes it from `st.hold`, and step 14's `hold` is **3720 s** — the dwell
`test/procedures_harness.js` sits on the step so the plant has settled before the next command.

**THAT CAUSE IS NOT NEW AND THIS PASS DID NOT FIND IT.** The operator pass EARLIER THE SAME DAY
established it (`..._OPERATOR_TMI.md` S-6): *"the ⏩ figure is the step's `hold`, which is the
replay's dwell and never a time to the criterion."* It fixed steps 12 and 13 and left the rest,
because that reviewer wrote — in the sentence its verification pass did not re-measure —
*"step 14's 62-minute estimate was the one that was right."* **The contribution here is that
step 14 was the one left behind, and it is out by 20×.** Six steps in this leg print the line
(10, 11, 12, 14, 15, 16 — 13 is suppressed); against route A, **four of the six are out by 2×
or more** (10: 65 stated / 4.4 measured; 12: 30 / 12.9; 14: 62 / 3.1; 16: 7 / 0.2) and step 11
is out 1.8× the other way (28 / 50.8). Step 15 is the exception — the earlier pass replaced its
number with a measured 30-to-70 range, which is the one this reviewer singled out as right.

**Verdict:** narrowed — the observation stands and the cause is replaced. The step is not slow
by 2.8×; its printed duration is a gate fixture wearing a prediction's clothes, and the true
spread runs from 3 plant-minutes to the 175 seen here depending on inventory carried in. Fixed:
`wait_est_s: false` drops the span and keeps the speed rung, and the step now gives the cue and
the shape instead of a number.

---

### S-2 — Step 16: Continue lights, then goes dark again; the threshold sits exactly where the plant settles
**Quoted:**
> `16. Press ON for the reactor coolant pumps to restore forced circulation.`
> `○ When RCP FLOW > 80 %`

**What I did.** Pressed ON. RCP FLOW went 0 % → 7 % → 90 % in about 40 s and Continue lit at
T+05:20:29 — exactly as the text says. By the time I reached for it, it was **disabled again**;
Playwright reported `element is not enabled` on a button that had been `ready` seconds earlier.
Polling the board every 2.5 s, RCP FLOW then read **exactly `80 %` on eight consecutive samples**
while Continue read `dark, dark, dark, dark, dark, dark, dark, LIT`. The acceptance is `> 80 %` and
the plant settles on 80 %, so the button chatters on the boundary. It took 77 s of wall-clock
polling to catch a lit instant and press it.

**What would have unstuck me:** either a latching acceptance ("this has been true once"), or a
threshold that is not the value the plant settles at — `> 75 %` would have ticked and stayed.

**Measured:** both player-route harnesses, ticking on past the first-met instant and logging
the graded value and the `rcs_flow` instrument every ten broadcasts for 300 broadcasts (~30
plant-minutes). **At first-met, `pump_flow_pct` reads 89.69 % (route A) / 89.6 % (route B); it
rises monotonically to 99.2 % and never returns below 80 %.** No boundary crossing, no chatter,
on either route. Separately, the shipped gate `run_checklist_pwr2` passes this step at
**`pump_flow_pct` 99.76 %** — the replay holds the step for its full 400 s, so it stands nowhere
near the 80 % edge and could not have seen this whatever the plant did. The acceptance grades on
the `rcs_flow` instrument (`PARAM_INSTRUMENT.pwr2`), which is the elbow-tap dP flow
(`pump_flow_pct / sqrt(densityRatio)`), so a heavily voided restart genuinely can settle lower
than a clean one — which is the state this reviewer reached (pressurizer 0 %, subcooling −8 °F)
and neither harness did.

**Verdict:** narrowed — NOT reproduced. The observation is first-hand and precise (eight
consecutive samples at exactly `80 %`, Continue dark/dark/…/LIT, 77 s of polling), and it is
plant behaviour rather than a text defect: a `>` gate met by a settling value chatters. The
plant state that produces it is not the one either measured route reaches, and the gate that
covers this step cannot see the edge. Left unfixed and filed: the threshold is not moved on an
unreproduced reading.

---

### S-3 — Step 8: the walkthrough outlined the wrong tile
**Quoted:**
> `8. Verify PRESSURIZER LEVEL has gone to the top of its scale and is sitting there.`
> `✓ When PRESSURIZER LEVEL ≥ 99 %`

**What I did.** Looked for the green outline the walkthrough had used on every previous step to
point at the control. It was drawn around **PRIMARY PRESSURE (1049 psi)** — the tile immediately to
the *left* of PRESSURIZER LEVEL, which was reading 100 % and was not highlighted. Confirmed on the
screenshot and in the DOM (the single element carrying the step-glow class contained the text
`PRIMARY PRESSURE 1049 psi`). `shots/25_step8.png`.

On a step whose whole teaching point is *which gauge is lying*, pointing at the wrong gauge is worse
than pointing at nothing. I read the words and ignored the box.

**What would have unstuck me:** glow the tile the step names.

**Measured:** driven live in headless Edge to step 8 (`?engine=pwr2&dev=1`). **The sole
element carrying `.ckl-step-glow` was "PRIMARY PRESSURE 1046 psi" while PRESSURIZER LEVEL read
100 %.** The cause is in the built pool, not the renderer: step 8's `hl` was
`['Plant Pressure']`, which `CONTROL_LABEL_MAP` resolves cleanly — to `ims2immsvn6`, the tile one
place to the left. `run_manual_controls` (590 checks, green) validates that an `hl` label
RESOLVES to a board item; nothing anywhere asserts it resolves to the tile the step's own text
names. The vital-parameter strip has six tiles and the map named four: there was no label for
PRESSURIZER LEVEL to reach for.

**Verdict:** confirmed. Fixed: `hl: ['Pressurizer Level']`, with `'Pressurizer Level'` and
`'Subcooling Margin'` added to `CONTROL_LABEL_MAP` so the vocabulary no longer has the hole that
made the wrong label the only available one.

---

### S-4 — Step 2: the tick fired while the board still read the wrong side of the number
**Quoted:**
> `○ STEAM GENERATOR LEVEL below 55 %`

**What I did.** Watched the tile down through 60, 59, 57, 57, **56** — and at `56 %` the acceptance
flipped to `✓` and Continue lit. An operator checking his own work against the stated criterion sees
a done-when satisfied by a gauge reading 56 against a limit of 55. Same family at step 9, whose
criterion is `SUBCOOLING MARGIN at or below 1 °F` while the tile displays **`-0 F`**.

**What would have unstuck me:** grade against the number the tile displays, or say in the step that
the check reads the instrument behind the rounding.

**Measured:** reproduced exactly, live. Rewound to step 1, pressed Continue and sampled the
STEAM GENERATOR LEVEL tile and the acceptance state together every 100 ms: the tile went
59 → 58 → 57 → **56**, and **the acceptance flipped to ✓ with the tile displaying `56 %`** against
`below 55 %`, at T+00:00:32. The cause is not rounding and not a channel split — both read
`sg_level`. It is the board's INDICATOR DAMPING (#234, `DISPLAY_DAMP` in `pwr_board_wiring.js`):
every dimensioned tile is drawn through a first-order filter, `sg_level` at tau 1.5 s, while the
checklist grades the undamped transmitter, which is HR1-correct. At the ~1.5 %/s fall measured
here that is about two points of lag, and the tile rounds the wrong side of the limit. Same
mechanism behind the `-0 F` note (subcooling_margin, tau 3 s). **This is the earlier operator
pass's S-5 seen from the other side**: there the tile read exactly `50` with a `< 50` check still
OPEN (a slow settle, where rounding is the whole gap and the printed `≤` was the other half);
here the tile reads `56` with a `< 55` check CLOSED, because on a fast fall the damping adds
about two points on top of the rounding. One mechanism, two directions, and only the fast case
puts the tile a whole point on the wrong side. Swept the whole pool: **58
acceptances across all seven walkthroughs grade on a damped channel**, but the lag is
rate×tau, so it is only visible on a fast transient — the heatup, cooldown and power ramps move
too slowly to show it.

**Verdict:** confirmed as an observation, cause replaced. It is not fixable by moving the
threshold: the lag is proportional to rate, so any limit crossed on a ramp is crossed with the
tile behind it. Both halves are deliberate and correct in isolation — the panel damping was
asked for, and the grader reading the transmitter is HR1. **Filed for the owner rather than
fixed**: closing it means either grading on the drawn value or accepting the disagreement.

---

### S-5 — Step 16's closing text describes a recovery the board does not show
**Quoted:**
> `Forced flow returns within 40 seconds and the margin and the inventory recover with it, which is
> where this plant ends the story.`
> and on completion: `Injection restored, forced circulation back and the relief line isolated.`

**What I did.** Measured across the restart: SUBCOOLING MARGIN **+16 °F → −8 °F**, PRIMARY PRESSURE
**1362 → 882 psi**, PRESSURIZER LEVEL **→ 0 %**, all within ~15 plant-seconds of pressing ON. The
step then checked off *while the margin was negative*. At the completion card the board carried
**8 alarms**, including `Subcooling Lost — Coolant Boiling` (critical, unacknowledged, T+05:20:18),
`Pressurizer Level Very Low` (critical, unacknowledged) and `Pressurizer Level Far Below Program —
make-up has lost it`. `shots/62_complete.png`.

Three of the closing card's factual claims are true (injection running 52 GPM in HHSI, RCP FLOW
80 %, tailpipe back to 122 °F). "The margin and the inventory recover with it" is the one that did
not happen on my run, and it is the sentence that reads as the ending.

**What would have unstuck me:** say that securing and restarting the pumps drops pressure and
re-loses the margin before it recovers, or hold the step until the margin is actually back positive.

**Measured:** both player-route harnesses, ticking on past the acceptance. **At the instant
step 16 accepts: subcooling 0.0 °F, pressurizer level 5.3 %, pressure 1038 psi.** Ticked on for
300 broadcasts: **subcooling +42 °F, pressurizer 29.8 %, pressure 1435 psi, 7 alarms standing —
over about 29 plant-minutes.** So the recovery is real and the reviewer's board was also real:
the step checks off on the pumps' 40 seconds, half an hour before the sentence describing it
comes true, and on a route that spent more inventory it hands back a negative margin as this one
did (−8 °F, pressurizer 0 %, eight alarms).

**Verdict:** confirmed. The sentence welded the pumps' 40 seconds to the plant's half-hour.
Fixed: the closing text now says the margin and inventory follow but not with it and not at
once, gives the state at check-off and the ~30 plant-minutes, and says to expect standing alarms.

---

### S-6 — The WARP refusal quotes a rate I could not find on any gauge
**Quoted, verbatim, at four separate presses:**
> `WARP dropped to 60× — pressure moving 41 psi/s`
> `WARP dropped to 60× — pressure moving 81 psi/s`
> `WARP dropped to 60× — pressure moving 63 psi/s`
> `WARP dropped to 60× — pressure moving 50 psi/s`
> `WARP dropped to 60× — pressure moving 43 psi/s`

**What I did.** At the "81 psi/s" press (step 12) I had just watched PRIMARY PRESSURE go **667 psi →
648 psi over 2 min 27 s of plant time** — about **0.13 psi/s**. At the "50 psi/s" press (step 14)
the gauge was moving **0.11 psi per plant-minute**. The figure is presumably the rate *in warped
time*, but the line does not say so, and as an operator reading a board where pressure is visibly
crawling, being told it is "moving 50 psi/s" reads as an instrument fault, not an explanation.

**What would have unstuck me:** `pressure moving 0.08 psi/s — too fast for 600× (would be 50 psi/s)`,
or just naming the units as warped.

**Measured:** read at the source and reproduced live. `SimulationService.prototype._warpWatch`
is called with `covered` — `sinceEval`, which its own comment states is "the SIM time this
evaluation covers", the property that makes the protection hold identical at 1× and 3600×. **It
is plant seconds, not warped ones.** What makes the figure unrecognisable is the WINDOW: on WARP
every physics step is one evaluation, so the rate is measured over `WARP_DT` = **0.5 s**, against
`RAPID_P_MPA_PER_S` = **40.6 psi/s (0.28 MPa/s)** — which is why every refusal in this report
reads just above 41. Reproduced live at step 8: pressed 600×, `#warpInfo` went
`WARP 600× · achieving 350× · 0.5 s physics step` and then
`WARP dropped to 60× — pressure moving 41 psi/s`. The board's pressure tile is damped at tau
2.5 s and is read over minutes.

**Verdict:** narrowed and SUPERSEDED — the diagnosis (warped-frame units) is refuted; the
complaint is right. An honest instantaneous half-second rate, quoted against a damped trend
gauge, with no window stated. Fixed in words, not in the guard: the line now reads "pressure
moving N psi/s right now (the gauge is damped and shows the trend)".
**SUPERSEDED, and the fix is kept anyway.** *(OWNER RULING, 2026-09-09: "Warp line as you
recommend." — given on the recommendation of option 3 in #675 §F.)* The speed bar's status line
is to be **REPLACED**, not removed and not merely re-worded: what it says becomes plant time to
completion plus a recommended warp speed, and nothing else. The replacement is owner-ordered work
and lands under **#675**, not here — scoping it into a verification wave would bury a directive
inside a bug-fix commit, and "plant time to completion" on a step whose acceptance is a plant
state rather than a clock needs its own design pass before it can be honest. The fix in this wave
stands because a correct string is a better starting point for a rewrite than a wrong one.


---

### S-7 — `#warpInfo` goes stale and contradicts the speed bar
**What I did.** After the step-12 rewind the speed bar was back on `1×` and the plant was stepping in
real time, while the line under it still read **`WARP dropped to 60× — pressure moving 81 psi/s`**.
It stayed wrong for as long as I left it — I read it three times during the step-11 control hunt with
`1×` lit above it. It only refreshed when I next touched a speed button.

**What would have unstuck me:** clear the line when the speed changes for any reason.

**Measured:** reproduced exactly. At step 8, pressed 600× → `WARP 600× · achieving 350×`,
then the drop to `WARP dropped to 60× — pressure moving 41 psi/s`. Pressed Rewind: **speed bar
`1×`, `#warpInfo` still "WARP dropped to 60× — pressure moving 41 psi/s"**, and still saying it
4 s later. `warpNote` is latched until the player next presses a speed BUTTON (#655), which was
right when a button press was the only way out of a drop; rewind also resets the speed and takes
the plant back past the transient that caused it.

**Verdict:** confirmed and SUPERSEDED. Fixed: the walkthrough's Rewind clears `warpNote` — the
rewind is the player acting on the drop, so the note is spent. This half is worth keeping under
the ruling below whatever the line ends up saying: a status line that survives the thing it
describes is wrong in any wording.
**SUPERSEDED, and the fix is kept anyway.** *(OWNER RULING, 2026-09-09: "Warp line as you
recommend." — given on the recommendation of option 3 in #675 §F.)* The speed bar's status line
is to be **REPLACED**, not removed and not merely re-worded: what it says becomes plant time to
completion plus a recommended warp speed, and nothing else. The replacement is owner-ordered work
and lands under **#675**, not here — scoping it into a verification wave would bury a directive
inside a bug-fix commit, and "plant time to completion" on a step whose acceptance is a plant
state rather than a clock needs its own design pass before it can be honest. The fix in this wave
stands because a correct string is a better starting point for a rewrite than a wrong one.

**An observation for #675 §E, offered and NOT chased.** The owner reports that after 4+ hours of
sim time he could not use time warp at all; that is unmeasured and is a separate job. Nothing
measured here shows the REFUSAL latching with session length — it is recomputed per evaluation
from `|dP/dt|` over one step, and the new-alarm branch is gated on a QUIET board, so a plant that
has been running for hours with alarms standing is *less* likely to be dropped by one, not more.
But the DISPLAY does latch, and that is measured: `warpNote` survived a rewind indefinitely here,
still reading "WARP dropped to 60×" with `1×` lit above it until a speed button was pressed. **A
stale drop line is indistinguishable from warp being unavailable**, and it clears on any speed
press. That is a candidate, not a diagnosis, and it does not explain a refusal that persists
through pressing the buttons.


---

### S-8 — Step 6's acceptance names a state the panel never displays
**Quoted:**
> `Use Trip Blocks: SI REACTOR TRIP lit on the TRIP BLOCKS panel`

**What I did.** Pressed `BLOCK` on the `SI REACTOR TRIP` row. The row did not light — the **button
changed from `BLOCK` to `RELEASE?`** and grew a caption `RELEASING THIS WILL TRIP THE REACTOR NOW —
the setpoint is crossed. Press again to confirm.` Nothing on the panel is "lit". I only knew I had
done it right because the checkbox ticked. `shots/22_si_blocked.png`.

**What would have unstuck me:** *"the SI REACTOR TRIP row's button reads RELEASE?"*.

**Measured:** reproduced exactly on the live board. After pressing BLOCK on the SI REACTOR
TRIP row: **the button text goes `BLOCK` → `RELEASE?`**, its class goes `bd-blocked bd-willtrip`
(`#ff6a4d` on `#3a1010` — the WARNING pair, not the amber `#ffd166` a plain block gets), a
caption appears reading "RELEASING THIS WILL TRIP THE REACTOR NOW", and the row LABEL's computed
colour is unchanged at `rgb(159, 179, 196)`. Nothing lights. Read at the source
(`pwr_board_wiring.js:3149`) the button has exactly three states — `BLOCK`, `BLOCKED`,
`RELEASE?` — and no lamp. This step's pressure permissive is already crossed, so it can only
ever be in the red branch. **Swept the built pool: "lit on the TRIP BLOCKS panel" appears at 7
live sites across 4 walkthroughs** (`pwr_startup` 16/17/18, `pwr_raise_power` step 1 and its
prereq, `pwr_cooldown` step 3, this one).

**Verdict:** confirmed. Fixed here: the target now reads "SI REACTOR TRIP blocked — its button
now reads RELEASE?". The six siblings sit in the amber `BLOCKED` branch by derivation and were
NOT measured, so they are named on #670 rather than rewritten from a reading taken on a
different row.

---

### S-9 — Step 10's control is on the diagram with no label, and the step says "click the valve symbol"
**Quoted:**
> `10. Open the auxiliary feedwater block valves: click the valve symbol directly above the AFW card.`

**What I did.** This one worked, but only because the AFW card was outlined. The valve itself is an
unlabelled 14-pixel symbol on the pipe run; there is no text anywhere near it. Hovering it produced
`Auxiliary Feedwater (AFW) Block Valve — The AFW discharge valve — independent of the pump
start/stop buttons`, which is exactly what I needed — but I had to know to hover. Same at step 14
(`Power-Operated Relief Valve (PORV) Block Valve — Motor-operated isolation valve upstream of the
PORV. Normally open.`).

Two notes on those hover strings: they describe the valve's *normal* state, not its *current* one.
After I shut the PORV block valve the hover still said **"Normally open"**, so the only confirmation
that my click landed was a 4 psi rise on the pressure gauge.

**What would have unstuck me:** one line in the SCANNER giving present position — `OPEN` / `SHUT`.

**Measured:** read at the source. `ui/diagram/board/pwr_board_inspect.js` entries are
`e(title, brief, detail, doc, sec)` — five static strings, with no hook for a live value
anywhere in the contract; `imrppb3kuav`'s brief is "Motor-operated isolation valve upstream of
the PORV. Normally open." That sentence is correct as a statement of the valve's DESIGN
position, which is what the card is for. Giving the SCANNER a present position means adding a
state function to the inspect entry shape and calling it from the render — every entry, one
contract.

**Verdict:** confirmed as a gap, and it is bigger than player-facing text. Filed on #670 as an
enhancement rather than half-done here.

---

### S-10 — The walkthrough carries SI conversions the board does not
Three acceptances print metric in brackets: `> 240 °F (116 °C)`, `≤ -50 °F (-27.78 °C)`,
`> 10 °F (5.56 °C)`. Every gauge on this board is US customary only. `-27.78 °C` is also four
significant figures for a display floor of `-50`. Minor, but it is the only metric text in the
session and it reads as a leftover.

**Measured:** confirmed live, and the sweep is six times the size of the sighting. The exact
string `✓ When PORV tailpipe temperature > 240 °F (116 °C)` was read out of `#cklRun` at step 4.
**The SI is not authored anywhere**: a scan of every string in the built `RD.MANUAL_PROCEDURES.pwr2`
for `MPa|kPa|°C` returns **0 hits**. It is COMPOSED at render time by `fmtPredValue`
(`ui/app.js`), which appended `' (' + siValue + ' ' + siUnit + ')'` for any predicate carrying a
`dim`. Swept the built pool for predicates that reach that path — a dimensioned `acc`/`saw`, a
dimensioned `accs` entry with no `label` to render instead, or a dimensioned `precond`:
**18 sites across 4 of the 7 walkthroughs — heatup 5, startup 3, cooldown 7, TMI-2 3 — six of
them precondition-banner lines.** The reviewer saw exactly the TMI-2 leg's 3 because the panel
draws the done-when on the active step only.

**How it got past the gate:** `run_style`'s `checklist_no_si` exists for precisely this ruling
and was green. It enumerates the pool's AUTHORED string fields — `title`, `purpose`, `outcome`,
`prereq`, `cautions`, `precond.text`, and per step `text`, `note`, `why`, `target`, `wait_hint`,
`story.*`, `accs[].label`, `overtaken` — and every one of them is clean. A source scan of the
authored pool cannot see a string concatenated in a different file at render time. It would also
have PASSED the string if it could see it: `240 °F (116 °C)` is arithmetically correct, and
`run_manual_units` — which does read `ui/manual_procedures.js` — checks that US/SI pairs convert
correctly, not that they are absent.

**Verdict:** confirmed, and it is an OWNER RULING violation (2026-09-06, "DO not include SI"),
not a style nit. Fixed: `fmtPredValue` returns one form, the display units. Gated where the
string exists — in the browser: `verify_ckl_relevance` now starts the heatup at full power (both
preconditions fail, so one render exercises the banner and the criteria line together) and
asserts `#cklRun` carries no `MPa|kPa|°C`. Proven red by injection.

---

### S-11 — Small wording and display snags
- Alarm title renders as **`Reactor Trip — Ot Delta T`**. On a real board that is OTΔT /
  over-temperature delta-T. "Ot Delta T" reads as a typo.
- SUBCOOLING MARGIN displays **`-0 F`** for several minutes around saturation.
- Step 15 ECCS card read **`FLOW 48 GPM / DISCG 0 psi`** — flow with zero discharge pressure. Step 5
  had carefully explained the opposite case (`FLOW 0 GPM` with discharge pressure up), so this
  combination arriving unexplained ten steps later is confusing in the same way.
- The **Plant & Mission window is already open on page load** (`#missionOverlay` covers the board and
  intercepts clicks). I did not have to click `#simStatus` to get to the Walkthroughs list.

**Measured, item by item.**

- **"Reactor Trip — Ot Delta T"** — confirmed, with a wider cause. `TRIP_CAUSE` in `ui/app.js`
  turns `rps_state.last_trip_reason` into the tile's words, and **every key it shipped with is
  the RETIRED engine's `"<instrument> <direction>"` form**. PWR2 does not produce one:
  `control_kernel` takes the cause from `engine.getTripCause()`, which is `pr.trip_cause` — a
  protection-table ID (`pwr2_protection.js`). **All twelve of this plant's causes fell through
  the title-case fallback**, which turns `ot_delta_t` into "Ot Delta T". The same
  inherited-table trap as #546/#557. Fixed: twelve entries in the engine's own words, gated by a
  source scan in `run_checklist_pwr2` (proven red by deleting the `ot_delta_t` key).
- **`-0 F` subcooling** — confirmed, one line. `comp_indicator_panel.js:426` rendered
  `cur.toFixed(st.decimals)`, and `(-0.18).toFixed(0)` is the string `"-0"`. The board's own
  `fmtNum` (`pwr_board_wiring.js:128`) has used `String(Math.round(v))` since it was written and
  its comment names this exact trap — the tile component was four files away doing the cheap
  thing, and nothing compared the two. Fixed; pinned in `board_check.html` and proven red by
  injection (−0.18 and −0.49 both render `-0` on the old code).
- **ECCS `FLOW 48 GPM / DISCG 0 psi`** — not measured. Filed on #670 rather than guessed at.
- **Plant & Mission open on load** — correct behaviour, and against the reviewer's briefing
  rather than the walkthrough. No action.

**Verdict:** two confirmed and fixed, one filed unmeasured, one not a defect.

---

## 3. The runtime controls

### 3.1 `⏪ Rewind step` — used four times; it did what its label says, and more than its label says

The label says "Rewind step". What it actually does is **take the plant and the panel back to the
start of the *previous* step**, and it genuinely rewinds the physics — not just the panel. Every
operator action taken in the abandoned step is undone. That last part is not on the label.

| # | Where | Panel before → after | Plant before → after | Verdict |
|---|---|---|---|---|
| **(a)** early, right after Continue | Step 2 → Step 1 | `Step 2 of 16 · 04:00:37` → `Step 1 of 16 · 04:00` | clock **T+00:01:57 → T+00:00:03**; power **64.3 % → 99.8 %**; pressure **2146 → 2236 psi**; PZR level **81 % → 62 %**; subcooling **28 → 44 °F**; alarms **back to "— no active alarms —"**; turbine trip undone | **Plant really moved back.** Rewind button correctly `disabled` once at step 1. |
| extra | Step 2 → Step 1, to catch the pressure spike the text said I'd missed | same | same restore | Let me re-run the transient and measure the peak (2335 psi). Worked perfectly as an instructional "watch that again". |
| **(c)** mid long wait, at 60× | Step 12 → Step 11 | `Step 12 of 16 · 05:41:37` → `Step 11 of 16 · 05:13:37` | clock **T+01:18:55 → T+01:09:36**; PZR **60 % → 69 %**; pressure **629 → 662 psi**; **the RCP ON button went back to active — my pump securing was undone**; acceptance `the pump cavitation alarm clears` reverted `✓ → ○` | **Correct, and it undid my action** — I had to press RCP OFF again. Speed reset itself **60× → 1×**. `#warpInfo` did **not** reset (S-7). |
| **(b)** at the last step | Step 16 → Step 15 | `Step 16 of 16 · 19:50:37` → `Step 15 of 16 · 07:20:37` | clock **T+06:03:51 → T+04:36:39**; pressure **1465 → 877 psi**; subcooling **+45 → −38 °F**; **ECCS back to `MODE STANDBY`** — my START undone | **Correct.** Speed stayed at **60×** this time, where use (c) reset it to 1×. Inconsistent between the two. |

**The finding that matters for a stuck player:** rewind does **not** let you retry the step you are
stuck on — it puts you at the *start of the step before it*. When I was genuinely stuck on step 14
for 90 plant-minutes, pressing Rewind would have dropped me into step 13 with the block valve
re-opened, discarding 175 plant-minutes and requiring the whole wait again with no reason to expect a
different result. That is why I sat it out instead, and it is why Rewind is not an escape hatch from
a slow acceptance. I tested it at the step-16 boundary instead and confirmed the behaviour.

One oddity: after rewind (b) the RCP FLOW region read **11 %** where the pumps had been off and
reading 0 % at that point on the original pass.

### 3.2 `Continue ▶`

- **Lit on its own, every time**, when the acceptances were satisfied — 16 for 16. Class goes
  `btn ckl-ack wt-continue` → `btn ckl-ack wt-continue ready` and `disabled` clears.
- **Pressing it when not lit does nothing at all.** Tested deliberately at step 2 with
  `○ STEAM GENERATOR LEVEL below 55 %` outstanding: forced a click through Playwright, and the panel
  stayed on `Step 2 of 16 · 04:00:37`, the button stayed `disabled`, and no acceptance changed.
  Correct and unambiguous.
- **It can go back out.** See S-2 — step 16 lit and then re-disabled. So "lit" is a live level check,
  not a latch, and on a fast transient the window can close under your hand.
- Steps that lit **immediately on arrival** (nothing to do): 1, 3, 4, 5, 8, 9, 13.
- Steps that required an action or a wait: 2, 6, 7, 10, 11, 12, 14, 15, 16.

### 3.3 The speed bar and WARP — `#warpInfo` quoted at every press

Resting text, and what it said before I ever touched it:
> `WARP ready — 600× or 3600× for a long quiet ride; a warning or critical alarm drops it to 60×`

| Press | `#warpInfo` before | `#warpInfo` after | Achieved | Notes |
|---|---|---|---|---|
| **600× at step 10** (SG level wait) | `WARP ready — 600× or 3600× for a long quiet ride; a warning or critical alarm drops it to 60×` | t+1.5 s: `WARP 600× · achieving 460× · 0.5 s physics step`<br>t+4.5 s: `WARP 600× · achieving 470× · 0.5 s physics step`<br>t+9.5 s: `WARP dropped to 60× — pressure moving 41 psi/s` | **460–470×** then dropped | 13 alarms were already standing and WARP took it anyway — so the "a warning or critical alarm drops it" clause means a *new* alarm. Carried the plant T+00:07 → T+01:05 in ~10 s of wall time. |
| **1× at step 11** | `WARP dropped to 60× — pressure moving 41 psi/s` | `WARP ready — 600× or 3600× …` | 1× | Line reset correctly here. |
| **600× at step 12** | `WARP ready — 600× or 3600× …` | t+1.2 s: `WARP dropped to 60× — pressure moving 81 psi/s` — and it stayed on that line, unchanged, for the whole step | **refused outright**, ran at 60× | The speed button visibly showed `60×` selected 1.2 s after I pressed `600×`. Measured gauge movement at that moment: 19 psi over 2 min 27 s of plant time. |
| **600× at step 14** | `Dropped to real time — checklist step complete` | t+1.5 s: `WARP dropped to 60× — pressure moving 63 psi/s` | refused, 60× | |
| **60× at step 14** | `WARP dropped to 60× — pressure moving 63 psi/s` | `WARP ready — 600× or 3600× …` | 60× | Picking 60× by hand clears the complaint. |
| **600× at step 14 after `Ack All`** | `WARP ready — 600× or 3600× …` | `WARP dropped to 60× — pressure moving 50 psi/s` | refused, 60× | `Ack All` did **not** help — as the step's own text warns, "pressure or power moving is a rate and only settles with time". Text and behaviour agree. |
| **600× at step 15** | `Dropped to real time — checklist step complete` | t+1.5 s: `WARP 600× · achieving 450× · 0.5 s physics step`<br>t+7.5 s: `WARP dropped to 60× — pressure moving 43 psi/s` | **450×** for ~6 s | Carried T+04:36 → T+05:23 quickly. |

**Speed changing on its own.** Twice, and both times the panel said why at the instant it happened:
- On every step completion the speed dropped to `1×` and the line read exactly
  **`Dropped to real time — checklist step complete`**. Clear, and correct behaviour.
- Mid-wait, `600×` fell to `60×` with **`WARP dropped to 60× — pressure moving <N> psi/s`**.

**Verdict:** the speed bar does what its label promises and `#warpInfo` is genuinely useful — it is
the only control on the page that explains its own refusals. Two defects: the psi/s figure is
un-anchored to anything on a gauge (S-6), and the line goes stale after a rewind (S-7).

### 3.4 Tab switching mid-step — twice, both clean

| | Left the Instructor tab at | Went to | Away for | On return |
|---|---|---|---|---|
| **1** | Step 6, unsatisfied (`○ SI actuation blocked`), TRIP BLOCKS overlay open | **Indications** | ~4 s | `Step 6 of 16 · 04:03:50` intact, Continue still `disabled`, acceptance still `○`, **TRIP BLOCKS overlay still open on the board**, plant clock advanced T+00:03:36 → T+00:03:43 (it keeps running, as it should) |
| **2** | Step 15, unsatisfied (`○ When SUBCOOLING MARGIN > 10 °F`) | **Walkthroughs** | ~4 s | `Step 15 of 16 · 07:20:37` intact, Continue still `disabled`, acceptance still `○` |

Nothing was lost. The Indications tab was also the most useful thing on the page for an operator —
it lists every channel indicated-vs-true, and at step 6 it showed me `Core Void 14.0 %`,
`Core Uncovered 0.0 %` and `Plant Mode 3` that nothing on the board carries.

### 3.5 Panels and overlays

- **TRIP BLOCKS (step 6).** Opens as a floating panel over the top-left of the board. It **covers the
  whole ROD CONTROL card and the left edge of the REACTOR POWER and AVG COOLANT TEMPERATURE tiles**
  — including the `SCRAM` button. The step warns you: *"The TRIP BLOCKS panel stays open over the
  board until you press TRIP BLOCKS again."* That is accurate and I appreciated it. Pressing
  `TRIP BLOCKS` a second time closed it cleanly. It stayed open across a tab switch and across a
  step change (it was still up at step 8), which is correct but means it silently obscures the board
  for as long as you forget it. `shots/19_tripblocks_open.png`, `shots/25_step8.png`.
- **Every click landed where I aimed it.** Four diagram-symbol clicks (AFW block valve at
  745,372; PORV block valve at 487,203; RCP OFF at 582,526; RCP ON at 617,526) and every card button
  press registered first time. I hovered each symbol first and the SCANNER line named it correctly
  before I clicked, so I never had to guess.
- **The one click that was refused** was `Continue ▶` while dark — correctly, and the step did not
  move.
- **The mission overlay is open on load** and `intercepts pointer events` for the whole board, so the
  first thing any player must do is deal with it. It closes itself when you press `▶ Start`.
- The green **step-glow outline** is the single best affordance on the page — it made steps 6, 7, 10,
  11, 14, 15 and 16 findable in seconds. Which is why step 8 pointing at the wrong tile stands out.

---

## 4. Per-step log

Times are plant time from the header clock. "Lit" = `Continue ▶` went `ready` on its own.

**Step 1 of 16 · 04:00** — *"Verify the plant is at full power: REACTOR POWER near 100 % with the
TURBINE-GENERATOR carrying load."* Board on arrival: REACTOR POWER 99.7 %, TAVG 580 F, PZR LEVEL
62 %, PRIMARY PRESSURE 2236 psi, SUBCOOLING 43 F, SG LEVEL 65 %, turbine 1800 rpm / 100 MW / 100 %,
rods 627/627, boron 621 ppm. Already satisfied on arrival; Continue lit; `⏪ Rewind step` correctly
disabled. Nothing confusing. `shots/07_started.png`.

**Step 2 of 16 · 04:00:37** — *"Verify the turbine has tripped and the steam generators are drying
out: the TRIP button lit on the TURBINE-GENERATOR card, STEAM GENERATOR LEVEL falling below 55 %."*
The failure arrived by itself on entering the step — condensate pump, main feed pumps and turbine all
tripped without me touching anything, and the alarm list went from 0 to 6 in 30 plant-seconds. First
acceptance `✓` immediately, second took **~31 plant-seconds** (SG 65 → 56 %). Lit. Confusion: the
tick fired at a displayed `56 %` against a stated `below 55 %` (S-4). I also rewound and replayed
this step twice on purpose — see §3.1. `shots/08_step2.png`, `shots/12_step2_transient.png`.

**Step 3 of 16 · 04:00:45** — *"Verify the reactor has tripped: REACTOR POWER collapsing and the
REACTOR TRIP alarm in."* Satisfied on arrival (`SCRAMMED / TRIP SIGNAL STANDING`, rods 0/627, 9
alarms). Lit. The step then volunteers, unprompted, that this plant trips at ~53 s on
over-temperature ΔT where TMI tripped at 8 s on high pressure — the honesty is the best thing in the
leg. `shots/15_step3.png`.

**Step 4 of 16 · 04:01:07** — *"Verify the relief valve reading: the PORV light beside the
pressurizer reads CLOSED, and the temperature under it is above 240 °F and climbing."* Board: the
diagram label read `PORV CLOSED` with `482 F` under it. Satisfied on arrival. Lit. This is the
deception and it is unmistakable once the step tells you where to look. Only snag: the metric
bracket `(116 °C)` (S-10).

**Step 5 of 16 · 04:02:39** — *"Verify safety injection has started by itself: the ECCS card shows
the high-pressure pump running."* Satisfied on arrival. Lit. The step pre-empts two board readings
that would have looked wrong to me — the falling (not rising) pressurizer level, and ECCS FLOW
reading 0 GPM with the pump running. I checked the second: at 1100 psi the card read
`FLOW 40 GPM / DISCG 1058 psi / MODE HHSI`, i.e. flow had started, consistent with the step's
*"flow does not start until PRIMARY PRESSURE falls below about 1390 psi"*.

**Step 6 of 16 · 04:03:50** — *"Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the SI
REACTOR TRIP row."* First action step. Found `TRIP BLOCKS` on the ROD CONTROL card by its exact
words, first attempt. Panel opened with four rows; two `BLOCK` buttons live, two greyed. Pressed
`BLOCK` on `SI REACTOR TRIP`. Acceptance ticked in ~2 s; Continue lit. Time on step: ~2 plant-min.
Confusions: the acceptance says the row will be "lit" and it isn't (S-8); the overlay covers the
board (§3.5). The step explains the 1972 vs 1715 psi discrepancy before I could be confused by it,
which was well judged — the panel row does print `1715 psi`.

**Step 7 of 16 · 04:05:07** — *"Press STOP on the ECCS card to shut the high-pressure injection
down."* ECCS card outlined green. Two `STOP` buttons exist on the board; the outline told me which.
Clicked. ECCS went `FLOW 41 GPM / DISCG 1045 psi / MODE HHSI` → `FLOW 4 GPM / DISCG 6 psi / MODE
STANDBY`. Lit within 3 s. The step's warning that *"the plant refuses this press for about a minute
after injection starts"* did not bite — injection had been running for 4 minutes.

**Step 8 of 16 · 04:06:28** — *"Verify PRESSURIZER LEVEL has gone to the top of its scale and is
sitting there."* Satisfied on arrival (100 %). Lit. **The wrong tile was highlighted** — S-3.

**Step 9 of 16 · 04:06:28** — *"Verify SUBCOOLING MARGIN has reached zero and the pump cavitation
alarm is in."* Both `✓` on arrival. Board read `-0 F` and the alarm list carried
`Reactor Coolant Pump Cavitation · coolant · warning · T+00:02:34`. The step names the alarm by its
exact board title, which made it findable instantly.

**Step 10 of 16 · 04:08:37** — *"Open the auxiliary feedwater block valves: click the valve symbol
directly above the AFW card."* Hovered the unlabelled symbol at 745,372 → SCANNER confirmed
`Auxiliary Feedwater (AFW) Block Valve`. One click: AFW went `FLOW 0 GPM / DISCG 0 psi` →
`FLOW 86 GPM / DISCG 1011 psi`. Then the long wait for SG level: pressed 600× per the ⏩ line,
achieved 460–470×, and the plant ran **T+00:07 → T+01:05 in about ten seconds of wall time**, SG
level 0 → 37 %. Lit. The ⏩ estimate ("about 65 plant-minutes") was accurate.
`shots/29_afw_region.png`, `shots/31_warp_attempt1.png`.

**Step 11 of 16 · 05:13:37** — *"Press OFF on the reactor coolant pumps to secure them."* First
acceptance (`PRESSURIZER LEVEL below 80 %`) already `✓` on arrival at 69 %, so the ⏩ line's advice to
wait for level to come off the top was already spent. Hovered 582,526 → `OFF (RCP) — Stops the
reactor coolant pump`. Clicked. RCP FLOW → 5 gpm, cavitation alarm cleared, both `✓`, lit within 3 s.

**Step 12 of 16 · 05:41:37** — *"Verify PRESSURIZER LEVEL is falling: below 50 % and still going
down."* Pressed 600×; refused (S-6). Ran at 60×: PZR level 69 % → 49 % over **T+01:10 → T+01:30, ~20
plant-minutes**, against the step's stated "about 30 plant-minutes". Lit. Rewound mid-wait on purpose
(§3.1 use (c)) and had to redo step 11.

**Step 13 of 16 · 06:11:37** — *"Verify SUBCOOLING MARGIN is pegged on the bottom of its scale at
-50 °F."* Satisfied on arrival. Lit. `#warpInfo` at this point read
`Dropped to real time — checklist step complete`. Metric bracket `(-27.78 °C)` (S-10).

**Step 14 of 16 · 06:18:37** — *"Close the PORV block valve: one click on the small valve symbol just
left of the PORV."* Hovered 487,203 → `Power-Operated Relief Valve (PORV) Block Valve`. One click
(the step explicitly warns a second click reopens it). Pressure turned up immediately, 588 → 592 psi.
Tailpipe cue met by ~T+02:47. **Then 175 plant-minutes to satisfy the pressure cue — S-1.** Lit at
T+04:28:53, 869 psi. The block valve's location description ("just left of the PORV") is *roughly*
right — it is left and slightly below on the pipe run — and the green outline made it unambiguous.
`shots/41_porv_region.png`, `shots/44_porv_after_block.png`.

**Step 15 of 16 · 07:20:37** — *"Press START on the ECCS card to put high-pressure injection back
in."* ECCS card outlined. Clicked START at 800,579: `FLOW 0 GPM / MODE STANDBY` → `FLOW 48 GPM / MODE
HHSI`. Note that SI actuation was still *blocked* from step 6 and the manual START worked anyway,
which is the right behaviour and which the step does not need to explain. Then 600× → achieved 450×
→ dropped to 60×. Subcooling **−38 °F → +12 °F over T+04:36 → T+05:23, 47 plant-minutes** — inside
the step's stated "measured between 30 plant-minutes and 70". Lit. Confusion: `FLOW 48 GPM /
DISCG 0 psi` (S-11).

**Step 16 of 16 · 19:50:37** — *"Press ON for the reactor coolant pumps to restore forced
circulation."* Clicked ON at 617,526. RCP FLOW 0 → 7 → 90 % in ~40 plant-seconds, exactly as the step
says. **Continue lit and then went dark again — S-2**, took 77 s of polling to catch. Pressing it
gave `Walkthrough complete`. Confusion: the plant the step hands back is not the recovered plant the
text describes — S-5.

**Complete** — *"Injection restored, forced circulation back and the relief line isolated. At its
worst 94 % of the core was uncovered — and the fuel still never got hotter than it runs at full
power, 1130 °F against 1298 °F on line before the trip. The real one went far past 2500 °F, and this
plant stops short of it by design."* `shots/62_complete.png`.

---

## 5. Words and numbers I could not find, or that disagreed with the board

| Walkthrough said | Board actually said | Verdict |
|---|---|---|
| Step 2: `STEAM GENERATOR LEVEL below 55 %` | ticked with the tile displaying **`56 %`** | disagrees at the tick |
| Step 3 (THE CREW SAW): *"Pressure spiked near 2255 psi"* | this plant peaked at **2335 psi** | not an error — the THE CREW SAW pane is history, not this plant, and the step's own note says so — but the two numbers sit four lines apart |
| Step 6: `SI REACTOR TRIP lit on the TRIP BLOCKS panel` | the row's button changes `BLOCK` → **`RELEASE?`**; nothing lights | word not on the board |
| Step 8 instruction names `PRESSURIZER LEVEL` | the green step-outline was drawn on **`PRIMARY PRESSURE`** | wrong control indicated |
| Step 9: `SUBCOOLING MARGIN at or below 1 °F` | tile displays **`-0 F`** | display oddity |
| Step 14: `⏩ About 62 plant-minutes at 1×` | took **175 plant-minutes** (T+01:33:34 → T+04:28:53) | out by 2.8× |
| Step 12: `⏩ About 30 plant-minutes at 1×` | took **~20 plant-minutes** | out the other way, harmlessly |
| Step 14 hover: `Normally open` | said the same after I had shut it | state not indicated |
| `WARP dropped to 60× — pressure moving 81 psi/s` | gauge moving **~0.13 psi/s** at that instant | unit/frame not stated |
| `#warpInfo`: `WARP dropped to 60× …` | speed bar showing **`1×`** at the same moment | stale line |
| Step 16: *"the margin and the inventory recover"* | SUBCOOLING **−8 °F**, PZR LEVEL **0 %**, 8 alarms | did not happen on my run |
| Acceptances print `(116 °C)`, `(-27.78 °C)`, `(5.56 °C)` | every gauge on this board is US customary only | inconsistent register |
| Alarm `Reactor Trip — Ot Delta T` | — | should read OTΔT / over-temperature delta-T |
| Step 15 ECCS `FLOW 48 GPM` | with `DISCG 0 psi` on the same card | unexplained pairing |
| Brief said Plant & Mission *"is NOT open on load"* | it **is** open on load and blocks board clicks | (against the brief, not the walkthrough) |

Controls I looked for and **found first time, by the step's exact words**: `TRIP BLOCKS`,
`SI REACTOR TRIP`, `BLOCK`, `STOP` on the ECCS card, `START` on the ECCS card, `TURBINE-GENERATOR`
`TRIP`, `REACTOR POWER`, `PRESSURIZER LEVEL`, `SUBCOOLING MARGIN`, `PRIMARY PRESSURE`,
`STEAM GENERATOR LEVEL`, `RCP` `ON`/`OFF`, the AFW block valve, the PORV block valve, `Ack All`.
**Nothing in this leg was unfindable.**

---

## 6. What the text got right

- Every control it names is on the board under exactly the words it uses.
- The green step-outline points at the right card on 15 of 16 steps, and turns unlabelled diagram
  symbols into two-second finds.
- It tells you in advance that the failures arrive on their own, so you never hunt for an Inject
  Failure tab.
- It declares the defeated turbine-trip channel up front, and says it is defeated *only* inside the
  walkthrough.
- Step 2 pre-warns you that you have already missed the spike — and its numbers check out: I rewound
  and measured **2335 psi at 6 seconds** against its "near 2340 psi about 6 seconds in", and ~2070 psi
  at 35 s against its "back near 2095 psi and falling by 35 seconds".
- Step 3 volunteers that this plant trips at ~53 s on over-temperature ΔT where TMI tripped at 8 s on
  pressure, and says why. It never pretends the model is the accident.
- Step 4 explains the tailpipe reading before you see it, and the 120 °F seated / 480 °F passing
  figures both matched the board (122 °F at the end, 482 °F while passing).
- Step 5 pre-empts the two readings that would otherwise look like bugs — falling pressurizer level
  and zero ECCS flow with the pump running — and both explanations held when I checked them.
- Step 6 explains the 1972 vs 1715 psi difference *before* you read the panel row that prints 1715.
- Step 6 and 7 are labelled `the crew's action, as taken — not a recommendation`. That badge is the
  difference between teaching the accident and teaching bad practice.
- Step 7 tells you the plant will refuse the press for a minute after injection starts.
- Step 8 tells you the vessel is still drawn full and that this is correct, with the number (6 % of
  coolant lost) — exactly the doubt a player would have.
- Step 10 says "one symbol here, two valves" — it does not pretend the board is the real plant.
- Step 11 says "one press here does both" for the same reason.
- Step 14 says a second click reopens the valve, so click once. I clicked once.
- Step 14's WARP warning ("this is the fastest pressure moves all run and WARP will refuse it") was
  exactly right, including that `Ack All` would not help because it is a rate.
- Step 15 gives a measured *range* for the wait (30–70 plant-minutes) rather than a single number.
  Mine landed at 47. This is the model the other ⏩ lines should follow.
- The closing card states plainly what is not modelled — core damage, containment radiation, the
  hydrogen burn — and quantifies the gap on fuel temperature (1130 °F vs 2500 °F+) instead of
  glossing it.
- `#warpInfo` explains every refusal and every automatic speed change, in words, at the moment it
  happens. No other control on the page does that.
