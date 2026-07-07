/*
 * bwr_fukushima.js — Fukushima Daiichi (BWR campaign, Act III boss).
 *
 * March 11, 2011, from the engine's post_scram_sbo state: reactor tripped,
 * station blacked out, RCIC alone holding the level line. The instructor
 * compresses hours; the batteries fail (injected — historically the
 * tsunami drowned the DC rooms); RCIC coasts and dies; the player gets the
 * one decision the Unit 1 crew had — the isolation condenser — which buys
 * hours, not salvation (measured: IC path uncovers ~4 h later than the
 * bare path). Both branches end at core uncovery: this is a witnessing of
 * a SUPPORT failure, the third and final kind of accident. Honesty beats
 * cover the model boundary (no venting/hydrogen/seawater phase).
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.bwr_fukushima = {
    id: 'bwr_fukushima',
    title: 'Fukushima Daiichi — The Long Night',
    plant_id: 'bwr',
    design_version: null,
    initial_state: 'post_scram_sbo',
    mode: 'demonstration',
    description: 'March 11, 2011. The reactor survived the earthquake. Now the water is coming for its batteries.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'March 11, 2011, 15:41. The earthquake came 55 minutes ago — and the plant SURVIVED it: rods in, reactor tripped, textbook. Then the sea rose fourteen meters. Look at your board: station blackout — the grid is gone AND the diesel generators are drowned. One system is holding the water line over the fuel: RCIC, the steam-driven pump you met in the isolation drill, breathing the reactor\'s own decay steam, steered by a thinning thread of battery power. The reactor is not the problem. The SUPPORT is. Hours are about to pass.',
          industry: 'Unit-1-style SBO reconstruction from post-trip state: LOOP + EDG inundation, RCIC injecting on steam + DC. Decay heat ~1.5% and falling. The accident class under study: sustained support failure. Time compression through the hold phase.',
        },
        speed: 60,
        advance: 'wait_for_trigger' },

      { id: 'batteries_die',
        trigger: { type: 'delay', value: 240.0 },
        commentary: {
          learning: 'The battery rooms flooded. DC power — the thread steering RCIC — is dying. The pump will coast on stubbornness for a while, and then the level line will be on its own. In the real dark of that night the operators read gauges by flashlight and car batteries scavenged from the parking lot. You have one card they had at Unit 1: the ISOLATION CONDENSER — an ancient, beautiful device that needs NO power at all, just valves: reactor steam rises to a rooftop water tank, condenses, and falls back as cool water. Open it — or hold it in reserve. Your call, operator.',
          industry: 'DC exhaustion injected (historically: tsunami inundation of DC distribution). RCIC control degrading toward failure. Available action: isolation condenser initiation (passive, valve-alignment only — the Unit 1 IC). Decision window open.',
        },
        inject_failures: ['early_battery_failure'],
        speed: 60,
        branches: [
          { trigger: { type: 'operator_action', command: 'set_ic' }, goto: 'ic_path' },
          { trigger: { type: 'inaction', window: 300.0 }, goto: 'bare_path' },
        ] },

      { id: 'ic_path',
        trigger: { type: 'delay', value: 5.0 },
        commentary: {
          learning: 'Isolation condenser OPEN — and look at the pressure DIVE. No pump, no power, just physics: steam climbs, rain falls, heat leaves. You have bought the core hours of life, and in those hours real help could arrive — fire trucks, seawater lines, portable generators. This is why the decision mattered. But watch honestly: the condenser tank is finite, the batteries that held its valves are finite, and the night is longer than both. I am compressing the hours.',
          industry: 'IC in service: passive heat rejection, vessel pressure falling toward ~1 MPa, fuel temperature declining. Time bought ≈ hours (tank inventory + valve-state dependency on residual DC). Historically Unit 1\'s IC operated intermittently — valve state ambiguity in the blackout. Compressing.',
        },
        speed: 600,
        advance: 'wait_for_trigger' },

      { id: 'ic_uncover',
        trigger: { type: 'true_state', field: 'vessel_level_pct', direction: 'below', value: 20.0 },
        commentary: {
          learning: 'The condenser gave everything it had — hours of grace — and then its valves, orphaned by the dead batteries, fell closed. Pressure returned, the boil-off resumed, and now the level line is sliding below the fuel. Understand what you are seeing: nothing FAILED here in the way a valve sticks or a rod jams. Every machine did its duty until its support ran out. This simulation ends at uncovery — the hydrogen, the explosions, the seawater decision, the evacuations belong to history. Three accidents, three lessons: TMI was an accident of INFORMATION. Chernobyl was an accident of DESIGN. Fukushima was an accident of SUPPORT — and support means the boring things: diesels on high ground, batteries above the waterline, a vent you can open in the dark. Nuclear safety is plumbing and paranoia, forever.',
          industry: 'IC exhausted/isolated on DC loss; boil-off resumed; core uncovery in progress. Model boundary: simulation terminates pre-fuel-damage phase (no H2 generation/venting/alternative injection modeled). Comparative taxonomy complete: information (TMI) / design (Chernobyl) / support (Fukushima). Defense-in-depth siting and support-system hardening are the enduring corrective actions.',
        },
        speed: 1,
        level_complete: {
          title: 'Fukushima — The Hours You Bought',
          outcome_learning: 'The condenser needed nothing but valves, and it gave the core hours. Support is a safety system.',
          outcome_industry: 'SBO progression witnessed with IC employment: passive heat removal, DC-dependency limits, uncovery endpoint.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'bare_path',
        trigger: { type: 'delay', value: 5.0 },
        commentary: {
          learning: 'The condenser stays closed — as it did, for reasons still debated, through the real first hours at Unit 1. So the night unwinds on RCIC\'s dying momentum alone. Watch the level line. I am compressing the hours; there is nothing else to do but watch, which was very nearly the truth of it.',
          industry: 'IC not initiated (historically plausible: valve-state confusion post-DC-loss). RCIC coastdown is the only injection. Level decay to uncovery follows. Compressing.',
        },
        speed: 600,
        advance: 'wait_for_trigger' },

      { id: 'bare_uncover',
        trigger: { type: 'true_state', field: 'vessel_level_pct', direction: 'below', value: 20.0 },
        commentary: {
          learning: 'RCIC fought until its steam and its stubbornness ran out, and now the water line is sliding below the fuel — the moment the word "Fukushima" came to mean. Nothing here failed the way a valve sticks: every machine did its duty until its SUPPORT died — grid, diesels, batteries, in one hour. This simulation ends at uncovery; the hydrogen and the seawater and the long recovery belong to history. Three accidents, three lessons, one campaign: TMI — believe your margins, not one light. Chernobyl — physics does not negotiate, design must. Fukushima — the boring systems are the safety systems. Rewind if you want to see what the isolation condenser could have bought.',
          industry: 'Uncovery on RCIC coastdown exhaustion. Model boundary as noted. Taxonomy: information / design / support. Rewind available to exercise the IC branch — recommended for the timeline comparison.',
        },
        speed: 1,
        level_complete: {
          title: 'Fukushima — The Long Night',
          outcome_learning: 'Every machine did its duty until its support died. Rewind and see what one set of valves could have bought.',
          outcome_industry: 'SBO progression witnessed without IC: RCIC coastdown to uncovery. IC branch available via Rewind.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
