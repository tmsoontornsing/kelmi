// Pip's drawing parts, shared by build-mascot.mjs (the in-app poses) and build-brand.mjs (icons and promo art).

// Color tokens. <Mascot> swaps these for the light or dark palette at render time.
export const INK = '__INK__'; // outlines and the face
export const G = '__G__'; // what is in the jar
export const TINT = '__TINT__'; // lid band, caps, coins
export const GLASS = '__GLASS__';
export const BLUSH = '__BLUSH__'; // cheeks, tongue, heart
export const W = '__W__'; // paper-white fills: hands, lid top, cards

export const LIGHT = { INK: '#13241A', G: '#3DAA84', TINT: '#CFE8DA', GLASS: '#E8F3EC', BLUSH: '#F4AE9C', W: '#FFFFFF' };

export const JAR = 'M74 52 H126 V64 Q126 70 134 76 Q146 84 146 98 V142 Q146 160 128 160 H72 Q54 160 54 142 V98 Q54 84 66 76 Q74 70 74 64 Z';

// ---- Pieces

export const S = (w) => `stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
export const P = (d, w = 3.5, fill = 'none') => `<path d="${d}" fill="${fill}" ${S(w)}/>`;
export const C = (x, y, r, fill = W, w = 3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${S(w)}/>`;
export const E = (x, y, rx, ry, fill) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
export const hand = (x, y) => C(x, y, 6);
export const at = (dy, art) => (dy ? `<g transform="translate(0 ${dy})">${art}</g>` : art);

export const legs = () => P('M84 156 V182 h-8', 4) + P('M116 156 V182 h8', 4);
export const legsApart = () => P('M84 156 L77 180 h-8', 4) + P('M116 156 L123 180 h8', 4);

// `fill` is the top of what is in the jar: a smaller number is a fuller jar.
export const jar = (fill = 118) =>
  `<defs><clipPath id="jar"><path d="${JAR}"/></clipPath></defs>` +
  `<path d="${JAR}" fill="${GLASS}"/>` +
  `<path d="M40 ${fill} Q70 ${fill - 7} 100 ${fill} T160 ${fill} V170 H40 Z" fill="${G}" clip-path="url(#jar)"/>` +
  `<path d="M64 92 v14" stroke="${W}" stroke-width="4" stroke-linecap="round"/>` +
  `<path d="${JAR}" fill="none" ${S(3.5)}/>`;

export const lid = (tx = 0, ty = 0, rot = 0) =>
  `<g transform="translate(${tx} ${ty}) rotate(${rot} 100 46)">` +
  `<rect x="68" y="40" width="64" height="16" rx="4" fill="${TINT}" ${S(3.5)}/>` +
  P('M78 45 v6 M88 45 v6 M98 45 v6 M108 45 v6 M118 45 v6', 2) +
  `<rect x="72" y="32" width="56" height="10" rx="4" fill="${W}" ${S(3.5)}/></g>`;

export const blush = (o = 0.75) =>
  `<g opacity="${o}">${E(70, 104, 6.5, 3.8, BLUSH)}${E(130, 104, 6.5, 3.8, BLUSH)}</g>`;

// Open eyes with a small shine. dx and dy shift where Pip is looking.
export const eyes = (dx = 0, dy = 0, ry = 6.5) =>
  [82, 118].map((x) => E(x + dx, 92 + dy, 5, ry, INK) + `<circle cx="${x + dx + 1.6}" cy="${92 + dy - 2.4}" r="1.7" fill="${W}"/>`).join('');
export const happyEyes = () => P('M75 94 q7 -9 14 0', 3.5) + P('M111 94 q7 -9 14 0', 3.5);
export const sleepyEyes = () => P('M75 92 q7 7 14 0', 3.5) + P('M111 92 q7 7 14 0', 3.5);

export const smile = () => P('M92 104 Q100 111 108 104', 3.5);
export const grin = () =>
  P('M89 101 Q100 118 111 101 Z', 2.5, INK) + `<path d="M95 109 Q100 104 105 109 Q100 113 95 109 Z" fill="${BLUSH}"/>`;

export const blinking = (art, x = 100, y = 92) => ({ svg: art, anim: { kind: 'blink', origin: [x, y] } });
