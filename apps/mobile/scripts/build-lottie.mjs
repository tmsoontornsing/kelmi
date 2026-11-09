// Draws Kelmi's Lottie animations and writes them to src/assets/lottie/<name>.json (plus <name>-dark.json for the ones that
// use the ink color, which would vanish on the dark background). Edit the drawing here, then run:
//   node scripts/build-lottie.mjs
// Colors match the Mascot palette so the animations sit next to Pip without a style change.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'lottie');
mkdirSync(out, { recursive: true });

const LIGHT = { INK: '#13241A', G: '#3DAA84', DEEP: '#1F7A4D', RIM: '#2E8A68', TINT: '#CFE8DA', LIME: '#A7D96B', LIME_DEEP: '#7FB23D', BLUSH: '#F4AE9C', FLAME: '#F2866B', W: '#FFFFFF' };
const DARK = { INK: '#E8F1EB', G: '#5CC99A', DEEP: '#5CC99A', RIM: '#3FAE86', TINT: '#2C4A3A', LIME: '#A7D96B', LIME_DEEP: '#7FB23D', BLUSH: '#C97F70', FLAME: '#F2866B', W: '#17231C' };

// ---- Lottie building blocks.

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).concat(1);
const S = (k) => ({ a: 0, k });

// Bezier handles for each easing, as [outX, outY, inX, inY].
const EASE = { linear: [0, 0, 1, 1], inOut: [0.42, 0, 0.58, 1], out: [0.16, 1, 0.3, 1], in: [0.7, 0, 0.84, 0], back: [0.34, 1.56, 0.64, 1] };

// Keyframes: [[frame, value, easing-of-the-segment-that-starts-here], ...]. Values are numbers or arrays.
function kf(frames) {
  const k = frames.map(([t, v, e = 'inOut'], n) => {
    const s = Array.isArray(v) ? v : [v];
    if (n === frames.length - 1) return { t, s };
    const [ox, oy, ix, iy] = EASE[e];
    return { t, s, o: { x: s.map(() => ox), y: s.map(() => oy) }, i: { x: s.map(() => ix), y: s.map(() => iy) } };
  });
  return { a: 1, k };
}

// A value sampled every frame from a function, for motion that is easier to compute than to key by hand.
const sampled = (from, to, f, step = 1) => {
  const ts = [];
  for (let t = from; t < to; t += step) ts.push(t);
  ts.push(to);
  return kf(ts.map((t) => [t, f(t), 'linear']));
};

const xf = ({ p = [0, 0], s = [100, 100], r = 0, o = 100, a = [0, 0] } = {}) => ({
  p: p.a ? p : S(p), s: s.a ? s : S(s), r: r?.a ? r : S(r), o: o?.a ? o : S(o), a: S(a),
});

const ellipse = (w, h = w, p = [0, 0]) => ({ ty: 'el', d: 1, s: S([w, h]), p: S(p) });
const rect = (w, h, radius = 0, p = [0, 0]) => ({ ty: 'rc', d: 1, s: S([w, h]), p: S(p), r: S(radius) });
const path = (v, { i, o, closed = false } = {}) => ({
  ty: 'sh',
  ks: S({ i: i ?? v.map(() => [0, 0]), o: o ?? v.map(() => [0, 0]), v, c: closed }),
});
const fill = (hex, o = 100) => ({ ty: 'fl', c: S(rgb(hex)), o: S(o), r: 1 });
const stroke = (hex, w) => ({ ty: 'st', c: S(rgb(hex)), o: S(100), w: S(w), lc: 2, lj: 2 });
const trim = (end) => ({ ty: 'tm', s: S(0), e: end, o: S(0), m: 1 });
const group = (...items) => ({
  ty: 'gr',
  it: [...items, { ty: 'tr', p: S([0, 0]), a: S([0, 0]), s: S([100, 100]), r: S(0), o: S(100), sk: S(0), sa: S(0) }],
});

let layerId = 0;
const layer = (name, shapes, ks, { ip = 0, op } = {}) => ({
  ddd: 0, ind: ++layerId, ty: 4, nm: name, sr: 1, ks, ao: 0, shapes, ip, op, st: 0, bm: 0,
});

function comp(name, { w, h, frames, fps = 30 }, layers) {
  // Lottie draws the first layer on top, so layers are listed front to back.
  return { v: '5.7.0', fr: fps, ip: 0, op: frames, w, h, nm: name, ddd: 0, assets: [], layers: layers.map((l) => ({ ...l, op: l.op ?? frames })) };
}

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A four-point sparkle with concave sides.
function star(r, inner = 0.28) {
  const v = Array.from({ length: 8 }, (_, n) => {
    const a = (n * Math.PI) / 4 - Math.PI / 2;
    const d = n % 2 === 0 ? r : r * inner;
    return [Math.cos(a) * d, Math.sin(a) * d];
  });
  return path(v, { closed: true });
}

