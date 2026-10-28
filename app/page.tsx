import Link from "next/link";
import { getLibraryGuides } from "@/lib/library";
import GenerateForm from "@/components/GenerateForm";

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  hard: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  gated: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default async function Home() {
  const guides = await getLibraryGuides();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          OAuth Setup Guides
        </h1>
        <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">
          Find out how hard it is to set up and get approved for an OAuth app
          with a provider — before you start.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}`}
              className="rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-black dark:text-zinc-50">
                  {guide.appName}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_STYLES[guide.difficulty]}`}
                >
                  {guide.difficulty}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {guide.summary}
              </p>
            </Link>
          ))}
        </div>

        <GenerateForm />
      </main>
    </div>
  );
}
