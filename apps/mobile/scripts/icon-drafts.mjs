// Five rough drafts of a livelier app icon, all built from Pip's own drawing parts. Writes marketing/icon-drafts/:
//   draft-1-*.png ... draft-5-*.png     the 1024 icons
//   sheet.png                           all five side by side with the iOS corner mask, for comparing
// Nothing here touches assets/icon.png. Run: node scripts/icon-drafts.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import { MASCOT_POSES } from '../src/components/mascotPoses.generated.ts';
import { blush, C, E, eyes, grin, happyEyes, jar, lid, P, smile } from './pip-art.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'marketing', 'icon-drafts');
mkdirSync(dir, { recursive: true });
const font = (w) => join(root, `node_modules/@expo-google-fonts/outfit/${w}/Outfit_${w}.ttf`);

const BRAND = '#3DAA84';
const DEEP = '#1F7A4D';
const INK = '#13241A';
const PAPER = '#F7FAF5';
const SUN = '#A7D96B'; // the lime from the badge, the one extra accent

const ON_GREEN = { INK, G: DEEP, TINT: '#CFE8DA', GLASS: PAPER, BLUSH: '#F4AE9C', W: '#FFFFFF' };
const ON_PAPER = { INK, G: BRAND, TINT: '#CFE8DA', GLASS: '#E8F3EC', BLUSH: '#F4AE9C', W: '#FFFFFF' };
const ON_DEEP = { INK, G: BRAND, TINT: '#CFE8DA', GLASS: PAPER, BLUSH: '#F4AE9C', W: '#FFFFFF' };

const paint = (art, colors) => art.replace(/__([A-Z]+)__/g, (_, k) => colors[k]);
let clips = 0;
const uniq = (art) => {
  const id = `jar${clips++}`;
  return art.replaceAll('id="jar"', `id="${id}"`).replaceAll('url(#jar)', `url(#${id})`);
};
const place = (art, x, y, s, cx = 100, cy = 96, rot = 0) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s}) translate(${-cx} ${-cy})">${art}</g>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const rect = (w, h, fill) => `<rect width="${w}" height="${h}" fill="${fill}"/>`;
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
const pose = (name, colors) => {
  const layers = MASCOT_POSES[name].layers;
  const ordered = [...layers.filter((l) => !l.fixed), ...layers.filter((l) => l.fixed)];
  return uniq(ordered.map((l) => paint(l.svg.replace(/^<svg[^>]*>|<\/svg>$/g, ''), colors)).join(''));
};