// ---- Cooking: a pot on a flame. The lid hops, steam rises, and a leaf and a tomato jump out and back in. Loops.

function cooking(p) {
  const F = 60;
  const bodyStroke = (hex) => stroke(hex, 4);
  const flame = (x, phase) =>
    layer(
      'flame',
      [
        group(
          path([[0, -16], [9, 3], [0, 12], [-9, 3]], {
            i: [[0, 0], [0, -8], [5, 0], [0, 6]],
            o: [[0, 0], [0, 6], [-5, 0], [0, -8]],
            closed: true,
          }),
          fill(p.FLAME),
        ),
        group(
          path([[0, -5], [4, 4], [0, 9], [-4, 4]], {
            i: [[0, 0], [0, -4], [3, 0], [0, 3]],
            o: [[0, 0], [0, 3], [-3, 0], [0, -4]],
            closed: true,
          }),
          fill(p.BLUSH),
        ),
      ],
      xf({
        p: [x, 170],
        a: [0, 12],
        s: kf([
          [0, [62, 52 + phase], 'inOut'],
          [15, [58, 68 - phase], 'inOut'],
          [30, [64, 54 + phase], 'inOut'],
          [45, [58, 66 - phase], 'inOut'],
          [60, [62, 52 + phase]],
        ]),
      }),
    );

  const steam = (x, start, drift) =>
    layer(
      'steam',
      [group(ellipse(16), fill(p.TINT))],
      xf({
        p: kf([[start, [x, 84], 'out'], [start + 24, [x + drift, 42]]]),
        s: kf([[start, [40, 40], 'out'], [start + 24, [115, 115]]]),
        o: kf([[start, 0, 'out'], [start + 6, 85, 'inOut'], [start + 24, 0]]),
      }),
      { ip: start, op: start + 25 },
    );

  const hop = (name, shapes, from, peak, to, t0, t1, spin) =>
    layer(
      name,
      shapes,
      xf({
        p: kf([[t0, from, 'out'], [(t0 + t1) / 2, peak, 'in'], [t1, to]]),
        r: kf([[t0, 0, 'linear'], [t1, spin]]),
      }),
    );

  return comp('cooking', { w: 200, h: 200, frames: F }, [
    // Lid: rattles while simmering, then hops and tilts open as steam escapes.
    layer(
      'lid',
      [
        group(
          path([[-42, 0], [-36, -14], [0, -22], [36, -14], [42, 0]], {
            i: [[0, 0], [-6, 6], [-18, 0], [0, -6], [0, 0]],
            o: [[0, 0], [6, -6], [18, 0], [0, 6], [0, 0]],
            closed: true,
          }),
          fill(p.G),
          bodyStroke(p.INK),
        ),
        group(ellipse(11, 11, [0, -26]), fill(p.TINT), stroke(p.INK, 3.5)),
      ],
      xf({
        p: kf([
          [0, [100, 96], 'inOut'], [4, [100, 94.5], 'inOut'], [8, [100, 96], 'inOut'],
          [12, [100, 96], 'out'], [20, [106, 86], 'in'], [32, [100, 96], 'inOut'],
          [44, [100, 96], 'inOut'], [48, [100, 94.5], 'inOut'], [52, [100, 96], 'inOut'], [60, [100, 96]],
        ]),
        r: kf([
          [0, 0, 'inOut'], [4, 1.5, 'inOut'], [8, -1.5, 'inOut'], [12, 0, 'out'], [20, 9, 'in'], [32, 0, 'inOut'],
          [44, 0, 'inOut'], [48, 1.5, 'inOut'], [52, -1.5, 'inOut'], [60, 0],
        ]),
      }),
    ),
    steam(86, 16, -10),
    steam(104, 22, 8),
    steam(95, 30, -4),
    // Rim and body sit in front of the ingredients, so they appear to come out of the pot.
    layer('rim', [group(rect(104, 12, 6), fill(p.RIM), bodyStroke(p.INK))], xf({ p: [100, 100] })),
    layer(
      'body',
      [
        group(rect(92, 52, 16), fill(p.G), bodyStroke(p.INK)),
        group(rect(7, 30, 3.5, [-30, 0]), fill('#FFFFFF', 38)),
      ],
      xf({ p: [100, 131] }),
    ),
    layer('handles', [group(rect(14, 9, 4.5, [-55, 0]), fill(p.TINT), bodyStroke(p.INK)), group(rect(14, 9, 4.5, [55, 0]), fill(p.TINT), bodyStroke(p.INK))], xf({ p: [100, 115] })),
    hop('leaf', [group(ellipse(15, 8), fill(p.LIME), stroke(p.INK, 3))], [87, 108], [76, 64], [90, 108], 12, 40, 200),
    hop('tomato', [group(ellipse(13), fill(p.BLUSH), stroke(p.INK, 3))], [114, 108], [126, 70], [111, 108], 16, 46, -140),
    layer('stove', [group(rect(124, 8, 4), fill(p.INK))], xf({ p: [100, 175] })),
    flame(80, 0),
    flame(100, 6),
    flame(120, 2),
  ]);
}

