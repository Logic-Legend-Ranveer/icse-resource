import { History, X } from "lucide-react";
import { getFileBadge, stripFileExtension } from "../../lib/fileTree";
import { formatRelativeTime } from "../../lib/recentHistory";
import type { RecentHistoryEntry } from "../../lib/recentHistory";

interface ContinueSectionProps {
  entries: RecentHistoryEntry[];
  onOpenEntry: (entry: RecentHistoryEntry) => void;
  onRemoveEntry: (id: string) => void;
  onClearAll: () => void;
}

export default function ContinueSection({
  entries,
  onOpenEntry,
  onRemoveEntry,
  onClearAll,
}: ContinueSectionProps) {
  if (entries.length === 0) return null;

  return (
    <section className="mt-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-1.5 font-medium text-slate-400">
          <History className="h-3.5 w-3.5 text-accent-indigo-soft" />
          <span>Continue where you left off</span>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className="rounded px-1.5 py-0.5 text-slate-500 transition-colors hover:bg-surface-hover hover:text-slate-300"
        >
          Clear
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {entries.map((entry) => {
          const badge = getFileBadge(entry.item, entry.tabId);
          const displayName = stripFileExtension(entry.item.name);
          const subLine = [entry.contextLabel || "Recently opened", formatRelativeTime(entry.openedAt)].join(" · ");

          return (
            <div
              key={entry.item.id}
              onClick={() => onOpenEntry(entry)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenEntry(entry);
                }
              }}
              className="group flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-surface/90 px-3 py-2 text-left transition-all hover:border-border-strong hover:bg-surface-hover sm:px-3.5 sm:py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium leading-snug text-slate-200 group-hover:text-white">
                  {displayName}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{subLine}</p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {badge && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ring-1 ring-inset ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveEntry(entry.item.id);
                  }}
                  aria-label={`Remove ${displayName} from history`}
                  className="flex h-5 w-5 items-center justify-center rounded text-slate-600 opacity-70 transition-opacity hover:bg-white/5 hover:text-slate-300 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}