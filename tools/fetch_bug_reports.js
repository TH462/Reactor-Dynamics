#!/usr/bin/env node
/* fetch_bug_reports.js — read the in-sim bug reports out of R2.
 *
 *   node tools/fetch_bug_reports.js                 list every bundle, newest first
 *   node tools/fetch_bug_reports.js --latest        download the newest and summarise it
 *   node tools/fetch_bug_reports.js --all           download every bundle not already local
 *   node tools/fetch_bug_reports.js --get=<id>      one bundle, by id or by full key
 *   node tools/fetch_bug_reports.js --read=<path>   summarise a file already on disk (offline)
 *   node tools/fetch_bug_reports.js --out=<dir>     where downloads land (see below)
 *   node tools/fetch_bug_reports.js --full          the summary, plus every command and alarm
 *
 * Downloads land in `<repo>/../RD_Ops/bug-reports` when that folder exists (it is outside
 * every worktree, so a report cannot be committed), otherwise `<repo>/inbox/bug-reports`,
 * which is gitignored. A report carries a player's typed words — keep it out of the repo.
 *
 * ------------------------------------------------------------------ why this is a script
 * There is no way to LIST an R2 bucket from the command line. Both `RD_Ops/runbook.md` and
 * `worker/README.md` documented `wrangler r2 object list …` from the day the bucket was
 * created; that subcommand has never existed (wrangler 4.120.0 has `r2 object get/put/delete`
 * and nothing under `r2 bucket` that lists objects), so the documented retrieval path failed
 * the first time anyone tried it — 2026-08-10, on the owner's first real report. `r2 object
 * get` needs an exact key, and a key is `<base36 ms>-<8 random chars>`, so it cannot be
 * guessed. The reporter cannot supply it either: the Worker returns `{ok, id}` and
 * `site/telemetry.js` throws the id away.
 *
 * The REST API is shut too. `CLOUDFLARE_API_TOKEN` (the Analytics-read token
 * `tools/usage_report.js` uses) answers 403 on the R2 endpoints, and wrangler's own OAuth
 * token carries no `r2` scope either.
 *
 * So this reaches the bucket the one way that needs no new credential: it writes a
 * throwaway Worker to a temp directory, runs it under `wrangler dev --remote` — which binds
 * the REAL bucket into a locally-driven Worker — and calls `.list()` / `.get()` through it.
 * Nothing is deployed; wrangler's preview upload is torn down with the process.
 *
 * -------------------------------------------------------------------------------- traps
 *   - The bundle is NESTED. The stored object is the wire envelope
 *     `{v, kind:'session_bundle', note, bundle}` — `manifest`, `timeseries`, `events`,
 *     `commands`, `performance` and `snapshot_end` are one level down under `.bundle`, and
 *     the reporter's words are `.note` at the TOP. Both docs described the flat shape.
 *     The Dev tab's own download is the flat bundle with `.notes` (plural) instead; --read
 *     accepts either.
 *   - SNIFF the gzip, do not trust the extension — the Worker itself stores plain JSON when
 *     an edge has already decompressed the body (`worker/src/index.js`), and both spellings
 *     are in the bucket.
 *   - Killing wrangler needs the whole TREE on Windows (npx -> wrangler -> workerd). A bare
 *     child.kill() leaves the preview session running and the port held.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');

const BUCKET = 'reactor-dynamics-bundles';
const PREFIX = 'bundles/';
const READY_TIMEOUT_MS = 180000;   // a cold `wrangler dev --remote` uploads a preview first

const args = process.argv.slice(2);
const has = (f) => args.some((a) => a === f || a.startsWith(f + '='));
const val = (f, d) => { const a = args.find((x) => x.startsWith(f + '=')); return a ? a.slice(f.length + 1) : d; };

const C = process.stdout.isTTY
  ? { b: '\x1b[1m', d: '\x1b[2m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', c: '\x1b[36m', x: '\x1b[0m' }
  : { b: '', d: '', g: '', y: '', r: '', c: '', x: '' };

const REPO = path.resolve(__dirname, '..');

function outDir() {
  const explicit = val('--out', null);
  if (explicit) return path.resolve(explicit);
  const ops = path.resolve(REPO, '..', 'RD_Ops', 'bug-reports');
  if (fs.existsSync(path.dirname(ops))) return ops;
  return path.join(REPO, 'inbox', 'bug-reports');
}

// ---------------------------------------------------------------- units (US first)
const F = (c) => (c * 9 / 5 + 32);
const dF = (c) => (c * 9 / 5);                 // a DIFFERENCE converts with no offset
const psi = (mpa) => (mpa * 145.0377);
const tempF = (c) => c == null ? '—' : `${F(c).toFixed(1)} °F (${c.toFixed(1)} °C)`;
const spanF = (c) => c == null ? '—' : `${dF(c).toFixed(1)} °F (${c.toFixed(1)} °C)`;
const pressPsi = (mpa) => mpa == null ? '—' : `${psi(mpa).toFixed(0)} psi (${mpa.toFixed(2)} MPa)`;
const clock = (s) => {
  if (s == null) return '—';
  const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${t % 60}s`;
};

// ---------------------------------------------------------------- the temp reader Worker
const READER_SRC = `// Written by tools/fetch_bug_reports.js. Local dev only; never deployed.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (key) {
      const obj = await env.BUNDLES.get(key);
      if (!obj) return new Response('not found', { status: 404 });
      return new Response(obj.body, { headers: { 'Content-Type': 'application/octet-stream' } });
    }
    const out = [];
    let cursor;
    do {
      const page = await env.BUNDLES.list({ prefix: ${JSON.stringify(PREFIX)}, limit: 1000, cursor });
      for (const o of page.objects) out.push({ key: o.key, size: o.size, uploaded: o.uploaded });
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return Response.json({ objects: out });
  },
};
`;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // npx -> wrangler -> workerd. child.kill() reaps only the first of those, and the
    // preview session keeps running against the account.
    try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* best effort */ }
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { try { child.kill('SIGKILL'); } catch (e2) { /* gone */ } }
  }
}

