// Times written in a recipe step, so Cook mode can offer a timer for them. "Roast for 20 minutes" gives 20 minutes; a range such
// as "8 to 10 minutes" gives the longer end, since a timer that goes off early is worse than one that goes off a little late.
// Temperatures ("425F") and quantities are not times, and nothing is guessed when a step names none.

export type StepTimer = { seconds: number; label: string };

const TIME = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
const UNIT_SECONDS = (unit: string) => (/^h/i.test(unit) ? 3600 : /^m/i.test(unit) ? 60 : 1);

export function parseTimers(step: string): StepTimer[] {
  const found: StepTimer[] = [];
  for (const m of step.matchAll(TIME)) {
    const amount = Number(m[2] ?? m[1]);
    const seconds = Math.round(amount * UNIT_SECONDS(m[3]));
    // Ignore zero, and anything over a day, which is not a cooking time.
    if (seconds > 0 && seconds <= 24 * 3600 && !found.some((f) => f.seconds === seconds)) found.push({ seconds, label: m[0].trim() });
  }
  return found;
}

// 1:05:00, 12:30 or 0:45, for a countdown.
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
