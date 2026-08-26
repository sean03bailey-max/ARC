/* REV 72: Two-tier authentication helpers — synchronous, zero dependencies.
   Loaded in <head> BEFORE each page's bootstrap inline script so
   ArcAuth.migrateOnce() and the tier reads happen before first paint.

   Tier 1 (base access)  → localStorage 'arc_auth_tier1'   (homepage gate)
   Tier 2 (admin edit)   → localStorage 'arc_auth_tier2'   (board edit lock)

   Inheritance: Tier 2 implies Tier 1. Strict isolation upward: Tier 1 never
   grants board editing. States persist across routes/reloads until the user
   explicitly relocks (boards drop Tier 2; homepage drops Tier 1 only). */
(function () {
  'use strict';

  function raw(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  window.ArcAuth = {
    isTier2Unlocked: function () { return raw('arc_auth_tier2') === 'true'; },
    isTier1Unlocked: function () {
      return raw('arc_auth_tier1') === 'true' || this.isTier2Unlocked();
    },
    setTier1: function (v) {
      try { localStorage.setItem('arc_auth_tier1', v ? 'true' : 'false'); } catch (e) {}
    },
    setTier2: function (v) {
      try { localStorage.setItem('arc_auth_tier2', v ? 'true' : 'false'); } catch (e) {}
    },
    /* One-time adoption of the legacy single-key state: boards unlocked under
       REV ≤71's arc_edit_locked='false' carry into arc_auth_tier2='true'.
       Idempotent — only fires while no tier keys exist yet. */
    migrateOnce: function () {
      if (raw('arc_auth_tier1') !== null || raw('arc_auth_tier2') !== null) return;
      var legacy = raw('arc_edit_locked');
      if (legacy === null) return;
      this.setTier2(legacy === 'false');
      try { localStorage.removeItem('arc_edit_locked'); } catch (e) {}
    }
  };
})();
