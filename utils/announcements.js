/* REV 70: Announcements / FEED data layer + dynamic unread badge.
   Zero dependencies. Loaded by every page that shows a notification trigger
   (NEXUS, CORE, FEED). Exposes window.ArcFeed and self-runs badge refresh:
     - cache-first reads (window.__ARC_BOOT.feedCache / arc_cache_feed)
     - server sync from GET/POST /api/state?app=feed  {announcements:[...]}
     - read tracking in localStorage 'arc_read_announcements'
     - badge rendering for every .notif-badge span on the page

   Badge display rules: unread 0 -> hidden; 1..99 -> number; >99 -> "99+".
   Opening the FEED page marks all active ids read with a scale-out exit. */
(function () {
  'use strict';

  var READ_KEY = 'arc_read_announcements';
  var CACHE_KEY = 'arc_cache_feed';
  var MAX_BADGE = 99;

  var SEED_ANNOUNCEMENTS = [
    {
      id: 'ann-seed-001',
      title: 'BLOOD DONATION DRIVE — VOLUNTEER SHIFT ADJUSTMENTS',
      category: 'Urgent',
      author: 'ARC Council Operations',
      content: 'Effective immediately: the Friday blood donation drive shifts to a two-wave schedule. Wave A reports at 7:00 AM, Wave B at 11:30 AM. Bring your volunteer ID and water bottle. Marshals must confirm their posts with the duty officer before 6:45 AM.',
      timestamp: '2026-08-21T02:30:00.000Z',
      isPinned: true,
      externalLink: ''
    },
    {
      id: 'ann-seed-002',
      title: 'August Deployment Roster — Finalized',
      category: 'Deployment',
      author: 'Miguel Santos, Deployment Officer',
      content: 'The finalized deployment roster for the last week of August is out. Check your station assignments under CORE > Deliverables. Swap requests close Wednesday 5 PM — file them through your batch lieutenant, not in this board.',
      timestamp: '2026-08-19T07:15:00.000Z',
      isPinned: false,
      externalLink: ''
    },
    {
      id: 'ann-seed-003',
      title: 'First-Aid Recertification Training',
      category: 'Training',
      author: 'Training Committee',
      content: 'Standard first-aid recertification runs this Saturday, 9 AM - 12 NN at the Red Cross chapter hall. Slots are limited to 40. Wear closed shoes and comfortable attire; certification cards release within two weeks of completion.',
      timestamp: '2026-08-17T23:00:00.000Z',
      isPinned: false,
      externalLink: 'https://redcross.org.ph/first-aid/'
    },
    {
      id: 'ann-seed-004',
      title: 'General Assembly Attendance Policy Reminder',
      category: 'General',
      author: 'Secretary General',
      content: 'Reminder: members with two unexcused absences from general assemblies this semester lose eligibility for end-of-term recognition. Excuse letters go to the secretary at least 24 hours before the assembly.',
      timestamp: '2026-08-14T09:45:00.000Z',
      isPinned: false,
      externalLink: ''
    },
    {
      id: 'ann-seed-005',
      title: 'Relief Operations Packing — Extra Hands Needed',
      category: 'Deployment',
      author: 'ARC Council Operations',
      content: 'We need twelve additional volunteers for relief pack assembly this Sunday morning at the warehouse. No training required — marshals will brief on site. Sign-up sheet closes once slots fill.',
      timestamp: '2026-08-12T05:20:00.000Z',
      isPinned: false,
      externalLink: ''
    },
    {
      id: 'ann-seed-006',
      title: 'Junior First-Aid Instructor Track — Applications Open',
      category: 'Training',
      author: 'Training Committee',
      content: 'Applications for the junior instructor track are open to members who completed both basic and standard first aid. Submit your intent form and certificate scans by month-end. Interviews follow the second week of September.',
      timestamp: '2026-08-10T01:10:00.000Z',
      isPinned: false,
      externalLink: ''
    }
  ];

  function safeParse(raw, fallback) {
    try { var v = JSON.parse(raw); return v === null || v === undefined ? fallback : v; }
    catch (e) { return fallback; }
  }

  function getReadIds() {
    try { return safeParse(localStorage.getItem(READ_KEY), []) || []; } catch (e) { return []; }
  }

  function setReadIds(ids) {
    try { localStorage.setItem(READ_KEY, JSON.stringify(ids)); } catch (e) {}
  }

  function writeCache(list) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ announcements: list })); } catch (e) {}
  }

  function cachedAnnouncements() {
    /* REV 75: prefer the LIVE cache. The frozen __ARC_BOOT snapshot is only
       a fallback — treating it as authoritative made every togglePin/add
       build on the page-load state, silently discarding prior edits. */
    try {
      var live = safeParse(localStorage.getItem(CACHE_KEY), {});
      if (live && Array.isArray(live.announcements) && live.announcements.length) return live.announcements;
    } catch (e) {}
    var boot = window.__ARC_BOOT || {};
    if (boot.feedCache && Array.isArray(boot.feedCache.announcements)) return boot.feedCache.announcements;
    return null;
  }

  function computeUnread(list, readIds) {
    if (!Array.isArray(list)) return 0;
    return list.filter(function (item) { return item && readIds.indexOf(item.id) === -1; }).length;
  }

  function renderBadge(el, count) {
    if (!el) return;
    el.classList.remove('badge-out');
    if (!count || count <= 0) {
      el.classList.remove('is-visible');
      el.textContent = '';
      return;
    }
    el.textContent = count > MAX_BADGE ? MAX_BADGE + '+' : String(count);
    el.classList.add('is-visible');
  }

  function refreshBadges(announcementsOverride) {
    var badges = document.querySelectorAll('.notif-badge');
    if (!badges.length) return;
    var list = announcementsOverride || cachedAnnouncements();
    var unread = computeUnread(list, getReadIds());
    badges.forEach(function (el) { renderBadge(el, unread); });
    return unread;
  }

  function markAllRead(announcements) {
    var list = announcements || cachedAnnouncements() || [];
    var read = getReadIds();
    var changed = false;
    list.forEach(function (item) {
      if (item && item.id && read.indexOf(item.id) === -1) { read.push(item.id); changed = true; }
    });
    if (changed) setReadIds(read);
    // Scale-down exit then hide.
    var badges = document.querySelectorAll('.notif-badge.is-visible');
    badges.forEach(function (el) {
      el.classList.add('badge-out');
      setTimeout(function () { renderBadge(el, 0); }, 180);
    });
  }

  function fetchAnnouncements() {
    return fetch('/api/state?app=feed')
      .then(function (res) { if (!res.ok) throw new Error('feed load failed'); return res.json(); })
      .then(function (data) {
        var list = Array.isArray(data.announcements) && data.announcements.length ? data.announcements : SEED_ANNOUNCEMENTS;
        writeCache(list);
        refreshBadges(list);
        return list;
      })
      .catch(function () {
        refreshBadges(SEED_ANNOUNCEMENTS);
        return SEED_ANNOUNCEMENTS;
      });
  }

  function persistAnnouncements(list) {
    writeCache(list);
    refreshBadges(list);
    return fetch('/api/state?app=feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'announcements', value: list })
    }).then(function (res) {
      if (!res.ok) throw new Error('feed save failed');
      return true;
    }).catch(function () { return false; });
  }

  function sortFeed(list) {
    return (list || []).slice().sort(function (a, b) {
      if (!!b.isPinned !== !!a.isPinned) return b.isPinned ? 1 : -1;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
  }

  window.ArcFeed = {
    seeds: SEED_ANNOUNCEMENTS,
    getAnnouncements: function () {
      var cached = cachedAnnouncements();
      return Promise.resolve(cached && cached.length ? sortFeed(cached) : sortFeed(SEED_ANNOUNCEMENTS));
    },
    fetchAnnouncements: function () { return fetchAnnouncements().then(sortFeed); },
    saveAll: function (list) { return persistAnnouncements(sortFeed(list)); },
    addAnnouncement: function (item) {
      var self = this;
      return self.getAnnouncements().then(function (list) {
        list.unshift(item);
        return persistAnnouncements(list).then(function (ok) { return ok ? sortFeed(list) : sortFeed(list); });
      });
    },
    updateAnnouncement: function (id, patch) {
      var self = this;
      return self.getAnnouncements().then(function (list) {
        var next = list.map(function (it) { return it && it.id === id ? Object.assign({}, it, patch) : it; });
        return persistAnnouncements(next).then(function () { return sortFeed(next); });
      });
    },
    deleteAnnouncement: function (id) {
      var self = this;
      return self.getAnnouncements().then(function (list) {
        var next = list.filter(function (it) { return it && it.id !== id; });
        return persistAnnouncements(next).then(function () { return sortFeed(next); });
      });
    },
    togglePin: function (id) {
      var self = this;
      return self.getAnnouncements().then(function (list) {
        var target = list.filter(function (it) { return it && it.id === id; })[0];
        if (!target) return sortFeed(list);
        return self.updateAnnouncement(id, { isPinned: !target.isPinned });
      });
    },
    getReadIds: getReadIds,
    markAllRead: markAllRead,
    computeUnread: computeUnread,
    refreshBadges: refreshBadges,
    sortFeed: sortFeed
  };

  // Boot: paint from cache synchronously, then reconcile with the server.
  function boot() {
    refreshBadges();
    if (window.__ARC_FEED_PAGE) {
      // The FEED page marks everything read once its own render completes;
      // it calls ArcFeed.markAllRead() itself after loading.
    }
    fetchAnnouncements();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