async function get(port, query) {
  const res = await fetch(`http://127.0.0.1:${port}/${query}`);
  if (!res.ok) throw new Error(`reader returned ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Stand up the reader, hand `fn` a port, tear everything down. */
async function withReader(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-r2-reader-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), READER_SRC);
  fs.writeFileSync(path.join(dir, 'wrangler.toml'),
    'name = "rd-bug-report-reader"\nmain = "src/index.js"\ncompatibility_date = "2026-08-07"\n\n' +
    `[[r2_buckets]]\nbinding = "BUNDLES"\nbucket_name = "${BUCKET}"\n`);

  const port = await freePort();
  process.stderr.write(`${C.d}starting a temporary remote reader on 127.0.0.1:${port} …${C.x}\n`);

  // One command STRING, not (cmd, args[]) — `shell:true` with an args array is DEP0190, and
  // shell:true is not optional here: `npx` is `npx.cmd` on Windows and Node will not exec a
  // .cmd directly. Every part of the line is ours; `port` is a number from freePort().
  const child = spawn(`npx wrangler dev --remote --port ${port} --ip 127.0.0.1`, {
    cwd: dir, shell: true, detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  const cleanup = () => { killTree(child); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ } };
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  try {
    // Poll the port rather than parsing wrangler's banner — the banner wording moves and a
    // 200 is the only thing that actually proves the binding resolved.
    const deadline = Date.now() + READY_TIMEOUT_MS;
    for (;;) {
      if (child.exitCode !== null) throw new Error(`wrangler exited (${child.exitCode})\n${log.slice(-1500)}`);
      try { await get(port, '?ping=1'); break; } catch (e) { /* not up yet */ }
      if (Date.now() > deadline) throw new Error(`reader never became ready in ${READY_TIMEOUT_MS / 1000}s\n${log.slice(-1500)}`);
      await new Promise((r) => setTimeout(r, 700));
    }
    return await fn(port);
  } catch (e) {
    if (/login|credential|authenticat/i.test(log)) {
      console.error(`${C.r}wrangler is not logged in.${C.x} Run \`npx wrangler login\` yourself — it is\ninteractive, so an agent session cannot do it.`);
    }
    throw e;
  } finally {
    cleanup();
  }
}