// ---- Confetti: two bursts from the bottom corners. Plan ready, cart full, Plus. One shot, about 3 seconds.

function confetti() {
  const F = 90;
  const W = 360, H = 640;
  const colors = ['#3DAA84', '#A7D96B', '#1F7A4D', '#CFE8DA', '#F4AE9C', '#3DAA84', '#A7D96B'];
  const r = rng(7);
  const layers = [];
  for (let n = 0; n < 72; n++) {
    const left = n % 2 === 0;
    const sx = left ? -6 : W + 6;
    const sy = H - 30 + r() * 20;
    const dir = left ? 1 : -1;
    const start = Math.floor(r() * 7);
    const rise = 18 + Math.floor(r() * 12);
    const px = sx + dir * (90 + r() * 190);
    const py = sy - (230 + r() * 330);
    const ex = px + dir * (20 + r() * 70) + (r() - 0.5) * 60;
    const ey = H + 30;
    const end = Math.min(F, start + rise + 46 + Math.floor(r() * 18));
    const color = colors[Math.floor(r() * colors.length)];
    const kind = r();
    const shape =
      kind < 0.5 ? rect(7 + r() * 5, 3.5 + r() * 3, 1) : kind < 0.8 ? ellipse(4 + r() * 3) : path([[-5, 2], [-2, -3], [2, 3], [5, -2]]);
    const g = kind < 0.8 ? group(shape, fill(color)) : group(shape, stroke(color, 2.4));
    const spin = (r() < 0.5 ? -1 : 1) * (360 + r() * 700);
    const flutter = 6 + Math.floor(r() * 6);
    layers.push(
      layer(
        'piece',
        [g],
        xf({
          p: kf([[start, [sx, sy], 'out'], [start + rise, [px, py], 'in'], [end, [ex, ey]]]),
          r: kf([[start, 0, 'linear'], [end, spin]]),
          s: sampled(start, end, (t) => [100, Math.cos(((t - start) / flutter) * Math.PI) * 100], 2),
          o: kf([[start, 100, 'linear'], [end - 12, 100, 'linear'], [end, 0]]),
        }),
        { ip: start, op: end },
      ),
    );
  }
  return comp('confetti', { w: W, h: H, frames: F }, layers);
}

// ---- Check: a green disc pops in, the check draws itself, a ring ripples out and specks fly off. One shot.

function check(p) {
  const F = 54;
  const specks = Array.from({ length: 8 }, (_, n) => {
    const a = (n / 8) * Math.PI * 2 + 0.2;
    const far = 50 + (n % 2) * 8;
    return layer(
      'speck',
      [group(ellipse(n % 2 ? 5 : 7), fill(n % 2 ? p.LIME : p.G))],
      xf({
        p: kf([[10, [60, 60], 'out'], [30, [60 + Math.cos(a) * far, 60 + Math.sin(a) * far]]]),
        s: kf([[10, [0, 0], 'out'], [16, [100, 100], 'inOut'], [32, [0, 0]]]),
      }),
      { ip: 10, op: 33 },
    );
  });
  return comp('check', { w: 120, h: 120, frames: F }, [
    ...specks,
    layer('tick', [group(path([[-17, 1], [-5, 13], [18, -12]]), trim(kf([[12, 0, 'out'], [27, 100]])), stroke('#FFFFFF', 8))], xf({ p: [60, 62] })),
    layer(
      'disc',
      [group(ellipse(70), fill(p.G))],
      xf({ p: [60, 60], s: kf([[0, [0, 0], 'back'], [14, [100, 100]]]) }),
    ),
    layer(
      'ring',
      [group(ellipse(70), stroke(p.G, 3))],
      xf({
        p: [60, 60],
        s: kf([[8, [100, 100], 'out'], [36, [165, 165]]]),
        o: kf([[8, 80, 'linear'], [36, 0]]),
      }),
      { ip: 8, op: 37 },
    ),
  ]);
}

// ---- Sparkle: three stars pop and spin with a ring of dots. A tiny reward for a tick. One shot.

