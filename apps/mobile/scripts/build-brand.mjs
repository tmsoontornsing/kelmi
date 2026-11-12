// Draws Kelmi's brand art around Pip and writes it as PNG and SVG:
//   assets/icon.png, ios-dark.png, ios-tinted.png       the iOS app icon in its three appearances (lime, deep green disc, big Pip)
//   assets/adaptive-icon.png, android-icon-*.png         Android adaptive icon layers
//   assets/splash-icon.png, favicon.png                 launch screen and web
//   marketing/                                          logo lockups, store screenshots' backdrops, social and Play cards
// Run after changing Pip: node scripts/build-mascot.mjs && node scripts/build-brand.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import { MASCOT_POSES } from '../src/components/mascotPoses.generated.ts';
import { blush, eyes, grin, jar, lid } from './pip-art.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const font = (w) => join(root, `node_modules/@expo-google-fonts/outfit/${w}/Outfit_${w}.ttf`);
const FONTS = [font('700Bold'), font('600SemiBold'), font('500Medium')];

const BRAND = '#3DAA84'; // splash and Android icon background
const DEEP = '#1F7A4D'; // theme primary
const INK = '#13241A';
const PAPER = '#F7FAF5';

// Pip's color tokens for each surface. Icons need a deeper fill so the jar reads against the brand green.
const ON_GREEN = { INK, G: DEEP, TINT: '#CFE8DA', GLASS: PAPER, BLUSH: '#F4AE9C', W: '#FFFFFF' };
const ON_PAPER = { INK, G: BRAND, TINT: '#CFE8DA', GLASS: '#E8F3EC', BLUSH: '#F4AE9C', W: '#FFFFFF' };
const ON_DARK = { INK: '#E8F1EB', G: '#5CC99A', TINT: '#2C4A3A', GLASS: '#1F3328', BLUSH: '#C97F70', W: '#17231C' };
// Tinted iOS icons are greyscale on black, so Pip's lines go light and his body dark, like the dark icon.
const GREY = { INK: '#F2F2F2', G: '#CFCFCF', TINT: '#5A5A5A', GLASS: '#262626', BLUSH: '#8A8A8A', W: '#141414' };
const MONO = { INK: '#000000', G: '#000000', TINT: 'none', GLASS: 'none', BLUSH: 'none', W: 'none' };

const paint = (art, colors) => art.replace(/__([A-Z]+)__/g, (_, k) => colors[k]);
// Clip ids must be unique once several Pips share one file.
let clips = 0;
const uniq = (art) => {
  const id = `jar${clips++}`;
  return art.replaceAll('id="jar"', `id="${id}"`).replaceAll('url(#jar)', `url(#${id})`);
};

// Pip's face and jar with no arms or legs: the shape that still reads at 29 points on a home screen.
// Drawn in Pip's 200-unit box; the jar spans x 54 to 146 and y 32 to 160.
// On dark, the eye shine is drawn in the ink color so the eyes stay solid instead of reading as rolled back.
const solidEyes = (colors) => (colors.INK === INK ? colors : { ...colors, W: colors.INK });
const bust = (colors) => uniq(paint(jar(112) + lid() + blush(0.85) + grin(), colors) + paint(eyes(), solidEyes(colors)));

// A full pose, every layer at rest, as the still files in assets/mascot are.
const pose = (name, colors) => {
  const layers = MASCOT_POSES[name].layers;
  const ordered = [...layers.filter((l) => !l.fixed), ...layers.filter((l) => l.fixed)];
  // The blinking layer is the eyes.
  const inner = ordered.map((l) => paint(l.svg.replace(/^<svg[^>]*>|<\/svg>$/g, ''), l.anim?.kind === 'blink' ? solidEyes(colors) : colors));
  return uniq(inner.join(''));
};

