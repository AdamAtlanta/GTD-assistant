"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  archiveEmailAction,
  completeTaskAction,
  createTaskAction,
  createTaskFromEmailAction,
  createTaskFromEventAction,
  createTaskFromKeepSuggestionAction,
  createTaskFromTextFollowUpAction,
  deleteEmailAction,
  deleteTaskAction,
  importKeepNotesAction,
  reopenTaskAction,
  restoreCalendarEventAction,
  runGTDAudit,
  unarchiveEmailAction,
  untrashEmailAction,
  updateEventTitleAction,
  updateTaskTitleAction,
} from "./actions";

import { getErrorMessage } from "@/lib/errors";
import {
  type CalendarEventSnapshot,
  GTD_TASK_LIST_OPTIONS,
  type DashboardData,
  type DashboardEmail,
  type DashboardEvent,
  type DashboardKeepTaskSuggestion,
  type DashboardTask,
  type DashboardTextFollowUp,
  type KeepNoteForReview,
} from "@/lib/gtd";
import { parseKeepExportFiles } from "@/lib/keep-import";

const smsFollowUpsEnabled = process.env.NEXT_PUBLIC_ENABLE_SMS_FOLLOWUPS === "true";
const keepSuggestionsEnabled = process.env.NEXT_PUBLIC_ENABLE_KEEP_SUGGESTIONS === "true";
const undoLogStorageKey = "gtd-assistant.undo-log.v1";

type UndoStatus = "available" | "undone" | "failed";

type UndoOperation =
  | { type: "complete-task"; task: DashboardTask }
  | {
      type: "update-task-title";
      taskListId: string;
      taskId: string;
      previousTitle: string;
      nextTitle: string;
    }
  | {
      type: "create-task";
      task: DashboardTask;
      sourceEmail?: DashboardEmail;
      sourceEvent?: DashboardEvent;
      sourceTextFollowUp?: DashboardTextFollowUp;
      sourceKeepSuggestion?: DashboardKeepTaskSuggestion;
      deletedEventSnapshot?: CalendarEventSnapshot;
    }
  | { type: "archive-email"; email: DashboardEmail }
  | { type: "trash-email"; email: DashboardEmail }
  | {
      type: "update-event-title";
      event: DashboardEvent;
      previousTitle: string;
      nextTitle: string;
    };

type UndoEntry = {
  id: string;
  label: string;
  createdAt: string;
  status: UndoStatus;
  operation: UndoOperation;
  error?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getTaskEditKey(taskListId: string, taskId: string) {
  return `${taskListId}:${taskId}`;
}

function createEmptyReport(): DashboardData {
  return {
    tasks: [],
    events: [],
    emails: [],
    textFollowUps: [],
    keepTaskSuggestions: [],
    mindSweep: [],
  };
}

function addTaskToReportData(report: DashboardData, task: DashboardTask): DashboardData {
  const taskKey = getTaskEditKey(task.listId, task.id);
  const existingTaskIndex = report.tasks.findIndex(
    (currentTask) => getTaskEditKey(currentTask.listId, currentTask.id) === taskKey,
  );
  const tasks =
    existingTaskIndex >= 0
      ? report.tasks.map((currentTask, index) => (index === existingTaskIndex ? task : currentTask))
      : [...report.tasks, task];

  return {
    ...report,
    tasks,
  };
}

function addKeepSuggestionsToReportData(
  report: DashboardData,
  suggestions: DashboardKeepTaskSuggestion[],
): DashboardData {
  const existingIds = new Set(report.keepTaskSuggestions.map((suggestion) => suggestion.id));
  const nextSuggestions = [
    ...report.keepTaskSuggestions,
    ...suggestions.filter((suggestion) => !existingIds.has(suggestion.id)),
  ];

  return {
    ...report,
    keepTaskSuggestions: nextSuggestions,
  };
}

function createUndoEntry(label: string, operation: UndoOperation): UndoEntry {
  return {
    id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    label,
    createdAt: new Date().toISOString(),
    status: "available",
    operation,
  };
}

function isUndoEntry(value: unknown): value is UndoEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<UndoEntry>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.createdAt === "string" &&
    (candidate.status === "available" ||
      candidate.status === "undone" ||
      candidate.status === "failed") &&
    Boolean(candidate.operation)
  );
}

function getInitials(name?: string | null) {
  if (!name) return "A";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "A";
}

