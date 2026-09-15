# Layman playthrough — `pwr_heatup` then `pwr_startup`

> **Record, not policy.** The layman pass of 2026-09-15, run against `develop` at commit
> `356c7033` in headless Edge at 1600 x 1000, by a fresh-context agent with no repo access. Two
> of the six legs were played, `pwr_heatup` and `pwr_startup`, and **both finished, 17 of 17 and
> 17 of 17** — the first pass in this series with no leg abandoned. The stuck points were a
> fast-forward that died to an alarm with no explanation on screen, a 2,103-character note that
> arrives scrolled past its own instruction, a halo drawn round a card instead of the button the
> sentence names, and a **Plot point** press taken by the plant while the walkthrough ignored it.
>
> **The coordinator re-measured every claim on this tree before any of it was filed, and four
> diagnoses did not survive.** *(1)* **The two highlight treatments are NOT distinguished by
> animation alone.** Measured on the live board with both cues present: the watch ring is a flat
> `0 0 0 2px rgba(90,240,255,0.90)` plus a `16px 4px` bloom at alpha 0.42, while the press ring
> breathes **1.00 px to 2.00 px** with a bloom from `10px 2px` at 0.30 to `20px 5px` at 0.55. The
> ruled static cue exists. *(2)* **The pulse is not a 0.4 px breath**; the reviewer sampled two
> arbitrary instants of a 1.2 s ease-in-out cycle, and the measured envelope is **1.00 px to
> 2.00 px with alpha 0.62 to 1.00** — two and a half times the reported amplitude. *(3)* **Under
> `prefers-reduced-motion: reduce` the two are plainly distinct**: the press falls back to
> `outline: 3px dashed` with the box-shadow removed, the watch keeps its solid 2 px ring — a line
> style apart, not a hue apart. *(4)* **The pressed state is not identical to a watch highlight**:
> `ckl-step-done` measures `1px at alpha 0.62 + 10px 2px at 0.30`, against the watch ring's `2px
> at 0.90 + 16px 4px at 0.42`. It is identical to the press pulse's own resting stop, which is the
> ruling.
>
> **What survived, and is the real defect behind the reviewer's experience:** the watch ring's
> 2 px is *exactly* the pulse's PEAK width, and at that peak the press cue also carries a higher
> alpha (1.00 against 0.90) and a wider bloom (20/5 against 16/4). So for the upper half of every
> cycle the "thicker ring" cue **inverts** — the press target is the thicker, brighter ring — and
> a still frame caught there shows two rings that cannot be told apart. Filed as **#758**, a
> regression in the 2026-09-14 ruling's implementation (`c38ff933`).
>
> **And one confirmed outright that the reviewer filed only as an aside:** leg 1 step 4 is a
> *verify* step — "Verify the turbine is tripped" — whose `hl` list is `['Turbine — Trip']`, and
> `revealControl` resolves that to **[1086, 208, 48 x 22], the TRIP button's box to the pixel**. A
> pulsing "act on this" halo sits on the turbine trip button on a step that asks the player to
> press nothing — filed in the **#653** comment as S-3b.
>
> Three further numbers were corrected on the record: the step 9 note is **2,103 characters**, not
> the ~1,600 a coordinator brief carried; the SOURCE RANGE tile's two-significant-figure format
> costs **all four** count targets in `pwr_startup`, not only step 6; and the four settle rungs on
> steps 5 to 8 carry **identical** acceptances, which refutes step 7's own "the settle takes
> longer at every rung".
>
> Every `S-n` below carries the `**Measured:**` and `**Verdict:**` lines added by that pass.
> Refuted claims are left in the body: the record is what the player experienced.


Build under test: **Alpha 1.7.4-rc26+ (develop, commit 356c7033)**, headless Edge, 1600x1000, no `&dev=1`.
Player persona: intelligent layman. Knows what a pump and a valve are. Nothing else.
Wall time: about 95 minutes. Screenshots referenced below are in `shots/`.

---

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| `pwr_heatup` (Mode 5, Cold Shutdown -> Mode 3, Hot Standby) | **Finished** | **17 of 17** | An unacknowledged alarm silently killed 600x warp and the speed-bar status line kept telling me to press 600x. Four minutes lost, no clue on screen. |
| `pwr_startup` (Mode 3, Hot Standby -> Mode 1, At Power) | **Finished** | **17 of 17** | Step 9's note is **2,103 characters in one italic grey paragraph**; the panel opens it already scrolled 144 px down, so the instruction and the done-when are off the top of the screen and there is no visible scrollbar. |

Final plant: REACTOR POWER 10.3 %, OUTPUT 10 MWe, CONTROL ROD POSITION 225/627, Mode 1 At Power. Each leg offered the next one at its foot ("Next: ... >") and that chain worked — I never had to go back to the Main Menu.

---

## 2. Stuck points, ranked

### S-1 — WARP dropped by an alarm, and the status line told me to press the button that had just failed
**Leg 1, step 9.** Step text quoted:
> "9. Raise SET PZR PRESSURE to 1700 psi."
> "(fast-forward) About 50 plant-minutes at 1x — set the speed control to 600x."
> "At 665 psi the clock drops to 1x by itself and stays there until the accumulator valve in the next step is open."

**What I did.** Typed 1700 + Enter, pressed `600x`. It engaged (the button lit). About five seconds later the clock was back at `1x`. I then watched PRIMARY PRESSURE crawl 596 -> 600 psi over **200 seconds of real time** while the line under the speed bar read, verbatim:
> "About 50 plant-minutes left at 1x — set the speed control to 600x."

So the one line that is supposed to explain a refusal was instead repeating the advice I had just followed. I pressed `600x` again and caught the other message for about 2.4 seconds before it flipped back:
> "Held at real time — the plant needs you here."

Neither line mentions an alarm. The actual cause was a **new unacknowledged warning** that had appeared while the clock ran:
> "Shutdown Cooling Not In Service — RCS Is Below the RHR Entry Pressure · safety_system · warning · unacknowledged · T+00:32:30"

Nothing in the walkthrough had warned that this alarm was coming, and nothing linked it to the clock. I only got moving because I pressed **Ack All** on a hunch. (Note: I was later able to hold 3600x through **four** unacknowledged alarms on step 11 — so whatever the rule is, it is not "any unacknowledged alarm".)
**What would have unstuck me:** the status line saying "WARP stopped — new unacknowledged alarm: Shutdown Cooling Not In Service. Press Ack All." Shots: `c032_warp`, `c033_665`, `c034_warpdrop`, `c035_alarm_before`.


**Measured:** `layers/simulation_service.js` `_attentionStop` (:1023) — a new alarm drops the clock ONLY when `_boardQuiet(prevAlarms)` is true, i.e. when no WARNING or CRITICAL was already annunciating on the previous broadcast. Acknowledgement is not in the test at all (`_boardQuiet` checks `state !== 'clear'`). And `ui/app.js` `syncWarpInfo` (:3172) prints the drop REASON for exactly one reason — `warpNote.reason === 'hold'`, the engine's own `speed_hold`; for `alarm`, `scram`, `failure` and `step` it falls through to the else branch and prints the ACTIVE STEP's fast-forward advice.
**Verdict:** confirmed, cause replaced — the rule is **first warning or critical arriving on a quiet board**, not "any unacknowledged alarm", which is exactly why 3600x held through four unacknowledged alarms on step 11 (the board was already lit, so no further drop could fire). The status line re-advising the failed button is not a wording slip but a structural gap: that line is incapable of naming any drop reason except a plant hold. Filed as confirming evidence for the un-implemented *(OWNER RULING, 2026-09-14: "Only alarms the step is not expecting")*.
### S-2 — Step 9 of leg 2 is a wall of text that opens mid-sentence
**Leg 2, step 9.** Step text quoted (heading only; the note is discussed in full in §7.2):
> "9. Press SLOW and hold WITHDRAW to 3 steps short of the 1/M panel's predicted position, then tap single steps."
> "When REACTOR POWER > 0.1 %"

**What I did.** Landed on the step and read what was on screen. Measured: the note element is **2,103 characters**, one paragraph, italic grey, 27 lines. `#cklLog` on arrival: `scrollTop = 144`, `clientHeight = 728`, `scrollHeight = 995` — and `clientWidth === offsetWidth (318 === 318)`, i.e. **no scrollbar gutter is drawn**. The visible screen therefore began at:
> "...stop, and the step to use the speed buttons on: put the clock on 10x, and come back to 1x before you move a rod again."

