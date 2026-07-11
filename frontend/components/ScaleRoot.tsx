"use client";

import { useEffect, useState } from "react";

/**
 * Fluid, whole-UI scaling.
 *
 * The dashboard is built with fixed pixel sizes everywhere, so on a large
 * monitor everything looks tiny. This wrapper applies a CSS `zoom` to the whole
 * app, computed from the viewport so the interface grows on big screens and
 * shrinks to fit on small ones — smoothly, no breakpoints.
 *
 * `zoom` (unlike `transform: scale`) reflows layout and is honored by
 * getBoundingClientRect, so Leaflet hit-testing stays correct. The catch is
 * that `100vh`/`100%` heights resolve against the *unzoomed* viewport and would
 * overflow when zoom > 1 — so we give the wrapper an explicit pixel size of
 * viewport / scale. After zooming by `scale`, that renders back to exactly the
 * viewport, and full-height children (`height: 100%`) fill it with no overflow.
 */

// The layout was designed around roughly this canvas; scale is relative to it.
const BASE_W = 1440;
const BASE_H = 880;
const MIN_SCALE = 0.9; // don't shrink below this — keep small screens usable
const MAX_SCALE = 1.6; // don't blow up past this on huge monitors

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default function ScaleRoot({ children }: { children: React.ReactNode }) {
  // Before mount (SSR/first paint) fall back to a plain full-viewport box.
  const [style, setStyle] = useState<React.CSSProperties>({ height: "100vh", width: "100%", overflow: "hidden" });

  useEffect(() => {
    const apply = () => {
      const el = document.documentElement;
      const w = el.clientWidth;   // viewport minus any scrollbar
      const h = el.clientHeight;
      // Fit both dimensions so nothing gets clipped on wide-but-short screens.
      const scale = clamp(Math.min(w / BASE_W, h / BASE_H), MIN_SCALE, MAX_SCALE);
      setStyle({
        zoom: scale,
        width: `${w / scale}px`,
        height: `${h / scale}px`,
        overflow: "hidden",
      });
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  return <div style={style}>{children}</div>;
}