// Places 200-unit art so its point (cx, cy) lands at (x, y), scaled by s.
const place = (art, x, y, s, cx = 100, cy = 96) => `<g transform="translate(${x - cx * s} ${y - cy * s}) scale(${s})">${art}</g>`;

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const rect = (w, h, fill) => `<rect width="${w}" height="${h}" fill="${fill}"/>`;
const text = (x, y, size, fill, str, { weight = 700, anchor = 'middle', spacing = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="Outfit" font-weight="${weight}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}">${str}</text>`;
// One <text> per line; resvg has no wrapping.
const lines = (x, y, size, lead, fill, strs, opts) => strs.map((s, i) => text(x, y + i * lead, size, fill, s, opts)).join('');

// Pantry doodles from the welcome screen, in a 48-unit box. Used sparingly behind promo art.
const DOODLES = {
  leaf: (ink, fill) => `<g fill="${fill}" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39 C9 19 21 8 39 8 C39 27 28 39 9 39 Z"/><path d="M9 39 L29 18" fill="none"/></g>`,
  tomato: (ink, fill) => `<g fill="${fill}" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="27" r="15"/><path d="M24 12 l-5 5 M24 12 l5 5 M24 12 v7 M24 12 q3 -5 8 -4" fill="none"/></g>`,
  lemon: (ink, fill) => `<g fill="${fill}" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-25 24 24)"><ellipse cx="24" cy="24" rx="17" ry="11"/><path d="M5 24 h-3 M43 24 h3" fill="none"/></g>`,
  egg: (ink, fill) => `<g fill="${fill}" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M24 7 C15 7 10 23 10 30 C10 38 16 42 24 42 C32 42 38 38 38 30 C38 23 33 7 24 7 Z"/></g>`,
  spoon: (ink, fill) => `<g fill="${fill}" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="17" cy="16" rx="8" ry="10" transform="rotate(45 17 16)"/><path d="M23 22 L40 39" fill="none"/></g>`,
};
const doodle = (name, x, y, size, rot, ink, fill, opacity) =>
  `<g opacity="${opacity}" transform="translate(${x} ${y}) rotate(${rot} ${size / 2} ${size / 2}) scale(${size / 48})">${DOODLES[name](ink, fill)}</g>`;

// A soft ground shadow so Pip stands on something.
const shadow = (x, y, w, fill, opacity) => `<ellipse cx="${x}" cy="${y}" rx="${w / 2}" ry="${w / 14}" fill="${fill}" opacity="${opacity}"/>`;

// A flat sunburst: alternating wedges fanning out from (cx, cy), drawn in one color at low opacity so Pip reads as bursting
// out of the middle. Wedges run far past the canvas, which crops them.
const rays = (cx, cy, count, fill, opacity) => {
  const R = 4000;
  const wedges = Array.from({ length: count }, (_, i) => {
    const a0 = (i * 2 * Math.PI) / count;
    const a1 = a0 + Math.PI / count;
    const pt = (a) => `${(cx + R * Math.cos(a)).toFixed(1)} ${(cy + R * Math.sin(a)).toFixed(1)}`;
    return `M${cx} ${cy} L${pt(a0)} L${pt(a1)} Z`;
  });
  return `<path d="${wedges.join(' ')}" fill="${fill}" opacity="${opacity}"/>`;
};

const out = [];
const write = (rel, body, width) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  if (rel.endsWith('.svg')) {
    writeFileSync(file, body + '\n');
  } else {
    const png = new Resvg(body, {
      fitTo: width ? { mode: 'width', value: width } : { mode: 'original' },
      font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Outfit' },
    }).render().asPng();
    writeFileSync(file, png);
  }
  out.push(rel);
};

// ---- App icons

