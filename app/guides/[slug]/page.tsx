import { notFound } from "next/navigation";
import { getLibraryGuide } from "@/lib/library";
import { getGuideStore } from "@/lib/store";

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const guide =
    (await getLibraryGuide(slug)) ?? (await getGuideStore().get(slug));

  if (!guide) notFound();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {guide.appName}
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">{guide.summary}</p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            Setup steps
          </h2>
          <ol className="mt-3 space-y-3">
            {guide.steps.map((step, i) => (
              <li
                key={i}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-black dark:text-zinc-50">
                    {step.title}
                  </span>
                  <span className="text-xs uppercase text-zinc-500">
                    {step.actor}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
