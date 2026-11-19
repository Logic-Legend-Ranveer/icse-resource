import { Atom, BookOpen, Calculator, Dna, FlaskConical, Globe2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FileItem } from "../../types";

const CARD_ICONS: Record<string, LucideIcon> = {
  biology: Dna,
  chemistry: FlaskConical,
  physics: Atom,
  mathematics: Calculator,
  english: BookOpen,
  "history & civics": Globe2,
};

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

const CARD_ACCENTS: Record<string, CardAccent> = {
  physics: {
    idle: "border-indigo-500/20 bg-indigo-950/25 text-indigo-200/90 hover:border-indigo-400/40 hover:bg-indigo-950/45 hover:text-indigo-100",
    active: "border-indigo-400/60 bg-indigo-500/20 text-indigo-100 shadow-xs",
    iconIdle: "text-indigo-400",
    iconActive: "text-indigo-300",
  },
  mathematics: {
    idle: "border-violet-500/20 bg-violet-950/25 text-violet-200/90 hover:border-violet-400/40 hover:bg-violet-950/45 hover:text-violet-100",
    active: "border-violet-400/60 bg-violet-500/20 text-violet-100 shadow-xs",
    iconIdle: "text-violet-400",
    iconActive: "text-violet-300",
  },
  chemistry: {
    idle: "border-emerald-500/20 bg-emerald-950/25 text-emerald-200/90 hover:border-emerald-400/40 hover:bg-emerald-950/45 hover:text-emerald-100",
    active: "border-emerald-400/60 bg-emerald-500/20 text-emerald-100 shadow-xs",
    iconIdle: "text-emerald-400",
    iconActive: "text-emerald-300",
  },
  biology: {
    idle: "border-teal-500/20 bg-teal-950/25 text-teal-200/90 hover:border-teal-400/40 hover:bg-teal-950/45 hover:text-teal-100",
    active: "border-teal-400/60 bg-teal-500/20 text-teal-100 shadow-xs",
    iconIdle: "text-teal-400",
    iconActive: "text-teal-300",
  },
  english: {
    idle: "border-sky-500/20 bg-sky-950/25 text-sky-200/90 hover:border-sky-400/40 hover:bg-sky-950/45 hover:text-sky-100",
    active: "border-sky-400/60 bg-sky-500/20 text-sky-100 shadow-xs",
    iconIdle: "text-sky-400",
    iconActive: "text-sky-300",
  },
  "history & civics": {
    idle: "border-amber-500/20 bg-amber-950/25 text-amber-200/90 hover:border-amber-400/40 hover:bg-amber-950/45 hover:text-amber-100",
    active: "border-amber-400/60 bg-amber-500/20 text-amber-100 shadow-xs",
    iconIdle: "text-amber-400",
    iconActive: "text-amber-300",
  },
};

function iconForCard(name: string): LucideIcon {
  return CARD_ICONS[name.trim().toLowerCase()] ?? BookOpen;
}

function accentForCard(name: string): CardAccent {
  return CARD_ACCENTS[name.trim().toLowerCase()] ?? DEFAULT_ACCENT;
}

interface ContentsBarProps {
  items: FileItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  variant: "sidebar" | "inline";
}

export default function ContentsBar({ items, activeId, onSelect, variant }: ContentsBarProps) {
  if (items.length === 0) return null;

  if (variant === "sidebar") {
    return (
      <aside className="fixed bottom-0 left-0 top-[108px] z-40 hidden w-73 flex-col gap-2 overflow-y-auto border-r border-border midnight/60 backdrop-blur-md p-3 md:flex">
        {items.map((item) => (
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
      {items.map((item) => (
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