// ---------------------------------------------------------------- reading a bundle
function parseBundle(buf) {
  const gz = buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b;   // sniff; see the header
  return JSON.parse((gz ? zlib.gunzipSync(buf) : buf).toString('utf8'));
}

/** Both shapes: the wire envelope from the in-sim report, and the Dev tab's flat download. */
function unwrap(doc) {
  if (doc && doc.bundle) return { note: doc.note || '', bundle: doc.bundle };
  return { note: (doc && (doc.notes || doc.note)) || '', bundle: doc };
}

/* Normalise the timeseries across both schema versions.
 *
 *   1.0  an array of row objects, `{ t, accel, true_<field>: … }`, ONE POINT SAMPLE PER
 *        BROADCAST and no extremes — so at 3600× a row is 180 s of plant and a whole LOCA
 *        can fall between two of them (#432, and the reason 1.1 exists).
 *   1.1  columnar, `{ fields, t, accel, v[], lo[], hi[] }`, sampled on the service's fine
 *        seam with MIN/MAX folded over each bucket.
 *
 * Returns `{ rows, fields, t, accel, at(field) -> {v, lo, hi} }` with lo/hi null on 1.0 —
 * null rather than a copy of `v`, because "no extremes were recorded" and "the value never
 * moved" are different facts and only one of them is true here.
 */
function series(bundle) {
  const raw = bundle && bundle.timeseries;
  if (!raw) return { rows: 0, fields: [], t: [], accel: [], extremes: false, at: () => null };

  if (Array.isArray(raw)) {                               // schema 1.0
    const fields = [];
    for (const r of raw) for (const k of Object.keys(r)) {
      if (k.startsWith('true_') && fields.indexOf(k.slice(5)) === -1) fields.push(k.slice(5));
    }
    return {
      rows: raw.length, fields, extremes: false,
      t: raw.map((r) => r.t), accel: raw.map((r) => r.accel),
      at: (f) => (fields.indexOf(f) === -1 ? null
        : { v: raw.map((r) => (r['true_' + f] == null ? null : r['true_' + f])), lo: null, hi: null }),
    };
  }

  const i = (f) => raw.fields.indexOf(f);                  // schema 1.1
  return {
    rows: raw.t.length, fields: raw.fields.slice(), extremes: !!(raw.lo && raw.hi),
    t: raw.t, accel: raw.accel,
    at: (f) => (i(f) === -1 ? null
      : { v: raw.v[i(f)], lo: raw.lo ? raw.lo[i(f)] : null, hi: raw.hi ? raw.hi[i(f)] : null }),
  };
}

function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  return s[s.length >> 1];
}

