"use server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getErrorMessage } from "@/lib/errors";
import { getUnopenedEmails } from "@/lib/gmail";
import type {
  CalendarEventSnapshot,
  DashboardData,
  DashboardKeepTaskSuggestion,
  DashboardTask,
  KeepNoteForReview,
} from "@/lib/gtd";
import { getAuthenticatedSession } from "@/lib/google-auth";
import { fetchGTDLists } from "@/lib/tasks";
import { fetchCalendarEvents } from "@/lib/calendar";
import { fetchUnreadSlackMessages } from "@/lib/slack";
import { processGTDData } from "@/lib/ai";

const smsFollowUpsEnabled = process.env.ENABLE_SMS_FOLLOWUPS === "true";
const keepSuggestionsEnabled = process.env.ENABLE_KEEP_SUGGESTIONS === "true";

type ActionSuccess<T = void> = T extends void
  ? { success: true }
  : { success: true; report: T };

type ActionFailure = { success: false; error: string };
type AuditActionResult = ActionSuccess<DashboardData> | ActionFailure;
type MutationActionResult = ActionSuccess | ActionFailure;
type TaskCreationActionResult =
  | { success: true; task: DashboardTask; eventSnapshot?: CalendarEventSnapshot }
  | ActionFailure;
type KeepImportActionResult =
  | { success: true; suggestions: DashboardKeepTaskSuggestion[]; importedCount: number }
  | ActionFailure;
type RestoreCalendarEventResult = { success: true; eventId: string } | ActionFailure;

export async function runGTDAudit(): Promise<AuditActionResult> {
  const session = await getServerSession(authOptions);

  if (!session) {
    throw new Error("You must be logged in to run the GTD Audit.");
  }

  try {
    console.log("Fetching Gmail data...");
    const emails = await getUnopenedEmails();
    
    console.log("Fetching Tasks data...");
    const tasks = await fetchGTDLists();
    
    console.log("Fetching Calendar data...");
    const calendar = await fetchCalendarEvents();
    
    console.log("Fetching Slack data...");
    const slack = await fetchUnreadSlackMessages();

    const smsFollowUps = smsFollowUpsEnabled
      ? await import("@/lib/sms").then(({ findSmsFollowUps }) => findSmsFollowUps())
      : [];

    const keepNotes = keepSuggestionsEnabled
      ? await import("@/lib/keep")
          .then(({ fetchKeepNotesForReview }) =>
            fetchKeepNotesForReview(session.user?.email ?? undefined),
          )
          .catch((error) => {
            console.error("Google Keep fetch error:", error);
            return [];
          })
      : [];

    console.log("Processing with Gemini...");
    const gtdReport = await processGTDData({
      emails,
      tasks,
      calendar,
      slack,
      smsFollowUps,
      keepNotes,
    });

    return { success: true, report: gtdReport };
  } catch (error) {
    console.error("Error running GTD Audit:", error);
    return { success: false, error: getErrorMessage(error, "Failed to run GTD Audit.") };
  }
}

