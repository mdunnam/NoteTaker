import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";
import HabitsClient from "./HabitsClient";

export default async function HabitsPage() {
  const userId = await getUserId();
  const today = new Date().toISOString().split("T")[0];
  const habits = await prisma.habit.findMany({ where: { userId, isActive: true }, orderBy: { createdAt: "asc" } });
  const logs = await prisma.habitLog.findMany({
    where: { habitId: { in: habits.map((h) => h.id) }, date: today },
  });
  const logMap = new Map(logs.map((l) => [l.habitId, l.completed]));
  return (
    <HabitsClient
      initialHabits={habits.map((h) => ({
        id: h.id, name: h.name, icon: h.icon, color: h.color,
        description: h.description, frequency: h.frequency,
        completedToday: !!logMap.get(h.id),
      }))}
    />
  );
}