import { NextRequest, NextResponse } from "next/server";

export function checkPublishAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.PUBLISH_API_KEY;
  if (!expected || expected === "change-me-generate-with-openssl-rand-hex-32") {
    return NextResponse.json(
      { error: "PUBLISH_API_KEY is not configured on the API server" },
      { status: 500 }
    );
  }

  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
