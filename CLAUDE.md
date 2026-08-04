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
>   gh issue list --repo TH462/Reactor-Dynamics --label status-wip-develop --label status-wip-workbench --label status-wip-backshop
>   ```
>   **The last line is the only one that is not a guess** *(OWNER DIRECTIVE, 2026-08-04:
>   "Since that's done add an in process tag that shows which worktree it's being worked
>   on.")*. The three `status-wip-<lane>` labels are an agent SAYING which tree it is in, so
>   they name the issue as well as the lane — where the file sweep can only see that *someone*
>   wrote *something*. **Tag your issue when you start and clear it when you stop**, or the
>   next agent stands down for a session that ended hours ago. Full rule under *Issue tracking*.
>   It does not replace the sweep: an agent can work without touching an issue, so run both.
>
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
> - **NEVER MERGE INTO `develop` UNLESS THE OWNER SAYS SO** *(OWNER DIRECTIVE, 2026-07-31:
>   "We need a rule to never merge unless I say so. Develop was being worked")*. Commit on
>   your lane, gate it, say it is ready — and **stop there**. The merge is the owner's call,
>   every time, not a step you finish the task with.
>
>   **This exists because an agent talked itself into it.** On 2026-07-31 I correctly held a
>   merge when `develop` had 24 uncommitted files, then merged twenty minutes later on my own
>   reasoning that "my merge does not touch their file". That reasoning is not wrong so much
>   as **not mine to apply**: it moves a shared branch under someone who is mid-change, and
>   the only person who knows whether that is survivable is the owner. A clean `git status`
>   is NOT permission either — the other session may simply be between commits.
>
>   Applies to `git merge`, fast-forwards, and anything that moves `develop`. Pushing a lane
>   is already forbidden below, so "committed on the lane, gated, waiting" is the correct
>   end state for a finished task.
>
> - **The lanes are LOCAL. Never `git push origin workbench` / `backshop`** *(OWNER DIRECTIVE,
>   2026-07-31: "I don't want the workbench or backshop trees pushed to gh. Gh should only have
>   main and develop.")*. Commit on the lane, merge to `develop`, push `develop`. The repo is
>   PUBLIC, so a pushed lane puts work-in-progress on display, and the machine is backed up
>   off-site so the remote buys no safety. This is written down because an agent pushed both
>   lanes on 2026-07-31 to get CI on them — which also created a **Vercel preview site per
>   push**, which is how the owner found out. `vercel.json` now refuses to build those branch
>   names, and `gates.yml` no longer lists them.
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
> - **`Manuals/` IS ON THIS LIST TOO, and it is the DANGEROUS one** *(added 2026-08-03,
>   after it happened)*. The four files above conflict LOUDLY — they are append-at-top logs,
>   so git stops and makes you choose. A manual chapter is edited in the MIDDLE by both
>   lanes, so a merge can resolve it in one lane's favour and **say nothing**. Measured: the
>   2026-08-03 backshop merge silently dropped an entire `Manuals/12` §5.5 section — the
>   documentation of a physics change whose ENGINE half merged fine. The manual then said
>   the clad node "heats at the local decay-heat rate" and "No hydrogen generation" while
>   the engine did neither.
>   **Nothing catches this.** `run_manual_rev` checks the revision TABLE, the set-wide stamp
>   and the content digests — and the digests were re-sealed by the merge, so they agreed
>   with the surviving text. The revision-history row still claimed the change, which is
>   worse than silence: **the record said it was documented and it was not.**
>   **After any merge that touches `Manuals/`, grep the chapter for the thing you wrote.**
>   One `grep -c` per claim is the whole check.

> **Four questions decide whether a feature or change goes in — `Blueprint/DESIGN_CRITERIA.md`
> is BINDING** *(OWNER DIRECTIVE, 2026-08-02: "I think there are a few important criteria on
> weather we should include a feature or make a change. 1. Is it prototypical? What is the
> educational value? Is the increased complexity worth it? What are the actual tested numbers or
> behaviors of our plant?" — clarified: "I meant the complexity to the user. Are the extra
> controls going to increase educational value or will they confuse the player? We should codify
> this decision making process.")*. In order, because three are unanswerable until the first is done:
>
> 1. **What are the tested numbers?** A GATE, not a vote — no measurement, no decision (HR12).
> 2. **Is it prototypical?** The real question is *can I cite it* — recall is not evidence.
>    Unsourceable ≠ no; mark it UNVERIFIED and take it to 3.
> 3. **What is the educational value?** The only legitimate reason to depart from 2, and only as
>    a **declared** departure (`DESIGN_COMPANION.md` §8). Operational test: **can the player reach
>    it on the board, and does something visible change when they do?**
> 4. **Does it complicate things FOR THE PLAYER?** *User* complexity, not code. It is a **VETO** —
>    it can only ever say no. Tests: orphan control, observability, duplicate authority, register.
>
> The doc also carries §5, the per-plant artifacts each question needs to be answerable at all —
> the prerequisite list for automating the RBMK/BWR builds *(OWNER, 2026-08-02: "My goal is to
> eventually automate the building of the BWR and RBMK plants.")*. Those plants stay ON HOLD.
>
> **Q2's yardstick is `Blueprint/CURRICULUM.md`** — the per-plant educational goals (dynamics,
> procedures, casualties, flagship scenarios). It was DESIGN_CRITERIA §6 until 2026-08-03, split
> out because it is PWR-only and grows with every plant while the criteria are binding and
> plant-agnostic. **Do not merge it back**: one file with two statuses is how a proposal gets
> cited as law — and that file now genuinely carries two, so **check the per-tier status table
> before citing it.**
>
> **All four tiers are RULED and BINDING for the PWR** — A and B *(OWNER RULING, 2026-08-03:
> "Tier A looks good, make it so. Tier b looks good, also make it so.")*, C *(OWNER RULING,
> 2026-08-03: "Do as you recommend.")*. **Tier B carries a known gap**: its eight evolutions are
> exactly the eight that already have a checklist, while the manual documents **15** — the list
> was derived from what is built, so a second pass is owed. **Tier C** — it has two bands. **CORE** (11 casualties) means the player is expected to
> handle it: it owes a response procedure, a board cue **and a runnable checklist**. **COVERED**
> means documented, injectable, live in free play — and owing **no mission**. A casualty is Core
> iff it demonstrates a **Tier A coupling under stress**. Promoting one out of Covered needs a Q0
> measurement first. Tiers A and B remain PROPOSAL.

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
| **Decide whether a feature or change goes in** | **`Blueprint/DESIGN_CRITERIA.md`** — the four questions (binding; summarized in the block above). §5 is the per-plant artifact list they need to be answerable, i.e. the automation prerequisites. |
| **Argue a feature's EDUCATIONAL value (Q2)** | **`Blueprint/CURRICULUM.md`** — what each plant is meant to teach, in four tiers. PWR only. **All four tiers RULED 2026-08-03 and binding for the PWR.** A = 9 couplings; B = 8 evolutions (**list is a subset — a second pass is owed**); C = Core/Covered, Core owes a mission and Covered does not; D = adopt existing. |
| **Apply a Hard Rule to a real decision** | `Blueprint/CONTEXT.md` §3 for the rule (binding, 10 rules, each names its guard), then **`Blueprint/SOP.md`** §1–4 for the worked cases and technique (advisory). |
| **Put a decision to the owner** | `Blueprint/SOP.md` §5 — always bring your recommendation; see the block above. |
| **Find a document that was deleted** | `Blueprint/RETIRED.md` — what was removed, why, and the command to read it again. |
| **Build or modify a module** | `Blueprint/CONTEXT.md` **plus that one module's spec** (`Blueprint/M1`–`M8`) — and nothing else. |
| **Know what changed recently** | `CHANGELOG.md` (skimmable) → `Blueprint/BUILD_DECISIONS.md` (dense engineering rationale, tuning, gate tallies). |
| **Operate the plant / look up a control, setpoint, or procedure** | `Manuals/` — start at `Manuals/README.md` (commercial-format PWR operator manuals). |
| **Pick up the active tuning / bug-fixing effort** | `Diagnostic/TUNING_LOG.md` — the session-continuity record: current status, the tuning toolbox (knobs + tests + workflow), a dated worklog, and the full backlog of known & suspected issues. **Read this first when continuing tuning work.** |
| **See current known issues, tuning gaps, playtest findings** | `Diagnostic/` (`TUNING_LOG.md`, `SPEC_AUDIT_*.md`, `OPS_TUNING_REPORT.md`, `PLAYTEST_REPORT.md`) and `Manuals/ISSUES_AND_FINDINGS.md`. |
| **Tune plant behavior (the physics "knobs")** | Each plant's **`[tune]`-annotated constants** in `engines/<plant>/<plant>_config.js` (PWR 89, RBMK 27, BWR 37 — the file header explains the convention: `[tune]` values are starting points arbitrated by the scenario suite; un-marked values are fixed). Protection/alarm/failure setpoints are data too, in `layers/control/<plant>_control.js`. Validate with `test/run_ops.js` and `test/run_behavior.js`; open tuning targets are tracked in `Diagnostic/OPS_TUNING_REPORT.md`, and the live worklog + toolbox is `Diagnostic/TUNING_LOG.md`. **BEFORE you move a constant, run `node tools/perturb_sweep.js`** — it nudges `[tune]` values by 2–3 % and reports which checks flip, so "what will this break?" is answered ahead of the retune instead of by a mystery red after it (#321). |
| **Run the simulator** | Open `index.html` (landing page — Operate the PWR from there), or `ui/shell.html` directly — see below. |
| **Run the tests** | `node test/run_<suite>.js` — see below. |

---

## Project status

> **Keep this section current.** When you finish work that changes what is built,
> working, or broken, update the status line and gate baselines below in the same
> change. The dense, append-only version lives in `Blueprint/BUILD_DECISIONS.md`
> (Status line + Open Flags table) — update both.

_Last updated: **2026-08-04**._

**Where the PWR is.** All PWR engine, behaviour, ops and stack gates green; `run_all` is
**37 runners at baseline**. Open backlog is dominated by RBMK/BWR operability (on hold) plus
a handful of UI/doc items.

**Recent themes** — **max 5 bullets, newest first; adding one means deleting the oldest.**
They are a reading aid, not a record: the full history is `Diagnostic/TUNING_LOG.md`, and
anything here that is standing procedure rather than news belongs in the list below it.

> **Evicting a bullet: RESCUE THE TRAP FIRST.** Before you delete the oldest, ask what in it
> would still burn someone a month from now — a stale number that is still quoted in older
> prose, a wrong premise that got copied, a gotcha with no other home. Move that to the
> standing list below as **one line**, then drop the rest. The cap is there so the list stays
> readable, not so knowledge expires with the news: on 2026-07-31 the #260/#263 bullet was
> rotated out intact and took its "do not trust a 1400 ppm crossover" warning with it, which
> is the failure this paragraph exists to stop.

- **A loss of offsite power was TERMINAL, and the doc declaring that departure rated it "slightly
  more severe" (2026-08-04, #325).** *(OWNER RULING, 2026-08-04: "Go with one B")*. With the RCPs
  stopped there was **no core→SG heat path at all** — measured, damage at **30 min**, melt at **45**,
  and starting AFW moved melt to 50 and changed nothing else. Six things to know. **The OPTIONS BRIEF
  was the thing most needing measurement**: #325 costed this as "the largest change, a real physics
  addition", but `natural_circ_flow` **already existed** as the coastdown target at `0.0`, and flipping
  it to a constant 0.03 made a LOOP survivable with **nine runners unmoved** — so nothing in the suite
  asserted the terminal behaviour, the #315/#329 shape a third time. **The cheap version was BUILT,
  MEASURED and REFUSED**: a constant floor circulates through a **fully voided loop** (void fraction
  **1.00** reading 3.00 % flow, Tavg dragged to 245 °F while the clad melted at 3827 °F). Outcomes stayed
  right in every case tested because uncovery dominates — which is exactly why it would have shipped.
  **The law is SOLVED, not iterated, and that is correctness not style**: W = C·√ΔT closed against the
  core rise ΔT = `delta_T_rated`·Q/W gives **W ∝ Q^⅓**, and the fixed-point form would read a ΔT that
  `flow_floor` CLAMPS below 10 % flow — the exact band circulation lives in. Getting the cube root out of
  two independently-motivated relations is the internal check; measured **1.343 vs 1.342**. **Sourced
  SHAPE, fitted SCALE, declared separately**: WTSM 3.2.6.3 (ML11223A213) gives the driving head and
  *"sufficient only for decay heat removal … not for power operation"* but **no magnitude**, and the
  *"2–5 %"* in old §8.6 and `Manuals/01` was **uncited inherited prose** — this repo's own text failing
  its own "inherited claims are the risky ones" rule. §8.6 is RETIRED; `Manuals/12` §12.4 replaces it
  naming the *magnitude* as the departure. **`flow_floor` HAD to move, 0.1 → 0.015**: the leg split
  under-read **2.4×** under circulation (34.5 °F where the balance says 81.9), and loop ΔT is the cue a
  real crew verifies circulation with — #315's lesson recurring in the regime this change creates. And
  **TR-7b leg D was pinning the ABSENCE**: it asserted "flow is at or below the modelling floor", true
  only because losing the pumps drove flow to zero. Re-authored to divide by `max(flow, floor)` like its
  own legs A/A2 — **passes on the OLD plant too** — with the natural-circulation band as a separate,
  genuinely new check. `run_behavior` **47 → 48** (TR-15, six injections, distinct signature each;
  **leg E's 90-minute ride is load-bearing** — trimmed to 60 to save gate time and it went red at
  660 °F still climbing, because circulation distributes heat while it has somewhere to put it).
  `run_contract` **144 → 145**. Manual set **Rev 26**.
- **The plant had NO CONCEPT OF AC POWER, so everything with a motor ran through a blackout
  (2026-08-03, #332).** #329 fixed the heaters; this is the general case, and `station_blackout`
  turned out to be a bare boolean that four call sites *happened* to consult. Five things to know.
  **Measured** full stack, Mode 3, SBO at 60 s: letdown pinned at **0.0297 for three hours**,
  charging modulating as if the grid were up, inventory **100 → 76.55 %** — and, not in the issue,
  the **de-energized ECCS pump filled the RCS to 120 % (solid) in five minutes** when the operator
  pressed SI. After: **99.99 %**, zero flow, zero discharge head. **The fix is a NAME**:
  `true_state.ac_available`, derived once in `pwr_engine` step 0a, which carries the roster of what
  dies and what lives. It is *exactly* `!station_blackout` and the comment says so — the defect was
  never a wrong formula, it was that the question had no name, so each new load was written without
  anyone asking. **The EVIDENCE PASS changed the shape of the fix, twice.** WTSM 4.1.3.1
  (ML11223A214) interlock 2 — *"If the running charging pump(s) is lost, then the letdown orifice
  isolation valves close"* — so letdown is gated on the **PUMP, not the blackout**, and that one
  guard caught a **second defect nobody had filed**: grid fully up, secure the charging pump, and
  letdown drained **100 → 79.5 % in 13 minutes**. Injecting the plausible `ac_available` gate there
  reddens leg C *and nothing else in the suite*. WTSM 5.7.5 (ML11223A229) supplies the survivors —
  *"All decay heat removal systems, except the turbine-driven AFW pump, also fail"* — which is why
  **AFW carries a DO-NOT-GATE note** and CA-8 asserts survivors *positively*: a suite of only
  everything-went-to-zero checks is satisfied by killing the whole plant on the flag. **Two probe
  traps worth more than the probe.** `h.range()` spans the WHOLE run including the settle before
  the injection, so both CVCS checks first failed against their own **pre-event fixture** (0.0300).
  And **the charging mass-balance guard was UNOBSERVABLE at a green 47/47** — reverting it changed
  nothing, because in AUTO the law targets `letdown + level_demand`, letdown was already zero on
  the interlock, and an SBO *repressurizes* so the servo asks for nothing. It needed a latched
  manual demand **and** an inventory assertion in the OTHER direction (a dead pump that still moves
  water pushes level UP, and every other check here watches it fall). **Left alone on purpose**:
  RHR (its guard would be **unreachable**, so unfalsifiable), and the condensate pump / main feed,
  which are **nonvital** and lost on a plain LOOP too — they want a second, non-1E bus, which is
  #325's territory. `run_behavior` **46 → 47**, `run_contract` **143 → 144**.
- **The board got a Physics tab, and building it found that `power_pct` is NOT core thermal
  power (2026-08-03).** *(OWNER DIRECTIVE, 2026-08-03: "Add a tab to the tools block called
  Physics. This will show the most important, under the hood physics numbers. Group and order
  them logically.")* A fifth tab in the Tools block — **Operate · Inject Failure · Graph ·
  Physics · Settings** — carrying **true plant state**, 24 rows in five groups along the energy
  path. Four things to know. **Row selection was MEASURED**: candidates were
  filtered against the board's own reads (`IN()`/`TS()` in `pwr_board_wiring.js`, 46 instrument
  keys + 3 true_state keys), leaving what has **no instrument at all or none wired to a readout**
  — fuel/clad temperature, decay heat, xenon, both void fractions, RCS inventory, the loop
  pressure split, suction subcooling, cavitation, leak flow, cycle efficiency. **`power_pct` is
  FISSION power alone.** Total core heat is `_Q_total = _P·(1−f₀) + (H1+H2)`, f₀ = 0.07
  (`pwr_engine.js:363`) — **equal by construction at steady power**, which is why nothing ever
  caught it, since every gate reads power near equilibrium. Measured seconds into a 20 %-of-rated
  cold-leg LOCA: **fission 11.0 MWt against decay heat 21.0 MWt**, a core apparently making less
  heat than its own decay tail. Published as **`true_state.core_heat_pct`** (31.2 MWt in that
  sample) rather than re-derived in the UI, `run_contract` **140 → 141**. **Anything reading
  `power_pct` as core thermal power is wrong from the moment the rods drop.** **#238's
  quantisation trap landed again, in a new place**: `toFixed(0)` on MPa printed 2235/2279/2199 psi
  as **"15 MPa" three times**, collapsing the ~80 psi (0.55 MPa) loop split that is the entire
  point of that group — decimals belong to the UNIT, and a rendered number that is not the number
  is only visible in a DUMP, never in a look (the same dump caught a critical reactor printing
  **"-0 pcm"**). And **my own colour rule cautioned at hot full power** before it was measured:
  `stepCladding` floors the hot node at the fuel temperature on a covered core, so clad == fuel
  (693 °C / 1280 °F at HFP) and both sit far above the legs — the state worth marking is clad
  separating from FUEL (#213 uncovery), not clad above coolant.
- **The two missing Westinghouse reactor trips are built — and measuring the plant redrew the
  issue that asked for them (2026-08-03, #311).** OTΔT/OPΔT ruled in as a pair *(OWNER RULING,
  2026-08-02: "311: a.")*, reduced form, no ΔI term. **Shipped DEFAULT OFF**, and both reasons
  matter. Four things to know. **The evidence pass COULD NOT RUN** — every outbound host is
  refused by that environment's egress policy (nrc.gov, its mirrors, archive.org; WebFetch 403s
  on all of them), so ML11223A301 is unread and the equation form, the τ lead-lag constants and
  the two margin intercepts are **unsourced**. Search summaries existed and were not used: the
  SOP names another agent's summary as not-evidence. **The pair is NOT symmetric, measured.**
  Across 13 casualties and 8 normal evolutions, full stack, **no casualty on this plant reaches
  DNB while un-scrammed** — the three that reach DNB get there by DEPRESSURIZING and have
  already scrammed on low pressure (LOCA 6.0 s vs 6.5 s; PORV 12.5 s vs 18.0 s) — so #311's
  "can be walked into a DNB-limited condition with every gauge in band" does **not** reproduce
  here. OTΔT is prototypicality; **OPΔT is the one with bite**: a 30 % steam line break holds
  **114.2 % power for 30 minutes with no reactor trip**, because power-range high sits at 120 %.
  **The limit line must be SCALED, never re-anchored** — the first cut took this plant's
  closed-form DNB slope (ΔT_DNB = 2·(T_sat(P) − dnb_margin_c − Tavg), which falls straight out
  of `pwr_thermal.hFcEffective`) and paired it with a fitted intercept, which ROTATES the line:
  a full load rejection lifts Tavg ~29 °F (16 °C), dropping the line 120 % → 23 % against a ΔT
  of ~46 %, and **the plant scrammed at 55.0 s** — the ride-out the 40 % dump exists to teach.
  Scaling by a margin factor instead puts the equivalent gradients **inside** the published real
  bands (K₂ 0.0202 /°F, K₃ 0.00134 /psi) where the unscaled ones were 1.5–2× steeper than any
  real value — **that steepness was the tell and it was visible before the measurement**.
  And **the runback half is deliberately NOT built**: an actuation fires once, so a ramped load
  reduction is a new actuation class, not a setpoint. `run_otdt` NEW at **39**, injection-verified
  four ways; everything else unmoved, which is what the flag is for.
- **The pressurizer had TWO slopes, and one of them melted the core in silence (2026-08-04, #330).**
  Switch the `cvcs_makeup` channel off at full power — one `defaultOn` button on the board — and the
  core **melted at 22.1 min, un-scrammed**, with pressure, Tavg and subcooling **dead flat at nominal**
  and the clad at 24,958 °F (13,848 °C). Five things to know. **The filed diagnosis was right about the
  symptom and wrong about the defect.** #330 isolated a real *circular void gate* (void needs subcooling
  ≤ 0 → pressure is pinned by the subcooled branch → the branch is chosen by the void); fixing THAT
  made the 12 % pzr lo-lo scram **unreachable** (`run_reachability` B2 red, trough 54.34 %) because the
  void term lifts indicated level before level can fall — trading one unreachable protection path for
  another, which is #330's own defect class — and reddened MD-11. Reverted. **The root cause is one
  constant**: `level_per_mass` **100** against `level_per_mass_surplus` **776**, two contradictory
  statements about one pressurizer. The surplus comment already said why it is steep — the steam space
  is *"the only compressible volume"* — and **that argument is direction-agnostic**; the shallow slope
  is what let the loop shed 37.5 % of its mass while the gauge read 17.5 %. **The protective actuation
  was NEVER broken, only the inventory it fired at**: the low-level letdown isolation fires at 20 %
  indicated on both plants — at **65 % inventory before** (core already uncovered, hence *"the
  protective actuation is what destroys the core"*) and **95.1 % after**, where it isolates at ~2m30s
  and the plant sits covered and undamaged to 40 min with **no scram needed**. So *"did it fire?"*
  passes on both plants and proves nothing; CA-9 leg C asserts the **inventory** at which it fired.
  **`level_per_void` is the other half of a matched pair** — the TMI deception is the DIFFERENCE
  (`void_gain·level_per_void − level_per_mass`), so leaving it at 150 inverted it, +350 → **−326 %/frac**,
  and level FELL as the primary voided; re-solved from its two documented targets to **375.33** (net
  +350; 78.3 % at the story-clock void, still past the 75 % alarm), and deliberately NOT scaled
  proportionally, which pegs the gauge at 100 % and destroys the graded arc. And **one red is left
  standing on purpose**: `ops_cvcs_pzr_drain_rate` reads 53.7 s against a `>= 300 s` owner feel target
  whose number is a direct product of the constant that was wrong. Re-banding a feel target whenever
  the plant moves retires it, so it is an **open owner decision** with both options measured.

**Standing procedure — not part of the rotation above; these do not expire.**

- **Two fixes that EACH heal the defect make a one-sided injection lie** (rescued from the #295 F1/F2
  bullet on eviction, 2026-08-04). That change had two halves — the permissive gate on `setTripBlock`
  and the auto-reinstate correction — and either alone healed the defect, so injecting one at a time
  left the LOCA probe **green** and the guard looked unnecessary. **Revert BOTH to reproduce.** Ask of
  any multi-part fix whether the parts are redundant before concluding from a green injection that a
  part is not load-bearing. Also from that change and still live: **there is no sourced P-11 citation
  anywhere in this repo** — the "enabled only below ~1970 psig" basis came from an audit that flags its
  own NUREG refs as part recall, so treat it as UNVERIFIED if you build on it.

- **A de-energization written into the operator's DEMAND heals itself on the next button press**
  (rescued from the #329 bullet on eviction, 2026-08-04; the rule is #200's). When a casualty takes
  a system away, do not express it by writing the operator's setpoint — `heater_override = 0`,
  `charging_pump_running = false`, `hpi_active = false`. Every one of those is a field some
  `set_*` command writes directly, so the very next press of HEATER AUTO or the % box wipes the
  casualty, exactly as the stuck-open spray used to heal itself in #200. Take away the **delivered**
  power/flow/head and leave the selector and the latched demand where the operator put them: the
  board then reads an honest zero, restoring the system needs no re-selection, and the run lights
  stay truthful about what was *asked for* versus what *happened* (the `afw_pump_running` vs
  `afw_flow_normalized` split is the house idiom). #329 and #332 are both built this way.

- **A term that is an IDENTITY in the regime you test in is a term nothing tests** (rescued from
  the #315 bullet on eviction, 2026-08-03). The hot/cold leg split ran on fission power where it
  needed total core heat, and **44 green probes agreed with it**, because fission and total heat
  are equal by construction in steady state and every probe here measures at or near equilibrium.
  A scrammed core rejecting 6.61 % of rated computed a **0.0 °F** leg ΔT. Ask of any formula
  whether two of its inputs coincide in the regime your gates live in — if they do, that term is
  unasserted no matter how many runners are green. The #329 heaters and the #332 CVCS are the same
  shape from the other side: a load only *demanded* in a regime no gate visits.

- **The live checklist NEVER issues `cmd`** (rescued from the #310 bullet on eviction,
  2026-08-03). `ui/app.js renderChecklist` draws text + highlights and the instructor grades off
  `acc`, watching for the player's own command — so `cmd`/`hold`/`ramp` on a procedure step are
  **replay-side only** and cost the UI and the browser gate nothing. The #310 estimate that said
  otherwise was wrong. Corollary from the same change: **only a rate guard can tell a ramp from a
  staircase** — flatten a four-leg ramp into single steps and the replay still scores 27/28,
  because a staircase arrives everywhere the procedure says it will.
- **"Block SI" is THREE actions on a cooldown, and the procedure named one** (rescued from the
  #310 bullet, 2026-08-03). HPI/LPI OFF disarms the ESF arm and stops the pumps, but **two**
  `PWR_TRIPS` entries watch `primary_pressure` downward — `lo_press` (12.41 MPa) and **`si_trip`**
  (PI-3, 12.4 MPa) — and neither auto-blocks on the way DOWN. Measured, the plant scrams ~5
  plant-minutes into the first leg with *either* left armed. Both blocks need P-11, so the
  Pressure SP has to come down first.

- **The board's FLOW family is the one where US is the base unit** (rescued from the #238 bullet
  on eviction, 2026-08-03). `UNIT_FAMILIES` in `pwr_board_wiring.js` converts SI → US for every
  family except flow, where the authored **gpm** figures are display flavour over normalized
  internals (`Manuals/12` §646) — so gpm is the identity side and **m³/h** *(OWNER RULING,
  2026-08-01: selected "m³/h" from three options put to him — m³/h, L/min, kg/s; a selection,
  not verbatim words)* is the converted one, backwards from everything else in the table. Two more from that change that
  outlive it: the units key is an **accessor** (`ctx.units()`), because a value freezes the board
  in whichever mode it mounted in; and **US is unchanged by construction** — the US unit STRING
  comes from the authored item and never from the table, which is what preserves the board's
  spelling quirks (`F`, `GPM`, `psig`) across a round trip.

- **A peer-reviewed paper restating someone else's equations is STILL NOT the primary — and
  check the other lanes before you go sourcing at all** (2026-08-03, #315 §6). nrc.gov 403s from
  some sandboxes and not others. With it blocked, an open-access restatement of the Westinghouse
  OTΔT equations was used instead; it is specific, quotable, and shows a lead-lag on the MEASURED
  ΔT that the Westinghouse primary does not have — it describes a different design lineage. A
  whole argument, three source files and an issue comment were built on it before ML11223A301 was
  read, and all of it had to be reverted. **The primary was already in the tree**: another lane
  had fetched it that morning and said so in `TUNING_LOG`, with the extract in its local
  `inbox/sources/`. **Read the other lanes' log entries before starting an evidence pass** — the
  SOP's "another agent's summary is not evidence" cuts both ways: their SOURCES are still sources.

- **A check that asserts an ABSENCE can be pinning a NON-EVENT** (rescued from the steam-dump
  bullet on eviction, 2026-08-03). At the old 105 % dump capacity, `run_behavior` TR-1 asserted
  *"no PORV lift"* through a total loss of load — and passed, because with that much dump the
  transient never happened at all; the check was green for the wrong reason for months. Its PORV
  check is written **positively** now, so restoring the capacity has to edit the line rather than
  slide through a band. Ask of any *"X did not happen"* assertion whether X was ever REACHABLE
  (`run_reachability` exists for the instrument half of this).

- **Neutering an automation channel: blank the ENGAGE direction ONLY** (rescued from the #286
  bullet on eviction, 2026-08-03). Blanking a `mode` channel's disengage as well leaves the
  plant in whatever AUTO the IC shipped with — the rig's own t=0 stand-down is what puts it in
  manual — so `run_autoctl`'s `steam_dump` and `pzr_pressure` probes **passed against a dead
  channel** until the injection was narrowed. The first injection LIED, in the exact direction
  that makes an untested thing look tested. Same shape wherever you prove coverage by breaking
  something that has an on and an off.

- **A gate that iterates a MAP tests the map, not the thing** (rescued from the #224 bullet on
  eviction, 2026-08-02). `verify_manual_follow.js` walks `STEP_UI` in `test/manual_ui_map.js`,
  **not** the procedure steps — so **that table is the gate's coverage list**, and a step missing
  from it is **UNVERIFIED**, not merely unmapped. Measured at the time: 17 of the 45 controlled
  PWR steps covered, `pwr_heatup` at **zero**, and the gate reporting a confident PASS over the
  slice that was left. **Add a controlled step, add its `STEP_UI` entry in the same change** —
  #310 did, which is why its two counts moved together. Same shape anywhere a gate is driven by
  a hand-maintained list rather than by the artifact.

- **A SENSING bug is invisible while the instrument is healthy** (rescued from the #220 bullet
  on eviction, 2026-08-02). `above_p9` read `true_state.power_pct` while gating three
  protection decisions; the fix moved NOTHING with a good channel — all 34 runners were green
  at baseline — so **to test an HR1 fix you have to FAIL the channel** (`run_behavior` TR-1f
  stalls the power range at 40 % with the core at 100 %). Two structural traps came with it and
  outlive the fix: a trip's **`condition:` key is a status word the ENGINE computes and hands
  over**, so `run_hardrules`' scan of `layers/control/` for `getTrueState()` cannot see it —
  hence **HR1(b)**, every permissive key declared `instrument`/`lineup`/`latch`/`hold` and the
  instrument-derived ones checked against the engine line defining them. And **a comment
  carrying the REAL plant's premise rots when this plant departs from it**: #220 found two,
  including a P-9 header reciting a dump capacity that no longer justified anything. Three
  declared departures remain at `Manuals/12` **§8.18–§8.20** (the 1.5 DPM withdrawal block, the
  AFW 20 %/17 % offset, status-level P-9 sensing); §8.17 was retired when the dump went to 40 %.

- **The two Hot Standby starting points are DIFFERENT PLANTS for a startup (#303, 2026-08-01).**
  `cold_shutdown` ships **856.8 ppm** and the pump-heat heatup dilutes nothing, so it arrives at
  Mode 3 still at 857; `hot_zero_power` ships **682.9 ppm**. Boron is what sets the critical rod
  position: measured, **~561 steps** at 857 against **319** at 683 — 242 steps and ~1830 pcm apart,
  and 683/319 is what the manual, the ECC worksheet and the 1/M burst sizes are all written for.
  **No gate can see this**, because `pwr_heatup` runs `from: 'cold_shutdown'` and `pwr_startup`
  runs `from: 'hot_zero_power'` — the IC is reloaded between them and nothing crosses the seam.
  If you author, measure or assert anything about a startup, say which boron you are on.
  Corollary: **`boron_ppm` ending at 2500 is the fingerprint of an unintended ECCS injection**
  (the RWST concentration) — that is how the missing SI-block step in the cooldown was found.

- **Protection cadence is written down TWICE, and only one copy is the plant's** (rescued
  from the #153 bullet on eviction, 2026-08-01). The service evaluates protection on a
  **sim-time** cadence, `PROTECTION_DT` 0.1 s — it used to be once per broadcast, so
  `timeAcceleration` set how well the reactor was protected and at the shipped 3600× nothing
  fired at all. The trap that outlives the fix: **`test/ops_harness.js` carries its own
  `evalEvery`**, an independent copy of that cadence, so moving one and not the other leaves
  the ops suites certifying a plant no player can produce. 1× is byte-identical by
  construction (a 1× broadcast IS `PROTECTION_DT`), which is exactly why a divergence here
  stays invisible at the speed you are most likely to test at.
- **The moderator model was re-done TWICE, and older prose still quotes the dead numbers**
  (#260 then #263; rescued from the themes rotation 2026-07-31). If you meet a **1400 ppm
  boron crossover** or a **−20 pcm/°C** at-power moderator coefficient in any document, it is
  stale — both were superseded. The live values are fitted to the three measured BEAVRS
  Cycle 1 HZP isothermal coefficients: at-power **−26.8 pcm/°C**, HZP ARO critical boron
  **986 ppm**, control bank **4068** / shutdown **3676** pcm. `run_reactivity` is what pins
  them, and it reddens if a rod worth or `alpha_D` moves without a re-solve. Still open:
  there is **no Estimated Critical Condition** anywhere, which is what would have stopped the
  free-play event that started #260.
- **Traps rescued from bullets rotated out on 2026-07-31** (per the eviction rule above).
  **#137 rewind:** the free-play checkpoint cadence is **20 s of WALL clock**, not sim time, and
  `_now()` is a prototype seam **because a headless runner burns no wall time** — without it the
  cadence is invisible to every gate here, so do not simplify it away. **#284 turbine:** a
  synchronised machine **motors, it does not decelerate** — test the BREAKER (`RD.LoadMode.isOnLine`),
  never `generator_load > 0`, and that predicate deliberately EXCLUDES `turbine_tripped` because a
  trip and an open breaker are different events (#230). `mwe_output` reads the TURBINE, not the core.
  **#249 pressurizer:** `level_per_mass_surplus` is **776**, fitted to real geometry (pzr steam space
  = 5.8 % of RCS volume); `cvcs_charge_per_level` was deliberately **NOT** scaled with it — the
  documented 83 s loop τ is the *deficit* branch, so touching the shared gain to fix a surplus-side
  number slows leak make-up to 215 s.
- **The pzr level PROGRAM and the level PHYSICS are two different lines now (#289, 2026-08-01).**
  `levelBase()` is unbounded upward — coolant expands. `levelProgram()` is the same line
  **clamped** at `level_prog_floor` 28 and `level_prog_ceiling` **61.5**, and it is what the
  CVCS setpoint and `pzr_level_dev` read. **Every consumer of "the program" must call
  `levelProgram`, not `levelBase`** — `_levelDev` called `levelBase` and read **−38.5 %** with
  the controller exactly on setpoint, which pegs `PZR LVL DEV LO` for a whole load rejection.
  The ceiling exists because without it the program chased Tavg to ~94 % and scrammed the plant
  on the 97 % going-solid trip **with inventory correct**. Do NOT "simplify" it to
  `pzr_level_nominal` (55): measured, a ceiling sitting on the normal operating point rectifies
  Tavg noise and biases the setpoint low permanently (0.15 % of inventory, reddens
  `run_e2e_controls`' droop check). A program maximum is a limit, not part of the control law.
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
  state** in three states (#236), and the #235 board defects, for the same reason. **Run `node test/verify_board_check.js`
  after any board change** — and it is in `run_all` now (2026-08-04), so the score is DATA in
  `BASELINES`, not a number written here. **That is the fix for a specific, repeated failure:
  this line said "143/143" while the harness was at 1 FAILURE / 143, and later "188/188" while
  it was at 1 FAILURE / 188** — both times a pin was added without running the file, and both
  times nothing could contradict it, because board_check is an HTML page under `ui/` and
  `run_all`'s auto-discovery only globs `test/(run|verify)_*.js`. **Do not restore a count to
  this paragraph.** Read it from `BASELINES`, which drifts symmetrically and reddens for
  whoever adds the pin. The runner adds no checks of its own; every assertion still lives in
  the HTML harness, and it reads that harness's own summary line (`ALL n CHECKS PASS` /
  `n FAILURES / n`) rather than scraping the page for `n/n` pairs — a scrape picks up the
  geometry pins' own numbers and reports a nonsense total. An exception thrown mid-harness
  exits **2**, because a partial run would otherwise report a smaller-but-green tally.
  **Chromium, not Edge, and that is not a preference**: the documented local workflow drives
  this page with headless Edge, which does not exist on `ubuntu-latest`, so an Edge-based gate
  would be green on one machine and absent on the one that matters. And **read `#out`, never
  `body`** — `textContent` on body includes the text of every `<script>`, and this page's own
  source carries the string *"1 FAILURE/143"* in a comment; the develop lane's first cut of the
  gate matched that and reported a failing board while the harness was green. A page that
  documents its own history contains its own failure strings as prose.
  **What it cost to not have this**: the harness sat at **1 FAILURE / 188** for hours and went
  through a lane merge, a green `run_all`, a green CI run and **a release to `main`** without
  anything going amber, because nothing in `run_all` or `gates.yml` opened the page.
  **Four traps if you touch the HTML harness:** the TRIP BLOCKS check must restore the
  `ir_high` block BEFORE the plant is stepped — at full power the IR channel reads 2.0e-3
  against a 1.67e-3 setpoint, so the trip condition is STANDING and the block is all that
  holds it off; `rps.scrammed` **LATCHES**, so re-blocking cannot undo a scram once it fires;
  `reset_rps` is refused **RODS_NOT_INSERTED** until the rods seat (measured, still coasting
  at 95 % power a few ticks after the scram); and the dual-mode SCRAM/RESET button reads which
  half it is off the **RENDERED** snapshot, so re-render after a reset or the clicks land on
  the wrong half. Two more that are not board-specific and cost a run each: **`svc.tick()`
  no-ops unless `this.running`**, so a probe driving it directly measures a FROZEN plant and
  reports every lamp dark — use `advanceCycles(n)` or set `running` yourself; and writing
  `el.textContent` on a rendered board value **destroys the child nodes the renderer updates**,
  freezing that element at whatever you last wrote so every later sample lies — measure text
  on a `cloneNode(true)`.
  **Four board-editing traps that outlive any one pin.** A card TITLE is **not an item** — it
  renders as a `.bd-box-title` CHILD of the box, so an item-vs-item overlap scan cannot see it,
  which is how `bdDtMargin` came to print on top of the NIS title. An **rAnchor item's rendered
  right edge sits 41 px inside its authored `left`**, so arithmetic on authored coordinates is
  not enough — both elements still render, so only a ruler finds it. **`DOC_PATCHES.items` is
  an object literal**, so a second entry for the same id SILENTLY REPLACES the first; merge
  keys, never repeat them. And `Pump`/`Valve`/`Tee`/`Cross` are in `NUDGE_KINDS`, so their
  ports **quantise to the 5 px doc grid** — moving a pump 2 px moves its port 5, which is why
  a neighbouring tile is sometimes the one that has to move.
