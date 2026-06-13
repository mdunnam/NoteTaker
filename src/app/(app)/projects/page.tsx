import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";
import ProjectsClient from "./ProjectsClient";

export default async function ProjectsPage() {
  const userId = await getUserId();
  const projects = await prisma.project.findMany({
    where: { userId },
    include: { _count: { select: { tasks: true } }, tasks: { where: { status: { not: "DONE" } }, select: { id: true, title: true, priority: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <ProjectsClient
      initialProjects={projects.map((p) => ({
        id: p.id, name: p.name, description: p.description, status: p.status,
        color: p.color, icon: p.icon, taskCount: p._count.tasks,
        openTasks: p.tasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority, status: t.status })),
        createdAt: p.createdAt.toISOString(),
      }))}
    />
  );
}