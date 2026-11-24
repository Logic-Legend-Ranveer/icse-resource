export type TabId = "syllabus" | "study" | "quizzes" | "official-cisce-resources" | "about" | "pyq-prelims" | "book-solutions";

/** All tabs that resolve to a browsable FileItem tree (i.e. everything but About). */
export type TreeTabId = Exclude<TabId, "about">;

export interface TabDef {
  id: TabId;
  label: string;
}

export const TAB_DEFS: TabDef[] = [
  { id: "syllabus", label: "ICSE 2027 Syllabus" },
  { id: "study", label: "Study Assets" },
  { id: "quizzes", label: "Interactive Quizzes" },
  { id: "pyq-prelims", label: "Previous Year Pre-Board Papers"},
  { id: "official-cisce-resources", label: "Official CISCE Resources" },
  { id: "book-solutions", label: "Book Solutions" },
  { id: "about", label: "About" }
];

export const TAB_LABELS: Record<TabId, string> = Object.fromEntries(TAB_DEFS.map((t) => [t.id, t.label])) as Record<
  TabId,
  string
>;

/**
 * The tabs sourced from files.json are matched by the *real* Drive
 * folder name (which doesn't always match the tab's display label exactly —
 * e.g. the sample-papers folder is actually named "Sample Papers & PYQs
 * from CICSE"). Matching is case-insensitive/trimmed in lib/fileTree.ts.
 */
export const TAB_SOURCE_FOLDER_NAME: Record<Exclude<TreeTabId, "quizzes">, string> = {
  syllabus: "ICSE 2027 Syllabus",
  study: "Study Assets",
  "pyq-prelims": "PYQ Prelims",
  "official-cisce-resources": "Official CISCE Resources",
  "book-solutions": "ICSE Book Solutions"
};
