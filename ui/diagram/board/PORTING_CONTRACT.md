# Board component porting contract

Port design components from `inbox/design_import/<Name>.dc.html` (React/dc-runtime) to
vanilla-JS modules in `ui/diagram/board/components/`. The sim is buildless vanilla JS —
no React, no dc-runtime, no localStorage, no network fonts.

## Module shape

```js
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};
  RD.BoardComps = RD.BoardComps || {};
  RD.BoardComps['<Exact Comp Name>'] = { build: build };

  function build(cfg, env) {
    // ... create DOM once ...
    return { el: rootEl, update: update, destroy: destroy /* optional */ };
  }
})();
```

- `cfg` is the diagram item object from `pwr_board_data.js` (fields: `id, name, width,
  height, showControls, psize, fluid, suctionAngle, dischargeAngle, control, contents,
  temp, flowDir, clickable, flow, orientation` — only those relevant to the component).
  The board renderer wraps each component in an absolutely-positioned div of
  `cfg.width × cfg.height` canvas px; `build()` must return a root element that fills
  that wrapper exactly the way the design component's root fills its tile (same svg
  `viewBox`, same `width/height: 100%`, same `preserveAspectRatio`, same
  `overflow: visible` behavior).
- `env = { h, uid, StdPipe, onControl }`
  - `h(tag, props, ...children)` — React.createElement-compatible DOM factory
    (`ui/diagram/board/board_h.js`). Keep the ported `React.createElement` trees
    verbatim wherever possible; just rename to `h`. Supports `style` objects,
    `onClick`-style handlers, `ref` callbacks, camelCase SVG attrs.
  - `uid(prefix)` — unique id maker. EVERY svg gradient / clipPath / filter id must be
    per-instance unique (`var gid = env.uid('rv')`) exactly like the design sources do
    with their own uid helpers.
  - `StdPipe` — the standard pipe kit (`ui/diagram/board/std_pipe.js`, identical to the
    design project's `pipes.js`). Use `StdPipe.createKit(env.h)`, `StdPipe.watchScale`,
    `StdPipe.phaseTempColor` just like the source file does.
  - `onControl(action, value)` — call for every user interaction that the design handled
    with local state (valve body click, pump ON/OFF/slider, PORV click, TRIP/RESET...).
    Pass a short action string (documented per component below) and value. Do NOT keep
    local authoritative state — interactions only emit; the wiring layer will call
    `update()` with the resulting sim state on the next snapshot.

## update(props)

`update(props)` applies dynamic display state. It is called ~4×/s with the full props
object; write it so unchanged values are cheap (cache last-applied values, only touch
DOM on change). Continuous motion (impeller spin, blade scroll, flow dashes, bubble
rise) must be CSS keyframe animations whose `animation-duration` / `play-state` are
set from props — no requestAnimationFrame loops, no setInterval. The stage freezes all
animation via CSS `animation-play-state: paused` when the sim is paused, which only
works if motion is CSS-driven.

## What to strip from the design sources

- All dc-runtime templating (`renderVals`, `sc-if`, `sc-for`, `<helmet>`, DCLogic).
- Internal toy physics (reactor rod-worth/power lag loops, detector noise generators,
  boron slew intervals). Displayed quantities come straight from `update()` props.
- Editor-only interaction: pump nozzle drag-to-rotate (angles come from `cfg`),
  draggable indication cards, localStorage persistence.
- Local control panels ARE kept when `cfg.showControls` is true and the design draws
  them — but their buttons/sliders call `env.onControl` and render state from
  `update()` props (never from a local toggle).

## What must be preserved exactly

- All SVG geometry, gradients, filters, colors, stroke styles, animation keyframes —
  the board must look pixel-identical to the design render (`inbox/Diagram.png`).
- `data-port` marker elements with their exact positions and `data-port`, `data-dir`,
  `data-size`, `data-phase`, `data-temp`, `data-fluid`, `data-out`, `data-active`,
  `data-no-stub` attributes. The board renderer DOM-scans these to route pipes
  (`scanPorts`), so a missing or moved marker breaks pipe routing.
- `data-active` must update live where the design tied it to state (e.g. valve
  open/closed, PORV open) — pipes pause their flow animation off it.
- Scale-compensated flange groups (`StdPipe.watchScale` + `scale(1/s)` wrapper groups)
  exactly as in the source, so flange/wall art keeps constant on-screen thickness.
- Per-component CSS keyframes: inject once per page via a guarded
  `<style id="bd-<compname>-styles">` block (copy the pattern from std_pipe.js
  `ensureStyles()`), keeping the original keyframe names.

## Style / conventions

- ES5-flavored vanilla JS (var, function) to match the rest of `ui/` (no modules, no
  arrow functions in new board files? — arrows are fine, the sim targets evergreen
  Edge; but keep IIFE + 'use strict' wrapper and 2-space indent).
- No console noise; comments only where the source had meaningful ones or where a
  porting decision needs explanation (e.g. "level is a direct prop here; the design
  derived it from power").
- Self-check each file with `node --check` before finishing.
