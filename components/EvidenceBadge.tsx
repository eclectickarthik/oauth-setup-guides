import type { Evidence } from "@/lib/schema";

const STYLES: Record<string, string> = {
  hand_checked: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  doc_sourced: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  inferred: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  uncertain: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const LABEL: Record<string, string> = {
  hand_checked: "hand-checked",
  doc_sourced: "doc-sourced",
  inferred: "inferred",
  uncertain: "uncertain",
};

export default function EvidenceBadge({ evidence }: { evidence: Evidence }) {
  const title = evidence.note ?? evidence.sourceUrl ?? undefined;

  if (evidence.level === "doc_sourced" && evidence.sourceUrl) {
    return (
      <a
        href={evidence.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={evidence.sourceUrl}
        className={`rounded-full px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline ${STYLES.doc_sourced}`}
      >
        {LABEL.doc_sourced}
      </a>
    );
  }

  return (
    <span
      title={title}
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[evidence.level]}`}
    >
      {LABEL[evidence.level]}
    </span>
  );
}
