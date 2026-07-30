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
const ver = release();
const safe = ver.replace(/[^A-Za-z0-9.]+/g, '_');
const htmlName = 'Reactor_Dynamics_' + safe + '.html';
const htmlPath = path.join(ROOT, 'dist', htmlName);

// The portable build is gitignored, so on a fresh deploy checkout it will not exist.
// Build it rather than failing: that is the entire point of doing this at deploy.
if (!fs.existsSync(htmlPath)) {
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
const html = fs.readFileSync(htmlPath);

fs.mkdirSync(OUT_DIR, { recursive: true });
// Sweep older versions so the directory never offers two downloads at once.
for (const f of fs.readdirSync(OUT_DIR)) {
  if (/^Reactor_Dynamics_.*\.zip$/.test(f) && f !== 'Reactor_Dynamics_' + safe + '.zip') {
    fs.unlinkSync(path.join(OUT_DIR, f));
  }
}
const zipName = 'Reactor_Dynamics_' + safe + '.zip';
const zip = zipOne(htmlName, html);
fs.writeFileSync(path.join(OUT_DIR, zipName), zip);

// download.html links a STABLE path so it never needs editing per release.
fs.writeFileSync(path.join(OUT_DIR, 'latest.zip'), zip);

const pct = (100 - (zip.length / html.length) * 100).toFixed(0);
console.log('download/' + zipName + '  ' + (zip.length / 1048576).toFixed(2) + ' MB'
  + '  (from ' + (html.length / 1048576).toFixed(2) + ' MB, ' + pct + '% smaller)');
console.log('download/latest.zip  — the stable path download.html links');
