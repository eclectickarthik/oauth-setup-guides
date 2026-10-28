import { generateGuide } from "@/lib/agent";
import { getLibraryGuides } from "@/lib/library";
import { getGuideStore } from "@/lib/store";

export const maxDuration = 120;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  let body: { input?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const input = (body.input ?? "").trim().slice(0, 200);
  if (!input) {
    return new Response("Missing \"input\" (app name or website)", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)));

      try {
        const guide = await generateGuide(input, (message, service) => {
          send("progress", { message, service });
        });

        const library = await getLibraryGuides();
        const taken = new Set(library.map((g) => g.slug));
        if (taken.has(guide.slug)) {
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
