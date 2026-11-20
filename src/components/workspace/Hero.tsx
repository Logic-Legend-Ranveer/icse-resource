import type { RefObject } from "react";
import { Search, X } from "lucide-react";

interface HeroProps {
  resourceCount: number;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  resultCount?: number;
  inputRef?: RefObject<HTMLInputElement | null>;
  isQuizTab?: boolean;
}

export default function Hero({
  resourceCount,
  searchQuery,
  onSearchQueryChange,
  resultCount,
  inputRef,
  isQuizTab = false,
}: HeroProps) {
  const hasQuery = searchQuery.trim().length > 0;
  const placeholderText = isQuizTab
    ? `Search ${resourceCount.toLocaleString()} quizzes…`
    : `Search ${resourceCount.toLocaleString()} resources…`;

  return (
    <section className="mx-auto max-w-3xl pt-16 text-center md:pt-12">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
        Everything for{" "}
        <span className="whitespace-nowrap bg-gradient-to-r from-accent-indigo-soft to-accent-violet-soft bg-clip-text text-transparent">
          ICSE Class 10.
        </span>
      </h1>
      <p className="mx-auto mt-3 max-w-2xl text-xs leading-relaxed text-slate-400 sm:text-base">
        Notes, book solutions, board PYQs, prelim papers, and chapter quizzes — searchable and ready to read right in
        your browser.
      </p>

      {/* Primary centered search focal point */}
      <div className="mx-auto mt-7 max-w-2xl">
        <div
          onClick={() => inputRef?.current?.focus()}
          className="group flex h-13 cursor-text items-center gap-3 rounded-2xl border border-border-strong bg-surface/90 px-4 shadow-lg shadow-black/20 backdrop-blur-md transition-all focus-within:border-accent-indigo/60 focus-within:bg-surface focus-within:shadow-glow-indigo hover:border-accent-indigo/40 sm:h-14 sm:px-5"
        >
          <Search className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-focus-within:text-accent-indigo-soft" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && hasQuery) {
                e.stopPropagation();
                onSearchQueryChange("");
              }
            }}
            placeholder={placeholderText}
            aria-label={placeholderText}
            className="w-full min-w-0 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none sm:text-base"
          />

          {hasQuery ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSearchQueryChange("");
                inputRef?.current?.focus();
              }}
              aria-label="Clear search"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden shrink-0 rounded-md border border-border-strong bg-midnight/80 px-2 py-0.5 font-mono text-[11px] text-slate-500 sm:inline-block">
              /
            </kbd>
          )}
        </div>

        <p className="mt-2.5 text-xs text-slate-500">
          {hasQuery && typeof resultCount === "number" ? (
            isQuizTab ? (
              <>
                Showing{" "}
                <span className="font-medium text-slate-300">
                  {resultCount >= 100 ? "100+" : resultCount.toLocaleString()}
                </span>{" "}
                matching {resultCount === 1 ? "quiz" : "quizzes"}
              </>
            ) : (
              <>
                Showing{" "}
                <span className="font-medium text-slate-300">
                  {resultCount >= 100 ? "100+" : resultCount.toLocaleString()}
                </span>{" "}
                matching {resultCount === 1 ? "resource" : "resources"} across all tabs
              </>
            )
          ) : isQuizTab ? (
            "Search interactive chapter quizzes across all subjects"
          ) : (
            "Search across syllabi, study notes, prelims, specimen papers & book solutions"
          )}
        </p>
      </div>
    </section>
  );
}