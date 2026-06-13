import { google } from "googleapis";
import path from "path";

const CALENDAR_ID = process.env.WORK_CALENDAR_ID ?? "m.dunnam@couch-heroes.com";

function getAuth() {
  return new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), "service-account.json"),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
}

export interface CalEvent {
  id: string;
  title: string;
  start: string;   // ISO
  end: string;     // ISO
  isAllDay: boolean;
  attendees: number;
  meetLink: string | null;
}

export async function getTodayEvents(): Promise<CalEvent[]> {
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20,
  });

  return (res.data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      id: e.id ?? "",
      title: e.summary ?? "(no title)",
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      isAllDay: !e.start?.dateTime,
      attendees: e.attendees?.length ?? 0,
      meetLink: e.hangoutLink ?? null,
    }));
}

// Safe wrapper — calendar failures must never break the dashboard or Nero
export async function getTodayEventsSafe(): Promise<CalEvent[]> {
  try {
    return await getTodayEvents();
  } catch {
    return [];
  }
}