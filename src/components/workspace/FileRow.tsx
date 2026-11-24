import { useMemo } from "react";
import { Check, ChevronRight, Eye, FileText, Folder, Image as ImageIcon } from "lucide-react";
import type { FileItem } from "../../types";
import { countFiles, getFileBadge, isImageFile, stripFileExtension } from "../../lib/fileTree";
import QuizIcon from "../icons/QuizIcon";

interface FileRowProps {
  item: FileItem;
  onOpenFolder: (item: FileItem) => void;
  onOpenFile: (item: FileItem) => void;
  isLast?: boolean;
  /** When true, clicking a file toggles selection instead of opening it (used by the Quizzes tab). */
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (item: FileItem) => void;
}

export default function FileRow({
  item,
  onOpenFolder,
  onOpenFile,
  isLast,
  selectionMode,
  isSelected,
  onToggleSelect,
}: FileRowProps) {
  const isFolder = item.type === "folder";
  const badge = useMemo(
    () => (isFolder ? null : getFileBadge(item, selectionMode ? "quizzes" : undefined)),
    [isFolder, item, selectionMode],
  );

  const folderCount = useMemo(() => (isFolder ? countFiles(item.children ?? []) : 0), [isFolder, item.children]);

  const displayName = isFolder ? item.name : stripFileExtension(item.name);

  const Icon = isFolder
    ? Folder
    : badge?.kind === "quiz"
      ? QuizIcon
      : isImageFile(item.name)
        ? ImageIcon
        : FileText;

  const metaLine = useMemo(() => {
    if (isFolder) {
      const countLabel =
        folderCount > 0
          ? `${folderCount} ${selectionMode ? (folderCount === 1 ? "quiz" : "quizzes") : folderCount === 1 ? "resource" : "resources"}`
          : "";
      return [countLabel, item.sizeLabel].filter(Boolean).join(" · ");
    }
    return [item.sizeLabel, item.updatedAt].filter(Boolean).join(" · ");
  }, [isFolder, folderCount, selectionMode, item.sizeLabel, item.updatedAt]);

  function handleClick() {
    if (isFolder) {
      onOpenFolder(item);
    } else if (selectionMode) {
      onToggleSelect?.(item);
    } else {
      onOpenFile(item);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover ${
        isLast ? "" : "border-b border-border"
      } ${!isFolder && selectionMode && isSelected ? "bg-accent-violet/10" : ""}`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          isFolder
            ? "bg-accent-indigo/10 text-accent-indigo-soft"
            : badge?.kind === "quiz"
              ? "bg-accent-violet/15 text-accent-violet-soft ring-1 ring-inset ring-accent-violet/25"
              : "bg-white/5 text-slate-400"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-200">{displayName}</span>
        {metaLine && <span className="block truncate text-xs text-slate-500">{metaLine}</span>}
      </span>

      {isFolder ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
      ) : selectionMode ? (
        <span className="flex shrink-0 items-center gap-2.5">
          {badge && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ring-1 ring-inset ${badge.className}`}
            >
              {badge.label}
            </span>
          )}
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
              isSelected ? "border-accent-violet bg-accent-violet text-white" : "border-border-strong bg-midnight"
            }`}
          >
            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
          </span>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-2.5">
          {badge && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ring-1 ring-inset ${badge.className}`}
            >
              {badge.label}
            </span>
          )}
          <Eye className="h-4 w-4 text-slate-600" />
        </span>
      )}
    </button>
  );
}