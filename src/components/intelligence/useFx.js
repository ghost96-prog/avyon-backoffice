// src/components/intelligence/useFx.js
// Small motion helpers for the Intelligence screen. All of them collapse to
// "just show the final value" when the visitor prefers reduced motion.
import { useEffect, useState } from 'react';

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// Counts a number up from 0 (or from its previous value) to `target`.
export function useCountUp(target, { duration = 900, delay = 0 } = {}) {
  const end = Number(target) || 0;
  const [value, setValue] = useState(prefersReducedMotion() ? end : 0);

  useEffect(() => {
    if (prefersReducedMotion()) { setValue(end); return undefined; }
    let raf;
    let startAt;
    const from = 0;
    const timer = setTimeout(() => {
      const tick = (now) => {
        if (startAt == null) startAt = now;
        const p = Math.min(1, (now - startAt) / duration);
        setValue(from + (end - from) * easeOutCubic(p));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [end, duration, delay]);

  return value;
}

// Reveals `text` a few characters at a time, like Avyon is saying it.
// Returns { shown, done }.
export function useTypewriter(text, { speed = 16, startDelay = 250 } = {}) {
  const full = typeof text === 'string' ? text : '';
  const [count, setCount] = useState(prefersReducedMotion() ? full.length : 0);

  useEffect(() => {
    if (prefersReducedMotion()) { setCount(full.length); return undefined; }
    setCount(0);
    let i = 0;
    let interval;
    const timer = setTimeout(() => {
      interval = setInterval(() => {
        i += 2; // two characters per tick keeps long headlines from dragging
        setCount(Math.min(full.length, i));
        if (i >= full.length) clearInterval(interval);
      }, speed);
    }, startDelay);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [full, speed, startDelay]);

  return { shown: full.slice(0, count), done: count >= full.length };
}
