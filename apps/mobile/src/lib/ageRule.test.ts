import assert from 'node:assert/strict';
import { test } from 'node:test';

// @ts-expect-error Node runs this file directly and needs the .ts extension, which the app's TypeScript settings don't allow.
import { meetsMinimumAge } from './ageRule.ts';

const now = new Date(2026, 10, 12); // 12 Nov 2026

test('13th birthday today counts as 13', () => assert.equal(meetsMinimumAge({ year: 2013, month: 11, day: 12 }, now), true));
test('13th birthday tomorrow is still under 13', () => assert.equal(meetsMinimumAge({ year: 2013, month: 11, day: 13 }, now), false));
test('born earlier in the 13th-birthday month is fine', () => assert.equal(meetsMinimumAge({ year: 2013, month: 11, day: 1 }, now), true));
test('adults pass, children fail', () => {
  assert.equal(meetsMinimumAge({ year: 1990, month: 5, day: 20 }, now), true);
  assert.equal(meetsMinimumAge({ year: 2020, month: 1, day: 1 }, now), false);
});
test('29 February birthdays roll to 1 March in a non-leap year', () => {
  assert.equal(meetsMinimumAge({ year: 2012, month: 2, day: 29 }, new Date(2025, 2, 1)), true);
  assert.equal(meetsMinimumAge({ year: 2012, month: 2, day: 29 }, new Date(2025, 1, 28)), false);
});
