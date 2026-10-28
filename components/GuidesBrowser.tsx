"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Guide } from "@/lib/schema";
import GenerateForm from "@/components/GenerateForm";

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  hard: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  gated: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

type Tab = "browse" | "generate";

export default function GuidesBrowser({ guides }: { guides: Guide[] }) {
  const [tab, setTab] = useState<Tab>("browse");
  const [query, setQuery] = useState("");
  const [generateSeed, setGenerateSeed] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guides;
    return guides.filter(
      (g) =>
        g.appName.toLowerCase().includes(q) || g.summary.toLowerCase().includes(q)
    );
  }, [guides, query]);

  function goGenerate(seed: string) {
    setGenerateSeed(seed);
    setTab("generate");
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setTab("browse")}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "browse"
              ? "border-black text-black dark:border-zinc-50 dark:text-zinc-50"
              : "border-transparent text-zinc-500 hover:text-black dark:text-zinc-500 dark:hover:text-zinc-50"
          }`}
        >
          Browse
        </button>
        <button
          type="button"
          onClick={() => setTab("generate")}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "generate"
              ? "border-black text-black dark:border-zinc-50 dark:text-zinc-50"
              : "border-transparent text-zinc-500 hover:text-black dark:text-zinc-500 dark:hover:text-zinc-50"
          }`}
        >
          Generate
        </button>
      </div>

      {tab === "browse" ? (
        <div className="mt-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides…"
            className="w-full rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />

          {/* Visibly contained scroll area — only this list scrolls; the
              tabs and search bar above stay put regardless of list length. */}
          <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-inner dark:border-zinc-800 dark:bg-zinc-950">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-500">
                <p>No guides match &quot;{query}&quot;.</p>
                <button
                  type="button"
                  onClick={() => goGenerate(query)}
                  className="mt-2 font-medium text-black underline hover:no-underline dark:text-zinc-50"
                >
                  Generate a guide for &quot;{query}&quot; instead
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filtered.map((guide) => (
                  <li key={guide.slug}>
                    <Link
                      href={`/guides/${guide.slug}`}
                      className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <div>
                        <span className="font-medium text-black dark:text-zinc-50">
                          {guide.appName}
                        </span>
                        <p className="text-sm text-zinc-500 dark:text-zinc-500">
                          {guide.summary}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_STYLES[guide.difficulty]}`}
                      >
                        {guide.difficulty}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <GenerateForm initialInput={generateSeed} />
      )}
    </div>
  );
}
