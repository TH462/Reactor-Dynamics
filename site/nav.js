/* Site header menu: burger toggles the dropdown; Esc / outside click closes it.
 * Also stamps RD_VERSION into the footer, and RD_RELEASE into the download button's
 * saved filename, when either is present. Load after site/version.js (and, on
 * download.html, after site/release.js). */
(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    // "Pre Alpha · a3f9c21" — the label says what this is, the SHA says WHICH build.
    // Both, deliberately: the SHA is the identifier a bug report needs, and a tester
    // should not have to open the feedback dialog to find it.
    var sha = (typeof window.RD_VERSION === 'string') ? window.RD_VERSION : '';
    var rel = (typeof window.RD_RELEASE === 'string') ? window.RD_RELEASE : '';
    var label = rel && sha ? rel + ' · ' + sha : (rel || sha);
    var foot = document.getElementById('ver');
    if (foot) foot.textContent = label;

    // Release number beside the ALPHA badge in the header, on every page
    // *(OWNER, 2026-08-05: "On the top of the website pages next to the alpha logo, put the
    // version number ie. V1.1.0.")*. Rendered as V<digits> — the badge already says ALPHA, so
    // repeating the word there would read "ALPHA Alpha 1.1.0".
    //
    // FILLED FROM RD_RELEASE, never hand-typed into the markup: the release string lives in
    // site/release.js and run_release.js already cross-checks it against changelog.html and
    // CHANGELOG.md, so this inherits that guarantee. A version stamped into eight HTML files
    // would be eight things to forget at the next bump.
    //
    // If RD_RELEASE carries no digits (the old "Pre Alpha"), or release.js is not loaded at
    // all, the span stays EMPTY rather than printing a bare "V" — the header simply looks the
    // way it did before this existed.
    var brandVer = document.getElementById('brandVer');
    if (brandVer) {
      var m = /(\d+(?:\.\d+)*)/.exec(rel);
      brandVer.textContent = m ? 'V' + m[1] : '';
    }

    // "Alpha 1.2.2 · 6 August 2026 · 4.2 MB" under the download button (2026-08-06).
    // Everything here comes from window.RD_DOWNLOAD, which site/make_download.js writes
    // at deploy from the zip it just built — the size is not knowable before that, and
    // hand-maintaining it would be one more number to forget at a release.
    //
    // Every field is optional and the row is assembled from whichever ones arrived: on a
    // local checkout the manifest 404s and the element stays hidden (.dl-meta is
    // display:none until .is-filled), rather than rendering a line of blanks.
    var meta = document.getElementById('dlMeta');
    var dlInfo = window.RD_DOWNLOAD;

    // THE SAVED FILENAME, TAKEN FROM THE BUILD RATHER THAN RE-DERIVED (#414).
    // download.html links the stable download/latest.zip so it needs no per-release
    // edit, and that href's basename is what the browser would save the file under —
    // "latest.zip" identifies nothing in a downloads folder (#275). So the name comes
    // from the `download=` attribute stamped here.
    //
    // It used to be BUILT here, from RD_RELEASE, as a second spelling of the string
    // site/make_download.js gives the zip; test/run_portable.js compared the two
    // spellings' literals. That could not survive #414 — off the released channel the
    // name has to carry the commit, and adding a suffix to one side leaves those
    // literals identical, so the gate would have stayed green while the offered name
    // stopped being the built name. There is now ONE derivation, downloadName() in
    // site/make_download.js, and it reaches the browser through the manifest that
    // script writes beside the zip in the same run *(OWNER RULING, 2026-08-09, choosing
    // "Transport it" from the options put to them — the phrasing is mine, the decision
    // theirs)*. Nothing here may reconstruct it — run_portable.js fails if the
    // literal 'Reactor_Dynamics_' reappears in this file.
    //
    // NO FALLBACK, deliberately. The only case with no manifest is a local checkout,
    // where download/ is gitignored and latest.zip 404s too — there is no file to
    // name. The bare `download` attribute in the markup then still saves it as
    // latest.zip if JS is off, which is the right way for this to fail.
    var dl = document.getElementById('dlZip');
    if (dl && dlInfo && dlInfo.file) dl.setAttribute('download', dlInfo.file);

    if (meta && dlInfo && typeof dlInfo === 'object') {
      var parts = [];
      if (dlInfo.version) parts.push(dlInfo.version);
      // The ISO date is what the manifest carries; spell it out for the reader. Parsed
      // by hand rather than via new Date(iso), which reads the string as UTC and then
      // prints it in local time — west of Greenwich that shows the day before.
      var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dlInfo.date || '');
      if (d) {
        var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                      'August', 'September', 'October', 'November', 'December'];
        parts.push((+d[3]) + ' ' + MONTHS[(+d[2]) - 1] + ' ' + d[1]);
      }
      if (dlInfo.bytes > 0) parts.push((dlInfo.bytes / 1048576).toFixed(1) + ' MB');
      // Off the released channel, say so and name the commit. Since #414 the SHA is
      // also in the filename, so this line is no longer the ONLY thing distinguishing a
      // test build from the release — it is the thing that says so before the download
      // starts, on the page, where a visitor deciding whether to click can read it.
      if (dlInfo.channel && dlInfo.channel !== 'public') {
        parts.unshift('TEST BUILD');
        if (dlInfo.sha) parts.push(dlInfo.sha);
      }
      if (parts.length) {
        meta.innerHTML = parts.join('<span class="sep">·</span>');
        meta.classList.add('is-filled');
      }
    }

    var btn = document.getElementById('navBurger');
    var nav = document.getElementById('siteNav');
    if (!btn || !nav) return;

    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('is-open', open);
    }
    function isOpen() { return nav.classList.contains('is-open'); }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!isOpen());
    });
    document.addEventListener('click', function (e) {
      if (!isOpen()) return;
      if (nav.contains(e.target) || btn.contains(e.target)) return;
      setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) setOpen(false);
    });
  });
})();
