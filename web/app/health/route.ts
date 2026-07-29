import { NextResponse } from "next/server";
import { getStorageDiagnostics } from "@/lib/briefing-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const storage = getStorageDiagnostics();

  return NextResponse.json({
    ok: true,
    service: "india-news-api",
    timezoneHint: "Asia/Kolkata",
    storage,
  });
}