function summarise(doc, label) {
  const { note, bundle } = unwrap(doc);
  const m = (bundle && bundle.manifest) || {};
  const ev = (bundle && bundle.events) || [];
  const cmds = (bundle && bundle.commands) || [];
  const ts = series(bundle);
  const perf = bundle && bundle.performance;
  const full = has('--full');

  console.log(`\n${C.b}${label}${C.x}`);
  console.log(`${C.d}${'-'.repeat(Math.min(78, label.length + 8))}${C.x}`);
  console.log(`${C.c}${C.b}NOTE:${C.x} ${note ? C.b + note + C.x : C.d + '(none)' + C.x}`);

  console.log(`\n${C.b}Session${C.x}`);
  if (!bundle || !bundle.manifest) {
    // A bundle with no manifest is not a player report — the two smoke-test posts in the
    // bucket are 86 bytes of `{"hello":"world"}`. Say so instead of printing a row of "?".
    console.log(`  ${C.y}no manifest — this is not a session bundle${C.x} ${C.d}${JSON.stringify(bundle).slice(0, 120)}${C.x}\n`);
    return;
  }
  console.log(`  plant ${m.plant_id || '?'} · IC ${m.initial_state || '?'} · started "${m.session_start_reason || '?'}"` +
    (m.seed != null ? ` · seed ${m.seed}` : ''));
  if (m.scenario_id) console.log(`  scenario ${m.scenario_id}`);
  if (m.follow_procedure_id) console.log(`  following procedure ${m.follow_procedure_id}`);
  console.log(`  sim time ${clock(m.exported_sim_time)} (${(m.exported_sim_time || 0).toFixed(0)} s), exported ${bundle.exported_at || '?'}`);
  console.log(`  ${ts.rows} samples · ${ev.length} events · ${cmds.length} commands`);

  // SAMPLING, PRINTED EVERY TIME. The absence of exactly this line is what let #432 hide:
  // 211 rows over 6 h 21 m reads as a recording until you divide, and the manifest said
  // 1 Hz. The rate is DERIVED from the row timestamps here — never read out of the
  // manifest, which is the thing that was lying.
  {
    const d = [];
    for (let i = 1; i < ts.t.length; i++) d.push(ts.t[i] - ts.t[i - 1]);
    const med = median(d), lo = d.length ? Math.min(...d) : null, hi = d.length ? Math.max(...d) : null;
    // Graded on the WORST gap, not the median. Acceleration moves inside one session, so a
    // run that sat at 1× for most of its rows and at 3600× through the interesting part has
    // a reassuring median and a 360 s hole exactly where the answer was.
    const coarse = hi != null && hi > 10;
    const line = med == null ? 'one sample' : `every ${med.toFixed(1)} s typical` +
      (lo != null && (hi - lo) > 0.05 ? `, worst gap ${hi.toFixed(1)} s` : '');
    console.log(`\n${C.b}Sampling${C.x}`);
    console.log(`  ${coarse ? C.y : C.g}${line}${C.x} · ` +
      (ts.extremes ? `${C.g}min/max per bucket${C.x}` : `${C.y}point samples, NO extremes${C.x}`) +
      (m.sampling && m.sampling.source ? ` · source ${m.sampling.source}` : '') +
      ` · schema ${bundle.schema_version || '?'}`);
    if (!ts.extremes) {
      console.log(`  ${C.y}Pre-1.1 recording (#432): a transient shorter than the spacing above left NO mark.${C.x}`);
    }
  }

  if (perf) {
    const p = (o) => (o && typeof o.p95 === 'number') ? `${o.p95.toFixed(1)} ms p95` : '—';
    console.log(`\n${C.b}Client performance${C.x}`);
    const budget = typeof perf.budget_pct === 'number' ? perf.budget_pct.toFixed(1) : perf.budget_pct;
    console.log(`  ${perf.fps != null ? perf.fps.toFixed(1) + ' fps' : '—'} · render ${p(perf.render_ms)} · step ${p(perf.step_ms)} · budget ${budget} %`);
    if (perf.verdict) console.log(`  ${/healthy/i.test(perf.verdict) ? C.g : C.y}${perf.verdict}${C.x}`);
  }

  // Commands are the player's side of the story and there are rarely many. Speed changes
  // dominate the count and say nothing, so they collapse unless --full.
  const shown = full ? cmds : cmds.filter((c) => !(c.command && c.command.action === 'set_speed'));
  if (cmds.length) {
    const hid = cmds.length - shown.length;
    console.log(`\n${C.b}Commands${C.x}${hid ? C.d + `  (${hid} set_speed hidden — --full shows them)` + C.x : ''}`);
    for (const c of shown.slice(0, 60)) {
      const a = c.command || {};
      const rest = Object.keys(a).filter((k) => k !== 'action').map((k) => `${k}=${JSON.stringify(a[k])}`).join(' ');
      const flag = c.error ? `${C.r} ERROR${C.x}` : c.blocked ? `${C.y} BLOCKED${C.x}` : '';
      console.log(`  ${String(c.t.toFixed(1)).padStart(8)}s  ${a.action || '?'} ${C.d}${rest}${C.x}${flag}`);
    }
    if (shown.length > 60) console.log(`  ${C.d}… ${shown.length - 60} more${C.x}`);
  }

  // Events: the ones that mean something. Alarms CLEARING and the opening sweep of
  // "everything is clear" are noise — a fresh session emits one per alarm at t=0.1.
  const notable = ev.filter((e) => {
    if (e.type === 'alarm') return full ? true : /active/.test((e.detail && e.detail.state) || '');
    return true;
  });
  console.log(`\n${C.b}Events${C.x}${full ? '' : C.d + '  (alarms shown when they go active; --full shows clears too)' + C.x}`);
  for (const e of notable.slice(0, full ? 400 : 80)) {
    const d = e.detail || {};
    let line;
    if (e.type === 'alarm') line = `${C.y}alarm${C.x} ${d.id} -> ${d.state}`;
    else if (e.type === 'scram') line = `${C.r}${C.b}SCRAM${C.x} ${d.trip_reason || ''}`;
    else if (e.type === 'trip_reason') continue;                    // duplicates the scram line
    else if (e.type === 'time_rewind') line = `${C.c}rewind${C.x} to ${Number(d.to).toFixed(1)} s`;
    else line = `${e.type} ${JSON.stringify(d)}`;
    console.log(`  ${String(e.t.toFixed(1)).padStart(8)}s  ${line}`);
  }
  if (notable.length > (full ? 400 : 80)) console.log(`  ${C.d}… ${notable.length - (full ? 400 : 80)} more${C.x}`);

  // WHERE THE PLANT ACTUALLY WENT. On a 1.1 recording the extremes are the interesting part
  // — the widest bucket is where something happened fast, and on a fast-forwarded session
  // that is the only trace of it. Fields whose span never exceeds a percent of their own
  // range are steady and say nothing, so they stay out.
  if (ts.extremes && ts.rows > 1) {
    const spans = [];
    for (const f of ts.fields) {
      const c = ts.at(f); if (!c || !c.lo || !c.hi) continue;
      let wide = 0, at = null, lo = Infinity, hi = -Infinity;
      for (let i = 0; i < ts.rows; i++) {
        if (c.lo[i] == null || c.hi[i] == null) continue;
        if (c.lo[i] < lo) lo = c.lo[i];
        if (c.hi[i] > hi) hi = c.hi[i];
        if (c.hi[i] - c.lo[i] > wide) { wide = c.hi[i] - c.lo[i]; at = ts.t[i]; }
      }
      const range = hi - lo;
      if (range > 0 && wide > range * 0.02) spans.push({ f, wide, at, range });
    }
    spans.sort((a, b) => (b.wide / b.range) - (a.wide / a.range));
    if (spans.length) {
      console.log(`\n${C.b}Fastest movement${C.x}${C.d}  (widest single bucket — where a transient hid)${C.x}`);
      for (const s of spans.slice(0, 6)) {
        console.log(`  ${s.f.padEnd(24)} ${fmtField(s.f, s.wide, true).padStart(22)} within one bucket ${C.d}at t=${s.at.toFixed(0)} s${C.x}`);
      }
    }
  }

  if (ts.rows) {
    const lastOf = (f) => { const c = ts.at(f); return c ? c.v[c.v.length - 1] : null; };
    console.log(`\n${C.b}Where it ended${C.x}`);
    const row = (k, v) => console.log(`  ${k.padEnd(18)} ${v}`);
    const pw = lastOf('power_pct');
    row('power', pw != null ? `${pw.toFixed(2)} %` : '—');
    row('Tavg', tempF(lastOf('tavg_c')));
    row('Thot / Tcold', `${tempF(lastOf('thot_c'))} / ${tempF(lastOf('tcold_c'))}`);
    row('RCS pressure', pressPsi(lastOf('pressure_mpa')));
    row('steam pressure', pressPsi(lastOf('steam_pressure_mpa')));
    row('pzr / SG level', `${(lastOf('pzr_level_pct') || 0).toFixed(1)} % / ${(lastOf('sg_level_pct') || 0).toFixed(1)} %`);
    const s = bundle.snapshot_end && bundle.snapshot_end.engine && bundle.snapshot_end.engine.s;
    if (s) {
      if (typeof s.subcooling_c === 'number') row('subcooling', spanF(s.subcooling_c));
      if (typeof s.boron_ppm === 'number') row('boron', `${s.boron_ppm.toFixed(0)} ppm`);
      if (typeof s.decay_heat_pct === 'number') row('decay heat', `${s.decay_heat_pct.toFixed(2)} %`);
    }
  }
  console.log('');
}

