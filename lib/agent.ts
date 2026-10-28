import Anthropic from "@anthropic-ai/sdk";
import { Guide, GuideSchema } from "./schema";

const MODEL = process.env.LLM_MODEL || "claude-opus-4-8";

// Keeps generation to roughly 1-2 minutes: each tool gets half of the ~12-call budget.
const SEARCH_BUDGET = 6;
const FETCH_BUDGET = 6;

const GUIDE_SHAPE = `{
  slug: string;                        // lowercase-kebab-case
  appName: string;
  website: string;                     // URL
  developerPortalUrl: string;          // URL
  summary: string;                      // 2-3 plain-language sentences
  decision?: {                         // only if the provider offers more than one setup path
    question: string;
    options: { name: string; pickWhen: string[]; tradeoff: string }[];
    recommendation: string;
  };
  difficulty: "easy" | "medium" | "hard" | "gated";
  difficultyReason: string;
  time: { setup: string; approvalWait: string; notes?: string };
  whenReviewIsNeeded: Claim[];
  requirements: Claim[];
  steps: Step[];                        // at least one
  blockers: { problem: string; fix: string; evidence: Evidence; sources: string[] }[];
  agentCanDo: string[];
  humanMustDo: string[];
  openQuestions: string[];
  generatedBy: "agent";
  lastVerified: string;                 // ISO date, today
}
// Evidence = "tested" | "docs" | "uncertain"
// Claim = { text: string; evidence: Evidence; sources: string[] }   // sources required unless evidence is "tested"
// Step = { title: string; detail: string; actor: "agent" | "human"; evidence: Evidence; sources: string[] }`;

const SYSTEM_PROMPT = `You research how a developer sets up an OAuth app with a provider (e.g. Google, Slack, GitHub) so an AI agent's users can connect that provider, and you produce a single structured guide as JSON.

Rules:
- Start from the provider's official developer docs. Prefer official docs over blogs, forums, or third-party articles.
- Look specifically for: how to create the OAuth app, redirect URI rules, scopes, app review / verification / marketplace listing, rate limits, and any partner-program or paid-tier gate.
- Every claim needs a source URL, unless you are stating something you directly verified yourself (you are not — you only have docs, so only use evidence "docs" or "uncertain", never "tested").
- If something can't be found in the docs, mark it "uncertain" and add it to openQuestions instead of guessing. Never guess times or requirements.
- Keep hands-on setup time and approval/review wait time separate — never merge them.
- Tag every step "agent" (an AI coding agent could do this) or "human" (requires login, payment, legal action, or submitting for review).
- If the provider offers more than one app type or setup path (e.g. a quick-but-broad option vs. a scoped-but-slower option), fill the "decision" field so the developer picks the right path before step 1. Omit it if there is only one path.
- You have a limited budget of web searches and fetches. Use them efficiently: search for the official developer docs first, then fetch the specific pages you need (app registration, review policy, scopes/rate limits).
- When you are done researching, respond with ONLY a single JSON object matching this shape, and nothing else — no markdown fences, no prose before or after it:

${GUIDE_SHAPE}`;

export type ProgressFn = (message: string) => void;

function buildUserPrompt(appInput: string): string {
  return `Research how to set up an OAuth app for: "${appInput}". This could be an app name or a website URL. Find its official developer/API documentation and produce the guide JSON described in your instructions.`;
}

async function runAgentOnce(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  onProgress: ProgressFn
): Promise<{ text: string; finalMessage: Anthropic.Message }> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [
      { type: "web_search_20260209", name: "web_search", max_uses: SEARCH_BUDGET },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: FETCH_BUDGET },
    ],
    messages,
  });

  const pendingToolInput = new Map<number, { name: string; json: string }>();

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block.type === "server_tool_use") {
        pendingToolInput.set(event.index, { name: block.name, json: "" });
      }
    } else if (event.type === "content_block_delta") {
      if (event.delta.type === "input_json_delta") {
        const entry = pendingToolInput.get(event.index);
        if (entry) entry.json += event.delta.partial_json;
      }
    } else if (event.type === "content_block_stop") {
      const entry = pendingToolInput.get(event.index);
      if (entry) {
        try {
          const input = JSON.parse(entry.json || "{}");
          if (entry.name === "web_search" && input.query) {
            onProgress(`Searching for "${input.query}"…`);
          } else if (entry.name === "web_fetch" && input.url) {
            onProgress(`Reading ${input.url}…`);
          }
        } catch {
          // partial/invalid JSON — skip the progress message
        }
        pendingToolInput.delete(event.index);
      }
    }
  }

  const finalMessage = await stream.finalMessage();
  const textBlock = finalMessage.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  return { text: textBlock?.text ?? "", finalMessage };
}

async function runToCompletion(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  onProgress: ProgressFn
): Promise<string> {
  while (true) {
    const { text, finalMessage } = await runAgentOnce(client, messages, onProgress);
    if (finalMessage.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: finalMessage.content });
      continue;
    }
    return text;
  }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

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

export async function generateGuide(
  appInput: string,
  onProgress: ProgressFn
): Promise<Guide> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserPrompt(appInput) },
  ];

  onProgress(`Researching developer docs for "${appInput}"…`);
  let text = await runToCompletion(client, messages, onProgress);

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

  const first = tryParse(text);
  if (first) return first;

  onProgress("Output didn't match the required format — asking the agent to fix it…");
  messages.push({ role: "assistant", content: text });
  messages.push({
    role: "user",
    content: `Your output did not match the required schema. Error: ${lastError}\n\nRespond with ONLY the corrected JSON object — no markdown fences, no prose.`,
  });
  text = await runToCompletion(client, messages, onProgress);

  const second = tryParse(text);
  if (second) return second;

  throw new Error(`Agent failed to produce a valid guide: ${lastError}`);
}
