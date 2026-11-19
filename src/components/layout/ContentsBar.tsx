import { useMemo } from "react";
import {
  Atom,
  BookOpen,
  Briefcase,
  Calculator,
  Code2,
  Dna,
  Dumbbell,
  FlaskConical,
  Globe2,
  Landmark,
  Languages,
  Library,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FileItem } from "../../types";

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
  "physical education",
  "other subjects",
  "other_subjects",
  "other featured books and notes",
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
  "physical education": Dumbbell,
  "other subjects": BookOpen,
  other_subjects: BookOpen,
  "other featured books and notes": BookOpen,
};

const DEFAULT_BADGE = "bg-amber-500/12 text-amber-400 ring-amber-400/25";

const ICON_BADGES: Record<string, string> = {
  // STEM
  physics: "bg-indigo-500/12 text-indigo-400 ring-indigo-400/25",
  chemistry: "bg-emerald-500/12 text-emerald-400 ring-emerald-400/25",
  biology: "bg-teal-500/12 text-teal-400 ring-teal-400/25",
  mathematics: "bg-violet-500/12 text-violet-400 ring-violet-400/25",

  // Languages
  english: "bg-sky-500/12 text-sky-400 ring-sky-400/25",
  "english language": "bg-cyan-500/12 text-cyan-400 ring-cyan-400/25",
  "english literature": "bg-blue-500/12 text-blue-400 ring-blue-400/25",
  hindi: "bg-rose-500/12 text-rose-400 ring-rose-400/25",

  // Humanities
  "history & civics": "bg-amber-500/12 text-amber-400 ring-amber-400/25",
  geography: "bg-orange-500/12 text-orange-400 ring-orange-400/25",
  economics: "bg-yellow-500/12 text-yellow-300 ring-yellow-400/25",

  // Commerce, Tech & PE
  "commercial studies": "bg-purple-500/12 text-purple-400 ring-purple-400/25",
  "commercial applications": "bg-fuchsia-500/12 text-fuchsia-400 ring-fuchsia-400/25",
  "computer applications": "bg-cyan-500/12 text-cyan-300 ring-cyan-400/25",
  "physical education": "bg-lime-500/12 text-lime-400 ring-lime-400/25",

  // Other
  "other subjects": "bg-slate-500/12 text-slate-300 ring-slate-400/20",
  other_subjects: "bg-slate-500/12 text-slate-300 ring-slate-400/20",
  "other featured books and notes": "bg-amber-500/12 text-amber-400 ring-amber-400/25",
};

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function sortOrderIndex(name: string): number {
  const idx = SUBJECT_ORDER.indexOf(normalizeKey(name));
  return idx === -1 ? SUBJECT_ORDER.length : idx;
}

function iconForCard(name: string): LucideIcon {
  return CARD_ICONS[normalizeKey(name)] ?? BookOpen;
}

function badgeForCard(name: string): string {
  return ICON_BADGES[normalizeKey(name)] ?? DEFAULT_BADGE;
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
  const badgeClass = badgeForCard(item.name);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-all duration-200 cursor-pointer ${
        orientation === "horizontal" ? "min-w-[10rem]" : "w-full"
      } ${
        isActive
          ? "border-[#4D4787] bg-gradient-to-b from-[#1B1F3A] to-[#111528] text-white shadow-[inset_0_1px_0_0_rgba(196,193,255,0.28),inset_0_-1px_0_0_rgba(4,6,16,0.75)]"
          : "border-[#252342] bg-gradient-to-b from-[#121627]/90 to-[#0B0E18]/90 text-slate-300 shadow-[inset_0_1px_0_0_rgba(165,163,235,0.09),inset_0_-1px_0_0_rgba(2,4,10,0.65)] hover:border-[#383463] hover:from-[#161B30] hover:to-[#0E1220] hover:text-slate-100 hover:shadow-[inset_0_1px_0_0_rgba(185,182,252,0.16),inset_0_-1px_0_0_rgba(2,4,10,0.7)]"
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-colors ${
          isActive
            ? "bg-indigo-500/20 text-indigo-300 ring-indigo-300/35"
            : badgeClass
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="truncate">{item.name}</span>
    </button>
  );
}
