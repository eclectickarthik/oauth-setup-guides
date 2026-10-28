// CLI: npm run compare -- <app>
//
// Loads the hand-checked guide (answer key, data/guides/<slug>.json) and
// the agent-generated one (generated/<slug>.json, from `npm run generate`),
// has the LLM label every generated claim against the answer key, and
// writes a human-reviewable report to docs/comparisons/<slug>.md, which
// the /compare page renders.

import "./load-env";
import { promises as fs } from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { Guide, GuideSchema } from "../lib/schema";
import { MODEL, slugify } from "../lib/agent";

const COMPARISONS_DIR = path.join(process.cwd(), "docs", "comparisons");

type Label = "correct" | "wrong" | "outdated" | "unsupported";

type ComparisonResult = {
  summary: string;
  claims: { section: string; claimText: string; label: Label; reason: string }[];
  missedFromHandChecked: { section: string; text: string }[];
};

const COMPARISON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: { type: "string" },
          claimText: { type: "string" },
          label: { type: "string", enum: ["correct", "wrong", "outdated", "unsupported"] },
          reason: { type: "string" },
        },
        required: ["section", "claimText", "label", "reason"],
      },
    },
    missedFromHandChecked: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: { type: "string" },
          text: { type: "string" },
        },
        required: ["section", "text"],
      },
    },
  },
  required: ["summary", "claims", "missedFromHandChecked"],
};

const COMPARE_SYSTEM = `You are reviewing an AI agent's auto-generated OAuth setup guide against a hand-checked "answer key" guide for the same provider, written by a human who actually tested or carefully researched the setup process.

Go through every claim-bearing part of the GENERATED guide — summary, oauthFit, decision (if present), setupTime, approval.paths[], cost, rateLimits, prerequisites[], scopes (minimum/optional/modes), steps[] (title + description), blockers[] (problem + fix), agentCanDo[], humanMustDo[], composioHandoff, openQuestions[] — and for each distinct claim, compare it against the ANSWER KEY guide and assign exactly one label:

- "correct": the claim matches what the answer key says (doesn't need to be word-for-word, just factually aligned).
- "wrong": the claim contradicts what the answer key says.
- "outdated": the claim was plausible (e.g. a UI navigation path, a since-changed policy) but the answer key shows it's no longer accurate.
- "unsupported": the answer key doesn't address this point one way or the other, so it can't be verified as correct or wrong from the answer key alone — this is not proof the claim is false, just unverifiable against this source.

Then list everything meaningful in the ANSWER KEY that has no real counterpart anywhere in the generated guide — facts, requirements, steps, blockers, or nuances the agent's guide missed entirely. Skip trivial wording differences; only list substantive gaps.

Be specific and terse in "reason" — name the actual discrepancy, don't just restate the label. Output only the JSON described by the schema, nothing else.`;

async function loadGuide(filePath: string, label: string): Promise<Guide> {
  const raw = await fs.readFile(filePath, "utf-8").catch(() => null);
  if (raw === null) {
    throw new Error(`${label} not found at ${filePath}`);
  }
  return GuideSchema.parse(JSON.parse(raw));
}

function renderMarkdown(appInput: string, result: ComparisonResult): string {
  const lines: string[] = [];
  lines.push(`# Comparison: ${appInput}`);
  lines.push("");
  lines.push(result.summary);
  lines.push("");

  const byLabel = (label: Label) => result.claims.filter((c) => c.label === label);
  const sections: { label: Label; title: string }[] = [
    { label: "wrong", title: "Wrong" },
    { label: "outdated", title: "Outdated" },
    { label: "unsupported", title: "Unsupported (not covered by the answer key)" },
    { label: "correct", title: "Correct" },
  ];

  for (const { label, title } of sections) {
    const claims = byLabel(label);
    lines.push(`## ${title} (${claims.length})`);
    lines.push("");
    if (claims.length === 0) {
      lines.push("_None._");
    } else {
      for (const c of claims) {
        lines.push(`- **[${c.section}]** ${c.claimText}`);
        lines.push(`  - ${c.reason}`);
      }
    }
    lines.push("");
  }

  lines.push(`## Missed from the hand-checked guide (${result.missedFromHandChecked.length})`);
  lines.push("");
  if (result.missedFromHandChecked.length === 0) {
    lines.push("_None — the agent's guide covered everything the answer key did._");
  } else {
    for (const m of result.missedFromHandChecked) {
      lines.push(`- **[${m.section}]** ${m.text}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const appInput = process.argv.slice(2).join(" ").trim();
  if (!appInput) {
    console.error("Usage: npm run compare -- <app name>");
    process.exit(1);
  }

  const slug = slugify(appInput);
  const handCheckedPath = path.join(process.cwd(), "data", "guides", `${slug}.json`);
  const generatedPath = path.join(process.cwd(), "generated", `${slug}.json`);

  const handChecked = await loadGuide(
    handCheckedPath,
    `Hand-checked guide (answer key) for "${slug}"`
  ).catch((err) => {
    console.error(err.message);
    console.error(`There's no answer key at data/guides/${slug}.json to compare against.`);
    process.exit(1);
  });

  const generated = await loadGuide(generatedPath, `Generated guide for "${slug}"`).catch(
    (err) => {
      console.error(err.message);
      console.error(`Run "npm run generate -- ${appInput}" first.`);
      process.exit(1);
    }
  );

  console.log(`Comparing generated/${slug}.json against data/guides/${slug}.json...`);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const interaction = await ai.interactions.create({
    model: MODEL,
    input: `ANSWER KEY (hand-checked guide):\n${JSON.stringify(handChecked, null, 2)}\n\nGENERATED guide (to review):\n${JSON.stringify(generated, null, 2)}`,
    system_instruction: COMPARE_SYSTEM,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: COMPARISON_SCHEMA,
    },
  });

  const raw = interaction.output_text ?? "";
  let result: ComparisonResult;
  try {
    result = JSON.parse(raw);
  } catch {
    console.error("LLM did not return valid JSON:\n", raw);
    process.exit(1);
  }

  const markdown = renderMarkdown(appInput, result);
  await fs.mkdir(COMPARISONS_DIR, { recursive: true });
  const outputPath = path.join(COMPARISONS_DIR, `${slug}.md`);
  await fs.writeFile(outputPath, markdown, "utf-8");

  const wrong = result.claims.filter((c) => c.label === "wrong").length;
  const outdated = result.claims.filter((c) => c.label === "outdated").length;
  const missed = result.missedFromHandChecked.length;
  console.log(
    `Saved to ${path.relative(process.cwd(), outputPath)} — ${wrong} wrong, ${outdated} outdated, ${missed} missed.`
  );
}

main().catch((err) => {
  console.error("\nComparison failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
