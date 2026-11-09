---
name: version-changelog
description: Version numbers and the two changelogs — when the Alpha X.Y.Z bump happens (first push to develop after a release, wearing -rc<N>, N bumped on every sim-changing push), which digit (Platform.Feature.Refinement; Y only for Roadmap-worthy new things), the player-facing changelog.html entry rules (facts only, max 8 bullets, simulator changes only, no flag-gated features) and the developer CHANGELOG.md, gated by run_release.js. Use when preparing a push to develop, when asked to "bump the version", "update the changelog", "write the release notes", or when run_release goes red. Cutting the release itself is the release-to-main skill.
---

# Versions and changelogs

Moved out of `CLAUDE.md` 2026-10-18. Owner quotes: `Blueprint/RULINGS.md` §Releases. The release
procedure itself (merge lanes, PR to `main`, Production deployment check) is skill
`release-to-main`; this skill is what happens on the way there.

## When

**At the first push to `develop` after a release, not at the merge to `main`** (owner,
2026-09-03: "The version should be ticked up appropriately and change log updated as if it was
going to main… so that I can review all of this stuff before it gets pushed to [main] and
published."). The pending version wears **`-rc<N>`** in all three files or none, digits
REQUIRED (`run_release` has a `PENDING` state; do not quieten a red by relaxing it, #611).
**Bump N on every push to `develop` that changes the sim** (owner, 2026-09-03: "add a release
candidate version number to the right of rc so I can keep track of the release candidate
builds") — bug reports carry `RD_RELEASE`, so an unnumbered `-rc` cannot tie a symptom to a
build. One changelog entry per release; **later pushes EXTEND it**, like the manual's pending
revision row, while N advances. Review it on the tester site
(`develop.reactor-dynamics.pages.dev`); the release commit then only strips `-rc` and sets the
date.

**A website-only change ships with NO version bump** — `run_release` forbids "bump, no entry".
**A flag-gated feature is not released and gets no `changelog.html` entry** (check
`site/flags.js`) but does belong in `CHANGELOG.md` (owner ruling, 2026-09-03: "they're
technically not released so don't put them in the change logs yet").

## Which digit — `Alpha X.Y.Z` = Platform . Feature . Refinement

Read the top entry of `changelog.html` and `site/release.js` (they must agree; `run_release.js`
gates the agreement but **not** the digit choice) — never a version written in a doc.

- **X** platform milestone (new reactor type, engine overhaul, alpha → beta). Rare.
- **Y** a **major change or a genuinely new capability** — something that did not exist before
  and that you would list on the Roadmap. **Resets Z to 0.**
- **Z** everything else — **including player-facing changes and fixes**, as long as they improve
  something the sim already did.

**Y is for NEW things, not for VISIBLE things** (owner, 2026-07-31: "I think we should have the y
part of the change number be for major changes or feature additions in order to reduce the
change number blowup. Z is for smaller changes and fixes even if they are player facing.") —
the old wording took the version 1.2.0 → 1.11.0 in eight days. The test: could you add it to
the Roadmap as a line item? New system, scenario, mode or page → Y. Better/clearer/fixed
version of something already there → Z, however visible.

`Alpha 1.0.0` shipped 2026-08-04 (owner, 2026-08-04: "The next release will take the program out
of pre-Alpha and into Alpha and bring back the update tracking page. Update tracking
summaries/lists should be concise."); every release since is an ordinary bump. Not the same as
the `RD_VERSION` deploy stamp (`site/version.js` — the git SHA stamped at build time).

## The player-facing entry — `changelog.html`

A new `<details class="log-entry" open>` at the TOP (newest first): version, date (visible text
*and* `datetime`), player-facing summary. Copy the file's `ADDING AN ENTRY` template.

- **Facts only, minimize prose** (owner, 2026-08-04: "Just keep to facts in the changelog page.
  Minimize prose."). Name the thing that changed and stop. No sentence that would still read fine
  if deleted, no lead-in paragraphs.
- **Simulator changes only** (owner, 2026-08-06: "Also, don't include website changes in the
  changelog. The changelog is strictly for simulator changes."). The plant the player operates —
  physics, board, controls, procedures, scenarios, in-app manuals. Site pages, styling,
  navigation and download plumbing get no entry however visible (they still go in
  `CHANGELOG.md`).
- **Concise is a cap: at most 8 bullets per entry, one line each.** Aggregate, do not enumerate:
  one line per system's worth of work, not one per commit. The site entry is not derived
  one-to-one from `CHANGELOG.md`, which is dense on purpose. Over 8: group and summarise.

## The developer changelog — `CHANGELOG.md`

Dense, skimmable, newest first. At each `develop` → `main` merge, rename `## [Unreleased]` to
`## [Alpha X.Y.Z] — YYYY-MM-DD` and open a fresh empty `## [Unreleased]` above it;
`node test/run_release.js` enforces it (the roll was skipped for 1.10.0 and 1.11.0 and 434
lines of two shipped releases sat as unreleased). Pre-public sections are
`## [Pre-launch 1.x.y]`, not `Alpha` — parsed as released, `1.0.0` would sort under `1.11.0`
and `run_release` reddens on newest-first. New snapshot fields follow the migration-note
pattern in this file.

## Release reminders (detail in `release-to-main`)

Version bump + `changelog.html` entry + `CHANGELOG.md` roll land in **one change**, then
`run_release` green before the PR. `main` is protected (#196): `gh pr create --base main --head
develop …`, `gh pr merge --merge` (never squash), then fast-forward `develop` and push tags
separately. **A release is not done until a `Production` deployment exists for the released
SHA** (owner, 2026-08-04: "Let's fix the gap and release.") — `node tools/verify_release_deploy.js`
(Cloudflare-only since 2026-08-10); do not push `develop` until it exists, because two events
for one SHA is how the production build went missing for Alpha 1.0.0.
