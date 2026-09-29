> **Record, not policy.** The SECOND fresh-agent layman pass on the full-power opener (#811), played in headless Edge on 2026-09-28 on workbench (the chat shows the pre-d3a0e05f post-trip wording, i.e. 4dc9c792; d3a0e05f landed mid-pass and merged the post-trip chart lines into "The strip chart now shows Power, Decay Heat and Tavg. Decay Heat falls slowly, over minutes; Power keeps falling toward zero."). The reviewer read only the chat and the board. Their report is below **verbatim**; the **Measured / Verdict** lines under each stuck point were added afterwards.
>
> **How it was measured.** Plant numbers: full stack, the opener driven through `SimulationService` exactly as `test/run_opener.js` drives it (free-play boot at hot_full_power, `start_opener`, real broadcasts, attention stops on), on the reviewer's own action delays — Ready +15 s, LOAD 80 MW +11 s, INSERT held at FAST 34 s, spray 100 % +13 s, AUTO +9 s, SCRAM +8 s after each ask. The SCRAM arm window and the dump-% pointer were measured in headless Edge on `ui/shell.html?engine=pwr2`. The reviewer reports its own polling lag (one message ~55 s wall late; its T+ clock locked to an alarm timestamp after 5:20), so its stamps are read as ORDER, not time.
>
> **Nothing was changed.** No finding is a clear non-wording, non-physics defect: every survivor is copy, a board caption, or an instrument design choice (S-5) that needs a ruling. Proposed replacement lines are at the foot.

# Full-power opener: layman playthrough

## 1. Outcome
**Finished.** It took about 5 min 45 s of wall time (19:46:09 to 19:51:51 local) and 7:38 of sim time by the instructor's stamps. I got to the "🏁 Full-power opener" end card with Continue / Retry. I never got stuck for long. **The thing that mattered most** was that the instructor outlined the panel it was talking about (TURBINE-GENERATOR, ROD CONTROL, PRESSURIZER, STEAM DUMP). Every control I was told to use was inside the lit box, so I found each one on the first try.

Harness caveat: my polling loop missed the 2:27 message ("press FAST, then hold INSERT…") for about 55 s of wall time. That was my loop, not the page, but the plant sat at 1× while I was late. The run was still fine.

## 2. Stuck / confusing points (by severity)

**S-1: SCRAM needs two presses, and the message says one.**
Message (6:09): "Clock back to 1×. Last move: trip the reactor. Press SCRAM."
What I did: I pressed SCRAM once and looked back 5 s later. The button read "SCRAM / PRESS TO ARM" again and nothing had happened, so the arm had timed out. Then I pressed it again and saw "CONFIRM / PRESS AGAIN TO TRIP", pressed a third time, and the plant tripped. A player who presses once and turns to read the panel loses the arm and thinks the button is broken.
What would have unstuck me: "Press SCRAM twice: once to arm, once to confirm."
**Measured** (headless Edge, `.bd-scram` clicked once, label polled every 20 ms): `CONFIRM / PRESS AGAIN TO TRIP` at 1 ms, back to `SCRAM / PRESS TO ARM` at **3032 ms** of wall time — the `setTimeout(..., 3000)` in `buildScram` (`ui/diagram/board/pwr_board.js`). The reviewer looked back after ~5 s, so the arm had expired. The opener line says "Press SCRAM." with no mention of the second press; the procedure copy elsewhere does say it (`ui/manual_procedures.js`: "once to arm it (PRESS TO ARM), then again to scram"). No strand: `o10_scram` has a 90 s quiet inaction exit that trips the plant for the player.
**Verdict: confirmed** (wording). The two-press guard and its 3 s window are deliberate; the line should name them.

**S-2: "Power drops toward the load" compares % with MW.**
Message (4:08): "Rods in means fewer neutrons: power drops toward the load and Tavg comes back down."
What I did: I watched REACTOR POWER. It stopped at 83.6–83.7 % while LOAD reads 80 MW. As a layman I expected it to reach 80 and wondered whether I had done something short.
What would have unstuck me: one clause saying that power in % and load in MW are not meant to match exactly (for example "to about 84 %").
**Measured** (at `o6_spray`, the moment the 30 s watch that carries this line ends): REACTOR POWER **83.72 %**, OUTPUT **79.7 MW**, steam dump **16.0 % open** (controller `loss_of_load`, armed). Turbine steam 0.802 of rated vs total steam out 0.850 — the dump is carrying **~4.8 % of rated steam** to the condenser, which is the gap. It stays open because Tavg **580.1 °F (304.5 °C)** is **6.6 °F (3.7 °C) above Tref 573.5 °F (300.8 °C)** for 80 MW: 41 steps of rod did not bring Tavg down to the 80 % program. Still 83.68 % / dump 14.6 % 41 s later, at the AUTO ask.
**Verdict: confirmed, cause identified.** Not an MW-vs-% mapping issue (100 MW ↔ 100 % holds): the remaining ~4 % is heat the still-open steam dump takes to the condenser. The line promises a match it cannot show on this route.

**S-3: Where the steam dump % is.**
Message (1:46): "The steam dump opened; its % shows by the condenser valve."
What I did: the STEAM DUMP panel shows "AUTO / OPEN / CLOSE" with OPEN greyed out. That looks like the dump is *not* open. The % turned out to be a small unlabeled number beside a valve symbol above the condenser ("50 %", later "18 %", "16 %"). A second valve next to it reads "0 %", and I could not tell which of the two was the dump. The outline at 6:48 went on the STEAM DUMP panel, not on that valve.
What would have unstuck me: a "DUMP %" readout in the STEAM DUMP panel, or pointing at the valve itself.
**Measured.** The two tags: `imsgunuyvon` (right edge at board x 1235, reads `steam_dump_valve`) is the **condenser steam dump**; `imsguptyg16` (right edge at x 1165, reads `adv_valve`) is the **atmospheric dump (ADV)**, which is shut in this opener, hence 0 %. Rendered at 1600×1000: dump valve 764–813 px with its tag at 812–831 px; ADV valve 716–751 px with its tag at 750–769 px — the ADV's "0 %" sits directly against the LEFT edge of the steam-dump valve, so the valve is bracketed by two identical unlabelled % tags. Neither carries a caption or a `title`; only the Scanner hover names them ("Steam Dump Position" / "Atmospheric Dump Position"). **The o3 pointer lands on the right one:** `pointAt(['Steam Dump Opening'])` resolves to `imsgunuyvon` in the browser — but it shows for **4.2 s of wall time** (`POINT_MS`), which the reviewer's polling lag missed; clicking the chat line re-shows it. The 6:48 outline is `o12_settle`'s `highlight: 'Steam Dump'` = the STEAM DUMP control card (`imrop5ouw7h`), which carries no position; that beat has no pointer at the %. Minor: the ADV tag's authored item name in `pwr_board_data.js` is still "STEAM TURB FLOW indication" (internal only; not player-visible).
**Verdict: confirmed** (board caption + pointer target). Same finding as pass 1's S-6, now narrowed to the adjacent ADV tag being the confusable.

**S-4: Neutron power figure did not match the tile.**
Message (6:43): "Neutron power fell to about 2 % in seconds, but the fuel still makes about 5 % of full heat from decay."
What I did: REACTOR POWER already read 0.4 % (then 0.3 %) when I read this. The chart's Decay Heat line read 3.62 %, not "about 5 %". The 6:43 follow-up does say decay heat "starts near 5 % and falls slowly", which partly explains it.
What would have unstuck me: saying "under 1 %" for neutron power, or quoting the numbers as "at the moment of the trip".
**Measured** (the line fires at `o11_trip`, 11.7 s after the trip command): neutron power **2.07 %**, decay heat **5.05 %** — the text is right when it appears. The reviewer's 0.4 % / 3.62 % are the values at **trip + ~67 s** (measured 0.39 % / 3.65 %), which is the finish-card moment, and their "Tavg already 553 F" for the 6:48 line matches trip + 50–67 s (553.7 → 553.0 °F) against 562.5 °F when that line actually fires (trip + 17 s). All three readings put the reviewer ~50–55 s of sim behind the chat, the lag it reports itself.
**Verdict: not reproduced** — reader lag, not stale text. No change recommended.

**S-5: A wall of alarms after the trip.**
Five alarms went up at once: "Reactor Trip — Manual Trip", "Pressurizer Pressure Low", "Turbine Trip / Low Steam Demand", "Cooldown Rate High (>100 °F/hr)" and "Pressurizer Level Above Program". The 6:48 message ("The alarms now in are expected after a trip. Cooldown Rate High is Tavg dropping to its no-load value.") did reassure me. But it arrived about 17 s after the alarms, and I still didn't know whether to press ACK / Ack All. At the end COOLDOWN RATE still read −155 F/hr while Tavg sat at 552–553 °F, which looked contradictory.
What would have unstuck me: "You don't need to acknowledge them."
**Measured — the COOLDOWN RATE tile** is `bdRhrCooldownRate`, which prints `instruments.tavg_rate`: indicated Tavg, differentiated and passed through a first-order filter with **rate_tau = 600 s** (`engines/pwr/pwr_config.js`, #375). The `Cooldown Rate High` alarm reads the same channel at −55.6 °C/hr (−100 °F/hr). Against the true Tavg slope (±15 s central difference), SCRAM at t = 0:

| after trip | Tavg (true) | true d(Tavg)/dt | COOLDOWN RATE meter |
|---|---|---|---|
| +5 s | 573.8 °F | −2,740 °F/hr | −15 °F/hr |
| +17 s | 558.8 °F | −3,000 °F/hr | −104 °F/hr (alarm in at +15.9 s) |
| +30 s | 554.7 °F | −770 °F/hr | −145 °F/hr |
| +67 s (finish card) | 553.1 °F (289.5 °C) | **−125 °F/hr** | **−151 °F/hr** |
| +120 s | 551.4 °F | −69 °F/hr | −146 °F/hr |
| +180 s | 550.8 °F | −13 °F/hr | −139 °F/hr |
| +300 s | 550.4 °F | −11 °F/hr | −113 °F/hr |
| +405 s | 550.2 °F | −7 °F/hr | −96 °F/hr (alarm clears at +405.5 s, then **chatters 4× in 8 s**) |

So at the reviewer's last look the plant **was still cooling at ~125 °F/hr** — Tavg 553.1 → 551.4 °F over the next 53 s; a 1 °F tile ticking every ~30 s reads as flat. The meter was about right *then*. Its lag is real but elsewhere: it under-reads the 20 s post-trip plunge ~30× (−104 vs −3,000 °F/hr) and over-reads from ~2 min on (−139 vs −13 at +3 min), holding the alarm lit **6.8 minutes** after the plant has essentially stopped. The design note behind tau = 600 s says it keeps a normal post-trip settle quiet ("≈7 °C over ~90 s … at 600 s it reads ≈ −39 (quiet)") — that was measured on the retired engine. On PWR2 the settle is **~27 °F (15 °C) in ~30 s** and Cooldown Rate High fires on **every** trip. The tile shows the channel faithfully, so this is an instrument design choice, not a display bug — **not changed**.
**ACK:** nothing in the opener mentions acknowledging (`grep -i ack` over `scenarios/opener_pwr2_hfp.js`: only the Ready button's style name), and no opener beat triggers on an acknowledgement — every trigger is a delay, an instrument or a control action — so leaving them unacknowledged costs the player nothing.
**Verdict: narrowed.** The end-card "contradiction" is the 1 °F tile hiding a ~125 °F/hr cooldown still in progress; the meter's 10-minute damping is a separate, real instrument question (alarm on every PWR2 trip, 6.8 min lit, chatter on clear) that needs a ruling. The ACK question is confirmed: the text never says.

**S-6 (minor): "Pressurizer Pressure Low" alarm during the spray step went unmentioned.**
At 5:20 a red alarm appeared, "Pressurizer Pressure Low … warning". The instructor never mentioned it. I wondered whether I had overdone the spray.
**Measured:** `Pressurizer Pressure Low` (setpoint 14.82 MPa = 2149.5 psia) came in at **2149.3 psi (14.82 MPa)**, on the **same broadcast** as "That's enough. Put the spray back in AUTO." — `o8_auto` triggers on pressure below 2150 psi, one hundredth of a psi above the alarm. On this route it stays lit through the heater recovery and the trip (pressure 2147 psi at the SCRAM). No line mentions it.
**Verdict: confirmed** (wording). The alarm is the intended effect of the step, and its arrival is exactly the "that's enough" cue.

**S-7 (minor): "⏩ reveal all" is unexplained.** I didn't know whether pressing it would skip the lesson, so I left it alone.
**Measured:** `⏩ reveal all` (`ui/app.js`, `chat-reveal-all`) is shown whenever paced chat lines are still pending; it only dumps the remaining lines of the current conversation at once (display-only, the instructor log is untouched, no beat is skipped). Its explanation exists only as a Scanner hover hint ("Reveal all — show the rest of this conversation at once instead of line-by-line."); no `title` attribute.
**Verdict: confirmed** (label). Harmless to press; nothing on the button says so.

## 3. Per-message log
(Times are the instructor's sim-time stamps.)

| # | Time | Message (quoted) | Asked me to | What I did | Next message after | What I saw |
|---|---|---|---|---|---|---|
| 0 | — | Button "Full-power opener — 5 min, guided" (under a "Main Menu" window that was open on load) | start | Closed the Main Menu with "✕ Close", then clicked the opener | immediate | Clock started at 1×; PRIMARY PRESSURE tile outlined. A "Reopen it here any time" hint appeared at the speed bar. |
| 1 | 0:00 | "Fresh start at full power. I'll show you a few cause-and-effect moves, about five minutes. Press End anytime to stop." | nothing | read | a few s | — |
| 2 | 0:00 | "Right now: reactor 100 %, generator 100 MW, pressure 2235 psi, Avg Coolant Temperature (Tavg) 580 °F. Everything is steady." + **Ready** | press Ready | Ready | ~2 s | Tiles: 99.5 %, 580 F, 2237 psi; OUTPUT 100 MW. All findable. "Tavg" is explained as the AVG COOLANT TEMPERATURE tile, which is good. |
| 3 | 1:20 | "First move: set Turbine Load to 80 MW. That asks the turbine for less steam." | type 80 in LOAD | Clicked the LOAD box (TURBINE-GENERATOR, outlined), typed 80, Enter | ~11 s | LOAD 80 MW; OUTPUT fell to 80 MW. The label is "LOAD", not "Turbine Load", but the outline made it obvious. |
| 4 | 1:20 | "I put Tavg, Pressure, Steam Dump and Power on the strip chart so you can watch." | watch | — | — | Chart showed Power %, Tavg, Pressure, Steam Dump. |
| 5 | 1:31 | "Clock to 5× so this moves along. Less steam leaves, so the primary heats up. Watch Tavg climb." | watch | — | 15 s | Tavg 580 → 584 F. Visible on tile and chart. |
| 6 | 1:46 | "Warmer water swelled into the pressurizer and pushed pressure up. The steam dump opened; its % shows by the condenser valve." | find dump % | Looked at STEAM DUMP panel (OPEN greyed), then found "50 %" by a valve above the condenser | — | Pressure 2248 psi; PZR level 62 → 65 %. See S-3. |
| 7 | 1:46 | "Warmer water also trimmed reactor power a few percent by itself. That is moderator temperature feedback." | watch | — | 41 s | Power 99.5 → 93.7 %. Clear on the chart. |
| 8 | 2:27 | "Clock back to 1×. Your turn: press FAST, then hold INSERT under CONTROL about 35 seconds. Rods go in about 40 steps; watch power follow." | FAST, hold INSERT 35 s | FAST (lit), held CONTROL INSERT from sim 3:33 to 4:07 (~34 s) | ~1 s after release | CONTROL ROD POSITION 606 → 565 (41 steps, as promised). Power 93.7 → 83.6 %. Buttons were outlined; "INSERT" lit amber while held. |
| 9 | 2:27 | "The strip chart now shows Power, Control Rod Steps and Tavg." | — | — | — | Yes, the rod-steps trace fell in step with power. |
| 10 | 4:08 | "Clock to 5×. Rods in means fewer neutrons: power drops toward the load and Tavg comes back down." | watch | — | 30 s | Tavg 581 → 580 F; power settled at 83.7 %. See S-2. |
| 11 | 4:38 | "Clock back to 1×. Now pressure. Put Pressurizer Spray in MANUAL, type 100 in its % box and press Enter." | MANUAL + 100 + Enter | SPRAY → MANUAL, clicked "0 %" box, typed 100, Enter | ~13 s | MANUAL lit; PZR SPRAY 100 %; spray shown on the pressurizer graphic. The PRESSURIZER panel was outlined. |
| 12 | 4:38 | "The strip chart now shows Pressure and Spray." | — | — | — | Yes. |
| 13 | 4:51 | "Spray showers cooler water into the pressurizer's steam bubble. Steam condenses and pressure falls. Watch Primary Pressure." | watch | — | 29 s | 2212 → 2147 psi. Alarm "Pressurizer Pressure Low" appeared (S-6). |
| 14 | 5:20 | "That's enough. Put the spray back in AUTO." | AUTO | SPRAY AUTO | ~9 s | Spray 0 %. |
| 15 | 5:29 | "Clock to 5×. Spray is back in AUTO. The heaters came on full when pressure fell, and slowly boil water to rebuild pressure." | watch | — | 40 s | HTR PWR 100 %; pressure 2147 → 2160 psi. Visible. |
| 16 | 6:09 | "Clock back to 1×. Last move: trip the reactor. Press SCRAM." | SCRAM | 1 press → arm expired; then 2 presses (CONFIRM → trip) | ~12 s after trip | SCRAMMED; rod positions 0/627 and 0/627; turbine tripped. See S-1. |
| 17 | 6:43 | "All rods dropped. Neutron power fell to about 2 % in seconds, but the fuel still makes about 5 % of full heat from decay." | — | — | — | Tile 0.4 %. See S-4. |
| 18 | 6:43 | "The strip chart now shows Power, Decay Heat and Tavg." | — | — | — | Yes. Decay Heat 3.62 % and falling slowly. |
| 19 | 6:43 | "See Decay Heat on the strip chart. It starts near 5 % and falls slowly over minutes, while neutron power drops to zero in seconds." | watch | — | 5 s | Power trace a cliff; decay heat a slow slope. This was the clearest picture of the whole run. |
| 20 | 6:48 | "Clock to 5×. The turbine tripped, so the steam dump takes the decay heat. Tavg drops toward about 552 °F." | watch | — | — | Tavg was already 553 F when I read it. STEAM DUMP panel outlined. |
| 21 | 6:48 | "The alarms now in are expected after a trip. Cooldown Rate High is Tavg dropping to its no-load value." | — | — | 50 s | 5 alarms. See S-5. |
| 22 | 7:38 | "That's the loop: load, rods, pressure, trip. Clock back to 1×. The Walkthroughs tab goes deeper." + end card "Continue leaves you in free play on this tripped plant. Retry starts over at full power." [Continue] [↺ Retry] | choose | Stopped here | — | Tavg 552 F, decay heat 3.51 %. |

Things I did that the text did not say:
- Closing the Main Menu window to reach the opener.
- Pressing SCRAM a second time. The button's own "CONFIRM / PRESS AGAIN TO TRIP" told me to; the message did not.
- Clicking into the spray % box, which shows "0 %", before typing. That is implied by the message.

## 4. Words and numbers vs the board

| Message said | Board shows |
|---|---|
| "Turbine Load" | "LOAD" (in TURBINE-GENERATOR) |
| "Pressurizer Spray … its % box" | SPRAY column in PRESSURIZER (PZR); % box under "0-100%" |
| "steam dump … its % shows by the condenser valve" | No dump % in the STEAM DUMP panel (OPEN greyed). An unlabeled "50 %" sits beside a valve above the condenser, next to another valve reading "0 %". |
| "power drops toward the load" (load = 80 MW) | REACTOR POWER stops at 83.7 % |
| "Neutron power fell to about 2 %" | REACTOR POWER 0.4 % when the message arrived |
| "about 5 % of full heat from decay" | Decay Heat 3.62 % on the chart at that moment |
| "Tavg drops toward about 552 °F" | Already 553 F when the message arrived; 552 F at the end |
| "Press SCRAM" | "SCRAM / PRESS TO ARM" → "CONFIRM / PRESS AGAIN TO TRIP" |
| "Primary Pressure" | PRIMARY PRESSURE, which matches exactly |

## 5. What worked
- The panel outlines always boxed the exact control named.
- The strip chart swapped to the relevant traces at each step, and the message said so.
- The "about 40 steps" rod promise matched: 606 → 565.
- The decay-heat vs neutron-power chart after the trip.
- The automatic clock changes. I never had to touch the speed bar, and the waits were short.
- The end card said plainly what Continue and Retry do.

## 6. What I learned
Taking load off the turbine means less steam leaves, so the water in the reactor loop warms up. That warmer water swells into the pressurizer, pushes pressure up, and on its own knocks reactor power down a few percent. Pushing the control rods in cuts power directly. Spraying water into the pressurizer drops pressure fast, and the heaters then slowly rebuild it. When you trip the reactor, the chain reaction stops in seconds, but the fuel keeps making a few percent of its heat from decay, and the steam dump has to carry that away. I'd keep playing: every move had a visible effect I could see coming, and I'd try the Walkthroughs next.

## Verification summary

| # | Saw | Measured | Verdict |
|---|---|---|---|
| S-1 | "Press SCRAM" — one press, arm expired | arm reverts at **3032 ms** wall (`pwr_board.js`, 3000 ms timer) | confirmed — wording |
| S-2 | power stops at 83.7 % vs 80 MW load | 83.72 % / 79.7 MW with dump **16.0 %** open (~4.8 % of rated steam), Tavg 6.6 °F over Tref | confirmed — cause is the open dump; wording |
| S-3 | dump % unlabelled, beside a 0 % tag | 0 % tag = ADV (`imsguptyg16`), abutting the dump valve's left edge; o3 pointer resolves to the dump tag but lasts 4.2 s; o12 lights the card only | confirmed — board caption + pointer |
| S-4 | post-trip figures stale | at the line: 2.07 % / 5.05 %; reviewer's 0.4 % / 3.62 % = trip + ~67 s | not reproduced — reader lag |
| S-5 | COOLDOWN RATE −155 °F/hr, Tavg flat | at the card true rate **−125 °F/hr** vs meter −151; meter tau 600 s: −104 vs −3,000 at +17 s, −139 vs −13 at +3 min; alarm lit 6.8 min, chatters on clear | narrowed — end card not contradictory; meter damping needs a ruling; ACK never mentioned |
| S-6 | Pressure Low alarm during spray, unmentioned | in at 2149.3 psi (14.82 MPa), same broadcast as "That's enough" | confirmed — wording |
| S-7 | "⏩ reveal all" unexplained | display-only catch-up; hint only in Scanner hover | confirmed — label |

## Proposed replacements (Learning register, for the owner to rule on)

| Beat | Current | Proposed (≤ 25 words) |
|---|---|---|
| `o10_scram` (S-1) | "Clock back to 1×. Last move: trip the reactor. Press SCRAM." | "Clock back to 1×. Last move: trip the reactor. Press SCRAM, then press it again within 3 seconds to confirm." (20) |
| `o5_rods_watch`, added 2nd line (S-2) | — | "Power settles near 84 %, not 80: the steam dump still sends a few percent of the heat to the condenser." (21) |
| `o3_dump` (S-3) | "…The steam dump opened; its % shows by the condenser valve." | "Warmer water swelled into the pressurizer and pushed pressure up. The steam dump opened; its % is the number right of its valve." (23) — only after the board caption below |
| `o12_settle` 2nd line (S-5) | "The alarms now in are expected after a trip. Cooldown Rate High is Tavg dropping to its no-load value." | "These alarms are expected after a trip; no need to acknowledge them. Cooldown Rate averages over minutes, so it stays high after Tavg levels off." (25) |
| `o8_auto` (S-6) | "That's enough. Put the spray back in AUTO." | "That's enough. Put the spray back in AUTO. The Pressurizer Pressure Low alarm is the pressure drop you just made." (20) |

"About 84 %" is measured on the typical route and the reviewer's (both 83.7 %); the mistake and hands-off routes were not measured for it.

## Proposed board / UI changes (smallest)

1. **S-3 — caption the two tags.** Add two small `text` EXTRA_ITEMS, "DUMP" under `imsgunuyvon` and "ADV" under `imsguptyg16` (9–10 px, same colour), geometry to be swept against neighbours like `bdRhrCooldownRate` was. Captions rather than prefixing the value ("DUMP 16 %"): both tags are right-anchored, and a wider string grows left over their own valves. Also rename the ADV tag's stale internal name "STEAM TURB FLOW indication".
2. **S-3 — point o12 at the %.** Make `o12_settle`'s first line a `sayAt('Steam Dump Opening', …)`, so "the steam dump takes the decay heat" flashes the reading, not only the control card.
3. **S-7** — give the button a `title` ("Show the rest of this message now. Skips nothing."), or relabel it "⏩ show all lines".
4. **S-5 (needs a ruling, not an opener change)** — the `tavg_rate` meter's 600 s damping. Options: (a) keep it and say so in the copy (above) — recommended, since the opener already names the alarm as expected; (b) shorten tau — makes the meter track the plant but the post-trip plunge (~3,000 °F/hr for ~20 s) then reads far higher, so the alarm still fires every trip, louder; (c) a windowed "change over the last hour" form — would need an evidence pass on how real plants display the 100 °F/hr limit (not done; unsourced). Separately, a clear deadband would stop the 4× chatter at +405 s.

## Not verified

- The mistake and hands-off routes for S-2's 84 % figure and for S-6's alarm timing.
- Whether "no need to acknowledge them" holds beyond the opener (free play after Continue).
- The reviewer's heater-recovery reading (2147 → 2160 psi); this route read 2147 psi at the SCRAM.
- Any real-plant source for how the cooldown-rate limit is displayed (option c).
