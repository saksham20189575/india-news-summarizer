"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Soft refresh so the page picks up the latest hourly publish. */
export function SoftRefresh({ intervalMs = 5 * 60 * 1000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, router]);

  return null;
}