// iOS masks the square itself, so the art fills edge to edge. Pip cheers with his lid popped off, huge and cropped by the
// bottom edge, on a deep green disc ringed in light lime, on lime: the brightest green in the app, so the icon stands out
// on a home screen full of blue and white. The colors are the app's own (BADGE lime, DEEP, BRAND).
const JAR_D = 'M74 52 H126 V64 Q126 70 134 76 Q146 84 146 98 V142 Q146 160 128 160 H72 Q54 160 54 142 V98 Q54 84 66 76 Q74 70 74 64 Z';
// Pip's face and jar with his lid popped, in his 200-unit box (jar spans x 54 to 146, y 32 to 160). Closed, smiling eyes.
const iconFace = (colors) =>
  uniq(
    paint(
      `<defs><clipPath id="jar"><path d="${JAR_D}"/></clipPath></defs>` +
        `<path d="${JAR_D}" fill="__GLASS__"/>` +
        `<path d="M40 112 Q70 105 100 112 T160 112 V170 H40 Z" fill="__G__" clip-path="url(#jar)"/>` +
        `<path d="M64 92 v14" stroke="__W__" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="${JAR_D}" fill="none" stroke="__INK__" stroke-width="3.5" stroke-linejoin="round"/>` +
        `<g opacity="0.9"><ellipse cx="70" cy="104" rx="6.5" ry="3.8" fill="__BLUSH__"/><ellipse cx="130" cy="104" rx="6.5" ry="3.8" fill="__BLUSH__"/></g>` +
        `<path d="M75 94 q7 -9 14 0" fill="none" stroke="__INK__" stroke-width="3.5" stroke-linecap="round"/>` +
        `<path d="M111 94 q7 -9 14 0" fill="none" stroke="__INK__" stroke-width="3.5" stroke-linecap="round"/>` +
        `<path d="M89 101 Q100 118 111 101 Z" fill="__INK__" stroke="__INK__" stroke-width="2.5" stroke-linejoin="round"/>` +
        `<path d="M95 109 Q100 104 105 109 Q100 113 95 109 Z" fill="__BLUSH__"/>` +
        `<g transform="translate(8 -16) rotate(14 100 46)"><rect x="68" y="40" width="64" height="16" rx="4" fill="__TINT__" stroke="__INK__" stroke-width="3.5"/>` +
        `<path d="M78 45 v6 M88 45 v6 M98 45 v6 M108 45 v6 M118 45 v6" fill="none" stroke="__INK__" stroke-width="2" stroke-linecap="round"/>` +
        `<rect x="72" y="32" width="56" height="10" rx="4" fill="__W__" stroke="__INK__" stroke-width="3.5"/></g>`,
      colors,
    ),
  );

const sparkle = (x, y, s, fill) => `<path transform="translate(${x} ${y}) scale(${s})" fill="${fill}" d="M0 -9 Q0 0 9 0 Q0 0 0 9 Q0 0 -9 0 Q0 0 0 -9Z"/>`;
const LIME = '#A7D96B';
const ICON_LOOK = {
  light: { bg: LIME, ring: '#D4EFA6', disc: DEEP, spark: PAPER, colors: ON_PAPER },
  // Pip keeps his usual colors on dark, as everywhere else in the app; only the background goes dark.
  dark: { bg: '#0E1712', ring: '#2C4A3A', disc: DEEP, spark: '#5CC99A', colors: ON_PAPER },
  tinted: { bg: '#000000', ring: '#3A3A3A', disc: '#1A1A1A', spark: '#FFFFFF', colors: GREY },
};
// The face is drawn 9.5 times its 200-unit size, shifted so the lid sits near the top and the jar runs off the bottom.
const iconArt = ({ bg, ring, disc, spark, colors }) =>
  svg(
    1024,
    1024,
    rect(1024, 1024, bg) +
      `<circle cx="512" cy="768" r="512" fill="none" stroke="${ring}" stroke-width="41"/>` +
      `<circle cx="512" cy="768" r="461" fill="${disc}"/>` +
      sparkle(123, 143, 4.1, spark) +
      sparkle(922, 102, 2.56, spark) +
      `<g transform="translate(-434.3 -75.7) scale(9.463)">${iconFace(solidEyes(colors))}</g>`,
  );

