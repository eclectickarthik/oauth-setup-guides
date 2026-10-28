import { GoogleGenAI } from "@google/genai";
import { Guide, GuideSchema } from "./schema";
import { tavilyExtract, tavilySearch } from "./tavily";

export const MODEL = process.env.LLM_MODEL || "gemini-3.5-flash-lite";

// Research budget: Gemini's own Google Search grounding tool turned out to
// have zero free quota on this project even though plain generation worked
// fine, so research runs through Tavily (search + extract) instead, and
// Gemini only sees the resulting plain text — no tools, no grounding.
const SEARCH_QUERIES = 2;
const INITIAL_EXTRACT_CAP = 4;
const FALLBACK_EXTRACT_CAP = 2;

// Per-page character budget sent to the model. Docs pages that bundle many
// topics (e.g. a single "brand verification" page that also covers
// restricted-scope verification near the bottom) can easily exceed a small
// limit — a prior 6000-char cutoff silently dropped exactly the
// restricted-scope/CASA section on Google's brand-verification page, past
// character 8783 on that page.
const PAGE_CHAR_LIMIT = 15000;

// If the initial research pass doesn't mention certain topics at all, a
// second, more targeted search runs before drafting — otherwise the agent
// tends to assume "doesn't apply" just because it didn't look hard enough.
// Two independent checks, since a provider can have review info but no
// scope-tier info (or vice versa) depending on which pages got extracted.
const REVIEW_KEYWORDS = /\breview\b|\bverif|\bmarketplace\b|\bpartner program\b/i;
const SCOPE_TIER_KEYWORDS =
  /\bsensitive scope|\brestricted scope|\bscope tier|\bsecurity assessment|\bCASA\b/i;

type FallbackCheck = { keywords: RegExp; query: string; label: string };
const FALLBACK_CHECKS: FallbackCheck[] = [
  {
    keywords: REVIEW_KEYWORDS,
    query: "app review verification marketplace review partner program",
    label: "review/verification",
  },
  {
    keywords: SCOPE_TIER_KEYWORDS,
    query: "sensitive restricted scope verification security assessment",
    label: "scope tiers",
  },
];

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

// A provider can have multiple products that technically say "OAuth" —
// e.g. Apple Ads (client_credentials, server-to-server access to your own
// ad account) vs. Sign in with Apple (authorization_code, end-user
// consent). A generic "<app> OAuth" search tends to match whichever page
// uses the word "OAuth" more prominently, not whichever is actually the
// end-user-facing product. These keyword sets catch that mismatch after
// extraction so a second, more targeted search can run.
const USER_DELEGATED_KEYWORDS =
  /\bauthorization code\b|\bsign[- ]?in with\b|\bconsent screen\b|\bredirect the user\b|\buser authoriz|\buser consent\b/i;
