import type { FileItem, RawFileItem, RawQuizManifestEntry } from "../types";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
const STRIPPABLE_EXTENSIONS = [
  ".pdf",
  ".html",
  ".htm",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".txt",
];

export interface FileBadge {
  label: string;
  className: string;
  kind: "quiz" | "image" | "document";
}

export function isImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function stripFileExtension(name: string): string {
  const lower = name.toLowerCase();
  const matched = STRIPPABLE_EXTENSIONS.find((ext) => lower.endsWith(ext));
  if (!matched) return name;
  const trimmed = name.slice(0, -matched.length).trim();
  return trimmed || name;
}

export function getFileBadge(item: FileItem, tabId?: string): FileBadge | null {
  if (item.type === "folder") return null;

  if (tabId === "quizzes" || Boolean(item.subject)) {
    return {
      label: "QUIZ",
      className: "bg-accent-violet/15 text-accent-violet-soft ring-accent-violet/30",
      kind: "quiz",
    };
  }

  const lower = item.name.toLowerCase();

  if (lower.endsWith(".pdf")) {
    return {
      label: "PDF",
      className: "bg-rose-500/12 text-rose-400 ring-rose-400/25",
      kind: "document",
    };
  }

  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return {
      label: "HTML",
      className: "bg-amber-500/12 text-amber-400 ring-amber-400/25",
      kind: "document",
    };
  }

  if (isImageFile(lower)) {
    return {
      label: "IMG",
      className: "bg-sky-500/12 text-sky-400 ring-sky-400/25",
      kind: "image",
    };
  }

  if (lower.endsWith(".doc") || lower.endsWith(".docx")) {
    return {
      label: "DOC",
      className: "bg-indigo-500/12 text-indigo-400 ring-indigo-400/25",
      kind: "document",
    };
  }

  if (lower.endsWith(".ppt") || lower.endsWith(".pptx")) {
    return {
      label: "PPT",
      className: "bg-orange-500/12 text-orange-400 ring-orange-400/25",
      kind: "document",
    };
  }

  if (lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".csv")) {
    return {
      label: "XLS",
      className: "bg-emerald-500/12 text-emerald-400 ring-emerald-400/25",
      kind: "document",
    };
  }

  const dotIdx = lower.lastIndexOf(".");
  const ext = dotIdx > 0 && dotIdx < lower.length - 1 ? lower.slice(dotIdx + 1, dotIdx + 5).toUpperCase() : "FILE";

  return {
    label: ext,
    className: "bg-slate-500/15 text-slate-400 ring-slate-400/25",
    kind: "document",
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Converts the raw files.json tree into the internal FileItem shape.
 * Folders have an empty fileId in the source data, so their id is
 * synthesized from the path (parent ids + name) to stay stable and unique.
 */
export function normalizeFileTree(raw: RawFileItem[], parentPath = ""): FileItem[] {
  return raw.map((entry) => {
    const isFolder = entry.type === "folder";
    const id = isFolder ? `${parentPath}/${entry.name}` : entry.fileId || `${parentPath}/${entry.name}`;
    return {
      id,
      name: entry.name,
      type: entry.type,
      driveId: entry.fileId,
      sizeLabel: formatBytes(entry.size),
      updatedAt: formatDate(entry.addedAt),
      children: isFolder ? normalizeFileTree(entry.children ?? [], id) : undefined,
    };
  });
}

/** Recursively counts `type: "file"` entries (folders themselves don't count). */
export function countFiles(items: FileItem[]): number {
  return items.reduce((total, item) => {
    if (item.type === "file") return total + 1;
    return total + countFiles(item.children ?? []);
  }, 0);
}

/** Case-insensitive/trimmed lookup of a top-level folder's children by name (files.json root entries). */
export function findFolderChildren(items: FileItem[], name: string): FileItem[] {
  const target = name.trim().toLowerCase();
  const match = items.find((item) => item.type === "folder" && item.name.trim().toLowerCase() === target);
  return match?.children ?? [];
}

/**
 * quizzes.json is a flat list of {id, subject, title, fileId}. This groups
 * it into a synthetic 2-level tree (subject folder -> quiz files) so it can
 * flow through the exact same ContentsBar/FileExplorer/search machinery as
 * the files.json-sourced tabs. Each quiz "file" carries its subject for
 * display purposes once a quiz is opened.
 */
export function buildQuizTree(entries: RawQuizManifestEntry[]): FileItem[] {
  const bySubject = new Map<string, FileItem[]>();
  for (const entry of entries) {
    if (!entry.subject || !entry.title || !entry.fileId) continue;
    const quizItem: FileItem = {
      id: entry.id || entry.fileId,
      name: entry.title,
      type: "file",
      driveId: entry.fileId,
      subject: entry.subject,
    };
    if (!bySubject.has(entry.subject)) bySubject.set(entry.subject, []);
    bySubject.get(entry.subject)!.push(quizItem);
  }
  return Array.from(bySubject.entries()).map(([subject, quizzes]) => ({
    id: `quiz-subject-${subject}`,
    name: subject,
    type: "folder" as const,
    driveId: "",
    children: quizzes,
  }));
}

/**
 * Flattens the raw files.json tree and returns the `limit` most recently
 * added files, sorted by their raw `addedAt` (lexicographically sortable
 * since it's YYYY-MM-DD). Run on the raw tree (before formatting) so the
 * date comparison stays a plain string sort.
 */
export function getRecentRawFiles(items: RawFileItem[], limit = 5): RawFileItem[] {
  const files: RawFileItem[] = [];
  function walk(list: RawFileItem[]) {
    for (const item of list) {
      if (item.type === "file" && item.addedAt) files.push(item);
      else if (item.type === "folder") walk(item.children ?? []);
    }
  }
  walk(items);
  return files.sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? "")).slice(0, limit);
}