/* Vercel build step: stamp site/version.js from VERCEL_GIT_COMMIT_SHA.
 * Kept under site/ (not tools/) so .vercelignore still ships it at build time.
 * See Blueprint/WEBSITE_SPEC.md §8 and vercel.json. */
const fs = require('fs');
const path = require('path');
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);
const label = 'alpha \u00b7 ' + sha;
const body =
  '/* Generated at deploy. Repo copy is a placeholder (WEBSITE_SPEC.md \u00a78). */\n' +
  'window.RD_VERSION = ' + JSON.stringify(label) + ';\n';
fs.writeFileSync(path.join(__dirname, 'version.js'), body);
