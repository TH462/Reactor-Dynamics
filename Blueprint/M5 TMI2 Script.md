# M5 — TMI-2 Training Scenario Script (v0.1 Skeleton)

**Status:** Structured skeleton — beats, speakers, and intent defined; actual dialogue lines are TODO.
**Companion to:** M5_TMI2_Scenario_Spec.md (the spec defines mechanics/structure; this file holds dialogue). When the two disagree, the spec wins — update this file to match.

---

## How to use this file

Each beat below lists: the **trigger** (what causes it to fire), the **speaker(s)**, the **intent** (what this beat must accomplish — pulled from Spec Section 8), and a **`[LINES TODO]`** slot where the actual dialogue goes.

Rules for whoever writes the lines (human or coding AI):
- Hit every intent bullet for the beat. The intent list is the minimum bar, not a suggestion.
- Write natural, multi-line exchanges — not one line standing in for a whole beat. See Spec Section 8 preamble.
- Speaker labels: **SUP** = Shift Supervisor (in-fiction, Parts 1 & 3), **AUX** = Auxiliary Operator (in-fiction), **CHIEF** = Chief (overarching instructor persona, Part 2 only), **PLAYER** = contextual outgoing bubble (player never types — see Spec 3.2), **SYS** = system/alarm/annunciator callout mirrored into chat.
- Acronym handling: first mention of each term gets full spellout then acronym, per Learning register (Spec Section 4). Track which terms have been introduced.
- Lines quoted in the spec are **tone references only** — do not paste them in as final.

---

# PART 1 — "The Fog of War"

*Synoptic: Realistic. Player knowledge: none. Deviation: none (scripted/historical). Ending: core damage, unsoftened.*

## P1-B0 — Pre-accident lead-in
**Trigger:** scenario start.
**Speakers:** SUP, AUX (back-and-forth), PLAYER (acknowledge-gated "Ready"/"Go ahead" buttons to advance).
**Intent (Spec 8.1):**
- Establish a real, staffed control room — multiple voices, casual middle-of-the-night routine tone.
- Establish baseline personalities for SUP and AUX before the player must trust their judgment under pressure.
- Deliver the AFW-tag / surveillance-test foreshadowing as genuinely unremarkable passing chatter — NOT a hint.
- Convey routine competence — this crew is capable, not sloppy (matters for the later "bad information, not bad operators" lesson).
**Pacing:** ~2–3 min. Uses acknowledge buttons to advance between exchanges.
**`[LINES TODO]`**

## P1-B1 — The interruption (condensate polisher trip)
**Trigger:** scripted timing beat mid-conversation (not a mid-sentence interrupt — see Spec 2.1). Plant event fires, next lines are reactions.
**Speakers:** SYS (alarm/annunciator), then SUP + AUX reacting.
**Intent:**
- The accident lands in the middle of what read as an ordinary conversation.
- First reactions are alertness, not yet alarm — a trip is a known sequence.
**`[LINES TODO]`**

## P1-B2 — Cascade + scram + PORV opens (T+0:00–0:11)
**Trigger:** continues from B1.
**Speakers:** SUP, AUX, SYS.
**Intent (Spec 8.2):**
- Recognition this is a real but *routine* event — reactor trip on loss of feedwater is trained and expected; tone is competence and procedure, not panic.
- PORV opening and scram both read as "the plant did what it's supposed to do" (sets up Part 2 contrast).
- First mention of PORV gets full spellout per Learning register.
**`[LINES TODO]`**

## P1-B3 — PORV fails to reseat / PZR climbs / HPI throttle call (~T+0:17+)
**Trigger:** PORV fails to reseat in physics timeline.
**Speakers:** SUP, AUX, PLAYER (acknowledge beats as needed).
**Intent (Spec 8.3) — HIGHEST DEPTH BEAT, do not shortchange:**
- Show the crew's plausible reasoning: rising pressurizer (PZR) level read as approaching "solid"; going solid was the most-avoided outcome in 1979 training. Crew actions must make sense from inside that belief.
- Establish the PORV "closed" indication is a *demand-signal* light, not a position sensor — stated or strongly implied in-scene.
- Show genuine crew confusion/concern as PZR level and pressure seem to contradict — even though they resolve it the wrong way.
- The HPI (High-Pressure Injection) throttle-down is a deliberate, reasoned, in-voice decision — not a silent background event. Full spellout on first HPI mention.
**Pacing:** ~3–5 min, real-time (1×).
**`[LINES TODO]`**

## P1-B4 — Compressed monitoring stretch
**Trigger:** after HPI throttle; SUP/AUX "watching it now" cue line, then "Wait"/"Skip ahead" option (Spec 2.2).
**Speakers:** SUP or AUX (lull cue), then narrated summary on skip.
**Intent (Spec 8.4):**
- Brief sense of what the crew was doing/observing during the stretch — a short narrated account, not silence.
- Player registers real elapsed time passing (timestamp jump / duration noted).
**`[LINES TODO]`**

## P1-B5 — Identification + PORV block valve closure
**Trigger:** timeline reaches identification point (~historical ~80 min mark in Part 1).
**Speakers:** SUP, AUX.
**Intent (Spec 8.5):**
- A genuine fresh-eyes "wait a minute" moment catching the abnormal PORV tailpipe / quench-tank temperature — not a flat status update.
- Explicit in-voice acknowledgment the valve's been open the whole time, and roughly how much coolant / how long — say the number aloud (part of the teaching).
- A tonal shift — the crew's read of the situation changes here; dialogue tone shifts with it.
**`[LINES TODO]`**

