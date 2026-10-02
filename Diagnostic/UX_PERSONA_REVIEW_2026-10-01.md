# UX persona review — 2026-10-01

> **Record, not policy.** Five fresh-context reviewers played the site in headless Edge
> (1600×1000, plus 1366×768 / 1280×720 / 390 px checks) on `develop` at `9decff76`, with no
> repo access and no `&dev=1` hook. The five were a casual gamer, a game developer/UX lead, a
> 68-year-old technophobe, a licensed Westinghouse operator and an AP Physics teacher. Two
> verifiers then re-measured ~45 claims on the same tree. Refuted claims are listed as refuted.
> The five then saw the compiled proposals and each wrote a rebuttal. Raw reports, screenshots
> and the full verdict tables are in a session scratchpad and are not kept.

## 1. Verified defects (each re-measured)

| # | Finding | Measured | Verdict |
|---|---|---|---|
| D1 | Closing the Main Menu wipes a walkthrough save | Save `{pwr_heatup, step 0}` → ✕ → 15 s → reload: walkthrough null, menu "Continue — Free Play, Mode 1". `closeModal` boots the default plant (app.js:8801) and the 30 s/pagehide autosave overwrites the only slot (app.js:11633-11665). Breaks 1.8.1's "a walkthrough resumes at the step you left" (changelog.html:174) | confirmed |
| D2 | Manual ch01 full-power subcooling "≈ 73.8 °F (41 °C)" (Manuals/01:30) | Board 44 °F; saturation at 2235 psi ≈ 652.6 °F minus ch01's own hot leg 609.8 °F = 42.8 °F (23.8 °C). The 73.8 is the retired engine's Tavg basis | confirmed — stale number |
| D3 | Manual says read "T-ref on the rod-control card" (Manuals/03:1069, :1074) | No Tref readout exists anywhere; `trefProgram` only centres the Tavg band. 100 → 80 MWe, rods untouched: power 93.3–93.6 %, Tavg 583.9 °F vs Tref 573.5 °F (+10.4 °F), dump 45–53 % for 20 min. §14.3's "81.8 %, 17 °F above program" also wrong against this | confirmed — manual stale twice |
| D4 | Manual ch09:166: tripped reactor + Tavg < 552.2 °F → MFW isolation + AFW start | Indicated Tavg 550.6 °F at 4 min: MFW not isolated, AFW off. PWR2 empties the control-layer actuations (pwr2_shell.js:1486); its own isolation fires only on SG hi-hi or SI | confirmed — plant/manual disagree, no declared departure. **Plant question, owner ruling** |
| D5 | Continue hidden inside a pane with no visible scrollbar | 1600×1000: hidden on step 9, partial on 3 and 16 of 17 heatup steps; 1366×768: hidden on 3 and 9. Scrollbar width 0, no fade | confirmed, narrowed (pane, not window) |
| D6 | Cooldown Rate High alarm fires on every normal trip | 600 s filtered derivative (pwr_config.js:2758): trip 580 → 554 °F in 33 s, then −134 °F/hr at 3m33 with Tavg flat; above −100 °F/hr until ~6.5 min | confirmed |
| D7 | Cleared alarms vanish unacknowledged | States are clear / active-unacked / active-acked only (control_kernel.js:1072-1130); cards print raw category `safety_system · critical` | confirmed |
| D8 | Stuck-open PORV injected at power does nothing visible | Latches on first lift (pwr2_pressurizer.js:1139-1141); UI shows only the red Clear button; 13 plant-min at 2236 psi, PORV CLOSED | confirmed — no "armed" cue |
| D9 | Injected casualties get no coach and no outcome | Large LOCA 100 %: Core Uncovered 87.9 % in Indications only; none of 18 alarms names the core; Instructor shows the generic intro at 0:26, 1:17, 7:09. LOMF: no alarm names feedwater | confirmed |
| D10 | Blocked rod command reported only as scanner "⚠ Command error … [sourced, Ginna TS Bases B 3.3.1 ML20339A221]" | generic error path (app.js:8870), not the ⛔ interlock path (:8858) | confirmed |
| D11 | Help/site copy describe a different screen | About "opens with a quick tour" (about.html:86); Help "Walkthroughs (first tab)" (shell.html:628); Help "Use − to minimize" (no control exists); Esc does not close Settings (app.js:10476-10486); chart hint "Physics tab" (shell.html:44, merged #439); ch02 IC list ≠ Free Play both ways; About "Coming next" lists shipped walkthroughs (about.html:132); physics.html:76 "steam tables" vs Manuals/12:34 "Correlations, not steam tables" (manual right) | confirmed |
| D12 | Developer text in the in-app manual | Manuals/README.md:19, :24 (`Blueprint/`, `ui/manual_procedures.js`, `tools/pack_manuals.js`, "#524"), ch02 §2.2 `npx serve`, ch03 §14.3 owner-directive quote and issue numbers | confirmed |
| D13 | Step text contradicts the board | "TRIP is a lamp to read here, not a button" (manual_procedures.js:1643) — it trips the turbine (wiring:798); step 17 "Above 10 % power" vs P-10 8 % (#753); SP1 step 2 "under about 25 psi" note is unconditional (:1531); SP1 step 11 says PZR level rises — it peaks 45.7 % at 295 °F then falls to the 25 % program floor (overshoot declared, Manuals/12 §12.23, #706; text just omits the fall) | confirmed |
| D14 | Small items | Tour title "TRENDS &AMP; REWIND" (app.js:10909); clock runs during the tour; banner shifts the side panel +48 px for 6 s (app.js:6692); restart confirm expires silently at 6.06 s and the button grows 56 → 388 px; ACCUMULATORS prints "psig" for an absolute value (wiring:1706); CSV headers unitless, `tavg` in °C; 1/M points are single instantaneous counts (instructor_layer.js:297); 1280×720 board labels ~6–7 px, side panel 39 % | confirmed |

**Refuted:** clicking the confirm chip's body is a no-op (it works); tour counter skips 4 → 6; OPΔT tile ≠ Indications (same value at the same moment — label just omits "margin"); TMI absent from Main Menu (dev channel lists it; public gating deliberate per flags.js:199).
**Designed / ruled:** tick latching (#244 item 8, #683); LOCA 100 % = 3.1 in² (#580 ruling — the NAME is unruled); AFW holds off until 33 % SG level (sourced, WTSM 19.0); RCP flow 3 % pumps off = natural circulation (#325); dev chip / TEST BUILD badge / disabled report form are not on production (badge does show on the develop tester site).
**"About 5 minutes" opener:** typical route 4.4 wall-min / 9.2 plant-min (`run_opener.js -v`) — true only for a fast reader.

## 2. Rebuttal outcome — where the five disagreed

| Proposal | Split | Resolution |
|---|---|---|
| Latching SLOW rod withdraw (93 s mouse-hold on SP2 step 10) | gamer, retiree, teacher FOR; operator AGAINST ("the continuous-rod-withdrawal accident built into the controls"); game dev prefers a "drive to step N" box | keep rods momentary; fix the 93 s some other way — **owner ruling** |
| "Expected" alarms styled differently | gamer, game dev FOR; operator AGAINST (teaches ignoring alarms); teacher: keep red, add a "predicted by step N" tag | teacher's compromise — alarm unchanged, a tag that drops off when the step ends |
| Live "CORE COOLING DEGRADED" banner | all want a coach; operator rejects a live verdict; game dev rejects a second status layer; retiree wants calm wording | Instructor debrief lines + one dismissible toast, instrument-driven, naming parameters to watch; also says when indications recover ("plant stabilised") |
| Gentle track that skips 1/M | gamer FOR; operator, teacher, game dev AGAINST (best lab on the site; doubles upkeep) | keep 1/M; plain numbers instead of e-notation in the Learning register |
| Tref on the rod card | operator #1; gamer/retiree "Industry only"; game dev "deviation only" | signed deviation on the rod card + Tref on the trend list |
| Alarms stay until acknowledged | operator #2; gamer/retiree "Industry only"; game dev "greyed slow pulse, not flashing" | Industry register: greyed cleared-unacked row; Learning unchanged |
| "Steam dump open at power" caution | operator FOR; game dev AGAINST (dump % already shows it) | drop — fails the clutter veto (Q4) |
| Lessons wait for Next | retiree, teacher FOR; gamer, game dev want auto-advance | Next-gated in lessons with an auto-advance toggle; never in casualty runs |