write('assets/icon.png', iconArt(ICON_LOOK.light));
// iOS 18 dark and tinted appearances. Tinted icons are greyscale on black; the system adds the tint.
write('assets/ios-dark.png', iconArt(ICON_LOOK.dark));
write('assets/ios-tinted.png', iconArt(ICON_LOOK.tinted));
write('assets/favicon.png', svg(48, 48, rect(48, 48, LIME) + `<circle cx="24" cy="32" r="22" fill="${DEEP}"/>` + place(iconFace(ON_PAPER), 24, 24, 0.2, 100, 88)), 48);

// Android crops the foreground to a circle or squircle inside its middle 66%, so the whole jar is drawn small enough to sit
// well inside that. The disc, ring and sparkles live on the background layer, which Android moves a little against Pip.
const fg = (size) => svg(size, size, place(iconFace(ON_PAPER), size / 2, size / 2, size / 258, 100, 88));
write('assets/adaptive-icon.png', fg(1024));
write('assets/android-icon-foreground.png', fg(512));
write(
  'assets/android-icon-background.png',
  svg(
    512,
    512,
    rect(512, 512, LIME) +
      `<circle cx="256" cy="300" r="240" fill="none" stroke="#D4EFA6" stroke-width="10"/>` +
      `<circle cx="256" cy="300" r="222" fill="${DEEP}"/>` +
      sparkle(70, 80, 2, PAPER) +
      sparkle(448, 64, 1.3, PAPER),
  ),
);
write('assets/android-icon-monochrome.png', svg(432, 432, place(iconFace(MONO), 216, 216, 432 / 258, 100, 88)));

// ---- Launch screen. Expo shows this full-bleed with `contain` on the brand green.

write(
  'assets/splash-icon.png',
  svg(
    1284,
    2778,
    rect(1284, 2778, BRAND) +
      rays(642, 1280, 20, '#FFFFFF', 0.1) +
      shadow(642, 1790, 600, DEEP, 0.4) +
      place(pose('cheer', ON_GREEN), 642, 1290, 5.6, 100, 98) +
      text(642, 2120, 170, '#FFFFFF', 'Kelmi', { spacing: -4 }),
  ),
);

// ---- Logo lockups: Pip beside the wordmark, for docs, the website, and press.

const lockup = (colors, word) =>
  svg(600, 280, place(pose('cheer', colors), 130, 140, 1.55, 100, 98) + text(270, 186, 150, word, 'Kelmi', { anchor: 'start', spacing: -4 }));
const lockupLight = lockup(ON_PAPER, INK);
const lockupDark = lockup(ON_DARK, '#E8F1EB');
write('marketing/logo.svg', lockupLight);
write('marketing/logo-dark.svg', lockupDark);
write('marketing/logo.png', lockupLight, 1200);
write('marketing/logo-dark.png', lockupDark, 1200);
write('marketing/pip-mark.svg', svg(200, 200, place(bust(ON_PAPER), 100, 96, 1.4)));

// ---- Posters at the 6.9" iPhone screenshot size (1290 x 2796), for ads and the lead store image. Pip leads each one.
// Apple wants most store screenshots to show the app itself, so pair these with real screen captures.
// Each frame has its own pose, color and layout so the set reads as a story, not five copies of one card.

