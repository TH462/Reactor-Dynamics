---
name: layman-playthrough
description: Send a fresh-context agent with no repo access to play the six PWR2 walkthroughs end to end in headless Edge, as a layman who knows what a pump and a valve are, then re-measure every claim it makes before any of it is filed. Use after a change to walkthrough text, grading, the board, or the speed bar; also runs as an "operator" persona, and on one leg instead of the chain.
---

# Layman playthrough of the walkthroughs

A reviewer who can read the repo reviews the repo, not the game. This skill puts an agent in
the player's seat: **fresh context, no repo access, only the walkthrough panel and the board**,
driving a real headless Edge page through a persistent Playwright driver, and it makes the
coordinating session **re-measure every finding before it reaches an issue**.

Both halves are load-bearing. Three passes ran on 2026-09-07 and every one of them
over-claimed: *"30 of 67 steps have no acceptance"* measured **6** (the panel draws the
done-when on the ACTIVE step only, and the extract had dropped the `accs`/`saw` forms); *"the
lit speed button drops to 1× on its own"* was **walkthrough steps checking off**, which a
measured A/B settled (60× stays 60× by button and by key); a *"25-minute freeze at 3600×"* did
not reproduce at an achieved ~1,180× over 88 plant-hours, the page answering in under 50 ms
throughout. **The reviewer reports what the screen showed it. What it CAUSED is yours to
measure.**

The same three passes found what nothing else did: "Tavg" used 34 times and not printed on any
tile, three different units for one gauge, a `LOAD` box that had moved off the number the
player typed, and a step whose lamp said done while its check-off said not done.

## 1. When to run it

- After any change to the walkthrough pool (`ui/manual_procedures.js`), its grading, the board
  tiles a step names, or the speed bar.
- Before shipping walkthrough work: a pass is not finished until **6 of 6 legs complete**.
- One leg is a legitimate run — pass a single id and skip the chain.
- **Swap the persona and the skill still holds.** An "operator" run (knows plant terms, does
  not know THIS board) finds label and layout defects a layman never reaches. Change only the
  persona paragraph of the prompt; the protocol, the report contract and the verification pass
  are unchanged.

The six legs, in chain order — each one's `from` is the previous leg's end state:

`pwr_heatup` · `pwr_startup` · `pwr_raise_power` · `pwr_lower_power` · `pwr_shutdown` ·
`pwr_cooldown`

## 2. Prerequisites

| | |
|---|---|
| Edge | `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` (override with `RD_EDGE`) |
| Playwright | the repo's own `node_modules/playwright-core` — there is no `package.json` to install from |
| URL | `file:///C:/grok_build/Reactor_Dynamics/ui/shell.html?engine=pwr2` |
| Viewport | 1600 × 1000, `deviceScaleFactor: 1` — the reports are written against this size |

**`&dev=1` is the COORDINATOR's hook and never the reviewer's.** It hands a harness the live
service. A reviewer that touches it is reading the plant instead of the board, and its report
stops being evidence about what a player can see.

## 3. Setup

```bash
S=<a fresh scratch dir>                       # never a directory a previous pass used
mkdir -p "$S"
cp .claude/skills/layman-playthrough/driver.js "$S"/
cp .claude/skills/layman-playthrough/go.sh    "$S"/
node "$S/driver.js" "$S" &                    # arg 1 = scratch dir; arg 2 = repo dir (default this repo)
until [ -f "$S/driver_ready.txt" ]; do sleep 1; done
```

The driver creates `cmd/`, `out/` and `shots/` under the scratch dir, and appends any page
error to `pageerrors.log`. **Kill it when the pass ends** — it is an endless loop with a
browser attached (`taskkill //PID <node pid> //F //T`, then check no `msedge.exe` survives).

## 4. The command-file protocol

One long-lived page across the whole run. A `node script.js` per action would relaunch the
browser and lose the plant, so every step would restart from cold.

```bash
sh "$S/go.sh" "$S" <unique-name> <file-with-js>     # or pipe the js on stdin
```

`go.sh` copies the file to `cmd/<name>.js`, blocks until `out/<name>.txt.done` appears, and
prints the result. Names must be unique — each command file runs once.

Inside a command file, the body is an async function with these in scope:

