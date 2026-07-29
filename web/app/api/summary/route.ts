import { NextRequest, NextResponse } from "next/server";
import { BlobError } from "@vercel/blob";
import { readLatest, writeLatestAtomic, formatPersistError } from "@/lib/briefing-store";
import { validateBriefingPayload } from "@/lib/briefing-validate";
import { checkPublishAuth } from "@/lib/publish-auth";
import type { Briefing } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const latest = await readLatest();
    if (!latest) {
      return NextResponse.json(
        { error: "No summary published yet" },
        { status: 404 }
      );
    }

    return NextResponse.json(latest);
  } catch (err) {
    console.error("Failed to read latest summary", err);
    return NextResponse.json(
      { error: "Failed to read summary" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const authError = checkPublishAuth(request);
  if (authError) {
    return authError;
  }

  let briefing: unknown;
  try {
    briefing = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ok, errors } = validateBriefingPayload(briefing);
  if (!ok) {
    return NextResponse.json(
      { error: "Invalid briefing payload", details: errors },
      { status: 400 }
    );
  }

  try {
    const payload = briefing as Briefing;
    await writeLatestAtomic(payload);
    return NextResponse.json({
      ok: true,
      runId: payload.runId,
      generatedAt: payload.generatedAt,
    });
  } catch (err) {
    console.error("Failed to write latest summary", err);
    const message = formatPersistError(err);
    const isConfigError =
      message.includes("Blob storage is not configured") ||
      message.includes("No blob credentials found");
    const isBlobError = err instanceof BlobError;
    const isAccessMismatch =
      message.toLowerCase().includes("access") &&
      (message.toLowerCase().includes("private") ||
        message.toLowerCase().includes("public"));
    return NextResponse.json(
      {
        error: isConfigError ? message : "Failed to persist summary",
        ...(isBlobError || isAccessMismatch ? { detail: message } : {}),
        ...(isAccessMismatch
          ? {
              hint: 'Set BLOB_ACCESS to "private" or "public" to match your Vercel Blob store, then redeploy.',
            }
          : {}),
      },
      { status: isConfigError ? 503 : 500 }
    );
  }
}
