import { GoogleGenAI } from "@google/genai";
import { Guide, GuideSchema } from "./schema";
import { tavilyExtract, tavilySearch } from "./tavily";

const MODEL = process.env.LLM_MODEL || "gemini-3.5-flash-lite";

// Research budget: Gemini's own Google Search grounding tool turned out to
// have zero free quota on this project even though plain generation worked
// fine, so research runs through Tavily (search + extract) instead, and
// Gemini only sees the resulting plain text — no tools, no grounding.
const SEARCH_QUERIES = 2;
const EXTRACT_CAP = 4;

// Search results are often dominated by review sites, social posts, and
// third-party SDK wrappers rather than the provider's own docs. Rank
// candidates before picking which ones to spend an extract call on.
const JUNK_DOMAINS = [
  "trustpilot.com",
  "reddit.com",
  "quora.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "linkedin.com",
  "g2.com",
  "capterra.com",
  "producthunt.com",
  "glassdoor.com",
  "wikipedia.org",
  "medium.com",
];
const DOC_HINTS = ["docs", "developer", "developers", "api"];

function scoreResult(result: { url: string; score?: number }, appSlug: string): number {
  let score = result.score ?? 0;
  let host: string;
  try {
    host = new URL(result.url).hostname.toLowerCase();
  } catch {
    return -100;
  }
  if (JUNK_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) score -= 10;
  if (DOC_HINTS.some((h) => host.includes(h))) score += 3;
  if (appSlug && host.includes(appSlug)) score += 2;
  return score;
}

const EVIDENCE_ENUM = ["tested", "docs", "uncertain"];

const CLAIM_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    evidence: { type: "string", enum: EVIDENCE_ENUM },
    sources: { type: "array", items: { type: "string" } },
  },
  required: ["text", "evidence", "sources"],
};

const STEP_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    detail: { type: "string" },
    actor: { type: "string", enum: ["agent", "human"] },
    evidence: { type: "string", enum: EVIDENCE_ENUM },
    sources: { type: "array", items: { type: "string" } },
  },
  required: ["title", "detail", "actor", "evidence", "sources"],
};

const BLOCKER_SCHEMA = {
  type: "object",
  properties: {
    problem: { type: "string" },
    fix: { type: "string" },
    evidence: { type: "string", enum: EVIDENCE_ENUM },
    sources: { type: "array", items: { type: "string" } },
  },
  required: ["problem", "fix", "evidence", "sources"],
};

// JSON Schema enforced on the drafting call via response_format. Mirrors
// lib/schema.ts's GuideSchema — kept hand-written since the Gemini schema
// dialect only supports a subset of JSON Schema (no minLength, etc).
const GUIDE_JSON_SCHEMA = {
  type: "object",
  properties: {
    slug: { type: "string" },
    appName: { type: "string" },
    website: { type: "string" },
    developerPortalUrl: { type: "string" },
    summary: { type: "string" },
    decision: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              pickWhen: { type: "array", items: { type: "string" } },
              tradeoff: { type: "string" },
            },
            required: ["name", "pickWhen", "tradeoff"],
          },
        },
        recommendation: { type: "string" },
      },
      required: ["question", "options", "recommendation"],
    },
    difficulty: { type: "string", enum: ["easy", "medium", "hard", "gated"] },
    difficultyReason: { type: "string" },
    time: {
      type: "object",
      properties: {
        setup: { type: "string" },
        approvalWait: { type: "string" },
        notes: { type: "string" },
      },
      required: ["setup", "approvalWait"],
    },
    whenReviewIsNeeded: { type: "array", items: CLAIM_SCHEMA },
    requirements: { type: "array", items: CLAIM_SCHEMA },
    steps: { type: "array", items: STEP_SCHEMA },
    blockers: { type: "array", items: BLOCKER_SCHEMA },
    agentCanDo: { type: "array", items: { type: "string" } },
    humanMustDo: { type: "array", items: { type: "string" } },
    openQuestions: { type: "array", items: { type: "string" } },
    generatedBy: { type: "string", enum: ["agent"] },
    lastVerified: { type: "string" },
  },
  required: [
    "slug",
    "appName",
    "website",
    "developerPortalUrl",
    "summary",
    "difficulty",
    "difficultyReason",
    "time",
    "whenReviewIsNeeded",
    "requirements",
    "steps",
    "blockers",
    "agentCanDo",
    "humanMustDo",
    "openQuestions",
    "generatedBy",
    "lastVerified",
  ],
};

