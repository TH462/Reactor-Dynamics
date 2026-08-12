/*
 * verify_flags_ui.js — what the feature flags actually DO to the shipped UI (#241).
 *
 * run_flags.js proves the registry is complete and the resolver answers correctly.
 * Neither says the control room OBEYS it — and every defect found while building
 * this was on that side of the line: a Features row that stayed on screen because
 * `.set-row { display: flex }` beats the `hidden` attribute (the DOM property read
 * back true the whole time), and a second entry point to checklists in the
 * instructor card that the first pass never gated.
 *
 * So this drives the real page. It asserts VISIBILITY, not element properties —
 * "the button is not on screen" is the claim that matters, and it is the one the
 * property check got wrong.
 *
 * Three builds are exercised:
 *   dev      — the repo as it stands: everything offered, Features panel present
 *   public   — RD_CHANNEL pinned to 'public', i.e. exactly what `main` deploys
 *   override — the same public build with ?flags= / the panel, the routes the
 *              owner uses to inspect a gated feature on the live site
 *
 * Run: node test/verify_flags_ui.js
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
var SHELL = 'file:///' + path.join(ROOT, 'ui', 'shell.html').replace(/\\/g, '/');
var LANDING = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

var pass = 0, fail = 0;
var C = { red: '[31m', green: '[32m', dim: '[2m', bold: '[1m', off: '[0m' };
function ck(name, ok, detail) {
  ok ? pass++ : fail++;
  console.log((ok ? C.green + 'PASS' : C.red + 'FAIL') + C.off + '  ' + name +
    (ok || detail == null ? '' : C.dim + '   -> ' + detail + C.off));
}

// Pin RD_CHANNEL before site/channel.js loads: a non-writable property makes the
// stamp file's plain assignment a silent no-op, which is how a production build
// is reproduced without editing a tracked file.
function pinChannel(ch) {
  return 'Object.defineProperty(window, "RD_CHANNEL", { value: ' + JSON.stringify(ch) +
    ', writable: false, configurable: false });';
}

(async function () {
  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });

  // The first-run hook is a modal that eats clicks. Hide it (rather than pressing
  // Skip, which would persist hook_done) once its own assertion is made.
  /* Settings is a MODAL since #439, and the Features row lives inside it. Everything
   * below that asks "is Features offered on this channel?" must therefore open Settings
   * first — otherwise `isVisible('#featureRow')` is false because the modal is shut, and
   * the check passes its public half for the wrong reason while its dev half fails. That
   * is the vacuous-guard failure this very file's comments record twice already; a
   * visibility probe that cannot tell "gated off" from "not on screen" is not measuring
   * the flag any more. */
  async function openSettings(page) {
    if (await page.isVisible('#settingsOverlay')) return;
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsOverlay', { state: 'visible' });
  }
  async function closeSettings(page) {
    if (await page.isVisible('#settingsOverlay')) await page.click('#settingsClose');
  }
  // #missionBtn is gone with the Operate tab (#439). The session bar in the header is the
  // shipped entry point to this window now — and was already one before, so this is the
  // path a player takes, not a test-only door.
  async function openMission(page, tab) {
    var open = await page.evaluate(function () { return !document.getElementById('missionOverlay').hidden; });
    if (!open) await page.click('#simStatus');
    await page.click('[data-mmode="' + tab + '"]');
    return (await page.textContent('#mpContent')) || '';
  }
  async function build(channel, url) {
    var ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (channel) await ctx.addInitScript(pinChannel(channel));
    var page = await ctx.newPage();
    await page.goto(url || SHELL);
    await page.waitForSelector('#simStatus');
    // CLOSE THE PLANT & MISSION WINDOW, which is up on load since 2026-08-11. It covers the
    // board and intercepts every click this file then makes. (It replaced the selection
    // screen that used to be dismissed here; that overlay no longer exists.)
    //
    // Dismissed the way a PLAYER dismisses it rather than by adding a deep-link param to
    // the URL — a deep link would work and would mean this file tests a boot path no
    // visitor takes, which is the shape HR10 warns about.
    if (await page.isVisible('#missionOverlay')) await page.click('#missionClose');
    return { ctx: ctx, page: page };
  }

  // ------------------------------------------------------- the dev build
  var b = await build(null);
  ck('dev: build reports the dev channel', await b.page.evaluate(function () { return RD.Flags.baseChannel(); }) === 'dev');
  // RETIRED (owner ruling, 2026-07-30: the training campaign help copy "is being removed
  // and replaced with something else… going to open with a short tour instead", and the
  // campaign is being closely owner-directed). bf41f67 deleted #hookPrompt and the "start
  // the training campaign" help copy, so TWO PAIRED GUARDS lost their subject:
  //   dev "first-run hook IS offered"       + public "first-run hook is NOT offered"
  //   dev "help guide promises the campaign" + public "no longer promises the campaign"
  // In each pair the dev half FAILED and the public half went VACUOUS — passing because its
  // pattern no longer appears anywhere, which is how a deleted test passes. Third and fourth
  // instance of that in this one file today: it is a structural weakness of paired flag
  // guards, not bad luck. Retired rather than re-pointed at #tourOverlay, because the tour
  // carries NO data-flag — it shows on BOTH channels, so the channel distinction these
  // guarded no longer exists. Re-point them only if the tour is deliberately gated later.
  await openSettings(b.page);
  ck('dev: Features row is offered', await b.page.isVisible('#featureRow'));
  await closeSettings(b.page);
  // The picker lives on the CHECKLISTS tab, and the Instructor became the leftmost and
  // default tab on 2026-08-11 — so this has to select the tab a player would select. It
  // checked a pane that simply was not the one on screen.
  await b.page.click('#tabbar [data-tab="checklists"]');
  ck('dev: the checklist picker is offered', await b.page.isVisible('#instrCklRow'));
  var camp = await openMission(b.page, 'campaign');
  ck('dev: campaign lists its missions', /Act I/.test(camp) && !/COMING SOON/.test(camp), camp.slice(0, 60));
  ck('dev: campaign missions are startable',
    (await b.page.$$('#mpContent [data-camp-start]')).length > 20);
  ck('dev: scenarios are listed', /Welcome to the Control Room/.test(await openMission(b.page, 'scenarios')));
  var walk = await openMission(b.page, 'walkthroughs');
  ck('dev: walkthroughs listed with checklist buttons',
    /Follow/.test(walk) && (await b.page.$$('#mpContent [data-checklist]')).length > 0);
  await b.ctx.close();

  // ------------------------------------ the public build (what `main` deploys)
  b = await build('public');
  ck('public: build reports the public channel', await b.page.evaluate(function () { return RD.Flags.baseChannel(); }) === 'public');
  await openSettings(b.page);
  ck('public: Features row is not on screen', !(await b.page.isVisible('#featureRow')));
  await closeSettings(b.page);
  ck('public: the checklist picker is not on screen', !(await b.page.isVisible('#instrCklRow')));
  var help = await b.page.textContent('#helpOverlay');
  ck('public: free play is still offered', /Start Free Play/.test(await openMission(b.page, 'free')));
  var tabs = ['campaign', 'scenarios', 'walkthroughs'];
  for (var i = 0; i < tabs.length; i++) {
    var t = await openMission(b.page, tabs[i]);
    ck('public: ' + tabs[i] + ' says COMING SOON', /COMING SOON/.test(t), t.slice(0, 70));
    ck('public: ' + tabs[i] + ' offers nothing to start',
      (await b.page.$$('#mpContent .btn, #mpContent [data-camp-start], #mpContent [data-trstart]')).length === 0);
  }
  // The manual keeps its PROSE — only the instructed experiences are gated.
  await b.page.click('#missionClose');
  await b.page.click('#manualBtn');
  ck('public: the manual still opens', await b.page.isVisible('#manualOverlay'));
  ck('public: manual has no Follow / Checklist buttons',
    (await b.page.$$('#manualContent [data-follow], #manualContent [data-checklist]')).length === 0);
  ck('public: manual prose is still there',
    ((await b.page.textContent('#manualContent')) || '').length > 200);
  await b.ctx.close();

  // ------------------------------- the routes back in on a public build
  b = await build('public', SHELL + '?flags=1');
  await openSettings(b.page);
  ck('public + ?flags=1: the Features panel is reachable', await b.page.isVisible('#featureRow'));
  await closeSettings(b.page);
  await b.ctx.close();

  b = await build('public', SHELL + '?flags=%2Bcampaign');
  // Area and item flags are independent by design: opening the area alone offers
  // nothing, because every mission inside it is still gated on its own entry.
  ck('public + ?flags=+campaign: the area alone offers no gated mission',
    /COMING SOON/.test(await openMission(b.page, 'campaign')));
  await b.ctx.close();

  b = await build('public', SHELL + '?flags=all');
  var all = await openMission(b.page, 'campaign');
  ck('public + ?flags=all: the campaign opens in full', /Act I/.test(all) && !/COMING SOON/.test(all));
  ck('public: a URL override is never persisted',
    await b.page.evaluate(function () { return localStorage.getItem('rd_flags'); }) === null);
  await b.ctx.close();

  // ------------------------------------ each AREA flag, in isolation
  // Every tab is defended twice — by its area flag and by its items — so with
  // everything else on, only the area flag can still be closing it. Without
  // these, deleting an area check goes unnoticed: the item gates cover for it
  // until the day the owner vets a whole list, and then the area leaks.
  var AREAS = [
    { flag: 'campaign', tab: 'campaign' },
    { flag: 'scenarios', tab: 'scenarios' },
    { flag: 'walkthroughs', tab: 'walkthroughs' },
  ];
  for (var a = 0; a < AREAS.length; a++) {
    b = await build('public', SHELL + '?flags=all,-' + AREAS[a].flag);
    ck('only ' + AREAS[a].flag + ' off (everything else on): the tab still says COMING SOON',
      /COMING SOON/.test(await openMission(b.page, AREAS[a].tab)));
    await b.ctx.close();
  }
  // checklists is not a tab: with it off, walkthroughs still list and still
  // Follow — only the 📋 buttons and the instructor picker go.
  b = await build('public', SHELL + '?flags=all,-checklists');
  var wt = await openMission(b.page, 'walkthroughs');
  ck('only checklists off: walkthroughs still list and still Follow',
    /Follow/.test(wt) && !/COMING SOON/.test(wt));
  ck('only checklists off: no 📋 buttons on them',
    (await b.page.$$('#mpContent [data-checklist]')).length === 0);
  await b.page.click('#missionClose');
  ck('only checklists off: the instructor picker is gone', !(await b.page.isVisible('#instrCklRow')));
  await b.ctx.close();

  // ---------------------------------------------- the panel drives the app
  b = await build(null);
  await openSettings(b.page);
  await b.page.click('#featureBtn');
  ck('panel: lists every registered flag',
    (await b.page.$$('.fl-row')).length === await b.page.evaluate(function () { return RD.Flags.ids().length; }));
  await b.page.click('[data-flid="campaign"]');
  ck('panel: a toggle writes an override', await b.page.evaluate(function () { return RD.Flags.on('campaign'); }) === false);
  await b.page.click('#featureClose');
  await closeSettings(b.page);      // Features opens from inside Settings, which is still up
  ck('panel: the mission window follows it', /COMING SOON/.test(await openMission(b.page, 'campaign')));
  await b.page.click('#missionClose');
  await openSettings(b.page);
  await b.page.click('#featureBtn');
  await b.page.click('[data-flreset="1"]');
  ck('panel: clearing restores the shipped answer', await b.page.evaluate(function () { return RD.Flags.on('campaign'); }) === true);
  await b.page.click('[data-flch="public"]');
  await b.page.click('#featureClose');
  await closeSettings(b.page);
  ck('panel: view-as public gates the campaign', /COMING SOON/.test(await openMission(b.page, 'campaign')));
  await b.page.reload();
  await b.page.waitForSelector('#simStatus');
  if (await b.page.isVisible('#missionOverlay')) await b.page.click('#missionClose');
  ck('panel: view-as survives a reload', await b.page.evaluate(function () { return RD.Flags.channel(); }) === 'public');
  ck('panel: the build still knows what it is', await b.page.evaluate(function () { return RD.Flags.baseChannel(); }) === 'dev');
  await openSettings(b.page);
  ck('panel: the way back is still on screen', await b.page.isVisible('#featureRow'));
  await closeSettings(b.page);
  await b.ctx.close();

  // ----------------------------------------------------- the landing page
  var ctx = await browser.newContext();
  var page = await ctx.newPage();
  await page.goto(LANDING);
  ck('landing dev: the campaign promise stands', /Guided\s+training/.test(await page.textContent('.hero .sub')));
  await ctx.close();

  ctx = await browser.newContext();
  await ctx.addInitScript(pinChannel('public'));
  page = await ctx.newPage();
  await page.goto(LANDING);
  ck('landing public: the hero no longer promises campaigns',
    !/Guided\s+training/.test(await page.textContent('.hero .sub')));
  ck('landing public: the feature block says coming soon',
    /Guided\s+training\s+—\s+coming soon/.test(await page.textContent('.features')));
  // REMOVED (#263 item 6): this was `!/The full experience/` on the PWR card, and the
  // phrase has not existed anywhere in the site since the card was rewritten — so the
  // check could never fail. Second vacuous negative in this file; the other was the hero
  // one three lines up. Do not re-add it: the card carries no `data-flag` any more, so it
  // makes no channel-dependent promise to guard, and the over-promise guard now lives
  // where the promise does — the hero negative above and the features coming-soon check.
  // A negative assertion is only worth its line if the pattern still appears SOMEWHERE.
  ck('landing public: the page still sells the plant',
    /Real reactor physics/.test(await page.textContent('.hero .sub')));
  await ctx.close();

  await browser.close();
  console.log('\n' + C.bold + '──────────────────────────────────────────' + C.off);
  console.log(C.bold + (fail ? C.red + 'FLAG UI: FAIL' : C.green + 'FLAG UI: PASS') + C.off +
    '   ' + pass + '/' + (pass + fail) + ' checks');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
