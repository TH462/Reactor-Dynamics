/* comp_pump.js — centrifugal pump (RCP-style casing + impeller), ported from
 * inbox/design_import/Pump.dc.html per ui/diagram/board/PORTING_CONTRACT.md.
 *
 * update({ running, speed, temp }) — running + speed (0..1) drive the impeller
 * spin (2.8 s slow -> 0.35 s fast, stopped below 2%); temp (deg C) drives the
 * fluid disc color via StdPipe.phaseTempColor. Suction/discharge angles are
 * fixed from cfg — the design's pointer-drag nozzle rotation (hit lines, grab
 * rings, snap ticks) is stripped. The control box (cfg.showControls) renders an
 * ON/OFF toggle or a speed slider per cfg.control; interactions only emit
 * env.onControl('toggle'|'speed', v) — rendered state comes from update().
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Pump'] = { build: build };

  var MONO = "'IBM Plex Mono',monospace";

  function ensureStyles() {
    if (document.getElementById('bd-pump-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-pump-styles';
    s.textContent = '@keyframes rcpSpin{to{transform:rotate(360deg)}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  function toArr(hx) {
    return [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)];
  }
  function angleToDir(a) {
    a = ((a % 360) + 360) % 360;
    return (a < 45 || a >= 315) ? 'right' : a < 135 ? 'down' : a < 225 ? 'left' : 'up';
  }

  var COOL = [44, 88, 152], HOT = [176, 56, 34];
  var FLUID_HEAT = { coldLeg: 0.05, coolWater: 0.14, condensate: 0.07, hotLeg: 0.9 };

  function build(cfg, env) {
    ensureStyles();
    var h = env.h;
    var K = env.StdPipe.createKit(h);

    var cx = 150, cy = 135, R = 50, fluidR = 38;
    var fluid = cfg.fluid || 'coldLeg';
    var portSize = (cfg.psize && cfg.psize !== 'auto') ? cfg.psize
      : ((fluid === 'coldLeg' || fluid === 'hotLeg') ? 'large' : 'medium');
    var suctionAngle = cfg.suctionAngle == null ? 180 : cfg.suctionAngle;
    var dischargeAngle = cfg.dischargeAngle == null ? 270 : cfg.dischargeAngle;
    var suctionShift = cfg.suctionShift || 0;  // lateral offset of the suction nozzle along the casing
    var showControls = !!cfg.showControls;
    var ctrlMode = cfg.control || 'slider';
    var pumpName = (cfg.name && String(cfg.name).trim()) ? String(cfg.name).trim() : 'RCP SPEED';

    // fluid disc color: global temperature ramp when a temp is supplied, else the
    // design's fluid-preset fallback (power term fixed at 100% — no power prop here)
    function fluidColors(tempC) {
      if (tempC != null && env.StdPipe.phaseTempColor) {
        var base = toArr(env.StdPipe.phaseTempColor('water', tempC).bore);
        return { dark: mix(base, [8, 14, 20], 0.12), light: mix(base, [255, 255, 255], 0.22) };
      }
      var heatBase = FLUID_HEAT[fluid] != null ? FLUID_HEAT[fluid] : 0.05;
      var heatFrac = Math.min(1, heatBase + 0.12);
      return { dark: mix(COOL, HOT, heatFrac), light: mix(COOL, HOT, Math.min(1, heatFrac + 0.1)) };
    }
    var c0 = fluidColors(null);

    // per-instance def ids (url(#id) resolves document-wide)
    var gid = env.uid('rcp');
    var STEEL = gid + 'Steel', FLUIDG = gid + 'Fluid', METAL = gid + 'Metal';
    var stopLight = h('stop', { key: 0, offset: '0', stopColor: c0.light });
    var stopDark = h('stop', { key: 1, offset: '1', stopColor: c0.dark });
    var defs = h('defs', { key: 'defs' }, [
      h('linearGradient', { key: 'steel', id: STEEL, x1: '0', y1: '0', x2: '0', y2: '1' }, [
        h('stop', { key: 0, offset: '0', stopColor: '#3a4c58' }), h('stop', { key: 1, offset: '1', stopColor: '#0c141c' })]),
      h('radialGradient', { key: 'fluid', id: FLUIDG, cx: '0.38', cy: '0.32', r: '0.75' }, [stopLight, stopDark]),
      h('linearGradient', { key: 'metal', id: METAL, x1: '0', y1: '0', x2: '1', y2: '0' }, [
        h('stop', { key: 0, offset: '0', stopColor: '#1c232a' }), h('stop', { key: 1, offset: '0.5', stopColor: '#7a8994' }), h('stop', { key: 2, offset: '1', stopColor: '#1c232a' })]),
      /* the feGaussianBlur that stood here was DEAD — declared, never referenced by any
       * element in this file, and shipping since the port. Removed with the board's other
       * blurs in #613 wave 4. */
    ]);

    // standard flange at a port face, drawn at constant canvas px (scaled about the port)
    var flD = (K.SIZES && K.SIZES[portSize]) || 12;
    var sc = 1;
    function flTransform(fx, fy) {
      return 'translate(' + fx + ' ' + fy + ') scale(' + (1 / sc).toFixed(4) +
        ') translate(' + (-fx) + ' ' + (-fy) + ')';
    }
    var inFlG = h('g', { key: 'rcpInFl', transform: flTransform(cx - R - 14, cy) }, K.flange({ key: 'f', x: cx - R - 14, y: cy, angle: 0, d: flD }));
    var outFlG = h('g', { key: 'rcpOutFl', transform: flTransform(cx, cy - R - 24) }, K.flange({ key: 'f', x: cx, y: cy - R - 24, angle: 90, d: flD }));

    var portIn, portOut;   // set data-active off the running state so downstream pipes stop when off
    var inletG = h('g', { key: 'inlet', transform: 'rotate(' + (suctionAngle - 180) + ' ' + cx + ' ' + cy + ') translate(0 ' + (-suctionShift) + ')' }, [
      h('circle', { key: 'pmIn', ref: function (el) { portIn = el; }, cx: cx - R - 14, cy: cy, r: 0.75, fill: 'none', 'data-port': 'suction', 'data-fluid': fluid, 'data-dir': angleToDir(suctionAngle), 'data-size': portSize, 'data-out': '0', 'data-active': '1' }),
      h('rect', { key: 'rcpInNoz', x: cx - R - 14, y: cy - 12, width: 22, height: 24, rx: 4, fill: 'url(#' + STEEL + ')', stroke: '#223543', strokeWidth: 1.2 }),
      inFlG
    ]);

    var outletG = h('g', { key: 'outlet', transform: 'rotate(' + (dischargeAngle - 270) + ' ' + cx + ' ' + cy + ')' }, [
      h('rect', { key: 'rcpOutNoz', x: cx - 15, y: cy - R - 24, width: 30, height: 36, rx: 4, fill: 'url(#' + STEEL + ')', stroke: '#223543', strokeWidth: 1.2 }),
      h('circle', { key: 'pmOut', ref: function (el) { portOut = el; }, cx: cx, cy: cy - R - 24, r: 0.75, fill: 'none', 'data-port': 'discharge', 'data-fluid': fluid, 'data-dir': angleToDir(dischargeAngle), 'data-size': portSize, 'data-out': '1', 'data-active': '1' }),
      outFlG
    ]);

    var casing = h('circle', { key: 'rcpCasing', cx: cx, cy: cy, r: R, fill: 'url(#' + STEEL + ')', stroke: '#46596a', strokeWidth: 2.4 });
    var fluidC = h('circle', { key: 'rcpFluid', cx: cx, cy: cy, r: fluidR, fill: 'url(#' + FLUIDG + ')', stroke: '#0c141c', strokeWidth: 1 });

    var vanes = [];
    for (var i = 0; i < 6; i++) {
      vanes.push(h('rect', { key: 'vane' + i, x: cx - 3, y: cy - fluidR + 6, width: 6, height: fluidR - 16, rx: 2.5, fill: 'url(#' + METAL + ')', stroke: '#141a20', strokeWidth: 0.6, transform: 'rotate(' + (i * 60) + ' ' + cx + ' ' + cy + ')' }));
    }
    vanes.push(h('circle', { key: 'hub', cx: cx, cy: cy, r: 12, fill: '#3a4550', stroke: '#141a20', strokeWidth: 1.2 }));
    var impellerG = h('g', { key: 'impeller', style: { transformBox: 'fill-box', transformOrigin: 'center' } }, vanes);

    // ---- control box (rendered state comes only from update() props) ----
    var tglRect = null, tglText = null, sliderInput = null, valText = null;
    var ctrl = [];
    if (showControls) {
      ctrl.push(h('rect', { key: 'boxBg', x: cx - 52, y: cy + R - 4, width: 104, height: 58, rx: 7, fill: '#0e1620', stroke: '#25333e', strokeWidth: 1.4 }));
      ctrl.push(h('text', { key: 'boxLbl', x: cx, y: cy + R + 14, textAnchor: 'middle', fill: '#9fb3c4', fontSize: ctrlMode === 'toggle' ? 16 : 12, fontWeight: 600, fontFamily: MONO, letterSpacing: '0.1em' }, pumpName));
      if (ctrlMode === 'toggle') {
        var tbw = 88, tbh = 30, tbx = cx - tbw / 2, tby = cy + R + 19;
        tglRect = h('rect', { key: 'tglBtn', x: tbx, y: tby, width: tbw, height: tbh, rx: 6, fill: '#101a24', stroke: '#26333e', strokeWidth: 1, style: { cursor: 'pointer', pointerEvents: 'auto' },
          onClick: function () { env.onControl('toggle', !lastOn); } });
        tglText = h('text', { key: 'tglTxt', x: cx, y: tby + tbh / 2 + 6, textAnchor: 'middle', fill: '#647c8d', fontSize: 18, fontWeight: 600, fontFamily: MONO, letterSpacing: '0.1em', style: { pointerEvents: 'none' } }, 'OFF');
        ctrl.push(tglRect, tglText);
      } else {
        sliderInput = h('input', { type: 'range', min: 0, max: 100, step: 1, value: 0,
          onInput: function (e) { env.onControl('speed', +e.target.value); },
          style: { width: '100%', height: '22px', margin: 0, accentColor: '#4fe3ff', cursor: 'pointer', pointerEvents: 'auto' } });
        ctrl.push(h('foreignObject', { key: 'boxSlider', x: cx - 40, y: cy + R + 22, width: 80, height: 22 }, sliderInput));
        valText = h('text', { key: 'boxVal', x: cx, y: cy + R + 52, textAnchor: 'middle', fill: '#4fe3ff', fontSize: 14, fontWeight: 600, fontFamily: MONO }, '0%');
        ctrl.push(valText);
      }
    }

    // crop the empty left/top margins; a touch more room below when the control panel shows
    var vb = showControls ? '70 55 160 184' : '70 55 160 154';
    var svg = h('svg', { viewBox: vb, style: { width: '100%', height: '100%', overflow: 'visible' } },
      h('g', { key: 'rcpScene' }, [defs, inletG, outletG, casing, fluidC, impellerG, ctrl]));

    var unwatch = env.StdPipe.watchScale(svg, function (s) {
      if (Math.abs(s - sc) / s > 0.015) {
        sc = s;
        inFlG.setAttribute('transform', flTransform(cx - R - 14, cy));
        outFlG.setAttribute('transform', flTransform(cx, cy - R - 24));
      }
    });

    var lastOn = null;        // rendered ON state (spd > 2), toggle click emits its inverse.
                              // null (not false) so the FIRST update always writes the port
                              // data-active gates — ports are authored '1', and a pump that
                              // starts OFF must stop its pipes on render one (#236).
    var lastSpd = null;       // last applied display speed (0..100)
    var lastAnim = null;
    var lastTemp = void 0;

    function update(props) {
      props = props || {};
      var running = !!props.running;
      var s01 = props.speed == null ? 1 : Math.max(0, Math.min(1, props.speed));
      var spd = running ? s01 * 100 : 0;

      if (spd !== lastSpd) {
        lastSpd = spd;
        var spinDur = spd < 2 ? 0 : Math.max(0.35, 2.8 - (spd / 100) * 2.45);
        var anim = spinDur > 0 ? 'rcpSpin ' + spinDur.toFixed(2) + 's linear infinite' : '';
        if (anim !== lastAnim) { lastAnim = anim; impellerG.style.animation = anim; }
        var on = spd > 2;
        if (on !== lastOn) {
          lastOn = on;
          // gate the connected pipes: no pump flow → no downstream flow animation
          var act = on ? '1' : '0';
          if (portIn) portIn.setAttribute('data-active', act);
          if (portOut) portOut.setAttribute('data-active', act);
          if (tglRect) {
            tglRect.setAttribute('fill', on ? '#0c3a26' : '#101a24');
            tglRect.setAttribute('stroke', on ? '#43d17a' : '#26333e');
            tglRect.setAttribute('stroke-width', on ? '1.6' : '1');
            tglText.setAttribute('fill', on ? '#7cf0b4' : '#647c8d');
            tglText.textContent = on ? 'ON' : 'OFF';
          }
        }
        if (sliderInput) {
          sliderInput.value = Math.round(spd);
          valText.textContent = spd.toFixed(0) + '%';
        }
      }

      var temp = props.temp;
      if (temp !== lastTemp) {
        lastTemp = temp;
        var c = fluidColors(temp);
        stopLight.setAttribute('stop-color', c.light);
        stopDark.setAttribute('stop-color', c.dark);
      }
    }

    function destroy() {
      if (unwatch) { unwatch(); unwatch = null; }
    }

    var root = h('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, svg);
    return { el: root, update: update, destroy: destroy };
  }
})();