const W = 1290;
const H = 2796;
const frames = [
  {
    file: 'poster-1-plan',
    bg: BRAND,
    ink: '#FFFFFF',
    pose: 'wave',
    pip: ON_GREEN,
    head: ['Every meal of the week,', 'inside your grocery budget.'],
    sub: ['Pip plans breakfast, lunch, and dinner', 'for everyone you cook for.'],
    doodles: ['leaf', 'tomato', 'egg'],
  },
  {
    file: 'poster-2-likes',
    bg: PAPER,
    ink: INK,
    pose: 'love',
    pip: ON_PAPER,
    head: ['Plans around the', 'foods you love.'],
    sub: ['Tell Pip you like curry and pasta,', 'and they show up first.'],
    doodles: ['lemon', 'spoon', 'tomato'],
  },
  {
    file: 'poster-3-groceries',
    bg: '#CFE8DA',
    ink: INK,
    pose: 'shop',
    pip: ON_PAPER,
    head: ['One grocery list', 'for the whole week.'],
    sub: ['Check things off as you shop.', 'What you already have stays off it.'],
    doodles: ['egg', 'leaf', 'lemon'],
  },
  {
    file: 'poster-4-budget',
    bg: DEEP,
    ink: '#FFFFFF',
    pose: 'cheer',
    pip: ON_GREEN,
    head: ['See what you have', 'left to spare.'],
    sub: ['Every plan shows what it costs', 'before you buy a thing.'],
    doodles: ['tomato', 'spoon', 'leaf'],
  },
  {
    file: 'poster-5-cook',
    bg: '#0E1712',
    ink: '#E8F1EB',
    pose: 'cook',
    pip: ON_DARK,
    head: ['Swap any meal', 'you are not feeling.'],
    sub: ['Pip offers cheaper or quicker', 'recipes that still fit the week.'],
    doodles: ['leaf', 'egg', 'spoon'],
  },
];

frames.forEach((f, i) => {
  const dIn = f.ink === INK ? INK : '#FFFFFF';
  const dFill = f.ink === INK ? '#FFFFFF' : 'none';
  // Alternate Pip high and low so neighbors in the store listing do not line up.
  const pipY = i % 2 ? 1530 : 1420;
  const body =
    rect(W, H, f.bg) +
    doodle(f.doodles[0], 90, 860 + i * 30, 120, -18, dIn, dFill, 0.22) +
    doodle(f.doodles[1], 1060, 1060 - i * 40, 110, 22, dIn, dFill, 0.22) +
    doodle(f.doodles[2], 150, 2050 - i * 25, 96, 12, dIn, dFill, 0.18) +
    lines(W / 2, 330, 104, 120, f.ink, f.head, { spacing: -2 }) +
    shadow(W / 2, pipY + 520, 660, f.ink === INK ? INK : '#000000', 0.14) +
    place(pose(f.pose, f.pip), W / 2, pipY, 6.6, 110, 107) +
    lines(W / 2, 2300, 56, 76, f.ink, f.sub, { weight: 500 }) +
    text(W / 2, 2620, 48, f.ink, 'Kelmi', { weight: 700, spacing: -1 });
  write(`marketing/${f.file}.png`, svg(W, H, body));
});

// ---- Social share card (1200 x 630) and Google Play feature graphic (1024 x 500). Pip in the middle, words around.

write(
  'marketing/social-card.png',
  svg(
    1200,
    630,
    rect(1200, 630, BRAND) +
      doodle('tomato', 70, 70, 90, -12, '#FFFFFF', 'none', 0.25) +
      doodle('leaf', 1040, 440, 100, 18, '#FFFFFF', 'none', 0.25) +
      shadow(600, 520, 300, DEEP, 0.4) +
      place(pose('wave', ON_GREEN), 600, 330, 2.6, 110, 107) +
      text(600, 96, 64, '#FFFFFF', 'Kelmi', { spacing: -2 }) +
      text(600, 600, 34, '#FFFFFF', 'Every meal of the week, inside your grocery budget.', { weight: 500 }),
  ),
);

write(
  'marketing/play-feature.png',
  svg(
    1024,
    500,
    rect(1024, 500, BRAND) +
      doodle('lemon', 820, 60, 80, 20, '#FFFFFF', 'none', 0.25) +
      doodle('egg', 120, 360, 70, -10, '#FFFFFF', 'none', 0.25) +
      shadow(512, 420, 220, DEEP, 0.4) +
      place(pose('cheer', ON_GREEN), 512, 268, 1.9, 100, 107) +
      text(195, 282, 92, '#FFFFFF', 'Kelmi', { spacing: -3 }) +
      lines(835, 240, 34, 44, '#FFFFFF', ['Meals for the week,', 'inside your budget.'], { weight: 500 }),
  ),
);

console.log(`Wrote ${out.length} files:\n  ${out.join('\n  ')}`);