// US customary first, per the standing directive. `isSpan` marks a DIFFERENCE — those convert
// ×9/5 with NO offset, which is the conversion that gets written wrong.
function fmtField(f, x, isSpan) {
  if (x == null) return '—';
  if (/_mpa$/.test(f)) return `${psi(x).toFixed(0)} psi (${x.toFixed(2)} MPa)`;
  if (/_c$/.test(f)) return isSpan ? `${dF(x).toFixed(1)} °F (${x.toFixed(1)} °C)` : `${F(x).toFixed(1)} °F (${x.toFixed(1)} °C)`;
  if (/_pct$/.test(f)) return `${x.toFixed(1)} %`;
  return x.toFixed(3);
}

// ---------------------------------------------------------------- commands
function localName(key) {
  // bundles/2026-08-10/msmiercb-46iji16v.json.gz  ->  2026-08-10_msmiercb-46iji16v.json
  const parts = key.split('/');
  const id = parts[parts.length - 1].replace(/\.json(\.gz)?$/, '');
  return `${parts[parts.length - 2]}_${id}.json`;
}

function save(dir, key, doc) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, localName(key));
  fs.writeFileSync(file, JSON.stringify(doc, null, 1));
  return file;
}

async function main() {
  if (has('--help') || has('-h')) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, ''));
    return;
  }

  const readPath = val('--read', null);
  if (readPath) {                                   // offline: no wrangler, no network
    const doc = parseBundle(fs.readFileSync(readPath));
    summarise(doc, path.basename(readPath));
    return;
  }

  const dir = outDir();
  const wanted = val('--get', null);

  await withReader(async (port) => {
    const listing = JSON.parse((await get(port, `?prefix=${encodeURIComponent(PREFIX)}`)).toString('utf8'));
    const objects = listing.objects.sort((a, b) => (a.uploaded < b.uploaded ? 1 : -1));   // newest first
    if (!objects.length) { console.log(`${C.y}No bug reports in ${BUCKET}.${C.x}`); return; }

    let pick = [];
    if (wanted) {
      pick = objects.filter((o) => o.key === wanted || o.key.includes(wanted));
      if (!pick.length) { console.error(`${C.r}No bundle matching "${wanted}".${C.x}`); process.exitCode = 1; return; }
    } else if (has('--latest')) {
      pick = objects.slice(0, 1);
    } else if (has('--all')) {
      pick = objects.filter((o) => !fs.existsSync(path.join(dir, localName(o.key))));
      if (!pick.length) console.log(`${C.g}All ${objects.length} report(s) already downloaded to ${dir}.${C.x}`);
    }

    if (!pick.length) {                             // the default: just list
      console.log(`\n${C.b}${objects.length} report(s) in ${BUCKET}${C.x}  ${C.d}(saved copies go to ${dir})${C.x}\n`);
      for (const o of objects) {
        const local = fs.existsSync(path.join(dir, localName(o.key)));
        console.log(`  ${o.uploaded.replace('T', ' ').slice(0, 19)}Z  ${String((o.size / 1024).toFixed(0) + ' KB').padStart(7)}  ` +
          `${o.key}  ${local ? C.g + '[local]' + C.x : C.d + '[remote only]' + C.x}`);
      }
      console.log(`\n${C.d}--latest to pull the newest · --all to pull everything new · --get=<id> for one${C.x}\n`);
      return;
    }

    for (const o of pick) {
      const doc = parseBundle(await get(port, `?key=${encodeURIComponent(o.key)}`));
      const file = save(dir, o.key, doc);
      summarise(doc, `${o.key}  ${C.d}(${(o.size / 1024).toFixed(0)} KB gz, uploaded ${o.uploaded})${C.x}`);
      console.log(`${C.g}saved${C.x} ${file}\n`);
    }
  });
}

main().catch((e) => { console.error(`${C.r}${e.message || e}${C.x}`); process.exit(2); });
