# Three Mile Island Unit 2 — the incident walkthrough

**Walkthrough id: `pwr_tmi2_incident`  ·  20 steps  ·  narrative**

> Edit this freely — it is the step text, and it is what the sim is brought down to.
> Agent notes go at the END of the file, never between the steps.

---

## Step 1

Verify the plant is at full power: REACTOR POWER near 100 % with the TURBINE-GENERATOR carrying load.

**04:00**

- **Saw:** A routine night, eleven hours into a run near full power. Two men were clearing a blocked condensate polisher in the basement.
- **Knew:** Nothing was wrong with the reactor.
- **Did:** They carried on with the polisher.

Note: The failures arrive on their own. The defeated trip is real on this plant and is defeated only here.

Background

One protection channel is out of service before this begins: the reactor trip that fires when the turbine trips. Without it, pressure reaches the relief valve before the reactor trips — the order that morning went in.

[HIGHLIGHTED: Reactor Power, Turbine Load (steady)]

_(behind the scenes: fires: anticipatory_trip_failure)_


## Step 2

No action. Read what has just happened in the basement, then press Continue.

**04:00:36**

- **Saw:** Water got into the instrument air line to the polisher valves and they shut. The condensate pump lost its flow path and tripped.
- **Knew:** A polisher blockage in the basement. Nothing was wrong with the reactor.
- **Did:** They carried on clearing the resin.

Note: Nothing on the board moves. The trouble is two rooms away, in the condensate system.

Background

A condensate polisher cleans feedwater on its way back from the condenser — the last thing anyone would expect to start a core-damage accident. This plant has none, so this beat is told rather than simulated.


## Step 3

No action. The condensate and main feed pumps have tripped. The clock stops here: read the board, then press Continue.

**04:00:37**

- **Saw:** Both main feedwater pumps tripped and the alarms came in a wall.
- **Knew:** A feedwater transient, which they had drilled.
- **Did:** They took the trip and watched pressure climb.

Note: Watch PRIMARY PRESSURE once you press Continue: it peaks near 2340 psi about 6 seconds in and is falling again by 35 seconds.

Background

The condensate pumps had nowhere to send water and tripped, and the main feed pumps went with them. Feedwater to both steam generators is gone, and the heat has one way out: the relief valve on top of the pressurizer.

[HIGHLIGHTED: Feed Flow, Plant Pressure (steady)]

_(behind the scenes: fires: loss_of_feedwater, stuck_porv_open  ·  PAUSES the sim when it fires)_


## Step 4

Verify the turbine has tripped: the TRIP button lit on the TURBINE-GENERATOR card.

**04:00:37**

- **Saw:** The turbine tripped, "normal following trip of feedwater pumps".
- **Knew:** The expected consequence of losing feed.
- **Did:** They moved to the post-trip checks.

Background

A turbine cannot run without feedwater, so it trips within a second or two. The reactor should have tripped with it, but that channel is out of service, so it is still at power with nowhere to put its heat.

[HIGHLIGHTED: Turbine Load (steady)]


## Step 5

Verify the steam generators are drying out: STEAM GENERATOR LEVEL falling below 55 %.

**04:00:37**

- **Saw:** The auxiliary feed pumps started automatically, and the board said so.
- **Knew:** The heat sink was being restored.
- **Did:** Nobody checked whether the water was getting past the block valves.

Note: AFW is auxiliary feedwater, the backup pumps that feed a steam generator when the main ones are gone. The AFW card shows its pumps running, which is not the same as flow, and nothing on this board draws the difference.

Background

The auxiliary feed pumps started by themselves, as they are meant to, but their discharge valves are shut, so they deliver nothing. It took the crew eight minutes to find them.

[HIGHLIGHTED: AFW, SG Level (steady)]

_(behind the scenes: fires: afw_failure)_


## Step 6

No action. The relief valve lifted and has not reseated. Look at the PORV lamp, then the temperature under it.

**04:00:40**

- **Saw:** Pressure reached 2255 psi and the valve opened as designed. It was told to shut at 13 seconds, and its light went out.
- **Knew:** "Light off indicates solenoid deenergized. There is no actual position indicator."
- **Did:** They read the dark lamp as a shut valve and moved on.

