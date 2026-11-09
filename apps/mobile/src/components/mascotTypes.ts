// Shapes of the generated Pip drawings. Distances and origins are in the pose's 200 x 200 drawing units.
export type MascotAnim =
  | { kind: 'swing'; origin: [number, number]; deg: number; ms: number } // rocks either side of rest
  | { kind: 'sway'; deg: number; ms: number } // swing around the feet
  | { kind: 'bob'; dy: number; ms: number } // up and back down
  | { kind: 'nudge'; dx: number; ms: number } // out sideways and back
  | { kind: 'pulse'; origin: [number, number]; scale: number; ms: number }
  | { kind: 'breathe'; scale: number; ms: number } // pulse from the feet
  | { kind: 'flip'; origin: [number, number]; ms: number } // turns edge-on and back, then rests
  | { kind: 'blink'; origin: [number, number] }
  | { kind: 'float'; dy: number; ms: number } // rises and fades out, then repeats
  | { kind: 'drip'; dy: number; ms: number } // falls and fades out, then repeats
  | { kind: 'twinkle'; ms: number }
  | { kind: 'hop'; dy: number; ms: number } // jumps, lands, rests for ms
  | { kind: 'shake'; dx: number; ms: number } // a quick shake, then rests for ms
  | { kind: 'rise'; dy: number; ms: number }; // comes up from below once

export type MascotLayer = {
  svg: string;
  anim?: MascotAnim;
  // Stays put while the rest of the pose moves, like the card Pip peeks over.
  fixed?: boolean;
};

export type MascotPoseSpec = {
  label: string;
  use: string;
  // Moves every layer that is not fixed.
  motion?: MascotAnim;
  layers: MascotLayer[];
};
