import { GoogleGenAI } from "@google/genai";
import { Guide, GuideSchema } from "./schema";

const MODEL = process.env.LLM_MODEL || "gemini-flash-lite-latest";

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

const RESEARCH_SYSTEM = `You research how a developer sets up an OAuth app with a provider (e.g. Google, Slack, GitHub) so an AI agent's users can connect that provider.

Use Google Search to find the provider's OFFICIAL developer documentation — prefer it over blogs, forums, or third-party articles. Look specifically for:
- How to create the OAuth app / register a client
- Redirect URI rules
- Scopes
- App review, verification, or marketplace-listing requirements
- Rate limits
- Any partner-program or paid-tier gate
- Whether the provider offers more than one app type or setup path (e.g. a quick-but-broad option vs. a scoped-but-slower option)

Write a thorough research summary of everything you found, citing the specific source URL for each claim. Keep hands-on setup time and approval/review wait time as separate facts — don't merge them. Explicitly flag anything you could not confirm from official docs instead of guessing.`;

const DRAFT_SYSTEM = `You convert OAuth setup research notes into a single structured guide for a developer. Rules:
- Every claim needs a source URL, unless you are directly stating something from the research notes that has none — then mark it "uncertain" and add it to openQuestions instead of guessing. You never have evidence "tested" — only "docs" or "uncertain".
- Keep hands-on setup time (time.setup) and approval/review wait time (time.approvalWait) separate — never merge them.
- Tag every step "agent" (an AI coding agent could do this) or "human" (requires login, payment, legal action, or submitting for review).
- Only include "decision" if the research notes describe more than one distinct setup path — omit it entirely otherwise.
- "difficulty" is one of easy/medium/hard/gated, reasoned from how much review/verification/paid-tier gating is involved.
- "generatedBy" must be exactly "agent". "lastVerified" must be today's date in ISO format (YYYY-MM-DD).
- "slug" must be lowercase-kebab-case derived from the app name.`;

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

async function research(
  ai: GoogleGenAI,
  appInput: string,
  onProgress: ProgressFn
): Promise<string> {
  onProgress(`Searching the web for "${appInput}" developer docs…`);

  const interaction = await ai.interactions.create({
    model: MODEL,
    input: `Research how to set up an OAuth app for: "${appInput}". This could be an app name or a website URL — find its official developer/API documentation.`,
    system_instruction: RESEARCH_SYSTEM,
    tools: [{ type: "google_search" }],
  });

  const seen = new Set<string>();
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type !== "text") continue;
      for (const annotation of block.annotations ?? []) {
        if (annotation.type !== "url_citation" || !annotation.url) continue;
        const label = annotation.title
          ? `${annotation.title} (${annotation.url})`
          : annotation.url;
        if (!seen.has(label)) {
          seen.add(label);
          onProgress(`Found: ${label}`);
        }
      }
    }
  }

  return interaction.output_text ?? "";
}

async function draft(
  ai: GoogleGenAI,
  appInput: string,
  researchNotes: string,
  onProgress: ProgressFn,
  retryNote?: string
): Promise<string> {
  onProgress(
    retryNote
      ? "Output didn't match the required format — asking the model to fix it…"
      : "Drafting the guide from research notes…"
  );

  const input = retryNote
    ? `App: "${appInput}"\n\nResearch notes:\n${researchNotes}\n\n${retryNote}`
    : `App: "${appInput}"\n\nResearch notes:\n${researchNotes}\n\nProduce the guide now.`;

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

  const researchNotes = await research(ai, appInput, onProgress);

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

  const first = await draft(ai, appInput, researchNotes, onProgress);
  const firstGuide = tryParse(first);
  if (firstGuide) return firstGuide;

  const second = await draft(
    ai,
    appInput,
    researchNotes,
    onProgress,
    `Your previous output did not match the required schema. Error: ${lastError}\n\nProduce the corrected guide now.`
  );
  const secondGuide = tryParse(second);
  if (secondGuide) return secondGuide;

  throw new Error(`Agent failed to produce a valid guide: ${lastError}`);
}
