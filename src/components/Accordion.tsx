'use client';

import { useState } from 'react';

// FAQ. One open at a time; the panel grows and shrinks smoothly (grid rows 0fr to 1fr) instead of snapping like <details>.
export function Accordion({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="qas">
      {items.map(([q, a], i) => (
        <div className={`qa${open === i ? ' open' : ''}`} key={q}>
          <button type="button" className="qa-head" aria-expanded={open === i} aria-controls={`qa-${i}`} id={`qa-h-${i}`} onClick={() => setOpen(open === i ? null : i)}>
            <span className="qa-n">{String(i + 1).padStart(2, '0')}</span>
            <span className="qa-q">{q}</span>
            <span className="qa-ico" aria-hidden="true"><i /><i /></span>
          </button>
          <div className="qa-panel" id={`qa-${i}`} role="region" aria-labelledby={`qa-h-${i}`}>
            <div><p>{a}</p></div>
          </div>
        </div>
      ))}
    </div>
  );
}
