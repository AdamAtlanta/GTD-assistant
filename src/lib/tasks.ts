import { google, tasks_v1 } from "googleapis";

import {
  type DashboardTask,
  GTD_TASK_LIST_OPTIONS,
  type GTDSourceTask,
  type GTDTasksByList,
  normalizeGTDTaskListName,
} from "@/lib/gtd";
import { getGoogleOAuthClient } from "@/lib/google-auth";

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
  if (!taskListId || !taskId) {
    throw new Error("Missing Google task list or task id.");
  }

  const tasksClient = await getTasksClient();

  await tasksClient.tasks.patch({
    tasklist: taskListId,
    task: taskId,
    requestBody: {
      id: taskId,
      status: "completed",
      completed: new Date().toISOString(),
    },
  });
}

export async function reopenTask(taskListId: string, taskId: string) {
  if (!taskListId || !taskId) {
    throw new Error("Missing Google task list or task id.");
  }

  const tasksClient = await getTasksClient();

  await tasksClient.tasks.patch({
    tasklist: taskListId,
    task: taskId,
    requestBody: {
      id: taskId,
      status: "needsAction",
      completed: null,
    },
  });
}

export async function updateTaskTitle(taskListId: string, taskId: string, title: string) {
  const nextTitle = title.trim();

  if (!taskListId || !taskId) {
    throw new Error("Missing Google task list or task id.");
  }

  if (!nextTitle) {
    throw new Error("Task title cannot be blank.");
  }

  const tasksClient = await getTasksClient();

  await tasksClient.tasks.patch({
    tasklist: taskListId,
    task: taskId,
    requestBody: {
      id: taskId,
      title: nextTitle,
    },
  });
}

export async function deleteTask(taskListId: string, taskId: string) {
  if (!taskListId || !taskId) {
    throw new Error("Missing Google task list or task id.");
  }

  const tasksClient = await getTasksClient();

  await tasksClient.tasks.delete({
    tasklist: taskListId,
    task: taskId,
  });
}

export async function createTask(
  listName: string,
  title: string,
  notes?: string,
): Promise<DashboardTask> {
  const normalizedListName = normalizeGTDTaskListName(listName);
  const nextTitle = title.trim();

  if (!normalizedListName) {
    throw new Error(`Task list "${listName}" is not part of this GTD workflow.`);
  }

  if (!nextTitle) {
    throw new Error("Task title cannot be blank.");
  }

  const tasksClient = await getTasksClient();
  const listRes = await tasksClient.tasklists.list();
  const allLists = listRes.data.items || [];
  const targetList = allLists.find(
    (list) => normalizeGTDTaskListName(list.title) === normalizedListName,
  );

  if (!targetList || !targetList.id) {
    throw new Error(`Task list "${normalizedListName}" not found.`);
  }

  const insertedTask = await tasksClient.tasks.insert({
    tasklist: targetList.id,
    requestBody: {
      title: nextTitle,
      notes,
    },
  });

  if (!insertedTask.data.id) {
    throw new Error("Google Tasks created the item but did not return a task id.");
  }

  return {
    id: insertedTask.data.id,
    listId: targetList.id,
    listName: normalizedListName,
    title: insertedTask.data.title || nextTitle,
    contextOrPerson: "",
    addedDate: formatTaskDate(insertedTask.data.updated || new Date().toISOString()),
  };
}
