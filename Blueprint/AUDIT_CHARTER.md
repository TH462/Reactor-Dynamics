# AUDIT_CHARTER.md — orientation for an INDEPENDENT audit session

**Read this instead of `CLAUDE.md`.** An audit session runs with the repo's `CLAUDE.md` and the
auto-memory index **excluded from loading** — by `.claude/settings.local.json` in an audit lane, or
by `.claude/settings.audit.json` behind a flag elsewhere (see below) — because both are dense with
conclusions about the very subsystems under audit: the priming problem **GitHub #221** RoE 1
describes. The audit programme, its rules of engagement and the per-slice tracking issues live
in **GitHub #221 and #295–#301**; there is no Blueprint document for it.

**How you got here — the AUDIT LANES** *(OWNER RULING, 2026-08-05, #383: "Let's do it with the
files not the skills.")*. `C:\grok_build\RD_workbench` and `C:\grok_build\RD_backshop` each carry
`.claude/settings.local.json` with the `CLAUDE.md` exclusions and `autoMemoryEnabled: false`. That
file **layers by default and needs no flag**, so any session started in either tree is already
unprimed, and a `/clear` is enough to begin a slice. `develop` has no such file: a slice launched
there needs `claude --settings .claude/settings.audit.json`.

The accepted cost, stated so it is not rediscovered as a bug: **ordinary non-audit work in those two
lanes also runs without `CLAUDE.md`.** That is the ruling, not an accident.

```
node tools/audit_preflight.js <slice>      # verifies the config; launches nothing
```

Six checks, **exit 2 naming the cause** — settings unparseable, auto-memory on, a worktree whose
`CLAUDE.md` is missing from the exclude list, a settings key a CLI upgrade has renamed, no charter,
or a slice issue with no `SUBJECTS TO TEST` section. Every one of those is a failure whose signature
is *a clean-looking audit* rather than a red, which is why it refuses instead of warning.

**Preflight proves the CONFIGURATION, never the SESSION.** It runs outside the session it is
protecting, so on your **first turn**, before any source file, state on the slice issue whether
`CLAUDE.md` was **auto-loaded into your context without you reading it** and whether you see a
memory index. Ask it that way round: the Read tool can open `CLAUDE.md` at any time, so *"can I see
it"* answers a different question with a misleading yes. **A glob that failed to match looks exactly
like a clean audit** — this self-report is the only evidence that it did not, and it has already
caught two primed sessions before either filed a finding (#296, #297).

**It has also caught an agent reasoning about its own priming from the inside** (2026-08-05): a
session concluded it was primed because `CLAUDE.md` was in its context, when it had simply *read the
file itself* and the exclusion was in force the whole time. **A session cannot establish its own
priming state by introspection.** The check asks what the *harness* did.

**The `SessionStart` hook now tells you which mode the lane is in**, and withholds WIP issue
*titles* in an audit lane. That was a measured leak: on 2026-08-05 it printed a plant defect by name
into a context the exclusion had just cleaned (#383). Hooks fire regardless of `claudeMdExcludes`,
so it is the one priming channel no settings file can close.

This file is the **operating half** of that document with the **diagnosis removed**: how the repo is
wired, how to run it, how to measure it, and which rules bind you. It deliberately contains **no
findings, no tuning history, no gate scores, and no claims about whether any mechanism is correct**.

*(OWNER, 2026-08-04: "what if i save claude.md to a safe place and you rewrite it specifically for
this test and after the test i restore claude.md?" — then, on the recommendation to use the harness's
own exclude switches plus this charter rather than swapping a tracked file: "implement your
recommendation.")*

> **Everything you read in this repo's prose is a CLAIM UNDER TEST, not a background fact.** That
> includes source comments, `Diagnostic/`, `Blueprint/`, `Manuals/`, commit messages and issue
> threads. Nearly every constant here carries its rationale in a comment; those comments were
> written by the same process that wrote the code, which is the entire reason this audit exists.
> Read them to find out what was *intended*. Do not read them to find out what is *true*.

---

## 1. What binds you

**The Hard Rules in `Blueprint/CONTEXT.md` §3, and this file. Nothing else.** Ten rules, short by
design. `Blueprint/SOP.md` §1–4 is technique, not authority.

The five you will actually trip over — stated as rules, with no worked cases, because the worked
cases are findings:

- **HR1** — automatic protection, alarms and gauges read the **instrument** layer, never true state.
  True state is a diagnostic overlay only.
- **HR5** — commands only flow down through the simulation service.
- **HR9** — the plant is the ground truth. Authority runs physics → this plant's ruled identity →
  behaviour catalog → setpoints → authored content → that content's gates. **Content never votes on
  physics.** When content breaks after a plant change, presume the content is stale.
- **HR10** — a passing test is not evidence the mechanism is right. A test written from observed
  behaviour can only confirm that behaviour, including the wrong parts.
- **HR12** — **an assertion about plant dynamics must be MEASURED.** Step the plant, quote the
  number. This binds your findings.

**HR11** — a ruling is authority only with a **date and the owner's verbatim words**. Anything else
is advisory. Check what a ruling actually decided, not what it is being used to justify.

**A directive with no date + verbatim owner quote is advisory.** Weigh it, say you did, move on.

---

## 2. Which LAYER you are measuring at — read this before you measure anything

This is structural, not a finding, and getting it wrong invalidates a measurement silently.

`ControlLayer.stepAutomation()` and `engageDefaults()` have **exactly one production caller each,
both in `layers/simulation_service.js`**, as does `engine.getStartupLineup()`. So anything that stops
below M5 runs with **no automation channel ticking, no channel ever engaged, and no free-play
lineup** — a plant no player can produce.

| layer | runners |
|---|---|
| **engine-direct** | `run_pwr`, `run_rbmk`, `run_bwr`, `run_meltdown`, `run_procedures` |
| **engine + M4** (looks full-stack, isn't) | `run_ops`, `run_behavior`, `run_m4` |
| **full stack** (M4+M5+M6) | `run_procedures_stack`, `run_m5`, `run_m6`/`run_m6ph`, `run_m7`, `run_autoctl`, `run_campaign`, `run_checklist`, `run_scenarios`, `run_e2e_controls` |
| **browser** | `verify_e2e_ui`, `verify_manual_follow` |
| **static** (the plant is never stepped) | `run_hr3`, `run_hardrules`, `run_contract`, `run_inspect`, `run_flags`, `run_session_labels` |

Protection, actuations and interlocks live at **M4**. Measuring them engine-direct reports a plant
with no ESF arms at all.

**To take a number, use `node test/measure_stack.js`** — full stack, any IC/duration/scheduled
commands, US-first units, and it stamps the LAYER into its own output.

```
node test/measure_stack.js --for=12h --every=1h --watch=tavg_c,pressure_mpa
node test/measure_stack.js --list                 # field names, by source
```

**Never drive a measurement with `svc.start()`** — it arms `setTimeout(broadcastMs)` and advances in
WALL time. Drive `tick()` / `advanceCycles(n)` directly. Two more that cost a run each:
`svc.tick()` no-ops unless `this.running`; and `advanceCycles(n)` counts **broadcast cycles**
(0.1 s each, 0.05 s in a transient), not seconds — drive durations off `simTime`.

**`engine.reset()` takes an OBJECT (`{initial_state}`) and silently ignores a string**, defaulting to
`hot_full_power`. Assert your IC — log `s.pressure_mpa` right after `reset`.

---

## 3. Running it

No build step, no `package.json`, no module system.

- Open `index.html`, or `ui/shell.html` directly, or serve the folder statically.
- **Every file in `engines/`, `layers/`, `scenarios/`, `ui/` is a plain global-namespace script that
  attaches to `globalThis.RD`.** Do not add `import`/`export`/`require` to a source file — it breaks
  both the browser and the Node load paths. The test runners `require()` only to *execute* each file
  into a shared global.
- **Load order matters** — `pwr_config.js` and the control modules load before the engine files that
  consume them. See the ordered list at the top of any `test/run_*.js`.
- Plant-specific files are prefixed `pwr_` / `rbmk_` / `bwr_`.

## 4. The gates

```
node test/run_all.js            # THE AGGREGATE GATE — every runner vs recorded baselines
node test/run_all.js --fast     #   …skipping the slow Playwright gates
node test/run_all.js --only run_pwr,run_ops
node test/run_all.js --jobs=1   # sequential, if a runner is suspected of not being isolated
```

**Establish the pre-existing state by RUNNING it, not by reading about it.** The baselines are data
in the `BASELINES` map at the top of `test/run_all.js`; this charter deliberately quotes no scores,
because a score with its history attached is a finding. Run `run_all` **before** you start so you can
tell a red you found from a red you caused.

**Drift is symmetric** — a runner scoring *better* than baseline also fails. That is deliberate.

Per-runner times in a parallel run are **contention** times, not costs.

---

## 5. Scope

**PWR only.** RBMK and BWR are on hold — do not audit, implement, tune or "fix while you're here"
their engines, controls, scenarios, UI or tests. Known RBMK/BWR reds are out of scope. Shared code is
in scope where a PWR question reaches it.

**This is an educational lumped-parameter plant, not a full-scope replica.** Where a simplification
understates reality, say so plainly — that is a finding, not a complaint.

---

## 6. Conventions you must follow in your output

- **US customary FIRST, SI in parentheses** — `2235 psi (15.41 MPa)`, `565 °F (296 °C)`. Temperature
  **differences and rates** convert ×9/5 with **no offset**: 41 °C of subcooling is 73.8 °F, not
  105.8. This applies to everything you hand the owner — chat, issue bodies, comments, commit
  messages. Engine internals stay SI.
- **Plant MODES** use commercial numbering, written *Mode N, Name* (e.g. *Mode 1, At Power*). Do not
  confuse with turbine load modes (Follow / Manual / Disconnected).
- **Two registers** — every label/instructional string exists in a **Learning** (plain language) and
  an **Industry** (real plant terminology) form.
- **Be brief. Facts, numbers, decisions.** Lead with what you found and the number that shows it.
- **Close any response that leaves work unfinished** with a `— STILL OUTSTANDING —` block naming what
  is not done, why, and the ONE thing you recommend next.
- **When you ask the owner something, bring your recommendation with it.**

---

## 7. Where you may and may not write

**You are in a shared repo with up to three concurrent agents in three working trees.**

| Working tree | Branch |
|---|---|
| `C:\grok_build\Reactor_Dynamics` | `develop` — the main lane |
| `C:\grok_build\RD_workbench` | `workbench` — overflow lane 1 |
| `C:\grok_build\RD_backshop` | `backshop` — overflow lane 2 |

**A branch isolates nothing; only a separate working directory does.**

- **First thing, check ALL trees.** A `SessionStart` hook (`tools/hook_lane_status.js`) prints the
  sweep and the lane-tagged issues. If it did not fire, run it: `node tools/hook_lane_status.js`.
- **Uncommitted files in a lane, or a commit inside the last hour, mean a live session.**
  **When a lane tag and the file sweep disagree, the TAG wins** — the tag is a statement, the sweep
  is an inference, and the sweep cannot see an agent between commits.
- **On a positive, WARN AND ASK.** Do not move lanes on your own.
- **Tag your issue `status-wip-<lane>` when you START and clear it when you STOP** — not when you
  finish.
- **NEVER MERGE INTO `develop` UNLESS THE OWNER SAYS SO.** Commit on your lane, gate it, say it is
  ready, stop there.
- **NEVER push `workbench` or `backshop`.** The remote carries only `main` and `develop`.
- Commit ongoing work to `develop` (or your lane), never straight to `main`.

**Guaranteed merge conflicts**, all newest-at-top: `CHANGELOG.md`, `Diagnostic/TUNING_LOG.md`,
`Blueprint/BUILD_DECISIONS.md`, `CLAUDE.md`, and the `BASELINES` map in `test/run_all.js`. Keep both
sides, then **re-run `run_all`**. `Manuals/` is on this list too and is the dangerous one — it is
edited in the MIDDLE by both lanes, so a merge can resolve it in one lane's favour **silently**.
After any merge touching `Manuals/`, grep the chapter for the thing you wrote.

**Session-log headings are `YYYY-MM-DD-<lane>-<letter>`** (e.g. `2026-08-05-develop-a`); the letter
is the next unused for that date **in your own lane**. Gated by `test/run_session_labels.js`.

**Any `Manuals/*.md` content change** needs, in order: a row at the top of
`Manuals/00_REVISION_HISTORY.md`, then `node tools/stamp_manual_revision.js`, then
`node tools/pack_manuals.js`. `test/run_manual_rev.js` reddens if any step is skipped.

---

## 8. The audit's own rules

These come from GitHub **#221** and bind every slice. Restated here because the issue body is the
place findings accumulate, and you should have the rules before you read any of them.

1. **Findings only. No fixes.** Mixing them is how an audit becomes a refactor and stops auditing.
2. **Measure, don't infer.** Tag every finding **`MEASURED`** or **`INFERRED`**, and every `MEASURED`
   one must name the **layer** it was measured at and how.
3. **A claim of realism must carry a source** — accession number, section, enough verbatim quote to
   check. Recall is not evidence, and neither is another agent's summary. **Check the other lanes'
   `inbox/sources/` before starting an evidence pass.**
4. **Say "could not establish"** rather than reasoning to a confident answer.
5. **Where a slice boundary cuts a coupling, read across it — do not audit across it.** File findings
   only inside your scope; hand the rest to the owning slice by name.

**The six standing questions**, asked of any mechanism that *acts* — a trip, an actuation, an
interlock, a permissive, an automation channel, a controller, a mission gate:

1. **Completeness** — what does a plant of this type have that this one does not? A gap is invisible
   to every gate by construction.
2. **Adequacy** — does it act **IN TIME**? `MEASURED`, with both numbers: time-to-actuation against
   time-to-consequence. A setpoint with no measured margin is a finding even when it is sourced.
3. **Spurious actuation** — does it act when it should **not**? Sweep against normal evolutions and
   designed ride-outs, not only casualties.
4. **Defeatability** — can it be blocked, by whom, under what permissive, and does the block survive
   a regime change?
5. **Redundancy** — a three-way sort, not a defect test. **Defect**: one interlock with two
   independent copies of its condition that can drift apart. **Virtue**: diverse sensing of the same
   event — do not file it. **Finding, but a different one**: nominal diversity, two named functions
   on one signal so close they can never disagree; ask what the second buys.
6. **Provenance** — scoped to setpoints that gate an **action** (a scram, an ESF actuation, a
   permissive). Rank by consequence, never by absence of a comment.

**Conditions that can never arm** applies throughout: a declared instrument with no live source reads
`undefined` forever and its mechanism silently never fires.

---

## 9. Issue tracking

Repo **`TH462/Reactor-Dynamics`**; `gh` is on PATH (Git Bash form:
`"/c/Users/Tim H/AppData/Local/Programs/gh/bin/gh.exe"`). Draft long bodies to a file in `inbox/`
(gitignored) and use `--body-file`; inline `--body` mangles markdown.

**Always add the `Claude` label to any issue you touch.** Four required axes on every issue:
`priority-*` (by consequence), `type-*`, `system-*`, `plant-*`. The canonical definition is issue
**#61**.

---

## 10. What this file deliberately omits

The repo's `CLAUDE.md` additionally carries a *Project status* section, a *Recent themes* list, a
standing-traps list and a per-gate baseline narrative — **hundreds of specific conclusions about how
each subsystem behaves and why**. All of it is excluded from an audit session on purpose.

If you find yourself needing one of those facts, that is the signal to **measure it**, not to go
read it. If you genuinely cannot proceed without it, say so in the slice issue and name the fact —
that is itself a finding about how much of this plant is only knowable from its own prose.

---

## 11. Before and after a slice — NOT FOR THE AUDIT SESSION

**If you are the auditor, stop reading here.** §11 is for the ordinary, *primed* session that
prepares a slice or closes one out. It lives in this file so there is one document rather than
several that can drift apart *(OWNER RULING, 2026-08-05, #383: "Let's do it with the files not the
skills.")* — the earlier version of this procedure was three skills, and a skill's description
loads into every session's prompt including an auditor's, which is a priming surface for no gain.

### 11a. Preparing a slice (primed session)

Everything here is work an audit session must not do, and two steps can *only* be done by a session
that can see `CLAUDE.md` and the memory index.

1. **Pick the slice and check the lane.** Running order is **1 · 2 · 3 · 9 · 8 · 4 · 5 · 6 · 7** —
   issues **#295 #296 #297 #344 #342 #298 #299 #300 #301**, by blast radius, not by ease. A slice
   with comments has run; one with none has not. Sweep the lane tags before claiming one.
2. **Refresh SUBJECTS TO TEST — the step that needs a primed session.** #221 process step 1 requires
   each slice issue to name the auto-loaded claims inside its scope, marked as on trial. That is a
   list of exactly what a primed session can see and an auditor cannot, so **no other session can
   write it.** Add what has arrived since it was last written, *with the measured numbers* — a claim
   carrying its number is testable, "the coupling was fixed" is not. Do not delete an entry because
   it now looks settled; settled is the property under test. Preflight refuses a slice without this
   section.
3. **Record the tree the findings will be measured against** — the commit SHA and a `run_all`
   result, posted to the slice issue. **Name any runner that is already red**, or the auditor may
   file a pre-existing red as a finding and the fix side will chase it.
4. **Tag** the slice `status-wip-<lane>` — the lane the audit will *run* in.
5. **Preflight**: `node tools/audit_preflight.js <slice>`. If it refuses, fix the cause; never
   hand-arm the exclusion to get past it.
6. **Stop.** Do not read the slice's source files "to help while you're here" — anything you
   conclude becomes a conclusion the auditor inherits. Fix-side issues from *previous* slices,
   scope/rubric edits and programme tooling are all still fair game.

### 11b. Closing a slice (primed session)

**Triage is not re-auditing.** Do not re-derive, soften, or drop a finding because you can think of
a reason the code is that way. Disagree on the issue, as a separate comment, with a measurement.

1. **Clear the lane tag first.** A tag left standing makes the next agent stand down for nobody.
2. **Check the slice was actually independent** — find the auditor's first-turn self-check. Reported
   clean, note it. Reported primed, the findings stand as observations but the *slice* is marked
   non-independent. **No self-check at all counts as primed**: inferring it was fine from a
   thorough-looking slice is the exact inference the mechanism replaces.
3. **File each real defect** as its own issue linked to the slice comment, carrying the `Claude`
   label and all four axes (`priority-*` by consequence, `type-*`, `system-*`, `plant-*`; see #61),
   plus the file:line, the evidence tag with its layer, and the repro line. **A finding whose
   measurement cannot be re-run is `INFERRED` wearing the wrong tag** — re-tag rather than file it
   as measured. Do not file: results the slice recorded as *holding*; a declared departure the slice
   re-derived (unless its stated basis no longer matches the shipped plant — *that* is the finding);
   or anything handed to another slice by name.
4. **Update the convergence table on #221.** Its own stopping rule — *"if slice N's findings are
   consistently less severe than slice N−1's, the audit is converging and should continue. If not,
   stop and re-scope"* — went untracked from the day it was written until 2026-08-05. One row per
   slice: findings, counts by severity, and whether it was independent. Count by the severity you
   filed, not the slice's adjectives, then say in one line whether it is converging. **The rule has
   a consequence attached; a table that never triggers it is decoration.**
5. **Record it**: a close comment on the slice issue, and lane-form session entries in
   `Diagnostic/TUNING_LOG.md` / `Blueprint/BUILD_DECISIONS.md` if the tree changed. **An empty slice
   is a real result** — record it as one rather than manufacturing findings to justify the run.
6. **Name what runs next** in the order above, and whether fix-side work blocks it. Fixes are
   separate work; do not start them in the same session without saying so.
