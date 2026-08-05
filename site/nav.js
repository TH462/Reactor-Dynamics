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

    // The offline download links a stable path (download/latest.zip) so download.html
    // never needs a per-release edit — but that is also the name the browser saves it
    // under, and "latest.zip" identifies nothing once it is sitting in a downloads
    // folder next to five other zips (#275). Name the SAVED file from the release
    // string instead. This must produce EXACTLY the name site/make_download.js gives
    // the versioned copy it writes beside latest.zip; test/run_portable.js compares the
    // two literals, because two spellings of the same filename is the whole defect
    // wearing a different hat.
    //
    // Null/undefined-guarded on both sides: nav.js loads on every page and only
    // download.html has the button or loads release.js. With JS off, the bare
    // `download` attribute in the markup still saves — as latest.zip, i.e. today's
    // behaviour, which is the right way for this to fail.
    var dl = document.getElementById('dlZip');
    if (dl && typeof window.RD_RELEASE === 'string' && window.RD_RELEASE) {
      dl.setAttribute('download',
        'Reactor_Dynamics_' + window.RD_RELEASE.replace(/[^A-Za-z0-9.]+/g, '_') + '.zip');
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
