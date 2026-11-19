# Third-party notices

The lab page ships these fonts, copied from Reactor Dynamics (`site/fonts/`). Each is under the SIL Open Font License 1.1. The license texts sit beside the fonts in `src/ui/fonts/` and are copied to `licenses/` in every build.

| Font | Files | License file | Copyright |
| --- | --- | --- | --- |
| Barlow Condensed | `barlow-condensed-600.woff2` | `OFL-barlow-condensed.txt` | Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow) |
| IBM Plex Mono | `ibm-plex-mono-400.woff2` | `OFL-ibm-plex-mono.txt` | Copyright 2017 IBM Corp. All rights reserved. |

## Colour map

Flux mode's scene scale passes through 17 colours of matplotlib's inferno colour map (`flux.look.inferno` in `data/builder.json`), and the tests hold them to the map's 256-row table (`tests/fixtures/colormaps/inferno.json`, read from matplotlib 3.11.0 by `tools/colormap_fixture.py`). Inferno is by Nathaniel J. Smith and Stefan van der Walt, released under the CC0 1.0 public domain dedication (https://github.com/BIDS/colormap); credited here as its authors ask.
