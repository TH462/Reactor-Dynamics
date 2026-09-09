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
 *   overtaken OPTIONAL {p,op,v[,tol],text[,industry]} — the plant condition under which
 *           this step NO LONGER APPLIES (#641): graded like `acc` while the step is active,
 *           and when it holds the live checklist checks the step off as 'overtaken', posts
 *           `text` as the instructor's comment and moves on. For a step whose evidence the
 *           plant can make impossible — the 1/M plot once the source range de-energizes.
 *           Replay-side it is ignored: the replay drives the step as authored.
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
  /* THE 1/M STEPS ARE OVERTAKEN BY THE SOURCE RANGE SECURING (#641, owner playtest 2026-09-05).
   * PWR2 de-energizes the channel on flux alone at 1e5 cps (pwr2_true_state.js SR_SECURE_CPS,
   * no operator lever by #598 item 7); the plot tool refuses the press from that moment and
   * sends nothing, so a `plot_1m_point` entry can never latch again. Measured: a 49-step burst
   * at the last plot step crosses 20,000 cps and secures the channel 20 s later at 3 DPM, and
   * even the authored route peaks at 9.91e4 cps on the criticality step. One object, shared by
   * all six plot steps, so the wording cannot drift between them. `sr_energized` is a boolean
   * on the wire and `false < 1` is the same test the leg's own confirmation step uses. */
  var SR_OVERTAKEN = {
    p: 'sr_energized', op: '<', v: 1,
    label: 'too late to plot: SOURCE RANGE switched itself off above 1.0e5 counts a second',
    text: 'This point is overtaken, too late to plot: SOURCE RANGE switched itself off above 1.0e5 (100,000) counts a second, which means the reactor is critical or about to be. Stop withdrawing and go to the single-step criticality step. Watch STARTUP RATE and keep it under 1.0.',
    industry: 'SOURCE RANGE DE-ENERGIZED ABOVE 1E5 CPS — 1/M APPROACH OVERTAKEN. Remaining plot steps skipped. Hold rods; STARTUP RATE under 1 DPM.',
  };

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
      purpose: 'Take the plant from Mode 5, Cold Shutdown to Mode 3, Hot Standby using the heat of the reactor coolant pumps alone. The reactor stays shut down the whole way. About 12 plant-hours.',
      from: 'cold_shutdown',
      prereq: ['Plant in Mode 5, Cold Shutdown: AVG COOLANT TEMPERATURE near 122 °F, PRIMARY PRESSURE near 363 psi, reactor shut down, residual heat removal (RHR) running (auto-checked).', 'Reactor coolant pumps stopped and ready to start. They are the heat source.'],
      precond: [
        { p: 'tavg_c', op: '<', v: 95, text: 'Plant cold: AVG COOLANT TEMPERATURE near 122 °F' },
        { p: 'pressure_mpa', op: '<', v: 5, text: 'Depressurized: PRIMARY PRESSURE near 363 psi' },
        { p: 'power_pct', op: '<', v: 1, text: 'Reactor shut down: REACTOR POWER 0 %' },
      ],
      cautions: [
        'Do not exceed a heatup rate of 100 °F per hour. Control the rate with HX FLOW on the RHR card.',
        'Keep the STEAM DUMP closed on pump heat: an open dump removes heat faster than the pumps add it. The turbine stays tripped for the whole heatup.',
        'Do not move the control bank and do not change BORON. Only the shutdown bank moves, in its own step.',
      ],
      steps: [
        obs('Verify the plant is cold and shut down: AVG COOLANT TEMPERATURE 122 °F, PRIMARY PRESSURE 363 psi, OFF lit on the RCP FLOW card, both rod positions 0 of 627.',
          { p: 'plant_mode', op: '~', v: 5, tol: 0.1 },
          null, ['Tavg', 'Plant Pressure', 'Residual Heat Removal (RHR)'],
          'This is the starting picture, not an action. In Cold Shutdown the water is far below boiling, pressure is low, the RHR loop is carrying the small amount of heat the fuel still makes, and both rod banks are fully in (rod position 0 of 627).',
          [{ p: 'pump_flow_pct', op: '>', v: 90 }, { p: 'shutdown_bank_pct', op: '>=', v: 98 }, { p: 'plant_mode', op: '<', v: 5 }]),
        { text: 'Start the reactor coolant pumps: press ON on the RCP FLOW card.',
          why: 'A shut-down reactor makes almost no heat, but the running pumps put about half a percent of full power into the water as friction. That is enough to warm the whole plant. Real crews heat up exactly this way, with the reactor never critical.',
          control: 'RCP Run/Stop', target: 'RCP FLOW above 90 %',
          cmd: { action: 'set_rcp', running: true }, hold: 30,
          acc: { p: 'pump_flow_pct', op: '>', v: 90 },
          hl: ['RCP Run/Stop'] },
        /* ONE CLICK, NOT A HOLD *(OWNER, 2026-09-03, #619 item 9: "you dont need to hold
         * withdraw. its set to go automatically on a click")*. Verified at the control:
         * `toggleLatchRod` (pwr_board_wiring.js:3585) issues `rod_start` and latches, and
         * `clearLatchIfDone` (:3598) issues `rod_stop` when the bank reaches its limit. The
         * text said "hold WITHDRAW", which is the retired board's momentary button. */
        { text: 'On the ROD CONTROL card press FAST on the speed row, then click WITHDRAW under SHUTDOWN once. The bank runs out to 627 of 627 on its own.',
          /* "about 9 plant-minutes" is MEASURED, not scaled (#668): 627 steps at the sourced
           * fast drive of 72 steps/min is 522.5 s = 8.7 min, verified on the engine at 71.99
           * steps/min. It read "about 10" against the pre-#668 drive's 595.4 s. */
          note: 'One click starts the shutdown bank and it runs to the top by itself, about 9 plant-minutes. Clicking WITHDRAW again stops it early. Watch SHUTDOWN ROD POSITION count up.',
          why: 'The shutdown bank is the emergency brake: the rods that drop on a scram and hold the core shut down. A scram only works if they have somewhere to fall, so they are parked fully out before anything else happens. Pulling them out does not start the reactor; the control bank, which stays in, is what does that.',
          control: 'Shutdown Bank', target: 'SHUTDOWN ROD POSITION 627 of 627',
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
        /* A VERIFICATION HOLDS FOR THE PLAYER (#660 item 4, owner playtest 2026-09-08: "skipped and
         * didn't have an acknowledge button"). With a `cmd` on it the step ticked itself on the
         * already-tripped turbine and advanced; without one it satisfies and waits, like the
         * other verifications. The cold plant boots tripped, so the replay ticks it on state. */
        { text: 'Verify the turbine is tripped: TRIP lit on the TURBINE-GENERATOR card, OUTPUT 0 MWe. If LOAD reads anything but 0, press UNLOAD.',
          note: 'UNLOAD is not TRIP. UNLOAD walks the load setting to zero; TRIP shuts the steam valves.',
          why: 'The cold plant starts with the turbine tripped. It matters because a turbine taking any steam on pump heat would carry away the very heat you are trying to build up.',
          control: 'Turbine Load', target: 'TRIP lit, OUTPUT 0 MWe',
          hold: 10,
          acc: { p: 'turbine_tripped', op: '>', v: 0 },
          hl: ['Turbine Load', 'Main Breaker'] },
        { text: 'Press AUTO on the SG FEED card. This starts the feed pumps and holds the STEAM GENERATOR LEVEL tile near 65 %.',
          why: 'The steam generator is the boiler: reactor water heats it on one side and steam comes off the other. Nothing is boiling yet, so the feed pumps start out stopped. Putting level control in AUTO now, while the plant is quiet, means it is already holding level when the water starts to boil later in the heatup.',
          control: 'Feed Pumps', target: 'SG FEED reads AUTO, STEAM GENERATOR LEVEL near 65 %',
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
        { text: 'Verify the STEAM DUMP is closed: CLOSE lit on the STEAM DUMP card, status reading MANUAL.',
          why: 'The steam dump sends steam straight to the condenser instead of the turbine. Kept shut, the secondary side bottles up and the pump heat stays in the plant. The DUMP SETPOINT box already reads 1020 psi, but that number does nothing until AUTO is pressed, which a later step does once the steam side is hot.',
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
        { text: 'Press A+B 7 % on the LETDOWN card. Both orifices, not one: A alone cannot pass enough flow for the pressurization.',
          why: 'Water is always being pumped into the reactor loop (charging), so it always needs a way out (letdown). Right now letdown leaves through the RHR loop, and that path closes itself at 600 psi on the next step\'s climb. The letdown orifices, two fixed holes, are the only way out after that; with them shut the plant would slowly fill solid.',
          control: 'Letdown Orifices (CVCS)', target: 'A+B 7 % lit; LETDOWN reads above 0 gpm',
          cmd: { action: 'set_letdown_orifices', a: true, b: true }, hold: 10,
          accs: [
            { p: 'letdown_orifice_a', op: '>', v: 0, label: 'Orifice A in service' },
            { p: 'letdown_orifice_b', op: '>', v: 0, label: 'Orifice B in service' },
          ],
          hl: ['Letdown Orifices (CVCS)'] },
        /* PRESSURE CONTROL IN SERVICE (#624 / #619 item 14, 2026-09-04) *(OWNER, 2026-09-04:
         * "next", to the recommendation "measure the heaters-OFF drift from cold_shutdown and
         * land item 14's remaining halves")*. Mode 5 now boots with the heaters OFF and the
         * spray in hand and shut — the lineup `pwr_cooldown` leaves behind, so the picker's
         * plant and a player's own cooled-down plant finally agree.
         *
         * THE NEXT STEP IS INERT WITHOUT THIS ONE, and that is the whole justification —
         * measured, not argued: from the cold boot, dialling the Pressure SP to 1700 psig with
         * the heaters off moves the plant 0.048 psi in 10 plant-minutes at 0.0 kW, against
         * +133.4 psi at 157.8 kW once AUTO is pressed. Deleting this step reds the Pressure SP
         * step's own acceptance (see the injection number in the #624 write-up).
         *
         * ⚠ THE STEP IS NOT HERE BECAUSE THE BUBBLE BLEEDS. `pwr2_engine`'s old pzDrivers note
         * claimed a surge-line bleed of ~16 kW / -68 psi/hr and the build plan for this change
         * asked this paragraph to quote that rate. Measured 2026-09-04 it is FALSE on this
         * engine: 60 plant-minutes with the heaters off run 362.59 -> 362.85 psia, +0.3 psi/hr.
         * There is no standing conduction path out of the vessel in this model, so a still
         * isothermal plant has nothing to bleed. The prose below says what is true instead.
         *
         * TWO CARDS, THREE CHECK-OFFS. The step's own `cmd` is the heaters; the spray is a
         * `cmd`-kind accs entry so the replay presses it too (procedures_harness issues those),
         * and each card then has a `p`-kind entry asserting the EFFECT on the board's own lamp.
         * `set_heater` and `set_spray` are different command families, so the two cannot tick
         * each other off. */
        { text: 'On the PRESSURIZER (PZR) card press AUTO under HEATER, then AUTO under SPRAY.',
          why: 'The pressurizer is a tank of half water, half steam that sets the pressure of the whole reactor loop: heaters boil water to raise pressure, spray condenses steam to lower it. The cold plant starts with both off, so nothing is holding pressure. In AUTO they follow the SET PZR PRESSURE box, which the next step raises; with the heaters off that box does nothing.',
          control: 'Pressurizer Heaters (PZR)', target: 'AUTO lit under both HEATER and SPRAY',
          cmd: { action: 'set_heater', auto: true }, hold: 10,
          accs: [
            { p: 'heater_auto', op: '>', v: 0, label: 'AUTO lit under HEATER' },
            { cmd: { action: 'set_spray', auto: true }, label: 'AUTO pressed under SPRAY', hidden: true },
            { p: 'spray_auto', op: '>', v: 0, label: 'AUTO lit under SPRAY' },
          ],
          hl: ['Pressurizer Heaters (PZR)', 'Pressurizer Spray (PZR)'] },
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
         * dominates the acceptance. 4.7 MPa clears the measured cover gas by 17 psi.
         *
         * AND THEN THE 17 psi MARGIN BECAME A HOLD NOBODY COULD READ (#627, owner playtest,
         * 2026-09-04: "it holds the warp at 1x until pressure is over 682. it should not gate the
         * warp hold on the pressure, the warp hold should gate on the user setting the pressure.
         * thats the important part to wait for, not the pressure."). The #619 item 13 clock hold
         * rises at the cover gas, 665 psia; this step ticked at 682. For the 17 psi between, the
         * checklist showed THIS step waiting on a pressure while the plant refused fast time and
         * asked for the accumulators — the next step, greyed. Measured as a player at 600x: hold at
         * 667.9 psia, step tick at 691.6, and the hold chattered three times in between
         * (pwr2_engine.js has that half).
         *
         * TWO CHECK-OFFS NOW, and the acceptance moves to the cover gas itself. The first box is
         * the owner's "important part": the setpoint DIALLED, a cmd-kind entry that ticks the
         * moment the command is issued — the action is acknowledged before the ride starts. The
         * second is the pressure at 4.585 MPa — a hair above `RD.pwr2.eccs.ACC.p0_mpa` (4.583 MPa,
         * 664.7 psia, the cover gas the manuals print as 665), so 2e's strict "accepts ABOVE the
         * cover gas" still holds — the same crossing the hold rises on, so the step that is active while the clock is
         * held is the one that says open the valve. #608's rule survives with no margin needed:
         * at the cover gas the tank and the primary are at the same pressure, so opening on the
         * tick moves nothing (the 609 psia case was a 56 psi head into the tank). The replay still
         * dwells `hold: 2400`; `run_checklist_pwr2` 2j asserts the tick lands within 50 broadcasts
         * of the hold rising. */
        { text: 'Raise SET PZR PRESSURE to 1700 psi; once set, the box will not go below that. Not 2235 psi yet: read the next step before this one settles.',
          why: 'Pressure goes up in two stages because of an automatic gate at 1972 psi: above it, the emergency injection pumps re-arm, and with the steam side still cold they would fire on a healthy plant. So the first stage stops under that gate. Raising the setpoint also starts the climb toward the accumulator window in the next step, which opens at 665 psi about 35 plant-minutes from now.',
          control: 'Pressure SP', target: 'SET PZR PRESSURE 1700 psi; PRIMARY PRESSURE climbing',
          wait_hint: 'About 35 plant-minutes until PRIMARY PRESSURE reaches 665 psi. Use the speed buttons at the top. At 665 psi the clock drops to 1× by itself and stays there until the accumulator valve in the next step is open.',
          cmd: { action: 'set_pressure_setpoint', mpa: 11.72 }, hold: 2400,
          accs: [
            { cmd: { action: 'set_pressure_setpoint', mpa: 11.72 }, label: 'SET PZR PRESSURE set to 1700 psi' },
            { p: 'pressure_mpa', op: '>', v: 4.585, label: 'PRIMARY PRESSURE at 665 psi, the accumulator window' },
          ],
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
         * never say the window is closing. The board cue is the CLOCK (#619 item 13 / #627): the
         * plant drops to real time at the cover gas and refuses to accelerate until the valve is
         * open, and since #627 this step is the ACTIVE one while it does — the setpoint step
         * ticks at the same crossing. The clock is still stated in the setpoint step's why and
         * wait_hint, because a player reads those before the ride, not during it. */
        { text: 'Open the accumulator valve now: click the small valve symbol above and to the right of the ACCUMULATORS tile, beside ECCS FLOW (this step draws a green ring around it), while PRIMARY PRESSURE is between 665 and 1615 psi. Above 1615 psi the valve locks. The ACCUMULATORS caution that comes on is expected until pressure passes 1000 psi.',
          note: 'If the window is missed: on the PRESSURIZER (PZR) card press OFF under HEATER and MANUAL under SPRAY at 100 %, wait for PRIMARY PRESSURE to fall below 1615 psi, open the valve, then put HEATER and SPRAY back in AUTO.',
          why: 'The accumulators are tanks of borated water pushed by nitrogen gas at 665 psi. They fire by themselves if loop pressure ever falls below that, which is why they are kept isolated while the plant is cold. Above 1615 psi the plant removes power from the valve, so it has to be opened on the way past.',
          control: 'Accumulator valve', target: 'ACCUMULATORS tile no longer reads ISOLATED',
          cmd: { action: 'open_accumulator_valve' }, hold: 10,
          acc: { p: 'accumulator_valve_open', op: '>', v: 0 },
          hl: ['Accumulator valve'] },
        /* THE TEMPERATURE IS IN THE LINE ITSELF *(OWNER, 2026-09-03, #619 item 15: "step 9 is
         * looking for a temperature that it does not specify")*. It was in `target` and in the
         * acceptance line, both of which render — but the numbered instruction, which is what a
         * player reads first, said only "watch Tavg". A step that waits on a number names it. */
        { text: 'Wait until AVG COOLANT TEMPERATURE reaches 542 °F. If it climbs faster than 100 °F per hour, raise HX FLOW on the RHR card. Do not move rods or change BORON.',
          why: 'The pumps are doing the work now. Watch AVG COOLANT TEMPERATURE, PRESSURIZER LEVEL rising as the water expands, and REACTOR POWER staying at zero. On the steam side, STEAM PRESS climbs toward 1020 psi as the water in the steam generator heats up; a later step hands that pressure to the steam dump to hold.',
          control: '(observe)', target: 'AVG COOLANT TEMPERATURE 542 °F or higher, REACTOR POWER still 0 %',
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
        { text: 'Verify ISOLATE is lit on the RHR card and LETDOWN reads above 0 gpm. If LETDOWN reads 0, press A+B 7 % on the LETDOWN card before going on.',
          why: 'The RHR suction valve shut itself when PRIMARY PRESSURE passed 600 psi during the climb; that is an interlock, not something you do. Letdown now leaves only through the orifices you opened earlier, about 11 gpm at this pressure. If it reads zero, water is going in and nothing is coming out.',
          accs: [
            { p: 'rhr_active', op: '<', v: 1, label: 'ISOLATE lit on the RHR card (the suction valve shut itself)' },
            { p: 'letdown_flow_actual', op: '>', v: 0, label: 'LETDOWN above 0 gpm' },
          ],
          hl: ['Letdown Orifices (CVCS)', 'Residual Heat Removal (RHR)'] },
        /* THE HEAT SINK (#629, 2026-09-05). Filed by the owner as "the plant rides onto the
         * atmospheric dump valve and pressure stalls". The stall did not reproduce on this route
         * — pressure kept climbing at 26 psi/min straight through 1920 psia to the acceptance —
         * but the RIDE-ONTO-THE-ADV half is real and measured, and it was UNAVOIDABLE from the
         * board: `cold_shutdown` boots `dump_mode: 'off'` and the shell mapped AUTO to Tavg mode
         * unconditionally, so pressing AUTO changed nothing (measured: byte-identical trace, that
         * valve at 7.6 %, dumps 0.0 %) and the DUMP SETPOINT box was an orphan on every plant a
         * player heats up. The shell now selects steam-pressure mode when the turbine is tripped,
         * which is WTSM 11.2's own mode assignment.
         *
         * ⚠ #629's EXPLANATION FOR THE NO-OP IS REFUTED, re-measured 2026-09-08 (#646). It was
         * "the Tavg turbine-trip controller only opens above 557 °F (291.67 °C), ABOVE the
         * 1040 psig atmospheric dump valve". #508/#645 moved the anchor to 547 °F (286.11 °C),
         * 4.2 °F (2.3 °C) BELOW that valve's 551.2 °F (288.4 °C) saturation, and the ordering
         * inverted. The same heatup ride, three lineups, cold to Mode 3 + 2 plant-hours of park:
         *     pressure mode   547.2 °F / 1005 psig · valve SHUT  ·      0 lbm vented
         *     tavg mode       547.4 °F / 1006 psig · valve SHUT  ·      0 lbm vented
         *     never selected  551.6 °F / 1042 psig · valve 8.1 % · 11,005 lbm vented
         * So the press is NOT a no-op any more — it is worth 4.4 °F (2.4 °C), 37 psi and those
         * 11,005 lbm — but the mode it selects is no longer what buys that; PRESSING IT AT ALL is.
         * The step stays exactly where it is and for the SOURCED reason: pressure mode is the only
         * mode that reads the DUMP SETPOINT box, which is what the cooldown leg later walks down.
         *
         * WHY IT SITS HERE and not before the ride: in pressure mode the controller does nothing
         * until the secondary reaches the 7.03 MPa setpoint, which it does at the END of the ride,
         * so an earlier press has no observable effect for plant-hours. It also costs overshoot —
         * measured on pwr2_dumpctl directly over a 2.0 -> 7.6 MPa header ramp, selecting the mode
         * at 275 psig winds the PI integrator to its -30 clip and the dumps then do not crack
         * until 7.155 MPa (1023 psig), against 7.031 MPa (1005 psig) when the mode is selected at
         * the anchor. 18 psi of overshoot, still 17 psi under the atmospheric dump valve, so this
         * placement is a preference for an immediately observable press, not a safety necessity.
         *
         * THE RIDE'S OWN `hold: 40000` STILL TRANSITS THE VALVE in the replay (11.1 plant-hours
         * carries Tavg to 288.69 °C — re-measured 2026-09-08, unchanged), but its ACCEPTANCE
         * releases at 283 °C / 541.4 °F — 9.8 °F (5.4 °C) BELOW the 551.2 °F (288.4 °C)
         * saturation of the valve's 1040 psig setpoint. A player who follows the checklist gets
         * here first. That is #608's lesson read backwards: there a realistic hold MASKED an
         * unsafe acceptance; here an over-long one makes the replay the harder ride.
         *
         * Graded on the SELECTION (`steam_dump_auto`, control_state), because the dumps carry
         * 0.4-2.9 % once they are holding the anchor and the valve position cannot tell an
         * in-service controller from a shut one. The EFFECT is asserted in the Mode 3
         * confirmation below, which reads the atmospheric dump valve and the header pressure. */
        { text: 'Press AUTO on the STEAM DUMP card. The dump now holds STEAM PRESS at the 1020 psi in the DUMP SETPOINT box.',
          why: 'From here the plant makes more heat than it needs, and the steam dump sends the excess to the condenser. Without it the steam side keeps climbing until the ATMOS DUMP valve opens and vents steam to the sky for the rest of the heatup. Real plants run the dump in this pressure-holding mode whenever the turbine is off.',
          control: 'Steam Dump', target: 'AUTO lit on the STEAM DUMP card, status reading PRESS',
          cmd: { action: 'set_steam_dump', mode: 'auto' }, hold: 10,
          acc: { p: 'steam_dump_auto', op: '>', v: 0 },
          hl: ['Steam Dump', 'Dump SP'] },
        { text: 'Raise SET PZR PRESSURE to 2235 psi, normal operating pressure.',
          why: 'The second stage of the pressurization. Crossing the 1972 psi gate re-arms the emergency injection, and that is safe now because the steam side is hot: STEAM PRESS sits near 1020 psi, far above the 328 psi that would trigger it. That is why this setting waited for the heatup to finish.',
          control: 'Pressure SP', target: 'PRIMARY PRESSURE above 2175 psi',
          wait_hint: 'About 20 plant-minutes on full heaters. Use the speed buttons at the top.',
          cmd: { action: 'set_pressure_setpoint', mpa: 15.41 }, hold: 5400,
          acc: { p: 'pressure_mpa', op: '>', v: 15.0 },
          hl: ['Pressure SP', 'Primary Pressure'] },
        /* THE EFFECT ACCEPTANCE FOR THE STEAM DUMP STEP (#629), same shape as the letdown
         * transfer's. The dump step's own tick reads the SELECTION; these read the PLANT at the
         * end of the leg — the atmospheric dump valve SHUT and the header sitting on the anchor,
         * which together say the condenser is carrying the heat. Either alone passes on the wrong
         * plant: a shut valve is satisfied by a plant that has not got hot yet, and 7.03 MPa is
         * approached from below by any plant on its way up.
         *
         * ⚠ THE INJECTION THAT PROVED THEM LIVE HAS GONE HOLLOW, AND THE NEW ONE IS BELOW (#646,
         * 2026-09-08). The recorded one was "revert the shell's mode selection to the
         * unconditional 'tavg'": that used to read the valve at 8.60 % and the header at
         * 7.29 MPa (1042 psig) and redden EXACTLY these two. RE-RUN on this tree it reddens
         * NEITHER — 32/32 green — because after the #508/#645 re-anchor Tavg mode holds the plant
         * itself (valve 0.00 %, header 7.04 MPa). These two checks can no longer see WHICH mode
         * AUTO selected; they never could see it directly, they saw its consequence, and the
         * consequence is gone. That claim is gated where it belongs — `run_pwr2_shell` group M
         * asserts the published mode on BOTH branches and reds 161/162 under that same revert.
         *
         * INJECTION, CURRENT (HR10), measured 2026-09-08: DELETE this step's own `cmd` (the AUTO
         * press never issued, everything else untouched) and the valve reads 8.43 % with the
         * header at 7.29 MPa — EXACTLY these two go red, the other 30 stay green. That is the
         * defect this leg owns: whether the press reaches the plant and the plant answers over a
         * full heatup. The mode it selects is the shell's to prove. */
        { text: 'Verify Hot Standby: AVG COOLANT TEMPERATURE near 547 °F, PRIMARY PRESSURE 2235 psi, STEAM PRESS near 1020 psi, CONTROL ROD POSITION still 0.',
          why: 'Hot Standby (Mode 3) is hot and at pressure with the reactor still shut down. The control bank never moved: the pumps did all the heating. STEAM PRESS holding near 1020 psi with the ATMOS DUMP shut says the steam dump is carrying the heat, not the sky.',
          acc: { p: 'plant_mode', op: '~', v: 3, tol: 0.1 },
          accs: [
            { p: 'adv_valve_pct', op: '<', v: 1, label: 'ATMOS DUMP shut' },
            { p: 'steam_pressure_mpa', op: '~', v: 7.03, tol: 0.15, label: 'STEAM PRESS near 1020 psi' },
          ],
          hl: ['Tavg', 'Primary Pressure', 'Steam Dump'] },
        obs('Verify the reactor stayed shut down: SOURCE RANGE counts steady, STARTUP RATE near 0.00.',
          { p: 'reactivity_pcm', op: '<', v: -300 }, null, ['Source Range'],
          'There is no gauge for "how shut down" a reactor is. The signs are SOURCE RANGE counts holding at a steady background instead of climbing, and STARTUP RATE sitting at zero. With the control bank in and boron at the cold concentration, the core is a long way from critical.'),
        obs('Verify REACTOR POWER reads 0.0 %. If it is not, stop and find out what moved: the control bank or BORON.',
          { p: 'power_pct', op: '<', v: 1 }, null, null,
          'Power at zero is the whole point of a pump-heat heatup: the friction of the running pumps warmed the plant, not a chain reaction. Power off the floor means something pulled the control bank or diluted the boron.'),
      ],
      guard: {
        never_melted: true,
        never: [
          { p: 'fuel_temp_c', op: '>=', v: 1200 },
          { p: 'reactivity_pcm', op: '>', v: 0 },
          { p: 'power_pct', op: '>', v: 1 },
        ],
      },
      outcome: 'Plant at Mode 3, Hot Standby: hot, at pressure, reactor shut down, control bank never moved. Boron is still at the cold concentration near 918 ppm; the startup checklist begins by diluting it.',
    },
    {
      id: 'pwr_startup', category: 'startup', manual_ref: 'PWR-T03', next: 'pwr_raise_power',
      title: 'Mode 3, Hot Standby → Mode 1, At Power — startup to power',
      purpose: 'Start the reactor from Mode 3, Hot Standby: make it critical, bring power up past 5 % into Mode 1, At Power, and put the turbine on line. About 2 plant-hours.',
      from: 'hot_zero_power',
      prereq: ['Plant at Mode 3, Hot Standby: AVG COOLANT TEMPERATURE near 547 °F, PRIMARY PRESSURE 2235 psi, reactor shut down (auto-checked).', 'RCP FLOW on.', 'CONTROL ROD POSITION 0 of 627; SHUTDOWN ROD POSITION 627 of 627.'],
      /* MEASURED on hot_zero_power (2026-08-31, full stack): tavg 286.2 °C, 15.41 MPa,
       * boron 719 ppm, ρ −1,137 pcm, SR 502 cps. The boron row is the heatup→startup seam:
       * a pump-heat heatup arrives at ≈ 918 ppm — the dilution steps below are the remedy. */
      precond: [
        { p: 'tavg_c', op: '~', v: 286, tol: 8, text: 'Hot: AVG COOLANT TEMPERATURE between 533 and 561 °F' },
        { p: 'pressure_mpa', op: '~', v: 15.41, tol: 0.5, text: 'At pressure: PRIMARY PRESSURE near 2235 psi' },
        { p: 'power_pct', op: '<', v: 1, text: 'Reactor shut down: REACTOR POWER 0 %' },
      ],
      cautions: [
        'Keep STARTUP RATE under 1.0 for the whole approach. It is the speed limit; the rod position is not. Near critical, one control-bank step adds about 8.1 pcm of reactivity (a pcm is a hundred-thousandth: 8 is a small nudge, hundreds is a big one).',
        'After every rod pull, stop and let SOURCE RANGE settle before you read or plot anything. The closer to critical, the longer it takes.',
        'Never pull the rods straight to the position the 1/M PLOT predicts. It reads high early and comes down as points are added.',
        'Do not add heat with SG FEED out of AUTO: once the reactor makes heat the steam generator boils down, and AUTO is what holds its level.',
      ],
      steps: [
        obs('Verify the plant is hot and shut down: AVG COOLANT TEMPERATURE near 547 °F, PRIMARY PRESSURE 2235 psi, RCP FLOW on, SOURCE RANGE counts steady.',
          { p: 'tavg_c', op: '~', v: 286, tol: 8 },
          null, ['Source Range', 'Tavg', 'Primary Pressure', 'Reactor Coolant Pumps (RCP)'],
          'This is the plant the heatup hands over: hot, at pressure, pumps running, still shut down. Steady SOURCE RANGE counts mean nothing is drifting toward critical yet. From the Hot Standby preset, the shutdown bank is already out and boron is already near 719 ppm.',
          { p: 'power_pct', op: '>', v: 1 }),
        /* DO NOT RE-PRESS ON *(layman playtest 2026-09-07, #653 S1, measured on the full stack from
         * cold_shutdown)*: the channel boots engaged, and `set_auto_channel engaged:true` on an
         * engaged channel RE-CAPTURES the target to the analyzer (918), cancels the running dose,
         * and leaves the dilution running with the channel reading idle — 918 -> 565 ppm in four
         * plant-hours, never stopping. Setting the target alone delivers the dose and stops (at
         * 788, not 719 — the totalizer's own defect, filed separately). The four boron steps in the
         * chain now say to press ON only if it is not lit. */
        { text: 'Wash boron out of the water: on the BORON card set 719 and press Enter. ON is normally already lit; press it only if it is not.',
          why: 'Boron dissolved in the water soaks up neutrons. At 918 ppm the control bank cannot make the reactor critical at all; at 719 ppm it goes critical about 230 of 627 steps out.',
          note: 'BORON STATUS reads DILUTING while the dose runs and stops by itself; BORON CHEM updates only after a SAMPLE. From the Hot Standby preset boron already reads 719 and this step ticks at once.',
          control: 'Boron control', target: 'BORON box 719; BORON STATUS counting down; BORON CHEM updates only after a sample',
          wait_hint: 'From 918 ppm this takes about 65 plant-minutes. Use the speed buttons at the top.',
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
        /* GRADED ON THE STATE, NOT THE PRESS (layman playtest 2026-09-07, #653 S5): a step with a
         * `cmd` and no predicate completes on the live checklist only when the command is SEEN
         * (instructor_layer `met = st.cmd ? c.cmdSeen`), so this check could not tick unless the
         * player pressed the button the text told them not to press. The `cmd` is gone and the
         * acceptance is the lamp; the replay's plant boots with feed in AUTO and ticks on it. */
        { text: 'Check SG FEED reads AUTO. If it does not, press AUTO.',
          why: 'Nothing happens until the reactor starts making heat, and then the steam generator boils down fast. AUTO is what refills it. Both routes into this checklist normally arrive with AUTO already lit; check anyway.',
          control: 'Feed Pumps', target: 'SG FEED reads AUTO, STEAM GENERATOR LEVEL near 65 %',
          hold: 5,
          acc: { p: 'feed_coupled', op: '>', v: 0 },
          hl: ['SG Feed AUTO', 'SG Level'] },
        /* THE INDICATION IS NAMED, AND SO IS ITS NOTATION *(OWNER, 2026-09-03, #619 item 19:
         * "It never says to look at the SOURCE RANGE indication for counts… SOURCE RANGE says
         * 7.0e2 but step says 700. a layman wont know this is equivalent")*. The counts are the
         * whole reactivity indication on this leg and no step said where to read them. The
         * meter is a LOG channel and prints its exponent (ui/app.js logSer), which is
         * prototypical and stays — so the checklist states the equivalence once, here, at the
         * first count target, and the per-step targets carry it in the always-visible line. */
        { text: 'Before any rod moves: press 1/M PLOT on the ROD CONTROL card, then press Plot point. This first point is the baseline.',
          why: 'The 1/M plot predicts where the rods will be when the reactor goes critical, before you get there. It divides the starting count rate by the current one: as counts climb the result falls toward zero, and where the line crosses zero is the predicted critical position. It fits the last three points, so each new point sharpens it.',
          control: '1/M Plot', target: 'point 1 plotted',
          note: 'Every count target on this checklist is the SOURCE RANGE reading. It prints in shorthand: 7.0e2 is 700 counts a second, 1.4e3 is 1,400, 2.0e4 is 20,000.',
          accs: [{ cmd: 'plot_1m_point', label: 'Baseline point plotted' }],
          overtaken: SR_OVERTAKEN,
          hl: ['1/M Plot Tool', 'Source Range'] },
        /* BURST SIZE, NOT BANK POSITION *(OWNER RULING, 2026-09-03, #619 item 20: "The mode 3>1
         * CLs should tell the user about how many steps to pull the rods for startup instead of
         * a 'long burst'. i have no idea how long a 'long burst' is." — scoped in the same
         * session to the burst MAGNITUDE only)*. A burst size is not the absolute bank position
         * #618 removed hours earlier: the step still steers on the count rate and the acceptance
         * is unchanged. The numbers are the replay's own `cmd.steps` — 94 / 63 / 31 / 14 / 9,
         * rounded — so they cannot drift from what the harness drives. */
        { text: 'On the ROD CONTROL card press MED, then hold WITHDRAW under CONTROL until SOURCE RANGE settles above 7.0e2, about 90 to 110 steps. Wait for STARTUP RATE to stop falling, then press Plot point.',
          note: 'Holding WITHDRAW drives the bank at the selected speed and releasing it stops; a single tap moves one step. MED moves 48 steps a minute at 1×, SLOW 8, FAST 72. The rods move with the clock, so 10× is fine for these pulls; check the speed before each one, because a step checking off, or a new warning or critical alarm, drops the clock back to 1× — the line under the speed buttons says why (Settings can switch the dropout off). A point plotted while STARTUP RATE is still positive reads low.',
          why: 'The first two points always predict too high: near the bottom the rods are worth little per step, so the line they draw crosses zero far past the real critical position. That is expected. While the reactor is shut down, SOURCE RANGE counts are the only thing that tells you how close you are; the rod position does not.',
          control: 'Control Bank', target: 'SOURCE RANGE above 7.0e2 (700 counts a second); point 2 plotted',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 94, speed: 'normal' }, hold: 150,
          accs: [{ p: 'sr_counts_cps', op: '>', v: 700, label: 'Counts settled above 700 cps' },
                 { cmd: 'plot_1m_point', label: 'Point plotted' }],
          overtaken: SR_OVERTAKEN,
          hl: ['Withdraw', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Hold WITHDRAW at MED until SOURCE RANGE settles above 1.4e3, about 150 to 175 steps. Wait for STARTUP RATE to settle, press Plot point, then read the position the 1/M panel predicts.',
          why: 'Each new point is taken closer to critical, where a step is worth more, so the line steepens and the predicted crossing walks toward you. The panel prints "predicted criticality ≈ step N" with a marker on the plot. Treat it as too high for now; it improves with every point.',
          control: 'Control Bank', target: 'SOURCE RANGE above 1.4e3 (1,400 counts a second); point 3 plotted',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 63, speed: 'normal' }, hold: 150,
          accs: [{ p: 'sr_counts_cps', op: '>', v: 1400, label: 'Counts settled above 1,400 cps' },
                 { cmd: 'plot_1m_point', label: 'Point plotted' }],
          overtaken: SR_OVERTAKEN,
          hl: ['Withdraw', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Hold WITHDRAW at MED until SOURCE RANGE settles above 3.0e3, about 180 to 205 steps. Settle, press Plot point, read the prediction again.',
          why: 'Each step now buys more reactivity than the last, so the pulls get smaller from here. The prediction is starting to be useful. Keep waiting for STARTUP RATE to settle before each point.',
          control: 'Control Bank', target: 'SOURCE RANGE above 3.0e3 (3,000 counts a second); point 4 plotted',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 31, speed: 'normal' }, hold: 150,
          accs: [{ p: 'sr_counts_cps', op: '>', v: 3000, label: 'Counts settled above 3,000 cps' },
                 { cmd: 'plot_1m_point', label: 'Point plotted' }],
          overtaken: SR_OVERTAKEN,
          hl: ['Withdraw', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Hold WITHDRAW at MED until SOURCE RANGE settles above 7.0e3, about 195 to 220 steps. Settle, press Plot point. Keep STARTUP RATE under 1.0 on every pull.',
          why: 'STARTUP RATE is the speedometer: 1.0 means power is multiplying by ten every minute. A positive reading means reactivity is above zero and the chain reaction is growing; zero means it is holding; negative, dying away. Under 1.0 is a comfortable climb; above it you are outrunning the plot, and nothing in the plant slows the rise for you yet.',
          control: 'Control Bank', target: 'SOURCE RANGE above 7.0e3 (7,000 counts a second); point 5 plotted; STARTUP RATE under 1.0',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 14, speed: 'normal' }, hold: 150,
          accs: [{ p: 'sr_counts_cps', op: '>', v: 7000, label: 'Counts settled above 7,000 cps' },
                 { cmd: 'plot_1m_point', label: 'Point plotted' }],
          overtaken: SR_OVERTAKEN,
          hl: ['Withdraw', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Hold WITHDRAW at MED until SOURCE RANGE settles above 2.0e4, about 205 to 225 steps. Settle, press Plot point. Write down the position the panel predicts; this is the last point.',
          why: 'From here the remaining distance is short enough that creeping up in single steps beats trusting one more fitted number. Criticality arrives a little before the predicted position, on this plant between about 226 and 238 of 627.',
          control: 'Control Bank', target: 'SOURCE RANGE above 2.0e4 (20,000 counts a second); point 6 plotted',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 9, speed: 'normal' }, hold: 150,
          accs: [{ p: 'sr_counts_cps', op: '>', v: 20000, label: 'Counts settled above 20,000 cps' },
                 { cmd: 'plot_1m_point', label: 'Point plotted' }],
          overtaken: SR_OVERTAKEN,
          hl: ['Withdraw', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        /* SPELL IT OUT *(OWNER, 2026-09-03, #619 item 21: "uses acronym (SUR) without spelling
         * it out, ie. STARTUP RATE (SUR)")*. The pool now expands it at its first appearance in
         * a visible line (the 7,000-count step) and says "startup rate" in full everywhere else;
         * `cautions` already carried the expansion but a caution is not where a player meets a
         * term for the first time. */
        /* NO SPEED HINT FROM HERE TO THE POINT OF ADDING HEAT (layman playtest 2026-09-07, #653
         * S9): the auto hint offered 60x for this step's 400 s dwell, and at 60x REACTOR POWER
         * went 0.0 -> 3.4 % between two glances 2.5 s apart and 12.2 % before 1x could be
         * re-selected. `wait_hint: false` suppresses the generated line (ui/app.js). */
        /* USE THE PLOT *(OWNER, 2026-09-08, #660 item 8: "Step 10 should tell user to set rod
         * position to the critical position shown in the 1/m plot. Currently, there is nothing to
         * tell the user how to actually use the 1/m plot except plotting points.")*. MEASURED with
         * the panel's own last-three fit (ui/panels/one_over_m.js) on the replay's counts: the
         * prediction runs 264 -> 241 -> 217 -> 211 -> 213 over points 2..6 against a true critical
         * of 223 — high early, about ten steps LOW at the end. So "withdraw to the predicted
         * position" leaves the core just subcritical, and the creep on STARTUP RATE finishes it.
         * This supersedes the 2026-09-03 ruling that the approach carries no rod-position target:
         * the target is now the plot's, which is the plot's whole point. The replay's commands
         * (15 slow steps from 211) are unchanged; the acceptance is unchanged. */
        { text: 'Press SLOW and hold WITHDRAW until CONTROL ROD POSITION reaches the position the 1/M panel predicts, then release. From there tap WITHDRAW one step at a time and wait after each. Critical: the counts keep climbing and STARTUP RATE stays positive with the rods still.',
          note: 'The prediction reads about ten steps low at the end of the approach, so the reactor is not yet critical at that position. Stay at 1× from here until power settles near 1 %: at 60× the reactor can run from 0 to 10 % between two glances. If the reactor trips, the SCRAM button reads SCRAMMED / PRESS TO RESET; press it before the rods will move again.',
          why: 'Critical means the chain reaction sustains itself: power keeps rising with nothing pushing it. A positive STARTUP RATE with the rods still is the sign; it is made on the meters, not on the rod position. No single step is dramatic, but ten of them are; expect STARTUP RATE to peak near 0.9.',
          control: 'Control Bank', target: 'STARTUP RATE positive and steady with the rods stopped, at or under 1.0',
          wait_hint: false,
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 15, speed: 'slow' }, hold: 400,
          /* 0.1, not 0.02: the done-when renders at the tile's resolution, and 0.02 drew "When
           * Reactor power ≥ 0 %" beside a tile reading 0.0 — true of every plant, unmet for four
           * minutes (layman playtest pass 2, #653 S-5). 0.1 is the first digit the tile shows. */
          acc: { p: 'power_pct', op: '>', v: 0.1 },
          hl: ['Withdraw', 'Rod Speed — Slow', 'Startup Rate', 'Source Range'] },
        /* INSTRUMENTS, NOT TAPS *(OWNER, 2026-09-08, #660 item 11: "Tapping withdraw 2 more times is
         * not always the best approach. The user will usually overshoot at this point. These steps
         * should take an instruments based approach. Usually waiting is best here if startup rate
         * is high.")*. The replay's +2 slow steps stay as its command; the text tells the player to
         * read STARTUP RATE and add a step only when it has come back to zero. */
        { text: 'Let power climb on its own while STARTUP RATE is positive; do not add steps. Only if STARTUP RATE falls back to 0.00 with REACTOR POWER still below 0.5 %, tap WITHDRAW one step at SLOW and wait again. Watch INTER RANGE: SOURCE RANGE switches itself off above 1.0e5.',
          why: 'Just critical, a positive STARTUP RATE means reactivity is above zero and power climbs by factors of ten on its own; every extra step adds to a rise that is already under way, which is how the approach overshoots. Below about 1 % power nothing in the plant slows the climb for you, so STARTUP RATE is the only speedometer. SOURCE RANGE hands over to INTER RANGE by itself.',
          control: 'Control Bank', target: 'REACTOR POWER rising toward 1 %',
          note: 'About 15 plant-minutes at 1×. Stay at 1×: this is the part of the startup where the reactor can get away from you.',
          wait_hint: false,
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 2, speed: 'slow' }, hold: 900,
          saw: { p: 'startup_rate_dpm', op: '>', v: 0 },
          acc: { p: 'power_pct', op: '>', v: 0.5 },
          hl: ['Withdraw', 'Startup Rate', 'Intermediate Range'] },
        obs('Verify SOURCE RANGE has switched itself off and INTER RANGE is reading. Close the 1/M PLOT window with its ✕; its work is done.',
          { p: 'sr_energized', op: '<', v: 1 },
          null, ['Source Range', 'Intermediate Range'],
          'The SOURCE RANGE detectors would wear out if they stayed on at power, so this plant switches them off by itself once INTER RANGE is reading. There is no button for it; you are checking that it happened.'),
        { text: 'Press MED, then hold INSERT until REACTOR POWER stops rising and is below 5 %, then release. About 14 steps if power is near 1 %; more if it ran ahead. If it is already steady below 5 %, nothing to press.',
          why: 'Below about 1 % nothing in the plant holds power steady: every bit of extra reactivity you added has to come back out or power keeps climbing. Do it in one held drive, not taps, because the plant keeps running between taps.',
          control: 'Control Bank', target: 'REACTOR POWER steady, below 5 %',
          wait_hint: false,
          cmd: { action: 'rod_nudge', group_id: 'control', steps: -14, speed: 'normal' }, hold: 240,
          acc: { p: 'power_pct', op: '<', v: 5 },
          hl: ['Insert', 'Startup Rate', 'Intermediate Range'] },
        { text: 'Press SLOW, then hold WITHDRAW until REACTOR POWER passes 5 %, about 13 steps. That is Mode 1, At Power.',
          why: 'Mode 1 begins at 5 % power. Above about 1 % the warming water starts to hold power back, so from here the reactor settles instead of running away. The turbine is still off; the next step puts it on line so the heat has somewhere to go.',
          control: 'Control Bank', target: 'REACTOR POWER above 5 %, settling near 8 %',
          wait_hint: false,
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 13, speed: 'slow' }, hold: 400,
          acc: { p: 'power_pct', op: '>', v: 5 },
          hl: ['Withdraw', 'Startup Rate', 'Intermediate Range'] },
        { text: 'Press LATCH on the TURBINE-GENERATOR card, then set LOAD to 10 MWe.',
          why: 'LATCH resets the turbine so it can take steam; LOAD is how much electricity you ask the generator for. As the generator picks up load, the reactor follows it up to about 10 % by itself: more steam drawn cools the water, and cooler water raises power. The reactor following the turbine is the central idea of this whole plant.',
          control: 'Turbine Load', target: 'OUTPUT near 10 MWe',
          cmd: { action: 'set_load_target', mwe: 10 }, hold: 240,
          accs: [{ cmd: 'latch_turbine', label: 'Turbine latched' },
                 { p: 'mwe_output', op: '>', v: 8, label: 'Generator above 8 MWe' }],
          hl: ['Turbine Load', 'Main Breaker'] },
        { text: 'Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the IR HIGH FLUX row. Do this the moment REACTOR POWER is above 8 %: at 25 % this trip fires.',
          note: 'The plant refuses the press below 8 %. Above 8 %, do not wait: the reactor keeps climbing while the panel is open.',
          why: 'Two automatic shutdowns exist only to protect a startup: one at 25 % power, one at 35 %. Above 8 % they are no longer needed and would trip the reactor on the way up, so you switch them off one at a time. This one also clears a rod stop at 20 % that would otherwise freeze the withdrawal. Drop below 8 % and the plant switches them back on by itself.',
          control: 'Trip Blocks', target: 'IR HIGH FLUX lit on the TRIP BLOCKS panel',
          cmd: { action: 'set_trip_block', trip_id: 'ir_high', blocked: true }, hold: 10,
          hl: ['Trip Blocks'] },
        { text: 'On the TRIP BLOCKS panel press BLOCK on the PR HIGH (LOW SETPT) row, then press TRIP BLOCKS again to close the panel; it covers the rod buttons. This switches off the second startup shutdown, at 35 %.',
          why: 'Miss this one and the climb trips at 35 % instead of 25 %. Above 8 % the shutdown at 118 % power takes over the job of catching a runaway. Two separate presses on purpose: on a real board switching one off never quietly switches off the other.',
          control: 'Trip Blocks', target: 'PR HIGH (LOW SETPT) lit on the TRIP BLOCKS panel',
          cmd: { action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: true }, hold: 10,
          hl: ['Trip Blocks'] },
        obs('Verify Mode 1: REACTOR POWER near 10 %, OUTPUT near 10 MWe, IR HIGH FLUX and PR HIGH (LOW SETPT) both lit on the TRIP BLOCKS panel.',
          { p: 'plant_mode', op: '~', v: 1, tol: 0.1 },
          null, ['Tavg', 'Turbine Load', 'SG Level'],
          'The reactor is critical, the generator is carrying load, and both startup shutdowns are switched off. The next checklist is the climb to full power: rods lead, turbine follows.'),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor critical in Mode 1, At Power, OUTPUT 10 MWe, IR HIGH FLUX and PR HIGH (LOW SETPT) both switched off. Ready for the power ascension.',
    },
    {
      id: 'pwr_raise_power', category: 'power', manual_ref: 'PWR-N07', next: 'pwr_lower_power',
      title: 'Mode 1, At Power — power ascension to 100 %',
      purpose: 'Take the plant from low power to full power in stages. Rods lead, turbine follows: pull rods, raise LOAD to match, then trim AVG COOLANT TEMPERATURE back into its band. About 1 plant-hour.',
      from: 'low_power',
      prereq: ['Reactor critical: REACTOR POWER above 10 % (auto-checked).', 'Turbine on line: OUTPUT above 5 MWe (auto-checked).', 'IR HIGH FLUX and PR HIGH (LOW SETPT) both lit on the TRIP BLOCKS panel, from the startup checklist.'],
      precond: [
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor at power: REACTOR POWER above 10 %' },
        { p: 'mwe_output', op: '>', v: 5, text: 'Turbine on line: OUTPUT above 5 MWe' },
        /* the power presets boot the bank on its top stop (627), where every WITHDRAW in this leg
         * is a no-op and step 8's "not pinned" check can only be met by INSERTING (layman playtest
         * 2026-09-07, #653 S3/S4). A precondition warns; it never blocks. */
        { p: 'control_bank_steps', op: '<', v: 600, text: 'CONTROL ROD POSITION below 600 of 627: this checklist follows the startup checklist, not a power preset' },
      ],
      cautions: [
        'Keep the turbine on line for the whole climb. A tripped turbine trips the reactor the moment REACTOR POWER passes 50 %, and at 8 % if the condenser is gone as well. If the TURBINE-GENERATOR card reads TRIP, press LATCH and set LOAD again before pulling more rods.',
        'Pull rods before you raise LOAD, on every stage. Raising LOAD first drags AVG COOLANT TEMPERATURE below its band.',
        'Make the last pulls small. Above 103 % power the plant stops the rods, and at 118 % it trips the reactor. 100 MWe of LOAD lands REACTOR POWER near 101 %.',
        'The plant trips on TEMPERATURE before it trips on power (the OTΔT trip). If AVG COOLANT TEMPERATURE climbs past 590 °F, hold INSERT before you add more LOAD.',
        'Xenon, a neutron-absorbing gas, builds in the fuel for hours after each stage. Boron handles that; rods handle the next few minutes.',
      ],
      steps: [
        obs('Verify Mode 1, At Power: REACTOR POWER near 10 %, SG FEED AUTO, IR HIGH FLUX and PR HIGH (LOW SETPT) both lit on the TRIP BLOCKS panel.',
          /* THE OPENING CONFIRM NO LONGER GRADES ON THE TURBINE (#664, 2026-09-08). It used to
           * accept on `mwe_output > 5`, which is a dead end for the one player this leg most
           * needs to help: a turbine trip anywhere in the ascension leaves OUTPUT at 0.0 MWe and
           * an observation step cannot be acted on, so the checklist parked here for ever with
           * nothing to press. The turbine is now the NEXT step's subject, where it is an action.
           *
           * MODE 1, not `power_pct > 10`, and the difference is a MEASUREMENT: this step carries
           * no hold, so the replay grades it on the boot sample, and `low_power` boots at
           * 9.58 % — it settles through 10 % about 25 s later. A 10 % acceptance here reds the
           * gate on a plant that is doing nothing wrong. Mode 1, At Power is what "the plant the
           * startup hands over" actually means, it is true from the first broadcast, and the
           * 10 % row is already the leg's own precondition banner. */
          { p: 'plant_mode', op: '~', v: 1, tol: 0.1 },
          null, ['Turbine Load', 'SG Feed AUTO', 'Trip Blocks'],
          'This is the plant the startup hands over: critical, on the grid, feed holding level. Both startup shutdowns have to be switched off. With them on, the climb trips at 25 %, then 35 %.',
          { p: 'power_pct', op: '>', v: 40 }),
        /* THE TURBINE IS THE THING THAT IS MISSING AFTER A TRIP (#664, filed off #663's
         * measurement; OWNER RULING, 2026-09-08, on #663: "C — leave the logic as sourced; fix
         * the checklist gap").
         *
         * `latch_turbine` occurred EXACTLY ONCE in the whole pwr2 pool — the startup leg's 8 %
         * step — and the pwr2 pool has no post-trip leg at all (six legs: heatup, startup,
         * raise power, lower power, shutdown, cooldown; `pwr_post_trip` is the RETIRED plant's
         * pool only). So a player whose turbine trips during the ascension had no procedure
         * anywhere that puts it back, and the plant scrams them at 50 % on P-9, the reactor
         * trip on turbine trip (`Manuals/09` §3.0: "Above P-9 a turbine trip scrams the reactor
         * immediately"). MEASURED, full stack from `low_power`, rods lead / load follows to
         * 40.16 % and then the turbine tripped:
         *   left tripped  — power settles 24.2 % on the dumps, the player keeps pulling, and
         *                   the reactor trips `turbine_trip` at a peak of 49.19 % (t=2662 s)
         *   LATCH + LOAD  — the same climb runs through 50 % to 70.9 %, no trip
         *   LATCH ALONE   — identical: 40.14 % and 40.0 MWe are back 240 s after the press, and
         *                   the climb reaches 70.9 %. The trip takes the DELIVERED power away
         *                   and leaves the operator's latched demand where he put it (the house
         *                   idiom), so the step's whole action is the press. LOAD is in the text
         *                   for the player who arrives with it already at zero — a shutdown leg
         *                   UNLOADs before it scrams.
         *
         * WHY HERE AND NOT IN A POST-TRIP LEG. There is no pwr2 post-trip leg to put it in, and
         * building one is a larger job than this defect (it owes a manual chapter). This IS the
         * leg the recovering player opens — its own prerequisite already names "Turbine on line",
         * as a banner that blocks nothing — and it is where the source puts the act: WTSM 19.0
         * Plant Operations (ML11223A342) Appendix 19-1 step 21, "Accelerate the main turbine to
         * 1800 rpm, and then synchronize the generator and connect it to the grid", immediately
         * before step 22's "Increase generator load at the desired rate" and long before the
         * 50 % calorimetric at step 28/29. The corpus carries no post-trip recovery procedure at
         * all (`find_source 'post-?trip recovery|recovery from a reactor trip|restart after a
         * trip'` → 0 hits across 39 documents in 3 lanes), so the placement rests on the startup
         * sequence, which §19.5 says a shutdown reverses.
         *
         * BOTH ACCEPTANCES ARE THE EFFECT, not the write, and neither is a cmd-kind entry on
         * purpose: a cmd-kind entry latches only on the command (`_accsCmdWatch`), so on a plant
         * whose turbine is already on line — every ordinary run of this leg — the player would
         * have no reason to press LATCH and the step would soft-lock. Graded on the plant, it
         * checks itself off instantly when there is nothing to do and waits for the two presses
         * when there is. */
        { text: 'Check the TURBINE-GENERATOR card is on line: LATCH lit and OUTPUT above 8 MWe. If it reads TRIP, press LATCH — OUTPUT returns to the LOAD you last set. If OUTPUT stays at 0.0 MWe, set LOAD to 10 MWe.',
          note: 'A turbine trip at any point in this climb leaves the card reading TRIP and OUTPUT at 0.0 MWe. LATCH is refused while whatever tripped the turbine is still there, and the card names the reason.',
          why: 'A tripped turbine takes no steam, so LOAD does nothing and the heat you make goes to the steam dumps instead. The plant trips the reactor on a tripped turbine the moment REACTOR POWER passes 50 %, and at 8 % if the condenser is gone as well. Measured from 40 %: left tripped, the climb scrams at 49.2 %; put back on line, the same climb runs to 71 %.',
          control: 'Turbine Load', target: 'OUTPUT above 8 MWe',
          cmd: { action: 'latch_turbine' }, hold: 240,
          accs: [{ p: 'turbine_tripped', op: '<', v: 1, label: 'Turbine latched, TRIP not lit' },
                 { p: 'mwe_output', op: '>', v: 8, label: 'Generator above 8 MWe' }],
          hl: ['Turbine Load', 'Main Breaker'] },
        { text: 'On the BORON card set 660 and press Enter; press ON only if it is not already lit. The dilution runs in the background for the whole climb.',
          why: 'Every percent of power costs reactivity: the fuel heats up and the water thins out. Rods could pay for all of it but would end up deep in the core, so real plants dilute boron for the bulk and use rods for the fine trim. Dilution runs at about 3 ppm a minute, so it needs the whole climb to work.',
          control: 'Boron control', target: 'BORON reads 660 ppm, ON lit',
          wait_hint: 'The dilution keeps working between stages. Start it now.',
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
        { text: 'Press SAMPLE on the BORON card. The lab result appears in the BORON CHEM readout in about 30 plant-minutes.',
          why: 'There is no live boron meter in this control room, and a real one has none either. The number on the BORON card is what you asked for; SAMPLE is how you find out what is actually in the water. Draw it now and the result lands during the climb.',
          control: 'Boron control', target: 'sample drawn; BORON CHEM updates in about 30 plant-minutes',
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
        { text: 'Hold WITHDRAW at MED for about 30 steps, then set LOAD to 30 MWe. Then adjust the rods until AVG COOLANT TEMPERATURE is inside the green band on its tile, near 556 °F.',
          note: 'The green band is the temperature the plant is meant to hold at the power it is making. It rises with load, from 547 °F at no load to 578 °F at 100 %. Temperature below the band: withdraw. Above: insert. The plant trips on temperature (OTΔT) before it trips on power: keep AVG COOLANT TEMPERATURE under 590 °F on every stage.',
          why: 'Pulling rods first raises power and warms the water; raising LOAD then draws more steam and cools it back. Doing it in that order means the temperature is approached from above rather than dragged from below.',
          control: 'Control Bank', target: 'OUTPUT 30 MWe; AVG COOLANT TEMPERATURE inside its band',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 30, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 30 }, label: 'Load target set to 30 MWe' },
                 { p: 'mwe_output', op: '>', v: 28, label: 'Generator at 30 MWe' },
                 { p: 'power_pct', op: '>', v: 28, label: 'Reactor following, near 30 %' },
                 /* THE TEMPERATURE CHECK THESE STAGES NEVER HAD (layman playtest pass 2, #653 S-1/S-9):
                  * the four stages ticked on load and power alone while the player's coolant ran
                  * 581 -> 600 degF and tripped on OTdT at 93 %. Bounds are what the replay itself lands
                  * (measured: 569.7 / 575.8 / 579.0 / 578.8 degF at 30 / 50 / 75 / 90 MWe, untrimmed)
                  * plus ~3 degC — a ceiling under the trip, not the program band, which is the tile's. */
                 { p: 'tavg_c', op: '<', v: 302, label: 'AVG COOLANT TEMPERATURE below 576 °F (the band is near 556)' }],
          hl: ['Withdraw', 'Turbine Load', 'Tavg'] },
        { text: 'Hold WITHDRAW at MED for about 32 steps, set LOAD to 50 MWe, then adjust the rods until AVG COOLANT TEMPERATURE is inside its band, near 562 °F.',
          why: 'Same order as the last stage: rods, then LOAD, then trim. Halfway up, xenon is starting to build in the fuel. Boron takes care of that over the coming hours; rods take care of the next few minutes.',
          control: 'Control Bank', target: 'OUTPUT 50 MWe; AVG COOLANT TEMPERATURE inside its band',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 32, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 50 }, label: 'Load target set to 50 MWe' },
                 { p: 'mwe_output', op: '>', v: 48, label: 'Generator at 50 MWe' },
                 { p: 'power_pct', op: '>', v: 47, label: 'Reactor following, near 50 %' },
                 { p: 'tavg_c', op: '<', v: 306, label: 'AVG COOLANT TEMPERATURE below 583 °F (the band is near 562)' }],
          hl: ['Withdraw', 'Turbine Load', 'Tavg'] },
        { text: 'Hold WITHDRAW at MED for about 35 steps, set LOAD to 75 MWe, then adjust the rods until AVG COOLANT TEMPERATURE is inside its band, near 570 °F.',
          why: 'Three-quarter power. The band has climbed with the load, toward 578 °F at 100 %. If the temperature reads below the band, you led with LOAD instead of rods: pull more steps before you add more megawatts.',
          control: 'Control Bank', target: 'OUTPUT 75 MWe; AVG COOLANT TEMPERATURE inside its band',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 35, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 75 }, label: 'Load target set to 75 MWe' },
                 { p: 'mwe_output', op: '>', v: 72, label: 'Generator at 75 MWe' },
                 { p: 'power_pct', op: '>', v: 70, label: 'Reactor following, near 75 %' },
                 { p: 'tavg_c', op: '<', v: 307.5, label: 'AVG COOLANT TEMPERATURE below 585 °F (the band is near 570)' }],
          hl: ['Withdraw', 'Turbine Load', 'Tavg'] },
        { text: 'Hold WITHDRAW at MED for about 18 steps, set LOAD to 90 MWe, then adjust the rods until AVG COOLANT TEMPERATURE is inside its band, near 575 °F. Smaller pulls from here: above 103 % power the plant stops the rods.',
          note: 'If LOAD changes by itself, the plant ran the turbine back because the coolant was too hot. Hold INSERT until AVG COOLANT TEMPERATURE is back in its band, then set LOAD again.',
          why: 'Above 103 % power the plant refuses to move the rods, and at 118 % it trips the reactor. Overshoot is real on this plant: 100 MWe of LOAD lands REACTOR POWER near 101 %. Small pulls keep you clear of the stop.',
          control: 'Control Bank', target: 'OUTPUT 90 MWe; AVG COOLANT TEMPERATURE inside its band',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 18, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 90 }, label: 'Load target set to 90 MWe' },
                 { p: 'mwe_output', op: '>', v: 86, label: 'Generator at 90 MWe' },
                 { p: 'tavg_c', op: '<', v: 307.5, label: 'AVG COOLANT TEMPERATURE below 585 °F (the band is near 575)' }],
          hl: ['Withdraw', 'Turbine Load', 'Tavg'] },
        { text: 'Hold WITHDRAW at MED for about 9 steps, set LOAD to 100 MWe, then trim AVG COOLANT TEMPERATURE onto 578 °F.',
          why: 'A small pull, then the last 10 MWe of LOAD, then the trim. REACTOR POWER settles near 101 %. The control bank ends part-way out, because boron carried most of the reactivity the climb cost.',
          control: 'Control Bank', target: 'OUTPUT 100 MWe; AVG COOLANT TEMPERATURE 578 °F',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 9, speed: 'normal' }, hold: 900,
          accs: [{ cmd: { action: 'set_load_target', mwe: 100 }, label: 'Load target set to 100 MWe' },
                 { p: 'mwe_output', op: '>', v: 97, label: 'Generator at 100 MWe' },
                 { p: 'tavg_c', op: '~', v: 303.2, tol: 8, label: 'AVG COOLANT TEMPERATURE near 578 °F' },
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
                 { p: 'control_bank_steps', op: '>', v: 300, label: 'CONTROL ROD POSITION above 300' },
                 { p: 'control_bank_steps', op: '<', v: 600, label: 'CONTROL ROD POSITION below 600 (not on its top stop)' }],
          hl: ['Withdraw', 'Turbine Load', 'Tavg'] },
        obs('Verify full power: REACTOR POWER near 100 %, OUTPUT 100 MWe, AVG COOLANT TEMPERATURE near 578 °F, CONTROL ROD POSITION part-way out.',
          { p: 'power_pct', op: '>', v: 96 },
          null, ['Tavg', 'Turbine Load', 'SG Level'],
          'Full power, with almost no xenon in the fuel yet. Over the next hours xenon builds, and the plant settles into its long-term full-power state: less boron and the control bank near the top. The next step is how you get from here to there.'),
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
        obs('Over the next hours, lower the BORON setting in small steps toward 626 ppm as xenon builds, keeping AVG COOLANT TEMPERATURE in its band. The rods walk out as you do.',
          null,
          'The ROD LIMIT LO-LO alarm is lit and that is normal here: with no xenon yet, the control bank sits lower than it should for full power. It clears as xenon builds and you dilute.',
          ['Boron control', 'Control Bank', 'Tavg'],
          'Xenon is a neutron-absorbing gas that builds up in the fuel after power comes up and levels off over about two days. As it absorbs more neutrons, the plant needs less boron for the same power. Dilute as it builds and the control bank walks out toward the top, which is where a full-power plant runs.'),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Full power with almost no xenon: BORON 660 ppm and the control bank part-way out. Xenon then builds over the next hours and boron comes down toward 626 ppm, walking the bank out. The round trip back down starts with the load rampdown checklist.',
    },
    {
      id: 'pwr_lower_power', category: 'power', manual_ref: 'PWR-N08', next: 'pwr_shutdown',
      title: 'Mode 1, At Power — load rampdown to about 15 %',
      purpose: 'Bring the plant down from full power to low power in stages. Turbine leads, rods follow: lower LOAD, let the reactor follow it down, then insert rods so AVG COOLANT TEMPERATURE does not ride above its band. About 1 plant-hour.',
      from: 'hot_full_power',
      prereq: ['Reactor at power: REACTOR POWER above 10 % (auto-checked).', 'Turbine on line: OUTPUT above 5 MWe (auto-checked).', 'SG FEED in AUTO.'],
      precond: [
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor at power: REACTOR POWER above 10 %' },
        { p: 'mwe_output', op: '>', v: 5, text: 'Turbine on line: OUTPUT above 5 MWe' },
      ],
      cautions: [
        'Lower LOAD before you insert rods, on every stage. Dropping load leaves the reactor hot, and AVG COOLANT TEMPERATURE rides above its band until the rods bring it back.',
        'STEAM GENERATOR LEVEL dips the wrong way first on every load drop. Do not chase it; SG FEED in AUTO holds it.',
      ],
      steps: [
        { text: 'On the BORON card set 719 and press Enter; press ON only if it is not already lit. The boration runs in the background while you take the plant down.',
          why: 'Coming down is the climb in reverse. Every percent of power shed hands reactivity back (the fuel cools, the water thickens), and it has to go somewhere. Adding boron carries most of it out; rods trim the rest over the next few minutes.',
          control: 'Boron control', target: 'BORON reads 719 ppm, ON lit',
          wait_hint: 'The boration takes about half a plant-hour. Start it first and take the stages while it works.',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 719 }, hold: 30,
          hl: ['Boron', 'Boron control'] },
        { text: 'Set LOAD to 75 MWe and let REACTOR POWER come down. Then hold INSERT at MED until AVG COOLANT TEMPERATURE is back in the green band on its tile, about 40 steps.',
          note: 'The green band is the temperature the plant is meant to hold at the power it is making. It falls with load, from 578 °F at 100 % to 547 °F at no load. Temperature above the band: insert. Below: withdraw.',
          why: 'The reactor follows the turbine: less steam drawn means the heat has nowhere to go, the water warms, and warmer water walks power down by itself. But it settles hot until rods take the extra reactivity out.',
          control: 'Turbine Load', target: 'OUTPUT 75 MWe; AVG COOLANT TEMPERATURE inside its band',
          cmd: { action: 'set_load_target', mwe: 75 }, hold: 900,
          accs: [{ p: 'power_pct', op: '<', v: 90, label: 'Reactor following down' },
                 { p: 'tavg_c', op: '<', v: 305, label: 'AVG COOLANT TEMPERATURE below 581 °F' }],
          hl: ['Turbine Load', 'Insert', 'Tavg'] },
        { text: 'Set LOAD to 50 MWe, let power follow, then hold INSERT until AVG COOLANT TEMPERATURE is back in its band, about 20 steps.',
          why: 'Same order: LOAD first, then rods, so the temperature does not sit hot above its band. STEAM GENERATOR LEVEL dips before it recovers on each drop; that is normal, and SG FEED in AUTO handles it.',
          control: 'Turbine Load', target: 'OUTPUT 50 MWe; AVG COOLANT TEMPERATURE inside its band',
          cmd: { action: 'set_load_target', mwe: 50 }, hold: 720,
          accs: [{ p: 'power_pct', op: '<', v: 70, label: 'Reactor following through 70 %' }],
          hl: ['Turbine Load', 'Insert', 'Tavg'] },
        { text: 'Set LOAD to 30 MWe, let power follow, then hold INSERT until AVG COOLANT TEMPERATURE is back in its band, about 10 steps.',
          why: 'Lower power needs smaller rod moves. The band is walking back down toward 547 °F. A plant left hot at low load sends the difference to the condenser through the steam dump.',
          control: 'Turbine Load', target: 'OUTPUT 30 MWe; AVG COOLANT TEMPERATURE inside its band',
          cmd: { action: 'set_load_target', mwe: 30 }, hold: 600,
          accs: [{ p: 'power_pct', op: '<', v: 45, label: 'Reactor following through 45 %' }],
          hl: ['Turbine Load', 'Insert', 'Tavg'] },
        { text: 'Set LOAD to 15 MWe, let power follow, then hold INSERT until AVG COOLANT TEMPERATURE is back in its band, about 6 steps. Stop here; the shutdown checklist takes over.',
          why: 'Scramming from full power is a thermal shock to the plant. About 15 % is low enough that the trip is gentle and high enough that the steam generator still has steam to dump afterwards.',
          control: 'Turbine Load', target: 'OUTPUT 15 MWe; REACTOR POWER near 15 %',
          cmd: { action: 'set_load_target', mwe: 15 }, hold: 900,
          /* BAND RE-DERIVED (#508, 2026-09-06). It read v: 30 and the 547 degF re-anchor puts the
           * plant at 33.94 %. NOT a regression -- the old number was calibrated on the plant #508
           * fixed. MEASURED at the end of this step, one fixture, three trees:
           *                        557/flat    557/#633    547/#633 (shipping)
           *   condenser dumps       41.55 %     33.15 %      62.66 %
           *   ATMOSPHERIC DUMP      64.00 %     35.30 %       0.00 %   <- the defect itself
           *   Tavg                 569.84 degF 569.35 degF  563.85 degF
           *   steam pressure       1055 psig   1048 psig     974 psig
           *   reactor power         27.38 %     27.75 %      33.94 %
           * At 15 MWe the AS-BUILT plant sat with its ATMOSPHERIC DUMP VALVE 64 % OPEN, venting to
           * the sky, and this acceptance PASSED on it. Re-anchored, that valve is SHUT and the
           * condenser carries the heat; the plant runs 6.0 degF cooler, so moderator feedback holds
           * power 6.2 points higher. The rest of the ladder is `load_pct + 15`, and that 15 is
           * really the dump's capacity headroom (28 % of rated) -- so 40 sits inside the derived
           * form (load + 28 = 43) and clears all THREE measured behaviours by at least 6 points,
           * while a plant that failed to ramp down still reds near 100 %.
           *   SEPARATE, OWNER-VISIBLE, NOT FIXED HERE: Tavg ends this step 11.9 degF ABOVE the new
           *   program (it was 9.4 degF above the old one), so 'about 6 steps' of rod trim does not
           *   put Tavg on program and the dumps hold 62.66 % indefinitely. The trim sizing predates
           *   #508 and was ALREADY short; the re-anchor widened the gap by 2.5 degF. Re-deriving
           *   the trims is content work, not a threshold edit. */
          accs: [{ p: 'power_pct', op: '<', v: 40, label: 'Reactor below 40 % and falling as the boration finishes (rod trims take it to about 15 %)' }],
          hl: ['Turbine Load', 'Insert', 'Tavg'] },
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Plant stable near 15 % and 15 MWe, AVG COOLANT TEMPERATURE in its band. The shutdown checklist takes it to Mode 3.',
    },
    {
      id: 'pwr_shutdown', category: 'shutdown', manual_ref: 'PWR-N14', next: 'pwr_cooldown',
      title: 'Mode 1, At Power → Mode 3, Hot Standby — normal shutdown',
      purpose: 'Shut the reactor down from low power: take the load off the generator, scram the reactor, and check the steam dump is carrying the heat the fuel still makes. Under 10 plant-minutes.',
      from: 'hot_full_power',
      prereq: ['Reactor at low power, 10 to 20 %, with the turbine on line (auto-checked above 10 %).'],
      precond: [
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor at power: REACTOR POWER above 10 %' },
      ],
      cautions: ['The fuel keeps making heat for days after a scram and it cannot be switched off. The STEAM DUMP carries it until the cooldown checklist starts.'],
      steps: [
        { text: 'Set LOAD to 0 MWe and wait for OUTPUT to fall below 5 MWe.',
          why: 'Taking the load off the turbine first means the scram happens with no electricity on the generator. The reactor follows the falling steam demand down by itself.',
          control: 'Turbine Load', target: 'OUTPUT below 5 MWe',
          cmd: { action: 'set_load_target', mwe: 0 }, hold: 120,
          acc: { p: 'mwe_output', op: '<', v: 5 },
          hl: ['Turbine Load'] },
        { text: 'Press SCRAM on the ROD CONTROL card: once to arm it (PRESS TO ARM), then again to scram.',
          why: 'A planned scram from low power. Both rod banks drop into the core and the chain reaction stops in seconds. The fuel keeps making about 2 % of full power from radioactive decay, and that heat has to go somewhere; the next step checks where.',
          control: 'SCRAM', target: 'both rod positions 0 of 627; REACTOR POWER falling below 5 %',
          cmd: { action: 'scram' }, hold: 60,
          acc: { p: 'power_pct', op: '<', v: 5 },
          hl: ['SCRAM'] },
        /* THE DUMP'S MODE IS THE SHUTDOWN LEG'S TO SET (layman playtest pass 2, #653 S-11; the seam
         * pass 1 found as S2). After the scram the dump is still in 'tavg' mode from power and
         * carries nothing (measured: 0 % open); AUTO with the turbine tripped selects pressure
         * mode and it opens to ~13 % on the no-load setpoint. So the leg's last step presses it,
         * graded on the press AND on the valve carrying flow — and the tile reads FISSION power
         * (0.2 % after a scram), so the text no longer claims "near 2 %"; decay heat has no
         * readout on this board and the old `decay_heat_pct` acceptance drew a done-when nobody
         * could find. */
        { text: 'Press AUTO on the STEAM DUMP card until its status reads PRESS. Then check: REACTOR POWER below 1 %, STEAM PRESS holding near 1020 psi, the STEAM DUMP open a little.',
          why: 'The chain reaction is gone, but the fuel still makes about 2 % of full power from radioactive decay, and REACTOR POWER does not show it. With the turbine tripped, AUTO puts the steam dump into pressure-holding mode and it carries that heat to the condenser. Hot, at pressure, shut down: Mode 3, Hot Standby.',
          hold: 120,
          accs: [{ cmd: { action: 'set_steam_dump', mode: 'auto' }, label: 'STEAM DUMP AUTO pressed, status PRESS' },
                 { p: 'steam_dump_valve_pct', op: '>', v: 0.5, label: 'STEAM DUMP open, carrying the decay heat' },
                 { p: 'power_pct', op: '<', v: 1, label: 'REACTOR POWER below 1 %' }],
          hl: ['Steam Dump', 'Tavg'] },
      ],
      guard: { never_melted: true },
      outcome: 'Reactor shut down at Mode 3, Hot Standby; decay heat going to the steam dump. The cooldown checklist takes the plant to Mode 5.',
    },
    {
      id: 'pwr_cooldown', category: 'shutdown', manual_ref: 'PWR-N15', stack_only: true,
      title: 'Mode 3, Hot Standby → Mode 5, Cold Shutdown — controlled cooldown',
      purpose: 'Take a hot, shut-down plant from Mode 3, Hot Standby to Mode 5, Cold Shutdown, ending with residual heat removal (RHR) carrying the heat. About 7 plant-hours.',
      from: 'hot_zero_power',
      prereq: [
        'Plant at Mode 3, Hot Standby: AVG COOLANT TEMPERATURE near 547 °F, PRIMARY PRESSURE 2235 psi, reactor shut down (auto-checked).',
        'RCP FLOW on; SG FEED in AUTO.',
        'STEAM DUMP in AUTO: it is the heat sink until RHR takes over.',
      ],
      precond: [
        { p: 'tavg_c', op: '~', v: 286, tol: 8, text: 'Hot: AVG COOLANT TEMPERATURE between 533 and 561 °F' },
        { p: 'power_pct', op: '<', v: 1, text: 'Reactor shut down: REACTOR POWER 0 %' },
      ],
      cautions: [
        'Add boron before you cool anything. Cold water makes the chain reaction easier, so the plant needs more boron cold than hot.',
        'Do not exceed a cooldown rate of 100 °F per hour. Move the DUMP SETPOINT in stages, and control the RHR stage with HX FLOW.',
        'Close the accumulator valve while PRIMARY PRESSURE is between 1615 and 665 psi. Below 665 psi the tanks empty themselves into the plant.',
        'Below 1700 psi the SET PZR PRESSURE box cannot follow. From there pressure comes down on SPRAY with the HEATER off, and SUBCOOLING MARGIN is what it spends: watch that tile.',
        'Spray water fills the pressurizer. Keep SPRAY at 50 % and PRESSURIZER LEVEL below 80 %: a full pressurizer shuts the spray off by itself and pressure climbs back.',
      ],
      auto_channels: ['boron_conc'],
      steps: [
        { text: 'On the BORON card set 920 and press Enter; press ON only if it is not already lit. Do not start cooling until BORON STATUS reads BORATING.',
          why: 'Hot, the plant is comfortably shut down on about 719 ppm of boron. Cold water makes the chain reaction easier, and the same core at 122 °F needs about 920 ppm for the same margin. Adding it first means the margin arrives before the cold does.',
          control: 'Boron control', target: 'BORON reads 920 ppm, ON lit',
          wait_hint: 'The boration takes about 60 plant-minutes at 3 ppm a minute. Start it and carry on; the next steps run while it works.',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 920 }, hold: 3900,
          acc: { p: 'boron_ppm', op: '>', v: 880 },
          hl: ['Boron', 'Boron control'] },
        { text: 'Lower SET PZR PRESSURE to 1900 psi. Below 1972 psi the plant lets you switch off the protection in the next step.',
          why: 'Two automatic protections watch for falling pressure, because on a running plant falling pressure means a leak. They can only be switched off below 1972 psi, so the setpoint comes under that first. This is not the depressurization; it only unlocks the next step.',
          control: 'Pressure SP', target: 'PRIMARY PRESSURE below 1972 psi',
          cmd: { action: 'set_pressure_setpoint', mpa: 13.1 }, hold: 1500,
          ramp: [{ action: 'set_pressure_setpoint', arg: 'mpa', points: [15.41, 13.1] }],
          acc: { p: 'pressure_mpa', op: '<', v: 13.6 },
          hl: ['Pressure SP', 'Primary Pressure'] },
        { text: 'Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the PZR PRESS LO-LO row and BLOCK on the SI REACTOR TRIP row. Then press STOP on the ECCS card.',
          why: 'To the automatic protection, a cooldown looks exactly like a leak: pressure falling on a hot plant. Left on, the first cooling stage would trip the reactor and start the emergency injection pumps, flooding the plant with cold water you did not ask for. STOP on the ECCS card takes the injection pump out of standby as well.',
          control: 'Trip Blocks', target: 'PZR PRESS LO-LO and SI REACTOR TRIP lit on the TRIP BLOCKS panel; ECCS STOP lit',
          cmd: { action: 'set_trip_block', trip_id: 'lo_press', blocked: true }, hold: 30,
          accs: [{ cmd: { action: 'set_trip_block', trip_id: 'lo_press', blocked: true }, label: 'Low-pressure trip blocked' },
                 { cmd: { action: 'set_trip_block', trip_id: 'si_trip', blocked: true }, label: 'SI actuation blocked' }],
          hl: ['Trip Blocks'] },
        /* THE DUMP MUST BE IN PRESSURE MODE, AND THE CHAIN DOES NOT LEAVE IT THERE (layman playtest
         * 2026-09-07, #653 S2). `set_steam_dump auto` maps to 'pressure' only when the turbine is
         * tripped (pwr2_shell.js); a plant that arrives here from the shutdown leg was put in AUTO
         * at power, so its mode is still 'tavg' after the scram, and every DUMP SETPOINT stage is
         * inert. Measured (service, hot_full_power -> load 0 -> scram): mode 'tavg'; press AUTO
         * again -> 'pressure', and 640 psi then cools Tavg 287.7 -> 257.0 degC in 30 plant-minutes.
         * The leg's own hot_zero_power IC boots in 'pressure', which is why the replay never saw
         * it. The AUTO press is a cmd-kind entry so the live checklist needs the press; the
         * temperature acceptance moves into `accs` beside it (an `acc` is ignored when `accs`
         * exists — instructor_layer grades one or the other). */
        { text: 'Press AUTO on the STEAM DUMP card until its status reads PRESS. Then lower DUMP SETPOINT 50 psi at a time, from 1020 down to 120 psi, waiting each time until AVG COOLANT TEMPERATURE stops falling, about 5 plant-minutes. Done when it reads below 347 °F.',
          note: 'Small steps matter. Typing 640 straight in drops the coolant 50 °F in one plant-minute and empties the pressurizer; 50 psi every 5 minutes runs at about 85 °F per hour. If the Cooldown Rate High alarm comes on, wait longer between steps. In TAVG mode the setpoint does nothing. About two plant-hours in all; use the speed buttons at the top.',
          why: 'Steam pressure and steam temperature go together: lower the pressure the dump holds and the steam generator boils at a lower temperature, which pulls the reactor water down after it. It cannot pull the water below its own boiling point, so the walk goes all the way to 120 psi, about 341 °F, low enough for RHR to take over.',
          control: 'Dump SP', target: 'STEAM DUMP status PRESS; AVG COOLANT TEMPERATURE below 347 °F',
          wait_hint: true,
          cmd: { action: 'set_steam_dump_setpoint', mpa: 0.83 }, hold: 9600,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [7.03, 4.42, 2.76, 1.66, 0.83] }],
          saw: { p: 'tavg_c', op: '<', v: 250 },
          accs: [{ cmd: { action: 'set_steam_dump', mode: 'auto' }, label: 'STEAM DUMP AUTO pressed, status PRESS' },
                 { p: 'tavg_c', op: '<', v: 175, label: 'AVG COOLANT TEMPERATURE below 347 °F' }],
          hl: ['Dump SP', 'Steam Dump', 'Tavg'] },
        { text: 'Lower SET PZR PRESSURE to 1700 psi, as low as the box goes. From here pressure comes down by hand.',
          why: 'The setpoint box is the at-power pressure control and it stops at 1700 psi. A real cooldown leaves it exactly there: below it the heaters have nothing to hold, and the operator lowers pressure with the spray instead.',
          control: 'Pressure SP', target: 'SET PZR PRESSURE 1700 psi; PRIMARY PRESSURE below 1770 psi',
          cmd: { action: 'set_pressure_setpoint', mpa: 11.83 }, hold: 1500,
          ramp: [{ action: 'set_pressure_setpoint', arg: 'mpa', points: [13.1, 11.83] }],
          acc: { p: 'pressure_mpa', op: '<', v: 12.2 },
          hl: ['Pressure SP', 'Primary Pressure'] },
        /* 50 %, NOT 100 % (layman playtest pass 2, #653 S-3/S-8). The player's pressurizer went
         * SOLID on 100 % spray (level 48 -> 100 % in three plant-minutes, spray then shut itself
         * off, pressure bounced back UP through the accumulator window and latched the clock hold)
         * and pressure had run through the whole 1615 -> 665 window before the isolate step was
         * reached. Measured through the gate's own harness (procedures_harness, seed 42), the end of
         * the wait step: 100 % -> 154 psi with level 69 %, the window ~4.5 min; 50 % -> 233 psi with
         * level 66 %, the window over 5 min; 20 % -> 465 psi, too slow for the RHR step. The old
         * 100 % replay passed at 228 psi / 65 % from a 27 % start — the player started at 48 %
         * after the fast dump walk, and went solid. Accepted at 1615 psi, where the accumulator
         * valve regains power — the next step's own window. */
        /* TWO STEPS, GRADED ON STATE (#653 pass 3, S-5). The heater-off was a cmd-kind entry on
         * the spray step, and the evidence matcher latches only while the step is ACTIVE — the
         * player pressed OFF while the setpoint step was still ticking, the board showed OFF lit
         * and HTR PWR 0 %, and "○ Heaters OFF" stayed open until AUTO-then-OFF re-issued the
         * command inside the step. One action per step, the lamp as the acceptance. */
        { text: 'On the PRESSURIZER (PZR) card press OFF under HEATER.',
          why: 'The heaters go off before the spray comes on, or they boil water as fast as the spray condenses it and pressure goes nowhere. From here the setpoint box has nothing to hold; pressure comes down by hand.',
          control: 'Pressurizer Heaters (PZR)', target: 'OFF lit under HEATER',
          cmd: { action: 'set_heater', power_pct: 0 }, hold: 10,
          acc: { p: 'heater_auto', op: '<', v: 1 },
          hl: ['Pressurizer Heaters (PZR)'] },
        { text: 'Press MANUAL under SPRAY and set its box to 50 %, not more. Done when PRIMARY PRESSURE reads below 1615 psi.',
          note: 'Spray water goes into the pressurizer and PRESSURIZER LEVEL climbs as pressure falls. At 100 % a pressurizer that starts high fills completely, after which the spray shuts itself off. At 50 % pressure falls about 3 psi a second with room to spare.',
          why: 'Spray condenses steam in the pressurizer and pressure falls. SUBCOOLING MARGIN is how far the reactor water is below boiling; lowering pressure spends it, and it has to stay positive.',
          control: 'Pressurizer Spray (PZR)', target: 'SPRAY MANUAL at 50 %; PRIMARY PRESSURE below 1615 psi',
          cmd: { action: 'set_spray', open: true, pct: 50 }, hold: 240,
          acc: { p: 'pressure_mpa', op: '<', v: 11.14 },
          hl: ['Pressurizer Spray (PZR)', 'Pressurizer Heaters (PZR)', 'Primary Pressure'] },
        { text: 'Close the accumulator valve now: click the small valve symbol above and to the right of the ACCUMULATORS tile, beside ECCS FLOW (this step draws a green ring around it), while PRIMARY PRESSURE is between 1615 and 665 psi. At 50 % spray you have about 5 plant-minutes.',
          why: 'The same window as the heatup, in reverse. Above 1615 psi the valve has no power. Below 665 psi the nitrogen in the tanks pushes their water into the plant. Close it in between and the tanks stay full for the next heatup.',
          control: 'Accumulator valve', target: 'ACCUMULATORS tile reads ISOLATED and 100 %',
          cmd: { action: 'close_accumulator_valve' }, hold: 30,
          acc: { p: 'accumulator_valve_open', op: '<', v: 0.5 },
          hl: ['Accumulator valve'] },
        { text: 'Wait, with SPRAY still at 50 %, until PRIMARY PRESSURE falls below 413 psi, about 10 plant-minutes. If PRESSURIZER LEVEL climbs past 80 %, lower SPRAY. Do not switch the spray off yet.',
          why: 'ALIGN on the RHR card refuses to open the suction valve above 440 psi. Switch the spray off now and pressure bounces back over that number before you get there. SUBCOOLING MARGIN stays well above 100 °F on this spray.',
          control: '(observe)', target: 'PRIMARY PRESSURE below 413 psi with SPRAY still at 50 %; PRESSURIZER LEVEL below 80 %',
          hold: 1200,
          acc: { p: 'pressure_mpa', op: '<', v: 2.85 },
          hl: ['Primary Pressure', 'Pressurizer Spray (PZR)'] },
        { text: 'With the spray still on, press ALIGN on the RHR card, then set HX FLOW to 7 %.',
          why: 'RHR is the low-pressure cooling loop that carries heat out of a shut-down plant. ALIGN opens its suction valve, which the plant only allows below 440 psi. HX FLOW is how much of that loop goes through the heat exchanger; from here it is the cooldown throttle, and 7 % is a gentle start.',
          control: 'Residual Heat Removal (RHR)', target: 'ALIGN lit on the RHR card; HX FLOW 7 %',
          cmd: { action: 'set_rhr', active: true }, hold: 60,
          acc: { p: 'rhr_valve_open', op: '>', v: 0 },
          hl: ['Residual Heat Removal (RHR)', 'Primary Pressure'] },
        { text: 'Press OFF on the RCP FLOW card. Then, on the PRESSURIZER (PZR) card, press OFF under SPRAY.',
          why: 'With RHR circulating, the reactor coolant pumps are only adding heat now. The spray is driven by the pumps, so it does nothing once they stop; switching it off afterwards just tidies the lineup. With the pumps stopped the steam generator drops out of the picture.',
          control: 'RCP Run/Stop', target: 'RCP FLOW falling; SPRAY OFF lit',
          cmd: { action: 'set_rcp', running: false }, hold: 60,
          accs: [{ p: 'pump_flow_pct', op: '<', v: 50, label: 'Pumps coasting down' },
                 { cmd: { action: 'set_spray', open: false }, label: 'Spray shut' }],
          hl: ['RCP Run/Stop', 'Reactor Coolant Pumps (RCP)', 'Pressurizer Spray (PZR)'] },
        { text: 'Raise HX FLOW to 25 % and wait until AVG COOLANT TEMPERATURE reads below 199 °F. Keep the cooldown under 100 °F per hour: if it runs faster, lower HX FLOW.',
          why: 'HX FLOW is the cooldown rate now. 25 % reaches Mode 5 in about two plant-hours at close to 90 °F per hour, just inside the limit.',
          control: 'Residual Heat Removal (RHR)', target: 'AVG COOLANT TEMPERATURE below 199 °F',
          wait_hint: true,
          cmd: { action: 'set_rhr_hx', pct: 25 }, hold: 9000,
          ramp: [{ action: 'set_rhr_hx', arg: 'pct', points: [7, 16, 25] }],
          acc: { p: 'tavg_c', op: '<', v: 93 },
          hl: ['Residual Heat Removal (RHR)', 'Tavg'] },
        obs('Verify Cold Shutdown: AVG COOLANT TEMPERATURE below 199 °F, PRIMARY PRESSURE between 250 and 550 psi, RCP FLOW off, ALIGN lit on the RHR card.',
          { p: 'plant_mode', op: '~', v: 5, tol: 0.1 }, null, ['Tavg', 'Primary Pressure'],
          'This is the cold-shutdown picture: water below 199 °F, a small steam bubble still in the pressurizer, pumps off, RHR carrying the heat. It is the same state the Cold Shutdown preset loads, and the heatup checklist takes it back up.'),
        obs('Verify the ACCUMULATORS tile reads 100 % and ISOLATED.',
          { p: 'accumulator_volume_pct', op: '>', v: 99 }, null, ['Accumulator valve'],
          'You isolated the tanks on the way down so they would not empty into a depressurized plant. They have to still be full: the next heatup opens them again inside its window, and empty tanks then are a missing safety system.'),
        obs('Verify ALIGN is lit on the RHR card and HX FLOW is above 0 %. The round trip is complete.',
          { p: 'rhr_valve_open', op: '>', v: 0 }, null, ['Residual Heat Removal (RHR)'],
          'RHR is the only thing removing heat now. If its suction valve shut, the decay heat would have nowhere to go. The heatup checklist is the way back.'),
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
      outcome: 'Mode 5, Cold Shutdown: water below 199 °F, RHR carrying the plant, reactor coolant pumps off, accumulators full and isolated, boron at the cold concentration. This is the state the Cold Shutdown preset loads. The heatup checklist takes it back up.',
    },
    /* ============================ THE TMI-2 INCIDENT WALKTHROUGH (#670 Phase 2) ============
     * *(OWNER, 2026-09-08: "plan the building of a three mile island incident walkthrough…
     * These walkthroughs will include another element the last walkthroughs don't have, these
     * ones will automatically trigger failures behind the scenes.")*
     *
     * PLAN: Blueprint/TMI_WALKTHROUGH_PLAN.md (rulings R1-R4, 2026-09-08). CLOCKS: every
     * `story.clock` is NUREG/CR-1250 Vol. II Pt 2 (Rogovin) Appendix II.1, extracted with a
     * verbatim quote per row into inbox/tmi_timeline_sourced.md. 04:00:36 and 04:00:37 are the
     * appendix's own wall clocks; every other clock is DERIVED by adding its elapsed time to
     * 04:00:37. Long-form account and the sources: Manuals/08_ACCIDENT_TMI.md.
     *
     * EVERY PLANT NUMBER BELOW WAS RE-MEASURED FULL-STACK ON THE AUTHORED CLOCKS, 2026-09-09
     * (inbox/tmi_phase2/MEASURED.md; the plan's §8b list). Phase 0's ride used the retired
     * validation §86's minutes; these are the crew's. Nothing had to move: all seven crew
     * commands were ACCEPTED at their sourced second, `beyond_model` never latched in 1,558
     * samples, and the plant reaches 260 min alive.
     *
     * FIVE THINGS THE PLAN ASSUMED THAT MEASURED OTHERWISE — each is carried in the step it
     * belongs to and every one is a plant fact, not a wording choice:
     *
     *  1. THE PORV STICK MUST BE ARMED WITHIN 20 s OF THE FEED LOSS, so it is authored on
     *     step 2 with the feed loss and NOT on step 3 where the plan put it. Measured by arming
     *     at nine different seconds and reading the plant at t+300 s: armed at 0/2/5/10/15/20 s
     *     the valve is still open (1045 psia, level 100 %, the accident); armed at 30/45/60 s
     *     the valve had already reseated and the plant sits at 1985 psia with level 41 % — no
     *     accident at all. The valve lifts at 5.5 s and reseats near 25 s. Step 3 fires nothing.
     *  2. THE TAILPIPE NEVER EXCEEDS THE HOT LEG on this plant, so the plan's step-4 acceptance
     *     ("tailpipe > hot-leg temp") is unsatisfiable: 0 of 1,558 samples. It saturates at
     *     482 °F against a hot leg at 550-630 °F. Graded on an absolute instead — 240 °F, the
     *     sourced alarm point (App. II.1 E20, 239.2 °F), crossed at t+22 s against the report's
     *     30 s.
     *  3. LETDOWN IS ALREADY AT ITS HIGH LIMIT. `hot_full_power` boots with BOTH orifices in
     *     service (`control_state.letdown_orifice_a`/`_b` true) and the board's LETDOWN card
     *     offers nothing above A+B 7 %, so `set_letdown_orifices {a,b}` moves the flow 12.7 gpm
     *     -> 12.7 gpm. The crew's second action of 04:05 cannot be performed here; it is
     *     narrated in step 7 rather than faked (guide P1: never ask for a press that is already
     *     made).
     *  4. THIS BOARD HAS ONE REACTOR-COOLANT-PUMP HANDSWITCH (`sys.pumpTripped`, a single
     *     boolean), so the crew's two securings — loop B at 1 h 13 min, loop A at 1 h 41 min —
     *     are one press. Step 11 is that press, at loop B's clock, and carries the pair in its
     *     note; step 12 is the CONSEQUENCE at loop A's clock and carries no `crew` tag, because
     *     the tag is for a step that asks the player to repeat the crew's action and a
     *     verification asks for nothing.
     *  5. RCP FLOW IS USELESS AS THE SECURING'S ACCEPTANCE. It reads 16.4 % before the press
     *     and 16.3 % after (the void has already taken it), and only falls under 10 % at
     *     209 min. What changes at the press is the cavitation alarm, which clears on the next
     *     broadcast — so the step is graded on that plus the pressurizer level finally leaving
     *     the top of the scale, which is what makes the wait real.
     *
     * PREVIEW-ONLY *(plan R4, ruled)*: `site/flags.js` carries
     * `procedure:pwr_tmi2_incident: 'preview'` until a layman and an operator playthrough both
     * complete it (plan §10 phase 3). It is NOT part of the six-leg operating cycle and names
     * no `next`; `run_checklist_pwr2`'s chain check and `verify_ckl_relevance`'s CYCLE both
     * treat the incident category separately. */
    {
      id: 'pwr_tmi2_incident', category: 'incident', manual_ref: 'PWR-E08',
      title: 'Three Mile Island Unit 2, 28 March 1979 — the first four hours, as the crew lived them',
      purpose: 'Walk the first four hours of the Three Mile Island Unit 2 accident as the crew lived them: what their board showed, what they concluded, and what they then did. The failures arrive on their own. About four and a half plant-hours.',
      from: 'hot_full_power',
      prereq: [
        'Plant at Mode 1, At Power: REACTOR POWER near 100 % with the turbine on line (auto-checked).',
      ],
      precond: [
        { p: 'power_pct', op: '>', v: 90, text: 'Reactor at power: REACTOR POWER above 90 %' },
      ],
      cautions: [
        'Three steps are marked as the crew\'s own action. They are recorded history, not a procedure to follow.',
        'The failures in this walkthrough are fired by the walkthrough itself. Nothing in the Failures tab has to be pressed.',
        'The core is damaged in this run. Fuel damage, containment radiation and the hydrogen burn are outside this plant\'s model and are named in the last step.',
      ],
      steps: [
        /* 1 — 04:00. The setup, said out loud (plan §9 R3, ruled 2026-09-08). Measured:
         * power_range 99.88 % at boot, so the acceptance ticks at once. Manuals/08 §1. */
        { text: 'Verify the plant is at full power: REACTOR POWER near 100 % with the TURBINE-GENERATOR carrying load.',
          note: 'The failures in this walkthrough arrive on their own, on the step that needs them.',
          why: 'One protection channel is out of service before this begins: the reactor trip that fires when the turbine trips. With it defeated, pressure climbs far enough to open the relief valve before the reactor trips, which is the order that morning went in. The trip is real on this plant and is only defeated inside this walkthrough.',
          story: { clock: '04:00',
            saw: 'A routine night, eleven hours into a run near full power. Two men were clearing a blocked condensate polisher in the basement.',
            knew: 'Nothing was wrong with the reactor.',
            did: 'They carried on with the polisher.' },
          inject: [{ failure: 'anticipatory_trip_failure' }],
          acc: { p: 'power_pct', op: '>', v: 90 },
          hl: ['Turbine Load'] },
        /* 2 — 04:00:37, t = 0. App. II.1 E1-E4. THE PORV STICK IS ARMED HERE, not on step 3:
         * see trap 1 in the header. Measured: turbine_tripped at t+1 s, STEAM GENERATOR LEVEL
         * 65 % -> 52.2 % by t+32.5 s and 29.1 % by t+53 s, dry (1.5 %) at t+165 s.
         * Manuals/08 §2. */
        { text: 'Verify the turbine has tripped and the steam generators are drying out: TURBINE TRIP lit, STEAM GENERATOR LEVEL falling below 55 %.',
          why: 'Main feedwater has stopped, and with nothing carrying heat out of the steam generators the primary has nowhere to put it. The auxiliary feed pumps start by themselves, and on this plant their discharge valves are shut. Pressure now has one way out, the relief valve on top of the pressurizer.',
          /* THE SPIKE IS ALREADY OVER WHEN THIS STEP CHECKS OFF (#670 Phase 3, layman pass S-6).
           * Measured full-stack: PRIMARY PRESSURE peaks 2339 psi at t+5.5 s and reads 2095 psi
           * with a down arrow at t+35 s, where the acceptance is graded. The reviewer read
           * "watched pressure climb" against a falling gauge and a LOW PRESSURE alarm. */
          note: 'The spike is already over by the time this step checks off. Pressure peaks near 2340 psi about 6 seconds in and is back near 2095 psi and falling by 35 seconds — you have missed it, and missing it is what the next two steps are about.',
          story: { clock: '04:00:37',
            saw: 'The condensate pump tripped a second earlier and the main feed pumps followed. The turbine tripped with them and the alarms came in a wall.',
            knew: 'A feedwater transient, which they had drilled. The board said the auxiliary feed pumps had started.',
            did: 'They took the turbine trip and watched pressure climb.' },
          inject: [{ failure: 'loss_of_feedwater' }, { failure: 'afw_failure' },
                   { failure: 'stuck_porv_open' }, { failure: 'porv_indicator_stuck_closed' }],
          /* 45 s, not 35: the replay reads an `acc` at the step's END and the level was still
           * 56.5 % there — the harness lands the injections a broadcast earlier than the
           * measurement ride did, which is a second and a half of a 65 %-to-dry slide. Measured
           * at 45 s: 38 %. */
          hold: 45,
          accs: [{ p: 'turbine_tripped', op: '>', v: 0, label: 'TURBINE TRIP lit' },
                 { p: 'sg_level_pct', op: '<', v: 55, label: 'STEAM GENERATOR LEVEL below 55 %' }],
          hl: ['Turbine Load', 'SG Level'] },
        /* 3 — 04:00:40 / 04:00:45. App. II.1 E6 (PORV, 3 s, 2255 psig) and E7 (trip, 8 s,
         * 2355 psig). MEASURED HERE: the valve lifts at 5.5 s / 2340 psia and the reactor
         * trips at 52.5 s on `ot_delta_t` — the DECLARED DIVERGENCE, and it lives in the `why`
         * where the plan put it. Manuals/08 §2. */
        { text: 'Verify the reactor has tripped: REACTOR POWER collapsing and the REACTOR TRIP alarm in.',
          why: 'At Three Mile Island the relief valve opened at 3 seconds and the reactor tripped 5 seconds later on high pressure. On this plant the valve opens at 5 seconds and the trip comes near 53 seconds, on over-temperature difference rather than on pressure, because this relief valve is larger for the power it serves and turns the pressure first. The order of the two is the same and the gap between them is this plant.',
          story: { clock: '04:00:45',
            saw: 'Pressure spiked near 2255 psi and the relief valve opened as designed. Eight seconds in, the reactor tripped on high pressure.',
            knew: 'The plant was doing what a plant does after a feedwater trip.',
            did: 'They read the trip and moved to the post-trip checks.' },
          hold: 22,
          acc: { p: 'scrammed', op: '>', v: 0 },
          hl: ['SCRAM'] },
        /* 4 — 04:00:50 / 04:01:07. App. II.1 E12 ("Light 'off' indicates solenoid deenergized.
         * There is no actual position indicator.") and E20 (tailpipe alarm, 239.2 °F, 30 s).
         * MEASURED: 122 °F seated; crosses 240 °F at t+22 s, 300 °F at t+28 s, saturates 482 °F
         * and NEVER reaches the hot leg (trap 2 in the header). Manuals/08 §3. */
        { text: 'Verify the relief valve reading: the PORV light beside the pressurizer reads CLOSED, and the temperature under it is above 240 °F and climbing.',
          why: 'A seated relief valve leaves that pipe near 120 °F on this plant; a valve passing steam cooks it toward 480 °F, which is where it is heading. The light shows what the valve was told to do, not what the disc did, and this valve carries no position indicator. That one reading is the whole accident, and it was on the board the entire time.',
          story: { clock: '04:01:07',
            saw: 'The relief valve light went out at 13 seconds, which means the solenoid lost power. Thirty seconds in, the discharge line alarmed at 239 degrees.',
            knew: '"Light off indicates solenoid deenergized. There is no actual position indicator."',
            did: 'They read the hot pipe as leftover heat from the lift and moved on.' },
          hold: 28,
          acc: { p: 'porv_tailpipe_temp_c', op: '>', v: 115.56 },
          hl: ['Relief Valve (PORV)'] },
        /* 5 — 04:02:39. App. II.1 E31, ESF actuation on low RCS pressure (1600 psig).
         * MEASURED: hpi_active true at t+63 s. Manuals/08 §3. */
        { text: 'Verify safety injection has started by itself: the ECCS card shows the high-pressure pump running.',
          why: 'Primary pressure has fallen through the injection setpoint and the plant started the high-pressure pumps without being asked. Nothing is wrong with that: the plant is losing water through a valve nobody knows is open, and injection is the right answer to it. What comes next is the crew taking it away.',
          /* TWO BOARD READINGS THAT CONTRADICT THE STORY BLOCK AT THIS INSTANT (#670 Phase 3,
           * layman pass S-2 and S-3). Measured full-stack at the step's first tick:
           *   PRESSURIZER LEVEL 43.1 % and FALLING — 80.1 % at step 2's end, 75.4 % at step 3's,
           *   a minimum of 40.0 % 16 s into this step, back through 43 % at +29 s, 71.3 % at
           *   +90 s and pegged (>= 99 %) at t = 200 s. The crew's "climbing fast" is history and
           *   is four minutes early on this plant.
           *   ECCS FLOW 0 GPM while the pump reads running: `hpi_active` latches at t = 63.5 s at
           *   1658 psi, and the flow instrument stays EXACTLY zero for 23 s until pressure falls
           *   to 1393 psi at t = 86.5 s — the pump is deadheaded against its own 1389 psi
           *   discharge head, which the ECCS card prints as DISCG. Physical, and nothing said so. */
          note: 'Two things on the board will look wrong here and are not. PRESSURIZER LEVEL is still falling — about 43 % now, bottoming near 40 %, and it does not start its climb to the top of the scale for another minute. And ECCS FLOW reads 0 GPM with the pump running: it is pushing against a plant still above its own discharge pressure, and flow does not start until PRIMARY PRESSURE falls below about 1390 psi. Compare it with DISCG on the same card.',
          story: { clock: '04:02:39',
            saw: 'Pressure dropped through 1600 psi and the emergency injection started on its own.',
            knew: 'Pressurizer level was climbing fast at the same time, which their training said meant the system was filling.',
            did: 'They watched the level climb and prepared to stop the filling.' },
          hold: 30,
          acc: { p: 'hpi_active', op: '>', v: 0 },
          hl: ['ECCS', 'HPI/LPI'] },
        /* 6 — 04:03:50. App. II.1 E33, "ESF emergency injection bypassed by operator". THE
         * PLAN'S §8b QUESTION: is the block accepted at this clock? MEASURED YES — accepted at
         * 193 s (P-11 wants pressure below 1972 psig and the plant is at 1044 psia). The
         * `overtaken` is the permissive coming BACK: above 1972 psi the plant revokes the block
         * itself, which is the #641 shape for a cmd-kind acceptance. Manuals/08 §3. */
        { text: 'Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the SI REACTOR TRIP row.',
          crew: true,
          control: 'Trip Blocks', target: 'SI REACTOR TRIP lit on the TRIP BLOCKS panel',
          why: 'SI is safety injection, and the block is a permissive: the plant allows it only below 1972 psi — the pressure permissive the row calls P-11 — and takes it straight back if pressure returns above that. The row itself prints 1715 psi, which is a different number and not a mistake: that is where the safety-injection reactor trip fires, while 1972 psi is where the plant will let you block it. Blocking it stops the plant restarting injection by itself, which is the point of the press and the reason the next step works at all. Nothing on the board says the core has just been put on the operator alone.',
          note: 'The block is a request, not a switch. If pressure climbs back above 1972 psi the plant takes it away again. The TRIP BLOCKS panel stays open over the board until you press TRIP BLOCKS again.',
          story: { clock: '04:03:50',
            saw: 'Pressurizer level climbing hard while pressure fell.',
            knew: 'Level and pressure were saying opposite things, and level was the gauge they trusted.',
            did: 'They took the automatic injection out of service before touching a valve.' },
          hold: 70,
          accs: [{ cmd: { action: 'set_trip_block', trip_id: 'si_trip', blocked: true }, label: 'SI actuation blocked' }],
          overtaken: { p: 'pressure_mpa', op: '>', v: 13.596,   /* 1972 psi exactly — U2: the
           * same figure the step text, the note and the cooldown leg's own block step all use */
            label: 'too late to block: PRIMARY PRESSURE is back above 1972 psi',
            text: 'This step is overtaken: PRIMARY PRESSURE has come back above 1972 psi, where the plant takes the safety-injection block away by itself. Go on to the next step.',
            industry: 'SI BLOCK REVOKED — P-11 PERMISSIVE CLEARED ABOVE 1972 PSIG. STEP SKIPPED.' },
          hl: ['Trip Blocks'] },
        /* 7 — 04:05:07 (E35, throttle) + 04:05:29 (E37/§II.A, letdown to its high limit).
         * MEASURED: the stop is accepted at 198 s; the reset window opens at 125.5 s
         * (`RESET.delay_s = 60`, Phase 0 measurement 4). The letdown half is NARRATED — see
         * trap 3 in the header. Manuals/08 §3. */
        { text: 'Press STOP on the ECCS card to shut the high-pressure injection down.',
          crew: true,
          control: 'ECCS', target: 'the high-pressure pump stopped, with PRESSURIZER LEVEL still climbing',
          why: 'The level was rising because the water was boiling: steam under the pressurizer pushes water up into it, so the level goes up while the plant empties. Every operator of that era was trained that a solid pressurizer is the thing to avoid at all costs, so they throttled the one system putting water back. The gauge they trusted was the only one they had, because this plant carries no water-level instrument in the reactor vessel and neither did that one.',
          note: 'The plant refuses this press for about a minute after injection starts, while its reset timer runs. The crew also opened letdown to its high limit in the same breath; this board runs both letdown orifices at power already, so there is no higher setting to reach for.',
          story: { clock: '04:05:07',
            saw: 'Pressurizer level climbing toward the top of its scale, 255 inches and rising, with pressure falling at the same time.',
            knew: '"The condition to avoid at all costs is going solid." A pressurizer full of water leaves nowhere to control pressure from.',
            did: 'They throttled the injection valves, stopped a makeup pump and opened letdown to its high limit.' },
          cmd: { action: 'set_hpi', active: false }, hold: 90,
          acc: { p: 'hpi_active', op: '<', v: 1 },
          hl: ['ECCS', 'HPI/LPI'] },
        /* 8 — 04:06:28. App. II.1 E43, "Pressurizer level goes offscale high (greater than 400
         * inches)". MEASURED: pzr_level pegs at 100 % from t+205 s and holds it to 51.3 min.
         * Manuals/08 §3. */
        { text: 'Verify PRESSURIZER LEVEL has gone to the top of its scale and is sitting there.',
          why: 'The one gauge the crew had for how much water was in the plant now reads full while the plant empties. Level is not inventory: steam forming in the hot legs drives water up the surge line, so the pressurizer fills as the core loses water. This is the coupling the walkthrough exists to teach and it is on the board now.',
          /* THE VESSEL IS DRAWN FULL HERE AND THAT IS CORRECT (#670 Phase 3, layman pass S-8).
           * The reviewer read "the plant empties" against a vessel graphic full of water and
           * called it a defect. Measured at this step: core coolant inventory 95.7 % -> 93.9 %
           * and `core_uncovered_frac` exactly 0.0, so the graphic (which since #516 item 6 reads
           * core uncovery + hot-leg void, NOT the mass fraction) is right. It drains later:
           * 50 % uncovered at 35 plant-minutes, 94.3 % at 103. */
          note: 'The reactor vessel on the diagram is still drawn full, and that is right: the plant has lost about 6 % of its coolant here and none of the core is uncovered yet. The vessel empties later — half the core is uncovered near 35 plant-minutes and 94 % of it by the second hour.',
          story: { clock: '04:06:28',
            saw: 'The level indicator went off the top of its scale, past 400 inches.',
            knew: 'Their training said the only credible check on how much coolant was in the system was the pressurizer level.',
            did: 'They kept letdown wide open and injection off, working to bring the level back down.' },
          hold: 62,
          acc: { p: 'pzr_level_pct', op: '>=', v: 99 },
          hl: ['Plant Pressure'] },
        /* 9 — 04:06:27 (E42, saturation) and 04:10:37 (E56, first RCP high-vibration alarm,
         * "Indication of voids in system. Apparently not recognized."). MEASURED: the board
         * margin reaches 0 at t+165 s and `rcp_cavitating` latches at t+155 s — so BOTH CUES
         * STAND FROM 2.6 MINUTES, which is the 71-minute wait the `why` has to carry rather
         * than presenting them as fresh. Manuals/08 §4. */
        { text: 'Verify SUBCOOLING MARGIN has reached zero and the pump cavitation alarm is in.',
          why: 'Subcooling margin is how far the water is from boiling, and at zero it is not a margin any more. The pumps are pushing a froth of steam and water, which is what the vibration is; this board alarms it as Reactor Coolant Pump Cavitation. Both cues stand from about two and a half minutes into the accident and they stay up for the next hour.',
          /* THE CLOCK RUNS FORWARD (#670 Phase 3, layman pass S-7). This step was dated 04:10:37
           * on App. II.1 E56, the first pump high-vibration alarm, and the NEXT step is dated
           * 04:08:37 on the sourced auxiliary-feed discovery at 8 minutes — so the story clock
           * went BACKWARDS two minutes between steps 9 and 10 and the reviewer lost confidence in
           * it for the rest of the run. The steps are not reordered (`test/manual_ui_map.js`'s
           * STEP_UI table is positional, and putting the saturation reveal after a 65-minute ride
           * would wreck the teaching order); instead this step takes the SATURATION cue's own
           * clock, E42 at 04:06:27, rounded to step 8's 04:06:28 because the two are one second
           * apart in the source and are two readings of the same instant. E56 is now named in the
           * `saw` as arriving four minutes later, which is what it did. */
          story: { clock: '04:06:28',
            saw: 'The coolant reached saturation — nothing left between it and boiling — and four minutes later, ten minutes in, the first reactor coolant pump high-vibration alarm came in.',
            knew: '"Indication of voids in system. Apparently not recognized."',
            did: 'They left the pumps running.' },
          hold: 130,
          /* 1 °F, NOT 0, and it is a bifurcation not a rounding (the standing #543 trap). The
           * plant sits AT saturation here for the next fifty minutes: true subcooling reads
           * exactly 0.00 and the board's derived margin hovers -0.2 to +0.3 °F on the two
           * lagged channels it is built from. `<= 0` passes or fails on the last bit, and the
           * replay grades the true value where the runtime grades the instrument, so the two
           * would not even flip together. */
          accs: [{ p: 'subcooling_c', op: '<=', v: 0.56, label: 'SUBCOOLING MARGIN at or below 1 °F' },
                 { p: 'rcp_cavitating', op: '>', v: 0, label: 'the pump cavitation alarm is standing' }] },
        /* 10 — 04:08:37. App. II.1 E49/E50. MEASURED: the player's own valve takes AFW flow
         * 0.000 -> 1.000 within 5 s, and the dry generators show level again about 9 plant-min
         * later (STEAM GENERATOR LEVEL 0 % at 8 min, 6 % at 17 min, 37 % at 73 min). Graded on
         * the LEVEL, not the flow: the level-hold automation channel throttles auxiliary feed
         * to 0.02-0.30 of rated for the rest of the ride, so a flow threshold asserted at the
         * step's end is a coin toss. THE HOLD IS THE 65-MINUTE RIDE to step 11's clock — a
         * step's `cmd` is issued at step START, so the wait belongs to the step BEFORE the one
         * that acts. Manuals/08 §4. */
        { text: 'Open the auxiliary feedwater block valves: click the valve symbol directly above the AFW card.',
          control: 'AFW', target: 'STEAM GENERATOR LEVEL back above 5 %, climbing off zero',
          why: 'The auxiliary pumps have been running eight minutes into shut valves, delivering nothing. Opening them puts the heat sink back: flow reaches its rated value within 30 seconds and the dry generators take about 9 plant-minutes to show level again. The report on this accident concluded the eight-minute delay did not change the outcome, and that what it did cost was the operators\' attention.',
          note: 'One symbol here, two valves: this board carries a single auxiliary-feed discharge valve and one click opens both of the crew\'s. Level takes about 9 plant-minutes to come off zero, because both generators are dry. A new alarm, or a step checking off, drops the clock back to real time.',
          wait_hint: 'The relief valve is still open the whole way. The plant takes 600× here and holds it for most of the hour; if it drops back to 60× on a pressure swing, press 600× again.',
          story: { clock: '04:08:37',
            saw: 'Low generator level, low steam pressure and high auxiliary feed discharge pressure — three cues to a blocked line.',
            knew: 'The auxiliary pumps were running. Nobody had checked whether the water was getting past the valves.',
            did: 'An operator found the two block valves shut and opened them.' },
          cmd: { action: 'set_afw_block', open: true }, hold: 3900,
          acc: { p: 'sg_level_pct', op: '>', v: 5 },
          hl: ['AFW'] },
        /* 11 — 05:13:37. App. II.1 E99 (loop B) and E111 (loop A, 1 h 41 min). ONE HANDSWITCH
         * on this board — trap 4 in the header. MEASURED: `rcp_cavitating` clears on the next
         * broadcast after the press (4380 -> 4381 s); RCP FLOW does NOT move (16.4 % -> 16.3 %,
         * trap 5), so it is not the acceptance. PRESSURIZER LEVEL leaves 99.5 % at 51.3 min and
         * is below 80 % near 65 min, 72 % at this step's own clock — that entry is what makes
         * the player wait rather than securing the pumps at ten minutes. Manuals/08 §4. */
        { text: 'Press OFF on the reactor coolant pumps to secure them.',
          crew: true,
          control: 'RCP Run/Stop', target: 'the pump cavitation alarm clears',
          why: 'The pumps have been shaking for over an hour because they are pumping steam as much as water, and the loss of suction head is what the vibration is telling them. Securing them is the right answer to a cavitating pump and it also removes the only thing stirring the core. Circulation falls away almost completely afterwards, because the steam in the loops blocks natural circulation.',
          note: 'This board carries one handswitch for the reactor coolant pumps. The crew stopped the loop B pumps at 1 hour 13 minutes and the loop A pumps 28 minutes later; one press here does both.',
          wait_hint: 'PRESSURIZER LEVEL comes off the top of its scale near 65 plant-minutes. That is the reading to wait for before securing the pumps.',
          story: { clock: '05:13:37',
            saw: 'Rising vibration on the loop B pumps, with flow and amperage falling away.',
            knew: '"Further operation could cause severe damage." The pumps had been running without suction head for an hour.',
            did: 'They stopped the loop B pumps, and the loop A pumps 28 minutes later.' },
          cmd: { action: 'set_rcp', running: false }, hold: 1680,
          accs: [{ p: 'pzr_level_pct', op: '<', v: 80, label: 'PRESSURIZER LEVEL below 80 %, off the top of the scale at last' },
                 { p: 'rcp_cavitating', op: '<', v: 1, label: 'the pump cavitation alarm clears' }],
          hl: ['RCP Run/Stop'] },
        /* 12 — 05:41:37, loop A's clock (E111) and §II.A's "circulation of coolant decreased
         * drastically, because natural circulation was blocked by steam". A VERIFY, and it
         * carries no `crew` tag — see trap 4. MEASURED: PRESSURIZER LEVEL crosses 50 % at
         * 94.9 min (72 % at 73 min, 45 % at 101 min), so this is the deception reversing.
         * Manuals/08 §4. */
        { text: 'Verify PRESSURIZER LEVEL is falling: below 50 % and still going down.',
          why: 'The gauge that read full for 48 minutes is falling now, and nothing has been put right — the plant is simply too empty to hold the pressurizer up any longer. With the pumps off there is no forced flow, and steam in the loops blocks natural circulation as well. From here the core boils and uncovers with the relief valve still open.',
          story: { clock: '05:41:37',
            saw: 'All four pumps off, and the loops going quiet.',
            knew: 'They believed the system was full, because the pressurizer had said so for the better part of an hour.',
            did: 'They kept feeding the steam generators and waited for a picture that made sense.' },
          hold: 1800,
          acc: { p: 'pzr_level_pct', op: '<', v: 50 } },
        /* 13 — 06:11:37. App. II.1 E119, "Loop A hot-leg temperature offscale high… TAVE will
         * not be correctly shown." THIS PLANT'S HOT LEG NEVER PEGS (0-400 °C detector, whole-ride
         * peak 632 °F), so the pegged instrument here is the SUBCOOLING MARGIN, clipped at
         * -50.4 °F. MEASURED full-stack on the authored clocks: on the floor from 56.8 min to
         * 140.7 min, 504 of 1,558 samples. Manuals/08 §4. */
        { text: 'Verify SUBCOOLING MARGIN is pegged on the bottom of its scale at -50 °F.',
          why: 'This tile stops at -50 °F: the coolant is further past boiling than the instrument can show. At Three Mile Island the same fact arrived as the loop A hot leg going off the top of its own scale, which this plant cannot reproduce, because its detector reads to 752 °F and the hot leg peaks 120 degrees below that. The pegged number carries the same message — the instrument has run out of scale and the core is uncovering.',
          note: 'The margin reaches this floor near 57 plant-minutes and sits on it until the relief line is isolated.',
          story: { clock: '06:11:37',
            saw: 'The loop A hot leg read off the top of its scale, so the average coolant temperature could not be shown correctly.',
            knew: 'Instruments were reading past their limits and the printer was hours behind.',
            did: 'They went on treating pressurizer level as the measure of how much water was in the plant.' },
          hold: 420,
          acc: { p: 'subcooling_c', op: '<=', v: -27.778 } },
        /* 14 — 06:18:37. App. II.1 E122/E124 and Vol I p. 31 (Mehler). MEASURED: the close is
         * accepted at 8280 s; PRIMARY PRESSURE 647 -> 758 psia within 2 plant-min (above 750 at
         * 139.8 min), the tailpipe falls under 400 °F near 141 min and under 300 °F at 145.6 min,
         * and the subcooling margin leaves its floor at 140.9 min. THE HOLD RUNS TO STEP 15's
         * CLOCK (62 plant-min). The reopen/reclose cycles through 07:56 are NARRATED, per the
         * plan's recommendation — one closing, at 2 h 18 min. Manuals/08 §5. */
        /* ONE CLICK, AND THE SYMBOL IS LEFT OF THE PORV, NOT ABOVE IT (#670 Phase 3, layman pass
         * S-1 — the pass's one BLOCKING stuck point, ~11 of its 55 minutes). This step used to
         * read "click the block valve symbol above the relief valve, then confirm", and BOTH
         * halves were wrong:
         *   1. THERE IS NO CONFIRM. `comp_valve_vertical`'s hit circle emits a plain
         *      `onControl('toggle', st.openFrac < 0.5 ? 1 : 0)`; the only two-press confirms on
         *      this board are SCRAM (`pwr_board.js` paintScram) and a TRIP BLOCKS row that would
         *      trip the plant on release (#598 item 15). Measured headless on the real page, with
         *      the shell's `handleCommand` instrumented: one click emits `close_block_valve` and
         *      the valve SHUTS; a second click emits `open_block_valve` and it OPENS AGAIN. Ten
         *      clicks 0.4 s apart with the pointer never leaving the symbol gave ten commands,
         *      SHUT OPEN SHUT OPEN … — so a player who does what "then confirm" says undoes the
         *      only correct move of the morning. The reviewer's own re-measure (that a press is
         *      swallowed unless the pointer re-enters the symbol) is REFUTED: with a move away
         *      and back between the presses the result is identical.
         *   2. "ABOVE" IS THE WRONG DIRECTION. `pwr_board_data.js`: the block valve is at
         *      (825, 230) 40x40, the PORV at (905, 185) 30x65 — left of it and slightly below.
         *      It is upstream in the flow, which is presumably what "above" was reaching for. */
        { text: 'Close the PORV block valve: one click on the small valve symbol just left of the PORV.',
          control: 'PORV Block Valve', target: 'PRIMARY PRESSURE rising above 750 psi and the tailpipe temperature falling',
          why: 'This is the first correct move of the morning and it takes 2 hours 18 minutes to arrive. Closing the block valve isolates the relief line whether or not the relief valve is shut, and the loss stops: pressure turns upward within 2 plant-minutes and the discharge pipe starts cooling. The man who did it had just walked in and asked why the relief line was hotter than the safety valve lines.',
          /* THE REOPEN/RECLOSE RECORD, CORRECTED (#670 Phase 3). This note said the crew "shut it
           * again three more times through 07:56", which the sourced sequence does not support:
           * shut 06:18, reopened 07:12, shut near 07:27-07:30, reopened 07:41 — and 07:56 is a
           * SAFETY INJECTION ACTUATION, not a closure. */
          note: 'One click shuts this valve and a second click opens it again, so click once. The crew reopened it at 3 hours 12 minutes, shut it again near 3 hours 27 minutes and reopened it at 3 hours 41 minutes; the 07:56 event was a safety injection actuation, not another closure. This walkthrough closes it once and tells the rest.',
          wait_hint: 'Watch the tailpipe temperature come down. This hour is the quietest of the run and the plant holds 600× right through it.',
          story: { clock: '06:18:37',
            saw: 'The relief line discharge running about 30 degrees hotter than the safety valve discharge lines.',
            knew: 'A relieving shift supervisor set the pressurizer level aside and read the temperatures instead. His conclusion was that the relief valve was leaking.',
            did: 'He ordered the block valve shut, and pressure began to rise within minutes.' },
          cmd: { action: 'close_block_valve' }, hold: 3720,
          accs: [{ p: 'pressure_mpa', op: '>', v: 5.17, label: 'PRIMARY PRESSURE above 750 psi' },
                 { p: 'porv_tailpipe_temp_c', op: '<', v: 204.44, label: 'PORV tailpipe temperature below 400 °F' }],
          hl: ['PORV Block Valve'] },
        /* 15 — 07:20:37. App. II.1 E167; NOT SUSTAINED historically (E172 reset at 3 h 27 min,
         * E178 pump stopped at 3 h 37 min, on the borated-water-tank low alarm — §II.A p. 30).
         * MEASURED: accepted at 12000 s; SUBCOOLING MARGIN back above 0 near 220 min and above
         * 10 °F at 222 min, reaching +25.7 °F at 260 min; inventory 19.6 % -> 81.1 %.
         * Manuals/08 §5. */
        { text: 'Press START on the ECCS card to put high-pressure injection back in.',
          control: 'ECCS', target: 'SUBCOOLING MARGIN back above 10 °F',
          why: 'Injection is the only thing that puts water back, and the margin is what says whether it is working: it leaves its floor within minutes and climbs back through zero about 22 plant-minutes later. The crew did not sustain it — the borated water tank alarmed low, so they rationed injection and stopped the pump again 17 minutes after starting it. Here it stays in, and the coolant becomes water again.',
          wait_hint: 'The margin takes about 22 plant-minutes to climb back through zero. Watch SUBCOOLING MARGIN, not the pressure. Refilling a hot plant swings pressure hard, so 600× will drop back to 60× partway through — press it again when it does.',
          story: { clock: '07:20:37',
            saw: 'Pressure low enough to justify starting the emergency systems by hand.',
            knew: 'The tank the injection water comes from had alarmed low, so injection felt like something to spend carefully.',
            did: 'They started a makeup pump, and stopped it again 17 minutes later.' },
          cmd: { action: 'set_hpi', active: true }, hold: 3600,
          acc: { p: 'subcooling_c', op: '>', v: 5.56 },
          hl: ['ECCS', 'HPI/LPI'] },
        /* 16 — the epilogue, on the sourced 19:50:37 restart (App. II.1 E347, "Adequate core
         * cooling now has been established"). MEASURED: the restart is ACCEPTED at 260 min and
         * RCP FLOW goes 0.0 % -> 96.2 % within 36 s; inventory 81 % -> 92 % and the margin
         * +23 -> +33 °F over the next 6 plant-minutes. THE DECLARED GAP (plan §2, R2 ruled) is
         * in the `why`: measured peak fuel temperature this ride is 1297 °F and the core reaches
         * 94 % uncovered without the cladding heating as a real one did. Manuals/08 §6. */
        { text: 'Press ON for the reactor coolant pumps to restore forced circulation.',
          control: 'RCP Run/Stop', target: 'RCP FLOW back above 80 %',
          why: 'Forced flow returns within 40 seconds and the margin and the inventory recover with it, which is where this plant ends the story. What it cannot show is the rest: fuel damage, the radiation alarms at 2 hours 45 minutes and the hydrogen burn at 9 hours 50 minutes are outside this model and are told here rather than run. The size of that gap is on the fuel temperature: uncovering 94 % of this core never gets the fuel hotter than it runs at full power — 1130 °F at its worst, against 1298 °F before the trip — where the real one went far past 2500 °F.',
          note: 'Core damage, containment radiation and the hydrogen burn are not modelled on this plant. Everything up to this step was.',
          story: { clock: '19:50:37',
            saw: 'Nearly sixteen hours in, a pump started and ran satisfactorily. Core cooling was established.',
            knew: 'Almost nothing about the state of the core. The instrument that would have told them did not exist.',
            did: 'They kept the pump running. "All will grope in bewilderment for another whole day before the truth strikes."' },
          cmd: { action: 'set_rcp', running: true }, hold: 400,
          acc: { p: 'pump_flow_pct', op: '>', v: 80 },
          hl: ['RCP Run/Stop'] },
      ],
      guard: { never_melted: true },
      /* THE 1297 °F WAS THE FULL-POWER FUEL TEMPERATURE, NOT AN ACCIDENT PEAK (#670 Phase 3).
       * The figure came from a whole-ride maximum of `fuel_temp_c`, and this walkthrough STARTS at
       * 100 % power — so the peak it found was t = 0. Measured full-stack: 1298 °F at t = 0 with
       * the plant on line, and a post-trip maximum of 1130 °F (clad 1126 °F) at t = 13,772 s,
       * while injection refloods the core. Core uncovery peaks at 94.3 % and coolant inventory
       * bottoms at 7.4 %, so the uncovery half of the sentence stands. */
      outcome: 'Injection restored, forced circulation back and the relief line isolated. At its worst 94 % of the core was uncovered — and the fuel still never got hotter than it runs at full power, 1130 °F against 1298 °F on line before the trip. The real one went far past 2500 °F, and this plant stops short of it by design.',
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

 