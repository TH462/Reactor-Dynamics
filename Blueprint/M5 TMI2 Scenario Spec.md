# M5 — TMI-2 Training Scenario Spec (v1.0 Draft)

**Status:** Draft for handoff to coding AI
**Supersedes:** none (new module)
**Depends on:** 09_UI_HMI_Spec_Consolidated.md (v3.0) — synoptic modes, Instructor panel, quiet-board concept, Learning/Industry register system

---

## 1. Design Philosophy

This scenario teaches the HR1 hard rule (the UI always renders instrument readings, never true plant state) using the Three Mile Island Unit 2 (TMI-2) accident of March 28, 1979, as the case study. It is split into three parts that build on each other:

| Part | Title | Synoptic mode | Player knowledge | Deviation allowed? |
|---|---|---|---|---|
| 1 | The Fog of War | Realistic Synoptic (quiet board, no physics animation) | None (as the 1979 crew had) | No — scripted/historical |
| 2 | Under a Microscope | Learning Synoptic (full-color, physics animation) | Full hindsight (instructor-led review) | N/A — not gameplay, it's a guided replay |
| 3 | Second Watch | Realistic Synoptic (quiet board, no physics animation) | Full (from Part 2) | Yes — full deviation/outcome branching |

Rationale: Part 1 delivers the emotional/epistemic experience of the trap (you can't fix what you don't know is broken). Part 2 delivers the causal explanation. Part 3 delivers mastery — the player returns to the same blind board, but now armed, and gets to change history.

All three parts share **one underlying event/physics timeline** (Section 2) as a single source of truth. Only the dialogue trees, gating logic, and available player actions differ per part. Do not fork the timeline itself.

### 1.1 Pacing target (provisional — refine after rough draft is built and tested)

Target playtime per part, for a single-sitting educational vignette. These are planning estimates, not requirements — actual pacing depends on real dialogue length and interaction density, which won't be known until a rough draft exists to test:

