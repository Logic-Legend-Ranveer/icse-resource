import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Menu, Search, Sparkles } from "lucide-react";
import { useUI } from "../../context/UIContext";
import { TAB_DEFS } from "../../data/tabs";
import type { TabId } from "../../data/tabs";

interface NavbarProps {
  activeTabId: TabId;
  onSelectTab: (tabId: TabId) => void;
  searchQuery: string;
  onFocusSearch: () => void;
}

interface IndicatorMetrics {
  left: number;
  width: number;
  height: number;
  visible: boolean;
}

export default function Navbar({ activeTabId, onSelectTab, searchQuery, onFocusSearch }: NavbarProps) {
  const { toggleSidebar } = useUI();
  const hasQuery = searchQuery.trim().length > 0;

  const tabListRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const hasMountedRef = useRef(false);

  const [indicator, setIndicator] = useState<IndicatorMetrics>({
    left: 0,
    width: 0,
    height: 0,
    visible: false,
  });
  const [animateIndicator, setAnimateIndicator] = useState(false);

  const measureActiveTab = useCallback(() => {
    const activeEl = tabButtonRefs.current[activeTabId];
    if (!activeEl) return;

    setIndicator({
      left: activeEl.offsetLeft,
      width: activeEl.offsetWidth,
      height: activeEl.offsetHeight,
      visible: true,
    });

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      requestAnimationFrame(() => setAnimateIndicator(true));
    }
  }, [activeTabId]);

  useLayoutEffect(() => {
    measureActiveTab();
    const activeEl = tabButtonRefs.current[activeTabId];
    activeEl?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTabId, measureActiveTab]);

  useEffect(() => {
    window.addEventListener("resize", measureActiveTab);
    document.fonts?.ready.then(measureActiveTab).catch(() => {});
    return () => window.removeEventListener("resize", measureActiveTab);
  }, [measureActiveTab]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-midnight/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSidebar}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-100 md:hidden"
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-indigo to-accent-violet shadow-glow-indigo">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-slate-100">ICSE Resources</p>
              <p className="hidden text-xs text-slate-500 sm:block">Free study materials, made simple</p>
            </div>
          </div>
        </div>

        {/* Compact shortcut pill that jumps to and focuses the hero search bar */}
        <button
          type="button"
          onClick={onFocusSearch}
          className="flex max-w-[11rem] shrink-0 items-center gap-2 rounded-lg border border-border bg-surface/80 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-border-strong hover:bg-surface hover:text-slate-200 sm:max-w-[14rem]"
          title="Focus search (Ctrl+K or /)"
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{hasQuery ? searchQuery : "Search…"}</span>
          <kbd className="hidden shrink-0 rounded border border-border-strong bg-midnight px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:inline">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Desktop tab row — on mobile the same tabs live in the hamburger drawer instead */}
      <div
        ref={tabListRef}
        className="relative hidden border-t border-border md:flex md:h-11 md:items-center md:gap-1 md:overflow-x-auto md:px-6"
      >
        {indicator.visible && (
          <span
            aria-hidden="true"
            style={{
              width: `${indicator.width}px`,
              height: `${indicator.height}px`,
              transform: `translate3d(${indicator.left}px, -50%, 0)`,
            }}
            className={`pointer-events-none absolute left-0 top-1/2 z-0 rounded-md bg-gradient-to-r from-accent-indigo to-accent-violet shadow-glow-indigo ${
              animateIndicator ? "transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" : ""
            }`}
          />
        )}

        {TAB_DEFS.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabButtonRefs.current[tab.id] = el;
              }}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`relative z-10 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                isActive ? "text-white" : "text-slate-400 hover:bg-surface-hover hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}