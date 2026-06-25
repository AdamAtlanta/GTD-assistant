import type { KeepNoteForReview } from "@/lib/gtd";

type RawKeepJson = Partial<{
  title: string;
  textContent: string;
  text: string;
  userEditedTimestampUsec: string | number;
  createdTimestampUsec: string | number;
  isTrashed: boolean;
  listContent: Array<
    Partial<{
      text: string;
      isChecked: boolean;
      checked: boolean;
    }>
  >;
}>;

const MAX_IMPORTED_NOTES = 75;
const MAX_TEXT_LENGTH = 4_000;
const MAX_LIST_ITEMS = 40;

export async function parseKeepExportFiles(files: FileList | File[]) {
  const parsedNotes = await Promise.all(
    Array.from(files)
      .filter(isSupportedKeepExportFile)
      .slice(0, 150)
      .map(async (file) => parseKeepExportFile(file.name, await file.text())),
  );

  return sanitizeImportedKeepNotes(parsedNotes.filter((note): note is KeepNoteForReview => Boolean(note)));
}

export function sanitizeImportedKeepNotes(notes: unknown): KeepNoteForReview[] {
  if (!Array.isArray(notes)) {
    return [];
  }

  const seen = new Set<string>();
  const normalizedNotes: KeepNoteForReview[] = [];

  for (const note of notes) {
    const normalizedNote = normalizeImportedNote(note);

    if (!normalizedNote || seen.has(normalizedNote.id)) {
      continue;
    }

    seen.add(normalizedNote.id);
    normalizedNotes.push(normalizedNote);

    if (normalizedNotes.length >= MAX_IMPORTED_NOTES) {
      break;
    }
  }

  return normalizedNotes.sort(
    (a, b) => new Date(b.updatedTime).getTime() - new Date(a.updatedTime).getTime(),
  );
}

function parseKeepExportFile(fileName: string, content: string): KeepNoteForReview | null {
  const lowerFileName = fileName.toLowerCase();

  if (lowerFileName.endsWith(".json")) {
    return parseKeepJson(fileName, content);
  }

  if (lowerFileName.endsWith(".html") || lowerFileName.endsWith(".htm")) {
    return parseKeepHtml(fileName, content);
  }

  return parseKeepText(fileName, content);
}

function parseKeepJson(fileName: string, content: string): KeepNoteForReview | null {
  try {
    const parsed = JSON.parse(content) as RawKeepJson;

    if (parsed.isTrashed) {
      return null;
    }

    const title = cleanText(parsed.title) || titleFromFileName(fileName);
    const text = cleanText(parsed.textContent || parsed.text);
    const listItems =
      parsed.listContent
        ?.filter((item) => !item.isChecked && !item.checked)
        .flatMap((item) => {
          const itemText = cleanText(item.text);
          return itemText ? [itemText] : [];
        }) || [];
    const updatedTime = timestampUsecToISOString(
      parsed.userEditedTimestampUsec || parsed.createdTimestampUsec,
    );

    return normalizeImportedNote({
      id: `import:${hashString(`${fileName}:${title}:${text}:${listItems.join("|")}`)}`,
      title,
      text,
      listItems,
      updatedTime,
    });
  } catch {
    return null;
  }
}

function parseKeepHtml(fileName: string, content: string): KeepNoteForReview | null {
  const title = cleanText(readHtmlTitle(content)) || titleFromFileName(fileName);
  const listItems = readHtmlListItems(content);
  const text = cleanText(readHtmlText(content));

  return normalizeImportedNote({
    id: `import:${hashString(`${fileName}:${title}:${text}:${listItems.join("|")}`)}`,
    title,
    text,
    listItems,
    updatedTime: new Date().toISOString(),
  });
}

function parseKeepText(fileName: string, content: string): KeepNoteForReview | null {
  const title = titleFromFileName(fileName);
  const text = cleanText(content);

  return normalizeImportedNote({
    id: `import:${hashString(`${fileName}:${text}`)}`,
    title,
    text,
    listItems: [],
    updatedTime: new Date().toISOString(),
  });
}

function normalizeImportedNote(note: unknown): KeepNoteForReview | null {
  if (!note || typeof note !== "object") {
    return null;
  }

  const candidate = note as Partial<KeepNoteForReview>;
  const title = cleanText(candidate.title) || "Untitled Keep note";
  const text = cleanText(candidate.text).slice(0, MAX_TEXT_LENGTH);
  const listItems = Array.isArray(candidate.listItems)
    ? candidate.listItems
        .map((item) => cleanText(item))
        .filter(Boolean)
        .slice(0, MAX_LIST_ITEMS)
    : [];
  const updatedTime =
    typeof candidate.updatedTime === "string" && !Number.isNaN(new Date(candidate.updatedTime).getTime())
      ? candidate.updatedTime
      : new Date().toISOString();

  if (!text && listItems.length === 0 && !title) {
    return null;
  }

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : `import:${hashString(`${title}:${text}:${listItems.join("|")}`)}`,
    title: title.slice(0, 180),
    text,
    listItems,
    updatedTime,
  };
}

function isSupportedKeepExportFile(file: File) {
  const fileName = file.name.toLowerCase();
  return (
    fileName.endsWith(".json") ||
    fileName.endsWith(".html") ||
    fileName.endsWith(".htm") ||
    fileName.endsWith(".txt") ||
    file.type === "application/json" ||
    file.type === "text/html" ||
    file.type === "text/plain"
  );
}

function readHtmlTitle(content: string) {
  if (typeof DOMParser !== "undefined") {
    return new DOMParser().parseFromString(content, "text/html").querySelector("title")?.textContent || "";
  }

  return decodeHtmlEntities(content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function readHtmlListItems(content: string) {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(content, "text/html");
    return Array.from(doc.querySelectorAll("li"))
      .map((item) => cleanText(item.textContent))
      .filter(Boolean);
  }

  return Array.from(content.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
    .map((match) => cleanText(stripHtml(match[1])))
    .filter(Boolean);
}

function readHtmlText(content: string) {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(content, "text/html");
    doc.querySelectorAll("script, style").forEach((element) => element.remove());
    return doc.body?.textContent || "";
  }

  return stripHtml(content);
}

function stripHtml(content: string) {
  return decodeHtmlEntities(
    content
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function cleanText(value: unknown) {
  return typeof value === "string" ? decodeHtmlEntities(value).replace(/\s+/g, " ").trim() : "";
}

function titleFromFileName(fileName: string) {
  return (
    fileName
      .replace(/\.(json|html|htm|txt)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Untitled Keep note"
  );
}

function timestampUsecToISOString(value: string | number | undefined) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return new Date().toISOString();
  }

  const milliseconds = numericValue > 9_999_999_999_999 ? numericValue / 1000 : numericValue;
  return new Date(milliseconds).toISOString();
}

function decodeHtmlEntities(value: string) {
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
  }

  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
