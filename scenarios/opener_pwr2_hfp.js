/*
 * opener_pwr2_hfp.js — the FULL-POWER OPENER for the PWR (engine pwr2), issue #811.
 *
 * WHAT AN OPENER IS. A short, optional instructor chat offered on the default Instructor tab
 * when the player sits at one starting condition with nothing else loaded. It reads like a
 * message thread from an instructor: it says what the board is doing, asks for one control at
 * a time, highlights it, and runs the clock faster between moves — saying so every time
 * (OWNER, 2026-09-28: "should control time warp and be transparent about it", "should not be
 * wordy", "target 5 minutes … end with a SCRAM").
 *
 * ONE FILE PER STARTING CONDITION. Openers live in `RD.OPENERS`, NOT `RD.SCENARIOS`: they are
 * not missions (no campaign slot, no flag row per item, no mission-window card), and the
 * scenario gates walk RD.SCENARIOS. The UI offers the opener whose `plant_id` and
 * `initial_state` match the running plant, so a second opener is another file like this one.
 *
 * THE PLANT IS THE FREE-PLAY PLANT. `start_opener` (simulation_service.js) resets to
 * `initial_state` WITH the free-play automation lineup — unlike `start_scenario`, which starts
 * from a clean board (`noDefaults`). The opener teaches the plant the player gets.
 *
 * GRADING. Every ask advances on the EFFECT reaching the board (mwe_output, power_range,
 * pzr_spray_flow, the spray AUTO light, the trip), never on a timer alone. Every ask also has
 * an inaction branch where the instructor does it for the player and says so — no silent
 * strand. Watch beats fall through on a time limit so a player who did less than asked still
 * moves on; their text is written to be true on both routes.
 *
 * NUMBERS. Measured full stack, `test/run_opener.js` (typical, mistake and hands-off routes).
 * US units only (checklists carry no SI — OWNER RULING 2026-09-06; applied here too).
 */
