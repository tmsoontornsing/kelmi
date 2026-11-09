'use client';

import { useEffect } from 'react';

// Blocks that fade up as they scroll in. Siblings stagger by 70ms, like the app's staggered entrances.
const REVEAL = '.label, .lede, .joinbox, .step, .tile, .pricing .seg, .price, .waitlist .box, .qa, .marquee';
// Things that only need an `in` class so their own CSS can play.
const PLAYS = '[data-words], .steps, .bento, .faq-head, .sleepspot, .device';

// Scripted motion for the whole page: scroll reveals, count-ups, the scroll progress line and the nav shadow.
// Everything is skipped under Reduce Motion, and the page shows its finished state.
export function Motion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // On big screens the page grows a little, up to 1.5x, so it doesn't look lost (see .wrap in globals.css).
    const zoom = () => root.style.setProperty('--z', window.innerWidth > 1500 ? Math.min(1.5, 1 + (window.innerWidth - 1500) / 2500).toFixed(3) : '1');
    zoom();
    window.addEventListener('resize', zoom);
    const nav = document.querySelector<HTMLElement>('.nav');
    let raf = 0;
    const onScroll = () => {
      raf = 0;
      nav?.classList.toggle('scrolled', window.scrollY > 8);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      nav?.style.setProperty('--progress', String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
    };
    const onFrame = () => { if (!raf) raf = requestAnimationFrame(onScroll); };
    onScroll();
    window.addEventListener('scroll', onFrame, { passive: true });

    // Parallax: layers marked data-depth drift against the scroll while they are on screen. Offsets go into --py
    // (and --rx / --sc for data-tilt), which the CSS reads, so reveals and hovers keep their own properties.
    let pio: IntersectionObserver | undefined;
    let pframe = 0;
    let rate = 1;
    let lastY = window.scrollY;
    const live = new Set<HTMLElement>();
    const applied = new WeakMap<HTMLElement, number>();
    const track = document.querySelector<HTMLElement>('.marquee-track');
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    const parallax = () => {
      pframe = 0;
      const vh = window.innerHeight;
      const soft = window.innerWidth < 800 && window.matchMedia('(hover: none)').matches ? 0.5 : 1;
      const reads: [HTMLElement, number, number][] = [];
      live.forEach((el) => {
        const r = el.getBoundingClientRect();
        const prev = applied.get(el) ?? 0;
        reads.push([el, r.top + r.height / 2 - prev - vh / 2, parseFloat(el.dataset.depth ?? '0')]);
      });
      for (const [el, d, depth] of reads) {
        const off = clamp((d / vh) * depth * 220 * soft, 40 * soft);
        applied.set(el, off);
        el.style.setProperty('--py', `${off.toFixed(1)}px`);
        if (el.hasAttribute('data-tilt')) {
          const t = clamp(d / vh, 1);
          el.style.setProperty('--rx', `${(t * 5).toFixed(2)}deg`);
          el.style.setProperty('--sc', (1 - Math.abs(t) * 0.04).toFixed(3));
        }
      }
      // The meal marquee speeds up while the page is scrolling and eases back to its normal pace.
      const v = Math.abs(window.scrollY - lastY);
      lastY = window.scrollY;
      rate = Math.max(1, rate + (1 + Math.min(4, v / 12) - rate) * 0.18);
      track?.getAnimations().forEach((a) => { a.playbackRate = rate; });
      if (rate > 1.02 || v > 0) pframe = requestAnimationFrame(parallax);
    };
    const kick = () => { if (!pframe) pframe = requestAnimationFrame(parallax); };
    if (!reduced) {
      pio = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) live.add(en.target as HTMLElement); else live.delete(en.target as HTMLElement); });
        kick();
      }, { rootMargin: '10% 0px' });
      document.querySelectorAll<HTMLElement>('[data-depth]').forEach((el) => pio!.observe(el));
      window.addEventListener('scroll', kick, { passive: true });
      window.addEventListener('resize', kick);
    }

    // A soft light follows the pointer across cards (reads --mx / --my in the CSS).
    const glow = (e: PointerEvent) => {
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.tile, .step, .price');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    };
    if (!reduced) window.addEventListener('pointermove', glow, { passive: true });

    let io: IntersectionObserver | undefined;
    if (!reduced) {
      root.classList.add('js');
      const count = (el: HTMLElement) => {
        const to = parseFloat(el.dataset.count ?? '0');
        const dec = parseInt(el.dataset.dec ?? '0', 10);
        const pre = el.dataset.prefix ?? '';
        const t0 = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / 1400);
          el.textContent = pre + (to * (1 - Math.pow(1 - t, 3))).toFixed(dec);
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      const rv = Array.from(document.querySelectorAll<HTMLElement>(REVEAL));
      rv.forEach((el) => {
        el.classList.add('rv');
        const idx = Array.from(el.parentElement?.children ?? []).indexOf(el);
        el.style.setProperty('--d', `${Math.min(idx, 5) * 0.07}s`);
      });
      const all = [...rv, ...Array.from(document.querySelectorAll<HTMLElement>(PLAYS))];
      io = new IntersectionObserver(
        (entries) => entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target as HTMLElement;
          el.classList.add('in');
          el.querySelectorAll<HTMLElement>('[data-count]').forEach(count);
          io?.unobserve(el);
        }),
        { threshold: 0.18, rootMargin: '0px 0px -6% 0px' },
      );
      all.forEach((el) => io!.observe(el));
    }

    return () => {
      window.removeEventListener('scroll', onFrame);
      window.removeEventListener('resize', zoom);
      window.removeEventListener('pointermove', glow);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pframe);
      pio?.disconnect();
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', kick);
      io?.disconnect();
      root.classList.remove('js');
    };
  }, []);

  return null;
}
