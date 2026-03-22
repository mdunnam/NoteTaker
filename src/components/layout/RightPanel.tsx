import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Right panel showing live note health and recent extracted tasks.
 */
export default async function RightPanel() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [totalNotes, uncategorizedCount, processingCount, recentNotes] = await Promise.all([
    prisma.note.count({
      where: {
        userId: session.user.id,
        isArchived: false,
      },
    }),
    prisma.note.count({
      where: {
        userId: session.user.id,
        isArchived: false,
        OR: [{ category: null }, { category: "" }],
      },
    }),
    prisma.note.count({
      where: {
        userId: session.user.id,
        status: "PROCESSING",
      },
    }),
    prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      select: {
        id: true,
        title: true,
        extractedTasks: true,
      },
    }),
  ]);

  const extractedTasks: Array<{
    noteId: string;
    noteTitle: string;
    text: string;
    dueDate?: string;
  }> = [];

  for (const note of recentNotes) {
    if (!Array.isArray(note.extractedTasks)) {
      continue;
    }

    for (const task of note.extractedTasks) {
      const maybeTask = task as { text?: string; dueDate?: string };

      if (!maybeTask?.text) {
        continue;
      }

      extractedTasks.push({
        noteId: note.id,
        noteTitle: note.title || "Untitled note",
        text: maybeTask.text,
        dueDate: maybeTask.dueDate,
      });

      if (extractedTasks.length >= 6) {
        break;
      }
    }

    if (extractedTasks.length >= 6) {
      break;
    }
  }

  return (
    <aside className="w-80 border-l border-gray-200 bg-gray-50 p-6 overflow-y-auto">
      <div className="space-y-6">
        <div>
          <h3 className="font-semibold text-sm mb-3">Note Health</h3>
          <ul className="space-y-2 text-xs text-gray-700">
            <li className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
              <span>Total active notes</span>
              <strong>{totalNotes}</strong>
            </li>
            <li className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
              <span>Uncategorized</span>
              <strong>{uncategorizedCount}</strong>
            </li>
            <li className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
              <span>Still processing</span>
              <strong>{processingCount}</strong>
            </li>
          </ul>
        </div>

        <div className="pt-6 border-t border-gray-200">
          <h3 className="font-semibold text-sm mb-3">Recent Extracted Tasks</h3>
          {extractedTasks.length === 0 ? (
            <p className="text-xs text-gray-600">No extracted tasks yet.</p>
          ) : (
            <ul className="space-y-2">
              {extractedTasks.map((task, index) => (
                <li key={`${task.noteId}-${index}`} className="rounded border border-gray-200 bg-white p-3">
                  <div className="text-xs font-medium text-gray-900">{task.text}</div>
                  <div className="mt-1 text-[11px] text-gray-600">{task.noteTitle}</div>
                  {task.dueDate && (
                    <div className="mt-1 text-[11px] text-blue-700">Due: {task.dueDate}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
