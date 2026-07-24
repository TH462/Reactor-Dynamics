# Contributing to Reactor Dynamics

Thanks for your interest! Reactor Dynamics is an educational nuclear-plant
simulator, and contributions — bug reports, physics/procedure corrections, and
code — are welcome. This guide explains the workflow.

## Ways to help

- **Report a bug or a physics/procedure error.** Open an [issue], or use the 💬
  button inside the simulator to attach a session capture that replays exactly what
  you saw. Accuracy matters here — if a setpoint, procedure, or plant behavior is
  wrong, please say so with a reference.
- **Improve the docs or manuals.** Typos, clarifications, and better explanations
  are all fair game.
- **Contribute code.** See the workflow below.

## Contribution workflow (fork &rarr; pull request)

You don't need any access to this repository to contribute — you propose changes
from your own fork, and the maintainer reviews and merges.

1. **Fork** this repository to your own account.
2. **Branch off `develop`** (not `main`). `develop` is the active integration branch;
   `main` is the stable/release branch.
   ```
   git checkout develop
   git checkout -b my-change
   ```
3. Make your change (see _Working in the code_ below), and commit with a clear message.
4. **Open a pull request against `develop`.** Describe what you changed and why. If it
   fixes an issue, link it.
5. The maintainer will review, maybe suggest changes, and merge when it's ready. Not
   every proposal will be merged — but every one is appreciated.

## Working in the code

There is **no build step and no framework** — the whole plant is vanilla JavaScript
that runs in the browser and in Node test runners. Before editing source, please read
the **Architecture** and **Repository layout** sections of the [README](README.md), and
note two conventions that are easy to break:

- **No module system.** Files in `engines/`, `layers/`, `scenarios/`, and `ui/` are
  plain global-namespace scripts that attach to `globalThis.RD`. Do **not** add
  `import` / `export` / `require` to source files — it breaks both the browser
  (`<script>` tag) and Node (`require()`-into-global) load paths.
- **Load order matters.** Config and control modules load before the engine files that
  consume them; keep the ordering intact.

### Running it

Open `index.html`, or serve the folder with any static server (`npx serve .`). The
control room is `ui/shell.html?engine=pwr`.

### Running the tests

Tests are plain Node CLI runners (no framework, no `package.json`):

```
node test/run_pwr.js         # PWR scenario suite
node test/run_scenarios.js   # all scenarios
node test/run_campaign.js    # training-campaign gate
```

Please make sure the suites relevant to your change still pass before opening a PR.

> **Focus:** active development is currently centered on the **PWR**. The BWR and RBMK
> physics engines are complete, but their control rooms are still under construction —
> ask before starting large work on those so effort isn't wasted.

## Licensing of contributions

By contributing, you agree that your contributions are licensed under the same terms
as the project:

- **Code** under the **GNU Affero General Public License v3.0** (see [`LICENSE`](LICENSE)).
- **Manuals and other written content** under **Creative Commons Attribution 4.0**
  (see [`LICENSE-CONTENT`](LICENSE-CONTENT)).

Please only contribute work you have the right to license this way.

## A note on scope

This is an **educational simulation, not engineering software**. It intentionally uses
simplified, lumped-parameter models tuned for teaching. Contributions should improve the
_teaching_ value and plausibility of the simulation — not push it toward being treated as
a real engineering tool. See [`legal.html`](legal.html).

[issue]: ../../issues
