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
>
> **The shape** *(OWNER RULING, 2026-08-06: "Go with your recommendation." — given after
> "Should we add word limits? Wouldn't it hamstring you sometimes?", on the recommendation that
> only ONE of three proposed caps should be a hard number)*. **One number, two habits.**
> - **A hard cap where length is the harm: `CLAUDE.md` ≤ 15,000 words**, gated by
>   `test/run_doc_budget.js`. This file is paid for on every turn by every agent, which no other
>   document is. It hit **42,065** words under its own "Keep it SHORT" heading, with a single
>   physical line of 5,310, because the caps lived in prose inside the file they governed.
>   **When it binds, CUT — do not raise the number**; the history belongs in `TUNING_LOG`.
> - **A chat DEFAULT, not a cap: lead with the answer in ~150 words.** Expand when he asks, or
>   when a table of measurements *is* the answer — a 30-row A/B is not verbosity.
> - **Write-ups get no word limit — they get a content rule:** don't restate what the diff shows;
>   record the trap and the numbers that prove it. Length then falls out.
>
> **Why not three caps** (the reasoning, so it is not re-litigated): a word limit on write-ups
> would forbid the worked A/B that makes a trap believable — #363's lesson is worthless without
> the 15 °F number that disproved the filed symptom — and HR12 would then be unsatisfiable. Caps
> are also a proxy that an honest writer games without noticing, by compressing prose or splitting
> one entry into two. The gate-baselines blob was not bad because it was 21,000 words; it was bad
> because it duplicated a machine-readable authority.

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
>
> **RE-ISSUED, because the rule above was not enough** *(OWNER DIRECTIVE, 2026-08-14: "From now on,
> whenever you need a ruling, tell me what you need me to decide, my options and your
> recommendation. I'm tired of having to ask every time.")*. **The failure mode is specific and it
> is NOT refusing to recommend — it is naming a blocker without the decision attached.** Writing
> *"blocked on your ruling"* or *"needs your call"* in a status line, a STILL OUTSTANDING block or
> an issue comment, and leaving the options in a document he has to go find, makes him ask. It
> made him ask twice in one session against a rule already a fortnight old.
>
> **Every time you say a thing is blocked on him, the decision travels WITH it, in that message:**
> what he is deciding · the options · your recommendation and why. **No exceptions for brevity** —
> if it is worth telling him he is blocking something, it is worth telling him what to do about it.
> A pointer to where the options are written is not the options.

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
> in one working directory overwrite each other's files and sweep each other's work into the
> wrong commit — it happened on 2026-07-29 and cost a set of manual edits their attribution. A
> **branch isolates nothing**; only a separate working directory does. **`Blueprint/LANES.md` is
> the full protocol** — the detection's two blind spots, the merge procedure, the audit lane, and
> the worked failure behind each rule below. What follows is only what binds.
>
> | Working tree | Branch | |
> |---|---|---|
> | `C:\grok_build\Reactor_Dynamics` | `develop` | the main working branch — use this unless it is taken |
> | `C:\grok_build\RD_workbench` | `workbench` | overflow lane 1 — a NORMAL lane, loads this file |
> | `C:\grok_build\RD_backshop` | `backshop` | overflow lane 2 — a NORMAL lane, loads this file |
> | `C:\grok_build\RD_Audit` | *(none — detached)* | **the AUDIT LANE.** Not a work lane, do not commit from it — `LANES.md` §8, `Blueprint/AUDIT_CHARTER.md` |
>
> - **First thing in a session, check ALL trees** — a `SessionStart` hook does it for you
>   (`tools/hook_lane_status.js`, #343) and **reports without deciding**; run it by hand if it
>   did not fire. **"COULD NOT CHECK" is not "clear."**
>   ```
>   git worktree list
>   git -C C:/grok_build/Reactor_Dynamics status --short && git log develop   -1 --format='%h %cr'
>   git -C C:/grok_build/RD_workbench   status --short && git log workbench -1 --format='%h %cr'
>   git -C C:/grok_build/RD_backshop    status --short && git log backshop  -1 --format='%h %cr'
>   gh issue list --repo TH462/Reactor-Dynamics --search 'label:status-wip-develop,status-wip-workbench,status-wip-backshop'
>   ```
>   **The last line is the only one that is not a guess** *(OWNER DIRECTIVE, 2026-08-04: "Since
>   that's done add an in process tag that shows which worktree it's being worked on.")* — a lane
>   tag is an agent SAYING where it is. **Tag your issue when you start, clear it when you stop**
>   (full rule under *Issue tracking*). Run both: an agent can work without touching an issue.
>   **When the tag and the sweep disagree, the TAG wins.** The sweep cannot see an agent between
>   commits, and unmerged commits on an overflow lane are not occupancy — `LANES.md` §2, which
>   also has the `--search`-not-`--label` trap that made this query return 0 for months.
>   **Re-check before your first commit.**
> - **On a positive, WARN AND ASK — do not move on your own** *(OWNER RULING, 2026-07-29: "Maybe
>   it shouldn't be automatic. The agent should warn the user and ask if they should use
>   workbench.")*. The detection misfires both ways and only the owner can tell the cases apart.
>   Investigating in place is fine; **editing, probe files and commits are not**. Absent a reply,
>   stay read-only and say what you are waiting on — the heuristic never gets an action.
> - **NEVER MERGE INTO `develop` UNLESS THE OWNER SAYS SO** *(OWNER DIRECTIVE, 2026-07-31: "We
>   need a rule to never merge unless I say so. Develop was being worked")*. Applies to
>   fast-forwards and anything else that moves `develop`. A clean `git status` is not permission.
>   "Committed on the lane, gated, waiting" is the correct end state.
> - **PWR2 (#479) HAS A STANDING HOLD ON TOP OF THAT RULE** *(OWNER DIRECTIVE, 2026-08-14: "Do not
>   merge until I explicitly tell you to. We are not going to merge until the new physics have been
>   finished, tested and validated.")*. **The bar is the whole engine — finished, tested AND
>   validated — not a green lane and not a finished layer.** Do not propose a merge at each
>   milestone; do not carve out "just the docs" or "just the manual fix" (asked and declined
>   2026-08-14). The lane accumulating commits is the INTENDED state, so treat conflict management,
>   not merging, as the maintenance job.
> - **The lanes are LOCAL. Never `git push origin workbench` / `backshop`** *(OWNER DIRECTIVE,
>   2026-07-31: "I don't want the workbench or backshop trees pushed to gh. Gh should only have
>   main and develop.")*. The repo is public and a pushed lane also builds a Vercel preview site.
> - **Starting on an overflow lane: `git merge --ff-only develop`, and when it refuses do a real
>   `git merge develop`.** Guaranteed conflicts, all newest-at-top: `CHANGELOG.md`,
>   `Diagnostic/TUNING_LOG.md`, `Blueprint/BUILD_DECISIONS.md`, and the `BASELINES` map in
>   `test/run_all.js` — keep both sides, then **re-run `run_all`**, because a mechanical BASELINES
>   resolution can take the wrong number silently.
> - **`Manuals/` is on that list and is the DANGEROUS one**: those four conflict LOUDLY, a manual
>   chapter is edited in the MIDDLE by both lanes and resolves in one lane's favour **saying
>   nothing** — a 2026-08-03 merge dropped a whole `§5.5` while the digests re-sealed around it.
>   `run_manual_rev` now has a content canary, but **it only sees what a revision row NAMES**, so
>   write rows chapter-qualified with a `§`, and after any `Manuals/` merge grep the chapter for
>   the thing you wrote. `LANES.md` §6.
> - **Your session-log heading names your LANE: `YYYY-MM-DD-<lane>-<letter>`**, `-a` first, never
>   bare — `test/run_session_labels.js` gates it; `LANES.md` §7 for why.
> - A new tree comes from `git worktree add <path> <branch>`, and needs `node_modules` junctioned
>   from the primary tree plus an `inbox/` directory. Commit to **your own branch**.

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
> authored content → that content's gates. **Content never votes on physics** — and content
> CHURN is never a consideration either *(OWNER DIRECTIVE, 2026-08-07: "Documentation and
> gameplay always follow the model/physics, not the other way around.")*: the cost of
> re-authoring manuals, missions or checklists is not an input to a physics decision. When a
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
| **Work out which lane to use, or merge one** | **`Blueprint/LANES.md`** — the occupancy check's two blind spots, warn-and-ask, the merge-conflict list and the `Manuals/` silent-drop case. The block at the top of this file is only what binds. |
| **Look up a trap that used to be in this file** | **`Blueprint/TRAPS.md`** — bullets evicted from the standing list under its 25-cap, plus the criterion for which ones go. |
| **Run an independent audit slice (#221)** | **`Blueprint/AUDIT_CHARTER.md`** — the whole file is *your* (primed) document: the lane, the prep and the close-out. The auditor's own rules are **`Blueprint/AUDITOR_ORIENTATION.md`**, deployed to `C:\grok_build\RD_Audit\CLAUDE.md` by `node tools/audit_deploy.js`; do not restate them anywhere else. Verify with `node tools/audit_preflight.js <slice>` (eight checks, exit 2 naming the cause; it launches nothing). **The launch is a fresh session started in `C:\grok_build\RD_Audit` itself — not in its `tree/`**, which would silently get the repo's settings and no auditor orientation. **If you are reading THIS file auto-loaded, you are primed and cannot be the auditor** — prep the slice per §4 and stop; do not read the slice's code "to help". Preflight proves the config, not the session: the auditor's first turn must state on the slice issue whether CLAUDE.md was auto-loaded *without it reading the file*. |
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

_Last updated: **2026-08-28**._

**Where the PWR is.** `run_all` is **94 runners, all at baseline** — read `BASELINES`, never a
number written here. The PWR is the only active plant and is feature-complete through Mode 5 ↔
Mode 1 on integrated physics: engines, control, service, instructor and the board are built; the
#297 audit's build wave and the #221 audit slices are landed. **What is open, in one line each:**

**Do not read the list below as the issue tracker** — `gh issue list --state open` is the
authority and this is a summary that ages. Measured 2026-08-10: five entries here described
#386, #425, #385, #418 and #419 as open-on-owner-review when all five were **closed**, and two
of them had been rewritten from the stale text hours earlier by an agent who compressed without
re-querying. Run the query.

- **#408** — the accident-inventory clock umbrella. Open: the SGTR/seal amendment rows (evidence
  mini-pass; the declared ~7,500 gal makes absolute-size components ~5–6× fractionally bigger
  than the power-scaled rows) and the wave-3 mission items, the tag+defend "quiet night" story
  the beat graph cannot express (#416). Wave 1's re-clock and the relief sizing are landed.
- **#436 — the control-room rework, BUILT to its content gates** (2026-08-10/11), children
  #437–#446 landed bar two. The chart is one lane per indication with a shared cursor and an
  event ribbon; `ui/test_panel/lane_reference.html` is the golden artifact and measures itself —
  **change it first, re-measure, then port**. Open: **#441** (needs the rung authoring pass),
  **#446** (deferred by ruling), **#449** (three steady-state indicated-vs-true disagreements the
  merged list surfaced, 20–400× larger than instrument lag).
- **Built, waiting on review or a close** — **#458** (shutdown cooling and low-head injection are
  the same pumps: the ALIGN is refused while SI runs — *(OWNER RULING, 2026-08-12: "A'")*. It is
  **not** a plant interlock and the code/manual/message all say so; declared `Manuals/12` §12.20),
  #431 (bug-report recorder, schema 1.1), #433, #429, #399, #398, #397. **Two OWNER actions are
  still owed on the finished Cloudflare migration**: delete the Vercel project, revoke its token.
- **#479 PWR2** — Layers 0–5 + core damage + protection + **the pressurizer through stage 2c**
  (ruled 2026-08-18 "Option 1") — **MERGED INTO `develop` 2026-08-21** *(OWNER DIRECTIVE,
  2026-08-21: "Full merge and push. Don't publish to main yet.")* — merge `b4122a7`, 86 runners
  at baseline; the standing no-merge hold above is SPENT (its bar was the merge, which the owner
  ordered; `main` still waits). The owner's first live PWR2 session (telemetry, 2026-08-21) filed
  and fixed #501–#504; the free-play IC quirk is CLOSED (#502, §65: the isothermal boot retired —
  a settled start no longer rings 100→76.6 %). The #488 audit adjudicated and closed; #486/#487
  resolved; **the plant settles at its
  design point** (2226–2238 psia, 45 °F core subcooling) and **the TMI level deception is
  emergent physics** (`PWR2_VALIDATION.md` §41–46: level control, stuck PORV + block valve +
  tailpipe, 87 % high-level trip via P-7, aux spray). The two-h stratification is DEFERRED
  and the §42 criterion RULED A *(OWNER RULING, 2026-08-19: "Defer. A.")* — the steam dump
  control layer is built and **criterion A is met for the sourced reason** (C-7 keeps the dumps
  shut on dispatch; power monotone, rods MANUAL — §47). The ADV rung is built (§48). **PWR2 is
  PLAYABLE (ruled "A", 2026-08-19): `test_pwr2.html` + the `pwr2_engine` facade** — dev channel
  only, true values declared, gated by `run_pwr2_engine` (14 checks / 8 mutations; it caught the
  scram-bypasses-RPS defect and filed #499 on arrival — `PWR2_VALIDATION.md` §49). P-9 (turbine trip
  = reactor trip above it, both sourced values), the #499 beyond-model guards and the
  DELAYED-data sourcing are all LANDED (§50–52). **Everything since is recorded in `PWR2_VALIDATION.md` §53–§97 — read the sections, not this line**, which is why the roll-call that used to sit here is gone. Still open out of it: **#507**'s casualty menu stands at 22 honest rows (21 at wave 10, +`anticipatory_trip_failure` at #515) with Section F closed, and **#510** batches 1–4 landed leaving five LOW harness items. **#523 (owner rulings 2026-08-26 "Flip now, track the gaps" / "Strip it at build time"): PWR2 IS THE PLANT THE SITE RUNS (§94)** — every link and `/sim` carry `?engine=pwr2`, and a **public** build contains no retired engine at all (six tags + 544,663 bytes pruned by `site/build_site.js`; `make_portable` always). The strip is CHANNEL-GATED so the PREVIEW site keeps it, because the guided content is authored against it and `freePlayOnly` stays. `pwr_config.js`/`pwr_instruments.js` are NOT the old engine and ship everywhere. Two of the three pre-replacement gaps are now #531 (R8) and #525 (mission compatibility). Still owed: delta-T lead/lag + K5 (COLR), channel redundancy, the ESF arm display, Mode 5 proper (#524), stuck_rod_on_scram, the steam-line-break rows + auto isolation signal (the MSIV itself is BUILT, §80).
  **#514 (2026-08-25): the engine steps 12.5× faster** (1,090 → ~85 µs; the vtable wired into
  every module, `T_from_h`/`P_sat_T` tabulated, two warm starts, Tavg once) — held by the new
  `run_pwr2_perf` ratio gate (≤ 8× the old engine, measures 4.1×); the vtable builds on first
  use (was 0.5 s at every page load); **shell.html no longer loads RBMK/BWR** (~308 KB,
  owner-ruled — dev route `test_rbmk.html`/`test_bwr.html`, `verify_e2e_ui` PWR-only).
  **#513 (2026-08-25): the aggregate gate at 7m19s** (was ~19 min; sequential 2,814 → ~2,100 s):
  mutation-replay scoping ported to 5 more runners (`grp:` + a scoped-clean-pass preflight that
  caught a latent hollow catch in cvcs), the vtable cache-keep across replays, NODE_COMPILE_CACHE
  for all 91 children, `run_behavior` split in thirds + `run_campaign` by plant (owner-ruled),
  `run_pwr2_ab` → `measure_pwr2_ab` (out of the gate, owner-ruled), `verify_e2e_ui` predicate
  waits, every `secs:` hint re-recorded. The pwr campaign missions then split in two as well
  *(OWNER RULING, 2026-08-25: "I approve the pwr campaign mission split.")* — the 257 s part A
  had become the gate's wall.
- **#534 — the PWR2 adversarial bug hunt umbrella: 47 confirmed defects** (28 high, 18 medium,
  1 low), filed 2026-08-27 as #535–#566. Report only; no simulator code was changed by the
  sweep. It names TWO systemic patterns. **The second is CLOSED (#557/#556/#561, 2026-08-27)**
  — the board was still calibrated to the retired engine; the plant now publishes its AFW
  rating, its pressurizer-level trip rows and its delta-T setpoint equation, and the board
  reads them. **The FIRST is CLOSED too** (#546/#547, §98): PWR2 kept the retired plant's failure
  table BY REFERENCE and seven rows were `command_override` — the kernel's licence to drop or
  rewrite a command, in the old plant's action names; the engine already modelled all seven, so
  `getProtectionConfig` now hands over the menu fields only, and the new `run_pwr2_kernel` holds
  it (1,408 row×action pairs: 18 divergences → 6, all six the engine refusing out loud).
  **The save/rewind/restore cluster is CLOSED** (#553/#554/#555/#548/#563 item 3,
  2026-08-27, `PWR2_VALIDATION` §95), and so is **#539** (§96 — the rated steam scale is frozen
  across all four presets; Mode 4's feed train and code safeties were multiplied by nought) and
  **#542** (§97 — those safeties are now the STAGGERED bank Ginna sources: one valve at 1085 psig,
  three at 1140, and no more parking 21 psi under its own setpoint).
  **The STEAM-GENERATOR cluster is CLOSED** (#540/#549/#541/#562, §99): the sink's two walls
  each hold a MASS and an ENERGY limiter now, aux feed has the flow control valves the contract
  had been describing all along, and its STOP secures BOTH pumps. **The TURBINE cluster too**
  (#558/#551/#559/#567/#560, §100): nothing un-latched the turbine, so one scram ended generation
  for the session; it LATCHES now and refuses BY NAME instead of being overwritten. A refused
  board press also reaches the screen (#558 is the mechanism behind every dead-button report), no
  live control can only throw, and a lost condenser stops reading better than a healthy one.
  **#570** then gated the prose/plant seam both clusters came through — two new runners, §101.
  **#545 CLOSED** (§102): the rods were the last trip consumer on the latch's rising EDGE, so
  holding WITHDRAW after a scram took the core back to 61.18 % with SCRAMMED lit everywhere —
  level-held now, both banks both ways [sourced: open trip breakers cut CRDM power], making an
  ATWS a boration problem. Rest of #535–#566 untouched; `gh issue list` is the authority.
- **RBMK and BWR** — on hold, and the source of most remaining backlog. Do not touch.

**The manual set's revision number does not advance until a RELEASE** *(OWNER DIRECTIVE,
2026-08-06: "The revision number only matters during a release to the website. Revision numbers
should never go up until a release happens.")*. **Read the top row of
`Manuals/00_REVISION_HISTORY.md`, never a number written here** — this line said "Rev 14 …
pending Rev 15" while that table stood at a **pending Rev 17**, which is the same rot as the
gate baselines. The newest row is the pending one and it extends until the next release.
**Do not open a new revision row for a manual edit; extend the pending row.** That is
also the resolution for a revision-number collision, which is what two lanes editing the manuals
produce — Rev 13 shipped carrying thirteen lettered items from two lanes for exactly that reason.

**Recent themes** — **max 5 bullets, newest first; adding one means deleting the oldest.** A
reading aid, not a record: the full entry is in `Diagnostic/TUNING_LOG.md`, and anything that is
standing procedure rather than news belongs in the list below. **Evicting one: RESCUE THE TRAP
FIRST** — ask what in it would still burn someone in a month, move that to the standing list as
ONE line, drop the rest. **A bullet is ~80 words.** (Measured 2026-08-06: the list was running
7 bullets averaging 500 words, two of them duplicating traps already rescued below.)

- **An ACCEPTED command the next step overwrites is worse than a missing one; a MODULE
  HEADER is an inherited claim** (2026-08-27, #551/#559/#567/#558/#570, §100–101). Nothing
  un-latched PWR2's turbine — 896 combinations — so one scram ended generation for the
  session, and the facade lever alone would have been silently undone (six level-holds). It
  REFUSES BY NAME now. Same day, #562 called a protection half "unbuilt" off a module header
  without grepping the engine, which had built it — so *"prove it by injection"* now covers
  **unbuilt**, not just untested.
- **The SPECIFICATION can be the stale second copy, and that is worse than a stale constant**
  (2026-08-27, #562/#549/#541/#540, §99). `CONTEXT.md` defined AFW flow as *"capacity ×
  throttle × level hold"*, the Indications tab told the player the feed was level-controlled,
  and the manual documented the THROTTLE box and `set_afw_flow {pct}` — while PWR2 had no
  throttle, no hold, a readback hard-coded to the run lamp, and a `set_afw_flow` that ignored
  `pct` and **re-started the pump**. Measured: **861.7 %** of nominal SG inventory in five
  hours. A spec is what you check code against, so nothing could catch it.
- **An engine-owned latch the kernel cannot see makes every reset a permanent no-op — and
  the seal-ins it guards read as dead buttons** (2026-08-24, #509 §79). PWR2's automatic
  trips never set the kernel's `rps.scrammed`, so `resetRps` returned null FOR EVER and
  ECCS/AFW/feed stops were ACCEPTED then re-asserted next step, silently — the #506
  dead-button class one layer deeper. An accepted-then-overwritten command must REFUSE at
  the layer that re-asserts it. Same seam: the kernel judged a good reset against the
  facade's previous-step snapshot and told the operator "rods not inserted".
- **A constant that is RIGHT for one plant is a second copy, and it goes wrong silently the
  day the plant changes** (2026-08-27, #557/#556/#561). Three board indications were still the
  retired engine's: the AFW gauge read **7.40×** the delivered flow, the pressurizer tile drew
  its scram edge at 100 % on a plant that trips at **87 %** and a second red band at 12 % for a
  trip it does not carry, and the DNB gauge went red **356 s** before the trip with 13.70 margin
  points standing. Fix: the plant publishes the number, the consumer reads it — an engine-key
  branch would have re-armed the same rot. Two of the three were invisible because the board is
  engine-agnostic by design and nothing cross-checked a RENDERED value against the plant.
- **A multi-part fix whose parts are EACH SUFFICIENT makes its own mutations go blind — and the
  bullet warning of it is no protection** (2026-08-28, #545 §102). The rods were the one reactor
  trip consumer wired to the latch's rising EDGE, so holding WITHDRAW after a scram took the core
  back to **61.18 %** with SCRAMMED lit on truth, instrument and kernel at once and the flux trip
  asserted 751.6 s doing nothing. The fix is a level hold AND a door that refuses by name; with the
  door refusing, the demand never gets set, so deleting the hold moved nothing and `run_pwr2_engine`
  came back **59/60**. Reproduced by an agent who had quoted the #295 rule three lines above.
  **Plant the demand PAST the half you are not testing.**
**Standing procedure — not part of the rotation above; these do not expire.** One trap per entry.
**MAX 25 BULLETS** *(OWNER RULING, 2026-08-10: selected "Cap at 25, evict to TRAPS.md" from
options I wrote — a selection, not verbatim words)*, gated by `test/run_doc_budget.js`. Adding
one means evicting one to **`Blueprint/TRAPS.md`**, and the criterion is written there: **move
what a GATE already catches**, keep what nothing can tell you. This list was the only unbounded
thing left in the file and it grew about a bullet a session.

- **A pre-declared reject criterion can outlive its measurement** (rescued from the #394
  limit-cycle bullet on eviction, 2026-08-10): #378's was void the next day. Re-measure the
  criterion, not just the result, before you let it reject anything.
- **A bracketed TEMPLATE placeholder cites like a number** (rescued from the #380 bullet on
  eviction, 2026-08-09): NUREG-1431's "~30–32 %" SG lo-lo survived two evidence passes because
  both verdicted the mechanism and inherited the figure. Ginna, the anchor plant, says 17 %.
- **An approved plan's sizing target can be measured on a RETIRED scale** (rescued from the
  #385 bullet on eviction, 2026-08-09): its flash term predated the #408 slider re-map, so it
  measured unnecessary and was never built. Re-derive sizing from the Q0, not the plan.

- **Before you declare anything UNSOURCED, run `node tools/find_source.js <regex>`.** The corpus is
  three lanes' `inbox/sources` and they cannot see each other, so a one-lane grep has now shipped
  two wrong claims — #315 §6 (an OTΔT argument built and reverted while the primary sat in another
  lane) and `DESIGN_COMPANION` §8.34, which declared *"no document in any lane's corpus"* two days
  after the refuting document landed in develop's. It exits **1** on a genuine zero, so "not in the
  corpus" is a command's verdict rather than your claim.
- **A claim about COVERAGE OR ABOUT WHAT IS BUILT is an unmeasured claim — prove it by injection**
  *(my call, 2026-07-31; broadened from tests to the PLANT 2026-08-27, #570)*. HR12 binds
  plant-dynamics claims; the class that keeps going wrong is the neighbouring one — *"X is
  untested"*, *"the gate covers Y"*, **and *"X is not built"***. **To prove something is untested or
  unbuilt, BREAK IT AND SEE WHAT NOTICES.** That is how #286 found five inert automation channels
  behind a green 24/24 — and skipping it is how #562 reported a protection half as newly built when
  the engine had carried it all along (deleting the one line it "lacked" would have changed nothing;
  deleting the FWI line's `tb.tripped` changes everything). **Inherited claims are the risky ones,
  and A MODULE HEADER IS ONE**: a sentence from a review, an issue, a file header or this file has
  usually aged, and repeating it in your own voice launders it into a fresh assertion. **Grep for
  the EFFECT, never the name you expected it to have.**
- **Verify a claim before you act on it.** Roughly half the issues touched on 2026-07-27 were stale
  or mis-framed. An issue's own investigation comment is a claim like any other, and this repo
  merges faster than one ages well (#326 — both comments were correct when written and wrong hours
  later). Re-measure on the tree you are standing in, including your own lane's. **A filed root
  cause repeated in four documents was still never re-measured** (rescued from the #403/#433
  bullet on eviction, 2026-08-12): "MSLI flow reads 0" came from watching the turbine-only
  variable, and repetition is not corroboration — neither is a sourced number being the WHOLE
  source ("600 psig" was adopted and "(Rate sensitive)" dropped from the same cell).
- **Declare a simplification only after you have MEASURED the regime it lives in** (rescued from
  the #347 themes bullet on eviction, 2026-08-07). "Optimistic" and "defeats the relief ladder"
  look identical from outside: spray-at-solid was declared harmless and held pressure 164 psi
  under the code safeties on the one path #346 never exercised. Corollary from the same change —
  the TMI-2 securing beat sits BEFORE the decision, on its historical cue, and the decision is
  RESTORE injection or not; re-litigating that order re-breaks nine missions.
- **A passing check can be HOLLOW — the failure modes seen here.** A `range()` call on a BOOLEAN
  returns NaN, so `!range(x).max` is `!NaN`, true always (TR-17, shipped #392, could never fail). A
  check asserting an ABSENCE can be pinning a NON-EVENT (`run_reachability` exists for the
  instrument half). `h.range()` spans the WHOLE run, the wrong window for a loss on an event that
  recovers — take the ends and assert the SPAN. A gate that iterates a hand-maintained MAP tests
  the map (`verify_manual_follow` covered 17 of 45 steps at a confident PASS). A SOURCE SCAN for a
  rendered string cannot tell you the string is REACHABLE — `/\(partial\)/` passed green on
  `(false ? ' (partial)' : '')` (#485); make it a function and test the claim, don't spell it. And
  a term that is
  an IDENTITY in the regime you test in is a term nothing tests — 44 green probes agreed with a
  leg-split formula that computed 0.0 °F on a scrammed core. **A check can SAMPLE THE DEFECT and
  call it the claim**: "flow RAMPS, it does not step" took both samples BELOW the setpoint, where
  the mis-anchored ramp lived — certifying a 60 %-of-rated step for as long as it existed (#542). **A DEGENERATE LATCH reads exactly
  like a working feature** (rescued from the #403/#433 bullet on eviction, 2026-08-12): a no-dt
  harness left `held_within_s` permanently satisfied (age `0 <= 60` for ever) and three green
  probes certified an isolation that never once fired. **And the OBSERVER is where
  the defect can be, invisible to any source read** (rescued from the #436 bullet on eviction,
  2026-08-26): a paired list comparing FORMATTED strings lit five rows on a healthy plant
  (`-0.0` vs `0.0`), a recorder emitted 46 `alarm_clear` events at t=0, and a lane-height check
  measuring `plot ÷ lanes` certified 56 px while 38 px was drawn. **`isFinite(null)` is TRUE and
  `Number.isFinite` is used NOWHERE in this tree** — a JSON round trip writes NaN out as null,
  so a dead channel comes back a plausible ZERO that every guard in `engines/` accepts (#555;
  fix at the save boundary, not by sweeping ~20 guards). **A row's gate must assert the
  EFFECT — flow, area, the landed value — never the WRITE**, or a DARK WIRE (a driver
  documented, read, and never passed; a field read off a channel nothing publishes) reads as a
  working feature: #507 wave 6 shipped three that way, #540 shipped a fourth for six days.
  **And a MUTATION goes blind
  when the defect it needs is FIXED, or when a refactor moves the line its anchor names**
  (rescued from the #501–#504 bullet on eviction, 2026-08-27): settling the startup ring sent
  three caught mutations blind; rewriting four protection gates orphaned four anchors. Fix a
  defect, then re-run the INJECTIONS.
- **A tolerance band is a claim that what it excludes is harmless — measure that** (rescued
  from the #348 themes bullet on eviction, 2026-08-07). CA-10's 1-point "coupling lag" band
  hid an interlock with no reset differential chattering at 35 % duty.
- **Adjudicate a physics change's red probes ONE AT A TIME** (rescued from the #364/#365
  themes bullet on eviction, 2026-08-08). Batch-judging 11 reds as "the retune moved things"
  would have hidden two real defects — each red is the fix working, a stale fixture, or a new
  defect, and only per-probe adjudication (HR10) tells which.
- **Know which LAYER owns the effect you are asserting** (table below). A multi-part fix whose
  parts are each sufficient makes a one-sided injection lie — revert BOTH to reproduce (#295).
  Neutering an automation channel: blank the ENGAGE direction ONLY, or the plant sits in the IC's
  own AUTO and the probe passes against a dead channel (#286).
- **A de-energization written into the operator's DEMAND heals itself on the next button press.**
  Take away the delivered power/flow/head; leave the selector and the latched demand where the
  operator put them (#200, #329, #332). The `afw_pump_running` vs `afw_flow_normalized` split is
  the house idiom. Relatedly `true_state.ac_available` is the question every motor load must ask —
  today exactly `!station_blackout`, and the point is that the question has a NAME; a plain LOOP
  KEEPS it, and **AFW carries a do-not-gate note** (WTSM 5.7.5).
- **`power_pct` is FISSION power, not core thermal power** — total is `true_state.core_heat_pct`.
  Equal by construction at steady power, which is why no gate caught it; seconds into a LOCA it is
  11.0 MWt against 21.0 MWt of decay heat. Anything reading `power_pct` as core heat is wrong from
  the moment the rods drop. **Decimals belong to the UNIT**: `toFixed(0)` on MPa printed three
  different pressures as "15 MPa" and collapsed the loop split that panel exists to show.
- **The pressurizer's level constants are ONE object** — `level_per_mass` (776), `level_per_void`
  (375.33), `level_per_tavg` (1.62); the pressure surge reads the same geometry (#337) and since
  #385 the NODE's credit does too (`level_per_mass_surplus` retired at #365). The TMI deception
  is a DIFFERENCE between two of them, so moving one inverts it. **Touch one, re-solve the set.**
  And a SINGLE TERM of a coupled pressure/inventory regime is worse than none — three independent
  measurements say so (#346, `Manuals/12` §12.4c, the #384 attempt).
- **Measure a limit's INCIDENCE before trusting a green suite about it** (#362, rescued
  2026-08-08): the `levelBase` clip bound on 95.7 % of loss-of-heat-sink samples, 0.0 % of every
  other IC — removing it reddened nothing because no probe stood where it bound. Corollary:
  **this plant goes solid at an inventory DEFICIT** (thermal expansion), not overfilled.
- **Natural circulation: the SHAPE is sourced (W ∝ Q^⅓), the SCALE is this plant's** and is fitted
  — do not quote our percentage as a real-plant figure (`Manuals/12` §12.4). The board's dash-speed
  ladder needs a step BELOW that flow or a blackout paints a STOPPED loop; #364 moved it under the
  floor once already.
- **Protection cadence is written down TWICE** — `PROTECTION_DT` 0.1 s and an independent copy in
  `test/ops_harness.js`. Move one and not the other and the ops suites certify a plant no player
  can produce. 1× is byte-identical by construction, which is why a divergence hides at the speed
  you are most likely to test at.
- **A sourced anchor can be the WRONG FORM of the measurement for your model** (rescued from the
  #386 hydrogen bullet on eviction, 2026-08-11): GEND-061's burn ΔP is real, and the adiabatic
  form vs the measured 27.5 psi form decides whether the drained family lands over or under the
  ruled 30 psig hi-hi. Having the document is not having the number.
- **"Block SI" is THREE actions on a cooldown** and the procedure named one: `lo_press` and
  `si_trip` both watch pressure downward and neither auto-blocks on the way down; both need P-11,
  so the Pressure SP comes down first. **The live checklist NEVER issues `cmd`** — it draws text
  and the instructor grades off `acc`, so `cmd`/`hold`/`ramp` are replay-side only. **Only a rate
  guard can tell a ramp from a staircase.**
- **`pwr_board_data.js` is GENERATED** — never hand-edit it; the round trip is in
  `tools/gen_board_data.js`'s header, and the builder's live state is in browser localStorage, so
  **ask the owner to export**. **A re-export changes PIPE ids**, silently orphaning `PIPE_TEMP`
  and undoing geometry fixes — **run `node test/verify_board_check.js` after any board change**
  (this file twice claimed a green tally while the harness sat at 1 FAILURE). Editing traps: a
  card TITLE is not an item; `DOC_PATCHES.items` is an object literal so a repeated id silently
  replaces the first; `Pump`/`Valve`/`Tee` ports quantise to the 5 px grid; exclude
  `kind: 'component'` tiles from a free-slot scan or the instrument column reads as full.
  **Measure the board, don't eyeball it** — `RD.PwrBoard.ports()` makes an alignment claim a
  subtraction. **Screenshot it** — art overlap is invisible to an item-vs-item scan.
- **An unmeasured claim in PLAYER-FACING COPY is still an unmeasured claim** (rescued from the
  Indications-tab bullet on eviction, 2026-08-17): a "pressurizer mass-only level" row promised
  a TMI divergence that measures 0.0 everywhere, because `pzr_level_pct` is `clip(that,0,100)`
  of the very same number. HR12 does not stop at engine prose.
- **Nothing gates manual prose against the rulings the engine implements** (rescued from the
  #468 bullet on eviction, 2026-08-22): `Manuals/` §5.0 called the 100 °F/hr rate limit
  UNSOURCED four months after it was ruled and shipped to the board. When a ruling lands, grep
  the manual for its subject — no runner will do it for you.
- **A subscriber that reads inside the rAF paint is ONE FRAME LATE, and only a browser
  can see it** (rescued from the #432 themes bullet on eviction, 2026-08-11): the
  recorder's drain sat in the paint and logged **1475 rows in, 35 recorded** — call sites
  all correct to a source scan, and green to a Node gate that hands it the rows itself.
  `drainFine()` is the single `takeFine()` caller and is called synchronously from
  `render()`; keep it there.
- **Provenance matters more than it looks.** Many "owner rulings" here were written by agents, and
  all agent work commits under the owner's name, so git blame proves nothing. A ruling without a
  date and a verbatim owner quote is advisory — `CONTEXT.md` §3. **`test/run_hr3.js` guards HR3;
  `test/run_hardrules.js` guards HR1, HR5 and HR11.**
- **On a board issue, read `git log develop`, not just the lane TAGS.** A tag says someone is
  THERE; the log says what they have already DONE. Four #357 items were worked against a
  convention #350 had already inverted.
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
- **ECCS card UI layout** (contract in `Blueprint/pwr_synoptic_prerequisites.md`), and two
  Mode-5 nice-to-haves: a `plant_mode` text indicator and an explicit `eccs_mode` readout.
  (Campaign ↔ Mode-5 alignment and the Mode-5 controls themselves are **done** — they sat in
  this list marked "done" for a week, which is what a list nobody prunes looks like.)

**Current gate baselines — `BASELINES` in `test/run_all.js` IS the authority. Do not copy
numbers here.** This section carried ~24,000 words of per-runner prose until 2026-08-06 and every
figure in it had rotted: `verify_flags_ui` said 48/48 against a gate that has always scored 42,
`run_otdt` sat at 39 through three commits that took it to 46, `run_contract` appeared **twice
with different numbers**. Run the gate; read the map. The per-change rationale lives in
`Diagnostic/TUNING_LOG.md` and `Blueprint/BUILD_DECISIONS.md`, newest first.

```
node test/run_all.js            # every discovered runner vs BASELINES (~7.5 min, 10-way parallel;
                                #   measured 439 s on 2026-08-25 after #513/#514 — the wall IS
                                #   run_campaign under contention, not the sum)
node test/run_all.js --fast     # skip the 2 slow Playwright gates (similar wall — the floor is
                                #   run_campaign, not the Playwright pair)
node test/run_all.js --jobs=1   # SEQUENTIAL (~35 min) — escape hatch if a runner is
                                #   ever suspected of not being isolated
node test/run_all.js --only run_pwr,run_ops
node test/run_all.js --record   # print observed results as a BASELINES block
```

Four things about it that are procedure, not history:

- **Drift is SYMMETRIC** — a runner scoring *better* than baseline also fails, so a red turning
  green has to be acknowledged (update `BASELINES`, close the issue) rather than silently
  absorbed. Same convention as the strict xfails in `run_meltdown` / `run_behavior`.
- **`run_all` auto-discovers `test/(run|verify)_*.js` and fails on any runner it has no baseline
  for** — add the `BASELINES` entry in the same change as the runner. A gate that is not a
  `run_*.js` is invisible to it: `board_check.html` sat at 1 FAILURE through a lane merge, a green
  CI run and a release before `verify_board_check.js` wrapped it.
- **Per-runner times in a parallel run are CONTENTION times, not costs** (`run_pwr` reads 54 s
  where it takes 22 s alone). The `secs:` hints in `BASELINES` are a longest-first scheduling
  nudge and cannot affect a score or an exit code — do not maintain them like baselines.
- **CI runs the same command on every push and PR to `main`/`develop`**
  (`.github/workflows/gates.yml`; 3-way on 4 cores — 43m31s before #513's cuts, re-measure
  on the next push; this line read "~8 min" while CI stood at 43). **Check it after you push** —
  `gh run list --workflow=gates.yml --limit 3`. It once ran red for **32 consecutive runs** across
  three days, including a release to `main`, because `--fast` still ran a Playwright gate that was
  not marked `slow`. Nobody noticed, which is the argument for a required status check (#191).

**One tracked red, carrying its `note` in `BASELINES`: `run_ops` 59/70** — ops probes are tuning
targets by design. Of the reds, all but one are RBMK/BWR (on hold). The single PWR one is
`ops_cvcs_pzr_drain_rate` (**284.3 s** against `>= 300 s`), a **RULED, ACCEPTED state, not a
regression** *(OWNER RULING, 2026-08-04: "A")*. **It must NOT be re-banded** — the probe exists
for a 2026-07-22 owner request for a drain-rate feel target, and re-banding a target whenever the
plant moves retires it instead of reporting against it. Both options are costed in the probe's
own comment (`test/ops_pwr.js`).

`verify_e2e_ui` carries **1 strict xfail** pinning the manual's missing unit conversion (#111) —
it errors if the manual ever starts converting.
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
node test/run_all.js            # THE AGGREGATE GATE — every discovered runner vs recorded baselines
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

`test/ops_*.js` and `test/*_harness.js` are supporting harnesses. Ops-probe FAILs
are tuning targets, tracked in `Diagnostic/OPS_TUNING_REPORT.md`.
`run_e2e_controls.js` and `run_procedures.js`
are PART OF THE GATE LIST — both drifted red unnoticed once because they weren't
listed (2026-07-19 review). **`run_all.js` discovers `test/run_*.js` and
`test/verify_*.js` automatically and fails on any runner it has no baseline for**, so
a new gate cannot go unlisted again — add it to `BASELINES` when you add the runner.

### MANUAL FIRST, THEN AUTO — the order in which a system gets tested

> *(OWNER DIRECTIVE, 2026-08-12: "Testing of systems should happen without automatic mode first.
> Once proper manual behavior is established we test auto mode. This goes for all systems with an
> auto mode.")*

**Establish that a system behaves correctly with its automatic control OFF before you test it
with the control ON.** Applies to every system with an auto mode — pressure control, feed,
rods, boron, steam dump, ADV, turbine load.

**Why it binds rather than being style.** An automatic controller holds the plant on setpoint,
which is exactly the condition under which a *wrong* mechanism and a *right* one produce the
same board. Measured 2026-08-12: `P_restore_rate_gain` drags pressurizer pressure to the
operator's setpoint whether or not the heaters and spray are in AUTO, so a 30 MWe load change
moved pressure **0 psi** — while the real coupling underneath it moves **+31 psi and −10.7 °F of
subcooling**, which is what the plant does once the term is neutered. Every gate we had asserted
endpoints with the controllers on, so 47 runners and a frozen behaviour catalog all agreed with a
plant whose central pressure coupling was invisible. The owner found it in free play.

**In practice:** a behaviour row that can only be demonstrated with the automation engaged is
testing the automation, not the plant. Write the manual-mode acceptance first; the auto-mode row
then asserts that the controller *holds* what manual proved, which is a different claim.

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
| **shell A/B** (two engines, one command apart) | `run_pwr2_roundtrip` — does a command move anything the player can read back? The control leg IS the test (#570) |
| **full stack** (M4+M5+M6) | `run_procedures_stack`, `run_procedures_chain` (one CONTINUOUS plant across procedures — the seam the per-procedure IC reload cannot see), `run_m5`, `run_m6`/`run_m6ph` (integration halves), `run_m7`, `run_autoctl`, `run_campaign`, `run_checklist`, `run_scenarios`, `run_e2e_controls` |
| **browser** | `verify_e2e_ui`, `verify_manual_follow` (the latter never plays the sim — control-surface reachability only) |
| **static** (source/doc/registry consistency — the plant is never stepped) | `run_hr3`, `run_hardrules`, `run_contract` (resets the engine to read its field list, never runs it), `run_inspect`, `run_flags`, `run_manual_commands` (the manual's command table vs the registries — #570) |

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
- **Scenario / campaign / instructor change** → `run_campaign.js` + `run_campaign_b.js` +
  `run_campaign_c.js` (split #513 — A: structural + most pwr missions, B: rbmk + bwr, C: the
  three HEAVY pwr missions by measured cost, list in run_campaign.js; together they must stay
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
  **one change**, then `run_release` green before the merge. **`Alpha 1.0.0` SHIPPED 2026-08-04**
  *(OWNER DIRECTIVE, 2026-08-04: "The next release will take the program out of pre-Alpha and into
  Alpha and bring back the update tracking page. Update tracking summaries/lists should be
  concise.")*; the next release is an ordinary Platform.Feature.Refinement bump.
- **A RELEASE IS NOT DONE UNTIL A `Production` DEPLOYMENT EXISTS FOR THE RELEASED SHA** *(OWNER,
  2026-08-04: "Let's fix the gap and release.")*. Alpha 1.0.0 merged, tagged and passed CI while
  the live site kept serving the previous release — the only deployment for that commit was a
  **Preview**, and a green *"Vercel — success"* status is satisfied by one. **Run
  `node tools/verify_release_deploy.js`** — Cloudflare-only since 2026-08-10; its header says why
  a hand-written `gh api` query cannot do this, and records the two mirrored failures it has had
  (a half that could never pass, a half that could never fail). **Do not push `develop` until it
  exists** — fast-forwarding it seconds after
  the merge gives two events for one SHA, which is how the production build went missing. From
  outside, a missing deploy and a slow one are indistinguishable for ever, so waiting is never the
  answer. Full step: `release-to-main` skill §5b.

---

## Issue tracking (GitHub) — the owner's preferred workflow

**Open items belong in GitHub issues**, not only in `Diagnostic/` prose. When you find a defect,
a gap, or a deferred decision that outlives the session, file it.

Repo: **`TH462/Reactor-Dynamics`**. `gh` is installed per-user and on the PATH, authed as
`TH462`. On `gh: command not found`, prepend it (mind the space in the path):
`export PATH="$PATH:/c/Users/Tim H/AppData/Local/Programs/gh/bin"`. **`gh auth login` is
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

  **ONE `--label` is fine; THREE are not** — `gh` ANDs repeated `--label`, so the all-lanes
  sweep must be `--search 'label:a,b,c'`. `Blueprint/LANES.md` §2 for what that cost.

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

> **The page is LIVE** *(OWNER DIRECTIVE, 2026-08-04: "The next release will take the program
> out of pre-Alpha and into Alpha and bring back the update tracking page. Update tracking
> summaries/lists should be concise.")*. `Alpha 1.0.0` shipped 2026-08-04; every release since
> is an ordinary bump by the digit rules below. `CHANGELOG.md`'s pre-public sections are
> **`## [Pre-launch 1.x.y]`**, not `Alpha` — they were dev versions, and parsed as released ones
> `1.0.0` sorts under `1.11.0` and `run_release` reddens on newest-first.

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
  are player facing.")*. The old wording, "a new player-facing feature", caught nearly every
  release and took the version **1.2.0 → 1.11.0 in eight days** (`CHANGELOG.md` 2026-07-31).
  **The operative test: could you add it to the Roadmap as a line item?** New system, scenario,
  mode or page → **Y**. Better/clearer/fixed version of something already there → **Z**, however
  visible it is.

  **Do not trust a version written here** — read the top entry of `changelog.html` and
  `site/release.js`, which must always agree with each other. (This line said `1.6.1` while
  the site was on `1.8.2`.) `run_release.js` gates that agreement but explicitly **not** the
  digit choice: which digit fits is judgement and is not parseable.
- **The entry** — add a new `<article class="log-entry">` at the TOP (newest-first):
  the **version** (`<span class="log-ver mono">Alpha X.Y.Z</span>`), the **date**
  (visible text *and* `datetime="YYYY-MM-DD"`), and a brief **player-facing** summary.
  **Style: concise and factual** — one line per change, lead with the change, no marketing
  or filler. Copy the template in the file's `ADDING AN ENTRY` comment.
- **FACTS ONLY, MINIMIZE PROSE** *(OWNER, 2026-08-04: "Just keep to facts in the changelog page.
  Minimize prose.")*. Name the thing that changed and stop. No explaining an absence, no sentence
  that would still read fine if deleted, and **no lead-in paragraphs** — the page's own
  "This log begins with the public launch" line was cut for exactly that. If a line carries no
  fact a player can act on or verify, cut it. `CHANGELOG.md` stays dense; this page stays bare.
- **SIMULATOR CHANGES ONLY — website changes do not go in it** *(OWNER DIRECTIVE, 2026-08-06:
  "Also, don't include website changes in the changelog. The changelog is strictly for
  simulator changes.")*. The page is the player's record of what changed **in the plant they
  operate** — physics, board, controls, procedures, scenarios, and the in-app manuals, which
  ship inside the sim. A change to the surrounding site (a page, its styling, navigation, the
  download plumbing, the changelog page itself) is not a simulator change and gets no entry,
  however visible it is. It still belongs in `CHANGELOG.md`, which is the engineering record
  and unrestricted. **A website-only change ships with NO version bump** — `run_release` forbids
  "bump, no entry" (measured; `TUNING_LOG` 2026-08-09-develop-a).
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

**Running the SITE, as opposed to building it: `C:\grok_build\RD_Ops\`** *(owner, 2026-08-08:
"Set up the folder as store secrets as you recommend.")*. Outside every repo and sibling to the
three worktrees, so every lane reads the same copy and nothing in it can be committed. It holds
`runbook.md` (account/zone/project ids, what is deployed where, how to read the usage data),
`cutover.md` (the Vercel → Cloudflare migration, #413, with live state), saved Analytics Engine
queries, and bug-report bundles pulled from R2 by `node tools/fetch_bug_reports.js` (or the
`read-bug-reports` skill). **Read it before touching the live site** — those identifiers
otherwise exist only in one session's conversation.
**NO SECRETS LIVE THERE**, deliberately: `C:\grok_build\` syncs off-site (`.SynologyWorkingDirectory`),
and every agent reads the folder, so a plaintext credential there is replicated *and* shared.
Tokens go in a user env var (`CLOUDFLARE_API_TOKEN`); wrangler, `gh` and the MCP servers keep
their own OAuth. A credential found there is a defect — move it and revoke the exposed one.

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
- **SPELL OUT EVERY CODE — ALL OF THEM, not a favoured few** *(OWNER DIRECTIVE, 2026-08-14: "I
  don't know what these letter number combos are (L0, D1). Always spell them out."; broadened
  minutes later when a first pass named only two families: "Not just those to, spell out all of
  them.")*. **The test: if a token abbreviates something that HAS a name, write the name the first
  time it appears in anything the owner reads.** That covers the PWR2 build layers (`L0`→**Layer 0,
  water properties**), the five PWR2 design documents (`D1`→**the design spine,
  `PWR2_DESIGN.md`**), the Hard Rules (`HR9`→**Hard Rule 9, the plant is ground truth**), the Tier A
  couplings (`A4`→**level is not inventory, the TMI coupling**), casualty ids (`E09`→**large
  LOCA**), interlocks (`P-11`), probe and finding ids (`CA-15`, `MDS-2`, `F1`), and section refs
  (`§8(2)`→**the stop condition in the design spine §8, item 2**). Agents invent these constantly
  and go blind to them, then put them in decision briefs — so the owner is asked to rule on options
  he cannot parse. **Bare codes are fine only INSIDE a document that defines them, and between
  agents.** Never in chat, an issue body or comment, or a commit message. **Not gateable** — like
  HR12 and the units rule, a green run does not cover it.
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