export async function completeTaskAction(
  taskListId: string,
  taskId: string,
): Promise<MutationActionResult> {
  await getAuthenticatedSession();

  try {
    const { markTaskComplete } = await import("@/lib/tasks");
    await markTaskComplete(taskListId, taskId);
    return { success: true };
  } catch (error) {
    console.error("Complete task error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function reopenTaskAction(
  taskListId: string,
  taskId: string,
): Promise<MutationActionResult> {
  await getAuthenticatedSession();

  try {
    const { reopenTask } = await import("@/lib/tasks");
    await reopenTask(taskListId, taskId);
    return { success: true };
  } catch (error) {
    console.error("Reopen task error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function updateTaskTitleAction(
  taskListId: string,
  taskId: string,
  title: string,
): Promise<MutationActionResult> {
  await getAuthenticatedSession();

  try {
    const { updateTaskTitle } = await import("@/lib/tasks");
    await updateTaskTitle(taskListId, taskId, title);
    return { success: true };
  } catch (error) {
    console.error("Update task title error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function createTaskAction(
  listName: string,
  title: string,
): Promise<TaskCreationActionResult> {
  await getAuthenticatedSession();

  try {
    const { createTask } = await import("@/lib/tasks");
    const task = await createTask(listName, title);
    return { success: true, task };
  } catch (error) {
    console.error("Create task error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteTaskAction(
  taskListId: string,
  taskId: string,
): Promise<MutationActionResult> {
  await getAuthenticatedSession();

  try {
    const { deleteTask } = await import("@/lib/tasks");
    await deleteTask(taskListId, taskId);
    return { success: true };
  } catch (error) {
    console.error("Delete task error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function archiveEmailAction(messageId: string): Promise<MutationActionResult> {
  await getAuthenticatedSession();

  try {
    const { archiveEmail } = await import("@/lib/gmail");
    await archiveEmail(messageId);
    return { success: true };
  } catch (error) {
    console.error("Archive email error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function unarchiveEmailAction(messageId: string): Promise<MutationActionResult> {
  await getAuthenticatedSession();

  try {
    const { unarchiveEmail } = await import("@/lib/gmail");
    await unarchiveEmail(messageId);
    return { success: true };
  } catch (error) {
    console.error("Unarchive email error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteEmailAction(messageId: string): Promise<MutationActionResult> {
  await getAuthenticatedSession();

  try {
    const { deleteEmail } = await import("@/lib/gmail");
    await deleteEmail(messageId);
    return { success: true };
  } catch (error) {
    console.error("Delete email error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function untrashEmailAction(messageId: string): Promise<MutationActionResult> {
  await getAuthenticatedSession();

  try {
    const { untrashEmail } = await import("@/lib/gmail");
    await untrashEmail(messageId);
    return { success: true };
  } catch (error) {
    console.error("Untrash email error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function createTaskFromEmailAction(
  messageId: string,
  listName: string,
  title: string,
): Promise<TaskCreationActionResult> {
  await getAuthenticatedSession();

  try {
    const { createTask } = await import("@/lib/tasks");
    const task = await createTask(listName, title, `Created from Gmail message ${messageId}.`);
    return { success: true, task };
  } catch (error) {
    console.error("Create task from email error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function createTaskFromEventAction(
  eventId: string,
  deleteOriginalEvent: boolean,
  listName: string,
  title: string,
): Promise<TaskCreationActionResult> {
  await getAuthenticatedSession();

  let createdTask: DashboardTask | null = null;

  try {
    const eventSnapshot = deleteOriginalEvent
      ? await import("@/lib/calendar").then(({ getEventSnapshot }) => getEventSnapshot(eventId))
      : undefined;
    const { createTask } = await import("@/lib/tasks");
    createdTask = await createTask(listName, title, `Created from Google Calendar event ${eventId}.`);
    if (deleteOriginalEvent) {
      const { deleteEvent } = await import("@/lib/calendar");
      await deleteEvent(eventId);
    }
    return { success: true, task: createdTask, eventSnapshot };
  } catch (error) {
    const taskToRollback = createdTask;

    if (taskToRollback) {
      await import("@/lib/tasks")
        .then(({ deleteTask }) => deleteTask(taskToRollback.listId, taskToRollback.id))
        .catch((deleteError) => {
          console.error("Failed to roll back task after event conversion error:", deleteError);
        });
    }
    console.error("Create task from event error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function restoreCalendarEventAction(
  snapshot: CalendarEventSnapshot,
): Promise<RestoreCalendarEventResult> {
  await getAuthenticatedSession();

  try {
    const { restoreEvent } = await import("@/lib/calendar");
    const eventId = await restoreEvent(snapshot);
    return { success: true, eventId };
  } catch (error) {
    console.error("Restore calendar event error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function updateEventTitleAction(
  eventId: string,
  title: string,
): Promise<MutationActionResult> {
  await getAuthenticatedSession();

  try {
    const { updateEventTitle } = await import("@/lib/calendar");
    await updateEventTitle(eventId, title);
    return { success: true };
  } catch (error) {
    console.error("Update event title error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function createTaskFromTextFollowUpAction(
  followUpId: string,
  listName: string,
  title: string,
): Promise<TaskCreationActionResult> {
  await getAuthenticatedSession();

  try {
    const { createTask } = await import("@/lib/tasks");
    const task = await createTask(listName, title, `Created from text follow-up ${followUpId}.`);
    return { success: true, task };
  } catch (error) {
    console.error("Create task from text follow-up error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function createTaskFromKeepSuggestionAction(
  noteId: string,
  listName: string,
  title: string,
  sourceTitle: string,
): Promise<TaskCreationActionResult> {
  await getAuthenticatedSession();

  try {
    const { createTask } = await import("@/lib/tasks");
    const task = await createTask(
      listName,
      title,
      `Created from Google Keep note "${sourceTitle}" (${noteId}).`,
    );
    return { success: true, task };
  } catch (error) {
    console.error("Create task from Keep suggestion error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function importKeepNotesAction(
  notes: KeepNoteForReview[],
): Promise<KeepImportActionResult> {
  await getAuthenticatedSession();

  try {
    const { sanitizeImportedKeepNotes } = await import("@/lib/keep-import");
    const importedNotes = sanitizeImportedKeepNotes(notes);
    const { suggestTasksFromKeepNotes } = await import("@/lib/ai");
    const suggestions = await suggestTasksFromKeepNotes(importedNotes);

    return {
      success: true,
      suggestions,
      importedCount: importedNotes.length,
    };
  } catch (error) {
    console.error("Keep import error:", error);
    return { success: false, error: getErrorMessage(error, "Failed to import Keep notes.") };
  }
}
