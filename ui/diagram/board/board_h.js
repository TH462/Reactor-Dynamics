/* board_h.js — minimal hyperscript for the PWR board renderer.
 *
 * The design components (inbox/design_import/*.dc.html) build their SVG through
 * React.createElement(tag, props, ...children). RD.BoardH.h is a drop-in
 * signature-compatible factory that creates real DOM nodes instead, so the
 * ported component code keeps its geometry verbatim. StdPipe.createKit(h)
 * receives this same h.
 *
 * Supported prop conventions (the subset the design sources use):
 *   - key            ignored (no vdom)
 *   - className      -> class attribute
 *   - style          object (camelCase) or string
 *   - onXxx          -> addEventListener('xxx')
 *   - ref            callback ref, called with the created element
 *   - SVG camelCase  strokeWidth -> stroke-width etc., with a preserve list for
 *                    genuinely camelCase SVG attributes (viewBox, stdDeviation…)
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_TAGS = {};
  ('svg g path rect circle ellipse line polyline polygon text tspan defs use symbol marker ' +
   'linearGradient radialGradient stop clipPath mask pattern image filter ' +
   'feGaussianBlur feOffset feMerge feMergeNode feBlend feColorMatrix feComposite ' +
   'feFlood feDropShadow foreignObject animate animateTransform').split(' ').forEach(function (t) { SVG_TAGS[t] = 1; });

  // SVG attributes that must keep their camelCase spelling.
  var PRESERVE = {};
  ('viewBox preserveAspectRatio gradientUnits gradientTransform spreadMethod ' +
   'patternUnits patternContentUnits patternTransform clipPathUnits maskUnits ' +
   'maskContentUnits filterUnits primitiveUnits stdDeviation baseFrequency ' +
   'numOctaves surfaceScale specularConstant specularExponent diffuseConstant ' +
   'kernelMatrix kernelUnitLength keyPoints keySplines keyTimes lengthAdjust ' +
   'limitingConeAngle markerHeight markerUnits markerWidth pathLength pointsAtX ' +
   'pointsAtY pointsAtZ refX refY repeatCount repeatDur requiredExtensions ' +
   'startOffset systemLanguage tableValues targetX targetY textLength xChannelSelector ' +
   'yChannelSelector zoomAndPan attributeName attributeType calcMode').split(' ').forEach(function (a) { PRESERVE[a] = 1; });

  var ALIAS = { className: 'class', htmlFor: 'for', xlinkHref: 'xlink:href' };

  function kebab(name) {
    return name.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); });
  }

  // CSS properties whose numeric values are RATIOS or COUNTS, not lengths. Appending 'px'
  // to these produces an invalid declaration that the browser silently drops, so the
  // property falls back to its inherited value and the symptom looks like a layout bug
  // rather than a unit bug: `lineHeight: 1.1` became `1.1px`, which collapsed the vital-tile
  // label to a 1.2px line box and let the reading paint on top of its own caption; every
  // numeric `fontWeight` was dropped the same way, so nothing set that way was ever bold.
  // Same list React maintains, trimmed to what this kit can emit.
  var UNITLESS = {
    opacity: 1, zIndex: 1, lineHeight: 1, fontWeight: 1, zoom: 1, order: 1,
    flex: 1, flexGrow: 1, flexShrink: 1, columnCount: 1, aspectRatio: 1, scale: 1,
    animationIterationCount: 1, gridRow: 1, gridColumn: 1,
    // SVG presentation attributes reachable through style
    fillOpacity: 1, strokeOpacity: 1, stopOpacity: 1, strokeDashoffset: 1, strokeMiterlimit: 1
  };

  function applyStyle(el, style) {
    if (typeof style === 'string') { el.setAttribute('style', style); return; }
    for (var k in style) {
      if (!Object.prototype.hasOwnProperty.call(style, k)) continue;
      var v = style[k];
      if (v == null) continue;
      if (k.indexOf('--') === 0) el.style.setProperty(k, String(v));
      else el.style[k] = (typeof v === 'number' && !UNITLESS[k]) ? v + 'px' : String(v);
    }
  }

  function appendKids(el, kids) {
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c == null || c === false || c === true) continue;
      if (Array.isArray(c)) { appendKids(el, c); continue; }
      if (typeof c === 'string' || typeof c === 'number') { el.appendChild(document.createTextNode(String(c))); continue; }
      if (c && c.el instanceof Node) { el.appendChild(c.el); continue; } // stub() style {el,tip}
      if (c instanceof Node) el.appendChild(c);
    }
  }

  function h(tag, props /* , ...children */) {
    var isSvg = SVG_TAGS[tag] === 1;
    var el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        var v = props[k];
        if (v == null || k === 'key') continue;
        if (k === 'style') { applyStyle(el, v); continue; }
        if (k === 'ref') { if (typeof v === 'function') v(el); continue; }
        if (k.length > 2 && k.charCodeAt(0) === 111 && k.charCodeAt(1) === 110 && k[2] === k[2].toUpperCase()) {
          el.addEventListener(k.slice(2).toLowerCase(), v);
          continue;
        }
        var name = ALIAS[k] || k;
        if (name === 'readOnly') { if (v) el.setAttribute('readonly', ''); continue; }
        if (!isSvg) {
          // HTML: value/checked need property assignment to behave for inputs
          if (name === 'value') { el.value = v; continue; }
          if (name === 'checked') { el.checked = !!v; continue; }
          el.setAttribute(name, v === true ? '' : String(v));
          continue;
        }
        if (!PRESERVE[name] && /[A-Z]/.test(name) && name.indexOf(':') < 0) name = kebab(name);
        el.setAttribute(name, String(v));
      }
    }
    if (arguments.length > 2) appendKids(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  /* SOFT HALO WITHOUT A FILTER (#613 wave 4).
   *
   * The board's component art drew every glow as a solid shape behind an `feGaussianBlur`.
   * MEASURED with tools/perf_trace.js at hot_full_power, 10x, 15 s windows (round 5 in
   * inbox/613/trace_results.md): killing every filter on the board (`nofilter`) takes 25.8 % off
   * raster work, and the cost splits 18.5 % / 8.9 % between the twelve blurred elements whose
   * own fill/opacity is REWRITTEN every broadcast and the twenty-one that are never written at
   * all. Promoting just the tiles that hold a visible filter (`filterlayer`) recovered only
   * 7.9 % — under a third — because a compositor layer cannot cache a blur whose input keeps
   * changing, and it cost 5 % more GPU time for twelve extra layers.
   *
   * So the halo is drawn instead of computed: a radial gradient from the glow colour at full
   * stop-opacity in the middle to fully transparent at the bbox edge. A gradient fill is one
   * shader pass over the shape; a stdDeviation 9-11 Gaussian is a large separable convolution
   * over a region 180-220 % of the bbox, re-run every time anything invalidates the tile.
   *
   * TWO THINGS THE CALLER MUST DO, and both are why this is a helper and not a copied literal:
   *  1. GROW THE SHAPE by about 2*stdDeviation on every side. A blur spreads OUTSIDE its
   *     source; a gradient cannot. Reuse the old geometry unchanged and the halo shrinks by
   *     that much.
   *  2. RECOLOUR THROUGH `setColor`, not through the element's `fill`. The element is now
   *     painted with `url(#id)`, so a `setAttribute('fill', c)` on it silently does nothing —
   *     the glow just stops responding, which looks like a plant bug, not an art bug.
   * The element's own `opacity` and `display` still work exactly as before, so the update
   * paths that drive intensity and visibility are unchanged. */
  function softGlow(id, color) {
    var stops = [
      h('stop', { offset: '0', stopColor: color, stopOpacity: 1 }),
      h('stop', { offset: '0.42', stopColor: color, stopOpacity: 0.82 }),
      h('stop', { offset: '0.72', stopColor: color, stopOpacity: 0.3 }),
      h('stop', { offset: '1', stopColor: color, stopOpacity: 0 })
    ];
    var def = h('radialGradient', { id: id }, stops);
    return {
      def: def,
      paint: 'url(#' + id + ')',
      setColor: function (c) {
        for (var i = 0; i < stops.length; i++) stops[i].setAttribute('stop-color', c);
      }
    };
  }

  var uidCounter = 0;
  RD.BoardH = {
    h: h,
    svgNS: SVG_NS,
    softGlow: softGlow,
    uid: function (prefix) { return (prefix || 'bd') + (++uidCounter).toString(36); },
    clear: function (el) { while (el.firstChild) el.removeChild(el.firstChild); }
  };
})();