const CLIENT_CREDENTIALS_KEYWORDS =
  /\bclient[_ ]credentials\b|\bserver[- ]to[- ]server\b|\byour own (ad )?account\b|\bapp-level token\b|\bapp-only\b/i;

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
// lib/schema.ts's GuideSchema exactly — kept hand-written since the Gemini
// schema dialect only supports a subset of JSON Schema (no minLength, etc).
// This is the contract with the rest of the app: the UI and the compare
// script both read against lib/schema.ts, so this must never drift from it.
const GUIDE_JSON_SCHEMA = {
  type: "object",
  properties: {
    slug: { type: "string" },
    appName: { type: "string" },
    website: { type: "string" },
    developerPortalUrl: { type: "string" },
    summary: { type: "string" },
    warning: { type: "string" },
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

// Baseline capabilities every OAuth integration needs regardless of
// provider — enforced in code (see ensureAgentCanDo below), not just
// prompted, because an empty agentCanDo array was observed in practice
// when the extracted pages only covered app registration, not the
// authorization-flow implementation.
const BASELINE_AGENT_CAN_DO = [
  "Build the authorization URL",
  "Implement the callback handler",
  "Exchange the authorization code for an access token",
  "Refresh the access token when it expires",
];

const DRAFT_SYSTEM = `You convert extracted OAuth developer-docs pages into a single structured guide for a developer who wants to set up an OAuth app with this provider (e.g. Google, Slack, GitHub) so an AI agent's users can connect it.

MOST IMPORTANT CHECKS, do these first, before writing anything else:

1. Target the API a developer would use to let their END USERS connect their own accounts — the authorization_code flow with a consent step. A provider can have multiple products that technically say "OAuth": e.g. an Ads API that uses client_credentials for server-to-server access to the developer's OWN account (no end user involved at all) vs. a "Sign in with X" product that's the real end-user flow. If any source describes the client_credentials grant, server-to-server access, or "your own account/ad account" access with no end-user consent step, that is NOT what this guide is for. If the provider has several OAuth-enabled products, say in the summary which one this guide covers and why, and name the others so the reader knows they exist.
2. Check the grant type every source actually describes. If EVERY source only documents client_credentials (server-to-server, no end-user consent, no redirect, no consent screen) and NONE describe authorization_code / a user sign-in step, set the "warning" field to one clear sentence stating this is NOT an end-user OAuth flow — still fill out the rest of the guide as best you can from what's available, but add to openQuestions that the real end-user-facing product (if one exists) should be researched separately by name. Leave "warning" unset entirely if the sources do describe a normal end-user authorization_code flow.
3. Scan the titles and content of every source for comparison language — "differences between X and Y", "X vs Y", "X or Y", multiple named app/client types. If ANY source describes more than one distinct app type or setup path (e.g. GitHub OAuth App vs. GitHub App, Google Internal vs. External), you MUST populate the "decision" field describing that choice. This is the single highest-value thing a guide can get right and the most commonly missed — do not skip it just because the rest of your answer is based on a different source.

Research thoroughly for:
- How to create the OAuth app / register a client, and whether the provider offers more than one app type. If so, use the "decision" field for it (see the check above).
- Whether any setting is permanent or irreversible once chosen at creation time (e.g. app type or visibility can't be changed later). Call this out explicitly as a blocker if the docs mention one.
- Redirect URI rules and scopes.
- Whether the provider classifies scopes into tiers (e.g. basic / sensitive / restricted, or an equivalent naming). For each tier beyond the most basic one, state what it requires — additional verification, a security assessment, cost, turnaround time, whether it must be renewed periodically — as its own claim. Do not fold this into a generic "review is needed" statement.
- App/OAuth consent-screen verification and marketplace/app-directory listing review. These are commonly SEPARATE processes with separate requirements and separate timelines for the same provider — never merge them into one claim or one time.approvalWait value. State each one that applies as its own claim.
- Rate limits, and any partner-program or paid-tier gate.
- Any setting specifically relevant to AI agents or autonomous/bot clients (e.g. a checkbox or client type like Google's "Use this client for an AI-powered agent"). If the docs mention one, call it out explicitly as its own step or blocker, even if its effect is unclear from the docs.

Structure the steps in two phases, and make the phase obvious from the step title alone:
1. "Start building now" — whatever gets a developer to a working dev/testing setup with no review: creating the app, configuring scopes/redirect URIs, test-user limits. Prefix these step titles, e.g. "Start building: ...".
2. "Go live for real users" — whatever is needed only for public/production use: verification, security review, marketplace submission. Prefix these step titles, e.g. "Go live: ...".
If the provider has no such distinction (review is required even to start testing), don't force a fake split — say so plainly in difficultyReason instead.

Source and evidence rules:
- Every claim needs a source URL from the "Available sources" list you're given — never invent, guess, or cite a URL that isn't in that list. If nothing in the provided sources supports a claim you'd otherwise want to make, do not state it — put it in openQuestions instead. You never have evidence "tested" — only "docs" or "uncertain".
- Prefer the provider's own domain over third-party sites. If you cite a third-party source because no official docs page covers that point, say so explicitly in the claim text, e.g. "(from a third-party source, not official docs)".
- Official docs describe UI navigation (menu paths, button names, page layout) that can go stale between when the doc was written and now. When a step depends on a specific UI path, phrase it so it's clear this is documentation-sourced and the exact path may have moved — don't state it as independently verified current.
- If you're given a second round of extracted pages specifically targeting review/verification/marketplace/partner-program info (because the first pass didn't find any), use it. If even that turns up nothing, say so explicitly in openQuestions rather than assuming no review is needed.

Other rules:
- Keep hands-on setup time (time.setup) and approval/review wait time (time.approvalWait) separate — never merge them.
- Tag every step "agent" (an AI coding agent could do this) or "human" (requires login, payment, legal action, or submitting for review).
- "agentCanDo" must never be empty — always include at minimum: building the authorization URL, implementing the callback handler, exchanging the code for a token, and refreshing the token. Add more if the docs support it.
- Only include "decision" if the sources describe more than one distinct setup path (multiple app types, or an audience/environment choice like internal vs. external) — omit it entirely otherwise.
- "difficulty" is one of easy/medium/hard/gated. Weigh the "go live" phase's requirements, not just "start building" — a provider can look easy until production access turns out to need verification, a paid security assessment, or a partner program.
- "generatedBy" must be exactly "agent". "lastVerified" must be today's date in ISO format (YYYY-MM-DD).
- "slug" must be lowercase-kebab-case derived from the app name.`;

export type ProgressService = "tavily" | "gemini";
export type ProgressFn = (message: string, service?: ProgressService) => void;

export function slugify(input: string): string {
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

function ensureAgentCanDo(guide: Guide): Guide {
  if (guide.agentCanDo.length > 0) return guide;
  return { ...guide, agentCanDo: BASELINE_AGENT_CAN_DO };
}

type ResearchResult = { notes: string; sourceUrls: string[] };

async function research(
  appInput: string,
  onProgress: ProgressFn,
  tavilyCounter: { count: number }
): Promise<ResearchResult> {
  // "sign in" + "user login" + "authorization code" bias the search toward
  // the end-user-facing product rather than whichever API page happens to
  // say "OAuth" most prominently (e.g. an ads/server-to-server API).
  const queries = [
    `${appInput} sign in OAuth user login authorization code developer documentation`,
    `${appInput} app review verification`,
  ].slice(0, SEARCH_QUERIES);

  onProgress(`Searching for "${appInput}" OAuth setup docs…`, "tavily");
  onProgress(`Searching for "${appInput}" review and verification policy…`, "tavily");

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

  const selected = candidates.slice(0, INITIAL_EXTRACT_CAP);
  if (selected.length === 0) {
    return { notes: "No search results found.", sourceUrls: [] };
  }

  for (const r of selected) {
    onProgress(`Found: ${r.title} (${r.url})`, "tavily");
  }

  onProgress(`Reading ${selected.length} page(s)…`, "tavily");
  tavilyCounter.count += selected.length;
  const extracted = await tavilyExtract(selected.map((r) => r.url));

  // Second pass(es): if nothing extracted so far mentions a topic the
  // provider might have (review/verification, or scope tiers like
  // sensitive/restricted), search for it specifically rather than silently
  // drafting a guide that assumes it doesn't apply — this was the single
  // biggest gap against the hand-tested Google guide (missed the CASA
  // security assessment entirely because the first two queries never
  // surfaced a page that mentioned it).
  for (const check of FALLBACK_CHECKS) {
    // Test against what the model will actually see (truncated per page),
    // not the full raw_content — a keyword present only past the
    // per-page cutoff is, for the model's purposes, not present at all.
    const combinedSoFar = extracted
      .map((r) => r.raw_content.slice(0, PAGE_CHAR_LIMIT))
      .join("\n");
    if (check.keywords.test(combinedSoFar)) continue;

    onProgress(`No ${check.label} info found yet — searching specifically for it…`, "tavily");
    tavilyCounter.count += 1;
    const fallbackResults = await tavilySearch(`${appInput} ${check.query}`, 5);
    const fallbackCandidates = fallbackResults
      .filter((r) => !seen.has(r.url))
      .sort((a, b) => scoreResult(b, appSlug) - scoreResult(a, appSlug))
      .slice(0, FALLBACK_EXTRACT_CAP);

    if (fallbackCandidates.length > 0) {
      fallbackCandidates.forEach((r) => seen.add(r.url));
      for (const r of fallbackCandidates) {
        onProgress(`Found: ${r.title} (${r.url})`, "tavily");
      }
      tavilyCounter.count += fallbackCandidates.length;
      const moreExtracted = await tavilyExtract(fallbackCandidates.map((r) => r.url));
      extracted.push(...moreExtracted);
    }
  }

  // Resolve step: if everything extracted so far reads like client_credentials
  // / server-to-server docs (e.g. an Ads API) with no sign of an end-user
  // consent flow, this is very likely the wrong product for an agent builder
  // whose users need to connect their own accounts. Search specifically for
  // the "sign in with X" / user-authentication product before giving up —
  // better to spend one more search than draft a guide for the wrong API.
  const finalText = extracted.map((r) => r.raw_content.slice(0, PAGE_CHAR_LIMIT)).join("\n");
  if (
    CLIENT_CREDENTIALS_KEYWORDS.test(finalText) &&
    !USER_DELEGATED_KEYWORDS.test(finalText)
  ) {
    onProgress(
      `Found docs look like server-to-server access, not end-user sign-in — searching for the user-facing OAuth product…`,
      "tavily"
    );
    tavilyCounter.count += 1;
    const signInResults = await tavilySearch(
      `"Sign in with ${appInput}" OR ${appInput} OAuth user authentication consent`,
      5
    );
    const signInCandidates = signInResults
      .filter((r) => !seen.has(r.url))
      .sort((a, b) => scoreResult(b, appSlug) - scoreResult(a, appSlug))
      .slice(0, FALLBACK_EXTRACT_CAP);

    if (signInCandidates.length > 0) {
      signInCandidates.forEach((r) => seen.add(r.url));
      for (const r of signInCandidates) {
        onProgress(`Found: ${r.title} (${r.url})`, "tavily");
      }
      tavilyCounter.count += signInCandidates.length;
      const moreExtracted = await tavilyExtract(signInCandidates.map((r) => r.url));
      extracted.push(...moreExtracted);
    }
  }

  const notes = extracted
    .map((r) => `Source: ${r.url}\n${r.raw_content.slice(0, PAGE_CHAR_LIMIT)}`)
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
      : "Drafting the guide from extracted pages…",
    "gemini"
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
        if (result.success) return ensureAgentCanDo(result.data);
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
