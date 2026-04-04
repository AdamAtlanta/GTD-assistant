"use server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getErrorMessage } from "@/lib/errors";
import { getUnopenedEmails } from "@/lib/gmail";
import type { DashboardData } from "@/lib/gtd";
import { getAuthenticatedSession } from "@/lib/google-auth";
import { fetchGTDLists } from "@/lib/tasks";
import { fetchCalendarEvents } from "@/lib/calendar";
import { fetchUnreadSlackMessages } from "@/lib/slack";
import { processGTDData } from "@/lib/ai";

type ActionSuccess<T = void> = T extends void
  ? { success: true }
  : { success: true; report: T };

type ActionFailure = { success: false; error: string };
type AuditActionResult = ActionSuccess<DashboardData> | ActionFailure;
type MutationActionResult = ActionSuccess | ActionFailure;

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

    console.log("Processing with Gemini...");
    const gtdReport = await processGTDData({ emails, tasks, calendar, slack });

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

export async function createTaskFromEmailAction(
  messageId: string,
  listName: string,
  title: string,
): Promise<MutationActionResult> {
  await getAuthenticatedSession();

  try {
    const { createTask } = await import("@/lib/tasks");
    await createTask(listName, title);
    return { success: true };
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
): Promise<MutationActionResult> {
  await getAuthenticatedSession();

  try {
    const { createTask } = await import("@/lib/tasks");
    await createTask(listName, title);
    if (deleteOriginalEvent) {
      const { deleteEvent } = await import("@/lib/calendar");
      await deleteEvent(eventId);
    }
    return { success: true };
  } catch (error) {
    console.error("Create task from event error:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}
