# Rulings — the owner's verbatim words behind every dated rule in `CLAUDE.md`

**Status: LEDGER.** `CLAUDE.md` is loaded into every agent's context on every turn, so since
2026-10-18 it carries each rule as a short dated imperative line and this file carries the
owner's words, moved here exactly as they were written in `CLAUDE.md`. Under Hard Rule 11
(`Blueprint/CONTEXT.md` §3) a ruling needs a date and the owner's verbatim words to bind; a
dated line in `CLAUDE.md` whose quote is here is fully binding — **this ledger is the quote.**
`Blueprint/SOP.md` §5 is the older register of the same kind for the ask-with-a-recommendation
rule; it is not duplicated here beyond the quotes `CLAUDE.md` carried.

Add a row when a new ruling lands in `CLAUDE.md`; never edit a quote. `test/run_hardrules.js`
counts every `OWNER RULING` / `OWNER DIRECTIVE` citation here and fails on one without a date
and a quote.

---

## Replies, reporting and asking

- **Be brief — facts, numbers, decisions.** *(OWNER DIRECTIVE, 2026-07-30: "I would also like to
  adjust the conciseness of replies. Most replies are a bit too long. I need just the facts and
  important information to know what the ai did and to make decisions.")*
- **Token-efficient, never at the cost of quality.** *(OWNER DIRECTIVE, 2026-09-11: "Be token
  efficient but do not sacrifice quality in any way")*
- **One hard cap (the `CLAUDE.md` word budget), a chat default of ~150 words, a content rule for
  write-ups.** *(OWNER RULING, 2026-08-06: "Go with your recommendation." — given after "Should we
  add word limits? Wouldn't it hamstring you sometimes?", on the recommendation that only ONE of
  three proposed caps should be a hard number)*. Why not three caps: a word limit on write-ups would
  forbid the worked A/B that makes a trap believable — #363's lesson is worthless without the 15 °F
  number that disproved the filed symptom — and caps are a proxy an honest writer games without
  noticing.
- **End with a STILL OUTSTANDING block.** *(OWNER DIRECTIVE, 2026-07-30: "I would like to add to
  claude.md to have the ai place a 'Still Outstanding' summary at the bottom so i know exactly
  what still need to be done with respect to the task the ai is working on. This summary should
  include a recommendation for what to work on next.")*
- **The block is a report, not a place to put work.** *(OWNER DIRECTIVE, 2026-09-20: "You often
  stop with work that needs to be done in the STILL OUTSTANDING block. how can we adjust so that
  you keep working until its complete? I cant always monitor your work just to say 'keep going'
  every time.")*. In the session that produced this rule, one block parked two items as "waiting on
  your yes" that needed nothing from him while calling two branches that carried his own rulings
  "undecided". He cannot monitor; the default is keep going.
- **Show the block only when it changed or carries a decision.** *(OWNER, 2026-09-25: "Do it")*
- **Bring the recommendation with every question.** *(OWNER RULING, 2026-07-29: "I think we should
  add to SOP to have you automatically give your recommendation when asking for my input so I
  don't have to keep asking for it.")*
- **Re-issued: the decision travels WITH the blocker.** *(OWNER DIRECTIVE, 2026-08-14: "From now
  on, whenever you need a ruling, tell me what you need me to decide, my options and your
  recommendation. I'm tired of having to ask every time.")*. The failure mode is not refusing to
  recommend — it is naming a blocker without the decision attached.
- **First Principles — a canary, not an essay.** *(OWNER RULING, 2026-07-29: "I would label it the
  'First Principles' section. The start and end should be marked."; narrowed hours later, on the
  first two in the wild: "the first principles section is usually too long. I consider it a canary.
  Something to tell me if there's something that needs to be looked into. It doesn't need to be
  verbose.")*
- **Spell out every code.** *(OWNER DIRECTIVE, 2026-08-14: "I don't know what these letter number
  combos are (L0, D1). Always spell them out."; broadened minutes later when a first pass named only
  two families: "Not just those to, spell out all of them.")*
- **US customary first, SI in parentheses, in everything he reads.** *(OWNER DIRECTIVE,
  2026-07-29: "also add a gh issue to add to claude.md to always give me imperial numbers not SI.")*

## Lanes, merging and pushing

- **Lane tags are the occupancy signal.** *(OWNER DIRECTIVE, 2026-08-04: "Since that's done add an
  in process tag that shows which worktree it's being worked on.")*
- **On a positive sweep, warn and ask.** *(OWNER RULING, 2026-07-29: "Maybe it shouldn't be
  automatic. The agent should warn the user and ask if they should use workbench.")*
- **Never merge into `develop` unless the owner says so.** *(OWNER DIRECTIVE, 2026-07-31: "We need
  a rule to never merge unless I say so. Develop was being worked")*
- **PWR2 (#479) has a standing hold on top.** *(OWNER DIRECTIVE, 2026-08-14: "Do not merge until I
  explicitly tell you to. We are not going to merge until the new physics have been finished,
  tested and validated.")*. "Just the docs" / "just the manual fix" carve-outs were asked for and
  declined the same day.
- **The lanes are local.** *(OWNER DIRECTIVE, 2026-07-31: "I don't want the workbench or backshop
  trees pushed to gh. Gh should only have main and develop.")*
- **Never push until he says so.** *(OWNER DIRECTIVE, 2026-09-14: "Let's change the rule to don't
  push until I tell you to.")* — supersedes the same day's "push once a session, at the end".
- **A stale lane tag is not occupancy.** *(OWNER DIRECTIVE, 2026-10-02, on #811 — untouched 3
  days, work released, tree clean: "Next time don't use that as an indication that the worktree is
  occupied.")*
- **Subagent worktrees reset to the develop tip and are removed on merge; watch every push's CI
  run to the end; walkthrough reviewer before layman.** *(OWNER RULING, 2026-09-29: "Adopt 1,2,4 as
  recommended.")* — one ruling, three adopted recommendations.

## Design criteria, curriculum and the premise

- **The four design questions.** *(OWNER DIRECTIVE, 2026-08-02: "I think there are a few important
  criteria on weather we should include a feature or make a change. 1. Is it prototypical? What is
  the educational value? Is the increased complexity worth it? What are the actual tested numbers
  or behaviors of our plant?" — clarified: "I meant the complexity to the user. Are the extra
  controls going to increase educational value or will they confuse the player? We should codify
  this decision making process.")*
- **Automating the RBMK/BWR builds is the goal behind `DESIGN_CRITERIA.md` §5.** *(OWNER,
  2026-08-02: "My goal is to eventually automate the building of the BWR and RBMK plants.")*
- **Curriculum Tiers A and B ruled.** *(OWNER RULING, 2026-08-03: "Tier A looks good, make it so.
  Tier b looks good, also make it so.")*
- **Curriculum Tier C ruled.** *(OWNER RULING, 2026-08-03: "Do as you recommend.")*
- **The educational goal is plant dynamics.** *(OWNER, 2026-08-02: "The point of the sim is in the
  name. I want to teach people plant dynamics. They should learn the dynamics between the
  different components.")*
- **Instrument deception is not a headline objective.** *(OWNER, 2026-08-02: "I don't want to
  focus on instruments lying. It will come up in failure scenarios but I dont know if it should be
  a major focus.")*
- **Purge the instruments-vs-truth premise.** *(OWNER DIRECTIVE, 2026-08-03: "THR STATED PREMIS IS
  NOT INSTRUMENT VS TRUTH THE PREMIS IS TO TEACH PLANT DYNAMICS!!! We must purge the idea of the
  instruments vs truth premise from all documents.")*

## The plant is the ground truth; evidence; testing order

- **Content follows the physics; churn is never an input.** *(OWNER DIRECTIVE, 2026-08-07:
  "Documentation and gameplay always follow the model/physics, not the other way around.")*
- **Evidence pass before any prototypicality change.** *(OWNER DIRECTIVE, 2026-07-28: "I like the
  idea of the evidence pass to find the data on how a real plant does it instead of relying on
  recall. I think that should be our SOP for issues like this one. All sim plant designs should be
  based on real plant documentation.")*
- **Hard Rule 12 — measure plant-dynamics claims.** *(OWNER RULING, 2026-07-29: "if you make
  assertions about plant dynamics, you must back it up by testing them.")*
- **Manual first, then auto.** *(OWNER DIRECTIVE, 2026-08-12: "Testing of systems should happen
  without automatic mode first. Once proper manual behavior is established we test auto mode. This
  goes for all systems with an auto mode.")*

## What binds, and document hygiene

- **Four rules decide what is law.** *(OWNER RULING, 2026-07-27: "I think we have too many
  instructions in this project and it's starting to confuse the coding agents and gum up the
  works… Go with your recommendations")*
- **The open-issues list and the project-status cuts.** *(OWNER DIRECTIVE, 2026-09-12: "Implement
  the ruleset and Claude.md cuts as recommended.")*
- **The manual revision number advances only at a release.** *(OWNER DIRECTIVE, 2026-08-06: "The
  revision number only matters during a release to the website. Revision numbers should never go
  up until a release happens.")*
- **The standing-procedure list is capped at 25.** *(OWNER RULING, 2026-08-10: selected "Cap at 25,
  evict to TRAPS.md" from options I wrote — a selection, not verbatim words)*
- **The project-status history cut.** *(OWNER RULING, 2026-07-27: "Execute the cut.")*
- **Not an owner ruling — recorded for provenance.** On 2026-10-18 `test/run_doc_budget.js`'s
  `MAX_WORDS` was lowered 15,000 → 5,700 (measured 4,968 after the prune, plus ~15 % headroom).
  The agent's call under the 2026-08-06 ruling above, whose direction is *cut, never raise*; it
  needs no new ruling to lower and would need one to raise.

## Gates, pushes and agents

- **One `run_all` per push, not per change.** *(OWNER DIRECTIVE, 2026-09-12: "Can we save the gate
  until just before pushing instead of doing it after every change?")*. Measured that day: four
  34-minute runs for one bundle, ~100 minutes of it waste.
- **Agent cost is tool calls, not prompt length.** *(OWNER DIRECTIVE, 2026-09-12: "How can you be
  more efficient with time and tokens without sacrificing quality?")*. Counted across two lanes that
  day: ~34 dispatches, 13 full `run_all` runs, ~8 h of gate wall time; the expensive agents ran
  300–360 tool calls each; seven agents ran 84–156 for five of them, then 1231 and 2274.
- **Sonnet by default, Opus where judgement is the work.** *(OWNER DIRECTIVE, 2026-09-18: "change
  our standard practice to use sonnet agents for well scoped work and only use opus agents for
  Work that needs more intelligence")*
- **Opus writes prose.** *(OWNER DIRECTIVE, 2026-09-24: "I'm thinking of changing the policy to
  have you use opus to write prose.")*
- **Fable judges taste.** *(OWNER DIRECTIVE, 2026-10-13: "When a decision requires taste, I want
  you to use a fable agent.")*
- **"Gate X forces Y" is a claim — grep for a ruling on Y first.** *(OWNER, 2026-09-25: "Do it")*
  — a bring-down overrode his "use the board's" MW on a misread N6.
- **Walkthrough changes gate on both routes.** *(OWNER DIRECTIVE, 2026-09-24: "Make the
  adjustments to your process as you recommend")*
- **Hand finished work to a fresh agent for a quality pass.** *(OWNER DIRECTIVE, 2026-09-11: "Upon
  completing your work, spawn a subagent to do a full and thorough quality pass through it for any
  remaining bugs, issues or QoL improvements.")*

## Releases, versions and the changelog

- **Alpha, and the update-tracking page.** *(OWNER DIRECTIVE, 2026-08-04: "The next release will
  take the program out of pre-Alpha and into Alpha and bring back the update tracking page. Update
  tracking summaries/lists should be concise.")*
- **A release is not done until a Production deployment exists.** *(OWNER, 2026-08-04: "Let's fix
  the gap and release.")*
- **Version and changelog ticked at the first push to `develop` after a release.** *(OWNER
  DIRECTIVE, 2026-09-03: "The version should be ticked up appropriately and change log updated as
  if it was going to main… so that I can review all of this stuff before it gets pushed to [main]
  and published.")*
- **Numbered release candidates.** *(OWNER, 2026-09-03: "add a release candidate version number to
  the right of rc so I can keep track of the release candidate builds")*
- **Flag-gated features get no `changelog.html` entry.** *(OWNER RULING, 2026-09-03: "they're
  technically not released so don't put them in the change logs yet")*
- **Y is for new things, not visible things.** *(OWNER DIRECTIVE, 2026-07-31: "I think we should
  have the y part of the change number be for major changes or feature additions in order to
  reduce the change number blowup. Z is for smaller changes and fixes even if they are player
  facing.")* — the old wording took the version 1.2.0 → 1.11.0 in eight days.
- **Facts only on the changelog page.** *(OWNER, 2026-08-04: "Just keep to facts in the changelog
  page. Minimize prose.")*
- **Simulator changes only.** *(OWNER DIRECTIVE, 2026-08-06: "Also, don't include website changes
  in the changelog. The changelog is strictly for simulator changes.")*

## Issues

- **The filing bar.** *(OWNER DIRECTIVE, 2026-09-20: "The last few sessions kept adding issues by
  themselves but I found a lot of these issues went on a tangent and are a waste of time.")*. Of 34
  closed as not worth doing that day, 6 concluded in their own body that nothing should change; 8
  were tests about tests.
- **The review and work-next labels.** *(OWNER DIRECTIVE, 2026-07-31: "The review tag is for when
  the ai wants me to review something before closing the issue"; "Add an owner review tag and a
  'work next' tag to issues")*

## Operations

- **`C:\grok_build\RD_Ops\` holds the site's operating record.** *(owner, 2026-08-08: "Set up the
  folder as store secrets as you recommend.")*
