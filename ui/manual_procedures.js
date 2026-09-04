/*
 * ui/manual_procedures.js — authored operator procedures (→ RD.MANUAL_PROCEDURES),
 * keyed by profile (pwr / rbmk_pre / rbmk_post / bwr). SINGLE INTEGRATED VOICE.
 *
 * These are AUTHORED but ENGINE-VALIDATED, and they are the Instructor's (M6)
 * source of truth: `test/run_procedures.js` drives each procedure through its engine
 * and checks each step's `acc` (acceptance) predicate + the proc-level `guard`. The
 * same predicates are what the Instructor will gate and grade on — one artifact.
 *
 * Procedure: { id, category, title, purpose, from, prereq[], cautions[], steps[], guard, outcome }
 *   category: startup | power | control | shutdown | emergency | accident
 *   narrative:true  → an accident walkthrough; not run by the harness (the engine
 *                     flagship suite owns its physics, CONTEXT §9).
 * Step: { text, control, target, cmd, hold, acc, saw, note, ramp, why, accs, wait_hint }
 *   text    integrated-voice instruction     control  on-screen control to use
 *   target  the value/limit to drive to      cmd      command issued (rod group 'control'/'shutdown' resolved)
 *   hold    seconds to run after the command  acc      {p,op,v[,tol]} checked at END of the step
 *   saw     {p,op,v} true at least once during the step   note  caution / what to watch
 *   why     OPTIONAL layman's teaching prose (#244 items 2/9) — the card's collapsible
 *           fourth block. `text` stays the concise action; `why` carries the what-and-why
 *           for someone new to the sim. Never load-bearing: harnesses ignore it.
 *   accs    OPTIONAL array — MULTI-CHECK-OFF (#244 item 8). Entries are either
 *           {p,op,v[,tol],label} (an acceptance like `acc`, graded with the same
 *           debounce) or {cmd,label} (a command the operator must be SEEN to issue —
 *           the 1/M "point plotted" case; family-matched like the step's own `cmd`).
 *           The step completes when ALL entries are met. `label` is the card's line
 *           for that entry. When `accs` is present it REPLACES `acc` (author one or
 *           the other; `acc` remains the common single-check case).
 *   wait_hint OPTIONAL string — rendered as a time-acceleration suggestion on long
 *           steps (#244 M5→3 item 5). Prose only; harnesses ignore it.
 *   next    (procedure-level) OPTIONAL id of the chain's next checklist — the
 *           completion card offers "Next: <title> ▸ Start" (#244 the round trip).
 *   ramp    [{action, arg, points:[…]}] — a setpoint WALKED along a polyline across
 *           `hold` instead of stepped once: the operator holding the ▼ on a setpoint
 *           box, not typing one number (#310, first used by PWR-N15's cooldown legs).
 *           When present the step's `cmd` is NOT issued — `cmd` stays as the
 *           REPRESENTATIVE action the instructor watches for, and the ramp is what
 *           drives the plant. Replay-side only: the live checklist never issues `cmd`
 *           either (ui/app.js renders text + highlights and grades off `acc`), so a
 *           ramp costs the UI nothing. Both procedure gates implement it.
 * guard: { never_melted, never:[{p,op,v}] } checked across the whole run.
 * precond: [{p, op, v, tol, text}] — ENTRY conditions (#395), the machine-checkable
 *   layer under the `prereq` prose: graded live, instrument-first, by the Instructor
 *   while a checklist runs (layers/instructor_layer.js _stepChecklist). Unmet rows
 *   WARN — a banner in the checklist panel plus one instructor comment — and NEVER
 *   block *(OWNER RULING, 2026-08-06: selected "Warn, never block" from three
 *   options put to him — a selection, not verbatim words)*. Distinct from `guard`
 *   (a whole-run invariant) and from `from:` (a harness/reset input, not a check).
 *   `text` is the banner's human line; verdicts ship in the snapshot, prose here.
 * op ∈ >,<,>=,<=,~ (~ within tol of v).
 */
