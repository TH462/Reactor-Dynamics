> **Record, not policy.** A fresh agent with no repo access played the full-power opener (#811) in headless Edge on 2026-09-28 (workbench, HEAD 90bb4369), reading only the chat and the board, as a layman. The report below is theirs, verbatim; the **Measured / Verdict** lines under each stuck point were added afterwards by re-measuring on the full stack (the opener driven through the service exactly as the UI drives it: free-play boot at hot_full_power, `start_opener`, real broadcasts and attention stops — the `test/run_opener.js` driver). The reviewer's observations stand; the causes are the measurement's.
>
> **Fixed the same day:** S-1 (the rods ask's help and its 5× watch fired under a held INSERT) — `inaction` gained `quiet: true` and a `no_hold` trigger (`layers/instructor_layer.js`), applied to every opener ask (`scenarios/opener_pwr2_hfp.js`), regression suite in `test/run_opener.js`. Every wording finding is left as a proposed replacement for the owner to rule on; no message text was changed.

# Full-power opener — layman playthrough (2026-09-28)

## 1. Outcome
**Finished.** Sim clock T+0:00 → 7:49 on the opener's clock (the alarms stamp the trip at T+00:06:41), about 12 minutes of wall time including my own slow polling. All four moves done: load cut, rods in, spray, SCRAM, then "Continue" into free play.
**The one thing that mattered most:** the rod step. "drive Control Bank in about 40 steps" gives no idea that at FAST and 1× that takes about **40 seconds of holding** (I measured 3 steps in a 3 s hold, 606 → 603). While I was still holding, the instructor said "I'll drive the rods in 40 steps for you" and switched the clock to 5×, and the count ran 591 → 573 → 560 in 6 s under my finger. Rods ended at **560, 46 steps in, not 40**, and I cannot tell which of those steps were mine.

## 2. Stuck / confusing points (ranked)

**S-1 — Rod drive: no sense of how long, and the instructor takes over mid-hold.**
Message: "Clock back to 1×. Your turn: set rod speed to FAST, then drive Control Bank in about 40 steps. Watch reactor power follow."
What I did: clicked FAST (it lit up), then held CONTROL › INSERT. A 3 s hold moved 606 → 603. I kept holding. At 4:28 "I'll drive the rods in 40 steps for you." then 4:29 "Clock to 5×…" arrived during my hold, and the rods jumped 9 then 18 steps per 3 s. Released at 560.
What would have unstuck me: "Hold INSERT for about 40 seconds; CONTROL ROD POSITION counts down from 606 to about 566", plus not changing the clock while a hold is in progress.
**Measured** (full-stack driver, typical route to the rods ask, INSERT held at FAST 40 s from +85 / +100 / +115 s): before the fix `o4_help` ("I'll drive the rods in 40 steps for you") fired at **exactly +120.0 s every time** with the hold in progress, the clock went 5× at +121.2 s, and the bank ran on to 558 (48 in). The `inaction` trigger was plain elapsed time since the ask; nothing the player did reset it. **Second cause, found on the reviewer's own shape** (a 3 s probe hold, then a long hold from +110 s): the help did NOT fire — instead the "graded on release" acceptance took the EARLY release from the action memory, and `o5_rods_watch` (5×) fired at **+115.4 s** and the spray ask at **+145.4 s**, both with INSERT still held. FAST is 72 steps/min: a 40 s hold is 48 steps, ~33 s is 40. After the fix: no beat fires and the clock stays 1× through every hold; the ask is met 1.3 s after the final release; a player who taps 3 steps at +60 and stops gets the help at +180.2 s.
**Verdict: confirmed** (two causes; both fixed).

**S-2 — "Control Bank" is not a word on the board.**
The rod box says "ROD CONTROL" with two columns, "CONTROL" and "SHUTDOWN", each with WITHDRAW/INSERT. I guessed "Control Bank" = the CONTROL column and "drive in" = INSERT. Only the hover scanner says "INSERT (control bank)". It was a guess that happened to be right.
What would have unstuck me: "press and hold INSERT under CONTROL".
**Measured** (board doc `pwr_board_data.js`): the rod box is titled ROD CONTROL, the column CONTROL (item `imrpk3wvydp`), the buttons WITHDRAW / INSERT. "Control Bank" is only the highlight vocabulary key (`pwr_board_wiring.js`) and the Scanner hover text, never board text.
**Verdict: confirmed** (wording).

**S-3 — Decay heat "holds near 5 %" while the chart shows it falling.**
Message: "See Decay Heat on the strip chart, next to Power and Tavg. Decay heat holds near 5 % while neutron power falls toward zero."
What I saw: Decay Heat 4.43 % (shortly after the trip), then 3.04 % at the end. That is dropping, not holding. It left me unsure what I was supposed to see.
What would have unstuck me: "Decay heat starts near 5 % and falls slowly, over minutes, while neutron power drops to zero in seconds."
**Measured** (typical route, trip from ~84 % at 80 MWe): decay heat 5.75 % at the trip, **5.03 % when the line appears** (+12.1 s), 4.85 % at +17 s, **3.67 % at the finish card** (+67.5 s) — down 27 % across the beat's window; neutron power 2.02 → 0.42 %. The reviewer's 3.04 % is later still: the finish card leaves the clock running at 1×, and their screenshot (Tavg 551 °F vs 553.5 °F at the card here) was taken after it.
**Verdict: confirmed** ("holds" is untrue: it falls, slowly).

**S-4 — Five alarms after the trip, never mentioned.**
After SCRAM the ALARMS box filled up: "Reactor Trip — Manual Trip" (critical), "Turbine Trip / Low Steam Demand", "Pressurizer Pressure Low", "Cooldown Rate High (>100 °F/hr)" (COOLDOWN RATE read −150 then −137 F/hr), "Pressurizer Level Above Program — letdown is not holding" (while PRESSURIZER LEVEL was *falling*, 60 → 42 %). The instructor said nothing about them, so I could not tell whether this was normal or I had broken something. "Level Above Program" while the level is falling reads like a contradiction to me.
What I did: nothing (the messages did not say to). I did not ack them.
What would have unstuck me: one line saying "Alarms after a trip are expected; the cooldown one is the plant settling to its no-load temperature."
**Measured** (typical route, first activation vs the trip): Reactor Trip and Turbine Trip +0.1 s; Cooldown Rate High **+15.8 s** (Tavg rate −135 °F/hr at +25 s, −155 °F/hr at +45 s, −149 °F/hr at +65 s — the plant falls from 580 to ~553 °F in ~40 s); Pressurizer Level Above Program **+21.7 s**. Pressurizer Pressure Low first came up BEFORE the trip, at the spray (−57.8 s), and again after it (reviewer stamp +2 s). **"Above Program" is arithmetically correct**: the program follows Tavg down from ~61.5 % to **32.0 %** while the level falls only 60 → 46 %, deviation +14.1 points at +45 s against the +10 setpoint. The label's cause clause, "letdown is not holding", is a diagnosis that does not describe this moment (the reviewer's board: charging 0 gpm, letdown 11 gpm, level falling toward program). Alarm logic not changed (out of scope); flagged for a ruling.
**Verdict: narrowed** — five expected post-trip alarms the opener never mentions; one alarm's label states a cause that is not the cause here.

**S-5 — "Watch Plant Pressure" — no such label.**
Message: "Spray showers cooler water into the pressurizer's steam bubble. Steam condenses and pressure falls. Watch Plant Pressure."
Board: tile "PRIMARY PRESSURE", strip chart "Pressure". Easy to guess, but the words differ.
What would have unstuck me: say "Primary Pressure".
**Measured**: the tile is PRIMARY PRESSURE (`ims2immsvn6`); "Plant Pressure" is only the highlight key.
**Verdict: confirmed** (wording).

**S-6 — "The steam dump opened" — the Steam Dump box shows no opening.**
Message (1:47): "…The steam dump opened to carry the extra heat to the condenser." and after the trip "the steam dump takes the decay heat".
Board: the STEAM DUMP box shows AUTO / OPEN (greyed) / CLOSE and STEAM PRESS / DUMP SETPOINT, but no position. The only open-amount I could find was the strip chart "Steam Dump 18%" and an unlabelled "19 %" next to a valve symbol on the pipe near the condenser (which later read 24 %, then 11 %). The OPEN button being *greyed* while the text says it "opened" confused me.
What would have unstuck me: a % readout in the STEAM DUMP box, or "see Steam Dump on the strip chart".
**Measured**: the STEAM DUMP card (`imrop5ouw7h`) carries AUTO / OPEN / CLOSE, STEAM PRESS and DUMP SETPOINT — no position. The old labelled STEAM DUMP % tile (`imrzmlyafa3`) is in the wiring's DOC_REMOVE since the 2026-08-05 re-export; the only board readout of the opening is `imsgunuyvon`, the unlabelled % tag beside the condenser dump valve (vocabulary key 'Steam Dump Opening'). The o3 line points at 'Steam Dump Valve' and o12 highlights the card, so neither lights the % the text is about. OPEN greyed in AUTO is the manual command, not a status.
**Verdict: confirmed** (board has no labelled dump %; pointer aims at the valve and the card).

**S-7 — "Tavg" — not the tile's name.**
First used in "Right now: … Tavg 580 °F". The tile says "AVG COOLANT TEMPERATURE 580 F". I matched it by the number. "Tavg" does appear later on the strip chart, and as "TAVG" in the corner of the STEAM DUMP box (where it seems to mean something else, a mode).
What would have unstuck me: "Tavg (Avg Coolant Temperature)" the first time.
**Measured**: the tile is AVG COOLANT TEMPERATURE (`ims2immk7ks`); "Tavg" is the strip-chart trace name and the highlight key; TAVG in the STEAM DUMP card is the dump MODE.
**Verdict: confirmed** (wording).

**S-8 — "open it all the way" — how?**
Message: "Put Pressurizer Spray in MANUAL and open it all the way."
The SPRAY column has AUTO / MANUAL / OFF and a box labelled "0-100%". I clicked MANUAL, then typed 100 and Enter. Nothing says to type a number (no slider, no OPEN button). PZR SPRAY on the diagram then read 81 %, and the strip chart 51 % a moment later: it ramps, but I wasn't told so, and briefly wondered if 100 had taken.
What would have unstuck me: "type 100 in the spray % box and press Enter".
**Measured**: the spray control is a "0-100%" number box with a spinner; spray delivery ramps — 59 % one second after 100 is entered, 97.9 % at +4 s, 99.9 % at +7 s.
**Verdict: confirmed** (wording; the ramp is ~4 s).

**S-9 — Spray and heaters both at 100 % at once, not explained.**
During the spray step the HEATER box read 100 % (AUTO) and HTR PWR 100 %, while the spray was 100 %. So the heater was already "running full" before the message "Back in AUTO, the heaters run full to boil water and rebuild pressure." To me it looked like they were fighting each other.
What would have unstuck me: one line saying the heaters had already come on to push back.
**Measured** (typical route): pressurizer heaters at 36 kW (proportional bank full) when the spray ask appears, **157.8 kW = proportional 36.4 + backup 121.4, i.e. all heaters,** from 3 s after the spray opens until well after AUTO — so "Back in AUTO, the heaters run full" describes something that was already true during the spray. Mistake route not measured.
**Verdict: confirmed** (wording).

**S-10 — Small words that differ: "Turbine Load … 80 MWe".** Board: "TURBINE-GENERATOR › LOAD 100 MW". I found it through the blue outline, not the words. "MWe" vs "MW" did not stop me.
**Measured**: board reads LOAD … MW and OUTPUT … MW; the copy says MWe.
**Verdict: confirmed** (wording, minor).

**S-11 — Unexplained speed badge.** When the instructor changed speed, an orange badge "→ 4×" (later "→ 5×") appeared right of the speed buttons. Not explained. The T+ clock in the header is partly covered by the "TEST BUILD" badge.
**Measured**: TEST BUILD badge overlapping the header text — visible in the reviewer's `p19_end.png`. The orange "→ 4× / → 5×" badge was not re-measured.
**Verdict: confirmed (badge overlap) / not verified (speed badge).**

## 3. Per-message log
Clock times are the opener's own stamps.

| # | Time | Message (quoted) | Asked me to | What I did | Next message after | What I saw |
|---|---|---|---|---|---|---|
| 0 | — | Main Menu window open over the board | — | Clicked "✕ Close" (the page's text-search for "Close" first hit a board "CLOSED" button, so I clicked by position) | — | board visible, clock already running |
| 1 | 0:00 | "Fresh start at full power. I'll show you a few cause-and-effect moves, about five minutes. Press End anytime to stop." | nothing | read | — | "Reopen it here any time" banner appeared over the speed bar |
| 2 | 0:00 | "Right now: reactor 100 %, generator 100 MWe, pressure 2235 psi, Tavg 580 °F. Everything is steady." + **Ready** button | press Ready | pressed Ready at ~1:19 (my delay) | immediate | matched tiles: REACTOR POWER 99.8, PRIMARY PRESSURE 2236, AVG COOLANT TEMPERATURE 580; OUTPUT 100 MW |
| 3 | 1:19 | "First move: set Turbine Load to 80 MWe. That asks the turbine for less steam." | set load 80 | board dimmed, turbine outlined in blue; triple-clicked the LOAD box, typed 80, Enter | 13 s sim | LOAD 80 MW, OUTPUT 80, GOVERNOR 80 % |
| 4 | 1:19 | "I put Tavg, Pressure, Steam Dump and Power on the strip chart so you can watch." | watch | — | — | strip chart changed to those four |
| 5 | 1:32 | "Clock to 5× so this moves along. Less steam leaves, so the primary heats up. Watch Tavg climb." | watch | watched | 15 s sim | clock went 5× by itself. Tavg 580 → 584, pressure 2236 → 2258, Steam Dump 0 → 18 % |
| 6 | 1:47 | "Warmer water swelled into the pressurizer and pushed pressure up. The steam dump opened to carry the extra heat to the condenser." | — | looked for the steam dump opening | — | only the strip chart / unlabelled pipe "19 %" showed it; the STEAM DUMP box did not (S-6). PRESSURIZER LEVEL 62 → 65 |
| 7 | 1:47 | "Warmer water also trimmed reactor power a few percent by itself. That is moderator temperature feedback." | — | — | 41 s sim | REACTOR POWER 99.8 → 93.6 % |
| 8 | 2:28 | "Clock back to 1×. Your turn: set rod speed to FAST, then drive Control Bank in about 40 steps. Watch reactor power follow." | FAST + insert 40 | FAST (lit green), then held CONTROL › INSERT: 3 s (606 → 603), then another ~12 s (to 560) | ~2 min sim until the instructor took over | S-1, S-2. Power 92.7 → 82.2 %; Tavg 584 → 581 |
| 9 | 2:28 | "The strip chart now shows Power, Control Rod Steps and Tavg." | — | — | — | chart showed "606 st" etc. |
| 10 | 4:28 | "I'll drive the rods in 40 steps for you." | — | still holding INSERT | — | arrived while I was holding |
| 11 | 4:29 | "Clock to 5×. Rods in means fewer neutrons: power drops toward the load and Tavg comes back down." | — | released at 560 | 30 s sim | power 82 %, Tavg 581, pressure dipped to 2201, PZR level 59 |
| 12 | 4:59 | "Clock back to 1×. Now pressure. Put Pressurizer Spray in MANUAL and open it all the way." | spray manual 100 % | pressurizer outlined; clicked SPRAY › MANUAL, typed 100 in the 0-100% box, Enter | 21 s sim | MANUAL lit amber, PZR SPRAY 81 % |
| 13 | 4:59 | "The strip chart now shows Pressure and Spray." | — | — | — | — |
| 14 | 5:20 | "Spray showers cooler water into the pressurizer's steam bubble. Steam condenses and pressure falls. Watch Plant Pressure." | watch | watched PRIMARY PRESSURE | 24 s sim | 2204 → 2148 psi (S-5, S-9) |
| 15 | 5:44 | "That's enough. Put the spray back in AUTO." | spray AUTO | clicked SPRAY › AUTO | 9 s sim | spray went back to 0 % |
| 16 | 5:53 | "Clock to 5×. Back in AUTO, the heaters run full to boil water and rebuild pressure. It is slow: minutes, not seconds." | watch | watched | 40 s sim | 2148 → 2156 psi. Slow, as it said |
| 17 | 6:33 | "Clock back to 1×. Last move: trip the reactor. Press SCRAM." | SCRAM | pressed SCRAM → button changed to "CONFIRM / PRESS AGAIN TO TRIP" → pressed again | ~12–20 s | "SCRAMMED / RODS NOT AT BOTTOM", then "PRESS TO RESET"; power 82 → 5.0 → 1.1 %; rods 560 → 85 → 0; board undimmed; 3 then 5 alarms (S-4) |
| 18 | 6:53 | "All rods dropped. Neutron power fell to about 2 % in seconds, but the fuel still makes about 5 % of full heat from decay." | — | — | — | matched power tile |
| 19 | 6:53 | "See Decay Heat on the strip chart, next to Power and Tavg. Decay heat holds near 5 % while neutron power falls toward zero." | watch | found "Decay Heat" on the chart | 5 s | 4.43 % → 3.04 % (S-3) |
| 20 | 6:58 | "Clock to 5×. The turbine tripped, so the steam dump takes the decay heat. Tavg drops toward about 552 °F." | watch | watched | 51 s sim | STEAM DUMP box outlined; Tavg 556 → 551 °F (slightly below the 552 it named); COOLDOWN RATE −150 F/hr |
| 21 | 7:49 | "That's the loop: load, rods, pressure, trip. Clock back to 1×. The Walkthroughs tab goes deeper." + "🏁 Full-power opener — Continue leaves you in free play on this tripped plant. Retry starts over at full power." | choose | pressed Continue | — | back to the free-play intro text |

Things I did that the text did NOT say: close the Main Menu; triple-click to clear the LOAD box and press Enter; type "100" (not stated) for "open it all the way"; interpret "drive in" as INSERT under "CONTROL"; press SCRAM twice (the board told me, the message did not).

The blue outline and dimming helped on the load (turbine outlined, obvious), the rods (ROD CONTROL box lit) and the spray (PRESSURIZER box lit). After the trip, the outlined STEAM DUMP box did not show the thing it pointed at: no % reading.

## 4. Words and numbers the messages used vs the board

| Message said | Board shows |
|---|---|
| "Tavg" | tile "AVG COOLANT TEMPERATURE"; "Tavg" only on the strip chart; "TAVG" as a corner label in STEAM DUMP |
| "generator 100 MWe" / "Turbine Load to 80 MWe" | "TURBINE-GENERATOR", "LOAD 100 MW", "OUTPUT 100 MW" |
| "pressure 2235 psi" / "Plant Pressure" | "PRIMARY PRESSURE 2236 psi"; chart "Pressure" |
| "Control Bank" | "ROD CONTROL" › "CONTROL" column; "CONTROL ROD POSITION 606 /627"; "control bank" only in hover text |
| "drive … in" | button "INSERT" |
| "about 40 steps" | position counter "/627"; no time hint (≈1 step/s at FAST, 1×) |
| "The steam dump opened" | STEAM DUMP box: AUTO / OPEN (greyed) / CLOSE, no %; % only on the strip chart and an unlabelled "19 %" near a valve |
| "open it all the way" | box "0-100%" (must type a number) |
| "Pressurizer Spray" | "PRESSURIZER (PZR)" › "SPRAY"; diagram "PZR SPRAY" |
| "moderator temperature feedback" | no board label (a term I just had to accept) |
| "Decay heat holds near 5 %" | chart Decay Heat 4.43 % → 3.04 % |
| "Tavg drops toward about 552 °F" | reached 551 °F |
| (not mentioned) | alarms "Cooldown Rate High (>100 °F/hr)", "Pressurizer Level Above Program — letdown is not holding", "Pressurizer Pressure Low" |

## 5. What worked
- The blue outline on the turbine made "Turbine Load" findable instantly.
- The instructor setting the clock itself kept waits short: each "watch" beat was 10–50 s of wall time.
- The strip chart switched to exactly the traces each message talked about.
- Numbers quoted in message 2 matched the tiles to within a digit.
- SCRAM's "CONFIRM / PRESS AGAIN TO TRIP" told me what the second press was for.
- The spray → pressure drop (2204 → 2148 psi) and the slow heater recovery were both visible, as described.
- The hover scanner line explained controls ("INSERT (control bank) — … Tap for one step, hold to drive.").

## 6. What I learned
The reactor follows the turbine: asking for less steam leaves heat in the water, the water warms and swells, pressure rises, and the warmer water turns reactor power down a bit by itself. Pushing rods in cuts power directly, and the water temperature comes back down. Pressure is controlled in a separate tank, the pressurizer: spraying water in drops pressure quickly, heaters bring it back slowly. Tripping the reactor stops the chain reaction in seconds but the fuel keeps making a few percent of heat, which the steam dump has to carry away. I'd keep playing — but I'd want the rod step fixed first, because it is the one place I could not tell whether what happened was me or the instructor.
