/* hook_repack_manuals.js — Claude Code PostToolUse hook.
 *
 * Repacks the manuals whenever an agent edits `Manuals/*.md`.
 *
 * WHY THIS EXISTS. `Manuals/*.md` is the SOURCE; `ui/manual_md.js` is the packed
 * copy the app actually serves, produced by `tools/pack_manuals.js`. Nothing
 * enforced the second step, so it was a rule an agent had to remember — and on
 * 2026-07-29 one didn't: eight manual files were edited and left unpacked, and
 * the in-app manual silently disagreed with its own source until someone
 * happened to run the packer for an unrelated reason. A hook cannot forget.
 *
 * CONTRACT. Reads the hook payload as JSON on stdin. It NEVER blocks: every
 * failure path exits 0, because a packer problem must not stop the edit that
 * triggered it — the worst case is a warning in the transcript telling you to
 * run the packer by hand.
 *
 * Wired in `.claude/settings.json` under hooks.PostToolUse with the matcher
 * "Edit|MultiEdit|Write". Claude Code matches on TOOL NAME, not path, so this
 * runs on every file edit in the repo and the path filter below is what makes
 * it cheap — one node start when it doesn't match.
 *
 * NOTE it fires once per edited file, so editing eight manuals repacks eight
 * times. The packer reads 14 files and writes ~260 KB, well under a second,
 * which is cheaper than the machinery to debounce it.
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); } catch (e) { process.exit(0); }   // not our shape → stay out of the way

  const ti = payload && payload.tool_input;
  const file = (ti && (ti.file_path || ti.notebook_path)) || '';
  // Only the manual SOURCE. Deliberately not ui/manual_md.js — that is this
  // script's own output, and matching it would recurse.
  if (!/(^|[\\/])Manuals[\\/][^\\/]+\.md$/i.test(file)) process.exit(0);

  const root = path.join(__dirname, '..');
  try {
    execFileSync(process.execPath, ['tools/pack_manuals.js'], { cwd: root, stdio: 'pipe' });
    console.log('↻ manuals repacked (' + path.basename(file) + ' → ui/manual_md.js)');
  } catch (e) {
    const tail = String(e.stderr || e.stdout || e.message || '').trim().split('\n').slice(-3).join('\n');
    console.log('⚠ pack_manuals failed — run `node tools/pack_manuals.js` by hand.\n' + tail);
  }
  process.exit(0);
});
