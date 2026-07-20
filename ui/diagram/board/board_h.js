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

  function applyStyle(el, style) {
    if (typeof style === 'string') { el.setAttribute('style', style); return; }
    for (var k in style) {
      if (!Object.prototype.hasOwnProperty.call(style, k)) continue;
      var v = style[k];
      if (v == null) continue;
      if (k.indexOf('--') === 0) el.style.setProperty(k, String(v));
      else el.style[k] = typeof v === 'number' && k !== 'opacity' && k !== 'zIndex' ? v + 'px' : String(v);
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

  var uidCounter = 0;
  RD.BoardH = {
    h: h,
    svgNS: SVG_NS,
    uid: function (prefix) { return (prefix || 'bd') + (++uidCounter).toString(36); },
    clear: function (el) { while (el.firstChild) el.removeChild(el.firstChild); }
  };
})();