const DRAFT_SYSTEM = `You convert extracted OAuth developer-docs pages into a single structured guide for a developer who wants to set up an OAuth app with this provider (e.g. Google, Slack, GitHub) so an AI agent's users can connect it.

Look specifically for: how to create the OAuth app / register a client, redirect URI rules, scopes, app review/verification/marketplace-listing requirements, rate limits, any partner-program or paid-tier gate, and whether the provider offers more than one app type or setup path.

Rules:
- Only cite URLs from the "Available sources" list you're given — never invent or guess a URL. Every claim needs a source URL from that list, unless you are directly reasoning from the extracted content with nothing to point to — then mark it "uncertain" and add it to openQuestions instead of guessing. You never have evidence "tested" — only "docs" or "uncertain".
- Keep hands-on setup time (time.setup) and approval/review wait time (time.approvalWait) separate — never merge them.
- Tag every step "agent" (an AI coding agent could do this) or "human" (requires login, payment, legal action, or submitting for review).
- Only include "decision" if the sources describe more than one distinct setup path — omit it entirely otherwise.
- "difficulty" is one of easy/medium/hard/gated, reasoned from how much review/verification/paid-tier gating is involved.
- "generatedBy" must be exactly "agent". "lastVerified" must be today's date in ISO format (YYYY-MM-DD).
- "slug" must be lowercase-kebab-case derived from the app name.
- If the extracted pages don't cover something (e.g. rate limits), say so in openQuestions rather than guessing.`;

export type ProgressFn = (message: string) => void;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "guide"
  );
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

type ResearchResult = { notes: string; sourceUrls: string[] };

async function research(
  appInput: string,
  onProgress: ProgressFn,
  tavilyCounter: { count: number }
): Promise<ResearchResult> {
  const queries = [
    `${appInput} OAuth app setup developer docs`,
    `${appInput} app review verification`,
  ].slice(0, SEARCH_QUERIES);

  onProgress(`Searching for "${appInput}" OAuth setup docs…`);
  onProgress(`Searching for "${appInput}" review and verification policy…`);

  tavilyCounter.count += queries.length;
  const searchResults = await Promise.all(queries.map((q) => tavilySearch(q, 5)));

  const appSlug = slugify(appInput);
  const seen = new Set<string>();
  const candidates = searchResults
    .flat()
    .filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .sort((a, b) => scoreResult(b, appSlug) - scoreResult(a, appSlug));

  const selected = candidates.slice(0, EXTRACT_CAP);
  const topUrls = selected.map((r) => r.url);

  if (topUrls.length === 0) {
    return { notes: "No search results found.", sourceUrls: [] };
  }

  for (const r of selected) {
    onProgress(`Found: ${r.title} (${r.url})`);
  }

  onProgress(`Reading ${topUrls.length} page(s)…`);
  tavilyCounter.count += topUrls.length;
  const extracted = await tavilyExtract(topUrls);

  const notes = extracted
    .map((r) => `Source: ${r.url}\n${r.raw_content.slice(0, 6000)}`)
    .join("\n\n---\n\n");

  return {
    notes: notes || "Extraction failed for all pages.",
    sourceUrls: extracted.map((r) => r.url),
  };
}

async function draft(
  ai: GoogleGenAI,
  appInput: string,
  researchNotes: string,
  sourceUrls: string[],
  onProgress: ProgressFn,
  callCounter: { count: number },
  retryNote?: string
): Promise<string> {
  onProgress(
    retryNote
      ? "Output didn't match the required format — asking the model to fix it…"
      : "Drafting the guide from extracted pages…"
  );

  const sourcesList = sourceUrls.length
    ? sourceUrls.map((u) => `- ${u}`).join("\n")
    : "(none — extraction found no usable pages)";

  const base = `App: "${appInput}"\n\nAvailable sources (only cite these):\n${sourcesList}\n\nExtracted page content:\n${researchNotes}`;
  const input = retryNote ? `${base}\n\n${retryNote}` : `${base}\n\nProduce the guide now.`;

  callCounter.count++;
  const interaction = await ai.interactions.create({
    model: MODEL,
    input,
    system_instruction: DRAFT_SYSTEM,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: GUIDE_JSON_SCHEMA,
    },
  });

  return interaction.output_text ?? "";
}

export async function generateGuide(
  appInput: string,
  onProgress: ProgressFn
): Promise<Guide> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const geminiCounter = { count: 0 };
  const tavilyCounter = { count: 0 };

  try {
    const { notes, sourceUrls } = await research(appInput, onProgress, tavilyCounter);

    let lastError = "";
    const tryParse = (raw: string): Guide | null => {
      try {
        const parsed = JSON.parse(extractJson(raw));
        parsed.generatedBy = "agent";
        parsed.lastVerified = new Date().toISOString().slice(0, 10);
        if (!parsed.slug) parsed.slug = slugify(appInput);
        const result = GuideSchema.safeParse(parsed);
        if (result.success) return result.data;
        lastError = result.error.message;
        return null;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        return null;
      }
    };

    const first = await draft(ai, appInput, notes, sourceUrls, onProgress, geminiCounter);
    const firstGuide = tryParse(first);
    if (firstGuide) return firstGuide;

    const second = await draft(
      ai,
      appInput,
      notes,
      sourceUrls,
      onProgress,
      geminiCounter,
      `Your previous output did not match the required schema. Error: ${lastError}\n\nProduce the corrected guide now.`
    );
    const secondGuide = tryParse(second);
    if (secondGuide) return secondGuide;

    throw new Error(`Agent failed to produce a valid guide: ${lastError}`);
  } finally {
    console.log(
      `[agent] "${appInput}": ${tavilyCounter.count} Tavily call(s), ${geminiCounter.count} Gemini call(s) (model=${MODEL})`
    );
  }
}
