"use client";

import { useEffect } from "react";

/**
 * Fades and slides `[data-reveal]` elements in as they scroll into view.
 *
 * Content is rendered visible on the server; this only hides elements that
 * start below the fold, after the page has loaded, so nothing is ever hidden
 * if JavaScript is slow or turned off, and nothing on screen flickers. Set
 * `--reveal-delay` on an element to stagger it within a group. Does nothing
 * for people who prefer reduced motion.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const pending = elements.filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.92);
    if (pending.length === 0) return;

    const timers = new Set<number>();
    const reveal = (el: HTMLElement) => {
      el.classList.add("reveal-run");
      el.classList.remove("reveal-pending");
      // Hand transitions back to the element (e.g. hover effects) once done.
      const delay = parseFloat(getComputedStyle(el).getPropertyValue("--reveal-delay")) || 0;
      const t = window.setTimeout(() => {
        el.classList.remove("reveal-run");
        timers.delete(t);
      }, delay + 800);
      timers.add(t);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          reveal(entry.target as HTMLElement);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    for (const el of pending) {
      el.classList.add("reveal-pending");
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      // Never leave anything hidden (e.g. after client-side navigation).
      for (const el of pending) el.classList.remove("reveal-pending", "reveal-run");
    };
  }, []);

  return null;
}
