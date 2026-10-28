"use client";

import { useState } from "react";

// Renders guide prose with every URL turned into a click-to-copy chip.
// Copy rather than navigate: URLs in guide text are mostly values to paste
// somewhere (redirect/callback URIs, scope strings like
// https://www.googleapis.com/auth/gmail.readonly), not pages to visit —
// cited pages already have their own links in Sources.
// Requires a host character after "//" so prose like "must start with
// https://" isn't turned into an empty chip.
const URL_PATTERN = /https?:\/\/[a-z0-9[][^\s<>"'`]*/gi;
const TRAILING_PUNCTUATION = /[.,;:!?'"\]]+$/;

// Splits off sentence punctuation the regex swallowed ("…/callback.") and a
// closing paren that belongs to the prose, not the URL ("(see https://x.com)").
function splitTrailing(raw: string): [string, string] {
  let url = raw;
  let trailing = "";
  for (;;) {
    const punct = url.match(TRAILING_PUNCTUATION);
    if (punct) {
      trailing = punct[0] + trailing;
      url = url.slice(0, -punct[0].length);
      continue;
    }
    if (url.endsWith(")") && !url.includes("(")) {
      trailing = ")" + trailing;
      url = url.slice(0, -1);
      continue;
    }
    return [url, trailing];
  }
}

function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Click to copy"
      aria-label={copied ? `Copied ${url}` : `Copy ${url}`}
      className="inline break-all rounded bg-zinc-100 px-1 py-0.5 text-left font-mono text-[0.85em] text-zinc-800 underline decoration-dotted underline-offset-2 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
    >
      {url}
      <span className="ml-1 font-sans text-xs text-zinc-500 no-underline dark:text-zinc-400">
        {copied ? "✓ copied" : "⧉"}
      </span>
    </button>
  );
}

export default function CopyableText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const [url, trailing] = splitTrailing(match[0]);
    parts.push(text.slice(last, match.index));
    parts.push(<CopyUrl key={match.index} url={url} />);
    parts.push(trailing);
    last = match.index + match[0].length;
  }
  if (parts.length === 0) return text;
  parts.push(text.slice(last));
  return <>{parts}</>;
}
