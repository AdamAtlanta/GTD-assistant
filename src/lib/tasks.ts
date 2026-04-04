import { google, tasks_v1 } from "googleapis";

import {
  GTD_TASK_LIST_OPTIONS,
  type GTDSourceTask,
  type GTDTasksByList,
  normalizeGTDTaskListName,
} from "@/lib/gtd";
import { getGoogleAccessToken, getGoogleOAuthClient } from "@/lib/google-auth";

export async function getTasksClient(): Promise<tasks_v1.Tasks> {
  return google.tasks({ version: "v1", auth: await getGoogleOAuthClient() });
}

export async function fetchGTDLists(): Promise<GTDTasksByList> {
  const tasksClient = await getTasksClient();
  const listRes = await tasksClient.tasklists.list();
  const allLists = listRes.data.items || [];
  const targetListNames = new Set(
    GTD_TASK_LIST_OPTIONS.map((listName) => listName.toLowerCase()),
  );
  const targetLists = allLists.filter((list) =>
    targetListNames.has((list.title || "").toLowerCase()),
  );
  const gtdData: GTDTasksByList = {};

  for (const list of targetLists) {
    if (list.id && list.title) {
      let pageToken: string | undefined;
      const allTasks: GTDSourceTask[] = [];
      const normalizedListName = normalizeGTDTaskListName(list.title);

      if (!normalizedListName) {
        continue;
      }

      do {
        const tasksRes = await tasksClient.tasks.list({
          tasklist: list.id,
          showCompleted: false,
          showHidden: false,
          maxResults: 100,
          pageToken,
        });

        allTasks.push(
          ...(tasksRes.data.items || []).map((task) => ({
            ...task,
            listId: list.id!,
            addedDate: formatTaskDate(task.updated),
          })),
        );

        pageToken = tasksRes.data.nextPageToken ?? undefined;
      } while (pageToken);

      gtdData[normalizedListName] = allTasks;
    }
  }

  return gtdData;
}

function formatTaskDate(value: string | null | undefined) {
  if (!value) {
    return "Date unavailable";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  }).format(parsedDate);
}

export async function markTaskComplete(taskListId: string, taskId: string) {
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`;
  const accessToken = await getGoogleAccessToken();
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "completed" }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to complete task: ${res.status} ${errText}`);
  }
}

export async function createTask(listName: string, title: string, notes?: string) {
  const tasksClient = await getTasksClient();
  const listRes = await tasksClient.tasklists.list();
  const allLists = listRes.data.items || [];
  const targetList = allLists.find(
    (list) => (list.title || "").toLowerCase() === listName.toLowerCase(),
  );

  if (!targetList || !targetList.id) {
    throw new Error(`Task list "${listName}" not found.`);
  }

  await tasksClient.tasks.insert({
    tasklist: targetList.id,
    requestBody: {
      title,
      notes,
    },
  });
}
