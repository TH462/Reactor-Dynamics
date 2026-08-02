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
 * Step: { text, control, target, cmd, hold, acc, saw, note, ramp }
 *   text    integrated-voice instruction     control  on-screen control to use
 *   target  the value/limit to drive to      cmd      command issued (rod group 'control'/'shutdown' resolved)
 *   hold    seconds to run after the command  acc      {p,op,v[,tol]} checked at END of the step
 *   saw     {p,op,v} true at least once during the step   note  caution / what to watch
 *   ramp    [{action, arg, points:[…]}] — a setpoint WALKED along a polyline across
 *           `hold` instead of stepped once: the operator holding the ▼ on a setpoint
 *           box, not typing one number (#310, first used by PWR-N15's cooldown legs).
 *           When present the step's `cmd` is NOT issued — `cmd` stays as the
 *           REPRESENTATIVE action the instructor watches for, and the ramp is what
 *           drives the plant. Replay-side only: the live checklist never issues `cmd`
 *           either (ui/app.js renders text + highlights and grades off `acc`), so a
 *           ramp costs the UI nothing. Both procedure gates implement it.
 * guard: { never_melted, never:[{p,op,v}] } checked across the whole run.
 * op ∈ >,<,>=,<=,~ (~ within tol of v).
 */
;(function (RD) {
  'use strict';

  // Reusable observation step (no command). `hl` = control/indication labels the UI
  // glows when the step is hovered in the live checklist (ui/app.js glowLabels).
  function obs(text, acc, note, hl) { return { text: text, acc: acc || null, note: note || null, hl: hl || null }; }

  // ---- PWR -----------------------------------------------------------------
  var PWR = [
    // PWR-N01 — commercial pump-heat heatup. Measured full-stack (cold_shutdown
    // IC, default lineup): settles 567.0 °F (297.2 °C) at ~11.3 plant-h, ρ ≈ −2828
    // pcm, zero rod motion. The old nuclear-from-cold heatup path was removed —
    // not a commercial NOP (heatup is subcritical; approach is hot, N03).
    {
      id: 'pwr_heatup', category: 'startup', manual_ref: 'PWR-N01',
      title: 'Mode 5, Cold Shutdown → Mode 3, Hot Standby — plant heatup (pump heat)',
      purpose: 'Take the plant from Mode 5, Cold Shutdown to Mode 3, Hot Standby on reactor-coolant-pump heat alone: start the RCPs, pressurize to NOP, bottle the steam generator, re-align the SI accumulators, and ride temperature up with the reactor never critical. This is the commercial heatup and what mission "The Big Warm-Up" drives.',
      from: 'cold_shutdown',
      prereq: ['Plant in Mode 5, Cold Shutdown: cold (~122 °F / 50 °C), depressurized (~363 psi / 2.5 MPa), subcritical, RHR in service.', 'RCPs available to start (heat source).'],
      cautions: [
        'Rates are time-compressed for training — a real heatup takes many hours against brittle-fracture and pressurizer limits. The PLANT hours are real: measured full-stack, cold to the no-load anchor is about 11.3 plant-hours at an average ~39 °F/hr (21.7 °C/hr), settling to a steady ~32 °F/hr (17.8 °C/hr) after the first hour.',
        'The heat source is the reactor coolant pumps (pump_heat_frac 0.55 % of rated core heat at full flow) plus the pressurizer heaters. Do NOT pull rods or dilute — Hot Standby means hot AND subcritical. The control bank stays at its cold-shutdown position the whole way.',
        'The steam dump is a COARSE lever at these powers: measured, a 5 % manual dump demand is roughly ten times pump-heat generation and reverses the heatup at −263 °F/hr (−146 °C/hr) anywhere above about 302 °F (150 °C); below ~219.2 °F (104 °C) the same demand only ARRESTS the climb. To slow or hold a heatup, secure the RCP — measured, that takes the rate to 0.004 °F/hr.',
        'Keep the turbine OFF LINE and the dumps SHUT so the SG bottles: heat crossing the tubes then has nowhere to go but into secondary pressure, which rides up with Tavg. A turbine left in FOLLOW opens its governor and takes the whole heat source (~6 % open is enough on pump heat alone). The cold_shutdown IC spawns already off line (#251); the Disconnect Grid step confirms rather than changes.',
        'Step 7 (re-align the SI accumulators) is YOURS, nothing does it for you, and it belongs INSIDE step 6 rather than after it — measured, the compliant 600-to-1000 psi window is ~100 s wide and shuts about 90 s before a full pressurization completes. The cold lineup ships them isolated — correct below their 600 psi (4.14 MPa) cover gas — and re-alignment is deliberately procedural *(OWNER RULING, 2026-07-30: "lets leave opening of the accumulators to the procedure instead of auto opening them.")*. Skip it and you reach Mode 1 with no passive injection; the SI ACCUM ALIGNED annunciator (PWR-A32) is silent on this case because shut tanks are what it clears on.',
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
        { text: 'Set the Steam Dump Setpoint to the no-load anchor (1194 psi / 8.23 MPa) so the secondary bottles with the heatup instead of dumping it. Leave the dump shut.',
          control: 'Dump SP', target: '1194 psi (8.23 MPa)',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 8.23 }, hold: 5,
          hl: ['Dump SP', 'Steam Dump'] },
        { text: 'Raise the Pressurizer Pressure Setpoint to 2235 psi (15.41 MPa). The heaters pressurize FAST — measured 8.9 psi/s (0.061 MPa/s), so normal operating pressure arrives in about three and a half plant-minutes, not ten to fifteen. Stay on the board: the accumulator window in the next step opens and shuts inside this one. Watch RHR isolate on the way past its 600 psi (4.14 MPa) autoclosure interlock (#288).',
          control: 'Pressure SP', target: '2235 psi (15.41 MPa)',
          cmd: { action: 'set_pressure_setpoint', mpa: 15.41 }, hold: 900,
          acc: { p: 'pressure_mpa', op: '>', v: 15.0 },
          hl: ['Pressure SP', 'Plant Pressure'] },
        { text: 'Re-align the Safety Injection accumulators (isolated for the cold lineup) AS PRESSURE PASSES 600 psi (4.14 MPa) — do not wait for the previous step to finish. They must be aligned before 1000 psi (6.895 MPa), where LCO 3.5.1 requires them OPERABLE, and measured that window is only ~100 s wide: 600 psi at +24 s from the Pressure SP command, 1000 psi at +122 s, normal operating pressure at +3.5 min. Nothing opens them for you.',
          control: 'Accumulator valve', target: 'accumulators armed',
          note: 'Owner ruling 2026-07-30: re-alignment is procedural, no automatic open. Skip this and Mode 1 has no passive injection; PWR-A32 will not tell you.',
          cmd: { action: 'open_accumulator_valve' }, hold: 5,
          acc: { p: 'accumulator_valve_open', op: '>', v: 0 },
          hl: ['Accumulator valve', 'ECCS'] },
        { text: 'Ride the heatup. Tavg climbs at roughly 32 °F/hr (17.8 °C/hr) on pump heat — about eleven plant-hours cold to the no-load anchor. Monitor Tavg and its rate, secondary pressure tracking Psat(Tavg), pressurizer level swelling on thermal expansion, and the reactor staying exactly where you left it. Do not pull rods. Do not dilute. If you need to slow down, secure an RCP.',
          control: '(observe)', target: 'Tavg ≥ 545 °F (285 °C), still subcritical',
          note: 'Measured full-stack with no rod motion: Mode 3 entry (~350 °F / 176.7 °C) at ~4.7 plant-h; 546.8 °F (286.0 °C) at 10.67 plant-h; settles 567.0 °F (297.2 °C) at 11.3 plant-h, ρ = −2828 pcm on 856.8 ppm, power 3.5e-5 %. The first hour reads faster because pressurization is quick, not because the pump-heat ramp is. Hold is 40 000 s (~11.1 plant-h) after the pressurization step — total plant time from start ≈ 11.4 h, past the settle point.',
          hold: 40000,
          saw: { p: 'tavg_c', op: '>', v: 150 },
          acc: { p: 'tavg_c', op: '>', v: 285 },
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
      cautions: ['Withdraw in small bursts, letting the count rate settle between them — target SUR ≤ 1 decade per minute (DPM) and reactor period ≥ 30 s. The SUR HI alarm comes in at 1 DPM and rod withdrawal is blocked at 1.5 DPM (clearing below 0.8); insertion is never blocked. The fine-step drive (912 steps full travel) puts one step at roughly 1 ¢ (6.5 pcm) near the critical band — single-step nudges at Slow for the final approach.', 'Plot ENOUGH 1/M points. The prediction always reads high early and walks down as you add points, so an early estimate is not a target — it is an upper bound. Two points predict ~step 711 against a true ~318; three still say ~484. It takes about six, with the bursts shrinking as you close in, to get within a couple of steps. Never withdraw straight to the predicted position — creep up on it.', 'Work out where criticality should be BEFORE you move a rod — an estimated critical condition, not a guess. The worksheet and the reference curves are in manual 09 §7.5: bank integral worth, differential boron worth at your Tavg, and critical boron by temperature and bank position. THIS CHECKLIST starts Mode 3 at 683 ppm with the bank in, which puts criticality near 319 steps — about 35 % withdrawn, comfortably inside the insertion limit. That is the answer for ONE boron, not a constant of the plant: a unit that came up on the pump-heat heatup is at ~857 ppm and goes critical near 561 steps (measured), outside the acceptance band below. Dilute to the estimated critical boron first — PWR-N02 step 15. The prediction carries a ±750 pcm acceptance band (roughly 159 to 421 steps here); criticality outside it means the estimate was wrong, so stop and re-work it rather than continuing to pull. The 1/M plot is how you close on the prediction, not a substitute for having made one.', 'Secure the Source Range BEFORE its counts reach the amber high-flux caution (the SR high-flux trip at 1e5 cps will scram the ascent). Once the Intermediate Range is on scale, the handoff is safe.', 'Mind the Steam Generator. Below the point of adding heat it barely moves, but from the moment power starts warming the coolant the SG boils down, and on this ascent the turbine is still offline — the steam dump is drawing steam nobody is replacing. Hold level with the three-element Feed AUTO channel (step 3). If you let auxiliary feedwater take it instead, AFW parks the level at about 21 % — inside the amber band, four points above the low-low trip — and holds it there indefinitely.', 'Below the point of adding heat there is no temperature feedback to hold you anywhere — power goes wherever the reactivity you left in takes it, however small. Sustaining even a gentle 1 DPM ramp means carrying ~+200 pcm, and ALL of it has to come back out to level off. Take it out in one decisive drive, not in taps: the plant runs while you tap.'],
      steps: [
        { text: 'Confirm the plant is ready: subcritical — the Source Range count rate is steady, not climbing — hot (Tavg ≈ 566.6 °F / 297 °C, the no-load point), pressurized (≈ 2233 psi / 15.4 MPa), Reactor Coolant Pumps running.',
          control: '(observe)', target: 'subcritical, hot, pumps running', hold: 2,
          acc: { p: 'tavg_c', op: '~', v: 297, tol: 1.5 },
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
        'Plant at Mode 3, Hot Standby: hot (566.6 °F / 297 °C), at normal operating pressure (2235 psi / 15.41 MPa), subcritical with the control bank in.',
        'Reactor coolant pumps running; steam generator level normal on the three-element feed channel.',
        'Condenser available — the steam dump is the heat sink for the first half of this evolution, and the RHR heat exchanger rejects to the same circulating water.',
      ],
      cautions: [
        'THE COOLDOWN IS A RAMP, NOT A CHASE. Walk the Dump SP down against a schedule and the dump only ever opens as far as it must to keep up. Chase it — retype the setpoint to track whatever Tavg reads right now — and you have built a positive feedback loop: a 55 psi (0.38 MPa) error is wider than the dump\'s 36 psi (0.25 MPa) proportional band, the dump saturates, and the plant free-falls. Measured with the setpoint driven to its 29 psi (0.2 MPa) stop: -2340 °F/hr (-1300 °C/hr), from 566.6 °F (297 °C) to 251.6 °F (122 °C) in eight plant-minutes.',
        'THREE THINGS WOULD TRIP YOU ON THE WAY DOWN AND ONLY ONE OF THEM IS "SI". The depressurization crosses the 1798 psi (12.4 MPa) SI actuation setpoint and the 1800 psi (12.41 MPa) low-pressure reactor trip. Taking HPI/LPI to OFF stops the PUMPS; it does NOT stop the RPS. Both the low-pressure trip and the reactor-trip-on-SI have to be BLOCKED by hand at the Trip Blocks panel, and neither block is available until pressure is inside the P-11 permissive (below 1972 psi / 13.6 MPa) — which is why step 3 lowers the Pressure SP before steps 4 and 5 block anything. Measured with the blocks missed: the plant scrams at 1800 psi about six plant-minutes into the first leg, the turbine trip drives the dump into its Tavg-error mode, and the cooldown runs away at -550.8 °F/hr (-306 °C/hr).',
        'The accumulators are PRESSURE and a check valve, not a pump — blocking SI does nothing to them. Isolate them at 1000 psi (6.895 MPa), where LCO 3.5.1 stops requiring them OPERABLE and 355 psi (2.45 MPa) above their 600 psi (4.14 MPa) cover gas. Miss it and all four dump into the RCS: empty tanks, boron dragged toward the 2500 ppm RWST charge, and a water-solid arrival at Mode 5.',
        'PLACE RHR WITH THE HEAT EXCHANGER THROTTLED, and set the split BEFORE you open the suction. The split arrives at 100 % from the at-power lineup; measured, opening the hot-leg suction at full split on a 379.4 °F (193 °C) plant takes the rate to -1517.4 °F/hr (-843 °C/hr). At the 7 % of step 12 the placement transient peaks at -171 °F/hr (-95 °C/hr) for about ten seconds and then settles back on programme.',
        'From the moment the pumps are secured the HX split IS the rate control, and it has to keep rising: RHR removes heat in proportion to (Tavg − sink), so a split that gives -90 °F/hr at 379 °F gives a third of that at 210 °F. Step 15 walks it 7 → 25 %. The sink is about 122 °F (50 °C) and moves with the circulating-water inlet temperature, so a warm summer river raises the floor this cooldown can reach.',
        'The programmed -90 °F/hr (-50 °C/hr) is THIS PLANT\'S TRAINING RATE and is UNVERIFIED as a commercial limit — no source for a real-plant cooldown-rate limit has been found for this manual set. Real Tech Spec limits come from the RCS pressure–temperature curves (NUREG-1431 LCO 3.4.3), which this plant does not model.',
      ],
      auto_channels: ['feed_sg', 'cvcs_makeup', 'boron_conc'],
      steps: [
        obs('Confirm Mode 3, Hot Standby: Tavg at the no-load anchor 566.6 °F (297 °C), pressure 2235 psi (15.41 MPa), reactor subcritical with the control bank in, RCPs running.',
          { p: 'tavg_c', op: '~', v: 297, tol: 3 }, null, ['Tavg', 'Plant Pressure', 'Reactor Coolant Pumps (RCP)']),
        { text: 'BORATE FIRST — nothing cools until this is done. Cooling a core makes it MORE reactive (the cold moderator is denser), so the shutdown margin you have at 566.6 °F is not the margin you will have at 199 °F. Set the boron target to 857 ppm on the board (BORON CONTROL): 806 ppm is critical cold with the bank in (09 §7.5) and the rest is margin. The makeup panel meters it as a batch dose at about 3 ppm/min, so 683 → 857 ppm takes roughly an hour of plant time.',
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
        { text: 'BLOCK the low-pressure reactor trip (Trip Blocks → PZR PRESS LO LO). It is armed at 1800 psi (12.41 MPa) and you are about to drive straight through it. You could not have blocked it a step ago: the block is an ENABLE, not a switch, and P-11 is what enables it — which is why the Pressure SP came down first. It stands as long as you stay below P-11, and reinstates itself when pressure climbs back through P-11 on the next heatup, whoever set it.',
          control: 'Trip Blocks', target: 'lo-press trip BLOCKED',
          cmd: { action: 'set_trip_block', trip_id: 'lo_press', blocked: true }, hold: 10,
          hl: ['Trip Blocks'] },
        { text: 'BLOCK the reactor trip on safety injection as well (Trip Blocks). This is a SECOND trip on the same channel, armed at the 1798 psi (12.4 MPa) SI setpoint — a real casualty means the reactor does not stay up, and a planned cooldown is not one. Blocking the SI pumps in the next step does nothing to this trip.',
          control: 'Trip Blocks', target: 'SI reactor trip BLOCKED',
          note: 'Found by building this checklist: with only the low-pressure trip blocked the plant still scrams on the way down, because two entries in the trip table watch the same instrument in the same direction. Both blocks are needed and both are the operator\'s.',
          cmd: { action: 'set_trip_block', trip_id: 'si_trip', blocked: true }, hold: 10,
          hl: ['Trip Blocks'] },
        { text: 'Take HPI/LPI to OFF — the P-11 cold lineup. Armed, it reads the depressurization as a Loss-Of-Coolant Accident and injects 2500 ppm RWST water. Measured with it left in AUTO: boron ends at 2500 ppm instead of 857 and the cold injection cools the plant about ten times faster than you are asking for.',
          control: 'HPI/LPI', target: 'HPI/LPI in MANUAL, OFF',
          cmd: { action: 'set_hpi', active: false }, hold: 10,
          acc: { p: 'hpi_active', op: '<', v: 0.5 },
          hl: ['HPI/LPI', 'ECCS'] },
        { text: 'LEG 1 — start the cooldown. Walk the Dump SP down from 1194 psi to 814 psi (8.23 → 5.61 MPa) and the Pressure SP from 1901 psi to 1352 psi (13.11 → 9.32 MPa) TOGETHER, over the next 31 plant-minutes, tracking the saturation curve. That is about 12 psi/min on the dump. The pair holds 63 °F (35 °C) of subcooling all the way down: the dump sets where the plant is going, the pressurizer keeps the coolant liquid while it gets there.',
          control: 'Dump SP', target: 'Tavg 519.8 °F (271 °C) at -90 °F/hr (-50 °C/hr)',
          note: 'Measured: -85 to -100 °F/hr (-47 to -56 °C/hr) through this leg, arriving 521.4 °F (271.9 °C). Do not retype the setpoint to match present Tavg — that is the chase the first caution describes.',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 5.61 }, hold: 1872,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [8.23, 7.50, 6.82, 6.19, 5.61] },
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
          hl: ['Accumulator valve', 'ECCS'] },
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
        { text: 'Align RHR — open the hot-leg suction valve (RHR card → ALIGN). The engine refuses this above 400 psi (2.76 MPa), which is why leg 4 had to finish first. Note the two setpoints are not one number: the block-open permissive is 400 psi and the AUTOCLOSURE that would shut a standing-open valve is 600 psi (4.14 MPa), about 200 psi higher, so the valve does not chatter across a single boundary (#288).',
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
          { p: 'accumulator_volume_pct', op: '>', v: 99 }, null, ['Accumulator valve', 'ECCS']),
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
      outcome: 'Mode 5, Cold Shutdown: cold, depressurized to 363 psi (2.50 MPa), RHR in service, reactor coolant pumps secured, accumulators full and isolated, boron at the cold shutdown margin of 857 ppm. This is the `cold_shutdown` initial condition, reached on integrated physics. PWR-N01 takes it back up.',
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
        { text: 'The PORV is stuck open and its indicator reads closed. (Failures tab → inject PORV Stuck Open.) Inventory is leaking. Diagnose it on the SUBCOOLING readout (Power & Reactivity card), which erodes toward zero as coolant is lost.', control: '(observe subcooling)', target: 'recognize the leak',
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
          cmd: { action: 'inject_failure', failure_id: 'stuck_porv_open' }, hold: 30,
          saw: { p: 'core_inventory_pct', op: '<', v: 100 }, acc: { p: 'subcooling_c', op: '<', v: 20 } },
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

  RD.MANUAL_PROCEDURES = { pwr: PWR, rbmk_pre: RBMK, rbmk_post: RBMK, bwr: BWR };

})(globalThis.RD || (globalThis.RD = {}));
