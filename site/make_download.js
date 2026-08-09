/* Vercel build step: produce the offline download the site links to.
 *
 *   dist/Reactor_Dynamics_<version>.html   (tools/make_portable.js)
 *      -> download/Reactor_Dynamics_<version>.zip
 *
 * WHY THIS RUNS AT DEPLOY AND IS NOT COMMITTED (#258). The portable build is a
 * generated artifact: `dist/` is gitignored, so before this existed the only copy that
 * existed anywhere was whatever the last person to run the command happened to produce,
 * and nothing regenerated it at a release. The failure mode is the worst kind — a file
 * that downloads fine and is silently several versions behind the site it came from.
 * Building it in the deploy means it cannot be stale: every deployed site carries the
 * download built from that exact commit.
 *
 * WHY A ZIP. `make_portable.js` says it plainly: several mail providers silently strip
 * or quarantine .html attachments and the recipient sees nothing at all. A zip also
 * stops the browser rendering the file instead of saving it.
 *
 * WHY NO DEPENDENCY. This repo has no runtime dependencies and no build step beyond
 * these two scripts, and adding a zip library for one file would be the first. Node's
 * zlib does DEFLATE, which is the compression ZIP actually uses, so the container is
 * ~60 lines of header writing. The HTML is mostly source text and compresses about 5x.
 *
 * Kept under site/ (not tools/) for the same reason as stamp_version.js: .vercelignore
 * still ships it at build time.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'download');

function release() {
  const src = fs.readFileSync(path.join(ROOT, 'site', 'release.js'), 'utf8');
  const m = /RD_RELEASE\s*=\s*"([^"]+)"/.exec(src);
  return m ? m[1] : 'Alpha';
}

// The date the CURRENT release was published, taken from the newest changelog.html
// entry rather than from the clock. Deliberate: a build-time `new Date()` would
// re-date the download on every redeploy, so a visitor comparing "the download says
// today" against a release that shipped a week ago would be told the wrong thing —
// and the file would differ between two deploys of the same commit. run_release.js
// already pins that entry's date against CHANGELOG.md, so this inherits a gated
// number instead of inventing one. Comments are stripped first for the same reason
// run_release.js strips them: the ADDING AN ENTRY template contains a specimen date.
function releaseDate() {
  const src = fs.readFileSync(path.join(ROOT, 'changelog.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');
  const m = /datetime="(\d{4}-\d{2}-\d{2})"/.exec(src);
  return m ? m[1] : null;
}

// Both values come from the files stamp_version.js writes, which vercel.json /
// the Pages build command run FIRST. Read defensively: a local `node
// site/make_download.js` in a fresh clone has the repo placeholders, not a stamp.
function stamped(file, re, fallback) {
  try {
    const m = re.exec(fs.readFileSync(path.join(ROOT, 'site', file), 'utf8'));
    return m ? m[1] : fallback;
  } catch (e) { return fallback; }
}

// ---- THE ONE PLACE THE DOWNLOAD IS NAMED (#414) ---------------------------------
// OFF THE RELEASED CHANNEL THE NAME CARRIES THE COMMIT. Until 2026-08-09 a tester
// downloading from dev.reactordynamics.com got `Reactor_Dynamics_Alpha_1.5.1.zip` —
// same product, same version string, DIFFERENT BYTES from the release of that name,
// and indistinguishable from it once it is sitting in a downloads folder. "The
// download is broken" then arrives with nothing to say which build produced it. That
// is #275's defect (`latest.zip` identifies nothing) re-created one level up.
//
// THIS FUNCTION IS THE ONLY DERIVATION, and that is the point. It used to be spelled
// out twice — here and in site/nav.js, which stamps the button's `download=`
// attribute — with test/run_portable.js pinning three static literals against each
// other. Those literals would have stayed identical while a suffix was added to one
// side, so the gate could not have seen the very drift it existed to catch. nav.js
// now takes the name from `download/manifest.js` below, which this script writes in
// the same run as the zip: the offered name IS the built name, by construction rather
// than by comparison *(OWNER RULING, 2026-08-09, choosing "Transport it" over deriving
// the name twice — the wording of the option is mine, the decision is the owner's)*.
// run_portable.js requires this function and pins the rule as behaviour.
//
// The .html INSIDE the zip is named the same way *(OWNER RULING, 2026-08-09, choosing
// "suffix both" over the zip alone — again my wording, their call)* — otherwise the
// collision simply survives one unzip.
// Note that is the ARCHIVE ENTRY name, chosen here; the file on disk that
// tools/make_portable.js builds into dist/ keeps the plain release name.
//
// `sha || channel` so a local checkout still says something: site/version.js reads
// "alpha · dev" there and carries no commit, so the tag becomes `_dev` rather than
// silently producing the released name on a machine that is not the release.
function downloadName(release, channel, sha, ext) {
  const safe = String(release).replace(/[^A-Za-z0-9.]+/g, '_');
  const tag = channel === 'public' ? ''
    : '_' + String(sha || channel).replace(/[^A-Za-z0-9]+/g, '_');
  return 'Reactor_Dynamics_' + safe + tag + ext;
}

// ---- minimal ZIP writer (single file, DEFLATE) ----------------------------------
// CRC-32, the one checksum ZIP requires and Node does not expose.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function zipOne(name, data) {
  const nameBuf = Buffer.from(name, 'utf8');
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  // DOS timestamp is deliberately fixed: a changing mtime would make the artifact
  // differ byte-for-byte between deploys of the same commit for no reason.
  const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);   // local file header
  local.writeUInt16LE(20, 4);           // version needed
  local.writeUInt16LE(0, 6);            // flags
  local.writeUInt16LE(8, 8);            // method: deflate
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // central directory header
  central.writeUInt16LE(20, 4);         // version made by
  central.writeUInt16LE(20, 6);         // version needed
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);         // extra
  central.writeUInt16LE(0, 32);         // comment
  central.writeUInt16LE(0, 34);         // disk
  central.writeUInt16LE(0, 36);         // internal attrs
  central.writeUInt32LE(0, 38);         // external attrs
  central.writeUInt32LE(0, 42);         // offset of local header

  const centralSize = central.length + nameBuf.length;
  const centralOffset = local.length + nameBuf.length + deflated.length;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);     // end of central directory
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);              // entries on this disk
  end.writeUInt16LE(1, 10);             // entries total
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);             // comment length

  return Buffer.concat([local, nameBuf, deflated, central, nameBuf, end]);
}

// ---- build ----------------------------------------------------------------------
// The body is left at its original indentation on purpose (#414): it used to run at
// module scope and was wrapped, unchanged, so that requiring this file has no side
// effects. Re-indenting it would have turned a four-line semantic diff into a
// hundred-line whitespace one, which is not a trade worth making to a reviewer.
function main() {
const ver = release();
// The channel and the commit decide the NAME, so they are read before it — not, as
// they were until #414, after the zip had already been written for the manifest.
const channel = stamped('channel.js', /RD_CHANNEL\s*=\s*"([^"]+)"/, 'dev');
const sha = stamped('version.js', /RD_VERSION\s*=\s*"[^"]*?([0-9a-f]{7})"/, '');

// The file tools/make_portable.js builds into dist/ is named from the release alone,
// and stays that way — this script reads it, it does not write it.
const distName = 'Reactor_Dynamics_' + ver.replace(/[^A-Za-z0-9.]+/g, '_') + '.html';
const distPath = path.join(ROOT, 'dist', distName);

// The portable build is gitignored, so on a fresh deploy checkout it will not exist.
// Build it rather than failing: that is the entire point of doing this at deploy.
if (!fs.existsSync(distPath)) {
  const bundler = path.join(ROOT, 'tools', 'make_portable.js');
  if (!fs.existsSync(bundler)) {
    // This is what a deploy failure looks like when .vercelignore excludes the bundler:
    // a bare ENOENT from execFileSync that says nothing about WHY. Alpha 1.10.0 failed
    // exactly here. Say the actual cause.
    throw new Error('tools/make_portable.js is missing. If this is a Vercel build, it is'
      + ' being excluded by .vercelignore — the buildCommand needs it. See #258.');
  }
  cp.execFileSync(process.execPath, [bundler], { cwd: ROOT, stdio: 'inherit' });
}
const html = fs.readFileSync(distPath);

const zipName = downloadName(ver, channel, sha, '.zip');
const entryName = downloadName(ver, channel, sha, '.html');

fs.mkdirSync(OUT_DIR, { recursive: true });
// Sweep older versions so the directory never offers two downloads at once.
for (const f of fs.readdirSync(OUT_DIR)) {
  if (/^Reactor_Dynamics_.*\.zip$/.test(f) && f !== zipName) {
    fs.unlinkSync(path.join(OUT_DIR, f));
  }
}
const zip = zipOne(entryName, html);
fs.writeFileSync(path.join(OUT_DIR, zipName), zip);

// download.html links a STABLE path so it never needs editing per release.
fs.writeFileSync(path.join(OUT_DIR, 'latest.zip'), zip);

// WHAT AM I ABOUT TO DOWNLOAD, AND DO I ALREADY HAVE IT? (2026-08-06) The page
// offered a button labelled "latest.zip" and nothing else — no version, no date,
// no size — so a returning visitor had no way to tell this build from the one in
// their downloads folder, and nobody on a metered connection knew what they were
// agreeing to. The three facts can only be known HERE: the zip does not exist
// until this script writes it, and download/ is gitignored precisely because a
// committed copy could only ever be stale.
//
// Emitted as a script rather than JSON so the page can read it from file:// too —
// the site has no fetch() anywhere and this is not the place to introduce one.
// If it is missing (a local checkout that has never built), download.html simply
// shows no metadata line: the CSS keeps .dl-meta hidden until it is filled.
// CHANNEL AND SHA RIDE ALONG (2026-08-07), so the page can say TEST BUILD and name
// the commit. Since #414 (2026-08-09) `file` is load-bearing rather than
// informational: site/nav.js stamps it straight onto the download button's
// `download=` attribute, so this object is how the built name reaches the visitor.
// Nothing re-derives it — see downloadName() above.
//
// site/build_site.js serves this file `Cache-Control: no-cache` (2026-08-09), which
// that change made for the version stamps and this one now depends on: a manifest
// cached for four hours would offer the PREVIOUS deploy's filename for the current
// deploy's zip, which is the defect wearing yet another hat.
const manifest = {
  version: ver,
  date: releaseDate(),
  bytes: zip.length,
  file: zipName,
  channel: channel,
  sha: sha,
};
fs.writeFileSync(path.join(OUT_DIR, 'manifest.js'),
  '/* GENERATED at deploy by site/make_download.js — do not commit or hand-edit. */\n' +
  'window.RD_DOWNLOAD = ' + JSON.stringify(manifest) + ';\n');

const pct = (100 - (zip.length / html.length) * 100).toFixed(0);
console.log('download/' + zipName + '  ' + (zip.length / 1048576).toFixed(2) + ' MB'
  + '  (from ' + (html.length / 1048576).toFixed(2) + ' MB, ' + pct + '% smaller)');
console.log('download/latest.zip  — the stable path download.html links');
console.log('download/manifest.js  ' + manifest.version + ' · ' + manifest.date +
  ' · ' + (zip.length / 1048576).toFixed(1) + ' MB');
if (!manifest.date) {
  // Not fatal — the page degrades to version + size. But say it, because a silent
  // null here is how the date quietly disappears from the page for a release.
  console.warn('  ! no datetime="" found in changelog.html — the download page will'
    + ' show no date. Check the newest entry.');
}
}

module.exports = { downloadName: downloadName };

/* Side effects only when run as a command, so test/run_portable.js can require this
 * file and ask downloadName() anything without building a 2.5 MB bundle or writing
 * into download/. Same idiom, and the same reason, as site/stamp_version.js. */
if (require.main === module) main();
