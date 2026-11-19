import { useMemo } from "react";
import {
  Atom,
  BookOpen,
  Briefcase,
  Calculator,
  Code2,
  Dna,
  FlaskConical,
  Globe2,
  Landmark,
  Languages,
  Library,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FileItem } from "../../types";

interface CardAccent {
  idle: string;
  active: string;
  iconIdle: string;
  iconActive: string;
}

const DEFAULT_ACCENT: CardAccent = {
  idle: "border-border bg-surface text-slate-300 hover:border-border-strong hover:bg-surface-hover hover:text-slate-100",
  active: "border-accent-indigo/50 bg-accent-indigo/15 text-accent-indigo-soft shadow-xs",
  iconIdle: "text-amber-400",
  iconActive: "text-accent-indigo-soft",
};

const SUBJECT_ORDER: string[] = [
  "physics",
  "chemistry",
  "biology",
  "mathematics",
  "english",
  "english language",
  "english literature",
  "hindi",
  "history & civics",
  "geography",
  "economics",
  "commercial studies",
  "commercial applications",
  "computer applications",
  "other subjects",
  "other_subjects",
];

const CARD_ICONS: Record<string, LucideIcon> = {
  physics: Atom,
  chemistry: FlaskConical,
  biology: Dna,
  mathematics: Calculator,
  english: BookOpen,
  "english language": Languages,
  "english literature": Library,
  hindi: Languages,
  "history & civics": Landmark,
  geography: Globe2,
  economics: TrendingUp,
  "commercial studies": Briefcase,
  "commercial applications": Briefcase,
  "computer applications": Code2,
  "other subjects": BookOpen,
  "other_subjects": BookOpen,
};

const CARD_ACCENTS: Record<string, CardAccent> = {
  physics: {
    idle: "border-indigo-500/25 bg-indigo-950/25 text-indigo-200 hover:border-indigo-400/45 hover:bg-indigo-950/45 hover:text-indigo-100",
    active: "border-indigo-400/65 bg-indigo-500/20 text-indigo-100 shadow-xs",
    iconIdle: "text-indigo-400",
    iconActive: "text-indigo-300",
  },
  chemistry: {
    idle: "border-emerald-500/25 bg-emerald-950/25 text-emerald-200 hover:border-emerald-400/45 hover:bg-emerald-950/45 hover:text-emerald-100",
    active: "border-emerald-400/65 bg-emerald-500/20 text-emerald-100 shadow-xs",
    iconIdle: "text-emerald-400",
    iconActive: "text-emerald-300",
  },
  biology: {
    idle: "border-teal-500/25 bg-teal-950/25 text-teal-200 hover:border-teal-400/45 hover:bg-teal-950/45 hover:text-teal-100",
    active: "border-teal-400/65 bg-teal-500/20 text-teal-100 shadow-xs",
    iconIdle: "text-teal-400",
    iconActive: "text-teal-300",
  },
  mathematics: {
    idle: "border-violet-500/25 bg-violet-950/25 text-violet-200 hover:border-violet-400/45 hover:bg-violet-950/45 hover:text-violet-100",
    active: "border-violet-400/65 bg-violet-500/20 text-violet-100 shadow-xs",
    iconIdle: "text-violet-400",
    iconActive: "text-violet-300",
  },
  english: {
    idle: "border-sky-500/25 bg-sky-950/25 text-sky-200 hover:border-sky-400/45 hover:bg-sky-950/45 hover:text-sky-100",
    active: "border-sky-400/65 bg-sky-500/20 text-sky-100 shadow-xs",
    iconIdle: "text-sky-400",
    iconActive: "text-sky-300",
  },
  "english language": {
    idle: "border-cyan-500/25 bg-cyan-950/25 text-cyan-200 hover:border-cyan-400/45 hover:bg-cyan-950/45 hover:text-cyan-100",
    active: "border-cyan-400/65 bg-cyan-500/20 text-cyan-100 shadow-xs",
    iconIdle: "text-cyan-400",
    iconActive: "text-cyan-300",
  },
  "english literature": {
    idle: "border-blue-500/25 bg-blue-950/25 text-blue-200 hover:border-blue-400/45 hover:bg-blue-950/45 hover:text-blue-100",
    active: "border-blue-400/65 bg-blue-500/20 text-blue-100 shadow-xs",
    iconIdle: "text-blue-400",
    iconActive: "text-blue-300",
  },
  hindi: {
    idle: "border-orange-500/25 bg-orange-950/25 text-orange-200 hover:border-orange-400/45 hover:bg-orange-950/45 hover:text-orange-100",
    active: "border-orange-400/65 bg-orange-500/20 text-orange-100 shadow-xs",
    iconIdle: "text-orange-400",
    iconActive: "text-orange-300",
  },
  "history & civics": {
    idle: "border-amber-500/25 bg-amber-950/25 text-amber-200 hover:border-amber-400/45 hover:bg-amber-950/45 hover:text-amber-100",
    active: "border-amber-400/65 bg-amber-500/20 text-amber-100 shadow-xs",
    iconIdle: "text-amber-400",
    iconActive: "text-amber-300",
  },
  geography: {
    idle: "border-lime-500/25 bg-lime-950/25 text-lime-200 hover:border-lime-400/45 hover:bg-lime-950/45 hover:text-lime-100",
    active: "border-lime-400/65 bg-lime-500/20 text-lime-100 shadow-xs",
    iconIdle: "text-lime-400",
    iconActive: "text-lime-300",
  },
  economics: {
    idle: "border-yellow-500/25 bg-yellow-950/25 text-yellow-200 hover:border-yellow-400/45 hover:bg-yellow-950/45 hover:text-yellow-100",
    active: "border-yellow-400/65 bg-yellow-500/20 text-yellow-100 shadow-xs",
    iconIdle: "text-yellow-400",
    iconActive: "text-yellow-300",
  },
  "commercial studies": {
    idle: "border-rose-500/25 bg-rose-950/25 text-rose-200 hover:border-rose-400/45 hover:bg-rose-950/45 hover:text-rose-100",
    active: "border-rose-400/65 bg-rose-500/20 text-rose-100 shadow-xs",
    iconIdle: "text-rose-400",
    iconActive: "text-rose-300",
  },
  "commercial applications": {
    idle: "border-pink-500/25 bg-pink-950/25 text-pink-200 hover:border-pink-400/45 hover:bg-pink-950/45 hover:text-pink-100",
    active: "border-pink-400/65 bg-pink-500/20 text-pink-100 shadow-xs",
    iconIdle: "text-pink-400",
    iconActive: "text-pink-300",
  },
  "computer applications": {
    idle: "border-fuchsia-500/25 bg-fuchsia-950/25 text-fuchsia-200 hover:border-fuchsia-400/45 hover:bg-fuchsia-950/45 hover:text-fuchsia-100",
    active: "border-fuchsia-400/65 bg-fuchsia-500/20 text-fuchsia-100 shadow-xs",
    iconIdle: "text-fuchsia-400",
    iconActive: "text-fuchsia-300",
  },
  "other subjects": {
    idle: "border-slate-500/25 bg-slate-900/50 text-slate-300 hover:border-slate-400/45 hover:bg-slate-800/70 hover:text-slate-100",
    active: "border-slate-400/60 bg-slate-700/35 text-slate-100 shadow-xs",
    iconIdle: "text-slate-400",
    iconActive: "text-slate-200",
  },
  "other_subjects": {
    idle: "border-slate-500/25 bg-slate-900/50 text-slate-300 hover:border-slate-400/45 hover:bg-slate-800/70 hover:text-slate-100",
    active: "border-slate-400/60 bg-slate-700/35 text-slate-100 shadow-xs",
    iconIdle: "text-slate-400",
    iconActive: "text-slate-200",
  },
};

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function sortOrderIndex(name: string): number {
  const key = normalizeKey(name);
  const idx = SUBJECT_ORDER.indexOf(key);
  return idx === -1 ? SUBJECT_ORDER.length : idx;
}

