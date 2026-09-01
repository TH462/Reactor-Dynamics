---
name: release-to-main
description: Cut a release — merge the worktree lanes, rebuild the offline single-file download, merge develop into main, confirm a PRODUCTION deployment exists, and push. Versioning is live; Alpha 1.0.0 shipped 2026-08-04 and the next release is an ordinary bump. Use when asked to "release", "cut a release", "ship it", "push to main", or "catch main up to develop".
---

# Releasing to `main`

> ## THE LAUNCH IS DONE — THIS BANNER IS HISTORY, NOT INSTRUCTIONS
>
> **RETIRED 2026-08-06, after `Alpha 1.2.0`.** Everything below this line describes the
> **`Alpha 1.0.0` launch**, which shipped 2026-08-04. `Alpha 1.0.1`, `1.1.0` and `1.2.0` have
> shipped since. **Releases are now ORDINARY: follow §1–§6 and use §2's digit rules.** The
> launch-only steps — the fixed version, the first `changelog.html` entry, the
> `Pre-launch` heading relabel, the `Rev 0` manual reset — are all done and must not be
> replayed. A plan stops binding the moment it is executed (`CLAUDE.md`, rule 3).
>
> **Two things below are still LIVE and are repeated in §3, so you cannot miss them:** the
> **≤ 8 one-line bullet cap** on `changelog.html`, and that the bump, the entry and the
> `CHANGELOG.md` roll must be **one change**. Everything else here is a record of what the
> launch needed. **The `run_release` baseline moves on every release** — it was 8 → 11 at
> launch and is **14** as of `Alpha 1.2.0` — so read it from `BASELINES`, never from this page.
>
> <details><summary>The launch-release banner, kept for the record</summary>
>
> *(OWNER DIRECTIVE, 2026-08-04: "The next release will take the program out of pre-Alpha and
> into Alpha and bring back the update tracking page. Update tracking summaries/lists should be
> concise.")* This **lifts** the 2026-07-31 suspension. **§2 and §3 are LIVE again**, and the
> next release is not an ordinary one:
>
> - **Version is not a judgement call this time — it is `Alpha 1.0.0`.** §2's digit rules apply
>   from the release *after* this one. One version covers everything accumulated under
>   `Pre Alpha`; do not replay the bumps that were skipped.
> - **`changelog.html` gets its FIRST real entry**, replacing the `log-note-block` that reads
>   *"Awaiting public launch"* — delete that block, it is not an entry and the gate does not
>   count it. The page describes **the state of the sim at launch**, not a diff against
>   `Pre Alpha` — its lead is *"This log begins with the public launch."* and nothing before that
>   is listed. **DONE for Alpha 1.0.0** (2026-08-04): the entry is a single line, on the owner's
>   call that a first release has nothing to be a change against.
> - **CONCISE, and it is a cap** — **≤ 8 bullets, one line each** *(the number is the agent's
>   operational reading; the brevity is the owner's directive)*. Aggregate a system's work into
>   one line; never copy `CHANGELOG.md`'s shape, where one item runs 30 lines.
> - **The bump and the entry MUST be in ONE change.** `run_release` is in pre-release mode,
>   where zero published entries is *correct* — so an entry added while `RD_RELEASE` still reads
>   `Pre Alpha` is a **red gate**, and a bump with no entry is red the other way. Setting
>   `RD_RELEASE` to the `Alpha X.Y.Z` format arms every released-state rule by itself.
> - **`CHANGELOG.md`'s pre-launch version headings MUST stop parsing as released versions, or
>   the gate goes RED — MEASURED, and #282 says otherwise.** The file still carries
>   `## [Alpha 1.11.0]` down to `## [Alpha 1.7.0]`, so rolling `[Unreleased]` to
>   `## [Alpha 1.0.0]` puts **1.0.0 above 1.11.0** and fails *"version headings are
>   newest-first"*. Simulated against the real runner: **10 checks / 1 failed** as #282 writes
>   it, **11 / 0** with the eight pre-launch headings relabelled (`## [Pre-launch 1.11.0] —
>   2026-07-30`, …) so the `^Alpha \d+\.\d+\.\d+$` test skips them. **Relabel, do not merge
>   them** — one catch-all would destroy the per-version boundaries that took a tag diff to
>   reconstruct once already. Second effect, and the reason this is not merely cosmetic: while
>   1.0.0 sorts *below* the oldest named heading it falls under the CROSS rule's floor, so the
>   launch entry's **date agreement between the two files is not checked at all** (0 CROSS rows).
>   The relabel restores it.
> - **`run_release` 8 → 11** in `BASELINES` *and* CLAUDE.md's *Project status* — drift is
>   symmetric, so the green-to-greener direction fails too. **11 assumes the relabel above**;
>   without it the best case is 10.
> - **Launch-only extras live in #282**, not here: the manual set resets to a single **Rev 0**
>   row *(OWNER RULING, 2026-07-31: "Revsiion should start at rev 0.")* via
>   `stamp_manual_revision.js` + `pack_manuals.js`, and the pre-launch `v1.10.0`/`v1.11.0` tags
>   sorting above `v1.0.0` is an open owner call. Read the issue before starting §2.
>
> §4 (the offline build) is unchanged and was never suspended — but run it **after** the bump,
> because the filename comes from `site/release.js`.
>
> </details>

`develop` is the integration branch; `main` is what the public site deploys.

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
- **Y** — a **major change or genuinely new capability** — something that did not exist
  before and that you would list on the Roadmap. **Resets Z to 0.**
- **Z** — everything else, **including player-facing changes and fixes**, as long as they
  improve something the sim already did.

**Y is for NEW things, not for VISIBLE things** *(OWNER DIRECTIVE, 2026-07-31: "I think we
should have the y part of the change number be for major changes or feature additions in
order to reduce the change number blowup. Z is for smaller changes and fixes even if they
are player facing.")*. Y used to
read "a new *player-facing* feature", which caught nearly every release — the version ran
**1.2.0 → 1.11.0 in eight days**. The operative test: **could you add it to the Roadmap as a
line item?** New system/scenario/mode/page → Y. A better or fixed version of something
already there → Z, however visible it is.

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
- **FACTS ONLY, MINIMIZE PROSE** *(OWNER, 2026-08-04: "Just keep to facts in the changelog page.
  Minimize prose.")*. One line per change: name the thing that changed and stop. No marketing or
  filler ("great for…", "like a real plant"), no hedging, **no lead-in paragraphs**, and no
  sentence that would still read fine if deleted. Player-facing wording, not commit subjects.
  Tags: added / changed / fixed.
- **Concise is a CAP: ≤ 8 bullets, one line each** *(OWNER DIRECTIVE, 2026-08-04: "Update
  tracking summaries/lists should be concise."; the number is the agent's operational reading
  of it)*. **Aggregate, do not enumerate** — one line for a system's worth of work, not one per
  commit. Do not derive it one-to-one from `CHANGELOG.md`: that file is dense on purpose and a
  single item there runs 30 lines. More than 8 lines' worth? Group by system and summarise.

This is the **public** page. `CHANGELOG.md` and `BUILD_DECISIONS.md` are the engineering
record and stay dense; this one does not.

If anything about the **offline download** changed — what is in it, how it is packaged, how you get it — say so here and check `download.html` still matches. That page is the only route a player has to the download, and it is easy to ship a release where the file changed and the page describing it did not.

Then set the same version in `site/release.js` (`RD_RELEASE`). The two must match.

### …and roll `CHANGELOG.md` in the same breath — this is the step that gets skipped

Rename the developer changelog's `## [Unreleased]` heading to the version being shipped and
open a fresh empty one above it:

```markdown
## [Unreleased]

## [Alpha X.Y.Z] — YYYY-MM-DD      <- was "## [Unreleased]"
```

The date must be the same one you just wrote into `changelog.html`.

**Do not skip this because it looks like bookkeeping.** It was skipped for **Alpha 1.10.0 and
again for 1.11.0** — 434 lines covering two shipped releases sat under `[Unreleased]` with the
newest version heading in the file reading 1.9.0. It went unnoticed because nothing downstream
reads that heading: the file parses, renders and reads plausibly either way. And it compounds —
by the third release the boundaries between versions can only be recovered by diffing the file
at each tag, which is what it took to repair it.

`node test/run_release.js` now fails if you skip it (it also cross-checks the dates and the
version across all three files). **Run it before the merge, not after** — after the merge it
is a red gate on `main`.

## 4. Check the offline download, but do NOT hand-publish it

```bash
node tools/make_portable.js          # -> dist/Reactor_Dynamics_Alpha_X_Y_Z.html
node test/run_portable.js            # must pass
node site/make_download.js           # -> download/<name>.zip + download/latest.zip
```

**Run these AFTER the version bump**, because the filename and the stamp inside both come
from `site/release.js`. Building first produces a file named for the *previous* release —
which is the whole of #258.

**A LOCAL run is named `…_dev.zip`, and that is correct, not a bug to chase** (#414,
2026-08-09). Off the released channel the name carries the build — `site/stamp_version.js`
stamps `preview` on the test site and the local placeholder says `dev` — so only a real
production deploy produces the bare `Reactor_Dynamics_Alpha_X.Y.Z.zip`. That is the whole
point: a tester's download can no longer be confused with the release. `downloadName()` in
`site/make_download.js` is the one derivation; `site/nav.js` takes the name from
`download/manifest.js` rather than rebuilding it.

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
# STOP. Confirm the PRODUCTION deployment exists (§5b) BEFORE pushing develop.
git checkout develop && git merge --ff-only main && git push origin develop
```

**Ruleset off (direct):**
```bash
git checkout main && git merge --no-ff develop && git push origin main
# STOP. Confirm the PRODUCTION deployment exists (§5b) BEFORE pushing develop.
git checkout develop && git push origin develop
```

### 5b. CONFIRM A **PRODUCTION** DEPLOYMENT, AND DO NOT PUSH `develop` UNTIL IT EXISTS

**This step exists because Alpha 1.0.0 shipped without going live** *(OWNER, 2026-08-04:
"Why is it taking so long to deploy?" → "Let's fix the gap and release.")*. `main` was correct,
the tag was correct, CI was green, and the Vercel commit status said **success** — but the only
deployment created for that commit was a **Preview**, aliased to a `*.vercel.app` URL. The
production domain went on serving the *previous* release for half an hour, and nothing anywhere
said so.

```bash
node tools/verify_release_deploy.js          # exit 0 = live, exit 1 = not. Defaults to HEAD.
```

**It is a script rather than a command to paste because the pasted version failed twice**,
both times in ways a careful reader would not catch:

- It wrote the sha as `?sha=<SHA>`. The GitHub API needs the **full 40 characters** —
  `?sha=c918667` returns **zero** deployments for a commit that has two, and an empty result
  reads exactly like "production is missing", whose documented remedy is to go promote a
  deployment by hand. A false alarm that invites an unnecessary intervention.
- It only knew Vercel. Every GitHub deployment on this repo is created by `vercel[bot]`, so
  after the Cloudflare move (#413) the query returns nothing on **every** release, for ever.
- **Its Vercel half read the deployment RECORD and never the build OUTCOME**, so it could not
  fail (2026-08-09). Measured on Alpha 1.5.1: it printed `vercel PRODUCTION` for a deployment
  whose only status is `failure — "Deployment was blocked"`. See below.
- **It said "wrangler carries its own OAuth, nothing to put in an environment variable" — a
  claim about the ENVIRONMENT, not about the script** (#494, 2026-08-19). Wrangler prefers
  `CLOUDFLARE_API_TOKEN` over its stored OAuth whenever that variable exists, and the token
  this project keeps there is the **Analytics Engine** token from the ops runbook, with no
  Pages permission. Measured on Alpha 1.6.1, same shell, one variable apart: token set →
  `Authentication error [code: 10000]` and a yellow line; `env -u CLOUDFLARE_API_TOKEN` →
  PRODUCTION found. So for every agent who had followed the telemetry setup, the check had no
  reachable state in which it said NOT LIVE and meant it. **Fixed**: OAuth is now taken
  deliberately, credentials scrubbed from the child env, with a credential retry behind it.

**It now checks the LIVE ORIGIN as well, and that half outranks the record** (#494, 2026-08-19).
It fetches `site/version.js` from `https://reactordynamics.com` and compares the commit stamped
into it. Measured on `bb67a83` — Alpha 1.6.0's commit, six hours after the domain stopped
serving it — the record-only version said **LIVE, exit 0**; that is the Alpha 1.0.0 shape, blessed
by the file written to catch it. A production deployment record for a commit exists for ever;
which one the domain points at is the thing that changes. **A build that succeeded and a domain
that serves it are different claims.** An unreadable origin falls back to the record and says so
in plain text — unreachable is not wrong.

The script queries `wrangler pages deployment list`, demands a full sha, and requires the
deployment to be BOTH `environment=production` AND finished successfully — a queued, blocked or
failed build is not a live site. A yellow "could not query" line means Cloudflare was
unreachable, which is **not** the same as "no deployment"; the script says so in its own failure
text. **Read which yellow line you got** — `BOTH auth paths failed` names the wrangler error for
the OAuth attempt and for each credential variable separately, so an expired login, a
wrong-scope token and a Cloudflare outage are three distinguishable states rather than one
shrug.

**It is Cloudflare-only from 2026-08-10.** The owner disconnected Vercel's GitHub integration, so
no `vercel[bot]` record is created for any new commit — verified before the code was removed:
`develop`'s tip had **zero** deployment records where every earlier tip had one. A branch that
can only ever say "nothing here" is failure (2) above wearing the other host's name. The Vercel
project survives a while as the two-DNS-record rollback, which this check does not need: a
rollback serves the last good build, not the one being released.

**A green commit status is NOT evidence of a production deploy** — a preview satisfies it. Nor is
`environment=Production` on its own, which is the trap that produced failure (4): **a deployment
record is created when the build is REQUESTED and keeps that environment whatever happens next.**

**The ordering above is the fix, and it is the suspected cause.** Pushing `develop` to the *same
commit* seconds after the merge gives Vercel two events for one SHA; measured on Alpha 1.0.0, only
one deployment was created and it was the preview. The release before it got Production **and**
Preview 11 s apart for its shared SHA, so a preview-only outcome is not normal. Let production
deploy from `main` first, confirm it, and only then fast-forward `develop`. That inference is from
the outside — the deployment records and the timing — not from anything visible inside Vercel.

**If production is missing:** promoting the preview in the dashboard is one click and needs no
build, but it is the owner's to do. Otherwise a **new commit** on `main` is required — a duplicate
SHA will not produce one. Do not wait: it will not arrive on its own.

Then tag and push tags — **tags go separately, a PR does not carry them**:

```bash
git tag -a v<X.Y.Z> -m "Alpha X.Y.Z — <headline>"
git push origin --tags
```

### 5c. The TELEMETRY WORKER is a second deployment, and the release does not carry it

`§5b` proves the **site** is live. It says nothing about `worker/`, which is a Cloudflare
**Worker**, ships by hand, and is touched by no part of the repo build:

```bash
node tools/verify_worker_deploy.js     # exit 0 = live is at or ahead of worker/
```

**Exit 2 means the ops dashboard you are about to read the release's numbers on is running
older code than this tree.** That is not hypothetical: the #485 fix was committed 2026-08-17,
never deployed, closed `status-work-complete` on 2026-08-30, and the owner reported the identical
symptom again on 2026-08-31 — fifteen days of a green `run_dashboard_time` over a stale live
Worker. Ship it with `env -u CLOUDFLARE_API_TOKEN npx wrangler deploy --config <repo>/worker/wrangler.toml`
— by absolute path, because from the repo root `wrangler deploy` finds the **Pages** project,
auto-answers its own confirmation `yes` non-interactively, and invents a Worker name from the
directory (measured 2026-08-31: `eactor--ynamics`).

It is a release step and not a gate because reading the live deployment needs wrangler's OAuth,
which CI does not have — so nothing else will ever tell you.

## 6. Leave every lane on the released commit

```bash
git -C C:/grok_build/RD_workbench merge --ff-only develop
git -C C:/grok_build/RD_backshop  merge --ff-only develop
```

## Checklist — all of it, or it is not a release

- [ ] Lanes merged, `develop` == `origin/develop`, working tree clean
- [ ] `node test/run_all.js` → **OK**, on the exact commit being released
- [ ] Version decided by **reading** `changelog.html` + `site/release.js`, and they agree —
      **except at launch, where it is `Alpha 1.0.0` and there is nothing to read**
- [ ] `changelog.html` entry added at the top, player-facing, dated both ways, **≤ 8 one-line
      bullets**; at launch, the *"Awaiting public launch"* `log-note-block` **deleted**
- [ ] `site/release.js` bumped to match — **in the same change as the entry**, or the gate is
      red in one direction or the other
- [ ] **`CHANGELOG.md`'s `## [Unreleased]` renamed to `## [Alpha X.Y.Z] — YYYY-MM-DD`**, fresh
      empty `[Unreleased]` above it
- [ ] **Launch only:** the eight **pre-launch** `## [Alpha 1.7.0]`…`## [Alpha 1.11.0]` headings
      relabelled so they no longer parse as released versions, or `run_release` is RED on
      newest-first ordering — see the banner. Keep them as separate sections
- [ ] `node test/run_release.js` → **OK**, run BEFORE the merge — after it, it is a red gate on
      `main`. At launch it goes **8 → 11**; put that in `BASELINES` and CLAUDE.md
- [ ] **Launch only:** manual set rewritten to a single **Rev 0** row, stamped and packed;
      `run_manual_rev` green. See **#282**
- [ ] **`make_portable.js` + `make_download.js` re-run AFTER the bump**, `run_portable` green —
      as VERIFICATION; neither artifact is committed, the deploy builds the published one. Built
      before the bump it names itself for the *previous* release, which is the whole of #258
- [ ] `download.html` still describes what actually ships, and the changelog says so if it changed
- [ ] Ruleset checked, and a **403 read as “private repo, no ruleset”** rather than as an error
- [ ] Merged the way the ruleset check indicated
- [ ] **A `environment=Production` deployment EXISTS for the released SHA (§5b)** — checked with
      `gh api`, not inferred from a green "Vercel — success" status, which a *preview* satisfies
- [ ] `develop` fast-forwarded and pushed **only after** that production deployment exists —
      pushing it to the same SHA first is what cost Alpha 1.0.0 its production build
- [ ] Annotated tag pushed separately (`git push origin --tags`) — a PR does not carry it
- [ ] All three lanes fast-forwarded to the released commit
- [ ] **`node tools/verify_worker_deploy.js` → exit 0 (§5c)** — the telemetry Worker is a
      SECOND deployment the release does not carry, and no gate can see that it is stale
- [ ] **After the deploy lands:** confirm the live `site/version.js` carries the released
      commit FIRST, then that `download/latest.zip` exists and unzips. A 404 before the
      stamp matches means “not deployed yet”, not “build broken”. **And if the stamp never
      changes, stop waiting and check §5b** — a missing production deployment looks exactly
      like a slow one from the outside, for ever.
