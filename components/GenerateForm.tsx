"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type ProgressEntry = { message: string; service?: "tavily" | "gemini" | "verifier" };
type ConfirmPrompt = { canonicalName: string; officialDomain: string; rawInput: string };
type ExistsPrompt = { slug: string; appName: string; generatedOn: string; rawInput: string };

const SERVICE_LABEL: Record<string, string> = {
  tavily: "Tavily",
  gemini: "Gemini",
  verifier: "Verifier",
};

const SERVICE_STYLES: Record<string, string> = {
  tavily: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  gemini: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  verifier: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
};

function ServiceBadge({ service }: { service?: "tavily" | "gemini" | "verifier" }) {
  if (!service) return null;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SERVICE_STYLES[service]}`}>
      {SERVICE_LABEL[service]}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400 dark:text-zinc-500"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2z"
      />
    </svg>
  );
}

export default function GenerateForm({ initialInput = "" }: { initialInput?: string }) {
  const router = useRouter();
  const [input, setInput] = useState(initialInput);
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [confirmPrompt, setConfirmPrompt] = useState<ConfirmPrompt | null>(null);
  const [existsPrompt, setExistsPrompt] = useState<ExistsPrompt | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function runGenerate(
    value: string,
    opts: { confirmed?: boolean; forceRaw?: boolean; forceRegenerate?: boolean } = {}
  ) {
    setStatus("running");
    setProgress([]);
    setExpanded(false);
    setError("");
    setConfirmPrompt(null);
    setExistsPrompt(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: value, ...opts }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let correctedFrom = "";

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
          } else if (eventType === "resolved") {
            correctedFrom = data.rawInput;
          } else if (eventType === "confirm") {
            setStatus("idle");
            setConfirmPrompt({
              canonicalName: data.canonicalName,
              officialDomain: data.officialDomain,
              rawInput: data.rawInput,
            });
            return;
          } else if (eventType === "exists") {
            setStatus("idle");
            setExistsPrompt({
              slug: data.slug,
              appName: data.guide.appName,
              generatedOn: data.guide.lastVerified,
              rawInput: value,
            });
            return;
          } else if (eventType === "done") {
            const query = correctedFrom ? `?from=${encodeURIComponent(correctedFrom)}` : "";
            router.push(`/guides/${data.slug}${query}`);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || status === "running") return;
    runGenerate(value);
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

      {confirmPrompt && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700/60 dark:bg-amber-900/20">
          <p className="text-amber-900 dark:text-amber-200">
            Did you mean <span className="font-medium">{confirmPrompt.canonicalName}</span>{" "}
            ({confirmPrompt.officialDomain})?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => runGenerate(confirmPrompt.canonicalName, { confirmed: true })}
              className="rounded-md bg-black px-4 py-1.5 text-sm font-medium text-white dark:bg-zinc-50 dark:text-black"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() =>
                runGenerate(confirmPrompt.rawInput, { confirmed: true, forceRaw: true })
              }
              className="rounded-md border border-amber-300 px-4 py-1.5 text-sm font-medium text-amber-900 dark:border-amber-700/60 dark:text-amber-200"
            >
              Search anyway
            </button>
          </div>
        </div>
      )}

      {existsPrompt && (
        <div className="mt-4 rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-zinc-700 dark:text-zinc-300">
            A guide for <span className="font-medium">{existsPrompt.appName}</span> already
            exists (generated {existsPrompt.generatedOn}).
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/guides/${existsPrompt.slug}`)}
              className="rounded-md bg-black px-4 py-1.5 text-sm font-medium text-white dark:bg-zinc-50 dark:text-black"
            >
              View it
            </button>
            <button
              type="button"
              onClick={() =>
                runGenerate(existsPrompt.rawInput, { confirmed: true, forceRegenerate: true })
              }
              className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}

      {current && (
        <div className="mt-4 text-sm">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            {status === "running" && <Spinner />}
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
