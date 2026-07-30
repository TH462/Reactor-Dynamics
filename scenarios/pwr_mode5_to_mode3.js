/*
 * pwr_mode5_to_mode3.js — "The Big Warm-Up" (campaign Act II, the cold start).
 *
 * The heatup Mode 5, Cold Shutdown → Mode 4, Hot Shutdown → Mode 3, Hot Standby,
 * driven on integrated physics from the genuine cold_shutdown board.
 *
 * THE HEAT SOURCE IS THE REACTOR COOLANT PUMPS, and the reactor never goes
 * critical — which is what a real heatup is, and what Mode 3 actually means: hot
 * at normal operating temperature and pressure, and still subcritical.
 *
 * This mission used to take the core critical and heat the plant on ~10 % fission,
 * because pump heat provably could not do it: the steam generator NETTED pump heat
 * out of its steam balance, so the steam side could never start boiling and a
 * pump-heat heatup stalled dead at 218.69 °F (103.72 °C). That was a modelling
 * fudge, not a property of the plant; it is gone (#251), and so is the mission's
 * approach to criticality — those beats already live in `pwr_startup_challenge`
 * and `pwr_return_to_mode1`, which is where an approach to criticality belongs.
 *
 * MEASURED on the as-built plant, cold_shutdown IC, no rod motion at all —
 * **at BOTH layers, and they agree to every digit** (re-measured 2026-07-30, #266):
 *   enters Mode 4                       0.27 plant-h  (200 °F / 93.3 °C at 0.28)
 *   enters Mode 3                       4.57 plant-h  (350 °F / 176.7 °C at 4.55)
 *   450 °F (232.2 °C)                  7.63 plant-h
 *   545 °F (285.0 °C)                 10.61 plant-h
 *   reaches 566 °F                     11.28 plant-h
 *   settles 567.0 °F (297.2 °C)        ρ = −2828 pcm, 856.8 ppm boron,
 *                                       power 3.5e-5 %, control bank still 0/912
 *   average rate                       39.1 °F/hr (21.7 °C/hr)
 *   steady rate after the first hour    32.1 °F/hr (17.8 °C/hr)
 *   first hour                        111.5 °F/hr — the compressed pressurization,
 *                                      not the pump-heat ramp (see the honesty note
 *                                      in the `ride_up` beat)
 *
 * READ THE DIFF CAREFULLY, because it is easy to mis-attribute. **The thermal ride
 * did not change**: 545 °F still arrives at 10.61 plant-h, the first hour is still
 * 111.5 °F/hr, and the steady rate is still ~32 °F/hr. Pump heat does not care what
 * the moderator coefficient is, and at 3e-5 % power fission contributes nothing
 * thermally. Two things DID change:
 *   1. **Arrival reactivity: −6287 → −3377 → −2828 pcm, on 919 → 907 → 856.8 ppm.** The
 *      first move is #260 — the old model charged a moderator defect over three times too
 *      large on the way up, so it arrived far more subcritical than it should have. The
 *      second is #263's least-squares refit of that model against the three measured BEAVRS
 *      isothermal coefficients; this header carried the pre-refit figures for a day.
 *   2. **The endpoint reads 567.0 °F, not 548 °F.** This is NOT a 19 °F improvement.
 *      567 °F is the no-load anchor where the steam dump opens and Tavg stops; the old
 *      figure was where an earlier measurement's window ended, not where the plant
 *      settles. Run it to the settling point and both models reach the anchor.
 * A previous revision of this file's own docs claimed the endpoint difference was a
 * physics gain. It was a measurement-window artifact. Do not re-introduce that claim.
 *
 * WHICH LAYER THESE NUMBERS COME FROM (#263 item 5) — SETTLED 2026-07-30, and the answer
 * is that it makes NO DIFFERENCE HERE. This mission runs FULL-STACK under run_campaign
 * (`startScenario` selects the plant with `noDefaults: true`), and the table was originally
 * measured ENGINE-DIRECT. That mismatch is the trap CLAUDE.md's layer table exists for, so
 * it was run BOTH WAYS with the same two commands (`set_rcp`, `set_pressure_setpoint`):
 *
 *                    engine-direct   full stack    delta
 *     Mode 4          0.27 plant-h   0.27 plant-h  0.00 h
 *     Mode 3          4.57 plant-h   4.57 plant-h  0.00 h
 *     450 °F          7.63 plant-h   7.63 plant-h  0.00 h
 *     545 °F         10.61 plant-h  10.61 plant-h  0.00 h
 *     566 °F         11.28 plant-h  11.28 plant-h  0.00 h
 *   and at 12 plant-hours every state value matches: 567.0 °F, −2828 pcm, 856.8 ppm,
 *   3.54e-5 % power, 2235 psi, SG 65.0 %, fw_flow 0.0053.
 *
 * The prior worry was that `feed_sg` replacing the engine's coupled-feed fallback would
 * change how fast the SG carries heat away. Measured, it does not — feed flow at the end is
 * 0.0053 normalized either way, because a subcritical plant on pump heat barely boils and
 * both feed paths sit at the same near-zero demand. The REACTIVITY claims were already
 * argued layer-independent statically (`getStartupLineup()` returns [] for cold_shutdown;
 * `boron_conc` captures the current analyzer reading as its setpoint so it holds boron
 * rather than driving it; nothing moves the rods) and the run now confirms it.
 *
 * The old note here said 12 plant-hours "exceeded ten minutes of wall clock without
 * finishing" and told you to borrow a warm service from run_campaign. **That was wrong and
 * is retracted** (#266): the two attempts were driven through `svc.start()`, which arms
 * `setTimeout(broadcastMs)` and therefore advances in WALL time. Drive `tick()` directly and
 * this whole 12-plant-hour ride is ~34 s. Use `node test/measure_stack.js` — it takes the
 * ICs, duration, watched fields and scheduled commands on the command line, never calls
 * `start()`, and stamps the layer into its own output.
 *
 * Honesty: the WALL CLOCK is compressed (time acceleration), and the pressurization
 * is fast. The heat source and the rate are no longer fictional.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_mode5_to_mode3 = {
    id: 'pwr_mode5_to_mode3',
    title: 'The Big Warm-Up — Mode 5 to Mode 3',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'cold_shutdown',
    mode: 'guided',
    // No setup commands. The turbine used to be taken off line here
    // (`disconnect_grid`) to stop it drawing steam; the cold_shutdown INITIAL
    // CONDITION now spawns off line, as a Mode 5 plant physically is (#251) — the
    // breaker is open, the rotor is at rest, and the load mode is 'disconnected'.
    // No dump-setpoint override either: the config default IS the no-load anchor (FG-2).
    setup_commands: [],
    description: 'The heatup Mode 5, Cold Shutdown → Mode 4, Hot Shutdown → Mode 3, Hot Standby: pressurize, start the reactor coolant pumps, bottle the steam generator, and ride the plant up to operating temperature on pump heat alone — with the reactor never going critical.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Welcome to Mode 5, Cold Shutdown — a genuinely cold plant. Look at the board: Tavg near 122 °F (50 °C), the primary depressurized, Residual Heat Removal carrying what little heat there is, the reactor deeply subcritical on boron. Your job is the heatup, all the way to Mode 3, Hot Standby at 545 °F (285 °C) and 2235 psi (15.41 MPa). Here is the thing that surprises people: you will not start the reactor. You do not need to. The reactor coolant pumps put roughly 0.55 % of rated heat into the water just by stirring it, and with nowhere for that heat to go, it warms the whole plant. Every control you touch is the real one.',
          industry: 'Mode 5, Cold Shutdown: RCS ~122 °F (50 °C), depressurized, RHR in service, deeply subcritical. Objective: heatup to Mode 3, Hot Standby (NOP T/P), reactor SUBCRITICAL throughout. Heat source is RCP shaft work (pump_heat_frac 0.55 % of rated core heat at full flow) plus pressurizer heaters. No approach to criticality in this evolution.',
        },
        highlight: { control_label: null, instrument_id: 'tavg' },
        advance: 'wait_for_trigger' },

      { id: 'pressurize',
        trigger: { type: 'delay', value: 8.0 },
        commentary: {
          learning: 'Two actions get the heatup started. START THE REACTOR COOLANT PUMPS — that is your heat source, and the steam generator needs the flow to see it. Then raise the PRESSURIZER PRESSURE SETPOINT toward 2235 psi (15.41 MPa): the heaters will draw the plant up to pressure, and Residual Heat Removal auto-isolates on the way past its 400 psi (2.76 MPa) interlock, taking away the cold sink that has been holding you down. Watch that happen — until RHR shuts, it is removing heat as fast as the pumps add it.',
          industry: 'Start RCPs (set_rcp). Raise the pressurizer setpoint to NOP, 2235 psi (15.41 MPa) — heaters pressurize; the RHR hot-leg suction valve auto-isolates above the 400 psi (2.76 MPa) interlock, removing the shutdown-cooling heat sink. No NIS handoff in this evolution: flux never leaves the source range.',
        },
        highlight: { control_label: 'Reactor Coolant Pumps (RCP)', instrument_id: 'press' },
        speed: 10,
        advance: 'wait_for_trigger' },

      { id: 'heat_sink',
        trigger: { type: 'true_state', field: 'pressure_mpa', direction: 'above', value: 14.0 },
        commentary: {
          learning: 'At pressure, pumps turning. Now look at the SECONDARY side, because that is what decides whether you heat up at all. The turbine is off line and the steam dumps are shut, so the steam generator is BOTTLED: nothing is leaving it. Heat crossing the tubes has nowhere to go but into raising the steam pressure, and the steam side simply climbs alongside the primary — you will watch steam pressure track Tavg the whole way up. If you were to crack the STEAM DUMP open here, you would be throwing that heat at the condenser and the plant would cool instead. Leave it shut.',
          industry: 'NOP pressure established. The SG is bottled — turbine off line, dumps shut, MSIV open — so all heat crossing the tubes goes into secondary pressure, which rides up at Psat(Tavg). This is the heat balance that makes a pump-heat heatup work: no steam sink, no heat removal. Opening the dump is a coarse lever here — measured, a 5 % manual dump demand is roughly ten times pump-heat generation and reverses the heatup at −83 °F/hr.',
        },
        highlight: { control_label: 'Steam Dump', instrument_id: 'sg' },
        speed: 60,
        advance: 'wait_for_trigger' },

      { id: 'ride_up',
        trigger: { type: 'true_state', field: 'tavg_c', direction: 'above', value: 150 },
        commentary: {
          learning: 'This is the evolution: you wait, and you watch. Tavg climbs at roughly 32 °F/hr (18 °C/hr) on pump heat, and it takes about ten plant-hours to reach operating temperature — which is why a real heatup is an all-shift job and why the clock in the corner is running fast. Your work is monitoring, not acting: Tavg and its RATE, steam pressure tracking it, pressurizer level swelling as the water expands, and the reactor staying exactly where you left it. If you ever needed to slow down, you would secure a pump; measured, that takes the rate to essentially zero.',
          industry: 'Nuclear heatup rate is not applicable — the core is subcritical. Measured on the as-built plant with no rod motion: ~32 °F/hr (17.8 °C/hr) steady, 39.8 °F/hr (22.1 °C/hr) averaged over the climb, 10.71 plant-hours cold to 548 °F (286.7 °C). Monitor Tavg and rate, secondary pressure tracking Psat(Tavg), pressurizer level on thermal expansion. Rate control: secure an RCP (measured, rate → 0.1 °F/hr) — the steam dump is too coarse.',
        },
        highlight: { control_label: null, instrument_id: 'tavg' },
        speed: 300,
        advance: 'wait_for_trigger' },

      { id: 'arrive_mode3',
        trigger: { type: 'all', triggers: [
          { type: 'true_state', field: 'tavg_c', direction: 'above', value: 285 },
          { type: 'true_state', field: 'reactivity_pcm', direction: 'below', value: -300 },
          { type: 'true_state', field: 'power_pct', direction: 'below', value: 5.0 },
        ] },
        commentary: {
          learning: 'That is Mode 3, Hot Standby: hot at operating temperature and pressure, and subcritical with a very large margin — the control bank is exactly where it started and the boron never moved. That last part is worth sitting with, because it is the whole definition. Hot Standby is not a low power level; it is a HOT plant with the chain reaction off. You have not started a reactor yet. The approach to criticality is the next mission, and it begins from this board.',
          industry: 'Mode 3, Hot Standby reached: NOP T/P, reactor subcritical (measured on arrival: ρ = −3377 pcm at 907 ppm, control bank at its cold-shutdown position, power 3e-5 %). Heatup evolution complete with zero rod motion. This is the hot_zero_power board the startup missions begin from.',
        },
        highlight: { control_label: null, instrument_id: 'tavg' },
        level_complete: {
          title: 'Hot Standby — Reached',
          outcome_learning: 'You took a cold, dead plant and warmed it to operating temperature without ever starting the reactor — on the heat the coolant pumps alone put into the water. Pressurize, start the pumps, bottle the steam generator, and wait out the climb. That is the real first half of every startup, and the reactor comes next.',
          outcome_industry: 'Mode 5 → Mode 3 heatup complete on integrated physics: pressurization to NOP, RCP start, RHR auto-isolation, bottled-SG heat balance, and a 10.7 plant-hour pump-heat ramp to Hot Standby with the reactor subcritical throughout and no rod motion.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
