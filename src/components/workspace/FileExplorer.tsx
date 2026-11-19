import { useMemo } from "react";
import { ChevronRight, Home } from "lucide-react";
import type { FileItem } from "../../types";
import FileRow from "./FileRow";

interface FileExplorerProps {
  rootItems: FileItem[];
  rootLabel: string;
  path: FileItem[];
  onOpenFolder: (item: FileItem) => void;
  onGoToCrumb: (index: number) => void;
  onOpenFile: (item: FileItem) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (item: FileItem) => void;
}

const getExplorerAccent = (label: string) => {
  const lower = label.toLowerCase();

  if (lower.includes("physics") || lower.includes("math")) {
    return {
      crumb: "text-indigo-300 hover:bg-indigo-950/60 hover:text-indigo-200",
      card: "border-indigo-500/25 bg-indigo-950/20",
    };
  }
  if (lower.includes("chem") || lower.includes("bio") || lower.includes("env")) {
    return {
      crumb: "text-emerald-300 hover:bg-emerald-950/60 hover:text-emerald-200",
      card: "border-emerald-500/25 bg-emerald-950/20",
    };
  }
  if (lower.includes("hist") || lower.includes("geo") || lower.includes("civ")) {
    return {
      crumb: "text-amber-300 hover:bg-amber-950/60 hover:text-amber-200",
      card: "border-amber-500/25 bg-amber-950/20",
    };
  }
  if (lower.includes("eng") || lower.includes("lit") || lower.includes("lang")) {
    return {
      crumb: "text-sky-300 hover:bg-sky-950/60 hover:text-sky-200",
      card: "border-sky-500/25 bg-sky-950/20",
    };
  }
  if (
    lower.includes("pyq") ||
    lower.includes("specimen") ||
    lower.includes("official") ||
    lower.includes("cfq") ||
    lower.includes("quiz") ||
    lower.includes("sample")
  ) {
    return {
      crumb: "text-violet-300 hover:bg-violet-950/60 hover:text-violet-200",
      card: "border-violet-500/25 bg-violet-950/20",
    };
  }

  return {
    crumb: "text-slate-300 hover:bg-surface-hover hover:text-slate-100",
    card: "border-border bg-surface",
  };
};

export default function FileExplorer({
  rootItems,
  rootLabel,
  path,
  onOpenFolder,
  onGoToCrumb,
  onOpenFile,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: FileExplorerProps) {
  const currentItems = useMemo<FileItem[]>(() => {
    if (path.length === 0) return rootItems;
    return path[path.length - 1].children ?? [];
  }, [path, rootItems]);

  const activeContextName = path.length > 0 ? path[path.length - 1].name : rootLabel;
  const accent = getExplorerAccent(activeContextName);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-1 text-sm text-slate-400">
        <button
          type="button"
          onClick={() => onGoToCrumb(-1)}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors ${accent.crumb}`}
        >
          <Home className="h-3.5 w-3.5" />
          {rootLabel}
        </button>
        {path.map((crumb, index) => {
          const crumbAccent = getExplorerAccent(crumb.name);
          const isLast = index === path.length - 1;
          return (
            <span key={crumb.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              <button
                type="button"
                onClick={() => onGoToCrumb(index)}
                className={`rounded px-1.5 py-0.5 transition-colors ${
                  isLast ? `${crumbAccent.crumb} font-medium` : "hover:bg-surface-hover hover:text-slate-200"
                }`}
              >
                {crumb.name}
              </button>
            </span>
          );
        })}
      </div>

      <div className={`mt-3 overflow-hidden rounded-xl border transition-colors ${accent.card}`}>
        {currentItems.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">This folder is empty.</p>
        ) : (
          currentItems.map((item, index) => (
            <FileRow
              key={item.id}
              item={item}
              onOpenFolder={onOpenFolder}
              onOpenFile={onOpenFile}
              isLast={index === currentItems.length - 1}
              selectionMode={selectionMode}
              isSelected={selectedIds?.has(item.id)}
              onToggleSelect={onToggleSelect}
            />
          ))
        )}
      </div>
    </section>
  );
}
