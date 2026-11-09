import { Fragment } from 'react';

// Splits a heading into words that slide up out of a mask, one after another. Motion.tsx adds `in` when it scrolls into view.
// The space sits outside the mask, where it can't collapse.
export function Words({ text, from = 0 }: { text: string; from?: number }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span className="w"><span style={{ '--i': i + from } as React.CSSProperties}>{w}</span></span>
        </Fragment>
      ))}
    </>
  );
}
