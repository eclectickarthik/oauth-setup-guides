import Link from "next/link";
import { getLibraryGuides } from "@/lib/library";
import { getGuideStore } from "@/lib/store";
import GenerateForm from "@/components/GenerateForm";

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  hard: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  gated: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default async function GuidesPage() {
  const library = await getLibraryGuides();
  const generated = await getGuideStore().list();

  const librarySlugs = new Set(library.map((g) => g.slug));
  const extraGenerated = generated.filter((g) => !librarySlugs.has(g.slug));
  const guides = [...library, ...extraGenerated].sort((a, b) =>
    a.appName.localeCompare(b.appName)
  );

  return (
    <div className="flex flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
          Guides
        </h1>

        <ul className="mt-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
          {guides.map((guide) => (
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

        <h2 className="mt-10 text-lg font-semibold text-black dark:text-zinc-50">
          Generate
        </h2>
        <GenerateForm />
      </main>
    </div>
  );
}
