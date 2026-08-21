/* utils/tour.js — zero-dependency interactive walkthrough engine (REV 51).
   Classic script; exposes window.ArcTour for page inline scripts.
   Pages register their steps via ArcTour.register(pageName, { url, steps:[...] })
   and start the walkthrough via ArcTour.startFrom(pageName). */

(function () {
  'use strict';

  var SESSION_KEY = 'arc_tour_session';
  var ORDER = ['home', 'nexus', 'core', 'tracker'];
  var configs = {};
  var seq = [];
  var state = null; // { idx, total }

  var DEFAULT_TRACKER = {
    external: 'https://red-cross-scheduler.vercel.app/',
    steps: [{
      title: 'TRACKER — Deployment & Tracking',
      text: 'TRACKER is the council\u2019s external scheduling system (red-cross-scheduler.vercel.app) for volunteer shifts, event timetables, and availability. Open it anytime from the sidebar or the homepage Tracker button.',
      action: 'https://red-cross-scheduler.vercel.app/',
      actionLabel: 'Open Tracker'
    }]
  };

  var DEFAULT_CONFIG = {
    home: {
      url: 'index.html',
      steps: [
        {
          title: 'Unlock the Dashboard',
          text: 'This is your ARC home. Click Unlock, enter the password, and the navigation and editing controls become available. Unlocking persists for this session.',
          target: '#passwordToggle',
          placement: 'top'
        },
        {
          title: 'Basic Navigation',
          text: 'Jump between NEXUS (the QR resource board), TRACKER (the external scheduler), and CORE (the deliverables tracker) using these buttons.',
          target: 'nav[aria-label="ARC destinations"]',
          placement: 'top'
        },
        {
          title: 'Theme & Audio Controls',
          text: 'Use the Dark Mode button to toggle light and dark. The sound button beside it turns button sounds on or off, and the (?) button restarts this tour anytime. Unlock the dashboard first so you can continue the walkthrough.',
          target: '#themeToggle',
          placement: 'bottom',
          gate: {
            check: function () {
              var t = document.getElementById('passwordToggle');
              if (t && t.classList.contains('is-unlocked')) return true;
              try { return sessionStorage.getItem('arc_homepage_unlocked') === 'true'; } catch (e) { return false; }
            },
            hint: 'Unlock the dashboard to continue',
            autoAdvance: true,
            focusTarget: '#passwordToggle',
            focus: function () {
              var t = document.getElementById('passwordToggle');
              if (!t) return;
              gateSpotlight = true;
              // Re-anchor the spotlight onto the gate control as it expands.
              var anchor = function () {
                if (!spotlight || !spotlight.style || !t.isConnected) return;
                var pad = 8;
                var r = t.getBoundingClientRect();
                spotlight.style.display = 'block';
                spotlight.style.left = Math.max(0, r.left - pad) + 'px';
                spotlight.style.top = Math.max(0, r.top - pad) + 'px';
                spotlight.style.width = (r.width + pad * 2) + 'px';
                spotlight.style.height = (r.height + pad * 2) + 'px';
              };
              anchor();
              // Expand the password input container if the widget is closed.
              if (!t.classList.contains('is-unlocked') && !t.classList.contains('is-input-mode')) {
                try { t.click(); } catch (e) {}
              }
              var i = t.querySelector('.password-input-inline');
              if (i && typeof i.focus === 'function') { try { i.focus({ preventScroll: true }); } catch (e) {} }
              // REV 58: the widget morphs open over ~180ms, widening the button —
              // recalibrate after the transition so the spotlight (and tooltip)
              // cover the expanded input width instead of the collapsed size.
              setTimeout(anchor, 260);
              setTimeout(anchor, 600);
              setTimeout(function () {
                if (isActive() && seq[state.idx] && seq[state.idx].gate) position(seq[state.idx]);
              }, 280);
            }
          }
        }
      ]
    },
    nexus: {
      url: 'NEXUS.html',
      steps: [
        {
          title: 'Unlock Editing',
          text: 'Editing is locked. Click the UNLOCK button to unlock editing and access the board controls. The password field pops out to the right of the lock button.',
          // REV 64: spotlight the lock button and, once the horizontal password
          // flyout is open, expand the mask to cover widget + flyout together.
          // REV 66: on mobile the password drawer lives in #mobileUtilities
          // (bottom sheet / inline row), so highlight that drawer with 7px
          // padding instead of the displaced desktop widget.
          target: function () {
            var isMob = window.innerWidth < 1024;
            if (isMob) {
              var md = document.querySelector('#mobileUtilities .pw-tools.is-open');
              if (md) {
                var mr = md.getBoundingClientRect();
                if (mr.width > 0 && mr.height > 0) return { x: mr.left, y: mr.top, w: mr.width, h: mr.height };
              }
              var mp = document.querySelector('#mobileUtilities .password-panel');
              var mRow = document.getElementById('mobileUtilities');
              if (mp && mRow && mRow.getBoundingClientRect().width > 0) {
                var mpr = mp.getBoundingClientRect();
                var rr = mRow.getBoundingClientRect();
                // When the row has expanded to full-width drawer, spotlight the row
                if (mRow.classList.contains('is-open') || document.querySelector('#mobileUtilities .pw-tools.is-open')) {
                  if (rr.width > 0 && rr.height > 0) return { x: rr.left, y: rr.top, w: rr.width, h: rr.height };
                }
                if (mpr.width > 0 && mpr.height > 0) return { x: mpr.left, y: mpr.top, w: mpr.width, h: mpr.height };
              }
            }
            var w = document.getElementById('passwordWidget');
            var a = w ? w.getBoundingClientRect() : null;
            var p = document.querySelector('#passwordWidget .password-panel');
            // Gate on the widget's is-open class (added before the panel's
            // opacity fade starts) so the union is measured immediately rather
            // than waiting for the transition to finish.
            if (a && p && w && w.classList.contains('is-open')) {
              var r = p.getBoundingClientRect();
              return {
                x: Math.min(a.left, r.left),
                y: Math.min(a.top, r.top),
                w: Math.max(a.right, r.right) - Math.min(a.left, r.left),
                h: Math.max(a.bottom, r.bottom) - Math.min(a.top, r.top)
              };
            }
            if (!a) return null;
            return { x: a.left, y: a.top, w: a.width, h: a.height };
          },
          placement: 'right',
          pad: 7
        },
        {
          title: 'Action Board Controls',
          text: 'The Action Board stacks the Walkthrough (?), Sound, Dark Mode, and Edit Lock buttons in order. Use them to restart this tour, mute or unmute button sounds, switch themes, and lock or unlock editing.',
          target: '.utility-cluster, #mobileUtilities',
          placement: 'right'
        },
        {
          title: 'Board Overview & Sync',
          text: 'The header frames the board: the NEXUS tagline describes what lives here, and the sync pill reports live save status (Synced / Saving / Error). The header actions on the right \u2014 Save Board, the card view toggle, and Add Resource \u2014 are your main board controls.',
          target: 'header.board-header',
          placement: 'bottom'
        },
        {
          title: 'Card View Modes',
          text: 'Flip between the Full Card grid and the compact Pill view. Pills lay cards out two per row so you can scan many resources at a glance, and the choice is remembered on this device.',
          target: '#view-mode-toggle',
          placement: 'bottom',
          desktopOnly: true,
          pad: 6
        },
        {
          title: 'Resource Cards',
          text: 'Each card is a QR resource: a scannable code with a title and URL. Click a title or URL to edit it (when editing is unlocked) and use the card actions to organize, copy, or save.',
          // REV 64: in pill view spotlight the whole 2-column grid; in full
          // card view spotlight the first card.
          target: function () {
            if (document.body && document.body.classList.contains('nexus-view-pill')) {
              var g = document.querySelector('.qr-grid');
              if (g) {
                var r = g.getBoundingClientRect();
                return { x: r.left, y: r.top, w: r.width, h: r.height };
              }
            }
            return '.resource-item .qr-card';
          },
          placement: 'top'
        },
        {
          title: 'Quick Find',
          text: 'Quickly find any resource \u2014 Search cards and pills in real time by title or link.',
          // REV 69: spotlight the SEARCH control — beside Save Board in the
          // desktop header, rightmost cell of the mobile utility strip. 8px
          // breathing room keeps the hard-offset shadow inside the cutout.
          target: '#search-toggle',
          placement: 'bottom',
          pad: 8
        },
        {
          title: 'Expand & QR Previews',
          text: 'Click the expand action (maximize icon) on any card to open a large preview with rich-text editing of its description and a closer look at the QR code. On compact pill cards, the chevron expands the same way.',
          target: '.capsule-toggle, .resource-item .card-action[data-action="expand"]',
          placement: 'right'
        },
        {
          title: 'Board Save',
          text: 'The Save Board button exports the entire board as a shareable PNG image \u2014 perfect for posting or offline use.',
          target: '#save-board-button',
          placement: 'bottom'
        },
        {
          title: 'Mobile Navigation',
          text: 'The bottom dock jumps between NEXUS, TRACKER, and CORE. The + button at the right adds a resource. Both appear once editing is unlocked.',
          target: function () {
            // REV 66: on mobile when the password drawer is open, spotlight the
            // active input drawer (utilities-row pw-tools) with 7px padding so
            // the cutout strictly frames the rendered drawer, not the displaced
            // background nav. Falls back to the dock when closed.
            var isMob = window.innerWidth < 1024;
            var drawer = document.querySelector('#mobileUtilities .pw-tools.is-open');
            if (isMob && drawer) {
              var r = drawer.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
              var row = document.getElementById('mobileUtilities');
              if (row) {
                var rr = row.getBoundingClientRect();
                if (rr.width > 0 && rr.height > 0) return { x: rr.left, y: rr.top, w: rr.width, h: rr.height };
              }
            }
            var sheet = document.querySelector('.bottom-sheet.open');
            if (isMob && sheet) {
              var sr = sheet.getBoundingClientRect();
              if (sr.width > 0 && sr.height > 0) return { x: sr.left, y: sr.top, w: sr.width, h: sr.height };
            }
            return '.mobile-bottom-nav';
          },
          placement: 'top',
          pad: 7,
          mobileOnly: true,
          gate: {
            check: function () {
              var t = document.getElementById('passwordToggle');
              if (t && t.classList.contains('is-unlocked')) return true;
              return false;
            },
            hint: 'Unlock editing to continue',
            autoAdvance: true,
            focusTarget: function () {
              // While the drawer is open, keep the gate spotlight on the drawer
              // so the mask tracks the input area, not the underlying toggle.
              var drawer = document.querySelector('#mobileUtilities .pw-tools.is-open');
              if (drawer && window.innerWidth < 1024) return drawer;
              var sheet = document.querySelector('.bottom-sheet.open');
              if (sheet && window.innerWidth < 1024) return sheet;
              return document.getElementById('passwordToggle');
            },
            focus: function () {
              var t = document.getElementById('passwordToggle');
              gateSpotlight = true;
              if (t && !t.classList.contains('is-unlocked')) { try { t.click(); } catch (e) {} }
              var i = document.getElementById('passwordInput');
              if (i && typeof i.focus === 'function') { try { i.focus({ preventScroll: true }); } catch (e) {} }
              // REV 66: dynamic mask recalculation — re-anchor once the drawer/
              // bottom-sheet animation completes so the cutout isn't clipped and
              // keeps 6-8px internal padding. Poll + transitionend for robustness.
              var repositionGate = function () {
                if (isActive() && seq[state.idx] && seq[state.idx].gate) position(seq[state.idx]);
              };
              var panel = document.querySelector('#mobileUtilities .password-panel');
              var sheet = document.querySelector('.bottom-sheet');
              var once = function (el) {
                if (!el) return;
                var h = function () { repositionGate(); el.removeEventListener('transitionend', h); };
                el.addEventListener('transitionend', h);
              };
              once(panel);
              once(sheet);
              [50, 160, 300, 480, 700].forEach(function (d) {
                setTimeout(repositionGate, d);
              });
              // Immediate nudge so the toggle highlight appears without delay
              setTimeout(repositionGate, 30);
            }
          }
        }
      ]
    },
    core: {
      url: 'core.html',
      steps: [
        {
          title: 'Board Overview & Sync',
          text: 'CORE is the officers\u2019 deliverables tracker. The header shows the current period\u2019s context and live sync status, and Save image exports the whole sheet as a clean PNG. The Month / Last updated / Updated by cards below summarize this period.',
          target: function () {
            var h = document.querySelector('.sheet-header');
            var m = document.querySelector('.meta-grid');
            var a = h ? h.getBoundingClientRect() : null;
            var b = m ? m.getBoundingClientRect() : null;
            if (!a && !b) return null;
            if (!a) return { x: b.left, y: b.top, w: b.width, h: b.height };
            if (!b) return { x: a.left, y: a.top, w: a.width, h: a.height };
            var x = Math.min(a.left, b.left), y = Math.min(a.top, b.top);
            var right = Math.max(a.right, b.right), bottom = Math.max(a.bottom, b.bottom);
            return { x: x, y: y, w: right - x, h: bottom - y };
          },
          placement: 'bottom'
        },
        {
          title: 'Member & Officer Tables',
          text: 'CORE tracks officer and committee deliverables in structured tables: officer, deliverable, status, deadline, and additional remarks.',
          target: '.tracker-table',
          placement: 'top'
        },
        {
          title: 'Row Management',
          text: 'Add or remove rows to manage monthly deliverables. Row actions require unlocking editing first.',
          target: '.add-row-wrap',
          placement: 'bottom'
        },
        {
          title: 'Image Export',
          text: 'The Save image button exports the whole tracker sheet as a clean PNG, tightly cropped with rounded corners.',
          target: '#saveImageButton',
          placement: 'bottom'
        }
      ]
    },
    tracker: DEFAULT_TRACKER
  };

  var overlay, spotlight, tooltip, modal;
  var renderToken = 0;
  var gateTimer = null;
  var gateSpotlight = false; // REV 58: CTA shifted the spotlight to the gate control

  /* ---------- gate helpers (REV 54: mandatory auth step) ---------- */
  function clearGate() {
    if (gateTimer) { clearInterval(gateTimer); gateTimer = null; }
  }
  function gateCheck(step) {
    if (!step || !step.gate) return true;
    try { return !!step.gate.check(); } catch (e) { return false; }
  }
  function setupGate(step) {
    clearGate();
    if (!overlay || !step || !step.gate) return;
    var next = overlay.querySelector('#tour-next');
    if (!next) return;
    if (gateCheck(step)) return;
    // REV 58: the CTA stays clickable — clicking it runs gate.focus() (spotlight
    // the unlock control + expand the password input) instead of advancing.
    next.disabled = false;
    if (!next.dataset.label) next.dataset.label = 'Next';
    next.textContent = step.gate.hint || 'Unlock to continue';
    gateTimer = setInterval(function () {
      if (!isActive() || !seq[state.idx] || seq[state.idx] !== step) { clearGate(); return; }
      if (gateCheck(step)) {
        clearGate();
        if (next && next.isConnected) {
          next.disabled = false;
          next.textContent = next.dataset.label || 'Next';
        }
        // REV 58: once the gate is satisfied, advance automatically.
        if (step.gate.autoAdvance) {
          setTimeout(function () { if (isActive() && seq[state.idx] === step) advance(); }, 60);
        }
      }
    }, 250);
  }

  /* ---------- helpers ---------- */
  function sessionGet() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function sessionSet(v) {
    try { if (v === null) sessionStorage.removeItem(SESSION_KEY); else sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)); } catch (e) {}
  }
  function buildSeq() {
    var out = [];
    for (var i = 0; i < ORDER.length; i++) {
      var p = ORDER[i];
      var c = configs[p] || DEFAULT_CONFIG[p];
      if (!c || !c.steps) continue;
      for (var s = 0; s < c.steps.length; s++) {
        var st = c.steps[s];
        out.push({ page: p, title: st.title, text: st.text, target: st.target, placement: st.placement, action: st.action, actionLabel: st.actionLabel, external: c.external, gate: st.gate, mobileOnly: st.mobileOnly, desktopOnly: st.desktopOnly, pad: st.pad, scrollTo: st.scrollTo });
      }
    }
    return out;
  }
  function pageOfCurrent() {
    if (!state) return null;
    var st = seq[state.idx];
    return st ? st.page : null;
  }
  function onPage(name) {
    var path = (location.pathname.split('/').pop() || '').toLowerCase();
    var want = (name === 'home' ? 'index.html' : name + '.html').toLowerCase();
    return path === want;
  }
  function isActive() {
    return !!(state && seq.length);
  }

  /* ---------- REV 63: target resolution + responsive step applicability ----------
     Targets may be a single selector, a comma-separated list (the first VISIBLE
     match wins — e.g. desktop cluster vs mobile utility strip), or a function
     returning an element or a {x,y,w,h} viewport-rect union. mobileOnly steps
     are skipped on desktop so the walkthrough never shows a spotlight for the
     mobile nav dock / FAB on a large screen. */
  function isApplicable(step) {
    if (!step) return true;
    if (step.mobileOnly && window.innerWidth >= 1024) return false;
    if (step.desktopOnly && window.innerWidth < 1024) return false;
    return true;
  }
  function applicableCount(arr) {
    if (!arr) return 0;
    var n = 0;
    for (var i = 0; i < arr.length; i++) if (isApplicable(arr[i])) n++;
    return n;
  }
  function resolveTarget(sel) {
    if (!sel) return null;
    if (typeof sel === 'function') {
      try {
        var out = sel();
        if (!out) return null;
        if (typeof out === 'string') return resolveTarget(out);
        return out;
      } catch (e) { return null; }
    }
    var sels = String(sel).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    for (var i = 0; i < sels.length; i++) {
      var el = null;
      try { el = document.querySelector(sels[i]); } catch (e) { el = null; }
      if (!el) continue;
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
    return null;
  }

  /* ---------- DOM build ---------- */
  function ensureDom() {
    if (overlay && overlay.isConnected) return;
    overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.innerHTML =
      '<div class="tour-spotlight" aria-hidden="true"></div>' +
      '<div class="tour-tooltip" role="dialog" aria-modal="true" aria-labelledby="tour-title">' +
        '<span class="tour-step-chip" id="tour-chip">Step</span>' +
        '<h3 id="tour-title" class="tour-title"></h3>' +
        '<p class="tour-text"></p>' +
        '<div class="tour-actions">' +
          '<button type="button" class="tour-btn tour-btn-primary" id="tour-next">Next</button>' +
          '<button type="button" class="tour-btn tour-btn-skip" id="tour-skip">Skip</button>' +
        '</div>' +
      '</div>' +
      '<div class="tour-confirm-layer" id="tour-confirm">' +
        '<div class="tour-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="tour-confirm-title">' +
          '<h3 id="tour-confirm-title">Exit walkthrough?</h3>' +
          '<p>Are you sure you want to exit the walkthrough?</p>' +
          '<div class="tour-confirm-actions">' +
            '<button type="button" class="tour-btn tour-btn-danger" id="tour-confirm-exit">Confirm / Exit</button>' +
            '<button type="button" class="tour-btn tour-btn-cancel" id="tour-confirm-resume">Resume / Cancel</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    tooltip = overlay.querySelector('.tour-tooltip');
    spotlight = overlay.querySelector('.tour-spotlight');

    overlay.querySelector('#tour-next').addEventListener('click', function () {
      if (window.SFX && window.SFX.playButtonClick) window.SFX.playButtonClick();
      advance();
    });
    overlay.querySelector('#tour-skip').addEventListener('click', function () {
      if (window.SFX && window.SFX.playButtonClick) window.SFX.playButtonClick();
      showConfirm();
    });
    overlay.querySelector('#tour-confirm-exit').addEventListener('click', function () {
      if (window.SFX && window.SFX.playButtonClick) window.SFX.playButtonClick();
      finish();
    });
    overlay.querySelector('#tour-confirm-resume').addEventListener('click', function () {
      if (window.SFX && window.SFX.playButtonClick) window.SFX.playButtonClick();
      hideConfirm();
    });
  }

  /* ---------- positioning ---------- */
  function measure(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  function position(step) {
    if (!overlay || !overlay.isConnected || !tooltip || !spotlight) return;
    var M = 16; // viewport edge margin
    var tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    // REV 58: keep the spotlight anchored to the gate's focus target once the
    // CTA has shifted it there (e.g. the UNLOCK button on the homepage), so
    // re-measures don't snap it back onto the step's own target.
    var effective = step.target;
    if (gateSpotlight && step.gate && step.gate.focusTarget) effective = step.gate.focusTarget;
    var target = resolveTarget(effective);
    if (!target) {
      spotlight.style.display = 'none';
      tooltip.style.left = Math.max(M, Math.round((window.innerWidth - tw) / 2)) + 'px';
      tooltip.style.top = Math.max(M, Math.round((window.innerHeight - th) / 2)) + 'px';
      return;
    }
    spotlight.style.display = 'block';
    // REV 63: breathing room between 4-8px around the hard-offset shadow.
    var pad = (step.pad != null ? step.pad : 8);
    var r = (target && typeof target === 'object' && 'w' in target && 'h' in target) ? target : measure(target);
    spotlight.style.left = Math.max(0, r.x - pad) + 'px';
    spotlight.style.top = Math.max(0, r.y - pad) + 'px';
    spotlight.style.width = (r.w + pad * 2) + 'px';
    spotlight.style.height = (r.h + pad * 2) + 'px';

    var spaceTop = r.y, spaceBottom = window.innerHeight - (r.y + r.h);
    var spaceLeft = r.x, spaceRight = window.innerWidth - (r.x + r.w);
    var place = step.placement || (spaceBottom >= th + M ? 'bottom' : 'top');

    // Automatic flip when the preferred side lacks room.
    if (place === 'bottom' && spaceBottom < th + M) place = spaceTop >= th + M ? 'top' : 'bottom';
    else if (place === 'top' && spaceTop < th + M) place = spaceBottom >= th + M ? 'bottom' : 'top';
    else if (place === 'right' && spaceRight < tw + M) place = spaceLeft >= tw + M ? 'left' : 'right';
    else if (place === 'left' && spaceLeft < tw + M) place = spaceRight >= tw + M ? 'right' : 'left';

    var left, top;
    if (place === 'bottom') { left = r.x + r.w / 2 - tw / 2; top = r.y + r.h + 12; }
    else if (place === 'top') { left = r.x + r.w / 2 - tw / 2; top = r.y - th - 12; }
    else if (place === 'right') { left = r.x + r.w + 12; top = r.y + r.h / 2 - th / 2; }
    else { left = r.x - tw - 12; top = r.y + r.h / 2 - th / 2; }

    // Clamp within viewport edges so nothing is ever cropped.
    left = Math.min(Math.max(left, M), Math.max(M, window.innerWidth - tw - M));
    top = Math.min(Math.max(top, M), Math.max(M, window.innerHeight - th - M));
    tooltip.style.left = Math.round(left) + 'px';
    tooltip.style.top = Math.round(top) + 'px';
  }

  /* ---------- rendering ---------- */
  function render() {
    ensureDom();
    gateSpotlight = false;
    // REV 63: never render a step that doesn't apply on the current viewport
    // (e.g. the mobile-only nav/FAB step on a desktop screen).
    if (state && !isApplicable(seq[state.idx])) { advance(); return; }
    var step = seq[state.idx];
    if (!step) { finish(); return; }

    // REV 63: number visible steps contiguously so a skipped mobile-only step
    // never leaves a gap in the "Step X of Y" chip.
    state.total = applicableCount(seq);
    var visibleIdx = applicableCount(seq.slice(0, state.idx + 1));
    tooltip.querySelector('.tour-step-chip').textContent = 'Step ' + visibleIdx + ' of ' + state.total;
    tooltip.querySelector('#tour-title').textContent = step.title;
    tooltip.querySelector('.tour-text').textContent = step.text;
    var next = tooltip.querySelector('#tour-next');
    var isLast = visibleIdx === state.total;
    next.textContent = isLast ? 'Finish' : 'Next';

    var action = tooltip.querySelector('.tour-action-external');
    if (action) action.remove();
    if (step.external && step.action) {
      action = document.createElement('a');
      action.className = 'tour-btn tour-btn-external tour-action-external';
      action.target = '_blank';
      action.rel = 'noopener noreferrer';
      action.href = step.action;
      action.textContent = step.actionLabel || 'Open Tracker';
      tooltip.querySelector('.tour-actions').insertBefore(action, next);
    }

    overlay.style.display = 'block';
    hideConfirm();
    document.body.style.overflow = 'hidden';

    var token = ++renderToken;
    requestAnimationFrame(function () { if (token === renderToken) position(step); });
    // Re-measure a few times to catch targets rendered after load.
    setTimeout(function () { if (token === renderToken) position(step); }, 250);
    setTimeout(function () { if (token === renderToken) position(step); }, 800);

    setupGate(step);

    if (step.scrollTo !== false) {
      var t = step.target && resolveTarget(step.target);
      if (t && !('w' in t && 'h' in t) && typeof t.scrollIntoView === 'function') {
        t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  /* ---------- flow ---------- */
  function advance() {
    var cur = seq[state.idx];
    if (cur && cur.gate && !gateCheck(cur)) {
      // REV 58: instead of silently ignoring clicks on the gated step, shift the
      // spotlight to the unlock control and expand the password input.
      if (cur.gate.focus) { try { cur.gate.focus(); } catch (e) {} }
      return;
    }
    clearGate();
    state.idx += 1;
    // REV 63: skip steps that don't apply on the current viewport.
    while (state.idx < seq.length && !isApplicable(seq[state.idx])) state.idx += 1;
    if (state.idx >= seq.length) { finish(); return; }
    sessionSet({ idx: state.idx, total: state.total });
    var step = seq[state.idx];
    if (!step) { finish(); return; }
    if (step.page === 'tracker') { render(); return; }
    if (!onPage(step.page)) {
      var c = configs[step.page] || DEFAULT_CONFIG[step.page];
      if (c && c.url) { location.href = c.url; return; }
    }
    render();
  }

  function finish() {
    clearGate();
    state = null;
    sessionSet(null);
    if (overlay && overlay.isConnected) {
      overlay.remove();
      overlay = null; spotlight = null; tooltip = null; modal = null;
    }
    document.body.style.overflow = '';
  }

  function showConfirm() {
    ensureDom();
    overlay.querySelector('#tour-confirm').classList.add('is-open');
  }
  function hideConfirm() {
    if (overlay) overlay.querySelector('#tour-confirm').classList.remove('is-open');
  }

  function onResize() {
    if (isActive() && overlay && overlay.isConnected) {
      var step = seq[state.idx];
      if (step) position(step);
    }
  }

  document.addEventListener('keydown', function (e) {
    if (!isActive()) return;
    if (e.key === 'Escape') showConfirm();
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.id === 'tour-next') {
      e.preventDefault();
      advance();
    }
  });
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);

  /* ---------- public API ---------- */
  window.ArcTour = {
    register: function (name, cfg) { configs[name] = cfg; },
    isActive: isActive,
    startFrom: function (name) {
      seq = buildSeq();
      if (!seq.length) return;
      var idx = 0;
      if (name && name !== ORDER[0]) {
        var found = false;
        for (var i = 0; i < seq.length; i++) {
          if (seq[i].page === name) { idx = i; found = true; break; }
        }
        if (!found) idx = 0;
      }
      while (idx < seq.length && !isApplicable(seq[idx])) idx += 1;
      state = { idx: idx, total: applicableCount(seq) };
      sessionSet({ idx: idx, total: applicableCount(seq) });
      render();
    },
    resume: function () {
      var s = sessionGet();
      if (!s || !s.total) return;
      seq = buildSeq();
      if (!seq.length || !seq[s.idx]) { finish(); return; }
      var step = seq[s.idx];
      if (step.page !== 'tracker' && !onPage(step.page)) { finish(); return; }
      state = { idx: s.idx, total: applicableCount(seq) };
      render();
    },
    finish: finish,
    // REV 64: let pages re-measure the current step's spotlight after they
    // mutate their layout (e.g. the password flyout opening) so a function
    // target can grow to cover the newly revealed popover.
    reposition: function () {
      if (isActive() && overlay && overlay.isConnected) {
        var step = seq[state.idx];
        if (step) position(step);
      }
    }
  };
})();
