// Scripted motion and small interactions for the whole site: theme switch, FAQ accordion, scroll reveals, count-ups,
// parallax, the scroll progress line and the nav shadow. Motion is skipped under Reduce Motion.
(function () {
  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Theme switch (the saved choice is applied before paint by the inline script in <head>)
  var toggle = document.querySelector('.toggle');
  if (toggle) {
    var paint = function () {
      var dark = root.dataset.theme === 'dark';
      toggle.setAttribute('aria-checked', String(dark));
      toggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
      var track = toggle.querySelector('.toggle-track');
      if (track) track.setAttribute('data-on', String(dark));
    };
    paint();
    toggle.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('kavi-theme', next); } catch (e) {}
      paint();
    });
  }

  // ---- FAQ: one open at a time
  var qas = document.querySelectorAll('.qa');
  qas.forEach(function (qa) {
    var btn = qa.querySelector('.qa-head');
    btn.addEventListener('click', function () {
      var open = !qa.classList.contains('open');
      qas.forEach(function (o) { o.classList.remove('open'); o.querySelector('.qa-head').setAttribute('aria-expanded', 'false'); });
      if (open) { qa.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });

  // ---- Big screens: the page grows a little, up to 1.5x (see .wrap in style.css)
  var zoom = function () { root.style.setProperty('--z', window.innerWidth > 1500 ? Math.min(1.5, 1 + (window.innerWidth - 1500) / 2500).toFixed(3) : '1'); };
  zoom();
  window.addEventListener('resize', zoom);

  // ---- Nav shadow and scroll progress line
  var nav = document.querySelector('.nav');
  var raf = 0;
  var onScroll = function () {
    raf = 0;
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 8);
    var max = document.documentElement.scrollHeight - window.innerHeight;
    nav.style.setProperty('--progress', String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
  };
  onScroll();
  window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(onScroll); }, { passive: true });

  if (reduced) return;

  // ---- Parallax: layers marked data-depth drift against the scroll while on screen. Offsets go into --py (and --rx / --sc for data-tilt).
  var pframe = 0, rate = 1, lastY = window.scrollY;
  var live = new Set();
  var applied = new WeakMap();
  var track = document.querySelector('.marquee-track');
  var clamp = function (v, m) { return Math.max(-m, Math.min(m, v)); };
  var parallax = function () {
    pframe = 0;
    var vh = window.innerHeight;
    var soft = window.innerWidth < 800 && window.matchMedia('(hover: none)').matches ? 0.5 : 1;
    var reads = [];
    live.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var prev = applied.get(el) || 0;
      reads.push([el, r.top + r.height / 2 - prev - vh / 2, parseFloat(el.dataset.depth || '0')]);
    });
    reads.forEach(function (x) {
      var el = x[0], d = x[1], depth = x[2];
      var off = clamp((d / vh) * depth * 220 * soft, 40 * soft);
      applied.set(el, off);
      el.style.setProperty('--py', off.toFixed(1) + 'px');
      if (el.hasAttribute('data-tilt')) {
        var t = clamp(d / vh, 1);
        el.style.setProperty('--rx', (t * 5).toFixed(2) + 'deg');
        el.style.setProperty('--sc', (1 - Math.abs(t) * 0.04).toFixed(3));
      }
    });
    // The meal marquee speeds up while the page is scrolling and eases back.
    var v = Math.abs(window.scrollY - lastY);
    lastY = window.scrollY;
    rate = Math.max(1, rate + (1 + Math.min(4, v / 12) - rate) * 0.18);
    if (track && track.getAnimations) track.getAnimations().forEach(function (a) { a.playbackRate = rate; });
    if (rate > 1.02 || v > 0) pframe = requestAnimationFrame(parallax);
  };
  var kick = function () { if (!pframe) pframe = requestAnimationFrame(parallax); };
  var pio = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) live.add(en.target); else live.delete(en.target); });
    kick();
  }, { rootMargin: '10% 0px' });
  document.querySelectorAll('[data-depth]').forEach(function (el) { pio.observe(el); });
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick);

  // ---- A soft light follows the pointer across cards (read as --mx / --my in the CSS)
  window.addEventListener('pointermove', function (e) {
    var card = e.target && e.target.closest ? e.target.closest('.tile, .step, .price') : null;
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
  }, { passive: true });

  // ---- Scroll reveals (siblings stagger by 70ms) and count-ups
  root.classList.add('js');
  var count = function (el) {
    var to = parseFloat(el.dataset.count || '0');
    var dec = parseInt(el.dataset.dec || '0', 10);
    var pre = el.dataset.prefix || '';
    var t0 = performance.now();
    var step = function (now) {
      var t = Math.min(1, (now - t0) / 1400);
      el.textContent = pre + (to * (1 - Math.pow(1 - t, 3))).toFixed(dec);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  var rv = Array.prototype.slice.call(document.querySelectorAll('.label, .lede, .step, .tile, .pricing .seg, .price, .waitlist .box, .qa, .marquee'));
  rv.forEach(function (el) {
    el.classList.add('rv');
    var idx = Array.prototype.indexOf.call(el.parentElement ? el.parentElement.children : [], el);
    el.style.setProperty('--d', Math.min(idx, 5) * 0.07 + 's');
  });
  var all = rv.concat(Array.prototype.slice.call(document.querySelectorAll('[data-words], .steps, .bento, .faq-head, .sleepspot, .device')));
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      el.classList.add('in');
      el.querySelectorAll('[data-count]').forEach(count);
      io.unobserve(el);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  all.forEach(function (el) { io.observe(el); });
})();