function iconForCard(name: string): LucideIcon {
  return CARD_ICONS[normalizeKey(name)] ?? BookOpen;
}

function accentForCard(name: string): CardAccent {
  return CARD_ACCENTS[normalizeKey(name)] ?? DEFAULT_ACCENT;
}

interface ContentsBarProps {
  items: FileItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  variant: "sidebar" | "inline";
}

export default function ContentsBar({ items, activeId, onSelect, variant }: ContentsBarProps) {
  const orderedItems = useMemo(() => {
    return items
      .map((item, index) => ({ item, index, rank: sortOrderIndex(item.name) }))
      .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index))
      .map((entry) => entry.item);
  }, [items]);

  if (orderedItems.length === 0) return null;

  if (variant === "sidebar") {
    return (
      <aside className="fixed bottom-0 left-0 top-[108px] z-40 hidden w-73 flex-col gap-2 overflow-y-auto border-r border-border midnight/60 backdrop-blur-md p-3 md:flex">
        {orderedItems.map((item) => (
          <CardButton
            key={item.id}
            item={item}
            isActive={item.id === activeId}
            onClick={() => onSelect(item.id)}
            orientation="vertical"
          />
        ))}
      </aside>
    );
  }

  return (
    <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:hidden">
      {orderedItems.map((item) => (
        <CardButton
          key={item.id}
          item={item}
          isActive={item.id === activeId}
          onClick={() => onSelect(item.id)}
          orientation="horizontal"
        />
      ))}
    </div>
  );
}

function CardButton({
  item,
  isActive,
  onClick,
  orientation,
}: {
  item: FileItem;
  isActive: boolean;
  onClick: () => void;
  orientation: "vertical" | "horizontal";
}) {
  const Icon = iconForCard(item.name);
  const accent = accentForCard(item.name);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition-all cursor-pointer ${
        orientation === "horizontal" ? "min-w-[9.5rem]" : "w-full"
      } ${isActive ? accent.active : accent.idle}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${isActive ? accent.iconActive : accent.iconIdle}`} />
      <span className="truncate">{item.name}</span>
    </button>
  );
}
