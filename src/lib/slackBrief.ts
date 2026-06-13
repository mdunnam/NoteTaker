import { prisma } from "@/lib/db";
import { getTodayEventsSafe } from "@/lib/calendar";
import { getSlackAttentionSafe } from "@/lib/slack";

// Post a message as the Nero bot to Mike's DM. Returns true on success.
export async function sendSlackDM(text: string): Promise<boolean> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const userId = process.env.SLACK_USER_ID;
  if (!botToken || !userId) return false;

  // Open (or fetch) the DM channel with Mike
  const open = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ users: userId }),
  });
  const openData = await open.json();
  if (!openData.ok) return false;
  const channel = openData.channel?.id;
  if (!channel) return false;

  const post = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
  });
  const postData = await post.json();
  return !!postData.ok;
}

export async function buildMorningBrief(userId: string): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [dueTasks, habits, events, slack] = await Promise.all([
    prisma.task.findMany({
      where: { userId, status: { not: "DONE" }, OR: [{ dueDate: { lte: todayEnd } }, { priority: "HIGH" }] },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 12,
    }),
    prisma.habit.findMany({ where: { userId, isActive: true } }),
    getTodayEventsSafe(),
    getSlackAttentionSafe(),
  ]);

  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const lines: string[] = [`*Good morning, Mike.* ${dayName}`, ""];

  // Meetings
  if (events.length) {
    lines.push("*📅 Today*");
    for (const e of events.slice(0, 6)) {
      const t = e.isAllDay ? "all day" : new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      lines.push(`• ${t} — ${e.title}`);
    }
    lines.push("");
  }

  // Tasks
  if (dueTasks.length) {
    lines.push("*✓ On your plate*");
    for (const t of dueTasks) {
      const flag = t.priority === "HIGH" ? "🔴 " : "";
      const from = t.source === "granola" ? " _(from a meeting)_" : "";
      lines.push(`• ${flag}${t.title}${from}`);
    }
    lines.push("");
  } else {
    lines.push("*✓ Tasks:* clear slate.", "");
  }

  // Slack needs-reply
  if (slack.length) {
    lines.push("*💬 Needs a reply*");
    for (const s of slack.slice(0, 4)) {
      lines.push(`• [${s.channel}] ${s.from}: ${s.text.slice(0, 70)}`);
    }
    lines.push("");
  }

  // Habits
  if (habits.length) {
    const todayLogs = await prisma.habitLog.findMany({
      where: { habitId: { in: habits.map((h) => h.id) }, date: today },
    });
    const done = new Set(todayLogs.filter((l) => l.completed).map((l) => l.habitId));
    const pending = habits.filter((h) => !done.has(h.id));
    if (pending.length) {
      lines.push(`*⬡ Habits to hit:* ${pending.map((h) => h.name).join(", ")}`);
    }
  }

  lines.push("", "_Open Nero: http://localhost:6376_");
  return lines.join("\n");
}