// The "big grin" app icon, refined from draft 2, in every appearance the app ships. Writes marketing/icon-drafts/big-grin/:
//   icon.png, ios-dark.png, ios-tinted.png                                the iOS icon in its three appearances
//   adaptive-icon.png, android-icon-foreground/background/monochrome.png  the Android layers
//   sheet.png                                                             all of them side by side for review
// Nothing here touches assets/. To use it, copy these files over the ones in assets/ (see the sheet first).
// Run: node scripts/icon-big-grin.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import { blush, eyes, grin, jar, lid, P } from './pip-art.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'marketing', 'icon-drafts', 'big-grin');
mkdirSync(dir, { recursive: true });
const font = (w) => join(root, `node_modules/@expo-google-fonts/outfit/${w}/Outfit_${w}.ttf`);

const BRAND = '#3DAA84';
const DEEP = '#1F7A4D';
const INK = '#13241A';
const PAPER = '#F7FAF5';
const LIME = '#A7D96B';

const ON_GREEN = { INK, G: DEEP, TINT: '#CFE8DA', GLASS: PAPER, BLUSH: '#F4AE9C', W: '#FFFFFF' };
const ON_DARK = { INK: '#E8F1EB', G: '#5CC99A', TINT: '#2C4A3A', GLASS: '#1F3328', BLUSH: '#C97F70', W: '#17231C' };
const GREY = { INK: '#F2F2F2', G: '#CFCFCF', TINT: '#5A5A5A', GLASS: '#262626', BLUSH: '#8A8A8A', W: '#141414' };
const MONO = { INK: '#000000', G: '#000000', TINT: 'none', GLASS: 'none', BLUSH: 'none', W: 'none' };

const paint = (art, colors) => art.replace(/__([A-Z]+)__/g, (_, k) => colors[k]);
let clips = 0;
const uniq = (art) => {
  const id = `jar${clips++}`;
  return art.replaceAll('id="jar"', `id="${id}"`).replaceAll('url(#jar)', `url(#${id})`);
};
// On dark, the eye shine is drawn in the ink color so the eyes stay solid instead of reading as rolled back.
const solidEyes = (c) => (c.INK === INK ? c : { ...c, W: c.INK });

// Pip's face: a happier grin than the stock bust, lid knocked sideways, cheeks a little bigger.
const bigGrin = (colors) =>
  uniq(
    paint(jar(106) + lid(8, -6, -11) + blush(0.95) + grin() + P('M142 36 l8 -9', 4.5) + P('M148 49 l11 -3', 4.5) + P('M56 38 l-5 -9', 4.5), colors) +
      paint(eyes(0, 0, 7.5), solidEyes(colors)),
  );

const place = (art, x, y, s, cx = 100, cy = 96) => `<g transform="translate(${x - cx * s} ${y - cy * s}) scale(${s})">${art}</g>`;
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
const spark = (x, y, r, fill) => {
  const v = Array.from({ length: 8 }, (_, n) => {
    const a = (n * Math.PI) / 4 - Math.PI / 2;
    const d = n % 2 === 0 ? r : r * 0.26;
    return `${(x + Math.cos(a) * d).toFixed(1)} ${(y + Math.sin(a) * d).toFixed(1)}`;
  });
  return `<path d="M${v.join(' L')} Z" fill="${fill}"/>`;
};
const SCALE = 7;
const ART_Y = 600;
const icon = (bg, colors, rayFill, rayOp, sparkA, sparkB) =>
  svg(
    1024,
    1024,
    rect(1024, 1024, bg) +
      rays(512, 580, 14, rayFill, rayOp) +
      spark(140, 250, 74, sparkA) +
      spark(886, 330, 48, sparkB) +
      place(bigGrin(colors), 512, ART_Y, SCALE, 100, 96),
  );

