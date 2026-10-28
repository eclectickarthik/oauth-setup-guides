"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function GenerateForm() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || status === "running") return;

    setStatus("running");
    setProgress([]);
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
            setProgress((prev) => [...prev, data.message]);
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

  return (
    <div className="mt-10 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-black dark:text-zinc-50">
        Don&apos;t see your app? Generate a new guide
      </h2>
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="App name or website (e.g. Notion, notion.so)"
          disabled={status === "running"}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={status === "running" || !input.trim()}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
        >
          {status === "running" ? "Generating…" : "Generate"}
        </button>
      </form>

      {progress.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          {progress.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      )}

      {status === "error" && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t generate a guide: {error}
        </p>
      )}
    </div>
  );
}
