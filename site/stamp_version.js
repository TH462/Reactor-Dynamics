/* Vercel build step: stamp site/version.js from VERCEL_GIT_COMMIT_SHA, and
 * site/channel.js from VERCEL_ENV (the release channel feature flags resolve
 * against — see site/flags.js and GitHub #241).
 * Kept under site/ (not tools/) so .vercelignore still ships it at build time.
 * See Blueprint/WEBSITE_SPEC.md §8 and vercel.json. */
const fs = require('fs');
const path = require('path');
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);
const label = 'alpha · ' + sha;
fs.writeFileSync(path.join(__dirname, 'version.js'),
  '/* Generated at deploy. Repo copy is a placeholder (WEBSITE_SPEC.md §8). */\n' +
  'window.RD_VERSION = ' + JSON.stringify(label) + ';\n');

/* production = the `main` branch = the released website; preview = `develop`
 * pushes; anything else (a clone, file://, a local static server) is 'dev'.
 * The repo copy of channel.js is the 'dev' placeholder, so only a real deploy
 * can produce 'public' — nothing is hand-edited per branch. */
const env = process.env.VERCEL_ENV || '';
const channel = env === 'production' ? 'public' : env === 'preview' ? 'preview' : 'dev';
fs.writeFileSync(path.join(__dirname, 'channel.js'),
  '/* Generated at deploy (site/stamp_version.js) from VERCEL_ENV=' + (env || '<unset>') + '. */\n' +
  'window.RD_CHANNEL = ' + JSON.stringify(channel) + ';\n');
