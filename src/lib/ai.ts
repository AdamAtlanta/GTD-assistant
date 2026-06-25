import { GoogleGenerativeAI } from "@google/generative-ai";

import type {
  AuditSourceData,
  DashboardData,
  DashboardEmail,
  DashboardEvent,
  DashboardKeepTaskSuggestion,
  DashboardTask,
  DashboardTextFollowUp,
  KeepNoteForReview,
} from "@/lib/gtd";
import type { SmsFollowUpCandidate } from "@/lib/sms";

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing in environment variables.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
}

export async function processGTDData(data: AuditSourceData): Promise<DashboardData> {
  const prompt = `You are a Professional GTD Productivity Assistant. Your goal is to perform a bi-weekly "Brain Dump and Alignment" session based on the provided JSON data. Follow these rules exactly.
    Task 1: Next Actions grouped by Context, Waiting For grouped by Person, and preserve the provided addedDate for every task exactly as given.
    CRITICAL: You MUST include EVERY SINGLE TASK provided in the input JSON in your output. Do not omit, combine, or drop ANY tasks.
    Task 2: Review only all-day calendar events from the last 7 days and the next 7 days. Mark all-day trial events as trial items.
    Task 3: Summarize unopened emails and propose action/draft response. Ask if they should be archived.
    Task 4: Review Google Keep notes and suggest concrete tasks only when the note implies an action, commitment, follow-up, errand, reminder, or next step. Ignore reference-only notes.
    Task 5: Review SMS follow-up candidates. Preserve every SMS follow-up candidate exactly, and add a practical suggestedAction when helpful.
    Task 6: Ask 5 specific Mind Sweep questions based on the user's data.

Output a strictly valid JSON object adhering to the following structure:
{
  "tasks": [
    { "id": "string (the original task id from google tasks)", "listId": "string (the original list id from google tasks)", "listName": "string (the list name)", "title": "string", "contextOrPerson": "string", "addedDate": "string in the exact same date format provided in the input, like 3/5/25" }
  ],
  "events": [
    { "id": "string (the original event id from google calendar)", "type": "past" | "future", "title": "string", "date": "string", "isTrial": boolean }
  ],
  "emails": [
    { "id": "string (original message id from gmail)", "subject": "string", "summary": "string", "proposedAction": "string" }
  ],
  "keepTaskSuggestions": [
    { "id": "string unique suggestion id", "noteId": "string (original Google Keep note id/name)", "sourceTitle": "string (Keep note title)", "suggestedTaskTitle": "string (ready-to-create Google Task title)", "reason": "string" }
  ],
  "textFollowUps": [
    { "id": "string (original SMS follow-up id)", "conversationId": "string", "address": "string", "contactName": "string if available", "lastInboundText": "string", "lastInboundAt": "string", "reason": "string", "suggestedAction": "string" }
  ],
  "mindSweep": [
    "string (question 1)",
    "string (question 2)",
    "string (question 3)",
    "string (question 4)",
    "string (question 5)"
  ]
}

Ensure all IDs (task ids, list ids, message ids) are exactly preserved from the input data so they can be referenced later.
Here is my current Google Workspace and Slack data in JSON format:\n\n${JSON.stringify(data, null, 2)}\n\nPlease generate my GTD Brain Dump and Alignment report.`;

  try {
    const model = getGeminiModel();
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = parseDashboardData(text);
    return {
      ...parsed,
      tasks: mergeDashboardTasks(parsed.tasks, data.tasks),
      events: mergeDashboardEvents(parsed.events, data.calendar),
      emails: mergeDashboardEmails(parsed.emails, data.emails),
      keepTaskSuggestions: mergeKeepTaskSuggestions(
        parsed.keepTaskSuggestions,
        data.keepNotes,
      ),
      textFollowUps: mergeTextFollowUps(parsed.textFollowUps, data.smsFollowUps),
    };
  } catch (error) {
    console.error("AI Generation failed:", error);
    throw new Error("Failed to generate AI response. Please check your API key and data sources.");
  }
}

export async function suggestTasksFromKeepNotes(
  keepNotes: KeepNoteForReview[],
): Promise<DashboardKeepTaskSuggestion[]> {
  const notes = keepNotes.slice(0, 75);

  if (notes.length === 0) {
    return [];
  }

  const prompt = `You are reviewing imported Google Keep notes for a personal GTD dashboard.
Suggest concrete Google Tasks only when a note implies an action, commitment, follow-up, errand, reminder, or next step. Ignore reference-only notes.

Output strictly valid JSON with this shape:
{
  "keepTaskSuggestions": [
    { "id": "string unique suggestion id", "noteId": "string (original imported note id)", "sourceTitle": "string", "suggestedTaskTitle": "string", "reason": "string" }
  ]
}

Use the note id exactly as provided in noteId. Limit the result to the 12 strongest suggestions.

Imported Keep notes:
${JSON.stringify(notes, null, 2)}`;

  try {
    const model = getGeminiModel();
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const suggestions = parseKeepSuggestionResponse(text);
    return mergeKeepTaskSuggestions(suggestions, notes);
  } catch (error) {
    console.error("Keep import AI generation failed:", error);
    throw new Error("Failed to generate Keep task suggestions.");
  }
}