Note: PORV is the relief valve on top of the pressurizer. Its lamp reads CLOSED from here on and it is wrong; the honest indication is the pipe below the valve, near 120 °F seated and climbing toward 480 °F when it is passing steam.

Background

Pressure reached the relief valve setpoint and the valve opened, as designed. It did not shut again, and the lamp reads the solenoid rather than the disc — so the board says CLOSED on a valve that is open.

[HIGHLIGHTED: Relief Valve (PORV) (steady)]

_(behind the scenes: fires: porv_indicator_stuck_closed  ·  PAUSES the sim when it fires)_


## Step 7

Verify the reactor has tripped: REACTOR POWER collapsing and the REACTOR TRIP alarm in.

**04:00:45**

- **Saw:** Pressure spiked near 2255 psi and the relief valve opened as designed. Eight seconds in, the reactor tripped on high pressure.
- **Knew:** The plant was doing what a plant does after a feedwater trip.
- **Did:** They read the trip and moved to the post-trip checks.

Background

At Three Mile Island the relief valve opened at 3 seconds and the reactor tripped 5 seconds later on high pressure. Here the valve is larger for the power it serves, so it turns the pressure first and the trip comes near 53 seconds.

[HIGHLIGHTED: Reactor Power (steady)]


## Step 8

Verify the relief valve reading: the PORV light reads CLOSED, and the temperature under it is above 240 °F.

**04:01:07**

- **Saw:** The relief valve light went out at 13 seconds, which means the solenoid lost power. Thirty seconds in, the discharge line alarmed at 239 degrees.
- **Knew:** A hot discharge line was expected for a while after any lift.
- **Did:** They read the hot pipe as leftover heat and moved on.

Background

A seated relief valve leaves that pipe near 120 °F; a valve passing steam cooks it toward 480 °F. The pipe is the honest indication here, and the lamp is not.

[HIGHLIGHTED: Relief Valve (PORV) (steady)]


## Step 9

Verify safety injection has started by itself: the ECCS card shows the high-pressure pump running.

**04:02:39**

- **Saw:** Pressure dropped through 1600 psi and the emergency injection started on its own.
- **Knew:** Pressurizer level was climbing fast at the same time, which their training said meant the system was filling.
- **Did:** They watched the level climb and prepared to stop the filling.

Note: Two readings look wrong and are not. PRESSURIZER LEVEL is FALLING here, bottoming near 40 % before it climbs — the direction is the point. ECCS FLOW reads 0 GPM because the plant is still above the pump discharge pressure; flow starts below about 1390 psi.

Background

Pressure has fallen through the injection setpoint and the plant started the high-pressure pumps on its own. That is right: the plant is losing water through a valve nobody knows is open.

[HIGHLIGHTED: ECCS, HPI/LPI (steady)]


## Step 10  ·  **AS TAKEN — recorded history, not a recommendation**

Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the SI REACTOR TRIP row.

**04:03:50**

- **Saw:** Pressurizer level climbing hard while pressure fell.
- **Knew:** Level and pressure were saying opposite things, and level was the gauge they trusted.
- **Did:** They took the automatic injection out of service before touching a valve.

Control: Trip Blocks  ·  Target: SI REACTOR TRIP blocked — its button now reads RELEASE?

10a. SI actuation blocked

Note: The row prints 1715 psi — where the safety-injection trip fires, not where the block is allowed. The block is a request, not a switch: above 1972 psi the plant takes it away again.

Background

SI is safety injection, and the block is a permissive: the plant allows it only below 1972 psi. Blocking stops the plant restarting injection by itself, and nothing on the board says the core has just been put on the operator alone.

[HIGHLIGHTED: Trip Blocks (pulsing)]


## Step 11  ·  **AS TAKEN — recorded history, not a recommendation**

Press STOP on the ECCS card to shut the high-pressure injection down.

**04:05:07**

- **Saw:** Pressurizer level climbing toward the top of its scale, 255 inches and rising, with pressure falling at the same time.
- **Knew:** "The condition to avoid at all costs is going solid." A pressurizer full of water leaves nowhere to control pressure from.
- **Did:** They throttled the injection valves, stopped a makeup pump and opened letdown to its high limit.

