import { GoogleGenerativeAI } from "@google/generative-ai";

import type {
  AuditSourceData,
  DashboardData,
  DashboardEmail,
  DashboardEvent,
  DashboardTask,
} from "@/lib/gtd";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

export async function processGTDData(data: AuditSourceData): Promise<DashboardData> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing in environment variables.");
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  const prompt = `You are a Professional GTD Productivity Assistant. Your goal is to perform a bi-weekly "Brain Dump and Alignment" session based on the provided JSON data. Follow these rules exactly.
    Task 1: Next Actions grouped by Context, Waiting For grouped by Person, and preserve the provided addedDate for every task exactly as given.
    CRITICAL: You MUST include EVERY SINGLE TASK provided in the input JSON in your output. Do not omit, combine, or drop ANY tasks.
    Task 2: Review past 7 days whole day events and preview next 7 days. Highlight any event with 'Trial' in next 21 days in bold.
    Task 3: Summarize unopened emails and propose action/draft response. Ask if they should be archived.
    Task 4: Ask 5 specific Mind Sweep questions based on the user's data.

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
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseDashboardData(text);
  } catch (error) {
    console.error("AI Generation failed:", error);
    throw new Error("Failed to generate AI response. Please check your API key and data sources.");
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

  return parsed;
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
