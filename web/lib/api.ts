import { readLatest } from "./briefing-store";
import type { Briefing } from "./types";

export async function fetchLatestSummary(): Promise<
  | { ok: true; data: Briefing }
  | { ok: false; status: number; message: string }
> {
  try {
    const data = await readLatest();
    if (!data) {
      return {
        ok: false,
        status: 404,
        message: "No summary published yet.",
      };
    }

    return { ok: true, data };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Could not load the latest briefing.",
    };
  }
}
