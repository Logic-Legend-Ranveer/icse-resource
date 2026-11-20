import { FileText, Folder, Image as ImageIcon } from "lucide-react";
import { getFileBadge, isImageFile, stripFileExtension } from "../../lib/fileTree";
import type { SearchEntry } from "../../lib/search";
import QuizIcon from "../icons/QuizIcon";

interface SearchResultsViewProps {
  query: string;
  results: SearchEntry[];
  onSelect: (entry: SearchEntry) => void;
  isQuizSearch?: boolean;
}

export default function SearchResultsView({ query, results, onSelect, isQuizSearch = false }: SearchResultsViewProps) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <p>
          Search results for <span className="text-slate-300">"{query}"</span>
        </p>
        {results.length > 0 && (
          <span className="text-xs text-slate-500">
            {results.length} {results.length === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
        {results.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {isQuizSearch ? "No quizzes match this search." : "No files or folders match this search."}
          </p>
        ) : (
          results.map((entry, index) => {
            const isFolder = entry.item.type === "folder";
            const badge = getFileBadge(entry.item, entry.tabId);
            const displayName = isFolder ? entry.item.name : stripFileExtension(entry.item.name);

            const Icon = isFolder
              ? Folder
              : badge?.kind === "quiz"
                ? QuizIcon
                : isImageFile(entry.item.name)
                  ? ImageIcon
                  : FileText;

            return (
              <button
                key={`${entry.tabId}-${entry.item.id}`}
                type="button"
                onClick={() => onSelect(entry)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover ${
                  index === results.length - 1 ? "" : "border-b border-border"
                }`}
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
                  <span className="block truncate text-xs text-slate-500">{entry.breadcrumb.join(" · ")}</span>
                </span>
                {badge && (
                  <span className="flex shrink-0 items-center gap-2">
                    {entry.item.sizeLabel && (
                      <span className="hidden text-xs text-slate-500 sm:inline">{entry.item.sizeLabel}</span>
                    )}
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ring-1 ring-inset ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}