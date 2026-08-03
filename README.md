# Reactor⚛️Dynamics

An educational, browser-based nuclear power plant simulator. It models three reactor
types — a **PWR** (Pressurized Water Reactor), a **BWR** (Boiling Water Reactor), and
an **RBMK** (the Chernobyl-era Soviet design) — accurately enough to teach real plant
behavior, and to reproduce the conditions behind the three most famous nuclear
accidents: **Three Mile Island**, **Chernobyl**, and **Fukushima**.

It runs entirely in the browser as vanilla JavaScript — **no server, no downloads, no
WebAssembly, no framework, no build step** — so it works even in locked-down
institutional environments.

**▶ Play it:** open `index.html`, or go straight to the control room at
`ui/shell.html?engine=pwr`.

> ⚠️ **This is an educational simulation — not engineering software.** It must never be
> used to operate, design, train for, or make any decision about a real nuclear
> facility, and is no substitute for licensed operator training. See
> [`legal.html`](legal.html).

---

## The defining idea: plant dynamics

The point of the simulator is in the name. A power plant is a set of components that push
on each other, and the thing worth learning is **how they are coupled** — change one, and
know what responds, and why.

The clearest example takes about a minute. Put the control rods in manual, then lower
generator demand from 100 to 60 MWe. Nobody touches the reactor — and reactor power falls
to **57.5 %** on its own, while average coolant temperature *rises* from 579 °F to 602 °F
(304 → 317 °C). The plant did that itself: less steam drawn means less heat removed, so
the coolant warms, and a warmer moderator is a less effective one, which pushes power down
until it matches the load again. Power follows load, and the negative moderator temperature
coefficient is why.

Second comes **operating the plant** — running a real evolution in the right order, with the
right systems lined up: an approach to criticality, a power ascension, a cooldown to cold
shutdown. Some steps protect against things you cannot see happen at the moment you perform
them, which is exactly why they are worth practising.

Instruments are part of this, but as the layer you observe it *through*: readings lag, carry
noise, and — in failure scenarios — can be flatly wrong. Every gauge, alarm and automatic
protection here reads the instrument rather than the true state, exactly as in a real plant.
That is what makes Three Mile Island reproducible, where operators watched a valve indicator
reading "closed" while the valve was stuck open. It matters most when something breaks; it is
not what the simulator is about.

## What's inside

- **Real reactor physics** — point kinetics with six delayed-neutron groups; reactivity
  feedback from fuel and moderator temperature, boron, and xenon; decay heat; two-phase
  steam-generator behavior; and a complete balance of plant from the core through the
  turbine to the grid.
- **Guided training campaigns** — an instructor layer watches the board and gates your
  progress through real procedures (approach to criticality, power ascension, load
  maneuvers, cooldown, casualty response), culminating in a story module set during the
  night shift of March 28, 1979.
- **Commercial-format operator manuals** built into the simulator's Training tab.
- **Break it on purpose** — inject stuck valves, failed sensors, and pump trips, then work out
  what the plant is actually doing from the couplings that still hold.

**Status:** the **PWR** control room is playable today (functional alpha). The BWR and
RBMK physics engines are complete; their control rooms are under construction.

## Running it

No build step. Open `index.html` directly, or serve the folder with any static server:

```
npx serve .
# or
python3 -m http.server
```

The control-room UI lives at `ui/shell.html` (the PWR card on the landing page
deep-links to `ui/shell.html?engine=pwr`).

### Offline, in one file

There is nothing to load at runtime — no `fetch`, no modules, no web fonts, no images —
so the sim runs straight from `file://` with no server at all. To carry it as a single
attachment:

```
node tools/make_portable.js      # -> dist/Reactor_Dynamics_Alpha_1.9.0.html  (~2.5 MB)
```

On Windows you can also just **double-click `tools\make_portable.cmd`**, which runs the
above and zips the result for email. Do *not* double-click the `.js` — Windows hands a
`.js` file to Windows Script Host rather than Node, which fails with the misleading
`Syntax error, Code: 800A03EA`.

Either route inlines every script and stylesheet into one self-contained page you can
double-click on a machine with no network, no Node, and no install. (Send the `.zip`, not
the `.html` — some mail providers strip `.html` attachments.) `test/run_portable.js` is the
gate that keeps it buildable.

## How it's built

A layered stack — **snapshots flow up, commands flow down**; each layer talks only to
the one directly below it:

```
User Interface
        │  commands ↓   snapshots ↑
Instructor Layer   (guided campaigns, story scenarios)
Control & Failure Layer   (trips, protection, ESF logic, injected failures)
Physics Engines   (PWR / BWR / RBMK)
```

A simulation service drives the step loop and assembles each snapshot. The control layer
owns instrument-based *actuations*; the engines own pure hydraulics and physics. It's
all plain global-namespace JavaScript loaded via `<script>` tags — the same files the
Node test runners execute for the test suite.

## Repository layout

```
├── index.html, about.html, legal.html, privacy.html, changelog.html  ← the website
├── engines/     physics engines (pwr/, bwr/, rbmk/)
├── layers/      control, simulation service, instructor, test runner
├── scenarios/   flagship + library training scenarios
├── ui/          the control-room interface (diagram, panels, manuals)
├── test/        Node CLI test runners + harnesses
├── tools/       build tooling
├── Blueprint/   the authoritative design specification
└── Manuals/     the PWR operator manual (also rendered in-app)
```

> **Note for contributors:** `Blueprint/` is a dense internal engineering specification
> and design log, and `Diagnostic/` holds the candid tuning/audit/playtest reports it
> references. A few notes and code comments also point to an `inbox/` working directory
> (design-import scratch) that isn't published — you can safely ignore those breadcrumbs.

## License

Reactor Dynamics is dual-licensed, © 2026 Timothy Holt:

- **Code** — the physics engines, control/simulation/instructor layers, UI, tooling,
  and tests — is licensed under the **GNU Affero General Public License v3.0**
  ([`LICENSE`](LICENSE)). AGPL is copyleft with a network clause: anyone who
  distributes the code **or hosts a modified version as a network service** must make
  their complete corresponding source available under the same license.
- **Operator manuals & training prose** — the material under `Manuals/` and the
  human-readable mission/instructor text — is licensed under **Creative Commons
  Attribution 4.0** ([`LICENSE-CONTENT`](LICENSE-CONTENT)): reuse freely, including
  commercially, with attribution.

The full public terms — safety disclaimer, no-warranty, and limitation of liability —
are on the [legal page](legal.html).

**Source:** https://github.com/TH462/Reactor-Dynamics — this is also the AGPL §13
network-source offer referenced in [legal.html](legal.html) §5.

## Contact

Questions, bug reports, or notes on the physics? Email **reactordynamics@gmail.com**,
or use the in-simulator 💬 button to send a report with your session attached.
