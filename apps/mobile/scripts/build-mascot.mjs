// Draws Pip, Kelmi's mason jar mascot, and writes it out twice:
//   assets/mascot/<pose>.svg                      a still, light-mode file per pose for design tools and docs
//   src/components/mascotPoses.generated.ts       each pose as animated layers with color tokens, rendered by <Mascot>
// Edit the drawing here, then run: node scripts/build-mascot.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  at, blinking, blush, BLUSH, C, E, eyes, G, grin, hand, happyEyes, INK, jar, legs, legsApart, lid, LIGHT, P, S, sleepyEyes, smile, TINT, W,
} from './pip-art.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- Poses. Layers draw in order; arms that start behind the jar come before it.

const poses = {
  wave: {
    label: 'Waving',
    use: 'Welcome and sign-in',
    motion: { kind: 'sway', deg: 2, ms: 1800 },
    layers: [
      {
        svg: P('M144 112 Q166 104 166 76', 4) + hand(166, 70) + P('M178 64 q6 6 0 14', 3) + P('M185 59 q9 11 0 24', 3),
        anim: { kind: 'swing', origin: [144, 112], deg: 14, ms: 900 },
      },
      { svg: legs() + P('M56 112 Q40 128 42 150', 4) + hand(42, 152) + jar() + lid() + blush() + grin() },
      blinking(eyes()),
    ],
  },

  think: {
    label: 'Thinking',
    use: 'Diet, household and kitchen questions',
    motion: { kind: 'breathe', scale: 1.015, ms: 2400 },
    layers: [
      {
        svg:
          legs() + P('M56 112 Q40 128 42 150', 4) + hand(42, 152) + P('M144 114 Q170 124 150 99', 4) +
          jar() + lid() + blush() + hand(150, 96) + P('M90 106 q5 -4 10 0', 3.5) + P('M110 77 q9 -7 17 -2', 3.5),
      },
      blinking(eyes(3, -2), 103, 90),
      {
        svg:
          C(156, 58, 3) + C(166, 45, 5) + C(178, 26, 12) +
          P('M174 23 q0 -6 5 -6 q5 0 5 5 q0 3 -5 5 v2', 2.5) + `<circle cx="179" cy="32.5" r="1.7" fill="${INK}"/>`,
        anim: { kind: 'bob', dy: 4, ms: 2000 },
      },
    ],
  },

  cook: {
    label: 'Cooking',
    use: 'Building your week',
    motion: { kind: 'bob', dy: 2, ms: 700 },
    layers: [
      {
        svg:
          P('M56 112 Q36 104 36 84', 4) + P('M36 78 L30 54', 3) +
          `<ellipse cx="29" cy="46" rx="6" ry="9" transform="rotate(-10 29 46)" fill="${W}" ${S(3)}/>` + hand(36, 80),
        anim: { kind: 'swing', origin: [56, 112], deg: 10, ms: 700 },
      },
      {
        svg:
          legs() + P('M144 114 Q154 130 152 142', 4) + jar() + lid() +
          `<path d="M82 32 C72 30 72 14 86 16 C88 4 112 4 114 16 C128 14 128 30 118 32 Z" fill="${W}" ${S(3)}/>` +
          `<rect x="80" y="29" width="40" height="9" rx="3" fill="${W}" ${S(3)}/>` +
          blush() + smile() + P('M73 80 l14 3', 3.5) + P('M113 83 l14 -3', 3.5) +
          C(172, 133, 4.5, G, 2.5) + C(184, 132, 4, TINT, 2.5) +
          `<path d="M164 136 H194 V142 a10 10 0 0 1 -10 10 H174 a10 10 0 0 1 -10 -10 Z" fill="${W}" ${S(3)}/>` +
          P('M152 142 H164', 4) + hand(152, 142),
      },
      blinking(eyes()),
      {
        svg: P('M171 124 q-4 -5 0 -10 q4 -5 0 -10', 2.5) + P('M184 122 q-4 -5 0 -10 q4 -5 0 -10', 2.5),
        anim: { kind: 'float', dy: 10, ms: 1400 },
      },
    ],
  },

  shop: {
    label: 'Shopping',
    use: 'Grocery list, items in the cart',
    motion: { kind: 'bob', dy: 3, ms: 600 },
    layers: [
      {
        svg:
          P('M144 114 Q164 118 170 134', 4) + P('M154 150 Q170 118 186 150', 3.5) +
          `<path d="M162 150 q-7 -16 1 -23 q9 8 -1 23z" fill="${G}" ${S(2.5)}/>` +
          `<path d="M176 150 q8 -16 19 -15 q-1 12 -19 15z" fill="${G}" ${S(2.5)}/>` +
          `<path d="M150 150 h40 l-5 24 h-30 Z" fill="${W}" ${S(3)}/>` + P('M154 160 h32 M156 168 h28', 2) + hand(170, 134),
        anim: { kind: 'swing', origin: [144, 114], deg: 5, ms: 1100 },
      },
      {
        svg:
          legs() + P('M56 112 Q40 124 40 136', 4) + jar() + lid() + blush() + smile() +
          `<g transform="rotate(-6 39 158)"><rect x="28" y="144" width="22" height="28" rx="3" fill="${W}" ${S(3)}/>` +
          P('M33 152 h12 M33 159 h12 M33 166 h7', 2) + '</g>' + hand(40, 138),
      },
      blinking(eyes()),
    ],
  },

  cheer: {
    label: 'Cheering',
    use: 'Under budget, plan saved',
    motion: { kind: 'hop', dy: 12, ms: 900 },
    layers: [
      {
        svg:
          P('M46 40 l5 -7', 3) + P('M150 36 l-5 -7', 3) + C(60, 20, 3, G, 2) + C(142, 14, 3, TINT, 2) +
          `<rect x="44" y="54" width="7" height="7" rx="1" fill="${G}" transform="rotate(20 47 57)"/>` +
          `<rect x="150" y="52" width="7" height="7" rx="1" fill="${G}" transform="rotate(-20 153 55)"/>`,
        anim: { kind: 'twinkle', ms: 600 },
      },
      {
        svg:
          legsApart() + P('M56 108 Q32 94 28 66', 4) + P('M144 108 Q168 94 172 66', 4) + hand(28, 62) + hand(172, 62) +
          jar(112) + blush(0.9) + happyEyes() + grin(),
      },
      { svg: lid(8, -16, 14), anim: { kind: 'bob', dy: 6, ms: 500 } },
    ],
  },

  oops: {
    label: 'Oops',
    use: 'Errors, offline, over budget',
    motion: { kind: 'shake', dx: 3, ms: 1600 },
    layers: [
      {
        svg:
          legs() + P('M56 114 Q34 122 26 110', 4) + P('M144 114 Q166 122 174 110', 4) + hand(24, 107) + hand(176, 107) +
          jar(138) + lid(-4, -2, -18) + C(142, 28, 3.5, G, 2.5) + C(150, 16, 3, G, 2) +
          blush() + P('M70 82 l16 -7', 3.5) + P('M114 75 l16 7', 3.5) + P('M88 108 q4 -6 8 0 t8 0 t8 0', 3.5),
      },
      blinking(eyes(0, 0, 6)),
      { svg: `<path d="M160 62 q-7 11 0 16 q7 -5 0 -16z" fill="${TINT}" ${S(2.5)}/>`, anim: { kind: 'drip', dy: 10, ms: 1400 } },
    ],
  },

  sleep: {
    label: 'Napping',
    use: 'Nothing planned yet',
    motion: { kind: 'breathe', scale: 1.03, ms: 2600 },
    layers: [
      {
        svg:
          legs() + P('M56 118 Q44 140 48 156', 4) + P('M144 118 Q156 140 152 156', 4) + hand(48, 158) + hand(152, 158) +
          jar() + lid() + `<path d="M70 34 Q82 6 128 14 Q120 26 126 34 Z" fill="${TINT}" ${S(3)}/>` + C(130, 14, 6) +
          blush() + sleepyEyes() + E(100, 108, 3.5, 4.5, INK),
      },
      { svg: P('M150 74 h12 l-12 14 h12', 3) + P('M164 46 h16 l-16 18 h16', 3), anim: { kind: 'float', dy: 12, ms: 2200 } },
    ],
  },

  peek: {
    label: 'Peeking',
    use: 'Empty lists and pantry',
    motion: { kind: 'rise', dy: 40, ms: 700 },
    layers: [
      { svg: at(36, jar() + lid() + blush() + P('M93 104 q7 5 14 0', 3.5)) },
      blinking(at(36, eyes(5)), 105, 128),
      {
        svg: `<rect x="22" y="152" width="156" height="46" rx="4" fill="${W}" ${S(3.5)}/>` + P('M40 170 h56 M40 182 h36', 2.5) + hand(64, 150) + hand(136, 150),
        fixed: true,
      },
    ],
  },

  love: {
    label: 'Loving it',
    use: 'Saved recipes, thank-you moments',
    motion: { kind: 'sway', deg: 3, ms: 1600 },
    layers: [
      {
        svg:
          legs() + jar() + lid() + blush(1) + happyEyes() + smile() +
          P('M56 112 Q58 130 80 128', 4) + P('M144 112 Q142 130 120 128', 4),
      },
      {
        svg: `<path d="M100 148 C82 136 78 120 90 115 C95 113 100 117 100 121 C100 117 105 113 110 115 C122 120 118 136 100 148 Z" fill="${BLUSH}" ${S(3)}/>`,
        anim: { kind: 'pulse', origin: [100, 130], scale: 1.1, ms: 700 },
      },
      { svg: hand(80, 128) + hand(120, 128) },
    ],
  },

  yum: {
    label: 'Yum',
    use: 'Rating a recipe after cooking',
    motion: { kind: 'bob', dy: 3, ms: 500 },
    layers: [
      {
        svg:
          P('M56 112 Q34 110 38 92', 4) + P('M38 90 L54 58', 3.5) + P('M47 58 h14 M48 58 v-10 M54 58 v-11 M60 58 v-10', 3) +
          C(54, 41, 5, G, 2.5) + hand(38, 90),
        anim: { kind: 'swing', origin: [56, 112], deg: 8, ms: 600 },
      },
      { svg: legs() + jar() + lid() + blush(0.9) + happyEyes() + grin() + P('M144 114 Q150 136 128 138', 4) + hand(128, 138) },
    ],
  },

  save: {
    label: 'Saving',
    use: 'Pantry savings, money saved',
    motion: { kind: 'bob', dy: 2, ms: 900 },
    layers: [
      { svg: legs() + P('M56 112 Q40 128 42 150', 4) + hand(42, 152) + P('M144 114 Q164 122 164 132', 4) + jar() + lid() + blush() + smile() },
      blinking(eyes(2, 0)),
      {
        svg: C(166, 116, 15, TINT, 3) + P('M171 109 q-3 -3 -7 -2 q-4 1 -3 5 q1 3 5 4 q5 1 5 5 q0 4 -5 4 q-4 0 -7 -3 M166 105 v22', 2.5),
        anim: { kind: 'flip', origin: [166, 116], ms: 1800 },
      },
      { svg: hand(164, 134) },
      { svg: P('M188 90 v8 M184 94 h8', 2.5) + P('M190 128 v6 M187 131 h6', 2), anim: { kind: 'twinkle', ms: 700 } },
    ],
  },

  point: {
    label: 'Pointing',
    use: 'Tips and hints',
    motion: { kind: 'sway', deg: 1.5, ms: 2000 },
    layers: [
      { svg: P('M144 112 Q164 104 178 104', 4) + hand(182, 104) + P('M191 94 l4 -3 M192 104 h5 M191 114 l4 3', 2.5), anim: { kind: 'nudge', dx: 4, ms: 700 } },
      { svg: legs() + P('M56 112 Q40 124 50 132', 4) + jar() + lid() + hand(52, 132) + blush() + smile() },
      blinking(eyes(4, 0), 104, 92),
    ],
  },

  read: {
    label: 'Reading',
    use: 'Recipe steps',
    motion: { kind: 'breathe', scale: 1.015, ms: 2600 },
    layers: [
      { svg: legs() + jar() + lid() + blush() + P('M94 106 q6 3 12 0', 3.5) },
      blinking(eyes(0, 3), 100, 95),
      {
        svg:
          P('M56 112 Q56 132 74 132', 4) + P('M144 112 Q144 132 126 132', 4) +
          `<path d="M100 124 Q86 118 72 122 V146 Q86 142 100 148 Z" fill="${W}" ${S(3)}/>` +
          `<path d="M100 124 Q114 118 128 122 V146 Q114 142 100 148 Z" fill="${W}" ${S(3)}/>` +
          P('M78 129 q8 -2 16 0 M78 135 q8 -2 16 0 M106 129 q8 -2 16 0 M106 135 q8 -2 16 0', 1.8) +
          hand(74, 134) + hand(126, 134),
      },
    ],
  },
};

