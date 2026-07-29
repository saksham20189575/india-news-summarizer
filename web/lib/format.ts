const IST = "Asia/Kolkata";

export function formatBriefingStamp(iso: string, timezone = IST): string {
  try {
    const date = new Date(iso);
    const day = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: timezone,
    }).format(date);
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(date);
    return `${day} · ${time} IST`;
  } catch {
    return iso;
  }
}

export function formatRelativeUpdated(iso: string, now = Date.now()): string {
  try {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "Last updated: unknown";
    const deltaSec = Math.max(0, Math.round((now - then) / 1000));
    if (deltaSec < 60) return "Last updated: just now";
    const mins = Math.round(deltaSec / 60);
    if (mins < 60) return `Last updated: ${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `Last updated: ${hours}h ago`;
    const days = Math.round(hours / 24);
    return `Last updated: ${days}d ago`;
  } catch {
    return "Last updated: unknown";
  }
}
