/* What the build calls itself, shown next to the logo and in the site footer.
 *
 * PRE-RELEASE. Not a version number, on purpose *(OWNER, 2026-07-31)*. A version
 * number was doing no work here: it did not identify a build — `RD_VERSION`
 * (site/version.js, the git SHA) already does that, and ui/app.js already tells
 * the player to quote it in a bug report — and it actively misrepresented
 * maturity, implying eleven feature releases of a public product that nobody had
 * downloaded. It also blew up: the Y digit meant "a new player-facing feature",
 * which caught nearly every release, so it ran 1.2.0 -> 1.11.0 in eight days and
 * was reset, reverted and re-argued three times in one day.
 *
 * So the build identifies itself by SHA and describes itself honestly. The FIRST
 * real version is `Alpha 1.0.0` on public launch day (#282) — its first value is
 * its launch value, which is the most honest use a version number gets.
 *
 * THE NEXT RELEASE IS THAT LAUNCH *(OWNER DIRECTIVE, 2026-08-04: "The next release
 * will take the program out of pre-Alpha and into Alpha and bring back the update
 * tracking page.")* — so this line becomes "Alpha 1.0.0", and `test/run_release.js`
 * switches out of pre-release mode automatically on the format. It then DEMANDS a
 * matching `changelog.html` entry, so bump this and write that entry in ONE change:
 * a bump alone is a red gate, and so is an entry alone. RBMK and BWR are OUT OF
 * SCOPE for that release — PWR only. Checklist: #282.
 */
window.RD_RELEASE = "Pre Alpha";