function sparkle(p) {
  const F = 30;
  const stars = [
    { x: 60, y: 60, r: 26, at: 0, c: p.LIME },
    { x: 86, y: 36, r: 15, at: 4, c: p.G },
    { x: 34, y: 82, r: 13, at: 7, c: p.BLUSH },
  ];
  const dots = Array.from({ length: 8 }, (_, n) => {
    const a = (n / 8) * Math.PI * 2;
    return layer(
      'dot',
      [group(ellipse(n % 2 ? 4 : 6), fill(n % 2 ? p.G : p.LIME))],
      xf({
        p: kf([[3, [60, 60], 'out'], [22, [60 + Math.cos(a) * 46, 60 + Math.sin(a) * 46]]]),
        s: kf([[3, [100, 100], 'in'], [22, [0, 0]]]),
      }),
      { ip: 3, op: 23 },
    );
  });
  return comp('sparkle', { w: 120, h: 120, frames: F }, [
    ...stars.map((s) =>
      layer(
        'star',
        [group(star(s.r), fill(s.c))],
        xf({
          p: [s.x, s.y],
          s: kf([[s.at, [0, 0], 'back'], [s.at + 8, [100, 100], 'inOut'], [s.at + 22, [0, 0]]]),
          r: kf([[s.at, -30, 'out'], [s.at + 22, 60]]),
        }),
        { ip: s.at, op: s.at + 23 },
      ),
    ),
    ...dots,
  ]);
}

// ---- Coins: three coins drop, bounce and stack. One shot.

function coins(p) {
  const F = 64;
  const coin = (x, rest, start, label) =>
    layer(
      label,
      [
        group(ellipse(34), fill(p.LIME), stroke(p.INK, 3.5)),
        group(ellipse(21), stroke(p.LIME_DEEP, 3)),
        group(path([[-9, -7], [-4, -11]], { i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]] }), stroke('#FFFFFF', 2.6)),
      ],
      xf({
        p: kf([
          [start, [x, -24], 'in'], [start + 12, [x, rest], 'out'], [start + 18, [x, rest - 17], 'in'], [start + 24, [x, rest], 'out'],
          [start + 27, [x, rest - 4], 'in'], [start + 30, [x, rest]],
        ]),
        s: kf([[start + 12, [100, 100], 'out'], [start + 14, [112, 86], 'out'], [start + 18, [100, 100]]]),
      }),
      { ip: start },
    );
  return comp('coins', { w: 140, h: 140, frames: F }, [
    layer(
      'glint',
      [group(star(12), fill('#FFFFFF'))],
      xf({ p: [76, 64], s: kf([[36, [0, 0], 'back'], [44, [100, 100], 'inOut'], [54, [0, 0]]]), r: kf([[36, 0, 'linear'], [54, 90]]) }),
      { ip: 36, op: 55 },
    ),
    coin(70, 82, 16, 'coin-top'),
    coin(48, 116, 0, 'coin-left'),
    coin(92, 116, 7, 'coin-right'),
  ]);
}

// ---- Zzz: sleep letters drift up and away, one after another. Loops.

function zzz(p) {
  const F = 96;
  const z = (offset, size) => {
    const at = (t) => {
      const tau = (((t - offset) % F) + F) % F;
      const k = tau / F;
      return { k, x: 22 + k * 44 + Math.sin(k * Math.PI * 2) * 5, y: 82 - k * 66 };
    };
    return layer(
      'z',
      [group(path([[-6, -6], [6, -6], [-6, 6], [6, 6]]), stroke(p.DEEP, 3.4))],
      xf({
        p: sampled(0, F, (t) => { const q = at(t); return [q.x, q.y]; }),
        s: sampled(0, F, (t) => { const s = (0.45 + at(t).k * 0.75) * size; return [s, s]; }),
        r: sampled(0, F, (t) => -12 + at(t).k * 24),
        o: sampled(0, F, (t) => { const k = at(t).k; return Math.round(Math.min(1, k / 0.15, (1 - k) / 0.3) * 100); }),
      }),
    );
  };
  return comp('zzz', { w: 100, h: 100, frames: F }, [z(0, 100), z(32, 100), z(64, 100)]);
}

// ---- Write every file.

const files = [
  ['cooking', cooking, true],
  ['confetti', confetti, false],
  ['check', check, false],
  ['sparkle', sparkle, false],
  ['coins', coins, true],
  ['zzz', zzz, true],
];
for (const [name, build, themed] of files) {
  for (const [suffix, palette] of themed ? [['', LIGHT], ['-dark', DARK]] : [['', LIGHT]]) {
    layerId = 0;
    writeFileSync(join(out, `${name}${suffix}.json`), JSON.stringify(build(palette)));
  }
}
console.log(`wrote ${files.reduce((n, [, , themed]) => n + (themed ? 2 : 1), 0)} animations to ${out}`);
