import { promises as fs } from "fs";
import path from "path";
import { parseComparisonMarkdown } from "@/lib/comparison";

const COMPARISONS_DIR = path.join(process.cwd(), "docs", "comparisons");
const FILES = ["github.md", "google.md"];

const SECTION_STYLES: Record<string, string> = {
  Wrong: "border-red-300 dark:border-red-700/60",
  Outdated: "border-orange-300 dark:border-orange-700/60",
  "Unsupported (not covered by the answer key)": "border-zinc-300 dark:border-zinc-700",
  Correct: "border-green-300 dark:border-green-700/60",
};

export default async function ComparePage() {
  const files = await Promise.all(
    FILES.map(async (f) => {
      const raw = await fs.readFile(path.join(COMPARISONS_DIR, f), "utf-8").catch(() => null);
      return raw ? parseComparisonMarkdown(raw) : null;
    })
  );
  const comparisons = files.filter((c) => c !== null);

  return (
    <div className="flex flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
          Agent vs. hand-checked
        </h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
          For GitHub and Google — the two library guides actually hand-tested
          against the real provider UI — an LLM judge compares a freshly
          live-generated guide against that hand-checked answer key, claim by
          claim. This is the evidence behind the gaps documented in the
          README, not a cherry-picked summary: regenerate with{" "}
          <code className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-800">
            npm run generate
          </code>{" "}
          /{" "}
          <code className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-800">
            npm run compare
          </code>{" "}
          and the numbers below can change. The Google guide is generated from
          the input &ldquo;Gmail&rdquo;, the same API the answer key covers.
        </p>

        <div className="mt-10 space-y-12">
          {comparisons.map((c) => (
            <section key={c.appName}>
              <h2 className="text-base font-semibold text-black dark:text-zinc-50">
                {c.appName}
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{c.summary}</p>

              <div className="mt-4 space-y-4">
                {c.sections
                  .filter((s) => s.claims.length > 0)
                  .map((s) => (
                    <div
                      key={s.title}
                      className={`rounded-lg border-l-4 bg-white p-4 dark:bg-zinc-950 ${SECTION_STYLES[s.title] ?? "border-zinc-300 dark:border-zinc-700"}`}
                    >
                      <h3 className="text-sm font-medium text-black dark:text-zinc-50">
                        {s.title} ({s.claims.length})
                      </h3>
                      <ul className="mt-2 space-y-2">
                        {s.claims.map((claim, i) => (
                          <li key={i} className="text-sm">
                            <span className="text-zinc-500 dark:text-zinc-500">
                              [{claim.section}]
                            </span>{" "}
                            <span className="text-zinc-800 dark:text-zinc-200">
                              {claim.text}
                            </span>
                            {claim.reason && (
                              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">
                                {claim.reason}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                {c.missed.length > 0 && (
                  <div className="rounded-lg border-l-4 border-amber-300 bg-white p-4 dark:border-amber-700/60 dark:bg-zinc-950">
                    <h3 className="text-sm font-medium text-black dark:text-zinc-50">
                      Missed from the hand-checked guide ({c.missed.length})
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {c.missed.map((m, i) => (
                        <li key={i}>
                          <span className="text-zinc-500 dark:text-zinc-500">
                            [{m.section}]
                          </span>{" "}
                          <span className="text-zinc-800 dark:text-zinc-200">{m.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
