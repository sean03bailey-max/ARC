/* REV 76: SPA soft router + desktop sidebar collapse.
   Boards-only (NEXUS <-> CORE <-> FEED), desktop-only (>=1024px).
   The sidebar, mobile dock and utility strip are persistent shell chrome —
   a swap replaces only #app-content children plus the page's own <style>
   blocks, then executes the fetched page's inline scripts inside one
   isolated Function scope (avoids global `const` redeclaration crashes).
   Home and the external TRACKER stay full page loads by design. */
(function () {
  'use strict';
  if (window.__SPA_SHELL) return;
  window.__SPA_SHELL = true;

  /* REV 78: singleton event binding on persistent shell nodes.
     Each soft swap re-executes the incoming page's inline scripts, which
     re-bind listeners on the PERSISTENT sidebar nodes (edit lock, theme,
     sound, tour). Stacked toggle handlers cancel each other out — one click
     = open+close = "dead button". For the whitelisted persistent IDs we
     keep EXACTLY ONE active listener per (node, type): re-binding removes
     the previous closure and installs the newest page's handler. */
  var PERSISTENT_IDS = {
    passwordWidget: 1, passwordToggle: 1, passwordInput: 1, pwTools: 1,
    themeToggle: 1, soundToggle: 1, tourToggle: 1,
    'sidebar-toggle-btn': 1, 'sidebar-expand-btn': 1
  };
  var origAdd = EventTarget.prototype.addEventListener;
  var origRemove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    try {
      if (this && this.nodeType === 1 && this.id && PERSISTENT_IDS[this.id] && typeof fn === 'function') {
        if (!this.__spaEvt) this.__spaEvt = {};
        var prev = this.__spaEvt[type];
        if (prev) origRemove.call(this, type, prev);
        this.__spaEvt[type] = fn;
      }
    } catch (e) {}
    return origAdd.call(this, type, fn, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    try {
      if (this && this.__spaEvt && this.__spaEvt[type] === fn) delete this.__spaEvt[type];
    } catch (e) {}
    return origRemove.call(this, type, fn, opts);
  };

  var mq = window.matchMedia('(min-width:1024px)');
  var PAGES = {
    'nexus.html': { root: '.board-shell', flag: null },
    'core.html': { root: '.tracker-shell', flag: null },
    'feed.html': { root: '.board-shell', flag: 'feedPage' },
    'settings.html': { root: '.settings-shell', flag: null }
  };

  var injectedStyles = [];
  var swapToken = 0;

  /* REV 87: pages register their breakpoint layout listener through this
     helper so spa.js can retire it on swap (see the cleanup in swap()). */
  window.__arcLayoutCleanups = window.__arcLayoutCleanups || [];
  window.__arcRegisterLayout = function (mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
    window.__arcLayoutCleanups.push(function () {
      if (mq.removeEventListener) mq.removeEventListener('change', fn);
      else if (mq.removeListener) mq.removeListener(fn);
    });
  };

  function pageName(url) {
    var m = String(url || '').split('/').pop().split('?')[0].toLowerCase();
    return Object.prototype.hasOwnProperty.call(PAGES, m) ? m : null;
  }

  function refreshBoot(page) {
    var boot = { locked: !(window.ArcAuth && window.ArcAuth.isTier2Unlocked()), readAnnouncements: [], nexusCache: null, coreCache: null, feedCache: null };
    try {
      boot.readAnnouncements = JSON.parse(localStorage.getItem('arc_read_announcements') || '[]') || [];
      boot.nexusCache = JSON.parse(localStorage.getItem('arc_cache_nexus') || 'null');
      boot.coreCache = JSON.parse(localStorage.getItem('arc_cache_core') || 'null');
      boot.feedCache = JSON.parse(localStorage.getItem('arc_cache_feed') || 'null');
    } catch (e) {}
    if (page && page.flag) boot[page.flag] = true;
    window.__ARC_BOOT = boot;
  }

  function teardownStyles() {
    injectedStyles.forEach(function (s) { if (s && s.isConnected) s.remove(); });
    injectedStyles = [];
  }

  function setActiveLink(name) {
    document.querySelectorAll('.sidebar-link').forEach(function (a) {
      var target = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
      a.classList.toggle('is-active', target === name);
    });
    document.querySelectorAll('.mn-item').forEach(function (a) {
      var target = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
      a.classList.toggle('is-active', target === name);
    });
  }

  /* REV 86: removed the ghost settings branch (isSettings was never set in
     PAGES, so it was unreachable) along with getSettingsHTML/bindSettingsCard
     — a dormant second settings UI persisting to a divergent storage key.
     Settings soft-nav uses the standard fetch/adopt path below. */

  function swap(href, push) {
    var name = pageName(href);
    if (!name) { location.href = href; return; }
    /* spotlight geometry cannot survive a view change */
    if (window.ArcTour && window.ArcTour.isActive && window.ArcTour.isActive()) window.ArcTour.finish();
    var token = ++swapToken;
    /* REV 88: fade the current view out behind the fetch — the height
       recalculation on adopt then happens behind an opacity mask instead of
       visibly jumping (and the scrollbar stops flashing). */
    var contentEl = document.getElementById('app-content');
    if (contentEl) contentEl.classList.add('routing');
    fetch(href, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('swap load failed');
      return r.text();
    }).then(function (html) {
      if (token !== swapToken) return;
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var content = document.getElementById('app-content');
      if (!content || !doc.querySelector(PAGES[name].root)) {
        /* REV 88: fall through to a full load — unmask so a back-navigation
           to this document isn't left faded */
        if (content) content.classList.remove('routing');
        location.href = href; return;
      }

      /* REV 85: the fetched shell carries its own empty #mobileUtilities
         strip; the LIVE salvaged strip is canonical. Drop the fetched copy
         before adoption so a swap can never produce a duplicate-ID strip
         (the orphan rendered as an empty bordered pill on mobile). */
      var fetchedStrip = doc.getElementById('mobileUtilities');
      if (fetchedStrip && fetchedStrip.parentNode) fetchedStrip.parentNode.removeChild(fetchedStrip);

      teardownStyles();
      /* REV 85 CASCADE PARITY: on a hard load the page's inline <style> sits
         BEFORE the neubrutal.css link, so the shared sheet wins ties. Inject
         swapped page styles at the SAME position (before the link) so soft
         navigation resolves every shared selector identically to a hard
         load. Body-level <style> blocks (which sit after the link on a hard
         load) are injected AFTER it to preserve their intended override. */
      var cssLink = document.querySelector('head link[rel="stylesheet"][href*="neubrutal"]');
      doc.querySelectorAll('head style').forEach(function (st) {
        var s = document.createElement('style');
        s.setAttribute('data-spa-style', name);
        s.textContent = st.textContent;
        if (cssLink && cssLink.parentNode) cssLink.parentNode.insertBefore(s, cssLink);
        else document.head.appendChild(s);
        injectedStyles.push(s);
      });
      doc.querySelectorAll('body style').forEach(function (st) {
        var s = document.createElement('style');
        s.setAttribute('data-spa-style', name + ':body');
        s.textContent = st.textContent;
        document.head.appendChild(s);
        injectedStyles.push(s);
      });
      /* shell guard: injected page styles may carry base rules that hide the
         persistent sidebar — re-assert shell visibility LAST in the cascade */
      var guard = document.createElement('style');
      guard.setAttribute('data-spa-style', 'shell-guard');
      guard.textContent = '@media (min-width:1024px){ .desktop-sidebar{display:flex !important; padding:20px 16px !important;} body.sidebar-collapsed .desktop-sidebar{visibility:hidden; transform:translateX(-100%);} .sidebar-link{padding:0.65rem 0.8rem !important; font-size:0.92rem !important; line-height:1.2 !important; min-height:45px !important;} .sidebar-link svg{width:19px !important; height:19px !important;} }';
      document.head.appendChild(guard);
      injectedStyles.push(guard);

      /* collect inline script code BEFORE adopting body children —
         adoption removes the <script> nodes from the doc */
      var code = [];
      doc.querySelectorAll('body script:not([src])').forEach(function (sc) { code.push(sc.textContent); });

      /* REV 80b: SALVAGE the persistent password widget before teardown —
         at mobile pwTools (with the toggle) sits in the utilities strip and
         the wrapper sits in the parking row, both INSIDE #app-content;
         content.innerHTML='' would destroy them. Reassemble the widget and
         park it in the sidebar slot (its safe home on every viewport). */
      var slot = document.getElementById('sidebarWidgetSlot');
      var livePw = document.getElementById('passwordWidget');
      if (slot && livePw) {
        var liveTools = livePw.querySelector('.pw-tools') || document.querySelector('.pw-tools');
        if (liveTools && !livePw.contains(liveTools)) livePw.appendChild(liveTools);
        if (!slot.contains(livePw)) slot.appendChild(livePw);
      }
      /* REV 80c: SALVAGE the persistent cluster buttons — at mobile they sit
         in the utilities strip (inside #app-content) and would be destroyed
         by the teardown. Return them to the sidebar cluster in gold order
         (tour, sound, theme, lock-slot). */
      var cluster = document.querySelector('.utility-cluster');
      var widgetSlot = document.getElementById('sidebarWidgetSlot');
      if (cluster && widgetSlot) {
        ['themeToggle', 'soundToggle', 'tourToggle'].forEach(function (id) {
          var btn = document.getElementById(id);
          if (btn && !cluster.contains(btn)) cluster.insertBefore(btn, widgetSlot);
        });
      }

      /* REV 81: SALVAGE the persistent utilities strip — it lives inside
         #app-content and would be destroyed by the teardown. Detach it and
         re-append it into the adopted shell after the content swap. */
      var liveStrip = document.getElementById('mobileUtilities');
      if (liveStrip) liveStrip.parentNode.removeChild(liveStrip);

      /* REV 91: clamp scroll BEFORE the teardown — emptying the content while
         scrolled clamps scrollTop and visibly yanks the scrollbar thumb; do
         it while the view is masked instead. */
      window.scrollTo(0, 0);
      content.innerHTML = '';
      /* static copy: HTMLCollection is live and mutates while we adopt */
      var fetched = Array.prototype.slice.call(doc.body.children);
      fetched.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'SCRIPT') return;
        var cls = ' ' + node.className + ' ';
        if (node.hasAttribute('data-arc-shell')) return;
        /* flatten the fetched page's own #app-content wrapper (avoid dup ID) */
        if (node.id === 'app-content') {
          Array.prototype.slice.call(node.children).forEach(function (child) {
            content.appendChild(document.adoptNode(child));
          });
          return;
        }
        content.appendChild(document.adoptNode(node));
      });
      /* REV 77 singleton lock: the persistent widget-slot instance is THE
         edit lock. Fetched pages carry their own parking-row copy — purge
         it so route swaps can never accumulate duplicate lock buttons. */
      content.querySelectorAll('#passwordWidget').forEach(function (n) { n.remove(); });
      /* REV 80c: clear the strip children — the incoming page's layout()
         repopulates it with its own buttons, preventing cross-page
         button accumulation */
      if (liveStrip) { while (liveStrip.firstChild) liveStrip.removeChild(liveStrip.firstChild); }
      /* REV 81: re-append the salvaged utilities strip as the first child
         of the adopted shell so it sits in flow at the top on mobile */
      if (liveStrip) {
        var adoptedShell = content.querySelector('.board-shell, .tracker-shell, .settings-shell, main');
        if (adoptedShell) adoptedShell.insertBefore(liveStrip, adoptedShell.firstChild);
        else content.insertBefore(liveStrip, content.firstChild);
      }
      document.title = doc.title || document.title;

      refreshBoot(PAGES[name]);
      /* REV 87: retire the OUTGOING page's breakpoint layout listener before
         the incoming scripts register theirs. matchMedia hands every page the
         SAME MediaQueryList, so without this the listeners stack and a stale
         one fires on the next resize — appending a detached page's save/lock
         buttons into the live strip (the "multiple save and password buttons"
         reload bug). */
      if (window.__arcLayoutCleanups) {
        while (window.__arcLayoutCleanups.length) {
          try { window.__arcLayoutCleanups.pop()(); } catch (e) {}
        }
      }
      if (code.length) {
        try { (new Function(code.join('\n;\n')))(); }
        catch (e) { console.error('[spa] view script error', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); }
      }
      /* REV 87: singleton enforcement — if any path (stale listener, future
         regression) cloned relocated chrome, keep the first instance and
         drop ghosts. */
      ['save-board-button', 'saveImageButton', 'passwordWidget', 'passwordToggle', 'search-toggle', 'view-mode-toggle', 'tourToggle', 'soundToggle', 'themeToggle', 'pageFab'].forEach(function (id) {
        var list = document.querySelectorAll('[id="' + id + '"]');
        for (var k = 1; k < list.length; k++) list[k].remove();
      });
      if (window.lucide) lucide.createIcons();
      /* REV 88: reveal the new view only after it has laid out (double-rAF),
         so the fade-in starts from the final geometry. */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var c = document.getElementById('app-content');
          if (c) c.classList.remove('routing');
        });
      });
      setActiveLink(name);
      if (push) { try { history.pushState({ spa: true, page: name }, '', href); } catch (e) {} }
      /* REV 91: already clamped pre-teardown (line ~208) */
      document.dispatchEvent(new CustomEvent('spa:swapped', { detail: { page: name } }));
    }).catch(function () {
      /* REV 88: unmask before the full-load fallback */
      var c = document.getElementById('app-content');
      if (c) c.classList.remove('routing');
      location.href = href;
    });
  }

  /* ----- navigation interception (boards only, desktop only) ----- */
  document.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
    var a = ev.target.closest('a');
    if (!a || a.target === '_blank') return;
    var href = a.getAttribute('href') || '';
    if (!pageName(href)) return;
    ev.preventDefault();
    swap(href, true);
  });

  window.addEventListener('popstate', function () {
    if (pageName(location.pathname)) swap(location.pathname, false);
    else location.reload();
  });

  /* ----- desktop sidebar collapse ----- */
  function setCollapsed(collapsed, persist) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    if (persist) { try { localStorage.setItem('arc_sidebar_collapsed', collapsed ? 'true' : 'false'); } catch (e) {} }
  }
  function bindCollapse() {
    var t = document.getElementById('sidebar-toggle-btn');
    var x = document.getElementById('sidebar-expand-btn');
    if (t && !t.dataset.spaBound) {
      t.dataset.spaBound = '1';
      t.addEventListener('click', function () { if (mq.matches) setCollapsed(true, true); });
    }
    if (x && !x.dataset.spaBound) {
      x.dataset.spaBound = '1';
      x.addEventListener('click', function () { setCollapsed(false, true); });
    }
    try {
      if (mq.matches && localStorage.getItem('arc_sidebar_collapsed') === 'true') setCollapsed(true, false);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindCollapse);
  else bindCollapse();
  mq.addEventListener ? mq.addEventListener('change', function () { bindCollapse(); if (!mq.matches) setCollapsed(false, false); }) : mq.addListener(function () { bindCollapse(); if (!mq.matches) setCollapsed(false, false); });
})();