| | |
|---|---|
| `page`, `browser` | the live Playwright page |
| `shot(name)` | screenshot to `shots/<name>.png`, returns the path |
| `ckl()` | innerText of `#cklRun` (the running walkthrough, in the Instructor tab) |
| `body()` | innerText of the whole page |
| `sleep(ms)` | wall-clock wait |
| `fs`, `path`, `ROOT`, `REPO` | scratch dir and repo dir |

Return a string and it is written verbatim; return anything else and it is JSON.

## 5. What the reviewer is told about the page

Give it these facts and no more. They are the scaffolding, not the game.

- The **Walkthroughs** tab of the right-hand panel is the LIST. A running walkthrough is drawn
  in the **Instructor** tab, one step at a time, headed `Step X of N`, details already open.
- Every step ends in **`Continue ▶`** (`.wt-continue`): dark and disabled until the instruments
  satisfy the step, class `ready` and lit when they do. **`⏪ Rewind step`** (`.wt-rewind`)
  takes the plant and the walkthrough back to the start of the previous step.
- The **Plant & Mission** window opens by clicking `#simStatus` (it is NOT open on load); its
  **Walkthroughs** tab (`[data-mmode="walkthroughs"]`) lists all six with **`▶ Start`**
  (`[data-wtstart="<leg id>"]`), which loads that leg's own starting condition and starts it.
- Speed buttons are `[data-speed="1|5|10|60|600|3600"]`; 600× and 3600× are WARP. **The status
  line under the bar (`#warpInfo`) says why WARP was refused or dropped** — read it rather than
  guessing.
- Board buttons take ordinary clicks. Rod `WITHDRAW`/`INSERT` are momentary: a tap is one step,
  a hold drives (`page.mouse.down` / wait / `up`). Number boxes need a typed value **and
  Enter** — `fill()` alone does not commit. Some things on the diagram are clickable symbols,
  not buttons; click them by coordinate from a screenshot.

## 6. The reviewer's rules

Launch it with the **Agent** tool, `model: opus`, fresh context. Not a fork — a fork inherits
everything the persona is supposed to lack.

- **Only the running page teaches it.** No file under the repo: no `ui/`, `engines/`, `layers/`,
  `test/`, `Blueprint/`, `Manuals/`, `Diagnostic/`. No grep. It writes only inside its own
  scratch dir.
- **Do what the step says, exactly, and nothing else.** Type the numbers the step gives, at the
  pace it gives.
- **"I could not find it" is a finding, not a failure.** Two honest attempts at the step's exact
  words, then record `could not find <words>` and do what a player would do next. It never
  guesses at a control by reasoning about what the plant needs.
- **Press Continue when it lights.** It cannot see `awaiting_ack`; the lit button is the only
  signal it has. If it gets lost, **Rewind step**.
- **Screenshot every step and every stuck point**, and name the file in the log.
- **Log wall time and sim time** for every step: what it looked for, what it clicked, how long
  it held, which speed, how long the step took to satisfy, whether Continue lit.
- **Record every action the text did not tell it to take** in order to make a step pass. That
  list is where the sharpest defects come from.
- **It asks nothing.** A question to the coordinator is the persona leaking.
- Never more than ~5 minutes of wall time on one step before declaring itself stuck.

## 7. Prompt template

Fill the `<>` placeholders. Keep it this short — the persona is destroyed by helpfulness.

