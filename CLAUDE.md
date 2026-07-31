# CLAUDE.md — coding-agent instructions

**This file is the orientation document for coding agents** (Claude and others)
working in this repo. The public, visitor-facing overview is `README.md`.

**It is TRACKED IN GIT** (since 2026-07-29 — it used to be gitignored). Edit it like
source: the change belongs in the commit that makes it true, and `git log CLAUDE.md`
is how a future agent finds out *when* a rule arrived and *why*. It goes public with
the repo; there is nothing secret in it. It does reference two directories that stay
local (`inbox/`, `terminals/`) — that is fine, they are named as local.

**Keep it SHORT.** It is loaded into every agent's context on every turn. Prefer a
pointer over a paragraph, and delete as readily as you add. Hard caps that are part
of the file's design, not suggestions: the *Project status* themes list is **max 5
bullets** (drop the oldest), and nothing here may duplicate `Diagnostic/TUNING_LOG.md`
— if you are writing history, you are writing it in the wrong file.

When in doubt about a number, prefer the as-built engine/config values over prose
docs.

> **Be brief. Facts, numbers, decisions** *(OWNER DIRECTIVE, 2026-07-30: "I would also like to
> adjust the conciseness of replies. Most replies are a bit too long. I need just the facts and
> important information to know what the ai did and to make decisions.")*. Lead with what
> changed and the number that shows it. **Cut**: restating the request, narrating what you are
> about to do, reasoning nobody asked for, re-explaining a decision already made, and the
> victory lap after a green gate. **Keep**: measurements, deltas, what broke and why, and
> anything that changes what he does next. Detail belongs in the commit message, the issue or
> `Diagnostic/TUNING_LOG.md` — the reply is not where the record lives. The two delimited blocks
> below are already bounded; this does not shrink them further.

> **End with what is STILL OUTSTANDING** *(OWNER DIRECTIVE, 2026-07-30: "I would like to add to
> claude.md to have the ai place a 'Still Outstanding' summary at the bottom so i know exactly
> what still need to be done with respect to the task the ai is working on. This summary should
> include a recommendation for what to work on next.")*. Close any response that leaves work
> unfinished with a delimited block, last thing before you stop:
>
> ```
> **— STILL OUTSTANDING —**
> - <item> — <why it is not done: not started / blocked on X / needs your ruling>
> **Next:** <the ONE thing you recommend, and why>
> **— END STILL OUTSTANDING —**
> ```
>
> **Scope it to the task in hand**, not the whole backlog — the owner is asking "where are we on
> *this*", and a list of everything open answers a different question. **Name what blocks each
> item**: "not started", "waiting on your ruling" and "blocked by another session" are different
> facts and only one of them is yours to clear. **One recommendation, not a menu** — same rule as
> the block above.
>
> **Omit it entirely when nothing is outstanding**, and say so in a sentence instead. A section
> that appears every turn stops being read, which is the failure mode the First Principles rule
> already names. It is a *status report*: it never substitutes for asking when a decision
> genuinely blocks (SOP §5), and it never turns an unmeasured claim into a plan (HR12).

> **When you ask the owner something, bring the recommendation with it** *(OWNER RULING,
> 2026-07-29: "I think we should add to SOP to have you automatically give your recommendation
> when asking for my input so I don't have to keep asking for it.")*. Lead with the answer you
> would give and why, then the alternatives — a neutral menu is a recommendation you declined
> to make. Say what you will do if there is no reply, and what would change your mind. Rank
> them if there are several. And do not ask at all when the call is routine: make it, state
> the assumption, move on. Full guidance, including the cases where it genuinely blocks:
> `Blueprint/SOP.md` §5.

> **The First Principles section — a CANARY, not an essay** *(OWNER RULING, 2026-07-29: "I would
> label it the 'First Principles' section. The start and end should be marked."; narrowed hours
> later, on the first two in the wild: "the first principles section is usually too long. I
> consider it a canary. Something to tell me if there's something that needs to be looked into.
> It doesn't need to be verbose.")*. Any response may carry one delimited block giving the raw
> read — the blunt judgement, the disagreement with the framing, the thing the body would have
> softened into a menu:
>
> ```
> **— FIRST PRINCIPLES —**
> <ONE concern. Two or three sentences, ~50 words.>
> **— END FIRST PRINCIPLES —**
> ```
>
> **One concern, not a survey** — the first two drafts each crammed in three, which is what made
> them too long. Two candidates: ship the one you would most regret him not seeing. Needs more
> than three sentences: then the canary is a short line plus an offer to expand, or an issue.
> Same sense as HR9's — it says *look here*, it settles nothing.
>
> **Unhedged, not unaccountable.** Exempt from habit (hedging, deferring to documents, ranking
> the cheap option first), never from the rules: **HR12 still binds** — an unmeasured claim must
> say so, since a rules-free zone for confident plant-dynamics claims is what #205 and #220 are
> the record of — as do HR11 and no-fabricated-sources, and it can never authorise an action or
> excuse a gate. **Optional and never padded**: a slot filled every turn trains the owner to skip
> it. **Two triggers worth knowing** — the *ranking disclosure* (your recommendation is the safe
> option and a higher-fidelity one exists you are not recommending: say which you would pick on
> fidelity alone, #251), and a doubt about your own work you would otherwise bury. Not gateable.

> **You may not be the only agent in this repo. Check all lanes before you edit.** Two sessions
> in one working directory will overwrite each other's files and sweep each other's
> work into the wrong commit — this is not hypothetical, it happened on 2026-07-29 and
> cost a set of manual edits their attribution. A **branch does not isolate anything**;
> only a separate working directory does.
>
> | Working tree | Branch | |
> |---|---|---|
> | `C:\grok_build\Reactor_Dynamics` | `develop` | **the main working branch — use this unless it is taken** |
> | `C:\grok_build\RD_workbench` | `workbench` | overflow lane 1, for when a second agent is already on `develop` |
> | `C:\grok_build\RD_backshop` | `backshop` | overflow lane 2, same rules as workbench (third concurrent agent) |
>
> - **First thing in a session, check ALL trees.** Occupancy is uncommitted modified files
>   *plus* a **recent** commit — run all four lines, do not stop at the tree you are standing in:
>   ```
>   git worktree list
>   git -C C:/grok_build/Reactor_Dynamics status --short && git log develop   -1 --format='%h %cr'
>   git -C C:/grok_build/RD_workbench   status --short && git log workbench -1 --format='%h %cr'
>   git -C C:/grok_build/RD_backshop    status --short && git log backshop  -1 --format='%h %cr'
>   ```
>   A commit inside the last hour or so means a live session; hours old means history.
>   **Unmerged commits on `workbench` / `backshop` are NOT occupancy** — carrying work that has
>   not reached `develop` yet is what those lanes are *for*. On 2026-07-29 workbench held five
>   such commits and was completely free. **The check is not one-shot: re-check before your
>   first commit.** `develop` was quiet in one session's t=0 snapshot and picked up another
>   session an hour in.
> - **On a positive, WARN AND ASK — do not move on your own** *(OWNER RULING, 2026-07-29:
>   "Maybe it shouldn't be automatic. The agent should warn the user and ask if they should use
>   workbench." — and, refining it: "it should also check if there's an agent working in the
>   workbench before moving.")*. Say what you found in each lane (which files, which commit, how
>   recent), recommend, ask; SOP §5 shape. The detection misfires both ways — another live
>   session, the owner's own uncommitted edits, and your own leftovers read identically, and only
>   the owner can tell them apart cheaply. **Investigating in place while you wait is fine;
>   editing, writing probe files and committing are not** — collisions come from writes.
>   Normally recommend *yes, switch* when `develop` is busy and an overflow lane is clear: the
>   risk is asymmetric, a needless move costs one merge. Prefer **workbench** first, then
>   **backshop**. **If ALL overflow lanes look occupied, do not pick one** — say so and offer a
>   further tree; that is the owner's call, not a default.
>   **Absent a reply: stay read-only and say what you are waiting on** *(OWNER RULING,
>   2026-07-29: "lets go with your recommendation.", on the recommendation to cut the earlier
>   draft's no-reply default)* — **the heuristic never gets an action.** The first draft moved to
>   the workbench on its own whenever it looked clear; that was an agent proposal marked "for the
>   owner to rule on" and never ruled on. It also fires on the *common* false positive — your own
>   leftovers in the tree you just started in — while the case where guessing wrong is genuinely
>   expensive is the case where the owner is present to answer in seconds.
> - **Starting on `workbench` or `backshop`: `git merge --ff-only develop` — and when it refuses,
>   do a real `git merge develop`.** Neither is a feature branch; each exists only so another
>   agent has somewhere to work, but `--ff-only` fails whenever the lane still carries unmerged
>   work, which is the normal case (`fatal: Not possible to fast-forward, aborting.`). Expect the
>   conflict files below, keep both sides, re-run `run_all`.
> - A new tree comes from `git worktree add <path> <branch>`, and needs `node_modules`
>   junctioned from the primary tree (it is gitignored, and the Playwright gates need it)
>   plus an `inbox/` directory. `CLAUDE.md` now arrives with the checkout.
> - Commit to **your own branch**; merge to `develop` only with gates green.
> - Guaranteed merge conflicts, all newest-at-top: `CHANGELOG.md`,
>   `Diagnostic/TUNING_LOG.md`, `Blueprint/BUILD_DECISIONS.md`, and the `BASELINES` map
>   in `test/run_all.js`. Keep both sides, then **re-run `run_all`** — a mechanical
>   BASELINES resolution can silently take the wrong number, and that one will not
>   announce itself.

> **The plant is the ground truth (HR9).** The only question that decides a tuning or
> behaviour change is **"what should this plant actually do?"** — never "what keeps this
> mission green?" Authority runs one way: physics/prototypicality → this plant's ruled-on
> identity → the behaviour catalog + physics acceptance suites → control setpoints →
> authored content → that content's gates. **Content never votes on physics.** When a
> mission, procedure or checklist breaks after a plant change, presume the *content* is
> stale. Read the break — it is a canary, not an authority — but settle it against the top
> three levels, and say which behaviour you are treating as ground truth. Full rule and the
> worked near-miss: `Blueprint/CONTEXT.md` §3 HR9.

> **Prototypicality claims are SOURCED, never recalled — run an evidence pass** *(OWNER
> DIRECTIVE, 2026-07-28: "I like the idea of the evidence pass to find the data on how a real
> plant does it instead of relying on recall. I think that should be our SOP for issues like
> this one. All sim plant designs should be based on real plant documentation.")*. Before you
> change a plant number, setpoint or behaviour on the grounds that "real plants do X", go find
> the document that says so and **cite it in the change** — ADAMS accession number, section,
> and enough verbatim quote to check. Recall is not evidence; neither is another agent's
> summary, nor a claim already in this repo (many were written from recall and several have
> been disproved — see #220, #230, #205). If you cannot source it, say so plainly and mark the
> claim unverified rather than acting on it. Worked examples: **#220** (ten claims verdicted
> against NRC primaries) and **#205** (an evidence pass that overturned the filed diagnosis
> *and* one of my own interim findings). Source corpus and the nrc.gov fetch workaround:
> `Diagnostic/TUNING_LOG.md` 2026-07-28q and the `pwr-prototypicality-sources` memory.

> **A passing test is not evidence the mechanism is right (HR10).** Tests check that the sim
> does what it is **intended** to do — not just that it does what it already does. A test
> written from observed behaviour can only confirm that behaviour, including the wrong parts. If you cannot say why a mechanism is correct without citing
> which tests pass, you have not finished — three probes accepting a design only means those
> three probes accept it. When a change reddens a gate, first ask what the gate was actually
> asserting: it may be pinning a fixture, a transient, or the defect you are fixing. If you
> move a test, validate the new form against the OLD behaviour too — passing on both makes it
> a better test; passing only on your change means you refitted it, and you must say so. Full
> rule and the three worked cases (#200, #206, #219): `Blueprint/CONTEXT.md` §3 HR10.

> **RBMK and BWR are on hold.** Do **not** implement, tune, refactor, extend, or
> "fix while you're here" the RBMK or BWR engines, controls, scenarios, UI, or
> their tests. All active work is **PWR only** until the PWR is finished and the
> owner reopens those plants. Touching them wastes tokens; leave known RBMK/BWR
> reds and backlog items alone unless the owner explicitly asks. Shared code is
> fine to change for a PWR need — do not start RBMK/BWR-specific work.

> **What actually binds you** *(OWNER RULING, 2026-07-27: "I think we have too many
> instructions in this project and it's starting to confuse the coding agents and gum up the
> works… Go with your recommendations")*. There are ~229,000 words of docs here containing
> ~650 "do not / never / by design" phrases. Four rules make that tractable:
> 1. **Binding: the Hard Rules in `Blueprint/CONTEXT.md` §3, and this file.** Nothing else.
>    Ten rules, deliberately short. **`Blueprint/SOP.md` §1–4 is NOT binding** — it holds the
>    *how* (worked cases, failure modes, procedure) that used to bloat §3 to 200 lines. Read
>    it for technique; do not cite it as authority. **§5 is the exception**: it records a
>    direct owner instruction, quoted and dated, so it binds under rule 4 below — because the
>    owner said it, not because SOP.md says it. That is the only way anything in that file
>    binds, and it is why every entry there must carry its quote.
> 2. **`Diagnostic/`, `BUILD_DECISIONS.md` and `Manuals/` are RECORD, not policy** — they say
>    what happened and why, not what you must do. Read them for evidence; don't obey them.
> 3. **Plans expire when executed.** A phased work order stops binding the moment it is done
>    (`PWR_SHIP_REVIEW_PLAN.md` was the worked example — it governed for a week after finishing,
>    and was retired 2026-07-29; see `Blueprint/RETIRED.md`, which is where deleted documents
>    are indexed so you can find one you did not know existed).
> 4. **A directive with no date + verbatim owner quote is advisory.** Weigh it, say you did,
>    move on. See `CONTEXT.md` §3 for the format and why.
>
> If you find yourself blocked by a sentence in a doc, check which of the four it falls under
> before deferring to it.

---

## Start here (the map)

Find your task and go straight to the authoritative source — you do **not** need
to read everything.

| If you want to… | Read / run |
|---|---|
| **Understand the whole system** | `README.md`, then `Blueprint/CONTEXT.md` (interfaces, hard rules, data contract). |
| **Understand *why* it's built this way** | `Blueprint/DESIGN_COMPANION.md` (vision, rationale, deliberate exclusions, v2 roadmap). |
| **Apply a Hard Rule to a real decision** | `Blueprint/CONTEXT.md` §3 for the rule (binding, 10 rules, each names its guard), then **`Blueprint/SOP.md`** §1–4 for the worked cases and technique (advisory). |
| **Put a decision to the owner** | `Blueprint/SOP.md` §5 — always bring your recommendation; see the block above. |
| **Find a document that was deleted** | `Blueprint/RETIRED.md` — what was removed, why, and the command to read it again. |
| **Build or modify a module** | `Blueprint/CONTEXT.md` **plus that one module's spec** (`Blueprint/M1`–`M8`) — and nothing else. |
| **Know what changed recently** | `CHANGELOG.md` (skimmable) → `Blueprint/BUILD_DECISIONS.md` (dense engineering rationale, tuning, gate tallies). |
| **Operate the plant / look up a control, setpoint, or procedure** | `Manuals/` — start at `Manuals/README.md` (commercial-format PWR operator manuals). |
| **Pick up the active tuning / bug-fixing effort** | `Diagnostic/TUNING_LOG.md` — the session-continuity record: current status, the tuning toolbox (knobs + tests + workflow), a dated worklog, and the full backlog of known & suspected issues. **Read this first when continuing tuning work.** |
| **See current known issues, tuning gaps, playtest findings** | `Diagnostic/` (`TUNING_LOG.md`, `SPEC_AUDIT_*.md`, `OPS_TUNING_REPORT.md`, `PLAYTEST_REPORT.md`) and `Manuals/ISSUES_AND_FINDINGS.md`. |
| **Tune plant behavior (the physics "knobs")** | Each plant's **`[tune]`-annotated constants** in `engines/<plant>/<plant>_config.js` (PWR 89, RBMK 27, BWR 37 — the file header explains the convention: `[tune]` values are starting points arbitrated by the scenario suite; un-marked values are fixed). Protection/alarm/failure setpoints are data too, in `layers/control/<plant>_control.js`. Validate with `test/run_ops.js` and `test/run_behavior.js`; open tuning targets are tracked in `Diagnostic/OPS_TUNING_REPORT.md`, and the live worklog + toolbox is `Diagnostic/TUNING_LOG.md`. |
| **Run the simulator** | Open `index.html` (landing page — Operate the PWR from there), or `ui/shell.html` directly — see below. |
| **Run the tests** | `node test/run_<suite>.js` — see below. |

---

## Project status

> **Keep this section current.** When you finish work that changes what is built,
> working, or broken, update the status line and gate baselines below in the same
> change. The dense, append-only version lives in `Blueprint/BUILD_DECISIONS.md`
> (Status line + Open Flags table) — update both.

_Last updated: **2026-07-29**._

**Where the PWR is.** All PWR engine, behaviour, ops and stack gates green; `run_all` is
**34 runners at baseline**. Open backlog is dominated by RBMK/BWR operability (on hold) plus
a handful of UI/doc items.

**Recent themes** — **max 5 bullets, newest first; adding one means deleting the oldest.**
They are a reading aid, not a record: the full history is `Diagnostic/TUNING_LOG.md`, and
anything here that is standing procedure rather than news belongs in the list below it.

- **The SCRAM button's RESET half was inert from the day it was drawn, and 18 green checks
  did not notice (2026-07-31, #75).** The board has read **PRESS TO RESET** under SCRAMMED
  since it was built; `onScramReset` was an empty stub commented *"no engine reset command;
  visual only"*, which was false when it was written — the engine's `reset_rps` (with its
  rods-in interlock) and the kernel's `resetRps()` permissive both existed and were both
  green under an ops probe. Three finished halves, never joined: pressing produced no reset,
  no refusal and no message. **The refusal was invisible in code too** — `resetRps()`
  returned `type: 'refused'`, a shape returned by two lines and read by *nothing* in the
  repository, so a correctly-computed refusal went into a branch that does not exist. It now
  returns the `blocked` + `INTERLOCK` shape `app.js` already flashes. **The permissive is
  STATE now**, from the same evaluator the press uses, so the caption names what is holding
  it (*TRIP SIGNAL STANDING* / *RODS NOT AT BOTTOM* / *PRESS TO RESET*) and the board cannot
  promise a reset the plant will refuse. Rod bottom became a `rods_fully_in` status word
  sharing one constant with the engine interlock (HR1); the permissive list is plant config,
  so the kernel stayed generic and **`run_hr3` is unmoved at 29** — #228's leak was not
  widened. Measured (hot full power, seed 42): turbine trip holds ~1 s, rod bottom ~2 s more,
  available ~t+4 s; a loss of feedwater keeps it blocked on *low steam generator level*
  indefinitely, which is the teaching case. **The lesson to carry: with 18 checks written
  and green, deleting the ENTIRE permissive config left the suite green** — the standing
  turbine trip covers the first half-second and the rods are seated before the later checks
  run, so the one window where that config binds was never asserted. HR10, exactly as
  written. `run_e2e_controls` 39 → 59, `board_check` 138 → 143, manual **Rev 20** (03 §3.5.1).

- **The pressurizer could not go water-solid on injection, and that hid a full accumulator
  dump on every cooldown (2026-07-30, #249 → #273).** `level_per_mass_surplus` was an
  underived 300, so `mass_max` clipped inventory before the gauge ran out of scale: HPI into an
  intact RCS pinned indicated level at **exactly 88.00 %** (`level_prog_floor` 28 + 300 × the
  clipped 0.20) and left it there — the plant could not perform the TMI trap it is built around.
  Now **fitted to real geometry** *(OWNER RULING, 2026-07-30: "249 - fit it.")*: the pressurizer
  steam space is **5.8 %** of RCS volume (BVPS-2 UFSAR 5.1-1/5.4-12 + WTSM 3.2 Table 3.2-2), so
  45 points of level ÷ 0.058 = **776**. Three things to know. **`cvcs_charge_per_level` was NOT
  scaled with it** — my own first recommendation, and wrong: the documented 83 s loop τ is the
  *deficit* branch, so scaling the shared gain would have slowed leak make-up to 215 s to fix a
  surplus-side number. **The fit made an existing check real rather than breaking it**: with the
  level able to reach its 97 % trip, `pwr_mode3_to_mode5`'s long-green "arrived UNscrammed"
  assertion immediately fired — the by-the-book cooldown had been walking past the accumulators'
  **600 psi (4.14 MPa)** cover gas with the discharge valve open and emptying all four (measured
  endpoint `accum_vol 0.0 %`, boron **2310 ppm** against a 2500 ppm charge). Isolation now
  happens at **1000 psig (6.89 MPa)**, sourced to NUREG-1431 LCO 3.5.1 and LTOP SR 3.4.12.3.
  And **the failure mode itself is now gated** — `run_reachability` (55 checks), because an
  assertion that a trip never fired is worth exactly what the gauge can reach. **`04` and `05`
  now carry the isolation step at 1000 psi (6.895 MPa)** (manual set Rev 18) — and `05` Phase A
  the matching **re-align**, because the Mode 5 IC ships with the tanks isolated and nothing in
  the manual set had ever opened them — and re-alignment **stays procedural**, no automatic open
  signal *(OWNER RULING, 2026-07-30: "lets leave opening of the accumulators to the procedure
  instead of auto opening them.")*, which is why `04` PWR-N03 gained step 4 (#276, closed).
  **The interlock question was settled AGAINST an
  autoclose**: every automatic signal a real plant puts on that valve is an **open** signal and
  the hazard guarded is spurious *closure* (EPR FSAR §7.6.1.2.2; NUREG-1431 Bases B 3.5.1
  SR 3.5.1.5), and the discharge gate `aligned && p < 4.14 MPa` means any pressure-keyed
  autoclose would suppress accumulator injection in every modelled LOCA. What shipped instead
  is **`accum_aligned` (06 PWR-A32)** — the first alarm gated on a **lineup** as well as a
  reading, via a generic `condition` field on the alarm schema. **Measured: the cue precedes
  the first discharge by only ~1 plant-minute** on a brisk cooldown, so the procedure step is
  the defence and the annunciator is the backstop; both compressed rates are now declared in
  `Manuals/12` §14.1.
- **The moderator coefficient was a constant, and it made the plant go critical COLD
  (2026-07-29l, #260).** `alpha_MTC` applied a flat −11.11 pcm/°F from 122 °F to 579 °F — a
  −4944 pcm moderator defect over a heatup, 494 ppm of dilution, a third of it charged below
  274 °F. Critical boron therefore fell 819 → 263 ppm across the heatup, and **600 ppm was
  critical at 274 °F**: the owner diluted toward it in free play and tripped on source-range
  high flux. Moderator reactivity now tracks **density**, rod worths went to the measured
  WTSM 2.2 values (**8500 → 4068** control, **10 000 → 3676** shutdown; 18 500 was 2.4× anything
  sourceable), and `rho_excess` is **solved** so HZP ARO critical boron lands on BEAVRS's
  measured **975 ppm**. **Then #263 re-did the moderator model AGAIN, and that is the version
  you are looking at** — do not trust a 1400 ppm crossover or a −20 pcm/°C at-power figure if
  you meet one in older prose. #260 took its boron crossover from a WTSM 2.1 statement its own
  figure contradicted; the BEAVRS Cycle 1 HZP tests publish **three measured isothermal
  coefficients** (975 ppm/−1.75, 902/−4.65, 810/−8.01 pcm/°F) which settle it at **986 ppm**
  and showed #260 was **4.3× too negative** at ARO. *(OWNER RULING, 2026-07-30: "for 263 item 1
  fit the measurement.")* — so **both** parameters are fitted to those points, residuals ≤0.09,
  and the at-power coefficient is now **−26.8 pcm/°C, SUPERSEDING the 2026-07-21 ruling of
  −20**. Three things to know: **at-power behaviour did NOT survive untouched** — a 34 %
  stronger coefficient put `run_pwr`'s rod-withdrawal power rise under its 0.05 floor, so that
  probe now pins **Tavg** rising, the signature that strengthens rather than weakens as the
  coefficient does; **600 ppm at 274 °F is +3158 pcm SUPERcritical and that is correct** —
  cold water is more reactive, and what changed is that critical boron is no longer a moving
  target you cross without noticing (806 → 587 rods-in, spread 556 → 219 ppm); and
  **`run_reactivity.js`'s first cut passed for the wrong reason** — it asserted the event with
  the reactivity sign inverted, went green, and would have enshrined a false claim in the guard
  for the thing being fixed, which is why every check written beside a fix is now proven to go
  **red by injection** before it counts as green. `pwr_startup` and `pwr_heatup` were re-authored
  (the latter's old dilution drove a runaway to **119 % power and 638 °F**). Still open: there
  is **no Estimated Critical Condition** anywhere, which is what would have stopped the event.
- **The sim ships as ONE emailable `.html` file now, and that is gated (2026-07-29k).**
  `node tools/make_portable.js` → `dist/Reactor_Dynamics_<version>.html`: the 94 scripts +
  2 stylesheets `ui/shell.html` loads, inlined in document order, 2.55 MB, runs by
  double-clicking with no server and no network. **Nothing in the sim had to change** — the
  no-module-system convention had already bought offline operation (plain `<script src>`
  loads over `file://`; an ES module is CORS-blocked), and there is no `fetch` anywhere, no
  web font and no image in the whole runtime. Measured: the bundle makes **1 network request
  (itself)** against 99 for the folder build, 0 page errors, and reaches a state identical to
  it across 60 sampled board values. Three things to know: **`test/run_portable.js` (112
  checks) is the only thing asserting "nothing loads at runtime"** — a `fetch()` added for a
  good reason leaves every other gate green and breaks the emailed file on a stranger's
  machine, so treat a red there as a real defect and not a tooling nuisance; its scan surface
  is **read out of `ui/shell.html`**, so a new `<script src>` is covered automatically and
  **shifts the baseline** on purpose; and a relative `url()` in the CSS is a bundle hazard
  even though it works on the site, because an inlined `<style>` resolves against the
  document's directory. **ZIP the file before emailing** — several mail providers strip
  `.html` attachments silently.

- **The plant can heat itself up now — the pump-heat netting is deleted (2026-07-29, #251).**
  The SG used to subtract RCP heat out of its own steam balance (`max(0, Q_sg − Q_pump)`,
  booked as "blowdown/ambient losses"), sized to cancel it identically at every flow because
  the turbine drew steam for core power alone. Consequence nobody had costed: **a heatup on
  pump heat was mathematically impossible** — measured, a stable attractor at 218.69 °F
  (103.72 °C) with ΔT pinned at `Q_pump/h_sg`, forever. Now the SG boils everything that
  crosses it and the follow governor draws it, both normalized on **NSSS rated heat** (core +
  pump), which is how a real plant rates its generators. Three things to know: the issue's
  "risky" step — recalibrating `steam_flow_rated` and giving the governor headroom — **was not
  needed**, because normalizing both sides makes rated come out exactly 1.0, so every gauge
  still reads 100 % at 100 %; the **cold IC was spawning synchronised to the grid**
  (`load_mode: 'follow'`, `generator_load = 1e-6`, rotor at rest — #235 fixed half of it), and
  with pump heat real the follow governor cracked to 6.2 % and re-stalled the heatup at
  306.05 °F, so Modes 3/5 now spawn off line on one `onLine` predicate; and **`pwr_mode5_to_mode3`
  was re-authored** — 10.71 plant-hours at 39.8 °F/hr with **no rod motion**, arriving hot and
  still subcritical, which is what Mode 3 actually is. The new gate was verified to **fail**
  with the netting restored. `pwr_heatup` (PWR-N03) is still the nuclear variant — deliberately
  not re-authored, filed as follow-up.

**Standing procedure — not part of the rotation above; these do not expire.**

- **The board is the V2 diagram, and `pwr_board_data.js` is GENERATED.** Edit in the Claude
  Design "PWR Reactor" builder, re-export to `inbox/Diagram V2.json`, run
  `node tools/gen_board_data.js`, then re-point ids in `pwr_board_wiring.js`. **The builder's
  live state lives in browser localStorage, not in the project files** — the `BUILTIN_DOC` in
  `Diagram Building Tools.dc.html` is only a stale fallback, so you cannot pull the current
  diagram over MCP. Ask the owner to export.
- **A re-export changes PIPE ids.** Pipe ids are regenerated whenever a run is re-drawn, so
  `PIPE_TEMP` silently orphans and pipes freeze at authored temps. `selfTest` now asserts
  every `PIPE_TEMP` key and every `CONTROL_LABEL_MAP` target still exists — if you add a map
  keyed by diagram ids, guard it the same way. A re-export can also silently undo **board
  geometry** fixes: `ui/test_panel/board_check.html` pins the pressurizer's plumb joints
  against the fittings above and below it (#231), pipe **animation play-state vs plant
  state** in three states (#236), and the #235 board defects, for the same reason. **Run
  board_check (headless Edge, `--dump-dom`; `document.title` says PASS/FAIL) after any
  board change** — it is not in `run_all`. Currently **143/143** (measured 2026-07-31 on `develop` after #75 — this line said 95/95 once, which was already stale when
  written down; the count moves whenever a pin is added, so re-measure rather than trusting
  it. History: 59 before the #235/#236 pins, +20 pipe-state/board-defect pins, +2 ROD AUTO,
  +3 from the #237 comment items, +11 for the generator FOLLOW/MAN/OFF selector (#230),
  **+7 power tile armed-trip bands (#267), +8 pressure tile (#270), +6 NIS thresholds
  (#271), +4 ITEM_CHANNEL / liveNote, +7 the SG FEED corner status (#214) and +5 the SCRAM button's RESET half (#75) — including a pin on the ORIGINAL defect, so restoring the empty handler reddens it**; the previously recorded "60/60" never
  matched the code either, #235 finding 6).
  **Read the tally from the harness's own summary line** (`ALL n CHECKS PASS` /
  `n FAILURES / n`) — scraping the page for the last `n/n` pair picks up unrelated
  numbers and reports a nonsense total.
- **Measure the board, don't eyeball it.** Mount it headless and read `RD.PwrBoard.ports()`:
  every port's scanned world coordinate is there, so an alignment claim is a subtraction, not
  a judgement. Two of #231's three filed leads were wrong and only this said so.

- **Verify a claim before you act on it.** Roughly half the issues touched on 2026-07-27 were
  stale or mis-framed — leaks already fixed, "reasons" that measurement disproved, premises
  copied between files. Read `Diagnostic/TUNING_LOG.md`'s top entry, then check the code.
- **Provenance matters more than it looks.** Many "owner rulings" in this repo were written by
  agents; all agent work commits under the owner's name, so git blame proves nothing. A ruling
  without a date and a verbatim owner quote is advisory — see `Blueprint/CONTEXT.md` §3.
- **`test/run_hr3.js` guards HR3** in the shared control kernel; **`test/run_hardrules.js` guards HR1, HR5 and HR11** (HR2, HR6 and half of HR4 are unguarded, and HR10/HR12 are not gateable at all — §3 says so in each case). `run_campaign` validates every
  scenario, not just campaign-wired ones.
- **A new `true_state` field must be documented in the same change (2026-07-28, #225).**
  `test/run_contract.js` diffs `Object.keys(getTrueState())` against the §6.3 block in
  `Blueprint/CONTEXT.md` and fails BOTH ways — an undocumented field and a documented
  phantom. Nothing compared the two before, so the gap reached 29 of 84 PWR fields. PWR
  only; the RBMK/BWR blocks are registered `skip` and were never audited.

**The full history lives in `Diagnostic/TUNING_LOG.md` (newest first)** — it is the
session-continuity record and a strict superset of what this section used to duplicate. This
section used to carry fifteen stacked historical entries, ~280 lines, every one of them a
second copy of a TUNING_LOG entry, in the first file every agent reads. Cut 2026-07-27
*(OWNER RULING, 2026-07-27: "Execute the cut.")*. **Keep it short: current state and pointers,
not a changelog.**


**Layers**
- **Physics engines complete** — PWR (M1) ✅, RBMK (M2) ✅, BWR (M3) ✅. All three
  have full balance-of-plant (turbine/condenser/generator + electrical output). The
  PWR models a **Cold Shutdown (Mode 5) initial condition** and the **full Mode 5 ↔
  Mode 1 heatup/cooldown on integrated physics** — see `CHANGELOG.md`.
- **Stack complete** — Control (M4) ✅, Simulation Service (M5, +rewind) ✅,
  Instructor (M6) ✅ (beat engine, Path-2 follow, TMI flagship, rewind, highlights,
  Hook + Training), Test Runner (M7) ✅.
- **UI (M8): functional alpha, PWR only** 🟦 — M8 and the M4 control UI are not yet
  extended to RBMK/BWR.

**Known open work** (details in `Diagnostic/` + `Manuals/ISSUES_AND_FINDINGS.md` +
`BUILD_DECISIONS.md` Open Flags)
- Chernobyl / Fukushima **flagship scenarios** and the campaign wrapper for RBMK/BWR.
- Extend the **M8 UI / M4 control surface to RBMK + BWR**.
- **Campaign ↔ Mode-5 alignment: done** — strings use *Mode N, Name*, and three
  missions (`pwr_mode5_to_mode3`, `pwr_mode3_to_mode5`, `pwr_return_to_mode1`) drive
  the full Mode 5 ↔ 1 loop on the board (`Manuals/CAMPAIGN_MODE_ALIGNMENT_SPEC.md`
  §2–3). `11_CAMPAIGN_CROSSWALK.md` verified current (Rev 1, 34 missions + bonus).
- **Mode-5 controls exposed in the UI**: RCP **Run/Stop** (`set_rcp`), **Pressure SP**
  and **Dump SP** setpoint boxes. Remaining polish: a `plant_mode` text indicator and
  an explicit `eccs_mode` readout (nice-to-have).
- **ECCS card UI layout** open (contract in `Blueprint/pwr_synoptic_prerequisites.md`).

**Current gate baselines — `node test/run_all.js` is now the authority.**

> Since 2026-07-25 the baselines live as **data** in the `BASELINES` map at the top of
> `test/run_all.js`, not as prose here. Run it; it compares all 34 runners against that
> map and exits non-zero on any drift. Prose baselines are what rotted (this section
> claimed `run_m5` **19/19** while its own status text said 18/19 — issue #161). **If
> you move a number, update `BASELINES` and this section together.**

```
node test/run_all.js            # all 34 runners (~6 min)
node test/run_all.js --fast     # skip the 2 Playwright gates (~2.5 min)
node test/run_all.js --only run_pwr,run_ops
node test/run_all.js --record   # print observed results as a BASELINES block
```

Drift is **symmetric** — a runner scoring *better* than baseline also fails, so a red
turning green has to be acknowledged (update the baseline, close the issue) instead of
being silently absorbed. Same convention as the strict xfails in `run_meltdown` /
`run_behavior`.

**CI runs the same command on every push and PR to `main`/`develop`**
(`.github/workflows/gates.yml`, ~8 min) — all 34 runners, browser gates included; it
installs playwright into `./node_modules` from a scratch prefix and asserts no manifest
appeared in the repo root. **Check it after you push** — `gh run list --workflow=gates.yml
--limit 3`. It ran `--fast` with no install from 2026-07-27, which worked until
`verify_flags_ui.js` arrived (#241, 2026-07-28 20:49 UTC): that gate needs playwright but
is not marked `slow: true`, so `--fast` runs it and it dies `MODULE_NOT_FOUND` in a
checkout where `node_modules/` is gitignored. Last green was **2026-07-28T19:52Z, one hour
before that commit**; the following **32 runs were red without exception**, including the
push to `main` for Alpha 1.10.0 and the #272 release PR. Nobody noticed for three days,
which is the argument for a required status check and against a badge (#191).

Green at baseline: PWR **32/32 (202 checks)**, BWR **15/15**, RBMK **23/23**, campaign **51/51 (3038 checks)**,
`run_m4` **26/26 (147 checks)**, `run_m5` **19/19**, `run_m6` **17/17 (102 checks)**, `run_m6ph` **8/8**, `run_autoctl` **21/21**,
`run_behavior` **38 pass / 0 xfail**, `run_meltdown` **9 pass / 0 xfail**,
`run_meltdown_stack` **3/3 (21/21 checks)**,
`run_procedures` **22/22 (102/102 checks)**,
`run_procedures_stack` **22/22 (178/178 checks, 2 strict xfails — both RBMK/BWR #208; the 7
`pwr_heatup` xfails cleared 2026-07-26c/d via #206 + #210, and FOUR more on 2026-07-29 that
were never plant defects at all — the harness was running 11 of its 22 procedures below the
10× it declares, so their steps got a tenth of their sim time (#245))**, `run_checklist` **24/24**, `run_scenarios`
**3/3**, `run_m7` **OK**, `run_flags` **16/16 (290 checks)**, `run_inspect` **7/7 (35 checks)**,
`run_contract` **84 checks / 0 failed**, `run_reactivity` **27 checks / 0 failed** (#260 — pins the SOURCED reactivity anchors; `rho_excess` is solved against BEAVRS's 975 ppm HZP ARO critical boron, so this is what reddens if a rod worth or `alpha_D` moves without a re-solve. 23 → 27 on 2026-07-30, #263 item 2: the four inputs `pwr_startup`'s 26-step creep is DERIVED from — startup-IC boron, critical position, differential bank worth, and the excess the creep leaves), `run_hr3` **29 checks / 0 failed**, `run_reachability` **58 checks / 0 failed** (NEW 2026-07-30, #249/#273 — **can the plant reach its own setpoints?** Part A is static and total: all 50 PWR trip/actuation/alarm thresholds must sit STRICTLY inside their instrument's declared range, since `crossed()` is strict. Part B DRIVES the plant and watches the indicated channel cross, which is the only half that can catch a clamp — `pzr_level`'s range is [0,100] and its trip is 97, so Part A was perfectly happy while the level physically could not exceed 88.00 %, and that is what let a full accumulator dump hide behind an "arrived UNscrammed" check for months. **Add a case here whenever you assert that a trip did NOT fire** — that claim is worth exactly what the gauge can reach), `run_hardrules` **39 checks / 0 failed (1 declared HR1 debt — RBMK, on hold)** (this line once said 28 while the gate was at 29. It counts dated owner quotes wherever they are tracked, so **writing a change up moves it, not just making the change** — re-run it AFTER the docs. 39 is MEASURED on the merged tree: `develop` took it 29 → 39 across #249/#273/#276 and `workbench` 29 → 32 (#249, three sites carrying `"249 - fit it."`) independently, so neither branch figure was right and a mechanical resolution would have shipped a drift), `run_release` **18 checks / 0 failed** (NEW 2026-07-31 — **release bookkeeping**: `site/release.js`, `changelog.html` and `CHANGELOG.md` must agree on what shipped. Written because the `CHANGELOG.md` roll — renaming `## [Unreleased]` to the version — was skipped for **Alpha 1.10.0 AND 1.11.0**, leaving 434 lines of two shipped releases filed as unreleased with the newest heading reading 1.9.0. **Nothing downstream reads that heading**, so nothing went red and nobody noticed; a CLAUDE.md note and a release-skill step already said to do it, and they are what failed. Verified against the real pre-fix file, not a synthetic one: 3 checks red. The count moves with the number of released versions — every `changelog.html` entry down to the oldest one `CHANGELOG.md` still names individually is cross-checked, so **a release adds a check**), `run_portable` **123 checks / 0 failed** (the offline single-file build — count moves with the shipped asset list; +7 on 2026-07-30 for the DOWNLOAD section, #275, which guards the *delivery* rather than the artifact: the site's download button is stamped with the release version by `site/nav.js`, and every way that wiring can break leaves a button that still works and still hands out `latest.zip`), `run_manual_units` **0 failed** (scored on failures only — the coverage count moves on ordinary prose edits, so it is deliberately NOT in the baseline), `run_manual_rev` **12 checks / 0 failed** (the manual set's revision history — table shape, set-wide stamp agreement, content-digest seal, pack currency; IS baselined, because unlike `run_manual_units` its checks are structural and do not move on prose. **A chapter edited with no revision row reddens it** — the failure it was written for, after six content changes went unrecorded), `verify_flags_ui` **42/42** (this line said 48/48 from the day it was written; `BASELINES`
always said 42 and the gate has always scored 42),
`verify_e2e_ui` **PASS (16 screenshots)**, `verify_manual_follow` **PASS (84 checks)**.

Also green: `run_e2e_controls` **59/59** (both F12 reds were stale expectations, fixed
2026-07-25, #150; 35 → 39 on 2026-07-29 when the CVCS droop check was rebuilt to measure
at equilibrium instead of half a time constant into the transient — #194; **39 → 59 on
2026-07-31, #75**, the RPS reset from the board. Worth knowing for the next person writing
checks here: the first cut of those 20 was 18 checks, all green, and deleting the ENTIRE
`rps_reset_permissive` config still left the suite green — the standing turbine trip covers
the first half-second after a scram and the rods are seated before the later checks run, so
the ~1–3 s window where that config is the only thing binding was never asserted. Injection
found it; reading the tests did not).

**One tracked red**, carrying a `note` in `BASELINES`: `run_ops` **57/68** — probes are
tuning targets by design. **Measured 2026-07-27b from `Diagnostic/ops_results.json`:
PWR is 21/21 with ZERO fails; all 11 reds are 7 RBMK + 4 BWR**, and the deliberately-red
C2 accel-latency probe (#153) is one of the RBMK seven (*ABUSE [post] time-acceleration*),
not a separate twelfth item. This paragraph previously named **P4** among the open
targets — a P-prefixed probe is PWR, and P4 has passed since 2026-07-22. That error was
then copied verbatim into `run_all.js`'s `note`, so it drifted in two places (#161(b));
both are corrected together. (**P7 resolved 2026-07-22**, CVCS letdown/charging enter the
mass balance through `cvcs_inventory_gain`, see `Diagnostic/OPS_TUNING_REPORT.md` update
2026-07-22b.)

`verify_e2e_ui` also carries **1 strict xfail** pinning the manual's missing unit
conversion (#111) — it errors if the manual ever starts converting.

---

## Running it

No build step. Either open `index.html` (the landing page — the PWR card opens the
control room at `ui/shell.html?engine=pwr`), open `ui/shell.html` directly, or serve
the folder with any static server (`npx serve .` or `python3 -m http.server`).

The control-room UI is `ui/shell.html` (loads engines + layers, wired through
`ui/app.js`). Standalone engine test pages: `test_pwr.html`, `test_rbmk.html`,
`test_bwr.html`.

**Offline / portable:** it already runs from `file://` with no server — nothing loads
anything at runtime. `node tools/make_portable.js` collapses the control room into one
self-contained `dist/Reactor_Dynamics_<version>.html` (~2.5 MB) you can email or carry on a
stick; `tools/make_portable.cmd` is the double-clickable wrapper (builds + zips, and exists
because double-clicking the `.js` gets Windows Script Host, not Node — `800A03EA`).
`test/run_portable.js` is what keeps that possible; read its header before adding any
runtime load. **A batch file must stay pure ASCII** — cmd reads it in the OEM code page, and
one UTF-8 em dash inside an `if (…)` block ends the block early and runs the prose as
commands.

## Running the tests

Plain Node CLI runners (no framework, no `package.json`). Engine/layer files are
global-namespace scripts that attach to `globalThis.RD`; `require()` executes them
into a shared global.

```
node test/run_all.js            # THE AGGREGATE GATE — all 34 runners vs recorded baselines
node test/run_all.js --fast     #   …skipping the 2 slow Playwright gates
node test/run_pwr.js            # PWR scenario suite (all)
node test/run_pwr.js <name>     # one scenario by key, e.g. flagship_tmi
node test/run_rbmk.js           # RBMK suite
node test/run_bwr.js            # BWR suite
node test/run_scenarios.js      # all flagship + library scenarios
node test/run_campaign.js       # PWR training campaign gate (structural + functional)
node test/run_autoctl.js        # control-layer automation gate
node test/run_ops.js            # engine-under-M4 ops probes (FAILs = tuning targets)
node test/run_m4.js … run_m7.js # per-layer stack tests
node test/run_contract.js       # §6.3 true_state contract vs getTrueState() (static; both directions)
node test/run_e2e_controls.js   # service-level control plumbing
node test/run_procedures.js     # manual procedures replay (strict known-fails annotated)
node test/run_meltdown.js       # PWR core-damage / meltdown paths (strict xfail; 8/8 green)
node test/run_meltdown.js MD-5  # one path by id
node test/run_procedures_stack.js          # the SAME procedures through M4+M5+M6 (see below)
node test/run_procedures_stack.js pwr_startup   # one by id
node test/run_procedures_stack.js --lineup=bare # the noDefaults/campaign lineup
node test/measure_stack.js --for=12h --every=1h --watch=tavg_c,pressure_mpa
                                # TAKE A NUMBER from a long FULL-STACK evolution (see below)
```

`test/ops_*.js`, `test/*_harness.js`, and `test/verify_*.js` are supporting
harnesses. Ops-probe FAILs are tuning targets, tracked in
`Diagnostic/OPS_TUNING_REPORT.md`. `run_e2e_controls.js` and `run_procedures.js`
are PART OF THE GATE LIST — both drifted red unnoticed once because they weren't
listed (2026-07-19 review). **`run_all.js` discovers `test/run_*.js` and
`test/verify_*.js` automatically and fails on any runner it has no baseline for**, so
a new gate cannot go unlisted again — add it to `BASELINES` when you add the runner.

### Know which LAYER a gate runs at (this has bitten us three times)

A runner that holds a `ControlFailureLayer` still is **not** full-stack.
`ControlLayer.stepAutomation()` and `engageDefaults()` have **exactly one production
caller each — both in `layers/simulation_service.js`** (:176, :152), as does
`engine.getStartupLineup()` (:156-159). So anything that stops below M5 runs with **the
automation-channel runtime never ticking and no channel ever engaged**, and without the
free-play lineup. Since `feed_sg` (the three-element feed controller that *replaces coupled
feed as the level backbone*), `cvcs_makeup` and `boron_conc` are all `defaultOn`, such a
harness is testing a plant the player never gets.

| layer | runners |
|---|---|
| **engine-direct** | `run_pwr`, `run_rbmk`, `run_bwr`, `run_meltdown`, `run_procedures` |
| **engine + M4** (looks full-stack, isn't) | `run_ops`, `run_behavior`, `run_m4` |
| **full stack** (M4+M5+M6) | `run_procedures_stack`, `run_m5`, `run_m6`/`run_m6ph` (integration halves), `run_m7`, `run_autoctl`, `run_campaign`, `run_checklist`, `run_scenarios`, `run_e2e_controls` |
| **browser** | `verify_e2e_ui`, `verify_manual_follow` (the latter never plays the sim — control-surface reachability only) |
| **static** (source/doc/registry consistency — the plant is never stepped) | `run_hr3`, `run_hardrules`, `run_contract` (resets the engine to read its field list, never runs it), `run_inspect`, `run_flags` |

Engine-direct is the right choice for isolated-physics acceptance; the mistake is *relying*
on it for anything the control layer decides. **When you write a procedure, scenario, or
behaviour assertion, ask which layer owns the effect you are asserting.** Known open
consequences: **#209** (`run_behavior`/`run_ops` certify on a lineup that never ships),
**#206**/**#208** (procedures green engine-direct, broken under the stack).

**To take an ad-hoc number, use `node test/measure_stack.js`** — full stack, any IC/duration/
scheduled commands, US-first units, and it stamps the LAYER into its own output so a
wrong-layer figure is visible in the artifact (#266). **Never drive a measurement with
`svc.start()`**: it arms `setTimeout(broadcastMs)` and advances in WALL time — measured, 5.0 s
of wall bought 48.0 s of sim at 10×, which is why #266 believed a long full-stack ride was
impossible and published two engine-direct numbers instead (one 13× wrong). Driving `tick()`
directly, 12 plant-hours is **~35 s** and cost is linear in sim duration; per cycle it is
**87.9 % `engine.step`**, so there is no per-cycle overhead worth optimising.

## Definition of done

A change is not finished until the gates it touches are green (at or above the
baselines in _Project status_). Runners print `PASS`/`FAIL` per test and a tally.

- **Any engine or scenario change** → the affected `run_<plant>.js` and `run_scenarios.js`.
- **Control-layer change** → `run_autoctl.js` **and** `run_m4.js`; check `run_ops.js`
  for regressions (don't turn a `PASS` into a `FAIL`).
- **Scenario / campaign / instructor change** → `run_campaign.js` (must stay
  **51/51**), `run_m6.js`, `run_procedures.js`.
- **UI change** → `run` the app and drive the affected flow (see `/run` and the
  headless Edge workflow); `verify_e2e_ui.js` must stay **PASS**.
- **Snapshot/contract or save-format change** → old saves must still migrate (see the
  migration-note pattern in `CHANGELOG.md`); re-run `run_m7.js`. **A new/renamed/removed
  `true_state` field also needs its §6.3 line in `Blueprint/CONTEXT.md`** — `run_contract.js`
  fails until it has one, and fails again if a documented field disappears (#225).
- **Any `Manuals/*.md` content change** → three steps, in order, or `run_manual_rev.js`
  reddens: (1) add a row at the **top** of the table in `Manuals/00_REVISION_HISTORY.md`
  (newest first — the set revision is **set-wide**, one number for all 13 documents);
  (2) `node tools/stamp_manual_revision.js` to propagate it and re-seal the content
  digests; (3) `node tools/pack_manuals.js` so the in-app copy carries it. The digest is
  the point: **editing a chapter without recording it is a red gate**, which is how six
  changes (#247, #248, #251, #260 ×2, the gpm scale fix, #263) came to be missing from
  the history while ten chapters still read `Revision: 0`.
- **Then update** `CHANGELOG.md`, the `Project status` section above, and
  `Blueprint/BUILD_DECISIONS.md` if a decision or flag changed.
- **On release (merge `develop` → `main`)** → add the player-facing `changelog.html`
  entry with the next **`Alpha X.Y.Z`** version (see below), bump `site/release.js`, **and
  rename `CHANGELOG.md`'s `## [Unreleased]` to `## [Alpha X.Y.Z] — YYYY-MM-DD`** with a fresh
  empty one above it. `run_release.js` fails until all three agree — **run it before the
  merge**, because after it you have a red gate on `main`. That last step was skipped for
  1.10.0 and again for 1.11.0, which is why it is gated rather than merely written down.

---

## Issue tracking (GitHub) — the owner's preferred workflow

**Open items belong in GitHub issues**, not only in `Diagnostic/` prose. When you find a defect,
a gap, or a deferred decision that outlives the session, file it.

Repo: **`TH462/Reactor-Dynamics`**. The `gh` CLI is installed **per-user** (the MSI needs admin
and fails with 1603 from a non-elevated session, so it was installed from the portable zip):

```
C:\Users\Tim H\AppData\Local\Programs\gh\bin\gh.exe     # on the user PATH
"/c/Users/Tim H/AppData/Local/Programs/gh/bin/gh.exe"   # Git Bash form (quote it — space in the path)
```

If `gh: command not found` in a shell that predates the PATH edit, prepend it:
`export PATH="$PATH:/c/Users/Tim H/AppData/Local/Programs/gh/bin"`.

Auth is already done (`gh auth status` → logged in as `TH462`). **`gh auth login` is
interactive — you cannot run it**; ask the owner to run it with the `!` prefix if the token
ever expires.

```
gh issue list   --repo TH462/Reactor-Dynamics --limit 30
gh issue view   <n> --repo TH462/Reactor-Dynamics
gh issue create --repo TH462/Reactor-Dynamics --title "…" --body-file <path> --label …
gh issue edit   <n> --repo TH462/Reactor-Dynamics --body-file <path>
gh issue close  <n> --repo TH462/Reactor-Dynamics --comment "…"
```

- **ALWAYS add the `Claude` label to every issue you touch** (`--label Claude` on create,
  `gh issue edit <n> --add-label Claude` otherwise). It means **"Claude worked on this"** —
  not just authorship — so apply it when you create an issue, comment on one, or do the work
  it tracks. It exists so the owner can see agent involvement at a glance.
- **Draft long bodies to a file and use `--body-file`** — `inbox/` is gitignored, so drafts
  don't pollute the repo. Inline `--body` mangles multi-line markdown.
- **Labels — four required axes** (scheme revised 2026-07-25; the canonical definition is
  **GitHub issue #61**, which is self-contained — the `PROJECT_WORKFLOW.md` it used to cite
  never existed). Every issue gets one of each:
  - `priority-critical` · `priority-high` · `priority-medium` · `priority-low` — by
    **consequence**, not effort.
  - `type-bug` · `type-tuning` · `type-feature` · `type-enhancement` · `type-test-gap` ·
    `type-docs` · `type-cleanup` · `type-decision` · `type-process`. `type-bug` = the model is
    *wrong*; `type-tuning` = structurally right, the number reads badly.
  - `system-physics` · `system-control` · `system-service` · `system-instructor` ·
    `system-hmi` · `system-scenarios` · `system-test` · `system-docs` · `system-web`
  - `plant-pwr` · `plant-rbmk` · `plant-bwr` · `plant-shared`

  Then `status-*` only when it applies: `status-on-hold` (RBMK/BWR — pair with the plant
  label), `status-needs-ruling`, `status-deliberate` (**known and intentional — do not "fix"**,
  e.g. the deliberately-red C2 probe, the B3 known-fail), `status-verified` (claim re-checked
  against current source, not inherited from a stale doc).

  **`status-deliberate` must name who decided it, and when** *(added 2026-07-27)*. The label
  turns any past call into standing law, so a comment on the issue has to say either
  `OWNER RULING (YYYY-MM-DD): "<their words>"` or "<agent>'s call, owner-approved
  YYYY-MM-DD" — otherwise it is one agent's preference wearing the project's authority.
  An unattributed `status-deliberate` is advisory: weigh it and say you did.

  Retired — do not apply to new issues: `assign-*` (use GitHub assignees), `type-refactor`
  (→`type-cleanup`), `type-design` (→`type-decision`), `system-api`/`system-state`
  (→`system-service`), `ui`/`ui-ux` (→`system-hmi`), the GitHub defaults `bug`/`enhancement`/
  `documentation`, and the legacy `phase-*`/`chief`/`grok-build`/`technical`/`decision`/
  `workflow` tags. They are left in place on old issues, not deleted.
- **Cross-link related issues by number** (`#122`) once both exist.
- Keep the durable engineering record in `Diagnostic/TUNING_LOG.md` **and** file the issue —
  the log is the narrative, the issue is the tracked unit of work.

## Branching & workflow

**Commit ongoing work to `develop`, not `main`.** `develop` is the active
integration branch; `main` is stable/release. Do not commit straight to `main`.

- **New work** → branch from / commit on `develop`.
- **Releasing** → merge `develop` → `main` and push both, only when gates are green.
  **Immediately before the merge, add the website changelog entry + version number.**
- Keep `develop` current with `main` (fast-forward) before starting new work.

> **The repo IS public and `main` IS protected — releasing is a PR** (2026-07-30, #196).
> A branch ruleset requires a pull request before merging to `main`, blocks force-push and
> deletion, and allows only the merge method, so `git push origin main` is **rejected** and
> the direct merge above no longer works. Approvals are set to **0** deliberately — GitHub
> forbids approving your own PR, so any higher number would block every merge on a
> solo-maintained repo. Use:
>
> ```
> gh pr create --base main --head develop --title "Release Alpha X.Y.Z — <headline>" --body-file <path>
> gh pr merge --merge          # --merge, NOT --squash: squashing flattens the release history
> git checkout develop && git merge --ff-only main && git push origin develop
> git push origin --tags       # tags are pushed separately; the PR does not carry them
> ```
>
> Everything else is unchanged — gates green first, changelog entry and version bump
> **before** opening the PR, annotated tag on the merge commit. Check whether the ruleset
> is actually on (`gh api repos/TH462/Reactor-Dynamics/rulesets`) rather than assuming:
> until #196 step 3 lands, the direct merge is still correct.

### Website changelog & version numbers

The public site has a **player-facing** changelog at **`changelog.html`** — separate
from the developer `CHANGELOG.md`. **Every release gets a version number and a
`changelog.html` entry — required, not optional; do it as part of the merge.**

- **When** — immediately *before* merging `develop` → `main`. One entry per release.
- **Version** — `Alpha X.Y.Z` = **Platform . Feature . Refinement**. Read the top entry
  and bump the highest-significance digit in the release: **X** platform milestone (new
  reactor type, engine overhaul, alpha→beta — rare); **Y** a new player-facing feature
  (resets Z to 0); **Z** bug fixes / tuning / small refinements. **Do not trust a version
  written here** — read the top entry of `changelog.html` and `site/release.js`, which must
  always agree with each other. (This line said `1.6.1` while the site was on `1.8.2`.)
- **The entry** — add a new `<article class="log-entry">` at the TOP (newest-first):
  the **version** (`<span class="log-ver mono">Alpha X.Y.Z</span>`), the **date**
  (visible text *and* `datetime="YYYY-MM-DD"`), and a brief **player-facing** summary.
  **Style: concise and factual** — one line per change, lead with the change, no marketing
  or filler. Copy the template in the file's `ADDING AN ENTRY` comment.
- **Not** the same as the `RD_VERSION` deploy stamp (`site/version.js` — git SHA Vercel
  stamps at build time).

---

## Code conventions (how the code is wired)

Read this before editing any source file — the wiring is deliberate and easy to break.

- **No module system. Do not add `import` / `export` / `require` to source files.**
  Every file in `engines/`, `layers/`, `scenarios/`, and `ui/` is a plain
  global-namespace script that attaches to `globalThis.RD`. In the browser they load
  via `<script>` tags in order; the Node test runners call `require()` only to
  *execute* each file into the shared global. ES-module/CommonJS syntax inside a source
  file breaks both load paths.
- **Load order matters.** `pwr_config.js` / control modules load before the engine
  files that consume them (see the ordered list in any `test/run_*.js` and `ui/shell.html`).
- **File naming.** Plant-specific files are prefixed `pwr_` / `rbmk_` / `bwr_`.
- **Hard Rules are non-negotiable.** Before changing engine behaviour or the data
  contract, read the **Hard Rules** in `Blueprint/CONTEXT.md` §3 — **ten rules, and the
  list is meant to stay short.** Reorganized 2026-07-29: architecture (HR1–HR6) is split
  from practice (HR9, HR10, HR11, HR12); each rule now names its **guard**; the *how* — worked
  cases, failure modes, procedure — moved to **`Blueprint/SOP.md`**, which is advisory,
  not binding. HR7 (failure taxonomy → §11) and HR8 (params-in-code → §8) were retired
  from §3 as a convention and a scope boundary; their numbers are not reused, because
  ~580 citations point at these numbers.
  The five you will actually trip over: **HR1** instruments-vs-truth · **HR5** commands
  only flow down through the service · **HR9** the plant is the ground truth, content
  follows the plant · **HR10** a passing test is not evidence the mechanism is right ·
  **HR12** an assertion about plant dynamics must be MEASURED — step the plant and quote
  the number *(OWNER RULING, 2026-07-29: "if you make assertions about plant dynamics, you
  must back it up by testing them.")*. **HR11** (a ruling needs a date + the owner's
  verbatim words, or it is advisory) was extracted from inside HR9 — it is cited constantly
  and was unfindable.
- **Snapshot / save compatibility is a contract.** New snapshot fields must migrate
  older saves — follow the migration-note pattern in `CHANGELOG.md`.

### Authoritative vs. scratch

Source of truth: `engines/`, `layers/`, `scenarios/`, `ui/`, `test/`, `tools/` (code)
and `Blueprint/`, `Manuals/`, `CHANGELOG.md` (docs). **Not** source of truth — don't
mine these for intent: `terminals/` (raw session logs), `inbox/` (handoff drafts),
`mcps/`, `node_modules/`, and the `Diagnostic/*.json` dumps (the `.md` reports are
curated). **Local-only (kept out of the public GitHub repo):** `terminals/`, `mcps/`,
`inbox/`, `Diagnostic/*.json`, `GO_PUBLIC_CHECKLIST.md`. (**Not** `CLAUDE.md` — it is tracked
and goes public with the repo, as line 6 says.) The curated
`Diagnostic/*.md` reports ARE published.

---

## The specification (`Blueprint/`)

**To build a module, read `CONTEXT.md` plus that one module's spec — nothing else.**

- `CONTEXT.md` — shared interfaces, hard rules, data contract, scope, build map.
- `DESIGN_COMPANION.md` — vision, rationale, deliberate exclusions, v2 roadmap.
- `M1`–`M8` module files — full implementation spec for each buildable unit.
- `M4b_control_layer.md`, `M5_*`, `M6*` — expanded control/service/instructor specs.
- `BUILD_DECISIONS.md` — running log of what was decided and why during the build.
- Feature specs: `pwr_synoptic_prerequisites.md`, `pwr_training_campaign.md`,
  `load_mode_spec.md`, `new_diagram_controls.md`, `OPERATOR_MANUAL_PLAN.md`.

**Build order:** M1→M2→M3 (engines, each tuned until its scenario suite passes) → M4
→ M5 → M6·PH (placeholder instructor) → M7 (validate wiring) → M8 (UI) → M6 (real
instructor + flagship scenarios).

---

## Domain conventions

- **Instruments vs truth.** Gauges, alarms, and automatic protection read *instrumented*
  values (lag, noise, possible failure). True state is available only as an explicit
  diagnostic overlay. Never soften the gap — the dissonance is the lesson.
- **Two registers.** Every label/instructional string exists in a **Learning** register
  (plain language) and an **Industry** register (real plant terminology).
- **Units.** SI internally (MPa, °C, %). The UI has a display-unit toggle (scoped OFF for the PWR board, which is US). **US customary FIRST with SI in parentheses — `2235 psi (15.41 MPa)`, `565 °F (296 °C)` — in the `Manuals/` set AND in everything you hand the owner**: chat replies, issue bodies and comments, commit messages, `Diagnostic/` entries *(OWNER DIRECTIVE, 2026-07-29: "also add a gh issue to add to claude.md to always give me imperial numbers not SI.")*. Temperature DIFFERENCES and RATES (subcooling margin, leg ΔT, DNB margin, deadbands, heatup/cooldown rates) convert ×9/5 with NO offset — this is the one that gets written wrong: 41 °C of subcooling is 73.8 °F, not 105.8, and 21.8 °C/hr is 39.2 °F/hr. `test/run_manual_units.js` enforces it across the manual and the board-facing copy (`ui/manual_procedures.js`, `ui/diagram/board/pwr_board_inspect.js`); **agent prose is not gateable**, like HR10 and HR12 — a green run does not cover it. Engine internals stay SI and do not move: command payloads, config constants, `true_state`.
- **Plant MODES** use commercial numbering, written **Mode N, Name** (e.g. *Mode 1, At
  Power*). Do not confuse with turbine load modes (Follow / Manual / Disconnected).
- **This is an educational lumped-parameter plant,** not a full-scope replica of a
  licensed reactor. Where a simplification understates reality, say so plainly.

---

## Licensing (for public release)

Dual-licensed, © 2026 Timothy Holt: **code → AGPL-3.0** (`LICENSE`), **manuals &
training prose → CC BY 4.0** (`LICENSE-CONTENT`). Public terms/disclaimer at
`legal.html`. When the repo goes public, fill the AGPL §13 source-repo URL in
`legal.html` §5 and `README.md` (placeholders are in place). See the
`licensing-and-go-public-prep` memory for the full checklist.