// Food doodles in a 48-unit box, centered on (24, 24).
const food = {
  leaf: (f) => `<g fill="${f}" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39 C9 19 21 8 39 8 C39 27 28 39 9 39 Z"/><path d="M9 39 L29 18" fill="none"/></g>`,
  tomato: (f) => `<g fill="${f}" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="27" r="15"/><path d="M24 12 l-5 5 M24 12 l5 5 M24 12 v7 M24 12 q3 -5 8 -4" fill="none"/></g>`,
  lemon: (f) => `<g fill="${f}" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-25 24 24)"><ellipse cx="24" cy="24" rx="17" ry="11"/><path d="M5 24 h-3 M43 24 h3" fill="none"/></g>`,
  egg: (f) => `<g fill="${f}" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M24 7 C15 7 10 23 10 30 C10 38 16 42 24 42 C32 42 38 38 38 30 C38 23 33 7 24 7 Z"/></g>`,
  carrot: (f) => `<g stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12 C30 8 42 22 38 40 C20 44 6 32 10 12 Z" fill="${f}" transform="rotate(-35 24 24)"/><path d="M33 10 q4 -6 9 -3 M33 10 q-1 -7 4 -9" fill="none" stroke="${INK}"/></g>`,
};
const item = (name, fill, x, y, s, rot = 0) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s}) translate(-24 -24)">${food[name](fill)}</g>`;
const spark = (x, y, r, fill) => {
  const v = Array.from({ length: 8 }, (_, n) => {
    const a = (n * Math.PI) / 4 - Math.PI / 2;
    const d = n % 2 === 0 ? r : r * 0.26;
    return `${(x + Math.cos(a) * d).toFixed(1)} ${(y + Math.sin(a) * d).toFixed(1)}`;
  });
  return `<path d="M${v.join(' L')} Z" fill="${fill}"/>`;
};
const shadow = (x, y, w, fill, o) => `<ellipse cx="${x}" cy="${y}" rx="${w / 2}" ry="${w / 14}" fill="${fill}" opacity="${o}"/>`;
const whoosh = (x1, y1, x2, y2, stroke, w = 12) =>
  `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;

const drafts = [];

// 1. Lid pop. Pip is only a face and jar, and the lid blows off while food bursts out of the top.
{
  const pip = uniq(paint(jar(104) + lid(36, -34, 24) + blush(0.9) + grin(), ON_GREEN) + paint(eyes(), ON_GREEN));
  drafts.push({
    name: 'draft-1-lid-pop',
    title: 'Lid pop',
    note: 'Food erupts from the jar',
    art:
      rect(1024, 1024, BRAND) +
      rays(512, 640, 18, '#FFFFFF', 0.14) +
      shadow(512, 930, 460, DEEP, 0.4) +
      item('tomato', '#F4AE9C', 300, 250, 3.6, -18) +
      item('leaf', SUN, 512, 150, 3.4, 8) +
      item('lemon', '#FFE48A', 730, 255, 3.4, 20) +
      whoosh(400, 400, 360, 330, '#FFFFFF', 11) +
      whoosh(624, 400, 664, 330, '#FFFFFF', 11) +
      place(pip, 512, 620, 5.6, 100, 96),
  });
}

// 2. Big grin. Tight crop: the face is the whole icon, so it still reads at 29 points on a home screen.
{
  const pip = uniq(paint(jar(106) + lid(0, -2, -7) + blush(0.95) + grin() , ON_GREEN) + paint(eyes(0, 0, 7.5), ON_GREEN));
  drafts.push({
    name: 'draft-2-big-grin',
    title: 'Big grin',
    note: 'Face fills the icon',
    art:
      rect(1024, 1024, SUN) +
      rays(512, 560, 14, '#FFFFFF', 0.28) +
      spark(160, 190, 70, '#FFFFFF') +
      spark(880, 300, 46, '#FFFFFF') +
      spark(850, 820, 58, BRAND) +
      place(pip, 512, 560, 8.2, 100, 96),
  });
}

// 3. Hello wave. Light background, so it stands apart from the green icons around it on a home screen.
{
  const pip = pose('wave', ON_PAPER);
  drafts.push({
    name: 'draft-3-hello-wave',
    title: 'Hello wave',
    note: 'Paper background, full Pip',
    art:
      rect(1024, 1024, PAPER) +
      `<rect y="800" width="1024" height="224" fill="${BRAND}"/>` +
      `<rect y="800" width="1024" height="16" fill="${DEEP}"/>` +
      item('tomato', '#F4AE9C', 170, 770, 3.2, -10) +
      item('leaf', SUN, 860, 760, 3.0, 25) +
      shadow(512, 868, 420, DEEP, 0.3) +
      place(pip, 500, 490, 5.2, 100, 98),
  });
}

// 4. Full jar. Pip is stuffed with what he plans: the food shows through the glass.
{
  const insides =
    item('carrot', '#F2A65A', 82, 133, 0.52, 10) +
    item('tomato', '#F4AE9C', 104, 132, 0.56, 0) +
    item('leaf', SUN, 124, 135, 0.5, 20) +
    item('egg', '#FFFFFF', 94, 150, 0.4, -15);
  // The food sits inside the jar, in front of the glass and behind the outline.
  const body =
    `<defs><clipPath id="jar"><path d="M74 52 H126 V64 Q126 70 134 76 Q146 84 146 98 V142 Q146 160 128 160 H72 Q54 160 54 142 V98 Q54 84 66 76 Q74 70 74 64 Z"/></clipPath></defs>` +
    `<path d="M74 52 H126 V64 Q126 70 134 76 Q146 84 146 98 V142 Q146 160 128 160 H72 Q54 160 54 142 V98 Q54 84 66 76 Q74 70 74 64 Z" fill="__GLASS__"/>` +
    `<g clip-path="url(#jar)">${insides}</g>` +
    `<path d="M64 92 v14" stroke="__W__" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M74 52 H126 V64 Q126 70 134 76 Q146 84 146 98 V142 Q146 160 128 160 H72 Q54 160 54 142 V98 Q54 84 66 76 Q74 70 74 64 Z" fill="none" stroke="__INK__" stroke-width="3.5" stroke-linejoin="round"/>`;
  const pip = uniq(paint(body + lid(0, -6, -4) + blush(0.9) + smile(), ON_GREEN) + paint(eyes(), ON_GREEN));
  drafts.push({
    name: 'draft-4-full-jar',
    title: 'Full jar',
    note: 'Pip is full of the week’s food',
    art:
      rect(1024, 1024, DEEP) +
      rays(512, 560, 16, '#FFFFFF', 0.07) +
      shadow(512, 912, 440, INK, 0.45) +
      place(pip, 512, 540, 6.3, 100, 98),
  });
}

