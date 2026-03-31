import { auth } from "@/auth";
import { getUserStats } from "@/lib/userStats";
import { NextResponse } from "next/server";

/**
 * GET /api/user/stats
 * Returns user-level instrumentation metrics for AI workflow quality.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getUserStats(session.user.id);
    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return NextResponse.json({ error: "Failed to fetch user stats" }, { status: 500 });
  }
}