;(function (RD) {
  'use strict';

  function say(learning, industry) { return { speaker: 'instr', learning: learning, industry: industry }; }
  function inst(id, dir, v) { return { type: 'instrument', instrument: id, direction: dir, value: v }; }
  function delay(s) { return { type: 'delay', value: s }; }
  function did(command, params) { return { type: 'operator_action', command: command, params: params }; }

  var PSI = 1 / 145.038;   // instruments carry MPa internally; thresholds are written in psi
  // Rods OUT this far past where they sat at the ask = the wrong way (see o4_wrong). Held at MED
  // the bank moves ~23 steps per 30 s at 1x (QA pass, headless Edge), so this is ~6 s of holding OUT.
  var WRONG_WAY_STEPS = 5;
  // ...and the ask is met only once the bank is actually IN from where it stood when the line was
  // said. Measured on the 90 MWe route: power is already 89.0 % at the ask, so "power < 90 and a
  // release" alone accepted the release of an OUT hold and moved on to "Rods in means fewer
  // neutrons" over a bank that had gone out.
  var IN_SINCE_ASK = { type: 'rod_travel', group_id: 'control_rods', direction: 'in', steps: 3 };

  RD.OPENERS = RD.OPENERS || {};
  RD.OPENERS.opener_pwr2_hfp = {
    id: 'opener_pwr2_hfp',
    title: 'Full-power opener',
    offer: 'New here? A 5-minute guided look at the plant: cut load, move rods, move pressure, trip the reactor.',
    plant_id: 'pwr2',
    initial_state: 'hot_full_power',
    chat: true,
    chat_clock: 'elapsed',

    beats: [
      { id: 'o0_hello',
        trigger: { type: 'time', value: 0.5 },
        speed: 1,
        highlight: { control_label: 'Plant Pressure' },
        dialogue: [
          say('Fresh start at full power. I\'ll show you a few cause-and-effect moves, about five minutes. Press End anytime to stop.',
              'Plant reset to 100 % power for a five-minute familiarization. End terminates it at any time.'),
          say('Right now: reactor 100 %, generator 100 MWe, pressure 2235 psi, Tavg 580 °F. Everything is steady.',
              'Initial conditions: 100 % power, 100 MWe, RCS 2235 psi, Tavg 580 °F, steady state.'),
        ],
        advance: 'wait_for_trigger' },

      // ---------------------------------------------------------------- 1. load cut
      { id: 'o1_load',
        trigger: { type: 'manual' },
        chat_button: { style: 'ack', label_learning: 'Ready', label_industry: 'Ready' },
        speed: 1,
        highlight: { control_label: 'Turbine Load' },
        trend: ['tavg', 'pressure', 'dump', 'power'],
        dialogue: [
          say('First move: set Turbine Load to 80 MWe. That asks the turbine for less steam.',
              'Reduce turbine load to 80 MWe.'),
          say('I put Tavg, Pressure, Steam Dump and Power on the trend chart so you can watch.',
              'Trend chart: Tavg, Pressure, Steam Dump, Power.'),
        ],
        branches: [
          { trigger: inst('mwe_output', 'below', 96), goto: 'o2_watch' },
          { trigger: { type: 'inaction', window: 90 }, goto: 'o1_help' },
        ] },
      { id: 'o1_help',
        trigger: delay(0),
        commands: [{ action: 'set_load_target', mwe: 80 }],
        dialogue: [say('I\'ll set it to 80 MWe for you so we keep moving.', 'Instructor setting turbine load to 80 MWe.')],
        advance: 'wait_for_trigger' },
      { id: 'o2_watch',
        trigger: delay(1),
        speed: 5,
        highlight: { control_label: 'Tavg' },
        dialogue: [
          say('Clock to 5× so this moves along. Less steam leaves, so the primary heats up. Watch Tavg climb.',
              'Clock 5×. Steam demand reduced; RCS heating up. Monitor Tavg.'),
        ],
        // Two endings, because the plant has two: a cut to ~80 MWe opens the steam dump, a small
        // cut (measured: 90 MWe) never does — the text must be true on the route the player took.
        branches: [
          { trigger: { type: 'all', triggers: [inst('steam_dump_valve', 'above', 15), delay(15)] }, goto: 'o3_dump' },
          { trigger: delay(45), goto: 'o3_small' },
        ] },
      { id: 'o3_small',
        trigger: delay(0),
        highlight: { control_label: 'Tavg' },
        dialogue: [
          say('Warmer water swelled into the pressurizer and pushed pressure up. This cut was small, so the steam dump stayed shut.',
              'Tavg and pressure up; load step within the plant capacity, steam dumps not required.'),
          say('Warmer water also trimmed reactor power a few percent by itself. That is moderator temperature feedback.',
              'Negative moderator temperature coefficient has reduced power several percent.'),
        ],
        branches: [{ trigger: delay(0), goto: 'o4_rods' }] },
      { id: 'o3_dump',
        trigger: delay(0),
        highlight: { control_label: 'Steam Dump' },
        dialogue: [
          say('Warmer water swelled into the pressurizer and pushed pressure up. The steam dump opened to carry the extra heat to the condenser.',
              'Tavg and pressure up; steam dumps open to the condenser.'),
          say('Warmer water also trimmed reactor power a few percent by itself. That is moderator temperature feedback.',
              'Negative moderator temperature coefficient has reduced power several percent.'),
        ],
        advance: 'wait_for_trigger' },

      // ---------------------------------------------------------------- 2. rods
      { id: 'o4_rods',
        trigger: delay(40),
        speed: 1,
        highlight: { control_label: 'Control Bank' },
        trend: ['power', 'rod_steps', 'tavg'],
        dialogue: [
          say('Clock back to 1×. Your turn: set rod speed to FAST, then drive Control Bank in about 40 steps. Watch reactor power follow.',
              'Clock 1×. Select FAST rod speed, then insert control rods about 40 steps to bring power down to the load.'),
          say('The trend chart now shows Power, Control Rod Steps and Tavg.',
              'Trend chart: Power, Control Rod Steps, Tavg.'),
        ],
        // A board HOLD sends rod_start on press and rod_stop on release; a tap sends rod_nudge on
        // release. Grading on the RELEASE, not the press: measured in headless Edge (QA pass),
        // holding INSERT at the default (MED) speed at 1× moves ~23 steps in 30 s, and power
        // crosses 90 % mid-hold — on `rod_start` the 5× watch and the spray ask both fired while
        // the player was still holding the button.
        branches: [
          { trigger: { type: 'all', triggers: [inst('power_range', 'below', 90), IN_SINCE_ASK,
              { type: 'any', triggers: [did('rod_nudge'), did('rod_stop')] }] }, goto: 'o5_rods_watch' },
          { trigger: { type: 'rod_travel', group_id: 'control_rods', direction: 'out', steps: WRONG_WAY_STEPS }, goto: 'o4_wrong' },
          { trigger: { type: 'inaction', window: 120 }, goto: 'o4_help' },
        ] },
      // WITHDRAWN, NOT INSERTED (#811 QA: power 93.7 -> 98.2 %, bank to 627/627 and 120 s of silence
      // before the help beat). One line, then the same ask continues from here — its own inaction
      // exit, and no second wrong-way branch, so the line is said once.
      { id: 'o4_wrong',
        trigger: delay(0),
        highlight: { control_label: 'Control Bank' },
        dialogue: [
          say('Those rods went out, the wrong way, so power rose. Drive Control Bank in instead.',
              'Rods withdrawn; power increasing. Insert control rods.'),
        ],
        branches: [
          { trigger: { type: 'all', triggers: [inst('power_range', 'below', 90), IN_SINCE_ASK,
              { type: 'any', triggers: [did('rod_nudge'), did('rod_stop')] }] }, goto: 'o5_rods_watch' },
          { trigger: { type: 'inaction', window: 120 }, goto: 'o4_help' },
        ] },
      { id: 'o4_help',
        trigger: delay(0),
        commands: [{ action: 'rod_nudge', group_id: 'control_rods', steps: -40 }],
        dialogue: [say('I\'ll drive the rods in 40 steps for you.', 'Instructor inserting control rods 40 steps.')],
        advance: 'wait_for_trigger' },
      { id: 'o5_rods_watch',
        trigger: delay(1),
        speed: 5,
        highlight: { control_label: 'Tavg' },
        dialogue: [
          say('Clock to 5×. Rods in means fewer neutrons: power drops toward the load and Tavg comes back down.',
              'Clock 5×. Power reducing toward load; Tavg restoring toward program.'),
        ],
        advance: 'wait_for_trigger' },

      // ---------------------------------------------------------------- 3. pressure
      { id: 'o6_spray',
        trigger: { type: 'any', triggers: [
          { type: 'all', triggers: [inst('steam_dump_valve', 'below', 30), delay(30)] }, delay(75)] },
        speed: 1,
        highlight: { control_label: 'Pressurizer Spray (PZR)' },
        trend: ['pressure', 'spray'],
        dialogue: [
          say('Clock back to 1×. Now pressure. Put Pressurizer Spray in MANUAL and open it all the way.',
              'Clock 1×. Place pressurizer spray in manual, 100 % open.'),
          say('The trend chart now shows Pressure and Spray.',
              'Trend chart: Pressure, PZR Spray.'),
        ],
        branches: [
          { trigger: inst('pzr_spray_flow', 'above', 30), goto: 'o7_spray_watch' },
          { trigger: { type: 'inaction', window: 90 }, goto: 'o6_help' },
        ] },
      { id: 'o6_help',
        trigger: delay(0),
        commands: [{ action: 'set_spray', pct: 100 }],
        dialogue: [say('I\'ll open the spray for you.', 'Instructor opening pressurizer spray.')],
        advance: 'wait_for_trigger' },
      { id: 'o7_spray_watch',
        trigger: delay(1),
        highlight: { control_label: 'Plant Pressure' },
        dialogue: [
          say('Spray showers cooler water into the pressurizer\'s steam bubble. Steam condenses and pressure falls. Watch Plant Pressure.',
              'Spray condensing pressurizer steam; RCS pressure decreasing.'),
        ],
        advance: 'wait_for_trigger' },
      { id: 'o8_auto',
        trigger: { type: 'any', triggers: [inst('primary_pressure', 'below', 2150 * PSI), delay(45)] },
        highlight: { control_label: 'Pressurizer Spray (PZR)' },
        dialogue: [say('That\'s enough. Put the spray back in AUTO.', 'Return pressurizer spray to automatic.')],
        branches: [
          { trigger: { type: 'control_state', field: 'spray_auto', direction: 'is_true' }, goto: 'o9_heaters' },
          { trigger: { type: 'inaction', window: 60 }, goto: 'o8_help' },
        ] },
      { id: 'o8_help',
        trigger: delay(0),
        commands: [{ action: 'set_spray', auto: true }],
        dialogue: [say('I\'ve put the spray back in AUTO.', 'Instructor returned spray to automatic.')],
        advance: 'wait_for_trigger' },
      { id: 'o9_heaters',
        trigger: delay(1),
        speed: 5,
        highlight: { control_label: 'Pressurizer Heaters (PZR)' },
        dialogue: [
          say('Clock to 5×. Back in AUTO, the heaters run full to boil water and rebuild pressure. It is slow: minutes, not seconds.',
              'Clock 5×. Pressurizer heaters full on; pressure recovery is slow.'),
        ],
        advance: 'wait_for_trigger' },

      // ---------------------------------------------------------------- 4. trip
      { id: 'o10_scram',
        trigger: delay(40),
        speed: 1,
        highlight: { control_label: 'SCRAM' },
        dialogue: [say('Clock back to 1×. Last move: trip the reactor. Press SCRAM.', 'Clock 1×. Manually trip the reactor.')],
        branches: [
          { trigger: { type: 'scram' }, goto: 'o11_trip' },
          { trigger: { type: 'inaction', window: 90 }, goto: 'o10_help' },
        ] },
      { id: 'o10_help',
        trigger: delay(0),
        commands: [{ action: 'scram' }],
        dialogue: [say('I\'ll trip it for you.', 'Instructor tripping the reactor.')],
        advance: 'wait_for_trigger' },
      // Held 12 s after the trip so the figures are the settled ones. DECAY heat, not core heat
      // (QA pass, measured on all three routes at this beat): decay_heat_pct 5.0-5.2 %, while
      // core_heat_pct 7.0-7.3 % is decay PLUS the ~2 % fission the same line already names.
      { id: 'o11_trip',
        trigger: { type: 'all', triggers: [inst('power_range', 'below', 5), delay(12)] },
        highlight: { control_label: 'Tavg' },
        trend: ['power', 'decay', 'tavg'],
        dialogue: [
          say('All rods dropped. Neutron power fell to about 2 % in seconds, but the fuel still makes about 5 % of full heat from decay.',
              'Reactor tripped. Neutron power about 2 %; decay heat about 5 %.'),
          say('See Decay Heat on the trend chart, next to Power and Tavg. It stays well above neutron power.',
              'Trend chart: Power, Decay Heat, Tavg. Decay heat remains above neutron power.'),
        ],
        advance: 'wait_for_trigger' },
      { id: 'o12_settle',
        trigger: delay(5),
        speed: 5,
        highlight: { control_label: 'Steam Dump' },
        dialogue: [
          say('Clock to 5×. The turbine tripped, so the steam dump takes the decay heat. Tavg drops toward about 552 °F.',
              'Clock 5×. Turbine tripped; steam dumps removing decay heat; Tavg settling near 552 °F.'),
        ],
        advance: 'wait_for_trigger' },
      { id: 'o13_end',
        trigger: delay(50),
        speed: 1,
        dialogue: [
          say('That\'s the loop: load, rods, pressure, trip. Clock back to 1×. The Walkthroughs tab goes deeper.',
              'Familiarization complete. Clock 1×. Walkthroughs cover the full procedures.'),
        ],
        level_complete: {
          title: 'Full-power opener',
          outcome_learning: 'Continue leaves you in free play on this tripped plant. Retry starts over at full power.',
          outcome_industry: 'Continue: free play from the tripped plant. Retry: restart at 100 % power.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };
})(globalThis.RD || (globalThis.RD = {}));
