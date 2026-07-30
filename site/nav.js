/* Site header menu: burger toggles the dropdown; Esc / outside click closes it. */
(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
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
