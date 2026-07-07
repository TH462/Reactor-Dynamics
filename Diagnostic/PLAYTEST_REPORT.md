# Campaign Playtest Report — persona run, all three campaigns

**Date:** 2026-07-07
**Method:** Played as a first-time player — passing knowledge of nuclear power (knows fission,
control rods, meltdown; has never operated anything; reads at ~220 wpm; no patience for
unexplained jargon). All missions driven through the real headless stack (M5 + M4 + Instructor,
same loading as `test/run_campaign.js`), in campaign order, with commentary consumed at the pace
the beats and `speed` settings actually deliver it. Wall-clock model: one broadcast tick = 0.1 s of
player time (the UI's 10 Hz), so wall time = sim-time ÷ acceleration; reading happens *while* the
sim keeps running, exactly as in the live UI. At least one plausible fumble per act (wrong control,
too slow, too greedy) was played to exercise the failure/rewind paths. UI claims in beat text were
cross-checked against a headless Edge DOM dump of `ui/shell.html` and the synoptic/plant-display
control registries.

**Artifacts:** persona driver + probes and the full event log (per-beat timings, read-deficit
measurements, blocked commands) are in the session scratchpad (`playtest_driver.js`,
`probe2.js`, `probe3.js`, `playtest_log.json`). Nothing in the repo was modified except this
report. `node test/run_campaign.js` re-run after the playtest: **24/24 suites, 686 checks, green.**

**Reading-pace convention used below:** a beat "holds for N s" = time before the next beat's
commentary replaces it (the instructor card shows one message at a time). "Needs N s" = word count
÷ 220 wpm. Deficits under ~3 s are noted only in passing; the persona is a *fast* learner — a
slower reader loses strictly more.

---

## Verdict in one paragraph

The prose is the best thing in this product — confident, honest, jargon introduced exactly when a
task needs it. The scenario *skeletons* are sound and every authored path completes. But the
campaign currently trusts two things it shouldn't: that the player reads as fast as the beat
timers, and that the player does exactly what the text asks. Read at a normal human pace, several
missions replace their own payoff text before it can be finished (`pwr_xenon`: every beat;
`bwr_fukushima`: the campaign's single most important decision is *unreachable*); and one
plausible wrong move in `pwr_tour`, `pwr_boron`, or `pwr_qualify` leaves the mission in a silent
softlock — no failure card, no hint, a congratulatory or stale prompt sitting over a scrammed
plant. Meanwhile the ⏪ Rewind that every failure card advertises as the escape hatch drops the
player *at the moment of death* and repeated presses don't walk further back. Fix the pacing
valve, add trip-catch branches, and repair rewind-from-failure, and this is a genuinely excellent
course.

---

## PWR — "Zero to Operator"

### Act I

**1. `pwr_hook` — Welcome to the Control Room** · wall 0.8 min · completed
*Felt:* Great opening. Pressed the big red button, watched the collapse, had time travel
demonstrated. The rewind gimmick lands.
*Friction:* The SCRAM button is a two-press control — first press turns it into **CONFIRM** for
3 s. Beat `press_it` says "press the big red SCRAM button. Now." — the persona pressed once,
watched the button change, and hesitated ("did I break it?"). Also 3 of 5 beats run ~3 s shorter
than their read time (10-s delays vs 11–13-s texts).
*Pacing:* under budget. *Difficulty:* trivial, as designed.
*Suggested edits:* `press_it` — add "(press it twice — the button asks you to confirm)".
`what_happened`/`rewind_time` — delay 10 → 14.

**2. `pwr_tour` — The Energy Journey** · wall ~3.5 min clean · completed (after self-rescue)
*Felt:* The energy-path walk is lovely; "guardian of the liquid state" works. Throttling to
900 MW and watching the reactor follow was the first real "oh!" moment.
*Fumble played (greedy):* set Manual and slid to **500 MW** — a completely natural "let's see
what this does". The plant rode down for ~70 sim-s and then **tripped on load rejection** (four
alarms: high_tavg, pzr_level_high, sg_level_low, sg_level_lolo). The mission has **no branch for
this**: beat `complete` stays pending forever, and the message on screen remains `act_restore`'s
congratulation — "See it? Less steam drawn, and the reactor answered by making less heat…" —
over a scrammed, shrieking plant. No endpoint ever arrives (verified 2+ min). ⏪ Rewind (if the
player thinks of it — nothing suggests it) does recover to the pre-trip checkpoint, and the
mission then completes normally. An 800 MW ask, for the record, is safe.
*Prose:* `intro`, `boundary`, `pressurizer` each run 2–6 s short of their read time.
*Pacing:* fine. *Difficulty:* fine on rails; one greedy slide = silent softlock.
*Suggested edits:* add a trip-catch beat (`trigger: {type:'scram'}` → level_complete failure card
"You asked for too much, too fast — load rejection" with `rewind` offered) reachable from
`act_load`/`act_restore`; bump the three 16–18-s tour delays ~25%; `act_load`'s highlight
`control_label:'Mode'` is not in the synoptic's `SYN_CONTROL_MAP`, so nothing glows — add the
alias or use `'Turbine Load'`.

**3. `pwr_chain_reaction` — The Chain Reaction** · wall 4.8 min (incl. fumble) · completed
*Felt:* Taking the core critical by hand is the best moment in Act I. The "source never sleeps"
frame is genuinely good teaching.
*Friction:* the mission's climax beat `critical` ("THERE — … You just took a nuclear reactor
critical. STOP the rods") **held for 3.6 s** — at `speed: 5`, power runs 1 % → 3 % in under
20 sim-s, so `reinsert` replaces the text before the sentence about stopping the rods is reached.
The persona learned to stop from the gauges, not the prose.
*Fumble played (too slow):* kept holding WITHDRAW ~8 s past the STOP call (40 sim-s at 5×) —
power hit 9.2 %, no trip, feedback caught it, mission completed with the same "Mastered" card.
Forgiving, and honestly a good accident of design — but success and sloppiness are
indistinguishable.
*Pacing:* at budget. *Difficulty:* right.
*Suggested edits:* `critical` — hold it: either `speed: 2` (not 5) on `critical`, or give
`reinsert` a composite trigger `all[instrument>3, delay 20]` so the STOP text survives long
enough to be read. `pull_rods` highlight `control_label:'Rod motion'` matches no control (map
knows 'Control Bank') — fix the label. Also: "watch … STARTUP RATE" — the SUR readout is a
learning-mode-only row on the rod card; in realistic mode the named gauge does not exist.

### Act II

**4. `pwr_startup` [P] — Critical!** · wall **13.7 min as instructed** · completed
*Felt:* The one mission that outright breaks the 5-minute promise. The step note says
"Set Rod Speed to **Slow** first… withdraw in small bursts". Played exactly that way (6-s slow
bursts, glancing at SUR between), criticality arrives at **13.7 minutes**; the persona driver's
first attempt (40 bursts, 10.5 min) gave up before power moved at all. Ignoring the Slow advice
and bursting at Normal: **3.2 min**. The plant punishes the compliant player and rewards the one
who disobeys the note.
*Also:* the caution says "keep SUR ≤ 1 DPM" — even the compliant slow approach crosses
criticality at **SUR ≈ 2.4 DPM** (coarse lumped bank). The rule as stated is unfollowable, which
undercuts the procedure's authority for a player who is watching the number.
*Fumble played (wrong control):* tried Turbine Load during the rod step — cleanly blocked with
"Not yet — this step asks you to use 'Control Bank'…". This gating is excellent; no notes.
*Suggested edits:* step 2 note — "Rod Speed → **Norm** until the startup-rate needle stirs, then
Slow for the final approach"; caution — "expect ~2 DPM at the crossing with this trainer's coarse
bank; a real plant creeps at ≤1".

**5. `pwr_feedback` — The Reactor That Pushes Back** · wall 2.4 min · completed
*Felt:* the rod-nudge half is perfect — shove it, watch it shrug. Then the second half vanished:
*the demand demo never visibly happens.* `demand_demo` (65 words, sets Manual 600 at speed 10)
was replaced by `complete` after **0.1 s** — at 50 % the plant already makes ~505 MWe, and
`complete` triggers at `mwe_output above 520`, which the first seconds of the ramp cross
instantly. The mission's second proof ("power climbs to meet demand, rods untouched") is over
before the text introducing it can even render, and `stabilized`'s 91-word payoff got 10 s of its
needed 25.
*Pacing:* under budget — too far under, in the wrong place. *Difficulty:* trivial.
*Suggested edits:* `complete` — raise the trigger to `above ~555` (and keep `speed:10` running so
it takes ~20–30 s of visible climb); update the matching check in `test/run_campaign.js` in the
same commit. `stabilized` → `demand_demo` gap: give `demand_demo` `delay 30` instead of 10.

**6. `pwr_xenon` — Poisoned** · wall 1.5 min · completed
*Felt:* the arc (scram → build → crest → decay) is dramatic and the Chernobyl foreshadow lands…
in principle. In practice **every single beat was replaced before a 220-wpm reader finished it**
(intro −5 s, `shutdown` −3 s, `xenon_builds` −8 s, `peak` −9 s). At 300–600× the physics
thresholds arrive faster than the prose describing them. The persona finished the mission having
*skimmed* the entire lesson; the final beat is the only one that stays up.
*Pacing:* 1.5 min — the budget bought nothing; the compression spent it.
*Difficulty:* n/a (watch-only).
*Suggested edits:* make each threshold beat also wait out a dwell:
`xenon_builds` → `all[true_state>106, delay 25]`, `peak` → `all[true_state>113, delay 30]`,
`complete` → `all[true_state<112, delay 30]` (sim-time dwells at 600× are invisible; these are
*post-fire* gaps for the *next* trigger, so they hold each card ~25–30 s of wall time… n.b.
`delay` counts sim-seconds — to hold wall time at speed 600 the values must be ~15000, or drop
`speed` to ~120 and shorten the values accordingly). Alternatively trim each beat to ≤ 50 words.

**7. `pwr_boron` — The Long Game** · wall (clean) ~2.5 min · **softlocks on one wrong press**
*Felt (clean path):* "Rods are the hands; boron is the spine" is a keeper. But at `speed: 30`
the *patient chemistry* is instant: press Dil and `borate_task` fires within ~1–13 s — the beat
that says "chemistry is patient work" is contradicted by the screen. Worse, the dilute keeps
running while the player reads the 80-word borate prompt (~14 s = 420 sim-s): measured, boron
drains 727 → 110 ppm, Tavg overshoots +16 °C, and a **high-flux trip** fired during the
excursion.
*Fumble played (wrong direction):* pressed **Bor** instead of **Dil** for 12 s (a mistake the
button labels invite — the beat says "Press DILUTE", the buttons say `Bor`/`Hold`/`Dil`).
Result, measured end to end: Tavg −13 °C, correction overshoot, high-flux **scram**, and then a
**permanent softlock** — the plant sits tripped at post-trip Tavg ≈ 303 °C while `complete`
waits forever for Tavg < 287.3 °C, with "Now undo it: press BORATE…" on screen for 20+ minutes.
No failure card, no trip-catch, no hint.
*Pacing:* clean path under budget. *Difficulty:* one mis-press = unwinnable, silently.
*Suggested edits:* drop mission `speed` 30 → 8–10 on `dilute_task`/`borate_task`; have
`borate_task` fire with `commands:[{action:'set_boron_adjust', rate:0}]` so reading isn't
penalized; add a scram-catch beat → failure card with rewind ("You poured the reactivity in too
fast — chemistry rewards patience"); `dilute_task`/`borate_task` text: name the buttons as
labeled ("press DIL", "press BOR") or relabel the buttons Dilute/Borate; highlight
`control_label:'Boron'` is not in `SYN_CONTROL_MAP` (key is `'Boron (Reactivity) — CVCS'`) — no
glow today.

### Act III

**8–10, 12–13. `pwr_raise_power`, `pwr_pressure_control`, `pwr_sg_level`, `pwr_lower_power`,
`pwr_shutdown` [P]** · wall 0.3–0.4 min each · all completed
*Felt:* fine, correct, and *thin* — each is one or two commands and over inside 30 seconds. After
the scenario missions' storytelling these read like flash cards. The persona's honest reaction:
"that was a checklist, not a mission." They do serve as low-stakes reps, and the wrong-action
gating text is consistently good.
*Suggested edit (batch):* one sentence of stakes in each `purpose` line and one `saw`-style
observation beat would buy a lot ("watch the level answer the feed — that lag is shrink/swell
hiding" etc.). Not urgent.

**11. `pwr_load_follow` — Follow the Grid** · wall ~5 min clean · completed
*Felt:* the best-paced mission in the campaign. Evening story, night hold at 10× with two named
indications to watch, morning pickup. The "your slider ASKS; the physics ANSWERS" beat is the
campaign's thesis in one line.
*Fumble played (wrong order):* dragged the Load target to 800 **before** switching to Manual.
Command returns silently (null); nothing on screen reacts; the persona sat 10 s wondering if the
slider was broken. (`hold`'s trigger still caught the later, correct sequence.)
*Fumble played (too slow):* 60-s coffee break at dawn — harmless, mission waits. Good.
*Suggested edits:* `ramp_down` — add "(Manual first — in Follow the slider is ignored)"; the "SG
BALANCE light" named in `hold` is a text row labeled `Balance` on the steam card, not a light —
either rename in text ("the Balance readout on the Steam card") or add an annunciator.

### Act IV

**14. `pwr_protection` — The Plant Protects Itself** · wall 3.5 min · completed
*Felt:* watching the trip cascade with hands in lap is a strong beat, and "alarms are a story,
not noise" is the right lesson. Read deficits on `scrammed` (−4 s) and `ack_task` (−14 s in the
persona run, self-inflicted by acting early — see below).
*Fumble played (jumpy ack):* pressed **Ack All** during the alarm flood, *before* `ack_task`
asked for it (a 12-s window after `scrammed` fires). The instructor clears its action memory when
`ack_task` fires, so the ack was eaten: the mission stalls at `stabilizing` — prompt says "press
ACK ALL", board is already silent, nothing happens. A second, shrugging press un-stuck it
(verified). Nothing tells the player a second press is needed.
*Pacing/difficulty:* fine.
*Suggested edits:* `stabilizing` — trigger
`any[{operator_action acknowledge_all_alarms}, {instrument all-alarms-acked…}]`, or simply accept
the pre-prompt ack (author the trigger on the *alarm state*, not the command). Keeps the current
scripted path intact.

**15–17. `pwr_loss_of_feedwater`, `pwr_rcp_trip`, `pwr_stuck_porv` [P]** · 0.4–0.6 min each ·
completed
*Felt:* good, tight emergency reps; `pwr_stuck_porv` is exactly the TMI rehearsal it promises.
The oddity is being told to *inject your own failure* from the Failures tab — the persona found
sabotaging their own plant funny rather than immersive. Acceptable trade for the sandbox.
*Suggested edit:* none urgent; consider having the walkthrough inject the failure itself via a
step `cmd` the way scenarios do (the machinery exists — the step already carries the cmd).

### Act V

**18. `pwr_tmi` — Three Mile Island** · wall 3.9 min to the 1979 outcome · completed
*Felt:* the flagship still lands. Hesitating at `injection_decision` (the honest first-timer
move — the text asks "What will you do?" and the persona was still weighing it at 120 s) replays
history with real dramatic weight. Read deficits: `porv_sticks` (90 words, −3 s) and
`damage_path` (77 words, held 6.8 s at 30× before `core_damage` replaced it — the explanation of
*why the operators shut HPI off* flashes past).
*The big problem — the advertised escape hatch doesn't work.* The failure card says "Use Rewind
to go back to the decision and change history." Measured: one ⏪ lands at the *moment of core
damage* (scrammed, PORV stuck, inventory gone, `core_damage` pending). Pressing ⏪ again does
NOT go further back: between presses the sim broadcasts (~0.1 s), so M5's "strictly earlier"
guard no longer matches and every subsequent rewind restores the *same* newest checkpoint.
From that state, starting HPI reaches **no endpoint at all** (600 s verified) — the scenario is
in limbo. The only real path is Retry. This same mechanic affects every failure card that offers
rewind (`pwr_qualify`, `rbmk_az5_fixed`, `bwr_fukushima` bare path).
*Suggested edits:* (engine-level, flagged not fixed per instructions) — either make repeated ⏪
walk back monotonically (treat "current moment" with a tolerance of ≥ one broadcast, or keep a
cursor), or let failure beats carry an authored `rewind: {steps: N}`-style anchor the LC rewind
button uses (`pwr_hook` already proves authored world-rewind works). Beat-level mitigation:
`damage_path` slow to `speed: 15`; `core_damage` add "(Retry restarts the night; Rewind is
currently one step only)" — honesty until the mechanic is fixed.

**19. `pwr_qualify` — Senior Operator Exam** · pass: ~1.5 min · fail-by-freezing: **11.2 min**
*Felt (pass):* genuinely tense. 40 s of silence after the fault, the subcooling alarm sounds, and
everything the campaign taught cashes in: block valve, HPI, "Qualified — Senior Reactor
Operator" 9 s later. The persona pumped a fist.
*Probe (frozen candidate):* total silence for **11+ minutes of real time** before the
`failed_frozen` card (600-s inaction window at 1×). Twice the mission budget spent staring at a
slowly sagging gauge with no time acceleration.
*Probe (twitchy candidate):* closed the PORV **block valve during the 25-s briefing gap** —
"something will fail, so I'll pre-isolate the valve I learned about" is a real player move. The
fault then injects behind the closed valve: no leak, no alarm, no branch can ever fire, and the
**exam never ends** (20 min verified, no endpoint). Softlock.
*Suggested edits:* `fault` — add a branch
`{trigger:{operator_action close_block_valve}, goto:'verify_early'}` *before* injection resolves
(or have `fault` `commands` re-open the block valve with a briefing line "board restored to
normal lineup"); `challenge` — either shorten `inaction` to ~300 s or add `speed: 4` once the
subcooling alarm has been ignored for 120 s, so the fail arrives inside the budget.

---

## RBMK — "The Other Path"

**1. `rbmk_tour` — The Other Machine** · 1.4 min · completed
*Felt:* the strongest pure writing in the product ("a margin gauge that is really a promise").
But all four beats run 6–11 s short of their read time (18/16/14-s delays vs 20–27-s texts) —
the persona left the ORM beat mid-sentence, and that beat is the Act III setup.
*Suggested edit:* delays +50% (`boiling` 18→26, `roles` 18→28, `orm_intro` 16→24,
`complete` 14→20), or convert tours to `manual` (Next-gated) triggers — the machinery exists.

**2. `rbmk_startup` [P]** · 6.8 min · completed
Same disease as `pwr_startup` (Slow-speed advice + long hold): 42 bursts to criticality.
*Suggested edit:* same fix as PWR #4.

**3. `rbmk_void` — The Wrong-Way Machine** · 1.7 min incl. fumble · completed
*Felt:* the inversion lands hard — "less water, more power" felt genuinely wrong in the hand,
which is the point.
*Fumble played (greedy):* cut flow to **40 %** instead of 60. Power rose to ~60 % and
self-limited; no trip; restore completed the mission. The tame regime is honestly tame — good.
*Suggested edit:* none required; optionally a line in `restore_task` acknowledging an overcut
("you went deeper than asked — note it still leaned, and stopped").

**4. `rbmk_raise_power` [P]** · 0.3 min · completed — thin but on-message.

**5. `rbmk_mcp_trip` [P]** · 0.6 min · completed
*Fumble played (too slow):* read the whole card first (15 s). The RBMK's own protection tripped
the reactor during the dawdle (power spiked ~101 % → auto-scram → 22 %), and the procedure then
has you press AZ-5 on an already-scrammed plant. Safe, but the drama self-resolves and the text
doesn't acknowledge it.
*Suggested edit:* step 2 — "Initiate AZ-5 promptly **(the protection may beat you to it — if the
board already shows SCRAMMED, confirm rods in and continue)**."

**6. `rbmk_shutdown` [P]** · 0.4 min · completed. The arm/confirm two-press is explicitly taught
here ("arm within 3 s, then confirm") — this sentence should exist in `pwr_hook` too.

**7. `rbmk_chernobyl` — 01:23:40** · 1.2 min · completed
*Felt:* the witnessing framing works; the aftermath essay (the one long text that *stays* on
screen) is the best-earned lecture in the campaign.
*Friction:* the live beats flash — `runaway` held 4 s, and `az5` held **1.0 s** (46 words: the
graphite-tip/positive-scram explanation, the mechanical heart of the disaster, physically cannot
be read).
*Suggested edit:* keep the 13 real seconds sacred, but move the tip explanation's weight into
`destroyed` (it's already half there — add the missing half: "the button itself, for two seconds,
was an accelerator — the rods enter graphite-first") and cut `az5` to a header ("AZ-5! — watch
the power JUMP as the rods bite wrong").

**8. `rbmk_az5_fixed` — The Rebuilt Machine** · run 1: loss at 9 s · run 2: win, 0.5 min
*Felt:* as designed, a first-timer *always* loses run 1 — the intro (55 words, needs 15 s) is
still being read when the core lets go (~5–9-s window). The failure card explicitly plans for
this ("Rewind. The button is waiting.") and the second run's win is a real payoff — the fastest
loop in the campaign and it earns its place.
*Caveat:* "Rewind. The button is waiting." hits the same broken rewind-from-failure mechanic as
TMI (lands post-explosion). **Retry** works; the card text should say Retry until rewind is
fixed.
*Suggested edit:* `lost` card `outcome_learning` — "Retry — you know which button." (one word,
honest).

---

## BWR — "One Loop"

**1. `bwr_tour` — One Loop** · 1.4 min · completed
Same tour pacing gap: every beat 5–9 s short (needs 20–28 s, gets 14–18). Same fix as the
RBMK tour. The writing ("honest bubbles", "the level line rules them all") is doing its job.

**2. `bwr_startup` [P]** · 1.5 min · completed — BWR rods bite faster; 8 bursts. Fine as-is.

**3. `bwr_recirc` — The Flow Throttle** · 1.9 min incl. fumble · completed
*Felt:* driving a gigawatt with a pump dial is as satisfying as promised.
*Fumble played (greedy):* asked **32** instead of "~25" → power 85 %, no trip — and `down_task`'s
text then congratulates "Seventy percent… it STOPPED there by itself" while the gauge reads 85.
Mismatch between praise and board.
*Scale confusion (real UX catch):* the control is `Recirc Drive Flow — Set %` on a **0–48** dial;
the gauge next to it is `Recirculation Flow` in **0–100 %** (reads ~62 when you set 25). Two
different "%" scales, one beat that says "aim the setting around 25". The persona set 25,
watched the flow gauge say 62, and briefly believed the control was broken.
*Suggested edits:* `up_task` — "aim the **dial** around 25 (the flow gauge will read ~60 % —
they speak different units)"; `down_task` — replace "Seventy percent" with "See where it
stopped — no trip, no drama; the foam braked it."

**4. `bwr_raise_power` [P]** · 0.8 min · completed — **and it teaches malpractice.**
The procedure's own command is `set_recirc_flow pct: 40`, its acceptance is merely
`power > 55 %` — and following it exactly leaves the plant at **114 % power, sustained,
no trip** (measured; the missing high-flux backstop is the known logged tuning gap). Mission 8
of this same campaign (`bwr_qualify`) *fails the player* for crossing 95 %. The campaign's
procedure and its exam contradict each other.
*Suggested edit:* target `pct: 28` (≈ 79 % — inside the exam's own band), acceptance
`55 < power < 90`, and a caution naming the map: "past ~32 on this dial you are above rated
power with no trip to save you." (Requires the matching `run_procedures` acceptance update;
flag both in one commit.)

**5. `bwr_isolation` — Cut Off** · 2.2 min · completed
*Felt:* the shrink lesson is beautifully staged — the gauge plunge with "did the water actually
go anywhere? Almost none of it" is the best single teaching beat in the BWR arc. `intro` runs
14 s short of its 26-s read; the rest paces well because the plant, not a timer, sets the tempo.
*Suggested edit:* `intro` delay 12 → 20 (it gates `slam`, so this is free).

**6. `bwr_shutdown` [P]** · 0.3 min · completed — fine.

**7. `bwr_fukushima` — The Long Night** · 1.2 min (!) · completed — **on the wrong branch.**
This is the campaign's worst pacing defect, and it guts its flagship. The mission runs at
`speed: 60` from the intro. Measured with honest reading:
- `intro` (92 words, needs 25 s) — held **4.2 s** before `batteries_die` replaced it;
- `batteries_die` (105 words — the card that *explains what the isolation condenser is* and ends
  "Your call, operator.") — its decision window is `inaction 300` **sim**-seconds = **5 s of wall
  time** at 60×. The persona was still mid-paragraph when "Fukushima — The Long Night" (the
  no-decision branch) completed at 33.8 s. The IC command, sent immediately after finishing the
  paragraph, landed on a dead mission.
A first-time reader **cannot reach the one decision the mission exists to pose.** (The scripted
test passes because it acts 250 sim-s ≈ 4 s wall after the beat.)
*Suggested edits:* `batteries_die` — add `speed: 1` (the beat text itself says the pump "will
coast on stubbornness for a while"; real time is dramatically *right* here) and widen
`inaction` to 120–180 (now real seconds). The branch beats (`ic_path`/`bare_path`) already
re-accelerate to 600×. `test/run_campaign.js` continues to pass untouched: its `settle(s, 250)`
lands inside a 120-s real-time window only if adjusted — verify and update the harness's settle
to sim-appropriate values in the same commit.
*Also:* `intro` deserves `delay`-gating too (hold ≥ 30 s before `batteries_die` arms — its
current `delay 240` is sim-time = 4 s wall).

**8. `bwr_qualify` — BWR Operator Exam** · fail 1.1 min, pass 4.6 min · completed
*Felt:* the best exam of the three. The briefing warns, precisely, that the plant will not save
you; the greedy ask fails exactly as promised with a card that teaches; the careful two-step
ascension (24 → settle → 28) passes inside budget with real tension in the 240-s band hold.
*Suggested edit:* none. This is the template the other exams should aspire to.

---

## UI spot-checks (headless DOM + control registries)

Verified present and where the text says: Turbine-Generator card with Mode Follow/Manual/Off +
Load slider; SCRAM (status bar); subcooling/tavg/power/SG gauges (`gauge-*`); CVCS boron buttons
+ ppm analyzer readout; Ack All; PORV Block Valve; HPI (Emergency tab); rod nudge ±1; RBMK
void/ORM/channel-flow gauges; BWR vessel-level/recirc gauges; campaign panel renders acts,
lock states, progress bar, "▶ Begin campaign".

Mismatches found:
1. **Highlight labels that glow nothing** (absent from `SYN_CONTROL_MAP`): `'Mode'`
   (`pwr_tour.act_load`, `pwr_load_follow.intro`), `'Rod motion'`
   (`pwr_chain_reaction.pull_rods`), `'Nudge'` (`pwr_feedback.nudge_task`), `'Boron'`
   (`pwr_boron.dilute_task`). Exactly the beats where a novice most needs pointing.
2. **Button-label vs prose:** "press DILUTE/BORATE" vs `Dil`/`Bor`; "the +1 button" is correct.
3. **SCRAM/AZ-5 are two-press (arm → CONFIRM)** — taught in `rbmk_shutdown`, unmentioned in
   `pwr_hook` where it's pressed for the first time under time pressure.
4. **Startup Rate** readout is a learning-register-only row on the synoptic rod card; in
   realistic mode the "STARTUP RATE gauge" named by `pwr_chain_reaction` does not exist on
   screen (procedure notes point at Tools → Reactivity Computer instead — two different answers).
5. **"SG BALANCE light"** (`pwr_load_follow.hold`) is a text row labeled `Balance`.
6. **BWR recirc dial (0–48 "Set %") vs flow gauge (0–100 %)** — see `bwr_recirc` above.

---

## Wall-clock summary (persona runs, incl. reading)

| Mission | Wall | Budget verdict |
|---|---|---|
| pwr_hook | 0.8 min | ✅ |
| pwr_tour | ~3.5 min clean | ✅ (softlock risk aside) |
| pwr_chain_reaction | 4.8 min | ✅ tight |
| **pwr_startup [P]** | **13.7 min as instructed / 3.2 min disobeying** | ❌ |
| pwr_feedback | 2.4 min | ✅ (but demo invisible) |
| pwr_xenon | 1.5 min | ✅ (unreadable) |
| pwr_boron | ~2.5 min clean / ∞ on fumble | ⚠️ |
| Act III procedures ×5 | 0.3–0.4 min each | ✅ (thin) |
| pwr_load_follow | ~5 min | ✅ |
| pwr_protection | 3.5 min | ✅ |
| Act IV procedures ×3 | 0.4–0.6 min each | ✅ |
| pwr_tmi | 3.9 min | ✅ |
| **pwr_qualify** | pass 1.5 min / **freeze-fail 11.2 min** | ⚠️ |
| rbmk_tour / void / chernobyl | 1.2–1.7 min | ✅ |
| **rbmk_startup [P]** | **6.8 min** | ❌ |
| rbmk procedures ×3 | 0.3–0.6 min | ✅ |
| rbmk_az5_fixed | 0.6 + 0.5 min | ✅ |
| bwr_tour / recirc / isolation | 1.4–2.2 min | ✅ |
| bwr_startup / shutdown / raise [P] | 0.3–1.5 min | ✅ (raise: wrong lesson) |
| **bwr_fukushima** | 1.2 min | ❌ (decision unreachable) |
| bwr_qualify | 1.1 + 4.6 min | ✅ |

---

## Top 10 fixes, in priority order

1. **`bwr_fukushima.batteries_die` — the campaign's marquee decision is unreachable at reading
   speed.** 60× + `inaction 300` sim-s = a 5-s wall-time window under a 105-word card. Run the
   decision beat at `speed: 1` with a 120–180-s window; re-accelerate in the branch beats.
   (Update the harness settle in the same commit.)
2. **Rewind from failure cards is broken campaign-wide** (`pwr_tmi.core_damage`,
   `pwr_qualify.failed_*`, `rbmk_az5_fixed.lost`, `bwr_fukushima.bare_uncover`): one ⏪ lands at
   the moment of death, repeated presses restore the same checkpoint (M5 `_rewind` "strictly
   earlier" guard defeated by the broadcast between presses), and post-rewind TMI reaches no
   endpoint at all. Fix in M5 or give failure beats authored rewind anchors; until then the cards
   over-promise ("change history") — soften to Retry.
3. **`pwr_boron` — one wrong press (or slow reading) at 30× ends in a high-flux scram and a
   permanent, silent softlock** under a stale "press BORATE" prompt. Slow to ≤10×, zero the
   boron rate via beat `commands` on each prompt, add a scram-catch failure beat with rewind.
4. **`pwr_tour` — no trip-catch branch:** a greedy Manual ask (500 MW) trips the plant at ~71 s
   and the mission softlocks under `act_restore`'s congratulation text. Add a `scram`-triggered
   failure card (this pattern belongs in every guided PWR mission that leaves the throttle
   unlocked).
5. **`pwr_qualify` — pre-emptive block-valve closure during the briefing = exam never ends.**
   Add a `close_block_valve` branch to `fault` (or re-open the valve at injection with a
   briefing line). Also compress the frozen-candidate path (11.2 real minutes of silence).
6. **`bwr_raise_power` [P] contradicts the BWR exam:** its own command (`pct 40`) parks the plant
   at 114 % sustained and calls it success. Retarget to `pct 28`, bound the acceptance, name the
   hazard in a caution.
7. **`pwr_startup` / `rbmk_startup` — the "Slow" advice makes mission 4 a 13.7-min slog** (3 min
   at Normal). Recommend Normal-until-SUR-stirs in the step note, and fix the "keep SUR ≤ 1 DPM"
   caution the coarse bank cannot honor (reads ~2.4 at crossing).
8. **`pwr_feedback.complete` fires instantly (threshold 520 vs ~505 starting MWe)** — the
   demand-following demo, half the mission's thesis, is never seen. Raise to ~555 and let the
   10× climb play out (update `run_campaign` check together).
9. **Systemic read-pacing:** delay-chained tour beats run 3–11 s short at 220 wpm
   (`pwr_tour`, `rbmk_tour`, `bwr_tour`, `pwr_hook`), and threshold-chained beats under
   acceleration flash past (`pwr_xenon` — all four beats; `rbmk_chernobyl.az5` — 1.0 s;
   `pwr_tmi.damage_path` — 6.8 s). Cheapest global fix: a minimum-dwell rule for commentary
   replacement (UI-side queue), else per-beat delay bumps as itemized above.
10. **Findability polish batch:** add `'Mode'`, `'Rod motion'`→'Control Bank', `'Nudge'`→'Rod
    Speed', `'Boron'`→CVCS aliases to `SYN_CONTROL_MAP`; align DILUTE/BORATE prose with
    `Dil`/`Bor` buttons; mention the two-press CONFIRM in `pwr_hook.press_it`; reconcile the two
    answers for "where do I watch SUR"; rename the "SG BALANCE light"; add the dial-vs-gauge
    units note to `bwr_recirc.up_task`; `pwr_load_follow` silent target-in-Follow should say
    something.

---

*Report only — no scenario, engine, or threshold changes were made. `node test/run_campaign.js`
remains 24/24 (686 checks) as verified after the playtest. Where suggested edits touch harness
expectations (`pwr_feedback` threshold, `bwr_raise_power` acceptance, `bwr_fukushima` window),
the matching test update is flagged inline so the gate stays green in the same commit.*

---

## Addendum (2026-07-07, same day) — all findings fixed

Every item in the top-10 (and the per-mission edits behind them) has been implemented and
re-verified; the full decision record is in `Blueprint/BUILD_DECISIONS.md` (playtest-hardening
entry). Status per finding:

1. **Fukushima decision window** — FIXED. `batteries_die` runs at real time with a 150-s
   window (hold phase now 40 wall-s at 60×). Verified: a 220-wpm reader who reads both cards
   in full still reaches the IC branch ("The Hours You Bought").
2. **Rewind from failure cards** — FIXED in M5 (`_rewindCursor`): repeated ⏪ presses walk
   back one checkpoint each until new progress is made. Verified: TMI 1979 card → 2 presses
   → injection decision → HPI → "Averted"; az5 rematch: 1 press → pre-excursion → AZ-5 →
   "The Fix Held".
3. **pwr_boron softlock** — FIXED: 8× compression, CVCS parked on HOLD at each prompt, and a
   scram branch to the new `overdone` failure card. Verified: the 12-s wrong-direction fumble
   now recovers to full completion (no trip at 8×); a forced trip lands on the card.
4. **pwr_tour trip softlock** — FIXED: `load_lost` trip-catch card (also `grid_lost` in
   pwr_load_follow). The greedy-500 path is now a CI check.
5. **pwr_qualify** — FIXED: state-based isolation grading (`block_valve_open` added to PWR
   true_state), `fault` restores normal lineup (briefed), frozen window 600→300 s. Verified:
   pre-briefing isolation ends the exam; frozen fail at ~6.2 min (was 11.2).
6. **bwr_raise_power** — FIXED: pct 28 target (≈80%), ≥95% guard, hazard caution. No longer
   contradicts the exam.
7. **Startup pacing** — FIXED via note/caution rewrites (Norm-until-SUR-stirs; honest ~2 DPM
   crossing). Authored harness cmds unchanged (already validated).
8. **pwr_feedback demand demo** — FIXED: mission anchored at Manual 500 via setup_commands,
   demo via `set_steam_demand 650`, completion gated on `mwe > 585` + 200-s dwell. Verified:
   the climb is on screen ~20 s (was 0.1 s), with Tavg falling as the text teaches.
9. **Read pacing** — FIXED via per-beat delay/speed bumps (hook, three tours, xenon 150/300×,
   chain-reaction climax at 1×, TMI damage 10×, Chernobyl az5 text moved to the aftermath
   card, bwr_isolation intro).
10. **Findability polish** — FIXED: SYN_CONTROL_MAP aliases (Mode/Load/Rod motion/Nudge/
    Boron), DIL/BOR named as labeled, two-press SCRAM taught in the hook, SUR location named,
    "Balance readout" naming, recirc dial-vs-gauge units note, slider-engages-Manual note.

Bonus (found while fixing): the TMI **"Averted" ending was unreachable at HEAD** — HPI alone
cannot restore subcooling past 11.1 °C with the PORV open (pre-existing red check in
run_scenarios). The recovery beat now also closes the block valve, the action that actually
terminated the 1979 event. `run_scenarios` is 3/3 for the first time.

Gates after fixes: `run_campaign` 24/24 — **723 checks** (new failure-path coverage);
M5 17/17; M6 16/16; scenarios 3/3; PWR 13/13; RBMK 23/23; BWR 12/12; M4 11/11;
manual-follow 81 ✓. `run_procedures` 20/21 and `run_e2e_controls` 23/25 are unchanged from
HEAD (pre-existing engine findings B3 and LPI/accumulator, both already logged). Persona
re-verification suite: 17/17.

### Round 2 (same day) — residual-confidence items closed

The post-fix review flagged four remaining uncertainties; all are now fixes, not caveats
(decision record: BUILD_DECISIONS round-2 entry):

- **Reading-pace robustness**: the UI now enforces a per-card minimum dwell (words ÷ 3.7 s,
  capped 16 s) with a 3-deep queue, so no beat cascade can destroy text at ANY reading
  speed; blocked-command feedback bypasses the queue, completion cards flush it. Bonus find:
  the level-complete panel had been painting over every mission's final commentary in the
  same broadcast — endpoint text is now rendered above the panel.
- **Rewind-pick precision**: strip-chart picks are `exact` — M5 skips the repeated-press
  walk-back for them.
- **Threshold margins**: swept seeds 1/7/13/42/99 over tour (both paths), boron, feedback
  (real three-press pattern — which exposed and fixed a soft-wait: `complete` now has a
  600-sim-s fallback), qualify win, load_follow, sg_flood: **35/35**.
- **Live-UI verification**: `synoptic_check.html` was dead because it never loaded
  `engines/load_mode.js` (not Edge drift) — repaired, **55/55 SYNOPTIC-OK**; a highlight
  coverage check is now a structural gate in `run_campaign` (it immediately caught
  `pwr_sg_flood`'s malformed `imbalance` trigger — the bonus mission had been unwinnable
  since authoring — and its dead gauge highlight; both repaired and now functionally
  tested); the `?scenario=` deep link's cross-plant render crash (pre-existing, three
  `.toFixed` throws) is fixed, restoring headless live-UI verification for all plants.

Final gates: `run_campaign` **26/26 (739 checks)**, synoptic harness 55/55, everything else
as above; `verify_e2e_ui`'s pwr/primary `dhr-on` failure is pre-existing at HEAD (classic
view, unrelated) and remains logged.

### Round 3 (same day) — RBMK/BWR parity pass

The PWR lessons applied to the other two campaigns (probes + fixes, BUILD_DECISIONS round-3
entry): `rbmk_void` could softlock on a manual AZ-5 or a deep flow cut — probed: a 30% cut
spikes the pre-1986 core to **~120% and trips**, after which touching flow again showed the
*success* card over a dead reactor; `bwr_recirc` softlocked on any scram. Both now use the
prompt-with-branches pattern with authored failure cards ("It Bit" / "Tripped"), CI-checked.
Highlights added wherever RBMK/BWR beat text names hardware (there were none): tour gauges
(void/ORM/level/recirc), task controls (MCP / Channel Flow, Recirc Drive), the Isolation
Condenser at the Fukushima decision, and AZ-5 on the rematch intro — which now also carries
the two-press "arm then CONFIRM" wording. The highlight coverage gate now validates RBMK/BWR
labels too (`PD_LABELS` mirror). Gates: `run_campaign` 26/26 — **773 checks**; persona
re-verification on a fresh seed: 7/7.
