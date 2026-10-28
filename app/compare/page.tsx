import { promises as fs } from "fs";
import path from "path";
import { parseComparisonMarkdown } from "@/lib/comparison";

const COMPARISONS_DIR = path.join(process.cwd(), "docs", "comparisons");
const FILES = ["github.md", "google.md"];

// Handwritten notes taken while hand-testing each provider's setup in its
// real console, shown beside that provider's report. Keyed by the report's
// appName (the "# Comparison: <name>" heading).
const HAND_NOTES: Record<string, { src: string; alt: string }> = {
  GitHub: {
    src: "/compare/github-notes.png",
    alt: "Handwritten notes from hand-testing GitHub app registration: redirect URL limit, optional checkboxes, client secrets, webhook and permission settings",
  },
  Google: {
    src: "/compare/google-notes.png",
    alt: "Handwritten notes from hand-testing Google Cloud Console: consent screen audience, test-user limit, OAuth client creation, Gmail scope warning",
  },
};

const SECTION_STYLES: Record<string, string> = {
  Wrong: "border-red-300 dark:border-red-700/60",
  Outdated: "border-orange-300 dark:border-orange-700/60",
  "Unsupported (not covered by the answer key)":
    "border-zinc-300 dark:border-zinc-700",
  Correct: "border-green-300 dark:border-green-700/60",
};

export default async function ComparePage() {
  const files = await Promise.all(
    FILES.map(async (f) => {
      const raw = await fs
        .readFile(path.join(COMPARISONS_DIR, f), "utf-8")
        .catch(() => null);
      return raw ? parseComparisonMarkdown(raw) : null;
    }),
  );
  const comparisons = files.filter((c) => c !== null);

  return (
    <div className="flex flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-5xl px-6 py-16">
        <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
          Agent vs. hand-checked
        </h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
          For GitHub and Google — the two library guides actually hand-tested
          against the real provider UI — an LLM judge compares a freshly
          live-generated guide against that hand-checked answer key, claim by
          claim. This is the evidence behind the gaps documented in the README,
          not a cherry-picked summary: regenerate with{" "}
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
        <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
          These comparisons were made with the help of Claude Code, which built
          and ran the generate and compare scripts. A Gemini model gives each
          claim its label. Beside each report are my handwritten notes from
          hand-testing that provider&rsquo;s setup.
        </p>

        <div className="mt-10 space-y-12">
          {comparisons.map((c) => {
            const notes = HAND_NOTES[c.appName];
            return (
              <section
                key={c.appName}
                className="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px]"
              >
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-black dark:text-zinc-50">
                    {c.appName}
                  </h2>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {c.summary}
                  </p>

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
                              <span className="text-zinc-800 dark:text-zinc-200">
                                {m.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {notes && (
                  <figure className="md:sticky md:top-6 md:self-start">
                    <a
                      href={notes.src}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={notes.src}
                        alt={notes.alt}
                        loading="lazy"
                        className="max-h-[70vh] w-full rounded-lg border border-zinc-200 bg-white object-contain object-top dark:border-zinc-800"
                      />
                    </a>
                    <figcaption className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                      Hand-check notes for {c.appName}. Click to open full size.
                    </figcaption>
                  </figure>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
