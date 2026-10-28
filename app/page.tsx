import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-3xl px-6 py-24 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-500">
          Composio
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-black sm:text-5xl dark:text-zinc-50">
          Take-home Assignment
          <br />
          <span className="text-zinc-500 dark:text-zinc-400">
            OAuth setup live guides
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-zinc-600 dark:text-zinc-400">
          Find out how hard it is to set up and get approved for an OAuth app
          with a provider — before you start. Hand-checked guides for
          GitHub, Slack, Google, and LinkedIn, plus a live agent that
          researches and generates a new guide for any app in real time.
        </p>

        <div className="mt-10 flex justify-center">
          <Link
            href="/guides"
            className="rounded-md bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            Browse guides
          </Link>
        </div>

        <div className="mt-16 grid gap-4 text-left sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-medium text-black dark:text-zinc-50">
              Guide library
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Easy, medium, hard, and gated examples — each claim tagged
              tested, docs, or uncertain, with a source URL.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-medium text-black dark:text-zinc-50">
              Live generation
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Type any app name — Tavily searches and reads its developer
              docs, Gemini drafts the guide, streamed live.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
