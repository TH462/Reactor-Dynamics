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
 * Set this to "Alpha X.Y.Z" at launch. `test/run_release.js` switches out of
 * pre-release mode automatically on the format and starts demanding a matching
 * changelog entry. RBMK and BWR are OUT OF SCOPE for that release — PWR only.
 */
window.RD_RELEASE = "Pre Alpha";
