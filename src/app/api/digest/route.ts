/**
 * GET  /api/digest        — fetch today's digest (generate if missing)
 * POST /api/digest        — force regenerate today's digest
 */

import { auth } from "@/auth";
import { getOrCreateDigest, regenerateDigest } from "@/lib/dailyDigest";
import { NextRequest, NextResponse } from "next/server";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const digest = await getOrCreateDigest(session.user.id, todayStr());
    return NextResponse.json(digest);
  } catch (err) {
    console.error("GET /api/digest error:", err);
    return NextResponse.json({ error: "Failed to generate digest" }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const digest = await regenerateDigest(session.user.id, todayStr());
    return NextResponse.json(digest);
  } catch (err) {
    console.error("POST /api/digest error:", err);
    return NextResponse.json({ error: "Failed to regenerate digest" }, { status: 500 });
  }
}