- **Measure the board, don't eyeball it.** Mount it headless and read `RD.PwrBoard.ports()`:
  every port's scanned world coordinate is there, so an alignment claim is a subtraction, not
  a judgement. Two of #231's three filed leads were wrong and only this said so.

- **Verify a claim before you act on it.** Roughly half the issues touched on 2026-07-27 were
  stale or mis-framed — leaks already fixed, "reasons" that measurement disproved, premises
  copied between files. Read `Diagnostic/TUNING_LOG.md`'s top entry, then check the code.
  **An issue's own investigation comment is a claim like any other, and this repo merges
  faster than one ages well** (#326, 2026-08-04). Both comments on that issue were correct
  when written and wrong hours later: the rebuttal *"there is no zirconium-oxidation term in
  this engine"* was true until #238 merged the day before, and the filed reproduction path
  stopped reproducing when #325 merged the same morning. Re-measure on the tree you are
  standing in before you implement someone else's diagnosis — including your own lane's.
- **A claim about COVERAGE is an unmeasured claim — prove it by injection** *(my call,
  2026-07-31; not an owner ruling)*. HR12 binds assertions about plant dynamics: step the
  plant, quote the number. The class that keeps going wrong is the neighbouring one it does
  **not** name — *"X is untested"*, *"the gate covers Y"*, *"nothing asserts Z"* — and those
  are just as measurable, with a tool the repo already uses. **To prove something is untested,
  break it and run the gate.** Neuter the channel, invert the comparison, delete the config,
  and see what reddens; if nothing does, it is untested as a *measurement* rather than as an
  opinion. That is how #286 found five inert automation channels behind a green 24/24 — and
  skipping it is how, the same day, I repeated this repo's own claim that the RHR 400 psi
  (2.76 MPa) interlock was untested when `run_pwr` covers it fully, and predicted its cooldown
  probe stopped at 10 MPa when it actually reaches **283 psi (1.95 MPa)**. One run caught both.
  **Inherited claims are the risky ones**: a sentence from a review, an issue body or this file
  has usually aged, and repeating it in your own voice launders it into a fresh assertion.
  Either say "the 2026-07-19 review says X, unverified", or go and measure.
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

> **`run_all` runs 10-WAY PARALLEL since 2026-08-04** — MEASURED 800 s → 203 s (3.9×) on 12
> cores, all 37 runners still at baseline, no check removed. The runners were ALREADY
> independent processes with fully-buffered output, so this was a scheduling change, not a
> test change. Three things to know. **`--jobs=1` restores the old sequential order exactly**
> — reach for it if a runner is ever suspected of not being isolated. **Per-runner times in
> the output are now CONTENTION times, not costs**: `run_pwr` reads 54 s where it takes 22 s
> alone, so never quote a number from a parallel run as a runner's cost. And **the gate is
> now contention-bound, not structure-bound** — the top three land at 203/185/176 s, so
> speeding up any ONE of them promotes the next and buys almost nothing; that is why
> `verify_manual_follow` going 196 → 158 s moved the wall clock by only 24 s. The `secs:`
> hints in `BASELINES` are a longest-first SCHEDULING nudge and cannot affect a score, a
> drift verdict or an exit code — do not maintain them like baselines.
>
> Since 2026-07-25 the baselines live as **data** in the `BASELINES` map at the top of
> `test/run_all.js`, not as prose here. Run it; it compares all 37 runners against that
> map and exits non-zero on any drift. Prose baselines are what rotted (this section
> claimed `run_m5` **19/19** while its own status text said 18/19 — issue #161). **If
> you move a number, update `BASELINES` and this section together.**

```
node test/run_all.js            # all 37 runners (~3.5 min, 10-way parallel)
node test/run_all.js --fast     # skip the 2 slow Playwright gates (~2.5 min)
node test/run_all.js --jobs=1   # SEQUENTIAL (~13 min) — the escape hatch if a runner
                                #   is ever suspected of not being isolated
node test/run_all.js --only run_pwr,run_ops
node test/run_all.js --record   # print observed results as a BASELINES block
```

Drift is **symmetric** — a runner scoring *better* than baseline also fails, so a red
turning green has to be acknowledged (update the baseline, close the issue) instead of
being silently absorbed. Same convention as the strict xfails in `run_meltdown` /
`run_behavior`.

**CI runs the same command on every push and PR to `main`/`develop`**
(`.github/workflows/gates.yml`, ~8 min) — all 37 runners, browser gates included; it
installs playwright into `./node_modules` from a scratch prefix and asserts no manifest
appeared in the repo root. **Check it after you push** — `gh run list --workflow=gates.yml
--limit 3`. It ran `--fast` with no install from 2026-07-27, which worked until
`verify_flags_ui.js` arrived (#241, 2026-07-28 20:49 UTC): that gate needs playwright but
is not marked `slow: true`, so `--fast` runs it and it dies `MODULE_NOT_FOUND` in a
checkout where `node_modules/` is gitignored. Last green was **2026-07-28T19:52Z, one hour
before that commit**; the following **32 runs were red without exception**, including the
push to `main` for Alpha 1.10.0 and the #272 release PR. Nobody noticed for three days,
which is the argument for a required status check and against a badge (#191).

Green at baseline: PWR **36/36 (241 checks)** (240 → 241 on 2026-08-03, #321 — *"drifting pressure diverges"* was measuring the DEPTH of the code-safety blowdown its own drift triggered, at 22 % margin, while the offset it names was **exactly 2.0000 MPa in every variant tried**. Split into that offset plus a POSITIVE assertion of the HR1 chain it was accidentally covering — protection acting on a reading the plant never had. **A check that compares a signal against its own EARLIER VALUE is measuring the plant's response, not the signal**; sweep for `now − then` on any channel protection also reads.) (237 → 240 on 2026-07-31, #288 — the RHR suction valve's block-open permissive and its autoclosure interlock were ONE constant, so the deadband was zero and the valve chattered across a single boundary; against #287's one-shot entry permissive the first chatter was permanent. The autoclose is its own **600 psi (4.14 MPa)** setpoint now, ~200 psi above the unchanged 400 psi block-open, both sourced to NUREG-0933 Issue 99. The third new check is the one easy to forget: an open must still be **REFUSED** inside the deadband, because the block-open setpoint did not move. **The measurement trap is worth more than the fix, and it is not the one I first wrote down** — `engine.reset()` takes an OBJECT (`{initial_state}`) and **silently ignores a string**, defaulting to `hot_full_power`. Three rigs here ran on a 300 °C plant while logging `cold_shutdown`, and published two wrong findings before it was caught: a close at **377 psi** (below the configured 400) and a "the plant overshot to 604 psi mid-step" explanation that was really just the wrong IC surging. **Assert the IC — log `s.pressure_mpa` right after `reset`** — nothing else in the rig will tell you. 32 → 36 on 2026-07-31, #154 item 11 — four engine surfaces asserted NOWHERE: the pressurizer **code safeties** (`s.safety_open` had zero references in the tree; only the SG safeties were ever asserted), **`porv_tailpipe_temp`** (the TMI/Davis-Besse tell the flagship teaches), the TMI-2 **blocked-AFW** device (only ever asserted FALSE) and the **unknown-command** path. `save_migration` went 8 → 20 of the 29 `_migrateState` defaults, including the `rcp_secured` INFERENCE (#240) — the one judgement call in the migration, unasserted both ways. Layer note: the code valves are a COMMANDED state in the engine and their pop/reseat SETPOINTS are an M4 actuation, so the threshold half lives in `run_m4`; measured, a real transient cannot reach them at all — the high-pressure reactor trip caps indicated pressure at **2460 psi (16.96 MPa)**, under the 2484 psi (17.13 MPa) pop, so only a failed instrument gets there — **and the "or an ATWS" this line used to carry was DISPROVED 2026-08-03**: measured three ways full stack, an ATWS peaks at 2321 psi (16.00 MPa) and never lifts them, because the moderator coefficient collapses power before pressure can run (#319 item 4)), BWR **15/15**, RBMK **23/23**, campaign **51/51 (3017 checks)** (3038 → 3017 on 2026-08-03, #314 — a DROP, and deliberate: the new RCP breaker-position reactor trip cuts `pwr_lof`'s decision window from ~36 s to ~1 s, so the mission lost its second branch and the 21 checks that asserted it. The replacements DISCRIMINATE where the old ones could not — trip reason `rcp_running is_false` (the old plant read `primary_pressure high`) and core void **< 0.01** where the old test required **> 0.02**. Injection-verified: restoring the pre-fix `crossed()` comparator reddens exactly those two),
`run_m4` **38/38 (243 checks)** (37/37 237 → 38/38 243 on 2026-08-03 — the alarm **DROPOUT DELAY**. An instrument parked ON its setpoint chattered at the evaluation cadence: measured full stack, `charging_high` did **2135 transitions in ten sim-minutes with a MEDIAN LIT TIME OF 0.06 s**, and an SGTR flashed **eight** alarms that way including `pzr_level_lolo`, a **CRITICAL** — 60 ms is below what anyone can read. **The owner asked for a minimum on-time and the literal form was NOT enough**: holding from when the alarm LIT traded a 3.6 Hz flicker for a 0.44 Hz one (193 on-cycles), because the hold expired, the alarm cleared on the first false sample and the noise re-lit it 0.2 s later. The timer measures **QUIET, not age** — it resets on every re-assert — so chatter never accumulates the dropout: 2135 → **17** transitions, lit 0.06 s → **4.26 s** median. **Two traps.** `evaluate(instruments, dt)`’s dt is OPTIONAL and this suite’s harness now passes it DELIBERATELY — a harness that omits it silently tests the OLD behaviour, the #153 wrong-cadence shape. And **`dt > 0` guards the whole hold**: with dt absent the accumulator can never grow, so the comparison is `0 < minOn` on every evaluation and a lit alarm is held **FOREVER** — the opposite of the documented degradation, across the ~40 harnesses that call `evaluate` with one argument. An EXISTING #306 check caught it. Injection-verified: `alarm_min_on_s: 0` reddens 4, and the discriminating check goes to 12 dropouts. **MEASURED on the MERGED tree — not develop's 35/210, not workbench's 36/221, and not the two added up.** Both lanes moved this line from the same 34/194 base on the same day. 34 → 36 on workbench, #306 item 4 — the ROD LIMIT LO approach annunciator and the kernel's published interlock state (`snapshot.interlocks`); **two authoring traps live in those probes**: `getAlarms()` returns EVERY configured alarm with a `state`, not only active ones, so `!!getAlarms().find(...)` is ALWAYS true and the first draft passed four checks that asserted nothing — read `.state`; and **driving the bank to its limit does not test the limit**, because insertion drops power, the power-dependent floor drops with it and the margin OPENS (measured: parking the bank 20 steps above the limit left a margin of 299) — drive the instrument. 34 → 35 on develop, #295 F1/F2 — **a reactor trip was defeatable at power, and two of this suite's own checks were pinning it.** `setTripBlock` accepted a manual block on any blockable trip whenever it was not *already asserted*, ignoring the permissive, and manual blocks were exempt from auto-reinstate. Measured: at 2235 psi (15.41 MPa) / 100 % power, `lo_press`, `si_trip` and `lo_flow` were all ACCEPTED, and a 20 %-of-max cold-leg LOCA rode **64 s of unscrammed blowdown** — scram at 68.1 s on `pzr_level high` at 130 psi (0.90 MPa), against a baseline **4.2 s** on `primary_pressure low` at 1782 psi (12.28 MPa). **The two fixes each heal F1 independently**, which is why injecting only one leaves the LOCA probe green: with auto-reinstate corrected, a block set outside its permissive is deleted on the next `evaluate` anyway. Revert BOTH to reproduce — 12 checks red. **The authored content was already right and the kernel was wrong**: the startup checklist says *"the plant will not let you block them down there"* and *"Both blocks auto-reinstate the moment power falls back below P-10"*, and the PWR-N15 cooldown lowers the Pressure SP inside P-11 *"which is what makes the next two steps possible"* — so the permissive gate cost the procedures nothing. **`run_behavior` PI-3's fixture WAS the defect** (it blocked `lo_press` from hot full power and labelled it "P-10 satisfied" — the wrong permissive; `lo_press` carries its own P-11). Re-authored to reach the block the way the cooldown does; it passes on the OLD kernel too, so it is a better test rather than a refit. 33 → 34 on 2026-08-01, #294 — **`COLD_MODES = [4, 5]` was tested at 5 only.** It gates six alarm behaviours; narrowing it to `[5]` left **six gates green** — `run_m4`/`run_pwr`/`run_ops`/`run_contract`/`run_reachability`/`run_hardrules` at 185/240/351/139/58/75 — so the Mode 4 half could have been deleted outright unnoticed. What it suppresses is not cosmetic: on a correctly depressurized cold plant the injected form raises a spurious **CRITICAL** (`pzr_pressure_lolo`) plus three spurious warnings, **and loses A33** — the one alarm carrying news — because its `condition` stops matching. **Three of the five deltas are priority-only**, on alarms that still appear either way, which is exactly what a presence check cannot see; assert the priority. Mode 4 is where a plant spends most of a cooldown from power and where the #287 sequence lands. The probe reaches it the way the plant really does — **lose the heat sink, heat on decay + pump heat** (Mode 4 at 1000 sim s, ~1 s wall) — rather than hand-setting a temperature, so the mechanism under test is the engine's. 5 checks red on the injected config. 28 → 32 on 2026-07-31, #154 item 6 — four kernel internals with no test at all: actuation **`reset_below`** (a comment recorded the shipped PORV-flapping inversion; nothing pinned the fix), numeric **`override_value`** interception (five PWR failures use it and the intercepted-command path was never once observed), interception **precedence** (first-injected wins — the probe distinguishes it from last-wins, so both halves invert under injection), and **`acknowledge_all_alarms`**, previously asserted only as "the instructor gate does not block it"), `run_m5` **23/23 (103 checks)** (79 → 83 on 2026-07-31, #137 — the free-play checkpoint cadence became REAL time. The load-bearing check piles up **360 sim-s with the wall clock frozen** and requires ZERO checkpoints; the pre-fix service lays **21** there. `_now()` is a prototype seam because a headless runner burns no wall time — without it this cadence is untestable), `run_m6` **18/18 (117 checks)** (#154 item 7 — chat-mode transcript mechanics: the story clock, the **time-skip divider** (first line of the beat only, or the UI repeats it down an ordinary exchange) and the **`CHAT_LOG_CAP`** ring, which matters because the snapshot passes the log BY REFERENCE every broadcast), `run_m6ph` **8/8**, `run_autoctl` **30/30** (24 → 30 on 2026-07-31, #286 — the suite engaged **seven channels at once** and asserted AGGREGATE plant state, so a dead channel hid behind its neighbours. Measured by neutering the kernel: `cvcs_makeup`, `boron_trim`, `grid_follow`, `boron_conc` and the ENGAGE half of `steam_dump` were each a complete no-op at a green 24/24, and **`boron_conc` is `defaultOn`** — inert in every free-play lineup. If you repeat that injection, neuter the **engage direction only**: the rig stands every channel down at t=0, so blanking the disengage too leaves the plant in the IC's own AUTO, and two probes then pass against a dead channel),
`run_behavior` **49 pass / 0 xfail** (48 → 49 on 2026-08-04, #330 — **CA-9**, loss of CVCS make-up. Five legs, 12 checks, and the pre-#330 `level_per_mass` of 100 reddens **6** of them: inventory 62.35 %, damaged AND melted, the slope asymmetry (**2.00 points down vs 15.52 up** on ±0.02 inventory — the defect in one line), the letdown isolation firing at 62.35 % instead of 95.06 %, and no scram on an unheld leak. **Leg C is the one that earned its keep**: the low-level isolation fires at 20 % indicated on BOTH plants, so *"did it fire?"* discriminates nothing — what moved is the INVENTORY it fired at, 65 % → 95.1 %, and that is what the check asserts. **Legs D and E's first check pass on the old plant deliberately** (false-positive guards: a stiffer level line could easily make a healthy plant twitch and nothing else here would notice). **TR-15 leg E's ride went 90 → 120 min in the same change and that is a FIX, not a concession**: A/B'd full stack, the old plant reads clad 2180 °F at 90 min and the new one 2068 °F, **both undamaged and both reaching damage at ~100 min** — it was a knife-edge timing pin that any change touching the inventory path would tip, and the widened window passes on both. 47 → 48 on 2026-08-04, #325 — **TR-15**, natural circulation. Five legs, 17 checks, **injection-verified six ways**: the pre-#325 plant reddens **9 checks** (damaged AND melted at 675 °F), a constant floor or a linear-in-Q law reddens the cube-root check (2.423 vs 1.342 for linear), removing the void gate reddens **leg C alone** (a fully voided loop circulating 4.178 %), reading `power_pct` instead of `_Q_total` reddens **8** and reproduces the terminal plant — #315's defect one function away — and restoring `flow_floor: 0.1` reddens TR-7b's band. **Leg E exists so this does not read as immunity** (circulation MOVES heat, it does not remove it) and **its 90-minute ride is load-bearing**: trimmed to 60 to save gate time and it went red at Tavg 660 °F still climbing. TR-15 costs **18 s**, not the 98 s the first draft cost — three of four long rides were trimmed after measuring which margins were real. 46 → 47 on 2026-08-03, #332 — **CA-8**, the AC-load ROSTER: CA-7's general case, after the plant turned out to have no concept of AC power at all. Five legs, 22 checks, **injection-verified six ways with a distinct signature each** — and three of those six are the reason it is a test rather than a transcript. Gating letdown on `ac_available` instead of the SOURCED charging-pump interlock (WTSM 4.1.3.1) reddens **leg C alone**, which is the grid-up defect: secure the charging pump with the plant fully powered and letdown drained **100 → 79.5 % in 13 minutes**. Defining "no AC" as any proxy also true in a LOOP (`!!s.pump_running`) reddens **CA-7 leg C + CA-8 leg E and nothing else**. Gating the AFW pump reddens **leg D alone** — AFW is the sourced survivor (WTSM 5.7.5) and carries a do-not-gate note. **Leg D asserts DISCHARGE PRESSURE, not delivered flow, and that is not a weakening**: measured, an SBO parks SG level at 61.6 % for 25 minutes because with the RCPs stopped there is no core→SG heat path (#325), so an `afw_flow > 0` check would pin a NON-EVENT and go green the day natural circulation is built. Two authoring traps: `h.range()` spans the WHOLE run **including the settle before the injection**, so both CVCS checks first failed against their own pre-event fixture; and the charging mass-balance guard was **UNOBSERVABLE at a green 47/47** — reverting it changed nothing until the probe parked a latched MANUAL demand and asserted inventory in the OTHER direction, because a dead pump that still moves water pushes level UP and every other check here watches it fall. 45 → 46 on 2026-08-03, #329 — **CA-7**, the pressurizer heaters through a station blackout. They were an UNCONDITIONAL heat source: measured full stack, 100.0 % heater power 17 min into an SBO with every AC bus dead, and 100 % from the button press with a **spurious `pzr_level low` trip at 5m27s** if the operator asks. Sourced to **10 CFR 50.2** — SBO is "the complete loss of ac electric power to the essential and nonessential switchgear buses", excluding only "buses fed by station batteries through inverters", which is the vital instrument AC the board reads on. **Leg C is the probe**: a plain LOOP must KEEP the heaters (NUREG-0737 II.E.3.1 puts them on the diesels), and swapping the guard for the plausible `!s.pump_running` leaves legs A and B GREEN with only leg C red — so it catches every proxy that is also true in a LOOP. 44 → 45 on 2026-08-03, #315 — **TR-7b**, the post-trip leg ΔT against the energy balance. The split read FISSION power, so a scrammed core removing **6.61 % of rated** through full flow computed **0.0 °F**, and INDICATED that put the **cold leg above the hot leg in 48.3 % of 1500 samples**. **It computes its band from `core_heat_pct` and `pump_flow_pct` every run** rather than transcribing a number, so a retune of `delta_T_rated`, the decay fractions or `flow_floor` moves the expectation with the plant. Injection-verified, 5 checks red on the old form — and **leg C passes on the OLD form deliberately**, because at rated fission and total heat are equal and that identity is the calibration guard. 43 → 44 on 2026-08-02, #306 — **TR-1i**, the first probe here to assert the WTSM 8.1.1 ±5 °F load-follow duty at all. The rod channel's power-mismatch term became a RATE COMPARATOR (a washout, τ 5 s) and the 5 %/min ramp went **12.55 → 4.77 °F**, inside the duty. **τ is bounded at BOTH ends**: too long and the standing mismatch returns (8.16 °F at 300 s), too short and it differentiates noise — at 1 s the bank travels **761 fine steps an hour at a SETTLED load**. Two probe-authoring traps worth more than the probe: the first mechanism check measured **34 % on BOTH trims** (discriminated nothing), and its replacement then passed **VACUOUSLY** on the old trim because with no follower `maxOut` stays 0 and `0 < maxRaw/2` is true — guard on having OBSERVED the thing you are measuring. TR-1g was RE-BANDED to the sourced ±5 °F, a TIGHTENING that fails on the old plant (+5.24 °F). 42 → 43 on 2026-08-01, #289 — **TR-1h**, the full rejection on the SHIPPED lineup, which nothing asserted once `rods_tavg` became `defaultOn` at power *(OWNER RULING, 2026-08-01: "Let's start the rods in auto. Might as well, everything else starts in auto.")*. **TR-1g was RE-AUTHORED against WTSM 11.2, not re-banded**: the dump is TRANSIENT — *"until the power in the reactor is reduced to the same value as the secondary load"* — so its old 85..93 % steady state was a rods-in-manual ARTEFACT pinned as the design case, and the rod channel following turbine-only `steam_flow` is correct. Five probes now stand the rod channel DOWN explicitly via `rodsManual()` — EV-3, EV-11, TR-1, TR-1c and **TR-1e leg B**, which needs core and generator to DISAGREE by ~2× or it stops discriminating at all. Injection-verified: 7 checks red on the pre-change lineup. **Trap**: TR-1h's first draft asserted "the safeties NEVER lift" from a `measure_stack` run sampled every 150 s, which missed the peak — `h.range()` sees every step, and the defensible claim is PERMANENCE, not occurrence. 41 → 42 on 2026-07-31: the steam dump went **1.05 → 0.40**, the prototypical Westinghouse capacity *(OWNER RULING, 2026-07-31: "Let's change it to 40%.")*, and **TR-1g** is the check that says 40 % is ENOUGH — the 50 % loss of load, no trip, no relief lift, and the documented 40 %+10 % split pinned. FIVE probes were RE-BANDED, not weakened: TR-1 had been pinning a **non-event** ("dump carries near-full power 90..103 %", "no PORV lift" — measured at 1.05 a total loss of load reached Tavg 305.3 °C with power at 97.5 %). It pins the defence-in-depth ladder now, and its PORV check is written **POSITIVELY** so restoring capacity has to edit the line rather than slide through a band. 40 → 41 on 2026-07-31, #220: **TR-1f** — the P-9 permissive is an INSTRUMENT reading, and the probe has to FAIL the channel to observe anything at all, because with a healthy one the fix moves nothing. 4 checks red on the old engine. 38 → 39 on 2026-07-31, #135: **TR-14**, the SOURCED loss-of-feedwater drain rate. It exists because moving `K_sg_level` by **3.6×** left all 32 runners green — nothing in the suite asserted how fast a steam generator empties, so the constant could drift back unnoticed. Fails at 13.0 s against its 25–60 s band on the old value. 39 → 40 same day, #284: **TR-1e** — nothing in the suite compared what the turbine was ADMITTED against what the reactor MADE, because every other check runs where the two agree, so a **2× error on a board gauge** sat behind 34 green runners. Fails 3 checks on the old engine), `run_meltdown` **12 pass / 0 xfail** (11 → 12 on 2026-08-04, #326 — **MD-12**, the post-melt freeze. The model kept COMPUTING past the end of its own declared validity: `melted` is where `CONTEXT.md` and `Manuals/12` §5.5 both stop, and **both** core-material nodes integrated straight through it by two unrelated mechanisms. `fuel_temp_c` is a pure integrator — `hFcEffective` returns 0 on a fully uncovered core, so `dTf` loses its only sink — reaching **5032 °C (9089 °F)** at 2 h; `clad_temp_c` runs on the #238 Arrhenius oxidation feedback and reached **355 618 °C (640 144 °F)**, with oxidation heat at **1095 % OF RATED** out of a core making 4 % decay heat. **The clad half is the larger one and is NOT a follower of the fuel node above melt** — below melt the lower clamp makes it one, which is exactly what made a `stepFuel`-only fix look sufficient to this issue's own investigation; measured, it sits 456 °C clear of the clamp at 20 min. Injection-verified two ways: both freezes out → 4 red, clad drift **312 089 °C**; `stepFuel`'s freeze alone → **3 STILL red, same drift to three decimals**. **The probe asserts that nothing MOVES, not that anything is below a ceiling** — a clamp becomes the thing the suite pins, and the runaway under it stays live and invisible. MD-11's bands are unmoved at 184/172/86/40 s, which is what says the freeze did not reach below melt. **Two of the issue's own comments were correct when written and wrong when acted on**: the rebuttal *"there is no zirconium-oxidation term in this engine"* was true until #238 merged the day before, and the filed LOOP reproduction stopped reproducing when #325 merged the same morning — a LOOP now parks at **307.9 °C (586 °F)** with the core intact. Re-measure on the tree you are standing in before implementing someone else's diagnosis.) (10 → 11 on 2026-08-03, #238 — **MD-11**, zirconium-steam oxidation on the clad hot node. **A heat source that compresses damage→melt by up to 6.7× moved ZERO existing gates**: the ten paths assert THAT the core melts, never how fast or which way the rate is going. So MD-11 asserts the **second derivative** — each 400 °C band crossed faster than the one below, > 3× end to end — rather than a timing band, which would pin one tuning and go stale. Measured **184/172/86/40 s** with oxidation against **218/334/378/428 s** without, i.e. the escalation used to *decelerate* because decay heat falls. Its anchor is recomputed FROM CONFIG (the sourced 2200 °F crossover against this plant's own 8-hour decay heat, 1.1243 %), so a re-fit of the decay groups moves the expectation with the plant. Injection: `q_ref: 0` reddens 5 checks and inverts the bands),
`run_meltdown_stack` **3/3 (21/21 checks)**,
`run_procedures` **29/29 (140/140 checks)** (28/28 139 → 29/29 140 on 2026-08-03, #319 item 4 — PWR-E13 ATWS, `stack_only` with the flag **genuinely earned**: emergency boration runs through `set_auto_setpoint`, an M4-only command, so engine-direct would replay an ATWS with **no response at all**) (27/27 132 → 28/28 139 on 2026-08-03, #319 item 5 — PWR-E17, the direct BEFORE/AFTER for #311: flag OFF the plant held **114.8 %** for ~17 s with **no trip**; flag ON, OPΔT scrams at **114.6 %** after **7.9 s**. Same peak — it just stops there) (26/26 124 → 27/27 132 on 2026-08-03, #319 item 1 — PWR-E03 turbine trip, the pair to PWR-T06) (25/25 115 → 26/26 124 on 2026-08-03, #319 item 2 — PWR-E06 SGTR, unblocked by the #322 ruling. **Severity 0.25, not the ops probe’s 0.5**: a half rupture is not survivable engine-direct, and chasing that with extra procedure steps was refitting content to a gate) (24/24 108 → 25/25 115 on 2026-08-03, #319 item 3 — PWR-E23 seal leak, which had **no test coverage of any kind** before: not a probe, not a scenario) (23/23 100 → 24/24 108 on 2026-08-03, #319 — PWR-T06 post-trip. **Its acceptances are deliberately LAYER-ROBUST**: AFW auto-start and the feedwater isolation are M4 actuations that do not happen in this engine-direct runner, and the procedure has no NON_ENGINE_ACTION to justify `stack_only` with, so every `acc` is a truth both layers produce and the AFW/MFW facts are carried as cautions) (100/100 checks)** (22/22 99 → 23/23 100 on 2026-08-02, #310 — PWR-N15 arrives here as ONE check, not fifteen. It is `stack_only`: the board's only boron control is the `boron_conc` channel TARGET box (there is no manual borate/dilute anywhere on the board), so below M4 the cooldown runs UNBORATED, the MTC takes the core critical and the plant heats back up to 558.7 °F (292.6 °C). The one check is that the flag is JUSTIFIED — the procedure must really carry a NON_ENGINE_ACTION command — so it cannot be pinned onto something engine-direct could run),
`run_procedures_stack` **29/29 (261/261 checks** (26/26 234 → 27/27 244 on 2026-08-03, #319 item 1 — and **a `saw` is only as good as the window it sits in**: the dump pins at 40.00 % about HALF A MINUTE after the trip and is back to ~9 % by three minutes, so an assertion two steps later missed it under the stack while still passing engine-direct, where the transient is slower) (25/25 223 → 26/26 234 on 2026-08-03, #319 item 2 — the depressurization acceptance is INJECTION-VERIFIED: delete the setpoint command and it reddens. Its first form `< 0.010` was HOLLOW, passing on the pre-depressurization value) (24/24 214 → 25/25 223 on 2026-08-03, #319 item 3 — and **the charging cue is M4-DEPENDENT**: measured on the same leak, charging settles **0.042** under the stack and **0.010** engine-direct, 4× apart, because `cvcs_makeup` is what drives make-up on the shipped plant. The acceptance is therefore only `> 0.005`; the OUTCOME is layer-robust — pzr level parks at **53.8 %** and subcooling holds at 40.99 °C in both. The #209 class, recorded rather than tuned until it passed) (23/23 204 → 24/24 214 on 2026-08-03, #319 — PWR-T06 under the stack, where AFW really does auto-start and main feed really does isolate), 2 strict xfails — both RBMK/BWR #208; the 7
`pwr_heatup` xfails cleared 2026-07-26c/d via #206 + #210, and FOUR more on 2026-07-29 that
were never plant defects at all — the harness was running 11 of its 22 procedures below the
10× it declares, so their steps got a tenth of their sim time (#245). 22/22 176 → 23/23 204 on 2026-08-02, #310 — the PWR-N15 `pwr_cooldown` checklist, 28 checks, and the first procedure to use **RAMP steps**: a setpoint walked along an authored polyline across the step's `hold` rather than typed once. That schema addition is REPLAY-SIDE ONLY because **the live checklist never issues `cmd`** — `ui/app.js renderChecklist` draws text + highlights and the instructor grades off `acc` — so it costs the UI and the browser gate nothing. It exists because a discrete walk-down MEASURES BADLY here: the dump's band is 36 psi (0.25 MPa) against a 40 % capacity and the primary trails by τ ≈ 37 s, so an 18 °F (10 °C) Dump SP step bursts at **−1168.2 °F/hr (−649 °C/hr)** and a whole 46.8 °F (26 °C) leg at −2178 °F/hr. Seven injections redden it; the one to remember is that flattening the four legs back into single steps leaves **27/28** — every acceptance still passes, because a staircase ARRIVES everywhere the procedure says, and the `tavg_rate_c_per_hr` guard is the only check that can tell the two apart)**, `run_checklist` **24/24**, `run_scenarios`
**3/3**, `run_m7` **OK**, `run_flags` **16/16 (310 checks)** (292 → 295 on 2026-08-03, #319 — the `procedure:pwr_post_trip` registry entry, which this gate caught missing) (292 checks)** (289 → 292 on 2026-08-02, #310 — it caught the missing `procedure:pwr_cooldown` registry entry, which is the job: a procedure the player can open with no flag behind it ships ungated), `run_inspect` **8/8 (36 checks)** (7/7 35 → 8/8 36 on 2026-08-01 — the System Scanner fix; the inspection copy is a THIRD independent copy of every setpoint and was the only one with no gate reaching back to the engine),
`run_contract` **147 checks / 0 failed** (144 → 145 on 2026-08-04, #325 — **`natural_circulation`**, buoyancy-driven flow with the RCPs stopped. **Diagnostic only, and deliberately NOT a board lamp**: a real crew verifies it from loop ΔT + subcooling + stable SG pressure, all of which this board already has, so a dedicated indicator is Q4 duplicate authority. It exists because `pump_flow_pct` alone cannot tell 4 % of buoyancy from 4 % of a coasting rotor, and it is keyed on what the buoyancy LAW produces rather than on `flow_frac` — which would read true for both. 143 → 144 on 2026-08-03, #332 — **`ac_available`**, Class 1E ac switchgear energized. Today *exactly* `!station_blackout`, and that is the point rather than an apology: the defect was never a wrong formula, it was that the question had no NAME, so four call sites consulted a casualty flag and every load added since was written without anyone asking. A plain LOOP KEEPS it — the diesels carry the 1E buses — so it is not a synonym for the flag, it is the one the loads should read) (143 → 145 on 2026-08-03 — `core_uncovered_frac` and `zirc_heat_pct`, the two drivers BEHIND `clad_temp_c`, published for the Physics tab's new Core damage group. Both were LOCALS inside `stepCladding`, so the panel showed the symptom (peak temperature) and the verdict (`fuel_damaged`) with the mechanism between them invisible — measured on a 0.8 large LOCA, oxidation heat climbs 0.077 → 0.943 % of rated between 50 s and 400 s while the decay tail is FALLING) (141 → 143 on 2026-08-03, #311 flag ON — the two OTΔT/OPΔT approach ALARMS arrive and this gate's second contract makes them declare a `category`. Automatic: enabling protection moves this and `run_reactivity` **27 checks / 0 failed** (#260 — pins the SOURCED reactivity anchors; `rho_excess` is solved against BEAVRS's 975 ppm HZP ARO critical boron, so this is what reddens if a rod worth or `alpha_D` moves without a re-solve. 23 → 27 on 2026-07-30, #263 item 2: the four inputs `pwr_startup`'s 26-step creep is DERIVED from — startup-IC boron, critical position, differential bank worth, and the excess the creep leaves), `run_hr3` **28 checks / 0 failed** (27 → 28 on 2026-08-02, #306 — one more accepted-coupling site, the `set_boron_adjust` RE-ASSERT in `_stepBang`. The guard earned its keep on that change: the first version read `control_state.boron_adjust` directly in the shared kernel and it red-carded it BY NAME — the read-back is a per-plant `output(ctx)` callback now. 29 → 27 on 2026-07-31, #228), `run_reachability` together, with nothing hand-added) (140 → 141 on 2026-08-03 — **`core_heat_pct`**, TOTAL core heat (fission + decay tail), published for the Physics tab. **It is NOT `power_pct`**, which is fission alone; the two are equal by construction at steady power, which is why every gate here read them as interchangeable — measured seconds into a 20 %-of-rated LOCA, fission is 11.0 MWt against 21.0 MWt of decay heat. Published rather than re-derived in the UI, because a formula copied into a consumer does not move itself. 139 → 140 on 2026-08-02, #306 — one more alarm, `rod_limit_approach`. 84 → 138 on 2026-07-31, #157 — it now guards a second contract: every alarm on all three plants declares a `category`, which the UI used to keyword-match off the alarm id), `run_otdt` **46 checks / 0 failed** (MEASURED 2026-08-03 on the MERGED tree — this line said **39** through three workbench commits that took `BASELINES` 39 → 44 → 46, on BOTH parents, so the drift was invisible to the merge and is the standing "update BASELINES and this section together" rule failing in the quiet direction. 44 → 46, #318: +1 for the runback's **NEVER-WORSE** check — A/B'd across four seeds, the runback saves the 15 % steam line break on three and is NEUTRAL on the fourth, and nothing else asserted that a protection action which takes load off cannot bring a trip FORWARD; then +1 for the SOURCED law's **quantisation**, load landing on 5 % multiples because the real EHC steps 5 % at 200 %/min then holds 28.5 s, which **fails on the continuous ramp it replaced** where the old `< 90 MWe` band could not tell them apart. 39 → 44, #318: the turbine runback itself. NEW 2026-08-03, #311 — Overtemperature ΔT / Overpower ΔT. **Its own runner because the trips ship DEFAULT OFF and `pwr_control.js` reads that flag at LOAD time**: Node caches requires, so no other suite can see them at all. It sets the flag between loading the config and the control layer and covers BOTH states — flag-off (the five derived gauges exist, nothing is wired) and flag-on (trips, rod stops, annunciators, the normal-operations envelope, the casualties). **Injection-verified four ways**, and the first is the one worth keeping: restoring the ROTATED OTΔT line reddens 3 checks and reproduces the original defect's exact numbers — scram 55.0 s, margin 0.6 — so the ride-out check is written POSITIVELY, asserting the margin rather than merely the absence of a trip. Deleting the rod stops reddens 3; clearing `withdrawal_only` reddens 2; walking `dnb_margin_factor` to 0.95 reddens the 2 checks holding the equivalent K₂/K₃ inside the published real bands. Count moves with the casualty list, 1–2 checks each), `run_reachability` **66 checks / 0 failed** (62 → 66 on 2026-08-03, #311 flag ON — Part A iterates the live protection tables, so the two new trips and two new alarms are picked up automatically and each is asserted to sit strictly inside its instrument's range) (59 → 62 on 2026-08-03, #307 — **B3, the suite's first INVERTED case.** It asserts the 1980 rpm turbine overspeed trip **cannot** fire, because there is no roll model: peak true rpm is **1800.00** on line in Follow, **1800.00** in Manual against a 2×-rated MWe demand, **1799.10** with the MSIVs shut. Part A was perfectly happy — 1980 sits strictly inside `turbine_rpm`'s [0, 2000] — which is this runner's own hollow-assertion shape one instrument short of its coverage. Written to **go RED when the plant gets better**, so building the roll forces `DESIGN_COMPANION` §8.23 to be retired rather than absorbed. **The first injection was a bad test and is worth remembering**: forcing an overshoot via `sync_tau` changed nothing, because `hot_full_power` *starts* at rated so there is nothing to overshoot — inject at the setpoint (1700 → 1 red) or at the sync target (2100 rpm → 2 red), and note the peak then reads a CLAMPED **2000.00**, because the instrument range tops out there. 58 → 59 on 2026-08-02, #306 — the ROD LIMIT LO setpoint, 40 fine steps inside `rod_limit_margin`'s [0, 912]. NEW 2026-07-30, #249/#273 — **can the plant reach its own setpoints?** Part A is static and total: all 50 PWR trip/actuation/alarm thresholds must sit STRICTLY inside their instrument's declared range, since `crossed()` is strict. Part B DRIVES the plant and watches the indicated channel cross, which is the only half that can catch a clamp — `pzr_level`'s range is [0,100] and its trip is 97, so Part A was perfectly happy while the level physically could not exceed 88.00 %, and that is what let a full accumulator dump hide behind an "arrived UNscrammed" check for months. **Add a case here whenever you assert that a trip did NOT fire** — that claim is worth exactly what the gauge can reach), `run_hardrules` **170 checks / 0 failed (1 declared HR1 debt — RBMK, on hold)** (165 → 170 on 2026-08-04b, #330 — five citation sites for the drain-rate ruling *(OWNER RULING, 2026-08-04: "A")*, across CLAUDE.md, CHANGELOG, TUNING_LOG, BUILD_DECISIONS and the ops-probe write-up. The CODE moved this by **zero**: the ruling changed no constant, it recorded a decision about one already shipped) (148 → **157** on 2026-08-04e — the three UI directives (board ALL-CAPS, Physics-tab contrast + indication colours, failure groupings). Nine citation sites, and the usual split: the CSS/JS moved this by **zero**, the write-ups are the whole delta. The directive quoted at each decision site in `ui/app.js`, `ui/shell.css`, `pwr_board_wiring.js`, `board_check.html` and `run_inspect.js` is invisible here — markdown only — which is a property of the guard, not a gap.) (149 → **148** on 2026-08-04d, #282 — a DROP, and the mechanism is the one this line already records twice for the themes cap: **deleting history deletes citation sites.** Zeroing the manual set to Rev 0 collapsed 26 revision rows, several of which quoted owner rulings, and that outweighed the citations the three launch directives added. **Checked before accepting**: every affected ruling still stands in other tracked files, so this is fewer citation SITES, not fewer rulings. The revision table and this gate pull against each other exactly as the themes cap does. **It read 146 mid-change** — measured before the TUNING_LOG and BUILD_DECISIONS write-ups, which added two sites; that is this very line's own "re-run after the docs" warning landing on the entry that repeats it. The write-up then cited two directives with the **date in the prose instead of inside the citation**, which scores as undeclared: 148/2 before 148/0.) (142 → **149** on 2026-08-04c, #282 — the version-bump suspension LIFTED, and the largest write-up drift yet from a change with **no code in it at all**. **MEASURED net +7, deliberately not decomposed**: citations were added in six files and the 2026-07-31 suspension quotes removed from three, and hand-counting that does not reconcile to +7 — this gate over-reports its site count, as the `BASELINES` note has said since #312. The dated quote now in `site/release.js` is invisible here, because `.js` is not scanned. **Two traps, both caught on this change rather than reasoned about.** The Rev 0 ruling was first quoted in the skill banner with **no date** — precisely what HR11 exists to stop — scoring 149/1 before 149/0; a citation typed by hand is the likeliest place for a malformed one. And **typing a marker into prose REMOVES a site, even inside backticks**: this very sentence first named the marker literally and the gate went **149 → 148**, because a backticked marker is not merely skipped — it swallows the guard on a real citation nearby, and this line carries many. Injection-verified three ways (paragraph absent 149, marker typed 148, marker described 149). **Refer to the markers by description, never type them.**) (**MERGED 2026-08-04 — ALL THREE LANES MOVED THIS FROM 142.** develop 142 → 149 → 148 → 157, workbench 142 → 144, backshop its own chain below — so no branch figure survives and adding them up is the arithmetic this entry has warned against five times. The count above is MEASURED on the fully merged tree, AFTER every conflict was resolved. All three histories kept.) (142 → **149** on 2026-08-04b, #328 + #326 — write-up drift, and an unusually clean example of the asymmetry: the CODE in both changes moved this by **zero**. A rename cites no rule and `if (s.melted) return;` cites nobody; the entire delta is tracked markdown carrying #328's two dated owner quotes — the rename directive and the 100-MWe unit ruling — across the manual revision row, CHANGELOG, TUNING_LOG and BUILD_DECISIONS. **Measured AFTER the docs**, which is the only order that gives the right number: an intermediate run taken with the code done and the write-ups still to come read **143**, and writing that down would have shipped a drift six checks wide.) (**MERGED 2026-08-04 — BOTH LANES MOVED THIS FROM 142.** develop took it 142 → 149 → 148 → 157 and workbench 142 → 144, so neither branch figure survives and 157 + 2 is not the answer either. The count above is MEASURED on the fully merged tree, after every conflict was resolved — never during, since a tree with markers still in it carries both sides’ citations at once and counts the duplicates. Both histories are kept below.) (142 → 144 on 2026-08-04 — the two CLAUDE.md sites citing the lane-tag directive *(OWNER DIRECTIVE, 2026-08-04: "Since that's done add an in process tag that shows which worktree it's being worked on.")*, in the Issue-tracking label section and the session-start lane check. **#330 moved this by ZERO, and that is worth knowing rather than surprising**: its write-ups quote no owner ruling at all, and the one owner request they DO cite — the 2026-07-22 drain-rate feel target — lives in `test/ops_pwr.js`, which this gate does not scan. Tracked MARKDOWN only, the #310 property again) (137 / 141 -> MEASURED ON THE MERGED TREE, 2026-08-04 — develop took it to 137 and backshop to 141 INDEPENDENTLY, so neither figure survives and their sum is not the answer. Measured AFTER every conflict was resolved, never during: a tree with markers still in it carries BOTH sides’ citations at once and counts the duplicates.) (135 → **141** on 2026-08-04, #325 — six citation sites for *(OWNER RULING, 2026-08-04: "Go with one B")*, and the split is the usual one: the engine, config and probe changes moved this by **zero**, and the entire delta is write-ups — CLAUDE.md (twice: the themes bullet AND this very line, which is the recursion this entry has always had), CHANGELOG, TUNING_LOG, BUILD_DECISIONS and the `DESIGN_COMPANION` §8.6 retirement row. Measured AFTER the docs, which is what this entry has been telling people to do since 2026-07-31) (136 → **135** on 2026-08-03, #332 — the gate biting the OTHER way again, and the mechanism this entry already warns about: the *Recent themes* cap is five bullets, so adding the #332 one evicted #315 and took its `"Do as you recommend."` citation with it. **The RULING is not lost** — checked before accepting the drop, it still stands in `CURRICULUM.md`, `CHANGELOG.md` and `TUNING_LOG.md` — so this is one fewer citation SITE, not one fewer ruling. The engine, config and probe changes moved this by **zero**; the entire delta is the eviction, because #332's write-ups quote WTSM rather than the owner) (**MERGED 2026-08-03 — develop took it to 125, workbench to 128 with the #311 flag ON, and the merged tree is NEITHER. Measured, not added up.**) `run_all` refused it as symmetric drift. Five sites, not two. **Do not write a gate score you have not measured**, least of all in the file that records the measurement) (95 → 98 on 2026-08-03, #311 — write-up drift once more, and a clean example of it: the engine, config, instrument and control-layer changes moved this by **zero**, and the entire delta is the tracked-markdown sites citing the 2026-08-02 ruling. **Verified rather than assumed** — stripping the date and quote from the CLAUDE.md citation alone takes HR11 to 1 undeclared and reddens the gate, so the wrapped citation is genuinely seen by the markdown-wrap window rather than silently skipped, which is the exact failure this guard was written for) (90 → 95 on 2026-08-02 — `Blueprint/DESIGN_CRITERIA.md` (four inclusion criteria + the §6 per-plant curriculum + the dynamics-first priority ruling), its CLAUDE.md pointer, and the `DESIGN_COMPANION.md` §2 re-scope) (89 → 90 on 2026-08-02, #295 F1/F2 — one citation site, the TUNING_LOG entry carrying the 2026-08-02 ruling; the kernel fix itself moved nothing here) (88 → 89 on 2026-08-02, #310 — one citation site for the keep-all-three ruling. The THREE code-site citations added in the same change moved nothing: this gate scans tracked MARKDOWN only, so a ruling recorded at the decision site in a `.js` comment is invisible to it. That is a property of the guard, not a gap in the record) (85 → 88 on 2026-08-01 — HR12 widened to cover CONTROL BEHAVIOUR after #303/#304, plus the two write-ups citing it. The rule TEXT is one of the three sites: this gate counts citations wherever they are tracked, and `CONTEXT.md` §3 is tracked, so editing a Hard Rule to carry its own dated quote moves the number. BINDING rules stay at ten — widening one instead of adding an eleventh was the point) (83 → 85 on 2026-08-01, #303 — write-up drift once more: the 04 NOP review changed manuals and a checklist, which this gate does not scan, and the two sites citing the owner dilute-step directive are the entire delta) (**MEASURED 83 on the MERGED tree — not develop's 63, not workbench's 80, and not the two added together.** **And measure it AFTER resolving, not during**: a first pass read 84 off a tree that still had the conflict markers in it, so both sides' citations were present at once and the duplicates were counted. Both branches moved this number independently and a mechanical conflict resolution ships a drift; this line and the `BASELINES` entry are the worked example the entry itself warns about. develop: 60 → 63 (#289) — three citation sites for the rods-in-auto and ROD-AUTO-colour rulings, and the gate ALSO caught a real defect in that change, the first `rods_tavg` `defaultOn` reading `true_state.power_pct` and failing as an undeclared HR1 site, the #220 class exactly. workbench: 43 → 77 (#290) — HR11 matched the literal `OWNER RULING` only, so ELEVEN in-scope `OWNER DIRECTIVE` citations were unguarded, including *never merge into develop* and *never push the lanes*; then 77 → 80 (#238), ordinary write-up drift. The merged figure is higher than either because the widened #290 guard also sees develop's 2026-08-01b/c write-ups, which workbench's own 'measured on the merged tree' note predates. 47 → 48 on 2026-07-31 — the `06 PWR-A33` keep-it ruling, recorded so the "that alarm got rare, delete it" argument is not re-litigated from scratch. 43 → 47 on 2026-07-31 (#288) is the same mechanism a third time: the engine and config change moved NOTHING here, and the four write-up sites citing `"issue 288, split them."` — CHANGELOG, TUNING_LOG, BUILD_DECISIONS and the manual revision row — are the whole delta. this line once said 28 while the gate was at 29. It counts `OWNER RULING` / `OWNER DIRECTIVE` **citation sites** wherever they are tracked — that wording used to read "dated owner quotes", which is what made #290's silence look like a clean bill rather than a marker it never matched — so **writing a change up moves it, not just making the change**; re-run it AFTER the docs. 40 → 39 on 2026-07-31 (#286) is the rule biting the OTHER way: the *Recent themes* cap is five bullets, so adding one dropped the #260/#263 bullet and with it the `"for 263 item 1 fit the measurement."` citation — the ruling still stands in three other tracked files, so this is one fewer citation SITE, not one fewer ruling. **The themes cap and this gate pull against each other**; check where else a quote lives before restoring a bullet to chase the number. 39 → 40 on 2026-07-31 (#284) was that rule again, cleanly: the engine fix moved nothing, and the BUILD_DECISIONS write-up moved it by quoting #230's ruling. 39 was MEASURED on the merged tree: `develop` took it 29 → 39 across #249/#273/#276 and `workbench` 29 → 32 (#249, three sites carrying `"249 - fit it."`) independently, so neither branch figure was right and a mechanical resolution would have shipped a drift), `run_release` **11 checks / 0 failed** (8 → 11 on 2026-08-04, #282 — **LAUNCH**: `RD_RELEASE` is `Alpha 1.0.0`, `changelog.html` has its first published entry and `CHANGELOG.md` is rolled, so the three released-state checks armed **on the format alone**. The 11th did NOT come free, and simulating the release before doing it is what found that: this file still carried `## [Alpha 1.11.0]` down to `## [Alpha 1.7.0]` from the pre-public period, so rolling `[Unreleased]` to `## [Alpha 1.0.0]` put 1.0.0 **above** 1.11.0 and failed newest-first — **10 checks / 1 failed**, and #282 recorded the opposite. The nine pre-public headings are `## [Pre-launch 1.x.y]` now, relabelled individually because merged boundaries cost a tag diff to recover. **The effect nothing would have surfaced**: `floor` in the CROSS rule is the oldest individually-named heading, so while 1.0.0 sorted under `Alpha 1.7.0` the launch entry fell below it and its date agreement across the two files was **not checked at all** — zero CROSS rows, no failure, no warning. That restored CROSS row IS the 11th check.) (NEW 2026-07-31 — **release bookkeeping**: `site/release.js`, `changelog.html` and `CHANGELOG.md` must agree on what shipped. Written because the `CHANGELOG.md` roll — renaming `## [Unreleased]` to the version — was skipped for **Alpha 1.10.0 AND 1.11.0**, leaving 434 lines of two shipped releases filed as unreleased with the newest heading reading 1.9.0. **Nothing downstream reads that heading**, so nothing went red and nobody noticed; a CLAUDE.md note and a release-skill step already said to do it, and they are what failed. Verified against the real pre-fix file, not a synthetic one: 3 checks red. The count moves with the number of released versions — every `changelog.html` entry down to the oldest one `CHANGELOG.md` still names individually is cross-checked, so **a release adds a check**), `run_portable` **124 checks / 0 failed** (the offline single-file build — count moves with the shipped asset list; +7 on 2026-07-30 for the DOWNLOAD section, #275, which guards the *delivery* rather than the artifact: the site's download button is stamped with the release version by `site/nav.js`, and every way that wiring can break leaves a button that still works and still hands out `latest.zip`), `run_manual_units` **0 failed** (scored on failures only — the coverage count moves on ordinary prose edits, so it is deliberately NOT in the baseline), `run_manual_rev` **13 checks / 0 failed** (the manual set's revision history — table shape, set-wide stamp agreement, content-digest seal, pack currency; IS baselined, because unlike `run_manual_units` its checks are structural and do not move on prose. **A chapter edited with no revision row reddens it** — the failure it was written for, after six content changes went unrecorded), `verify_flags_ui` **42/42** (this line said 48/48 from the day it was written; `BASELINES`
> **Carried from `workbench` at the 2026-08-03 merge, unedited:** `run_hardrules` **108 checks / 0 failed (1 declared HR1 debt — RBMK, on hold)** (104 → 108 on 2026-08-03c, #314 — the RCP breaker-position trip; four citation sites, all write-ups, the one-row code change moved it by zero) (100 → 104 on 2026-08-03b — HR1 seam-vs-roster. Four citation sites, one of them **the rule text itself**: HR1 now says it governs the SEAM (protection decides from the instrument layer) and NOT the ROSTER (which instruments exist, their characteristics, how many channels vote — that is plant design, `DESIGN_CRITERIA.md`'s four questions). **A missing instrument is a design gap to be filed, never an HR1 exception** — the door #247 walked through for two years) (95 → 100 on 2026-08-03 — the premise purge. Five citation sites, every one of them a WRITE-UP carrying the owner's words; the source and spec edits moved it by **zero**, and HR1 itself did not move at all. **Measured twice on purpose** — 98 with the eleven document edits in, 100 after CHANGELOG/TUNING_LOG/BUILD_DECISIONS — which is this entry's own standing warning arriving on schedule: re-run it AFTER the docs, not after the code) (90 → 95 on 2026-08-02 — `Blueprint/DESIGN_CRITERIA.md` (four inclusion criteria + the §6 per-plant curriculum + the dynamics-first priority ruling), its CLAUDE.md pointer, and the `DESIGN_COMPANION.md` §2 re-scope) (89 → 90 on 2026-08-02, #295 F1/F2 — one citation site, the TUNING_LOG entry carrying the 2026-08-02 ruling; the kernel fix itself moved nothing here) (88 → 89 on 2026-08-02, #310 — one citation site for the keep-all-three ruling. The THREE code-site citations added in the same change moved nothing: this gate scans tracked MARKDOWN only, so a ruling recorded at the decision site in a `.js` comment is invisible to it. That is a property of the guard, not a gap in the record) (85 → 88 on 2026-08-01 — HR12 widened to cover CONTROL BEHAVIOUR after #303/#304, plus the two write-ups citing it. The rule TEXT is one of the three sites: this gate counts citations wherever they are tracked, and `CONTEXT.md` §3 is tracked, so editing a Hard Rule to carry its own dated quote moves the number. BINDING rules stay at ten — widening one instead of adding an eleventh was the point) (83 → 85 on 2026-08-01, #303 — write-up drift once more: the 04 NOP review changed manuals and a checklist, which this gate does not scan, and the two sites citing the owner dilute-step directive are the entire delta) (**MEASURED 83 on the MERGED tree — not develop's 63, not workbench's 80, and not the two added together.** **And measure it AFTER resolving, not during**: a first pass read 84 off a tree that still had the conflict markers in it, so both sides' citations were present at once and the duplicates were counted. Both branches moved this number independently and a mechanical conflict resolution ships a drift; this line and the `BASELINES` entry are the worked example the entry itself warns about. develop: 60 → 63 (#289) — three citation sites for the rods-in-auto and ROD-AUTO-colour rulings, and the gate ALSO caught a real defect in that change, the first `rods_tavg` `defaultOn` reading `true_state.power_pct` and failing as an undeclared HR1 site, the #220 class exactly. workbench: 43 → 77 (#290) — HR11 matched the literal `OWNER RULING` only, so ELEVEN in-scope `OWNER DIRECTIVE` citations were unguarded, including *never merge into develop* and *never push the lanes*; then 77 → 80 (#238), ordinary write-up drift. The merged figure is higher than either because the widened #290 guard also sees develop's 2026-08-01b/c write-ups, which workbench's own 'measured on the merged tree' note predates. 47 → 48 on 2026-07-31 — the `06 PWR-A33` keep-it ruling, recorded so the "that alarm got rare, delete it" argument is not re-litigated from scratch. 43 → 47 on 2026-07-31 (#288) is the same mechanism a third time: the engine and config change moved NOTHING here, and the four write-up sites citing `"issue 288, split them."` — CHANGELOG, TUNING_LOG, BUILD_DECISIONS and the manual revision row — are the whole delta. this line once said 28 while the gate was at 29. It counts `OWNER RULING` / `OWNER DIRECTIVE` **citation sites** wherever they are tracked — that wording used to read "dated owner quotes", which is what made #290's silence look like a clean bill rather than a marker it never matched — so **writing a change up moves it, not just making the change**; re-run it AFTER the docs. 40 → 39 on 2026-07-31 (#286) is the rule biting the OTHER way: the *Recent themes* cap is five bullets, so adding one dropped the #260/#263 bullet and with it the `"for 263 item 1 fit the measurement."` citation — the ruling still stands in three other tracked files, so this is one fewer citation SITE, not one fewer ruling. **The themes cap and this gate pull against each other**; check where else a quote lives before restoring a bullet to chase the number. 39 → 40 on 2026-07-31 (#284) was that rule again, cleanly: the engine fix moved nothing, and the BUILD_DECISIONS write-up moved it by quoting #230's ruling. 39 was MEASURED on the merged tree: `develop` took it 29 → 39 across #249/#273/#276 and `workbench` 29 → 32 (#249, three sites carrying `"249 - fit it."`) independently, so neither branch figure was right and a mechanical resolution would have shipped a drift),
always said 42 and the gate has always scored 42),
`verify_e2e_ui` **PASS (16 screenshots)** (scored on screenshots — the count is `ENGINES × VIEWS`, so **sections are free to add and none of them move this number**; `testRewindPicker` arrived 2026-07-31 with #137 and `testTrendPreseed` 2026-08-01, both at 16. **`testTrendPreseed` guards the REAL 30-minute graph preseed** *(OWNER, 2026-08-01: "when you make preset starts, run them for 30 minutes to fill up the graph with real data before saving")* — `ui/app.js` `ensurePreseed` seeds flat instantly then swaps in a genuinely-run trace off the main thread, cached per plant+dv+IC. **If you write a check here, scope it to `#chartCanvas`**: counting distinct y-values across ALL polylines reads ~250 gauge sparklines and scores 32 whether the feature works or not — it proved nothing twice. Scoped, the A/B is 28 distinct y over 61 points vs **exactly 1** with the call neutered), `verify_manual_follow` **PASS (258 checks)** (183 → 198 on 2026-08-03, #319 — PWR-T06’s five controlled steps, 3 checks each; its STEP_UI entries went in WITH the procedure, so this and `run_manual_controls` moved together) (183 checks)** (141 → 183 on 2026-08-02, #310 — 14 controlled steps of the PWR-N15 cooldown, 3 checks each; its STEP_UI map was written WITH the procedure, so unlike #224 this number and `run_manual_controls` moved together in one change) (84 → 174 on 2026-07-31, #224 — NOT new assertions, the same ones finally applied to the steps they were always meant to cover. This gate iterates `STEP_UI` in `test/manual_ui_map.js` rather than the procedure steps, so **that table is its coverage list** and an unmapped step is UNVERIFIED, not merely unmapped: measured, 17 of the 45 controlled PWR steps, `pwr_heatup` at ZERO, gate green. Runtime only 115 → 132 s because the per-entry page loads went too — the bar loop re-navigated with `&view=`, which **nothing in `ui/app.js` reads**), `run_manual_controls` **172 checks** (122 → 132 on 2026-08-03, #319) (122 checks / 0 failed** (94 → 122 on 2026-08-02, #310) (NEW 2026-07-31, #224 — was `test/audit_manual_controls.js`, and that is the whole point: not a `run_*.js`, so auto-discovery never saw it, so it had no baseline, so it sat at 32 mismatches / exit 1 through three procedure re-authorings. Guards that every controlled procedure step names a control the board can actually reveal AND is covered by the browser gate. Count moves with controlled steps, 2 checks each).

Also green: `run_e2e_controls` **59/59** (both F12 reds were stale expectations, fixed
2026-07-25, #150; 35 → 39 on 2026-07-29 when the CVCS droop check was rebuilt to measure
at equilibrium instead of half a time constant into the transient — #194; **39 → 59 on
2026-07-31, #75**, the RPS reset from the board. Worth knowing for the next person writing
checks here: the first cut of those 20 was 18 checks, all green, and deleting the ENTIRE
`rps_reset_permissive` config still left the suite green — the standing turbine trip covers
the first half-second after a scram and the rods are seated before the later checks run, so
the ~1–3 s window where that config is the only thing binding was never asserted. Injection
found it; reading the tests did not).

**One tracked red**, carrying a `note` in `BASELINES`: `run_ops` **58/69** — probes are
tuning targets by design. **Measured 2026-08-04: PWR is 21/22 with ONE fail; the other 10
reds are 6 RBMK + 4 BWR.** The single PWR red is NEW at #330 and is a **RULED, ACCEPTED
state — not a regression and not a pending question** *(OWNER RULING, 2026-08-04: "A")*:
`ops_cvcs_pzr_drain_rate` reads **53.7 s** for its 15-point pressurizer drop against a
`>= 300 s` acceptance, because that acceptance is a direct product of `level_per_mass`
(`0.030 · gain · level_per_mass`) and #330 corrected that constant 100 → 776. It is
**deliberately NOT re-banded, and must not be** — the probe exists because of a 2026-07-22
owner request for a drain-rate feel target, and re-banding a target whenever the plant moves
retires it instead of reporting against it. Both options were costed in the probe's own
comment (`test/ops_pwr.js`) and option A was selected: ship the corrected geometry, drain
7.76× faster than the target, `run_e2e_controls` **59/59**. The rejected B scaled
`cvcs_inventory_gain` to 0.00154639 — restoring the rate exactly, loop τ and the droop
equilibrium both preserved, implied RCS volume 1,389 → 10,779 gal against a real ~68,000 —
but CVCS make-up authority shrinks 7.76× so leaks it used to hold stop being held, and
`run_e2e_controls` falls to **52/59**. A real plant takes ~79 min for this drop, so both sim
values are far from prototypical; the choice was between two game-feel numbers, which is why
it was the owner's. **If the drain ever proves too fast in play the cheap lever is the
letdown ORIFICE size** (0.030 ≡ 20 gpm), which sets the drain independently of charging
authority — UNMEASURED, and it moves the gpm gauge calibration too.
**Before #330 this line read 59/69 and PWR 22/22 with zero fails.** The deliberately-red C2
accel-latency probe (#153) was the RBMK seventh and is **green as of 2026-07-31 — because
the defect was fixed, not because the test was weakened**; all three accel probes (PWR,
RBMK *[post]*, BWR) now report the same trip delay at 1× and 256×. This paragraph
previously named **P4** among the open
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
node test/run_all.js            # THE AGGREGATE GATE — all 37 runners vs recorded baselines
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
node tools/perturb_sweep.js            # WHICH CHECKS BREAK IF I RETUNE THIS? (see below)
node tools/perturb_sweep.js --suite=behavior --nudge=thermal.h_sg*1.03
node tools/perturb_sweep.js --self-test  # prove the harness can detect anything at all
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
- **On release (merge `develop` → `main`)** → the ordinary procedure under *Website changelog &
  version numbers* below: version bump + `changelog.html` entry + `CHANGELOG.md` roll, all in
  **one change**, then `run_release` green before the merge. **`Alpha 1.0.0` is PREPARED on
  `develop` and awaiting the merge** *(OWNER DIRECTIVE, 2026-08-04: "The next release will take
  the program out of pre-Alpha and into Alpha and bring back the update tracking page. Update
  tracking summaries/lists should be concise.")* — `RD_RELEASE`, the one-line player entry, the
  rolled `CHANGELOG.md`, the `Pre-launch 1.x` relabels and the manual set at **Rev 0** are all
  in. So **do not bump again for that merge**; the next bump is the release *after* it, on the
  Platform.Feature.Refinement rules. `run_release` **8 → 11** and `run_manual_rev` unmoved at 13.

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

  **Two labels the owner added 2026-07-31** *(OWNER DIRECTIVE, 2026-07-31: "The review tag
  is for when the ai wants me to review something before closing the issue"; "Add an owner
  review tag and a 'work next' tag to issues")*:
  - **`status-owner-review`** — the work is **done and gated**; you want the owner to look
    before it closes. Not the same as `status-needs-ruling`, which means you are *blocked*
    and have delivered nothing. Use it when you shipped something with a judgement call
    inside it — a recategorisation, a threshold, a wording choice — and the owner should
    see the call before it becomes history. **Say what to look at**, in one line, or the
    label just means "read the whole thread". **Do not close an issue carrying it** without
    the owner's word.
  - **`status-work-next`** — the owner's work order: pick this up next. Owner-applied by
    convention; do not add it to your own issues to promote them.
  - **`status-work-complete`** — built, gated and pushed; nothing left to do on the issue
    itself. It is **not** the same as closed: an issue can be complete and still open
    because it is waiting on a review, a release, or a decision on a follow-up. Apply it
    with the gate result in the comment, and **clear `status-work-next` when you do**.

  **The three IN-PROGRESS lane tags** *(OWNER DIRECTIVE, 2026-08-04: "Since that's done add
  an in process tag that shows which worktree it's being worked on.")*:
  - **`status-wip-develop`** · **`status-wip-workbench`** · **`status-wip-backshop`** — an
    agent is **live on this issue right now**, in the named tree. One only; the lane is the
    tree, not the branch.

  **Apply it when you START, clear it when you STOP** — not when you finish. A lane tag left
  standing after a session ends is worse than no tag, because the next agent reads it as
  occupancy and stands down for nobody. Clear it on the same turn you hand the issue back,
  whether the work landed, is blocked, or you were interrupted.

  **This is the FIRST occupancy signal that is not a guess.** The lane check at the top of
  this file infers occupancy from uncommitted files plus a recent commit, and that heuristic
  cannot tell another live session from the owner's own edits from your own leftovers — which
  is exactly why it is only ever allowed to WARN AND ASK. A lane tag is an agent SAYING where
  it is. It does not replace the `git status` sweep (an agent can start work without touching
  an issue), so run both: `gh issue list --label status-wip-workbench` answers *who is in that
  tree and on what*, which the file sweep never could. **A tagged issue in your lane that you
  did not tag is a positive — warn and ask, same as the file check.**

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

> **LIVE AGAIN, and the launch release is ALREADY PREPARED on `develop`** *(OWNER DIRECTIVE,
> 2026-08-04: "The next release will take the program out of pre-Alpha and into Alpha and bring
> back the update tracking page. Update tracking summaries/lists should be concise.")*,
> superseding the 2026-07-31 suspension of this subsection. **`Alpha 1.0.0` is committed and
> waiting for the merge — do not bump it again for that merge.** The digit rules below choose
> every version *after* it.
>
> **Two things that release established, which the next one inherits.** `changelog.html`'s
> **first** entry is deliberately one line *(OWNER DIRECTIVE, 2026-08-04: "The first release
> should not have change log entries other than saying it's the initial Alpha release.")* —
> later entries are diffs and get the normal treatment. And `CHANGELOG.md`'s pre-public sections
> are **`## [Pre-launch 1.x.y]`**, not `Alpha`: they were dev versions, and if they parse as
> released ones then `1.0.0` sorts under `1.11.0` and the gate reddens on newest-first.

The public site has a **player-facing** changelog at **`changelog.html`** — separate
from the developer `CHANGELOG.md`. **Every release gets a version number and a
`changelog.html` entry — required, not optional; do it as part of the merge.**

- **When** — immediately *before* merging `develop` → `main`. One entry per release.
- **Version** — `Alpha X.Y.Z` = **Platform . Feature . Refinement**. Read the top entry
  and bump the highest-significance digit in the release:
  - **X** platform milestone (new reactor type, engine overhaul, alpha→beta). Rare.
  - **Y** a **major change or a genuinely new capability** — something that did not exist
    before and that you would list on the Roadmap. **Resets Z to 0.**
  - **Z** everything else — **including player-facing changes and fixes**, as long as they
    improve something the sim already did.

  **Y IS FOR NEW THINGS, NOT FOR VISIBLE THINGS** *(OWNER DIRECTIVE, 2026-07-31: "I think we
  should have the y part of the change number be for major changes or feature additions in
  order to reduce the change number blowup. Z is for smaller changes and fixes even if they
  are player facing.")*. This rule used to read "**Y** — a new player-facing feature", which
  caught nearly every release, because almost everything here is player-facing eventually.
  Measured: the version went **1.2.0 → 1.11.0 in eight days**, and the owner then asked
  whether to roll it back (recommended against — the runaway was the *rule*, not the number;
  see `CHANGELOG.md` 2026-07-31). **The operative test: could you add it to the Roadmap as a
  line item?** New system, new scenario, new mode, new page → **Y**. Better/clearer/fixed
  version of something already there → **Z**, however visible it is.

  **Do not trust a version written here** — read the top entry of `changelog.html` and
  `site/release.js`, which must always agree with each other. (This line said `1.6.1` while
  the site was on `1.8.2`.) `run_release.js` gates that agreement but explicitly **not** the
  digit choice: which digit fits is judgement and is not parseable.
- **The entry** — add a new `<article class="log-entry">` at the TOP (newest-first):
  the **version** (`<span class="log-ver mono">Alpha X.Y.Z</span>`), the **date**
  (visible text *and* `datetime="YYYY-MM-DD"`), and a brief **player-facing** summary.
  **Style: concise and factual** — one line per change, lead with the change, no marketing
  or filler. Copy the template in the file's `ADDING AN ENTRY` comment.
- **BE CONCISE, and that is a CAP** *(OWNER DIRECTIVE, 2026-08-04: "Update tracking
  summaries/lists should be concise.")*. **At most 8 bullets per entry, one line each**
  *(the number is my operational reading, not the owner's — the directive is the brevity)*.
  **Aggregate, do not enumerate**: one line for a system's worth of work, not one per commit.
  The site entry is **not** derived one-to-one from `CHANGELOG.md`, which is dense on purpose
  — a single `[Unreleased]` item there runs 30 lines, and copying that shape here is the
  failure this bullet exists to stop. Over 8 lines' worth: group by system and summarise.
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

- **The educational goal is PLANT DYNAMICS** *(OWNER, 2026-08-02: "The point of the sim is in
  the name. I want to teach people plant dynamics. They should learn the dynamics between the
  different components.")*, with **procedure a second goal, not a subordinate one**. The six
  Tier A couplings and the two routes a feature can take to educational credit are
  `Blueprint/DESIGN_CRITERIA.md` §6 — binding, and the thing Q2 is scored against.
- **Instruments vs truth is a MODELLING rule (HR1), NOT the premise.** Gauges, alarms and
  automatic protection read *instrumented* values (lag, noise, possible failure); true state
  is an explicit diagnostic overlay only; never soften the gap. But **instrument deception is
  deliberately not a headline objective** *(OWNER, 2026-08-02: "I don't want to focus on
  instruments lying. It will come up in failure scenarios but I dont know if it should be a
  major focus."; and OWNER DIRECTIVE, 2026-08-03: "THR STATED PREMIS IS NOT INSTRUMENT VS
  TRUTH THE PREMIS IS TO TEACH PLANT DYNAMICS!!! We must purge the idea of the instruments vs
  truth premise from all documents.")* — it is a Tier C payoff, because you cannot perceive a
  lying instrument without already knowing what
  the plant should be doing. HR1 is unaffected and stays exactly as it is; what is retired is
  the framing that made deception *the point*.
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
