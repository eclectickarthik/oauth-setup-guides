import type { Evidence } from "@/lib/schema";

const STYLES: Record<string, string> = {
  tested: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  docs: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  uncertain: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  unverified: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
};

export default function EvidenceBadge({
  evidence,
  sources,
}: {
  evidence: Evidence;
  sources?: string[];
}) {
  const source = sources?.[0];

  // A "docs" claim with no actual URL to point to isn't verifiable the way
  // the badge implies — label it honestly instead of overclaiming.
  if (evidence === "docs" && !source) {
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES.unverified}`}>
        unverified
      </span>
    );
  }

  if (evidence === "docs" && source) {
    return (
      <a
        href={source}
        target="_blank"
        rel="noopener noreferrer"
        title={source}
        className={`rounded-full px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline ${STYLES.docs}`}
      >
        docs
      </a>
    );
  }

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[evidence]}`}>
      {evidence}
    </span>
  );
}
