# Changelog

All notable, user-visible changes to Reactor Dynamics are logged here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/); newest entries on top.

For the dense engineering rationale behind each change (spec deviations, tuning, gate
tallies) see `Blueprint/BUILD_DECISIONS.md` — this file is the skimmable summary.

> **Releasing:** at each `develop` → `main` merge, rename the `## [Unreleased]` heading
> below to the version being shipped (`## [Alpha X.Y.Z] — YYYY-MM-DD`) and open a fresh
> empty `## [Unreleased]` above it. The version must match the top entry of
> `changelog.html` and the string in `site/release.js`.
>
> **`node test/run_release.js` enforces that** (2026-07-31). This paragraph on its own did not:
> the roll was skipped for **Alpha 1.10.0 and again for 1.11.0**, and 434 lines covering two
> shipped releases sat below as unreleased while the newest version heading here read 1.9.0.
> It survives being skipped because nothing downstream reads these headings — the file renders
> and reads plausibly either way — and it compounds, because once two releases are merged into
> one block the boundaries can only be recovered by diffing this file at each tag. Which is
> what it took.
>
> **`## [Pre-launch 1.x.y]` headings are DEVELOPMENT versions, not releases** (2026-08-04). The
> project versioned itself `Alpha 1.2.0` → `1.11.0` before it was ever public, then dropped the
> number entirely for `Pre Alpha`, and the first *real* release is **`Alpha 1.0.0`** below. Those
> older sections keep their content and dates and are simply relabelled, because `1.0.0` sorting
> above `1.11.0` fails the gate's newest-first check — measured, **10 checks / 1 failed** before
> the relabel and **11 / 0** after. They are relabelled INDIVIDUALLY rather than merged into one
> catch-all, for the reason the paragraph above gives: merged boundaries cost a tag diff to
> recover. Nothing below `Alpha 1.0.0` was ever downloadable.

## [Unreleased]

## [Alpha 1.6.1] — 2026-08-18

### Documented
- **Behaviour probe TR-1m pins the load-rejection latch — and is built to RED when it is fixed**
  (#489). The state ruled accepted below now has a probe, because on §8.21's own argument a
  declared simplification that nothing pins can move silently. `run_behavior` **72 → 73 pass**.

  Three legs: rods **MANUAL** sticks (88.4 % against a 59 MWe target, dump on its 28 % cap,
  imbalance 29.1 MWe, still armed 1200 s later); rods **AUTO** clears (58.7 %, dump reseated) —
  the control that names the cause as the rod lineup rather than the arm threshold; and one MWe
  the other side of the arm pins the non-monotonicity as a **span**, 76.7 % → 88.4 %, **+11.7
  points for one megawatt less demand**.

  Its semantics are deliberately inverted: injecting a reset window the latch can reach makes it
  go red and collapses the inversion to −0.1 points. So the day `DESIGN_COMPANION` §8.30's
  operator RESET is built, this probe is what says the register entry and the catalog row retire
  together. Injection-verified five ways.

- **The steam-dump load-rejection latch cannot clear with the rods in MANUAL** (#489) *(OWNER
  RULING, 2026-08-17: selected "Accept and document it" from options I wrote — a selection, not
  verbatim words)*. **Ruled accepted; no behaviour changed.** The latch clears on
  `|load_imbalance_mwe| < dump_reject_clear_mwe` (10 MWe) — *the reactor has come back to meet the
  load* — and what brings it back is the rod controller, which **#460** took out of the shipped
  free-play lineup on 2026-08-11. Measured: a 100 → 59 MWe rejection settles the reactor at
  **88.4 %** against a 59 MWe target, an imbalance of ~29 MWe that never re-enters the reset
  window, so the dump stays pegged at its 28 % cap indefinitely (~29 MWt to the condenser at
  steady state, ridden 45 min). Power is non-monotonic across the arm: 60 MWe → 76.3 %,
  **59 MWe → 88.4 %**, a 12.1-point *rise* for one megawatt less demand. With rods in AUTO the
  latch clears normally and none of it appears.

  Accepted rather than fixed because the fix is not available in isolation: `DESIGN_COMPANION`
  §8.30 already records that this auto-clear and §8.21's 40 MWe arm threshold are **one trade** —
  the real plant can afford a far more sensitive arm only because a human de-arms it, so building
  the operator RESET without the sourced sensitive arm re-opens the #219 cliff ruling from the
  other side. Recorded at §8.30, at the constant, and as catalog **TR-1m** (documented, **not yet
  probed**).

  Separately, the 60–74 MWe **dead band** — where the dump absorbs whatever the turbine gives up
  and reactor power moves 0.6 points for 15 MWe of load — is **deferred to the PWR2 rebuild**
  *(OWNER RULING, 2026-08-17: selected "Defer to the PWR2 rebuild (#479)")* and handed to #479 as
  an acceptance case with the full load sweep.

### Changed
- **`CURRICULUM.md` Tier A re-measured — the A1 demonstration moves to 100 → 80 MWe** (#484)
  *(OWNER RULING, 2026-08-17: selected "Re-author the row" and "100→80 MWe, rods MANUAL" from
  options I wrote — selections, not verbatim words)*. A1 recorded power **100 → 57.5 %** and Tavg
  **579.3 → 602.1 °F** for a 100 → 60 MWe drop with *"rods to MANUAL"*. Bisected across 112
  commits, that measurement was taken when `rods_tavg` still had `defaultOn` — it reproduces only
  with rods in **AUTO**, and #460 made MANUAL the shipped default on 2026-08-11. **The row's
  stated condition and the lineup it was measured on disagreed**, and nothing re-checked it
  because it is prose, not a probe.

  60 MWe is also the wrong point on the current plant. With rods MANUAL the steam dump absorbs
  whatever the turbine gives up: power is pinned at **76.3–76.9 % across the whole 60–74 MWe
  span**, and below 60 MWe it *inverts* — 60 MWe → 76.3 %, **59 MWe → 88.4 %**. Power only tracks
  load at **≥ 75 MWe**, where the dump is shut. Filed separately as **#489**; not settled here.

  A1 now reads power **100.0 → 81.9 %**, Tavg **580.2 → 590.2 °F (304.5 → 310.1 °C)**, both at
  **t+15 min**, net reactivity **+0.03 pcm** — and states its lineup instead of inheriting it. The
  reactivity arithmetic re-derives: −150 pcm moderator against +158 pcm Doppler, sum ≈ 0.

  **Three further numbers on that page were stale the same way and were re-measured, not carried:**
  **A2** now carries the measured AUTO comparison (80.1 %, Tavg 573.4 °F — 16.8 °F apart from
  MANUAL at the same load); **A7**'s xenon swing (100.0 → **102.1 %** peak at 4–5 h, back through
  **99.3 %** at 12 h); **A9** moved off the A1 drop entirely to a **turbine trip**, because its
  claimed −2.45 % divergence measures ~−0.5 % on the new drop — *inside* the noise band, which
  itself measures **±1.0 %**, not the ±0.6 % claimed. On a turbine trip it is **−10.2 %**, ~10× the
  band. The **instrument-lag table** was re-taken at 0.2 s sampling: `tavg` **+3.49 s**,
  `primary_pressure` **+0.50 s**, `power_range` **+0.08 s** on a scram and **not resolvable** on a
  gentle transient, where the channel's own noise exceeds its 0.1 s lag. The table previously
  reported those as "+0.00 s", which stated a measurement where there was only a resolution limit.

### Fixed
- **The ops dashboard's 7-day traffic window returned rounded counts for four hours a day**
  (#485). Every figure on the analytics page read `±10` in the **Exact** column — By day, Top
  pages, Referrers, Countries and Devices together, because all five share one window start.
  Reported from the live page, and it had been true since the entry below landed.

  Cloudflare RUM holds full resolution behind a **fixed retention edge at 00:00 UTC of
  (today − 7 days)**. It is a cliff, not a slope — measured one second either side:
  `datetime_geq 2026-08-09T23:59:59Z` answers at sampleInterval **10** (50 pageloads),
  `2026-08-10T00:00:00Z` at sampleInterval **1** (67).

  The Eastern alignment below crosses it. `now − 7×24h` taken between 00:00 and 04:00 UTC —
  **8 pm to midnight Eastern** — is already in the *previous* Eastern day, so its midnight
  lands **20 hours** the wrong side of the edge. The UTC-midnight expression it replaced sat
  exactly *on* the edge at every hour of the day, which is why the 7d view had always been
  exact and why nothing looked wrong in daylight. Measured at the reported instant
  (21:39 ET): start `2026-08-09T04:00Z` → ±10, **60** pageloads / **40** visits, against
  start `2026-08-10T00:00Z` → exact, **67** / **50**.

  `windowStartMs()` now takes the later of the Eastern midnight and the edge, and **only**
  inside the full-resolution window — at 14/30/90 days the coarse tier is unavoidable and
  trimming the start there would silently shorten the window that was asked for. The clamp
  costs a short oldest bucket, which is the misreading the entry below exists to remove, so
  that row is labelled `(partial)` with a note under the table.

  The re-grouping in the entry below was the obvious suspect and is innocent — `date`,
  `datetimeHour` and `requestPath` all return the same sampleInterval at the same window
  (1 at a 169.7 h span, 10 at 189.7 h). That half *was* measured against the tier before it
  landed; the window-boundary half, in the same commit, was not.

  Also: the coarse-tier warning opened **"Window > 7 days:"** — a claim about the window
  rather than about the answer, and false for every one of the four hours a day the 7d view
  was rounding. It named the wrong cause to the one person who could have caught it.

  `run_dashboard_time` 12/12 64 → **14/14 87** (the window start over 8760 hours of 2026;
  the partial label), injection-verified ten ways. **Not deployed** — the Worker ships by
  hand and wrangler is not on this machine's PATH.

### Changed
- **The rebuilt pressurizer (#472) computes the plant's pressure and level end to end,
  behind its flag — and a reactor trip now drops 231 psi and stays there.** Phase 3b:
  `stepPressure` and `stepLevel` stop delegating to v1. Three regimes replace v1's ~300
  lines of summed authorities — the saturated/blowdown branch ported nearly verbatim (its
  subject is *loop* flashing, which is #474's), a solid branch where spray and heater
  flashing are zero by construction rather than by patch, and the two-region bubbled model
  that is the actual rebuild. `P_restore_rate_gain` does not exist in v2 and **nothing
  replaces it**: pressure-holding becomes the automatic channel's job. Measured full stack
  in a manual lineup against v1's Phase-1 figures — a load cut peaks **+73 psi** and settles
  12 psi BELOW start (v1: +27 and exactly 0); a trip troughs **−231 psi** and stays down
  (v1: −54, back to setpoint on 0 % heaters); with the channel engaged the heaters recover a
  −24 psi dip in ~3 min (v1: flat 2235 psi, heaters peaking at 1.77 %); a manual heater press
  reaches the PORV in ~40 s instead of 5, and no longer ends in safety injection. Settled
  level agrees with v1 to **0.01 points**. Shipped plant untouched: the flag is off, v1's
  code is not edited, `run_all` is 51 runners at baseline.
- **`test/run_pzr2.js` — the first gate over any of that model, and it found five defects
  in code that had already been committed as working.** Four commits of two-region
  thermodynamics had no consumer at all: `stepRegions`, `solveFlash` and `pressureFrom` were
  called only by their own file, so every number in those commit messages came from a
  throwaway script. The heater bank computed **zero** authority (two config keys the code
  read did not exist — both `undefined` silently selects the wrong branch); the flash
  bracket was sized off delivered energy alone, so a pressure change from relief or an
  outsurge could flash nothing (60 kg of steam drawn boiled **0.2 kg** of liquid, pressure
  falling 665 psi where the vessel should boil to hold it up — now 112 psi and 58.8 kg); the
  step returned a pressure the state did not hold, a two-step zigzag with pressure RISING on
  alternate steps while steam was drawn out; the inner fixed point ran three passes and
  stopped 6 % short of its own root (fixed by making the passes cheap — v1's saturation line
  is a power law, so its inverse is closed-form, and the steam-density solve is the exact
  inverse of its own table); and v2 seeded the regions from a **published reading** the
  engine initialises to 0, so every run started with an empty vessel. 38 checks,
  injection-verified 17 ways — three of which walked through the checks as first written.
- **The ops dashboard now reads Eastern time on every view, day buckets included**
  *(OWNER DIRECTIVE, 2026-08-13: "I need all dates in times in my telemetry site to be in eastern
  time.")*. The 2026-08-12 pass converted the point-in-time stamps and deliberately stopped at the
  traffic table's **By day** rows, because those are buckets the upstream API groups on UTC
  calendar days — the row marked `2026-08-11` holds 20:00 on the 10th through 20:00 on the 11th
  Eastern, so stamping "ET" on the label without re-grouping the query moves four or five hours of
  every day's counts into the neighbouring row *and looks entirely correct*. The finished job
  re-groups instead of relabelling: `analytics.js` asks Web Analytics RUM for `datetimeHour` and
  sums the hours into Eastern days here-side (an hour never straddles an Eastern midnight, so the
  sum is exact), and the query window is aligned to Eastern midnight rather than UTC midnight so
  the oldest row is a whole day instead of the last 19 or 20 hours of one. **Measured on the live
  dataset before the change**: hourly and daily grouping return identical totals at the same
  `sampleInterval` over 7 / 30 / 90 days (67/51, 50/40, 50/40 pageloads/visits), so the finer
  grouping neither loses rows nor drops to a coarser sampling tier. On the live 30-day window the
  re-bucket moves 10 pageloads off `2026-08-09` onto `2026-08-08`, which is the shift the old
  header was warning about. Storage and queries **stay UTC** and must: Analytics Engine stores
  UTC, the SQL windows are relative, the GraphQL filter accepts only UTC, and the R2 bundle keys
  are UTC day prefixes — only what is displayed is converted. Sessions and Analytics now state the
  zone on the page the way the reports view already did.
- **New gate `test/run_dashboard_time.js` — 12/12, 64 checks.** The dashboard had no gate at all,
  and every way this rots is silent. **DST is the one worth naming**: the implementation that
  looks obviously safe — sample the zone offset at **noon**, well away from the 02:00 switch — is
  wrong on exactly the two days a year the exercise is about, and in *opposite* directions. It
  dates 2026-03-08 an hour early (04:00Z, when 00:00 EST is 05:00Z) and 2026-11-01 an hour late,
  losing that day's first hour. It was the first implementation here, and it passed every check
  written against an ordinary day; the fix is a two-pass fixed point (guess with the offset at the
  wall time read as UTC, then re-read the offset at the guess), and all four transition cases plus
  a 365-day sweep are pinned. The static half also pins the re-group so it cannot quietly become a
  relabel again, and pins storage staying UTC so a later pass cannot walk past the display layer.
  It **strips comments before scanning** — every file here argues about UTC at length, and an
  unstripped scan passes green on the prose. Injection-verified, five ways: noon offset → 61/64,
  `datetimeHour` reverted to `date` → 62/64, column relabelled `Date (UTC)` → 62/64, a view
  printing a raw Analytics Engine stamp → 63/64, UTC-midnight window → 62/64.

- **The PWR behaviour catalog is unfrozen (v3.1 → v4.0-DRAFT) for the #472 pressurizer
  rebuild, and its freeze now has a gate.** The v3.1 "FROZEN-FINAL" label had no mechanical
  lock — 39 probe IDs in the behaviour battery (nearly the whole CA-7…CA-25 pressurizer
  block) had no catalog row, and the battery's stamps read v2.0 for over a year. v4.0-DRAFT
  absorbs all 39 as rows (§13 FG-8 pressurizer, §14 non-pressurizer), adds 18 rebuild
  acceptance rows (manual-first pressure authority, the TMI deception named and numbered,
  heater elevation), and the new `CAT-1` probe fails the gate if catalog and battery ever
  diverge again (`run_behavior` 73pass 1xfail). Owner ruling on the amended set pending.

### Fixed
- **Shutdown cooling can no longer be placed in service during a safety injection — they are the
  same pumps** (#458). The RHR pumps *are* the low-head half of the merged HPI/LPI system, and a
  real plant runs them in two mutually exclusive alignments: **injection** (suction from the
  refueling water tank, heat exchangers **uncooled** — WTSM 5.2 §5.2.4.5, ML11223A220:
  *"the RHR pumps start and recirculate water through the uncooled RHR heat exchangers"*) and
  **shutdown cooling** (hot-leg suction through 8701/8702, heat exchangers on component cooling
  water). This plant carried **one** `rhr_active` flag for both, gated only on the 400 psi
  (2.76 MPa) block-open permissive — which a loss-of-coolant accident satisfies in **20 seconds**
  at full severity. Measured full stack: aligning RHR into a large break removed **4.28 heat units
  against 0.49 units of decay heat — 8.8×**, about 66 MWt in this model's currency, at a primary
  void fraction of **0.788**, i.e. a centrifugal pump taking suction on 79 % steam. **It was not a
  curiosity: the board asked for it.** PWR-A33 *RHR NOT IN SERVICE* annunciates at **t+191 s** of
  that same run — correctly, it means "you are on injection, not on shutdown cooling" — and
  `Manuals/06`'s response for the tile said *"Re-align RHR from the ECCS side of the board"* with
  no accident carve-out. `set_rhr {active:true}` is now refused while SI is running, with a
  labelled message; `{active:false}` never is. **This is NOT presented as a plant interlock** —
  no document in any lane's corpus gives 8701/8702 a safety-injection inhibit, and inventing one
  would repeat #453's error of reading a lineup fact as an automatic function. Declared as a
  departure in `Manuals/12` §12.20, which also names what the trainer genuinely cannot do: a real
  plant's exit is the **sump swap-over on refueling-water-tank depletion**, and there is no such
  inventory node here, so its accidents stay in the injection phase for ever.
- **The control kernel could not release an interlock keyed on a boolean** (#458). `_evalInterlocks`
  engages through `crossed()` (which learned `is_true`/`is_false` at #314) but clears through a
  hysteresis band — `v < clears_below` / `v > clears_above` — and a boolean has no band. Latent
  until now because no interlock had ever been authored on a status instrument. **The failure is
  the opposite of the obvious one:** a boolean row carries `setpoint: null`, so the clear arm asks
  `true > null`, which is `1 > 0`, so the interlock released on the very next pass with its own
  signal still standing and blocked nothing at all. Injection-verified in `run_m4`: reverting the
  branch reddens exactly 5 checks across two suites and nothing else in 46.
- **A release can no longer serve new HTML against the previous release's stylesheet** (#470).
  `ui/shell.html` is served `Cache-Control: max-age=0, must-revalidate` while `ui/shell.css` is
  `max-age=14400` and was referenced as a bare `href="shell.css"` — and `must-revalidate` does
  nothing until `max-age` expires. So anyone who had loaded the sim in the four hours before a
  release got that release's HTML against the previous release's CSS, and every element whose
  styling was new in it drew unstyled. Reported on the live Alpha 1.6.0 as the chart text
  "crammed on the left edge"; reproduced by serving the release HTML with 1.5.2's stylesheet
  (`.lane-chrome` computes `position: static`, `.cs-row` matches no rule at all). It never
  showed in testing because **testing always loads cold**. `site/build_site.js` now appends
  `?v=<build sha>` to every local `.css`/`.js` reference in the published HTML — 131 urls — so
  a release requests urls no cache has seen while repeat visits *within* a release still hit
  the four-hour cache. The three version stamps (`version.js`, `release.js`, `manifest.js`) are
  excluded: they are already `no-cache`, and pinning them to the build that emitted them is the
  opposite of their job. Measured live on the develop preview: `shell.css?v=b06dcd8`.
- **Two dev harnesses are no longer published to the live site** (#476). `ui/test_panel/board_check`
  and `ui/test_panel/lane_reference` both answered **200 on reactordynamics.com** — the
  published/withheld partition covers the root `*.html` glob only, while each asset directory
  is copied wholesale, so being one directory deeper was their whole exemption. Withheld now
  via a `WITHHELD_DIRS` declaration beside `NOT_PUBLISHED`.
- **Turbine roll moves to 10–15 % power, where the real plant does it.** `Manuals/04` PWR-N05
  said Mode 2, ≤ 5 %. Real practice: *"To minimize primary plant transients, the turbine is
  rolled with reactor power between 10 and 15 percent"* (WTSM §19.3, ML11223A342). The reason is
  the steam balance — at 10–15 % the dumps already pass that flow, so as the governor valves open
  the dumps modulate shut and **total steam flow barely changes**. The shipped `pwr_startup`
  checklist has always done it correctly (~12 %, both startup trips blocked, then Connect Grid)
  and is gated by `run_procedures_stack`: **the manual contradicted a passing gate, and the
  manual was the wrong one.**
- **SHUTDOWN MARGIN is defined, and stops being used for a different quantity** — new
  `09 §7.5.3`. SDM is computed with all rods assumed inserted except the highest-worth stuck
  rod; this set used the name for *net reactivity as the rods happen to sit*. The two coincided
  only while the Mode 5 shutdown bank was parked withdrawn, which since #468 it is not.
  Measured cold at 857 ppm: **−4676 pcm** both banks in, **−1000 pcm** bank withdrawn, boron's
  own **~1000 pcm**, bank worth **3676 pcm** — and the operational point, that withdrawing the
  bank spends the margin buying you **time** (79 min to criticality on an unattended dilution
  with it in; a source-range trip inside the hour with it out).
- **The psia/psig convention is declared** — new note at `09 §3.0`. Every pressure in the manual
  set is absolute; Westinghouse quotes pressurizer setpoints in gauge, 14.7 psi apart. Our 2235
  reads the real 2235 *psig* as absolute, while our PORV 2350 **is** the real 2335 psig correctly
  converted — so the nominal-to-PORV margin is 115 psi against a real 100. **Declared rather than
  fixed**: 2235 is the plant's pressure anchor, and re-anchoring it for 15 psi of margin fidelity
  would re-baseline every equilibrium, initial condition, alarm band and scenario for no
  behavioural gain.
- **Mode 5 starts with the shutdown bank IN, and withdrawing it is now a step** (#468). The
  `Cold Shutdown (Mode 5)` preset shipped with the shutdown rods already parked fully out —
  not as a property of Mode 5 but of the engine *constructor*, which placed every rod group
  at its withdrawn position for every initial condition. It did not match this plant's own
  shutdown path: measured, a scram leaves the bank at **0/912** and nothing ever re-withdraws
  it, so a player who **drove** to cold shutdown through PWR-N14/N15 ended with the trip rods
  on the bottom while a player who **loaded** cold shutdown got them out. Same mode, two
  plants. Real practice makes withdrawal an operator evolution and never an initial
  condition — the shutdown banks are *"moved into [the fully withdrawn] position at a fixed
  speed in manual bank control **prior to criticality**"* (WTSM §8.1.1, ML11223A252), verified
  on the Mode 5 → 4 leg and required complete within 15 minutes of control-bank withdrawal
  (App 19-1 A.12 / C.7, ML11223A342).
  - Mode 5 is now **ρ = −4676 pcm on 857 ppm** with both banks inserted, and **PWR-N01 gains
    step 2a** — withdraw the bank, 912 steps, ~3 plant-minutes at Fast. N02 step 7 covers
    arriving by trip; N15 step 1 separates the boron's ~1000 pcm from the bank's 3676 pcm.
  - **Boron is unchanged at 856.1 ppm, and that took an ordering fix.** `_trimToCritical`
    solves IC boron for a fixed −1000 pcm net with rod reactivity as an *input*, so inserting
    the bank before the trim makes the solver pay for 3676 pcm of rods by removing boron —
    measured **671.3 ppm**, less than the 704.8 ppm the *hot* standby preset carries, on a
    *cold* plant, where withdrawing the bank alone would then take it critical. The bank is
    placed after the trim; the ordering is commented at both ends.
  - The margin is worth something measurable: an unattended dilution at the plant make-up
    rate reaches criticality in **79 minutes** with the bank in, against a source-range trip
    inside the hour with it out. `ops_shutdown_dilution` now runs two hours, keeps its
    original source-range assertion (which passes on **both** presets) and asserts the first
    hour does *not* reach criticality.
- **`Manuals/04` §5.0 no longer claims the RCS heatup/cooldown rate limit is unsourced.**
  100 °F/hr is sourced twice in the corpus (ML11223A342 App 19-1; ML11223A213 Table 3.2-10),
  was ruled on 2026-08-09 (#398, *"100 F/hr TS + 50 admin"*), and has annunciated on the board
  since #375 — only the manual's reference table still said "UNVERIFIED — no source found".
  The 90 °F/hr used in PWR-N15 is a *programme* and sits inside the limit; that was always true.

### Added
- **`test/run_site_build.js`** — the first gate that runs the deploy build and reads its
  output. Everything else about the site is static: `run_site_meta` scored 163/163 unchanged
  across the fix above, which means deleting that fix was green in every gate in the directory.
  It builds into a scratch directory (`RD_SITE_OUT`, so `dist-site/` is never touched) and asks
  the files two questions — is every `*.html` in the output a **declared** page, and does every
  local `.css`/`.js` url carry `?v=<stamp>`. The first question is what found the dev harnesses.
  31 checks, injection-verified three ways.
- **`site/build_site.js` now builds on a bare tree.** Running it in CI is what showed it never
  had: its reference walk threw on `download/latest.zip` and `download/manifest.js` whenever
  `download/` was absent, contradicting the `OPTIONAL_DIRS` declaration eight lines above it
  ("may be absent on a bare local run and that is not an error"). Only the deploy host ever ran
  the build, and there `make_download.js` runs first. References into an optional directory
  that was not built are now skipped; the directory is still fully link-checked whenever it
  exists, which is every real deploy.

## [Alpha 1.6.0] — 2026-08-12

### Changed
- **The ops dashboard lays records out as cards, and stops stretching across wide screens**
  *(OWNER, 2026-08-12: "put the data on cards instead of infinitely expandable rows"; and,
  on what that meant: "when the screen is stretched the rows become very long left to right
  with the data far from eachother. lots of wasted space")*. Bug reports and sessions render
  as cards on an auto-filling grid, so a wider screen shows **more records** rather than the
  same few with bigger gaps — five reports abreast at 1920 px, against one stretched row
  before. Long player notes clamp to five lines with the full text a click away. The page is
  width-capped and centred, and tables size to their content instead of to the window.
  Comparison tables (top pages, actions, by-day) stay tables: they are columns of numbers
  meant to be read down the column, and cards would break that alignment.
- **The ops dashboard reads Eastern time** (`worker/src/`). Bug-report times, session
  "first seen", per-event "written at" and the feature-flag "last changed" stamp all render
  in `America/New_York`, so EST/EDT switch themselves rather than being a fixed offset that
  drifts an hour every March. Headers say **(ET)**. Storage and queries are untouched and
  stay UTC. **The daily traffic table deliberately stays UTC and now says so** — those rows
  are bucketed upstream on UTC calendar days, so relabelling them ET without re-grouping the
  query would shift every count four or five hours into the neighbouring day while looking
  entirely correct. *(Website change — no simulator behaviour, so no `changelog.html` entry
  and no version bump.)*

### Added
- **The strip chart marks where the run began** *(OWNER, 2026-08-11: "The strip chart should
  have a line to show the start of the sim at time=0.")*. A dashed slate line, tagged `T+0`,
  across every lane. It marks a real join rather than the left edge: the chart opens already
  holding 30 minutes of trend, and that history is laid *before* sim time zero — at T+10 s on
  the 5-minute window, 290 s of the plot is the plant's past and 10 s is your run. It scrolls
  off once the run is older than the window, like any other moment on the chart.
- **Free play starts with rod control in MANUAL** (#460) *(OWNER DIRECTIVE, 2026-08-11: "lets
  start with rods in manual.")*. `rods_tavg` loses its `defaultOn`, reversing the 2026-08-01
  auto default (#289). The channel is otherwise untouched — same controller, same board
  control (**ROD AUTO**), same manuals, still engageable at any time; only the free-play preset
  moved. Instructed content never read `defaultOn` and is unaffected.

  The 2026-08-01 ruling's stated premise — *"everything else starts in auto"* — had expired:
  the Mode 1 free-play lineup puts generator load in MANUAL (`getStartupLineup`), so the two
  halves of the load/reactivity pair now agree.

  **Measured** (`measure_stack`, full stack, `hot_full_power`, 100 → 80 MWe):
  - The plant load-follows **without** the rods. Moderator feedback alone takes power to
    **81.8 %** and parks it, monotone, settled at **3 min 30 s**. Rods in AUTO ring the same
    step — Tavg 586.8 → 567.2 °F (308.2 → 297.3 °C), power 62 → 88 % — and are still ±1.5 pts
    at ten minutes. Manual is the better-behaved plant on this transient, not the harder one.
  - What the plant does **not** do by itself is put Tavg back on program: it settles
    **17.3 °F (9.6 °C) high**. That trim is now the operator's, and the board already draws
    the sliding Tref band, so it is visible without a new indication. HI TAVG sits 3.6 °F
    (2.0 °C) above where it parks — a cue, not a nag.
  - Manual rod control is linear and forgiving: −20 fine steps → −1.8 °F (−1.0 °C), −60 →
    −6.2 °F (−3.4 °C), ~0.1 °F (0.06 °C) per step, no overshoot at either size.
  - Inserting 60 steps moved generator load **0.8 points**. Rods set temperature; the turbine
    sets power — the Tier A coupling the AUTO channel was absorbing.

  Side effect: **#400**'s measured all-auto oscillation (12.93–13.65 points p2p at the 50 %
  plateau, never settling) leaves the shipped free-play plant. It is not fixed — the channel
  still rings when engaged, and #400 stands.

  Five behaviour probes moved with it — TR-1g, TR-1h, TR-1i, TR-1k, TR-18 — none by changing
  an assertion. All five are *about* the rod controller and were inheriting it from the preset;
  they now call a `rodsAuto()` helper, the mirror of the existing `rodsManual()`, so both
  halves of the lineup question are stated out loud and the next preset change moves neither.
  `board_check`'s three ROD AUTO checks invert (default, then both directions from it — the
  structure that made this a one-line edit per check rather than a re-diagnosis).

### Fixed
- **Auxiliary feedwater actually overcools the plant now — the steam generator was throwing
  heat away (#464).** Cold AFW is supposed to be a heat sink: at decay-heat power, full flow
  absorbs more heat than crosses the tubes, boiling stops, and the plant cools below the
  no-load point until you throttle it back. The first two happened; the third could not. The
  generator clamped steam production at zero and then simply *held* — measured, **947.1 psi
  flat for six hours** while decay heat fell to a sixth of its starting value, with the
  primary's heat still crossing into a generator that neither boiled it nor warmed on it.
  Now the excess condenses and the plant cools: **171 °F in the first hour**, slowing as it
  approaches the temperature of the feedwater itself. Nothing changes at power, and nothing
  changes while the level controller is throttling AFW normally — this is the unthrottled
  case, which is exactly the one the procedures tell you to catch. The same fix corrects AFW
  being weighed **1.56× heavier** in the heat balance than the 96 gpm the board shows for it.
- **Closing Plant & Mission leaves the plant running** *(OWNER, 2026-08-11: "When i close the
  plant menu after starting the sim the sim should start playing. it currently starts paused. it
  should start running after closing the plant & mission menu.")*. Starting Free Play closed the
  window and started the clock, and the engine swap that followed stopped it again for good — a
  pause taken to cover the rebuild that nothing ever released. A **Reset** now also lands you on
  a running plant rather than one waiting for ▶. A plant you stopped yourself with ⏸ still stays
  stopped through both.
- **Residual heat removal no longer puts itself in service during an unisolated LOCA**
  (#453). The auto-align actuation gated on RCS pressure and a reactor trip and nothing
  else, so on a small break `eccs_mode` went HPI → RHR at **t+10 min, at 381 °F (194 °C),
  at saturation, with the break still discharging** — and shutdown cooling then became the
  largest heat sink in the plant, more than every other term combined. It now also requires
  the sourced entry temperature (Tavg < 350 °F — Ginna TS Bases Rev 101, ML20339A221) and
  20 °F of subcooling, which is what expresses that source's other half, "during normal
  operations". The plant now answers a small break with **low-head injection (LPI)** as it
  should; core inventory holds **77–92 %** instead of walking to a 109 % cold-solid state.

### Changed
- **`K_spray` carries its derivation** (#450) — sourced flow (Ginna UFSAR ch.15,
  ML20339A101: "the total spray capacity was 52.2 lbm/sec"), ~8× the physical authority,
  and the measured finding that this plant's heater/spray pair is **inverted**: sourced,
  spray beats the heaters 4.7:1; modelled, the heaters beat spray 2.7:1. No behaviour change.
- **`K_heater` was swept and NOT moved** (#450). The F14 departure stands: restoring the
  sourced 25 psi spray-crack band needs `K_heater` ≈ 0.0061, about **8× below** where this
  plant's ruled ride-out character breaks, and the gain buys nothing on #447 or #451.

### Changed
- **The strip chart's settings are a full window now, and every channel can trace its
  instrument, its physics, or both (#454)** *(OWNER DIRECTIVE, 2026-08-11: "The strip chart option
  menu should be like the plant selection menu. It should be large and pause the sim. It should
  have options to customize the strip chart. It should list all the indications you can put on the
  chart with their current values. You should be able to choose the indication or the physics
  value for each. Put a radial next to each value to let the user choose so they could even choose
  both the indication and physics if they want.")*.

  Replaces the anchored ⚙ popover shipped hours earlier, reversing three of its properties by
  name: it is **large**, it is **modal**, and it **pauses**. The pause is the deliberate part —
  the popover argued that changing how you watch a transient should not stop the transient, and
  that argument does not survive the change of size, because a full-screen window covers the
  board. Closing it starts the plant again *unless you had paused it yourself*, which the named
  pause holds make expressible.

  Every one of the 120 channels is listed with **its current reading on both sides**, taken from
  the same functions the Indications tab uses, and carries **one selector per value**: neither is
  "not plotted", one is that side, both is both. A channel set to both draws **two traces in one
  lane on one shared scale** — the physics as a lighter dashed twin — and prints both figures in
  the lane's value column. One scale, not two: independently fitted axes would put an indicated
  549 °F (287 °C) and a true 551 °F (288 °C) on the same pixel and draw a disagreement as
  agreement. The CSV export follows, emitting `id_ind` and `id_phys` for a paired channel and the
  bare `id` for every other.

  A channel with only one side — decay heat, reactivity and the other physics-only quantities —
  shows a disabled selector and a dash rather than a missing cell, so the columns stay readable
  down the list and "this quantity has no instrument" is itself visible.
- **Shutdown cooling no longer puts itself in service (#453).** The RHR hot-leg suction valve
  used to open by itself whenever the reactor was tripped and pressure fell below 400 psi — so
  every depressurization after a scram aligned shutdown cooling, including a LOCA, where it
  became the largest heat sink in the plant while the break was still open. No real plant has
  that function: every RHR interlock is a *permissive* that blocks opening above pressure
  (WTSM 5.1 §5.1.3.3; NUREG-1431 SR 3.4.14.2/.3 test "prevents from being opened" and "causes
  to close" as separate things). **Placing RHR in service is now yours to do** — the ALIGN
  button, below the 400 psi interlock, after throttling the heat-exchanger split as the
  cooldown procedure already tells you. The 400 psi block-open and 600 psi autoclose
  interlocks are unchanged. The RHR **AUTO** button is gone with the automatic function it
  armed; ALIGN and ISOLATE remain.
- **Control room: ten further adjustments** *(OWNER DIRECTIVE, 2026-08-11: "Put the strip chart
  rewind button to the left of the x axis time selection. Get rid of the slider bar at the bottom
  of the chart."; "Remove the sim paused popup at the start. Sim should start running not paused…
  When the sim is paused flash the play button. All animations should stop when the sim is
  paused."; "The plant selection menu should start at page load but it does not."; "It should show
  up every time the sim is loaded… It should always the the first thing someone sees when loading
  the sim."; "Make the instructor block a tab. Make it the leftmost tab."; "Find a max height for
  the expanded scanner and pin it to that height when maximized."; "In indications tab, Make
  dedicated columns for the plant indications and physics indications so they are easier to read.
  Remove the true values button."; "Instructor and other messages like walkthroughs should be like
  teams messages. They should be persistent and scrollable only cleared when the user changes what
  that instructor block is showing with a different walkthroughs, training, etc."; "The generator
  load increase button doesn’t let the user go up more than one press due to the rate increase
  limit. Let the user raise to the desired level before starting the climb/rate limit."; "In the
  plant and mission menu show mode next to the two free play options without mode."; "The strip
  chart needs a chart settings button that brings up a dedicated strip chart options menu.")*.

  **The plant now loads RUNNING and the SIMULATION PAUSED curtain is gone** — the Plant &
  Mission window is what a cold load opens on, so the veil’s job was already done elsewhere.
  Its two affordances survive: click-to-resume became the ▶ button, which now flashes while
  paused, and the quick tour is on Help. **Pausing now actually stops the board**: the freeze rode
  on the snapshot’s `running` flag, and pausing is precisely when snapshots stop arriving, so
  105 of 112 animations kept running behind a stopped clock. **The Plant & Mission window opens on
  every load, with no deep-link exemption** — the old bypass list contained `engine=` and the
  site links `?engine=pwr`, so no visitor arriving normally had ever seen it.

  **The Instructor is now the leftmost tab** rather than a card in a two-card accordion, and its
  messages are a **persistent, scrollable transcript**: walkthrough steps and instructor guidance
  accumulate instead of overwriting one another, and the log clears only when you change what the
  panel is showing. **The strip chart** loses its slider bar (a track that looked draggable and
  was a single click target duplicating click-to-pick on the plot), moves Rewind beside the window
  buttons, and gains a **chart settings panel** listing all 120 plottable channels with a filter,
  the window ladder, the event ribbon and CSV. *(That panel was an anchored popover that
  deliberately did not pause; the owner's follow-up reversed its size, its modality and its pause
  behaviour, and it is superseded by the window described under #454 below.)* **Indications** gain headed Plant and
  Physics columns and lose the true-values button. **The expanded System Scanner is pinned to one
  height** (140 px, measured: the tallest of 133 descriptions renders 127 px) instead of resizing
  under every hover. **The generator load spinner reads your demand, not the ramping reference**,
  so you can dial a target and let the machine walk there — ten presses now move it 50 →
  60 MW where they previously moved it 50 → 50. The rate limit itself is unchanged. **Free-play
  starting conditions all name their Mode.**
- **Safety injection now sheds the pressurizer heaters, and so does a loss of offsite power
  (#447).** They stay off until you deliberately put them back — HEATER AUTO, MANUAL, OFF or
  the % box all count as the reload, and a new **PZR HTRS SHED** indication says why heater
  power is reading zero. Sourced: NUREG-0737 II.E.3.1 Clarification (7) requires the shed on
  an SI signal; Ginna TS Bases B 3.4.9 adds the LOOP half and the manual reload onto the
  diesels. Fixes a ~40 s pressure/level limit cycle that ran for hours after **every** LOCA
  severity (measured: 134 heater cycles at severity 0.05 with an 839 psia excursion, up to
  936 at 1.00) and flooded the alarm log — the heaters were returning to full power every
  time ECCS refilled the pressurizer past 20 %. The plant now settles into long-term cooling
  instead. The previous behaviour, where a loss of offsite power left the heaters running,
  was a misreading of that same NUREG requirement.

### Added
- **Ops dashboard on the telemetry Worker** — `GET /dashboard?token=T`, token-gated and
  read-only, in two views. **Bug reports** (`worker/src/dashboard.js`): list + detail + raw
  JSON over the R2 bundles, so reading player feedback no longer needs the throwaway
  `wrangler dev --remote` reader (`tools/fetch_bug_reports.js` still works and is unchanged).
  **Analytics** (`worker/src/analytics.js`): Web Analytics traffic and in-sim usage over
  7/14/30-day windows — the same numbers `tools/site_report.js` prints, cross-checked against
  it row for row, with the coarse-tier rounding shown per row instead of quoted as exact.
  **Sessions** (`worker/src/sessions.js`): one row per session, click through to the ordered
  trace of what was pressed and opened. It states its own limits on the page rather than
  implying a replay — the rows are sampled (`command` stored 42 raw against 64 estimated),
  the timestamp is the batch flush and not the press, and a session is a browser tab rather
  than a sitting. Needs a `CF_ANALYTICS_TOKEN` secret because the `EVENTS` binding is
  write-only: a Worker cannot read its own Analytics Engine dataset. Ops-only, not part of
  the sim — see `worker/README.md` → "The ops dashboard".
- **Per-event timing and refused commands are kept instead of discarded.** `site/telemetry.js`
  has always stamped each event with `t` (seconds since page load) and put it on the wire;
  `command.blocked` has been declared and emitted since it was added. The Worker read neither,
  so a session's order was unrecoverable and every refused command was recorded as though it
  succeeded. Both now have columns and both produce data from the deploy, with no release
  needed — the clients already in the wild were already sending them. Verified in a real
  browser: six events sharing one batch write time, ordered 0:01/0:01/0:01/0:05/0:06/0:06.
  Adds a "controls people try but cannot use" view (with the rate beside the count) and a
  session trace that marks page reloads. `privacy.html` now discloses the refusal flag, which
  it never had, and its "counts" framing is corrected.

- **Feature flags are set from the dashboard and applied at build.** A Features tab shows
  what the live sim gates — read from the deployed `flags.js`, not the repo — and sets the
  stage for all 6 areas and all 64 content items. The dashboard writes to KV;
  `site/stamp_version.js` reads it at build and freezes it into the generated
  `site/channel.js`, so the sim still loads nothing at runtime and the offline single-file
  build keeps working. Changes are therefore **queued until the next deploy**, and the tab
  shows live and queued stages side by side. `free_play` and `manual` cannot be set below
  public, refused at both ends. Inactive until `RD_FLAGS_ENDPOINT` is set in the Pages
  build environment; unset behaves exactly as before.

- **A selection screen on start, and the session bar as the front door (#443, spec §9).**
  A cold load now opens on a plant × activity picker (PWR / Free Play preselected, so pressing
  straight through costs one click); a returning visitor gets **Resume — PWR · Free Play** with
  the pickers folded behind *Change*. Campaign and Scenarios hand off to the existing Plant &
  Mission window rather than duplicating it. **Reset moved into that window's session footer**
  as a two-press arm — "reset is restart what the session bar describes" — replacing a browser
  `confirm()`. Three persistent **coach marks** (session bar, Checklists, Feedback) wait as cyan
  dots until first use, then retire; they are not a timed tour. Deep links (`?engine=`, `?run=1`,
  `?follow=` …) bypass the screen: the URL already made the choice.
- **`RD.Events` — one sequence-of-events stream (#437, `ui/event_stream.js`).** Discrete plant
  occurrences (scram, turbine trip, safety injection, mode change, PORV/MSIV position, pump
  starts and stops) plus operator commands, each stamped at emission with a **priority tier**
  (1 plant-defining / 2 component / 3 minor), a **component reference** resolvable through the
  board's highlight vocabulary, and an **actor** — operator action vs plant response. Edges are
  detected at the service/UI seam and the bug-report recorder is the *only* detector of alarm
  and scram transitions, feeding the stream through its existing hook, so the two cannot
  disagree. New gate `test/run_events.js` (40 checks) — it caught two observer artefacts before
  the file landed: the recorder's first-pass alarm sweep arriving as **46 `alarm_clear` events at
  t=0** (a steady 20 s at power now produces 0), and a watched channel that was an instrument
  with no `true_state` field behind it.

- **The splitters give the lane stack more rows, not taller ones (#445, spec §8).** Dragging the
  trend strip taller **promotes demoted channels back to full traces** rather than inflating the
  ones already there — measured: 230 px → 375 px took the stack from 3 lanes + 3 numeric rows to
  **6 lanes at 51 px**, inside the 44–56 target and above the 36 px floor. **Double-click resets
  an axis** and hands it back to auto-fit, because users will drag themselves into a corner and
  the way back has to be obvious. A **persisted split is re-clamped on load**: the right column
  lost the Scanner and the bottom row gained the lane stack, so a value saved by an older layout
  describes a geometry that no longer exists — an absurd stored size now opens at the nearest
  legal one instead of a broken board.
- **Checklists are ordered by relevance to the plant (#443, spec §9).** At power the normal
  operations rank first; **after a scram, post-trip response goes to the top**, the way emergency
  procedures supersede normal ones in a real control room. **Sort, do not filter:** inapplicable
  procedures collapse into a labelled group and each states *why* — "Requires RCS temperature
  near 286" — which turns the demotion into instruction rather than hiding a checklist a player
  saw yesterday. An open list never reorders under the cursor. The scoring lives in the
  instructor layer, where the preconditions are already graded instrument-first; "warn, never
  block" is untouched, since this orders a list and refuses nothing. **In free play the
  Instructor now hosts the launcher** instead of static quick-tour text. The manual gains **real
  section anchors** (`## 7.3 …` → `id="s7-3"`, so §9.1 and §9.10 are distinct) and a search over
  the packed markdown — the anchors the checklist "why" links will target.
- **One shared highlight bus (#444, spec §7, `ui/highlight_bus.js`).** Point at a channel in the
  merged list, a lane on the chart, or an event marker, and **its component lights on the
  board** — as a soft cyan halo, an outer glow that never recolors the element, so a haloed
  component in alarm still reads as in alarm. **It never lights the thing under the pointer**,
  only its relations: that is the 2026-07-28 hover-halo directive read as "no self-halo on
  non-interactive elements", and it preserves the property that nothing lighting under the
  cursor means *readout* while something lighting means *control*. Relations are **sets** —
  subcooling margin lights both the loop bulk and the core-exit thermocouple. Hover is
  transient, click pins, Escape clears, and pinned differs by **weight, not hue**. The halo
  appears rather than pulses, which is the reduced-motion answer. Built on the board's real,
  gate-validated label vocabulary — the `data-highlight-id` hooks the spec assumed exist only
  in blueprint documents for a renderer that was never built.
- **A Sequence of Events record on the chart (#442, spec §8).** Real plants have SOE recorders
  and post-trip review is conducted with them — naming it that tells an operator-minded player
  what they are looking at, and makes the chart an accident-analysis instrument rather than a
  trend display. **Tier 1** (scram, turbine trip, safety injection, mode change) draws full
  height across every lane, because a plant-defining event is context for all of them at once;
  **tier 2** (PORV, MSIV, pump starts and stops) goes in a 10 px ribbon under the axis; tier 3 is
  off. **A cascade collapses into a counted badge** — measured on a real trip: 11 events became
  one badge reading "5", where drawing them individually is one illegible pixel in a 30-minute
  window. **Operator actions are visually distinct from plant responses** (cyan against amber,
  from the actor stamped at emission, never inferred from proximity). **Clicking a marker jumps
  Rewind to that instant** — measured, T+9 back to T+1 — landing on the nearest checkpoint, which
  the copy says. The SOE exports as a second CSV alongside the trace.

### Changed
- **Seven control-room adjustments** *(OWNER DIRECTIVE, 2026-08-11: "The top edge of the boarder around the diagram takes up too much space."; "The plant and mission menu should be up when the sim page is loaded… a tooltip should point to the button that opens it again… The button should be clearly labeled."; "The scanner full description should make the scanner larger so the full description is visible. It should not open another box or window."; "The instructor block should start full size when free play is started."; "Put indications in the indications tab into one column."; "The checklist tab should always show the list of checklists. They should stay in a standard order."; "Checklists are supposed to be automatically checked off by the sim when complete. Remove the user clickable step complete button.")*.
  **The diagram's top and left borders are gone** — the board scales to its own height, so every
  pixel the top edge took came out of the diagram. **The Plant & Mission window is up on load**,
  replacing the selection screen entirely; closing it raises a brief tooltip pointing at the
  button that reopens it, and that button now says **Plant & Mission** rather than only its own
  state. **The Scanner's full description grows the line in place** instead of opening a modal —
  the description belongs beside the thing it describes, which was the point of moving it under
  the board. **The Instructor starts full size**, including on a first visit, where the previous
  code returned early and left the markup's collapsed default. **Indications render in one
  column**, superseding the 2026-08-04 two-column directive: those rows were checkboxes then and
  now carry a label, an indicated value, a true value and a divergence flag. **The Checklists tab
  always shows the list, in a standard order** — category then title — and stays visible while a
  checklist runs; the relevance *scoring* is kept for the gating labels, only the reordering is
  retired. **The manual step-complete button is gone**: every step now completes on evidence, and
  a step with no `acc`/`saw`/`cmd` — 2 of the PWR's 106, both "Read the…" observations — completes
  on a 12 s dwell, so omitting a predicate can never soft-lock a procedure.

### Fixed
- **The merged list's divergence flag was flagging healthy channels (#449, #439).** Measured at
  the full stack, 300 s at hot full power: charging flow indicates **30.45 ± 1.81 gpm** against a
  true **30.64 ± 0.13** — a mean gap of 0.6 %, but single samples land 7 gpm out, so an
  instantaneous comparison against a fixed band lit charging, letdown and heatup rate
  permanently. Averaging over 6 s did not help (the noise has an 8 s correlation time), and
  reading the declared sigma out of the config was worse (0.58 gpm against a measured 1.81 — a
  second, wrong copy of a number the data already carries). **The spread is now measured from
  the data**: `sd(indicated − true)` over 60 s *is* the channel's noise, and a row flags when the
  mean gap exceeds twice it — "is it further off than this gauge normally wanders?". **92
  comparable rows, 1 flagged**, down from 4. The one that remains is correct: the intermediate
  range is pegged at its 2e-3 A over-range ceiling at power, which is prototypical, and a row
  saying so is the lesson. A stuck PORV indicator still flags on the instant; a frozen analog
  instrument flags within ~40 s, which is the honest cost of a threshold that is not noise.

### Changed
- **`test/run_flags.js` 16/320 → 19/342 checks** for the build-stamped layer: a stamped
  stage beats the source literal, cannot lower the floor, and falls back when malformed.
  Three of those were hollow when first written — asserted against a `preview` literal,
  where a rejected value and an accepted-but-meaningless one resolve identically — and now
  run against a `public` probe where the outcomes differ.
- **`test/run_telemetry.js` 84 → 103 checks.** The client and the Worker agreed about NAMES
  while the numbers went missing: `KEY_OF` gates each event's principal string and nothing
  gated the `'num'`/`'bool'` props, so a field could be declared, validated, transmitted and
  silently dropped on arrival with every gate green. Adds: every scalar prop reaches a real
  column (both directions, plus the two envelope fields no prop loop can see); every declared
  prop type is a kind `clean()` understands (a `'number'` typo is dropped for ever *and* is
  invisible to the column check, which filters on the same spelling); and `privacy.html`
  discloses what the schema collects, read off `data-collects` markup so prose can be reworded
  freely and only a change to what is COLLECTED reddens it. Injection-verified six ways.
- **The strip chart is a lane stack — one lane per indication (#440, spec §8).** Traces are no
  longer overlaid, which is what makes per-lane autoscale honest: the false-correlation problem
  existed only because two traces shared one vertical space. Each lane prints its **own current
  range** and carries its name over its own trace; the **time axis is drawn once for the stack**;
  the value column is fixed-width and tabular so numbers cannot jitter as digit counts change;
  and the **legend block is gone**, its swatch/name/range now inside the lane that owns them.
  **New default set: Turbine Load, Reactor Power, Tavg** — the old four showed independent state
  variables, demonstrated no coupling, and duplicated the gauge row; these teach that the reactor
  follows the turbine. **Pinning past what fits demotes to numeric rows rather than squeezing
  lanes** — measured: six channels in the 168 px plot gave 28 px lanes, under the 36 px floor, and
  now give 3 lanes at 38 px plus 3 numeric rows. A **shared time cursor** crosses every lane with
  each lane's value at that instant, coloured so a cursor reading cannot be mistaken for a live
  one. The chart's fitter now calls `RD.ChartMath.holdRange`, so it and the vital tiles cannot
  drift. Built against `ui/test_panel/lane_reference.html`, which stays in the tree as the golden
  artifact and measures itself against the density budget.
- **The held-axis policy extracted to `ui/chart_math.js` (#393).** The 1-2-5 ladder and the
  held-band dwell existed twice — in the strip chart and in the vital tiles, the second behind a
  "KEEP IN SYNC WITH ui/app.js" comment, on two surfaces 12 px apart showing the same six
  quantities where a divergence reads as "the tile jumped and the chart didn't". `RD.ChartMath`
  owns the **policy**; each caller keeps its own **placement**. New gate `test/run_chart_math.js`
  pins both original implementations verbatim and replays them against the shared one — 770
  `niceStep` inputs and a 235-frame transient with 50 re-fits, matching frame for frame,
  including the two behaviours the old comments record as having cost real bugs (the clamp
  beating the data, and the dwell snapping on a single quiet frame).
- **Indications and Physics merged into one paired list (#439, spec §3).** Every channel the
  plant publishes now shows the **indicated value and the true state on the same row**, and a
  row where they disagree is **flagged** — a stuck valve announces itself instead of waiting to
  be noticed by comparing the right pair of rows across two panels. Three filter chips (paired /
  indication-only / physics-only); the physics-only set is itself a teaching artifact, being the
  list of things the operator can never see. **HR1 guard:** the true column can be switched off
  and is off by default in missions and campaigns. The 46 curated physics rows are not lost —
  their authored prose now renders the true column of the series they were already bound to.
  The divergence rule was **measured, not assumed**: a plain string comparison lit five rows
  permanently on a healthy plant (including `-0.0` against `0.0`, the same number), so it is now
  a 0.5 % relative test with a floor at the displayed precision — above instrument lag (Cold Leg
  reads 551 °F against 550 °F, 0.18 %) and below the spec's own worked example (core exit 618 °F
  against 623 °F, 0.8 %). Four rows still flag at hot full power with nothing injected, and all
  four are genuinely large disagreements rather than lag; they are recorded on the issue for
  investigation.
- **The right column restructured (#439, spec §1–§4/§6).** The tab strip is now
  **Checklists · Indications · Physics · Inject Failure** — everything in it is *pull*, and the
  Instructor below it is *push*. The **Operate tab is dissolved**: it held no operating controls
  (those are on the board), only session management, which is why nobody hunting for a course
  ever clicked it and the quick tour had to say "Checklists (Operate tab)". Session setup went to
  the session bar, Save/Load and Features to Settings, and **Checklists was promoted to its own
  tab** and made the default — it ranks above the Manual by design. **Settings became a header
  modal** that pauses; the chart's **window ladder and CSV export moved onto the chart itself**
  in the same change and do *not* pause, because stopping the plant to change how you are
  watching a transient is backwards. **The System Scanner is a 26 px status line under the
  board** instead of a panel in the far corner from the board it describes; its full description
  opens as a pausing modal, and the 74 px/28 vh two-height variant is retired. The Instructor's
  new-message cue is **cyan, not amber** — amber on a plant board reads as a plant condition —
  bounded to two cycles, legible with no motion at all under `prefers-reduced-motion`, and it
  now shows a quiet "new below" marker inside the panel when the block is open but scrolled
  away. **A gating instructor step auto-opens the block once per beat**, and a dismissal stands
  for that beat. Active tab and Instructor fold state persist across sessions. ~110 lines of
  dead "Automate tab" code removed — it drove a pane `shell.html` never had.
- **One way to pause the plant, and it remembers why (#439, spec §1).** `pauseSim(reason)` /
  `resumeSim()` replace four copied `service.stop()` idioms; the Plant & Mission, Features,
  Feedback and About-document overlays are now **modal class: opening one pauses the sim, and
  closing it does not resume** — the play button is the only thing that starts the plant, so
  coming back from a dialog can never leave a transient running unwatched. The board's own
  PAUSED veil now paints when a modal takes the plant down, which is the cue that it is waiting.
  Rewind review records its own pause reason, which #441 needs to stop the lanes rescaling
  mid-review.
- **Feedback in one action (#438, first child of the #436 UI rework).** A `Feedback` button in
  the sim-controls row beside Manual/Help opens the contact form directly — it was three levels
  down (Settings → About → Contact), and feedback volume is known to be very low. The form now
  carries a **restricted-information warning above the input** naming the four categories (no
  proprietary plant data, no safeguards/security information, no export-controlled technical
  data, no personal information — the audience includes working nuclear professionals), and the
  attach checkbox **discloses exactly what a bundle contains** for the session being reported
  (T+ length, sample/event/command counts, end snapshot), filled from the recorder at open time.
  Mission completion cards offer a quiet "Send feedback" chip — asking at endpoints, not only
  from a passive button. `DiagRecorder.readout()` gains `events`/`commands` counts. Planning for
  the rework filed children #437–#446 from the #436 spec.

## [Alpha 1.5.2] — 2026-08-10

### Added
- **`tools/site_report.js`** — every number the live site knows about itself, in one command:
  Web Analytics traffic (visitors, top pages, referrers, countries, devices), telemetry Worker
  health, and in-sim usage (starting IC, mode funnel, milestones, panels, controls, missions,
  session-length distribution). `--days=N`, `--only=traffic|usage|health`, `--json`, and
  `--sql=` / `--gql=` escape hatches. One `CLOUDFLARE_API_TOKEN` (Account Analytics → Read)
  reaches all three sources — measured; Web Analytics and Worker invocations do not need a
  second credential. Paired with a `site-stats` skill so the queries are never re-derived.
  Everything printed by default is an aggregate with a LIMIT, so output size does not grow
  with traffic; `--sessions` is the only row-lister and caps at 200.

### Removed
- **`tools/usage_report.js`** — subsumed by `site_report.js`, which covers its dataset plus
  two more and counts the sampling correctly.

### Fixed
- **Both usage datasets were being counted wrong, in opposite directions.** Analytics Engine
  SAMPLES — `sum(_sample_interval)` reads **149** against `count()`'s **120** over the whole
  dataset, and the gap is per-event (`command`: 64 vs 42, **+52 %**), so the retired
  `usage_report.js` did not merely undercount, it distorted which control looked most used.
  Session counts via `count(DISTINCT blob4)` cannot be weight-corrected at all and are now
  labelled a FLOOR. The RUM dataset is the reverse: its `count`/`visits` are already
  sample-adjusted, and `sampleInterval` is the granularity the answer was rounded to — past a
  ~7-day window Cloudflare answers from a coarser tier, so the same two days read 7 + 13
  pageloads at 7 days and 20 + 10 at 14. Rows now carry `exact: yes` / `±10` and the report
  says when to narrow the window.
- **The automatic steam line isolation actuates — it never had, for a player** (#433). A
  full-area downstream steam line break blew the SG down 825 → 212 psi (5.69 → 1.46 MPa)
  with the MSIV open the whole way: #408 adopted the sourced 600 psig low-steam-pressure
  setpoint but dropped the "(Rate sensitive)" annotation from the same source table cell, so
  the raw crossing arrived ~+103 s — ~43 s after the flow-coincidence latch had expired —
  and the pair could never complete. The leg now carries the real channel's rate
  compensation (kernel `lead_lag`, lead 20 / lag 2 — shape per Ginna's analyzed 12/2, scale
  fitted to this plant's faster lumped blowdown): a sev-0.8 or 1.0 break isolates **+2 to
  +3 s**, while the cooldown / bottled-reopen / dump-step discriminators still hold, each
  measured. The filed root cause ("`sg_steam_flow` reads 0 on the break") was refuted by
  measurement — the instrument sees the break (peaks 1.58); the 2026-08-09 evidence watched
  the turbine-only variable. Kernel hardening in the same change: `held_within_s` without an
  `evaluate()` `dt` now degrades to genuine same-sample coincidence (it was a PERMANENT
  latch — the mechanism that hid this defect behind three green probes), and latch stamps +
  filter states survive save/restore. `run_behavior` 70pass/0xfail (TR-12b, TR-12c, PI-9
  pass as written), `run_m4` 44/44. Manuals `12` §8.5 / `09` §3.0 / `03` §16.0 updated
  (pending Rev 15 (c)).
- **A zero-step rod nudge drove the control bank to its full-out stop** (#429). `rod_nudge`
  with `steps: 0` clips to a target equal to the current position, and the `>=` sign then
  handed the group a *positive* velocity while the stepping loop only tests the target after
  incrementing — so it never matched again and only the mechanical stop ended the travel.
  Measured at `hot_full_power`: **839 → 912 steps**, the whole remaining travel. Latent in
  the shipped app (the control kernel guards the zero case for the one production caller
  that could compute one), but the guard lived in a different layer from the defect, so any
  future caller inherited it. RBMK and BWR carry the identical comparator and are on hold.

### Changed
- **The heatup/cooldown rate limit is now the sourced Technical Specification one — 100 °F/hr
  (55.6 °C/hr), read as a rolling hour** (#398). The behavior catalog had carried `≤ 28 °C/hr`,
  a number that appeared exactly once in the repo, in its own row, with no source — while both
  the source corpus and the shipped board already said 100 °F/hr. A new `mode5_heatup_paced`
  gate asserts it (worst rolling hour **49.8 °C/hr / 90 °F/hr**); nothing asserted a rate
  before, so the round-trip gate's `PASS` on that half had never been earned.
- **Heat-balance closure is now measured with an energy term** (#397). The check had been two
  mass balances and a rating check at a single steady state, under a row claiming closure
  "at any steady state". It now compares core thermal output against secondary heat removal at
  100 %, 50 % and 5 %: residual **0.04 / 0.63 / 0.29 percentage points**, inside the ±2 % the
  row always claimed.

### Known issues
- **Automatic steam line isolation does not actuate** (#433, found this change). A full-area
  downstream steam line break blows the steam generator down from **825 psi (5.69 MPa) to
  212 psi (1.46 MPa)** with the isolation valve open throughout. Three gates had reported this
  function working; they were passing against a test-harness artifact, and now ship as declared
  known-fails pinned to the issue. The reactor still trips on overtemperature ΔT at 1m21s.
- **The usage/bug-report Worker rejected the test site, silently** (#413). `ALLOWED_ORIGINS`
  listed `https://dev.reactordynamics.com` — a custom subdomain planned during the Cloudflare
  migration and never created — and omitted `https://develop.reactor-dynamics.pages.dev`, which
  is what testers actually use *(OWNER RULING, 2026-08-09: "instead of dev.reactordynamics.com
  im going to use the currently functioning https://develop.reactor-dynamics.pages.dev/. This
  works just as well.")*. `RD_TELEMETRY_ENDPOINT` is stamped on preview builds, so the test site
  was posting the whole time. Measured against the live Worker: the test-site origin gets
  `403 origin not allowed` where the live origin gets `204`, and the preflight returns
  `Access-Control-Allow-Origin: https://reactordynamics.com` to the test site so a browser blocks
  the response regardless of status. Every bug report and event from the test site was discarded
  with no symptom anywhere. **Needs a Worker redeploy to take effect.** The dead subdomain is also
  retired from the nine root pages, `site/site.css`, `site/make_download.js`,
  `site/stamp_version.js` and `test/run_channel.js`.
- **`vercel.json` and `.vercelignore` are deleted** *(OWNER DIRECTIVE, 2026-08-10: "Do the
  retirement.")* — the last Vercel-shaped things in the repo (#413). Neither governed the deploy
  any more, but two gates still read them as authority, so this was a gate change rather than a
  `git rm`:
  - **`run_site_meta`** used `.vercelignore` to decide which root pages are public. The authority
    moved to `site/build_site.js`, which assembles what actually ships and now declares **both**
    halves — `PAGES` and a new `NOT_PUBLISHED` (the three dev harnesses). **The partition is the
    check**: the two lists must total the root `*.html` glob, so a new page is a red until some
    file says whether it ships. That is the property `.vercelignore` was quietly providing, kept
    rather than dropped with it. 151 → 163.
  - **`run_portable`'s DEPLOY check** asked "is the ignore file hiding this from the build
    machine?" — meaningless on Pages, where nothing is excluded, i.e. a check that could only
    ever answer no. It now asks plain **existence** of every script in the deploy chain (read
    from `build_site.js`'s `BUILD_ONLY`, the one remaining declaration of what the deploy runs)
    and the siblings they shell out to. That is strictly stronger: the old form put
    `if (!existsSync) return;` *before* the exclusion test, so a needed script that had been
    deleted scored nothing at all — the single failure it existed to prevent (#258) was outside
    its reach the whole time. 137 → 138.

  Both verified by injection, and the injection corrected a claim: a stray root `.html` reddens
  the partition check, and moving `site/stamp_version.js` aside reddens the deploy check — but
  `tools/make_portable.js` and `site/make_download.js` are `require`d by the runner itself, so
  losing either crashes it before the check runs. Still red to `run_all`, which compares exit
  codes too, but by stack trace rather than named violation. Recorded rather than glossed.
- **`tools/verify_release_deploy.js` is Cloudflare-only** (#413). The owner disconnected Vercel's
  GitHub integration on 2026-08-10, so no `vercel[bot]` deployment record is created for any new
  commit — verified before the code came out: `develop`'s tip had **zero** deployment records
  where every earlier tip had one, and Vercel's `latestDeployment` had stopped moving. Keeping a
  branch that can only ever report "nothing here" would have re-created the exact defect the
  dual-host version was written to fix, pointed at the other host. Both directions re-checked on
  the single-host script against real releases. The file's four failure modes are now recorded in
  its header, because the pair that mattered are mirrors: the Cloudflare half could never *pass*
  and the Vercel half could never *fail* — **exercise a verifier in both directions against real
  data, or it is not a verifier.**
- **The release check could certify a release LIVE on a build that never ran** (#413).
  `tools/verify_release_deploy.js` filtered GitHub deployments on `environment === Production`
  and never read `/deployments/{id}/statuses` — but a deployment record is created when the
  build is *requested* and keeps that environment whatever happens next. Vercel's Git
  integration is still connected after the Cloudflare cutover while its builds now block, so
  it mints exactly that record per push: measured on Alpha 1.5.1, the script printed
  `vercel PRODUCTION` for a deployment whose only status is `failure — "Deployment was
  blocked"`. The verdict is any-host, so a Cloudflare failure plus that record would have read
  `LIVE`. Now requires the newest non-`inactive` status to be `success` (`inactive` is
  superseding bookkeeping, not an outcome, and treating it as one would fail every release the
  moment the next shipped). Verified in three directions against real releases: `af48703`
  (blocked → now rejected, was green), `5df6315` (success → green), `3b7166a` (never released
  → `NOT LIVE`, exit 1). This is the second defect in this file and the mirror of the first —
  the Cloudflare half could never pass, this half could never fail.
- **A bug report taken at speed recorded almost nothing, and its manifest said otherwise.** The
  session recorder sampled once per BROADCAST, so its resolution in sim time was
  `timeAcceleration × broadcastMs` — 1 Hz at 1×, one row per 180 s at 3600× — while
  `manifest.sample_hz` was the literal `1` in every bundle ever written. Found on the owner's
  own report (`msmjyei2-yav89rpu`, *"Testing speed acceleration during large transients"*): a
  `large_loca` sev 0.4 at 3600× is **two rows**, 100.01 % / 2235 psi (15.41 MPa) followed by
  0.00 % / 56 psi (0.39 MPa), with the blowdown, the scram, the SI and the pressurizer emptying
  all inside the gap. The plant was never wrong — protection has been on a 0.1 s sim-time
  cadence at every speed since #153 — only the record of it was, and the strip chart had
  already been fixed for the identical aliasing on 2026-08-05 while the recorder was left on
  the old seam.

  The recorder now rides that seam: the service's fine sampler carries a third side-dict
  (`dv`, packed over the recorder's own fields in RAW true-state units, because two chart
  series scale by 100 for display and riding `tv` would have made an old bundle and a new one
  disagree by 100× on steam flow), and the recorder emits on its own 1 s floor with MIN/MAX
  folded across each bucket. Spacing is now `max(1 s, the service's fine grid)` — **1 s at 1×
  (unchanged), 1 s at 600×, 6 s at 3600×** — derived rather than configured, so there is no
  second constant to keep in step. `sample_hz` is deleted and NOT replaced by another scalar:
  the grid moves with acceleration inside one session, so `manifest.sampling` declares only the
  floor and the source and the row timestamps carry the truth. Bundle schema **1.1**, with
  `timeseries` columnar (`{fields, t, accel, v[], lo[], hi[]}`) — measured on real report data,
  at the 14,400-row ring that is 720 KB gzipped against 1218 KB as row objects, and the
  Worker's cap is 2 MB before `events` and `snapshot_end`.

  Two things found on the way, both of which would have shipped silently. **The drain was in
  the wrong place**: the fine rows were taken inside the rAF paint, one animation frame after
  the broadcast, so the recorder — a separate synchronous subscriber — saw them only after it
  had recorded a sample at a later timestamp, and every one of them was too old to emit.
  Measured in a browser: 1475 rows handed in, 35 recorded. Moving the drain into the broadcast
  itself gives 2100 rows over 2100 s at 600×. And **undrained sub-samples survived a plant
  change** — pre-existing, and newly dangerous, since the recorder's row is packed over the old
  plant's field list; all three shares are now cleared in `afterPlantChange`. (#432)
- **The reporter never learned their report id.** `worker/src/index.js` answers `{ok, id}` and
  names the stored object after it precisely so a report can be quoted, and
  `site/telemetry.js` returned `{ok, status}` and dropped it — so the id existed nowhere a
  human could see, and two reports sent the same evening were told apart by upload time alone.
  The form now shows it: *"Sent — thank you. Reference msmjyei2-yav89rpu"*. Reading the body
  cannot reject and does not assume there is one, because an edge answering HTML on an error
  would otherwise turn a report that ARRIVED into "could not send". (#431)

### Changed
- **The standing-procedure trap list in `CLAUDE.md` is capped at 25 bullets, evicting to
  `Blueprint/TRAPS.md`** *(OWNER RULING, 2026-08-10: selected "Cap at 25, evict to TRAPS.md"
  from options I wrote — a selection, not verbatim words)*. It was the only unbounded list left
  in a file sitting exactly on its 15,000-word limit: 30 bullets, ~2,000 words, growing about
  one a session, while *Recent themes* directly above it had a cap and an eviction ritual and
  had held since it was written. `run_doc_budget` gates it (3 → 4 checks, injection-verified:
  a 26th bullet reddens it) rather than leaving it as prose, for that gate's own founding
  reason — measured 2026-08-06, every cap that lived inside the document it governed had been
  broken for weeks. **The eviction criterion: move what a GATE already catches**, keep what
  nothing can tell you; the first five out are all plant-specific and all pinned by a suite
  that reddens if the number moves. End state 12,548 words, 2,452 of headroom, and all four
  caps machine-checked.

- **`CLAUDE.md` cut 15,000 → 12,903 words, and `Blueprint/LANES.md` split out of it.** The file
  had reached its own 15,000-word cap exactly, leaving the next agent no room. Measured over the
  file's 251 commits, the cap is working — growth was **+4,568 words/day before it** (8,144 →
  40,124 in seven days) and **+314/day after**, a 14× reduction — but four days of that rate had
  consumed all 1,545 words of margin the 2026-08-06 cut left. The lane-occupancy block was
  **2,510 words, 17 % of the file**, and almost all of it was worked history; it is now
  `Blueprint/LANES.md`, with only the binding rules left inline. Also removed: a block saying
  `Alpha 1.0.0` "is committed and waiting for the merge" six days and five versions after it
  shipped, two *Known open work* items marked **done**, and a runner count that read 43 in two
  places and 44 in a third against a real 45 — **the cap constrains size, not accuracy, and
  nothing measures the second.** Nothing was lost in the move, and that is checkable rather than
  asserted: `Blueprint/**` is on the HR11 scan surface, so citation sites went **238 → 242** —
  up, because four quotes are now deliberately in both files — where a lossy move would have
  shown as a drop. Every quoted string was also diffed old-against-new: 19 strings, 18 exact,
  the 19th differing by one capital letter. `run_doc_budget` now prints the heaviest three
  sections and the remaining headroom, so the next agent who hits the cap cuts the fat instead
  of the nearest thing — a report, not a fourth check, because a per-section number would be a
  cap nobody ruled on.

### Added
- **`test/run_diag_bundle.js`** — the first gate that has ever touched the session recorder.
  Not a coverage gap so much as its cause: the recorder lived inside `ui/app.js`, which no Node
  runner can reach, so nothing watched it and #432 shipped. It is now `ui/diag_recorder.js`, a
  plain global script on the `ui/manual_procedures.js` pattern, and the gate drives it
  full-stack at 1× and 3600×. 31 checks; injection-verified against the pre-fix data path,
  where 4 go red — the 3600× spacing at 360 s against a ≤6 s band, and all three transient
  checks, with `hi − lo` identically 0.0000 across the blowdown and 3 rows where there are now
  131. `verify_e2e_ui.js` carries the other half, which no Node gate can: it presses the app's
  own download button after a run at 600× and reads the file, because everything the Node gate
  asserts would stay green if `ui/app.js` stopped feeding the recorder — which is exactly what
  the drain-placement bug above was.

### Fixed
- **A milestone could be recorded twice for one session, because the latch and the identity it
  latched against lived in different storage.** `seen` was a plain object — scoped to a page
  **load** — while the session id it is reported under lives in `sessionStorage`, scoped to the
  **tab**. Reloading therefore re-armed every milestone and re-emitted it under an unchanged
  session id. Reproduced in a browser 2026-08-09: a reload re-fires `session_start`,
  `plant_mode` and `on_grid` with the session id identical, and the live data already carried
  `on_grid` twice for one real session. That makes "how many sessions reached the grid"
  uncountable, which is the only question the milestone exists to answer. The latch now lives
  in `sessionStorage` beside the id, and `sessionStart` no longer clears it — a plant reset
  inside one tab is not a new visitor. `session_start` latches on the **initial state** rather
  than the session, so a reload is suppressed while genuinely switching starting condition
  still records; verified both ways, including that switching to Cold Shutdown in the same tab
  emits `session_start(cold_shutdown)` and `plant_mode(5)` while `on_grid` stays latched.

### Added
- **The in-sim Contact overlay now offers GitHub issues as a second route** *(OWNER DIRECTIVE,
  2026-08-09: "In the contact form page in the sim it should also direct people to the github
  issues if they want to use that.")*, worded the same as the site footer so the two read as one
  offer. It opens in a **new tab**, which is load-bearing rather than stylistic: this is the first
  outbound link in the control room — the only other anchor there is a `mailto`, which does not
  navigate — and there is no autosave and no `beforeunload` guard (`rd_progress` stores campaign
  progress, never plant state). A same-tab click would destroy the running plant, i.e. on a
  bug-report link it would take the very session the player came to report.
- **`tools/fetch_bug_reports.js` + the `read-bug-reports` skill** — the in-sim bug reports were
  arriving in R2 and could not be read. Both `RD_Ops/runbook.md` and `worker/README.md`
  documented `wrangler r2 object list …`, **which has never existed in any version**
  (`wrangler r2 object` is get/put/delete, and nothing under `r2 bucket` lists objects); it was
  written from recall, never run, and the first person to need it was the owner, on the first
  real report. Every fallback was shut too: `object get` needs an exact key and a key is
  `<base36 ms>-<8 random chars>`, `CLOUDFLARE_API_TOKEN` is Analytics-read and answers 403 on
  R2, wrangler's OAuth token carries no `r2` scope, and the reporter cannot supply an id
  because `site/telemetry.js` discards the one the Worker returns (#431). The tool takes the
  one route needing **no new credential**: a throwaway reader Worker in a temp directory, run
  under `wrangler dev --remote` so the real bucket is bound into a locally-driven Worker, then
  `.list()`/`.get()` through it and torn down. Lists, downloads to `RD_Ops/bug-reports/`
  (outside every worktree — a report carries a player's typed words), and summarises US-first:
  note, manifest, commands with their `blocked`/`error` flags, alarms that went active, the
  scram and its trip reason, the client performance verdict, the end state. Both docs corrected
  to say *why* the old command could not work, so it is not rewritten from recall a second
  time. Second thing both had wrong: the stored object is the wire envelope
  `{v, kind, note, bundle}`, so everything but `note` sits under `.bundle` — `jq .manifest`
  against the documented flat shape reads `null`, which looks exactly like an empty report.
  (#430)
- **`tools/usage_report.js`** — reads the usage dataset and prints where people start, how far
  they get, which panels and controls they use, and how long they stay. Needs an
  *Account Analytics → Read* token in `CLOUDFLARE_API_TOKEN`; with none it exits 2 and says how
  to make one, rather than printing an empty report that reads like "nobody visited". It is a
  script and not an MCP call for a measured reason: `cloudflare.request()` demands the standard
  `{success, result}` envelope and the Analytics Engine SQL endpoint answers `{meta, data,
  rows}`, so a perfectly good query surfaces as `Cloudflare API error: 200`. Three query traps
  are pinned in its header — `uniq()` and `round()` are 422, `ORDER BY` on a raw `double`
  column is 422 while the same column SELECTs fine (order by the alias), and sessions must be
  counted with `count(DISTINCT blob4)` because one session can legitimately carry several
  starts.


### Fixed
- **The plant no longer hunts at part power — every steady state below full load was
  oscillating forever, hands-off, on the preset the sim opens with** (#394 + #378 + #420).
  Measured before: the authored 50 % initial condition swung **11.0 points of power and 3.8 °F
  of Tavg with a ~190 s period, indefinitely**, with nobody touching a control; a 100→50 MWe
  manual load step never settled at all (13.4 points, still running an hour later); and the
  worst case was 40 MWe at **15.1 points**. Two earlier sessions diagnosed this as the rod
  kernel abandoning in-flight rod travel at its deadband, built the fix, and rejected it
  because it cost the sourced ±5 °F ramp duty. **That was the wrong mechanism.** This plant
  lumps the entire control-rod worth into a single bank on an S-curve, so one fine step is
  worth **4.657 pcm mid-bank against 0.892 near either stop — 5.2×** — while the controller's
  gain was a constant; the loop gain therefore swings 5.2× across the operating band and the
  equilibrium is unstable at the high end, where instrument noise grows into a limit cycle.
  The incidence curve is monotone in bank position over six measured points, and every
  authored initial condition starts exactly on program, so nothing excites it but noise.
  Rod gain is now **scheduled on differential rod worth** (`gainScale` on the `rods_tavg`
  channel; `RD.pwrScruveSlope` exported from the engine beside the curve it differentiates),
  normalised to 1.0 at the full-power bank position so at-power behaviour is unchanged.
  Measured after: 50 % holds **1.47 points**, 40 MWe holds 0.50, the manual step settles in
  15.8 minutes. The abandoned rod travel is real (571 events in two hours, 75 pcm per half
  cycle) but it is the amplitude-setting nonlinearity riding on an already-unstable loop —
  fixing the gain collapses it to 4 events.
  - **The schedule is gated on the load program being parked**, and that gate is the whole
    trick. Ungated it collided with the sourced ramp duty exactly as the rejected fix had
    (5.28 → 6.52 °F), and a floor sweep proved no single constant does both jobs: the duty
    cost comes from having *any* schedule (5.97 °F even at a 0.75 floor) while settling needs
    a floor at or below 0.60. The two are separable in **time**, not magnitude — instability
    is a steady-state property, the duty is a transient one — and the separator is measured:
    the programmed setpoint slides at 1.54e-2 °C/s through a 5 %/min ramp against 1.07e-4 °C/s
    through the limit cycle, a **144× gap**. Gated, the ramp duty reads 5.28 °F to the digit,
    the pre-change value; the two-hour soak *improves* 0.71 → 0.49 °F.
- **`run_behavior` carries no strict xfails for the first time since 2026-08-06** — 67 pass /
  2 xfail → **70 pass / 0 xfail**. TR-18 (settling) is fixed; TR-1i (#420) is resolved by
  ruling rather than by the controller. Measured: `maxStep` 8 / 16 / 32 leaves the ramp duty
  at **5.28 / 5.28 / 5.28** — quadrupling rod authority moves it not at all, reproducing
  #306 on today's plant — so no rod-channel change could ever have reached that band. The
  band is now the sourced ±5 °F **scaled by this plant's declared program-span departure**,
  5.00 × (33.295/29) = **5.74 °F** *(OWNER RULING, 2026-08-09: selected "Scale on the
  departure")*. That is the #311 precedent applied as written — a closed-form limit line is
  scaled by a declared geometric departure, never re-anchored onto a fitted intercept.
- **Rod AUTO never captured T-ref from Tavg, and three places said it did.** `Manuals/03`
  §14.3 stated *"Captures T-ref from indicated Tavg at engage"* with a CAUTION built on it,
  and the `pwr_rod_auto` mission taught the false version **as its lesson**. The channel's
  `program: trefFromLoad` re-derives T-ref from indicated steam flow every evaluation — the
  rods drive toward the *program*, not toward wherever the operator left the temperature. All
  three corrected, along with the channel's own board hint, which still described the
  pre-#419 297 → 304 °C program. Manual Rev 15 item (b).

### Added
- **`SS-11` — the probe FG-2's headline invariant never had.** The catalog has always said
  *"any steady state is truly steady"*; the row that was supposed to carry it (SS-3) was
  pinned by a probe sampling **one instant at t = 600 s**, which read comfortable by 0.36 °C
  while Tavg swung 2.94 °C — green for the entire life of the defect. SS-11 rides 90 minutes
  hands-off from the authored 50 % IC with no command at all and asserts the power span over
  an **explicit 60–90 min window**, with a full-power leg as the calibration control.
  Injection-verified both directions: **13.31 points** with the fix disabled, **1.47** with
  it, and the control leg green at 0.16 on both.
- **`--seed` on `test/measure_stack.js`.** It was hard-coded to 4242 while `OpsHarness` probes
  default to `0xC0FFEE` — different plants, and every number in this work is seed-sensitive.
  The seed is now printed in the header beside the layer and lineup.
- **WTSM 8.1 (ML11223A252) is in the source corpus.** The rod controller's ±5 °F duty, its
  ±1.5 °F deadband with 0.5 °F lock-up, and the 8 / 32-per-°F / 72 steps-per-minute speed
  program had all been quoted from a session fetch that was never archived, so
  `tools/find_source.js` returned zero on every phrasing — sourced-looking recall. Fetched via
  the Wayback CDX recipe and verified: **every recalled number checked out**, including the
  proportional 32 steps/min/°F middle rung that #420 suspected, which our discrete third speed
  does not implement (now a positively-sourced declared departure rather than a suspicion).
- **The test site's offline download arrived under the release's filename** (#414). A tester
  pulling the zip from `dev.reactordynamics.com` got `Reactor_Dynamics_Alpha_1.5.1.zip` —
  byte-different from the release of that name and indistinguishable from it once it is in a
  downloads folder, so "the download is broken" arrived with nothing to say which build
  produced it. That is #275's defect (`latest.zip` names nothing) re-created one level up; the
  *page* was made honest on 2026-08-07, the *file* was not. Off the released channel the name
  now carries the commit — `Reactor_Dynamics_Alpha_1.5.1_9f8e7d6.zip`, containing
  `Reactor_Dynamics_Alpha_1.5.1_9f8e7d6.html`, because the collision otherwise survives one
  unzip. A production deploy still produces the bare release name; a local build says `_dev`.
  Measured in headless Edge from `file://`: `download="Reactor_Dynamics_Alpha_1.5.1_dev.zip"`,
  identical to the file on disk and to the zip's own entry name.

  **The fix was deferred for a year of releases because the filename was spelled out twice** —
  in `site/make_download.js` and in `site/nav.js`, with `test/run_portable.js` pinning three
  static literals of each against the other. Adding a suffix to one side leaves those literals
  identical, so that gate would have stayed green while the offered name stopped being the
  built name. There is now **one** derivation, `downloadName()`, and `nav.js` takes the result
  from `download/manifest.js` — the same object the build writes beside the zip — so the
  offered name *is* the built name by construction rather than by comparison. `run_portable`
  129 → 137 checks: the literal-agreement check is gone, replaced by a behaviour matrix over
  the rule and a ban on the prefix literal reappearing in `nav.js`. All three ways of breaking
  it were injected and confirmed red.
- **The version stamps were cached for four hours, which is why the site kept reporting an old
  release after a new one shipped.** Cloudflare Pages defaults static assets to `max-age=14400`
  — right for engine code (immutable per deploy, loaded by a page that *is* revalidated),
  self-defeating for the three files whose entire job is to say which build you are looking at,
  and `must-revalidate` does nothing until the max-age expires. The origin was always correct;
  every visitor's browser was up to four hours behind. `site/build_site.js` now emits a
  `_headers` alongside its `_redirects`, giving `site/version.js`, `site/release.js` and
  `download/manifest.js` `Cache-Control: no-cache` — store but revalidate, which is a ~100-byte
  304 against the ETag already present. **This also retires a wrong call from one release
  earlier**: `version.js` serving a stale commit after Alpha 1.5.0 was written off as a
  self-healing edge blip. It was this, and it affected everyone, not just whoever noticed.
- **A documented release rule was unsatisfiable.** CLAUDE.md said a website-only release gets
  "a version bump and no `changelog.html` entry" — measured, that is `run_release` 20 checks /
  2 failed, while leaving the version alone is green. A bump and an entry move together or not
  at all, so a website-only change ships on the **current** version. Corrected in the change
  that makes it true, and written net-negative on words: CLAUDE.md sits at its 15,000-word cap,
  and the first draft of the correction reddened `run_doc_budget` at 15,047.


## [Alpha 1.5.1] — 2026-08-09

### Changed
- **The first-launch usage-data prompt is gone; collection is on by default and disclosed on
  the privacy page** *(OWNER, 2026-08-09: "Can we get rid of the convent popup and just divulge
  that we collect telemetry in the privacy tab?")*. Two reasons, and the second settles it.
  **It did not work:** the overlay was `id="consentOverlay"`, which ad-blocker cosmetic filter
  lists target by name — the reported symptom was that it "pops up for about half a second then
  disappears", and the diagnostic read `hidden:false` with computed `display:none`. Our code
  never hid it; an extension did. A prompt a filter list can delete is not a consent mechanism,
  it is a way to collect nothing from blocked users and believe you asked them. **And it was
  incoherent:** the site already serves Cloudflare Web Analytics with no prompt at all, carrying
  more identifying signal than this does. What makes the new posture defensible is not the
  disclosure but the invariants that were always there — no persistent id (the session id is
  `sessionStorage`, regenerated per visit), no free text, no cookies, and an IP used only as a
  rate-limit key and never stored. Settings → Share usage data is the opt-out and the only thing
  that ever writes to `localStorage`. The ePrivacy caveat is recorded honestly in the header of
  `site/telemetry.js`: if the call is revisited, restore a prompt a filter list cannot delete —
  inline and neutrally named — not the overlay.
- **The Settings toggle now reports the default truthfully.** It painted from
  `consent() === 'granted'`, which under the flip would have read **Off for every visitor who
  never touched it** — i.e. almost everyone — while the sim was in fact collecting. A toggle
  that misreports the state it controls is worse than no toggle. It mirrors `granted()`; move
  the two together.
- **`RD.diagnose()` lost its `prompt_*` fields** with the prompt they described, and gained an
  honest line for the case the flip made *worse*: a browser refusing `localStorage` cannot
  record an opt-out, so it collects. That outcome is now pinned by a test rather than left to
  be discovered.
- **`run_telemetry` 78 → 81, and its consent assertions are now DELTAS.** `a.sent` accumulates
  for the harness lifetime, so the old absolute `a.sent.length === 0` checks all went red
  downstream the moment the default started sending — and misleadingly: *"denied: flush sends
  nothing"* failed carrying a body from the **undecided** phase, which reads exactly like an
  opt-out leak and was not one. Added a fresh-client opt-out case, because proving silence only
  after a granted phase leaves a first-send latch as the possible cause. Injection-verified
  twice: forcing `granted()` true reddens 5 checks, dropping the queue-clear reddens 1.

## [Alpha 1.5.0] — 2026-08-09

### Added
- **Simulator performance readout on the Physics tab, and in every bug report.** Stutter
  reports were unactionable because compute-bound, render-bound and dropped frames look
  identical from the outside. `ui/perf.js` measures the physics step, the render, the broadcast
  interval and the frame rate, and names the cause. Measured on the reported case: **at 3600×
  the physics costs 501 ms per broadcast against a 100 ms budget — 515 %, 2 fps — while
  rendering stays 6–14 ms** and nothing is being coalesced or dropped. The step loop is the
  cost. The figures ride along in the session bundle a report attaches, so the next one arrives
  already diagnosed. The service times its own step loop and **stops the clock before
  broadcasting** — subscribers run synchronously inside it, so timing past that point folds the
  render into the physics number and makes everything look compute-bound. The value is held on
  the service instance, deliberately not on the snapshot, which is a gated contract.
- **`RD.diagnose()`** for the consent-overlay report, and a `storageWritable()` probe that
  attempts a real write rather than checking that the storage API exists — the browsers that
  fail here have the object and throw on use.

### Fixed
- **The release check's Cloudflare half could never have passed.** It read API field names
  while wrangler prints a table (`Source` is the short sha; `Status` is a relative time on
  success and the literal `Failure` on failure), so every field it looked for was `undefined`.
  It surfaced only because the two hosts disagreed about a release already known good.
- **The privacy page claimed the site ships no analytics script; it does.** Cloudflare Web
  Analytics auto-install injects a beacon. The claim came from a docs summary rather than an
  observation, and an ad blocker on the live site exposed it. The page now states commitments —
  what is collected, what is not, and that Cloudflare processes it — and describes no mechanism
  *(OWNER, 2026-08-08: "why say how the analytics are collected in the privacy page at all?")*.
- **The site build stops fighting Cloudflare Pages' `.html` stripping.** Links, canonicals and
  `og:url` are rewritten extensionless **in the output only**, so the repo keeps `.html` and
  `file://` browsing still works. The rewrite runs after the reference walk, which would
  otherwise validate paths that do not exist yet.
- **Two of three new `run_site_meta` checks were hollow and are now real** — an `indexOf`
  comparison with no `-1` test (true for every input, including absent) and a regex inside
  `if (false && …)`. Both printed PASS against a deliberately broken page. `run_site_meta`
  148 → 151, `run_portable` 128 → 129.


### Changed
- **The CW INLET TEMP box takes the anchor plant's envelope on a 60 °F default day: range
  35–85 °F (1.7–29.4 °C) and reference/default 60 °F (15.6 °C) — was 40–100 °F on an 80 °F
  default** *(OWNER DIRECTIVES, 2026-08-08, in sequence: "We should set our condenser cooling
  range to this [the acceptable range]"; "wouldnt 30F be freezing?"; "can we tune this sim to
  run a default value of 60F? lets make the floor 35F since its probably warmed some by the
  time tit gets to the condenser.")*. The 85 °F ceiling is verbatim-sourced from Ginna TS
  Bases B 3.7.8 (ML20339A221 Rev 101, re-fetched to the corpus): SW OPERABILITY requires the
  screenhouse bay at *"Temperature ≤ 85ºF"*, and the accident analyses bound the same lake
  water at a deliberately sub-freezing 30 °F. The 35 °F floor's lake-to-condenser warm-up is
  the owner's call, declared UNVERIFIED. Condenser design point 50 °F CW, 24.5 °F rise
  (UFSAR ch 10.4.3) — the 60 °F default sits between the design lake and the old 80. The
  reference and default move together by construction, so a default day still makes exactly
  rated vacuum and 100.0 MWe (measured, bit-identical). From the new reference the box has
  real authority both ways (measured, full stack): 85 °F costs 4.6 MWe at 27.2 inHg
  (92.0 kPa); a 50 °F design day buys +1.1 MWe; the 35 °F floor +2.3, just under the vacuum
  ceiling. Lake temperature alone still cannot reach COND VAC LO (~2 inHg margin at the
  ceiling), so `Manuals/03` §13.1's CAUTION is replaced — the alarm walk is equipment
  trouble, not weather. Board box, engine clamp, RHR-floor and SG-backpressure references
  and all fallbacks move together. Manuals Rev 15 pending item (a).
- **PWR turbine load RAISES are rate-limited again — 30 %/min of rated, raises only** *(OWNER
  RULING, 2026-08-08: "Do the 30% increase.", superseding the 2026-08-03 "turn it off" that had
  retired the #318 10 %/min value)*. Measured full-stack before the ruling: the knob costs the
  player nothing — a 70 → 100 MWe raise reaches target at +240–260 s at EVERY rate *including*
  instant, because the reactor sets the pace; all the instant step added was a spike of borrowed
  SG steam (output 96.6 MWe at +15 s, sagging to ~91) that grazed the C-4 runback (min OPΔT
  margin 2.71, ~5 s below the 3.0 line, power peak 106.7 %). At 30 %/min the margin bottoms at
  3.49, the runback stays silent, and the output meter shows a clean monotonic climb (~94 % in
  the first minute). Decreases stay instant, and that is structural, not taste: the rejection
  detector reads (ref − target) through a 60 s lag against the dump's 40 MWe arm, so a ramped
  decrease caps the standing gap at rate × 60 s = 30 MWe — a symmetric limit could never arm
  the ride-out, and the load box is free play's only route to it (a turbine trip at power
  scrams via P-9). The #379 pair obligation is met: with the limit on, the one-box step never
  charges the runback dwell at all (re-measured; the accounting lives at `persist_s`).
  `run_all` 44 runners at baseline.

### Changed
- **The Graph tab is now INDICATIONS: every reading the plant produces, with its live value and
  a checkbox that trends it** *(OWNER, 2026-08-08: "Lets change the graph tab to 'Indications'
  and this tells us all the indications in the plant, categorized like the physcs tab. it should
  also have a checkbox column to add it to the graph.")*. It was a list of the ~40 quantities
  somebody had thought to make plottable, showing none of their values; it is now all **84
  channels** — nuclear instrumentation, the OTΔT/OPΔT limit lines and margins, wide-range steam
  generator level, containment, ECCS flows and discharge pressures, and 34 status indications —
  grouped on the same energy-path spine as the Physics tab. Status channels plot as 0/1 step
  traces, which is what answers "when did that happen" on a strip chart. Two columns when the
  panel is wide enough, as the plot list had. **`run_inspect` now fails if an instrument exists
  with no row**, injection-verified four ways — that guard immediately caught a live defect:
  `xenon` declared an accessor for an instrument that does not exist, propped up by
  `chartSample` cloning the instruments dict on every sample. Both are gone.
- **Every Indications row carries System Scanner copy.** Hover any of the 94 rows for what the
  reading is; expand for its indicating range, its lag, the alarms it drives, and a closing line
  saying it is the channel rather than the plant. The instrument tier is **generated** from the
  manual reference — the same source the vital gauges use, extracted so one channel cannot be
  described two different ways on two surfaces, and so 50 range and lag figures are not a second
  copy of numbers that go stale on the next retune. The 34 status channels and the commanded
  positions are authored, because a reference that documents instruments has nothing to say
  about an indicator light. Summaries are trimmed to one sentence, with the full text leading
  the expanded tier. `run_inspect` fails on a row that resolves to no copy at all.
- **The PORV is a genuine instrument-vs-truth pair on the chart.** Its reading comes from
  `porv_indicator`, which reports the DEMAND signal rather than the valve — so under a
  stuck-open relief valve the Indications tab reads *shut* and the Physics tab reads
  *OPEN · STUCK*. That is the Three Mile Island control room, on two tabs.
- **Free play now starts at the 50 % power preset** *(OWNER, 2026-08-08: "the plant should start
  with the 50% power preset")*, not Hot Full Power — there is somewhere to go in both directions
  from it. One gate moved with it: `verify_e2e_ui`'s steam/feed pairing check is now PINNED to
  `hot_full_power`, the IC every timing in it was derived at. Its 600 s sample point is really
  measuring when AFW's proportional band opens (`afw_level_target` 32 % + `afw_level_band` 8 %
  ⇒ no AFW delivery until SG level falls below 40 %), and how long that takes is set by decay
  heat. Measured full-stack, turbine trip at t=60 s: from full power the SG reaches 40 % at
  ~9m20s so feed is up at 600 s; from 50 % it gets there at ~16m, reads exactly 0 gpm at 600 s,
  then parks at 39.5 % and holds. The plant is correct; the sample point belonged to an IC.
- **The Physics tab gained 12 rows, two groups and a PLOT COLUMN** *(OWNER, 2026-08-08: "We
  should revisit the physcis tab and add anything you think is missing" · "I would like a column
  to the left of the lables with a checkbox for the strip chart")*. New **Pressure boundary**
  group — the relief path, and the tab's biggest omission: everything else on the panel reads a
  quantity with no instrument, while these read quantities whose instrument DISAGREES with them.
  `porv_indicator` reports the demand signal, not the valve, which is the Three Mile Island
  accident in one channel. Also new: **Support systems** (AC power, emergency injection with its
  real gpm, condenser heat sink), core exit temperature with its separation from Tavg, the
  steam generator's mass ledger and the primary→secondary ΔT that drives heat removal, and the
  circulation MODE folded into the loop-flow row. Every row now carries a checkbox that puts it
  on the strip chart, synced with the Graph tab's list so one series cannot end up half-ticked.
- **Primary leak flow reads a real flow rate** *(OWNER, 2026-08-08: "it should also show the
  real flow rate in an appropriate unit")* — gpm beside the fraction, on the declared 7,500 gal
  RCS (× 450,000, the same constant the board uses; now named `GPM_PER_FRAC` rather than written
  out four times as a literal). The chart's Leak Flow trace moved to gpm with it, so the two
  surfaces agree; its alarm threshold is 1 gpm, the Technical Specification unidentified-leakage
  limit, where the old 0.01 % meant 45 gpm. `conv()` gained a `flow` family — the one family
  whose base unit is US, gpm being the identity side and m³/h the converted one.
- **Strip chart window and CSV export moved to the Settings tab** *(OWNER, 2026-08-08: "Move the
  strip chart settings to the settings tab")*. The Graph tab is a list of what to plot; two
  controls that configure the chart itself sat below a scrolling checklist where they were easy
  to miss.

- **The PWR's steam pressure indication was described as a "Steam-Drum Pressure" — a boiling-water
  reactor term for a component a PWR does not have.** The generated reference keys its instrument
  descriptions by id ALONE, and `steam_pressure` is a key the RBMK and the PWR share: the RBMK's
  wording won, and the word "drum" appears nowhere else in the PWR manual set. Latent for as long
  as that text only fed the Failures tab's picker; it surfaced the moment the Indications tab
  began showing descriptions to the player. Per-plant entries now override the shared table, so
  the PWR reads "Steam Generator Pressure" and the RBMK keeps its drum.
- **The chart buffer stored one named property per series per row, and it did not scale.**
  MEASURED at the shipped `CHART_ROW_BUDGET` of 9000 rows, both sides populated: 40 series cost
  **39.5 MB**, 51 cost 68.9, 110 would cost **137.8**. Rows are now fixed-width `Float64Array`s
  indexed by series order, with NaN for "no reading on this side" — **9.6 MB at 40 series, 19.2
  at 110.** So the registry grew by 16 series in this change and the buffer still costs a
  quarter of what it did. CPU is unaffected: one sampler call is 7.5 µs at 40 series and 21.8 µs
  at 110, and the service caps the fine loop at 240 calls per broadcast, so the worst case
  (fast-forward) is ~3.4 ms per 100 ms broadcast and at 1× the sampler runs once. The service's
  `foldExtremes` matches the container the sampler hands it rather than learning what a series
  is, so it still works for either shape; the board's vital tiles read the packed rows through a
  published `RD.ChartCols` id→column map.
- **`?tab=physics` and `?tab=operate` did nothing** — two of the five tabs were missing from the
  deep-link allowlist. Not cosmetic: a pane that is not on screen does not render at all, so the
  link opened a tab that stayed blank and read as a broken panel rather than a broken link.
- **The strip chart's x-axis jumped sideways for the first `window` seconds of every run.** The
  right-hand tick tested `rel === 0` on a float that is only zero in exact arithmetic. `t0 + span`
  reconstructs `t1` bit-exactly whenever the two are within a factor of two (Sterbenz) — which is
  why it looked fine on a long run and was broken at the start of every one: while sim time is under
  the window, `t0` is negative, `span` carries a ~1e-13 residue and the test misses. Both signs then
  printed **"−0s"**, a wider label than "0", so the whole flex row of six ticks slid as it flipped.
  Measured on the default 300 s window over a fresh run: **749 of the first 3200 frames read "−0s"
  and the label flipped 424 times**; on the 1800 s window, 4790 of 18200 and 1552 flips; at the
  43200 s rung, 61824 flips. Now rounds first and tests the rounded value — the number the label
  actually shows. The same rounding replaces `hms()`'s floor on the long-span rungs, where the same
  residue printed a 360 s tick as `00:05:59`. A/B over all seven windows: **0 flips, 0 zero-width
  ticks in 624,600 frames.** `run_all` 44 at baseline.

## [Alpha 1.4.0] — 2026-08-08

### Changed — the containment passive sink learns saturation ΔT, on a lag (#425, 2026-08-08)

_Re-homed 2026-08-08: a 2026-08-07 merge-conflict resolution had spliced this entry (and five 1.3.0 ones) into the middle of the file-header blockquote, above every release heading, where the release rolls could not see it. Attribution by commit ancestry; see TUNING_LOG 2026-08-08-develop-e._

- **PWR containment: the passive sink strengthens with saturation elevation, on a lag — an SBO
  boil-off no longer beats the building on relief steam alone** (#425, OWNER-RULED 2026-08-08).
  Before: a station blackout with all feed lost parked containment at 83.3 psig (0.574 MPa g) —
  past the 60 psig design pressure with no hydrogen and no break — and its H₂ burn peaked ABOVE
  design; TMI-2 sat near 1.3 psig after ~10 h of the same source class (GEND-061). After: the
  boil-off parks at **22.2 psig and never summons spray**, and the SBO burn lands above the
  30 psig hi-hi and ~9 psi under design — the #386 "containment holds" pin now covers every
  family that reaches ignition (new MD-3 legs). The lag is the design: blowdown pulses dwell
  seconds above the knee and keep their #408 grading (severity grid moved ≤ 3 psi, SI crossings
  unmoved, stuck-PORV 9.4 → 9.3 psig), while the boil-off's minutes-long climb arrives fully
  braked. `slb_ctmt_gain` re-solved 0.0035 → 0.0045 (MSLB stays the limiting case, 80 % of
  design). **Migration note**: one new private state field `_ctmt_sink_enh` (the lag);
  pre-#425 saves restore it at 1.0 — no enhancement history invented — and re-charge from the
  live pressure in ~2 min. In passing, re-measured the #384 Rev 13(j) residual and recorded it
  CLOSED (full break bottoms at the building, 14.8 vs 14.7 psi absolute — `Manuals/12` §7.2).
  Manuals Rev 14 pending item (o).
### Added — the hydrogen is real: inventory, recombiners, and the one-time TMI-2-style burn (#386 stage 3, 2026-08-08)

- **Generation is the oxidation term itself** — the zirconium-steam reaction that heats the
  hot node now also books its hydrogen, in exact proportion (same reaction event: 2 mol H₂
  and 190 kJ per mol Zr; Appendix K mandates Baker-Just for "hydrogen generation" by name).
  One fitted scale constant, bracketed by two sourced anchors: an ECCS-mitigated DBA peaks
  at **0.014 v/o** — ~290× under the flammability limit, the 10 CFR 50.46(b)(3) margin
  story (Ginna's own limiting LBLOCA: 0.30 % core-wide oxidation) — while unmitigated
  families ignite at 41–110 min. Generation stops at melt and on a covered core (inherited,
  declared). MD-11 pins the ledger ∝ oxide-grown identity exactly.
- **Transport is geometry-gated, two-node** — H₂ born in the RCS moves to the building only
  while a containment-side path exists. A tube rupture's hydrogen goes into the steam
  generator (the building reads nothing — the SGTR bypass fence extends to H₂); a closed
  block valve holds the inventory. Concentration runs in v/o of Ginna's sourced 1.0×10⁶ ft³
  net free volume, on a new 0–10 % analyzer (NUREG-0737 II.F.1 sourced range, A40 at the
  sourced 4.1 v/o flammability limit).
- **The burn** *(OWNER RULING, 2026-08-05: selected "TMI-2-style burn" — one-time
  deflagration spike + latched event, containment holds; and OWNER RULING, 2026-08-08:
  selected "Above 30 psig" — the ESF answers it; both selections, not verbatim words)*:
  at 8.0 v/o (STS template, corroborated by TMI-2's estimated
  7.9 %) the atmosphere consumes 85 % of its hydrogen (TMI-2: 86 %) and spikes the building
  by TMI-2's measured ΔP in adiabatic form (~32 psi — GEND-061, fetched into the corpus
  this session). Measured peaks 32–42 psig: above the hi-hi, far under the 60 psig design.
  A41 latches forever; H₂ can re-accumulate past ignition with no second burn (the
  O₂-depletion stand-in, declared). Spray and steam-line isolation answer the spike.
- **Recombiners, auto-only** — start at 0.5 v/o, secure at 0.2 (declared inference; real
  ones are manually placed in service), capacity fitted slow because that is the real
  machine: they own the mitigated tail (measured: exact e-fold cleanup post-recovery) and
  are measurably outrun by a degraded core — H2 HI firing means they are losing. A42
  status; delivery dies in a blackout with demand standing.
- Player surface (auto-only per the stage-2 ruling): annunciators **A40–A42**, two new
  Physics-tab rows, and the plant acting on its own. Manuals: new `12` §12.4e declaration
  row, §5.5/§13.0 re-scoped, `09` three rows, `06` three cards, `01`/`08`/README/I-05
  narrowed; the TMI scenario narrations stop disclaiming a burn the simulator now performs.
  Probes: CA-24 (four legs, injection-verified three ways), run_m4 recombiner suite.
- **Found on the way, filed #425**: an SBO boil-off passes containment design pressure on
  relief steam alone — pre-existing stage-2 behavior (no PRT, passive-only sink in a
  blackout), measured and put to the owner rather than absorbed here.

### Fixed — the `noisy` failure on `adv_valve` was a silent no-op, and the Failures-tab picker was missing 14 instruments (#387, 2026-08-08)

- **`adv_valve` gains `noise_failure: 1.0`** — it shipped `noise: 0` (the appended-instrument
  PRNG rule) with no failure sigma, so injecting its `noisy` failure changed nothing:
  `fSigma` resolved to 0 and `_gauss` returned the mean without drawing. Sized like
  `containment_sump_level`'s 1.0 on the identical [0, 100] span. PRNG-neutral by
  construction (draws only while a failure is active). `run_m4` gains the repo's **first
  `noisy`-mode leg** — byte-constant baseline, jitter under injection, quiet after clearing —
  red on the pre-fix config (42/42, 278 checks).
- **`ui/manual_data.js` regenerated after 8 stale days** — the Failures-tab instrument picker
  is built from it, and the shipped copy predated `pzr_spray_flow`, the three containment
  channels, `core_exit_temp`, `pzr_level_dev`, `rod_limit_margin`, `tavg_rate`, and the five
  OTΔT/OPΔT channels as well as `adv_valve`: **14 of 49 instruments could not be failed from
  the UI at all**. All 14 got authored display entries first (a bare regeneration would have
  shipped raw ids as names — the resolved I-12 defect re-run). The derived OTΔT/OPΔT and
  rod-limit channels are deliberately offerable: a computed protection channel failing
  independently of its inputs is what a summing-amp failure looks like in a real rack.
- **New gate `test/verify_manual_data.js`** (148 checks) — every instrument in the live config
  must have a picker entry with an authored name, both directions, so the generated file can
  never silently stale again (nothing re-runs the generator automatically; this drift had
  already shipped one raw-id defect and these 14 absences). `run_all` 43 → 44 runners.

### Changed — the #221 audit lane is now a directory of its own, `C:\grok_build\RD_Audit` (2026-08-08)

- **New audit lane.** `C:\grok_build\RD_Audit` holds the auditor's own auto-loading `CLAUDE.md`, a
  `findings/` scratch directory, and a **detached-HEAD worktree at `tree/`** carrying the source
  under audit. No branch. Sessions start in the lane directory, not in `tree/`.
- **`backshop` is an ordinary lane again** and has its `CLAUDE.md` back. The 2026-08-06 arrangement
  armed it by default, at the stated cost that ordinary non-audit work there ran unprimed; a
  dedicated directory retires that cost.
- **"Findings only, no fixes" is now structural**, not just prose: the lane denies `Edit`/`Write`
  into `tree/**` and into all three work lanes, and the detached HEAD means an edit could not reach
  a branch anyway.
- **`Blueprint/AUDITOR_ORIENTATION.md`** (new) is the auditor's rules, deployed to
  `RD_Audit/CLAUDE.md` by **`tools/audit_deploy.js`** (new) and drift-checked by preflight.
  `Blueprint/AUDIT_CHARTER.md` §1–10 *moved* there; the charter is now purely the primed session's
  document.
- **`tools/audit_preflight.js` — six checks to eight.** New: the exclude list must be fully explicit
  with **no wildcards**, and the auditor's orientation must be deployed, current and *not* excluded.
  Both close a trap the move introduced: `**/grok_build/**/CLAUDE.md` also matches the auditor's own
  orientation, and an unoriented auditor produces a clean-looking audit rather than a red.
- `tools/hook_lane_status.js` sweeps the audit lane (reporting its checkout, marked detached) and
  recognises `status-wip-audit`. Note `tree/` does **not** follow `develop` — the auditor's tooling
  comes from the pinned commit, so re-point it when preparing a slice.
- Gate: `run_hardrules` 235 → 237 (two new HR11 ruling-citation sites). Everything else at baseline.

### Changed — the SG feed trio: single-signal AFW (the "30 % real" premise inverted), a programmed level target, and a demand box that admits it (#380 / #355 / #358, 2026-08-08)

- **AFW auto-starts on the same 17 % lo-lo signal that scrams the reactor** (#380, owner-ruled).
  The evidence pass inverted the issue: the "sourced real ~30–32 %" lo-lo was the NUREG-1431
  *template's* bracketed placeholder (Vol 1, ML12100A222 — the previously-cited Bases volume has
  no numbers), while **Ginna, the anchor plant, specifies exactly 17 %** (UFSAR ch10,
  ML20339A040) — the shipped trip was the sourced value all along and did not move. What moved
  is ours: the invented 20 % AFW offset retired (departure §8.19 struck; one signal for both is
  three-document sourced, and Ginna's own LOFW analysis delivers "AFW started, level still
  falling" ~60 s *after* the trip). Measured: warning 29 s → trip 40.0 s (11.0 s window,
  TR-14 at baseline); on a total feed loss the PI-4 feed-flow start has AFW running at ~3 s.
  Dead `afw_start_level` config duplicate deleted. Manuals 03/06/07/09/12 + `pwr_esf.js`
  (which still claimed a 12 % trip and an 11.03 MPa SI) re-stated; Rev 14 item (k).
- **Auto SG feed regulates to the programmed 65 % level** (#355, owner-ruled) — not whatever
  level it was engaged at. `program: 65` + 0.1 %/s setpoint slew (the rods_tavg idiom);
  measured: engage at 33 % walks to 65 in ~6 min, 3-point crest, no isolation approach. A
  different hold level is a MANUAL evolution. `run_autoctl`'s save/load free-setpoint fixture
  moved to `boron_conc` (a player setpoint on a programmed channel is overwritten by design);
  30/30. Manuals 03/04; Rev 14 item (l).
- **The SG FEED demand box goes amber — and the corner reads NO FLOW — when the plant delivers
  none of it** (#358 option A, owner-ruled). Predicate: commanded speed > 10 % while measured
  main-feed flow (`condensate_flow` — main-only, so AFW can't mask a dead train) ≈ 0. Covers
  the ~10 silent blackout minutes before SAT HI (corner ranked NO FLOW > SAT) and the frozen
  post-isolation demand (355 gpm, 28 minutes, no main feed). The demand stays latched (#329).
  Injection-verified: predicate blanked → the new board_check pins fail on the old lie
  (HOLDING / grey box). board_check 222 checks; Rev 14 item (m).

### Changed — the pressurizer node carries its own law: the void lift becomes a FLOW, and the retired re-lift stays retired (#385 stages 2–3, 2026-08-08)

- **`pzrNodeLevel`** — one law, two consumers (level publishes it, the pressure regime's solid
  predicate evaluates it): the drift-free base+mass backbone plus a **flow-accreted void
  credit** replacing the state-form `level_per_void·w·void`. Displacement is credited at the
  admittance split prevailing WHEN it happens; the share that left through the hole is not
  owed back, in either direction — w recovering re-lifts nothing (the retired stage-0
  defect), and w dipping re-marks nothing down (its mirror, measured 0.12 pts vs the line's
  instant full re-read). Never-leaked plants keep the state form with w ≡ 1, so **the whole
  no-leak family — the calibrated TMI arc included — is BITWISE the pre-node line** (CA-23
  pins it at 1.4e-14), and pressure is bitwise unchanged on every family. The frozen
  `levelRaw` survives only as the migration-seed map.
- **The flash-outsurge term was measured unnecessary and NOT built** (flagged on #385): the
  backbone already empties the node at the loop-demand rate — TRUE-empty 4–212 s across the
  slider, always well before uncovery; sev 1.0 ≈ 1.8 s. A flash term would halve the DBA
  empty-time and change no story, for 3–4 new `[tune]`s — the plan's sizing target was
  measured on the retired severity map.
- **MD-5 re-authored (HR10): the endpoint stands, the clock was the defect's.** ATWS + DEG
  break with no ECCS still melts — at 5285 s instead of < 4000, because the honest gauge
  cuts the heaters instead of letting the lying-high late-blowdown reading prop the pressure
  that kept the break flowing. Window 4000 → 6000 s (MD-1's real-clock precedent), the
  inventory band config-derived; both new forms pass on the pre-node engine.
- **Stage 3 collapsed to verification**: no level constant moved, both documented deception
  targets hold on the live law (net +350; 78.33 at void 0.2), and the mission crest is
  unchanged by construction — free-play crest measured 62.2 % at 37.3 min, never crossing
  65/75, so per the 2026-08-08 ruling the TMI cue stays state-keyed (no free re-key exists)
  and the #418/#419 crest review item closes measured.
- CA-18 legs re-authored onto the live law (stepped clones; the retirement pin is red on the
  state form — injection-verified, credit 28.1 → 168.9); CA-23 becomes the frozen-line
  fence + live-law identity + bounded-excursion probe.
- **The small-break partial lift is SOURCED as a class** (#424 evidence pass, 2026-08-08):
  IE Bulletin 79-06A — *"a water level in the pressurizer simultaneously with the reactor
  vessel not full of water"*, SI ordered actuated on pressure *"regardless of the
  pressurizer level"* — and 79-06C's running-pump small-break regime (two-phase pumping
  that can *"prolong or aggravate the uncovering of the reactor core"*), which is the
  regime the sweeps ride. Magnitude declared this plant's own. New CA-23 leg E rides a
  deep unmanaged SGTR (void 0.589 with the leak flowing) pinning the node identity and the
  credit's structural bounds in the one regime every EOP-path gate avoids;
  injection-verified (a weighted return reds exactly the bound + the re-lift fence).

### Added — the pressurizer gets its own inventory node, stage 1 of 4: INERT (#385 follow-on, 2026-08-08)

- New engine state **`pzr_mass_frac`** — the pressurizer's liquid content as a SHARE of the
  RCS mass ledger (loop share = `_mass − pzr_mass_frac`, implicit — the #418 rule that a
  node's capacity comes OUT of what it split from). No new constant: the geometry map IS
  `level_per_mass` (nominal 55 % = 0.0709 RCS-frac, vessel full at 100/776 ≈ 0.1289).
  Stage 1 is an identity by construction: the node integrates the derived level line's
  realized per-step delta and indication still publishes from the line, so **every runner is
  at its exact baseline** — the ruled gate for this stage ("if anything moves it is a defect
  in the node, not a design change"). `stepPressure` untouched. Migration seeds pre-node
  saves through the line's inverse (byte-identical reading on load); §6.3 documented in the
  same change (`run_contract` 167 → 168).
- **CA-23** pins the inertness: `level_per_mass·pzr_mass_frac == levelRaw` after every 0.1-s
  step across the subcooled, relief-void and loop-break families (worst 1.4e-14), each leg
  with a precondition that its family actually fired, plus the bitwise migration seed.
  Injection-verified both ways (node write stashed → exactly the three identity legs red;
  seed stripped → the migration leg alone). `run_behavior` 65 → 66 pass.
- Stage-0 record (the acceptance freeze, `Diagnostic/TUNING_LOG.md` 2026-08-08-develop-a):
  the severity sweep re-frozen on the re-clocked plant — drain order right everywhere, no
  indicated re-rise, and one new stage-2 target: **the w-suppression fades at low Δp** (TRUE
  level re-lifts 20–65 pts at uncovery at sev 0.10–0.20 as `leak_flow` collapses with √Δp).
  **#415 no longer reproduces** post the 2026-08-07 solid gates (the SP walk-down now arrests
  at 109.3–109.4 %, safeties cycling — the designed #346/#361 arrest). **#334 item 3 found
  already shipped by #408 wave 1** (`Break Size / % of a full pipe shear / 0–100`); the
  2026-08-08 option-(a) ruling confirms shipped state.

### Added — the containment fights back: active heat removal and containment-pressure protection, all automatic (#386 stage 2, 2026-08-08)

- **Containment spray** starts on the sourced 30 psig high-high signal (WTSM 12.3; two 100 %
  trains at the reference plant, Ginna TS B 3.6.6), knocks the building back below the 3.5 psig
  SI signal in minutes, and **secures itself** on recovery — AUTO-ONLY by owner ruling
  ("automated for now… I plan to redesign the control board at some point but not right now"):
  no board card, no player-facing spray control; annunciators **A36–A39** and the Physics tab
  are the window. **Fan coolers** realign on any SI (normal-mode fan cooling stays folded in
  the passive sink, declared). Spray/fan capacities are fitted like `press_gain` — no corpus
  document carries either (measured zero by `find_source`).
- **Safety injection gains the sourced 3.5 psig containment backup** — *"cannot be blocked by
  the operator"*, modeled as a row with no ESF arm: it fires with the HPI ESF in MANUAL, the
  discriminator the run_m4 suite drives directly. The fired latch stands through a ride, so the
  TMI arc's scripted securing is never fought (`run_campaign` 51/51, `run_scenarios` 3/3,
  `flagship_tmi` and `run_meltdown` all UNCHANGED — measured, the stage's highest-risk check).
- **The steam lines isolate on high-high containment pressure** — the sourced third leg
  (ML11223A310:468), sharing the MSLI seal-in; closes `Manuals/12` §12.17. And an **upstream
  steam-line break now pressurizes the building it breaks into** (fitted secondary→containment
  conversion, sized so MSLB is the limiting containment case at ~88 % of design pressure —
  trimmed off a 0.7 %-margin knife edge). PI-9 re-authored: SI now correctly arrives on the
  containment backup for the upstream break, with every primary-side channel silent.
- Q0 sweep (all full stack): healthy plant 20 min flat-ambient with nothing firing; sev-0.5
  LOCA hi-hi→spray→below-SI in ~4 min; stuck PORV equilibrates ~9.4 psig under realigned fans
  (spray correctly never fires); SGTR stays exactly ambient. Adjudicated fallout: CA-16 leg D
  re-authored as the active-sinks decay pin (τ_eff from the plant's own train state), CA-21's
  dry-core window 0.90 → 0.85 (the stage-2 drained equilibrium parks at 0.88 — the old
  threshold pinned the old equilibrium, not the claim; passes on both engines). New CA-22
  (spray knockdown + auto-secure) and a CA-8 spray-is-an-AC-load leg, both injection-verified
  (stage-1 engine reddens them). Manuals Rev 14 item (i) — including two stale rows caught on
  the way (09's MSLI row still quoted the retired 754 psi / "~1 s"; 12 §8.5's ladder sentence
  had escaped the #419 sweep).

### Fixed — the board's CVCS flow boxes read 0 gpm always; every #408-currency display stray swept (2026-08-07)

- **Charging and letdown flow on the board read zero at every plant state** — the two readouts
  (authored 2026-08-05, builder-named "RCP FLOW indication") rendered the raw #408 real
  currency (~6.8e-5 frac/s at NOP) through `Math.round()`, which is 0 for any flow this pump
  can make. Now scaled `× GPM_CHARGING` (450,000 gpm per frac/s on the declared 7,500 gal RCS):
  ~31 gpm at NOP, 0–60 gpm range, live under the SI toggle via the `flow` family. Measured full
  stack before the fix: truth 6.81e-5, instrument 6.88e-5 — the physics was healthy; only the
  display was dead. Two wiring entries for the deleted pre-#371 readouts removed.
- **Same currency, same fix** in the shell: strip-chart Charging/Letdown series (flat-lined at
  0.007 % on a 0–20 % axis) now plot gpm on 0–120; Physics-tab `charging_flow_actual` /
  `letdown_flow_actual` / `leak_flow` cells (read "0 %") now render gpm; the dormant
  `charge-set` handler's `/1000` → `/450000` (it commanded 0.03 frac/s ≈ 13,500 gpm from a
  30 gpm input — unclamped, see #421).
- **#421 closed the loop: `set_charging_flow` is clamped to the pump's run-out.** The engine
  accepted any frac/s (only AUTO clipped); now both the command and the MANUAL branch clip to
  `charging_max` — clip, never reject — which also covers pre-#408 saves restoring
  retired-currency setpoints verbatim. The `set_letdown_flow` alias snap table (0.030/0.040/
  0.070 — every real-scale request snapped to `off`) is re-derived from the orifice
  coefficients. Four rigs moved off the retired currency, each adjudicated: the §14 Mode 5↔1
  roundtrip was the predicted casualty and measured **13/13 green** on the clamped engine
  (cooldown completes at 7,930 s — real-scale charging keeps up with the real-paced
  contraction), e2e band re-derived config-side, CA-8's bands re-expressed as fractions of
  `charging_max` at identical strictness, ops spam roster swapped.

### Changed — the plant is re-anchored to Ginna: the ladder, the Tavg program, the dump capacity and the reference boron are the anchor plant's own (#419 wave 3, 2026-08-07)

- **The no-load point is sourced twice over and the sources agree through the sim's own
  physics**: SG no-load pressure 1020 psi (Ginna's 1005 psig, TS Bases B 3.3.2) with
  Tsat = 546.8 °F — Ginna's own 547 °F no-load Tavg (UFSAR ch 10) to a tenth of a degree.
  The full secondary ladder follows, every rung sourced or rule-derived: dump anchor 1020 psi,
  ADV 1060 psi (the WTSM §7.1.3.3 placement rule, inside Ginna's own 1005–1060 psig ARV band,
  band re-derived 0.12), SG safety pop 1099 psi (the 1085 psig first-lift MSSV, carrying the
  sourced 0.84× bank capacity) / reseat 1063 psi. **The "ladder is unsourced" departure
  (§8.34) is retired** — span 79 psi against the real ~80.
- **The Tavg program steepens to the real class**: 546.8 → 580.1 °F (~33 °F span vs Ginna's
  29; the 4 °F top gap is the plant's fixed heat-transfer identity, declared). Full-power SG
  pressure moves onto its citation (825 psi = Ginna's 810 psig). The pressurizer level
  program re-derives to the real 25 % no-load (WTSM §10.3's own assumption).
- **The steam dump is Ginna's 28 %** (was the fleet-typical 40 %) — adopted under the owner's
  measure-first rule after the full-load-rejection ride-out measured survivable at 28. The
  turbine-trip burst now exactly equals the real operating→pop margin: the shipped plant
  holds it with the ADV's help; two declared teachings (the §8.21 cliff, TR-1k's
  non-monotonicity) survive smaller.
- **The reactivity anchors were being quoted at the wrong temperature** — the 975-ppm ARO
  measurement belongs to the WBN 557 °F HZP, not this plant's no-load anchor; decoupled and
  re-solved (rho_excess 0.087544 → 0.087354). The HZP condition trims to ~705 ppm with
  criticality back at step 319, so the startup's 1/M story is unchanged; the ECC reference,
  the §7.5 table (regenerated from the plant) and the startup/chain content re-label
  683 → 705. Two latent linearizations in the anchor-chain check fixed; it now predicts the
  engine exactly.
- **TR-1i ships as a strict xfail (#420)**: the steep program runs the sourced ±5 °F ramp
  duty to 5.28 °F even after the rod channel's speed thresholds were corrected to the sourced
  WTSM ladder (done this wave); the sourced band is not widened. Coupled to #378.
- **Owner-review**: the TMI deception crest measures ~65 % on the final plant — the 75 %
  level annunciator is unreachable in free play (the qualify exam re-keyed to a state cue).
  Manuals Rev 14 pending item (h) carries the chapter re-statements (04/05/09/12).

### Changed — the relief-valve pressure authority is anchored: physical net under the ruled heater (#419 wave 2, 2026-08-07)

- **`K_porv_relief`/`K_safety_relief` 3144 → 2500 [derived-net, F14-coupled]** — the audit's
  "unanchored" resolved. The physical value is ≈ 304 (a capacitance derivation that reproduces
  TMI-2's own ~6-minute saturation on TMI-2's geometry, and lands within 2 % of the pre-F15
  original 300) — but shipped bare it inverts the stuck-PORV race against the ruled 347× F14
  heater: measured, the heaters hold pressure while the valve drains the pressurizer to 0 %,
  and the TMI level-rise deception never forms. The shipped 2500 preserves the plant's own
  physical NET depressurization under the ruled heater (K×2.5e-4 − K_heater = 0.0744 MPa/s);
  the constant now re-solves with F14 by declaration if that identity ever moves.
- **Measured at 2500**: stuck-PORV saturation ~5 min (TMI-2: ~6); the deception level rise
  crosses the 75 % annunciator at ~25 min and reaches 100 % by 50 min on a quasi-stable
  ~1190-psi ride — the deception cue the #418 A1 re-clock had pushed under the alarm is
  plausibly restored. TMI campaign cluster 8/8, qualify 5/5, meltdown 12/12, scenarios 3/3.
- `pwr_tmi2_p3`'s FULL-SAVE ending now routes on the full terminating pair (`hpi_active`
  added — at the honest clock an early isolation self-recovers past 85 % on normal charging,
  which had let the full card fire without re-injection); the "Plugged, Not Refilled" card's
  margin language re-stated to the measured behavior; PI-3's level guard re-banded 30 → 14 %.

### Changed — the Mode 5↔1 pace compression is retired: the heatup runs real rates end to end (#419 wave 1, 2026-08-07)

- **The pressurization setpoint slew runs the sourced heater class** — `setpoint_pressurize_slew_mpa_s`
  0.02 → 1.586e-3 MPa/s (0.23 psi/s, WTSM 3.2's 1794 kW ⇒ 55 °F/hr, the arithmetic the config
  already carried). Measured full stack: NOP arrives ~1.8 plant-hours after the Pressure SP
  command (early thermal swell rides ahead of the pure slew), the SI-accumulator compliance
  window widens ~100 s → ~14 plant-minutes (~+9 → ~+23 min), and the full cold-to-no-load ride
  is ~12.3 plant-hours at a steady 30 °F/hr — time acceleration carries the pacing (the owner's
  #408 identity, applied by the 2026-08-07 #419 rulings: "D2: move it. D3: go real. Stage 2: go
  with recommendation.").
- **The pressurizer surge gain runs its sourced band un-compressed** — `K_surge_level` 0.4 →
  0.032 (= 0.4 ÷ 12.6, the fit's mid-band position preserved in the real 0.0214–0.0502 band).
  Consequence, adjudicated as the plant being right: a full 100 % load rejection now ends with
  SPRAY containing the pressure peak (15.42 MPa measured) instead of a PORV lift — the
  Westinghouse-class result with pressure-control credit; TR-1 re-derived with its mechanism
  half pinned. CA-21 and the meltdown/scenario suites unchanged.
- **The boron clock is real, and the rate constant is finally load-bearing** —
  `boron_adjust_rate` 2.0 was a ghost (nothing read it; raw commands ran unclamped). It is now
  the LIVE physical ceiling (0.14 ppm/s, derived from WTSM 4.1's blend/BA flows on the declared
  RCS currency) enforced by an engine clamp; `boron_sample_lab_s` 60 → 1800 s (a real 30-minute
  lab). Both automation channels already metered beneath the ceiling and are unaffected.
- **Manuals Rev 14 (pending) item (g)** — 01/02/04/05/12 re-stated on the measured numbers;
  `12` §14.0's *Compressed* trust class empties to the cooldown-depressurisation rate alone
  (also recording that ECCS injection pacing had already left the class at #408 — a stale
  trust-table row found and retired). PWR-N01's checklist holds and mission narration re-paced.
- Probe re-derivations (each validated on both clocks where applicable): TR-1 (spray-contains),
  PI-3's P-11 reinstate budget 3000 → 8000 s, the §14 Mode-5-controls recovery window
  300 → 900 s.

### Changed — the secondary loop joins the primary's fidelity (#418 tier 2, waves A1–A3 + B1)

**Ruled 2026-08-07** ("A+B, keep 297 °C") and built the same day, all four waves gated at
42 runners each. The whole secondary now runs one sourced basis (R.E. Ginna, per-MWt scaled):

- **A1 — the pressure clock is derived.** `K_steam_pressure` 2.0 → 0.30 MPa/s from the
  steam space's own physics (C_P ≈ 1,025 MJ/MPa — the SG liquid's sensible heat IS the
  clock; full arithmetic at the constant). A bottled SG rises 43 psi in the first second
  (was 223), inside the Ginna loss-of-load class. The steam break became its own constant
  (`STEAM_BREAK_FLOW_FRAC` 0.75 — the old `/K` derivation would have ×6.7'd break mass
  flow). Final feed temperature sourced at 435.2 °F (224 °C), top of Ginna's 390–435 °F band.
- **A2 — the SG carries a mass ledger.** `sg_mass_frac` (1.0 = 12,785 kg, Ginna 85,359 lbm
  scaled) with both level ranges derived through a level-geometry map: the Ginna 35-s
  loss-of-feed trip event is preserved by construction while full boil-dry honors the
  sourced ~78 s (was an implied ~162). `K_sg_level` retired into the map's in-window slope.
- **A3 — SG safety capacity sourced**: 0.84× rated steam flow (the Ginna four-valve bank).
- **B1 — the SG has a tube-bundle node and the legs are transported.** The single `h_sg`
  splits into a series pair around `t_sg_c` under an invariance rule (1/h1 + 1/h2 = 1/h_sg,
  shared flow×dryout factors) that keeps every steady state exactly on the legacy map —
  measured: SS-1 to the digit, `run_otdt` 46/46, TR-1i's ±5 °F WTSM ramp duty at 4.35 with
  no lead-lag. The legs lag their algebraic split at tau/flow (1.5/4.0 s at full flow). The
  headline the owner asked for: an MSIV closure's loop-ΔT collapse now takes ~15–25 s of
  true physics and ~25–30 s on the board, instead of a 2-s algebraic step; the true cold
  leg no longer moves 27.5 °F in 2 s. `coolant_heat_capacity` split 20 → 15 + 5 (tube),
  loop total unchanged — the ruled Mode 5↔1 heatup pace is preserved by construction.
- **Behavior consequences, re-derived where the plant honestly changed**: the §8.21
  steam-dump cliff reads on TEMPERATURE now (≈11 °C between caught and uncaught; spray
  holds the PORV clear — the pressure doorstep was the compressed clock's rendering); an
  available auto-ADV catches even an MSIV closure 5 psi under the code-safety pop, so the
  safeties teaching (`pwr_msiv`, TR-16, run_m4) runs on an authored ADV-out-of-service
  premise; the TMI-2 deception crest measured 69.4 % — under the 75 % alarm — and the
  missions' securing cue re-anchored to level-high-and-rising (> 65 %); TR-3's dry-SG
  repressurization-to-PORV survives on the final plant (peak 16.30 MPa, the TMI mechanism).
- **Manuals Rev 14 (pending)**: `12` §8.1/§8.2/§8.3/§8.4/§8.5, §6.0's transport statement,
  row §12.16 — all re-measured numbers, both clocks' renderings recorded.

*Save migration:* new `sg_mass_frac` (seeded through the level map's inverse — the wide level
a pre-ledger save showed is reproduced byte-identically) and `t_sg_c` (seeded on the series
split between Tavg and Tsec); old saves load unchanged, asserted by `save_migration`.

### Fixed — /sim has been broken in production, and the deploy stops publishing the repo (#413, 2026-08-07)

Cloudflare migration prep, items 2-6. Item 4 (analytics) is deliberately NOT here: it is
the one change that cannot be correct on both hosts at once, so it lands at cutover.

- **`/sim` returns a broken control room on the live site, and has since it was added.**
  MEASURED against production: `https://reactordynamics.com/sim` answers 200 and paints an
  empty shell with **62 failed requests and zero gauges**, while `/ui/shell.html` on the
  same host loads with **six and no failures**. `vercel.json` carried `/sim` as a
  **rewrite**, which keeps the address at `/sim`, so every relative path in `ui/shell.html`
  — `shell.css`, `diagram/board/pwr_board.css`, every panel script — resolved against the
  site root instead of `/ui/`. It is a **302 redirect** now: the browser lands on the real
  path first and the relative paths resolve. Not 301 — a permanent redirect is cached hard,
  and reclaiming `/sim` later would mean asking people to clear their cache.
- **The deploy publishes `dist-site/`, not the repository root.** `site/build_site.js`
  assembles it from an allowlist: 9 pages and 5 asset directories, **128 files** against
  the 264 tracked. `test/`, `Blueprint/`, `Manuals/`, `Diagnostic/`, `tools/`, `worker/`
  and the three dev harness pages are all absent, verified. Publishing the root only ever
  looked safe because `.vercelignore` was quietly carrying it, and **Cloudflare Pages
  honours no ignore file at all** — that prop disappears on the host change.
- **The allowlist checks itself.** A hand-written copy list is precisely the
  hand-maintained map that ends up testing itself, so after copying, every local `src=`
  and `href=` in every published page is resolved against the output and one miss fails
  the build. The allowlist decides what to include; the reference walk decides whether
  that was enough.
- **A 404 page**, because Pages serves one for unmatched paths where Vercel supplied its
  own. **`.node-version` pinned to 24**, matching the Vercel project, so the build does not
  land on whatever Pages defaults to.
- **`run_site_meta` 115 -> 148** — the new page at 14 checks, plus a cross-check against
  `build_site.js`'s PAGES list. Two files each answer "what is the public site" and can
  disagree both ways. **It caught `404.html` on its first run**, which the build was
  copying as a special case outside its own list. Injection-verified both directions.
- `run_portable` 129 -> 130: the new build script joined `vercel.json`'s buildCommand and
  the DEPLOY check enumerates every script that command runs, confirming `.vercelignore`
  does not withhold it — the failure that killed Alpha 1.10.0.

Verified by serving `dist-site/` over HTTP with the `_redirects` rule applied: all 9 pages
200, `/sim` boots the board with six gauges, an unknown path serves the 404, **zero failed
requests and zero JS errors**.


### Added — the usage-data receiver (#413, 2026-08-07)

Slice 3: the server half, in `worker/`. Deployed separately from the site (Pages is the
site; this is a Worker) and excluded from the site deploy — publishing it would serve
`wrangler.toml`, bucket and dataset names included, as static files.

- **Two routes, matching the client's two paths.** `POST /` writes an event batch to
  Analytics Engine; `POST /?kind=bundle` writes a gzipped session recording to R2. They
  stay apart for the same reason they do in the client, and because they physically must:
  a 30-minute bundle is **44x over** Analytics Engine's 16 KB blob cap.
- **What the receiver must not ADD.** The client is careful about what it sends; a Worker
  sees far more than a page does. The IP is used as the rate-limit key and never written,
  logged or passed on; the User-Agent is not read at all; nothing is logged, because
  `console.log` in a Worker goes to a stream that is a place data lives.
- **`Content-Encoding` is not a CORS-safelisted request header**, so the bundle POST
  triggers a preflight that fails without it in `Access-Control-Allow-Headers` — and it
  fails *only* for bug reports while the event path keeps working, which is a confusing
  way to find out.
- **The gzip header is SNIFFED, not trusted.** An edge or proxy may decompress before the
  Worker sees the body; storing that object with `contentEncoding: gzip` would break every
  later read of a file that is actually plain JSON. The magic number settles it.
- **POSITION IS THE SCHEMA.** Analytics Engine has none, and Cloudflare's docs require
  values "in consistent order across all writes". The column map is append-only: reorder
  or reuse a slot and every query already written silently mixes old rows with new — no
  migration, no error, numbers that quietly stop meaning what they say. Written down in
  both the Worker and its README.
- **`run_telemetry` 50 -> 78: a cross-check between the client's event registry and the
  Worker's column map.** Two silent failures live in that seam, neither visible from
  either side alone — declare an event and forget the receiver and it is collected then
  discarded; rename a property and its column arrives empty for ever.
  INJECTION-VERIFIED: unknown event 76/1, renamed property 78/1, stale mapping 80/2.
- **`worker/README.md`** carries the four setup commands, an R2 lifecycle rule (90 days,
  matching Analytics Engine's fixed three months so both halves age out together), the
  curl checks including the 413, and the SQL for the questions this was built to answer —
  where people stop, how far through a startup they get, which controls nobody touches,
  and whether missions get finished.

Nothing in this repo can test the server. The first deploy is a test, not a launch.


### Added — usage data and an in-sim bug report, both wired (2026-08-07)

Slice 2 of #413's telemetry work, completing the client landed in slice 1 *(OWNER,
2026-08-07: "I want automatic collection of data and a feedback form within the sim that
sends full session logs")*. **No `changelog.html` entry until an endpoint exists** — with
none stamped, the consent prompt never opens and the report form stays hidden, so nothing a
player can observe has changed yet.

- **The emit points ride the EXISTING session recorder.** `diagEvent` / `diagReset` /
  `diagTick` already sit at exactly the moments worth reporting, so a `TEL` adapter hooks
  those rather than adding a parallel set of probes to keep in step. Hooking `diagEvent`
  covers every recorded scram wherever it is raised.
- **The funnel is the engine's own answer.** `plant_mode` — the derived commercial mode
  1-6 (`CONTEXT.md` §6.3) — replaced the `critical` / `full_power` thresholds proposed in
  slice 1. Those would have been plant-dynamics claims wearing a product-metric hat, and a
  wrong threshold makes a wrong funnel. `on_grid` comes from `mwe_output`, `core_damage`
  from the engine-latched `fuel_damaged`.
- **`session_end.reached_play` was CUT, not fixed.** Driving the live board showed it
  reading `false` on a session that had plainly run: **play does not route through the
  command dispatcher**, so the flag could never be true. `sim_seconds` already answers it —
  the sim clock only advances while running.
- **`session_start` is HELD until consent is answered.** It fires during boot, which on a
  first visit is before the prompt — so it was being dropped, and first visits are exactly
  the sessions worth having. A second defect went with it: the held row was cleared even
  when the emit was *refused*, so `ev()` now returns whether the event was accepted.
- **Consent, and a Settings toggle that agrees with it.** First-launch prompt, shown only
  when an endpoint was stamped and no answer is recorded. Measured on the live board:
  prompt shown, **0 requests before the answer**, `session_start` released intact on grant,
  a returning refuser silent and unprompted. The toggle initially still read *Off* after
  answering *yes* at launch — the two controls did not talk, which is the small lie that
  makes a consent control untrustworthy.
- **The report form sends from inside the sim** — message, optional session recording, one
  button. It never dead-ends: the email address and the diagnostics download stay beside
  it, and a failed send says so.
- **`run_portable` CAUGHT THE OFFLINE LEAK ITSELF** — wiring telemetry put a `fetch(` into
  a script `ui/shell.html` ships, and the LOADS scan failed. The answer was to ship
  **neither** `site/telemetry.js` nor its endpoint file in the portable build rather than
  add an exception to the scan: *cannot fire* and *is not present* are different promises,
  and the offline build makes the stronger one. New `OMIT` set in the bundler, and the gate
  taught about it (125 -> 129, including a per-file row because the tally alone is
  satisfiable by a mis-keyed entry).
- **`privacy.html` rewritten** to match what the code does — what is collected, what never
  is, that two visits cannot be linked, that bug reports are a separate deliberate act, and
  that the offline download contains none of it. It points at `site/telemetry.js` so nobody
  has to take the page's word for it.

`run_telemetry` 49 -> 50, `run_portable` 125 -> 129. Still no endpoint: **#413** covers the
Worker, R2 (bundles are 63 KB-504 KB gzipped, far over Analytics Engine's 16 KB blob cap)
and the Analytics Engine dataset.

## [Alpha 1.3.0] — 2026-08-07

### Released — the lane merge and the version

`workbench` merged into `develop` (2026-08-07-develop-b) and the result shipped as **Alpha
1.3.0**. **Y**, not Z: the release carries both a major change (#408 wave 1 re-clocks the entire
accident-inventory family and resizes the relief valves) and a genuinely new capability
(#395/#396, checklists grading their own preconditions against the live plant) — the operative
test is whether it would go on the Roadmap as a line item, and both would.

The manual set's **Rev 13 is what the website carries from this release**, thirteen lettered
items from two lanes under one revision number, per the 2026-08-06 directive that the number
advances only at a release. The next manual edit extends a pending Rev 14.

**No `changelog.html` entry for the website work** in this release — the social-card metadata,
the deploy-stamp channel fix and the test-build banner are site changes, and that page is
strictly for simulator changes *(OWNER DIRECTIVE, 2026-08-06: "Also, don't include website
changes in the changelog. The changelog is strictly for simulator changes.")*. They are recorded
below, which is what this file is for.


### Restored — five workbench-merge entries a conflict resolution displaced (shipped in this release, re-homed 2026-08-08)

_The 2026-08-07 workbench merge spliced these into the middle of the file-header blockquote, above every release heading; they shipped with 1.3.0 (verified by commit ancestry) but no roll could file them. See TUNING_LOG 2026-08-08-develop-e._

**Added:**
- **`test/run_doc_budget.js`** — gates the one document that is auto-loaded into every agent's
  context on every turn: `CLAUDE.md` <= 15,000 words, no single physical line over 400 words, and
  the *Recent themes* region inside its own documented 5-bullet cap. `run_all` 39 -> 40 runners.
  It exists because all three limits were already written in that file's prose and all three were
  being broken -- injection-verified against the pre-cut file, which fails every check (42,065
  words, a 5,310-word line, 13 bullets). `Diagnostic/TUNING_LOG.md` is deliberately NOT gated:
  it is read on demand, and length is only a defect where it is paid on every turn.

**Changed:**
- **CLAUDE.md cut 42,065 -> 13,455 words** (~68 %), no rule removed. The agent-orientation file is
  loaded into every agent's context on every turn and had grown to 1,735 lines under its own
  "Keep it SHORT" heading, with a single physical line of 5,310 words. Removed: 21,046 words of
  prose gate baselines duplicating the `BASELINES` map that the same section names as the
  authority -- and which had rotted into four wrong figures, a runner listed twice with different
  numbers, and a block marked "unedited" from an old merge. Themes and standing-procedure bullets
  compressed 9,663 -> 2,055 with every trap kept; the themes list gains a word budget, having run
  7 bullets against its own cap of 5. All 30 dated owner citations were verified to exist in other
  tracked files before anything was deleted, so `run_hardrules` 208 -> 205 is fewer citation sites
  and zero fewer rulings (`BASELINES` updated in the same change).
- **PWR atmospheric dump valve — setpoint sourced, 1247 → 1272 psi (8.60 → 8.77 MPa)** (#371).
  WTSM §7.1.3.3 (ADAMS ML11223A244) sets the real valve *"approximately half the difference between
  the no-load steam generator pressure and the lowest set pressure of the safety valves"*; ours sat
  at 34 % of that span. Capacity `adv_max` 0.10 needs no change — it already matches the sourced
  *"approximately 10% of the rated steam flow … from each steam generator"*. Nearly inert in play:
  the loss-of-condenser spike and the code-safety lift are identical at both values; only the hold
  point moves. Perturbation sweep at this exact nudge: 42/623 checks move, zero verdict flips.
  `DESIGN_COMPANION` §8.34 narrows from "capacity and setpoint unsourced" to the relief ladder,
  which still runs ~110 psi above the real one. Manuals `09` and `12` §8.3 updated (Rev 13).

**Fixed:**
- **A behaviour check that could never fail** (TR-17, shipped with #392). `sg_safety_open` is a
  boolean and `range()` returns `NaN` on it, so `!range(...).max` was `!NaN` — true, always.
  Injection-verified: the plant it exists to exclude passed it. The claim it guarded was also
  wrong — the code safeties lift at 54 s whether the ADV is in AUTO or shut, because that spike is
  the steam generator's. The check now asserts what actually differs, the tail: safeties open 1.8 %
  of the hour and reseat, against 99.4 % and never reseating with the valve shut.

**Added:**
- **`tools/find_source.js`** — searches the source corpus across all three worktree lanes and exits
  non-zero on a genuine miss. The corpus is three gitignored directories that cannot see each other,
  and one-lane greps have now cost two evidence passes: #315 §6 (an OTΔT argument built and
  reverted while the primary sat in another lane) and §8.34 (a departure declared on
  *"no document in any lane's corpus"* that another lane could refute).

### Changed — the accident-inventory clock runs REAL flows, and the relief valves are plant-sized (#408 wave 1 + the 2026-08-07 proportional-valve ruling)

The whole LOCA family — break discharge, HPI/LPI, accumulators, relief, CVCS — now moves
real fractions-per-second (`pwr_config.js`, the ruled stage-1 table; every constant carries
its arithmetic at the site). The DEG break rides the sourced 25–38 s class blowdown on this
plant's declared ~7,500 gal volume; a stuck-open PORV with injection secured drains on the
1979 clock (~2 h 20 m to damage); board gpm readouts are now literal (frac/s × 450,000).
The mass ledger gained a discharge-composition model (steam fraction + Δp entrainment +
nozzle-elevation spill) so a drained vessel stops shipping phantom liquid, and the
charging/letdown instrument declarations plus the CHG FLOW HI setpoint joined the real
currency (the alarm was 16× above the pump's new maximum — permanently dark).

**The relief valves are proportional to THIS plant** *(OWNER RULING, 2026-08-07: "The plant
comes first, then the training, documentation follow.")*: `porv_flow_max` 2.5e-4 frac/s
(~112 gpm, Ginna power-scaled), `safety_flow_max` 8.0e-4 (the sourced ~3.2 ratio — closes
#349), the F15 K-pair re-solved together to preserve the PORV's transient pressure authority
exactly. Measured consequences: **feed-and-bleed is viable** (MD-10 green), **full injection
beats one wide-open valve** — the TMI-2 counterfactual as a size fact — and the TMI missions'
deception builds on the defended plant through the historical level alarm at ~38 min.

Two regimes fixed under the ruling: at SOLID, relief joins the bulk-modulus gain family and
the pressure-restore stand-in stands down (the #361 mass_max-clip signature by a fourth
road); and the TERMINAL melt verdict now separates molten-and-unrecovered from
molten-and-quenching — the clad route to `melted` requires inventory NOT rising, so a
reflooded TMI-style core rewets, the core-exit TC reads coolant again, and the flagship's
recovery ending is reachable (unmitigated paths still terminate; `run_meltdown` 12/12).

TMI-2 missions re-paced to the measured real-clock arcs (identification re-anchored to the
damage latch, recovery beats at authored 30–60×, ending routes on card facts). Gates:
`run_all` 38 runners green — `run_campaign` 51/51 (3029), `run_behavior` 65/1, `run_pwr`
36/36; the ruled ops drain-rate red reads 284.3 s against its ≥ 300 s target (was 53.7).


### Fixed — the pressurizer level gauge no longer argues against a large LOCA (#385 stage 2, 2026-08-06)

The TMI void-displacement lift (`level_per_void·void`) is now **path-aware**
(`pwr_pressurizer.levelRaw`): weighted by `w = ref/(ref + leak_flow)`, one new `[tune]`
constant `void_weight_surge_ref` (0.01 frac/s). The term models loop steam displacing
liquid up the surge line; with a hole in the loop, the displaced liquid takes the hole —
the pressurizer discharges instead (WCAP-16009-NP-A §11-4-5, the 2-phase surge-line
discharge during blowdown; WTSM 5.0 §5.0.1.1 has the loop flashed to steam).

Measured before (full stack, #385 sweep): on any saturated drain the level line collapsed
to `base + 350·(1−m)` and TRUE level read **exactly 100 at the moment the core top
uncovered**, at every board severity ≥ 15 %; at the slider default the indicated gauge
peaked **93.5 % at t+7.5 s** — arguing against a LOCA while SI actuated. After: the gauge
empties in ~2 s and stays empty through the uncovery (TRUE 0.0 / indicated 2.3 at
uncovery), no re-rise past the 75 % high alarm (peak 55.1, the pre-break reading).
`leak_flow = 0` gives `w = 1.0` exactly, so the stuck-PORV / safeties / loss-of-heat-sink
families — the calibrated TMI deception arc — are **byte-identical by construction**:
`flagship_tmi` 9/9 and `run_campaign` 51/51 unmoved. Small breaks (≤ 10 %) keep their
correct drain order; the sev-0.5 water-solid endgame (#361 CA-15 arrest) is unmoved.

New probe **CA-18** (`run_behavior` 61 → 62 pass): the drain order (red on the pre-#385
engine: 100.0), the no-re-rise, the exact `level_per_void·void·(1−w)` algebra through the
real `levelRaw`, the relief-path fence (PORV flow moves the line by NOTHING), the
documented 78.3 %-at-void-0.2 calibration target (asserted for the first time), and the
no-break fence (a boiling loop with no leak keeps the full lift). Injection-verified: the
pre-change engine reddens exactly the three discriminating checks.

Manuals Rev 13(i): `12 §7.3` re-written path-aware — and its term table carried constants
three revisions stale (−100/−300/+150 against the live ±776/+375.33), now corrected.

Owner rulings recorded on the issues (2026-08-06, plan-review selections): #385 ships the
lumped term fix now with the pressurizer inventory node **committed as a follow-on**;
#384 proceeds on #386 stage 1's landed containment volume.

### Verified — the LOCA throughput equilibrium exists and is now pinned (#384 stage 3 / #334, 2026-08-06)

The open #334 question — *"there is no throughput concept… can we add one?"* — is answered
by measurement: **it exists, and no new state was needed.** A refilled liquid-full RCS with
a 40 %-severity break open and HPI running repressurizes to the balance point where
injection equals break discharge — settles at 392 psi (2.70 MPa) against a 2.89 MPa config
solve, inventory pinned ON the solid line (10.7 points clear of the `mass_max` guard),
both flows running continuously at 0.0824 frac/s, stable, and reached from different
starting overfills. The #361 `leak_depress` gate plus the #346 bulk-modulus surge ARE the
mechanism. New probe **CA-19** (`run_behavior` 62 → 63 pass) pins the equilibrium plus the
not-a-rescue leg (injection defeated → the same state drains to nothing). Injection-
verified: restoring the pre-#361 double count walks inventory to exactly 1.2000 =
`mass_max` and breaks the balance.

The cluster plan's stage-3 engine edit (a `!pzr_solid` term in the `saturated` predicate)
was **measured unnecessary and not shipped** — the state it defended against self-heals
via the ECCS quench within seconds. Recorded in TUNING_LOG develop-f; if stage 4's
pressure-floor work resurrects the state, it ships then, with its measurement.

### Fixed — a large break now blows down toward the building, not to a phantom floor (#384 stage 4, 2026-08-06)

With a loop break flowing, the saturation pin weakens with void (`K_sat_pull·(1−void)`,
target floored at the live backpressure) and a new vent term (`K_break_vent` 1.0 `[tune]`)
carries pressure toward containment — the WTSM 5.0 §5.0.1.1 blowdown shape. Measured
family (full stack, minP): 1340 / 980 / 470 / **218** / **116 psi** at severities
5/10/20/50/100 %, against 1340 / 980 / 570 / 330 / 170 psi before — small breaks
byte-identical, the full break falls past Psat of its hot remnant. Both scalings are
**path-scoped** (`_leak_base > 0 && !_leak_to_sg`): stuck-PORV, tube-rupture and no-break
boiling paths compute the old formula exactly (probe-pinned to 1e-9). A declared
connected-volumes floor keeps the RCS from ending a step below the building.

**Sizing found a real trade**: higher K raises the floor and erases the core uncovery
(ECCS arrives before anything happens) — this lumped plant has no reflood transport
delay, so true containment equalization and a real uncovery are mutually exclusive.
K = 1 keeps the DBA arc (full uncovery → accumulators dump → reflood → clad 1341 °F, no
damage); the residual is declared in `12 §7.2` and on #384.

**A latent split-accounting defect fixed on the way** (#361's signature by a third road,
latent since #337): below ~560 °F the level line's floored base credits no contraction
room while the pressure surge still did, so the now-earlier ECCS refill rode the cooldown
past the solid arrest to the 120.00 % numerical ceiling. The surge now reads the same
line the level shows (thermal term zeroed only at solid + base-on-floor + contracting);
CA-15 returned green without re-authoring. CA-14's "ends AT saturation" band was pinning
the old pin, not thermodynamics — re-authored one-sided (a drained core must never be
SUBCOOLED; superheat is physical, the loop is steam), passes on both engines.

`run_behavior` 63 → 64 (CA-20: blowdown shape, both fences, the floor, exact clone
algebra; injection-verified — the pre-stage engine reds exactly the three discriminating
checks). Manuals Rev 13(j).

### Added — the subcooling margin reads a core-exit thermocouple (#407, 2026-08-06)

The margin's temperature datum is now **max(loop bulk, core exit)**: new true field
`t_core_exit_c` (equals the bulk on a covered core by construction; tracks the
steam-cooled clad node as the core uncovers) and a new appended `core_exit_temp`
instrument channel — sourced to **NUREG-0737 Item II.F.2** (fetched into the corpus this
session): "the highest of all operable thermocouples", range 200–1800 °F per its
Attachment 1. Over a dry core the TRUE margin now reads −944 °F of superheat where the
bulk datum floors at ~−110; the gauge pegs its low clip and SUBCOOL LOST lights. A TC
failed low degrades the gauge to the bulk datum exactly (HR1).

**The symptom #407 filed was already dead before this landed — measured**: zero
comfortable uncovered samples at any board severity on the post-stage-4 engine (the
honest heater cutoff + the vented blowdown removed the chilled-remnant overlap). The
channel ships on prototypicality and keeps that window closed structurally.

`run_behavior` 64 → 65 (CA-21, injection-verified), `run_contract` 156 → 157
(`t_core_exit_c`), Manuals Rev 13(k).

**The honest instrument caught two authored TMI endings riding the deception** (HR9 —
content follows the plant): `pwr_tmi2_p3`'s "Plugged, Not Refilled" card claimed
*"margin's back, core stayed covered — the night saved"* on a path measured at **41 %
inventory, core fully uncovered, clad climbing** (the old bulk margin "restored" on
repressurization over the dry core); re-routed on the facts it can claim (isolated ∧
undamaged ∧ injection never restored) and re-worded to the measured state. And
`pwr_tmi2_p1`'s finale played *"the water's water again"* one minute after the takeover,
over a core at 11 % inventory and clad at 2450 °F — the honest datum makes the finale
wait for the core to genuinely re-cover (~18 min later: the isolated RCS repressurizes
and throttles HPI to a trickle, which is itself the right lesson); the test's 4000 s
budget was pinning the deception-fast ending, raised to 9000. `run_campaign` 51/51 at
3026 checks (3023 → 3026, structural validation of the re-routed branch).

### Fixed — the deploy stamp was Vercel-only, and 'dev' is its most permissive answer (#413, 2026-08-07)

Website and build tooling. **No `changelog.html` entry**: the site markers below are
invisible on the released channel by construction, so nothing a player can observe on
reactordynamics.com changes, and a line that names no verifiable fact is one the page's own
style rule says to cut *(OWNER DIRECTIVE, 2026-08-04: "Just keep to facts in the changelog
page. Minimize prose.")*.

- **A host migration would have published four unvetted areas to the live site, silently.**
  `site/stamp_version.js` read `VERCEL_ENV` and nothing else. Cloudflare Pages does not set
  it — it sets `CF_PAGES` / `CF_PAGES_BRANCH` / `CF_PAGES_COMMIT_SHA` — so the stamper fell
  through to its `'dev'` default. **Measured with the Vercel variables absent**: channel
  `dev`, and `on(campaign)`, `on(scenarios)`, `on(checklists)`, `on(walkthroughs)` all
  **true**. Those are exactly the four the owner declared placeholders *(#241: "Most of the
  training campaign and scenarios and even the checklist I haven't checked so I consider
  them placeholders until I have gone through them")*. `site/flags.js` resolves preview
  content as `channel() !== 'public'`, which makes **`'dev'` the most permissive value, not
  the safest** — the failure was in the DEFAULT, not the variable name. `RD_VERSION` also
  degraded to `alpha · dev`, so every bug report would have lost its build SHA. Nothing
  would have failed; no gate would have reddened.
- **`resolve()` is now a pure function of an env object**, host-agnostic across Cloudflare
  and Vercel, with the file writes behind `require.main`. An unrecognised CI lands on
  **`'public'`** — the restrictive answer — and says so loudly in the build log: a uselessly
  conservative test site is recoverable, unvetted content on the public one is not.
- **`test/run_channel.js`** — new gate, `run_all` 41 → 42, `25checks 0failed`. Seven
  deployment situations, and for each it asks **what the channel actually offers** rather
  than trusting the string: a channel called `'public'` that fails to gate is the whole
  defect. Injection-verified — `resolve()` blinded to Cloudflare again scores **25/10**, the
  unrecognised-CI fallback flipped to `'dev'` **25/2**, `PRODUCTION_BRANCH` renamed
  **25/4**.
- **TEST BUILD markers**, for `dev.reactordynamics.com` off `develop`. A filled amber banner
  at the top of every page, a `TEST` pill in the sticky header, `TEST BUILD` beside the
  version in the control room, and `[TEST]` on the tab title. All keyed off
  `html[data-channel]`, **hidden by default and opted into per channel** — a missing or
  misspelled attribute leaves the released site unmarked rather than falsely branded.
  Rendered on all three channels and measured: `public` shows nothing anywhere.
- **`robots.txt` is generated to follow the channel** — `Allow` on the released site,
  `Disallow` everywhere else, so the test domain cannot compete with production in search.
  Gitignored: a committed copy would carry one answer to both hosts.
- **The download page names the build it is offering.** `download/manifest.js` gained
  `channel` and `sha`; off the released channel the meta line reads `TEST BUILD · Alpha
  1.2.2 · … · 9f8e7d6`. The zip's **filename** is still the release's — that is a
  three-file change pinned by `run_portable`, tracked as **#414**.
- `run_flags` **310 → 320 is a counting artifact, not new coverage**: its deploy-stamp suite
  emits one check per `/'(public|preview|dev)'/` literal in the stamper, and the rewrite has
  18 where the old file had 8 (measured both ways; delta exactly 10). Worth recording why
  that suite was no defence — **it never mentions `CF_PAGES`**, and its one semantic check
  only ever inspected the Vercel branch, so it sat green throughout.

Migration checklist for the rest — `.vercelignore`, the `/sim` rewrite, analytics, and the
Vercel-specific release-verification step that would otherwise pass vacuously — is **#413**.

### Changed — the public site says who it is for, and its links preview again (2026-08-06)

Website only, so **no `changelog.html` entry** *(OWNER DIRECTIVE, 2026-08-06: "don't include
website changes in the changelog. The changelog is strictly for simulator changes.")*. Nothing
in `engines/`, `layers/`, `scenarios/` or the board moved; `ui/shell.css` and `ui/site_docs.js`
are here only because the site's changelog is packed into the control room's About panel.

- **Every shared link was previewing with no image, and had been since launch.** `og:image`
  was the relative `site/hero.png` on all four pages that had a card at all; Slack, Discord,
  iMessage and X do not resolve a relative og:image against the page url, so the card rendered
  as a bare text row. For a project that spreads by someone pasting a link into a chat, that is
  most of the first impression. All eight pages now carry an absolute
  `https://reactordynamics.com/site/hero.png`, plus `og:url`, `og:site_name`, `og:image:width`
  / `:height` / `:alt` and a `rel="canonical"`. **Changelog, Privacy and Legal previously had no
  card whatsoever** — the block only ever existed in pages that already had it, so each new page
  started from zero. That is the half a one-line fix would have missed.
- **`test/run_site_meta.js`** — new gate, `run_all` 40 → 41 runners, `115checks 0failed`. The
  page list is **globbed from the root and filtered through `.vercelignore`**, not declared: a
  hand-kept list would test the list, passing at full marks on the one page it had never heard
  of, which is exactly how three pages came to have no card. It also pins what a copy-paste
  cannot get right on its own — `og:url` and canonical must name the file they sit in, and the
  declared `og:image:width`/`:height` must match the real pixels of `site/hero.png`, read from
  the PNG header. **Verified by injection before baselining**: the original relative-url bug
  reintroduced in one page scores 116/3, a page stripped of its card 115/13, a stale
  `og:image:width` 115/1.
- **The landing page says who it is for, above the CTA.** It never did. The copy around it is
  written in plant vocabulary — boration and dilution, hot standby, holding through xenon —
  which reads as a filter to anyone without a nuclear background, and a reader who has to guess
  whether they are the audience leaves. Now states plainly that **no nuclear background is
  required**, names the tour and manual that make that true, and says the physics rewards one if
  you have it. `about.html` carries the longer version as its first section. The claim is
  anchored to **ungated** features (`helpBtn` / `helpTourBtn` carry no `data-flag`), so it holds
  on the public channel where the campaign and scenarios do not.
- **The alpha / no-phones banner moved below the CTA.** It was the first thing on the page: the
  opening handshake was a limitation, before the reader had been told what this is. Same caution
  styling, same above-the-fold position, no longer the lede.
- **The download page states version, date and size** — "Alpha 1.2.2 · 6 August 2026 · 1.0 MB".
  The button said `latest.zip` and nothing else, so a returning visitor could not tell this build
  from the copy already in their downloads folder, and nobody on a metered connection knew what
  they were agreeing to. Filled from `download/manifest.js`, which `site/make_download.js` now
  writes at deploy beside the zip it builds — the size is not knowable before that, and
  `download/` is gitignored precisely so no committed copy can go stale. **The date comes from
  the newest `changelog.html` entry, not from the clock**: a build-time `new Date()` would
  re-date the download on every redeploy and make two deploys of one commit differ. Absent
  manifest (any local checkout) hides the line rather than printing blanks.
- **Changelog entries collapse.** Six releases landed in the first three days; `<article>` is
  now `<details class="log-entry">` with only the newest `open`, so the version list stays
  scannable as it grows. `run_release.js` still parses all six, and the markup packs into the
  in-sim About → Changelog panel unchanged. **The archive is planned, not built**, and the
  ADDING AN ENTRY comment records the trap: `run_release.js` reads `changelog.html` ONLY, so
  moving entries to an archive page silently narrows what it checks rather than failing — the
  split has to teach the gate about both files in the same change.
- **The roadmap is tiered** — Open now / Nearly there / In progress / Later. "Nearly there" is
  exactly the set of areas sitting at `stage: 'preview'` in `site/flags.js` (built, gated until
  played end to end, #241), so the tier is anchored to something checkable rather than to a
  feeling. **The BWR and RBMK line is no longer buried**: both engines pass their own suites
  (`run_rbmk` 23/23, `run_bwr` 15/15) and the page now leads with that.
- **Bug reports route to GitHub Issues**, in the footer of all eight pages and in `about.html`,
  with email kept as the no-account fallback. Public and tracked beats a mailbox, and a reporter
  can read what is already known first.
- **`about.html` printed the safety disclaimer twice in a row** — a page-level copy immediately
  above the identical footer copy. The page-level one is gone; the footer carries it on every
  page and `legal.html` carries the operative version.

Not done, deliberately: the **"who built this" paragraph**, held *(OWNER, 2026-08-06: "Hold —
don't add it yet")* pending a decision on how prominently to be named — **#410**, which carries
the ready-to-drop draft and the PERSEC/LLC reasoning. Two follow-ups filed from the same pass:
**#411** the changelog archive split (and the `run_release.js` blind spot it would open), **#412**
the in-sim Contact dialog, which still offers email only.

### Added — checklists check the plant they stand on (#395/#396, 2026-08-06)

Audit #344 ran the six Tier B normal evolutions as one continuous 17-hour shift and every
one "completed" on a reactor that never went critical — the three precondition-shaped
fields in the procedure data (`from:`, `prereq`, `guard`) were all harness inputs or
display text, none evaluated at runtime. Now:

- **Procedures carry machine-checkable `precond` rows** (`{p, op, v, tol, text}`, the same
  predicate vocabulary as `acc`), authored for the six Tier B evolutions and measured MET
  on their own initial conditions before shipping. `pwr_startup`'s boron row (683 ± 70 ppm)
  is the #396 heatup→startup seam: a pump-heat heatup arrives at ≈ 857 ppm, 173.8 ppm
  outside the band, where criticality sits ≈ 561 steps instead of the 319 the checklist
  assumes.
- **The Instructor grades them live, instrument-first, every tick** the checklist runs
  (`_grade`/`_predMet` — no fourth copy of the predicate evaluator), ships verdicts in the
  snapshot's checklist block, and raises one register-aware comment while any row is unmet.
- **The checklist panel shows a NOT MET banner** naming each failed row with expected vs
  measured. It **warns and never blocks** *(OWNER RULING, 2026-08-06: selected "Warn,
  never block" from three options put to him — a selection, not verbatim words)*: commands
  are never refused, steps still check off, and the banner clears itself when the operator
  fixes the condition — graded live, so diluting to the ECC takes the boron row from unmet
  to met with no button press.
- **A new continuous-day gate** (`test/run_procedures_chain.js`, 50 checks) proves the
  documented day works on ONE plant: heatup arrives Mode 3 at 856.8 ppm, the seam probe
  flags exactly the boron row, the PWR-N02 step-15 dilution lands in 55.6 plant-min
  (manual says ~58), the probe reads all-MET, and the startup then takes the same plant
  critical to Mode 1 at 10.75 % with both at-power trip blocks ACCEPTED — the two refusals
  #396 measured are zero. Injection-verified: skipping the dilution reproduces #396's
  exact signature (15 red — power 0.000 %, Mode 3, both `set_trip_block` refusals
  verbatim). The replay machinery it shares with `run_procedures_stack.js` was extracted
  to `test/procedures_harness.js`; the stack gate's unchanged 29/29 262/262 is the
  refactor-neutrality assertion.
- Gates: `run_checklist` 24 → **38** (mechanism + content sections, injection-verified
  7 red on a neutered evaluation), `run_procedures_chain` **NEW 50/50**, `run_procedures`
  and `run_procedures_stack` deliberately unmoved. Manuals: new `02 §8.3` (the banner,
  Rev 13 pending row extended).

## [Alpha 1.2.2] — 2026-08-06

## [Alpha 1.2.1] — 2026-08-06

### Changed — the atmospheric dump valves ship in AUTO (#392, 2026-08-06)

*(OWNER, 2026-08-06: "Amos dump should start in auto" — ADV, dictated.)* `adv_override`
`0` → `null`, in the engine's initial state and in `_migrateState`, so it applies to every
initial condition, instructed content and migrated save. No `defaultOn` on the automation
channel: it is a `mode` channel whose engaged state is read from the plant, and `defaultOn`
would reach free play only.

**This reverses #371a, whose stated worry does not survive measurement.** That decision
shipped the valve SHUT because AUTO "would take the code safeties out of every bottled-SG
evolution". Measured full stack, MSIV closure at hot full power (the turbine trip scrams the
reactor at 1m01s, so it is a decay-heat case within the minute):

| | ADV SHUT | ADV AUTO |
|---|---|---|
| peak | 1351 psi (9.32 MPa) | 1350 psi (9.31 MPa) |
| safeties lift | 1318 psi (9.09 MPa) at 65.8 s | 1317 psi (9.08 MPa) at 68.5 s |
| then | **still open at 10 min** | **reseat at 5.0 min** |
| settles at | 1305 psi (9.00 MPa), on the safeties | **1249 psi (8.61 MPa)**, the ADV setpoint |

Peak and lift time are essentially **identical** — AUTO delays the lift by three seconds and
does not prevent it (TR-5 and TR-16 pin it and both pass unchanged). The entire difference is
the tail: a plant that used to sit on its main steam safety
valves indefinitely now relieves to atmosphere below them and holds there, which is what an
atmospheric dump is for. At power the valve does not open at all (steam pressure ≈819 psi /
5.65 MPa). **AUTO caps pressure but does not cool the plant** — Tavg holds at 574 °F (301 °C)
with the condenser lost — so starting a cooldown still takes the operator.

One evolution genuinely lost its lift: an SG re-pressurizing *from below* (a steam line break,
then isolated) never spikes, so the ADV catches it at the setpoint. **TR-12b** and **TR-17**
were re-authored rather than re-banded, both injection-verified. `DESIGN_COMPANION` §8.34 is
narrowed to the unsourced capacity; `Manuals/12` §12.18 likewise.

### Fixed — board defects reported from play (#392, 2026-08-06)

- **Turbine exhaust ran under the TURBINE-GENERATOR card.** A stale `DOC_PATCHES` waypoint: the
  #371b re-export moved the turbine 210 px left and 40 px up, and the fix-up updated only the
  second of the two points. Corrected from measured port positions. `board_check` pinned only
  the last waypoint, so the mirror pin and a crossover-clearance pin were added.
- **Steam generator bubbles stopped at the tube bundle** instead of rising to the water
  surface — 171.6 px short at a normal 59 % level, and the bubble band was a fixed 54 px strip
  at any level above 20 %. `Math.max(bendY, levelY)` picks the *lower* point on screen in SVG
  coordinates; it is correct for where bubbles are born and was wrong as their travel target.
  Bubbles are now also clipped to the vessel shell, which they never were.
- **On-screen flicker during transients, and alarm acknowledgements that did not register.**
  Both came from DOM being rebuilt rather than updated. Animation-restarting component rebuilds
  fell from 31.9 to 3.6 per plant-minute on an MSIV closure; the alarm stack went from 9.2
  wholesale rebuilds per second on an idle plant to none. The dropped clicks were a consequence
  of the same rebuild — a press that straddled one landed on nothing. Vital gauges also stop
  strobing when a reading sits exactly on a setpoint.
- **The six vital gauges were blank above ~600× time acceleration** (unreported): a fixed
  3-minute window held one sample per broadcast at that speed, and the trace collapsed to a
  single point. Their sparklines now follow the speed setting and take sub-broadcast samples.

### Changed — vital-gauge sparklines match the strip chart (#392, 2026-08-06)

Time-bucketed decimation with a min/max envelope replaces an index stride that **dropped
extremes** — a one-sample spike could vanish outright from a vital gauge — and the axis is held
on a 1-2-5 ladder instead of re-fitting every frame, so drawn history stops sliding. Three new
`board_check` pins, all injection-verified; a fourth was drafted and cut for not
discriminating. Still open: `ui/chart_math.js`, to share the ladder between the chart and the
tiles rather than duplicating it behind a KEEP IN SYNC marker.

## [Alpha 1.2.0] — 2026-08-06

### Changed — the manual revision number is a release marker, not a change counter (lane merge, 2026-08-06)

*(OWNER DIRECTIVE, 2026-08-06: "The revision number only matters during a release to the
website. Revision numbers should never go up until a release happens.")*

**Rev 12 is what the website carries** (Alpha 1.1.0, `main` at `7a40b9a`). Everything built
since is one pending **Rev 13**, however many changes it contains — so the `develop` ←
`workbench` merge collapsed six unreleased revision rows into one, carrying all six changes
as (a)–(f). **Do not open a new revision row for a manual edit; extend Rev 13's.**

This is a fix for a *collision*, not just tidying. Both lanes edited `Manuals/` from the same
base and both allocated numbers from it — develop took 13/14/15, workbench took 13/14 — so
**Rev 13 and Rev 14 each named two different changes.** That is the #339 session-label problem
one artifact over, and it has the same cause: a counter needing coordination between worktrees
that cannot see each other. A number that only moves at a release cannot be allocated twice
between releases.

**One declared simplification was corrected in the same pass.** `12 §12.17` (from #370, built
on the workbench lane) declared that this simulator has no containment at all — while #386
stage 1, built on `develop` the same day, was giving it pressure, temperature and a sump.
Chapter 12 would have asserted both. §12.17 and the `12 §8.5` sentence pointing at it now say
what is actually true: the containment pressure signal **exists**, and no protective actuation
reads it yet — that is #386 stage 2. No plant behaviour changed.

### Added
- **The atmospheric dump appears on the plant diagram** (#371). The relief valve now tees off the
  main steam header on the generator side of the isolation valve — where it has to be, since an
  isolated steam line still needs somewhere to send its heat — and vents through a silencer that
  plumes when the valve is open. Its position, the condenser dump's, and turbine steam flow are
  tagged beside the valves they belong to, and the ATMOS DUMP panel carries the AUTO/SHUT buttons,
  the pressure setpoint and the position readout.
- **Atmospheric dump valves — you can cool the plant down without the condenser** (#371). Until now
  the only controllable steam path went to the condenser, so losing it left no cooldown path at all:
  the plant simply sat hot at the safety band. The new valves vent to atmosphere, work whether the
  condenser is there or not, and take the plant from full operating temperature to shutdown-cooling
  entry. They **ship shut** — opening them is your call, not the plant's — and at full open they
  cool about three times faster than the 100 °F/hr limit, so the cooldown-rate meter and its
  annunciator are equipment you will actually be using.
- **The steam lines now isolate themselves on a break** (#370). High steam flow together with low
  steam pressure shuts the main steam isolation valve with no operator action — about one second
  on a full-area break, after which the generator bottles up and recovers instead of blowing down.
  Before this the valve was yours alone and an unattended break ran to completion. It takes *both*
  signals, so a cooldown does not trip it and neither does a bottled generator lifting its
  safeties, and you cannot reopen the valve while the isolation is sealed in — only once the
  generator has re-pressurized. Two parts of the real function are declared rather than built: no
  containment-pressure path (this plant has no containment), and a fixed steam-flow setpoint where
  a real one slides with load, so below about half power the valve is still your lever.

### Fixed
- **A steam line break now removes steam.** It used to be a pure pressure effect that drained no
  water and showed on no flow gauge — so the generator level never moved and the very instrument a
  real plant isolates on read *lower* during a break. Break trajectories are unchanged where they
  were calibrated; what changed is that the break is now visible as flow and inventory, and the
  blowdown tail self-limits as the pressure driving it falls.

### Docs
- **The audit's paper trail is squared with the merged plant** (#379, #380, §8.30–§8.31, §8.34).
  The runback dwell constant's sizing comment described a rate limit that is switched off — both
  halves of that pair now carry the re-measured 2.8× gap and name each other. The SG lo-lo
  evidence pass ran: the sourced ~30 % setpoint **passes** the Ginna drain band (28.5 s vs
  25–60), so the blocker is the warning/AFW setpoint ladder, not the drain physics — measured,
  recorded, setpoint unchanged pending that ladder decision (#380). The dump arm's self-clearing
  is declared (§8.30): the real one latches until a control-room RESET, and the blunt arm plus
  the auto-clear are one indivisible trade. Two rows staled by the merge are repaired: §8.31's
  "nothing to sense" died with containment stage 1, and §8.34's ADV sizing numbers moved with
  the decay refit (authority 6.9×, full-open ~634 °F/hr — the argument only strengthened).

### Tests
- **The steam-dump cliff is pinned on the lineup a player actually gets, and its probe stops
  flipping coins** (#377). Measured: rod control in automatic does **not** keep the relief valve
  shut on a just-under-the-arm load rejection — both lineups now run to the PORV setpoint (the
  margin the audit found was eaten by the feedwater-enthalpy fix) — and the smaller cut
  undershoots ~15 points deeper than a caught one, the declared cliff's real cost. New probe
  TR-1k pins both facts on the shipped lineup; TR-1c is re-authored from `peak ≥ 2350 psi` —
  which sat exactly ON the setpoint and flipped under a 3 % thermal nudge, as did the
  valve-opened event — to the robust doorstep-band + cliff-span pair, knife-edge ornament
  demoted to info. §8.21 and the manual's §8.3 warning carry the re-measured numbers, and the
  manual's "settles at 89.3 %" (a rod-less artefact) is corrected. Injection-verified both
  directions; the nudge that flipped the old form leaves all 37 checks green.
- **TR-18 pins the open #378 defect as a strict xfail** — after a manual load step the plant
  limit-cycles ~13 points of power indefinitely instead of settling. The fix that kills the cycle
  (cancelling in-flight rod travel at the controller's deadband exit: 13.8 → 2.0 pts, settled at
  14.6 min vs never) was built, measured, and **rejected**, because it takes the rod channel's
  sourced ±5 °F ramp duty (TR-1i, WTSM 8.1.1) from 4.34 to 5.26 °F — the duty is currently met
  partly *by* the defect, as is the case for every PV-filter value tried. No plant behaviour
  changed; the probe keeps the defect visible and goes loudly XPASS-red the day settling is fixed
  without its annotation moving. Measurement record: `Diagnostic/TUNING_LOG.md`
  2026-08-06-workbench-a, issue #378.

### Added — the containment building exists (#386 stage 1)

Containment used to be two constants and a declared exclusion: a break discharged into a fixed
0.1 MPa forever, the relief valves into a fixed 0.103, and the manual said "no containment
building, pressure, temperature or sump." The PWR now has a lumped containment volume:

- **Containment pressure, temperature and sump level** — new true-state fields, new instruments
  (`containment_pressure`, `containment_temp`, `containment_sump_level`), and a new **Containment
  group on the Physics tab** (pressure in psig, temperature, sump). Board readouts arrive with the
  stage-2 heat-removal systems.
- **The break and relief valves discharge INTO it, and it pushes back.** The √Δp discharge laws
  read the live containment pressure as their backpressure. Hot break liquid partly flashes to
  steam and pressurizes the building (cp·ΔT/h_fg — a physical ratio, not a fit); cold ECCS spill
  rains to the sump and moves pressure not at all, which is why pressure peaks on the hot early
  blowdown and then decays on the passive structural heat sink.
- **Measured** (full stack): a full-size break peaks at **41 psig** at ~2 min — ⅔ of the 60 psig
  design pressure inferred from WTSM 5.0 + 12.3 — and every containment-side break crosses the
  sourced 3.5 psig SI-backup setpoint within minutes, while only large breaks reach the 30 psig
  spray point. An **SGTR reads exactly nothing**: that break discharges into the steam generator,
  the one leak containment cannot see, and that asymmetry is the diagnosis lesson.
- A stuck-open PORV pressurizes the building too (no relief tank is modeled — declared,
  `Manuals/12` §12.4d, along with the fitted stiffness and the indication-only sump).
- New behaviour probes **CA-16** (the receiving volume) and **CA-17** (the live backpressure,
  red on the pre-#386 engine); CA-11 leg B re-pointed at the live law. Manual set at **Rev 13** (the merge collapsed six unreleased revisions into one — Rev 12 is what the site carries).
- **Staged next under #386**: stage 2 — containment spray + fan coolers as ESF with the sourced
  3.5/30 psig actuations (after the workbench merge); stage 3 — hydrogen inventory from the
  existing oxidation model, recombiners, and a TMI-2-style burn *(OWNER RULING, 2026-08-05:
  selected "TMI-2-style burn" from three options put to him — a selection, not verbatim words)*.
  Then #384 (large-LOCA depressurization) on top of all three.

### Added — the graph shows the full range a value reached, not just where it happened to be sampled

At speed the chart samples the plant every few seconds of plant time, so anything faster than that
used to vanish between points. Each point now carries the **highest and lowest** the value reached
over the time it covers, drawn as a shaded band behind the line — so a spike, a valve lift or a
trip shows up however fast you are running. Measured on a turbine trip at 600×, the power band
covers 85 of the plot's 120 pixels; at 1× there is nothing to span and no band is drawn.

### Added — the graph's time windows follow the speed setting

The window buttons now offer longer spans as you speed up — 1m/5m/10m/30m at 1×, up to
1h/3h/6h/12h at high speed — because 30 minutes of plant goes by in seconds at 3600×. Switching
speed keeps the same button position rather than the same number of minutes.

Capped at 12 hours deliberately: scaling the window by the speed *number* produced spans of up to
27 days, and the plant does not actually run that fast — measured, a requested 3600× achieves
closer to 160× — so those windows could never fill.


### Fixed — the strip chart holds its resolution at every time acceleration

The chart used to see exactly one sample per broadcast, so how much detail it had depended on how
fast you were running: fine at 1×, but at 60× a whole 6 seconds of plant collapsed to a single
point, and the line was drawn straight through everything in between. A relief-valve lift lasting
three seconds could leave no mark at all.

The simulator now samples the plant **between** broadcasts, on a fixed plant-time interval, so the
trace looks the same at any speed. Measured on a one-minute window filled with live data, the
number of points in the trace:

- **60×** — 11 → **300** (of 344 across the plot)
- **600×** — 2 → **61**
- **1×** — unchanged, as it should be

Also fixed, and separately: **already-drawn history no longer crawls or changes shape as the chart
scrolls.** The time bins the trace is drawn into were anchored to the moving right-hand edge, so
every new sample re-shuffled the whole line — measured, points that should have moved together
drifted apart by up to a pixel each frame, and the trace occasionally jumped backwards. It now
scrolls rigidly.

The chart also updates **five times a second instead of twice**.


### Changed — decay heat is refitted to the published standard, and post-trip timings are longer (#364)

Decay heat goes from two exponential groups to **four**, fitted to the published standard rather
than chosen: ANSI/ANS 5.1-1971 fission-product decay as tabulated by the NRC, plus actinide decay,
with the ×1.2 Appendix K margin removed — that margin belongs to a licensing calculation, and this
is a simulator of a plant.

- **The old curve had nothing faster than a 33-minute time constant**, so it was flat exactly where
  a real one falls fastest: measured, as much as **2.4× high** through the ten-minute-to-half-hour
  band that most casualties play out in. The new fit is within **5 %** of the standard from 1 second
  to 28 hours.
- **Post-trip events now take longer, and are closer to a real plant.** Station blackout reaches
  core damage at **2.6 h** and total loss of heat sink at **2.4 h**, against under 2 h before —
  TMI-2's core damage began around 2.5 h.
- Decay heat at scram reads **6.2 %** where it read 7 %.
- A station blackout with auxiliary feedwater available **no longer heats the plant at all** — the
  turbine-driven pump removes the real decay heat where it could not remove 2.4× of it.
- Natural circulation settles a little lower (3.0 % of rated at 2.2 % decay heat), and the board's
  pipe animation was adjusted so buoyancy flow still shows as moving rather than stopped.

Manuals Rev 13, `12` §4.5 — including a plain note that post-trip timings changed and why.

### Changed — one pressurizer level constant instead of two (#365)

The level line chose between two constants depending on whether the plant was above or below normal
inventory. They have held the same value since the geometry was corrected, so the choice was between
two identical numbers — in three places. Collapsed to one. No behaviour change.


### Fixed — a leaking plant that went water-solid never reached its relief valve (#361)

#346 gave the pressurizer a water-solid regime and #347 took spray's authority away in it. Both
were measured on **one** path — a stuck-open relief valve with its block valve isolated, which
vents the *steam space*, so break flow is zero there by construction. The in-code claim that the
fill "arrests at 109.35 % against the 120.00 % ceiling" was generalised from that, and it does not
generalise: the term that defeats the solid gain only exists when liquid is leaving through a hole.

- **Break blowdown is a bubbled-plant mechanism.** Liquid leaves, the steam bubble expands into
  the space it vacated, pressure falls. With no bubble that path does not exist — and the break's
  mass was *already* moving pressure through the stiffened solid gain, so it was being counted
  twice: **0.938 MPa/s against ~0.26 MPa/s of surge**.
- **Measured before**, a half-size break with injection running: the solid regime engages
  correctly at ~9 min, is simply out-gunned, and inventory reaches **120.00 %** — the numerical
  ceiling exactly, the fingerprint of a clip — at **21 min**, then holds for the rest of the run at
  253 psi with 274 °F (152 °C) of subcooling.
- **After**: the fill arrests at **109.3 %**, which is where the pressurizer geometry says the
  vessel is full — 10.7 points clear of the ceiling, and matching the geometric prediction to two
  decimals. Verified across break sizes from 5 % to 100 %; none reaches the ceiling and none
  damages the core.
- The three terms the manual still declares as bubbled-plant behaviour — relief, spray and the
  heaters — are deliberately unchanged. Manuals Rev 13, `12` §12.4c.

**The arrest is not the relief valve, and the fix plan predicted it would be.** Measured, the
relief valve never lifts on this path and pressure settles at 326 psi: a plant with a hole in it
does not repressurize. The equilibrium is injection matching break flow at low pressure. The
relief ladder is what arrests the *isolated* path, which is a different event.


### Added
- **The audit launch now refuses instead of relying on someone remembering a flag** (#382).
  `.claude/settings.audit.json` — the mechanism that keeps an audit session from being handed the
  conclusions it is auditing — is launched by a flag written in an issue body, and that flag has
  never once been the thing that made a slice independent: the runs that were clean got there via a
  per-tree settings file that layers by default. A slice now starts one way,
  two named audit lanes plus a preflight that refuses. The two overflow worktrees now carry the
  exclusion by default, so a session started in either is unprimed without anyone remembering a
  flag; `node tools/audit_preflight.js <slice>` exits 2 and names the cause if the configuration
  would not actually be independent — auto-memory left on, a worktree whose `CLAUDE.md` is not in
  the exclude list, a settings key renamed by a CLI upgrade, or a slice issue missing its
  subjects-under-test list. Every one of those failures otherwise produces an audit that reads as
  independent, which is why it refuses rather than warns. The session-start hook was itself printing
  plant defects by name into contexts the exclusion had just cleaned; it now reports which mode the
  lane is in and withholds issue titles in an audit lane. The procedure moved into
  `Blueprint/AUDIT_CHARTER.md`, and the auditor must state on the record whether the exclusion
  actually took, because a check running outside the session can only prove the configuration.
  Developer-facing only; nothing in the sim changes.

## [Alpha 1.1.0] — 2026-08-05

### Fixed — a stopped reactor coolant pump was still heating the coolant (#367)

Pump shaft-work heat was scaled by loop flow outright. Natural circulation is buoyancy-driven and
does no shaft work, but it carries flow — so a **stopped** pump went on depositing "pump heat" for
as long as the plant circulated, and the fraction **grew** over time, because decay heat falls
faster than buoyancy flow does (flow follows the cube root of core heat). Measured on a 24 h
post-scram ride with the pump secured: **0.55 %** of core heat at rated with the pump running
(correct), **0.85 %** at 2 h and **2.57 %** at 24 h with it stopped.

- **The coastdown keeps its heat**, which is why this is a subtraction and not a switch: a coasting
  rotor really is doing flywheel work on the fluid. The term now takes total flow minus the part
  buoyancy is producing, so it decays smoothly to zero as the coastdown hands over and established
  natural circulation gets exactly none — no step at the handover, no new saved state.
- **Effect on the plant is small and was measured both ways.** With a working heat sink it is
  *invisible* — the steam generator absorbs it and a 24 h A/B is identical to every printed digit.
  With the heat sink gone it shows as **0.7 °F at 30 min growing to 1.7 °F at 3 h**.
- Guarded inside the existing natural-circulation probe, asserted through the engine's own heat
  balance: with the pump stopped and flow unchanged, the balance now differs by 0.00017 °C/s from
  the pump-running case — **exactly 0** before.

Two neighbouring places with the same shape were checked and **deliberately left**: the turbine's
steam-extraction fraction, whose wrong regime (pumps stopped, turbine on line) this plant cannot
reach — securing the pumps scrams the reactor in 31 s and trips the turbine inside a minute — and
the steam generator's rated normalizer, which is a rated-condition constant rather than a
flow-scaled term. Neither RBMK nor BWR has a pump-heat term at all, so there is no twin to file.

### Fixed — a break kept "flash"-cooling a plant that had stopped boiling (#363)

A break has two halves, and only one of them knew what regime it was in. The pressure half has
always been gated on saturation; the **temperature** half — flash-cooling, which pulls Tavg toward
containment saturation — was keyed on "is there a break" alone. Flashing removes **latent** heat,
and subcooled liquid has none, so the term went on cooling long after there was nothing left to
boil. Both halves are now gated on the same test.

- **Measured** with ECCS defeated, so the cold-injection quench (a different term, correctly
  *un*gated — cold water mixing cools whether or not anything is boiling) cannot mask it: the old
  engine ends a 2 % break **55.8 °F (31.0 °C) subcooled and still falling**, with the core already
  melted, and spends **1194 of 2358** late-drain samples more than 9 °F (5 °C) subcooled. After:
  **0 of 2358**, sitting at saturation.
- **The config's stated small-break mechanism was wrong, and is corrected.** It claimed
  `Psat(Tavg)` pins RCS pressure above 600 psi on a small break. Measured, Tavg reaches 240.9 °F
  (116.1 °C), where `Psat` is about **25 psi** — it pins nothing. Pressure is above 600 psi because
  the **pressurizer heaters** outrun the break (0.55 MPa/s against 0.21). Right behaviour, wrong
  reason.
- **No constant was retuned.** The two `[tune]` values are calibrated against a two-point criterion
  — an 8 % tube rupture holds the plateau above 600 psi, a 20 % break crosses below the accumulator
  setpoint — and it was re-measured after the gate and is unmoved (**2267 psi** and **3.94 MPa**).
  The tube-rupture path is unaffected to three significant figures, because it stays subcooled and
  the term was barely acting on it.
- Guarded by a new probe, **CA-14**; `run_behavior` **53 → 54**.

**What this does *not* fix.** The originally reported symptom — a 2 % break sitting 378 °F (210 °C)
subcooled — is only ~15 °F of this term. The rest is **unterminated emergency injection** quenching
the plant, which is a separate open defect.

### Fixed — the pressurizer level line was clipped at 100, so a heating plant stopped reading (#362)

`levelBase` — the thermal-expansion line the true pressurizer level is built on — carried an
**undocumented upper clip at 100** from v1. It bound at Tavg **611.6 °F (322.0 °C)**, which is
inside the normal subcooled range at operating pressure (Tsat is 653.2 °F / 345.1 °C), so it was
reachable on ordinary casualties rather than only in extremis.

- **What the operator saw.** Measured full stack on a loss of heat sink, the gauge sat **dead flat
  at 61.5 %** — `level_prog_ceiling`, the number a healthy plant reads — for ten plant-minutes
  while Tavg rose 614.2 → 651.2 °F (323.4 → 344.0 °C) and subcooling collapsed 39.0 → 6.2 °F
  (21.7 → 3.4 °C). It did not peg at 100, which would have read as *going solid*; it parked on
  normal. Inventory stopped with it at 95.04 %, because the level program and the indication rode
  the same clip so the make-up servo converged with charging = letdown.
- **On a station blackout it is starker.** The gauge parked at **72.79 %** and inventory at
  **96.49 %** for the last 24 minutes of the run. Fixed, level climbs 78 → **100 %**, the **PORV
  lifts at ~16 min**, and the plant reads the going-solid cue it is supposed to.
- **Two regimes were disarmed by it.** `pzr_solid` is `levelRaw >= 100`, so #347's *no bubble, no
  spray* gate and #346's bulk-modulus surge gain (`K_surge` 0.400 against the solid 1.675, a
  **4.19×** understatement) could not arm on any hot path.
- The **lower** clip is deliberate and stays (cold-plant mass bookkeeping, #289). `levelProgram`
  re-clips at both ends, so the CVCS program band is untouched.
- The init copy of the same algebra in `pwr_engine` now calls `stepLevel` instead of restating it
  — measured **bit-identical** across all five initial conditions.

**Solid is not the same as overfilled.** This plant goes solid at an inventory **deficit** (94.4 %,
nothing injected) because the water expands into the bubble — so CA-12's gate (level at top AND
overfilled AND no void) excludes the case entirely. That is why the guard is a new probe, **CA-13**,
not a leg there. `run_behavior` **52 → 53**.

**Removing the clip reddened nothing**, which is the reason CA-13 exists: measured incidence per
sample before the fix was 95.7 % on a loss of heat sink and 87.9 % on a blackout, against **0.0 %**
on hot full power, large LOCA 0.5, small LOCA 0.05, SGTR 0.25, stuck-open PORV and both cold ICs —
a LOCA drains and *cools*, so its base line runs the other way, and no existing probe lived where
the clip bound.

### Fixed — three constants and a comment that had been wrong since the change that made them so

- **#365** — `level_per_mass` and `level_per_mass_surplus` are both 776, so the piecewise branch
  that chooses between them is an identity, in **two** places (`levelRaw`'s mass term and
  `stepPressure`'s surge rate). Two comments still claimed a surplus reads "~3× steeper". The
  claims are retired and the surge branch now has a guard of its own: CA-9 leg B pins the two
  against each other through `stepPressure`, where **no gauge can see them** — injection-verified,
  splitting the surge branch alone reddens it while both existing level checks stay green.
  Collapsing the branch is deferred behind #361, which reworks the same line.
- **#365, the arithmetic** — three CVCS figures were direct products of `level_per_mass` and were
  **7.76× stale** from the day #330 moved it 100 → 776. Measured off the shipped config: the
  orifice-A drain is **16.8 %/min** (documented as ~2), max charging fills **33.5 %/min**
  (documented as ~13), and the make-up loop τ is **10.7 s on both branches** (documented as 83 s,
  which was the pre-#330 deficit figure).
- **#366** — `primary.void_onset: 0.85` had **zero readers repo-wide** and misdescribed the physics
  it appeared to set: voiding engages at any inventory deficit once the bulk saturates, and is zero
  above saturation at any inventory. Deleted. Its two live neighbours on the same line are what made
  it look real.
- **#368** — the DNB comment claimed the **hot channel**; the code computes the **mixed-mean** core
  exit. `dnb_margin_c` is `[tune]` and scenario-arbitrated, so it plausibly absorbs peaking
  implicitly — the hot-channel factor is **unsourced** (WTSM 19 carries the term as a Tech Spec
  heading with no value) and no constant was moved. Manuals Rev 7, `12` §10.7.
### Changed
- **The manual now says plainly what the plant will not do for you** (#370, #371). Two
  deferred capability gaps the #297 audit measured are declared instead of implied away: MSIV
  isolation is a manual action (a real plant also isolates its steam lines automatically on
  break evidence — this one never will, so on an isolable break *you* are the isolation), and
  the steam dump goes to the condenser only (no atmospheric dumps — lose the condenser and the
  plant holds hot at the safety band; that is its honest floor, not a bug).

### Added
- **A cooldown-rate meter and ±100 °F/hr rate annunciators** (#375). One steam-dump setpoint
  entry could cool the plant at nineteen times the technical-specification-class limit with no
  indication or alarm of any kind. The board now carries a damped heatup/cooldown-rate channel
  derived from the indicated Tavg, and RCS COOLDOWN RATE HI / HEATUP RATE HI annunciators at
  ±100 °F/hr (alarm cards PWR-A34/A35). The error is still yours to make — nothing limits the
  dump automatically — but it is no longer silent.

### Fixed
- **An empty steam generator no longer boils 40 % of rated steam flow indefinitely** (#375).
  The dump's mass flow now carries the steam pressure, so a deep blowdown self-arrests at the
  setpoint you asked for instead of running to the model floor while the level clamp silently
  absorbed a mass imbalance. At and above rated pressure nothing changes.
- **Feedwater carries enthalpy — overfeeding overcools, and auxiliary feedwater is a real heat
  sink** (#372). The steam generator's energy balance now heats feed to saturation before
  boiling it. Overfeeding the generator drops its pressure and nudges power up on moderator
  feedback — the classic overcooling signature the "SG Overfeed / Overcooling" malfunction
  promised and could not deliver (measured before: a 15 % overfeed changed nothing to four
  significant figures). Cold auxiliary feedwater genuinely removes heat: at decay-heat levels
  full AFW flow pulls the tripped plant below the no-load anchor until the level hold throttles
  it back. Steady-state calibration is untouched by construction, and what is still simplified
  — constant final feed temperature, no feedwater-heater train — is declared in the manual
  (Rev 9, `12 §12.16`).
- **A tripped turbine stops drawing steam** (#373). There was no stop valve: a trip zeroed the
  load demand and the machine kept pulling steam through the governor's two-second load lag —
  2.1 flow-seconds of rated steam through a "shut" turbine, doing no work into no sink. The
  spring-closed stop valves the real machine trips on now slam in ~0.15 s, and the primary
  pressure burst that leak was flattening is real again: a trip from 100 % now spikes primary
  pressure to just under the PORV setpoint — visible on the board where before the transient
  quietly never happened. Two behaviour probes were re-specified for the corrected plant and
  pin the burst from both sides.
- **The steam generator's code safety valves can no longer be defeated by a failed
  steam-pressure transmitter** (#369). A code safety is a spring valve opened by the steam
  itself; this plant's opened on an instrument reading, so sticking that one channel from the
  Failures tab and bottling the generator ran an otherwise-survivable MSIV closure to clad
  melt — 2696 psi on a valve set to pop at 1350. The pop and reseat now act on true pressure
  in the engine, the healthy-channel behaviour is measurably unchanged, and new behaviour
  probe TR-16 holds both legs: a dead gauge changes what you read, never whether the valves
  lift. Manuals Rev 7 (`12 §8.5`) states the mechanism.
- **The measurement harness can no longer print a clean table for a command the plant rejected**
  (#376). `test/measure_stack.js` used to discard the command result, so a typo'd failure id
  produced fifteen minutes of a perfectly flat plant that read as a real null result — the #297
  audit nearly filed one. A rejected command, and a command scheduled past the end of the run,
  are now loud exit-2 errors; the ops harness records lockout refusals it previously dropped,
  and four behaviour probes now sanity-check harness legs they were silently trusting.

## [Alpha 1.0.1] — 2026-08-05

### Changed
- **Eleven auxiliary pipes now take their colour from the plant instead of an authored guess**
  (#357). The letdown line rendered cold-blue at 60 °C while the cold leg it takes suction from
  ran green at 550 °F (288 °C), and the charging pair was authored **backwards** — 102 °C on the
  pump *suction* against 60 °C on the discharge that returns to the reactor coolant system.
  Letdown and charging discharge read the cold leg now; the ECCS, accumulator, refuelling-water
  and auxiliary-feedwater runs read the plant's own injection temperature, 104 °F (40 °C), which
  is the same constant the physics injects at. Suction is cooler than discharge, as it should be.
- **The coolant green and orange are a step darker.** They are the two colours the reactor
  coolant system actually sits on — cold leg near one, hot leg near the other — so they were the
  loudest thing on the board in the state the plant is in most of the time.
- **Pressurizer spray flow moved above PZR TEMP**, out from over the vessel art, and the steam
  generator's u-tube flow dashes now carry the coolant colour instead of near-white, matching
  every other primary run.
- **Valves no longer show a pale streak.** The moving dash inside every valve was hardcoded
  near-white, so a fitting disagreed with the line it sat in — the one place on the plant where
  that happened. It takes the fluid's own dash colour now and crosses the valve unchanged.
- **The pressurizer's internal spray runs are back in step with the spray line outside it.** They
  were anchored to the pressurizer's own tile rather than the canvas, so the dashes sat a fixed
  fraction of a period out and slid past each other at the vessel wall. Measured, the speeds were
  always identical — 1.04 s per period and 22.7 px/s on both, at five window sizes from 1024 to
  2560 wide — so this was never a speed difference, only a phase one.
- **The SG FEED RESTORE button fits its own caption**, and the feed-rate box moved right to
  balance the card: its right edge now lines up with the OFF button above it.

### Fixed
- **The pressurizer heater cutoff now latches, instead of chattering on its own setpoint**
  (#348). The 17 % low-level interlock had no reset differential, so on a noisy lagged level
  channel it did not cut out — it flickered: measured on a small break with a full manual heater
  demand standing, **499 of 1425 samples below the setpoint (35 %) delivered full heater power**,
  in runs of up to 8, every one of them between 16.3 % and 17.0 %. That is a ~1 MW load cycling
  at the evaluation cadence. It cuts out at 17 % and restores at 20 % now — the same differential
  this plant already models on the **other half of the same bistable**, the letdown isolation, so
  the plant was inconsistent with itself rather than simplified.
- **The tube-rupture procedure was missing the step it turns on: SECURE INJECTION before
  depressurizing** (#348). PWR-E06's whole strategy is to close the primary-to-secondary pressure
  difference, and with high-pressure injection running that is impossible — injection holds the
  primary up faster than the setpoint can ask it down. Measured: walking the Pressure SP
  2235 → 1450 psi (15.41 → 10.0 MPa) with injection in cut break flow by **0 %** and drifted the
  plant toward water-solid at 106.8 % inventory; securing it first cut break flow **84 % in one
  minute**, 87 % held out to twenty, core covered throughout. Added to the on-board checklist and
  to `Manuals/07` as immediate action 3a (set Rev 6) — the trainer's version of the SI-termination
  step a real tube-rupture procedure carries, and it is there for the same reason.
- **The stuck-open PORV procedure no longer teaches a margin collapse that does not happen.**
  Its first step diagnosed on subcooling "eroding toward zero"; with injection catching the
  transient the margin dives and then comes most of the way **back** while the leak still runs.
  The step now says that, because it is the trap — a margin that recovers is not a leak that
  stopped — and its acceptance moved onto the transient, which is the only claim that holds at
  both layers (measured at t+30 s: **−5.2 °C** engine-direct against **+36.6 °C** with the
  control layer in).
- **The Three Mile Island scenarios play again, and they now teach the error in its historical
  order** (#347). The flagship and the TMI‑2 campaign module were both built so that the
  subcooling margin eroded *before* the crew's decision — which was only ever true because the
  plant discarded its emergency-injection overfill (#346) and therefore drained whether or not
  injection was running. With that fixed, unthrottled injection **matches** a stuck-open relief
  valve and holds the plant: measured, 109.3 % inventory and 149 °F (83 °C) of margin held
  indefinitely. So the margin never fell, the decision point was unreachable, and six missions
  plus both flagship endings could not be finished.
- **That is the TMI‑2 counterfactual, and it is now the spine of the scenario.** Full injection
  beats one stuck-open valve — which is exactly why the 1979 crew securing it is what caused the
  accident. The flagship now enacts that securing at its historical cue (the pressurizer LEVEL
  HIGH alarm, T+18 s) *before* the decision, so the player's choice is the one the real crew
  faced — **restore** the injection that was just cut — instead of being asked to start something
  already running. In the campaign module the confusion beat moved to where its own dialogue
  belongs: after the securing, as its consequence. On Part 3 it is reached from the **complied**
  branch only — defend injection and there is no confusion to have, which the old plant could not
  express because it drained either way.
- **Pressurizer spray no longer works when the plant is water-solid** (#347). Spray controls
  pressure by condensing the steam bubble; with no bubble there is nothing to condense. Credited
  anyway, it pinned pressure **164 psi (1.1 MPa) below the code-safety setpoint** on a solid RCS
  taking injection — so the safeties could not lift, nothing arrested the fill, and inventory ran
  back to the numerical ceiling #346 exists to keep it away from. Found on the one path #346 did
  not exercise: the operator correctly **isolating** the stuck valve. The spray valve still opens
  and still indicates open; what is gone is the effect. `Manuals/12` §12.4c revised (set Rev 5) —
  going solid costs you the pressurizer as a pressure controller, and the relief valve becomes
  your pressure control whether you wanted it or not.
- **The final-exam mission was re-pointed at cues the plant still has.** `pwr_qualify` armed its
  graded window on the subcooling alarm, which no longer sounds; it now arms on the pressurizer
  going solid. The exam is harder and the lesson is the same — nothing screams the obvious
  parameter, and the candidate has to notice a plant held solid by injection against an
  unisolated relief path, behind a light that reads CLOSED. Its pass and fail text no longer
  claims a margin erosion that does not happen.
- **A water-solid reactor coolant system now repressurizes, and the relief valve is what ends
  the fill** (#346). The pressurizer had no water-solid regime at all. `_mass` was clipped at
  `primary.mass_max` (1.2) and — since #337 gave inventory a pressure channel — the surge driver
  was clipped with it, deliberately, so a plant pinned at the ceiling "reports zero surge instead
  of a phantom insurge it has nowhere to put". Both of those options are wrong: a solid RCS being
  injected into with no relief path does not absorb the mass and does not ignore it, it
  **relieves**. Measured full stack, a lost heat sink with emergency injection running: inventory
  pinned at exactly **120.00 %** for 45 minutes, pressure flat at **2232 psi (15.39 MPa)**, no
  PORV lift and no safety lift, while cold refuelling-water-storage-tank water quenched the plant
  **660 → 447 °F (349 → 231 °C)** through a mass sink with no outlet.
- **Raising the ceiling is not the fix, and was measured before the real one was written.** At
  `mass_max` 3.0 the plant simply runs to **300 % inventory** with pressure still parked in the
  PORV band, because the surge gain in use is the one for a pressurizer that still has a steam
  bubble. The bubble is the RCS's only compressible volume; once the level line reaches 100 % it
  is gone and the same displacement compresses **liquid**, so the gain steps to the bulk modulus
  of water (≈ 1.3 GPa, new `pressurizer.solid_bulk_mpa`). The fill then arrests where the vessel
  geometry says it must — measured **109.35 %** against **109.28 %** predicted from the level
  slope — and cycles the PORV at ~18 % duty instead of pinning silently at a clip.
- New declared simplification **`Manuals/12` §12.4c** (set Rev 4): only the *surge* stiffens.
  Relief, spray and the heaters keep their bubbled-plant gains, all three of which are optimistic
  in a vessel with no bubble, so a real solid plant is harder to control than this one. The
  relief-only version of that correction was built and **measured to be worse than leaving all
  three alone** — it drops the relieving equilibrium ~145 psi (1 MPa), which un-deadheads the
  ECCS and lets injection out-run the PORV again, walking inventory straight back to the clip.
- **Known cascade, tracked as #347 and not fixed here:** the TMI-2 flagship's decision point was
  resting on this same discard. With the RCS pinned, the surge could not push back and the PORV
  relief term ran unopposed to **52 psi (0.36 MPa)** while the inventory gauge read 120 %. A
  stuck-open PORV is now matched by unterminated injection, the plant goes solid at pressure, and
  `subcooling_low` never fires — which is the TMI-2 counterfactual, correctly. What the scenario
  is missing is the crew's actual 1979 error, throttling injection back on the rising level.
  `run_scenarios` 3/3 → 1/3 and `run_campaign` 48/51 → 42/51 until that is re-authored.
- **Every pump on the board spun on its RUN COMMAND instead of on delivered flow** (#350 items 7,
  13, 15). Measured full stack with a station blackout injected at 120 s: the condensate pump's run
  flag reads TRUE for the whole event — correctly, nobody stopped it — while its flow is 0; the
  charging pump the same; and the feed pump's commanded speed winds **100 → 120 %** as the level
  channel chases a level it can no longer reach, against feed flow of 1.5e-52. Three pumps drawn
  spinning on a dead bus, one of them faster than at power. Run lights and handswitches still show
  the operator's demand (the #329/#332 split); the impeller now shows the rotor. Item 7's other
  half comes free: the feed pump's animation tracks feed rate during normal load-follow, which it
  never did.
- **The primary loop froze solid with the reactor coolant pumps stopped** (#350 item 18). Pipes
  were gated on the components at their ends, and the pump art correctly reads STOPPED — but the
  `rcs_flow` elbow-tap instrument measures **4.47 %** two minutes into a blackout (#325 natural
  circulation), so the board was contradicting its own gauge. The loop now keeps a slow crawl,
  driven from the instrument rather than from `true_state`.
- **The PORV relief line ran blue water at 2235 psi (15.41 MPa) in every state of the plant**
  (#350 item 6). Two of its three legs were authored as water. A relief valve on a pressurizer
  with a steam bubble passes STEAM, and only passes water once the pressurizer goes solid — which
  is the condition the TMI-2 lesson turns on. The phase is live now, read off indicated level
  against the going-solid trip setpoint.
- **The vital gauge strip strobed at steady power** (#350 item 16). Reactor power changed band
  **49 times in 40 sim-seconds** at hot full power with nothing wrong, because 100.0 % sits on a
  band boundary and the channel's own noise is 0.21 %. Hysteresis on the live reading's region:
  49 → 0 at steady power, with real transient crossings unchanged.
- **The steam-generator-to-feed line, the circulating-water runs and the whole secondary kept
  animating through a blackout** (#350 items 9, 14). Each pipe now reads its own train's measured
  flow, so a line is still when — and only when — nothing is moving through it.
- **REACTIVITY removed from the board; PERIOD takes its place** (#350 item 5). Two readouts for
  one fact; period is the form an operator works in.

### Added
- **Pressurizer spray flow indication** (#350 item 1), in the spray panel. Delivered spray, not the
  valve demand beside it — and the difference is the lesson: with spray commanded to 100 % and the
  pumps running it reads 100 %, and with the pumps stopped the demand is unchanged at 12.00 while
  delivered spray falls to 4.45, because the spray line takes its motive head from the loop.
- **RCP FLOW indication under the reactor coolant pump card** (#350 item 17) — reactor coolant
  flow as a percentage of rated, the same channel the low-flow reactor trip acts on. Not a
  duplicate of the pump run lamps: those show the breaker, this shows flow, and the two disagree
  on natural circulation.
- **Dash speed on every pipe now tracks that line's flow** (#350 item 10), quantised so a rate
  change is a rare re-phase rather than continuous jitter, and computed once per SYSTEM so a
  fitting and the pipe it meets can never disagree.
- **The System Scanner covers the Physics tab** (#350 item 3) — all 29 rows, each with a summary
  and a paragraph, gated so a new row cannot ship without copy.
- **A fully-minimized instructor panel** (#350 item 19). The minimize button is a ladder now:
  expanded → collapsed → header only. The header survives because it carries the unread badge.
- **A second column in the graph parameter list when the panel is wide enough** (#350 item 23).

### Changed
- **Pipe colours inverted: the moving dashes are the DARKER colour** (#350 item 20), so a pipe
  reads as full of fluid rather than as empty with something glowing inside it. The reactor's
  downcomer streaks pick up the same treatment and now track temperature at all, which they never
  did (#350 item 12), and the cold-side depth gradient is gone (#350 item 22).
- **Steam generator U-tubes: four fatter tubes instead of five thin ones** (#350 item 11), and
  bubbles in both the steam generator and the pressurizer now rise to the water surface and stop
  there instead of a fixed distance (#350 items 24, 25).
- **The pressurizer surge line shows direction** (#350 item 26) — insurge and outsurge, derived
  from the indicated level rate. It was drawn one-way, so it showed flow into a pressurizer whose
  level was falling.
- **Scanner copy spells out every system acronym in the entry that uses it** (#350 item 2) — 122
  unexpanded uses across 166 entries, now gated. Unit symbols (psi, gpm, ppm, MWe) keep their
  standard spelling.
- **Graph value chips carry their units** (#350 item 21) — pressures and megawatt figures printed
  bare numbers, and temperatures printed a bare degree sign in both display modes.
- **CHARGING and LETDOWN captions enlarged to match BORON STATUS** (#350 item 27); the core ΔT
  margin readout carries its unit (#350 item 4).

### Added
- **An audit session no longer loads the conclusions it is auditing** (#221). `Blueprint/AUDIT_CHARTER.md`
  plus `.claude/settings.audit.json`, launched with `claude --settings .claude/settings.audit.json`.
  The settings file excludes `CLAUDE.md` across all three worktrees **and** the auto-memory index;
  the charter is `CLAUDE.md`'s operating half — Hard Rules, the layer map, `measure_stack` traps,
  lane rules, units, the issue axes and #221's own rules of engagement — with every finding, gate
  score and tuning conclusion removed. Developer-facing only; nothing in the sim changes.
- **MFW RESTORE control on the SG FEED card, and main-feedwater isolation now SEALS IN**
  (#341 + #319 item 2, shipped as one change). Main feed isolates automatically on three signals
  — reactor trip with Tavg low, steam generator level high, safety injection — and it **latched
  with no control anywhere to clear it**, so the player could enter that state and not leave it.
  Separately, a restore issued by any path was **accepted while the isolating signal was still
  standing**: measured full stack, a restore 10 min into a post-trip ride with Tavg parked at
  567.5 °F (297.5 °C) against a 572.0 °F (300.0 °C) setpoint went through, feed returned and SG
  level ran 36.58 → 77.43 %. Actuations may now declare `seal_in`; an operator command that would
  undo one is refused with a readable message while its condition holds, and the actuation re-arms
  when the condition clears so a second valid signal can still isolate. Sourced to WTSM 12.3.2.3
  (ML11223A310) — *"The control room operator cannot interrupt any of the SI-initiated functions
  until the reset logic is satisfied"* — and WTSM 11.1.4 (ML11223A293), which names *"Manual
  control by the operator"* as the fourth override. **Declared departure:** the real reset is two
  steps behind a 45–60 s timer and a separate pushbutton; this plant collapses it to one.
  The practical chain is **trip → reset the RPS → restore feed**, which finally gives `reset_rps`
  a consequence. `run_m4` 38/38 → **39/39 (257 checks)**, injection-verified three ways.
- **`run_manual_rev` gained a content canary — the check a lane merge walks through** (#345).
  The gate verified the revision table's *shape* (newest-first ordering, no gaps, set-wide stamp,
  content digests, packed copy) and never read chapter **body** text: its only chapter read pulled
  the `**Revision:**` stamp. So nothing connected a row's **claim** to the chapter, which is the
  gap a merge walks through — `Manuals/` files are edited in the MIDDLE by two lanes, so git
  resolves in one lane's favour and says nothing, unlike the append-at-top logs that conflict
  loudly. It has happened: the 2026-08-03 backshop merge silently dropped an entire `Manuals/12`
  §5.5 section, the digests were **re-sealed by the merge** so they agreed with the surviving text,
  and the row still claimed the change — *the record said it was documented and it was not.*
  Every chapter-qualified section a row names — `**12 §5.5**`, `**09 §2.0**`, `**12 §12.4b**` —
  must now resolve to a heading or a register table row in that chapter. **The 2026-08-03
  signature is reproduced and caught**: digests green, canary red naming the row.
  Measured: 11 of 11 chapter-qualified refs resolve across the full 26-row pre-zeroing table,
  1 of 1 live. Bare `§7.5` is deliberately not resolved — 44 in that table, pointing variously at
  a Blueprint document or the chapter under discussion, so resolving them would guess. Both a
  heading and a register row count, because chapter 12's §12.0 holds its declared simplifications
  as a numbered table. One check rather than one per ref, so ordinary manual work cannot move the
  baseline. The second new check is an **anti-hollow guard**: changing the reference syntax made
  the canary pass while checking nothing, so the parser must positively find refs.
  **Scope unchanged where it matters** — this proves a named section still *exists*, never that a
  row's prose is *true*; that stays out of scope as HR10/HR12 class.
  **Corrected the same day, by the first real three-lane merge.** That 11-of-11 validation was
  weaker than it looked: every row in the historical table was written by **one lane**, spelling
  refs `**12 §5.5**` with the emphasis around the whole thing. The merged table put `**12** §7.1`
  beside it — emphasis around the **chapter only** — and the parser silently dropped it, guarding
  1 claim of 4 while reporting green. Emphasis between the chapter and the `§` is now tolerated;
  refs found 1 → 2 on that table, and dropping `### 7.1` from chapter 12 reds the gate by name.
  A coverage claim validated against a corpus one author wrote is not validated.
  **Residual limit, stated rather than papered over:** a row naming a chapter but no `§` section
  cannot be guarded at all — the same merge produced one (`` `03` ``, `` `05` ``, `06 step 4`).
  That is an authoring obligation, now recorded in `CLAUDE.md`.
  `run_manual_rev` **13 → 15 checks**.

### Fixed
- **A break is a hole, not a pump — LOCA discharge now follows reactor coolant system pressure**
  (#334 item 2). A break used to flow at a **constant rate**, fixed the moment it opened and never
  varying: the same break discharged identically at **2235 psi (15.41 MPa)** and at **14.5 psi
  (0.1 MPa)**, so depressurizing did nothing to it, and a vessel already clipped at zero mass went
  on discharging at full rate indefinitely. Only the steam-generator-tube-rupture path responded
  to pressure at all — the code comment beside it said *"containment-side leaks stay static"*,
  which is the defect written down in the source.
  **Sourced to 10 CFR 50 Appendix K I.C.1.b** *Discharge Model*: the rate must come from the Moody
  critical-flow model, applied as *"a discharge coefficient applied to the postulated break
  **area**"*. A break is an area, not a flow. Discharge now follows the orifice law, ∝ **√Δp** to
  containment, referenced to the operating point so **every existing break size keeps the
  calibration it was tuned with** — only the depressurized end of the curve is new.
  **What changes for the player:** a full-size break is now the design-basis event it should be —
  the core uncovers at 90 s, the **accumulators dump**, the core refloods, and peak cladding
  reaches **1447 °F (786 °C)**, below the damage threshold. Before this it drained to zero and
  melted, and nothing in the test suite had ever exercised accumulator injection on a LOCA.
  Closing the pressure difference now genuinely reduces break flow, which is why that is the
  response to a tube rupture, and an RCS at containment pressure has stopped discharging.
  **Declared** in `Manuals/12` §12.4b (Rev 1) including which way it errs: √Δp falls off faster
  than Moody once the discharge flashes, so a real break stays stronger for longer than this one.
  `run_behavior` **50 → 51** (CA-11, 13 checks; the measured exponent is **0.500** against
  0.000 for a constant law and 1.000 for a linear one).
### Fixed
- **Losing reactor coolant now moves primary pressure and subcooling margin, not only pressurizer
  level** (#337). The pressurizer's surge term had exactly one driver — thermal expansion of the
  loop — so a leak displaced liquid out of the pressurizer and the model did not notice. Measured
  full stack before the fix: a tube rupture that took pzr level **55.0 → 15.7 %** and scrammed the
  reactor moved pressure **5 psi (0.034 MPa)** and the subcooling margin **0.2 °F (0.1 °C)**. The
  PWR's primary "are we still safe" parameter could only degrade thermally.

  A surge is a **volume displacement of the pressurizer**, and WTSM 3.2 (ML11223A213, p. 3.2-8)
  states the mechanism without reference to its cause — *"Temperature changes produces changes in
  coolant density, which force water into (insurge) or out of (outsurge) the pressurizer… the
  contraction of the coolant produces an outsurge… accommodated by an expansion of the steam
  bubble and a corresponding decrease in steam density and pressure."* A subcooled loop is
  incompressible everywhere else, so inventory comes out of the pressurizer at exactly the rate
  the level line already says it does. The law is now written in **level-rate** units so both
  drivers convert into it through the geometry `stepLevel` already carries (`level_per_tavg`,
  `level_per_mass`); `K_surge` (°C/s) became `K_surge_level` (%/s) and the thermal response is
  **bit-identical**, because the fitted value re-expressed is 0.4 and the sourced band is 0.27–0.63.

  It runs both ways, which matters as much: unthrottled safety injection now **repressurises** and
  can take the plant solid, the behaviour operators throttle SI to avoid.

  **Relief is excluded from the surge and the relief gains are re-solved, 300 → 600.** A PORV and a
  code safety valve discharge from the pressurizer *steam space*, so that mass never crosses the
  surge line. Leaving it in carried a valve's authority twice while subcooled and — because the
  surge is suppressed once the loop voids — only half once it voided, which is the regime every
  accident path lives in.

  **NOT FINISHED.** The TMI-2 flagship and the SGTR procedure's depressurisation step are still
  written against the old trajectory and are red, and one behaviour probe (TR-15 leg E) now says the
  plant rides out a lost heat sink on relief bleed — a plant question, not a tuning one. Measured
  detail in `Diagnostic/TUNING_LOG.md` 2026-08-04g.

  **The magnitude is still damped, deliberately and declared** (`Manuals/12` §12.15, and filed on
  #337 as an owner decision). The pressurizer heaters are modelled at 27× the authority their own
  source supports — WTSM 3.2 p. 3.2-9 rates 1794 kW as *"capable of raising the temperature of the
  pressurizer and its contents at approximately 55 °F/hr"*, i.e. 0.23 psi/s, against this plant's
  80 psi/s — so they rebalance against the surge and hold the cue to about **1 °F** of margin where
  the sourced rating gives about **9 °F**. Correcting it is measured but not taken: below 0.10 the
  plant can no longer ride out a full load rejection without a reactor trip, which is its ruled
  identity, and below 0.20 a stuck-open spray valve runs it to the containment floor.

### Changed
- **Manual set Rev 1 — the RESTORE control documented, and four "cannot be restored" claims
  corrected.** `Manuals/03` §9.0 gains the control: what isolates main feed, that the isolation
  seals in and the button is *refused rather than dead* while its signal stands, and the sequence
  that follows — confirm trip → reset the RPS → restore, because the low-Tavg isolation is a
  coincidence of low Tavg *and* the trip latch. It carries the measured warning that restoring into
  a generator already recovering on AFW drives level 36.6 % → 77 % in about two minutes and
  re-isolates at 90 %. The PWR-T06 post-trip checklist and `Manuals/05` both stated main feedwater
  "cannot be restored from the board", which stopped being true when the control shipped; both are
  corrected, and the checklist now says restoring is optional — Mode 3, Hot Standby is stable on
  auxiliary feedwater indefinitely.
- **Session-log headings name the LANE: `YYYY-MM-DD-<lane>-<letter>`** *(OWNER RULING, 2026-08-04:
  "Work issue 339 in develop. Go with option 2.")*, #339. `Diagnostic/TUNING_LOG.md` and
  `Blueprint/BUILD_DECISIONS.md` are cited by their dated headings, and the old per-day sequence
  letter required three worktrees to agree on who got `b` — which they cannot, since a lane cannot
  see another's uncommitted file. Measured across both files: **17 labels name more than one entry**
  (7 + 10), `2026-08-04b` resolving to two sessions in one and three in the other. Lane = the tree
  (develop / workbench / backshop); letter = the next unused for that date *in that lane*, `-a`
  first. **The mandatory letter is a declared departure from the filed option**, which had none:
  measured, 25 sessions landed on 2026-08-03, ~8 per lane, so a bare first entry collides within a
  lane on day one and forces exactly the retro-rename the option existed to avoid. Existing labels
  are **not** renamed, by the same ruling — they stay as the record of the day three lanes landed at
  once. New gate `test/run_session_labels.js` (8 checks, `run_all` 37 → 38): parse, no duplicate
  lane-form label, everything dated 2026-08-05 or later is lane-form, newest-first within each
  date+lane. Grandfathered collisions are reported and never failed.
- **The public changelog page is facts only** *(OWNER, 2026-08-04: "Just keep to facts in the
  changelog page. Minimize prose.")*. Cut the "This log begins with the public launch" lead and
  trimmed the Alpha 1.0.0 entry to *"Initial Alpha release. Pressurised water reactor."* The
  rendered page is now the heading, the ordering note, and the entry — nothing else. The rule is
  in `CLAUDE.md`, the `release-to-main` skill and the page's own `ADDING AN ENTRY` template:
  name what changed and stop; no lead-in paragraphs, no sentence that would still read fine if
  deleted. `CHANGELOG.md` stays dense — the two files are deliberately different documents.

### Fixed
- **A release could merge, tag and pass CI without ever going live** *(OWNER, 2026-08-04: "Why is
  it taking so long to deploy?" → "Let's fix the gap and release.")*. Alpha 1.0.0 did exactly that:
  `main` was correct, `v1.0.0` was pushed, `aggregate-gate` was green and the Vercel commit status
  read **success** — and the production domain went on serving the previous release, because the
  only deployment created for that commit was a **Preview** aliased to a `*.vercel.app` URL. The
  newest `environment=Production` deployment was still the release from four hours earlier, which
  is what the edge was serving (`X-Vercel-Cache: HIT`, `Age: 13895`).
  **A green "Vercel — success" status is not evidence of a production deploy** — a preview build
  satisfies it. The release procedure now asserts `environment=Production` for the released SHA via
  `gh api`, and **holds the `develop` push until it exists**: fast-forwarding `develop` to the same
  commit seconds after the merge gives Vercel two events for one SHA, and that is when the
  production build went missing. Measured, the previous release got Production **and** Preview 11 s
  apart for its shared SHA, so preview-only is not the normal outcome. A missing production deploy
  is indistinguishable from a slow one from outside, permanently, so the check is now explicit
  rather than "wait and see". `release-to-main` §5b, and the rule in `CLAUDE.md`.
- **A small LOCA destroyed the core while a bigger one was survivable — the pressurizer heaters
  held an empty reactor at 2207 psi and deadheaded the ECCS** (#334). Reported from play-testing
  ("some things didn't seem right"). Measured full stack with ECCS available and actuating
  normally, 20 min: a **5 %** break reached fuel damage, **10 %** and **15 %** breaks fully
  recovered, **16 %** damaged again. **The break was never the mechanism.** ECCS refilled the RCS
  to 120 %, quenched the loop to ~212 °F (100 °C), and then the pressurizer heaters — still at
  **92 %** with the level indicating a flat **0 %** — drove pressure back to **2207 psi
  (15.22 MPa)** against coolant **240 °C subcooled**. Nothing thermodynamic produces that
  pressure; it is heater power alone. At 15.5 MPa the pressure-driven ECCS curve delivers
  **0.0034 frac/s against a 0.050 leak** — injection deadheaded, core dry, and heater ≈ break is
  a *stable* equilibrium, so the core stayed dry indefinitely.
  **The plant had no low-level heater cutoff at all.** Now built, and the setpoint is the
  source's own: WTSM 10.3 *Pressurizer Level Control System* (ML11223A290) §10.3.4.1 — *"This
  bistable provides a low level interlock at 17% level in the pressurizer … and turns off all
  pressurizer heaters. … the heater cutoff protects the heaters which would be damaged if
  operated in a steam environment."* They are damageable because they are *"replaceable,
  direct-immersion, tubular-sheath type heaters … located in the lower portion of the
  pressurizer vessel"* (WTSM 3.2, ML11223A213). It reads the **indicated** level, not truth, so a
  failed level transmitter defeats it exactly as it fools the operator (HR1), and it is a
  physical de-energization — the operator's selector and demand are left where they were put, the
  #200/#329 rule.
  **Outcome is now monotonic, and the boundary is derivable rather than fitted**: breaks survive
  up to exactly `hpi_flow_max + lpi_flow_max·lpi_inventory_gain` = **0.160 frac/s** and not
  beyond. `run_behavior` **49 → 50** (CA-10, 14 checks, injection-verified twice).
  **Still open on #334**: LOCA break flow is pressure-independent (only SGTR is ΔP-scaled), and
  the break-size slider's *default* sits above the ECCS ceiling and so is unwinnable by
  construction.
  **Correction (2026-08-04d).** This entry first listed a third item — that the letdown-isolation
  half of the same 17 % bistable was not built, and that its absence was why the cutoff chatters
  after a loss of offsite power. Both halves of that were wrong. **The isolation already
  existed**, one layer up, as an M4 actuation at the same 17 % (latched, restoring at 20 %); it
  was missed by grepping the engine rather than the control layer. **And it was not the cause** —
  letdown reads a flat zero through the whole chattering window. The chatter comes from a
  sustained **manual 100 % heater demand** at no load walking pressure past the PORV setpoint, so
  the valve cycles and takes the level with it: a correct plant answering an incorrect operator
  action. Without that demand a loss of offsite power produces no chatter at all.


## [Alpha 1.0.0] — 2026-08-04

### Added
- **Natural circulation — a loss of offsite power was terminal and is now survivable** (#325)
  *(OWNER RULING, 2026-08-04: "Go with one B")*. With the RCPs stopped there was **no core→steam-generator
  heat path at all**: measured full stack, a LOOP reached fuel damage at **30 min** and melt at **45 min**,
  and starting AFW moved melt to 50 min and changed nothing else. `DESIGN_COMPANION` §8.6 declared this
  departure and rated its impact *"slightly more severe (conservative)"* — that line was wrong by a wide
  margin, and §8.6 is now **retired** rather than re-justified.
- **The steam generators sit above the core, so density difference drives flow.** Sourced to WTSM 3.2.6.3
  (ADAMS **ML11223A213**): *"The higher elevation of the steam generators relative to the reactor vessel
  produces a thermal driving head to establish and maintain flow in the RCS … sufficient only for decay
  heat removal of a shutdown reactor, not for power operation."* Buoyancy head scales with loop ΔT and
  resistance with flow squared, and the core rise is itself heat/flow, so the two close to **flow ∝ the
  cube root of core heat** — measured **4.1 %** of rated at 5.3 % decay heat, **3.0 %** at 2.1 %, matching
  the predicted ratio to within 0.1 %. After the change the same LOOP parks Tavg at **567 °F (297 °C)**
  indefinitely, and a station blackout squeezes to **9.2 °F (5.1 °C)** of subcooling at 30 min and then
  recovers to 39 °F by four hours, with no fuel damage.
- **Two limits are the lesson, and both are modelled.** It needs a **liquid-filled loop** — circulation
  ramps to zero as the primary voids, which is why tripping the pumps into a voided loop at TMI-2
  established nothing. And it **moves** heat rather than removing it: lose the secondary heat sink and the
  plant is still lost. A constant-floor design was measured first and rejected for failing the first of
  those — it circulated through a fully voided loop, reading 3 % flow at void fraction 1.00 while the
  cladding melted.
- **The magnitude is fitted and declared as such.** The mechanism and its cube-root scaling are sourced;
  the coefficient is not, because no primary for the flow magnitude could be obtained. The *"2–5 %"* this
  repo quoted in §8.6 and `Manuals/01` was uncited inherited prose and is deliberately **not** the anchor.
  `Manuals/12` §12.4 now carries that as the declared departure in §8.6's place.
- **Loop ΔT is honest under natural circulation too.** `flow_floor` clamped the leg split below 10 % flow —
  exactly the band natural circulation lives in — so the split under-read by **2.4×** (34.5 °F where the
  energy balance says 81.9 °F). Lowered to 1.5 %, below the weakest circulation this plant can make, so it
  never binds in the regime that matters. This matters because loop ΔT is the cue a real crew uses to
  verify natural circulation. New probe **TR-15**; `run_behavior` **47 → 48**, `run_contract` **144 → 145**
  (`natural_circulation`).

### Changed
- **The plant is renamed `SLX-100` → `SLS-100`** (#328) *(OWNER DIRECTIVE, 2026-08-04, issue #328:
  "Rename the plant the \"Single Loop Simulated - 100MWt\" AKA \"SLS-100\".")*. The expansion goes
  from *Single-Loop eXperimental* to **Single Loop Simulated**. **The digit stays ELECTRICAL** — the
  request named 100 MWt, but this plant's core is **≈ 300 MWt** against **≈ 100 MWe** and `Manuals/01`
  and `12` both state the pair, so reading it as thermal would have contradicted `identity.mwt_rated`
  and every manual rating table by 3× *(OWNER RULING, 2026-08-04: selected "SLS-100 = 100 MWe" from
  three options put to him — 100 MWe, `SLS-300` = 300 MWt, or no number at all; a selection, not
  verbatim words)*. **No number in the product moves**; this is two letters and the acronym reading.
  22 sites across 12 files — `identity.name` is **not read at runtime**, so the name is duplicated by
  hand into the manuals, the site pages and `tools/pack_manuals.js`, and no gate asserts the string.
  `CHANGELOG`/`TUNING_LOG`/`behavior_results.json` keep `SLX-100` deliberately: they are record, and
  they describe what was true then. Manual set **Rev 27**.
- **Board text is ALL CAPS, units excepted** *(OWNER DIRECTIVE, 2026-08-04: "All text should be in
  all caps except units should follow standard unit conventions for capitalization.")*. MEASURED by
  mounting the board headless and reading every rendered text node: **225 nodes, 34 not all-caps —
  and 30 of the 34 were units**, which the directive exempts. So the real work was four turbine-side
  captions (LOAD / OUTPUT / GOVERNOR / TURBINE) and the five TRIP BLOCKS captions. The four live in
  `DOC_PATCHES`, not in `pwr_board_data.js`, because that file is generated and a re-export would
  undo an edit there. `board_check` now asserts the policy over the rendered board — units exempt as
  whole **tokens**, never substrings, or stripping a bare "s" would eat the s out of ordinary prose.
- **Physics tab numbers are brighter and carry the indication colours** *(OWNER DIRECTIVE,
  2026-08-04: "make the physics numbers brighter under the physics tab. The contrast is currently too
  low. Also make these physics numbers follow the indication color scheme (grey, green, yellow, red,
  etc.)")*. The generic numeric-grid colour is `#4a6070` — **2.84:1** on the panel background, which
  is deliberate for the quiet board and unreadable for a panel you read numbers off. Physics rows are
  now grey `#98A3AF` at **7.27:1**, with green for a satisfied criterion (5.91:1), amber for caution
  (8.29:1) and red for alarm (4.76:1); all four clear WCAG AA, the old value failed it. Scoped to
  `.phys-grp`, so the quiet default survives in the All view and the RBMK/BWR grids.
  **Grey vs green is the teaching distinction**: green means "something is being checked here and it
  is fine", so the 18 rows with no health criterion stay grey or green stops meaning anything. A row
  whose value is missing now gets **no** colour — a green em-dash asserts a criterion is satisfied
  about a number nobody has, which the first cut of this change did for peak clad temperature.
- **The Inject Failure list is grouped** *(OWNER DIRECTIVE, 2026-08-04: "organize the list of
  failures into logical groupings.")*. 24 failures in seven groups on the **same energy-path spine**
  as the Graph list and the Physics tab, so the three lists read alike. Deliberately *not* the
  catalog's own `category`: those five values type the failure for the control layer and group badly
  for a player — `power` held main feedwater, the turbine, offsite power, a station blackout,
  condenser vacuum, SG overfeed and both steam line breaks. The badge still shows the category.
  Membership is hand-maintained, so an unlisted failure renders under "Other" rather than vanishing,
  and `run_inspect` checks both directions plus duplicates (**8/8 36 → 9/9 42**).
- **`Pre Alpha` → `Alpha 1.0.0`, and the update-tracking page is live again** *(OWNER DIRECTIVE,
  2026-08-04: "The next release will take the program out of pre-Alpha and into Alpha and bring
  back the update tracking page. Update tracking summaries/lists should be concise.")*. One
  version for everything accumulated under `Pre Alpha`; the Platform.Feature.Refinement digit
  rules resume from the *next* release. `changelog.html` carries its first real entry and the
  "Awaiting public launch" placeholder is gone.
- **The player-facing entry is ONE line** *(OWNER DIRECTIVE, 2026-08-04: "The first release should
  not have change log entries other than saying it's the initial Alpha release.")*. A first
  release has nothing to be a change *against*: every feature in it is new to every reader, so a
  feature list would be a product tour filed under the wrong heading. This developer file keeps
  its full history — it is the engineering record and the two are deliberately different
  documents.
- **The manual set is back to Rev 0** *(OWNER DIRECTIVE, 2026-08-04: "The plant manual revision
  number should be zeroed out for this release.")*. The 26 development revisions are in
  `git log` for `Manuals/`, which is where a per-chapter history belongs; a revision row exists to
  tell a reader what changed since the copy they had, and nobody had a copy before Rev 0. Stamped
  through all 13 documents and repacked; `run_manual_rev` unmoved at **13 / 0**. Note this is the
  *second* reset — an earlier Rev 0 was stamped 2026-07-31 in anticipation of go-public and the
  counter then ran to 26 before the release happened, which is the argument for zeroing **at** a
  release rather than ahead of one.
- **Versioning and the player-facing changelog are LIVE again**, superseding the 2026-07-31
  suspension, in all five places that encoded it: `CLAUDE.md` (Definition of done + *Website
  changelog & version numbers*), the `release-to-main` skill (banner, checklist **and its
  frontmatter description**), `changelog.html`'s `ADDING AN ENTRY` template and `site/release.js`.
- **`changelog.html` entries are capped at 8 one-line bullets**, aggregated by system rather than
  enumerated per commit, and explicitly *not* derived line-by-line from this file — a single item
  here runs 30 lines. The cap is the operational reading of the directive above; the brevity is
  the directive.
- **The bump and the first entry must land in ONE change.** `run_release.js` is in pre-release
  mode, where **zero** published entries is the *correct* state, so an entry added while
  `RD_RELEASE` still reads `Pre Alpha` is a red gate — and a bump with no entry is red the other
  way. Setting the `Alpha X.Y.Z` format arms three further checks by itself, taking the runner
  **8 → 11**. Not a new mechanism; it was undocumented, and both directions are now written down
  where the mistake would be made.
- **Found by simulating launch day against the real gate: the release as #282 specifies it ships
  a RED.** `CHANGELOG.md` still carries `## [Alpha 1.11.0]` down to `## [Alpha 1.7.0]`, so
  rolling `[Unreleased]` to `## [Alpha 1.0.0]` puts **1.0.0 above 1.11.0** and fails *"version
  headings are newest-first"* — **10 checks / 1 failed**. #282 records the opposite ("the
  ordering trap only existed because 1.0.0 had to sort below 1.10.0/1.11.0 … not needed at
  all"), which was true of the *site* changelog and never checked against the developer one.
  Relabelling the eight pre-launch headings so they stop parsing as released versions gives
  **11 / 0**. It also restores a check that would otherwise be silently absent: while 1.0.0
  sorts below the oldest named heading it falls under the CROSS rule's floor, so the launch
  entry's date agreement across the two files is **not verified at all**. Recorded in the
  release skill and #282; not done now, because it is release-time work and a structural call.

### Fixed
- **The core-material temperatures ran away without bound past melt — 355 618 °C (640 144 °F) at two
  plant-hours** (#326). `melted` is the end of this model's declared validity, and **both** nodes kept
  integrating through it, by two different mechanisms with no termination condition. `fuel_temp_c` is
  a pure integrator: on a fully uncovered core `hFcEffective` returns 0, so `dTf` loses its only sink
  — measured **5032 °C (9089 °F)** at 2 h, still climbing on a 1.87 % decay tail. `clad_temp_c` is
  worse and is **not a follower of it**: the #238 Arrhenius oxidation term is exponential in the
  node's own temperature while the protective oxide only grows as √(integral), so above melt the
  exponential wins — **oxidation heat reached 1095 % OF RATED**, eleven times full reactor power out
  of a core making 4 % decay heat. Both nodes now stop at `melted`. Nothing below melt moves: MD-11's
  escalation bands are unchanged at 184 / 172 / 86 / 40 s.
  **Two things the issue and its investigation had wrong, both because the tree moved under them.**
  The filed mechanism (oxidation, Arrhenius) was rebutted as *"there is no zirconium-oxidation term in
  this engine"* — true when written, **stale within the day**: #238 built exactly that on 2026-08-03.
  And the rebuttal's fix — *"the termination has to go on `stepFuel`"* — was right for the pre-#238
  plant and is **insufficient now**: injection-verified, a `stepFuel`-only freeze leaves 3 checks red
  and the clad node drifting **312 089 °C**, indistinguishable from no fix. The filed reproduction
  path is also gone — #325 made a loss of offsite power survivable, so a LOOP now parks at
  **307.9 °C (586 °F)** with the core intact; the runaway reproduces on an unmitigated large break.
  `run_meltdown` **11 → 12** (MD-12, 9 checks, injection-verified two ways).
- **The pressurizer had two different slopes, and one of them melted the core in silence** (#330).
  Turning the CVCS make-up channel off at full power — one button on the board, `defaultOn`, nothing
  else touched — **melted the core at 22.1 min, un-scrammed**, with primary pressure, Tavg and the
  subcooling margin **dead flat at nominal** and the cladding at 24,958 °F (13,848 °C). Two caution
  annunciators on one level channel were the entire indication.

  The cause was a geometry error, not a missing alarm. `level_per_mass` (the deficit slope) was
  **100 %/frac** against `level_per_mass_surplus` **776** — two contradictory statements about one
  pressurizer. A subcooled RCS is incompressible liquid everywhere except the pressurizer bubble, so
  inventory leaving it comes out of the pressurizer at exactly the rate a surplus packs into it; the
  geometry does not know which way the flow is going. At the shallow slope the loop could shed
  **37.5 % of its mass while the gauge still read 17.5 %**. Both slopes are now the sourced 776
  (BVPS-2 UFSAR Tbl 5.1-1/5.4-12 + WTSM 3.2 Tbl 3.2-2, the same three tables that fitted the surplus
  branch in #249).

  **The protective actuation was never broken.** The low-pressurizer-level letdown isolation fires at
  20 % indicated on both plants — what moved is the *inventory* it corresponds to: **65 % before**
  (core already uncovered, which is why #330 read it as the thing destroying the core), **95.1 %
  after**. Measured on the identical rig, the plant now isolates letdown at ~2m30s and sits at
  95.1 % inventory / 17.0 % level out to 40 minutes: core covered, no damage, no melt, **no scram
  needed**.

  `level_per_void` moved **150 → 375.33** in the same change and had to: the TMI deception is the
  *difference* between the two terms, so leaving it at 150 inverted it (net +350 → −326 %/frac) and
  pressurizer level **fell** as the primary voided — the one lesson this plant is built around. It is
  re-solved from the two documented calibration targets rather than re-guessed, and it is deliberately
  **not** scaled proportionally, which would peg the gauge at 100 % and destroy the graded arc the TMI
  beats are written against.

  New probe **CA-9** (`run_behavior` 48 → 49), injection-verified: the old constant reddens **6 of its
  12 checks**. `run_reachability` B2 — *"an inventory loss can reach the 12 % pzr lo-lo scram"* — was
  the independent witness; the level used to fall 7.76× too slowly to reach its own trip.

  **One declared cost, ruled** *(OWNER RULING, 2026-08-04: "A")*: the pressurizer now drains 7.76×
  faster in wall-clock terms, so `ops_cvcs_pzr_drain_rate` reads 53.7 s against the ">= 300 s" feel
  target from a 2026-07-22 owner request. It is **left red rather than re-banded** — re-banding a feel
  target whenever the plant moves retires the target instead of reporting against it — and that red is
  now an *accepted, ruled state* rather than a pending question. The rejected alternative preserved the
  rate exactly by scaling `cvcs_inventory_gain`, but shrank CVCS make-up authority 7.76× and cost 7 e2e
  checks of real leak-holding behaviour. For scale, a real plant takes ~79 min for this drop, so both
  values were game-feel numbers rather than prototypicality.
- **`run_all` was silently losing the tail of a runner's output on Linux** (2026-08-04). Every
  runner here ends with `process.exit(code)`, and Node's I/O contract says pipes are
  **asynchronous on POSIX** and synchronous on Windows — so `process.exit()` can discard an
  undrained write, and a runner exits **0 with its tally thrown away**. MEASURED on CI: `run_m4`
  came back exit 0 with no tally, twice, stopping at two DIFFERENT points mid-suite. Exit 0 is
  what rules out the alternatives — an OOM kill, a crash and a timeout all report a non-zero
  code, and run_m4 passes under a 192 MB heap. It was invisible locally twice over: a runner
  run by hand gets a TTY (synchronous on POSIX), and the parent runs on Windows, where pipes are
  synchronous anyway. It surfaced when the pool went 3-way on CI's 4 cores.
  The child writes to a FILE now, which is synchronous on both platforms — one place, whole
  class, instead of editing `process.exit` in 38 runners and hoping the next one remembers.
- **The whole CVCS and the ECCS pump ran through a station blackout too** (#332) — #329 fixed the
  heaters; this is the general case, and the plant turned out to have **no concept of AC
  availability at all**. `station_blackout` was a bare boolean that four call sites happened to
  consult, so everything else with a motor kept turning. Measured full stack, `hot_zero_power`,
  blackout at t = 60 s: **letdown pinned at 0.0297 for three hours** and charging modulating against
  pressurizer level exactly as it does with the grid up, bleeding inventory **100 % → 76.55 %**
  through a system with no motive power. Worse, and not in the report — with the blackout in and the
  operator pressing SI, the **de-energized ECCS pump injected the RCS from 100 % to 120 %** (solid)
  in under five minutes. After the fix inventory holds at **99.99 %** over the same three hours and
  the ECCS pump delivers **zero flow at zero discharge pressure**.
- **There is now one place that answers "does this plant have electricity?"** — `true_state.ac_available`,
  derived once per step in `pwr_engine` step 0a, which also carries the roster of what dies with it
  and what does not. Every AC load reads that rather than inferring power from a casualty flag: the
  RCPs, the pressurizer heaters, the CVCS charging pump (and with it letdown and borate/dilute) and
  the ECCS injection pump. **A loss of offsite power still keeps all of it** — the diesels carry the
  1E buses — which is the same LOOP/SBO split #329 established.
- **Letdown is gated on the CHARGING PUMP, not on the blackout, and the source is why.** WTSM 4.1.3.1
  (ADAMS **ML11223A214**, p. 4.1-7), letdown orifice isolation interlock 2: *"At least one charging
  pump must be running in order to open any letdown orifice isolation valve. If the running charging
  pump(s) is lost, then the letdown orifice isolation valves close."* That one guard covers a
  **second defect the issue did not know about**: with the grid fully up, securing the charging pump
  left letdown flowing and drained inventory **100 % → 79.5 % in 13 minutes**, until the low-level
  isolation caught it at 17 %. Charging and safety injection are sourced to the same chapter (§4.1.3.4,
  p. 4.1-16) — *"single-speed, horizontal centrifugal pumps powered from vital (Class 1E) ac power"*,
  and *"The centrifugal charging pumps also serve as the high head safety injection pumps"*.
- **AFW and the accumulators deliberately survive**, and that is sourced too — WTSM 5.7.5
  (**ML11223A229**, p. 5.7-6): *"A station blackout fails all ac power except the vital Class IE ac
  busses from the dc invertors. All decay heat removal systems, except the turbine-driven AFW pump,
  also fail."* New probe **CA-8** asserts the survivors positively, because a suite of only
  everything-went-to-zero checks would be satisfied by gating the entire plant on the blackout flag.
  `run_behavior` **46 → 47**.
- **The pressurizer heaters ran through a station blackout** (#329) — reported from free play, and the
  heaters were modelled as an unconditional heat source with nothing asking whether the plant had
  any electrical power. Measured full stack from full power, blackout at t = 60 s: heater power
  reached **100.0 %** at 17m15s with every AC bus in the plant dead. With the operator calling for
  heat it is immediate and worse — 100 % from the button press, pressure walked to 2352 psi
  (16.22 MPa), and a **spurious `pzr_level low` reactor trip at 5m27s** driven entirely by phantom
  heat boiling liquid out of the pressurizer. **10 CFR 50.2** defines the event as *"the complete
  loss of alternating current (ac) electric power to the essential and nonessential switchgear
  buses"*, excluding only *"buses fed by station batteries through inverters"* — that exclusion is
  the vital instrument AC, which is why the board keeps reading while a megawatt of resistance
  heating does not. The pressurizer **spray** was already right (scaled by `flow_frac`, so it dies
  with the pumps); the heaters had no equivalent.
- **A loss of offsite power deliberately KEEPS them.** NUREG-0578 Item 2.1.1 / NUREG-0737 Item
  II.E.3.1 put the minimum heater group on redundant emergency diesel-backed buses precisely so it
  survives a LOOP; the blackout is the event that takes the diesels too. `loss_of_offsite_power`
  carries effect `coast_down_pumps` and never sets `station_blackout`, so gating on that flag gets
  the discrimination for free — measured, LOOP with heaters demanded reads **100.0 %**.
- **It is NOT written into the operator's demand, and that is the #200 lesson.** Setting
  `heater_override = 0` would be undone by the very next press of HEATER AUTO or the % box, exactly
  as the stuck-open spray used to heal itself. De-energization is a physical fact about the plant;
  the selector position and the latched demand are left as the operator set them, and what goes to
  zero is the power delivered. **Why 36 green runners missed it** is the #315 shape: the heaters are
  only *demanded* below setpoint, and a blackout on this plant repressurizes — a Mode 3 blackout
  A/Bs byte-identical across the fix because the controller never asked for a single percent in an
  hour. **The SBO outcome is unchanged** (inventory 70.8 vs 70.83 % at 10 min, damage at 30 min
  both): the blackout is terminal here for the natural-circulation reason #325 documents, and this
  is a correctness and indication fix, not a save. `run_behavior` **45 → 46** (CA-7).

### Added
- **The Physics tab shows CORE DAMAGE, and the two hidden drivers behind it** *(OWNER, 2026-08-03:
  "the physics tab should also show core damage. are there any other physics things the user might
  want to see?")*. A new **Core damage** group — peak clad temperature, **core uncovered**,
  **Zr oxidation heat**, and a damage row that reports MARGIN while the core is intact
  (`intact · 912 °F to damage`) and then `FUEL DAMAGE` / `CORE MELT`. The middle two are new
  `true_state` (`core_uncovered_frac`, `zirc_heat_pct`): they were locals inside `stepCladding`,
  so the panel could show the symptom (peak temperature) and the verdict, with the whole mechanism
  between them invisible. Measured on a 0.8 large LOCA — uncovery reaches 100 % by 50 s and the
  oxidation term climbs **0.077 → 0.943 % of rated** between 50 s and 400 s *while the decay tail
  is falling*, which is the entire point of #238 and could not be seen anywhere. Also added:
  **accumulator inventory** (the ECCS card shows flow, discharge pressure and alignment, but never
  how much passive shot is left).
- **The graph list is grouped, and carries the physics and the controls** *(OWNER, 2026-08-03:
  "add all these physics indications to the graph tab so they can be graphed… add rod steps and
  other controls like pzr heater, spray, etc. to the graph list. organize the graph list in an
  intelligent order and group them in groups.")*. 16 plottable quantities → **51**, in seven groups
  along the energy path: Reactor core · Core damage · Primary coolant · Loop pressure · Steam &
  feed · Turbine & output · **Controls**. The controls are the new kind — rod steps (both banks),
  pressurizer heater and spray, steam dump, feed pump speed, charging, letdown, and the three
  setpoints — so a trend can finally show the *input* beside the response. Uninstrumented
  quantities (decay heat, voiding, the loop pressure split, core damage) now trace in **Realistic**
  mode too, where they used to draw nothing: there is no channel to plot, so they plot the physics,
  which is what the Physics tab already is.
  - The buffer got **cheaper**, not more expensive: measured at its cap, the naive version of this
    change cost **75.8 MB** against the old 10.2 MB. Recording only the sides a series actually has,
    plus one row per 0.5 s of sim time instead of one per broadcast, brings it to **8.8 MB** — with
    three times the quantities. At the widest window that is still ~9× oversampled.
- **An operator load rate limit — 10 %/min, increases only** *(OWNER, 2026-08-03: "Come up with your
  own rate for this plant that's fast enough to keep it interesting and slow enough to be safe.")*.
  Real turbine control is rate-limited (WTSM 11.3, ML11223A295: the operator sets a target and a
  rate, and the EHC ramps between them), so the instantaneous 30 % load step this plant permitted
  was a fidelity gap — and a measurable one: a *normal* 70 → 100 MW step peaked loop ΔT at 109.1 %
  of rated, within **0.51** of the OPΔT trip and indistinguishable from a 15 % steam line break at
  109.8 %. **10 %/min is this plant's own number**: `Manuals/09` §8.0 already documented "Power ramp
  ceiling ~10 %/min class where achievable", so the turbine now enforces a limit the manual stated.
  Measured OPΔT floor on that ramp: **2.07 → 4.57**.
- **It limits INCREASES only**, and limiting both directions was measurably wrong. A load
  *rejection* is the grid or the machine throwing load off — an EVENT, not an operator ramp — and
  throttling it turned this plant's defining ride-out into a leisurely descent, taking out five
  behaviour probes, the `pwr_tour` greedy-ask branch and the SGTR EOP. Six probe sites now declare
  themselves events via `immediate: true`.

### Changed
- **The ROD status word is removed from the reactor-control card** *(OWNER DIRECTIVE,
  2026-08-03: "the new rod control indication that says "manual", "in", "out, is redundant.
  when in rod auto the withdraw or insert buttons glow amber when its automatically moving
  the rods. remove it")*. The card already says it twice: the ROD AUTO lamp carries the mode,
  and the WITHDRAW/INSERT buttons glow amber while the controller is driving, so the word was a
  third copy of facts the player was already reading. Its nine board_check pins went out with
  it and are NOT re-homed — every state they covered is asserted where it now lives (the ROD
  AUTO lamp; ROD LIMIT LO/LO-LO and the interlock refusals in `run_m4`; the OTΔT/OPΔT rod stops
  in `run_otdt`).

  > This entry exists because the ruling was recorded in exactly ONE place — a sentence inside
  > CLAUDE.md's board_check paragraph — and the 2026-08-04 lane merge replaced that paragraph
  > wholesale, taking the owner's words with it. `run_hardrules` caught it (142 → 141 citation
  > sites) and a grep confirmed the quote existed nowhere else in tracked markdown. A ruling
  > that lives only in a paragraph someone else is also editing is a ruling waiting to be lost;
  > the changelog is the durable home.
- **The runback's persistence delay is SOURCED, and removing it was the error** — it caused both of
  the red gates previously blamed on the rate limit. The real signal needs *"ΔT in **two out of
  four** reactor coolant loops"* within 3 % (WTSM 12.2): **2/4 coincidence voting is the law's noise
  immunity**, and a single-loop plant structurally cannot have it, so a dwell requirement is the
  substitute for the voting we cannot do. Without it the engage test fires on a **single physics
  step**: the normal ramp clips the trigger for **0.10 s at margin 2.90** on instrument noise, and
  because `immediate` moves the operator's ask the resulting 5 % cut is permanent — load parked at
  91.6 MWe (`run_autoctl` 91.5 %), and the SGTR EOP ran the runback twice instead of once
  (inventory 53.7 vs 54.4). Restored, with the rate limit widening its margin: the normal-ramp
  dwell is 6.40 s → **0.10 s** against a worst-casualty 10.58 s.


### Added
- **Zirconium-steam oxidation on the exposed-cladding hot node — the second heat source** (#238).
  `Zr + 2H₂O → ZrO₂ + 2H₂`, 190 kJ/mol. Above ~2012 °F (1100 °C) the cladding burns in steam, and
  that reaction is what carried the TMI-2 and Fukushima cores from *hot* to *melting* faster than
  decay heat alone can.
  - **It reverses the direction of the escalation, which is the real defect it fixes.** Decay heat
    *falls*, so the node used to climb more and more slowly: measured on an unmitigated large break,
    successive 720 °F (400 °C) bands took **218 / 334 / 378 / 428 s** — each slower than the last.
    They now take **184 / 172 / 86 / 40 s**. Cladding failure → fuel melt goes **22.7 → 8.1 min**
    (large LOCA), **32.8 → 4.9 min** (stuck-open PORV), **38.0 → 13.3 min** (station blackout).
  - **The calibration is sourced, not fitted to a timescale.** At 2200 °F (1204.4 °C) — the
    10 CFR 50.46(b)(1) peak-cladding limit — the oxidation heat equals the decay heat **8 hours
    after shutdown**; on this plant's own two-group decay curve that is **1.1243 % of rated**, and
    the algebra makes it hold exactly rather than by fit. The melt timescale is an *output*.
  - **Arrhenius and parabolic, not the linear-above-an-onset shape #238 sketched.** Baker-Just
    gives E/R = 22 898 K, so the exponential makes low temperatures negligible on its own — no
    onset constant and no discontinuity at one. The parabolic half means the oxide layer is
    protective and the term self-limits (it would otherwise be 3140× at the melt point), which is
    why there is an oxide state. That state is also the hydrogen hook #238 asks for.
  - Three of the four constants are sourced; only `zirc.tau_ref_s` is `[tune]`, and it is
    corroborated — Baker-Just reaches 17 % ECR, the 50.46(b)(2) limit, in ~80 s at 1204 °C.
  - **`run_meltdown` 10 → 11 (MD-11)**, and it asserts the **second derivative** rather than a
    timing band: the battery was green with the term absent *and* with it in, because the MD-* paths
    assert *that* the core melts and never how fast. Injection-verified — `q_ref: 0` reddens 5
    checks and inverts the bands.
  - Declared not built: hydrogen **mass** (needs a core Zircaloy inventory this plant does not have),
    oxidation heat into the bulk core, and steam starvation. Manual set **Rev 18** — **12** §5.5
    rewritten, §13 corrected (hydrogen *generation* is modelled; the *inventory* is what is absent).

### Added
- **Failure to scram (ATWS) is a runnable checklist — and the reactor shuts down chemically**
  (#319). A trip is demanded, the rods do not go in, and the plant saves itself first: measured,
  power falls **100 % → 43.6 % in five minutes with nobody acting**, on the negative moderator
  temperature coefficient alone. That is *the* reason a pressurized-water reactor survives an
  ATWS. Boron finishes the job — **126 ppm over about 44 minutes** takes the core subcritical with
  the control rods still unavailable.
  **A claim the project carried turns out to be wrong, and this is where it was caught.** The
  pressurizer code safeties were said to be reachable by an ATWS. Measured three ways — from a
  turbine trip, with the feedwater also lost, and with the relief path isolated as well — an ATWS
  peaks at **2321 psi (16.00 MPa)** against a **2484 psi (17.13 MPa)** pop and never lifts them.
  Power collapses long before pressure can run. Corrected in the manuals and design notes.

- **Continuous rod withdrawal is a runnable checklist — and it is the clearest demonstration of
  why the new overpower protection exists** (#319). The bank starts withdrawing on its own and you
  cannot rod your way out: the plant refuses operator rod commands on the control bank while the
  runaway is active, so attempting to insert is a diagnosis rather than a fix. The OPΔT **rod
  stop** does not help either — it is an interlock on operator motion, and a runaway is not an
  operator. Only the trip stops it.
  Measured with the protection **off**, the plant holds **114.8 % power for about 17 seconds and
  never trips**, because the power-range high trip sits at 120 %. With it **on**, the approach
  alarm comes in at 6.1 s and the reactor scrams at 7.9 s at **114.6 %**. Same peak — the plant
  just stops there instead of riding it.

- **`tools/perturb_sweep.js` — "which checks break if I retune this?"** Nudges `[tune]` constants
  by 2–3 %, runs a whole suite per nudge and diffs verdicts, so the question is answered *before*
  a retune instead of by a puzzling red afterwards. Built out of #321, where a check had been green
  for the life of the project and a **3 % change to `thermal.h_sg`** — a constant it never mentions
  — flipped it.
  - **It refuses to report a bare "0 flips".** Every perturbation is scored for **discriminating
    power** first (how many observed values it moved at all); one that moves nothing is reported
    **INERT**, not as a clean bill. That guard exists because the first attempt at this sweep
    perturbed the instrument *seed* — six seeds, 241 checks, zero flips, and the result was
    worthless, since the known-defective check did not flip on noise either.
  - **`--self-test` proves the pipeline end to end** by injecting a check fragile by construction.
    A sweep that finds nothing has proved nothing until you show it could have found something.
  - Reading the output: a flip on a constant the check never **names** is a check measuring the
    wrong quantity (the #321 shape); a flip because the **band** is narrower than the nudge is a
    tight band, which is a fact about the plant. **Do not widen a sourced band to make it quiet.**
  - Lives in `tools/` deliberately — it has no stable score, so it is not a gate.

### Changed
- **The leg split stays on total core heat — the flux form is ruled out** (#315 §6 closed)
  *(OWNER RULING, 2026-08-03: "Do as you recommend.")*. No plant behaviour changed; what changed is
  that the question is settled and the reason is sourced to the primary.
  - **WTSM 12.2 (ML11223A301) decides it.** The only dynamic compensation in either real equation is
    on **Tavg** — *"the lead-lag controller for Tavg dynamic compensation"* and *"the rate-lag
    controller for Tavg dynamic compensation"*. **Nothing compensates the measured ΔT**, and the
    document carries no RTD, thermowell or transport-lag term at all: it calls loop ΔT *"a measure
    of reactor power"* and reads it directly. Putting a ~20 s fuel lag into that signal makes it a
    worse measure of core power, which is the one job the real design gives it.
  - **Measured cost.** Corrected flux form, full load rejection: the plant still rides out, but the
    OTΔT margin falls **18.4 % → 1.8 %** of rated ΔT. Not fixable by speeding the fuel node up —
    `h_fc` 0.05 → 0.10 with `heat_gen_coeff` doubled to hold 389 °C at rated gives `run_otdt`
    **21/39** and a scram at 1 s on `tavg high`.
  - **The candidate form was wrong in its own right**, and TR-7b caught it: it included pump heat,
    which is deposited *at the pump* and lifts both legs equally rather than creating a rise across
    the core (+8.9 % at t+3 min).
- **The "ML11223A301 could not be fetched" claim is retired from three sites** — `pwr_config.js`
  (×2) and `DESIGN_COMPANION` §8.23. The document has been read, and the claim was wrong on both
  halves: the τ values are **named and never valued** there (Table 12.2-1 lists both setpoints as
  *"Variable (calculated)"*, K₁–K₆ as *"manually adjusted preset"*), so they are plant Tech
  Spec / COLR numbers. The OTΔT/OPΔT dynamic-compensation departure is therefore **permanent unless
  a plant-specific source turns up**, not a pending fetch — which is a different thing to tell the
  next person.

- **The OTΔT/OPΔT turbine runback — the plant takes load off by itself** (#318) *(OWNER RULING,
  2026-08-03: "Go with your recommendation")*. When the core ΔT margin has held below the rod stop
  for **10 s**, the plant starts walking the **generator load target** down and keeps walking it
  down until the margin recovers. It does not restore load afterwards — that is the operator's.
  **Zero new player-facing rules**: no refusal message, no ceiling, no new indication. The number
  in the Generator Load box simply falls with nobody touching it, which is a thing the player has
  already seen automation do. Chosen that way after the owner asked whether it was worth adding
  something to learn that does not teach dynamics — a refusal would have taught an interface rule.
  **What it does teach is the coupling**: it never touches the reactor, it reduces LOAD, and the
  core follows through the moderator coefficient. Measured: it converts a **15 % steam line break**
  from a reactor trip at 200 s into a ride-out at ~76 MWe, and it **cannot** save a 30 % break or a
  continuous rod withdrawal — those outrun the very coupling it works through, which is why rate
  barely matters (5 %/s is no better than 2 %/s).

### Changed
- **"Fix K4" could not be done, and the measurement is why.** OPΔT's intercept looked too tight — a
  70 → 100 MW load increase came within **0.51** of the trip. But measured with the trips off, that
  normal step peaks at **109.1 %** of rated ΔT and a **15 % steam line break at 109.8 %**: they are
  indistinguishable to any ΔT setpoint. Raise K4 and OPΔT stops catching the break; lower it and the
  ramp trips. K4 is unchanged. What separates them is **duration**, so the runback carries a 10 s
  persistence delay — a declared departure, and the thing that makes the function buildable. On the
  plant's real design duty the question does not arise: the WTSM 10 % step peaks at 103.0 %.


### Added
- **Overtemperature ΔT and Overpower ΔT are LIVE** (#311) *(OWNER RULING, 2026-08-03: "Let's go
  with your recommendations for all these items", approving the flag ON once the board readout
  landed)*. Two Westinghouse core-protection trips computed from loop ΔT against a setpoint that
  **moves with Tavg and pressure** — the same ΔT is safe at one condition and a trip at another,
  which is exactly what no single-parameter trip can see. The measured gap they close: before
  OPΔT, a **30 % steam line break held the core at 114 % power for thirty minutes with no reactor
  trip**, and steam line break is one of OPΔT's own design-basis events. Neither is blockable
  (Table 12.2-1, *"No Interlocks"*).
- **A board readout for it — `bdDtMargin`**, in the NIS card corner: the binding margin and which
  trip it belongs to (`OPΔT 3.5`), turning amber at the **rod-stop** line rather than the trip
  line, because *"the plant is about to stop taking rods out"* is the part the player can still
  act on. **This is what made flipping the flag defensible** — without it the player carried two
  reactor trips and a rod-withdrawal block driven by a number appearing nowhere on the diagram, a
  `DESIGN_CRITERIA` Q3 observability failure. One readout rather than five channels: partly
  because the board is **full** (measured — extent x 540–1945 / y 110–849, with no free 150×60
  slot anywhere), but mainly because leg ΔT is already displayed and each setpoint is implied by
  its margin. A margin that moves while ΔT holds steady **is** the moving trip line.

### Changed
- **`run_m5`'s attention-stop test was re-premised, and its fixture was the plant's slowness**
  (#311). Its failure leg injected `stuck_porv_open`; with OTΔT live the plant scrams on that
  depressurization at ~8.0 s instead of ~12.5 s, so at 60× the failure and the scram land in the
  **same broadcast** and the snap correctly names the more urgent one. The check read 'scram' and
  called it a regression. It uses an **instrument** failure now — no physics effect, cannot scram
  at any speed — which isolates the failure→attention-stop path properly; the old form only ever
  worked because nothing else fired first. A new guard asserts the injected failure did not scram,
  so the fixture cannot drift back silently.
- **The #295 F1/F2 probe asserts its intent now, not a reason string.** It pinned
  `primary_pressure low`; OTΔT gets there earlier (~1.7 s) and cannot be blocked at all, so the
  probe's claim — *a reactor trip is not defeatable at power* — is strengthened. **The
  discriminator is the TIME**: the defect rode 64 s unscrammed, both healthy configurations land
  inside 10 s (4.1 s flag-off, 1.7 s flag-on), and the check passes on both.
- `board_check` **182 → 186** (four pins on the new readout, injection-verified), `run_inspect`
  gains its System Scanner copy, `run_contract` 141 → 143 and `run_reachability` 62 → 66 — both
  automatic, the new trips and alarms being picked up from the live protection tables. Manual set
  **Rev 18**.

### Fixed
- **`board_check` is in `run_all` now, because its score had been wrong twice** (2026-08-04).
  `ui/test_panel/board_check.html` had existed for months with no runner, so `run_all`'s
  auto-discovery — which globs `test/(run|verify)_*.js` — never saw it, it had no `BASELINES`
  entry, and the only record of its score was a sentence in `CLAUDE.md`. That sentence read
  **143/143 while the harness was at 1 FAILURE / 143**, and later **188/188 while it was at
  1 FAILURE / 188**: both times a pin was added without running the file, and nothing could
  contradict it. `test/verify_board_check.js` adds no checks of its own — every assertion stays
  in the HTML harness — it loads the page, waits for the harness to stamp its own title, and
  exits on the harness's own summary line. The count is data now, drift is symmetric, and CI
  runs it. Injection-verified four ways; the one that matters is that an exception thrown
  mid-harness exits **2** rather than reporting a smaller-but-green tally.
- **The board's ECCS card showed emergency suction lined up in EVERY state of the plant**
  *(OWNER, 2026-08-03: "the pipe coming out of the right of the ECCS shows flow when the ECCS is
  off or not flowing")*. The RWST → charging-pump-suction cross-tie was gated on the charging
  *pump*, which runs continuously at power, so the line animated forever. Measured at hot full
  power with `eccs_mode=off`, `hpi_flow=0`, `hpi_active=false`: **running**. It follows the ECCS
  train now — the same predicate the ECCS pump's own suction line already used — while the two
  normal CVCS suction lines keep running on charging FLOW. The reason it was the only gate on that
  pipe is worth knowing: its other endpoint is a plain box port, which carries no `data-active` at
  all, so `portActive` returns true for it unconditionally.
- **Three board geometry corrections from the owner's walk-round** (2026-08-03).
  - The **pressurizer spray stub leaned 3 px** over a 17 px run — a 10° tilt on the one segment
    the eye reads against the vessel top. The pressurizer moved down 3; the surge line and the
    PORV tap are vertical runs, so they just got 3 px longer.
  - The **condenser drop into the condensate pump was 2 px out of plumb** (1527 vs 1525). Only
    that one of the three drops was crooked — pump→polisher and polisher→feed pump were already
    plumb — and the **condenser** is what moved, not the pumps: `Pump` is a nudged kind, so pump
    flange faces snap to the 5 px grid and can never land on 1527.
  - The **core ΔT margin readout printed on top of `NUCLEAR INSTRUMENTATION (NIS)`**, overlapping
    it by 58.8 px. The card title is now `NUC INSTR (NIS)`, sized against the widest value the
    field can print (11 characters) rather than the one on screen. It survived the #311 geometry
    pins because those skip `box` and `component` kinds — a readout deliberately sits inside its
    card — and a card title is not an item, it is a child of the box, so the one element it could
    collide with was the one the ruler was told to ignore. `board_check` pins card titles now.
- **`board_check` was carrying a red the docs recorded as green** (187/188, not 188/188), for two
  reasons that were both in the harness: the LOAD TARGET checks sat *after* the RCP OFF/ON pair,
  which #314 turned into an immediate scram, and they read the snapshot without stepping, while
  `set_load_target` reaches the plant through the load-mode controller. Both fixed; the clamp check
  now asserts the emitted command, since #318's rate limit is one-sided (a load *decrease* lands at
  once, an increase crawls at 10 %/min). Now **202/202** with 14 new pins.
- **`run_pwr`'s "drifting pressure diverges" was measuring a blowdown depth, not the drift** (#321).
  A drifting pressure gauge accumulates +2.0 MPa, which pushes the *indication* past the code-safety
  setpoint; protection opens the safety on the instrument (HR1) and the plant really blows down
  15.41 → 12.19 MPa. The check compared the indication against its own value 40 s earlier, so what
  it actually asserted was how deep that blowdown went — at 22 % margin. Split into the offset it
  names (exactly **2.0000 MPa** in every variant tried) plus a **positive** assertion of the HR1
  chain it was accidentally covering. `run_pwr` **240 → 241**; each half injection-verified, and
  they discriminate independently.
- **A tripped reactor showed no hot/cold leg ΔT at all — the split was scaled by fission power**
  (#315). Heat leaving the core through the legs requires a temperature rise across them, and a
  scrammed core is still rejecting **~7 % of rated**. The split read `power_pct`, which is the
  chain reaction alone.
  - **Measured, full stack.** Three plant-minutes after a manual trip with the pumps running, the
    core was removing **6.61 % of rated heat** and the model computed a **0.0 °F** split. At
    thirty minutes, still 0.0 °F. Under a loss of forced flow it is **3.8 °F against the 44.4 °F**
    the removed heat implies.
  - **On the board it was worse than merely wrong.** With the true signal at exactly zero,
    instrument noise was all that remained: sampling the indicated legs for 25 minutes after a
    trip, the **cold leg read hotter than the hot leg in 724 of 1500 samples — 48.3 %**. After
    the fix, **0 of 1500**, mean split 3.02 °F.
  - **This is a consistency fix, not a new claim.** The fuel node and the Tavg balance already
    ran on total core heat; the split was the one line still reading flux. At rated the two are
    equal by construction, so `delta_T_rated` needs no recalibration and **at-power behaviour is
    byte-identical** — verified over 10 minutes at hot full power, every end-state field equal.
  - Not display-only: `loop_delta_t`, the protection input for the OTΔT and OPΔT trips (#311),
    is computed from the indicated legs.
  - **New behaviour probe TR-7b** — `run_behavior` 44 → 45. It computes its expectation from
    `core_heat_pct` and `pump_flow_pct` on every run, so a retune of `delta_T_rated`, of the decay
    fractions or of `flow_floor` moves the band with the plant. Injection-verified: 5 checks red
    on the old form, and the two control checks (at-power calibration, the flow floor) stay green
    by design.
  - The second consumer named in the issue — the condenser backpressure load fraction — was
    measured and **is not a defect**: the load term enters as a difference of two saturation
    pressures at the same offset and nearly cancels, so the worst realistic effect is
    **0.23 kPa** against a 3.39 kPa display digit. Left alone.
  - **12** §5.2 said "scaled by power/flow" and now says what that means, with the post-trip
    numbers. Manual set **Rev 15**.

### Added
- **The turbine trip is a runnable checklist — and it is where you watch the steam dump reach its
  stop** (#319). PWR-E03 completes the pair with the post-trip response: E03 is the procedure that
  sends you there. Above 50 % power a turbine trip scrams the reactor automatically, so the
  operator confirms rather than causes it, and then watches the dump take all the heat the turbine
  is no longer taking. Measured, it **saturates at 40.00 % — its entire capacity — about half a
  minute after the trip** and holds there before backing off as decay heat falls. Steam generator
  level swells 65 → 72 % before settling near 36 %, and the plant stabilizes hot and subcritical
  at 567.5 °F (297.5 °C). The checklist also carries the two warnings the procedure leads with:
  do not plan to ride out a turbine trip at power, and a planned offline is not a turbine trip.

- **The steam generator tube rupture is a runnable checklist — and the manual now says what the
  steam generator actually does, which is nothing** (#319, #322). PWR-E06 told you to identify the
  leak from "rising SG level on the affected generator". Measured, level does not move: with the
  leak running and feed, auxiliary feed and steam flow all at zero, it held **67.98 % constant for
  four minutes**. Closing the main steam isolation valve changes the secondary pressure trend by
  **0.4 %**. Both are declared departures now, and the reason is scope rather than fidelity — this
  trainer models **one** steam generator, so the lesson that cue exists to teach on a real plant
  (*which* generator is leaking) cannot exist here at any fidelity.
  The checklist teaches what the plant does give you: diagnose on the **primary** side, then
  **depressurize toward secondary pressure** — the leak is driven by the pressure difference, so
  closing that difference throttles it. Measured, dropping the pressure setpoint cut break flow
  **0.0055 → 0.0021**, a 62 % reduction, with subcooling still positive. Manual set to Rev 19.

- **The everyday leak is a runnable checklist now — the one abnormal procedure where nothing
  breaks** (#319). `pwr_seal_leak` (PWR-E23): a reactor coolant pump seal leak that charging makes
  up indefinitely. No trip, no safety injection, no loss of subcooling — the plant just sits there
  losing coolant to containment for as long as you let it. The whole lesson is reading the board
  rather than reacting to it: **CHARGING FLOW is the cue**, and the alarms you would expect stay
  silent. Measured, the pressurizer level alarm never comes in — it is set at 25 % and a held leak
  parks level near **54 %** — so waiting for a level alarm means waiting all shift.
  `rcp_seal_leak` had **no test coverage of any kind** before this, despite the manual documenting
  its symptoms in detail. Every one of those claims was measured for the authoring and every one
  held: charging 0 → 0.042 against letdown 0.030, level flat at 53.8 %, subcooling unchanged at
  73.8 °F (41.0 °C), and `CHG FLOW HI` the only alarm that ever activates.

- **The post-trip response is a runnable checklist now — and building it found the step the
  procedure was missing** (#319). A reactor trip is the most common significant event on a plant,
  and recovering from one was not an authored evolution: **PWR-T06** was documented, and **PWR-E03**
  (turbine trip) explicitly sends the operator to it, but there was no checklist at the other end of
  that pointer. `pwr_post_trip` is that checklist — confirm the trip, reset the protection system,
  verify the turbine is off the grid and the heat sink is established, and stabilize hot and
  subcritical in Mode 3, Hot Standby.
  **It is also the first content anywhere to name the RPS reset.** `reset_rps` has been on the board
  since the SCRAM control became dual-mode, is required after *every* scram, and was named by no
  procedure, mission or checklist — one of three orphaned operator capabilities the #319 audit found.
  The written procedure went straight from "verify SCRAM" to "verify turbine disconnected"; it now
  carries the reset, and the warning that **main feedwater isolates on the trip and cannot be
  restored from the board**, so AFW is the heat sink from that point.
  Measured full stack from `hot_full_power`: the reset is refused `RODS_NOT_INSERTED` at t+1 s with
  power still 33 %, and accepted at t+3 s once the rods seat; Mode 3 inside a minute; AFW holds SG
  level near 37 % after it falls from 65 %; the plant settles at 567.3 °F (297.4 °C) and 2235 psi
  (15.41 MPa). Manual set to Rev 18.

- **The RCP breaker-position reactor trip — a protection function that reads a CONTACT, not a
  measurement** (#314) *(OWNER RULING, 2026-08-03: "Build the breaker position trip as you
  recommend.")*. This plant had **one** loss-of-flow reactor trip where a real Westinghouse unit
  has **four** (WTSM 12.2 §12.2.3.12, ML11223A301): low loop flow, breaker position, RCP bus
  under-voltage, RCP bus under-frequency. The one we had reads a single elbow-tap channel, so a
  stuck transmitter defeated it completely. Measured on the `pwr_lof` casualty — pump tripped with
  its flow channel stuck at 100 %: the reactor used to ride **58.5 s** to a *high-pressure* trip
  with peak core void **0.628** and fuel at 1713 °F (934 °C); it now trips at **23.0 s — one second
  after the pump** — on the breaker contact, peak core void **0.000**, fuel unchanged. Blocked
  below **P-7** on the same permissive as the low-flow trip (sourced: *"All the reactor coolant low
  flow trips are automatically blocked below the P-7 setpoint (10% power)"*), so Mode 5 with the
  pumps secured carries no standing trip — verified across all three initial conditions and the
  full load rejection, none of which move.
- **`is_false` now works for trips and actuations, and its absence was silent** (#314). The kernel
  carried **two comparators with different vocabularies**: `_alarmRaw` has understood
  `is_false`/`is_open` since alarms existed, while `crossed()` — which trips and actuations use —
  knew only `high`/`low`/`is_true` and fell through to `return false`. Any trip authored with
  `is_false` was therefore a **complete no-op with no throw, no warning and a green gate**. Found
  because the new breaker trip was inert on its first run: the plant rode the entire 36-second
  loss-of-flow casualty to peak void 0.628 with the trip installed and doing nothing. `ui/app.js`
  already listed `is_false: 'goes false'` in its player-facing setpoint vocabulary, so the UI was
  describing a capability the trip path did not have.

### Changed
- **`pwr_lof` re-authored — it lost its branch, and this is the THIRD time its premise has been
  invalidated by fidelity work** (#314). The decision window went from ~36 s to ~1 s, so the
  mission is a demonstration now rather than a choice. The lesson is better for it and it is a
  *coupling* rather than a deception: the gauge still lies, the trip assigned to this casualty
  still never fires, and the reactor trips anyway — because protection is built from **diverse
  signals**, four physical quantities, so no single failure removes the function. Flagged in the
  file: three re-premisings is a reasonable argument for retiring the mission rather than doing a
  fourth, and that is the owner's call. Its campaign check was re-authored to assert the new
  mechanism and **injection-verified against the pre-fix plant** — restoring the old comparator
  reddens exactly the two discriminating checks (trip reason, and core void, which the old test
  *required* to exceed 0.02 and the new one requires to stay under 0.01).
- Manual set **Rev 13 → 14**: `09` gains the trip; **`12` §10.7 rewritten**, because its measured
  blockquote described behaviour the plant no longer has. Its point moves too — the fix was **not
  more channels but a different kind of signal**. `DESIGN_COMPANION` **§8.24** declares the two
  unmodelled RCP **bus** trips: this plant has no RCP electrical bus, so building them would mean
  inventing the signal, and the 1-out-of-1 coincidence (against the real 2-of-4) is declared in the
  same row — the real rule means *half the pumps are gone*, and this plant has one RCP.
- **HR1 stays a Hard Rule, and now says which half of the question it answers** *(OWNER RULING,
  2026-08-03: "Apply the hr1 seam/roster sentence. Change design criteria as you suggest.")*.
  Added to `CONTEXT.md` §3: **HR1 governs the SEAM, not the ROSTER** — which quantities have
  instruments, their lag/noise/failure characteristics, and how many channels a trip votes are
  **plant design**, decided by `DESIGN_CRITERIA.md`'s four questions, and **a missing instrument
  is a design gap to be filed, never an HR1 exception.** It kept its place on §3's own admission
  test — *"can this be violated silently?"* — which it passes on measured history: #220
  (`above_p9` deciding three protection functions off true state with **all 34 runners green**),
  #247 (the low-flow trip reading true pump flow for two years) and #289 (a new `defaultOn`
  channel caught by the gate on 2026-08-01). The split exists because #247 was filed as *"the one
  documented HR1 exception"* and was not one — it was an instrument nobody had built, and the
  exception mechanism made a plant-design omission look settled.
- **`DESIGN_CRITERIA` §6.3's healthy-channel claim is measured now, and it was overstated.** It
  read *"a healthy channel's lag … changes what the operator sees during **every** transient in
  Tier A"*. Measured full stack, seed 42, nothing failed: the shift belongs to the **channel**, not
  the transient. `tavg` (lag 4.0 s) puts the gauge **4.00 s behind the plant during A1 itself** —
  the slowest case measured — while `power_range` (0.1 s) stays within a sample through a **scram**
  and `primary_pressure` (0.5 s) through a **20 % LOCA crossing the 1800 psi reactor trip**. The
  fast casualties show no timing shift at all. *Value* divergence is the effect that does track
  transient speed (that LOCA reaches 414 psi and 25.6 °F). Replaced with the table.
- **The simulator's stated premise is PLANT DYNAMICS, and eleven documents said otherwise**
  *(OWNER DIRECTIVE, 2026-08-03: "THR STATED PREMIS IS NOT INSTRUMENT VS TRUTH THE PREMIS IS TO
  TEACH PLANT DYNAMICS!!! We must purge the idea of the instruments vs truth premise from all
  documents.")*. `DESIGN_CRITERIA.md` §6 had already ruled it the day before — dynamics is Tier A,
  procedure is a second goal, and instrument deception is explicitly **not** a Tier A objective —
  but the older framing was still standing in the files that agents and players actually read.
  Purged from: `CLAUDE.md` (*"the dissonance is the lesson"*), `CONTEXT.md` §"what it must feel
  like", `DESIGN_COMPANION.md` ×3 (including *"why instruments-vs-truth is **the keystone** … the
  one rule whose violation makes the whole product pointless"*, which inverts the two),
  `M6_instructor.md`, the `M8` HMI spec, `Manuals/README.md`, `Manuals/ISSUES_AND_FINDINGS.md`
  I-17, and `PWR_CURRICULUM_REDESIGN.md`, whose §5.4 proposed an entire new campaign act
  (*"The Instruments Lie"*) as *"the one most aligned with what the project is for"* — now marked
  **RULED AGAINST**, with its failure lessons redirected into Act V.
- **Three player-facing surfaces changed with it**, which is the half that matters. The TMI-2
  Part 2 briefing opened *"One rule runs this whole simulator, and tonight is its showcase"*; it
  now names the couplings that catch the lie (P–T, level–Tavg, subcooling) and says the
  relationships are what tell the truth. The Help panel's instrument section is now preceded by
  **"Watch what moves together"**, which states the Tier A couplings outright. And the Failures
  tab's Advanced-instrument-failure copy claimed *"every serious accident in this simulator turns
  on an operator believing an instrument"* — **false on its own terms**, since `CONTEXT.md`
  describes Chernobyl as an accident of *design* and Fukushima as one of *sustained support*.
- **HR1 IS UNCHANGED AND STAYS EXACTLY AS IT IS.** Gauges, alarms and automatic protection still
  read instrumented values; true state is still a diagnostic overlay only; a failed channel still
  misleads every layer above it, and nothing was softened. `DESIGN_CRITERIA.md` §6.3 says so
  itself: protection reading instruments is what makes the failure scenarios possible at all, and
  **a healthy channel's lag is itself part of the dynamics**. What was retired is the *framing*
  that made deception the point — the ordering fact behind the ruling being that you cannot
  perceive a lying instrument without already knowing what the plant should be doing.
- Manual set **Rev 12 → 13** (`Manuals/README.md` only; no setpoint, procedure, limit or number
  moved anywhere in the set). Its stray duplicate `**Date:** 2026-07-30` header line — stale, and
  invisible to `run_manual_rev` because the check reads the first match — was removed in passing.

### Added

- **Physics tab — the true plant state, behind the instruments** *(OWNER DIRECTIVE, 2026-08-03:
  "Add a tab to the tools block called Physics. This will show the most important, under the hood
  physics numbers. Group and order them logically.")*. A fifth tab in
  the Tools block (**Operate · Inject Failure · Graph · Physics · Settings**) showing what the
  simulator is actually computing: no lag, no noise, and a failed sensor does not move a figure
  on it. It is an engineering display, not a second board — nothing there alarms and nothing
  there is what protection reads.
  - **What earns a row is what the board cannot show.** Chosen against the board's own reads:
    fuel and clad temperature, decay heat, xenon, both void fractions, RCS inventory, the
    three-node loop pressure split, suction subcooling, RCP cavitation, leak flow and cycle
    efficiency have no board readout at all. 24 rows in five groups, ordered along the energy
    path — **Reactivity · Core heat · Primary coolant · Loop pressure · Heat sink & output**.
  - **Building it found a real seam: `power_pct` is FISSION power alone.** Measured a few
    seconds into a 20 %-of-rated cold-leg LOCA, it reads **11.0 MWt while decay heat is
    21.0 MWt** — a core apparently making less heat than its own decay tail. At steady power the
    two are equal by construction, so nothing had ever noticed; after a scram, fission falls
    straight through the decay floor while the core still makes ~7 % of rated. The quantity every
    thermal path actually burns is the engine's `_Q_total`, and it was never published.
    **New `true_state.core_heat_pct`** (31.2 MWt in that same sample) — documented in
    `CONTEXT.md` §6.3, so `run_contract` guards it, and the tab reads it rather than keeping a
    second copy of the formula. Fission, decay and total are three separate rows.
  - **Two display defects the measurement caught and the eye would not.** `toFixed(0)` on MPa
    collapsed the entire loop-pressure split — 2235 / 2279 / 2199 psi all printed as "15 MPa",
    when that ~80 psi (0.55 MPa) spread is the one thing the group exists to show (it is
    2 decimals in SI now, the #238 quantisation trap in a new place). And a critical reactor
    printed **"-0 pcm"**, which reads as slightly subcritical and means exactly on.
  - Values are marked in colour only for states that should read exactly zero on a healthy plant
    (voiding, cavitation, leak flow) or that cross a threshold the engine itself uses (clad
    against `fuel_damage_c`, subcooling against saturation). Units follow **Settings → Units**.
    RBMK and BWR have no panel authored — the tab says so rather than showing an empty box.
  - Documented in **02** §7.5 (Settings renumbered to §7.6), with a note in §6.0 disambiguating
    the board's **Physics Overlay** display mode from this tab. Manual set **Rev 14**.

### Changed
- **The manual's turbine-roll scope note was wrong about the real plant, and the overspeed trip
  is documented as unreachable** (#307 — deferred, not built) *(OWNER RULING, 2026-08-03: "Let's
  go with your recommendation and defer it.")*. Turbine roll and a no-load speed hold stay
  **out of scope**; what changed is the honesty around them.
  - **PWR-N05's scope note** described a real synchronization as *"matches speed and phase at the
    synchroscope — four operator actions"*. On an EHC machine the operator instead selects a
    **speed setpoint** (Close Valves / 100 / 800 / 1500 / **1800 RPM** / Overspeed Test) and an
    **acceleration rate** — the SLOW rate takes about **30 minutes** to reach 1800 rpm — and the
    EHC holds no-load speed automatically, synchronizes (optionally automatically), and shifts to
    load control on its own once the breaker closes. The note now says that, and points out the
    real operator's job is much closer to this board's **Pressure SP** / **Dump SP** boxes than to
    a synchroscope.
  - **The 1980 RPM overspeed trip cannot fire on this plant** and three places said it could
    (**09** setpoint table, **03** §12.1 and §12.4, the instrument table). Measured peak: 1800 RPM
    synchronized in Follow, 1800 in Manual against a 2×-rated demand, 1799 with the MSIVs shut.
    New **12** §12.14 carries the departure; **12** §9.0 and §13.0 say plainly that shaft speed is
    never an independent variable here.
  - **12** §9.0 also documented the **pre-#284** electrical-output formula (core power rather than
    turbine steam admission) — corrected, with the case where the two diverge.
  - Manual set **Rev 13**.

### Added
- **`run_reachability` B3 — the turbine overspeed fence** (#307). The suite's first *inverted*
  case: it asserts the 1980 RPM trip **cannot** be reached, because there is no roll model, and is
  written to go **red when the plant gets better** so that building the roll forces the declared
  departure to be retired rather than silently absorbed. Part A was already happy (1980 sits
  inside the instrument's [0, 2000] range), which is exactly the hollow-assertion shape this
  runner exists to catch. 59 → **62 checks**.
- **Overtemperature ΔT and Overpower ΔT — the two Westinghouse reactor trips this plant did not
  have** (#311, ruled 2026-08-02, built 2026-08-03). Both are computed from loop ΔT with Tavg and
  pressure compensation, so they trip on *combinations* no single gauge sees: OTΔT is the DNB
  protection, OPΔT the linear-heat-rate protection. Built in the **reduced form the owner ruled**
  — no axial-offset term, because a one-node core cannot produce an honest axial offset and
  synthesizing one would be a fabricated instrument. Five new derived gauges (loop ΔT, both trip
  lines, both margins), two rod stops at the sourced 3 % offset that refuse **withdrawal only**,
  and two annunciators that light at the rod stop rather than at the breakers.
  **They ship DEFAULT OFF**, and turning them on is the owner's call: the setpoint equations
  could not be sourced in the session that built them (NRC document access is blocked from that
  environment), so the two margin intercepts are fitted to this plant's own measured behaviour
  rather than taken from the document. Fitted is defensible; sourced it is not.
  New gate `run_otdt.js`, 39 checks, injection-verified four ways.
- **The Mode 3 → Mode 5 cooldown is a runnable checklist now — and building it found a step the
  written procedure was missing** (#310). PWR-N15 was one of 48 documented procedures with no
  executable form, and the one worth doing next because #303 had just published a *measured*
  performance table for it that nothing reproduced. `pwr_cooldown` is that table's source now:
  the live walkthrough on the board, and a full-stack replay under `run_procedures_stack`
  (23/23, **204 checks**), so every milestone in `Manuals/04` PWR-N15 is re-derived on each gate
  run instead of transcribed from a throwaway rig.

  **The finding: blocking SI is not enough.** Two entries in the trip table watch reactor coolant
  pressure downward — the **low-pressure reactor trip** at 1800 psi (12.41 MPa) and the **reactor
  trip on safety injection** at the 1798 psi (12.4 MPa) SI setpoint — and taking HPI/LPI to OFF
  blocks neither. Measured, the plant scrams about five plant-minutes into the first cooling leg
  with *either* one left armed; the resulting turbine trip then drives the steam dump into its
  Tavg-error mode and the cooldown runs away at −550.8 °F/hr (−306 °C/hr). Neither block is even
  available until pressure is inside the P-11 permissive, so the checklist lowers the Pressure SP
  first. New steps in PWR-N15 (1b/1c/1d) and PWR-T21 (C1a).

  **A checklist step had to learn to RAMP.** The obvious build — a handful of discrete Dump SP
  steps with holds — measures badly here: the dump's proportional band is 36 psi (0.25 MPa)
  against a 40 % capacity and the primary trails the secondary by about 37 s, so a step of ΔT
  bursts at roughly ΔT/τ. An 18 °F (10 °C) step peaks at **−1168.2 °F/hr (−649 °C/hr)** and a
  whole 46.8 °F (26 °C) leg at **−2178 °F/hr (−1210 °C/hr)**; holding the −90 °F/hr programme
  with steps needs them under 1.4 °F, about 250 of them. Procedure steps can now carry
  `ramp: [{action, arg, points}]` — a setpoint walked along an authored polyline across the
  step's hold. It costs the UI **nothing**: the live checklist never issued `cmd` in the first
  place (it renders text and highlights and grades off `acc`), so this is replay-side only, in
  the two procedure gates.

  Measured on the finished checklist: −85 to −100 °F/hr through the four secondary-led legs,
  accumulators isolated at 1000 psi at 2.04 plant-h, RHR permissive at 3.16 h, Mode 4 at 3.49 h,
  **Mode 5 at 4.89 h**, arriving on the `cold_shutdown` initial condition with the accumulators
  100 % full and isolated and boron at 857 ppm. Verified by injection, seven ways — remove either
  trip block, the SI block, the accumulator isolation, the boration or the RHR heat-exchanger
  throttle, or flatten the ramps back into steps, and the gate reddens each time.

### Changed
- **Automatic rod control follows load changes the way the real one does** (#306) *(OWNER,
  2026-08-02: selected "washout the trim" from four options put to him)*. The rod controller's
  power-mismatch term was PROPORTIONAL to the standing steam-vs-nuclear mismatch; the real one is
  a **rate comparator**, and WTSM 8.1.4.2 (ML11223A252) states why — it *"prevents the power
  mismatch circuit from responding to steady state calibration differences between nuclear and
  turbine power."* Ours could grow until it cancelled the temperature error outright: measured
  mid-ramp, the two terms were −4.64 and +4.41 and the channel commanded **zero rod steps with
  Tavg 8.6 °F off program**.
  - **A 5 %/min load ramp now holds Tavg within 4.77 °F of program, against 12.55 °F before** —
    inside the ±5 °F the real system is specified to. The 10 % step is unchanged at ~6.3 °F.
  - The gain is untouched, so a step change still produces the same push and every scenario tuned
    around it behaves as before. Only the standing component is removed.
  - Steady state is unchanged in substance: a 2 h soak settles 0.72 °F off program, well inside
    the real ±1.5 °F deadband — and the rods actually **hunt less** than before (17 vs 34 fine
    steps an hour at a settled part load).

### Fixed
- **Automatic boron trim could stop working without saying so** (#306). The channel sent its
  borate/dilute command once, when it changed mode, and never again — so anything that touched
  the boron makeup rate afterwards cancelled it silently while the panel still read "dilute…".
  Measured: one operator stop command left the plant sitting for 40 minutes with the channel
  claiming to be diluting and nothing happening. It now re-asserts its output whenever the plant
  no longer holds it.
- **…and once it worked, it was far too fast.** At the shipped 0.5 ppm/s the trim channel drove
  the plant to a **reactor trip**; the rate is now 0.05 ppm/s, the makeup rate the rest of the
  plant already uses. Both faults were hidden behind the rod-control change above: the old
  controller quietly recovered the rods off a 4.8 % power overshoot, so the trim channel appeared
  to be doing a job it had actually stopped doing.

### Added
- **A warning before the rod insertion limit, and a standing BLOCKED indication** (#306). A real
  board carries **two** insertion-limit annunciators and we shipped one, so the first notice a
  player got was the stop itself. WTSM 8.4 (ML11223A256): *"Rod Limit Low setpoint = RIL + 10
  steps"*, *"Rod Limit Low-Low setpoint = RIL"* — and the Lo-Lo is not merely a deeper warning,
  it is the tech-spec violation (*"the technical specification limit for rod insertion has been
  violated"*).
  - **`ROD LIMIT LO`** — new alarm on a new `rod_limit_margin` instrument (control-bank steps
    remaining above the limit). The setpoint is **40 fine steps, which IS the real 10**: this
    drive is 912 fine steps to a real bank's 228. It reads full travel — not zero — whenever the
    limit does not apply, so it stays silent through a startup where the bank is deliberately
    deep. That nuisance is exactly what #202 removed by making the limit power-dependent, and a
    margin signal that reintroduced it would have undone that fix.
  - **`ROD INS LIMIT` is now labelled `ROD LIMIT LO-LO`**, so the pair reads as a pair.
  - **`BLOCKED`** on the rod status word, when a rod stop is standing. This needed the kernel to
    **publish interlock state** (`snapshot.interlocks`, and `isCommandBlocked()`): `interlockActive`
    was internal, so a surface could learn about a block only by issuing a command and reading
    the refusal — a withdrawal block was invisible until you tried to withdraw. Deriving it
    board-side was rejected as a second copy of a latched, hysteretic condition, which is the
    #294/#303 defect shape.

  `run_m4` **34 → 36**, `board_check` **179 → 182**, all injection-verified: three defects
  injected (LO band 40 → 10, margin 0 instead of full travel when the limit is off, publish the
  raw comparison instead of the latch) reddened their targets — and the margin one also tripped
  four pre-existing alarm-census checks, which is the new alarm being properly counted.

- **The board now shows what automatic rod control is DOING, not just that it is on** (#306).
  With rod control in AUTO the only evidence that anything was happening was the step count
  ticking — the ROD AUTO lamp said the channel was engaged, and nothing said what it was up
  to. Three indications, all of them things a real Westinghouse board carries (*"Rod speed
  indication and the IN-OUT lights"*, WTSM 8.1 §8.1.7.1, ML11223A252):
  - **IN-OUT lamps.** WITHDRAW and INSERT light yellow while the bank is actually being driven
    that way — by an operator hold, a tap, or the rod channel. That is the real lamps'
    definition, verbatim: *"In-and-out lamps on the control board indicate that rod motion has
    been requested by either the IN-HOLD-OUT switch **or the reactor control unit**."* A
    **scram leaves them dark**, deliberately: the rods fall on gravity with the drive
    de-energized, and a lit IN lamp would say the drive is running when it has just been
    dropped.
  - **Rod speed indication.** SLOW/MED/FAST was a selector only, so it showed the operator's
    choice while AUTO drove at its own — actively misleading, not merely absent. It is both
    now: green is what you selected, yellow is what the drive is doing this instant. Measured
    through a 45 % load drop, the yellow steps **FAST → MED → SLOW** as the temperature error
    closes, which is the channel's error ladder made visible.
  - **A ROD status word** in the card corner — `HOLDING / IN / OUT / AT LIMIT / MANUAL /
    TRIPPED` — the at-a-glance version of a note the board previously surfaced only on
    inspection. **AT LIMIT outranks motion**: the bank can sit on its insertion limit and
    withdraw at the same time, and the limit is the fact that says the controller has run out
    of room in the direction it normally corrects.

  **The bottom of the card is evenly spaced now** *(OWNER, 2026-08-02: "Can you adjust the speed
  buttons down so they have equal spacing above and below?", then "Shift the rod auto and trip
  blocks down slightly to give equal spacing above and below them.")*. The two asks interact and
  had to be solved together — centring SLOW/MED/FAST alone puts it at top 400, and centring ROD
  AUTO alone puts it at 427.5, which re-opens the speed row's lower gap and un-centres what the
  first move just centred. Measured as authored: the speed row sat **flush against INSERT (0 px
  above, 10 below)** and straddled the CONTROL/SHUTDOWN sub-boxes, half in and half out. The
  three gaps are **7 / 6 / 7** now (20 free px over three gaps will not divide evenly, so the
  outer two match and the middle is a pixel tighter).

  The **REACTOR/ROD CONTROL card is titled ROD CONTROL** to make the room, the same trade #214
  made on the SG FEED card. Measured, not estimated — and the estimate was wrong twice: the
  authored title renders 161 px in a 195 px card, and an rAnchor item's right edge sits 41 px
  inside its authored `left`, so even the intermediate 'REACTOR CONTROL' left the widest word
  ('AT LIMIT', 61 px) overlapping by 14 px, with both still rendering so nothing else would
  have caught it. `board_check` **168 → 178**, including a pin on the title patch; all of them
  verified by injection — three defects injected, three reds, one each.

### Changed
- **HR12 now covers control behaviour, and half of it is gated** *(OWNER RULING, 2026-08-01:
  "go with your recommendation.", on the recommendation to widen HR12 by one clause and add one
  narrow check rather than write an eleventh Hard Rule)*. Three times in two days a chapter
  asserted control behaviour that `Manuals/03` — the control inventory, which owns it — already
  had right: #303's *"selecting a load mode does not close the breaker"* (there is no breaker;
  `isOnLine()` is `load_mode !== 'disconnected'`), #304's *"shutdown bank … read-only to
  operator"* (it has Withdraw / Insert on the board and 03 §3.3 documents the full stroke), and
  #304's *"Follow (default)"* (the shipped lineup is MANUAL).

  **The diagnosis is what set the fix.** None of those was a skipped verification step — they
  were claims never *classified* as needing verification, because **HR12 read "an assertion about
  plant dynamics"** and its examples are all dynamics. A control-semantics claim felt like recall.
  So the rule's SCOPE was the hole, not compliance with it: HR12 is now *"about plant dynamics
  **or control behaviour**"*, which keeps the binding count at ten and respects the 2026-07-27
  ruling that this repo already has too many instructions. **Adding an eleventh rule was
  considered and rejected on evidence** — roughly eight "verify this" instructions were already
  loaded in context when #303 shipped, including HR12, HR10 and CLAUDE.md's own *"Verify a claim
  before you act on it"*.

  **`run_manual_controls.js` gains an inoperable-claim scan**: a manual may not call a named
  board control read-only / not operable / display-only while `pwr_board_wiring.js` gives it a
  press or hold handler. New `PwrBoardDriver.pressableIds()` reports the ~47 worked items
  (entries carrying only `active`/`warn`/`badge` are indication, not controls), and
  `PwrBoardInspect.parentOf` walks a button up to the card its label points at.

  **Three things learned building it, two of them only because it was injection-tested.**
  (1) **The first cut stayed GREEN on the real #304 text.** `CONTROL_LABEL_MAP` holds
  `Shutdown Bank`; the manual writes `Shutdown bank`; the match was case-sensitive. Reading the
  check would never have shown that — re-injecting the defect did.
  (2) **Case-insensitivity then produced a false positive**, and the fix is principled rather
  than a denylist: the map deliberately points several names at one card (`Mode`, `Load`,
  `Turbine Load`, `Main Breaker` are all the generator card) and the one-word ones are ordinary
  English here — matching `Mode` fires on *"Training display only; does not change plant MODE"*.
  A single-word label is now skipped **when a longer label shares its card**, which keeps
  `Turbine Load` and `Shutdown Bank`, drops `Mode`/`Load`/`Boron`/`Nudge`/`NIS`/`HPI`, keeps
  unambiguous singletons like `MSIV` and `SCRAM`, and is self-maintaining. 25 of 52 labels
  scanned. (3) The check's own local `D` **shadowed the dim-colour constant**, so its header
  printed a driver object.

  **Scope is deliberately narrow, and the limit is written into HR12 rather than left implied:**
  only the NEGATIVE claim is decidable. *"This control cannot be operated"* checks against the
  wiring; *"this control does X"* does not — #303's invented breaker would still get past it.
  Injection-verified both ways: the real #304 line fails exactly one check and nothing else;
  restored, 94/94.

  Gates: all **35 runners at baseline**, `board_check` **168/168** unchanged.

### Fixed
- **Reactor trips could be switched off at full power.** The TRIP BLOCKS panel accepted a block on
  any blockable trip as long as that trip was not *already* tripping — which meant the low-pressure
  reactor trip, the trip on safety injection and the low-flow trip could all be blocked at 100 %
  power, and the block then survived every regime change. Measured on a 20 % cold-leg LOCA, that
  cost **64 seconds of unscrammed blowdown** (the plant finally tripped at 68.1 s on high
  pressurizer level at 130 psi (0.90 MPa), where a correct plant trips at 4.2 s on low pressure at
  1782 psi (12.28 MPa)). A block is an **enable**, not a switch: it is now accepted only while the
  plant is inside that trip's permissive — above P-10 for the two startup trips, below P-11
  (1972 psi / 13.6 MPa) for the pressure trips — and every block reinstates itself when its
  permissive drops, including one you set by hand. **Nothing in the startup or cooldown checklists
  changes**: both already put you inside the permissive before they ask you to block, and both
  already described the plant this way. Found by the first slice of the independent audit
  programme (#295 F1/F2, #221).
- **Turbine art froze on trip while the RPM readout coasted.** Blade/winding scroll is driven by
  `turbine_rpm` (not steam demand alone), so a trip or generator OFF shows the ~40 s coastdown
  instead of stopping the frame instantly. Steam fill/ports still track admission.

### Changed
- **Instructor minimize + right-column chrome tidy.** Explicit **−** minimize on the instructor
  header (top-right of the title row); Checklists picker moved from under the instructor card into
  **Operate**; **Contact** moved under Settings → About (duplicate "About" row label removed).

### Fixed
- **01's numbers were all right and five of its control claims were wrong** (#304, review of
  `Manuals/01_GENERAL_DESCRIPTION.md`; manual set **Rev 9 → Rev 10**). Measured full stack, every
  row of the §2.0 parameter table lands — 100.0 MWe, 2235 psi (15.41 MPa), Tavg 579.3 °F
  (304.1 °C), hot/cold leg **609.0 / 549.6 °F (320.6 / 287.6 °C)** with ΔT exactly **59.4 °F
  (33 °C)**, PZR 55.00 %, SG 65.00 %, steam **819.5 psi (5.65 MPa)**, subcooling 73.75 °F
  (40.97 °C) — as do both ratings, the ~7 % decay heat and the no-natural-circulation claim.
  `PWR-X01` resolves too (it is defined in **08** §6.0, not in 04's N/T/E index).

  **Every defect was a control-surface claim that `03` already documented correctly**, which is
  the same failure as #303's N05 caution and makes three in two days. (1) §4.1 called the
  **shutdown bank "read-only to operator"** and SCRAM-only. It is a full operator control —
  Withdraw / Insert on the board (`pwr_board_wiring.js:438-439`), the `Shutdown Bank` control
  label, a `SHUTDOWN_DRIVE` group in `ui/app.js` — and **03** §3.3 describes its full-stroke
  behaviour and cautions against parking it in at power. **PWR-N02 step 7** asks the operator to
  confirm its position precisely because it can be moved. (2) §6.0 called **Follow the default**
  load mode; measured, `getStartupLineup` puts `hot_full_power` and `50_percent` in **MANUAL**,
  which is what 03 §12.1 and the startup checklist both say the board hands you. Follow is the
  bare-engine fallback. (3) §6.0's **coupled-feedwater** rows describe a state that lasts under
  three plant-minutes — measured, `feed_auto_coupled` is true at t=0 and false by 3 min, because
  the three-element `feed_sg` channel is `defaultOn` and takes SG level as soon as it acts. That
  is the engine-direct-vs-full-stack trap appearing in the manual rather than in a test.
  (4) §5.0 defined **Mode 3 as "RCS hot at NOP T/P"** when the trainer decides Modes 3/4/5 by
  **temperature alone**; the table now carries the real boundaries — **199.4 °F (93 °C)** and
  **350.6 °F (177 °C)** — with a note that pressure is not part of the definition. (5) §5.0's
  Mode 1 row omitted **`5_percent`**, which measures Mode 1 at 6.00 %.

  Also tightened: §4.3 described the **steam dump** as load-rejection-only, omitting the
  continuous AUTO pressure mode that heatup, cooldown and hot standby all run on; §6.0's
  Disconnected row conflated a **planned offline with a turbine trip** (#230 — two events, one
  lamp); and §8.0's *"the simulation ends at fuel damage"* now says what actually ends there —
  **consequences**, not the model, which simulates cladding failure at 2192 °F (1200 °C) and melt
  at 5072 °F (2800 °C) across ten green meltdown paths.

  Gates: all **35 runners at baseline**; `run_manual_units` 0 failed, `run_manual_rev` 13/13 at
  Rev 10, `run_procdocs` 23/23, `run_manual_controls` 94/94.

### Fixed
- **The documented startup path did not join up — PWR-N01 hands PWR-N03 a plant it cannot
  start** (#303, review of `Manuals/04`; manual set **Rev 8 → Rev 9**). The pump-heat heatup
  arrives at **856.8 ppm** and nothing in the path dilutes, but PWR-N02 and PWR-N03 both
  assumed **~683 ppm** — which is the *shortcut* `hot_zero_power` lineup, not the heatup's own
  arrival. **Measured full stack:** from the N01 end state the control bank reaches 456 steps
  still at ρ = −794 pcm and goes critical near **561 steps**, against the **319** N03 states —
  **242 steps / ~1830 pcm outside** the ±750 pcm acceptance band 09 §7.5.1 tells you to stop
  and re-work the estimate at. Nothing caught it because the two legs are only ever exercised
  separately: `pwr_heatup` starts cold and `pwr_startup` starts at `hot_zero_power`, so no
  gate has ever crossed the seam.

  **The fix is a dilution step, not a moved initial condition** *(OWNER DIRECTIVE, 2026-08-01:
  "Add the dilute step in n02", refined moments later to "In n02/n03.")*. New **PWR-N02 step
  15** works the ECC and adjusts boron to it — measured, 857 → 683 ppm takes ~58 plant-minutes
  at the ~3 ppm/min make-up rate and lands ρ = −1006 pcm; the bank at 319 steps then reads
  **ρ = −2.3 pcm**, critical on the reference position. Moving the boron the other way, at the
  end of the heatup, would have been less writing and would have taught a **cold dilution** —
  the one thing 09 §7.5.1 spends a WARNING forbidding, since critical boron with the bank in is
  806 ppm cold against 588 ppm hot. N02 step 8 now *samples and records* boron as the ECC input
  instead of asserting a figure, and N03's 683 ppm / 319 step / 1/M burst sizes are labelled
  **the worked example for one boron**.

  **Five more defects in the same chapter, all measured.** (1) **N01 aligned the SI
  accumulators after the LCO deadline it cites** — step 7 followed a step whose acceptance is
  P > 2176 psi, while the compliant 600–1000 psi window is only **~100 s wide** (600 psi at
  +24 s from the Pressure SP command, 1000 psi at +122 s, NOP at +3.5 min); the alignment is
  now an action *inside* the pressurization, here and in 05 Phase A and the executable
  checklist. (2) **PWR-N05 is named for synchronizing the generator and had no step that did it.**
  The first fix was wrong and is corrected here: it asserted that selecting a load mode does
  not close the breaker. **There is no breaker in the engine** — `RD.LoadMode.isOnLine()` is
  `load_mode !== 'disconnected'`, so on/off line *is* the selector, and the board's FOLLOW and
  MAN both route through `connect_grid` (which also clears a prior trip). N05 now matches
  **03** §12.1: FOLLOW takes the machine from at-rest to synchronized and loaded in one action
  (measured, 1800 rpm and 5.26 MWe matched on a 4.7 % plant), and a slider move will not
  recover a tripped machine (measured after a scram: 0 rpm, 0 MWe, trip still latched). A new
  **scope note** records the real gap — this plant has **no turbine roll and no no-load speed
  hold**, so the roll-and-synchroscope skill the procedure is named for is not modelled.
  (3) **PWR-N15 never blocked SI** — the cooldown crosses the 1798 psi (12.4 MPa) actuation
  setpoint, and measured with SI armed the pumps inject, boron ends at **2500 ppm** instead of
  857, and the plant cools **~10× faster than programmed** (566.6 → 199.4 °F in 23
  plant-minutes); new step 1a. (4) Three stale numbers: the 5 % steam-dump demand reverses the
  heatup at **−263 °F/hr (−146 °C/hr)**, not −83 — a figure inconsistent with its own sentence,
  since 9× a +32.7 °F/hr heatup is ≈ −260 — and below ~219 °F it only *arrests* the climb; NOP
  arrives in **~3.5 plant-minutes**, not ~20; and the milestone row calling 350 °F "Mode 4 /
  Mode 3 entry" was wrong about Mode 4, whose boundary is **199.4 °F (93 °C)**, reached at ~18
  plant-minutes. (5) **05 Phase A carried a stale −3377 pcm / 907 ppm heatup endpoint**
  predating the second moderator re-fit, contradicting N01's own correct figures.

  **N15's performance table is now MEASURED with its cadence stated**, which is what made the
  old one unfalsifiable: accumulators isolated **1.9 h**, RHR placed **3.05 h**, Mode 5
  **5.0 h**, ending on the `cold_shutdown` IC exactly — at a programmed −90 °F/hr with 63 °F of
  subcooling held and the RHR HX split trimmed to the ramp. Two traps went in with it. **Step 2
  is a ramp, not a chase**: walking the setpoints to track *present* Tavg in ~1-minute steps
  gives a 55 psi error against a 36 psi proportional band, the dump saturates and the plant
  free-falls — measured, 566.6 → 199.4 °F in **six plant-minutes**. And **the ~90 °F/hr cooldown
  limit is now marked UNVERIFIED** in the procedure and the references table: no source for a
  real-plant cooldown rate exists anywhere in this manual set and the previous "commercial
  class" wording was recall, which the evidence-pass SOP does not accept.

  Gates: all **35 runners at baseline**; `run_manual_units` 0 failed (334 pairs),
  `run_manual_rev` 13/13 at Rev 9, `run_procdocs` 23/23, `run_manual_controls` 94/94.
  **Still open:** 9 of the 15 normal procedures have no executable checklist (N02–N06, N09,
  N11, N13, **N15**) — authoring one is a feature and belongs with #244 / #254.

### Added
- **The PWR board reads SI now — the Settings units toggle works on it** (#238)
  *(OWNER RULING, 2026-08-01: selected "m³/h" from three options put to him for the SI flow
  unit — m³/h, L/min and kg/s. A selection, not verbatim words.)* The board was authored in
  US customary at every readout, so #237 had to **disable the SI position while the PWR was
  active**: a global SI selection put SI chart chips beside US board readouts, the one
  indefensible state. Both halves move together now.

  The board driver has a **display-unit layer** — one table of unit families
  (`UNIT_FAMILIES` in `ui/diagram/board/pwr_board_wiring.js`), each declaring per mode its
  conversion, unit string, display decimals, ▲▼ step and band quantum — and everything that
  shows a number goes through it: **19 readouts**, the **6 vital tiles** (reading, unit,
  decimals AND band edges) and all **5 unit-bearing setpoint boxes** (value, unit span,
  decimals, step, valid range and range hint). `ui/app.js` passes `ctx.units` as an
  **accessor**, so a units change is a re-render, not a remount.

  Four things worth knowing.

  **US mode is unchanged by construction, and that is measured rather than asserted.** Every
  US entry reproduces the arithmetic and the rounding that was inline before, and the unit
  STRING in US comes from the authored item rather than from the table — so the board's three
  spelling quirks (`F` not `°F`, `GPM` uppercase on two items, `psig` on the accumulator)
  survive, and switching back restores them. `board_check` renders **166 items** identically
  before and after a round trip through SI, and its pre-existing check list is byte-identical
  to the pre-change run.

  **The band QUANTUM had to become per-unit, and the first cut of the new checks did not
  catch it.** Tile band edges are rounded so the strip does not flicker at the render rate,
  and the quantum was a whole display unit — fine at 1 psi, catastrophic at 1 MPa, which is
  145 of them: the pressurizer's 15.20–15.76 control band and its 14.82/15.86 alarms all
  collapse onto 15 and 16. Pressure quantises at **0.01 MPa**, temperature at **0.5 °C**.
  Injecting the whole-unit quantum left every new check green, so one more was added that
  asserts the seven regions stay nested — the coverage claim was worth more than the fix.

  **Tile DECIMALS are a property of the unit, not of the instrument.** The measured sigma is
  0.56 psi and 0.0039 MPa — the same noise — and it wants 0 decimals in one and 2 in the
  other. Same for the charging box: 0–60 gpm becomes 0–13.6 m³/h, where a whole-unit ▲▼ would
  nudge 4.4 gpm, so it gets 1 decimal and a 0.1 step.

  **The unit trap is in here too.** Subcooling margin and leg ΔT are temperature
  DIFFERENCES: 41 °C is 73.8 °F, not 105.8, and the absolute rule reads as a *healthier*
  margin than the plant has. That is what `run_manual_units` gates in prose; the board can
  make the same error, and two checks now say it does not.

  Also: the dump-setpoint **range hint is derived from the bounds** in SI so it cannot drift
  from them (US keeps its authored string, including its known 29-vs-30 psi off-by-one — a
  board-data defect, not this layer's to fix), and the TRIP BLOCKS popover's `1800 psi`
  caption reads the protection table instead of a hand-copied literal.

  `board_check` **143 → 162** (+19; **18 new units checks, all injection-verified** against
  seven separate faults — an absolute conversion on a difference, a missing inverse on
  command, a one-way unit write, a dead unit span, a unit-blind quantum, unit-blind decimals,
  and the seam itself removed). It is not in `run_all`; run it after any board change. Its
  own ctx also stopped lying: it passed `unit: 'si'`, a string nothing has ever read, so it
  claimed to test SI and rendered US for its whole life.

### Fixed
- **The board's System Scanner was teaching five things the plant does not do.** Hovering
  any object writes a description into the inspection block; that copy is a static registry
  (`ui/diagram/board/pwr_board_inspect.js`) and four separate changes moved numbers under it
  without moving it. `run_inspect` was green at 35/35 throughout — it gates coverage, orphan
  keys, citations and duplicates, **not arithmetic**, so none of this was visible. All
  figures below re-measured full-stack (M4+M5+M6), seed 4242.
  - **ROD AUTO described a captured reference; the reference is PROGRAMMED.** The entry
    taught that engaging captures current Tavg and that the capture is the trap. The channel
    carries `program: trefFromLoad` — measured, dropping load 100 → 60 MWe slides the
    reference from 579.3 °F (304.07 °C) to 574.2 °F (301.24 °C) with nobody re-engaging it.
    A captured reference would not have moved. The entry also never said the channel is now
    **engaged on arrival** at power (#289), which the SG FEED entry does say of its own.
  - **ECCS FLOW said "zero at operating pressure"; its own card said "trickle".** Measured
    with `set_hpi` at 2235 psi (15.41 MPa): **1.7 % of rated**, which the gauge resolves.
    The quoted 2200 psi was wrong too — the high-head shutoff is 2384 psi (16.44 MPa).
  - **STEAM DUMP POSITION said "nearly full open and stays there"** — a sentence from when
    `steam_dump_max` was 1.05. Measured on a turbine trip: P-9 scrams at +1 s, the valve pins
    at its stop of **40.0 %** for about a minute, then backs down to 8.9 % at +3 min and
    7.5 % at +10 min. 40 % is what the 0–100 % readout shows, so the old text described a
    reading the player cannot get.
  - **CHARGING FLOW said 13 %/min; it is 33 %/min.** Board-maximum charging against an
    isolated letdown, measured steady over four windows: **+33.5 %/min** — from a normal
    55 % that is the 97 % going-solid trip in a little over a minute. Consistent with #249
    re-fitting `level_per_mass_surplus` and deliberately not scaling the deficit branch. Its
    neighbours were right and are unchanged (letdown A −2.2 %/min, A+B −5.0 %/min).
  - **TRIP BLOCKS had three of its four rules inverted.** Measured: a block of a NOT-yet-
    asserted trip is **accepted** (the copy said blocks are refused unless asserted — the
    kernel refuses only the opposite case, an already-asserted trip outside its permissive);
    clearing is **never refused**, and clearing `ir_high` at full power scrammed the plant
    within 5 s on `intermediate_range high` (the copy said it cannot be cleared when clearing
    would scram); and a hand-set block **survives** falling below P-10, only plant-established
    ones reinstate. The REACTOR POWER entry carried the last two errors as well.
  - **Two code comments carried the same wrong premise** and are the likely source of the
    copy — `getRpsState`'s header in `control_kernel.js` said "clear only while not asserted"
    directly above `can_clear: blocked   // clearing a block is always allowed`, and
    `refreshTripBlocks` in the board wiring repeated it. #220's lesson, third time: the
    guard's own comment was the bug.
- **The Scanner still spoke US customary after the board learned SI** (#238). 23 entries
  named their display unit in prose ("in psi", "in °F", "in gpm", "psig", "inches of
  mercury") and the registry has no access to `ctx.units()`, so every one of them was
  contradicted the moment SI was selected. Unit names removed where the readout labels
  itself; quoted values now carry their SI partner. **`run_inspect` grew the guard**
  (35 → 36 checks): a US unit token may appear only after a number, where
  `run_manual_units` then holds it to the dual-unit convention. It found two sites the hand
  pass had missed, and reddens on the old text.
- **`board_check` had a red nobody had run** — 1 failure / 143 while CLAUDE.md claimed
  143/143. Two independent harness bugs, both pre-existing, neither a plant defect. The
  TRIP BLOCKS check **unblocked `ir_high` at full power and never put it back**: the IR
  channel reads 2.0e-3 against a 1.67e-3 setpoint, so the trip condition is standing and the
  block is the only thing holding it off — the plant scrammed immediately and every check
  below ran on a dead reactor at ~3 % power. And the **SCRAM two-step ran on an already-
  scrammed plant**, where the same two clicks are the #75 RESET half, so it un-scrammed the
  reactor and then asserted a scram. The plant was correct at every step. Now **149/149**.
- **Mode 4 alarm behaviour was tested nowhere** (#294). `COLD_MODES = [4, 5]` in
  `layers/control/pwr_control.js` gates six alarm behaviours — the #287 RHR alarm's
  `condition`, plus four reclassify rules that turn expected cold-plant indications into
  `status` instead of leaving them as warnings. Every existing probe exercised **Mode 5
  only**. Measured by injection: narrowing it to `[5]` left `run_m4`, `run_pwr`, `run_ops`,
  `run_contract`, `run_reachability` and `run_hardrules` **all green** at 185/240/351/139/58/75
  — the Mode 4 half could have been deleted outright without a gate objecting.
  - **What it suppresses is not cosmetic.** On a correctly depressurized cold plant the
    injected form raises a spurious **CRITICAL** (`pzr_pressure_lolo`) — a casualty alarm on
    a plant depressurized exactly as the procedure intends — plus three spurious warnings,
    **and loses `rhr_not_aligned` (06 PWR-A33) entirely**, the one alarm carrying real news,
    because its condition stops matching.
  - **Three of the five deltas are priority-only**, on alarms that still appear either way.
    A presence check cannot see those, so the probe asserts the priority.
  - **Mode 4 is where a plant spends most of a cooldown from power**, and where the #287
    sequence actually lands (measured: that cooldown ends Mode 4 at 147.5 °C / 297 °F,
    280 psi / 1.93 MPa). The existing #287 probe reaches its loss with an operator
    `set_rhr active:false` in Mode 5; the new one reaches Mode 4 the way the plant really
    does — **losing the heat sink and heating on decay + pump heat**, Mode 4 at 1000 sim s
    for about a second of wall — so the mechanism under test is the engine's, not the
    probe's, and no temperature is hand-set.
  - No behaviour changed: the plant was already correct. `run_m4` **33/33 (185) → 34/34
    (194)**; 5 checks red on the injected config.

- **A load rejection no longer scrams the plant on the going-solid trip** (#289)
  *(OWNER RULING, 2026-08-01: selected "Add the program ceiling" from the options put to
  him — a selection, not a verbatim instruction)*. The pressurizer **level program had no
  maximum**. It is `55 % + 2.5 %/°C × (Tavg − 304.1 °C)`, and with rod control in **manual** —
  the shipped free-play lineup — the core can only run back on the moderator coefficient,
  which *requires* Tavg to rise. Tavg parked at **319.6–321.3 °C (607.3–610.3 °F)**, the
  program followed it to **~94 %**, and the plant tripped on the **97 %** going-solid
  reactor trip **with inventory correct** — `pzr_level_dev` was **negative**, i.e. the
  pressurizer was holding *less* water than its own program demanded. The trip that exists
  to catch an overfill was being fired by the control program.

  Measured, free-play lineup, `hot_full_power`, load ask at t+60 s, six instrument-noise
  seeds: a **6–11 MWe** ask scrammed **6/6 seeds**, 5 MWe scrammed **1/6** (decided by
  noise), while **0 MWe and 12 MWe did not scram at all** — a *smaller* load rejection
  tripping when a larger one did not. After the fix: **0 trips in 42 runs**, peak level
  89.7–95.1 % against the 97 % trip.

  The program is now clamped at both ends via a new `level_prog_ceiling` (**61.5 %**) and a
  single `pwrPressurizer.levelProgram()` that the CVCS setpoint and the deviation gauge both
  read. Physics (`levelBase`) is deliberately **not** clamped — the coolant really does
  expand, and the resulting level-above-program is exactly what the CVCS is meant to let
  down. Sourced to **WTSM 10.3 Pressurizer Level Control System (ML11223A290)**: *"both
  minimum and maximum level limitations are placed on the level program"* (low 25 %, high
  61.5 %), whose stated purpose is our exact case — *"low enough to ensure that the
  pressurizer does not go solid following a turbine trip from 100% power … assuming no
  operator action and **no response by the automatic control systems (the rod control and
  steam dump control systems)**."*

  `pzr_level_dev` now reads against the **program**, not the physics line: it peaks at
  **+29.3 %** on the insurge and decays to ~0 as make-up lets down. Reading the physics line
  would have pegged `PZR LVL DEV LO` at ~−39 % for the whole transient while the controller
  sat exactly on setpoint. All **35 runners at baseline**; no baseline moved.

  Two things this does **not** fix, both deliberate. The **SG code safeties still pass steam**
  in the 0–5 MWe band — that is the rods-in-manual consequence #289 was filed on, and whether
  `rods_tavg` belongs in the free-play lineup is still open (auto rod control already exists
  and is reachable: **ROD AUTO** on the board, `board_check`-pinned, Manuals 02/03/04). And
  the going-solid trip is still **97 %, single channel, with no power permissive**, where the
  real one is **92 %, 2/3, P-7 gated (≥10 % power)** — aligning it only makes sense after
  this ceiling, since 92 alone is *lower* and would scram more.

- **HR11's guard checked one of the two markers the repo uses** (#290). `run_hardrules.js`
  requires every ruling citation to carry a date *and* the owner's verbatim words —
  otherwise it is indistinguishable from an agent's own preference in authoritative voice.
  It matched the literal string `OWNER RULING`. The repo also uses **`OWNER DIRECTIVE`**, and
  all eleven in-scope occurrences were unguarded: *never merge into `develop`*, *never push
  the lanes*, the brevity and STILL OUTSTANDING directives, and the US-customary-units rule
  among them. One (`CLAUDE.md`'s `status-owner-review` / `status-work-next` labels) was
  already malformed — a quote with no date — and nothing said so.
  - **A second, quieter defect the issue had not found.** The skip for prose *about* the
    marker was ``/`[^`]*OWNER RULING[^`]*`/``. That also matches when the marker merely sits
    **between** two inline code spans, because the `[^`]*` gap is the text after one span
    closes and before the next opens — which in this repo's heavily backticked prose is the
    normal case. Measured: **four genuine citations silently skipped**, three `OWNER RULING`
    (`RETIRED.md`'s retirement of the ship-review plan, `TUNING_LOG.md`'s *"249 - fit it."*,
    `CLAUDE.md`'s steam-dump 40 %) and the US-customary-units directive. Worse than the
    filed defect: an unmatched marker at least *looks* unmatched, whereas these read as
    checked. The gate now tests the marker's own backtick parity — odd means genuinely
    inside a span — and still excludes the three real `` `OWNER RULING` `` prose mentions.
    Backtick **runs**, per CommonMark, not individual backticks: a run of N opens a span only
    a run of exactly N closes. Counting singly was a third wrong answer, and this changelog
    entry is what exposed it — quoting the old regex puts the marker inside a *double*-
    backtick span, parity read even, and the gate flagged the paragraph explaining itself.
  - **The lookahead window is bounded on both sides now.** It existed because a citation
    routinely wraps its date onto the next line, but it accepted *any* quote mark within
    three lines, so `release-to-main/SKILL.md`'s date-only citation passed by borrowing the
    quote from the sentence after it. The window now stops where the citation's own
    parenthetical closes. **Two wrong versions of that rule measured green first**: counting
    depth from the marker sees the opening `(` behind it and reddens all nine legitimately
    wrapped citations, and counting *absolute* depth never fires on a nested citation — so
    deleting the date from `CLAUDE.md`'s steam-dump ruling, which sits inside
    `(41 -> 42 on 2026-07-31: ...)`, changed nothing. Depth **relative to the marker** holds.
  - **Scope widened to `.claude/skills/`.** Skill files cite rulings as authority exactly as
    the docs do, and being outside the scanned list is why the malformed citation there
    survived a gate believed to cover it.
  - **Both malformed citations repaired**, neither invented: `CLAUDE.md`'s date is in its own
    lead-in sentence, and `SKILL.md`'s missing quote is recorded in full at `CLAUDE.md`'s
    versioning section.
  - **Injection-verified against the pre-fix runner**, per the standing rule that a check
    written beside its own fix proves nothing. Three malformations — an `OWNER DIRECTIVE`
    losing its date, a backtick-flanked `OWNER RULING` losing its date, and the `SKILL.md`
    citation losing its quote — each redden exactly one site now, and the pre-fix gate stayed
    green at **43 sites / 0 undeclared** through all three.
  - `run_hardrules` **58 → 75 checks** (HR11 43 → 60 sites: **+11** widened marker, **+4**
    corrected span test, **+2** new scope). **This is not the usual write-up drift** that
    moves this runner on every merge — no ruling was added; the guard grew to cover markers
    that were always there.

### Changed

- **The trend graphs open on a real 30 minutes, not a flat line** *(OWNER, 2026-08-01: "when
  you make preset starts, run them for 30 minutes to fill up the graph with real data before
  saving")*. A preset start seeded the chart's 30-minute record window with **360 identical
  samples**, so a fresh plant showed a ruler-straight trace where a running plant shows
  instrument texture. It now seeds flat instantly and swaps in a genuinely-run trace computed
  in background slices, cached per plant + design version + initial state for the session.

  **Flat-first is deliberate**: a 30-plant-minute full-stack run measures **1874 ms**, and a
  fresh chart buffer happens on boot, reset, plant switch *and* every mission start — paying
  that synchronously would freeze all four. Slices are 40 ticks (~42 ms) rather than 120
  (~125 ms), which is the difference between smooth and visibly janky.

  **What it does not do**: change the *shape*. The initial conditions are constructed as true
  steady states, so 30 real minutes is a noisy flat line — measured at `hot_full_power`, power
  99.78–100.2 %, Tavg 304.0–304.2 °C, pzr level 54.6–55.3 %. The gain is instrument texture
  and the genuine slow drifts (xenon, boron) a synthetic seed cannot have.

  Guarded by a new `verify_e2e_ui` section. A/B on the real page: with the swap the busiest
  plotted series has **28 distinct y-values** across its 61 points; with the call neutered,
  **exactly 1**. Injection-verified — the gate fails with that number in the message.

- **Rod control starts in AUTO** (#289) *(OWNER RULING, 2026-08-01: "Let's start the rods in
  auto. Might as well, everything else starts in auto.")*. `rods_tavg` is `defaultOn` at
  power, joining `boron_conc`, `cvcs_makeup` and `feed_sg` in the free-play lineup. Instructed
  content (`noDefaults`) is unaffected.
  **At-power only, and that half is measured, not decorative.** A blanket default engages the
  channel in Mode 5 and during `pwr_heatup`, where Tavg is hundreds of degrees below the
  no-load Tref the load program asks for — so the channel withdraws rods to close the error
  and takes the plant critical. `pwr_heatup` **scrammed at step 6 on `source_range high`** and
  `run_behavior` SS-9 tripped the same way. Gated on the **power-range instrument** above
  10 % (the P-10 analogue) it costs neither. The first cut read `true_state.power_pct` and
  `run_hardrules` failed it — **the same defect class as #220**, where the P-9 permissive read
  the plant instead of the gauge.
  **This completes #289.** With rod control acting, a full load rejection no longer parks the
  plant at 46 % with the dump saturated and the SG code safeties passing to atmosphere
  indefinitely: the dump reaches its 40 % stop, comes back off it, the safeties reseat, the
  core is run back and Tavg returns to the no-load anchor. Relief still *occurs* briefly on a
  full rejection — prototypical, since a real Westinghouse plant's design case is the 50 %
  loss of load — but it no longer **persists**, which was the filed defect.
- **The ROD AUTO button lights green like every other AUTO control** *(OWNER, 2026-08-01:
  "the auto rod button doesn't follow the color convention. Auto on it should be green not
  white.")*. It was authored `#9fb3c4` (pale grey) against `#5aad7c` on all **8** other AUTO
  buttons — and the board uses the authored item colour *as* the lit colour, so the mismatch
  was invisible until the control was engaged. It now comes up engaged on every Mode 1 start,
  so it is lit every session. Applied via `DOC_PATCHES` (re-export-safe, idempotent) and
  pinned two ways in `board_check`: the patched value, and the **convention itself**, so a
  re-export that recolours any AUTO button fails instead of shipping two meanings for green.

- **The RHR suction valve has two interlock setpoints now, not one** (#288)
  *(OWNER RULING, 2026-07-31: "issue 288, split them.")*. One config constant,
  `rhr_valve_interlock_mpa`, was doing two different jobs: blocking the valve **open** and
  forcing it **closed** on repressurization. The deadband between them was therefore
  **zero**, and the valve chattered across a single boundary. The autoclose now runs off a
  new **600 psi (4.14 MPa)** `rhr_autoclose_mpa`, about 200 psi (1.38 MPa) above the
  **unchanged** 400 psi (2.76 MPa) block-open permissive.
  - **Both setpoints are sourced.** NUREG-0933 Issue 99, *"RCS/RHR Suction Line Valve
    Interlock on PWRs"* (Rev. 3): *"Two basic features are incorporated in the interlock
    design: (1) an automatic closure signal on high RCS pressure (typically 600 psig), and
    (2) a block of the manual open signal at a lower RCS pressure (typically 425 psig)."*
    The Westinghouse Technology Systems Manual §5.1 (ADAMS **ML11223A219**) gives the same
    structure for valves 8701/8702 — 425 psig open block, ~585 psig autoclose.
  - **What it fixes for the player.** Paired with the one-shot entry permissive kept by
    #287, the first chatter was **permanent**. Measured engine-direct from the
    `cold_shutdown` IC: before the split, *every* rebound above 400 psi shed the valve —
    including the **409 psi (2.82 MPa)** case #287 documents, a cooldown whose own
    pressure-control setpoint sat nine psi over the interlock. After it, rebounds to 409 /
    435 / 508 / 580 / 595 psi all hold, and the valve lets go between 595 and 609 psi — its
    setpoint. Losing RHR now takes a genuine excursion, not a hunt. **Heatup is
    unaffected**: RHR isolates 6 s later, at 605 psi instead of 413 psi, Tavg unmoved
    (122 → 124 °F).
  - The open permissive was deliberately **not** moved to widen the band: 400 psi is what
    `04`, `05`, `09` and the campaign all quote, and it is inside the sourced range for a
    block-open setpoint. The autoclosure was deliberately **not** removed either, though
    GI-99's resolution called removal *"recommended, but not required"* — that is a
    licensee's design decision, and this plant's is pinned by `rhr_valve_and_mode`.
  - Manuals **Rev 25**: `09` gained a **§ RHR** note carrying both setpoints and the
    sources; `03 §11.2`, `04` (×2), `06 PWR-A33` (three rows) and `12 §6.4 / §14` updated.
  - `run_pwr` **237 → 240 checks**. Injection-verified both ways: pointing the autoclose
    back at the open permissive reddens the load-bearing deadband check, and deleting
    `rhr_autoclose_mpa` outright reddens four.

### Added
- **Losing shutdown cooling now annunciates — `RHR NOT IN SERVICE` (06 PWR-A33)** (#287)
  *(OWNER RULING, 2026-07-31: "Keep it and enunciate")*. The RHR auto-entry permissive is
  **one-shot** — it fires on the first crossing below 400 psi (2.76 MPa) and never re-arms —
  while the engine **auto-closes** the suction valve on any repressurization back above the
  interlock. Both halves are right on their own, and a real plant re-opens that valve
  deliberately rather than automatically, so the permissive **stays one-shot**; what was
  missing was any indication that RHR had gone. Measured before this: a cooldown whose
  pressure-control setpoint sat just above the interlock finished **scrammed at 283 psi
  (1.95 MPa), below the entry pressure, with the arm still in AUTO, its permissive condition
  still true and RHR shut** — the only board tell being the ECCS card quietly reading LPI
  instead of RHR.

  The tile is gated on **Mode 4/5 plus the valve position**. Not on pressure: RHR is correctly
  unaligned through all of Modes 1–3, so a pressure gate would stand in through every cooldown.
  And **not on the reactor-trip latch** — measured, a Mode 5 plant reads `rps_scrammed = false`
  because it was never scrammed, it is simply cold, which made the first cut of this alarm
  impossible to raise in the one mode where losing RHR matters most. Alarm `condition` gained
  two generic forms to express it (an array is an AND, a leading `!` negates, and
  `{instrument, in:[…]}` matches the shape the #240 reclassify rules already use); the kernel
  still names no instrument. `run_m4` 32 → 33, manual set **Rev 23**.

### Testing
- **`ops_cooldown_to_rhr` now performs the evolution it is named for.** The probe is titled
  *"hot standby toward RHR entry (400 psi / 2.76 MPa)"* and never got there: its RHR check was
  an `info` line reading `false`, and the check that *named* its 90 °F/hr (50 °C/h) ramp was
  `Tavg after 2 h < 527 °F (275 °C)` — one-sided and landing at **195 °F (90.7 °C)**, so it
  could not detect the plant cooling at **185 °F/hr (103 °C/h)**, double the rate its own
  driver paces to. Three defects behind that, all in the driver rather than the plant: it never
  throttled the **RHR heat exchanger**, which is the cooldown-rate control below the interlock
  (the last 21 minutes ran at 567 °F/hr / 315 °C/h at full HX flow); it never isolated the
  **accumulators** at 1000 psig, so all four dumped into the RCS (#273's signature — boron
  2270 ppm, inventory pinned at 120 %); and its saturation-following pressure setpoint asks for
  **409 psi (2.82 MPa)** at the temperature RHR comes in, *above* the 400 psi interlock. Now:
  rate held at exactly 50 °C/h, RHR aligns at 103 min and stays aligned, accumulators isolated
  at 51 min, boron **623 ppm**, inventory **100.0 %**. Six info lines became real checks, all
  verified red by injection; `run_ops` 344 → 350 passed with the failure count unmoved at 12.
- **#154's remaining coverage gaps closed — sixteen kernel, service, instructor and engine
  surfaces that shipped with no assertion at all.** The omnibus was re-verified first, and
  about half of it was already dead (all five TMI-2 Part-3 endings, the follow-mode
  save/restore branch, cold-init trip blocks, the PORV block valve, most of the "missing ops
  evolutions"). One filed item was **stale in the other direction**: the RHR 400 psi
  (2.76 MPa) interlock is fully covered in `run_pwr` — refuse above, open below, autoclose on
  repressurization — it is only the *ops probe* that never issues `set_rhr`.

  What was actually missing, now closed:

  - **M4 kernel** (`run_m4` 28 → 32): actuation **`reset_below`** — a comment recorded the
    shipped PORV-flapping inversion and nothing pinned the fix; numeric **`override_value`**
    interception, used by five PWR failures with the intercepted-command path never once
    observed; interception **precedence** (first-injected wins, and the probe distinguishes
    that from last-wins rather than merely detecting *an* override); and
    **`acknowledge_all_alarms`**, previously asserted only as "the instructor gate does not
    block it".
  - **M5 / M6** (`run_m5` 19 → 22, `run_m6` 17 → 18): the **`_rewindCursor`** walk-back that
    stops consecutive rewinds restoring the same checkpoint for ever; world rewind
    **`exact`** at service level, where its semantics live (it was covered only end-to-end in
    the browser gate); **`save_state` as a command**, whose dispatch line had no caller; and
    the chat transcript's **story clock**, **time-skip divider** and **`CHAT_LOG_CAP`** ring.
  - **PWR engine** (`run_pwr` 32 → 36): the pressurizer **code safeties** — `s.safety_open`
    had zero references in the entire test tree, so the last mechanical line of primary
    overpressure protection was unproven; **`porv_tailpipe_temp`**, the TMI-2 / Davis-Besse
    tell the flagship scenario teaches, which heats 98 % in two minutes and cools 12 % in the
    same span — that asymmetry *is* the lesson; the TMI-2 **blocked-AFW** device, previously
    only ever asserted false; and the **unknown-command** error path. `save_migration` went
    from **8 to 20** of the 29 fields `_migrateState` defaults, including the `rcp_secured`
    inference (#240) — the one judgement call in the migration, unasserted in both directions.
  - **Casualty and ops** (`run_meltdown` 9 → 10, `run_ops` 57/68 → 58/69): **MD-10, feed and
    bleed** — MD-6 took the total loss of the secondary heat sink to core damage and nothing
    exercised the *recovery*, so the suite proved only that the plant can be lost that way
    (measured: unmitigated damages at 4040 s peaking at 691 °F (366 °C) Tavg; with the PORV
    open and HPI running, peak fuel 1162 °F (628 °C) and no damage). And
    **`ops_shutdown_dilution`**, the regime that produced the owner's free-play source-range
    trip (#260): every other reactivity probe runs at power, where the subcritical
    multiplication it measures does not exist. Diluting Mode 5 at the tuned 0.05 ppm/s makeup
    rate and walking away, the source-range trip fires at 1248 s with 59 ppm removed.

  Worth carrying from writing them: the code safeties **cannot be reached by a plant
  transient** — the high-pressure reactor trip caps indicated pressure at 2460 psi
  (16.96 MPa), below the 2484 psi (17.13 MPa) pop — so only an ATWS or a failed instrument
  gets there, and the probe drives them directly. Two first drafts also passed for the wrong
  reason: the engine harness emulates M4's protections *including the reseat*, and left on it
  shut the valve inside the measurement window (relief flow read 0 one second after an
  explicit pop).

- **Five automation channels could have been doing nothing, and the gate would still have
  read 24/24** (#286, split out of #154 item 10). `run_autoctl` engaged **seven channels at
  once** and asserted **aggregate** plant state — power, Tavg, pressure, SG level — so any
  band could be held by a channel other than the one under test, and a dead channel hid
  behind its neighbours.

  **Measured**, by neutering the kernel so a channel reports `engaged` and does nothing:
  `cvcs_makeup`, `boron_trim`, `grid_follow`, `boron_conc` and the *engage* half of
  `steam_dump` were each a complete no-op at a green **24/24**. Two of those matter beyond
  the gate: **`boron_conc` is `defaultOn`**, so it is in every free-play preset lineup and
  could have shipped inert; and `steam_dump`'s single incidental red came from a *different
  feature's* test (#228's RPS reset) catching only the scram stand-down, so engaging the
  channel could have done nothing at all.

  Six probes added, each engaging **one** channel plus only what it `requires` and asserting
  what nothing else in the lineup can produce — `cvcs_makeup` holds pressurizer level against
  an open letdown orifice (**54.9 %** vs **22.5 %** dead); `boron_trim` answers rods driven
  past 96 % with a dilute and recovers them to **88.6 %** instead of letting them park at
  **100 %**, out of travel; `boron_conc` lands a 40 ppm Mode 5 batch dose on target and
  *stops* (the totalizer is spent, it is not a servo); `grid_follow` walks turbine demand off
  a pinned **100.0 MWe** ask onto reactor power; `steam_dump` carries a turbine trip at
  **1121 psi (7.73 MPa)** with the code safeties shut, against **1368 psi (9.43 MPa)** and
  safeties lifting when dead; `pzr_pressure` restores **2235 psi (15.41 MPa)** exactly, where
  a dead channel lets the plant drift to **2323 psi (16.02 MPa)**.

  Every check was verified **red by injection** before counting as green. Worth carrying:
  when injecting against a `mode` channel, neuter the **engage direction only** — the rig
  stands every channel down at t=0, and blanking that *disengage* too leaves the plant in
  whatever AUTO the initial condition shipped with, where it holds itself. With both
  directions blanked the `steam_dump` and `pzr_pressure` probes **pass against a dead
  channel**. `run_autoctl` **24 → 30**.
### Changed
- **Dropped the nuclear-from-cold heatup path** (was training-only N01a /
  `pwr_heatup_nuclear`). Not a commercial NOP — heatup is subcritical (**N01**);
  approach to criticality is hot (**N03**).

- **04 Normal Operating Procedures rewritten in commercial NOP format (Rev 1).** Every
  N01–N15 procedure now has purpose / applicability / prerequisites / precautions /
  stepped acceptance / outcome. Heatup and approach aligned to WTSM / NUREG-1431 shape
  and plant-tested checklists. HFP electrical band corrected to **100 MWe**.

- **Manual set revision counter reset to Rev 0.** Pre-public history zeroed; public
  counting starts after go-public. Development rows remain in git.

- **Normal operating procedures renumbered to plant sequence** (manual redesign baseline).
  IDs now follow cold → power → continuous control → cold: **N01** heatup, **N01a** nuclear
  training heatup, **N02** Mode 3 lineup, **N03** approach to criticality; **N04–N15**
  unchanged. **04** regrouped (A/B/C/D) and body reordered. Cross-refs in **02/03/05/06/11**
  and live `manual_ref`s updated. (Former N01/N02/N03/N03a map is in manual Rev 25.)

- **PWR-N01 is the pump-heat heatup; the nuclear path is PWR-N01a** (#255). The live
  checklist `pwr_heatup` was still the 18-step nuclear ride from before pump heat worked.
  It is now the commercial heatup: start the RCPs, confirm the grid off, Feed AUTO, Dump SP
  to the no-load anchor, raise Pressure SP, re-align the SI accumulators, and ride Tavg up
  with **zero rod motion**. The old nuclear sequence is kept as **PWR-N01a** /
  `pwr_heatup_nuclear` for approach-to-criticality and trip-blocking practice. Measured
  full-stack: settles **567.0 °F (297.2 °C)** at **11.3 plant-h**, **ρ = −2828 pcm** on
  **856.8 ppm**, power **3.5e-5 %**. Both procedures green under `run_procedures` and
  `run_procedures_stack`.

- **The steam dump is 40 % of rated steam flow — the real Westinghouse capacity.** It was
  105 %, which meant the plant could swallow a total loss of load without noticing:
  measured, average coolant temperature rose to 305 °C (581 °F) and power held at 97.5 %.
  Nothing was learned from that, and the reactor trip on turbine trip could not be
  demonstrated, only asserted — its whole premise is that the dump *cannot* absorb a
  turbine trip from high power.

  **What you will see now.** A **50 % loss of load** — the case the real capacity is sized
  for — still needs no trip and lifts nothing: the dump goes to its stop and the reactor
  runs itself back about 10 %, which is exactly the division of labour a real plant is
  designed around. Beyond that the dump is at its limit and the plant has to shed the rest
  itself. A **full** load rejection from 100 % still does not scram, but it is an event
  now: the dump saturates, the core runs back to ~46 % on moderator feedback, temperature
  peaks near 608 °F (320 °C), the pressurizer level climbs to within a point and a half of
  its going-solid trip with the level alarm sounding, and the **PORV lifts** as the
  designed backstop. Then you walk it down at your own pace, as before.

  A real plant of this class does not ride out a full rejection either — its design case is
  50 % — so the relief valve doing its job is the plant being honest about where its margins
  end, not a fault. The dump is still lost with the condenser (vacuum, blackout).

  Manuals **01**, **09** and **12** updated (set Rev 23); **12** gains a description of what
  happens past the dump's limit.

### Fixed
- **Isolating main steam trips the turbine even at zero load** (#284 follow-up). The
  `close_msiv` handler decided whether to trip by asking whether the generator was carrying
  **load**, not whether the **breaker** was closed — the same shortcut #284 removed from the
  rotor model, left standing six lines away in a sibling file. Consequence: shut the MSIVs
  while synchronised with the load target at 0 MWe and the turbine did not trip, the breaker
  stayed closed, and #284's rated-speed hold then parked the machine at **1800 rpm with zero
  admission steam** — a generator motoring on the grid. Measured at hot full power, that state
  ran **77 s**, until an unrelated `sg_level low` scram ended it. It now trips on
  `RD.LoadMode.isOnLine`, and the breaker opens with it.

  Cold Modes 3 and 5 are unaffected: they are authored `load_mode: 'disconnected'`, so
  isolating steam on a cold plant still does not trip a turbine that was never on line. The
  one behaviour that changes in the other direction is an MSIV closure in the seconds after
  `disconnect_grid`, while the load is still decaying — the breaker is already open, so the
  turbine is no longer tripped, which is the #230 distinction rather than an exception to it.

  `run_behavior` **TR-1e gains a fifth leg** and the probe count is unmoved at 42.
  Injection-verified against the old predicate: 3 checks red (`turbine_tripped` false,
  `load_mode` manual, 1800 rpm), while the *"no steam past the MSIV"* check stays green — so
  the leg asserts the **trip**, not the valve. A sweep of the whole tree now finds no
  remaining `generator_load` read that decides anything; the only one left is the braking
  torque term in `stepTurbine`, which is what that field is for.
- **The startup and heatup procedures are checked against the board again** (#224). The
  table that pins each procedure step to the control it names had not been updated through
  three rounds of procedure re-authoring — and that table is what the browser gate walks, so
  an unlisted step was not merely unmapped, it was **unverified**. Measured: 17 of the 45
  controlled PWR steps were covered, with the whole of *Plant Heatup* at zero, and the gate
  reported a clean pass over what was left.

  All 45 were then checked against the board's own control vocabulary and **all 45 resolve** —
  no procedure has ever pointed at a control the player cannot reach. Two entries were
  pointing at the wrong step, both from steps having been inserted above them.

  Coverage is now 58 steps and the browser gate runs **174 checks**, up from 84, in about the
  same time as before.

- **A failed power-range channel no longer leaves the P-9 permissive armed** (#220). The
  P-9 interlock — ~50 % power, and the thing that arms the SG hi-hi reactor trip, Reactor
  Trip on Turbine Trip, and the loss-of-main-feed AFW start — was computed from **true**
  reactor power rather than from the nuclear instrument. The real one comes off the NIS
  power-range detectors and nothing else, so ours could not be fooled by the channel it is
  supposed to be reading.

  **Measured** (hot full power, seed 42): with the power-range channel stuck at 40 % and
  the core genuinely at 100 %, a turbine trip still scrammed at **+0.5 s** and an SG
  overfeed still scrammed at **+0.2 s**. It now de-arms: the turbine trip is ridden out on
  the steam dump, and the SG hi-hi still isolates feed and trips the turbine but does not
  scram — the plant trips **59 s later on SG level low**, a real limit rather than an
  anticipated one.

  **Nothing changes with a healthy instrument** — that is the point, and it is why 34 green
  runners never saw it. New probe **TR-1f** fails the channel deliberately, because that is
  the only state in which the difference exists (4 checks red on the old engine).

  A **single** failed channel defeats the permissive here, where a real plant out-votes it
  two-of-four; that follows from the existing no-voting simplification and is now declared
  (`DESIGN_COMPANION` §8.20) rather than implied.

### Changed
- **Four departures from real-plant practice are now written down instead of implied**
  (#220, from the evidence pass against NRC primaries): the steam dump at 105 % of rated
  flow where most Westinghouse units are at 40 % (§8.17); the 1.5 DPM rod-withdrawal block,
  which has no real analog — the 1.0 DPM alarm and the source-range flux trip either side of
  it do (§8.18); the AFW auto-start sitting 3 points above the SG lo-lo trip where the real
  plant uses one signal at one setpoint (§8.19); and P-9 / turbine-trip sensing at status
  level rather than from stop-valve position and autostop oil pressure (§8.20).
- **Board copy: the boron reading.** It said real plants "do not trust an online
  boronometer". The sourced position is narrower — boron is determined by chemistry grab
  sample and titration and tech specs require periodic verification, and while online
  boronometers do exist at some plants, nothing relies on one. Corrected to match.

- **The reactor is protected the same at 3600× as at 1×** (#153). Trips, actuations,
  interlocks and alarms were evaluated exactly **once per broadcast**, so the interval
  between two protection evaluations was `timeAcceleration × broadcastMs` — how well the
  plant was protected depended on which speed button you had pressed.

  **What that cost.** Measured full stack (PWR `50_percent`, `continuous_rod_withdrawal`
  severity 1.0, seed 42): indicated flux sits above its 120 % setpoint for only **8.74 sim
  seconds**. At 1×/10×/60× the plant tripped on `power_range high` at **9.1 s**. At **256×
  and 600× that trip was never evaluated at all** — the plant tripped 16.5 s and 50.9 s
  late on `primary_pressure high`, a slower parameter that merely happened to still be
  above its setpoint when the next evaluation landed, so the board named the wrong cause.
  At **700× and above — including the 3600× the speed selector ships** — nothing fired: one
  evaluation every 360 sim s, a **135.9 %** power excursion beginning and ending inside a
  single broadcast, and `scrammed` still false on the far side of it.

  **The fix.** Protection now runs on a **sim-time cadence** capped at `PROTECTION_DT`
  (0.1 s) inside the substep loop. Measured 1× → 3600×, the scram lands at **9.14 → 9.32 s**,
  always on `power_range high`, with peak power **121.6 → 121.9 %** and peak fuel
  **1012 → 1012 °F (544 → 544 °C)**. **1× is byte-identical** to the old path by
  construction: a 1× broadcast is exactly `PROTECTION_DT`, so the in-loop guard hands that
  evaluation to the existing post-loop call.

  **What this does not change.** The *snapshot* reporting a scram is still one per
  broadcast, and always will be — you cannot render faster than you broadcast. What no
  longer varies is when the plant actually acts. The attention-stop dropout was never a
  substitute: it is computed from the snapshot assembled *after* the cycle has run, so at
  3600× it dropped the clock six plant-minutes after the excursion it was meant to catch.

  Applies to all three plants — the owner lifted the RBMK hold for this fix *(OWNER,
  2026-07-31: "You can fix RBMK too")*. `test/ops_harness.js` moved with it: its
  `evalEvery` was an independent copy of the M5 cadence, and leaving it would have left the
  ops suites certifying a plant no player can produce (the inverse of #209).

  Gates: `run_m5` 83 → **90 checks** (new suite, 5 of its 7 checks red by injection on the
  pre-fix service); `run_ops` 57/68 → **58/68**, the deliberately-red C2 accel-latency probe
  going green because the defect was fixed, not because the test was weakened. All three
  accel probes (PWR, RBMK, BWR) now report identical trip delay at 1× and 256×.
  `run_campaign` 51/51 and `run_procedures_stack` 22/22 are unmoved.

- **A synchronised turbine no longer coasts to a stop, and the MWe gauge now reads the
  turbine instead of the reactor** (#284). Two defects in one file, with one cause: nothing
  in the plant model ever asked what the turbine was *admitted* as opposed to what the core
  *made*.

  **The rotor.** The rated-speed hold was gated on `generator_load > 0` — on the **load**,
  not on the **breaker**. So sliding the Manual load target to **0 MWe while synchronised**
  dropped the machine into the offline coastdown branch: measured, **1800 → 0 rpm over ~5
  plant-minutes**, with `turbine_tripped` false, `load_mode` still `manual`, and the breaker
  never opened. A synchronous machine tied to the grid spins at rated at any load, including
  zero — it motors rather than decelerates. The test is now the breaker
  (`RD.LoadMode.isOnLine`, new and shared), so the on-line case holds 1800 rpm and the
  offline case is untouched. That matters: the coastdown branch is load-bearing for **#235**,
  where cold Modes 3/5 spawn untripped with no load and no steam and used to pin 1800 rpm on
  a cold plant. Those ICs are authored `disconnected`, so they keep the coastdown and #235
  stays fixed — pinned from both sides by the new probe.

  **The gauge.** `mwe_output` was computed from `power_pct`, which ignores the governor and
  the steam dump entirely. During a load rejection the dump vents the difference to the
  condenser while the reactor stays up — so the board read **full electrical output for
  steam that never reached the turbine**. Measured, a `set_load_target 50 MWe` ask at hot
  full power settled at **98.8 MWe indicated with the dump at 48 %**: the operator asked for
  50 and the gauge said 99. It now follows `steam_flow_normalized` (turbine admission), and
  the same case reads **50.02 MWe**.

  **Calibration is preserved exactly.** `steam_flow_rated` is 1.0 in these normalized units
  and the governor sits at 100 % at rated pressure, so the new form is identical to the old
  at full power. Verified across every shipped initial condition — `hot_full_power` 100.0,
  `50_percent` 50.00, `5_percent` 6.36, `hot_zero_power` 0, `cold_shutdown` 0 — which is the
  table `Manuals/09` §12 publishes, unchanged. What moves is only the states where flux and
  turbine admission **disagree**: a rejection ride-out, an MSIV closure, and the decay-heat
  tail after a trip.

  Found while investigating **#138**, which is closed as stale in the same batch — no manual
  load step of any magnitude trips this plant (cuts of 10/35/39/50/80/100 MWe: no scram, no
  PORV lift).

- **The overfill/level contradiction in `abuse_porv_walkaway` is gone, and is now asserted**
  (#136, closing it). The probe used to end at **120 % primary inventory with 7 % pressurizer
  level** — an overfilled RCS whose level gauge read nearly empty. Re-measured: **120.0 %
  inventory / 100.0 % level**, solid, and the two gauges agree.

  **Fixed by #249, not by this issue.** `level_per_mass_surplus` was an underived 300, so
  `mass_max` clipped inventory *before* the gauge ran out of scale — indicated level could
  not express a surplus at all. Fitting it to real pressurizer geometry (776, the steam
  space as 5.8 % of RCS volume) is what made the overfill readable, and it is the same
  defect that was hiding a full accumulator dump behind an "arrived UNscrammed" check.

  **What this issue contributes is the guard it never had.** Both numbers were printed on
  an `info` line every single run and asserted on none, which is exactly how a
  contradiction that obvious survived three months. The probe now asserts that an
  overfilled RCS reads overfilled on *both* gauges (`run_ops` 334 → 335 passed). Verified
  by injection: restoring the pre-#249 gain reddens it at the defect’s own signature
  value — level pinned at **88.0 %**.

### Changed
- **Rewind is a checkpoint picker on a real-time cadence** (#137, closing it)
  *(OWNER, 2026-07-31: "I don't think there should be a rewind one step button. Make the user
  pick from the checkpoints on the graph. For long fast forwards we need a way to go back far
  enough. The rewind cadence should be 20 seconds real time not sim time.")*.

  **The cadence UNIT was the bug, not the interval.** Free-play checkpoints were laid every
  15 *sim* seconds, so the 32-slot ring always spanned the same amount of the plant's life and
  progressively less of yours. Measured, ring saturated: **465.9 real seconds at 1×, 46.5 at
  10×, 9.3 at 60×, 3.1 at 600×** — it evaporated in exactly the case (a long fast-forward)
  where reaching back is the point. On a 20-second wall clock the ring now spans **620.0 real
  seconds at every acceleration** (measured at 1×, 10× and 60×), and each slot simply covers
  more sim the faster you run — 12,000 sim s per slot at 600×, so ~103 plant-hours are
  reachable instead of 31 minutes. Measured off `tick()` rather than a timer, so a throttled or
  backgrounded tab lays its checkpoint on the first tick after the interval instead of losing
  it.

- **The ⏪ button no longer rewinds — it opens the picker, everywhere.** Free play already
  picked from the graph; the walkthrough, scenario and failure-card buttons still stepped back
  one checkpoint. All four now open pick mode, so the marks are the authored beat/step
  checkpoints inside instructed content and the periodic ones in free play. Escaping a failure
  card is a click on the decision point rather than repeated presses walking backwards. A
  rewind still discards everything after the moment you pick — deliberate, and now said in the
  timeline's scanner text: it is a teaching tool, not an undo.

### Fixed
- **Clicking the graph in rewind-pick mode landed on the wrong moment** (#137). The picker
  inverted `chartBuf`'s full 30-minute record while the plot drew only the selected window, so
  a click resolved against a time base up to 6× too wide. Measured in headless Edge: clicking
  the mark at **T+19 s** landed the plant at **T+0**. Both now read one `chartExtent()`, and
  the same click lands with **0.0 s** of error.
- **In pick mode the plot widens to cover the whole checkpoint ring** (#137). With a real-time
  cadence a fast-forward lays its checkpoints hours of sim apart while the widest window is 30
  minutes — every reachable checkpoint sat off the left edge and the picker had nothing to
  click. The x-axis switches to `h:mm:ss` past ten minutes so the widened span is readable.

- **The steam generator drains at a real plant's rate now** (#135, closing it). `K_sg_level`
  **5.0 → 1.37**. A total loss of main feedwater at full power used to take the plant from
  64.5 % steam generator level to the low-low trip in **12.9 s**, leaving **2.9 s** between
  the SG LVL LO warning and the scram. Now: warning at ~29 s, AFW auto-start at ~37 s, trip
  at ~40 s — about **11 s** of warning.

  **Fitted to a real transient, not chosen.** Ginna UFSAR Chapter 15, Table 15.2-4, *"TIME
  SEQUENCE OF EVENTS FOR LOSS OF NORMAL FEEDWATER FLOW"* (NRC ADAMS ML20339A101, Rev 29
  11/2020): main feedwater stops at 20 s, low-low level trip setpoint reached at 55 s — **35
  s**. This plant runs 65 % nominal and trips at 17 %, so 48 points of span over 35 s =
  1.37 %/s. What is fitted is the **time**, not the geometry.

  **The issue's own proposed fix could not have worked.** #135 filed this as "a setpoint/lag
  question… not a physics change". The setpoints are 13 points apart on a level that was
  falling at 4.7 %/s, so no spacing change buys more than a few seconds. The cause was that
  the entire narrow range held **twenty seconds of full-power steaming**.

  **Control got better, not worse** — measured, before/after: steady hold over 30 min 2.35 →
  2.11 points of band; a 100 → 80 MWe ramp swings 9.8 → 5.4 points and settles closer to
  nominal. A lower level-per-imbalance gain swings less for the same flow mismatch, so the
  three-element feed controller needed no retuning.

  **You still cannot save the transient, and that is correct.** Restoring feed the instant
  the alarm arrives still trips, at 40.6 s — a real loss of normal feedwater trips the
  reactor on low-low level, and that is the credited protection for the event. The window is
  for reading the board, not for chasing the trip. Manual set **Rev 22**: **07 PWR-E01** now
  carries a *Timing — what to expect* section saying exactly that.

  **The finding behind the finding:** a 3.6× change to a physics constant left **all 32
  gates green**. Nothing asserted how fast a steam generator empties. New probe **TR-14**
  (`run_behavior` 38 → 39) pins the sourced anchor and fails at 13.0 s on the old value. One
  gate did move — `verify_e2e_ui`'s post-trip sample time, a fixture calibrated to the old
  drain rate — and the new sample point was validated against the **old** behaviour too, so
  it is a better test rather than a refit.

- **Settings tab trimmed** (#277). Removed **Values**, **Terminology**, and **Physics
  Overlay** — unused on the shipping PWR board. Units, fast-forward dropout, and About
  remain.

### Added
- **You can reset the SCRAM now, and the board tells you what is holding it** (#75, closing
  it). After a trip the SCRAM control reads **SCRAMMED** and becomes the RPS reset: press it
  and the reactor trip breakers re-close. It does **not** withdraw rods or restart the
  reactor — the rods stay where they are until you deliberately withdraw them under the
  startup net.
- **You can click the pressuriser relief valve open and shut** (#125).

  The PORV on the board has always looked clickable — it highlights under the pointer
  and shows a hand cursor — but nothing was wired behind it, so the click did nothing.
  It now works: click to lift the valve, click again to shut it.

  Giving the operator that switch needed care, because the same command was doing two
  unrelated jobs. A real relief valve has two separate inputs to one solenoid: the
  automatic signal that lifts it on high pressure, and the operator's switch on the
  panel. Here they were the same command, so there was no way to hand the operator a
  switch without also handing them the automatic protection — and no way for a training
  scenario to take the switch away without disabling relief along with it.

  They are separate now. **Scenarios can lock out the manual switch**, and the Three Mile
  Island scenarios do: that accident turns on not being able to tell an open valve from a
  shut one, and it stops teaching anything if you can sit on the switch and work the valve
  yourself. Locking the switch does **not** disable relief — the valve still lifts on high
  pressure exactly as before, which is measured and gated rather than assumed. Closing is
  never locked, because closing it is the Three Mile Island action itself, and watching
  that fail against a stuck valve is the entire lesson.

### Fixed
- **Alarm tiles told you the wrong system for a third of the alarms** (#157).

  Every alarm tile carries a system family on its second line — *coolant · warning ·
  unacknowledged*. That family was never recorded anywhere; the interface guessed it by
  looking for keywords in the alarm's internal name. Measured, it was wrong or arguable
  for **13 of the pressurised-water reactor's 33 alarms**.

  The guesses failed in ways nobody could see. *CHG FLOW HI* was filed under safety
  systems rather than coolant, because the word "flow" is in the label an operator reads
  and not in the internal name the guesswork read. *SUR HI* — a reactivity alarm on both
  the pressurised-water reactor and the RBMK — matched nothing at all and fell through to
  safety systems. *SG PRESS HI* matched "press" and was filed as coolant even though it is
  secondary steam. Renaming any alarm could silently re-file it.

  Each alarm now states its own family, next to the panel it annunciates on. There is
  deliberately no fallback guess: an alarm that fails to state one shows a dash and fails
  the build, rather than quietly showing a plausible answer that happens to be wrong.

- **Resetting the reactor protection system on the RBMK or the BWR blamed the rods for
  something that was not their fault** (#228).

  After a scram, the trip breakers reset only once the rods are fully in — a real
  interlock, and the simulator models it. On those two plants the reset was refused with
  *"trip breakers reset only with all rods inserted"* **while every rod read 0.0 %**, fully
  inserted. There was no way to clear the scram, and the message pointed at the one thing
  that was already correct.

  The cause was two layers deep. The shared control system had always sent the reset
  command to the reactor, but only the pressurised-water reactor knew what to do with it;
  the other two answered "I do not understand that", the control system discarded the
  reply, and then inferred a reason from the fact that the plant was still tripped. Both
  reactors now implement the reset, and a reply the control system cannot act on is passed
  back to you instead of being replaced by a guess.

  Filed as a latent problem on the grounds that those plants have no control panel yet.
  Measuring it showed it was not latent in the way the report assumed — the refusal was
  already reachable, and already wrong.

### Added
- **The board now tells you to isolate the accumulators — SI ACCUM ALIGNED < 1000 PSI**
  (#273, closing it). A caution annunciator on panel B at **1000 psi (6.895 MPa)**, and the
  first alarm in the plant **gated on a lineup as well as a reading**: it also requires the
  discharge isolation valve indication to read *open*, so a correctly-isolated Mode 5 plant —
  which sits below that pressure all day — never sees it. Isolate and it clears; isolate on
  schedule and it never comes in.

  **The button had said "PRESS TO RESET" since the day it was built, and it did nothing.**
  Not "did nothing useful" — the handler was an empty stub carrying a comment claiming no
  engine reset command existed. One did: the engine has had `reset_rps` with its rods-in
  interlock, and the control layer its permissive, for as long as the button has drawn that
  caption. The three had simply never been joined. An operator pressed it and got no reset,
  no refusal and no message at all.

  **The refusal was invisible even in code.** The kernel returned a `type: 'refused'` shape
  that *nothing in the repository read* — not the service, not the UI, not a test, not the
  spec. Measured: an early press returned a perfectly good labelled refusal straight into a
  branch that does not exist. It now returns the same `blocked` + `INTERLOCK` shape every
  other plant interlock uses, so the reason reaches the scanner bar through the path that
  was already there.

  **The permissive is now readable BEFORE you press.** Two conditions gate the reset — no
  trip signal standing (a breaker will not hold in against a live trip signal) and rods at
  bottom — and the caption under SCRAMMED names whichever is holding: *TRIP SIGNAL STANDING*,
  *RODS NOT AT BOTTOM*, or *PRESS TO RESET* when it will take. One evaluator answers both the
  caption and the press, so the board cannot promise a reset the plant will refuse. Measured
  on a hot-full-power scram: the turbine trip holds it for the first second, rod bottom for
  about two more, and it is available from roughly t+4 s.

  **The teaching case is the point.** A trip you have not actually fixed keeps the plant
  latched — after a loss of feedwater the reset stays blocked on *low steam generator level*
  until the heat sink is restored, and after a large LOCA on *low reactor coolant pressure*.
  Recovery is procedural, not a button. Documented as a control in **03 §3.5.1** (manual set
  **Rev 20**), with **06 PWR-A01** Recovery pointing at it.

  Three things worth knowing. Rod bottom is a new **`rods_fully_in` status word**, so the
  permissive reads an indication rather than engine truth (HR1) and shares one threshold
  constant with the engine's own interlock — they cannot drift apart. The permissive itself
  is **plant config** (`rps_reset_permissive` in `pwr_control.js`), so the shared kernel
  stays plant-agnostic and #228's existing `reset_rps` leak was not widened — `run_hr3` is
  unmoved at 29. And the first cut of the tests **missed the rod-bottom window entirely**:
  injection proved the whole permissive config could be deleted with every check still
  green, because the standing turbine trip covers the first half-second and the rods are
  down before the later checks run. A check now sits inside that window.

  Gated: `run_e2e_controls` **39 → 59**, `board_check` **138 → 143**. All 25 new checks
  driven red by injection, including the original defect — restoring the empty handler
  reddens the board harness.

### Fixed
- **Two shipped releases were still filed as unreleased, and the roll is now gated.** Alpha
  **1.10.0** and **1.11.0** both merged to `main` without their `## [Unreleased]` heading being
  renamed, so 434 lines covering two releases sat in this file as work-in-flight and the newest
  version heading read **1.9.0** — two versions behind the site. Both are now rolled, dated
  **2026-07-30** to match `changelog.html`.

  **The boundaries were not guessed.** Entries had been inserted at the top of existing
  `### Added` / `### Fixed` subsections rather than appended, so the two releases were
  interleaved, not stacked. The split comes from diffing this file's `[Unreleased]` block as it
  stood at tags `v1.10.0` and `v1.11.0` against `HEAD`, which puts the seam between #271
  (armed-protection alarm bands, 1.11.0) and #263 (the moderator re-fit, 1.10.0) — and
  `changelog.html`'s own two entries, written at the time and never touched since, split at
  exactly the same place. Verified content-neutral: sorted non-blank lines before and after
  differ by precisely the four heading lines added, nothing moved between releases.

  **Gated by the new `test/run_release.js` (18 checks).** `site/release.js`, `changelog.html`
  and this file must agree on what shipped: the newest version heading here must be the string
  in `release.js`, dates must match across both changelogs, both must be newest-first, and
  `[Unreleased]` must exist exactly once and sit above everything. It survives being skipped
  precisely because **nothing downstream reads these headings** — the file renders and reads
  plausibly either way — so a note was never going to be enough; CLAUDE.md and the release
  skill both already said to do it. Proven against the **real** pre-fix file rather than a
  synthetic one: 3 checks red, naming both missing versions. All 18 driven red by injection.

- **The offline download arrives with a NAME on it** (#275, closing it). The Download page's
  button saved the file as **`latest.zip`** — no product, no *Alpha*, no version, and
  indistinguishable from the copy you pulled three releases ago once it is sitting in a
  downloads folder. It now saves as **`Reactor_Dynamics_Alpha_1.11.0.zip`**, which is the
  same name `site/make_download.js` gives the versioned copy it writes at every deploy.
  Measured in headless Edge from `file://`: `download="Reactor_Dynamics_Alpha_1.11.0.zip"`.

  The `href` deliberately still points at the stable `download/latest.zip`, so **no
  per-release edit was added** — the saved name is stamped from `site/release.js` (the one
  hand-edited version string) by `site/nav.js`, which already does exactly this for the
  footer's build stamp. With JS off the bare `download` attribute in the markup still saves,
  as `latest.zip`, i.e. today's behaviour: the failure mode is *no worse than before*, not
  *a wrong version number*. The zip's **contents** were always named correctly
  (`Reactor_Dynamics_Alpha_1.11.0.html`); only the wrapper was anonymous.

  **`test/run_portable.js` gained a DOWNLOAD section (116 → 123 checks)** because every part
  of this fails silently — drop the `release.js` tag, rename the anchor, or change the
  filename prefix in one of the two places that spell it, and the button still works, still
  downloads, and quietly hands out the wrong name. It pins the id, the stable href, the no-JS
  fallback, the script *order* (nav.js reads `RD_RELEASE` at `DOMContentLoaded`), the stamp
  itself, that `nav.js` and `make_download.js` build the identical name, and that
  `RD_RELEASE` is a full `Alpha X.Y.Z`. All seven were proven to go **red by injection**
  before being counted green.

## [Pre-launch 1.11.0] — 2026-07-30

### Added
- **Settings → About: Disclaimer, License, and Changelog popups** (#259). The portable
  single-file build is only the control room, so a recipient offline had no route to the
  alpha disclaimer, the licence, or the player-facing changelog. Those three open as
  in-app modals; content is packed from `legal.html` / `changelog.html` by
  `node tools/pack_site_docs.js` into `ui/site_docs.js` (same pattern as the manuals).
  The logo version chip also opens the changelog.

- **The board now tells you to isolate the accumulators — SI ACCUM ALIGNED < 1000 PSI**
  (#273, closing it). A caution annunciator on panel B at **1000 psi (6.895 MPa)**, and the
  first alarm in the plant **gated on a lineup as well as a reading**: it also requires the
  discharge isolation valve indication to read *open*, so a correctly-isolated Mode 5 plant —
  which sits below that pressure all day — never sees it. Isolate and it clears; isolate on
  schedule and it never comes in.

  **There is no autoclose interlock, and that is the decision, not an omission.** Real plants
  power these valves *open* and remove control power to prevent inadvertent closure; the
  closure is the operator's, made off RCS pressure indication. An automatic closure keyed on
  falling pressure would also shut the accumulators during a LOCA, which is exactly when they
  must inject. The tile therefore states a lineup rather than an order — on a LOCA the same
  annunciation means the opposite thing.

  **Measured, and worth knowing before you rely on it:** on a brisk cooldown the cue precedes
  the first discharge by about **one minute of plant time** — under two seconds of wall clock
  at 30×. The procedure step is the defence; the annunciator is the backstop and the
  post-mortem. Both compressed rates behind that number, and the 22–440× ECCS injection
  pacing, are now declared in **12 §14.1**.

### Fixed
- **The heatup procedure re-aligns the accumulators** (#276) — `04` PWR-N03 step 4. The cold
  lineup ships with them isolated and **nothing opens them automatically**: re-alignment is
  procedural by design *(OWNER RULING, 2026-07-30: "lets leave opening of the accumulators to
  the procedure instead of auto opening them.")*, so the procedure is the only thing that
  catches it. Skip the step and you reach Mode 1 with no passive injection. The **SI ACCUM
  ALIGNED** annunciator does **not** cover this — it clears on shut tanks, so it is silent on
  exactly this case, and its card now says so.

- **The cooldown procedures now tell you to isolate the accumulators** (#273) — manual set
  **Rev 17**. `04` PWR-N15 and `05` Phase C both descended past the accumulators' 600 psi
  (4.14 MPa) cover gas without a word about them; neither chapter contained the term. Both
  now carry an isolation step at **1000 psi (6.895 MPa)** (NUREG-1431 LCO 3.5.1
  applicability; LTOP SR 3.4.12.3), with the note that these are passive tanks and that the
  SI block set entering the cooldown blocks *pumps*, not them. `05` Phase A gained the
  matching **re-align** step — the cold lineup ships with the accumulators isolated and
  nothing in the manual set had ever opened them again. The isolation pressure is now one
  number across the manual, the scenario trigger and the campaign driver.

- **When an automatic controller switched itself off, the board never said why** (#214).

  Every automatic control carries a one-line account of what it is doing — and, when it
  stands itself down, the reason. None of it was on screen anywhere. The panel that used
  to print it was removed when the automatic controls moved onto the board diagram, and
  nothing replaced it, so the explanations had been written into a dead end.

  This matters most in the case it was written for. Isolate main feedwater and the
  three-element level controller drops out on its own — correctly, auxiliary feedwater
  now has the steam generators — but all you saw was the AUTO light going dark and the
  MANUAL light coming on, with nothing to say why your level control had just abandoned
  you. Hovering any automatic control now reports what its channel is doing, in the
  System Scanner block, under the description: **MANUAL — off — main feedwater isolated
  (AFW has the SGs)**.

  The feed card also carries a permanent status word in its top-right corner —
  **HOLDING** in green when the controller is actually regulating, amber for everything
  else: **ISOLATED**, **MANUAL**, **OFF**, and **SAT HI / SAT LO**. That last pair is the
  one worth knowing about. It means the controller is still in AUTO and still trying, but
  the feed pump is against a stop and there is nothing left to correct with — the AUTO
  light says you are covered when you are not. The card title was shortened to *SG FEED*
  to make room, the way the steam dump status already sits in its corner.

  Two things had to be true for that to be worth showing. The line follows the plant
  while you hold the pointer still — the scanner otherwise only repaints when the pointer
  moves, so a controller that tripped out while you were reading about it would have gone
  on reporting the state it was in when you arrived. And the reason is now retired when it
  stops being true: restore feedwater and the message clears instead of insisting the
  plant is still isolated. The controller stays off either way — standing it back up is
  the operator's call, which is the entire point of a stand-down.

- **Continuous integration had been red on every run for three days, across two releases**
  (#191).

  The GitHub Actions gate ran `run_all.js --fast`, which skips the runners marked slow so
  that no browser has to be downloaded. Three test runners need a browser, not two — and
  the third, `verify_flags_ui`, is not marked slow because it only takes 8 seconds. So it
  ran, found no browser, and failed. Every run from **2026-07-28 20:49 UTC** — one hour
  after that runner was added — to 2026-07-31 was red: **32 consecutive failures**,
  including the push to `main` for Alpha 1.10.0 and the #272 release pull request. Every
  other runner passed on every one of them; the gate was correctly reporting a real drift,
  and the drift was in the workflow.

  It now runs the **full 33-runner gate with all three browser gates**, in about 8 minutes.
  The reason it did not before was the belief that a browser in continuous integration
  requires adding an npm manifest to a project that has deliberately never had one. It does
  not: the browser is installed into a scratch directory outside the checkout and copied
  into the ignored `node_modules/`, which is exactly how the local machines are already set
  up. A step in the workflow fails the build if a manifest ever appears in the repository
  root, so that property cannot be given up by accident.

- **The pressurizer could not go water-solid on injection — the exact thing Three Mile
  Island is about** (#249) — and the clamp that caused it was hiding a second bug.

  Emergency injection into an intact reactor coolant system pinned indicated pressurizer
  level at exactly **88.00 %** and left it there forever. Not a slow fill: a hard stop. The
  level term for surplus inventory was set to a number nobody had ever derived, so the
  model ran out of inventory headroom before the gauge ran out of scale. It is now fitted to
  real geometry — the pressurizer steam space is **5.8 %** of reactor coolant system volume
  (Beaver Valley 2 UFSAR Tables 5.1-1/5.4-12, plus the Westinghouse systems manual's
  full-power steam fraction), and that is the whole distance between normal level and solid.
  Measured, injection now carries the level to **100 %**, through the 97 % high-level trip,
  the way the procedure's own caution says it will.

- **The by-the-book cooldown dumped all four safety-injection accumulators** (#273).

  Taking the plant from Hot Standby to Cold Shutdown walked straight past the accumulators'
  **600 psi (4.14 MPa)** nitrogen cover pressure with their discharge valve still open, so
  every tank emptied itself into the reactor coolant system. The plant arrived at Cold
  Shutdown with **no passive injection left**, boron dragged to **2,310 ppm**, and the
  coolant system overfilled. Nothing on the board was wrong — but nothing told you to
  isolate them, and blocking Safety Injection at the start of the cooldown does not cover
  them (that blocks pumps; these are pressure and a check valve).

  The cooldown now has an isolation step at **1000 psig (6.89 MPa)**, which is where a real
  plant stops requiring the accumulators available (NRC Standard Technical Specifications
  LCO 3.5.1, and the low-temperature overpressure lineup that requires them isolated).

### Added
- **A gate that asks whether the plant can reach its own trip setpoints.** The two bugs
  above went unseen because a test asserted the reactor "never tripped" on a gauge that
  could not physically get to the trip point. `test/run_reachability.js` checks both halves:
  every one of the 50 protection and alarm thresholds sits inside its instrument's range,
  and the ones that matter are driven on the real plant until the needle actually crosses.
- **A cold plant read as a scram on the pressure gauge, and the nuclear instruments never
  showed their trip points** (#270, #271) — the rest of the work #267 started. Every board
  indication now follows the protection that is **actually armed**, not the setpoint table.

  On a depressurized plant the P-11 permissive blocks the low-pressure reactor trip and the
  safety-injection signal with it. PRIMARY PRESSURE painted the red band anyway, and the
  damage went further than a stale colour: at Cold Shutdown the marker sat **off the gauge
  entirely** and the normal band inverted itself, so a perfectly correct **363 psi
  (2.50 MPa)** read as **trip red** while the alarm list beside it said *"Pressurizer
  Pressure Low — expected, plant depressurized"*. The tile now collapses the low band, reads
  `LO TRIP BLKD`, and rescales to the pressure you are actually holding on heaters —
  pressurize past **1972 psi (13.60 MPa)** and the block reinstates itself and the red band
  comes back. A LOCA is unaffected: those trips stay armed all the way down, so a hot plant
  losing pressure still reads hard red. Same number, opposite meanings.

  The **source range, intermediate range and startup rate** readouts were bare numbers. Two
  of the three rungs of the startup net lived there and neither was visible — the source
  range went amber at its handoff caution but marked its **1e5 cps** trip no differently, and
  the intermediate range's trip, the one that catches a missed block, showed nothing at all.
  All three now colour against their live limits: amber approaching, red at the limit, and
  **grey once the trip is blocked or the detector is secured** — because a defeated trip is
  not something you can run into, and saying otherwise would teach the opposite of what
  blocking it accomplished.
- **The reactor power gauge showed a 120 % trip while the plant was set to trip at 25 %**
  (#267). Through a startup the power-range **low setpoint** reactor trip is armed at
  **25 %**, and it can only be blocked once you are above the P-10 permissive at **10 %**.
  The gauge never showed it: the tile took the *first* power trip in the protection table,
  which happens to be the 120 % backstop, so an operator climbing out of Mode 3 read green
  all the way to a scram at a fifth of the indicated limit. Measured — with the low setpoint
  armed, **26 % scrams and 24 % does not**.

  The tile now follows whichever power trip is actually armed. While the low setpoint is
  live the meter reads to 27 % and lays out the startup ladder: **green to P-10 (10 %),
  amber from there up to the trip — that amber band is the window in which blocking is
  permitted — and red above 25 %**, with a red `TRIP 25%` annotation naming the limit. Block
  the trip and the meter reopens to the at-power scale with 120 % at the top and the
  annotation clears; drop back below P-10 and the block reinstates itself and the band comes
  back with it. **At power nothing changed** — the bands are identical to before.

## [Pre-launch 1.10.0] — 2026-07-30

### Fixed
- **The moderator model was re-fitted to measured plant data, and the reactor is more
  self-regulating than it was yesterday** (#263). The previous fix (#260) took the
  boron dependence of the moderator coefficient from a written statement in a training
  manual; that manual's own figure disagreed with it. The **BEAVRS / Watts Bar Unit 1
  Cycle 1 startup physics tests** publish three *measured* temperature coefficients at
  three boron concentrations, and they settle it — #260's value was **4.3× too negative**
  at the all-rods-out condition.

  Both parameters are now least-squares fitted to those measurements, reproducing all
  three to within 0.09 pcm/°F. **The coefficient at full power is 34 % stronger**
  (−20 → −26.8 pcm/°C), which supersedes an earlier tuning ruling: the core now fights a
  rod withdrawal harder, so a small withdrawal at power shows up as **temperature rather
  than power** — which is what a real plant does, since the turbine sets power and the
  rods set temperature.

  For an operator: critical boron runs **806 → 587 ppm** across a heatup with the control
  bank in (spread 556 → 219 ppm since #260 began), differential boron worth is
  **19.9 pcm/ppm cold against 10.5 at power**, and a runaway on the startup challenge
  self-limits more, so overshooting the band takes more banked reactivity than it did.
  Nothing in the reactivity curve is set by preference any more.
- **The operator manuals' revision history was two weeks and six changes out of date.** Five
  entries were missing — the low-flow trip's new instrument and setpoint, the pump-heat heatup
  that re-authored two chapters, the reactivity recalibration and its new Estimated Critical
  Condition table, the charging/letdown flow correction, and the reactivity curve's second
  anchor. Every one of those changed numbers an operator reads. Ten of the thirteen documents
  also still said "Revision 0", and the contents page said Revision 2 from two weeks earlier.
  All five entries are now written, the revision is a single set-wide number carried by every
  document, and the history table reads newest-first throughout — it had been half ascending
  and half descending, so there was no clear place to add a new entry. A gate now fails if a
  chapter is edited without recording it.
- **The manual quoted a charging and letdown flow the board never showed.** Section 12 said
  **40 gpm** maximum charging and **20 gpm** normal letdown, where the board's charging box tops
  out at **60 gpm** and its orifice-A letdown reads **30 gpm**. Two conversion scales were being
  kept in two separate files and had drifted 1.5 × apart, with the manual quoting the one no code
  reads. The manual now matches the board, and a gate cross-checks the two so they cannot
  separate again. **No displayed value changed** — only the documentation that was wrong about it.
  Section 12 also now says plainly that these gallons-per-minute figures are display flavour for
  pacing, not physical flow rates to be measured against a real plant.
- **The moderator temperature coefficient is no longer a constant, and the reactor no longer
  goes critical cold at 600 ppm** (#260). A single MTC of −11.1 pcm/°F (−20 pcm/°C) was
  applied from 122 °F (50 °C) all the way to 579 °F (304 °C). Over a Mode 5 → Mode 3 heatup
  that integrates to a **−4944 pcm** moderator defect — 494 ppm of dilution to buy back, a
  third of it charged below 274 °F (134 °C) — and it collapsed critical boron from 819 ppm
  cold to 263 ppm hot. Found in free play: at **2235 psi (15.41 MPa) and 274 °F (134.4 °C)**,
  diluting toward **600 ppm** — a number that looks safe next to the hot end — took the
  reactor critical and tripped it on source-range high flux. The trip was correct; the reason
  600 ppm was critical was not.

  Moderator reactivity now tracks moderator **density**, so the coefficient steepens as the
  plant heats and weakens as boron rises, both sourced to WTSM 2.1 *Reactor Physics Review*
  (ML11223A207) Figure 2.1-8. Rod worths went to the measured values in WTSM 2.2
  (ML11216A051) Table 2.2-1 — control banks **8500 → 4068 pcm**, shutdown **10 000 →
  3676 pcm** (all RCCAs 7744; the old 18 500 was 2.4× anything sourceable). Core excess
  reactivity is now **solved**, not tuned, so hot-zero-power all-rods-out critical boron lands
  on the **975 ppm** measured in the BEAVRS / Watts Bar Unit 1 Cycle 1 physics tests.

  For an operator: critical boron now runs **834 → 575 ppm** across a heatup with the control
  bank in (was 819 → 263), and **1130 → 975 ppm** all-rods-out. Boron is held roughly
  constant through the heatup and the dilution is done hot, which is what a real startup does.
  Differential boron worth is now larger cold (13.8 pcm/ppm at 122 °F against 10.0 at power),
  which falls out of the density model rather than being tuned in.

  **Two procedures were re-authored** because the plant changed under them (HR9). `pwr_startup`:
  the 1/M withdrawal bursts are now 138/90/44/22/12 steps (criticality moved from step 224 to
  318). `pwr_heatup`: the authored dilution drove a runaway to 119 % power and 638 °F on the
  new model, so it is gentler — the ride now tops out near 7 % instead of 10–30 %, which is
  the prototypical shape for a nuclear heatup, and the two startup-trip blocking steps became
  precautionary rather than load-bearing.

### Changed
- **The plant can now heat itself up from cold on pump heat alone, with the reactor never
  started** (#251). The steam generator used to subtract reactor-coolant-pump heat out of its
  own steam balance — a correction term sized to cancel pump heat exactly, because the turbine
  drew steam for core power only and the extra 0.55 % had nowhere to go. The side effect nobody
  had costed: a heatup on pump heat was *mathematically impossible*, stalling dead at
  **218.69 °F (103.72 °C)** forever. The turbine's demand now includes pump heat and the SG
  boils off everything that crosses it, with rated steam flow defined against NSSS rated heat
  (core + pump) the way a real plant rates its generators. Measured: Mode 5 → Mode 3 in
  **10.71 plant-hours** at an average **39.8 °F/hr (22.1 °C/hr)** with **no rod motion at all**,
  arriving at 548 °F (286.7 °C) and −6287 pcm. Full-power behaviour is unchanged to two
  decimal places.
- **A cold plant is no longer synchronised to the grid.** The Mode 3 and Mode 5 initial
  conditions spawned with the turbine in load-follow and the generator carrying 1e-6 of load,
  while the rotor sat at rest — half-fixed in an earlier change. They now spawn properly off
  line (breaker open, planned offline, not tripped). This mattered the moment pump heat became
  real: a following governor cracks open and drains the heatup.
- **"The Big Warm-Up" (Mode 5 → Mode 3) has been re-authored around the real evolution.** It no
  longer takes the reactor critical to warm the plant up. Pressurize, start the pumps, bottle
  the steam generator, and ride the temperature up on pump heat — arriving hot and *still
  subcritical*, which is what Hot Standby actually means. The approach to criticality moved out
  to the missions that already teach it.
- **The low-flow reactor trip now fires at 90 % of rated flow, not 25 %** (#248). This is the
  real Westinghouse setpoint, and the block permissive moved to the real P-7 (10 % power).
  Measured on an RCP trip from full power: the trip now fires at **1.8 s**, where DNB onset
  is at **10.9 s** — it protects the core about nine seconds before the hot channel can boil.
  The old 25 % fired at 16.2 s, roughly five seconds *after* DNB began; its entire practical
  effect was to let the core boil first. Scanned for spurious trips: small LOCA, stuck-open
  PORV and SGTR never drop flow below 90 % at all, and the large LOCA has already scrammed on
  low pressure three seconds before it gets there. The TMI flagship is untouched.
- **"Loss of Coolant Flow" has been re-authored around a stuck flow transmitter.** With the
  faster trip a healthy plant simply trips in under two seconds and nothing happens — the old
  lesson (*hesitate and it boils*) became unreachable, correctly, because no real plant lets
  flow coast to a quarter of rated. So the scenario now trips the pump **and** sticks its flow
  channel at 100 %. The low-flow trip never fires at all; the core boils, and the reactor is
  finally caught 35 s later by the **high-pressure** trip — a different instrument catching a
  consequence. Subcooling margin is the indication still telling the truth. The lesson is no
  longer "trip fast", it is **"a single-channel trip is exactly as trustworthy as its one
  transmitter"**, which is what real plants answer with three detectors per loop and 2-of-3
  coincidence.

### Added
- **A portable single-file build — the whole control room as one `.html` you can email.**
  `node tools/make_portable.js` inlines all **94 scripts and 2 stylesheets** that
  `ui/shell.html` loads, in document order, into one **2.55 MB** self-contained file that
  runs by double-clicking: no server, no install, no network, no unzipping into the right
  folder. Measured in headless Edge: the bundle issues **1 network request — itself** — and
  reaches a state identical to the multi-file build across all 60 sampled board values
  (reactor power 0.8 %, T-avg 558 °F (292 °C), primary 1068 psi (7.36 MPa), 8 alarms) after
  the same stuck-PORV injection, with **zero page errors**.
  Nothing about the simulator had to change to make this work: every runtime file is
  already a plain global-namespace script, there is no `fetch` anywhere in the codebase, the
  operator's manual is pre-packed into `ui/manual_md.js`, and there are **no images and no
  web fonts at all**. The sim could always run from `file://` — what it could not do was
  travel as a single attachment. Three fixups are all the bundler adds: the two Vercel
  analytics beacons are dropped (declared, with reasons — an undeclared external tag is a
  hard build error, never a warning), the logo's `../index.html` link is repointed at the
  public site since a single file has no sibling landing page, and the ⚛️ favicon is
  embedded as a `data:` URI so an emailed file still gets a labelled browser tab.
  The build is **not minified** — the source stays readable, which is also what keeps
  AGPL §13 honest when the file is handed to someone. Output goes to the gitignored `dist/`.
  *Emailing it: ZIP it first — several mail providers silently strip `.html` attachments.*
- **`test/run_portable.js` guards the offline build** (**112 checks**). The single-file build
  works only because of a property no other gate asserted: **nothing in the runtime loads
  anything at runtime.** That is the kind of property that dies quietly — a
  `fetch('Manuals/12.md')` added for an excellent reason leaves every other gate green and
  the deployed site perfect, and breaks the *emailed* file on a stranger's machine where
  nobody will ever report it. The gate scans exactly the assets `ui/shell.html` ships (read
  out of the file, so it widens itself when a script is added) for 13 load patterns, checks
  the stylesheets for web fonts and for relative `url()`s that would break once inlined,
  then **builds the bundle and asserts the deliverable itself** has no loading attribute
  left. Verified by injection rather than by passing: a `fetch`, a CDN `<script>`, an
  `@font-face`, an `<img src>` and an ES `export` each turn it red on the matching check.
- **RCS Loop Flow is now an instrument, and the low-flow reactor trip reads it** (#247).
  The trip that protects the core against a loss of forced flow used to read **true**
  coolant flow directly — it could not lag, could not drift, and could not be fooled by a
  failed transmitter. On a simulator built around the premise that instruments lie, that
  made the single most safety-significant trip on the plant **impossible to train on**. It
  was carried for two years as "the one documented HR1 exception"; it was not an exception,
  it was an instrument nobody had built.
  `rcs_flow` models the real measurement — **elbow taps** on the crossover-leg 90° elbow,
  reading differential pressure across the bend (ΔP ∝ flow²), nothing inserted into the flow
  path. It reads in **% of rated**, lags 1 s, appears as an **RCS Flow** trend, and accepts
  the full failure set. The setpoint is unchanged at **25 % of rated**.
  What this buys, measured end to end: inject a **stuck-high** flow transmitter, trip the
  RCP, and the flow indication sits at 100 % while the true flow reaches zero — **the
  low-flow trip never fires**, and the reactor is eventually caught by high primary pressure
  instead, several seconds later and for a different reason. That is a genuine new event to
  train on, and it was unreachable before.
- **Main feedwater isolation valve position indication** (#247). The three-element feed
  channel is supposed to stand down when main feed isolates, handing the steam generators to
  AFW. It read a true-state field that **`getTrueState()` has never exposed**, so the value
  was always undefined and the stand-down had **never once fired** in any session. It now
  reads MFIV position, and the channel drops out with the note *"off — main feedwater
  isolated (AFW has the SGs)"*.
- **Feedback (💬) is now an email address, not a form** *(owner, 2026-07-29)*. The overlay used to
  collect a category, a description and an optional reply address, then package the lot as a JSON
  file the player downloaded — against a planned `POST /api/feedback` that was never built, so the
  report landed in their downloads folder and nowhere anyone reads. It now shows
  **reactordynamics@gmail.com** as a `mailto:` link with a copy button, a line on what makes a
  report easy to act on, and the build stamp to quote.
  The **session diagnostics download stays**, as a single button. It is the only place that bundle
  is reachable from — the `export-diag` action has no button of its own — and it is worth attaching
  to a bug report. Same rule as before: telemetry comes only from the live session recorder, never
  from a user-supplied file.

### Fixed
- **The full-stack procedure gate was running half its procedures at a tenth of their declared
  speed (#245).** `test/run_procedures_stack.js` set `timeAcceleration = 10` once at setup.
  `SimulationService._attentionStop` then did its job — the first alarm or scram on a quiet
  board snaps fast-forward back to real time so a human is not left behind the plant — and
  nothing put it back. Measured: **11 of the 22 procedures** ran below 10× from as early as
  **t = 2 s**, one of them for 416 consecutive ticks. Every step assertion downstream of that
  point was being judged on a tenth of the sim time its author declared.
  Fixed with `svc.attentionStops = false` — the dropout is a comfort feature for a human at
  the board and a headless gate has no one to protect; `run_autoctl` had already reached the
  same conclusion by another route — plus a new per-procedure assertion that the run actually
  held its declared acceleration, so the harness can no longer claim 10× in its header while
  the runs underneath it disagree. The mechanism itself stays covered by `run_m5`.
  **Four "RBMK/BWR plant defects" were this bug.** `bwr_startup` step 2 was already known
  (#240 follow-up); `rbmk_mcp_trip` step 2 on both RBMK versions and `bwr_sbo_rcic` step 3
  (vessel level 25.4 % vs a required 40) join it — power had a tenth of the time to fall after
  the pump trip, RCIC a tenth of the time to refill. All three pass on the sim time alone.
  That is a green establishing the *mechanism*, not a clean bill of health for either plant:
  both are on hold and nobody has re-derived those steps from the plant.
  It also caught a stale PWR assertion. `pwr_stuck_porv` step 1 asserted `core_inventory_pct
  < 100` at the end of a 30 s hold. Inventory does fall — 99.65 → 98.01 % by t = 6 s — but
  automatic HPI actuates at 10.5 MPa and refills past nominal (117.6 % by t = 16 s, pressurizer
  at 88 %, subcooling gone). That is the plant doing the right thing; it is TMI's own trap, the
  solid pressurizer that invites throttling injection, which this procedure's caution warns
  about. The step now asserts the leak was *seen* and checks subcooling — the diagnosis signal
  its own text points the player at — at the end.
  Baselines move with the fix: `run_procedures_stack` **22/22 155/155 → 178/178** (+22 the new
  acceleration assertion, +1 the split above), strict xfails **5 → 2**; `run_procedures`
  **101/101 → 102/102**.

### Removed
- **The V1 PWR board is gone (#246).** `ui/diagram/pwr_synoptic.js` (~100 KB) and
  `pwr_synoptic.css` were superseded by the V2 board in `ui/diagram/board/` months ago, but
  they were still parsed on every control-room load and never mounted. Deleted, along with
  their dev harness `ui/test_panel/synoptic_check.html`, which could only exercise the
  deleted module. The three `RD.PwrBoard || RD.PwrSynoptic` fallbacks in `ui/app.js`
  collapse to `RD.PwrBoard` — the only PWR display there has been for some time.
  Two pieces did **not** go with it. The four `.app.pwr-synoptic` rules at the top of the
  V1 stylesheet were shell hooks keyed on the `.app` class, not V1 board styling, and the
  V2 board needs them (`.view-area { padding: 0 }` in particular) — they moved into
  `ui/shell.css`; the class name is unchanged. And `run_campaign` validated every PWR beat
  highlight against the V1 module's `SYN_CONTROL_MAP`, which was already the wrong
  authority: `app.js` resolves highlights through `RD.PwrBoard.revealControl`. It now
  checks the board driver's `CONTROL_LABEL_MAP` (51 labels to V1's 34, a strict superset,
  so nothing that used to resolve can now be hidden). Gates unchanged at baseline:
  `run_campaign` 51/51 (3024 checks), `verify_manual_follow` PASS (84), `verify_e2e_ui`
  PASS (16 screenshots), `run_inspect` 7/7, `board_check` 106/106.

### Changed
- **The board now speaks the same units as the manual.** The dual-unit convention reached the
  manual last release but stopped at the board, leaving three conventions live at once: the
  **live checklist / procedure steps** were SI-only (*"Set the Steam Dump Setpoint back to the
  no-load anchor (8.23 MPa)"*), the **System Scanner's inspection copy** was a mix of US-only
  and SI-only, and one Scanner entry had the convention exactly backwards (*"15.41 MPa (about
  2235 psi)"*). A player reading a step target in MPa and a gauge in psi had to convert in
  their head, on a board that is US everywhere else.
  All 28 sites converted. A checklist step target now reads **1194 psi (8.23 MPa)**, the PORV
  entry opens near **2350 psi (16.20 MPa)** and reseats about **2300 psi (15.86 MPa)**, HPI
  arms at **1799 psi (12.4 MPa)**, the RHR suction valve is interlocked at **400 psi
  (2.76 MPa)**, and the rod-AUTO deadband is **±1.4 °F (±0.8 °C)** — a temperature difference,
  so no offset.
  `test/run_manual_units.js` now covers both source files as well as the manual, so the three
  surfaces cannot drift apart again. **Engine command payloads stay SI** — `cmd: { mpa: 8.23 }`
  is an argument, not a reading — as do developer comments.
- **The units gate is scored on failures, not on how much it checked.** Its coverage count moves
  whenever any number in any sentence is edited, so baselining it produced four meaningless
  drift bumps in one session and would have trained the next author to rewrite the number
  without reading it. It now reports coverage for a human and is graded only on whether
  anything is wrong. `run_hr3`, `run_contract` and `run_inspect` keep their counts in the
  baseline on purpose — theirs move when a real decision is made.

## [Pre-launch 1.9.0] — 2026-07-29

### Changed
- **The manual now reads in both unit systems — US customary first, SI in parentheses.**
  `2235 psi (15.41 MPa)`, `579.2 °F (304 °C)`, `28.5 inHg (96.5 kPa)`, across all 14 operator
  documents. US first because that is what the PWR board reads; SI alongside because that is
  what the engine computes in and what every setpoint in the source is written in. Conversions
  and rounding match the product's own `conv()` / `fmtInstrValue()`, so a number in the manual
  is the number on the gauge.
  **Temperature differences convert without the +32 offset**, and that distinction is the
  reason this needed care: subcooling margin, leg ΔT, DNB margin, control deadbands and
  cooldown rates are differences, so full-power subcooling is **73.8 °F (41 °C)** — applying
  the absolute rule would print 105.8 °F and make a thin margin look comfortable.
  New gate **`test/run_manual_units.js`** (182 checks) re-derives every US value from its SI
  partner and fails three ways: bad arithmetic, an SI quantity left without a US partner, and
  a difference converted with the absolute rule. The convention itself is documented in
  `Manuals/README.md` §Units.
  This also resolves the long-standing gap behind the `verify_e2e_ui` units xfail — the manual
  is now correct at either toggle setting rather than needing to re-render on it.

### Fixed
- **Manual currency audit — the manual now matches the plant it documents.** Every trip,
  actuation, alarm, failure, automation channel, instrument, engine command, initial condition
  and campaign mission was dumped from the live plant and diffed against the manual set. What
  the diff found:
  - **A protection function the manual never documented.** This plant adopted **Reactor Trip
    on Turbine Trip (P-9, ≥ 50 % power)**, and the manual still told the operator to ride a
    turbine trip out — **09 §2.0** had no row for it, **06 PWR-A22** said "verify SCRAM if
    required by plant", and **07 PWR-E03** said "possible reactor trip depending on
    severity/response". All three corrected, with the distinction that matters spelled out:
    a **load rejection** is ridden out, a **turbine trip above P-9 scrams**, and a **planned
    offline is neither**. Permissives **P-9, P-11, P-12** added to the permissives table.
  - **The cold end of the plant was still documented as narrative.** Six documents — **01**,
    **02**, **08**, **09**, **10** and the **README** — still said Mode 4/5 were `[narr]` and
    that there is no cold initial condition, long after the Mode 5 ↔ 1 path shipped on
    integrated physics. Cleared everywhere, with `cold_shutdown` added to the Free Play
    initial-condition tables and its board lineup described.
  - **Two board controls the manual never mentioned.** **Circulating-water inlet temperature**
    (new **03 §13.1** — the summer derate, the winter uprate, and the floor it puts under an
    RHR cooldown) and the generator **FOLLOW / MAN / OFF** selector (**03 §12.1**), including
    why selecting a load mode does not un-trip a tripped machine.
  - **A command reference that named a command no control issues.** `set_letdown_flow` →
    `set_letdown_orifices`; added the grid, CW-temperature, AFW-block and accumulator-valve
    commands.
  - **UI drift.** The **System Scanner** was still described as one-line hover text (**02
    §3.4** now documents both tiers and the 📖 deep link), **02 §9.0** still described the
    retired generated manual, and a `900 MWe` load target survived on a 100 MWe plant.
  - **03 §16.0** gained `sg_steam_flow` and `cw_inlet_temp`, plus the trap that
    `steam_flow` is turbine flow alone and reads ~0 while the dump carries the plant.

  Verified unchanged and correct: all 30 alarm setpoints, the 17 automatic actuations, all 23
  failures, the 34 campaign missions, the per-initial-condition normal values in 09 §11.0, and
  the rod-drive, pressurizer-band and damage-limit tables.

### Added
- **The manual now says what the simulator actually computes — `12_SIM_PHYSICS.md` (#203).** A new
  chapter, **Simulation Physics & Model Scope**, in the in-app manual between the crosswalk and the
  revision history. It covers the model class and the fixed 0.02 s step (and what time acceleration
  really does — more steps, never a bigger step), the per-step computation order, point kinetics and
  the six-term reactivity balance, the thermal nodes and the **four ways heat transfer degrades**
  (DNB at the core exit, uncovery, the exposed-cladding hot node, SG tube-bundle dryout *and its
  depletion*), the one-pressure-state primary with its quasi-static node ΔPs, the derived pressurizer
  level that makes the TMI deception arithmetic rather than a trick, the secondary and its declared
  steam-dump cliff, and the instrument layer that sits between truth and the operator.
  Three sections are the point of the chapter: **§11** the engine ↔ control-layer boundary (the
  engine models hydraulics and decides nothing — even code-safety logic reads an instrument);
  **§12** the deliberate simplifications, each answering *does this change what I should do?*; and
  **§13** what is not modelled at all, so an indication you expect and cannot find is understood as
  absent rather than hidden. **§14** grades numbers by how much to trust them — structural,
  calibrated, deliberately time-compressed, or display flavour.
  Written from the as-built engine and config rather than from prose, and it names the places the
  trainer is *harsher* than reality: **no natural circulation** (flow decays to zero on pump loss)
  and **no sensor voting** (one failed transmitter is decisive).
  Also corrected `01_GENERAL_DESCRIPTION.md` §8.0, whose cold-ops row still said Mode 5/4 was
  narrative-only and that Free Play starts in Mode 3 — both stale since the Mode 5↔1 transition
  shipped on integrated physics.
- **The `true_state` contract is now documented in full, and gated (#225).** All **29**
  PWR fields that `getTrueState()` emits but `Blueprint/CONTEXT.md` §6.3 never described
  are documented — the loop pressure distribution (`p_coldleg`/`p_hotleg`/`p_pumpsuction`),
  RCP cavitation (`suction_subcool_c`, `rcp_cavitation_frac`, `rcp_cavitating`), the two
  distinct void fractions, wide-range SG level, `steam_out_total`, `clad_temp_c`, the AFW
  block/discharge state, plant MODE and heatup rate, load mode, `turbine_tripped`,
  `destruction_cause` and the accumulator/condensate/discharge-pressure indications. Several
  carry the trap that made them worth documenting — `steam_flow_normalized` is TURBINE flow
  alone and reads ~0 whenever the dump is carrying the plant, `sg_level_pct` pegs on an
  overfill while `sg_level_wide_pct` keeps reading, and `accumulator_pressure_mpa` is
  indication only (injection is gated on the fixed setpoint, not on it).
  New gate **`test/run_contract.js`** diffs `Object.keys(getTrueState())` against the §6.3
  block and fails in **both** directions: an undocumented field, or a documented field the
  engine no longer emits. Nothing had ever compared the two, which is how the gap reached
  41-of-82 — and how #144 came to be filed against a field that *was* documented. PWR only;
  the RBMK/BWR blocks are registered `skip` (on hold, never audited).
- **The board explains itself — the inspection system (#96, merges #69).** The **System
  Scanner** block on the right column is now a two-tier inspection surface. Point at
  anything and it names the object and says what it does in one line; **click the block to
  expand it** and the same hover gives the full account — how the thing behaves, what it is
  wired to, and the trap that catches people — plus a **📖 Manual** link that opens the
  operator's manual at the exact section documenting it. The choice is remembered between
  sessions. Coverage is the whole PWR board: **160 authored entries** across every card,
  control, component and indication, sourced from `Manuals/03` + `09` rather than written
  from memory, with a containment fallback so an unlabelled caption answers with its card
  (and says that it is doing so). The shell chrome, the gauges and the **active alarm tiles**
  carry the same two tiers — a tile's detail is generated from the plant's own protection
  table ("Comes in when Average Coolant Temp falls to 552.2 °F"), including the #240
  reclassification note, so it cannot drift from a retune.
  **No hover highlight** (owner, 2026-07-28): an early cut ringed whatever the cursor was
  over and it read as noise. The Instructor's blue glow and the checklist's green preview
  glow are untouched — those point at something you did not choose.

### Changed
- **A cold plant no longer annunciates its own lineup as a casualty (#240).** A fresh Cold
  Shutdown (Mode 5) run spawned with **five standing unacknowledged alarms, two of them
  critical** — Pressurizer Pressure Very Low, RCP Trip, Pressurizer Pressure Low, Low
  Coolant Temperature, Turbine Trip. Every one of those conditions is *true*, and every one
  is what a planned cold shutdown is supposed to look like: the RCS is deliberately cold and
  depressurized, and the reactor coolant pumps are deliberately stopped. Annunciating that as
  a depressurization event with tripped pumps teaches the operator that a board full of
  standing criticals is normal — the exact habit this simulator exists to break. Those five
  now **reclassify to Status and reword to say why** ("expected, plant is cold";
  "Reactor Coolant Pumps **Secured**"), and a reclassified tile shows what it is normally
  classed as (`status (normally critical)`). **Nothing is hidden**: the alarm still comes in,
  still reads its instrument, still acknowledges. Two deliberate limits — **Mode 3, Hot
  Standby is excluded**, so a real depressurization or loss of the pumps post-trip reads at
  full severity; and the RCP annunciator keys on the **handswitch**, not the mode, so pumps
  lost to a trip, coastdown or blackout read **RCP TRIP, critical** in any mode, including
  Mode 5. Manual: new **06 §2.0** table with the exclusions, cross-referenced from **09 §4.0**.
  Owner ruling 2026-07-28; the design is sourced to NRC **NUREG-0700 Rev 4** (ML26022A094)
  §4.1.2-7 *Mode-Dependence Processing* and Table 4.1, whose own worked example is a
  low-pressure signal expected in cold shutdown.
- **Status-class annunciators arrive pre-acknowledged (#240, owner ruling 2026-07-29).** A
  **Status** tile reports a lineup, not a demand for action, so the board now acknowledges it
  as it raises it: it comes in lit and steady instead of flashing with an ACK outstanding, it
  is not counted in the Alarms header, and it no longer drops fast-forward back to real time.
  A healthy Cold Shutdown spawn therefore presents its five standing annunciators and **asks
  nothing of you** — while every condition is still on the board, still reading its own
  instrument, and still clearing itself when it goes away. This is the whole Status tier, not
  only the reclassified tiles: **HPI/LPI ACTIVE** and the BWR's **RCIC RUNNING** have never
  required action either and demanded an acknowledgment anyway. Critical, Warning and Caution
  are untouched.
  If a Status tile's condition stops being planned — you heat past Mode 4, or a pump you had
  secured actually trips — the annunciator **escalates to its normal priority and
  un-acknowledges itself**, so it flashes then; an acknowledgment the *operator* made is never
  taken back. Same source: NUREG-0700 Rev 4 Table 4.1 *Status-Alarm Separation*, "separates
  status annunciators from alarms that require operator action."
  This also cleared a filed **BWR** defect that was never a BWR defect: `bwr_startup` step 2
  failed the full-stack procedure gate (#208) because at t = 2 s the RCIC RUNNING status tile
  arrived on a quiet board, snapped the harness's declared 10× acceleration to 1×, and left
  the procedure covering a tenth of the sim time its steps assume. Ten other dropouts in that
  gate still do this — filed as a harness defect, not fixed here.
- **Two annunciators the manual never documented are now written up** — **LO TAVG (P-12)**
  gains a full response procedure (**PWR-A29**) and **RCP CAVITATION** its setpoint row. Both
  were modelled and both were missing from the alarm index.
- **Taking the generator off line is no longer a turbine trip (#230).** `disconnect_grid`
  — the OFF position of the generator selector, and the command every "take it off line"
  step issues — called the turbine-trip path. The stop valves slammed, `turbine_tripped`
  latched, and above the P-9 power permissive (50 %) that trips the reactor. Measured: a
  planned disconnect at full power scrammed the plant instantly, and one during a heatup
  latched a trip at 5 % power that sat armed for the whole evolution and scrammed the
  reactor the moment power later crossed 50 %. Opening the generator breaker is now what
  it says it is — load to zero, the unit off line, **nothing tripped and nothing latched**,
  and `connect_grid` re-synchronises. A real turbine trip still arrives by its own routes:
  the low-vacuum and overspeed protection, the turbine-trip failure, a reactor trip, or
  closing the MSIVs at load. The plant already modelled the ride-out separately (a full
  load rejection with the turbine on line), so this was a mis-wired command, not a missing
  behaviour. The board's OFF lamp now reads the unit's online/offline state rather than the
  trip flag, so it lights either way. New behaviour probe **TR-1d** pins it, and
  `board_check` gained 11 checks over the FOLLOW/MAN/OFF selector.
- **The six vital tiles open with their trend line already drawn** (owner-directed). Each
  tile plots the last three minutes, and it used to start from nothing — so for the first
  three minutes of every session the trace was a short stub against the right-hand edge,
  with the area fill's vertical riser stranded in the middle of an otherwise empty card.
  It read as a rendering fault rather than as an empty buffer. The tiles now preload a
  full three-minute window, **flat at the first reading**, the same steady-state preload
  the strip chart below already takes: the board opens looking like a plant that has been
  running at a stable operating point, which is the condition it is actually handed to you
  in. The preload is flat by design — it asserts only that the reading was steady, and
  never invents an excursion the plant did not have. Live data continues from it and
  scrolls the preload out over the following three minutes.

### Added
- **Feature flags: what the public site offers vs what is still being vetted (#241).**
  Content ships in one bundle with the sim, so anything half-checked went live the moment
  `develop` merged to `main`. There is now a registry — `site/flags.js` — that says, per
  feature and per piece of content, whether it is `public` (shipped) or `preview` (in the
  build, offered only on the development channel). The channel is stamped at deploy from
  Vercel's environment (`site/channel.js`: production = `main` = `public`, preview =
  `develop`), so the same file gives a different answer on either side of a merge and
  nothing is hand-edited per branch. **A gated area shows a COMING SOON panel** in the
  Plant & Mission window rather than an empty tab, gated items are simply not listed, and
  landing-page copy that promises a gated feature swaps to an honest sentence
  (`data-flag` / `data-flag-off`). A 🧪 **Features window** (Sim tab, development builds;
  `?flags=1` anywhere) lists every flag with its stage and a switch, and a **view as
  public/preview/dev** control re-resolves the whole app so you can look at `develop`
  exactly as a visitor will. Overrides are per-browser and never change what ships.
  **Initial state, by owner decision:** Free Play and the operator's manual are public;
  the training campaign, scenarios, walkthroughs and live checklists are `preview` until
  each has been played through and its line moves to `public`.
  New gates: `test/run_flags.js` (registry coverage + resolution rules — new content
  cannot ship unconsidered, a rename cannot silently drop a feature) and
  `test/verify_flags_ui.js` (the control room actually obeys the flags, asserted on
  visibility against a pinned production build).
- **UI/UX pass from the #237 review** (owner-directed). The instructor card no longer
  steals the column on a message — new content while it is collapsed cues a count badge
  and a brief glow on its header instead, and the player owns the layout: the persona
  header (now visible in chat mode too, showing the scenario title) collapses/expands the
  card in every mode, re-clicking the active tools tab collapses the tools, and all three
  layouts (instructor max / split / tools max) are reachable during a scenario — the old
  model locked a permanent 50/50 after one tab click. Alarm tiles carry a `T+hh:mm:ss`
  annunciation stamp (newest-first within each severity) so post-event sequence diagnosis
  reads off the panel, and Ack All reports how many alarms it silenced. Vital-tile trend
  arrows gained a deadband with hysteresis — an arrow only lights when the displayed value
  has actually moved a display digit over the trend window, so steady state shows steady.
  Authored scenarios can now lock the Failures tab (`ui_policy.failures: 'locked'` — the
  TMI-2 chat scenarios do), a transcript-level "⏩ reveal all" catches up re-paced dialogue
  after a rewind, and the Help overlay finally explains how to aim the free-play rewind.
  **ROD AUTO is now on the board**: the rods_tavg channel had no control anywhere in the
  shipped UI — a toggle on the rod-control card fixes the campaign's unplayable directive.
- **Owner-directed board polish (#237 comments).** Presets start with **30 minutes of
  steady-state trend history** — the strip chart and gauge sparklines are populated from
  the first frame instead of looking like the plant just appeared. The pressurizer gained
  a **temperature indication** and a **live heater-power indication** (reads the actual
  auto-controller output, not the commanded setting). **Hot/cold color contrast is
  retuned**: the at-power RCS band now owns most of the temperature ramp, so the cold leg
  reads green against an orange-red hot leg (they were adjacent yellows). The
  pressurizer's internal spray pipework follows the live cold-leg temperature instead of
  a fixed blue; the SG feed nozzle moved down so the feed line runs level with its tee;
  and clicking the **SIMULATION PAUSED** box now resumes the sim.
- **The SI units toggle is scoped instead of mixed** (owner call): the PWR board renders
  US customary throughout, so the SI position is disabled with an explanatory tooltip
  while the PWR is active (full SI board support is tracked in #238). The stale "Automate
  tab" phrasing (~30 player-facing directives pointing at a removed tab) is swept — every
  procedure, scenario, campaign line, and manual section now names the board control that
  exists (STEAM GEN FEED → AUTO, ROD AUTO, BORON → ON), and the manuals are repacked.

### Fixed
- **The board no longer shows flow that isn't happening** (#236). Pipe dash animation now
  follows the plant everywhere: a Cold Shutdown plant reads still (previously 23 of 37
  pipes animated — the whole primary loop, main steam, and the feed train "circulated" on
  a dead plant), a pump that spawns stopped stops its pipes from the first frame, the
  PORV relief line no longer streams steam into a shut valve in every state (it only flows
  when the PORV is actually relieving — the TMI tell the tailpipe temperature already told
  honestly), the AFW line agrees with itself (both halves gate on measured flow), the MSIV
  goes still with no steam, and an unloaded turbine stops its inlet and exhaust lines. The
  Mode 5 → Mode 1 missions now *show* what starting the RCPs, feed, and steam changes.
  Also: the RCP was plumbed backwards (loop entered at the discharge nozzle, patched into
  looking right) — its suction/discharge semantics are now correct via an idempotent doc
  patch, so anything future keyed on port meaning renders true.
- **V2 board defects from the #235 verification sweep.** The ECCS card's MODE readout was
  dead (wired to a snapshot section that never carried it — it now reads the control state
  and shows **RHR** in the shipped Mode 5 lineup from t = 0); the turbine no longer holds
  1800 rpm on a cold steamless plant (the unloaded rotor branch gained the windage term it
  was missing, and zero-load states spawn with the rotor at rest); the strip-chart legend
  prints ranges in the display unit with proper separators (it printed raw internal SI
  beside imperial chips); the STEAM DUMP readout no longer clips its label or sits under
  the dump valve tile; the DUMP SETPOINT range hint fits its box; the NIS caption reads
  "Δ TEMP AVG". `board_check` grew from 59 to **79** checks and now pins pipe animation
  against plant state in three states, so none of this can regress silently.
- **Decay heat no longer vanishes through an un-scrammed power reduction** (#229, #132).
  Total core heat is now prompt fission power plus the tracked decay-heat inventory,
  unconditionally (`Q = 0.93·P + decay`) — exactly identical at every steady state and
  post-scram, but through a fast runback the ~5 % residual above the new power level now
  persists on its real ~33-minute tail instead of disappearing the instant the rods move.
  This also removes a step discontinuity in the old form's power-vs-decay switch. With the
  residual real, turbine **follow mode now draws the reactor's thermal output rather than
  its flux** (like a real pressure-mode follow governor): during a down-power the turbine
  carries the decay residual — grid output briefly reads above nuclear indication, which is
  true of real plants — and the return to power runs slightly cool while the decay
  inventory rebuilds. A daily 100→50→100 % load-follow cycle completes cleanly where it
  would otherwise bank the residual into a pressurizer-level trip. The normal-shutdown ops
  probe now takes the generator offline before hot standby — the real procedure step it
  could previously skip because a flux-tracking governor stopped drawing on its own.
- **A core held partially uncovered is now damaged, as it must be** (#213). Previously the
  fuel model averaged the whole core, so with inventory anywhere above 50 % the fuel read
  fully cooled — a plant could sit at 60 % inventory (top of core exposed) indefinitely
  with no consequence, when that exact condition destroyed the TMI-2 core in under an
  hour. The engine now tracks a **peak exposed-cladding temperature** (`clad_temp_c`):
  between top-of-core uncovery (70 %) and significant uncovery (50 %) the exposed clad is
  steam-cooled only and heats at decay-heat rates; damage and melt are judged at the peak
  of clad and bulk fuel temperature. Held at 60 % inventory, clad failure now arrives in
  ~34 minutes; a prompt reflood still quenches the node with no damage, and all existing
  meltdown paths and LOCA recoveries are unchanged (`run_meltdown` 8 → **9** with the new
  MD-9 partial-uncovery path).
  *Migration note:* the new `clad_temp_c` state field is lazily initialized on the first
  step (to the hot-leg temperature), so saves written before this change load unchanged.

## [Pre-launch 1.8.2] — 2026-07-28

### Fixed
- **The vital-parameter tiles no longer flicker at all.** The previous fix stopped their
  coloured bands changing every frame, but the tiles still tore down and rebuilt their band
  rectangles and trend polylines from scratch on every repaint — about ten times a second —
  which lets the compositor present a half-built frame. Those elements are now reused and
  updated in place: measured over five seconds of steady running, the tile adds and removes
  **zero** DOM nodes where it previously churned continuously.
- **The tile trend lines are properly smooth.** They now take a sample on every plant step
  (~10 a second, up from 2) and are plotted against **time** rather than sample number, so the
  line scrolls at a constant rate instead of stretching and compressing while its buffer fills.
  The window is still a true three minutes at any time-acceleration.
- **The numbers beside the bottom graph no longer overlap.** They are spread apart when traces
  converge, but the minimum spacing was a fixed percentage that worked out to 19 px against a
  21 px number — so the spreading left them two pixels short of clearing each other. The gap is
  now measured from the number's real height, and if the column ever cannot fit it distributes
  evenly instead of piling up at the top edge.

## [Pre-launch 1.8.1] — 2026-07-28

### Fixed
- **The vital-parameter tiles no longer flicker**, especially during a transient. Their
  coloured bands are recomputed live from the plant (the Tavg band follows load, the pressure
  band follows your setpoint), and the un-rounded edges were changing on every frame, so the
  tile rebuilt its gauge about ten times a second. The edges are now rounded to whole display
  units, so a band steps once when it means something instead of shimmering continuously.
- **Readings no longer overlap their own captions.** A units bug in the board's DOM helper
  emitted `line-height: 1.1` as `1.1px`, which collapsed each tile's caption to a 1-pixel line
  box and let the reading paint on top of it. The same bug silently dropped every numeric
  `font-weight`, so text meant to be bold was not.
- **The tile trend lines are smooth.** They were sampling once per *frame* rather than once
  per plant step, which covered barely thirty seconds of plant history as a coarse staircase.
  They now sample on simulated time, so the trace is a true three-minute window at any
  time-acceleration and reads like the strip chart underneath it.

### Added
- **Low coolant temperature alarm (P-12).** The board annunciated high Tavg and tripped on it,
  but had nothing at all on the cold side — so an overcooling transient lit no warning, and the
  temperature tile's scale ran unbounded to the bottom of the meter, leaving the operating band
  an unreadable sliver. There is deliberately no low-Tavg *trip*: a PWR does not scram on low
  coolant temperature, and the real cold-side protections are this interlock and low-temperature
  overpressure protection.

### Changed
- **The average-coolant-temperature tile is scaled to the mode you are in** — the hot operating
  window when the plant is hot, and a cold-shutdown window below Mode 3 — instead of always
  spanning the meter's full 50–660 °F. The green programme band is now a readable width rather
  than a hairline in a field of grey.

## [Pre-launch 1.8.0] — 2026-07-28

### Added
- **New control-room diagram (V2).** The PWR board was re-authored in the Claude Design
  "PWR Reactor" builder and rebuilt here: 189 items, 37 pipes. What changed for you:
  - **A vital-parameter strip across the top** — reactor power, Tavg, subcooling margin,
    primary pressure, pressurizer level and SG narrow-range level, each with a live trend
    sparkline and a full-scale band. The bands are the plant's own trip and alarm
    setpoints, read live from the protection tables, so a tile agrees with the annunciator
    rather than approximating it. This replaces the old gauge strip in the shell, which
    showed the same six readings a second time.
  - **RHR has its own card** — `ALIGN` / `ISOLATE` / `AUTO` plus an `HX FLOW %` knob. RHR
    is a suction alignment on the shared ECCS pump, not a pump of its own, which is why it
    aligns rather than starts. The hot-leg suction valve is interlocked at 400 psi: press
    ALIGN above that and the button visibly refuses to latch. The HX knob is your
    cooldown-rate control and stays live under AUTO.
  - **Steam dump setpoint is now a control** (29–1350 psi), sitting under the steam-pressure
    reading so the gap between them is legible — at power the SG runs ~819 psi against a
    1194 psi setpoint, which is *why* the dump is shut. Lowering it is how you cool the
    plant down through the steam generator.
  - **ECCS alignment readout** (`off` / `HPI` / `LPI` / `RHR`) — one pump, and this says
    which of its two suctions it is drawing from.
  - **AFW now reports RUNNING / STANDBY / SECURED.** STANDBY means armed and waiting for a
    low-level signal; SECURED means you stopped it and disarmed the auto-start. Note the
    run indication reads pump *demand*: with the discharge valve shut it will say RUNNING
    while flow reads zero and discharge pressure pins at shutoff. That divergence is real,
    and it is how TMI-2 went wrong.
  - **Trend and alarms moved under the diagram**, freeing the middle column so the board
    gets the width it needs.
- **Circulating-water temperature is now a control** (40–100 °F, on the condenser cooling
  card next to the vacuum reading). Warmer cooling water means the condenser can only pull
  down to a warmer saturation temperature, so you lose vacuum, lose output at the same
  steam flow, and sit closer to the low-vacuum turbine trip — the summer derate. It also
  raises the RHR heat exchanger's sink, so a cooldown bottoms out warmer: ~28 °C on cold
  water against ~61 °C on hot. At the default 80 °F the plant behaves exactly as before.

### Added
- **The core glows.** The reactor vessel now renders Cherenkov radiation — the blue light a
  real core gives off underwater. It is driven by **fission rate, not by the rod position or
  the reactivity**, so it is completely dark on a shutdown reactor and grows and widens as you
  bring power up. Watching it come in as you pull rods is the point.
- **You can resize the panels.** Drag the inner edge of the simulator panel, or the top edge of
  the trend/alarm strip, to trade space with the diagram. Your sizing is remembered.

### Changed
- **The diagram is much bigger by default.** The trend strip and the simulator panel were both
  set to absorb whatever space the diagram did not need — but a shorter diagram needs less
  width, which freed more width for the panel, which shortened the diagram again. Both panels
  now start at a sensible fixed size and the diagram keeps the rest; the panels still take up
  spare space when your window shape leaves some, which was the intent all along.
- **The board sits still unless something is happening.** Three separate causes:
  - Every indication is now **damped the way a real panel meter is**, so a reading drifts
    across its band instead of snapping limit-to-limit between samples. Measured at steady
    full power, the last digit on the average-coolant-temperature tile now changes about
    **3 times a minute instead of 218**, and reactor power — deliberately the liveliest
    indication on the board, because excore power genuinely wanders — about 35 instead of 213.
    The damping is per-indication: RTDs are heaviest, steam-generator level lightest, because
    its bounce is the water really moving rather than the sensor wobbling.
  - **An indication that is off now reads zero.** Noise scales with signal, so a stopped ECCS
    pump indicates a still 0 gpm rather than hunting around 1, and a shut-down reactor's power
    meter sits on zero. This also means excore power can be lively at 100 % and quiet at 1 %,
    which it could never be with one fixed number.
  - A damped meter never hides a real event: past a few sigma of change in one step the
    damping is bypassed, so a scram or a break still reads instantly.
  - The **ECCS pipework no longer animates with the pump stopped** — it was reading that 1 gpm
    of noise as real flow.
- **The vital-parameter bands follow the plant.** The green band on average coolant temperature
  is now the *sliding Tavg program* — the same reference the rod controller is driving to — so
  in Mode 1 you can see the band you are actually holding, and it slides as load changes. Below
  Mode 3 it becomes the cold-shutdown band instead. Primary pressure's green band follows your
  live pressurizer setpoint rather than the rated one, so it stays meaningful in Mode 5.
- **Shutdown rod buttons latch.** One click drives the bank fully in or fully out on its own;
  the button holds a yellow in-motion light while it travels; a second click stops it where it
  is. It was press-and-hold, which is the wrong control for a bank that is only ever parked at
  one end or the other.

### Fixed
- **Flow dashes in the tees and cross now flow.** They were jittering back and forth instead of
  moving along the pipe: the fittings were being rebuilt from scratch on every update, which
  restarted the animation about as often as one dash-length took to travel. They also now share
  one dash grid anchored to the diagram, so dashes cross a joint without stepping.
- **Two crooked pipes straightened** — the PORV discharge now drops straight down into its box,
  and the turbine-to-condenser run is square instead of leaning (issue #232).
- **Board polish from the V2 playtest** (issue #231). Three things you can see:
  - **The pressurizer no longer sits off its own pipework.** Its centreline was 6 px left of
    the surge tee below it and the PORV block valve above it, so the surge line and the relief
    tap each ran slightly out of plumb between two horizontal flanges. Both now line up.
  - **Fittings flow at the same speed as the pipes they join.** Tees and the cold-leg cross
    animated their dashes 55 % faster than the runs either side, so the flow visibly stepped at
    every joint. Both now read their speed from one shared rule.
  - **The vital-parameter tiles sit still.** Average coolant temperature, subcooling margin and
    pressurizer level were jittering roughly three times a second — Tavg by 2.5 °F peak to peak,
    which is not what those instruments do. Tavg comes from RTDs in a damped bypass manifold and
    barely moves; pressurizer level is a steady differential-pressure reading. Both are now ~3x
    quieter (Tavg ±0.2 °F). Reactor power and steam-generator level are **unchanged and still
    lively on purpose** — excore power genuinely wanders, and narrow-range SG level really does
    bounce with boiling and shrink/swell. That contrast is now a real reading, not an artefact.
- **Saving mid-scenario could strand you on a step you had already done** (issue #142). Some
  scenario beats wait for you to *do* something — open a valve, switch load mode. The record
  of having done it was not written into the save, so if you saved (or hit an automatic
  checkpoint, or rewound) between the action and the beat reacting to it, the instructor came
  back believing you had done nothing. On a one-shot action there is nothing to repeat, and
  the scenario had no way forward. The same save also reset how far a walkthrough step had
  progressed toward its acceptance check, quietly costing you up to five evaluations of
  credit. Both now survive a save. Older save files still load and behave exactly as they did.

## [Pre-launch 1.7.1] — 2026-07-27

### Changed
- **The steam dump's temperature reference now slides with turbine load** (issue #219). It was
  pinned to the no-load anchor, which meant that at full power the dump's error signal was
  already saturated — the demand carried no information about how big the event was, so a
  load-mismatch cap had been added on top to put that information back. The reference is now
  the same sliding Tavg program the rod controller already runs, so the demand is proportional
  to the size of the rejection on its own and the cap is gone. On a 41 MWe rejection the plant
  now settles at 99.2 % power instead of overshooting to 102.7 %; a full rejection peaks at
  Tavg 305.3 °C. A turbine trip is unchanged by construction — at zero load the program
  collapses onto the old no-load anchor.

- **The steam dump's load-rejection arm is a declared simplification, not a hidden edge**
  (#219, owner ruling). A rejection just below the arm threshold gets no fast dump and, left
  alone, ends at the PORV — that is the operator's manoeuvre to handle, and the relief valve
  is the honest backstop. Written up as simplification §8.8 and pinned on both sides by a new
  behaviour probe, so the boundary cannot move without the gate saying so.

### Fixed
- **A pressurizer spray valve stuck open healed itself the moment you touched the spray
  controls** (issue #200). The failure was encoded by writing `spray_override = true` — a
  boolean shoved into the *operator's own demand field* — so pressing SPRAY AUTO or moving
  the spray % slider simply overwrote the failure and the stuck valve un-stuck. A stuck
  valve is mechanical, and now behaves like one: `s.spray_stuck` in the engine, with the
  pressurizer forcing the valve open past both the auto controller and any operator demand,
  exactly as `porv_stuck` already beat `porv_demand`. Note the controller still reads AUTO
  while the valve sits open — the controller genuinely *is* in auto, the valve just isn't
  listening, and that gap is the lesson.
  *Save migration:* a save carrying the old encoding keeps its failure instead of silently
  healing on load.
- **The residual-heat-removal system is called RHR everywhere** (issue #145, owner ruling). It
  was named both ways: the tab said RHR, the control label said "Decay-Heat Removal (DHR)", and
  the glossary hedged with "DHR / RHR". The control label, the manuals and the glossary now all
  read **RHR**. The `set_dhr` *command* still works — old saves depend on it — and is documented
  as a deprecated alias.
- **Fifteen instruments printed their raw internal id as their name in the reference
  manual** (issue #145). `startup_rate`, `charging_flow`, `sg_steam_flow`, `sg_level_wide`,
  `hpi_flow` and ten more fell through the generator's display-name table and were listed as
  e.g. "startup_rate — startup_rate". They now read as "Startup Rate (SUR) — how fast power
  is changing, in decades per minute". The boron entry is now explicit that it is a
  chemistry *sample*, not a live board indication.
- **The in-sim plant picker offered plants that have no control room** (issue #119). The
  Plant & Mission window listed all four engines as live, selectable cards: picking RBMK or
  BWR switched the plant and dropped you onto a board that was never extended to it. The
  landing page had said "COMING SOON" for months; the picker one click inside had not. The
  three held plants now render greyed with a COMING SOON badge and are inert. The `?engine=`
  URL override still reaches them deliberately — it is the dev/test route into those engines.
- **The front page described a different reactor than the one you operate.** The PWR card
  read "Westinghouse-style four-loop plant"; this plant is the **SLX-100 — a single-loop,
  single-SG, single-RCP 100 MWe unit** (`pwr_config.js` identity block, owner ruling
  2026-07-21). Retiring stale four-loop copy was already on the feel-plan's cleanup list.
- **The landing page now says the control room needs a desktop.** It renders on a phone but
  is not operable on one, and nothing said so (issue #127).
- `test/audit_manual_controls.js` wrote its report into a dead agent scratch directory under
  the OS temp dir (a hardcoded session id). It now writes to `Diagnostic/`, with an optional
  argv override (issue #159).

## [Pre-launch 1.7.0] — 2026-07-27

### Added
- **Reactor Trip on Turbine Trip (P-9).** Above ~50 % power a turbine trip now trips the reactor,
  as a real Westinghouse plant does — the stop valves slam, the heat sink is gone, and protection
  anticipates rather than waiting for a process limit. Below 50 % it is bypassed automatically
  (that is what the P-9 permissive *is*), because there the plant genuinely can ride a turbine
  trip out on the steam dump. The behaviour catalog had been pinning the wrong event entirely:
  its ride-out probe injected a **turbine trip** while describing a **load rejection**. Those are
  different events, and both are now covered — a load rejection rides out at power, a turbine
  trip scrams.
- **The steam dump now catches a load rejection, not just a turbine trip.** Its fast-open mode
  only ever armed on a turbine trip, so a rejection with the turbine still on line waited on SG
  pressure and spiked the primary. On a full load rejection: peak Tavg **319.5 → 305.2 °C**, the
  PORV no longer lifts, and the dump carries 98 % — the plant's ride-out character now holds for
  the event it was always claimed for.
- **STEAM FLOW indication on the board** (issue #206, owner ruling). The board showed feed
  flow and SG level but **no steam flow of any kind** — so a player holding feedwater in
  MANUAL was asked to match a number that was not displayed anywhere. The feed pump is a
  fixed-demand device: set it to steam flow and level holds indefinitely, set it wrong and
  level ramps to a trip in whichever direction the error points. All the board offered was
  level — the *integral* of the error, and therefore always a late cue. The new readout sits
  directly above SG FEED RATE, right-aligned in the same column and on the same gpm scale,
  so matching is a visual comparison rather than arithmetic. Together with level these are
  the *three elements* the feedwater controller regulates on, which is the prototypical
  arrangement — "three-element" **is** steam flow, feed flow and level read together.
  - It reads **`sg_steam_flow`** (total main-steam-line draw: turbine + dump + safeties),
    **not** the older `steam_flow` (governor/turbine only). That distinction is the whole
    point: with the turbine tripped and the dump carrying the plant, governor flow is ~0
    while the generator still boils hard. Measured through a turbine trip — governor 0 %,
    dump 98 %, **STEAM FLOW 983 gpm**, feed tracking it at 984. Wired the other way the
    board would have read "no steam" during exactly the casualty it matters most in.
  - Guarded by a new assertion in `verify_e2e_ui.js` that trips the turbine and fails with
    a pointed message if the number collapses with the governor.
- **New hands-off protection gate (`node test/run_meltdown_stack.js`).** The same core-damage
  casualties as `run_meltdown.js`, but driven through the **full stack** on the shipped lineup
  with the operator taking their hands off. `run_meltdown` is deliberately engine-direct and
  does not load the control layer at all — so its MD-4 (*"stuck PORV **with HPI** → core
  protected"*) and MD-8 (*"depressurize-to-flood → survivable"*) are **protection** claims
  proven with the operator hand-scramming and hand-starting HPI. In the shipped plant nobody
  hand-starts HPI: M4 scrams on the instruments and actuates SI at 12.4 MPa. This gate asserts
  the automatic chain actually fires **unprompted** — scram without a manual scram,
  `hpi_active` without a `set_hpi` — so a regression in an SI setpoint, an ESF arm or the P-11
  permissive cannot silently turn a documented-survivable path into a melt. **3/3 · 21/21.**
  Measured: the plant trips itself on SG level at 120 s and injects at 121 s; the LOCA band
  0.05–0.20 all scram on low pressure within 19–55 s and inject 1–2 s later.

### Changed
- **Indication noise is now set per indication, not by a global multiplier.** Gauges were
  jittering more than wanted, and the previous fix scaled *every* instrument down to a quarter.
  Measured, only about nine indications were actually misbehaving — feed and steam flow were
  jittering ten times their display step — while pressurizer and SG level, T-avg and the valve
  positions were already right, and reactor power, generator output and condenser vacuum were
  already too *quiet* to move at all. Noise is now sized per indication against what each readout
  can actually show, so the last digit moves occasionally, like a live instrument, instead of
  churning or sitting frozen. The board's separate display smoothing has been removed: the
  instruments already model their own lag, and the extra filter both duplicated it and made the
  underlying numbers meaningless.
- **The startup checklist now takes load control after synchronising** (owner ruling, #211).
  The generator picks up load in FOLLOW — right for getting on line, where the turbine chases
  the reactor — and the checklist then puts it in **MANUAL**, leaving the setpoint where FOLLOW
  put it, already matched to the power being made. This resolves a split nobody had noticed:
  the two routes into Mode 1 disagreed. A player starting from the free-play `hot_full_power`
  preset got **manual** with a matched 100 MWe setpoint; a player who ran the startup checklist
  ended in **follow**. Same plant state, two different load-control lineups depending on how you
  arrived, with nothing explaining why. Both are MANUAL now — measured, both leave an imbalance
  under 1 MWe and no alarms. MANUAL is deliberate, not incidental: it keeps the reactor/turbine
  coupling in the operator's hands, and the new LOAD IMBAL annunciator means the consequence of
  ignoring it is no longer silent.

### Fixed
- **The board now tells you when the reactor and turbine have diverged** (issue #211). A new
  **LOAD IMBAL** annunciator (Panel B, caution) fires when indicated reactor power and turbine
  load differ by more than 4 % of rated — the steam generator is filling or draining.
  `Manuals/09` had documented this annunciator all along and the engine had computed the
  signal all along, but it never reached the instrument layer, so no alarm could read it and
  the control layer never implemented one. The consequence was severe and completely silent:
  in the shipped MANUAL lineup the governor sits at the operator's load setpoint and never
  moves, so reducing reactor power on rods alone leaves the turbine as an unthrottled heat
  sink — measured, Tavg **304 → 247 °C** on a daily load cycle and **304 → 130 °C** (still
  falling) on a normal shutdown, with **no alarm and no trip at any point**. The annunciator
  now comes in at the 4 MWe threshold while Tavg is still 303 °C — about 50 degrees before
  the plant is in trouble. New alarm-response entry **PWR-A28**.
- **Auxiliary feedwater no longer parks the plant in a standing alarm** (issue #207, owner
  ruling). AFW **latches** — once it auto-starts on low steam-generator level it keeps
  feeding until an operator secures it, as in a real plant. Its proportional level hold ran
  full flow below 20 % tapering to zero at 28 %, a control band lying **entirely inside the
  amber 17–30 % caution zone**, so an AFW-only generator settled at **25.1 %** with SG LVL LO
  standing indefinitely — the plant was latched into a permanent alarm by design. The hold is
  now 32 % / 8 % band, settling at **37.1 %**: comfortably green, 7 points clear of the
  boundary, far below the 75 % caution. `run_meltdown` MD-6 (the feed-keyed dryout depletion)
  and `run_behavior` TR-2 both hold.
- **A stranded PID output could feed a steam generator forever** (issue #210). `minDelta`, the
  output deadband that suppresses chatter, was also suppressing the last small step onto a
  **rail**: a channel wanting `u = 0` after last sending 0.13 % never sent again, so a 0.13 %
  feed demand stood for the rest of the run against **zero** steam leaving the generator.
  Measured on `pwr_heatup`: true level 65.0 → 75.8 % across the low-power holds, climbing to
  ~90 %, then collapsing through the 17 % lo-lo when the dump opened. Reaching a bound is a
  state change, not chatter, so it is now always sent. Channels also stopped reporting a stale
  `holding` while sitting 25 points off setpoint with no authority to correct — they now say
  *"at minimum output — no authority to correct"*, the honest answer for a feed controller
  that cannot pump water out. Same family as the anti-windup ratchet fixed earlier, returning
  by a different mechanism.
- **The three-element feedwater controller was blind to the steam dump** — the most
  consequential fix in this batch. `feed_sg`'s feedforward and mismatch trim read the
  `steam_flow` instrument, which is **governor (turbine) flow only**. Whenever the turbine
  is offline or tripped and the dump is carrying the plant, that reads ~0, so the controller
  commanded **zero feed while the generator boiled down**. The engine's own comment
  (`pwr_steam_generator.js:139-143`) had named this exact hazard — *"after a turbine trip the
  dump still draws, and feed must follow THAT or the ride-out silently drains the SG"* — and
  the engine's coupled-feed fallback was fixed for it long ago; the M4 channel never was.
  New **`sg_steam_flow`** instrument (main-steam-line transmitter: turbine + dump + safeties)
  now drives both elements. Measured on a full-load turbine trip: SG level holds **62–67 %
  for 20 minutes** with feed tracking the dump (0.971 vs 0.973) and **no follow-on alarms**;
  previously it drained to **0 %** and scrammed on level lo-lo within 28 s.
- **`pwr_heatup` now actually heats the plant** (issue #206): Tavg **50 → 297 °C**, secondary
  bottled up to the 8.20 MPa no-load anchor, Mode 3 reached. Three procedure defects, all
  invisible below M4: it never blocked the startup net it deliberately walks into (scrammed
  on INTERMEDIATE RANGE HIGH at ~20 % with the plant barely past 100 °C — the same defect as
  the startup checklist's, in the procedure that runs immediately before it); it set a
  standing 30 % manual feed-pump demand instead of engaging Feed AUTO (SG flooded to 94.5 %,
  SG LVL HI HI standing); and it left the turbine in FOLLOW, so once the SG could finally
  make steam the governor took ~46 % of it and the heatup stalled at 240 °C. A residual
  slow SG fill on trickle feed remains, tracked in #206.

### Added
- **New full-stack procedure gate (`node test/run_procedures_stack.js`).** The same authored
  procedures as `run_procedures.js`, but driven through `SimulationService` — M4 + M5 + M6 —
  instead of engine-direct. It asserts the *same* `acc`/`saw`/`guard` predicates, so any
  divergence is attributable to the stack alone, plus four assertions only the stack can
  make: every step command **accepted** (not rejected as unknown, not refused by an
  interlock), **no unexpected scram**, **no critical alarm standing at the end**, and any
  declared `auto_channels` actually engaged. Deliberate scrams (a shutdown procedure) and
  emergency/accident categories are exempted. **22/22 · 154/154 with 13 strict xfails**,
  4.1 s. Built because `run_procedures.js` had been structurally blind twice: it cannot see
  anything the control layer decides.
- **The startup checklist now sets up its heat sink, and blocks its own trips**
  (issue #202, owner playtest). Three new steps in `pwr_startup`: **engage the
  three-element Feed AUTO channel at step 3**, while SG level is still at its nominal
  65 % (the channel captures level as its setpoint, so engaging it late captures a bad
  number); and, once above P-10, **block the IR HIGH and PR 25 % trips as explicit
  steps** rather than discovering the startup net at 20 % power. `run_procedures`
  22/22 · 100/100 checks, unchanged — the three commands are M4/UI actions the
  engine-only harness skips (new `NON_ENGINE_ACTIONS` list).
- **The 1/M "Plot point" button is now visible to the instructor.** Pressing it emits
  `plot_1m_point`, an operator action with no plant effect that the instructor layer
  consumes (M4 never sees it), so the checklist's *"set the 1/M baseline"* step checks
  itself off when the point is actually taken. The plot's points stay UI-side.
- **The release version is shown next to the logo in the control room** (issue #201),
  from a new hand-edited `site/release.js` (`window.RD_RELEASE`). Distinct from the
  `RD_VERSION` git-SHA deploy stamp; bump it with the `changelog.html` entry.

### Fixed
- **The rod insertion limit is now power-dependent, as its own config comment always
  claimed** (issue #202 item 4). `insertion_limit_pct: 30` was a flat % withdrawn floor,
  so ROD INS LIMIT annunciated continuously through every startup — the control bank
  crosses Mode 2 at ~27 % withdrawn and only reaches 92 % at power. The limit now does
  not apply below 5 % power and ramps linearly from 5 % to **70 % withdrawn at 100 %
  power** (three new `[tune]` constants). Measured margin: null at hot standby, 6 % vs a
  62 % bank at the `5_percent` preset, 70 % vs 92 % at full power — so the alarm now
  means "the bank is abnormally deep for this power", which is what it is for. It also
  stops the automatic rod channel inserting past a limit that no longer moves with load.
- **Steam-generator level no longer decays through the whole startup** (issue #202 item
  5). `pwr_startup` never commanded feedwater at all, so nothing regulated level: AFW
  picked it up around 20 % and its proportional hold (band 20–28 %) parked the plant at
  **21.4 % narrow — inside the amber band — indefinitely**. With the new Feed AUTO step,
  measured end-of-procedure level is 65.7 % on a `noDefaults` board (was 46.8 %), 65.0 %
  in free play, and 70.9 % even if the feed pump was manually poked first (was 21.4 %).
- **Checklist hover no longer restacks the PWR board** (issue #202 item 2). The shared
  `.ckl-glow` / `.instr-glow` rules lift the glowed element to `z-index: 5`, which pulled
  a hovered panel in front of the reactor vessel authored to sit over it, obscuring its
  neighbours. Board tiles now keep their authored stacking layer.
- **The startup checklist no longer points the operator at reactivity** (issue #202 item
  3, owner ruling). Reactivity in pcm is truth, not an instrument (HR1), but six approach
  steps graded on `reactivity_pcm` — and the live checklist prints its acceptance
  predicate, so the player was told to watch a reading that does not exist on the board.
  The six approach steps now grade on **source-range count rate** (620 / 1 000 / 1 800 /
  3 300 / 6 200 cps, measured), step 1 on Tavg, and no step's hover-highlight names
  Reactivity any more.
- **The pressurizer cutaway uses the full height of the vessel internals** (issue #192).
  The water band was mapped onto the LVL strip's 160–470 pixel span, so the cutaway read
  as a copy of the gauge beside it; it now spans the inner dome apex to the inner dish
  floor, and the strip keeps its own instrument span.
- **A checklist step is no longer checked off by a different step's trip block.** Command
  evidence matching now discriminates `set_trip_block` by `trip_id` (as it already did
  `inject_failure` by `failure_id`), so blocking the power-range trip does not also tick
  the intermediate-range step.

## [Pre-launch 1.6.1 and earlier] — up to 2026-07-24

_Everything below this line predates the convention above: it was kept as one running
`[Unreleased]` log and was never cut per release, so it is not separated by version.
`changelog.html` is the authoritative per-version record for these._

### Added
- **Vercel Web Analytics on every shipped page.** A one-line first-party beacon
  (`/_vercel/insights/script.js`) in the `<head>` of `index`, `about`, `changelog`,
  `feedback`, `legal`, `privacy` and `ui/shell.html`. No npm package and no build step —
  Vercel serves the script at the edge for static sites, so `@vercel/analytics` would only
  add a bundler this project doesn't have. The path is root-relative so it resolves the same
  from `/ui/shell.html` as from the top level. Off Vercel (local `npx serve .`) it 404s
  harmlessly. **Requires the Web Analytics toggle to be enabled in the Vercel project
  dashboard — the tag alone records nothing.**
- **Vercel Speed Insights on the control room only** (`/_vercel/speed-insights/script.js`,
  `ui/shell.html`). Real-user load timings for the one page that pulls in the full engine +
  layer + UI script set. Separate Vercel product with its own dashboard toggle.

- **The PWR behavior battery now probes the four protections it had been skipping**
  (`run_behavior` 30 → **34 pass / 0 xfail**, coverage-todo list empty). `PI-3` (reactor trip
  on safety injection — provable only with `lo_press` blocked, since the two setpoints are
  0.01 MPa apart and report the same reason string; plus the P-11 auto-block/auto-reinstate
  legs), `PI-8` (the 97 % going-solid backstop read off the *indicated* level, with the 75 %
  caution 102 s ahead of it and the ride-out swell well clear), `PI-9` (verified — see
  Changed), and the `TR-11` end-state pin (a spray valve stuck fully open is a nuisance, not
  a casualty: under the P5 capacity cap the heaters hold pressure at 15.33 MPa on 37 % duty,
  no trip in 30 min). Two defects found writing them, both filed rather than fixed here: no
  SI on low steam-line pressure exists at all, and `stuck_open_spray` is silently cleared by
  the SPRAY AUTO button or the spray % slider.
- **New meltdown-path test gate (`node test/run_meltdown.js`).** A strict-xfail battery
  (`test/meltdown_pwr.js`) that drives the classic routes to core damage — large-break LOCA,
  TMI small-break, station blackout, ATWS+LOCA, total loss of heat sink, ECCS recovery — and
  asserts the physically correct endpoint (damage / melt / protected). Discovered four
  core-damage-side defects; see Fixed. Now 8/8 — every meltdown path reaches its correct
  endpoint.
- **Live checklists now highlight the controls and indications a step points at — just hover it.**
  Mousing over any step in a running checklist glows the relevant board controls *and* readouts
  (a green preview glow, distinct from the blue "do this now" Instructor glow). Steps carry an
  explicit highlight list where a control alone isn't enough — e.g. the startup steps glow the
  1/M PLOT tool, the Source Range counts, and the Reactivity/Startup-Rate readouts together — and
  otherwise fall back to the step's named control. Works on the checklist bubble list.

### Fixed
- **Closing the MSIV now actually stops a steam line break — it used to do nothing.** The break
  blew the secondary down regardless of valve position, so the one lever an operator has on the
  casualty was decorative, while the manual told you to reach for it ("MSIV Close *if it
  terminates break (as modeled)*") and the behavior catalog claimed "MSIV limits". Break
  **location** is now modelled, which is the distinction a real crew is trained on:
  **Main Steam Line Break (Downstream — MSIV Isolable)** is the turbine-hall break, and shutting
  the MSIV puts the valve between the generator and the break — the blowdown stops, the bottled
  generator re-pressurizes to its code safeties, and you are in the familiar MSIV-closure
  condition. The new **Main Steam Line Break (Upstream of MSIV — Not Isolable)** is inside
  containment, between generator and valve, where nothing on a single-generator plant can reach
  it: you trip and ride the cooldown out. A multi-loop plant would isolate the faulted generator
  and keep steaming the intact ones; this plant has one, and now says so instead of pretending.
  The **Steam Line Break** scenario uses the upstream variant, so its "you cannot stop this"
  story is true rather than accidental, and its ending explains why. With the MSIV left alone,
  both variants behave exactly as the old model did.
  **Save migration:** `_fail.steam_break` gains an `upstream` flag; saves written before this
  default to *downstream*, so a save restored mid-break gains a working MSIV.
- **The startup checklist now plots enough 1/M points to actually find criticality.**
  It asked for three, which puts the predicted critical rod position **79 steps past**
  where the reactor really goes critical — no use at all when the whole method is
  "stop short of the prediction and creep up on it". The early points sit in the flat
  toe of the rod-worth curve, so the trend is too shallow and always extrapolates long
  (two points predict step 409 against a true 224). The approach now takes **six**
  points with the withdrawal bursts shrinking as you close in, which walks the estimate
  down 409 → 329 → 247 → 235 → 232 and lands within about eight steps — still reading
  slightly high, which is the safe side. Each approach step is now one self-contained
  *withdraw, settle, plot*, and tells you what the prediction should read at that point
  so you can watch it converge instead of trusting the first number.
- **The startup no longer coasts to ~15–20 % power when you try to level off in the
  low-power band.** The plant was never the problem — measured, it parks at 1.8–3.5 %
  when you take the excess reactivity out in *one* decisive inward drive released as the
  startup rate nulls, and at 10–20 % (and eventually a trip) when you tap it out a step
  at a time, because the plant keeps running while you tap. Three things were teaching
  the wrong reflex: the startup checklist withdrew ~+430 pcm and took back only ~76,
  named "~5–15 %" as the target, and *passed* on landing above 5 %; a caution blamed the
  overshoot on the trainer's lumped rod group, which the measurement disproves; and the
  startup-rate protection was set where a real startup never reaches it (peak 1.82 DPM
  against a 2.0 DPM alarm and a 2.5 DPM withdrawal block — so on the run that coasted to
  19.8 % and tripped, nothing warned and nothing stopped you). Now: **SUR HI alarm at
  1.0 DPM, rod withdrawal blocked at 1.5 DPM** (clearing below 0.8, insertion never
  blocked); the checklist creeps to criticality at ≤1 DPM, levels off at the point of
  adding heat with one Norm-speed drive, and **crossing the 5 % boundary into Mode 1 is
  now its own deliberate step** rather than something the ascent does to you. Following
  it lands 1.5 % in Mode 2, then 12.4 % and the generator on line — with every phase of
  the ascent peaking below 0.92 DPM.
- **Asking the turbine for more than the plant can make no longer floods the steam
  generator and trips the reactor.** The governor has always capped steam at rated
  output, but the automatic feedwater coupled to the *ask* rather than to that cap —
  so any load target above 100 % fed the SG faster than it could boil, level climbed
  65 % → 89 %, and the plant scrammed on high SG level a minute or two later, with
  nothing on the board connecting the trip back to the slider that caused it. The
  coupling now saturates at rated. Below rated nothing changes, including the
  deliberate feed-vs-steam mismatch you see while a load change is in progress, and
  you can still overfeed by hand on purpose.

### Changed
- **The behavior catalog's last two open interlock rows are settled.** `PI-9` ("SI on low
  steam-line pressure") is **retired** — the signal does not exist, and the measurements say
  it should not: this core cannot return to power on an overcooling even with the most
  reactive rod stuck out of it (better than 9,600 pcm of margin left), a prototype of the
  interlock injected into an intact primary until inventory pegged at its cap, and the one
  case where injection could matter already gets borated water from the accumulators. Real
  plants carry the interlock; this one has no job for it, and the manual now says so plainly
  — along with the fact that pressurized thermal shock is a real concern the model does not
  represent. `TR-11`'s row is **superseded by the earlier spray-capacity-cap ruling** — it
  still predicted "heaters lose, low-P trip unless isolated", which the cap reversed.
- **The AGPL offer of source now resolves.** `legal.html` §5 and `README.md` carried
  commented-out placeholders where the source-repository URL belongs; both now link
  **https://github.com/TH462/Reactor-Dynamics**. AGPL-3.0 section 13 requires a network
  service to offer its complete corresponding source, so an unresolved placeholder was a
  release blocker for going public.
- **Fast-forward no longer collapses the moment a casualty starts.** Acceleration dropped
  back to real time on *every* newly-annunciating alarm, and a casualty annunciates in
  cascades — a large-break LOCA dropped the clock **5 times in its first 3 minutes**, a
  loss of feedwater 6 times, each one needing a manual re-engage. An alarm now drops the
  clock only on an **otherwise quiet board**, which is what an annunciator is actually for:
  drawing the eye to a new condition on a normal board. Once the board is lit and you are
  working procedures, the alarms that follow are the consequences you are already handling.
  A **reactor trip** or a **new equipment failure** still stops the clock regardless. The
  same LOCA now stops once, on the scram; measured in the control room, engaging 60x through
  a loss of feedwater went from **3 manual re-engages to 1**. Standing alarms also mean a
  long cooldown or a Mode 5 heatup — exactly where a long fast-forward is the point — runs
  uninterrupted.
- **New setting: Fast-forward dropout (On / Off).** Turns the behavior above off entirely,
  for running a casualty through at speed. Events still annunciate normally; they just never
  touch the clock. Settings tab; On by default. It is a preference, not plant state, so a
  rewind or a state restore will not change it under you.
- **Strip-chart traces no longer stack on top of each other.** Each series auto-ranges
  independently onto the same plot height, so a steady plant centred all of them and drew
  four flat lines in one place — while leaving the top and bottom of the chart unused.
  Each series now has a **fixed vertical lane**, taken from its position in the list, and
  its band is slid onto that lane whenever the band is fitted. Lanes come out evenly
  spaced across the full height, top-to-bottom in the order the series are listed. Because
  the lane is fixed there is nothing to search and nothing to re-shuffle: two traces can
  never trade places, and a line cannot move unless its own axis re-fits. The slide is
  clamped so the data never leaves its band, which also means a trace with real excursion
  keeps every bit of its zoom and simply doesn't move — it has no room to spare, and its
  shape already tells it apart. On a steady plant the closest approach between any two
  traces goes from **0 px to 20.6 px**, spread evenly from the top of the chart to the
  bottom, with no lane movement at all over 45 seconds of running.
- **Fixed: clicking a simulation-speed chip (1× / 10× / 60× …) threw an error every time.**
  The handler set the ⚡ fast-forward badge directly and the PWR control room has no such
  badge, so it hit a null. The speed still changed (that happened first), but the exception
  aborted the rest of the handler on every click. The badge already had a correct,
  null-guarded owner elsewhere; the duplicate is gone.
- **The strip chart traces the physics, holds still, and stopped turning white.** Three
  separate complaints, three causes. (1) It plotted the **instrument** readings, so every
  trace carried sensor noise that teaches nothing. In **Teaching** mode it now plots the
  true physics; in **Realistic** mode it still plots the instruments — lightly denoised —
  so the sensor-failure drills (PWR-E20/E21/E22: drifting Tavg, stuck PZR level) still
  have to be caught by cross-checking, exactly as the procedures say. This falls out
  neatly on TMI-2, which runs Realistic for the deception (p1/p3) and Teaching for the
  reveal (p2). Alarms and protection read instruments in both modes, unchanged (HR1).
  (2) **Traces kept wriggling and reshaping after they were drawn** — the auto-range eased
  its limits toward the data every single frame, re-projecting the *whole* trace each time.
  The axis now sits on round 1-2-5 numbers and is *held*: it re-fits only when the data
  leaves the band, or after the trace has sat well inside it for several seconds. Once a
  point is drawn it stays put. Axis labels are readable numbers now (`0–120`, `14.5–16.0`)
  instead of `-7–107` and `15.22–15.54`, and they no longer run past a quantity's physical
  limits. (3) **Traces sometimes turned white** — the alarm highlight washed the colour
  60 % toward white, which destroyed the series identity, and it was driven by the raw
  noisy reading so a value sitting on its setpoint strobed the line every frame. The
  highlight is gentler (28 %, hue preserved) and latches with a release deadband.
  Side effect: the trend buffer now records one value per plotted series instead of a copy
  of the whole instrument set, so it holds **both** sources in ~40 % *less* memory than it
  used for one. The CSV export follows whatever the chart is showing.
- **The control room fills the window: a bigger diagram and no dead space beside it.**
  Two independent wastes of page, both worst on wide-but-short windows (2560×1080, any
  un-maximized landscape window). First, the board reserved phantom width: the
  right-anchored, auto-width indication tiles were measured as `left + width` — their
  builder width, not their footprint — so the diagram was scaled to fit a box ~12 % wider
  than it draws. Fitting is now measured from the rendered tiles, and **the diagram is
  ~15 % larger at every window size**. Second, whenever the diagram fits to *height* the
  leftover width was simply blank: the alarms/trend and simulator columns stayed pinned at
  340/360 px with hundreds of px of nothing between them and the board. Those two columns
  now stretch into that space (to 860 px and 520 px; 1200 px for alarms/trend when ⛶ hides
  the simulator panel) and give it back when the diagram needs it. At 2560×1080 the dead
  strip beside the board goes from **676 px to ~40 px**. Narrow/stacked layouts are
  unaffected. (`ui/diagram/board/pwr_board.js` `contentBounds`/`fitColumns`, `ui/shell.css`
  `--midcol-w`/`--simcol-w`.)
- **`privacy.html` now describes what is actually collected.** It previously stated the site
  collects "**nothing**", which the analytics beacon makes false. The *Right now* section now
  names the page-view data (path, referrer, country, device/browser/OS), states that no cookies
  or persistent identifiers are set, and that nothing *inside* the simulator is recorded. The
  lede's "no third-party trackers" became "no cross-site tracking" — the beacon is same-origin,
  but Vercel is a processor, and the weaker claim is unambiguously true. The *Planned: anonymous
  usage telemetry* section (the separate Supabase work, `WEBSITE_SPEC.md` §5) is unchanged.
- **The Mode 3 → Mode 1 startup checklist is rebuilt around the 1/M plot.** The old walkthrough
  jumped from "check the instruments" straight to a single big rod pull with no approach-to-
  criticality method. It now walks the real thing: set the **1/M baseline** before touching the
  rods, withdraw in **small bursts** and **re-plot** between them to watch the predicted critical
  position tighten, perform the **SR→IR handoff** at the right moment (secure the Source Range
  before its high-flux trip), then creep to criticality on Slow, arrest the overshoot, and put the
  turbine on line. Twelve concise steps, each written so an operator who doesn't know the plant by
  heart can follow it — and each hover-highlights its controls and gauges. The ascent now settles
  in the low-power band (~15 %) instead of overshooting to ~50 %.
- **The Procedures (live) menu is a scannable list again.** Each procedure card used to dump its
  full step list inline, so the page was a wall of text. Steps are now tucked behind a
  "▸ Show the N steps" expander — the menu reads as a list of checklists to pick from; the steps
  appear when you Follow or run one (or expand a card). Accident walkthroughs still show their
  steps inline (there the steps are the content).

### Fixed
- **Four board readouts were showing fiction; they now read the plant.** An indication audit
  found four displays wired to constants or to the wrong field:
  - **SIT (accumulator) pressure** was pinned at a hard-coded `640 psig` forever — the board
    asked the engine for a tank pressure the engine never exported. The accumulators now model
    their **nitrogen cover gas**, which expands isothermally as water discharges, so the gauge
    falls from its 600 psi charge toward ~156 psi as the tank empties. That is *why* a real
    accumulator's injection tails off as it drains, and the board now shows it.
  - **SG feed rate** displayed the feed-pump *demand* rather than measured feed flow, so the
    indication stayed pegged at what you asked for even through a feed-pump trip. It now reads
    the feed-flow instrument.
  - **Condensate polisher** always read `NORMAL` — a hard-coded string wired to nothing. It now
    reports whether condensate is actually flowing through it (`IN SERVICE` / `STANDBY`).
  - **Net reactivity** printed `+-0 pcm` whenever ρ was a hair below zero.

- **Rod speed is honoured on the first step again — a SLOW drive no longer jumps instantly.**
  The rod drive carries a fractional-step accumulator between physics ticks, and a new rod
  command never cleared it. A bank left mid-step by a previous move (a fast hold-drive can
  strand it at 0.96 of a step) would take its *next* step almost immediately no matter which
  speed was selected — so a single tap at SLOW moved the bank, and stepped reactivity, in
  0.08 s instead of the 1.88 s the slow drive calls for. A command to a bank **at rest** now
  starts from a clean fraction; a command redirecting a bank that is still **in motion** keeps
  its fraction, since it is genuinely mid-step (this matters — the automatic rod channel
  re-issues its nudge every 5 s while an 8-step slow move is still travelling, and clearing
  the fraction there would throw away real progress). Fixed identically in all three plants
  (`pwr_engine.js`, `bwr_engine.js`, `rbmk_engine.js` `rod_nudge`/`rod_start`). Rod position
  was always integrated at the selected speed and reactivity was always read from the *actual*
  bank position — the speed setting itself was never broken, only its first step.

- **A total loss of feedwater is now the accident it should be.** A steam generator that boiled
  dry used to stay a perfect heat sink forever — the steam dump kept "venting" and the primary
  parked at ~297 °C indefinitely, so losing all feed *and* aux feed with no makeup was survivable
  by doing nothing. The tube bundle now **depletes** when it is dry *and unfed*: over minutes its
  residual heat transfer boils away, decay heat has nowhere to go, and the primary heats to the
  pressurizer safeties, boils off its inventory, uncovers, and damages the core — TMI-2 without
  the recovery. Any feedwater reaching the SG (auxiliary feed included) rewets the bundle, so the
  *recoverable* loss-of-feed transient — AFW auto-starts and carries the plant through a brief
  dry spell — behaves exactly as before, to the decimal. (Engine: new `sg_dry_deplete` state in
  `pwr_steam_generator.js` scaling the dryout residual in `pwr_thermal.js`; old saves load
  unchanged.)
- **An ATWS during a LOCA is no longer benign.** Decay heat was switched on only by a scram, so
  an unscrammed core that lost coolant (fission collapsing from moderator loss, not a rod
  insertion) *froze* at its current temperature instead of heating to melt — the worst real
  accident produced *less* damage than a clean shutdown. Decay heat now persists whenever fission
  power collapses for any reason (scram-agnostic). Post-scram cooldown and normal operation are
  unchanged.
- **A core melt now reports its cause.** The `destruction_cause` outcome flag (`thermal_melt`) was
  tracked internally but not exposed in the plant's true-state readout; scenario grading read
  `undefined` on a confirmed melt. It is now surfaced.

### Changed
- **The boron analyzer is gone from the panels — chemistry sampling is how you know boron now.**
  Real plants sometimes fit online boronometers but don't rely on them; the concentration of
  record comes from grab samples and dose bookkeeping. The board's `ACTUAL <ppm>` analyzer
  readout, the synoptic CVCS ppm readout, the boron trend series, and the Automate-tab pv are
  all removed (code retained behind dated comments for an easy restore — the instrument itself
  is untouched, and the makeup channel still uses it internally to seed its books). The CHEM
  sample readout takes the analyzer's place on the panel. Manuals 03/04 rewritten
  chemistry-first. Training content still narrates the analyzer in places — a full training
  overhaul is planned (worklist: `Diagnostic/TUNING_LOG.md` backlog S12).

### Added
- **Boron CHEM SAMPLE — the lab is now on the board.** A new `take_boron_sample` command draws
  an RCS grab sample; the lab posts the authoritative concentration after a compressed ~60 s
  turnaround (real labs: 30–60 min). Chemistry **confirms every completed dose automatically**
  (the "sample after every planned boron change" ritual), and a **CHEM SAMPLE button** (board
  BORON CONTROL panel + CVCS synoptic) covers the recovery case: after ECCS/accumulator boration
  or freehand Borate/Dilute, a fresh result **re-baselines the panel** — dose books and displayed
  target snap to the lab number so the next dose computes from reality. The board's boron status
  now shows the dose countdown (`DILUTING 12→`), and the panel carries the lab readout
  (`SAMPLING…` → `705 PPM`). Result is deterministic (mixed concentration, 1 ppm resolution — no
  PRNG shift); old saves migrate (never sampled, no lab pending).
- **Free-play startups open with a boron CHEM SAMPLE already in hand.** Every starting condition
  now posts an initial grab-sample result at reset (the settled concentration, 1 ppm resolution),
  so the CHEM readout shows the current boron from the first frame instead of `—` (never sampled) —
  a real board always carries a last lab number. The makeup channel latches this result without
  treating it as a fresh (re-baselining) sample.

### Changed
- **Followable procedures + remaining manual sections aligned to the batch-dose / CHEM model.**
  The `pwr_heatup` procedure and manuals 02/03/04/10 now describe boron the way the board works:
  set a **target** (borate = raise, dilute = lower), confirm concentration with a **CHEM SAMPLE**
  (no live meter), and `take_boron_sample` is listed in the command reference. (Scenario training
  narration still names the analyzer — tracked as backlog S12.)
- **Boron target control is now a metered BATCH DOSE (real makeup-panel semantics).** The board's
  BORON CONTROL target used to *seek* the boron analyzer — but that sample lags ~45 s, so a dose
  over-delivered by ~50 % (a 10 ppm ask injected ~15 ppm, spiking power to ~110 %; a 30 ppm ask
  scrammed on high flux), while its ±8 ppm deadband silently swallowed the board's 1 ppm arrow
  nudges entirely. Now a new target computes the change and **meters it feedforward, stopped by a
  flow totalizer** — exactly the ppm asked, no analyzer chase, no deadband (1 ppm nudges execute),
  at a realistic **0.05 ppm/s** (was 0.5 — a ~5 pcm/s firehose). The dose pauses with the charging
  pump, survives save/load and rewind, and a spent totalizer no longer fights ECCS boration back
  toward a stale target. Manual Borate/Dilute buttons are unchanged (and still force the channel
  to MAN). Manuals §7.5 now documents the batch behavior — including why dilution at full power
  moves **Tavg, not steady-state power** (that part is real PWR physics).

### Added
- **Mode 5 → Mode 3 live checklist (`pwr_heatup`).** A full plant-heatup checklist from the cold
  board: RCP start, slewed pressurization, accumulator re-alignment, SR→IR handoff, a gentle
  fine-step approach to criticality, a **dilution-driven nuclear heatup ride** to the no-load
  point, then rods-in + boration to settle at Mode 3, Hot Standby. Engine-validated end-to-end
  (lands Tavg ≈ 297 °C, subcritical, Mode 3) and available from the 📋 Checklists picker.

### Changed
- **Pressurizing to a raised setpoint now takes real time.** The pressurizer heaters' control
  authority (sized for holding pressure through transients) also applied to operator setpoint
  steps — raising the Mode-5 setpoint 350 → 600 psi completed in ~3 seconds. The **effective
  control target now walks up at ~0.02 MPa/s** (the plant's deliberate heatup pace: that step
  now takes ~80 s, full cold → NOP ≈ 11 min sim) while the heaters honestly indicate full
  output. Lowering the setpoint, and disturbance response at a fixed setpoint (SGTR plateau,
  pressure dips), are unchanged. Old saves are unaffected on load.
- **The startup checklist now goes all the way to Mode 1.** `pwr_startup` ("Mode 3 → Mode 2 —
  approach to criticality") is now **"Mode 3, Hot Standby → Mode 1, At Power — startup to
  power"**: after criticality it confirms the 5 % Mode-1 boundary and puts the generator on
  line (Connect Grid). The campaign walkthrough entry follows suit.
- **`pwr_return_to_mode1` completion gate un-razored.** The final "arrived at Mode 1" beat
  required true Tavg > 298 °C while the no-load dump anchor is ~297 °C — completion depended on
  power-spike flicker. Now gates at 296 °C, matching the "hot" criterion the other Mode-5
  missions use.
- **Fine-step rod drive (PWR) — real granularity at criticality.** The control bank now travels
  **912 steps** (was 228) at ×4 the steps/s, so every rate in fraction-of-travel per second — and
  every tuned evolution — is unchanged, but one step is now **~9 pcm (~1.4 ¢)** in the startup
  critical band instead of ~36 pcm (~5.5 ¢). Rationale: the single lumped bank carries the full
  ~8500 pcm a real plant spreads over ~4 banks × 228 steps of travel, so 912 is the real
  total-travel equivalent — and one UI tap now matches real bank-D differential worth (~5–15
  pcm/step) instead of jolting power several percent at the point of adding heat. Board step
  readouts show `/912`; the 1/M plot axis follows automatically; **old saves rescale rod position
  on load** (same fraction of travel — reactivity unchanged). Manuals (§3.1, §7.0, PWR-N02
  cautions) and the PWR startup procedure step counts updated to the fine scale.

### Added
- **Xenon strip-chart series (PWR).** Xenon (% of equilibrium, from `true_state.xenon_pct_eq`) is
  now a selectable plot trend — the chart buffer carries it alongside the instrument readings.
- **Website version tracking.** The public changelog (`changelog.html`) now carries a per-release
  version number (`Alpha MAJOR.MINOR.PATCH`, starting **Alpha 1.0.1**). Adding a `changelog.html`
  entry with the next version is now a required step *before* each `develop`→`main` merge — the
  workflow is documented in `README.md` (_Branching & workflow → Website changelog & version
  numbers_) so every coding agent follows it.

### Changed
- **Vital-few gauge colors match the plant diagram.** The six top indications now use the board's
  readout palette — green normal, amber caution, red alarm (`#5aad7c`/`#ffd166`/`#ff6a4d`) — instead
  of the old dim blue-white. Cyan stays reserved for user-editable inputs, on the gauges and board alike.
- **PWR board — auto-driven number boxes read grey.** A setpoint/input box turns grey while its
  controller is on AUTO (load in FOLLOW, feed on the feed_sg channel, spray/heater AUTO, CVCS auto
  make-up) — the operator can't type into it then. Cyan = editable. The two operator setpoints (boron
  target, pressure setpoint) stay cyan. (driver `numberAuto` + a render-time recolor.)
- **PWR board — boron target ▲/▼ now nudges 1 ppm** (was 20) for fine reactivity-chemistry trimming
  (matches the 1 MW generator-load step).
- **Site — About and Feedback links disabled site-wide** (pages kept, links greyed/non-clickable on
  every page's nav, footer, and inline references); removed the "SI units under the hood" line from
  the front-page feature copy.
- **Boron now moves power at the speed of the *actual* concentration, not the input.** Borating
  or diluting used to swing power almost instantly while the boron indication crept up slowly —
  because reactivity keyed off the injected concentration while the analyzer sample lagged. The
  boron that drives reactivity now follows a **mixing/transport lag** (the borated water has to
  circulate and homogenize before it changes the core), so power responds gradually and in step
  with the indicated level instead of leading it. The "boron vs rods" training mission was
  re-paced to steer on the (now-realistic) boron inertia.
- **Gentler control rods at low power.** The control-rod integral-worth curve was flattened
  toward its average, trimming the peak differential worth so a small rod move near the startup
  critical point is less of a jolt — startup is a little more forgiving. (Total rod worth is
  unchanged, so shutdown margin and the cold→hot startup are unaffected.)
- **Indication noise cut in half.** Every gauge/indication jitters half as much (a global
  `instrument_noise_scale` on the instrument model), so the board reads calmer while the
  instruments still lag, drift, and can fail (HR1 intact).
- **Hover glow on every clickable control.** Board buttons, the SCRAM button, and the
  number-entry spinners now light up with a cyan glow on mouse-over — the same affordance
  the valves already had — so it's obvious at a glance what's actionable.

### Fixed
- **Control-room UI no longer strobes/flickers after playing a while.** The changing
  readouts (top indications, strip chart, and the clock) could start "dispersing and
  reappearing" a couple minutes into a session (most visible on the hosted build). Two
  causes: (1) the strip chart rebuilt a polyline over its *entire* sample buffer every
  frame — thousands of points as the 5-minute window filled — so the render grew heavier
  until it blew the frame budget; the chart now decimates to about one point per pixel, so
  its cost is bounded regardless of how long you play. (2) The UI rendered from inside the
  simulation's broadcast timer; rendering is now coalesced onto `requestAnimationFrame` so
  the browser always composites one complete frame. (The plant diagram was never affected —
  it updates surgically.)
- **Keyboard rod drive no longer sticks.** Holding **↑**/**↓** to drive the rods could, in
  some environments, leave the rods driving to their limit long after the key was released.
  The tap-or-hold state machine now ignores repeat/echo key events while a press is already
  active, so a release always issues the stop; a window-blur (alt-tab) safety net also
  releases the drive in case a key-up is lost.

### Added
- **PWR board — keyboard control-rod drive.** **↑** withdraws and **↓** inserts the
  control rods, mirroring the WITHDRAW/INSERT buttons: a quick tap moves one step, hold
  drives continuously at the selected S/M/F speed. Ignored while typing in a field.

### Changed
- **UI cleanup (issue #115).** The control room opens on the **Sim** tab (moved to the
  left and made the default); the **Dev** tab was removed (session telemetry still rides
  along with 💬 Feedback), and the Automate tab is gone (operator automations live on the
  board). The **Reactor⚛️Dynamics** wordmark in the control room now links back to the home
  page, and a collapsed Instructor panel maximizes when you click anywhere on it (it could
  previously get stuck minimized during chat scenarios, where its header is hidden).
- **First-run cue (issue #115).** The "SIMULATION PAUSED" board overlay now adds "Press ▶
  Play to start", and the Play button pulses until you start the sim for the first time.
- **Home page (issue #115).** An **ALPHA** badge and a "work in progress" banner make the
  build status clear up front. The "instruments can lie" feature card was replaced with two
  reactor-physics blurbs (point-kinetics reactivity feedback; the coupled whole-plant model).
- **TMI-2 Part 1 is now hands-on (issue #105).** "The Fog of War" no longer plays itself
  while you watch — the Shift Supervisor *orders* the two pivotal historical actions and
  **you** perform them on the board: securing High-Pressure Injection (the fatal mistake)
  and, at the end, closing the PORV block valve and restoring injection (the recovery). If
  you hesitate, the supervisor makes the call himself, so the ending is always the
  historical one — but the trigger is yours. Between the two decisions the board is gated to
  on-order actions so the trap can't be undone mid-event.
- **TMI-2 Part 1 pacing — no more long fast-forwards.** The uneventful two-hour draindown is
  now run at a smooth authored acceleration that snaps back to real time at each reveal,
  instead of the "Wait/Skip" fast-forward buttons that kept dropping back to 1× on every new
  alarm. The historical elapsed-time labels (~2 h 20 m) are kept.
- **Fast-forward no longer stutters through a scripted transient.** A scenario-authored
  fast-forward now rides *through* an alarm cascade instead of snapping back to real time on
  each new annunciator; a genuine reactor trip or new failure still hard-stops it. (Fixes the
  TMI-2 "fast forward keeps dropping out" report.)
- **PWR board — the PORV now shows the *real* valve, not just the demand light.** A
  stuck-open PORV visibly vents and drives flow down its discharge line even while the
  control-room demand indicator reads "closed" (the TMI-2 lie) — the board depicts the plant,
  the lamp depicts the signal. The PORV **outflow-pipe temperature** reads live and turns
  amber as the tailpipe heats, and the discharge pipe warms with it — the one honest tell the
  1979 crew had. (Issue #105: stuck PORV / no flow / tailpipe temp not visible.)
- **PWR board — the maintenance tag now hangs *over* the tagged valve.** The TMI-2 clearance
  tag was a small badge floating above the AFW discharge valve; it now hangs across the valve
  body like a real danger tag, occluding the indication behind it. (Issue #105.)
- **PWR board — turbine Load ▲/▼ now nudges 1 MW** (was 20 MW) for fine load trimming.
- **PWR board — strip-chart value chips moved to the right of the traces.** The traces now
  stop short of the right edge and each line's live value indication sits in the reserved
  gutter to its right (it used to overlap at the left edge); the time axis "now" tick lines
  up with the trace ends.
- **PWR board — more vertical room for the plant diagram.** The chart + alarm band was
  trimmed ~20 % (34 %→27 % of the plant column, min 200→160 px), and the six vital-few
  gauges now carry their mini strip
  chart *beside* the number instead of under it — a shorter gauge row. Those mini charts
  are smaller and now show a rolling **1 minute** of history (sim-time window, so they
  span the same minute at any time-accel). The reactor vessel was also lifted to sit **in
  front of** the CONTROL/SHUTDOWN GROUP rod panels it overlaps (it was authored that way);
  the vessel is click-through so the rod hold-buttons beneath it stay reachable.

- **PWR — CVCS now moves inventory at a realistic pace.** Letdown and charging (tens of
  gpm) used to act on the primary at the same lumped "accident" scale as a LOCA, so an
  uncompensated 20 gpm letdown drained the pressurizer ~2 %/**second** — far too fast for
  any operator to respond. A new engine coupling (`cvcs_inventory_gain`) puts CVCS on its
  own scale: orifice A now walks pressurizer level down **≈ 2 %/minute** (A+B ≈ 5 %/min;
  max charging fills ≈ 13 %/min), so mistakes take minutes to matter and the 17 % letdown
  isolation / low-level protections have honest time to backstop you. The AUTO make-up
  servo was re-tuned to match (a damped level error lets it hold a small leak ~2 % below
  program without chasing gauge noise).
- **PWR — SGTR rescaled onto its ESF yardstick.** A full-severity tube rupture is now
  ~½ of HPI's rated high-head flow (≈ 2× what SI delivers at pressure): it still
  overwhelms CVCS and forces the trip + SI + EOP, but the single-SG EOP's
  subcooling-guarded depressurization can now actually win the inventory race (the old
  scale only looked survivable because AUTO charging was acting as an unphysical second
  HPI — a side effect removed by the CVCS retune). Severity is still an honest 0–100 % of
  a full rupture.

### Added
- **PWR — Safety Injection on pressurizer level LO-LO (12 %).** Real ESFAS protects
  inventory, not just pressure: HPI now auto-starts when pressurizer level falls to 12 %
  (with the low-level reactor trip), even when the heaters are holding pressure up. It
  rides the existing HPI AUTO arm (cold/depressurized lineups stay blocked per P-11;
  taking manual SI control disarms it), re-arms above 20 %, and never fires during the
  TMI deception (the failed level channel reads *high* — which is the lesson).
  Documented in Manuals 09 §3.0 (along with the previously undocumented 17 % letdown
  isolation row) and 06 (PZR LVL LO LO response).

### Fixed
- **PWR board — every setpoint box now clamps to its valid range and auto-corrects
  out-of-range entries.** Typing a number above the max (or below the min) snaps the box
  to the nearest acceptable value on Enter/blur, and an empty or non-numeric entry reverts
  to the previous value instead of committing garbage. The step arrows (▲▼) respect the
  bounds too. Ranges (board is US-only): Generator Load 0–100 MW, SG Feed 0–1200 gpm,
  Spray 0–100 %, Heater 0–100 %, Boron target 0–2500 ppm, Charging 0–60 gpm, Pressure
  setpoint 15–2484 psi. Bounds derive from the engine limits (e.g. charging = the make-up
  band `charging_max`; pressure = 0.1 MPa up to the pressurizer safety) so a retune keeps
  the UI in sync. The **charging box's range marking was corrected from a wrong "0-150" to
  "0-60"** (max charging = `charging_max` 0.06 on the board's 1000 gpm/normalized scale).
- **PWR — CVCS make-up no longer drains the reactor when you switch it to MANUAL, and
  letdown can no longer empty the plant.** Two CVCS fixes:
  - **Bumpless AUTO→MANUAL transfer.** Under AUTO make-up the charging *setpoint* sat
    frozen at its start value (0), so toggling CVCS make-up to MANUAL snapped charging
    to zero while letdown kept running — the pressurizer, then the whole RCS, drained in
    a couple of minutes from a single click. Now, exactly like a real manual/auto station,
    the manual setpoint **tracks the live auto flow**, so dropping to MANUAL holds
    inventory where it was (the operator then trims from there).
  - **Letdown isolation on low pressurizer level (~17 %).** A real Westinghouse interlock:
    letdown is a bleed *out* of the RCS, so if level keeps falling it isolates both
    orifices before the plant can be drained (and before the 12 % low-level reactor trip).
    Over-letdown — including the max A+B lineup, whose flow exceeds charging capacity —
    now self-arrests at ~17 % instead of running the primary dry. Letdown stays isolated
    until the operator re-opens an orifice.
- **PWR — the board rod-drive buttons are now momentary (tap-or-hold).** WITHDRAW/INSERT
  (control and shutdown banks) used to fire a fixed 4-step nudge on release, so a click
  moved the bank several steps regardless of hold time. Now a quick **tap moves exactly
  one step**, and **holding drives the bank continuously at the selected speed until you
  let go** (`rod_start`/`rod_stop`). On release the bank **coasts to a stop** — a realistic
  slight overrun (time-based `rods.stop_coast_s`: ~1–2 steps at fast, negligible at slow)
  rather than an abrupt halt. Matches the classic control strip's rod drive; keyboard
  (Space/Enter hold) works too.
- **PWR — the accumulator (SI) isolation valve on the board is clickable again.** Clicking
  the accumulator discharge-isolation valve now actually opens/closes it, and the
  ARMED/ISOLATED status follows. The valve's position was published only in `true_state`
  while the board reads the operator command surface from `control_state`, so the click
  fired but the drawing never moved (it read a permanently-open default). It is a plain
  block valve — independent of the ECCS/HPI buttons in both directions.
- **PWR — the steam-generator U-tubes now line up with the wide-range level.** The drawn
  U-tube bundle used to top out around 47 % wide-range, but the engine begins tube-bundle
  dryout at 30 % wide (`sg_dryout_wide_pct`, which is also narrow-range 0 %). The tube
  apexes are now pinned to that 30 % mark, so the animated water surface reaches the tube
  tops exactly as the engine starts collapsing SG heat transfer — what you see is what the
  physics is doing.

### Added
- **Auto-checklists in the Instructor chat.** Any operator procedure can now run as a
  passive checklist against the live plant: call it up from the 📋 Checklists button on the
  Instructor card (or the 📋 button next to any procedure in the manual / walkthrough
  lists), and each step appears as a chat bubble that **checks itself off the instruments**
  as you operate — no plant reset, no gated controls, unlike a walkthrough. Steps with an
  acceptance reading auto-check when it holds; pure observation steps take a hand-tick,
  which also serves as the manual override. Checklists survive save/load and end the moment
  instructed content (a mission or walkthrough) takes the card.
- **The in-app PWR manual is now the real manual.** The 📖 Manual for the PWR renders the
  full `Manuals/*.md` operator set — 13 documents (general description → glossary,
  including the TMI accident study and the campaign crosswalk) — instead of the old
  generated reference pages. Procedures and accident walkthroughs remain live sections
  with their Follow and Checklist buttons. RBMK/BWR keep the generated reference until
  they get manual sets of their own.

### Changed
- **PWR manuals enhanced before the old web manual was retired** (everything worth keeping
  was ported, everything stale was not): per-initial-condition normal-values tables
  (09 §11.0), indication ranges + linked annunciators (03 §16.0), an engine command
  reference (03 §18.0), the previously undocumented RHR Cooldown Rate / heat-exchanger
  split control and its ~50 °C/h limit (03 §11.2, 05), failure severity sliders and the
  new **PWR-E22** failed-low pressurizer-level-sensor procedure (07). Stale numbers fixed
  across the set: Mode 3 Tavg is the 297 °C no-load anchor (was shown as 304), the load
  imbalance cue is ~4 MWe (was 40), rated output 100 MWe leftovers, and the procedures'
  turbine-load steps now command 60/70 MWe instead of 1000-MWe-era values. The MWe output
  gauge instrument also had a 10× stale range (0–1300 → 0–130).
- **PWR — a full tube rupture is now a real emergency, and its procedure really works.**
  The SGTR leak scaled up ~4× (a full-severity rupture is twice what charging can make
  up, so it forces the trip and safety injection instead of being quietly out-pumped) and
  now scales with the pressure difference across the ruptured tube — so the single-SG
  EOP, *depressurize the primary to steam-generator pressure*, physically stops the leak.
  Safety injection also actuates earlier (12.4 MPa, up from 11.03), arriving together
  with the low-pressure reactor trip.
- **PWR — a turbine trip no longer scrams the reactor: this plant rides it out.** The
  steam dump is sized at 105 % of rated steam flow, so losing the turbine is a transient
  the operator manages — the dump catches the load, the plant self-stabilizes at partial
  power (temperature and pressurizer level parked high, asking for rod trim), and you walk
  it down to hot standby at your own pace. Reactor trips are reserved for genuine limits.
- **PWR — real post-trip feedwater handoff.** On a reactor trip, once coolant temperature
  reaches the no-load point, main feedwater isolates (no more cold feed pumped against
  decay heat), the feed control channel visibly stands down, and auxiliary feedwater takes
  the steam generator. AFW also auto-starts the moment main feed is lost at power.
- **PWR — the heat-sink chain is physical end-to-end.** The steam dump needs the condenser
  (lost vacuum or blackout removes it), main feed needs the condenser hotwell AND the main
  steam line (steam-driven feed pumps — closing the MSIV starves them), and safety
  injection now also trips the reactor and isolates feed. Loss of vacuum untended plays
  out as: turbine trip → no dump → feed dies → SG drains → trip on the real limit.
- **PWR — scram recovery exists.** `reset_rps` re-closes the trip breakers — refused while
  any trip signal stands, and only with all rods inserted; then a normal startup ladder
  brings the plant back. (The "Plant Protects Itself" mission now teaches protection with
  a loss-of-feedwater casualty, since a turbine trip no longer scrams this plant.)
- **PWR — the plant got its own temperature program: 297 → ~304 °C.** The no-load anchor
  is now 297 °C (steam dump setpoint 8.23 MPa), a deliberately shallow 7 °C program that
  fits a small plant with a generously-sized steam generator — and roughly halves the
  stored heat a reactor trip dumps into the SG, for a gentler post-trip shrink. Hot
  standby, heatup targets, and the pressurizer level program (now ~37 % no-load → 55 %
  full power) all follow the anchor automatically; Mode-transition scenarios and drivers
  derive it from config instead of hardcoding it.
- **PWR — the pressurizer level gauge is now physical.** Level is derived from what's
  actually in the plant — inventory, coolant thermal expansion, and (only when the primary
  really saturates) void displacement — instead of drifting on its own integrator. What
  this means at the panel: level rises with load because hot water expands (the level
  program comes free); draining genuinely lowers it; over-filling packs the steam space
  and reads steeply toward solid; and the TMI deception (level rising while inventory
  leaves) happens exactly when voids exist and nowhere else. The CVCS setpoint follows the
  same expansion line, so a heat-up can no longer trick auto-charging into draining the
  reactor. Cold-shutdown states now carry a modest real mass surplus (level 30 %).
- **PWR — the plant is now officially its own plant.** Direction change (owner, 2026-07-20):
  the PWR is a ~100 MWe single-loop experimental unit tuned for behavior and feel, no longer
  chasing generic Westinghouse 4-loop numbers. Full plan: `Blueprint/PWR_FEEL_TUNING_PLAN.md`.
- **PWR — coolant temperature now follows a sliding program with load.** Average coolant
  temperature rises from a no-load anchor to its full-power value as load increases (it used
  to sit flat and even sag at mid-load), every startup state initializes as a true steady
  state, and the steam-dump setpoint anchors the no-load end (8.90 → 7.67 MPa). Current
  anchor numbers are placeholders until the feel pass picks this plant's own map.
- **PWR — partial-power states now start with the right xenon.** Low-power initial conditions
  used to seed full-power iodine/xenon, so a 5 % steady state slowly drooped to ~1 % as the
  excess iodine decayed in. States now initialize at their own power's equilibrium — 5 %
  holds indefinitely.
- **PWR — Evening Shift exam re-calibrated for the new load coupling.** Under the temperature
  program a slider-only 850 MWe ask settles ~895 (no more undershoot through 870), and the
  down-leg shrink parks SG level near 31 % until the feed is minded — the exam's phase
  markers moved accordingly (reduction credit < 905, hold line < 910), and feed vigilance is
  now genuinely required for full marks on the manual route.

### Fixed
- **PWR — the automatic charging control now senses the pressurizer-level *instrument*, not the
  true level.** Every automatic control now reads the same (lagged/failable) sensors the operator
  sees — so a stuck or failed pressurizer-level sensor fools the charging control just as it fools
  you, instead of the controller secretly working off perfect truth.
- **PWR — the reactor coolant system no longer empties when it shouldn't.** A high pressurizer
  level from thermal expansion (e.g. after closing the MSIV, which heats the primary) could make
  the automatic charging drain the whole RCS to zero chasing a level it can't lower that way.
  Charging-in-AUTO now never lets the primary fall below its nominal inventory — it only lets down
  genuine *excess* mass — so a heat-up raises the level without emptying the reactor.

### Changed
- **PWR board — heat-map temperature colors for easy transient reading.** Water uses a
  continuous blue→cyan→green→yellow→orange→red heat-map, with the scale expanded over the
  operating band (200–345 °C) the way a plant HMI is — so the hot leg reads orange and the cold
  leg green (their ~30 °C split is now obvious), and a heat-up/cool-down sweeps the full spectrum.
  Drops the old purple/pink. Steam keeps its grey scale.
- **PWR board — AFW block valve is now an independent operator valve (TMI-2).** The auxiliary-
  feedwater block/discharge valve no longer just mirrors the AFW start/stop buttons. You can run
  the AFW pumps (run lights on, discharge pressure at shutoff) while the block valve is shut and
  **no water reaches the steam generator** — the exact trap that caught TMI-2.
- **PWR board — SG FEED AUTO now shows AUTO when the feed control is actually running.** The
  SG-feed panel read a legacy flag, so it displayed MAN even though the three-element feedwater
  controller was in automatic; it now reflects and engages the real feed channel.
- **PWR board — the turbine-inlet steam pipe stops when the turbine is offline.** A tripped/
  unloaded turbine no longer shows steam still flowing to it.

### Added
- **PWR board — 1/M startup-plot button.** A **1/M PLOT** button (under TRIP BLOCKS, with the
  startup net) opens the inverse-count-rate approach-to-criticality plot directly from the board.

### Changed
- **PWR — automatic pressurizer level control works like a real plant.** Charging in AUTO now
  modulates above *and below* letdown to hold the programmed pressurizer level — a high level is
  actively brought back down (previously charging never dropped below letdown, so a high level just
  sat there). A primary leak now correctly lowers the pressurizer level, so the level controller
  makes the leak up on its own, the way a real CVCS does — without the simulator "knowing" a leak
  exists.
- **PWR board — feed-pump fluid color matches its pipes, and pipes stop when a pump is off.** The
  feed pump and the feedwater pipes into and out of it now read the same temperature. Turning any
  pump off (feed, RCP, charging, …) now stops the flow animation in its connected pipes.
- **PWR board — all water shares one temperature color scale.** Every body of water on the
  diagram — reactor coolant, steam-generator water, pressurizer, condenser hotwell and its
  circulating cooling water, and the cooling-tower basin — now uses the same aqua→blue→purple→red
  temperature ramp, driven by its actual temperature. The cooling tower and condenser cooling water
  previously used a separate blue/red blend. Steam keeps its own grey scale.
- **PWR board — accumulators no longer show flow into the reactor during normal operation.**
  The safety-injection accumulators are passive: they only inject once RCS pressure falls below
  their 600 psi check-valve setpoint. The board now shows the accumulator discharge as still (open,
  water-filled, but not flowing) at power, and animates it only when the accumulators actually
  discharge. The accumulator isolation valve is also reliably clickable (it no longer sits under
  the reactor-vessel tile).
- **PWR board — steam-generator U-tubes and channel heads, and the feed-pump temperature, read
  true.** The SG tube bundle and the hot/cold coolant reservoirs at its base take the primary
  hot-leg / cold-leg temperatures (they carry reactor coolant), not power. The feed pump's fluid
  color now follows feedwater temperature by load (cold when shut down, ~220 °C at full power)
  instead of steam pressure, and the condenser hotwell reads a cool, load-dependent temperature.
- **PWR board — reactor vessel water is colored by temperature, not power.** The coolant in the
  downcomer, lower plenum, and core channel now takes its color from the live cold-leg / hot-leg
  temperatures (cool at the inlet, warming up through the core), while the **fuel rods and core
  glow stay power-driven**. So at hot standby (hot but zero power) the water reads hot with dark
  fuel; at full power the fuel glows inside hot water — glow = heat generated, water color = fluid
  temperature.
- **PWR board — every fluid pool now tracks live conditions.** The **pressurizer** water/steam
  color follows the real saturation temperature of RCS pressure (red hot at operating pressure,
  cooling as the plant depressurizes) instead of a fixed hot color. The **steam generator** boils
  as hard as it is actually making steam — vigorous at power, calm at hot standby / cold shutdown —
  instead of a constant simmer. The **reactor core** bubbles track the engine's real coolant void
  fraction, so boiling shows up when the core actually starts to void in a transient (and stays
  quiet during normal subcooled operation).
- **PWR board — TRIP BLOCKS button is now grey, not yellow.** Blocking startup trips is a normal
  part of a shutdown/startup lineup, not an alarm, so the button uses a neutral grey (with its
  count badge) — keeping green/yellow/red for real normal / attention / alarm severity.
- **PWR board — pipes now show real fluid temperature.** The reactor-coolant pipes (hot leg, both
  cold-leg runs, pressurizer spray and surge lines) and the main steam header were previously painted
  a fixed color — the hot leg stayed red even in cold shutdown. They now take the plant's live leg /
  saturation temperatures each update, so the whole loop runs cool blue when the plant is cold and
  warms to red as it heats up, matching the pumps (which already colored to the fluid they move).
- **PWR board — real ECCS/feedwater indications, a modeled condensate pump, and boron-in-the-loop.**
  The AFW and HPI/charging flow + discharge-pressure gauges, and the condensate flow gauge, now read
  true engine quantities instead of derived placeholders. The **condensate pump** is a real control:
  securing it collapses main feedwater to zero (auxiliary feedwater is a separate train and keeps
  feeding). **Boron control** (the board's ON/OFF + target-ppm) now runs as a proper automatic control
  channel in the controls layer — it borates below the target and dilutes above, holding within a
  deadband, and drops to manual the moment you touch the boron controls yourself. The turbine runs at
  **1800 rpm** at full power (a large PWR's half-speed generator), which the board now displays live.
- **Instructor highlight on the new board.** Guided-scenario steps and procedures can now make the
  relevant control on the board glow (and hang a maintenance tag on the aux-feedwater valve), the same
  as the old plant display.
- **New PWR plant board (data-driven learning synoptic).** The PWR plant display is now a
  single integrated schematic authored in a diagram builder and exported as data
  (`ui/diagram/board/pwr_board_data.js`), replacing the procedurally-drawn synoptic. It
  carries its controls on the equipment — rod control + SCRAM, pressurizer spray/heater,
  CVCS charging & letdown orifices, boron control, HPI/AFW/steam-dump, feed pump, turbine
  load — plus every indication (temps, pressures, flows, NIS, boron, PORV tailpipe temp).
  A new **TRIP BLOCKS** menu lists the reactor trips that can be blocked for a normal
  shutdown (low-pressure, low-flow, and the two startup high-flux trips), each gated by its
  permissive. The **Realistic** diagram-mode toggle is disabled for now — the realistic
  (quiet-board) version of this diagram is still in design.

### Added
- **Public changelog page (`changelog.html`).** A player-facing "what changed" page, linked
  from the footer of every site page. **Its log starts at the public launch** — the
  pre-launch development history stays in this file and `BUILD_DECISIONS.md`, which remain
  the engineering record. Ships with an empty state; entries are added by hand from a
  template in the page source (tagged Added / Changed / Fixed, newest first).
- **Vercel deploy config (`vercel.json`).** `/sim` now works as a clean entry URL
  (rewrites to `ui/shell.html`, query strings preserved — `/sim?engine=pwr`), and the deploy
  build stamps `site/version.js` with the commit sha, so the version shown in page footers
  and carried on feedback reports identifies an actual build instead of reading "dev build".
  In-page links stay relative so the pages still open straight off the filesystem.
- **Public website, Phase W1 (`Blueprint/WEBSITE_SPEC.md`).** The root `index.html` is now the
  ReactorDynamics.com landing page (hero + plant picker: PWR live via `?engine=pwr`, BWR/RBMK
  "coming soon") instead of a bare redirect; `ui/shell.html` is unchanged and still directly
  openable. New `about.html`, `privacy.html`, and `feedback.html` (form packages a
  `rd_feedback_*.json` bundle — with optional `rd_diag_*.json` attachment, validated ≤2 MB —
  until the W2 backend lands), shared `site/site.css` in the quiet-board palette, and
  `.vercelignore`. Verified with a headless-Edge harness (links, coming-soon cards,
  package/validation flows, shell reachability, zero console errors).
- **In-sim feedback (💬) with session telemetry — owner ruling: no player file uploads.**
  A 💬 button in the sim-controls row opens a feedback overlay (category, description,
  optional email) with a pre-checked *"Attach this session's telemetry"* box — the attachment
  is the live diag recorder's bundle (same payload as the Dev-tab **Diagnosis JSON** export,
  now split into `buildDiagBundle()` + download). Telemetry can ONLY come from the live
  session: the site feedback form has **no file input** and always submits `diag: null`.
  W1 packages the report as a `rd_feedback_<category>_<plant>.json` download; W2 swaps in
  `POST /api/feedback`. Harness now 20 checks; `verify_e2e_ui` + `run_e2e_controls` hold.
- **PWR pressurizer pressure-setpoint + steam-dump pressure-setpoint controls (Mode-5 playability).**
  The Mode-transition missions instruct raising the pressurizer setpoint to NOP (15.41 MPa) on a
  heatup and lowering the steam-dump setpoint on a cooldown, but the UI had no control for either —
  so `pwr_mode5_to_mode3` and `pwr_return_to_mode1` could not be pressurized past their `heat_up`
  gate, and the cooldown lacked its authored dump-setpoint step. Added a **Pressure SP** box to the
  PZR card and a **Dump SP** box to the Turbine-Generator card (both MPa-fixed with a live readout);
  the `set_pressure_setpoint`/`set_steam_dump_setpoint` engine commands already existed. Gated in
  `verify_e2e_ui` REQUIRED_ACTS.

### Fixed
- **PWR RCP Run/Stop buttons now start/stop the pumps (`set_rcp`) — Mode-5 ship-blocker.** The RCP
  **Run** button issued `clear_failure rcp_trip`, which cannot start a pump secured in cold shutdown
  (nothing sent `set_rcp{running:true}`; clearing a `stop_pump` failure is a no-op — "pumps stay off
  until restarted"). The first operator action of the two heatup missions ("start the RCPs") was a
  dead no-op, making them unplayable from the UI. Run now clears any RCP-trip failure *and* starts the
  pumps; Stop is a clean operator stop. Every RCP indicator keys off the `rcp_running` instrument, so
  the board stays truthful; no test or lesson used the old failure-path buttons.
- **A manual (operator) reactor trip now latches the RPS (`rps_state.scrammed`) — finding C4.**
  A manual `scram` command scrammed the engine (`true_state.scrammed` and the `rps_scrammed`
  instrument both went true) but left the control layer's `rps_state.scrammed` bookkeeping flag
  false — only automatic trips set it. The mislabel was masked because every consumer dual-reads
  `rps_state.scrammed || true_state.scrammed` (simulation_service, instructor, kernel automation
  stand-down), but any future consumer reading `rps_state.scrammed` alone would have been wrong.
  `control_kernel.handleCommand` now latches the RPS on an operator scram (before interception,
  matching the automatic path: an ATWS that blocks the rods still shows the asserted trip signal).
  With the latch authoritative, the automation stand-down collapses its dual-read to
  `this.rps.scrammed` (the snapshot-level dual-reads in simulation_service/instructor are kept as
  defensive belt-and-suspenders). No gate moved (full battery green across all three plants).
- **Beat-driven world rewind no longer double-steps the Instructor or double-broadcasts (P3-3).**
  An instructor `beat.rewind` (used by `pwr_hook`) called `_restore` mid-`tick`, and `_restore` —
  shared with file-load — re-ran `_assembleWithInstructor` (a second `instructor.step`) and
  `_broadcast`, while the outer tick also reassembled and rebroadcast. Two snapshots per tick and a
  post-rewind beat evaluated against the rolled-back state. The in-tick rewind path is now `silent`
  (assemble without stepping, let the outer tick broadcast once); operator-button and file-load
  restores are unchanged.
- **Latent control-layer fixes (P3-4/5/6).** `_initialEsfArms` evaluated a conditioned actuation's
  gate against the still-empty `lastInstruments` at init (`_evaluateCondition` now takes an explicit
  instrument map; both call sites pass the live `ins`); a channel `requires`-note dereferenced a
  possibly-undefined channel (null-guarded). None had a live trigger in the shipped configs.
- **`p_pumpsuction` node pressure floored at 0 (P3-7).** A deep depressurization with RCPs running
  could expose a negative absolute pressure in `true_state`; floored (dynamics-identical — cavitation
  already floors into `T_sat`'s guard).
- **High-flux reactor trips can actually fire (PWR + BWR).** The `power_range` meters clipped at
  exactly the 120 % trip setpoint; `crossed()` is strict, so a pegged meter never fired the trip
  (the RBMK was fixed for this long ago; the other two plants never got the parallel change —
  finding C1). Evidence: the BWR held 175 % true power indefinitely with no trip; the PWR rode a
  198 % excursion trip-free inside a passing ops check. Both meters now `[0, 200]`. BWR
  `abuse_rod_yank_at_power` passes; PWR `abuse_accel_latency` gains hard "protection tripped"
  checks at 1× and 256× (the C1 acceptance, re-pointed after the old `abuse_startup_yank`
  acceptance went dead under the newer source-range trip).
- **`inject_failure` with an unknown id is now a COMMAND_ERROR (all three engines).** The silent
  no-op let a run_pwr test inject the effect-name `primary_leak` for months — its "LOCA" never ran.
- **Four missions showed no message on a gated click** (`pwr_chain_reaction`, `pwr_boron`,
  `rbmk_void`, `bwr_recirc`): `gate.message` was authored as a plain string, but the instructor
  renders `msg[register]` — players got a block with no explanation. Now both-register objects,
  and the campaign gate statically validates the shape.
- **`pwr_mode3_to_mode5` cooldown script scrammed the plant en route** (caught by the new
  arrived-UNscrammed assertion): at 120× a broadcast is 30 sim-s, so the script's full-spray
  depressurization crashed through the P-11 permissive AND the 12.41 MPa lo-press trip between
  operator samples, and the subcritical plant still coasted to the Cold Shutdown card. The driver
  now walks the pressure setpoint down 0.5 MPa/sample until the P-11 block is placed (the real
  procedure sequencing), then releases full spray.

### Added
- **Test-suite review + hardening pass (2026-07-19)** — full findings in
  `Diagnostic/TEST_SUITE_REVIEW_2026-07-19.md`. Repairs to checks that could not fail (run_m6
  literal-`true` tautologies + a self-defeating consume-flag check; run_m4 vacuous safety-lift
  disjunction; run_pwr loss-of-feedwater trip tautology + a dead loss-of-vacuum predicate;
  run_e2e_controls CVCS pair stale since the SGTR leak rescale — now asserts the servo's real
  contract: charging converges to match the leak). New coverage:
  - **run_pwr 28→31**: `feedwater_isolation` (P-14 latch gates main feed, AFW passes through,
    operator restore), `accumulator_arming_boundary` (the restored 4.14 MPa setpoint pinned at
    ±0.3 MPa; full SGTR never arms the tanks, large LOCA dumps them — the break-size
    discrimination the restore was for), `steam_dump_capacity_cap` (the ~50 % cap on manual
    full-open, previously deletable without failing anything).
  - **run_bwr 12→15**: `protection_trips` (the suite's FIRST trip assertions — negative control,
    trip-table shape pin, fireable high-flux trip), `atws_slc` (failure_to_scram blocks rods,
    SLC borates down, stop/resume semantics), `hpci_injection` (HPCI actually runs, recovers
    level, hpci_failure kills it). Conditional-vacuous SBO/actuation checks now assert their
    preconditions.
  - **run_rbmk**: eps_bypass check gains its missing positive control (a past-setpoint state
    trips un-bypassed, silenced bypassed) + post-1986 void-trip fireability; flagship-post peak
    bound (final-power-only would have passed a transient excursion); stuck-rod melts-SOONER
    discriminator; low-power ORM pinned to ≈7.5.
  - **run_m4 17→18**: P-11/P-7 trip-bypass lifecycle — cold init auto-blocks, lo_press
    auto-reinstates on repressurization (the safety-critical direction), re-armed trip fires.
  - **run_campaign 47→51**: static "references resolve" pass (branch goto targets,
    instrument/true_state/alarm/command names, direction + advance vocabulary, gate shapes,
    inject_failures ids — a typo'd reference previously soft-locked or silently never fired);
    the three untested TMI-2 Part 3 endings (Plugged-Not-Refilled, Caught-Late, Holding-Not-Won);
    arrived-UNscrammed assertions on all three Mode 5↔1 missions.
  - **ops_pwr**: `ops_sg_overfeed_p14` — hands-off P-14 acceptance under the real control layer
    (HI HI alarm at 88 % precedes the 90 % actuation; turbine trip + feed isolation + P-9 scram).
  - **ops_rbmk**: hard C2 acceptance check (256× accel destroys what 1× survives), deliberately
    RED until C2 is fixed.
  - **run_procedures**: strict expected-fail mechanism — B3 reports as `✗(known B3)` without
    reddening the gate; an XPASS turns the gate red so the annotation cannot go stale.
- **CVCS charging now controls pressurizer level; AUTO make-up holds level (PWR).** Charging/letdown
  gain real authority over indicated PZR level: a bounded net-make-up insurge term (`(charging − letdown)
  · K_cvcs_level`) is added to the level model, so charging raises level and letdown lowers it — as in a
  real plant. **CVCS AUTO make-up now holds programmed level** (not just mass): charging modulates
  above/below letdown to drive level toward `pzr_level_nominal`, while still compensating a gross
  inventory deficit (`max(level-servo, inventory-makeup)`) so a leak that has not yet shown as a level
  drop is still caught. The term is small and bounded (`charging_max`/letdown ≈ 0.07), far below the
  fast `K_void_surge` that drives the **TMI level-vs-inventory deception** — which is verified intact
  (level still rises as inventory falls; charging is isolated in that path anyway). This fixes the
  `ops_normal_shutdown` probe (the operator's rampdown no longer stalls at 45 % power when the
  pressurizer shrinks below the 30 % hold — AUTO make-up restores level so the ramp continues to hot
  standby). New config `reactivity.cvcs_charge_per_level` (0.006), `pressurizer.K_cvcs_level` (6.0).
  Gates: run_pwr 26/26, campaign 47/47, m4/m5/m6, autoctl 20/20, ops now 55/66 (PWR 17/19).

### Changed
- **PWR pressure model holds saturation on a violent depressurization (SGTR).** Two coupled fixes so a
  fast depressurization (e.g. an SGTR EOP on HPI) tracks saturation instead of reporting impossible
  negative subcooling. **(1)** The pressurizer sat-pull (pressure → Psat(Tavg)) now engages whenever the
  coolant is superheated (Tavg above Tsat(P)), not only when the void bookkeeping has flagged two-phase —
  so a depressurization at full/overfilled inventory still pins pressure at saturation without touching
  `primary_void_fraction` (the calibrated TMI void-surge is untouched, verified). **(2)** The subcooled-
  liquid terms — break-depressurization and the thermal expansion/contraction surge (`K_surge`) — are now
  suppressed in the saturated regime, so an HPI cold quench dropping Tavg fast no longer crashes pressure
  below saturation via a thermal-outsurge term that is meaningless in two-phase. `ops_sgtr_managed`
  subcooling held **+27 °C** (was −152 °C, core-loss); the scenario's EOP was also made faithful to the
  #1 EOP rule — throttle the cooldown/dump to hold subcooling margin rather than crash-cool on a full
  dump. PWR ops 17/19 → 18/19. No regressions across run_pwr/campaign/m4/m5/m6/autoctl.
- **PWR pressure/secondary realism (ops-tuning).** Three physics-honesty fixes surfaced by the ops
  probes. **(1) Spray floor:** pressurizer spray can no longer pull primary pressure to the containment
  floor — it tapers to zero as pressure approaches the saturation pressure of the hottest coolant (Thot,
  the core exit), self-limiting at the onset of core-exit boiling (real spray water is cold-leg liquid).
  Full-heaters-vs-full-spray now floors ~8 MPa instead of 0.1 MPa (`abuse_heater_spray_fight` passes). On
  a real cooldown Thot falls too, so the floor tracks down and spray still depressurizes as fast as the
  plant cools. **(2) Steam-dump capacity:** the turbine-bypass dump is capped at a realistic ~50 % of
  rated steam flow (`steam_dump_max` now a true cap on both the manual override and the auto demand), so a
  full load rejection lifts the SG safeties and slamming the dump open gives a rate-limited cooldown
  instead of a Tavg crash. **(3) SGTR leak scaling:** a tube rupture no longer drains the whole primary in
  ~30 s — a per-failure `leak_scale` converts the "% rated flow" rating to a realistic slow drain (tens of
  minutes) the EOP can out-inject (SGTR inventory now holds >70 %; a large-break LOCA is unscaled and
  still fast). Gates unchanged: run_pwr 26/26, campaign 47/47, m4/m5/m6, autoctl 20/20, ops now 54/66.

### Added
- **High-high SG level protection (P-14) + realistic low-low reactor trip (PWR).** The steam-generator
  level ladder gains its high-side protection and the low-low reactor trip is moved to a more realistic
  setpoint. **(1) High-high SG level (P-14) at 90 %** now fires a coordinated protection: **turbine trip**
  + **main-feedwater isolation** (new `isolate_feedwater` command / `feedwater_isolated` latch — stops
  MAIN feed only; AFW is downstream of the gate and keeps feeding) + **reactor trip**. The reactor-trip
  half is the P-9 interlock (lost heat sink at power → heatup/overpressure), gated by a new `above_p9`
  status instrument (≥50 % power) and **scoped to the SG-level cause** so a turbine trip from another
  source (MSIV closure, overspeed, vacuum) still does *not* scram. A new **`SG LVL HI HI`** critical
  alarm annunciates at 88 %. **(2) The low-low SG-level reactor trip moves 12 % → 17 %** (with its
  `SG LVL LO LO` alarm), giving the heat sink more margin and sitting just below the 20 % AFW auto-start
  (real Westinghouse practice: AFW is established as the post-trip heat sink at ~the same low-low signal,
  not to prevent the trip). A steam-line break now trips early on the SG swell (P-14 → turbine trip +
  feed isolation + scram) instead of riding to a late low-pressurizer-level trip — the automatics close
  the previously-unprotected high-SG-level condition. Gates: **`run_pwr` 26/26**, campaign **47/47**,
  ops **53/66** (identical fail set), m4 **15/15**, m5 **19/19**, m6 **16/16**, autoctl **20/20**.

- **Physical break-depressurization model + realistic accumulator setpoint (PWR).** The accumulator
  arming pressure is restored from the detuned **1.5 MPa** to the real B&W core-flood-tank /
  Westinghouse SIT cover-gas pressure **4.14 MPa (600 psi)**. This is now physically meaningful because
  break depressurization was reworked. **Before:** `tavg` pinned near ~300 °C for *every* break size (no
  term removed the break's enthalpy), so the saturation plateau was fixed and break size was set only by
  `K_leak_depressurize` — a direct pressure sink that ran even two-phase, forcing pressure far below
  saturation while the coolant stayed hot (impossible superheat), and never actually reaching the old
  1.5 MPa setpoint, so the accumulators were dead code. **Now:** a **break blowdown flash-cooling** term
  in `pwr_thermal.stepCoolant` (`dTavg += blowdown_gain · leak_flow · (blowdown_sink_c − tavg)`, same
  self-limiting form as the ECCS quench, keyed on `leak_flow` only) makes the plateau respond to break
  size — a **small break** stays hot and pins pressure on the plateau *above* 600 psi (the SGTR/TMI
  inventory-and-void lesson intact), a **large break** cools the RCS toward containment so pressure falls
  below 600 psi and arms the accumulators + cold quench. `K_leak_depressurize` is gated to the subcooled
  regime so two-phase pressure tracks saturation consistently (no superheat). Tuned so ≤8 % SGTR holds
  ~5.9 MPa (854 psi) while the 20 % large-LOCA default drops to ~3.2 MPa (462 psi) and dumps the
  accumulators. New config `thermal.blowdown_gain` (0.02), `thermal.blowdown_sink_c` (110 °C). The
  **Mode 5 cold-shutdown** state now **isolates the SI accumulators** (it sits at 2.5 MPa, below the
  restored setpoint — the real shutdown lineup); heatup re-aligns them once pressurized and cooldown
  re-isolates before depressurizing into their band. The flagship TMI scenario is untouched (its
  stuck-open PORV leaves `leak_flow=0`). Gates: **`run_pwr` 26/26**, campaign **47/47**, ops **53/66**
  (identical fail set), m4 **15/15**, m5 **19/19**, autoctl **20/20**.

- **Accumulator cold-water quench + discharge isolation valve (PWR).** Two gaps in the accumulator
  model, both raised in review. **(1) The cold injection had no thermal effect.** HPI/LPI and the
  accumulators added borated inventory (and, recently, boron) but their water carried no *temperature* —
  blasting thousands of gallons of cold RWST/SIT water into the cold leg did nothing to `tavg`. Now
  `pwr_thermal.stepCoolant` includes a **cold-injection quench**: injected water enters at
  **`eccs_temp_c` (40 °C)** and removes sensible heat by perfect-mixing, `dTavg += eccs_cooling_gain ·
  q_inj · (eccs_temp_c − tavg)`, where `q_inj` is the HPI/LPI+accumulator throughput stashed by
  `stepInventory`. It is **self-limiting** (cools no further than the RWST temperature) and **excludes
  RHR** (recirculation, not cold make-up). `eccs_cooling_gain` (0.08) decouples the thermal coupling
  from the mass/void tuning so the quench is dramatic-but-observable (~°C/s) rather than a single-step
  crash. **(2) No isolation valve.** The accumulators were purely pressure-driven with no way to isolate
  them. Added the motor-operated **discharge isolation valve** (`accumulator_valve_open`, default
  aligned) with **`open_accumulator_valve` / `close_accumulator_valve`** commands; a shut valve
  hard-gates discharge at any pressure, so a normal cooldown can depressurize below the check-valve
  setpoint without a spurious dump. Old saves migrate to *valve open* (unchanged behavior). (The
  accumulator setpoint was left at 1.5 MPa in this change and **subsequently restored to the real
  4.14 MPa** — see the "Physical break-depressurization model" entry above.)
  Verified new `run_pwr` guard `eccs_cold_injection` (quench magnitude matches the mixing rate, no-
  injection control stays flat, self-limit holds; valve blocks discharge/boration and preserves the
  tank). Gates: **`run_pwr` 26/26**, campaign **47/47**, ops **53/66** (unchanged — no new failures).

- **Regression tests for the recent PWR reworks.** An audit found several recently-added features were
  exercised but never *asserted*, so a regression would have passed silently. Added dedicated guards:
  - **§14 engine suite (`run_pwr` 20→25):** `eccs_boration` (injection raises core boron toward the
    RWST source; no-injection control stays flat; accumulators borate; no overshoot), `loop_pressure_nodes`
    (node ordering, flow² offset scaling, coastdown collapse to a single pressure), `letdown_orifice_lineup`
    (the four-state lineup ≈0/3/4/7 %, √ΔP pressure-driven tail-off, deprecated `set_letdown_flow` alias),
    `save_migration` (a pre-rework save gains `pressure_setpoint`/`steam_dump_setpoint` defaults, migrates a
    legacy `letdown_flow` to an orifice lineup, folds `lpi_active`→`hpi_active`, seeds the loop nodes), and
    `mode5_controls` (pressure-setpoint tracking, RCP start/stop, steam-dump-setpoint secondary cooldown).
  - **`run_m5` attention stops:** added the **alarm** trigger and the crucial **non-trigger** case — a
    commanded power/load maneuver must *not* snap fast-forward (only unbidden events do), guarding
    fast-forward from being made useless during normal maneuvering.
  - **Shared `checkSanity` (every ops probe):** loop-pressure-node ordering, `boron_ppm ≥ 0`, and primary
    inventory bounds now hold as passive invariants across all PWR ops scenarios (guarded so RBMK/BWR skip).
  - Gates: `run_pwr` **25/25**, `run_m5` **19/19** (72 checks), ops **53/66** (unchanged scenarios, +60
    invariant checks), `run_m7` **OK**, campaign **47/47**, RBMK **23/23** / BWR **12/12** unaffected.

- **Borated emergency injection (PWR) — ECCS and accumulators now carry boron into the core.** The
  emergency-injection water was pure inventory: HPI/LPI and the accumulators added coolant mass but
  never changed core boron, so the negative-reactivity **shutdown-margin** role of borated safety
  injection was absent. Now every emergency-injection source delivers water at **`eccs_boron_ppm`
  (2500 ppm, the RWST/SIT concentration)** and it **mixes into `boron_ppm`** by perfect-mixing
  transport — `dC/dt = q_inj·(C_eccs − C)/m` in `pwr_primary.stepInventory` — so injection **raises
  core boron and adds negative reactivity**, exactly as borated ECCS/accumulator water holds a
  reflooded core subcritical during a LOCA. The `boron_analyzer` readout now reflects this. Losses
  (letdown/break/relief) leave at the current concentration and don't change it. CVCS borate/dilute
  stays a separate idealized direct-rate channel. **Not modeled:** boil-off boron concentration (the
  lumped loss term doesn't distinguish boil-off from leakage). Verified: a large-break LOCA with SI
  drives boron 747 → ~2050 ppm (≈ −13000 pcm); no-injection control stays flat. PWR engine **20/20**,
  scenarios **3/3**, campaign **47/47**, `run_autoctl` **20/20**, `run_m5` **19/19**, ops probes at
  **53/66** baseline (no regressions).

- **RCP cavitation (PWR) — the reactor coolant pumps now cavitate when the loop voids.** A running
  RCP degrades when its **suction node** approaches saturation: `suction_subcool_c = Tsat(p_pumpsuction)
  − tcold` (the lowest-pressure node, distinct from the bulk subcooling margin). Below an 8 °C onset the
  pump cavitates, severity ramping to full over 8 °C more, and **loses up to 70 % of delivered flow**
  (`flow_frac`) — a real mechanical effect, not just an indication. This is the physics behind the
  TMI-2 control room's "the pumps are objecting" cavitation noise: as the stuck-PORV LOCA drives the
  RCS to saturation, the suction margin collapses, the pumps cavitate, and coolant flow falls. A new
  **"RCP CAVITATION"** alarm annunciates, the synoptic RCP reads **CAVITATING**, and true state exposes
  `suction_subcool_c` / `rcp_cavitation_frac` / `rcp_cavitating`. Only a running pump cavitates. PWR
  engine **20/20** (new acceptance test), campaign **47/47**, `verify_e2e_ui` PASS.

- **Two-orifice letdown (PWR) — CVCS letdown is now a pressure-driven orifice lineup.** Letdown was a
  commanded normalized setpoint; it is now **two fixed orifices, each independently in/out** — four
  states **off / A / B / A+B** (`set_letdown_orifices {a, b}`). Flow is **pressure-driven** off the
  cold-leg node — `C·√(p_coldleg − 2.4 MPa)`, the 2.4 MPa being the letdown-backpressure-control-valve
  setpoint — so it **tails off as RCS pressure falls** toward that value on a cooldown, instead of
  holding a commanded constant. Nominal at NOP: A ≈ 3 %, B ≈ 4 %, A+B ≈ 7 % of rated (A+B is a net
  drain, exceeding charging, for level reduction / depressurization). The synoptic CVCS panel gains
  two orifice toggles (A / B) replacing the letdown setpoint box; the manual renames "Letdown Valve"
  → **"Letdown Orifices (CVCS)."** `set_letdown_flow {normalized}` is kept as a **deprecated alias**
  (maps to the nearest lineup) and old saves migrate (`letdown_flow` → orifice lineup by NOP-flow).
  PWR **19/19**, campaign **47/47**, `run_m5` **19/19**, synoptic **55/55**, `verify_e2e_ui` PASS.

- **Loop pressure distribution (PWR) — three primary-loop pressure nodes.** The RCS is
  incompressible liquid outside the pressurizer bubble, so pressure stays ONE dynamic state
  (`pressure_mpa`, the pressurizer/hot-leg reference) plus a **quasi-static ΔP field** set by
  pump head vs. friction — no new integration, no stiffness. `pwr_primary.computeNodePressures`
  now exposes `p_hotleg` (= `pressure_mpa`), `p_pumpsuction` (between SG and RCP — lowest), and
  `p_coldleg` (RCP→RX pump discharge — highest); both offsets scale with `flow_frac²` and collapse
  to a single pressure when the RCPs coast down. The systems tied into the loop now read the node
  they physically connect to: **ECCS/accumulator injection works against the cold-leg node** (pump
  discharge, higher than the pressurizer reference at power; converging on it as a LOCA trips the
  pumps), while RHR suction stays on the hot leg. Node pressures are true state only — the single
  `primary_pressure` instrument is unchanged (real plants have one wide-range RCS gauge, not three).
  PWR engine **19/19**, campaign **47/47**, `run_m5` **19/19**.

- **Fast-forward attention stops — the clock snaps back to real time when the operator must
  act.** Time acceleration lives in the Simulation Service (M5); it now auto-decelerates to 1×
  the moment a genuine plant event appears on the broadcast the event lands on — a **reactor
  trip / SCRAM**, a **newly injected or latched failure**, or a **newly annunciating alarm**. It
  applies to *any* fast-forward — operator-selected or beat-driven — so an authored fast-forward
  can no longer blow past a trip. (A *commanded* power/load maneuver is deliberately **not** a
  trigger: an excursion that genuinely needs attention already annunciates an alarm, which the
  alarm trigger catches, whereas an operator- or auto-channel-commanded ramp is expected change
  and must remain fast-forwardable.) The snapshot that carries the event also carries
  `metadata.speed_snap = { reason }`, and the UI toasts *why* the clock changed
  ("Dropped to real time — reactor trip"). Authored *soft* stops (pausing just before an
  operator action during a mode change) remain a content pattern: a beat with `speed: 1`.
  `run_m5` **19/19**, `run_autoctl` **20/20**.

- **Three Mode 5 ↔ Mode 1 campaign missions (PWR).** The training campaign now teaches the
  full commercial heatup/cooldown loop on the board, using the cold initial condition below:
  - **`pwr_mode5_to_mode3` — "The Big Warm-Up"** (Act II): the cold heatup — pressurize, start
    RCPs, SR→IR handoff, take the core critical, and ride a low power up to NOP, settling at
    subcritical Hot Standby.
  - **`pwr_mode3_to_mode5` — "Cooling Down"** (Act III): the controlled cooldown — borate for
    margin, cool the secondary, depressurize on subcooling, place RHR, secure the pumps.
  - **`pwr_return_to_mode1` — "Cold to Power"** (Act III): the full startup Mode 5 → Mode 1,
    closing the round trip.
  - Each mission's intro carries the honesty banner (compressed rate; controlled nuclear heat).
  - **P-7 / P-11 RPS trip bypass** (control layer): the low-pressure and low-flow reactor trips
    are now bypassable in the cold/shutdown regime (a plant that inits depressurized loads with
    them blocked; they auto-reinstate as pressure/power come up) — the real startup/shutdown
    permissives, without which a cold plant loads scrammed and can't be heated. Neutral for
    every hot initial state (a LOCA/TMI depressurization still trips).
  - PWR campaign is now **34 missions**; `run_campaign` **47/47** with a scripted-operator drive
    for each new mission.

- **Cold Shutdown (Mode 5) initial condition + full Mode 5 ↔ Mode 1 transition (PWR).** The
  engine now models a genuinely cold, depressurized plant and can be driven all the way up to
  power and back down on integrated physics — the path the manuals previously marked *"[narr]
  only — no cold IC."*
  - **New `cold_shutdown` initial state (Mode 5).** RCS cold (~50 °C) and depressurized
    (~2.5 MPa, below the 400 psi RHR interlock), subcritical with shutdown-margin boron, RHR in
    service holding the cold sink, RCPs secured (RHR provides forced circulation), SR energized,
    ~0 decay heat. Holds stably.
  - **Operator pressure setpoint.** New `set_pressure_setpoint {mpa}` — the heaters/spray now
    hold an operator-adjustable target across the full 0.1–17 MPa range (default NOP), so
    pressure holds where it is placed during heatup/cooldown instead of snapping to NOP.
  - **Secondary cooldown.** New `set_steam_dump_setpoint {mpa}` lets the operator lower the
    no-load steam-dump target so the secondary — and with it the primary, through the SG —
    cools during a cooldown.
  - **Reactor coolant pump control.** New `set_rcp {running}` starts/stops the RCPs (secured in
    cold shutdown; started for pump heat and SG coupling during heatup).
  - **Plant MODE indicator + heatup/cooldown rate.** True-state now exposes `plant_mode` (1–6)
    and `plant_mode_name` (per manual 05 §2), plus `tavg_rate_c_per_hr`.
  - **New `5_percent` initial state** — low-power Mode 1, At Power (~6 %, just above the 5 %
    Startup/At-Power boundary).
  - **Full-stack cold lineup.** A plant that initializes depressurized starts with the
    low-pressure Safety Injection ESF **disarmed** (the real P-11 SI-block lineup), so loading
    Cold Shutdown no longer spuriously floods the core. Behaviour is unchanged for every hot
    initial state (TMI included).
  - New snapshot/state fields: `pressure_setpoint`, `steam_dump_setpoint`, `plant_mode`,
    `plant_mode_name`, `tavg_rate_c_per_hr`. Save-compatible: older saves migrate
    (`pressure_setpoint ← 15.41`, `steam_dump_setpoint ← 8.90`).
  - Tests: engine `cold_shutdown_hold`, `steady_five_percent`, and `mode5_to_mode1_roundtrip`
    (drives cold→hot→cold on integrated physics); full-stack cold-IC guard in `run_m5`.

- **RHR / LPI system rework (PWR).** The Residual Heat Removal system is now modeled as
  the real shutdown-cooling loop that doubles as Low-Pressure Injection:
  - **Hot-leg suction valve with a 400 psi interlock.** `set_rhr {active}` opens/closes the
    RHR hot-leg suction valve. The valve can be opened only below **400 psi (2.76 MPa)** and
    **auto-closes** if primary pressure climbs back above it — the operator must depressurize
    into the RHR band first.
  - **Adjustable cooldown rate via the heat-exchanger flow split.** New command
    `set_rhr_hx {fraction | pct}` routes more or less of the constant RHR loop flow through
    the heat exchanger vs. the bypass, throttling cooldown *rate* without changing total flow
    or coolant inventory.
  - **Single ECCS card mode indicator.** New `eccs_mode` field (`HPI` / `LPI` / `RHR` /
    `off`) is computed engine-side each step to drive one Emergency Cooling card. **RHR** is
    indicated whenever the suction valve is open.
  - **Automated LPI on LOCA.** LPI remains the low-head/high-flow regime of the merged
    HPI/LPI pump curve, armed automatically by the 11.03 MPa Safety Injection signal (the
    LOCA signal) and delivering as the plant depressurizes — no separate operator action.
  - New snapshot fields: `rhr_valve_open`, `rhr_hx_fraction`, `eccs_mode`.

### Changed
- RHR alignment permissive moved from 3.45 MPa to the 2.76 MPa (400 psi) valve interlock;
  the control-layer auto-align setpoint tracks it.
- `set_rhr` now drives the interlocked suction valve rather than a bare active flag; RHR
  heat removal scales with the HX flow split.
- Operator manual reference regenerated; Blueprint docs updated (`M1` §6.9, `CONTEXT.md`
  §6.5/§6.7, `M4b` §3b, `pwr_synoptic_prerequisites.md`).

### Notes
- UI card layout is intentionally left as an open task; the field/command binding contract
  for the ECCS card is documented in `Blueprint/pwr_synoptic_prerequisites.md` §6.2a.
- Save-file compatible: older saves migrate (`rhr_valve_open ← rhr_active`,
  `rhr_hx_fraction ← 1.0`). `set_dhr` / `set_lpi` remain as deprecated aliases.
