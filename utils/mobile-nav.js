/* REV 70/71/74: scroll dynamics for the mobile dock + floating FAB.
   Scrolling down hides both (translate-y-full / opacity-0 / pointer-events-none);
   scrolling up or returning to the top reveals them. rAF-throttled with a
   small dead-zone so sub-pixel jitters and rubber-banding don't flicker.
   While a tour overlay or modal is open the controls are forced visible so
   spotlight positioning never fights a hidden navbar.

   REV 74: the utilities strip lives in the document flow at the top of the
   shell and elevates into a fixed, centered floating pill once the page is
   scrolled past a small threshold (mobile-nav.js toggles .is-floating; CSS
   owns the visuals). At the top it returns to its static flow position so
   page headings are never covered. */
(function () {
  'use strict';
  var nav = document.querySelector('.mobile-bottom-nav');
  var fab = document.getElementById('pageFab');
  var bar = document.getElementById('mobileUtilities');
  var els = [nav, fab].filter(Boolean);

  var HIDE = ['translate-y-full', 'opacity-0', 'pointer-events-none'];
  var FLOAT_THRESHOLD = 40; // px of scroll before the strip starts following (R77 spec)
  var lastY = window.scrollY || window.pageYOffset;
  var ticking = false;

  function overlayOpen() {
    /* REV 86: expand/delete/infoboard are element IDs in the markup, not
       classes — the old class selectors could never match, so the dock
       scroll-hide fought those overlays on mobile. (.qr-view-layer removed:
       no page or script ever creates it.) */
    return !!document.querySelector('.tour-overlay, #expand-modal.is-open, #delete-modal.is-open, #helpModal.is-open, #feed-infoboard.is-open, .feed-reader.is-open, #compose-layer.is-open, #renotify-layer.is-open, .confirmation-layer.is-open, .settings-infoboard-layer.is-open');
  }

  function apply(hide) {
    els.forEach(function (el) {
      HIDE.forEach(function (cls) { el.classList.toggle(cls, hide); });
    });
  }

  function syncStrip(y) {
    if (!bar) return;
    var floating = y >= FLOAT_THRESHOLD;
    /* While a tour/modal overlay is up, keep the strip pinned so spotlight
       geometry stays stable. */
    if (overlayOpen()) floating = lastFloating;
    bar.classList.toggle('is-floating', floating);
    lastFloating = floating;
  }
  var lastFloating = false;

  function onScroll() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset;
    syncStrip(y);
    if (overlayOpen()) { apply(false); lastY = y; return; }
    if (y <= 8) {
      apply(false);
    } else if (y > lastY + 4) {
      apply(true);
    } else if (y < lastY - 4) {
      apply(false);
    }
    lastY = y;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(onScroll);
    }
  }, { passive: true });

  // Returning to a fresh page or anchor jump should always start revealed,
  // with the strip back in its static flow slot.
  window.addEventListener('pageshow', function () {
    apply(false);
    syncStrip(window.scrollY || window.pageYOffset);
  });
  onScroll();

  /* ----- Dock-height custom property -----
     The FAB must float exactly ABOVE the rendered dock whatever its real
     height ends up being (labels, fonts, safe-area). Expose it as
     --arc-dock-h and let CSS consume it. */
  function syncDockHeight() {
    if (!nav) return;
    document.documentElement.style.setProperty('--arc-dock-h', nav.offsetHeight + 'px');
  }
  syncDockHeight();
  window.addEventListener('resize', syncDockHeight);
  window.addEventListener('pageshow', syncDockHeight);
})();