The step number, the instruction ("Press SLOW and hold WITHDRAW...") and the done-when ("When REACTOR POWER > 0.1 %") were all above the fold, and the BACKGROUND block was below it. I only saw the instruction because I forced `scrollTop = 0` myself.
**What would have unstuck me:** the panel scrolling to the top of a new step and drawing a visible scrollbar. Shots: `c090_longnote` (as it arrives), `c091_scrolltop` (forced to top).


**Measured:** the BUILT pool (`RD.MANUAL_PROCEDURES.pwr2`, `pwr_startup` step index 8): `note` is **2,103 characters** exactly, `why` 502, `text` 107. The coordinator brief's "~1,600 characters" was wrong by 31 %. The scroll mechanism is `ui/app.js` :4826-4840 — on a step ADVANCE the log pulls the active step into view with `else if (bot > log.scrollTop + log.clientHeight) log.scrollTop = bot - log.clientHeight;`, which aligns the step's BOTTOM to the bottom of the box. For a step card taller than the box that puts its number, its instruction and its done-when ABOVE the fold — which is the `scrollTop 144` the reviewer measured.
**Verdict:** confirmed, and the diagnosis is now specific: the panel is not failing to scroll to the top, it is deliberately scrolling to the step's BOTTOM. **Not verified:** the "no scrollbar gutter" half. Headless Chromium draws overlay scrollbars that consume no layout width, so `clientWidth === offsetWidth` in this harness does not prove a player in a real Edge window sees no scrollbar.
### S-3 — The pulsing "press this" highlight is drawn round the wrong thing, and a click at its centre does nothing
**Leg 1, step 7.** Step text quoted:
> "7. Press A+B 7 % on the LETDOWN card to open the letdown path."

**What I did.** Found the pulsing ring, aimed at its centre, clicked. Nothing happened — 7a and 7b stayed unticked. Measured: the pulsing halo is 79 x 154 px centred at (967, 593), i.e. it rings the **whole LETDOWN card**; the buttons inside are `CLOSED` @554, `A 3%` @580, `B 4%` @607, `A+B 7%` @633. **The halo's centre is dead space between A 3% and B 4%.** Second attempt, aimed at the literal words "A+B 7%", worked.
Same shape one step later, step 8 — "press AUTO under HEATER, then AUTO under SPRAY" put two 79 x 150 px pulsing boxes round the two whole columns, whose most eye-catching button is the amber lit `OFF`, not the dark `AUTO` you are being told to press.
**What would have unstuck me:** the glow drawn on the button the sentence names, not the card that contains it. Shots: `c024_letdowncrop`, `c027_pzrcrop`.


**Measured:** `RD.PwrBoard.revealControl('Letdown Orifices (CVCS)')` on the live board returns a halo at **[928, 516, 79 x 154]**, centre **(967, 593)** — the reviewer's figures to the pixel — and `document.elementFromPoint` at that centre is the card `DIV "LETDOWN"`, not a control. The `A+B 7%` button measures [932, 622, 71 x 22], centre y **633**, i.e. **40 px below the halo centre**. Same shape for `Pressurizer Heaters (PZR)` [121, 490, 79 x 150] and `Pressurizer Spray (PZR)` [37, 490, 79 x 150] — both centres land on the lit `OFF` button, not the `AUTO` the step names. It is NOT a general limitation: `CONTROL_LABEL_MAP` (`ui/diagram/board/pwr_board_wiring.js` :3542) carries per-button labels too, and those are exact — `Rod Speed — Fast` measured [147, 302, 44 x 19] centred on FAST, `Shutdown Bank — Withdraw` [125, 239, 71 x 26] centred on WITHDRAW, `Accumulator valve` [359, 519, 35 x 38] on the valve symbol.
**Verdict:** confirmed — and narrowed to an AUTHORING choice, not a halo defect. The vocabulary already supports naming the button; these steps name the card.
### S-4 — The board rounds the number the step is graded on, so you cannot tell whether you have met it
**Leg 2, step 6.** Step text quoted:
> "6a  Hold WITHDRAW at MED until SOURCE RANGE passes 1.4e3."
> "Counts above 1.4e3 (1,400 counts per second)"

**What I did.** SOURCE RANGE on the board read exactly **`1.4e3 cps`** and 6a was **not** ticked. The board shows two significant figures, so 1,380 and 1,449 both print as "1.4e3" — the display can never confirm the target. I held WITHDRAW blind for 7 more seconds until the card ticked itself; the board then read 1.5e3 (152 steps). The instruction is unverifiable from the instrument it names; the only feedback is the tick. Shot `c075_nis`.
**What would have unstuck me:** either the done-when quoting a number the board can actually resolve, or the card showing the live value beside the target.


**Measured:** the SOURCE RANGE tile renders `toExponential(1)`: at a measured true `sr_counts_cps` of **501.04** the tile prints **`5.0e2`**. Two significant figures, so every count target in the leg has a dead band in which the tile already prints the target and the rung cannot tick — 7.0e2 from **695** cps, **1.4e3 from 1,350 cps (50 counts, 3.6 % below the 1,400 the rung grades on)**, 3.0e3 from 2,950, 7.0e3 from 6,950.
**Verdict:** confirmed and BROADER than reported — it is all four count targets in `pwr_startup` steps 5-8, not only step 6. Cross-reference **#749**, which already carries the 1.4e3 tile-versus-tick gap; this adds the other three and the formatter behind them.
### S-5 — A step's fast-forward line gives two different speeds in the same sentence
**Leg 2, steps 7 and 5.** Step text quoted verbatim:
> "(fast-forward) About 7 plant-minutes at 1x — set the speed control to 60x. Set the speed control to 10x if you don't want to wait in real time for the rod movement."

