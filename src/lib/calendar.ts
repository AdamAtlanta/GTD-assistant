import { calendar_v3, google } from "googleapis";

import type { CalendarEventSnapshot, CalendarReviewData } from "@/lib/gtd";
import { getGoogleOAuthClient } from "@/lib/google-auth";

export async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  return google.calendar({ version: "v3", auth: await getGoogleOAuthClient() });
}

export async function fetchCalendarEvents(): Promise<CalendarReviewData> {
  const calendarClient = await getCalendarClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

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

  const pastAllDayEvents = filterAllDayEvents(pastEventsRes.data.items || []);
  const futureAllDayEvents = filterAllDayEvents(futureEventsRes.data.items || []);

  return {
    past: pastAllDayEvents,
    future: futureAllDayEvents,
    trials: futureAllDayEvents.filter((event) => /trial/i.test(event.summary || "")),
  };
}

function filterAllDayEvents(events: calendar_v3.Schema$Event[]) {
  return events.filter((event) => Boolean(event.start?.date) && !event.start?.dateTime);
}
export async function deleteEvent(eventId: string) {
  if (!eventId) {
    throw new Error("Missing Google Calendar event id.");
  }

  const calendarClient = await getCalendarClient();
  await calendarClient.events.delete({
    calendarId: "primary",
    eventId,
  });
}

export async function getEventSnapshot(eventId: string): Promise<CalendarEventSnapshot> {
  if (!eventId) {
    throw new Error("Missing Google Calendar event id.");
  }

  const calendarClient = await getCalendarClient();
  const eventRes = await calendarClient.events.get({
    calendarId: "primary",
    eventId,
  });
  const event = eventRes.data;

  return {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    recurrence: event.recurrence,
    attendees: event.attendees,
    reminders: event.reminders,
    colorId: event.colorId,
    transparency: event.transparency,
    visibility: event.visibility,
  };
}

export async function restoreEvent(snapshot: CalendarEventSnapshot) {
  if (!snapshot.start || !snapshot.end) {
    throw new Error("Cannot restore a calendar event without start and end times.");
  }

  const calendarClient = await getCalendarClient();
  const restoredEvent = await calendarClient.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: snapshot.summary ?? undefined,
      description: snapshot.description ?? undefined,
      location: snapshot.location ?? undefined,
      start: snapshot.start,
      end: snapshot.end,
      recurrence: snapshot.recurrence ?? undefined,
      attendees: snapshot.attendees ?? undefined,
      reminders: snapshot.reminders,
      colorId: snapshot.colorId ?? undefined,
      transparency: snapshot.transparency ?? undefined,
      visibility: snapshot.visibility ?? undefined,
    },
  });

  if (!restoredEvent.data.id) {
    throw new Error("Google Calendar restored the event but did not return an event id.");
  }

  return restoredEvent.data.id;
}

export async function updateEventTitle(eventId: string, title: string) {
  const nextTitle = title.trim();

  if (!eventId) {
    throw new Error("Missing Google Calendar event id.");
  }

  if (!nextTitle) {
    throw new Error("Calendar event title cannot be blank.");
  }

  const calendarClient = await getCalendarClient();

  await calendarClient.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: {
      summary: nextTitle,
    },
  });
}
