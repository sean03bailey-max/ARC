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
          text: 'Use the Dark Mode button to toggle light and dark. The sound button beside it turns button sounds on or off, and the (?) button restarts this tour anytime.',
          target: '#themeToggle',
          placement: 'bottom'
        }
      ]
    },
    nexus: {
      url: 'NEXUS.html',
      steps: [
        {
          title: 'Unlock Editing',
          text: 'Editing is locked. Click the UNLOCK button, then enter the password into the field that appears. Once editing is verified unlocked, the Next button unlocks automatically.',
          target: '#passwordWidget',
          placement: 'right',
          gate: {
            check: function () {
              var t = document.getElementById('passwordToggle');
              return !!(t && t.classList.contains('is-unlocked'));
            },
            hint: 'Unlock editing to continue'
          }
        },
        {
          title: 'Action Board Controls',
          text: 'The Action Board stacks the Walkthrough (?), Sound, Dark Mode, and Edit Lock buttons in order. Use them to restart this tour, mute or unmute button sounds, switch themes, and lock or unlock editing.',
          target: '.utility-cluster',
          placement: 'right'
        },
        {
          title: 'Resource Cards',
          text: 'Each card is a QR resource: a scannable code with a title and URL. Click a title or URL to edit it (when editing is unlocked) and use the card actions to organize, copy, or save.',
          target: '.resource-item .qr-card',
          placement: 'top'
        },
        {
          title: 'Expand & QR Previews',
          text: 'Click the expand action (maximize icon) on any card to open a large preview with rich-text editing of its description and a closer look at the QR code.',
          target: '.resource-item .card-action[data-action="expand"]',
          placement: 'right'
        },
        {
          title: 'Board Save',
          text: 'The Save Board button exports the entire board as a shareable PNG image \u2014 perfect for posting or offline use.',
          target: '#save-board-button',
          placement: 'bottom'
        }
      ]
    },
    core: {
      url: 'core.html',
      steps: [
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
    next.disabled = true;
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
        out.push({ page: p, title: st.title, text: st.text, target: st.target, placement: st.placement, action: st.action, actionLabel: st.actionLabel, external: c.external, gate: st.gate });
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
    var target = null;
    if (step.target) target = document.querySelector(step.target);
    if (!target) {
      spotlight.style.display = 'none';
      tooltip.style.left = Math.max(M, Math.round((window.innerWidth - tw) / 2)) + 'px';
      tooltip.style.top = Math.max(M, Math.round((window.innerHeight - th) / 2)) + 'px';
      return;
    }
    spotlight.style.display = 'block';
    var pad = 10;
    var r = measure(target);
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
    var step = seq[state.idx];
    if (!step) { finish(); return; }

    tooltip.querySelector('.tour-step-chip').textContent = 'Step ' + (state.idx + 1) + ' of ' + state.total;
    tooltip.querySelector('#tour-title').textContent = step.title;
    tooltip.querySelector('.tour-text').textContent = step.text;
    var next = tooltip.querySelector('#tour-next');
    var isLast = state.idx === state.total - 1;
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
      var t = step.target && document.querySelector(step.target);
      if (t && typeof t.scrollIntoView === 'function') {
        t.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    }
  }

  /* ---------- flow ---------- */
  function advance() {
    var cur = seq[state.idx];
    if (cur && cur.gate && !gateCheck(cur)) return;
    clearGate();
    state.idx += 1;
    if (state.idx >= state.total) { finish(); return; }
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
      state = { idx: idx, total: seq.length };
      sessionSet({ idx: idx, total: seq.length });
      render();
    },
    resume: function () {
      var s = sessionGet();
      if (!s || !s.total) return;
      seq = buildSeq();
      if (!seq.length || !seq[s.idx]) { finish(); return; }
      var step = seq[s.idx];
      if (step.page !== 'tracker' && !onPage(step.page)) { finish(); return; }
      state = { idx: s.idx, total: s.total };
      render();
    },
    finish: finish
  };
})();
