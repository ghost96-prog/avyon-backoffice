// src/hooks/useInView.js
//
// Small reusable hook wrapping IntersectionObserver. Used to drive
// "autoplay while scrolled into view" behavior for feed videos.

import { useEffect, useRef, useState } from "react";

export function useInView({ threshold = 0.6 } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold }
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
}
