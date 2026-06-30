/*
 * bwr_safety_systems.js — the steam-driven safety systems and their limits, the
 * heart of Fukushima (M3 §9): RCIC, HPCI, ADS, LPCI, and the station-blackout
 * battery timer. Pure functions over engine state `s` and config `cfg`, called as
 * §5 step 9 (after vessel pressure, before vessel level — so the injection flows
 * feed the level balance and the steam draw / depressurization adjust pressure).
 *
 * The engine never DECIDES to start these (HR2) — auto-start is M4 actuation data
 * (§13); the flagship test emulates it. This module computes their physical
 * EFFECTS while running, and the physical limits that stop them (steam-pressure
 * cutoff, battery depletion).
 *
 * Attaches RD.bwrSafety.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  function stepSafety(s, cfg, dt) {
    var sf = cfg.safety;

    // §9.5 — station blackout battery timer (a fixed-duration grace window, the
    // v1 simplification). early_battery_failure scales the duration. Depletion
    // stops the DC-powered steam-driven injection (RCIC/HPCI).
    if (s.station_blackout) {
      s.sbo_elapsed += dt;
      var eff_hours = sf.battery_duration_hours * (s._fail.battery.active ? s._fail.battery.duration_factor : 1.0);
      s.battery_charge_pct = clip(100.0 * (1.0 - s.sbo_elapsed / (eff_hours * 3600.0)), 0, 100);
      if (s.battery_charge_pct <= 0.0) { s.rcic_running = false; s.hpci_running = false; }
    }

    // §9.1 RCIC — steam-driven, no AC. Injects while reactor steam pressure is
    // high enough to drive the turbine; consumes steam (lowers pressure).
    s.rcic_flow = 0.0;
    if (s.rcic_running && s.vessel_pressure_mpa > sf.rcic_min_pressure) {
      s.rcic_flow = sf.rcic_flow_normalized;
      s.vessel_pressure_mpa = Math.max(cfg.vessel.P_ambient,
        s.vessel_pressure_mpa - sf.rcic_steam_consumption * sf.pressure_sensitivity * dt);
    }

    // §9.2 HPCI — higher-capacity steam-driven injection, same no-AC property.
    s.hpci_flow = 0.0;
    if (s.hpci_running && s.vessel_pressure_mpa > sf.hpci_min_pressure) {
      s.hpci_flow = sf.hpci_flow_normalized;
      s.vessel_pressure_mpa = Math.max(cfg.vessel.P_ambient,
        s.vessel_pressure_mpa - sf.rcic_steam_consumption * sf.pressure_sensitivity * dt);
    }

    // §9.3 ADS — rapid depressurization (the decision point's enabler). Opens the
    // door to low-pressure injection.
    if (s.ads_open) {
      var dP = -(s.vessel_pressure_mpa - cfg.vessel.P_ambient) / sf.ads_depressurization_tau;
      s.vessel_pressure_mpa = Math.max(cfg.vessel.P_ambient, s.vessel_pressure_mpa + dP * dt);
    }

    // D6 — manual SRV(s): operator-opened controlled depressurization (slower than
    // ADS) when HPCI/ADS are unavailable and the vessel must be brought down to the
    // low-pressure-injection window.
    if (s.srv_manual_open) {
      var dPs = -(s.vessel_pressure_mpa - cfg.vessel.P_ambient) / sf.srv_manual_tau;
      s.vessel_pressure_mpa = Math.max(cfg.vessel.P_ambient, s.vessel_pressure_mpa + dPs * dt);
    }

    // §9.4 LPCI — low-pressure injection (works only after depressurization).
    s.lpci_flow = 0.0;
    if (s.lpci_running && s.vessel_pressure_mpa < sf.lpci_threshold_pressure) {
      s.lpci_flow = sf.lpci_flow_normalized;
    }
    // D4 — Core Spray (LPCS): low-pressure spray onto the fuel; same pressure
    // window as LPCI, sprays from above rather than flooding from below.
    s.lpcs_flow = 0.0;
    if (s.lpcs_running && s.vessel_pressure_mpa < sf.lpci_threshold_pressure) {
      s.lpcs_flow = sf.lpcs_flow_normalized;
    }
  }

  // §11 actuation-gate reading: HPCI not running and either failed or unable to
  // run (pressure below its steam-drive cutoff). M4 gates ADS on this.
  function hpciUnavailable(s, cfg) {
    return !s.hpci_running && (s.hpci_failed || s.vessel_pressure_mpa < cfg.safety.hpci_min_pressure);
  }

  RD.bwrSafety = { stepSafety: stepSafety, hpciUnavailable: hpciUnavailable };

})(globalThis.RD || (globalThis.RD = {}));
