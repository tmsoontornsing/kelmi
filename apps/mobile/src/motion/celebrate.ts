import { reduceMotion } from './index';

// A way for any screen to start a full-screen celebration without owning the animation. <Celebrations> in the root
// layout listens and draws it above whatever screen is showing.
export type Celebration = 'confetti' | 'subscribed';

const listeners = new Set<(kind: Celebration) => void>();

export function celebrate(kind: Celebration) {
  // The Plus welcome still plays under Reduce Motion, as one finished pose with no movement.
  if (reduceMotion() && kind !== 'subscribed') return;
  listeners.forEach((l) => l(kind));
}

export function onCelebrate(listener: (kind: Celebration) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
