import type { Briefing } from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

export async function fetchLatestSummary(): Promise<
  | { ok: true; data: Briefing }
  | { ok: false; status: number; message: string }
> {
  try {
    const res = await fetch(`${API_BASE}/api/summary`, {
      cache: "no-store",
    });

    if (res.status === 404) {
      return {
        ok: false,
        status: 404,
        message: "No summary published yet.",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: `API error (${res.status})`,
      };
    }

    const data = (await res.json()) as Briefing;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      status: 0,
      message: `Could not reach the summary API at ${API_BASE}. Check NEXT_PUBLIC_API_BASE_URL and that the API is running.`,
    };
  }
}