- **Part 1 (Fog of War):** ~12–18 min. Below ~10 min risks the fog-of-war tension not landing (the player needs to genuinely sit in uncertainty before Part 2's reveal). Above ~20 min risks losing attention on dense, emotionally heavy material in one sitting.
- **Part 2 (Under a Microscope):** ~8–12 min. Explanation-paced rather than tension-paced, so it can move faster than Part 1.
- **Part 3 (Second Watch):** ~12–18 min, variable depending on how much the player deviates/investigates.
- **Full module:** roughly 35–50 min total — reasonable to treat as three separate sit-downs rather than one continuous session, which also gives Part 2's explanations time to sink in before Part 3 tests them.

Rough Part 1 beat budget (for playtesting reference):

| Beat | Est. time |
|---|---|
| Pre-accident lead-in (scene-setting, foreshadowing) | 2–3 min |
| Cascade + scram + PORV opens (T+0:00–0:11) | 1–2 min |
| PORV fails to reseat, PZR climbs, HPI throttle call | 3–5 min |
| Compressed monitoring stretch (skip, narrated) | 1 min |
| Identification + PORV block valve closure | 2–3 min |
| Aftermath/acknowledgment beat before transitioning to Part 2 | 1–2 min |
| **Total** | **~10–16 min** |

---

## 2. Master Event Timeline (Plant Truth)

This is the ground truth the simulation physics runs against, regardless of what any synoptic mode displays. Times are relative (T+) to accident initiation. A pre-accident lead-in precedes T+0 (see 2.1).

### 2.1 Pre-accident lead-in (T-minus, duration TBD — a few minutes of in-fiction time)

Before the condensate polisher trip, the scenario opens on a normal, quiet shift. This window exists to establish scene, voice, and stakes before anything goes wrong — and to plant foreshadowing the player won't recognize as foreshadowing until Part 2.

- **Purpose:** scene-setting (it's 4 AM, routine graveyard shift, ordinary chatter), voice calibration for the supervisor and aux operator before the player needs to trust their judgment under pressure, and light foreshadowing — e.g. an offhand mention of the maintenance/surveillance test that left the AFW block valve tagged out, delivered as completely unremarkable shift-turnover chatter, not as a hint.
- **Structure:** this is where the acknowledge-gated pacing buttons (Section 3.2) carry most of the weight — supervisor/aux operator trade a few lines of normal shift dialogue, player clicks "Ready"/"Go ahead" to advance, no decisions, no interaction targets live yet.
- **The interruption:** the condensate polisher trip (T+0) is a scripted timing beat, not a literal mid-sentence interrupt. The lead-in is a normal back-and-forth exchange between supervisor and aux operator; at a scripted point in that exchange, the plant event fires (annunciator/alarm), and the *next* thing said is the supervisor and/or aux operator reacting to it — not a continuation of the prior line. The effect is that the accident lands in the middle of what otherwise reads as an ordinary conversation, rather than after a clean "scene complete" beat, without requiring the dialogue system to truncate a line mid-delivery.
- **Parity across parts:** this lead-in plays identically in Part 1 and Part 3 (consistent with the "identical until deviation" rule in Section 6) — the player has no actionable deviation points yet at this stage regardless of which act they're in. Part 2 can either skip the lead-in entirely (since it's a guided review, not a cold open) or compress it to a single instructor line acknowledging it happened, at Tim's discretion.

### 2.2 Time compression strategy (decided)

**Approach: hybrid.** Real-time (1×) pacing is preserved for decision-critical beats; duller stretches between events use the existing speed-step system (1×/10×/60×/600×/3600×) to skip ahead. This avoids inventing a new mechanic and keeps actual TMI-2 durations intact for the beats where the real timing itself is part of the lesson (e.g. how long the PORV ran undetected).

**Real-time (1×) windows — do not compress:**
- T-minus lead-in (Section 2.1) through the condensate polisher trip and immediate cascade (T+0:00–0:11): scram, PORV opening, initial alarms. This is the "everything's still normal-ish" stretch and needs to breathe.
- The PORV-fails-to-reseat moment and the following few minutes where PZR level starts climbing and the HPI throttle decision is live (~T+0:17 onward through the HPI call).
- The AFW tag/valve interaction window, whenever the player engages with it (Part 3) or it's narrated (Part 1).
- The final identification and closure of the PORV block valve (~T+1:20:00–2:20:00): the *moment* of identification and the closure action itself should play at 1×, even though the long stretch preceding it is compressed (see below).

**Compressed/skippable stretches — chat-integrated fast-forward mechanic:**

Rather than a separate speed-step UI control, the skip is surfaced *inside the chat window* as its own interaction, so pacing stays diegetic instead of feeling like a menu action:

1. When a compressed stretch begins, a supervisor or aux operator line signals the lull in-character — something indicating watching/waiting rather than acting (e.g. *"Nothing new to report. We're just watching it now."*). This line itself is the cue, not a separate UI label.
2. Immediately after that line, a distinct chat option appears alongside (or in place of) the normal acknowledge button — a generic, non-revealing label like **"Wait"** or **"Skip ahead"** — visually distinct from both the plain "Ready" acknowledge button and from interaction-triggered request bubbles, so the player recognizes it as a time-control action, not a dialogue choice. The label must never hint at what happens next (e.g. never "Skip to PORV discovery") — the player shouldn't get advance notice of the next event, same as the real crew didn't.
3. Clicking it fast-forwards the sim to the next **trigger point**, which can be either (a) the next scripted event/indication change/decision gate in the timeline, or (b) a fixed elapsed duration where that's what actually happened historically (e.g. the ~80 minutes before the PORV was identified was simply elapsed time, not gated on a discoverable trigger). Coding AI note: each skip needs its own defined target — either "advance to event X" or "advance N minutes of sim time" — set per-stretch in the timeline data, not a single universal mechanism.
4. On arrival at the trigger point, time resumes at 1× automatically and play continues normally from there — no separate "resume" action needed from the player.
5. The elapsed real-world duration of the skipped stretch should still be reflected somewhere (chat timestamp jump, or a brief supervisor line noting how long it's been) per the design guardrail above — the player should register that real time passed even though they didn't sit through it.
6. If the player does *not* click the skip option, that's fine — they can simply wait through the stretch at 1× instead. The option should never force-advance; it's opt-in only, since some players may want to sit with the tension rather than skip it, and the mechanic shouldn't undercut Part 1's fog-of-war pacing by pushing players through it faster than they want to go.

**Design guardrail:** the compressed stretches should still surface the *actual elapsed duration* to the player somewhere (clock/timestamp in the chat log or synoptic), even if playtime is short — since the raw "it took 80 minutes" and "it took 2h20m" numbers are themselves part of what the scenario is teaching. Don't let compression erase the numbers just because it erases the wait.

| T+ | Event | True plant state |
|---|---|---|
| 0:00 | Condensate polisher trips (root cause: mispositioned valves from maintenance 2 days prior) | Normal operation ends |
| 0:01 | Condensate pumps trip | Feedwater flow begins collapsing |
| 0:02 | Feedwater pumps trip; turbine trips; auxiliary feedwater (AFW) pumps auto-start | AFW pumps running, but block valves are closed (tagged out from a surveillance test, not reopened) — **zero flow reaches the steam generators (SGs)** |
| 0:07 | Primary loop pressure rises; power-operated relief valve (PORV) opens | Correct, designed response |
| 0:11 | Reactor trips (scram) | Fission stopped; decay heat continues |
| ~0:17 | Primary pressure and temperature fall enough that the PORV should reseat | **PORV fails to close.** Demand-close signal is sent and the control-room light reflects the *signal*, not actual valve position. Coolant now escaping continuously. |
| 0:00–2:20 | Pressurizer level climbs as SGs boil dry and core inventory drops | Crew reads rising PZR level as approaching "solid" (per contemporary training) and throttles/reduces High-Pressure Injection (HPI) — the opposite of the correct response |
| ~2:00 | SG levels indicate near-zero; AFW pump indicators still show running | Tag on AFW block valve remains the unexamined cause |
| ~1:20:00–2:20:00 | Someone identifies PORV tailpipe/quench-tank temperature is abnormally high for a "closed" valve | Historically took ~80 minutes to catch (compare: Davis-Besse caught the same failure mode in ~20 minutes in 1977) |
| ~2:20:00 | PORV block valve closed, isolating the leak | Roughly 32,000 gallons of coolant (over a third of primary system volume) has already been lost; core already sustaining damage from prolonged uncovery |
| After 2:20:00 | HPI restored and sustained; recovery actions begin | Core damage already done; recovery from here is about stabilizing, not preventing |

**Key deviation points** (used by Part 3 branching, dormant in Part 1):
1. **AFW block valve tag** (~T+0:02) — highest-leverage catch. Opening this early keeps the SGs wet and likely prevents the PORV excursion from compounding into core damage.
2. **PORV tailpipe/quench-tank temperature** (~T+0:07 onward) — catching this early allows the block valve to close within minutes instead of ~80.
3. **HPI throttle decision** (~T+ a few minutes) — resisting the instinct to throttle HPI because PZR level is rising requires reasoning against the standard "don't go solid" training the real crew had.

---

## 3. Shared Chat Window System

Used identically across all three parts; only the content differs.

### 3.1 Message types
- **Supervisor — narration/procedure** (default scripted line)
- **Supervisor — reaction** (response to a player-triggered action; visually distinct from scripted narration, e.g. different accent color)
- **Aux operator — chatter** (cross-talk with supervisor; player overhears, not addressed to player)
- **Player — contextual outgoing** (see 3.2)
- **System/alarm callouts** (optional — annunciator text mirrored into the log)

### 3.2 Contextual outgoing messages (critical constraint)
**The player never types.** All outgoing chat bubbles are generated one of two ways:

- **Interaction-triggered:** clicking a discrete scenario object with its own scripted request (the tag is the primary example) auto-generates a specific outgoing bubble tied to that object and current scenario state. Text is selected by scenario state (Part + act-internal flag), which is the mechanism for showing the player's knowledge growth between Part 1 and Part 3 (see Section 5). Note: not every deviation point works this way — Part 3's non-tag deviation points (PORV tailpipe temp, HPI throttle) are handled through direct plant operation instead, with the supervisor/aux operator reacting to what the player actually does to the controls, not to a chat click (see Section 6).
- **Acknowledge-gated pacing:** at points where the scenario needs the player to read/absorb something before continuing (a supervisor briefing line, an instructor explanation beat in Part 2, a debrief moment), the chat presents a plain outgoing button — "Ready" / "Understood" / "Go ahead" — with no scenario-state branching. This is a pure pacing gate, not a decision point, and should be visually distinct from interaction-triggered bubbles (e.g. always the same neutral button style) so the player can tell at a glance which outgoing prompts are "just continue" vs. "this is a choice."

Implementation note for coding AI: click handler resolves `(interactionId, currentPart, currentFlags) → scriptedRequestText`, then a second lookup resolves the supervisor/aux response. Keep this as a data table, not inline conditionals, so new interaction points can be added without touching dialogue logic. Acknowledge-gate buttons can share one generic handler since they don't need state branching — just a "continue" signal to advance the script.

---

## 4. Part 1 — "The Fog of War"

- **Synoptic:** Realistic Synoptic (quiet board, no physics animation).
- **Instructor:** Shift Supervisor, fully in-character. Never reveals plant truth the real crew didn't have. Uses period-appropriate terse phrasing; acronyms get one spelled-out first mention per scenario ("the power-operated relief valve — we call it the PORV"), then drop to acronym-only for the rest of Part 1 to preserve realism.
- **Player agency:** scripted/historical. The timeline plays out per Section 2 regardless of clicks. Inspecting/clicking is allowed and encouraged (tag inspection, gauge hover) but does not change outcomes in this part.
- **Aux operator chatter:** present, atmospheric/foreshadowing only. Never hands the player the answer — raises doubt at most (e.g., "Didn't we tag that AFW valve out for the surveillance test?").
- **Tag mechanic (Part 1 behavior):**
  - Tag visually occludes the AFW block valve position indicator only; pump run/discharge-pressure indicators remain visible and normal, reinforcing the false "AFW is working" read.
  - Click → generic outgoing request: *"Permission to remove tag on AFW block valve 3-1?"*
  - Supervisor → flat denial, 2–3 line variants for repeat clicks, escalating mild impatience on repeats (e.g., "Negative, that tag's not mine to pull. Stay on your gauges." → "Focus on your gauges. Tag stays until I say otherwise.")
  - No gating logic needed — deny is unconditional in Part 1.
- **Ending:** always resolves per history — acknowledged core damage. This is intentional; do not soften it.

---

## 5. Part 2 — "Under a Microscope"

- **Synoptic:** Learning Synoptic (full-color, physics animation on — void formation, actual PORV flow, real inventory loss vs. displayed PZR level).
- **Instructor:** Chief — R⚛️D's overarching instructor persona (used consistently across all training scenarios, not unique to this module). Distinct character from the in-fiction Shift Supervisor of Parts 1 and 3; Chief is explicitly the teaching voice, not a role-played character in the control room, so he can freely reveal plant truth, explain HR1 directly, and reference things the Part 1 crew didn't know.
- **Structure:** guided replay of the Section 2 timeline. At each key beat, instructor narrates the physical truth, then explicitly shows what the Part 1 board displayed at that same instant — making the HR1 gap visible.
- **Tag callout:** shown early and directly ("this tag is the actual reason — go check block valve 3-1") rather than functioning as a puzzle.
- **Closing beat:** Davis-Besse comparison (same failure caught in ~20 minutes vs. TMI's ~80) as a "what if" coda before transitioning to Part 3.

---

## 6. Part 3 — "Second Watch"

*(working title — alternates considered: "Second Chance," "With Hindsight," "The Save." Confirm before final copy pass.)*

- **Synoptic:** same Realistic Synoptic (quiet board) as Part 1.
- **Instructor:** Shift Supervisor, in-character, but now reactive to a player who may act with unusual confidence/specificity — this can be played for character ("You're awful sure about that valve").
- **Baseline dialogue parity:** the supervisor's scripted narration and instructions in Part 3 are **identical to Part 1** up until the moment the player actually deviates from history. Nothing should telegraph in advance that this is a "different" playthrough — the player has the foreknowledge, not the character. This also means the same acknowledge-gated pacing buttons from Part 1 reappear unchanged for any beat the player doesn't deviate on.
- **Deviation reaction arc:** how the supervisor responds to a deviating action depends on whether the player's request/action carries stated technical justification. A request that names the specific component, failure, and consequence (like the tag-pull request below) can be granted immediately — the player has made a case he can act on even without confirming plant data yet. A deviation with no stated justification (e.g. simply refusing a direct instruction, like declining to throttle HPI without explaining why) should get pushback/skepticism first, since from his instrument-limited view it just looks like the player ignoring procedure. Either way, he's still working from the same limited instruments the Part 1 supervisor had — he isn't granting things because he secretly knows the player is right.
- **Vindication beat:** once plant indications actually start improving as a result of the deviation (SG level recovering, pressure/temperature trending correctly), the supervisor should acknowledge it explicitly and in-voice — a distinct, separate line from the initial grant/pushback, timed to the plant data changing rather than to the player's action itself. This is the emotional payoff of Part 3 and should feel earned, not immediate.
- **Player agency:** open-ended, and goal-shifted from "catch deviation points" to **stabilize the plant.** The ultimate objective of Part 3 is that the player now knows how to counteract the accident's progression and actively does so — HPI, PORV isolation, AFW restoration are all just the tools for that, not a checklist to complete. The player operates the plant directly (adjusting HPI, closing the PORV block valve, pulling the tag, etc.) as they see fit, and the supervisor/aux operator react to the actual control actions and indication changes the player causes, not to a menu choice.
- **Inferring attention (tailpipe/quench-tank temperature):** this deviation point is not directly detected (no gauge-hover tracking needed). Instead, infer that the player "caught" it retroactively from a subsequent action — specifically, closing the PORV block valve meaningfully earlier than the historical ~80-minute mark is treated as evidence the player noticed the abnormal tailpipe/quench-tank temperature and acted on it, even though the noticing itself was never directly observed. The supervisor's line at that point can acknowledge it after the fact rather than requiring a separate detection event — something like *"Good call closing that block valve — I'm guessing you saw the tailpipe temp too."* This keeps the mechanic honest (early valve closure genuinely requires the player to have reasoned about *why*) without needing to instrument attention directly.
- **HPI throttle deviation:** this one is a clean, discrete control state (HPI setting at a given time vs. historical throttle-down point), so it can be tracked directly rather than inferred.
- **No automatic fast-forward/skip in Part 3:** unlike Parts 1 and 2, Part 3 does not surface the chat-native "Wait"/"Skip ahead" mechanic (Section 2.2). The premise of Part 3 is that the player is actively stabilizing the plant, not waiting on it, so a built-in skip doesn't fit the mode. The sim's existing speed-step controls (1×/10×/60×/etc.) remain available if a player wants to move through genuinely uneventful stretches, but nothing in the scenario script auto-offers or requires it.
  - Click → specific, informed outgoing request: *"Permission to remove tag obscuring valve indication on AFW block valve 3-1 — I believe it's blocking flow to the steam generator."*
  - Supervisor → **immediate grant**, no pushback beat. The request itself carries proper technical justification (naming the specific valve, the specific failure, and the specific consequence), which is enough for him to act on even without confirming plant data yet — this is different from the general deviation case below, where the player is contradicting an instruction with no stated justification. A short in-character beat is still fine (e.g. *"...Granted. Go."*), but it should read as fast trust, not resistance.
  - Tag removal unlocks the valve for direct operation.
  - **Separate, later vindication line** once SG level actually recovers on the synoptic: e.g. *"...Level's coming back. Good catch on that valve."* This fires off plant-state change, not off the grant — keep it as its own scripted beat so the payoff lands after the player sees the result, not immediately after asking.
- **Aux operator role reversal:** player-driven investigation can now prompt the player character to direct the aux operator to check something, rather than only overhearing chatter.
- **Outcome branching** (based on how many of the 3 deviation points the player catches/acts on):
  1. **None caught** — plays out historically (shouldn't really happen here since the player has hindsight, but should be handled gracefully if it does).
  2. **One or two caught** — supervisor reacts with genuine in-voice surprise/relief; accident contained faster, reduced core damage, shorter event.
  3. **All three caught** — best ending: incident averted to the level of "eventful shift" rather than a severe accident. Light non-fourth-wall-breaking acknowledgment from the supervisor that this isn't how it usually goes.

---

## 7. Open Questions for Tim

1. **Part 3 title** — confirm "Second Watch" or pick an alternate.
2. **Tag scope** — one representative AFW block valve, or all affected valves in the train? (Recommend one for a first-pass build, per earlier discussion.)
3. **Aux operator naming/role** — formalize as a named character (e.g., "Auxiliary Operator — Dave") for consistency across dialogue trees, or keep generic ("Aux Operator")?

---

## 8. Dialogue Content Requirements (Not Verbatim Script)

**Purpose of this section:** coding agents tend to default to minimal, perfunctory dialogue ("Pressure's dropping. Watch the gauge.") unless explicitly told how much needs to be conveyed. The lines quoted elsewhere in this spec (e.g. the tag-grant lines in Section 6) are *tone examples*, not the actual script — full dialogue writing is a separate pass. This section instead specifies, per beat, what content/teaching points/emotional beats **must** be present in that exchange, so whoever writes the actual lines (human or AI) has a checklist to hit rather than a blank page. Treat every bullet below as a minimum bar: multi-line, natural back-and-forth exchanges are expected, not single lines standing in for a whole beat.

### 8.1 Pre-accident lead-in (Section 2.1)
Must convey:
- A sense of a real, staffed control room — more than one voice, casual/routine tone, it's the middle of the night on a normal shift
- Baseline personalities for the Shift Supervisor and aux operator, established before the player needs to trust their judgment under pressure
- The foreshadowing beat (surveillance test / AFW tag) delivered as something genuinely unremarkable — it should not read as a "hint," it should read like something a real crew would mention in passing and immediately move on from
- A sense of routine competence — this crew is not incompetent or sloppy, which matters for the later lesson (the accident wasn't caused by bad operators, it was caused by bad information)

### 8.2 Cascade + scram + PORV opens (T+0:00–0:11)
Must convey:
- Recognition that this is a real event, but initially a *routine* one — a reactor trip on loss of feedwater is a trained, expected sequence, and the crew's early tone should reflect competence and procedure, not panic
- The PORV opening and the scram both read as "the plant did what it's supposed to do" — this contrast matters for Part 2's later reveal
- First mention of the PORV acronym gets the full spelled-out treatment per the Learning register (Section 4)

### 8.3 PORV fails to reseat / PZR climbs / HPI throttle call (~T+0:17 onward)
This is the single most important content beat in Part 1 — it needs the most dialogue depth, not the least. Must convey:
- The specific, plausible reasoning the crew used: PZR level rising is read as approaching "solid," and going solid was the thing 1979 training most wanted avoided — the crew's actions must make sense from inside that belief, not read as a mistake to the player in the moment
- The PORV "closed" indication is explicitly a *demand-signal* light, not a position sensor — this fact should be stated or at least strongly implied in-scene, not withheld entirely, since Part 1's tension is "the light says closed but something's still wrong," not "the player has no information at all"
- Some expression of confusion/concern from the crew as PZR level and pressure behavior seem to contradict each other, even if they resolve that confusion the wrong way — this is what makes the trap feel real rather than the crew simply not noticing anything was wrong
- The actual HPI throttle-down as a deliberate, reasoned decision made in-voice, not a silent background event

### 8.4 Compressed monitoring stretch
Must convey (even though this is time-skipped):
- A brief sense of what the crew *was* doing/observing during this stretch when the player returns to 1× or reads the compressed summary — not silence, a short narrated account
- The passage of real elapsed time in a way the player registers (per Section 2.2's guardrail)

### 8.5 Identification + PORV block valve closure
Must convey:
- The specific fresh-eyes moment or reasoning that leads to catching the abnormal tailpipe/quench-tank temperature — this should read as a genuine "wait a minute" beat, not a flat status update
- Explicit acknowledgment in-voice that the valve has been open this whole time, and roughly how much coolant/how long — the number itself (not just the fact) should be said aloud somewhere here, since it's part of what the scenario teaches
- A tonal shift — this is the moment the crew's read of the situation changes; the dialogue should reflect that shift, not just the plant state changing quietly underneath unchanged dialogue tone

### 8.6 Aftermath / transition to Part 2
Must convey:
- Acknowledgment that core damage occurred — stated plainly, not softened, per Section 4's "do not soften the ending" instruction
- A clear handoff cue into Part 2 (Chief takes over) rather than an abrupt cut

### 8.7 Part 2 (Chief's guided replay)
Must convey, at minimum, for **every** major beat replayed from Part 1:
- What the board displayed at that moment (echoing Part 1's actual indication)
- What was physically happening in the plant at that same moment (the truth Part 1 withheld)
- Why the gap between those two things existed — not just that it existed
- The HR1 rule should be stated explicitly at least once, in plain language, not only implied through examples
- The Davis-Besse comparison (Section 5) needs enough context that a player unfamiliar with it understands why it's relevant (same failure mode, caught in ~20 minutes vs. TMI's ~80) — not just named and dropped

### 8.8 Part 3 (Second Watch)
Must convey:
- Enough parity with Part 1's early dialogue that the player recognizes "this is the same situation" before anything diverges (per Section 6's baseline parity rule)
- Genuine in-voice reaction from the supervisor at the moment of deviation — pushback or grant should feel like a real response to a real request, with enough content that the player understands *why* the supervisor is reacting that way, not just a one-line accept/deny
- The vindication beat (Section 6) needs enough content to land as a real emotional payoff — a single terse line risks feeling like a checkbox rather than a moment the player earned
- If the player stabilizes the plant successfully, the ending dialogue should reflect the *scale* of what changed relative to history — not just "good job," but some acknowledgment of what didn't happen this time

---

## 9. Handoff Notes for Coding AI

- **Dialogue depth:** Section 8 specifies minimum required content per beat, not verbatim lines. Do not treat any single-line dialogue example quoted elsewhere in this spec as sufficient — those are tone references only. Write full, natural multi-line exchanges that hit every bullet listed for that beat.

- Single event/physics timeline (Section 2) drives all three parts — do not duplicate or fork it.
- Dialogue trees are per-part and keyed by `(part, interactionId, flags)` — implement as data tables, not inline branching, per the note in Section 3.2.
- Synoptic mode swap (Realistic Synoptic vs. Learning Synoptic) should reuse existing `mode` flag pattern from the base UI/HMI spec, not a new rendering path.
- First-mention-then-acronym behavior (Learning register) should use a global per-term "seen" flag for the scenario session, not per-line scripting, so it holds regardless of dialogue branch order.
