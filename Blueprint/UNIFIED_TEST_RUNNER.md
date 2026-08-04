# Unified Test-and-Compare Runner — blueprint (owner request, 2026-07-21)

**Goal:** one command that drives the sim through EVERY suite and compares results
against the desired-behavior catalog — the standing retune harness for the SLS-100
and the template for the RBMK and BWR tuning passes.

## What exists already (the pieces)

| Piece | Role today |
|---|---|
| `test/run_behavior.js` + `behavior_pwr.js` | THE model: one probe per catalog ID, strict xfail, auto gap report (`Diagnostic/BEHAVIOR_GAP_REPORT.md`), COVERAGE map so nothing is silently unpinned |
| `run_pwr` / `run_ops` / `run_autoctl` / `run_m5` / `run_campaign` | Regression gates (sim-vs-itself) at engine / M4 / channel / lifecycle / mission level |
| `Blueprint/PWR_BEHAVIOR_CATALOG.md` | The desired-behavior spec the battery bands come from |

## Design: `test/run_all.js`

1. **One process, every gate.** Runs behavior → pwr → ops → autoctl → m5 → campaign in
   sequence, collecting each runner's structured results (they already build
   `{name, checks:[{desc, observed, expected, pass}]}` arrays — expose them instead of
   only printing).
2. **One report.** `Diagnostic/FULL_MATRIX.md` + `.json`: per-suite tallies, every
   failed/xfail check with observed-vs-expected, and a **delta section** — observed
   values that MOVED since the last run (stored baseline JSON) even where they still
   pass. That delta view is the retune instrument: turn a knob, run once, see every
   behavior that shifted.
3. **Catalog linkage.** The battery's COVERAGE map already ties catalog IDs to probes;
   extend the report to group by catalog ID so the output reads as "spec item → status
   → observed numbers," not as test files.
4. **Plant template.** The battery is plant-parameterized in structure (probes +
   XFAIL + COVERAGE consumed by a generic runner). RBMK/BWR passes start by writing
   `Blueprint/RBMK_BEHAVIOR_CATALOG.md` (same FG structure: identity → feel goals →
   ratios → invariant/character tiers), then `behavior_rbmk.js` against it — the
   runner and report generalize unchanged.

## Order of work (next session on this)
1. Refactor the five runners to export results (keep CLI behavior identical).
2. `run_all.js` + FULL_MATRIX report + baseline-delta store.
3. Regroup by catalog ID; add the `identity` table to the report header.
4. RBMK catalog draft using the SLS-100 catalog as the template.