function parseDashboardData(responseText: string): DashboardData {
  const normalizedText = responseText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const parsed = JSON.parse(normalizedText) as unknown;

  if (!isDashboardData(parsed)) {
    throw new Error("Gemini returned an unexpected response shape.");
  }

  return {
    ...parsed,
    keepTaskSuggestions: parsed.keepTaskSuggestions || [],
    textFollowUps: parsed.textFollowUps || [],
  };
}

function parseKeepSuggestionResponse(responseText: string): DashboardKeepTaskSuggestion[] {
  const normalizedText = responseText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const parsed = JSON.parse(normalizedText) as unknown;
  const suggestions = Array.isArray(parsed)
    ? parsed
    : (parsed as Partial<Pick<DashboardData, "keepTaskSuggestions">>)?.keepTaskSuggestions;

  if (
    !Array.isArray(suggestions) ||
    !suggestions.every(isDashboardKeepTaskSuggestion)
  ) {
    throw new Error("Gemini returned an unexpected Keep suggestion response shape.");
  }

  return suggestions;
}

function isDashboardData(value: unknown): value is DashboardData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DashboardData>;

  return (
    Array.isArray(candidate.tasks) &&
    candidate.tasks.every(isDashboardTask) &&
    Array.isArray(candidate.events) &&
    candidate.events.every(isDashboardEvent) &&
    Array.isArray(candidate.emails) &&
    candidate.emails.every(isDashboardEmail) &&
    (!candidate.keepTaskSuggestions ||
      (Array.isArray(candidate.keepTaskSuggestions) &&
        candidate.keepTaskSuggestions.every(isDashboardKeepTaskSuggestion))) &&
    (!candidate.textFollowUps ||
      (Array.isArray(candidate.textFollowUps) &&
        candidate.textFollowUps.every(isDashboardTextFollowUp))) &&
    Array.isArray(candidate.mindSweep) &&
    candidate.mindSweep.every((question) => typeof question === "string")
  );
}

function isDashboardTask(value: unknown): value is DashboardTask {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DashboardTask>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.listId === "string" &&
    typeof candidate.listName === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.contextOrPerson === "string" &&
    typeof candidate.addedDate === "string"
  );
}

function isDashboardEvent(value: unknown): value is DashboardEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DashboardEvent>;

  return (
    typeof candidate.id === "string" &&
    (candidate.type === "past" || candidate.type === "future") &&
    typeof candidate.title === "string" &&
    typeof candidate.date === "string" &&
    typeof candidate.isTrial === "boolean"
  );
}

function isDashboardEmail(value: unknown): value is DashboardEmail {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DashboardEmail>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.subject === "string" &&
    typeof candidate.summary === "string" &&
    typeof candidate.proposedAction === "string"
  );
}

function isDashboardTextFollowUp(value: unknown): value is DashboardTextFollowUp {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DashboardTextFollowUp>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.conversationId === "string" &&
    typeof candidate.address === "string" &&
    (typeof candidate.contactName === "string" || candidate.contactName === undefined) &&
    typeof candidate.lastInboundText === "string" &&
    typeof candidate.lastInboundAt === "string" &&
    typeof candidate.reason === "string" &&
    typeof candidate.suggestedAction === "string"
  );
}

function isDashboardKeepTaskSuggestion(value: unknown): value is DashboardKeepTaskSuggestion {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DashboardKeepTaskSuggestion>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.noteId === "string" &&
    typeof candidate.sourceTitle === "string" &&
    typeof candidate.suggestedTaskTitle === "string" &&
    typeof candidate.reason === "string"
  );
}

function mergeDashboardTasks(
  aiTasks: DashboardTask[],
  tasksByList: AuditSourceData["tasks"],
): DashboardTask[] {
  const aiByKey = new Map(
    aiTasks.map((task) => [buildTaskKey(task.listId, task.id), task]),
  );
  const mergedTasks: DashboardTask[] = [];

  for (const [listName, tasks] of Object.entries(tasksByList)) {
    for (const task of tasks || []) {
      if (!task.id || !task.listId) {
        continue;
      }

      const aiTask = aiByKey.get(buildTaskKey(task.listId, task.id));
      const title = task.title?.trim() || aiTask?.title || "Untitled task";

      mergedTasks.push({
        id: task.id,
        listId: task.listId,
        listName,
        title,
        contextOrPerson: aiTask?.contextOrPerson || listName,
        addedDate: task.addedDate || aiTask?.addedDate || "Date unavailable",
      });
    }
  }

  return mergedTasks;
}

