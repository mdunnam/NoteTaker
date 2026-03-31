import { auth } from "@/auth";
import { getHintStats } from "@/lib/userMemory";
import { NextResponse } from "next/server";

/**
 * GET /api/user/hint-stats
 * Returns the current user's clarification hint usage and confidence-lift statistics.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getHintStats(session.user.id);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching hint stats:", error);
    return NextResponse.json({ error: "Failed to fetch hint stats" }, { status: 500 });
  }
}
