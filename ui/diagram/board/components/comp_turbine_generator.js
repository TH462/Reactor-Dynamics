/* comp_turbine_generator.js — ported from inbox/design_import/Turbine and Generator.dc.html
 *
 * Machine SVG only: the STEAM FLOW slider / TRIP / RESET control card was not ported
 * (board uses showControls:false). update({ flowFrac }) replaces the design's local
 * tcv state: 0..1 drives the blade/winding scroll speed (1.8s..0.2s; stopped <= 0.02).
 * NOTE: the source has no flanges and no StdPipe usage in the machine (its kit handle
 * was created but never used), and defines no tcv-drain port — only steam-in and
 * exhaust-out port markers exist.
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['Turbine and Generator'] = { build: build };

  function ensureStyles() {
    if (document.getElementById('bd-turbinegenerator-styles')) return;
    var s = document.createElement('style');
    s.id = 'bd-turbinegenerator-styles';
    s.textContent =
      '@keyframes tgScrollBlade{to{transform:translateY(40px)}}' +
      '@keyframes tgScrollGen{to{transform:translateY(24px)}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function build(cfg, env) {
    ensureStyles();
    var h = env.h;
    var gid = env.uid('tg');
    var glowOn = true;
    var cy = 150;

    // dynamic element refs
    var scrollGroups = [];   // 5 blade scrolls (tgScrollBlade)
    var genScroll = null;    // winding scroll (tgScrollGen)
    var turbGlow, turbSteam, genGlow;

    // a single rotor stage: the angled blade fins scroll top-to-bottom within a clipped
    // window, which reads as blades sweeping around the horizontal driveshaft — the vertical
    // spine stays fixed as the blade root; speed tied to steam flow
    function stage(x, cyy, halfH, idx) {
      var y0 = cyy - halfH * 0.82, y1 = cyy + halfH * 0.82;
      var period = 40, dx = halfH * 0.24;
      var phase = (idx % 2) * (period / 2); // alternate stages by half a period so each column sits in the gap between its neighbors
      var clipId = gid + 'BladeClip' + idx;
      var ticks = [];
      var i = 0;
      for (var ty = y0 - period + phase; ty <= y1 + period; ty += period) {
        // dark halo + bright fin so blades stay legible against bare steel AND against steam
        ticks.push(h('line', { key: 'tkb' + i, x1: x - dx, y1: ty - 5, x2: x + dx, y2: ty + 5, stroke: '#0a0e13', strokeWidth: 6, strokeLinecap: 'round' }));
        ticks.push(h('line', { key: 'tk' + i, x1: x - dx, y1: ty - 5, x2: x + dx, y2: ty + 5, stroke: '#d7e1e8', strokeWidth: 3.4, strokeLinecap: 'round' }));
        i++;
      }
      var scroll = h('g', { key: 'scroll', ref: function (el) { scrollGroups.push(el); } }, ticks);
      return h('g', { key: 'stage' + idx }, [
        h('defs', { key: 'd' }, [h('clipPath', { key: 'cp', id: clipId }, [h('rect', { key: 0, x: x - halfH * 0.5, y: y0, width: halfH, height: y1 - y0 })])]),
        h('line', { key: 'v', x1: x, y1: y0, x2: x, y2: y1, stroke: '#12181e', strokeWidth: 2.4, strokeLinecap: 'round' }),
        h('g', { key: 'clip', clipPath: 'url(#' + clipId + ')' }, [scroll])
      ]);
    }

    var C = [];
    C.push(h('defs', { key: 'defs' }, [
      h('linearGradient', { key: 'steel', id: gid + 'SteelGrad', x1: '0', y1: '0', x2: '0', y2: '1' }, [
        h('stop', { key: 0, offset: '0', stopColor: '#3a4c58' }), h('stop', { key: 1, offset: '1', stopColor: '#0c141c' })]),
      h('linearGradient', { key: 'metal', id: gid + 'MetalGrad', x1: '0', y1: '0', x2: '1', y2: '0' }, [
        h('stop', { key: 0, offset: '0', stopColor: '#1c232a' }), h('stop', { key: 1, offset: '0.5', stopColor: '#7a8994' }), h('stop', { key: 2, offset: '1', stopColor: '#1c232a' })]),
      h('linearGradient', { key: 'steam', id: gid + 'SteamGrad', x1: '0', y1: '0', x2: '1', y2: '0' }, [
        h('stop', { key: 0, offset: '0', stopColor: '#c7d0d6' }), h('stop', { key: 1, offset: '0.5', stopColor: '#a4aeb4' }), h('stop', { key: 2, offset: '1', stopColor: '#7f8a91' })]),
      h('filter', { key: 'glow', id: gid + 'Glow', x: '-60%', y: '-60%', width: '220%', height: '220%' }, [h('feGaussianBlur', { key: 0, stdDeviation: '10' })])
    ]));

    // standardized medium steam-inlet port (the board draws the connecting stub to the TCV).
    // Ports carry data-active driven from flowFrac in update() — a port with NO data-active
    // reads as always-flowing to updatePipeFlowStates, which kept the inlet stub and the
    // exhaust-to-condenser pipe animating on a steamless plant (#236).
    var portSteamIn, portExhaust;
    C.push(h('circle', { key: 'pmSteamIn', ref: function (el) { portSteamIn = el; }, cx: 314, cy: 115, r: 0.75, fill: 'none', 'data-port': 'steam-in', 'data-fluid': 'steam', 'data-dir': 'left', 'data-size': 'medium', 'data-out': '0', 'data-active': '1' }));

    // turbine steam exhaust — outlet underneath the casing down toward the condenser (grey steam)
    // drawn before the casing so the casing's sloped underside overlaps it
    var exX = 560, exTopY = 213;
    C.push(h('rect', { key: 'exNoz', x: exX - 16, y: exTopY - 6, width: 32, height: 18, rx: 4, fill: 'url(#' + gid + 'SteelGrad)', stroke: '#223543', strokeWidth: 1.2 }));
    // standardized medium exhaust port (the board draws the connecting stub to the condenser)
    C.push(h('circle', { key: 'pmExhaust', ref: function (el) { portExhaust = el; }, cx: exX, cy: exTopY + 12, r: 0.75, fill: 'none', 'data-port': 'exhaust-out', 'data-fluid': 'wetSteam', 'data-dir': 'down', 'data-size': 'medium', 'data-out': '1', 'data-active': '1' }));

    // turbine casing (narrowed left/right; left edge stays put so the steam-inlet stub
    // doesn't have to move)
    var turbD = 'M330,40 L586,90 L586,210 L330,260 Z';
    turbGlow = h('path', { key: 'turbGlow', d: turbD, fill: '#c7d0d6', opacity: 0.14, filter: 'url(#' + gid + 'Glow)', style: { display: 'none' } });
    C.push(turbGlow);
    C.push(h('path', { key: 'turbCasing', d: turbD, fill: 'url(#' + gid + 'SteelGrad)', stroke: '#46596a', strokeWidth: 2.4, strokeLinejoin: 'round' }));
    // steam filling the turbine interior -- only present when steam is flowing in;
    // hot at the left (inlet) grading to cool at the right as it expands through the stages
    turbSteam = h('path', { key: 'turbSteam', d: turbD, fill: 'url(#' + gid + 'SteamGrad)', opacity: 0.3, style: { display: 'none' } });
    C.push(turbSteam);

    // generator casing
    var genX = 614, genY = 90, genW = 168, genH = 120;
    var CYAN = '#4fe3ff';
    genGlow = h('rect', { key: 'genGlow', x: genX - 12, y: genY - 12, width: genW + 24, height: genH + 24, rx: 16, fill: CYAN, opacity: 0.2, filter: 'url(#' + gid + 'Glow)', style: { display: 'none' } });
    C.push(genGlow);
    C.push(h('rect', { key: 'genBox', x: genX, y: genY, width: genW, height: genH, rx: 6, fill: 'url(#' + gid + 'SteelGrad)', stroke: '#46596a', strokeWidth: 2.4 }));

    // driveshaft — one continuous, stationary line running from the turbine inlet straight
    // through the turbine casing and on through the generator casing
    C.push(h('line', { key: 'shaftBase', x1: 330, y1: cy, x2: genX + genW - 16, y2: cy, stroke: '#0c141c', strokeWidth: 8, strokeLinecap: 'round' }));
    C.push(h('line', { key: 'shaftHi', x1: 330, y1: cy, x2: genX + genW - 16, y2: cy, stroke: '#7a8994', strokeWidth: 2 }));

    // rotor stages sit on top of the shaft inside the turbine housing, tapering down the length
    var bladeXs = [374, 420, 466, 512, 558];
    bladeXs.forEach(function (x, si) {
      var halfH = 110 + (60 - 110) * ((x - 330) / 256);
      C.push(stage(x, cy, halfH, si));
    });

    // generator windings scroll top-to-bottom at the same rate as the turbine blades,
    // reading as the rotor spinning inside the casing
    var genInnerY0 = genY + 15, genInnerY1 = genY + genH - 15, genPeriod = 24;
    var windLines = [];
    var wi = 0;
    for (var ty = genInnerY0 - genPeriod; ty <= genInnerY1 + genPeriod; ty += genPeriod) {
      windLines.push(h('line', { key: 'gw' + wi, x1: genX + 22, y1: ty, x2: genX + genW - 22, y2: ty, stroke: '#8fa2b4', strokeWidth: 3, strokeLinecap: 'round' }));
      wi++;
    }
    genScroll = h('g', { key: 'genScroll' }, windLines);
    C.push(h('defs', { key: 'genClipDefs' }, [h('clipPath', { key: 'cp', id: gid + 'GenClip' }, [h('rect', { key: 0, x: genX + 22, y: genInnerY0, width: genW - 44, height: genInnerY1 - genInnerY0 })])]));
    C.push(h('g', { key: 'genClip', clipPath: 'url(#' + gid + 'GenClip)' }, [genScroll]));

    // crop the machine frame tight when controls are hidden (as in the diagram builders)
    var vb = cfg.showControls ? '308 18 490 290' : '326 37 457 256';
    var root = h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' } },
      h('svg', { viewBox: vb, style: { width: '100%', height: '100%', flex: 1, minHeight: 0, overflow: 'visible' } },
        h('g', { key: 'tgMachine' }, C)));

    // ---- dynamic state application ----
    var lastDur = null, lastOpen = null, lastOp = null;

    function setScroll(el, name, dur) {
      if (dur > 0) {
        if (!el.__bdAnim) { el.style.animation = name + ' ' + dur + 's linear infinite'; el.__bdAnim = true; }
        else el.style.animationDuration = dur + 's'; // duration-only update: no scroll restart
      } else if (el.__bdAnim) { el.style.animation = ''; el.__bdAnim = false; }
    }

    function update(props) {
      props = props || {};
      var frac = props.flowFrac;
      frac = frac == null ? 0 : Math.max(0, Math.min(1, frac));
      var open = frac > 0.02;
      var spinDur = open ? Math.max(0.2, 1.8 - frac * 1.5).toFixed(2) : 0;

      if (spinDur !== lastDur) {
        lastDur = spinDur;
        for (var i = 0; i < scrollGroups.length; i++) setScroll(scrollGroups[i], 'tgScrollBlade', spinDur);
        setScroll(genScroll, 'tgScrollGen', spinDur);
      }
      if (open !== lastOpen) {
        lastOpen = open;
        turbGlow.style.display = (glowOn && open) ? '' : 'none';
        genGlow.style.display = (glowOn && open) ? '' : 'none';
        turbSteam.style.display = open ? '' : 'none';
        // no steam through the machine → the inlet stub and exhaust line stop with it
        var act = open ? '1' : '0';
        if (portSteamIn) portSteamIn.setAttribute('data-active', act);
        if (portExhaust) portExhaust.setAttribute('data-active', act);
      }
      var op = (0.3 + frac * 0.35).toFixed(3);
      if (op !== lastOp) { lastOp = op; turbSteam.setAttribute('opacity', op); }
    }

    return { el: root, update: update };
  }
})();
