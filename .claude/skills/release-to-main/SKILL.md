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

If anything about the **offline download** changed — what is in it, how it is packaged, how you get it — say so here and check `download.html` still matches. That page is the only route a player has to the download, and it is easy to ship a release where the file changed and the page describing it did not.

Then set the same version in `site/release.js` (`RD_RELEASE`). The two must match.

## 4. Check the offline download, but do NOT hand-publish it

```bash
node tools/make_portable.js          # -> dist/Reactor_Dynamics_Alpha_X_Y_Z.html
node test/run_portable.js            # must pass
node site/make_download.js           # -> download/<name>.zip + download/latest.zip
```

**Run these AFTER the version bump**, because the filename and the stamp inside both come
from `site/release.js`. Building first produces a file named for the *previous* release —
which is the whole of #258.

**Neither artifact is committed, and you must not "fix" that.** `dist/` and `download/` are
both gitignored. The zip the public gets is built **at deploy**: `vercel.json` chains
`site/make_download.js` after `site/stamp_version.js`, so the download always comes from the
commit being deployed and cannot disagree with the site serving it. A committed copy could
only ever be as fresh as the last person who remembered to rebuild it, which is the failure
#258 describes.

So what these local runs give you is **verification, not publication**: they prove the build
still works and the version is right before you ship. `download.html` links the stable
`download/latest.zip`, so it never needs editing per release.

> **Local success is not production success.** `make_download.js` running here does not prove
> it runs in the Vercel build. After deploying, verify against the live site — **and verify in
> this order**, because a bare 404 is ambiguous:
>
> ```bash
> curl -sL https://reactordynamics.com/site/version.js    # deployed COMMIT stamp
> curl -sL https://reactordynamics.com/site/release.js    # deployed VERSION
> curl -sIL https://reactordynamics.com/download/latest.zip
> ```
>
> If the commit stamp is not the one you just released, **the deploy has not run** and every
> 404 below it is meaningless — that commit does not contain the files. Only once the stamp
> matches does a missing zip mean the deploy build failed. Checking the zip alone will make
> you report a broken build that is actually a pending deploy: that happened on the very
> first run of this skill (Alpha 1.10.0, site still serving ae2233c/1.9.0).
>
> Note the site 308-redirects, so use `curl -L`.

## 5. Merge to `main`

Check whether the branch ruleset is on — **do not assume**:

```bash
gh api repos/TH462/Reactor-Dynamics/rulesets
```

Three outcomes, not two:

| Response | Means | Path |
|---|---|---|
| A JSON array with a rule targeting `main` | Ruleset **on** | PR |
| `[]` | Ruleset **off** | Direct |
| **`403` "Upgrade to GitHub Pro or make this repository public"** | Repo was private — rulesets are a paid/public feature, so none could be in force | Direct |

**As of 2026-07-30 this repo is PUBLIC and a ruleset is active on `main`, so the PR path is
the live one.** The 403 row is kept because it is the answer you get on any private fork or
clone, and because it is not an error to work around and not "ruleset off" — it is the API
declining to answer.

The active ruleset requires a pull request, blocks force-push and deletion, and allows only
the **merge** method. Note `required_approving_review_count` is **0** on purpose: GitHub does
not let you approve your own PR, so on a solo-maintained repo any non-zero value would block
every merge permanently. Raise it only when there is a second maintainer.

Re-check every release rather than remembering last time's answer.

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
- [ ] **`make_portable.js` + `make_download.js` re-run after the bump**, `run_portable`
      green, filename carries the new version — as VERIFICATION; neither artifact is
      committed, the deploy builds the published one
- [ ] `download.html` still describes what actually ships, and the changelog says so if it changed
- [ ] Ruleset checked, and a **403 read as “private repo, no ruleset”** rather than as an error
- [ ] Merged the way the ruleset check indicated
- [ ] Annotated tag pushed separately
- [ ] All three lanes fast-forwarded to the released commit
- [ ] **After the deploy lands:** confirm the live `site/version.js` carries the released
      commit FIRST, then that `download/latest.zip` exists and unzips. A 404 before the
      stamp matches means “not deployed yet”, not “build broken”.
