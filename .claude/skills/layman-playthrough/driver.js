/*
 * driver.js — a PERSISTENT Playwright browser you drive by dropping files.
 *
 * One long-lived headless Edge page. It polls `<scratch>/cmd/` for `*.js` files, runs each
 * one's body as an async function with `page` in scope, and writes the return value to
 * `<scratch>/out/<name>.txt` followed by a `<name>.txt.done` sentinel. `go.sh` submits a
 * command and blocks on that sentinel.
 *
 * WHY A FILE PROTOCOL AND NOT A SCRIPT PER STEP. A playthrough is one continuous plant over
 * two hours. A fresh `node script.js` per action would relaunch the browser and lose the run,
 * so every step would have to be replayed from cold. This keeps ONE page alive across
 * hundreds of commands, which is also what makes the wall-clock and sim-clock log honest.
 *
 *   node driver.js <scratch-dir> [repo-dir]
 *
 * Defaults: scratch-dir = this file's directory (or $RD_SCRATCH), repo-dir =
 * C:/grok_build/Reactor_Dynamics (or $RD_REPO). Edge comes from $RD_EDGE, else the usual
 * per-machine install path below. Playwright is the repo's own `node_modules/playwright-core`
 * — this repo has no package.json of its own to install from.
 *
 * Creates cmd/, out/ and shots/ under the scratch dir, writes `driver_ready.txt` when the
 * page is up, and appends any page error to `pageerrors.log`.
 *
 * Command scope: page, browser, shot(name), ckl(), body(), sleep(ms), fs, path, ROOT, REPO.
 * Return a string and it is written verbatim; return anything else and it is JSON.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || process.env.RD_SCRATCH || __dirname);
const REPO = (process.argv[3] || process.env.RD_REPO || 'C:/grok_build/Reactor_Dynamics').replace(/\\/g, '/');
const EDGE = process.env.RD_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const { chromium } = require(REPO + '/node_modules/playwright-core');

const CMD = path.join(ROOT, 'cmd');
const OUT = path.join(ROOT, 'out');
const SHOT = path.join(ROOT, 'shots');
for (const d of [CMD, OUT, SHOT]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => fs.appendFileSync(path.join(ROOT, 'pageerrors.log'), String(e) + '\n'));
  fs.writeFileSync(path.join(ROOT, 'driver_ready.txt'), 'ready ' + new Date().toISOString() + ' repo=' + REPO);

  const done = new Set();
  // helpers available in command scope
  const shot = async (name) => { const p = path.join(SHOT, name + '.png'); await page.screenshot({ path: p }); return p; };
  // The running walkthrough is drawn in the Instructor tab under #cklRun (#660); #cklLog is
  // the log element inside it and is what older passes read.
  const ckl = async () => page.evaluate(() => {
    const e = document.querySelector('#cklRun') || document.querySelector('#cklLog');
    return e ? e.innerText : '(#cklRun missing)';
  });
  const body = async () => page.evaluate(() => document.body.innerText);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  while (true) {
    const files = fs.readdirSync(CMD).filter(f => f.endsWith('.js') && !done.has(f)).sort();
    for (const f of files) {
      done.add(f);
      const src = fs.readFileSync(path.join(CMD, f), 'utf8');
      let result;
      try {
        const fn = new Function('page', 'browser', 'shot', 'ckl', 'body', 'sleep', 'fs', 'path', 'ROOT', 'REPO',
          '"use strict"; return (async () => {' + src + '})();');
        result = await fn(page, browser, shot, ckl, body, sleep, fs, path, ROOT, REPO);
      } catch (e) {
        result = 'ERROR: ' + (e && e.stack ? e.stack : String(e));
      }
      const outPath = path.join(OUT, f.replace(/\.js$/, '.txt'));
      let text;
      if (typeof result === 'string') text = result;
      else { try { text = JSON.stringify(result, null, 1); } catch (e) { text = String(result); } }
      fs.writeFileSync(outPath, text === undefined ? '(undefined)' : text);
      fs.writeFileSync(outPath + '.done', 'x');
    }
    await sleep(300);
  }
})();
