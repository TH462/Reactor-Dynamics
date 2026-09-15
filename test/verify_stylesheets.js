/* verify_stylesheets.js — DOES THE BROWSER PARSE WHAT WE WROTE? (#740)
 *
 * THE DEFECT THIS EXISTS FOR, IN ONE SENTENCE: a stray `}` in `ui/diagram/board/pwr_board.css`
 * silently deleted the rule ten lines below it, eleven controls on the live board rendered wrong,
 * and EVERY GATE IN THIS REPO WAS GREEN.
 *
 * WHY A TOP-LEVEL `}` IS NOT HARMLESS. CSS error recovery does not skip it. It opens a qualified
 * rule whose prelude runs on until the next `{` — so the stray brace SWALLOWS THE FOLLOWING RULE
 * whole. Nothing throws, nothing warns, the file still looks right, and the damage is ten lines
 * away from the edit.
 *
 * WHAT IT COST, MEASURED on `shell.html?engine=pwr2` at 1500x950 before the brace was removed:
 *   - `pwr_board.css` parsed 72 rules instead of 73; `.bd-num-frame` was the rule that vanished
 *   - 11 number-input tiles lost `display:flex`, their border and their radius
 *   - the `<input>` rendered 169.6 px wide inside an 80.8 px frame — overhanging the tile and
 *     painting over the neighbouring control; the frame 57.4 px tall instead of 24.2
 *   - those are the setpoint boxes with two filed issues about being unusable (#605, #615)
 * Green throughout: `verify_board_check` 278, `run_glow_stacking` 20/20, `run_style` 11,
 * `run_hardrules` 550, and the accessibility runner that shipped in the same commit at 14/14.
 *
 * THE LESSON, and it generalises well past CSS *(the #740 quality pass, verbatim)*: "the commit
 * spends ninety lines on a cascade trap it caught, and shipped a one-character brace error that
 * silently deleted a rule ten lines away. The lesson filed was 'rules that must win go last'; the
 * lesson available was 'nobody parsed the file after editing it.'"
 *
 * ⚠ THIS IS A GENERAL STYLESHEET INVARIANT AND IT LIVES IN ITS OWN RUNNER ON PURPOSE. It was
 * written inside `verify_reduced_motion.js`, where it had nothing to do with that runner's subject
 * and where the next person to reorganise the file would have deleted the repo's only parse check
 * without knowing what it was. It is not about accessibility. It is about whether the browser
 * received the rules we think we shipped.
 *
 * WHAT IT WOULD ALSO HAVE CAUGHT: the `.bd-info` cascade bug this cycle keeps citing, and any
 * unclosed block, swallowed rule or mismatched brace in any stylesheet the shell loads.
 *
 * HOW: count TOP-LEVEL rules in the source (comments and strings stripped, brace depth tracked) and
 * compare against `cssRules.length` in a real browser. The two agree or something was eaten.
 *
 * Run: node test/verify_stylesheets.js
 */
'use strict';
var path = require('path');
var http = require('http');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');
var PORT = 0;
var B = '\x1b[1m', G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', X = '\x1b[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  if (cond) { nPass++; console.log(G + '  PASS' + X + '  ' + name + (note ? D + '  — ' + note + X : '')); }
  else { nFail++; console.log(R + '  FAIL' + X + '  ' + name + (note ? D + '  — ' + note + X : '')); }
}

function mime(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}
function startServer() {
  return new Promise(function (res) {
    var s = http.createServer(function (q, r) {
      var u = (q.url || '/').split('?')[0];
      if (u === '/') u = '/ui/shell.html';
      var fp = path.join(ROOT, decodeURIComponent(u.replace(/^\//, '').replace(/\//g, path.sep)));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
      r.writeHead(200, { 'Content-Type': mime(fp) });
      r.end(fs.readFileSync(fp));
    });
    s.listen(0, '127.0.0.1', function () { PORT = s.address().port; res(s); });
  });
}

/* Top-level rules in the SOURCE. Comments stripped first (a `}` inside prose is not a brace), then
 * quoted strings skipped (a `{` inside a `content:` string is not a block), then brace depth
 * tracked: every return to depth 0 closes one top-level rule. A `}` seen at depth 0 is a STRAY and
 * is what this runner exists for; depth left above 0 at EOF is an unclosed block. */
function sourceRules(file) {
  var t = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  var depth = 0, rules = 0, stray = 0, strayLines = [], line = 1;
  for (var i = 0; i < t.length; i++) {
    var ch = t[i];
    if (ch === '\n') { line++; continue; }
    if (ch === '"' || ch === "'") {
      var q = ch; i++;
      while (i < t.length && t[i] !== q) { if (t[i] === '\\') i++; if (t[i] === '\n') line++; i++; }
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) rules++;
      else if (depth < 0) { stray++; strayLines.push(line); depth = 0; }
    }
  }
  return { rules: rules, stray: stray, strayLines: strayLines, unclosed: depth };
}

var SHEETS = [
  ['ui/shell.css', 'shell.css'],
  ['ui/diagram/board/pwr_board.css', 'pwr_board.css']
];

(async function () {
  var srv = await startServer();
  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });
  var page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&dev=1',
    { waitUntil: 'networkidle', timeout: 90000 });
  try { if (await page.isVisible('#missionOverlay')) { await page.click('#missionClose'); await page.waitForTimeout(300); } } catch (e) {}
  await page.waitForTimeout(700);

  var dom = await page.evaluate(function () {
    var out = {};
    for (var i = 0; i < document.styleSheets.length; i++) {
      var sh = document.styleSheets[i], rules;
      try { rules = sh.cssRules; } catch (e) { continue; }
      var href = (sh.href || '').split('/').pop();
      if (href) out[href] = rules.length;
    }
    return out;
  });

  console.log(B + '\nSTYLESHEETS — the browser parsed what we wrote (#740)' + X);

  /* THE SHEET HAS TO BE LOADED AT ALL. A typo in a <link> would give 0 rules and every comparison
   * below would then be "0 === 0" on a stylesheet nobody is serving — the hollow-check shape. */
  SHEETS.forEach(function (pair) {
    ck(pair[1] + ' is actually loaded by the shell (a comparison on an absent sheet proves nothing)',
      typeof dom[pair[1]] === 'number' && dom[pair[1]] > 0,
      dom[pair[1]] === undefined ? 'NOT LOADED' : dom[pair[1]] + ' rules in the CSSOM');
  });

  SHEETS.forEach(function (pair) {
    var src = sourceRules(pair[0]);
    ck(pair[1] + ': no stray `}` and no unclosed block',
      src.stray === 0 && src.unclosed === 0,
      'stray ' + src.stray + (src.strayLines.length ? ' (line ' + src.strayLines.join(', ') + ')' : '') +
      ', unclosed depth ' + src.unclosed);
    ck(pair[1] + ': every top-level rule the source declares reaches the CSSOM',
      dom[pair[1]] === src.rules,
      'source ' + src.rules + ' vs CSSOM ' + dom[pair[1]] +
      (dom[pair[1]] < src.rules ? '  — ' + (src.rules - dom[pair[1]]) + ' RULE(S) SWALLOWED' : ''));
  });

  await browser.close();
  srv.close();

  console.log('\n' + B + (nFail ? R + 'STYLESHEETS: FAIL' : G + 'STYLESHEETS: PASS') + X +
    '   ' + nPass + '/' + (nPass + nFail) + ' checks');
  console.log(D + 'PASS means the browser received every rule the file declares. It says nothing ' +
    'about whether the rules are right — only that none of them silently vanished.' + X);
  process.exit(nFail > 0 ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
