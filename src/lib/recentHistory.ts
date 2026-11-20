import type { FileItem } from "../types";

const STORAGE_KEY = "icse_continue_history_v1";
const MAX_ITEMS = 4;

export interface RecentHistoryEntry {
  item: FileItem;
  quizItems?: FileItem[];
  tabId?: string;
  contextLabel?: string;
  openedAt: number;
}

function toSlimFileItem(item: FileItem): FileItem {
  return {
    id: item.id,
    name: item.name,
    type: "file",
    driveId: item.driveId,
    sizeLabel: item.sizeLabel,
    updatedAt: item.updatedAt,
    subject: item.subject,
  };
}

export function loadRecentHistory(): RecentHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RecentHistoryEntry => {
      if (!entry?.item?.id || !entry?.item?.name || typeof entry?.openedAt !== "number") {
        return false;
      }
      if (entry.quizItems !== undefined) {
        if (!Array.isArray(entry.quizItems) || entry.quizItems.length === 0) return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}

export function saveRecentHistory(entries: RecentHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ITEMS)));
  } catch {
    // Ignore storage quota or private-browsing errors
  }
}

export function pushRecentHistory(
  current: RecentHistoryEntry[],
  item: FileItem,
  tabId?: string,
  contextLabel?: string,
): RecentHistoryEntry[] {
  if (item.type !== "file") return current;

  const slimItem = toSlimFileItem(item);

  const filtered = current.filter((entry) => {
    if (entry.item.id === slimItem.id) return false;
    if (slimItem.driveId && entry.item.driveId === slimItem.driveId) return false;
    return true;
  });

  const next: RecentHistoryEntry[] = [
    {
      item: slimItem,
      tabId,
      contextLabel,
      openedAt: Date.now(),
    },
    ...filtered,
  ].slice(0, MAX_ITEMS);

  saveRecentHistory(next);
  return next;
}

export function pushRecentQuizBundle(
  current: RecentHistoryEntry[],
  items: FileItem[],
  subject: string,
  contextLabel?: string,
): RecentHistoryEntry[] {
  const validFiles = items.filter((item) => item.type === "file");
  if (validFiles.length === 0) return current;

  if (validFiles.length === 1) {
    return pushRecentHistory(current, validFiles[0], "quizzes", contextLabel);
  }

  const slimQuizItems = validFiles.map(toSlimFileItem);
  const sortedKey = slimQuizItems
    .map((q) => q.id)
    .sort()
    .join("+");
  const bundleId = `quiz-bundle:${sortedKey}`;
  const resolvedSubject = subject.trim() || validFiles[0].subject || "Quiz";

  const bundleItem: FileItem = {
    id: bundleId,
    name: `${resolvedSubject} Quiz(${slimQuizItems.length} Chapters)`,
    type: "file",
    driveId: "",
    subject: resolvedSubject,
  };

  const filtered = current.filter((entry) => entry.item.id !== bundleId);

  const next: RecentHistoryEntry[] = [
    {
      item: bundleItem,
      quizItems: slimQuizItems,
      tabId: "quizzes",
      contextLabel,
      openedAt: Date.now(),
    },
    ...filtered,
  ].slice(0, MAX_ITEMS);

  saveRecentHistory(next);
  return next;
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}