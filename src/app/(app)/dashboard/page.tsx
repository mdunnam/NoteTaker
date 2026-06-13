import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";
import DashboardClient from "./DashboardClient";
import { getTodayEventsSafe } from "@/lib/calendar";
import { getSlackAttentionSafe } from "@/lib/slack";

export default async function DashboardPage() {
  const userId = await getUserId();
  const today = new Date().toISOString().split("T")[0];
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [tasks, habits, projects, recentNotes, events, slackItems] = await Promise.all([
    prisma.task.findMany({
      where: { userId, status: { not: "DONE" } },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 20,
    }),
    prisma.habit.findMany({ where: { userId, isActive: true } }),
    prisma.project.findMany({ where: { userId, status: "ACTIVE" }, take: 5 }),
    prisma.note.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    getTodayEventsSafe(),
    getSlackAttentionSafe(),
  ]);

  const todayLogs = await prisma.habitLog.findMany({
    where: { habitId: { in: habits.map((h) => h.id) }, date: today },
  });

  const habitCompletions = new Map(todayLogs.map((l) => [l.habitId, l.completed]));
  const dueToday = tasks.filter((t) => !t.dueDate || t.dueDate <= todayEnd);
  const habitsCompleted = habits.filter((h) => habitCompletions.get(h.id)).length;

  return (
    <DashboardClient
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate?.toISOString() ?? null,
        notes: t.notes,
        projectId: t.projectId,
      }))}
      habits={habits.map((h) => ({
        id: h.id,
        name: h.name,
        icon: h.icon,
        color: h.color,
        completedToday: !!habitCompletions.get(h.id),
      }))}
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        taskCount: 0,
      }))}
      recentNotes={recentNotes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content.slice(0, 120),
        createdAt: n.createdAt.toISOString(),
      }))}
      events={events}
      slackItems={slackItems}
      stats={{ dueTodayCount: dueToday.length, habitsCompleted, habitsTotal: habits.length }}
    />
  );
}
