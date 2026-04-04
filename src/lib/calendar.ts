import { calendar_v3, google } from "googleapis";

import type { CalendarReviewData } from "@/lib/gtd";
import { getGoogleOAuthClient } from "@/lib/google-auth";

export async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  return google.calendar({ version: "v3", auth: await getGoogleOAuthClient() });
}

export async function fetchCalendarEvents(): Promise<CalendarReviewData> {
  const calendarClient = await getCalendarClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const twentyOneDaysFromNow = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

  const pastEventsRes = await calendarClient.events.list({
    calendarId: "primary",
    timeMin: sevenDaysAgo.toISOString(),
    timeMax: now.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const futureEventsRes = await calendarClient.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: sevenDaysFromNow.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const trialEventsRes = await calendarClient.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: twentyOneDaysFromNow.toISOString(),
    q: "Trial",
    singleEvents: true,
    orderBy: "startTime",
  });

  return {
    past: pastEventsRes.data.items || [],
    future: futureEventsRes.data.items || [],
    trials: trialEventsRes.data.items || [],
  };
}

export async function deleteEvent(eventId: string) {
  const calendarClient = await getCalendarClient();
  await calendarClient.events.delete({
    calendarId: "primary",
    eventId,
  });
}
