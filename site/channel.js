/* Generated at deploy (site/stamp_version.js). The repo copy is the DEV
 * placeholder, which is also what a local file:// or `npx serve` run gets.
 *
 *   'public'  — the released website (the `main` branch, on whichever host)
 *   'preview' — a test deployment: any other branch, e.g. dev.reactordynamics.com
 *               off `develop`
 *   'dev'     — no CI at all: a clone, file://, a local static server
 *
 * Feature flags (site/flags.js, GitHub #241) resolve against this: content
 * still being vetted ships in the bundle but is only OFFERED off 'public'.
 * So 'dev' is the most PERMISSIVE value here, not the safest — which is why
 * stamp_version.js never falls back to it on a machine that looks like CI.
 * The host matrix is pinned by test/run_channel.js. */
window.RD_CHANNEL = "dev";
