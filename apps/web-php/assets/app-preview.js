// Interactions for the phone mock-up (port of components/AppPreview.tsx). The markup comes from
// includes/app-preview.php; screens are cloned from <template>s so each tab opens in its starting state.
(function () {
  'use strict';

  var root = document.querySelector('[data-ph-root]');
  if (!root) return;

  var cfg = { tabs: [], note: 3600 };
  try { cfg = JSON.parse(root.querySelector('[data-ph-config]').textContent); } catch (e) {}
  var NOTE_MS = cfg.note || 3600;
  var screen = root.querySelector('.phone-screen');
  var tabbar = root.querySelector('.ph-tabbar');
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var noteTimer = 0;
  var tab = 0;
  var raf = 0;
  var swipe = null;

  function tpl(sel) { return root.querySelector('template[' + sel + ']'); }

  // ---- Toast ("preview only")

  function clearNote() {
    clearTimeout(noteTimer);
    var n = screen.querySelector('.ph-note');
    if (n) n.remove();
  }
  function ask(msg) {
    clearNote();
    var n = document.createElement('div');
    n.className = 'ph-note';
    n.setAttribute('role', 'status');
    var img = document.createElement('img');
    img.className = 'ph-pip ';
    img.src = '/mascot/cheer.svg';
    img.alt = '';
    img.width = 44;
    img.height = 44;
    img.draggable = false;
    var span = document.createElement('span');
    span.textContent = msg;
    n.appendChild(img);
    n.appendChild(span);
    screen.insertBefore(n, tabbar);
    noteTimer = setTimeout(clearNote, NOTE_MS);
  }

  // ---- This Week

  // Counts up from zero when the screen opens, like the app's budget total.
  function countUp(tabEl) {
    cancelAnimationFrame(raf);
    var el = tabEl.querySelector('[data-ph-count]');
    if (!el || reduced) return;
    var to = parseInt(el.getAttribute('data-ph-count'), 10);
    var t0 = performance.now();
    el.textContent = '$0';
    var step = function (now) {
      var t = Math.min(1, (now - t0) / 1100);
      el.textContent = '$' + Math.round(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function goDay(tabEl, n) {
    var day = parseInt(tabEl.getAttribute('data-day') || '0', 10);
    if (n === day || n < 0 || n > 6) return;
    var dir = n > day ? 1 : -1;
    tabEl.setAttribute('data-day', String(n));
    var chips = tabEl.querySelectorAll('.ph-chip');
    for (var i = 0; i < chips.length; i++) {
      var on = i === n;
      chips[i].classList.toggle('on', on);
      chips[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    var deck = tabEl.querySelector('[data-ph-deck]');
    var t = tpl('data-ph-day="' + n + '"');
    if (!deck || !t) return;
    var wrap = document.createElement('div');
    wrap.className = dir > 0 ? 'ph-in-right' : 'ph-in-left';
    wrap.appendChild(t.content.cloneNode(true));
    deck.replaceChildren(wrap);
  }

  // ---- Groceries

  function updateTotals(tabEl) {
    var items = tabEl.querySelectorAll('.ph-item');
    var done = 0;
    for (var i = 0; i < items.length; i++) if (items[i].getAttribute('aria-checked') === 'true') done++;
    var label = tabEl.querySelector('[data-ph-done]');
    var bar = tabEl.querySelector('[data-ph-bar]');
    var total = label ? parseInt(label.getAttribute('data-total'), 10) : items.length;
    if (label) label.textContent = done + ' of ' + total + ' items in your cart';
    if (bar) bar.style.width = (done / total * 100) + '%';
  }

  function toggleItem(btn) {
    var on = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    var box = btn.querySelector('.ph-check');
    if (box) box.classList.toggle('on', on);
    var name = btn.querySelector('.ph-itemname');
    if (name) {
      if (on) { name.style.textDecoration = 'line-through'; name.style.color = 'var(--muted)'; }
      else { name.style.textDecoration = ''; name.style.color = ''; }
    }
    updateTotals(btn.closest('.ph-tab'));
  }

  function toggleAisle(head) {
    var open = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    var chev = head.querySelector('.ph-chev');
    if (chev) chev.style.transform = open ? 'rotate(180deg)' : 'none';
    var el = head.nextElementSibling;
    while (el && el.classList.contains('ph-item')) {
      if (open) { el.removeAttribute('hidden'); el.style.display = ''; }
      else { el.setAttribute('hidden', ''); el.style.display = 'none'; }
      el = el.nextElementSibling;
    }
  }

  // ---- Tabs

  function openTab(i) {
    var t = tpl('data-ph-screen="' + i + '"');
    if (!t) return;
    var old = screen.querySelector('.ph-tab');
    var el = document.createElement('div');
    el.className = 'ph-tab'; // a new element each time, so the entrance animation replays
    el.appendChild(t.content.cloneNode(true));
    if (old) old.replaceWith(el); else screen.insertBefore(el, tabbar);
    tab = i;
    clearNote();
    var items = tabbar.querySelectorAll('.ph-tabitem');
    for (var k = 0; k < items.length; k++) {
      var on = k === i;
      items[k].classList.toggle('on', on);
      if (on) items[k].setAttribute('aria-current', 'page'); else items[k].removeAttribute('aria-current');
      var ico = items[k].querySelector('.ion');
      var g = cfg.tabs[k];
      if (ico && g) ico.textContent = on ? g.on : g.off;
    }
    cancelAnimationFrame(raf);
    if (i === 0) countUp(el);
  }

  // ---- Events

  root.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    var b;
    if ((b = t.closest('[data-tab]')) && tabbar.contains(b)) { openTab(parseInt(b.getAttribute('data-tab'), 10)); return; }
    if ((b = t.closest('[data-day]')) && b.classList.contains('ph-chip')) {
      var tabEl = b.closest('.ph-tab');
      if (tabEl) goDay(tabEl, parseInt(b.getAttribute('data-day'), 10));
      return;
    }
    if ((b = t.closest('[data-ask]'))) { ask(b.getAttribute('data-ask')); return; }
    if ((b = t.closest('[data-item]'))) { toggleItem(b); return; }
    if ((b = t.closest('[data-aisle]'))) { toggleAisle(b); return; }
    if ((b = t.closest('[data-switch]'))) {
      var on = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.classList.toggle('on', on);
    }
  });

  // Swipe the day card sideways to change day.
  root.addEventListener('pointerdown', function (e) {
    swipe = e.target instanceof Element && e.target.closest('[data-ph-deck]') ? { x: e.clientX, y: e.clientY, deck: e.target.closest('[data-ph-deck]') } : null;
  });
  root.addEventListener('pointerup', function (e) {
    var s = swipe; swipe = null;
    if (!s || !(e.target instanceof Element) || e.target.closest('[data-ph-deck]') !== s.deck) return;
    var dx = e.clientX - s.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.6) {
      var tabEl = s.deck.closest('.ph-tab');
      if (tabEl) goDay(tabEl, parseInt(tabEl.getAttribute('data-day') || '0', 10) + (dx < 0 ? 1 : -1));
    }
  });
  root.addEventListener('pointercancel', function () { swipe = null; });

  // Initial mount: the server rendered the Week tab.
  var first = screen.querySelector('.ph-tab');
  if (first) countUp(first);
})();
