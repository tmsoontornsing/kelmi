'use client';

import { useId, useRef, useState } from 'react';

// A small confetti burst from the button, in the app's greens. Skipped under Reduce Motion (CSS hides it).
function burst(button: HTMLElement | null) {
  const btn = button?.getBoundingClientRect();
  if (!btn) return;
  const colors = ['#3DAA84', '#A7D96B', '#1F7A4D', '#CFE8DA', '#F4AE9C'];
  for (let i = 0; i < 28; i++) {
    const el = document.createElement('span');
    el.className = 'confetti';
    el.style.left = `${btn.left + btn.width / 2}px`;
    el.style.top = `${btn.top + btn.height / 2}px`;
    el.style.background = colors[i % colors.length];
    el.style.setProperty('--x', `${(Math.random() - 0.5) * 360}px`);
    el.style.setProperty('--y', `${-80 - Math.random() * 200}px`);
    el.style.setProperty('--r', `${(Math.random() - 0.5) * 720}deg`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
}

export function Waitlist({ id }: { id?: string }) {
  const uid = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState('sending');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), website: data.get('website') }),
      });
      setState(res.ok ? 'done' : 'error');
      if (res.ok) burst(btn.current);
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return <p className="headline msg pill-pop" role="status">You’re on the list. Pip will let you know when Kelmi is ready.</p>;
  }

  return (
    <form className="form" id={id} onSubmit={submit}>
      <label htmlFor={`${uid}-email`} className="sr" style={{ position: 'absolute', left: -9999 }}>Email address</label>
      <input id={`${uid}-email`} name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <button ref={btn} className="btn" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Joining…' : 'Join the waitlist'}</button>
      <p className={`footnote msg${state === 'error' ? ' err' : ''}`} role="status" style={{ flexBasis: '100%' }}>
        {state === 'error' ? 'That didn’t work. Check the address and try again.' : 'We’ll use your email only to tell you when Kelmi launches. No newsletters.'}{' '}
        <a href="/privacy">Privacy Policy</a>
      </p>
    </form>
  );
}