```
You are play-testing an educational nuclear plant simulator by FOLLOWING ITS INTERACTIVE
WALKTHROUGHS, as an intelligent layman with no nuclear background: you know what a pump and a
valve are, nothing more. The question is whether a layman can get from cold shutdown to full
power and back using only what the walkthrough text and the control board say, and exactly
which words or missing information stop them.
<for an operator pass, replace the two sentences above: "…as a licensed operator on a board you
have never seen: you know Tavg, subcooling, 1/M and shutdown margin; you do not know where this
board puts anything or what it calls it.">

## Hard rules
- You may ONLY learn from what the running page shows: the walkthrough panel text and the
  board's visible labels and values. Do NOT read any file under C:\grok_build\Reactor_Dynamics
  (no ui/, engines/, layers/, test/, Blueprint/, Manuals/, Diagnostic/). Do not grep the repo.
  If you cannot work something out from the screen, that IS the finding — record it, then do
  what a player would do.
- Do what the current step says, exactly as it says it, and nothing else. Type the numbers the
  step gives, at the pace the step gives. If a step names a control you cannot find by its
  exact words within two honest attempts, record "could not find <words>", then try the most
  likely thing a player would.
- Never edit any file outside <SCRATCH>. Ask no questions.

## Driving the browser (the only technical scaffolding you get)
A headless Edge page is already running and waiting for commands. To run one:
  sh <SCRATCH>/go.sh <SCRATCH> <unique-name> <path to a .js file you wrote>
The file's body is an async function with `page` (Playwright), `shot(name)`, `ckl()`,
`body()`, `sleep(ms)` in scope; return a string and you get it back. Screenshots land in
<SCRATCH>/shots/ — Read the PNG to look at them.

Facts about the page you are allowed to know:
<paste section 5 of this skill, verbatim>

The page starts at file:///C:/grok_build/Reactor_Dynamics/ui/shell.html?engine=pwr2 . Press
the play button (#playBtn) if the clock is stopped. Give the plant time: waits of plant-hours
are expected and the step's ⏩ line tells you when to use the speed buttons. Poll the panel
every few seconds of wall time rather than sleeping blind.

## The run
Play <LEGS> in order. <For the chain: each finished leg offers the next; if a leg cannot be
finished, record why, then open Plant & Mission (#simStatus) → Walkthroughs and press Start on
the next leg, which loads its own starting condition.> Budget about <90> minutes of wall time.

Keep a log as you go. For EVERY step: the step number and its first sentence; what you did
(which words you looked for, what you clicked, how long you held, which speed); how long it
took to satisfy; whether Continue lit; and anything that confused you — a word not on the
board, a value you could not find, a done-when you could not read, a term you did not
understand, something that happened the text did not prepare you for. Screenshot every step
and every point of confusion, and name the file in the log. Record every place you had to do
something the text did NOT say in order to make a step pass.

## Deliverable
Write <SCRATCH>/playthrough.md with:
1. Outcome — a table: leg, result, steps completed, the one thing that mattered.
2. Stuck points, ranked by severity, numbered S-1, S-2, … Each: the step, the step's text
   QUOTED, "What I did", "What would have unstuck me" (one sentence).
3. The per-step log (every step you reached).
4. Words and numbers you could not find on the board, as a table: what the walkthrough said
   against what is actually on the board.
5. What the text got right — one line each, no praise, just the list.
Be concrete and quote actual on-screen text. Length is not a concern; completeness is.
Build tag under test: <BUILD>.
```

## 8. The report contract

The reviewer's file becomes
`Diagnostic/CHECKLIST_PLAYTEST_<YYYY-MM-DD>_LAYMAN[_PASSn].md`, edited by the coordinator only
to prepend the header in section 9. Its shape is fixed because three reports share it and they
are read against each other:

- A blockquote header opening **`> **Record, not policy.**`** — one paragraph: which pass, the
  date, the tree it ran on, how many legs completed, and the stuck points in one clause each.
- **Build, player model, screenshots, wall time** under the title.
- **§1 Outcome table** — one row per leg.
- **§2 Stuck points** ranked, numbered `S-n`, each with a severity word, the step text quoted
  verbatim, *What I did*, *What would have unstuck me*. **The coordinator then adds the
  `**Measured:**` and `**Verdict:**` lines of section 9 to every `S-n` in place**, so the
  report and the issue comment carry the same two lines for the same finding. An `S-n` with no
  Measured line has not been through the verification pass.
- **§3 per-step log**, **§4 words not on the board**, **§5 what worked**.

## 9. The coordinator's verification pass

**Nothing from the report is filed, fixed or quoted until it has been re-measured on this
tree.** This is HR12 applied to a witness who is doing exactly what it was asked to do:
reporting a screen. Do it claim by claim.