Two instructions, two speeds, one line, no rule for choosing. 60x on MED is 48 rod steps per second, and the step wants me to stop inside a 25-step window, which 60x makes impossible — so the first half of the sentence is actively wrong for the action. I used 10x and it worked. Step 5 carries the same doubled line with 10x twice, which reads like a copy-paste artefact.
**What would have unstuck me:** one speed per line, and the one that suits the action being performed.


**Measured:** read off the live card at leg 2 step 5, verbatim: *"About 5 plant-minutes at 1x — set the speed control to 10x. Set the speed control to 10x if you don't want to wait in real time for the rod movement."* The first sentence is GENERATED from the step's `hold` by `RD.CklSpeedHint` (`ui/app.js` :4580-4605); the second is the step's authored `wait_hint` string, appended to the same line. Built-pool `hold` values: step 5 = 300 s, step 6 = 300 s, step 7 = **420 s**. All three author the same 10x `wait_hint`, so steps 5 and 6 print 10x twice and step 7 prints a generated **60x** beside an authored **10x**.
**Verdict:** confirmed, verbatim, with the mechanism: two independent generators writing one line. The doubling on steps 5 and 6 and the contradiction on step 7 are the same defect. The line also carries the multiplication sign two different ways in one sentence, one generated and one authored.
### S-6 — "Plot point" pressed out of turn is accepted by the plant and ignored by the walkthrough, with no message
**Leg 2, step 5.** Step text quoted:
> "5d  Press Plot point on the 1/M PLOT panel."
> "Work the four lines below in order — Plot point does nothing until the counts are steady."

**What I did.** Deliberately pressed **Plot point** while 5a was still the active rung. The plant *did* take the point: the plot gained a second dot at rod position 0 and the panel printed "insufficient trend — keep plotting / C = 537 cps -> 1/M = 0.962". The walkthrough card did **not** tick 5d and said nothing at all. So the note is literally untrue ("does nothing") and the mis-press left a junk point in a fit that the card elsewhere says uses the **last three** points. There is no undo; only "Clear", which would wipe the good points too. Shot `c068_plotearly`.
**What would have unstuck me:** either the button refusing the press with a one-line reason on the card, or the note saying "the point will be taken but will not count".


