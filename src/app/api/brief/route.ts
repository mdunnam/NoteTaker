import { NextResponse } from "next/server";
import { getUserId } from "@/lib/user";
import { buildMorningBrief, sendSlackDM } from "@/lib/slackBrief";

// POST /api/brief — build the morning brief and DM it via Slack.
// ?preview=1 returns the text without sending (for testing).
export async function POST(req: Request) {
  const userId = await getUserId();
  const text = await buildMorningBrief(userId);

  const url = new URL(req.url);
  if (url.searchParams.get("preview") === "1") {
    return NextResponse.json({ preview: true, text });
  }

  const sent = await sendSlackDM(text);
  return NextResponse.json({ sent, length: text.length });
}