const files = {
  'icon.png': icon(LIME, ON_GREEN, '#FFFFFF', 0.28, '#FFFFFF', BRAND),
  'ios-dark.png': icon('#0E1712', ON_DARK, '#5CC99A', 0.1, '#A7D96B', '#5CC99A'),
  'ios-tinted.png': svg(
    1024,
    1024,
    rect(1024, 1024, '#000000') + rays(512, 580, 14, '#FFFFFF', 0.1) + spark(140, 250, 74, '#FFFFFF') + spark(886, 330, 48, '#9A9A9A') +
      place(bigGrin(GREY), 512, ART_Y, SCALE, 100, 96),
  ),
  // Android crops the foreground to a circle or squircle inside its middle 66%, so the face is smaller and has no sparkles.
  'adaptive-icon.png': svg(1024, 1024, place(bigGrin(ON_GREEN), 512, 520, 4.4, 100, 96)),
  'android-icon-foreground.png': svg(512, 512, place(bigGrin(ON_GREEN), 256, 260, 2.2, 100, 96)),
  'android-icon-background.png': svg(512, 512, rect(512, 512, LIME) + rays(256, 270, 14, '#FFFFFF', 0.28)),
  'android-icon-monochrome.png': svg(432, 432, place(bigGrin(MONO), 216, 218, 1.85, 100, 96)),
};

const fonts = { fontFiles: [font('700Bold'), font('500Medium')], loadSystemFonts: false, defaultFontFamily: 'Outfit' };
const render = (body, width) => new Resvg(body, { fitTo: { mode: 'width', value: width }, font: fonts }).render().asPng();
const widths = { 'android-icon-foreground.png': 512, 'android-icon-background.png': 512, 'android-icon-monochrome.png': 432 };
const pngs = {};
for (const [name, body] of Object.entries(files)) {
  pngs[name] = render(body, widths[name] ?? 1024);
  writeFileSync(join(dir, name), pngs[name]);
}

// Review sheet: iOS three ways, then Android as a circle and a squircle, with a small copy of the light icon for scale.
const b64 = (name) => `data:image/png;base64,${pngs[name].toString('base64')}`;
const tile = (name, x, y, size, r, bgFill) =>
  `<defs><clipPath id="c${x}-${y}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}"/></clipPath></defs>` +
  (bgFill ? `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="${bgFill}"/>` : '') +
  `<image href="${b64(name)}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#c${x}-${y})"/>`;
const label = (x, y, str) => `<text x="${x}" y="${y}" font-family="Outfit" font-weight="700" font-size="22" fill="${INK}" text-anchor="middle">${str}</text>`;
const androidTile = (x, y, size, r) =>
  `<defs><clipPath id="a${x}-${r}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}"/></clipPath></defs>` +
  `<g clip-path="url(#a${x}-${r})"><image href="${b64('android-icon-background.png')}" x="${x}" y="${y}" width="${size}" height="${size}"/>` +
  `<image href="${b64('android-icon-foreground.png')}" x="${x}" y="${y}" width="${size}" height="${size}"/></g>`;

const S = 330;
const sheet = svg(
  1760,
  540,
  rect(1760, 540, '#EEF1EC') +
    tile('icon.png', 30, 30, S, 74) + label(30 + S / 2, 400, 'iOS light') +
    tile('ios-dark.png', 390, 30, S, 74) + label(390 + S / 2, 400, 'iOS dark') +
    tile('ios-tinted.png', 750, 30, S, 74) + label(750 + S / 2, 400, 'iOS tinted') +
    androidTile(1110, 30, 150, 75) + label(1185, 220, 'Circle') +
    androidTile(1290, 30, 150, 38) + label(1365, 220, 'Squircle') +
    `<rect x="1110" y="260" width="150" height="150" rx="30" fill="#FFFFFF"/>` +
    `<image href="${b64('android-icon-monochrome.png')}" x="1110" y="260" width="150" height="150"/>` + label(1185, 440, 'Themed') +
    tile('icon.png', 1480, 40, 60, 14) + tile('icon.png', 1560, 40, 40, 9) + tile('icon.png', 1620, 40, 29, 7) +
    `<text x="1480" y="130" font-family="Outfit" font-weight="500" font-size="19" fill="#55665B">small sizes</text>`,
);
writeFileSync(join(dir, 'sheet.png'), render(sheet, 1760));
console.log(`wrote ${Object.keys(files).length} files and sheet.png to ${dir}`);
