import type { calendar_v3, gmail_v1, tasks_v1 } from "googleapis";

import type { SmsFollowUpCandidate } from "@/lib/sms";

export const GTD_TASK_LIST_OPTIONS = [
  "Next Action",
  "Waiting for",
  "Long Range",
  "Talk to Ryan",
] as const;

export type GTDTaskListName = (typeof GTD_TASK_LIST_OPTIONS)[number];

const GTD_TASK_LIST_NAME_MAP = new Map(
  GTD_TASK_LIST_OPTIONS.map((listName) => [listName.toLowerCase(), listName]),
);

export function normalizeGTDTaskListName(
  value: string | null | undefined,
): GTDTaskListName | null {
  if (!value) {
    return null;
  }

  return GTD_TASK_LIST_NAME_MAP.get(value.trim().toLowerCase()) ?? null;
}

export type GTDSourceTask = tasks_v1.Schema$Task & {
  listId: string;
  addedDate: string;
};

export type GTDTasksByList = Partial<Record<GTDTaskListName, GTDSourceTask[]>>;

export type SlackChannelMessages = {
  channelName: string;
  messages: string[];
};

export type CalendarReviewData = {
  past: calendar_v3.Schema$Event[];
  future: calendar_v3.Schema$Event[];
  trials: calendar_v3.Schema$Event[];
};

export type CalendarEventSnapshot = {
  summary?: calendar_v3.Schema$Event["summary"];
  description?: calendar_v3.Schema$Event["description"];
  location?: calendar_v3.Schema$Event["location"];
  start?: calendar_v3.Schema$Event["start"];
  end?: calendar_v3.Schema$Event["end"];
  recurrence?: calendar_v3.Schema$Event["recurrence"];
  attendees?: calendar_v3.Schema$Event["attendees"];
  reminders?: calendar_v3.Schema$Event["reminders"];
  colorId?: calendar_v3.Schema$Event["colorId"];
  transparency?: calendar_v3.Schema$Event["transparency"];
  visibility?: calendar_v3.Schema$Event["visibility"];
};

export type KeepNoteForReview = {
  id: string;
  title: string;
  text: string;
  listItems: string[];
  updatedTime: string;
};

export type AuditSourceData = {
  emails: gmail_v1.Schema$Message[];
  tasks: GTDTasksByList;
  calendar: CalendarReviewData;
  slack: SlackChannelMessages[];
  smsFollowUps: SmsFollowUpCandidate[];
  keepNotes: KeepNoteForReview[];
};

export type DashboardTask = {
  id: string;
  listId: string;
  listName: string;
  title: string;
  contextOrPerson: string;
  addedDate: string;
};

export type DashboardEvent = {
  id: string;
  type: "past" | "future";
  title: string;
  date: string;
  isTrial: boolean;
};

export type DashboardEmail = {
  id: string;
  subject: string;
  summary: string;
  proposedAction: string;
};

export type DashboardTextFollowUp = {
  id: string;
  conversationId: string;
  address: string;
  contactName?: string;
  lastInboundText: string;
  lastInboundAt: string;
  reason: string;
  suggestedAction: string;
};

export type DashboardKeepTaskSuggestion = {
  id: string;
  noteId: string;
  sourceTitle: string;
  suggestedTaskTitle: string;
  reason: string;
};

export type DashboardData = {
  tasks: DashboardTask[];
  events: DashboardEvent[];
  emails: DashboardEmail[];
  textFollowUps: DashboardTextFollowUp[];
  keepTaskSuggestions: DashboardKeepTaskSuggestion[];
  mindSweep: string[];
};
