// Living background behind the whole page: slow colour clouds, rising bubbles and twinkling sparkles. Fixed in place
// and decorative. Positions are fixed numbers, not random, so the server and browser draw the same thing.
const BUBBLES = [
  [6, 18, 22, 0], [16, 10, 26, 6], [27, 24, 19, 11], [38, 12, 28, 3], [49, 20, 23, 14], [58, 9, 30, 8],
  [68, 22, 21, 1], [77, 14, 27, 12], [86, 26, 20, 5], [94, 11, 25, 16], [33, 16, 24, 18], [72, 8, 29, 20],
];
const SPARKS = [
  [8, 14, 0], [21, 62, 1.2], [34, 28, 2.1], [47, 78, 0.6], [59, 18, 1.8], [71, 52, 2.7], [83, 33, 0.3], [92, 70, 1.5],
  [14, 84, 2.4], [41, 46, 3], [64, 88, 0.9], [88, 8, 2],
];

export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="au au1" />
      <span className="au au2" />
      <span className="au au3" />
      {BUBBLES.map(([x, s, d, w], i) => (
        <i key={i} className="bub" style={{ left: `${x}%`, width: s, height: s, animationDuration: `${d}s`, animationDelay: `-${w}s` }} />
      ))}
      {SPARKS.map(([x, y, w], i) => (
        <b key={i} className="spark" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${w}s` }} />
      ))}
    </div>
  );
}
