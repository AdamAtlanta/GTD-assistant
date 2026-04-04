import type { calendar_v3, gmail_v1, tasks_v1 } from "googleapis";

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

export type GTDSourceTask = tasks_v1.Schema$Task & { listId: string };

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

export type AuditSourceData = {
  emails: gmail_v1.Schema$Message[];
  tasks: GTDTasksByList;
  calendar: CalendarReviewData;
  slack: SlackChannelMessages[];
};

export type DashboardTask = {
  id: string;
  listId: string;
  listName: string;
  title: string;
  contextOrPerson: string;
  isStale: boolean;
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

export type DashboardData = {
  tasks: DashboardTask[];
  events: DashboardEvent[];
  emails: DashboardEmail[];
  mindSweep: string[];
};
