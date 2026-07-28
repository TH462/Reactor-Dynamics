/*
 * flags.js — feature flags: what the public website OFFERS vs what is still
 * being vetted on `develop` (GitHub #241).
 *
 * The problem this solves: content ships in one bundle with the sim, so a
 * half-checked scenario or campaign mission is live the moment `develop` merges
 * to `main`. This lets a feature be finished-in-the-build but not-yet-offered:
 * it stays fully playable on the development channel while the public site shows
 * a "coming soon" panel in its place, until the owner has personally played it
 * through and flips one line here.
 *
 * ---- how a flag resolves ------------------------------------------------
 *   1. an explicit override (the in-app Features panel / ?flags=) wins outright
 *   2. stage 'public'  → on, everywhere
 *   3. stage 'off'     → off, everywhere
 *   4. otherwise ('preview', or an id nobody registered) → on unless the
 *      channel is 'public'
 *
 * Unregistered ids therefore fail CLOSED on the public site: new content is
 * invisible to visitors until someone writes it down here. test/run_flags.js
 * turns that into a gate failure rather than a surprise — it fails when a
 * scenario, procedure or campaign mission exists with no entry below, and when
 * an entry exists for content that has been renamed or deleted.
 *
 * The CHANNEL comes from site/channel.js, stamped at deploy time from Vercel's
 * environment (production = `main` = 'public', preview = `develop`). Nothing
 * here is hand-edited per branch — a `develop → main` merge carries the same
 * file and gets a different answer, which is the whole point.
 *
 * ---- gating is not secrecy ---------------------------------------------
 * Gated content is still IN the bundle and still reachable by anyone who
 * overrides a flag by hand (that is how the owner checks a preview feature on
 * the live site). This hides unfinished work from the ordinary visitor; it is
 * not an access control, and must never be used as one.
 *
 * Loaded as a plain global-namespace script (CLAUDE.md, "Code conventions"):
 * browser via <script> in index.html + ui/shell.html, Node via require() in
 * test/run_flags.js. It touches window/localStorage only behind guards so the
 * Node load is clean.
 */
