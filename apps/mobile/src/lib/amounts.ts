// How an ingredient amount reads in a kitchen: "¼ avocado" worth of a number, not "0.25 each". Quantities are scaled to the household,
// so one person gets fractions of a jar or an avocado. These snap to the nearest eighth or third, never show a decimal, and
// say "a pinch" or "a little" when the amount is too small to measure.

const FRACTIONS: [number, string][] = [
  [0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, ''],
];

// A number as whole plus fraction: 0.26 -> "¼", 1.5 -> "1½", 2 -> "2".
export function fractionText(n: number): string {
  const whole = Math.floor(n);
  const rest = n - whole;
  const [value, glyph] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - rest) < Math.abs(best[0] - rest) ? f : best));
  const total = value === 1 ? whole + 1 : whole;
  return `${total > 0 ? total : ''}${value === 1 ? '' : glyph}` || '0';
}

const PLURAL: Record<string, string> = { can: 'cans', clove: 'cloves', bunch: 'bunches', jar: 'jars', bag: 'bags', slice: 'slices', block: 'blocks', pack: 'packs', tub: 'tubs' };
// Counted items read as the item itself ("2 eggs" is already clear without "each"), so the unit is left out.
const BARE = new Set(['each', 'unit']);

// The amount and unit as one phrase, in English wording. `plural` adds the s for more than one (English only: the other
// languages' units are translated word by word and don't take it).
export function friendlyAmount(quantity: number, unit: string, plural = true, name = ''): string {
  if (quantity <= 0) return '';
  const spoons = quantity < 1 ? measureOfPackage(name, unit, quantity) : null;
  if (spoons) return spoons;
  const tiny = quantity < 1 / 16;
  if (tiny) return unit === 'tsp' || unit === 'tbsp' ? 'a pinch' : 'a little';
  const text = fractionText(quantity);
  if (BARE.has(unit)) return text;
  const more = quantity > 1 && plural && PLURAL[unit] ? PLURAL[unit] : unit;
  return `${text} ${more}`;
}

// What a whole jar, can, bunch or bag holds in cups, for foods people measure by the spoon once the package is opened. A
// fraction of a jar of salsa means nothing at the stove; "¼ cup" does. Rough sizes of the usual store package, so the result
// is "about". Foods not listed keep the plain fraction.
const CUPS_IN_PACKAGE: Record<string, number> = {
  'salsa|jar': 2,
  'hummus|jar': 1.5,
  'marinara sauce|jar': 3,
  'tomato paste|can': 0.75,
  'diced tomatoes (canned)|can': 1.75,
  'black beans (canned)|can': 1.5,
  'kidney beans (canned)|can': 1.5,
  'chickpeas (canned)|can': 1.5,
  'spinach|bag': 10,
  'cilantro|bunch': 1,
  'parsley|bunch': 1,
  'basil|bunch': 1,
  'green onions|bunch': 1,
  'frozen berries|bag': 3,
  'frozen corn|bag': 3,
  'frozen peas and carrots|bag': 3,
};

function measureOfPackage(name: string, unit: string, quantity: number): string | null {
  const cups = CUPS_IN_PACKAGE[`${name.trim().toLowerCase()}|${unit}`];
  if (!cups) return null;
  const amount = cups * quantity;
  if (amount >= 0.2) return `about ${fractionText(amount)} ${amount > 1 ? 'cups' : 'cup'}`;
  const tbsp = Math.round(amount * 16);
  if (tbsp >= 1) return `about ${tbsp} tbsp`;
  return 'a pinch';
}
