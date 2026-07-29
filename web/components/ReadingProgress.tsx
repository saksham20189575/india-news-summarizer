"use client";

import { useEffect } from "react";

export function ReadingProgress() {
  useEffect(() => {
    const bar = document.getElementById("progress-bar");
    if (!bar) return;

    const onScroll = () => {
      const winScroll =
        document.body.scrollTop || document.documentElement.scrollTop;
      const height =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;
      const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
      bar.style.width = `${scrolled}%`;
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <div id="progress-bar" aria-hidden="true" />;
}