function SectionHeader({
  kicker,
  title,
  action,
}: {
  kicker?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {kicker ? <p className="eyebrow">{kicker}</p> : null}
        <h2>{title}</h2>
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="empty-state">{children}</p>;
}

function getPreviewCount(total: number) {
  if (total <= 2) {
    return total;
  }

  return Math.max(1, Math.ceil(total / 2));
}

function getPreviewItems<T>(items: T[], expanded: boolean) {
  return expanded ? items : items.slice(0, getPreviewCount(items.length));
}

function RevealButton({
  expanded,
  label,
  onClick,
  total,
  visible,
}: {
  expanded: boolean;
  label: string;
  onClick: () => void;
  total: number;
  visible: number;
}) {
  if (total <= visible) {
    return null;
  }

  return (
    <div className="reveal-row">
      <span>
        Showing {visible} of {total}
      </span>
      <button
        type="button"
        className="reveal-button"
        onClick={onClick}
        aria-expanded={expanded}
      >
        {expanded ? `Show fewer ${label}` : `Show all ${total} ${label}`}
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [processingTasks, setProcessingTasks] = useState<Set<string>>(new Set());
  const [processingEmailActions, setProcessingEmailActions] = useState<
    Record<string, "archive" | "delete">
  >({});
  const [processingEmailToTask, setProcessingEmailToTask] = useState<Set<string>>(new Set());
  const [processingEventToTask, setProcessingEventToTask] = useState<Set<string>>(new Set());
  const [processingTextToTask, setProcessingTextToTask] = useState<Set<string>>(new Set());
  const [processingKeepToTask, setProcessingKeepToTask] = useState<Set<string>>(new Set());
  const [savingTaskTitles, setSavingTaskTitles] = useState<Set<string>>(new Set());
  const [savingEventTitles, setSavingEventTitles] = useState<Set<string>>(new Set());
  const [addingTask, setAddingTask] = useState(false);
  const [undoingEntries, setUndoingEntries] = useState<Set<string>>(new Set());
  const [keepImporting, setKeepImporting] = useState(false);

  const [undoLog, setUndoLog] = useState<UndoEntry[]>([]);
  const [undoLogOpen, setUndoLogOpen] = useState(false);
  const [taskTitleEdits, setTaskTitleEdits] = useState<Record<string, string>>({});
  const [newTaskList, setNewTaskList] = useState<string>("Next Action");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [emailToList, setEmailToList] = useState<Record<string, string>>({});
  const [emailTaskTitle, setEmailTaskTitle] = useState<Record<string, string>>({});
  const [eventToList, setEventToList] = useState<Record<string, string>>({});
  const [eventTaskTitle, setEventTaskTitle] = useState<Record<string, string>>({});
  const [eventDeleteMap, setEventDeleteMap] = useState<Record<string, boolean>>({});
  const [textToList, setTextToList] = useState<Record<string, string>>({});
  const [textTaskTitle, setTextTaskTitle] = useState<Record<string, string>>({});
  const [keepToList, setKeepToList] = useState<Record<string, string>>({});
  const [keepTaskTitle, setKeepTaskTitle] = useState<Record<string, string>>({});
  const [keepImportNotes, setKeepImportNotes] = useState<KeepNoteForReview[]>([]);
  const [keepImportStatus, setKeepImportStatus] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const firstName = session?.user?.name?.split(" ")[0] || "Adam";

  const isSectionExpanded = (sectionId: string) => expandedSections.has(sectionId);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((current) => {
      const next = new Set(current);

      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }

      return next;
    });
  };

  useEffect(() => {
    try {
      const storedUndoLog = window.localStorage.getItem(undoLogStorageKey);

      if (!storedUndoLog) {
        return;
      }

      const parsed = JSON.parse(storedUndoLog) as unknown;

      if (Array.isArray(parsed)) {
        setUndoLog(parsed.filter(isUndoEntry).slice(0, 20));
      }
    } catch {
      setUndoLog([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(undoLogStorageKey, JSON.stringify(undoLog.slice(0, 20)));
  }, [undoLog]);

  const addUndoEntry = (label: string, operation: UndoOperation) => {
    setUndoLog((current) => [createUndoEntry(label, operation), ...current].slice(0, 20));
  };

  const handleRunAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await runGTDAudit();
      if (result.success) {
        setReport(result.report);
      } else {
        setError(result.error);
      }
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = newTaskTitle.trim();

    if (!title) {
      alert("Please enter the task title you want to create.");
      return;
    }

    setAddingTask(true);
    try {
      const res = await createTaskAction(newTaskList, title);
      if (!res.success) {
        alert(res.error || "Failed to create task");
        return;
      }

      setReport((current) => addTaskToReportData(current ?? createEmptyReport(), res.task));
      addUndoEntry(`Created task: ${res.task.title}`, {
        type: "create-task",
        task: res.task,
      });
      setNewTaskTitle("");
    } catch (e) {
      console.error(e);
      alert(getErrorMessage(e, "Failed to create task"));
    } finally {
      setAddingTask(false);
    }
  };

  const handleCompleteTask = async (taskListId: string, taskId: string) => {
    const taskKey = getTaskEditKey(taskListId, taskId);
    const taskToComplete = report?.tasks.find(
      (task) => getTaskEditKey(task.listId, task.id) === taskKey,
    );

    setProcessingTasks((current) => new Set(current).add(taskKey));
    try {
      const res = await completeTaskAction(taskListId, taskId);
      if (!res.success) {
        console.error(res.error);
        alert("Failed to complete task");
        return;
      }

      setReport((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.filter(
                (task) => getTaskEditKey(task.listId, task.id) !== taskKey,
              ),
            }
          : current,
      );
      if (taskToComplete) {
        addUndoEntry(`Completed task: ${taskToComplete.title}`, {
          type: "complete-task",
          task: taskToComplete,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingTasks((current) => {
        const next = new Set(current);
        next.delete(taskKey);
        return next;
      });
    }
  };

  const handleUpdateTaskTitle = async (
    taskListId: string,
    taskId: string,
    currentTitle: string,
  ) => {
    const editKey = getTaskEditKey(taskListId, taskId);
    const nextTitle = (taskTitleEdits[editKey] ?? currentTitle).trim();

    if (!nextTitle) {
      alert("Task title cannot be blank.");
      return;
    }

    if (nextTitle === currentTitle) {
      return;
    }

    setSavingTaskTitles((current) => new Set(current).add(editKey));
    try {
      const res = await updateTaskTitleAction(taskListId, taskId, nextTitle);
      if (!res.success) {
        console.error(res.error);
        alert("Failed to update task title");
        return;
      }

      setReport((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((task) =>
                task.id === taskId && task.listId === taskListId
                  ? { ...task, title: nextTitle }
                  : task,
              ),
            }
          : current,
      );
      addUndoEntry(`Renamed task: ${nextTitle}`, {
        type: "update-task-title",
        taskListId,
        taskId,
        previousTitle: currentTitle,
        nextTitle,
      });

      setTaskTitleEdits((current) => {
        const next = { ...current };
        delete next[editKey];
        return next;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingTaskTitles((current) => {
        const next = new Set(current);
        next.delete(editKey);
        return next;
      });
    }
  };

  const handleArchiveEmail = async (messageId: string) => {
    const email = report?.emails.find((item) => item.id === messageId);

    setProcessingEmailActions((current) => ({ ...current, [messageId]: "archive" }));
    try {
      const res = await archiveEmailAction(messageId);
      if (!res.success) {
        console.error(res.error);
        alert("Failed to archive email");
        return;
      }

      if (report) {
        setReport({ ...report, emails: report.emails.filter((email) => email.id !== messageId) });
      }
      if (email) {
        addUndoEntry(`Archived email: ${email.subject}`, {
          type: "archive-email",
          email,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingEmailActions((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
    }
  };

  const handleDeleteEmail = async (messageId: string) => {
    const email = report?.emails.find((item) => item.id === messageId);

    setProcessingEmailActions((current) => ({ ...current, [messageId]: "delete" }));
    try {
      const res = await deleteEmailAction(messageId);
      if (!res.success) {
        console.error(res.error);
        alert("Failed to delete email");
        return;
      }

      if (report) {
        setReport({ ...report, emails: report.emails.filter((email) => email.id !== messageId) });
      }
      if (email) {
        addUndoEntry(`Trashed email: ${email.subject}`, {
          type: "trash-email",
          email,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingEmailActions((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
    }
  };

  const handleConvertEmail = async (email: DashboardEmail) => {
    const listName = emailToList[email.id] || "Next Action";
    const title = (emailTaskTitle[email.id] || email.proposedAction || email.subject).trim();

    if (!title) {
      alert("Please enter the task title you want to create.");
      return;
    }

    setProcessingEmailToTask((current) => new Set(current).add(email.id));
    try {
      const res = await createTaskFromEmailAction(email.id, listName, title);
      if (res.success) {
        setReport((current) => {
          const nextReport = addTaskToReportData(current ?? createEmptyReport(), res.task);
          return {
            ...nextReport,
            emails: nextReport.emails.filter((item) => item.id !== email.id),
          };
        });
        addUndoEntry(`Made task from email: ${email.subject}`, {
          type: "create-task",
          task: res.task,
          sourceEmail: email,
        });
      } else if (!res.success) {
        alert(res.error || "Failed to convert email to task");
      } else {
        alert("Failed to convert email to task");
      }
    } catch (e) {
      console.error(e);
      alert(getErrorMessage(e, "Failed to convert email to task"));
    } finally {
      setProcessingEmailToTask((current) => {
        const next = new Set(current);
        next.delete(email.id);
        return next;
      });
    }
  };

  const handleConvertEvent = async (event: DashboardEvent) => {
    const listName = eventToList[event.id] || "Next Action";
    const deleteOriginal = eventDeleteMap[event.id] || false;
    const title = (eventTaskTitle[event.id] || event.title).trim();

    if (!title) {
      alert("Please enter the task title you want to create.");
      return;
    }

    setProcessingEventToTask((current) => new Set(current).add(event.id));
    try {
      const res = await createTaskFromEventAction(event.id, deleteOriginal, listName, title);
      if (res.success) {
        setReport((current) => {
          const nextReport = addTaskToReportData(current ?? createEmptyReport(), res.task);
          return {
            ...nextReport,
            events: nextReport.events.filter((item) => item.id !== event.id),
          };
        });
        addUndoEntry(`Made task from event: ${event.title}`, {
          type: "create-task",
          task: res.task,
          sourceEvent: event,
          deletedEventSnapshot: res.eventSnapshot,
        });
      } else if (!res.success) {
        alert(res.error || "Failed to convert event to task");
      } else {
        alert("Failed to convert event to task");
      }
    } catch (e) {
      console.error(e);
      alert(getErrorMessage(e, "Failed to convert event to task"));
    } finally {
      setProcessingEventToTask((current) => {
        const next = new Set(current);
        next.delete(event.id);
        return next;
      });
    }
  };

  const handleUpdateEventTitle = async (event: DashboardEvent) => {
    const nextTitle = (eventTaskTitle[event.id] ?? event.title).trim();

    if (!nextTitle) {
      alert("Calendar event title cannot be blank.");
      return;
    }

    if (nextTitle === event.title) {
      return;
    }

    setSavingEventTitles((current) => new Set(current).add(event.id));
    try {
      const res = await updateEventTitleAction(event.id, nextTitle);
      if (!res.success) {
        alert(res.error || "Failed to update calendar event");
        return;
      }

      setReport((current) =>
        current
          ? {
              ...current,
              events: current.events.map((item) =>
                item.id === event.id ? { ...item, title: nextTitle } : item,
              ),
            }
          : current,
      );
      addUndoEntry(`Renamed event: ${nextTitle}`, {
        type: "update-event-title",
        event,
        previousTitle: event.title,
        nextTitle,
      });
      setEventTaskTitle((current) => {
        const next = { ...current };
        delete next[event.id];
        return next;
      });
    } catch (e) {
      console.error(e);
      alert(getErrorMessage(e, "Failed to update calendar event"));
    } finally {
      setSavingEventTitles((current) => {
        const next = new Set(current);
        next.delete(event.id);
        return next;
      });
    }
  };

  const handleConvertTextFollowUp = async (followUp: DashboardTextFollowUp) => {
    const displayName = followUp.contactName || followUp.address;
    const listName = textToList[followUp.id] || "Next Action";
    const title = (textTaskTitle[followUp.id] || `Follow up with ${displayName}`).trim();

    if (!title) {
      alert("Please enter the task title you want to create.");
      return;
    }

    setProcessingTextToTask((current) => new Set(current).add(followUp.id));
    try {
      const res = await createTaskFromTextFollowUpAction(followUp.id, listName, title);
      if (res.success) {
        setReport((current) => {
          const nextReport = addTaskToReportData(current ?? createEmptyReport(), res.task);
          return {
            ...nextReport,
            textFollowUps: nextReport.textFollowUps.filter((item) => item.id !== followUp.id),
          };
        });
        addUndoEntry(`Made task from text: ${displayName}`, {
          type: "create-task",
          task: res.task,
          sourceTextFollowUp: followUp,
        });
      } else if (!res.success) {
        alert(res.error || "Failed to convert text follow-up to task");
      } else {
        alert("Failed to convert text follow-up to task");
      }
    } catch (e) {
      console.error(e);
      alert(getErrorMessage(e, "Failed to convert text follow-up to task"));
    } finally {
      setProcessingTextToTask((current) => {
        const next = new Set(current);
        next.delete(followUp.id);
        return next;
      });
    }
  };

  const handleConvertKeepSuggestion = async (suggestion: DashboardKeepTaskSuggestion) => {
    const listName = keepToList[suggestion.id] || "Next Action";
    const title = (keepTaskTitle[suggestion.id] || suggestion.suggestedTaskTitle).trim();

    if (!title) {
      alert("Please enter the task title you want to create.");
      return;
    }

    setProcessingKeepToTask((current) => new Set(current).add(suggestion.id));
    try {
      const res = await createTaskFromKeepSuggestionAction(
        suggestion.noteId,
        listName,
        title,
        suggestion.sourceTitle,
      );
      if (res.success) {
        setReport((current) => {
          const nextReport = addTaskToReportData(current ?? createEmptyReport(), res.task);
          return {
            ...nextReport,
            keepTaskSuggestions: nextReport.keepTaskSuggestions.filter(
              (item) => item.id !== suggestion.id,
            ),
          };
        });
        addUndoEntry(`Made task from Keep: ${suggestion.sourceTitle}`, {
          type: "create-task",
          task: res.task,
          sourceKeepSuggestion: suggestion,
        });
      } else if (!res.success) {
        alert(res.error || "Failed to convert Keep suggestion to task");
      } else {
        alert("Failed to convert Keep suggestion to task");
      }
    } catch (e) {
      console.error(e);
      alert(getErrorMessage(e, "Failed to convert Keep suggestion to task"));
    } finally {
      setProcessingKeepToTask((current) => {
        const next = new Set(current);
        next.delete(suggestion.id);
        return next;
      });
    }
  };

  const handleDismissKeepSuggestion = (suggestionId: string) => {
    if (report) {
      setReport({
        ...report,
        keepTaskSuggestions: report.keepTaskSuggestions.filter((item) => item.id !== suggestionId),
      });
    }
  };

  const handleDismissTextFollowUp = (followUpId: string) => {
    if (report) {
      setReport({
        ...report,
        textFollowUps: report.textFollowUps.filter((item) => item.id !== followUpId),
      });
    }
  };

  const markUndoEntry = (entryId: string, status: UndoStatus, error?: string) => {
    setUndoLog((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              status,
              error,
            }
          : entry,
      ),
    );
  };

  const handleUndoEntry = async (entry: UndoEntry) => {
    if (entry.status !== "available") {
      return;
    }

    setUndoingEntries((current) => new Set(current).add(entry.id));

    try {
      const operation = entry.operation;

      if (operation.type === "complete-task") {
        const res = await reopenTaskAction(operation.task.listId, operation.task.id);
        if (!res.success) throw new Error(res.error);

        setReport((current) =>
          addTaskToReportData(current ?? createEmptyReport(), operation.task),
        );
      }

      if (operation.type === "update-task-title") {
        const res = await updateTaskTitleAction(
          operation.taskListId,
          operation.taskId,
          operation.previousTitle,
        );
        if (!res.success) throw new Error(res.error);

        setReport((current) =>
          current
            ? {
                ...current,
                tasks: current.tasks.map((task) =>
                  task.id === operation.taskId && task.listId === operation.taskListId
                    ? { ...task, title: operation.previousTitle }
                    : task,
                ),
              }
            : current,
        );
      }

      if (operation.type === "create-task") {
        let restoredEvent = operation.sourceEvent;

        if (operation.deletedEventSnapshot) {
          const restored = await restoreCalendarEventAction(operation.deletedEventSnapshot);
          if (!restored.success) throw new Error(restored.error);
          restoredEvent = restoredEvent
            ? {
                ...restoredEvent,
                id: restored.eventId,
              }
            : restoredEvent;
        }

        const res = await deleteTaskAction(operation.task.listId, operation.task.id);
        if (!res.success) throw new Error(res.error);

        setReport((current) => {
          const nextReport = current ?? createEmptyReport();
          const taskKey = getTaskEditKey(operation.task.listId, operation.task.id);
          return {
            ...nextReport,
            tasks: nextReport.tasks.filter(
              (task) => getTaskEditKey(task.listId, task.id) !== taskKey,
            ),
            emails: operation.sourceEmail
              ? [operation.sourceEmail, ...nextReport.emails.filter((email) => email.id !== operation.sourceEmail?.id)]
              : nextReport.emails,
            events: restoredEvent
              ? [restoredEvent, ...nextReport.events.filter((event) => event.id !== restoredEvent?.id)]
              : nextReport.events,
            textFollowUps: operation.sourceTextFollowUp
              ? [
                  operation.sourceTextFollowUp,
                  ...nextReport.textFollowUps.filter(
                    (followUp) => followUp.id !== operation.sourceTextFollowUp?.id,
                  ),
                ]
              : nextReport.textFollowUps,
            keepTaskSuggestions: operation.sourceKeepSuggestion
              ? [
                  operation.sourceKeepSuggestion,
                  ...nextReport.keepTaskSuggestions.filter(
                    (suggestion) => suggestion.id !== operation.sourceKeepSuggestion?.id,
                  ),
                ]
              : nextReport.keepTaskSuggestions,
          };
        });
      }

      if (operation.type === "archive-email") {
        const res = await unarchiveEmailAction(operation.email.id);
        if (!res.success) throw new Error(res.error);

        setReport((current) =>
          current
            ? {
                ...current,
                emails: [
                  operation.email,
                  ...current.emails.filter((email) => email.id !== operation.email.id),
                ],
              }
            : {
                ...createEmptyReport(),
                emails: [operation.email],
              },
        );
      }

      if (operation.type === "trash-email") {
        const res = await untrashEmailAction(operation.email.id);
        if (!res.success) throw new Error(res.error);

        setReport((current) =>
          current
            ? {
                ...current,
                emails: [
                  operation.email,
                  ...current.emails.filter((email) => email.id !== operation.email.id),
                ],
              }
            : {
                ...createEmptyReport(),
                emails: [operation.email],
              },
        );
      }

      if (operation.type === "update-event-title") {
        const res = await updateEventTitleAction(operation.event.id, operation.previousTitle);
        if (!res.success) throw new Error(res.error);

        setReport((current) =>
          current
            ? {
                ...current,
                events: current.events.map((event) =>
                  event.id === operation.event.id
                    ? { ...event, title: operation.previousTitle }
                    : event,
                ),
              }
            : current,
        );
      }

      markUndoEntry(entry.id, "undone");
    } catch (error) {
      const message = getErrorMessage(error, "Undo failed.");
      markUndoEntry(entry.id, "failed", message);
      alert(message);
    } finally {
      setUndoingEntries((current) => {
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const handleKeepImportFiles = async (files: FileList | null) => {
    setKeepImportStatus(null);

    if (!files || files.length === 0) {
      setKeepImportNotes([]);
      return;
    }

    try {
      const notes = await parseKeepExportFiles(files);
      setKeepImportNotes(notes);
      setKeepImportStatus(`${notes.length} imported notes ready`);
    } catch (error) {
      setKeepImportNotes([]);
      setKeepImportStatus(getErrorMessage(error, "Could not read Keep export files."));
    }
  };

  const handleAnalyzeKeepImport = async () => {
    if (keepImportNotes.length === 0) {
      alert("Choose Keep export files first.");
      return;
    }

    setKeepImporting(true);
    setKeepImportStatus("Analyzing imported notes");

    try {
      const res = await importKeepNotesAction(keepImportNotes);

      if (!res.success) {
        setKeepImportStatus(res.error || "Failed to analyze Keep import.");
        return;
      }

      setReport((current) =>
        addKeepSuggestionsToReportData(current ?? createEmptyReport(), res.suggestions),
      );
      setKeepImportStatus(
        `${res.suggestions.length} task suggestions from ${res.importedCount} imported notes`,
      );
    } catch (error) {
      setKeepImportStatus(getErrorMessage(error, "Failed to analyze Keep import."));
    } finally {
      setKeepImporting(false);
    }
  };

  const tasksByList = useMemo(
    () => {
      const groupedTasks = GTD_TASK_LIST_OPTIONS.reduce(
        (acc, listName) => {
          acc[listName] = [];
          return acc;
        },
        {} as Record<string, DashboardData["tasks"]>,
      );

      for (const task of report?.tasks || []) {
        const listName = task.listName || "Uncategorized";
        if (!groupedTasks[listName]) groupedTasks[listName] = [];
        groupedTasks[listName].push(task);
      }

      return groupedTasks;
    },
    [report],
  );

  const summary = {
    open: report?.tasks.length ?? 0,
    waiting: tasksByList["Waiting for"]?.length ?? 0,
    inbox: report?.emails.length ?? 0,
    flagged:
      (report?.events.length ?? 0) +
      (report?.keepTaskSuggestions.length ?? 0) +
      (report?.textFollowUps.length ?? 0),
  };

  const calendarEvents = report?.events ?? [];
  const calendarExpanded = isSectionExpanded("calendar");
  const visibleCalendarEvents = getPreviewItems(calendarEvents, calendarExpanded);
  const keepSuggestions = report?.keepTaskSuggestions ?? [];
  const keepExpanded = isSectionExpanded("keep");
  const visibleKeepSuggestions = getPreviewItems(keepSuggestions, keepExpanded);
  const textFollowUps = report?.textFollowUps ?? [];
  const textsExpanded = isSectionExpanded("texts");
  const visibleTextFollowUps = getPreviewItems(textFollowUps, textsExpanded);
  const emails = report?.emails ?? [];
  const inboxExpanded = isSectionExpanded("inbox");
  const visibleEmails = getPreviewItems(emails, inboxExpanded);
  const mindSweepQuestions = report?.mindSweep ?? [];
  const mindSweepExpanded = isSectionExpanded("mind-sweep");
  const visibleMindSweepQuestions = getPreviewItems(mindSweepQuestions, mindSweepExpanded);

  if (status === "loading") {
    return (
      <div className="loading-screen">
        <span className="loader" />
        <p>Loading workspace</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="signin-screen">
        <div className="signin-card">
          <p className="eyebrow">Executive Assistant · GTD</p>
          <h1>Swingle Levin</h1>
          <p className="signin-copy">A focused command center for lists, calendar review, and inbox triage.</p>
          <button onClick={() => signIn("google")} className="primary-button full-width">
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="app-banner">
        <div className="banner-topline">
          <span>Executive Assistant · GTD</span>
          <span>{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date())}</span>
        </div>
        <div className="banner-main">
          <div>
            <h1>Good morning, {firstName}.</h1>
            <p>{report ? "Clear the decks in order." : "Ready for the next review."}</p>
          </div>
          <button onClick={() => signOut()} className="avatar-button" aria-label="Sign out">
            {session?.user?.image ? (
              <Image
                src={session.user.image}
                alt=""
                width={44}
                height={44}
                sizes="44px"
                className="avatar-image"
              />
            ) : (
              <span>{getInitials(session?.user?.name)}</span>
            )}
          </button>
        </div>
        <nav className="banner-nav" aria-label="Dashboard sections">
          <a href="#lists">Dashboard</a>
          <a href="#review">Review</a>
          <a href="#inbox">Inbox</a>
          <a href="#mind-sweep">Sweep</a>
        </nav>
      </header>

      <section className="focus-strip" aria-label="Today focus">
        <div>
          <p className="eyebrow">Today&apos;s focus</p>
          <h2>A trial-week rhythm, in webapp form.</h2>
        </div>
        <button onClick={handleRunAudit} disabled={loading} className="primary-button">
          {loading ? "Reviewing" : report ? "Refresh" : "Run Review"}
        </button>
      </section>

      <section className="metrics-grid" aria-label="Dashboard summary">
        <div className="metric-card">
          <span>{summary.open}</span>
          <p>Open</p>
        </div>
        <div className="metric-card">
          <span>{summary.waiting}</span>
          <p>Waiting</p>
        </div>
        <div className="metric-card">
          <span>{summary.inbox}</span>
          <p>Inbox</p>
        </div>
        <div className="metric-card">
          <span>{summary.flagged}</span>
          <p>Flagged</p>
        </div>
      </section>

      {error ? (
        <div className="notice-card danger">
          <p>{error}</p>
        </div>
      ) : null}

      <section hidden className="panel undo-panel" aria-label="Undo log">
        <SectionHeader
          kicker="Undo log"
          title="Recent changes."
          action={
            undoLog.length > 0 ? (
              <button onClick={() => setUndoLog([])} className="small-button">
                Clear
              </button>
            ) : null
          }
        />
        {undoLog.length === 0 ? (
          <EmptyState>No reversible changes yet.</EmptyState>
        ) : (
          <div className="undo-list">
            {undoLog.slice(0, 8).map((entry) => (
              <article key={entry.id} className={cx("undo-row", entry.status !== "available" && "muted")}>
                <div>
                  <h3>{entry.label}</h3>
                  <p>
                    {new Date(entry.createdAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {entry.status === "available" ? "Ready" : entry.status === "undone" ? "Undone" : "Failed"}
                  </p>
                  {entry.error ? <p className="undo-error">{entry.error}</p> : null}
                </div>
                <button
                  onClick={() => handleUndoEntry(entry)}
                  disabled={entry.status !== "available" || undoingEntries.has(entry.id)}
                  className="small-button"
                >
                  {undoingEntries.has(entry.id) ? "Undoing" : "Undo"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="dashboard-grid">
        <section id="lists" className="panel lists-panel">
          <SectionHeader kicker="I · Lists" title="The work, gathered." />
          <form className="add-task-row" onSubmit={handleCreateTask}>
            <select value={newTaskList} onChange={(event) => setNewTaskList(event.target.value)}>
              {GTD_TASK_LIST_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Add a task"
              disabled={addingTask}
            />
            <button type="submit" disabled={addingTask || !newTaskTitle.trim()} className="small-button filled">
              {addingTask ? "Adding" : "Add"}
            </button>
          </form>
          <div className="task-list-stack">
              {Object.entries(tasksByList).map(([listName, tasks]) => {
                const sectionId = `tasks:${listName}`;
                const expanded = isSectionExpanded(sectionId);
                const visibleTasks = getPreviewItems(tasks, expanded);

                return (
                  <div key={listName} className="task-group">
                    <div className="task-group-header">
                      <h3>{listName}</h3>
                      <span>{tasks.length}</span>
                    </div>
                    <div className="task-items">
                      {tasks.length === 0 ? <EmptyState>No tasks in this list.</EmptyState> : null}
                      {visibleTasks.map((task) => {
                        const editKey = getTaskEditKey(task.listId, task.id);
                        const editedTitle = taskTitleEdits[editKey] ?? task.title;
                        const titleChanged = editedTitle.trim() !== task.title;
                        return (
                          <article key={editKey} className="task-row">
                            <button
                              onClick={() => handleCompleteTask(task.listId, task.id)}
                              disabled={processingTasks.has(editKey)}
                              className="check-button"
                              aria-label={`Complete ${task.title}`}
                            >
                              {processingTasks.has(editKey) ? <span className="mini-loader" /> : null}
                            </button>
                            <div className="task-body">
                              <div className="inline-edit">
                                <input
                                  type="text"
                                  value={editedTitle}
                                  onChange={(e) =>
                                    setTaskTitleEdits((current) => ({
                                      ...current,
                                      [editKey]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleUpdateTaskTitle(task.listId, task.id, task.title);
                                    }
                                  }}
                                  disabled={processingTasks.has(editKey) || savingTaskTitles.has(editKey)}
                                />
                                <button
                                  onClick={() => handleUpdateTaskTitle(task.listId, task.id, task.title)}
                                  disabled={!titleChanged || savingTaskTitles.has(editKey)}
                                  className="small-button"
                                >
                                  {savingTaskTitles.has(editKey) ? "Saving" : "Save"}
                                </button>
                              </div>
                              <div className="meta-line">
                                <span>{task.contextOrPerson}</span>
                                <span>{task.addedDate}</span>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <RevealButton
                      expanded={expanded}
                      label={`${listName} tasks`}
                      onClick={() => toggleSection(sectionId)}
                      total={tasks.length}
                      visible={visibleTasks.length}
                    />
                  </div>
                );
              })}
          </div>
        </section>

        <div className="side-stack">
          <section id="review" className="panel">
            <SectionHeader
              kicker="II · Review"
              title="Things to turn into doing."
              action={<span className="pill">Calendar</span>}
            />
            <div className="review-list">
              {calendarEvents.length === 0 ? (
                <EmptyState>No all-day calendar items loaded.</EmptyState>
              ) : (
                visibleCalendarEvents.map((evt, i) => {
                  const eventEditedTitle = eventTaskTitle[evt.id] ?? evt.title;
                  const eventTitleChanged = eventEditedTitle.trim() !== evt.title;

                  return (
                  <article key={evt.id || i} className={cx("review-card", evt.isTrial && "urgent")}>
                    <div className="review-card-main">
                      <p className="review-date">{evt.date}</p>
                      <h3>{evt.title}</h3>
                    </div>
                    <label className="field-label">
                      Event title
                      <input
                        type="text"
                        value={eventEditedTitle}
                        onChange={(e) =>
                          setEventTaskTitle((current) => ({
                            ...current,
                            [evt.id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="action-row">
                      <button
                        onClick={() => handleUpdateEventTitle(evt)}
                        disabled={!eventTitleChanged || savingEventTitles.has(evt.id)}
                        className="small-button"
                      >
                        {savingEventTitles.has(evt.id) ? "Saving" : "Save event"}
                      </button>
                      <select
                        value={eventToList[evt.id] || "Next Action"}
                        onChange={(e) => setEventToList({ ...eventToList, [evt.id]: e.target.value })}
                      >
                        {GTD_TASK_LIST_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={eventDeleteMap[evt.id] || false}
                          onChange={(e) => setEventDeleteMap({ ...eventDeleteMap, [evt.id]: e.target.checked })}
                        />
                        Delete event
                      </label>
                      <button
                        onClick={() => handleConvertEvent(evt)}
                        disabled={processingEventToTask.has(evt.id)}
                        className="small-button filled"
                      >
                        {processingEventToTask.has(evt.id) ? "Making" : "Make task"}
                      </button>
                    </div>
                  </article>
                  );
                })
              )}
            </div>
            <RevealButton
              expanded={calendarExpanded}
              label="all-day events"
              onClick={() => toggleSection("calendar")}
              total={calendarEvents.length}
              visible={visibleCalendarEvents.length}
            />
          </section>

          <section className="panel">
              <SectionHeader
                kicker="Google Keep"
                title={`${report?.keepTaskSuggestions.length ?? 0} suggestions`}
                action={<span className="pill">{keepSuggestionsEnabled ? "API + import" : "Import"}</span>}
              />
              <div className="keep-import-box">
                <input
                  type="file"
                  multiple
                  accept=".json,.html,.htm,.txt,application/json,text/html,text/plain"
                  onChange={(event) => handleKeepImportFiles(event.currentTarget.files)}
                />
                <button
                  onClick={handleAnalyzeKeepImport}
                  disabled={keepImporting || keepImportNotes.length === 0}
                  className="small-button filled"
                >
                  {keepImporting ? "Analyzing" : "Analyze import"}
                </button>
                {keepImportStatus ? <p>{keepImportStatus}</p> : null}
              </div>
              <div className="review-list">
                {keepSuggestions.length === 0 ? (
                  <EmptyState>No Keep suggestions loaded.</EmptyState>
                ) : (
                  visibleKeepSuggestions.map((suggestion) => (
                    <article key={suggestion.id} className="review-card">
                      <div className="review-card-main">
                        <p className="review-date">{suggestion.sourceTitle}</p>
                        <h3>{suggestion.reason}</h3>
                      </div>
                      <label className="field-label">
                        Task title
                        <input
                          type="text"
                          value={keepTaskTitle[suggestion.id] ?? suggestion.suggestedTaskTitle}
                          onChange={(e) =>
                            setKeepTaskTitle((current) => ({
                              ...current,
                              [suggestion.id]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="action-row">
                        <select
                          value={keepToList[suggestion.id] || "Next Action"}
                          onChange={(e) => setKeepToList({ ...keepToList, [suggestion.id]: e.target.value })}
                        >
                          {GTD_TASK_LIST_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => handleDismissKeepSuggestion(suggestion.id)} className="small-button">
                          Archive
                        </button>
                        <button
                          onClick={() => handleConvertKeepSuggestion(suggestion)}
                          disabled={processingKeepToTask.has(suggestion.id)}
                          className="small-button filled"
                        >
                          {processingKeepToTask.has(suggestion.id) ? "Making" : "Make task"}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <RevealButton
                expanded={keepExpanded}
                label="Keep suggestions"
                onClick={() => toggleSection("keep")}
                total={keepSuggestions.length}
                visible={visibleKeepSuggestions.length}
              />
            </section>
        </div>
      </div>

      {smsFollowUpsEnabled ? (
        <section className="panel full-panel">
          <SectionHeader kicker="Text follow-ups" title="Recent replies to catch." />
          <div className="inbox-list">
            {textFollowUps.length === 0 ? (
              <EmptyState>No text follow-ups loaded.</EmptyState>
            ) : (
              visibleTextFollowUps.map((followUp) => {
                const displayName = followUp.contactName || followUp.address;
                return (
                  <article key={followUp.id} className="inbox-row">
                    <div className="sender-mark">{getInitials(displayName)}</div>
                    <div className="inbox-body">
                      <div className="inbox-head">
                        <h3>{displayName}</h3>
                        <span>{new Date(followUp.lastInboundAt).toLocaleString()}</span>
                      </div>
                      <p>{followUp.lastInboundText}</p>
                      <p className="suggestion-line">{followUp.reason}</p>
                      <label className="field-label">
                        Task title
                        <input
                          type="text"
                          value={textTaskTitle[followUp.id] ?? `Follow up with ${displayName}`}
                          onChange={(e) =>
                            setTextTaskTitle((current) => ({
                              ...current,
                              [followUp.id]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="action-row">
                        <select
                          value={textToList[followUp.id] || "Next Action"}
                          onChange={(e) => setTextToList({ ...textToList, [followUp.id]: e.target.value })}
                        >
                          {GTD_TASK_LIST_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <a href={`sms:${followUp.address}`} className="small-button as-link">
                          Open text
                        </a>
                        <button onClick={() => handleDismissTextFollowUp(followUp.id)} className="small-button">
                          Archive
                        </button>
                        <button
                          onClick={() => handleConvertTextFollowUp(followUp)}
                          disabled={processingTextToTask.has(followUp.id)}
                          className="small-button filled"
                        >
                          {processingTextToTask.has(followUp.id) ? "Making" : "Make task"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
          <RevealButton
            expanded={textsExpanded}
            label="text follow-ups"
            onClick={() => toggleSection("texts")}
            total={textFollowUps.length}
            visible={visibleTextFollowUps.length}
          />
        </section>
      ) : null}

      <section id="inbox" className="panel full-panel">
        <SectionHeader kicker="III · Today" title="Recent inbox." action={<span className="pill">{summary.inbox} unread</span>} />
        <div className="inbox-list">
          {emails.length === 0 ? (
            <EmptyState>No inbox items loaded.</EmptyState>
          ) : (
            visibleEmails.map((email) => (
              <article key={email.id} className="inbox-row">
                <div className="sender-mark">{getInitials(email.subject)}</div>
                <div className="inbox-body">
                  <div className="inbox-head">
                    <h3>{email.subject}</h3>
                  </div>
                  <p>{email.summary}</p>
                  <p className="suggestion-line">{email.proposedAction}</p>
                  <label className="field-label">
                    Task title
                    <input
                      type="text"
                      value={emailTaskTitle[email.id] ?? email.proposedAction ?? email.subject}
                      onChange={(e) =>
                        setEmailTaskTitle((current) => ({
                          ...current,
                          [email.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="action-row">
                    <select
                      value={emailToList[email.id] || "Next Action"}
                      onChange={(e) => setEmailToList({ ...emailToList, [email.id]: e.target.value })}
                    >
                      {GTD_TASK_LIST_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleConvertEmail(email)}
                      disabled={processingEmailToTask.has(email.id)}
                      className="small-button filled"
                    >
                      {processingEmailToTask.has(email.id) ? "Making" : "Make task"}
                    </button>
                    <button
                      onClick={() => handleArchiveEmail(email.id)}
                      disabled={Boolean(processingEmailActions[email.id])}
                      className="small-button"
                    >
                      {processingEmailActions[email.id] === "archive" ? "Archiving" : "Archive"}
                    </button>
                    <button
                      onClick={() => handleDeleteEmail(email.id)}
                      disabled={Boolean(processingEmailActions[email.id])}
                      className="small-button danger"
                    >
                      {processingEmailActions[email.id] === "delete" ? "Deleting" : "Trash"}
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
        <RevealButton
          expanded={inboxExpanded}
          label="inbox items"
          onClick={() => toggleSection("inbox")}
          total={emails.length}
          visible={visibleEmails.length}
        />
      </section>

      <section id="mind-sweep" className="panel full-panel">
        <SectionHeader kicker="Mind sweep" title="Questions worth holding." />
        {mindSweepQuestions.length === 0 ? (
          <EmptyState>No prompts loaded.</EmptyState>
        ) : (
          <ol className="mind-list">
            {visibleMindSweepQuestions.map((question, index) => (
              <li key={`${question}-${index}`}>
                <span>{index + 1}</span>
                <p>{question}</p>
              </li>
            ))}
          </ol>
        )}
        <RevealButton
          expanded={mindSweepExpanded}
          label="mind-sweep prompts"
          onClick={() => toggleSection("mind-sweep")}
          total={mindSweepQuestions.length}
          visible={visibleMindSweepQuestions.length}
        />
      </section>

      <section className="undo-drawer" aria-label="Recent changes">
        <div className="undo-drawer-bar">
          <div>
            <p className="eyebrow">Recent changes</p>
            <h2>
              {undoLog.length === 0
                ? "Nothing to undo"
                : `${undoLog.filter((entry) => entry.status === "available").length} available`}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setUndoLogOpen((current) => !current)}
            className="small-button"
            aria-expanded={undoLogOpen}
            aria-controls="undo-log-panel"
          >
            {undoLogOpen ? "Hide" : "Show"}
          </button>
        </div>

        {undoLogOpen ? (
          <div id="undo-log-panel" className="undo-drawer-panel">
            <div className="undo-drawer-actions">
              <p>{undoLog.length} recent change{undoLog.length === 1 ? "" : "s"} saved on this device.</p>
              {undoLog.length > 0 ? (
                <button onClick={() => setUndoLog([])} className="small-button">
                  Clear
                </button>
              ) : null}
            </div>
            {undoLog.length === 0 ? (
              <EmptyState>No reversible changes yet.</EmptyState>
            ) : (
              <div className="undo-list">
                {undoLog.slice(0, 8).map((entry) => (
                  <article key={entry.id} className={cx("undo-row", entry.status !== "available" && "muted")}>
                    <div>
                      <h3>{entry.label}</h3>
                      <p>
                        {new Date(entry.createdAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {" - "}
                        {entry.status === "available" ? "Ready" : entry.status === "undone" ? "Undone" : "Failed"}
                      </p>
                      {entry.error ? <p className="undo-error">{entry.error}</p> : null}
                    </div>
                    <button
                      onClick={() => handleUndoEntry(entry)}
                      disabled={entry.status !== "available" || undoingEntries.has(entry.id)}
                      className="small-button"
                    >
                      {undoingEntries.has(entry.id) ? "Undoing" : "Undo"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