// ---- Output

const svgOf = (art) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${art}</svg>`;
const light = (svg) => svg.replace(/__([A-Z]+)__/g, (_, k) => LIGHT[k]);

rmSync(join(root, 'assets/mascot'), { recursive: true, force: true });
mkdirSync(join(root, 'assets/mascot'), { recursive: true });
for (const [name, pose] of Object.entries(poses)) {
  // The still file stacks every layer at rest. Fixed layers draw last, as they do in the app.
  const ordered = [...pose.layers.filter((l) => !l.fixed), ...pose.layers.filter((l) => l.fixed)];
  writeFileSync(join(root, `assets/mascot/${name}.svg`), light(svgOf(ordered.map((l) => l.svg).join(''))) + '\n');
}

const specs = Object.entries(poses)
  .map(([name, { label, use, motion, layers }]) => {
    const ls = layers
      .map((l) => `      { svg: ${JSON.stringify(svgOf(l.svg))}${l.anim ? `, anim: ${JSON.stringify(l.anim)}` : ''}${l.fixed ? ', fixed: true' : ''} },`)
      .join('\n');
    return (
      `  ${name}: {\n    label: ${JSON.stringify(label)},\n    use: ${JSON.stringify(use)},\n` +
      (motion ? `    motion: ${JSON.stringify(motion)},\n` : '') +
      `    layers: [\n${ls}\n    ],\n  },`
    );
  })
  .join('\n');

writeFileSync(
  join(root, 'src/components/mascotPoses.generated.ts'),
  `// Generated by scripts/build-mascot.mjs. Edit the script, not this file.\n` +
    `// Colors are __TOKENS__ that <Mascot> fills in for light or dark mode.\n\n` +
    `import type { MascotPoseSpec } from './mascotTypes';\n\n` +
    `export const MASCOT_POSES = {\n${specs}\n} satisfies Record<string, MascotPoseSpec>;\n\n` +
    `export type MascotPose = keyof typeof MASCOT_POSES;\n`,
);

console.log(`Wrote ${Object.keys(poses).length} poses.`);
