/* Generated at deploy (site/stamp_version.js). The repo copy is EMPTY, and that is
 * the safe state: site/telemetry.js sends nothing at all without an endpoint, so a
 * clone, a local file:// run and the offline single-file build are all silent by
 * construction rather than by anyone remembering to switch them off.
 *
 * tools/make_portable.js must BLANK this in the bundle it builds. It runs after the
 * deploy stamp, so without that step the offline file — whose whole promise is that
 * it never touches the network — would carry the production endpoint. */
window.RD_TELEMETRY_ENDPOINT = "";
