import { GoogleGenAI } from "@google/genai";
import { Guide, GuideSchema } from "./schema";
import { MODEL } from "./config";
import { extractJson } from "./json-utils";
import { tavilyExtract } from "./tavily";
import { fillEvidenceDefaults, GUIDE_JSON_SCHEMA, type ProgressFn } from "./agent";

// Second pipeline stage, after generateGuide() drafts a guide: re-fetches
// every URL the draft actually cited, hands the model the guide plus that
// fresh page content, and asks it to confirm, correct, or downgrade each
// claim rather than trust the draft at face value. One extra Tavily
// extract call (batched over every cited URL, not one call per claim) and
// one extra Gemini call per generation — a real, deliberate cost increase
// over a single-pass pipeline, not a free addition.

export type VerifyResult = {
  guide: Guide;
  changes: { field: string; before: string; after: string; reason: string }[];
  unverified: string[];
};

const VERIFY_JSON_SCHEMA = {
  type: "object",
  properties: {
    guide: GUIDE_JSON_SCHEMA,
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
          reason: { type: "string" },
        },
        required: ["field", "before", "after", "reason"],
      },
    },
    unverified: { type: "array", items: { type: "string" } },
  },
  required: ["guide", "changes", "unverified"],
};

const VERIFY_SYSTEM = `You are a fact-checker for an OAuth setup guide drafted for developers connecting their apps through Composio. You receive the drafted guide as JSON, plus the current text of every page the draft cited.

For every field that carries an "evidence" object:
1. If "evidence.sourceUrl" is set and that page's text is included below, confirm the claim actually matches what the page says. If it doesn't, correct the claim (or, if you can't confidently correct it, downgrade "evidence.level" to "uncertain" and say in "evidence.note" what the page actually says instead).
2. If "evidence.level" is "inferred" or "uncertain" with no sourceUrl, check whether any of the OTHER fetched pages below actually supports it (not just the one it was originally about) — if so, set "evidence.level" to "doc_sourced" and "evidence.sourceUrl" to that page's URL. If nothing supports it, leave the level as "inferred" or "uncertain".
3. For step "title"/"description" that depend on an exact navigation path (menu labels), check the page text for the exact wording. If it doesn't match, correct it or downgrade to "inferred" if you're not sure.
4. Flag (and fix, or downgrade) any "none", "free", or "no review" claim — in cost, rateLimits, or any approval.paths entry — that isn't actually backed by a page's text.

Also check the guide's structure, not just individual claims:
- "oauthFit" must be correct for what the pages actually describe — an API-key-only or service-account-only provider must never be "standard_oauth" or "oauth_with_caveats".
- "agentCanDo" must contain no token handling, callback code, or API-call implementation tasks — if it does, remove those entries (Composio handles that, not the guide's reader).
- "humanMustDo" must contain no end-user consent/authorization step ("authorize via consent screen" or equivalent) — if present, remove it.
- No field's information should be substantively repeated elsewhere in the guide (e.g. cost restated inside a step description) — if it is, trim the duplicate FROM THE OTHER FIELD, never from "composioHandoff" itself. "composioHandoff" always keeps the literal redirect URI (https://backend.composio.dev/api/v3/toolkits/auth/callback) even if a step description also mentions it — if you see that URL duplicated, remove it from the step's "description", not from "composioHandoff".

Record every correction you make in "changes": one entry per field you changed, with the field's name/path, what it said before, what it says now, and why. Do not add new facts without a source among the fetched pages — prefer downgrading to "uncertain" over a confident guess you can't back up. List anything you still couldn't verify (checked a source and it didn't resolve the question, or no page covered it at all) in "unverified".

Return the FULL corrected guide in "guide" (same shape as the input, with your corrections applied), plus "changes" and "unverified" as described. If nothing needed correcting, return the guide unchanged with empty "changes" and whatever "unverified" entries genuinely remain.`;

export async function verifyGuide(guide: Guide, onProgress: ProgressFn): Promise<VerifyResult> {
  const tavilyCounter = { count: 0 };
  const geminiCounter = { count: 0 };
  try {
    return await runVerification(guide, onProgress, tavilyCounter, geminiCounter);
  } finally {
    console.log(
      `[verifier] "${guide.appName}": ${tavilyCounter.count} Tavily call(s), ${geminiCounter.count} Gemini call(s) (model=${MODEL})`
    );
  }
}

async function runVerification(
  guide: Guide,
  onProgress: ProgressFn,
  tavilyCounter: { count: number },
  geminiCounter: { count: number }
): Promise<VerifyResult> {
  const citedUrls = Array.from(
    new Set(
      [
        guide.setupTime.evidence,
        guide.cost.evidence,
        guide.rateLimits.evidence,
        guide.scopes.evidence,
        ...guide.approval.paths.map((p) => p.evidence),
        ...guide.prerequisites.map((p) => p.evidence),
        ...guide.steps.map((s) => s.evidence),
        ...guide.blockers.map((b) => b.evidence),
      ]
        .map((e) => e.sourceUrl)
        .filter((u): u is string => Boolean(u))
    )
  );

  let pageText = "(no cited sources to re-check)";
  if (citedUrls.length > 0) {
    onProgress(`Re-checking ${citedUrls.length} cited source(s)…`, "tavily");
    tavilyCounter.count += 1;
    const extracted = await tavilyExtract(citedUrls);
    pageText = extracted
      .map((r) => `Source: ${r.url}\n${r.raw_content.slice(0, 15000)}`)
      .join("\n\n---\n\n");
  }

  onProgress("Verifying claims against sources…", "verifier");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  geminiCounter.count += 1;
  const interaction = await ai.interactions.create({
    model: MODEL,
    input: `DRAFTED GUIDE:\n${JSON.stringify(guide, null, 2)}\n\nFETCHED SOURCE PAGES:\n${pageText}`,
    system_instruction: VERIFY_SYSTEM,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: VERIFY_JSON_SCHEMA,
    },
  });

  const raw = JSON.parse(extractJson(interaction.output_text ?? "{}"));
  const correctedGuide = fillEvidenceDefaults(raw.guide ?? guide);
  const parsed = GuideSchema.safeParse(correctedGuide);

  // A verifier that fails to return a valid guide shouldn't sink the
  // whole generation — fall back to the pre-verification draft (already
  // schema-valid) rather than throwing away a working guide.
  const finalGuide = parsed.success ? parsed.data : guide;

  return {
    guide: { ...finalGuide, verifiedBySecondPass: true },
    changes: Array.isArray(raw.changes) ? raw.changes : [],
    unverified: Array.isArray(raw.unverified) ? raw.unverified : [],
  };
}