## P1-B6 — Aftermath / transition to Part 2
**Trigger:** block valve closed; scenario resolves.
**Speakers:** SUP, then CHIEF (handoff).
**Intent (Spec 8.6):**
- Plainly acknowledge core damage occurred — not softened.
- Clean handoff cue into Part 2 (Chief takes over), not an abrupt cut.
**`[LINES TODO]`**

---

# PART 2 — "Under a Microscope"

*Synoptic: Learning (full-color, physics animation). Instructor: CHIEF. Guided replay, not gameplay.*

## P2-B0 — Framing / intro
**Trigger:** Part 2 start.
**Speakers:** CHIEF, PLAYER (acknowledge buttons).
**Intent:**
- Chief establishes the frame: we're going back through the same event, this time seeing what was actually happening.
- Set expectation that the board the player trusted in Part 1 was showing readings, not truth.
**`[LINES TODO]`**

## P2-B1..B5 — Replayed beats (one sub-beat per major Part 1 event)
**Trigger:** Chief steps through each beat; player advances with acknowledge buttons.
**Speakers:** CHIEF, SYS (to echo Part 1 indications), PLAYER (acknowledge).
**Intent (Spec 8.7) — required for EVERY major beat replayed:**
- What the board displayed at that moment (echo Part 1's actual indication).
- What was physically happening in the plant at that same moment (the withheld truth) — shown via the physics animation.
- WHY the gap existed — not just that it existed.
- State the HR1 rule explicitly, in plain language, at least once across Part 2 (not only implied).
**Sub-beats to cover (mirror Part 1):** feedwater loss + AFW-no-flow (the tag), PORV opens correctly, PORV fails to reseat + demand-light gap, PZR-level-vs-pressure contradiction + HPI throttle error, core uncovery during the long stretch.
**`[LINES TODO per sub-beat]`**

## P2-B6 — Davis-Besse comparison / coda
**Trigger:** after replay.
**Speakers:** CHIEF.
**Intent (Spec 8.7):**
- Enough context that a player unfamiliar with Davis-Besse understands the relevance: same failure mode, caught in ~20 min vs. TMI's ~80.
- Not just named and dropped — land why it matters.
- Transition cue into Part 3.
**`[LINES TODO]`**

---

# PART 3 — "Second Watch"

*Synoptic: Realistic (same as Part 1). Player knowledge: full. Deviation: live. Goal: stabilize the plant. No auto-skip.*

## P3-B0 — Lead-in (parity with Part 1)
**Trigger:** Part 3 start.
**Speakers:** SUP, AUX, PLAYER (acknowledge).
**Intent (Spec 8.8):**
- Enough parity with Part 1's early dialogue that the player recognizes "this is the same situation" before anything diverges.
- Nothing telegraphs that this is a different playthrough — the player has foreknowledge, the characters don't.
- **Reuse P1-B0 through the point of first possible deviation.** Only diverge when the player acts.
**`[LINES TODO — largely mirrors P1, flag any deltas]`**

## P3-B-DEV-TAG — Tag removal (deviation: AFW block valve)
**Trigger:** player clicks the maintenance tag.
**Speakers:** PLAYER (specific informed request — see Spec 6), SUP (immediate grant).
**Intent:**
- PLAYER outgoing bubble carries proper technical justification (names valve, failure, consequence).
- SUP grants immediately (justification is sufficient) — fast trust, brief, not resistance.
- Later separate vindication line when SG level actually recovers (see P3-B-VIND).
**`[LINES TODO]`**

## P3-B-DEV-HPI — HPI throttle resistance (deviation)
**Trigger:** player keeps HPI running / declines to throttle at the historical throttle point (tracked directly — discrete control state).
**Speakers:** SUP (pushback first — no stated justification), AUX optional.
**Intent (Spec 6):**
- Because the player contradicts standard procedure with no stated justification, SUP pushes back / is skeptical first — from his instrument-limited view it looks like ignoring procedure.
- Enough content that the player understands *why* SUP is reacting that way — not a one-line deny.
**`[LINES TODO]`**

## P3-B-DEV-PORV — Early PORV block valve closure (deviation: inferred tailpipe-temp catch)
**Trigger:** player closes PORV block valve meaningfully earlier than historical ~80-min mark.
**Speakers:** SUP.
**Intent (Spec 6):**
- Attention to tailpipe/quench-tank temp is inferred retroactively from this action — no direct detection.
- SUP acknowledges after the fact ("guessing you saw the tailpipe temp too").
**`[LINES TODO]`**

## P3-B-VIND — Vindication beat(s)
**Trigger:** plant indications actually improve as a result of a deviation (SG level recovering, pressure/temp trending right). Fires off plant-state change, NOT off the player's action.
**Speakers:** SUP.
**Intent (Spec 6 & 8.8):**
- Explicit in-voice acknowledgment the player's call was right — separate, later line from the initial grant/pushback.
- Enough content to land as a real earned payoff, not a checkbox.
**`[LINES TODO]`**

## P3-B-END — Outcome / resolution
**Trigger:** plant reaches stable state (or historical outcome if player didn't deviate).
**Speakers:** SUP.
**Intent (Spec 6 outcome branching + 8.8):**
- Reflect the *scale* of what changed vs. history — acknowledge what didn't happen this time, not just "good job."
- Branch by how much was stabilized: full prevention / partial save / (graceful handling of historical outcome).
**`[LINES TODO — one variant per outcome branch]`**

---

## Script-level open items
- Confirm term-introduction order for Learning-register spellouts (which acronym is spoken first depends on final line order within each beat).
- Decide whether SYS alarm text appears in the chat log verbatim or only on the board (Spec 3.1 lists it as optional in-log).
- AUX naming (generic vs. named character) — inherits from Spec Section 7 open question; affects how AUX is labeled throughout this file.
