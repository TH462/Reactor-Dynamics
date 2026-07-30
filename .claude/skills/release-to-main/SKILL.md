---
name: release-to-main
description: Cut a release — merge the worktree lanes, bump the version, write the player-facing changelog entry, build the offline single-file download, merge develop into main and push with a tag. Use when asked to "release", "cut a release", "ship it", "push to main", or "catch main up to develop".
---

# Releasing to `main`

`develop` is the integration branch; `main` is what the public site deploys. A release is
not a merge — it is a merge **plus** a version, a player-facing changelog entry, a tag, and a
regenerated offline build. Missing any of those ships something misleading.

**Never commit straight to `main`.**

## 1. Get `develop` merged and green first

If the lanes are not already merged, use the **merge-worktrees** skill. Do not hand-roll it —
that skill exists because merging these lanes has specific traps (conflict prediction,
generated artifacts, foreign work in shared files).

```bash
git status --short                       # clean
git rev-list --left-right --count origin/develop...develop   # 0 0
node test/run_all.js                     # AGGREGATE GATE: OK
```

**A release with a red gate is not a release.** Stop and fix, or stop and ask.

## 2. Decide the version — read it, never recall it

The scheme is **`Alpha X.Y.Z` = Platform . Feature . Refinement**:

- **X** — platform milestone (new reactor type, engine overhaul, alpha→beta). Rare.
- **Y** — a new *player-facing* feature. **Resets Z to 0.**
- **Z** — bug fixes, tuning, refinements.

```bash
grep -n "log-ver" changelog.html | head -3     # first LIVE entry, not the template comment
grep -n "RD_RELEASE" site/release.js
```

Read both. **They must already agree with each other** — if they do not, that is a bug to fix
before releasing. Beware: `changelog.html` carries an `ADDING AN ENTRY` template inside an
HTML comment with a dummy version in it; the first `log-ver` match may be that template, not
a live entry.

Bump the **highest-significance digit** that applies across everything since the last release
— read `git log <last-tag>..develop` rather than guessing from memory.

## 3. Write the changelog entry — player-facing, before the merge

Add a new `<article class="log-entry">` at the **top** of `changelog.html`:

- version in `<span class="log-ver mono">Alpha X.Y.Z</span>`
- date as visible text **and** `datetime="YYYY-MM-DD"`
- **Style: concise and factual.** One line per change, lead with the change. No marketing, no
  filler ("great for…", "like a real plant"), no hedging. Player-facing wording, not commit
  subjects. Tags: added / changed / fixed.

This is the **public** page. `CHANGELOG.md` and `BUILD_DECISIONS.md` are the engineering
record and stay dense; this one does not.

Then set the same version in `site/release.js` (`RD_RELEASE`). The two must match.

## 4. Build the offline single-file download

```bash
node tools/make_portable.js          # -> dist/Reactor_Dynamics_Alpha_X_Y_Z.html
node test/run_portable.js            # must pass
```

**Do this AFTER the version bump**, because the filename and the version stamped inside come
from `site/release.js`. Building first produces a file named for the previous release.

This step is the point of automating the release: a stale portable build is an emailable file
that silently disagrees with the site. Confirm the output filename carries the new version
before continuing.

## 5. Merge to `main`

Check whether the branch ruleset is on — **do not assume**:

```bash
gh api repos/TH462/Reactor-Dynamics/rulesets
```

**Ruleset on (PR required):**
```bash
gh pr create --base main --head develop --title "Release Alpha X.Y.Z — <headline>" --body-file <path>
gh pr merge --merge          # --merge, NOT --squash: squashing flattens the release history
git checkout develop && git merge --ff-only main && git push origin develop
```

**Ruleset off (direct):**
```bash
git checkout main && git merge --no-ff develop && git push origin main
git checkout develop && git push origin develop
```

Then tag and push tags — **tags go separately, a PR does not carry them**:

```bash
git tag -a v<X.Y.Z> -m "Alpha X.Y.Z — <headline>"
git push origin --tags
```

## 6. Leave every lane on the released commit

```bash
git -C C:/grok_build/RD_workbench merge --ff-only develop
git -C C:/grok_build/RD_backshop  merge --ff-only develop
```

## Checklist — all of it, or it is not a release

- [ ] Lanes merged, `develop` == `origin/develop`, working tree clean
- [ ] `node test/run_all.js` → **OK**, on the exact commit being released
- [ ] Version decided by **reading** `changelog.html` + `site/release.js`, and they agree
- [ ] `changelog.html` entry added at the top, player-facing, dated both ways
- [ ] `site/release.js` bumped to match
- [ ] **`node tools/make_portable.js` re-run after the bump**, `run_portable` green, filename
      carries the new version
- [ ] Ruleset checked, merged the matching way
- [ ] Annotated tag pushed separately
- [ ] All three lanes fast-forwarded to the released commit
