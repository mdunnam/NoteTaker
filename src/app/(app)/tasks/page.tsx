import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";
import TasksClient from "./TasksClient";

export default async function TasksPage() {
  const userId = await getUserId();
  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: { userId },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { priority: "desc" }],
    }),
    prisma.project.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true, name: true, color: true } }),
  ]);

  return (
    <TasksClient
      initialTasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        notes: t.notes,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate?.toISOString() ?? null,
        projectId: t.projectId,
        recurrence: t.recurrence,
        createdAt: t.createdAt.toISOString(),
      }))}
      projects={projects}
    />
  );
}
