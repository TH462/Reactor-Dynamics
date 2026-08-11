# Traps — evicted from `CLAUDE.md`'s standing-procedure list

**Status: RECORD, not policy.** Every entry here is a real trap that cost a real session, and
none of it is wrong. It lives here rather than in `CLAUDE.md` because that file is paid for on
every turn by every agent and its standing list is capped at **25 bullets** *(OWNER RULING,
2026-08-10: selected "Cap at 25, evict to TRAPS.md" from options I wrote — a selection, not
verbatim words)*. Gated by `test/run_doc_budget.js`, for the reason the themes cap is gated: a
cap written in prose inside the file it governs decays, and this one had none until it was the
last unbounded thing in a file sitting exactly on its word limit.

## The eviction criterion — evict what a GATE already catches

The standing list's job is to warn about things **nothing can tell you**. So when the cap binds,
the entries to move here are the ones where getting it wrong turns a runner red — the trap
announces itself, and the full story is a `TUNING_LOG` search away. What stays in `CLAUDE.md` is
the class no gate can reach: process traps, prose claims, silent-wrongness idioms, and the
"a passing check can be hollow" family.

That is a criterion and not a rule; a plant-specific trap whose gate only fires in a regime
nobody probes belongs back in the file. **If you evict one and it bites someone anyway, that is
the evidence to put it back** — say so in the session log rather than quietly re-adding it.

---

## Evicted 2026-08-10 (the first application of the cap: 30 → 25)

All five are PLANT-SPECIFIC and all five are pinned by a suite that reddens if the number moves.

- **A physically-derived constant can be RIGHT and unshippable, and a solve can conflate the
  MEASUREMENT's temperature with the PLANT's** (from the #419 themes bullet, 2026-08-08):
  K_phys ≈ 304 validates against TMI-2's own clock but inverts the stuck-PORV race under the
  ruled 347× F14 heater, so the shipped K = 2500 is the physical NET under F14 — one pair,
  re-solve together. And `rho_excess` quoted 975 ppm at "the anchor" was benign 5 °C away and
  wrong at 286. Ghost constants: check the CONSUMER first.

- **A new node's capacity must come OUT of the node it split from** (from the #418 themes
  bullet, 2026-08-08): C_tube added on top of coolant 20 silently reopened the RULED heatup
  pace — the chain caught it at 260.7 °C. Splitting a lump conserves its total.

- **A component can sit on a TWO-CLOCK seam** (from the #408 themes bullet, 2026-08-08): the
  relief valve's mass flow runs the real accident clock while its pressure authority keeps the
  transient duty — re-clocking either side alone breaks the other, so preserve the product (the
  F15 K re-solves, twice now). And the terminal melt verdict asks whether the water is COMING
  BACK — a reflooded TMI-style core rewets.

- **A closed-form limit line must be SCALED, never RE-ANCHORED** (#311). Pairing this plant's own
  DNB slope with a fitted intercept ROTATES the line and scrammed the plant at 55.0 s, killing
  the ride-out the 40 % dump exists to teach. Scaling by a margin factor puts the equivalent
  gradients inside the published real bands — the unscaled ones were 1.5–2× steeper than any
  real value, and **that steepness was the tell, visible before the measurement**.

- **Containment's flash gate decides what it sees** (#386, 2026-08-07): a stuck-open PORV
  pressurizes the building MORE than a 10 % break (relief is steam at weight 1.0; break liquid
  is flash-gated), and an SGTR reads NOTHING — it discharges into the SG, and since stage 3 that
  fence extends to hydrogen (geometry-gated transport). `press_gain` is fitted and says so.

## Evicted 2026-08-10b (the cap bound again at 26, adding #437/#439/#393's trap)

- **The two Hot Standby starting points are DIFFERENT PLANTS for a startup** (from the standing
  list, #303): `cold_shutdown` arrives at Mode 3 at **857 ppm**, `hot_zero_power` ships **683** —
  ~561 critical rod steps against 319, and the manual is written for the latter. Only
  `run_procedures_chain` crosses that seam, which is what makes this evictable under the
  criterion above: every number in it is pinned by a suite that reddens if it moves, and the
  seam has a named gate standing on it. **`boron_ppm` ending at 2500 is the fingerprint of an
  unintended ECCS injection.** The moderator model was re-done twice — a **1400 ppm crossover**
  or **−20 pcm/°C** in any document is stale (#260/#263).

  *If a startup goes wrong in a way this would have warned about, that is the evidence to put it
  back — say so in the session log rather than quietly re-adding it.*

## Evicted 2026-08-11 (the develop x backshop merge put both lists over their caps)

Two lanes each added a themes bullet the same night, so the rotation went to 6 against its 5,
and rescuing the evicted one's trap took the standing list to 26 against its 25. Both caps
bound at once; this is what came out.

- **New PWR instruments ship `noise: 0`, and that silently kills their `noisy` failure**
  (from the standing list): the instrument PRNG is one cross-step stream, so an appended
  instrument must declare `noise_failure` or the injected failure has nothing to scale.
  Evictable under the criterion above because **`test/run_m4.js` covers it** — an
  undeclared `noise_failure` shows up there as a `noisy` injection that changes nothing.

- **The bug report's RECORDING was the broken instrument** (the whole #432/#431 themes
  bullet, 2026-08-09). Sampling ran once per BROADCAST, so a 3600x LOCA was two rows under
  a manifest hardcoded to `sample_hz: 1`. Its trap — the fine drain sitting inside the rAF
  paint, one frame late, 1475 rows in and 35 recorded — is **rescued to the standing list**
  rather than retired, because no gate reaches it. The rest is `run_diag_bundle`'s subject
  and is pinned by its 31 checks.