// 5. Chef Pip. A chef's hat for a lid, a wink, and steam, so the icon says cooking before it says anything else.
{
  const hat =
    C(80, 36, 15, '#FFFFFF', 3.5) + C(120, 36, 15, '#FFFFFF', 3.5) + C(100, 26, 18, '#FFFFFF', 3.5) +
    `<rect x="66" y="42" width="68" height="16" rx="4" fill="#FFFFFF" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>` +
    P('M84 47 v6 M100 47 v6 M116 47 v6', 2.5);
  const wink = E(82, 92, 5, 6.5, '__INK__') + `<circle cx="83.6" cy="89.6" r="1.7" fill="__W__"/>` + P('M111 94 q7 -9 14 0', 3.5);
  const steam = P('M160 84 q-8 -10 0 -20 q8 -10 0 -20', 4.5) + P('M176 100 q-6 -8 0 -16', 4);
  const spoon =
    `<g transform="rotate(-18 152 120)">` +
    P('M152 128 V84', 5) +
    `<ellipse cx="152" cy="76" rx="11" ry="14" fill="__TINT__" stroke="__INK__" stroke-width="3.5"/></g>` +
    P('M146 128 Q148 120 152 124', 4);
  const pip = uniq(
    paint(jar(110) + hat + blush(0.9) + P('M89 101 Q100 118 111 101 Z', 2.5, '__INK__') + `<path d="M95 109 Q100 104 105 109 Q100 113 95 109 Z" fill="__BLUSH__"/>`, ON_GREEN) +
      paint(wink, ON_GREEN) +
      paint(steam, { ...ON_GREEN, INK: '#FFFFFF' }) +
      paint(spoon, ON_GREEN),
  );
  drafts.push({
    name: 'draft-5-chef-pip',
    title: 'Chef Pip',
    note: 'Chef hat, wink, spoon, steam',
    art:
      rect(1024, 1024, BRAND) +
      rays(512, 600, 12, '#FFFFFF', 0.12) +
      shadow(512, 920, 440, DEEP, 0.4) +
      place(pip, 512, 540, 5.2, 100, 96),
  });
}

const fonts = { fontFiles: [font('700Bold'), font('500Medium')], loadSystemFonts: false, defaultFontFamily: 'Outfit' };
const render = (body, width) => new Resvg(body, { fitTo: { mode: 'width', value: width }, font: fonts }).render().asPng();

const pngs = drafts.map((d) => ({ ...d, png: render(svg(1024, 1024, d.art), 1024) }));
for (const d of pngs) writeFileSync(join(dir, `${d.name}.png`), d.png);

// The sheet: each icon at 360 px with iOS's rounded corners, a title under it, and a 60 px copy to check small sizes.
const CELL = 400;
const sheet = svg(
  CELL * 5 + 60,
  620,
  rect(CELL * 5 + 60, 620, '#EEF1EC') +
    pngs
      .map((d, i) => {
        const x = 30 + i * CELL;
        const href = `data:image/png;base64,${d.png.toString('base64')}`;
        return (
          `<defs><clipPath id="m${i}"><rect x="${x}" y="30" width="360" height="360" rx="80"/></clipPath>` +
          `<clipPath id="s${i}"><rect x="${x}" y="500" width="60" height="60" rx="13"/></clipPath></defs>` +
          `<image href="${href}" x="${x}" y="30" width="360" height="360" clip-path="url(#m${i})"/>` +
          `<image href="${href}" x="${x}" y="500" width="60" height="60" clip-path="url(#s${i})"/>` +
          `<text x="${x + 180}" y="436" font-family="Outfit" font-weight="700" font-size="30" fill="${INK}" text-anchor="middle">${i + 1}. ${d.title}</text>` +
          `<text x="${x + 180}" y="470" font-family="Outfit" font-weight="500" font-size="21" fill="#55665B" text-anchor="middle">${d.note}</text>` +
          `<text x="${x + 80}" y="538" font-family="Outfit" font-weight="500" font-size="18" fill="#55665B">at home-screen size</text>`
        );
      })
      .join(''),
);
writeFileSync(join(dir, 'sheet.png'), render(sheet, CELL * 5 + 60));
console.log(`wrote ${pngs.length} drafts and sheet.png to ${dir}`);
