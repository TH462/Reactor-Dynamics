;(function (RD) {
  "use strict";
  RD.MANUAL = {
    "_generated": "by tools/gen_manual_reference.js — do not hand-edit; re-run after engine/config changes",
    "pwr": {
      "id": "pwr",
      "plant": "pwr",
      "design_version": null,
      "name": "Pressurized Water Reactor (PWR)",
      "one_liner": "The stable, intuitive reactor — the best place to start. ~1000 MWe; the primary loop runs ≈ 15.41 MPa (kept high so it cannot boil), average coolant ≈ 304 °C.",
      "overview": "Water in the primary loop is held under high pressure so it never boils; it carries heat to the Steam Generators (SG), which boil a separate secondary loop that spins the turbine. Strong negative feedbacks — the Doppler effect (hotter fuel absorbs more neutrons) and the Moderator Temperature Coefficient (MTC) — make the plant self-regulating: it pushes back on change. Reactivity is trimmed with Control Rods and dissolved boron, adjusted by the Chemical & Volume Control System (CVCS: charging adds boron, letdown removes it). The Pressurizer (PZR) sets primary pressure using heaters, spray, and a Power-Operated Relief Valve (PORV) with an upstream block (isolation) valve. This reactor hosts the Three Mile Island (TMI) accident — an accident of information, in which an indicator read \"closed\" while the PORV was stuck open.",
      "authentic_units": "Real US PWRs are read in psia / °F; this trainer is SI internally (MPa / °C) with a display unit toggle.",
      "controls": [
        {
          "control": "Rods — Raise / Lower (hold)",
          "group": "Reactivity",
          "uses": "Hold to drive a rod group: Raise (withdraw) adds reactivity and raises power; Lower (insert) removes it. Release to stop.",
          "command": "rod_start",
          "params": "{group_id,direction,speed}"
        },
        {
          "control": "Rods — Nudge",
          "group": "Reactivity",
          "uses": "Move the rods a small, fixed amount (rate-limited, not instant) — for fine reactivity adjustments.",
          "command": "rod_nudge",
          "params": "{group_id,steps,speed}"
        },
        {
          "control": "Rods — Stop",
          "group": "Reactivity",
          "uses": "Stop the selected rod group.",
          "command": "rod_stop",
          "params": "{group_id}"
        },
        {
          "control": "Rods — Stop All",
          "group": "Reactivity",
          "uses": "Stop all moving rod groups.",
          "command": "rod_stop_all",
          "params": ""
        },
        {
          "control": "SCRAM",
          "group": "Safety",
          "uses": "Emergency shutdown — drives every rod fully in at once. A two-click armed button.",
          "command": "scram",
          "params": ""
        },
        {
          "control": "Boron — Borate / Dilute (CVCS)",
          "group": "Reactivity",
          "uses": "Chemical & Volume Control System (CVCS) boron: Borate raises boron (lowers power), Dilute lowers it (raises power). Needs the charging pump running.",
          "command": "set_boron_adjust",
          "params": "{rate}"
        },
        {
          "control": "Charging Pump On/Off (CVCS)",
          "group": "Reactivity",
          "uses": "Runs or stops the charging pump. Boration/dilution and charging need it running.",
          "command": "set_charging_pump",
          "params": "{running}"
        },
        {
          "control": "Charging Pump (CVCS)",
          "group": "Reactivity",
          "uses": "Charging injects coolant into the cold leg — raises primary inventory and carries the boron. Manual % or auto make-up.",
          "command": "set_charging_flow",
          "params": "{normalized}"
        },
        {
          "control": "Letdown Valve (CVCS)",
          "group": "Reactivity",
          "uses": "Letdown removes coolant from the Reactor Coolant System — lowers primary inventory.",
          "command": "set_letdown_flow",
          "params": "{normalized}"
        },
        {
          "control": "CVCS Inventory Control",
          "group": "Reactivity",
          "uses": "Auto modulates charging to make up identified leakage and hold inventory; Manual = you set charging/letdown.",
          "command": "set_cvcs_auto",
          "params": "{active}"
        },
        {
          "control": "PZR Heaters",
          "group": "Pressurizer",
          "uses": "Pressurizer (PZR) heaters boil water to RAISE primary pressure.",
          "command": "set_heater",
          "params": "{power_pct}"
        },
        {
          "control": "PZR Spray",
          "group": "Pressurizer",
          "uses": "Pressurizer spray condenses steam to LOWER primary pressure.",
          "command": "set_spray",
          "params": "{open}"
        },
        {
          "control": "PORV — Open",
          "group": "Pressurizer",
          "uses": "Opens the Power-Operated Relief Valve (PORV) to drop primary pressure quickly.",
          "command": "open_porv",
          "params": ""
        },
        {
          "control": "PORV — Close",
          "group": "Pressurizer",
          "uses": "Commands the PORV shut. NOTE: it can stick open while its indicator reads closed (the TMI trap).",
          "command": "close_porv",
          "params": ""
        },
        {
          "control": "PORV Block Valve — Open",
          "group": "Pressurizer",
          "uses": "Opens the isolation (block) valve upstream of the PORV, restoring the relief path.",
          "command": "open_block_valve",
          "params": ""
        },
        {
          "control": "PORV Block Valve — Close",
          "group": "Pressurizer",
          "uses": "Isolates the PORV line — stops the leak through a stuck-open PORV. The key TMI recovery action.",
          "command": "close_block_valve",
          "params": ""
        },
        {
          "control": "Feedwater Flow",
          "group": "Secondary",
          "uses": "Sets the make-up water flow to the boiler, as a percent of rated; used to control level.",
          "command": "set_feedwater_flow",
          "params": "{pct}"
        },
        {
          "control": "AFW (Aux Feedwater)",
          "group": "Secondary",
          "uses": "Auxiliary Feedwater (AFW) — the backup water supply to the Steam Generators when main feedwater is lost.",
          "command": "set_afw",
          "params": "{active}"
        },
        {
          "control": "Turbine Load",
          "group": "Turbine & Grid",
          "uses": "Sets how much electrical load the turbine/generator carries, in megawatts-electric (MWe). Raising it draws more steam.",
          "command": "set_steam_demand",
          "params": "{mwe}"
        },
        {
          "control": "Steam Dump / Bypass",
          "group": "Turbine & Grid",
          "uses": "Dumps steam straight to the condenser (bypassing the turbine) to control pressure on a load rejection.",
          "command": "set_steam_dump",
          "params": "{mode|pct}"
        },
        {
          "control": "HPI (Emergency Injection)",
          "group": "Safety",
          "uses": "High-Pressure Injection (HPI) forces make-up coolant into the core against pressure.",
          "command": "set_hpi",
          "params": "{active}"
        },
        {
          "control": "Decay-Heat Removal",
          "group": "Safety",
          "uses": "Decay-Heat Removal (DHR / RHR) — removes leftover heat after shutdown once cool and depressurized.",
          "command": "set_dhr",
          "params": "{active}"
        },
        {
          "control": "Automate Tab (per-control automation)",
          "group": "Automation",
          "uses": "Tools → Automate: an AUTO/MAN toggle per plant control (rod control, feedwater level control, pressure control, load follow, steam dump, …). Engaged channels read the INSTRUMENTS and issue these same commands for you — setpoints capture the current reading and are editable. A failed sensor fools the automation, interlocks block it, and while a channel is engaged it overrides your manual input for that control. Rod/power channels disengage themselves on a scram.",
          "command": "(issues the commands above)",
          "params": ""
        }
      ],
      "indications": [
        {
          "id": "power_range",
          "name": "Reactor Power",
          "measures": "Reactor power (from neutron flux), as a percent of rated.",
          "unit": "%",
          "range": [
            0,
            120
          ],
          "lag_s": 0.1,
          "derived": false,
          "boolean": false,
          "alarms": [
            "high_flux"
          ]
        },
        {
          "id": "tavg",
          "name": "Average Coolant Temp (Tavg)",
          "measures": "Average primary-coolant temperature.",
          "unit": "°C",
          "range": [
            232,
            343
          ],
          "lag_s": 4,
          "derived": false,
          "boolean": false,
          "alarms": [
            "high_tavg"
          ]
        },
        {
          "id": "thot",
          "name": "Hot-Leg Temp (Thot)",
          "measures": "Coolant temperature leaving the core.",
          "unit": "°C",
          "range": [
            232,
            343
          ],
          "lag_s": 4,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "tcold",
          "name": "Cold-Leg Temp (Tcold)",
          "measures": "Coolant temperature returning to the core.",
          "unit": "°C",
          "range": [
            232,
            343
          ],
          "lag_s": 4,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "primary_pressure",
          "name": "Primary Pressure",
          "measures": "Primary-loop (Reactor Coolant System, RCS) pressure — kept high to prevent boiling.",
          "unit": "MPa",
          "range": [
            0,
            20.7
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": [
            "pzr_pressure_high",
            "pzr_pressure_low",
            "pzr_pressure_lolo"
          ]
        },
        {
          "id": "pzr_level",
          "name": "Pressurizer Level",
          "measures": "Water level in the Pressurizer (PZR). Can rise misleadingly during a loss-of-coolant (the TMI trap).",
          "unit": "%",
          "range": [
            0,
            100
          ],
          "lag_s": 2,
          "derived": false,
          "boolean": false,
          "alarms": [
            "pzr_level_high",
            "pzr_level_low",
            "pzr_level_lolo"
          ]
        },
        {
          "id": "sg_level",
          "name": "Steam Generator Level",
          "measures": "Water level in the Steam Generators (SG). Briefly moves the \"wrong way\" on fast power changes (shrink/swell).",
          "unit": "%",
          "range": [
            0,
            100
          ],
          "lag_s": 3,
          "derived": false,
          "boolean": false,
          "alarms": [
            "sg_level_high",
            "sg_level_low",
            "sg_level_lolo"
          ]
        },
        {
          "id": "steam_flow",
          "name": "Steam Flow",
          "measures": "Steam flow to the turbine (1.0 = rated).",
          "unit": "×rated",
          "range": [
            0,
            1.2
          ],
          "lag_s": 1,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "fw_flow",
          "name": "Feedwater Flow",
          "measures": "Feedwater flow (1.0 = rated).",
          "unit": "×rated",
          "range": [
            0,
            1.2
          ],
          "lag_s": 1,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "mwe_output",
          "name": "Electrical Output",
          "measures": "Gross electrical power to the grid.",
          "unit": "MWe",
          "range": [
            0,
            1300
          ],
          "lag_s": 0.2,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "turbine_rpm",
          "name": "Turbine Speed",
          "measures": "Turbine/generator speed; locked to the grid when synchronized.",
          "unit": "RPM",
          "range": [
            0,
            2000
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "condenser_vacuum",
          "name": "Condenser Vacuum",
          "measures": "Condenser vacuum — needed for the turbine to run.",
          "unit": "kPa",
          "range": [
            0,
            102
          ],
          "lag_s": 5,
          "derived": false,
          "boolean": false,
          "alarms": [
            "cond_vac_low",
            "cond_vac_trip"
          ]
        },
        {
          "id": "charging_flow",
          "name": "charging_flow",
          "measures": "charging_flow",
          "unit": "",
          "range": [
            0,
            0.12
          ],
          "lag_s": 2,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "letdown_flow",
          "name": "letdown_flow",
          "measures": "letdown_flow",
          "unit": "",
          "range": [
            0,
            0.12
          ],
          "lag_s": 2,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "steam_pressure",
          "name": "Steam-Drum Pressure",
          "measures": "Steam-drum pressure.",
          "unit": "MPa",
          "range": [
            0,
            10.5
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "boron_analyzer",
          "name": "boron_analyzer",
          "measures": "boron_analyzer",
          "unit": "",
          "range": [
            0,
            2500
          ],
          "lag_s": 45,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "governor_valve",
          "name": "governor_valve",
          "measures": "governor_valve",
          "unit": "",
          "range": [
            0,
            100
          ],
          "lag_s": 0.3,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "lpi_flow",
          "name": "lpi_flow",
          "measures": "lpi_flow",
          "unit": "",
          "range": [
            0,
            1.2
          ],
          "lag_s": 1,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "accumulator_flow",
          "name": "accumulator_flow",
          "measures": "accumulator_flow",
          "unit": "",
          "range": [
            0,
            1.2
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "steam_dump_valve",
          "name": "steam_dump_valve",
          "measures": "steam_dump_valve",
          "unit": "",
          "range": [
            0,
            100
          ],
          "lag_s": 0.3,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "primary_leak_flow",
          "name": "primary_leak_flow",
          "measures": "primary_leak_flow",
          "unit": "",
          "range": [
            0,
            1
          ],
          "lag_s": 0.2,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "startup_rate",
          "name": "startup_rate",
          "measures": "startup_rate",
          "unit": "",
          "range": [
            -5,
            10
          ],
          "lag_s": 2,
          "derived": false,
          "boolean": false,
          "alarms": [
            "sur_high"
          ]
        },
        {
          "id": "subcooling_margin",
          "name": "Subcooling Margin",
          "measures": "How far the coolant is from boiling (from indicated pressure & temperature). The truth-teller at TMI.",
          "unit": "°C",
          "range": [
            -28,
            83
          ],
          "lag_s": 0,
          "derived": false,
          "boolean": false,
          "alarms": [
            "subcooling_low",
            "subcooling_lost"
          ]
        },
        {
          "id": "porv_indicator",
          "name": "PORV Position Light",
          "measures": "Relief-valve indicator. Shows the COMMANDED position, which can differ from reality (TMI).",
          "unit": "",
          "range": null,
          "lag_s": null,
          "derived": false,
          "boolean": true,
          "alarms": [
            "porv_open"
          ]
        }
      ],
      "setpoints": {
        "trips": [
          {
            "instrument": "power_range",
            "direction": "high",
            "setpoint": 120,
            "action": "scram"
          },
          {
            "instrument": "tavg",
            "direction": "high",
            "setpoint": 335,
            "action": "scram"
          },
          {
            "instrument": "primary_pressure",
            "direction": "high",
            "setpoint": 16.44,
            "action": "scram"
          },
          {
            "instrument": "primary_pressure",
            "direction": "low",
            "setpoint": 12.41,
            "action": "scram"
          },
          {
            "instrument": "pzr_level",
            "direction": "low",
            "setpoint": 12,
            "action": "scram"
          },
          {
            "instrument": "sg_level",
            "direction": "low",
            "setpoint": 12,
            "action": "scram"
          },
          {
            "instrument": "__true_flow__",
            "direction": "low",
            "setpoint": 0.25,
            "action": "scram"
          }
        ],
        "actuations": [
          {
            "instrument": "primary_pressure",
            "direction": "high",
            "setpoint": 16.2,
            "action": "open_porv",
            "reset_below": 15.86
          },
          {
            "instrument": "primary_pressure",
            "direction": "low",
            "setpoint": 11.03,
            "action": "set_hpi"
          },
          {
            "instrument": "sg_level",
            "direction": "low",
            "setpoint": 20,
            "action": "set_afw"
          },
          {
            "instrument": "primary_pressure",
            "direction": "low",
            "setpoint": 2.76,
            "action": "set_lpi"
          },
          {
            "instrument": "primary_pressure",
            "direction": "low",
            "setpoint": 3.45,
            "action": "set_rhr",
            "condition": "rps_scrammed"
          }
        ],
        "alarms": [
          {
            "id": "reactor_trip",
            "name": "Reactor Trip (REACTOR TRIP)",
            "instrument": "rps_scrammed",
            "direction": "is_true",
            "setpoint": null,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "high_flux",
            "name": "High Neutron Flux (HI FLUX)",
            "instrument": "power_range",
            "direction": "high",
            "setpoint": 108,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "high_tavg",
            "name": "High Coolant Temperature (HI TAVG)",
            "instrument": "tavg",
            "direction": "high",
            "setpoint": 312.2,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "pzr_pressure_high",
            "name": "Pressurizer Pressure High (PZR PRESS HI)",
            "instrument": "primary_pressure",
            "direction": "high",
            "setpoint": 15.86,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "pzr_pressure_low",
            "name": "Pressurizer Pressure Low (PZR PRESS LO)",
            "instrument": "primary_pressure",
            "direction": "low",
            "setpoint": 14.82,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "pzr_pressure_lolo",
            "name": "Pressurizer Pressure Very Low (PZR PRESS LO LO)",
            "instrument": "primary_pressure",
            "direction": "low",
            "setpoint": 12.41,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "porv_open",
            "name": "Pressure Relief Valve Open (PORV OPEN)",
            "instrument": "porv_indicator",
            "direction": "is_open",
            "setpoint": null,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "sur_high",
            "name": "Startup Rate High (SUR HI)",
            "instrument": "startup_rate",
            "direction": "high",
            "setpoint": 2,
            "priority": "caution",
            "panel": "A"
          },
          {
            "id": "subcooling_low",
            "name": "Low Subcooling Margin (LO SUBCOOL)",
            "instrument": "subcooling_margin",
            "direction": "low",
            "setpoint": 11.1,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "subcooling_lost",
            "name": "Subcooling Lost — Coolant Boiling (SUBCOOL LOST)",
            "instrument": "subcooling_margin",
            "direction": "low",
            "setpoint": 0,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "pzr_level_high",
            "name": "Pressurizer Level High (PZR LVL HI)",
            "instrument": "pzr_level",
            "direction": "high",
            "setpoint": 75,
            "priority": "caution",
            "panel": "A"
          },
          {
            "id": "pzr_level_low",
            "name": "Pressurizer Level Low (PZR LVL LO)",
            "instrument": "pzr_level",
            "direction": "low",
            "setpoint": 25,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "pzr_level_lolo",
            "name": "Pressurizer Level Very Low (PZR LVL LO LO)",
            "instrument": "pzr_level",
            "direction": "low",
            "setpoint": 12,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "rod_limit",
            "name": "Control Rods — Insertion Limit (ROD INS LIMIT)",
            "instrument": "rod_at_limit",
            "direction": "is_true",
            "setpoint": null,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "sg_level_high",
            "name": "Steam Generator Level High (SG LVL HI)",
            "instrument": "sg_level",
            "direction": "high",
            "setpoint": 75,
            "priority": "caution",
            "panel": "B"
          },
          {
            "id": "sg_level_low",
            "name": "Steam Generator Level Low (SG LVL LO)",
            "instrument": "sg_level",
            "direction": "low",
            "setpoint": 30,
            "priority": "warning",
            "panel": "B"
          },
          {
            "id": "sg_level_lolo",
            "name": "Steam Generator Level Critical Low (SG LVL LO LO)",
            "instrument": "sg_level",
            "direction": "low",
            "setpoint": 12,
            "priority": "critical",
            "panel": "B"
          },
          {
            "id": "rcp_trip",
            "name": "Reactor Coolant Pump Trip (RCP TRIP)",
            "instrument": "rcp_running",
            "direction": "is_false",
            "setpoint": null,
            "priority": "critical",
            "panel": "B"
          },
          {
            "id": "hpi_active",
            "name": "Emergency Cooling Active (HPI ACTIVE)",
            "instrument": "hpi_active",
            "direction": "is_true",
            "setpoint": null,
            "priority": "status",
            "panel": "B"
          },
          {
            "id": "sbo",
            "name": "Station Blackout — AC Power Lost (SBO)",
            "instrument": "station_blackout",
            "direction": "is_true",
            "setpoint": null,
            "priority": "critical",
            "panel": "B"
          },
          {
            "id": "turbine_trip",
            "name": "Turbine Trip / Low Steam Demand (TURB TRIP)",
            "instrument": "steam_demand_low",
            "direction": "is_true",
            "setpoint": null,
            "priority": "warning",
            "panel": "B"
          },
          {
            "id": "cond_vac_low",
            "name": "Condenser Vacuum Low (COND VAC LO)",
            "instrument": "condenser_vacuum",
            "direction": "low",
            "setpoint": 84.7,
            "priority": "caution",
            "panel": "B"
          },
          {
            "id": "cond_vac_trip",
            "name": "Condenser Vacuum Trip Level (COND VAC TRIP)",
            "instrument": "condenser_vacuum",
            "direction": "low",
            "setpoint": 74.5,
            "priority": "warning",
            "panel": "B"
          }
        ]
      },
      "safety_limits": [
        {
          "name": "Fuel cladding damage",
          "v": 1200,
          "u": "°C",
          "note": "Cladding failure / fission-product release begins."
        },
        {
          "name": "Fuel melt",
          "v": 2800,
          "u": "°C",
          "note": "Core melt."
        },
        {
          "name": "PORV auto-open / reseat",
          "v": "16.20 / 15.86",
          "u": "MPa",
          "note": "Power-operated relief."
        },
        {
          "name": "Safety valves open / reseat",
          "v": "17.13 / 16.55",
          "u": "MPa",
          "note": "Mechanical spring safeties."
        },
        {
          "name": "Core-uncovery heat-transfer collapse",
          "v": "< 0.50",
          "u": "inventory frac",
          "note": "Below 50% inventory the fuel-to-coolant coupling degrades → fuel heatup."
        }
      ],
      "alarm_response": [
        {
          "id": "reactor_trip",
          "name": "Reactor Trip (REACTOR TRIP)",
          "priority": "critical",
          "panel": "A",
          "means": "The reactor has shut down (Reactor Protection System actuation).",
          "response": "Confirm rods in and power dropping; establish decay-heat removal (AFW / DHR); verify inventory."
        },
        {
          "id": "high_flux",
          "name": "High Neutron Flux (HI FLUX)",
          "priority": "critical",
          "panel": "A",
          "means": "Reactor power (neutron flux) is above the high setpoint.",
          "response": "Insert Control Rods to lower power; if it keeps rising, SCRAM."
        },
        {
          "id": "high_tavg",
          "name": "High Coolant Temperature (HI TAVG)",
          "priority": "warning",
          "panel": "A",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "pzr_pressure_high",
          "name": "Pressurizer Pressure High (PZR PRESS HI)",
          "priority": "warning",
          "panel": "A",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "pzr_pressure_low",
          "name": "Pressurizer Pressure Low (PZR PRESS LO)",
          "priority": "warning",
          "panel": "A",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "pzr_pressure_lolo",
          "name": "Pressurizer Pressure Very Low (PZR PRESS LO LO)",
          "priority": "critical",
          "panel": "A",
          "means": "Primary pressure is dangerously low.",
          "response": "Confirm HPI actuation; find the leak or stuck relief path."
        },
        {
          "id": "porv_open",
          "name": "Pressure Relief Valve Open (PORV OPEN)",
          "priority": "warning",
          "panel": "A",
          "means": "The relief valve (PORV) is showing open.",
          "response": "If it should be shut, command it closed; if flow persists, isolate with the block valve. Cross-check subcooling — the light can lie."
        },
        {
          "id": "sur_high",
          "name": "Startup Rate High (SUR HI)",
          "priority": "caution",
          "panel": "A",
          "means": null,
          "response": "Monitor; no immediate action required."
        },
        {
          "id": "subcooling_low",
          "name": "Low Subcooling Margin (LO SUBCOOL)",
          "priority": "warning",
          "panel": "A",
          "means": "The coolant is getting close to boiling (low subcooling margin).",
          "response": "Restore margin: raise primary pressure and/or lower temperature; check for a leak."
        },
        {
          "id": "subcooling_lost",
          "name": "Subcooling Lost — Coolant Boiling (SUBCOOL LOST)",
          "priority": "critical",
          "panel": "A",
          "means": "The coolant is boiling — a serious loss-of-coolant condition (subcooling ≤ 0).",
          "response": "Ensure High-Pressure Injection (HPI) is running; do NOT throttle it on a rising Pressurizer level; isolate a stuck PORV with its block valve."
        },
        {
          "id": "pzr_level_high",
          "name": "Pressurizer Level High (PZR LVL HI)",
          "priority": "caution",
          "panel": "A",
          "means": null,
          "response": "Monitor; no immediate action required."
        },
        {
          "id": "pzr_level_low",
          "name": "Pressurizer Level Low (PZR LVL LO)",
          "priority": "warning",
          "panel": "A",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "pzr_level_lolo",
          "name": "Pressurizer Level Very Low (PZR LVL LO LO)",
          "priority": "critical",
          "panel": "A",
          "means": "Pressurizer level is very low — inventory may be leaving the plant.",
          "response": "Confirm charging / HPI; investigate the inventory loss."
        },
        {
          "id": "rod_limit",
          "name": "Control Rods — Insertion Limit (ROD INS LIMIT)",
          "priority": "warning",
          "panel": "A",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "sg_level_high",
          "name": "Steam Generator Level High (SG LVL HI)",
          "priority": "caution",
          "panel": "B",
          "means": null,
          "response": "Monitor; no immediate action required."
        },
        {
          "id": "sg_level_low",
          "name": "Steam Generator Level Low (SG LVL LO)",
          "priority": "warning",
          "panel": "B",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "sg_level_lolo",
          "name": "Steam Generator Level Critical Low (SG LVL LO LO)",
          "priority": "critical",
          "panel": "B",
          "means": "Steam Generator level is critically low — the heat sink is failing.",
          "response": "Start Auxiliary Feedwater (AFW) immediately; trip the reactor if not already tripped."
        },
        {
          "id": "rcp_trip",
          "name": "Reactor Coolant Pump Trip (RCP TRIP)",
          "priority": "critical",
          "panel": "B",
          "means": "A Reactor Coolant Pump (RCP) has tripped — flow is reduced.",
          "response": "Verify the low-flow trip and rod insertion; watch temperatures."
        },
        {
          "id": "hpi_active",
          "name": "Emergency Cooling Active (HPI ACTIVE)",
          "priority": "status",
          "panel": "B",
          "means": null,
          "response": "Monitor; no immediate action required."
        },
        {
          "id": "sbo",
          "name": "Station Blackout — AC Power Lost (SBO)",
          "priority": "critical",
          "panel": "B",
          "means": "All alternating-current (AC) power is lost — station blackout.",
          "response": "Preserve direct-current (DC) power; establish AFW / natural circulation; work to restore AC."
        },
        {
          "id": "turbine_trip",
          "name": "Turbine Trip / Low Steam Demand (TURB TRIP)",
          "priority": "warning",
          "panel": "B",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "cond_vac_low",
          "name": "Condenser Vacuum Low (COND VAC LO)",
          "priority": "caution",
          "panel": "B",
          "means": null,
          "response": "Monitor; no immediate action required."
        },
        {
          "id": "cond_vac_trip",
          "name": "Condenser Vacuum Trip Level (COND VAC TRIP)",
          "priority": "warning",
          "panel": "B",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        }
      ],
      "failures": [
        {
          "id": "stuck_porv_open",
          "display": "PORV Stuck Open",
          "category": "coolant",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "porv_indicator_stuck_closed",
          "display": "PORV Indicator Stuck Closed",
          "category": "instrument",
          "type": "instrument",
          "severity_meta": null
        },
        {
          "id": "loss_of_feedwater",
          "display": "Loss of Main Feedwater",
          "category": "power",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "turbine_trip",
          "display": "Turbine Trip",
          "category": "power",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "loss_of_offsite_power",
          "display": "Loss of Offsite Power",
          "category": "power",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "station_blackout",
          "display": "Station Blackout",
          "category": "power",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "sgtr",
          "display": "Steam Generator Tube Rupture",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Leak Rate",
            "unit": "% rated flow",
            "min": 0,
            "max": 8,
            "default": 3
          }
        },
        {
          "id": "rcp_trip",
          "display": "RCP Trip",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "loss_of_condenser_vacuum",
          "display": "Loss of Condenser Vacuum",
          "category": "power",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "degraded_hpi",
          "display": "Degraded HPI",
          "category": "safety_system",
          "type": "command_override",
          "severity_meta": {
            "label": "HPI Capacity",
            "unit": "% rated",
            "min": 0,
            "max": 100,
            "default": 50,
            "invert": true
          }
        },
        {
          "id": "afw_failure",
          "display": "Auxiliary Feedwater Failure",
          "category": "safety_system",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "failure_to_scram",
          "display": "Failure to Scram (ATWS)",
          "category": "safety_system",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "stuck_open_spray",
          "display": "Pressurizer Spray Stuck Open",
          "category": "coolant",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "failed_pzr_heaters",
          "display": "Pressurizer Heaters Failed",
          "category": "coolant",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "sg_overfeed",
          "display": "SG Overfeed / Overcooling",
          "category": "power",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "large_loca",
          "display": "Large LOCA (Cold-Leg Break)",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Break Size",
            "unit": "% rated flow",
            "min": 0,
            "max": 50,
            "default": 20
          }
        },
        {
          "id": "continuous_rod_withdrawal",
          "display": "Continuous Rod Withdrawal",
          "category": "reactivity",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Withdrawal Rate",
            "unit": "steps/s",
            "min": 0,
            "max": 6,
            "default": 3
          }
        },
        {
          "id": "stuck_rod_on_scram",
          "display": "Control Rod Stuck on Scram",
          "category": "reactivity",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Rod Worth Held",
            "unit": "% of total",
            "min": 0,
            "max": 40,
            "default": 20
          }
        },
        {
          "id": "steam_line_break",
          "display": "Main Steam Line Break",
          "category": "power",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Break Size",
            "unit": "% effective area",
            "min": 0,
            "max": 100,
            "default": 30
          }
        },
        {
          "id": "tavg_sensor_failure",
          "display": "Tavg Sensor Drifting",
          "category": "instrument",
          "type": "instrument",
          "severity_meta": null
        },
        {
          "id": "pzr_level_sensor_stuck",
          "display": "Pressurizer Level Sensor Stuck",
          "category": "instrument",
          "type": "instrument",
          "severity_meta": null
        }
      ],
      "glossary": [
        {
          "acronym": "AC / DC",
          "term": "Alternating-current / direct-current electrical power."
        },
        {
          "acronym": "SUR",
          "term": "Startup Rate — how fast power is changing, in decades (factors of ten) per minute (DPM)."
        },
        {
          "acronym": "DPM",
          "term": "Decades Per Minute — the unit of startup rate (one decade = a factor of ten)."
        },
        {
          "acronym": "MWe / MWt",
          "term": "Megawatts electric (grid output) / megawatts thermal (reactor heat)."
        },
        {
          "acronym": "Reactor period",
          "term": "The time for power to change by a factor of e (~2.72); long period = slow change."
        },
        {
          "acronym": "SCRAM",
          "term": "A rapid full insertion of the control rods — emergency shutdown."
        },
        {
          "acronym": "Shutdown bank",
          "term": "The scram rods (the RBMK’s AZ / Emergency Protection group), normally parked fully withdrawn. Operable — hold Insert to add shutdown margin, Withdraw to park it back out — but a SCRAM always drives it fully in and overrides you."
        },
        {
          "acronym": "Decay heat",
          "term": "Heat from radioactive decay that continues after shutdown (~7% of rated, decaying)."
        },
        {
          "acronym": "Xenon",
          "term": "Xenon-135, a neutron-absorbing fission product that builds in after a power drop."
        },
        {
          "acronym": "Reactivity",
          "term": "The tendency of the chain reaction to grow (+) or shrink (−); critical = steady."
        },
        {
          "acronym": "AUTO / MAN",
          "term": "Automatic / manual control of a plant control channel (Tools → Automate). AUTO reads the instruments and issues commands to hold a setpoint; MAN leaves the control to you."
        },
        {
          "acronym": "Setpoint (SP)",
          "term": "The value an automatic controller holds its parameter at. Automate channels capture the current reading when engaged; edit it to maneuver on automatic."
        },
        {
          "acronym": "PWR",
          "term": "Pressurized Water Reactor."
        },
        {
          "acronym": "PZR",
          "term": "Pressurizer — sets primary pressure."
        },
        {
          "acronym": "SG",
          "term": "Steam Generator."
        },
        {
          "acronym": "PORV",
          "term": "Power-Operated Relief Valve."
        },
        {
          "acronym": "HPI",
          "term": "High-Pressure Injection."
        },
        {
          "acronym": "ECCS",
          "term": "Emergency Core Cooling System (here, high-pressure injection)."
        },
        {
          "acronym": "AFW",
          "term": "Auxiliary Feedwater."
        },
        {
          "acronym": "CVCS",
          "term": "Chemical & Volume Control System (boron & inventory)."
        },
        {
          "acronym": "MTC",
          "term": "Moderator Temperature Coefficient."
        },
        {
          "acronym": "RCP",
          "term": "Reactor Coolant Pump."
        },
        {
          "acronym": "DHR / RHR",
          "term": "Decay-Heat / Residual-Heat Removal."
        },
        {
          "acronym": "Tavg",
          "term": "Average coolant temperature."
        }
      ],
      "normal_values": {
        "hot_full_power": {
          "label": "100% power at equilibrium — the normal operating point.",
          "settled_s": 60,
          "true_state": {
            "power_pct": 100,
            "tavg_c": 303.893,
            "thot_c": 320.393,
            "tcold_c": 287.393,
            "pressure_mpa": 15.41,
            "pzr_level_pct": 55,
            "sg_level_pct": 65,
            "steam_flow_normalized": 1,
            "fw_flow_normalized": 1,
            "steam_pressure_mpa": 5.65,
            "mwe_output": 1000.001,
            "subcooling_c": 41.153,
            "core_inventory_pct": 100,
            "fuel_temp_c": 692.893,
            "decay_heat_pct": 7,
            "xenon_pct_eq": 100,
            "boron_ppm": 747.282,
            "porv_open": false,
            "porv_stuck": false,
            "block_valve_open": true,
            "hpi_active": false,
            "hpi_flow_normalized": 0,
            "afw_active": false,
            "pump_running": true,
            "pump_flow_pct": 100,
            "station_blackout": false,
            "turbine_rpm": 1800,
            "condenser_vacuum_kpa": 96.5,
            "condenser_cooling_available": true,
            "scrammed": false,
            "melted": false,
            "steam_demand_mwe": 1000.001,
            "load_mode": "follow",
            "load_target_mwe": 1000.001,
            "load_imbalance_mwe": 0.0000696,
            "sg_imbalance_active": false,
            "reactivity_pcm": -0.000995,
            "startup_rate_dpm": 6.37e-9,
            "reactor_period_s": 4090429179.234,
            "charging_flow_actual": 0,
            "letdown_flow_actual": 0,
            "steam_dump_valve_pct": 0,
            "leak_flow": 0,
            "governor_valve_pct": 100,
            "lpi_active": false,
            "lpi_flow_normalized": 0,
            "accumulators_discharging": false,
            "accumulator_flow_normalized": 0,
            "accumulator_volume_pct": 100,
            "rhr_active": false
          },
          "instruments": {
            "power_range": 99.846,
            "tavg": 303.826,
            "thot": 320.282,
            "tcold": 287.203,
            "primary_pressure": 15.418,
            "pzr_level": 55.761,
            "sg_level": 64.385,
            "steam_flow": 0.99,
            "fw_flow": 1.007,
            "mwe_output": 999.249,
            "turbine_rpm": 1800.336,
            "condenser_vacuum": 96.362,
            "charging_flow": 0,
            "letdown_flow": 0,
            "steam_pressure": 5.645,
            "boron_analyzer": 751.117,
            "governor_valve": 99.861,
            "lpi_flow": 0,
            "accumulator_flow": 0,
            "steam_dump_valve": 0.224,
            "primary_leak_flow": 0,
            "startup_rate": -0.019,
            "porv_indicator": "closed",
            "subcooling_margin": 41.261,
            "rps_scrammed": false,
            "rcp_running": true,
            "hpi_active": false,
            "station_blackout": false,
            "steam_demand_low": false,
            "rod_at_limit": false,
            "afw_active": false,
            "rhr_active": false,
            "lpi_active": false,
            "accumulators_discharging": false,
            "condenser_cooling_available": true,
            "safety_relief_active": false
          }
        },
        "hot_zero_power": {
          "label": "Hot Standby: subcritical, hot, at NOP temperature/pressure — control bank fully inserted.",
          "settled_s": 5,
          "true_state": {
            "power_pct": 0.0001,
            "tavg_c": 302.619,
            "thot_c": 302.619,
            "tcold_c": 302.619,
            "pressure_mpa": 15.41,
            "pzr_level_pct": 55,
            "sg_level_pct": 65,
            "steam_flow_normalized": 0.00000158,
            "fw_flow_normalized": 0.000001,
            "steam_pressure_mpa": 8.9,
            "mwe_output": 0.001,
            "subcooling_c": 42.427,
            "core_inventory_pct": 100,
            "fuel_temp_c": 302.619,
            "decay_heat_pct": 0.489,
            "xenon_pct_eq": 9.6e-10,
            "boron_ppm": 347.989,
            "porv_open": false,
            "porv_stuck": false,
            "block_valve_open": true,
            "hpi_active": false,
            "hpi_flow_normalized": 0,
            "afw_active": false,
            "pump_running": true,
            "pump_flow_pct": 100,
            "station_blackout": false,
            "turbine_rpm": 1800,
            "condenser_vacuum_kpa": 96.5,
            "condenser_cooling_available": true,
            "scrammed": false,
            "melted": false,
            "steam_demand_mwe": 0.001,
            "load_mode": "follow",
            "load_target_mwe": 0.001,
            "load_imbalance_mwe": -1.17e-10,
            "sg_imbalance_active": false,
            "reactivity_pcm": -1000,
            "startup_rate_dpm": -6.36e-7,
            "reactor_period_s": null,
            "charging_flow_actual": 0,
            "letdown_flow_actual": 0,
            "steam_dump_valve_pct": 0,
            "leak_flow": 0,
            "governor_valve_pct": 0.0001,
            "lpi_active": false,
            "lpi_flow_normalized": 0,
            "accumulators_discharging": false,
            "accumulator_flow_normalized": 0,
            "accumulator_volume_pct": 100,
            "rhr_active": false
          },
          "instruments": {
            "power_range": 0,
            "tavg": 302.545,
            "thot": 302.554,
            "tcold": 302.411,
            "primary_pressure": 15.383,
            "pzr_level": 54.683,
            "sg_level": 64.599,
            "steam_flow": 0.0059,
            "fw_flow": 0,
            "mwe_output": 0.122,
            "turbine_rpm": 1798.808,
            "condenser_vacuum": 96.095,
            "charging_flow": 0.000288,
            "letdown_flow": 0,
            "steam_pressure": 8.905,
            "boron_analyzer": 345.963,
            "governor_valve": 0.586,
            "lpi_flow": 0.00336,
            "accumulator_flow": 0.00177,
            "steam_dump_valve": 0,
            "primary_leak_flow": 0.00269,
            "startup_rate": 0.0043,
            "porv_indicator": "closed",
            "subcooling_margin": 42.357,
            "rps_scrammed": false,
            "rcp_running": true,
            "hpi_active": false,
            "station_blackout": false,
            "steam_demand_low": true,
            "rod_at_limit": true,
            "afw_active": false,
            "rhr_active": false,
            "lpi_active": false,
            "accumulators_discharging": false,
            "condenser_cooling_available": true,
            "safety_relief_active": false
          }
        },
        "50_percent": {
          "label": "Stable partial power for maneuvering practice.",
          "settled_s": 60,
          "true_state": {
            "power_pct": 49.86,
            "tavg_c": 287.673,
            "thot_c": 295.9,
            "tcold_c": 279.446,
            "pressure_mpa": 15.41,
            "pzr_level_pct": 54.977,
            "sg_level_pct": 64.988,
            "steam_flow_normalized": 0.499,
            "fw_flow_normalized": 0.499,
            "steam_pressure_mpa": 5.651,
            "mwe_output": 498.601,
            "subcooling_c": 57.372,
            "core_inventory_pct": 100,
            "fuel_temp_c": 481.796,
            "decay_heat_pct": 3.5,
            "xenon_pct_eq": 100.054,
            "boron_ppm": 754.395,
            "porv_open": false,
            "porv_stuck": false,
            "block_valve_open": true,
            "hpi_active": false,
            "hpi_flow_normalized": 0,
            "afw_active": false,
            "pump_running": true,
            "pump_flow_pct": 100,
            "station_blackout": false,
            "turbine_rpm": 1800,
            "condenser_vacuum_kpa": 96.5,
            "condenser_cooling_available": true,
            "scrammed": false,
            "melted": false,
            "steam_demand_mwe": 499.355,
            "load_mode": "follow",
            "load_target_mwe": 499.355,
            "load_imbalance_mwe": -0.754,
            "sg_imbalance_active": false,
            "reactivity_pcm": -0.346,
            "startup_rate_dpm": -0.00104,
            "reactor_period_s": -25031.023,
            "charging_flow_actual": 0,
            "letdown_flow_actual": 0,
            "steam_dump_valve_pct": 0,
            "leak_flow": 0,
            "governor_valve_pct": 49.939,
            "lpi_active": false,
            "lpi_flow_normalized": 0,
            "accumulators_discharging": false,
            "accumulator_flow_normalized": 0,
            "accumulator_volume_pct": 100,
            "rhr_active": false
          },
          "instruments": {
            "power_range": 49.706,
            "tavg": 287.608,
            "thot": 295.791,
            "tcold": 279.257,
            "primary_pressure": 15.418,
            "pzr_level": 55.739,
            "sg_level": 64.372,
            "steam_flow": 0.49,
            "fw_flow": 0.506,
            "mwe_output": 497.853,
            "turbine_rpm": 1800.336,
            "condenser_vacuum": 96.362,
            "charging_flow": 0,
            "letdown_flow": 0,
            "steam_pressure": 5.646,
            "boron_analyzer": 758.23,
            "governor_valve": 49.801,
            "lpi_flow": 0,
            "accumulator_flow": 0,
            "steam_dump_valve": 0.224,
            "primary_leak_flow": 0,
            "startup_rate": -0.02,
            "porv_indicator": "closed",
            "subcooling_margin": 57.479,
            "rps_scrammed": false,
            "rcp_running": true,
            "hpi_active": false,
            "station_blackout": false,
            "steam_demand_low": false,
            "rod_at_limit": false,
            "afw_active": false,
            "rhr_active": false,
            "lpi_active": false,
            "accumulators_discharging": false,
            "condenser_cooling_available": true,
            "safety_relief_active": false
          }
        }
      }
    },
    "rbmk_pre": {
      "id": "rbmk_pre",
      "plant": "rbmk",
      "design_version": "pre_chernobyl",
      "name": "RBMK-1000 (Chernobyl-type) — pre-1986",
      "one_liner": "The unstable reactor — where boiling RAISES power instead of lowering it. ~3200 MWt / ~1000 MWe; graphite-moderated, water-cooled pressure tubes, steam drum ≈ 7.0 MPa. Carries both the pre-1986 and post-1986 designs.",
      "overview": "Graphite (not water) slows the neutrons, and the cooling water mostly absorbs them — so when the water boils into steam (called \"void\"), reactivity RISES. This positive void coefficient, together with the pre-1986 control rods whose graphite tips briefly ADDED reactivity as they began to insert (the \"positive scram effect\"), is what turned an emergency shutdown into the Chernobyl explosion. There is no boron and no moderator-temperature coefficient; the graphite gives a slow, slightly-positive feedback. The Operating Reactivity Margin (ORM) — how much shutdown capacity is currently inserted — is the key safety parameter. Power is controlled by Control Rods and by Main Circulation Pump (MCP) flow. The emergency shutdown is the AZ-5 button.",
      "authentic_units": "The RBMK is read in SI (MPa / °C) — the trainer default.",
      "controls": [
        {
          "control": "Rods — Raise / Lower (hold)",
          "group": "Reactivity",
          "uses": "Hold to drive a rod group: Raise (withdraw) adds reactivity and raises power; Lower (insert) removes it. Release to stop.",
          "command": "rod_start",
          "params": "{group_id,direction,speed}"
        },
        {
          "control": "Rods — Nudge",
          "group": "Reactivity",
          "uses": "Move the rods a small, fixed amount (rate-limited, not instant) — for fine reactivity adjustments.",
          "command": "rod_nudge",
          "params": "{group_id,steps,speed}"
        },
        {
          "control": "Rods — Stop",
          "group": "Reactivity",
          "uses": "Stop the selected rod group.",
          "command": "rod_stop",
          "params": "{group_id}"
        },
        {
          "control": "Rods — Stop All",
          "group": "Reactivity",
          "uses": "Stop all moving rod groups.",
          "command": "rod_stop_all",
          "params": ""
        },
        {
          "control": "AZ-5 (SCRAM)",
          "group": "Safety",
          "uses": "The RBMK emergency-shutdown button (the one pressed at Chernobyl) — full rod insertion.",
          "command": "manual_scram",
          "params": ""
        },
        {
          "control": "SCRAM",
          "group": "Safety",
          "uses": "Emergency shutdown — drives every rod fully in at once. A two-click armed button.",
          "command": "scram",
          "params": ""
        },
        {
          "control": "Coolant Flow (MCP)",
          "group": "Coolant",
          "uses": "Sets Main Circulation Pump (MCP) flow, percent of rated. In the RBMK, MORE flow sweeps out steam and LOWERS power; LESS flow raises it. The primary power control.",
          "command": "set_channel_flow",
          "params": "{pct}"
        },
        {
          "control": "Feedwater Flow",
          "group": "Secondary",
          "uses": "Sets the make-up water flow to the boiler, as a percent of rated; used to control level.",
          "command": "set_feedwater_flow",
          "params": "{pct}"
        },
        {
          "control": "Turbine Load",
          "group": "Turbine & Grid",
          "uses": "Sets how much steam the turbine draws (MWe); the steam it does not take is dumped or relieved.",
          "command": "set_turbine_load",
          "params": "{mwe}"
        },
        {
          "control": "Steam Dump / Bypass",
          "group": "Turbine & Grid",
          "uses": "Dumps steam straight to the condenser (bypassing the turbine) to control pressure on a load rejection.",
          "command": "set_steam_dump",
          "params": "{mode|pct}"
        },
        {
          "control": "Emergency Core Cooling (ECCS)",
          "group": "Safety",
          "uses": "Emergency Core Cooling System — injects to the fuel channels on a pressure-tube rupture / loss of coolant: makes up steam-drum level and holds a cooling-flow floor to arrest dryout.",
          "command": "set_eccs",
          "params": "{active}"
        },
        {
          "control": "EPS Bypass",
          "group": "Safety",
          "uses": "Disables the automatic Emergency Protection System (EPS) trips — as was done before Chernobyl. Dangerous; use only for an authorized test.",
          "command": "set_eps_bypass",
          "params": "{active}"
        },
        {
          "control": "Automate Tab (per-control automation)",
          "group": "Automation",
          "uses": "Tools → Automate: an AUTO/MAN toggle per plant control (rod control, feedwater level control, pressure control, load follow, steam dump, …). Engaged channels read the INSTRUMENTS and issue these same commands for you — setpoints capture the current reading and are editable. A failed sensor fools the automation, interlocks block it, and while a channel is engaged it overrides your manual input for that control. Rod/power channels disengage themselves on a scram.",
          "command": "(issues the commands above)",
          "params": ""
        }
      ],
      "indications": [
        {
          "id": "power_range",
          "name": "Reactor Power",
          "measures": "Reactor power (from neutron flux), as a percent of rated.",
          "unit": "%",
          "range": [
            0,
            200
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": [
            "high_power"
          ]
        },
        {
          "id": "steam_pressure",
          "name": "Steam-Drum Pressure",
          "measures": "Steam-drum pressure.",
          "unit": "MPa",
          "range": [
            0,
            10.3
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": [
            "steam_press_high",
            "steam_press_low"
          ]
        },
        {
          "id": "drum_level",
          "name": "Steam-Drum Level",
          "measures": "Water level in the steam drum.",
          "unit": "%",
          "range": [
            0,
            100
          ],
          "lag_s": 2,
          "derived": false,
          "boolean": false,
          "alarms": [
            "drum_level_low",
            "drum_level_lolo"
          ]
        },
        {
          "id": "channel_flow",
          "name": "Channel Flow",
          "measures": "Coolant flow through the fuel channels, percent of rated.",
          "unit": "%",
          "range": [
            0,
            120
          ],
          "lag_s": 1,
          "derived": false,
          "boolean": false,
          "alarms": [
            "flow_low"
          ]
        },
        {
          "id": "void_fraction",
          "name": "Void Fraction",
          "measures": "Fraction of the coolant that is steam bubbles — drives RBMK power.",
          "unit": "frac",
          "range": [
            0,
            1
          ],
          "lag_s": 1,
          "derived": false,
          "boolean": false,
          "alarms": [
            "void_high"
          ]
        },
        {
          "id": "fuel_temp",
          "name": "Fuel Temperature",
          "measures": "Fuel temperature.",
          "unit": "°C",
          "range": [
            0,
            2000
          ],
          "lag_s": 4,
          "derived": false,
          "boolean": false,
          "alarms": [
            "fuel_temp_high"
          ]
        },
        {
          "id": "orm_display",
          "name": "Operating Reactivity Margin (ORM)",
          "measures": "Shutdown capacity currently in hand, in equivalent rods. The Chernobyl precondition when too low.",
          "unit": "rods",
          "range": [
            0,
            211
          ],
          "lag_s": 0,
          "derived": true,
          "boolean": false,
          "alarms": [
            "orm_low"
          ]
        },
        {
          "id": "turbine_rpm",
          "name": "Turbine Speed",
          "measures": "Turbine/generator speed; locked to the grid when synchronized.",
          "unit": "RPM",
          "range": [
            0,
            3600
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "condenser_vacuum",
          "name": "Condenser Vacuum",
          "measures": "Condenser vacuum — needed for the turbine to run.",
          "unit": "kPa",
          "range": [
            0,
            102
          ],
          "lag_s": 5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "mwe_output",
          "name": "Electrical Output",
          "measures": "Gross electrical power to the grid.",
          "unit": "MWe",
          "range": [
            0,
            1200
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "startup_rate",
          "name": "startup_rate",
          "measures": "startup_rate",
          "unit": "",
          "range": [
            -5,
            10
          ],
          "lag_s": 2,
          "derived": false,
          "boolean": false,
          "alarms": [
            "sur_high"
          ]
        }
      ],
      "setpoints": {
        "trips": [
          {
            "instrument": "power_range",
            "direction": "high",
            "setpoint": 120,
            "action": "scram"
          },
          {
            "instrument": "steam_pressure",
            "direction": "high",
            "setpoint": 8,
            "action": "scram"
          },
          {
            "instrument": "drum_level",
            "direction": "low",
            "setpoint": 10,
            "action": "scram"
          }
        ],
        "actuations": [],
        "alarms": [
          {
            "id": "reactor_trip",
            "name": "Reactor Scram (AZ-5) (AZ-5 SCRAM)",
            "instrument": "rps_scrammed",
            "direction": "is_true",
            "setpoint": null,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "high_power",
            "name": "High Reactor Power (HI POWER)",
            "instrument": "power_range",
            "direction": "high",
            "setpoint": 110,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "orm_low",
            "name": "Operating Reactivity Margin Too Low (ORM LO)",
            "instrument": "orm_display",
            "direction": "low",
            "setpoint": 15,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "sur_high",
            "name": "Startup Rate High (SUR HI)",
            "instrument": "startup_rate",
            "direction": "high",
            "setpoint": 3,
            "priority": "caution",
            "panel": "A"
          },
          {
            "id": "void_high",
            "name": "High Coolant Voiding (HI VOID)",
            "instrument": "void_fraction",
            "direction": "high",
            "setpoint": 0.7,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "fuel_temp_high",
            "name": "High Fuel Temperature (HI FUEL T)",
            "instrument": "fuel_temp",
            "direction": "high",
            "setpoint": 1500,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "steam_press_high",
            "name": "Steam Drum Pressure High (DRUM PRESS HI)",
            "instrument": "steam_pressure",
            "direction": "high",
            "setpoint": 7.6,
            "priority": "warning",
            "panel": "B"
          },
          {
            "id": "steam_press_low",
            "name": "Steam Drum Pressure Low (DRUM PRESS LO)",
            "instrument": "steam_pressure",
            "direction": "low",
            "setpoint": 6.4,
            "priority": "warning",
            "panel": "B"
          },
          {
            "id": "drum_level_low",
            "name": "Steam Drum Level Low (DRUM LVL LO)",
            "instrument": "drum_level",
            "direction": "low",
            "setpoint": 20,
            "priority": "warning",
            "panel": "B"
          },
          {
            "id": "drum_level_lolo",
            "name": "Steam Drum Level Critical Low (DRUM LVL LO LO)",
            "instrument": "drum_level",
            "direction": "low",
            "setpoint": 10,
            "priority": "critical",
            "panel": "B"
          },
          {
            "id": "flow_low",
            "name": "Low Coolant Flow (LO FLOW)",
            "instrument": "channel_flow",
            "direction": "low",
            "setpoint": 50,
            "priority": "warning",
            "panel": "B"
          },
          {
            "id": "eps_bypass",
            "name": "Emergency Protection Bypassed (EPS BYPASS)",
            "instrument": "eps_bypassed",
            "direction": "is_true",
            "setpoint": null,
            "priority": "warning",
            "panel": "B"
          }
        ]
      },
      "safety_limits": [
        {
          "name": "Fuel melt (thermal path)",
          "v": 2800,
          "u": "°C",
          "note": "Gradual-melt destruction path."
        },
        {
          "name": "Steam-explosion energy deposition",
          "v": 280,
          "u": "cal/g/s",
          "note": "Prompt-excursion destruction path (Chernobyl)."
        },
        {
          "name": "Drum relief valves open",
          "v": 8,
          "u": "MPa",
          "note": "Overpressure relief."
        },
        {
          "name": "ORM minimum (pre / post)",
          "v": "15 / 43",
          "u": "rods",
          "note": "Below this the void feedback amplifies dangerously."
        }
      ],
      "alarm_response": [
        {
          "id": "reactor_trip",
          "name": "Reactor Scram (AZ-5) (AZ-5 SCRAM)",
          "priority": "critical",
          "panel": "A",
          "means": "AZ-5 has fired — the reactor is shutting down.",
          "response": "Confirm rods inserting and power dropping; maintain coolant flow."
        },
        {
          "id": "high_power",
          "name": "High Reactor Power (HI POWER)",
          "priority": "critical",
          "panel": "A",
          "means": "Reactor power is above the setpoint.",
          "response": "Reduce power (raise flow / insert rods); AZ-5 if it keeps rising."
        },
        {
          "id": "orm_low",
          "name": "Operating Reactivity Margin Too Low (ORM LO)",
          "priority": "critical",
          "panel": "A",
          "means": "The Operating Reactivity Margin (ORM) is too low — the reactor is unstable and hard to shut down. THIS IS THE CHERNOBYL PRECONDITION.",
          "response": "Insert Control Rods to restore ORM; if it cannot be restored, shut down. Never bypass protection here."
        },
        {
          "id": "sur_high",
          "name": "Startup Rate High (SUR HI)",
          "priority": "caution",
          "panel": "A",
          "means": null,
          "response": "Monitor; no immediate action required."
        },
        {
          "id": "void_high",
          "name": "High Coolant Voiding (HI VOID)",
          "priority": "warning",
          "panel": "A",
          "means": "Too much steam (void) in the core — reactivity is rising.",
          "response": "Raise Main Circulation Pump (MCP) flow to collapse voids; reduce power."
        },
        {
          "id": "fuel_temp_high",
          "name": "High Fuel Temperature (HI FUEL T)",
          "priority": "warning",
          "panel": "A",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "steam_press_high",
          "name": "Steam Drum Pressure High (DRUM PRESS HI)",
          "priority": "warning",
          "panel": "B",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "steam_press_low",
          "name": "Steam Drum Pressure Low (DRUM PRESS LO)",
          "priority": "warning",
          "panel": "B",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "drum_level_low",
          "name": "Steam Drum Level Low (DRUM LVL LO)",
          "priority": "warning",
          "panel": "B",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "drum_level_lolo",
          "name": "Steam Drum Level Critical Low (DRUM LVL LO LO)",
          "priority": "critical",
          "panel": "B",
          "means": "Steam-drum level critically low.",
          "response": "Restore feedwater; shut down if it cannot be restored."
        },
        {
          "id": "flow_low",
          "name": "Low Coolant Flow (LO FLOW)",
          "priority": "warning",
          "panel": "B",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "eps_bypass",
          "name": "Emergency Protection Bypassed (EPS BYPASS)",
          "priority": "warning",
          "panel": "B",
          "means": "Automatic Emergency Protection (EPS) is switched OFF — the reactor is unprotected.",
          "response": "Re-enable EPS unless a specific authorized test requires otherwise."
        }
      ],
      "failures": [
        {
          "id": "mcp_trip",
          "display": "MCP Trip",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "eps_bypass",
          "display": "EPS Bypass Active",
          "category": "safety_system",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "channel_dryout",
          "display": "Channel Dryout",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Dryout Severity",
            "unit": "% heat-transfer loss",
            "min": 0,
            "max": 90,
            "default": 50
          }
        },
        {
          "id": "loss_of_feedwater",
          "display": "Loss of Feedwater",
          "category": "coolant",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "partial_mcp_trip",
          "display": "Partial MCP Trip / Flow Runback",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Pumps Lost",
            "unit": "% of pumps",
            "min": 0,
            "max": 75,
            "default": 50
          }
        },
        {
          "id": "orm_indicator_failure",
          "display": "ORM Indicator Failed (reads safe)",
          "category": "instrument",
          "type": "instrument",
          "severity_meta": null
        },
        {
          "id": "failure_to_scram",
          "display": "AZ-5 Failure to Insert",
          "category": "safety_system",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "stuck_rods_on_scram",
          "display": "Rods Stuck Mid-Insertion",
          "category": "reactivity",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Rod Worth Held",
            "unit": "% of total",
            "min": 0,
            "max": 40,
            "default": 20
          }
        },
        {
          "id": "continuous_rod_withdrawal",
          "display": "Continuous Rod Withdrawal",
          "category": "reactivity",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Withdrawal Rate",
            "unit": "steps/s",
            "min": 0,
            "max": 6,
            "default": 3
          }
        },
        {
          "id": "pressure_tube_rupture",
          "display": "Pressure Tube Rupture",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Break Size",
            "unit": "% effective area",
            "min": 0,
            "max": 100,
            "default": 30
          }
        },
        {
          "id": "void_sensor_failure",
          "display": "Void Fraction Sensor Stuck",
          "category": "instrument",
          "type": "instrument",
          "severity_meta": null
        },
        {
          "id": "turbine_trip",
          "display": "Turbine Trip",
          "category": "power",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "loss_of_condenser_vacuum",
          "display": "Loss of Condenser Vacuum",
          "category": "power",
          "type": "physics_parameter",
          "severity_meta": null
        }
      ],
      "glossary": [
        {
          "acronym": "AC / DC",
          "term": "Alternating-current / direct-current electrical power."
        },
        {
          "acronym": "SUR",
          "term": "Startup Rate — how fast power is changing, in decades (factors of ten) per minute (DPM)."
        },
        {
          "acronym": "DPM",
          "term": "Decades Per Minute — the unit of startup rate (one decade = a factor of ten)."
        },
        {
          "acronym": "MWe / MWt",
          "term": "Megawatts electric (grid output) / megawatts thermal (reactor heat)."
        },
        {
          "acronym": "Reactor period",
          "term": "The time for power to change by a factor of e (~2.72); long period = slow change."
        },
        {
          "acronym": "SCRAM",
          "term": "A rapid full insertion of the control rods — emergency shutdown."
        },
        {
          "acronym": "Shutdown bank",
          "term": "The scram rods (the RBMK’s AZ / Emergency Protection group), normally parked fully withdrawn. Operable — hold Insert to add shutdown margin, Withdraw to park it back out — but a SCRAM always drives it fully in and overrides you."
        },
        {
          "acronym": "Decay heat",
          "term": "Heat from radioactive decay that continues after shutdown (~7% of rated, decaying)."
        },
        {
          "acronym": "Xenon",
          "term": "Xenon-135, a neutron-absorbing fission product that builds in after a power drop."
        },
        {
          "acronym": "Reactivity",
          "term": "The tendency of the chain reaction to grow (+) or shrink (−); critical = steady."
        },
        {
          "acronym": "AUTO / MAN",
          "term": "Automatic / manual control of a plant control channel (Tools → Automate). AUTO reads the instruments and issues commands to hold a setpoint; MAN leaves the control to you."
        },
        {
          "acronym": "Setpoint (SP)",
          "term": "The value an automatic controller holds its parameter at. Automate channels capture the current reading when engaged; edit it to maneuver on automatic."
        },
        {
          "acronym": "RBMK",
          "term": "The Chernobyl-type graphite-moderated reactor."
        },
        {
          "acronym": "ORM",
          "term": "Operating Reactivity Margin — shutdown capacity in hand."
        },
        {
          "acronym": "MCP",
          "term": "Main Circulation Pump."
        },
        {
          "acronym": "AZ-5",
          "term": "The emergency-shutdown button."
        },
        {
          "acronym": "EPS",
          "term": "Emergency Protection System (auto-trips)."
        },
        {
          "acronym": "ECCS",
          "term": "Emergency Core Cooling System — injects to the channels on a rupture / loss of coolant."
        },
        {
          "acronym": "Void",
          "term": "Steam bubbles in the coolant; in an RBMK they raise power."
        },
        {
          "acronym": "Positive scram effect",
          "term": "Pre-1986 rods briefly added reactivity as they began inserting."
        }
      ],
      "normal_values": {
        "full_power": {
          "label": "100% power, all systems normal.",
          "settled_s": 60,
          "true_state": {
            "power_pct": 100.004,
            "fuel_temp_c": 565.751,
            "void_fraction_avg": 0.35,
            "steam_pressure_mpa": 7,
            "drum_level_pct": 50,
            "channel_flow_pct": 100,
            "graphite_temp_avg_c": 290.74,
            "decay_heat_pct": 7,
            "xenon_pct_eq": 100,
            "orm_equiv_rods": 70.333,
            "orm_alarm_active": false,
            "eps_bypassed": false,
            "eccs_active": false,
            "scrammed": false,
            "melted": false,
            "destruction_cause": "none",
            "steam_explosion_occurred": false,
            "energy_deposition_rate": 4,
            "design_version": "pre_chernobyl",
            "reactivity_pcm": -0.029,
            "startup_rate_dpm": 0.00000481,
            "reactor_period_s": 5416260.16,
            "steam_to_turbine": 1,
            "mwe_output": 1000.034,
            "turbine_rpm": 3000,
            "condenser_vacuum_kpa": 96.5,
            "turbine_tripped": false,
            "load_mode": "follow",
            "load_target_mwe": 1000.034,
            "load_imbalance_mwe": 0.00518,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 100.077,
            "steam_pressure": 6.992,
            "drum_level": 49.549,
            "channel_flow": 99.667,
            "void_fraction": 0.343,
            "fuel_temp": 560.308,
            "turbine_rpm": 3001.457,
            "condenser_vacuum": 96.874,
            "mwe_output": 999.957,
            "startup_rate": -0.016,
            "orm_display": 70.333,
            "rps_scrammed": false,
            "eps_bypassed": false,
            "orm_alarm_active": false
          }
        },
        "50_percent": {
          "label": "Stable partial power for maneuvering practice.",
          "settled_s": 60,
          "true_state": {
            "power_pct": 50.249,
            "fuel_temp_c": 426.2,
            "void_fraction_avg": 0.22,
            "steam_pressure_mpa": 7.001,
            "drum_level_pct": 50,
            "channel_flow_pct": 80,
            "graphite_temp_avg_c": 288.24,
            "decay_heat_pct": 3.5,
            "xenon_pct_eq": 99.937,
            "orm_equiv_rods": 89.768,
            "orm_alarm_active": false,
            "eps_bypassed": false,
            "eccs_active": false,
            "scrammed": false,
            "melted": false,
            "destruction_cause": "none",
            "steam_explosion_occurred": false,
            "energy_deposition_rate": 2.01,
            "design_version": "pre_chernobyl",
            "reactivity_pcm": 0.461,
            "startup_rate_dpm": 0.00176,
            "reactor_period_s": 14820.185,
            "steam_to_turbine": 0.501,
            "mwe_output": 501.182,
            "turbine_rpm": 3000,
            "condenser_vacuum_kpa": 96.5,
            "turbine_tripped": false,
            "load_mode": "follow",
            "load_target_mwe": 501.182,
            "load_imbalance_mwe": 1.306,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 50.32,
            "steam_pressure": 6.993,
            "drum_level": 49.549,
            "channel_flow": 79.667,
            "void_fraction": 0.213,
            "fuel_temp": 420.718,
            "turbine_rpm": 3001.457,
            "condenser_vacuum": 96.874,
            "mwe_output": 501.092,
            "startup_rate": -0.015,
            "orm_display": 89.768,
            "rps_scrammed": false,
            "eps_bypassed": false,
            "orm_alarm_active": false
          }
        },
        "hot_startup": {
          "label": "Hot Standby: subcritical, low power, flow established — the approach-to-criticality start.",
          "settled_s": 5,
          "true_state": {
            "power_pct": 0.00462,
            "fuel_temp_c": 290.325,
            "void_fraction_avg": 0.000087,
            "steam_pressure_mpa": 6.998,
            "drum_level_pct": 50,
            "channel_flow_pct": 70,
            "graphite_temp_avg_c": 285.839,
            "decay_heat_pct": 0.489,
            "xenon_pct_eq": 0.00039,
            "orm_equiv_rods": 77.737,
            "orm_alarm_active": false,
            "eps_bypassed": false,
            "eccs_active": false,
            "scrammed": false,
            "melted": false,
            "destruction_cause": "none",
            "steam_explosion_occurred": false,
            "energy_deposition_rate": 0.000189,
            "design_version": "pre_chernobyl",
            "reactivity_pcm": -651.798,
            "startup_rate_dpm": -0.00929,
            "reactor_period_s": -2803.697,
            "steam_to_turbine": 0.018,
            "mwe_output": 17.902,
            "turbine_rpm": 3000,
            "condenser_vacuum_kpa": 96.5,
            "turbine_tripped": false,
            "load_mode": "follow",
            "load_target_mwe": 17.902,
            "load_imbalance_mwe": -17.856,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 0.749,
            "steam_pressure": 7.005,
            "drum_level": 50.121,
            "channel_flow": 68.761,
            "void_fraction": 0,
            "fuel_temp": 290.94,
            "turbine_rpm": 3001.094,
            "condenser_vacuum": 96.974,
            "mwe_output": 15.649,
            "startup_rate": -0.012,
            "orm_display": 77.737,
            "rps_scrammed": false,
            "eps_bypassed": false,
            "orm_alarm_active": false
          }
        },
        "low_power_xenon": {
          "label": "The Chernobyl precondition: ~7% power, xenon ~135%, ORM ~7.5, protection bypassed.",
          "settled_s": 5,
          "true_state": {
            "power_pct": 7.124,
            "fuel_temp_c": 305.362,
            "void_fraction_avg": 0.041,
            "steam_pressure_mpa": 7,
            "drum_level_pct": 50,
            "channel_flow_pct": 60,
            "graphite_temp_avg_c": 286.09,
            "decay_heat_pct": 0.49,
            "xenon_pct_eq": 134.986,
            "orm_equiv_rods": 7.404,
            "orm_alarm_active": true,
            "eps_bypassed": false,
            "eccs_active": false,
            "scrammed": false,
            "melted": false,
            "destruction_cause": "none",
            "steam_explosion_occurred": false,
            "energy_deposition_rate": 0.284,
            "design_version": "pre_chernobyl",
            "reactivity_pcm": 7.811,
            "startup_rate_dpm": 0.116,
            "reactor_period_s": 224.553,
            "steam_to_turbine": 0.07,
            "mwe_output": 70.046,
            "turbine_rpm": 3000,
            "condenser_vacuum_kpa": 96.5,
            "turbine_tripped": false,
            "load_mode": "follow",
            "load_target_mwe": 70.046,
            "load_imbalance_mwe": 1.192,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 7.843,
            "steam_pressure": 7.007,
            "drum_level": 50.121,
            "channel_flow": 58.761,
            "void_fraction": 0.039,
            "fuel_temp": 305.394,
            "turbine_rpm": 3001.094,
            "condenser_vacuum": 96.974,
            "mwe_output": 67.582,
            "startup_rate": 0.068,
            "orm_display": 7.404,
            "rps_scrammed": false,
            "eps_bypassed": false,
            "orm_alarm_active": true
          }
        }
      }
    },
    "rbmk_post": {
      "id": "rbmk_post",
      "plant": "rbmk",
      "design_version": "post_chernobyl",
      "name": "RBMK-1000 (Chernobyl-type) — post-1986",
      "one_liner": "The unstable reactor — where boiling RAISES power instead of lowering it. ~3200 MWt / ~1000 MWe; graphite-moderated, water-cooled pressure tubes, steam drum ≈ 7.0 MPa. Carries both the pre-1986 and post-1986 designs.",
      "overview": "Graphite (not water) slows the neutrons, and the cooling water mostly absorbs them — so when the water boils into steam (called \"void\"), reactivity RISES. This positive void coefficient, together with the pre-1986 control rods whose graphite tips briefly ADDED reactivity as they began to insert (the \"positive scram effect\"), is what turned an emergency shutdown into the Chernobyl explosion. There is no boron and no moderator-temperature coefficient; the graphite gives a slow, slightly-positive feedback. The Operating Reactivity Margin (ORM) — how much shutdown capacity is currently inserted — is the key safety parameter. Power is controlled by Control Rods and by Main Circulation Pump (MCP) flow. The emergency shutdown is the AZ-5 button.",
      "authentic_units": "The RBMK is read in SI (MPa / °C) — the trainer default.",
      "controls": [
        {
          "control": "Rods — Raise / Lower (hold)",
          "group": "Reactivity",
          "uses": "Hold to drive a rod group: Raise (withdraw) adds reactivity and raises power; Lower (insert) removes it. Release to stop.",
          "command": "rod_start",
          "params": "{group_id,direction,speed}"
        },
        {
          "control": "Rods — Nudge",
          "group": "Reactivity",
          "uses": "Move the rods a small, fixed amount (rate-limited, not instant) — for fine reactivity adjustments.",
          "command": "rod_nudge",
          "params": "{group_id,steps,speed}"
        },
        {
          "control": "Rods — Stop",
          "group": "Reactivity",
          "uses": "Stop the selected rod group.",
          "command": "rod_stop",
          "params": "{group_id}"
        },
        {
          "control": "Rods — Stop All",
          "group": "Reactivity",
          "uses": "Stop all moving rod groups.",
          "command": "rod_stop_all",
          "params": ""
        },
        {
          "control": "AZ-5 (SCRAM)",
          "group": "Safety",
          "uses": "The RBMK emergency-shutdown button (the one pressed at Chernobyl) — full rod insertion.",
          "command": "manual_scram",
          "params": ""
        },
        {
          "control": "SCRAM",
          "group": "Safety",
          "uses": "Emergency shutdown — drives every rod fully in at once. A two-click armed button.",
          "command": "scram",
          "params": ""
        },
        {
          "control": "Coolant Flow (MCP)",
          "group": "Coolant",
          "uses": "Sets Main Circulation Pump (MCP) flow, percent of rated. In the RBMK, MORE flow sweeps out steam and LOWERS power; LESS flow raises it. The primary power control.",
          "command": "set_channel_flow",
          "params": "{pct}"
        },
        {
          "control": "Feedwater Flow",
          "group": "Secondary",
          "uses": "Sets the make-up water flow to the boiler, as a percent of rated; used to control level.",
          "command": "set_feedwater_flow",
          "params": "{pct}"
        },
        {
          "control": "Turbine Load",
          "group": "Turbine & Grid",
          "uses": "Sets how much steam the turbine draws (MWe); the steam it does not take is dumped or relieved.",
          "command": "set_turbine_load",
          "params": "{mwe}"
        },
        {
          "control": "Steam Dump / Bypass",
          "group": "Turbine & Grid",
          "uses": "Dumps steam straight to the condenser (bypassing the turbine) to control pressure on a load rejection.",
          "command": "set_steam_dump",
          "params": "{mode|pct}"
        },
        {
          "control": "Emergency Core Cooling (ECCS)",
          "group": "Safety",
          "uses": "Emergency Core Cooling System — injects to the fuel channels on a pressure-tube rupture / loss of coolant: makes up steam-drum level and holds a cooling-flow floor to arrest dryout.",
          "command": "set_eccs",
          "params": "{active}"
        },
        {
          "control": "EPS Bypass",
          "group": "Safety",
          "uses": "Disables the automatic Emergency Protection System (EPS) trips — as was done before Chernobyl. Dangerous; use only for an authorized test.",
          "command": "set_eps_bypass",
          "params": "{active}"
        },
        {
          "control": "Automate Tab (per-control automation)",
          "group": "Automation",
          "uses": "Tools → Automate: an AUTO/MAN toggle per plant control (rod control, feedwater level control, pressure control, load follow, steam dump, …). Engaged channels read the INSTRUMENTS and issue these same commands for you — setpoints capture the current reading and are editable. A failed sensor fools the automation, interlocks block it, and while a channel is engaged it overrides your manual input for that control. Rod/power channels disengage themselves on a scram.",
          "command": "(issues the commands above)",
          "params": ""
        }
      ],
      "indications": [
        {
          "id": "power_range",
          "name": "Reactor Power",
          "measures": "Reactor power (from neutron flux), as a percent of rated.",
          "unit": "%",
          "range": [
            0,
            200
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": [
            "high_power"
          ]
        },
        {
          "id": "steam_pressure",
          "name": "Steam-Drum Pressure",
          "measures": "Steam-drum pressure.",
          "unit": "MPa",
          "range": [
            0,
            10.3
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": [
            "steam_press_high",
            "steam_press_low"
          ]
        },
        {
          "id": "drum_level",
          "name": "Steam-Drum Level",
          "measures": "Water level in the steam drum.",
          "unit": "%",
          "range": [
            0,
            100
          ],
          "lag_s": 2,
          "derived": false,
          "boolean": false,
          "alarms": [
            "drum_level_low",
            "drum_level_lolo"
          ]
        },
        {
          "id": "channel_flow",
          "name": "Channel Flow",
          "measures": "Coolant flow through the fuel channels, percent of rated.",
          "unit": "%",
          "range": [
            0,
            120
          ],
          "lag_s": 1,
          "derived": false,
          "boolean": false,
          "alarms": [
            "flow_low"
          ]
        },
        {
          "id": "void_fraction",
          "name": "Void Fraction",
          "measures": "Fraction of the coolant that is steam bubbles — drives RBMK power.",
          "unit": "frac",
          "range": [
            0,
            1
          ],
          "lag_s": 1,
          "derived": false,
          "boolean": false,
          "alarms": [
            "void_high"
          ]
        },
        {
          "id": "fuel_temp",
          "name": "Fuel Temperature",
          "measures": "Fuel temperature.",
          "unit": "°C",
          "range": [
            0,
            2000
          ],
          "lag_s": 4,
          "derived": false,
          "boolean": false,
          "alarms": [
            "fuel_temp_high"
          ]
        },
        {
          "id": "orm_display",
          "name": "Operating Reactivity Margin (ORM)",
          "measures": "Shutdown capacity currently in hand, in equivalent rods. The Chernobyl precondition when too low.",
          "unit": "rods",
          "range": [
            0,
            211
          ],
          "lag_s": 0,
          "derived": true,
          "boolean": false,
          "alarms": [
            "orm_low"
          ]
        },
        {
          "id": "turbine_rpm",
          "name": "Turbine Speed",
          "measures": "Turbine/generator speed; locked to the grid when synchronized.",
          "unit": "RPM",
          "range": [
            0,
            3600
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "condenser_vacuum",
          "name": "Condenser Vacuum",
          "measures": "Condenser vacuum — needed for the turbine to run.",
          "unit": "kPa",
          "range": [
            0,
            102
          ],
          "lag_s": 5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "mwe_output",
          "name": "Electrical Output",
          "measures": "Gross electrical power to the grid.",
          "unit": "MWe",
          "range": [
            0,
            1200
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "startup_rate",
          "name": "startup_rate",
          "measures": "startup_rate",
          "unit": "",
          "range": [
            -5,
            10
          ],
          "lag_s": 2,
          "derived": false,
          "boolean": false,
          "alarms": [
            "sur_high"
          ]
        }
      ],
      "setpoints": {
        "trips": [
          {
            "instrument": "power_range",
            "direction": "high",
            "setpoint": 120,
            "action": "scram"
          },
          {
            "instrument": "steam_pressure",
            "direction": "high",
            "setpoint": 8,
            "action": "scram"
          },
          {
            "instrument": "drum_level",
            "direction": "low",
            "setpoint": 10,
            "action": "scram"
          },
          {
            "instrument": "power_range",
            "direction": "high",
            "setpoint": 110,
            "action": "scram"
          },
          {
            "instrument": "void_fraction",
            "direction": "high",
            "setpoint": 0.8,
            "action": "scram"
          }
        ],
        "actuations": [],
        "alarms": [
          {
            "id": "reactor_trip",
            "name": "Reactor Scram (AZ-5) (AZ-5 SCRAM)",
            "instrument": "rps_scrammed",
            "direction": "is_true",
            "setpoint": null,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "high_power",
            "name": "High Reactor Power (HI POWER)",
            "instrument": "power_range",
            "direction": "high",
            "setpoint": 110,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "orm_low",
            "name": "Operating Reactivity Margin Too Low (ORM LO)",
            "instrument": "orm_display",
            "direction": "low",
            "setpoint": 43,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "sur_high",
            "name": "Startup Rate High (SUR HI)",
            "instrument": "startup_rate",
            "direction": "high",
            "setpoint": 3,
            "priority": "caution",
            "panel": "A"
          },
          {
            "id": "void_high",
            "name": "High Coolant Voiding (HI VOID)",
            "instrument": "void_fraction",
            "direction": "high",
            "setpoint": 0.7,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "fuel_temp_high",
            "name": "High Fuel Temperature (HI FUEL T)",
            "instrument": "fuel_temp",
            "direction": "high",
            "setpoint": 1500,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "steam_press_high",
            "name": "Steam Drum Pressure High (DRUM PRESS HI)",
            "instrument": "steam_pressure",
            "direction": "high",
            "setpoint": 7.6,
            "priority": "warning",
            "panel": "B"
          },
          {
            "id": "steam_press_low",
            "name": "Steam Drum Pressure Low (DRUM PRESS LO)",
            "instrument": "steam_pressure",
            "direction": "low",
            "setpoint": 6.4,
            "priority": "warning",
            "panel": "B"
          },
          {
            "id": "drum_level_low",
            "name": "Steam Drum Level Low (DRUM LVL LO)",
            "instrument": "drum_level",
            "direction": "low",
            "setpoint": 20,
            "priority": "warning",
            "panel": "B"
          },
          {
            "id": "drum_level_lolo",
            "name": "Steam Drum Level Critical Low (DRUM LVL LO LO)",
            "instrument": "drum_level",
            "direction": "low",
            "setpoint": 10,
            "priority": "critical",
            "panel": "B"
          },
          {
            "id": "flow_low",
            "name": "Low Coolant Flow (LO FLOW)",
            "instrument": "channel_flow",
            "direction": "low",
            "setpoint": 50,
            "priority": "warning",
            "panel": "B"
          },
          {
            "id": "eps_bypass",
            "name": "Emergency Protection Bypassed (EPS BYPASS)",
            "instrument": "eps_bypassed",
            "direction": "is_true",
            "setpoint": null,
            "priority": "warning",
            "panel": "B"
          }
        ]
      },
      "safety_limits": [
        {
          "name": "Fuel melt (thermal path)",
          "v": 2800,
          "u": "°C",
          "note": "Gradual-melt destruction path."
        },
        {
          "name": "Steam-explosion energy deposition",
          "v": 280,
          "u": "cal/g/s",
          "note": "Prompt-excursion destruction path (Chernobyl)."
        },
        {
          "name": "Drum relief valves open",
          "v": 8,
          "u": "MPa",
          "note": "Overpressure relief."
        },
        {
          "name": "ORM minimum (pre / post)",
          "v": "15 / 43",
          "u": "rods",
          "note": "Below this the void feedback amplifies dangerously."
        }
      ],
      "alarm_response": [
        {
          "id": "reactor_trip",
          "name": "Reactor Scram (AZ-5) (AZ-5 SCRAM)",
          "priority": "critical",
          "panel": "A",
          "means": "AZ-5 has fired — the reactor is shutting down.",
          "response": "Confirm rods inserting and power dropping; maintain coolant flow."
        },
        {
          "id": "high_power",
          "name": "High Reactor Power (HI POWER)",
          "priority": "critical",
          "panel": "A",
          "means": "Reactor power is above the setpoint.",
          "response": "Reduce power (raise flow / insert rods); AZ-5 if it keeps rising."
        },
        {
          "id": "orm_low",
          "name": "Operating Reactivity Margin Too Low (ORM LO)",
          "priority": "critical",
          "panel": "A",
          "means": "The Operating Reactivity Margin (ORM) is too low — the reactor is unstable and hard to shut down. THIS IS THE CHERNOBYL PRECONDITION.",
          "response": "Insert Control Rods to restore ORM; if it cannot be restored, shut down. Never bypass protection here."
        },
        {
          "id": "sur_high",
          "name": "Startup Rate High (SUR HI)",
          "priority": "caution",
          "panel": "A",
          "means": null,
          "response": "Monitor; no immediate action required."
        },
        {
          "id": "void_high",
          "name": "High Coolant Voiding (HI VOID)",
          "priority": "warning",
          "panel": "A",
          "means": "Too much steam (void) in the core — reactivity is rising.",
          "response": "Raise Main Circulation Pump (MCP) flow to collapse voids; reduce power."
        },
        {
          "id": "fuel_temp_high",
          "name": "High Fuel Temperature (HI FUEL T)",
          "priority": "warning",
          "panel": "A",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "steam_press_high",
          "name": "Steam Drum Pressure High (DRUM PRESS HI)",
          "priority": "warning",
          "panel": "B",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "steam_press_low",
          "name": "Steam Drum Pressure Low (DRUM PRESS LO)",
          "priority": "warning",
          "panel": "B",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "drum_level_low",
          "name": "Steam Drum Level Low (DRUM LVL LO)",
          "priority": "warning",
          "panel": "B",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "drum_level_lolo",
          "name": "Steam Drum Level Critical Low (DRUM LVL LO LO)",
          "priority": "critical",
          "panel": "B",
          "means": "Steam-drum level critically low.",
          "response": "Restore feedwater; shut down if it cannot be restored."
        },
        {
          "id": "flow_low",
          "name": "Low Coolant Flow (LO FLOW)",
          "priority": "warning",
          "panel": "B",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "eps_bypass",
          "name": "Emergency Protection Bypassed (EPS BYPASS)",
          "priority": "warning",
          "panel": "B",
          "means": "Automatic Emergency Protection (EPS) is switched OFF — the reactor is unprotected.",
          "response": "Re-enable EPS unless a specific authorized test requires otherwise."
        }
      ],
      "failures": [
        {
          "id": "mcp_trip",
          "display": "MCP Trip",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "eps_bypass",
          "display": "EPS Bypass Active",
          "category": "safety_system",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "channel_dryout",
          "display": "Channel Dryout",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Dryout Severity",
            "unit": "% heat-transfer loss",
            "min": 0,
            "max": 90,
            "default": 50
          }
        },
        {
          "id": "loss_of_feedwater",
          "display": "Loss of Feedwater",
          "category": "coolant",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "partial_mcp_trip",
          "display": "Partial MCP Trip / Flow Runback",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Pumps Lost",
            "unit": "% of pumps",
            "min": 0,
            "max": 75,
            "default": 50
          }
        },
        {
          "id": "orm_indicator_failure",
          "display": "ORM Indicator Failed (reads safe)",
          "category": "instrument",
          "type": "instrument",
          "severity_meta": null
        },
        {
          "id": "failure_to_scram",
          "display": "AZ-5 Failure to Insert",
          "category": "safety_system",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "stuck_rods_on_scram",
          "display": "Rods Stuck Mid-Insertion",
          "category": "reactivity",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Rod Worth Held",
            "unit": "% of total",
            "min": 0,
            "max": 40,
            "default": 20
          }
        },
        {
          "id": "continuous_rod_withdrawal",
          "display": "Continuous Rod Withdrawal",
          "category": "reactivity",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Withdrawal Rate",
            "unit": "steps/s",
            "min": 0,
            "max": 6,
            "default": 3
          }
        },
        {
          "id": "pressure_tube_rupture",
          "display": "Pressure Tube Rupture",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Break Size",
            "unit": "% effective area",
            "min": 0,
            "max": 100,
            "default": 30
          }
        },
        {
          "id": "void_sensor_failure",
          "display": "Void Fraction Sensor Stuck",
          "category": "instrument",
          "type": "instrument",
          "severity_meta": null
        },
        {
          "id": "turbine_trip",
          "display": "Turbine Trip",
          "category": "power",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "loss_of_condenser_vacuum",
          "display": "Loss of Condenser Vacuum",
          "category": "power",
          "type": "physics_parameter",
          "severity_meta": null
        }
      ],
      "glossary": [
        {
          "acronym": "AC / DC",
          "term": "Alternating-current / direct-current electrical power."
        },
        {
          "acronym": "SUR",
          "term": "Startup Rate — how fast power is changing, in decades (factors of ten) per minute (DPM)."
        },
        {
          "acronym": "DPM",
          "term": "Decades Per Minute — the unit of startup rate (one decade = a factor of ten)."
        },
        {
          "acronym": "MWe / MWt",
          "term": "Megawatts electric (grid output) / megawatts thermal (reactor heat)."
        },
        {
          "acronym": "Reactor period",
          "term": "The time for power to change by a factor of e (~2.72); long period = slow change."
        },
        {
          "acronym": "SCRAM",
          "term": "A rapid full insertion of the control rods — emergency shutdown."
        },
        {
          "acronym": "Shutdown bank",
          "term": "The scram rods (the RBMK’s AZ / Emergency Protection group), normally parked fully withdrawn. Operable — hold Insert to add shutdown margin, Withdraw to park it back out — but a SCRAM always drives it fully in and overrides you."
        },
        {
          "acronym": "Decay heat",
          "term": "Heat from radioactive decay that continues after shutdown (~7% of rated, decaying)."
        },
        {
          "acronym": "Xenon",
          "term": "Xenon-135, a neutron-absorbing fission product that builds in after a power drop."
        },
        {
          "acronym": "Reactivity",
          "term": "The tendency of the chain reaction to grow (+) or shrink (−); critical = steady."
        },
        {
          "acronym": "AUTO / MAN",
          "term": "Automatic / manual control of a plant control channel (Tools → Automate). AUTO reads the instruments and issues commands to hold a setpoint; MAN leaves the control to you."
        },
        {
          "acronym": "Setpoint (SP)",
          "term": "The value an automatic controller holds its parameter at. Automate channels capture the current reading when engaged; edit it to maneuver on automatic."
        },
        {
          "acronym": "RBMK",
          "term": "The Chernobyl-type graphite-moderated reactor."
        },
        {
          "acronym": "ORM",
          "term": "Operating Reactivity Margin — shutdown capacity in hand."
        },
        {
          "acronym": "MCP",
          "term": "Main Circulation Pump."
        },
        {
          "acronym": "AZ-5",
          "term": "The emergency-shutdown button."
        },
        {
          "acronym": "EPS",
          "term": "Emergency Protection System (auto-trips)."
        },
        {
          "acronym": "ECCS",
          "term": "Emergency Core Cooling System — injects to the channels on a rupture / loss of coolant."
        },
        {
          "acronym": "Void",
          "term": "Steam bubbles in the coolant; in an RBMK they raise power."
        },
        {
          "acronym": "Positive scram effect",
          "term": "Pre-1986 rods briefly added reactivity as they began inserting."
        }
      ],
      "normal_values": {
        "full_power": {
          "label": "100% power, all systems normal.",
          "settled_s": 60,
          "true_state": {
            "power_pct": 100.004,
            "fuel_temp_c": 565.75,
            "void_fraction_avg": 0.35,
            "steam_pressure_mpa": 7,
            "drum_level_pct": 50,
            "channel_flow_pct": 100,
            "graphite_temp_avg_c": 290.74,
            "decay_heat_pct": 7,
            "xenon_pct_eq": 100,
            "orm_equiv_rods": 70.333,
            "orm_alarm_active": false,
            "eps_bypassed": false,
            "eccs_active": false,
            "scrammed": false,
            "melted": false,
            "destruction_cause": "none",
            "steam_explosion_occurred": false,
            "energy_deposition_rate": 4,
            "design_version": "post_chernobyl",
            "reactivity_pcm": -0.029,
            "startup_rate_dpm": 0.00000276,
            "reactor_period_s": 9441410.584,
            "steam_to_turbine": 1,
            "mwe_output": 1000.031,
            "turbine_rpm": 3000,
            "condenser_vacuum_kpa": 96.5,
            "turbine_tripped": false,
            "load_mode": "follow",
            "load_target_mwe": 1000.031,
            "load_imbalance_mwe": 0.00459,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 100.076,
            "steam_pressure": 6.992,
            "drum_level": 49.549,
            "channel_flow": 99.667,
            "void_fraction": 0.343,
            "fuel_temp": 560.307,
            "turbine_rpm": 3001.457,
            "condenser_vacuum": 96.874,
            "mwe_output": 999.955,
            "startup_rate": -0.016,
            "orm_display": 70.333,
            "rps_scrammed": false,
            "eps_bypassed": false,
            "orm_alarm_active": false
          }
        },
        "50_percent": {
          "label": "Stable partial power for maneuvering practice.",
          "settled_s": 60,
          "true_state": {
            "power_pct": 50.226,
            "fuel_temp_c": 426.158,
            "void_fraction_avg": 0.22,
            "steam_pressure_mpa": 7.001,
            "drum_level_pct": 50,
            "channel_flow_pct": 80,
            "graphite_temp_avg_c": 288.24,
            "decay_heat_pct": 3.5,
            "xenon_pct_eq": 99.937,
            "orm_equiv_rods": 89.768,
            "orm_alarm_active": false,
            "eps_bypassed": false,
            "eccs_active": false,
            "scrammed": false,
            "melted": false,
            "destruction_cause": "none",
            "steam_explosion_occurred": false,
            "energy_deposition_rate": 2.009,
            "design_version": "post_chernobyl",
            "reactivity_pcm": 0.417,
            "startup_rate_dpm": 0.00163,
            "reactor_period_s": 15969.411,
            "steam_to_turbine": 0.501,
            "mwe_output": 501.073,
            "turbine_rpm": 3000,
            "condenser_vacuum_kpa": 96.5,
            "turbine_tripped": false,
            "load_mode": "follow",
            "load_target_mwe": 501.073,
            "load_imbalance_mwe": 1.191,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 50.298,
            "steam_pressure": 6.993,
            "drum_level": 49.549,
            "channel_flow": 79.667,
            "void_fraction": 0.213,
            "fuel_temp": 420.679,
            "turbine_rpm": 3001.457,
            "condenser_vacuum": 96.874,
            "mwe_output": 500.983,
            "startup_rate": -0.015,
            "orm_display": 89.768,
            "rps_scrammed": false,
            "eps_bypassed": false,
            "orm_alarm_active": false
          }
        },
        "hot_startup": {
          "label": "Hot Standby: subcritical, low power, flow established — the approach-to-criticality start.",
          "settled_s": 5,
          "true_state": {
            "power_pct": 0.00273,
            "fuel_temp_c": 290.324,
            "void_fraction_avg": 0.0000776,
            "steam_pressure_mpa": 6.998,
            "drum_level_pct": 50,
            "channel_flow_pct": 70,
            "graphite_temp_avg_c": 285.839,
            "decay_heat_pct": 0.489,
            "xenon_pct_eq": 0.00039,
            "orm_equiv_rods": 77.737,
            "orm_alarm_active": false,
            "eps_bypassed": false,
            "eccs_active": false,
            "scrammed": false,
            "melted": false,
            "destruction_cause": "none",
            "steam_explosion_occurred": false,
            "energy_deposition_rate": 0.000114,
            "design_version": "post_chernobyl",
            "reactivity_pcm": -1097.212,
            "startup_rate_dpm": 0.00661,
            "reactor_period_s": 3939.891,
            "steam_to_turbine": 0.018,
            "mwe_output": 17.9,
            "turbine_rpm": 3000,
            "condenser_vacuum_kpa": 96.5,
            "turbine_tripped": false,
            "load_mode": "follow",
            "load_target_mwe": 17.9,
            "load_imbalance_mwe": -17.873,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 0.747,
            "steam_pressure": 7.005,
            "drum_level": 50.121,
            "channel_flow": 68.761,
            "void_fraction": 0,
            "fuel_temp": 290.94,
            "turbine_rpm": 3001.094,
            "condenser_vacuum": 96.974,
            "mwe_output": 15.648,
            "startup_rate": 0.012,
            "orm_display": 77.737,
            "rps_scrammed": false,
            "eps_bypassed": false,
            "orm_alarm_active": false
          }
        },
        "low_power_xenon": {
          "label": "The Chernobyl precondition: ~7% power, xenon ~135%, ORM ~7.5, protection bypassed.",
          "settled_s": 5,
          "true_state": {
            "power_pct": 9.923,
            "fuel_temp_c": 305.568,
            "void_fraction_avg": 0.048,
            "steam_pressure_mpa": 7,
            "drum_level_pct": 50,
            "channel_flow_pct": 60,
            "graphite_temp_avg_c": 286.09,
            "decay_heat_pct": 0.49,
            "xenon_pct_eq": 134.986,
            "orm_equiv_rods": 7.404,
            "orm_alarm_active": true,
            "eps_bypassed": false,
            "eccs_active": false,
            "scrammed": false,
            "melted": false,
            "destruction_cause": "none",
            "steam_explosion_occurred": false,
            "energy_deposition_rate": 0.346,
            "design_version": "post_chernobyl",
            "reactivity_pcm": 180.3,
            "startup_rate_dpm": 2.847,
            "reactor_period_s": 9.154,
            "steam_to_turbine": 0.07,
            "mwe_output": 70.459,
            "turbine_rpm": 3000,
            "condenser_vacuum_kpa": 96.5,
            "turbine_tripped": false,
            "load_mode": "follow",
            "load_target_mwe": 70.459,
            "load_imbalance_mwe": 28.769,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 9.406,
            "steam_pressure": 7.007,
            "drum_level": 50.121,
            "channel_flow": 58.761,
            "void_fraction": 0.042,
            "fuel_temp": 305.425,
            "turbine_rpm": 3001.094,
            "condenser_vacuum": 96.974,
            "mwe_output": 67.824,
            "startup_rate": 0.837,
            "orm_display": 7.404,
            "rps_scrammed": false,
            "eps_bypassed": false,
            "orm_alarm_active": true
          }
        }
      }
    },
    "bwr": {
      "id": "bwr",
      "plant": "bwr",
      "design_version": null,
      "name": "Boiling Water Reactor (BWR)",
      "one_liner": "Stable like the PWR, but it boils water directly in the core and sends the steam straight to the turbine. ~1100 MWe; vessel ≈ 7.03 MPa. Power is controlled largely by recirculation flow.",
      "overview": "Water boils in the core and the steam goes directly to the turbine — there is no separate loop. Because the water both cools and moderates, boiling (void) LOWERS reactivity — a negative feedback that makes the plant stable and lets you control power with Recirculation (recirc) flow: more flow sweeps out steam bubbles and raises power. Its passive, steam-driven safety systems run without alternating-current (AC) power — Reactor Core Isolation Cooling (RCIC) and High-Pressure Coolant Injection (HPCI). To inject at low pressure you first depressurize with the Automatic Depressurization System (ADS) or manual relief valves, then use Low-Pressure Coolant Injection (LPCI) / core spray. This reactor hosts the Fukushima accident — an accident of sustained support.",
      "authentic_units": "The BWR is read in SI (MPa / °C) — the trainer default.",
      "controls": [
        {
          "control": "Rods — Raise / Lower (hold)",
          "group": "Reactivity",
          "uses": "Hold to drive a rod group: Raise (withdraw) adds reactivity and raises power; Lower (insert) removes it. Release to stop.",
          "command": "rod_start",
          "params": "{group_id,direction,speed}"
        },
        {
          "control": "Rods — Nudge",
          "group": "Reactivity",
          "uses": "Move the rods a small, fixed amount (rate-limited, not instant) — for fine reactivity adjustments.",
          "command": "rod_nudge",
          "params": "{group_id,steps,speed}"
        },
        {
          "control": "Rods — Stop",
          "group": "Reactivity",
          "uses": "Stop the selected rod group.",
          "command": "rod_stop",
          "params": "{group_id}"
        },
        {
          "control": "Rods — Stop All",
          "group": "Reactivity",
          "uses": "Stop all moving rod groups.",
          "command": "rod_stop_all",
          "params": ""
        },
        {
          "control": "SCRAM",
          "group": "Safety",
          "uses": "Emergency shutdown — drives every rod fully in at once. A two-click armed button.",
          "command": "scram",
          "params": ""
        },
        {
          "control": "Recirculation Flow",
          "group": "Reactivity",
          "uses": "Sets the recirculation (recirc) drive, percent. The main BWR power control: MORE flow → fewer steam bubbles → MORE power. Core flow is ≈ 2.5× the drive.",
          "command": "set_recirc_flow",
          "params": "{pct}"
        },
        {
          "control": "Feedwater Flow",
          "group": "Secondary",
          "uses": "Sets the make-up water flow to the boiler, as a percent of rated; used to control level.",
          "command": "set_feedwater_flow",
          "params": "{pct}"
        },
        {
          "control": "Turbine Load",
          "group": "Turbine & Grid",
          "uses": "Sets how much steam the turbine draws (MWe); the steam it does not take is dumped or relieved.",
          "command": "set_turbine_load",
          "params": "{mwe}"
        },
        {
          "control": "Steam Dump / Bypass",
          "group": "Turbine & Grid",
          "uses": "Dumps steam straight to the condenser (bypassing the turbine) to control pressure on a load rejection.",
          "command": "set_steam_dump",
          "params": "{mode|pct}"
        },
        {
          "control": "RCIC",
          "group": "Safety",
          "uses": "Reactor Core Isolation Cooling (RCIC) — a steam-driven pump that cools the core with no AC power. Auto-starts on low level.",
          "command": "set_rcic",
          "params": "{active}"
        },
        {
          "control": "Isolation Condenser (IC)",
          "group": "Safety",
          "uses": "Isolation Condenser — a passive heat sink that condenses reactor steam and returns the condensate by gravity, cooling the core with no AC and no fresh water (DC-powered valves). Fukushima Unit 1 relied on one.",
          "command": "set_ic",
          "params": "{active}"
        },
        {
          "control": "HPCI",
          "group": "Safety",
          "uses": "High-Pressure Coolant Injection (HPCI) — a higher-capacity steam-driven pump, also needing no AC power.",
          "command": "set_hpci",
          "params": "{active}"
        },
        {
          "control": "ADS (Depressurize)",
          "group": "Safety",
          "uses": "Automatic Depressurization System (ADS) — blows the vessel down fast so low-pressure pumps can inject.",
          "command": "trigger_ads",
          "params": ""
        },
        {
          "control": "LPCI (Low-Pressure Injection)",
          "group": "Safety",
          "uses": "Low-Pressure Coolant Injection (LPCI) — large-capacity injection; works only once pressure is below ~1.03 MPa.",
          "command": "start_lpci",
          "params": ""
        },
        {
          "control": "Core Spray (LPCS)",
          "group": "Safety",
          "uses": "Low-Pressure Core Spray (LPCS) — sprays water onto the fuel; a second low-pressure injection path.",
          "command": "start_lpcs",
          "params": ""
        },
        {
          "control": "Core Spray — Stop",
          "group": "Safety",
          "uses": "Stops the core spray.",
          "command": "stop_lpcs",
          "params": ""
        },
        {
          "control": "Manual Relief Valve — Open",
          "group": "Safety",
          "uses": "Opens a Safety/Relief Valve (SRV) by hand for a controlled depressurization (slower than ADS).",
          "command": "open_srv_manual",
          "params": ""
        },
        {
          "control": "Manual Relief Valve — Close",
          "group": "Safety",
          "uses": "Closes the manually-opened relief valve.",
          "command": "close_srv_manual",
          "params": ""
        },
        {
          "control": "SLC (Boron Injection)",
          "group": "Safety",
          "uses": "Standby Liquid Control (SLC) — injects boron to shut the reactor down even if the rods will not insert (the backup for a failure-to-scram).",
          "command": "initiate_slc",
          "params": ""
        },
        {
          "control": "SLC — Stop",
          "group": "Safety",
          "uses": "Stops further boron injection; the boron already injected stays in the core.",
          "command": "stop_slc",
          "params": ""
        },
        {
          "control": "Automate Tab (per-control automation)",
          "group": "Automation",
          "uses": "Tools → Automate: an AUTO/MAN toggle per plant control (rod control, feedwater level control, pressure control, load follow, steam dump, …). Engaged channels read the INSTRUMENTS and issue these same commands for you — setpoints capture the current reading and are editable. A failed sensor fools the automation, interlocks block it, and while a channel is engaged it overrides your manual input for that control. Rod/power channels disengage themselves on a scram.",
          "command": "(issues the commands above)",
          "params": ""
        }
      ],
      "indications": [
        {
          "id": "power_range",
          "name": "Reactor Power",
          "measures": "Reactor power (from neutron flux), as a percent of rated.",
          "unit": "%",
          "range": [
            0,
            120
          ],
          "lag_s": 0.1,
          "derived": false,
          "boolean": false,
          "alarms": [
            "high_power"
          ]
        },
        {
          "id": "vessel_pressure",
          "name": "Vessel Pressure",
          "measures": "Reactor-vessel pressure.",
          "unit": "MPa",
          "range": [
            0,
            10.3
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": [
            "vessel_press_hi",
            "vessel_press_lo"
          ]
        },
        {
          "id": "vessel_level",
          "name": "Vessel Level",
          "measures": "Water level in the vessel — the central safety parameter.",
          "unit": "%",
          "range": [
            0,
            100
          ],
          "lag_s": 2,
          "derived": false,
          "boolean": false,
          "alarms": [
            "vessel_level_low",
            "vessel_level_lolo"
          ]
        },
        {
          "id": "recirc_flow",
          "name": "Recirc / Core Flow",
          "measures": "Core flow from the recirculation system, percent of rated.",
          "unit": "%",
          "range": [
            0,
            120
          ],
          "lag_s": 1,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "steam_flow",
          "name": "Steam Flow",
          "measures": "Steam flow to the turbine (1.0 = rated).",
          "unit": "×rated",
          "range": [
            0,
            1.2
          ],
          "lag_s": 1,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "fw_flow",
          "name": "Feedwater Flow",
          "measures": "Feedwater flow (1.0 = rated).",
          "unit": "×rated",
          "range": [
            0,
            1.2
          ],
          "lag_s": 1,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "core_void_fraction",
          "name": "Core Void Fraction",
          "measures": "Steam-bubble fraction in the core.",
          "unit": "frac",
          "range": [
            0,
            1
          ],
          "lag_s": 1,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "turbine_rpm",
          "name": "Turbine Speed",
          "measures": "Turbine/generator speed; locked to the grid when synchronized.",
          "unit": "RPM",
          "range": [
            0,
            2200
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "condenser_vacuum",
          "name": "Condenser Vacuum",
          "measures": "Condenser vacuum — needed for the turbine to run.",
          "unit": "kPa",
          "range": [
            0,
            102
          ],
          "lag_s": 5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "mwe_output",
          "name": "Electrical Output",
          "measures": "Gross electrical power to the grid.",
          "unit": "MWe",
          "range": [
            0,
            1300
          ],
          "lag_s": 0.5,
          "derived": false,
          "boolean": false,
          "alarms": []
        },
        {
          "id": "rcic_status",
          "name": "RCIC Status",
          "measures": "Whether the steam-driven RCIC pump is running.",
          "unit": "",
          "range": null,
          "lag_s": null,
          "derived": false,
          "boolean": true,
          "alarms": [
            "rcic_running"
          ]
        }
      ],
      "setpoints": {
        "trips": [
          {
            "instrument": "power_range",
            "direction": "high",
            "setpoint": 120,
            "action": "scram"
          },
          {
            "instrument": "vessel_pressure",
            "direction": "high",
            "setpoint": 7.58,
            "action": "scram"
          },
          {
            "instrument": "vessel_pressure",
            "direction": "low",
            "setpoint": 5.52,
            "action": "scram"
          },
          {
            "instrument": "vessel_level",
            "direction": "low",
            "setpoint": 10,
            "action": "scram"
          }
        ],
        "actuations": [
          {
            "instrument": "vessel_level",
            "direction": "low",
            "setpoint": 45,
            "action": "set_rcic"
          },
          {
            "instrument": "fw_flow",
            "direction": "low",
            "setpoint": 0.05,
            "action": "set_rcic"
          },
          {
            "instrument": "vessel_level",
            "direction": "low",
            "setpoint": 30,
            "action": "set_hpci"
          },
          {
            "instrument": "vessel_level",
            "direction": "low",
            "setpoint": 15,
            "action": "trigger_ads",
            "condition": "hpci_unavailable"
          },
          {
            "instrument": "vessel_pressure",
            "direction": "low",
            "setpoint": 1.03,
            "action": "start_lpci",
            "condition": "ads_open"
          }
        ],
        "alarms": [
          {
            "id": "reactor_trip",
            "name": "Reactor Scram (REACTOR SCRAM)",
            "instrument": "rps_scrammed",
            "direction": "is_true",
            "setpoint": null,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "vessel_level_low",
            "name": "Vessel Level Low (VESSEL LVL LO)",
            "instrument": "vessel_level",
            "direction": "low",
            "setpoint": 30,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "vessel_level_lolo",
            "name": "Vessel Level Critical Low (VESSEL LVL LO LO)",
            "instrument": "vessel_level",
            "direction": "low",
            "setpoint": 10,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "vessel_press_hi",
            "name": "Vessel Pressure High (VESSEL PRESS HI)",
            "instrument": "vessel_pressure",
            "direction": "high",
            "setpoint": 7.24,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "vessel_press_lo",
            "name": "Vessel Pressure Low (VESSEL PRESS LO)",
            "instrument": "vessel_pressure",
            "direction": "low",
            "setpoint": 5.86,
            "priority": "warning",
            "panel": "A"
          },
          {
            "id": "high_power",
            "name": "High Reactor Power (HI POWER)",
            "instrument": "power_range",
            "direction": "high",
            "setpoint": 108,
            "priority": "critical",
            "panel": "A"
          },
          {
            "id": "rcic_running",
            "name": "RCIC Running (RCIC RUNNING)",
            "instrument": "rcic_status",
            "direction": "is_true",
            "setpoint": null,
            "priority": "status",
            "panel": "B"
          },
          {
            "id": "sbo",
            "name": "Station Blackout — AC Power Lost (SBO)",
            "instrument": "station_blackout",
            "direction": "is_true",
            "setpoint": null,
            "priority": "critical",
            "panel": "B"
          },
          {
            "id": "battery_low",
            "name": "Battery Power Low (BATT LO)",
            "instrument": "battery_pct",
            "direction": "low",
            "setpoint": 20,
            "priority": "warning",
            "panel": "B"
          }
        ]
      },
      "safety_limits": [
        {
          "name": "Fuel cladding damage",
          "v": 1200,
          "u": "°C",
          "note": "Cladding failure begins."
        },
        {
          "name": "Fuel melt",
          "v": 2800,
          "u": "°C",
          "note": "Core melt."
        },
        {
          "name": "Relief/safety valves open",
          "v": 7.58,
          "u": "MPa",
          "note": "SRV relief setpoint."
        },
        {
          "name": "Core uncovery",
          "v": "< 20",
          "u": "% level",
          "note": "Below 20% level the core uncovers → fuel heatup."
        },
        {
          "name": "Station-blackout battery window",
          "v": 8,
          "u": "h",
          "note": "RCIC/HPCI DC control-power duration (v1 timed)."
        }
      ],
      "alarm_response": [
        {
          "id": "reactor_trip",
          "name": "Reactor Scram (REACTOR SCRAM)",
          "priority": "critical",
          "panel": "A",
          "means": null,
          "response": "Act immediately — follow the emergency procedure for this condition."
        },
        {
          "id": "vessel_level_low",
          "name": "Vessel Level Low (VESSEL LVL LO)",
          "priority": "warning",
          "panel": "A",
          "means": "Vessel water level is low.",
          "response": "Confirm feedwater / RCIC; investigate the cause."
        },
        {
          "id": "vessel_level_lolo",
          "name": "Vessel Level Critical Low (VESSEL LVL LO LO)",
          "priority": "critical",
          "panel": "A",
          "means": null,
          "response": "Act immediately — follow the emergency procedure for this condition."
        },
        {
          "id": "vessel_press_hi",
          "name": "Vessel Pressure High (VESSEL PRESS HI)",
          "priority": "warning",
          "panel": "A",
          "means": "Vessel pressure is high.",
          "response": "Verify the relief valves lift; reduce power / open the turbine bypass."
        },
        {
          "id": "vessel_press_lo",
          "name": "Vessel Pressure Low (VESSEL PRESS LO)",
          "priority": "warning",
          "panel": "A",
          "means": null,
          "response": "Investigate and correct the cause before it worsens."
        },
        {
          "id": "high_power",
          "name": "High Reactor Power (HI POWER)",
          "priority": "critical",
          "panel": "A",
          "means": null,
          "response": "Act immediately — follow the emergency procedure for this condition."
        },
        {
          "id": "rcic_running",
          "name": "RCIC Running (RCIC RUNNING)",
          "priority": "status",
          "panel": "B",
          "means": "RCIC is running and cooling the core (status).",
          "response": "Monitor level and battery charge; stage the depressurize-and-inject contingency."
        },
        {
          "id": "sbo",
          "name": "Station Blackout — AC Power Lost (SBO)",
          "priority": "critical",
          "panel": "B",
          "means": "All AC power is lost — station blackout.",
          "response": "Start RCIC/HPCI (they need no AC); watch battery charge; plan to depressurize-and-inject before the batteries die."
        },
        {
          "id": "battery_low",
          "name": "Battery Power Low (BATT LO)",
          "priority": "warning",
          "panel": "B",
          "means": "Battery power is low — steam-driven cooling will soon fail.",
          "response": "Before the batteries die: depressurize (ADS / manual relief) and line up low-pressure injection (LPCI / core spray)."
        }
      ],
      "failures": [
        {
          "id": "rcic_failure",
          "display": "RCIC Failure",
          "category": "safety_system",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "hpci_failure",
          "display": "HPCI Failure",
          "category": "safety_system",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "ic_failure",
          "display": "Isolation Condenser Failure (valves shut)",
          "category": "safety_system",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "station_blackout",
          "display": "Station Blackout",
          "category": "power",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "loss_of_feedwater",
          "display": "Loss of Feedwater",
          "category": "coolant",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "turbine_trip",
          "display": "Turbine Trip",
          "category": "power",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "failure_to_scram",
          "display": "Failure to Scram (ATWS)",
          "category": "safety_system",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "ads_failure",
          "display": "ADS Failure (won’t open)",
          "category": "safety_system",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "lpci_failure",
          "display": "LPCI Failure",
          "category": "safety_system",
          "type": "command_override",
          "severity_meta": null
        },
        {
          "id": "recirc_pump_trip",
          "display": "Recirculation Pump Trip",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "loss_of_condenser_vacuum",
          "display": "Loss of Condenser Vacuum",
          "category": "power",
          "type": "physics_parameter",
          "severity_meta": null
        },
        {
          "id": "srv_stuck_open",
          "display": "Safety/Relief Valve Stuck Open",
          "category": "coolant",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Break Size",
            "unit": "% effective area",
            "min": 0,
            "max": 100,
            "default": 30
          }
        },
        {
          "id": "early_battery_failure",
          "display": "Early Battery Depletion",
          "category": "power",
          "type": "physics_parameter",
          "severity_meta": {
            "label": "Battery Life",
            "unit": "% of 8 h",
            "min": 100,
            "max": 25,
            "default": 60,
            "invert": true
          }
        },
        {
          "id": "vessel_level_sensor_failure",
          "display": "Vessel Level Sensor Stuck",
          "category": "instrument",
          "type": "instrument",
          "severity_meta": null
        },
        {
          "id": "msiv_closure",
          "display": "MSIV Closure",
          "category": "power",
          "type": "command_override",
          "severity_meta": null
        }
      ],
      "glossary": [
        {
          "acronym": "AC / DC",
          "term": "Alternating-current / direct-current electrical power."
        },
        {
          "acronym": "SUR",
          "term": "Startup Rate — how fast power is changing, in decades (factors of ten) per minute (DPM)."
        },
        {
          "acronym": "DPM",
          "term": "Decades Per Minute — the unit of startup rate (one decade = a factor of ten)."
        },
        {
          "acronym": "MWe / MWt",
          "term": "Megawatts electric (grid output) / megawatts thermal (reactor heat)."
        },
        {
          "acronym": "Reactor period",
          "term": "The time for power to change by a factor of e (~2.72); long period = slow change."
        },
        {
          "acronym": "SCRAM",
          "term": "A rapid full insertion of the control rods — emergency shutdown."
        },
        {
          "acronym": "Shutdown bank",
          "term": "The scram rods (the RBMK’s AZ / Emergency Protection group), normally parked fully withdrawn. Operable — hold Insert to add shutdown margin, Withdraw to park it back out — but a SCRAM always drives it fully in and overrides you."
        },
        {
          "acronym": "Decay heat",
          "term": "Heat from radioactive decay that continues after shutdown (~7% of rated, decaying)."
        },
        {
          "acronym": "Xenon",
          "term": "Xenon-135, a neutron-absorbing fission product that builds in after a power drop."
        },
        {
          "acronym": "Reactivity",
          "term": "The tendency of the chain reaction to grow (+) or shrink (−); critical = steady."
        },
        {
          "acronym": "AUTO / MAN",
          "term": "Automatic / manual control of a plant control channel (Tools → Automate). AUTO reads the instruments and issues commands to hold a setpoint; MAN leaves the control to you."
        },
        {
          "acronym": "Setpoint (SP)",
          "term": "The value an automatic controller holds its parameter at. Automate channels capture the current reading when engaged; edit it to maneuver on automatic."
        },
        {
          "acronym": "BWR",
          "term": "Boiling Water Reactor."
        },
        {
          "acronym": "RCIC",
          "term": "Reactor Core Isolation Cooling (steam-driven, no AC)."
        },
        {
          "acronym": "IC",
          "term": "Isolation Condenser — passive heat sink (condenses steam, returns condensate; no AC). Fukushima Unit 1."
        },
        {
          "acronym": "HPCI",
          "term": "High-Pressure Coolant Injection (steam-driven, no AC)."
        },
        {
          "acronym": "ADS",
          "term": "Automatic Depressurization System."
        },
        {
          "acronym": "LPCI",
          "term": "Low-Pressure Coolant Injection."
        },
        {
          "acronym": "LPCS",
          "term": "Low-Pressure Core Spray."
        },
        {
          "acronym": "SLC",
          "term": "Standby Liquid Control (boron; failure-to-scram backup)."
        },
        {
          "acronym": "SRV",
          "term": "Safety/Relief Valve."
        },
        {
          "acronym": "MSIV",
          "term": "Main Steam Isolation Valve."
        },
        {
          "acronym": "Recirc",
          "term": "Recirculation flow — the main BWR power control."
        }
      ],
      "normal_values": {
        "full_power": {
          "label": "100% power, all systems normal.",
          "settled_s": 60,
          "true_state": {
            "power_pct": 100,
            "fuel_temp_c": 586.032,
            "core_void_fraction": 0.45,
            "vessel_pressure_mpa": 7.03,
            "vessel_level_pct": 50,
            "steam_flow_normalized": 1,
            "fw_flow_normalized": 1,
            "recirc_flow_pct": 100,
            "decay_heat_pct": 7,
            "xenon_pct_eq": 100,
            "rcic_running": false,
            "hpci_running": false,
            "ads_open": false,
            "lpci_running": false,
            "lpcs_running": false,
            "srv_manual_open": false,
            "ic_active": false,
            "ic_condensing": false,
            "station_blackout": false,
            "battery_charge_pct": 100,
            "slc_active": false,
            "slc_tank_pct": 100,
            "scrammed": false,
            "melted": false,
            "destruction_cause": "none",
            "reactivity_pcm": 0,
            "startup_rate_dpm": 4.02e-28,
            "reactor_period_s": null,
            "mwe_output": 1100,
            "turbine_rpm": 1800,
            "condenser_vacuum_kpa": 96.5,
            "turbine_tripped": false,
            "load_mode": "follow",
            "load_target_mwe": 1100,
            "load_imbalance_mwe": 2.27e-13,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 100.029,
            "vessel_pressure": 7.022,
            "vessel_level": 49.549,
            "recirc_flow": 99.667,
            "steam_flow": 0.993,
            "fw_flow": 0.989,
            "core_void_fraction": 0.455,
            "turbine_rpm": 1802.199,
            "condenser_vacuum": 96.487,
            "mwe_output": 1099.181,
            "rcic_status": false,
            "rps_scrammed": false,
            "station_blackout": false,
            "battery_pct": 100,
            "ads_open": false,
            "hpci_unavailable": false
          }
        },
        "50_percent": {
          "label": "Stable partial power for maneuvering practice.",
          "settled_s": 60,
          "true_state": {
            "power_pct": 49.645,
            "fuel_temp_c": 434.54,
            "core_void_fraction": 0.47,
            "vessel_pressure_mpa": 6.969,
            "vessel_level_pct": 50,
            "steam_flow_normalized": 0.497,
            "fw_flow_normalized": 0.497,
            "recirc_flow_pct": 47.5,
            "decay_heat_pct": 3.499,
            "xenon_pct_eq": 99.938,
            "rcic_running": false,
            "hpci_running": false,
            "ads_open": false,
            "lpci_running": false,
            "lpcs_running": false,
            "srv_manual_open": false,
            "ic_active": false,
            "ic_condensing": false,
            "station_blackout": false,
            "battery_charge_pct": 100,
            "slc_active": false,
            "slc_tank_pct": 100,
            "scrammed": false,
            "melted": false,
            "destruction_cause": "none",
            "reactivity_pcm": -0.201,
            "startup_rate_dpm": 0.000135,
            "reactor_period_s": 192916.581,
            "mwe_output": 547.035,
            "turbine_rpm": 1800,
            "condenser_vacuum_kpa": 96.5,
            "turbine_tripped": false,
            "load_mode": "follow",
            "load_target_mwe": 547.035,
            "load_imbalance_mwe": -0.942,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 49.674,
            "vessel_pressure": 6.962,
            "vessel_level": 49.549,
            "recirc_flow": 47.167,
            "steam_flow": 0.491,
            "fw_flow": 0.486,
            "core_void_fraction": 0.475,
            "turbine_rpm": 1802.199,
            "condenser_vacuum": 96.487,
            "mwe_output": 546.227,
            "rcic_status": false,
            "rps_scrammed": false,
            "station_blackout": false,
            "battery_pct": 100,
            "ads_open": false,
            "hpci_unavailable": false
          }
        },
        "hot_startup": {
          "label": "Hot Standby: subcritical, low power, flow established — the approach-to-criticality start.",
          "settled_s": 5,
          "true_state": {
            "power_pct": 0.00107,
            "fuel_temp_c": 290.651,
            "core_void_fraction": 0.000319,
            "vessel_pressure_mpa": 6.983,
            "vessel_level_pct": 50,
            "steam_flow_normalized": 0.018,
            "fw_flow_normalized": 0.018,
            "recirc_flow_pct": 100,
            "decay_heat_pct": 0.489,
            "xenon_pct_eq": 99.99,
            "rcic_running": false,
            "hpci_running": false,
            "ads_open": false,
            "lpci_running": false,
            "lpcs_running": false,
            "srv_manual_open": false,
            "ic_active": false,
            "ic_condensing": false,
            "station_blackout": false,
            "battery_charge_pct": 100,
            "slc_active": false,
            "slc_tank_pct": 100,
            "scrammed": false,
            "melted": false,
            "destruction_cause": "none",
            "reactivity_pcm": -1855.044,
            "startup_rate_dpm": 0.165,
            "reactor_period_s": 158.053,
            "mwe_output": 19.688,
            "turbine_rpm": 1800,
            "condenser_vacuum_kpa": 96.5,
            "turbine_tripped": false,
            "load_mode": "follow",
            "load_target_mwe": 19.688,
            "load_imbalance_mwe": -19.676,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 0.299,
            "vessel_pressure": 6.994,
            "vessel_level": 50.121,
            "recirc_flow": 98.761,
            "steam_flow": 0.016,
            "fw_flow": 0.018,
            "core_void_fraction": 0.00449,
            "turbine_rpm": 1802.791,
            "condenser_vacuum": 96.083,
            "mwe_output": 20.333,
            "rcic_status": false,
            "rps_scrammed": false,
            "station_blackout": false,
            "battery_pct": 100,
            "ads_open": false,
            "hpci_unavailable": false
          }
        },
        "post_scram_sbo": {
          "label": "The Fukushima start: scrammed with a station blackout, RCIC just started.",
          "settled_s": 5,
          "true_state": {
            "power_pct": 0.000186,
            "fuel_temp_c": 302.538,
            "core_void_fraction": 0,
            "vessel_pressure_mpa": 7.195,
            "vessel_level_pct": 50,
            "steam_flow_normalized": 0,
            "fw_flow_normalized": 0,
            "recirc_flow_pct": 0.041,
            "decay_heat_pct": 6.987,
            "xenon_pct_eq": 100.009,
            "rcic_running": true,
            "hpci_running": false,
            "ads_open": false,
            "lpci_running": false,
            "lpcs_running": false,
            "srv_manual_open": false,
            "ic_active": false,
            "ic_condensing": false,
            "station_blackout": true,
            "battery_charge_pct": 99.983,
            "slc_active": false,
            "slc_tank_pct": 100,
            "scrammed": true,
            "melted": false,
            "destruction_cause": "none",
            "reactivity_pcm": -10456.869,
            "startup_rate_dpm": 0.575,
            "reactor_period_s": 45.341,
            "mwe_output": 0,
            "turbine_rpm": 0,
            "condenser_vacuum_kpa": 16.9,
            "turbine_tripped": true,
            "load_mode": "disconnected",
            "load_target_mwe": 0,
            "load_imbalance_mwe": 0.00205,
            "sg_imbalance_active": false
          },
          "instruments": {
            "power_range": 0.298,
            "vessel_pressure": 7.185,
            "vessel_level": 50.121,
            "recirc_flow": 0,
            "steam_flow": 0,
            "fw_flow": 0.0000966,
            "core_void_fraction": 0.00365,
            "turbine_rpm": 2.791,
            "condenser_vacuum": 16.483,
            "mwe_output": 0.423,
            "rcic_status": true,
            "rps_scrammed": true,
            "station_blackout": true,
            "battery_pct": 99.983,
            "ads_open": false,
            "hpci_unavailable": false
          }
        }
      }
    }
  };
})(globalThis.RD || (globalThis.RD = {}));
