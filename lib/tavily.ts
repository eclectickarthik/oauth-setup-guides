// Minimal Tavily REST client — plain fetch rather than an SDK, since the
// two endpoints we need (search, extract) are simple and well-documented.

const BASE_URL = "https://api.tavily.com";

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export type TavilyExtractResult = {
  url: string;
  raw_content: string;
};

async function tavilyPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set");

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tavily ${path} failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function tavilySearch(
  query: string,
  maxResults = 4
): Promise<TavilySearchResult[]> {
  const data = await tavilyPost<{ results: TavilySearchResult[] }>("/search", {
    query,
    search_depth: "basic",
    max_results: maxResults,
  });
  return data.results ?? [];
}

export async function tavilyExtract(urls: string[]): Promise<TavilyExtractResult[]> {
  if (urls.length === 0) return [];
  const data = await tavilyPost<{
    results: TavilyExtractResult[];
    failed_results: { url: string; error: string }[];
  }>("/extract", {
    urls,
    extract_depth: "basic",
    format: "text",
  });
  return data.results ?? [];
}