Control: ECCS  ·  Target: the high-pressure pump stopped, with PRESSURIZER LEVEL still climbing

Note: The plant refuses this press for about a minute after injection starts, while its reset timer runs.

Background

The level was rising because the water was boiling: steam under the pressurizer pushes water up into it, so level goes up while the plant empties. Every operator of that era was trained that a solid pressurizer was the thing to avoid at all costs.

[HIGHLIGHTED: ECCS, HPI/LPI (pulsing)]


## Step 12

Verify PRESSURIZER LEVEL has gone to the top of its scale and is sitting there.

**04:06:28**

- **Saw:** The level indicator went off the top of its scale, past 400 inches.
- **Knew:** Their training said the only credible check on how much coolant was in the system was the pressurizer level.
- **Did:** They kept letdown wide open and injection off, working to bring the level back down.

Note: The vessel on the diagram is still drawn full, and that is right: about 6 % of the coolant is gone and none of the core is uncovered yet. Half of it uncovers near 35 plant-minutes.

Background

The one gauge the crew had for how much water was in the plant now reads full while the plant empties. Level is not inventory: steam in the hot legs drives water up the surge line, so the pressurizer fills as the core loses water.

[HIGHLIGHTED: Pressurizer Level (steady)]


## Step 13

Verify SUBCOOLING MARGIN has reached zero and the pump cavitation alarm is in.

**04:06:28**

- **Saw:** The coolant reached saturation — nothing left between it and boiling — and four minutes later, ten minutes in, the first reactor coolant pump high-vibration alarm came in.
- **Knew:** "Indication of voids in system. Apparently not recognized."
- **Did:** They left the pumps running.

13a. SUBCOOLING MARGIN at or below 1 °F
13b. the pump cavitation alarm is standing

Background

Subcooling margin is how far the water is from boiling, and at zero it is not a margin any more. The pumps are pushing a froth of steam and water, which is what the vibration is.

[HIGHLIGHTED: Subcooling Margin, Reactor Coolant Pumps (RCP) (steady)]


## Step 14

Open the auxiliary feedwater block valves: click the valve symbol directly above the AFW card.

**04:08:37**

- **Saw:** Low generator level, low steam pressure and high auxiliary feed discharge pressure — three cues to a blocked line.
- **Knew:** The auxiliary pumps were running. Nobody had checked whether the water was getting past the valves.
- **Did:** An operator found the two block valves shut and opened them.

Control: AFW  ·  Target: STEAM GENERATOR LEVEL back above 5 %, climbing off zero

Note: One symbol here, two valves: one click opens both of the crew's.

Background

The auxiliary pumps have been running eight minutes into shut valves, delivering nothing. Opening them puts the heat sink back: flow is rated within 30 seconds, and the dry generators take about 9 plant-minutes to show level.

[HIGHLIGHTED: AFW (pulsing); SG Level (steady)]


## Step 15  ·  **AS TAKEN — recorded history, not a recommendation**

Press OFF on the reactor coolant pumps to secure them.

**05:13:37**

- **Saw:** Rising vibration on the loop B pumps, with flow and amperage falling away.
- **Knew:** "Further operation could cause severe damage." The pumps had been running without suction head for an hour.
- **Did:** They stopped the loop B pumps, and the loop A pumps 28 minutes later.

Control: RCP ON/OFF  ·  Target: the pump cavitation alarm clears

15a. SUBCOOLING MARGIN pegged on the bottom of its scale at -50 °F
15b. the pump cavitation alarm clears

Note: One handswitch here for all the pumps. The crew stopped the loop B pumps at 1 hour 13 minutes and the loop A pumps 28 minutes later.

Background

The pumps have been shaking for over an hour because they are pumping steam as much as water. Securing them is the right answer to a cavitating pump, and it also removes the only thing stirring the core.

[HIGHLIGHTED: RCP Run/Stop (pulsing); Subcooling Margin (steady)]


## Step 16

Verify PRESSURIZER LEVEL is falling: below 50 % and still going down.

**05:41:37**

