import { generateGuide, slugify } from "@/lib/agent";
import { needsConfirmation, resolveApp } from "@/lib/resolve";
import { getLibraryGuides } from "@/lib/library";
import { getGuideStore } from "@/lib/store";
import { verifyGuide } from "@/lib/verifier";

export const maxDuration = 120;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  let body: {
    input?: string;
    confirmed?: boolean;
    forceRaw?: boolean;
    forceRegenerate?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const input = (body.input ?? "").trim().slice(0, 200);
  if (!input) {
    return new Response("Missing \"input\" (app name or website)", { status: 400 });
  }
  const confirmed = body.confirmed === true;
  const forceRaw = body.forceRaw === true;
  const forceRegenerate = body.forceRegenerate === true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)));

      try {
        send("progress", { message: `Resolving "${input}"…`, service: "gemini" });
        const resolved = await resolveApp(input, (message, service) =>
          send("progress", { message, service })
        );

        // Low confidence and the client hasn't confirmed yet — ask before
        // spending a full research+draft run on a guess that might be
        // for the wrong product entirely.
        if (needsConfirmation(resolved, confirmed)) {
          send("confirm", {
            canonicalName: resolved.canonical_name,
            officialDomain: resolved.official_domain,
            rawInput: input,
          });
          return;
        }

        // "Search anyway": use exactly what the user typed as the name
        // (so the title isn't silently "corrected"), but keep whatever
        // official_domain resolve found for the link-validation safety net.
        const effective = forceRaw ? { ...resolved, canonical_name: input } : resolved;

        if (!forceRaw && resolved.corrected_from) {
          send("resolved", {
            canonicalName: effective.canonical_name,
            rawInput: resolved.corrected_from,
          });
        }

        // If the resolved app already has a hand-checked library guide,
        // serve that directly rather than regenerating — it's both
        // cheaper and strictly more trustworthy than a fresh agent run.
        const library = await getLibraryGuides();
        const targetSlug = slugify(effective.canonical_name);
        const libraryMatch = library.find(
          (g) => g.slug === targetSlug || slugify(g.appName) === targetSlug
        );
        if (libraryMatch) {
          send("done", { slug: libraryMatch.slug, guide: libraryMatch });
          return;
        }

        // A guide for this app may already have been generated. Spending a
        // full research+draft run to silently overwrite it would waste
        // Gemini/Tavily calls on no new information most of the time — ask
        // first, same as the low-confidence resolve step does, unless the
        // client has already said to regenerate.
        if (!forceRegenerate) {
          const store = getGuideStore();
          const existing =
            (await store.get(targetSlug)) ??
            (await store.get(`${targetSlug}-generated`));
          if (existing) {
            send("exists", { slug: existing.slug, guide: existing });
            return;
          }
        }

        const drafted = await generateGuide(effective, (message, service) => {
          send("progress", { message, service });
        });

        send("progress", { message: "Verifying claims against sources…", service: "verifier" });
        const { guide: verified, changes, unverified } = await verifyGuide(
          drafted,
          (message, service) => send("progress", { message, service })
        );
        const guide = {
          ...verified,
          verifierChanges: changes,
          verifierUnverified: unverified,
        };

        const takenSlugs = new Set(library.map((g) => g.slug));
        if (takenSlugs.has(guide.slug)) {
          guide.slug = `${guide.slug}-generated`;
        }

        await getGuideStore().set(guide.slug, guide);

        send("done", { slug: guide.slug, guide });
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : "Generation failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
