// Pip, standing where he belongs. Each pose has its own idle animation (see .pa-* in globals.css); he pops in when his
// block scrolls into view, and jumps if you poke him. Decorative, so hidden from screen readers.
export function Pip({ pose }: { pose: string }) {
  return (
    <span className={`pip-slot pa-${pose}`} aria-hidden="true">
      <img src={`/mascot/${pose}.svg`} alt="" draggable={false} />
      {pose === 'sleep' && <span className="zs"><b>z</b><b>z</b><b>Z</b></span>}
    </span>
  );
}
