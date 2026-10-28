import { getLibraryGuides } from "@/lib/library";
import { getGuideStore } from "@/lib/store";
import GuidesBrowser from "@/components/GuidesBrowser";

// Without this, Next.js prerenders this page once at build time (it has no
// per-request input), so a guide generated live after the last deploy never
// shows up in Browse until the next build — even though the guide itself
// renders fine at its own dynamic /guides/[slug] URL. Every request needs
// the current contents of the guide store, not a build-time snapshot.
export const dynamic = "force-dynamic";

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
        <GuidesBrowser guides={guides} />
      </main>
    </div>
  );
}
