"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type ProgressEntry = { message: string; service?: "tavily" | "gemini" };

const SERVICE_LABEL: Record<string, string> = {
  tavily: "Tavily",
  gemini: "Gemini",
};

const SERVICE_STYLES: Record<string, string> = {
  tavily: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  gemini: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
};

function ServiceBadge({ service }: { service?: "tavily" | "gemini" }) {
  if (!service) return null;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SERVICE_STYLES[service]}`}>
      {SERVICE_LABEL[service]}
    </span>
  );
}

export default function GenerateForm() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || status === "running") return;

    setStatus("running");
    setProgress([]);
    setExpanded(false);
    setError("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: value }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const raw of events) {
          const eventLine = raw.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;

          const eventType = eventLine.slice("event:".length).trim();
          const data = JSON.parse(dataLine.slice("data:".length).trim());

          if (eventType === "progress") {
            setProgress((prev) => [...prev, { message: data.message, service: data.service }]);
          } else if (eventType === "done") {
            router.push(`/guides/${data.slug}`);
            return;
          } else if (eventType === "error") {
            setStatus("error");
            setError(data.message);
            return;
          }
        }
      }

      setStatus("idle");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Generation failed");
    }
  }

  const current = progress[progress.length - 1];

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="App name or website (e.g. Notion, notion.so)"
          disabled={status === "running"}
          className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-black outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={status === "running" || !input.trim()}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
        >
          {status === "running" ? "Generating…" : "Generate"}
        </button>
      </form>

      {current && (
        <div className="mt-4 text-sm">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            <ServiceBadge service={current.service} />
            <span className="flex-1 truncate">{current.message}</span>
            <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-600">
              {expanded ? "Hide details ▴" : "Show details ▾"}
            </span>
          </button>

          {expanded && (
            <ul className="mt-2 space-y-1.5 border-t border-zinc-200 pt-2 dark:border-zinc-800">
              {progress.map((entry, i) => (
                <li key={i} className="flex items-start gap-2 text-zinc-500 dark:text-zinc-500">
                  <ServiceBadge service={entry.service} />
                  <span>{entry.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {status === "error" && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t generate a guide: {error}
        </p>
      )}
    </div>
  );
}
