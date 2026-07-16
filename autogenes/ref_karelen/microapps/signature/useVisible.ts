"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Battery discipline (N0): true while the element intersects the
 * viewport. Animated canvases gate their requestAnimationFrame loop on
 * this, so chrome (sweeps, rotations, scanlines) stops burning cycles
 * the moment it scrolls out of sight. The resolved static frame stays
 * painted — no information depends on the animation.
 */
export function useVisible(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entrada]) =>
      setVisible(entrada.isIntersecting),
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return visible;
}