**Measured:** driven live: `pwr_startup` at step 5 with rung 5a unmet (`sr_counts_cps` measured **501 cps** against the 700 the rung grades on), pressing **Plot point** on `#oomWin` twice. The plot's point count went **1 -> 2 -> 3** SVG circles and the panel's readout recomputed each time (`C = 499 cps -> 1/M = 1.016`, then `C = 482 -> 1.053`, then `C = 511 -> 0.993`). The checklist card did not move: 5a stayed `o`, 5b/5c/5d stayed `.`, and no message appeared on the card, on the panel, or anywhere else.
**Verdict:** confirmed outright. The ordered-substep feature shipped today (`356c7033`, #756) gates the CHECK-OFF; it does not gate the board control, and it cannot — the walkthrough has no authority over a board button. The card's own note, *"Plot point does nothing until the counts are steady"*, is therefore a **false statement in player-facing copy**, and it shipped in the same commit as the feature. The junk points are real points at rod position 0 in a fit the step-4 card says uses the last three, and the only removal is `Clear`. Filed as **#759**.
### S-7 — The alarm row's button is labelled ACK, the step calls it ACKNOWLEDGE
**Leg 2, step 1.** Step text quoted:
> "One alarm is already up and belongs here: Turbine Trip / Low Steam Demand on the ALARMS list, short form TURB TRIP. The turbine is off and the plant is making no steam. **Press ACKNOWLEDGE** and leave it."

There is no control on screen that says ACKNOWLEDGE. The alarm row carries a small chip reading **`ACK`**, and the panel header has **`Ack All`**. I found it, but only because ACK is an obvious abbreviation. The same sentence also introduces "short form TURB TRIP" for a thing that is never shown in short form anywhere I looked.
**What would have unstuck me:** "press ACK on that alarm's row".


**Measured:** the built pool and the live card both read, verbatim: *"...on the ALARMS list, short form TURB TRIP. The turbine is off and the plant is making no steam. Press ACKNOWLEDGE and leave it."* The control on the alarm row is a chip reading **`ACK`**; the panel header reads **`Ack All`**. No control anywhere on the board reads ACKNOWLEDGE, and nothing draws the alarm in the short form TURB TRIP.
**Verdict:** confirmed, both halves, against the built pool rather than the reviewer's transcription.
### S-8 — "the green ring" is cyan
**Leg 1, step 10.** Step text quoted:
> "10. Open the accumulator valve: **click the valve symbol in the green ring** while PRIMARY PRESSURE is 665 to 1615 psi."

The ring is the same teal/cyan (rgb 90, 240, 255) used by every other walkthrough highlight in both legs. I spent a few seconds hunting for a green one before accepting that cyan was meant. Shot: `c038_accvalve`.


**Measured:** built-pool text for leg 1 step 10 is *"click the valve symbol in the green ring"*. The halo that step draws (`revealControl('Accumulator valve')`, measured [359, 519, 35 x 38]) carries the same treatment as every other walkthrough highlight: `box-shadow: rgba(90, 240, 255, ...)` — **cyan**. There is no green anywhere in the walkthrough highlight vocabulary (`ui/shell.css` `.ckl-step-glow` and `.ckl-watch-glow`, both `rgba(90, 240, 255, ...)` since #743).
**Verdict:** confirmed. Worth noting the halo itself is the GOOD case — 35 x 38 px tight on the valve symbol, unlike the card-sized halos in S-3.
### S-9 — A done-when written in a unit and a place the player has never been shown
**Leg 1, step 16.** Step text quoted:
> "16. Verify the reactor stayed shut down: SOURCE RANGE counts steady, STARTUP RATE near 0.00."
> "When **Net reactivity < -300 pcm**"
> "Net reactivity reads on the Indications tab, not the board."

It was already ticked so it did not block me, but the line I am told to satisfy is a quantity (a) not on the board, (b) in a unit ("pcm") that no walkthrough step has ever explained, on (c) a tab the walkthrough has never sent me to. Same family: the TRIP BLOCKS rows I was told to press in leg 2 steps 15/16 read "IR HIGH FLUX", "PR HIGH (LOW SETPT)", "P-10 PERMISSIVE", "P-11 PERMISSIVE" — none expanded anywhere I could see.


**Measured:** across both legs' built steps, the token `pcm` appears **exactly once** — `pwr_heatup` step 16, whose acceptance is `{p: 'reactivity_pcm', op: '<', v: -300}` and whose own note reads *"Net reactivity reads on the Indications tab, not the board."* The unit is introduced nowhere in either leg, and no step sends the player to the Indications tab.
**Verdict:** confirmed. A step grades on a quantity that is off the board, in a unit the walkthrough never defines, on a tab it never opens.
### S-10 — Being *too low* on the approach has no written remedy
**Leg 2, step 9.** Step text quoted:
> "...settled around 0.15 is this approach going as written, and around 0.5 means you are about eight steps further out than you meant to be — power will arrive about three times sooner and level off higher. **Over 1.0 with the rods already still, tap INSERT once and wait.**"

I stopped at 207 steps against a predicted 208 and my STARTUP RATE settled at **+0.01 DPM** with PERIOD **2391 s**. Counts went 4.8e4 -> 6.2e4 and then flattened over 18 plant-minutes. The note tells you what to do if the rate is too *high*; it says nothing about too low, and 0.01 is nowhere near the "around 0.15" it calls "as written". I inferred "tap more" from "walk up in single taps", which was right — five more taps put the rate at +0.11 and the climb went. But that inference is mine, not the text's.
**What would have unstuck me:** one sentence — "under about 0.05, tap WITHDRAW once more and wait again".


**Measured:** the note is the 2,103-character block measured in S-2. Its only rate remedies are *"Over 1.0 with the rods already still, tap INSERT once and wait"* and *"under 60 seconds says you are out too far"* — both high-side. The only low-side words in it are *"settled around 0.15 is this approach going as written"*, which is a description, not an action.
**Verdict:** confirmed as a copy gap. **Not measured:** whether +0.01 DPM with PERIOD 2,391 s is actually a stall on this plant or a slow approach that would have arrived. The reviewer's own recovery (five more taps to +0.11 DPM) is the only evidence either way.
### S-11 — The settle rungs take three times as long as the fast-forward line says, with no progress shown
**Leg 2, step 6.** Step text quoted:
> "(fast-forward) About 5 plant-minutes at 1x — set the speed control to 10x."
> "6c  Keep waiting until SOURCE RANGE has stopped climbing as well."

Measured at 10x: 6b (STARTUP RATE back to zero) ticked at **~140 plant-seconds**; 6c ticked at **~1,000 plant-seconds** — about 17 plant-minutes, against the 5 the line promises, and **100 seconds of real time** staring at a static row. The card gives no countdown, no bar and no live number. Step 7 was faster (6b at 250 s, 6c at 350 s), step 8's 8c took under a minute at 60x — so the rungs are wildly uneven and the line never says which one you are in for. Step 7's own card says "the settle takes longer at every rung", which turned out to be untrue.


**Measured:** the four settle rungs on `pwr_startup` steps 5, 6, 7 and 8 carry **IDENTICAL acceptances** in the built pool — rung `b` is `startup_rate_dpm ~ 0, tol 0.02` and rung `c` is `sr_counts_cps steady, 0.03 over a 120 s window` — on all four steps without exception. Nothing in the authoring makes a later rung settle longer. The printed span comes from `hold` alone (300 / 300 / 420 / 600 s).
**Verdict:** narrowed. The COPY claim is refuted: step 7's note *"the settle takes longer at every rung"* is an unmeasured assertion in player-facing text, contradicted by four identical acceptances. **Not measured:** the live settle DURATIONS. The reviewer's 140/400, 140/1,000 and 250/350 plant-seconds were not reproduced in this pass, so they stand unadjudicated against the replay harness's per-burst table (223 / 226 / 281 / 507 s) — the fixture-versus-live question is still open.
---

## 3. Per-step log

Format: step number, first sentence, what I did, time, did Continue light, confusion.

### Leg 1 — `pwr_heatup`

**Before step 1.** The **Main Menu overlay was already open over the board on page load** (the brief says it is not open on load). Free Play tab, Hot Full Power selected. I clicked the **Walkthroughs** tab and pressed **Start** on the first row.

**1.** "Verify the plant is cold and shut down: AVG COOLANT TEMPERATURE 122 °F, PRIMARY PRESSURE 363 psi, RCP FLOW OFF."
Did nothing — already ticked on arrival, "Step done — press Continue." Board matched the text exactly (122 °F, 363 psi). Continue lit immediately. Shot `c006_step1`.
*Confusion:* none. Good opening step.

**2.** "Start the reactor coolant pumps: press ON on the RCP FLOW card."
Looked for the words "RCP FLOW". Found them on the *diagram*, not on a titled card — a two-button `OFF | ON` pair beside the pump symbol. Clicked ON. ~6 s at 1x for the done-when "When RCP FLOW > 90 %" to tick. Continue lit. Shots `c011_rcp_on`, `c012_rcpwait`.
*Confusion:* mild — everything else called a "card" has a title bar; this one is loose diagram furniture.

**3.** "On the ROD CONTROL card press FAST, then click WITHDRAW under SHUTDOWN once."
Pressed FAST, then the WITHDRAW in the right-hand (SHUTDOWN) column. Set 60x per the line "About 11 plant-minutes at 1x — set the speed control to 60x." ~12 s wall; bank ran to 627/627 on its own. Continue lit. Shots `c014_rodcrop`, `c017_rodsdone`.
*Confusion:* two WITHDRAW buttons side by side, one under CONTROL and one under SHUTDOWN. The text is precise ("under SHUTDOWN") — but the pulsing rings were on FAST and on SHUTDOWN/WITHDRAW while the steady ring was on SHUTDOWN ROD POSITION, and in a still frame all three look identical.

**4.** "Verify the turbine is tripped: TRIP lit on the TURBINE-GENERATOR card, OUTPUT 0 MWe."
Already ticked. Continue lit.
*Confusion:* a *verify* step put a **pulsing** halo on the TRIP button — the same animation that everywhere else means "press me". I nearly pressed it.

**5.** "Set SG FEED to AUTO." Clicked AUTO on the SG FEED card. Instant tick.

**6.** "Verify the STEAM DUMP is closed: CLOSE lit on the STEAM DUMP card, status reading MANUAL." Already ticked.

**7.** "Press A+B 7 % on the LETDOWN card to open the letdown path." — see **S-3**. Two attempts. 7a and 7b then both ticked.

**8.** "On the PRESSURIZER (PZR) card press AUTO under HEATER, then AUTO under SPRAY." Clicked HEATER AUTO then SPRAY AUTO in that order. 8a/8b ticked. See **S-3** for the highlight shape.

**9.** "Raise SET PZR PRESSURE to 1700 psi." Clicked the SET PZR PRESSURE box, typed 1700, Enter. 9a ticked at once. Then **S-1** — four minutes lost to the warp drop. 9b ("PRIMARY PRESSURE at 665 psi, the accumulator window") ticked after I acked the alarm and re-warped.

**10.** "Open the accumulator valve: click the valve symbol in the green ring while PRIMARY PRESSURE is 665 to 1615 psi." Found the ringed valve symbol on the pipe above the ECCS box, clicked it once, ticked. See **S-8** on "green". Shot `c039_accopen`.
*Good:* the card pre-emptively told me what to do if I missed the window ("press OFF under HEATER and MANUAL under SPRAY at 100 %...") — I did not need it, but it was reassuring to see a recovery written down.

**11.** "Wait until AVG COOLANT TEMPERATURE reaches 542 °F. Do not move rods or change BORON." Set 3600x per the line. ~14 s wall for 11 plant-hours; temperature ran 269 -> 552 °F and then levelled. Continue lit. 3600x **held through four unacknowledged alarms** here, which is why S-1's drop was so confusing.

**12.** "Verify ISOLATE is lit on the RHR card and LETDOWN reads above 0 gpm." Already ticked. **Speed dropped to 1x on the check-off** — documented behaviour, and it did read like the clock reverting on its own.

**13.** "Press AUTO on the STEAM DUMP card." One click, instant tick.

**14.** "Raise SET PZR PRESSURE to 2235 psi, normal operating pressure." Typed it, pressed 600x, ~6 s wall, 2221 -> 2243 psi, Continue lit.

**15.** "Verify Hot Standby: AVG COOLANT TEMPERATURE 547 °F, PRIMARY PRESSURE 2235 psi, CONTROL ROD POSITION still 0." 15a/15b/15c all already ticked.

**16.** "Verify the reactor stayed shut down: SOURCE RANGE counts steady, STARTUP RATE near 0.00." Already ticked. See **S-9**.

**17.** "Verify REACTOR POWER reads 0.0 %." Already ticked. Continue -> **"Walkthrough complete"** with a plain-English summary and a **"Next: Mode 3, Hot Standby -> Mode 1, At Power — startup to power >"** button at the panel floor. Shot `c051_leg1_end`.

### Leg 2 — `pwr_startup` (entered by pressing that Next button; the plant carried straight over)

**1.** "Verify the plant is hot and shut down: AVG COOLANT TEMPERATURE 547 °F, PRIMARY PRESSURE 2235 psi, RCP FLOW on." Already ticked. Pressed the `ACK` chip on the Turbine Trip alarm as told — see **S-7**.
*Good:* "BORON CHEM is the live loop concentration, and the two ways into this walkthrough arrive at different numbers — it is the reading, not a figure in the text, that says where you are starting from." That sentence is exactly right and saved me a wrong assumption at the next step.

**2.** "Wash boron out of the water: on the BORON card set 719 and press Enter." Typed 719 + Enter. BORON STATUS went to DILUTING, BORON CHEM fell 918 -> 848 -> 781 -> 720 at 600x, ~12 s wall. Continue lit.
*Confusion:* the note says "From the Hot Standby preset boron already reads 719 and this step ticks at once" — I came in at 918 and it took 90 plant-minutes, so that sentence describes a route I was not on. The fast-forward line below it covers my case, but the two sit in the wrong order.

**3.** "Check SG FEED reads AUTO. If it does not, press AUTO." Already ticked.

**4.** "Before any rod moves: press 1/M PLOT on the ROD CONTROL card, then press Plot point." Clicked 1/M PLOT; a floating window "1/M Startup Plot" opened over the middle of the board with `Plot point / Clear / Help`. Clicked Plot point. Ticked. Panel printed "baseline C0 = 516 cps at 0.0% withdrawn". Shot `c064_plotted`.
*Confusion:* the window covers the STEAM DUMP and ATMOS DUMP area of the board and overlaps the left edge of the Instructor panel. It has to stay open for the next four steps, so part of the board is hidden for the whole approach to critical.
*Good:* "7.0e2 is 700 counts a second, 1.4e3 is 1,400, 7.0e3 is 7,000" — the only place in either leg that explains a notation before using it. That is the right instinct and I wish it had happened for pcm, P-10 and IR.

**5.** "Raise SOURCE RANGE past 7.0e2, let the counts level off, then plot the point." — first of the four-rung steps.
Rows on arrival: `5a (o)` bright, `5b/5c/5d (.)` greyed. I deliberately pressed **Plot point** while 5a was live — see **S-6**.
Then: pressed 10x, pressed MED, held WITHDRAW. 5a ticked. I overshot badly (held 20 s at 10x -> position 146, counts 1.4e3, against the card's advice "Stop when CONTROL ROD POSITION reads about 80 to 100"). 5b and 5c both ticked within the following ~400 plant-seconds; 5d on the Plot point press. Continue lit.
*Confusion:* the card's advisory position band (80–100) and the graded done-when (counts past 7.0e2) are different targets, and only the second one is enforced. Holding until the counts pass the target puts you well past the position band.

**6.** "Raise SOURCE RANGE past 1.4e3, let it level off, plot the point, then read the 1/M prediction." — see **S-4** (board rounds to 1.4e3) and **S-11** (the settle took 3x the quoted time). Held 7 s, position 152, counts 1.5e3, STARTUP RATE +0.17 DPM. 6b at ~140 plant-s, 6c at ~1,000 plant-s, 6d on the press. Panel printed **"predicted criticality = step 242 (38.5% withdrawn)"**, "C = 1481 cps -> 1/M = 0.349". Shot `c080_plotfull`.

**7.** "Raise SOURCE RANGE past 3.0e3, let it level off, plot the point, and read the prediction again." — see **S-5** for the doubled speed line. Held 6 s at 10x -> position 199, counts 3.5e3, rate +0.39. 7b at 250 plant-s, 7c at 350 plant-s. Plotted.

**8.** "Hold WITHDRAW at MED until SOURCE RANGE settles above 7.0e3. Settle, press Plot point. This is the last point."
8a and 8b were **already ticked on arrival** (the previous step's settle had carried counts past 7.0e3 on its own, 8.5e3 at position 199). So a step whose whole instruction is "hold WITHDRAW" needed no rod motion at all. 8c ticked in ~5 s at 60x. Plotted: **"predicted criticality = step 208 (33.2% withdrawn)"**, "C = 8712 cps -> 1/M = 0.059".
*Measured here:* the step card is **1,844 characters**; `#cklLog` was `clientHeight 694 / scrollHeight 834` with no scrollbar gutter, and the BACKGROUND box was visibly cut off mid-sentence at the panel floor ("...and nothing in the plant"). Shot `c085_panel`.

**9.** "Press SLOW and hold WITHDRAW to 3 steps short of the 1/M panel's predicted position, then tap single steps." — **S-2** and **S-10**. What I actually did:
- Pressed 10x, pressed SLOW, tapped WITHDRAW 8 times -> position **207** (prediction was 208). Board: SOURCE RANGE 1.3e4, STARTUP RATE **+0.14 DPM**, PERIOD **206 s**. Both numbers sat neatly inside what the note calls "going as written" (0.15 / ~150 s), which was genuinely satisfying.
- Waited 100 s at 10x. STARTUP RATE decayed to **+0.01**, PERIOD **2391 s**, counts flattened at ~6e4. Stalled.
- Tapped 2 more (rate +0.05), waited 100 s; **SOURCE RANGE switched itself off to 1.0e0** as the note promised, INTER RANGE picked up at 2.2e-9 A. That hand-over is the single best-taught thing in either leg — it happened exactly as described and I was not alarmed by it.
- Tapped 3 more -> rate settled **+0.11**, and INTER RANGE then climbed cleanly 1.3e-8 -> 9.6e-6 A over ~170 s wall. Continue lit at REACTOR POWER > 0.1 %.
Total on this step: **~8 minutes of wall time** and 13 rod taps.

**10.** "Let power climb on its own. Tap WITHDRAW once only if STARTUP RATE falls back to 0.00." Pressed 5x as the note asks. Left everything alone. 78 s wall, INTER RANGE 1.3e-5 -> 4.4e-5 A, Continue lit at REACTOR POWER > 0.5 %.
*Good:* this step is short, has one rule, and the rule was enough.

**11.** "Verify SOURCE RANGE has switched itself off and INTER RANGE is reading. Close the 1/M PLOT window." Already ticked; closed the window with its `x`.
*Confusion:* the **pulsing** highlight was on the board's `1/M PLOT` button, but the sentence tells me to close the window with the `x` in its corner. The highlight points at the wrong control for the sentence.

**12.** "Watch REACTOR POWER stop rising on its own, below 5 %. If it does not, press MED and hold INSERT." 12a/12b already ticked on arrival.

**13.** "Press SLOW and hold WITHDRAW until REACTOR POWER passes 5 %, about 13 steps." Pressed SLOW, tapped WITHDRAW 13 times. Power climbed 0.6 -> 2.0 % over 90 s at 5x, then I went to 10x and it passed 5.2 % in 8 s more. Continue lit.
*Confusion:* this step has **no fast-forward line at all**, unlike almost every other waiting step, so I had to guess a speed. The climb after the last tap takes several plant-minutes.

**14.** "Press LATCH on the TURBINE-GENERATOR card, then set LOAD to 10 MWe." Clicked LATCH (14a ticked at once), typed 10 into the LOAD box + Enter, pressed 10x. 14b ("Generator above 8 MWe") ticked 13 s later.
*Good:* the background line "the reactor follows it up to about 11 % by itself: more steam drawn cools the water, and cooler water raises power" predicted exactly what I then watched happen.

**15.** "Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the IR HIGH FLUX row." Opened the panel (REACTOR POWER read 9.9 %), the IR HIGH FLUX row was ringed and its BLOCK button live, pressed it, ticked first try. Shot `c109_tb`.
*Confusion:* the row labels are raw codes — "IR HIGH FLUX", "PR HIGH (LOW SETPT)", and inside each row "P-10 PERMISSIVE", "P-11 PERMISSIVE", "STARTUP TRIP · 25%". I could carry out the instruction by pattern-matching the words, but I could not tell you what any of it means, and the board says INTER RANGE, never IR.
*Good:* the note's warning that between ~8 and ~9.5 % power the block "takes it and then goes out again by itself" was specific and correct-sounding; I was at 9.9 % and it stuck.

**16.** "On the TRIP BLOCKS panel press BLOCK on the PR HIGH (LOW SETPT) row, then close the panel." Pressed it, closed the panel with the TRIP BLOCKS button again (the card told me it "covers the rod buttons", which it does).

**17.** "Verify Mode 1: REACTOR POWER above 10 % and OUTPUT 10 MWe." Already ticked. Continue -> **"Walkthrough complete ... Reactor critical in Mode 1, At Power, OUTPUT 10 MWe"**, and a Next button for the power ascension.

---

## 4. Words and numbers I could not find on the board

| The walkthrough said | What is actually on the board | Leg/step |
|---|---|---|
| "Press ACKNOWLEDGE" | the chip on the alarm row says **`ACK`**; the header says **`Ack All`**. Nothing says ACKNOWLEDGE. | 2/1 |
| "short form TURB TRIP" | the alarm is only ever drawn as "Turbine Trip / Low Steam Demand". No short form appears. | 2/1 |
| "click the valve symbol in **the green ring**" | the ring is **cyan** (rgb 90,240,255) — identical to every other highlight in both legs. | 1/10 |
| "When **Net reactivity < -300 pcm**" | not on the board at all; the card itself says it is on the Indications tab. "pcm" is never defined. | 1/16 |
| "SOURCE RANGE passes **1.4e3**" | the board prints **`1.4e3`** while the step is still unsatisfied — two significant figures cannot resolve the target. | 2/6 |
| "**IR** HIGH FLUX" | the board's instrument is labelled **INTER RANGE**. "IR" appears only inside the TRIP BLOCKS panel. | 2/15 |
| "**PR** HIGH (LOW SETPT)" | the board has **REACTOR POWER**; "PR" / "power range" appears nowhere else. | 2/16 |
| "**P-10** permissive", "**P-11** permissive" | printed in the TRIP BLOCKS rows, explained nowhere. | 2/15-16 |
| "the **RCP FLOW card**" | RCP FLOW is a loose `OFF / ON` pair on the diagram, not a titled card like SG FEED or STEAM DUMP. | 1/2 |
| "press **A+B 7 %** on the LETDOWN card" (the highlight) | the pulsing ring surrounds the whole card; the button is 40 px below the ring's centre. | 1/7 |
| "About 5 plant-minutes at 1x" (step 6 settle) | measured **~17 plant-minutes** to satisfy 6c. | 2/6 |
| "about 13 steps" to pass 5 % | 13 taps left power at 2.0 % and still climbing; it reached 5.2 % several plant-minutes later. | 2/13 |
| "Stop when CONTROL ROD POSITION reads about 80 to 100" | the graded condition is the count rate, not the position; satisfying the count put me at 146. | 2/5 |

---

## 5. What the text got right

- Every step ended in a done-when I could read, and the Continue button was honest about it — it never lit early and never failed to light once the condition was true. 34 steps, no misfires.
- The chain worked: each leg's completion card offered the next leg and carried the plant over intact.
- Both legs' "Verify..." steps that were already true said so ("Step done — press Continue") instead of leaving me hunting.
- The notation lesson at leg 2 step 4 ("7.0e2 is 700 counts a second") is the right idea, in the right place, before it is needed.
- The SOURCE RANGE / INTER RANGE hand-over was taught before it happened, happened exactly as described, and was explicitly framed as good news ("losing the counts is the plant telling you the approach worked").
- Leg 1 step 10 supplied a written recovery for missing the accumulator window before I could miss it.
- The BACKGROUND blocks are consistently labelled "NOT AN ACTION", so I always knew which text I had to act on.
- Leg 2 step 14's causal sentence ("more steam drawn cools the water, and cooler water raises power") predicted exactly the board behaviour that followed.
- Leg 2 step 9's numbers were right: it predicts STARTUP RATE "around 0.15" and PERIOD "about 150 seconds" on plan, and stopping one step below the 1/M prediction gave me 0.14 DPM and 206 s.
- The 1/M prediction walked in the way the text promised (242 -> 208 as points were added) and the text pre-warned me that early points read high.
- Leg 2 step 16's "Two separate presses on purpose: on a real board switching one off never quietly switches off the other" — a rule explained rather than asserted.
- Leg 2 step 1 telling me the BORON reading, not the text, is the authority for where I am starting.
- The clock dropping to 1x on a check-off, and stopping WARP at the accumulator window, were both announced in advance by the step that caused them.

---

## 6. Things I had to do that the text did not tell me to

1. **Press "Ack All" to get 600x to hold** (leg 1 step 9). Nothing on screen connected the alarm to the clock.
2. **Force the Instructor panel to scroll to the top** to read leg 2 step 9's instruction. A player cannot do this without first noticing there is hidden content, and there is no scrollbar.
3. **Aim at the button's text rather than the centre of its highlight** (leg 1 steps 7 and 8).
4. **Choose a speed with no guidance** at leg 2 step 13, which has no fast-forward line.
5. **Keep tapping WITHDRAW past the "3 steps short" advice** when the rate settled at 0.01 (leg 2 step 9); the note only covers the too-fast case.
6. **Ignore the "60x" half of leg 2 step 7's fast-forward line**, which would make that step's rod stop impossible.

---

## 7. Specific answers to the four things I was asked to watch

### 7.1 Highlights — can you tell "press me" from "watch me"?
**No, not in a still frame, and barely in motion.**

Measured in the DOM: a press target is `.bd-halo.ckl-step-glow` with `animation-name: cklGlow`, 1.2 s; a watch target is `.bd-halo.ckl-watch-glow` with `animation-name: none`. So the distinction **exists and is exactly as designed**. But the *only* difference is the animation. Both draw the same cyan ring in the same colour (rgb 90, 240, 255) at the same width. I captured two frames 550 ms apart of the ROD CONTROL card (`c015_pulseA.png`, `c015_pulseB.png`) — with FAST and WITHDRAW pulsing and SHUTDOWN ROD POSITION steady in the same crop — and **I cannot tell the frames apart**, nor which of the three rings is animated. The pulse modulates the box-shadow alpha from about 0.667 to 0.83 and the ring width from 1.13 px to 1.55 px. That is a **0.4 px** breath. There is no "solid ring" versus "soft glow" difference I can see; there is one ring style with an almost-invisible animation on some of them.

Consequences I actually hit: on leg 1 step 4 ("*Verify* the turbine is tripped") a pulsing halo sat on the TRIP button and I nearly pressed it; on leg 2 step 11 the pulsing halo sat on the `1/M PLOT` board button while the sentence told me to close a window with its `x`.

**When a pressed button stops pulsing, does that read as "done" or as "broken"?**
Neither — **it reads as nothing at all**, because a stopped pulse is visually identical to a watch highlight. I pressed ON for the RCPs and the halo's class changed `ckl-step-glow` -> `ckl-step-glow ckl-step-done` with `animation: none`, leaving the same steady ring in place. Since I could not see the pulse in the first place, I could not see it stop. **The only thing that told me my press had registered was the `o` turning into a green `✓` on the card** — which is what I ended up watching for the whole run, ignoring the board highlights entirely after about step 8. The highlights are useful for *finding* a control and useless for confirming you used it.

### 7.2 The long note — too much text?
**Yes, decisively.** Measured, not estimated: leg 2 step 9's note is **2,103 characters** (the whole step card is 2,800) in a single italic grey paragraph with no headings, no bullets and no paragraph break, running 27 lines down a 318 px column. The brief guessed ~1,600; it is 30 % longer than that.

Worse than the length is the delivery. On arrival `#cklLog` is at `scrollTop 144` of a `995 px` scroll height in a `728 px` box, **with no scrollbar drawn** (`clientWidth === offsetWidth === 318`). So the first thing on screen is the middle of a sentence — "...stop, and the step to use the speed buttons on: put the clock on 10x..." — and the step's own instruction and done-when are above the visible area. I did not know they were there until I measured the element.

**Did I understand what to DO?** Yes, eventually, and only after forcing it to the top and reading it twice. The actionable core is five things — set 10x, press SLOW, hold to 3 short of the prediction, tap singles waiting after each, watch INTER RANGE and STARTUP RATE rather than REACTOR POWER — and they are genuinely in there. But they are interleaved with **eleven** numeric thresholds (0.15, 0.5, 1.0, 150 s, 60 s, 1.0e5, 4 %, 2.5 s, 25 plant-minutes, 5 minutes, 3 steps) and three conditional remedies, in prose, in the same font weight, with nothing marking which sentence is the instruction. On a first read I came away with "watch INTER RANGE, not REACTOR POWER" (the lesson landed) but *not* with "stop 3 steps short of 208" (the action), which is the wrong half to lose. The instruction and the teaching want to be separated: the four actions as rungs like every other step, and the physics in the BACKGROUND box that is already there and is, on this step, almost empty by comparison (519 characters).

### 7.3 Ordered substeps
They work mechanically and the ordering is visible: the live rung is drawn bright with a `o`, later rungs grey with a `·`, ticked rungs green with a `✓`. Rungs advanced in order every time across steps 5, 6, 7 and 8 — sixteen of them, no misfires. One quibble on the rendering: a *ticked* rung and the *active* rung are both bright green bold, and only the glyph (`✓` vs `o`) separates them; the eye lands on "green = mine" and has to go back and read the marks.

**Clicking the plot row early.** The rows themselves are not clickable at all (`cursor: text`, plain `div`s) — so "clicking the plot row" is not a thing a player can do. What a player *can* do is press the **Plot point** button out of turn, which I did deliberately on step 5 while 5a was still live. Result: **the plant took the point** (a second dot appeared at rod position 0, the panel printed "insufficient trend — keep plotting, C = 537 cps -> 1/M = 0.962") and **the walkthrough said nothing whatsoever**. 5d stayed grey. No message, no flash, no refusal.

That does not feel like "the sim ignored me" — it feels worse, like **the sim accepted me and the walkthrough disagreed**, with no way to tell which one is in charge. And the card's own wording, "Plot point does nothing until the counts are steady", is simply false: it plotted a junk point into a fit the card elsewhere says uses the last three points, and the only remedy on the panel is `Clear`, which would wipe the good points too.

**Measured waits per rung** (I timed all of them; the `a` rung is the hold, `b`/`c` the settles):

| Step | b: STARTUP RATE to zero | c: counts flat | total plant time on the settle |
|---|---|---|---|
| 5 | within ~140 plant-s | ~400 plant-s | ~7 plant-min (100 s wall at 10x) |
| 6 | ~140 plant-s | **~1,000 plant-s** | ~17 plant-min (**100 s wall at 10x**) |
| 7 | ~250 plant-s | ~350 plant-s | ~6 plant-min (35 s wall at 10x) |
| 8 | already met on arrival | ~5 s wall at 60x | — |

So the "settles around 500 seconds" figure is roughly right for step 5 and **about half** the real figure for step 6, which was the worst one: 100 seconds of real time watching a row that reads "Keep waiting until SOURCE RANGE has stopped climbing as well", with no countdown, no bar, and no live number to watch it approach. Step 7's card claims "the settle takes longer at every rung", which is not what happened — step 7 settled in a third of step 6's time.

### 7.4 The four small board items
- **The selected time-rate button.** The current speed is a **green fill** (`class="on"`, background rgba(70,163,94,.42)); the speed the walkthrough is *recommending* is a **bright cyan outline** (`class="ckl-speed-rung"`, border rgb(228,233,238) with a cyan glow). Both have white text; the other buttons are grey. Shot `c069_speedbar` shows `1x` filled green and `10x` cyan-outlined at the same time — and **the outlined suggestion is the more eye-catching of the two**. I read the bar wrong at least once, believing I was at 10x when I was at 1x. The suggestion should not out-shout the state.
- **The walkthrough log panel's height and scrollbar.** `#cklLog` is a fixed 728 px box (`overflow-y: auto`). On short steps content is 728/728 and the card floats at the top with **~400 px of dead space** below it before the button row pinned at the panel floor. On the two long steps it overflowed — 834 px on leg 2 step 8, **995 px** on step 9 — and in both cases `clientWidth === offsetWidth === 318`, i.e. **no scrollbar gutter is drawn**. Text was visibly truncated mid-sentence at the bottom edge on step 8 ("...and nothing in the plant") with nothing to indicate more existed. The panel is simultaneously too empty for most steps and silently too small for the two that matter.
- **The SG FEED RESTORE button and its gpm input.** They share one row, same height, no separator, and **the number box carries no label** — it reads as `RESTORE | 81 gpm`, i.e. as though 81 gpm were RESTORE's argument. The scanner line says they are unrelated: "RESTORE (main feedwater) — Re-opens main feedwater after an automatic isolation. Lit while feed is isolated." The button was grey (not lit) and not disabled all run, so pressing it would have done nothing visible. Neither leg ever mentions either control. Shot `c115_sgfeed`.
- **The TRIP BLOCKS button's colour.** Three distinct states, all carrying the same "2" badge:
  1. *Never opened* — **amber** text and border (rgb 255,209,102) on a dark amber fill, class `bd-btn bd-msg bd-unack`, badge "2". Reads as a warning.
  2. *After opening and closing it* — **plain grey** (rgb 124,147,164), class `bd-btn`, **badge gone**, visually identical to the `1/M PLOT` button beside it. Nothing distinguishes it from a button you have never needed.
  3. *After blocking both trips in leg 2* — **grey-blue**, class `bd-btn bd-info`, badge "2" back.

  The badge reads "2" in state 1 (two trips the plant released) and "2" again in state 3 (two blocks you placed) — the same glyph for two opposite facts. And the amber-to-grey transition in state 2 happens just from *looking*, which reads as "I broke it" rather than "you have read this". Shots `c052_tb_open`, `c053_tb_after`, `c112_tbclosed`.

---

## 8. Coordinator measurements on the §7 items (added by the verification pass)

The §2 stuck points carry their `Measured:` / `Verdict:` lines in place above. The §7 answers
were re-measured too; these are the numbers.

### 7.1 Highlights — press versus watch
**Measured** in the live board with both cues on the same page at the same instant, sampling
computed `box-shadow` every 50 ms across a full 1.2 s cycle:

| | ring | bloom | animation |
|---|---|---|---|
| watch (`.ckl-watch-glow`) | `2.00 px` at alpha **0.90**, flat | `16px 4px` at 0.42 | `none` |
| press at its resting stop | `1.00 px` at alpha **0.62** | `10px 2px` at 0.30 | `cklGlow 1.2s` |
| press at its peak | `2.00 px` at alpha **1.00** | `20px 5px` at 0.55 | |
| pressed (`.ckl-step-done`) | `1.00 px` at alpha 0.62 | `10px 2px` at 0.30 | `none` |

Measured series on the live step-2 glow with the plant running: ring `1.00 … 1.99 … 1.00 …`,
`getAnimations()[0].currentTime` monotonic from 33,680 ms to 36,745 ms over 60 samples — **the
animation is not being restarted by the checklist re-render**, which was the leading hypothesis
and is refuted. Re-measured on a moving plant at 60x at step 3: identical, 1.00 to 2.00 px,
currentTime 6,962 to 10,996 ms with no reset.

Under `prefers-reduced-motion: reduce`: press becomes `outline: 3px dashed rgba(90,240,255,.95)`
with `box-shadow: none`; watch keeps its solid box-shadow ring; pressed becomes the same dash at
`1px`. Three distinct line treatments — `verify_reduced_motion` could not have caught the
default-path problem below, because on the reduced-motion path there is no problem.

**The defect that survives:** the watch ring's 2 px is exactly the pulse's peak width, and at
that peak the press also wins on alpha (1.00 vs 0.90) and bloom (20/5 vs 16/4). For the upper
half of every cycle the ruled "solid thicker ring" is the *thinner* of the two.

**And the one the reviewer filed as an aside:** leg 1 step 4, `Verify the turbine is tripped`,
authors `hl: ['Turbine — Trip']`. `revealControl` resolves that to **[1086, 208, 48 x 22]**,
which is the TRIP button's bounding box to the pixel. A verify step pulses "act on this" on the
turbine trip button.

### 7.3 Ordered substeps — see S-6. Confirmed by driving the live panel.

### 7.4 The four small board items
- **Speed bar.** Measured computed styles on `#speed` at leg 2 step 5: the current rung `1x` is
  `class="on"`, background `rgba(70,163,94,0.42)`, with a static 1 px inset light-grey ring; the
  recommended rung `10x` is `class="ckl-speed-rung"`, dark background, white border and an
  **animated** cyan inset glow, sampled at `rgba(90,240,255,0.753) 0 0 0 1.18px inset`. Motion
  plus saturated cyan against a flat muted-green fill — **confirmed**, the suggestion out-shouts
  the state.
- **TRIP BLOCKS button.** Measured at hot zero power with no trips released: `class="bd-btn"`,
  colour `rgb(124,147,164)`, border `rgb(47,63,75)`, background `rgb(16,22,29)` — **byte-identical
  computed style to the `1/M PLOT` button beside it**, and no badge. The reviewer's "state 2"
  claim is **confirmed**. States 1 (amber, badge "2") and 3 (`bd-info`, badge "2") were not
  reproduced in this pass and the two-meanings-one-glyph claim stands **unmeasured**.
- **Walkthrough log height / scrollbar.** See S-2. The step-advance scroll mechanism is
  confirmed from source; the "no scrollbar gutter" half is **not verified** — headless Chromium
  draws overlay scrollbars that consume no layout width.
- **SG FEED RESTORE and its gpm box.** **Not measured** in this pass.
