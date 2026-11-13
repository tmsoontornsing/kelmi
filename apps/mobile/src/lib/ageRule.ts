export const MIN_AGE = 13;

// True once the person has had their 13th birthday (on the day itself they count as 13). Uses the exact date, so a
// 12-year-old is never let through by rounding to the month. 29 February in a non-leap year rolls to 1 March, the later
// (safer) day.
export function meetsMinimumAge(birth: { year: number; month: number; day: number }, now = new Date()): boolean {
  const thirteenth = new Date(birth.year + MIN_AGE, birth.month - 1, birth.day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return thirteenth <= today;
}
