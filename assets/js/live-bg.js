/* ==========================================================================
   myBlog — live background
   A dependency-free <canvas> painted behind the page content. One uniform,
   full-bleed pattern edge to edge — there is no horizon and no "ground", so
   every part of the screen gets the same treatment:

     • a phosphor dot lattice covering the whole viewport, breathing on a
       slow diagonal ripple
     • a bright refresh band that sweeps down the full width like a CRT
       retrace, speeding up while you scroll
     • a drifting, twinkling starfield with pointer parallax
     • a centre glow, corner vignette and readability wash

   The palette below mirrors the colour tokens in assets/css/style.css (the
   same way assets/js/theme.js mirrors the browser chrome colours) and is
   swapped whenever the active colour mode changes, so the background always
   follows light / dark / system.

   The loop pauses while the tab is hidden, never animates when the visitor
   prefers reduced motion, and can be switched off from the header.
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'myblog-motion';
  var TAU = Math.PI * 2;

  var canvas = document.getElementById('live-bg');
  if (!canvas || !canvas.getContext) { return; }

  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  /* Mirrors --bg / --primary / --accent / --wash from assets/css/style.css. */
  var PALETTE = {
    light: {
      bg:       [242, 232, 213],
      star:     [138, 107, 61],
      dot:      [194, 65, 12],
      glow:     [233, 162, 59],
      dotBase:  0.40,
      dotAmp:   0.16,
      washMid:  0.85,
      washEdge: 0.32
    },
    dark: {
      bg:       [20, 17, 13],
      star:     [255, 217, 160],
      dot:      [255, 138, 61],
      glow:     [255, 200, 87],
      dotBase:  0.32,
      dotAmp:   0.14,
      washMid:  0.82,
      washEdge: 0.26
    }
  };

  /* ---------- Viewport ---------- */
  var W = 0, H = 0, DPR = 1, gap = 34;

  /* ---------- Animation state ---------- */
  var stars = [];
  var time = 0;          /* seconds; drives the ripple and the sweep */
  var boost = 1;         /* scroll-velocity multiplier */
  var scrollVel = 0;
  var lastScrollY = window.pageYOffset || 0;

  /* Pointer position, -1..1, eased towards `aim`. */
  var par = { x: 0, y: 0 };
  var aim = { x: 0, y: 0 };

  var raf = 0, last = 0, running = false;
  var resizeTimer = 0;

  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  /* ---------- Theme ---------- */
  var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function currentMode() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') { return attr; }
    return (mql && mql.matches) ? 'dark' : 'light';
  }

  /* ---------- Stars ---------- */
  function newStar() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      radius: 0.5 + Math.random() * 1.5,
      alpha: 0.18 + Math.random() * 0.54,
      depth: 0.2 + Math.random() * 0.8,   /* parallax + drift speed */
      phase: Math.random() * TAU,
      twinkle: 0.5 + Math.random() * 1.9
    };
  }

  function buildStars() {
    var count = Math.max(40, Math.min(150, Math.round((W * H) / 11000)));
    stars = [];
    for (var i = 0; i < count; i++) { stars.push(newStar()); }
  }

  /* ---------- Sizing ---------- */
  function resize(rebuildStars) {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;

    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    /* Keep roughly the same number of dots on a phone and a wide monitor so
       the pattern reads identically everywhere. */
    gap = Math.max(26, Math.min(46, Math.round(Math.sqrt((W * H) / 1650))));

    if (rebuildStars || !stars.length) { buildStars(); }
  }

  /* ---------- Painting ---------- */
  function drawStars(p) {
    ctx.fillStyle = rgba(p.star, 1);
    ctx.strokeStyle = rgba(p.star, 1);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var x = s.x + par.x * s.depth * 46;
      var y = s.y + par.y * s.depth * 30;
      var a = s.alpha * (0.6 + 0.4 * Math.sin(s.phase));
      if (a <= 0.02) { continue; }

      ctx.globalAlpha = a;
      if (s.radius > 1.15) {
        /* A soft cross flare on the brightest stars, retro-lens style. */
        ctx.beginPath();
        ctx.moveTo(x - s.radius * 3.2, y);
        ctx.lineTo(x + s.radius * 3.2, y);
        ctx.moveTo(x, y - s.radius * 3.2);
        ctx.lineTo(x, y + s.radius * 3.2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, s.radius, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* The lattice: one dot per cell, tiled over the entire viewport, so there is
     no horizon and every region of the screen looks the same. Brightness is a
     slow diagonal ripple plus a refresh band that sweeps down the full width
     and leans forwards while you scroll. */
  function drawLattice(p) {
    var size = gap > 30 ? 3.2 : 2.6;
    var shiftX = par.x * 7, shiftY = par.y * 7;
    var span = H + 520;
    var sweepY = ((time * 105) % span) - 260;

    ctx.fillStyle = rgba(p.dot, 1);

    var y = (((shiftY % gap) + gap) % gap) - gap;
    for (; y < H + gap; y += gap) {
      var near = 1 - Math.min(1, Math.abs(y - sweepY) / 260);
      var band = 0.28 * near * near;

      var x = (((shiftX % gap) + gap) % gap) - gap;
      for (; x < W + gap; x += gap) {
        var ripple = Math.sin((x + y) * 0.012 - time * 1.5);
        var a = p.dotBase + p.dotAmp * ripple + band;
        if (a <= 0.02) { continue; }
        ctx.globalAlpha = a > 0.9 ? 0.9 : a;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* Phosphor glow in the middle, plus a corner vignette. */
  function drawGlow(p) {
    var max = Math.max(W, H);
    var cx = W / 2, cy = H * 0.44;

    var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, max * 0.6);
    glow.addColorStop(0, rgba(p.glow, 0.17));
    glow.addColorStop(0.6, rgba(p.glow, 0.06));
    glow.addColorStop(1, rgba(p.glow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    var vig = ctx.createRadialGradient(cx, H / 2, max * 0.5, cx, H / 2, max * 0.8);
    vig.addColorStop(0, rgba(p.bg, 0));
    vig.addColorStop(1, rgba(p.bg, 0.5));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  /* Wash protects text contrast, so it is heaviest in the middle where the
     .container column sits and thins toward the edges. The lattice is still a
     single uniform full-screen pattern; only its contrast is graded. */
  function drawWash(p) {
    var r = Math.max(W, H) * 0.8;
    var wash = ctx.createRadialGradient(W / 2, H * 0.46, r * 0.1, W / 2, H * 0.46, r);
    wash.addColorStop(0, rgba(p.bg, p.washMid));
    wash.addColorStop(1, rgba(p.bg, p.washEdge));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);
  }

  function render() {
    var p = PALETTE[currentMode()];

    ctx.fillStyle = rgba(p.bg, 1);
    ctx.fillRect(0, 0, W, H);

    drawLattice(p);
    drawStars(p);
    drawGlow(p);
    drawWash(p);
  }

  function update(dt) {
    var i, s;

    for (i = 0; i < stars.length; i++) {
      s = stars[i];
      s.x -= s.depth * 13 * dt;
      s.y -= s.depth * 3.5 * dt;
      s.phase += s.twinkle * dt;
      if (s.x < -4) { s.x += W + 8; }
      if (s.y < -4) { s.y += H + 8; }
    }

    /* One clock for the ripple and the sweep; scrolling winds it forward. */
    time += dt * boost;

    boost = 1 + Math.min(scrollVel * 0.22, 2.6);
    scrollVel -= scrollVel * Math.min(1, dt * 5);
    if (scrollVel < 0.02) { scrollVel = 0; }

    var ease = Math.min(1, dt * 3.5);
    par.x += (aim.x - par.x) * ease;
    par.y += (aim.y - par.y) * ease;
  }

  /* ---------- Motion preference ---------- */
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function storedMotion() {
    var v = null;
    try { v = window.localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage off */ }
    return (v === 'on' || v === 'off') ? v : null;
  }

  /* No saved choice: follow prefers-reduced-motion. */
  function motionAllowed() {
    return !(motionQuery && motionQuery.matches);
  }

  /* ---------- Loop ---------- */
  function frame(now) {
    if (!running) { return; }
    raf = window.requestAnimationFrame(frame);
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    update(dt);
    render();
  }

  function start() {
    if (running) { return; }
    running = true;
    last = 0;
    raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) { return; }
    running = false;
    window.cancelAnimationFrame(raf);
  }

  /* ---------- Header toggle ---------- */
  function syncButtons(on) {
    var buttons = document.querySelectorAll('[data-motion-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      buttons[i].setAttribute('title', on ? 'Pause background animation' : 'Play background animation');
    }
  }

  function applyMotion(on, persist) {
    if (persist) {
      try { window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    }

    syncButtons(on);

    /* Paint once up front: the canvas is created opaque black, so the first
       frame must land before the fade-in or the page flashes dark. */
    update(0);
    render();
    canvas.classList.add('is-ready');

    if (on) { start(); } else { stop(); }
  }

  /* ---------- Events ---------- */
  function onPointerMove(e) {
    aim.x = (e.clientX / W - 0.5) * 2;
    aim.y = (e.clientY / H - 0.5) * 2;
  }

  function onScroll() {
    var y = window.pageYOffset || 0;
    scrollVel = Math.abs(y - lastScrollY);
    lastScrollY = y;
  }

  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () { resize(true); }, 150);
  }

  function onVisibility() {
    if (document.hidden) { stop(); }
    else if (storedMotion() !== 'off' && motionAllowed()) { start(); }
  }

  function onThemeChange() {
    /* Static mode needs an explicit repaint; the loop picks it up itself. */
    if (!running) { update(0); render(); }
  }

  function onSystemMotionChange() {
    if (storedMotion()) { return; }
    applyMotion(motionAllowed(), false);
  }

  function bind() {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    if (window.MutationObserver) {
      new window.MutationObserver(onThemeChange).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
    }

    if (mql) {
      if (mql.addEventListener) { mql.addEventListener('change', onThemeChange); }
      else if (mql.addListener) { mql.addListener(onThemeChange); }
    }

    if (motionQuery) {
      if (motionQuery.addEventListener) { motionQuery.addEventListener('change', onSystemMotionChange); }
      else if (motionQuery.addListener) { motionQuery.addListener(onSystemMotionChange); }
    }

    var buttons = document.querySelectorAll('[data-motion-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      (function (button) {
        button.addEventListener('click', function () {
          var on = button.getAttribute('aria-pressed') !== 'true';
          applyMotion(on, true);
        });
      })(buttons[i]);
    }
  }

  /* ---------- Init ---------- */
  function init() {
    resize(true);
    bind();
    applyMotion(storedMotion() !== 'off' && motionAllowed(), false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();