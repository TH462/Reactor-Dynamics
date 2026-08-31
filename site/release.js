/* What the build calls itself, shown next to the logo and in the site footer.
 *
 * `Alpha 1.0.0` — the FIRST real version, and its first value is its launch value,
 * which is the most honest use a version number gets *(OWNER DIRECTIVE, 2026-08-04:
 * "The next release will take the program out of pre-Alpha and into Alpha and bring
 * back the update tracking page.")*. RBMK and BWR are OUT OF SCOPE for it — PWR only.
 *
 * It read "Pre Alpha" from 2026-07-31 until this release, on purpose, and that history
 * is why the number is not to be spent freely. A version was doing no work here: it did
 * not identify a build — `RD_VERSION` (site/version.js, the git SHA) already does that,
 * and ui/app.js tells the player to quote it in a bug report — and it misrepresented
 * maturity, implying eleven feature releases of a product nobody had downloaded. It also
 * blew up: the Y digit meant "a new player-facing feature", which caught nearly every
 * release, so it ran 1.2.0 -> 1.11.0 in eight days and was reset, reverted and re-argued
 * three times in one day. Y IS FOR NEW THINGS, NOT VISIBLE THINGS — see CLAUDE.md.
 *
 * THE FORMAT IS THE SWITCH. `test/run_release.js` leaves pre-release mode on the
 * `Alpha X.Y.Z` shape alone and then DEMANDS a matching `changelog.html` entry, so this
 * line and that entry move in ONE change — a bump alone is a red gate, and so is an
 * entry alone. It also demands `CHANGELOG.md`'s newest version heading match, and that
 * pre-launch dev versions NOT parse as released ones (they are `Pre-launch 1.x` now, or
 * 1.0.0 sorts under 1.11.0 and the newest-first check fails). The offline download names
 * itself from this string, so rebuild it AFTER changing this, never before (#258).
 */
window.RD_RELEASE = "Alpha 1.7.1";