;(function (RD) {
  'use strict';

  // Reusable observation step (no command). `hl` = control/indication labels the UI
  // glows when the step is hovered in the live checklist (ui/app.js glowLabels).
  // `why` is the expandable details paragraph (#607 item 5); `past` is the catch-up
  // predicate (#607 item 7) — skip this confirm when the plant has already left it.
  function obs(text, acc, note, hl, why, past) {
    var s = { text: text, acc: acc || null, note: note || null, hl: hl || null };
    if (why) s.why = why;
    if (past) s.past = past;
    return s;
  }

  // ---- PWR -----------------------------------------------------------------
  var PWR = [
    // PWR-N01 — commercial pump-heat heatup. Measured full-stack (cold_shutdown
    // IC, default lineup): settles 567.0 °F (297.2 °C) at ~12.3 plant-h (#419 real rates), ρ ≈ −2828
    // pcm, zero rod motion. The old nuclear-from-cold heatup path was removed —
    // not a commercial NOP (heatup is subcritical; approach is hot, N03).
    {
      id: 'pwr_heatup', category: 'startup', manual_ref: 'PWR-N01',
      title: 'Mode 5, Cold Shutdown → Mode 3, Hot Standby — plant heatup (pump heat)',
      purpose: 'Take the plant from Mode 5, Cold Shutdown to Mode 3, Hot Standby on reactor-coolant-pump heat alone: start the RCPs, pressurize to NOP, bottle the steam generator, re-align the SI accumulators, and ride temperature up with the reactor never critical. This is the commercial heatup and what mission "The Big Warm-Up" drives.',
      // #524 (2026-08-31): cold_shutdown is REAL again — the water-property floor moved
      // 0.002 MPa and PWR2 carries a Mode 5 IC (122 degF / 363 psia / 918 ppm). The #532
      // hot_shutdown fence this line wore for a day is retired with the wall that forced it.
      from: 'cold_shutdown',
      prereq: ['Plant in Mode 5, Cold Shutdown: cold (~122 °F / 50 °C), depressurized (~363 psi / 2.5 MPa), subcritical, RHR in service.', 'RCPs available to start (heat source).'],
      // #395 — machine-checkable entry conditions, MEASURED on the cold_shutdown
      // IC (tavg 50.0 °C, 2.50 MPa, power 0): every row reads MET on its own IC.
      precond: [
        { p: 'tavg_c', op: '<', v: 95, text: 'Plant cold — Mode 5 (Tavg ≈ 122 °F / 50 °C)' },
        { p: 'pressure_mpa', op: '<', v: 5, text: 'Depressurized (≈ 363 psi / 2.5 MPa)' },
        { p: 'power_pct', op: '<', v: 1, text: 'Reactor shut down' },
      ],
      cautions: [
        'This heatup runs on REAL rates (#419 wave 1 — the training compression is retired; time acceleration carries the pacing). Measured on THIS engine (2026-08-31, engine-direct): the pumps alone warm the Mode 5 plant at 94.9 °F/hr (52.7 °C/hr) over the first half hour, and at the rated rotor the pump-heat class runs up to 113.7 °F/hr (63.2 °C/hr) — ABOVE the 100 °F/hr administrative limit, so rate compliance is yours: trim the RHR heat exchanger to bleed the excess (the same lever the cooldown throttles). The Pressure SP walks at the sourced 0.23 psi/s heater class.',
        'The heat source is the reactor coolant pumps (pump_heat_frac 0.55 % of rated core heat at full flow) plus the pressurizer heaters. Do NOT pull the CONTROL bank or dilute — Hot Standby means hot AND subcritical, and the control bank stays at its cold-shutdown position the whole way. The SHUTDOWN bank is the exception and has its own step: Mode 5 ships with both banks inserted (measured on this engine: ρ = −5807 pcm on 918 ppm; the bank alone is worth 3676 pcm), and withdrawing the shutdown bank is a prerequisite for the approach to criticality, not part of it.',
        'The steam dump is a COARSE lever at these powers: measured, a 5 % manual dump demand is roughly ten times pump-heat generation and reverses the heatup at −263 °F/hr (−146 °C/hr) anywhere above about 302 °F (150 °C); below ~219.2 °F (104 °C) the same demand only ARRESTS the climb. To slow or hold a heatup, secure the RCP — measured, that takes the rate to 0.004 °F/hr.',
        'Keep the turbine OFF LINE and the dumps SHUT so the SG bottles: heat crossing the tubes then has nowhere to go but into secondary pressure, which rides up with Tavg. A turbine left in FOLLOW opens its governor and takes the whole heat source (~6 % open is enough on pump heat alone). The cold_shutdown IC spawns already off line (#251); the Disconnect Grid step confirms rather than changes.',
        'Step 7 (re-align the SI accumulators) is YOURS, nothing does it for you, and it belongs INSIDE step 6 rather than after it — on the real pressurization clock the compliant 600-to-1000 psi window is ~14 plant-minutes wide (measured: opens ~+9 min, shuts ~+23 min) and closes about an hour and a half before the full pressurization completes. The cold lineup ships them isolated — correct below their 600 psi (4.14 MPa) cover gas — and re-alignment is deliberately procedural *(OWNER RULING, 2026-07-30: "lets leave opening of the accumulators to the procedure instead of auto opening them.")*. Skip it and you reach Mode 1 with no passive injection; the SI ACCUM ALIGNED annunciator (PWR-A32) is silent on this case because shut tanks are what it clears on.',
        'Engage Feed AUTO at the start (step 4) while level is still at its cold 65 %. A standing manual feed demand fills a generator that is not yet boiling. On pump heat the SG barely boils, so AUTO simply holds the captured setpoint — measured, level stays ~65 % across the whole 12 plant-hour ride.'
      ],
      auto_channels: ['feed_sg'],
      steps: [
        obs('Confirm Mode 5, Cold Shutdown: Tavg ≈ 122 °F (50 °C), pressure ≈ 363 psi (2.5 MPa), reactivity well below zero, RHR aligned.', { p: 'tavg_c', op: '<', v: 95 }),
        { text: 'Start the Reactor Coolant Pumps (RCP card → Run). That is your heat source, and the steam generator needs the flow to see it. RHR auto-isolates as pressure rises past its 600 psi (4.14 MPa) AUTOCLOSURE interlock — a different setpoint from the 400 psi (2.76 MPa) block-open permissive that governs putting RHR in service (#288).',
          control: 'RCP Run/Stop', target: 'flow ~100 %',
          cmd: { action: 'set_rcp', running: true }, hold: 30,
          acc: { p: 'pump_flow_pct', op: '>', v: 90 },
          hl: ['Reactor Coolant Pumps (RCP)', 'RCP Run/Stop'] },
        { text: 'Withdraw the SHUTDOWN BANK to fully out. Mode 5 holds both banks on the bottom, and the shutdown bank is worth 3676 pcm of the margin keeping you there — it is not a step toward criticality, it is the prerequisite for one, and every mode above this assumes it done. Drive it in manual bank control; full travel is 912 steps, about 3 plant-minutes at Fast.',
          control: 'Shutdown Bank', target: 'bank fully withdrawn, 912 / 912',
          note: 'Real practice: "The shutdown banks are always in the fully withdrawn position during power operations and are moved into this position at a fixed speed in manual bank control PRIOR TO CRITICALITY" (WTSM 8.1.1, ML11223A252). It is verified on the Mode 5 → 4 leg (App 19-1 A.12) and must be complete within 15 minutes of any control-bank withdrawal (App 19-1 C.7). What you are spending is time, not margin you will miss today: measured, an unattended dilution at the plant make-up rate takes 79 minutes to reach criticality with this bank IN and trips the source range inside the hour with it OUT. So withdraw it deliberately, and do not walk away from a dilution afterwards.',
          cmd: { action: 'rod_nudge', group_id: 'shutdown_rods', steps: 912, speed: 'fast' }, hold: 240,
          hl: ['Shutdown Bank'] },
        { text: 'Confirm the generator is off line: Disconnect Grid. A cold plant has no business following load — on pump heat alone a governor left in FOLLOW cracks open and drains the heatup.',
          control: 'Turbine Load', target: 'generator disconnected, governor shut',
          note: 'The cold_shutdown board SPAWNS off line (#251 — breaker open, rotor at rest, load mode disconnected). This step confirms rather than changes. Leave the turbine off until the end of the startup path.',
          cmd: { action: 'disconnect_grid' }, hold: 10,
          hl: ['Turbine Load', 'Main Breaker'] },
        { text: 'Put steam-generator level control in AUTO now, while level is still at its cold 65 % (STEAM GEN FEED → AUTO on the board). The three-element channel captures the level it finds as its setpoint.',
          control: 'Feed Pumps', target: 'Feed AUTO engaged, SG level ≈ 65 %',
          note: 'On pump heat the SG barely boils, so AUTO simply holds. What it prevents is a standing manual feed demand that keeps filling a generator nobody is boiling.',
          cmd: { action: 'set_auto_channel', channel_id: 'feed_sg', engaged: true }, hold: 5,
          hl: ['Feed Pumps', 'SG Level'] },
        { text: 'Set the Steam Dump Setpoint to the no-load anchor (1020 psi / 7.03 MPa — Ginna\'s sourced 1005 psig no-load point, #419 wave 3) so the secondary bottles with the heatup instead of dumping it. Leave the dump shut.',
          control: 'Dump SP', target: '1020 psi (7.03 MPa)',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 7.03 }, hold: 5,
          hl: ['Dump SP', 'Steam Dump'] },
        { text: 'Raise the Pressurizer Pressure Setpoint to 2235 psi (15.41 MPa). The setpoint walks up at the real full-heater pace — 0.23 psi/s (1.586e-3 MPa/s) — and measured full-stack, normal operating pressure arrives in about 1.8 plant-hours (#419 wave 1: the compressed clock is retired; ride it at time acceleration). The accumulator window in the next step opens and shuts inside this climb. Watch RHR isolate on the way past its 600 psi (4.14 MPa) autoclosure interlock (#288).',
          control: 'Pressure SP', target: '2235 psi (15.41 MPa)',
          cmd: { action: 'set_pressure_setpoint', mpa: 15.41 }, hold: 9000,
          acc: { p: 'pressure_mpa', op: '>', v: 15.0 },
          hl: ['Pressure SP', 'Plant Pressure'] },
        { text: 'Re-align the Safety Injection accumulators (isolated for the cold lineup) AS PRESSURE PASSES 600 psi (4.14 MPa) — do not wait for the previous step to finish. They must be aligned before 1000 psi (6.895 MPa), where LCO 3.5.1 requires them OPERABLE. On the real pressurization clock (#419 wave 1, measured full-stack) the window is ~14 plant-minutes wide: 600 psi at ~+9 min from the Pressure SP command, 1000 psi at ~+23 min, normal operating pressure at ~1.8 plant-hours — it closes about an hour and a half before the pressurization completes. Nothing opens them for you.',
          control: 'Accumulator valve', target: 'accumulators armed',
          note: 'Owner ruling 2026-07-30: re-alignment is procedural, no automatic open. Skip this and Mode 1 has no passive injection; PWR-A32 will not tell you.',
          cmd: { action: 'open_accumulator_valve' }, hold: 5,
          acc: { p: 'accumulator_valve_open', op: '>', v: 0 },
          hl: ['Accumulator valve'] },
        { text: 'Ride the heatup. Tavg climbs at roughly 30 °F/hr (16.7 °C/hr) on pump heat — about twelve plant-hours cold to the no-load anchor. Monitor Tavg and its rate, secondary pressure tracking Psat(Tavg), pressurizer level swelling on thermal expansion, and the reactor staying exactly where you left it. Do not pull rods. Do not dilute. If you need to slow down, secure an RCP.',
          control: '(observe)', target: 'Tavg ≥ 541.4 °F (283 °C), still subcritical',
          note: 'Measured full-stack with no rod motion (#419 wave 1, real rates): Mode 3 entry (~350 °F / 176.7 °C) at ~4.6 plant-h; 546.8 °F (286.0 °C) at ~11.3 plant-h; settles 567.0 °F (297.2 °C) at ~12.3 plant-h, ρ = −2828 pcm on 856.8 ppm. The first hour still reads faster because the heater/pressurization leg adds heat early, not because the pump-heat ramp is quick. Hold 42 000 s: the observe step starts after the ~1.8 plant-h pressurization leg, so ~9.7 h of ride remain to the 545 °F acceptance — the hold covers it with margin (#418 A1 set 42 000 on the derived secondary clock; re-checked at #419).',
          hold: 42000,
          saw: { p: 'tavg_c', op: '>', v: 150 },
          acc: { p: 'tavg_c', op: '>', v: 283 },
          hl: ['Tavg', 'Plant Pressure', 'SG Pressure'] },
        obs('Confirm Mode 3, Hot Standby: hot at the no-load band, pressurized, SUBCRITICAL with the control bank never moved. Ready for the approach to criticality (PWR-N03 / startup checklist).',
          { p: 'plant_mode', op: '~', v: 3, tol: 0.1 }),
        obs('Confirm the reactor stayed shut down: power near zero, reactivity deeply negative (measured arrival ρ ≈ −2828 pcm).',
          { p: 'reactivity_pcm', op: '<', v: -300 }),
        obs('Confirm power is still source-range — this heatup never made fission heat.',
          { p: 'power_pct', op: '<', v: 1 }),
      ],
      guard: {
        never_melted: true,
        never: [
          { p: 'fuel_temp_c', op: '>=', v: 1200 },
          // Pump-heat heatup must never take the core critical. A rod pull or a
          // dilution that crossed zero would mean this procedure has become the
          // nuclear variant by accident.
          { p: 'reactivity_pcm', op: '>', v: 0 },
          { p: 'power_pct', op: '>', v: 1 },
        ],
      },
      outcome: 'Plant at Mode 3, Hot Standby: hot, pressurized, subcritical with zero rod motion. NOT yet ready to pull rods: the heatup dilutes nothing, so you are still at cold-shutdown boron (~857 ppm) and criticality sits near 561 steps instead of the 319 the startup assumes. Work the estimated critical condition and dilute to it first — PWR-N02 step 15.',
    },
    {
      id: 'pwr_startup', category: 'startup', manual_ref: 'PWR-T03',
      title: 'Mode 3, Hot Standby → Mode 1, At Power — startup to power',
      purpose: 'Take the reactor from Mode 3, Hot Standby (subcritical, hot) through criticality (Mode 2, Startup), across the 5 % boundary into Mode 1, At Power, and put the turbine on line — the full startup. You will use the 1/M (inverse-count) plot to predict criticality, hand indication from the Source Range to the Intermediate Range, and watch the Startup Rate (SUR) and reactor period on the way up.',
      from: 'hot_zero_power',
      prereq: ['Plant at Mode 3, Hot Standby: subcritical, hot, at operating temperature/pressure.', 'Reactor Coolant Pumps (RCP) running — forced flow established.', 'Control bank inserted; shutdown bank parked withdrawn; boron high (the plant is held subcritical).'],
      // #395/#396 — machine-checkable entry conditions, MEASURED on hot_zero_power
      // (tavg 297.0 °C, 15.41 MPa, power 0, boron 682.9 ppm). The boron row is THE
      // heatup→startup seam (#396): a pump-heat heatup arrives at ≈ 857 ppm, where
      // criticality sits ≈ 561 steps instead of the 319 this checklist assumes —
      // 173.8 ppm outside the ±70 band, so the banner names it before a rod moves.
      // ±70 ppm ≈ the caution's ±750 pcm ECC acceptance band at ~10.6 pcm/ppm.
      precond: [
        { p: 'tavg_c', op: '~', v: 286, tol: 8, text: 'Hot Standby at the no-load temperature (≈ 546.8 °F / 286 °C)' },
        { p: 'pressure_mpa', op: '~', v: 15.41, tol: 0.5, text: 'At normal operating pressure (2235 psi / 15.41 MPa)' },
        { p: 'power_pct', op: '<', v: 1, text: 'Subcritical — the withdrawal starts from a shut-down core' },
        { p: 'boron_ppm', op: '~', v: 705, tol: 70, text: 'Boron at the estimated critical condition (≈ 705 ppm — PWR-N02 step 15; a pump-heat heatup leaves ≈ 857 ppm and criticality moves well outside the band)' },
      ],
      cautions: ['Withdraw in small bursts, letting the count rate settle between them — target SUR ≤ 1 decade per minute (DPM) and reactor period ≥ 30 s. The SUR HI alarm comes in at 1 DPM and rod withdrawal is blocked at 1.5 DPM (clearing below 0.8); insertion is never blocked. The fine-step drive (912 steps full travel) puts one step at roughly 1 ¢ (6.5 pcm) near the critical band — single-step nudges at Slow for the final approach.', 'Plot ENOUGH 1/M points. The prediction always reads high early and walks down as you add points, so an early estimate is not a target — it is an upper bound. Two points predict ~step 711 against a true ~318; three still say ~484. It takes about six, with the bursts shrinking as you close in, to get within a couple of steps. Never withdraw straight to the predicted position — creep up on it.', 'Work out where criticality should be BEFORE you move a rod — an estimated critical condition, not a guess. The worksheet and the reference curves are in manual 09 §7.5: bank integral worth, differential boron worth at your Tavg, and critical boron by temperature and bank position. THIS CHECKLIST starts Mode 3 at ~705 ppm with the bank in (#419 wave 3: the Ginna anchor re-trimmed the reference boron; criticality stays near 319 steps — about 35 % withdrawn, comfortably inside the insertion limit). That is the answer for ONE boron, not a constant of the plant: a unit that came up on the pump-heat heatup is at ~857 ppm — ~150 ppm and roughly 240 steps out, beyond the acceptance band below. Dilute to the estimated critical boron first — PWR-N02 step 15. The prediction carries a ±750 pcm acceptance band (roughly 159 to 421 steps here); criticality outside it means the estimate was wrong, so stop and re-work it rather than continuing to pull. The 1/M plot is how you close on the prediction, not a substitute for having made one.', 'Secure the Source Range BEFORE its counts reach the amber high-flux caution (the SR high-flux trip at 1e5 cps will scram the ascent). Once the Intermediate Range is on scale, the handoff is safe.', 'Mind the Steam Generator. Below the point of adding heat it barely moves, but from the moment power starts warming the coolant the SG boils down, and on this ascent the turbine is still offline — the steam dump is drawing steam nobody is replacing. Hold level with the three-element Feed AUTO channel (step 3). If you let auxiliary feedwater take it instead, AFW parks the level at about 21 % — inside the amber band, four points above the low-low trip — and holds it there indefinitely.', 'Below the point of adding heat there is no temperature feedback to hold you anywhere — power goes wherever the reactivity you left in takes it, however small. Sustaining even a gentle 1 DPM ramp means carrying ~+200 pcm, and ALL of it has to come back out to level off. Take it out in one decisive drive, not in taps: the plant runs while you tap.'],
      steps: [
        { text: 'Confirm the plant is ready: subcritical — the Source Range count rate is steady, not climbing — hot (Tavg ≈ 546.8 °F / 286 °C, the no-load point), pressurized (≈ 2233 psi / 15.4 MPa), Reactor Coolant Pumps running.',
          control: '(observe)', target: 'subcritical, hot, pumps running', hold: 2,
          acc: { p: 'tavg_c', op: '~', v: 286, tol: 1.5 },
          hl: ['Source Range', 'Tavg', 'Plant Pressure', 'Reactor Coolant Pumps (RCP)'] },
        { text: 'Check the nuclear instruments (NIS): the Source Range (SR) counter reads a few hundred counts per second — the neutron source keeping the core visible — and the Intermediate Range (IR) is on scale (above the P-6 permissive). These are your eyes for the approach.',
          control: '(observe)', target: 'SR counting, IR on scale', hold: 2,
          acc: { p: 'sr_counts_cps', op: '>', v: 100 },
          hl: ['Source Range', 'Intermediate Range'] },
        { text: 'Set up the heat sink before you make any heat: put steam-generator level control in AUTO (STEAM GEN FEED → AUTO on the board). Level is at its nominal 65 % now, and the three-element channel captures that as its setpoint — so engage it HERE, while the number is right.',
          control: 'Feed Pumps', target: 'Feed AUTO engaged, SG level ≈ 65 %',
          note: 'Do this first and you will not think about it again. Skip it and nothing happens until the point of adding heat — then the generator starts boiling down with no regulator, auxiliary feedwater picks it up around 20 %, and the plant sits in the low amber band for the rest of the ascent. AFW is an emergency sink, not a level control system: it holds you off the trip, it does not put the level back. Note that any manual feed-pump command later takes this channel back to MAN.',
          cmd: { action: 'set_auto_channel', channel_id: 'feed_sg', engaged: true }, hold: 5,
          hl: ['Feed Pumps', 'SG Level'] },
        { text: 'Set the 1/M baseline BEFORE moving any rods: open the 1/M PLOT tool (diagram, lower-left) and press "Plot point". This captures the shutdown count rate as the 1.0 reference every later point is measured against.',
          control: '1/M Plot', target: 'baseline captured (point 1)',
          note: '1/M = C₀ / C. As you approach criticality the count rate C climbs, so 1/M falls toward zero — where the trend line crosses zero is the predicted critical rod position. The plot fits the LATEST three points, so the estimate keeps sharpening as you add more.',
          // The 1/M points live in the UI panel, not the snapshot, so there is no
          // instrument to grade — pressing "Plot point" IS the evidence. Not a plant
          // command: the instructor consumes it, the engine never sees it (#202).
          cmd: { action: 'plot_1m_point' },
          hl: ['1/M Plot Tool', 'Source Range'] },
        { text: 'First burst: withdraw the Control Bank at Norm, release to stop, let the count rate settle — then press "Plot point" again. Two points draw a line. Read where it crosses zero: it will predict criticality far PAST where the reactor actually goes critical, and that is normal. Down here the rods are in the flat toe of the worth curve, so the early trend is too shallow. Do not trust this number yet.',
          control: 'Control Bank', target: 'point 2 — first (over-)estimate',
          note: 'On the CONTROL GROUP card: set Rod Speed (S/M/F), then hold WITHDRAW; release to stop motion. Two points predict ~step 711 against a true ~318 — the error is ~390 steps, and always on the far side.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 138, speed: 'normal' }, hold: 60,
          acc: { p: 'sr_counts_cps', op: '>', v: 550 },
          hl: ['Control Bank', '1/M Plot Tool', 'Source Range'] },
        { text: 'Second burst — smaller, because every point from here is worth more than the last. Withdraw, settle, plot. Three points now, and the prediction has pulled in a long way, but it is still tens of steps beyond the truth. This is the step most people stop at, and it is not close enough to withdraw against.',
          control: 'Control Bank', target: 'point 3 — still ~100 steps late',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 90, speed: 'normal' }, hold: 60,
          acc: { p: 'sr_counts_cps', op: '>', v: 850 },
          hl: ['Control Bank', '1/M Plot Tool', 'Source Range'] },
        { text: 'Third burst: withdraw, settle, plot. Point 4 — the fit is now working on points that sit on the steep part of the curve, and the prediction drops inside about twenty steps of actual. Keep the bursts shrinking as the estimate tightens.',
          control: 'Control Bank', target: 'point 4 — inside ~25 steps',
          note: 'Keep each burst small enough that the Startup Rate stays under 1 DPM. Bigger bursts raise the rate faster than the count rate settles, and the rod-withdrawal block will stop you at 1.5 DPM.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 44, speed: 'normal' }, hold: 60,
          acc: { p: 'sr_counts_cps', op: '>', v: 1400 },
          hl: ['Control Bank', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Fourth burst — small now. Withdraw, settle, plot. Point 5 lands the prediction within roughly ten steps, and the count rate is climbing visibly between plots. You are close.',
          control: 'Control Bank', target: 'point 5 — inside ~12 steps',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 22, speed: 'normal' }, hold: 60,
          acc: { p: 'sr_counts_cps', op: '>', v: 2250 },
          hl: ['Control Bank', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Last plotted burst — a nudge. Withdraw, settle, plot. Point 6 is your working number: the prediction is now within a handful of steps and still reads slightly HIGH, which is the safe side. Stop here and take the rest by creeping — never withdraw straight to the predicted position.',
          control: 'Control Bank', target: 'point 6 — the working prediction',
          note: 'Six points get you inside ~8 steps of true criticality; three get you 79 steps past it. The extra plots cost a minute each and are the whole reason the method works.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 12, speed: 'normal' }, hold: 60,
          acc: { p: 'sr_counts_cps', op: '>', v: 3500 },
          hl: ['Control Bank', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Perform the SR→IR handoff: with the IR on scale, secure the Source Range detector (SR DET → off). Its high-flux trip (1e5 cps) would scram the ascent; the Intermediate Range carries the indication from here. Do this while SR counts are still below the amber caution.',
          control: 'SR detector', target: 'SR de-energized',
          cmd: { action: 'set_sr_detector', on: false }, hold: 5,
          acc: { p: 'sr_energized', op: '<', v: 1 },
          hl: ['SR detector', 'Source Range', 'Intermediate Range'] },
        { text: 'Creep up on criticality: withdraw at Slow in single steps. The reactor goes critical and power begins to climb — watch the Startup Rate (SUR) and keep the reactor period long.',
          control: 'Control Bank', target: 'critical, SUR ≤ 1 DPM, period ≥ 30 s',
          note: 'One fine step is ~1 ¢ (6.70 pcm) near the band. If the period drops below 30 s, stop or insert — the reactor is accelerating.',
          // WHERE 26 COMES FROM (#263 item 2). It was originally found by SWEEPING 22 / 26 / 30
          // and keeping the one that landed inside the authored 1–3 % band — refitting content
          // until the gate passes, which is what HR10 warns against. Derived 2026-07-30, and the
          // sweep's answer turns out to be the derived one. Every link measured:
          //
          //   the five plotted bursts sum to 138+90+44+22+12  = 306 steps
          //   critical position at the startup IC (683 ppm)   = 319 steps   [ρ(318) = −3.1,
          //                                                                  ρ(319) = +3.5 pcm]
          //   so reaching critical costs                        13 steps
          //
          //   power at the last plotted point (ρ = −90 pcm)  = 6.25e-4 %
          //   the level-off target, the point of adding heat  ≈ 1 %
          //   decades to cover  log10(1 / 6.25e-4)            = 3.20
          //   the authored hold before the level-off drive    = 600 s = 10 min
          //   ⇒ the ascent must average                         0.32 DPM
          //   ρ that produces 0.32 DPM (measured, held at a fixed position)
          //                                                   ≈ 85 pcm
          //   differential bank worth through the band        = 6.70 pcm/step (1.03 ¢)
          //   ⇒ steps of excess                                 85 / 6.70 ≈ 13
          //
          //   creep = 13 (to critical) + 13 (excess) = 26 steps.
          //
          // PRECISION — stated because that arithmetic reads cleaner than it is. Run as a script
          // rather than by hand, the excess comes out 14.7 steps, so the derivation predicts 27.7
          // against the 26 authored. It is good to about ±2 steps, NOT exact, and the reason is
          // that SUR is not constant at a fixed rod position: the same 13 steps above critical
          // measures 0.339 DPM at 120 s and 0.285 DPM at 240 s, so "the ρ that gives 0.32 DPM" is
          // a band rather than a number. The acceptance below is ±4 steps wide, so 26 sits inside
          // comfortably — but do not read this as a formula that returns 26 exactly.
          //
          // VALIDATED OUT OF SAMPLE — the HR10 "check it against the OLD behaviour too" test, and
          // the reason this is a derivation rather than a restatement of the sweep. The 600 s hold
          // PREDATES this creep and did not move when the plant did: before #260 the 1/M bursts
          // were 120+50+30+15+8 = 223 and the creep was ELEVEN steps, at the same 600 s. Running
          // the identical derivation against that plant — different boron (363 ppm), different
          // critical position (224), different differential worth (9.50 pcm/step) — predicts
          // 10.8 steps against the 11 that was authored. A relationship that lands on the authored
          // value for two different plants, one of which it was never fitted to, is doing real work.
          //
          // So the hold is NOT co-fitted with the creep, which was the obvious way this could have
          // been circular. It is still an AUTHORED number though: the manual's own low-power hold
          // (PWR-N04, `Manuals/04`) specifies no duration at all — its acceptance is "SUR near 0;
          // power stable ≤ 5 %". Nothing sources 600 s. What is derived is the creep GIVEN the
          // hold, and that is the honest claim.
          //
          // Confirmed at the layer this procedure actually runs at (full stack, via
          // test/measure_stack.js, not engine-direct — #266): ρ settles at +78 pcm after the
          // creep, SUR holds 0.27–0.30 DPM through the ascent, and the level-off lands at
          // 1.04 %. Engine-direct gives 80 pcm and 1.004 %; the layer moves nothing here.
          //
          // The sweep's neighbours fail for the reason the derivation predicts, not by accident:
          // 22 steps leaves 53 pcm and levels off at 0.10 % (short of the point of adding heat),
          // 30 leaves 107 pcm and reaches 3.40 % (past the band). The band is ~±4 steps wide.
          // MOVE THIS NUMBER ONLY WITH THE HOLD: 26 is tied to the 600 s hold below it, because
          // what is being fixed is decades-per-minute × minutes.
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 26, speed: 'slow' }, hold: 600,
          saw: { p: 'startup_rate_dpm', op: '>', v: 0 }, acc: { p: 'power_pct', op: '>', v: 0.2 },
          hl: ['Control Bank', 'Startup Rate', 'Intermediate Range'] },
        { text: 'Level off at the point of adding heat — the power where the core first warms the coolant, a few per cent. Do it in ONE decisive inward drive at Norm, released the moment the Startup Rate crosses zero. Do not tap the bank a step at a time: a 1 DPM ramp carries about +200 pcm, and trimming that out one step at a time lets power run away underneath you.',
          control: 'Control Bank', target: 'power steady, 1–3 % (still Mode 2, Startup)',
          note: 'This is the technique the whole evolution turns on. Measured on the recalibrated bank (#260): one continuous drive-in released on the rate null settles ~1.0 %. Removing the same reactivity as single taps settles far higher — the plant runs while you tap — and from a brisker approach it reaches the power-range setpoint and trips.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: -8, speed: 'normal' }, hold: 150,
          acc: { p: 'power_pct', op: '<', v: 5 },
          hl: ['Control Bank', 'Startup Rate', 'Intermediate Range'] },
        { text: 'Now cross the 5 % boundary deliberately: withdraw a measured amount at Slow to raise power into the low teens, enough to carry the generator. Crossing into Mode 1, At Power is a decision you make — not something the ascent does to you.',
          control: 'Control Bank', target: '≈ 12 %, Mode 1, At Power',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 22, speed: 'slow' }, hold: 300,
          acc: { p: 'power_pct', op: '>', v: 5 },
          hl: ['Control Bank', 'Startup Rate', 'Intermediate Range'] },
        { text: 'You are now above P-10 (10 % power), which is the permissive that lets you block the two startup trips. Block the INTERMEDIATE RANGE HIGH trip first — its setpoint sits at about 20 % power, so it is the one you would hit next. On the TRIP BLOCKS panel, press IR HIGH.',
          control: 'Trip Blocks', target: 'IR HIGH blocked',
          note: 'These are startup protections, not nuisances: below P-10 they are your backstop against a runaway ascent, and the plant will not let you block them down there. Above P-10 the power range is on scale and takes over the job — so you block them deliberately, as a step, rather than discovering them at 20 %. Both blocks auto-reinstate the moment power falls back below P-10.',
          cmd: { action: 'set_trip_block', trip_id: 'ir_high', blocked: true },
          hold: 5, hl: ['Trip Blocks', 'Intermediate Range'] },
        { text: 'Now block the POWER RANGE LOW SETPOINT trip — the 25 % startup setpoint, the backstop behind the IR trip. Press PR 25 % on the same panel. With both blocked the power-range 120 % trip is what protects you, and the ascent above 20 % is clear.',
          control: 'Trip Blocks', target: 'PR 25 % blocked',
          note: 'The startup net ladders P-10 (10 %) < IR high (20 %) < PR low setpoint (25 %). Miss either block and the net scrams you on the way up — which is the lesson, not a bug.',
          cmd: { action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: true },
          hold: 5, hl: ['Trip Blocks'] },
        { text: 'Put the turbine on line: Connect Grid. The generator synchronizes and picks up load in FOLLOW mode — the reactor\'s heat now has somewhere to go besides the steam dump.',
          control: 'Turbine — Connect Grid', target: 'generator loaded',
          cmd: { action: 'connect_grid' }, hold: 180,
          acc: { p: 'mwe_output', op: '>', v: 10 },
          hl: ['Turbine Load', 'Main Breaker'] },
        { text: 'Take load control: put the turbine in MANUAL. It picked up load in FOLLOW, which was right for synchronising — the turbine chased the reactor while you got on line. From here you drive generator load yourself, and the setpoint stays where FOLLOW left it, already matched to the power you are making.',
          control: 'Turbine Load', target: 'MANUAL, setpoint matched to output',
          note: 'This is how the board is handed to you in free play, and it is the lineup the rest of the manual assumes. It also puts you in charge of a coupling worth understanding: in MANUAL the turbine sits at whatever load you last asked for, so if you change reactor power and leave the setpoint alone, the two diverge — LOAD IMBAL comes in at 4 MWe and the steam generator starts filling or draining. Matching them is the operator\'s job.',
          cmd: { action: 'set_load_mode', mode: 'manual' }, hold: 30,
          acc: { p: 'mwe_output', op: '>', v: 10 },
          hl: ['Turbine Load'] },
        { text: 'Confirm Mode 1, At Power: critical, at operating temperature, generator on line, power above 5 %. Hold here, or continue the power ascension (raise-power checklist).',
          control: '(observe)', target: 'Mode 1, At Power', hold: 2,
          acc: { p: 'plant_mode', op: '~', v: 1, tol: 0.1 },
          hl: ['Tavg', 'Turbine Load', 'SG Level'] },
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor critical and in Mode 1, At Power with the generator on line; ready to continue the power ascension.',
    },
    {
      id: 'pwr_raise_power', category: 'power', manual_ref: 'PWR-N07',
      title: 'Mode 1, At Power — raise power',
      purpose: 'Increase reactor power and electrical output by withdrawing rods a little and letting the turbine take more load. Rods lead, turbine follows — the PWR two-step every crew drills until it is boring.',
      from: '50_percent',
      prereq: ['Reactor critical and stable at partial power.', 'Turbine on line.'],
      // #395 — measured on 50_percent (power 50.1 %, mwe 52.1). The power row is
      // what catches the audit's headline case: this evolution "completed" on a
      // subcritical Mode 3 plant and cooled it 21.8 °F (#344 F5).
      precond: [
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor critical and at power (above the P-10 range)' },
        { p: 'mwe_output', op: '>', v: 5, text: 'Turbine on line, carrying load' },
      ],
      cautions: ['Keep the power ramp modest; let temperatures and xenon follow.'],
      steps: [
        { text: 'Withdraw the Control Rods a few steps to add reactivity (Rod Control card → set Rod Speed, then Withdraw in short bursts).', control: 'Rod Speed',
          target: 'small, steady power rise', cmd: { action: 'rod_nudge', group_id: 'control', steps: 24, speed: 'normal' }, hold: 60,
          acc: { p: 'power_pct', op: '>', v: 50.5 } },
        { text: 'Raise the Turbine Load to match the higher reactor power and send more electricity to the grid.', control: 'Turbine Load',
          target: '≈ 70 MWe', cmd: { action: 'set_steam_demand', mwe: 70 }, hold: 40, acc: { p: 'power_pct', op: '>', v: 52 } },
      ],
      guard: { never_melted: true },
      outcome: 'Power and electrical output settle at a higher point.',
    },
    {
      id: 'pwr_lower_power', category: 'power', manual_ref: 'PWR-N08',
      title: 'Mode 1, At Power — lower power',
      purpose: 'Reduce reactor power and load by inserting rods and reducing turbine demand. Turbine leads down, rods trim — the two-step in reverse.',
      from: 'hot_full_power',
      prereq: ['Reactor at power, turbine on line.'],
      precond: [   // #395 — measured on hot_full_power (power 100 %, mwe 100)
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor critical and at power' },
        { p: 'mwe_output', op: '>', v: 5, text: 'Turbine on line, carrying load' },
      ],
      cautions: ['Watch that the Steam Generator (SG) level does not swell excessively as load drops.'],
      steps: [
        { text: 'Reduce the Turbine Load.', control: 'Turbine Load', target: '≈ 60 MWe', cmd: { action: 'set_steam_demand', mwe: 60 }, hold: 10 },
        { text: 'Insert the Control Rods a few steps to lower reactor power (Rod Control card → Insert in short bursts).', control: 'Rod Speed',
          target: 'power falling', cmd: { action: 'rod_nudge', group_id: 'control', steps: -40, speed: 'normal' }, hold: 90,
          acc: { p: 'power_pct', op: '<', v: 98 } },
      ],
      guard: { never_melted: true },
      outcome: 'Power settles at a lower point; the plant remains stable.',
    },
    {
      id: 'pwr_pressure_control', category: 'control', manual_ref: 'PWR-N10',
      title: 'Mode 1, At Power — pressurizer pressure control',
      purpose: 'Hold primary pressure at ≈ 2235 psi (15.41 MPa) using the Pressurizer (PZR) heaters (raise) and spray (lower). Pressure is the subcooling guarantee — lose it, and the primary flirts with boiling.',
      from: 'hot_full_power',
      prereq: ['Reactor at power, pressurizer at normal level.'],
      cautions: ['Low pressure erodes the subcooling margin toward boiling; high pressure approaches the relief setpoint (2350 psi / 16.20 MPa).'],
      steps: [
        obs('Read the primary pressure — normal is ≈ 2235 psi (15.41 MPa).', null, null, ['Plant Pressure']),
        { text: 'To LOWER pressure, open the Pressurizer spray — it condenses steam in the pressurizer. On the PZR Pressurizer card, raise Pressurizer Spray (PZR) → Set % (or command full open).', control: 'Pressurizer Spray (PZR)',
          target: 'pressure decreasing', cmd: { action: 'set_spray', open: true }, hold: 40, acc: { p: 'pressure_mpa', op: '<', v: 15.41 },
          note: 'Spray draws from the cold leg and needs Reactor Coolant Pump (RCP) flow. Return to Auto once pressure is where you want it.',
          hl: ['Pressurizer Spray (PZR)', 'Plant Pressure'] },
      ],
      guard: { never_melted: true },
      outcome: 'Primary pressure controllable via spray (down) and heaters (up).',
    },
    {
      id: 'pwr_sg_level', category: 'control', manual_ref: 'PWR-N12',
      title: 'Mode 1, At Power — steam generator level control',
      purpose: 'Control Steam Generator (SG) water level with the Feed Pump. The SGs are the heat sink; their level is its fuel gauge. Normally the three-element feedwater controller (STEAM GEN FEED → AUTO on the board) holds level for you; this procedure is the manual skill underneath it.',
      from: 'hot_full_power',
      prereq: ['Reactor at power, main feedwater available.'],
      cautions: ['On a fast power/level change the SG level indication briefly moves the WRONG way (shrink-and-swell) — do not overreact.',
                 'Any manual Feed Pump command takes the three-element controller to MANUAL — level is then yours to mind until you re-engage it.'],
      steps: [
        obs('Read SG level — normal is ≈ 65 %. Check the Feed control readout on the Steam & Flow card: "AUTO — three-element" means the controller is driving; MANUAL means you are.', null, null, ['SG Level', 'Feed Pump']),
        { text: 'Raise the Feed Pump speed to RAISE Steam Generator level. On the Steam & Flow card, use Feed pump → Set % (or the ▲ nudge). The readout flips to MANUAL — the pump now holds whatever speed you command.', control: 'Feed Pump', target: 'level rising',
          cmd: { action: 'set_feed_pump_speed', pct: 100 }, hold: 40, acc: { p: 'sg_level_pct', op: '>', v: 60 },
          note: 'When you are done, re-engage the three-element controller (STEAM GEN FEED → AUTO on the board) so level is minded continuously.',
          hl: ['Feed Pump', 'SG Level'] },
      ],
      guard: { never_melted: true },
      outcome: 'SG level responds to the feed pump as expected; the three-element controller is the normal driver.',
    },
    {
      id: 'pwr_shutdown', category: 'shutdown', manual_ref: 'PWR-N14',
      title: 'Mode 1, At Power → Mode 3, Hot Standby — normal shutdown',
      purpose: 'Shut the reactor down from Mode 1, At Power to Mode 3, Hot Standby: take the turbine off load, then insert the rods. Decay heat continues and must keep being removed.',
      from: 'hot_full_power',
      prereq: ['Reactor at power.'],
      precond: [   // #395 — a shutdown of an already-shut-down core is a no-op that "completes"
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor at power — there is something to shut down' },
      ],
      cautions: ['Decay heat (~7 % of rated, decaying) persists after shutdown — maintain a heat sink.'],
      steps: [
        { text: 'Reduce Turbine Load toward zero.', control: 'Turbine Load', target: '0 MWe', cmd: { action: 'set_steam_demand', mwe: 0 }, hold: 10 },
        { text: 'Insert all rods (SCRAM) to shut the reactor down.', control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 40, acc: { p: 'power_pct', op: '<', v: 5 } },
        obs('Confirm the chain reaction has stopped and decay heat remains — keep cooling.', { p: 'decay_heat_pct', op: '>', v: 3 }),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor shut down at Mode 3, Hot Standby; decay heat being removed.',
    },
    // PWR-N15 — the controlled cooldown, and the first checklist to use RAMP steps
    // (#310). Every number below is MEASURED full stack from `hot_zero_power` on the
    // default lineup, seed 42, at the same 10x the gate runs: see the milestone table
    // in Manuals/04 PWR-N15 "Expected cooldown performance".
    //
    // WHY THE LEGS ARE RAMPS AND NOT SETPOINT STEPS. It was tried the cheap way first.
    // The steam dump's proportional band is 36 psi (0.25 MPa) against a 40 % capacity,
    // and the primary trails the secondary with a time constant of about 37 s, so a
    // step in the Dump SP bursts at roughly (step size)/tau. Measured: a 10 °C step
    // peaks at -1168 °F/hr (-649 °C/hr) over its first 30 s and is finished in four
    // minutes, after which the plant just sits — the average is on programme and the
    // ride is a sawtooth. Holding -90 °F/hr (-50 °C/hr) with discrete steps needs
    // them no bigger than ~1.4 °F (0.8 °C), i.e. about 250 of them. Four ramps do it.
    {
      id: 'pwr_cooldown', category: 'shutdown', manual_ref: 'PWR-N15',
      // Cannot be replayed below M4 — the board's only boron control is the
      // `boron_conc` channel target, so engine-direct runs it UNBORATED and the core
      // goes critical on the way down. See the `stack_only` note in run_procedures.js.
      stack_only: true,
      title: 'Mode 3, Hot Standby → Mode 5, Cold Shutdown — controlled cooldown',
      purpose: 'Take a hot, subcritical plant all the way to Mode 5, Cold Shutdown: borate for cold shutdown margin, block the protection that would trip you on the way down, walk the secondary down along the saturation curve so the steam generator draws the primary with it, isolate the accumulators before they can dump, then place Residual Heat Removal and secure the reactor coolant pumps so RHR carries the plant cold. This is PWR-N15 and the second half of master path PWR-T21.',
      from: 'hot_zero_power',
      prereq: [
        'Plant at Mode 3, Hot Standby: hot (546.8 °F / 286 °C), at normal operating pressure (2235 psi / 15.41 MPa), subcritical with the control bank in.',
        'Reactor coolant pumps running; steam generator level normal on the three-element feed channel.',
        'Condenser available — the steam dump is the heat sink for the first half of this evolution, and the RHR heat exchanger rejects to the same circulating water.',
      ],
      // #395 — measured on hot_zero_power (tavg 297.0 °C, 15.41 MPa, power 0). The
      // tavg row matters beyond its own IC: the ramp schedule's first leg starts at
      // 297 °C, so a plant arriving colder (the audit's chain hit this at 244 °C)
      // rides the first leg as a step, not a ramp.
      precond: [
        { p: 'tavg_c', op: '~', v: 286, tol: 8, text: 'Hot Standby at the no-load temperature (≈ 546.8 °F / 286 °C — the ramp schedule starts there)' },
        { p: 'pressure_mpa', op: '~', v: 15.41, tol: 0.5, text: 'At normal operating pressure (2235 psi / 15.41 MPa)' },
        { p: 'power_pct', op: '<', v: 1, text: 'Subcritical with the control bank in' },
      ],
      cautions: [
        'THE COOLDOWN IS A RAMP, NOT A CHASE. Walk the Dump SP down against a schedule and the dump only ever opens as far as it must to keep up. Chase it — retype the setpoint to track whatever Tavg reads right now — and you have built a positive feedback loop: a 55 psi (0.38 MPa) error is wider than the dump\'s 36 psi (0.25 MPa) proportional band, the dump saturates, and the plant free-falls. Measured with the setpoint driven to its 29 psi (0.2 MPa) stop: -2340 °F/hr (-1300 °C/hr), from 566.6 °F (297 °C) to 251.6 °F (122 °C) in eight plant-minutes.',
        'THREE THINGS WOULD TRIP YOU ON THE WAY DOWN AND ONLY ONE OF THEM IS "SI". The depressurization crosses the 1715 psi (11.824 MPa) SI actuation setpoint and the 1775 psi (12.24 MPa) low-pressure reactor trip. Taking HPI/LPI to OFF stops the PUMPS; it does NOT stop the RPS. Both the low-pressure trip and the reactor-trip-on-SI have to be BLOCKED by hand at the Trip Blocks panel, and neither block is available until pressure is inside the P-11 permissive (below 1972 psi / 13.6 MPa) — which is why step 3 lowers the Pressure SP before steps 4 and 5 block anything. Measured with the blocks missed: the plant scrams at 1800 psi about six plant-minutes into the first leg, the turbine trip drives the dump into its Tavg-error mode, and the cooldown runs away at -550.8 °F/hr (-306 °C/hr).',
        'The accumulators are PRESSURE and a check valve, not a pump — blocking SI does nothing to them. Isolate them at 1000 psi (6.895 MPa), where LCO 3.5.1 stops requiring them OPERABLE and 355 psi (2.45 MPa) above their 600 psi (4.14 MPa) cover gas. Miss it and all four dump into the RCS: empty tanks, boron dragged toward the 2500 ppm RWST charge, and a water-solid arrival at Mode 5.',
        'PLACE RHR WITH THE HEAT EXCHANGER THROTTLED, and set the split BEFORE you open the suction. The split arrives at 100 % from the at-power lineup; measured, opening the hot-leg suction at full split on a 379.4 °F (193 °C) plant takes the rate to -1517.4 °F/hr (-843 °C/hr). At the 7 % of step 12 the placement transient peaks at -171 °F/hr (-95 °C/hr) for about ten seconds and then settles back on programme.',
        'From the moment the pumps are secured the HX split IS the rate control, and it has to keep rising: RHR removes heat in proportion to (Tavg − sink), so a split that gives -90 °F/hr at 379 °F gives a third of that at 210 °F. Step 15 walks it 7 → 25 %. The sink is about 122 °F (50 °C) and moves with the circulating-water inlet temperature, so a warm summer river raises the floor this cooldown can reach.',
        'The programmed -90 °F/hr (-50 °C/hr) is THIS PLANT\'S TRAINING RATE and is UNVERIFIED as a commercial limit — no source for a real-plant cooldown-rate limit has been found for this manual set. Real Tech Spec limits come from the RCS pressure–temperature curves (NUREG-1431 LCO 3.4.3), which this plant does not model.',
      ],
      auto_channels: ['feed_sg', 'cvcs_makeup', 'boron_conc'],
      steps: [
        obs('Confirm Mode 3, Hot Standby: Tavg at the no-load anchor 546.8 °F (286 °C), pressure 2235 psi (15.41 MPa), reactor subcritical with the control bank in, RCPs running.',
          { p: 'tavg_c', op: '~', v: 286, tol: 3 }, null, ['Tavg', 'Plant Pressure', 'Reactor Coolant Pumps (RCP)']),
        { text: 'BORATE FIRST — nothing cools until this is done. Cooling a core makes it MORE reactive (the cold moderator is denser), so the shutdown margin you have at 546.8 °F is not the margin you will have at 199 °F. Set the boron target to 857 ppm on the board (BORON CONTROL): 806 ppm is critical cold with the bank in (09 §7.5) and the rest is margin. The makeup panel meters it as a batch dose at about 3 ppm/min, so 705 → 857 ppm takes roughly 50 plant-minutes.',
          control: 'Boron control', target: '857 ppm',
          note: 'This is the same 857 ppm the cold_shutdown initial condition ships, and it is why a plant that came down this way goes critical near step 561 on the next startup rather than the 319 the startup checklist assumes (#303).',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 857 }, hold: 3600,
          acc: { p: 'boron_ppm', op: '>', v: 850 },
          hl: ['Boron control', 'Boron (Reactivity) — CVCS'] },
        { text: 'Lower the Pressurizer Pressure Setpoint to 1901 psi (13.11 MPa) — saturation for the temperature you are at plus the 63 °F (35 °C) of subcooling this cooldown holds throughout. It also puts you inside the P-11 permissive (below 1972 psi / 13.6 MPa), which is what makes the next two steps possible.',
          control: 'Pressure SP', target: '1901 psi (13.11 MPa), below P-11',
          cmd: { action: 'set_pressure_setpoint', mpa: 13.11 }, hold: 300,
          acc: { p: 'pressure_mpa', op: '<', v: 13.6 },
          hl: ['Pressure SP', 'Plant Pressure'] },
        { text: 'BLOCK the low-pressure reactor trip (Trip Blocks → PZR PRESS LO LO). It trips at 1775 psi (12.24 MPa) — the panel is captioned for the 1800 psi (12.41 MPa) ALARM, which is a different setpoint on the same channel — and you are about to drive straight through both. You could not have blocked it a step ago: the block is an ENABLE, not a switch, and P-11 is what enables it — which is why the Pressure SP came down first. It stands as long as you stay below P-11, and reinstates itself when pressure climbs back through P-11 on the next heatup, whoever set it.',
          control: 'Trip Blocks', target: 'lo-press trip BLOCKED',
          cmd: { action: 'set_trip_block', trip_id: 'lo_press', blocked: true }, hold: 10,
          hl: ['Trip Blocks'] },
        { text: 'BLOCK the reactor trip on safety injection as well (Trip Blocks). This is a SECOND trip on the same channel, armed at the 1715 psi (11.824 MPa) SI setpoint — a real casualty means the reactor does not stay up, and a planned cooldown is not one. THIS BLOCK IS ALSO WHAT STOPS THE INJECTION ITSELF: there is no ESF arm on this plant, so switching the pumps off in the next step secures them without stopping the actuation from starting them again.',
          control: 'Trip Blocks', target: 'SI reactor trip BLOCKED',
          note: 'Found by building this checklist: with only the low-pressure trip blocked the plant still scrams on the way down, because two entries in the trip table watch the same instrument in the same direction. Both blocks are needed and both are the operator\'s.',
          cmd: { action: 'set_trip_block', trip_id: 'si_trip', blocked: true }, hold: 10,
          hl: ['Trip Blocks'] },
        { text: 'Take HPI/LPI to OFF — the P-11 cold lineup. This SECURES THE PUMPS; it is the si_trip block above that stops the actuation, because this plant has no ESF arm to take to MANUAL. Left unblocked, the actuation reads the depressurization as a Loss-Of-Coolant Accident and injects 2500 ppm RWST water. Measured with it left in AUTO: boron ends at 2500 ppm instead of 857 and the cold injection cools the plant about ten times faster than you are asking for.',
          control: 'HPI/LPI', target: 'HPI/LPI in MANUAL, OFF',
          cmd: { action: 'set_hpi', active: false }, hold: 10,
          acc: { p: 'hpi_active', op: '<', v: 0.5 },
          hl: ['HPI/LPI', 'ECCS'] },
        { text: 'LEG 1 — start the cooldown. Walk the Dump SP down from 1020 psi to 814 psi (7.03 → 5.61 MPa) and the Pressure SP from 1901 psi to 1352 psi (13.11 → 9.32 MPa) TOGETHER, over the next 17 plant-minutes, tracking the saturation curve. That is about 12 psi/min on the dump (the walk is shorter than it used to be — the Ginna anchor starts 174 psi lower, #419 wave 3). The pair holds deep subcooling all the way down: the dump sets where the plant is going, the pressurizer keeps the coolant liquid while it gets there.',
          control: 'Dump SP', target: 'Tavg 519.8 °F (271 °C) at -90 °F/hr (-50 °C/hr)',
          note: 'Measured: -85 to -100 °F/hr (-47 to -56 °C/hr) through this leg, arriving 521.4 °F (271.9 °C). Do not retype the setpoint to match present Tavg — that is the chase the first caution describes.',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 5.61 }, hold: 1200,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [7.03, 6.67, 6.32, 5.96, 5.61] },
                 { action: 'set_pressure_setpoint',   arg: 'mpa', points: [13.11, 12.07, 11.10, 10.18, 9.32] }],
          acc: { p: 'tavg_c', op: '~', v: 271, tol: 4 },
          hl: ['Dump SP', 'Pressure SP', 'Tavg', 'Steam Dump'] },
        { text: 'LEG 2 — continue to the accumulator isolation point. Dump SP 814 → 580 psi (5.61 → 4.00 MPa), Pressure SP 1352 → 1004 psi (9.32 → 6.92 MPa), over 25 plant-minutes. Watch the pressure: this leg ends AT 1000 psi, and the SI ACCUM annunciator comes in there.',
          control: 'Dump SP', target: 'pressure 1000 psi (6.895 MPa), Tavg 482 °F (250 °C)',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 4.00 }, hold: 1512,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [5.61, 5.17, 4.75, 4.37, 4.00] },
                 { action: 'set_pressure_setpoint',   arg: 'mpa', points: [9.32, 8.67, 8.06, 7.47, 6.92] }],
          acc: { p: 'pressure_mpa', op: '<', v: 7.0 },
          hl: ['Dump SP', 'Pressure SP', 'Plant Pressure'] },
        { text: 'ISOLATE THE SI ACCUMULATORS now, at 1000 psi (6.895 MPa) — close the discharge valve. Below their 600 psi (4.14 MPa) cover gas they dump whether you meant it or not, and nothing automatic shuts them. Basis: NUREG-1431 LCO 3.5.1 (OPERABLE only above 1000 psig) and SR 3.4.12.3 (the LTOP lineup verifies each accumulator isolated).',
          control: 'Accumulator valve', target: 'discharge valve SHUT, tanks still 100 % full',
          cmd: { action: 'close_accumulator_valve' }, hold: 20,
          acc: { p: 'accumulator_valve_open', op: '<', v: 0.5 },
          hl: ['Accumulator valve'] },
        { text: 'LEG 3 — Dump SP 580 → 347 psi (4.00 → 2.39 MPa), Pressure SP 1004 → 641 psi (6.92 → 4.42 MPa), over 35 plant-minutes. Same programme, same subcooling. Somewhere in here the plant passes the 600 psi (4.14 MPa) accumulator cover gas with the valve already shut, which is the point of having shut it.',
          control: 'Dump SP', target: 'Tavg 429.8 °F (221 °C)',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 2.39 }, hold: 2088,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [4.00, 3.54, 3.12, 2.73, 2.39] },
                 { action: 'set_pressure_setpoint',   arg: 'mpa', points: [6.92, 6.22, 5.57, 4.97, 4.42] }],
          acc: { p: 'tavg_c', op: '~', v: 221, tol: 4 },
          hl: ['Dump SP', 'Pressure SP', 'Tavg'] },
        { text: 'LEG 4 — the last secondary-led leg. Dump SP 347 → 197 psi (2.39 → 1.36 MPa), Pressure SP 641 → 395 psi (4.42 → 2.72 MPa), over 34 plant-minutes. You are driving to just under the 400 psi (2.76 MPa) RHR block-open permissive, because that is the only thing standing between you and shutdown cooling.',
          control: 'Dump SP', target: 'pressure below 400 psi (2.76 MPa), Tavg 379.4 °F (193 °C)',
          note: 'The dump on its own cannot take you much further: its setpoint clips at 29 psi (0.2 MPa), which is saturation for 251.6 °F (122 °C). Everything below that belongs to RHR.',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 1.36 }, hold: 2016,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [2.39, 2.09, 1.82, 1.57, 1.36] },
                 { action: 'set_pressure_setpoint',   arg: 'mpa', points: [4.42, 3.94, 3.49, 3.09, 2.72] }],
          acc: { p: 'pressure_mpa', op: '<', v: 2.76 },
          hl: ['Dump SP', 'Pressure SP', 'Plant Pressure'] },
        { text: 'THROTTLE THE RHR HEAT EXCHANGER BEFORE YOU ALIGN IT: set the HX flow split to 7 % (RHR card). It is sitting at 100 % from the at-power lineup, and 100 % onto a 379.4 °F (193 °C) plant is a -1517.4 °F/hr (-843 °C/hr) shock.',
          control: 'Residual Heat Removal (RHR)', target: 'HX split 7 %',
          cmd: { action: 'set_rhr_hx', pct: 7 }, hold: 10,
          hl: ['Residual Heat Removal (RHR)'] },
        { text: 'Align RHR — open the hot-leg suction valve (RHR card → ALIGN). The engine refuses this above 425 psig (440 psi / 3.03 MPa) — the sourced WTSM 5.1 block-open permissive, which leg 4 already put you under. Note the two setpoints are not one number: the AUTOCLOSURE that would shut a standing-open valve is 585 psig (600 psi / 4.14 MPa), about 160 psi higher, so the valve does not chatter across a single boundary (#288; the 400/600 pair this step used to quote was the retired engine\'s).',
          control: 'Residual Heat Removal (RHR)', target: 'RHR aligned, ECCS mode RHR',
          cmd: { action: 'set_rhr', active: true }, hold: 20,
          acc: { p: 'rhr_active', op: '>', v: 0 },
          hl: ['Residual Heat Removal (RHR)', 'ECCS'] },
        { text: 'SECURE THE REACTOR COOLANT PUMPS. RHR provides the circulation from here, and with the pumps stopped the steam generator decouples (flow → 0) so it stops feeding heat back into the loop. Losing the pump heat helps too. Note the board reads this as a planned securing, not a casualty — RCP TRIP annunciates as a status, not a critical (#240).',
          control: 'RCP Run/Stop', target: 'pumps stopped, coasting down',
          cmd: { action: 'set_rcp', running: false }, hold: 20,
          acc: { p: 'pump_flow_pct', op: '<', v: 50 },
          hl: ['RCP Run/Stop', 'Reactor Coolant Pumps (RCP)'] },
        { text: 'RHR-LED COOLDOWN TO MODE 5. Walk the HX flow split up from 7 % to 25 % over the next two plant-hours and let the Pressure SP settle from 395 psi to 363 psi (2.72 → 2.50 MPa). The split has to keep rising because RHR removes heat in proportion to how far above its sink you are, and that gap is closing. Mode 4, Hot Shutdown is behind you at 350 °F (176.7 °C) and Mode 5, Cold Shutdown arrives at 199.4 °F (93 °C).',
          control: 'Residual Heat Removal (RHR)', target: 'Tavg below 199.4 °F (93 °C) — Mode 5',
          note: 'Measured: Mode 4 at 3.49 plant-h from the start, Mode 5 at 4.89 plant-h, 177 °F (80.5 °C) at the end of this step. Rate -65 to -118 °F/hr (-36 to -66 °C/hr) across the leg.',
          cmd: { action: 'set_rhr_hx', pct: 25 }, hold: 7200,
          ramp: [{ action: 'set_rhr_hx',            arg: 'pct', points: [7, 11.5, 16, 20.5, 25] },
                 { action: 'set_pressure_setpoint', arg: 'mpa', points: [2.72, 2.50] }],
          acc: { p: 'tavg_c', op: '<', v: 93 },
          hl: ['Residual Heat Removal (RHR)', 'Tavg', 'Plant Pressure'] },
        obs('Confirm Mode 5, Cold Shutdown: coolant below 199.4 °F (93 °C), pressure about 363 psi (2.50 MPa), RHR carrying the decay heat, pumps off.',
          { p: 'plant_mode', op: '~', v: 5, tol: 0.1 }, null, ['Tavg', 'Plant Pressure']),
        obs('Confirm the accumulators are still FULL and still isolated — 100 % inventory, discharge valve shut. They stay that way until PWR-N01 re-aligns them on the next heatup.',
          { p: 'accumulator_volume_pct', op: '>', v: 99 }, null, ['Accumulator valve']),
        obs('Confirm RHR is the heat sink and the suction valve is still open — this is the lineup the plant will sit in until it is either refuelled or brought back up.',
          { p: 'rhr_valve_open', op: '>', v: 0 }, null, ['Residual Heat Removal (RHR)']),
      ],
      guard: {
        never_melted: true,
        never: [
          { p: 'fuel_temp_c', op: '>=', v: 1200 },
          // Never uncover the core, never lose subcooling, never lift a relief — the
          // three things a cooldown must not do. Measured minima on the authored
          // ramps: inventory 100 %, subcooling 60.8 °F (33.8 °C), no lift.
          { p: 'core_inventory_pct', op: '<', v: 95 },
          { p: 'subcooling_c', op: '<', v: 5 },
          { p: 'sg_safety_open', op: '>', v: 0 },
          { p: 'porv_open', op: '>', v: 0 },
          // Never dump the accumulators. This is the #273 defect: the cooldown used to
          // walk past their 600 psi cover gas with the discharge valve open and empty
          // all four, and indicated pzr level could not reach its trip to say so.
          { p: 'accumulator_volume_pct', op: '<', v: 99 },
          // ON PROGRAMME, and LEFT AT -150 rather than tightened *(OWNER RULING,
          // 2026-08-02: "1 keep. 2. Keep. 3. Keep.")*. Tightening to ~-110 (15 % over the
          // worst authored transient) was offered and declined: it buys almost nothing and
          // risks flaking across instrument-noise seeds. Removing it was also offered —
          // measured, a staircase then scores 28/28 and nothing distinguishes it.
          // -150 °C/hr is not the programme (-50) — it is the line that
          // separates "a transient" from "the plant is running away", and it is set
          // where it is because the three ways this evolution is known to run away all
          // sit far beyond it: a missed trip block scrams and the dump goes to
          // Tavg-error mode (-306), a 10 °C setpoint STEP instead of a ramp (-649),
          // RHR aligned at a 100 % HX split (-843), and the setpoint driven to its
          // stop (-1300). The worst transient the authored ramps produce is -95, at
          // RHR placement, for about ten seconds.
          { p: 'tavg_rate_c_per_hr', op: '<', v: -150 },
        ],
      },
      outcome: 'Mode 5, Cold Shutdown, reached on integrated physics (#524, 2026-08-31): coolant below 199.4 degF (93 degC), depressurized to about 363 psi (2.50 MPa), RHR carrying the plant, reactor coolant pumps secured, accumulators full and isolated, boron at the cold shutdown margin. This is the state the `cold_shutdown` initial condition loads (its own shipped trim is 918 ppm). PWR-N01 takes it back up.',
    },
    // PWR-T06 — the post-trip response. Authored 2026-08-03 (#319): the procedure was
    // documented but had NO runnable checklist, while PWR-E03 (turbine trip) explicitly
    // sends the operator to it — *"Above P-9: confirm the automatic reactor trip and go to
    // the post-trip response."* A reactor trip is the most common significant event on a
    // plant and recovering from one was not an authored evolution.
    //
    // IT IS ALSO THE FIRST CONTENT ANYWHERE TO NAME `reset_rps`. That command has been
    // board-reachable since #75 and is required after EVERY scram, and no procedure,
    // mission or checklist mentioned it — the sharpest of the three orphaned operator
    // capabilities #319 found.
    //
    // MEASURED full stack, `hot_full_power`, shipped lineup, scram at t=60 s:
    //   t+1 s   power 33.4 % — reset REFUSED, `RODS_NOT_INSERTED`
    //   t+3 s   power 5.07 % — rods seated, reset ACCEPTED
    //   ~1 min  plant_mode 3; turbine tripped automatically
    //   ~3 min  main feedwater ISOLATED (restorable at SG FEED → RESTORE since #341/#319 item 2,
    //           but only after the RPS reset clears the trip half of the coincidence — see cautions)
    //   ~3 min  AFW auto-started; SG level 65 -> 36.6 % by t+7 min, then holds ~37 %
    //   settles 567.3 °F (297.4 °C) / 2235 psi (15.41 MPa) — hot, subcritical, Mode 3
    //
    // ACCEPTANCES ARE DELIBERATELY LAYER-ROBUST. AFW auto-start and the feedwater
    // isolation are M4 ACTUATIONS, so they do not happen in `run_procedures`, which is
    // engine-direct. Asserting `afw_active` here would pass under the stack and fail
    // engine-direct, and this procedure has no NON_ENGINE_ACTION to justify `stack_only`
    // with. So the AFW/MFW facts are carried as cautions and notes, and every `acc` is a
    // truth both layers produce: power, the scram latch, plant mode, no melt.
    {
      id: 'pwr_post_trip', category: 'emergency', manual_ref: 'PWR-T06',
      title: 'Post-trip response — Mode 1, At Power → Mode 3, Hot Standby',
      purpose: 'The reactor has tripped. Confirm the trip, reset the protection system, verify the plant has a heat sink, and stabilize hot and subcritical in Mode 3, Hot Standby. This is where PWR-E03 and the other at-power emergencies send you once the reactor is down.',
      from: 'hot_full_power',
      prereq: ['At-power operation, or any event that has just tripped the reactor.'],
      cautions: [
        'Reset the RPS only AFTER the rods are seated. The reset is refused with RODS_NOT_INSERTED while they are still travelling — measured, that is the first ~2 seconds, with power still around 33 %.',
        'Resetting the RPS re-closes the trip breakers. It does NOT withdraw the rods: the plant stays subcritical until you deliberately withdraw, and the startup net governs any re-ascent.',
        'MAIN FEEDWATER ISOLATES on the trip. Auxiliary feedwater is the heat sink from here — measured, AFW auto-starts and holds SG level near 37 %, and that is sufficient in Mode 3 indefinitely.',
        'Main feed can be restored at RESTORE on the SG FEED card, but the isolation SEALS IN: it is refused while the signal that closed it is still present. After a trip that means resetting the RPS first (step 2) — the low-Tavg isolation is a coincidence of low Tavg AND the trip latch. Restoring is optional here; a stable Hot Standby does not need main feed.',
        'If you do restore, set SG FEED RATE to match STEAM FLOW first. Main feed returns at whatever the pump was last commanded — measured, restoring into a generator that is already recovering drives level 36.6 % → 77 % in about two minutes and isolates you again at the 90 % high level.',
        'A reactor trip is not a cooldown. The plant stays HOT — measured, it settles at 567.3 °F (297.4 °C) and 2235 psi (15.41 MPa). Cooling down is PWR-N15, a separate evolution.',
      ],
      steps: [
        { text: 'Confirm the reactor is tripped — rods in, power collapsing. If it has not tripped and a trip is warranted, trip it manually: Reactor card → SCRAM.', control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 30, acc: { p: 'power_pct', op: '<', v: 5 } },
        { text: 'Reset the Reactor Protection System. The SCRAM control now reads PRESS TO RESET — press it once the rods are seated. This clears the trip latch and re-closes the breakers; the rods stay in.', control: 'SCRAM', target: 'trip latch cleared',
          note: 'Refused with RODS_NOT_INSERTED if you try it while the rods are still travelling. Measured: refused at t+1 s, accepted at t+3 s.',
          cmd: { action: 'reset_rps' }, hold: 30, acc: { p: 'scrammed', op: '<', v: 1 } },
        { text: 'Verify the turbine is off the grid. A reactor trip trips the turbine, so the generator should already be disconnected — confirm it rather than assume it.', control: 'Main Breaker', target: 'turbine tripped, breaker open',
          hold: 60, acc: { p: 'turbine_tripped', op: '>', v: 0 } },
        { text: 'Verify the heat sink. Main feedwater has isolated; auxiliary feedwater should have started automatically and be holding steam generator level. Watch SG LEVEL stop falling.', control: 'AFW', target: 'SG level steadies',
          note: 'Measured under the shipped lineup: level falls 65 % → 36.6 % over about seven minutes, then holds near 37 %. Falling level early is expected — level that keeps falling is not.',
          hold: 420, acc: { p: 'melted', op: '<', v: 1 } },
        { text: 'Verify inventory and subcooling. The pressurizer should hold pressure with the heaters, and subcooling margin should stay positive — if it is eroding, you have a leak, not a plain trip.', control: 'Plant Pressure', target: 'subcooling positive',
          hold: 120, acc: { p: 'subcooling_c', op: '>', v: 0 } },
        obs('Declare Mode 3, Hot Standby: subcritical, rods in, RCS still hot and pressurized, heat sink established on AFW.',
          { p: 'plant_mode', op: '~', v: 3, tol: 0.5 },
          'From here the plant is stable indefinitely on decay heat. Going further down is PWR-N15 (cooldown to Mode 5); going back up is PWR-N03 (approach to criticality).',
          ['SCRAM', 'AFW', 'Tavg']),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Mode 3, Hot Standby — subcritical with the trip latch reset, turbine off the grid, decay heat going to the steam generators on auxiliary feedwater, RCS hot at 567.3 °F (297.4 °C) and 2235 psi (15.41 MPa).',
    },
    {
      id: 'pwr_loss_of_feedwater', category: 'emergency', manual_ref: 'PWR-E01',
      title: 'Mode 1 emergency — loss of main feedwater',
      purpose: 'Main feedwater is gone and the Steam Generators (SG) are drying out. Trip the reactor and establish Auxiliary Feedwater (AFW) as the heat sink.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: ['Without a secondary heat sink, primary temperature and pressure rise quickly.'],
      steps: [
        { text: 'Confirm the loss of feedwater — Steam Generator level is falling. (Failures tab → inject Loss of Main Feedwater, or wait for the transient.)', control: '(observe SG level)', target: 'diagnose',
          cmd: { action: 'inject_failure', failure_id: 'loss_of_feedwater' }, hold: 20, acc: { p: 'sg_level_pct', op: '<', v: 65 } },
        { text: 'Trip the reactor to stop adding heat (this would also occur automatically on low SG level).', control: 'SCRAM',
          target: 'power collapsing', cmd: { action: 'scram' }, hold: 5 },
        { text: 'Take the turbine off load.', control: 'Turbine Load', target: '0 MWe', cmd: { action: 'set_steam_demand', mwe: 0 }, hold: 5 },
        { text: 'Start Auxiliary Feedwater (AFW) to restore the secondary heat sink (Emergency Cooling card → AFW → Start; on low SG level the armed AFW starts itself — starting it by hand also takes its arm to MANUAL).', control: 'AFW', target: 'core cooled',
          cmd: { action: 'set_afw', active: true }, hold: 120, acc: { p: 'power_pct', op: '<', v: 5 } },
        obs('Confirm the core is safe and decay heat is being removed.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor tripped, secondary heat sink restored on AFW, core safe.',
    },
    {
      id: 'pwr_rcp_trip', category: 'emergency', manual_ref: 'PWR-E02',
      title: 'Mode 1 emergency — RCP trip / loss of flow',
      purpose: 'A Reactor Coolant Pump (RCP) has tripped and coolant flow is falling. Confirm the protective trip and stabilize.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: [
        'Low flow lets heat build locally — the low-flow trip protects the core, and at 90 % of rated flow it acts in about two seconds.',
        'RCS flow is a SINGLE channel. If the pump is gone and the flow indication disagrees, believe the pump: the trip reads that same channel and will not fire.',
      ],
      steps: [
        { text: 'The pump has tripped — coolant flow is coasting down. (Failures tab → inject RCP Trip.) The reactor trips automatically on low RCS flow, below 90 % of rated.', control: '(observe RCS flow)', target: 'reactor trips',
          cmd: { action: 'inject_failure', failure_id: 'rcp_trip' }, hold: 15 },
        { text: 'Trip the reactor if it has not already tripped, and remove turbine load.', control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 30, acc: { p: 'power_pct', op: '<', v: 8 } },
        // "natural circulation" removed 2026-07-29: natural_circ_flow is 0.0 and this
        // plant does not model it, so the step asked the operator to confirm cooling by
        // a mechanism that does not exist. Decay-heat removal here is through the SGs.
        obs('Confirm shutdown, and decay heat going to the steam generators (AFW as required).', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor safely shut down after loss of forced flow.',
    },
    {
      id: 'pwr_stuck_porv', category: 'emergency', manual_ref: 'PWR-E07',
      title: 'Mode 1 emergency — stuck-open PORV recover (small-break LOCA)',
      purpose: 'The Power-Operated Relief Valve (PORV) is stuck open — a small-break Loss-Of-Coolant Accident (LOCA) — while its indicator may read closed. Diagnose on the subcooling margin and ISOLATE with the block valve. This is the TMI recovery that was missed in 1979.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: ['Do NOT trust the PORV position light — it shows the command, not reality.', 'Do NOT throttle High-Pressure Injection (HPI) on a rising Pressurizer level; the level rises even as inventory is lost.'],
      steps: [
        { text: 'The PORV is stuck open and its indicator reads closed. (Failures tab → inject PORV Stuck Open.) Inventory is leaking. Diagnose it on the SUBCOOLING readout (Power & Reactivity card): it drops hard as coolant is lost. Watch what happens next, because it is the trap — emergency injection comes in by itself and the margin comes most of the way BACK, with the leak still running. A margin that recovers is not a leak that stopped.', control: '(observe subcooling)', target: 'recognize the leak',
          // `saw`, not `acc` (#245). The claim this step teaches is that inventory IS
          // being lost — which it is, from injection to about t=8 s. It is not a claim
          // about where inventory sits 30 s later, because by then automatic HPI has
          // come in on low pressure and refilled past nominal (measured under the
          // shipped lineup: 99.65 → 98.01 % by t=6, HPI actuates at 10.5 MPa, then
          // 117.6 % by t=16 with the pressurizer at 88 % and subcooling gone). That is
          // the plant doing the right thing — it is TMI's own trap, the solid
          // pressurizer that invites throttling injection, and this procedure's own
          // caution warns about it. An end-of-step `acc: core_inventory_pct < 100`
          // contradicted it, and only ever passed because the harness was starving the
          // run to ~3 s of sim time. The subcooling `acc` below is the diagnosis signal
          // the step's own text points the player at, and it holds at both ends.
          // BOTH claims are `saw`, and at #348 that stopped being a style choice. The step
          // used to close with `acc: subcooling_c < 20` — an END-of-hold value — and the two
          // layers no longer agree on any end-of-hold value at all. Measured at t+30 s:
          // engine-direct the margin closes at **−5.2 °C** with the plant boiling, and under
          // the stack safety injection catches it and it closes at **+36.6 °C**, recovered.
          // The `acc` passed engine-direct and failed under the stack, which is the #209 class
          // — an acceptance certifying a plant the player never gets.
          //
          // What is true at BOTH layers is the TRANSIENT: the margin dives to 20.9 °C or below
          // (from ~41 °C) and inventory dips under nominal, on every layer, every time. That is
          // also exactly what the step teaches — the leak announces itself and then hides again
          // behind the injection that answered it — so the honest form of the claim and the
          // layer-robust one are the same sentence. `saw` takes a list since this change.
          // hold 240, was 90 (#408), was 30 — the third re-clock of the same watch, same
          // claim each time. #419 wave 2 (K 3144 → 2500): the honest pressure authority
          // dives 41 → ~34 °C by 40 s, PLATEAUS ~37 °C while the post-scram settle fights
          // the leak (1m–2m30), then collapses through 25 °C at ~2m50s and saturates
          // (measured full stack). Also true at real flows and worth knowing:
          // injection no longer refills past nominal — a full-open PORV (1.31e-3 frac/s)
          // outruns full HPI (2.0e-4) on this plant, and inventory keeps falling with
          // injection in, so the deception below rides the void/level term alone.
          cmd: { action: 'inject_failure', failure_id: 'stuck_porv_open' }, hold: 240,
          saw: [{ p: 'core_inventory_pct', op: '<', v: 100 },
                { p: 'subcooling_c', op: '<', v: 25 }] },
        { text: 'Also mask the indicator, as at TMI: Failures tab → inject PORV Indicator Stuck Closed. Trust subcooling, not the PORV light.', control: '(observe PORV light vs subcooling)', target: 'trust subcooling, not the light',
          cmd: { action: 'inject_failure', failure_id: 'porv_indicator_stuck_closed' }, hold: 10 },
        { text: 'ISOLATE the leak: Relief Valves card → PORV Block Valve → Isolate. This stops the loss even though the PORV itself is stuck open.', control: 'PORV Block Valve', target: 'inventory stops falling',
          note: 'Click Isolate under PORV Block Valve. Then restore inventory and pressure with HPI / charging.',
          cmd: { action: 'close_block_valve' }, hold: 60, acc: { p: 'melted', op: '<', v: 1 } },
        obs('Confirm inventory has stabilized and the core stays covered.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Leak isolated with the block valve; core stays covered — the recovery TMI missed.',
    },
    // PWR-E03 — turbine trip. Authored 2026-08-03 (#319 item 1). Pairs with PWR-T06: E03 is the
    // procedure that SENDS you to the post-trip response, and until T06 was built there was
    // nothing at the other end of that pointer.
    //
    // MEASURED full stack, `hot_full_power`, shipped lineup, `trip_turbine` at t = 60 s:
    //   +31 s   reactor ALREADY SCRAMMED (P-9), MWe 0, steam dump SATURATED at 40.00 %
    //           — its entire capacity — SG level swelled 65 → 72.1 %, pzr level 55 → 61.6 %
    //   settles Tavg 567.5 °F (297.5 °C), SG level 36.5 %, pzr 38.6 %, dump modulating 4–9 %
    //
    // The dump pinning at exactly 40.00 % is the #220/40 % ruling made visible: this is the
    // event where the operator SEES the dump reach its stop and stay there. At the old 1.05
    // capacity it never saturated and the interlock could only be asserted, never demonstrated.
    //
    // STEP 2 CARRIES AN EXPLICIT SCRAM AND THE TEXT SAYS WHY. The P-9 reactor-trip-on-turbine-
    // trip is an M4 function, so `run_procedures` (engine-direct) has no RPS and will not trip
    // on its own — the same layer wall PWR-T06 and PWR-E06 hit. Rather than assert a trip the
    // engine-direct plant cannot produce, the step does what PWR-E03 step 2 and the chapter's
    // generic action 1 both say: CONFIRM the automatic trip, and manually scram if power should
    // be down and is not. On the shipped plant the confirm is all the player does.
    {
      id: 'pwr_turbine_trip', category: 'emergency', manual_ref: 'PWR-E03',
      title: 'Mode 1 emergency — turbine trip above P-9',
      purpose: 'The turbine has tripped at power. Above 50 % power that scrams the reactor automatically — your job is to confirm it happened, watch the steam dump take the heat the turbine is no longer taking, and hand over to the post-trip response.',
      from: 'hot_full_power',
      prereq: ['At-power operation above P-9 (≥ 50 % power).'],
      cautions: [
        'DO NOT PLAN TO RIDE OUT A TURBINE TRIP AT POWER. This plant carries Reactor Trip on Turbine Trip (P-9, ≥ 50 %). What it rides out is a LOAD REJECTION — the generator taking less load with the turbine still on line — which is a different event and does not arm P-9.',
        'A planned offline is not a turbine trip. Taking the generator off line with the OFF selector opens the breaker, leaves the stop valves open, latches nothing and never arms P-9. It is reversible; a trip is not.',
        'The steam dump is finite. Measured, it saturates at its full 40 % capacity in this transient and stays there — watch it reach the stop, because that is the plant telling you it has nothing left to give.',
      ],
      steps: [
        { text: 'The turbine trips. (Failures tab → inject Turbine Trip, or it arrives on its own.) Steam demand collapses to nothing and the generator drops off the grid.', control: '(observe MWe and turbine state)', target: 'turbine tripped, 0 MWe',
          cmd: { action: 'trip_turbine' }, hold: 20, acc: { p: 'turbine_tripped', op: '>', v: 0 } },
        { text: 'CONFIRM the reactor tripped. Above P-9 it goes automatically and immediately — you should be verifying a scram that has already happened, not causing one. If power is not collapsing, scram manually now.', control: 'SCRAM', target: 'reactor tripped, power collapsing',
          note: 'On the shipped plant the trip is automatic and arrives with the turbine trip, not after it. The SCRAM command here is the "if it did not" half of the procedure.',
          cmd: { action: 'scram' }, hold: 60, acc: { p: 'power_pct', op: '<', v: 5 },
          saw: { p: 'steam_dump_valve_pct', op: '>', v: 25 } },
        { text: 'Watch the steam dump. With the turbine gone it is the only path for the heat still coming out of the core, and it drives open on Tavg error. Measured, it goes to its stop — 28 % of rated steam flow, all of it (Ginna\'s own capacity, #419) — and holds there through the worst of the transient, with the atmospheric dump valve helping over the peak.', control: 'Steam Dump', target: 'dump at its stop',
          note: 'The saturation is EARLY — measured, the dump is at its 28 % stop about half a minute after the trip and backs off within minutes, so the assertion for it lives on the previous step. What you are watching here is it modulating back down as decay heat falls.',
          hold: 120, acc: { p: 'melted', op: '<', v: 1 } },
        { text: 'Control steam generator level through the swell. Losing steam demand swells the generator before decay heat brings it back down — the level you see first is not the level you will settle at.', control: 'SG Level', target: 'level swells then settles',
          note: 'Measured: SG level swells 65 → 72.1 % in the first half-minute, then falls away to about 36.5 % as the plant settles on decay heat and auxiliary feedwater.',
          hold: 300, acc: { p: 'melted', op: '<', v: 1 } },
        obs('Confirm the plant is stable, hot and subcritical — this is Mode 3, Hot Standby, and from here you are in the post-trip response (PWR-T06).',
          { p: 'plant_mode', op: '~', v: 3, tol: 0.5 },
          'Measured settled condition: Tavg 567.5 °F (297.5 °C), steam dump modulating a few per cent, SG level near 36.5 %. PWR-T06 picks up from exactly here — including the RPS reset, which this procedure does not do.',
          ['SCRAM', 'Steam Dump', 'Tavg']),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Turbine trip absorbed: reactor tripped automatically on P-9, the steam dump carried the transient at its full 40 % capacity, and the plant is stable in Mode 3, Hot Standby ready for the post-trip response.',
    },
    // PWR-E13 — ATWS. Authored 2026-08-03 (#319 item 4). `stack_only`, and this is the first
    // procedure I have authored where the flag is genuinely EARNED rather than unavailable:
    // emergency boration is the whole response and it runs through `set_auto_setpoint` on the
    // `boron_conc` channel, which is an M4-only command. Below M4 there is no boration at all,
    // so replaying this engine-direct would not test a weaker ATWS — it would test one with no
    // response. That is exactly the PWR-N15 case the flag exists for.
    //
    // A CLAIM THIS REPO CARRIED IS WRONG, AND THIS PROCEDURE IS WHERE IT WAS CAUGHT.
    // `CLAUDE.md` says of the pressurizer code safeties that "a real transient cannot reach them
    // at all ... so only an ATWS or a failed instrument gets there", and I repeated the ATWS half
    // in my own voice when ruling Tier C. Measured 2026-08-03, three ways, full stack:
    //   ATWS from a turbine trip                    peak 2321 psi (16.00 MPa), safeties NEVER lift
    //   + total loss of feedwater                   peak 2293 psi (15.81 MPa), never lift
    //   + PORV block valve shut as well             pressure never approaches the pop either
    // The pop is 2484 psi (17.13 MPa). **An ATWS does not get there**, because the negative
    // moderator coefficient collapses power before pressure can run: 100 % -> 43.6 % in five
    // minutes with nobody touching anything. I have not proven NO ATWS could reach the safeties,
    // only that these three do not. The code safeties' reachability is back to being an open
    // question, and `CURRICULUM.md` no longer claims ATWS answers it.
    //
    // WHAT IT ACTUALLY TEACHES IS BETTER THAN WHAT I THOUGHT. This is A1 at its most dramatic —
    // the negative MTC is *the* reason a PWR ATWS is survivable — followed by A8: boron is what
    // finishes it. Measured mitigated, boron target to 1400 ppm at t+2 min:
    //   5 min   43.6 %   (MTC alone, no operator action)
    //   25 min  34.2 %   boron 684 ppm
    //   35 min   9.6 %   boron 714 ppm
    //   45 min   0.04 %  boron 744 ppm — subcritical
    // 126 ppm and about 44 minutes, with pressure never leaving 2235 psi (15.41 MPa).
    {
      id: 'pwr_atws', category: 'emergency', manual_ref: 'PWR-E13', stack_only: true,
      title: 'Mode 1 emergency — failure to scram (ATWS)',
      purpose: 'A trip is demanded and the rods do not go in. The reactor will not be shut down by the control rods, so it has to be shut down chemically — boration is the response, and the negative temperature coefficient of the plant itself buys you the time to do it.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: [
        'THE PLANT SAVES ITSELF FIRST. Measured, power falls 100 % → 43.6 % in five minutes with nobody doing anything — the negative moderator coefficient. That is the margin you are working inside; it is not a fix.',
        'BORATION IS THE ONLY REAL ACTION. Measured, 126 ppm over about 44 minutes takes it from full power to subcritical. Start it early: the clock is the response.',
        'Keep the heat sink. An ATWS with a dry steam generator is the catastrophic version — feed or AFW is not optional here.',
        'The pressurizer code safeties are NOT the story. Measured three ways, an ATWS peaks at 2321 psi (16.00 MPa) against a 2484 psi (17.13 MPa) pop and never lifts them.',
      ],
      steps: [
        { text: 'A trip is demanded — here by a turbine trip above P-9 — and the rods do not go in. (Failures tab → inject Failure to Scram first, then Turbine Trip.) The board shows the trip and power does not collapse.', control: '(observe rods and power)', target: 'trip demanded, power holding',
          cmd: { action: 'inject_failure', failure_id: 'failure_to_scram' }, hold: 20 },
        { text: 'Trip the turbine to remove load, which is what demands the reactor trip above P-9. Watch the demand arrive and the rods stay out.', control: 'Main Breaker', target: 'reactor trip demanded, rods stay out',
          cmd: { action: 'trip_turbine' }, hold: 60 },
        { text: 'Attempt the manual SCRAM again. It will not work — but confirming that is what tells you this is an ATWS and not a slow trip.', control: 'SCRAM', target: 'scram refused, rods stay out',
          cmd: { action: 'scram' }, hold: 240,
          note: 'Meanwhile the plant is already helping: power falls toward the low 70s on the moderator coefficient alone as Tavg rises — the MTC throttles the unscrammed core toward what the 28 % dump can carry (#419: the equilibrium sat near 43 % on the old 40 % dump; the smaller honest sink parks it higher). Do not mistake that for the trip working.',
          acc: { p: 'power_pct', op: '<', v: 78 } },
        { text: 'EMERGENCY BORATION — Boron control ON, target well above current. This is the actual shutdown mechanism: with the rods unavailable, boron is the only reactivity control you have left.', control: 'Boron control', target: 'boron rising toward shutdown',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 1400 }, hold: 1500,
          note: 'Measured class (#419 anchor): roughly 130 ppm of boration over about three-quarters of an hour takes the core from full power to subcritical. It is slow by design — that is what the temperature coefficient is buying you.',
          acc: { p: 'boron_ppm', op: '>', v: 660 } },
        { text: 'Hold the heat sink while the boron works — auxiliary feedwater on the steam generator, steam dump carrying what the core is still making. An ATWS with a dry generator is the version that damages fuel.', control: 'AFW', target: 'heat sink maintained',
          cmd: { action: 'set_afw', active: true }, hold: 1200,
          acc: { p: 'power_pct', op: '<', v: 5 } },
        // hold added at #419 wave 3: the anchor re-solve moved hot critical boron up
        // ~22 ppm, so the same boration timeline arrives ~7 min later at the < 1 % mark
        // (measured 1.28 % at the old step end, still falling).
        { text: 'Confirm the core is subcritical on boron — power collapsing toward zero with the rods still out. The plant is shut down chemically, not mechanically, and it stays that way until the boron comes back out.',
          control: '(observe)', target: 'power < 1 %, rods still out', hold: 600,
          acc: { p: 'power_pct', op: '<', v: 1 },
          note: 'Measured end-state class: power well under 1 % with boration continuing toward the target, Tavg near the no-load anchor, pressure never leaving 2235 psi (15.41 MPa) — the code safeties are not part of this event.',
          hl: ['Boron control', 'SCRAM', 'AFW'] },
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor shut down CHEMICALLY with the rods unavailable: the moderator coefficient held power down while ~130 ppm of boron over about three-quarters of an hour took the core subcritical, heat sink maintained throughout and the pressurizer safeties never challenged.',
    },
    // PWR-E17 — continuous rod withdrawal. Authored 2026-08-03 (#319 item 5). This one is the
    // direct BEFORE/AFTER for the #311 protection work, and it is worth having the pair:
    //   flag OFF (#311's own measurement): 114.8 % power held for ~17 s with NO TRIP, because
    //     the power-range high trip sits at 120 % and nothing else was watching.
    //   flag ON  (measured 2026-08-03, full stack, severity 0.5 = 3 steps/s):
    //     t+6.1 s  `opdt_approach` annunciates — 1.8 s of warning
    //     t+7.9 s  SCRAM, reason `opdt_margin low`, at 114.6 % power
    //   Same peak. The difference is that the plant STOPS there instead of riding it.
    //
    // THE ROD STOP NEVER ENGAGES, and that is the lesson rather than a defect. OPΔT's stop is
    // an INTERLOCK on `rod_start`/`rod_nudge` — it blocks the OPERATOR. A runaway is not an
    // operator, and `pwr_engine.js` refuses operator rod commands on the control bank outright
    // while the failure is active (`!(g.id === 'control_rods' && s._fail.rod_runaway.active)`).
    // So the control-grade defence is bypassed by construction and only the TRIP saves the core.
    // Measured, the 1.5 DPM startup-rate block (§8.18) does not fire either: SUR peaks at
    // 0.46 DPM, nowhere near it. At power, OPΔT is the whole defence.
    //
    // Step 2 has the operator try to insert AND EXPECT IT TO FAIL — that is PWR-E17 step 1 as
    // written, and the failed attempt is what teaches that this is not a control problem.
    // Step 3 carries an explicit scram for the usual layer reason: OPΔT is an M4 trip, so
    // `run_procedures` engine-direct has no RPS and would ride the transient.
    {
      id: 'pwr_rod_withdrawal', category: 'emergency', manual_ref: 'PWR-E17',
      title: 'Mode 1 emergency — continuous rod withdrawal',
      purpose: 'The control bank is withdrawing on its own and power is climbing. Try to insert against it, find that you cannot, and trip the reactor — the overpower protection is what actually stops this, not the rod controls.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: [
        'YOU CANNOT ROD YOUR WAY OUT OF THIS. A runaway ignores operator rod commands on the control bank outright — attempting Lower is a diagnostic, not a fix.',
        'The OPΔT ROD STOP will not save you either. It is an interlock on operator rod motion, and a runaway is not an operator. Only the trip stops it.',
        'The startup-rate block does not fire at power. Measured, the rate peaks near 0.46 DPM against a 1.5 DPM block — that interlock is a startup defence, not this one.',
        'Do not wait for the power-range high trip at 120 %. Measured, overpower ΔT trips first at about 114.6 %; without it this casualty rides above 114 % un-tripped.',
      ],
      steps: [
        { text: 'The bank starts withdrawing on its own. (Failures tab → inject Continuous Rod Withdrawal.) Watch STARTUP RATE go positive and power climb off 100 %.', control: '(observe rod position and power)', target: 'power climbing',
          cmd: { action: 'inject_failure', failure_id: 'continuous_rod_withdrawal', severity: 0.5 }, hold: 8,
          saw: { p: 'power_pct', op: '>', v: 104 } },
        { text: 'Try to insert against it — Reactor card → Control Bank → Lower, and hold. It will not work: the bank ignores you while the runaway is active. That failed attempt IS the diagnosis, and it tells you this is a protection problem, not a control problem.', control: 'Control Bank', target: 'insertion refused — rods keep going',
          note: 'The engine refuses operator rod commands on the control bank outright while this failure is active. Expect no response at all, not a slow one.',
          cmd: { action: 'rod_start', group_id: 'control', direction: -1 }, hold: 6,
          saw: { p: 'power_pct', op: '>', v: 108 } },
        { text: 'TRIP THE REACTOR. On the shipped plant overpower ΔT does it for you at about 114.6 % — you should be confirming a trip that has already happened, with the OPΔT approach alarm having come in a second or two before it. If power is still climbing, scram now.', control: 'SCRAM', target: 'power collapsing',
          note: 'Measured: OPDT APPROACH at t+6.1 s, scram at t+7.9 s on `opdt_margin low`. Without that protection the plant holds 114.8 % for ~17 s and never trips, because power-range high sits at 120 %.',
          cmd: { action: 'scram' }, hold: 60, acc: { p: 'power_pct', op: '<', v: 5 } },
        { text: 'Verify the rods went in. A runaway that also sticks on the scram is a different and much worse event — PWR-E18 — so confirm power is genuinely collapsing and not levelling off.', control: 'Control Bank', target: 'rods in, power collapsing',
          hold: 60, acc: { p: 'power_pct', op: '<', v: 1 } },
        obs('Stabilize on the heat sink: turbine off the grid, steam dump carrying decay heat, auxiliary feedwater holding steam generator level. This is Mode 3, Hot Standby — the post-trip response (PWR-T06) takes it from here.',
          { p: 'plant_mode', op: '~', v: 3, tol: 0.5 },
          'The rod withdrawal failure is still injected — clear it before attempting any restart, or the same thing happens on the way back up.',
          ['SCRAM', 'Control Bank', 'AFW']),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Runaway terminated by the reactor trip — overpower ΔT on the shipped plant — with the core undamaged and the plant stable in Mode 3, Hot Standby.',
    },
    // PWR-E06 — SGTR. Authored 2026-08-03 (#319 item 2), AFTER #322 was investigated and ruled.
    //
    // THIS PROCEDURE WAS BLOCKED FOR A DAY BECAUSE TWO OF ITS SIX STEPS TAUGHT THINGS THE PLANT
    // DOES NOT DO, and the fix was to the MANUAL, not the physics *(OWNER RULING, 2026-08-03:
    // "Declare")*. Measured, and now declared at `DESIGN_COMPANION.md` §8.26:
    //   · SG level does NOT rise. The leak is a primary-side mass sink with ΔP modulation;
    //     `leak_to_sg` names the ΔP dependence and routes nothing, and the SG level integrator
    //     is `(feedwater_flow − steam_out)` with no leak term. Measured: level held 67.98 %
    //     CONSTANT for four minutes with feed, AFW and steam flow all zero.
    //   · The MSIV does not change the secondary pressure trend — 134.6 psi open vs 134.0 shut.
    //     SG pressure is capped at Psat(Tavg), so it follows primary TEMPERATURE.
    // So this checklist diagnoses on the PRIMARY side only, which is what the plant actually
    // gives you. The reason it is not worth building the secondary side is scope, not fidelity:
    // one steam generator is modelled, so "which generator is leaking" — the whole point of the
    // level cue on a real plant — cannot be taught here at any fidelity.
    //
    // WHAT DOES WORK IS THE GOOD HALF, and it is the reason the procedure exists. The leak is
    // ΔP-scaled, so depressurizing toward the secondary SELF-LIMITS it. Measured full stack,
    // severity 0.5: dropping the Pressure SP took the primary 2223 → 1433 psi (15.33 → 9.88 MPa)
    // and break flow 0.0129 → 0.0062 — a 52 % cut. That is Tier A A3 (pressure follows
    // temperature; subcooling is the margin) under casualty conditions.
    //
    // Step 2 SCRAMS EXPLICITLY rather than waiting for the automatic trip. E06 step 1 says
    // "SCRAM if not automatic", so that is faithful — and it is also what makes the run
    // layer-robust: the RPS is M4, so `run_procedures` (engine-direct) would never trip on its
    // own. Same lesson as PWR-E23: an acceptance has to be a truth BOTH layers produce.
    {
      id: 'pwr_sgtr', category: 'emergency', manual_ref: 'PWR-E06',
      title: 'Mode 1 emergency — steam generator tube rupture',
      purpose: 'A primary-to-secondary leak through a ruptured tube. It outruns charging, so the plant trips itself. Diagnose it on the PRIMARY side, then depressurize toward secondary pressure — the leak is driven by the pressure difference, so closing that difference is what shuts it down.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: [
        'THE STEAM GENERATOR WILL NOT CONFIRM THIS FOR YOU. SG level does not rise and the MSIV does not change the secondary pressure trend — a declared departure (DESIGN_COMPANION §8.26), because this trainer models one steam generator and the level cue exists on a real plant to tell you WHICH one is leaking.',
        'Diagnose on the primary: inventory falling with charging saturated, pressurizer level driving through the trip, subcooling eroding.',
        'Depressurize with subcooling in hand. The leak stops when the primary reaches secondary pressure — but a primary taken below saturation is a different emergency.',
        'Unlike a seal leak (PWR-E23), this one IS pressure-modulated. That is the whole strategy: you terminate it from the control room by closing the ΔP.',
      ],
      steps: [
        { text: 'The rupture opens. (Failures tab → inject Steam Generator Tube Rupture.) Primary inventory starts leaving through the tube into the secondary — charging comes up to meet it and cannot.', control: '(observe inventory and charging)', target: 'inventory falling',
          note: 'Measured at this severity (#408 real flows): break flow starts near 145 gpm (3.2e-4 inventory-frac/s), well beyond the 60 gpm (1.33e-4) maximum the charging pump can make up.',
          cmd: { action: 'inject_failure', failure_id: 'sgtr', severity: 0.25 }, hold: 90,
          saw: { p: 'core_inventory_pct', op: '<', v: 100 } },
        { text: 'Trip the reactor. On the real plant the low pressurizer level trip does it for you as make-up loses the race — do not wait for it if pressure and level are already going.', control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 60, acc: { p: 'power_pct', op: '<', v: 5 } },
        { text: 'Establish the heat sink. Main feed is gone with the trip — start auxiliary feedwater and keep the steam generator wet, or the primary has nowhere to put decay heat while you are working the leak.', control: 'AFW', target: 'AFW delivering',
          cmd: { action: 'set_afw', active: true }, hold: 60, acc: { p: 'afw_active', op: '>', v: 0 } },
        { text: 'Ensure high-pressure injection is in. Charging has already lost this race — HPI is what keeps the core covered while you work the leak, and it is the difference between a stabilized plant and a damaged one.', control: 'HPI/LPI', target: 'HPI injecting',
          note: 'On the shipped plant HPI actuates itself on low pressure. Confirming it is a real step, not a formality — engine-direct, without it, this casualty takes fuel temperature past 2192 °F (1200 °C).',
          cmd: { action: 'set_hpi', active: true }, hold: 60, acc: { p: 'hpi_active', op: '>', v: 0 } },
        { text: 'Confirm the diagnosis on the PRIMARY side — inventory down, pressurizer level low, subcooling shrinking. Do not go looking for it on the steam generator; on this plant the secondary tells you nothing.', control: 'Plant Pressure', target: 'primary-side signature',
          // #408 RE-POINTED (was leak_flow > 0.004): engine-direct the post-scram drain takes
          // the primary THROUGH secondary pressure (P 8.8 vs SG 8.1 with the heater-cut latch
          // holding the pzr restore off), so a break-flow acceptance there is a coin toss
          // around dP = 0 — while under the stack it reads 1.56e-4. The step's own text names
          // the confirmation: the PRIMARY-side signature. Inventory is that signature in both
          // layers (95.7 engine-direct / 96.9 stack, vs 100 healthy).
          hold: 60, acc: { p: 'core_inventory_pct', op: '<', v: 98 } },
        { text: 'Secure high-pressure injection. Check your criteria FIRST — subcooling in hand, heat sink established, the core covered — because this is the step that makes the next one possible: injection is holding the primary up at pressure, and while it runs the Pressure SP does nothing at all and the leak does not move.', control: 'HPI/LPI', target: 'HPI secured',
          note: 'RE-MEASURED at the #408 real flows, and the reason this step exists CHANGED with them. On the compressed plant, injection out-pressurized the setpoint channel and the SP walk-down cut break flow by 0 % until HPI was secured. Real HPI (2.0e-4 frac/s) cannot do that: measured, the walk-down works with injection still in — but the plant then climbs through 101 % inventory at ten minutes and keeps filling toward solid, which challenges the PORV. That overfill is exactly what the SI-termination criteria in every real SGTR procedure exist to prevent, and it is now the measured reason for this step. Check the criteria first: subcooling in hand, heat sink on AFW, core covered.',
          cmd: { action: 'set_hpi', active: false }, hold: 60,
          acc: { p: 'hpi_active', op: '<', v: 1 } },
        { text: 'Now close the pressure difference. Walk the PRESSURE SP down toward secondary pressure — the leak is driven by primary-minus-secondary ΔP, so every psi you come down is break flow you do not lose.', control: 'Pressure SP', target: 'break flow falling',
          note: 'Measured at this severity with injection secured at the previous step (#408 real flows): closing the gap took primary 1774 -> 1452 psi (12.23 -> 10.01 MPa) and cut break flow 1.36e-4 -> 6.2e-5, a 54 % reduction. It holds near 6.1e-5 (27 gpm) with inventory RECOVERING on charging alone - 97 -> 99.6 % over ten minutes - and peak fuel 581 F (305 C) against the 2192 F (1200 C) guard.',
          cmd: { action: 'set_pressure_setpoint', mpa: 10.0 }, hold: 60,
          acc: { p: 'leak_flow', op: '<', v: 1.0e-4 } },   // #408 re-band: discriminates — 1.36e-4 before the walk-down, 6.2e-5 after (was < 0.005, which real flows never exceed)
        obs('Confirm the leak is throttled and the core is still covered. The plant is not fixed — it is stabilized, with the leak held down by the pressure you are holding. A real recovery continues into a cooldown on the intact loop.',
          { p: 'melted', op: '<', v: 1 },
          'The break flow will creep back up as the secondary blows down and the ΔP reopens. That is the physics, not a failure of the action — it is why a real SGTR ends in a cooldown rather than a hold.',
          ['Pressure SP', 'Plant Pressure']),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor tripped, leak diagnosed on the primary side, and break flow cut by more than half by depressurizing toward the secondary — the ΔP strategy the procedure exists to teach.',
    },
    // PWR-E23 — the everyday leak. Authored 2026-08-03 (#319 item 3). This is the ONLY
    // abnormal procedure on the plant where nothing breaks: charging holds it indefinitely,
    // there is no trip, no ESF and no subcooling loss, and the whole lesson is that you have
    // to READ the board rather than react to it.
    //
    // `rcp_seal_leak` had NO test coverage of any kind before this — not a behaviour probe,
    // not a scenario, nothing. Every claim below was measured for the authoring.
    //
    // MEASURED full stack, `hot_full_power`, shipped lineup, severity 0.4 injected at t=120 s.
    // The manual's numbers are right in every particular, which is worth recording because it
    // is not the usual outcome of checking one:
    //   charging   0 -> 0.0417 and HOLDS, letdown steady at 0.0300
    //   pzr level  parks at 53.79-53.81 % — the manual says "around 52-54 %"
    //   subcooling 73.77 °F (40.99 °C), UNCHANGED from the pre-leak value
    //   inventory  settles 98.82 % — a standing deficit, not a descent
    //   no trip, power stays 100 %
    // ALARMS, measured against `.state` rather than presence (the `getAlarms()` trap):
    //   t+60 s   nothing active at all
    //   t+181 s  `charging_high` active — and it is the ONLY alarm that ever comes in
    //   PZR LVL LO (program - 20) and PZR LVL DEV LO never assert, exactly as the procedure warns
    //
    // Step 1 puts CVCS in AUTO explicitly — real procedure (confirm the lineup before you
    // judge a leak by how hard make-up is working).
    //
    // THE CHARGING CUE IS M4-DEPENDENT AND THE ACCEPTANCES HAD TO GIVE WAY TO THAT. I assumed
    // `set_cvcs_auto` being an ENGINE command would make the charging number layer-robust. It
    // does not: measured on the SAME leak (#408 real currency), charging settles at 9.4e-5
    // under the stack and 2.57e-5 engine-direct — apart because the `cvcs_makeup` M4 channel
    // (and its letdown lineup) is what actually drives make-up on the shipped plant. What IS
    // layer-robust is the OUTCOME: pzr level parks near 54 % and subcooling holds, in BOTH.
    // So the charging acceptance is only `> 1.5e-5` (make-up is running at all) and the tight
    // numbers live in the step notes. The #209 class — a gate certifying a lineup that does
    // not ship — is why this is written down rather than tuned until it passed.
    {
      id: 'pwr_seal_leak', category: 'emergency', manual_ref: 'PWR-E23',
      title: 'Mode 1 abnormal — reactor coolant pump seal leak',
      purpose: 'A small primary leak to containment. Charging makes it up and the plant stays at power — nothing forces your hand. Diagnose it from CHARGING FLOW, size it, and decide what to do on your own terms.',
      from: 'hot_full_power',
      prereq: ['At-power operation, CVCS available.'],
      cautions: [
        'PZR LVL LO does NOT come in. It sits 20 points below the programmed level and a held leak parks within a point or two of program — waiting for a level alarm means waiting all shift.',
        'PZR LVL DEV LO stays clear too. The deviation only opens when make-up STOPS holding, so its silence is information, not the absence of a problem.',
        'This leak is NOT pressure-modulated. Unlike an SGTR, depressurizing does nothing to it — you cannot terminate it from the control room.',
        'Rule out the impostors before believing the leak: isolated or throttled letdown, or a deliberate level-setpoint change, produce the same high-charging picture.',
      ],
      steps: [
        { text: 'Confirm the inventory lineup first: CVCS in AUTO, so charging is free to make up whatever is lost. You are about to judge a leak by how hard make-up is working — that only means anything if make-up is actually in control.', control: 'CVCS Inventory Control', target: 'CVCS in AUTO',
          cmd: { action: 'set_cvcs_auto', active: true }, hold: 30 },
        { text: 'The leak starts. (Failures tab → inject Reactor Coolant Pump Seal Leak.) Nothing dramatic happens — watch CHARGING FLOW rise and settle while LETDOWN stays where it was. That imbalance IS the leak.', control: 'CVCS Inventory Control', target: 'charging rises, letdown steady',
          note: 'Measured (#408 real flows): charging settles near 42 gpm against letdown’s 30 — the 12 gpm difference IS the leak. CHG FLOW HI (36 gpm) comes in a few minutes after the leak starts — it is the only alarm you will get.',
          cmd: { action: 'inject_failure', failure_id: 'rcp_seal_leak', severity: 0.4 }, hold: 300,
          acc: { p: 'charging_flow_actual', op: '>', v: 1.5e-5 } },   // #408 re-band: engine-direct settles 2.57e-5, full stack 9.4e-5 (the documented layer split); was > 0.005, which real charging (max 1.33e-4) never reaches
        { text: 'Now confirm the make-up is winning. Pressurizer level should sit a little BELOW program and hold there — stable, not falling. A level that is still descending means make-up is losing and this is no longer this procedure.', control: 'Pressurizer Heaters (PZR)', target: 'level stable just below program',
          hold: 300, acc: { p: 'pzr_level_pct', op: '~', v: 54, tol: 3 } },
        { text: 'Check subcooling. A leak this size costs you none of it — if subcooling is eroding, you have a bigger leak than a seal and you are heading for the loss-of-coolant response instead.', control: 'Plant Pressure', target: 'subcooling unchanged',
          hold: 120, acc: { p: 'subcooling_c', op: '>', v: 35 } },
        { text: 'Trend the charging demand at steady load. Flat means a stable leak you can plan a shutdown around; rising means it is growing and the decision gets made for you.', control: 'CVCS Inventory Control', target: 'charging flat',
          hold: 420, acc: { p: 'subcooling_c', op: '>', v: 35 } },
        obs('Confirm the plant is still where you left it: at power, no reactor trip, no safety injection, subcooling intact. The leak is identified and sized, and the shutdown decision is yours to make deliberately.',
          { p: 'scrammed', op: '<', v: 1 },
          'This is the acceptance the procedure asks for — a stable, alarm-quiet plant with a known leak, not a recovered casualty.',
          ['CVCS Inventory Control', 'Plant Pressure']),
      ],
      guard: { never_melted: true, never: [{ p: 'subcooling_c', op: '<', v: 5 }] },
      outcome: 'Leak identified from charging flow and trended flat, with the plant still at power — no trip, no ESF, and the decision to shut down made on the operator’s terms rather than forced.',
    },
    {
      id: 'pwr_tmi', category: 'accident', narrative: true, manual_ref: 'PWR-E08',
      title: 'Three Mile Island (1979) — an accident of information',
      purpose: 'The famous accident where an indicator said a valve was shut while it was stuck open — so the crew throttled the very injection that would have saved the core.',
      from: 'hot_full_power',
      steps: [
        obs('SETUP — Hot Full Power. Failures tab → Loss of Main Feedwater. The reactor trips; pressure rises and the Power-Operated Relief Valve (PORV) opens automatically (~2350 psi (16.2 MPa)).'),
        obs('Failures tab → PORV Stuck Open, then PORV Indicator Stuck Closed. The PORV is truly open but its indicator reads CLOSED — coolant leaks invisibly.'),
        obs('As coolant boils off, the Pressurizer (PZR) level RISES even as total inventory FALLS — the TMI trap that invites throttling High-Pressure Injection (HPI).'),
        obs('The truth-teller is SUBCOOLING on the Power & Reactivity card — it erodes toward zero. Trust it over the PORV indicator.'),
        obs('RECOVERY — PORV Block Valve → Isolate stops the leak (see procedure "Stuck-open relief valve"). Keep injection flowing; do not throttle HPI on a rising PZR level alone.'),
        obs('OUTCOME — isolate + inject: core stays covered (engine flagship recovery branch). Throttle injection as in 1979: uncovery and fuel damage (damage branch).'),
      ],
    },
  ];

  /* ---- PWR2 — THE SHIPPED PLANT'S OWN POOL (#244/#526, 2026-08-31) --------------------
   * Authored AGAINST PWR2 and measured on it (HR12: every number below is from a full-stack
   * ride on `RD.SimulationService` selectPlant('pwr2', …), 2026-08-31 — the ride record is
   * the #244 issue comment + TUNING_LOG). NOT a copy of the pwr pool: the two plants differ
   * in the load-bearing places —
   *   · the control bank is 0..627 steps (the SOURCED four-bank overlap scale, WTSM 8.1
   *     §8.1.5.4; differential 4.15 min / 6.49 mean / 8.82 peak pcm/step, inside the
 *     sourced 4-12 band), so the whole 1/M ladder re-derives (#602 phase 2);
   *   · the shell REFUSES connect_grid / set_load_mode / set_steam_demand /
   *     set_sr_detector — dispatch is `set_load_target`, reconnection is reset_rps +
   *     latch_turbine + set_load_target, and the SR channel auto-energizes (#529);
   *   · SG level AUTO is `set_feed_coupled` (the internal three-element controller), not a
   *     kernel channel — the kernel carries only boron_conc + afw_level;
   *   · the Pressure SP dial floors at the sourced 1700 psig board span, so the cooldown's
   *     low-pressure leg is heaters-0 + aux spray, not a dialed setpoint;
   *   · the accumulator valve carries a 1600 psig administrative power lock (TS Bases
   *     B 3.5.1), which times BOTH directions' accumulator steps.
   * The pwr pool above stays as-is — the retired-engine gates replay it. Chain: each entry
   * names `next`, so the finished-card handoff walks Mode 5 → full power → Mode 5. */
  var PWR2 = [
    {
      id: 'pwr_heatup', category: 'startup', manual_ref: 'PWR-N01', next: 'pwr_startup',
      title: 'Mode 5, Cold Shutdown → Mode 3, Hot Standby — plant heatup (pump heat)',
      purpose: 'Take the plant from Mode 5, Cold Shutdown to Mode 3, Hot Standby on reactor coolant pump heat alone. Start the pumps, withdraw the shutdown bank, pressurize in two stages, arm the accumulators inside their window, and ride temperature up with the reactor never critical. Runnable: the steps check themselves off the instruments.',
      from: 'cold_shutdown',
      prereq: ['Plant in Mode 5, Cold Shutdown: average coolant temperature (Tavg) near 122 °F (50 °C), pressure near 363 psi (2.5 MPa), reactor subcritical, residual heat removal (RHR) in service.', 'Reactor coolant pumps (RCP) available to start. They are the heat source.'],
      precond: [
        { p: 'tavg_c', op: '<', v: 95, text: 'Plant cold, Mode 5: Tavg near 122 °F (50 °C)' },
        { p: 'pressure_mpa', op: '<', v: 5, text: 'Depressurized: near 363 psi (2.5 MPa)' },
        { p: 'power_pct', op: '<', v: 1, text: 'Reactor shut down' },
      ],
      cautions: [
        'Heatup rate limit: 100 °F/hr (55.6 °C/hr). Measured on this plant: 87 °F/hr (48.3 °C/hr) with the pressurization running, and up to 113.7 °F/hr (63.2 °C/hr) on pump heat alone. The RHR heat exchanger is the brake.',
        'A steam dump valve open on pump heat removes heat faster than the pumps add it. The dump stays CLOSED and the turbine stays tripped for the whole heatup.',
        'Hot Standby is hot AND subcritical. The control bank stays fully inserted and boron stays at the cold-shutdown concentration. Only the shutdown bank moves, in its own step.',
      ],
      steps: [
        obs('Confirm Mode 5: Tavg 122 °F (50 °C), 363 psi (2.5 MPa), pumps stopped, turbine tripped, both rod banks in.',
          { p: 'plant_mode', op: '~', v: 5, tol: 0.1 },
          null, ['Tavg', 'Plant Pressure', 'Residual Heat Removal (RHR)'],
          'This is a picture of the starting plant, not an action. In Cold Shutdown the coolant is far below boiling, pressure is down, the residual heat removal loop is the heat sink, and both rod banks are fully in. If the pumps are already running or the shutdown bank is already out, the plant has left this picture and the checklist skips it.',
          [{ p: 'pump_flow_pct', op: '>', v: 90 }, { p: 'shutdown_bank_pct', op: '>=', v: 98 }, { p: 'plant_mode', op: '<', v: 5 }]),
        { text: 'Start the reactor coolant pumps: press ON on the RCP card. Forced flow is the heat source.',
          why: 'A shut-down reactor makes almost no heat, but the running pumps put about half a percent of rated power into the water as friction. That is enough to warm the whole plant, and forced flow is what couples the primary to the steam generator. Real crews heat up exactly this way, with the reactor never critical.',
          control: 'RCP Run/Stop', target: 'pump flow above 90 %',
          cmd: { action: 'set_rcp', running: true }, hold: 30,
          acc: { p: 'pump_flow_pct', op: '>', v: 90 },
          hl: ['RCP Run/Stop'] },
        /* ONE CLICK, NOT A HOLD *(OWNER, 2026-09-03, #619 item 9: "you dont need to hold
         * withdraw. its set to go automatically on a click")*. Verified at the control:
         * `toggleLatchRod` (pwr_board_wiring.js:3585) issues `rod_start` and latches, and
         * `clearLatchIfDone` (:3598) issues `rod_stop` when the bank reaches its limit. The
         * text said "hold WITHDRAW", which is the retired board's momentary button. */
        { text: 'Withdraw the shutdown bank fully, 627 of 627 steps: SHUTDOWN card, speed FAST, click WITHDRAW once.',
          note: 'One click latches the drive — it runs to the stop on its own, about 10 plant-minutes, and stops there. Click WITHDRAW again to halt early.',
          why: 'The shutdown bank is the plant\'s trip margin — the rods that drop on a scram and hold the core subcritical. A trip only works if they have somewhere to fall, so every mode above Mode 5 wants them parked fully out. Withdrawing them is not a step toward criticality; it is the prerequisite for one (WTSM 8.1.1).',
          control: 'Shutdown Bank', target: 'bank fully withdrawn, 627 of 627 steps',
          cmd: { action: 'rod_nudge', group_id: 'shutdown_rods', steps: 627, speed: 'fast' }, hold: 660,
          /* CHECKED OFF ON THE BANK, NOT ON REACTIVITY *(OWNER, 2026-09-02 playtest / #607 item 4:
           * "the step should key on the rod position not reactivity")*. `>= 98 %` rather than
           * 100: a hold that lands one step short of the stop still did the action.
           *
           * ⚠ A DELIBERATE EXCEPTION to the rule the startup leg now follows — do not "fix" it to
           * an instrument cue (#618, owner-ruled 2026-09-03). The startup's 1/CR ladder dropped its
           * rod-position targets because the sourced procedure steers the approach to criticality on
           * the nuclear instruments; a FULL-WITHDRAWAL VERIFICATION is the opposite case and is
           * position-based in the source too. WTSM 19.0 (ML11223A342) Appendix 19-1 step 7:
           * "Verify all shutdown banks are fully withdrawn within 15 minutes of withdrawing control
           * banks." There is no instrument that tells you a bank is all the way out. */
          acc: { p: 'shutdown_bank_pct', op: '>=', v: 98 },
          hl: ['Shutdown Bank — Withdraw'] },
        { text: 'Confirm the turbine tripped and generator off line. If a load target is set, press UNLOAD (TURBINE-GENERATOR card).',
          why: 'The cold lineup ships the machine tripped — stop valves shut, nothing admitted — so this is a confirmation, not an action. It is worth making anyway: a governor cracked open on pump heat drains the very heatup you are trying to build. Note for later that UNLOAD is not TRIP; unloading walks the load target to zero and leaves the machine latched.',
          control: 'Turbine Load', target: 'turbine tripped, generator off line, 0 MWe',
          cmd: { action: 'disconnect_grid' }, hold: 10,
          acc: { p: 'turbine_tripped', op: '>', v: 0 },
          hl: ['Turbine Load', 'Main Breaker'] },
        { text: 'Press AUTO on the SG FEED card. AUTO starts the main feed pumps and holds steam generator (SG) level.',
          why: 'The cold lineup keeps the main feed pumps secured: nothing is boiling, so nothing needs feeding. Put level control in service while the plant is quiet rather than chasing the band once the generator starts to boil. On pump heat AUTO barely moves — it is there for the swell that comes later.',
          control: 'Feed Pumps', target: 'main feed pumps running, SG FEED in AUTO',
          cmd: { action: 'set_feed_coupled', active: true }, hold: 5,
          acc: { p: 'feed_coupled', op: '>', v: 0 },
          hl: ['SG Feed AUTO', 'SG Level'] },
        /* A CONFIRMATION, NOT AN ACTION *(OWNER, 2026-09-02 playtest, #608 item 1: "doesnt make
         * sense, dump setpoint starts in mode 5 at the setpoint the step asks for. the step then
         * says to leave the dump shut. There is no 'dump shut' button so this is confusing. it
         * should say the exact button to press (if any)")*.
         *
         * Both halves were already true at boot, and the step named neither of them by the words
         * that are on the board. Measured on the Mode 5 initial condition: `steam_dump_setpoint`
         * boots at 7.03 MPa — the exact value this step commanded — so the command was a no-op.
         * And the shut affordance does exist: it is the CLOSE button on the STEAM DUMP card
         * (imrppqxggbj), already the lit one, with the status readout beside it saying MANUAL.
         * Three words on the board for one state, and the step used a fourth.
         *
         * THE SETPOINT IS ALSO INERT IN THIS MODE, which is why moving the initial condition to
         * give the step something to do was DECLINED *(owner ruling, 2026-09-02, choosing
         * "Rewrite as a confirmation" over "Change the Mode 5 dump setpoint")*: 7.03 MPa is the
         * plant's sourced Ginna 1005 psig no-load anchor and content does not drive physics (HR9)
         * — and the player would see no effect anyway. The cold plant boots `dump_mode: 'off'`
         * (pwr2_engine.js dcDrivers), and the setpoint is read ONLY in 'pressure' mode
         * (pwr2_dumpctl.js); nothing reachable from a cold start selects that mode, because the
         * shell maps set_steam_dump auto->'tavg' and closed->'off' only. So the box changes
         * nothing here whatever it is set to.
         *
         * Graded on `steam_dump_valve_pct`, the DEMAND the valve is actually carrying — not on
         * the setpoint, which this step no longer touches and which would check off identically
         * on a dumping plant. */
        { text: 'Confirm the steam dump is shut: CLOSE lit on the STEAM DUMP card, status reading MANUAL. Nothing to press.',
          why: 'Bottling the secondary sends the pumps\' heat into the plant instead of out through the condenser. The cold lineup ships the dump in hand and shut, so this is a check, not an action. The DUMP SETPOINT box reads the no-load anchor, 1020 psi (7.03 MPa), but it only reaches the valve once AUTO is selected — on the startup path, not this one.',
          acc: { p: 'steam_dump_valve_pct', op: '<', v: 1 },
          hl: ['Dump SP', 'Steam Dump'] },
        /* THE LETDOWN TRANSFER (#624 items 14/25, 2026-09-04). The LETDOWN selector had never
         * changed anything a player could see, because every initial condition booted with the
         * orifices already in — an orphan control on a board whose plant was pre-lined-up. The
         * cold ICs now boot with them OUT (the source's own shutdown lineup: letdown on the RHR
         * cross-connect HCV-128), so this step is the control's job, and the leg has a real
         * consequence if it is skipped: the RHR suction autocloses at 585 psig on the next
         * step's climb, and from there a plant with the orifices shut has charging and seal
         * injection in and nothing out.
         *
         * THE EFFECT IS ASSERTED, not just the write — see the confirmation step after the
         * ride, which reads the flow AND the RHR lineup together. A `letdown_orifice_a` tick
         * alone would pass on a plant whose cross-connect was still carrying everything. */
        { text: 'Place both letdown orifices in service: press A+B 7 % on the LETDOWN card.',
          why: 'On shutdown cooling, letdown runs out of the residual heat removal (RHR) system through the HCV-128 cross-connect, and the orifices pass almost nothing against the 363 psi (2.5 MPa) plant you start from. The next step\'s climb autocloses the RHR suction at 585 psig (4.03 MPa), and from there the orifices are the only way out — charging and seal injection keep coming in whatever you do. WTSM chapter 19: "Prior to reaching 350 °F (176.7 °C) in the RCS … Terminate residual heat removal letdown to the CVCS". Both, not one: measured, A alone parks the next step at 628 psi (4.33 MPa), under the 665 psi (4.585 MPa) accumulator cover gas.',
          control: 'Letdown Orifices (CVCS)', target: 'both orifices in service — A+B 7 % lit on the LETDOWN card',
          cmd: { action: 'set_letdown_orifices', a: true, b: true }, hold: 10,
          accs: [
            { p: 'letdown_orifice_a', op: '>', v: 0, label: 'Orifice A in service' },
            { p: 'letdown_orifice_b', op: '>', v: 0, label: 'Orifice B in service' },
          ],
          hl: ['Letdown Orifices (CVCS)'] },
        /* "UP", NOT "DOWN" *(OWNER, 2026-09-02 playtest, #608 item 2: "Step 7 says to dial the
         * pressurizer pressure setpoint DOWN to its 1700 psig floor. the problem is the mode 5
         * pressure set point is 363 so you are actually driving it UP not down")*. Measured: the
         * Mode 5 initial condition seeds `pressure_setpoint` at 2.5 MPa = 363 psi, so the dial
         * goes UP by 1337 psi. The word was inherited from the COOLDOWN, where the plant genuinely
         * comes down onto the same floor — and the floor is why the seed can sit under it at all:
         * 363 psi is a constructor seed (a standing lineup), not a dialled value, so it never met
         * the clamp. Touch the dial once and you are inside the 1700-2500 psig span for good.
         *
         * AND THE ACCEPTANCE MOVED, 4.2 -> 4.7 MPa (609 -> 682 psia). This step used to check off
         * at 609 psia while the accumulator cover gas measures 665 psia, so a player who took the
         * tick as permission to do the next step opened the valve BELOW the cover gas — accepted,
         * no refusal, and measured over the following 5 plant-minutes: accumulator inventory
         * 100 % -> 97.2 % and boron 918 -> 940 ppm. An unplanned boration and an accumulator under
         * its inventory, by following the checklist. The replay never saw it because `hold: 2400`
         * dominates the acceptance. 4.7 MPa clears the measured cover gas by 17 psi. */
        { text: 'Raise the pressurizer pressure setpoint (Pressure SP) from 363 psi to 1700 psig, the dial floor. Not 2235 psi yet.',
          why: 'Two stages, because the first must stop below P-11 — the 1972 psi (13.6 MPa) permissive that re-arms the safety injection (SI) signals the cold lineup had blocked. Dial 2235 psi (15.41 MPa) now and the primary crosses P-11 while the steam generator is still cold, below the 327.7 psi (2.26 MPa) low-steam-pressure setpoint: SI actuates on a healthy plant and the heaters shed. A clock also starts with this command — the accumulator window in the next step opens about 35 plant-minutes from here and shuts about 63 minutes after that.',
          control: 'Pressure SP', target: '1700 psig, the dial floor, dialled UP from 363 psi; pressure climbing',
          wait_hint: 'About 35 plant-minutes to the accumulator cover gas. Run at Fast time and COME BACK: the window shuts about 63 minutes after it opens and nothing annunciates it.',
          cmd: { action: 'set_pressure_setpoint', mpa: 11.72 }, hold: 2400,
          acc: { p: 'pressure_mpa', op: '>', v: 4.7 },
          hl: ['Pressure SP', 'Primary Pressure'] },
        /* THE WINDOW IS A TRANSIT, AND THE NUMBERS WERE STALE *(OWNER, 2026-09-02 playtest, #608
         * item 3, filed as a BLOCKER: "I couldnt open the valve, something was blocking it and the
         * step wasnt clear as to what i need to do")*.
         *
         * Two sourced numbers bound this window and BOTH STAY *(owner ruling, 2026-09-02, choosing
         * "Keep both numbers; fix content" over raising the lock or lowering the dial floor)*: the
         * 1600 psig power lock is Ginna TS Bases B 3.5.1 quoted verbatim in pwr2_shell.js, and the
         * 1700 psig dial floor is WTSM 10.2's operator span (ML11223A287), which already carries a
         * ruling that it stays. They are consistent in a real plant precisely BECAUSE a real crew
         * arms the accumulators during the climb rather than at the park point.
         *
         * What was wrong is that this step read as something you do once you have arrived. Measured
         * on the authored ride: the window opens at T+34.8 min (665 psia) and shuts at T+97.4 min
         * (1615 psia), and the plant then PARKS at 1713 psia — above the lock, permanently. The
         * step's own prose said "about 33 to about 104 plant-minutes", which is wrong at both ends,
         * and quoted a "600 psi cover gas" that is `p_min_mpa` in pwr2_eccs.js — a constant that is
         * READ NOWHERE. The tank's LIVE pressure comes from `p0_mpa` and measures 665 psia.
         *
         * The step states the measured 665 psia, and SO DOES THE MANUAL SET NOW *(OWNER RULING,
         * 2026-09-03, #609: "Change the manual to 665 psia")*. When this step was written the two
         * disagreed — the manuals documented a "600 psi cover gas" in eleven places across 04, 05
         * and 12, including 12's trust-class table where it was listed as a structural real-plant
         * setpoint — because that figure is `p_min_mpa`, the LCO MINIMUM, a constant read nowhere.
         * The tank runs on `p0_mpa`, the sourced 650 psig normal cover pressure (WTSM T5.2-2),
         * which this set prints absolute as 665 psia. Swept under Rev 17's pending row.
         *
         * The RHR suction valve's autoclosure interlock is ALSO 600 psi and is UNCHANGED — five
         * correct sites for every accumulator one, so do not sweep this number on the string.
         *
         * And measured across the whole climb, not one accumulator alarm comes in: the only alarm
         * between 665 and 1615 psia is rhr_not_aligned at 591 psia, and the existing accum_aligned
         * row is the opposite polarity (it fires when the valve is OPEN below 1000 psi), so it can
         * never say the window is closing. Until a board cue exists, the step's words are the only
         * warning there is — which is why the clock is stated three times (here, in step 7's why,
         * and in its wait_hint) rather than once. */
        { text: 'Open the Accumulator valve now, on the way past. Nothing opens it for you and nothing warns you.',
          why: 'The accumulators are the passive half of emergency injection — borated water behind a check valve, pushed by nitrogen — and cold lineups isolate them because they would dump into a depressurized plant. The window opens at 665 psi (4.585 MPa), the cover gas, and shuts at 1615 psi (11.136 MPa), where the plant removes power from the valve operator (TS Bases B 3.5.1). This is a transit action: the ride parks the plant above that lock, so miss the window and the only way back is a manual depressurization — HEATER to OFF, SPRAY held open, back down through 1600 psig.',
          control: 'Accumulator valve', target: 'valve open, between 665 psi (4.585 MPa) and 1615 psi (11.136 MPa)',
          cmd: { action: 'open_accumulator_valve' }, hold: 10,
          acc: { p: 'accumulator_valve_open', op: '>', v: 0 },
          hl: ['Accumulator valve'] },
        /* THE TEMPERATURE IS IN THE LINE ITSELF *(OWNER, 2026-09-03, #619 item 15: "step 9 is
         * looking for a temperature that it does not specify")*. It was in `target` and in the
         * acceptance line, both of which render — but the numbered instruction, which is what a
         * player reads first, said only "watch Tavg". A step that waits on a number names it. */
        { text: 'Ride the heatup to Hot Standby: Tavg at or above 541.4 °F (283 °C) at 1700 psig. Do not pull rods or dilute.',
          why: 'Watch Tavg and its rate, the pressurizer level swelling as the water expands, and the reactor staying exactly where you left it. If the rate crowds 100 °F/hr (55.6 °C/hr), raise HX FLOW on the RHR card to bleed heat. Meanwhile the secondary does the thing the final pressurization is waiting for: it bottles up past the 327.7 psi (2.26 MPa) low-steam-pressure SI setpoint on its way to the 1020 psi (7.03 MPa) no-load anchor.',
          control: '(observe)', target: 'Tavg at or above 541.4 °F (283 °C), reactor still subcritical',
          wait_hint: true,
          hold: 40000,
          saw: { p: 'tavg_c', op: '>', v: 150 },
          acc: { p: 'tavg_c', op: '>', v: 283 },
          hl: ['Tavg', 'Primary Pressure', 'SG Pressure'] },
        /* THE EFFECT ACCEPTANCE FOR THE LETDOWN STEP (#624 item 25). The orifice step's own tick
         * reads the SELECTOR; this reads the PLANT, after the transfer has actually happened —
         * RHR gone (the 585 psig autoclose fired during the ride) and letdown still flowing,
         * which at this point can only be the orifices. Two entries, because either one alone
         * passes on the wrong plant: flow > 0 is satisfied by a cross-connect still in service,
         * and RHR out is satisfied by a plant with no letdown path at all. */
        { text: 'Confirm the letdown transfer: RHR suction autoclosed, letdown now on the orifices.',
          why: 'The RHR suction valve takes itself shut at 585 psig (4.03 MPa) — that is the interlock, not an action you take — and the cross-connect goes with it. What is left is the orifice lineup you put in service before the climb, and it now sees system pressure instead of the 363 psi (2.5 MPa) it started against: an orifice passes more the harder you push on it, 10.8 gpm here and 12.7 gpm once the plant reaches 2235 psi (15.41 MPa). If letdown reads zero, the orifices are shut and the plant is filling — put them in service before the second pressurization.',
          accs: [
            { p: 'rhr_active', op: '<', v: 1, label: 'RHR suction autoclosed' },
            { p: 'letdown_flow_actual', op: '>', v: 0, label: 'Letdown flowing on the orifices' },
          ],
          hl: ['Letdown Orifices (CVCS)', 'Residual Heat Removal (RHR)'] },
        { text: 'Raise the Pressure SP to 2235 psi (15.41 MPa). The secondary is hot, so the P-11 crossing is safe.',
          why: 'The second half of the staged pressurization. Climbing past the 1972 psi (13.6 MPa) P-11 permissive re-arms the SI signals the cold lineup had blocked — and every one of them now reads clear, because the secondary is hot: steam pressure 1020 psi (7.03 MPa) against a 327.7 psi (2.26 MPa) setpoint. That is why this dial waited for the ride to finish. Full heaters take about an hour over the last 520 psi.',
          control: 'Pressure SP', target: '2235 psi (15.41 MPa), normal operating pressure',
          wait_hint: 'The last 520 psi takes about an hour of plant time at full heaters. Run at Fast time.',
          cmd: { action: 'set_pressure_setpoint', mpa: 15.41 }, hold: 5400,
          acc: { p: 'pressure_mpa', op: '>', v: 15.0 },
          hl: ['Pressure SP', 'Primary Pressure'] },
        obs('Confirm Mode 3, Hot Standby: hot at the no-load band, pressurized, subcritical, control bank never moved.',
          { p: 'plant_mode', op: '~', v: 3, tol: 0.1 }, null, ['Tavg', 'Primary Pressure'],
          'Hot Standby is hot and pressurized with the reactor still shut down. The control bank is still on the bottom; this heatup never needed it. The next checklist is the approach to criticality, and it starts with a dilution: you are still at cold-shutdown boron.'),
        obs('Confirm the reactor stayed shut down: core deeply subcritical, power still in the source range.',
          { p: 'reactivity_pcm', op: '<', v: -300 }, null, ['Source Range'],
          'The shutdown bank is out and the control bank never moved, so the core is held subcritical on boron and the remaining control-bank worth. Source range counts are a steady background, not a climb.'),
        obs('Confirm no fission heat was made: power near zero for the whole heatup.',
          { p: 'power_pct', op: '<', v: 1 }, null, null,
          'Power near zero is the whole point of a pump-heat heatup: the friction of the running pumps warmed the plant, not a chain reaction. If power is off the floor, something pulled the control bank or diluted. Stop and recover before you continue.'),
      ],
      guard: {
        never_melted: true,
        never: [
          { p: 'fuel_temp_c', op: '>=', v: 1200 },
          { p: 'reactivity_pcm', op: '>', v: 0 },
          { p: 'power_pct', op: '>', v: 1 },
        ],
      },
      outcome: 'Plant at Mode 3, Hot Standby: hot, pressurized, subcritical with zero control-bank motion. Not yet ready to pull rods: the heatup dilutes nothing, so boron is still near 918 ppm. The startup checklist begins with the dilution to the estimated critical concentration.',
    },
    {
      id: 'pwr_startup', category: 'startup', manual_ref: 'PWR-T03', next: 'pwr_raise_power',
      title: 'Mode 3, Hot Standby → Mode 1, At Power — startup to power',
      purpose: 'Take the reactor from Mode 3, Hot Standby through criticality (Mode 2, Startup), across the 5 % boundary into Mode 1, At Power, and put the turbine on line. Dilute to the estimated critical boron, predict criticality with the 1/M (inverse count-rate) plot, and pace the rise on the startup rate. Runnable.',
      from: 'hot_zero_power',
      prereq: ['Plant at Mode 3, Hot Standby: subcritical, at no-load temperature and normal operating pressure.', 'Reactor coolant pumps (RCP) running: forced flow established.', 'Control bank fully inserted; shutdown bank fully withdrawn.'],
      /* MEASURED on hot_zero_power (2026-08-31, full stack): tavg 286.2 °C, 15.41 MPa,
       * boron 719 ppm, ρ −1,137 pcm, SR 502 cps. The boron row is the heatup→startup seam:
       * a pump-heat heatup arrives at ≈ 918 ppm — the dilution steps below are the remedy. */
      precond: [
        { p: 'tavg_c', op: '~', v: 286, tol: 8, text: 'Hot Standby at the no-load temperature, near 546.8 °F (286 °C)' },
        { p: 'pressure_mpa', op: '~', v: 15.41, tol: 0.5, text: 'At normal operating pressure, 2235 psi (15.41 MPa)' },
        { p: 'power_pct', op: '<', v: 1, text: 'Subcritical: the withdrawal starts from a shut-down core' },
      ],
      cautions: [
        'Startup rate (SUR) limit for the approach: 1 decade per minute (DPM). The rate is the warning, not the bank position. Measured on this plant, one control-bank step in the critical band is worth 8.1 pcm, so a burst you would call small still moves the core.',
        'While subcritical, the count rate is the reactivity indication and the bank position is not. Withdraw a burst, STOP, and let the counts settle before you read anything: the closer to critical, the longer they take to level off.',
        'The 1/M prediction reads high early and walks down as points are added. Never withdraw straight to the number it prints. Measured on this plant from the 719 ppm start, the plot converges on a true criticality between 226 and 238 of 627 steps.',
        'The source range needs no securing on this plant. The channel de-energizes itself as the intermediate range takes over. There is no operator lever.',
        'From the point of adding heat the steam generator boils down with the turbine off line. SG FEED in AUTO is what holds level.',
      ],
      steps: [
        obs('Confirm the plant is ready: subcritical, steady source range counts, Tavg 546.8 °F (286 °C), pressurized, pumps running.',
          { p: 'tavg_c', op: '~', v: 286, tol: 8 },
          null, ['Source Range', 'Tavg', 'Primary Pressure', 'Reactor Coolant Pumps (RCP)'],
          'This is the plant the heatup hands you: hot, at pressure, pumps running, still shut down. A steady source range count means nothing is drifting toward critical yet. If you arrived from the Hot Standby preset instead of the heatup, the shutdown bank is already out and boron is already near 719 ppm.',
          { p: 'power_pct', op: '>', v: 1 }),
        { text: 'Dilute to the estimated critical concentration, 719 ppm: BORON card, set 719, press ON.',
          why: 'Work out where criticality should be before you move a rod. At 918 ppm the bank cannot make the core critical inside its travel; at 719 ppm criticality sits near 230 of 627 steps, comfortably inside the insertion limit. Note which way the calculation runs: you choose the rod position you want to be critical at, then move BORON until that is true — never chase the prediction with the rods.',
          note: 'A plant fresh from the pump-heat heatup sits near 918 ppm and the make-up panel dilutes at about 3 ppm/min. From the Hot Standby preset you are already at 719 ppm, so this step just verifies.',
          control: 'Boron control', target: '719 ppm',
          wait_hint: 'From the heatup\'s 918 ppm this takes about 65 plant-minutes at the make-up rate. Run at Fast time.',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 719 }, hold: 60,
          acc: { p: 'boron_ppm', op: '~', v: 719, tol: 40 },
          hl: ['Boron', 'Boron control'] },
        /* CONFIRM, NOT ACT *(OWNER, 2026-09-03, #619 item 16: "mode 3 CL has me put SG feed in
         * AUTO but its already in AUTO when I get there")*. Both routes into this leg arrive
         * with feed already in AUTO — the Hot Standby preset boots it there, and a player who
         * came up the heatup did it themselves at PWR-N01 step 5. So the instruction was one the
         * plant had already carried out, which teaches the player that checklist steps are
         * decoration.
         *
         * The step STAYS, as a verification: SG feed in AUTO is a genuine prerequisite for
         * adding heat and a checklist that silently assumes it is worse than one that checks it.
         * `cmd` is kept so the replay still exercises the command path, and the text now says
         * what to do in the one case where it is NOT already set. */
        { text: 'Confirm SG FEED is in AUTO before you add any heat. If it is not, press AUTO.',
          why: 'You will normally find this already done — the Hot Standby plant boots with feed in AUTO, and if you came up the heatup you selected it yourself. Verify it anyway: skip it and nothing happens until the point of adding heat, and then the generator boils down with no regulator while auxiliary feedwater (AFW) parks the level in the low amber band. AFW is an emergency heat sink, not a level control system.',
          control: 'Feed Pumps', target: 'SG FEED reading AUTO, SG level near 65 %',
          cmd: { action: 'set_feed_coupled', active: true }, hold: 5,
          hl: ['SG Feed AUTO', 'SG Level'] },
        /* THE INDICATION IS NAMED, AND SO IS ITS NOTATION *(OWNER, 2026-09-03, #619 item 19:
         * "It never says to look at the SOURCE RANGE indication for counts… SOURCE RANGE says
         * 7.0e2 but step says 700. a layman wont know this is equivalent")*. The counts are the
         * whole reactivity indication on this leg and no step said where to read them. The
         * meter is a LOG channel and prints its exponent (ui/app.js logSer), which is
         * prototypical and stays — so the checklist states the equivalence once, here, at the
         * first count target, and the per-step targets carry it in the always-visible line. */
        { text: 'Open the 1/M PLOT tool and press Plot point before any rod moves. This baseline is the 1.0 reference.',
          why: '1/M is the shutdown count rate divided by the current count rate. As you approach criticality the count rate climbs, so 1/M falls toward zero, and where the trend crosses zero is the predicted critical rod position. The plot fits the latest three points, so the estimate sharpens as you add more.',
          control: '1/M Plot', target: 'baseline captured (point 1), read off SOURCE RANGE',
          note: 'Every count target on this checklist is the SOURCE RANGE indication. It is a logarithmic meter and prints its exponent: 7.0e2 is 700 counts per second, 1.4e3 is 1,400, 2.0e4 is 20,000.',
          accs: [{ cmd: 'plot_1m_point', label: 'Baseline point plotted' }],
          hl: ['1/M Plot Tool', 'Source Range'] },
        /* BURST SIZE, NOT BANK POSITION *(OWNER RULING, 2026-09-03, #619 item 20: "The mode 3>1
         * CLs should tell the user about how many steps to pull the rods for startup instead of
         * a 'long burst'. i have no idea how long a 'long burst' is." — scoped in the same
         * session to the burst MAGNITUDE only)*. A burst size is not the absolute bank position
         * #618 removed hours earlier: the step still steers on the count rate and the acceptance
         * is unchanged. The numbers are the replay's own `cmd.steps` — 94 / 63 / 31 / 14 / 9,
         * rounded — so they cannot drift from what the harness drives. */
        { text: 'Withdraw the control bank about 90 steps at MED. Stop, let the startup rate settle, then press Plot point.',
          why: 'The first two 1/M points always over-predict: early in the bank the rods are worth less per step, so the line they draw is shallow and crosses zero far past the real critical position. That is expected, not a mistake — you plot more points and the prediction walks in. Read the count rate, not the bank: while the reactor is subcritical the source range is the reactivity indication.',
          control: 'Control Bank', target: 'SOURCE RANGE settled above 700 counts per second (reads 7.0e2), point 2 — an over-estimate',
          note: 'Let the startup rate settle back toward zero before you plot. A point taken mid-rise reads low.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 94, speed: 'normal' }, hold: 150,
          accs: [{ p: 'sr_counts_cps', op: '>', v: 700, label: 'Counts settled above 700 cps' },
                 { cmd: 'plot_1m_point', label: 'Point plotted' }],
          hl: ['Withdraw', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Withdraw about 60 steps at MED. Settle, plot, then READ the predicted critical position on the 1/M panel. It reads high.',
          why: 'Each new point is taken closer to critical, where a step is worth more, so the fitted line steepens and the predicted crossing walks toward you. The panel prints its answer as "predicted criticality ≈ step N", with a marker on the plot — that number is what you are working toward. Still treat it as an over-estimate: never withdraw straight to it.',
          control: 'Control Bank', target: 'SOURCE RANGE above 1,400 counts per second (1.4e3), point 3',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 63, speed: 'normal' }, hold: 150,
          accs: [{ p: 'sr_counts_cps', op: '>', v: 1400, label: 'Counts settled above 1,400 cps' },
                 { cmd: 'plot_1m_point', label: 'Point plotted' }],
          hl: ['Withdraw', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Withdraw about 30 steps at MED. Settle, plot, read the prediction again — the fit now lands within a dozen steps.',
          why: 'You are on the steep part of the rod-worth curve now: each step buys more reactivity than the last. The 1/M fit is starting to be useful. Keep the bursts small so the startup rate can settle before you plot.',
          control: 'Control Bank', target: 'SOURCE RANGE above 3,000 counts per second (3.0e3), point 4',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 31, speed: 'normal' }, hold: 150,
          accs: [{ p: 'sr_counts_cps', op: '>', v: 3000, label: 'Counts settled above 3,000 cps' },
                 { cmd: 'plot_1m_point', label: 'Point plotted' }],
          hl: ['Withdraw', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Withdraw about 15 steps at MED. Settle, plot. Keep bursts small enough that the startup rate (SUR) stays under 1 DPM.',
          why: 'Startup rate is the speedometer for this approach. One decade per minute is a comfortable climb; above it you are outrunning the plot, and the temperature feedback has not started yet. Smaller bursts from here.',
          control: 'Control Bank', target: 'SOURCE RANGE above 7,000 counts per second (7.0e3), point 5, startup rate under 1 DPM',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 14, speed: 'normal' }, hold: 150,
          accs: [{ p: 'sr_counts_cps', op: '>', v: 7000, label: 'Counts settled above 7,000 cps' },
                 { cmd: 'plot_1m_point', label: 'Point plotted' }],
          hl: ['Withdraw', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Withdraw about 10 steps at MED — the last and smallest burst. Settle, plot. Point 6 is your working prediction.',
          why: 'The last plotted point, on purpose: the remaining distance is short enough that creeping on the startup rate beats trusting one more fitted number. Write down the position the panel predicts — the next step creeps up on it in single steps, and criticality arrives a little before it. Measured, true criticality is between 226 and 238 of 627.',
          control: 'Control Bank', target: 'SOURCE RANGE above 20,000 counts per second (2.0e4), point 6 — the working prediction',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 9, speed: 'normal' }, hold: 150,
          accs: [{ p: 'sr_counts_cps', op: '>', v: 20000, label: 'Counts settled above 20,000 cps' },
                 { cmd: 'plot_1m_point', label: 'Point plotted' }],
          hl: ['Withdraw', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        /* SPELL IT OUT *(OWNER, 2026-09-03, #619 item 21: "uses acronym (SUR) without spelling
         * it out, ie. STARTUP RATE (SUR)")*. The pool now expands it at its first appearance in
         * a visible line (the 7,000-count step) and says "startup rate" in full everywhere else;
         * `cautions` already carried the expansion but a caution is not where a player meets a
         * term for the first time. */
        { text: 'Withdraw at SLOW in single steps until the startup rate holds positive and the counts keep climbing with the rods stopped. That is criticality.',
          why: 'You cannot see the moment criticality happens; you can only see that it has. Stop the rods and watch: if the count rate keeps rising and the startup rate stays positive with nothing moving, the core is critical — and that declaration is made on the instruments, not on the bank position. One step in this band is worth 8.1 pcm, so no single step is dramatic but fifteen of them are; expect the startup rate to peak near 0.9 DPM.',
          control: 'Control Bank', target: 'critical: startup rate steady and positive with the rods stopped, at or under 1 DPM',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 15, speed: 'slow' }, hold: 400,
          acc: { p: 'power_pct', op: '>', v: 0.02 },
          hl: ['Withdraw', 'Rod Speed — Slow', 'Startup Rate', 'Source Range'] },
        { text: 'Withdraw two more steps at SLOW. Power climbs through the decades. Watch SUR and the intermediate range.',
          why: 'You are just critical. Two more steps put excess reactivity in so power actually climbs. Below the point of adding heat there is no temperature feedback to stop you, and the startup rate is the only speedometer. The source range hands off to the intermediate range on its own; you do not switch it.',
          control: 'Control Bank', target: 'power rising to the point of adding heat',
          wait_hint: 'The rise through the decades takes about 15 plant-minutes at this rate. Fast time is fine; watch the SUR.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 2, speed: 'slow' }, hold: 900,
          saw: { p: 'startup_rate_dpm', op: '>', v: 0 },
          acc: { p: 'power_pct', op: '>', v: 0.5 },
          hl: ['Withdraw', 'Startup Rate', 'Intermediate Range'] },
        obs('Confirm the source range de-energized itself as the intermediate range took over. No operator action on this plant.',
          { p: 'sr_energized', op: '<', v: 1 },
          null, ['Source Range', 'Intermediate Range'],
          'The source range detectors would saturate and wear out if they stayed on through power. At the P-6 permissive, where the intermediate range comes on scale at 5e-11 A, this plant secures the source range by itself. There is no operator lever: you are confirming it happened, not doing it.'),
        { text: 'Insert at MED in one drive and release as SUR crosses zero, about 14 steps. Power settles near 1 %.',
          why: 'Below the point of adding heat there is no temperature feedback to hold you anywhere: all the excess reactivity has to come back out or power keeps climbing under you. One drive, not taps. The plant runs while you tap.',
          control: 'Control Bank', target: 'power steady near 1 %, still Mode 2, Startup',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: -14, speed: 'normal' }, hold: 240,
          acc: { p: 'power_pct', op: '<', v: 5 },
          hl: ['Insert', 'Startup Rate', 'Intermediate Range'] },
        { text: 'Withdraw at SLOW until power crosses 5 % into Mode 1, At Power, about 13 steps. Power settles in the high single digits.',
          why: 'Mode 1 begins at 5 % power. Crossing it on purpose, with a slow pull you chose, is the difference between a controlled entry and an ascent that walked you there. The turbine is still off line; the next step puts it on the grid so the reactor has somewhere to send the heat.',
          control: 'Control Bank', target: 'near 8 % power, Mode 1, At Power',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 13, speed: 'slow' }, hold: 400,
          acc: { p: 'power_pct', op: '>', v: 5 },
          hl: ['Withdraw', 'Startup Rate', 'Intermediate Range'] },
        { text: 'Press LATCH on the TURBINE-GENERATOR card, then set the load target to 10 MWe.',
          why: 'There is no one-button "connect grid" on this plant. Reconnection is the real sequence: protection reset if a trip stands, turbine latched, load dialled. The generator picks up the load and the reactor follows it up to about 10 %. The reactor following the turbine is the plant\'s central coupling, and this is the first time you feel it.',
          control: 'Turbine Load', target: 'generator carrying 10 MWe',
          cmd: { action: 'set_load_target', mwe: 10 }, hold: 240,
          accs: [{ cmd: 'latch_turbine', label: 'Turbine latched' },
                 { p: 'mwe_output', op: '>', v: 8, label: 'Generator above 8 MWe' }],
          hl: ['Turbine Load', 'Main Breaker'] },
        { text: 'Above P-10 (8 % power), press IR HIGH FLUX on TRIP BLOCKS. This blocks the 25 % intermediate range trip.',
          why: 'P-10 is the at-power permissive, 8 % of rated on this plant. The startup net has two rungs taken in order — the intermediate range (IR) trip at 25 %, then the power range (PR) low setting at 35 % — and below P-10 the plant will not let you block either. This button also clears the 20 % rod stop that is about to freeze your withdrawal, and below P-10 the request auto-revokes, so a shutdown re-arms the whole net on its own.',
          control: 'Trip Blocks', target: 'intermediate range trip blocked, 20 % rod stop clear',
          cmd: { action: 'set_trip_block', trip_id: 'ir_high', blocked: true }, hold: 10,
          hl: ['Trip Blocks'] },
        { text: 'On TRIP BLOCKS, press PR HIGH (LOW SETPT) to block the 35 % power range low setting.',
          why: 'The 35 % setting is the backstop behind the rung you just blocked: miss it and the ascension trips at 35 % instead of 25 %. Above P-10 the power range 118 % trip takes over the job of catching a runaway. Two separate presses, deliberately: they are two separate operator actions on a real board, and blocking one must never quietly disarm the other.',
          control: 'Trip Blocks', target: '35 % low-flux setting blocked',
          cmd: { action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: true }, hold: 10,
          hl: ['Trip Blocks'] },
        obs('Confirm Mode 1, At Power: critical, generator on line, power near 10 %. Continue with the power ascension checklist.',
          { p: 'plant_mode', op: '~', v: 1, tol: 0.1 },
          null, ['Tavg', 'Turbine Load', 'SG Level'],
          'The reactor is critical, the generator is carrying load, and both startup-net blocks are standing. The next checklist is the climb to full power: rods lead, turbine follows.'),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor critical in Mode 1, At Power, generator carrying 10 MWe, both startup-net blocks standing (IR HIGH FLUX and PR HIGH (LOW SETPT)). Ready for the power ascension.',
    },
    {
      id: 'pwr_raise_power', category: 'power', manual_ref: 'PWR-N07', next: 'pwr_lower_power',
      title: 'Mode 1, At Power — power ascension to 100 %',
      purpose: 'Take the plant from low power to full power in legs. Rods lead, turbine follows: withdraw the bank, raise the load target to match, then trim Tavg onto its program. Runnable.',
      from: 'low_power',
      prereq: ['Reactor critical and stable at power, above the P-10 permissive (8 % power).', 'Turbine on line.', 'Both startup-net blocks standing: IR HIGH FLUX and PR HIGH (LOW SETPT), the startup checklist\'s last two acts.'],
      precond: [
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor critical and at power, clear of the P-10 permissive (8 %)' },
        { p: 'mwe_output', op: '>', v: 5, text: 'Turbine on line, carrying load' },
      ],
      cautions: [
        'Rods lead going up. Load raised first drags Tavg below program and, without the blocks, runs into the 20 % intermediate range rod stop and the 25 % trip behind it.',
        'The power range high-flux rod stop stands above 103 %, with the 118 % trip behind it. Overshoot is real on this plant: 100 MWe of load lands power near 101 %.',
        'Xenon builds for hours after each leg. Boron is the hours-scale trim; rods are the minutes-scale one.',
      ],
      steps: [
        obs('Confirm the at-power lineup: critical, generator loaded, SG FEED in AUTO, both startup-net blocks standing.',
          { p: 'mwe_output', op: '>', v: 5 },
          null, ['Turbine Load', 'SG Feed AUTO', 'Trip Blocks'],
          'This is the plant the startup hands you: critical, on the grid, feed holding level. The two trip blocks (IR HIGH FLUX and PR HIGH (LOW SETPT)) must still be standing. Without them the climb trips at 25 %, then 35 %.',
          { p: 'power_pct', op: '>', v: 40 }),
        { text: 'Set the BORON card to 660 ppm with the controller ON. The dilution runs under the whole ascension.',
          why: 'Every percent of power costs reactivity: the fuel heats and the moderator thins. Rods could pay for all of it, but they would end deep in the core distorting the power shape, so real plants dilute boron for the bulk and keep the bank in its manoeuvring band. The make-up panel dilutes at about 3 ppm/min; rods stay your minutes-scale trim. The equilibrium full-power boron, near 626 ppm, arrives later as xenon builds in.',
          control: 'Boron control', target: 'dilution running toward 660 ppm',
          wait_hint: 'The dilution runs a few plant-minutes at a time between legs. Start it now and let it work.',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 660 }, hold: 30,
          hl: ['Boron', 'Boron control'] },
        /* DRAW A SAMPLE *(OWNER, 2026-09-03, #619 item 27: "The boron sampling is boring and
         * never addressed. im wondering if it would be best to just have a live indication
         * inplace of the sampling.")*.
         *
         * NOT REPLACED WITH A LIVE METER, and the source is the reason rather than the standing
         * ruling. Ginna UFSAR §7.7 (ML20339A027): "There is no provision for a direct continuous
         * visual display of primary coolant boron concentration." The board teaches exactly that
         * already, and the 2026-07-23 ruling that removed the analyzer stands.
         *
         * What was actually wrong is the second half of his sentence — "never addressed". No
         * checklist in the pool has ever drawn a sample, so the control sat on the board with
         * nothing pointing at it and the lab turnaround happened to nobody. Giving it a job is
         * the fix; the sampling was not the problem, the silence about it was.
         *
         * PLACED HERE so the ~30 plant-minute turnaround runs UNDER the climb rather than
         * stopping it, and graded on the operator ACTION (a cmd-kind entry) rather than on the
         * posted number: the result arrives when the lab is ready, not when the step wants it. */
        { text: 'Draw a boron sample: press SAMPLE on the BORON card. The lab posts the number in about 30 plant-minutes.',
          why: 'There is no live boron meter in this control room — a real one has none either. The number on the BORON card is the target you asked for; the SAMPLE is how you find out what is actually in the loop. Draw it now and the result lands while you are climbing, in time to check the dilution went where you sent it.',
          control: 'Boron control', target: 'sample drawn, result pending',
          accs: [{ cmd: 'take_boron_sample', label: 'Boron sample drawn' }],
          hl: ['Boron control'] },
        /* "TRIM TAVG TO PROGRAM" IS JARGON *(OWNER, 2026-09-03, #619 item 26: "what does 'then
         * trim Tavg to program'. most people will not know what this means… It could say to look
         * at the vital gauge and move rods to move it in the green or something")*. The
         * instruction is now stated as the gauge and the direction, once, on the first trim leg;
         * the later legs then say "trim" against a term the player has met. The Tavg tile's
         * normal band already FOLLOWS the program (`trefProgram`, pwr_board_wiring.js:1965), so
         * "back inside the band" and "on program" are the same act — which is what makes the
         * plain-language version honest rather than a simplification. */
        { text: 'Withdraw 30 steps at MED, then set the load target to 30 MWe. Trim rods until the Tavg tile sits back inside its normal band.',
          why: '"On program" means the Tavg tile is inside its normal band — and that band is not fixed: it tracks the temperature the plant should hold at the power you are making, from 546.8 °F (286 °C) at no load to 577.7 °F (303.2 °C) at 100 %. Which way to trim: if Tavg reads below the band, withdraw a few more steps; if above, insert. You lead with rods going up so the program is approached from above rather than dragged from below.',
          control: 'Control Bank', target: '30 MWe, Tavg tile inside its normal band',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 30, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 30 }, label: 'Load target set to 30 MWe' },
                 { p: 'mwe_output', op: '>', v: 28, label: 'Generator at 30 MWe' },
                 { p: 'power_pct', op: '>', v: 28, label: 'Reactor following, near 30 %' }],
          hl: ['Withdraw', 'Turbine Load', 'Tavg'] },
        { text: 'Withdraw 32 steps, set the load target to 50 MWe, then trim rods until Tavg is back in its band.',
          why: 'Same discipline as the 30 MWe leg: rods first so Tavg is approached from above, then the load target, then a trim. Halfway up, xenon is starting to build. Boron is the long-term answer; rods are still the minutes-scale one.',
          control: 'Control Bank', target: '50 MWe, Tavg tile inside its normal band',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 32, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 50 }, label: 'Load target set to 50 MWe' },
                 { p: 'mwe_output', op: '>', v: 48, label: 'Generator at 50 MWe' },
                 { p: 'power_pct', op: '>', v: 47, label: 'Reactor following, near 50 %' }],
          hl: ['Withdraw', 'Turbine Load', 'Tavg'] },
        { text: 'Withdraw 35 steps, set the load target to 75 MWe, then trim rods until Tavg is back in its band.',
          why: 'Three-quarter power. The band has climbed with the load, toward 577.7 °F (303.2 °C) at 100 %. If Tavg reads below it, you led with load instead of rods: pull more steps before you add more megawatts.',
          control: 'Control Bank', target: '75 MWe, Tavg tile inside its normal band',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 35, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 75 }, label: 'Load target set to 75 MWe' },
                 { p: 'mwe_output', op: '>', v: 72, label: 'Generator at 75 MWe' },
                 { p: 'power_pct', op: '>', v: 70, label: 'Reactor following, near 75 %' }],
          hl: ['Withdraw', 'Turbine Load', 'Tavg'] },
        { text: 'Withdraw 18 steps, load target 90 MWe, then trim. Smaller pulls from here: the 103 % rod stop is close.',
          why: 'The power range high-flux rod stop sits above 103 %, with the 118 % trip behind it. Overshoot is real on this plant: 100 MWe of load lands power near 101 %. Smaller pulls from here so you do not walk into the stop.',
          control: 'Control Bank', target: '90 MWe, Tavg on program',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 18, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 90 }, label: 'Load target set to 90 MWe' },
                 { p: 'mwe_output', op: '>', v: 86, label: 'Generator at 90 MWe' }],
          hl: ['Withdraw', 'Turbine Load', 'Tavg'] },
        { text: 'Withdraw 9 steps, load target 100 MWe, then trim Tavg onto 577.7 °F (303.2 °C). Power settles near 101 %.',
          why: 'Full power is a landing, not a lunge. A small pull, then the last 10 MWe of load, then trim Tavg onto its program point. The bank ends part-way out in its manoeuvring band, because boron carried the bulk of the reactivity the climb cost.',
          control: 'Control Bank', target: '100 MWe, Tavg 577.7 °F (303.2 °C)',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 9, speed: 'normal' }, hold: 900,
          accs: [{ cmd: { action: 'set_load_target', mwe: 100 }, label: 'Load target set to 100 MWe' },
                 { p: 'mwe_output', op: '>', v: 97, label: 'Generator at 100 MWe' },
                 { p: 'tavg_c', op: '~', v: 303.2, tol: 8, label: 'Tavg near the full-power program point (rod trims land it)' },
                 /* THE ROD CHECK THIS LEG NEVER HAD. Every "Withdraw N steps" line above was a
                  * no-op for as long as the leg started from `50_percent`, which boots the bank
                  * on its top stop — and no acceptance read the bank, so the replay certified an
                  * ascension whose rods could not move. Asserted as a FLOOR, not a band: the end
                  * position is a function of xenon (351 of 627 at the 18.6 % this leg reaches),
                  * and pinning the arrival value would re-break the moment that moves. What must
                  * never be true again is that the bank sat where it started.
                  *
                  * A BAND, and the upper half is the one that bites. `> 300` alone does NOT
                  * catch the defect this exists for: the old leg ended at 627, which passes it.
                  * `< 600` is the assertion that the bank is not pinned on its top stop —
                  * verified by injection, not by reading: with `from: '50_percent'` restored
                  * this check goes RED at 627 while every other check in the leg stays green. */
                 { p: 'control_bank_steps', op: '>', v: 300, label: 'Control bank withdrawn well past its starting 227' },
                 { p: 'control_bank_steps', op: '<', v: 600, label: 'Control bank not pinned on its top stop' }],
          hl: ['Withdraw', 'Turbine Load', 'Tavg'] },
        obs('Confirm full power: reactor near 100 %, 100 MWe, Tavg on program, bank part-way out.',
          { p: 'power_pct', op: '>', v: 96 },
          null, ['Tavg', 'Turbine Load', 'SG Level'],
          'Near 100 % and 100 MWe with Tavg on the 577.7 °F (303.2 °C) program point. You are NOT yet at the Hot Full Power preset: that plant has equilibrium xenon, 626 ppm of boron and the bank near the top. You have almost no xenon, more boron and the bank part-way out. The next step is how you get from here to there.'),
        /* STEP TWO OF THE BORON PROGRAM *(OWNER RULING, 2026-09-04: selected "A two-step boron
         * program that follows xenon")*, and the measurement that makes it the right shape:
         *
         *   end of this leg   xenon  18.6 %   boron 660 ppm   bank 351/627   Tavg 302.6 °C
         *   the design point  xenon 100 %     boron 626 ppm   bank 627/627   Tavg 304.5 °C
         *
         * The bank walks OUT as xenon builds and boron comes down — which is the prototypical
         * shape, Ginna TS Bases and NUREG-1431 STS Bases both: "The control banks must be
         * maintained above designed insertion limits and are typically near the fully withdrawn
         * position during normal full power operations." Near-fully-withdrawn is the EQUILIBRIUM
         * state, not the state you arrive in.
         *
         * NO `cmd`, deliberately: dialling 626 ppm the moment the climb ends would dilute into a
         * core with no xenon in it and take Tavg straight past its program (measured: 318.8 °C,
         * 15.6 °C high). The trim is the player's to make as xenon comes in. Completes on the
         * observation dwell. */
        obs('Xenon is building. Trim boron DOWN toward 626 ppm over the next hours to walk the bank out.',
          null,
          'ROD LIMIT LO-LO is lit and that is expected here: with no xenon yet the bank sits below its insertion limit. It walks out as xenon builds and you dilute.',
          ['Boron control', 'Control Bank', 'Tavg'],
          'Xenon is a neutron poison that builds after power comes up and settles over about two days. Measured on this plant it is worth 250 ppm, which is why full power wants 876 ppm with the bank fully out at zero xenon and 626 ppm at equilibrium. Dilute as it builds: the bank walks out and Tavg stays on program.'),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Full power on program with almost no xenon: 660 ppm and the bank part-way out. Xenon then builds over the next hours and boron trims down toward 626 ppm, walking the bank out to the Hot Full Power design point. The round trip back down starts with the load rampdown checklist.',
    },
    {
      id: 'pwr_lower_power', category: 'power', manual_ref: 'PWR-N08', next: 'pwr_shutdown',
      title: 'Mode 1, At Power — load rampdown to ~15 %',
      purpose: 'Bring the plant down from full power to low power in legs. Turbine leads down, rods trim: lower the load target, let the reactor follow, then insert rods so Tavg does not ride above its program. Runnable.',
      from: 'hot_full_power',
      prereq: ['Reactor at power, turbine on line.'],
      precond: [
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor critical and at power' },
        { p: 'mwe_output', op: '>', v: 5, text: 'Turbine on line, carrying load' },
      ],
      cautions: [
        'Turbine leads going down. Load dropped first leaves the reactor hot: Tavg rides above program until rods bring it back. Insertion is never blocked.',
        'Steam generator level moves the wrong way first on every load drop (shrink and swell). SG FEED in AUTO holds the band.',
      ],
      steps: [
        { text: 'Set the BORON card to 719 ppm, the no-load concentration, with the controller ON. Boration runs under the legs.',
          why: 'Coming down is the ascension in reverse. Every percent shed hands reactivity back (the fuel cools, the moderator thickens), and it has to go somewhere. Boration carries the bulk out; without it the reactor hangs high above the falling load and the steam dump quietly carries the difference. Rods are the minutes-scale trim on top.',
          control: 'Boron control', target: 'boration running toward 719 ppm',
          wait_hint: 'The boration runs about half a plant-hour. Start it first and take the legs while it works.',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 719 }, hold: 30,
          hl: ['Boron', 'Boron control'] },
        { text: 'Set the load target to 75 MWe, let power follow down, then insert rods until Tavg returns to program.',
          why: 'The reactor follows the turbine: less steam drawn means the core\'s heat has nowhere to go, Tavg rises, and moderator feedback walks power down after it. But the equilibrium sits hot until rods take the excess reactivity out; measured, about 40 steps over this leg. The program is the same line you climbed on the way up.',
          control: 'Turbine Load', target: '75 MWe, Tavg trimmed to program',
          cmd: { action: 'set_load_target', mwe: 75 }, hold: 900,
          accs: [{ p: 'power_pct', op: '<', v: 90, label: 'Reactor following down' },
                 { p: 'tavg_c', op: '<', v: 305, label: 'Tavg trimmed back toward program' }],
          hl: ['Turbine Load', 'Insert', 'Tavg'] },
        { text: 'Set the load target to 50 MWe, let power follow, then insert about 20 steps to trim Tavg.',
          why: 'Same reverse discipline: turbine first, then insert rods so Tavg does not sit hot above program. Shrink and swell dips indicated SG level the wrong way first. Do not chase it; SG FEED in AUTO holds the band.',
          control: 'Turbine Load', target: '50 MWe, Tavg on program',
          cmd: { action: 'set_load_target', mwe: 50 }, hold: 720,
          accs: [{ p: 'power_pct', op: '<', v: 70, label: 'Reactor following through 70 %' }],
          hl: ['Turbine Load', 'Insert', 'Tavg'] },
        { text: 'Set the load target to 30 MWe, let power follow, then insert about 10 steps to trim Tavg.',
          why: 'Low-power legs need smaller rod bites. The program is walking back toward 546.8 °F (286 °C). Keep Tavg from riding high: a hot plant at low load dumps the difference to the condenser.',
          control: 'Turbine Load', target: '30 MWe, Tavg on program',
          cmd: { action: 'set_load_target', mwe: 30 }, hold: 600,
          accs: [{ p: 'power_pct', op: '<', v: 45, label: 'Reactor following through 45 %' }],
          hl: ['Turbine Load', 'Insert', 'Tavg'] },
        { text: 'Set the load target to 15 MWe, let power follow, then insert about 6 steps. This is the shutdown handoff.',
          why: 'Scramming from full power slams the primary thermally. About 15 % is low enough that the trip is gentle and high enough that the steam generator still has steam to dump. The shutdown checklist takes the generator off and drops the rods from here.',
          control: 'Turbine Load', target: '15 MWe, power near 15 %',
          cmd: { action: 'set_load_target', mwe: 15 }, hold: 900,
          accs: [{ p: 'power_pct', op: '<', v: 30, label: 'Reactor below 30 % and falling as the boration finishes (rod trims take it to about 15 %)' }],
          hl: ['Turbine Load', 'Insert', 'Tavg'] },
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Plant stable near 15 % and 15 MWe, Tavg on program. The shutdown checklist takes it to Mode 3.',
    },
    {
      id: 'pwr_shutdown', category: 'shutdown', manual_ref: 'PWR-N14', next: 'pwr_cooldown',
      title: 'Mode 1, At Power → Mode 3, Hot Standby — normal shutdown',
      purpose: 'Shut the reactor down from low power: unload the generator, trip the reactor, confirm decay heat is going to the steam dump. Measured from 15 %: power collapses to the source range in seconds, and about 2 % decay heat settles out on the dumps. Runnable.',
      from: 'hot_full_power',
      prereq: ['Reactor at power.'],
      precond: [
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor at power: there is something to shut down' },
      ],
      cautions: ['Decay heat persists after shutdown and falls off over hours. The steam dump at the no-load anchor is the heat sink until the cooldown begins.'],
      steps: [
        { text: 'Set the load target to 0 MWe. The generator unloads and the reactor follows down.',
          why: 'Taking the turbine off load first means the trip happens with no megawatts on the machine. The reactor follows the falling steam demand down; you are not scramming a loaded generator.',
          control: 'Turbine Load', target: '0 MWe',
          cmd: { action: 'set_load_target', mwe: 0 }, hold: 120,
          acc: { p: 'mwe_output', op: '<', v: 5 },
          hl: ['Turbine Load'] },
        { text: 'Press SCRAM. Both banks drop and power collapses into the source range.',
          why: 'A planned trip from low power. Both banks fall, control and shutdown, and fission stops in seconds. Decay heat does not: it is still a few percent of rated, and it has to go somewhere. That is the next step\'s job.',
          control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 60,
          acc: { p: 'power_pct', op: '<', v: 5 },
          hl: ['SCRAM'] },
        obs('Confirm fission has stopped and decay heat remains, near 1.9 %, on the steam dump. This is Mode 3.',
          { p: 'decay_heat_pct', op: '>', v: 1 },
          null, ['Steam Dump', 'Tavg'],
          'Fission is gone; decay heat is not. The steam dump at the 1020 psi (7.03 MPa) no-load anchor is the heat sink until the cooldown checklist takes over. Tavg sits near 546.8 °F (286 °C), subcritical, pressurized: Hot Standby.'),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor shut down at Mode 3, Hot Standby; decay heat on the dumps. The cooldown checklist takes the plant to Mode 5.',
    },
    {
      id: 'pwr_cooldown', category: 'shutdown', manual_ref: 'PWR-N15', stack_only: true,
      title: 'Mode 3, Hot Standby → Mode 5, Cold Shutdown — controlled cooldown',
      purpose: 'Take a hot, subcritical plant to Mode 5, Cold Shutdown. Borate for cold shutdown margin, block the protection that would trip on the way down, walk the secondary down the saturation curve, depressurize on spray from the 1700 psig dial floor, isolate the accumulators inside their window, align residual heat removal (RHR) and secure the pumps so RHR carries the plant cold. Measured on this plant: Mode 3 to Mode 5 in about 6.7 plant-hours, subcooling never below 75 °F (41.7 °C). Runnable.',
      from: 'hot_zero_power',
      prereq: [
        'Plant at Mode 3, Hot Standby: 546.8 °F (286 °C), normal operating pressure, subcritical with the control bank in.',
        'Reactor coolant pumps (RCP) running; steam generator (SG) level on the three-element controller (SG FEED in AUTO).',
        'Condenser available: the steam dump is the heat sink until RHR takes over.',
      ],
      precond: [
        { p: 'tavg_c', op: '~', v: 286, tol: 8, text: 'Hot Standby at the no-load temperature, near 546.8 °F (286 °C)' },
        { p: 'power_pct', op: '<', v: 1, text: 'Reactor shut down: this is a cooldown, not a power manoeuvre' },
      ],
      cautions: [
        'Cold water moderates better: the margin you have hot is not the margin you have cold. Boration comes before any cooling.',
        'Cooldown rate limit: 100 °F/hr (55.6 °C/hr). Measured on this plant, the dump-setpoint walk runs near 60 °F/hr (33.3 °C/hr) and the RHR leg near 92 °F/hr (51.1 °C/hr).',
        'The accumulator window on the way down runs from 1615 psi (11.136 MPa), where the valve regains power, to 665 psi (4.585 MPa), where the nitrogen would push the tanks into the plant.',
        'Below the 1700 psig dial floor the heaters cannot follow pressure down. Spray with the heaters off is the depressurization tool, and subcooling margin is what it spends.',
      ],
      auto_channels: ['boron_conc'],
      steps: [
        { text: 'Borate first: BORON card to 920 ppm, controller ON. Nothing cools until this is running.',
          why: 'At 546.8 °F (286 °C) the plant is comfortably subcritical on about 719 ppm, but cold water moderates better, and the same core at 122 °F (50 °C) needs about 920 ppm for the same margin. 920 ppm is the concentration this plant\'s own Mode 5 lineup carries. Borating first means the margin arrives before the cold does. The batch dose runs about 3 ppm/min, so this is the hour the secondary walk (the next steps) rides on.',
          control: 'Boron control', target: '920 ppm',
          wait_hint: 'The boration takes about 60 plant-minutes. Start it and continue; the cooldown legs run while it doses.',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 920 }, hold: 3900,
          acc: { p: 'boron_ppm', op: '>', v: 880 },
          hl: ['Boron', 'Boron control'] },
        { text: 'Lower the pressurizer pressure setpoint (Pressure SP) to 1900 psi (13.1 MPa), under P-11, to unlock the protection blocks.',
          why: 'The low-pressure reactor trip and the safety injection (SI) actuation can only be blocked below the P-11 permissive, 1972 psi (13.6 MPa). So the setpoint has to come under it first. This is not the depressurization; it is unlocking the next step.',
          control: 'Pressure SP', target: '1900 psi (13.1 MPa)',
          cmd: { action: 'set_pressure_setpoint', mpa: 13.1 }, hold: 1500,
          ramp: [{ action: 'set_pressure_setpoint', arg: 'mpa', points: [15.41, 13.1] }],
          acc: { p: 'pressure_mpa', op: '<', v: 13.6 },
          hl: ['Pressure SP', 'Primary Pressure'] },
        { text: 'On TRIP BLOCKS press PZR PRESS LO-LO and SI REACTOR TRIP. Then press STOP on the ECCS card.',
          why: '"Block SI" is why the setpoint came down first: both blocks need the P-11 permissive. The cooldown walks the primary through pressures that read, to an armed protection system, exactly like a loss-of-coolant accident — leave them armed and the first cooling leg trips the plant and starts a cold injection you did not ask for. STOP on the emergency core cooling (ECCS) card takes the high-pressure injection pump out of standby as well.',
          control: 'Trip Blocks', target: 'PZR PRESS LO-LO and SI REACTOR TRIP blocked; injection stopped',
          cmd: { action: 'set_trip_block', trip_id: 'lo_press', blocked: true }, hold: 30,
          accs: [{ cmd: { action: 'set_trip_block', trip_id: 'lo_press', blocked: true }, label: 'Low-pressure trip blocked' },
                 { cmd: { action: 'set_trip_block', trip_id: 'si_trip', blocked: true }, label: 'SI actuation blocked' }],
          hl: ['Trip Blocks'] },
        { text: 'Walk the DUMP SETPOINT down in steps: 1020, 640, 400, 240, 120 psi over about two and a half plant-hours.',
          why: 'The secondary rides its saturation curve down and pulls the primary with it through the steam generator, and it cannot pull the primary below its own saturation temperature. That is why the walk continues all the way to 120 psi (0.83 MPa), saturation near 341 °F (171.7 °C) — low enough for the primary to reach the RHR entry band. The walk rate IS the cooldown rate: measured, this leg runs near 60 °F/hr (33.3 °C/hr), inside the 100 °F/hr (55.6 °C/hr) limit.',
          control: 'Dump SP', target: 'Tavg 341.6 °F (172 °C), Mode 4',
          wait_hint: true,
          cmd: { action: 'set_steam_dump_setpoint', mpa: 0.83 }, hold: 9600,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [7.03, 4.42, 2.76, 1.66, 0.83] }],
          saw: { p: 'tavg_c', op: '<', v: 250 },
          acc: { p: 'tavg_c', op: '<', v: 175 },
          hl: ['Dump SP', 'Steam Dump', 'Tavg'] },
        { text: 'Lower the Pressure SP to its 1700 psig floor. The dial goes no lower; pressure control now changes hands.',
          why: 'The setpoint span is the at-power pressure-control dial, sourced at 1700 to 2500 psig. A real cooldown leaves that dial\'s world exactly here: below it the heaters have nothing to hold, and the operator depressurizes by hand.',
          control: 'Pressure SP', target: '1716 psi (11.83 MPa), the floor',
          cmd: { action: 'set_pressure_setpoint', mpa: 11.83 }, hold: 1500,
          ramp: [{ action: 'set_pressure_setpoint', arg: 'mpa', points: [13.1, 11.83] }],
          acc: { p: 'pressure_mpa', op: '<', v: 12.2 },
          hl: ['Pressure SP', 'Primary Pressure'] },
        { text: 'Press OFF on the HEATER card, then set SPRAY to MANUAL at 100 %. Watch the subcooling margin.',
          why: 'With the pumps still running, the normal spray condenses pressurizer steam using recirculated loop water: no net mass is added, so level holds while pressure walks down. The heaters go off first, or they fight the spray with the whole ladder. Measured, 1700 to 400 psi in about ten plant-minutes with subcooling never under 100 °F (55.6 °C); the accumulators come next, as pressure passes 1500 psi (10.34 MPa).',
          control: 'Pressurizer Spray (PZR)', target: 'pressure falling, subcooling positive',
          cmd: { action: 'set_spray', open: true }, hold: 120,
          accs: [{ cmd: { action: 'set_heater', mode: 'manual', pct: 0 }, label: 'Heaters OFF' },
                 { p: 'pressure_mpa', op: '<', v: 10.4, label: 'Pressure below 1500 psi and falling' }],
          hl: ['Pressurizer Spray (PZR)', 'Pressurizer Heaters (PZR)', 'Primary Pressure'] },
        { text: 'Close the Accumulator valve now, inside the band. Below 665 psi the nitrogen pushes the tanks into the plant.',
          why: 'The same window you opened on the way up, in reverse. Above 1600 psig the valve has no power (an administrative lock). Below the 665 psi (4.585 MPa) cover gas the nitrogen would push the tanks into the primary. Isolate in between, and keep the inventory: you will want them full for the next heatup.',
          control: 'Accumulator valve', target: 'valve shut between 1615 psi (11.136 MPa) and 665 psi (4.585 MPa), 100 % inventory kept',
          cmd: { action: 'close_accumulator_valve' }, hold: 30,
          acc: { p: 'accumulator_valve_open', op: '<', v: 0.5 },
          hl: ['Accumulator valve'] },
        { text: 'Let pressure fall through 425 psig with the spray still on. Measured: 1500 to 400 psi in about eight plant-minutes.',
          why: 'RHR suction will not open above 425 psig; that interlock is sourced (WTSM 5.1). Leave the spray on while you wait: shutting it now lets pressure bounce back over the permissive. Subcooling is what you are guarding, and it stays well above 100 °F (55.6 °C) on this spray.',
          control: '(observe)', target: 'pressure under 425 psig, spray still on',
          hold: 540,
          acc: { p: 'pressure_mpa', op: '<', v: 2.85 },
          hl: ['Primary Pressure', 'Pressurizer Spray (PZR)'] },
        { text: 'Press ALIGN on the RHR card while the spray still holds pressure low, then set HX FLOW to 7 %.',
          why: 'ORDER MATTERS HERE, and getting it wrong costs you the align. The suction valve interlock refuses to open above 425 psig (sourced, WTSM 5.1), and if you shut the spray first, pressure bounces back over that number before you get there. That is why the spray stays on until this step is done, and why this step comes before securing it. HX FLOW is the RHR heat exchanger\'s share of the flow; 7 % is a gentle start.',
          control: 'Residual Heat Removal (RHR)', target: 'RHR aligned, HX FLOW 7 %',
          cmd: { action: 'set_rhr', active: true }, hold: 60,
          acc: { p: 'rhr_valve_open', op: '>', v: 0 },
          hl: ['Residual Heat Removal (RHR)', 'Primary Pressure'] },
        { text: 'Press OFF on the RCP card, then set SPRAY to OFF. RHR circulates the plant from here.',
          why: 'RHR is aligned and circulating. The reactor coolant pumps are now waste heat, and the spray has no driving head without them. Stop the pumps first, then shut the spray: the order the heatup ran, in reverse. With the pumps stopped the steam generator decouples from the primary.',
          control: 'RCP Run/Stop', target: 'pumps stopped, spray shut',
          cmd: { action: 'set_rcp', running: false }, hold: 60,
          accs: [{ p: 'pump_flow_pct', op: '<', v: 50, label: 'Pumps coasting down' },
                 { cmd: { action: 'set_spray', open: false }, label: 'Spray shut' }],
          hl: ['RCP Run/Stop', 'Reactor Coolant Pumps (RCP)', 'Pressurizer Spray (PZR)'] },
        { text: 'Raise HX FLOW from 7 % to 25 % and ride cold to 199.4 °F (93 °C), Mode 5.',
          why: 'The heat exchanger share is the cooldown rate from here. 25 % makes Mode 5 in about two plant-hours without crowding the 100 °F/hr (55.6 °C/hr) limit; measured, this leg runs near 92 °F/hr (51.1 °C/hr). Watch Tavg and its rate, and lower HX FLOW if the rate runs away.',
          control: 'Residual Heat Removal (RHR)', target: 'Tavg below 199.4 °F (93 °C), Mode 5',
          wait_hint: true,
          cmd: { action: 'set_rhr_hx', pct: 25 }, hold: 9000,
          ramp: [{ action: 'set_rhr_hx', arg: 'pct', points: [7, 16, 25] }],
          acc: { p: 'tavg_c', op: '<', v: 93 },
          hl: ['Residual Heat Removal (RHR)', 'Tavg'] },
        obs('Confirm Mode 5: coolant below 199.4 °F (93 °C), pressure 250 to 550 psi, RHR carrying heat, pumps off.',
          { p: 'plant_mode', op: '~', v: 5, tol: 0.1 }, null, ['Tavg', 'Primary Pressure'],
          'This is the cold-shutdown picture: coolant below 199.4 °F (93 °C), a small steam bubble still in the pressurizer, pumps off, RHR carrying the heat. It is the same state the Cold Shutdown preset loads, and the heatup checklist takes it back up.'),
        obs('Confirm the accumulators are full and isolated. They stay that way until the next heatup re-arms them.',
          { p: 'accumulator_volume_pct', op: '>', v: 99 }, null, ['Accumulator valve'],
          'You isolated them on the way down so they would not discharge into a depressurized plant. They must still be full: the next heatup re-opens them inside its window, 665 psi (4.585 MPa) to 1615 psi (11.136 MPa), and empty tanks then are a missed safety function.'),
        obs('Confirm RHR is the heat sink and its suction valve is open. The round trip is complete.',
          { p: 'rhr_valve_open', op: '>', v: 0 }, null, ['Residual Heat Removal (RHR)'],
          'Residual heat removal is the only heat sink left. The suction valve open is the lineup; if it shut, decay heat would have nowhere to go. The heatup checklist is the way back.'),
      ],
      guard: {
        never_melted: true,
        never: [
          { p: 'reactivity_pcm', op: '>', v: 0 },
          { p: 'subcooling_c', op: '<', v: 5 },
          { p: 'accumulator_volume_pct', op: '<', v: 99 },
          /* -600, not the retired pool's -150: securing the RCPs at the RHR handoff puts a
           * MEASURED -535 degC/hr transient on the Tavg indication (loop redistribution as
           * forced flow dies — the procedure's own act, ~1 min, while the leg AVERAGE runs
           * -51 degC/hr). The guard still catches the shock-cool class (a slammed-open HX
           * measured in the -800s on the retired plant). */
          { p: 'tavg_rate_c_per_hr', op: '<', v: -600 },
        ],
      },
      outcome: 'Mode 5, Cold Shutdown, reached on integrated physics: coolant below 199.4 °F (93 °C), RHR carrying the plant, reactor coolant pumps secured, accumulators full and isolated, boron at the cold-shutdown concentration. This is the state the Cold Shutdown initial condition loads. The heatup checklist takes it back up: the round trip is yours.',
    },
  ];

  // ---- RBMK (validated on BOTH versions) ----------------------------------
  var RBMK = [
    {
      id: 'rbmk_startup', category: 'startup',
      title: 'Reactor startup — approach to criticality',
      purpose: 'Bring the RBMK up from Hot Standby (subcritical) by withdrawing rods slowly — carefully, because at low power the reactor is touchy and the Operating Reactivity Margin (ORM) must stay healthy.',
      from: 'hot_startup',
      prereq: ['Hot Standby: subcritical, channel flow established.', 'ORM well above the minimum.'],
      cautions: ['Go carefully — the RBMK can accelerate on you at low power (positive void feedback).', 'Keep the Startup Rate (SUR) low and the ORM above the minimum (15 pre-1986 / 43 post-1986) throughout.'],
      steps: [
        obs('Confirm Hot Standby: reactivity below zero, channel flow up, ORM healthy.', { p: 'reactivity_pcm', op: '<', v: 0 }),
        { text: 'Primary view: hold Control Bank → Withdraw in bursts toward criticality (Rod Speed Norm to get moving, Slow near the crossing); watch the Startup Rate (SUR) and the Operating Reactivity Margin (ORM).',
          control: 'Control Bank', target: 'SUR low, ORM above minimum',
          note: 'Norm speed until the SUR stirs, then Slow — creeping the whole way multiplies the climb time several-fold.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 30, speed: 'slow' }, hold: 340,
          saw: { p: 'startup_rate_dpm', op: '>', v: 0 }, acc: { p: 'power_pct', op: '>', v: 1 } },
        obs('Confirm a steady, controlled climb.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor critical and climbing under control.',
    },
    {
      id: 'rbmk_raise_power', category: 'power',
      title: 'Raise power (reduce coolant flow)',
      purpose: 'In an RBMK, REDUCING coolant flow lets more steam form, which RAISES power — the opposite of a Boiling Water Reactor. Do it gently.',
      from: '50_percent',
      prereq: ['Reactor critical and stable at partial power.'],
      cautions: ['Small changes only — rising void adds reactivity (positive void coefficient); watch for oscillation.'],
      steps: [
        { text: 'Reduce the Main Circulation Pump (MCP) flow setpoint a little. On the Primary view, lower MCP / Channel Flow → Set %. More steam bubbles → more power.', control: 'MCP / Channel Flow',
          target: 'small power rise', cmd: { action: 'set_channel_flow', pct: 60 }, hold: 80, acc: { p: 'power_pct', op: '>', v: 51 } },
      ],
      guard: { never_melted: true },
      outcome: 'Power rises and settles at a new balance.',
    },
    {
      id: 'rbmk_shutdown', category: 'shutdown',
      title: 'Normal shutdown (AZ-5)',
      purpose: 'Shut down with the AZ-5 emergency-protection button. From full power (rods already out of the danger region) this is unconditionally safe.',
      from: 'full_power',
      prereq: ['At-power operation.'],
      cautions: ['A full-power scram is safe; a low-power / low-ORM scram is the Chernobyl trap — see the accident walkthrough.'],
      steps: [
        { text: 'Press AZ-5 (arm within 3 s, then confirm) to insert all rods.', control: 'AZ-5', target: 'power collapsing', cmd: { action: 'manual_scram' }, hold: 40, acc: { p: 'power_pct', op: '<', v: 8 } },
        obs('Confirm power has fallen; decay heat remains — maintain flow.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor safely shut down.',
    },
    {
      id: 'rbmk_mcp_trip', category: 'emergency',
      title: 'Loss of coolant flow (pump trip)',
      purpose: 'Main Circulation Pumps (MCP) have tripped and flow is coasting down. In an RBMK, less flow means MORE steam and MORE power — shut down promptly.',
      from: 'full_power',
      prereq: ['At-power operation.'],
      cautions: ['Do not wait — rising void raises power (positive coefficient).'],
      steps: [
        { text: 'Pumps trip — channel flow is coasting down and power is rising. (Failures tab → inject MCP Trip.)', control: '(observe flow / power)', target: 'diagnose',
          cmd: { action: 'inject_failure', failure_id: 'mcp_trip' }, hold: 6 },
        { text: 'Initiate AZ-5 promptly to shut the reactor down. (The protection may beat you to it — if the board already shows SCRAMMED, confirm rods in and continue.)', control: 'AZ-5', target: 'power collapsing',
          cmd: { action: 'manual_scram' }, hold: 40, acc: { p: 'power_pct', op: '<', v: 12 } },
        obs('Confirm shutdown and cooling on decay heat.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor safely shut down after loss of flow.',
    },
    {
      id: 'rbmk_chernobyl', category: 'accident', narrative: true,
      title: 'Chernobyl (1986) — an accident of design',
      purpose: 'Same actions, opposite outcomes: on the pre-1986 design the emergency-shutdown button briefly ADDS reactivity and the reactor destroys itself; on the post-1986 design the same action shuts it down safely.',
      from: 'low_power_xenon',
      steps: [
        obs('SETUP — Engine: RBMK (pre-1986). Initial state: Low Power + Xenon (accident). Primary view → EPS → Bypassed (or Failures tab → EPS Bypass Active). ORM is far below minimum.'),
        obs('With EPS bypassed and rods almost fully withdrawn, press AZ-5 (arm, then confirm). On the PRE-1986 design the graphite tips briefly ADD reactivity (positive scram effect).'),
        obs('That kick, amplified by positive void feedback at low power, drives a power excursion — the core is destroyed (steam explosion in the flagship suite).'),
        obs('COMPARE — switch Engine to RBMK (post-1986), same initial state and EPS bypass, press AZ-5 again: no positive kick; the reactor shuts down safely.'),
        obs('Note: peak magnitude is understated vs history (lumped kinetics); mechanism and divergent outcomes are faithful.'),
      ],
    },
  ];

  // ---- BWR ------------------------------------------------------------------
  var BWR = [
    {
      id: 'bwr_startup', category: 'startup',
      title: 'Reactor startup — approach to criticality',
      purpose: 'Bring the BWR up from Hot Standby (subcritical) by withdrawing rods to criticality; power ascension is then largely a recirculation-flow maneuver.',
      from: 'hot_startup',
      prereq: ['Hot Standby: subcritical, recirculation running.'],
      cautions: ['Watch the Startup Rate (SUR); once critical, use recirc flow to bring power up.'],
      steps: [
        obs('Confirm Hot Standby: reactivity below zero, recirculation established.', { p: 'reactivity_pcm', op: '<', v: 0 }),
        { text: 'Primary view: hold Control Bank → Withdraw to reach criticality and start the climb; the negative void feedback keeps it stable.',
          control: 'Control Bank', target: 'positive SUR, controlled climb',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 34, speed: 'normal' }, hold: 160,
          saw: { p: 'startup_rate_dpm', op: '>', v: 0 }, acc: { p: 'power_pct', op: '>', v: 1 } },
        obs('Confirm a controlled climb; raise recirculation flow to continue toward target power.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor critical and climbing; ready to raise power on recirc flow.',
    },
    {
      id: 'bwr_raise_power', category: 'power',
      title: 'Raise power (increase recirculation flow)',
      purpose: 'The BWR way: MORE recirculation flow sweeps out steam bubbles, which RAISES power — the main power control, stable and self-limiting.',
      from: '50_percent',
      prereq: ['Reactor critical and stable at partial power.'],
      cautions: ['Recirc flow is the primary control; rods are for coarse/shutdown moves.', 'The flow throttle is powerful and this trainer has NO high-flux trip to save you: past ~32 on the dial you are above rated power, sustained. Small steps; let the foam settle between moves.'],
      steps: [
        { text: 'Increase the Recirculation (recirc) drive setpoint a modest step. Primary view → Recirc Drive → Set % — ask 28 (≈ 80% power). Fewer voids → positive reactivity → power rises and self-limits.',
          control: 'Recirc Drive', target: 'power ≈ 80%, below 90%',
          cmd: { action: 'set_recirc_flow', pct: 28 }, hold: 90, acc: { p: 'power_pct', op: '>', v: 55 } },
      ],
      guard: { never_melted: true, never: [{ p: 'power_pct', op: '>=', v: 95 }] },
      outcome: 'Power rises and settles at a higher balance — inside the band the exam will later demand.',
    },
    {
      id: 'bwr_shutdown', category: 'shutdown',
      title: 'Normal shutdown',
      purpose: 'Shut down with a fast rod insertion; decay heat continues and must keep being removed.',
      from: 'full_power',
      prereq: ['At-power operation.'],
      cautions: ['Decay heat persists — maintain core cooling / injection after shutdown.'],
      steps: [
        { text: 'SCRAM to insert all rods (fast hydraulic drive, ~3 s).', control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 40, acc: { p: 'power_pct', op: '<', v: 5 } },
        obs('Confirm shutdown; keep removing decay heat.', { p: 'decay_heat_pct', op: '>', v: 3 }),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor shut down; decay heat being removed.',
    },
    {
      id: 'bwr_sbo_rcic', category: 'emergency',
      title: 'Station blackout — hold with RCIC',
      purpose: 'All alternating-current (AC) power is lost. The steam-driven Reactor Core Isolation Cooling (RCIC) pump needs no AC — start it to keep the core covered while power is restored.',
      from: 'full_power',
      prereq: ['At-power operation.'],
      cautions: ['RCIC runs on battery control power + reactor steam; it buys hours, not days — plan to depressurize-and-inject before the batteries die.'],
      steps: [
        { text: 'All AC power is lost. (Failures tab → inject Station Blackout, or load initial state Post-Scram Station Blackout.) Recirculation and main feedwater are gone.', control: '(observe)', target: 'diagnose SBO',
          cmd: { action: 'inject_failure', failure_id: 'station_blackout' }, hold: 10 },
        { text: 'Scram the reactor if not already shut down.', control: 'SCRAM', target: 'power collapsing', cmd: { action: 'scram' }, hold: 5 },
        { text: 'Start Reactor Core Isolation Cooling (RCIC) — Secondary view → RCIC → On. It runs on reactor steam and battery power, no AC needed.',
          control: 'RCIC', target: 'vessel level held', cmd: { action: 'set_rcic', active: true }, hold: 300, acc: { p: 'vessel_level_pct', op: '>', v: 40 } },
        obs('Confirm the core stays covered — RCIC provides the grace window until battery depletion.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true },
      outcome: 'Core held covered on steam-driven RCIC through the grace window.',
    },
    {
      id: 'bwr_fukushima', category: 'accident', narrative: true,
      title: 'Fukushima Daiichi (2011) — an accident of sustained support',
      purpose: 'The reactors scrammed safely, but the tsunami knocked out AC power for days. Steam-driven cooling bought hours — then the batteries died. Depressurize-and-inject vs not is the difference between a covered core and a meltdown.',
      from: 'post_scram_sbo',
      steps: [
        obs('SETUP — Initial state: Post-Scram Station Blackout (Fukushima), or inject Station Blackout at power then SCRAM. RCIC auto-starts and holds vessel level.'),
        obs('Fukushima Unit 1 path — Secondary view → Isolation Condenser (IC) → On: passive heat sink with no AC (DC valves). Holds core covered on decay heat until batteries deplete.'),
        obs('RCIC / IC buy hours — use Settings → time speed (e.g. 600×) to advance. When batteries deplete, steam-driven injection stops.'),
        obs('Without further action, decay heat boils the pool away and the core uncovers (flagship hold branch).'),
        obs('INTERVENTION — before uncovery: Secondary view → ADS → Trigger to depressurize, then LPCI → Start and/or Core Spray (LPCS) → Start. Core stays covered (intervention branch).'),
        obs('Note: simulation ends at fuel damage; containment/hydrogen events are described, not modeled.'),
      ],
    },
  ];

  /* pwr2 — the shipped plant's own pool (#526): the Mode 5 → full power → Mode 5 chain,
   * authored against PWR2 and measured on it. The pwr pool stays for the retired-engine
   * gates; the two share ids (same procedures, each plant's own numbers). */
  RD.MANUAL_PROCEDURES = { pwr: PWR, pwr2: PWR2, rbmk_pre: RBMK, rbmk_post: RBMK, bwr: BWR };

  /* ---- `from` IS THE SHIPPED PLANT'S IC NAME. The RETIRED engine needs a translation. -------
   * (#532, 2026-08-30.) `proc.from` is not documentation — `run_procedures.js:77` and
   * `procedures_harness.js:105` LOAD it, which a grep of ui/ and layers/ alone does not show. So
   * when PWR-N01's start state was corrected from `cold_shutdown` (which the shipped engine
   * refuses by name — there is no Mode 5, #524) to `hot_shutdown`, those two harnesses went red:
   * they drive `RD.PWREngine`, the RETIRED plant, where `cold_shutdown` is the right name and
   * `hot_shutdown` is a different, HOT state — so the heatup started at power and tripped on
   * overtemperature ΔT at step 9.
   *
   * ⚠ THE FIX IS A NAME TRANSLATION, NOT A CHANGED ASSERTION. Every harness keeps testing exactly
   * what it tested; only the IC label is mapped for the engine that uses the other vocabulary.
   * The alternative — reverting `from` — would have left the checklist a PLAYER RUNS declaring a
   * state their plant refuses, so that a gate aimed at a retired engine could stay green. That is
   * the #579 trap: a check pointed at the wrong plant defending the wrong plant's value.
   *
   * It lives HERE as a SIBLING of RD.MANUAL_PROCEDURES, not a property of it — that object is
   * iterated by profile name and a function on it broke every consumer at once. Beside the
   * procedures because both harnesses need it and there is no shared
   * test module — and a constant written down twice is the PROTECTION_DT trap.
   *
   * #524 (2026-08-31): PWR-N01's `from` is `cold_shutdown` again — BOTH engines now carry
   * that name, so the mapping below currently translates nothing. It stays, because the
   * vocabulary gap it bridges is still real (the retired engine has no `hot_shutdown`), and
   * deleting it re-opens the silent-red path the header describes the day any checklist
   * starts from the Mode 4 preset. */
  RD.RETIRED_ENGINE_IC = function (from) {
    return from === 'hot_shutdown' ? 'cold_shutdown' : from;
  };

})(globalThis.RD || (globalThis.RD = {}));

 