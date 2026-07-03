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
 * Step: { text, control, target, cmd, hold, acc, saw, note }
 *   text    integrated-voice instruction     control  on-screen control to use
 *   target  the value/limit to drive to      cmd      command issued (rod group 'control'/'shutdown' resolved)
 *   hold    seconds to run after the command  acc      {p,op,v[,tol]} checked at END of the step
 *   saw     {p,op,v} true at least once during the step   note  caution / what to watch
 * guard: { never_melted, never:[{p,op,v}] } checked across the whole run.
 * op ∈ >,<,>=,<=,~ (~ within tol of v).
 */
;(function (RD) {
  'use strict';

  // Reusable observation step (no command).
  function obs(text, acc, note) { return { text: text, acc: acc || null, note: note || null }; }

  // ---- PWR -----------------------------------------------------------------
  var PWR = [
    {
      id: 'pwr_startup', category: 'startup',
      title: 'Reactor startup — approach to criticality',
      purpose: 'Take the reactor from Hot Standby (subcritical, hot) up to a low, controlled power by withdrawing the Control Rods, watching the Startup Rate (SUR) and reactor period.',
      from: 'hot_zero_power',
      prereq: ['Plant at Hot Standby: subcritical, hot, at operating temperature/pressure.', 'Reactor Coolant Pumps (RCP) running — forced flow established.', 'Boron high and rods inserted (the plant is held subcritical).'],
      cautions: ['Withdraw in small increments — keep SUR ≤ 1 decade per minute (DPM) and reactor period ≥ 30 s.', 'This trainer lumps all control rods into one coarse group with only Doppler feedback, so power OVERSHOOTS its settling point on the way up. A real plant approaches criticality far more finely (fine rod control + a neutron source, held just-critical).'],
      steps: [
        { text: 'Confirm the plant is subcritical and hot: reactivity below zero, average coolant temperature (Tavg) ≈ 304 °C, primary pressure ≈ 15.4 MPa.', control: '(observe)', target: 'subcritical, hot', hold: 2, acc: { p: 'reactivity_pcm', op: '<', v: 0 } },
        { text: 'Withdraw the Control Rods in small increments toward criticality. Power begins to climb once you pass critical; keep the Startup Rate (SUR) low and the reactor period long.',
          control: 'Rods → Raise (Slow)', target: 'SUR ≤ 1 DPM, reactor period ≥ 30 s',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 26, speed: 'normal' }, hold: 220,
          saw: { p: 'startup_rate_dpm', op: '>', v: 0 }, acc: { p: 'power_pct', op: '>', v: 1 },
          note: 'If the period drops below 30 s, stop or insert — the reactor is accelerating.' },
        obs('Let the negative feedback (Doppler / Moderator Temperature Coefficient) settle power at the new point. Trim rods to hold it steady.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor critical and producing measurable, controlled power; ready to continue the ascension.',
    },
    {
      id: 'pwr_raise_power', category: 'power',
      title: 'Raise power',
      purpose: 'Increase reactor power and electrical output by withdrawing rods a little and letting the turbine take more load.',
      from: '50_percent',
      prereq: ['Reactor critical and stable at partial power.', 'Turbine on line.'],
      cautions: ['Keep the power ramp modest; let temperatures and xenon follow.'],
      steps: [
        { text: 'Withdraw the Control Rods a few steps to add reactivity.', control: 'Rods → Nudge Out',
          target: 'small, steady power rise', cmd: { action: 'rod_nudge', group_id: 'control', steps: 6, speed: 'normal' }, hold: 60,
          acc: { p: 'power_pct', op: '>', v: 50.5 } },
        { text: 'Raise the Turbine Load to match the higher reactor power and send more electricity to the grid.', control: 'Turbine Load',
          target: '≈ 700 MWe', cmd: { action: 'set_steam_demand', mwe: 700 }, hold: 40, acc: { p: 'power_pct', op: '>', v: 52 } },
      ],
      guard: { never_melted: true },
      outcome: 'Power and electrical output settle at a higher point.',
    },
    {
      id: 'pwr_lower_power', category: 'power',
      title: 'Lower power',
      purpose: 'Reduce reactor power and load by inserting rods and reducing turbine demand.',
      from: 'hot_full_power',
      prereq: ['Reactor at power, turbine on line.'],
      cautions: ['Watch that the Steam Generator (SG) level does not swell excessively as load drops.'],
      steps: [
        { text: 'Reduce the Turbine Load.', control: 'Turbine Load', target: '≈ 600 MWe', cmd: { action: 'set_steam_demand', mwe: 600 }, hold: 10 },
        { text: 'Insert the Control Rods a few steps to lower reactor power.', control: 'Rods → Nudge In',
          target: 'power falling', cmd: { action: 'rod_nudge', group_id: 'control', steps: -10, speed: 'normal' }, hold: 90,
          acc: { p: 'power_pct', op: '<', v: 98 } },
      ],
      guard: { never_melted: true },
      outcome: 'Power settles at a lower point; the plant remains stable.',
    },
    {
      id: 'pwr_pressure_control', category: 'control',
      title: 'Pressurizer pressure control',
      purpose: 'Hold primary pressure at ≈ 15.41 MPa using the Pressurizer (PZR) heaters (raise) and spray (lower).',
      from: 'hot_full_power',
      prereq: ['Reactor at power, pressurizer at normal level.'],
      cautions: ['Low pressure erodes the subcooling margin toward boiling; high pressure approaches the relief setpoint (16.20 MPa).'],
      steps: [
        obs('Read the primary pressure — normal is ≈ 15.41 MPa.', null),
        { text: 'To LOWER pressure, open the Pressurizer spray — it condenses steam in the pressurizer.', control: 'PZR Spray',
          target: 'pressure decreasing', cmd: { action: 'set_spray', open: true }, hold: 40, acc: { p: 'pressure_mpa', op: '<', v: 15.41 },
          note: 'Turn spray back off (return to Auto) once pressure is where you want it.' },
      ],
      guard: { never_melted: true },
      outcome: 'Primary pressure controllable via spray (down) and heaters (up).',
    },
    {
      id: 'pwr_sg_level', category: 'control',
      title: 'Steam Generator level control',
      purpose: 'Control Steam Generator (SG) water level with feedwater flow.',
      from: 'hot_full_power',
      prereq: ['Reactor at power, main feedwater available.'],
      cautions: ['On a fast power/level change the SG level indication briefly moves the WRONG way (shrink-and-swell) — do not overreact.'],
      steps: [
        obs('Read SG level — normal is ≈ 65 %.', null),
        { text: 'Raise feedwater flow to RAISE Steam Generator level.', control: 'Feedwater Flow', target: 'level rising',
          cmd: { action: 'set_feedwater_flow', pct: 100 }, hold: 40, acc: { p: 'sg_level_pct', op: '>', v: 60 } },
      ],
      guard: { never_melted: true },
      outcome: 'SG level responds to feedwater flow as expected.',
    },
    {
      id: 'pwr_shutdown', category: 'shutdown',
      title: 'Normal shutdown to Hot Standby',
      purpose: 'Shut the reactor down: take the turbine off load, then insert the rods. Decay heat continues and must keep being removed.',
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
      outcome: 'Reactor shut down at Hot Standby; decay heat being removed.',
    },
    {
      id: 'pwr_loss_of_feedwater', category: 'emergency',
      title: 'Loss of main feedwater',
      purpose: 'Main feedwater is gone and the Steam Generators (SG) are drying out. Trip the reactor and establish Auxiliary Feedwater (AFW) as the heat sink.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: ['Without a secondary heat sink, primary temperature and pressure rise quickly.'],
      steps: [
        { text: 'Confirm the loss of feedwater — Steam Generator level is falling.', control: '(observe SG level)', target: 'diagnose',
          cmd: { action: 'inject_failure', failure_id: 'loss_of_feedwater' }, hold: 20, acc: { p: 'sg_level_pct', op: '<', v: 65 } },
        { text: 'Trip the reactor to stop adding heat (this would also occur automatically on low SG level).', control: 'SCRAM',
          target: 'power collapsing', cmd: { action: 'scram' }, hold: 5 },
        { text: 'Take the turbine off load.', control: 'Turbine Load', target: '0 MWe', cmd: { action: 'set_steam_demand', mwe: 0 }, hold: 5 },
        { text: 'Start Auxiliary Feedwater (AFW) to restore the secondary heat sink.', control: 'AFW (Aux Feedwater)', target: 'core cooled',
          cmd: { action: 'set_afw', active: true }, hold: 120, acc: { p: 'power_pct', op: '<', v: 5 } },
        obs('Confirm the core is safe and decay heat is being removed.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor tripped, secondary heat sink restored on AFW, core safe.',
    },
    {
      id: 'pwr_rcp_trip', category: 'emergency',
      title: 'Reactor coolant pump trip / loss of flow',
      purpose: 'A Reactor Coolant Pump (RCP) has tripped and coolant flow is falling. Confirm the protective trip and stabilize.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: ['Low flow lets heat build locally — the low-flow trip protects the core.'],
      steps: [
        { text: 'The pump has tripped — coolant flow is coasting down. The reactor trips automatically on low flow.', control: '(observe flow)', target: 'reactor trips',
          cmd: { action: 'inject_failure', failure_id: 'rcp_trip' }, hold: 15 },
        { text: 'Trip the reactor if it has not already tripped, and remove turbine load.', control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 30, acc: { p: 'power_pct', op: '<', v: 8 } },
        obs('Confirm shutdown and adequate cooling on natural circulation / decay heat.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor safely shut down after loss of forced flow.',
    },
    {
      id: 'pwr_stuck_porv', category: 'emergency',
      title: 'Stuck-open relief valve (small-break LOCA) — recover',
      purpose: 'The Power-Operated Relief Valve (PORV) is stuck open — a small-break Loss-Of-Coolant Accident (LOCA) — while its indicator may read closed. Diagnose on the subcooling margin and ISOLATE with the block valve. This is the TMI recovery that was missed in 1979.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: ['Do NOT trust the PORV position light — it shows the command, not reality.', 'Do NOT throttle High-Pressure Injection (HPI) on a rising Pressurizer level; the level rises even as inventory is lost.'],
      steps: [
        { text: 'The PORV is stuck open and its indicator reads closed. Inventory is leaking. Diagnose it on the SUBCOOLING MARGIN, which erodes toward zero as coolant is lost.', control: '(observe subcooling)', target: 'recognize the leak',
          cmd: { action: 'inject_failure', failure_id: 'stuck_porv_open' }, hold: 30, acc: { p: 'core_inventory_pct', op: '<', v: 100 } },
        { text: 'Also mask the indicator, as at TMI, to see how the light lies.', control: '(observe PORV light vs subcooling)', target: 'trust subcooling, not the light',
          cmd: { action: 'inject_failure', failure_id: 'porv_indicator_stuck_closed' }, hold: 10 },
        { text: 'ISOLATE the leak: close the PORV block valve. This stops the loss even though the PORV itself is stuck open.', control: 'PORV Block Valve — Close', target: 'inventory stops falling',
          cmd: { action: 'close_block_valve' }, hold: 60, acc: { p: 'melted', op: '<', v: 1 },
          note: 'With the leak isolated, restore inventory and pressure with HPI / charging.' },
        obs('Confirm inventory has stabilized and the core stays covered.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Leak isolated with the block valve; core stays covered — the recovery TMI missed.',
    },
    {
      id: 'pwr_tmi', category: 'accident', narrative: true,
      title: 'Three Mile Island (1979) — an accident of information',
      purpose: 'The famous accident where an indicator said a valve was shut while it was stuck open — so the crew throttled the very injection that would have saved the core.',
      from: 'hot_full_power',
      steps: [
        obs('Main feedwater is lost; the reactor trips; pressure rises and the Power-Operated Relief Valve (PORV) opens automatically (~16.2 MPa).'),
        obs('The PORV sticks OPEN — but its indicator light reads CLOSED. Coolant is now leaking, invisibly. Nothing on the board distinguishes it from a normally-shut valve. (Inject stuck_porv_open + porv_indicator_stuck_closed to reproduce.)'),
        obs('As coolant boils off, the Pressurizer (PZR) level RISES — fooling the crew into thinking the plant is going "solid," so they throttle High-Pressure Injection (HPI). In fact total inventory is FALLING.'),
        obs('The truth-teller is the SUBCOOLING MARGIN — it erodes toward zero as the coolant reaches saturation. Trust it over the valve light.'),
        obs('OUTCOMES — keep injecting (and isolate the PORV with its block valve): the core stays covered. Throttle injection as in 1979: the core uncovers and is damaged. Same start, opposite outcome.'),
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
      cautions: ['Go slow — the RBMK can accelerate on you at low power (positive void feedback).', 'Keep the Startup Rate (SUR) low and the ORM above the minimum (15 pre-1986 / 43 post-1986) throughout.'],
      steps: [
        obs('Confirm Hot Standby: reactivity below zero, channel flow up, ORM healthy.', { p: 'reactivity_pcm', op: '<', v: 0 }),
        { text: 'Withdraw the Control Rods SLOWLY toward criticality; watch the Startup Rate (SUR) and the Operating Reactivity Margin (ORM).',
          control: 'Rods → Raise (Slow)', target: 'SUR low, ORM above minimum',
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
        { text: 'Reduce the Main Circulation Pump (MCP) flow setpoint a little. More steam bubbles → more power.', control: 'Coolant Flow (MCP)',
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
        { text: 'Press AZ-5 to insert all rods.', control: 'AZ-5 (SCRAM)', target: 'power collapsing', cmd: { action: 'manual_scram' }, hold: 40, acc: { p: 'power_pct', op: '<', v: 8 } },
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
        { text: 'Pumps trip — channel flow is coasting down and power is rising on the increasing void.', control: '(observe flow / power)', target: 'diagnose',
          cmd: { action: 'inject_failure', failure_id: 'mcp_trip' }, hold: 6 },
        { text: 'Initiate AZ-5 promptly to shut the reactor down.', control: 'AZ-5 (SCRAM)', target: 'power collapsing',
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
        obs('The reactor is in the danger zone: very low power, poisoned with xenon, almost all rods withdrawn (ORM far too low), and the automatic Emergency Protection System (EPS) switched off.'),
        obs('AZ-5 is pressed to shut down. On the PRE-1986 design the graphite tips of the rods enter first and briefly ADD reactivity at the bottom of the core (the positive scram effect). (Select the pre-1986 design and press AZ-5.)'),
        obs('That kick, amplified by the positive void feedback at low power, drives the reactor prompt-critical — power explodes upward and the core is destroyed by a steam explosion.'),
        obs('On the POST-1986 design — same button, same conditions — there is no positive kick and the void feedback is weaker, so the reactor simply shuts down. This comparison is the whole lesson.'),
        obs('Note: this trainer shows the mechanism and outcome faithfully but understates the peak magnitude (the real event was a localized, three-dimensional excursion).'),
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
        { text: 'Withdraw the Control Rods to reach criticality and start the climb; the negative void feedback keeps it stable.',
          control: 'Rods → Raise', target: 'positive SUR, controlled climb',
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
      cautions: ['Recirc flow is the primary control; rods are for coarse/shutdown moves.'],
      steps: [
        { text: 'Increase the Recirculation (recirc) flow setpoint. Fewer voids → positive reactivity → power rises and self-limits.',
          control: 'Recirculation Flow', target: 'power rises to a new balance',
          cmd: { action: 'set_recirc_flow', pct: 40 }, hold: 90, acc: { p: 'power_pct', op: '>', v: 55 } },
      ],
      guard: { never_melted: true },
      outcome: 'Power rises and settles at a higher balance.',
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
        { text: 'All AC power is lost; recirculation and main feedwater are gone and the plant isolates (Main Steam Isolation Valve closes).', control: '(observe)', target: 'diagnose SBO',
          cmd: { action: 'inject_failure', failure_id: 'station_blackout' }, hold: 10 },
        { text: 'Scram the reactor.', control: 'SCRAM', target: 'power collapsing', cmd: { action: 'scram' }, hold: 5 },
        { text: 'Start Reactor Core Isolation Cooling (RCIC) — it runs on reactor steam and battery power, no AC needed — to hold the vessel level.',
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
        obs('The reactor is scrammed with all AC power lost; Reactor Core Isolation Cooling (RCIC) has started and is holding the vessel level.'),
        obs('RCIC keeps the core covered for hours — the grace window. Use time acceleration to move through it.'),
        obs('When the batteries deplete, RCIC stops. With no injection, decay heat boils the water away and the core heads toward uncovery within a few hours.'),
        obs('INTERVENTION — before the core uncovers: open the relief valves to drop pressure (Automatic Depressurization System or manual relief), then inject with the low-pressure systems (Low-Pressure Coolant Injection / core spray). The core is saved. Same start, opposite outcome.'),
        obs('Note: the simulation ends at fuel damage; the later containment and hydrogen-explosion events are described, not modeled.'),
      ],
    },
  ];

  RD.MANUAL_PROCEDURES = { pwr: PWR, rbmk_pre: RBMK, rbmk_post: RBMK, bwr: BWR };

})(globalThis.RD || (globalThis.RD = {}));
