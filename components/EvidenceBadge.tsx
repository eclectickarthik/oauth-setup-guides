import type { Evidence } from "@/lib/schema";

const STYLES: Record<Evidence, string> = {
  tested: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  docs: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  uncertain: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
};

export default function EvidenceBadge({ evidence }: { evidence: Evidence }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[evidence]}`}>
      {evidence}
    </span>
  );
}