- **Saw:** All four pumps off, and the loops going quiet.
- **Knew:** They believed the system was full, because the pressurizer had said so for the better part of an hour.
- **Did:** They kept feeding the steam generators and waited for a picture that made sense.

Background

The gauge that read full for 48 minutes is falling now, and nothing has been put right: the plant is too empty to hold the pressurizer up any longer. From here the core boils and uncovers with the relief valve still open.

[HIGHLIGHTED: Pressurizer Level, Plant Pressure (steady)]


## Step 17

Verify SUBCOOLING MARGIN is pegged on the bottom of its scale at -50 °F.

**06:11:37**

- **Saw:** The loop A hot leg read off the top of its scale, so the average coolant temperature could not be shown correctly.
- **Knew:** Instruments were reading past their limits and the printer was hours behind.
- **Did:** They went on treating pressurizer level as the measure of how much water was in the plant.

Note: The margin reaches this floor near 57 plant-minutes and sits on it until the relief line is isolated — so it is almost certainly already there when you arrive.

Background

This tile stops at -50 °F: the coolant is further past boiling than the instrument can show. The instrument has run out of scale, and the core is uncovering.

[HIGHLIGHTED: Subcooling Margin (steady)]


## Step 18

Close the PORV block valve: one click on the small valve symbol just left of the PORV.

**06:18:37**

- **Saw:** The relief line discharge running about 30 degrees hotter than the safety valve discharge lines.
- **Knew:** A relieving shift supervisor set the pressurizer level aside and read the temperatures instead. His conclusion was that the relief valve was leaking.
- **Did:** He ordered the block valve shut, and pressure began to rise within minutes.

Control: PORV Block Valve  ·  Target: PRIMARY PRESSURE rising above 750 psi and the tailpipe temperature falling

18a. PRIMARY PRESSURE above 750 psi
18b. PORV tailpipe temperature below 400 °F

Note: One click shuts this valve and a second opens it again, so click once. The crew opened and shut it again twice more over the next hour and a half; this walkthrough closes it once.

Background

This is the first correct move of the morning and it takes 2 hours 18 minutes to arrive. Closing the block valve isolates the relief line whether or not the relief valve is shut: pressure turns upward within about 2 plant-minutes and the discharge pipe starts cooling.

[HIGHLIGHTED: PORV Block Valve (pulsing); Primary Pressure (steady)]


## Step 19

Press START on the ECCS card to put high-pressure injection back in.

**07:20:37**

- **Saw:** Pressure low enough to justify starting the emergency systems by hand.
- **Knew:** The tank the injection water comes from had alarmed low, so injection felt like something to spend carefully.
- **Did:** They started a makeup pump, and stopped it again 17 minutes later.

Control: ECCS  ·  Target: SUBCOOLING MARGIN back above 10 °F

Background

Injection is the only thing that puts water back, and SUBCOOLING MARGIN says whether it is working. The crew did not sustain it: their borated water tank alarmed low, so they stopped the pump again 17 minutes later. Here it stays in.

[HIGHLIGHTED: ECCS, HPI/LPI (pulsing); Subcooling Margin (steady)]


## Step 20

Press ON for the reactor coolant pumps to restore forced circulation.

**19:50:37**

- **Saw:** Nearly sixteen hours in, a pump started and ran satisfactorily. Core cooling was established.
- **Knew:** Almost nothing about the state of the core. The instrument that would have told them did not exist.
- **Did:** They kept the pump running. "All will grope in bewilderment for another whole day before the truth strikes."

Control: RCP ON/OFF  ·  Target: RCP FLOW back above 80 %

Note: Core damage, containment radiation and the hydrogen burn are not modelled on this plant. Everything up to this step was.

Background

Forced flow returns within 40 seconds, but the margin and the inventory follow slowly — expect to hand the plant back with alarms still standing. Fuel damage, the containment radiation alarms and the hydrogen burn are outside this model and are told here rather than run. That gap is the fuel temperature: uncovering 94 % of this core never gets the fuel above 1130 °F, where the real one went far past 2500 °F.

[HIGHLIGHTED: RCP Run/Stop (pulsing); Subcooling Margin (steady)]
