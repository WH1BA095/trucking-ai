"use client";

import { useEffect, useState } from "react";

// Shared breakpoint: below this the app switches to its phone layout. Keep in
// sync with ScaleRoot (which disables desktop up-scaling on the same width).
export const MOBILE_BREAKPOINT = 768;

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  // Starts false so SSR/first paint match the desktop tree, then corrects on mount.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}