;(function (RD) {
  'use strict';
  var G = globalThis;

  var CHANNELS = ['public', 'preview', 'dev'];
  var STAGES = ['public', 'preview', 'off'];

  // ================================================================= registry
  // AREAS — whole features. The UI asks about these to decide whether a tab
  // shows its content or a "coming soon" panel, so each one that can be gated
  // carries the sentence a visitor reads in its place.
  var AREAS = {
    free_play: {
      label: 'Free Play',
      stage: 'public',
      desc: 'The plant with no script: every start condition, every control live.',
    },
    manual: {
      label: "Operator's manual",
      stage: 'public',
      desc: 'The commercial-format manual set, alarm response and reference data.',
    },
    campaign: {
      label: 'Training campaign',
      stage: 'preview',
      desc: 'The guided act-by-act progression (Plant & Mission → Campaign).',
      soon: 'The training campaign is in final review — every mission is being played end to end before it ships. Free Play and the operator\'s manual are open in the meantime.',
    },
    scenarios: {
      label: 'Scenarios',
      stage: 'preview',
      desc: 'Instructor-led situations, one lesson each (Plant & Mission → Scenarios).',
      soon: 'Instructor-led scenarios are in final review — each one is being played through before it ships. Free Play and the operator\'s manual are open in the meantime.',
    },
    walkthroughs: {
      label: 'Procedure walkthroughs',
      stage: 'preview',
      desc: 'Follow-in-Instructor: a real procedure, step-gated off the instruments.',
      soon: 'Guided procedure walkthroughs are in final review. The procedures themselves are readable now in the operator\'s manual.',
    },
    checklists: {
      label: 'Live checklists',
      stage: 'preview',
      desc: 'The passive 📋 checklist: a procedure ticked off against the plant as it sits.',
      soon: 'Live checklists are in final review. The procedures themselves are readable now in the operator\'s manual.',
    },
  };

  // ITEMS — one entry per piece of playable content, `kind:id`. `kind` matters:
  // pwr_tmi is BOTH a scenario and a narrative procedure.
  //
  // Everything below is 'preview' as of 2026-07-28 by owner decision (#241):
  // "Most of the training campaign and scenarios and even the checklist I
  // haven't checked so I consider them placeholders until I have gone through
  // them". Flip an entry to 'public' as it is played through and accepted —
  // that is the vetting record. Titles are NOT duplicated here; the Features
  // panel reads them off the artifacts (single source of truth).
  var ITEMS = {
    // ---- PWR scenarios ----
    'scenario:pwr_hook': 'preview',
    'scenario:pwr_tour': 'preview',
    'scenario:pwr_chain_reaction': 'preview',
    'scenario:pwr_feedback': 'preview',
    'scenario:pwr_xenon': 'preview',
    'scenario:pwr_boron': 'preview',
    'scenario:pwr_startup_challenge': 'preview',
    'scenario:pwr_feed_pump': 'preview',
    'scenario:pwr_rod_auto': 'preview',
    'scenario:pwr_load_follow': 'preview',
    'scenario:pwr_automation': 'preview',
    'scenario:pwr_shift_exam': 'preview',
    'scenario:pwr_mode5_to_mode3': 'preview',
    'scenario:pwr_mode3_to_mode5': 'preview',
    'scenario:pwr_return_to_mode1': 'preview',
    'scenario:pwr_protection': 'preview',
    'scenario:pwr_esf': 'preview',
    'scenario:pwr_lof': 'preview',
    'scenario:pwr_slb': 'preview',
    'scenario:pwr_msiv': 'preview',
    'scenario:pwr_sg_flood': 'preview',
    'scenario:pwr_tmi': 'preview',
    'scenario:pwr_tmi2_p1': 'preview',
    'scenario:pwr_tmi2_p2': 'preview',
    'scenario:pwr_tmi2_p3': 'preview',
    'scenario:pwr_qualify': 'preview',
    // ---- PWR procedures (walkthrough + checklist) ----
    'procedure:pwr_heatup': 'preview',
    'procedure:pwr_startup': 'preview',
    'procedure:pwr_raise_power': 'preview',
    'procedure:pwr_lower_power': 'preview',
    'procedure:pwr_pressure_control': 'preview',
    'procedure:pwr_sg_level': 'preview',
    'procedure:pwr_shutdown': 'preview',
    'procedure:pwr_loss_of_feedwater': 'preview',
    'procedure:pwr_rcp_trip': 'preview',
    'procedure:pwr_stuck_porv': 'preview',
    'procedure:pwr_tmi': 'preview',
    // ---- RBMK (plant on hold; its control room is not built) ----
    'scenario:rbmk_tour': 'preview',
    'scenario:rbmk_void': 'preview',
    'scenario:rbmk_ar': 'preview',
    'scenario:rbmk_chernobyl': 'preview',
    'scenario:rbmk_az5_fixed': 'preview',
    'procedure:rbmk_startup': 'preview',
    'procedure:rbmk_raise_power': 'preview',
    'procedure:rbmk_shutdown': 'preview',
    'procedure:rbmk_mcp_trip': 'preview',
    'procedure:rbmk_chernobyl': 'preview',
    // ---- BWR (plant on hold; its control room is not built) ----
    'scenario:bwr_tour': 'preview',
    'scenario:bwr_recirc': 'preview',
    'scenario:bwr_isolation': 'preview',
    'scenario:bwr_fukushima': 'preview',
    'scenario:bwr_qualify': 'preview',
    'procedure:bwr_startup': 'preview',
    'procedure:bwr_raise_power': 'preview',
    'procedure:bwr_shutdown': 'preview',
    'procedure:bwr_sbo_rcic': 'preview',
    'procedure:bwr_fukushima': 'preview',
  };

  // Merged, normalised registry: id -> { id, kind, stage, label?, desc?, soon? }
  var REG = {};
  Object.keys(AREAS).forEach(function (id) {
    var a = AREAS[id];
    REG[id] = { id: id, kind: 'area', stage: a.stage, label: a.label, desc: a.desc, soon: a.soon || null };
  });
  Object.keys(ITEMS).forEach(function (id) {
    REG[id] = { id: id, kind: id.split(':')[0], stage: ITEMS[id], soon: null };
  });

  // ================================================================== channel
  function search() { try { return (G.location && G.location.search) || ''; } catch (e) { return ''; } }
  function ls() { try { return G.localStorage || null; } catch (e) { return null; } }
  function readJson(key) {
    var s = ls(); if (!s) return null;
    try { return JSON.parse(s.getItem(key)); } catch (e) { return null; }
  }
  function writeJson(key, val) {
    var s = ls(); if (!s) return;
    try { if (val == null) s.removeItem(key); else s.setItem(key, JSON.stringify(val)); } catch (e) { /* no persistence */ }
  }
  function valid(ch) { return CHANNELS.indexOf(ch) !== -1 ? ch : null; }

  var K_OV = 'rd_flags';        // { id: true|false } — persistent, set from the panel
  var K_VIEW = 'rd_flags_view'; // "public" | "preview" | "dev" — persistent "view as"

  // The channel this build was stamped with — what a visitor actually gets.
  function baseChannel() { return valid(G.RD_CHANNEL) || 'dev'; }

  // ?channel=public is the one-page-load form (screenshots, harnesses); the
  // panel's "view as" is the persistent one. Both exist to answer the question
  // that matters before a release: what does the public actually see?
  var urlChannel = (function () { var m = /[?&]channel=([a-z]+)/.exec(search()); return m ? valid(m[1]) : null; })();
  function channel() { return urlChannel || valid(readJson(K_VIEW)) || baseChannel(); }
  function viewAs(ch) { writeJson(K_VIEW, valid(ch)); }

  // ================================================================ overrides
  // ?flags=+campaign,-scenario:pwr_tour — this page load only, never persisted,
  // so a deep link used for a screenshot cannot quietly reconfigure the browser.
  var urlOv = (function () {
    var m = /[?&]flags=([^&]*)/.exec(search());
    var out = {};
    if (!m) return out;
    decodeURIComponent(m[1]).split(',').forEach(function (tok) {
      tok = tok.trim(); if (!tok) return;
      if (tok === 'all') { out['*'] = true; return; }
      if (tok === 'none') { out['*'] = false; return; }
      var on = tok.charAt(0) !== '-';
      out[tok.replace(/^[+-]/, '')] = on;
    });
    return out;
  })();

  function saved() { var o = readJson(K_OV); return (o && typeof o === 'object') ? o : {}; }
  function override(id) {
    if (Object.prototype.hasOwnProperty.call(urlOv, id)) return !!urlOv[id];
    if (Object.prototype.hasOwnProperty.call(urlOv, '*')) return !!urlOv['*'];
    var s = saved();
    return Object.prototype.hasOwnProperty.call(s, id) ? !!s[id] : null;
  }
  function setOverride(id, val) {
    var s = saved();
    if (val == null) delete s[id]; else s[id] = !!val;
    writeJson(K_OV, Object.keys(s).length ? s : null);
  }
  function clearOverrides() { writeJson(K_OV, null); writeJson(K_VIEW, null); }

  // ================================================================= resolve
  function stage(id) { return REG[id] ? REG[id].stage : null; }

  function on(id) {
    var ov = override(id);
    if (ov != null) return ov;
    var st = stage(id);
    if (st === 'public') return true;
    if (st === 'off') return false;
    return channel() !== 'public';   // 'preview' and unregistered ids
  }

  // Convenience for the UI: content is offered only when BOTH its own entry and
  // the area that lists it are on. Kept explicit at the call sites for areas
  // that overlap (a campaign mission is gated by `campaign`, not `scenarios`).
  function onItem(kind, id) { return on(kind + ':' + id); }

  // ============================================================ DOM helper
  // Static pages (index.html) mark copy that promises a gated feature:
  //   <p data-flag="campaign" data-flag-off="…alternate sentence…">
  //   <div data-flag="campaign"></div>            ← hidden outright when off
  // Called once on load; there is nothing dynamic about a landing page.
  function applyDom(root) {
    var d = root || (G.document || null);
    if (!d || !d.querySelectorAll) return;
    var els = d.querySelectorAll('[data-flag]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (on(el.getAttribute('data-flag'))) continue;
      var alt = el.getAttribute('data-flag-off');
      if (alt != null) el.textContent = alt; else el.hidden = true;
    }
  }

  RD.FLAG_REGISTRY = REG;
  RD.Flags = {
    CHANNELS: CHANNELS,
    STAGES: STAGES,
    channel: channel,
    baseChannel: baseChannel,
    viewAs: viewAs,
    registry: function () { return REG; },
    entry: function (id) { return REG[id] || null; },
    ids: function () { return Object.keys(REG); },
    stage: stage,
    on: on,
    onItem: onItem,
    soon: function (id) { return (REG[id] && REG[id].soon) || 'This part of the simulator is still in review — it will open here when it is ready.'; },
    override: override,
    setOverride: setOverride,
    overrides: saved,
    // What ?flags= put in front of everything else this page load. The panel
    // says so: a URL override outranks its switches, and a switch that appears
    // not to work is worse than one that explains itself.
    urlOverrides: function () { return urlOv; },
    clearOverrides: clearOverrides,
    applyDom: applyDom,
  };

})(globalThis.RD || (globalThis.RD = {}));
