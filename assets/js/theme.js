/* ==========================================================================
   myBlog — colour mode (light / dark / system)
   The inline snippet in <head> has already resolved the initial theme before
   first paint (so there is no flash). This file only wires up the buttons,
   persists the choice, and keeps the browser chrome colour in sync.
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'myblog-theme';
  var VALID = ['light', 'dark', 'system'];
  var root = document.documentElement;
  var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  var CHROME = { light: '#f2e8d5', dark: '#14110d' };

  function readPref() {
    var stored = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      /* private mode / storage disabled — fall through */
    }

    if (VALID.indexOf(stored) === -1) {
      stored = root.getAttribute('data-theme-pref');
    }
    if (VALID.indexOf(stored) === -1) {
      stored = 'system';
    }
    return stored;
  }

  function resolve(pref) {
    if (pref !== 'system') {
      return pref;
    }
    return (mql && mql.matches) ? 'dark' : 'light';
  }

  function apply(pref) {
    var effective = resolve(pref);

    root.setAttribute('data-theme', effective);
    root.setAttribute('data-theme-pref', pref);
    root.style.colorScheme = effective;

    var buttons = document.querySelectorAll('[data-theme-set]');
    for (var i = 0; i < buttons.length; i++) {
      var isActive = buttons[i].getAttribute('data-theme-set') === pref;
      buttons[i].setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', CHROME[effective]);
    }
  }

  function choose(pref) {
    try {
      window.localStorage.setItem(STORAGE_KEY, pref);
    } catch (e) {
      /* ignore — the choice still applies for this page view */
    }
    apply(pref);
  }

  function init() {
    apply(readPref());

    var buttons = document.querySelectorAll('[data-theme-set]');
    for (var i = 0; i < buttons.length; i++) {
      (function (button) {
        button.addEventListener('click', function () {
          choose(button.getAttribute('data-theme-set'));
        });
      })(buttons[i]);
    }

    // Follow the OS live while "system" is selected.
    function onSystemChange() {
      if (readPref() === 'system') {
        apply('system');
      }
    }

    if (mql) {
      if (mql.addEventListener) {
        mql.addEventListener('change', onSystemChange);
      } else if (mql.addListener) {
        mql.addListener(onSystemChange);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