function mergeDashboardEvents(
  aiEvents: DashboardEvent[],
  calendar: AuditSourceData["calendar"],
): DashboardEvent[] {
  const aiById = new Map(aiEvents.map((event) => [event.id, event]));
  const trialEventIds = new Set(calendar.trials.flatMap((event) => (event.id ? [event.id] : [])));
  const mergedEvents = new Map<string, DashboardEvent>();

  const addEvent = (
    event: AuditSourceData["calendar"]["past"][number],
    type: DashboardEvent["type"],
    forceTrial = false,
  ) => {
    if (!event.id) {
      return;
    }

    const aiEvent = aiById.get(event.id);
    const currentEvent = mergedEvents.get(event.id);
    const title = event.summary?.trim() || aiEvent?.title || "Untitled event";

    mergedEvents.set(event.id, {
      id: event.id,
      type: currentEvent?.type || type,
      title,
      date: aiEvent?.date || currentEvent?.date || formatCalendarEventDate(event),
      isTrial:
        Boolean(currentEvent?.isTrial) ||
        forceTrial ||
        trialEventIds.has(event.id) ||
        /trial/i.test(title) ||
        aiEvent?.isTrial === true,
    });
  };

  for (const event of calendar.past) {
    addEvent(event, "past");
  }

  for (const event of calendar.future) {
    addEvent(event, "future");
  }

  for (const event of calendar.trials) {
    addEvent(event, "future", true);
  }

  return Array.from(mergedEvents.values());
}

function mergeDashboardEmails(
  aiEmails: DashboardEmail[],
  sourceEmails: AuditSourceData["emails"],
): DashboardEmail[] {
  const aiById = new Map(aiEmails.map((email) => [email.id, email]));

  return sourceEmails.flatMap((message) => {
    if (!message.id) {
      return [];
    }

    const aiEmail = aiById.get(message.id);
    const subject = getMessageHeader(message, "Subject") || aiEmail?.subject || "(No subject)";

    return [
      {
        id: message.id,
        subject,
        summary: aiEmail?.summary || message.snippet || "Unread Gmail message.",
        proposedAction:
          aiEmail?.proposedAction ||
          `Review and decide the next action for "${subject}".`,
      },
    ];
  });
}

function buildTaskKey(listId: string, taskId: string) {
  return `${listId}:${taskId}`;
}

function getMessageHeader(
  message: AuditSourceData["emails"][number],
  headerName: string,
) {
  return message.payload?.headers
    ?.find((header) => header.name?.toLowerCase() === headerName.toLowerCase())
    ?.value?.trim();
}

function formatCalendarEventDate(event: AuditSourceData["calendar"]["past"][number]) {
  if (event.start?.date) {
    const [year, month, day] = event.start.date.split("-").map(Number);

    if (year && month && day) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(year, month - 1, day));
    }

    return event.start.date;
  }

  if (event.start?.dateTime) {
    const parsedDate = new Date(event.start.dateTime);

    if (!Number.isNaN(parsedDate.getTime())) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(parsedDate);
    }

    return event.start.dateTime;
  }

  return "Date unavailable";
}

function mergeKeepTaskSuggestions(
  suggestions: DashboardKeepTaskSuggestion[],
  keepNotes: AuditSourceData["keepNotes"],
): DashboardKeepTaskSuggestion[] {
  const validNoteIds = new Set(keepNotes.map((note) => note.id));
  const seen = new Set<string>();

  return suggestions
    .filter((suggestion) => validNoteIds.has(suggestion.noteId))
    .map((suggestion) => {
      const key = buildKeepSuggestionKey(suggestion.noteId, suggestion.suggestedTaskTitle);

      return {
        ...suggestion,
        id: key,
      };
    })
    .filter((suggestion) => {
      const key = suggestion.id;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function buildKeepSuggestionKey(noteId: string, suggestedTaskTitle: string) {
  return `${noteId}::${suggestedTaskTitle.trim().toLowerCase()}`;
}

function mergeTextFollowUps(
  aiFollowUps: DashboardTextFollowUp[],
  sourceFollowUps: SmsFollowUpCandidate[],
): DashboardTextFollowUp[] {
  const merged = new Map<string, DashboardTextFollowUp>();

  for (const followUp of sourceFollowUps) {
    merged.set(followUp.id, {
      id: followUp.id,
      conversationId: followUp.conversationId,
      address: followUp.address,
      contactName: followUp.contactName,
      lastInboundText: followUp.lastInboundText,
      lastInboundAt: followUp.lastInboundAt,
      reason: followUp.reason,
      suggestedAction: followUp.suggestedAction,
    });
  }

  for (const followUp of aiFollowUps) {
    merged.set(followUp.id, {
      ...merged.get(followUp.id),
      ...followUp,
    });
  }

  return Array.from(merged.values());
}
