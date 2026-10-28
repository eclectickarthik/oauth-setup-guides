import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { MODEL } from "./config";
import { extractJson } from "./json-utils";
import { tavilySearch } from "./tavily";

// Runs before any research/generation. The guide-generation pipeline used
// to take the raw user input (a possibly misspelled app name, or a URL)
// and search on it directly — so a typo like "reddddit" could surface a
// third-party scraper site whose domain happens to contain the brand name,
// and that site's URL would get presented as the app's own website. This
// resolves the raw input to a real product first, so every later step
// works from a verified identity instead of whatever ranked first.

export const ResolvedAppSchema = z.object({
  canonical_name: z.string().min(1),
  // Not min(1): a low-confidence first pass may genuinely not have an
  // official domain yet (that's what triggers the search fallback below,
  // and why enforceOfficialLinks/isOfficialUrl already treat "" as
  // "no confirmed domain" rather than assuming non-empty).
  official_domain: z.string(),
  developer_portal_url: z.string().url().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  corrected_from: z.string().nullable(),
  // The specific product the user named inside a larger company (e.g.
  // "Gmail" -> canonical_name "Google", product "Gmail"). Without this,
  // canonicalizing to the company dropped the product entirely and a
  // "Gmail" request came back as a generic Drive/Workspace guide. Optional
  // so it stays out of the slug: Gmail and Google still share one guide URL.
  product: z.string().nullable().optional(),
});
export type ResolvedApp = z.infer<typeof ResolvedAppSchema>;

const RESOLVE_JSON_SCHEMA = {
  type: "object",
  properties: {
    canonical_name: { type: "string" },
    official_domain: { type: "string" },
    developer_portal_url: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    product: { type: "string" },
  },
  required: ["canonical_name", "official_domain", "confidence"],
};

const RESOLVE_SYSTEM = `You identify the real software product or company a developer means by a (possibly misspelled or ambiguous) name or URL, for the purpose of finding its official OAuth developer documentation.

Rules:
- Fix typos and resolve to the most likely real product (e.g. "reddddit" -> canonical_name "Reddit").
- official_domain must be the company's OWN domain (e.g. "reddit.com") — never a third-party tool, scraper, browser extension, wrapper, review site, or tutorial site about the product, even if such a site would rank well in search results. If you are not certain of the real official domain, say so via a lower confidence rather than guessing one that merely contains the brand name.
- Set confidence "low" if the input could plausibly mean more than one distinct real product, or you cannot confidently identify a real product at all.
- Set confidence "high" only if the identification is unambiguous.
- If the input names a specific product of a larger company (e.g. "Gmail", "Google Drive", "Outlook", "Azure DevOps"), canonical_name is the company ("Google", "Microsoft") and product is that product's name ("Gmail"). Omit product when the input is just the company itself or a single-product company (e.g. "GitHub", "Slack", "Reddit").
- developer_portal_url is the company's own developer/API docs entry point if you know it for certain — omit the field entirely if you don't know a real one. Never guess a URL.
- Output only the JSON described, nothing else.`;

type ProgressFn = (message: string, service?: "tavily" | "gemini") => void;

async function askGemini(
  ai: GoogleGenAI,
  rawInput: string,
  extraContext?: string
): Promise<{
  canonical_name: string;
  official_domain: string;
  developer_portal_url?: string;
  confidence: string;
  product?: string;
}> {
  const input = extraContext
    ? `App name or website as typed by the user: "${rawInput}"\n\nWeb search results for context:\n${extraContext}`
    : `App name or website as typed by the user: "${rawInput}"`;

  const interaction = await ai.interactions.create({
    model: MODEL,
    input,
    system_instruction: RESOLVE_SYSTEM,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: RESOLVE_JSON_SCHEMA,
    },
  });

  return JSON.parse(extractJson(interaction.output_text ?? "{}"));
}

function toResolvedApp(
  raw: {
    canonical_name?: string;
    official_domain?: string;
    developer_portal_url?: string;
    confidence?: string;
    product?: string;
  },
  rawInput: string
): ResolvedApp {
  const canonicalName = (raw.canonical_name || rawInput).trim();
  const correctedFrom =
    canonicalName.toLowerCase() !== rawInput.trim().toLowerCase() ? rawInput.trim() : null;
  const confidence =
    raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low"
      ? raw.confidence
      : "low";

  return ResolvedAppSchema.parse({
    canonical_name: canonicalName,
    official_domain: (raw.official_domain || "").trim(),
    developer_portal_url: raw.developer_portal_url || null,
    confidence,
    corrected_from: correctedFrom,
    product: raw.product?.trim() || null,
  });
}

// Pure, exported separately so the "low confidence -> confirm step"
// branching can be unit tested without exercising the route handler.
export function needsConfirmation(resolved: ResolvedApp, confirmed: boolean): boolean {
  return resolved.confidence === "low" && !confirmed;
}

export async function resolveApp(
  rawInput: string,
  onProgress?: ProgressFn
): Promise<ResolvedApp> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let result = toResolvedApp(await askGemini(ai, rawInput), rawInput);

  // Only reach for search when the plain LLM call wasn't confident —
  // keeps the common case (a well-known, correctly- or near-correctly-
  // spelled app name) to a single cheap call.
  if (result.confidence === "low") {
    onProgress?.(`Not sure which "${rawInput}" is meant — searching to confirm…`, "tavily");
    try {
      const searchResults = await tavilySearch(`${rawInput} official website`, 5);
      const context = searchResults
        .map((r) => `${r.title} — ${r.url}\n${r.content.slice(0, 300)}`)
        .join("\n\n");
      result = toResolvedApp(await askGemini(ai, rawInput, context), rawInput);
    } catch {
      // Search failed — keep the original (low-confidence) result rather
      // than fail the whole resolve step over an optional confirmation.
    }
  }

  return result;
}
