# ECCS pump merge — change plan (makeup + HPI share a pump)

**Goal (owner, 2026-07-22).** Combine the makeup (CVCS charging) and high-head HPI into
**one pump** — "one pump, two speeds" — and treat **LPI/RHR as its own pump**. No throttle
valve in the diagram (explained as pump speed, not plumbing). Physics/interaction altitude,
not mechanical detail. This reverses the earlier "dedicated ECCS pump" ruling (which was
written on faulty info — real Westinghouse charging pumps *are* the high-head SI pumps).

## What's actually on the board today (verified)

- **Two adjacent pump glyphs:** `imrqp87ueqb` "charging pump" (right, ~760) and
  `imrobnzlha1` "eccs pump" (left, ~660). Both render **art-only** (`ART_ONLY_PUMPS`);
  control lives in separate panels.
- **CHARGING panel** (AUTO/MAN/OFF → `set_charging_pump` + `set_cvcs_auto`) drives the
  charging pump glyph.
- **HPI panel** (START/STOP/AUTO → `set_hpi` / `set_esf_auto hpi`) is the **only** ECCS
  injection control; the eccs-pump glyph lights on `hpi_active`.
- **No RHR/LPI control card on the board.** RHR cooldown is auto (ESF arm + the hot-leg
  suction valve auto-opens < 400 psi). The `rhr-on/off/auto` handlers in `app.js` belong to
  the retired synoptic, not this board.
- Accumulators: own glyph + status (`imrppztrng1`) + isolation valve (`imrppxt2aqd`).

## The decision this forces (D1)

Because there is **no** RHR card to lean on, "make the eccs glyph the RHR/LPI pump" has two
routes:

- **Option A — add an RHR/LPI card.** Matches the literal "its own card" idea, but it's *new*
  UI surface and new player workload (RHR is auto-only today). Against the "minimal mechanics"
  goal. **Not recommended.**
- **Option B — one Safety-Injection actuation drives both pumps (no new card). RECOMMENDED.**
  The HPI panel becomes the **SI actuation**: pressing it starts *emergency injection*, and
  the two pump glyphs show the physics — the **Charging/HPI pump** delivers high-head flow
  immediately; the **RHR/LPI pump** wakes up and delivers the big low-head flow only once
  you've **depressurized into its window** (like the accumulators). LPI is never a button —
  it's automatic, which is also how a real SI signal works (one signal starts every pump).
  RHR *cooldown* stays the auto function it already is.

Option B keeps the player's controls exactly as today (CHARGING = makeup, HPI = start SI),
maps cleanly to two pump glyphs, and teaches the real interaction lesson (**depressurize to
unlock the heavy injection**) with zero new panels. The rest of this plan assumes **B**.

## Change-list

### 1. Engine / physics — `engines/pwr/pwr_primary.js`, `pwr_config.js`
- `injectionFlowInv`: gate the **high-head** term `q_hh` on the shared pump being available
  (`s.charging_pump_running !== false`) — high-head SI *is* the charging pump. Leave the
  **low-head** term `q_lh` independent (that's the RHR/LPI pump).
- `set_hpi` (in `pwr_engine.js`): on SI actuation, **also start the charging/HPI pump**
  (`s.charging_pump_running = true`) so "SI just works" — a real SI signal auto-starts the
  charging pumps. (Edge: operator stopping the pump mid-SI drops high-head; acceptable.)
- Expose the split for the glyphs: add snapshot fields `hpi_flow_hh` (high-head, → the
  Charging/HPI pump) and `hpi_flow_lh` (low-head, → the RHR/LPI pump). Migratable contract
  addition; old saves default 0.
- Comments: flip the `emergency` block + `injectionFlowInv` from "dedicated ECCS pump" to
  "the charging pump is the high-head SI pump (shared); RHR/LPI is the low-head train."

### 2. Board wiring — `ui/diagram/board/pwr_board_wiring.js`
- `imrqp87ueqb` (Charging/HPI pump) `PUMP_FLUID`/props: active + flow reflect makeup **or**
  high-head SI (`hpi_flow_hh > 0`). Speed visibly higher under SI = "runs harder."
- `imrobnzlha1` (RHR/LPI pump) props: active = low-head injecting (`hpi_flow_lh > 0`) **or**
  `rhr_active`; flow reflects whichever. **No longer** lights on high-pressure `hpi_active` —
  the nice tell that at TMI pressures only the charging/HPI pump runs.
- `VALUES`: repoint the two ECCS indications — `imrmromyxdq` (flow) and `imrmru52f8l`
  (discharge psi) — to the pump they now describe (likely the RHR/LPI pump for the low-head
  line; add a high-head readout on the charging side if wanted).
- `BUTTONS` HPI triad: behavior unchanged (`set_hpi` = SI actuation); only meaning shifts.

### 3. Board data (labels) — `ui/diagram/board/pwr_board_data.js` (generated, hand-editable)
- Rename glyph `name`: `"charging pump"` → `"Charging / HPI Pump"`; `"eccs pump"` →
  `"RHR / LPI Pump"`.
- HPI box `title`: `"HPI"` → `"SAFETY INJECTION"` (or keep "HPI" — D3).
- Keep VCT/RWST source labels as flavor; optionally note the pump swaps to RWST on SI.
- Verify no regeneration step overwrites this (the driver uses `extraItems()` precisely to
  avoid touching generated data — confirm before/after).

### 4. Docs
- `BUILD_DECISIONS.md`: new entry reversing the dedicated-pump ruling → shared charging/HPI
  pump + separate RHR/LPI pump; record Option B.
- `TUNING_LOG.md`: session-log entry.
- `Manuals/03`: describe the Charging/HPI pump ("one pump, two speeds") and the RHR/LPI pump;
  repack.

### 5. Gates
- `run_pwr`, `run_behavior`, `run_ops pwr` (verify the `q_hh`-gating + `set_hpi`-starts-pump
  don't break TMI/LOCA/SGTR — those all have the charging pump running, so expected clean).
- `verify_e2e_ui` (board renders; the two glyphs animate correctly).
- Manual repack + `run_procedures`.

## Open decisions for the owner
- **D1** — Option B (recommended, no new card) vs Option A (add RHR/LPI card).
- **D2** — adopt the loss-of-charging-pump-kills-high-head-SI coupling? (Realistic; SI
  auto-starts the pump so it "just works," but a deliberately-stopped pump during SI loses
  high-head. Verify no scenario depends on the old always-on behavior.)
- **D3** — label wording: "Charging / HPI Pump" + "RHR / LPI Pump" + "SAFETY INJECTION"?
- **D4** — expose `hpi_flow_hh` / `hpi_flow_lh` snapshot fields (cleanest for the glyphs) —
  OK to add to the contract?
