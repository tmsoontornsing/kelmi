// Decorative background layers for the parallax. Each shape carries data-depth, which Motion.tsx turns into a
// vertical offset as the section crosses the screen. Positive depth lags the scroll, negative leads it.
// Never put data-depth on anything Pip stands on or points at: his stops are measured from those boxes.
type Shape = { k: 'blob' | 'ring' | 'leaf' | 'pip'; x: string; y: string; s: number; d: number; r?: number };

const SETS: Record<string, Shape[]> = {
  hero: [
    { k: 'blob', x: '62%', y: '-6%', s: 520, d: -0.22 },
    { k: 'blob', x: '-8%', y: '58%', s: 360, d: 0.16 },
    { k: 'leaf', x: '55%', y: '3%', s: 54, d: -0.34, r: 24 },
    { k: 'ring', x: '90%', y: '64%', s: 150, d: 0.28 },
  ],
  how: [
    { k: 'blob', x: '-10%', y: '10%', s: 420, d: 0.18 },
    { k: 'leaf', x: '88%', y: '6%', s: 60, d: -0.3, r: -30 },
    { k: 'ring', x: '94%', y: '70%', s: 190, d: 0.22 },
  ],
  features: [
    { k: 'blob', x: '78%', y: '4%', s: 480, d: -0.16 },
    { k: 'leaf', x: '3%', y: '12%', s: 50, d: -0.32, r: 40 },
    { k: 'blob', x: '-12%', y: '70%', s: 400, d: 0.18 },
  ],
  pricing: [
    { k: 'blob', x: '70%', y: '10%', s: 420, d: 0.16 },
    { k: 'leaf', x: '6%', y: '70%', s: 56, d: -0.3, r: -18 },
  ],
  box: [
    { k: 'pip', x: '58%', y: '58%', s: 150, d: -0.14, r: -14 },
    { k: 'leaf', x: '74%', y: '12%', s: 46, d: 0.3, r: 32 },
    { k: 'ring', x: '40%', y: '80%', s: 110, d: 0.24 },
  ],
  faq: [
    { k: 'blob', x: '-10%', y: '20%', s: 380, d: 0.18 },
    { k: 'leaf', x: '92%', y: '10%', s: 52, d: -0.3, r: 20 },
  ],
};

export function Depth({ set }: { set: keyof typeof SETS }) {
  return (
    <div className={`depth-layer set-${set}`} aria-hidden="true">
      {SETS[set].map((s, i) => (
        <span
          key={i}
          className={`depth d-${s.k}`}
          data-depth={s.d}
          style={{ left: s.x, top: s.y, width: s.s, height: s.s, ['--r' as string]: `${s.r ?? 0}deg` }}
        >
          {s.k === 'leaf' && (
            <svg viewBox="0 0 48 48" width="100%" height="100%"><path d="M8 40C8 18 22 6 42 6c0 20-12 34-34 34Z" fill="currentColor" /><path d="M8 40 30 18" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
          )}
          {s.k === 'pip' && <img src="/pip-mark.svg" alt="" width="100%" height="100%" />}
        </span>
      ))}
    </div>
  );
}