1. **Sort the claims.** *Wording and label* claims ("Tavg is not on any tile", "the step says
   demand and the card shows none") are checkable by reading the built pool and the board
   inspect map — do that against the **built object** (`RD.MANUAL_PROCEDURES.pwr2`), never the
   source file, which also holds the retired and BWR pools. *Behaviour* claims (a step will not
   pass, a value does not move, the clock changed by itself, the page froze) are unmeasured
   until you reproduce them.
2. **Re-measure behaviour with the replay harness or a headless script.**
   `node test/run_checklist_pwr2.js <proc_id>` drives that leg end to end through the full
   stack and asserts every acceptance — it is the fastest disproof of "this step cannot pass".
   For anything the harness cannot see (the clock, WARP, paint, a control that takes two
   presses), write a headless script and drive the same sequence. **Run it at the reviewer's
   own numbers, and again at the neighbouring one**: a red probe can be the reference moving
   rather than the plant.
3. **Ask what the reviewer actually saw.** Every over-claim in the three 2026-09-07 passes was
   a correct observation with a wrong cause attached. The clock did drop — because a step
   checked off. The acceptance was invisible — because the panel draws it on the active step
   only. **Keep the observation, replace the diagnosis.**
4. **Prepend a correction header.** In the same blockquote, name what was refuted **with the
   number that refutes it**: *"the 25-minute freeze at 3600× did not reproduce: 88 plant-hours
   at an achieved ~1,180×, the page answering in under 50 ms throughout"*. A refuted claim
   stays in the report body — the record is what the player experienced.
5. **File what survives** as a comment on the umbrella issue (walkthrough text and runtime:
   **#653**; the owner playtest rework: **#660**), with the `Claude` label. **Every finding is
   filed in this shape, and the two bold lines are mandatory:**

   ```
   ### <S-n> — <one-line title>  ·  <severity>
   **Saw:** <what the reviewer reported, its words>
   **Measured:** <what was re-measured, with which harness or script, and the NUMBER>
   **Verdict:** confirmed | refuted | narrowed — <what the number changed about the claim>
   ```

   **A finding with no `Measured:` line is not filed.** It goes back for measurement, or it is
   dropped with a one-line note saying it was not measured — never softened into prose and
   posted anyway. The three over-claims at the top of this skill are why: *"30 of 67 steps have
   no acceptance"* measured **6**, the 1× drop was **a step checking off**, and the 3600 ×
   freeze **did not reproduce**. All three were filable-looking, all three would have been
   filed, and all three would have sent someone to fix a plant that was working.

   `narrowed` is the common verdict and is not a soft `confirmed`: it means the observation
   stands and the cause the reviewer attached to it does not. Say both.

   Open a new issue only for something outside the umbrella.
6. **Fix, then run a FRESH pass.** A new scratch dir and a new agent, because the old one now
   knows the answers. Repeat until 6 of 6 legs complete with no stuck point above MEDIUM.
7. **Gates for anything you changed**: `run_checklist_pwr2`, `run_checklist`, `run_style`,
   `verify_ckl_relevance`, `verify_e2e_ui` — then `node test/run_all.js`.

## 10. Known traps

- **3600× needs a quiet board.** A new unacknowledged critical or warning alarm drops WARP;
  a caution does not. Press **Ack All** on the alarms panel first. `#warpInfo` prints the
  reason for every refusal and every drop — quote that line rather than diagnosing the clock.
- **A step checking off drops the clock**, by design (#619). It looks exactly like the speed
  reverting on its own, and it is the single most-repeated wrong diagnosis in these reports.
- **Rod buttons are momentary.** A tap is one step; driving takes a hold. `MED` at 1× is about
  0.7 steps per second, `SLOW` about 0.1 — a 200-step withdrawal at 1× is minutes of holding,
  so the reviewer will reach for time acceleration and should say so in its log.
- **SCRAM is two presses**: `PRESS TO ARM`, then `SCRAM`. The button prints both states.
- **The accumulator valve is a diagram symbol**, not a labelled button, and it is not beside
  the `ACCUMULATORS` tile. The active step rings it green; that ring is the only way a player
  finds it.
- **The reviewer cannot see `awaiting_ack`** — only whether `Continue ▶` is lit. Do not accept
  "the step never completed" without checking whether Continue was drawn ready.
- **Number boxes need Enter.** A value typed and left uncommitted reads back as the old one,
  and a step that will not pass for that reason is a driver defect, not a plant defect.
- **A fresh scratch dir per pass.** A reused one replays stale `out/*.done` files and the
  reviewer reads a previous pass's answers as its own.
